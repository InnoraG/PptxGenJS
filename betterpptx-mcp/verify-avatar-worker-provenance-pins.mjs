#!/usr/bin/env node
// Maintainer-only, fail-closed evidence check for the private avatar worker.
// It records reproducibility gaps; it is not a license approval or SBOM.
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const root = path.resolve('betterpptx-mcp')
const lockPath = path.join(root, 'avatar', 'model-provenance-lock.json')
const outputPath = path.join(root, 'outputs', 'avatar-worker-provenance-pins-report.json')
const sbomPath = path.join(root, 'outputs', 'avatar-worker-sbom.cdx.json')
const licensePacketPath = path.join(root, 'outputs', 'avatar-license-review-packet.json')
const ownerApprovalPath = path.join(root, 'docs', 'release-safety', 'AVATAR-LICENSE-OWNER-APPROVAL-2026-07-19.json')
const defaultSource = path.resolve('..', 'PptxGenJS_Claude_betterpptx_mcp_metrology', 'avatar-metrology', 'modal_avatar_endpoint.py')
const detectorAdapterPath = path.resolve('..', 'PptxGenJS_Claude_betterpptx_mcp_metrology', 'avatar-metrology', 'liveportrait_commercial_face_analysis.py')
const sourcePath = process.env.BETTERPPTX_AVATAR_WORKER_SOURCE || defaultSource

const [lock, sbom, licensePacket, ownerApproval] = await Promise.all([
	fs.readFile(lockPath, 'utf8').then(JSON.parse),
	fs.readFile(sbomPath, 'utf8').then(JSON.parse).catch(() => null),
	fs.readFile(licensePacketPath, 'utf8').then(JSON.parse).catch(() => null),
	fs.readFile(ownerApprovalPath, 'utf8').then(JSON.parse).catch(() => null),
])
const source = await fs.readFile(sourcePath, 'utf8').catch(() => '')
const detectorAdapter = await fs.readFile(detectorAdapterPath, 'utf8').catch(() => '')
const sourceSha256 = crypto.createHash('sha256').update(source).digest('hex')
const detectorAdapterSha256 = crypto.createHash('sha256').update(detectorAdapter).digest('hex')
const floatingGit = /git\s+clone\s+--depth\s+1\s+https?:\/\//i.test(source)
const floatingHf = /hf\s+download\s+(?![^\n]*--revision\b)[^\n]+/i.test(source)
const revisionPinned = value => /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(String(value || ''))
const hashPinned = value => /^[0-9a-f]{64}$/.test(String(value || ''))
const requiredFields = lock.modelArtifacts.every(item => {
	const files = Array.isArray(item.files) && item.files.length ? item.files : [{ sha256: item.sha256 }]
	return /^[a-z0-9][a-z0-9-]+$/.test(String(item.id || '')) &&
		String(item.source || '').length > 0 && revisionPinned(item.revision) &&
		hashPinned(item.sha256) && files.every(file => hashPinned(file?.sha256))
})
const repoPins = lock.sourceRepositories.every(item =>
	/^https:\/\/github\.com\//.test(String(item.repository || '')) &&
	/^[0-9a-f]{40}$/.test(String(item.observedHead || '')) &&
	item.pinRequiredInWorkerBuild === true
)
const sbomGenerated = sbom?.bomFormat === 'CycloneDX' &&
	['1.4', '1.5', '1.6'].includes(String(sbom?.specVersion || '')) &&
	Array.isArray(sbom?.components) && sbom.components.length >= lock.modelArtifacts.length &&
	sbom?.properties?.some(item => item.name === 'evidenceStatus' && item.value === 'generated-review-required')
const sbomReviewed = sbom?.properties?.some(item => item.name === 'evidenceStatus' && item.value === 'reviewed') === true
const sbomSourceSha256 = sbom?.components?.find(component => component?.['bom-ref'] === 'betterpptx-avatar-worker')?.properties?.find(item => item.name === 'workerSourceSha256')?.value || ''
const sbomSourceMatchesCurrent = Boolean(sourceSha256) && sbomSourceSha256 === sourceSha256
const licensePacketGenerated = licensePacket?.status === 'OWNER_LEGAL_REVIEW_REQUIRED' &&
	Number(licensePacket?.technicalEvidence?.sbomComponentCount || 0) >= lock.modelArtifacts.length &&
	licensePacket?.publicEnablement?.allowed === false
const ownerApprovalRecorded = ownerApproval?.status === 'RECORDED_WITH_CONDITIONS' &&
	ownerApproval?.publicEnablementAllowed === false &&
	String(ownerApproval?.scope || '').includes('LivePortrait+MuseTalk')
const yunetArtifact = lock.modelArtifacts.find(item => item.id === 'yunet-face-detector')
const insightfaceFiles = lock.modelArtifacts.flatMap(item => item.files || []).filter(file => /insightface/i.test(String(file?.path || '')))
const detectorReplacementVerified = Boolean(yunetArtifact) && hashPinned(yunetArtifact.sha256) &&
	/^https:\/\/github\.com\/opencv\/opencv_zoo\/tree\/[0-9a-f]{40}\//.test(String(yunetArtifact.source || '')) &&
	insightfaceFiles.length === 0 && detectorAdapter.includes('cv2.FaceDetectorYN') &&
	!/from\s+.*insightface|FaceAnalysis\s*\(/i.test(detectorAdapter)
const checks = [
	{ id: 'lock-schema', status: lock.schemaVersion === 'betterpptx.avatar-model-provenance-lock.v1' ? 'PASS' : 'BLOCKED' },
	{ id: 'source-repositories-recorded', status: repoPins ? 'PASS' : 'BLOCKED' },
	{ id: 'worker-source-present', status: source ? 'PASS' : 'BLOCKED' },
	{ id: 'worker-git-commits-immutable', status: source && !floatingGit ? 'PASS' : 'BLOCKED' },
	{ id: 'worker-model-revisions-immutable', status: source && !floatingHf ? 'PASS' : 'BLOCKED' },
	{ id: 'weight-hashes-recorded', status: requiredFields ? 'PASS' : 'BLOCKED' },
	{ id: 'sbom-requirement-recorded', status: lock.requirements?.sbomRequired === true ? 'PASS' : 'BLOCKED' },
	{ id: 'sbom-generated', status: sbomGenerated ? 'PASS' : 'BLOCKED' },
	{ id: 'sbom-source-matches-current-worker', status: sbomSourceMatchesCurrent ? 'PASS' : 'BLOCKED' },
	{ id: 'license-review-packet-generated', status: licensePacketGenerated ? 'PASS' : 'BLOCKED' },
	{ id: 'owner-approval-recorded', status: ownerApprovalRecorded ? 'PASS' : 'BLOCKED' },
	{ id: 'commercial-face-detector-replacement', status: detectorReplacementVerified ? 'PASS' : 'BLOCKED' },
	{ id: 'sbom-reviewed', status: sbomReviewed ? 'PASS' : 'BLOCKED' },
]
const blockers = checks.filter(check => check.status !== 'PASS').map(check => check.id)
const missingArtifactRevisions = lock.modelArtifacts.filter(item => !revisionPinned(item.revision)).map(item => item.id)
const missingArtifactPins = lock.modelArtifacts.filter(item => !revisionPinned(item.revision) || !hashPinned(item.sha256) || (Array.isArray(item.files) && item.files.some(file => !hashPinned(file?.sha256)))).map(item => item.id)
const report = {
	schemaVersion: 'betterpptx.avatar-worker-provenance-pins-report.v1',
	status: blockers.length ? 'BLOCKED' : 'PASS',
	checks,
	blockers,
	missingArtifactRevisions,
	missingArtifactPins,
	sbom: {
		path: 'outputs/avatar-worker-sbom.cdx.json',
		generated: sbomGenerated,
		reviewed: sbomReviewed,
		componentCount: Array.isArray(sbom?.components) ? sbom.components.length : 0,
		workerSourceSha256: sourceSha256 || null,
		sbomSourceSha256: sbomSourceSha256 || null,
		sourceMatchesCurrent: sbomSourceMatchesCurrent,
	},
	licenseReviewPacket: {
		path: 'outputs/avatar-license-review-packet.json',
		generated: licensePacketGenerated,
		status: String(licensePacket?.status || 'missing'),
	},
	ownerApproval: {
		recorded: ownerApprovalRecorded,
		status: String(ownerApproval?.status || 'missing'),
		artifact: 'betterpptx-mcp/docs/release-safety/AVATAR-LICENSE-OWNER-APPROVAL-2026-07-19.json',
		publicEnablementAllowed: ownerApproval?.publicEnablementAllowed === true,
	},
	detectorReplacement: {
		verified: detectorReplacementVerified,
		adapterPath: 'avatar-metrology/liveportrait_commercial_face_analysis.py',
		adapterSha256: detectorAdapterSha256 || null,
		modelArtifact: yunetArtifact?.id || null,
		insightfaceFileCountInLock: insightfaceFiles.length,
	},
	observedSourceRepositoryCount: lock.sourceRepositories.length,
	modelArtifactCount: lock.modelArtifacts.length,
	floatingDownloadPatterns: { gitCloneDepth1: floatingGit, huggingFaceWithoutRevision: floatingHf },
	legalClearanceClaimed: false,
	mutationsPerformed: false,
}
await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (blockers.length) process.exitCode = 2
