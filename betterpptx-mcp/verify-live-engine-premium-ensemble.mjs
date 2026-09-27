// Live proof that the normal Visual Director -> engine resolution path executes
// the bounded create/reference ensemble and returns one durable selected handle.
// Synthetic-only, private research, PPTX/COM verification; no semantic promotion.
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { buildVisualGenerationPlan } from './ir/visual-director.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const outputDir = path.join(outputRoot, 'live-engine-premium-ensemble')
const pptxPath = path.join(outputDir, 'live-engine-premium-ensemble.pptx')
const renderPath = path.join(outputDir, 'com-render', 'slide-1.png')
fs.mkdirSync(path.dirname(renderPath), { recursive: true })
const sharedAssetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-live-engine-ensemble-'))
const checks = []
let passed = 0
const ok = (name, condition, detail = '') => { checks.push({ name, status: condition ? 'PASS' : 'FAIL', detail }); if (condition) passed += 1; console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`) }
const dataOf = value => value?.data || value || {}

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Engine premium ensemble proof',
	audience: 'science lesson',
	objective: 'Explain a carbon-cycle system through one coherent illustration.',
	styleIntent: { artDirection: 'chalkline', mode: 'light' },
	theme: { palette: ['102A43', '2D6A4F', 'F4F1DE', 'FFFFFF'], fontFace: 'Aptos' },
	slides: [{
		id: 'engine-ensemble', title: 'The carbon cycle', role: 'teaching', message: 'Carbon moves among atmosphere, plants, soil and ocean.', layoutIntent: 'title-only',
		content: [{ kind: 'image', name: 'engine-ensemble-illustration', bbox: { x: 0.8, y: 1.05, w: 11.7, h: 5.7 }, visualIntent: {
			mode: 'generate', purpose: 'scientific teaching illustration', style: 'illustration', concept: 'premium carbon-cycle cutaway landscape with forest plants, exposed roots, layered soil, blue ocean and atmospheric sky',
			// The raster must remain text-free; exact factual labels are added as
			// native PowerPoint objects by the annotation route.
			noText: true, steps: 2, qualityProfile: 'premium', crossModelEnsemble: true, imageQualityCriterion: 'sharpness-first', researchOnly: true,
		} }],
	}],
}
const plan = buildVisualGenerationPlan({ spec, slide: spec.slides[0], block: spec.slides[0].content[0], rect: spec.slides[0].content[0].bbox })
ok('Visual Director carries an executable bounded ensemble plan', plan?.request?.candidatePlan?.crossModelEnsemble === true && plan?.request?.evaluationPlan?.sharpnessFirstResearch === true && plan?.request?.candidatePlan?.capabilityLanes?.includes('create') && plan?.request?.candidatePlan?.capabilityLanes?.includes('reference') && /No words, letters/i.test(plan?.request?.prompt || ''))

Object.assign(process.env, { BETTERPPTX_LOCAL_MAINTAINER: '1', BETTERPPTX_IMAGE_AUTHORING_RESEARCH_OVERRIDE: '1', BETTERPPTX_FREE_PREVIEW_SLIDES: '99', BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_TOOL_TIMEOUT_MS: '300000', BETTERPPTX_GEN_ASSET_STORE: 'local', BETTERPPTX_GEN_ASSET_DIR: sharedAssetDir })
const engine = await import('./engine.mjs')
const context = { sessionId: `engine-premium-ensemble-${Date.now().toString(36)}`, accountId: 'innorag', licenseId: 'image-authoring-research' }
const resolved = await engine.callBetterPptxTool('betterpptx.deck.generate_from_spec', { spec, phase: 'resolve', plan: 'premium', detail: 'full', billingConfirmed: true }, context)
const resolvedData = dataOf(resolved)
const lockedSpec = resolvedData.lockedSpec
const resolvedAsset = resolvedData.resolvedAssets?.find(item => item.kind === 'generatedImage')
const lockedImage = lockedSpec?.slides?.[0]?.content?.find(item => item.name === 'engine-ensemble-illustration')?.image
ok('engine resolves one durable generic handle', resolved?.ok === true && /^gen:\/\/image\//.test(String(lockedImage || '')), String(resolved?.error?.message || ''))
const selection = resolvedAsset?.qualityGate?.ensembleSelection
ok('engine quality evidence records a selected lane and ranked candidates', selection?.status === 'selected' && ['create', 'reference'].includes(selection.selectedLane) && Array.isArray(selection.ranked) && selection.ranked.length >= 2)
const resolvedAgain = await engine.callBetterPptxTool('betterpptx.deck.generate_from_spec', { spec, phase: 'resolve', plan: 'premium', detail: 'full', billingConfirmed: true }, context)
const resolvedAgainData = dataOf(resolvedAgain)
const resolvedAgainAsset = resolvedAgainData.resolvedAssets?.find(item => item.kind === 'generatedImage')
const reusedSelection = resolvedAgainAsset?.qualityGate?.ensembleSelection
ok('second engine resolve reuses the persisted ensemble decision', resolvedAgain?.ok === true && reusedSelection?.reused === true && reusedSelection?.selectionIndexHash === selection?.selectionIndexHash && resolvedAgainAsset?.handle === resolvedAsset?.handle)
ok('engine resolution stays provider/model neutral', !/flux|klein|schnell|modal|provider|model/i.test(JSON.stringify(resolvedAsset || {})))
ok('engine output remains research-only', resolvedAsset?.license?.attributionRequired === false && resolvedAsset?.handle && resolvedAsset?.qualityGate?.semantic?.status !== 'pass')

const committed = lockedSpec ? await engine.callBetterPptxTool('betterpptx.deck.generate_from_spec', { spec: lockedSpec, phase: 'commit', plan: 'premium', detail: 'summary' }, context) : null
const committedData = dataOf(committed)
const deckId = committedData.deckId
ok('selected engine output commits to an editable deck', committed?.ok === true && Boolean(deckId))
const saved = deckId ? await engine.callBetterPptxTool('betterpptx.deck.save', { deckId, fileName: path.basename(pptxPath), outputDir }, context) : null
ok('selected engine output saves as PPTX', saved?.ok === true && fs.existsSync(pptxPath))
try { if (deckId) await engine.callBetterPptxTool('betterpptx.deck.dispose', { deckId }, context) } catch {}

if (fs.existsSync(pptxPath)) {
	const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath))
	const names = Object.keys(zip.files)
	ok('engine package is PPTX-only and contains a slide', names.includes('ppt/slides/slide1.xml') && !names.some(name => /\.(glb|fbx)$/i.test(name)))
}
const ps = `$ErrorActionPreference='Stop'; $pp=New-Object -ComObject PowerPoint.Application; $p=$pp.Presentations.Open('${pptxPath.replace(/'/g, "''")}', $false, $false, $false); $count=$p.Slides.Count; $p.Slides.Item(1).Export('${renderPath.replace(/'/g, "''")}', 'PNG', 1600, 900); $p.Close(); $pp.Quit(); Write-Output ('SLIDES=' + $count)`
const com = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf8', timeout: 180000, windowsHide: true })
const comText = `${com.stdout || ''}\n${com.stderr || ''}`
ok('PowerPoint COM reopens and exports the selected engine deck', com.status === 0 && /SLIDES=1/.test(comText) && fs.existsSync(renderPath), comText.trim().slice(-240))

const report = {
	schemaVersion: 'betterpptx.live-engine-premium-ensemble.v1',
	status: passed === checks.length ? 'research-live-engine-premium-ensemble-pass' : 'research-live-engine-premium-ensemble-fail',
	checks: checks.length, failures: checks.length - passed, passed, durableReuse: reusedSelection?.reused === true, selectionIndexHash: selection?.selectionIndexHash || null,
	selectedLane: selection?.selectedLane || null,
	ranked: selection?.ranked || [],
	outputPptx: 'betterpptx-mcp/outputs/live-engine-premium-ensemble/live-engine-premium-ensemble.pptx',
	render: 'betterpptx-mcp/outputs/live-engine-premium-ensemble/com-render/slide-1.png',
	customerImages: false, consentedHumanImages: false, training: false, externalAi: false, productionPromotion: false,
	checksDetail: checks,
}
await fsp.writeFile(path.join(outputRoot, 'live-engine-premium-ensemble-report.json'), JSON.stringify(report, null, 2) + '\n')
try { fs.rmSync(sharedAssetDir, { recursive: true, force: true }) } catch {}
console.log(`\nLIVE ENGINE PREMIUM ENSEMBLE: ${passed}/${checks.length} checks passed`)
process.exit(passed === checks.length ? 0 : 1)
