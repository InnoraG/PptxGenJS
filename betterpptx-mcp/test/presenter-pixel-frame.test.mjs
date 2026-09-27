import assert from 'node:assert/strict'
import test from 'node:test'

import { expandPresenterDirective, planPresenterGestures } from '../ir/presenter-director.mjs'
import { applyMotionPolicy } from '../ir/motion-policy.mjs'
import { normalizeVisualReferenceReconstruction } from '../ir/visual-reference-reconstruction.mjs'

// These are pure director tests. No GLB bytes are loaded, rewritten, generated,
// or registered, and no presentation/application/deployment is created.
const FRAME = Object.freeze({ x: 9.431271929, y: 1.147714134, w: 3.041467306, h: 5.892348565 })
const MODEL = 'asset://locked/approved-louise-model'
const POSTER = 'asset://locked/approved-louise-poster'
const MOTION = 'motion.ordinary.present'
const OPTIONS = Object.freeze({
	slideSize: { w: 13.333333, h: 7.5 },
	avatarClipMap: { [MOTION]: 9 },
	avatarClipDurations: { 9: 5125 },
})

function source({ exact = true, count = 3 } = {}) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Pixel-placed native presenter',
		...(exact ? {
			visualReference: { mode: 'ai-reconstructed-native', coordinateMode: 'pixels', viewport: { width: 1672, height: 941 } },
			authoringContract: { placementPolicy: 'visual-reference-pixels-v1' },
		} : { authoringContract: { geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1' } }),
		presenter: {
			id: 'host', identity: 'louise', model: MODEL, poster: POSTER,
			stage: 'right', choreography: 'energetic', scale: 2.2, onSlides: 'all',
			...(exact ? { _visualReferenceFrame: { ...FRAME } } : { rect: { ...FRAME } }),
		},
		slides: Array.from({ length: count }, (_, index) => ({
			id: `pixel-${index + 1}`, role: 'proof', title: 'Native presenter',
			narration: { text: 'Here is the evidence.', expectedDurationMs: 2000 },
			presenterMotion: { presenterId: 'host', motionId: MOTION, narrationCue: 'the evidence' },
			content: [{ kind: 'textBox', name: `copy-${index + 1}`, text: 'The proof stays editable.', ...(exact ? { pixelFrame: { x: 100, y: 120, w: 900, h: 120 } } : { rect: { x: 0.8, y: 1, w: 7.5, h: 1 } }) }],
		})),
	}
}
const presenterAt = (spec, index = 0) => spec.slides[index].content.find(item => item.name === 'presenter')

test('public pixelFrame normalization and presenter expansion share the same exact bridge', () => {
	const authored = source()
	authored.visualReference.representationPolicy = 'native-except-media'
	delete authored.presenter._visualReferenceFrame
	authored.presenter.pixelFrame = { x: 1170, y: 140, w: 380, h: 740 }
	authored.slides[1].pixelViewport = { width: 3344, height: 1882 }
	authored.slides[1].presenter = { pixelFrame: { x: 2331, y: 271, w: 761, h: 1451 } }
	const before = structuredClone(authored)
	const normalized = normalizeVisualReferenceReconstruction(authored)
	const expanded = expandPresenterDirective(normalized, OPTIONS)
	assert.deepEqual(presenterAt(expanded, 0).bbox, normalized.presenter._visualReferenceFrame)
	assert.deepEqual(presenterAt(expanded, 1).bbox, normalized.slides[1].presenter._visualReferenceFrame)
	assert.deepEqual(presenterAt(expanded, 2).bbox, normalized.presenter._visualReferenceFrame)
	assert.equal(presenterAt(expanded, 0).bbox.x, 1170 / 1672 * 13.333333)
	assert.equal(presenterAt(expanded, 1).bbox.y, 271 / 1882 * 7.5)
	assert.deepEqual(authored, before)
})

test('normalized exact deck frame is kept without rounding, growth, drift, or recede', () => {
	const authored = source()
	const before = structuredClone(authored)
	const expanded = expandPresenterDirective(authored, {
		...OPTIONS,
		storyArc: [{ presence: 'recede', scale: 0.1, stage: 'corner' }, { presence: 'full' }, { presence: 'recede', scale: 0.3, stage: 'left' }],
	})
	for (let index = 0; index < authored.slides.length; index++) {
		assert.deepEqual(presenterAt(expanded, index).bbox, FRAME)
		assert.equal(presenterAt(expanded, index)._engineOwnedGeometry, false)
		assert.equal(expanded.slides[index].presenterZone, undefined)
	}
	assert.deepEqual(authored, before, 'director must not mutate the normalized source spec')
})

test('per-slide exact frame overrides deck frame and omission inherits it', () => {
	const authored = source()
	const override = { x: 0.017654321, y: 0.125678912, w: 2.8, h: 6.701234567 }
	const overrideBefore = { ...override }
	authored.slides[1].presenter = { _visualReferenceFrame: override }
	const expanded = expandPresenterDirective(authored, OPTIONS)
	assert.deepEqual(presenterAt(expanded, 0).bbox, FRAME)
	assert.deepEqual(presenterAt(expanded, 1).bbox, override)
	assert.deepEqual(presenterAt(expanded, 2).bbox, FRAME)
	assert.deepEqual(override, overrideBefore)
})

test('a slide-only override cannot leave other presenter appearances without authored frames', () => {
	const authored = source()
	delete authored.presenter._visualReferenceFrame
	authored.slides[1].presenter = { _visualReferenceFrame: { ...FRAME } }
	const semantic = structuredClone(authored)
	delete semantic.slides[1].presenter
	assert.throws(() => expandPresenterDirective(authored, OPTIONS), error => error.code === 'PRESENTER_GEOMETRY_REQUIRED')
	assert.throws(() => expandPresenterDirective(semantic, OPTIONS), error => error.code === 'PRESENTER_GEOMETRY_REQUIRED')
})

test('exact placement preserves approved model, poster, semantic motion and cadence', () => {
	const exact = presenterAt(expandPresenterDirective(source(), OPTIONS))
	const baseline = presenterAt(expandPresenterDirective(source({ exact: false }), OPTIONS))
	for (const key of ['modelAsset', 'posterAsset', 'scene', 'animation', '_presenterMotionId', '_presenterNarrationCue', 'camera', 'trans', '_gestureStyle']) {
		assert.deepEqual(exact[key], baseline[key], `frame override must not change ${key}`)
	}
	assert.equal(exact.modelAsset, MODEL)
	assert.equal(exact.posterAsset, POSTER)
	assert.equal(exact._presenterMotionId, MOTION)
	assert.deepEqual(exact.scene, { animId: 9, loop: true })
	assert.equal(exact.animation[0].duration, 5125, 'a 2-second narration estimate must not accelerate the approved 5.125-second motion')
	assert.equal(exact.nativeOnly, false)
	assert.equal(exact.trans.rot.ay, 0, 'do not reintroduce the old 180-degree basis flip')
	assert.equal(exact.objViewport, Math.round(FRAME.h * 1454545))
})

test('legacy semantic stage path is rejected because engine placement is deactivated', () => {
	const baseline = source({ exact: false })
	delete baseline.presenter.rect
	const visualButUnframed = source()
	delete visualButUnframed.presenter._visualReferenceFrame
	assert.throws(() => expandPresenterDirective(visualButUnframed, OPTIONS), error => error.code === 'PRESENTER_GEOMETRY_REQUIRED')
	assert.throws(() => expandPresenterDirective(baseline, OPTIONS), error => error.code === 'PRESENTER_GEOMETRY_REQUIRED')
})

test('exact frames do not auto-add Morph; explicit transitions remain authored', () => {
	const authored = source()
	authored.slides[2].transition = { type: 'fade', duration: 500 }
	const expanded = expandPresenterDirective(authored, OPTIONS)
	assert.equal(expanded.slides[0].transition, undefined)
	assert.equal(expanded.slides[1].transition, undefined)
	assert.deepEqual(expanded.slides[2].transition, authored.slides[2].transition)
	assert.equal(expandPresenterDirective(source({ exact: false }), OPTIONS).slides[1].transition, undefined)
})

test('exact frame clears stale semantic half-stage exclusion without moving the frame', () => {
	const authored = source()
	authored.presenter.stage = 'left'
	authored.slides[0].presenterZone = { x0: 0.1, x1: 6.66 }
	const expanded = expandPresenterDirective(authored, OPTIONS)
	assert.deepEqual(presenterAt(expanded).bbox, FRAME)
	assert.equal(expanded.slides[0].presenterZone, undefined)
	assert.equal(presenterAt(expanded)._choreo.warnings.includes('CONTENT_ZONE'), false)
	assert.deepEqual(authored.slides[0].presenterZone, { x0: 0.1, x1: 6.66 })
})

test('plan readback and emitted presenter report the same exact frame and scope', () => {
	const authored = source()
	authored.slides[1].presenter = { _visualReferenceFrame: { ...FRAME, x: 8.33123456 } }
	const expanded = expandPresenterDirective(authored, OPTIONS)
	const planned = planPresenterGestures(authored, OPTIONS)
	for (const [index, entry] of planned.perSlide.entries()) {
		assert.deepEqual(entry.placement.frame, presenterAt(expanded, index).bbox)
		assert.equal(entry.placement.source, 'visual-reference-pixels')
		assert.equal(entry.placement.scope, index === 1 ? 'slide' : 'deck')
		assert.equal(entry.motionId, MOTION)
		assert.equal(entry.valid, presenterAt(expanded, index)._choreo.valid)
	}
})

test('the normalized bridge cannot be consumed outside explicit pixel mode', () => {
	for (const change of [
		spec => { delete spec.visualReference },
		spec => { delete spec.authoringContract },
		spec => { spec.authoringContract.placementPolicy = 'semantic-layout-only' },
		spec => { spec.visualReference.coordinateMode = 'inches' },
	]) {
		const authored = source(); change(authored)
		assert.throws(() => expandPresenterDirective(authored, OPTIONS), error => error.code === 'PRESENTER_PIXEL_FRAME_CONTEXT_REQUIRED')
	}
})

test('invalid resolved frames fail rather than receiving fallback geometry', () => {
	for (const frame of [
		{ ...FRAME, w: 0 }, { ...FRAME, h: -1 }, { ...FRAME, x: '9' },
		{ ...FRAME, y: NaN }, { ...FRAME, w: Infinity }, { x: 1, y: 1, w: 2 }, [],
	]) {
		const authored = source(); authored.presenter._visualReferenceFrame = frame
		assert.throws(() => expandPresenterDirective(authored, OPTIONS), error => error.code === 'PRESENTER_PIXEL_FRAME_INVALID')
	}
})

test('near-edge exact frames are not pulled into the legacy compatibility gutter', () => {
	const authored = source()
	const edge = { x: 12.70123456, y: 0.01, w: 0.6, h: 7.47 }
	authored.presenter._visualReferenceFrame = edge
	const expanded = expandPresenterDirective(authored, OPTIONS)
	assert.deepEqual(presenterAt(expanded).bbox, edge)
})

test('static and reduced policies keep the exact frame and approved asset identity', () => {
	for (const policy of ['static', 'reduced']) {
		const expanded = expandPresenterDirective({ ...source(), motionPolicy: policy }, OPTIONS)
		const governed = applyMotionPolicy(expanded)
		const presenter = presenterAt(governed)
		assert.deepEqual(presenter.bbox, FRAME)
		assert.equal(presenter.modelAsset, MODEL)
		assert.equal(presenter.posterAsset, POSTER)
		if (policy === 'static') {
			assert.equal(presenter.animation, undefined)
			assert.equal(presenter.scene, undefined)
		}
	}
})

test('an already placed presenter is never duplicated by the exact-frame path', () => {
	const authored = source()
	const first = expandPresenterDirective(authored, OPTIONS)
	const second = expandPresenterDirective(first, OPTIONS)
	for (const slide of second.slides) assert.equal(slide.content.filter(item => item.name === 'presenter').length, 1)
	assert.deepEqual(second.slides, first.slides)
})
