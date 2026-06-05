// Local Track A harness: stress several MCP sessions through create/edit/save/download
// with idempotency replays, then verify private aggregate telemetry moved.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'

const here = path.dirname(fileURLToPath(import.meta.url))
const port = 3366
const downloadRoot = path.join(here, '.verify-track-a-public-files')
const runtimeRoot = path.join(here, '.verify-track-a-runtime')
const ioRoot = path.join(here, '.verify-track-a-io')

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function waitHealth(baseUrl) {
	for (let i = 0; i < 80; i++) {
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
		BETTERPPTX_SESSION_DECKS_PER_HOUR: '100',
		BETTERPPTX_LOG: '',
		BETTERPPTX_RUNTIME_DIR: runtimeRoot,
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

async function createRpc(mcpUrl, name) {
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
		clientInfo: { name, version: '1' },
		capabilities: {},
	})
	await fetch(mcpUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'mcp-session-id': sid },
		body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
	})
	return async function tool(toolName, args = {}) {
		const response = await rpc('tools/call', { name: toolName, arguments: args })
		return JSON.parse(response?.result?.content?.[0]?.text || '{}')
	}
}

function fail(message, payload) {
	console.error('TRACK A HARNESS: FAIL -', message)
	if (payload) console.error(JSON.stringify(payload, null, 2))
	process.exit(1)
}

function requireOk(label, payload) {
	if (!payload?.ok) fail(`${label} failed`, payload)
	return payload.data || {}
}

async function runSession(mcpUrl, sessionIndex, iterations) {
	const tool = await createRpc(mcpUrl, `track-a-harness-${sessionIndex}`)
	for (let i = 0; i < iterations; i++) {
		const prefix = `s${sessionIndex}-i${i}`
		const deckArgs = { title: `Harness ${prefix}`, idempotencyKey: `${prefix}-deck` }
		const deck = requireOk('deck.new', await tool('betterpptx.deck.new', deckArgs))
		const deckReplay = requireOk('deck.new replay', await tool('betterpptx.deck.new', deckArgs))
		if (deck.deckId !== deckReplay.deckId || deckReplay.idempotentReplay !== true) {
			fail('deck.new replay mismatch', { deck, deckReplay })
		}
		const deckId = deck.deckId

		const slideArgs = { deckId, idempotencyKey: `${prefix}-slide`, notes: `Notes ${prefix}` }
		requireOk('slide.add', await tool('betterpptx.slide.add', slideArgs))
		const slideReplay = requireOk('slide.add replay', await tool('betterpptx.slide.add', slideArgs))
		if (slideReplay.idempotentReplay !== true) fail('slide.add replay missing marker', slideReplay)

		const textArgs = {
			deckId,
			slideIndex: 0,
			idempotencyKey: `${prefix}-text`,
			text: `Harness text ${prefix}`,
			options: { x: 0.5, y: 0.5, w: 5.5, h: 0.5, fontSize: 18, color: '111827' },
		}
		requireOk('slide.add_text', await tool('betterpptx.slide.add_text', textArgs))
		const textReplay = requireOk('slide.add_text replay', await tool('betterpptx.slide.add_text', textArgs))
		if (textReplay.idempotentReplay !== true) fail('slide.add_text replay missing marker', textReplay)

		const summary = requireOk('deck.summary', await tool('betterpptx.deck.summary', { deckId }))
		const inspected = requireOk('slide.inspect', await tool('betterpptx.slide.inspect', { deckId, slideIndex: 0 }))
		if (summary.slideCount !== 1 || inspected.objectCount !== 1) fail('unexpected deck state before save', { summary, inspected })

		const saveArgs = { deckId, idempotencyKey: `${prefix}-save`, fileName: `harness-${prefix}.pptx` }
		const saved = requireOk('deck.save', await tool('betterpptx.deck.save', saveArgs))
		const savedReplay = requireOk('deck.save replay', await tool('betterpptx.deck.save', saveArgs))
		if (!saved.downloadUrl || saved.downloadUrl !== savedReplay.downloadUrl || savedReplay.idempotentReplay !== true) {
			fail('deck.save replay mismatch', { saved, savedReplay })
		}
		const res = await fetch(saved.downloadUrl)
		const bytes = Buffer.from(await res.arrayBuffer())
		if (res.status !== 200 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
			fail('download did not return PPTX zip', { status: res.status, bytes: bytes.length })
		}
	}
}

async function main() {
	await fs.rm(downloadRoot, { recursive: true, force: true })
	await fs.rm(runtimeRoot, { recursive: true, force: true })
	await fs.rm(ioRoot, { recursive: true, force: true })
	const server = spawnServer()
	try {
		await waitHealth(server.baseUrl)
		const sessions = 4
		const iterations = 2
		await Promise.all(Array.from({ length: sessions }, (_, i) => runSession(server.mcpUrl, i + 1, iterations)))
		const adminTool = await createRpc(server.mcpUrl, 'track-a-harness-io')
		const ioArgs = {
			idempotencyKey: 'verify-io-write-1',
			path: path.join(ioRoot, 'payload.txt'),
			content: 'private harness payload',
			encoding: 'utf-8',
		}
		const write1 = requireOk('io.write_file first', await adminTool('betterpptx.io.write_file', ioArgs))
		const write2 = requireOk('io.write_file replay', await adminTool('betterpptx.io.write_file', ioArgs))
		if (write1.bytes !== write2.bytes || write2.idempotentReplay !== true) fail('io.write_file session replay mismatch', { write1, write2 })
		const fileText = await fs.readFile(path.join(ioRoot, 'payload.txt'), 'utf8')
		if (fileText !== 'private harness payload') fail('io.write_file wrote unexpected content', { fileText })
		const health = await (await fetch(`${server.baseUrl}/health`)).json()
		const telemetry = health?.engine?.telemetry
		if (!telemetry || telemetry.toolCalls < sessions * iterations * 8) fail('private health did not include expected telemetry', health)
		if (telemetry.idempotentReplays < sessions * iterations * 4) fail('telemetry replay count too low', telemetry)
		if (telemetry.downloads < sessions * iterations) fail('telemetry download count too low', telemetry)
		if (telemetry.artifactsSaved < sessions * iterations) fail('telemetry artifact count too low', telemetry)
		console.log(`TRACK A HARNESS: PASS sessions=${sessions} iterations=${iterations} toolCalls=${telemetry.toolCalls} replays=${telemetry.idempotentReplays}`)
	} finally {
		if (server.child && !server.child.killed) server.child.kill()
		await fs.rm(downloadRoot, { recursive: true, force: true })
		await fs.rm(runtimeRoot, { recursive: true, force: true })
		await fs.rm(ioRoot, { recursive: true, force: true })
	}
}

main().catch(err => fail(err.message || String(err)))
