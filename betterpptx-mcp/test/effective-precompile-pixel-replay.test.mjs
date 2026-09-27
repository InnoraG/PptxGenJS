import assert from 'node:assert/strict'
import test from 'node:test'
import { projectEffectivePrecompileToAuthoredCoordinates } from '../ir/spec-resolution-handoff.mjs'
import { normalizeVisualReferenceReconstruction } from '../ir/visual-reference-reconstruction.mjs'
import { sanitizePublicResult } from '../blackbox.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'

function authored() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native pixel replay',
		layouts: [{ name: 'PIXELS', width: 13.376, height: 7.528, activate: true }],
		visualReference: { mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1672, height: 941 }, mediaAssets: [] },
		presenter: { identity: 'louise', pixelFrame: { x: 1291.1, y: 260, w: 300, h: 492 }, staticPose: { motionId: 'motion.ordinary.idle', timeMs: 0 } },
		slides: [{ id: 'first', pixelViewport: { width: 3344, height: 1882 }, presenter: { pixelFrame: { x: 2528, y: 466, w: 728, h: 1164 }, staticPose: { motionId: 'motion.ordinary.talk', timeMs: 1440 } }, content: [
			{ kind: 'group', name: 'group', pixelFrame: { x: 120, y: 180, w: 900, h: 400 }, children: [
				{ kind: 'freeform', name: 'curve', pixelFrame: { x: 0, y: 0, w: 800, h: 240 }, pixelPoints: [{ x: 0, y: 240, moveTo: true }, { x: 800, y: 0, curve: { type: 'cubic', x1: 200, y1: 240, x2: 600, y2: 0 } }] },
				{ kind: 'freeform', name: 'paths', pixelFrame: { x: 0, y: 300, w: 400, h: 80 }, pixelPaths: [[{ x: 0, y: 0 }, { x: 400, y: 80 }]] },
			] },
		] }],
	}
}

test('effective public replay preserves exact deck/slide presenter frames and nested pixel geometry', () => {
	const source = authored()
	const original = structuredClone(source)
	const normalized = normalizeVisualReferenceReconstruction(source)
	normalized.slides[0].content[0].children[0].style = { line: { color: '00D5FE', width: 0.57 } }
	normalized.slides[0].narration = { lockedAudio: { handle: `asset://locked/audio/${'a'.repeat(64)}.wav` } }
	const normalizedBefore = structuredClone(normalized)
	const projected = projectEffectivePrecompileToAuthoredCoordinates(normalized, source)
	const publicResult = sanitizePublicResult({ spec: projected }).spec
	assert.deepEqual(publicResult.presenter, source.presenter)
	assert.deepEqual(publicResult.slides[0].presenter, source.slides[0].presenter)
	assert.deepEqual(publicResult.slides[0].pixelViewport, source.slides[0].pixelViewport)
	assert.deepEqual(publicResult.slides[0].content[0].pixelFrame, source.slides[0].content[0].pixelFrame)
	for (const [index, child] of publicResult.slides[0].content[0].children.entries()) {
		assert.deepEqual(child.pixelFrame, source.slides[0].content[0].children[index].pixelFrame)
		assert.deepEqual(child.pixelPoints, source.slides[0].content[0].children[index].pixelPoints)
		assert.deepEqual(child.pixelPaths, source.slides[0].content[0].children[index].pixelPaths)
		for (const key of ['x', 'y', 'w', 'h', 'bbox', 'points', 'paths']) assert.equal(child[key], undefined)
	}
	assert.deepEqual(publicResult.slides[0].content[0].children[0].style, normalized.slides[0].content[0].children[0].style)
	assert.equal(publicResult.slides[0].narration.lockedAudio.handle, normalized.slides[0].narration.lockedAudio.handle)
	assert.deepEqual(normalizeVisualReferenceReconstruction(publicResult).slides[0].presenter, normalized.slides[0].presenter)
	assert.deepEqual(source, original)
	assert.deepEqual(normalized, normalizedBefore)
	assert.equal(publicResult.authoringContract.placementPolicy, undefined)
})

test('semantic effective snapshots are unchanged and unpaired private presenter frames fail closed', () => {
	const semantic = { title: 'Semantic', slides: [{ id: 'one', content: [{ kind: 'textBox', bbox: { x: 1, y: 1, w: 2, h: 1 } }] }] }
	assert.deepEqual(projectEffectivePrecompileToAuthoredCoordinates(semantic, semantic), semantic)
	const source = authored()
	const normalized = normalizeVisualReferenceReconstruction(source)
	delete source.slides[0].presenter.pixelFrame
	assert.throws(() => projectEffectivePrecompileToAuthoredCoordinates(normalized, source), { code: 'SPEC_RESOLUTION_HANDOFF_INVALID' })
})
