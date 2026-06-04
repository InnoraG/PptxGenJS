#!/usr/bin/env node
// Smoke-test the HTTP / Streamable-HTTP claudepptxmcp server.
// Spawns the server, does an initialize → tools/list → tools/call roundtrip,
// and exits with status 0 if everything works.

import { spawn } from 'node:child_process'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_PATH = path.resolve(__dirname, 'server-http.mjs')
const PORT = Number(process.env.SMOKE_HTTP_PORT || 3345)
const TOKEN = 'smoke-token-' + Math.random().toString(36).slice(2, 10)
const BASE = `http://127.0.0.1:${PORT}`

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Parse a Server-Sent Events response body and return the parsed JSON-RPC envelope
function parseSSE(text) {
	const lines = text.split('\n')
	for (const line of lines) {
		const m = line.match(/^data:\s*(.+)$/)
		if (m) return JSON.parse(m[1])
	}
	return null
}

async function mcpCall(method, params, sessionId) {
	const headers = {
		'Content-Type': 'application/json',
		'Authorization': `Bearer ${TOKEN}`,
		'Accept': 'application/json, text/event-stream',
	}
	if (sessionId) headers['mcp-session-id'] = sessionId
	const body = JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
	const res = await fetch(`${BASE}/mcp`, { method: 'POST', headers, body })
	const ct = res.headers.get('content-type') || ''
	const sid = res.headers.get('mcp-session-id') || sessionId
	const raw = await res.text()
	let parsed = null
	if (ct.includes('text/event-stream')) parsed = parseSSE(raw)
	else if (ct.includes('application/json')) parsed = raw ? JSON.parse(raw) : null
	if (!res.ok && !parsed) throw new Error(`HTTP ${res.status} on ${method}: ${raw}`)
	if (parsed && parsed.error) throw new Error(`${method} JSON-RPC error: ${parsed.error.message}`)
	return { sid, body: parsed }
}

async function main() {
	console.log('====================================================')
	console.log('  claudepptxmcp HTTP transport smoke-test')
	console.log('====================================================')
	const child = spawn(process.execPath, [SERVER_PATH], {
		stdio: ['ignore', 'pipe', 'pipe'],
		env: { ...process.env, CLAUDEPPTX_PORT: String(PORT), CLAUDEPPTX_TOKEN: TOKEN, CLAUDEPPTX_HOST: '127.0.0.1' },
	})
	let ready = false
	child.stderr.on('data', b => {
		const s = b.toString()
		if (/listening on|HTTP server/.test(s) && !ready) { ready = true; console.log('[server] up') }
	})
	child.on('exit', code => console.log(`[server] exited with ${code}`))

	// Poll /health until ready
	for (let i = 0; i < 60 && !ready; i++) {
		try {
			const r = await fetch(`${BASE}/health`)
			if (r.ok) { ready = true; break }
		} catch (_) {}
		await sleep(150)
	}
	if (!ready) { console.log('FAIL: server did not start'); child.kill(); process.exit(1) }

	try {
		// 1. unauthorized → 401
		const unauth = await fetch(`${BASE}/mcp`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', clientInfo: { name: 'smoke', version: '1.0.0' }, capabilities: {} } }),
		})
		if (unauth.status !== 401) { console.log(`FAIL: unauthorized POST returned ${unauth.status}, expected 401`); child.kill(); process.exit(1) }
		console.log(`  ✓ POST /mcp without token → 401`)

		// 2. initialize
		const init = await mcpCall('initialize', {
			protocolVersion: '2024-11-05',
			clientInfo: { name: 'smoke-http', version: '1.0.0' },
			capabilities: {},
		})
		console.log(`  ✓ initialize → session ${init.sid}`)
		console.log(`    server: ${init.body.result.serverInfo.name} v${init.body.result.serverInfo.version}`)
		const sid = init.sid

		// 3. notifications/initialized (no response expected — just send)
		await fetch(`${BASE}/mcp`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}`,
				'Accept': 'application/json, text/event-stream', 'mcp-session-id': sid,
			},
			body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
		})

		// 4. tools/list
		const list = await mcpCall('tools/list', {}, sid)
		const toolCount = list.body.result.tools.length
		console.log(`  ✓ tools/list → ${toolCount} tools`)
		const sample = list.body.result.tools.slice(0, 5).map(t => t.name).join(', ')
		console.log(`    first 5: ${sample}`)

		// 5. tools/call: claudepptx.help.capabilities
		const cap = await mcpCall('tools/call', { name: 'claudepptx.help.capabilities', arguments: {} }, sid)
		const capPayload = JSON.parse(cap.body.result.content[0].text)
		console.log(`  ✓ tools/call (capabilities) → brand=${capPayload.data.brand}`)

		// 6. tools/call: deck.new → slide.add → slide.add_text → deck.save
		const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
		const deckNew = await mcpCall('tools/call', { name: 'claudepptx.deck.new', arguments: { layout: 'LAYOUT_WIDE', title: 'HTTP smoke deck' } }, sid)
		const deckId = JSON.parse(deckNew.body.result.content[0].text).data.deckId
		console.log(`  ✓ deck.new → ${deckId}`)
		await mcpCall('tools/call', { name: 'claudepptx.slide.add', arguments: { deckId, background: { color: '0F172A' }, transition: { type: 'fade' } } }, sid)
		await mcpCall('tools/call', {
			name: 'claudepptx.slide.add_text',
			arguments: {
				deckId, slideIndex: 0,
				text: 'claudepptxmcp · HTTP smoke',
				options: { x: 0.5, y: 2.5, w: 12.3, h: 1.2, fontSize: 44, bold: true, color: 'FFFFFF', align: 'center',
					text3D: { bevel: { type: 'circle', width: 4, height: 4 }, extrusion: 8, extrusionColor: '6D28D9', material: 'metal', lightRig: 'threePt' },
					glow: { size: 14, color: '22D3EE', opacity: 0.7 } },
			},
		}, sid)
		const save = await mcpCall('tools/call', {
			name: 'claudepptx.deck.save',
			arguments: { deckId, outputDir: path.resolve('outputs'), fileName: `ClaudePptxMcp_HTTPSmoke_${stamp}.pptx` },
		}, sid)
		const savePayload = JSON.parse(save.body.result.content[0].text).data
		console.log(`  ✓ deck.save → ${savePayload.filePath} (${savePayload.bytes.toLocaleString()} bytes, ${savePayload.slideCount} slides)`)

		// 7. DELETE /mcp → close session
		const del = await fetch(`${BASE}/mcp`, {
			method: 'DELETE',
			headers: { 'Authorization': `Bearer ${TOKEN}`, 'mcp-session-id': sid, 'Accept': 'application/json, text/event-stream' },
		})
		console.log(`  ✓ DELETE /mcp → ${del.status}`)

		console.log('====================================================')
		console.log('  SMOKE: PASS')
		console.log('====================================================')
		child.kill()
		process.exit(0)
	} catch (e) {
		console.log(`FAIL: ${e?.message || e}`)
		child.kill()
		process.exit(1)
	}
}

main()
