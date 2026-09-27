import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { assessPresenterSubmission, assertMeshyIdentityPolicy, buildMeshyMultiImageTask, createPresenterAssetManifest, inspectImageBytes, makeDeterministicFaceCropSpec } from '../avatar/presenter-ingestion.mjs'

function syntheticPng(width = 1600, height = 2000, marker = 0) {
	const bytes = Buffer.alloc(32, marker)
	Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes, 0)
	bytes.writeUInt32BE(width, 16)
	bytes.writeUInt32BE(height, 20)
	return bytes
}

const body = (overrides = {}) => ({
	image: inspectImageBytes(syntheticPng(1600, 2000, 1), 'body.png'),
	analysis: {
		subjectCount: 1,
		fullBodyVisible: true,
		bodyCoverage: 0.72,
		pose: 'a-pose',
		facePixels: 420,
		exposureClippingRatio: 0.01,
		blurScore: 120,
		segmentationConfidence: 0.95,
		...overrides,
	},
})

const dedicatedFace = {
	image: inspectImageBytes(syntheticPng(1400, 1400, 2), 'face.png'),
	analysis: { subjectCount: 1, facePixels: 1100, exposureClippingRatio: 0.01, blurScore: 180 },
}

const tolerant = assessPresenterSubmission({
	bodyViews: [body({ pose: 'neutral', exposureClippingRatio: 0.12, segmentationConfidence: 0.55 })],
	faceImage: dedicatedFace,
})
assert.equal(tolerant.canProceed, true)
assert.equal(tolerant.status, 'ready-with-warnings')
assert.ok(tolerant.warnings.some(item => item.code === 'POSE_NOT_A_OR_T'))
assert.ok(tolerant.warnings.some(item => item.code === 'EXPOSURE_CLIPPING'))
assert.ok(tolerant.warnings.some(item => item.code === 'SEGMENTATION_UNCERTAIN'))

const fallback = assessPresenterSubmission({ bodyViews: [body({ facePixels: 190 })], faceImage: null })
assert.equal(fallback.canProceed, true)
assert.equal(fallback.faceSource, 'derived-face-fallback')
assert.ok(fallback.warnings.some(item => item.code === 'DEDICATED_FACE_RECOMMENDED'))

const blocked = assessPresenterSubmission({ bodyViews: [body({ subjectCount: 2, fullBodyVisible: false, facePixels: 80 })], faceImage: null })
assert.equal(blocked.canProceed, false)
assert.ok(blocked.blockers.some(item => item.code === 'SUBJECT_COUNT_UNRESOLVED'))
assert.ok(blocked.warnings.some(item => item.code === 'FULL_BODY_NOT_VISIBLE'))
assert.ok(blocked.blockers.some(item => item.code === 'FACE_DETAIL_LOW'))

const partialBody = assessPresenterSubmission({ bodyViews: [body({ fullBodyVisible: false, facePixels: 500 })], faceImage: dedicatedFace })
assert.equal(partialBody.canProceed, true)
assert.ok(partialBody.warnings.some(item => item.code === 'FULL_BODY_NOT_VISIBLE'))

const crop = makeDeterministicFaceCropSpec({ width: 1600, height: 2000, bbox: { x: 650, y: 210, width: 280, height: 360 } })
assert.equal(crop.identitySafe, true)
assert.deepEqual(crop.forbidden, ['generative-restyle', 'beautify', 'face-repair', 'mesh-texture-roundtrip'])

const meshyRequest = buildMeshyMultiImageTask({
	imageUrls: ['https://storage.example.test/body-front.png', 'https://storage.example.test/body-side.png'],
	poseMode: 'a-pose',
})
assert.equal(meshyRequest.image_enhancement, false)
assert.equal(meshyRequest.remove_lighting, false)
assert.equal(meshyRequest.identity_policy.faceAssetMayBeSent, false)
assert.equal(assertMeshyIdentityPolicy(meshyRequest).ok, true)
assert.throws(() => buildMeshyMultiImageTask({ imageUrls: ['C:\\private\\face.png'] }), /HTTPS URL or image data URI/)

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-presenter-ingestion-'))
const bodyPath = path.join(temp, 'body.png')
const facePath = path.join(temp, 'face.png')
await fs.writeFile(bodyPath, syntheticPng(1600, 2000, 3))
await fs.writeFile(facePath, syntheticPng(1400, 1400, 4))
const manifest = await createPresenterAssetManifest({
	bodyPaths: [bodyPath],
	facePath,
	analyses: { 'body-1': body().analysis, 'face-dedicated': dedicatedFace.analysis },
})
assert.equal(manifest.decision.canProceed, true)
assert.equal(manifest.provenance.meshInputTransform, 'alpha-only-or-original')
assert.equal(manifest.provenance.allowedFaceOperations.join(','), 'crop,pad,resize')
assert.equal(manifest.originals.faceImage.image.filename, 'face.png')

const report = {
	schemaVersion: 'betterpptx.presenter-ingestion-test-report.v1',
	status: 'PASS',
	checks: 7,
	policy: manifest.policy,
	cases: [
		{ id: 'tolerant-warnings-proceed', status: tolerant.status, blockerCount: tolerant.blockers.length, warningCount: tolerant.warnings.length },
		{ id: 'dedicated-face-fallback', status: fallback.status, faceSource: fallback.faceSource },
		{ id: 'unsafe-input-blocks', status: blocked.status, blockerCount: blocked.blockers.length },
		{ id: 'partial-body-tolerated', status: partialBody.status, blockerCount: partialBody.blockers.length },
		{ id: 'deterministic-face-crop', status: crop.identitySafe ? 'pass' : 'fail' },
		{ id: 'meshy-identity-preserving-request', status: assertMeshyIdentityPolicy(meshyRequest).ok ? 'pass' : 'fail', enhancement: meshyRequest.image_enhancement, removeLighting: meshyRequest.remove_lighting },
		{ id: 'immutable-manifest', status: manifest.decision.canProceed ? 'pass' : 'fail', bodySha256: manifest.originals.bodyViews[0].image.sha256, faceSha256: manifest.originals.faceImage.image.sha256 },
	],
}
const outputPath = path.resolve('betterpptx-mcp/outputs/presenter-ingestion-validation-report.json')
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
