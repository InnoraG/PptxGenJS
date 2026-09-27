import assert from 'node:assert/strict'
import test from 'node:test'
import { planDeckLayout, validateLayoutPlan } from '../ir/layout-engine.mjs'

import {
	VISUAL_REFERENCE_RECONSTRUCTION_VERSION,
	normalizeVisualReferenceReconstruction,
} from '../ir/visual-reference-reconstruction.mjs'

function baseSpec(content, visualReference = {}) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Visual reference test',
		layout: 'LAYOUT_WIDE',
		visualReference: {
			schemaVersion: VISUAL_REFERENCE_RECONSTRUCTION_VERSION,
			mode: 'ai-reconstructed-native',
			coordinateMode: 'pixels',
			representationPolicy: 'native-except-media',
			viewport: { width: 1600, height: 900 },
			mediaAssets: [],
			...visualReference,
		},
		slides: [{ id: 's1', content }],
	}
}

test('visualReference converts exact pixel frames into slide coordinates', () => {
	const normalized = normalizeVisualReferenceReconstruction(baseSpec([
		{ kind: 'shape', name: 'card', pixelFrame: { x: 160, y: 90, w: 320, h: 180 } },
	]))
	const frame = normalized.slides[0].content[0].bbox
	assert.ok(Math.abs(frame.x - 1.3333333) < 1e-6)
	assert.equal(frame.y, 0.75)
	assert.ok(Math.abs(frame.w - 2.6666666) < 1e-6)
	assert.equal(frame.h, 1.5)
	assert.equal(normalized.authoringContract.placementPolicy, 'visual-reference-pixels-v1')
})

test('visualReference rejects raw slide coordinates', () => {
	assert.throws(
		() => normalizeVisualReferenceReconstruction(baseSpec([{ kind: 'shape', name: 'card', x: 1, pixelFrame: { x: 0, y: 0, w: 100, h: 100 } }])),
		/\.x is forbidden in visualReference mode/,
	)
})

test('explicit decorative roles retain layout intent without classifying substantive objects as decorations', () => {
	const normalized = normalizeVisualReferenceReconstruction(baseSpec([
		{ kind: 'freeform', name: 'outline', role: 'decorative', pixelFrame: { x: 100, y: 100, w: 300, h: 180 }, pixelPoints: [{ x: 0, y: 180 }, { x: 300, y: 180 }, { x: 300, y: 0 }] },
		{ kind: 'textBox', name: 'label', text: 'Editable label', pixelFrame: { x: 140, y: 160, w: 180, h: 50 } },
		{ kind: 'freeform', name: 'substantive', decorative: false, role: 'decorative', pixelFrame: { x: 700, y: 100, w: 200, h: 180 }, pixelPoints: [{ x: 0, y: 0 }, { x: 200, y: 180 }] },
	]))
	assert.equal(normalized.slides[0].content[0].decorative, true)
	assert.equal(normalized.slides[0].content[1].decorative, undefined)
	assert.equal(normalized.slides[0].content[2].decorative, false)
})

test('decorative and substantive overlap are both reported without an engine spatial veto', () => {
	const blocks = [
		{ kind: 'freeform', name: 'outline', role: 'decorative', pixelFrame: { x: 100, y: 100, w: 300, h: 180 }, pixelPoints: [{ x: 0, y: 180 }, { x: 300, y: 180 }, { x: 300, y: 0 }], style: { fill: { transparency: 100 }, line: { color: '00AAFF' } } },
		{ kind: 'textBox', name: 'label', text: 'Editable label', pixelFrame: { x: 140, y: 160, w: 180, h: 50 }, style: { fontSize: 16 } },
	]
	const spec = baseSpec(blocks)
	spec.visualDesign = { world: 'observatory', framing: 'Exact source composition' }
	const inspect = candidate => validateLayoutPlan(planDeckLayout(normalizeVisualReferenceReconstruction(candidate)))
	assert.equal(inspect(spec).issues.some(issue => issue.code === 'OBJECT_OVERLAP'), false)
	const substantive = structuredClone(spec)
	delete substantive.slides[0].content[0].role
	const overlap = inspect(substantive).issues.find(issue => issue.code === 'OBJECT_OVERLAP')
	assert.equal(overlap?.severity, 'warning')
	assert.equal(overlap?.evidence?.engineAction, 'report-only')
})

test('pixelPoints are local to their required pixelFrame', () => {
	const normalized = normalizeVisualReferenceReconstruction(baseSpec([
		{
			kind: 'freeform',
			name: 'triangle',
			pixelFrame: { x: 100, y: 100, w: 200, h: 100 },
			pixelPoints: [{ x: 0, y: 0 }, { x: 200, y: 100 }, { close: true }],
		},
	]))
	const block = normalized.slides[0].content[0]
	assert.equal(block.points[0].x, 0)
	assert.equal(block.points[0].y, 0)
	assert.ok(Math.abs(block.points[1].x - block.bbox.w) < 1e-9)
	assert.ok(Math.abs(block.points[1].y - block.bbox.h) < 1e-9)
	assert.throws(
		() => normalizeVisualReferenceReconstruction(baseSpec([{ kind: 'freeform', name: 'bad', pixelPoints: [{ x: 0, y: 0 }] }])),
		/require pixelFrame and are local to that frame/,
	)
})

test('nested group pixel frames are parent-local', () => {
	const normalized = normalizeVisualReferenceReconstruction(baseSpec([
		{
			kind: 'group',
			name: 'group',
			pixelFrame: { x: 100, y: 100, w: 400, h: 200 },
			children: [{ kind: 'shape', objectName: 'child', pixelFrame: { x: 20, y: 10, w: 200, h: 100 } }],
		},
	]))
	const group = normalized.slides[0].content[0]
	const child = group.children[0]
	assert.ok(Math.abs(child.x - group.bbox.w * 0.05) < 1e-9)
	assert.ok(Math.abs(child.y - group.bbox.h * 0.05) < 1e-9)
	assert.ok(Math.abs(child.w - group.bbox.w * 0.5) < 1e-9)
	assert.ok(Math.abs(child.h - group.bbox.h * 0.5) < 1e-9)
})

test('presenter pixel frames are precisely converted and raw/private frame injection is rejected', () => {
	const spec = baseSpec([])
	spec.layouts = [{ name: 'pixels', width: 13.376, height: 7.528, activate: true }]
	spec.presenter = { identity: 'louise', pixelFrame: { x: 1200, y: 250, w: 250, h: 500 } }
	spec.slides[0].presenter = { pixelFrame: { x: 1180, y: 240, w: 280, h: 520 } }
	const normalized = normalizeVisualReferenceReconstruction(spec)
	assert.deepEqual(normalized.presenter._visualReferenceFrame, { x: 1200 / 1600 * 13.376, y: 250 / 900 * 7.528, w: 250 / 1600 * 13.376, h: 500 / 900 * 7.528 })
	assert.equal(normalized.presenter.pixelFrame, undefined)
	assert.equal(normalized.slides[0].presenter._visualReferenceFrame.x, 1180 / 1600 * 13.376)
	assert.equal(normalized.slides[0].presenter._visualReferenceFrame.y, 240 / 900 * 7.528)
	for (const field of ['_visualReferenceFrame', 'bbox', 'rect', 'x', 'y', 'w', 'h']) {
		assert.throws(() => normalizeVisualReferenceReconstruction({ ...spec, presenter: { ...spec.presenter, [field]: {} } }), /is forbidden/)
		const bad = structuredClone(spec)
		bad.slides[0].presenter[field] = {}
		assert.throws(() => normalizeVisualReferenceReconstruction(bad), /is forbidden/)
	}
})

test('true media declarations bind name, role, and immutable asset reference', () => {
	const assetRef = `asset://locked/uploaded-image/${'a'.repeat(64)}.png`
	const spec = baseSpec([
		{ kind: 'image', name: 'photo', pixelFrame: { x: 100, y: 100, w: 500, h: 400 }, imageOptions: { source: assetRef } },
	], {
		mediaAssets: [{ name: 'photo', kind: 'photograph', assetRef, purpose: 'Editorial portrait' }],
	})
	assert.doesNotThrow(() => normalizeVisualReferenceReconstruction(spec))
	assert.throws(
		() => normalizeVisualReferenceReconstruction({
			...spec,
			visualReference: {
				...spec.visualReference,
				mediaAssets: [{ name: 'photo', kind: 'photograph', assetRef: `${assetRef}-other`, purpose: 'Editorial portrait' }],
			},
		}),
		/media source must exactly match/,
	)
})

test('full-canvas media require an explicit legitimate fullBleed declaration', () => {
	const assetRef = `asset://locked/uploaded-image/${'b'.repeat(64)}.jpg`
	const spec = baseSpec([
		{ kind: 'image', name: 'hero-photo', pixelFrame: { x: 0, y: 0, w: 1600, h: 900 }, imageOptions: { source: assetRef } },
	], {
		mediaAssets: [{ name: 'hero-photo', kind: 'photograph', assetRef, purpose: 'Full-bleed documentary photograph' }],
	})
	assert.throws(() => normalizeVisualReferenceReconstruction(spec), /Declare fullBleed:true/)
	assert.doesNotThrow(() => normalizeVisualReferenceReconstruction({
		...spec,
		visualReference: {
			...spec.visualReference,
			mediaAssets: [{ ...spec.visualReference.mediaAssets[0], fullBleed: true }],
		},
	}))
})
