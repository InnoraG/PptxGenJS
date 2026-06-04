// Local Track A failure-injection verifier:
// - exact idempotent deck.new replay bypasses deck quota
// - same idempotency key with different args returns IDEMPOTENCY_CONFLICT
// - new deck creation after quota returns RATE_LIMITED
// - missing artifact download increments private telemetry downloadErrors
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'

const here = path.dirname(fileURLToPath(import.meta.url))
const port = 3367
const downloadRoot = path.join(here, '.verify-track-a-failure-files')
const runtimeRoot = path.join(here, '.verify-track-a-failure-runtime')

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function waitHealth(baseUrl) {
	for (let i = 0; i < 60; i++) {
		try {
			const res = await fetch(`${baseUrl}/health`)
			if (res.status < 500) return
		} catch {}
		await sleep(250)
	}
	throw new Error(`server did not become ready: ${baseUrl}`)
}

function spawnServer() {
	const env = {
		...process.env,
		BETTERPPTX_AUTH: 'none',
		BETTERPPTX_HOST: '127.0.0.1',
		BETTERPPTX_PORT: String(port),
		BETTERPPTX_PUBLIC_BASE: `http://127.0.0.1:${port}`,
		BETTERPPTX_PUBLIC_MCP_URL: `http://127.0.0.1:${port}/mcp`,
		BETTERPPTX_DOWNLOAD_ROOT: downloadRoot,
		BETTERPPTX_PUBLIC_BLACK_BOX: '0',
		BETTERPPTX_RATE_LIMIT_DISABLED: '1',
		BETTERPPTX_SESSION_DECKS_PER_HOUR: '1',
		BETTERPPTX_RUNTIME_DIR: runtimeRoot,
		BETTERPPTX_LOG: '',
	}
	const child = spawn(process.execPath, ['server-http.mjs'], {
		cwd: here,
		env,
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: true,
	})
	child.stderr.on('data', chunk => {
		const text = String(chunk || '')
		if (/EADDRINUSE|fatal|error/i.test(text)) process.stderr.write(text)
	})
	return { child, baseUrl: `http://127.0.0.1:${port}`, mcpUrl: `http://127.0.0.1:${port}/mcp` }
}

function sse(text) {
	for (const line of String(text).split('\n')) {
		const m = line.match(/^data:\s*(.+)$/)
		if (m) return JSON.parse(m[1])
	}
	return null
}

async function body(res) {
	const ct = res.headers.get('content-type') || ''
	const raw = await res.text()
	return ct.includes('event-stream') ? sse(raw) : (raw ? JSON.parse(raw) : null)
}

async function createRpc(mcpUrl) {
	let sid = null
	async function rpc(method, params) {
		const res = await fetch(mcpUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json, text/event-stream',
				...(sid ? { 'mcp-session-id': sid } : {}),
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: `${Date.now()}-${Math.random()}`, method, params }),
		})
		if (!sid) sid = res.headers.get('mcp-session-id')
		return body(res)
	}
	await rpc('initialize', {
		protocolVersion: '2024-11-05',
		clientInfo: { name: 'track-a-failure-injection', version: '1' },
		capabilities: {},
	})
	await fetch(mcpUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'mcp-session-id': sid },
		body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
	})
	return async function tool(name, args = {}) {
		const response = await rpc('tools/call', { name, arguments: args })
		return JSON.parse(response?.result?.content?.[0]?.text || '{}')
	}
}

function fail(message, payload) {
	console.error('TRACK A FAILURE: FAIL -', message)
	if (payload) console.error(JSON.stringify(payload, null, 2))
	process.exit(1)
}

function requireOk(label, payload) {
	if (!payload?.ok) fail(`${label} failed`, payload)
	return payload.data || {}
}

async function main() {
	await fs.rm(downloadRoot, { recursive: true, force: true })
	await fs.rm(runtimeRoot, { recursive: true, force: true })
	const server = spawnServer()
	try {
		await waitHealth(server.baseUrl)
		const tool = await createRpc(server.mcpUrl)
		const deckArgs = { title: 'quota deck', idempotencyKey: 'quota-deck-1' }
		const deck1 = requireOk('deck.new first', await tool('betterpptx.deck.new', deckArgs))
		const deckReplay = requireOk('deck.new replay', await tool('betterpptx.deck.new', deckArgs))
		if (deck1.deckId !== deckReplay.deckId || deckReplay.idempotentReplay !== true) fail('deck.new replay did not bypass quota', { deck1, deckReplay })

		const conflict = await tool('betterpptx.deck.new', { title: 'changed args', idempotencyKey: 'quota-deck-1' })
		if (conflict.ok !== false || conflict.error?.code !== 'IDEMPOTENCY_CONFLICT') fail('idempotency conflict was not structured', conflict)

		const limited = await tool('betterpptx.deck.new', { title: 'quota blocked', idempotencyKey: 'quota-deck-2' })
		if (limited.ok !== false || limited.error?.code !== 'RATE_LIMITED' || limited.error?.retry_safe !== true) fail('deck quota did not return structured RATE_LIMITED', limited)

		requireOk('slide.add', await tool('betterpptx.slide.add', { deckId: deck1.deckId, idempotencyKey: 'slide-1' }))
		const saved = requireOk('deck.save', await tool('betterpptx.deck.save', { deckId: deck1.deckId, idempotencyKey: 'save-1', fileName: 'failure-injection.pptx' }))
		if (!saved.downloadUrl) fail('deck.save did not return downloadUrl', saved)

		const missing = await fetch(`${server.baseUrl}/files/not-a-real-token/missing.pptx`)
		if (missing.status !== 404) fail('missing artifact route did not return 404', { status: missing.status })

		const health = await (await fetch(`${server.baseUrl}/health`)).json()
		const telemetry = health?.engine?.telemetry
		if (!telemetry || telemetry.idempotencyConflicts < 1 || telemetry.downloadErrors < 1 || !telemetry.byErrorCode?.RATE_LIMITED) {
			fail('telemetry did not capture injected failures', telemetry)
		}
		console.log('TRACK A FAILURE: PASS')
	} finally {
		if (server.child && !server.child.killed) server.child.kill()
		await fs.rm(downloadRoot, { recursive: true, force: true })
		await fs.rm(runtimeRoot, { recursive: true, force: true })
	}
}

main().catch(err => fail(err.message || String(err)))
