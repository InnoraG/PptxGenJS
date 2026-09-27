import * as fs from 'node:fs'
import * as path from 'node:path'

const outputDir = path.resolve('outputs', 'durable-operation-duplicate-delivery-verify', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_DURABLE_OPERATION_STORE = 'local'
process.env.BETTERPPTX_OPERATION_STORE_FILE = path.join(outputDir, 'operation-store.json')
process.env.BETTERPPTX_OPERATION_DISPATCHER = 'inline'
process.env.BETTERPPTX_OPERATION_EXECUTION_MODE = 'queued'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'

const {
	callBetterPptxTool,
	runDurableOperationById,
} = await import('./engine.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

const pending = await callBetterPptxTool('betterpptx.deck.new', {
	title: 'Duplicate delivery verifier',
	idempotencyKey: 'duplicate-delivery-deck-new-1',
}, {
	sessionId: 'duplicate-delivery-gateway',
	installHash: 'install_duplicate_delivery_verify',
})
expect(pending.ok === false && pending.error?.code === 'OPERATION_PENDING', 'Queued operation should return pending before worker delivery.', { pending })
const operationId = pending.error.details?.operationId

const deliveries = await Promise.all(Array.from({ length: 8 }, (_, index) => runDurableOperationById(operationId, {
	leaseOwner: `duplicate-worker-${index}`,
})))
const succeeded = deliveries.filter(item => item.state === 'succeeded' && item.result?.deckId)
expect(succeeded.length >= 1, 'At least one duplicate delivery should complete the operation.', { deliveries })
const deckIds = new Set(succeeded.map(item => item.result.deckId))
expect(deckIds.size === 1, 'Duplicate deliveries should converge to one deck result.', { deliveries })

const replay = await callBetterPptxTool('betterpptx.deck.new', {
	title: 'Duplicate delivery verifier',
	idempotencyKey: 'duplicate-delivery-deck-new-1',
}, {
	sessionId: 'duplicate-delivery-replay',
	installHash: 'install_duplicate_delivery_verify',
})
expect(replay.ok === true && replay.data?.deckId === succeeded[0].result.deckId, 'Gateway replay should return the duplicate-delivery winner result.', { replay, succeeded })

const persistedJson = JSON.parse(fs.readFileSync(process.env.BETTERPPTX_OPERATION_STORE_FILE, 'utf8'))
const operations = Object.values(persistedJson.operations || {})
expect(operations.length === 1 && operations[0].state === 'succeeded' && operations[0].attempt >= 1, 'Duplicate delivery should leave one terminal operation record.', { operations })

console.log(`DURABLE OPERATION DUPLICATE DELIVERY: PASS operationId=${operationId} deckId=${succeeded[0].result.deckId} deliveries=${deliveries.length} converged=1`)
