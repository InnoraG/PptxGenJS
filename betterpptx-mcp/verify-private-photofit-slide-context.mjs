// Research-only photofit slide-context corpus. It packages real private-research
// photofit outputs into an editable PPTX and validates actual Microsoft PowerPoint
// reopen/render behavior. No public/customer artifact or durable production handle.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import JSZip from 'jszip'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { evaluateImageQuality } from './quality/image-quality-gates.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_ALLOW_PRIMITIVE_TOOLS = '1'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
const { callBetterPptxTool } = await import('./engine.mjs')

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, '..')
const outputRoot = path.join(here, 'outputs')
const scope = JSON.parse(await fsp.readFile(path.join(projectRoot, 'consentedHumanAsset', 'photofit-scope.json'), 'utf8'))
const hiresAccount = String(process.env.BETTERPPTX_PHOTOFIT_HIRES_ACCOUNT || '').trim()
const artifactPrefix = String(process.env.BETTERPPTX_PHOTOFIT_ARTIFACT_PREFIX || (hiresAccount ? `private-hires-${hiresAccount}-slide-context` : 'private-photofit-slide-context')).trim()
const hiresSourcePrefix = String(process.env.BETTERPPTX_PHOTOFIT_HIRES_SOURCE_PREFIX || `private-hires-head-neck-${hiresAccount}`).trim()
const slides = [
	...(hiresAccount ? [
		{ id: 'body-baseline', title: `Hi-res photofit · ${hiresAccount} full-body baseline`, file: `${hiresSourcePrefix}-baseline-${hiresAccount}.png`, altText: 'Private research high-resolution full-body baseline portrait', sizing: 'contain' },
		{ id: 'body-reembedded', title: `Hi-res photofit · ${hiresAccount} head re-embedded`, file: `${hiresSourcePrefix}-reembed-${hiresAccount}.png`, altText: 'Private research high-resolution full-body portrait with head detail re-embedded', sizing: 'contain' },
		{ id: 'head-detail', title: `Hi-res photofit · ${hiresAccount} dedicated head`, file: `${hiresSourcePrefix}-head-${hiresAccount}.png`, altText: 'Private research high-resolution dedicated head and shoulders portrait', sizing: 'contain' },
	] : [
		{ id: 'body-baseline', title: 'Photofit research · full-body baseline', file: 'private-photofit-klein-innorag.png', altText: 'Private research full-body photofit baseline portrait', sizing: 'contain' },
		{ id: 'body-reembedded', title: 'Photofit research · head-only re-embedded', file: 'private-head-reembedded-innorag.png', altText: 'Private research full-body portrait with head-only detail re-embedded', sizing: 'contain' },
		{ id: 'head-detail', title: 'Photofit research · dedicated head detail', file: 'private-head-only-innorag.png', altText: 'Private research dedicated high-detail head and shoulders portrait', sizing: 'contain' },
	]),
]
const context = { sessionId: `verify-private-photofit-slide-context-${Date.now()}` }
let pass = 0
let fail = 0
const checks = []
const ok = (name, condition, detail = '') => {
	const status = condition ? 'PASS' : 'FAIL'
	if (condition) pass += 1
	else fail += 1
	checks.push({ name, status, detail })
	console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const resultData = (label, result) => {
	if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`)
	return result.data || result
}
const digest = value => crypto.createHash('sha256').update(value).digest('hex')

console.log('PRIVATE PHOTOFIT SLIDE CONTEXT (consented subject, local research artifact):')
ok('scope forbids production/public/customer use and training', scope.scope?.localPptxDemo === true && scope.scope?.cloudProduction === false && scope.scope?.publicEndpointUse === false && scope.scope?.customerDelivery === false && scope.scope?.modelTraining === false)
const files = slides.map(slide => path.join(outputRoot, slide.file))
ok('three photofit research rasters are available locally', files.every(file => fs.existsSync(file)))

let deckId = null
let pptxPath = null
try {
	const deck = resultData('deck.new', await callBetterPptxTool('betterpptx.deck.new', { title: 'Private photofit research slide context' }, context))
	deckId = deck.deckId
	let version = deck.deckVersion
	for (const [index, slide] of slides.entries()) {
		const added = resultData(`slide.add ${slide.id}`, await callBetterPptxTool('betterpptx.slide.add', { deckId, deckVersion: version, ...(index === 1 ? { transition: { type: 'morph', option: 'byObject' } } : {}) }, context))
		version = added.deckVersion
		const title = resultData(`slide.add_text ${slide.id}`, await callBetterPptxTool('betterpptx.slide.add_text', { deckId, slideIndex: index, deckVersion: version, text: slide.title, options: { x: 0.45, y: 0.22, w: 10.8, h: 0.32, fontSize: 14, bold: true, objectName: `photofit-${slide.id}-title` } }, context))
		version = title.deckVersion
		// PptxGenJS sizing uses the top-level image box as the source aspect
		// reference and `sizing` as the destination box.  Keep the portrait
		// source dimensions here so PowerPoint renders the real photograph
		// without horizontally stretching it inside the 16:9 slide region.
		const sourceMeta = await sharp(files[index]).metadata()
		const target = { x: 1.1, y: 0.88, w: 11.1, h: 6.05 }
		const sourceRatio = Number(sourceMeta.width || 1) / Number(sourceMeta.height || 1)
		const fitted = slide.sizing === 'contain'
			? { w: target.h * sourceRatio, h: target.h, x: target.x + (target.w - target.h * sourceRatio) / 2, y: target.y }
			: target
		const image = resultData(`slide.add_image ${slide.id}`, await callBetterPptxTool('betterpptx.slide.add_image', { deckId, slideIndex: index, deckVersion: version, options: { data: `data:image/png;base64,${fs.readFileSync(files[index]).toString('base64')}`, x: fitted.x, y: fitted.y, w: fitted.w, h: fitted.h, sizing: { type: slide.sizing, ...target }, altText: slide.altText, objectName: `photofit-${slide.id}-image` } }, context))
		version = image.deckVersion
	}
	const validation = resultData('deck.validate', await callBetterPptxTool('betterpptx.deck.validate', { deckId }, context))
	const accessibility = resultData('deck.validate_accessibility', await callBetterPptxTool('betterpptx.deck.validate_accessibility', { deckId }, context))
	ok('private photofit deck validates with accessibility score 100', validation.valid === true && validation.issueCount === 0 && accessibility.passed === true && accessibility.score === 100)
	const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bpx-private-photofit-slide-'))
	resultData('deck.save', await callBetterPptxTool('betterpptx.deck.save', { deckId, fileName: `${artifactPrefix}.pptx`, outputDir: tempDir }, context))
	pptxPath = path.join(tempDir, `${artifactPrefix}.pptx`)
	fs.copyFileSync(pptxPath, path.join(outputRoot, `${artifactPrefix}.pptx`))
	const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath))
	const names = Object.keys(zip.files)
	ok('saved research PPTX has three slide XML parts and no GLB/FBX export', names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length === 3 && !names.some(name => /\.(glb|fbx)$/i.test(name)))
	await fsp.rm(tempDir, { recursive: true, force: true })
} finally {
	if (deckId) { try { await callBetterPptxTool('betterpptx.deck.dispose', { deckId }, context) } catch {} }
}

const comScript = path.join(here, 'verify-private-photofit-slide-context-com.ps1')
const run = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', comScript], { encoding: 'utf8', timeout: 180000 })
const output = `${run.stdout || ''}\n${run.stderr || ''}`
const jsonLines = output.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('{') && line.includes('private-photofit-slide-context-powerpoint-com'))
let comReport = null
try { comReport = jsonLines.length ? JSON.parse(jsonLines.at(-1)) : null } catch {}
ok('PowerPoint COM script emitted a report', Boolean(comReport), output.slice(-900))
ok('PowerPoint COM reopened and rendered all three research slides', run.status === 0 && comReport?.failures === 0 && comReport?.slideCount === 3)

const renderRoot = path.join(outputRoot, `${artifactPrefix}-com`)
const rendered = slides.map((_, index) => path.join(renderRoot, `slide-${String(index + 1).padStart(2, '0')}.png`))
const measurements = []
for (const [index, file] of rendered.entries()) {
	const buffer = await fsp.readFile(file).catch(() => null)
	if (!buffer) continue
	const quality = await evaluateImageQuality(buffer, { aspect: 'wide', minWidth: 1024, minHeight: 576, minEntropy: 0.3, minStdev: 2 })
	const meta = await sharp(buffer).metadata()
	measurements.push({ id: slides[index].id, file: path.basename(file), width: meta.width, height: meta.height, digest: digest(buffer), quality: quality.measurements, status: quality.status })
}
ok('three PowerPoint-rendered research slides pass raster gates', measurements.length === 3 && measurements.every(item => item.status === 'pass' && item.width === 1600 && item.height === 900))
ok('rendered research slides remain byte-distinct', new Set(measurements.map(item => item.digest)).size === 3)
const tiles = await Promise.all(measurements.map(item => sharp(path.join(renderRoot, item.file)).resize(533, 300, { fit: 'fill' }).png().toBuffer()))
await sharp({ create: { width: 1599, height: 300, channels: 4, background: '#0b111b' } }).composite(tiles.map((input, index) => ({ input, left: index * 533, top: 0 }))).png().toFile(path.join(outputRoot, `${artifactPrefix}-contact-sheet.png`))
ok('rendered photofit slide-context contact sheet is written', (await fsp.stat(path.join(outputRoot, `${artifactPrefix}-contact-sheet.png`))).size > 1000)

const report = { schemaVersion: 'betterpptx.private-photofit-slide-context.v1', status: fail === 0 ? 'research-live-pass' : 'research-live-fail', scope: { subjectRef: scope.subjectRef, executionClass: 'local_windows_host', cloudProduction: false, publicEndpointUse: false, persistentCloudStorage: false, modelTraining: false }, slides, hiresAccount: hiresAccount || null, comReport: `betterpptx-mcp/outputs/${artifactPrefix}-com-report.json`, measurements, checks: pass, failures: fail, pptx: `betterpptx-mcp/outputs/${artifactPrefix}.pptx`, contactSheet: `betterpptx-mcp/outputs/${artifactPrefix}-contact-sheet.png` }
await fsp.writeFile(path.join(outputRoot, `${artifactPrefix}-report.json`), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed`)
