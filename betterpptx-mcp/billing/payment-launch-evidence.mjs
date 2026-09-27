import { createHash } from 'node:crypto'
import * as fs from 'node:fs'

function hashText(value) {
	return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16)
}

function readEvidenceJson(envName, env = process.env) {
	const file = String(env[envName] || '').trim()
	if (!file) return { configured: false, source: null }
	try {
		const text = fs.readFileSync(file, 'utf8')
		return {
			configured: true,
			source: 'file',
			fileHash: hashText(text),
			data: JSON.parse(text),
		}
	} catch (error) {
		return {
			configured: true,
			source: 'file',
			error: error?.code || 'EVIDENCE_READ_FAILED',
		}
	}
}

function explicitIsoStamp(name, env = process.env) {
	const value = String(env[name] || '').trim()
	if (!value) return null
	const parsed = Date.parse(value)
	if (!Number.isFinite(parsed)) return { value, valid: false }
	return {
		value,
		valid: new Date(parsed).toISOString() === value,
	}
}

function evidenceGate({ id, name, stampEnv, evidenceEnv, okFromEvidence, missingText, detailFromEvidence }, env = process.env) {
	const stamp = explicitIsoStamp(stampEnv, env)
	const evidence = evidenceEnv ? readEvidenceJson(evidenceEnv, env) : { configured: false }
	if (stamp) {
		if (!stamp.valid) {
			return {
				id,
				name,
				status: 'warn',
				source: 'owner-stamp',
				detail: `Owner proof stamp ${stampEnv} must be an exact ISO timestamp such as 2026-06-17T12:00:00.000Z.`,
			}
		}
		return {
			id,
			name,
			status: 'ok',
			verifiedAt: stamp.value,
			source: 'owner-stamp',
			detail: `Verified at ${stamp.value}.`,
		}
	}
	if (evidence.configured) {
		if (evidence.error) {
			return {
				id,
				name,
				status: 'warn',
				source: evidence.source,
				evidenceHash: evidence.fileHash || null,
				detail: `Evidence file is configured but could not be read or parsed (${evidence.error}).`,
			}
		}
		const ok = okFromEvidence(evidence.data)
		return {
			id,
			name,
			status: ok ? 'ok' : 'warn',
			source: evidence.source,
			evidenceHash: evidence.fileHash,
			verifiedAt: evidence.data?.createdAt || evidence.data?.checkedAt || null,
			detail: ok ? detailFromEvidence(evidence.data) : missingText,
		}
	}
	return {
		id,
		name,
		status: 'deferred',
		source: 'none',
		detail: missingText,
	}
}

function payramPhase0EvidenceOk(data) {
	const status = data?.payram?.status || {}
	const providerStatus = String(status.providerStatus || '').trim().toUpperCase()
	const manualChecklist = Array.isArray(data?.manualChecklist) ? data.manualChecklist : []
	const hasReferenceProof = Boolean(status.referenceIdHash || data?.payram?.referenceIdHash || status.referenceId || data?.payram?.referenceId)
	return data?.ok === true &&
		status.creditable === true &&
		status.state === 'paid' &&
		(providerStatus === 'FILLED' || providerStatus === 'OVER_FILLED') &&
		hasReferenceProof &&
		manualChecklist.length === 0
}

function payramOciHostEvidenceOk(data) {
	return data?.kind === 'payram-oci-host-bootstrap' &&
		data?.ok === true &&
		data?.hostBootstrapOk === true &&
		data?.checks?.http === true &&
		data?.checks?.ssh === true &&
		data?.checks?.sshSkipped === false
}

function payramDnsHttpsEvidenceOk(data) {
	const hostNameHash = String(data?.hostNameHash || '').trim().toLowerCase()
	const resolvedIpHash = String(data?.resolvedIpHash || '').trim().toLowerCase()
	const expectedIpHash = String(data?.expectedIpHash || '').trim().toLowerCase()
	const expectedIpOk = !expectedIpHash || data?.checks?.expectedIpMatched === true
	return data?.kind === 'payram-dns-https' &&
		data?.ok === true &&
		data?.dryRun === false &&
		data?.checks?.dnsResolved === true &&
		data?.checks?.httpsHealth === true &&
		data?.checks?.tlsValidForHost === true &&
		data?.checks?.healthTextMatched === true &&
		expectedIpOk &&
		/^[0-9a-f]{16}$/.test(hostNameHash) &&
		/^[0-9a-f]{16}$/.test(resolvedIpHash)
}

function payramBackupRestoreEvidenceOk(data) {
	const archiveHash = String(data?.archiveHash || '').trim().toLowerCase()
	const markerHash = String(data?.markerHash || '').trim().toLowerCase()
	return data?.kind === 'payram-oci-backup-restore' &&
		data?.ok === true &&
		data?.dryRun === false &&
		data?.hostVerified === true &&
		data?.keepDrillFiles === false &&
		data?.checks?.backupScriptExecutable === true &&
		data?.checks?.backupArchiveCreated === true &&
		data?.checks?.backupArchiveExtracted === true &&
		data?.checks?.restoreMarkerVerified === true &&
		data?.checks?.cleanupRequested === true &&
		/^[0-9a-f]{16}$/.test(archiveHash) &&
		/^[0-9a-f]{16}$/.test(markerHash)
}

function payramOciAlarmsEvidenceOk(data) {
	const validAlarmStatus = value => value === 'created' || value === 'exists'
	return data?.kind === 'payram-oci-alarms' &&
		data?.ok === true &&
		data?.dryRun === false &&
		data?.subscription?.email === true &&
		data?.subscription?.ownerConfirmedReady === true &&
		validAlarmStatus(data?.subscription?.status) &&
		validAlarmStatus(data?.alarms?.cpuHigh) &&
		validAlarmStatus(data?.alarms?.memoryHigh) &&
		validAlarmStatus(data?.alarms?.filesystemHigh) &&
		data?.checks?.topicEnsured === true &&
		data?.checks?.emailSubscriptionEnsured === true &&
		data?.checks?.cpuAlarmEnsured === true &&
		data?.checks?.memoryAlarmEnsured === true &&
		data?.checks?.filesystemAlarmEnsured === true
}

function forwarderProofEvidenceOk(data) {
	const hashOk = value => /^[0-9a-f]{64}$/.test(String(value || '').trim().toLowerCase())
	const integerStringOk = value => /^[0-9]+$/.test(String(value || '').trim())
	const sepolia = data?.baseSepolia || {}
	const mainnet = data?.baseMainnetCanary || {}
	return data?.kind === 'forwarder-external-proof-bundle' &&
		data?.ok === true &&
		data?.dryRun === false &&
		data?.proofComplete === true &&
		sepolia.chainId === 84532 &&
		sepolia.mode === 'sweep-proof' &&
		sepolia.receiptStatus === 'success' &&
		sepolia.tokenAtomsAfter === '0' &&
		hashOk(sepolia.evidenceSha256) &&
		hashOk(sepolia.predictedForwarderAddressSha256) &&
		hashOk(sepolia.sweepTxSha256) &&
		hashOk(sepolia.tokenAtomsBeforeSha256) &&
		mainnet.chainId === 8453 &&
		mainnet.mode === 'sweep-proof' &&
		mainnet.receiptStatus === 'success' &&
		mainnet.cappedLiveValueCanary === true &&
		mainnet.tokenAtomsAfter === '0' &&
		integerStringOk(mainnet.maxCanaryAtoms) &&
		hashOk(mainnet.evidenceSha256) &&
		hashOk(mainnet.predictedForwarderAddressSha256) &&
		hashOk(mainnet.sweepTxSha256) &&
		hashOk(mainnet.tokenAtomsBeforeSha256)
}

function forwarderCustodyEvidenceOk(data) {
	const saltHash = String(data?.saltSecretSha256 || '').trim().toLowerCase()
	const encryptedHash = String(data?.encryptedCustodySha256 || '').trim().toLowerCase()
	const plaintextHash = String(data?.custodyPlaintextSha256 || '').trim().toLowerCase()
	const sweeperAddress = String(data?.sweeperAddress || '').trim()
	return data?.secretUploaded === true &&
		data?.dryRun === false &&
		String(data?.saltSecretName || '') === 'betterpptx-forwarder-salt-secret' &&
		String(data?.sweeperKeySecretName || '') === 'betterpptx-forwarder-sweeper-key' &&
		/^[0-9a-f]{64}$/.test(saltHash) &&
		/^[0-9a-f]{64}$/.test(encryptedHash) &&
		/^[0-9a-f]{64}$/.test(plaintextHash) &&
		/^0x[0-9a-fA-F]{40}$/.test(sweeperAddress)
}

function forwarderReviewEvidenceOk(data) {
	const decision = String(data?.review?.decision || data?.decision || '').trim()
	const externalCompleted = data?.review?.externalReviewCompleted === true || data?.externalReviewCompleted === true
	const externalRequired = data?.review?.externalReviewRequired === true || data?.externalReviewRequired === true
	const ownerAcceptedNoExternal = data?.review?.ownerAcceptedNoExternalReview === true || data?.ownerAcceptedNoExternalReview === true
	return data?.kind === 'forwarder-review-decision' &&
		data?.ok === true &&
		data?.dryRun === false &&
		data?.ownerAccepted === true &&
		data?.cappedLiveValueCanaryAccepted === true &&
		(
			(decision === 'external_review_completed' && externalCompleted) ||
			(decision === 'owner_accepted_no_external_review' && externalRequired === false && ownerAcceptedNoExternal)
		)
}

export function buildPaymentLaunchEvidence(env = process.env) {
	const payramPhase0 = evidenceGate({
		id: 'payram-phase0-live',
		name: 'PayRam live Phase 0 proof',
		stampEnv: 'BETTERPPTX_PAYRAM_PHASE0_VERIFIED_AT',
		evidenceEnv: 'BETTERPPTX_PAYRAM_PHASE0_EVIDENCE_FILE',
		missingText: 'Run verify-payram-phase0-live.mjs after the OCI PayRam host is installed and a small live/onramp proof exists.',
		okFromEvidence: payramPhase0EvidenceOk,
		detailFromEvidence: data => `PayRam status ${data?.payram?.status?.providerStatus || 'unknown'} was creditable; evidence hash recorded.`,
	}, env)
	const forwarderProof = evidenceGate({
		id: 'forwarder-external-proof',
		name: 'CREATE2 forwarder external proof',
		stampEnv: 'BETTERPPTX_FORWARDER_PROOF_VERIFIED_AT',
		evidenceEnv: 'BETTERPPTX_FORWARDER_PROOF_EVIDENCE_FILE',
		missingText: 'Run deploy/run-betterpptx-forwarder-proof.mjs on Base Sepolia and capped Base mainnet canary before public raw-send forwarders.',
		okFromEvidence: forwarderProofEvidenceOk,
		detailFromEvidence: data => `Forwarder proof bundle recorded Base Sepolia and capped Base mainnet canary evidence; evidence hash recorded.`,
	}, env)
	const forwarderCustody = evidenceGate({
		id: 'forwarder-custody-backup',
		name: 'CREATE2 forwarder salt custody backup',
		stampEnv: 'BETTERPPTX_FORWARDER_CUSTODY_VERIFIED_AT',
		evidenceEnv: 'BETTERPPTX_FORWARDER_CUSTODY_EVIDENCE_FILE',
		missingText: 'Record the encrypted forwarder custody manifest from create-betterpptx-forwarder-secrets.ps1 for the active salt/sweeper secrets before public raw-send forwarders.',
		okFromEvidence: forwarderCustodyEvidenceOk,
		detailFromEvidence: () => 'Encrypted forwarder salt custody manifest is recorded; evidence hash recorded.',
	}, env)
	const forwarderReview = evidenceGate({
		id: 'forwarder-owner-review',
		name: 'CREATE2 forwarder owner review decision',
		stampEnv: 'BETTERPPTX_FORWARDER_REVIEW_VERIFIED_AT',
		evidenceEnv: 'BETTERPPTX_FORWARDER_REVIEW_EVIDENCE_FILE',
		missingText: 'Record the owner review or focused external review decision before public raw-send forwarders.',
		okFromEvidence: forwarderReviewEvidenceOk,
		detailFromEvidence: data => `Forwarder review decision ${data?.review?.decision || data?.decision || 'recorded'} is recorded; evidence hash recorded.`,
	}, env)
	const items = [
		evidenceGate({
			id: 'payram-oci-host',
			name: 'PayRam OCI host bootstrap',
			stampEnv: 'BETTERPPTX_PAYRAM_OCI_HOST_VERIFIED_AT',
			evidenceEnv: 'BETTERPPTX_PAYRAM_OCI_HOST_EVIDENCE_FILE',
			missingText: 'Run verify-payram-oci-host.ps1 after OCI A1 capacity provisions the host.',
			okFromEvidence: payramOciHostEvidenceOk,
			detailFromEvidence: () => 'PayRam OCI host bootstrap passed HTTP and SSH checks; evidence hash recorded.',
		}, env),
		evidenceGate({
			id: 'payram-dns-https',
			name: 'PayRam public DNS and HTTPS',
			stampEnv: 'BETTERPPTX_PAYRAM_DNS_HTTPS_VERIFIED_AT',
			evidenceEnv: 'BETTERPPTX_PAYRAM_DNS_HTTPS_EVIDENCE_FILE',
			missingText: 'Run verify-payram-dns-https.ps1 after final DNS, TLS, and the public PayRam health endpoint are ready.',
			okFromEvidence: payramDnsHttpsEvidenceOk,
			detailFromEvidence: data => `PayRam public HTTPS health passed for ${data?.resolvedIpCount || 0} resolved A record(s); evidence hash recorded.`,
		}, env),
		evidenceGate({
			id: 'payram-backup-restore',
			name: 'PayRam backup/restore drill',
			stampEnv: 'BETTERPPTX_PAYRAM_BACKUP_RESTORE_VERIFIED_AT',
			evidenceEnv: 'BETTERPPTX_PAYRAM_BACKUP_RESTORE_EVIDENCE_FILE',
			missingText: 'Run verify-payram-oci-backup-restore.ps1 before public card enablement.',
			okFromEvidence: payramBackupRestoreEvidenceOk,
			detailFromEvidence: () => 'PayRam backup/restore drill passed with host verification; evidence hash recorded.',
		}, env),
		evidenceGate({
			id: 'payram-oci-alarms',
			name: 'PayRam OCI alarms',
			stampEnv: 'BETTERPPTX_PAYRAM_OCI_ALARMS_VERIFIED_AT',
			evidenceEnv: 'BETTERPPTX_PAYRAM_OCI_ALARMS_EVIDENCE_FILE',
			missingText: 'Run configure-payram-oci-alarms.ps1 and confirm the OCI email subscription if required.',
			okFromEvidence: payramOciAlarmsEvidenceOk,
			detailFromEvidence: () => 'PayRam OCI alarms and owner alert email readiness are recorded; evidence hash recorded.',
		}, env),
		payramPhase0,
		forwarderCustody,
		forwarderProof,
		forwarderReview,
	]
	return {
		publicEnableReady: items.every(item => item.status === 'ok'),
		items,
	}
}

export function paymentPublicEnableReady(env = process.env) {
	return buildPaymentLaunchEvidence(env).publicEnableReady === true
}
