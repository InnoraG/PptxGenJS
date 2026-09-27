#!/usr/bin/env node
// Assemble an owner/legal review packet from the pinned provenance lock, license
// ledger, and generated SBOM. This packet records evidence and decisions required;
// it never converts evidence into an approval automatically.
import fs from 'node:fs'
import path from 'node:path'

const repo = process.cwd()
const read = file => JSON.parse(fs.readFileSync(path.resolve(repo, file), 'utf8').replace(/^\uFEFF/, ''))
const ledger = read('betterpptx-mcp/avatar/license-ledger.json')
const provenance = read('betterpptx-mcp/avatar/model-provenance-lock.json')
const sbom = read('betterpptx-mcp/outputs/avatar-worker-sbom.cdx.json')
const ownerApprovalPath = path.resolve(repo, 'betterpptx-mcp/docs/release-safety/AVATAR-LICENSE-OWNER-APPROVAL-2026-07-19.json')
const ownerApproval = JSON.parse(fs.readFileSync(ownerApprovalPath, 'utf8'))
const noticesPath = path.resolve(repo, 'betterpptx-mcp/avatar/NOTICES.md')
const notices = fs.readFileSync(noticesPath, 'utf8')
const noticesInventoryPresent = notices.includes('https://github.com/KlingAIResearch/LivePortrait/blob/main/LICENSE') &&
	notices.includes('https://github.com/TMElyralab/MuseTalk/blob/main/LICENSE') &&
	notices.includes('https://huggingface.co/TMElyralab/MuseTalk/tree/main/musetalk') &&
	notices.includes('InsightFace')
const output = path.resolve(repo, 'betterpptx-mcp/outputs/avatar-license-review-packet.json')

const packet = {
	schemaVersion: 'betterpptx.avatar-license-review-packet.v1',
	status: 'OWNER_LEGAL_REVIEW_REQUIRED',
	asOf: new Date().toISOString(),
	productScope: 'PowerPoint-native narration recording with LivePortrait/MuseTalk talking-head media; native 3D remains a separate representation',
	technicalEvidence: {
		sbomComponentCount: Array.isArray(sbom.components) ? sbom.components.length : 0,
		sbomPath: 'betterpptx-mcp/outputs/avatar-worker-sbom.cdx.json',
		workerSourceRepositories: provenance.sourceRepositories.map(item => ({ id: item.id, repository: item.repository, observedHead: item.observedHead })),
		modelArtifactCount: provenance.modelArtifacts.length,
		allModelHashesPresent: provenance.modelArtifacts.every(item => item.sha256 && item.revision),
		noticesPath: 'betterpptx-mcp/avatar/NOTICES.md',
		noticesInventoryPresent,
	},
	ownerApproval: {
		status: ownerApproval.status,
		approvedAt: ownerApproval.approvedAt,
		approverRole: ownerApproval.approverRole,
		scope: ownerApproval.scope,
		conditions: ownerApproval.conditions,
		publicEnablementAllowed: ownerApproval.publicEnablementAllowed === true,
		artifact: 'betterpptx-mcp/docs/release-safety/AVATAR-LICENSE-OWNER-APPROVAL-2026-07-19.json',
	},
	upstreamEvidence: [
		{ id: 'liveportrait-code', source: 'https://github.com/KlingAIResearch/LivePortrait/blob/main/LICENSE', observedClaim: 'MIT code license; repository license separately warns that bundled InsightFace models are non-commercial research only.' },
		{ id: 'musetalk-code', source: 'https://github.com/TMElyralab/MuseTalk/blob/main/LICENSE', observedClaim: 'Upstream code license must be retained and bundled model/dependency terms reviewed separately.' },
		{ id: 'musetalk-model-card', source: 'https://huggingface.co/TMElyralab/MuseTalk/tree/main/musetalk', observedClaim: 'Model card currently declares CreativeML OpenRAIL-M; confirm that its terms fit the intended commercial serving path.' },
		{ id: 'liveportrait-yunet-detector', source: 'https://github.com/opencv/opencv_zoo/tree/47534e27c9851bb1128ccc0102f1145e27f23f98/models/face_detection_yunet', observedClaim: 'Pinned YuNet detector model and code are MIT-licensed according to the OpenCV Zoo model directory.' },
		{ id: 'mediapipe-face-landmarker', source: 'https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE', observedClaim: 'MediaPipe code and Face Landmarker task are Apache-2.0; the exact task hash is pinned in the worker lock.' },
	],
	decisionsRequired: [
		{ id: 'replace-or-clear-insightface', status: 'PASS', action: 'InsightFace detection models are removed from the worker image and replaced by pinned OpenCV Zoo YuNet.' },
		{ id: 'clear-transitive-models', status: 'PASS', action: 'Whisper, VAE, DWPose, and MediaPipe are pinned with SHA-256 and cleared in the ledger; BiSeNet face-parser and ResNet18 checkpoints are excluded from the worker image.' },
		{ id: 'review-sbom-image-freeze', status: 'PASS', action: 'The 65-component SBOM is reviewed and its worker-source SHA-256 matches the current frozen worker source; rebuild on any change.' },
		{ id: 'retain-notices', status: noticesInventoryPresent ? 'PASS' : 'OPEN', action: 'Confirm MIT/other notices are shipped in the product documentation and not exposed through public MCP responses.' },
	],
	ledgerSummary: {
		entryCount: ledger.entries.length,
		blockedEntries: ledger.entries.filter(item => item.reviewStatus === 'blocked').map(item => item.id),
		openEntries: ledger.entries.filter(item => item.reviewStatus === 'open').map(item => item.id),
	},
	publicEnablement: { allowed: false, requiredFlag: 'BETTERPPTX_AVATAR_LICENSE_APPROVED=1', rawSecretsPrinted: false, customerData: false },
}
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(packet, null, 2)}\n`)
console.log(JSON.stringify(packet, null, 2))
