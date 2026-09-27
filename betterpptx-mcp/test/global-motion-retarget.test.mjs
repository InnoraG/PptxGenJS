import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { applyStaticPoseFromSource, assertPowerPointSafeStaticPose, extractStaticPoseProfile } from '../assets/glb-static-pose-profile.mjs'
import { parseGlb, serializeGlb, transplantMotionSet } from '../ir/kinetic-transplant.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.dirname(here)
const interactionLibrary = fs.readFileSync(path.join(root, 'assets', 'authoring-interaction-clips-v3-proven.glb'))
const interactionClipNames = parseGlb(interactionLibrary).json.animations.map(animation => animation.name)
const kineticLibrary = fs.readFileSync(path.join(root, 'assets', 'kinetic-clips.glb'))
const kineticClipNames = parseGlb(kineticLibrary).json.animations.slice(0, 18).map(animation => animation.name)

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }
const readAccessor = (json, bin, accessorIndex) => {
	const accessor = json.accessors[accessorIndex]
	const view = json.bufferViews[accessor.bufferView]
	assert.equal(accessor.componentType, 5126)
	const components = COMPONENTS[accessor.type]
	const start = (view.byteOffset || 0) + (accessor.byteOffset || 0)
	const stride = view.byteStride || components * 4
	return Array.from({ length: accessor.count }, (_, row) => {
		const values = Array.from({ length: components }, (_, component) => bin.readFloatLE(start + row * stride + component * 4))
		return components === 1 ? values[0] : values
	})
}

const quatMul = (a, b) => [
	a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
	a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
	a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
	a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
]
const quatConj = q => [-q[0], -q[1], -q[2], q[3]]
const quatNorm = q => {
	const length = Math.hypot(...q) || 1
	return q.map(value => value / length)
}
const quatSlerp = (a, b, amount) => {
	let end = b
	let dot = a.reduce((sum, value, axis) => sum + value * b[axis], 0)
	if (dot < 0) { end = b.map(value => -value); dot = -dot }
	if (dot > 0.9995) return quatNorm(a.map((value, axis) => value + amount * (end[axis] - value)))
	const theta = Math.acos(Math.max(-1, Math.min(1, dot)))
	const left = Math.sin((1 - amount) * theta) / Math.sin(theta)
	const right = Math.sin(amount * theta) / Math.sin(theta)
	return quatNorm(a.map((value, axis) => value * left + end[axis] * right))
}
const sample = (times, values, time) => {
	if (time <= times[0]) return quatNorm(values[0])
	if (time >= times.at(-1)) return quatNorm(values.at(-1))
	let low = 0
	let high = times.length - 1
	while (high - low > 1) {
		const mid = Math.floor((low + high) / 2)
		if (times[mid] <= time) low = mid
		else high = mid
	}
	const amount = (time - times[low]) / (times[high] - times[low] || 1)
	return quatSlerp(quatNorm(values[low]), quatNorm(values[high]), amount)
}
const parents = nodes => {
	const result = Array(nodes.length).fill(-1)
	nodes.forEach((node, parent) => (node.children || []).forEach(child => { result[child] = parent }))
	return result
}
const order = parentIndexes => {
	const depth = index => parentIndexes[index] < 0 ? 0 : 1 + depth(parentIndexes[index])
	return parentIndexes.map((_, index) => index).sort((left, right) => depth(left) - depth(right) || left - right)
}
const globalRest = json => {
	const parentIndexes = parents(json.nodes)
	const result = Array(json.nodes.length)
	for (const index of order(parentIndexes)) {
		const local = quatNorm(json.nodes[index].rotation || [0, 0, 0, 1])
		result[index] = parentIndexes[index] < 0 ? local : quatNorm(quatMul(result[parentIndexes[index]], local))
	}
	return { values: result, parentIndexes, order: order(parentIndexes) }
}
const animationData = (json, bin, animation) => {
	const channels = new Map()
	const times = new Set()
	for (const channel of animation.channels) {
		if (channel.target.path !== 'rotation') continue
		const sampler = animation.samplers[channel.sampler]
		const input = readAccessor(json, bin, sampler.input)
		const output = readAccessor(json, bin, sampler.output)
		input.forEach(time => times.add(time))
		channels.set(channel.target.node, { input, output })
	}
	return { channels, times: [...times].sort((a, b) => a - b) }
}
const globalPose = (json, rest, data, time) => {
	const result = Array(json.nodes.length)
	for (const index of rest.order) {
		const channel = data.channels.get(index)
		const local = channel ? sample(channel.input, channel.output, time) : quatNorm(json.nodes[index].rotation || [0, 0, 0, 1])
		result[index] = rest.parentIndexes[index] < 0 ? local : quatNorm(quatMul(result[rest.parentIndexes[index]], local))
	}
	return result
}

const quatDegrees = (a, b) => {
	const left = quatNorm(a)
	const right = quatNorm(b)
	const dot = Math.min(1, Math.abs(left.reduce((sum, value, axis) => sum + value * right[axis], 0)))
	return 2 * Math.acos(dot) * 180 / Math.PI
}

test('global retarget resolves the interaction library 180-degree bone-roll mismatch for every presenter', () => {
	const libraryJson = parseGlb(interactionLibrary).json
	const libraryNodes = Object.fromEntries(libraryJson.nodes.filter(node => node.name).map(node => [node.name, node]))
	for (const identity of ['joe', 'louise', 'pete']) {
		const construction = fs.readFileSync(path.join(root, 'assets', `presenter-source-${identity}-static.glb`))
		const display = fs.readFileSync(path.join(root, 'assets', `default-presenter-${identity}.glb`))
		const targetNodes = Object.fromEntries(parseGlb(construction).json.nodes.filter(node => node.name).map(node => [node.name, node]))
		for (const bone of ['mixamorig:LeftShoulder', 'mixamorig:RightShoulder', 'mixamorig:LeftUpLeg', 'mixamorig:RightUpLeg']) {
			const sourceRotation = libraryNodes[bone]?.rotation || [0, 0, 0, 1]
			const targetRotation = targetNodes[bone]?.rotation || [0, 0, 0, 1]
			assert.ok(quatDegrees(sourceRotation, targetRotation) > 170, `${identity}/${bone} must exercise the near-180-degree basis mismatch`)
		}
		const built = transplantMotionSet(construction, interactionClipNames.map(clipName => ({
			motionId: clipName,
			sourceSlug: clipName,
			outputSlug: clipName.replace(/^\d{2}_/, ''),
			library: interactionLibrary,
			libraryKey: 'interaction',
		})), { rotationRetargetSpace: 'global' })
		assert.equal(built.retargetValidation.length, 18)
		assert.ok(built.retargetValidation.every(row => row.status === 'PASS' && row.maxParityErrorDegrees <= 0.01))
		const posed = applyStaticPoseFromSource(built.glb, display, { clipName: '00_idle' }).buffer
		assert.ok(assertPowerPointSafeStaticPose(posed, { label: `${identity} global retarget` }).minimumArmDropRatio > 0.35)
	}
})

test('serialized kinetic outputs preserve source bone-frame motion at every keyed time', () => {
	const source = parseGlb(kineticLibrary)
	const sourceRest = globalRest(source.json)
	const sourceByName = new Map(source.json.nodes.map((node, index) => [node.name, index]).filter(([name]) => name))
	for (const identity of ['joe', 'louise', 'pete']) {
		const construction = fs.readFileSync(path.join(root, 'assets', `presenter-source-${identity}-static.glb`))
		const built = transplantMotionSet(construction, kineticClipNames.map(clipName => ({
			motionId: clipName,
			sourceSlug: clipName,
			outputSlug: clipName.replace(/^\d{2}_/, ''),
			library: kineticLibrary,
		})), { rotationRetargetSpace: 'global' })
		const target = parseGlb(built.glb)
		const targetRest = globalRest(target.json)
		for (const animation of target.json.animations) {
			for (const channel of animation.channels) {
				if (channel.target.path !== 'rotation') continue
				const values = readAccessor(target.json, target.bin, animation.samplers[channel.sampler].output)
				for (let key = 1; key < values.length; key++) {
					const dot = values[key - 1].reduce((sum, value, axis) => sum + value * values[key][axis], 0)
					assert.ok(dot >= -1e-6, `${identity}/${animation.name} contains an antipodal quaternion edge at key ${key}`)
				}
			}
		}
		for (let animationIndex = 0; animationIndex < kineticClipNames.length; animationIndex++) {
			const sourceAnimation = source.json.animations[animationIndex]
			const targetAnimation = target.json.animations[animationIndex]
			const sourceData = animationData(source.json, source.bin, sourceAnimation)
			const targetData = animationData(target.json, target.bin, targetAnimation)
			for (const time of sourceData.times) {
				const sourcePose = globalPose(source.json, sourceRest, sourceData, time)
				const targetPose = globalPose(target.json, targetRest, targetData, time)
				for (const [targetIndex, node] of target.json.nodes.entries()) {
					if (!node.name || !sourceByName.has(node.name)) continue
					const sourceIndex = sourceByName.get(node.name)
					const sourceRelative = quatNorm(quatMul(quatConj(sourceRest.values[sourceIndex]), sourcePose[sourceIndex]))
					const targetRelative = quatNorm(quatMul(quatConj(targetRest.values[targetIndex]), targetPose[targetIndex]))
					assert.ok(quatDegrees(sourceRelative, targetRelative) <= 0.01,
						`${identity}/${sourceAnimation.name}/${node.name}@${time}s lost bone-frame parity`)
				}
			}
		}
	}
})

test('kinetic boundary blending starts and ends at the exact PowerPoint static pose without shortening source motion', () => {
	const construction = fs.readFileSync(path.join(root, 'assets', 'presenter-source-joe-static.glb'))
	const display = fs.readFileSync(path.join(root, 'assets', 'default-presenter-joe.glb'))
	const boundaryProfile = extractStaticPoseProfile(display, { clipName: '00_idle' })
	const source = parseGlb(kineticLibrary)
	const sourceAnimation = source.json.animations.find(animation => animation.name === '07_heavy_jump')
	assert.ok(sourceAnimation)
	const sourceData = animationData(source.json, source.bin, sourceAnimation)
	const sourceEnd = sourceData.times.at(-1)
	const built = transplantMotionSet(construction, [{
		motionId: 'heavy_jump',
		sourceSlug: '07_heavy_jump',
		outputSlug: 'heavy_jump',
		library: kineticLibrary,
	}], {
		rotationRetargetSpace: 'global',
		animationBoundaryPoseProfile: boundaryProfile,
		animationBoundaryBlendMs: 500,
	})
	const target = parseGlb(built.glb)
	const animation = target.json.animations[0]
	let checkedChannels = 0
	for (const channel of animation.channels) {
		if (channel.target.path !== 'rotation') continue
		const nodeName = target.json.nodes[channel.target.node]?.name
		const expected = boundaryProfile.nodes[nodeName]?.rotation
		assert.ok(expected, `boundary profile must include ${nodeName}`)
		const sampler = animation.samplers[channel.sampler]
		const times = readAccessor(target.json, target.bin, sampler.input)
		const values = readAccessor(target.json, target.bin, sampler.output)
		assert.equal(times[0], 0)
		assert.ok(Math.abs(times[1] - (sourceData.times[0] + 0.5)) <= 1e-5)
		assert.ok(Math.abs(times.at(-1) - (sourceEnd + 1)) <= 1e-5)
		assert.ok(quatDegrees(values[0], expected) <= 0.01, `${nodeName} does not start at the static pose`)
		assert.ok(quatDegrees(values.at(-1), expected) <= 0.01, `${nodeName} does not end at the static pose`)
		for (let key = 1; key < values.length; key++) {
			const dot = values[key - 1].reduce((sum, value, axis) => sum + value * values[key][axis], 0)
			assert.ok(dot >= -1e-6, `${nodeName} contains an antipodal boundary edge at key ${key}`)
		}
		checkedChannels += 1
	}
	assert.ok(checkedChannels > 0)
	assert.equal(built.retargetValidation[0].boundaryBlendMs, 500)
	assert.equal(built.retargetValidation[0].sampledTimes, built.retargetValidation[0].sourceSampledTimes + 2)
})

test('root motion can be anchored to the first source key and bounded for a PowerPoint viewport', () => {
	const construction = fs.readFileSync(path.join(root, 'assets', 'presenter-source-joe-static.glb'))
	const source = parseGlb(kineticLibrary)
	const sourceAnimation = source.json.animations.find(animation => animation.name === '04_dive_roll')
	assert.ok(sourceAnimation)
	const sourceHipsIndex = source.json.nodes.findIndex(node => node.name === 'mixamorig:Hips')
	const sourceTranslation = sourceAnimation.channels.find(item => item.target.node === sourceHipsIndex && item.target.path === 'translation')
	assert.ok(sourceTranslation)
	const sourceOutput = source.json.accessors[sourceAnimation.samplers[sourceTranslation.sampler].output]
	assert.ok(sourceOutput.count > 1)
	const sourceView = source.json.bufferViews[sourceOutput.bufferView]
	const sourceStride = sourceView.byteStride || 12
	const sourceStart = (sourceView.byteOffset || 0) + (sourceOutput.byteOffset || 0)
	const syntheticBin = Buffer.from(source.bin)
	syntheticBin.writeFloatLE(syntheticBin.readFloatLE(sourceStart) + 100, sourceStart + sourceStride)
	const syntheticLibrary = serializeGlb(source.json, syntheticBin)
	const built = transplantMotionSet(construction, [{
		motionId: 'dive_roll',
		sourceSlug: '04_dive_roll',
		outputSlug: 'dive_roll',
		library: syntheticLibrary,
		channelPolicy: 'root-motion',
		rootMotionAnchor: 'start',
		rootMotionMaxStatures: 0.0001,
	}], { rotationRetargetSpace: 'global' })
	const target = parseGlb(built.glb)
	const hipsIndex = target.json.nodes.findIndex(node => node.name === 'mixamorig:Hips')
	const animation = target.json.animations[0]
	const channel = animation.channels.find(item => item.target.node === hipsIndex && item.target.path === 'translation')
	assert.ok(channel)
	const values = readAccessor(target.json, target.bin, animation.samplers[channel.sampler].output)
	const rest = target.json.nodes[hipsIndex].translation || [0, 0, 0]
	values[0].forEach((value, axis) => assert.ok(Math.abs(value - rest[axis]) <= 1e-5))
	assert.ok(Math.max(...values.map(value => Math.hypot(...value.map((number, axis) => number - rest[axis])))) < 0.01)
	assert.equal(built.report[0].rootMotionAnchor, 'start')
	assert.ok(built.report[0].rootMotionDisplacementScale < 1)
})

test('presenter-critical kinetic source curves contain no whole-rig frame spikes', () => {
	const limits = new Map([
		[7, { name: '07_heavy_jump', maximumDegrees: 35, maximumEdgesOver30: 0 }],
		[8, { name: '08_freefall', maximumDegrees: 10, maximumEdgesOver30: 0 }],
		[12, { name: '12_heavy_push', maximumDegrees: 110, maximumEdgesOver30: 2 }],
	])
	const source = parseGlb(kineticLibrary)
	for (const [animationIndex, limit] of limits) {
		const animation = source.json.animations[animationIndex]
		assert.equal(animation.name, limit.name)
		let maximumDegrees = 0
		let edgesOver30 = 0
		for (const channel of animation.channels) {
			if (channel.target.path !== 'rotation') continue
			const values = readAccessor(source.json, source.bin, animation.samplers[channel.sampler].output)
			for (let key = 1; key < values.length; key++) {
				const dot = Math.min(1, Math.abs(values[key - 1].reduce((sum, value, axis) => sum + value * values[key][axis], 0)))
				const degrees = 2 * Math.acos(dot) * 180 / Math.PI
				maximumDegrees = Math.max(maximumDegrees, degrees)
				if (degrees > 30) edgesOver30 += 1
			}
		}
		assert.ok(maximumDegrees <= limit.maximumDegrees,
			`${animation.name} has a ${maximumDegrees.toFixed(2)}° adjacent-key spike`)
		assert.ok(edgesOver30 <= limit.maximumEdgesOver30,
			`${animation.name} has ${edgesOver30} adjacent-key spikes over 30°`)
	}
})

test('global retarget rejects unknown rotation spaces', () => {
	const base = fs.readFileSync(path.join(root, 'assets', 'presenter-source-joe-static.glb'))
	assert.throws(() => transplantMotionSet(base, [{
		motionId: 'press', sourceSlug: '08_press_tap', outputSlug: 'press', library: interactionLibrary,
	}], { rotationRetargetSpace: 'worldish' }), error => error?.code === 'MOTION_ROTATION_RETARGET_SPACE_INVALID')
})
