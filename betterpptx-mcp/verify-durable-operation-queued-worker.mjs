import * as fs from 'node:fs'
import * as path from 'node:path'

const outputDir = path.resolve('outputs', 'durable-operation-queued-worker-verify', `run-${Date.now()}-${process.pid}`)
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
	title: 'Queued durable operation verifier',
	idempotencyKey: 'queued-worker-deck-new-1',
}, {
	sessionId: 'queued-gateway-session',
	installHash: 'install_queued_worker_verify',
})
expect(pending.ok === false && pending.error?.code === 'OPERATION_PENDING', 'Queued mode should return a pending durable operation instead of executing in the gateway.', { pending })
const operationId = pending.error.details?.operationId
expect(/^op_[0-9a-f]{32}$/i.test(operationId), 'Pending response should include an opaque operation id.', { pending })

let status = await callBetterPptxTool('betterpptx.operation.status', { operationId }, {
	sessionId: 'queued-status-before',
	installHash: 'install_queued_worker_verify',
})
expect(status.ok === true && status.data?.state === 'queued', 'Queued operation should be visible as queued to the same install.', { status })

const worker = await runDurableOperationById(operationId, { leaseOwner: 'verify-worker' })
expect(worker.state === 'succeeded' && worker.result?.deckId, 'Worker should execute the queued operation and persist the completed result.', { worker })

status = await callBetterPptxTool('betterpptx.operation.status', { operationId }, {
	sessionId: 'queued-status-after',
	installHash: 'install_queued_worker_verify',
})
expect(status.ok === true && status.data?.state === 'succeeded' && status.data?.result?.deckId === worker.result.deckId, 'Status should return the completed worker result.', { status, worker })

const replay = await callBetterPptxTool('betterpptx.deck.new', {
	title: 'Queued durable operation verifier',
	idempotencyKey: 'queued-worker-deck-new-1',
}, {
	sessionId: 'queued-gateway-replay',
	installHash: 'install_queued_worker_verify',
})
expect(replay.ok === true && replay.data?.deckId === worker.result.deckId && replay.data?.durableOperation?.replay === true, 'Gateway should replay the completed queued operation without dispatching new work.', { replay, worker })

const persistedJson = JSON.parse(fs.readFileSync(process.env.BETTERPPTX_OPERATION_STORE_FILE, 'utf8'))
const operations = Object.values(persistedJson.operations || {})
expect(operations.length === 1 && operations[0].state === 'succeeded' && operations[0].request?.args?.title, 'Queued operation should persist bounded request payload until retention cleanup.', { operations })

console.log(`DURABLE OPERATION QUEUED WORKER: PASS operationId=${operationId} deckId=${worker.result.deckId} queued=1 worker=1 replay=1`)
