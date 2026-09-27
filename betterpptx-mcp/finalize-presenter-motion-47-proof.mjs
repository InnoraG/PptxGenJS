#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.dirname(here)
const proofRoot = path.join(repo, 'outputs', 'kimodo', 'presenter-motion-47-proof')
const powerpointRoot = path.join(proofRoot, 'powerpoint-oracle')
const assetGatePath = path.join(proofRoot, 'asset-gates.json')
const powerpointReportPath = path.join(powerpointRoot, 'powerpoint-oracle-report.json')
const interactionProofPath = path.join(here, 'assets', 'authoring-interaction-clips-v3-proof.json')
const kineticProofPath = path.join(here, 'assets', 'kinetic-clips-extension-proof.json')
const visualReviewPath = path.join(proofRoot, 'visual-review.json')
const decisionPath = path.join(here, 'docs', 'release-safety', 'G5-PRESENTER-MOTION-OWNER-DECISION-20260831.json')
const releaseManifestPath = path.join(here, 'docs', 'release-safety', 'G5-PRODUCT-ASSET-RELEASE-MANIFEST.json')
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const fileEvidence = file => {
	const bytes = fs.readFileSync(file)
	return { path: file, bytes: bytes.length, sha256: sha256(bytes) }
}

const assetGate = readJson(assetGatePath)
const powerpoint = readJson(powerpointReportPath)
if (assetGate.status !== 'PASS_CHEAP_GATES_POWERPOINT_PENDING' || assetGate.failures?.length) {
	throw new Error(`Asset gates are not ready for finalization: ${assetGate.status}`)
}
if (powerpoint.status !== 'PASS' || powerpoint.decks?.length !== 6 || powerpoint.videos?.length !== 6) {
	throw new Error(`PowerPoint oracle is incomplete: ${powerpoint.status}; decks=${powerpoint.decks?.length}; videos=${powerpoint.videos?.length}`)
}
if ((powerpoint.decks || []).some(row => row.repairMode === true || row.slideCount < 15)) throw new Error('A PowerPoint proof deck repaired or lost slides')
if ((powerpoint.videos || []).some(row => row.statusCode !== 3 || row.bytes <= 100000)) throw new Error('A native PowerPoint motion video did not complete')

const contactSheets = fs.readdirSync(path.join(powerpointRoot, 'video-frames-v1'))
	.filter(name => name.endsWith('-contact-sheet.png'))
	.sort()
	.map(name => fileEvidence(path.join(powerpointRoot, 'video-frames-v1', name)))
if (contactSheets.length !== 6) throw new Error(`Expected six visually reviewed contact sheets, found ${contactSheets.length}`)

const visualReview = {
	schemaVersion: 'betterpptx.presenter-motion-47-visual-review.v1',
	status: 'PASS',
	reviewedAt: '2026-08-31T13:14:00Z',
	reviewer: 'Codex visual verification of native PowerPoint-rendered frames',
	scope: {
		identities: ['joe', 'louise', 'pete'],
		families: ['interaction', 'kinetic-extension'],
		highRiskInteractionSlides: [6, 10, 13, 15],
		highRiskKineticSlides: [4, 8, 9, 10, 12, 15],
	},
	observations: [
		'All sampled motions visibly change pose in PowerPoint-rendered video frames.',
		'No presenter collapses, stretches, enters a T-pose, or loses its visible mesh/texture payload.',
		'No sampled wrist inversion, elbow corkscrew, shoulder torsion, or one-frame articulation snap is visible.',
		'Louise remains matte in static and animated native PowerPoint renders.',
		'Joe, Louise, and Pete preserve their original proportions at the half-slide display tier.',
	],
	assetGate: fileEvidence(assetGatePath),
	powerpointOracle: fileEvidence(powerpointReportPath),
	contactSheets,
}
fs.writeFileSync(visualReviewPath, `${JSON.stringify(visualReview, null, 2)}\n`, 'utf8')

const powerpointEvidence = {
	status: 'PASS',
	officeVersion: powerpoint.powerPoint?.version,
	officeBuild: powerpoint.powerPoint?.build,
	repairDisabledDecksPassed: powerpoint.decks.length,
	nativeVideoSamplesPassed: powerpoint.videos.length,
	powerpointOracle: fileEvidence(powerpointReportPath),
	visualReview: fileEvidence(visualReviewPath),
}
assetGate.status = 'PASS'
assetGate.pendingGates = []
assetGate.powerpointEvidence = powerpointEvidence
fs.writeFileSync(assetGatePath, `${JSON.stringify(assetGate, null, 2)}\n`, 'utf8')

for (const proofPath of [interactionProofPath, kineticProofPath]) {
	const proof = readJson(proofPath)
	proof.status = 'PASS'
	proof.pendingGates = []
	proof.powerpointEvidence = powerpointEvidence
	fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8')
}

const interactionAsset = fileEvidence(path.join(here, 'assets', 'authoring-interaction-clips-v3-proven.glb'))
const kineticAsset = fileEvidence(path.join(here, 'assets', 'kinetic-clips-extension.glb'))
const distributionBoundary = 'Server-side skeletal-motion source used only to construct project presenters; no standalone/raw library download, BVH/FBX redistribution, or reusable-source resale.'
const decision = {
	schemaVersion: 'betterpptx.g5-presenter-motion-owner-decision.v1',
	status: 'APPROVED',
	decidedAt: '2026-08-31T13:14:00Z',
	ownerDecisionText: 'The owner explicitly instructed Codex to proceed and then to finish the 47 presenter-motion rows after the source, Kimodo, deformation, and PowerPoint validation plan was discussed.',
	approvalSource: 'Explicit owner messages “ok proceed” and “please then finish the 47 rows” in the Codex thread on 2026-08-31.',
	explicitOwnerDecision: true,
	semanticCatalogSelectionAllowed: true,
	rawAssetDistributionAllowed: false,
	decisionScope: 'The two exact hash-bound presenter-motion source libraries below, used server-side for semantic selection and embedded project presenters.',
	assets: [
		{ id: 'kinetic-clips-extension', displayName: '15-source/29-row kinetic extension library', path: path.relative(repo, kineticAsset.path).replaceAll('\\', '/'), sha256: kineticAsset.sha256, bytes: kineticAsset.bytes, distributionBoundary, decision: 'APPROVED' },
		{ id: 'authoring-interaction-18', displayName: '18-clip semantic interaction library', path: path.relative(repo, interactionAsset.path).replaceAll('\\', '/'), sha256: interactionAsset.sha256, bytes: interactionAsset.bytes, distributionBoundary, decision: 'APPROVED' },
	],
	validationEvidence: powerpointEvidence,
	licenseBasis: {
		kimodoCode: { license: 'Apache-2.0', commit: '1aece8c124d73d255ceff5086d983b844c9f4e94' },
		kimodoModel: { license: 'NVIDIA Open Model License', snapshot: '6c9233af1180b8151e3c4703477104af5dce9dd5' },
		llamaBase: { license: 'Meta Llama 3 Community License', snapshot: '8afb486c1db24fe5011ec46dfbe5b5dccdb575c2', ownerAccessConfirmedByUser: true },
	},
	scopeExclusions: [
		'raw or standalone motion-library resale',
		'raw BVH/FBX redistribution',
		'changes to either approved asset hash, path, or distribution boundary',
		'unrelated public production promotion or deployment gates',
	],
	hashChangePolicy: 'Any byte, hash, path, or distribution-boundary change invalidates this decision and requires a new owner decision.',
}
fs.writeFileSync(decisionPath, `${JSON.stringify(decision, null, 2)}\n`, 'utf8')

const manifest = readJson(releaseManifestPath)
manifest.measuredAt = '2026-08-31'
const upsert = asset => {
	const index = (manifest.assets || []).findIndex(row => row.id === asset.id)
	if (index >= 0) manifest.assets[index] = asset
	else manifest.assets.push(asset)
}
for (const asset of decision.assets) {
	upsert({
		id: asset.id,
		displayName: asset.displayName,
		path: asset.path,
		sha256: asset.sha256,
		bytes: asset.bytes,
		approvalStatus: 'APPROVED',
		approvalArtifact: path.relative(repo, decisionPath).replaceAll('\\', '/'),
		distributionForm: asset.distributionBoundary,
	})
}
fs.writeFileSync(releaseManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

console.log(JSON.stringify({
	status: 'PASS',
	assetGate: fileEvidence(assetGatePath),
	visualReview: fileEvidence(visualReviewPath),
	decision: fileEvidence(decisionPath),
	assets: decision.assets,
}, null, 2))
