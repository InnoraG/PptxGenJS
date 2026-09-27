#!/usr/bin/env node
// Requirement-by-requirement audit for the active LivePortrait + MuseTalk +
// native-3D presenter goal. This is intentionally conservative: owner or
// human decisions are never inferred from automated evidence.
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('betterpptx-mcp/outputs')
const docs = path.resolve('betterpptx-mcp/docs/release-safety')
async function read(name, base = root) {
	const text = await fs.readFile(path.join(base, name), 'utf8')
	return JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text)
}
async function readOptional(name, base = root) {
	try { return await read(name, base) } catch { return null }
}

const [workers, mcp, rotation, provenance, ingestion, releaseCorpus, readiness, billing, identity, identityReady, restoration, ownerClosure, presenter, resaleSafe, reviewDecision, billingCoverage, framing, identityMedia] = await Promise.all([
	read('private-avatar-worker-canary-all.json'),
	read('private-avatar-mcp-canary-report.json'),
	read('avatar-rotation-report.json'),
	read('avatar-worker-provenance-pins-report.json'),
	read('presenter-ingestion-corpus-report.json'),
	read('presenter-release-corpus-report.json'),
	read('avatar-production-readiness-report.json'),
	read('avatar-provider-billing-reconciliation-report.json'),
	read('avatar-identity-continuity-report.json'),
	read('avatar-identity-review-readiness-report.json'),
	read('avatar-restoration-selection-report.json'),
	read('AVATAR-OWNER-CLOSURE-CHECKLIST-2026-07-19.json', docs),
	read('presenter-contract-report.json'),
	read('avatar-resale-safe-pipeline-report.json'),
	read('avatar-identity-review-decision-report.json'),
	read('avatar-provider-billing-coverage-report.json'),
	readOptional('commercial-poc/current-commercial-20260728/current-commercial-avatar-round-cropped-framing-report.json'),
	readOptional('avatar-identity-review-media-audit.json'),
])

// Record Studio evidence is deliberately evaluated from the persisted artifact
// and independent Office probes.  This keeps the requirement machine-checkable
// without pretending that a saved PPTX can expose transient camera-session UI
// state such as a Retake button.
const recordStudioDir = path.join(root, 'commercial-poc', 'recording-import-preservation-test')
const recordStudioProofPath = path.join(recordStudioDir, 'commercial-avatar-recordstudio-ink-laser-proof.pptx')
const [recordStudioPlayback, recordStudioUi, referenceRecordStudioUi, recordStudioAnnotation] = await Promise.all([
	readOptional('commercial-poc/recording-import-preservation-test/recordstudio-playback-com-report.json'),
	readOptional('commercial-poc/recording-import-preservation-test/recordstudio-ui-surface-report.json'),
	readOptional('commercial-poc/recording-import-preservation-test/reference-recordstudio-ui-surface-report.json'),
	readOptional('commercial-poc/recording-import-preservation-test/recordstudio-annotation-roundtrip-report.json'),
])

// The active goal explicitly requires a final MCP-authored three-minute proof
// deck.  Keep this separate from the smaller framing gate so the completion
// audit cannot pass while only an older commercial owner artifact is healthy.
const finalProofDir = path.join(root, 'commercial-poc', 'final-authoring-excellence-20260728')
const finalProofPptxPath = path.join(finalProofDir, 'betterpptx-authoring-excellence-final-3min-quick-reference.pptx')
const finalProofReport = await readOptional('commercial-poc/final-authoring-excellence-20260728/betterpptx-authoring-excellence-final-3min-quick-reference-report.json')
const finalProofPlayback = await readOptional('commercial-poc/final-authoring-excellence-20260728/quick-reference-playback-report.json')
const finalProofFreshPlayback = await readOptional('commercial-poc/final-authoring-excellence-20260728/quick-reference-playback-triple-check-20260729-rerun2.json')
const finalProofPackage = await readOptional('commercial-poc/final-authoring-excellence-20260728/betterpptx-authoring-excellence-final-3min-package-report.json')
const finalProofVisualPath = path.join(finalProofDir, 'visual-qa', 'quick-reference-canonical-slide-01.png')
let finalProofPptxExists = false
let finalProofVisualExists = false
try { finalProofPptxExists = (await fs.stat(finalProofPptxPath)).isFile() } catch {}
try { finalProofVisualExists = (await fs.stat(finalProofVisualPath)).isFile() } catch {}
const finalProofChecks = finalProofReport?.checks || {}
const finalProofFeatureSet = [
	'packageOpen', 'nativeAudio', 'mutedAvatar', 'interactivePauseCommand',
	'autoplayCommand', 'native3d', 'timedAnimation', 'ink', 'laser',
	'roundWindow', 'aspectSafeCrop', 'showNarration', 'useTimings',
	'advanceAfterTime180s', 'quickReferenceGeometry',
]
const finalProofFeatureChecksPass = finalProofFeatureSet.every(key => finalProofChecks[key] === true)
const finalProofSamples = Array.isArray(finalProofPlayback?.samples) ? finalProofPlayback.samples : []
const finalProofFreshSamples = Array.isArray(finalProofFreshPlayback?.samples) ? finalProofFreshPlayback.samples : []
const samePath = (candidate, expected) => typeof candidate === 'string' && path.normalize(path.resolve(candidate)) === path.normalize(path.resolve(expected))
const finalProofReportPathMatches = samePath(finalProofReport?.output, finalProofPptxPath)
const finalProofPlaybackPathMatches = samePath(finalProofPlayback?.pptx, finalProofPptxPath)
const finalProofFreshPlaybackPathMatches = samePath(finalProofFreshPlayback?.pptx, finalProofPptxPath)
const finalProofGeometryMatches = finalProofReport?.avatarGeometryPt?.left === 791.52 &&
	finalProofReport?.avatarGeometryPt?.top === 371.52 &&
	finalProofReport?.avatarGeometryPt?.width === 162 &&
	finalProofReport?.avatarGeometryPt?.height === 162
const finalProofLongRunPass = finalProofPlayback?.status === 'PASS' &&
	finalProofPlayback?.timingContract?.expectedSeconds === 180 &&
	finalProofPlayback?.timingContract?.transitionAdvTmMs === 180000 &&
	finalProofPlayback?.timingContract?.showNarration === true &&
	finalProofPlayback?.timingContract?.useTimings === true &&
	['t+47s', 't+92s', 't+137s'].every(label => finalProofSamples.some(sample => sample.label === label && sample.state === 1)) &&
	// A one-slide 180-second proof is expected to finish just after the
	// 182-second tail sample.  PowerPoint reports state=5 after the timed
	// slide has completed; accepting that terminal state avoids treating a
	// successful natural end as a playback failure while retaining strict
	// running-state checks throughout the timeline.
	finalProofSamples.some(sample => sample.label === 't+182s' && (sample.state === 1 || sample.state === 5))
const finalProofFreshLongRunPass = finalProofFreshPlayback?.status === 'PASS' &&
	finalProofFreshPlayback?.timingContract?.expectedSeconds === 180 &&
	finalProofFreshPlayback?.timingContract?.transitionAdvTmMs === 180000 &&
	finalProofFreshPlayback?.timingContract?.showNarration === true &&
	finalProofFreshPlayback?.timingContract?.useTimings === true &&
	['t+47s', 't+92s', 't+137s'].every(label => finalProofFreshSamples.some(sample => sample.label === label && sample.state === 1)) &&
	finalProofFreshSamples.some(sample => sample.label === 't+182s' && (sample.state === 1 || sample.state === 5))
const finalAuthoringExcellence = {
	status: finalProofPptxExists && finalProofVisualExists && finalProofReport?.status === 'PASS' && finalProofPackage?.status === 'PASS' && finalProofReportPathMatches && finalProofPlaybackPathMatches && finalProofFreshPlaybackPathMatches && finalProofGeometryMatches && finalProofFeatureChecksPass && finalProofLongRunPass && finalProofFreshLongRunPass,
	evidence: [
		'outputs/commercial-poc/final-authoring-excellence-20260728/betterpptx-authoring-excellence-final-3min-quick-reference.pptx',
		'outputs/commercial-poc/final-authoring-excellence-20260728/betterpptx-authoring-excellence-final-3min-quick-reference-report.json',
		'outputs/commercial-poc/final-authoring-excellence-20260728/betterpptx-authoring-excellence-final-3min-package-report.json',
		'outputs/commercial-poc/final-authoring-excellence-20260728/quick-reference-playback-report.json',
		'outputs/commercial-poc/final-authoring-excellence-20260728/quick-reference-playback-triple-check-20260729-rerun2.json',
		'outputs/commercial-poc/final-authoring-excellence-20260728/visual-qa/quick-reference-canonical-slide-01.png',
	],
	checks: {
		proofDeck: finalProofPptxExists,
		visualQa: finalProofVisualExists,
		reportTargetsCanonicalDeck: finalProofReportPathMatches && finalProofPlaybackPathMatches && finalProofFreshPlaybackPathMatches,
		exactQuickRecordGeometry: finalProofGeometryMatches,
		independentPackageInspection: finalProofPackage?.status === 'PASS',
		featureSet: finalProofFeatureChecksPass,
		full180sRuntime: finalProofLongRunPass,
		freshFull180sRuntime: finalProofFreshLongRunPass,
	},
}

// The user-facing request now also requires a complete Authoring Director
// proof deck, not only the one-slide quick reference. Keep its package and
// long-run checks independent so a healthy regression artifact cannot be
// mistaken for the full presentation deliverable.
const directorProofDir = path.join(root, 'commercial-poc', 'final-authoring-excellence-20260728')
// The v2 Director build is the report's actual canonical output. The older
// non-v2 filename remains as a historical artifact and must not be mixed with
// v2 package/runtime evidence.
const directorProofPptxPath = path.join(directorProofDir, 'betterpptx-authoring-director-final-10-slide-director-v2.pptx')
const directorProofReport = await readOptional('commercial-poc/final-authoring-excellence-20260728/betterpptx-authoring-director-final-10-slide-report.json')
const directorProofPackage = await readOptional('commercial-poc/final-authoring-excellence-20260728/authoring-director-10-slide-package-director-v2-report.json')
const directorProofPlayback = await readOptional('commercial-poc/final-authoring-excellence-20260728/authoring-director-10-slide-180s-director-v2-com.json')
const directorProofFreshPlayback = await readOptional('commercial-poc/final-authoring-excellence-20260728/authoring-director-10-slide-playback-current-v2.json')
const directorProofPauseResume = await readOptional('commercial-poc/final-authoring-excellence-20260728/authoring-director-10-slide-pause-resume-director-v2-com.json')
const directorProofFreshPauseResume = await readOptional('commercial-poc/final-authoring-excellence-20260728/authoring-director-10-slide-pause-resume-current-v2.json')
const directorProofAvatarRuntime = await readOptional('commercial-poc/final-authoring-excellence-20260728/authoring-director-avatar-runtime-current-v2.json')
const directorProofTail = await readOptional('commercial-poc/final-authoring-excellence-20260728/authoring-director-10-slide-tail-director-v2-com.json')
const directorProofFreshTail = await readOptional('commercial-poc/final-authoring-excellence-20260728/authoring-director-10-slide-tail-current-v2.json')
const directorProofVisualPath = path.join(directorProofDir, 'visual-qa-10-slide', 'slide-04.png')
let directorProofPptxExists = false
let directorProofVisualExists = false
try { directorProofPptxExists = (await fs.stat(directorProofPptxPath)).isFile() } catch {}
try { directorProofVisualExists = (await fs.stat(directorProofVisualPath)).isFile() } catch {}
const directorProofPathMatches = samePath(directorProofReport?.output, directorProofPptxPath) && samePath(directorProofPlayback?.pptx, directorProofPptxPath)
const directorProofFreshPathMatches = samePath(directorProofFreshPlayback?.pptx, directorProofPptxPath) && samePath(directorProofFreshTail?.pptx, directorProofPptxPath) && samePath(directorProofFreshPauseResume?.pptx, directorProofPptxPath)
const directorProofRuntimePass = directorProofPlayback?.status === 'PASS' && directorProofPlayback?.slideCount === 10 && directorProofPlayback?.nativeAudioObjects >= 10 && directorProofPlayback?.nativeVideoObjects >= 1 && directorProofPlayback?.native3dObjects >= 1 && ['t+47s', 't+92s', 't+137s'].every(label => directorProofPlayback?.samples?.some(sample => sample.label === label && sample.state === 1)) && directorProofPlayback?.startupContract?.firstRunningCheckpointRequired === 't+47s' && directorProofPlayback?.startupContract?.firstRunningSampleState === 1
const directorProofFreshRuntimePass = directorProofFreshPlayback?.status === 'PASS' && directorProofFreshPlayback?.slideCount === 10 && directorProofFreshPlayback?.nativeAudioObjects >= 10 && directorProofFreshPlayback?.nativeVideoObjects >= 1 && directorProofFreshPlayback?.native3dObjects >= 1 && ['t+47s', 't+92s', 't+137s'].every(label => directorProofFreshPlayback?.samples?.some(sample => sample.label === label && sample.state === 1)) && directorProofFreshPlayback?.startupContract?.firstRunningCheckpointRequired === 't+47s' && directorProofFreshPlayback?.startupContract?.firstRunningSampleState === 1
const directorProofFreshPauseResumePass = directorProofFreshPauseResume?.ok === true && directorProofFreshPauseResume?.firstSlideCount === 10 && directorProofFreshPauseResume?.secondSlideCount === 10 && directorProofFreshPauseResume?.runningState === 1 && directorProofFreshPauseResume?.pausedState === 2 && directorProofFreshPauseResume?.resumedState === 1 && directorProofFreshPauseResume?.replayState === 1
const directorProofFreshTailPass = directorProofFreshTail?.status === 'PASS' && directorProofFreshTail?.checks?.noLoopSetting === true && directorProofFreshTail?.checks?.finalSlideReached === true && directorProofFreshTail?.checks?.finalSlideHeldAt190s === true && directorProofFreshTail?.checks?.naturalCompletionOrFinalSlideAt200s === true
const directorProofVisualQaCoverage = directorProofPackage?.checks?.visualQaCoverage === true && directorProofPackage?.visualQa?.slideCount === 10
const authoringDirectorProof = {
	status: directorProofPptxExists && directorProofVisualExists && directorProofVisualQaCoverage && directorProofReport?.status === 'PASS' && directorProofReport?.slideCount === 10 && directorProofPackage?.status === 'PASS' && directorProofPathMatches && directorProofFreshPathMatches && directorProofRuntimePass && directorProofFreshRuntimePass && directorProofPauseResume?.ok === true && directorProofFreshPauseResumePass && directorProofFreshTailPass && directorProofAvatarRuntime?.status === 'PASS' && directorProofTail?.status === 'PASS',
	evidence: [
		'outputs/commercial-poc/final-authoring-excellence-20260728/betterpptx-authoring-director-final-10-slide-director-v2.pptx',
		'outputs/commercial-poc/final-authoring-excellence-20260728/betterpptx-authoring-director-final-10-slide-report.json',
		'outputs/commercial-poc/final-authoring-excellence-20260728/authoring-director-10-slide-package-director-v2-report.json',
		'outputs/commercial-poc/final-authoring-excellence-20260728/authoring-director-10-slide-180s-director-v2-com.json',
		'outputs/commercial-poc/final-authoring-excellence-20260728/authoring-director-10-slide-playback-current-v2.json',
		'outputs/commercial-poc/final-authoring-excellence-20260728/authoring-director-10-slide-pause-resume-director-v2-com.json',
		'outputs/commercial-poc/final-authoring-excellence-20260728/authoring-director-10-slide-pause-resume-current-v2.json',
		'outputs/commercial-poc/final-authoring-excellence-20260728/authoring-director-avatar-runtime-current-v2.json',
		'outputs/commercial-poc/final-authoring-excellence-20260728/authoring-director-10-slide-tail-director-v2-com.json',
		'outputs/commercial-poc/final-authoring-excellence-20260728/authoring-director-10-slide-tail-current-v2.json',
		'outputs/commercial-poc/final-authoring-excellence-20260728/visual-qa-10-slide/slide-04.png',
	],
	checks: {
		proofDeck: directorProofPptxExists,
		tenSlides: directorProofReport?.slideCount === 10,
		visualQa: directorProofVisualExists,
		visualQaAllSlides: directorProofVisualQaCoverage,
		independentPackageInspection: directorProofPackage?.status === 'PASS',
		directorReportTargetsCanonicalDeck: directorProofPathMatches && directorProofFreshPathMatches,
		full180sRuntime: directorProofRuntimePass,
		freshFull180sRuntime: directorProofFreshRuntimePass,
		pauseResumeReplay: directorProofPauseResume?.ok === true && directorProofPauseResume?.runningState === 1 && directorProofPauseResume?.pausedState === 2 && directorProofPauseResume?.resumedState === 1 && directorProofPauseResume?.replayState === 1,
		freshPauseResumeReplay: directorProofFreshPauseResumePass,
		avatarMediaRuntime: directorProofAvatarRuntime?.status === 'PASS' && directorProofAvatarRuntime?.checks?.nativeVideo === true && directorProofAvatarRuntime?.checks?.autoplay === true && directorProofAvatarRuntime?.checks?.muted === true && directorProofAvatarRuntime?.checks?.mediaPayloadLength === true,
		tailRuntime: directorProofTail?.status === 'PASS' && directorProofTail?.checks?.noLoopSetting === true && directorProofTail?.checks?.finalSlideReached === true && directorProofTail?.checks?.finalSlideHeldAt190s === true && directorProofTail?.checks?.naturalCompletionOrFinalSlideAt200s === true,
		freshTailRuntime: directorProofFreshTailPass,
	},
}
let recordStudioProofExists = false
try { recordStudioProofExists = (await fs.stat(recordStudioProofPath)).isFile() } catch {}
const recordStudioControlsMatch = Boolean(
	recordStudioUi?.recordTab?.found === true &&
	recordStudioUi?.recordTab?.enabled === true &&
	referenceRecordStudioUi?.recordTab?.found === true &&
	referenceRecordStudioUi?.recordTab?.enabled === true &&
	JSON.stringify(recordStudioUi?.controls || null) === JSON.stringify(referenceRecordStudioUi?.controls || null),
)
const recordStudio = {
	status: recordStudioProofExists &&
		recordStudioAnnotation?.ok === true &&
		recordStudioAnnotation?.nativeInk === true &&
		recordStudioAnnotation?.nativeLaser === true &&
		recordStudioAnnotation?.nativeNarrationMedia === true &&
		recordStudioAnnotation?.powerPointOpen === true &&
		recordStudioPlayback?.ok === true &&
		recordStudioPlayback?.pausedState === 2 &&
		recordStudioPlayback?.resumedState === 1 &&
		recordStudioPlayback?.replayState === 1 &&
		recordStudioControlsMatch,
	evidence: [
		'outputs/commercial-poc/recording-import-preservation-test/commercial-avatar-recordstudio-ink-laser-proof.pptx',
		'outputs/commercial-poc/recording-import-preservation-test/recordstudio-playback-com-report.json',
		'outputs/commercial-poc/recording-import-preservation-test/recordstudio-ui-surface-report.json',
		'outputs/commercial-poc/recording-import-preservation-test/reference-recordstudio-ui-surface-report.json',
		'outputs/commercial-poc/recording-import-preservation-test/recordstudio-annotation-roundtrip-report.json',
	],
	checks: {
		proofArtifact: recordStudioProofExists,
		nativeAnnotations: recordStudioAnnotation?.ok === true && recordStudioAnnotation?.nativeInk === true && recordStudioAnnotation?.nativeLaser === true,
		playback: recordStudioPlayback?.ok === true,
		pauseResumeReplay: recordStudioPlayback?.pausedState === 2 && recordStudioPlayback?.resumedState === 1 && recordStudioPlayback?.replayState === 1,
		officeRecordTabParity: recordStudioControlsMatch,
	},
}

const requirements = [
	{ id: 'dual-worker-live', status: workers.status === 'research-live-pass' && workers.accountCount === 2 && workers.results.every(item => item.status === 'PASS'), evidence: 'outputs/private-avatar-worker-canary-all.json' },
	{ id: 'mcp-pptx-powerpoint-canary', status: mcp.status === 'research-live-pass' && mcp.workflow?.saved === true && mcp.powerPoint?.status === 'PASS', evidence: 'outputs/private-avatar-mcp-canary-report.json' },
	{ id: 'rotation-idempotency-failover', status: rotation.status === 'PASS' && rotation.checks?.failed === 0, evidence: 'outputs/avatar-rotation-report.json' },
	{ id: 'worker-provenance-license-freeze', status: provenance.status === 'PASS' && provenance.sbom?.reviewed === true, evidence: 'outputs/avatar-worker-provenance-pins-report.json' },
	{ id: 'tolerant-ingestion', status: ingestion.status === 'PASS' && ingestion.caseCount === 10, evidence: 'outputs/presenter-ingestion-corpus-report.json' },
	{ id: 'release-corpus', status: releaseCorpus.status === 'PASS' && Number.isInteger(releaseCorpus.summary?.total) && releaseCorpus.summary.total > 0 && releaseCorpus.summary.passed === releaseCorpus.summary.total, evidence: 'outputs/presenter-release-corpus-report.json' },
	{ id: 'readiness-no-blockers', status: readiness.blockers?.length === 0 && readiness.summary?.blocked === 0, evidence: 'outputs/avatar-production-readiness-report.json' },
	{ id: 'provider-billing', status: false, state: billing?.checks?.finalCommercialWindowRevisionMatched === true ? 'OPEN_OWNER_ATTRIBUTION_OR_AGGREGATE_APPROVAL' : 'OPEN_OWNER_FINAL_WINDOW_EXPORT', evidence: 'outputs/avatar-provider-billing-reconciliation-report.json' },
	{ id: 'owner-identity-review', status: false, state: ['READY_FOR_OWNER_REVIEW', 'READY_FOR_INDEPENDENT_REVIEW'].includes(identityReady.status) ? 'OPEN_OWNER_REVIEW' : 'BLOCKED_PACKET', evidence: 'outputs/avatar-identity-review-readiness-report.json' },
	{ id: 'owner-identity-review-media-integrity', status: identityMedia?.status === 'PASS' && identityMedia.cardCount === 6 && identityMedia.embeddedImageCount === 1 && identityMedia.embeddedVideoCount === 5 && identityMedia.noExternalMediaReferences === true && Number(identityMedia.payloadBytes) > 0, state: identityMedia?.status === 'PASS' ? 'PASS_EMBEDDED_MEDIA_INTEGRITY' : 'OPEN_IDENTITY_REVIEW_MEDIA', evidence: 'outputs/avatar-identity-review-media-audit.json' },
	{ id: 'restoration-policy', status: restoration.status === 'OPEN_NO_RESTORATION_DEPLOYED' && restoration.deployment?.enabled === false, state: 'PASS_FAIL_CLOSED', evidence: 'outputs/avatar-restoration-selection-report.json' },
	{ id: 'native-meshy-mixamo-production-authoring', status: false, state: 'OPEN_OWNER_CREDENTIAL_TERMS_WORKSHEET_AND_LIVE_AB', evidence: 'research-demos/.../meshy-owner-decision-worksheet-20260718.json' },
	{ id: 'unified-six-lane-lowering', status: presenter.status === 'PASS' && presenter.runtimeDirector?.laneCorpus?.length === 6, evidence: 'outputs/presenter-contract-report.json' },
	{ id: 'resale-safe-baseline', status: resaleSafe.status === 'PASS' && resaleSafe.baseline === 'frozen-talking-head-plus-gated-meshy-mixamo-native-3d', state: 'PASS_POLICY_FROZEN_WITH_NATIVE3D_PROVIDER_GATE', evidence: 'outputs/avatar-resale-safe-pipeline-report.json' },
	{ id: 'review-decision-validator', status: ['OPEN_OWNER_REVIEW_FILE_REQUIRED', 'OPEN_REVIEWER_FILE_REQUIRED'].includes(reviewDecision.status) && reviewDecision.failClosed === true, state: 'PASS_FAIL_CLOSED', evidence: 'outputs/avatar-identity-review-decision-report.json' },
	{ id: 'billing-coverage-validator', status: billingCoverage.status === 'OPEN_OWNER_EXPORT_REQUIRED' && billingCoverage.failClosed === true, state: 'PASS_FAIL_CLOSED', evidence: 'outputs/avatar-provider-billing-coverage-report.json' },
	{ id: 'record-studio-office-compatible', status: recordStudio.status, state: recordStudio.status ? 'PASS_NATIVE_MEDIA_TIMING_INK_LASER_AND_UI_PARITY' : 'OPEN_RECORD_STUDIO_EVIDENCE', evidence: recordStudio.evidence },
	{ id: 'avatar-framing-integrity', status: framing?.status === 'PASS' && framing.checks?.aspectSafeSrcRect === true && framing.checks?.roundPresenterWindow === true && framing.checks?.powerPointOpen === true, state: framing?.status === 'PASS' ? 'PASS_ASPECT_SAFE_ROUND_PPTX' : 'OPEN_CURRENT_ARTIFACT_FRAMING', evidence: 'outputs/commercial-poc/current-commercial-20260728/current-commercial-avatar-round-cropped-framing-report.json' },
	{ id: 'final-authoring-excellence-proof', status: finalAuthoringExcellence.status, state: finalAuthoringExcellence.status ? 'PASS_MCP_AUTHORED_180S_NATIVE_PPTX_PROOF' : 'OPEN_FINAL_PROOF_DECK_OR_RUNTIME', evidence: finalAuthoringExcellence.evidence },
	{ id: 'authoring-director-10-slide-proof', status: authoringDirectorProof.status, state: authoringDirectorProof.status ? 'PASS_MCP_AUTHORED_10_SLIDE_180S_DIRECTOR_PROOF' : 'OPEN_AUTHORING_DIRECTOR_FULL_DECK_OR_RUNTIME', evidence: authoringDirectorProof.evidence },
]

const open = requirements.filter(item => item.status === false)
const report = {
	schemaVersion: 'betterpptx.avatar-goal-completion-audit.v1',
	status: open.length ? 'INCOMPLETE_OWNER_GATES' : 'COMPLETE',
	requirements,
	summary: { passed: requirements.filter(item => item.status === true).length, open: open.length, total: requirements.length },
	openGateIds: open.map(item => item.id),
	publicEnablementAllowed: false,
	ownerClosureChecklist: ownerClosure.status,
	identityPacketStatus: identity.status,
	interpretation: 'The goal is not complete while any owner gate is open. Automated PASS does not substitute for billing approval, the authorized owner one-time LP/MT visual decision, or required Meshy → Mixamo production authoring.',
}
await fs.writeFile(path.join(root, 'avatar-goal-completion-audit.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'COMPLETE') process.exitCode = 2
