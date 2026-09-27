// Live source-less proof for hybrid annotated illustrations. This performs one
// bounded audited Schnell generation, then compiles native labels/arrows around
// the locked image into a PPTX and reopens/exports it through PowerPoint COM.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import JSZip from 'jszip'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { routeVisualNeed } from './ir/visual-source-router.mjs'
import { invokeSemanticJudgeWorker } from './quality/semantic-judge-worker-client.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const outputDir = path.join(outputRoot, 'live-native-annotation-deck')
const pptxPath = path.join(outputDir, 'live-carbon-cycle-native-annotations.pptx')
const renderDir = path.join(outputDir, 'com-render')
fs.mkdirSync(renderDir, { recursive: true })
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const labels = [
	{ text: 'ATMOSPHERE', target: 'atmosphere' },
	{ text: 'PLANTS', target: 'plants' },
	{ text: 'SOIL', target: 'soil' },
	{ text: 'OCEAN', target: 'ocean' },
]
const arrows = [
	{ target: 'atmosphere' }, { target: 'plants' }, { target: 'soil' }, { target: 'ocean' },
]
const intent = {
	mode: 'generate', purpose: 'scientific teaching illustration', style: 'illustration', steps: 2,
	concept: 'high-end carbon cycle cutaway landscape with lush forest, exposed roots and layered soil, blue ocean and atmospheric clouds',
	noText: true, nativeAnnotations: { placement: 'image-aware', labels, arrows },
}
const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Carbon Cycle — Live Native Annotations', audience: 'science lesson', objective: 'Explain carbon movement across reservoirs.',
	styleIntent: { artDirection: 'chalkline', mode: 'light' }, theme: { palette: ['102A43', '2D6A4F', 'F4F1DE', 'FFFFFF'], fontFace: 'Aptos' },
	slides: [{ id: 'carbon-live', title: 'The carbon cycle', role: 'teaching', message: 'Carbon moves among atmosphere, plants, soil and ocean.', layoutIntent: 'title-only', background: { color: 'FFFFFF' }, content: [{ kind: 'image', name: 'carbon-live-illustration', bbox: { x: 0.8, y: 1.1, w: 11.7, h: 5.6 }, visualIntent: intent }] }],
}
const checks = []
const ok = (name, condition, detail = '') => { checks.push({ name, status: condition ? 'PASS' : 'FAIL', detail }); console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`) }
const route = routeVisualNeed({ spec, slide: spec.slides[0], block: spec.slides[0].content[0], intent })
ok('source-less annotated request selects hybrid route', route.decision === 'hybrid-generated-native-annotations' && route.safeToGenerate === true)

Object.assign(process.env, { BETTERPPTX_LOCAL_MAINTAINER: '1', BETTERPPTX_IMAGE_AUTHORING_RESEARCH_OVERRIDE: '1', BETTERPPTX_FREE_PREVIEW_SLIDES: '99', BETTERPPTX_BILLING_ENFORCE: '0' })
const engine = await import('./engine.mjs')
const context = { sessionId: `live-native-annotation-${Date.now().toString(36)}`, accountId: 'innorag', licenseId: 'image-authoring-research' }
const resolved = await engine.callBetterPptxTool('betterpptx.deck.generate_from_spec', { spec, phase: 'resolve', plan: 'premium', detail: 'full', billingConfirmed: true }, context)
const resolvedData = resolved?.data || resolved || {}
const lockedSpec = resolvedData.lockedSpec
const lockedImage = lockedSpec?.slides?.[0]?.content?.find(item => item.name === 'carbon-live-illustration')?.image
ok('bounded live Schnell resolution returns a locked image handle', resolved?.ok === true && /^gen:\/\/image\//.test(String(lockedImage || '')), String(resolved?.error?.message || ''))
const lockedAnnotations = lockedSpec?.slides?.[0]?.content?.find(item => item.name === 'carbon-live-illustration')?.visualIntent?.nativeAnnotations
ok('image-aware placement records deterministic anchors', lockedAnnotations?.placement === 'image-aware-deterministic-v1' && lockedAnnotations.labels?.length === 4 && lockedAnnotations.labels.every(label => label.autoPlaced === true && Number.isFinite(label.anchorX) && Number.isFinite(label.anchorY)))
const labelBoxes = (lockedAnnotations?.labels || []).map(label => ({ x: Number(label.x), y: Number(label.y), w: Number(label.w), h: Number(label.h) }))
const labelOverlap = labelBoxes.some((left, i) => labelBoxes.some((right, j) => i < j && left.x < right.x + right.w && left.x + left.w > right.x && left.y < right.y + right.h && left.y + left.h > right.y))
ok('image-aware label boxes do not overlap', !labelOverlap)
const anchorByTarget = new Map((lockedAnnotations?.labels || []).map(label => [label.target, label]))
const arrowAnchorsAccurate = (lockedAnnotations?.arrows || []).every(arrow => {
	const label = anchorByTarget.get(arrow.target)
	if (!label) return false
	const x = arrow.flipH ? Number(arrow.x) + Number(arrow.w) : Number(arrow.x)
	const y = arrow.flipV ? Number(arrow.y) + Number(arrow.h) : Number(arrow.y)
	return Math.abs(x - Number(label.anchorX)) <= 0.002 && Math.abs(y - Number(label.anchorY)) <= 0.002
})
ok('native arrows terminate at their detected image anchors', arrowAnchorsAccurate)
const committed = lockedSpec ? await engine.callBetterPptxTool('betterpptx.deck.generate_from_spec', { spec: lockedSpec, phase: 'commit', plan: 'premium', detail: 'summary' }, context) : null
const committedData = committed?.data || committed || {}
const deckId = committedData.deckId
ok('locked annotated spec commits to a deck', committed?.ok === true && Boolean(deckId))
const saved = deckId ? await engine.callBetterPptxTool('betterpptx.deck.save', { deckId, fileName: path.basename(pptxPath), outputDir }, context) : null
ok('live annotated PPTX saves', saved?.ok === true && fs.existsSync(pptxPath))
try { if (deckId) await engine.callBetterPptxTool('betterpptx.deck.dispose', { deckId }, context) } catch {}

let slideXml = ''
if (fs.existsSync(pptxPath)) {
	const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath))
	const names = Object.keys(zip.files)
	slideXml = await zip.file('ppt/slides/slide1.xml')?.async('string') || ''
	ok('live package includes embedded raster and slide XML', names.includes('ppt/slides/slide1.xml') && names.some(name => /^ppt\/media\/image/i.test(name)))
	ok('live labels remain native in slide XML', labels.every(label => slideXml.includes(`>${label.text}<`)))
	ok('live arrow objects remain native and named', (slideXml.match(/native-annotation-arrow/g) || []).length >= 4)
	ok('live package remains PPTX-only', !names.some(name => /\.(glb|fbx)$/i.test(name)))
}

const renderPath = path.join(renderDir, 'slide-1.png')
const ps = `$ErrorActionPreference='Stop'; $pp=New-Object -ComObject PowerPoint.Application; $p=$pp.Presentations.Open('${pptxPath.replace(/'/g, "''")}', $false, $false, $false); $count=$p.Slides.Count; $p.Slides.Item(1).Export('${renderPath.replace(/'/g, "''")}', 'PNG', 1600, 900); $p.Close(); $pp.Quit(); Write-Output ('SLIDES=' + $count)`
const com = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf8', timeout: 180000, windowsHide: true })
const comText = `${com.stdout || ''}\n${com.stderr || ''}`
ok('PowerPoint COM reopens and exports live annotated deck', com.status === 0 && /SLIDES=1/.test(comText) && fs.existsSync(renderPath), comText.trim().slice(-300))
if (fs.existsSync(renderPath)) {
	const meta = await sharp(renderPath).metadata().catch(() => null)
	ok('live COM render has a valid canvas', meta?.width === 1600 && meta?.height === 900)
}

// Optional private semantic review: deterministic pixel geometry remains the hard
// gate, while the approved private Qwen worker provides a second opinion on the
// rendered slide's semantic attachment and readability. The adapter strips all
// provider/runtime details before this report is written.
let qwenReview = { status: 'abstain', reason: 'render-unavailable' }
if (fs.existsSync(renderPath)) {
	const dataUri = `data:image/png;base64,${fs.readFileSync(renderPath).toString('base64')}`
	qwenReview = await invokeSemanticJudgeWorker({
		dataUri,
		request: {
			slideMessage: 'Carbon cycle teaching illustration with four native PowerPoint annotations: ATMOSPHERE points to sky/clouds, PLANTS points to vegetation, SOIL points to exposed layered soil and roots, OCEAN points to the water basin. Labels must be readable, non-overlapping, and arrows must terminate on their intended regions.',
			purpose: 'scientific teaching illustration',
			world: 'bright cutaway landscape with forest, roots, soil, ocean and sky',
			semanticBrief: { composition: { noText: false, qualityCriterion: 'sharpness-first', aspect: '16:9', style: 'clean educational illustration with native editable annotations' } },
		},
		timeoutMs: 600000,
	})
	const scores = qwenReview?.scorecard?.scores || {}
	const semanticPass = qwenReview.status === 'complete'
		&& Number(scores.messageFit) >= 4.5
		&& Number(scores.worldFit) >= 4.5
		&& Number(scores.composition) >= 4
	ok('private Qwen semantic placement review (advisory)', semanticPass, qwenReview.status === 'complete' ? `messageFit=${scores.messageFit}, composition=${scores.composition}, worldFit=${scores.worldFit}` : qwenReview.reason || 'unavailable')
}

const passed = checks.filter(item => item.status === 'PASS').length
const report = { schemaVersion: 'betterpptx.live-native-annotation-authoring.v1', status: passed === checks.length ? 'research-live-native-annotation-pass' : 'research-live-native-annotation-fail', checks: checks.length, failures: checks.length - passed, passed, provider: 'modal', requestedLane: 'schnell', lockedImageHandle: lockedImage || null, labels, nativeArrows: 4, placementPolicy: 'image-aware-deterministic-v1', qwenVerifier: 'optional-private-semantic-placement-review', qwenReview, gpuCostBounded: true, outputPptx: 'betterpptx-mcp/outputs/live-native-annotation-deck/live-carbon-cycle-native-annotations.pptx', render: 'betterpptx-mcp/outputs/live-native-annotation-deck/com-render/slide-1.png', customerImages: false, externalAi: false, training: false, outputDigest: fs.existsSync(pptxPath) ? digest(fs.readFileSync(pptxPath)) : null, checksDetail: checks }
fs.writeFileSync(path.join(outputRoot, 'live-native-annotation-authoring-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`\nLIVE NATIVE ANNOTATION AUTHORING: ${passed}/${checks.length} checks passed`)
process.exit(passed === checks.length ? 0 : 1)
