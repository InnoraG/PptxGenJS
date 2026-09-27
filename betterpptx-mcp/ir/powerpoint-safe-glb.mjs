// PowerPoint compatibility probe for indexed glTF meshes.
// Office's working presenter GLBs use UNSIGNED_SHORT triangle indices. Meshy
// exports one 116k-vertex primitive with UNSIGNED_INT indices. This module
// partitions indexed primitives into <=65,535-vertex parts without changing
// positions, normals, UVs, skin joints/weights, materials, textures, skins,
// or animation tracks.

const GLB_MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }
const MAX_PART_VERTICES = 65535

function parseGlb(buffer) {
	const input = Buffer.from(buffer)
	if (input.length < 20 || input.readUInt32LE(0) !== GLB_MAGIC || input.readUInt32LE(4) !== 2) throw new Error('Expected glTF 2.0 GLB')
	let offset = 12
	let json
	let bin = Buffer.alloc(0)
	while (offset + 8 <= input.length) {
		const length = input.readUInt32LE(offset)
		const type = input.readUInt32LE(offset + 4)
		const end = offset + 8 + length
		if (end > input.length) throw new Error('Truncated GLB chunk')
		const data = input.subarray(offset + 8, end)
		if (type === CHUNK_JSON) json = JSON.parse(data.toString('utf8').trim())
		if (type === CHUNK_BIN) bin = Buffer.from(data)
		offset = end
	}
	if (!json || !Array.isArray(json.nodes) || !Array.isArray(json.meshes)) throw new Error('GLB has no usable scene')
	return { json, bin }
}

function serializeGlb(json, bin) {
	let jsonBytes = Buffer.from(JSON.stringify(json), 'utf8')
	if (jsonBytes.length % 4) jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(4 - (jsonBytes.length % 4), 0x20)])
	let binBytes = Buffer.from(bin || Buffer.alloc(0))
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

function accessorView(json, index) {
	const accessor = json.accessors?.[index]
	const view = accessor && json.bufferViews?.[accessor.bufferView]
	if (!accessor || !view) throw new Error(`Missing accessor/bufferView ${index}`)
	return { accessor, view }
}

function readAccessor(json, bin, index) {
	const { accessor, view } = accessorView(json, index)
	const components = TYPE_COMPONENTS[accessor.type]
	const bytesPerComponent = COMPONENT_BYTES[accessor.componentType]
	if (!components || !bytesPerComponent) throw new Error(`Unsupported accessor ${index}`)
	const stride = view.byteStride || components * bytesPerComponent
	const start = (view.byteOffset || 0) + (accessor.byteOffset || 0)
	const values = []
	for (let row = 0; row < accessor.count; row++) {
		const rowValues = []
		for (let col = 0; col < components; col++) {
			const at = start + row * stride + col * bytesPerComponent
			if (accessor.componentType === 5126) rowValues.push(bin.readFloatLE(at))
			else if (accessor.componentType === 5125) rowValues.push(bin.readUInt32LE(at))
			else if (accessor.componentType === 5123) rowValues.push(bin.readUInt16LE(at))
			else if (accessor.componentType === 5121) rowValues.push(bin.readUInt8(at))
			else if (accessor.componentType === 5122) rowValues.push(bin.readInt16LE(at))
			else if (accessor.componentType === 5120) rowValues.push(bin.readInt8(at))
			else throw new Error(`Unsupported component type ${accessor.componentType}`)
		}
		values.push(components === 1 ? rowValues[0] : rowValues)
	}
	return values
}

function appendBytes(base, pieces, piece) {
	const current = base.length + pieces.reduce((sum, item) => sum + item.length, 0)
	const padding = current % 4 ? 4 - (current % 4) : 0
	if (padding) pieces.push(Buffer.alloc(padding))
	const offset = base.length + pieces.reduce((sum, item) => sum + item.length, 0)
	pieces.push(piece)
	return offset
}

function flatten(value) { return Array.isArray(value) ? value : [value] }

function writeValues(json, targetBin, sourceAccessor, values, componentType, type) {
	const components = TYPE_COMPONENTS[type]
	const bytesPerComponent = COMPONENT_BYTES[componentType]
	const bytes = Buffer.alloc(values.length * components * bytesPerComponent)
	for (let row = 0; row < values.length; row++) {
		const rowValues = flatten(values[row])
		for (let col = 0; col < components; col++) {
			const at = (row * components + col) * bytesPerComponent
			const value = rowValues[col]
			if (componentType === 5126) bytes.writeFloatLE(value, at)
			else if (componentType === 5125) bytes.writeUInt32LE(value, at)
			else if (componentType === 5123) bytes.writeUInt16LE(value, at)
			else if (componentType === 5121) bytes.writeUInt8(value, at)
			else if (componentType === 5122) bytes.writeInt16LE(value, at)
			else if (componentType === 5120) bytes.writeInt8(value, at)
		}
	}
	const offset = appendBytes(targetBin.base, targetBin.pieces, bytes)
	const view = { buffer: 0, byteOffset: offset, byteLength: bytes.length }
	if (sourceAccessor._sourceView?.target !== undefined) view.target = sourceAccessor._sourceView.target
	json.bufferViews.push(view)
	const accessor = {
		bufferView: json.bufferViews.length - 1,
		byteOffset: 0,
		componentType,
		count: values.length,
		type,
	}
	if (sourceAccessor.normalized !== undefined) accessor.normalized = sourceAccessor.normalized
	if (sourceAccessor.min !== undefined || sourceAccessor.max !== undefined) {
		const mins = Array(components).fill(Infinity)
		const maxs = Array(components).fill(-Infinity)
		for (const row of values) {
			const rowValues = flatten(row)
			for (let col = 0; col < components; col++) {
				mins[col] = Math.min(mins[col], rowValues[col])
				maxs[col] = Math.max(maxs[col], rowValues[col])
			}
		}
		accessor.min = components === 1 ? [mins[0]] : mins
		accessor.max = components === 1 ? [maxs[0]] : maxs
	}
	json.accessors.push(accessor)
	return json.accessors.length - 1
}

function splitPrimitive(json, bin, primitive, targetBin) {
	if (primitive.indices === undefined) return [primitive]
	const indexAccessor = json.accessors[primitive.indices]
	if (!indexAccessor || indexAccessor.componentType !== 5125) return [primitive]
	if ((primitive.mode ?? 4) !== 4) throw new Error('Only TRIANGLES primitives can be partitioned')
	const indices = readAccessor(json, bin, primitive.indices)
	const attributeValues = new Map()
	for (const [semantic, accessorIndex] of Object.entries(primitive.attributes || {})) attributeValues.set(semantic, readAccessor(json, bin, accessorIndex))
	const sourceAccessors = new Map(Object.entries(primitive.attributes || {}).map(([semantic, accessorIndex]) => {
		const { accessor, view } = accessorView(json, accessorIndex)
		return [semantic, { ...accessor, _sourceView: view }]
	}))
	const parts = []
	let localIndices = []
	let localToOriginal = []
	let originalToLocal = new Map()
	const flush = () => {
		if (!localIndices.length) return
		const attrs = {}
		for (const [semantic, values] of attributeValues) attrs[semantic] = writeValues(json, targetBin, sourceAccessors.get(semantic), localToOriginal.map(index => values[index]), sourceAccessors.get(semantic).componentType, sourceAccessors.get(semantic).type)
		const indexValues = localIndices.slice()
		const indexAccessorNew = writeValues(json, targetBin, { componentType: 5123, type: 'SCALAR' }, indexValues, 5123, 'SCALAR')
		parts.push({ attributes: attrs, indices: indexAccessorNew, mode: 4, ...(primitive.material !== undefined ? { material: primitive.material } : {}) })
		localIndices = []
		localToOriginal = []
		originalToLocal = new Map()
	}
	for (let i = 0; i < indices.length; i += 3) {
		const triangle = indices.slice(i, i + 3)
		const needed = triangle.filter(index => !originalToLocal.has(index)).length
		if (localToOriginal.length && localToOriginal.length + needed > MAX_PART_VERTICES) flush()
		for (const originalIndex of triangle) {
			let localIndex = originalToLocal.get(originalIndex)
			if (localIndex === undefined) {
				localIndex = localToOriginal.length
				originalToLocal.set(originalIndex, localIndex)
				localToOriginal.push(originalIndex)
			}
			localIndices.push(localIndex)
		}
	}
	flush()
	return parts
}

/**
 * Partition 32-bit indexed Meshy primitives into PowerPoint-safe 16-bit parts.
 * @param {Buffer} glb
 * @returns {{glb: Buffer, before: object, after: object, parts: number, converted: number}}
 */
export function makePowerPointSafeGlb(glb) {
	const { json, bin } = parseGlb(glb)
	const pieces = []
	const targetBin = { base: bin, pieces }
	const before = { meshes: json.meshes.length, uint32Primitives: 0, nodes: json.nodes.length }
	const replacements = []
	for (let meshIndex = 0; meshIndex < json.meshes.length; meshIndex++) {
		const mesh = json.meshes[meshIndex]
		const primitiveParts = []
		let converted = false
		for (const primitive of mesh.primitives || []) {
			if (primitive.indices !== undefined && json.accessors[primitive.indices]?.componentType === 5125) {
				before.uint32Primitives++
				converted = true
			}
			primitiveParts.push(...splitPrimitive(json, bin, primitive, targetBin))
		}
		if (converted) replacements.push({ meshIndex, mesh, primitiveParts })
	}
	if (!replacements.length) return { glb: Buffer.from(glb), before, after: { meshes: json.meshes.length, uint32Primitives: 0, nodes: json.nodes.length }, parts: 0, converted: 0 }

	const newMeshIndices = new Map()
	let parts = 0
	for (const { meshIndex, mesh, primitiveParts } of replacements) {
		if (!primitiveParts.length) throw new Error(`Mesh ${meshIndex} produced no PowerPoint-safe primitives`)
		json.meshes[meshIndex] = { ...mesh, primitives: [primitiveParts[0]] }
		const indices = [meshIndex]
		for (let i = 1; i < primitiveParts.length; i++) {
			indices.push(json.meshes.length)
			json.meshes.push({ ...mesh, name: `${mesh.name || `Mesh${meshIndex}`}_pp_${i}`, primitives: [primitiveParts[i]] })
		}
		newMeshIndices.set(meshIndex, indices)
		parts += primitiveParts.length
	}

	for (const node of json.nodes) {
		if (node.mesh === undefined || !newMeshIndices.has(node.mesh)) continue
		const meshIndices = newMeshIndices.get(node.mesh)
		const newNodeIndices = []
		for (let i = 1; i < meshIndices.length; i++) {
			const clone = { ...node, name: `${node.name || 'Mesh'}_pp_${i}`, mesh: meshIndices[i] }
			delete clone.children
			json.nodes.push(clone)
			newNodeIndices.push(json.nodes.length - 1)
		}
		const originalNodeIndex = json.nodes.indexOf(node)
		if (newNodeIndices.length) {
			for (const parent of json.nodes) if (Array.isArray(parent.children)) {
				const at = parent.children.indexOf(originalNodeIndex)
				if (at >= 0) parent.children.splice(at + 1, 0, ...newNodeIndices)
			}
			for (const scene of json.scenes || []) {
				const at = (scene.nodes || []).indexOf(originalNodeIndex)
				if (at >= 0) scene.nodes.splice(at + 1, 0, ...newNodeIndices)
			}
		}
	}

	const finalBin = pieces.length ? Buffer.concat([bin, ...pieces]) : bin
	json.buffers = json.buffers || [{ byteLength: finalBin.length }]
	json.buffers[0].byteLength = finalBin.length
	delete json.buffers[0].uri
	const after = { meshes: json.meshes.length, uint32Primitives: 0, nodes: json.nodes.length }
	for (const mesh of json.meshes) for (const primitive of mesh.primitives || []) if (primitive.indices !== undefined && json.accessors[primitive.indices]?.componentType === 5125) after.uint32Primitives++
	return { glb: serializeGlb(json, finalBin), before, after, parts, converted: before.uint32Primitives - after.uint32Primitives }
}

function reducePrimitive(json, bin, primitive, targetBin, targetTriangles) {
	if (primitive.indices === undefined || (primitive.mode ?? 4) !== 4) return primitive
	const sourceIndices = readAccessor(json, bin, primitive.indices)
	const triangleCount = Math.floor(sourceIndices.length / 3)
	if (triangleCount <= targetTriangles) return primitive
	const picked = []
	const take = Math.max(1, Math.floor(targetTriangles))
	for (let i = 0; i < take; i++) {
		const sourceTriangle = Math.min(triangleCount - 1, Math.floor(i * triangleCount / take))
		picked.push(sourceIndices[sourceTriangle * 3], sourceIndices[sourceTriangle * 3 + 1], sourceIndices[sourceTriangle * 3 + 2])
	}
	const attributeValues = new Map()
	const sourceAccessors = new Map()
	for (const [semantic, accessorIndex] of Object.entries(primitive.attributes || {})) {
		attributeValues.set(semantic, readAccessor(json, bin, accessorIndex))
		const { accessor, view } = accessorView(json, accessorIndex)
		sourceAccessors.set(semantic, { ...accessor, _sourceView: view })
	}
	const localToOriginal = []
	const originalToLocal = new Map()
	const localIndices = []
	for (const originalIndex of picked) {
		let localIndex = originalToLocal.get(originalIndex)
		if (localIndex === undefined) {
			localIndex = localToOriginal.length
			originalToLocal.set(originalIndex, localIndex)
			localToOriginal.push(originalIndex)
		}
		localIndices.push(localIndex)
	}
	const attributes = {}
	for (const [semantic, values] of attributeValues) {
		const sourceAccessor = sourceAccessors.get(semantic)
		attributes[semantic] = writeValues(json, targetBin, sourceAccessor, localToOriginal.map(index => values[index]), sourceAccessor.componentType, sourceAccessor.type)
	}
	const indices = writeValues(json, targetBin, { componentType: 5125, type: 'SCALAR' }, localIndices, 5125, 'SCALAR')
	return { attributes, indices, mode: 4, ...(primitive.material !== undefined ? { material: primitive.material } : {}) }
}

/**
 * Diagnostic/PowerPoint-lite geometry reduction. This deliberately keeps
 * the original skin, UVs, material, images, and animation tables; only the
 * indexed triangle selection is reduced before the 16-bit partition gate.
 * @param {Buffer} glb
 * @param {number} targetTrianglesPerPrimitive
 */
export function reduceGlbTriangles(glb, targetTrianglesPerPrimitive = 40000) {
	const { json, bin } = parseGlb(glb)
	const pieces = []
	const targetBin = { base: bin, pieces }
	let reduced = 0
	let beforeTriangles = 0
	let afterTriangles = 0
	for (const mesh of json.meshes || []) for (const primitive of mesh.primitives || []) {
		const count = primitive.indices === undefined ? 0 : readAccessor(json, bin, primitive.indices).length / 3
		beforeTriangles += count
		if (count > targetTrianglesPerPrimitive) {
			const replacement = reducePrimitive(json, bin, primitive, targetBin, targetTrianglesPerPrimitive)
			primitive.attributes = replacement.attributes
			primitive.indices = replacement.indices
			primitive.mode = replacement.mode
			if (replacement.material !== undefined) primitive.material = replacement.material
			reduced++
			afterTriangles += targetTrianglesPerPrimitive
		} else afterTriangles += count
	}
	const finalBin = pieces.length ? Buffer.concat([bin, ...pieces]) : bin
	json.buffers = json.buffers || [{ byteLength: finalBin.length }]
	json.buffers[0].byteLength = finalBin.length
	delete json.buffers[0].uri
	return { glb: serializeGlb(json, finalBin), targetTrianglesPerPrimitive, beforeTriangles, afterTriangles, reduced }
}

/**
 * Diagnostic material normalization matching the proven Mixamo deck shape.
 * Optional Meshy material extensions are removed only in this probe variant;
 * the source and canonical-bridge artifacts remain texture-preserving.
 */
export function normalizePowerPointMaterials(glb) {
	const { json, bin } = parseGlb(glb)
	for (const mesh of json.meshes || []) for (const primitive of mesh.primitives || []) primitive.mode = primitive.mode ?? 4
	for (const material of json.materials || []) {
		material.alphaMode = material.alphaMode || 'OPAQUE'
		material.doubleSided = material.doubleSided ?? true
		material.pbrMetallicRoughness = material.pbrMetallicRoughness || {}
		const pbr = material.pbrMetallicRoughness
		pbr.baseColorFactor = pbr.baseColorFactor || [1, 1, 1, 1]
		pbr.metallicFactor = 0
		pbr.roughnessFactor = 1
		delete pbr.metallicRoughnessTexture
		if (pbr.baseColorTexture) pbr.baseColorTexture.index = 0
		delete material.extensions
	}
	if (Array.isArray(json.textures) && json.textures.length) {
		json.textures = [json.textures[0]]
		for (const material of json.materials || []) if (material.pbrMetallicRoughness?.baseColorTexture) material.pbrMetallicRoughness.baseColorTexture.index = 0
	}
	if (Array.isArray(json.extensionsUsed)) json.extensionsUsed = json.extensionsUsed.filter(name => !name.startsWith('KHR_materials_'))
	if (Array.isArray(json.extensionsRequired)) json.extensionsRequired = json.extensionsRequired.filter(name => !name.startsWith('KHR_materials_'))
	return serializeGlb(json, bin)
}

/**
 * Diagnostic static-mesh probe. Remove the data that makes a GLB a skinned,
 * animated asset while retaining the Meshy vertex positions, normals, UVs,
 * indices, material, and embedded image. This isolates Office's static GLB
 * geometry/material path from skeleton and animation compatibility.
 */
export function stripSkeletalAnimation(glb) {
	const { json, bin } = parseGlb(glb)
	for (const mesh of json.meshes || []) {
		for (const primitive of mesh.primitives || []) {
			if (primitive.attributes) {
				delete primitive.attributes.JOINTS_0
				delete primitive.attributes.WEIGHTS_0
			}
		}
	}
	for (const node of json.nodes || []) delete node.skin
	delete json.skins
	delete json.animations
	if (Array.isArray(json.extensionsUsed)) json.extensionsUsed = json.extensionsUsed.filter(name => name !== 'KHR_animation_pointer')
	if (Array.isArray(json.extensionsRequired)) json.extensionsRequired = json.extensionsRequired.filter(name => name !== 'KHR_animation_pointer')
	return serializeGlb(json, bin)
}

/** Remove image/texture references for a flat-color compatibility probe. */
export function stripTextureMaps(glb) {
	const { json, bin } = parseGlb(glb)
	for (const material of json.materials || []) {
		const pbr = material.pbrMetallicRoughness
		if (pbr) delete pbr.baseColorTexture
		delete material.normalTexture
		delete material.occlusionTexture
		delete material.emissiveTexture
		material.emissiveFactor = material.emissiveFactor || [0, 0, 0]
	}
	delete json.images
	delete json.textures
	delete json.samplers
	return serializeGlb(json, bin)
}

/** Expand indexed triangle primitives into a non-indexed vertex stream. */
export function makeNonIndexedGlb(glb) {
	const { json, bin } = parseGlb(glb)
	const pieces = []
	const targetBin = { base: bin, pieces }
	for (const mesh of json.meshes || []) {
		for (const primitive of mesh.primitives || []) {
			if (primitive.indices === undefined || (primitive.mode ?? 4) !== 4) continue
			const indices = readAccessor(json, bin, primitive.indices)
			const attrs = {}
			for (const [semantic, accessorIndex] of Object.entries(primitive.attributes || {})) {
				const values = readAccessor(json, bin, accessorIndex)
				const { accessor, view } = accessorView(json, accessorIndex)
				const expanded = indices.map(index => values[index])
				attrs[semantic] = writeValues(json, targetBin, { ...accessor, _sourceView: view }, expanded, accessor.componentType, accessor.type)
			}
			primitive.attributes = attrs
			delete primitive.indices
			primitive.mode = 4
		}
	}
	const finalBin = pieces.length ? Buffer.concat([bin, ...pieces]) : bin
	json.buffers = json.buffers || [{ byteLength: finalBin.length }]
	json.buffers[0].byteLength = finalBin.length
	delete json.buffers[0].uri
	return serializeGlb(json, finalBin)
}
