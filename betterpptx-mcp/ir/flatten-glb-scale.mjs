// Pure-GLB version of the worker's Blender flatten_scale gate.
// It removes a uniform root scale (Meshy exports Armature at 0.01) and bakes
// that scale into geometry, skeleton translations, inverse-bind matrices, and
// animation translation tracks so PowerPoint's raw-bbox framing agrees with
// the rendered model.

const MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }

function parse(buffer) {
	const b = Buffer.from(buffer)
	if (b.readUInt32LE(0) !== MAGIC || b.readUInt32LE(4) !== 2) throw new Error('Expected glTF 2.0 GLB')
	let p = 12
	let json
	let bin = Buffer.alloc(0)
	while (p + 8 <= b.length) {
		const n = b.readUInt32LE(p)
		const type = b.readUInt32LE(p + 4)
		const chunk = b.subarray(p + 8, p + 8 + n)
		if (type === JSON_CHUNK) json = JSON.parse(chunk.toString('utf8').trim())
		if (type === BIN_CHUNK) bin = Buffer.from(chunk)
		p += 8 + n
	}
	return { json, bin }
}

function serialize(json, bin) {
	let j = Buffer.from(JSON.stringify(json), 'utf8')
	if (j.length % 4) j = Buffer.concat([j, Buffer.alloc(4 - (j.length % 4), 0x20)])
	let b = Buffer.from(bin)
	if (b.length % 4) b = Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))])
	const out = Buffer.alloc(12 + 8 + j.length + 8 + b.length)
	out.writeUInt32LE(MAGIC, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8)
	let p = 12
	out.writeUInt32LE(j.length, p); out.writeUInt32LE(JSON_CHUNK, p + 4); j.copy(out, p + 8); p += 8 + j.length
	out.writeUInt32LE(b.length, p); out.writeUInt32LE(BIN_CHUNK, p + 4); b.copy(out, p + 8)
	return out
}

function view(json, accessorIndex) {
	const accessor = json.accessors[accessorIndex]
	const bufferView = json.bufferViews[accessor.bufferView]
	return { accessor, bufferView, start: (bufferView.byteOffset || 0) + (accessor.byteOffset || 0) }
}

function read(json, bin, accessorIndex) {
	const { accessor, bufferView, start } = view(json, accessorIndex)
	const components = TYPE_COMPONENTS[accessor.type]
	const componentBytes = accessor.componentType === 5126 ? 4 : accessor.componentType === 5125 ? 4 : accessor.componentType === 5123 ? 2 : 1
	const stride = bufferView.byteStride || components * componentBytes
	const result = []
	for (let row = 0; row < accessor.count; row++) {
		const values = []
		for (let col = 0; col < components; col++) {
			const at = start + row * stride + col * componentBytes
			if (accessor.componentType === 5126) values.push(bin.readFloatLE(at))
			else if (accessor.componentType === 5125) values.push(bin.readUInt32LE(at))
			else if (accessor.componentType === 5123) values.push(bin.readUInt16LE(at))
			else values.push(bin.readUInt8(at))
		}
		result.push(components === 1 ? values[0] : values)
	}
	return result
}

function writeInPlace(json, bin, accessorIndex, values) {
	const { accessor, bufferView, start } = view(json, accessorIndex)
	const components = TYPE_COMPONENTS[accessor.type]
	const componentBytes = accessor.componentType === 5126 ? 4 : accessor.componentType === 5125 ? 4 : accessor.componentType === 5123 ? 2 : 1
	const stride = bufferView.byteStride || components * componentBytes
	for (let row = 0; row < values.length; row++) {
		const rowValues = Array.isArray(values[row]) ? values[row] : [values[row]]
		for (let col = 0; col < components; col++) {
			const at = start + row * stride + col * componentBytes
			const value = rowValues[col]
			if (accessor.componentType === 5126) bin.writeFloatLE(value, at)
			else if (accessor.componentType === 5125) bin.writeUInt32LE(value, at)
			else if (accessor.componentType === 5123) bin.writeUInt16LE(value, at)
			else bin.writeUInt8(value, at)
		}
	}
}

function descendants(json, roots) {
	const seen = new Set()
	const visit = index => {
		if (seen.has(index)) return
		seen.add(index)
		for (const child of json.nodes[index]?.children || []) visit(child)
	}
	for (const root of roots) visit(root)
	return seen
}

/**
 * Bake a uniform root scale into a Meshy-like GLB.
 * @param {Buffer} glb
 * @returns {{glb: Buffer, scale: number, roots: number[], meshNodes: number[], animationsScaled: number}}
 */
export function flattenGlbRootScale(glb) {
	const { json, bin } = parse(glb)
	const parented = new Set((json.nodes || []).flatMap(node => node.children || []))
	const roots = []
	for (let i = 0; i < json.nodes.length; i++) if (!parented.has(i) && json.nodes[i].scale) roots.push(i)
	const root = roots.find(index => {
		const s = json.nodes[index].scale
		return s && Math.abs(s[0] - s[1]) < 1e-6 && Math.abs(s[1] - s[2]) < 1e-6 && Math.abs(s[0] - 1) > 1e-6
	})
	if (root === undefined) return { glb: Buffer.from(glb), scale: 1, roots: [], meshNodes: [], animationsScaled: 0 }
	const scale = json.nodes[root].scale[0]
	const nodes = descendants(json, [root])
	const meshNodes = [...nodes].filter(index => json.nodes[index]?.mesh !== undefined)
	const scaledAccessors = new Set()
	for (const nodeIndex of meshNodes) {
		const mesh = json.meshes[json.nodes[nodeIndex].mesh]
		for (const primitive of mesh?.primitives || []) {
			const position = primitive.attributes?.POSITION
			if (position === undefined || scaledAccessors.has(position)) continue
			const values = read(json, bin, position).map(row => row.map(value => value * scale))
			writeInPlace(json, bin, position, values)
			if (json.accessors[position].min) json.accessors[position].min = json.accessors[position].min.map(value => value * scale)
			if (json.accessors[position].max) json.accessors[position].max = json.accessors[position].max.map(value => value * scale)
			scaledAccessors.add(position)
		}
	}
	for (const nodeIndex of nodes) {
		const node = json.nodes[nodeIndex]
		if (node.translation) node.translation = node.translation.map(value => value * scale)
	}
	json.nodes[root].scale = [1, 1, 1]

	let inverseBindScaled = 0
	for (const skin of json.skins || []) {
		if (skin.inverseBindMatrices === undefined) continue
		const accessor = json.accessors[skin.inverseBindMatrices]
		if (accessor.type !== 'MAT4' || accessor.componentType !== 5126) continue
		const matrices = read(json, bin, skin.inverseBindMatrices)
		const scaled = matrices.map(matrix => {
			const out = matrix.slice()
			// glTF matrices are column-major. Right-multiplying by inverse scale
			// scales columns 0..2, matching a mesh-space scale bake.
			for (let i = 0; i < 12; i++) out[i] /= scale
			return out
		})
		writeInPlace(json, bin, skin.inverseBindMatrices, scaled)
		inverseBindScaled++
	}
	let animationsScaled = 0
	for (const animation of json.animations || []) for (const sampler of animation.samplers || []) {
		// The channel target is needed to know whether the output is a node translation.
		for (const channel of animation.channels || []) {
			if (channel.sampler !== animation.samplers.indexOf(sampler) || channel.target.path !== 'translation') continue
			if (!nodes.has(channel.target.node)) continue
			const output = read(json, bin, sampler.output).map(row => Array.isArray(row) ? row.map(value => value * scale) : row * scale)
			writeInPlace(json, bin, sampler.output, output)
			animationsScaled++
		}
	}
	return { glb: serialize(json, bin), scale, roots: [root], meshNodes, inverseBindScaled, animationsScaled }
}

