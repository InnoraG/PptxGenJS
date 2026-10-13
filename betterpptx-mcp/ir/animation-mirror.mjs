// Calibrated bilateral animation derivation for Mixamo-style skeletal clips.
//
// The operation is deliberately source-first: it preserves the source clock and
// action phases, swaps bilateral channels, and reflects them in a declared rig
// axis. It does not invent a new trajectory, retime the take, or decide how a
// slide target should move. That remains authored choreography data.

const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const TYPE_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }
const GLB_MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942

function parseGlb(buf) {
	if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf)
	if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error('animation-mirror: not a GLB')
	let offset = 12
	let json = null
	let bin = Buffer.alloc(0)
	while (offset + 8 <= buf.length) {
		const length = buf.readUInt32LE(offset)
		const type = buf.readUInt32LE(offset + 4)
		const data = buf.subarray(offset + 8, offset + 8 + length)
		if (type === CHUNK_JSON) json = JSON.parse(data.toString('utf8'))
		if (type === CHUNK_BIN) bin = Buffer.from(data)
		offset += 8 + length
	}
	if (!json) throw new Error('animation-mirror: GLB has no JSON chunk')
	return { json, bin }
}

function serializeGlb(json, bin) {
	let jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8')
	if (jsonBuffer.length % 4) jsonBuffer = Buffer.concat([jsonBuffer, Buffer.alloc(4 - (jsonBuffer.length % 4), 0x20)])
	let binBuffer = bin || Buffer.alloc(0)
	if (binBuffer.length % 4) binBuffer = Buffer.concat([binBuffer, Buffer.alloc(4 - (binBuffer.length % 4), 0)])
	const total = 12 + 8 + jsonBuffer.length + 8 + binBuffer.length
	const output = Buffer.alloc(total)
	output.writeUInt32LE(GLB_MAGIC, 0)
	output.writeUInt32LE(2, 4)
	output.writeUInt32LE(total, 8)
	let offset = 12
	output.writeUInt32LE(jsonBuffer.length, offset)
	output.writeUInt32LE(CHUNK_JSON, offset + 4)
	jsonBuffer.copy(output, offset + 8)
	offset += 8 + jsonBuffer.length
	output.writeUInt32LE(binBuffer.length, offset)
	output.writeUInt32LE(CHUNK_BIN, offset + 4)
	binBuffer.copy(output, offset + 8)
	return output
}

function clone(value) {
	return JSON.parse(JSON.stringify(value))
}

function normalize(value) {
	const length = Math.hypot(...value) || 1
	return value.map(component => component / length)
}

/** Swap the conventional Mixamo bilateral name while leaving the node index stable. */
export function mirrorSideName(name) {
	const value = String(name || '')
	if (/(^|[^A-Za-z])Left([^A-Za-z]|$)/.test(value) || value.includes(':Left')) {
		return value.replace(/Left/g, 'Right')
	}
	if (/(^|[^A-Za-z])Right([^A-Za-z]|$)/.test(value) || value.includes(':Right')) {
		return value.replace(/Right/g, 'Left')
	}
	if (/(^|[_:.])L(?=[_:.\d]|$)/.test(value)) return value.replace(/L(?=[_:.\d]|$)/g, 'R')
	if (/(^|[_:.])R(?=[_:.\d]|$)/.test(value)) return value.replace(/R(?=[_:.\d]|$)/g, 'L')
	return value
}

function reflectVector(vector, axis) {
	const output = vector.slice()
	output[axis] = -output[axis]
	return output
}

// For reflection S around the plane whose normal is `axis`, the proper rotation
// represented by q becomes S*R(q)*S. The quaternion component on the normal axis
// is unchanged; the other three signs are reversed except for w.
function reflectQuaternion(raw, axis, unit) {
	const output = raw.slice()
	for (let component = 0; component < 3; component++) {
		if (component !== axis) output[component] = -output[component]
	}
	return unit ? normalize(output) : output
}

function accessorRows(json, bin, accessorIndex) {
	const accessor = json.accessors?.[accessorIndex]
	const view = accessor && json.bufferViews?.[accessor.bufferView]
	if (!accessor || !view) throw new Error(`animation-mirror: missing accessor ${accessorIndex}`)
	const count = TYPE_COUNT[accessor.type]
	const bytes = COMPONENT_BYTES[accessor.componentType]
	if (!count || accessor.componentType !== 5126) {
		throw new Error(`animation-mirror: only FLOAT animation accessors are supported (${accessorIndex})`)
	}
	const base = (view.byteOffset || 0) + (accessor.byteOffset || 0)
	const stride = view.byteStride || count * bytes
	const rows = []
	for (let index = 0; index < accessor.count; index++) {
		const row = []
		for (let component = 0; component < count; component++) {
			row.push(bin.readFloatLE(base + index * stride + component * bytes))
		}
		rows.push(row)
	}
	return { accessor, view, base, stride, count, rows }
}

function writeRows(decoded, bin, rows) {
	for (let index = 0; index < rows.length; index++) {
		for (let component = 0; component < decoded.count; component++) {
			bin.writeFloatLE(rows[index][component], decoded.base + index * decoded.stride + component * 4)
		}
	}
}

function assertNodeCounterparts(nodes, strict) {
	const indexByName = new Map(nodes.map((node, index) => [String(node?.name || ''), index]))
	const counterpart = nodes.map(node => indexByName.get(mirrorSideName(node?.name)))
	const missing = nodes
		.map((node, index) => ({ index, name: node?.name, counterpart: counterpart[index] }))
		.filter(item => item.name && item.counterpart === undefined && mirrorSideName(item.name) !== item.name)
	if (strict && missing.length) {
		throw new Error(`animation-mirror: missing bilateral counterparts: ${missing.map(item => item.name).join(', ')}`)
	}
	return { indexByName, counterpart, missing }
}

/**
 * Derive a mirrored skeletal GLB.
 *
 * `axis` is the declared reflection normal in the source/target calibrated
 * coordinate frame. Mixamo/PowerPoint presenter rigs use X for left/right.
 */
export function mirrorAnimationGlb(glbBytes, {
	animationIndex = 0,
	axis = 0,
	strict = true,
	mirrorStaticNodes = true,
	nameSuffix = '.mirrored',
} = {}) {
	if (!Number.isInteger(axis) || axis < 0 || axis > 2) throw new Error('animation-mirror: axis must be 0, 1 or 2')
	const parsed = parseGlb(glbBytes)
	const json = clone(parsed.json)
	const bin = Buffer.from(parsed.bin)
	const nodes = json.nodes || []
	const { counterpart, missing } = assertNodeCounterparts(nodes, strict)
	const animation = json.animations?.[animationIndex]
	if (!animation) throw new Error(`animation-mirror: animation ${animationIndex} is unavailable`)

	// The motion library is emitted as one source action. Preserve the source GLB
	// structure but expose only the selected derived action to avoid ambiguous
	// clip selection downstream.
	const mirroredAnimation = clone(animation)
	mirroredAnimation.name = `${String(animation.name || `animation-${animationIndex}`)}${nameSuffix}`
	const transformedAccessors = new Set()
	const transformedChannelCount = { rotation: 0, translation: 0, other: 0 }

	for (const channel of mirroredAnimation.channels || []) {
		const sourceNodeIndex = channel.target?.node
		const destinationNodeIndex = counterpart[sourceNodeIndex]
		if (destinationNodeIndex === undefined) {
			if (strict) throw new Error(`animation-mirror: channel node ${sourceNodeIndex} has no counterpart`)
			continue
		}
		channel.target.node = destinationNodeIndex
		const path = channel.target?.path
		const sampler = mirroredAnimation.samplers?.[channel.sampler]
		if (!sampler || path === 'weights') {
			transformedChannelCount.other++
			continue
		}
		if (path !== 'rotation' && path !== 'translation' && path !== 'scale') {
			transformedChannelCount.other++
			continue
		}
		const accessorIndex = sampler.output
		if (transformedAccessors.has(accessorIndex)) continue
		const decoded = accessorRows(json, bin, accessorIndex)
		const interpolation = sampler.interpolation || 'LINEAR'
		const rowsPerKey = interpolation === 'CUBICSPLINE' ? 3 : 1
		for (let rowIndex = 0; rowIndex < decoded.rows.length; rowIndex++) {
			const row = decoded.rows[rowIndex]
			if (path === 'translation') {
				if (decoded.count !== 3) throw new Error('animation-mirror: translation is not VEC3')
				decoded.rows[rowIndex] = reflectVector(row, axis)
				transformedChannelCount.translation++
			} else if (path === 'rotation') {
				if (decoded.count !== 4) throw new Error('animation-mirror: rotation is not VEC4')
				const isValueRow = rowsPerKey === 1 || rowIndex % rowsPerKey === 1
				decoded.rows[rowIndex] = reflectQuaternion(row, axis, isValueRow)
				transformedChannelCount.rotation++
			} else {
				// Uniform scale is invariant under bilateral reflection.
				transformedChannelCount.other++
			}
		}
		if (path !== 'scale') writeRows(decoded, bin, decoded.rows)
		transformedAccessors.add(accessorIndex)
	}

	if (mirrorStaticNodes) {
		const originalNodes = clone(nodes)
		for (let index = 0; index < nodes.length; index++) {
			const node = nodes[index]
			const source = originalNodes[counterpart[index] ?? index]
			if (!source) continue
			if (Array.isArray(source.translation)) node.translation = reflectVector(source.translation.slice(0, 3), axis)
			if (Array.isArray(source.rotation)) node.rotation = reflectQuaternion(source.rotation.slice(0, 4), axis, true)
			if (Array.isArray(source.scale)) node.scale = source.scale.slice(0, 3)
		}
	}

	json.animations = [mirroredAnimation]
	return {
		glb: serializeGlb(json, bin),
		report: {
			schemaVersion: 'betterpptx.animation-mirror.v1',
			status: 'MIRRORED',
			axis,
			animationIndex,
			sourceAnimation: animation.name || `animation-${animationIndex}`,
			mirroredAnimation: mirroredAnimation.name,
			nodeCount: nodes.length,
			missingCounterparts: missing.map(item => item.name),
			channelCount: mirroredAnimation.channels?.length || 0,
			transformedChannelCount,
			timingPreserved: true,
			staticRestReflected: Boolean(mirrorStaticNodes),
		},
	}
}
