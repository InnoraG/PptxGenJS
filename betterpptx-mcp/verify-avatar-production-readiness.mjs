#!/usr/bin/env node
// Evidence aggregator for the private talking-head lane. It intentionally
// reports production blockers instead of treating a local canary as launch
// approval. No URLs, tokens, paths, or provider internals are emitted.
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('betterpptx-mcp/outputs')
const planPath = path.resolve('plans/betterpptx-liveportrait-musetalk-3d-presenter-production-goal-2026-07-18.md')

async function readJson(name) {
	try { return JSON.parse(await fs.readFile(path.join(root, name), 'utf8')) } catch { return null }
}
async function readExternalJson(filePath) {
	try { return JSON.parse(await fs.readFile(filePath, 'utf8')) } catch { return null }
}

const [workerA, workerB, mcp, serving, rotation, jobs, deployed, license, provenance, presenter, durableDispatch, ownerControls, leaseRecovery, playback, retention, billing, workerState, artifacts, licenseGate, rotationPreflight, rotationExecution, sharedStoreGate, distributed, workerIdempotency, identityContinuity, providerBilling, alphaOnly, releaseCorpus, meshy3dReleaseGate, blackboxAdversarial, blackboxFixtures] = await Promise.all([
	readJson('private-avatar-worker-canary-telcomgapp.json'),
	readJson('private-avatar-worker-canary-fluxworkerai.json'),
	readJson('private-avatar-mcp-canary-report.json'),
	readJson('avatar-serving-image-contract-report.json'),
	readJson('avatar-rotation-report.json'),
	readJson('avatar-job-durability-report.json'),
	readJson('avatar-deployed-revision-report.json'),
	readJson('avatar-license-ledger-report.json'),
	readJson('avatar-worker-provenance-pins-report.json'),
	readJson('presenter-contract-report.json'),
	readJson('avatar-durable-dispatch-report.json'),
	readJson('owner-control-evidence-report.json'),
	readJson('avatar-durable-operation-lease-recovery-report.json'),
	readJson('avatar-pptx-playback-contract-report.json'),
	readJson('avatar-job-retention-report.json'),
	readJson('avatar-billing-exactly-once-report.json'),
	readJson('avatar-worker-state-report.json'),
	readJson('avatar-artifact-lifecycle-report.json'),
	readJson('avatar-license-gate-report.json'),
	readJson('avatar-rotation-preflight-report.json'),
	readJson('avatar-rotation-execution-report.json'),
	readJson('avatar-shared-store-gate-report.json'),
	readJson('avatar-distributed-production-evidence-report.json'),
	readJson('avatar-worker-idempotency-report.json'),
	readJson('avatar-identity-continuity-report.json'),
	readJson('avatar-provider-billing-reconciliation-report.json'),
	readJson('presenter-alpha-only-identity-preservation-report.json'),
	readJson('presenter-release-corpus-report.json'),
	readExternalJson(path.resolve('research-demos/2026-07-18-meshy-avatar/visual-artifacts/release-gates/3d-presenter-release-gate.json')),
	readJson('g1-blackbox-adversarial-report.json'),
	readJson('g1-blackbox-fixtures-report.json'),
])
const plan = await fs.readFile(planPath, 'utf8').catch(() => '')
const identityPacketReadiness = await readJson('avatar-identity-review-readiness-report.json')
const quotaDeployed = await readJson('avatar-worker-quota-deployed-revision-report.json')
const checks = [
	{ id: 'worker-account-a', status: workerA?.status === 'research-live-pass' ? 'PASS' : 'OPEN' },
	{ id: 'worker-account-b', status: workerB?.status === 'research-live-pass' ? 'PASS' : 'OPEN' },
	{ id: 'mcp-pptx-com-canary', status: mcp?.status === 'research-live-pass' && mcp?.powerPoint?.status === 'PASS' ? 'PASS' : 'OPEN' },
	{ id: 'provider-billing-reconciliation', status: providerBilling?.status === 'PARTIAL' && providerBilling?.checks?.modalBillingExportObserved === true ? 'OPEN' : 'BLOCKED' },
	{ id: 'lpmt-talking-head-identity-quality', status: ['READY_FOR_OWNER_REVIEW', 'READY_FOR_INDEPENDENT_REVIEW'].includes(identityPacketReadiness?.status) ? 'OPEN' : 'BLOCKED' },
	{ id: 'rotation-idempotency-failover', status: rotation?.status === 'PASS' && rotation?.checks?.passed >= 6 ? 'PASS' : 'OPEN' },
	{ id: 'avatar-job-metadata-rehydration', status: jobs?.status === 'PASS' && jobs?.restart === true && jobs?.ownership === true ? 'PASS' : 'OPEN' },
	{ id: 'durable-avatar-dispatch', status: durableDispatch?.status === 'PASS' ? 'PASS' : 'OPEN' },
	{ id: 'durable-operation-lease-recovery', status: leaseRecovery?.status === 'PASS' ? 'PASS' : 'OPEN' },
	{ id: 'owner-secret-control-plane', status: ownerControls?.status === 'research-owner-control-pass' && ownerControls?.rawSecretsExposed === false ? 'PASS' : 'OPEN' },
	{ id: 'serving-template', status: serving?.status?.startsWith('template-pass') ? 'PASS' : 'OPEN' },
	{ id: 'runtime-representation-plan', status: presenter?.status === 'PASS' && presenter?.runtimeDirector?.laneCorpus?.length === 6 ? 'PASS' : 'OPEN' },
	{ id: 'runtime-lowering-fail-closed', status: presenter?.status === 'PASS' && presenter?.checks?.includes('runtime-lowering') && presenter?.checks?.includes('runtime-fail-closed') ? 'PASS' : 'OPEN' },
	{ id: 'pptx-native-playback-contract', status: playback?.status === 'PASS' ? 'PASS' : 'OPEN' },
	{ id: 'avatar-job-retention-contract', status: retention?.status === 'PASS' ? 'PASS' : 'OPEN' },
	{ id: 'avatar-billing-exactly-once-contract', status: billing?.status === 'PASS' ? 'PASS' : 'OPEN' },
	{ id: 'rotating-worker-health-state', status: workerState?.status === 'PASS' && workerState?.checks?.secretFreeState === true ? 'PASS' : 'OPEN' },
	{ id: 'tenant-scoped-avatar-artifacts', status: artifacts?.status === 'PASS' && artifacts?.checks?.tenantIsolation === true && artifacts?.checks?.materializedBytesVerified === true ? 'PASS' : 'OPEN' },
	{ id: 'public-license-gate-fail-closed', status: licenseGate?.status === 'PASS' && licenseGate?.legalClearanceClaimed === false ? 'PASS' : 'OPEN' },
	{ id: 'paired-rotation-preflight', status: rotationPreflight?.status === 'PASS' && rotationPreflight?.mutationsPerformed === false ? 'PASS' : 'OPEN' },
	{ id: 'shared-artifact-store-fail-closed', status: sharedStoreGate?.status === 'PASS' && sharedStoreGate?.localFallbackAllowedInProduction === false ? 'PASS' : 'OPEN' },
	{ id: 'distributed-store-production-evidence', status: distributed?.status === 'PASS' && distributed?.cleanupCompleted === true ? 'PASS' : 'BLOCKED' },
	{ id: 'deployed-serving-revision', status: deployed?.status === 'PASS' ? 'PASS' : 'BLOCKED' },
	{ id: 'avatar-quota-deployed-value', status: quotaDeployed?.status === 'PASS' && quotaDeployed?.quotaMode === 'unbounded-metered' && Number(quotaDeployed?.estimatedGpuSecondsPerRequest) === 120 && quotaDeployed?.activeRevision === deployed?.activeRevision ? 'PASS' : 'BLOCKED' },
	{ id: 'native3d-owner-clearance-runtime-gate', status: deployed?.status === 'PASS' && deployed?.configChecks?.some(item => item.id === 'BETTERPPTX_NATIVE3D_OWNER_CLEARANCE' && item.matches === true) ? 'PASS' : 'BLOCKED' },
	{ id: 'owner-credential-rotation', status: rotationExecution?.status === 'PASS' && rotationExecution?.checks?.oldModalRollbackSecretsRevoked === true && rotationExecution?.checks?.authenticatedWorkerHealth?.healthy === 2 ? 'PASS' : 'BLOCKED' },
	{ id: 'durable-jobs-artifacts-billing', status: distributed?.status === 'PASS' && billing?.status === 'PASS' && artifacts?.status === 'PASS' ? 'PASS' : 'BLOCKED' },
	{ id: 'worker-idempotency-cancellation', status: workerIdempotency?.status === 'PASS' ? 'PASS' : 'BLOCKED' },
	{ id: 'licensing-and-model-provenance', status: license?.status === 'PASS' && provenance?.status === 'PASS' ? 'PASS' : 'BLOCKED' },
	{ id: 'runtime-representation-director', status: presenter?.runtimeDirector?.status === 'PASS' && presenter?.runtimeDirector?.failClosedExplicitLane === true && presenter?.runtimeDirector?.validatedModes?.length === 6 ? 'PASS' : 'BLOCKED' },
	{ id: 'alpha-only-identity-preservation', status: alphaOnly?.status === 'PASS' && alphaOnly?.derived?.rgbUnchanged === true && alphaOnly?.derived?.identityRoiRgbUnchanged === true ? 'PASS' : 'BLOCKED' },
	{ id: 'presenter-release-corpus', status: releaseCorpus?.status === 'PASS' && Number.isInteger(releaseCorpus?.summary?.total) && releaseCorpus.summary.total > 0 && releaseCorpus.summary.passed === releaseCorpus.summary.total ? 'PASS' : 'BLOCKED' },
	{ id: 'native-meshy-mixamo-production-clearance', status: meshy3dReleaseGate?.status === 'PASS' ? 'PASS' : 'OPEN' },
	{ id: 'public-blackbox-no-leakage', status: blackboxAdversarial?.publicMode === true && blackboxAdversarial?.failures === 0 && blackboxFixtures?.publicMode === true && blackboxFixtures?.failures === 0 ? 'PASS' : 'OPEN' },
]
const blockers = checks.filter(check => check.status === 'BLOCKED').map(check => check.id)
const openGates = checks.filter(check => check.status === 'OPEN').map(check => check.id)
const report = {
	schemaVersion: 'betterpptx.avatar-production-readiness.v1',
	status: blockers.length ? 'research-pass-production-blocked' : openGates.length ? 'research-pass-open-gates' : 'production-evidence-complete',
	researchCanary: checks.filter(check => check.status === 'PASS').length >= 5,
	checks,
	blockers,
	openGates,
	summary: {
		pass: checks.filter(check => check.status === 'PASS').length,
		open: openGates.length,
		blocked: blockers.length,
		total: checks.length,
	},
	publicHandleCreated: false,
	customerImage: false,
	training: false,
}
await fs.writeFile(path.join(root, 'avatar-production-readiness-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (blockers.length) process.exitCode = 2
