#!/usr/bin/env node
// =============================================================================
//  PROOF — REAL world map using the new Catmull-Rom Bezier smoothing.
//
//   Differences vs the previous "potato" attempt:
//     • Source: 50m geojson (3-4× the detail of 110m)
//     • polygon_to_custgeom with smoothing:'catmull-rom' → emits cubicBezTo
//       curves through the source points (the technique the reference deck
//       uses to make 3,000+ smooth curves per slide).
//     • projectInto shared coordinate system for perfect alignment.
//
//   All three asset sources still in play: LOCAL geojson, UPLOADED brand
//   palette, ONLINE-fetched Khronos GLB.
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
		const r = await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'demo-smooth-worldmap', version: '1.0.0' }, capabilities: {} })
		notify('notifications/initialized', {})
		return r
	}
	return { rpc, callTool, init, close: () => { child.stdin.end(); child.kill() }, stats: () => ({ totalReq, totalIn, totalOut }) }
}

const MAP = { x: 0.4, y: 1.55, w: 12.5, h: 5.4 }
const BOUNDS = { lonMin: -180, lonMax: 180, latMin: -60, latMax: 80 }

async function main() {
	const t0 = Date.now()
	const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
	const outputDir = path.resolve('outputs')
	const fileName = `SmoothWorldmap_via_MCP_${stamp}.pptx`

	process.stderr.write('==========================================================\n')
	process.stderr.write('  Smooth world map — Catmull-Rom Bezier + 50m geojson\n')
	process.stderr.write('==========================================================\n\n')

	const mcp = startMcpClient()
	await mcp.init()

	// Inventory: what does the MCP say is available?
	const cap = await mcp.callTool('betterpptx.help.capabilities', {})
	const geojsonFiles = cap.assetSources.local.maps_geojson.files || []
	process.stderr.write(`[wire] local geojson files: ${geojsonFiles.join(', ')}\n`)
	const has50m = geojsonFiles.includes('ne_50m_admin_0_countries.geojson')

	// LOCAL — use the higher-detail 50m boundary set
	const geoPath = 'demos/betterpptx-mcp-online-assets/maps/natural-earth/' +
		(has50m ? 'ne_50m_admin_0_countries.geojson' : 'ne_110m_admin_0_countries.geojson')
	process.stderr.write(`[wire] using ${geoPath}\n`)
	const geo = await mcp.callTool('betterpptx.io.read_file', { path: geoPath })
	const fc = JSON.parse(geo.content)
	process.stderr.write(`[wire] geojson ${(geo.bytes / 1024).toFixed(0)} KB · ${fc.features.length} features\n`)

	// UPLOADED palette (round-tripped from the HC logo for the demo)
	const sourceLogo = path.resolve('outputs/hc-logo.png')
	const uploadDest = `outputs/uploads/user_logo_smooth_${stamp}.png`
	const logoBase64 = fs.readFileSync(sourceLogo).toString('base64')
	await mcp.callTool('betterpptx.io.write_file', { path: uploadDest, content: logoBase64, encoding: 'base64' })
	const pal = await mcp.callTool('betterpptx.image.sample_palette', { imagePath: uploadDest, k: 6 })
	const brand = pal.brandedClusters.slice(0, 3).map(c => c.hex)
	const P = {
		primary: brand[0] || '2AB2B8', accent: brand[1] || '2066C8', secondary: brand[2] || '7CC242',
		dark: '0B1026', deep: '11576C', paper: 'F8FAFC', muted: '94A3B8',
		warning: 'F59E0B', danger: 'EF4444',
	}

	// Pick countries by bloc
	const COUNTRIES = {
		natoEU:  ['United States of America','United Kingdom','France','Canada','Italy','Germany','Netherlands','Belgium','Norway','Greece','Turkey','Portugal','Spain','Iceland','Denmark','Poland','Hungary','Romania','Bulgaria','Czechia','Slovakia','Lithuania','Latvia','Estonia','Sweden','Finland','Austria','Ireland','Switzerland'],
		russia:  ['Russia','Belarus'],
		rising:  ['China','India','Indonesia','Brazil','South Africa','Mexico','Argentina'],
		emerging:['Ukraine','Kazakhstan','Uzbekistan','Moldova','Georgia','Armenia','Azerbaijan','Turkmenistan','Tajikistan','Kyrgyzstan','Egypt','Iran','Australia','Japan'],
	}
	const ALL = Object.values(COUNTRIES).flat()
	const BLOC_COLOR = { natoEU: P.accent, russia: P.danger, rising: P.warning, emerging: P.primary }

	// Index features by various name keys
	const byName = new Map()
	for (const f of fc.features) {
		for (const k of ['NAME', 'NAME_LONG', 'NAME_EN', 'ADMIN', 'SOVEREIGNT']) {
			if (f.properties[k]) byName.set(String(f.properties[k]).toLowerCase(), f)
		}
	}

	// Build deck
	const { deckId } = await mcp.callTool('betterpptx.deck.new', {
		layout: 'LAYOUT_WIDE',
		title: 'Smooth world map · Catmull-Rom Bezier',
	})
	await mcp.callTool('betterpptx.deck.set_show_settings', { deckId, useTimings: true, mode: 'kiosk', loop: true })

	// Slide — the smooth world map
	await mcp.callTool('betterpptx.slide.add', {
		deckId, background: { color: P.dark },
		transition: { type: 'fade', speed: 'medium' },
	})
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: 0,
		text: `World map · ${has50m ? '50m' : '110m'} geojson · Catmull-Rom Bezier smoothing`,
		options: { x: 0.4, y: 0.3, w: 12.5, h: 0.6, fontSize: 22, bold: true, color: P.paper },
	})
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: 0,
		text: 'geometry.polygon_to_custgeom { projectInto, smoothing: "catmull-rom" } → cubicBezTo curves through source points',
		options: { x: 0.4, y: 0.85, w: 12.5, h: 0.45, fontSize: 11, color: P.secondary, italic: true, fontFace: 'Consolas' },
	})

	// Map backdrop
	await mcp.callTool('betterpptx.slide.add_shape', {
		deckId, slideIndex: 0, shapeName: 'rect',
		options: { x: MAP.x, y: MAP.y, w: MAP.w, h: MAP.h,
			fill: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 90,
				gradientStops: [{ position: 0, color: P.deep }, { position: 100, color: P.dark }] },
			line: { color: P.muted, width: 0.5 } },
	})

	const countryBloc = {}
	for (const [bloc, names] of Object.entries(COUNTRIES)) for (const c of names) countryBloc[c] = bloc

	let placed = 0, miss = 0
	let totalSourcePts = 0, totalCustGeomPts = 0
	for (const name of ALL) {
		const feat = byName.get(name.toLowerCase())
		if (!feat) { miss++; continue }
		const rings = []
		if (feat.geometry.type === 'Polygon') rings.push(...feat.geometry.coordinates)
		else if (feat.geometry.type === 'MultiPolygon') for (const poly of feat.geometry.coordinates) rings.push(...poly)
		if (rings.length === 0) { miss++; continue }
		for (const r of rings) totalSourcePts += r.length

		const out = await mcp.callTool('betterpptx.geometry.polygon_to_custgeom', {
			rings,
			projectInto: {
				sourceBounds: { minX: BOUNDS.lonMin, maxX: BOUNDS.lonMax, minY: BOUNDS.latMin, maxY: BOUNDS.latMax },
				targetBox:    { x: MAP.x, y: MAP.y, w: MAP.w, h: MAP.h },
			},
			maxPointsPerRing: 60,           // 60 source samples per ring
			smoothing: 'catmull-rom',       // each segment becomes a cubicBezTo
			flipY: true,
		})
		totalCustGeomPts += out.points.length
		const bb = out.shapeBBox
		if (!bb || bb.w <= 0.0001 || bb.h <= 0.0001) { miss++; continue }
		const bloc = countryBloc[name]
		const color = bloc ? BLOC_COLOR[bloc] || P.muted : P.muted
		await mcp.callTool('betterpptx.slide.add_freeform', {
			deckId, slideIndex: 0,
			x: bb.x, y: bb.y, w: bb.w, h: bb.h,
			points: out.points,
			fill: { color, transparency: bloc ? 5 : 35 },
			line: { color: P.paper, width: 0.4 },
		})
		placed++
	}

	// Legend
	let lx = 0.5
	for (const bn of Object.keys(COUNTRIES)) {
		await mcp.callTool('betterpptx.slide.add_shape', {
			deckId, slideIndex: 0, shapeName: 'roundRect',
			options: { x: lx, y: 7.05, w: 0.3, h: 0.3, rectRadius: 0.05,
				fill: { color: BLOC_COLOR[bn] || P.muted }, line: { type: 'none' } },
		})
		await mcp.callTool('betterpptx.slide.add_text', {
			deckId, slideIndex: 0, text: bn,
			options: { x: lx + 0.35, y: 7.05, w: 2.0, h: 0.3, fontSize: 12, color: P.paper, fontFace: 'Consolas' },
		})
		lx += 2.5
	}

	const save = await mcp.callTool('betterpptx.deck.save', { deckId, outputDir, fileName })

	const ms = Date.now() - t0
	const s = mcp.stats()
	process.stderr.write('\n==========================================================\n')
	process.stderr.write('  SMOOTH WORLDMAP COMPLETE\n')
	process.stderr.write('==========================================================\n')
	process.stderr.write(`file              : ${save.filePath}\n`)
	process.stderr.write(`bytes             : ${save.bytes.toLocaleString()}\n`)
	process.stderr.write(`slides            : ${save.slideCount}\n`)
	process.stderr.write(`countries placed  : ${placed} (missed ${miss})\n`)
	process.stderr.write(`source pts read   : ${totalSourcePts.toLocaleString()}\n`)
	process.stderr.write(`custGeom pts emit : ${totalCustGeomPts.toLocaleString()}\n`)
	process.stderr.write(`pts/country avg   : ${Math.round(totalCustGeomPts / Math.max(1, placed))}\n`)
	process.stderr.write(`elapsed           : ${ms} ms\n`)
	process.stderr.write(`wire RPCs         : ${s.totalReq}\n`)
	process.stderr.write('==========================================================\n')
	mcp.close()
	process.stdout.write(JSON.stringify({ ok: true, file: save.filePath, slides: save.slideCount, bytes: save.bytes, countriesPlaced: placed, ptsPerCountry: Math.round(totalCustGeomPts / Math.max(1, placed)) }, null, 2) + '\n')
}

main().catch(e => { process.stderr.write(`\n[demo] FATAL: ${e && e.stack || e}\n`); process.exit(1) })
