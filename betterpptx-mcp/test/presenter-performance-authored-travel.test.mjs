import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import Ajv from 'ajv'
import { normalizePresenterPerformance } from '../presenter-performance-contract.mjs'
import { expandPresenterPerformances } from '../ir/presenter-director.mjs'
import { TOOLS } from '../tools.mjs'

const withoutDescriptions = value => Array.isArray(value) ? value.map(withoutDescriptions) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'description').map(([key, part]) => [key, withoutDescriptions(part)])) : value

test('public and portable schemas advertise exact travel centers and reject stage-only keys', () => {
	const tool = TOOLS.find(entry => entry.name === 'betterpptx.deck.generate_from_spec')
	const publicPerformance = tool.inputSchema.properties.spec.properties.slides.items.properties.presenterPerformance.oneOf[0]
	const portable = JSON.parse(fs.readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8')).$defs.presenterPerformance.oneOf[0]
	for (const field of ['frame', 'travel']) assert.deepEqual(withoutDescriptions(publicPerformance.properties[field]), withoutDescriptions(portable.properties[field]))
	const validatePublic = new Ajv({ strict: false }).compile(publicPerformance)
	const validatePortable = new Ajv({ strict: false }).compile(portable)
	const valid = { actions: [{ id: 'walk', motionId: 'motion.generic.walk', durationMs: 1000 }], frame: { x: 1, y: 2, w: 2, h: 4 }, travel: [{ atMs: 0, center: { x: 2, y: 4 }, stage: 'left' }, { atMs: 500, center: { x: 5, y: 4 }, stage: 'right' }] }
	assert.equal(validatePublic(valid), true, JSON.stringify(validatePublic.errors))
	assert.equal(validatePortable(valid), true, JSON.stringify(validatePortable.errors))
	const old = structuredClone(valid)
	delete old.travel[1].center
	assert.equal(validatePublic(old), false)
	assert.equal(validatePortable(old), false)
})

const motionPath = animation => {
	const words = animation.motionPathData.split(/\s+/)
	assert.deepEqual([words[0], words[3], words[6]], ['M', 'L', 'E'])
	return { start: [Number(words[1]), Number(words[2])], end: [Number(words[4]), Number(words[5])] }
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`)

function fixture({ actorId, size, frame, centers }) {
	const performance = normalizePresenterPerformance({
		actor: actorId, frame, startMs: 250, blendMs: 0,
		actions: [{ id: 'cross', motionId: 'motion.generic.walk', durationMs: 1500 }],
		travel: centers.map((center, index) => ({ atMs: [0, 500, 1100][index], center, stage: ['left', 'center', 'right'][index] })),
	})
	const spec = { slides: [{ id: `slide-${actorId}`, content: [] }] }
	const report = { modelHeight: 2, floorY: 0, stageAnchor: [0, 0, 0], transformSamples: [], actions: [{ id: 'cross', motionId: 'motion.generic.walk', startMs: 0, endMs: 1500, durationMs: 1500, cycles: 1 }] }
	const actor = { id: actorId, stageTreatment: 'floor-ellipse', scale: 1 }
	return { spec, options: { slideSize: size, performances: [{ slideIndex: 0, handle: 'gen://rigged3d/0123456789abcdef0123456789abcdef01234567', performance, actor, report }] } }
}

for (const example of [
	{ actorId: 'guide-blue', size: { w: 16, h: 9 }, frame: { x: 1, y: 2, w: 2, h: 4 }, centers: [{ x: 2, y: 4 }, { x: 6, y: 4 }, { x: 12, y: 4 }] },
	{ actorId: 'guide-amber', size: { w: 9, h: 12 }, frame: { x: 6, y: 3, w: 1.5, h: 5 }, centers: [{ x: 6.75, y: 5.5 }, { x: 4, y: 5.5 }, { x: 1.2, y: 5.5 }] },
]) test(`AI-authored travel moves model and shadow on ${example.size.w}x${example.size.h}`, () => {
	const { spec, options } = fixture(example)
	const before = structuredClone({ spec, options })
	const result = expandPresenterPerformances(spec, options)
	assert.deepEqual({ spec, options }, before)
	const slide = result.slides[0]
	const model = slide.content.find(block => block.kind === 'model3d')
	const shadow = slide.content.find(block => block.objectName === `${example.actorId}.performance-floor`)
	assert.deepEqual(model.bbox, example.frame)
	const modelPaths = model.animation.filter(animation => animation.type === 'motion')
	const shadowPaths = shadow.animation.filter(animation => animation.type === 'motion')
	assert.equal(modelPaths.length, 2)
	assert.equal(shadowPaths.length, 2)
	for (const [index, path] of modelPaths.entries()) {
		assert.equal(path.delay, 250 + [0, 500][index])
		assert.equal(path.duration, [500, 600][index])
		assert.equal(path.motionPathData, shadowPaths[index].motionPathData)
		const points = motionPath(path)
		near(points.start[0] * example.size.w + example.centers[0].x, example.centers[index].x)
		near(points.end[0] * example.size.w + example.centers[0].x, example.centers[index + 1].x)
		near(points.end[1] * example.size.h + example.centers[0].y, example.centers[index + 1].y)
	}
	const readback = result._presenterPerformancePlan
	assert.equal(readback.contractVersion, 'betterpptx.presenter-performance.v2')
	assert.equal(readback.performances[0].travelCoordinateUnit, 'slide-inches')
	assert.deepEqual(readback.performances[0].realizedTravel.map(point => point.center), example.centers)
	const schema = TOOLS.find(tool => tool.name === 'betterpptx.deck.generate_from_spec').outputSchema.properties.data.properties.authoringContracts.properties.presenterPerformance
	const validate = new Ajv({ strict: false }).compile(schema)
	assert.equal(validate(readback), true, JSON.stringify(validate.errors))
})

test('missing, off-stage and inconsistent authored travel rejects instead of shifting the model', () => {
	const basis = { actorId: 'guide', size: { w: 16, h: 9 }, frame: { x: 1, y: 2, w: 2, h: 4 }, centers: [{ x: 2, y: 4 }, { x: 6, y: 4 }, { x: 12, y: 4 }] }
	const missing = fixture(basis)
	delete missing.options.performances[0].performance.travel[1].center
	assert.throws(() => expandPresenterPerformances(missing.spec, missing.options), { code: 'PERFORMANCE_TRAVEL_GEOMETRY_REQUIRED' })
	const offStage = fixture(basis)
	offStage.options.performances[0].performance.travel[2].center.x = 15.5
	assert.throws(() => expandPresenterPerformances(offStage.spec, offStage.options), { code: 'PERFORMANCE_TRAVEL_OFF_STAGE' })
	const mismatch = fixture(basis)
	mismatch.options.performances[0].performance.travel[0].center.x = 3
	assert.throws(() => expandPresenterPerformances(mismatch.spec, mismatch.options), { code: 'PERFORMANCE_TRAVEL_START_MISMATCH' })
})

test('matching per-slide presenter frame overrides deck actor frame; conflicting performance frame rejects', () => {
	const basis = { actorId: 'guide', size: { w: 16, h: 9 }, frame: { x: 1, y: 2, w: 2, h: 4 }, centers: [{ x: 2, y: 4 }, { x: 6, y: 4 }, { x: 12, y: 4 }] }
	const item = fixture(basis)
	delete item.options.performances[0].performance.frame
	item.options.performances[0].actor.rect = { x: 7, y: 2, w: 2, h: 4 }
	item.spec.slides[0].presenter = { id: 'guide', rect: basis.frame }
	assert.deepEqual(expandPresenterPerformances(item.spec, item.options).slides[0].content.find(block => block.kind === 'model3d').bbox, basis.frame)
	item.options.performances[0].performance.frame = { x: 4, y: 2, w: 2, h: 4 }
	assert.throws(() => expandPresenterPerformances(item.spec, item.options), { code: 'PRESENTER_FRAME_CONFLICT' })
})
