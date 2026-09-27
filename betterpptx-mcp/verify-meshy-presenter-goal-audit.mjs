#!/usr/bin/env node
// Requirement-level completion audit for the native 3D presenter goal.
// This is local-only: it reads existing evidence, never calls Meshy/Modal,
// never reads credentials, and never converts owner approval into inference.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeJsonReport } from './lib/atomic-report.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const demo = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar')
const gatePath = path.join(demo, 'visual-artifacts', 'release-gates', '3d-presenter-release-gate.json')
const worksheetPath = path.join(demo, 'visual-artifacts', 'release-gates', 'meshy-owner-decision-worksheet-20260718.json')
const provenancePath = path.join(demo, 'visual-artifacts', 'release-gates', 'meshy-mixamo-provenance-20260718.json')
const rootCausePath = path.join(demo, 'visual-artifacts', 'release-gates', 'meshy-direct-vs-hybrid-root-cause-20260718.json')
const identityPath = path.join(demo, 'visual-artifacts', 'release-gates', 'meshy-presenter-identity-interchangeability-20260718.json')
const acceptancePath = path.join(demo, 'visual-artifacts', 'live-meshy-acceptance-20260718', 'acceptance-report.json')
const suppliedAcceptancePath = path.join(demo, 'visual-artifacts', 'release-gates', 'sample-meshy-supplied-acceptance-20260719', 'sample-meshy-supplied-acceptance.json')
const trackerPath = path.join(demo, 'visual-progress.html')
const outputPath = path.join(demo, 'visual-artifacts', 'release-gates', 'meshy-goal-completion-audit-20260718.json')

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')) }
function exists(filePath) { return fs.existsSync(filePath) }
function optionalJson(filePath) { return filePath && exists(filePath) ? readJson(filePath) : null }
function gateStatus(gate, id) { return gate.checks?.find(item => item.id === id)?.status || 'MISSING' }
function evidence(...paths) { return [...new Set(paths.filter(Boolean).map(item => path.resolve(item)))] }

const gate = readJson(gatePath)
const worksheet = readJson(worksheetPath)
const provenance = readJson(provenancePath)
const rootCause = readJson(rootCausePath)
const identity = readJson(identityPath)
const acceptance = readJson(acceptancePath)
const suppliedAcceptance = optionalJson(suppliedAcceptancePath)
const currentNativeAcceptance = suppliedAcceptance?.status === 'PASS' ? suppliedAcceptance : acceptance
const liveCanary = optionalJson(!acceptance.fixture ? acceptance.canaryReport : null)
const modalHealth = optionalJson(gate.artifacts?.modalLiveProfileHealth)
const modalInventory = optionalJson(gate.artifacts?.modalProfileInventory)
const modalRevision = optionalJson(gate.artifacts?.modalRevisionRollbackContract)
const latency = optionalJson(path.join(demo, 'visual-artifacts', 'release-gates', 'meshy-latency-budget-20260718.json'))
const providerHardening = optionalJson(path.join(demo, 'visual-artifacts', 'release-gates', 'meshy-provider-hardening-20260718.json'))
const trackerHtml = fs.readFileSync(trackerPath, 'utf8')
const localLinks = [...trackerHtml.matchAll(/(?:href|src)="([^"]+)"/g)].map(match => match[1]).filter(item => !/^(?:https?:|#|data:)/.test(item))
const missingTrackerLinks = localLinks.filter(item => !exists(path.resolve(demo, item)))
const liveAcceptancePass = Boolean(
	acceptance.status === 'PASS' &&
	acceptance.fixture === false &&
	acceptance.networkAttempted === true &&
	liveCanary?.status === 'PASS' &&
	liveCanary.networkAttempted === true &&
	liveCanary.provider?.configured === true &&
	Number.isInteger(liveCanary.inputCount) &&
	liveCanary.inputCount >= 1 && liveCanary.inputCount <= 4 &&
	acceptance.canaryReport &&
	liveCanary.output?.glbSha256 &&
	acceptance.artifacts?.glb?.sha256 === liveCanary.output.glbSha256 &&
	acceptance.artifacts?.pptx?.repairVerifierPassed === true &&
	acceptance.artifacts?.motion?.slide1?.pass === true &&
	acceptance.artifacts?.motion?.slide2?.pass === true
)
const requestedProfilesLivePass = Boolean(
	gateStatus(gate, 'meshy-requested-betterxavatar1-betterxavatar2-deployment-coverage') === 'PASS' &&
	modalInventory?.status === 'PASS_LIVE_PROFILE_COVERAGE' &&
	modalInventory.checks?.requestedProfilesHaveModel3dDeployments === true &&
	Array.isArray(modalInventory.requestedProfiles) &&
	modalInventory.requestedProfiles.join(',') === 'betterxavatar1,betterxavatar2'
)
const liveHealthRevisionRollbackPass = Boolean(
	requestedProfilesLivePass &&
	modalHealth?.checks?.healthRouteConfiguredForAllProfiles === true &&
	Array.isArray(modalHealth.profiles) &&
	modalHealth.profiles.length === 2 &&
	new Set(modalHealth.profiles.map(item => item.profile)).size === 2 &&
	modalHealth.profiles.every(item => ['betterxavatar1', 'betterxavatar2'].includes(item.profile)) &&
	modalHealth.profiles.every(item => item.healthPayloadValidated === true && item.revision && item.sourceDigest) &&
	modalRevision?.liveDeploymentAttempted === true &&
	modalRevision.networkAttempted === true &&
	Array.isArray(modalRevision.rollbackResults) &&
	modalRevision.rollbackResults.length === 2 &&
	Array.isArray(modalRevision.profiles) &&
	modalRevision.profiles.length === 2 &&
	new Set(modalRevision.profiles.map(item => item.profile)).size === 2 &&
	modalRevision.profiles.every(item => ['betterxavatar1', 'betterxavatar2'].includes(item.profile)) &&
	modalRevision.rollbackResults.every(item => item.rolledBack === true && item.restored === true && item.unknownRejected === true)
)
const liveProviderOperationsPass = Boolean(
	liveAcceptancePass &&
	latency?.checks?.liveMeshyRequest === true &&
	providerHardening?.liveEvidence?.providerCreditsAccounted === true &&
	providerHardening.liveEvidence?.cancellationProven === true &&
	providerHardening.liveEvidence?.observabilityProven === true
)
const releasePassCount = gate.checks?.filter(item => item.status === 'PASS').length || 0
const releaseOpenCount = gate.checks?.filter(item => item.status === 'OPEN').length || 0
const releaseBlockedCount = gate.checks?.filter(item => item.status === 'BLOCKED').length || 0
const releaseImageContractSummaryPass = Boolean(
	gate.imageContract?.pass === true &&
	gate.imageContract?.min === 1 &&
	gate.imageContract?.max === 4 &&
	gate.imageContract?.rejectsMixedFamilies === true,
)
const acceptanceMotionFractions = [
	currentNativeAcceptance.powerpoint?.motion?.slide1?.changedFraction ?? currentNativeAcceptance.artifacts?.motion?.slide1?.changedFraction,
	currentNativeAcceptance.powerpoint?.motion?.slide2?.changedFraction ?? currentNativeAcceptance.artifacts?.motion?.slide2?.changedFraction,
].map(value => Number(value).toFixed(6))

const checks = [
	{
		id: 'mesh-visible-identity-preserved',
		requirement: 'The visible body, face, hair, clothing, UVs, materials, and textures remain Meshy-generated.',
		status: gateStatus(gate, 'meshy-visible-payload-and-mixamo-animation-provenance') === 'PASS' && provenance.checks?.some(item => item.id === 'mesh-vertex-and-visible-attribute-payload-preserved' && item.status === 'PASS') ? 'PASS_LOCAL' : 'MISSING',
		evidence: evidence(provenancePath),
	},
	{
		id: 'mixamo-runtime-animation-contract',
		requirement: 'The frozen 65-joint, 18-clip Mixamo-compatible library owns runtime animation.',
		status: gateStatus(gate, 'meshy-visible-payload-and-mixamo-animation-provenance') === 'PASS' && provenance.checks?.some(item => item.id === 'source-animation-container-not-used-as-runtime-contract' && item.status === 'PASS') ? 'PASS_LOCAL' : 'MISSING',
		evidence: evidence(provenancePath),
	},
	{
		id: 'multi-image-input-contract',
		requirement: 'The personalized lane accepts one to four supported full-body images and fails closed outside that contract.',
		status: gateStatus(gate, 'meshy-input-contract-matrix-and-fail-closed-live-preflight') === 'PASS' && gateStatus(gate, 'meshy-public-front-door-input-family-contract') === 'PASS' && releaseImageContractSummaryPass ? 'PASS_LOCAL' : 'MISSING',
		evidence: evidence(gate.artifacts?.inputContractMatrix),
		detail: `releaseImageContractSummary=${releaseImageContractSummaryPass}`,
	},
	{
		id: 'fallback-identities',
		requirement: 'Joe and Louise remain available when the user does not provide a personal presenter.',
		status: gateStatus(gate, 'joe-and-louise-native-powerpoint-roster') === 'PASS' ? 'PASS_LOCAL' : 'MISSING',
		evidence: evidence(gate.artifacts?.ownerPreflight, path.join(demo, 'visual-artifacts', 'default-presenter-native-gates-20260718', 'default-presenter-native-gates.json')),
	},
	{
		id: 'identity-swap-authoring-invariance',
		requirement: 'Changing the visible presenter preserves choreography, timing, camera, placement, animation intent, content pairing, and Morph continuity.',
		status: gateStatus(gate, 'personalized-meshy-joe-louise-identity-interchangeability') === 'PASS' && identity.status === 'PASS' ? 'PASS_LOCAL' : 'MISSING',
		evidence: evidence(identityPath),
	},
	{
		id: 'native-powerpoint-proof',
		requirement: 'The corrected asset opens, reloads, exports, and animates visibly in native PowerPoint without a repair/crash result.',
		status: gateStatus(gate, 'native-3d-one-shot-acceptance-fixture') === 'PASS' && currentNativeAcceptance.status === 'PASS' ? 'PASS_LOCAL' : 'MISSING',
		evidence: evidence(suppliedAcceptancePath, acceptancePath, gate.artifacts?.oneShotAcceptanceReport),
	},
	{
		id: 'direct-path-root-cause-closed',
		requirement: 'The original direct Meshy animation path is diagnosed and the corrected hybrid path is the runtime correction.',
		status: gateStatus(gate, 'meshy-direct-vs-hybrid-root-cause-evidence') === 'PASS' && rootCause.directMeshyPath?.status === 'FAILED_NATIVE_VISUAL_CONTRACT' && rootCause.correctedHybridPath?.status === 'PASS_NATIVE_VISUAL_CONTRACT' ? 'PASS_LOCAL' : 'MISSING',
		evidence: evidence(rootCausePath),
	},
	{
		id: 'live-meshy-request',
		requirement: 'A real one-to-four-image Meshy request completes through the production adapter.',
		status: liveAcceptancePass ? 'PASS_LIVE' : 'OPEN_OWNER',
		evidence: evidence(gate.artifacts?.oneShotAcceptanceReport),
		detail: gateStatus(gate, 'live-meshy-account') === 'PASS' ? 'Live account evidence is present.' : 'The current acceptance report is fixture/mock evidence; the live account and owner-approved canary remain open.',
	},
	{
		id: 'owner-rights-consent-approval',
		requirement: 'Meshy terms, image consent, Mixamo rights, and Joe/Louise fallback distribution rights are cleared by the owner.',
		status: gateStatus(gate, 'owner-license-and-consent-approval') === 'PASS' && worksheet.status === 'OWNER_DECISIONS_CLEARED' && worksheet.clearedDecisionCount === 7 ? 'PASS_OWNER' : 'BLOCKED_OWNER',
		evidence: evidence(worksheetPath, path.join(repo, 'betterpptx-mcp', 'docs', 'release-safety', 'MESHY-3D-OWNER-APPROVAL-PACKET.md')),
		detail: 'No rights or consent approval is inferred from local runtime proof.',
	},
	{
		id: 'requested-profile-live-deployment',
		requirement: 'The same immutable worker revision is deployed under betterxavatar1 and betterxavatar2.',
		status: requestedProfilesLivePass ? 'PASS_LIVE' : 'OPEN_OWNER',
		evidence: evidence(gate.artifacts?.modalProfileInventory, gate.artifacts?.modalTargetDeploymentPreflight),
		detail: 'The requested profiles exist and are preflighted locally, but current inventory reports zero deployed model3d apps on both targets.',
	},
	{
		id: 'live-health-revision-rollback',
		requirement: 'Live health, immutable revision identity, promotion, and rollback are proven for both requested profiles.',
		status: liveHealthRevisionRollbackPass ? 'PASS_LIVE' : 'OPEN_OWNER',
		evidence: evidence(gate.artifacts?.modalRevisionRollbackContract, gate.artifacts?.modalLiveProfileHealth),
		detail: 'The local state-machine contract passes, but live target deployment/revision/rollback evidence is not present.',
	},
	{
		id: 'live-provider-operations',
		requirement: 'Live provider credits, cache behavior, cancellation, latency, observability, and bounded downstream acceptance are proven.',
		status: liveProviderOperationsPass ? 'PASS_LIVE' : 'OPEN_OWNER',
		evidence: evidence(gate.artifacts?.oneShotAcceptanceReport, gate.artifacts?.inputContractMatrix),
		detail: 'Local mocks and no-network acceptance pass; live provider operations remain owner-authorized work.',
	},
]

// The tracker is a user-visible release artifact, not only a link index. The
// expected local-pass count includes this integrity check itself; all other
// expected counts are derived from the independent checks above.
const baseChecks = checks.slice()
const expectedLocalPassCount = baseChecks.filter(item => item.status === 'PASS_LOCAL').length + 1
const expectedOpenOwnerCount = baseChecks.filter(item => item.status === 'OPEN_OWNER').length
const expectedBlockedOwnerCount = baseChecks.filter(item => item.status === 'BLOCKED_OWNER').length
const expectedCompletionClaimAllowed = !(expectedOpenOwnerCount || expectedBlockedOwnerCount)
const trackerStatusSnapshot = [
	`Latest native-3D release-gate audit: <code>${releasePassCount} PASS</code> · <code>${releaseOpenCount} OPEN</code> · <code>${releaseBlockedCount} BLOCKED</code>`,
	`Requirement-level completion audit: <code>${expectedLocalPassCount} PASS_LOCAL</code> · <code>${expectedOpenOwnerCount} OPEN_OWNER</code> · <code>${expectedBlockedOwnerCount} BLOCKED_OWNER</code>; <code>completionClaimAllowed: ${expectedCompletionClaimAllowed}</code>.`,
	'Input-contract refresh:',
	'Assistant model note:',
	...acceptanceMotionFractions.map(value => `<code>${value}</code>`),
].every(fragment => trackerHtml.includes(fragment))
checks.push({
	id: 'visual-tracker-integrity',
	requirement: 'The visual tracker contains the current proof artifacts, resolves every local link, and visibly reports the current release state.',
	status: missingTrackerLinks.length === 0 && trackerStatusSnapshot ? 'PASS_LOCAL' : 'MISSING',
	evidence: evidence(trackerPath),
	detail: `localLinks=${localLinks.length}; missing=${missingTrackerLinks.length}; statusSnapshot=${trackerStatusSnapshot}; motionSnapshot=${acceptanceMotionFractions.join(',')}`,
})

const localPassCount = checks.filter(item => item.status === 'PASS_LOCAL').length
const openOwnerCount = checks.filter(item => item.status === 'OPEN_OWNER').length
const blockedOwnerCount = checks.filter(item => item.status === 'BLOCKED_OWNER').length
const livePassCount = checks.filter(item => item.status === 'PASS_LIVE').length
const ownerPassCount = checks.filter(item => item.status === 'PASS_OWNER').length
const report = {
	schemaVersion: 'betterpptx.native-3d-presenter-goal-audit.v1',
	status: openOwnerCount || blockedOwnerCount ? 'INCOMPLETE_OWNER_GATES' : 'COMPLETE',
	completionClaimAllowed: !(openOwnerCount || blockedOwnerCount),
	scope: 'native-3d-presenter-only',
	developmentMode: 'premium',
	assistantModelScope: 'GPT-5.6 Luna with High reasoning is Codex assistant context only; it does not alter Meshy geometry, Mixamo animation, PowerPoint serialization, or native-3D release readiness.',
	networkAttempted: false,
	deploymentAttempted: false,
	counts: { total: checks.length, localPass: localPassCount, livePass: livePassCount, ownerPass: ownerPassCount, openOwner: openOwnerCount, blockedOwner: blockedOwnerCount },
	checks,
	missingTrackerLinks,
	nextAction: 'Complete the seven owner worksheet decisions, configure the live Meshy account, then run the bounded target-profile deployment and one live canary exactly once.',
	retryPolicy: 'No automatic retry, no owner-approval inference, and no completion claim while any OPEN_OWNER or BLOCKED_OWNER check remains.',
}
writeJsonReport(outputPath, report)
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'COMPLETE') process.exitCode = 2
