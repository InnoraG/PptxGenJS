#!/usr/bin/env node
// Consolidated, mutation-free acceptance corpus for the PowerPoint-native
// presenter goal. It consumes existing redacted evidence and exercises the
// language/timing test suite; it does not call a paid provider or alter
// credentials, artifacts, or customer data.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = path.resolve('betterpptx-mcp/outputs')
const testRoot = path.resolve('betterpptx-mcp/test')
const paidCanaryScriptPath = path.resolve('betterpptx-mcp/deploy/run-isolated-avatar-billing-canary.ps1')

async function readJson(name) {
	return JSON.parse(await fs.readFile(path.join(root, name), 'utf8'))
}

const [workers, mcp, idempotency, liveIdempotency, lease, playback, mediaPlayback, presenter, ingestion, alpha, multiview, restoration, restorationPolicy, resaleSafe, reviewReadiness, reviewDecision, billingCoverage, ownerClosure] = await Promise.all([
	readJson('private-avatar-worker-canary-all.json'),
	readJson('private-avatar-mcp-canary-report.json'),
	readJson('avatar-worker-idempotency-provider-report.json'),
	readJson('avatar-worker-idempotency-live-evidence-report.json'),
	readJson('avatar-durable-operation-lease-recovery-report.json'),
	readJson('avatar-pptx-playback-contract-report.json'),
	readJson('presenter-media-playback-corpus-report.json'),
	readJson('presenter-contract-report.json'),
	readJson('presenter-ingestion-corpus-report.json'),
	readJson('presenter-alpha-only-identity-preservation-report.json'),
	readJson('mediapipe-consented-multiview-report.json'),
	readJson('avatar-restoration-selection-report.json'),
	readJson('restoration-core-only-policy-report.json'),
	readJson('avatar-resale-safe-pipeline-report.json'),
	readJson('avatar-identity-review-readiness-report.json'),
	readJson('avatar-identity-review-decision-report.json'),
	readJson('avatar-provider-billing-coverage-report.json'),
	JSON.parse(await fs.readFile(path.resolve('betterpptx-mcp/docs/release-safety/AVATAR-OWNER-CLOSURE-CHECKLIST-2026-07-19.json'), 'utf8')),
])

const languageRun = spawnSync(process.execPath, ['--test', path.join(testRoot, 'narration-animation.test.mjs')], { encoding: 'utf8' })
const languagePass = languageRun.status === 0 && /ℹ pass \d+/.test(languageRun.stdout || '')
const native3dRouteRun = spawnSync(process.execPath, ['--test', path.join(testRoot, 'native3d-production-route.test.mjs')], { encoding: 'utf8' })
const native3dRoutePass = native3dRouteRun.status === 0 && /ℹ pass \d+/.test(native3dRouteRun.stdout || '')
const meshyPolicyRun = spawnSync(process.execPath, [path.join(testRoot, 'meshy-provider-identity-policy.test.mjs')], { encoding: 'utf8' })
const meshyPolicyPass = meshyPolicyRun.status === 0 && /"status": "PASS"/.test(meshyPolicyRun.stdout || '')
const selfieInputRun = spawnSync(process.execPath, [path.resolve('betterpptx-mcp/verify-avatar-selfie-input-contract.mjs')], { encoding: 'utf8' })
const selfieInputPass = selfieInputRun.status === 0 && /"status": "PASS"/.test(selfieInputRun.stdout || '')
const paidCanaryScript = await fs.readFile(paidCanaryScriptPath, 'utf8')
const paidCanaryGuardPass = [
	paidCanaryScript.includes('[Parameter(Mandatory = $true)][string]$OwnerApprovalRef'),
	paidCanaryScript.includes('[Parameter(Mandatory = $true)][switch]$ConfirmPaidRequest'),
	paidCanaryScript.includes('if (-not $ConfirmPaidRequest)'),
	paidCanaryScript.includes('if ([string]::IsNullOrWhiteSpace($OwnerApprovalRef))'),
	paidCanaryScript.includes('if ($deployed)'),
	paidCanaryScript.includes('python -m modal app stop $appName -y'),
].every(Boolean)

const checks = [
	{ id: 'cold-worker-canary', status: workers.status === 'research-live-pass' && workers.accountCount === 2 && workers.results.every(result => result.status === 'PASS') },
	{ id: 'warm-cache-replay', status: idempotency.status === 'PASS' && idempotency.sameKey === true && idempotency.firstDigest === idempotency.secondDigest },
	{ id: 'retry-reclaim', status: lease.status === 'PASS' && lease.checks.retryTransition === true && lease.checks.retryReclaim === true },
	{ id: 'timeout-cancellation-fencing', status: lease.status === 'PASS' && lease.checks.liveLeaseExclusion === true && lease.checks.staleLeaseFencing === true && liveIdempotency.cancelledTerminal === true },
	{ id: 'two-account-routing', status: workers.accountCount === 2 && liveIdempotency.crossAccountReplay === true && liveIdempotency.cleanupCompleted === true },
	{ id: 'language-and-timing', status: languagePass },
	{ id: 'native3d-production-route-policy', status: native3dRoutePass },
	{ id: 'powerpoint-playback', status: playback.status === 'PASS' && playback.checks.mp4ContainerAndTracks === true && playback.checks.powerPointMediaRelationships === true && playback.checks.advanceCoversNarration === true && mcp.powerPoint.status === 'PASS' },
	{ id: 'media-playback-corpus', status: mediaPlayback.status === 'PASS' && mediaPlayback.checks.talkingHeadEmbeddedMp4 === true && mediaPlayback.checks.native3dPowerPointAndMotion === true && mediaPlayback.native3d?.identities?.length === 2 },
	{ id: 'six-presenter-lanes', status: presenter.status === 'PASS' && presenter.runtimeDirector?.laneCorpus?.length === 6 && presenter.runtimeDirector.validatedModes?.length === 6 },
	{ id: 'tolerant-ingestion', status: ingestion.status === 'PASS' && ingestion.caseCount === 10 && ingestion.interpretation.softQualitySignalsDoNotBlock === true },
	{ id: 'alpha-only-identity-preservation', status: alpha.status === 'PASS' && alpha.derived.rgbUnchanged === true && alpha.derived.identityRoiRgbUnchanged === true && alpha.source.unchangedAfterProcessing === true },
	{ id: 'consented-angle-probe', status: multiview.source.unchangedAfterProcessing === true && multiview.summary.passedViews === 9 && multiview.summary.totalViews === 12 },
	{ id: 'restoration-fail-closed', status: restoration.status === 'OPEN_NO_RESTORATION_DEPLOYED' && restoration.deployment.enabled === false && restoration.deployment.frozenWorkerUnchanged === true },
	{ id: 'realesrgan-core-gfpgan-disabled', status: restorationPolicy.status === 'PASS_POLICY_ONLY' && restorationPolicy.candidate === 'realesrgan-core' },
	{ id: 'meshy-relighting-disabled-request', status: meshyPolicyPass },
	{ id: 'per-generation-selfie-input', status: selfieInputPass },
	{ id: 'resale-safe-baseline', status: resaleSafe.status === 'PASS' && resaleSafe.baseline === 'frozen-talking-head-plus-gated-meshy-mixamo-native-3d' },
	{ id: 'review-decision-fail-closed', status: ['OPEN_OWNER_REVIEW_FILE_REQUIRED', 'OPEN_REVIEWER_FILE_REQUIRED'].includes(reviewDecision.status) && reviewDecision.failClosed === true && reviewDecision.reviewerDecision === 'OPEN' },
	{ id: 'billing-coverage-import-fail-closed', status: billingCoverage.status === 'OPEN_OWNER_EXPORT_REQUIRED' && billingCoverage.failClosed === true && billingCoverage.checks?.fullWindowCoverageProven === false },
	{ id: 'paid-billing-canary-owner-confirmation', status: paidCanaryGuardPass },
	{ id: 'owner-review-packet-ready', status: ['READY_FOR_OWNER_REVIEW', 'READY_FOR_INDEPENDENT_REVIEW'].includes(reviewReadiness.status) && reviewReadiness.checks.length >= 9 && reviewReadiness.reviewerDecision === 'OPEN' },
	{ id: 'owner-closure-checklist', status: ownerClosure.status === 'OWNER_ACTIONS_REQUIRED' && ownerClosure.publicEnablementAllowed === false && ownerClosure.closures.length === 4 },
]

assert.equal(checks.filter(check => !check.status).length, 0, checks.filter(check => !check.status).map(check => check.id).join(', '))
const report = {
	schemaVersion: 'betterpptx.presenter-release-corpus.v1',
	status: 'PASS',
	scope: 'private-research / mutation-free / no paid provider call',
	checks,
	summary: { passed: checks.filter(check => check.status).length, total: checks.length },
	languageTest: { status: languagePass ? 'PASS' : 'FAIL', exitCode: languageRun.status },
	native3dRouteTest: { status: native3dRoutePass ? 'PASS' : 'FAIL', exitCode: native3dRouteRun.status },
	meshyPolicyTest: { status: meshyPolicyPass ? 'PASS' : 'FAIL', exitCode: meshyPolicyRun.status },
	interpretation: 'This corpus proves local control-plane, runtime-lowering, ingestion, timing, PowerPoint package, and restoration fail-closed contracts. It does not close provider billing reconciliation, the owner one-time LP/MT visual decision, or the required Meshy → Mixamo production authoring gate.',
}
await fs.writeFile(path.join(root, 'presenter-release-corpus-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
