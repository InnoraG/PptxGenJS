// Pose an already-approved rotation-only presenter bundle for PowerPoint's
// stopped/edit view. This is not retargeting, baking, smoothing, or a playback
// start-offset operation. Animation data and every nonrotation field stay exact.

import { parseGlb, serializeGlb } from '../ir/kinetic-transplant.mjs'

export const STATIC_POSE_AT_TIME_PROFILE_VERSION = 'rotation-only-sampled-frame-v1'

const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942
const QUATERNION_NORM_TOLERANCE = 0.001
const ORIENTATION_EQUALITY_TOLERANCE = 1e-12
const REQUIRED_JOINTS = Object.freeze([
	'mixamorig:Hips',
	'mixamorig:LeftArm', 'mixamorig:LeftForeArm', 'mixamorig:LeftHand',
	'mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:RightHand',
])

function fail(code, message, details) {
	const error = new Error(`static-pose-at-time: ${message}`)
	error.code = code
	if (details !== undefined) error.details = details
	throw error
}

function integer(value, label, maximum = Number.MAX_SAFE_INTEGER) {
	if (!Number.isSafeInteger(value) || value < 0 || value > maximum) fail('STATIC_POSE_INPUT_INVALID', `${label} must be an integer from 0 through ${maximum}.`)
	return value
}

function strictParse(buffer) {
	if (!(buffer instanceof Uint8Array)) fail('STATIC_POSE_GLB_UNSUPPORTED', 'the model must be a GLB byte buffer.')
	const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
	if (bytes.length < 28 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
		fail('STATIC_POSE_GLB_UNSUPPORTED', 'a complete version-2 GLB is required.')
	}
	let offset = 12
	for (const type of [JSON_CHUNK, BIN_CHUNK]) {
		if (offset + 8 > bytes.length) fail('STATIC_POSE_GLB_UNSUPPORTED', 'one JSON chunk followed by one BIN chunk is required.')
		const length = bytes.readUInt32LE(offset)
		if (bytes.readUInt32LE(offset + 4) !== type || length % 4 !== 0 || offset + 8 + length > bytes.length) {
			fail('STATIC_POSE_GLB_UNSUPPORTED', 'the GLB chunk structure is unsupported or incomplete.')
		}
		offset += 8 + length
	}
	if (offset !== bytes.length) fail('STATIC_POSE_GLB_UNSUPPORTED', 'additional GLB chunks cannot be preserved by this pose helper.')
	let parsed
	try { parsed = parseGlb(bytes) } catch { fail('STATIC_POSE_GLB_UNSUPPORTED', 'the GLB JSON is invalid.') }
	const { json, bin } = parsed
	if (!json || typeof json !== 'object' || !Array.isArray(json.nodes) || !json.nodes.length || !Array.isArray(json.buffers) || json.buffers.length !== 1 || json.buffers[0]?.uri !== undefined) {
		fail('STATIC_POSE_GLB_UNSUPPORTED', 'one embedded buffer and a node hierarchy are required.')
	}
	const declaredBytes = json.buffers[0].byteLength
	if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0 || declaredBytes > bin.length || bin.length - declaredBytes > 3) {
		fail('STATIC_POSE_GLB_UNSUPPORTED', 'the embedded buffer length is invalid.')
	}
	return parsed
}

function vector(value, width, fallback, label) {
	if (value === undefined) return [...fallback]
	if (!Array.isArray(value) || value.length !== width || value.some(number => typeof number !== 'number' || !Number.isFinite(number))) {
		fail('STATIC_POSE_TRANSFORM_INVALID', `${label} must have ${width} finite numeric components.`)
	}
	return value
}

function normalizedQuaternion(value, label) {
	const quaternion = vector(value, 4, [0, 0, 0, 1], label)
	const norm = Math.hypot(...quaternion)
	if (!Number.isFinite(norm) || Math.abs(norm - 1) > QUATERNION_NORM_TOLERANCE) {
		fail('STATIC_POSE_QUATERNION_INVALID', `${label} must be a unit quaternion.`)
	}
	return quaternion.map(component => component / norm)
}

const dot = (left, right) => left.reduce((sum, value, index) => sum + value * right[index], 0)
const subtract = (left, right) => left.map((value, index) => value - right[index])
function direction(value, label) {
	const length = Math.hypot(...value)
	if (!Number.isFinite(length) || length < 1e-10) fail('STATIC_POSE_RIG_UNSUPPORTED', `${label} is degenerate.`)
	return value.map(component => component / length)
}
const degrees = cosine => Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI

function slerp(first, last, fraction) {
	let end = last
	let cosine = dot(first, last)
	if (cosine < 0) { end = last.map(value => -value); cosine = -cosine }
	if (cosine > 0.9995) {
		const linear = first.map((value, index) => value + fraction * (end[index] - value))
		const length = Math.hypot(...linear)
		return linear.map(value => value / length)
	}
	const angle = Math.acos(Math.max(-1, Math.min(1, cosine)))
	const denominator = Math.sin(angle)
	return first.map((value, index) => (value * Math.sin((1 - fraction) * angle) + end[index] * Math.sin(fraction * angle)) / denominator)
}

function worldMatrices(nodes) {
	const parents = new Array(nodes.length).fill(-1)
	const localMatrices = nodes.map((node, index) => {
		if (!node || typeof node !== 'object' || Array.isArray(node) || node.matrix !== undefined) fail('STATIC_POSE_RIG_UNSUPPORTED', `node ${index} must use TRS, not a matrix.`)
		if (node.children !== undefined && !Array.isArray(node.children)) fail('STATIC_POSE_RIG_UNSUPPORTED', `node ${index} children must be an array.`)
		for (const child of node.children || []) {
			integer(child, `node ${index} child`, nodes.length - 1)
			if (parents[child] !== -1) fail('STATIC_POSE_RIG_UNSUPPORTED', `node ${child} has multiple parents.`)
			parents[child] = index
		}
		const [tx, ty, tz] = vector(node.translation, 3, [0, 0, 0], `node ${index} translation`)
		const [sx, sy, sz] = vector(node.scale, 3, [1, 1, 1], `node ${index} scale`)
		if (Math.min(sx, sy, sz) <= 0) fail('STATIC_POSE_RIG_UNSUPPORTED', `node ${index} must have positive scale.`)
		const [x, y, z, w] = normalizedQuaternion(node.rotation, `node ${index} rotation`)
		return [
			(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
			2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
			2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
			tx, ty, tz, 1,
		]
	})
	const result = new Array(nodes.length)
	const visiting = new Set()
	const resolve = index => {
		if (result[index]) return result[index]
		if (visiting.has(index)) fail('STATIC_POSE_RIG_UNSUPPORTED', 'the node hierarchy has a cycle.')
		visiting.add(index)
		const local = localMatrices[index]
		if (parents[index] < 0) result[index] = local
		else {
			const parent = resolve(parents[index])
			const world = new Array(16).fill(0)
			for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) {
				for (let inner = 0; inner < 4; inner++) world[column * 4 + row] += parent[inner * 4 + row] * local[column * 4 + inner]
			}
			result[index] = world
		}
		visiting.delete(index)
		return result[index]
	}
	for (let index = 0; index < nodes.length; index++) resolve(index)
	return result
}

function constructionPoseMeasurements(json) {
	const indexes = new Map()
	for (const [index, node] of json.nodes.entries()) {
		if (!node?.name) continue
		if (indexes.has(node.name)) fail('STATIC_POSE_RIG_UNSUPPORTED', `duplicate node name ${JSON.stringify(node.name)}.`)
		indexes.set(node.name, index)
	}
	for (const name of REQUIRED_JOINTS) if (!indexes.has(name)) fail('STATIC_POSE_RIG_UNSUPPORTED', `required presenter joint ${JSON.stringify(name)} is missing.`)
	const worlds = worldMatrices(json.nodes)
	const position = name => worlds[indexes.get(name)].slice(12, 15)
	const leftShoulder = position('mixamorig:LeftArm')
	const rightShoulder = position('mixamorig:RightArm')
	const shoulderMidpoint = leftShoulder.map((value, index) => (value + rightShoulder[index]) / 2)
	const up = direction(subtract(shoulderMidpoint, position('mixamorig:Hips')), 'torso axis')
	const lateral = direction(subtract(leftShoulder, rightShoulder), 'shoulder axis')
	const arms = {}
	for (const [side, prefix, shoulder, sign] of [['left', 'Left', leftShoulder, 1], ['right', 'Right', rightShoulder, -1]]) {
		const elbow = position(`mixamorig:${prefix}ForeArm`)
		const hand = position(`mixamorig:${prefix}Hand`)
		const upper = direction(subtract(elbow, shoulder), `${side} upper arm`)
		const forearm = direction(subtract(hand, elbow), `${side} forearm`)
		const reach = direction(subtract(hand, shoulder), `${side} arm reach`)
		arms[side] = {
			elbowBendDegrees: degrees(dot(upper, forearm)),
			horizontalDeviationDegrees: Math.asin(Math.min(1, Math.abs(dot(reach, up)))) * 180 / Math.PI,
			outwardDeviationDegrees: degrees(sign * dot(reach, lateral)),
		}
	}
	// A raised hand alone is not a T-pose. Both arms must be straight, lateral,
	// and approximately horizontal relative to the torso. This is invariant to
	// the model's global orientation and leaves bent-elbow/one-arm gestures valid.
	const constructionTPose = Object.values(arms).every(arm => arm.elbowBendDegrees <= 20 && arm.horizontalDeviationDegrees <= 15 && arm.outwardDeviationDegrees <= 20)
	return { constructionTPose, arms }
}

/** Separate from the stricter neutral/idle guard: intentional raised arms are valid. */
export function assertNoConstructionTPose(buffer) {
	const measured = constructionPoseMeasurements(strictParse(buffer).json)
	if (measured.constructionTPose) fail('POWERPOINT_TPOSE_FORBIDDEN', 'the sampled static view exposes a construction T-pose.', measured)
	return measured
}

function accessorRows(json, bin, accessorIndex, expectedType, cache) {
	integer(accessorIndex, 'animation accessor index', (json.accessors?.length || 0) - 1)
	const cacheKey = `${accessorIndex}:${expectedType}`
	if (cache.has(cacheKey)) return cache.get(cacheKey)
	const accessor = json.accessors[accessorIndex]
	if (!accessor || accessor.componentType !== 5126 || accessor.type !== expectedType || accessor.sparse !== undefined || accessor.normalized === true) {
		fail('STATIC_POSE_ACCESSOR_UNSUPPORTED', `accessor ${accessorIndex} must be nonsparse FLOAT ${expectedType}.`)
	}
	const width = expectedType === 'SCALAR' ? 1 : expectedType === 'VEC3' ? 3 : 4
	integer(accessor.bufferView, `accessor ${accessorIndex} bufferView`, (json.bufferViews?.length || 0) - 1)
	const view = json.bufferViews[accessor.bufferView]
	if (!view || (view.buffer ?? 0) !== 0) fail('STATIC_POSE_ACCESSOR_UNSUPPORTED', 'animation data must use the embedded buffer.')
	const viewOffset = integer(view.byteOffset ?? 0, 'bufferView byteOffset')
	const viewLength = integer(view.byteLength, 'bufferView byteLength')
	const accessorOffset = integer(accessor.byteOffset ?? 0, 'accessor byteOffset')
	const count = integer(accessor.count, 'accessor count')
	const stride = integer(view.byteStride ?? width * 4, 'bufferView byteStride')
	if (count === 0 || stride < width * 4 || stride % 4 !== 0 || viewOffset % 4 !== 0 || accessorOffset % 4 !== 0 || viewOffset + viewLength > json.buffers[0].byteLength || accessorOffset + (count - 1) * stride + width * 4 > viewLength) {
		fail('STATIC_POSE_ACCESSOR_UNSUPPORTED', `accessor ${accessorIndex} has invalid bounds, stride, or alignment.`)
	}
	const rows = Array.from({ length: count }, (_, row) => Array.from({ length: width }, (_, component) => bin.readFloatLE(viewOffset + accessorOffset + row * stride + component * 4)))
	if (rows.some(row => row.some(value => !Number.isFinite(value)))) fail('STATIC_POSE_ACCESSOR_UNSUPPORTED', `accessor ${accessorIndex} contains nonfinite data.`)
	if (expectedType === 'SCALAR') {
		if (rows.some((row, index) => row[0] < 0 || (index > 0 && row[0] <= rows[index - 1][0]))) fail('STATIC_POSE_ACCESSOR_UNSUPPORTED', 'animation times must be nonnegative and strictly increasing.')
	} else if (expectedType === 'VEC4') rows.forEach((row, index) => normalizedQuaternion(row, `accessor ${accessorIndex} row ${index}`))
	cache.set(cacheKey, rows)
	return rows
}

function rotationClips(json, bin, { allowPassiveRootMotion = false } = {}) {
	if (!Array.isArray(json.animations) || !json.animations.length) fail('STATIC_POSE_ANIMATION_UNSUPPORTED', 'the final presenter must contain animations.')
	const cache = new Map()
	return json.animations.map((clip, clipIndex) => {
		if (!Array.isArray(clip?.channels) || !clip.channels.length || !Array.isArray(clip.samplers)) fail('STATIC_POSE_ANIMATION_UNSUPPORTED', `clip ${clipIndex} has no supported channels.`)
		const tracks = new Map()
		const passiveRootTracks = new Map()
		for (const channel of clip.channels) {
			const passiveRoot = allowPassiveRootMotion && channel?.target?.path === 'translation' && json.nodes[channel.target.node]?.name === 'mixamorig:Hips'
			if (channel?.target?.path !== 'rotation' && !passiveRoot) fail('STATIC_POSE_PATH_UNSUPPORTED', `clip ${clipIndex} is not a supported rotation-pose bundle; ${String(channel?.target?.path)} is unsupported.`)
			const nodeIndex = integer(channel.target.node, 'rotation target node', json.nodes.length - 1)
			const destinationTracks = passiveRoot ? passiveRootTracks : tracks
			if (destinationTracks.has(nodeIndex)) fail('STATIC_POSE_ANIMATION_UNSUPPORTED', `clip ${clipIndex} has duplicate ${channel.target.path} targets for node ${nodeIndex}.`)
			const samplerIndex = integer(channel.sampler, 'animation sampler', clip.samplers.length - 1)
			const sampler = clip.samplers[samplerIndex]
			if (!sampler || typeof sampler !== 'object' || Array.isArray(sampler)) fail('STATIC_POSE_ANIMATION_UNSUPPORTED', `clip ${clipIndex} has an invalid sampler.`)
			const interpolation = sampler?.interpolation ?? 'LINEAR'
			if (interpolation !== 'LINEAR' && interpolation !== 'STEP') fail('STATIC_POSE_INTERPOLATION_UNSUPPORTED', `clip ${clipIndex} uses unsupported interpolation ${String(interpolation)}.`)
			const times = accessorRows(json, bin, sampler.input, 'SCALAR', cache).map(row => row[0])
			const values = accessorRows(json, bin, sampler.output, passiveRoot ? 'VEC3' : 'VEC4', cache)
			if (values.length !== times.length) fail('STATIC_POSE_ACCESSOR_UNSUPPORTED', `clip ${clipIndex} has mismatched time/rotation counts.`)
			destinationTracks.set(nodeIndex, { times, values, interpolation })
		}
		if (!tracks.size) fail('STATIC_POSE_ANIMATION_UNSUPPORTED', `clip ${clipIndex} has no rotation tracks.`)
		return { clipName: typeof clip.name === 'string' ? clip.name : null, tracks, passiveRootTracks, durationSeconds: Math.max(...[...tracks.values(), ...passiveRootTracks.values()].map(track => track.times.at(-1))) }
	})
}

function sampleRotation(track, time) {
	const { times, values, interpolation } = track
	if (time <= times[0]) return normalizedQuaternion(values[0], 'sampled rotation')
	if (time >= times.at(-1)) return normalizedQuaternion(values.at(-1), 'sampled rotation')
	let low = 0, high = times.length - 1
	while (high - low > 1) {
		const middle = Math.floor((low + high) / 2)
		if (times[middle] <= time) low = middle
		else high = middle
	}
	const first = normalizedQuaternion(values[low], 'sampled rotation')
	if (interpolation === 'STEP') return first
	return normalizedQuaternion(slerp(first, normalizedQuaternion(values[high], 'sampled rotation'), (time - times[low]) / (times[high] - times[low])), 'interpolated rotation')
}

function nonRotationJson(json) {
	return JSON.stringify({ ...json, nodes: json.nodes.map(node => {
		const result = { ...node }
		delete result.rotation
		return result
	}) })
}

function sampleTranslation({ times, values, interpolation }, time) {
	if (time <= times[0]) return values[0]
	if (time >= times.at(-1)) return values.at(-1)
	let index = 0
	while (times[index + 1] <= time) index++
	if (interpolation === 'STEP') return values[index]
	const fraction = (time - times[index]) / (times[index + 1] - times[index])
	return values[index].map((value, axis) => value + fraction * (values[index + 1][axis] - value))
}

/**
 * Derive only a stopped/edit-view pose from the final GLB's own animation.
 * clipIndex is the already-resolved private slot; this helper does no semantic
 * motion selection. timeMs is measured in that clip, not a playback offset.
 * All retained clips must key every changed node rotation. A maintained mixed
 * bank can opt into passive Hips-translation validation: those tracks are kept
 * byte-exact, never flattened or sampled into an unkeyed shared default. This
 * permits existing idle/point static poses after a grounded motion is added.
 * Omission/reset belongs to the caller, which must retain the original asset.
 */
export function applyRotationOnlyStaticPoseAtTime(sourceBuffer, { clipIndex, timeMs, allowPassiveRootMotion = false } = {}) {
	if (typeof allowPassiveRootMotion !== 'boolean') fail('STATIC_POSE_INPUT_INVALID', 'allowPassiveRootMotion must be a boolean.')
	const { json, bin } = strictParse(sourceBuffer)
	const beforeNonRotationJson = nonRotationJson(json)
	// Validate the complete starting hierarchy without requiring an idle pose.
	constructionPoseMeasurements(json)
	const clips = rotationClips(json, bin, { allowPassiveRootMotion })
	integer(clipIndex, 'clipIndex', clips.length - 1)
	const clip = clips[clipIndex]
	const durationMs = clip.durationSeconds * 1000
	if (typeof timeMs !== 'number' || !Number.isFinite(timeMs) || timeMs < 0 || timeMs > durationMs) fail('STATIC_POSE_TIME_INVALID', `timeMs must be a finite number from 0 through ${durationMs}.`)
	for (const [nodeIndex, track] of clip.passiveRootTracks) {
		const sampled = sampleTranslation(track, timeMs / 1000)
		const previous = vector(json.nodes[nodeIndex].translation, 3, [0, 0, 0], 'stopped Hips translation')
		if (sampled.some((value, axis) => Math.abs(value - previous[axis]) > 0.000001)) {
			fail('STATIC_POSE_PLAYBACK_COVERAGE_INCOMPLETE', 'This frame requires changing the shared Hips position. A rotation-only stopped-pose edit cannot change unkeyed playback defaults; choose a supported idle or pointing frame.')
		}
	}
	const changedNodeIndexes = []
	for (const [nodeIndex, track] of clip.tracks) {
		const sampled = sampleRotation(track, timeMs / 1000)
		const previous = normalizedQuaternion(json.nodes[nodeIndex].rotation, `node ${nodeIndex} rotation`)
		if (1 - Math.abs(dot(previous, sampled)) <= ORIENTATION_EQUALITY_TOLERANCE) continue
		const uncoveredClips = clips.flatMap((retained, index) => retained.tracks.has(nodeIndex) ? [] : [index])
		if (uncoveredClips.length) fail('STATIC_POSE_PLAYBACK_COVERAGE_INCOMPLETE', `changing node ${nodeIndex} would alter unkeyed playback defaults.`, { nodeIndex, nodeName: json.nodes[nodeIndex].name || null, uncoveredClips })
		json.nodes[nodeIndex].rotation = sampled
		changedNodeIndexes.push(nodeIndex)
	}
	const constructionPose = constructionPoseMeasurements(json)
	if (constructionPose.constructionTPose) fail('POWERPOINT_TPOSE_FORBIDDEN', 'the sampled static view exposes a construction T-pose.', constructionPose)
	const buffer = serializeGlb(json, bin)
	const after = strictParse(buffer)
	if (!after.bin.equals(bin) || nonRotationJson(after.json) !== beforeNonRotationJson) fail('STATIC_POSE_PRESERVATION_FAILED', 'a nonrotation field or binary byte changed.')
	return {
		buffer,
		profileVersion: STATIC_POSE_AT_TIME_PROFILE_VERSION,
		clipIndex,
		clipName: clip.clipName,
		sampleTimeMs: timeMs,
		sampledNodeRotations: clip.tracks.size,
		changedNodeRotations: changedNodeIndexes.length,
		changedNodeIndexes,
		constructionPose,
		playbackStartOffsetApplied: false,
		passiveRootTranslationTracksPreserved: clips.reduce((count, retained) => count + retained.passiveRootTracks.size, 0),
	}
}
