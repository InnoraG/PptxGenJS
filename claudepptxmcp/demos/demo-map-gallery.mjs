#!/usr/bin/env node
// =============================================================================
//  DEMO — Triple-check the library is used as-is.
//
//  Imports ALL 5 distinct world maps from slide21 of the reference deck,
//  one per slide. Each map is dropped in VERBATIM (no smoothing, no
//  resampling, no projection — bytes go straight from slide21.xml into our
//  output via library.import_xml_group). Aspect ratio is preserved
//  (letterboxed) so nothing is stretched.
//
//  Then a 6th slide overlays bloc-coloured dots on the political map —
//  showing that library reuse + targeted overlay primitives compose to
//  produce a real geopolitical scene without re-synthesising the map.
// =============================================================================

import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as fs from 'node:fs'

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
		const r = await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'demo-map-gallery', version: '1.0.0' }, capabilities: {} })
		notify('notifications/initialized', {})
		return r
	}
	return { rpc, callTool, init, close: () => { child.stdin.end(); child.kill() }, stats: () => ({ totalReq, totalIn, totalOut }) }
}

async function main() {
	const t0 = Date.now()
	const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
	const slideXmlPath = 'decyphered/3d-gradient-style-advertising-agency__5bfa492b82738c36/extracted/slide21.xml'
	const outputDir = path.resolve('outputs')
	const fileName = `MapGallery_${stamp}.pptx`

	process.stderr.write('==========================================================\n')
	process.stderr.write('  Map gallery — verbatim library imports from slide21\n')
	process.stderr.write('==========================================================\n\n')

	const mcp = startMcpClient()
	await mcp.init()

	// 1. Catalog the library
	const cat = await mcp.callTool('claudepptx.library.list_xml_groups', { sourcePath: slideXmlPath })
	process.stderr.write(`[wire] ${cat.groupCount} groups in slide21, of which the 5 world maps are:\n`)
	const MAPS = [
		{ name: 'Google Shape;411;p9',  label: 'Political (country borders)', shapeCount: 233 },
		{ name: 'Google Shape;669;p9',  label: 'Simple silhouette',           shapeCount: 6 },
		{ name: 'Google Shape;676;p9',  label: 'Dotted / pixel',              shapeCount: 1572 },
		{ name: 'Google Shape;2249;p9', label: 'Smooth silhouette',           shapeCount: 51 },
		{ name: 'Google Shape;2382;p9', label: 'Polygon mesh',                shapeCount: 588 },
	]
	for (const m of MAPS) {
		const g = cat.groups.find(g => g.name === m.name)
		process.stderr.write(`  ${m.label.padEnd(32)} → ${m.name.padEnd(22)} aspect ${(g.w/g.h).toFixed(2)} · ${g.shapeCount} shapes · ${g.cubicBezTo} cubicBez · ${(g.bytes/1024).toFixed(0)} KB\n`)
	}

	// 2. New deck
	const { deckId } = await mcp.callTool('claudepptx.deck.new', { layout: 'LAYOUT_WIDE', title: 'Library map gallery — verbatim imports' })
	const P = { dark: '0B1026', deep: '11576C', paper: 'F8FAFC', muted: '94A3B8',
		accent: '2066C8', primary: '2AB2B8', secondary: '7CC242', warning: 'F59E0B', danger: 'EF4444' }

	// Cover
	await mcp.callTool('claudepptx.slide.add', { deckId, background: { color: P.dark }, transition: { type: 'fade' } })
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId, slideIndex: 0,
		text: '5 maps · imported VERBATIM from the local library',
		options: { x: 0.5, y: 2.5, w: 12.3, h: 1.2, fontSize: 36, bold: true, color: P.paper, align: 'center' },
	})
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId, slideIndex: 0,
		text: 'library.import_xml_group(slide21.xml, "Google Shape;…;p9", { targetBox, fit:"preserve-aspect" })',
		options: { x: 0.5, y: 3.8, w: 12.3, h: 0.5, fontSize: 13, color: P.secondary, align: 'center', fontFace: 'Consolas' },
	})
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId, slideIndex: 0,
		text: 'Every shape, every cubicBezTo, every coordinate — copied byte-for-byte from the reference deck.',
		options: { x: 0.5, y: 4.5, w: 12.3, h: 0.5, fontSize: 14, color: P.muted, italic: true, align: 'center' },
	})

	// One map per slide, full-bleed with preserve-aspect
	const STAGE = { x: 0.5, y: 1.3, w: 12.3, h: 5.7 }
	for (let i = 0; i < MAPS.length; i++) {
		const m = MAPS[i]
		const slideIndex = i + 1
		process.stderr.write(`\n[wire] slide ${slideIndex + 1} — ${m.label} (${m.name}) …\n`)
		await mcp.callTool('claudepptx.slide.add', {
			deckId, background: { color: P.dark }, transition: { type: 'fade', speed: 'medium' },
		})
		await mcp.callTool('claudepptx.slide.add_text', {
			deckId, slideIndex,
			text: `${i + 1}. ${m.label}`,
			options: { x: 0.5, y: 0.3, w: 12.3, h: 0.7, fontSize: 28, bold: true, color: P.paper },
		})
		await mcp.callTool('claudepptx.slide.add_text', {
			deckId, slideIndex,
			text: m.name,
			options: { x: 0.5, y: 0.95, w: 12.3, h: 0.3, fontSize: 11, color: P.secondary, fontFace: 'Consolas' },
		})
		const imp = await mcp.callTool('claudepptx.library.import_xml_group', {
			deckId, slideIndex,
			sourcePath: slideXmlPath,
			groupName: m.name,
			targetBox: STAGE,
			fit: 'preserve-aspect',
		})
		process.stderr.write(`   imported ${imp.shapesImported} shapes, ${imp.cubicBezTo} cubicBezTo, ${imp.lineTo} lineTo, ${(imp.bytes/1024).toFixed(0)} KB\n`)
		process.stderr.write(`   actual placement: x=${imp.actualTargetBox.x.toFixed(2)} y=${imp.actualTargetBox.y.toFixed(2)} w=${imp.actualTargetBox.w.toFixed(2)} h=${imp.actualTargetBox.h.toFixed(2)} (source aspect ${imp.actualTargetBox.sourceAspect.toFixed(2)})\n`)
	}

	// Slide 7 — political map (group 0) + bloc dots overlay
	const POL_NAME = 'Google Shape;411;p9'
	process.stderr.write(`\n[wire] slide 7 — political map + bloc dots overlay …\n`)
	await mcp.callTool('claudepptx.slide.add', {
		deckId,
		background: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 135,
			gradientStops: [{ position: 0, color: P.dark }, { position: 100, color: P.deep }] },
		transition: { type: 'fade', speed: 'slow' },
	})
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId, slideIndex: 6, text: 'Library map + geojson centroid overlay',
		options: { x: 0.5, y: 0.3, w: 12.3, h: 0.7, fontSize: 26, bold: true, color: P.paper },
	})
	await mcp.callTool('claudepptx.slide.add_text', {
		deckId, slideIndex: 6,
		text: 'Political map = library asset (verbatim). Bloc dots = geojson centroids (synthesised primitive overlay).',
		options: { x: 0.5, y: 0.95, w: 12.3, h: 0.4, fontSize: 12, color: P.secondary, italic: true },
	})
	const polImp = await mcp.callTool('claudepptx.library.import_xml_group', {
		deckId, slideIndex: 6, sourcePath: slideXmlPath, groupName: POL_NAME,
		targetBox: STAGE, fit: 'preserve-aspect',
	})
	process.stderr.write(`   political map → ${polImp.shapesImported} shapes, placed at (${polImp.actualTargetBox.x.toFixed(2)},${polImp.actualTargetBox.y.toFixed(2)}) ${polImp.actualTargetBox.w.toFixed(2)}×${polImp.actualTargetBox.h.toFixed(2)}\n`)

	// Read geojson, overlay bloc dots
	const geo = await mcp.callTool('claudepptx.io.read_file', { path: 'demos/claudepptxmcp-online-assets/maps/natural-earth/ne_110m_admin_0_countries.geojson' })
	const fc = JSON.parse(geo.content)
	const byName = new Map()
	for (const f of fc.features) for (const k of ['NAME','NAME_LONG','NAME_EN','ADMIN']) if (f.properties[k]) byName.set(String(f.properties[k]).toLowerCase(), f)
	function centroid(feat) {
		const rings = []
		if (feat.geometry.type === 'Polygon') rings.push(...feat.geometry.coordinates)
		else if (feat.geometry.type === 'MultiPolygon') for (const p of feat.geometry.coordinates) rings.push(...p)
		let sx = 0, sy = 0, n = 0
		for (const r of rings) for (const [lon, lat] of r) { sx += lon; sy += lat; n++ }
		return n ? [sx / n, sy / n] : null
	}
	const BLOC = {
		natoEU:   { color: P.accent, countries: ['United States of America','United Kingdom','France','Canada','Italy','Germany','Netherlands','Belgium','Norway','Greece','Turkey','Portugal','Spain','Iceland','Denmark','Poland','Hungary','Romania','Bulgaria','Czechia','Slovakia','Lithuania','Latvia','Estonia','Sweden','Finland','Austria','Ireland','Switzerland'] },
		russia:   { color: P.danger, countries: ['Russia','Belarus'] },
		rising:   { color: P.warning, countries: ['China','India','Indonesia','Brazil','South Africa','Mexico','Argentina'] },
		emerging: { color: P.primary, countries: ['Ukraine','Kazakhstan','Uzbekistan','Moldova','Georgia','Armenia','Azerbaijan','Turkmenistan','Tajikistan','Kyrgyzstan','Egypt','Iran','Australia','Japan'] },
	}
	const M = polImp.actualTargetBox
	const lonMin = -180, lonMax = 180, latMin = -57, latMax = 78  // approx for political map projection
	const lonToX = lon => M.x + ((lon - lonMin) / (lonMax - lonMin)) * M.w - 0.07
	const latToY = lat => M.y + ((latMax - lat) / (latMax - latMin)) * M.h - 0.07
	let dots = 0
	for (const bloc of Object.values(BLOC)) for (const cname of bloc.countries) {
		const feat = byName.get(cname.toLowerCase()); if (!feat) continue
		const c = centroid(feat); if (!c) continue
		const x = lonToX(c[0]); const y = latToY(c[1])
		if (x < M.x - 0.2 || y < M.y - 0.2 || x > M.x + M.w || y > M.y + M.h) continue
		await mcp.callTool('claudepptx.slide.add_shape', {
			deckId, slideIndex: 6, shapeName: 'ellipse',
			options: { x, y, w: 0.14, h: 0.14, fill: { color: bloc.color }, line: { color: P.paper, width: 0.5 }, glow: { size: 6, color: bloc.color, opacity: 0.6 } },
		})
		dots++
	}
	process.stderr.write(`   ${dots} bloc dots overlaid on the political map\n`)

	const save = await mcp.callTool('claudepptx.deck.save', { deckId, outputDir, fileName })

	const s = mcp.stats()
	const ms = Date.now() - t0
	process.stderr.write('\n==========================================================\n')
	process.stderr.write(`  GALLERY COMPLETE\n`)
	process.stderr.write('==========================================================\n')
	process.stderr.write(`file       : ${save.filePath}\n`)
	process.stderr.write(`slides     : ${save.slideCount}\n`)
	process.stderr.write(`bytes      : ${save.bytes.toLocaleString()}\n`)
	process.stderr.write(`elapsed    : ${ms} ms\n`)
	process.stderr.write(`wire RPCs  : ${s.totalReq}\n`)
	process.stderr.write('==========================================================\n')
	mcp.close()
	process.stdout.write(JSON.stringify({ ok: true, file: save.filePath, slides: save.slideCount, bytes: save.bytes, wireCalls: s.totalReq, mapsImported: MAPS.length, blocDots: dots }, null, 2) + '\n')
}

main().catch(e => { process.stderr.write(`\n[demo] FATAL: ${e && e.stack || e}\n`); process.exit(1) })
