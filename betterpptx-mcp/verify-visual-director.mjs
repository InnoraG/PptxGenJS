// Authoring Excellence contextual-image gate. Offline: no network or generation credentials.
// Proves staged context -> World/layout-aware brief -> metered resolution -> locked spec -> commit.
import path from 'node:path'
import * as os from 'node:os'
import fs from 'node:fs/promises'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
process.env.BETTERPPTX_ASSETS_ROOT = path.resolve(here, '..')
process.env.BETTERPPTX_CREDENTIAL_STORE = path.join(os.tmpdir(), `bpx-visual-director-${process.pid}.json`)
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'

const { createMcpToolDispatcher } = await import('./engine.mjs')
const { buildVisualGenerationPlan } = await import('./ir/visual-director.mjs')
const { cacheGeneratedImage, promptHashFor } = await import('./assets/image-gen-providers.mjs')
const { classifyBillingTool } = await import('./billing/classifier.mjs')
const { estimateHeavyCost } = await import('./billing/estimator.mjs')
const dispatcher = createMcpToolDispatcher({ sessionId: `visual-director-${process.pid}` })
const callBetterPptxTool = (name, args = {}) => dispatcher.call(name, args)

let pass = 0, fail = 0
const checks = []
const ok = (name, condition, detail = '') => {
	checks.push({ name, status: condition ? 'PASS' : 'FAIL', detail })
	if (condition) { pass++; console.log(`  ok   ${name}`) }
	else { fail++; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}
const dataOf = value => value?.data || value || {}

console.log('VISUAL DIRECTOR (offline contextual lifecycle):')

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Contextual visual gate',
	audience: 'risk-aware enterprise operations leaders',
	objective: 'make workflow fragmentation feel urgent and controllable',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', textPolicy: 'Use shape only for geometry. Use textBox for standalone text and textShape for text inside a PowerPoint shape.', requires: ['slide.id', 'content[].name', 'slide.notes', 'altText for visual proof', 'validation before save'] },
	contentStory: { audience: 'risk-aware enterprise operations leaders', outcome: 'make workflow fragmentation feel urgent and controllable', remember: 'one governed operating system replaces disconnected work' },
	visualDesign: { world: 'Luxe controlled system', framing: 'asymmetric editorial grid' },
	designSystem: { visualAssetEcosystem: { imageryDirection: 'tactile dark materials, dramatic side lighting, one precise gold focal accent' } },
	motionTime: { masterClock: 'authored slide timeline', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'One governed clock coordinates builds and transitions.' },
	styleIntent: { artDirection: 'luxe', mode: 'dark', density: 'low' },
	theme: { name: 'Gate', palette: ['17110D', 'C89A4B', '7D5E36', 'E8D9BD', 'F5EFE4'], fontFace: 'Aptos' },
	sections: [{ id: 'main', title: 'Main', slideIds: ['s1'] }],
	slides: [{
		id: 's1', title: 'From fragmentation to control', role: 'tension-to-resolution opener', message: 'Disconnected workflows converge into one controlled system',
		layoutIntent: 'copy-left-image-right', notes: 'Visual Director gate.',
		content: [
			{ kind: 'title', name: 'title', text: 'One operating system' },
			{ kind: 'image', name: 'hero', imageTreatment: 'world', visualIntent: {
				mode: 'auto', purpose: 'conceptual hero', concept: 'many fragmented pathways converging into one calm controlled core',
				subjectPlacement: 'right', negativeSpace: 'left', consistencyGroup: 'controlled-system', noText: true,
				qualityProfile: 'premium', crossModelEnsemble: true, budget: { maxCandidates: 2, maxRepairs: 1 },
				imageQualityCriterion: 'sharpness-first', researchOnly: true,
			} },
		],
	}],
}

const dry = await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
	spec, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', includeCallPlan: true,
})
const dryData = dataOf(dry)
const visual = dryData.visualDirection?.plans?.[0]
const prompt = visual?.request?.prompt || ''
ok('dry-run is mutation-free and plans exactly one contextual visual', dry?.ok === true && dryData.mutationFree === true && dryData.visualDirection?.generatedVisualCount === 1)
ok('staged audience and objective reach the generation brief', /risk-aware enterprise operations leaders/i.test(prompt) && /workflow fragmentation feel urgent/i.test(prompt), prompt.slice(0, 180))
ok('staged role and imagery system reach the generation brief', /tension-to-resolution opener/i.test(prompt) && /dramatic side lighting/i.test(prompt), prompt.slice(-220))
ok('World, palette, and copy-space composition reach the brief', /warm cinematic image/i.test(prompt) && /#C89A4B/i.test(prompt) && /left 45% of the frame visually quiet/i.test(prompt) && /low-edge-density/i.test(prompt))
ok('generated briefs explicitly protect the no-text raster boundary', /signs, posters, chalkboards, screens, monitors, displays, control panels, projectors, worksheets, book pages/i.test(prompt) && /visible rectangular screen or monitor/i.test(prompt) && /No words, letters, labels, numbers/i.test(prompt))
ok('final resolved geometry selects the correct square generation class', visual?.layout?.aspect === 'square' && visual?.layout?.targetRect?.w > 0)
ok('visual quality policy carries focal, quiet-space and no-text intent', visual?.request?.focalRegion?.x === 48 && visual?.request?.quietRegion?.x === 0 && visual?.request?.quietRegion?.w === 45 && visual?.request?.noText === true)
const topPlan = buildVisualGenerationPlan({ spec, slide: { ...spec.slides[0], layoutIntent: 'image-left-copy-right' }, block: { kind: 'image', name: 'top-quiet', visualIntent: { mode: 'generate', concept: 'quiet interior', subjectPlacement: 'bottom', negativeSpace: 'top' } }, rect: { x: 1, y: 1, w: 5, h: 5 } })
const bottomPlan = buildVisualGenerationPlan({ spec, slide: { ...spec.slides[0], layoutIntent: 'image-left-copy-right' }, block: { kind: 'image', name: 'bottom-quiet', visualIntent: { mode: 'generate', concept: 'quiet interior', subjectPlacement: 'top', negativeSpace: 'bottom' } }, rect: { x: 1, y: 1, w: 5, h: 5 } })
ok('top and bottom quiet-space directions map to the declared copy-safe side', topPlan?.request?.quietRegion?.y === 0 && bottomPlan?.request?.quietRegion?.y === 55 && topPlan?.request?.quietRegion?.h === 45 && bottomPlan?.request?.quietRegion?.h === 45)
ok('premium requests compile a bounded cross-capability candidate plan', visual?.candidatePlan?.profile === 'premium' && visual?.candidatePlan?.initialCandidates === 2 && visual?.candidatePlan?.maxRepairs === 1 && visual?.candidatePlan?.hardGenerationCallCeiling === 4 && visual?.candidatePlan?.crossModelEnsemble === true && JSON.stringify(visual?.candidatePlan?.capabilityLanes) === JSON.stringify(['create', 'reference']))
ok('candidate plan exposes no provider/model names and prices the hard ceiling', !/FLUX|Klein|Schnell|Modal|provider/i.test(JSON.stringify(visual?.candidatePlan || {})) && visual?.cost?.generationCount === 4 && visual?.cost?.estimatedUpperBoundUsd === 0.04, JSON.stringify({ candidatePlan: visual?.candidatePlan, cost: visual?.cost }))
ok('evaluation plan makes deterministic gates and research sharpness policy explicit', visual?.evaluationPlan?.hardGates?.includes('no-unwanted-readable-text-or-brand-marks') && visual?.evaluationPlan?.sharpnessFirstResearch === true && /sharpness-proxy/.test(visual?.evaluationPlan?.selection || '') && visual?.evaluationPlan?.independentJudge?.autoAccept === false)
ok('repair policy and safe fallback order are bounded and durable', visual?.repairPolicy?.maxAttempts === 1 && visual?.repairPolicy?.preserveAcceptedPixelsOutsideDiagnosis === true && visual?.repairPolicy?.abstainWhenUnresolved === true && JSON.stringify(visual?.fallbackOrder) === JSON.stringify(['accepted-cache', 'licensed-stock', 'native-abstract', 'abstain']))
ok('public dry-run exposes an opaque per-asset revision fingerprint', /^asset-revision:\/\/[a-f0-9]{24}$/.test(visual?.revisionFingerprint || '') && !/FLUX|Klein|Schnell|Modal|private-test|prompt/i.test(visual?.revisionFingerprint || ''))
ok('public dry-run declares selective revision, retention, and no-spend policy', dryData.visualDirection?.revisionPolicy?.schemaVersion === 'betterpptx.visual-revision-policy.v1' && dryData.visualDirection.revisionPolicy.unchanged?.generationCalls === 0 && dryData.visualDirection.revisionPolicy.semanticChange?.action === 'invalidate-changed-asset-only' && dryData.visualDirection.revisionPolicy.dependentSeries?.assetBytesInvalidated === false && dryData.visualDirection.revisionPolicy.dryRun?.imageServiceCalls === 0 && dryData.visualDirection.revisionPolicy.fingerprint?.excluded?.includes('raw-prompt'))
ok('visual direction carries a deterministic editable treatment plan', visual?.treatmentPlan?.status === 'ready' && visual?.treatmentPlan?.editableFallback === 'native-image-wrapper')
ok('dry-run declares generatedImage resolution without service execution', dryData.resolution?.required === true && dryData.resolution?.requirements?.some(item => item.kind === 'generatedImage'))
ok('dry-run prices generation as the generate_image heavy operation', dryData.billing?.specEstimate?.estimatedCredits > 0 && dryData.billing?.specEstimate?.operations?.some(item => item.tool === 'betterpptx.assets.generate_image'))
ok('billing classifier and cache-aware estimator cover image generation', classifyBillingTool('betterpptx.assets.generate_image').category === 'heavy' && estimateHeavyCost('betterpptx.assets.generate_image', {}, { imageCount: 1 }) > 0 && estimateHeavyCost('betterpptx.assets.generate_image', {}, { cached: true }) === 0)

// Seed the exact deterministic request into the cache. Resolve must reuse it without any host.
const hash = promptHashFor(visual.request)
const pngBuffer = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#17213A"/><circle cx="720" cy="370" r="240" fill="#C89A4B"/><path d="M80 800 C280 560 500 610 900 690 L900 930 L80 930 Z" fill="#44BBA4"/></svg>')).png().toBuffer()
const png = pngBuffer.toString('base64')
cacheGeneratedImage({
	promptHash: hash, dataUri: `data:image/png;base64,${png}`, contentType: 'image/png',
	width: 1024, height: 1024, provider: 'private-test-host', model: 'private-test-model', gpuSeconds: 0,
	ocr: { status: 'complete', text: '' },
	license: { license: 'Apache-2.0', attributionRequired: false, commercialUse: 'allowed' },
})

const resolved = await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
	spec, phase: 'resolve', commitMode: 'createNew', plan: 'premium', detail: 'summary', billingConfirmed: true,
})
const resolvedData = dataOf(resolved)
const lockedSpec = resolvedData.lockedSpec
const lockedImage = lockedSpec?.slides?.[0]?.content?.find(item => item.name === 'hero')?.image
const resolvedImage = resolvedData.resolvedAssets?.find(item => item.kind === 'generatedImage')
ok('resolve locks the durable generic image handle into the spec', resolved?.ok === true && lockedImage === `gen://image/${hash}`)
ok('resolve reports passing structural plus deterministic quality evidence', resolvedImage?.qualityGate?.status === 'pass' && resolvedImage?.qualityGate?.scope === 'structural-raster' && resolvedImage?.qualityGate?.deterministic?.status === 'pass' && /does not claim semantic/i.test(resolvedImage?.qualityGate?.note || ''), JSON.stringify(resolvedImage?.qualityGate?.deterministic || resolvedImage?.qualityGate || {}))
ok('public resolved metadata contains no provider/model provenance', !/private-test-host|private-test-model/i.test(JSON.stringify(resolvedImage || {})))

const lockedDry = await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
	spec: lockedSpec, phase: 'lockedDryRun', commitMode: 'createNew', plan: 'premium', detail: 'summary',
})
ok('locked dry-run is deterministic with no remaining image resolution', lockedDry?.ok === true && dataOf(lockedDry).resolution?.required === false)

const commit = await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
	spec: lockedSpec, phase: 'commit', commitMode: 'createNew', plan: 'premium', detail: 'summary',
})
ok('locked contextual image commits through the normal editable image wrapper', commit?.ok === true, commit?.error?.message || '')

if (commit?.data?.deckId || commit?.deckId) {
	try { await callBetterPptxTool('betterpptx.deck.dispose', { deckId: commit?.data?.deckId || commit?.deckId }) } catch {}
}
await fs.writeFile(path.join(here, 'outputs', 'visual-director-verification-report.json'), JSON.stringify({
	schemaVersion: 'betterpptx.visual-director-verification.v2', status: fail ? 'research-visual-director-fail' : 'research-visual-director-pass', checks: checks.length, failures: fail, passed: pass, checksDetail: checks, customerImages: false, externalAi: false, training: false,
}, null, 2) + '\n')
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
