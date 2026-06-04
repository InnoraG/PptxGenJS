#!/usr/bin/env node
// =============================================================================
//  DEMO — Generic edition primitives in action.
//
//  Pipeline (every step is a single MCP tool call):
//   1. Build a small dark-themed deck (a "before" we own)
//   2. Save it as the "DARK" version
//   3. Open it again with deck.open_existing (proves the same flow works on
//      ANY pptx, including ones the user uploads)
//   4. Walk slides via slide.inspect_shapes — see every hex colour in use
//   5. deck.transform_shapes with a colorMap → DARK→LIGHT recolor in one call
//   6. slide.update_shape — patch the title's fontSize + add a glow
//   7. slide.animate_shapes — add new entrance animations to every shape
//   8. deck.set_transitions_all — rotate transitions
//   9. Save as the "LIGHT" version → side-by-side comparison
//
//  No domain-specific tool used. The MCP exposes generic primitives;
//  this script is just a recipe.
// =============================================================================

import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI_PATH = path.resolve(__dirname, '..', 'cli.mjs')

function startMcpClient() {
	const child = spawn(process.execPath, [CLI_PATH], { stdio: ['pipe', 'pipe', 'pipe'] })
	const pending = new Map()
	let nextId = 1, rxBuf = Buffer.alloc(0), totalReq = 0, totalIn = 0, totalOut = 0
	child.stderr.on('data', b => { const s = b.toString(); if (/server ready|MCP server/.test(s)) process.stderr.write(`[server] ${s}`) })
	child.stdout.on('data', chunk => {
		rxBuf = Buffer.concat([rxBuf, chunk])
		while (true) {
			const nl = rxBuf.indexOf(0x0a); if (nl < 0) break
			const line = rxBuf.subarray(0, nl).toString('utf8').trim()
			rxBuf = rxBuf.subarray(nl + 1); if (!line) continue
			try {
				const m = JSON.parse(line)
				if (m.id != null && pending.has(m.id)) {
					totalIn += line.length
					const { resolve, reject } = pending.get(m.id); pending.delete(m.id)
					if (m.error) reject(new Error(m.error.message)); else resolve(m.result)
				}
			} catch (_) {}
		}
	})
	function rpc(method, params) {
		const id = nextId++; const line = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
		totalReq++; totalOut += line.length
		return new Promise((res, rej) => { pending.set(id, { resolve: res, reject: rej }); child.stdin.write(line) })
	}
	function notify(m, p) { child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: m, params: p }) + '\n') }
	async function callTool(name, args = {}) {
		const r = await rpc('tools/call', { name, arguments: args })
		const parsed = JSON.parse(r.content[0].text)
		if (!parsed.ok) throw new Error(`${name}: ${parsed.error && parsed.error.message}`)
		return parsed.data
	}
	async function init() {
		const r = await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'demo-edit-deck', version: '1.0.0' }, capabilities: {} })
		notify('notifications/initialized', {})
		return r
	}
	return { rpc, callTool, init, close: () => { child.stdin.end(); child.kill() }, stats: () => ({ totalReq, totalIn, totalOut }) }
}

async function main() {
	const t0 = Date.now()
	const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
	const outputDir = path.resolve('outputs')
	const darkFile = `EditDemo_Dark_${stamp}.pptx`
	const lightFile = `EditDemo_Light_${stamp}.pptx`

	process.stderr.write('==========================================================\n')
	process.stderr.write('  Edition primitives demo — dark → light via colorMap\n')
	process.stderr.write('==========================================================\n\n')

	const mcp = startMcpClient()
	await mcp.init()

	// ---- Dark palette ----
	const DARK = {
		bg: '0B1026', surface: '11576C', primary: '22D3EE', accent: 'C026D3',
		secondary: '34D399', text: 'F8FAFC', muted: '94A3B8',
	}
	// LIGHT palette (the AI client owns this — MCP doesn't ship presets)
	const LIGHT = {
		bg: 'F8FAFC', surface: 'E2E8F0', primary: '0EA5E9', accent: 'D946EF',
		secondary: '16A34A', text: '0F172A', muted: '64748B',
	}

	// 1. Build a small dark-themed deck
	process.stderr.write('[wire] building DARK deck …\n')
	const { deckId: darkDeck } = await mcp.callTool('claudepptx.deck.new', { layout: 'LAYOUT_WIDE', title: 'Edit demo · dark' })
	await mcp.callTool('claudepptx.slide.add', { deckId: darkDeck, background: { color: DARK.bg }, transition: { type: 'fade' } })
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId: darkDeck, slideIndex: 0, text: 'Edit Demo',
		options: { x: 0.5, y: 1.5, w: 12.3, h: 1.2, fontSize: 56, bold: true, color: DARK.text, align: 'center',
			text3D: { bevel: { type: 'circle', width: 4, height: 4 }, extrusion: 8, extrusionColor: DARK.primary, material: 'metal', lightRig: 'threePt' },
			glow: { size: 14, color: DARK.primary, opacity: 0.7 },
			objectName: 'main_title' },
	})
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId: darkDeck, slideIndex: 0, text: 'Edition primitives: inspect_shapes · update_shape · transform_shapes',
		options: { x: 0.5, y: 3.0, w: 12.3, h: 0.6, fontSize: 18, color: DARK.primary, align: 'center', italic: true,
			objectName: 'subtitle' },
	})
	// Three coloured cards (so we have something to recolor)
	const CARDS = [
		{ label: 'Inspect',   x: 1.5,  color: DARK.primary,   name: 'card_primary' },
		{ label: 'Update',    x: 5.66, color: DARK.accent,    name: 'card_accent' },
		{ label: 'Transform', x: 9.8,  color: DARK.secondary, name: 'card_secondary' },
	]
	for (const c of CARDS) {
		await mcp.callTool('claudepptx.slide.add_shape', {
			deckId: darkDeck, slideIndex: 0, shapeName: 'roundRect',
			options: { x: c.x, y: 4.2, w: 2.0, h: 1.6, rectRadius: 0.15,
				fill: { color: c.color },
				line: { type: 'none' },
				shadow: { type: 'outer', color: '000000', opacity: 0.4, blur: 16, offset: 6, angle: 90 },
				objectName: c.name },
		})
		await mcp.callTool('claudepptx.slide.add_text', {
			deckId: darkDeck, slideIndex: 0, text: c.label,
			options: { x: c.x, y: 4.5, w: 2.0, h: 1.0, fontSize: 22, bold: true, color: DARK.bg, align: 'center', valign: 'middle',
				objectName: c.name + '_label' },
		})
	}
	const darkSave = await mcp.callTool('claudepptx.deck.save', { deckId: darkDeck, outputDir, fileName: darkFile })
	process.stderr.write(`[wire] dark saved → ${darkSave.filePath} (${darkSave.bytes.toLocaleString()} bytes)\n`)

	// 2. Open the saved dark deck — proves the flow works on ANY .pptx, including uploads
	process.stderr.write('\n[wire] opening saved deck (could be a user-uploaded deck too) …\n')
	const opened = await mcp.callTool('claudepptx.deck.open_existing', { pptxPath: darkSave.filePath })
	const editDeck = opened.deckId
	process.stderr.write(`[wire]   ${opened.slideCount} slides, ${opened.shapeCount} shapes opened\n`)

	// 3. Inspect every shape on slide 0
	process.stderr.write('\n[wire] inspect_shapes on slide 0 (find every colour in use):\n')
	const inspect = await mcp.callTool('claudepptx.slide.inspect_shapes', { deckId: editDeck, slideIndex: 0 })
	const allColors = new Set()
	for (const sh of inspect.shapes) {
		for (const c of sh.colors || []) allColors.add(c)
		process.stderr.write(`   [${sh.index}] ${(sh.objectName || sh.kind || '').padEnd(28)} kind=${(sh.kind || '').padEnd(10)} colours=[${(sh.colors || []).join(', ')}]\n`)
	}
	process.stderr.write(`[wire] distinct hex colours: ${[...allColors].join(', ')}\n`)

	// 4. Build the DARK→LIGHT colorMap by pairing palette slots
	const colorMap = {}
	const dPairs = Object.entries(DARK)
	const lPairs = Object.entries(LIGHT)
	for (let i = 0; i < dPairs.length; i++) {
		colorMap[dPairs[i][1].toUpperCase()] = lPairs[i][1]
	}
	// also swap text on bg by inverting (dark text on light bg)
	colorMap[DARK.text.toUpperCase()] = LIGHT.text
	colorMap[DARK.bg.toUpperCase()] = LIGHT.bg

	process.stderr.write(`\n[wire] transform_shapes — dark→light colorMap (${Object.keys(colorMap).length} mappings):\n`)
	for (const [k, v] of Object.entries(colorMap)) process.stderr.write(`   #${k} → #${v}\n`)

	// 5. Apply the recolor in ONE call across the whole deck
	const trans = await mcp.callTool('claudepptx.deck.transform_shapes', { deckId: editDeck, colorMap })
	process.stderr.write(`[wire]   shapesTouched=${trans.shapesTouched}, colorsRemapped=${trans.colorsRemapped}\n`)

	// 6. Demonstrate update_shape: bump the title font size, tweak its glow
	process.stderr.write('\n[wire] update_shape — bump title font + change glow:\n')
	const upd = await mcp.callTool('claudepptx.slide.update_shape', {
		deckId: editDeck, slideIndex: 0,
		target: { objectName: 'main_title' },
		patch: {
			fontSize: 64,
			glow: { size: 20, color: LIGHT.accent, opacity: 0.5 },
			text3D: { extrusionColor: LIGHT.primary },
		},
	})
	process.stderr.write(`   patched keys: ${upd.patchedKeys.join(', ')}\n`)

	// 7. Add fresh entrance animations to every shape via the existing animate_shapes
	process.stderr.write('\n[wire] animate_shapes — fresh entrance animations:\n')
	const anim = await mcp.callTool('claudepptx.slide.animate_shapes', {
		deckId: editDeck, slideIndex: 0,
		animation: { type: 'entrance', effect: 'fade', duration: 600 },
		kinds: ['text', 'shape', 'image'],
		staggerMs: 150,
	})
	process.stderr.write(`   animations applied: ${anim.animationsApplied}\n`)

	// 8. Rotate transitions
	await mcp.callTool('claudepptx.deck.set_transitions_all', {
		deckId: editDeck, transition: { type: 'fade', speed: 'medium' },
	})

	// 9. Add a 2nd slide BEFORE save — proves we can mutate an opened deck and add new content
	process.stderr.write('\n[wire] append a new slide to the opened deck …\n')
	await mcp.callTool('claudepptx.slide.add', {
		deckId: editDeck,
		background: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 135,
			gradientStops: [{ position: 0, color: LIGHT.bg }, { position: 100, color: LIGHT.surface }] },
		transition: { type: 'morph', option: 'byObject' },
	})
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId: editDeck, slideIndex: 1,
		text: 'After dark→light recolor',
		options: { x: 0.5, y: 2.2, w: 12.3, h: 1.0, fontSize: 40, bold: true, color: LIGHT.text, align: 'center',
			text3D: { bevel: { type: 'circle', width: 4, height: 4 }, extrusion: 8, extrusionColor: LIGHT.accent, material: 'metal', lightRig: 'threePt' } },
	})
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId: editDeck, slideIndex: 1,
		text: '1 inspect_shapes + 1 transform_shapes + 1 update_shape + 1 animate_shapes call did the entire transformation',
		options: { x: 0.5, y: 3.8, w: 12.3, h: 0.7, fontSize: 16, color: LIGHT.muted, italic: true, align: 'center' },
	})

	// 10. Save the LIGHT version
	const lightSave = await mcp.callTool('claudepptx.deck.save', { deckId: editDeck, outputDir, fileName: lightFile })
	process.stderr.write(`\n[wire] light saved → ${lightSave.filePath} (${lightSave.bytes.toLocaleString()} bytes)\n`)

	const s = mcp.stats()
	const ms = Date.now() - t0
	process.stderr.write('\n==========================================================\n')
	process.stderr.write('  EDIT DEMO COMPLETE\n')
	process.stderr.write('==========================================================\n')
	process.stderr.write(`dark deck   : ${darkSave.filePath} (${darkSave.bytes.toLocaleString()} bytes)\n`)
	process.stderr.write(`light deck  : ${lightSave.filePath} (${lightSave.bytes.toLocaleString()} bytes)\n`)
	process.stderr.write(`shapes touched   : ${trans.shapesTouched}\n`)
	process.stderr.write(`colours remapped : ${trans.colorsRemapped}\n`)
	process.stderr.write(`elapsed     : ${ms} ms\n`)
	process.stderr.write(`wire RPCs   : ${s.totalReq}\n`)
	process.stderr.write('==========================================================\n')
	mcp.close()
	process.stdout.write(JSON.stringify({
		ok: true, darkFile: darkSave.filePath, lightFile: lightSave.filePath,
		shapesTouched: trans.shapesTouched, colorsRemapped: trans.colorsRemapped, wireCalls: s.totalReq,
	}, null, 2) + '\n')
}

main().catch(e => { process.stderr.write(`\n[demo] FATAL: ${e && e.stack || e}\n`); process.exit(1) })
