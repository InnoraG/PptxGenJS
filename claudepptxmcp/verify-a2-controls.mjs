// Verify A2 launch controls: HTTP rate limit, kill switch, read-only mode,
// per-session deck quota, and uploaded PPTX byte cap.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'

const ports = [3360, 3361, 3362, 3363, 3364]
const here = path.dirname(fileURLToPath(import.meta.url))

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function waitHealth(baseUrl) {
	for (let i = 0; i < 60; i++) {
		try {
			const res = await fetch(`${baseUrl}/health`)
			if (res.status < 500) return
		} catch {}
		await sleep(300)
	}
	throw new Error(`server did not become ready: ${baseUrl}`)
}

function spawnServer(port, extraEnv = {}) {
	const env = {
		...process.env,
		BETTERPPTX_AUTH: 'none',
		BETTERPPTX_HOST: '127.0.0.1',
		BETTERPPTX_PORT: String(port),
		BETTERPPTX_PUBLIC_MCP_URL: `http://127.0.0.1:${port}/mcp`,
		BETTERPPTX_PUBLIC_BLACK_BOX: '1',
		BETTERPPTX_LOG: '',
		BETTERPPTX_RATE_LIMIT_DISABLED: '1',
		...extraEnv,
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

async function withServer(port, env, fn) {
	const server = spawnServer(port, env)
	try {
		await waitHealth(server.baseUrl)
		return await fn(server)
	} finally {
		if (server.child && !server.child.killed) server.child.kill()
	}
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
			body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
		})
		if (!sid) sid = res.headers.get('mcp-session-id')
		return body(res)
	}
	await rpc('initialize', {
		protocolVersion: '2024-11-05',
		clientInfo: { name: 'a2-controls-verify', version: '1' },
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
	console.error('A2 VERIFY: FAIL -', message)
	if (payload) console.error(JSON.stringify(payload, null, 2))
	process.exit(1)
}

async function verifyRateLimit() {
	await withServer(ports[0], {
		BETTERPPTX_RATE_LIMIT_DISABLED: '0',
		BETTERPPTX_RATE_LIMIT_BURST: '2',
		BETTERPPTX_RATE_LIMIT_REFILL_PER_MIN: '0',
	}, async ({ baseUrl }) => {
		const statuses = []
		for (let i = 0; i < 5; i++) {
			const res = await fetch(`${baseUrl}/tools`)
			statuses.push(res.status)
			if (res.status === 429) {
				const payload = await body(res)
				if (payload?.error?.code !== 'RATE_LIMITED' || payload?.error?.retry_safe !== true) {
					fail('rate limit returned an unstructured error', payload)
				}
				console.log('rate limit -> RATE_LIMITED')
				return
			}
		}
		fail('rate limit did not produce HTTP 429', statuses)
	})
}

async function verifyKillSwitch() {
	await withServer(ports[1], { BETTERPPTX_DISABLED: '1' }, async ({ mcpUrl }) => {
		const tool = await createRpc(mcpUrl)
		const status = await tool('betterpptx.auth.status', {})
		if (status.ok !== false || status.error?.code !== 'SERVICE_DISABLED' || status.error?.retry_safe !== true) {
			fail('kill switch did not return SERVICE_DISABLED', status)
		}
		console.log('kill switch -> SERVICE_DISABLED')
	})
}

async function verifyReadOnly() {
	await withServer(ports[2], { BETTERPPTX_READ_ONLY: '1' }, async ({ mcpUrl }) => {
		const tool = await createRpc(mcpUrl)
		const status = await tool('betterpptx.status', {})
		if (!status.ok) fail('read-only mode blocked status', status)
		const deck = await tool('betterpptx.deck.new', { title: 'Read-only test' })
		if (deck.ok !== false || deck.error?.code !== 'READ_ONLY' || deck.error?.retry_safe !== true) {
			fail('read-only mode did not block mutation with READ_ONLY', deck)
		}
		console.log('read-only -> READ_ONLY')
	})
}

async function verifyDeckQuota() {
	await withServer(ports[3], { BETTERPPTX_SESSION_DECKS_PER_HOUR: '1' }, async ({ mcpUrl }) => {
		const tool = await createRpc(mcpUrl)
		const first = await tool('betterpptx.deck.new', { title: 'Quota 1' })
		if (!first.ok) fail('first deck.new failed under quota', first)
		const second = await tool('betterpptx.deck.new', { title: 'Quota 2' })
		if (second.ok !== false || second.error?.code !== 'RATE_LIMITED') {
			fail('second deck.new did not hit session quota', second)
		}
		console.log('deck quota -> RATE_LIMITED')
	})
}

async function verifyUploadCap() {
	await withServer(ports[4], { BETTERPPTX_MAX_UPLOAD_BYTES: '10' }, async ({ mcpUrl }) => {
		const tool = await createRpc(mcpUrl)
		const bytes = Buffer.alloc(32)
		bytes[0] = 0x50
		bytes[1] = 0x4b
		const uploaded = await tool('betterpptx.deck.open_uploaded', {
			fileName: 'too-large.pptx',
			data: bytes.toString('base64'),
		})
		if (uploaded.ok !== false || uploaded.error?.code !== 'UPLOAD_TOO_LARGE' || uploaded.error?.artifact_state !== 'not_imported') {
			fail('upload cap did not return UPLOAD_TOO_LARGE', uploaded)
		}
		console.log('upload cap -> UPLOAD_TOO_LARGE')
	})
}

async function main() {
	await verifyRateLimit()
	await verifyKillSwitch()
	await verifyReadOnly()
	await verifyDeckQuota()
	await verifyUploadCap()
	console.log('A2 VERIFY: PASS')
}

main().catch(err => fail(err.message || String(err)))
