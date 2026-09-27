import assert from 'node:assert/strict'
import { test } from 'node:test'

import { composePresenterPerformance, validatedPresenterPerformanceRecipe } from '../ir/presenter-performance-composer.mjs'
import { parseGlb, serializeGlb } from '../ir/kinetic-transplant.mjs'
import { getCachedGeneratedRigged3d, materializePresenterPerformance, parseGenRigged3dHandle, registerLocalRigged3d } from '../assets/model3d-gen-providers.mjs'

const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const clipMap = { 'motion.test.idle': 0, 'motion.test.push': 1, 'motion.test.jump': 2, 'motion.test.fold': 3, 'motion.test.offset': 4 }

// Tiny genuinely skinned humanoid: shoes, head, and hands all respond to joint
// transforms. The optional nonidentity parent detects wrong local/world-space
// baking, and anonymous names prove that composition is not tied to one rig.
function fixture({ anonymous = false, transformedParent = false } = {}) {
	const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [], meshes: [], skins: [], animations: [], buffers: [{ byteLength: 0 }], bufferViews: [], accessors: [] }
	const parts = []; let byteLength = 0
	function append(rows, type, componentType = 5126) {
		const width = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[type], componentBytes = componentType === 5123 ? 2 : 4
		if (byteLength % 4) { const padding = Buffer.alloc(4 - byteLength % 4); parts.push(padding); byteLength += padding.length }
		const buffer = Buffer.alloc(rows.length * width * componentBytes)
		rows.forEach((row, index) => row.forEach((value, component) => buffer[componentType === 5123 ? 'writeUInt16LE' : 'writeFloatLE'](value, (index * width + component) * componentBytes)))
		const bufferView = json.bufferViews.length; json.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: buffer.length }); parts.push(buffer); byteLength += buffer.length
		const index = json.accessors.length; json.accessors.push({ bufferView, componentType, type, count: rows.length }); return index
	}
	json.nodes = [
		{ name: 'Stage parent', children: [1, 7], ...(transformedParent ? { translation: [.4, .1, -.2], rotation: [0, Math.sin(Math.PI / 12), 0, Math.cos(Math.PI / 12)], scale: [2, 2, 2] } : {}) },
		{ name: 'Pelvis', translation: [0, 1, 0], children: [2, 3, 4, 5, 6] },
		{ name: 'LeftHand', translation: [.5, .25, .25] },
		{ name: 'RightHand', translation: [-.5, .25, .25] },
		{ name: 'LeftFoot', translation: [.15, -1, 0] },
		{ name: 'RightFoot', translation: [-.15, -1, 0] },
		{ name: 'Head', translation: [0, .8, 0] },
		{ name: 'Body', mesh: 0, skin: 0 },
	]
	if (anonymous) json.nodes.forEach((node, index) => { node.name = `part-${index}` })
	const positions = [[.1, 0, -.1], [.2, 0, .1], [-.2, 0, -.1], [-.1, 0, .1], [0, 1.8, 0], [.5, 1.25, .25], [-.5, 1.25, .25], [0, 1, 0]]
	const indices = [3, 3, 4, 4, 5, 1, 2, 0]
	const bindings = [[0, 1, 0], [.5, 1.25, .25], [-.5, 1.25, .25], [.15, 0, 0], [-.15, 0, 0], [0, 1.8, 0]].map(position => { const result = identity(); position.forEach((value, axis) => { result[12 + axis] = -value }); return result })
	json.skins.push({ skeleton: 1, joints: [1, 2, 3, 4, 5, 6], inverseBindMatrices: append(bindings, 'MAT4') })
	json.meshes.push({ primitives: [{ attributes: { POSITION: append(positions, 'VEC3'), JOINTS_0: append(indices.map(index => [index, 0, 0, 0]), 'VEC4', 5123), WEIGHTS_0: append(positions.map(() => [1, 0, 0, 0]), 'VEC4') } }] })
	const input = append([[0], [.5], [1]], 'SCALAR')
	const rootRotations = append([[0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1]], 'VEC4')
	const rootTranslation = append([[0, 1, 0], [0, .7, 0], [0, 1, 0]], 'VEC3')
	const push = append([[-.5, .25, .25], [-.5, .25, .85], [-.5, .25, .25]], 'VEC3')
	const jumpInput = append([[0], [.15], [.5], [.85], [1]], 'SCALAR')
	const jumpRoot = append([[0, 1, 0], [0, .8, 0], [0, 1.6, 0], [0, .9, 0], [0, 1, 0]], 'VEC3')
	const jumpLeftFoot = append([[.15, -1, 0], [.15, -1, 0], [.15, -.8, 0], [.15, -1, 0], [.15, -1, 0]], 'VEC3')
	const jumpRightFoot = append([[-.15, -1, 0], [-.15, -1, 0], [-.15, -.8, 0], [-.15, -1, 0], [-.15, -1, 0]], 'VEC3')
	const foldRoot = append([[0, 1, 0], [0, .99, 0], [0, .95, 0], [0, .99, 0], [0, 1, 0]], 'VEC3')
	const offsetRoot = append([[0, 1.2, 0], [0, 1.2, 0], [0, 1.2, 0]], 'VEC3')
	json.animations = [
		{ name: 'rest', samplers: [{ input, output: rootRotations }], channels: [{ sampler: 0, target: { node: 1, path: 'rotation' } }] },
		{ name: 'reach', samplers: [{ input, output: rootTranslation }, { input, output: push }], channels: [{ sampler: 0, target: { node: 1, path: 'translation' } }, { sampler: 1, target: { node: 3, path: 'translation' } }] },
		{ name: 'airborne', samplers: [{ input: jumpInput, output: jumpRoot }, { input: jumpInput, output: jumpLeftFoot }, { input: jumpInput, output: jumpRightFoot }], channels: [{ sampler: 0, target: { node: 1, path: 'translation' } }, { sampler: 1, target: { node: 4, path: 'translation' } }, { sampler: 2, target: { node: 5, path: 'translation' } }] },
		{ name: 'fold', samplers: [{ input: jumpInput, output: foldRoot }, { input: jumpInput, output: jumpLeftFoot }, { input: jumpInput, output: jumpRightFoot }], channels: [{ sampler: 0, target: { node: 1, path: 'translation' } }, { sampler: 1, target: { node: 4, path: 'translation' } }, { sampler: 2, target: { node: 5, path: 'translation' } }] },
		{ name: 'offset', samplers: [{ input, output: offsetRoot }], channels: [{ sampler: 0, target: { node: 1, path: 'translation' } }] },
	]
	json.buffers[0].byteLength = byteLength
	return serializeGlb(json, Buffer.concat(parts))
}

function decode(asset, accessorIndex) {
	const accessor = asset.json.accessors[accessorIndex], view = asset.json.bufferViews[accessor.bufferView], width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type]
	return Array.from({ length: accessor.count }, (_, index) => Array.from({ length: width }, (_, component) => asset.bin.readFloatLE((view.byteOffset || 0) + (accessor.byteOffset || 0) + (index * width + component) * 4)))
}
test('composed hand trajectories retain every frame and both sides of an action boundary', () => {
	const performance = { actions: [{ id: 'first', motionId: 'motion.test.idle', durationMs: 1000 }, { id: 'second', motionId: 'motion.test.push', durationMs: 1000 }], blendMs: 240 }
	const result = composePresenterPerformance({ glbBytes: fixture(), clipMap, performance, fps: 30 })
	for (const action of result.report.actions) {
		assert.ok(action.handSamples.length >= 31)
		assert.equal(action.handSamples[0].atMs, action.startMs)
		assert.equal(action.handSamples.at(-1).atMs, action.endMs)
	}
	assert.deepEqual(result.report.actions[0].handSamples.at(-1).right, result.report.actions[1].handSamples[0].right)
})
function track(asset, node, path) {
	const animation = asset.json.animations[0], channel = animation.channels.find(channel => channel.target.node === node && channel.target.path === path)
	const sampler = animation.samplers[channel.sampler]
	return { times: decode(asset, sampler.input).map(row => row[0]), values: decode(asset, sampler.output) }
}
const close = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`)

test('composes exact selected actions once, preserves the static rig and mesh, and is byte deterministic', () => {
	const source = fixture(), before = parseGlb(source)
	const performance = { actions: [{ id: 'idle', motionId: 'motion.test.idle', durationMs: 1000 }, { id: 'push', motionId: 'motion.test.push', durationMs: 1000 }], exit: { type: 'fade', durationMs: 250 }, startMs: 900 }
	const a = composePresenterPerformance({ glbBytes: source, clipMap, performance }), b = composePresenterPerformance({ glbBytes: source, clipMap, performance })
	assert.ok(a.glbBytes.equals(b.glbBytes))
	const generated = parseGlb(a.glbBytes)
	assert.equal(a.durationMs, 2000)
	assert.equal(generated.json.animations.length, 1)
	assert.deepEqual(generated.json.nodes, before.json.nodes)
	assert.deepEqual(generated.json.skins, before.json.skins)
	assert.deepEqual(generated.json.meshes, before.json.meshes)
	assert.ok(generated.bin.subarray(0, before.bin.length).equals(before.bin))
	assert.deepEqual(a.report.actions.map(action => [action.id, action.startMs, action.endMs]), [['idle', 0, 1000], ['push', 1000, 2000]])
	assert.deepEqual(a.report.exit, { type: 'fade', atMs: 1750, durationMs: 250, endMs: 2000 })
	close(a.report.actions[1].contactMs, 1500)
	close(a.report.actions[1].contact.actionTimeMs, 500)
	assert.equal(a.report.actions[1].contact.hand, 'right')
	assert.ok(a.report.actions[1].handSamples.length > 5)
	assert.ok(!/file:|[A-Z]:\\|node_modules|mixamorig|sourcePath/.test(JSON.stringify(a.report)))
})

test('bakes orientation and zoom on an anonymously named root joint through a transformed parent', () => {
	const source = fixture({ anonymous: true, transformedParent: true })
	const performance = { actions: [{ id: 'hold', motionId: 'motion.test.idle', durationMs: 1000 }], transforms: [{ atMs: 0, yawDegrees: 90, pitchDegrees: 15, rollDegrees: -12, scale: 1.2 }, { atMs: 1000, yawDegrees: 180, scale: 1.5, easing: 'linear' }] }
	const result = composePresenterPerformance({ glbBytes: source, clipMap, performance }), generated = parseGlb(result.glbBytes)
	assert.equal(generated.json.nodes.length, parseGlb(source).json.nodes.length)
	assert.ok(generated.json.animations[0].channels.every(channel => [1, 2, 3, 4, 5, 6].includes(channel.target.node)))
	const scale = track(generated, 1, 'scale')
	close(scale.values[0][0], 1.2)
	close(scale.values.at(-1)[0], 1.5)
	const rotation = track(generated, 1, 'rotation')
	assert.ok(rotation.values[0].some((value, index) => Math.abs(value - [0, 0, 0, 1][index]) > .1))
	assert.ok(result.report.verification.maxRootReconstructionError < 1e-5)
	for (const sample of result.report.transformSamples) close(sample.bounds.min[1], result.report.floorY)
	assert.ok(result.report.actions[0].handSamples[0].left)
	assert.ok(result.report.actions[0].handSamples[0].right)
})

test('drop reaches skinned soles exactly at authored contact and does not add time for exit', () => {
	const performance = { actions: [{ id: 'land', motionId: 'motion.test.push', durationMs: 1000 }], entry: { type: 'drop', durationMs: 250, height: .5 }, exit: { type: 'disappear', durationMs: 0 } }
	const result = composePresenterPerformance({ glbBytes: fixture(), clipMap, performance })
	assert.equal(result.durationMs, 1000)
	assert.equal(result.report.entryContactMs, 250)
	assert.equal(result.report.exit.atMs, 1000)
	const initial = result.report.transformSamples[0], contact = result.report.transformSamples.find(sample => sample.atMs === 250)
	close(initial.bounds.min[1] - result.report.floorY, .5 * result.report.modelHeight)
	assert.ok(contact, JSON.stringify(result.report.transformSamples.map(sample => sample.atMs)))
	close(contact.bounds.min[1], result.report.floorY)
	for (const sample of result.report.transformSamples.filter(sample => sample.atMs >= 250)) close(sample.bounds.min[1], result.report.floorY)
})

test('preserves source jump airtime and tucked feet while clamping ground contact and adding authored height', () => {
	const source = fixture({ anonymous: true, transformedParent: true })
	const performance = { actions: [{ id: 'jump', motionId: 'motion.test.jump', durationMs: 1000 }], blendMs: 0, transforms: [{ atMs: 0, scale: 1.25, height: .1 }, { atMs: 150 }, { atMs: 500 }, { atMs: 850 }] }
	const result = composePresenterPerformance({ glbBytes: source, clipMap, performance }), generated = parseGlb(result.glbBytes)
	const root = track(generated, 1, 'translation'), frame = atMs => result.report.transformSamples.find(sample => Math.abs(sample.atMs - atMs) < 1e-6)
	const sourceHeight = .8 * 2 * 1.25, extraHeight = .1 * result.report.modelHeight
	close(frame(500).bounds.min[1] - result.report.floorY, sourceHeight + extraHeight)
	close(frame(500).sourceAirborneHeight * result.report.modelHeight, sourceHeight)
	// Rest height is one local unit. Parent scale and authored scale must retain
	// the exact source root rise, including the independent tucked-foot pose.
	const apexIndex = root.times.indexOf(Math.fround(.5))
	close(root.values[apexIndex][1], 1.6 * 1.25 + extraHeight / 2)
	for (const atMs of [0, 1000]) close(frame(atMs).bounds.min[1] - result.report.floorY, extraHeight)
	assert.ok(result.report.transformSamples.every(sample => sample.bounds.min[1] >= result.report.floorY + extraHeight - 1e-5))
	assert.ok(result.report.verification.maxGroundError < 1e-5)
	result.report.stageAnchor.forEach((value, index) => close(value, [.4, .1, -.2][index]))
	for (const motionId of ['motion.test.fold', 'motion.test.offset']) {
		const planted = composePresenterPerformance({ glbBytes: source, clipMap, performance: { ...performance, actions: [{ id: 'planted', motionId, durationMs: 1000 }] } })
		for (const sample of planted.report.transformSamples) {
			close(sample.bounds.min[1] - planted.report.floorY, extraHeight)
			close(sample.sourceAirborneHeight, 0)
		}
	}
})

test('a drop retains landing contact through recovery without flattening a later source jump', () => {
	const performance = {
		actions: [{ id: 'arrival', motionId: 'motion.test.jump', durationMs: 1000 }, { id: 'recover', motionId: 'motion.test.idle', durationMs: 1000 }, { id: 'jump-later', motionId: 'motion.test.jump', durationMs: 1000 }],
		entry: { type: 'drop', durationMs: 250, height: .35 }, blendMs: 600,
	}
	const result = composePresenterPerformance({ glbBytes: fixture(), clipMap, performance })
	const samples = result.report.transformSamples
	for (const sample of samples.filter(sample => sample.atMs >= 250 && sample.atMs <= 1700)) {
		close(sample.bounds.min[1], result.report.floorY)
		close(sample.sourceAirborneHeight, 0)
	}
	const apex = samples.find(sample => Math.abs(sample.atMs - 2500) < 1e-5)
	close(apex.bounds.min[1] - result.report.floorY, .8)
	close(apex.sourceAirborneHeight * result.report.modelHeight, .8)
	assert.ok(result.report.verification.maxGroundError < 1e-5)
})

test('source cycles and fractional action endpoints retain exact duration and bounded finite tracks', () => {
	const performance = { actions: [{ id: 'cycle', motionId: 'motion.test.push', durationMs: 1577, cycles: 2.5 }], blendMs: 0 }
	const result = composePresenterPerformance({ glbBytes: fixture(), clipMap: { 'motion.test.push': 'reach' }, performance }), generated = parseGlb(result.glbBytes)
	const hand = track(generated, 3, 'translation')
	close(hand.times.at(-1), 1.577)
	close(hand.values.at(-1)[2], .85)
	for (const animation of generated.json.animations) for (const sampler of animation.samplers) assert.ok(decode(generated, sampler.output).flat().every(Number.isFinite))
	const sequence = composePresenterPerformance({ glbBytes: fixture(), clipMap, performance: { actions: [{ id: 'a', motionId: 'motion.test.idle', durationMs: 1700 }, { id: 'b', motionId: 'motion.test.push', durationMs: 2250 }, { id: 'c', motionId: 'motion.test.idle', durationMs: 1650 }] } })
	const boundaryTimes = track(parseGlb(sequence.glbBytes), 1, 'translation').times
	for (const boundary of [0, 1.7, 3.95, 5.6]) assert.ok(boundaryTimes.includes(Math.fround(boundary)))
	assert.ok(boundaryTimes.every((time, index) => index === 0 || time > boundaryTimes[index - 1]))
})

test('selected source ranges preserve a short gesture segment and cycles repeat that segment', () => {
	const performance = { actions: [{ id: 'reach-segment', motionId: 'motion.test.push', durationMs: 1000, sourceStartMs: 250, sourceEndMs: 750, cycles: 2 }], blendMs: 0 }
	const result = composePresenterPerformance({ glbBytes: fixture(), clipMap, performance, fps: 20 })
	const hand = track(parseGlb(result.glbBytes), 3, 'translation')
	const at = seconds => hand.values[hand.times.indexOf(Math.fround(seconds))][2]
	close(at(0), .55); close(at(.25), .85); close(at(.5), .55); close(at(.75), .85); close(at(1), .55)
	assert.equal(result.report.actions[0].sourceStartMs, 250)
	assert.equal(result.report.actions[0].sourceEndMs, 750)
	close(result.report.actions[0].sourceDurationMs, 1000)
	assert.deepEqual(result.report.actions[0].resolvedSourceRange, { startMs: 250, endMs: 750 })
	// Repeated semantic motions can use different ranges without sharing a crop.
	const different = composePresenterPerformance({ glbBytes: fixture(), clipMap, performance: { blendMs: 0, actions: [
		{ id: 'first-half', motionId: 'motion.test.push', durationMs: 1000, sourceEndMs: 500 },
		{ id: 'second-half', motionId: 'motion.test.push', durationMs: 1000, sourceStartMs: 500 },
	] } })
	const repeatedHand = track(parseGlb(different.glbBytes), 3, 'translation')
	close(repeatedHand.values[0][2], .25)
	close(repeatedHand.values[repeatedHand.times.indexOf(Math.fround(1))][2], .85)
	close(repeatedHand.values.at(-1)[2], .25)
	assert.equal(different.report.actions[0].sourceStartMs, undefined)
	assert.equal(different.report.actions[1].sourceEndMs, undefined)
})

test('source ranges reject invalid endpoints and tolerate only the source float timing margin', () => {
	const base = { id: 'range', motionId: 'motion.test.push', durationMs: 1000 }
	const run = (action, bytes = fixture()) => composePresenterPerformance({ glbBytes: bytes, clipMap, performance: { actions: [{ ...base, ...action }] } })
	for (const action of [{ sourceStartMs: -.1 }, { sourceStartMs: .1 }, { sourceEndMs: .1 }, { sourceEndMs: 0 }, { sourceStartMs: 700, sourceEndMs: 600 }, { sourceEndMs: 1002 }, { sourceStartMs: 1000 }, { sourceStartMs: 120001 }]) assert.throws(() => run(action), /source|whole milliseconds/)
	const rounded = parseGlb(fixture()), animation = rounded.json.animations[1], inputId = animation.samplers[0].input
	const input = rounded.json.accessors[inputId], view = rounded.json.bufferViews[input.bufferView]
	rounded.bin.writeFloatLE(.9995, (view.byteOffset || 0) + (input.byteOffset || 0) + (input.count - 1) * 4)
	const bytes = serializeGlb(rounded.json, rounded.bin)
	const result = run({ sourceStartMs: 0, sourceEndMs: 1000 }, bytes)
	assert.equal(result.report.actions[0].sourceEndMs, 1000)
	close(result.report.actions[0].resolvedSourceRange.endMs, 999.5, .001)
	close(track(parseGlb(result.glbBytes), 3, 'translation').values.at(-1)[2], .25)
	assert.throws(() => run({ sourceEndMs: 1001 }, bytes), /fit within/)
})

test('source ranges use zero-based clip time and preserve preroll before a nonzero first key', () => {
	const source = parseGlb(fixture()), animation = source.json.animations[1]
	const accessor = source.json.accessors[animation.samplers[0].input], view = source.json.bufferViews[accessor.bufferView]
	for (const [index, time] of [.1, .6, 1.1].entries()) source.bin.writeFloatLE(time, (view.byteOffset || 0) + (accessor.byteOffset || 0) + index * 4)
	const result = composePresenterPerformance({ glbBytes: serializeGlb(source.json, source.bin), clipMap, performance: { actions: [{ id: 'source-clock', motionId: 'motion.test.push', durationMs: 1100, sourceEndMs: 1100 }], blendMs: 0 }, fps: 10 })
	const hand = track(parseGlb(result.glbBytes), 3, 'translation')
	const at = seconds => hand.values[hand.times.indexOf(Math.fround(seconds))][2]
	close(at(0), .25); close(at(.1), .25); close(at(.6), .85); close(at(1.1), .25)
	close(result.report.actions[0].sourceDurationMs, 1100, .001)
	assert.equal(result.report.actions[0].resolvedSourceRange.startMs, 0)
})

test('rejects missing motions, nonfinite transforms, disconnected rigs, and invalid duration before producing bytes', () => {
	const valid = { actions: [{ id: 'one', motionId: 'motion.test.idle', durationMs: 1000 }] }
	const run = performance => composePresenterPerformance({ glbBytes: fixture(), clipMap, performance })
	assert.throws(() => run({ actions: [] }), /one to 32/)
	assert.throws(() => run({ actions: Array.from({ length: 33 }, (_, index) => ({ id: String(index), motionId: 'motion.test.idle', durationMs: 1 })) }), /one to 32/)
	assert.throws(() => run({ actions: [{ ...valid.actions[0], durationMs: 120001 }] }), /60000/)
	assert.throws(() => run({ actions: [{ ...valid.actions[0], motionId: 'motion.test.missing' }] }), error => error.code === 'PRESENTER_PERFORMANCE_MOTION_MISSING')
	assert.throws(() => run({ ...valid, transforms: [{ atMs: 0, yawDegrees: Infinity }] }), /finite/)
	assert.throws(() => run({ ...valid, transforms: [{ atMs: 0, scale: 0 }] }), /finite/)
	assert.throws(() => run({ ...valid, exit: { type: 'fade', atMs: 900, durationMs: 200 } }), /finish within/)
	assert.throws(() => run({ ...valid, transforms: [{ atMs: 900 }, { atMs: 900.000001 }] }), /timing precision/)
	const disconnected = parseGlb(fixture()); disconnected.json.nodes[1].children = [2, 3, 4, 5]; disconnected.json.nodes[0].children.push(6)
	assert.throws(() => composePresenterPerformance({ glbBytes: serializeGlb(disconnected.json, disconnected.bin), clipMap, performance: valid }), error => error.code === 'PRESENTER_PERFORMANCE_RIG_UNSUPPORTED')
})

function cachedFixture(label) {
	const bytes = fixture()
	const registered = registerLocalRigged3d({ glbBase64: bytes.toString('base64'), glbBytes: bytes.length, clipMap: { ...clipMap }, basisKey: `performance-cache-test:${label}` })
	return { model: registered.handle, source: getCachedGeneratedRigged3d(parseGenRigged3dHandle(registered.handle).hash) }
}
const cachePerformance = () => ({
	actions: [{ id: 'one', motionId: 'motion.test.idle', durationMs: 500 }, { id: 'two', motionId: 'motion.test.push', durationMs: 500 }],
	blendMs: 100, entry: { type: 'drop', durationMs: 100, height: .2, fadeMs: 50 }, exit: { type: 'fade', durationMs: 100 },
})

test('staging-only edits share the validated recipe and the exact composed asset', () => {
	const { model } = cachedFixture('staging'), performance = cachePerformance()
	const first = materializePresenterPerformance({ model, performance })
	assert.equal(first.cached, false)
	for (const staging of [
		{ actor: 'a-different-performer' }, { startMs: 1700 },
		{ travel: [{ atMs: 0, stage: 'right' }, { atMs: 500, stage: 'center' }] },
		{ interactions: [{ actionId: 'two', verb: 'point-at', target: 'another-element' }] },
	]) {
		const changed = { ...performance, ...staging }
		assert.deepEqual(validatedPresenterPerformanceRecipe(changed), validatedPresenterPerformanceRecipe(performance))
		const reused = materializePresenterPerformance({ model, performance: changed })
		assert.equal(reused.cached, true)
		assert.equal(reused.handle, first.handle)
		assert.deepEqual(reused.report, first.report)
	}
})

test('every consumed motion, timing, transform and report field keeps a distinct cache recipe', () => {
	const { model } = cachedFixture('consumed-fields'), performance = cachePerformance()
	const first = materializePresenterPerformance({ model, performance })
	for (const change of [
		p => { p.actions[0].id = 'renamed-action' },
		p => { p.actions[0].motionId = 'motion.test.push' },
		p => { p.actions[0].durationMs = 600 },
		p => { p.actions[0].cycles = 2 },
		p => { p.actions[0].sourceStartMs = 100 },
		p => { p.actions[0].sourceEndMs = 800 },
		p => { p.blendMs = 50 },
		p => { p.transforms = [{ atMs: 0, yawDegrees: 45, scale: 1.1 }] },
		p => { p.entry.height = .3 },
		p => { p.entry.fadeMs = 80 },
		p => { p.exit.atMs = 800 },
	]) {
		const changed = structuredClone(performance); change(changed)
		const composed = materializePresenterPerformance({ model, performance: changed })
		assert.equal(composed.cached, false)
		assert.notEqual(composed.handle, first.handle)
		assert.equal(composed.report.actions[0].id, changed.actions[0].id)
	}
})

test('source byte replacement invalidates fingerprint memoization even under the same source handle', () => {
	const { model, source } = cachedFixture('byte-replacement'), performance = cachePerformance()
	const first = materializePresenterPerformance({ model, performance })
	const decoded = parseGlb(Buffer.from(source.glbBase64, 'base64'))
	decoded.json.asset.extras = { revision: 'different-source-bytes' }
	source.glbBase64 = serializeGlb(decoded.json, decoded.bin).toString('base64')
	const changed = materializePresenterPerformance({ model, performance })
	assert.equal(changed.cached, false)
	assert.notEqual(changed.handle, first.handle)
	assert.equal(materializePresenterPerformance({ model, performance }).cached, true)
})

test('in-place clip mapping changes invalidate the memo, including when restoring an earlier mapping', () => {
	const { model, source } = cachedFixture('map-mutation'), performance = cachePerformance()
	const first = materializePresenterPerformance({ model, performance })
	source.clipMap['motion.test.idle'] = 1
	const changed = materializePresenterPerformance({ model, performance })
	assert.equal(changed.cached, false)
	assert.notEqual(changed.handle, first.handle)
	source.clipMap['motion.test.idle'] = 0
	const restored = materializePresenterPerformance({ model, performance })
	assert.equal(restored.cached, true)
	assert.equal(restored.handle, first.handle)
})

test('a warm cache cannot conceal invalid consumed input', () => {
	const { model } = cachedFixture('validation'), performance = cachePerformance()
	materializePresenterPerformance({ model, performance })
	assert.throws(() => materializePresenterPerformance({ model, performance: { ...performance, transforms: [{ atMs: 0, scale: Infinity }] } }), /finite/)
	assert.throws(() => validatedPresenterPerformanceRecipe(performance, 0), /fps/)
})
