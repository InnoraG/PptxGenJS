import assert from 'node:assert/strict'
import test from 'node:test'
import { planDeckLayout } from '../ir/layout-engine.mjs'
import { normalizeVisualReferenceReconstruction } from '../ir/visual-reference-reconstruction.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

// Pure layout/compiler regression. No asset resolution, GLB access, presentation
// generation, application calls, source-artifact changes, or service operations.
const SIZE = Object.freeze({ w: 13.376, h: 7.528 })
const EXACT = Object.freeze({ x: 10.3288, y: 1.23456789, w: 2.4000123, h: 3.93601234 })
const MODEL = 'asset://locked/precision-model'
const rounded = frame => Object.fromEntries(Object.entries(frame).map(([key, value]) => [key, Math.round(value * 1000) / 1000]))
const carriers = [
	{ kind: 'shape', shapeName: 'rect', style: { fill: { color: '123456' } } },
	{ kind: 'model3d', modelAsset: MODEL, animation: [] },
	{ kind: 'textBox', text: 'Exact frame', style: { fontSize: 18, fit: 'none' } },
	{ kind: 'image', assetRef: 'asset://locked/precision-picture', noFrame: true },
	{ kind: 'freeform', points: [{ x: 0, y: 0, moveTo: true }, { x: 1, y: 1 }], style: { line: { color: 'FFFFFF' } } },
	{ kind: 'group', children: [{ kind: 'shape', objectName: 'child', x: 0.1234567, y: 0.2345678, w: 0.3456789, h: 0.4567891 }] },
]
const forms = {
	bbox: frame => ({ bbox: { ...frame } }),
	rect: frame => ({ rect: { ...frame } }),
	options: frame => ({ options: { ...frame } }),
	topLevel: frame => ({ ...frame }),
}

function specFor(content) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Authored rectangle precision',
		layouts: [{ name: 'exact', width: SIZE.w, height: SIZE.h, activate: true }],
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Reviewers', outcome: 'Keep authored native geometry.', remember: 'Only automatic layout is quantized.' },
		visualDesign: { world: 'editorial', framing: 'Author-owned geometry' },
		styleIntent: { scaffold: false, decorations: false },
		slides: [{ id: 's1', title: 'Exact geometry', layoutIntent: 'title-body', background: { color: '000611' }, content }],
	}
}
const planned = (spec, preserveSourceGeometry) => planDeckLayout(spec, { slideSize: SIZE, preserveSourceGeometry })
const find = (plan, blockName) => plan.slides[0].objects.find(object => object.blockName === blockName)

test('source preservation keeps exact author rectangles across native carriers and input forms', () => {
	for (const carrier of carriers) for (const [form, geometry] of Object.entries(forms)) {
		const name = `${carrier.kind}-${form}`
		const spec = specFor([{ ...structuredClone(carrier), name, ...geometry(EXACT) }])
		const before = structuredClone(spec)
		const exact = find(planned(spec, true), name)
		assert.deepEqual(exact.rect, EXACT, `${name}: source-preserved author rectangle`)
		assert.equal(exact.placementSource, 'author', name)
		assert.equal(exact.placementIntentSource, 'author-geometry', name)
		assert.deepEqual(find(planned(spec, false), name).rect, rounded(EXACT), `${name}: ordinary layout retains its rounding`)
		assert.deepEqual(find(planned(spec, undefined), name).rect, rounded(EXACT), `${name}: default behavior is unchanged`)
		assert.deepEqual(spec, before, `${name}: input is immutable`)
	}
})

test('fractional pixel frames reach the shape and model compiler without intermediate inch rounding', () => {
	const pixels = { x: 1291.1, y: 260, w: 300, h: 492 }
	for (const carrier of carriers.slice(0, 2)) {
		const spec = specFor([{ ...structuredClone(carrier), name: 'exact-object', objectName: 'exact-object', pixelFrame: pixels }])
		spec.visualReference = {
			mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1672, height: 941 },
			mediaAssets: carrier.kind === 'model3d' ? [{ name: 'exact-object', kind: 'model3d', assetRef: MODEL, purpose: 'Immutable model reference for a pure compiler fixture.' }] : [],
		}
		const before = structuredClone(spec)
		const normalized = normalizeVisualReferenceReconstruction(spec)
		const normalizedFrame = normalized.slides[0].content[0].bbox
		const object = find(planned(normalized, true), 'exact-object')
		assert.deepEqual(object.rect, normalizedFrame, carrier.kind)
		assert.equal(object.rect.x, 10.3288)
		assert.equal(Math.round(object.rect.x * 914400), 9444655, 'quantize only at the final EMU boundary')
		assert.notEqual(Math.round(object.rect.x * 914400), 9444838, 'do not retain the prior quantized placement')
		const plan = buildSpecOperationPlan(spec)
		const operation = plan.operations.find(operation => operation.tool === (carrier.kind === 'shape' ? 'betterpptx.slide.add_shape' : 'betterpptx.slide.add_model3d'))
		assert.ok(operation, carrier.kind)
		const options = operation.args.options
		assert.deepEqual(Object.fromEntries(['x', 'y', 'w', 'h'].map(key => [key, options[key]])), normalizedFrame)
		assert.deepEqual(spec, before)
	}
})

test('automatic and semantic-region layouts retain their original rounded rectangles', () => {
	for (const carrier of carriers.slice(0, 3)) for (const region of [undefined, 'body']) {
		const name = `${carrier.kind}-automatic`
		const spec = specFor([{ ...structuredClone(carrier), name, ...(region ? { region } : {}) }])
		const baseline = find(planned(spec, false), name)
		const preserved = find(planned(spec, true), name)
		assert.deepEqual(preserved.rect, baseline.rect, name)
		assert.deepEqual(preserved.rect, rounded(preserved.rect), name)
		assert.equal(preserved.placementSource, 'engine', name)
	}
})

test('engine-owned and engine-proposed explicit-looking frames are not author precision opt-ins', () => {
	for (const carrier of carriers.slice(0, 2)) for (const engine of [
		{ _engineOwnedGeometry: true, _engineRect: { ...EXACT } },
		{ _enginePlaced: true },
	]) {
		const spec = specFor([{ ...structuredClone(carrier), name: 'engine-object', bbox: { ...EXACT }, ...engine }])
		const object = find(planned(spec, true), 'engine-object')
		assert.equal(object.placementSource, 'engine')
		assert.deepEqual(object.rect, find(planned(spec, false), 'engine-object').rect)
		assert.deepEqual(object.rect, rounded(object.rect))
		if (engine._engineOwnedGeometry) assert.deepEqual(object.rect, rounded(EXACT))
	}
})

test('incomplete authored frames still use rounded fallback geometry', () => {
	const spec = specFor([{ ...carriers[0], name: 'incomplete', bbox: { x: EXACT.x, y: EXACT.y, h: EXACT.h } }])
	const object = find(planned(spec, true), 'incomplete')
	assert.deepEqual(object.rect, find(planned(spec, false), 'incomplete').rect)
	assert.deepEqual(object.rect, rounded(object.rect))
})

test('generated frame and inset rectangles keep rounding under source preservation', () => {
	const frame = { x: 1.1234567, y: 1.2345678, w: 3.3456789, h: 3.4567891 }
	const spec = specFor([{ kind: 'image', name: 'framed-picture', assetRef: 'asset://locked/precision-picture', bbox: frame }])
	spec.visualDesign.world = 'observatory'
	spec.styleIntent.artDirection = 'observatory'
	const objects = planned(spec, true).slides[0].objects.filter(object => object.blockName === 'framed-picture')
	assert.equal(objects.length, 2)
	assert.ok(objects.some(object => object.role === 'image-frame'))
	assert.ok(objects.some(object => object.primitive === 'image'))
	for (const object of objects) assert.deepEqual(object.rect, rounded(object.rect), object.role)
})

test('metadata alone does not enable source precision or bypass the public pixel boundary', () => {
	const spec = specFor([{ ...carriers[0], name: 'metadata-only', bbox: { ...EXACT } }])
	spec.authoringContract.placementPolicy = 'visual-reference-pixels-v1'
	assert.deepEqual(find(buildSpecOperationPlan(spec).plan, 'metadata-only').rect, rounded(EXACT))
	const spoofed = structuredClone(spec)
	spoofed.visualReference = { schemaVersion: 'betterpptx.visual-reference-reconstruction.v1', mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1672, height: 941 }, mediaAssets: [] }
	// The public handler always normalizes submitted input before compiler entry,
	// even when a client supplies the normalized-looking placement metadata.
	assert.throws(() => normalizeVisualReferenceReconstruction(spoofed), /bbox is forbidden/)
})

test('fresh visual precision keeps substantive off-slide geometry blocking', () => {
	const spec = specFor([{ ...carriers[0], name: 'off-slide', pixelFrame: { x: 1660.1, y: 100.3, w: 100.2, h: 200.4 } }])
	spec.visualReference = { mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1672, height: 941 }, mediaAssets: [] }
	const compiled = buildSpecOperationPlan(spec)
	const finding = compiled.errors.find(issue => issue.code === 'OFF_SLIDE_OBJECT')
	assert.ok(finding, 'fresh pixel authoring must not acquire roundtrip off-slide permissions')
	assert.equal(finding.severity, 'error')
	assert.equal(finding.evidence.allowed, false)
	assert.equal(finding.evidence.placementSource, 'author')
	assert.deepEqual(find(compiled.plan, 'off-slide').rect, normalizeVisualReferenceReconstruction(spec).slides[0].content[0].bbox)
})

test('precision-only planning does not enable native preservation or suppress implicit backgrounds', () => {
	const spec = specFor([{ ...carriers[0], name: 'ordinary-shape', bbox: { ...EXACT }, nativePreservation: { handle: 'native://test-preservation-handle' } }])
	delete spec.slides[0].background
	const baseline = planDeckLayout(spec, { slideSize: SIZE })
	const precise = planDeckLayout(spec, { slideSize: SIZE, preserveAuthoredPrecision: true })
	assert.equal(find(precise, 'ordinary-shape').primitive, 'shape')
	assert.equal(find(precise, 'ordinary-shape').preservationHandle, undefined)
	assert.deepEqual(find(precise, 'ordinary-shape').rect, EXACT)
	assert.deepEqual(precise.slides[0].background, baseline.slides[0].background)
	assert.ok(precise.slides[0].background)
	const roundtrip = planned(spec, true)
	assert.equal(find(roundtrip, 'ordinary-shape').primitive, 'opaqueNative', 'existing roundtrip behavior remains available')
	assert.equal(roundtrip.slides[0].background, null)
})
