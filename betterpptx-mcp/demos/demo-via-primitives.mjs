#!/usr/bin/env node
// =============================================================================
// PROOF — rebuild a world-map evolution deck using ONLY generic primitives.
//
//   Tools the MCP exposes that this demo uses:
//     - betterpptx.io.read_file              (load any geojson)
//     - betterpptx.image.sample_palette      (palette from any image)
//     - betterpptx.geometry.polygon_to_custgeom  (polygon → custGeom points)
//     - betterpptx.deck.new / set_show_settings
//     - betterpptx.slide.add / add_text / add_shape / add_image / add_freeform
//     - betterpptx.deck.autoplay / validate / save
//
//   Things the MCP does NOT provide (and never should):
//     × geo.country_outline    (countries are a domain concept)
//     × geo.list_countries
//     × theme.apply_preset
//     × slide.add_morph_pair
//     × demo.build_showcase
//
//   The AI client (this script) is responsible for ALL domain reasoning:
//   reading geojson, choosing which countries to draw, picking bloc colours,
//   composing transitions, building the morph pair. The MCP is a generic
//   PowerPoint+IO+Geometry toolbelt — every prompt composes the SAME tools.
//
//   Every call crosses the stdio MCP transport.
// =============================================================================

import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI_PATH = path.resolve(__dirname, '..', 'cli.mjs')

// ---------- stdio MCP client (same pattern as before) -----------------------
function startMcpClient() {
	const child = spawn(process.execPath, [CLI_PATH], { stdio: ['pipe', 'pipe', 'pipe'] })
	const pending = new Map()
	let nextId = 1, rxBuf = Buffer.alloc(0)
	let totalReq = 0, totalIn = 0, totalOut = 0
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
		const r = await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'demo-via-primitives', version: '1.0.0' }, capabilities: {} })
		notify('notifications/initialized', {})
		return r
	}
	return { rpc, callTool, init, close: () => { child.stdin.end(); child.kill() }, stats: () => ({ totalReq, totalIn, totalOut }) }
}

// ---------- domain knowledge — lives in the CLIENT, not in the MCP ----------
const ERAS = [
	{ year: '1945', title: 'After the Great War', subtitle: 'Allies, Axis, and the Soviet sphere',
		blocs: { allies: ['United States of America','United Kingdom','France','Canada','Australia','India','Brazil','Mexico','South Africa','Egypt','Argentina','Norway','Netherlands','Belgium','Greece','China','Indonesia'],
			ussr: ['Russia','Ukraine','Belarus','Kazakhstan','Uzbekistan','Lithuania','Latvia','Estonia','Moldova','Georgia','Armenia','Azerbaijan','Turkmenistan','Tajikistan','Kyrgyzstan'],
			axis: ['Germany','Italy','Japan','Austria','Hungary','Romania','Bulgaria'],
			neutral: ['Switzerland','Spain','Portugal','Ireland','Sweden','Turkey','Iran'] } },
	{ year: '1955', title: 'Cold War crystalises', subtitle: 'NATO vs Warsaw Pact',
		blocs: { nato: ['United States of America','United Kingdom','France','Canada','Italy','Germany','Netherlands','Belgium','Norway','Greece','Turkey','Portugal'],
			ussr: ['Russia','Ukraine','Belarus','Kazakhstan','Uzbekistan','Lithuania','Latvia','Estonia','Moldova','Georgia','Armenia','Azerbaijan','Turkmenistan','Tajikistan','Kyrgyzstan'],
			warsaw: ['Poland','Hungary','Romania','Bulgaria','Czechia','Slovakia'],
			nonAligned: ['India','Indonesia','Egypt','Brazil','Argentina','Mexico','South Africa','Iran','China','Australia','Japan'],
			neutral: ['Switzerland','Spain','Sweden','Ireland','Finland','Austria'] } },
	{ year: '1989', title: 'The wall comes down', subtitle: 'The Soviet sphere unravels',
		blocs: { nato: ['United States of America','United Kingdom','France','Canada','Italy','Germany','Netherlands','Belgium','Norway','Greece','Turkey','Portugal','Spain','Iceland','Denmark'],
			ussr: ['Russia','Ukraine','Belarus','Kazakhstan','Uzbekistan','Lithuania','Latvia','Estonia','Moldova','Georgia','Armenia','Azerbaijan','Turkmenistan','Tajikistan','Kyrgyzstan'],
			warsaw: ['Poland','Hungary','Romania','Bulgaria','Czechia','Slovakia'],
			nonAligned: ['India','Indonesia','Egypt','Brazil','Argentina','Mexico','South Africa','China','Australia','Japan'],
			neutral: ['Switzerland','Sweden','Ireland','Finland','Austria','Iran'] } },
	{ year: '1991', title: 'USSR dissolves', subtitle: '15 republics become independent',
		blocs: { nato: ['United States of America','United Kingdom','France','Canada','Italy','Germany','Netherlands','Belgium','Norway','Greece','Turkey','Portugal','Spain','Iceland','Denmark'],
			postSoviet: ['Russia','Ukraine','Belarus','Kazakhstan','Uzbekistan','Lithuania','Latvia','Estonia','Moldova','Georgia','Armenia','Azerbaijan','Turkmenistan','Tajikistan','Kyrgyzstan'],
			postWarsaw: ['Poland','Hungary','Romania','Bulgaria','Czechia','Slovakia'],
			nonAligned: ['India','Indonesia','Egypt','Brazil','Argentina','Mexico','South Africa','China','Australia','Japan'],
			neutral: ['Switzerland','Sweden','Ireland','Finland','Austria','Iran'] } },
	{ year: '2004', title: 'EU expands eastward', subtitle: 'Former Warsaw Pact joins',
		blocs: { natoEU: ['United States of America','United Kingdom','France','Canada','Italy','Germany','Netherlands','Belgium','Norway','Greece','Turkey','Portugal','Spain','Iceland','Denmark','Poland','Hungary','Romania','Bulgaria','Czechia','Slovakia','Lithuania','Latvia','Estonia','Sweden','Finland','Austria'],
			russia: ['Russia','Belarus'],
			postSoviet: ['Ukraine','Kazakhstan','Uzbekistan','Moldova','Georgia','Armenia','Azerbaijan','Turkmenistan','Tajikistan','Kyrgyzstan'],
			nonAligned: ['India','Indonesia','Egypt','Brazil','Argentina','Mexico','South Africa','China','Australia','Japan','Iran'],
			neutral: ['Switzerland','Ireland'] } },
	{ year: '2024', title: 'Today', subtitle: 'A multipolar world',
		blocs: { natoEU: ['United States of America','United Kingdom','France','Canada','Italy','Germany','Netherlands','Belgium','Norway','Greece','Turkey','Portugal','Spain','Iceland','Denmark','Poland','Hungary','Romania','Bulgaria','Czechia','Slovakia','Lithuania','Latvia','Estonia','Sweden','Finland','Austria'],
			russia: ['Russia','Belarus'],
			postSoviet: ['Ukraine','Kazakhstan','Uzbekistan','Moldova','Georgia','Armenia','Azerbaijan','Turkmenistan','Tajikistan','Kyrgyzstan'],
			rising: ['China','India','Indonesia','Brazil','South Africa'],
			nonAligned: ['Egypt','Mexico','Argentina','Australia','Japan','Iran'],
			neutral: ['Switzerland','Ireland'] } },
]
const ALL_COUNTRIES = Array.from(new Set(ERAS.flatMap(e => Object.values(e.blocs).flat())))

// World projection (defined by THIS CLIENT — the MCP does no projection)
const MAP_X = 0.4, MAP_Y = 1.55, MAP_W = 12.5, MAP_H = 5.4
const LON_MIN = -180, LON_MAX = 180, LAT_MIN = -60, LAT_MAX = 80
const lonToX = lon => MAP_X + ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * MAP_W
const latToY = lat => MAP_Y + ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * MAP_H

// --------- main pipeline ---------------------------------------------------
async function main() {
	const t0 = Date.now()
	const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
	const logoPath = path.resolve('outputs/hc-logo.png')
	const geojsonPath = path.resolve('demos/betterpptx-mcp-online-assets/maps/natural-earth/ne_110m_admin_0_countries.geojson')
	const outputDir = path.resolve('outputs')
	const fileName = `Worldmap_via_Primitives_${stamp}.pptx`

	process.stderr.write('==========================================================\n')
	process.stderr.write('  WORLD-MAP DEMO — built from generic MCP primitives only\n')
	process.stderr.write('==========================================================\n\n')

	const mcp = startMcpClient()
	const init = await mcp.init()
	process.stderr.write(`[wire] handshake OK — server ${init.serverInfo.name} v${init.serverInfo.version}\n`)

	// STEP 1: Load the world geojson via the GENERIC io.read_file primitive.
	process.stderr.write('\n[wire] io.read_file: load Natural Earth geojson over MCP …\n')
	const geoFile = await mcp.callTool('betterpptx.io.read_file', { path: geojsonPath })
	process.stderr.write(`[wire]   ${geoFile.bytes.toLocaleString()} bytes\n`)

	// STEP 2: Parse JSON in the CLIENT. Build a country lookup.
	const fc = JSON.parse(geoFile.content)
	const byName = new Map()
	for (const f of fc.features) {
		for (const k of ['NAME', 'NAME_LONG', 'NAME_EN', 'ADMIN']) {
			if (f.properties[k]) byName.set(String(f.properties[k]).toLowerCase(), f)
		}
	}
	process.stderr.write(`[wire]   indexed ${byName.size} country features\n`)

	// STEP 3: Sample a palette from the logo via the GENERIC image.sample_palette primitive.
	process.stderr.write('\n[wire] image.sample_palette: pull dominant colours from logo …\n')
	const pal = await mcp.callTool('betterpptx.image.sample_palette', { imagePath: logoPath, k: 6 })
	const brand = pal.brandedClusters.slice(0, 3).map(c => c.hex)
	process.stderr.write(`[wire]   branded hexes: ${brand.join(' · ')}\n`)

	// The CLIENT decides which cluster maps to which semantic slot — the MCP doesn't dictate
	const P = {
		primary: brand[0] || '2AB2B8',
		accent: brand[1] || '2066C8',
		secondary: brand[2] || '7CC242',
		dark: '0B1026', deep: '11576C', paper: 'F8FAFC', muted: '94A3B8',
		warning: 'F59E0B', danger: 'EF4444',
	}
	const BLOC_COLOR = {
		allies: P.accent, nato: P.accent, natoEU: P.accent,
		ussr: P.danger, warsaw: P.danger, russia: P.danger,
		axis: P.deep,
		postSoviet: P.primary, postWarsaw: P.secondary,
		nonAligned: P.warning, neutral: P.muted, rising: P.warning,
	}

	// STEP 4: For each country, ask the MCP for its custGeom via the GENERIC
	//   geometry.polygon_to_custgeom primitive. The MCP doesn't know it's a
	//   "country" — it just gets rings of [lon, lat] pairs.
	process.stderr.write('\n[wire] geometry.polygon_to_custgeom: project each country to custGeom …\n')
	const outlines = {}
	let ok = 0, miss = 0
	for (const name of ALL_COUNTRIES) {
		const feat = byName.get(name.toLowerCase())
		if (!feat) { miss++; continue }
		const rings = []
		if (feat.geometry.type === 'Polygon') rings.push(...feat.geometry.coordinates)
		else if (feat.geometry.type === 'MultiPolygon') for (const poly of feat.geometry.coordinates) rings.push(...poly)
		if (rings.length === 0) { miss++; continue }
		try {
			const r = await mcp.callTool('betterpptx.geometry.polygon_to_custgeom', {
				rings, w: 4, h: 3, projection: 'equirectangular', maxPointsPerRing: 24, fit: 'preserve-aspect', flipY: true,
			})
			outlines[name] = { points: r.points, srcBBox: r.sourceBBox }
			ok++
		} catch (_) { miss++ }
	}
	process.stderr.write(`[wire]   ${ok} OK, ${miss} missed\n`)

	// STEP 5: Build the deck. Standard slide primitives only.
	process.stderr.write('\n[wire] deck.new + slides …\n')
	const { deckId } = await mcp.callTool('betterpptx.deck.new', {
		layout: 'LAYOUT_WIDE',
		title: 'World map · built from primitives',
		author: 'betterpptx-mcp',
	})
	await mcp.callTool('betterpptx.deck.set_show_settings', { deckId, useTimings: true, mode: 'kiosk', loop: true })

	// Cover
	await mcp.callTool('betterpptx.slide.add', {
		deckId,
		background: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 135,
			gradientStops: [{ position: 0, color: P.dark }, { position: 100, color: P.deep }] },
		transition: { type: 'fade', speed: 'slow' },
	})
	await mcp.callTool('betterpptx.slide.add_image', { deckId, slideIndex: 0, options: { path: logoPath, x: 5.66, y: 0.6, w: 2.0, h: 2.0 } })
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: 0, text: 'Map of the world since WW2',
		options: { x: 0.5, y: 3.0, w: 12.3, h: 1.4, fontSize: 52, bold: true, color: 'FFFFFF', align: 'center',
			text3D: { bevel: { type: 'circle', width: 4, height: 4 }, extrusion: 8, extrusionColor: P.primary, material: 'metal', lightRig: 'threePt', rotationX: 8 },
			glow: { size: 14, color: P.primary, opacity: 0.7 } },
	})
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: 0, text: 'Built entirely from generic MCP primitives — io · image · geometry · slide.* · deck.*',
		options: { x: 0.5, y: 4.6, w: 12.3, h: 0.6, fontSize: 16, color: P.secondary, align: 'center', italic: true },
	})

	// Era slides — same code drives every era
	for (let ei = 0; ei < ERAS.length; ei++) {
		const era = ERAS[ei], si = ei + 1
		process.stderr.write(`  ${era.year} · ${era.title}\n`)
		await mcp.callTool('betterpptx.slide.add', {
			deckId,
			background: { color: P.dark },
			transition: ei === 0 ? { type: 'wipe', direction: 'r', speed: 'slow' } : { type: 'morph', option: 'byObject', speed: 'slow' },
		})
		// year / title / subtitle / logo — all via standard slide primitives
		await mcp.callTool('betterpptx.slide.add_text', { deckId, slideIndex: si, text: era.year,
			options: { x: 0.4, y: 0.25, w: 2.4, h: 1.0, fontSize: 56, bold: true, color: P.paper,
				text3D: { bevel: { type: 'circle', width: 3, height: 3 }, extrusion: 4, material: 'metal', lightRig: 'threePt' },
				objectName: 'era_year' } })
		await mcp.callTool('betterpptx.slide.add_text', { deckId, slideIndex: si, text: era.title,
			options: { x: 2.8, y: 0.35, w: 8.0, h: 0.7, fontSize: 28, bold: true, color: P.paper, objectName: 'era_title' } })
		await mcp.callTool('betterpptx.slide.add_text', { deckId, slideIndex: si, text: era.subtitle,
			options: { x: 2.8, y: 1.0, w: 8.0, h: 0.5, fontSize: 14, color: P.secondary, italic: true, objectName: 'era_subtitle' } })
		await mcp.callTool('betterpptx.slide.add_image', { deckId, slideIndex: si,
			options: { path: logoPath, x: 11.7, y: 0.2, w: 1.2, h: 1.2, objectName: 'brand_logo' } })
		// Map backdrop (gradient rect)
		await mcp.callTool('betterpptx.slide.add_shape', { deckId, slideIndex: si, shapeName: 'rect',
			options: { x: MAP_X, y: MAP_Y, w: MAP_W, h: MAP_H,
				fill: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 90,
					gradientStops: [{ position: 0, color: P.deep }, { position: 100, color: P.dark }] },
				line: { color: P.muted, width: 0.5 }, objectName: 'map_backdrop' } })

		// Country shapes — each one a freeform from the custGeom points we already computed
		const countryBloc = {}
		for (const [b, members] of Object.entries(era.blocs)) for (const c of members) countryBloc[c] = b
		let placed = 0
		for (const name of ALL_COUNTRIES) {
			const o = outlines[name]; if (!o) continue
			const bb = o.srcBBox
			const x0 = lonToX(bb.minX), x1 = lonToX(bb.maxX)
			const y0 = latToY(bb.maxY), y1 = latToY(bb.minY)
			const x = x0, y = y0, w = x1 - x0, h = y1 - y0
			if (w <= 0 || h <= 0 || x < MAP_X - 0.5 || y < MAP_Y - 0.5 || x + w > MAP_X + MAP_W + 0.5 || y + h > MAP_Y + MAP_H + 0.5) continue
			// rescale points (which were fit to 4×3) to the actual w×h
			const scaled = o.points.map(p => p.close ? p : ({ ...p, x: p.x * (w / 4), y: p.y * (h / 3) }))
			const bloc = countryBloc[name]
			const color = bloc ? BLOC_COLOR[bloc] || P.muted : P.muted
			await mcp.callTool('betterpptx.slide.add_freeform', {
				deckId, slideIndex: si,
				x, y, w, h, points: scaled,
				fill: { color, transparency: bloc ? 5 : 35 },
				line: { color: P.paper, width: 0.4 },
				objectName: `country_${name.replace(/[^A-Za-z]+/g, '_')}`,
			})
			placed++
		}

		// Legend chips
		let lx = 0.5
		for (const bn of Object.keys(era.blocs)) {
			await mcp.callTool('betterpptx.slide.add_shape', { deckId, slideIndex: si, shapeName: 'roundRect',
				options: { x: lx, y: 7.05, w: 0.3, h: 0.3, rectRadius: 0.05,
					fill: { color: BLOC_COLOR[bn] || P.muted }, line: { type: 'none' } } })
			await mcp.callTool('betterpptx.slide.add_text', { deckId, slideIndex: si, text: bn,
				options: { x: lx + 0.35, y: 7.05, w: 2.0, h: 0.3, fontSize: 12, color: P.paper, fontFace: 'Consolas' } })
			lx += 2.0
		}
	}

	// Closing slide
	const finIdx = ERAS.length + 1
	await mcp.callTool('betterpptx.slide.add', {
		deckId,
		background: { type: 'gradient', gradientDirection: 'circle',
			gradientStops: [{ position: 0, color: P.deep }, { position: 100, color: P.dark }] },
		transition: { type: 'morph', option: 'byObject' },
	})
	await mcp.callTool('betterpptx.slide.add_image', { deckId, slideIndex: finIdx, options: { path: logoPath, x: 5.66, y: 0.8, w: 2.0, h: 2.0 } })
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: finIdx, text: 'Built from primitives',
		options: { x: 0.5, y: 3.3, w: 12.3, h: 1.2, fontSize: 44, bold: true, color: 'FFFFFF', align: 'center',
			text3D: { bevel: { type: 'circle', width: 4, height: 4 }, extrusion: 8, extrusionColor: P.primary, material: 'metal', lightRig: 'threePt' },
			glow: { size: 14, color: P.primary, opacity: 0.7 } },
	})
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: finIdx,
		text: `${ok} countries · ${ERAS.length} eras · morph transitions · palette sampled from a logo`,
		options: { x: 0.5, y: 4.7, w: 12.3, h: 0.6, fontSize: 18, color: P.secondary, italic: true, align: 'center' },
	})
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: finIdx,
		text: 'io.read_file · image.sample_palette · geometry.polygon_to_custgeom · slide.add_freeform · slide.add_shape · slide.add_text · slide.add_image · deck.autoplay',
		options: { x: 0.5, y: 5.5, w: 12.3, h: 0.5, fontSize: 12, color: P.warning, align: 'center', fontFace: 'Consolas' },
	})

	// Autoplay
	await mcp.callTool('betterpptx.deck.autoplay', { deckId, secondsPerSlide: 6, loop: true, mode: 'kiosk', defaultTransition: { type: 'morph', option: 'byObject', speed: 'slow' } })

	// Save
	const save = await mcp.callTool('betterpptx.deck.save', { deckId, outputDir, fileName })

	const ms = Date.now() - t0
	const s = mcp.stats()
	process.stderr.write('\n==========================================================\n')
	process.stderr.write(`  DEMO COMPLETE — built from PRIMITIVES only\n`)
	process.stderr.write('==========================================================\n')
	process.stderr.write(`file       : ${save.filePath}\n`)
	process.stderr.write(`bytes      : ${save.bytes.toLocaleString()}\n`)
	process.stderr.write(`slides     : ${save.slideCount}\n`)
	process.stderr.write(`elapsed    : ${ms} ms\n`)
	process.stderr.write(`wire calls : ${s.totalReq} RPCs over stdio\n`)
	process.stderr.write(`wire bytes : ${s.totalOut.toLocaleString()} sent / ${s.totalIn.toLocaleString()} received\n`)
	process.stderr.write('==========================================================\n')
	mcp.close()
	process.stdout.write(JSON.stringify({ ok: true, demo: 'worldmap-via-primitives', file: save.filePath, slides: save.slideCount, bytes: save.bytes, wireCalls: s.totalReq }, null, 2) + '\n')
}

main().catch(e => { process.stderr.write(`\n[demo] FATAL: ${e && e.stack || e}\n`); process.exit(1) })
