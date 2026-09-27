#!/usr/bin/env node
// Validate that the talking-head identity/lip-sync review packet is complete
// and ready for the authorized one-time owner review. This verifier never
// fills or infers the decision.
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('betterpptx-mcp')
const packetPath = path.join(root, 'outputs/avatar-identity-quality-review-packet.json')
const packet = JSON.parse(await fs.readFile(packetPath, 'utf8'))
const visualPacketPath = path.join(root, 'outputs/visualizations/avatar-lpmt-identity-review.html')
const visualPacketHtml = await fs.readFile(visualPacketPath, 'utf8').catch(() => '')
const evidencePaths = [
	packet.evidence?.contactSheet,
	packet.evidence?.sourcePortrait,
	packet.evidence?.fixture,
	...(packet.evidence?.talkingHeadCandidates || []),
	...(packet.evidence?.promotedProductionCanaries || []).map(item => item.path),
	packet.evidence?.powerPointArtifact,
]
const evidencePresent = (await Promise.all(evidencePaths.map(async value => Boolean(value) && fs.access(value).then(() => true).catch(() => false)))).every(Boolean)
const reviewer = packet.reviewProtocol?.reviewer || {}
const reviewerBlank = !reviewer.name && !reviewer.organization && !reviewer.reviewedAt && !reviewer.signatureRef
const criteriaReady = Array.isArray(packet.reviewProtocol?.acceptanceCriteria) && packet.reviewProtocol.acceptanceCriteria.length >= 4
const inspectListReady = Array.isArray(packet.reviewProtocol?.mustInspect) && packet.reviewProtocol.mustInspect.length >= 5
const ownerReviewConfigured = packet.reviewProtocol?.independentReviewerRequired === false
	&& packet.reviewProtocol?.ownerOneTimeReviewAllowed === true
	&& packet.reviewProtocol?.reviewAuthority === 'owner-one-time'
const visualPacketSelfContained = visualPacketHtml.includes('data:video/')
	&& visualPacketHtml.includes('data:image/')
	&& !/(?:src|poster)="(?!data:|#)[^"]+"/i.test(visualPacketHtml)
	&& (visualPacketHtml.match(/<video\b/gi) || []).length >= 5
const checks = [
	{ id: 'packet-schema', status: packet.schemaVersion === 'betterpptx.avatar-identity-quality-review-packet.v1' },
	{ id: 'owner-review-authority-configured', status: ownerReviewConfigured },
	{ id: 'owner-decision-open', status: reviewerBlank && packet.reviewProtocol?.decision === 'OPEN' },
	{ id: 'evidence-present', status: evidencePresent },
	{ id: 'acceptance-criteria', status: criteriaReady },
	{ id: 'inspection-rubric', status: inspectListReady },
	{ id: 'visual-packet-self-contained', status: visualPacketSelfContained },
	{ id: 'powerpoint-open-evidence', status: packet.evidence?.powerPointOpen === true },
	{ id: 'no-customer-data', status: packet.customerData === false && packet.training === false },
]
const report = {
	schemaVersion: 'betterpptx.avatar-identity-review-readiness.v1',
	scope: 'engineering-owned input quality plus upstream commercial LivePortrait/InsightFace + MuseTalk/BiSeNet talking-head QA; no biometric matching; resale-safe YuNet/MediaPipe is tracked separately; native 3D likeness is a separate Meshy → Mixamo gate',
	status: checks.every(check => check.status) ? 'READY_FOR_OWNER_REVIEW' : 'BLOCKED_PACKET_INCOMPLETE',
	checks,
	servingRevision: packet.evidence?.servingRevision || null,
	productionPipeline: packet.evidence?.productionPipeline || null,
	promotedCanariesEmbedded: Array.isArray(packet.evidence?.promotedProductionCanaries) ? packet.evidence.promotedProductionCanaries.length : 0,
	reviewerDecision: packet.reviewProtocol?.decision || null,
	ownerAction: 'The authorized project owner must inspect the linked visual packet once, record name/organization/date/evidence references, and explicitly choose PASS or FAIL. The verifier will not infer that decision.',
	publicEnablementAllowed: false,
}
await fs.writeFile(path.join(root, 'outputs/avatar-identity-review-readiness-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'READY_FOR_INDEPENDENT_REVIEW') process.exitCode = 2
