// Small, provider-neutral glTF material profile helpers.
// This operates on the embedded JSON chunk only; mesh, skin, textures, nodes,
// and animation accessors remain byte-for-byte untouched.

const GLB_MAGIC = 0x46546c67 // glTF
const CHUNK_JSON = 0x4e4f534a // JSON
const CHUNK_BIN = 0x004e4942 // BIN\0

function parseGlb(buffer) {
	const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
	if (source.length < 12 || source.readUInt32LE(0) !== GLB_MAGIC) throw new Error('material-profile: invalid GLB')
	let offset = 12
	let json = null
	let bin = Buffer.alloc(0)
	while (offset + 8 <= source.length) {
		const length = source.readUInt32LE(offset)
		const type = source.readUInt32LE(offset + 4)
		const data = source.subarray(offset + 8, offset + 8 + length)
		if (type === CHUNK_JSON) json = JSON.parse(data.toString('utf8'))
		if (type === CHUNK_BIN) bin = Buffer.from(data)
		offset += 8 + length
	}
	if (!json) throw new Error('material-profile: GLB has no JSON chunk')
	return { json, bin }
}

function serializeGlb(json, bin) {
	let jsonBytes = Buffer.from(JSON.stringify(json), 'utf8')
	if (jsonBytes.length % 4) jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(4 - (jsonBytes.length % 4), 0x20)])
	let binBytes = Buffer.from(bin || [])
	if (binBytes.length % 4) binBytes = Buffer.concat([binBytes, Buffer.alloc(4 - (binBytes.length % 4))])
	const total = 12 + 8 + jsonBytes.length + 8 + binBytes.length
	const output = Buffer.alloc(total)
	output.writeUInt32LE(GLB_MAGIC, 0)
	output.writeUInt32LE(2, 4)
	output.writeUInt32LE(total, 8)
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

/**
 * Make a fallback presenter visually matte while preserving its authored
 * textures, UVs, alpha mode, normals, mesh, skin, skeleton, and animations.
 */
export function applyMatteMaterialProfile(buffer) {
	const { json, bin } = parseGlb(buffer)
	let changed = 0
	for (const material of json.materials || []) {
		material.pbrMetallicRoughness ||= {}
		const pbr = material.pbrMetallicRoughness
		if (pbr.metallicFactor !== 0) changed++
		if (pbr.roughnessFactor !== 1) changed++
		pbr.metallicFactor = 0
		pbr.roughnessFactor = 1
		// A metallic/roughness texture still modulates the scalar factors. Louise's
		// imported texture is named "Glossiness" and contains dark roughness values,
		// so roughnessFactor=1 alone still renders the suit as polished plastic in
		// PowerPoint. Keep the authored base-colour/normal textures, but disconnect
		// this material-response map for the governed matte fallback.
		if (pbr.metallicRoughnessTexture) {
			delete pbr.metallicRoughnessTexture
			changed++
		}
		if (material.extensions?.KHR_materials_specular) {
			delete material.extensions.KHR_materials_specular
			changed++
			if (!Object.keys(material.extensions).length) delete material.extensions
		}
	}
	return { buffer: serializeGlb(json, bin), changed, materialCount: (json.materials || []).length }
}

/**
 * Translate a legacy Mixamo/FBX specular-gloss material to glTF's
 * metallic-roughness model without treating the gloss map as metalness.
 *
 * Blender's FBX importer can connect a texture named "Glossiness" to the
 * glTF metallic/roughness slot.  PowerPoint then reads the blue channel as
 * metalness and the green channel as roughness, which turns cloth into shiny
 * plastic.  Mixamo characters are ordinary dielectrics, so metalness must be
 * zero.  Disconnecting the misclassified map and using high roughness matches
 * the original Mixamo viewport while leaving colour, alpha, normals, geometry,
 * skinning, skeleton, and animations untouched.
 *
 * `keepSourceSpecular` retains a valid low-intensity specular texture for a
 * slightly softer, source-aware result.  The strict matte variant removes the
 * extension so PowerPoint cannot amplify it differently across versions.
 */
export function applyMixamoNonMetalMaterialProfile(buffer, { keepSourceSpecular = true } = {}) {
	const { json, bin } = parseGlb(buffer)
	let changed = 0
	for (const material of json.materials || []) {
		material.pbrMetallicRoughness ||= {}
		const pbr = material.pbrMetallicRoughness
		if (pbr.metallicFactor !== 0) changed++
		if (pbr.roughnessFactor !== 1) changed++
		pbr.metallicFactor = 0
		pbr.roughnessFactor = 1
		if (pbr.metallicRoughnessTexture) {
			delete pbr.metallicRoughnessTexture
			changed++
		}

		const specular = material.extensions?.KHR_materials_specular
		if (!keepSourceSpecular && specular) {
			delete material.extensions.KHR_materials_specular
			changed++
			if (!Object.keys(material.extensions).length) delete material.extensions
		} else if (specular?.specularColorFactor) {
			const clamped = specular.specularColorFactor.map(value => Math.max(0, Math.min(1, Number(value))))
			if (JSON.stringify(clamped) !== JSON.stringify(specular.specularColorFactor)) changed++
			specular.specularColorFactor = clamped
		}
	}
	return {
		buffer: serializeGlb(json, bin),
		changed,
		materialCount: (json.materials || []).length,
		keepSourceSpecular,
	}
}

/**
 * Apply a uniform cast-height correction above every authored scene root.
 * The wrapper preserves all existing mesh, armature, bone, skin, and animation
 * transforms exactly; only the presenter's overall world-space size changes.
 */
export function applyUniformSceneScale(buffer, factor, { rootName = 'PresenterScaleRoot' } = {}) {
	const uniform = Number(factor)
	if (!Number.isFinite(uniform) || uniform <= 0) throw new Error(`material-profile: invalid uniform scene scale ${factor}`)
	const { json, bin } = parseGlb(buffer)
	json.nodes ||= []
	json.scenes ||= []
	const sceneIndexes = Number.isInteger(json.scene)
		? [json.scene]
		: json.scenes.map((_, index) => index)
	let changed = 0
	for (const sceneIndex of sceneIndexes) {
		const scene = json.scenes[sceneIndex]
		const roots = Array.isArray(scene?.nodes) ? [...scene.nodes] : []
		if (!roots.length) continue
		const wrapperIndex = json.nodes.length
		json.nodes.push({ name: rootName, scale: [uniform, uniform, uniform], children: roots })
		scene.nodes = [wrapperIndex]
		changed++
	}
	return { buffer: serializeGlb(json, bin), factor: uniform, changed }
}

export function inspectMaterialProfile(buffer) {
	const { json } = parseGlb(buffer)
	return (json.materials || []).map(material => ({
		name: material.name || null,
		metallicFactor: material.pbrMetallicRoughness?.metallicFactor ?? 0,
		roughnessFactor: material.pbrMetallicRoughness?.roughnessFactor ?? 1,
		hasMetallicRoughnessTexture: Boolean(material.pbrMetallicRoughness?.metallicRoughnessTexture),
		hasSpecularExtension: Boolean(material.extensions?.KHR_materials_specular),
		hasSpecularTexture: Boolean(material.extensions?.KHR_materials_specular?.specularTexture),
		specularFactor: material.extensions?.KHR_materials_specular?.specularFactor ?? null,
		specularColorFactor: material.extensions?.KHR_materials_specular?.specularColorFactor ?? null,
		alphaMode: material.alphaMode || 'OPAQUE',
	}))
}
