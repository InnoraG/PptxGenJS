import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'

const file = path.resolve('betterpptx-mcp', 'deploy', 'cloud-run.env.example')
const text = fs.readFileSync(file, 'utf8')
const deployScript = fs.readFileSync(path.resolve('deploy', 'gcp', 'deploy-mcp-crypto-production.ps1'), 'utf8')
const gcloudIgnore = fs.readFileSync(path.resolve('.gcloudignore'), 'utf8')
const dockerfile = fs.readFileSync(path.resolve('deploy', 'docker', 'Dockerfile.mcp'), 'utf8')

function parseEnv(source) {
	const out = {}
	for (const line of source.split(/\r?\n/)) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith('#')) continue
		const index = trimmed.indexOf('=')
		if (index <= 0) continue
		out[trimmed.slice(0, index)] = trimmed.slice(index + 1)
	}
	return out
}

function expect(condition, message, detail = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = detail
		throw error
	}
}

function runPowerShell(args) {
	return spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', ...args], {
		cwd: process.cwd(),
		encoding: 'utf8',
		timeout: 30000,
		windowsHide: true,
	})
}

const env = parseEnv(text)

expect(env.BETTERPPTX_BILLING_PROVIDER === 'crypto_credits', 'Cloud Run sample must select the x402 crypto settlement provider.', env)
expect(env.BETTERPPTX_BILLING_MODEL === 'pay_per_job', 'Cloud Run sample must select accountless pay-per-job billing.', env)
expect(env.BETTERPPTX_BILLING_ENFORCE === '1', 'Cloud Run sample must enforce billing.', env)
expect(env.BETTERPPTX_MONETIZED_MCP_ENABLED === '1', 'Cloud Run sample must enable MonetizedMCP compatibility.', env)
expect(!env.BETTERPPTX_BILLING_LEDGER_STORE, 'Accountless pay-per-job Cloud Run sample must not configure a reusable billing ledger.', env)
expect(!env.BETTERPPTX_CRYPTO_ORDER_STORE, 'Accountless pay-per-job Cloud Run sample must not configure the legacy credit-order store.', env)
expect(env.BETTERPPTX_X402_STORE === 'firestore', 'Cloud Run sample must use Firestore x402 quote store.', env)
expect(env.BETTERPPTX_X402_RELAYER_LEASE_STORE === 'firestore', 'Cloud Run sample must use Firestore relayer leases.', env)
expect(env.BETTERPPTX_INSTALL_USAGE_STORE === 'firestore', 'Cloud Run sample must use Firestore install usage store.', env)
expect(env.BETTERPPTX_ENTITLEMENT_STORE === 'firestore', 'Cloud Run sample must use Firestore entitlement store.', env)
expect(env.BETTERPPTX_FIRESTORE_ENTITLEMENTS_COLLECTION === 'betterpptx_billing_entitlements', 'Cloud Run sample must name the Firestore entitlement collection explicitly.', env)
expect(env.BETTERPPTX_REQUIRE_SHARED_STORES === '1', 'Cloud Run sample must require shared payment stores.', env)
expect(text.includes('does not configure a reusable') && text.includes('PAY_PER_JOB_ROUTE_ONLY'), 'Cloud Run sample must explain why reusable-credit stores are intentionally absent in pay-per-job mode.', {})
expect(!/BETTERPPTX_BILLING_LEDGER_STORE\s*=\s*["']firestore["']/.test(deployScript), 'Production deploy script must not wire a reusable billing ledger in pay-per-job mode.', {})
expect(!/BETTERPPTX_CRYPTO_ORDER_STORE\s*=\s*["']firestore["']/.test(deployScript), 'Production deploy script must not wire the legacy credit-order store in pay-per-job mode.', {})
expect(env.BETTERPPTX_X402_SETTLEMENT_MODE === 'self_settle', 'Cloud Run sample must default to self-settled x402.', env)
expect(env.BETTERPPTX_PAYRAM_ENABLED === '0', 'PayRam card rail must be disabled by default.', env)
expect(env.BETTERPPTX_REQUIRE_CARD_ONRAMP === '0', 'Card onramp must not be required by default.', env)
expect(env.BETTERPPTX_PAYRAM_EXACT_QUOTE_ENABLED === '0', 'Exact PayRam quotes must stay disabled until proven.', env)
expect(env.BETTERPPTX_PAYRAM_PARTIAL_CREDIT_POLICY === 'none', 'Partial PayRam crediting must fail closed by default.', env)
expect(env.BETTERPPTX_RAW_SEND_RAIL === 'xpub', 'Raw-send rail must default to transitional xpub private-canary until forwarder proof.', env)
expect(Number(env.BETTERPPTX_MCP_REQUEST_CONCURRENCY) >= 8, 'Cloud Run request concurrency target must allow lightweight payment/control concurrency.', env)
expect(env.BETTERPPTX_MAX_CONCURRENCY === '1', 'Heavy deck concurrency must remain isolated at one per instance.', env)
const heavyInflight = Number(env.BETTERPPTX_MAX_CONCURRENCY) + Number(env.BETTERPPTX_MAX_QUEUE)
const requestConcurrency = Number(env.BETTERPPTX_MCP_REQUEST_CONCURRENCY)
expect(
	Number.isFinite(heavyInflight) && Number.isFinite(requestConcurrency) && heavyInflight < requestConcurrency,
	'Heavy admission (MAX_CONCURRENCY + MAX_QUEUE) must stay below request concurrency so a heavy burst cannot starve payment/control (section 31.5).',
	env,
)
expect(env.BETTERPPTX_EDIT_STATE_MODE === 'process-local', 'Current sample must be explicitly process-local for private canary only.', env)
expect(env.BETTERPPTX_EDIT_STATE_SINGLE_INSTANCE_ACCEPTED === '1', 'Private canary process-local acceptance must be explicit.', env)
expect(text.includes('Public production /') && text.includes('distributed runtime block'), 'Cloud Run sample must not imply process-local public production readiness.', {})
for (const requiredComment of [
	'BETTERPPTX_HTTP_STATELESS_MCP=1',
	'BETTERPPTX_DURABLE_OPERATION_STORE=firestore',
	'BETTERPPTX_OPERATION_DISPATCHER=cloud-tasks',
	'BETTERPPTX_OPERATION_WORKER_TOKEN=secret-manager:betterpptx-operation-worker-token',
	'BETTERPPTX_REQUIRE_DISTRIBUTED_OPERATION_DISPATCH=1',
	'BETTERPPTX_REQUIRE_DURABLE_OPERATION_IDEMPOTENCY=1',
	'BETTERPPTX_DURABLE_DECK_STATE_STORE=firestore-gcs',
	'BETTERPPTX_DECK_SNAPSHOT_STORE=gcs',
	'BETTERPPTX_LOCKED_ASSET_STORE=gcs',
	'BETTERPPTX_DISTRIBUTED_RUNTIME_VERIFIED=0',
]) {
	expect(text.includes(`# ${requiredComment}`), `Cloud Run sample must document disabled public-production setting: ${requiredComment}`, {})
}
for (const requiredComment of [
	'BETTERPPTX_PAYRAM_BASE_URL=secret-manager:betterpptx-payram-base-url',
	'BETTERPPTX_PAYRAM_API_KEY=secret-manager:betterpptx-payram-api-key',
	'BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN=secret-manager:betterpptx-payram-webhook-custom-token',
	'BETTERPPTX_PAYRAM_PROJECT_ID=secret-manager:betterpptx-payram-project-id',
]) {
	expect(text.includes(`# ${requiredComment}`), `Cloud Run sample must document launch-gated PayRam setting: ${requiredComment}`, {})
}
for (const requiredComment of [
	'BETTERPPTX_RAW_SEND_RAIL=forwarder',
	'BETTERPPTX_FORWARDER_FACTORY_ADDRESS=secret-manager:betterpptx-forwarder-factory-address',
	'BETTERPPTX_FORWARDER_CODEHASH=secret-manager:betterpptx-forwarder-codehash',
	'BETTERPPTX_SETTLEMENT_COLLECTOR_EVM_ADDRESS=secret-manager:betterpptx-settlement-collector-evm-address',
	'BETTERPPTX_FORWARDER_SALT_SECRET=secret-manager:betterpptx-forwarder-salt-secret',
	'BETTERPPTX_FORWARDER_SWEEPER_KEY=secret-manager:betterpptx-forwarder-sweeper-key',
	'BETTERPPTX_FORWARDER_SWEEP_MAX_ORDERS=500',
	'BETTERPPTX_FORWARDER_SWEEP_HOT_WINDOW_DAYS=30',
]) {
	expect(text.includes(`# ${requiredComment}`), `Cloud Run sample must document launch-gated forwarder setting: ${requiredComment}`, {})
}
for (const requiredComment of [
	'BETTERPPTX_PAYRAM_OCI_HOST_VERIFIED_AT=2026-06-17T00:00:00.000Z',
	'BETTERPPTX_PAYRAM_OCI_HOST_EVIDENCE_FILE=/workspace/outputs/payram-oci-host-proof/latest.json',
	'BETTERPPTX_PAYRAM_DNS_HTTPS_VERIFIED_AT=2026-06-17T00:00:00.000Z',
	'BETTERPPTX_PAYRAM_DNS_HTTPS_EVIDENCE_FILE=/workspace/outputs/payram-dns-https-proof/latest.json',
	'BETTERPPTX_PAYRAM_BACKUP_RESTORE_VERIFIED_AT=2026-06-17T00:00:00.000Z',
	'BETTERPPTX_PAYRAM_BACKUP_RESTORE_EVIDENCE_FILE=/workspace/outputs/payram-backup-restore-proof/latest.json',
	'BETTERPPTX_PAYRAM_OCI_ALARMS_VERIFIED_AT=2026-06-17T00:00:00.000Z',
	'BETTERPPTX_PAYRAM_OCI_ALARMS_EVIDENCE_FILE=/workspace/outputs/payram-oci-alarms-proof/latest.json',
	'BETTERPPTX_PAYRAM_PHASE0_VERIFIED_AT=2026-06-17T00:00:00.000Z',
	'BETTERPPTX_PAYRAM_PHASE0_EVIDENCE_FILE=/workspace/outputs/payram-phase0-proof/latest.json',
	'BETTERPPTX_FORWARDER_CUSTODY_VERIFIED_AT=2026-06-17T00:00:00.000Z',
	'BETTERPPTX_FORWARDER_CUSTODY_EVIDENCE_FILE=/workspace/outputs/forwarder-custody/latest-manifest.json',
	'BETTERPPTX_FORWARDER_PROOF_VERIFIED_AT=2026-06-17T00:00:00.000Z',
	'BETTERPPTX_FORWARDER_PROOF_EVIDENCE_FILE=/workspace/outputs/forwarder-proof/latest.json',
	'BETTERPPTX_FORWARDER_REVIEW_VERIFIED_AT=2026-06-17T00:00:00.000Z',
	'BETTERPPTX_FORWARDER_REVIEW_EVIDENCE_FILE=/workspace/outputs/forwarder-review/latest.json',
]) {
	expect(text.includes(`# ${requiredComment}`), `Cloud Run sample must document Mission Control proof-evidence setting: ${requiredComment}`, {})
}
for (const proofParam of [
	'[string]$PayRamOciHostVerifiedAt = ""',
	'[string]$PayRamOciHostEvidenceFile = ""',
	'[string]$PayRamDnsHttpsVerifiedAt = ""',
	'[string]$PayRamDnsHttpsEvidenceFile = ""',
	'[string]$PayRamBackupRestoreVerifiedAt = ""',
	'[string]$PayRamBackupRestoreEvidenceFile = ""',
	'[string]$PayRamOciAlarmsVerifiedAt = ""',
	'[string]$PayRamOciAlarmsEvidenceFile = ""',
	'[string]$PayRamPhase0VerifiedAt = ""',
	'[string]$PayRamPhase0EvidenceFile = ""',
	'[string]$ForwarderCustodyVerifiedAt = ""',
	'[string]$ForwarderCustodyEvidenceFile = ""',
	'[string]$ForwarderProofVerifiedAt = ""',
	'[string]$ForwarderProofEvidenceFile = ""',
	'[string]$ForwarderReviewVerifiedAt = ""',
	'[string]$ForwarderReviewEvidenceFile = ""',
]) {
	expect(deployScript.includes(proofParam), `Deploy script must expose owner-controlled Mission Control proof parameter: ${proofParam}`, {})
}
expect(deployScript.includes('function Assert-ExactIsoTimestamp'), 'Deploy script must validate owner proof stamps as exact ISO timestamps before deployment.', {})
expect(deployScript.includes('function Add-OptionalEnvVar'), 'Deploy script must have a safe helper for optional proof env vars.', {})
expect(deployScript.includes('function Add-MissionControlProofEnvVars'), 'Deploy script must centralize Mission Control proof env wiring.', {})
expect(deployScript.includes('function Read-LocalEvidenceJson'), 'Deploy script must read evidence files locally before they can unlock public payment rails.', {})
expect(deployScript.includes('function Assert-PayRamOciHostEvidenceFile'), 'Deploy script must validate full PayRam OCI host evidence files before public card enablement.', {})
expect(deployScript.includes('function Assert-PayRamDnsHttpsEvidenceFile'), 'Deploy script must validate PayRam DNS/HTTPS evidence files before public card enablement.', {})
expect(deployScript.includes('function Assert-PayRamBackupRestoreEvidenceFile'), 'Deploy script must validate PayRam backup/restore evidence files before public card enablement.', {})
expect(deployScript.includes('function Assert-PayRamOciAlarmsEvidenceFile'), 'Deploy script must validate PayRam OCI alarm evidence files before public card enablement.', {})
expect(deployScript.includes('function Assert-PayRamPhase0EvidenceFile'), 'Deploy script must validate PayRam Phase 0 evidence files before public card enablement.', {})
expect(deployScript.includes('function Assert-ForwarderCustodyEvidenceFile'), 'Deploy script must validate forwarder custody evidence files before public raw-send enablement.', {})
expect(deployScript.includes('function Assert-ForwarderProofEvidenceFile'), 'Deploy script must validate forwarder external proof evidence files before public raw-send enablement.', {})
expect(deployScript.includes('function Assert-ForwarderReviewEvidenceFile'), 'Deploy script must validate forwarder owner-review evidence files before public raw-send enablement.', {})
expect(deployScript.includes('function Assert-ForwarderCollectorTreasurySeparation'), 'Deploy script must verify forwarder collector/treasury separation before public raw-send enablement.', {})
expect(deployScript.includes('betterpptx-settlement-collector-evm-address to differ from betterpptx-treasury-evm-address'), 'Deploy script must fail closed if the public settlement collector equals the final treasury.', {})
expect(deployScript.includes('Assert-ForwarderCollectorTreasurySeparation'), 'Deploy script must invoke the collector/treasury separation guard after required forwarder secrets exist.', {})
expect(deployScript.includes('[switch]$ValidateConfigOnly'), 'Deploy script must expose a no-deploy validation mode for proof env safety.', {})
expect(deployScript.includes('[switch]$MarkDistributedRuntimeVerified'), 'Deploy script must expose an explicit owner switch before marking distributed runtime proof complete.', {})
expect(deployScript.includes('[string]$ConfirmDistributedRuntimeVerified = ""'), 'Deploy script must require a distributed-runtime proof confirmation phrase parameter.', {})
expect(deployScript.includes('[switch]$EnablePayRamCardRail'), 'Deploy script must expose an explicit owner switch before enabling the PayRam card rail.', {})
expect(deployScript.includes('[string]$ConfirmPayRamPublicEnable = ""'), 'Deploy script must require a PayRam public-enable confirmation phrase parameter.', {})
expect(deployScript.includes('[string]$ConfirmForwarderRawSendPublicEnable = ""'), 'Deploy script must require a forwarder raw-send confirmation phrase parameter.', {})
expect(deployScript.includes('DEPLOY CONFIG VALIDATION: PASS'), 'Deploy script validation mode must emit a clear pass line.', {})
expect(deployScript.includes('Add-MissionControlProofEnvVars $proofEnvValidation'), 'Deploy script must validate proof env vars before any gcloud call.', {})
expect(deployScript.includes('Assert-PublicEnableGuards'), 'Deploy script must fail closed before public payment rails are enabled.', {})
expect(deployScript.includes('Add-MissionControlProofEnvVars $envVars'), 'Deploy script must apply validated proof env vars to Cloud Run env vars.', {})
for (const proofEnv of [
	'BETTERPPTX_PAYRAM_OCI_HOST_VERIFIED_AT',
	'BETTERPPTX_PAYRAM_OCI_HOST_EVIDENCE_FILE',
	'BETTERPPTX_PAYRAM_DNS_HTTPS_VERIFIED_AT',
	'BETTERPPTX_PAYRAM_DNS_HTTPS_EVIDENCE_FILE',
	'BETTERPPTX_PAYRAM_BACKUP_RESTORE_VERIFIED_AT',
	'BETTERPPTX_PAYRAM_BACKUP_RESTORE_EVIDENCE_FILE',
	'BETTERPPTX_PAYRAM_OCI_ALARMS_VERIFIED_AT',
	'BETTERPPTX_PAYRAM_OCI_ALARMS_EVIDENCE_FILE',
	'BETTERPPTX_PAYRAM_PHASE0_VERIFIED_AT',
	'BETTERPPTX_PAYRAM_PHASE0_EVIDENCE_FILE',
	'BETTERPPTX_FORWARDER_CUSTODY_VERIFIED_AT',
	'BETTERPPTX_FORWARDER_CUSTODY_EVIDENCE_FILE',
	'BETTERPPTX_FORWARDER_PROOF_VERIFIED_AT',
	'BETTERPPTX_FORWARDER_PROOF_EVIDENCE_FILE',
	'BETTERPPTX_FORWARDER_REVIEW_VERIFIED_AT',
	'BETTERPPTX_FORWARDER_REVIEW_EVIDENCE_FILE',
]) {
	expect(deployScript.includes(`Add-OptionalEnvVar $Vars "${proofEnv}"`), `Deploy script must wire optional Mission Control proof env: ${proofEnv}`, {})
}
const deployScriptPath = path.resolve('deploy', 'gcp', 'deploy-mcp-crypto-production.ps1')
const evidenceTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-proof-evidence-'))
function writeEvidence(name, data) {
	const filePath = path.join(evidenceTempDir, name)
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
	return filePath
}

const validHostEvidenceFile = writeEvidence('valid-host.json', {
	kind: 'payram-oci-host-bootstrap',
	ok: true,
	hostBootstrapOk: true,
	checks: {
		http: true,
		ssh: true,
		sshSkipped: false,
	},
})
const httpOnlyHostEvidenceFile = writeEvidence('http-only-host.json', {
	kind: 'payram-oci-host-bootstrap',
	ok: true,
	hostBootstrapOk: false,
	checks: {
		http: true,
		ssh: false,
		sshSkipped: true,
	},
})
const validDnsHttpsEvidenceFile = writeEvidence('valid-dns-https.json', {
	version: 1,
	kind: 'payram-dns-https',
	ok: true,
	dryRun: false,
	hostNameHash: '1'.repeat(16),
	expectedIpHash: '2'.repeat(16),
	resolvedIpHash: '3'.repeat(16),
	resolvedIpCount: 1,
	checks: {
		dnsResolved: true,
		expectedIpMatched: true,
		httpsHealth: true,
		tlsValidForHost: true,
		healthTextMatched: true,
	},
})
const weakDnsHttpsEvidenceFile = writeEvidence('weak-dns-https.json', {
	version: 1,
	kind: 'payram-dns-https',
	ok: true,
	dryRun: false,
	hostNameHash: '1'.repeat(16),
	expectedIpHash: '2'.repeat(16),
	resolvedIpHash: '3'.repeat(16),
	resolvedIpCount: 1,
	checks: {
		dnsResolved: true,
		expectedIpMatched: false,
		httpsHealth: false,
		tlsValidForHost: false,
		healthTextMatched: false,
	},
})
const validBackupRestoreEvidenceFile = writeEvidence('valid-backup-restore.json', {
	kind: 'payram-oci-backup-restore',
	ok: true,
	dryRun: false,
	hostVerified: true,
	keepDrillFiles: false,
	checks: {
		backupScriptExecutable: true,
		backupArchiveCreated: true,
		backupArchiveExtracted: true,
		restoreMarkerVerified: true,
		cleanupRequested: true,
	},
	archiveHash: '3'.repeat(16),
	markerHash: '4'.repeat(16),
})
const weakBackupRestoreEvidenceFile = writeEvidence('weak-backup-restore.json', {
	kind: 'payram-oci-backup-restore',
	ok: true,
	dryRun: false,
	hostVerified: false,
	keepDrillFiles: true,
	checks: {
		backupScriptExecutable: true,
		backupArchiveCreated: true,
		backupArchiveExtracted: false,
		restoreMarkerVerified: false,
		cleanupRequested: false,
	},
	archiveHash: '3'.repeat(16),
	markerHash: '4'.repeat(16),
})
const validOciAlarmsEvidenceFile = writeEvidence('valid-oci-alarms.json', {
	kind: 'payram-oci-alarms',
	ok: true,
	dryRun: false,
	subscription: {
		email: true,
		status: 'exists',
		ownerConfirmedReady: true,
	},
	alarms: {
		cpuHigh: 'created',
		memoryHigh: 'exists',
		filesystemHigh: 'created',
	},
	checks: {
		topicEnsured: true,
		emailSubscriptionEnsured: true,
		cpuAlarmEnsured: true,
		memoryAlarmEnsured: true,
		filesystemAlarmEnsured: true,
	},
})
const weakOciAlarmsEvidenceFile = writeEvidence('weak-oci-alarms.json', {
	kind: 'payram-oci-alarms',
	ok: false,
	dryRun: true,
	subscription: {
		email: true,
		status: 'dry_run',
		ownerConfirmedReady: false,
	},
	alarms: {
		cpuHigh: 'dry_run',
		memoryHigh: 'dry_run',
		filesystemHigh: 'dry_run',
	},
	checks: {
		topicEnsured: true,
		emailSubscriptionEnsured: true,
		cpuAlarmEnsured: true,
		memoryAlarmEnsured: true,
		filesystemAlarmEnsured: true,
	},
})
const validPayRamPhase0EvidenceFile = writeEvidence('valid-payram-phase0.json', {
	ok: true,
	payram: {
		referenceIdHash: '1'.repeat(16),
		status: {
			creditable: true,
			state: 'paid',
			providerStatus: 'FILLED',
			referenceIdHash: '1'.repeat(16),
		},
	},
	manualChecklist: [],
})
const weakPayRamPhase0EvidenceFile = writeEvidence('weak-payram-phase0.json', {
	ok: true,
	payram: {
		referenceId: 'payram_test_reference',
		status: {
			creditable: false,
			state: 'pending',
			providerStatus: 'PARTIALLY_FILLED',
			referenceId: 'payram_test_reference',
		},
	},
	manualChecklist: ['manual fee review required'],
})
const validForwarderCustodyEvidenceFile = writeEvidence('valid-forwarder-custody.json', {
	secretUploaded: true,
	dryRun: false,
	saltSecretName: 'betterpptx-forwarder-salt-secret',
	sweeperKeySecretName: 'betterpptx-forwarder-sweeper-key',
	saltSecretSha256: 'a'.repeat(64),
	encryptedCustodySha256: 'b'.repeat(64),
	custodyPlaintextSha256: 'c'.repeat(64),
	sweeperAddress: '0x1111111111111111111111111111111111111111',
})
const weakForwarderCustodyEvidenceFile = writeEvidence('weak-forwarder-custody.json', {
	secretUploaded: true,
	dryRun: true,
	saltSecretName: 'betterpptx-forwarder-salt-secret',
	sweeperKeySecretName: 'betterpptx-forwarder-sweeper-key',
	saltSecretSha256: 'a'.repeat(64),
	encryptedCustodySha256: 'b'.repeat(64),
	custodyPlaintextSha256: 'c'.repeat(64),
	sweeperAddress: '0x1111111111111111111111111111111111111111',
})
const validForwarderProofEvidenceFile = writeEvidence('valid-forwarder-proof.json', {
	kind: 'forwarder-external-proof-bundle',
	ok: true,
	dryRun: false,
	proofComplete: true,
	baseSepolia: {
		chainId: 84532,
		mode: 'sweep-proof',
		receiptStatus: 'success',
		evidenceSha256: '1'.repeat(64),
		predictedForwarderAddressSha256: '2'.repeat(64),
		sweepTxSha256: '3'.repeat(64),
		tokenAtomsBeforeSha256: '4'.repeat(64),
		tokenAtomsAfter: '0',
	},
	baseMainnetCanary: {
		chainId: 8453,
		mode: 'sweep-proof',
		receiptStatus: 'success',
		cappedLiveValueCanary: true,
		maxCanaryAtoms: '10000000',
		evidenceSha256: '5'.repeat(64),
		predictedForwarderAddressSha256: '6'.repeat(64),
		sweepTxSha256: '7'.repeat(64),
		tokenAtomsBeforeSha256: '8'.repeat(64),
		tokenAtomsAfter: '0',
	},
})
const weakForwarderProofEvidenceFile = writeEvidence('weak-forwarder-proof.json', {
	proofComplete: true,
	mode: 'sweep-proof',
	receiptStatus: 'success',
	sweepTx: '0x' + '2'.repeat(64),
	predictedForwarderAddress: '0x2222222222222222222222222222222222222222',
	tokenAtomsAfter: '1',
})
const validForwarderReviewEvidenceFile = writeEvidence('valid-forwarder-review.json', {
	kind: 'forwarder-review-decision',
	ok: true,
	dryRun: false,
	ownerAccepted: true,
	cappedLiveValueCanaryAccepted: true,
	review: {
		decision: 'owner_accepted_no_external_review',
		externalReviewRequired: false,
		ownerAcceptedNoExternalReview: true,
	},
})
const weakForwarderReviewEvidenceFile = writeEvidence('weak-forwarder-review.json', {
	kind: 'forwarder-review-decision',
	ok: true,
	dryRun: false,
	ownerAccepted: false,
	cappedLiveValueCanaryAccepted: true,
	review: {
		decision: 'owner_accepted_no_external_review',
		externalReviewRequired: false,
		ownerAcceptedNoExternalReview: false,
	},
})

const validProofConfig = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-PayRamOciHostEvidenceFile',
	'/workspace/outputs/payram-oci-host-proof/latest.json',
	'-PayRamPhase0VerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-PayRamPhase0EvidenceFile',
	'/workspace/outputs/payram-phase0-proof/latest.json',
	'-ForwarderCustodyVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-ForwarderCustodyEvidenceFile',
	'/workspace/outputs/forwarder-custody/latest-manifest.json',
	'-ForwarderProofVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-ForwarderProofEvidenceFile',
	'/workspace/outputs/forwarder-proof/latest.json',
])
expect(validProofConfig.status === 0, 'Deploy script proof-env validation mode must accept exact ISO proof stamps without touching gcloud.', {
	status: validProofConfig.status,
	stdout: validProofConfig.stdout,
	stderr: validProofConfig.stderr,
})
expect(validProofConfig.stdout.includes('DEPLOY CONFIG VALIDATION: PASS'), 'Deploy validation mode must print a pass line.', { stdout: validProofConfig.stdout })
expect(validProofConfig.stdout.includes('gcloud=skipped'), 'Deploy validation mode must make clear that gcloud was not called.', { stdout: validProofConfig.stdout })
const distributedProofWithoutMode = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-MarkDistributedRuntimeVerified',
	'-ConfirmDistributedRuntimeVerified',
	'DISTRIBUTED RUNTIME VERIFIED',
])
expect(distributedProofWithoutMode.status !== 0, 'Distributed runtime proof marking must fail unless distributed runtime is enabled.', {
	status: distributedProofWithoutMode.status,
	stdout: distributedProofWithoutMode.stdout,
	stderr: distributedProofWithoutMode.stderr,
})
expect(
	`${distributedProofWithoutMode.stdout}\n${distributedProofWithoutMode.stderr}`.includes('-MarkDistributedRuntimeVerified requires -DistributedRuntime'),
	'Distributed proof mode failure must explain that DistributedRuntime is required.',
	{ stdout: distributedProofWithoutMode.stdout, stderr: distributedProofWithoutMode.stderr },
)
const distributedProofMissingConfirm = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-DistributedRuntime',
	'-MarkDistributedRuntimeVerified',
])
expect(distributedProofMissingConfirm.status !== 0, 'Distributed runtime proof marking must fail without the explicit confirmation phrase.', {
	status: distributedProofMissingConfirm.status,
	stdout: distributedProofMissingConfirm.stdout,
	stderr: distributedProofMissingConfirm.stderr,
})
expect(
	`${distributedProofMissingConfirm.stdout}\n${distributedProofMissingConfirm.stderr}`.includes('DISTRIBUTED RUNTIME VERIFIED'),
	'Distributed proof confirmation failure must name the required confirmation phrase.',
	{ stdout: distributedProofMissingConfirm.stdout, stderr: distributedProofMissingConfirm.stderr },
)
const distributedProofReadyConfig = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-DistributedRuntime',
	'-MarkDistributedRuntimeVerified',
	'-ConfirmDistributedRuntimeVerified',
	'DISTRIBUTED RUNTIME VERIFIED',
])
expect(distributedProofReadyConfig.status === 0, 'Distributed runtime proof marking validation must pass only with distributed mode and confirmation.', {
	status: distributedProofReadyConfig.status,
	stdout: distributedProofReadyConfig.stdout,
	stderr: distributedProofReadyConfig.stderr,
})
const invalidProofConfig = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-PayRamPhase0VerifiedAt',
	'2026-06-17 12:00:00',
])
expect(invalidProofConfig.status !== 0, 'Deploy script proof-env validation mode must reject non-exact proof stamps before deployment.', {
	status: invalidProofConfig.status,
	stdout: invalidProofConfig.stdout,
	stderr: invalidProofConfig.stderr,
})
expect(
	`${invalidProofConfig.stdout}\n${invalidProofConfig.stderr}`.includes('exact UTC ISO timestamp'),
	'Invalid proof-stamp validation must explain the exact UTC ISO requirement.',
	{ stdout: invalidProofConfig.stdout, stderr: invalidProofConfig.stderr },
)
const payramMissingConfirm = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-EnablePayRamCardRail',
	'-PayRamOciHostVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-PayRamDnsHttpsVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-PayRamBackupRestoreVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-PayRamOciAlarmsVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-PayRamPhase0VerifiedAt',
	'2026-06-17T12:00:00.000Z',
])
expect(payramMissingConfirm.status !== 0, 'PayRam public enablement must fail without the explicit owner confirmation phrase.', {
	status: payramMissingConfirm.status,
	stdout: payramMissingConfirm.stdout,
	stderr: payramMissingConfirm.stderr,
})
expect(
	`${payramMissingConfirm.stdout}\n${payramMissingConfirm.stderr}`.includes('ENABLE PAYRAM CARD RAIL'),
	'PayRam public-enable failure must name the required confirmation phrase.',
	{ stdout: payramMissingConfirm.stdout, stderr: payramMissingConfirm.stderr },
)
const payramRequireWithoutEnable = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-RequireCardOnrampPublic',
])
expect(payramRequireWithoutEnable.status !== 0, 'Required card-onramp policy must fail if PayRam card rail is not also enabled.', {
	status: payramRequireWithoutEnable.status,
	stdout: payramRequireWithoutEnable.stdout,
	stderr: payramRequireWithoutEnable.stderr,
})
expect(
	`${payramRequireWithoutEnable.stdout}\n${payramRequireWithoutEnable.stderr}`.includes('-RequireCardOnrampPublic requires -EnablePayRamCardRail'),
	'Required-card-onramp failure must explain the dependency on EnablePayRamCardRail.',
	{ stdout: payramRequireWithoutEnable.stdout, stderr: payramRequireWithoutEnable.stderr },
)
const payramMissingProof = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-EnablePayRamCardRail',
	'-ConfirmPayRamPublicEnable',
	'ENABLE PAYRAM CARD RAIL',
])
expect(payramMissingProof.status !== 0, 'PayRam public enablement must fail when confirmation is present but proof stamps are missing.', {
	status: payramMissingProof.status,
	stdout: payramMissingProof.stdout,
	stderr: payramMissingProof.stderr,
})
expect(
	`${payramMissingProof.stdout}\n${payramMissingProof.stderr}`.includes('PayRam public card rail enablement requires'),
	'PayRam missing-proof failure must explain that proof evidence is required.',
	{ stdout: payramMissingProof.stdout, stderr: payramMissingProof.stderr },
)
const payramReadyConfig = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-EnablePayRamCardRail',
	'-ConfirmPayRamPublicEnable',
	'ENABLE PAYRAM CARD RAIL',
	'-PayRamOciHostVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-PayRamDnsHttpsVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-PayRamBackupRestoreVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-PayRamOciAlarmsVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-PayRamPhase0VerifiedAt',
	'2026-06-17T12:00:00.000Z',
])
expect(payramReadyConfig.status === 0, 'PayRam public-enable validation must pass only when confirmation and proof stamps are supplied.', {
	status: payramReadyConfig.status,
	stdout: payramReadyConfig.stdout,
	stderr: payramReadyConfig.stderr,
})
const payramEvidenceReadyConfig = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-EnablePayRamCardRail',
	'-ConfirmPayRamPublicEnable',
	'ENABLE PAYRAM CARD RAIL',
	'-PayRamOciHostEvidenceFile',
	validHostEvidenceFile,
	'-PayRamDnsHttpsEvidenceFile',
	validDnsHttpsEvidenceFile,
	'-PayRamBackupRestoreEvidenceFile',
	validBackupRestoreEvidenceFile,
	'-PayRamOciAlarmsEvidenceFile',
	validOciAlarmsEvidenceFile,
	'-PayRamPhase0EvidenceFile',
	validPayRamPhase0EvidenceFile,
])
expect(payramEvidenceReadyConfig.status === 0, 'PayRam public-enable validation must accept launch-valid local evidence files.', {
	status: payramEvidenceReadyConfig.status,
	stdout: payramEvidenceReadyConfig.stdout,
	stderr: payramEvidenceReadyConfig.stderr,
})
const payramHttpOnlyHostEvidence = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-EnablePayRamCardRail',
	'-ConfirmPayRamPublicEnable',
	'ENABLE PAYRAM CARD RAIL',
	'-PayRamOciHostEvidenceFile',
	httpOnlyHostEvidenceFile,
	'-PayRamBackupRestoreVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-PayRamOciAlarmsVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-PayRamPhase0EvidenceFile',
	validPayRamPhase0EvidenceFile,
])
expect(payramHttpOnlyHostEvidence.status !== 0, 'PayRam public-enable validation must reject HTTP-only OCI host evidence.', {
	status: payramHttpOnlyHostEvidence.status,
	stdout: payramHttpOnlyHostEvidence.stdout,
	stderr: payramHttpOnlyHostEvidence.stderr,
})
expect(
	`${payramHttpOnlyHostEvidence.stdout}\n${payramHttpOnlyHostEvidence.stderr}`.includes('PayRam OCI host evidence file failed validation'),
	'HTTP-only host evidence failure must explain that host evidence validation failed.',
	{ stdout: payramHttpOnlyHostEvidence.stdout, stderr: payramHttpOnlyHostEvidence.stderr },
)
const payramWeakDnsHttpsEvidence = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-EnablePayRamCardRail',
	'-ConfirmPayRamPublicEnable',
	'ENABLE PAYRAM CARD RAIL',
	'-PayRamOciHostEvidenceFile',
	validHostEvidenceFile,
	'-PayRamDnsHttpsEvidenceFile',
	weakDnsHttpsEvidenceFile,
	'-PayRamBackupRestoreVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-PayRamOciAlarmsVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-PayRamPhase0EvidenceFile',
	validPayRamPhase0EvidenceFile,
])
expect(payramWeakDnsHttpsEvidence.status !== 0, 'PayRam public-enable validation must reject weak DNS/HTTPS evidence.', {
	status: payramWeakDnsHttpsEvidence.status,
	stdout: payramWeakDnsHttpsEvidence.stdout,
	stderr: payramWeakDnsHttpsEvidence.stderr,
})
expect(
	`${payramWeakDnsHttpsEvidence.stdout}\n${payramWeakDnsHttpsEvidence.stderr}`.includes('PayRam DNS/HTTPS evidence file failed validation'),
	'Weak DNS/HTTPS evidence failure must explain that DNS/HTTPS evidence validation failed.',
	{ stdout: payramWeakDnsHttpsEvidence.stdout, stderr: payramWeakDnsHttpsEvidence.stderr },
)
const payramWeakPhase0Evidence = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-EnablePayRamCardRail',
	'-ConfirmPayRamPublicEnable',
	'ENABLE PAYRAM CARD RAIL',
	'-PayRamOciHostEvidenceFile',
	validHostEvidenceFile,
	'-PayRamDnsHttpsEvidenceFile',
	validDnsHttpsEvidenceFile,
	'-PayRamBackupRestoreVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-PayRamOciAlarmsVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-PayRamPhase0EvidenceFile',
	weakPayRamPhase0EvidenceFile,
])
expect(payramWeakPhase0Evidence.status !== 0, 'PayRam public-enable validation must reject weak Phase 0 payment evidence.', {
	status: payramWeakPhase0Evidence.status,
	stdout: payramWeakPhase0Evidence.stdout,
	stderr: payramWeakPhase0Evidence.stderr,
})
const payramWeakBackupEvidence = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-EnablePayRamCardRail',
	'-ConfirmPayRamPublicEnable',
	'ENABLE PAYRAM CARD RAIL',
	'-PayRamOciHostEvidenceFile',
	validHostEvidenceFile,
	'-PayRamDnsHttpsEvidenceFile',
	validDnsHttpsEvidenceFile,
	'-PayRamBackupRestoreEvidenceFile',
	weakBackupRestoreEvidenceFile,
	'-PayRamOciAlarmsEvidenceFile',
	validOciAlarmsEvidenceFile,
	'-PayRamPhase0EvidenceFile',
	validPayRamPhase0EvidenceFile,
])
expect(payramWeakBackupEvidence.status !== 0, 'PayRam public-enable validation must reject weak backup/restore evidence.', {
	status: payramWeakBackupEvidence.status,
	stdout: payramWeakBackupEvidence.stdout,
	stderr: payramWeakBackupEvidence.stderr,
})
const payramWeakAlarmsEvidence = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-EnablePayRamCardRail',
	'-ConfirmPayRamPublicEnable',
	'ENABLE PAYRAM CARD RAIL',
	'-PayRamOciHostEvidenceFile',
	validHostEvidenceFile,
	'-PayRamDnsHttpsEvidenceFile',
	validDnsHttpsEvidenceFile,
	'-PayRamBackupRestoreEvidenceFile',
	validBackupRestoreEvidenceFile,
	'-PayRamOciAlarmsEvidenceFile',
	weakOciAlarmsEvidenceFile,
	'-PayRamPhase0EvidenceFile',
	validPayRamPhase0EvidenceFile,
])
expect(payramWeakAlarmsEvidence.status !== 0, 'PayRam public-enable validation must reject weak OCI alarm evidence.', {
	status: payramWeakAlarmsEvidence.status,
	stdout: payramWeakAlarmsEvidence.stdout,
	stderr: payramWeakAlarmsEvidence.stderr,
})
const payramMissingEvidenceFile = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-EnablePayRamCardRail',
	'-ConfirmPayRamPublicEnable',
	'ENABLE PAYRAM CARD RAIL',
	'-PayRamOciHostEvidenceFile',
	path.join(evidenceTempDir, 'missing-host.json'),
	'-PayRamBackupRestoreVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-PayRamOciAlarmsVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-PayRamPhase0EvidenceFile',
	validPayRamPhase0EvidenceFile,
])
expect(payramMissingEvidenceFile.status !== 0, 'PayRam public-enable validation must reject missing local evidence files.', {
	status: payramMissingEvidenceFile.status,
	stdout: payramMissingEvidenceFile.stdout,
	stderr: payramMissingEvidenceFile.stderr,
})
const forwarderMissingConfirm = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-EnableForwarderRawSend',
	'-ForwarderCustodyVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-ForwarderProofVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-ForwarderReviewVerifiedAt',
	'2026-06-17T12:00:00.000Z',
])
expect(forwarderMissingConfirm.status !== 0, 'Forwarder raw-send enablement must fail without the explicit owner confirmation phrase.', {
	status: forwarderMissingConfirm.status,
	stdout: forwarderMissingConfirm.stdout,
	stderr: forwarderMissingConfirm.stderr,
})
expect(
	`${forwarderMissingConfirm.stdout}\n${forwarderMissingConfirm.stderr}`.includes('ENABLE FORWARDER RAW SEND'),
	'Forwarder public-enable failure must name the required confirmation phrase.',
	{ stdout: forwarderMissingConfirm.stdout, stderr: forwarderMissingConfirm.stderr },
)
const forwarderMissingProof = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-EnableForwarderRawSend',
	'-ConfirmForwarderRawSendPublicEnable',
	'ENABLE FORWARDER RAW SEND',
])
expect(forwarderMissingProof.status !== 0, 'Forwarder raw-send enablement must fail when confirmation is present but proof evidence is missing.', {
	status: forwarderMissingProof.status,
	stdout: forwarderMissingProof.stdout,
	stderr: forwarderMissingProof.stderr,
})
expect(
	`${forwarderMissingProof.stdout}\n${forwarderMissingProof.stderr}`.includes('Forwarder raw-send enablement requires'),
	'Forwarder missing-proof failure must explain that custody/proof evidence is required.',
	{ stdout: forwarderMissingProof.stdout, stderr: forwarderMissingProof.stderr },
)
const forwarderMissingReview = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-EnableForwarderRawSend',
	'-ConfirmForwarderRawSendPublicEnable',
	'ENABLE FORWARDER RAW SEND',
	'-ForwarderCustodyVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-ForwarderProofVerifiedAt',
	'2026-06-17T12:00:00.000Z',
])
expect(forwarderMissingReview.status !== 0, 'Forwarder raw-send enablement must fail when review proof is missing.', {
	status: forwarderMissingReview.status,
	stdout: forwarderMissingReview.stdout,
	stderr: forwarderMissingReview.stderr,
})
expect(
	`${forwarderMissingReview.stdout}\n${forwarderMissingReview.stderr}`.includes('Forwarder raw-send enablement requires -ForwarderReviewVerifiedAt or -ForwarderReviewEvidenceFile'),
	'Forwarder missing-review failure must explain that review proof evidence is required.',
	{ stdout: forwarderMissingReview.stdout, stderr: forwarderMissingReview.stderr },
)
const forwarderReadyConfig = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-EnableForwarderRawSend',
	'-ConfirmForwarderRawSendPublicEnable',
	'ENABLE FORWARDER RAW SEND',
	'-ForwarderCustodyVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-ForwarderProofVerifiedAt',
	'2026-06-17T12:00:00.000Z',
	'-ForwarderReviewVerifiedAt',
	'2026-06-17T12:00:00.000Z',
])
expect(forwarderReadyConfig.status === 0, 'Forwarder raw-send validation must pass only when confirmation and proof evidence are supplied.', {
	status: forwarderReadyConfig.status,
	stdout: forwarderReadyConfig.stdout,
	stderr: forwarderReadyConfig.stderr,
})
const forwarderEvidenceReadyConfig = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-EnableForwarderRawSend',
	'-ConfirmForwarderRawSendPublicEnable',
	'ENABLE FORWARDER RAW SEND',
	'-ForwarderCustodyEvidenceFile',
	validForwarderCustodyEvidenceFile,
	'-ForwarderProofEvidenceFile',
	validForwarderProofEvidenceFile,
	'-ForwarderReviewEvidenceFile',
	validForwarderReviewEvidenceFile,
])
expect(forwarderEvidenceReadyConfig.status === 0, 'Forwarder raw-send validation must accept launch-valid local custody, proof, and review evidence files.', {
	status: forwarderEvidenceReadyConfig.status,
	stdout: forwarderEvidenceReadyConfig.stdout,
	stderr: forwarderEvidenceReadyConfig.stderr,
})
const forwarderWeakCustodyEvidence = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-EnableForwarderRawSend',
	'-ConfirmForwarderRawSendPublicEnable',
	'ENABLE FORWARDER RAW SEND',
	'-ForwarderCustodyEvidenceFile',
	weakForwarderCustodyEvidenceFile,
	'-ForwarderProofEvidenceFile',
	validForwarderProofEvidenceFile,
	'-ForwarderReviewEvidenceFile',
	validForwarderReviewEvidenceFile,
])
expect(forwarderWeakCustodyEvidence.status !== 0, 'Forwarder raw-send validation must reject weak custody evidence.', {
	status: forwarderWeakCustodyEvidence.status,
	stdout: forwarderWeakCustodyEvidence.stdout,
	stderr: forwarderWeakCustodyEvidence.stderr,
})
const forwarderWeakProofEvidence = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-EnableForwarderRawSend',
	'-ConfirmForwarderRawSendPublicEnable',
	'ENABLE FORWARDER RAW SEND',
	'-ForwarderCustodyEvidenceFile',
	validForwarderCustodyEvidenceFile,
	'-ForwarderProofEvidenceFile',
	weakForwarderProofEvidenceFile,
	'-ForwarderReviewEvidenceFile',
	validForwarderReviewEvidenceFile,
])
expect(forwarderWeakProofEvidence.status !== 0, 'Forwarder raw-send validation must reject weak external proof evidence.', {
	status: forwarderWeakProofEvidence.status,
	stdout: forwarderWeakProofEvidence.stdout,
	stderr: forwarderWeakProofEvidence.stderr,
})
const forwarderWeakReviewEvidence = runPowerShell([
	'-File',
	deployScriptPath,
	'-ProjectId',
	'betterpptx-config-validate',
	'-GcsBucket',
	'betterpptx-config-validate',
	'-ValidateConfigOnly',
	'-EnableForwarderRawSend',
	'-ConfirmForwarderRawSendPublicEnable',
	'ENABLE FORWARDER RAW SEND',
	'-ForwarderCustodyEvidenceFile',
	validForwarderCustodyEvidenceFile,
	'-ForwarderProofEvidenceFile',
	validForwarderProofEvidenceFile,
	'-ForwarderReviewEvidenceFile',
	weakForwarderReviewEvidenceFile,
])
expect(forwarderWeakReviewEvidence.status !== 0, 'Forwarder raw-send validation must reject weak owner-review evidence.', {
	status: forwarderWeakReviewEvidence.status,
	stdout: forwarderWeakReviewEvidence.stdout,
	stderr: forwarderWeakReviewEvidence.stderr,
})
expect(text.includes('Do not bind betterpptx-payram-hot-wallet-private-key'), 'Cloud Run sample must warn that PayRam hot wallet key is not bound to the MCP runtime.', {})
expect(deployScript.includes('"betterpptx-payram-webhook-custom-token" = { New-RandomSecret 32 }'), 'Deploy script must bootstrap PayRam webhook/reconciler token.', {})
expect(deployScript.includes('BETTERPPTX_PAYRAM_ENABLED = $(if ($EnablePayRamCardRail) { "1" } else { "0" })'), 'Deploy script must keep PayRam disabled unless the explicit public-enable switch is supplied.', {})
expect(deployScript.includes('BETTERPPTX_REQUIRE_CARD_ONRAMP = $(if ($RequireCardOnrampPublic) { "1" } else { "0" })'), 'Deploy script must require the card rail only when explicitly requested.', {})
expect(deployScript.includes('"betterpptx-payram-base-url"') && deployScript.includes('"betterpptx-payram-api-key"'), 'Deploy script must require PayRam base URL and API key secrets when the card rail is public-enabled.', {})
expect(deployScript.includes('[int]$GatewayMaxInstances = 10'), 'Deploy script default gateway max instances must fit the current staging Cloud Run CPU/memory quota.')
expect(deployScript.includes('[int]$WorkerMaxInstances = 10'), 'Deploy script default worker max instances must fit the current staging Cloud Run CPU/memory quota.')
expect(deployScript.includes('[Alias("Args")]'), 'Deploy script gcloud wrapper must preserve -Args call sites without colliding with PowerShell automatic $args.', {})
expect(deployScript.includes('& gcloud @GcloudArgs'), 'Deploy script gcloud wrapper must splat the renamed argument list.', {})
expect(deployScript.includes('[switch]$SuppressOutput'), 'Deploy script gcloud wrapper must support suppressing secret-bearing command output.', {})
expect(deployScript.includes('Redact-CommandOutput'), 'Deploy script must redact failed secret-bearing command output.')
expect(deployScript.includes('[string[]]$SensitiveValues = @()'), 'Deploy script suppress-output path must accept sensitive values for redaction.')
expect(deployScript.includes('-Step "Update PayRam reconciler scheduler" -SuppressOutput'), 'Deploy script must suppress Scheduler update output because it contains the PayRam header token.', {})
expect(deployScript.includes('-Step "Create PayRam reconciler scheduler" -SuppressOutput'), 'Deploy script must suppress Scheduler create output because it contains the PayRam header token.', {})
expect(deployScript.includes('-SensitiveValues @($Token)'), 'Scheduler create/update must mark the PayRam token as sensitive for redaction.')
expect(deployScript.includes('BETTERPPTX_X402_RELAYER_LEASE_STORE = "firestore"'), 'Deploy script must use Firestore relayer leases explicitly.', {})
expect(deployScript.includes('BETTERPPTX_ENTITLEMENT_STORE = "firestore"'), 'Deploy script must use Firestore entitlement storage explicitly in distributed mode.', {})
expect(deployScript.includes('BETTERPPTX_DISTRIBUTED_RUNTIME_VERIFIED = $(if ($MarkDistributedRuntimeVerified) { "1" } else { "0" })'), 'Deploy script must mark distributed runtime proof only through the explicit switch.', {})
expect(deployScript.includes('if ($MarkDistributedRuntimeVerified -and $capabilities.readiness.publicProductionReady -ne $true)'), 'Deploy health check must fail if proof is marked but publicProductionReady remains false.', {})
expect(deployScript.includes('BETTERPPTX_FIRESTORE_ENTITLEMENTS_COLLECTION = "${BillingPrefix}_entitlements"'), 'Deploy script must set an explicit Firestore entitlement collection.', {})
expect(deployScript.includes('BETTERPPTX_X402_RELAYER_LEASE_TTL_MS = "15000"'), 'Deploy script must set the x402 relayer lease TTL explicitly.', {})
expect(deployScript.includes('BETTERPPTX_X402_RELAYER_LEASE_WAIT_MS = "10000"'), 'Deploy script must set the x402 relayer lease wait explicitly.', {})
expect(deployScript.includes('BETTERPPTX_X402_SERVICE_FULFILLMENT_LEASE_MS = "120000"'), 'Deploy script must set the paid service fulfillment lease explicitly.', {})
expect(deployScript.includes('[switch]$EnableForwarderRawSend'), 'Deploy script must require an explicit switch before binding forwarder raw-send secrets.', {})
expect(deployScript.includes('BETTERPPTX_RAW_SEND_RAIL = $(if ($EnableForwarderRawSend) { "forwarder" } else { "xpub" })'), 'Deploy script must keep xpub as the default raw-send rail.', {})
expect(deployScript.includes('Ensure-PayRamReconcileScheduler'), 'Deploy script must configure an external PayRam reconciliation scheduler.', {})
expect(deployScript.includes('Ensure-ForwarderSweepScheduler'), 'Deploy script must configure an external forwarder sweep scheduler once forwarders are enabled.', {})
expect(deployScript.includes('cloudscheduler.googleapis.com'), 'Deploy script must enable Cloud Scheduler for external reconciliation.', {})
expect(deployScript.includes('/internal/payments/payram/reconcile'), 'Deploy script must target the PayRam reconcile route.', {})
expect(deployScript.includes('/internal/payments/forwarders/sweep'), 'Deploy script must target the forwarder sweep route.', {})
expect(deployScript.includes('x-betterpptx-payram-token=$Token'), 'Scheduler must authenticate with a header token, not a query-string token.', {})
expect(deployScript.includes('x-betterpptx-scanner-token=$Token'), 'Forwarder sweep Scheduler must authenticate with a header token, not a query-string token.', {})
expect(deployScript.includes('$SkipForwarderSweepSchedulerSetup -or -not $EnableForwarderRawSend'), 'Forwarder sweep Scheduler must stay disabled unless the explicit forwarder switch is enabled.', {})
expect(deployScript.includes('--update-headers=$headers'), 'Scheduler update must use gcloud update-header syntax.')
expect(deployScript.includes('--headers=$headers'), 'Scheduler create must use gcloud create-header syntax.')
expect(!deployScript.includes('/internal/payments/payram/reconcile?token='), 'Scheduler must not place the PayRam token in the URL query string.', {})
expect(!deployScript.includes('/internal/payments/forwarders/sweep?token='), 'Scheduler must not place the scanner token in the URL query string.', {})
expect(deployScript.includes('BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN=betterpptx-payram-webhook-custom-token:latest'), 'Deploy script must bind PayRam webhook token to Cloud Run.', {})
expect(deployScript.includes('BETTERPPTX_PAYRAM_BASE_URL=betterpptx-payram-base-url:latest'), 'Deploy script must optionally bind PayRam base URL.', {})
expect(deployScript.includes('BETTERPPTX_PAYRAM_API_KEY=betterpptx-payram-api-key:latest'), 'Deploy script must optionally bind PayRam API key.', {})
expect(deployScript.includes('BETTERPPTX_PAYRAM_PROJECT_ID=betterpptx-payram-project-id:latest'), 'Deploy script must optionally bind PayRam project id.', {})
expect(!deployScript.includes('BETTERPPTX_PAYRAM_HOT_WALLET_PRIVATE_KEY='), 'Deploy script must not bind PayRam hot wallet private key to Cloud Run.', {})
expect(deployScript.includes('Do not bind betterpptx-payram-hot-wallet-private-key'), 'Deploy script must document PayRam hot wallet exclusion.', {})
const optionalOwnerBlock = deployScript.match(/\$optionalOwnerSecrets\s*=\s*@\([\s\S]*?\n\)/)?.[0] || ''
expect(!optionalOwnerBlock.includes('betterpptx-payram-hot-wallet-private-key'), 'Deploy script must not grant runtime Secret Manager access to the PayRam hot wallet through optional owner secrets.', {})
expect(!deployScript.includes('gcloud secrets add-iam-policy-binding "betterpptx-payram-hot-wallet-private-key"'), 'Deploy script must not grant the Cloud Run runtime service account PayRam hot wallet access directly.', {})
expect(!deployScript.includes('gcloud secrets add-iam-policy-binding betterpptx-payram-hot-wallet-private-key'), 'Deploy script must not grant the Cloud Run runtime service account PayRam hot wallet access directly.', {})
expect(dockerfile.includes('COPY --from=builder /app/PPTX_ULTIMATE_DECYPHER_TOOL.mjs ./PPTX_ULTIMATE_DECYPHER_TOOL.mjs'), 'Docker runtime must package the decypher tool expected by the runtime runner.', {})
expect(gcloudIgnore.includes('!PPTX_ULTIMATE_DECYPHER_TOOL.mjs'), 'Cloud Build upload context must include the runtime decypher tool copied by Dockerfile.mcp.', {})
expect(gcloudIgnore.includes('!ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1'), 'Cloud Build upload context must include the packaged comparator script listed in package files.', {})
for (const binding of [
	'BETTERPPTX_FORWARDER_FACTORY_ADDRESS=betterpptx-forwarder-factory-address:latest',
	'BETTERPPTX_FORWARDER_CODEHASH=betterpptx-forwarder-codehash:latest',
	'BETTERPPTX_SETTLEMENT_COLLECTOR_EVM_ADDRESS=betterpptx-settlement-collector-evm-address:latest',
	'BETTERPPTX_FORWARDER_SALT_SECRET=betterpptx-forwarder-salt-secret:latest',
	'BETTERPPTX_FORWARDER_SWEEPER_KEY=betterpptx-forwarder-sweeper-key:latest',
]) {
	expect(deployScript.includes(binding), `Deploy script must bind forwarder secret behind explicit switch: ${binding}`, {})
}

console.log(`CLOUD RUN CRYPTO CONFIG: PASS sharedPaymentStores=1 sharedRelayerLease=1 requestConcurrency=${requestConcurrency} heavyConcurrency=1 heavyInflightCeiling=${heavyInflight} controlReserve=${requestConcurrency - heavyInflight} privateCanaryOnly=1 payramDisabled=1 payramHotWalletExcluded=1 rawSendRail=xpub forwarderSwitch=1`)
