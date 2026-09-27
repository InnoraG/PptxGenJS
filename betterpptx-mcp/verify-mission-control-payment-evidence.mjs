import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const proofEnvNames = [
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
]

for (const name of proofEnvNames) delete process.env[name]

process.env.BETTERPPTX_MISSION_CONTROL = '1'
process.env.BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN = 'owner-admin-token-for-payment-evidence'

const { buildMissionControlSnapshot } = await import('./mission-control.mjs')

function gate(snapshot, id) {
	const found = snapshot.gates.find(item => item.id === id)
	assert(found, `Missing Mission Control gate: ${id}`)
	return found
}

const missing = buildMissionControlSnapshot({ accessMode: 'loopback' })
assert.equal(missing.paymentLaunchEvidence.publicEnableReady, false)
assert.equal(gate(missing, 'payment-public-enable-evidence').status, 'warn')
for (const item of missing.paymentLaunchEvidence.items) {
	assert(['deferred', 'warn'].includes(item.status), `Unverified item should not be ok: ${item.id}`)
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-payment-evidence-'))
const rawPayramUrl = 'https://payram.example.test/pay?reference_id=payram_ref_secret&token=secret-token'
const rawReference = 'payram_ref_secret'
const rawForwarderAddress = '0x7777777777777777777777777777777777777777'
const rawSalt = `0x${'88'.repeat(32)}`
const rawFactory = '0x9999999999999999999999999999999999999999'
const rawCustodyPath = 'C:\\owner\\private\\betterpptx-forwarder-secrets-custody.encrypted.json'
const hostEvidenceFile = path.join(dir, 'payram-oci-host.json')
const dnsHttpsEvidenceFile = path.join(dir, 'payram-dns-https.json')
const backupEvidenceFile = path.join(dir, 'payram-backup-restore.json')
const alarmsEvidenceFile = path.join(dir, 'payram-oci-alarms.json')
const payramEvidenceFile = path.join(dir, 'payram-phase0.json')
const forwarderCustodyFile = path.join(dir, 'forwarder-custody.json')
const forwarderEvidenceFile = path.join(dir, 'forwarder-proof.json')
const forwarderReviewFile = path.join(dir, 'forwarder-review.json')

fs.writeFileSync(hostEvidenceFile, `${JSON.stringify({
	version: 1,
	kind: 'payram-oci-host-bootstrap',
	label: 'manual',
	createdAt: '2026-06-17T11:59:00.000Z',
	ok: true,
	hostBootstrapOk: true,
	httpOnlyOk: false,
	requireHttps: false,
	targetHash: '1'.repeat(16),
	hostNameHash: '2'.repeat(16),
	ipAddressHash: '3'.repeat(16),
	checks: {
		http: true,
		https: null,
		ssh: true,
		sshSkipped: false,
		httpSkipped: false,
	},
	failure: '',
}, null, 2)}\n`)

fs.writeFileSync(dnsHttpsEvidenceFile, `${JSON.stringify({
	version: 1,
	kind: 'payram-dns-https',
	createdAt: '2026-06-17T12:00:30.000Z',
	checkedAt: '2026-06-17T12:00:31.000Z',
	ok: true,
	dryRun: false,
	hostNameHash: '4'.repeat(16),
	expectedIpHash: '5'.repeat(16),
	resolvedIpHash: '6'.repeat(16),
	resolvedIpCount: 1,
	checks: {
		dnsResolved: true,
		expectedIpMatched: true,
		httpsHealth: true,
		tlsValidForHost: true,
		healthTextMatched: true,
	},
	failure: '',
}, null, 2)}\n`)

fs.writeFileSync(backupEvidenceFile, `${JSON.stringify({
	kind: 'payram-oci-backup-restore',
	ok: true,
	dryRun: false,
	createdAt: '2026-06-17T12:01:00.000Z',
	targetHash: '4'.repeat(16),
	hostVerified: true,
	keepDrillFiles: false,
	checks: {
		backupScriptExecutable: true,
		backupArchiveCreated: true,
		backupArchiveExtracted: true,
		restoreMarkerVerified: true,
		cleanupRequested: true,
	},
	archiveHash: '5'.repeat(16),
	markerHash: '6'.repeat(16),
}, null, 2)}\n`)

fs.writeFileSync(alarmsEvidenceFile, `${JSON.stringify({
	kind: 'payram-oci-alarms',
	ok: true,
	dryRun: false,
	createdAt: '2026-06-17T12:02:00.000Z',
	region: 'ap-tokyo-1',
	compartmentHash: '7'.repeat(16),
	instanceHash: '8'.repeat(16),
	topicHash: '9'.repeat(16),
	alertEmailHash: 'a'.repeat(16),
	subscription: {
		email: true,
		status: 'exists',
		ownerConfirmationMayBeRequired: false,
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
}, null, 2)}\n`)

fs.writeFileSync(payramEvidenceFile, `${JSON.stringify({
	ok: true,
	createdAt: '2026-06-17T12:00:00.000Z',
	payram: {
		referenceIdHash: 'e'.repeat(16),
		paymentUrlHash: 'f'.repeat(16),
		status: {
			referenceIdHash: 'e'.repeat(16),
			providerStatus: 'FILLED',
			state: 'paid',
			creditable: true,
		},
	},
	manualChecklist: [],
}, null, 2)}\n`)

fs.writeFileSync(forwarderEvidenceFile, `${JSON.stringify({
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
}, null, 2)}\n`)

fs.writeFileSync(forwarderCustodyFile, `${JSON.stringify({
	generatedAt: '2026-06-17T12:04:30.000Z',
	projectId: 'betterpptx-mcp-staging',
	saltSecretName: 'betterpptx-forwarder-salt-secret',
	sweeperKeySecretName: 'betterpptx-forwarder-sweeper-key',
	custodyPath: rawCustodyPath,
	saltSecretSha256: 'a'.repeat(64),
	sweeperAddress: '0x6666666666666666666666666666666666666666',
	encryptedCustodySha256: 'b'.repeat(64),
	custodyPlaintextSha256: 'c'.repeat(64),
	secretUploaded: true,
	dryRun: false,
	note: 'Encrypted custody file must stay offline/private.',
}, null, 2)}\n`)

fs.writeFileSync(forwarderReviewFile, `${JSON.stringify({
	kind: 'forwarder-review-decision',
	ok: true,
	dryRun: false,
	createdAt: '2026-06-17T12:05:30.000Z',
	ownerAccepted: true,
	cappedLiveValueCanaryAccepted: true,
	review: {
		decision: 'owner_accepted_no_external_review',
		externalReviewRequired: false,
		ownerAcceptedNoExternalReview: true,
	},
	evidenceHash: 'd'.repeat(16),
}, null, 2)}\n`)

process.env.BETTERPPTX_PAYRAM_OCI_HOST_EVIDENCE_FILE = hostEvidenceFile
process.env.BETTERPPTX_PAYRAM_DNS_HTTPS_EVIDENCE_FILE = dnsHttpsEvidenceFile
process.env.BETTERPPTX_PAYRAM_BACKUP_RESTORE_EVIDENCE_FILE = backupEvidenceFile
process.env.BETTERPPTX_PAYRAM_OCI_ALARMS_EVIDENCE_FILE = alarmsEvidenceFile
process.env.BETTERPPTX_PAYRAM_PHASE0_EVIDENCE_FILE = payramEvidenceFile
process.env.BETTERPPTX_FORWARDER_CUSTODY_EVIDENCE_FILE = forwarderCustodyFile
process.env.BETTERPPTX_FORWARDER_PROOF_EVIDENCE_FILE = forwarderEvidenceFile
process.env.BETTERPPTX_FORWARDER_REVIEW_EVIDENCE_FILE = forwarderReviewFile

const ready = buildMissionControlSnapshot({ accessMode: 'loopback' })
assert.equal(ready.paymentLaunchEvidence.publicEnableReady, true)
assert.equal(gate(ready, 'payment-public-enable-evidence').status, 'ok')
for (const item of ready.paymentLaunchEvidence.items) {
	assert.equal(item.status, 'ok', `Verified item should be ok: ${item.id}`)
	if (item.source === 'file') assert.match(item.evidenceHash, /^[0-9a-f]{16}$/)
}

const serialized = JSON.stringify(ready)
for (const forbidden of [
	rawPayramUrl,
	rawReference,
	'secret-token',
	rawForwarderAddress,
	rawSalt,
	rawFactory,
	rawCustodyPath,
	'ocid1.',
]) {
	assert(!serialized.includes(forbidden), `Mission Control payment evidence leaked raw proof material: ${forbidden}`)
}

process.env.BETTERPPTX_PAYRAM_PHASE0_EVIDENCE_FILE = path.join(dir, 'missing.json')
const unreadable = buildMissionControlSnapshot({ accessMode: 'loopback' })
const phase0 = unreadable.paymentLaunchEvidence.items.find(item => item.id === 'payram-phase0-live')
assert.equal(phase0.status, 'warn')
assert.match(phase0.detail, /could not be read|parsed/)

const weakPayramEvidenceFile = path.join(dir, 'weak-payram-phase0.json')
const weakHostEvidenceFile = path.join(dir, 'weak-payram-oci-host.json')
const weakDnsHttpsEvidenceFile = path.join(dir, 'weak-payram-dns-https.json')
const weakBackupEvidenceFile = path.join(dir, 'weak-payram-backup-restore.json')
const weakAlarmsEvidenceFile = path.join(dir, 'weak-payram-oci-alarms.json')
const weakCustodyEvidenceFile = path.join(dir, 'weak-forwarder-custody.json')
const weakForwarderEvidenceFile = path.join(dir, 'weak-forwarder-proof.json')
const weakForwarderReviewFile = path.join(dir, 'weak-forwarder-review.json')
fs.writeFileSync(weakHostEvidenceFile, `${JSON.stringify({
	version: 1,
	kind: 'payram-oci-host-bootstrap',
	label: 'capacity-watcher-http',
	createdAt: '2026-06-17T13:00:00.000Z',
	ok: true,
	hostBootstrapOk: false,
	httpOnlyOk: true,
	requireHttps: false,
	checks: {
		http: true,
		https: null,
		ssh: null,
		sshSkipped: true,
		httpSkipped: false,
	},
	failure: '',
}, null, 2)}\n`)
fs.writeFileSync(weakDnsHttpsEvidenceFile, `${JSON.stringify({
	version: 1,
	kind: 'payram-dns-https',
	createdAt: '2026-06-17T13:00:30.000Z',
	checkedAt: '2026-06-17T13:00:31.000Z',
	ok: true,
	dryRun: false,
	hostNameHash: '4'.repeat(16),
	expectedIpHash: '5'.repeat(16),
	resolvedIpHash: '6'.repeat(16),
	resolvedIpCount: 1,
	checks: {
		dnsResolved: true,
		expectedIpMatched: false,
		httpsHealth: false,
		tlsValidForHost: false,
		healthTextMatched: false,
	},
	failure: 'redacted DNS/HTTPS failure',
}, null, 2)}\n`)
fs.writeFileSync(weakPayramEvidenceFile, `${JSON.stringify({
	ok: true,
	createdAt: '2026-06-17T13:00:00.000Z',
	payram: {
		referenceId: rawReference,
		status: {
			referenceId: rawReference,
			providerStatus: 'OPEN',
			state: 'open',
			creditable: false,
		},
	},
	manualChecklist: ['Complete a small live payment.'],
}, null, 2)}\n`)
fs.writeFileSync(weakBackupEvidenceFile, `${JSON.stringify({
	kind: 'payram-oci-backup-restore',
	ok: true,
	dryRun: false,
	createdAt: '2026-06-17T13:01:00.000Z',
	targetHash: '4'.repeat(16),
	hostVerified: false,
	keepDrillFiles: true,
	checks: {
		backupScriptExecutable: true,
		backupArchiveCreated: true,
		backupArchiveExtracted: false,
		restoreMarkerVerified: false,
		cleanupRequested: false,
	},
	archiveHash: '5'.repeat(16),
	markerHash: '6'.repeat(16),
}, null, 2)}\n`)
fs.writeFileSync(weakAlarmsEvidenceFile, `${JSON.stringify({
	kind: 'payram-oci-alarms',
	ok: false,
	dryRun: true,
	createdAt: '2026-06-17T13:02:00.000Z',
	region: 'ap-tokyo-1',
	subscription: {
		email: true,
		status: 'dry_run',
		ownerConfirmationMayBeRequired: true,
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
}, null, 2)}\n`)
fs.writeFileSync(weakForwarderEvidenceFile, `${JSON.stringify({
	mode: 'verify-existing',
	proofComplete: true,
	receiptStatus: null,
	factoryAddress: rawFactory,
	predictedForwarderAddress: rawForwarderAddress,
	tokenAtomsAfter: '1000',
}, null, 2)}\n`)
fs.writeFileSync(weakCustodyEvidenceFile, `${JSON.stringify({
	generatedAt: '2026-06-17T13:05:00.000Z',
	saltSecretName: 'betterpptx-forwarder-salt-secret',
	sweeperKeySecretName: 'betterpptx-forwarder-sweeper-key',
	custodyPath: rawCustodyPath,
	saltSecretSha256: 'd'.repeat(64),
	sweeperAddress: '0x6666666666666666666666666666666666666666',
	encryptedCustodySha256: 'e'.repeat(64),
	custodyPlaintextSha256: 'f'.repeat(64),
	secretUploaded: false,
	dryRun: true,
}, null, 2)}\n`)
fs.writeFileSync(weakForwarderReviewFile, `${JSON.stringify({
	kind: 'forwarder-review-decision',
	ok: true,
	dryRun: false,
	createdAt: '2026-06-17T13:06:00.000Z',
	ownerAccepted: false,
	cappedLiveValueCanaryAccepted: true,
	review: {
		decision: 'owner_accepted_no_external_review',
		externalReviewRequired: false,
		ownerAcceptedNoExternalReview: false,
	},
}, null, 2)}\n`)
process.env.BETTERPPTX_PAYRAM_PHASE0_EVIDENCE_FILE = weakPayramEvidenceFile
process.env.BETTERPPTX_PAYRAM_OCI_HOST_EVIDENCE_FILE = weakHostEvidenceFile
process.env.BETTERPPTX_PAYRAM_DNS_HTTPS_EVIDENCE_FILE = weakDnsHttpsEvidenceFile
process.env.BETTERPPTX_PAYRAM_BACKUP_RESTORE_EVIDENCE_FILE = weakBackupEvidenceFile
process.env.BETTERPPTX_PAYRAM_OCI_ALARMS_EVIDENCE_FILE = weakAlarmsEvidenceFile
process.env.BETTERPPTX_FORWARDER_CUSTODY_EVIDENCE_FILE = weakCustodyEvidenceFile
process.env.BETTERPPTX_FORWARDER_PROOF_EVIDENCE_FILE = weakForwarderEvidenceFile
process.env.BETTERPPTX_FORWARDER_REVIEW_EVIDENCE_FILE = weakForwarderReviewFile
const weak = buildMissionControlSnapshot({ accessMode: 'loopback' })
assert.equal(weak.paymentLaunchEvidence.publicEnableReady, false)
assert.equal(weak.paymentLaunchEvidence.items.find(item => item.id === 'payram-oci-host').status, 'warn')
assert.equal(weak.paymentLaunchEvidence.items.find(item => item.id === 'payram-dns-https').status, 'warn')
assert.equal(weak.paymentLaunchEvidence.items.find(item => item.id === 'payram-backup-restore').status, 'warn')
assert.equal(weak.paymentLaunchEvidence.items.find(item => item.id === 'payram-oci-alarms').status, 'warn')
assert.equal(weak.paymentLaunchEvidence.items.find(item => item.id === 'payram-phase0-live').status, 'warn')
assert.equal(weak.paymentLaunchEvidence.items.find(item => item.id === 'forwarder-custody-backup').status, 'warn')
assert.equal(weak.paymentLaunchEvidence.items.find(item => item.id === 'forwarder-external-proof').status, 'warn')
assert.equal(weak.paymentLaunchEvidence.items.find(item => item.id === 'forwarder-owner-review').status, 'warn')
const weakSerialized = JSON.stringify(weak)
for (const forbidden of [rawReference, rawForwarderAddress, rawFactory, rawCustodyPath]) {
	assert(!weakSerialized.includes(forbidden), `Weak Mission Control evidence leaked raw proof material: ${forbidden}`)
}

for (const name of proofEnvNames) delete process.env[name]
process.env.BETTERPPTX_PAYRAM_OCI_HOST_VERIFIED_AT = 'done'
process.env.BETTERPPTX_PAYRAM_DNS_HTTPS_VERIFIED_AT = '2026-06-17T12:01:30.000Z'
process.env.BETTERPPTX_PAYRAM_BACKUP_RESTORE_VERIFIED_AT = '2026-06-17 12:02'
process.env.BETTERPPTX_PAYRAM_OCI_ALARMS_VERIFIED_AT = '2026-06-17T12:03:00.000Z'
process.env.BETTERPPTX_PAYRAM_PHASE0_VERIFIED_AT = '2026-06-17T12:04:00.000Z'
process.env.BETTERPPTX_FORWARDER_CUSTODY_VERIFIED_AT = '2026-06-17T12:05:00.000Z'
process.env.BETTERPPTX_FORWARDER_PROOF_VERIFIED_AT = '2026-06-17T12:06:00.000Z'
process.env.BETTERPPTX_FORWARDER_REVIEW_VERIFIED_AT = '2026-06-17T12:07:00.000Z'
const invalidStamp = buildMissionControlSnapshot({ accessMode: 'loopback' })
assert.equal(invalidStamp.paymentLaunchEvidence.publicEnableReady, false)
const invalidHost = invalidStamp.paymentLaunchEvidence.items.find(item => item.id === 'payram-oci-host')
const invalidBackup = invalidStamp.paymentLaunchEvidence.items.find(item => item.id === 'payram-backup-restore')
assert.equal(invalidHost.status, 'warn')
assert.equal(invalidBackup.status, 'warn')
assert.match(invalidHost.detail, /exact ISO timestamp/)
assert.match(invalidBackup.detail, /exact ISO timestamp/)
assert.equal(invalidStamp.paymentLaunchEvidence.items.find(item => item.id === 'payram-oci-alarms').status, 'ok')
assert.equal(invalidStamp.paymentLaunchEvidence.items.find(item => item.id === 'payram-dns-https').status, 'ok')
assert.equal(invalidStamp.paymentLaunchEvidence.items.find(item => item.id === 'payram-phase0-live').status, 'ok')
assert.equal(invalidStamp.paymentLaunchEvidence.items.find(item => item.id === 'forwarder-custody-backup').status, 'ok')
assert.equal(invalidStamp.paymentLaunchEvidence.items.find(item => item.id === 'forwarder-external-proof').status, 'ok')
assert.equal(invalidStamp.paymentLaunchEvidence.items.find(item => item.id === 'forwarder-owner-review').status, 'ok')

console.log('MISSION CONTROL PAYMENT EVIDENCE: PASS missing=1 ready=1 redacted=1 unreadable=1 weakRejected=1 custodyRejected=1 invalidStampRejected=1')
