// Meshy geometry/texture -> canonical Mixamo animation bridge.
//
// The Meshy export is already skinned, so this bridge deliberately does not
// regenerate geometry, repaint weights, or carry Meshy's bundled animations.
// It renames the known humanoid nodes to the canonical names used by the
// existing presenter/world contract, then copies the frozen canonical clip
// library onto those same node indices. Rotation tracks are rebased from the
// library rest pose onto the Meshy rest pose; mesh, skin, materials, textures,
// and non-humanoid helper nodes remain owned by the Meshy GLB.

const GLB_MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942

const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }

// Meshy node name -> canonical node name. The extra head_end/headfront nodes
// are intentionally absent: they remain in the geometry rig but are not
// required by the finger-free canonical animation library.
export const MESHY_CANONICAL_BONE_MAP = Object.freeze({
	Hips: 'mixamorig:Hips',
	Spine02: 'mixamorig:Spine',
	Spine01: 'mixamorig:Spine1',
	Spine: 'mixamorig:Spine2',
	neck: 'mixamorig:Neck',
	Head: 'mixamorig:Head',
	LeftShoulder: 'mixamorig:LeftShoulder',
	LeftArm: 'mixamorig:LeftArm',
	LeftForeArm: 'mixamorig:LeftForeArm',
	LeftHand: 'mixamorig:LeftHand',
	RightShoulder: 'mixamorig:RightShoulder',
	RightArm: 'mixamorig:RightArm',
	RightForeArm: 'mixamorig:RightForeArm',
	RightHand: 'mixamorig:RightHand',
	LeftUpLeg: 'mixamorig:LeftUpLeg',
	LeftLeg: 'mixamorig:LeftLeg',
	LeftFoot: 'mixamorig:LeftFoot',
	LeftToeBase: 'mixamorig:LeftToeBase',
	RightUpLeg: 'mixamorig:RightUpLeg',
	RightLeg: 'mixamorig:RightLeg',
	RightFoot: 'mixamorig:RightFoot',
	RightToeBase: 'mixamorig:RightToeBase',
})

function parseGlb(buffer) {
	const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
	if (input.length < 20 || input.readUInt32LE(0) !== GLB_MAGIC || input.readUInt32LE(4) !== 2) {
		throw new Error('Meshy canonical bridge: expected a glTF 2.0 GLB')
	}
	let offset = 12
	let json = null
	let bin = Buffer.alloc(0)
	while (offset + 8 <= input.length) {
		const length = input.readUInt32LE(offset)
		const type = input.readUInt32LE(offset + 4)
		const end = offset + 8 + length
		if (end > input.length) throw new Error('Meshy canonical bridge: truncated GLB chunk')
		const data = input.subarray(offset + 8, end)
		if (type === CHUNK_JSON) json = JSON.parse(data.toString('utf8').trim())
		if (type === CHUNK_BIN) bin = Buffer.from(data)
		offset = end
	}
	if (!json || !Array.isArray(json.nodes)) throw new Error('Meshy canonical bridge: GLB has no usable JSON scene')
	return { json, bin }
}

function serializeGlb(json, bin) {
	let jsonBytes = Buffer.from(JSON.stringify(json), 'utf8')
	if (jsonBytes.length % 4) jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(4 - (jsonBytes.length % 4), 0x20)])
	let binBytes = bin || Buffer.alloc(0)
	if (binBytes.length % 4) binBytes = Buffer.concat([binBytes, Buffer.alloc(4 - (binBytes.length % 4))])
	const length = 12 + 8 + jsonBytes.length + 8 + binBytes.length
	const output = Buffer.alloc(length)
	output.writeUInt32LE(GLB_MAGIC, 0)
	output.writeUInt32LE(2, 4)
	output.writeUInt32LE(length, 8)
	let offset = 12
	output.writeUInt32LE(jsonBytes.length, offset)
	output.writeUInt32LE(CHUNK_JSON, offset + 4)
	jsonBytes.copy(output, offset + 8)
	offset += 8 + jsonBytes.length
	output.writeUInt32LE(binBytes.length, offset)
	output.writeUInt32LE(CHUNK_BIN, offset + 4)
	binBytes.copy(output, offset + 8)
	return output
}

function accessorView(json, accessorIndex) {
	const accessor = json.accessors?.[accessorIndex]
	if (!accessor) throw new Error(`Meshy canonical bridge: missing accessor ${accessorIndex}`)
	const view = json.bufferViews?.[accessor.bufferView]
	if (!view) throw new Error(`Meshy canonical bridge: missing bufferView for accessor ${accessorIndex}`)
	return { accessor, view }
}

function readAccessor(json, bin, accessorIndex) {
	const { accessor, view } = accessorView(json, accessorIndex)
	const components = TYPE_COMPONENTS[accessor.type]
	const bytesPerComponent = COMPONENT_BYTES[accessor.componentType]
	if (!components || !bytesPerComponent) throw new Error(`Meshy canonical bridge: unsupported accessor ${accessorIndex}`)
	const stride = view.byteStride || components * bytesPerComponent
	const start = (view.byteOffset || 0) + (accessor.byteOffset || 0)
	const out = []
	for (let row = 0; row < accessor.count; row++) {
		const values = []
		for (let col = 0; col < components; col++) {
			const at = start + row * stride + col * bytesPerComponent
			if (accessor.componentType === 5126) values.push(bin.readFloatLE(at))
			else if (accessor.componentType === 5125) values.push(bin.readUInt32LE(at))
			else if (accessor.componentType === 5123) values.push(bin.readUInt16LE(at))
			else throw new Error(`Meshy canonical bridge: only float animation accessors are supported (${accessorIndex})`)
		}
		out.push(components === 1 ? values[0] : values)
	}
	return out
}

function quaternionMultiply(a, b) {
	const [ax, ay, az, aw] = a
	const [bx, by, bz, bw] = b
	return [
		aw * bx + ax * bw + ay * bz - az * by,
		aw * by - ax * bz + ay * bw + az * bx,
		aw * bz + ax * by - ay * bx + az * bw,
		aw * bw - ax * bx - ay * by - az * bz,
	]
}

function quaternionConjugate(q) { return [-q[0], -q[1], -q[2], q[3]] }

function quaternionNormalize(q) {
	const length = Math.hypot(q[0], q[1], q[2], q[3]) || 1
	return q.map(value => value / length)
}

function appendBytes(base, pieces, piece) {
	const current = base.length + pieces.reduce((sum, item) => sum + item.length, 0)
	const padding = current % 4 ? 4 - (current % 4) : 0
	if (padding) pieces.push(Buffer.alloc(padding))
	const offset = base.length + pieces.reduce((sum, item) => sum + item.length, 0)
	pieces.push(piece)
	return offset
}

function copyAccessor(source, target, sourceBin, pieces, accessorIndex) {
	const { accessor, view } = accessorView(source, accessorIndex)
	const start = view.byteOffset || 0
	const bytes = sourceBin.subarray(start, start + view.byteLength)
	const offset = appendBytes(target._baseBin, pieces, bytes)
	const copiedView = { buffer: 0, byteOffset: offset, byteLength: view.byteLength }
	if (view.byteStride !== undefined) copiedView.byteStride = view.byteStride
	target.bufferViews.push(copiedView)
	const copiedAccessor = {
		bufferView: target.bufferViews.length - 1,
		byteOffset: accessor.byteOffset || 0,
		componentType: accessor.componentType,
		count: accessor.count,
		type: accessor.type,
	}
	if (accessor.normalized !== undefined) copiedAccessor.normalized = accessor.normalized
	if (accessor.min) copiedAccessor.min = accessor.min.slice()
	if (accessor.max) copiedAccessor.max = accessor.max.slice()
	target.accessors.push(copiedAccessor)
	return target.accessors.length - 1
}

function copyRebasedRotation(source, target, sourceBin, pieces, accessorIndex, sourceBoneName, targetBoneName, sourceRest, targetRest) {
	const values = readAccessor(source, sourceBin, accessorIndex)
	const pre = quaternionMultiply(targetRest[targetBoneName] || [0, 0, 0, 1], quaternionConjugate(sourceRest[sourceBoneName] || [0, 0, 0, 1]))
	const rebased = values.map(value => quaternionNormalize(quaternionMultiply(pre, value)))
	const bytes = Buffer.alloc(rebased.length * 16)
	const min = [Infinity, Infinity, Infinity, Infinity]
	const max = [-Infinity, -Infinity, -Infinity, -Infinity]
	for (let row = 0; row < rebased.length; row++) {
		for (let col = 0; col < 4; col++) {
			const value = rebased[row][col]
			bytes.writeFloatLE(value, row * 16 + col * 4)
			min[col] = Math.min(min[col], value)
			max[col] = Math.max(max[col], value)
		}
	}
	const offset = appendBytes(target._baseBin, pieces, bytes)
	target.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length })
	target.accessors.push({ bufferView: target.bufferViews.length - 1, byteOffset: 0, componentType: 5126, count: rebased.length, type: 'VEC4', min, max })
	return target.accessors.length - 1
}

function restRotations(json) {
	const rotations = {}
	for (const node of json.nodes || []) if (node.name) rotations[node.name] = node.rotation ? node.rotation.slice(0, 4) : [0, 0, 0, 1]
	return rotations
}

/**
 * Replace Meshy's bundled animation clips with canonical Mixamo clips.
 * @param {Buffer} meshyGlb - Meshy skinned GLB containing geometry/materials/textures.
 * @param {Buffer} canonicalLibraryGlb - canonical 18-clip Mixamo library GLB.
 * @param {{clipNames?: string[]}} options
 * @returns {{glb: Buffer, clips: number, report: object[], boneMap: object[]}}
 */
export function bridgeMeshyToCanonical(meshyGlb, canonicalLibraryGlb, options = {}) {
	const character = parseGlb(meshyGlb)
	const library = parseGlb(canonicalLibraryGlb)
	const characterJson = character.json
	const libraryJson = library.json
	const characterNodes = new Map()
	for (let index = 0; index < characterJson.nodes.length; index++) {
		const name = characterJson.nodes[index].name
		if (name) characterNodes.set(name, index)
	}
	const libraryNodes = new Map()
	for (let index = 0; index < libraryJson.nodes.length; index++) {
		const name = libraryJson.nodes[index].name
		if (name) libraryNodes.set(name, index)
	}
	const canonicalToCharacter = new Map()
	const boneMap = []
	for (const [meshyName, canonicalName] of Object.entries(MESHY_CANONICAL_BONE_MAP)) {
		const characterIndex = characterNodes.get(meshyName)
		const libraryIndex = libraryNodes.get(canonicalName)
		if (characterIndex === undefined || libraryIndex === undefined) throw new Error(`Meshy canonical bridge: missing bone mapping ${meshyName} -> ${canonicalName}`)
		canonicalToCharacter.set(canonicalName, characterIndex)
		boneMap.push({ source: meshyName, canonical: canonicalName, node: characterIndex })
		characterJson.nodes[characterIndex].name = canonicalName
	}

	const clipNames = options.clipNames || (libraryJson.animations || []).map(animation => animation.name)
	if (!clipNames.length) throw new Error('Meshy canonical bridge: canonical library has no animations')
	const libraryAnimations = new Map((libraryJson.animations || []).map(animation => [animation.name, animation]))
	const sourceRest = restRotations(libraryJson)
	const targetRest = restRotations(characterJson)
	const pieces = []
	const target = characterJson
	target._baseBin = character.bin
	const report = []
	const animations = []
	for (const [animationIndex, clipName] of clipNames.entries()) {
		const sourceAnimation = libraryAnimations.get(clipName)
		if (!sourceAnimation) throw new Error(`Meshy canonical bridge: missing canonical clip ${clipName}`)
		const samplers = []
		const channels = []
		let skipped = 0
		let rebasedRotations = 0
		for (const channel of sourceAnimation.channels || []) {
			const sourceNode = libraryJson.nodes[channel.target.node]
			const sourceBoneName = sourceNode?.name
			const characterNode = canonicalToCharacter.get(sourceBoneName)
			if (characterNode === undefined) {
				skipped++
				continue
			}
			const sourceSampler = sourceAnimation.samplers[channel.sampler]
			const input = copyAccessor(libraryJson, target, library.bin, pieces, sourceSampler.input)
			let output
			if (channel.target.path === 'rotation') {
				output = copyRebasedRotation(libraryJson, target, library.bin, pieces, sourceSampler.output, sourceBoneName, sourceBoneName, sourceRest, targetRest)
				rebasedRotations++
			} else {
				output = copyAccessor(libraryJson, target, library.bin, pieces, sourceSampler.output)
			}
			samplers.push({ input, output, interpolation: sourceSampler.interpolation || 'LINEAR' })
			channels.push({ sampler: samplers.length - 1, target: { node: characterNode, path: channel.target.path } })
		}
		animations.push({ name: clipName, samplers, channels })
		report.push({ animId: animationIndex, name: clipName, channels: channels.length, skipped, rebasedRotations })
	}

	delete target._baseBin
	const finalBin = pieces.length ? Buffer.concat([character.bin, ...pieces]) : character.bin
	target.animations = animations
	target.buffers = target.buffers || [{ byteLength: finalBin.length }]
	target.buffers[0].byteLength = finalBin.length
	delete target.buffers[0].uri
	return { glb: serializeGlb(target, finalBin), clips: animations.length, report, boneMap }
}

export function inspectGlb(buffer) {
	const { json } = parseGlb(buffer)
	return {
		meshes: json.meshes?.length || 0,
		materials: json.materials?.length || 0,
		textures: json.textures?.length || 0,
		images: json.images?.length || 0,
		skins: json.skins?.length || 0,
		animations: (json.animations || []).map(animation => animation.name),
	}
}
