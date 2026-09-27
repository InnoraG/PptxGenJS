import assert from 'node:assert/strict'
import { test } from 'node:test'

import { expandPresenterPerformances } from '../ir/presenter-director.mjs'

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-5, message || `${actual} differs from ${expected}`)
const center = rectangle => ({ x: rectangle.x + rectangle.w / 2, y: rectangle.y + rectangle.h / 2 })
const inCanvas = (rectangle, size) => {
	assert.ok(rectangle.x >= -1e-5 && rectangle.y >= -1e-5, 'frame begins within the canvas')
	assert.ok(rectangle.x + rectangle.w <= size.w + 1e-5 && rectangle.y + rectangle.h <= size.h + 1e-5, 'frame ends within the canvas')
}
function pathPoints(animation) {
	const parts = animation.motionPathData.trim().split(/\s+/)
	assert.deepEqual([parts[0], parts[3], parts[6]], ['M', 'L', 'E'])
	const values = [parts[1], parts[2], parts[4], parts[5]].map(Number)
	assert.ok(values.every(Number.isFinite), 'native travel coordinates are finite')
	return { start: { x: values[0], y: values[1] }, end: { x: values[2], y: values[3] } }
}
function worldPoint(rectangle, point, size) {
	const origin = center(rectangle)
	return { x: origin.x + point.x * size.w, y: origin.y + point.y * size.h }
}

// No presenter files, catalogs or model loader are required: this tests exact
// AI-authored frames and travel centers with opaque performer identities.
function expandCase({ name, startMs, entry, size }) {
	const actorId = `performer-${name}-${size.w}`
	const handle = 'gen://rigged3d/0123456789abcdef0123456789abcdef01234567'
	const actions = [
		{ id: 'opening-gesture', motionId: 'motion.example.salute', durationMs: 2100, cycles: 1 },
		{ id: 'cross-stage', motionId: 'motion.example.stride', durationMs: 4300, cycles: 2 },
	]
	const frame = { x: size.w * 0.1, y: size.h * 0.2, w: size.w * 0.3, h: size.h * 0.6 }
	const y = frame.y + frame.h / 2
	const performance = {
		actor: actorId, frame, startMs, durationMs: 6400, blendMs: 240, actions,
		transforms: [{ atMs: 0, scale: 1 }, { atMs: 3200, yawDegrees: 63, scale: 1.1 }],
		travel: [{ atMs: 0, center: { x: size.w * 0.25, y }, stage: 'left' }, { atMs: 1000, center: { x: size.w * 0.5, y }, stage: 'center' }, { atMs: 3300, center: { x: size.w * 0.75, y }, stage: 'right' }, { atMs: 5100, center: { x: size.w * 0.5, y }, stage: 'center' }],
		exit: { type: 'fade', atMs: 5700, durationMs: 700 },
		...(entry ? { entry } : {}),
	}
	const floorY = .17, modelHeight = 2.3, stageAnchor = [.13, floorY, -.4]
	const report = {
		modelHeight, floorY, stageAnchor,
		actions: actions.map((action, index) => ({ ...action, startMs: index ? 2100 : 0, endMs: index ? 6400 : 2100 })),
		transformSamples: [0, 600, 1000, 3300, 5100, 6400].map(atMs => ({ atMs, bounds: { min: [-.27, floorY, -.6], max: [.53, floorY + modelHeight, -.2] } })),
	}
	const spec = { title: 'Synthetic shared staging', slides: [{ id: `slide-${name}`, content: [{ kind: 'text', name: 'existing-copy', text: 'Existing editable content' }] }] }
	const before = structuredClone({ spec, performance, report })
	const result = expandPresenterPerformances(spec, { slideSize: size, performances: [{ slideIndex: 0, handle, performance, report, actor: { id: actorId, scale: 1, faceRotationY: 27, stageTreatment: 'floor-ellipse' } }] })
	assert.deepEqual({ spec, performance, report }, before, 'shared staging does not mutate caller inputs')
	const slide = result.slides[0], model = slide.content.find(block => block.kind === 'model3d'), shadow = slide.content.find(block => block.objectName === `${actorId}.performance-floor`)
	assert.equal(slide.content.filter(block => block.kind === 'model3d').length, 1)
	assert.equal(model.objectName, actorId)
	assert.equal(model.modelAsset, handle)
	assert.ok(shadow, 'an explicitly requested shadow is created')
	inCanvas(shadow.bbox, size)
	const scene = model.animation.filter(animation => animation.effect === 'playScene')
	assert.equal(scene.length, 1)
	assert.equal(scene[0].delay, startMs)
	assert.equal(scene[0].duration, performance.durationMs)
	assert.equal(scene[0].trigger, 'withPrevious')
	return { slide, model, shadow, performance }
}

const sizes = [{ w: 16, h: 9 }, { w: 9, h: 12 }]
const entranceCases = [
	{ name: 'drop', startMs: 0, entry: { type: 'drop', durationMs: 540, fadeMs: 180, height: .3 } },
	{ name: 'fade', startMs: 430, entry: { type: 'fade', durationMs: 360 } },
	{ name: 'appear', startMs: 0, entry: { type: 'appear', durationMs: 0 } },
]

for (const size of sizes) for (const scenario of entranceCases) {
	test(`${scenario.name} stages an arbitrary presenter fully above ${size.w} by ${size.h} until its native entrance`, () => {
		const { slide, model, shadow, performance } = expandCase({ ...scenario, size })
		assert.ok(model.bbox.y + model.bbox.h < 0, 'the entire initial frame is above the canvas')
		const proof = model._presenterPerformanceEntry
		assert.deepEqual(proof.initialFrame, model.bbox)
		assert.deepEqual(slide._presenterPerformanceVisibleBounds.entry, proof)
		inCanvas(proof.stageFrame, size)
		const entrance = model.animation.filter(animation => animation.type === 'entrance')
		assert.equal(entrance.length, 1)
		assert.equal(entrance[0].delay, scenario.startMs)
		assert.equal(entrance[0].trigger, 'withPrevious')
		assert.equal(entrance[0].effect, scenario.name === 'drop' || scenario.name === 'fade' ? 'fade' : 'appear')
		const movements = model.animation.filter(animation => animation.type === 'motion')
		const arrival = movements[0], arrivalPath = pathPoints(arrival)
		assert.equal(arrival.delay, scenario.startMs)
		assert.equal(arrival.duration, scenario.entry?.type === 'drop' ? scenario.entry.durationMs : 1)
		assert.equal(arrival.trigger, 'withPrevious')
		assert.deepEqual(arrivalPath.start, { x: 0, y: 0 })
		const arrivalEnd = worldPoint(model.bbox, arrivalPath.end, size), stageCenter = center(proof.stageFrame)
		close(arrivalEnd.x, stageCenter.x)
		close(arrivalEnd.y, stageCenter.y)
		const shadowMovements = shadow.animation.filter(animation => animation.type === 'motion')
		assert.ok(shadowMovements.length >= 2, 'the shadow follows authored stage travel')
		for (const animation of shadowMovements) {
			const path = pathPoints(animation)
			close(path.start.y, 0, 'shadow starts from its ground position, not the offstage presenter origin')
			close(path.end.y, 0, 'shadow remains at ground level throughout travel')
		}
		assert.equal(shadowMovements[0].delay, scenario.startMs, 'shadow travel retains the authored stage clock')
		assert.ok(movements.length > 1, 'travel continues after entry')
		close(movements[1].delay, arrival.delay + arrival.duration, 'the first travel segment begins exactly after entry')
		let previousEnd = arrivalEnd
		for (const movement of movements.slice(1)) {
			const path = pathPoints(movement), from = worldPoint(model.bbox, path.start, size), to = worldPoint(model.bbox, path.end, size)
			close(from.x, previousEnd.x, 'adjacent movement paths meet horizontally')
			close(from.y, previousEnd.y, 'adjacent movement paths meet vertically')
			close(path.start.y, arrivalPath.end.y, 'follow-on travel retains the offstage-to-stage offset')
			close(path.end.y, arrivalPath.end.y, 'follow-on travel does not jump back above the canvas')
			inCanvas({ ...model.bbox, x: to.x - model.bbox.w / 2, y: to.y - model.bbox.h / 2 }, size)
			const shadowMotion = shadowMovements.find(animation => animation.delay + animation.duration === movement.delay + movement.duration)
			assert.ok(shadowMotion, 'performer and shadow reach each travel destination together')
			const shadowEnd = worldPoint(shadow.bbox, pathPoints(shadowMotion).end, size)
			close(to.x, shadowEnd.x, 'ground shadow stays horizontally beneath its performer')
			previousEnd = to
		}
		const exit = model.animation.find(animation => animation.type === 'exit')
		assert.equal(exit.delay, performance.startMs + performance.exit.atMs)
		assert.equal(exit.duration, performance.exit.durationMs)
	})
}

for (const size of sizes) test(`immediate performance without entrance remains on the ${size.w} by ${size.h} stage`, () => {
	const { model, shadow } = expandCase({ name: 'immediate', startMs: 0, size })
	inCanvas(model.bbox, size)
	assert.equal(model._presenterPerformanceEntry, undefined)
	assert.equal(model.animation.filter(animation => animation.type === 'entrance').length, 0)
	const movements = model.animation.filter(animation => animation.type === 'motion'), shadowMovements = shadow.animation.filter(animation => animation.type === 'motion')
	assert.equal(movements.length, shadowMovements.length)
	for (const [index, movement] of movements.entries()) {
		assert.equal(movement.delay, shadowMovements[index].delay)
		assert.equal(movement.duration, shadowMovements[index].duration)
		assert.equal(movement.motionPathData, shadowMovements[index].motionPathData)
		close(pathPoints(movement).start.y, 0)
		close(pathPoints(movement).end.y, 0)
	}
})

for (const size of sizes) test(`a delayed performance without an authored entrance remains staged on ${size.w} by ${size.h}`, () => {
	const { model } = expandCase({ name: 'delayed', startMs: 850, size })
	inCanvas(model.bbox, size)
	assert.equal(model._presenterPerformanceEntry, undefined)
	assert.equal(model.animation.filter(animation => animation.type === 'entrance').length, 0)
	assert.equal(model.animation.find(animation => animation.effect === 'playScene').delay, 850)
})
