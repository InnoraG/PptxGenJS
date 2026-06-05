#!/usr/bin/env node
// ============================================================================
// DEMO 1 — Animate an EXISTING pptx via MCP (wire-only).
//
// Pipeline (every call goes over the stdio MCP transport):
//   1. deck.open_existing(pptxPath)                 → load airtel-source.pptx
//   2. slide.list_shapes(slideIdx) for each slide   → discover shape names
//   3. slide.animate_shapes(...)                    → bulk-animate each slide,
//                                                     varying effect per slide
//   4. deck.set_transitions_all({variants})         → rotate transitions
//   5. deck.autoplay                                 → kiosk + advanceAfterTime
//   6. deck.validate                                 → sanity check
//   7. deck.save                                     → write animated pptx
//
// No engine.mjs import. No pptxgenjs import. Just the showcase-style wire client.
// ============================================================================

import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI_PATH = path.resolve(__dirname, '..', 'cli.mjs')

// ---- minimal stdio MCP client (same shape as demo-via-mcp.mjs) -------------
function startMcpClient() {
	const child = spawn(process.execPath, [CLI_PATH], { stdio: ['pipe', 'pipe', 'pipe'] })
	const pending = new Map()
	let nextId = 1
	let rxBuf = Buffer.alloc(0)
	let totalReq = 0, totalBytesIn = 0, totalBytesOut = 0
	child.stderr.on('data', b => {
		const s = b.toString()
		if (/server ready|MCP server/.test(s)) process.stderr.write(`[server] ${s}`)
	})
	child.stdout.on('data', chunk => {
		rxBuf = Buffer.concat([rxBuf, chunk])
		while (true) {
			const nl = rxBuf.indexOf(0x0a)
			if (nl < 0) break
			const line = rxBuf.subarray(0, nl).toString('utf8').trim()
			rxBuf = rxBuf.subarray(nl + 1)
			if (!line) continue
			try {
				const m = JSON.parse(line)
				if (m.id != null && pending.has(m.id)) {
					totalBytesIn += line.length
					const { resolve, reject } = pending.get(m.id)
					pending.delete(m.id)
					if (m.error) reject(new Error(m.error.message))
					else resolve(m.result)
				}
			} catch (_) {}
		}
	})
	function rpc(method, params) {
		const id = nextId++
		const body = { jsonrpc: '2.0', id, method, params }
		const line = JSON.stringify(body) + '\n'
		totalReq++; totalBytesOut += line.length
		return new Promise((res, rej) => { pending.set(id, { resolve: res, reject: rej }); child.stdin.write(line) })
	}
	function notify(method, params) {
		child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
	}
	async function callTool(name, args = {}) {
		const r = await rpc('tools/call', { name, arguments: args })
		const text = r.content[0].text
		const parsed = JSON.parse(text)
		if (!parsed.ok) throw new Error(`${name}: ${parsed.error && parsed.error.message}`)
		return parsed.data
	}
	async function init() {
		const r = await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'demo1', version: '1.0.0' }, capabilities: {} })
		notify('notifications/initialized', {})
		return r
	}
	function close() { child.stdin.end(); child.kill() }
	function stats() { return { totalReq, totalBytesIn, totalBytesOut } }
	return { rpc, callTool, init, close, stats }
}

// ---- demo recipe -----------------------------------------------------------
const ANIMATIONS = [
	// vary effect per slide so the result feels alive
	{ type: 'entrance', effect: 'fade', duration: 600 },
	{ type: 'entrance', effect: 'fly', direction: 'fromLeft', duration: 700 },
	{ type: 'entrance', effect: 'fly', direction: 'fromRight', duration: 700 },
	{ type: 'entrance', effect: 'fly', direction: 'fromBottom', duration: 700 },
	{ type: 'entrance', effect: 'zoom', duration: 600 },
	{ type: 'entrance', effect: 'wipe', direction: 'fromLeft', duration: 700 },
	{ type: 'entrance', effect: 'appear', duration: 400 },
	{ type: 'entrance', effect: 'split', duration: 700 },
]
const TRANSITIONS = [
	{ type: 'fade', speed: 'medium' },
	{ type: 'push', direction: 'left', speed: 'medium' },
	{ type: 'wipe', direction: 'right', speed: 'medium' },
	{ type: 'cover', direction: 'd', speed: 'medium' },
	{ type: 'uncover', direction: 'l', speed: 'medium' },
	{ type: 'reveal', direction: 'l', speed: 'medium' },
	{ type: 'glitter', pattern: 'hexagon', direction: 'r' },
	{ type: 'morph', option: 'byObject' },
]

async function main() {
	const t0 = Date.now()
	const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
	const sourcePath = path.resolve('outputs/airtel-source.pptx')
	const outputDir = path.resolve('outputs')
	const fileName = `Airtel_Animated_via_MCP_${stamp}.pptx`

	process.stderr.write('==========================================================\n')
	process.stderr.write('  DEMO 1 — Animate an existing pptx via MCP (wire-only)\n')
	process.stderr.write(`  Source: ${sourcePath}\n`)
	process.stderr.write('==========================================================\n\n')

	const mcp = startMcpClient()
	const init = await mcp.init()
	process.stderr.write(`[wire] handshake OK — server ${init.serverInfo.name} v${init.serverInfo.version}\n\n`)

	process.stderr.write('[wire] opening source pptx via decypher…\n')
	const opened = await mcp.callTool('betterpptx.deck.open_existing', { pptxPath: sourcePath })
	process.stderr.write(`[wire] opened: ${opened.slideCount} slides, ${opened.shapeCount} shapes\n`)
	if (opened.warningsTotal > 0) process.stderr.write(`[wire] (${opened.warningsTotal} replay warnings, first 3: ${opened.warnings.slice(0, 3).join(' | ')})\n`)
	const deckId = opened.deckId

	// Animate every slide — bulk addAnimation by kind, with 150ms stagger
	process.stderr.write('\n[wire] adding animations to every slide …\n')
	for (let i = 0; i < opened.slideCount; i++) {
		const anim = ANIMATIONS[i % ANIMATIONS.length]
		try {
			const r = await mcp.callTool('betterpptx.slide.animate_shapes', {
				deckId, slideIndex: i,
				animation: anim,
				kinds: ['image', 'text'],
				staggerMs: 200,
			})
			process.stderr.write(`  slide ${i + 1}: ${r.animationsApplied} shapes animated with ${anim.effect}${anim.direction ? ' (' + anim.direction + ')' : ''}\n`)
		} catch (e) {
			process.stderr.write(`  slide ${i + 1}: skipped (${e.message})\n`)
		}
	}

	// Rotate through transition variants
	process.stderr.write('\n[wire] applying transition variants …\n')
	const tr = await mcp.callTool('betterpptx.deck.set_transitions_all', { deckId, variants: TRANSITIONS })
	process.stderr.write(`  ${tr.slidesUpdated} slides updated with rotating transitions\n`)

	// Make it autoplay
	process.stderr.write('\n[wire] enabling autoplay (8s/slide, kiosk loop) …\n')
	const ap = await mcp.callTool('betterpptx.deck.autoplay', {
		deckId, secondsPerSlide: 8, loop: true, mode: 'kiosk', defaultTransition: { type: 'fade', speed: 'medium' },
	})
	process.stderr.write(`  ${ap.slidesUpdated} slides set to auto-advance\n`)

	// Validate + save
	process.stderr.write('\n[wire] validating …\n')
	const val = await mcp.callTool('betterpptx.deck.validate', { deckId, mode: 'normal', autoFix: true })
	process.stderr.write(`  valid=${val.valid} (${(val.issues || []).length} issues)\n`)

	process.stderr.write('\n[wire] saving …\n')
	const save = await mcp.callTool('betterpptx.deck.save', { deckId, outputDir, fileName })
	process.stderr.write(`  wrote ${save.filePath} (${save.bytes.toLocaleString()} bytes)\n`)

	const ms = Date.now() - t0
	const s = mcp.stats()
	process.stderr.write('\n==========================================================\n')
	process.stderr.write('  DEMO 1 COMPLETE\n')
	process.stderr.write('==========================================================\n')
	process.stderr.write(`file       : ${save.filePath}\n`)
	process.stderr.write(`bytes      : ${save.bytes.toLocaleString()}\n`)
	process.stderr.write(`slides     : ${save.slideCount}\n`)
	process.stderr.write(`elapsed    : ${ms} ms\n`)
	process.stderr.write(`wire calls : ${s.totalReq} RPCs\n`)
	process.stderr.write(`wire bytes : ${s.totalBytesOut.toLocaleString()} sent / ${s.totalBytesIn.toLocaleString()} received\n`)
	process.stderr.write('==========================================================\n')

	mcp.close()
	process.stdout.write(JSON.stringify({ ok: true, demo: 'animate-airtel', file: save.filePath, slides: save.slideCount, bytes: save.bytes, wireCalls: s.totalReq }, null, 2) + '\n')
}

main().catch(err => {
	process.stderr.write(`\n[demo1] FATAL: ${err && err.stack || err}\n`)
	process.exit(1)
})
