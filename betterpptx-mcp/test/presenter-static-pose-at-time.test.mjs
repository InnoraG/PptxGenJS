import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

import { parseGlb, serializeGlb } from '../ir/kinetic-transplant.mjs'
import { applyRotationOnlyStaticPoseAtTime, assertNoConstructionTPose, STATIC_POSE_AT_TIME_PROFILE_VERSION } from '../assets/glb-static-pose-at-time.mjs'
import { assertPowerPointSafeStaticPose } from '../assets/glb-static-pose-profile.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
const zRotation = degrees => [0, 0, Math.sin(degrees * Math.PI / 360), Math.cos(degrees * Math.PI / 360)]
const norm = quaternion => { const size = Math.hypot(...quaternion); return quaternion.map(value => value / size) }
const orientationDistance = (first, last) => 1 - Math.abs(norm(first).reduce((sum, value, index) => sum + value * norm(last)[index], 0))
const expectCode = (operation, code) => assert.throws(operation, error => error?.code === code)

function fixture({ interpolation = 'LINEAR', stride = 16 } = {}) {
	const json = {
		asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
		nodes: [
			{ name: 'Root', children: [1] },
			{ name: 'mixamorig:Hips', children: [2] },
			{ name: 'mixamorig:Spine', translation: [0, 1, 0], children: [3, 6] },
			{ name: 'mixamorig:LeftArm', translation: [0.25, 0, 0], rotation: zRotation(-60), children: [4] },
			{ name: 'mixamorig:LeftForeArm', translation: [0.5, 0, 0], children: [5] },
			{ name: 'mixamorig:LeftHand', translation: [0.4, 0, 0] },
			{ name: 'mixamorig:RightArm', translation: [-0.25, 0, 0], rotation: zRotation(60), children: [7] },
			{ name: 'mixamorig:RightForeArm', translation: [-0.5, 0, 0], children: [8] },
			{ name: 'mixamorig:RightHand', translation: [-0.4, 0, 0] },
		],
		buffers: [{ byteLength: 0 }], bufferViews: [], accessors: [], animations: [],
		materials: [{ name: 'matte', pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 1 } }],
		extras: { untouched: ['native', 'fixture'] },
	}
	const chunks = []
	let size = 0
	const accessor = (rows, type, rowStride) => {
		const buffer = Buffer.alloc(rows.length * rowStride, 0x35)
		rows.forEach((row, index) => row.forEach((value, component) => buffer.writeFloatLE(value, index * rowStride + component * 4)))
		const view = json.bufferViews.push({ buffer: 0, byteOffset: size, byteLength: buffer.length, ...(rowStride !== (type === 'SCALAR' ? 4 : 16) ? { byteStride: rowStride } : {}) }) - 1
		chunks.push(buffer); size += buffer.length
		return json.accessors.push({ bufferView: view, componentType: 5126, count: rows.length, type }) - 1
	}
	const input = accessor([[0], [1], [2]], 'SCALAR', 4)
	for (const [clipIndex, name] of ['point', 'second-point'].entries()) {
		const clip = { name, channels: [], samplers: [] }
		for (const [node, degrees] of [[3, [-60, -60, -60]], [4, [0, 0, 0]], [6, [60, -35, 60]], [7, [0, 30, 0]]]) {
			const output = accessor(degrees.map(zRotation), 'VEC4', stride)
			clip.channels.push({ sampler: clip.samplers.length, target: { node, path: 'rotation' } })
			clip.samplers.push({ input, output, interpolation })
		}
		json.animations[clipIndex] = clip
	}
	json.buffers[0].byteLength = size
	return serializeGlb(json, Buffer.concat(chunks))
}

function mutate(source, change) {
	const { json, bin } = parseGlb(source)
	change(json, bin)
	return serializeGlb(json, bin)
}

function withoutRotations(json) {
	return { ...json, nodes: json.nodes.map(node => { const out = { ...node }; delete out.rotation; return out }) }
}

function assertPreserved(beforeBuffer, afterBuffer) {
	const before = parseGlb(beforeBuffer), after = parseGlb(afterBuffer)
	assert.equal(before.bin.equals(after.bin), true, 'entire BIN must be byte-identical')
	assert.deepEqual(withoutRotations(after.json), withoutRotations(before.json), 'all nonrotation JSON must be unchanged')
	for (const key of ['animations', 'accessors', 'bufferViews', 'buffers', 'meshes', 'skins', 'materials', 'textures', 'images', 'samplers']) assert.deepEqual(after.json[key], before.json[key], `${key} must be exact`)
	for (const [index, node] of after.json.nodes.entries()) {
		assert.deepEqual(node.translation, before.json.nodes[index].translation)
		assert.deepEqual(node.scale, before.json.nodes[index].scale)
		assert.deepEqual(node.weights, before.json.nodes[index].weights)
		if (JSON.stringify(node.rotation) !== JSON.stringify(before.json.nodes[index].rotation)) {
			assert.ok(Math.abs(Math.hypot(...node.rotation) - 1) < 1e-12)
			for (const clip of after.json.animations) assert.ok(clip.channels.some(channel => channel.target.node === index && channel.target.path === 'rotation'), `${clip.name} must overwrite changed node ${index}`)
		}
	}
}

test('time sampling uses exact key poses and shortest-arc interpolation without changing playback data', () => {
	const source = fixture({ stride: 20 }), original = Buffer.from(source)
	for (const [timeMs, rightArmDegrees, rightElbowDegrees] of [[0, 60, 0], [500, 12.5, 15], [1000, -35, 30], [1500, 12.5, 15], [2000, 60, 0]]) {
		const result = applyRotationOnlyStaticPoseAtTime(source, { clipIndex: 0, timeMs })
		const { json } = parseGlb(result.buffer)
		assert.ok(orientationDistance(json.nodes[6].rotation, zRotation(rightArmDegrees)) < 1e-12)
		assert.ok(orientationDistance(json.nodes[7].rotation || [0, 0, 0, 1], zRotation(rightElbowDegrees)) < 1e-12)
		assert.equal(result.profileVersion, STATIC_POSE_AT_TIME_PROFILE_VERSION)
		assert.equal(result.sampleTimeMs, timeMs)
		assert.equal(result.clipIndex, 0)
		assert.equal(result.clipName, 'point')
		assert.equal(result.playbackStartOffsetApplied, false)
		assert.equal(result.constructionPose.constructionTPose, false)
		assertPreserved(source, result.buffer)
	}
	assert.equal(source.equals(original), true, 'caller-owned bytes must not be mutated')
	const once = applyRotationOnlyStaticPoseAtTime(source, { clipIndex: 0, timeMs: 1000 })
	const twice = applyRotationOnlyStaticPoseAtTime(once.buffer, { clipIndex: 0, timeMs: 1000 })
	assert.equal(twice.buffer.equals(once.buffer), true, 'same-pose derivation must be idempotent')
})

test('STEP sampling holds the preceding key and accepts the exact final key', () => {
	const source = fixture({ interpolation: 'STEP' })
	for (const [timeMs, angle] of [[999, 60], [1000, -35], [1999, -35], [2000, 60]]) {
		const result = applyRotationOnlyStaticPoseAtTime(source, { clipIndex: 1, timeMs })
		assert.ok(orientationDistance(parseGlb(result.buffer).json.nodes[6].rotation, zRotation(angle)) < 1e-12)
		assertPreserved(source, result.buffer)
	}
})

test('antipodal quaternions do not create a spin or zero-length rotation', () => {
	const source = mutate(fixture(), (json, bin) => {
		const output = json.accessors[json.animations[0].samplers[2].output]
		const offset = json.bufferViews[output.bufferView].byteOffset
		for (const [row, angle] of [60, 60, 60].entries()) zRotation(angle).forEach((value, column) => bin.writeFloatLE(row === 1 ? -value : value, offset + row * 16 + column * 4))
	})
	for (const timeMs of [250, 750, 1250, 1750]) {
		const result = applyRotationOnlyStaticPoseAtTime(source, { clipIndex: 0, timeMs })
		assert.ok(orientationDistance(parseGlb(result.buffer).json.nodes[6].rotation, zRotation(60)) < 1e-12)
		assertPreserved(source, result.buffer)
	}
})

test('construction T-pose rejection is torso-relative while raised-hand and bent-elbow poses remain allowed', () => {
	const source = fixture()
	const tPose = mutate(source, json => { for (const index of [3, 4, 6, 7]) json.nodes[index].rotation = [0, 0, 0, 1] })
	expectCode(() => assertNoConstructionTPose(tPose), 'POWERPOINT_TPOSE_FORBIDDEN')
	const turned = mutate(tPose, json => { json.nodes[0].rotation = zRotation(80); json.nodes[0].scale = [0.01, 0.01, 0.01] })
	expectCode(() => assertNoConstructionTPose(turned), 'POWERPOINT_TPOSE_FORBIDDEN')
	const oneRaised = applyRotationOnlyStaticPoseAtTime(source, { clipIndex: 0, timeMs: 1000 }).buffer
	assert.equal(assertNoConstructionTPose(oneRaised).constructionTPose, false)
	const bentElbows = mutate(tPose, json => { json.nodes[4].rotation = zRotation(65); json.nodes[7].rotation = zRotation(-65) })
	assert.equal(assertNoConstructionTPose(bentElbows).constructionTPose, false)
	const sampledT = mutate(source, (json, bin) => {
		const identityRotation = [0, 0, 0, 1]
		for (const sampler of json.animations[0].samplers) {
			const accessor = json.accessors[sampler.output], offset = json.bufferViews[accessor.bufferView].byteOffset
			identityRotation.forEach((value, column) => bin.writeFloatLE(value, offset + 16 + column * 4))
		}
	})
	expectCode(() => applyRotationOnlyStaticPoseAtTime(sampledT, { clipIndex: 0, timeMs: 1000 }), 'POWERPOINT_TPOSE_FORBIDDEN')
})

test('every changed rotation must be keyed in every retained clip; unchanged defaults need not be rewritten', () => {
	const source = mutate(fixture(), json => { json.animations[1].channels = json.animations[1].channels.filter(channel => channel.target.node !== 6) })
	expectCode(() => applyRotationOnlyStaticPoseAtTime(source, { clipIndex: 0, timeMs: 1000 }), 'STATIC_POSE_PLAYBACK_COVERAGE_INCOMPLETE')
	const unchanged = applyRotationOnlyStaticPoseAtTime(source, { clipIndex: 0, timeMs: 0 })
	assert.equal(unchanged.changedNodeRotations, 0)
	assertPreserved(source, unchanged.buffer)
})

test('unsupported paths, interpolation, transforms and malformed animation data fail closed', () => {
	const source = fixture()
	const cases = [
		['STATIC_POSE_PATH_UNSUPPORTED', json => { json.animations[0].channels[0].target.path = 'translation' }],
		['STATIC_POSE_PATH_UNSUPPORTED', json => { json.animations[1].channels[0].target.path = 'weights' }],
		['STATIC_POSE_INTERPOLATION_UNSUPPORTED', json => { json.animations[0].samplers[0].interpolation = 'CUBICSPLINE' }],
		['STATIC_POSE_ANIMATION_UNSUPPORTED', json => { json.animations[0].channels.push({ ...json.animations[0].channels[0] }) }],
		['STATIC_POSE_ACCESSOR_UNSUPPORTED', json => { json.accessors[0].sparse = {} }],
		['STATIC_POSE_ACCESSOR_UNSUPPORTED', json => { json.accessors[0].componentType = 5123 }],
		['STATIC_POSE_ACCESSOR_UNSUPPORTED', json => { json.accessors[1].count = 2 }],
		['STATIC_POSE_ACCESSOR_UNSUPPORTED', json => { json.bufferViews[0].byteLength = 999999 }],
		['STATIC_POSE_ACCESSOR_UNSUPPORTED', (json, bin) => { bin.writeFloatLE(0, 4) }],
		['STATIC_POSE_ACCESSOR_UNSUPPORTED', (json, bin) => { bin.writeFloatLE(Infinity, json.bufferViews[1].byteOffset) }],
		['STATIC_POSE_QUATERNION_INVALID', (json, bin) => { bin.writeFloatLE(4, json.bufferViews[1].byteOffset) }],
		['STATIC_POSE_RIG_UNSUPPORTED', json => { json.nodes[0].matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }],
		['STATIC_POSE_RIG_UNSUPPORTED', json => { json.nodes[0].scale = [1, 0, 1] }],
		['STATIC_POSE_RIG_UNSUPPORTED', json => { json.nodes[0].children = {} }],
		['STATIC_POSE_RIG_UNSUPPORTED', json => { json.nodes[5].children = [0] }],
		['STATIC_POSE_RIG_UNSUPPORTED', json => { json.nodes[1].name = 'Unknown' }],
		['STATIC_POSE_RIG_UNSUPPORTED', json => { json.nodes[0].name = json.nodes[1].name }],
	]
	for (const [code, change] of cases) expectCode(() => applyRotationOnlyStaticPoseAtTime(mutate(source, change), { clipIndex: 0, timeMs: 1000 }), code)
	for (const clipIndex of [-1, 0.5, 2, '0', undefined]) expectCode(() => applyRotationOnlyStaticPoseAtTime(source, { clipIndex, timeMs: 1000 }), 'STATIC_POSE_INPUT_INVALID')
	for (const timeMs of [-1, 2001, NaN, Infinity, '1000', undefined]) expectCode(() => applyRotationOnlyStaticPoseAtTime(source, { clipIndex: 0, timeMs }), 'STATIC_POSE_TIME_INVALID')
	expectCode(() => applyRotationOnlyStaticPoseAtTime(source.subarray(0, source.length - 1), { clipIndex: 0, timeMs: 0 }), 'STATIC_POSE_GLB_UNSUPPORTED')
	const extraChunk = Buffer.concat([source, Buffer.alloc(8)])
	extraChunk.writeUInt32LE(extraChunk.length, 8)
	expectCode(() => applyRotationOnlyStaticPoseAtTime(extraChunk, { clipIndex: 0, timeMs: 0 }), 'STATIC_POSE_GLB_UNSUPPORTED')
})

test('passive grounded tracks do not prevent safe rotation-only poses or alter shared root defaults', () => {
	const parsed = parseGlb(fixture())
	const translations = Buffer.alloc(36)
	;[[0, 0, 0], [0, -0.05, 0.1], [0, 0, 0]].flat().forEach((value, index) => translations.writeFloatLE(value, index * 4))
	const view = parsed.json.bufferViews.push({ buffer: 0, byteOffset: parsed.bin.length, byteLength: translations.length }) - 1
	const accessor = parsed.json.accessors.push({ bufferView: view, componentType: 5126, type: 'VEC3', count: 3 }) - 1
	const clip = parsed.json.animations[1]
	clip.channels.push({ sampler: clip.samplers.length, target: { node: 1, path: 'translation' } })
	clip.samplers.push({ input: 0, output: accessor, interpolation: 'LINEAR' })
	const binary = Buffer.concat([parsed.bin, translations])
	parsed.json.buffers[0].byteLength = binary.length
	const source = serializeGlb(parsed.json, binary)
	expectCode(() => applyRotationOnlyStaticPoseAtTime(source, { clipIndex: 0, timeMs: 1000 }), 'STATIC_POSE_PATH_UNSUPPORTED')
	const safe = applyRotationOnlyStaticPoseAtTime(source, { clipIndex: 0, timeMs: 1000, allowPassiveRootMotion: true })
	assert.equal(safe.passiveRootTranslationTracksPreserved, 1)
	assertPreserved(source, safe.buffer)
	const start = applyRotationOnlyStaticPoseAtTime(source, { clipIndex: 1, timeMs: 0, allowPassiveRootMotion: true })
	assertPreserved(source, start.buffer)
	expectCode(() => applyRotationOnlyStaticPoseAtTime(source, { clipIndex: 1, timeMs: 1000, allowPassiveRootMotion: true }), 'STATIC_POSE_PLAYBACK_COVERAGE_INCOMPLETE')
	const nonRoot = mutate(source, json => { json.animations[1].channels.at(-1).target.node = 6 })
	expectCode(() => applyRotationOnlyStaticPoseAtTime(nonRoot, { clipIndex: 0, timeMs: 0, allowPassiveRootMotion: true }), 'STATIC_POSE_PATH_UNSUPPORTED')
	const duplicate = mutate(source, json => { json.animations[1].channels.push({ ...json.animations[1].channels.at(-1) }) })
	expectCode(() => applyRotationOnlyStaticPoseAtTime(duplicate, { clipIndex: 0, timeMs: 0, allowPassiveRootMotion: true }), 'STATIC_POSE_ANIMATION_UNSUPPORTED')
})

test('all ordinary presenters preserve exact matte assets, skinning and every motion when sampled for pointing/presenting', () => {
	for (const identity of ['joe', 'louise', 'pete']) {
		const assetUrl = new URL(`../assets/default-presenter-${identity}.glb`, import.meta.url)
		const source = readFileSync(assetUrl), originalHash = hash(source)
		const before = parseGlb(source)
		assert.equal(before.json.animations.length, 18)
		const samples = [['03_point', 926], ['03_point', 1800], ['09_present', 2726], ['08_ask', 1000]]
		for (const [clipName, timeMs] of samples) {
			const clipIndex = before.json.animations.findIndex(clip => clip.name === clipName)
			const result = applyRotationOnlyStaticPoseAtTime(source, { clipIndex, timeMs, allowPassiveRootMotion: true })
			assert.equal(result.sampledNodeRotations, 22)
			assert.ok(result.changedNodeRotations > 0)
			assert.equal(result.clipName, clipName)
			assert.equal(result.playbackStartOffsetApplied, false)
			assert.equal(assertNoConstructionTPose(result.buffer).constructionTPose, false)
			assertPreserved(source, result.buffer)
			if (clipName === '03_point' || clipName === '09_present') expectCode(() => assertPowerPointSafeStaticPose(result.buffer), 'POWERPOINT_TPOSE_FORBIDDEN')
		}
		const constructionSource = readFileSync(new URL(`../assets/presenter-source-${identity}-static.glb`, import.meta.url))
		expectCode(() => assertNoConstructionTPose(constructionSource), 'POWERPOINT_TPOSE_FORBIDDEN')
		assert.equal(hash(source), originalHash)
		assert.equal(hash(readFileSync(assetUrl)), originalHash, 'governed files must remain read-only')
	}
})

// The approved v8 corpus is a maintainer-only oracle, not a packaged product
// dependency. When present, inspect its original assets without writing them.
const v8ManifestUrl = new URL('../../.codex-tmp/presenter-motion-root-cause-v2/presenter-motion-51-candidate-v8-mixamo-precise-essential/source-first-manifest.json', import.meta.url)
test('approved v8 bank hashes remain exact and nonrotation banks are explicitly outside this helper', { skip: !existsSync(v8ManifestUrl) }, () => {
	const manifest = JSON.parse(readFileSync(v8ManifestUrl, 'utf8'))
	assert.equal(manifest.motions.length, 51)
	assert.equal(manifest.models.length, 9)
	for (const model of manifest.models) {
		const source = readFileSync(model.path)
		assert.equal(hash(source), model.sha256, `${model.bank}/${model.identity} must match approved v8 bytes`)
		assert.equal(assertNoConstructionTPose(source).constructionTPose, false)
		expectCode(() => applyRotationOnlyStaticPoseAtTime(source, { clipIndex: 0, timeMs: 0 }), 'STATIC_POSE_PATH_UNSUPPORTED')
		assert.equal(hash(readFileSync(model.path)), model.sha256, 'the oracle asset must remain unchanged')
	}
})
