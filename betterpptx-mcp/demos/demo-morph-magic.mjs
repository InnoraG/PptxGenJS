#!/usr/bin/env node
// =============================================================================
//  MORPH MAGIC-MOVE PROOF — pure-MCP, primitive-generic.
//
//  Morph only produces its extraordinary "magic move" when consecutive slides
//  share the SAME objects in DIFFERENT states (PowerPoint interpolates position,
//  size, rotation, colour). This harness shows exactly where morph brings that
//  value on the four sample decks, built entirely over the MCP wire:
//
//    For each deck → take one representative slide (state A), then:
//      duplicate(+morph)  →  state B  →  update_shape transforms (converge/spin)
//      duplicate(+morph)  →  state C  →  update_shape transforms (expand/realign)
//    The new `slide.duplicate` primitive preserves each object's identity
//    (objectName + shape id; passthrough keeps its native a16:creationId), so
//    morph matches the objects across A→B→C and animates the transforms.
//
//  Verified (read-only): XML well-formed, no dangling rels, a <p159:morph> on
//  every "to" slide, and — the real proof morph has something to animate — for
//  each consecutive pair, the count of objects MATCHED by id on both slides
//  whose geometry actually CHANGED. Plus a PowerPoint COM open check.
// =============================================================================

import * as path from 'node:path'
import * as fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI_PATH = path.resolve(__dirname, '..', 'cli.mjs')
const OUT = path.resolve('outputs/morph_magic_20260528')
fs.mkdirSync(OUT, { recursive: true })

// ---------- stdio MCP client ----------
function startMcpClient() {
	const child = spawn(process.execPath, [CLI_PATH], { stdio: ['pipe', 'pipe', 'pipe'] })
	const pending = new Map()
	let nextId = 1, rxBuf = Buffer.alloc(0), totalReq = 0
	child.stderr.on('data', b => { const s = b.toString(); if (/server ready|MCP server/.test(s)) process.stderr.write(`[server] ${s}`) })
	child.stdout.on('data', chunk => {
		rxBuf = Buffer.concat([rxBuf, chunk])
		while (true) {
			const nl = rxBuf.indexOf(0x0a); if (nl < 0) break
			const line = rxBuf.subarray(0, nl).toString('utf8').trim()
			rxBuf = rxBuf.subarray(nl + 1); if (!line) continue
			try { const msg = JSON.parse(line); if (msg.id != null && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result) } } catch (_) {}
		}
	})
	function rpc(method, params) { const id = nextId++; totalReq++; return new Promise((res, rej) => { pending.set(id, { resolve: res, reject: rej }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n') }) }
	function notify(method, params) { child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n') }
	async function callTool(name, args = {}) { const r = await rpc('tools/call', { name, arguments: args }); const p = JSON.parse(r.content[0].text); if (!p.ok) throw new Error(`${name}: ${p.error && p.error.message}`); return p.data }
	async function init() { const r = await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'morph-magic', version: '1.0.0' }, capabilities: {} }); notify('notifications/initialized', {}); return r }
	return { callTool, init, close: () => { child.stdin.end(); child.kill() }, stats: () => ({ totalReq }) }
}

// =============================================================================
//  MAGIC-MOVE recipe — composed client-side from generic primitives.
// =============================================================================
const MORPH = (p14dur, option = 'byObject') => ({ type: 'morph', option, p14dur, speed: 'slow' })
const TRANSFORMABLE = new Set(['text', 'shape', 'image', 'media']) // update_shape can move these via options
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
const round3 = n => Math.round(n * 1000) / 1000

function centroid(shapes) {
	let sx = 0, sy = 0, n = 0
	for (const s of shapes) {
		if (typeof s.x === 'number' && typeof s.w === 'number') { sx += s.x + s.w / 2; sy += s.y + s.h / 2; n++ }
	}
	return n ? { cx: sx / n, cy: sy / n } : { cx: 6.667, cy: 3.75 }
}

// Build per-object update_shape patches that move/scale/rotate (and optionally
// recolor) the transformable objects about the slide centroid — a deterministic
// "magic move" that morph will then interpolate.
function magicMove(shapes, transformKinds, { factor, scale, rotStep, color }) {
	const movable = shapes.filter(s => transformKinds.has(s.kind) && typeof s.x === 'number' && typeof s.w === 'number')
	const { cx, cy } = centroid(movable)
	const patches = []
	movable.forEach((s, i) => {
		const ctrX = s.x + s.w / 2, ctrY = s.y + s.h / 2
		const nW = clamp(s.w * scale, 0.15, 32), nH = clamp(s.h * scale, 0.12, 20)
		const nCtrX = cx + (ctrX - cx) * factor, nCtrY = cy + (ctrY - cy) * factor
		const patch = { x: round3(nCtrX - nW / 2), y: round3(nCtrY - nH / 2), w: round3(nW), h: round3(nH), rotate: rotStep ? ((i % 2 ? 1 : -1) * rotStep) : 0 }
		// recolor ~every 3rd text object so morph also interpolates colour
		if (color && s.kind === 'text' && i % 3 === 0) patch.color = color
		patches.push({ index: s.index, patch })
	})
	return patches
}

async function applyState(mcp, deckId, slideIndex, transformKinds, spec) {
	const shapes = (await mcp.callTool('betterpptx.slide.list_shapes', { deckId, slideIndex })).shapes || []
	const patches = magicMove(shapes, transformKinds, spec)
	for (const { index, patch } of patches) {
		try { await mcp.callTool('betterpptx.slide.update_shape', { deckId, slideIndex, target: index, patch }) }
		catch (e) { process.stderr.write(`    slide ${slideIndex} obj ${index}: ${e.message}\n`) }
	}
	return patches.length
}

// =============================================================================
//  VERIFICATION (read-only)
// =============================================================================
function shapeGeoms(xml) {
	// Map shapeId -> { name, x, y, cx, cy, rot } in document order (top-level cNvPr).
	const cnv = [...xml.matchAll(/<p:cNvPr id="(\d+)" name="([^"]*)"/g)]
	const out = new Map()
	for (let i = 0; i < cnv.length; i++) {
		const id = cnv[i][1]
		if (id === '1') continue // spTree root group placeholder
		const start = cnv[i].index
		const end = i + 1 < cnv.length ? cnv[i + 1].index : xml.length
		const seg = xml.slice(start, end)
		const off = seg.match(/<a:off x="(-?\d+)" y="(-?\d+)"\s*\/>/)
		const ext = seg.match(/<a:ext cx="(\d+)" cy="(\d+)"\s*\/>/)
		const rot = seg.match(/<a:xfrm[^>]*\brot="(-?\d+)"/)
		if (!out.has(id)) out.set(id, { name: cnv[i][2], x: off ? +off[1] : null, y: off ? +off[2] : null, cx: ext ? +ext[1] : null, cy: ext ? +ext[2] : null, rot: rot ? +rot[1] : 0 })
	}
	return out
}

function geomChanged(a, b) {
	const d = (p, q) => (p == null || q == null) ? false : Math.abs(p - q) > 6350 // > ~0.005in EMU
	return d(a.x, b.x) || d(a.y, b.y) || d(a.cx, b.cx) || d(a.cy, b.cy) || Math.abs((a.rot || 0) - (b.rot || 0)) > 1000
}

async function analyzeMorph(pptxPath) {
	const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath))
	const slideNames = Object.keys(zip.files).filter(n => /ppt\/slides\/slide\d+\.xml$/.test(n))
		.sort((a, b) => (+a.match(/slide(\d+)/)[1]) - (+b.match(/slide(\d+)/)[1]))
	const geoms = [], morphFlags = []
	for (const n of slideNames) {
		const xml = await zip.file(n).async('string')
		geoms.push(shapeGeoms(xml))
		morphFlags.push(/<p159:morph\b/.test(xml))
	}
	const pairs = []
	for (let i = 1; i < geoms.length; i++) {
		const prev = geoms[i - 1], cur = geoms[i]
		let matched = 0, changed = 0
		for (const [id, g] of cur) {
			if (prev.has(id)) { matched++; if (geomChanged(prev.get(id), g)) changed++ }
		}
		pairs.push({ from: i - 1, to: i, matched, changed, morph: morphFlags[i] })
	}
	return { slides: slideNames.length, morphSlides: morphFlags.filter(Boolean).length, pairs }
}

async function verifyIntegrity(pptxPath) {
	const buf = fs.readFileSync(pptxPath)
	const zip = await JSZip.loadAsync(buf)
	const parser = new DOMParser({ errorHandler: { warning: () => {}, error: m => { throw new Error(m) }, fatalError: m => { throw new Error(m) } } })
	let slideCount = 0, parseErrors = 0, danglingRels = 0
	for (const name of Object.keys(zip.files)) {
		if (/\.(xml|rels)$/.test(name)) {
			const xml = await zip.file(name).async('string')
			try { parser.parseFromString(xml, 'text/xml') } catch (_) { parseErrors++ }
		}
		if (/ppt\/slides\/slide\d+\.xml$/.test(name)) slideCount++
	}
	for (const name of Object.keys(zip.files)) {
		const m = name.match(/ppt\/slides\/(slide\d+)\.xml$/); if (!m) continue
		const xml = await zip.file(name).async('string')
		const relsName = `ppt/slides/_rels/${m[1]}.xml.rels`
		const relsXml = zip.file(relsName) ? await zip.file(relsName).async('string') : ''
		const declaredIds = new Set([...relsXml.matchAll(/Id="(rId\d+)"/g)].map(x => x[1]))
		for (const ref of xml.matchAll(/r:(?:embed|id|link)="(rId\d+)"/g)) { if (!declaredIds.has(ref[1])) danglingRels++ }
	}
	return { bytes: buf.length, slideCount, parseErrors, danglingRels }
}

const DECYPHER_URL = pathToFileURL(path.resolve(__dirname, '..', '..', 'dist', 'node', 'pptx-decypher', 'index.js')).href
function powerpointOpenIsolated(pptxPath, timeoutMs = 175000) {
	return new Promise(resolve => {
		const code = `
			(async () => {
				try {
					const d = await import(process.argv[1])
					if (typeof d.repairCheck !== 'function') { process.stdout.write(JSON.stringify({ available: false })); return }
					const r = await d.repairCheck(process.argv[2], ${timeoutMs - 15000})
					let slides = null; try { slides = JSON.parse((r.stdout || '').trim().split('\\n').pop()).slideCount } catch (_) {}
					process.stdout.write(JSON.stringify({ available: true, ok: r.success === true, slides, runtimeAvailable: r.runtimeAvailable }))
				} catch (e) { process.stdout.write(JSON.stringify({ available: true, ok: false, error: String(e && e.message || e) })) }
			})()
		`
		const child = spawn(process.execPath, ['-e', code, DECYPHER_URL, pptxPath], { stdio: ['ignore', 'pipe', 'pipe'] })
		let out = '', done = false
		const finish = v => { if (done) return; done = true; clearTimeout(timer); try { child.kill('SIGKILL') } catch (_) {}; resolve(v) }
		const timer = setTimeout(() => finish({ available: true, ok: false, error: 'COM timeout' }), timeoutMs)
		child.stdout.on('data', d => { out += d })
		child.on('exit', c => { let p = null; try { p = JSON.parse(out.trim()) } catch (_) {}; finish(p || { available: true, ok: false, error: `COM child exit ${c}` }) })
		child.on('error', e => finish({ available: true, ok: false, error: 'spawn ' + e.message }))
	})
}
async function powerpointOpen(pptxPath) {
	let r = await powerpointOpenIsolated(pptxPath)
	if (r.available && !r.ok) { await new Promise(res => setTimeout(res, 4000)); r = await powerpointOpenIsolated(pptxPath) }
	return r
}

// ---------- main ----------
async function main() {
	const t0 = Date.now()
	const mcp = startMcpClient()
	await mcp.init()
	const report = []

	// Per deck: the slide that best showcases morph + which kinds we transform.
	// (3d-gradient's design panels are passthrough/raw-XML, so we morph its text;
	// the panels are matched by their native creationId and hold steady underneath.)
	const jobs = [
		{ id: 'M10', label: 'batch10 shape-styles — magic-move grid', src: 'tmp_autonomous_test/Focused_ShapeStyles_Showcase_BATCH10_CURRENT_MANUALLY_FROZENREFERENCE.pptx', slide: 6, kinds: ['text', 'shape', 'image'] },
		{ id: 'M11', label: 'batch11 wordart — magic-move type',      src: 'tmp_autonomous_test/Focused_WordArtStyles_Showcase_BATCH11_FROZENREFERENCE.pptx', slide: 6, kinds: ['text', 'shape', 'image'] },
		{ id: 'M7',  label: 'batch7 media — video zoom + reflow',     src: 'tmp_autonomous_test/Focused_Media_Showcase_BATCH7_MANUALLYFROZEN.pptx', slide: 1, kinds: ['text', 'shape', 'image', 'media'] },
		{ id: 'M3D', label: '3d-gradient — cinematic headline morph', src: '3d-gradient-style-advertising-agency.pptx', slide: 3, kinds: ['text', 'shape', 'image'] },
	]

	for (const job of jobs) {
		process.stderr.write(`\n==== JOB ${job.id}: ${job.label} ====\n`)
		const srcPath = path.resolve(job.src)
		if (!fs.existsSync(srcPath)) { process.stderr.write(`  SKIP (missing): ${srcPath}\n`); continue }
		const transformKinds = new Set(job.kinds)

		const opened = await mcp.callTool('betterpptx.deck.open_existing', { pptxPath: srcPath, slideNumbers: [job.slide] })
		const deckId = opened.deckId
		process.stderr.write(`  [wire] opened source slide ${job.slide} → ${opened.slideCount} slide, ${opened.shapeCount} shapes\n`)

		// State A is slide 0 (the opened slide). Build B then C with morph + transforms.
		const dupB = await mcp.callTool('betterpptx.slide.duplicate', { deckId, slideIndex: 0, transition: MORPH(900) })
		const idxB = dupB.newSlideIndexes[0]
		const movedB = await applyState(mcp, deckId, idxB, transformKinds, { factor: 0.5, scale: 0.72, rotStep: 10, color: '2E6FE0' })
		process.stderr.write(`  [wire] duplicate→B (morph) + converge/spin/recolor ${movedB} objects\n`)

		const dupC = await mcp.callTool('betterpptx.slide.duplicate', { deckId, slideIndex: idxB, transition: MORPH(1100) })
		const idxC = dupC.newSlideIndexes[0]
		const movedC = await applyState(mcp, deckId, idxC, transformKinds, { factor: 1.32, scale: 1.0, rotStep: 0, color: 'E0662E' })
		process.stderr.write(`  [wire] duplicate→C (morph) + expand/realign ${movedC} objects\n`)

		const outFile = path.join(OUT, `${path.basename(job.src, '.pptx')}.morph.pptx`)
		await mcp.callTool('betterpptx.deck.save', { deckId, fileName: outFile })

		const integ = await verifyIntegrity(outFile)
		const morph = await analyzeMorph(outFile)
		const ppt = await powerpointOpen(outFile)

		process.stderr.write(`  [verify] integrity: bytes=${integ.bytes} slides=${integ.slideCount} parseErrors=${integ.parseErrors} danglingRels=${integ.danglingRels}\n`)
		for (const p of morph.pairs) process.stderr.write(`  [verify] morph pair ${p.from}→${p.to}: morph=${p.morph} matchedObjects=${p.matched} animatable(changed)=${p.changed}\n`)
		process.stderr.write(`  [verify] PowerPoint open: ${ppt.available ? (ppt.ok ? `POWERPOINT_OPEN_OK slides=${ppt.slides}` : 'OPEN_FAILED') : 'COM unavailable'}\n`)

		// Pass: every morph "to" slide is a morph AND has matched objects whose geometry changed.
		const morphPairsOk = morph.pairs.length > 0 && morph.pairs.every(p => p.morph && p.matched > 0 && p.changed > 0)
		const pass = integ.parseErrors === 0 && integ.danglingRels === 0 && morphPairsOk && (!ppt.available || ppt.ok)
		process.stderr.write(`  [verify] ${pass ? '✓ PASS' : '✗ FAIL'}\n`)
		report.push({ job: job.id, label: job.label, file: outFile, integ, morph, powerpoint: ppt, movedB, movedC, pass })
		try { fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ ok: report.every(r => r.pass), report }, null, 2)) } catch (_) {}
	}

	mcp.close()
	const ms = Date.now() - t0
	process.stderr.write('\n==========================================================\n')
	process.stderr.write('  MORPH MAGIC-MOVE REPORT\n')
	process.stderr.write('==========================================================\n')
	for (const r of report) {
		const tot = r.morph.pairs.reduce((a, p) => a + p.changed, 0)
		process.stderr.write(`  ${r.pass ? '✓' : '✗'} ${r.job} ${r.label}\n`)
		process.stderr.write(`     ${path.basename(r.file)}  (${(r.integ.bytes / 1024 / 1024).toFixed(2)} MB, ${r.integ.slideCount} slides) morphSlides=${r.morph.morphSlides} animatableObjects=${tot}\n`)
		process.stderr.write(`     parseErrors=${r.integ.parseErrors} danglingRels=${r.integ.danglingRels} ppt=${r.powerpoint.available ? (r.powerpoint.ok ? 'OPEN_OK' : 'FAIL') : 'n/a'}\n`)
	}
	process.stderr.write(`  elapsed: ${ms} ms · wire RPCs: ${mcp.stats().totalReq}\n`)
	process.stderr.write('==========================================================\n')
	process.stdout.write(JSON.stringify({ ok: report.every(r => r.pass), report }, null, 2) + '\n')
	if (!report.every(r => r.pass)) process.exit(1)
}

main().catch(e => { process.stderr.write(`\n[demo] FATAL: ${e && e.stack || e}\n`); process.exit(1) })
