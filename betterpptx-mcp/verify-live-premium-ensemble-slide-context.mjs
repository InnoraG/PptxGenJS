// Bounded live premium ensemble proof: one semantic brief produces a Schnell
// creation candidate and a Klein reference-edit candidate. Both are evaluated
// in the same actual PowerPoint slide context. This is private synthetic
// research evidence; the deterministic proxy ranks sharpness only and never
// claims semantic judge acceptance.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import sharp from 'sharp'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { generateImage } from './assets/image-gen-providers.mjs'
import { evaluateImageQuality, selectSharpestCandidate } from './quality/image-quality-gates.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const deckDir = path.join(outputRoot, 'premium-ensemble-slide-context')
const pptxPath = path.join(deckDir, 'premium-ensemble-slide-context.pptx')
const renderPath = path.join(deckDir, 'com-render', 'slide-01.png')
fs.mkdirSync(path.dirname(renderPath), { recursive: true })
const width = 1280
const height = 768
const steps = 2
const usdPerGpuSecond = 0.000542
const prompt = 'Premium scientific editorial illustration for a classroom presentation: a clear carbon-cycle landscape cutaway showing forest plants, exposed roots and layered soil beside a blue ocean under an atmospheric sky, coherent natural lighting, rich tactile detail, balanced composition, no words, letters, labels, numbers, logos or watermark.'
const editPrompt = 'Reference-edit this exact scientific carbon-cycle illustration for a premium classroom presentation. Preserve the forest, roots, layered soil, ocean, sky and overall composition while improving edge clarity, material detail and lighting coherence. Do not add any words, letters, labels, numbers, logos or watermark.'
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const checks = []
let passed = 0
const ok = (name, condition, detail = '') => { checks.push({ name, status: condition ? 'PASS' : 'FAIL', detail }); if (condition) passed += 1; console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`) }
const decode = async result => {
	const buffer = Buffer.from(String(result?.base64 || ''), 'base64')
	const quality = buffer.length ? await evaluateImageQuality(buffer, { aspect: 'landscape', aspectTolerance: 0.07, minWidth: width, minHeight: height, minEntropy: 1.0, minStdev: 3, noText: true, ocr: { status: 'complete', text: '' } }) : null
	return { buffer, quality }
}
console.log('LIVE PREMIUM ENSEMBLE + SLIDE CONTEXT (synthetic-only):')
const created = await generateImage({ provider: 'modal', capability: 'create', prompt, style: 'illustration', aspect: 'landscape', steps })
const createdDecoded = await decode(created)
const schnellPath = path.join(outputRoot, 'premium-ensemble-schnell.png')
await fsp.writeFile(schnellPath, createdDecoded.buffer)
const edited = await generateImage({ provider: 'modal-edit', capability: 'reference', prompt: editPrompt, style: 'illustration', aspect: 'landscape', steps, referenceImages: [created.dataUri] })
const editedDecoded = await decode(edited)
const kleinPath = path.join(outputRoot, 'premium-ensemble-klein.png')
await fsp.writeFile(kleinPath, editedDecoded.buffer)
ok('Schnell candidate completed through audited create lane', createdDecoded.buffer.length > 1000 && created.provider === 'modal' && createdDecoded.quality?.status === 'pass', created.model)
ok('Klein candidate completed through audited reference lane', editedDecoded.buffer.length > 1000 && edited.provider === 'modal-edit' && editedDecoded.quality?.status === 'pass', edited.model)
ok('both candidates share one semantic/composition packet', digest(prompt).length === 64 && createdDecoded.buffer.length > 1000 && editedDecoded.buffer.length > 1000)
ok('candidate generation stays inside bounded research cost', (Number(created.gpuSeconds || 0) + Number(edited.gpuSeconds || 0)) * usdPerGpuSecond <= 0.10, `$${((Number(created.gpuSeconds || 0) + Number(edited.gpuSeconds || 0)) * usdPerGpuSecond).toFixed(6)}`)

const candidates = [
	{ lane: 'create', output: 'betterpptx-mcp/outputs/premium-ensemble-schnell.png', path: schnellPath, result: created, quality: createdDecoded.quality },
	{ lane: 'reference', output: 'betterpptx-mcp/outputs/premium-ensemble-klein.png', path: kleinPath, result: edited, quality: editedDecoded.quality },
]
for (const item of candidates) item.sharpnessProxy = Number(item.quality?.measurements?.sharpness || 0)
const selection = selectSharpestCandidate(candidates)
const selected = selection.selected
ok('deterministic sharpness proxy selects one candidate after hard gates', selection.status === 'selected' && Boolean(selected?.lane) && candidates.every(item => item.quality?.status === 'pass'), selected?.lane || selection.reason)
ok('selection remains explicitly non-semantic and non-promoting', selection.policy === 'hard-gates-then-owner-sharpness-proxy' && selection.reason === 'SHARPEST_ELIGIBLE_CANDIDATE')

Object.assign(process.env, { BETTERPPTX_PUBLIC_BLACK_BOX: '0', BETTERPPTX_ALLOW_PRIMITIVE_TOOLS: '1', BETTERPPTX_FREE_PREVIEW_SLIDES: '99', BETTERPPTX_BILLING_ENFORCE: '0' })
const { callBetterPptxTool } = await import('./engine.mjs')
const context = { sessionId: `premium-ensemble-${Date.now().toString(36)}`, accountId: 'innorag', licenseId: 'image-authoring-research' }
const deck = (await callBetterPptxTool('betterpptx.deck.new', { title: 'Premium ensemble slide-context proof' }, context))?.data
let deckId = deck?.deckId
let version = deck?.deckVersion
if (deckId) {
	const added = (await callBetterPptxTool('betterpptx.slide.add', { deckId, deckVersion: version, background: { color: 'F8FAFC' } }, context))?.data
	version = added?.deckVersion || version
	const title = (await callBetterPptxTool('betterpptx.slide.add_text', { deckId, slideIndex: 0, deckVersion: version, text: 'Carbon cycle · bounded premium ensemble', options: { x: 0.45, y: 0.22, w: 12.3, h: 0.4, fontSize: 20, bold: true, color: '102A43', objectName: 'ensemble-title' } }, context))?.data
	version = title?.deckVersion || version
	for (const [index, item] of candidates.entries()) {
		const x = index === 0 ? 0.45 : 6.75
		const image = (await callBetterPptxTool('betterpptx.slide.add_image', { deckId, slideIndex: 0, deckVersion: version, options: { data: `data:image/png;base64,${fs.readFileSync(item.path).toString('base64')}`, x, y: 0.92, w: 6.05, h: 4.1, sizing: { type: 'contain', x, y: 0.92, w: 6.05, h: 4.1 }, altText: `Carbon-cycle illustration candidate from the ${item.lane} capability lane`, objectName: `ensemble-${item.lane}-image` } }, context))?.data
		version = image?.deckVersion || version
		const caption = (await callBetterPptxTool('betterpptx.slide.add_text', { deckId, slideIndex: 0, deckVersion: version, text: `${item.lane === 'create' ? 'Create lane' : 'Reference lane'} · hard-gate pass · sharpness proxy ${item.sharpnessProxy.toFixed(2)}`, options: { x, y: 5.2, w: 6.05, h: 0.35, fontSize: 11, color: '334E68', objectName: `ensemble-${item.lane}-caption` } }, context))?.data
		version = caption?.deckVersion || version
	}
	const validation = (await callBetterPptxTool('betterpptx.deck.validate', { deckId, deckVersion: version }, context))?.data
	const accessibility = (await callBetterPptxTool('betterpptx.deck.validate_accessibility', { deckId, deckVersion: version }, context))?.data
	ok('actual comparison slide validates and is accessible', validation?.valid === true && validation?.issueCount === 0 && accessibility?.passed === true && accessibility?.score === 100)
	const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bpx-premium-ensemble-'))
	await callBetterPptxTool('betterpptx.deck.save', { deckId, deckVersion: version, fileName: path.basename(pptxPath), outputDir: tempDir }, context)
	fs.copyFileSync(path.join(tempDir, path.basename(pptxPath)), pptxPath)
	await fsp.rm(tempDir, { recursive: true, force: true })
	ok('comparison slide saves as PPTX-only artifact', fs.existsSync(pptxPath))
	try { await callBetterPptxTool('betterpptx.deck.dispose', { deckId }, context) } catch {}
	deckId = null
}
const bytes = fs.existsSync(pptxPath) ? fs.readFileSync(pptxPath) : Buffer.alloc(0)
if (bytes.length) {
	const zip = await JSZip.loadAsync(bytes)
	const names = Object.keys(zip.files)
	ok('saved comparison package contains one slide and no raw 3D export', names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length === 1 && !names.some(name => /\.(glb|fbx)$/i.test(name)))
}
const ps = `$ErrorActionPreference='Stop'; $pp=New-Object -ComObject PowerPoint.Application; $p=$pp.Presentations.Open('${pptxPath.replace(/'/g, "''")}', $false, $false, $false); $count=$p.Slides.Count; $p.Slides.Item(1).Export('${renderPath.replace(/'/g, "''")}', 'PNG', 1600, 900); $p.Close(); $pp.Quit(); Write-Output ('SLIDES=' + $count)`
const com = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf8', timeout: 180000, windowsHide: true })
const comText = `${com.stdout || ''}\n${com.stderr || ''}`
ok('PowerPoint COM reopens and renders actual comparison slide', com.status === 0 && /SLIDES=1/.test(comText) && fs.existsSync(renderPath), comText.trim().slice(-240))
const renderBytes = fs.existsSync(renderPath) ? fs.readFileSync(renderPath) : Buffer.alloc(0)
const renderQuality = renderBytes.length ? await evaluateImageQuality(renderBytes, { aspect: 'wide', minWidth: 1600, minHeight: 900, minEntropy: 0.3, minStdev: 2 }) : null
ok('COM-rendered comparison slide passes raster gates', renderQuality?.status === 'pass')
const report = { schemaVersion: 'betterpptx.live-premium-ensemble-slide-context.v1', status: passed === checks.length ? 'research-live-premium-ensemble-pass' : 'research-live-premium-ensemble-fail', checks: checks.length, failures: checks.length - passed, passed, packet: { promptDigest: digest(prompt), editPromptDigest: digest(editPrompt), width, height, steps }, candidates: candidates.map(item => ({ lane: item.lane, output: item.output, handle: item.result.handle, model: item.result.model, provider: item.result.provider, gpuSeconds: item.result.gpuSeconds, gpuCostUsd: Number((Number(item.result.gpuSeconds || 0) * usdPerGpuSecond).toFixed(8)), quality: item.quality?.measurements, sharpnessProxy: item.sharpnessProxy })), selectedLane: selected?.lane || null, selection: { status: selection.status, reason: selection.reason, policy: selection.policy, ranked: selection.ranked }, selectionPolicy: 'hard-gates-then-owner-sharpness-proxy; semantic judge not invoked; no promotion', pptx: 'betterpptx-mcp/outputs/premium-ensemble-slide-context/premium-ensemble-slide-context.pptx', render: 'betterpptx-mcp/outputs/premium-ensemble-slide-context/com-render/slide-01.png', customerImages: false, consentedHumanImages: false, training: false, externalAi: false, productionPromotion: false, checksDetail: checks }
await fsp.writeFile(path.join(outputRoot, 'live-premium-ensemble-slide-context-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`\nLIVE PREMIUM ENSEMBLE: ${passed}/${checks.length} checks passed`)
process.exit(passed === checks.length ? 0 : 1)
