import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

const outputDir = path.resolve('outputs', 'stateless-mcp-gateway-verify', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_HTTP_STATELESS_MCP = '1'
process.env.BETTERPPTX_AUTH = 'none'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_INSTALL_HMAC_SECRET = 'stateless-gateway-install-secret-000000000000'
process.env.BETTERPPTX_INSTALL_USAGE_STORE = 'local'
process.env.BETTERPPTX_INSTALL_USAGE_FILE = path.join(outputDir, 'install-usage.json')
process.env.BETTERPPTX_BILLING_PROVIDER = 'crypto_credits'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_DURABLE_DECK_STATE_STORE = 'local'
process.env.BETTERPPTX_DECK_STATE_FILE = path.join(outputDir, 'deck-state.json')
process.env.BETTERPPTX_DECK_SNAPSHOT_STORE = 'local'
process.env.BETTERPPTX_DECK_SNAPSHOT_DIR = path.join(outputDir, 'deck-specs')
process.env.BETTERPPTX_LOCKED_ASSET_STORE = 'local'
process.env.BETTERPPTX_LOCKED_ASSET_SHARED_DIR = path.join(outputDir, 'locked-assets-shared')
process.env.BETTERPPTX_LOCKED_ASSET_ROOT = path.join(outputDir, 'locked-assets-root')
process.env.BETTERPPTX_ARTIFACT_STORE = 'local'
process.env.BETTERPPTX_DOWNLOAD_ROOT = path.join(outputDir, 'downloads')

const { startBetterPptxHttp } = await import('./server-http.mjs')
const { generateInstallToken } = await import('./auth/install-identity.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

function ssePayload(raw) {
	for (const line of String(raw || '').split(/\r?\n/)) {
		const match = /^data:\s*(.+)$/.exec(line)
		if (match) return JSON.parse(match[1])
	}
	return null
}

async function decodeResponse(res) {
	const raw = await res.text()
	const contentType = res.headers.get('content-type') || ''
	if (!raw) return null
	if (contentType.includes('event-stream')) return ssePayload(raw)
	return JSON.parse(raw)
}

const started = await startBetterPptxHttp({
	host: '127.0.0.1',
	port: 0,
	open: true,
	downloadRoot: process.env.BETTERPPTX_DOWNLOAD_ROOT,
})

const address = started.httpServer.address()
const base = `http://127.0.0.1:${address.port}`
const mcpUrl = `${base}${started.mcpPath}`
const deviceToken = generateInstallToken()
const headers = {
	'Content-Type': 'application/json',
	Accept: 'application/json, text/event-stream',
	'x-betterpptx-device': deviceToken,
}
let requestId = 1

async function rpc(method, params = {}, extraHeaders = headers) {
	const res = await fetch(mcpUrl, {
		method: 'POST',
		headers: extraHeaders,
		body: JSON.stringify({ jsonrpc: '2.0', id: requestId++, method, params }),
	})
	const body = await decodeResponse(res)
	return { res, body }
}

try {
	expect(started.mcpTransportMode === 'stateless', 'HTTP server must report stateless transport mode.', { started })

	const missing = await fetch(mcpUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
		body: JSON.stringify({ jsonrpc: '2.0', id: requestId++, method: 'tools/list', params: {} }),
	})
	const missingBody = await decodeResponse(missing)
	expect(missing.status === 401 && missingBody?.error?.code === 'INSTALL_IDENTITY_REQUIRED', 'Stateless MCP must require an install identity by default.', {
		status: missing.status,
		body: missingBody,
	})

	const init = await rpc('initialize', {
		protocolVersion: '2024-11-05',
		clientInfo: { name: 'stateless-gateway-verify', version: '1' },
		capabilities: {},
	})
	expect(init.res.status === 200, 'initialize should succeed.', { status: init.res.status, body: init.body })
	expect(!init.res.headers.get('mcp-session-id'), 'Stateless initialize must not emit mcp-session-id.', {
		sessionHeader: init.res.headers.get('mcp-session-id'),
	})
	expect(init.body?.result?.serverInfo?.name, 'initialize should return server info.', { init: init.body })

	const list = await rpc('tools/list', {})
	expect(list.res.status === 200, 'tools/list should succeed without a session id.', { status: list.res.status, body: list.body })
	expect(!list.res.headers.get('mcp-session-id'), 'Stateless tools/list must not emit mcp-session-id.', {
		sessionHeader: list.res.headers.get('mcp-session-id'),
	})
	const names = (list.body?.result?.tools || []).map(tool => tool.name)
	expect(names.includes('betterpptx.deck.generate_from_spec') && !names.includes('betterpptx.slide.add_text'), 'Spec-first public stateless list must include spec tools and hide primitives.', { names })

	const status = await rpc('tools/call', { name: 'betterpptx.auth.status', arguments: {} })
	const statusPayload = JSON.parse(status.body?.result?.content?.[0]?.text || '{}')
	expect(statusPayload.ok === true, 'tools/call should succeed across a fresh stateless request.', { statusPayload })

	const get = await fetch(mcpUrl, { method: 'GET', headers })
	const getBody = await decodeResponse(get)
	expect(get.status === 405 && getBody?.error?.message?.includes('stateless'), 'GET /mcp should be disabled in stateless mode.', { status: get.status, getBody })

	const del = await fetch(mcpUrl, { method: 'DELETE', headers })
	const delBody = await decodeResponse(del)
	expect(del.status === 405 && delBody?.error?.message?.includes('stateless'), 'DELETE /mcp should be disabled in stateless mode.', { status: del.status, delBody })

	const state = fs.existsSync(process.env.BETTERPPTX_INSTALL_USAGE_FILE)
		? fs.readFileSync(process.env.BETTERPPTX_INSTALL_USAGE_FILE, 'utf8')
		: ''
	console.log('STATELESS MCP GATEWAY: PASS sessionHeader=0 missingInstall=401 statelessList=1 statelessCall=1 getDelete405=1 usageStore=' + crypto.createHash('sha256').update(state).digest('hex').slice(0, 10))
} finally {
	await new Promise(resolve => started.httpServer.close(resolve))
}
