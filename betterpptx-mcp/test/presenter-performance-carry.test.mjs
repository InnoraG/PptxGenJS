import assert from 'node:assert/strict'
import test from 'node:test'
import Ajv from 'ajv'
import { normalizePresenterPerformance, PRESENTER_PERFORMANCE_SCHEMA } from '../presenter-performance-contract.mjs'
import { expandPresenterPerformances } from '../ir/presenter-director.mjs'
import { performanceCarryHandSamples } from '../ir/presenter-performance-carry.mjs'
import { timedMotionPathAnimations } from '../ir/timed-motion-path.mjs'
import { carrySegments, synthesizeEffect } from '../ir/synergy-effects.mjs'
import { TOOLS } from '../tools.mjs'

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} differs from ${expected}`)
const carryInput = () => ({ actor: 'independent-performer', startMs: 325, blendMs: 0,
	actions: [{ id: 'prepare', motionId: 'motion.test.prepare', durationMs: 600 }, { id: 'transport', motionId: 'motion.test.transfer', durationMs: 1000 }, { id: 'finish', motionId: 'motion.test.finish', durationMs: 400 }],
	travel: [{ atMs: 0, center: { x: 2, y: 4 }, stage: 'left' }, { atMs: 1100, center: { x: 4, y: 4 }, stage: 'center' }, { atMs: 1900, center: { x: 6, y: 4 }, stage: 'right' }],
	interactions: [{ actionId: 'transport', verb: 'carry', target: 'independent-prop', hand: 'right', grabMs: 100, dropMs: 1000 }],
})

test('carry has one public typed action-local clock without changing the performance clock', () => {
	const input = carryInput(), before = structuredClone(input), normalized = normalizePresenterPerformance(input)
	assert.deepEqual(input, before)
	assert.deepEqual(normalized.interactions, input.interactions)
	assert.equal(normalized.durationMs, 2000)
	const validate = new Ajv({ strict: false }).compile(PRESENTER_PERFORMANCE_SCHEMA)
	assert.equal(validate(input), true, JSON.stringify(validate.errors))
	for (const key of ['hand', 'grabMs', 'dropMs']) {
		const incomplete = structuredClone(input); delete incomplete.interactions[0][key]
		assert.equal(validate(incomplete), false)
		assert.throws(() => normalizePresenterPerformance(incomplete), error => error.code === 'PRESENTER_PERFORMANCE_INVALID' && error.field.endsWith(key))
	}
	for (const patch of [{ hand: 'both' }, { grabMs: -1 }, { grabMs: 1000 }, { dropMs: 1001 }, { dropMs: 100 }, { grabMs: 0.5 }, { dropMs: '800' }]) {
		const invalid = structuredClone(input); Object.assign(invalid.interactions[0], patch)
		assert.throws(() => normalizePresenterPerformance(invalid), error => error.code === 'PRESENTER_PERFORMANCE_INVALID')
	}
	for (const verb of ['touch', 'press', 'push', 'point-at']) {
		const invalid = structuredClone(input); invalid.interactions[0].verb = verb
		assert.equal(validate(invalid), false)
		assert.throws(() => normalizePresenterPerformance(invalid), /only supported for carry/)
	}
})

function stagingFixture(size, hand, yaw) {
	const input = carryInput(); input.interactions[0].hand = hand
	const performance = normalizePresenterPerformance(input)
	const frameH = size.h * .76, frameW = Math.min(size.w * .44, frameH)
	const renderedH = size.h * .46
	const firstX = Math.max(frameW / 2 + .05, Math.min(size.w - frameW / 2 - .05, size.w * .235))
	const y = size.h * .84 - renderedH / 2
	performance.frame = { x: firstX - frameW / 2, y: y - frameH / 2, w: frameW, h: frameH }
	performance.travel = performance.travel.map((key, index) => ({ ...key, center: { x: [firstX, size.w * .5, size.w * .745][index], y } }))
	const measurements = [[600, .05], [700, .08], [850, .12], [1100, .10], [1400, .06], [1600, .04]]
	const hands = measurements.map(([atMs, x]) => ({ atMs, [hand]: { normalizedPosition: { x: x * (hand === 'left' ? -1 : 1), yAboveFloor: .54, z: .04 } } }))
	const report = { modelHeight: 2, floorY: 0, stageAnchor: [0, 0, 0], transformSamples: [],
		actions: performance.actions.map((action, index) => ({ ...action, startMs: [0, 600, 1600][index], endMs: [600, 1600, 2000][index], handSamples: index === 1 ? hands : [] })) }
	const grabCenterX = firstX + (size.w * .5 - firstX) * 700 / 1100
	const grabHandX = .08 * (hand === 'left' ? -1 : 1)
	const facing = yaw * Math.PI / 180
	const box = { x: grabCenterX + (grabHandX * Math.cos(facing) + .04 * Math.sin(facing)) * renderedH - .2, y: y - .04 * renderedH - .15, w: .4, h: .3 }
	const spec = { title: 'Generic carry', slides: [{ id: 'transfer-slide', content: [{ kind: 'shape', shapeName: 'rect', name: 'independent-prop', objectName: 'independent-prop', bbox: box }] }] }
	const actor = { id: performance.actor, faceRotationY: yaw, stage: 'left', scale: 1, stageTreatment: 'floor-ellipse' }
	const options = { slideSize: size, performances: [{ slideIndex: 0, handle: 'gen://rigged3d/0123456789abcdef0123456789abcdef01234567', performance, actor, report }] }
	return { spec, options, performance, report, box }
}
function endpoints(animation) {
	const tokens = animation.motionPathData.split(/\s+/)
	assert.deepEqual([tokens[0], tokens[3], tokens[6]], ['M', 'L', 'E'])
	return { start: [Number(tokens[1]), Number(tokens[2])], end: [Number(tokens[4]), Number(tokens[5])] }
}
function centerAtFromNative(model, atMs, size) {
	const initial = [model.bbox.x + model.bbox.w / 2, model.bbox.y + model.bbox.h / 2]
	const paths = model.animation.filter(animation => animation.type === 'motion').sort((a, b) => a.delay - b.delay)
	let offset = [0, 0]
	for (const animation of paths) {
		if (atMs < animation.delay) break
		const path = endpoints(animation), fraction = Math.min(1, (atMs - animation.delay) / animation.duration)
		offset = path.start.map((value, i) => value + (path.end[i] - value) * fraction)
		if (fraction < 1) break
	}
	return [initial[0] + offset[0] * size.w, initial[1] + offset[1] * size.h]
}

test('public carry readback validates absolute times beyond the action-local schema ceiling', () => {
	const schema = TOOLS.find(tool => tool.name === 'betterpptx.deck.generate_from_spec').outputSchema.properties.data.properties.authoringContracts.properties.presenterPerformance
	const validate = new Ajv({ strict: false }).compile(schema)
	for (const startMs of [325, 60000]) {
		const fixture = stagingFixture({ w: 16, h: 9 }, 'right', 0)
		fixture.performance.startMs = startMs
		const result = expandPresenterPerformances(fixture.spec, fixture.options)._presenterPerformancePlan
		assert.equal(validate(result), true, JSON.stringify(validate.errors))
		assert.equal(result.performances[0].interactions[0].grabMs, startMs + 700)
		assert.equal(result.performances[0].interactions[0].dropMs, startMs + 1600)
	}
})

for (const size of [{ w: 16, h: 9 }, { w: 9, h: 12 }]) for (const hand of ['left', 'right']) for (const yaw of [0, 63]) {
	test(`native carry follows selected ${hand} hand, ${yaw} degree facing and stage travel on ${size.w} by ${size.h}`, () => {
		const fixture = stagingFixture(size, hand, yaw), before = structuredClone(fixture)
		const result = expandPresenterPerformances(fixture.spec, fixture.options)
		assert.deepEqual(fixture, before, 'staging is pure')
		const slide = result.slides[0], prop = slide.content.find(item => item.name === 'independent-prop'), model = slide.content.find(item => item.kind === 'model3d')
		assert.equal(slide.content.filter(item => item.kind === 'model3d').length, 1)
		const transport = fixture.report.actions[1], interaction = fixture.performance.interactions[0]
		const handSamples = performanceCarryHandSamples({ action: transport, ...interaction }, fixture.performance.travel.map(key => key.atMs))
		assert.equal(prop.animation.length, handSamples.length - 1)
		assert.equal(prop.animation[0].delay, 1025)
		assert.equal(prop.animation.at(-1).delay + prop.animation.at(-1).duration, 1925)
		const propCenter = [fixture.box.x + fixture.box.w / 2, fixture.box.y + fixture.box.h / 2]
		const radians = yaw * Math.PI / 180, renderedH = size.h * .46
		for (const [index, animation] of prop.animation.entries()) {
			assert.equal(animation.motionEasing, 'linear')
			assert.equal(animation.trigger, 'withPrevious')
			assert.equal(animation.pathData, animation.motionPathData)
			assert.equal(animation.delay, fixture.performance.startMs + handSamples[index].atMs)
			assert.equal(animation.duration, handSamples[index + 1].atMs - handSamples[index].atMs)
			const path = endpoints(animation)
			if (index) assert.deepEqual(path.start, endpoints(prop.animation[index - 1]).end)
			for (const [point, sample] of [[path.start, handSamples[index]], [path.end, handSamples[index + 1]]]) {
				const bodyCenter = centerAtFromNative(model, fixture.performance.startMs + sample.atMs, size), norm = sample.normalizedPosition
				close(propCenter[0] + point[0] * size.w, bodyCenter[0] + (norm.x * Math.cos(radians) + norm.z * Math.sin(radians)) * renderedH)
				close(propCenter[1] + point[1] * size.h, bodyCenter[1] + (.5 - norm.yAboveFloor) * renderedH)
			}
		}
		for (const item of slide.content) for (const animation of item.animation || []) if (animation.type === 'motion') assert.equal(animation.motionEasing, 'linear')
		const readback = result._presenterPerformancePlan.performances[0].interactions[0]
		assert.equal(readback.hand, hand); assert.equal(readback.grabMs, 1025); assert.equal(readback.dropMs, 1925)
		assert.equal(readback.realization, 'native-projected-hand-follow')
		assert.equal(readback.stageTravelIncluded, true)
	})
}

for (const [name, mutate, code] of [
	['missing hand measurement', f => { delete f.report.actions[1].handSamples[2].right }, 'PERFORMANCE_CARRY_UNRESOLVED'],
	['unmeasured endpoint', f => { f.report.actions[1].handSamples.pop() }, 'PERFORMANCE_CARRY_UNRESOLVED'],
	['authored target animation', f => { f.spec.slides[0].content[0].animation = { type: 'emphasis', effect: 'pulse' } }, 'PERFORMANCE_CARRY_CONFLICT'],
	['authored target timeline', f => { f.spec.slides[0].timeline = [{ objectName: 'independent-prop', type: 'motion', effect: 'left' }] }, 'PERFORMANCE_CARRY_CONFLICT'],
	['3D physics target', f => { f.spec.slides[0].content[0].kind = 'model3d' }, 'PERFORMANCE_TARGET_UNSUPPORTED'],
	['authored path misses item', f => { f.performance.travel[1].center.x += 1 }, 'PERFORMANCE_TARGET_UNREACHABLE'],
	['unreachable target', f => { f.spec.slides[0].content[0].bbox.y = 0 }, 'PERFORMANCE_TARGET_UNREACHABLE'],
	['off-stage carried trajectory', f => { f.report.actions[1].handSamples.at(-1).right.normalizedPosition.x = 100 }, 'PERFORMANCE_CARRY_TARGET_OFF_STAGE'],
	['overlapping entrance', f => { f.performance.entry = { type: 'fade', durationMs: 900 } }, 'PERFORMANCE_CARRY_CONFLICT'],
	['overlapping exit', f => { f.performance.exit = { type: 'fade', atMs: 1200, durationMs: 800 } }, 'PERFORMANCE_CARRY_CONFLICT'],
]) test(`carry explicitly rejects ${name}`, () => {
	const fixture = stagingFixture({ w: 16, h: 9 }, 'right', 0); mutate(fixture)
	assert.throws(() => expandPresenterPerformances(fixture.spec, fixture.options), error => error.code === code)
})

test('legacy carry and shared paths preserve interior timestamps rather than only spatial vertices', () => {
	const make = midpoint => ({ grabMs: 0, dropMs: 1000, samples: [[0, 0, 0], [midpoint, 1, 0], [1000, 2, 0]] })
	const fast = synthesizeEffect('carry', { segment: make(100) }), slow = synthesizeEffect('carry', { segment: make(900) })
	assert.deepEqual(fast.map(animation => animation.duration), [100, 900])
	assert.deepEqual(slow.map(animation => animation.duration), [900, 100])
	assert.notDeepEqual(fast, slow)
	assert.deepEqual(endpoints(fast[0]).end, endpoints(fast[1]).start)
	for (const samples of [[], [[0, 1, 2]], [[1, 0, 0], [0, 1, 1]], [[0, 0, 0], [0, 1, 1]], [[0, 0, 0], [1, Infinity, 0]]]) {
		assert.throws(() => timedMotionPathAnimations(samples), error => error.code === 'TIMED_MOTION_PATH_INVALID')
		assert.throws(() => carrySegments(samples), error => error.code === 'TIMED_MOTION_PATH_INVALID')
	}
	const plateau = [[0, 0, 0], [100, 0, 0], [200, 0, 0], [300, 0, 0], [400, .5, 0], [500, 1, 0], [600, 1, 0], [700, 1, 0], [800, 1, 0]]
	const segments = carrySegments(plateau)
	assert.equal(segments.length, 1)
	assert.equal(new Set(segments[0].samples.map(sample => sample[0])).size, segments[0].samples.length, 'a uniform endpoint is not duplicated')
	assert.ok(synthesizeEffect('carry', { segment: segments[0] }).length > 0)
})
