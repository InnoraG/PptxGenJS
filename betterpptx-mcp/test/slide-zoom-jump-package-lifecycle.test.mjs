import test from 'node:test'
import assert from 'node:assert/strict'
import {
	SLIDE_ZOOM_JUMP_ROWS,
	SLIDE_ZOOM_JUMP_UNIT_ID,
	probeSlideZoomJumpRuntime,
	runSlideZoomJumpUnitProof,
} from '../verify-slide-zoom-jump-unit-v1.mjs'

test('Slide Zoom and jump-to-slide generated-unit identity is frozen', () => {
	assert.equal(SLIDE_ZOOM_JUMP_UNIT_ID, 'impl-b-3f5d04322d51e076')
	assert.deepEqual(SLIDE_ZOOM_JUMP_ROWS, [
		['cap_3cbed884e2e57a42232c', 'slide zoom'],
		['cap_f4961a44a304c4d91694', 'jump to slide'],
	])
})

test('core serializer emits the exact native Slide Zoom Choice/Fallback topology', async () => {
	const runtime = await probeSlideZoomJumpRuntime()
	assert.equal(runtime.ready, true, JSON.stringify(runtime))
	assert.equal(runtime.topology.zoom.sldId, 258)
	assert.equal(runtime.topology.zoom.returnToParent, 1)
	assert.equal(runtime.topology.zoom.transitionDur, 1750)
	assert.ok(runtime.topology.zoom.imagePart.endsWith('.png'))
	assert.notEqual(runtime.topology.jumpRid, runtime.topology.zoom.fallbackSlideRid)
})

test('public spec lifecycle preserves semantic target identity and package closure', async () => {
	const proof = await runSlideZoomJumpUnitProof({ office: false })
	assert.equal(proof.status, 'SLIDE_ZOOM_JUMP_PACKAGE_VERIFIED_OFFICE_GATED')
	assert.equal(proof.lifecycle.length, 7)
	assert.equal(proof.negatives.length, 3)
	assert.equal(proof.checks.reorderRetargetsBySemanticIdentity, true)
	assert.equal(proof.checks.deletedAndUnknownTargetsFailClosedNoMutation, true)
})
