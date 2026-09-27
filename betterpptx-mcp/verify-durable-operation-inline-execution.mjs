import * as fs from 'node:fs'
import * as path from 'node:path'

const outputDir = path.resolve('outputs', 'durable-operation-inline-verify', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_DURABLE_OPERATION_STORE = 'local'
process.env.BETTERPPTX_OPERATION_STORE_FILE = path.join(outputDir, 'operation-store.json')
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_REQUIRE_DURABLE_OPERATION_IDEMPOTENCY = '0'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'

const { callBetterPptxTool } = await import('./engine.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

const args = {
	title: 'Durable operation inline verifier',
	idempotencyKey: 'durable-inline-deck-new-1',
}

const first = await callBetterPptxTool('betterpptx.deck.new', args, {
	sessionId: 'inline-session-a',
	installHash: 'install_inline_verify',
})
expect(first.ok === true && first.data?.deckId, 'Initial deck.new should succeed.', { first })
expect(first.data?.durableOperation?.operationId, 'Initial success should return a durable operation handle.', { first })

const second = await callBetterPptxTool('betterpptx.deck.new', args, {
	sessionId: 'inline-session-b',
	installHash: 'install_inline_verify',
})
expect(second.ok === true, 'Durable operation replay should succeed across stateless sessions.', { second })
expect(second.data?.deckId === first.data.deckId, 'Durable operation replay should return the original deck id.', { first, second })
expect(second.data?.durableOperation?.replay === true, 'Durable operation replay should be disclosed as an idempotent replay.', { second })

const status = await callBetterPptxTool('betterpptx.operation.status', {
	operationId: first.data.durableOperation.operationId,
}, {
	sessionId: 'inline-session-status',
	installHash: 'install_inline_verify',
})
expect(status.ok === true && status.data?.state === 'succeeded' && status.data?.result?.deckId === first.data.deckId, 'Operation status should expose the completed public-safe result to the same install.', { status })

const wrongInstallStatus = await callBetterPptxTool('betterpptx.operation.status', {
	operationId: first.data.durableOperation.operationId,
}, {
	sessionId: 'inline-session-status-wrong',
	installHash: 'install_other',
})
expect(wrongInstallStatus.ok === false && wrongInstallStatus.error?.code === 'OPERATION_NOT_FOUND', 'Operation status should not leak records across install identities.', { wrongInstallStatus })

const conflict = await callBetterPptxTool('betterpptx.deck.new', {
	title: 'Changed request',
	idempotencyKey: args.idempotencyKey,
}, {
	sessionId: 'inline-session-c',
	installHash: 'install_inline_verify',
})
expect(conflict.ok === false && conflict.error?.code === 'OPERATION_IDEMPOTENCY_CONFLICT', 'Changed args with the same durable idempotency key should conflict.', { conflict })

process.env.BETTERPPTX_REQUIRE_DURABLE_OPERATION_IDEMPOTENCY = '1'
const missingKey = await callBetterPptxTool('betterpptx.deck.new', {
	title: 'Missing idempotency key',
}, {
	sessionId: 'inline-session-d',
	installHash: 'install_inline_verify',
})
expect(missingKey.ok === false && missingKey.error?.code === 'IDEMPOTENCY_KEY_REQUIRED', 'Distributed mode can require idempotency keys for mutating operations.', { missingKey })

const persistedJson = JSON.parse(fs.readFileSync(process.env.BETTERPPTX_OPERATION_STORE_FILE, 'utf8'))
const operations = Object.values(persistedJson.operations || {})
expect(operations.length === 1 && operations[0].state === 'succeeded', 'Exactly one durable operation should be completed for cross-session replay.', { operations })

console.log(`DURABLE OPERATION INLINE EXECUTION: PASS deckId=${first.data.deckId} replay=1 status=1 statusIsolation=1 conflict=1 requireIdempotency=1 completedOperations=${operations.length}`)
