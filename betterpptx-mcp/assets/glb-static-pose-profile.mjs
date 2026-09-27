// Seed a rigged GLB's static/edit-view node transforms from an authored
// animation frame. PowerPoint renders the native model branch from these base
// transforms before playScene starts; its am3d raster is only a fallback/anchor.
//
// This edits only the GLB JSON node TRS values. The BIN chunk (including mesh,
// skin inverse-bind matrices, textures, and every animation accessor) remains
// byte-for-byte unchanged, so native animation playback is unaffected.

import { parseGlb, serializeGlb } from '../ir/kinetic-transplant.mjs'

const COMPONENT_BYTES = Object.freeze({ 5126: 4 })
const TYPE_COMPONENTS = Object.freeze({ SCALAR: 1, VEC3: 3, VEC4: 4 })
const POWERPOINT_MINIMUM_ARM_DROP_RATIO = 0.35

function mat4Mul(a, b) {
	const out = new Array(16)
	for (let column = 0; column < 4; column++) {
		for (let row = 0; row < 4; row++) {
			out[column * 4 + row] =
				a[0 * 4 + row] * b[column * 4 + 0] +
				a[1 * 4 + row] * b[column * 4 + 1] +
				a[2 * 4 + row] * b[column * 4 + 2] +
				a[3 * 4 + row] * b[column * 4 + 3]
		}
	}
	return out
}

function trsToMat4(translation, rotation, scale) {
	const [x, y, z, w] = rotation
	const [sx, sy, sz] = scale
	const r00 = 1 - 2 * (y * y + z * z)
	const r01 = 2 * (x * y - z * w)
	const r02 = 2 * (x * z + y * w)
	const r10 = 2 * (x * y + z * w)
	const r11 = 1 - 2 * (x * x + z * z)
	const r12 = 2 * (y * z - x * w)
	const r20 = 2 * (x * z - y * w)
	const r21 = 2 * (y * z + x * w)
	const r22 = 1 - 2 * (x * x + y * y)
	return [
		r00 * sx, r10 * sx, r20 * sx, 0,
		r01 * sy, r11 * sy, r21 * sy, 0,
		r02 * sz, r12 * sz, r22 * sz, 0,
		translation[0], translation[1], translation[2], 1,
	]
}

function worldMatrices(nodes) {
	const parents = new Array(nodes.length).fill(-1)
	for (const [index, node] of nodes.entries()) {
		for (const child of node.children || []) parents[child] = index
	}
	const locals = nodes.map(node => node.matrix
		? node.matrix.slice(0, 16)
		: trsToMat4(node.translation || [0, 0, 0], node.rotation || [0, 0, 0, 1], node.scale || [1, 1, 1]))
	const worlds = new Array(nodes.length).fill(null)
	const resolve = (index, guard = 0) => {
		if (worlds[index]) return worlds[index]
		if (guard > nodes.length) throw new Error('static-pose-profile: node parent cycle detected')
		worlds[index] = parents[index] < 0 ? locals[index] : mat4Mul(resolve(parents[index], guard + 1), locals[index])
		return worlds[index]
	}
	for (let index = 0; index < nodes.length; index++) resolve(index)
	return worlds
}

/**
 * Measure the resting arm drop PowerPoint can reveal before playScene begins.
 * A T-pose has the hands at roughly shoulder height; a presentation-safe
 * neutral pose has both hands materially below the shoulders.
 */
export function measurePowerPointStaticPose(buffer) {
	const { json } = parseGlb(buffer)
	const nodes = json.nodes || []
	const worlds = worldMatrices(nodes)
	const byName = new Map(nodes.map((node, index) => [node.name, index]))
	const y = name => {
		const index = byName.get(name)
		if (index == null) throw new Error(`static-pose-profile: required node ${JSON.stringify(name)} is missing`)
		return Number(worlds[index][13])
	}
	const shoulderY = {
		left: y('mixamorig:LeftShoulder'),
		right: y('mixamorig:RightShoulder'),
	}
	const hipsY = y('mixamorig:Hips')
	const torsoHeight = ((shoulderY.left + shoulderY.right) / 2) - hipsY
	if (!Number.isFinite(torsoHeight) || torsoHeight <= 1e-8) {
		throw new Error(`static-pose-profile: invalid shoulder-to-hips torso height ${torsoHeight}`)
	}
	const armDrop = {
		left: shoulderY.left - y('mixamorig:LeftHand'),
		right: shoulderY.right - y('mixamorig:RightHand'),
	}
	const armDropRatio = {
		left: armDrop.left / torsoHeight,
		right: armDrop.right / torsoHeight,
	}
	return {
		armDrop,
		armDropRatio,
		torsoHeight,
		minimumArmDrop: Math.min(armDrop.left, armDrop.right),
		minimumArmDropRatio: Math.min(armDropRatio.left, armDropRatio.right),
	}
}

/** Fail closed before a humanoid presenter bundle is allowed into PowerPoint. */
export function assertPowerPointSafeStaticPose(buffer, { minimumArmDropRatio = POWERPOINT_MINIMUM_ARM_DROP_RATIO, label = 'presenter' } = {}) {
	const measured = measurePowerPointStaticPose(buffer)
	if (measured.armDropRatio.left <= minimumArmDropRatio || measured.armDropRatio.right <= minimumArmDropRatio) {
		const error = new Error(`${label} exposes a forbidden T-pose/rest pose in PowerPoint: ${JSON.stringify(measured.armDropRatio)}`)
		error.code = 'POWERPOINT_TPOSE_FORBIDDEN'
		error.details = { ...measured, requiredMinimumArmDropRatio: minimumArmDropRatio }
		throw error
	}
	return { ...measured, requiredMinimumArmDropRatio: minimumArmDropRatio }
}

function readFloatAccessor(json, bin, accessorIndex) {
	const accessor = json.accessors?.[accessorIndex]
	if (!accessor) throw new Error(`static-pose-profile: accessor ${accessorIndex} is missing`)
	if (accessor.sparse) throw new Error('static-pose-profile: sparse animation accessors are unsupported')
	if (accessor.componentType !== 5126) throw new Error(`static-pose-profile: accessor ${accessorIndex} must use FLOAT components`)
	const bufferView = json.bufferViews?.[accessor.bufferView]
	if (!bufferView) throw new Error(`static-pose-profile: bufferView for accessor ${accessorIndex} is missing`)
	if (Number(bufferView.buffer || 0) !== 0) throw new Error('static-pose-profile: animation accessor must use the embedded GLB buffer')
	const componentCount = TYPE_COMPONENTS[accessor.type]
	if (!componentCount) throw new Error(`static-pose-profile: accessor ${accessorIndex} has unsupported type ${accessor.type}`)
	const componentBytes = COMPONENT_BYTES[accessor.componentType]
	const stride = Number(bufferView.byteStride || componentCount * componentBytes)
	const base = Number(bufferView.byteOffset || 0) + Number(accessor.byteOffset || 0)
	const rows = []
	for (let row = 0; row < Number(accessor.count || 0); row++) {
		const values = []
		for (let component = 0; component < componentCount; component++) {
			values.push(bin.readFloatLE(base + row * stride + component * componentBytes))
		}
		rows.push(values)
	}
	return rows
}

function earliestKeyIndex(times) {
	if (!times.length) throw new Error('static-pose-profile: animation sampler has no keyframes')
	let index = 0
	for (let candidate = 1; candidate < times.length; candidate++) {
		if (Number(times[candidate][0]) < Number(times[index][0])) index = candidate
	}
	return index
}

function sampledValue(values, keyIndex, interpolation) {
	// CUBICSPLINE output rows are [in-tangent, value, out-tangent] per key.
	const row = interpolation === 'CUBICSPLINE' ? keyIndex * 3 + 1 : keyIndex
	if (!values[row]) throw new Error(`static-pose-profile: animation output is missing keyframe row ${row}`)
	return values[row].map(Number)
}

/**
 * Copy the earliest sampled TRS values from `clipName` into the targeted nodes'
 * base transforms. The returned buffer remains a standard rigged GLB with the
 * same embedded binary payload and animation channel data.
 */
function poseProfile(buffer, clipName) {
	const { json, bin } = parseGlb(buffer)
	const clipIndex = (json.animations || []).findIndex(animation => animation?.name === clipName)
	if (clipIndex < 0) throw new Error(`static-pose-profile: clip ${JSON.stringify(clipName)} is missing`)
	const clip = json.animations[clipIndex]
	const entries = []
	let sampleTimeSeconds = null

	for (const channel of clip.channels || []) {
		const path = channel?.target?.path
		if (!['translation', 'rotation', 'scale'].includes(path)) continue
		const node = json.nodes?.[channel.target.node]
		if (!node) throw new Error(`static-pose-profile: target node ${channel.target.node} is missing`)
		if (!node.name) throw new Error(`static-pose-profile: target node ${channel.target.node} needs a stable name`)
		const sampler = clip.samplers?.[channel.sampler]
		if (!sampler) throw new Error(`static-pose-profile: sampler ${channel.sampler} is missing`)
		if (json.accessors?.[sampler.input]?.type !== 'SCALAR') throw new Error('static-pose-profile: animation time input must be SCALAR')
		const times = readFloatAccessor(json, bin, sampler.input)
		const keyIndex = earliestKeyIndex(times)
		const values = readFloatAccessor(json, bin, sampler.output)
		const value = sampledValue(values, keyIndex, String(sampler.interpolation || 'LINEAR').toUpperCase())
		const expectedComponents = path === 'rotation' ? 4 : 3
		if (value.length !== expectedComponents) throw new Error(`static-pose-profile: ${path} output must have ${expectedComponents} components`)
		const time = Number(times[keyIndex][0])
		if (sampleTimeSeconds != null && Math.abs(sampleTimeSeconds - time) > 1e-6) {
			throw new Error(`static-pose-profile: clip channels do not share one earliest pose time (${sampleTimeSeconds} vs ${time})`)
		}
		sampleTimeSeconds = time
		entries.push({ nodeName: node.name, path, value })
	}

	if (!entries.length) throw new Error(`static-pose-profile: clip ${JSON.stringify(clipName)} has no node TRS channels`)
	return { clipName, clipIndex, sampleTimeMs: Math.round(Number(sampleTimeSeconds || 0) * 1000), entries }
}

/**
 * Expose the sampled presentation-safe pose as a name-keyed private profile so
 * motion transplant can blend every clip from and back to the exact GLB base
 * pose PowerPoint shows while a scene is stopped.
 */
export function extractStaticPoseProfile(sourceBuffer, { clipName = '00_idle' } = {}) {
	const profile = poseProfile(sourceBuffer, clipName)
	const nodes = {}
	for (const entry of profile.entries) {
		if (!nodes[entry.nodeName]) nodes[entry.nodeName] = {}
		nodes[entry.nodeName][entry.path] = [...entry.value]
	}
	return {
		schemaVersion: 'betterpptx.static-pose-profile.v1',
		clipName: profile.clipName,
		clipIndex: profile.clipIndex,
		sampleTimeMs: profile.sampleTimeMs,
		nodes,
	}
}

/**
 * Apply a pose sampled from `sourceBuffer` to a compatible target rig. This is
 * intentionally a post-bake operation: motion retargeting must see the target's
 * true bind/rest transforms, then the final display GLB receives the static pose.
 */
export function applyStaticPoseFromSource(targetBuffer, sourceBuffer, { clipName = '00_idle' } = {}) {
	const profile = poseProfile(sourceBuffer, clipName)
	const { json, bin } = parseGlb(targetBuffer)
	const nodesByName = new Map()
	for (const node of json.nodes || []) {
		if (!node?.name) continue
		if (nodesByName.has(node.name)) throw new Error(`static-pose-profile: duplicate target node name ${JSON.stringify(node.name)}`)
		nodesByName.set(node.name, node)
	}
	for (const entry of profile.entries) {
		const node = nodesByName.get(entry.nodeName)
		if (!node) throw new Error(`static-pose-profile: target rig is missing node ${JSON.stringify(entry.nodeName)}`)
		if (node.matrix) throw new Error(`static-pose-profile: target node ${JSON.stringify(entry.nodeName)} uses matrix instead of TRS`)
		node[entry.path] = [...entry.value]
	}
	const buffer = serializeGlb(json, bin)
	return {
		buffer,
		clipName: profile.clipName,
		clipIndex: profile.clipIndex,
		sampleTimeMs: profile.sampleTimeMs,
		changedNodeChannels: profile.entries.length,
		powerPointStaticPose: assertPowerPointSafeStaticPose(buffer),
	}
}

export function applyStaticPoseProfile(buffer, options = {}) {
	return applyStaticPoseFromSource(buffer, buffer, options)
}
