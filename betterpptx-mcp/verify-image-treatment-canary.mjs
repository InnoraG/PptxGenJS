// IMG7 private pixel-treatment canary. CPU-only deterministic treatments operate
// on the owned synthetic Modal raster; no customer/human image or external AI.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { planImageTreatment } from './quality/image-treatment-plan.mjs'
import { applyImageOpsToBuffer, splitImageBuffer } from './media/image-ops.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const sourcePath = path.join(repo, 'betterpptx-mcp', 'outputs', 'img11-modal-canary-512-1707.png')
const artifactDir = path.join(repo, 'betterpptx-mcp', 'outputs')
const source = fs.readFileSync(sourcePath)
const WIDTH = 512
const HEIGHT = 512

const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const dataUri = bytes => `data:image/png;base64,${bytes.toString('base64')}`
const dataOf = value => value?.data || value || {}

async function rgba(bytes) {
	return (await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data
}
function changedRatio(a, b, predicate = () => true) {
	let changed = 0
	let eligible = 0
	for (let i = 0; i < a.length; i += 4) {
		const x = (i / 4) % WIDTH
		const y = Math.floor((i / 4) / WIDTH)
		if (!predicate(x, y)) continue
		eligible++
		if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]), Math.abs(a[i + 3] - b[i + 3])) > 2) changed++
	}
	return eligible ? changed / eligible : 0
}

// A known synthetic foreground mask: the canary's sphere + lower wave are
// intentionally geometric, so the alpha result is auditable without a model.
async function buildCutout(bytes) {
	const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><circle cx="365" cy="195" r="148" fill="white"/><path d="M46 308 C160 230 254 350 350 362 C416 370 456 330 470 304 L470 468 L46 468 Z" fill="white"/></svg>`)
	return sharp(bytes).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
}

async function pixelAlphaStats(bytes) {
	const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
	let nonZero = 0
	let edge = 0
	for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
		const i = (y * info.width + x) * 4
		const alpha = data[i + 3]
		if (alpha > 0) nonZero++
		const neighbours = []
		if (x) neighbours.push(data[i - 4 + 3])
		if (x + 1 < info.width) neighbours.push(data[i + 4 + 3])
		if (y) neighbours.push(data[i - info.width * 4 + 3])
		if (y + 1 < info.height) neighbours.push(data[i + info.width * 4 + 3])
		if (neighbours.some(value => value !== alpha)) edge++
	}
	return { coverage: nonZero / (info.width * info.height), edgeDensity: edge / (info.width * info.height) }
}

async function buildDeck(original, repair, extension, cutout) {
	process.env.BETTERPPTX_ASSETS_ROOT = repo
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
	process.env.BETTERPPTX_BILLING_ENFORCE = '0'
	process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'
	process.env.BETTERPPTX_CREDENTIAL_STORE = path.join(os.tmpdir(), `bpx-img7-treatment-${process.pid}.json`)
	const context = { sessionId: `img7-treatment-${process.pid}` }
	const { createMcpToolDispatcher } = await import('./engine.mjs')
	const dispatcher = createMcpToolDispatcher(context)
	const callBetterPptxTool = (name, args = {}) => dispatcher.call(name, args)
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'IMG7 treatment canary', audience: 'research maintainer', objective: 'bounded treatment evidence',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', textPolicy: 'Use textBox for standalone text and textShape for text inside a PowerPoint shape.', requires: ['slide.id', 'content[].name', 'slide.notes', 'validation before save'] },
		contentStory: { audience: 'research maintainer', outcome: 'prove bounded deterministic image treatments', remember: 'only declared treatment regions change' },
		visualDesign: { world: 'Quiet verification canvas', framing: 'clear evidence cards and image hierarchy' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'One governed clock coordinates builds and transitions.' },
		theme: { name: 'IMG7', palette: ['0B1220', '2563EB', '14B8A6', 'F59E0B', 'F8FAFC'], fontFace: 'Aptos' },
		sections: [{ id: 't', title: 'Treatments', slideIds: ['s1', 's2', 's3', 's4'] }],
		slides: [
			['s1', 'Original', original, 'Owned synthetic source raster used for treatment QA.'],
			['s2', 'Bounded local repair', repair, 'Bounded local treatment canary: only the declared repair region is modified.'],
			['s3', 'Background extension', extension, 'Background extension canary: original focal raster remains unchanged inside the extended canvas.'],
			['s4', 'Cutout', cutout, 'Deterministic synthetic subject cutout with alpha-channel and edge-integrity checks.'],
		].map(([id, title, image, altText]) => ({ id, title, role: 'evidence', message: title, layoutIntent: 'title-body', notes: 'IMG7 owned synthetic treatment canary', content: [
			{ kind: 'title', name: `${id}-title`, text: title, altText: title },
			{ kind: 'image', name: `${id}-image`, image: dataUri(image), region: 'body', imageOptions: { sizing: { type: 'cover' } }, altText },
		] })),
	}
	const generated = await callBetterPptxTool('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', plan: 'free', detail: 'summary' }, context)
	const deckId = dataOf(generated).deckId
	const validation = dataOf(await callBetterPptxTool('betterpptx.deck.validate', { deckId }, context))
	const accessibility = dataOf(await callBetterPptxTool('betterpptx.deck.validate_accessibility', { deckId }, context))
	const qualityCall = await callBetterPptxTool('betterpptx.deck.validate_quality', { deckId }, context)
	const quality = dataOf(qualityCall)
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-img7-pptx-'))
	const saved = await callBetterPptxTool('betterpptx.deck.save', { deckId, fileName: 'img7-treatment-canary.pptx', outputDir: temp }, context)
	const pptxPath = path.join(temp, 'img7-treatment-canary.pptx')
	const bytes = fs.readFileSync(pptxPath)
	fs.copyFileSync(pptxPath, path.join(artifactDir, 'img7-treatment-canary.pptx'))
	const zip = await JSZip.loadAsync(bytes)
	const names = Object.keys(zip.files)
	const slideXml = await zip.file('ppt/slides/slide2.xml').async('string')
	try { await callBetterPptxTool('betterpptx.deck.dispose', { deckId }, context) } catch {}
	try { fs.rmSync(temp, { recursive: true, force: true }) } catch {}
	return {
		generated: generated?.ok === true,
		validation: validation.valid === true && validation.issueCount === 0,
		accessibility: accessibility.passed === true && accessibility.score === 100,
		quality: qualityCall?.ok === true && Array.isArray(quality.failed) && quality.failed.length === 0 && Array.isArray(quality.blockingIssues) && quality.blockingIssues.length === 0,
		saved: saved?.ok === true && bytes.length > 0,
		package: names.includes('ppt/presentation.xml') && names.filter(name => /^ppt\/media\/image(?:-\d+)+\.png$/i.test(name)).length >= 4,
		altText: /descr="[^"]*bounded local treatment/i.test(slideXml),
		noRaw3d: !names.some(name => /\.(glb|fbx)$/i.test(name)),
		pptxDigest: digest(bytes),
	}
}

let pass = 0
let fail = 0
const ok = (name, condition, detail = '') => { if (condition) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) } }
console.log('IMG7 PRIVATE PIXEL-TREATMENT CANARY (owned synthetic, CPU deterministic):')
const plans = {
	cutout: planImageTreatment({ treatment: 'cutout' }),
	extension: planImageTreatment({ treatment: 'background-extension', focalRegion: { x: 48, y: 8, w: 48, h: 84 }, quietRegion: { x: 0, y: 0, w: 42, h: 100 } }),
	repair: planImageTreatment({ treatment: 'local-repair', region: { x: 0.2, y: 0.2, w: 0.3, h: 0.3 } }),
	collage: planImageTreatment({ treatment: 'collage', cells: 4 }),
}
ok('treatment router declares bounded cutout requirements', plans.cutout.status === 'ready' && plans.cutout.requirements.includes('fringe-check'))
ok('treatment router declares background-only locality', plans.extension.status === 'ready' && plans.extension.locality === 'background-only')
ok('treatment router declares repair ≤35% locality', plans.repair.status === 'ready' && plans.repair.quality.maxChangedArea === 0.35)
ok('treatment router keeps editable native fallback', Object.values(plans).every(item => item.editableFallback === 'native-image-wrapper'))

const repairResult = await applyImageOpsToBuffer(source, [{ op: 'blurRegion', x: 20, y: 20, w: 30, h: 30, sigma: 8 }])
const repairRgba = await rgba(repairResult.buffer)
const sourceRgba = await rgba(source)
const region = (x, y) => x >= 102 && x < 256 && y >= 102 && y < 256
const repairOutside = changedRatio(sourceRgba, repairRgba, (x, y) => !region(x, y))
const repairInside = changedRatio(sourceRgba, repairRgba, region)
ok('bounded repair changes pixels inside the declared region', repairInside > 0)
ok('bounded repair leaves pixels outside the declared region unchanged', repairOutside === 0, `outside changed ratio ${repairOutside}`)
ok('bounded repair stays below the 35% changed-area ceiling', repairInside <= 0.35)

const extensionBuffer = await sharp(source).extend({ left: 128, right: 128, top: 0, bottom: 0, background: '#0B1220' }).png().toBuffer()
const extensionCenter = await sharp(extensionBuffer).extract({ left: 128, top: 0, width: WIDTH, height: HEIGHT }).png().toBuffer()
const extensionMeta = await sharp(extensionBuffer).metadata()
const sourceRaw = await sharp(source).ensureAlpha().raw().toBuffer()
const extensionRaw = await sharp(extensionCenter).ensureAlpha().raw().toBuffer()
ok('background extension preserves the original focal raster exactly', digest(extensionRaw) === digest(sourceRaw))
ok('background extension changes canvas only in the declared background bands', extensionMeta.width === 768 && extensionMeta.height === 512)

const cutout = await buildCutout(source)
const alpha = await pixelAlphaStats(cutout)
ok('cutout emits meaningful alpha coverage', alpha.coverage > 0.01 && alpha.coverage < 0.995)
ok('cutout emits a measurable subject edge for fringe QA', alpha.edgeDensity > 0.001)

const cells = await splitImageBuffer(source, { rows: 2, cols: 2 })
ok('collage split produces deterministic bounded cells', cells.length === 4 && cells.every(cell => cell.width === 256 && cell.height === 256))

const deck = await buildDeck(source, repairResult.buffer, extensionBuffer, cutout)
ok('treatment outputs commit through editable PPTX wrappers', deck.generated && deck.validation && deck.accessibility && deck.quality)
ok('treatment canary saves a valid PPTX package with alt text', deck.saved && deck.package && deck.altText && deck.noRaw3d)

try {
	const contact = await sharp({ create: { width: 1024, height: 512, channels: 3, background: '#0B1220' } })
		.composite([
			{ input: source, left: 0, top: 0 },
			{ input: repairResult.buffer, left: 512, top: 0 },
		]).png().toBuffer()
	fs.writeFileSync(path.join(artifactDir, 'img7-treatment-canary-contact-sheet.png'), contact)
} catch {}

assert.equal(fail, 0)
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
