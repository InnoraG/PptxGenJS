import * as fs from 'node:fs'
import * as net from 'node:net'
import * as path from 'node:path'

const outputDir = path.resolve('outputs', 'install-identity-verify', `run-${Date.now()}-${process.pid}`)
const ledgerFile = path.join(outputDir, 'billing-ledger.json')
const usageFile = path.join(outputDir, 'install-usage.json')
const logFile = path.join(outputDir, 'http.ndjson')
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_INSTALL_HMAC_SECRET = 'verify-install-hmac-secret-0123456789abcdef'
process.env.BETTERPPTX_INSTALL_USAGE_STORE = 'local'
process.env.BETTERPPTX_INSTALL_USAGE_FILE = usageFile
process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_BILLING_LEDGER_FILE = ledgerFile
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.BETTERPPTX_ENV = 'test'
process.env.BETTERPPTX_DEPLOYMENT_STAGE = 'test'
process.env.NODE_ENV = 'test'
process.env.BETTERPPTX_FORCE_PLAN = ''
process.env.BETTERPPTX_PREMIUM = '0'
const stateless = process.env.BETTERPPTX_VERIFY_STATELESS === '1'
process.env.BETTERPPTX_HTTP_STATELESS_MCP = stateless ? '1' : '0'
process.env.BETTERPPTX_BILLING_PROVIDER = 'crypto_credits'
process.env.BETTERPPTX_BILLING_DRY_RUN = '0'
process.env.BETTERPPTX_BILLING_ENFORCE = '1'
process.env.BETTERPPTX_AUTH = 'none'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_LOG = 'debug'
process.env.BETTERPPTX_LOG_FILE = logFile
delete process.env.BETTERPPTX_LOG_SECRETS

const {
	createInstallUsageStore,
	generateInstallToken,
	hashInstallToken,
	validateInstallToken,
} = await import('./auth/install-identity.mjs')
const {
	getAuthState,
	hydrateInstallBillingContext,
	recordSuccessfulUse,
} = await import('./auth/entitlements.mjs')
const { createBillingLedgerStore } = await import('./billing/ledger-store.mjs')
const { startBetterPptxHttp } = await import('./server-http.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

async function freePort() {
	const server = net.createServer()
	await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()))
	const port = server.address().port
	await new Promise(resolve => server.close(resolve))
	return port
}

function parseRpcBody(text) {
	const trimmed = String(text || '').trim()
	if (!trimmed) return null
	if (trimmed.startsWith('{')) return JSON.parse(trimmed)
	const events = trimmed.split(/\r?\n\r?\n/)
	for (const event of events) {
		const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('')
		if (!data) continue
		const parsed = JSON.parse(data)
		if (parsed?.jsonrpc) return parsed
	}
	return null
}

async function rpc(base, token, method, params = {}, sessionId = '') {
	const headers = {
		'Content-Type': 'application/json',
		Accept: 'application/json, text/event-stream',
		'x-betterpptx-device': token,
	}
	if (sessionId) headers['mcp-session-id'] = sessionId
	const response = await fetch(`${base}/mcp`, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			jsonrpc: '2.0',
			id: Math.floor(Math.random() * 100000),
			method,
			params,
		}),
	})
	const text = await response.text()
	return {
		status: response.status,
		sessionId: response.headers.get('mcp-session-id') || sessionId,
		text,
		body: parseRpcBody(text),
	}
}

const token = generateInstallToken()
const secondToken = generateInstallToken()
expect(validateInstallToken(token) === token, 'Generated install token should validate.')
const installHash = hashInstallToken(token)
expect(installHash === hashInstallToken(token), 'Install hashing should be deterministic.')
expect(installHash !== hashInstallToken(secondToken), 'Different install tokens must not collide.')

const ledger = createBillingLedgerStore()
await ledger.creditCustomer({
	customerHash: installHash,
	eventId: 'synthetic-install-identity-funding',
	idempotencyKey: 'synthetic-install-identity-funding',
	source: 'owner_goodwill',
	amountCredits: 25,
	proofRef: { verification: 'install-identity-paid-reconnect' },
})

const firstContext = { sessionId: 'install-session-a', installHash, installState: {} }
await hydrateInstallBillingContext(firstContext, { force: true })
const firstState = getAuthState(firstContext)
expect(firstState.plan === 'credits' && firstState.credits === 25, 'Positive install balance should hydrate a credits entitlement.', { firstState })

const reconnectContext = { sessionId: 'install-session-b', installHash, installState: {} }
await hydrateInstallBillingContext(reconnectContext, { force: true })
const reconnectState = getAuthState(reconnectContext)
expect(reconnectState.plan === 'credits' && reconnectState.credits === 25, 'Session churn should preserve install credit entitlement.', { reconnectState })

const freeToken = generateInstallToken()
const freeInstallHash = hashInstallToken(freeToken)
const freeContext = { sessionId: 'free-session-a', installHash: freeInstallHash, installState: {} }
await hydrateInstallBillingContext(freeContext, { force: true })
await recordSuccessfulUse('betterpptx.deck.save', freeContext)
await recordSuccessfulUse('betterpptx.deck.save', freeContext)

const freeReconnect = { sessionId: 'free-session-b', installHash: freeInstallHash, installState: {} }
await hydrateInstallBillingContext(freeReconnect, { force: true })
const freeReconnectState = getAuthState(freeReconnect)
expect(freeReconnectState.quota.savedDecksToday === 2, 'Session churn should not reset install-day free save usage.', { freeReconnectState })

const usageStore = createInstallUsageStore()
const persistedUsage = await usageStore.getDailyUsage(freeInstallHash, new Date().toISOString().slice(0, 10))
expect(persistedUsage.savedDecks === 2, 'Install usage store should persist successful saves.', { persistedUsage })

const port = await freePort()
const server = await startBetterPptxHttp({
	host: '127.0.0.1',
	port,
	open: true,
	publicBase: `http://127.0.0.1:${port}`,
	downloadRoot: path.join(outputDir, 'downloads'),
})
const base = `http://127.0.0.1:${port}`

try {
	const init = await rpc(base, token, 'initialize', {
		protocolVersion: '2024-11-05',
		clientInfo: { name: 'install-identity-verifier', version: '1.0.0' },
		capabilities: {},
	})
	expect(init.status === 200 && (stateless || init.sessionId), 'Install-bound MCP initialize should succeed.', { init })
	if (stateless) expect(!init.sessionId, 'Stateless initialize must not allocate a transport session.')
	expect(!init.text.includes(token), 'Initialize response must not echo the raw install token.', { text: init.text })

	const auth = await rpc(base, token, 'tools/call', {
		name: 'betterpptx.auth.status',
		arguments: {},
	}, init.sessionId)
	expect(auth.status === 200, 'Install-bound auth status should succeed.', { auth })
	const payloadText = auth.body?.result?.content?.[0]?.text || ''
	const payload = payloadText ? JSON.parse(payloadText) : null
	expect(payload?.data?.plan === 'credits' && payload?.data?.credits === 25, 'HTTP tool context should receive the install-funded entitlement.', { payload })
	expect(!auth.text.includes(token) && !auth.text.includes(installHash), 'Public MCP response must not expose install token or hash.', {})

	const mismatch = await rpc(base, secondToken, stateless ? 'tools/call' : 'tools/list', stateless ? { name: 'betterpptx.auth.status', arguments: {} } : {}, init.sessionId)
	if (stateless) {
		const other = JSON.parse(mismatch.body?.result?.content?.[0]?.text || '{}')
		expect(mismatch.status === 200 && other?.data?.credits !== 25, 'A new stateless identity must not inherit another install balance.', { other })
	} else expect(mismatch.status === 401, 'Changing the device bearer within an MCP session should fail closed.', { mismatch })

	const missing = await fetch(`${base}/mcp`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json, text/event-stream',
			'mcp-session-id': init.sessionId,
		},
		body: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/list', params: {} }),
	})
	expect(missing.status === 401, 'The configured identity-required route must reject requests missing the device bearer.', { status: missing.status })

	const secondInit = await rpc(base, token, 'initialize', {
		protocolVersion: '2024-11-05',
		clientInfo: { name: 'install-identity-verifier-reconnect', version: '1.0.0' },
		capabilities: {},
	})
	expect(secondInit.status === 200 && (stateless ? !secondInit.sessionId : secondInit.sessionId !== init.sessionId), 'Same install should reconnect without losing identity.', { init, secondInit })
	const reconnectedAuth = await rpc(base, token, 'tools/call', { name: 'betterpptx.auth.status', arguments: {} }, secondInit.sessionId)
	const reconnected = JSON.parse(reconnectedAuth.body?.result?.content?.[0]?.text || '{}')
	expect(reconnected?.data?.credits === 25, 'A new request/session must retain the same server-side balance.', { reconnected })
} finally {
	await new Promise(resolve => server.httpServer.close(resolve))
}

for (const file of [ledgerFile, usageFile, logFile]) {
	const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
	expect(!text.includes(token) && !text.includes(secondToken) && !text.includes(freeToken), `Raw install token leaked into ${path.basename(file)}.`, {})
}

console.log(`INSTALL IDENTITY: PASS transport=${stateless ? 'stateless' : 'stateful'} credits=${firstState.credits} persistedUsage=${freeReconnectState.quota.savedDecksToday}`)
