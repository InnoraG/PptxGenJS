import test from 'node:test'
import assert from 'node:assert/strict'
import { publicPreviewVerification } from '../engine.mjs'
import { NATIVE3D_PREVIEW_HYDRATION_VERSION } from '../quality/native3d-preview-hydration.mjs'
import { NATIVE3D_STATIC_APPEARANCE_VERSION } from '../quality/native3d-static-appearance.mjs'

function fixture() {
	// Readiness/coverage metadata only; this test never constructs a deck or
	// invokes PowerPoint. The second slide represents an ordinary 2D slide.
	const entry = { deckVersion: 2, pptx: { slides: [{}, {}] } }
	const render = { renderSha256: 'a'.repeat(64), powerPointOpen: { method: 'powerpoint-read-only-open', readOnly: true, withWindow: false, openAndRepair: false, repaired: false } }
	const freeze = { packageSha256: 'b'.repeat(64), native3dModelCounts: [1, 0], previewedSlideIndexes: new Set([0, 1]), renderEvidenceBySlide: new Map([[0, { ...render }], [1, { ...render }]]) }
	return { entry, freeze }
}

test('stable full-slide hashes cannot approve native3D content without its readiness proof', () => {
	const { entry, freeze } = fixture()
	assert.deepEqual(publicPreviewVerification(entry, freeze).previewedSlideIndexes, [1])
	const proof = { schemaVersion: NATIVE3D_PREVIEW_HYDRATION_VERSION, status: 'verified', modelCount: 1, verifiedModelCount: 1, stablePasses: 2, fallbackGuard: 'checked', slideContentMatch: 'verified' }
	freeze.renderEvidenceBySlide.get(0).native3dHydration = proof
	assert.deepEqual(publicPreviewVerification(entry, freeze).previewedSlideIndexes, [0, 1])
	freeze.renderEvidenceBySlide.get(0).native3dHydration = { ...proof, slideContentMatch: 'unverified' }
	assert.equal(publicPreviewVerification(entry, freeze).complete, false)
	assert.deepEqual(publicPreviewVerification(entry, freeze).remainingSlideIndexes, [0])
})

test('missing frozen native-model counts are unknown, not proof that a slide contains no native3D', () => {
	const { entry, freeze } = fixture()
	delete freeze.native3dModelCounts
	assert.deepEqual(publicPreviewVerification(entry, freeze).previewedSlideIndexes, [])
	assert.equal(publicPreviewVerification(entry, freeze).complete, false)
})

test('trusted static appearance credits visual coverage without relabeling native hydration or playback', () => {
	const { entry, freeze } = fixture()
	const proof = { schemaVersion: NATIVE3D_STATIC_APPEARANCE_VERSION, status: 'verified', nativeHydration: 'unverified', playback: 'not-verified', objectCount: 1, verifiedObjectCount: 1, stablePasses: 2, slideContentMatch: 'verified', packageBinding: 'checked', packageSha256: freeze.packageSha256, trustedPosterCount: 1, objects: [{ shapeId: 9, evidence: 'trusted-pose-view-frame-bound-poster', posterSha256: '1'.repeat(64), bindingSha256: '2'.repeat(64), sourcePackageSha256: '3'.repeat(64), receiptSha256: '4'.repeat(64) }] }
	freeze.renderEvidenceBySlide.get(0).native3dStaticAppearance = proof
	const result = publicPreviewVerification(entry, freeze)
	assert.equal(result.complete, true)
	assert.equal(result.renderEvidence[0].native3dStaticAppearance.nativeHydration, 'unverified')
	assert.equal(result.renderEvidence[0].native3dStaticAppearance.playback, 'not-verified')
	assert.equal(result.renderEvidence[0].native3dHydration, undefined)
	freeze.renderEvidenceBySlide.get(0).native3dStaticAppearance = { ...proof, packageSha256: '5'.repeat(64) }
	assert.equal(publicPreviewVerification(entry, freeze).complete, false)
})
