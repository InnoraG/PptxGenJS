#!/usr/bin/env node
// =============================================================================
//  PROOF — assets from all THREE sources composed in one deck, wire-only MCP.
//
//   Source A — LOCAL    : ship-with-package geojson + premium GLB poster (fs/io)
//   Source B — UPLOADED : simulate a user upload by base64-injecting a PNG
//                          through io.write_file (this is exactly what an AI
//                          client does after reading an attached file).
//   Source C — ONLINE   : http.fetch a public Khronos GLB sample at runtime.
//
//   Bonus: the world map is rendered properly using polygon_to_custgeom's
//   `projectInto` mode (shared coordinate system → no more "potato" shapes).
//
//   Every tool call crosses the stdio MCP transport.
// =============================================================================

import * as path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI_PATH = path.resolve(__dirname, '..', 'cli.mjs')

// ---------- stdio MCP client -----------------------------------------------
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
		const r = await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'demo-3-sources', version: '1.0.0' }, capabilities: {} })
		notify('notifications/initialized', {})
		return r
	}
	return { rpc, callTool, init, close: () => { child.stdin.end(); child.kill() }, stats: () => ({ totalReq, totalIn, totalOut }) }
}

// World map config (CLIENT defines the coordinate system — MCP just projects)
const MAP = { x: 0.4, y: 1.55, w: 12.5, h: 5.4 }
const BOUNDS = { lonMin: -180, lonMax: 180, latMin: -60, latMax: 80 }

// Country bloc map (CLIENT data — kept short for demo)
const COUNTRIES = {
	natoEU: ['United States of America','United Kingdom','France','Canada','Italy','Germany','Netherlands','Belgium','Norway','Greece','Turkey','Portugal','Spain','Iceland','Denmark','Poland','Hungary','Romania','Bulgaria','Czechia','Slovakia','Lithuania','Latvia','Estonia','Sweden','Finland','Austria','Ireland','Switzerland'],
	russia:  ['Russia','Belarus'],
	rising:  ['China','India','Indonesia','Brazil','South Africa','Mexico','Argentina'],
	emerging:['Ukraine','Kazakhstan','Uzbekistan','Moldova','Georgia','Armenia','Azerbaijan','Turkmenistan','Tajikistan','Kyrgyzstan','Egypt','Iran','Australia','Japan'],
}
const ALL = Object.values(COUNTRIES).flat()

async function main() {
	const t0 = Date.now()
	const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
	const outputDir = path.resolve('outputs')
	const fileName = `ThreeSources_via_MCP_${stamp}.pptx`

	process.stderr.write('==========================================================\n')
	process.stderr.write('  DEMO — 3 asset sources composed via wire-only MCP\n')
	process.stderr.write('  Local · Uploaded · Online — all in one session\n')
	process.stderr.write('==========================================================\n\n')

	const mcp = startMcpClient()
	const init = await mcp.init()
	process.stderr.write(`[wire] handshake — server ${init.serverInfo.name} v${init.serverInfo.version}\n`)

	// ---------- INTROSPECT what the MCP says is available ----------
	process.stderr.write('\n[wire] help.capabilities — what local assets does the server ship with?\n')
	const cap = await mcp.callTool('betterpptx.help.capabilities', {})
	process.stderr.write(`   local geojson maps   : ${cap.assetSources.local.maps_geojson.count}\n`)
	process.stderr.write(`   local GLB 3D models  : ${cap.assetSources.local.models_glb.reduce((s, x) => s + x.count, 0)} (${cap.assetSources.local.models_glb.map(x => x.count).join(' + ')})\n`)
	process.stderr.write(`   local SVG icons      : ${cap.assetSources.local.icons_svg.count}\n`)

	// ---------- A · LOCAL : fs.find a geojson, io.read_file it ----------
	process.stderr.write('\n[wire] A · LOCAL — discover & read natural-earth geojson …\n')
	const found = await mcp.callTool('betterpptx.fs.find', {
		root: 'demos/betterpptx-mcp-online-assets/maps/natural-earth',
		pattern: '*admin_0_countries*.geojson',
	})
	const geoPath = found.results[0].path
	process.stderr.write(`   fs.find → ${found.count} matches, chose ${found.results[0].rel}\n`)
	const geo = await mcp.callTool('betterpptx.io.read_file', { path: geoPath })
	const fc = JSON.parse(geo.content)
	process.stderr.write(`   io.read_file → ${geo.bytes.toLocaleString()} bytes · ${fc.features.length} features\n`)

	// Index by various names
	const byName = new Map()
	for (const f of fc.features) {
		for (const k of ['NAME', 'NAME_LONG', 'NAME_EN', 'ADMIN']) {
			if (f.properties[k]) byName.set(String(f.properties[k]).toLowerCase(), f)
		}
	}

	// ---------- B · UPLOADED : simulate a user upload via io.write_file ----------
	//  In a real claude.ai session, when the user attaches a PNG, the AI client
	//  reads the bytes and forwards them to the MCP. The MCP-side primitive is
	//  io.write_file with encoding:"base64". We simulate that here by reading a
	//  local file, base64-encoding it, then sending it BACK as if uploaded.
	process.stderr.write('\n[wire] B · UPLOADED — simulate user upload (PNG → base64 → io.write_file) …\n')
	const sourceLogo = path.resolve('outputs/hc-logo.png')
	const logoBase64 = fs.readFileSync(sourceLogo).toString('base64')
	const uploadDest = `outputs/uploads/user_logo_${stamp}.png`
	const upload = await mcp.callTool('betterpptx.io.write_file', {
		path: uploadDest,
		content: logoBase64,
		encoding: 'base64',
	})
	process.stderr.write(`   io.write_file → ${upload.path} (${upload.bytes.toLocaleString()} bytes)\n`)

	// Now sample the uploaded image — proves the upload landed and is usable
	const pal = await mcp.callTool('betterpptx.image.sample_palette', { imagePath: upload.path, k: 6 })
	const brand = pal.brandedClusters.slice(0, 3).map(c => c.hex)
	process.stderr.write(`   image.sample_palette → branded hexes: ${brand.join(' · ')}\n`)
	const P = {
		primary: brand[0] || '2AB2B8', accent: brand[1] || '2066C8', secondary: brand[2] || '7CC242',
		dark: '0B1026', deep: '11576C', paper: 'F8FAFC', muted: '94A3B8',
		warning: 'F59E0B', danger: 'EF4444',
	}
	const BLOC_COLOR = { natoEU: P.accent, russia: P.danger, rising: P.warning, emerging: P.primary }

	// ---------- C · ONLINE : http.fetch a Khronos sample GLB ----------
	process.stderr.write('\n[wire] C · ONLINE — http.fetch a public Khronos GLB sample …\n')
	const ONLINE_GLB = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Avocado/glTF-Binary/Avocado.glb'
	const ONLINE_POSTER = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Avocado/screenshot/screenshot.jpg'
	const onlineGlbDest = `outputs/online-fetched/Avocado_${stamp}.glb`
	const onlinePosterDest = `outputs/online-fetched/Avocado_${stamp}.jpg`
	const glbFetched = await mcp.callTool('betterpptx.http.fetch', {
		url: ONLINE_GLB, responseType: 'base64', saveToPath: onlineGlbDest, timeoutMs: 60000,
	})
	process.stderr.write(`   http.fetch GLB  → status ${glbFetched.status}, ${glbFetched.bytes.toLocaleString()} bytes → ${glbFetched.savedTo}\n`)
	const posterFetched = await mcp.callTool('betterpptx.http.fetch', {
		url: ONLINE_POSTER, responseType: 'base64', saveToPath: onlinePosterDest, timeoutMs: 60000,
	})
	process.stderr.write(`   http.fetch JPG  → status ${posterFetched.status}, ${posterFetched.bytes.toLocaleString()} bytes\n`)

	// ---------- BUILD the deck ----------
	process.stderr.write('\n[wire] deck.new + 4 slides …\n')
	const { deckId } = await mcp.callTool('betterpptx.deck.new', {
		layout: 'LAYOUT_WIDE',
		title: 'Three asset sources · one MCP session',
		author: 'betterpptx-mcp',
	})
	await mcp.callTool('betterpptx.deck.set_show_settings', { deckId, useTimings: true, mode: 'kiosk', loop: true })

	// Slide 1 — Cover, uses UPLOADED logo
	await mcp.callTool('betterpptx.slide.add', {
		deckId,
		background: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 135,
			gradientStops: [{ position: 0, color: P.dark }, { position: 100, color: P.deep }] },
		transition: { type: 'fade', speed: 'slow' },
	})
	await mcp.callTool('betterpptx.slide.add_image', {
		deckId, slideIndex: 0, options: { path: upload.path, x: 5.66, y: 0.5, w: 2.0, h: 2.0 },
	})
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: 0, text: 'Three asset sources, one MCP',
		options: { x: 0.5, y: 2.8, w: 12.3, h: 1.4, fontSize: 48, bold: true, color: 'FFFFFF', align: 'center',
			text3D: { bevel: { type: 'circle', width: 4, height: 4 }, extrusion: 8, extrusionColor: P.primary, material: 'metal', lightRig: 'threePt' },
			glow: { size: 14, color: P.primary, opacity: 0.7 } },
	})
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: 0, text: 'LOCAL · UPLOADED · ONLINE — composed via wire MCP primitives',
		options: { x: 0.5, y: 4.4, w: 12.3, h: 0.6, fontSize: 18, color: P.secondary, align: 'center', italic: true },
	})
	// Three "source" tags
	const tags = [
		{ label: 'LOCAL', sub: 'fs.find · io.read_file', x: 1.2 },
		{ label: 'UPLOADED', sub: 'io.write_file (base64)', x: 5.66 },
		{ label: 'ONLINE', sub: 'http.fetch', x: 10.12 },
	]
	for (const t of tags) {
		await mcp.callTool('betterpptx.slide.add_shape', {
			deckId, slideIndex: 0, shapeName: 'roundRect',
			options: { x: t.x, y: 5.3, w: 2.0, h: 1.1, rectRadius: 0.15,
				fill: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 90,
					gradientStops: [{ position: 0, color: P.primary }, { position: 100, color: P.accent }] },
				line: { type: 'none' },
				shadow: { type: 'outer', color: '000000', opacity: 0.3, blur: 14, offset: 6, angle: 90 },
			},
		})
		await mcp.callTool('betterpptx.slide.add_text', {
			deckId, slideIndex: 0, text: t.label,
			options: { x: t.x, y: 5.4, w: 2.0, h: 0.5, fontSize: 22, bold: true, color: 'FFFFFF', align: 'center' },
		})
		await mcp.callTool('betterpptx.slide.add_text', {
			deckId, slideIndex: 0, text: t.sub,
			options: { x: t.x, y: 5.85, w: 2.0, h: 0.4, fontSize: 11, color: 'FFFFFF', align: 'center', fontFace: 'Consolas' },
		})
	}

	// Slide 2 — WORLD MAP from LOCAL geojson + UPLOADED palette, rendered via
	// the NEW projectInto mode → countries align on a shared canvas.
	process.stderr.write('\n[wire] slide 2 — worldmap with projectInto …\n')
	await mcp.callTool('betterpptx.slide.add', {
		deckId,
		background: { color: P.dark },
		transition: { type: 'wipe', direction: 'r', speed: 'slow' },
	})
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: 1,
		text: 'World map · LOCAL geojson + UPLOADED palette',
		options: { x: 0.4, y: 0.3, w: 12.5, h: 0.7, fontSize: 26, bold: true, color: P.paper, fontFace: 'Segoe UI' },
	})
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: 1,
		text: 'polygon_to_custgeom.projectInto → countries projected into a SHARED coordinate system on the slide.',
		options: { x: 0.4, y: 1.0, w: 12.5, h: 0.45, fontSize: 13, color: P.secondary, italic: true },
	})

	// Map backdrop
	await mcp.callTool('betterpptx.slide.add_shape', {
		deckId, slideIndex: 1, shapeName: 'rect',
		options: { x: MAP.x, y: MAP.y, w: MAP.w, h: MAP.h,
			fill: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 90,
				gradientStops: [{ position: 0, color: P.deep }, { position: 100, color: P.dark }] },
			line: { color: P.muted, width: 0.5 } },
	})

	const countryBloc = {}
	for (const [bloc, names] of Object.entries(COUNTRIES)) for (const c of names) countryBloc[c] = bloc

	let placed = 0, miss = 0
	for (const name of ALL) {
		const feat = byName.get(name.toLowerCase())
		if (!feat) { miss++; continue }
		const rings = []
		if (feat.geometry.type === 'Polygon') rings.push(...feat.geometry.coordinates)
		else if (feat.geometry.type === 'MultiPolygon') for (const poly of feat.geometry.coordinates) rings.push(...poly)
		if (rings.length === 0) { miss++; continue }
		// NEW: use projectInto for shared-canvas projection
		const out = await mcp.callTool('betterpptx.geometry.polygon_to_custgeom', {
			rings,
			projectInto: {
				sourceBounds: { minX: BOUNDS.lonMin, maxX: BOUNDS.lonMax, minY: BOUNDS.latMin, maxY: BOUNDS.latMax },
				targetBox:    { x: MAP.x, y: MAP.y, w: MAP.w, h: MAP.h },
			},
			maxPointsPerRing: 80,
			flipY: true,
		})
		const bb = out.shapeBBox
		if (!bb || bb.w <= 0 || bb.h <= 0) { miss++; continue }
		const bloc = countryBloc[name]
		const color = bloc ? BLOC_COLOR[bloc] || P.muted : P.muted
		await mcp.callTool('betterpptx.slide.add_freeform', {
			deckId, slideIndex: 1,
			x: bb.x, y: bb.y, w: bb.w, h: bb.h,
			points: out.points,
			fill: { color, transparency: bloc ? 5 : 35 },
			line: { color: P.paper, width: 0.4 },
		})
		placed++
	}
	process.stderr.write(`   placed ${placed} countries, missed ${miss}\n`)

	// Slide 3 — ONLINE asset: embed the fetched Khronos GLB
	process.stderr.write('\n[wire] slide 3 — embed ONLINE-fetched 3D model …\n')
	await mcp.callTool('betterpptx.slide.add', {
		deckId,
		background: { type: 'gradient', gradientDirection: 'circle',
			gradientStops: [{ position: 0, color: P.deep }, { position: 100, color: P.dark }] },
		transition: { type: 'morph', option: 'byObject', speed: 'slow' },
	})
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: 2, text: '3D model · fetched ONLINE in this session',
		options: { x: 0.4, y: 0.3, w: 12.5, h: 0.7, fontSize: 26, bold: true, color: P.paper },
	})
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: 2, text: 'http.fetch(Khronos GLB) → io saved to disk → slide.add_model3d',
		options: { x: 0.4, y: 1.0, w: 12.5, h: 0.45, fontSize: 13, color: P.secondary, italic: true, fontFace: 'Consolas' },
	})
	await mcp.callTool('betterpptx.slide.add_model3d', {
		deckId, slideIndex: 2,
		options: {
			glbFile: glbFetched.savedTo,
			rasterFile: posterFetched.savedTo,
			x: 1.0, y: 1.7, w: 6.0, h: 5.4,
			shadow: { type: 'outer', color: '000000', opacity: 0.5, blur: 30, offset: 15, angle: 90 },
		},
	})
	// Tech card on the right
	await mcp.callTool('betterpptx.slide.add_shape', {
		deckId, slideIndex: 2, shapeName: 'roundRect',
		options: { x: 7.5, y: 2.0, w: 5.4, h: 4.5, rectRadius: 0.15,
			fill: { color: '0F1A3D', transparency: 10 },
			line: { color: P.primary, width: 1.5 } },
	})
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: 2, text: 'Avocado.glb',
		options: { x: 7.7, y: 2.1, w: 5.0, h: 0.5, fontSize: 22, bold: true, color: P.primary, fontFace: 'Consolas' },
	})
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: 2, text: [
			{ text: 'Source · ',  options: { bold: true, color: P.warning } },
			{ text: 'github.com/KhronosGroup/glTF-Sample-Assets\n', options: { color: P.paper, breakLine: true } },
			{ text: 'Fetched · ', options: { bold: true, color: P.warning } },
			{ text: `${(glbFetched.bytes / 1024).toFixed(1)} KB over HTTPS in this session\n`, options: { color: P.paper, breakLine: true } },
			{ text: 'Saved to · ', options: { bold: true, color: P.warning } },
			{ text: 'outputs/online-fetched/…glb\n',  options: { color: P.secondary, fontFace: 'Consolas', breakLine: true } },
			{ text: 'Embedded · ', options: { bold: true, color: P.warning } },
			{ text: 'inside this .pptx package\n', options: { color: P.paper, breakLine: true } },
			{ text: 'Tools used · ',  options: { bold: true, color: P.warning } },
			{ text: 'http.fetch + slide.add_model3d', options: { color: P.primary, fontFace: 'Consolas' } },
		],
		options: { x: 7.7, y: 2.7, w: 5.0, h: 3.6, fontSize: 13, fontFace: 'Segoe UI', valign: 'top', lineSpacingMultiple: 1.3 },
	})

	// Slide 4 — Closing
	await mcp.callTool('betterpptx.slide.add', {
		deckId,
		background: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 45,
			gradientStops: [{ position: 0, color: P.dark }, { position: 100, color: P.primary }] },
		transition: { type: 'morph', option: 'byObject' },
	})
	await mcp.callTool('betterpptx.slide.add_image', {
		deckId, slideIndex: 3, options: { path: upload.path, x: 5.66, y: 0.8, w: 2.0, h: 2.0 },
	})
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: 3, text: 'Local · Uploaded · Online',
		options: { x: 0.5, y: 3.2, w: 12.3, h: 1.0, fontSize: 44, bold: true, color: 'FFFFFF', align: 'center',
			text3D: { bevel: { type: 'circle', width: 4, height: 4 }, extrusion: 8, extrusionColor: P.accent, material: 'metal', lightRig: 'threePt' },
			glow: { size: 14, color: P.secondary, opacity: 0.7 } },
	})
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: 3, text: 'Every asset reached the deck through a generic MCP primitive — no domain-specific tools.',
		options: { x: 0.5, y: 4.4, w: 12.3, h: 0.6, fontSize: 18, color: P.paper, align: 'center', italic: true },
	})
	await mcp.callTool('betterpptx.slide.add_text', {
		deckId, slideIndex: 3, text: 'fs.find · io.read_file · io.write_file · http.fetch · image.sample_palette · geometry.polygon_to_custgeom(projectInto)',
		options: { x: 0.5, y: 5.5, w: 12.3, h: 0.5, fontSize: 12, color: P.secondary, align: 'center', fontFace: 'Consolas' },
	})

	// Autoplay + save
	await mcp.callTool('betterpptx.deck.autoplay', { deckId, secondsPerSlide: 6, loop: true, mode: 'kiosk' })
	const save = await mcp.callTool('betterpptx.deck.save', { deckId, outputDir, fileName })

	const ms = Date.now() - t0
	const s = mcp.stats()
	process.stderr.write('\n==========================================================\n')
	process.stderr.write('  DEMO COMPLETE — assets from 3 sources, one wire session\n')
	process.stderr.write('==========================================================\n')
	process.stderr.write(`file        : ${save.filePath}\n`)
	process.stderr.write(`bytes       : ${save.bytes.toLocaleString()}\n`)
	process.stderr.write(`slides      : ${save.slideCount}\n`)
	process.stderr.write(`elapsed     : ${ms} ms\n`)
	process.stderr.write(`wire calls  : ${s.totalReq} RPCs\n`)
	process.stderr.write(`wire bytes  : ${s.totalOut.toLocaleString()} sent / ${s.totalIn.toLocaleString()} received\n`)
	process.stderr.write(`countries   : ${placed} placed via projectInto\n`)
	process.stderr.write(`online MB   : ${((glbFetched.bytes + posterFetched.bytes) / 1024 / 1024).toFixed(2)} fetched live from GitHub\n`)
	process.stderr.write('==========================================================\n')
	mcp.close()
	process.stdout.write(JSON.stringify({ ok: true, file: save.filePath, slides: save.slideCount, bytes: save.bytes, wireCalls: s.totalReq, countriesPlaced: placed, onlineBytes: glbFetched.bytes + posterFetched.bytes }, null, 2) + '\n')
}

main().catch(e => { process.stderr.write(`\n[demo] FATAL: ${e && e.stack || e}\n`); process.exit(1) })
