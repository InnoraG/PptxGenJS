// IMG11 rendered slide-context corpus: blind owned-synthetic candidates are embedded
// into a real PPTX, reopened by PowerPoint COM, and measured with deterministic gates.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import sharp from 'sharp'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { evaluateImageQuality } from './quality/image-quality-gates.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_ALLOW_PRIMITIVE_TOOLS = '1'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
const { createMcpToolDispatcher } = await import('./engine.mjs')

const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const assetRoot = path.join(outputRoot, 'img11-blind-review')
const assets = Array.from({ length: 20 }, (_, index) => path.join(assetRoot, `c${String(index + 1).padStart(2, '0')}.png`))
const context = { sessionId: `verify-img11-slide-context-${Date.now()}` }
const dispatcher = createMcpToolDispatcher(context)
const callBetterPptxTool = (name, args = {}) => dispatcher.call(name, args)
let pass = 0
let fail = 0
const results = []
const ok = (name, condition, detail = '') => {
	const status = condition ? 'PASS' : 'FAIL'
	if (condition) pass += 1
	else fail += 1
	results.push({ name, status, detail })
	console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const resultData = (label, result) => {
	if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`)
	return result.data || result
}

console.log('IMG11 BLIND SLIDE-CONTEXT CORPUS (owned synthetic, COM rendered):')
ok('20 owned-synthetic candidate rasters exist', assets.every(file => fs.existsSync(file)))
if (!assets.every(file => fs.existsSync(file))) process.exit(1)

let deckId = null
let pptxPath = null
try {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'IMG11 blind slide-context corpus', audience: 'research maintainer', objective: 'measure rendered slide-context quality without labels',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', textPolicy: 'Use textBox for standalone text and textShape for text inside a PowerPoint shape.', requires: ['slide.id', 'content[].name', 'slide.notes', 'altText for visual proof', 'validation before save'] },
		contentStory: { audience: 'research maintainer', outcome: 'measure rendered slide-context quality without labels', remember: 'blind candidates remain visually distinct and editable' },
		visualDesign: { world: 'Owned synthetic blind-review canvas', framing: 'consistent wide image plates with minimal native scaffold' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'One governed clock coordinates builds and transitions.' },
		theme: { name: 'IMG11', palette: ['0B1220', '2563EB', '14B8A6', 'F59E0B', 'F8FAFC'], fontFace: 'Aptos' },
		sections: [{ id: 'blind', title: 'Blind candidates', slideIds: assets.map((_, index) => `c${String(index + 1).padStart(2, '0')}`) }],
		slides: assets.map((file, index) => ({
			id: `c${String(index + 1).padStart(2, '0')}`, title: 'Blind visual review candidate', role: 'evidence', message: 'Blind visual review candidate', layoutIntent: 'title-body', notes: 'Owned synthetic blind-review visual candidate',
			...(index === 1 ? { transition: { type: 'morph', option: 'byObject' } } : {}),
			content: [
				{ kind: 'title', name: `img11-c${String(index + 1).padStart(2, '0')}-title`, text: 'Blind visual review candidate', altText: 'Blind visual review candidate' },
				{ kind: 'image', name: `img11-c${String(index + 1).padStart(2, '0')}-image`, image: `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`, imageOptions: { sizing: { type: 'contain' } }, altText: 'Owned synthetic blind-review visual candidate' },
			],
		})),
	}
	const generated = resultData('generate_from_spec', await dispatcher.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'free', detail: 'summary' }))
	deckId = generated.deckId
	const validation = resultData('deck.validate', await callBetterPptxTool('betterpptx.deck.validate', { deckId }, context))
	const accessibility = resultData('deck.validate_accessibility', await callBetterPptxTool('betterpptx.deck.validate_accessibility', { deckId }, context))
	const quality = resultData('deck.validate_quality', await callBetterPptxTool('betterpptx.deck.validate_quality', { deckId }, context))
	ok('20-slide deck validates and has no accessibility issues', validation.valid === true && validation.issueCount === 0 && accessibility.passed === true && accessibility.score === 100 && quality.blockingIssues?.length === 0, JSON.stringify({ validation, accessibility, quality }))
	const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bpx-img11-context-'))
	const saved = resultData('deck.save', await callBetterPptxTool('betterpptx.deck.save', { deckId, fileName: 'img11-slide-context-corpus.pptx', outputDir: tempDir }, context))
	pptxPath = path.join(tempDir, 'img11-slide-context-corpus.pptx')
	fs.copyFileSync(pptxPath, path.join(outputRoot, 'img11-slide-context-corpus.pptx'))
	const bytes = fs.readFileSync(pptxPath)
	const zip = await JSZip.loadAsync(bytes)
	const names = Object.keys(zip.files)
	ok('saved deck is a valid PPTX ZIP with 20 slide XML parts', names.includes('[Content_Types].xml') && names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length === 20)
	ok('saved deck has no raw GLB/FBX export', !names.some(name => /\.(glb|fbx)$/i.test(name)))
	await fsp.rm(tempDir, { recursive: true, force: true })
} finally {
	if (deckId) { try { await callBetterPptxTool('betterpptx.deck.dispose', { deckId }) } catch {} }
}

const comScript = path.join(here, 'verify-img11-slide-context-com.ps1')
const run = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', comScript], { encoding: 'utf8', timeout: 180000 })
const output = `${run.stdout || ''}\n${run.stderr || ''}`
const jsonLines = output.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('{') && line.includes('img11-slide-context-powerpoint-com'))
let comReport = null
try { comReport = jsonLines.length ? JSON.parse(jsonLines.at(-1)) : null } catch {}
ok('PowerPoint COM script emitted a report', Boolean(comReport), output.slice(-1000))
ok('PowerPoint COM reopened and rendered all 20 slides', run.status === 0 && comReport?.failures === 0 && comReport?.checks >= 7, JSON.stringify(comReport))

const renderRoot = path.join(outputRoot, 'img11-slide-context-com')
const renderedFiles = Array.from({ length: 20 }, (_, index) => path.join(renderRoot, `slide-${String(index + 1).padStart(2, '0')}.png`))
const measurements = []
const renderedBuffers = new Map()
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function readRenderedFile(file) {
	for (let attempt = 0; attempt < 12; attempt += 1) {
		try {
			const buffer = await fsp.readFile(file)
			if (buffer.length > 1000) return buffer
		} catch {}
		await sleep(250)
	}
	return null
}
for (const file of renderedFiles) {
	const buffer = await readRenderedFile(file)
	if (!buffer) continue
	const quality = await evaluateImageQuality(buffer, { aspect: 'wide', minWidth: 1024, minHeight: 576, minEntropy: 0.3, minStdev: 2 })
	const meta = await sharp(buffer).metadata()
	const name = path.basename(file)
	renderedBuffers.set(name, buffer)
	measurements.push({ file: name, width: meta.width, height: meta.height, digest: crypto.createHash('sha256').update(buffer).digest('hex'), quality: quality.measurements, status: quality.status })
}
ok('20 PowerPoint-rendered slide PNGs exist', measurements.length === 20)
ok('all 20 rendered slide contexts pass deterministic raster gates', measurements.length === 20 && measurements.every(item => item.status === 'pass' && item.width === 1600 && item.height === 900))
ok('rendered slide-context corpus contains 20 byte-distinct candidates', new Set(measurements.map(item => item.digest)).size === 20)

const tiles = await Promise.all(measurements.map(item => sharp(renderedBuffers.get(item.file)).resize(320, 180, { fit: 'fill' }).png().toBuffer()))
await sharp({ create: { width: 1600, height: 720, channels: 4, background: '#0b111b' } })
	.composite(tiles.map((input, index) => ({ input, left: (index % 5) * 320, top: Math.floor(index / 5) * 180 })))
	.png().toFile(path.join(outputRoot, 'img11-slide-context-contact-sheet.png'))
ok('rendered 20-slide contact sheet is written', (await fsp.stat(path.join(outputRoot, 'img11-slide-context-contact-sheet.png'))).size > 1000)

const report = { schemaVersion: 'betterpptx.img11-slide-context-corpus.v1', ownedSyntheticOnly: true, customerImages: false, externalAi: false, labelsIncluded: false, slideCount: 20, comReport: 'betterpptx-mcp/outputs/img11-slide-context-com-report.json', measurements, checks: pass, failures: fail }
await fsp.writeFile(path.join(outputRoot, 'img11-slide-context-corpus-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed`)
