import * as fs from 'node:fs'
import * as path from 'node:path'

const outputDir = path.resolve('outputs', 'durable-operation-worker-http-verify', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_DURABLE_OPERATION_STORE = 'local'
process.env.BETTERPPTX_OPERATION_STORE_FILE = path.join(outputDir, 'operation-store.json')
process.env.BETTERPPTX_OPERATION_DISPATCHER = 'inline'
process.env.BETTERPPTX_OPERATION_EXECUTION_MODE = 'queued'
process.env.BETTERPPTX_OPERATION_WORKER_TOKEN = 'verify-worker-token'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_AUTH = 'none'

const { callBetterPptxTool } = await import('./engine.mjs')
const { startBetterPptxHttp } = await import('./server-http.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

const pending = await callBetterPptxTool('betterpptx.deck.new', {
	title: 'HTTP worker verifier',
	idempotencyKey: 'worker-http-deck-new-1',
}, {
	sessionId: 'worker-http-gateway-session',
	installHash: 'install_worker_http_verify',
})
expect(pending.ok === false && pending.error?.code === 'OPERATION_PENDING', 'Queued gateway operation should return pending.', { pending })
const operationId = pending.error.details?.operationId

const started = await startBetterPptxHttp({ host: '127.0.0.1', port: 0, auth: 'none' })
const actualPort = started.httpServer.address().port
const url = `http://127.0.0.1:${actualPort}/internal/operations/${encodeURIComponent(operationId)}/run`

try {
	let response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ operationId }),
	})
	expect(response.status === 401, 'Worker route should reject missing token.', { status: response.status, body: await response.text() })

	response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-BetterPPTX-Worker-Token': 'verify-worker-token',
		},
		body: JSON.stringify({ operationId }),
	})
	const body = await response.json()
	expect(response.status === 200 && body.ok === true && body.operation?.state === 'succeeded' && body.operation?.result?.deckId, 'Worker route should execute the queued operation with the correct token.', { status: response.status, body })

	console.log(`DURABLE OPERATION WORKER HTTP: PASS operationId=${operationId} deckId=${body.operation.result.deckId} tokenGuard=1 routeExec=1`)
} finally {
	await new Promise(resolve => started.httpServer.close(resolve))
}
