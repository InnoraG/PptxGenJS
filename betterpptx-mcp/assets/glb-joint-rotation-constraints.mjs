// Keep generated presenter shoulder, arm, wrist, and forearm rotations inside a
// soft anatomical envelope without changing animation timing, channels, or
// target joints.
//
// This is intentionally a soft constraint: normal motion below the knee is
// preserved exactly, while increasingly extreme rotations approach a safe
// maximum. Forearms additionally constrain axial twist around the bone itself;
// concentrating that twist at a Mixamo elbow produces a visible corkscrew crease
// because these rigs do not have separate forearm twist-helper bones. If a
// generated hand track begins with an obvious orientation spike, the opening
// 300 ms eases from the model's neutral local wrist rotation. When a parent arm
// or forearm is corrected, the hand is counter-rotated in parent-world space so
// the authored palm and finger direction do not turn inside-out.

import { parseGlb, serializeGlb } from '../ir/kinetic-transplant.mjs'

const FLOAT = 5126
const KIMODO_TWIST_CORRECTION_ANIMATIONS = Object.freeze([
	'00_talk', '01_enumerate', '02_clap', '00_emphasize',
	'01_talk', '04_emphasize', '07_enumerate', '17_clap',
])
const DEFAULT_CONSTRAINTS = Object.freeze({
	'mixamorig:LeftHand': Object.freeze({ initialSpikeDegrees: 90, startBlendMs: 300, compensateParentWorldRotation: true }),
	'mixamorig:RightHand': Object.freeze({ initialSpikeDegrees: 90, startBlendMs: 300, compensateParentWorldRotation: true }),
	'mixamorig:LeftShoulder': Object.freeze({ twistKneeDegrees: 12, twistMaxDegrees: 25, twistAnimationNames: KIMODO_TWIST_CORRECTION_ANIMATIONS, twistChildSuffix: 'LeftArm' }),
	'mixamorig:RightArm': Object.freeze({ twistKneeDegrees: 120, twistMaxDegrees: 145, twistAnimationNames: Object.freeze(['01_enumerate', '07_enumerate']), twistChildSuffix: 'RightForeArm' }),
	'mixamorig:LeftForeArm': Object.freeze({ kneeDegrees: 100, maxDegrees: 130, twistKneeDegrees: 10, twistMaxDegrees: 20, twistAnimationNames: KIMODO_TWIST_CORRECTION_ANIMATIONS, twistChildSuffix: 'LeftHand' }),
	'mixamorig:RightForeArm': Object.freeze({ kneeDegrees: 100, maxDegrees: 130, twistKneeDegrees: 10, twistMaxDegrees: 20, twistAnimationNames: KIMODO_TWIST_CORRECTION_ANIMATIONS, twistChildSuffix: 'RightHand' }),
})

const clamp = (value, low, high) => Math.max(low, Math.min(high, value))
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0)
const magnitude = value => Math.hypot(...value)
const toDegrees = radians => radians * 180 / Math.PI
const toRadians = degrees => degrees * Math.PI / 180

function normalize(quaternion) {
	const length = magnitude(quaternion)
	if (!Number.isFinite(length) || length < 1e-12) throw new Error('joint-rotation-constraints: invalid zero-length quaternion')
	return quaternion.map(value => value / length)
}

function alignTo(reference, quaternion) {
	const normalized = normalize(quaternion)
	return dot(reference, normalized) < 0 ? normalized.map(value => -value) : normalized
}

function conjugate(quaternion) {
	return [-quaternion[0], -quaternion[1], -quaternion[2], quaternion[3]]
}

function inverse(quaternion) {
	return conjugate(normalize(quaternion))
}

function multiply(a, b) {
	return [
		a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
		a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
		a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
		a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
	]
}

function angularDistanceDegrees(a, b) {
	const qa = normalize(a)
	const qb = normalize(b)
	return toDegrees(2 * Math.acos(clamp(Math.abs(dot(qa, qb)), -1, 1)))
}

function slerp(a, b, fraction) {
	const qa = normalize(a)
	const qb = alignTo(qa, b)
	const cosine = clamp(dot(qa, qb), -1, 1)
	if (cosine > 0.9995) return normalize(qa.map((value, index) => value + fraction * (qb[index] - value)))
	const angle = Math.acos(cosine)
	const denominator = Math.sin(angle)
	const aWeight = Math.sin((1 - fraction) * angle) / denominator
	const bWeight = Math.sin(fraction * angle) / denominator
	return normalize(qa.map((value, index) => aWeight * value + bWeight * qb[index]))
}

function smoothstep01(value) {
	const x = clamp(value, 0, 1)
	return x * x * (3 - 2 * x)
}

function compressedAngleDegrees(angleDegrees, { kneeDegrees, maxDegrees }) {
	if (angleDegrees <= kneeDegrees) return angleDegrees
	const range = maxDegrees - kneeDegrees
	if (!(range > 0)) throw new Error('joint-rotation-constraints: maxDegrees must exceed kneeDegrees')
	return kneeDegrees + range * Math.tanh((angleDegrees - kneeDegrees) / range)
}

function decomposeSwingTwist(deltaQuaternion, axis) {
	const delta = normalize(deltaQuaternion)
	const projection = dot(delta.slice(0, 3), axis)
	let twist = normalize([axis[0] * projection, axis[1] * projection, axis[2] * projection, delta[3]])
	if (twist[3] < 0) twist = twist.map(value => -value)
	const swing = normalize(multiply(delta, conjugate(twist)))
	let signedTwistRadians = 2 * Math.atan2(dot(twist.slice(0, 3), axis), twist[3])
	if (signedTwistRadians > Math.PI) signedTwistRadians -= 2 * Math.PI
	if (signedTwistRadians < -Math.PI) signedTwistRadians += 2 * Math.PI
	return { swing, signedTwistDegrees: toDegrees(signedTwistRadians) }
}

function twistQuaternion(axis, signedDegrees) {
	const halfAngle = toRadians(signedDegrees) / 2
	const sine = Math.sin(halfAngle)
	return normalize([axis[0] * sine, axis[1] * sine, axis[2] * sine, Math.cos(halfAngle)])
}

function relativeAxisAngle(restRotation, value) {
	const delta = normalize(multiply(conjugate(normalize(restRotation)), normalize(value)))
	const vectorLength = magnitude(delta.slice(0, 3))
	const angleDegrees = toDegrees(2 * Math.atan2(vectorLength, delta[3]))
	return {
		axis: vectorLength > 1e-10 ? delta.slice(0, 3).map(component => component / vectorLength) : [1, 0, 0],
		angleDegrees,
	}
}

function rotationFromRestWithAngle(restRotation, axis, angleDegrees) {
	return normalize(multiply(normalize(restRotation), twistQuaternion(axis, angleDegrees)))
}

function unwrapDegreesNear(referenceDegrees, valueDegrees) {
	if (!Number.isFinite(referenceDegrees)) return valueDegrees
	let result = valueDegrees
	while (result - referenceDegrees > 180) result -= 360
	while (result - referenceDegrees < -180) result += 360
	return result
}

function constrainAxialTwist(value, restRotation, axis, constraint, previousSignedTwistDegrees = null) {
	const rest = normalize(restRotation)
	const source = normalize(value)
	const delta = normalize(multiply(conjugate(rest), source))
	const decomposition = decomposeSwingTwist(delta, axis)
	const signedTwistDegrees = unwrapDegreesNear(previousSignedTwistDegrees, decomposition.signedTwistDegrees)
	const { swing } = decomposition
	const sourceMagnitude = Math.abs(signedTwistDegrees)
	const targetMagnitude = compressedAngleDegrees(sourceMagnitude, {
		kneeDegrees: constraint.twistKneeDegrees,
		maxDegrees: constraint.twistMaxDegrees,
	})
	const targetSignedDegrees = Math.sign(signedTwistDegrees || 1) * targetMagnitude
	const correctedDelta = normalize(multiply(swing, twistQuaternion(axis, targetSignedDegrees)))
	return {
		value: normalize(multiply(rest, correctedDelta)),
		beforeDegrees: signedTwistDegrees,
		afterDegrees: targetSignedDegrees,
		constrained: targetMagnitude + 1e-8 < sourceMagnitude,
	}
}

function accessorLayout(json, accessorIndex, expectedType) {
	const accessor = json.accessors?.[accessorIndex]
	if (!accessor) throw new Error(`joint-rotation-constraints: accessor ${accessorIndex} is missing`)
	if (accessor.sparse) throw new Error('joint-rotation-constraints: sparse accessors are unsupported')
	if (accessor.componentType !== FLOAT || accessor.type !== expectedType) {
		throw new Error(`joint-rotation-constraints: accessor ${accessorIndex} must be FLOAT ${expectedType}`)
	}
	const components = expectedType === 'VEC4' ? 4 : 1
	const bufferView = json.bufferViews?.[accessor.bufferView]
	if (!bufferView || Number(bufferView.buffer || 0) !== 0) {
		throw new Error(`joint-rotation-constraints: accessor ${accessorIndex} must use the embedded GLB buffer`)
	}
	return {
		accessor,
		components,
		count: Number(accessor.count || 0),
		base: Number(bufferView.byteOffset || 0) + Number(accessor.byteOffset || 0),
		stride: Number(bufferView.byteStride || components * 4),
	}
}

function readAccessor(bin, layout) {
	return Array.from({ length: layout.count }, (_, row) =>
		Array.from({ length: layout.components }, (_, component) =>
			bin.readFloatLE(layout.base + row * layout.stride + component * 4)))
}

function writeQuaternions(bin, layout, values) {
	for (let row = 0; row < layout.count; row++) {
		for (let component = 0; component < 4; component++) {
			bin.writeFloatLE(values[row][component], layout.base + row * layout.stride + component * 4)
		}
	}
	if (layout.accessor.min || layout.accessor.max) {
		layout.accessor.min = Array.from({ length: 4 }, (_, component) => Math.min(...values.map(value => value[component])))
		layout.accessor.max = Array.from({ length: 4 }, (_, component) => Math.max(...values.map(value => value[component])))
	}
}

function sampleQuaternion(times, values, time) {
	if (!times.length || !values.length || times.length !== values.length) {
		throw new Error('joint-rotation-constraints: invalid quaternion track')
	}
	if (time <= times[0] + 1e-7) return values[0]
	const last = times.length - 1
	if (time >= times[last] - 1e-7) return values[last]
	let low = 0
	let high = last
	while (high - low > 1) {
		const middle = Math.floor((low + high) / 2)
		if (times[middle] <= time) low = middle
		else high = middle
	}
	const span = times[high] - times[low]
	if (!(span > 1e-12)) return values[low]
	return slerp(values[low], values[high], (time - times[low]) / span)
}

function buildParentIndexes(nodes) {
	const parents = Array(nodes.length).fill(-1)
	for (let parent = 0; parent < nodes.length; parent++) {
		for (const child of nodes[parent]?.children || []) parents[child] = parent
	}
	return parents
}

function worldRotationAt(nodeIndex, time, {
	nodes,
	parents,
	recordsByNode,
	correctedValuesByNode,
	corrected,
	cache,
}) {
	if (cache.has(nodeIndex)) return cache.get(nodeIndex)
	const node = nodes[nodeIndex]
	if (!node) throw new Error(`joint-rotation-constraints: node ${nodeIndex} is missing`)
	const record = recordsByNode.get(nodeIndex)
	const values = corrected && correctedValuesByNode.has(nodeIndex)
		? correctedValuesByNode.get(nodeIndex)
		: record?.values
	const local = record && values
		? sampleQuaternion(record.times, values, time)
		: normalize(node.rotation || [0, 0, 0, 1])
	const parentIndex = parents[nodeIndex]
	const world = parentIndex >= 0
		? normalize(multiply(worldRotationAt(parentIndex, time, {
			nodes,
			parents,
			recordsByNode,
			correctedValuesByNode,
			corrected,
			cache,
		}), local))
		: local
	cache.set(nodeIndex, world)
	return world
}

function compensateParentWorldRotation(values, times, nodeIndex, context) {
	const parentIndex = context.parents[nodeIndex]
	if (parentIndex < 0) return {
		values,
		compensationDegrees: values.map(() => 0),
		worldErrorDegrees: values.map(() => 0),
	}
	let previous = null
	const compensationDegrees = []
	const worldErrorDegrees = []
	const output = values.map((source, index) => {
		const time = times[index]
		const sourceParentWorld = worldRotationAt(parentIndex, time, {
			...context,
			corrected: false,
			cache: new Map(),
		})
		const correctedParentWorld = worldRotationAt(parentIndex, time, {
			...context,
			corrected: true,
			cache: new Map(),
		})
		const correction = normalize(multiply(inverse(correctedParentWorld), sourceParentWorld))
		let compensated = normalize(multiply(correction, source))
		if (previous) compensated = alignTo(previous, compensated)
		previous = compensated
		compensationDegrees.push(angularDistanceDegrees(source, compensated))
		const sourceWorld = normalize(multiply(sourceParentWorld, source))
		const compensatedWorld = normalize(multiply(correctedParentWorld, compensated))
		worldErrorDegrees.push(angularDistanceDegrees(sourceWorld, compensatedWorld))
		return compensated
	})
	return { values: output, compensationDegrees, worldErrorDegrees }
}

function constrainTrack(values, times, restRotation, constraint, twistAxis = null) {
	const rest = normalize(restRotation)
	const beforeAngles = values.map(value => angularDistanceDegrees(rest, value))
	const openingSpike = beforeAngles[0] > Number(constraint.initialSpikeDegrees || Infinity)
	const hasTotalEnvelope = Number.isFinite(constraint.kneeDegrees) && Number.isFinite(constraint.maxDegrees)
	const startTime = times[0]
	let constrainedSamples = 0
	const twistBeforeDegrees = []
	const twistAfterDegrees = []
	let twistConstrainedSamples = 0
	let previousSignedTwistDegrees = null
	let previousSource = rest
	const output = values.map((value, index) => {
		const source = alignTo(previousSource, value)
		previousSource = source
		const pathAngle = hasTotalEnvelope ? relativeAxisAngle(rest, source) : null
		const sourceAngle = pathAngle?.angleDegrees ?? beforeAngles[index]
		const targetAngle = hasTotalEnvelope ? compressedAngleDegrees(sourceAngle, constraint) : sourceAngle
		let result = hasTotalEnvelope && sourceAngle > 1e-8
			? rotationFromRestWithAngle(rest, pathAngle.axis, targetAngle)
			: source
		if (targetAngle + 1e-8 < sourceAngle) constrainedSamples++
		if (openingSpike && constraint.startBlendMs > 0) {
			const elapsedMs = Math.max(0, (times[index] - startTime) * 1000)
			if (elapsedMs < constraint.startBlendMs) {
				result = slerp(rest, result, smoothstep01(elapsedMs / constraint.startBlendMs))
				constrainedSamples++
			}
		}
		if (twistAxis && Number.isFinite(constraint.twistKneeDegrees) && Number.isFinite(constraint.twistMaxDegrees)) {
			const twist = constrainAxialTwist(result, rest, twistAxis, constraint, previousSignedTwistDegrees)
			previousSignedTwistDegrees = twist.beforeDegrees
			result = twist.value
			twistBeforeDegrees.push(twist.beforeDegrees)
			twistAfterDegrees.push(twist.afterDegrees)
			if (twist.constrained) twistConstrainedSamples++
		}
		return result
	})
	const afterAngles = output.map(value => angularDistanceDegrees(rest, value))
	const beforeSteps = values.slice(1).map((value, index) => angularDistanceDegrees(values[index], value))
	const afterSteps = output.slice(1).map((value, index) => angularDistanceDegrees(output[index], value))
	return {
		values: output,
			report: {
			beforeMaxDegrees: Math.max(0, ...beforeAngles),
			afterMaxDegrees: Math.max(0, ...afterAngles),
				beforeStartDegrees: beforeAngles[0] || 0,
				afterStartDegrees: afterAngles[0] || 0,
				beforeMaxStepDegrees: Math.max(0, ...beforeSteps),
				afterMaxStepDegrees: Math.max(0, ...afterSteps),
			openingSpikeAnchored: openingSpike,
				constrainedSamples,
				...(twistBeforeDegrees.length ? {
					twistBeforeMaxDegrees: Math.max(...twistBeforeDegrees.map(Math.abs)),
					twistAfterMaxDegrees: Math.max(...twistAfterDegrees.map(Math.abs)),
					twistConstrainedSamples,
				} : {}),
			},
	}
}

export function constrainPresenterArmArticulations(buffer, {
	constraints = DEFAULT_CONSTRAINTS,
	animationNames = null,
} = {}) {
	const { json, bin } = parseGlb(buffer)
	const outputBin = Buffer.from(bin)
	const requested = animationNames ? new Set(animationNames) : null
	const nodes = json.nodes || []
	const parents = buildParentIndexes(nodes)
	const report = []

	for (const animation of json.animations || []) {
		if (requested && !requested.has(animation.name)) continue
		const rotationRecords = (animation.channels || []).filter(channel => channel.target?.path === 'rotation').map(channel => {
			const nodeIndex = channel.target?.node
			const node = nodes[nodeIndex]
			const sampler = animation.samplers?.[channel.sampler]
			if (!sampler) throw new Error(`joint-rotation-constraints: sampler missing for ${animation.name}/${node?.name || nodeIndex}`)
			const valueLayout = accessorLayout(json, sampler.output, 'VEC4')
			const timeLayout = accessorLayout(json, sampler.input, 'SCALAR')
			const values = readAccessor(bin, valueLayout)
			const times = readAccessor(bin, timeLayout).map(value => value[0])
			if (values.length !== times.length) throw new Error(`joint-rotation-constraints: key count mismatch for ${animation.name}/${node?.name || nodeIndex}`)
			return { channel, node, nodeIndex, sampler, valueLayout, timeLayout, values, times }
		})
		const recordsByNode = new Map(rotationRecords.map(record => [record.nodeIndex, record]))
		const correctedValuesByNode = new Map()
		const constrainedRecords = rotationRecords.filter(record => constraints[record.node?.name])
		const orderedRecords = [
			...constrainedRecords.filter(record => !record.node?.name?.endsWith('Hand')),
			...constrainedRecords.filter(record => record.node?.name?.endsWith('Hand')),
		]

		for (const record of orderedRecords) {
			const { node, nodeIndex, valueLayout, times } = record
			const constraint = constraints[node?.name]
			let values = record.values
			let parentCompensation = null
			if (constraint.compensateParentWorldRotation) {
				parentCompensation = compensateParentWorldRotation(values, times, nodeIndex, {
					nodes,
					parents,
					recordsByNode,
					correctedValuesByNode,
				})
				values = parentCompensation.values
			}
			const childSuffix = constraint.twistChildSuffix
			const child = childSuffix
				? (node.children || []).map(index => nodes[index]).find(candidate => candidate?.name?.endsWith(`:${childSuffix}`))
				: null
			const childTranslation = child?.translation || null
			const childTranslationLength = childTranslation ? magnitude(childTranslation) : 0
			const twistAllowedForAnimation = !constraint.twistAnimationNames || constraint.twistAnimationNames.includes(animation.name)
			const twistAxis = twistAllowedForAnimation && childTranslationLength > 1e-8
				? childTranslation.map(value => value / childTranslationLength)
				: null
			const result = constrainTrack(values, times, node.rotation || [0, 0, 0, 1], constraint, twistAxis)
			writeQuaternions(outputBin, valueLayout, result.values)
			correctedValuesByNode.set(nodeIndex, result.values)
			let finalWorldErrorMaxDegrees = 0
			let finalWorldErrorAfterOpeningBlendMaxDegrees = 0
			if (parentCompensation) {
				const parentIndex = parents[nodeIndex]
				const finalWorldErrors = result.values.map((value, index) => {
					const time = times[index]
					const sourceParentWorld = worldRotationAt(parentIndex, time, {
						nodes, parents, recordsByNode, correctedValuesByNode,
						corrected: false, cache: new Map(),
					})
					const correctedParentWorld = worldRotationAt(parentIndex, time, {
						nodes, parents, recordsByNode, correctedValuesByNode,
						corrected: true, cache: new Map(),
					})
					return angularDistanceDegrees(
						normalize(multiply(sourceParentWorld, record.values[index])),
						normalize(multiply(correctedParentWorld, value)),
					)
				})
				finalWorldErrorMaxDegrees = Math.max(0, ...finalWorldErrors)
				const blendEnd = times[0] + Number(constraint.startBlendMs || 0) / 1000
				finalWorldErrorAfterOpeningBlendMaxDegrees = Math.max(0, ...finalWorldErrors.filter((_, index) => times[index] >= blendEnd - 1e-7))
			}
			report.push({
				animation: animation.name,
				joint: node.name,
				...(Number.isFinite(constraint.kneeDegrees) ? {
					kneeDegrees: constraint.kneeDegrees,
					maxDegrees: constraint.maxDegrees,
				} : {}),
				...(twistAxis && Number.isFinite(constraint.twistKneeDegrees) ? {
					twistKneeDegrees: constraint.twistKneeDegrees,
					twistMaxDegrees: constraint.twistMaxDegrees,
				} : {}),
				...(parentCompensation ? {
					parentWorldCompensated: true,
					parentWorldCompensationMaxDegrees: Math.max(0, ...parentCompensation.compensationDegrees),
					parentWorldPreservationErrorMaxDegrees: Math.max(0, ...parentCompensation.worldErrorDegrees),
					finalWorldOrientationErrorMaxDegrees: finalWorldErrorMaxDegrees,
					finalWorldOrientationErrorAfterOpeningBlendMaxDegrees: finalWorldErrorAfterOpeningBlendMaxDegrees,
				} : {}),
				...result.report,
			})
		}
	}

	if (requested) {
		const found = new Set(report.map(row => row.animation))
		const missing = [...requested].filter(name => !found.has(name))
		if (missing.length) throw new Error(`joint-rotation-constraints: animations not found: ${missing.join(', ')}`)
	}

	return { buffer: serializeGlb(json, outputBin), report, constraints }
}

export { DEFAULT_CONSTRAINTS }
