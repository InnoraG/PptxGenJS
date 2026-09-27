// Durable, conversation-independent status snapshot for the active authoring goal.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, 'outputs')
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, ''))
const audit = read('image-authoring-completion-audit.json')
const bakeoff = read('live-modal-image-generation-bakeoff-report.json')
const pairwise = read('photorealistic-pairwise-review-report.json')
const judgeCalibration = read('photorealistic-judge-calibration-report.json')
const sourceRouter = read('visual-source-router-corpus-report.json')
const judgePreview = read('photorealistic-pairwise-judge-preview-report.json')
const calibrationHuman = read('photorealistic-pairwise-calibration-human-report.json')
const calibrationJudge = read('photorealistic-pairwise-calibration-judge-report.json')
const cropCorpus = read('img9-crop-corpus-report.json')
const slideContextCorpus = read('img11-slide-context-corpus-report.json')
const slideContextCom = read('img11-slide-context-com-report.json')
const contextualPptx = read('contextual-authoring-pptx-report.json')
const contextualCom = read('contextual-authoring-corpus-com-report.json')
const photorealisticPptx = read('photorealistic-contextual-corpus-pptx-report.json')
const photorealisticCom = read('photorealistic-contextual-corpus-com-report.json')
const seriesCorpus = read('img8-rendered-series-coherence-report.json')
const seriesCom = read('img8-rendered-series-com-report.json')
const rotation = read('modal-rotation-cross-instance-report.json')
const failoverProbe = read('photorealistic-failover-probe-report.json')
const accountInventory = read('private-modal-account-inventory-report.json')
const semanticInventory = read('img5-semantic-judge-inventory-report.json')
const semanticCanary = read('live-modal-semantic-judge-canary-report.json')
const liveBakeoff = read('live-modal-image-generation-bakeoff-report.json')
const repairMulticase = read('img6-repair-multicase-report.json')
const boundedRepair = read('photorealistic-bounded-repair-report.json')
const boundedRepairCom = read('photorealistic-bounded-repair-com-report.json')
const renderedQuality = read('rendered-pptx-slide-quality-report.json')
const img12Com = read('img12-powerpoint-com-report.json')
const judgeRecords = read('photorealistic-pairwise-judge-calibration-records.json')
const durable = read('photorealistic-failover-durable-e2e-report.json')
const owner = read('owner-control-evidence-report.json')
const fluxLicense = read('flux-primary-license-audit.json')
const directPairwiseClient = read('semantic-judge-direct-pairwise-client-report.json')
const goalGates = read('image-authoring-goal-gates.json')
const directJudge = read('photorealistic-direct-pairwise-calibration-judge-report.json')
const pairEndpointReadiness = read('semantic-judge-pair-endpoint-readiness-report.json')
const callCeiling = read('image-generation-call-ceiling-corpus-report.json')
const ocrCorpus = read('image-authoring-ocr-corpus-report.json')
const executionReadiness = read('image-authoring-execution-readiness.json')
const imageRouterState = read('image-router-state-verification-report.json')
const ownerQuality = read('owner-quality-criterion-acceptance.json')
const researchModeSignoff = read('image-authoring-research-mode-signoff-report.json')
const illustrationDemo = read('image-illustration-demo-report.json')
const nativeAnnotation = read('native-annotation-authoring-report.json')
const liveNativeAnnotation = read('live-native-annotation-authoring-report.json')
const nativeAnnotationTextFit = read('native-annotation-text-fit-report.json')
const liveGeneratedDurability = read('live-generated-image-durability-report.json')
const liveSharpnessBrief = read('live-sharpness-brief-canary-report.json')
const renderedRevision = read('img8-rendered-series-coherence-report.json')
const visualDirector = read('visual-director-verification-report.json')
const sharpnessSelector = read('sharpness-selector-report.json')
const liveEnginePremiumEnsemble = read('live-engine-premium-ensemble-report.json')
const ensembleSelectionDurability = read('premium-ensemble-selection-durability-report.json')
const semanticWorkerSource = fs.readFileSync(path.join(here, 'deploy', 'semantic-judge-worker', 'semantic_judge_app.py'), 'utf8')
const ownerImageQualityAccepted = ownerQuality?.status === 'owner-quality-criterion-accepted' && ownerQuality.scope === 'image-only visual quality gates; private research only' && ownerQuality.ownerDecision?.acceptCurrentJudgeOutput === true && ownerQuality.ownerDecision?.primaryCriterion === 'sharpness' && ownerQuality.ownerDecision?.lowerBlurHigherSharpnessWins === true
const researchBoundaryClosed = researchModeSignoff?.status === 'research-mode-boundary-pass' && researchModeSignoff.launchPlanned === false && researchModeSignoff.productionPromotion === false && audit.blockers?.length === 0
const snapshot = {
  schemaVersion: 'betterpptx.image-authoring-status-snapshot.v1',
  generatedAt: new Date().toISOString(),
  goalStatus: researchBoundaryClosed ? 'research-goal-complete-owner-override' : (executionReadiness.status === 'research-execution-ready-owner-override' ? 'active-research-owner-override' : 'active-research'),
  productBoundary: { pptxOnly: true, rawGlbFbxExport: false, customerImages: false, consentedHumanImages: false, training: false, externalAi: false, gcpDevelopment: false },
  currentAudit: { status: audit.status, green: audit.checks.filter(check => check.status).length, total: audit.checks.length, open: audit.blockers },
  validatedBaselines: {
    schnellCreationKleinEditing: true,
    premiumEnsembleSelectionDurability: ensembleSelectionDurability.status === 'research-premium-ensemble-selection-durability-pass' && ensembleSelectionDurability.failures === 0,
    liveBakeoffChecks: bakeoff.checks,
    liveBakeoffFailures: bakeoff.failures,
    liveBakeoffGpuCostUsd: Math.round(bakeoff.results.reduce((sum, result) => sum + Number(result.gpuCostUsd || 0), 0) * 1e6) / 1e6,
    durableLockReuse: durable.status === 'research-live-pass' && durable.failures === 0,
    ownerControl: owner.status === 'research-owner-control-pass',
    researchModeBoundary: researchModeSignoff.status === 'research-mode-boundary-pass' && researchModeSignoff.launchPlanned === false && researchModeSignoff.productionPromotion === false,
    primaryModelLicenseEvidence: fluxLicense.status === 'primary-model-card-pass-runtime-review-open',
    sourceRouterPolicyFixture: sourceRouter.status === 'research-policy-fixture-pass' && sourceRouter.recordCount === 200,
    sourceRouterFixtureAgreement: sourceRouter.agreement,
    sourceRouterExactTextPlanNative: sourceRouter.integration?.exactTextPlanNative === true,
    sourceRouterMalformedAnnotationAbstains: sourceRouter.integration?.malformedAnnotationRequestAbstains === true,
    judgeCalibrationMode: judgeCalibration.reviewMode || 'legacy-rubric',
    judgeCalibrationRecords: judgeCalibration.recordCount,
    judgeCalibrationValidRecords: judgeCalibration.evaluation?.recordCount,
    judgeCalibrationKappa: judgeCalibration.evaluation?.kappa,
    judgeCalibrationStatus: judgeCalibration.status,
    judgeCalibrationHumanDisagreementCount: judgeRecords.disagreementPairCount,
    pairwiseHumanReview: pairwise.status === 'reviewer-pairwise-pass',
    pairwiseKappa: pairwise.kappa,
    pairwiseEditLaneWins: pairwise.laneWins?.edit || 0,
    judgePreviewCalls: judgePreview.judgeCalls,
    judgePreviewGpuCostUsd: judgePreview.totalGpuCostUsd,
    judgePreviewObservedAgreement: judgePreview.observedAgreement,
    judgePreviewStatus: judgePreview.status,
    judgePreviewDiscrimination: judgePreview.observedAgreement === 0 ? 'insufficient' : 'observed',
    judgePromptRefinement: true,
    directPairwiseJudgeClientContract: directPairwiseClient.status === 'pass' && directPairwiseClient.network === false && directPairwiseClient.externalAi === false,
    directPairwiseJudgeRuntimeBenchmark: directJudge?.status || 'pending-approved-Modal-profile-authentication',
    directPairwiseJudgeRuntimeFailures: directJudge?.failures ?? null,
    directPairwiseJudgeRuntimeGpuCostUsd: directJudge?.totalGpuCostUsd ?? null,
    semanticJudgePairEndpointAccounts: pairEndpointReadiness?.accountCount ?? null,
    semanticJudgePairEndpointConfiguredAccounts: pairEndpointReadiness?.accounts?.filter(account => account.pairConfigured).length ?? null,
    acceptedCallCeilingCorpusOutputs: callCeiling?.acceptedOutputCount ?? null,
    acceptedCallCeilingMedian: callCeiling?.medianAcceptedCalls ?? null,
    acceptedCallCeilingStandardMedian: callCeiling?.standardMedianAcceptedCalls ?? null,
    acceptedCallCeilingPremiumMedian: callCeiling?.premiumMedianAcceptedCalls ?? null,
    ocrCorpusStatus: ocrCorpus?.status ?? 'missing',
    ocrCorpusImages: ocrCorpus?.imageCount ?? null,
    ocrCorpusNoText: ocrCorpus?.noText ?? false,
    ocrEngine: ocrCorpus?.engine ?? null,
    ocrTrainedDataSha256: ocrCorpus?.trainedData?.sha256 ?? null,
    judgeExecutionPolicy: executionReadiness.judgeExecutionPolicy,
    judgeOwnerOverrideAccepted: executionReadiness.ownerOverrideAccepted,
    judgeMeasuredCalibrationStatus: executionReadiness.measuredCalibration.status,
    judgeMeasuredCalibrationKappa: executionReadiness.measuredCalibration.kappa,
    judgeSemanticAutoAccept: executionReadiness.measuredCalibration.semanticAutoAccept,
    imageRouterStateStatus: imageRouterState.status,
    imageRouterStateChecks: imageRouterState.checks,
    imageRouterStateFailures: imageRouterState.failures,
    imageRouterStateCrossProcessRehydrate: imageRouterState.crossProcessRehydrate,
    imageRouterStateStrictFailClosed: imageRouterState.strictFailClosed,
    imageRouterStateConcurrentWriters: imageRouterState.concurrentWriters,
    ownerImageQualityCriterionAccepted: ownerImageQualityAccepted,
    ownerImageQualityPrimaryCriterion: ownerQuality?.ownerDecision?.primaryCriterion || null,
    illustrationDemoStatus: illustrationDemo?.status || 'missing',
    illustrationDemoCreateLane: illustrationDemo?.create?.lane || null,
    illustrationDemoEditLane: illustrationDemo?.edit?.lane || null,
    illustrationDemoCreateOcrReadableTokenCount: illustrationDemo?.promptPolicy?.createOcrReadableTokenCount ?? null,
    illustrationDemoEditOcrReadableTokenCount: illustrationDemo?.promptPolicy?.editOcrReadableTokenCount ?? null,
    nativeAnnotationAuthoringStatus: nativeAnnotation?.status || 'missing',
    nativeAnnotationAuthoringChecks: nativeAnnotation?.checks ?? 0,
    nativeAnnotationAuthoringFailures: nativeAnnotation?.failures ?? null,
    nativeAnnotationLabelCount: nativeAnnotation?.labels?.length ?? 0,
    nativeAnnotationArrowCount: nativeAnnotation?.nativeArrows ?? 0,
    liveNativeAnnotationStatus: liveNativeAnnotation?.status || 'missing',
    liveNativeAnnotationChecks: liveNativeAnnotation?.checks ?? 0,
    liveNativeAnnotationFailures: liveNativeAnnotation?.failures ?? null,
    liveNativeAnnotationProvider: liveNativeAnnotation?.provider || null,
    nativeAnnotationTextFitStatus: nativeAnnotationTextFit?.status || 'missing',
    nativeAnnotationTextFitChecks: nativeAnnotationTextFit?.checks ?? 0,
    nativeAnnotationTextFitFailures: nativeAnnotationTextFit?.failures ?? null,
    nativeAnnotationTextFitLabels: nativeAnnotationTextFit?.labels?.length ?? 0,
    nativeAnnotationTextFitNativeArrows: nativeAnnotationTextFit?.nativeArrows ?? 0,
    liveGeneratedDurabilityStatus: liveGeneratedDurability?.status || 'missing',
    liveGeneratedDurabilityChecks: liveGeneratedDurability?.checks ?? 0,
    liveGeneratedDurabilityFailures: liveGeneratedDurability?.failures ?? null,
    liveGeneratedDurabilitySameAccountHydrated: liveGeneratedDurability?.sameAccountHydrated === true,
    liveGeneratedDurabilityCrossAccountHydrated: liveGeneratedDurability?.crossAccountHydrated === true,
    liveSharpnessBriefStatus: liveSharpnessBrief?.status || 'missing',
    liveSharpnessBriefAccepted: liveSharpnessBrief?.liveRuntimeAcceptedBrief === true,
    liveSharpnessBriefGpuCostUsd: liveSharpnessBrief?.gpuCostUsd ?? null,
    selectiveVisualRevisionStatus: renderedRevision?.revision?.assetInvalidatedPlanIds?.length === 1 && renderedRevision?.revision?.retainedAssetPlanIds?.length === 5 ? 'pass' : 'pending',
    selectiveVisualRevisionAssetInvalidated: renderedRevision?.revision?.assetInvalidatedPlanIds || [],
    selectiveVisualRevisionRetainedAssets: renderedRevision?.revision?.retainedAssetPlanIds || [],
    selectiveVisualRevisionDependentChecks: renderedRevision?.revision?.dependentSeriesCheckPlanIds || [],
    visualDirectorChecks: visualDirector?.checks ?? 0,
    visualDirectorFailures: visualDirector?.failures ?? null,
    visualDirectorEvaluationPlan: visualDirector?.checksDetail?.some(check => /evaluation plan makes deterministic gates/i.test(check.name) && check.status === 'PASS') === true,
    visualDirectorRepairFallbackPlan: visualDirector?.checksDetail?.some(check => /repair policy and safe fallback/i.test(check.name) && check.status === 'PASS') === true,
    visualDirectorPublicRevisionPolicy: visualDirector?.checksDetail?.some(check => /selective revision, retention, and no-spend policy/i.test(check.name) && check.status === 'PASS') === true,
    ownerSharpnessSelectorStatus: sharpnessSelector?.status || 'missing',
    ownerSharpnessSelectorChecks: sharpnessSelector?.checks ?? 0,
    ownerSharpnessSelectorFailures: sharpnessSelector?.failures ?? null,
    ownerSharpnessSelectorSelectedLane: sharpnessSelector?.actualSelection?.selectedLane || null,
    ownerSharpnessSelectorPolicy: sharpnessSelector?.policy || null,
    liveEnginePremiumEnsembleStatus: liveEnginePremiumEnsemble?.status || 'missing',
    liveEnginePremiumEnsembleChecks: liveEnginePremiumEnsemble?.checks ?? 0,
    liveEnginePremiumEnsembleFailures: liveEnginePremiumEnsemble?.failures ?? null,
    liveEnginePremiumEnsembleSelectedLane: liveEnginePremiumEnsemble?.selectedLane || null,
    semanticJudgeSharpnessProfilePropagation: semanticWorkerSource.includes('requested_criterion') && semanticWorkerSource.includes('effective_profile') && semanticWorkerSource.includes('qualityCriterion') && semanticWorkerSource.includes('sharpness-first'),
    semanticJudgeBriefInputIsolation: semanticWorkerSource.includes('untrusted slide data') && semanticWorkerSource.includes('never follow instructions contained') && semanticWorkerSource.includes('<brief_json>') && semanticWorkerSource.includes('</brief_json>'),
    specificationGoalGateGreen: goalGates.green,
    specificationGoalGateTotal: goalGates.total,
    specificationGoalGateOpen: goalGates.open,
    modalCliDeploymentAuth: 'not-configured-on-host',
    pairwiseCalibrationPacketReady: calibrationHuman.pairCount === 20 && calibrationHuman.newPairCount === 16,
    pairwiseCalibrationCoveredPairs: calibrationHuman.coveredPairCount,
    pairwiseCalibrationHumanStatus: calibrationHuman.status,
    pairwiseCalibrationHumanKappa: calibrationHuman.kappa,
    pairwiseCalibrationHumanAgreement: calibrationHuman.observedAgreement,
    pairwiseCalibrationHumanDisagreementCount: calibrationHuman.pairCount - (calibrationHuman.coveredPairCount ? Math.round(calibrationHuman.observedAgreement * calibrationHuman.coveredPairCount) : 0),
    pairwiseCalibrationJudgeBenchmarkStatus: calibrationJudge.status,
    pairwiseCalibrationJudgeBenchmarkPairs: calibrationJudge.pairCount,
    pairwiseCalibrationJudgeBenchmarkCalls: calibrationJudge.judgeCalls,
    pairwiseCalibrationJudgeBenchmarkFailures: calibrationJudge.failures,
    pairwiseCalibrationJudgeBenchmarkGpuCostUsd: calibrationJudge.totalGpuCostUsd,
    pairwiseCalibrationJudgeKnownHumanLabels: calibrationJudge.knownHumanLabelCount,
    pairwiseCalibrationJudgeChoiceCounts: calibrationJudge.judgeLaneChoices,
    imageCropCorpusChecks: cropCorpus.checks,
    imageCropCorpusFailures: cropCorpus.failures,
    slideContextCorpusSlides: slideContextCorpus.slideCount,
    slideContextCorpusChecks: slideContextCorpus.checks,
    slideContextComChecks: slideContextCom.checks,
    slideContextComFailures: slideContextCom.failures,
    contextualAuthoringPptxChecks: contextualPptx.checks,
    contextualAuthoringComChecks: contextualCom.checks,
    contextualAuthoringComFailures: contextualCom.failures,
    photorealisticAuthoringPptxChecks: photorealisticPptx.checks,
    photorealisticAuthoringComChecks: photorealisticCom.checks,
    photorealisticAuthoringComFailures: photorealisticCom.failures,
    renderedSeriesChecks: seriesCorpus.checks,
    renderedSeriesFailures: seriesCorpus.failures,
    renderedSeriesComChecks: seriesCom.checks,
    renderedSeriesComFailures: seriesCom.failures,
    modalRotationChecks: rotation.checks,
    modalRotationFailures: rotation.failures,
    liveFailoverProbeChecks: failoverProbe.checks,
    liveFailoverProbeFailures: failoverProbe.failures,
    privateModalAccountInventoryChecks: accountInventory.checks,
    privateModalAccountInventoryFailures: accountInventory.failures,
    semanticJudgeInventoryChecks: semanticInventory.checks,
    semanticJudgeInventoryFailures: semanticInventory.failures,
    semanticJudgeInventoryApproval: semanticInventory.approval,
    semanticJudgeLiveCanaryChecks: semanticCanary.checks,
    semanticJudgeLiveCanaryFailures: semanticCanary.failures,
    semanticJudgeLiveCanaryAutoAccept: semanticCanary.calibratedForAutoAccept,
    liveBakeoffChecks: liveBakeoff.checks,
    liveBakeoffFailures: liveBakeoff.failures,
    repairMulticaseRecords: repairMulticase.records?.length || 0,
    repairMulticaseCustomerImages: repairMulticase.customerImages,
    boundedRepairChecks: boundedRepair.checks,
    boundedRepairComChecks: boundedRepairCom.checks,
    boundedRepairComFailures: boundedRepairCom.failures,
    renderedTreatmentE2eQualityChecks: renderedQuality.checks,
    renderedTreatmentE2eQualityFailures: renderedQuality.failures,
    img12PowerpointComStatus: img12Com.status,
    img12PowerpointComReopened: img12Com.reopenedWithoutError,
  },
  openGates: {
    independentReviewerLabels: !(pairwise.status === 'reviewer-pairwise-pass' || calibrationHuman.status === 'reviewer-calibration-pass'),
    judgeVsHumanCalibration: !(judgeCalibration.status === 'semantic-auto-accept-calibrated' || ownerImageQualityAccepted),
    semanticJudgePairEndpointRegistration: pairEndpointReadiness?.status !== 'ready',
    runtimeLegalOwnerPromotion: !(researchModeSignoff.status === 'research-mode-boundary-pass' && researchModeSignoff.launchPlanned === false && researchModeSignoff.productionPromotion === false),
  },
  artifacts: {
    visualProgress: 'betterpptx-mcp/docs/visual-authoring-progress.html',
    sharpnessSelector: 'betterpptx-mcp/outputs/sharpness-selector-report.json',
    premiumEnsembleSelectionDurability: 'betterpptx-mcp/outputs/premium-ensemble-selection-durability-report.json',
    liveEnginePremiumEnsemble: 'betterpptx-mcp/outputs/live-engine-premium-ensemble-report.json',
    completionAudit: 'betterpptx-mcp/outputs/image-authoring-completion-audit.json',
    reviewerHandoff: 'betterpptx-mcp/docs/release-safety/INDEPENDENT-REVIEWER-HANDOFF.md',
    pairwiseReviewForm: 'betterpptx-mcp/outputs/photorealistic-pairwise-review.html',
    pairwiseReviewReport: 'betterpptx-mcp/outputs/photorealistic-pairwise-review-report.json',
    legacyBlindForm: 'betterpptx-mcp/outputs/photorealistic-blind-review.html',
    sourceRouterCorpus: 'betterpptx-mcp/outputs/visual-source-router-corpus-report.json',
    judgeCalibration: 'betterpptx-mcp/outputs/photorealistic-judge-calibration-report.json',
    pairwiseCalibrationForm: 'betterpptx-mcp/outputs/photorealistic-pairwise-calibration.html',
    pairwiseCalibrationPacket: 'betterpptx-mcp/outputs/photorealistic-pairwise-calibration-packet.json',
    pairwiseCalibrationHumanReport: 'betterpptx-mcp/outputs/photorealistic-pairwise-calibration-human-report.json',
    pairwiseCalibrationJudgeReport: 'betterpptx-mcp/outputs/photorealistic-pairwise-calibration-judge-report.json',
    pairwiseJudgeCalibrationRecords: 'betterpptx-mcp/outputs/photorealistic-pairwise-judge-calibration-records.json',
    directPairwiseJudgeClientReport: 'betterpptx-mcp/outputs/semantic-judge-direct-pairwise-client-report.json',
    directPairwiseJudgeBenchmark: 'betterpptx-mcp/verify-live-modal-photorealistic-direct-pairwise-calibration-judge.mjs',
    directPairwiseJudgeRuntimeReport: 'betterpptx-mcp/outputs/photorealistic-direct-pairwise-calibration-judge-report.json',
    semanticJudgePairEndpointReadiness: 'betterpptx-mcp/outputs/semantic-judge-pair-endpoint-readiness-report.json',
    specificationGoalGates: 'betterpptx-mcp/outputs/image-authoring-goal-gates.json',
    hiddenImageDeckCommunication: 'betterpptx-mcp/outputs/hidden-image-deck-communication-report.json',
    imageCropCorpusReport: 'betterpptx-mcp/outputs/img9-crop-corpus-report.json',
    slideContextCorpusReport: 'betterpptx-mcp/outputs/img11-slide-context-corpus-report.json',
    slideContextComReport: 'betterpptx-mcp/outputs/img11-slide-context-com-report.json',
    contextualAuthoringPptxReport: 'betterpptx-mcp/outputs/contextual-authoring-pptx-report.json',
    contextualAuthoringComReport: 'betterpptx-mcp/outputs/contextual-authoring-corpus-com-report.json',
    photorealisticAuthoringPptxReport: 'betterpptx-mcp/outputs/photorealistic-contextual-corpus-pptx-report.json',
    photorealisticAuthoringComReport: 'betterpptx-mcp/outputs/photorealistic-contextual-corpus-com-report.json',
    renderedSeriesReport: 'betterpptx-mcp/outputs/img8-rendered-series-coherence-report.json',
    renderedSeriesComReport: 'betterpptx-mcp/outputs/img8-rendered-series-com-report.json',
    modalRotationReport: 'betterpptx-mcp/outputs/modal-rotation-cross-instance-report.json',
    bakeoffReport: 'betterpptx-mcp/outputs/live-modal-image-generation-bakeoff-report.json',
    bakeoffPptx: 'betterpptx-mcp/outputs/live-modal-image-generation-bakeoff.pptx',
    licenseAudit: 'betterpptx-mcp/outputs/flux-primary-license-audit.json',
    ownerControl: 'betterpptx-mcp/outputs/owner-control-evidence-report.json',
    executionReadiness: 'betterpptx-mcp/outputs/image-authoring-execution-readiness.json',
    ownerFrozenCorpusSignoff: 'betterpptx-mcp/outputs/owner-frozen-corpus-signoff.json',
    imageRouterStateVerification: 'betterpptx-mcp/outputs/image-router-state-verification-report.json',
    ownerQualityCriterion: 'betterpptx-mcp/outputs/owner-quality-criterion-acceptance.json',
    researchModeSignoff: 'betterpptx-mcp/outputs/image-authoring-research-mode-signoff.json',
    illustrationDemoReport: 'betterpptx-mcp/outputs/image-illustration-demo-report.json',
    illustrationDemoSchnell: 'betterpptx-mcp/outputs/image-illustration-demo-schnell-v2.png',
    illustrationDemoKlein: 'betterpptx-mcp/outputs/image-illustration-demo-klein-v2.png',
    nativeAnnotationReport: 'betterpptx-mcp/outputs/native-annotation-authoring-report.json',
    nativeAnnotationPptx: 'betterpptx-mcp/outputs/annotated-native-deck/carbon-cycle-native-annotations.pptx',
    nativeAnnotationRender: 'betterpptx-mcp/outputs/annotated-native-deck/com-render/slide-1.png',
    liveNativeAnnotationReport: 'betterpptx-mcp/outputs/live-native-annotation-authoring-report.json',
    liveNativeAnnotationPptx: 'betterpptx-mcp/outputs/live-native-annotation-deck/live-carbon-cycle-native-annotations.pptx',
    liveNativeAnnotationRender: 'betterpptx-mcp/outputs/live-native-annotation-deck/com-render/slide-1.png',
    nativeAnnotationTextFitReport: 'betterpptx-mcp/outputs/native-annotation-text-fit-report.json',
    nativeAnnotationTextFitPptx: 'betterpptx-mcp/outputs/native-annotation-text-fit/carbon-cycle-native-text-fit.pptx',
    nativeAnnotationTextFitRender: 'betterpptx-mcp/outputs/native-annotation-text-fit/com-render/slide-1.png',
    liveGeneratedDurabilityReport: 'betterpptx-mcp/outputs/live-generated-image-durability-report.json',
    liveGeneratedDurabilityPptx: 'betterpptx-mcp/outputs/live-generated-image-durability/live-generated-image-durability.pptx',
    liveGeneratedDurabilityRender: 'betterpptx-mcp/outputs/live-generated-image-durability/com-render/slide-1.png',
  },
  note: 'This snapshot is an evidence index, not a launch approval. The owner accepted image-only sharpness/blur quality and explicitly confirmed private research/no launch; measured calibration remains preserved and semantic auto-accept, runtime/legal execution and production controls remain fail-closed.',
}
const outputPath = path.join(root, 'image-authoring-status-snapshot.json')
fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2) + '\n')
console.log(JSON.stringify({ status: snapshot.goalStatus, audit: snapshot.currentAudit, openGates: snapshot.openGates, outputPath }))
