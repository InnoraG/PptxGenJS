#!/usr/bin/env node
// Native 3D presenter release gate. This is deliberately separate from the
// talking-head license ledger: it proves what is locally ready and fails closed
// until the owner records the Meshy account, input-consent, Mixamo, and fallback
// distribution decisions. It never prints credentials or raw user images.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { meshyAvatarHashFor, meshyAvatarProviderStatus } from './assets/meshy-avatar-provider.mjs'
import { writeJsonReport } from './lib/atomic-report.mjs'

// Resolve paths from the repository location, not the caller's cwd.  The
// release aggregate intentionally invokes child verifiers from the repo root,
// but maintainers also run this verifier directly from betterpptx-mcp/; using
// cwd here previously prefixed `betterpptx-mcp/` twice in that common path.
const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const ledgerPath = path.join(root, 'betterpptx-mcp', 'avatar', '3d-presenter-license-ledger.json')
const demoRoot = path.join(root, 'research-demos', '2026-07-18-meshy-avatar')
const glbPath = path.join(demoRoot, 'production-hybrid-proof.glb')
const posterInfoPath = path.join(demoRoot, 'visual-artifacts', 'meshy-poster', 'poster-info.json')
const posterPath = path.join(demoRoot, 'visual-artifacts', 'meshy-poster', 'meshy-native-poster.png')
const packageMediaPath = path.join(demoRoot, 'visual-artifacts', 'pptx-media-package', 'package-media-info.json')
const durabilityEvidencePath = path.join(demoRoot, 'visual-artifacts', 'release-gates', 'mesh-asset-durability-20260718.json')
const providerHardeningEvidencePath = path.join(demoRoot, 'visual-artifacts', 'release-gates', 'meshy-provider-hardening-20260718.json')
const durableOperationReplayEvidencePath = path.join(demoRoot, 'visual-artifacts', 'release-gates', 'meshy-durable-operation-replay-20260718.json')
const defaultPresenterNativeEvidencePath = path.join(demoRoot, 'visual-artifacts', 'default-presenter-native-gates-20260718', 'default-presenter-native-gates.json')
const latencyEvidencePath = path.join(demoRoot, 'visual-artifacts', 'release-gates', 'meshy-latency-budget-20260718.json')
const modalProfileSafetyEvidencePath = path.join(demoRoot, 'visual-artifacts', 'release-gates', 'meshy-modal-profile-safety-20260718.json')
const modalRevisionRollbackEvidencePath = path.join(demoRoot, 'visual-artifacts', 'release-gates', 'meshy-modal-revision-rollback-20260718.json')
const ownerPreflightEvidencePath = path.join(demoRoot, 'visual-artifacts', 'release-gates', 'meshy-owner-preflight-20260718.json')
const ownerDecisionWorksheetEvidencePath = path.join(demoRoot, 'visual-artifacts', 'release-gates', 'meshy-owner-decision-worksheet-20260718.json')
const termsReviewEvidencePath = path.join(demoRoot, 'visual-artifacts', 'release-gates', 'meshy-mixamo-commercial-terms-review-20260719.json')
const provenanceEvidencePath = path.join(demoRoot, 'visual-artifacts', 'release-gates', 'meshy-mixamo-provenance-20260718.json')
const directVsHybridEvidencePath = path.join(demoRoot, 'visual-artifacts', 'release-gates', 'meshy-direct-vs-hybrid-root-cause-20260718.json')
const identityInterchangeabilityEvidencePath = path.join(demoRoot, 'visual-artifacts', 'release-gates', 'meshy-presenter-identity-interchangeability-20260718.json')
const ownerControlEvidencePath = path.join(demoRoot, 'visual-artifacts', 'release-gates', 'meshy-owner-control-20260718.json')
const modalLiveProfileHealthEvidencePath = path.join(demoRoot, 'visual-artifacts', 'release-gates', 'meshy-modal-live-profile-health-20260718.json')
const modalProfileInventoryEvidencePath = path.join(demoRoot, 'visual-artifacts', 'release-gates', 'meshy-modal-profile-inventory-20260718.json')
const modalTargetDeploymentPreflightPath = path.join(demoRoot, 'visual-artifacts', 'release-gates', 'meshy-modal-target-deployment-preflight-20260718.json')
const modalTargetDeploymentRunPath = path.join(demoRoot, 'visual-artifacts', 'release-gates', 'meshy-modal-target-deployment-run-20260718.json')
const inputContractEvidencePath = path.join(demoRoot, 'visual-artifacts', 'release-gates', 'meshy-input-contract-matrix-20260718', 'meshy-input-contract-matrix-20260718.json')
const frontDoorEvidencePath = path.join(demoRoot, 'visual-artifacts', 'release-gates', 'meshy-provider-front-door-corpus-20260719.json')
const oneShotAcceptanceEvidencePath = path.join(demoRoot, 'visual-artifacts', 'live-meshy-acceptance-20260718', 'acceptance-report.json')
const mockAcquisitionEvidencePath = path.join(demoRoot, 'visual-artifacts', 'live-meshy-acceptance-20260718', 'fixture-mock-acquisition', 'mock-acquisition-report.json')
const canaryRunnerPath = path.join(root, 'betterpptx-mcp', 'verify-meshy-presenter-live-canary.mjs')
const outputPath = path.join(demoRoot, 'visual-artifacts', 'release-gates', '3d-presenter-release-gate.json')

function sha256File(filePath) {
	return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').toUpperCase()
}
function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')) }
function exists(filePath) { return fs.existsSync(filePath) }
const validPngDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X7o5WQAAAABJRU5ErkJggg=='
function checkImageCountContract() {
	const validOne = (() => { try { meshyAvatarHashFor({ images: [validPngDataUri] }); return true } catch { return false } })()
	const validFour = (() => { try { meshyAvatarHashFor({ images: [1, 2, 3, 4].map(() => validPngDataUri) }); return true } catch { return false } })()
	const rejectsZero = (() => { try { meshyAvatarHashFor({ images: [] }); return false } catch (error) { return error?.code === 'MESHY_IMAGE_COUNT_INVALID' } })()
	const rejectsFive = (() => { try { meshyAvatarHashFor({ images: [1, 2, 3, 4, 5].map(() => validPngDataUri) }); return false } catch (error) { return error?.code === 'MESHY_IMAGE_COUNT_INVALID' } })()
	return { min: 1, max: 4, acceptsOne: validOne, acceptsFour: validFour, rejectsZero, rejectsFive, pass: validOne && validFour && rejectsZero && rejectsFive }
}

const ledger = readJson(ledgerPath)
const posterInfo = readJson(posterInfoPath)
const packageMedia = readJson(packageMediaPath)
const durabilityEvidence = readJson(durabilityEvidencePath)
const providerHardeningEvidence = readJson(providerHardeningEvidencePath)
const durableOperationReplayEvidence = readJson(durableOperationReplayEvidencePath)
const defaultPresenterNativeEvidence = readJson(defaultPresenterNativeEvidencePath)
const latencyEvidence = readJson(latencyEvidencePath)
const modalProfileSafetyEvidence = readJson(modalProfileSafetyEvidencePath)
const modalRevisionRollbackEvidence = exists(modalRevisionRollbackEvidencePath) ? readJson(modalRevisionRollbackEvidencePath) : null
const ownerPreflightEvidence = exists(ownerPreflightEvidencePath) ? readJson(ownerPreflightEvidencePath) : null
const termsReviewEvidence = exists(termsReviewEvidencePath) ? readJson(termsReviewEvidencePath) : null
const provenanceEvidence = exists(provenanceEvidencePath) ? readJson(provenanceEvidencePath) : null
const directVsHybridEvidence = exists(directVsHybridEvidencePath) ? readJson(directVsHybridEvidencePath) : null
const identityInterchangeabilityEvidence = exists(identityInterchangeabilityEvidencePath) ? readJson(identityInterchangeabilityEvidencePath) : null
const ownerControlEvidence = exists(ownerControlEvidencePath) ? readJson(ownerControlEvidencePath) : null
const modalLiveProfileHealthEvidence = exists(modalLiveProfileHealthEvidencePath) ? readJson(modalLiveProfileHealthEvidencePath) : null
const modalProfileInventoryEvidence = exists(modalProfileInventoryEvidencePath) ? readJson(modalProfileInventoryEvidencePath) : null
const modalTargetDeploymentPreflight = exists(modalTargetDeploymentPreflightPath) ? readJson(modalTargetDeploymentPreflightPath) : null
const modalTargetDeploymentRun = exists(modalTargetDeploymentRunPath) ? readJson(modalTargetDeploymentRunPath) : null
const inputContractEvidence = exists(inputContractEvidencePath) ? readJson(inputContractEvidencePath) : null
const frontDoorEvidence = exists(frontDoorEvidencePath) ? readJson(frontDoorEvidencePath) : null
const oneShotAcceptanceEvidence = exists(oneShotAcceptanceEvidencePath) ? readJson(oneShotAcceptanceEvidencePath) : null
const mockAcquisitionEvidence = exists(mockAcquisitionEvidencePath) ? readJson(mockAcquisitionEvidencePath) : null
const provider = meshyAvatarProviderStatus()
const glbHash = sha256File(glbPath)
const posterHash = sha256File(posterPath)
const mediaByRole = new Map((packageMedia.media || []).map(entry => [entry.role, entry]))
const baseImageContract = checkImageCountContract()
const mixedImageFamiliesCase = inputContractEvidence?.cases?.find(item => item.name === 'invalid-mixed-image-families')
const imageContract = {
	...baseImageContract,
	rejectsMixedFamilies: mixedImageFamiliesCase?.pass === true,
	pass: baseImageContract.pass && mixedImageFamiliesCase?.pass === true,
}
const directVsHybridPass = Boolean(
	directVsHybridEvidence?.schemaVersion === 'betterpptx.native-3d-meshy-direct-vs-hybrid-root-cause.v1' &&
	directVsHybridEvidence.scope === 'native-3d-presenter-only' &&
	directVsHybridEvidence.developmentMode === 'premium' &&
	directVsHybridEvidence.networkAttempted === false &&
	directVsHybridEvidence.deploymentAttempted === false &&
	directVsHybridEvidence.directMeshyPath?.status === 'FAILED_NATIVE_VISUAL_CONTRACT' &&
	directVsHybridEvidence.correctedHybridPath?.status === 'PASS_NATIVE_VISUAL_CONTRACT' &&
	directVsHybridEvidence.correctedHybridPath?.glbSha256 === glbHash &&
	Array.isArray(directVsHybridEvidence.directMeshyPath?.nativeExportEvidence) &&
	directVsHybridEvidence.directMeshyPath.nativeExportEvidence.length === 4 &&
	directVsHybridEvidence.directMeshyPath.nativeExportEvidence.every(item => exists(path.resolve(root, item.relativePath)) && sha256File(path.resolve(root, item.relativePath)) === String(item.sha256 || '').toUpperCase()) &&
	Array.isArray(directVsHybridEvidence.correctedHybridPath?.nativeExportEvidence) &&
	directVsHybridEvidence.correctedHybridPath.nativeExportEvidence.every(item => exists(path.resolve(root, item)))
)
const oneShotAcceptancePass = Boolean(
	oneShotAcceptanceEvidence &&
	oneShotAcceptanceEvidence.status === 'PASS' &&
	oneShotAcceptanceEvidence.scope === 'native-3d-presenter-only' &&
		oneShotAcceptanceEvidence.fixture === true &&
		oneShotAcceptanceEvidence.networkAttempted === false &&
		oneShotAcceptanceEvidence.mockAcquisitionReport === mockAcquisitionEvidencePath &&
		mockAcquisitionEvidence?.status === 'PASS' &&
		mockAcquisitionEvidence?.networkAttempted === false &&
		mockAcquisitionEvidence?.inputCount === 2 &&
		mockAcquisitionEvidence?.providerCredits === 35 &&
		oneShotAcceptanceEvidence.artifacts?.glb?.sha256 === glbHash &&
		oneShotAcceptanceEvidence.artifacts?.glb?.sha256 === mockAcquisitionEvidence?.output?.glb?.sha256 &&
	oneShotAcceptanceEvidence.artifacts?.pptx?.repairVerifierPassed === true &&
	oneShotAcceptanceEvidence.artifacts?.motion?.slide1?.pass === true &&
	oneShotAcceptanceEvidence.artifacts?.motion?.slide2?.pass === true &&
		typeof oneShotAcceptanceEvidence.artifacts?.staticExport?.slide1 === 'string' && exists(oneShotAcceptanceEvidence.artifacts.staticExport.slide1) &&
		typeof oneShotAcceptanceEvidence.artifacts?.staticExport?.slide2 === 'string' && exists(oneShotAcceptanceEvidence.artifacts.staticExport.slide2)
)
const inputContractPass = Boolean(
	inputContractEvidence &&
	inputContractEvidence.status === 'PASS' &&
	inputContractEvidence.networkAttempted === false &&
	inputContractEvidence.implementationMatchesOfficialContract === true &&
	inputContractEvidence.officialApiContract?.imageCount?.min === 1 &&
	inputContractEvidence.officialApiContract?.imageCount?.max === 4 &&
	inputContractEvidence.officialApiContract?.multiImageTexturedCredits === 30 &&
	inputContractEvidence.officialApiContract?.autoRiggingCredits === 5 &&
	inputContractEvidence.requestShape?.pass === true &&
	Array.isArray(inputContractEvidence.acceptedImageCounts) &&
	inputContractEvidence.acceptedImageCounts.join(',') === '1,2,3,4' &&
	Array.isArray(inputContractEvidence.cases) &&
	inputContractEvidence.cases.length === 12 &&
	inputContractEvidence.cases.every(item => item.pass === true && item.networkAttempted === false)
)
const frontDoorInputFamilyPass = Boolean(
	frontDoorEvidence?.schemaVersion === 'betterpptx.native-3d-meshy-front-door-corpus.v1' &&
	frontDoorEvidence.status === 'PASS' &&
	frontDoorEvidence.scope === 'native-3d-presenter-only' &&
	frontDoorEvidence.developmentMode === 'premium' &&
	frontDoorEvidence.networkAttempted === false &&
	frontDoorEvidence.publicProviderCalls === 0 &&
	frontDoorEvidence.checks?.imageBase64sFamily === true &&
	frontDoorEvidence.checks?.imageUrlsDataUriFamily === true &&
	frontDoorEvidence.checks?.sameOpaqueHandle === true &&
	frontDoorEvidence.checks?.publicBoundaryRedaction === true &&
	frontDoorEvidence.checks?.noAdditionalProviderCalls === true &&
	frontDoorEvidence.checks?.compilerPresenterOperations === true &&
	frontDoorEvidence.checks?.toolSchemaMatchesRuntime === true
)
const checks = [
	{ id: 'ledger-scope-is-native-3d-only', status: ledger.productScope.includes('native 3D') && ledger.productScope.includes('excluded') ? 'PASS' : 'BLOCKED' },
	{ id: 'ledger-schema', status: ledger.schemaVersion === 'betterpptx.3d-presenter-license-ledger.v1' ? 'PASS' : 'BLOCKED' },
	{ id: 'mesh-output-present-and-hashed', status: exists(glbPath) && glbHash === 'A330DC0C2048444259A93506F0115DABAB14632CD28BF8B4EFFE3FA9917BEDAC' ? 'PASS' : 'BLOCKED' },
	{ id: 'poster-present-and-hashed', status: exists(posterPath) && posterHash === String(posterInfo.sha256 || '').toUpperCase() ? 'PASS' : 'BLOCKED' },
	{ id: 'pptx-carries-mesh-and-poster', status: mediaByRole.has('animated Meshy geometry and texture with Mixamo-proven skeleton/clips') && mediaByRole.has('Meshy-specific static fallback poster') ? 'PASS' : 'BLOCKED' },
	{ id: 'one-to-four-image-contract', status: imageContract.pass ? 'PASS' : 'BLOCKED' },
	{ id: 'meshy-public-front-door-input-family-contract', status: frontDoorInputFamilyPass ? 'PASS' : 'BLOCKED' },
	{ id: 'native-3d-durable-asset-replay', status: durabilityEvidence.status === 'PASS' && durabilityEvidence.counts?.durabilityChecks === 10 && durabilityEvidence.counts?.tenantPolicyChecks === 10 ? 'PASS' : 'BLOCKED' },
	{ id: 'meshy-durable-operation-replay-across-processes', status: durableOperationReplayEvidence.status === 'PASS' && durableOperationReplayEvidence.firstProcess?.cached === true && durableOperationReplayEvidence.secondProcess?.durableReplay === true && durableOperationReplayEvidence.liveMeshyRequest === false ? 'PASS' : 'BLOCKED' },
	{ id: 'joe-and-louise-native-powerpoint-roster', status: defaultPresenterNativeEvidence.status === 'PASS' && new Set(defaultPresenterNativeEvidence.identities?.map(item => item.identity)).size === 2 && defaultPresenterNativeEvidence.identities.every(item => item.repairOpen === 'PASS' && Number(item.changedFraction) >= 0.002) ? 'PASS' : 'BLOCKED' },
	{ id: 'meshy-generation-and-authoring-latency-budget', status: latencyEvidence.status === 'PASS' && latencyEvidence.checks?.providerWithinBound === true && latencyEvidence.checks?.authoringWithinBound === true && latencyEvidence.checks?.assetWithinSizeBudget === true && latencyEvidence.checks?.liveMeshyRequest === false ? 'PASS' : 'BLOCKED' },
	{ id: 'meshy-modal-two-profile-routing-and-failover-contract', status: modalProfileSafetyEvidence.status === 'PASS_LOCAL_CONTRACT' && modalProfileSafetyEvidence.liveDeploymentAttempted === false && modalProfileSafetyEvidence.checks?.twoProfileRoundRobin === true && modalProfileSafetyEvidence.checks?.profileTokenIsolation === true && modalProfileSafetyEvidence.checks?.healthyEndpointFailover === true ? 'PASS' : 'BLOCKED' },
	{ id: 'meshy-modal-immutable-revision-and-rollback-contract', status: modalRevisionRollbackEvidence?.status === 'PASS_LOCAL_CONTRACT' && modalRevisionRollbackEvidence.liveDeploymentAttempted === false && modalRevisionRollbackEvidence.networkAttempted === false && Array.isArray(modalRevisionRollbackEvidence.profiles) && modalRevisionRollbackEvidence.profiles.length === 2 && modalRevisionRollbackEvidence.checks?.healthGatedRollback === true && modalRevisionRollbackEvidence.checks?.revisionRestore === true && modalRevisionRollbackEvidence.checks?.unknownRevisionFailsClosed === true && modalRevisionRollbackEvidence.checks?.idempotentPromotion === true ? 'PASS' : 'BLOCKED' },
	{ id: 'meshy-owner-approval-and-live-canary-preflight', status: ownerPreflightEvidence?.status === 'READY_FOR_OWNER_ACTION' && ownerPreflightEvidence.localReady === true && ownerPreflightEvidence.networkAttempted === false && Array.isArray(ownerPreflightEvidence.localChecks) && ownerPreflightEvidence.localChecks.every(item => item.status === 'PASS') ? 'PASS' : 'BLOCKED' },
	{ id: 'meshy-mixamo-commercial-terms-research-recorded', status: termsReviewEvidence?.schemaVersion === 'betterpptx.native-3d-commercial-terms-review.v1' && termsReviewEvidence.status === 'RESEARCHED_OWNER_APPROVAL_REQUIRED' && termsReviewEvidence.policyDecision?.productionRoute === 'meshy-mixamo-only' && termsReviewEvidence.policyDecision?.disallowedArtifact.includes('standalone') && termsReviewEvidence.paidProviderTaskAttempted === false ? 'PASS' : 'BLOCKED' },
	{ id: 'meshy-visible-payload-and-mixamo-animation-provenance', status: provenanceEvidence?.status === 'PASS' && provenanceEvidence.networkAttempted === false && Array.isArray(provenanceEvidence.checks) && provenanceEvidence.checks.every(item => item.status === 'PASS') ? 'PASS' : 'BLOCKED' },
	{ id: 'meshy-direct-vs-hybrid-root-cause-evidence', status: directVsHybridPass ? 'PASS' : 'BLOCKED' },
	{ id: 'personalized-meshy-joe-louise-identity-interchangeability', status: identityInterchangeabilityEvidence?.status === 'PASS' && identityInterchangeabilityEvidence.networkAttempted === false && identityInterchangeabilityEvidence.providerRequests === 0 && Array.isArray(identityInterchangeabilityEvidence.checks) && identityInterchangeabilityEvidence.checks.every(item => item.status === 'PASS') && ['personalizedMeshy', 'joe', 'louise'].every(id => identityInterchangeabilityEvidence.identities?.[id]) && new Set(['personalizedMeshy', 'joe', 'louise'].map(id => identityInterchangeabilityEvidence.identities[id].identityNeutralOperationSha256)).size === 1 ? 'PASS' : 'BLOCKED' },
	{ id: 'meshy-owner-control-inventory-and-rotation-path', status: ownerControlEvidence?.status === 'PASS_LOCAL_CONTRACT' && ownerControlEvidence.networkAttempted === false && ownerControlEvidence.secret?.rawValueExposed === false && ownerControlEvidence.secret?.actions?.reveal === true && ownerControlEvidence.secret?.actions?.update === true && ownerControlEvidence.secret?.actions?.rotate === true && ownerControlEvidence.secret?.actions?.test === true && Array.isArray(ownerControlEvidence.checks) && ownerControlEvidence.checks.every(item => item.status === 'PASS') ? 'PASS' : 'BLOCKED' },
	{ id: 'meshy-modal-profile-host-reachability-read-only', status: modalLiveProfileHealthEvidence?.status === 'PASS_LIVE_READ_ONLY' && modalLiveProfileHealthEvidence.probe?.generationSubmitted === false && modalLiveProfileHealthEvidence.probe?.providerRequestBodySent === false && modalLiveProfileHealthEvidence.checks?.allProfilesReachable === true && modalLiveProfileHealthEvidence.checks?.noResponseBodyCaptured === true ? 'PASS' : 'OPEN' },
	{ id: 'meshy-requested-betterxavatar1-betterxavatar2-deployment-coverage', status: modalProfileInventoryEvidence?.status === 'PASS_LIVE_PROFILE_COVERAGE' && modalProfileInventoryEvidence.checks?.requestedProfilesHaveModel3dDeployments === true && modalProfileInventoryEvidence.checks?.noGenerationOrDeploymentAttempted === true ? 'PASS' : 'OPEN' },
	{ id: 'meshy-requested-profile-deployment-preflight', status: modalTargetDeploymentPreflight?.status === 'READY_FOR_OWNER_DEPLOYMENT' && modalTargetDeploymentPreflight.checks?.sourceDigestPinned === true && modalTargetDeploymentPreflight.checks?.stableOpaqueLabels === true && modalTargetDeploymentPreflight.checks?.healthEndpointContractPresent === true && modalTargetDeploymentPreflight.checks?.healthEndpointDoesNotSubmitJobs === true && modalTargetDeploymentPreflight.checks?.upstreamRefsPinned === true && modalTargetDeploymentPreflight.checks?.hfModelRevisionsPinned === true && modalTargetDeploymentPreflight.checks?.revisionOverridesFailClosed === true && modalTargetDeploymentPreflight.checks?.embeddedPayloadDigestComplete === true && modalTargetDeploymentPreflight.checks?.targetProfilesHaveWorkerToken === true && modalTargetDeploymentPreflight.checks?.noDeploymentAttempted === true ? 'PASS' : 'BLOCKED' },
	{ id: 'meshy-guarded-owner-deployment-runner', status: modalTargetDeploymentRun?.status === 'DRY_RUN_READY' && modalTargetDeploymentRun.executeRequested === false && modalTargetDeploymentRun.deploymentAttempted === false && modalTargetDeploymentRun.generationAttempted === false && modalTargetDeploymentRun.credentialStoreMutated === false && modalTargetDeploymentRun.noAutomaticRetry === true ? 'PASS' : 'BLOCKED' },
	{ id: 'meshy-input-contract-matrix-and-fail-closed-live-preflight', status: inputContractPass ? 'PASS' : 'BLOCKED' },
	{ id: 'native-3d-mock-meshy-acquisition-to-pptx-fixture', status: oneShotAcceptancePass ? 'PASS' : 'BLOCKED' },
	{ id: 'native-3d-one-shot-acceptance-fixture', status: oneShotAcceptancePass ? 'PASS' : 'BLOCKED' },
	{ id: 'meshy-provider-concurrency-deadline-billing-and-cancellation-hardening', status: providerHardeningEvidence.status === 'PASS' && providerHardeningEvidence.checks?.oneInFlightOperationPerImmutableHash === 'PASS' && providerHardeningEvidence.checks?.sharedEndToEndDeadlineAcrossGenerationAndRigging === 'PASS' && providerHardeningEvidence.checks?.providerCreditBilling === 'PASS' && providerHardeningEvidence.checks?.internalBillingMetadataHiddenPublicly === 'PASS' && providerHardeningEvidence.checks?.preAbortedRequestStopsBeforeProviderCall === 'PASS' ? 'PASS' : 'BLOCKED' },
	{ id: 'bounded-owner-authorized-live-canary-runner', status: exists(canaryRunnerPath) ? 'PASS' : 'BLOCKED' },
	{ id: 'live-meshy-account', status: provider.configured ? 'PASS' : 'OPEN' },
	{ id: 'owner-license-and-consent-approval', status: ledger.entries?.every(entry => entry.reviewStatus === 'cleared') ? 'PASS' : 'BLOCKED' },
]
const blockers = checks.filter(check => check.status === 'BLOCKED').map(check => check.id)
const open = checks.filter(check => check.status === 'OPEN').map(check => check.id)
const report = {
	schemaVersion: 'betterpptx.3d-presenter-release-gate.v1',
	status: blockers.length ? 'BLOCKED_OWNER_REVIEW' : open.length ? 'OPEN_LIVE_ACCOUNT_REQUIRED' : 'PASS',
	scope: 'native-3d-presenter-only',
	developmentMode: 'premium',
	provider: { configured: provider.configured, accounts: provider.accounts, model: provider.model },
	imageContract,
	checks,
	blockers,
	open,
	artifacts: { glbSha256: glbHash, posterSha256: posterHash, posterBytes: fs.statSync(posterPath).size, inputContractMatrix: inputContractEvidencePath, frontDoorInputFamilies: frontDoorEvidencePath, mockAcquisitionReport: mockAcquisitionEvidencePath, oneShotAcceptanceReport: oneShotAcceptanceEvidencePath, modalRevisionRollbackContract: modalRevisionRollbackEvidencePath, modalLiveProfileHealth: modalLiveProfileHealthEvidencePath, modalProfileInventory: modalProfileInventoryEvidencePath, modalTargetDeploymentPreflight: modalTargetDeploymentPreflightPath, modalTargetDeploymentRun: modalTargetDeploymentRunPath, ownerPreflight: ownerPreflightEvidencePath, ownerDecisionWorksheet: ownerDecisionWorksheetEvidencePath, termsReview: termsReviewEvidencePath, provenance: provenanceEvidencePath, directVsHybridRootCause: directVsHybridEvidencePath, identityInterchangeability: identityInterchangeabilityEvidencePath, ownerControl: ownerControlEvidencePath },
	retryPolicy: 'No live submission is attempted by this gate; one owner-authorized cold canary is required after credentials and approvals are recorded.',
}
writeJsonReport(outputPath, report)
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'PASS') process.exitCode = 2
