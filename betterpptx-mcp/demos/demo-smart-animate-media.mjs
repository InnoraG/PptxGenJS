#!/usr/bin/env node
// =============================================================================
//  SMART ANIMATE + MEDIA INVERT PROOF — pure-MCP, primitive-generic editing.
//
//  Proves the edit layer can do CONTENT-ADAPTED, DIVERSIFIED motion design and
//  invert media decks, all through the stdio MCP wire (no direct library calls):
//
//    SA10. SMART-ANIMATE batch10 (shapes)  — open_existing → per-slide:
//          list_shapes → adapt entrance effect per shape-KIND (visual/structure/
//          text buckets) → animate_shapes with cascade + per-slide theme rotation
//          → set_transitions_all with a DIVERSIFIED variant rotation (morph-rich)
//          → save
//    SA11. SMART-ANIMATE batch11 (wordart) — same recipe
//    IM7.  INVERT batch7 (media)           — open_existing → transform_shapes
//          { colorTransform:'invertLightness' } → save
//
//  "Smart" = the AI client (this harness) composes diversity from GENERIC
//  primitives: no two consecutive slides share an effect theme, each shape KIND
//  gets a different, fitting entrance, transitions rotate across ~9 families with
//  morph generously seeded (morph is the headline ask). The MCP stays primitive.
//
//  Each output is verified with read-only tooling (jszip + xmldom + decypher):
//    • unzip + XML well-formedness (0 parse errors)
//    • no dangling slide relationships
//    • SA: animation diversity (distinct presetIDs), transition diversity +
//      morph count, slides carrying <p:timing>
//    • IM: colour inversion happened AND media (video/audio) parts + rels survive
//    • PowerPoint COM open check via decypher.repairCheck (POWERPOINT_OPEN_OK)
// =============================================================================

import * as path from 'node:path'
import * as fs from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI_PATH = path.resolve(__dirname, '..', 'cli.mjs')
const OUT = path.resolve('outputs/smart_animate_media_20260528')
fs.mkdirSync(OUT, { recursive: true })

// ---------- stdio MCP client (identical transport to demo-edit-perfection) ----------
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
	async function init() { const r = await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'smart-animate-media', version: '1.0.0' }, capabilities: {} }); notify('notifications/initialized', {}); return r }
	return { callTool, init, close: () => { child.stdin.end(); child.kill() }, stats: () => ({ totalReq }) }
}

// =============================================================================
//  SMART MOTION DESIGN — composed entirely client-side from generic primitives.
// =============================================================================

// Per-slide effect PALETTES. Each slide draws a 3-effect palette; the palette
// rotates so consecutive slides never share one, and the slide's own shapes are
// split into contiguous "bands" that each get a DIFFERENT palette effect — so a
// slide is diversified WITHIN itself, not just across the deck (this is the
// "not always just the same" part, and it works even when every object is the
// same kind, as on these showcases). All are verified entrance-registry effects
// with unique presetIDs.
const SLIDE_PALETTES = [
	['fade', 'wipe', 'riseup'],
	['zoom', 'split', 'floatIn'],
	['wheel', 'fade', 'float'],
	['blinds', 'riseup', 'wipe'],
	['dissolve', 'peek', 'fade'],
	['split', 'float', 'zoom'],
	['wipe', 'floatIn', 'peek'],
	['fade', 'wheel', 'riseup'],
]
// Visual-media kinds get a soft, fitting reveal regardless of band — the
// "adapted by content" overlay (proven on batch7, which carries real video).
const VISUAL_KINDS = new Set(['image', 'media', 'model3d', 'online', 'picture'])
const VISUAL_EFFECTS = ['fade', 'zoom', 'float']
const SLIDE_DURATIONS = [600, 650, 700, 620, 680]

// Split an ordered index list into k roughly-equal contiguous bands.
function bands(indices, k) {
	if (indices.length === 0) return []
	const out = []
	const size = Math.ceil(indices.length / k)
	for (let i = 0; i < indices.length; i += size) out.push(indices.slice(i, i + size))
	return out
}

// Diversified transition rotation. Morph is the headline ask, so it is seeded
// generously (4/12) while still rotating across ~9 distinct families. Morph uses
// `p14dur`; the p14/p15 families use `duration`; standard families ignore both.
const TRANSITION_VARIANTS = [
	{ type: 'morph',   option: 'byObject', p14dur: 900,  speed: 'slow'   },
	{ type: 'push',    direction: 'left',  speed: 'medium' },
	{ type: 'wipe',    direction: 'left',  speed: 'medium' },
	{ type: 'morph',   option: 'byObject', p14dur: 700,  speed: 'medium' },
	{ type: 'cover',   direction: 'down',  speed: 'medium' },
	{ type: 'reveal',  speed: 'medium' },
	{ type: 'morph',   option: 'byWord',   p14dur: 800,  speed: 'medium' },
	{ type: 'split',   speed: 'medium' },
	{ type: 'zoom',    zoomFrom: 'in',     duration: 700, speed: 'medium' },
	{ type: 'wheel',   spokes: 6,          duration: 700, speed: 'medium' },
	{ type: 'morph',   option: 'byObject', p14dur: 1000, speed: 'slow'   },
	{ type: 'glitter', duration: 700, speed: 'medium' },
]

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)) }

// Apply the smart animation plan to every slide, then a diversified (morph-rich)
// transition rotation. Pure primitive calls; diversity is composed client-side:
//   • visual-media shapes (image/video) get a soft adapted reveal first
//   • remaining shapes are banded into 3 groups, each band a different palette
//     effect, cascading — so each slide shows multiple effects, and the palette
//     rotates per slide so no two consecutive slides match.
async function smartAnimate(mcp, deckId, slideCount) {
	let totalAnims = 0
	const effectsUsed = new Set()
	let slidesAnimated = 0
	for (let si = 0; si < slideCount; si++) {
		let shapes
		try { shapes = (await mcp.callTool('betterpptx.slide.list_shapes', { deckId, slideIndex: si })).shapes || [] }
		catch (e) { process.stderr.write(`    slide ${si}: list_shapes ${e.message}\n`); continue }
		if (shapes.length === 0) continue

		const palette = SLIDE_PALETTES[si % SLIDE_PALETTES.length]
		const visualEffect = VISUAL_EFFECTS[si % VISUAL_EFFECTS.length]
		const dur = SLIDE_DURATIONS[si % SLIDE_DURATIONS.length]
		const total = shapes.length
		const stagger = clamp(Math.round(1400 / total), 40, 140)

		const visualIdx = shapes.filter(s => VISUAL_KINDS.has(s.kind)).map(s => s.index)
		const flowIdx = shapes.filter(s => !VISUAL_KINDS.has(s.kind)).map(s => s.index)
		let offset = 0

		const apply = async (indices, effect) => {
			if (!indices.length) return
			try {
				const r = await mcp.callTool('betterpptx.slide.animate_shapes', {
					deckId, slideIndex: si,
					animation: { type: 'entrance', effect, duration: dur, delay: offset, trigger: 'afterPrevious' },
					indices, staggerMs: stagger,
				})
				totalAnims += r.animationsApplied
				if (r.animationsApplied > 0) { effectsUsed.add(effect); offset += indices.length * stagger }
			} catch (e) { process.stderr.write(`    slide ${si} (${effect}): ${e.message}\n`) }
		}

		// 1) Adapted reveal for any real media/images.
		await apply(visualIdx, visualEffect)
		// 2) Banded, multi-effect cascade for the rest.
		const grouped = bands(flowIdx, palette.length)
		for (let k = 0; k < grouped.length; k++) await apply(grouped[k], palette[k % palette.length])

		slidesAnimated++
	}
	// Diversified, morph-rich transition rotation across the whole deck.
	const tr = await mcp.callTool('betterpptx.deck.set_transitions_all', { deckId, variants: TRANSITION_VARIANTS })
	return { totalAnims, slidesAnimated, effectsUsed: [...effectsUsed], transitionsUpdated: tr.slidesUpdated }
}

// =============================================================================
//  VERIFICATION (read-only)
// =============================================================================
async function distinctColors(pptxPath) {
	const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath))
	const set = new Map()
	for (const name of Object.keys(zip.files)) {
		if (!/ppt\/slides\/slide\d+\.xml$/.test(name)) continue
		const xml = await zip.file(name).async('string')
		for (const mm of xml.matchAll(/srgbClr val="([0-9A-Fa-f]{6})"/g)) { const h = mm[1].toUpperCase(); set.set(h, (set.get(h) || 0) + 1) }
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

// Animation + transition diversity metrics straight from the serialized XML.
async function analyzeMotion(pptxPath) {
	const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath))
	const presetIds = new Set()
	const transitionKinds = new Set()
	let morphCount = 0, slidesWithTiming = 0, slidesWithTransition = 0
	for (const name of Object.keys(zip.files)) {
		if (!/ppt\/slides\/slide\d+\.xml$/.test(name)) continue
		const xml = await zip.file(name).async('string')
		if (xml.includes('<p:timing>')) slidesWithTiming++
		for (const mm of xml.matchAll(/presetID="(\d+)"/g)) presetIds.add(mm[1])
		// transition family detection
		let hasTrans = false
		const morphs = [...xml.matchAll(/<p159:morph\b/g)]; if (morphs.length) { morphCount += morphs.length; transitionKinds.add('morph'); hasTrans = true }
		for (const mm of xml.matchAll(/<p15:prstTrans\s+prst="([^"]+)"/g)) { transitionKinds.add(mm[1]); hasTrans = true }
		for (const mm of xml.matchAll(/<p14:(\w+)\b/g)) { if (!/^(dur|bld|media|sndTgt|extLst)/.test(mm[1])) { transitionKinds.add('p14:' + mm[1]); hasTrans = true } }
		for (const mm of xml.matchAll(/<p:(fade|push|cover|uncover|pull|wipe|split|reveal|cut|dissolve|circle|diamond|plus|wedge|wheel|comb|strips|checker|blinds|zoom|random|newsflash)\b/g)) { transitionKinds.add(mm[1]); hasTrans = true }
		if (hasTrans) slidesWithTransition++
	}
	return { presetIds: presetIds.size, presetIdList: [...presetIds].map(Number).sort((a, b) => a - b), transitionKinds: [...transitionKinds].sort(), morphCount, slidesWithTiming, slidesWithTransition }
}

// Media survival: count video/audio binary parts + media relationships.
const MEDIA_EXT = /\.(mp4|mov|avi|wmv|m4v|mpg|mpeg|mkv|webm|mp3|wav|m4a|aac|wma|ogg|flac)$/i
async function analyzeMedia(pptxPath) {
	const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath))
	let mediaParts = 0, mediaRels = 0
	const partNames = []
	for (const name of Object.keys(zip.files)) {
		if (/^ppt\/media\//.test(name) && MEDIA_EXT.test(name)) { mediaParts++; partNames.push(name.replace('ppt/media/', '')) }
		if (/\.rels$/.test(name)) {
			const xml = await zip.file(name).async('string')
			for (const mm of xml.matchAll(/Type="([^"]+)"/g)) { if (/\/(video|audio)$|relationships\/media$/.test(mm[1])) mediaRels++ }
		}
	}
	return { mediaParts, mediaRels, partNames: partNames.sort() }
}

// PowerPoint COM open-check, ISOLATED in a child process. The COM bridge is
// flaky on rapid back-to-back re-entry and can hard-crash the host process; by
// running each check in a throwaway child, a COM crash can never kill the run —
// the parent just records ok:false and moves on. One retry after a settle covers
// transient COM races.
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

function summariseInversion(before, after) {
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

	const allJobs = [
		{ id: 'SA10', label: 'SMART-ANIMATE batch10 (shapes)',  src: 'tmp_autonomous_test/Focused_ShapeStyles_Showcase_BATCH10_CURRENT_MANUALLY_FROZENREFERENCE.pptx', mode: 'animate' },
		{ id: 'SA11', label: 'SMART-ANIMATE batch11 (wordart)', src: 'tmp_autonomous_test/Focused_WordArtStyles_Showcase_BATCH11_FROZENREFERENCE.pptx', mode: 'animate' },
		{ id: 'IM7',  label: 'INVERT batch7 (media)',           src: 'tmp_autonomous_test/Focused_Media_Showcase_BATCH7_MANUALLYFROZEN.pptx', mode: 'invert' },
	]
	const only = (process.env.JOBS || '').split(',').map(s => s.trim()).filter(Boolean)
	const jobs = only.length ? allJobs.filter(j => only.includes(j.id)) : allJobs

	for (const job of jobs) {
		process.stderr.write(`\n==== JOB ${job.id}: ${job.label} ====\n`)
		const srcPath = path.resolve(job.src)
		if (!fs.existsSync(srcPath)) { process.stderr.write(`  SKIP (source missing): ${srcPath}\n`); continue }

		process.stderr.write(`  [wire] deck.open_existing …\n`)
		const opened = await mcp.callTool('betterpptx.deck.open_existing', { pptxPath: srcPath })
		process.stderr.write(`  [wire]   ${opened.slideCount} slides, ${opened.shapeCount} shapes, pkgParts=${opened.packagePassthrough?.partsCopied}\n`)
		const deckId = opened.deckId
		const outFile = path.join(OUT, `${path.basename(job.src, '.pptx')}.${job.mode}.pptx`)

		let editResult = {}, before = null
		if (job.mode === 'animate') {
			editResult = await smartAnimate(mcp, deckId, opened.slideCount)
			process.stderr.write(`  [wire] smart-animate → ${editResult.totalAnims} animations on ${editResult.slidesAnimated} slides; effects=[${editResult.effectsUsed.join(', ')}]; transitions on ${editResult.transitionsUpdated} slides\n`)
		} else if (job.mode === 'invert') {
			before = await distinctColors(srcPath)
			const r = await mcp.callTool('betterpptx.deck.transform_shapes', { deckId, colorTransform: 'invertLightness' })
			editResult = r
			process.stderr.write(`  [wire] transform_shapes invertLightness → shapesTouched=${r.shapesTouched}, colorsRemapped=${r.colorsRemapped}, rawXml=${r.rawXmlColorsRemapped}, pkgParts=${r.rawPackagePartsTouched}\n`)
		}

		await mcp.callTool('betterpptx.deck.save', { deckId, fileName: outFile })

		const integ = await verifyIntegrity(outFile)
		const ppt = await powerpointOpen(outFile)
		process.stderr.write(`  [verify] integrity: bytes=${integ.bytes} slides=${integ.slideCount} parseErrors=${integ.parseErrors} danglingRels=${integ.danglingRels}\n`)

		let pass = integ.parseErrors === 0 && integ.danglingRels === 0 && (!ppt.available || ppt.ok)
		let motion = null, media = null, inv = null

		if (job.mode === 'animate') {
			motion = await analyzeMotion(outFile)
			process.stderr.write(`  [verify] motion: timingSlides=${motion.slidesWithTiming} distinctPresetIDs=${motion.presetIds} [${motion.presetIdList.join(',')}]\n`)
			process.stderr.write(`  [verify] transitions: ${motion.slidesWithTransition} slides, kinds=[${motion.transitionKinds.join(', ')}], morphSlides=${motion.morphCount}\n`)
			pass = pass && motion.slidesWithTiming > 0 && motion.presetIds >= 8 &&
				motion.transitionKinds.length >= 5 && motion.morphCount > 0
		} else if (job.mode === 'invert') {
			const after = await distinctColors(outFile)
			inv = summariseInversion(before, after)
			const srcMedia = await analyzeMedia(srcPath)
			media = await analyzeMedia(outFile)
			process.stderr.write(`  [verify] colors: before=${inv.beforeDistinct} after=${inv.afterDistinct} survivedUnchanged=${inv.survivedUnchanged}\n`)
			process.stderr.write(`  [verify] media: src parts=${srcMedia.mediaParts} rels=${srcMedia.mediaRels} → out parts=${media.mediaParts} rels=${media.mediaRels}\n`)
			media.srcParts = srcMedia.mediaParts; media.srcRels = srcMedia.mediaRels
			pass = pass && inv.survivedUnchanged < inv.beforeDistinct &&
				media.mediaParts >= srcMedia.mediaParts && media.mediaRels >= srcMedia.mediaRels && srcMedia.mediaParts > 0
		}

		process.stderr.write(`  [verify] PowerPoint open: ${ppt.available ? (ppt.ok ? `POWERPOINT_OPEN_OK slides=${ppt.slides}` : 'OPEN_FAILED') : 'COM unavailable'}\n`)
		process.stderr.write(`  [verify] ${pass ? '✓ PASS' : '✗ FAIL'}\n`)
		report.push({ job: job.id, label: job.label, file: outFile, integ, motion, media, inversion: inv, edit: editResult, powerpoint: ppt, pass })
		// Persist after every job so partial results survive any later failure.
		try { fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ ok: report.every(r => r.pass), report }, null, 2)) } catch (_) {}
	}

	mcp.close()
	const ms = Date.now() - t0
	process.stderr.write('\n==========================================================\n')
	process.stderr.write('  SMART ANIMATE + MEDIA INVERT REPORT\n')
	process.stderr.write('==========================================================\n')
	for (const r of report) {
		process.stderr.write(`  ${r.pass ? '✓' : '✗'} ${r.job} ${r.label}\n`)
		process.stderr.write(`     ${path.basename(r.file)}  (${(r.integ.bytes / 1024 / 1024).toFixed(2)} MB, ${r.integ.slideCount} slides)\n`)
		if (r.motion) process.stderr.write(`     presetIDs=${r.motion.presetIds} transitions=[${r.motion.transitionKinds.join(',')}] morphSlides=${r.motion.morphCount}\n`)
		if (r.media) process.stderr.write(`     media parts ${r.media.srcParts}->${r.media.mediaParts} rels ${r.media.srcRels}->${r.media.mediaRels}\n`)
		process.stderr.write(`     parseErrors=${r.integ.parseErrors} danglingRels=${r.integ.danglingRels} ppt=${r.powerpoint.available ? (r.powerpoint.ok ? 'OPEN_OK' : 'FAIL') : 'n/a'}\n`)
	}
	process.stderr.write(`  elapsed: ${ms} ms · wire RPCs: ${mcp.stats().totalReq}\n`)
	process.stderr.write('==========================================================\n')
	process.stdout.write(JSON.stringify({ ok: report.every(r => r.pass), report }, null, 2) + '\n')
	if (!report.every(r => r.pass)) process.exit(1)
}

main().catch(e => { process.stderr.write(`\n[demo] FATAL: ${e && e.stack || e}\n`); process.exit(1) })
