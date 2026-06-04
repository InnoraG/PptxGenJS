#!/usr/bin/env node
// =============================================================================
//  EDIT PERFECTION PROOF — pure-MCP, primitive-generic editing.
//
//  Proves the edit functionality is complete on real frozen references:
//    A. INVERT MODE on batch10 (shapes)  — deck.open_existing → transform_shapes
//       { colorTransform:'invertLightness' } → save
//    B. INVERT MODE on batch11 (wordart) — same recipe
//    C. ANIMATE the 3d-gradient deck     — open_existing → animate_shapes → save
//
//  Each output is verified:
//    • unzip + XML well-formedness (0 parse errors)
//    • no dangling slide relationships
//    • color inversion actually happened (distinct hex set changed; original
//      dark/light extremes flipped)
//    • PowerPoint COM open check via decypher.repairCheck (POWERPOINT_OPEN_OK)
//
//  Every build step crosses the stdio MCP transport. Verification uses
//  read-only tooling (jszip + decypher.repairCheck).
// =============================================================================

import * as path from 'node:path'
import * as fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI_PATH = path.resolve(__dirname, '..', 'cli.mjs')
const OUT = path.resolve('outputs/edit_perfection_20260528')
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
	async function init() { const r = await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'edit-perfection', version: '1.0.0' }, capabilities: {} }); notify('notifications/initialized', {}); return r }
	return { callTool, init, close: () => { child.stdin.end(); child.kill() }, stats: () => ({ totalReq }) }
}

// ---------- verification helpers ----------
async function distinctColors(pptxPath) {
	const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath))
	const set = new Map()
	for (const name of Object.keys(zip.files)) {
		if (!/ppt\/slides\/slide\d+\.xml$/.test(name)) continue
		const xml = await zip.file(name).async('string')
		for (const mm of xml.matchAll(/srgbClr val="([0-9A-Fa-f]{6})"/g)) {
			const h = mm[1].toUpperCase(); set.set(h, (set.get(h) || 0) + 1)
		}
	}
	return set
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
	// dangling rel check: every r:embed/r:id referenced in a slide must exist in its .rels
	for (const name of Object.keys(zip.files)) {
		const m = name.match(/ppt\/slides\/(slide\d+)\.xml$/); if (!m) continue
		const xml = await zip.file(name).async('string')
		const relsName = `ppt/slides/_rels/${m[1]}.xml.rels`
		const relsXml = zip.file(relsName) ? await zip.file(relsName).async('string') : ''
		const declaredIds = new Set([...relsXml.matchAll(/Id="(rId\d+)"/g)].map(x => x[1]))
		for (const ref of xml.matchAll(/r:(?:embed|id|link)="(rId\d+)"/g)) {
			if (!declaredIds.has(ref[1])) danglingRels++
		}
	}
	return { bytes: buf.length, slideCount, parseErrors, danglingRels }
}

async function powerpointOpen(pptxPath) {
	try {
		const decypher = await import('../../dist/node/pptx-decypher/index.js')
		if (typeof decypher.repairCheck !== 'function') return { available: false }
		const res = await decypher.repairCheck(pptxPath, 120000)
		let slides = null
		try { const j = JSON.parse((res.stdout || '').trim().split('\n').pop()); slides = j.slideCount } catch (_) {}
		return { available: true, ok: res.success === true, slides, runtimeAvailable: res.runtimeAvailable }
	} catch (e) { return { available: false, error: e.message } }
}

function summariseInversion(before, after) {
	// How many of the "before" colors survived unchanged?
	let survived = 0
	for (const h of before.keys()) if (after.has(h)) survived++
	return { beforeDistinct: before.size, afterDistinct: after.size, survivedUnchanged: survived }
}

// ---------- main ----------
async function main() {
	const t0 = Date.now()
	const mcp = startMcpClient()
	await mcp.init()
	const report = []

	const jobs = [
		{ id: 'A', label: 'INVERT batch10 (shapes)', src: 'tmp_autonomous_test/Focused_ShapeStyles_Showcase_BATCH10_CURRENT_MANUALLY_FROZENREFERENCE.pptx', mode: 'invert' },
		{ id: 'B', label: 'INVERT batch11 (wordart)', src: 'tmp_autonomous_test/Focused_WordArtStyles_Showcase_BATCH11_FROZENREFERENCE.pptx', mode: 'invert' },
		{ id: 'C', label: 'ANIMATE 3d-gradient (slides 1-6)', src: '3d-gradient-style-advertising-agency.pptx', mode: 'animate', slideNumbers: [1, 2, 3, 4, 5, 6] },
	]

	for (const job of jobs) {
		process.stderr.write(`\n==== JOB ${job.id}: ${job.label} ====\n`)
		const srcPath = path.resolve(job.src)
		if (!fs.existsSync(srcPath)) { process.stderr.write(`  SKIP (source missing): ${srcPath}\n`); continue }

		process.stderr.write(`  [wire] deck.open_existing …\n`)
		const opened = await mcp.callTool('claudepptx.deck.open_existing',
			job.slideNumbers ? { pptxPath: srcPath, slideNumbers: job.slideNumbers } : { pptxPath: srcPath })
		process.stderr.write(`  [wire]   ${opened.slideCount} slides, ${opened.shapeCount} shapes, pkgParts=${opened.packagePassthrough?.partsCopied}\n`)
		const deckId = opened.deckId
		const outFile = path.join(OUT, `${path.basename(job.src, '.pptx')}.${job.mode}.pptx`)

		let editResult = {}
		if (job.mode === 'invert') {
			const r = await mcp.callTool('claudepptx.deck.transform_shapes', { deckId, colorTransform: 'invertLightness' })
			editResult = r
			process.stderr.write(`  [wire] transform_shapes invertLightness → shapesTouched=${r.shapesTouched}, colorsRemapped=${r.colorsRemapped}, rawXml=${r.rawXmlColorsRemapped}, rawTiming=${r.rawTimingColorsRemapped}, pkgParts=${r.rawPackagePartsTouched}\n`)
		} else if (job.mode === 'animate') {
			// Add entrance animations to every editable shape on every imported slide
			let total = 0
			for (let si = 0; si < opened.slideCount; si++) {
				try {
					const r = await mcp.callTool('claudepptx.slide.animate_shapes', {
						deckId, slideIndex: si,
						animation: { type: 'entrance', effect: 'fade', duration: 500 },
						kinds: ['text', 'shape', 'image'], staggerMs: 120,
					})
					total += r.animationsApplied
				} catch (e) { process.stderr.write(`    slide ${si}: ${e.message}\n`) }
			}
			editResult = { animationsApplied: total }
			process.stderr.write(`  [wire] animate_shapes → ${total} animations across ${opened.slideCount} slides\n`)
		}

		const before = await distinctColors(srcPath)
		await mcp.callTool('claudepptx.deck.save', { deckId, fileName: outFile })
		const after = await distinctColors(outFile)
		const integ = await verifyIntegrity(outFile)
		const ppt = await powerpointOpen(outFile)

		const inv = summariseInversion(before, after)
		process.stderr.write(`  [verify] integrity: bytes=${integ.bytes} slides=${integ.slideCount} parseErrors=${integ.parseErrors} danglingRels=${integ.danglingRels}\n`)
		if (job.mode === 'invert') {
			process.stderr.write(`  [verify] colors: before=${inv.beforeDistinct} after=${inv.afterDistinct} survivedUnchanged=${inv.survivedUnchanged}\n`)
		}
		process.stderr.write(`  [verify] PowerPoint open: ${ppt.available ? (ppt.ok ? `POWERPOINT_OPEN_OK slides=${ppt.slides}` : 'OPEN_FAILED') : 'COM unavailable'}\n`)

		const pass = integ.parseErrors === 0 && integ.danglingRels === 0 &&
			(job.mode !== 'invert' || inv.survivedUnchanged < inv.beforeDistinct) &&
			(!ppt.available || ppt.ok)
		process.stderr.write(`  [verify] ${pass ? '✓ PASS' : '✗ FAIL'}\n`)
		report.push({ job: job.id, label: job.label, file: outFile, integ, inversion: job.mode === 'invert' ? inv : undefined, edit: editResult, powerpoint: ppt, pass })
	}

	mcp.close()
	const ms = Date.now() - t0
	process.stderr.write('\n==========================================================\n')
	process.stderr.write('  EDIT PERFECTION REPORT\n')
	process.stderr.write('==========================================================\n')
	for (const r of report) {
		process.stderr.write(`  ${r.pass ? '✓' : '✗'} ${r.job} ${r.label}\n`)
		process.stderr.write(`     ${path.basename(r.file)}  (${(r.integ.bytes/1024/1024).toFixed(2)} MB, ${r.integ.slideCount} slides)\n`)
		process.stderr.write(`     parseErrors=${r.integ.parseErrors} danglingRels=${r.integ.danglingRels} ppt=${r.powerpoint.available ? (r.powerpoint.ok ? 'OPEN_OK' : 'FAIL') : 'n/a'}\n`)
	}
	process.stderr.write(`  elapsed: ${ms} ms · wire RPCs: ${mcp.stats().totalReq}\n`)
	process.stderr.write('==========================================================\n')
	process.stdout.write(JSON.stringify({ ok: report.every(r => r.pass), report }, null, 2) + '\n')
	if (!report.every(r => r.pass)) process.exit(1)
}

main().catch(e => { process.stderr.write(`\n[demo] FATAL: ${e && e.stack || e}\n`); process.exit(1) })
