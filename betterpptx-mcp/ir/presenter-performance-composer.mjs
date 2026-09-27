import { parseGlb, serializeGlb } from './kinetic-transplant.mjs'
import { PRESENTER_PERFORMANCE_LIMITS } from '../presenter-performance-contract.mjs'

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
const BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const READERS = { 5120: 'readInt8', 5121: 'readUInt8', 5122: 'readInt16LE', 5123: 'readUInt16LE', 5125: 'readUInt32LE', 5126: 'readFloatLE' }
const DEFAULT_TRANSFORM = { yawDegrees: 0, pitchDegrees: 0, rollDegrees: 0, scale: 1, depth: 0, height: 0 }
const TRANSFORM_RANGES = { yawDegrees: [-1080, 1080], pitchDegrees: [-180, 180], rollDegrees: [-180, 180], scale: [.25, 3], depth: [-4, 4], height: [0, 4] }
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value))
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t) }
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const lerp = (a, b, t) => a.map((value, index) => value + (b[index] - value) * t)

function fail(message, code = 'PRESENTER_PERFORMANCE_INVALID') {
	const error = new Error(message)
	error.code = code
	throw error
}
function finite(value, label, minimum = -Infinity, maximum = Infinity) {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) fail(`${label} must be a finite number from ${minimum} to ${maximum}.`)
	return value
}
function vector(value, count, label) {
	if (!Array.isArray(value) || value.length !== count || value.some(number => typeof number !== 'number' || !Number.isFinite(number))) fail(`${label} must contain ${count} finite numbers.`, 'PRESENTER_PERFORMANCE_ASSET_INVALID')
	return value
}
function quaternion(value) {
	const magnitude = Math.hypot(...value)
	if (!Number.isFinite(magnitude) || magnitude < 1e-12) fail('A motion contains an invalid rotation.', 'PRESENTER_PERFORMANCE_ASSET_INVALID')
	return value.map(number => number / magnitude)
}
function slerp(a, b, t) {
	a = quaternion(a); b = quaternion(b)
	let dot = a.reduce((sum, value, index) => sum + value * b[index], 0)
	if (dot < 0) { b = b.map(value => -value); dot = -dot }
	if (dot > .9995) return quaternion(lerp(a, b, t))
	const angle = Math.acos(clamp(dot, -1, 1)), denominator = Math.sin(angle)
	return a.map((value, index) => (value * Math.sin((1 - t) * angle) + b[index] * Math.sin(t * angle)) / denominator)
}
function multiply(a, b) {
	const result = new Array(16).fill(0)
	for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) result[column * 4 + row] += a[k * 4 + row] * b[column * 4 + k]
	return result
}
function inverse(matrix) {
	const rows = Array.from({ length: 4 }, (_, row) => Array.from({ length: 8 }, (_, column) => column < 4 ? matrix[column * 4 + row] : Number(column - 4 === row)))
	for (let column = 0; column < 4; column++) {
		let pivot = column
		for (let row = column + 1; row < 4; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row
		if (Math.abs(rows[pivot][column]) < 1e-12) fail('The presenter has a singular parent transform.', 'PRESENTER_PERFORMANCE_RIG_UNSUPPORTED')
		;[rows[column], rows[pivot]] = [rows[pivot], rows[column]]
		const divisor = rows[column][column]
		for (let k = 0; k < 8; k++) rows[column][k] /= divisor
		for (let row = 0; row < 4; row++) {
			if (row === column) continue
			const factor = rows[row][column]
			for (let k = 0; k < 8; k++) rows[row][k] -= factor * rows[column][k]
		}
	}
	return Array.from({ length: 16 }, (_, index) => rows[index % 4][4 + Math.floor(index / 4)])
}
function matrixFromTrs(translation = [0, 0, 0], rotation = [0, 0, 0, 1], scale = [1, 1, 1]) {
	const [x, y, z, w] = quaternion(rotation), [sx, sy, sz] = scale
	return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
		2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
		2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, ...translation, 1]
}
function decompose(matrix) {
	const scale = [Math.hypot(matrix[0], matrix[1], matrix[2]), Math.hypot(matrix[4], matrix[5], matrix[6]), Math.hypot(matrix[8], matrix[9], matrix[10])]
	if (scale.some(value => value < 1e-10 || !Number.isFinite(value))) fail('The presenter motion has a singular transform.', 'PRESENTER_PERFORMANCE_RIG_UNSUPPORTED')
	const a = matrix[0] / scale[0], b = matrix[4] / scale[1], c = matrix[8] / scale[2]
	const d = matrix[1] / scale[0], e = matrix[5] / scale[1], f = matrix[9] / scale[2]
	const g = matrix[2] / scale[0], h = matrix[6] / scale[1], i = matrix[10] / scale[2]
	let rotation, divisor
	if (a + e + i > 0) { divisor = Math.sqrt(a + e + i + 1) * 2; rotation = [(h - f) / divisor, (c - g) / divisor, (d - b) / divisor, divisor / 4] }
	else if (a > e && a > i) { divisor = Math.sqrt(1 + a - e - i) * 2; rotation = [divisor / 4, (b + d) / divisor, (c + g) / divisor, (h - f) / divisor] }
	else if (e > i) { divisor = Math.sqrt(1 + e - a - i) * 2; rotation = [(b + d) / divisor, divisor / 4, (f + h) / divisor, (c - g) / divisor] }
	else { divisor = Math.sqrt(1 + i - a - e) * 2; rotation = [(c + g) / divisor, (f + h) / divisor, divisor / 4, (d - b) / divisor] }
	return { translation: matrix.slice(12, 15), rotation: quaternion(rotation), scale }
}
const transformPoint = (matrix, point) => [matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12], matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13], matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14]]
function bounds(points) {
	const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
	for (const point of points) for (let axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], point[axis]); max[axis] = Math.max(max[axis], point[axis]) }
	if (![...min, ...max].every(Number.isFinite)) fail('The presenter has no measurable skinned geometry.', 'PRESENTER_PERFORMANCE_RIG_UNSUPPORTED')
	return { min, max, size: max.map((value, axis) => value - min[axis]), center: max.map((value, axis) => (value + min[axis]) / 2) }
}

// This is the exact, validated input consumed by native scene composition.
// Slide lead-in, actor names, travel and element targets belong to staging and
// must not cause an identical articulated scene to be composed again.
export function validatedPresenterPerformanceRecipe(performance, fps = 30) {
	if (!performance || typeof performance !== 'object' || !Array.isArray(performance.actions) || performance.actions.length < 1 || performance.actions.length > PRESENTER_PERFORMANCE_LIMITS.maximumActions) fail(`A performance must contain one to ${PRESENTER_PERFORMANCE_LIMITS.maximumActions} actions.`)
	const resolvedFps = performance.fps ?? fps
	finite(resolvedFps, 'fps', PRESENTER_PERFORMANCE_LIMITS.fpsRange[0], PRESENTER_PERFORMANCE_LIMITS.fpsRange[1])
	if (!Number.isInteger(resolvedFps)) fail('fps must be an integer.')
	const ids = new Set(), actions = []; let durationMs = 0
	for (const action of performance.actions) {
		if (!action || typeof action.id !== 'string' || !action.id.trim() || action.id.length > 128 || ids.has(action.id)) fail('Every performance action needs a unique nonempty id of at most 128 characters.')
		if (typeof action.motionId !== 'string' || !/^motion\.[a-z0-9-]+\.[a-z0-9-]+$/i.test(action.motionId)) fail('Every performance action needs an exact semantic motion ID.')
		finite(action.durationMs, 'action.durationMs', PRESENTER_PERFORMANCE_LIMITS.actionDurationMs[0], PRESENTER_PERFORMANCE_LIMITS.actionDurationMs[1])
		const cycles = action.cycles === undefined ? 1 : finite(action.cycles, 'action.cycles', 1, PRESENTER_PERFORMANCE_LIMITS.maximumCycles)
		const sourceStartMs = action.sourceStartMs === undefined ? 0 : finite(action.sourceStartMs, 'action.sourceStartMs', 0, PRESENTER_PERFORMANCE_LIMITS.maximumDurationMs)
		const sourceEndMs = action.sourceEndMs === undefined ? undefined : finite(action.sourceEndMs, 'action.sourceEndMs', 1, PRESENTER_PERFORMANCE_LIMITS.maximumDurationMs)
		if (!Number.isInteger(sourceStartMs) || sourceEndMs !== undefined && !Number.isInteger(sourceEndMs)) fail('Action source range endpoints must use whole milliseconds.')
		if (sourceEndMs !== undefined && sourceEndMs <= sourceStartMs) fail('action.sourceEndMs must be greater than action.sourceStartMs.')
		ids.add(action.id)
		actions.push({ id: action.id, motionId: action.motionId, startMs: durationMs, durationMs: action.durationMs, endMs: durationMs + action.durationMs, cycles, ...(action.sourceStartMs === undefined ? {} : { sourceStartMs }), ...(sourceEndMs === undefined ? {} : { sourceEndMs }) })
		durationMs += action.durationMs
	}
	if (durationMs > PRESENTER_PERFORMANCE_LIMITS.maximumDurationMs) fail(`A continuous presenter performance cannot exceed ${PRESENTER_PERFORMANCE_LIMITS.maximumDurationMs} milliseconds.`)
	const blendMs = performance.blendMs === undefined ? 240 : finite(performance.blendMs, 'blendMs', 0, PRESENTER_PERFORMANCE_LIMITS.maximumBlendMs)
	if (performance.transforms !== undefined && (!Array.isArray(performance.transforms) || performance.transforms.length > PRESENTER_PERFORMANCE_LIMITS.maximumTransformKeyframes)) fail(`Performance transforms must be an array of at most ${PRESENTER_PERFORMANCE_LIMITS.maximumTransformKeyframes} keyframes.`)
	const transforms = []; let previousAt = -1, previous = { ...DEFAULT_TRANSFORM }
	for (const key of performance.transforms || []) {
		finite(key?.atMs, 'transform.atMs', 0, durationMs)
		if (key.atMs <= previousAt) fail('Transform keyframes must have unique increasing atMs values.')
		const next = { ...previous, atMs: key.atMs, easing: key.easing || 'smooth' }
		if (!['linear', 'smooth', 'easeIn', 'easeOut'].includes(next.easing)) fail('Transform easing must be linear, smooth, easeIn, or easeOut.')
		for (const [field, range] of Object.entries(TRANSFORM_RANGES)) if (key[field] !== undefined) next[field] = finite(key[field], `transform.${field}`, ...range)
		transforms.push(next); previousAt = key.atMs; previous = next
	}
	if (!transforms.length || transforms[0].atMs > 0) transforms.unshift({ atMs: 0, easing: 'smooth', ...DEFAULT_TRANSFORM })
	let entry = null, exit = null
	if (performance.entry) {
		const value = performance.entry
		if (!['drop', 'fade', 'appear'].includes(value.type)) fail('Entry type must be drop, fade, or appear.')
		const entryDuration = finite(value.durationMs, 'entry.durationMs', value.type === 'drop' ? 1 : 0, Math.min(PRESENTER_PERFORMANCE_LIMITS.maximumEntryExitDurationMs, durationMs))
		entry = { type: value.type, durationMs: entryDuration, atMs: 0, ...(value.fadeMs === undefined ? {} : { fadeMs: finite(value.fadeMs, 'entry.fadeMs', 0, durationMs) }), ...(value.type === 'drop' ? { height: value.height === undefined ? .35 : finite(value.height, 'entry.height', 0, 4) } : {}) }
	}
	if (performance.exit) {
		const value = performance.exit
		if (!['fade', 'disappear'].includes(value.type)) fail('Exit type must be fade or disappear.')
		const exitDuration = finite(value.durationMs, 'exit.durationMs', 0, Math.min(PRESENTER_PERFORMANCE_LIMITS.maximumEntryExitDurationMs, durationMs))
		const atMs = value.atMs === undefined ? durationMs - exitDuration : finite(value.atMs, 'exit.atMs', 0, durationMs)
		if (atMs + exitDuration > durationMs) fail('The exit must finish within the performance duration.')
		exit = { type: value.type, atMs, durationMs: exitDuration, endMs: atMs + exitDuration }
	}
	return { fps: resolvedFps, actions, transforms, durationMs, blendMs, entry, exit }
}

function readAsset(bytes) {
	let asset
	try { asset = parseGlb(bytes) } catch { fail('The presenter asset is not a valid binary 3D model.', 'PRESENTER_PERFORMANCE_ASSET_INVALID') }
	const { json, bin } = asset, cache = new Map()
	if (!Array.isArray(json.nodes) || !json.nodes.length || !Array.isArray(json.skins) || !json.skins.length) fail('The presenter must contain a connected skinned skeleton.', 'PRESENTER_PERFORMANCE_RIG_UNSUPPORTED')
	function accessor(index) {
		if (cache.has(index)) return cache.get(index)
		const value = json.accessors?.[index], view = json.bufferViews?.[value?.bufferView]
		const width = COMPONENTS[value?.type], bytes = BYTES[value?.componentType], reader = READERS[value?.componentType]
		if (!view || !width || !reader || value.sparse || (view.buffer || 0) !== 0 || !Number.isInteger(value.count) || value.count < 1) fail('The presenter contains unsupported or invalid motion/geometry accessors.', 'PRESENTER_PERFORMANCE_ASSET_INVALID')
		const offset = (view.byteOffset || 0) + (value.byteOffset || 0), stride = view.byteStride || width * bytes
		const end = offset + (value.count - 1) * stride + width * bytes
		if (offset < 0 || stride < width * bytes || end > bin.length || end > (view.byteOffset || 0) + view.byteLength) fail('The presenter contains an out-of-bounds accessor.', 'PRESENTER_PERFORMANCE_ASSET_INVALID')
		const rows = Array.from({ length: value.count }, (_, row) => Array.from({ length: width }, (_, component) => {
			let number = bin[reader](offset + row * stride + component * bytes)
			if (value.normalized && value.componentType !== 5126) {
				const maximum = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535, 5125: 4294967295 }[value.componentType]
				number = Math.max(value.componentType === 5120 || value.componentType === 5122 ? -1 : 0, number / maximum)
			}
			if (!Number.isFinite(number)) fail('The presenter contains non-finite motion or geometry data.', 'PRESENTER_PERFORMANCE_ASSET_INVALID')
			return number
		}))
		cache.set(index, rows)
		return rows
	}
	const parents = new Array(json.nodes.length).fill(-1)
	for (const [index, node] of json.nodes.entries()) {
		if (node.translation) vector(node.translation, 3, 'Node translation')
		if (node.rotation) quaternion(vector(node.rotation, 4, 'Node rotation'))
		if (node.scale) vector(node.scale, 3, 'Node scale')
		if (node.matrix) vector(node.matrix, 16, 'Node matrix')
		for (const child of node.children || []) {
			if (!Number.isInteger(child) || !json.nodes[child] || parents[child] !== -1) fail('The presenter skeleton is not a valid tree.', 'PRESENTER_PERFORMANCE_RIG_UNSUPPORTED')
			parents[child] = index
		}
	}
	function worlds(pose = new Map()) {
		const output = [], visiting = new Set()
		const resolve = index => {
			if (output[index]) return output[index]
			if (visiting.has(index)) fail('The presenter skeleton contains a cycle.', 'PRESENTER_PERFORMANCE_RIG_UNSUPPORTED')
			visiting.add(index)
			const node = json.nodes[index]
			const local = node.matrix || matrixFromTrs(pose.get(`${index}:translation`) || node.translation, pose.get(`${index}:rotation`) || node.rotation, pose.get(`${index}:scale`) || node.scale)
			output[index] = parents[index] < 0 ? local : multiply(resolve(parents[index]), local)
			visiting.delete(index)
			return output[index]
		}
		json.nodes.forEach((_, index) => resolve(index))
		return output
	}
	const staticWorlds = worlds(), geometries = [], allJoints = new Set()
	for (const [nodeIndex, node] of json.nodes.entries()) {
		if (node.mesh === undefined) continue
		const skin = json.skins[node.skin]
		if (!skin || !Array.isArray(skin.joints) || !skin.joints.length) fail('Every presenter mesh must use the connected skeleton.', 'PRESENTER_PERFORMANCE_RIG_UNSUPPORTED')
		for (const joint of skin.joints) { if (!json.nodes[joint]) fail('The presenter has an invalid skin joint.', 'PRESENTER_PERFORMANCE_ASSET_INVALID'); allJoints.add(joint) }
		const inverseBinds = skin.inverseBindMatrices === undefined ? skin.joints.map(identity) : accessor(skin.inverseBindMatrices)
		if (inverseBinds.length !== skin.joints.length || inverseBinds.some(row => row.length !== 16)) fail('The presenter has invalid skin binding matrices.', 'PRESENTER_PERFORMANCE_ASSET_INVALID')
		for (const primitive of json.meshes?.[node.mesh]?.primitives || []) {
			const attributes = primitive.attributes || {}
			const positions = accessor(attributes.POSITION), joints = accessor(attributes.JOINTS_0), weights = accessor(attributes.WEIGHTS_0)
			if (positions.length !== joints.length || positions.length !== weights.length || positions.some(row => row.length !== 3) || joints.some(row => row.length !== 4) || weights.some(row => row.length !== 4)) fail('The presenter has incompatible skinned vertex attributes.', 'PRESENTER_PERFORMANCE_ASSET_INVALID')
			for (let index = 0; index < joints.length; index++) {
				if (joints[index].some(joint => !Number.isInteger(joint) || joint < 0 || joint >= skin.joints.length) || weights[index].some(weight => weight < 0) || Math.abs(weights[index].reduce((sum, value) => sum + value, 0) - 1) > .01) fail('The presenter has invalid skin weights.', 'PRESENTER_PERFORMANCE_ASSET_INVALID')
			}
			geometries.push({ nodeIndex, namedFootwear: /shoe|boot|foot/i.test(String(node.name || '')), positions, joints, weights, skin, inverseBinds })
		}
	}
	const ancestorOf = (ancestor, child) => { for (let index = child; index >= 0; index = parents[index]) if (index === ancestor) return true; return false }
	const rootCandidates = [...allJoints].filter(candidate => [...allJoints].every(joint => ancestorOf(candidate, joint)))
	if (!rootCandidates.length) fail('This presenter requires one connected skeletal root joint; disconnected rigs are unsupported.', 'PRESENTER_PERFORMANCE_RIG_UNSUPPORTED')
	const root = rootCandidates.find(candidate => rootCandidates.every(other => ancestorOf(other, candidate)))
	if (json.nodes[root].matrix) fail('The skeletal root must use decomposed position, rotation, and scale.', 'PRESENTER_PERFORMANCE_RIG_UNSUPPORTED')
	function points(world, selections = null) {
		const result = []
		for (const [geometryIndex, geometry] of geometries.entries()) {
			const indices = selections?.[geometryIndex]
			if (selections && !indices?.length) continue
			const matrices = geometry.skin.joints.map((joint, index) => multiply(world[joint], geometry.inverseBinds[index]))
			for (const vertex of indices || geometry.positions.keys()) {
				const position = [0, 0, 0]
				for (let slot = 0; slot < 4; slot++) {
					const weight = geometry.weights[vertex][slot]
					if (!weight) continue
					const point = transformPoint(matrices[geometry.joints[vertex][slot]], geometry.positions[vertex])
					for (let axis = 0; axis < 3; axis++) position[axis] += point[axis] * weight
				}
				result.push(position)
			}
		}
		return result
	}
	const staticPoints = points(staticWorlds), staticBounds = bounds(staticPoints), modelHeight = staticBounds.size[1]
	if (modelHeight < 1e-6) fail('The presenter has no measurable standing height.', 'PRESENTER_PERFORMANCE_RIG_UNSUPPORTED')
	const footJoints = new Set([...allJoints].filter(index => /foot|toe/i.test(String(json.nodes[index].name || ''))))
	let cursor = 0
	const shoeVertices = geometries.map(geometry => geometry.positions.flatMap((_, vertex) => {
		const staticPoint = staticPoints[cursor++]
		const footWeight = geometry.weights[vertex].reduce((sum, weight, slot) => sum + (footJoints.has(geometry.skin.joints[geometry.joints[vertex][slot]]) ? weight : 0), 0)
		return geometry.namedFootwear || footWeight >= .5 || staticPoint[1] <= staticBounds.min[1] + modelHeight * .025 ? [vertex] : []
	}))
	const restSoles = points(staticWorlds, shoeVertices), floorY = bounds(restSoles).min[1]
	const sampleStride = Math.max(1, Math.ceil(staticPoints.length / 6000))
	const boundsVertices = geometries.map(geometry => [...geometry.positions.keys()].filter(index => index % sampleStride === 0))
	const handNodes = {}
	for (const side of ['left', 'right']) {
		const named = [...allJoints].find(index => {
			const name = String(json.nodes[index].name || '').toLowerCase().replace(/[^a-z]/g, '')
			return name.includes(`${side}hand`) && !/thumb|index|middle|ring|pinky|end/.test(name) || name.includes(`${side}wrist`) || name === `hand${side[0]}` || name === `wrist${side[0]}`
		})
		const candidates = [...allJoints].filter(index => { const y = staticWorlds[index][13]; return y >= floorY + modelHeight * .3 && y <= floorY + modelHeight * .9 && index !== root })
		handNodes[side] = named ?? candidates.sort((a, b) => side === 'left' ? staticWorlds[b][12] - staticWorlds[a][12] : staticWorlds[a][12] - staticWorlds[b][12])[0]
	}
	return { json, bin, accessor, parents, worlds, staticWorlds, geometries, points, staticBounds, modelHeight, floorY, allJoints, root, shoeVertices, boundsVertices, handNodes }
}

function sampleChannel(channel, time) {
	const { times, values, path, interpolation } = channel
	const valueAt = index => values[interpolation === 'CUBICSPLINE' ? index * 3 + 1 : index]
	if (time <= times[0]) return valueAt(0)
	if (time >= times.at(-1)) return valueAt(times.length - 1)
	let low = 0, high = times.length - 1
	while (high - low > 1) { const middle = (low + high) >> 1; if (times[middle] <= time) low = middle; else high = middle }
	if (interpolation === 'STEP') return valueAt(low)
	const span = times[high] - times[low], t = (time - times[low]) / span
	if (interpolation === 'CUBICSPLINE') {
		const a = valueAt(low), b = valueAt(high), outgoing = values[low * 3 + 2], incoming = values[high * 3]
		const result = a.map((value, axis) => (2 * t ** 3 - 3 * t ** 2 + 1) * value + (t ** 3 - 2 * t ** 2 + t) * span * outgoing[axis] + (-2 * t ** 3 + 3 * t ** 2) * b[axis] + (t ** 3 - t ** 2) * span * incoming[axis])
		return path === 'rotation' ? quaternion(result) : result
	}
	return path === 'rotation' ? slerp(valueAt(low), valueAt(high), t) : lerp(valueAt(low), valueAt(high), t)
}

/**
 * Compose already-retargeted exact motion selections into one Office-playable
 * skeletal animation. No assets, identities, clip choices, or slide geometry
 * are invented here. Transform distances are multiples of standing height.
 * Visibility and slide-frame travel remain the caller's native timing job.
 */
export function composePresenterPerformance({ glbBytes, clipMap, performance, fps = 30 } = {}) {
	const plan = validatedPresenterPerformanceRecipe(performance, fps), asset = readAsset(glbBytes)
	const { json, bin, accessor, root, modelHeight, floorY } = asset
	const parentWorld = asset.parents[root] < 0 ? identity() : asset.staticWorlds[asset.parents[root]], parentInverse = inverse(parentWorld)
	if (!clipMap || typeof clipMap !== 'object') fail('An exact semantic motion-to-animation map is required.')
	const clips = new Map(), trackKeys = new Set()
	for (const action of plan.actions) {
		if (clips.has(action.motionId)) continue
		const selector = clipMap instanceof Map ? clipMap.get(action.motionId) : Object.hasOwn(clipMap, action.motionId) ? clipMap[action.motionId] : undefined
		const animation = Number.isInteger(selector) ? json.animations?.[selector] : typeof selector === 'string' ? json.animations?.find(value => value.name === selector) : null
		if (!animation?.channels?.length) fail(`No exact source motion is available for action ${action.id}.`, 'PRESENTER_PERFORMANCE_MOTION_MISSING')
		const channels = new Map()
		for (const channel of animation.channels) {
			const { node, path } = channel.target || {}, sampler = animation.samplers?.[channel.sampler]
			if (!asset.allJoints.has(node) || !['rotation', 'translation', 'scale'].includes(path) || !sampler || json.nodes[node].matrix) fail('Selected motions must animate decomposed skeletal joints only.', 'PRESENTER_PERFORMANCE_RIG_UNSUPPORTED')
			const interpolation = sampler.interpolation || 'LINEAR', times = accessor(sampler.input).map(row => row[0]), values = accessor(sampler.output)
			const width = path === 'rotation' ? 4 : 3, key = `${node}:${path}`
			if (!['LINEAR', 'STEP', 'CUBICSPLINE'].includes(interpolation) || channels.has(key) || times.some((time, index) => time < 0 || index > 0 && time <= times[index - 1]) || values.length !== times.length * (interpolation === 'CUBICSPLINE' ? 3 : 1) || values.some(row => row.length !== width)) fail('A selected motion has incompatible animation samples.', 'PRESENTER_PERFORMANCE_ASSET_INVALID')
			if (path === 'rotation') for (let index = interpolation === 'CUBICSPLINE' ? 1 : 0; index < values.length; index += interpolation === 'CUBICSPLINE' ? 3 : 1) quaternion(values[index])
			channels.set(key, { times, values, path, interpolation }); trackKeys.add(key)
		}
		// Source offsets refer to the animation's own zero-based clock. A clip
		// whose first key is later than zero holds that key during its preroll.
		const start = 0, end = Math.max(...[...channels.values()].map(channel => channel.times.at(-1)))
		if (end <= start) fail('A selected source motion has no positive duration.', 'PRESENTER_PERFORMANCE_ASSET_INVALID')
		clips.set(action.motionId, { channels, start, duration: end - start })
	}
	const actionSources = new Map()
	for (const action of plan.actions) {
		const clip = clips.get(action.motionId), durationMs = clip.duration * 1000
		const requestedStartMs = action.sourceStartMs === undefined ? 0 : action.sourceStartMs, requestedEndMs = action.sourceEndMs === undefined ? durationMs : action.sourceEndMs
		// GLB sample times are float32 seconds. A whole-ms endpoint may exceed
		// its stored source endpoint by a tiny rounding error; clamp only 1 ms.
		if (requestedStartMs > durationMs + 1 || requestedEndMs > durationMs + 1) fail(`The source range for action ${action.id} must fit within its ${Math.round(durationMs)} millisecond source motion.`)
		const sourceStartMs = Math.min(requestedStartMs, durationMs), sourceEndMs = Math.min(requestedEndMs, durationMs)
		if (sourceEndMs <= sourceStartMs) fail(`The source range for action ${action.id} must have positive duration.`)
		const start = clip.start + sourceStartMs / 1000, end = clip.start + sourceEndMs / 1000
		// Detect source-authored airtime within the consumed segment, so cropping
		// a jump to a stationary pose does not introduce false root movement.
		const rootTranslation = clip.channels.get(`${root}:translation`), restTranslation = json.nodes[root].translation || [0, 0, 0]
		const sampleTimes = rootTranslation ? [start, ...rootTranslation.times.filter(time => time > start && time < end), end] : []
		const rootRows = sampleTimes.map(time => sampleChannel(rootTranslation, time))
		if (rootTranslation?.interpolation === 'CUBICSPLINE') for (let index = 1; index < sampleTimes.length; index++) for (const fraction of [.25, .5, .75]) rootRows.push(sampleChannel(rootTranslation, sampleTimes[index - 1] + (sampleTimes[index] - sampleTimes[index - 1]) * fraction))
		const verticalRange = rootRows.reduce((range, row) => {
			const offset = parentWorld[1] * (row[0] - restTranslation[0]) + parentWorld[5] * (row[1] - restTranslation[1]) + parentWorld[9] * (row[2] - restTranslation[2])
			return [Math.min(range[0], offset), Math.max(range[1], offset)]
		}, [Infinity, -Infinity])
		const motionTolerance = modelHeight * 1e-6
		const hasVerticalRootMotion = verticalRange[1] > motionTolerance && verticalRange[1] - verticalRange[0] > motionTolerance
		actionSources.set(action.id, { start, duration: end - start, sourceStartMs, sourceEndMs, hasVerticalRootMotion })
	}
	for (const path of ['rotation', 'translation', 'scale']) trackKeys.add(`${root}:${path}`)
	const orderedKeys = [...trackKeys].sort((a, b) => Number(a.split(':')[0]) - Number(b.split(':')[0]) || a.localeCompare(b, 'en'))
	const defaults = new Map(orderedKeys.map(key => { const [node, path] = key.split(':'); return [key, json.nodes[Number(node)][path] || (path === 'rotation' ? [0, 0, 0, 1] : path === 'scale' ? [1, 1, 1] : [0, 0, 0])] }))
	const eventTimes = new Set([0, plan.durationMs])
	for (const action of plan.actions) { eventTimes.add(action.startMs); eventTimes.add(action.endMs) }
	for (const key of plan.transforms) eventTimes.add(key.atMs)
	if (plan.entry) eventTimes.add(plan.entry.durationMs)
	if (plan.exit) { eventTimes.add(plan.exit.atMs); eventTimes.add(plan.exit.endMs) }
	const storedTimes = new Map()
	for (const atMs of eventTimes) {
		const stored = Math.fround(atMs / 1000)
		if (storedTimes.has(stored) && storedTimes.get(stored) !== atMs) fail('Authored timing events are too close for 3D animation timing precision.')
		storedTimes.set(stored, atMs)
	}
	for (let frame = 1; frame / fps * 1000 < plan.durationMs; frame++) {
		const atMs = frame / fps * 1000, stored = Math.fround(atMs / 1000)
		if (!storedTimes.has(stored)) storedTimes.set(stored, atMs)
	}
	const times = [...storedTimes.values()].sort((a, b) => a - b)
	function actionSample(action, key, atMs) {
		const clip = clips.get(action.motionId), source = actionSources.get(action.id), channel = clip.channels.get(key)
		if (!channel) return defaults.get(key)
		const progress = clamp((atMs - action.startMs) / action.durationMs) * action.cycles
		const fraction = progress > 0 && Math.abs(progress - Math.round(progress)) < 1e-10 && atMs >= action.endMs ? 1 : progress % 1
		return sampleChannel(channel, source.start + fraction * source.duration)
	}
	function actionBlendAt(atMs) {
		let index = plan.actions.findIndex(action => atMs < action.endMs)
		if (index < 0) index = plan.actions.length - 1
		let left = index, right = index, mix = 0
		for (let boundary = 1; boundary < plan.actions.length && plan.blendMs > 0; boundary++) {
			const a = plan.actions[boundary - 1], b = plan.actions[boundary], half = Math.min(plan.blendMs / 2, a.durationMs * .45, b.durationMs * .45)
			if (Math.abs(atMs - b.startMs) <= half) { left = boundary - 1; right = boundary; mix = smooth((atMs - b.startMs + half) / (2 * half)); break }
		}
		return { left, right, mix }
	}
	function poseAt(atMs) {
		const { left, right, mix } = actionBlendAt(atMs)
		return new Map(orderedKeys.map(key => {
			const a = actionSample(plan.actions[left], key, atMs), b = actionSample(plan.actions[right], key, atMs)
			return [key, left === right ? a : key.endsWith(':rotation') ? slerp(a, b, mix) : lerp(a, b, mix)]
		}))
	}
	const poses = times.map(poseAt)
	// A short symmetric quaternion filter removes isolated source spikes while
	// retaining all action/contact timestamps and exact performance endpoints.
	for (const key of orderedKeys.filter(key => key.endsWith(':rotation'))) {
		let rows = poses.map(pose => pose.get(key))
		for (let pass = 0; pass < 2; pass++) rows = rows.map((row, index) => index === 0 || index === rows.length - 1 ? quaternion(row) : slerp(row, slerp(rows[index - 1], rows[index + 1], .5), .45))
		rows.forEach((row, index) => poses[index].set(key, row))
	}
	function transformAt(atMs) {
		let index = plan.transforms.findIndex(key => key.atMs >= atMs)
		if (index <= 0) {
			const key = index < 0 ? plan.transforms.at(-1) : plan.transforms[0]
			return Object.fromEntries(Object.keys(DEFAULT_TRANSFORM).map(field => [field, key[field]]))
		}
		const a = plan.transforms[index - 1], b = plan.transforms[index], t = clamp((atMs - a.atMs) / (b.atMs - a.atMs))
		const eased = b.easing === 'linear' ? t : b.easing === 'easeIn' ? t * t : b.easing === 'easeOut' ? 1 - (1 - t) ** 2 : smooth(t)
		return Object.fromEntries(Object.keys(DEFAULT_TRANSFORM).map(key => [key, a[key] + (b[key] - a[key]) * eased]))
	}
	const tracks = new Map(orderedKeys.map(key => [key, []]))
	const anchor = [asset.staticWorlds[root][12], floorY, asset.staticWorlds[root][14]]
	const actionReports = plan.actions.map(action => ({ ...action, resolvedSourceRange: { startMs: actionSources.get(action.id).sourceStartMs, endMs: actionSources.get(action.id).sourceEndMs }, sourceDurationMs: clips.get(action.motionId).duration * 1000, contactMs: null, contact: null, handSamples: [] }))
	const collectedBounds = [], frameSamples = []; let maxRootReconstructionError = 0, maxGroundError = 0, groundingVerificationSamples = 0, nextReportMs = 0
	for (const [frame, atMs] of times.entries()) {
		const pose = poses[frame], world = asset.worlds(pose), transform = transformAt(atMs)
		const radians = degrees => degrees * Math.PI / 180
		const rotation = (axis, angle) => { const value = [0, 0, 0, Math.cos(radians(angle) / 2)]; value[axis] = Math.sin(radians(angle) / 2); return matrixFromTrs([0, 0, 0], value) }
		const orientation = multiply(multiply(rotation(1, transform.yawDegrees), rotation(0, transform.pitchDegrees)), rotation(2, transform.rollDegrees))
		const aroundAnchor = multiply(multiply(matrixFromTrs(anchor), multiply(orientation, matrixFromTrs([0, 0, 0], [0, 0, 0, 1], [transform.scale, transform.scale, transform.scale]))), matrixFromTrs(anchor.map(value => -value)))
		const sourceSoles = asset.points(world, asset.shoeVertices)
		const soles = sourceSoles.map(point => transformPoint(aroundAnchor, point))
		let contactY = bounds(soles).min[1]
		if (plan.entry?.type === 'drop' && atMs <= plan.actions[0].endMs) contactY = Math.min(contactY, bounds(asset.points(world, asset.boundsVertices).map(point => transformPoint(aroundAnchor, point))).min[1])
		const dropHeight = plan.entry?.type === 'drop' && atMs < plan.entry.durationMs ? plan.entry.height * modelHeight * (1 - (atMs / plan.entry.durationMs) ** 2) : 0
		const { left, right, mix } = actionBlendAt(atMs)
		// A drop entrance owns the first action's touchdown and recovery. Giving
		// its remaining falling-root offsets back to the source-airtime detector
		// at touchdown would lift the actor again on the very next frame. Later
		// actions retain authored jumps, with the same continuous blend weights.
		const sourceCarriesAirtime = index => !(plan.entry?.type === 'drop' && index === 0) && actionSources.get(plan.actions[index].id).hasVerticalRootMotion
		const airborneWeight = left === right ? Number(sourceCarriesAirtime(left)) : (sourceCarriesAirtime(left) ? 1 - mix : 0) + (sourceCarriesAirtime(right) ? mix : 0)
		const entryControlsContact = plan.entry?.type === 'drop' && atMs <= plan.entry.durationMs
		const sourceAirborneHeight = !entryControlsContact ? Math.max(0, bounds(sourceSoles).min[1] - floorY) * transform.scale * airborneWeight : 0
		const lift = transform.height * modelHeight + dropHeight + sourceAirborneHeight
		const stage = multiply(matrixFromTrs([0, floorY + lift - contactY, transform.depth * modelHeight]), aroundAnchor)
		const desired = multiply(stage, world[root]), rootTrs = decompose(multiply(parentInverse, desired))
		const reconstructed = multiply(parentWorld, matrixFromTrs(rootTrs.translation, rootTrs.rotation, rootTrs.scale))
		maxRootReconstructionError = Math.max(maxRootReconstructionError, ...reconstructed.map((value, index) => Math.abs(value - desired[index])))
		if (maxRootReconstructionError > 1e-5) fail('The presenter parent transform introduces unsupported reflection or shear.', 'PRESENTER_PERFORMANCE_RIG_UNSUPPORTED')
		for (const key of orderedKeys) { const [node, path] = key.split(':'); tracks.get(key).push(Number(node) === root ? rootTrs[path] : pose.get(key)) }
		let actionIndex = plan.actions.findIndex(action => atMs < action.endMs); if (actionIndex < 0) actionIndex = plan.actions.length - 1
		const actionReport = actionReports[actionIndex], body = transformPoint(stage, [world[root][12], world[root][13], world[root][14]])
		const sample = { atMs, actionTimeMs: atMs - actionReport.startMs }
		for (const side of ['left', 'right']) {
			const joint = asset.handNodes[side]
			if (joint === undefined) { sample[side] = null; continue }
			const position = transformPoint(stage, [world[joint][12], world[joint][13], world[joint][14]])
			sample[side] = { position, normalizedPosition: { x: (position[0] - anchor[0]) / modelHeight, yAboveFloor: (position[1] - floorY) / modelHeight, z: (position[2] - anchor[2]) / modelHeight } }
			const reach = Math.hypot(position[0] - body[0], position[2] - body[2]) / modelHeight
			const halfBlend = Math.min(plan.blendMs / 2, actionReport.durationMs * .2)
			if (atMs >= actionReport.startMs + halfBlend && atMs <= actionReport.endMs - halfBlend && (actionReport.contact === null || reach > actionReport.contact.reach)) {
				actionReport.contactMs = atMs
				actionReport.contact = { atMs, actionTimeMs: sample.actionTimeMs, hand: side, ...sample[side], reach, method: 'maximum-horizontal-hand-reach', candidate: true }
			}
		}
		// Carry follows the actual composed scene clock, not the sparse bounds
		// report. Include both owners at action boundaries so an explicit drop at
		// the action endpoint has an exact measured sample.
		actionReport.handSamples.push(sample)
		if (actionIndex > 0 && atMs === actionReport.startMs) actionReports[actionIndex - 1].handSamples.push({ ...sample, actionTimeMs: actionReports[actionIndex - 1].durationMs })
		const reportFrame = atMs >= nextReportMs - .0001 || atMs === plan.durationMs || atMs === actionReport.startMs || atMs === plan.entry?.durationMs
		if (reportFrame) {
			const posedBounds = bounds(asset.points(world, asset.boundsVertices).map(point => transformPoint(stage, point)))
			// Verify grounding through the actual composed skin hierarchy, including
			// float storage precision, rather than reusing the correction arithmetic.
			const verifiedPose = new Map(orderedKeys.map(key => {
				const [node, path] = key.split(':')
				return [key, (Number(node) === root ? rootTrs[path] : pose.get(key)).map(Math.fround)]
			}))
			const verifiedWorld = asset.worlds(verifiedPose)
			let verifiedContact = bounds(asset.points(verifiedWorld, asset.shoeVertices)).min[1]
			if (plan.entry?.type === 'drop' && atMs <= plan.actions[0].endMs) verifiedContact = Math.min(verifiedContact, bounds(asset.points(verifiedWorld, asset.boundsVertices)).min[1])
			maxGroundError = Math.max(maxGroundError, Math.abs(verifiedContact - floorY - lift))
			groundingVerificationSamples++
			collectedBounds.push(posedBounds.min, posedBounds.max)
			frameSamples.push({ atMs, ...transform, dropHeight: dropHeight / modelHeight, sourceAirborneHeight: sourceAirborneHeight / modelHeight, groundedHeight: lift / modelHeight, bounds: posedBounds })
			nextReportMs = atMs + 100
		}
	}
	for (const action of actionReports) if (!action.contact && action.handSamples.length) {
		const sample = action.handSamples[0], hand = sample.right ? 'right' : sample.left ? 'left' : null
		if (hand) { action.contactMs = sample.atMs; action.contact = { atMs: sample.atMs, actionTimeMs: sample.actionTimeMs, hand, ...sample[hand], method: 'first-measurable-hand', candidate: true } }
	}
	const resultJson = structuredClone(json), binaryParts = [bin]; let byteLength = bin.length
	function append(rows, type) {
		const width = COMPONENTS[type], buffer = Buffer.alloc(rows.length * width * 4)
		rows.forEach((row, rowIndex) => vector(row, width, 'Composed motion sample').forEach((value, column) => {
			if (!Number.isFinite(Math.fround(value))) fail('Composed animation exceeds the numeric storage range.', 'PRESENTER_PERFORMANCE_ASSET_INVALID')
			buffer.writeFloatLE(value, (rowIndex * width + column) * 4)
		}))
		if (byteLength % 4) { const padding = Buffer.alloc(4 - byteLength % 4); binaryParts.push(padding); byteLength += padding.length }
		const bufferView = resultJson.bufferViews.length
		resultJson.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: buffer.length }); binaryParts.push(buffer); byteLength += buffer.length
		const index = resultJson.accessors.length
		resultJson.accessors.push({ bufferView, componentType: 5126, count: rows.length, type, ...(type === 'SCALAR' ? { min: [rows[0][0]], max: [rows.at(-1)[0]] } : {}) })
		return index
	}
	const input = append(times.map(time => [time / 1000]), 'SCALAR'), animation = { name: 'Continuous presenter performance', channels: [], samplers: [] }
	for (const [key, rows] of tracks) {
		const [node, path] = key.split(':'), output = append(rows, path === 'rotation' ? 'VEC4' : 'VEC3'), sampler = animation.samplers.length
		animation.samplers.push({ input, output, interpolation: 'LINEAR' }); animation.channels.push({ sampler, target: { node: Number(node), path } })
	}
	resultJson.animations = [animation]
	resultJson.buffers[0].byteLength = byteLength
	const report = {
		schemaVersion: 'betterpptx.presenter-performance-composition.v1', status: 'composed', durationMs: plan.durationMs, fps, frameCount: times.length, animationCount: 1,
		transformCarrier: 'skeletal-root-joint', basePosePreserved: true, modelHeight, floorY, stageAnchor: anchor, staticBounds: asset.staticBounds, animatedBounds: { ...bounds(collectedBounds), sampled: true },
		entry: plan.entry, exit: plan.exit, entryContactMs: plan.entry?.type === 'drop' ? plan.entry.durationMs : null, blendMs: plan.blendMs,
		timebase: 'performance-local-milliseconds', distanceUnits: 'model-world-units; normalized positions and authored distances use standing-height multiples',
		actions: actionReports, transformSamples: frameSamples, verification: { maxRootReconstructionError, maxGroundError, groundingVerificationSamples },
	}
	return { glbBytes: serializeGlb(resultJson, Buffer.concat(binaryParts)), durationMs: plan.durationMs, report }
}

export default composePresenterPerformance
