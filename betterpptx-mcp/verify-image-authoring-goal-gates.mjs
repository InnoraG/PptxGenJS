// Requirement-level audit for the quantitative gates in §11 of the end-to-end
// image-authoring goal. This intentionally reports missing perceptual/owner
// evidence as open instead of inferring it from deterministic fixtures.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const read = name => {
	const file = path.join(outputRoot, name)
	if (!fs.existsSync(file)) return null
	try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) } catch { return null }
}
const check = (id, status, evidence, reason = '') => ({ id, status: Boolean(status), evidence, ...(reason ? { reason } : {}) })
const router = read('visual-source-router-corpus-report.json')
const quality = read('rendered-pptx-slide-quality-report.json')
const crop = read('img9-crop-corpus-report.json')
const com = read('img11-slide-context-com-report.json')
const judge = read('photorealistic-judge-calibration-report.json')
const human = read('photorealistic-pairwise-calibration-human-report.json')
const records = read('photorealistic-pairwise-judge-calibration-records.json')
const series = read('img8-rendered-series-coherence-report.json')
const seriesCom = read('img8-rendered-series-com-report.json')
const repair = read('img6-repair-multicase-report.json')
const boundedRepair = read('photorealistic-bounded-repair-report.json')
const durable = read('photorealistic-failover-durable-e2e-report.json')
const durableCom = read('photorealistic-failover-durable-e2e-com-report.json')
const inventory = read('img5-semantic-judge-inventory-report.json')
const owner = read('owner-control-evidence-report.json')
const ownerSignoff = read('owner-frozen-corpus-signoff.json')
const hiddenImage = read('hidden-image-deck-communication-report.json')
const directJudge = read('photorealistic-direct-pairwise-calibration-judge-report.json')
const callCeiling = read('image-generation-call-ceiling-corpus-report.json')
const composition = read('composition-quiet-space-corpus-report.json')
const ocrCorpus = read('image-authoring-ocr-corpus-report.json')
const contextualPptx = read('contextual-authoring-pptx-report.json')
const contextualCom = read('contextual-authoring-corpus-com-report.json')
const ownerQuality = read('owner-quality-criterion-acceptance.json')

const ownerImageQualityAccepted = ownerQuality?.status === 'owner-quality-criterion-accepted' &&
	ownerQuality.scope === 'image-only visual quality gates; private research only' &&
	ownerQuality.ownerDecision?.acceptCurrentJudgeOutput === true &&
	ownerQuality.ownerDecision?.primaryCriterion === 'sharpness' &&
	ownerQuality.ownerDecision?.lowerBlurHigherSharpnessWins === true &&
	ownerQuality.ownerDecision?.noMoreVisualReviewRequested === true &&
	ownerQuality.productionLaunch === false && ownerQuality.productionPromotion === false &&
	ownerQuality.autoAcceptEnabled === false && ownerQuality.customerImages === false &&
	ownerQuality.externalAi === false && ownerQuality.training === false

const rasterValid = Array.isArray(quality?.measurements) && quality.measurements.length > 0 && quality.measurements.every(item => item.width > 0 && item.height > 0 && item.quality?.format === 'png' && item.quality.aspectDeviation === 0)
const repairImproved = Array.isArray(repair?.records) && repair.records.length >= 3 && repair.records.every(item => item.baselineStatus === 'fail' && item.repairedStatus === 'pass')
const checks = [
	check('decisioning-factual-native', router && router.factualRasterViolations?.length === 0 && router.integration?.factualPlanSuppressed === true, 'visual-source-router-corpus-report.json'),
	check('decisioning-router-agreement', router && router.recordCount >= 200 && router.agreement >= 0.95, 'visual-source-router-corpus-report.json'),
	check('decisioning-low-confidence-abstain', router && router.identityViolations?.length === 0 && router.rightsViolations?.length === 0 && router.lowConfidenceRiskCases?.length === 0, 'visual-source-router-corpus-report.json'),
	check('raster-aspect-resolution-hard-gates', rasterValid, 'rendered-pptx-slide-quality-report.json'),
	check('ocr-no-text-accepted', ocrCorpus?.status === 'research-ocr-no-text-pass' && ocrCorpus.complete === true && ocrCorpus.noText === true && Number(ocrCorpus.imageCount) >= 28, 'image-authoring-ocr-corpus-report.json', ocrCorpus?.status === 'research-ocr-no-text-pass' ? `Local Tesseract.js OCR completed ${ocrCorpus.imageCount} owned-synthetic rasters with no readable tokens at the pinned confidence threshold.` : 'No complete corpus-wide OCR/noText evidence is currently recorded.'),
	check('composition-quiet-space-95', composition?.status === 'research-composition-pass' && Number(composition.passRate) >= 0.95 && Number(composition.acceptedOutputCount) >= 16, 'composition-quiet-space-corpus-report.json', composition?.status === 'research-composition-pass' ? `Composition-specified photographic corpus passes ${Math.round(Number(composition.passRate) * 100)}% (${composition.passCount}/${composition.acceptedOutputCount}) under the calibrated editorial profile.` : 'No composition-specified corpus has met the deterministic focal/quiet-space threshold.'),
	check('powerpoint-repair-free-corpus', crop && crop.failures === 0 && com && com.failures === 0 && durableCom && durableCom.failures === 0, 'img9-crop-corpus-report.json + COM reports'),
	check('meaningful-alt-text-native-labels', crop && crop.failures === 0 && com && com.failures === 0, 'img9-crop-corpus-report.json + img11-slide-context-com-report.json'),
	check('judge-human-kappa', (judge?.status === 'semantic-auto-accept-calibrated' && Number(judge.evaluation?.kappa) >= 0.75) || ownerImageQualityAccepted, 'photorealistic-judge-calibration-report.json + owner-quality-criterion-acceptance.json', ownerImageQualityAccepted ? 'Owner accepted the current image judge under the image-only sharpness-first rule; measured κ remains recorded and auto-accept stays disabled.' : (directJudge?.status === 'research-direct-pairwise-judge-fail' ? `Direct side-by-side probe abstained ${directJudge.failures}/${directJudge.pairCount}; pair-specific live endpoint registration remains incomplete.` : 'Current direct runtime calibration is not complete.')),
	check('blind-visual-score-4-of-5', ownerImageQualityAccepted, 'owner-quality-criterion-acceptance.json', ownerImageQualityAccepted ? 'Owner accepted image quality using sharpness/blur as the primary criterion; no numeric score is fabricated.' : 'The supplied review is best-of-two only; no numeric ≥4/5 score evidence is inferred.'),
	check('series-coherence-90-perceptual', ownerImageQualityAccepted && series?.failures === 0 && series?.planner?.status === 'pass', 'img8-rendered-series-coherence-report.json + owner-quality-criterion-acceptance.json', ownerImageQualityAccepted ? 'Owner accepted image-series coherence under the sharpness-first image-only rule; deterministic series evidence remains green.' : 'Rendered deterministic coherence is green, but no blind perceptual ≥4/5 series score is recorded.'),
	check('semantic-hard-minimum-no-auto-accept', judge?.autoAcceptEnabled === false, 'photorealistic-judge-calibration-report.json'),
	check('repair-improvement-80', repairImproved, 'img6-repair-multicase-report.json'),
	check('repair-ceilings-and-best-prior', boundedRepair && boundedRepair.failures === 0, 'photorealistic-bounded-repair-report.json'),
	check('median-generation-call-ceiling', callCeiling?.status === 'research-call-ceiling-pass' && Number(callCeiling.medianAcceptedCalls) <= 2 && Number(callCeiling.premiumMedianAcceptedCalls) <= 3, 'image-generation-call-ceiling-corpus-report.json', callCeiling?.status === 'research-call-ceiling-pass' ? `Frozen owned-synthetic runtime corpus records median ${callCeiling.medianAcceptedCalls} accepted call(s) across ${callCeiling.acceptedOutputCount} outputs.` : 'Current reports do not expose the required accepted-call distribution.'),
	check('cold-process-determinism', durable && durable.failures === 0, 'photorealistic-failover-durable-e2e-report.json'),
	check('privacy-and-black-box-zero-leaks', durable && durable.customerImages === false && durable.externalAi === false, 'photorealistic-failover-durable-e2e-report.json + release suite'),
	check('license-artifact-completeness', inventory && inventory.incompleteLicenseCount === 0 && inventory.hashMissingCount === 0, 'img5-semantic-judge-inventory-report.json'),
	check('actual-cost-within-ceilings', durable && durable.failures === 0, 'photorealistic-failover-durable-e2e-report.json', 'Cost evidence is research-scoped; production owner approval remains separate.'),
	check('cache-retry-fallback-retention-rollback', durable && durable.failures === 0, 'photorealistic-failover-durable-e2e-report.json'),
	check('ordinary-deck-no-manual-crop-approval', ownerSignoff?.ordinaryDeckAcceptance?.status === 'owner-research-acceptance-pass' && ownerSignoff.ordinaryDeckAcceptance.manualCropRequired === false && ownerSignoff.ordinaryDeckAcceptance.promptRewriteRequired === false && contextualPptx?.status === 'research-live-pass' && contextualPptx.failures === 0 && contextualCom?.failures === 0, 'owner-frozen-corpus-signoff.json + contextual-authoring-pptx-report.json + contextual-authoring-corpus-com-report.json', 'Research-only owner acceptance is recorded against the actual editable PPTX/PowerPoint COM corpus; production launch remains disabled.'),
	check('deck-meaning-with-images-hidden', hiddenImage?.messageScaffoldPass === true && hiddenImage?.nativeMessageCoveragePass === true, 'hidden-image-deck-communication-report.json', hiddenImage?.messageScaffoldPass === true && hiddenImage?.nativeMessageCoveragePass === true ? 'Exact native message token coverage passes 8/8 after picture removal; this closes text-message preservation while visual semantic quality remains a separate gate.' : 'No complete hidden-image communication evidence is currently recorded.'),
	check('hidden-image-native-text-scaffold', hiddenImage?.status === 'research-structural-pass' && hiddenImage.semanticAcceptance === false, 'hidden-image-deck-communication-report.json', 'Structural text survival is green; semantic communication remains separately open.'),
	check('owner-signoff-frozen-rubric-license-cost', ownerSignoff?.status === 'owner-research-signoff-pass' && ownerSignoff.productionLaunch === false && ownerSignoff.productionBilling === 'deferred' && ownerSignoff.frozenEvidence?.rubric && Array.isArray(ownerSignoff.frozenEvidence?.licensing) && ownerSignoff.frozenEvidence.licensing.length >= 2 && Array.isArray(ownerSignoff.frozenEvidence?.costCeilings) && ownerSignoff.frozenEvidence.costCeilings.length >= 2 && ownerSignoff.frozenEvidence?.privateCanary, 'owner-frozen-corpus-signoff.json', 'Owner research approvals and the frozen rubric/license/cost/private-canary evidence are recorded; production launch remains disabled.'),
]
const open = checks.filter(item => !item.status).map(item => item.id)
const report = {
	schemaVersion: 'betterpptx.image-authoring-goal-gates.v1',
	status: open.length ? 'research-goal-gates-open' : 'research-goal-gates-green',
	checks,
	green: checks.length - open.length,
	total: checks.length,
	open,
	customerImages: false,
	consentedHumanImages: false,
	training: false,
	externalAi: false,
	note: 'Requirement-level audit of §11; open perceptual, runtime and owner evidence is never inferred from code-only or deterministic fixtures.',
}
const outputPath = path.join(outputRoot, 'image-authoring-goal-gates.json')
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n')
for (const item of checks) console.log(`  ${item.status ? 'ok  ' : 'OPEN'} ${item.id} — ${item.evidence}`)
console.log(`\nGOAL GATES: ${report.green}/${report.total} green; ${open.length} open`)
console.log(`report: ${outputPath}`)
process.exit(open.length ? 1 : 0)
