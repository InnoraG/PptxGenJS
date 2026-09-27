// Remove high-frequency orientation noise from generated animation tracks while
// preserving their timing, channel count, target joints, and GLB package layout.
//
// Kimodo's 30 fps presenter motions can contain frame-to-frame quaternion
// reversals that read as vibration in PowerPoint. A symmetric binomial filter is
// applied in quaternion space with hemisphere alignment and normalization. The
// filter is zero-phase, so gesture contacts are not shifted in time.

import { parseGlb, serializeGlb } from '../ir/kinetic-transplant.mjs'

const FLOAT = 5126
const VEC4_COMPONENTS = 4
const KERNEL = Object.freeze([1, 4, 6, 4, 1])

const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0)
const magnitude = value => Math.hypot(...value)
const subtract = (a, b) => a.map((value, index) => value - b[index])
const clamp = (value, low, high) => Math.max(low, Math.min(high, value))
const percentile = (values, fraction) => {
	if (!values.length) return 0
	const sorted = [...values].sort((a, b) => a - b)
	return sorted[Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1)))]
}

function accessorLayout(json, accessorIndex) {
	const accessor = json.accessors?.[accessorIndex]
	if (!accessor) throw new Error(`motion-smoothing: accessor ${accessorIndex} is missing`)
	if (accessor.sparse) throw new Error('motion-smoothing: sparse quaternion accessors are unsupported')
	if (accessor.componentType !== FLOAT || accessor.type !== 'VEC4') {
		throw new Error(`motion-smoothing: accessor ${accessorIndex} must be FLOAT VEC4`)
	}
	const bufferView = json.bufferViews?.[accessor.bufferView]
	if (!bufferView || Number(bufferView.buffer || 0) !== 0) {
		throw new Error(`motion-smoothing: accessor ${accessorIndex} must use the embedded GLB buffer`)
	}
	return {
		accessor,
		count: Number(accessor.count || 0),
		base: Number(bufferView.byteOffset || 0) + Number(accessor.byteOffset || 0),
		stride: Number(bufferView.byteStride || VEC4_COMPONENTS * 4),
	}
}

function readQuaternions(bin, layout) {
	const values = []
	for (let row = 0; row < layout.count; row++) {
		const quaternion = []
		for (let component = 0; component < VEC4_COMPONENTS; component++) {
			quaternion.push(bin.readFloatLE(layout.base + row * layout.stride + component * 4))
		}
		values.push(quaternion)
	}
	return values
}

function writeQuaternions(bin, layout, values) {
	for (let row = 0; row < layout.count; row++) {
		for (let component = 0; component < VEC4_COMPONENTS; component++) {
			bin.writeFloatLE(values[row][component], layout.base + row * layout.stride + component * 4)
		}
	}
	if (layout.accessor.min || layout.accessor.max) {
		layout.accessor.min = Array.from({ length: 4 }, (_, component) => Math.min(...values.map(value => value[component])))
		layout.accessor.max = Array.from({ length: 4 }, (_, component) => Math.max(...values.map(value => value[component])))
	}
}

function normalize(quaternion) {
	const length = magnitude(quaternion)
	if (!Number.isFinite(length) || length < 1e-12) throw new Error('motion-smoothing: invalid zero-length quaternion')
	return quaternion.map(value => value / length)
}

function alignHemisphere(values) {
	const aligned = values.map(value => normalize(value))
	for (let index = 1; index < aligned.length; index++) {
		if (dot(aligned[index - 1], aligned[index]) < 0) aligned[index] = aligned[index].map(value => -value)
	}
	return aligned
}

function smoothPass(values) {
	return values.map((center, index) => {
		const weighted = [0, 0, 0, 0]
		let totalWeight = 0
		for (let offset = -2; offset <= 2; offset++) {
			const sourceIndex = Math.max(0, Math.min(values.length - 1, index + offset))
			const source = values[sourceIndex]
			const weight = KERNEL[offset + 2]
			const sign = dot(center, source) < 0 ? -1 : 1
			for (let component = 0; component < 4; component++) weighted[component] += weight * sign * source[component]
			totalWeight += weight
		}
		return normalize(weighted.map(value => value / totalWeight))
	})
}

function smoothTrack(values, passes, preserveFirstKey) {
	const source = alignHemisphere(values)
	let result = source
	for (let pass = 0; pass < passes; pass++) result = smoothPass(result)
	// The first key is part of the presenter's authored neutral/entry contract.
	// Retaining it prevents a zero-phase filter from pulling a later extreme
	// wrist pose backward into frame zero (the transient T-pose/wrist-pop case).
	if (preserveFirstKey && result.length) result[0] = source[0]
	return alignHemisphere(result)
}

function angularDistanceDegrees(a, b) {
	const qa = normalize(a)
	const qb = normalize(b)
	return 2 * Math.acos(clamp(Math.abs(dot(qa, qb)), -1, 1)) * 180 / Math.PI
}

function slerp(a, b, fraction) {
	const qa = normalize(a)
	const qb = alignHemisphere([qa, b])[1]
	const cosine = clamp(dot(qa, qb), -1, 1)
	if (cosine > 0.9995) return normalize(qa.map((value, index) => value + fraction * (qb[index] - value)))
	const angle = Math.acos(cosine)
	const denominator = Math.sin(angle)
	const aWeight = Math.sin((1 - fraction) * angle) / denominator
	const bWeight = Math.sin(fraction * angle) / denominator
	return normalize(qa.map((value, index) => aWeight * value + bWeight * qb[index]))
}

// Generated clips occasionally contain a legitimate quaternion followed by a
// one-frame orientation jump. A low-pass filter alone spreads that jump but
// does not guarantee a safe playback velocity. This final causal projection
// keeps the first authored pose and caps every later physical rotation step;
// the track catches up over subsequent frames instead of snapping in one frame.
function limitAngularSteps(values, maxStepDegrees) {
	if (!Number.isFinite(maxStepDegrees) || maxStepDegrees <= 0) return alignHemisphere(values)
	const source = alignHemisphere(values)
	const output = [source[0]]
	for (let index = 1; index < source.length; index++) {
		const previous = output[index - 1]
		const target = source[index]
		const stepDegrees = angularDistanceDegrees(previous, target)
		output.push(stepDegrees > maxStepDegrees
			? slerp(previous, target, maxStepDegrees / stepDegrees)
			: alignHemisphere([previous, target])[1])
	}
	return alignHemisphere(output)
}

function trackMetrics(values) {
	const aligned = alignHemisphere(values)
	const deltas = []
	const stepDegrees = []
	for (let index = 1; index < aligned.length; index++) {
		const delta = subtract(aligned[index], aligned[index - 1])
		deltas.push(delta)
		stepDegrees.push(angularDistanceDegrees(aligned[index - 1], aligned[index]))
	}
	let firstEnergy = 0
	let secondEnergy = 0
	let reversals = 0
	let comparable = 0
	for (const delta of deltas) firstEnergy += magnitude(delta) ** 2
	for (let index = 1; index < deltas.length; index++) {
		secondEnergy += magnitude(subtract(deltas[index], deltas[index - 1])) ** 2
		const denominator = magnitude(deltas[index]) * magnitude(deltas[index - 1])
		if (denominator > 1e-10) {
			comparable++
			if (dot(deltas[index], deltas[index - 1]) / denominator < -0.15) reversals++
		}
	}
	return {
		roughness: firstEnergy > 0 ? secondEnergy / firstEnergy : 0,
		reversalRate: comparable ? reversals / comparable : 0,
		p95StepDegrees: percentile(stepDegrees, 0.95),
		maxStepDegrees: Math.max(0, ...stepDegrees),
	}
}

function summarize(trackRows) {
	return {
		tracks: trackRows.length,
		roughnessMedian: percentile(trackRows.map(row => row.roughness), 0.5),
		roughnessP95: percentile(trackRows.map(row => row.roughness), 0.95),
		reversalRateMedian: percentile(trackRows.map(row => row.reversalRate), 0.5),
		reversalRateP95: percentile(trackRows.map(row => row.reversalRate), 0.95),
		p95StepDegrees: percentile(trackRows.map(row => row.p95StepDegrees), 0.95),
		maxStepDegrees: Math.max(0, ...trackRows.map(row => row.maxStepDegrees)),
	}
}

export function smoothRotationAnimations(buffer, { passes = 6, animationNames = null, maxStepDegrees = null, preserveFirstKey = false } = {}) {
	if (!Number.isInteger(passes) || passes < 1 || passes > 24) throw new Error(`motion-smoothing: invalid pass count ${passes}`)
	if (maxStepDegrees != null && (!Number.isFinite(maxStepDegrees) || maxStepDegrees <= 0 || maxStepDegrees > 180)) {
		throw new Error(`motion-smoothing: invalid maxStepDegrees ${maxStepDegrees}`)
	}
	const { json, bin } = parseGlb(buffer)
	const outputBin = Buffer.from(bin)
	const requested = animationNames ? new Set(animationNames) : null
	const report = []

	for (const animation of json.animations || []) {
		if (requested && !requested.has(animation.name)) continue
		const before = []
		const after = []
		const processedAccessors = new Set()
		for (const channel of animation.channels || []) {
			if (channel.target?.path !== 'rotation') continue
			const sampler = animation.samplers?.[channel.sampler]
			if (!sampler || processedAccessors.has(sampler.output)) continue
			processedAccessors.add(sampler.output)
			const layout = accessorLayout(json, sampler.output)
			const source = readQuaternions(outputBin, layout)
			const smoothed = limitAngularSteps(smoothTrack(source, passes, preserveFirstKey), maxStepDegrees)
			before.push(trackMetrics(source))
			after.push(trackMetrics(smoothed))
			writeQuaternions(outputBin, layout, smoothed)
		}
		if (before.length) report.push({ animation: animation.name, passes, maxStepDegrees, preserveFirstKey, before: summarize(before), after: summarize(after) })
	}

	if (requested) {
		const found = new Set(report.map(row => row.animation))
		const missing = [...requested].filter(name => !found.has(name))
		if (missing.length) throw new Error(`motion-smoothing: animations not found: ${missing.join(', ')}`)
	}
	return { buffer: serializeGlb(json, outputBin), report, passes, maxStepDegrees, preserveFirstKey }
}
