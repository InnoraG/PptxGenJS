#!/usr/bin/env node
// =============================================================================
//  DEMO — Library-first asset reuse. The right priority order:
//
//    1. UPLOADED  (assets the user attached to the AI chat)        — io.write_file
//    2. LOCAL     (assets already shipped with the MCP)            — fs.find + io.read_*
//                 incl. high-quality vector groups extracted from
//                 the reference deck — pulled in verbatim via
//                 library.list_xml_groups + library.import_xml_group
//    3. ONLINE    (everything else, fetched in-session)            — http.fetch
//    4. SYNTHESISED (last resort — geojson → custGeom, etc.)
//
//  For the world map we use option 2 (LOCAL library) because the reference
//  deck already ships a hand-crafted silhouette world map (Group "Google
//  Shape;669;p9" on slide 21: 6 shapes, 385 cubicBezTo curves, ZERO image
//  rels = safe to passthrough verbatim with rewritten target box).
//
//  Geojson is still demoed alongside, but as bloc-colored OVERLAY DOTS
//  (which is what geojson-derived data is actually good for).
//
//  Every tool call crosses the stdio MCP transport.
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
		const r = await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'demo-library-first', version: '1.0.0' }, capabilities: {} })
		notify('notifications/initialized', {})
		return r
	}
	return { rpc, callTool, init, close: () => { child.stdin.end(); child.kill() }, stats: () => ({ totalReq, totalIn, totalOut }) }
}

// Country centroids for bloc dots
const BLOC = {
	natoEU:   { color: '2066C8', label: 'NATO / EU', countries: ['United States of America','United Kingdom','France','Canada','Italy','Germany','Netherlands','Belgium','Norway','Greece','Turkey','Portugal','Spain','Iceland','Denmark','Poland','Hungary','Romania','Bulgaria','Czechia','Slovakia','Lithuania','Latvia','Estonia','Sweden','Finland','Austria','Ireland','Switzerland'] },
	russia:   { color: 'EF4444', label: 'Russia bloc', countries: ['Russia','Belarus'] },
	rising:   { color: 'F59E0B', label: 'Rising powers', countries: ['China','India','Indonesia','Brazil','South Africa','Mexico','Argentina'] },
	emerging: { color: '2AB2B8', label: 'Emerging / post-Soviet', countries: ['Ukraine','Kazakhstan','Uzbekistan','Moldova','Georgia','Armenia','Azerbaijan','Turkmenistan','Tajikistan','Kyrgyzstan','Egypt','Iran','Australia','Japan'] },
}

async function main() {
	const t0 = Date.now()
	const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
	const outputDir = path.resolve('outputs')
	const fileName = `LibraryFirst_${stamp}.pptx`

	process.stderr.write('==========================================================\n')
	process.stderr.write('  Library-first demo — Upload · Local · Online · (Synth)\n')
	process.stderr.write('==========================================================\n\n')

	const mcp = startMcpClient()
	await mcp.init()

	// ---- 1. UPLOADED — palette from a user-attached logo ----
	const uploadDest = `outputs/uploads/user_logo_${stamp}.png`
	const logoBase64 = fs.readFileSync(path.resolve('outputs/hc-logo.png')).toString('base64')
	await mcp.callTool('betterpptx.io.write_file', { path: uploadDest, content: logoBase64, encoding: 'base64' })
	const pal = await mcp.callTool('betterpptx.image.sample_palette', { imagePath: uploadDest, k: 6 })
	const brand = pal.brandedClusters.slice(0, 3).map(c => c.hex)
	process.stderr.write(`[wire] UPLOADED palette: ${brand.join(' · ')}\n`)
	const P = {
		primary: brand[0] || '2AB2B8', accent: brand[1] || '2066C8', secondary: brand[2] || '7CC242',
		dark: '0B1026', deep: '11576C', paper: 'F8FAFC', muted: '94A3B8',
		warning: 'F59E0B', danger: 'EF4444',
	}

	// ---- 2. LOCAL — discover then import the silhouette world map verbatim ----
	const slideXmlPath = 'decyphered/3d-gradient-style-advertising-agency__5bfa492b82738c36/extracted/slide21.xml'
	process.stderr.write(`\n[wire] LOCAL library — cataloguing groups in ${path.basename(slideXmlPath)} …\n`)
	const groups = await mcp.callTool('betterpptx.library.list_xml_groups', { sourcePath: slideXmlPath })
	process.stderr.write(`[wire]   ${groups.groupCount} top-level groups\n`)
	// Pick the simple silhouette map (small + vector-only, no rels)
	const silhouette = groups.groups.find(g => g.name === 'Google Shape;669;p9')
	process.stderr.write(`[wire]   chose group "${silhouette.name}" — ${silhouette.shapeCount} shapes · ${silhouette.cubicBezTo} cubicBezTo · ${silhouette.bytes} bytes · hasRels=${silhouette.hasRelationships}\n`)

	// ---- 3. ONLINE — fetch a 3D model live ----
	process.stderr.write('\n[wire] ONLINE — http.fetch Khronos GLB …\n')
	const glb = await mcp.callTool('betterpptx.http.fetch', {
		url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Avocado/glTF-Binary/Avocado.glb',
		saveToPath: `outputs/online-fetched/Avocado_${stamp}.glb`,
		responseType: 'base64', timeoutMs: 60000,
	})
	process.stderr.write(`[wire]   ${glb.bytes.toLocaleString()} bytes fetched\n`)

	// ---- 4. SYNTHESISED — geojson read for centroid lookups ----
	process.stderr.write('\n[wire] SYNTHESISED — io.read_file geojson for centroid overlay …\n')
	const geo = await mcp.callTool('betterpptx.io.read_file', { path: 'demos/betterpptx-mcp-online-assets/maps/natural-earth/ne_110m_admin_0_countries.geojson' })
	const fc = JSON.parse(geo.content)
	const byName = new Map()
	for (const f of fc.features) {
		for (const k of ['NAME','NAME_LONG','NAME_EN','ADMIN']) if (f.properties[k]) byName.set(String(f.properties[k]).toLowerCase(), f)
	}
	// Compute centroid for each country (mean of all ring points)
	function centroid(feat) {
		let sx = 0, sy = 0, n = 0
		const rings = []
		if (feat.geometry.type === 'Polygon') rings.push(...feat.geometry.coordinates)
		else if (feat.geometry.type === 'MultiPolygon') for (const p of feat.geometry.coordinates) rings.push(...p)
		for (const r of rings) for (const [lon, lat] of r) { sx += lon; sy += lat; n++ }
		return n ? [sx / n, sy / n] : null
	}
	process.stderr.write(`[wire]   ${fc.features.length} features indexed\n`)

	// ---- Build the deck ----
	const { deckId } = await mcp.callTool('betterpptx.deck.new', { layout: 'LAYOUT_WIDE', title: 'Library-first world map' })
	await mcp.callTool('betterpptx.deck.set_show_settings', { deckId, useTimings: true, mode: 'kiosk', loop: true })

	// ---- Slide 1 — the map, library-imported then bloc-overlaid ----
	process.stderr.write('\n[wire] slide 1 — import silhouette map + overlay bloc dots …\n')
	await mcp.callTool('betterpptx.slide.add', {
		deckId,
		background: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 135,
			gradientStops: [{ position: 0, color: P.dark }, { position: 100, color: P.deep }] },
		transition: { type: 'fade', speed: 'slow' },
	})
	// Title
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: 0, text: 'Geopolitical blocs · 2024',
		options: { x: 0.4, y: 0.3, w: 12.5, h: 0.7, fontSize: 28, bold: true, color: P.paper, fontFace: 'Segoe UI' },
	})
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: 0,
		text: 'World map = library asset (slide21 / "Google Shape;669;p9", imported verbatim) · dots = geojson centroids',
		options: { x: 0.4, y: 0.95, w: 12.5, h: 0.45, fontSize: 12, color: P.secondary, italic: true, fontFace: 'Consolas' },
	})

	// MAP — import the library group, repositioned to fill a target box
	const MAP = { x: 0.5, y: 1.6, w: 12.3, h: 5.2 }
	const imp = await mcp.callTool('betterpptx.library.import_xml_group', {
		deckId, slideIndex: 0,
		sourcePath: slideXmlPath,
		groupName: 'Google Shape;669;p9',
		targetBox: MAP,
	})
	process.stderr.write(`[wire]   imported "${imp.importedGroup}" → ${imp.shapesImported} shapes, ${imp.cubicBezTo} cubicBezTo, ${imp.bytes.toLocaleString()} bytes\n`)

	// Find geographic bounds of THIS specific library map. The silhouette uses
	// a simplified lat/lon projection — we measure it empirically by reading
	// the geojson centroid of two well-known anchors (USA, Japan) and assuming
	// equirectangular fit inside MAP. For the demo we just use globe bounds.
	const lonMin = -180, lonMax = 180, latMin = -55, latMax = 75
	function lonToX(lon) { return MAP.x + ((lon - lonMin) / (lonMax - lonMin)) * MAP.w }
	function latToY(lat) { return MAP.y + ((latMax - lat) / (latMax - latMin)) * MAP.h }

	// Overlay bloc dots at country centroids
	let dotsDrawn = 0, dotsMissed = 0
	for (const [blocKey, bloc] of Object.entries(BLOC)) {
		for (const cname of bloc.countries) {
			const feat = byName.get(cname.toLowerCase())
			if (!feat) { dotsMissed++; continue }
			const c = centroid(feat); if (!c) { dotsMissed++; continue }
			const x = lonToX(c[0]) - 0.07
			const y = latToY(c[1]) - 0.07
			// Skip dots that fall outside the map box
			if (x < MAP.x - 0.2 || y < MAP.y - 0.2 || x > MAP.x + MAP.w || y > MAP.y + MAP.h) { dotsMissed++; continue }
			await mcp.callTool('betterpptx.slide.add_shape', {
				deckId, slideIndex: 0, shapeName: 'ellipse',
				options: { x, y, w: 0.14, h: 0.14,
					fill: { color: bloc.color },
					line: { color: P.paper, width: 0.5 },
					glow: { size: 6, color: bloc.color, opacity: 0.6 } },
			})
			dotsDrawn++
		}
	}
	process.stderr.write(`[wire]   ${dotsDrawn} bloc dots overlaid (${dotsMissed} skipped)\n`)

	// Legend
	let lx = 0.4
	for (const bloc of Object.values(BLOC)) {
		await mcp.callTool('betterpptx.slide.add_shape', {
			deckId, slideIndex: 0, shapeName: 'ellipse',
			options: { x: lx, y: 7.05, w: 0.2, h: 0.2,
				fill: { color: bloc.color }, line: { color: P.paper, width: 0.5 } },
		})
		await mcp.callTool('betterpptx.slide.add_text', {
			deckId, slideIndex: 0, text: bloc.label,
			options: { x: lx + 0.3, y: 7.03, w: 2.6, h: 0.3, fontSize: 13, color: P.paper, fontFace: 'Segoe UI' },
		})
		lx += 3.0
	}
	// Logo top-right
	await mcp.callTool('betterpptx.slide.add_image', {
		deckId, slideIndex: 0, options: { path: uploadDest, x: 11.7, y: 0.2, w: 1.2, h: 1.2 },
	})

	// ---- Slide 2 — provenance ----
	await mcp.callTool('betterpptx.slide.add', { deckId,
		background: { color: P.dark },
		transition: { type: 'fade', speed: 'medium' },
	})
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: 1, text: 'Where every asset came from',
		options: { x: 0.4, y: 0.3, w: 12.5, h: 0.7, fontSize: 28, bold: true, color: P.paper },
	})
	const provenance = [
		{ k: 'UPLOADED  ', v: `${uploadDest} → image.sample_palette → ${brand.join(' · ')}`, c: P.warning },
		{ k: 'LOCAL     ', v: `library.import_xml_group("${imp.importedGroup}", ${imp.shapesImported} shapes, ${imp.bytes.toLocaleString()} bytes)`, c: P.primary },
		{ k: 'ONLINE    ', v: `http.fetch(Khronos Avocado.glb) → ${(glb.bytes / 1024 / 1024).toFixed(2)} MB → ${glb.savedTo.replace(process.cwd() + path.sep, '')}`, c: P.accent },
		{ k: 'SYNTHESISD', v: `${fc.features.length} geojson features → centroid dots overlaid`, c: P.secondary },
	]
	for (let i = 0; i < provenance.length; i++) {
		const e = provenance[i]
		await mcp.callTool('betterpptx.slide.add_text', {
			deckId, slideIndex: 1, text: e.k,
			options: { x: 0.5, y: 1.2 + i * 0.8, w: 1.8, h: 0.6, fontSize: 16, bold: true, color: e.c, fontFace: 'Consolas' },
		})
		await mcp.callTool('betterpptx.slide.add_text', {
			deckId, slideIndex: 1, text: e.v,
			options: { x: 2.4, y: 1.2 + i * 0.8, w: 10.5, h: 0.6, fontSize: 13, color: P.paper, fontFace: 'Consolas' },
		})
	}
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: 1,
		text: 'No domain-specific tools — same primitives compose every asset source',
		options: { x: 0.4, y: 5.0, w: 12.5, h: 0.5, fontSize: 14, color: P.muted, italic: true, align: 'center' },
	})

	// Embed the online GLB on the same slide as proof
	await mcp.callTool('betterpptx.slide.add_model3d', {
		deckId, slideIndex: 1,
		options: {
			glbFile: glb.savedTo, x: 5.0, y: 5.4, w: 3.3, h: 1.6,
			shadow: { type: 'outer', color: '000000', opacity: 0.4, blur: 16, offset: 4, angle: 90 },
		},
	})

	// Save
	const save = await mcp.callTool('betterpptx.deck.save', { deckId, outputDir, fileName })

	const ms = Date.now() - t0
	const s = mcp.stats()
	process.stderr.write('\n==========================================================\n')
	process.stderr.write('  DEMO COMPLETE — library-first asset reuse\n')
	process.stderr.write('==========================================================\n')
	process.stderr.write(`file              : ${save.filePath}\n`)
	process.stderr.write(`bytes             : ${save.bytes.toLocaleString()}\n`)
	process.stderr.write(`slides            : ${save.slideCount}\n`)
	process.stderr.write(`library import    : "${imp.importedGroup}" · ${imp.shapesImported} shapes · ${imp.cubicBezTo} cubicBezTo\n`)
	process.stderr.write(`bloc dots         : ${dotsDrawn} overlaid\n`)
	process.stderr.write(`online bytes      : ${(glb.bytes / 1024 / 1024).toFixed(2)} MB\n`)
	process.stderr.write(`elapsed           : ${ms} ms\n`)
	process.stderr.write(`wire RPCs         : ${s.totalReq}\n`)
	process.stderr.write('==========================================================\n')
	mcp.close()
	process.stdout.write(JSON.stringify({ ok: true, file: save.filePath, slides: save.slideCount, bytes: save.bytes, wireCalls: s.totalReq, librarySource: imp.importedGroup, libraryShapes: imp.shapesImported, blocDots: dotsDrawn, onlineMB: glb.bytes / 1024 / 1024 }, null, 2) + '\n')
}

main().catch(e => { process.stderr.write(`\n[demo] FATAL: ${e && e.stack || e}\n`); process.exit(1) })
