#!/usr/bin/env node
// Build a maintainer-only sign-off packet for the talking-head quality gate.
// This packet organizes evidence and acceptance criteria; it never fabricates a visual
// score or converts an automated similarity metric into approval.
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('betterpptx-mcp')
const reportPath = path.join(root, 'outputs', 'avatar-identity-continuity-report.json')
const outputPath = path.join(root, 'outputs', 'avatar-identity-quality-review-packet.json')
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))

const packet = {
	schemaVersion: 'betterpptx.avatar-identity-quality-review-packet.v1',
	status: 'OWNER_SIGNOFF_REQUIRED',
	scope: 'synthetic-commercial-talking-head-private-research',
	publicEnablementAllowed: false,
	identity: report.identity,
	evidence: {
		contactSheet: report.evidence?.contactSheet || null,
		fixture: report.evidence?.fixture || null,
		pptxDigest: report.canary?.pptxDigest || null,
		videoFrameSha256: report.canary?.videoFrameSha256 || null,
		portraitToVideoFrameMeanAbsoluteError: report.canary?.portraitToVideoFrameMeanAbsoluteError ?? null,
		workerCanaries: report.workerCanaries || [],
		powerPointOpen: report.canary?.powerPointOpen === true,
	},
	reviewProtocol: {
		independentReviewerRequired: false,
		ownerOneTimeReviewAllowed: true,
		reviewAuthority: 'owner-one-time',
		reviewer: { name: '', organization: '', reviewedAt: '', signatureRef: '' },
		mustInspect: [
			'source portrait versus rendered talking-head visual continuity (not biometric matching)',
			'full upper-lip coherence, teeth continuity, and temporal stability',
			'lip-sync timing and mouth/phoneme alignment across the rendered clip',
			'identity stability across the clip (no face swaps, drift, or frame collapse)',
			'PowerPoint playback framing, poster handoff, and captions/timing behavior',
		],
		acceptanceCriteria: [
			'The supplied source portrait and talking-head render are visually continuous; native 3D likeness is out of scope.',
			'Lip-sync is intelligible and temporally aligned for the reviewed narration sample.',
			'No blocking identity, temporal, or PowerPoint playback defect is observed.',
			'Owner records evidence references and an explicit PASS or FAIL decision.',
		],
		decision: 'OPEN',
	},
	automatedChecks: (report.checks || []).filter(check => check.id !== 'independent-visual-identity-quality-review'),
	limitations: [
		'Pixel MAE is diagnostic only and is not an acceptance threshold.',
		'Automated lineage and playback checks do not replace the owner one-time visual review.',
		'This packet contains synthetic research evidence only; no customer or consented human asset is used.',
	],
	consentedHumanAssetUsed: false,
	customerData: false,
	training: false,
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(packet, null, 2) + '\n')
console.log(JSON.stringify({ status: packet.status, output: 'avatar-identity-quality-review-packet.json', decision: packet.reviewProtocol.decision, publicEnablementAllowed: packet.publicEnablementAllowed }, null, 2))
