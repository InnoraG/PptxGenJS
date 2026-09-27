#!/usr/bin/env node
// Native 3D owner handoff preflight. This is a local, no-network decision
// record: it proves that the local path is ready and names the owner actions
// required before a single live Meshy request or production deployment.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { meshyAvatarProviderStatus } from './assets/meshy-avatar-provider.mjs'
import { writeJsonReport } from './lib/atomic-report.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const demo = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar')
const releaseGates = path.join(demo, 'visual-artifacts', 'release-gates')
const outputPath = path.join(releaseGates, 'meshy-owner-preflight-20260718.json')
const ledgerPath = path.join(here, 'avatar', '3d-presenter-license-ledger.json')
const inputContractPath = path.join(releaseGates, 'meshy-input-contract-matrix-20260718', 'meshy-input-contract-matrix-20260718.json')
const modalSafetyPath = path.join(releaseGates, 'meshy-modal-profile-safety-20260718.json')
const revisionRollbackPath = path.join(releaseGates, 'meshy-modal-revision-rollback-20260718.json')
const acceptancePath = path.join(demo, 'visual-artifacts', 'live-meshy-acceptance-20260718', 'acceptance-report.json')
const dryRunPath = path.join(demo, 'visual-artifacts', 'live-meshy-canary', 'canary-report-dry_run_pass.json')
const approvalClosedPath = path.join(demo, 'visual-artifacts', 'live-meshy-canary', 'canary-report-open_owner_approval.json')
const ownerControlPath = path.join(releaseGates, 'meshy-owner-control-20260718.json')
const decisionWorksheetPath = path.join(releaseGates, 'meshy-owner-decision-worksheet-20260718.json')
const targetDeploymentPreflightPath = path.join(releaseGates, 'meshy-modal-target-deployment-preflight-20260718.json')

function readJson(filePath) {
	return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')) : null
}
function check(id, pass, detail) { return { id, status: pass ? 'PASS' : 'BLOCKED', detail } }

const ledger = readJson(ledgerPath)
const inputContract = readJson(inputContractPath)
const modalSafety = readJson(modalSafetyPath)
const revisionRollback = readJson(revisionRollbackPath)
const acceptance = readJson(acceptancePath)
const dryRun = readJson(dryRunPath)
const approvalClosed = readJson(approvalClosedPath)
const ownerControl = readJson(ownerControlPath)
const decisionWorksheet = readJson(decisionWorksheetPath)
const targetDeploymentPreflight = readJson(targetDeploymentPreflightPath)

function samePins(left, right) {
	return JSON.stringify(left || {}) === JSON.stringify(right || {})
}
const provider = meshyAvatarProviderStatus()

const localChecks = [
	check('native-3d-ledger-present', ledger?.schemaVersion === 'betterpptx.3d-presenter-license-ledger.v1' && ledger?.productScope.includes('native 3D'), 'The separate native-3D provenance ledger is present.'),
	check('official-input-contract-and-request-shape', inputContract?.status === 'PASS' && inputContract?.networkAttempted === false && inputContract?.implementationMatchesOfficialContract === true && inputContract?.requestShape?.pass === true, 'The 1–4 image matrix and documented Meshy request body pass without network.'),
	check('private-profile-routing-safety', modalSafety?.status === 'PASS_LOCAL_CONTRACT' && modalSafety?.liveDeploymentAttempted === false && modalSafety?.checks?.twoProfileRoundRobin === true && modalSafety?.checks?.healthyEndpointFailover === true, 'The offline betterpptx/betterxavatar routing and failover contract passes.'),
	check('immutable-revision-and-rollback-contract', revisionRollback?.status === 'PASS_LOCAL_CONTRACT' && revisionRollback?.networkAttempted === false && revisionRollback?.checks?.healthGatedRollback === true && revisionRollback?.checks?.revisionRestore === true && revisionRollback?.checks?.unknownRevisionFailsClosed === true, 'The local digest-pinned revision state machine passes.'),
	check('no-network-canary-dry-run', dryRun?.status === 'DRY_RUN_PASS' && dryRun?.networkAttempted === false && dryRun?.contract?.minImages === 1 && dryRun?.contract?.maxImages === 4, 'The bounded canary accepts the documented contract without provider work.'),
	check('live-canary-fails-closed-before-approval', approvalClosed?.status === 'OPEN_OWNER_APPROVAL' && approvalClosed?.networkAttempted === false, 'The live path refuses before network when owner approval is absent.'),
	check('native-3d-acceptance-fixture', acceptance?.status === 'PASS' && acceptance?.networkAttempted === false && acceptance?.artifacts?.pptx?.repairVerifierPassed === true && acceptance?.artifacts?.motion?.slide1?.pass === true && acceptance?.artifacts?.motion?.slide2?.pass === true, 'The local Meshy-shaped GLB → PPTX → repair/export/motion handoff passes.'),
	check('mission-control-meshy-secret-control-contract', ownerControl?.status === 'PASS_LOCAL_CONTRACT' && ownerControl?.networkAttempted === false && ownerControl?.secret?.rawValueExposed === false && ownerControl?.secret?.actions?.reveal === true && ownerControl?.secret?.actions?.update === true && ownerControl?.secret?.actions?.rotate === true && ownerControl?.secret?.actions?.test === true && Array.isArray(ownerControl?.checks) && ownerControl.checks.every(item => item.status === 'PASS'), 'The Meshy key has a private redacted inventory and explicit owner update/rotate/test path; no production secret is claimed.'),
	check('owner-decision-worksheet-contract', ['OWNER_DECISIONS_OPEN', 'OWNER_DECISIONS_CLEARED'].includes(decisionWorksheet?.status) && decisionWorksheet?.networkAttempted === false && decisionWorksheet?.checks?.worksheetSchema === true && decisionWorksheet?.checks?.requiredDecisionIds === true && decisionWorksheet?.checks?.noSensitiveFields === true, 'The seven owner decisions have one machine-checkable, fail-closed worksheet; OPEN remains the safe default and no credentials or images are stored.'),
	check('requested-profile-pinned-deployment-preflight', targetDeploymentPreflight?.status === 'READY_FOR_OWNER_DEPLOYMENT' && targetDeploymentPreflight?.checks?.upstreamRefsPinned === true && targetDeploymentPreflight?.checks?.hfModelRevisionsPinned === true && targetDeploymentPreflight?.checks?.revisionOverridesFailClosed === true && targetDeploymentPreflight?.checks?.embeddedPayloadDigestComplete === true && targetDeploymentPreflight?.checks?.noDeploymentAttempted === true, 'The requested-profile deployment plan carries pinned code/model revisions, a complete embedded-payload digest, and refuses floating overrides before any deployment.'),
	check('license-ledger-pinned-runtime-alignment', ledger?.runtimePins?.status === 'recorded-not-cleared' && ledger?.runtimePins?.workerSourceDigest === targetDeploymentPreflight?.sourceDigest && samePins(ledger?.runtimePins?.git, targetDeploymentPreflight?.plans?.[0]?.upstreamRefs) && samePins(ledger?.runtimePins?.huggingFace, targetDeploymentPreflight?.plans?.[0]?.hfModelRevisions), 'The owner ledger records the exact worker source, upstream code refs, and model snapshot refs used by the bounded deployment plan; legal/commercial clearance remains explicit.'),
]

const allLedgerCleared = Array.isArray(ledger?.entries) && ledger.entries.length > 0 && ledger.entries.every(entry => entry.reviewStatus === 'cleared')
const ownerActions = [
	{ id: 'mesh-account-and-terms', status: provider.configured ? 'PASS' : 'OPEN_OWNER_ACTION', action: 'Configure the owner-controlled Meshy account, record the account plan/terms, and keep the credential in the private secret store.' },
	{ id: 'image-consent-and-processing-scope', status: 'OPEN_OWNER_ACTION', action: 'Approve the supplied person images for external Meshy processing, likeness generation, tenant scope, retention/deletion, and no-training policy.' },
	{ id: 'mixamo-distribution-rights', status: 'OPEN_OWNER_ACTION', action: 'Attach the Mixamo/Adobe distribution decision for the frozen 65-joint, 18-clip animation library.' },
	{ id: 'joe-louise-fallback-rights', status: 'OPEN_OWNER_ACTION', action: 'Approve the exact Joe/Louise GLB and poster hashes for fallback distribution.' },
	{ id: 'owner-approved-input-set', status: 'OPEN_OWNER_ACTION', action: 'Provide 1–4 new owner-approved full-body JPG/JPEG/PNG images of the same subject from different angles; do not reuse restricted research-only inputs.' },
	{ id: 'one-paid-live-canary', status: 'OPEN_OWNER_ACTION', action: 'Set the three explicit canary confirmations and authorize exactly one bounded paid Meshy request.' },
	{ id: 'live-profile-revisions-and-rollback', status: 'OPEN_OWNER_ACTION', action: 'Deploy one immutable revision per private profile, record real revision/image digests, run the bounded canary, and prove rollback.' },
]

const ownerBlocks = ownerActions.filter(item => item.status !== 'PASS').map(item => item.id)
const localReady = localChecks.every(item => item.status === 'PASS')
const report = {
	schemaVersion: 'betterpptx.native-3d-meshy-owner-preflight.v1',
	status: localReady ? 'READY_FOR_OWNER_ACTION' : 'LOCAL_PREFLIGHT_INCOMPLETE',
	scope: 'native-3d-presenter-only',
	developmentMode: 'premium',
	networkAttempted: false,
	localReady,
	localChecks,
	ownerActions,
	ownerBlocks,
	ledger: { present: Boolean(ledger), allEntriesCleared: allLedgerCleared, entryCount: Array.isArray(ledger?.entries) ? ledger.entries.length : 0 },
	decisionWorksheet: { present: Boolean(decisionWorksheet), status: decisionWorksheet?.status || 'MISSING', openDecisionCount: Array.isArray(decisionWorksheet?.openDecisionIds) ? decisionWorksheet.openDecisionIds.length : null },
	provider: { configured: provider.configured, accounts: provider.accounts, model: provider.model },
	approvedCanaryContract: { minImages: 1, maxImages: 4, formats: ['image/png', 'image/jpeg'], requiredEnvironment: ['BETTERPPTX_MESHY_LIVE_CANARY_APPROVED=1', 'BETTERPPTX_MESHY_LIVE_CANARY_SCOPE=OWNER_APPROVED_MESHY_API', 'BETTERPPTX_MESHY_LIVE_CANARY_CONFIRM=GENERATE_ONE_PAID_REQUEST'] },
	nextAction: 'Complete the owner actions, configure the Meshy key through the private Mission Control path, then run the bounded live canary once and hand its derived hybrid GLB to the same one-shot acceptance command with --live.',
	retryPolicy: 'No automatic retry. This preflight is local-only; live submission remains one owner-authorized attempt per explicit input hash and confirmation token.',
}
writeJsonReport(outputPath, report)
console.log(JSON.stringify(report, null, 2))
if (!localReady) process.exitCode = 2
