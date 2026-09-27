// Pure-GLB equivalent of the worker's normalize_scale gate.
// PowerPoint's 3D camera is sensitive to the raw mesh bbox versus the node
// scale. The existing worker targets a 100-unit world height and centers the
// scene before embedding it; this module applies that same scene-root wrapper
// without touching geometry, materials, skinning, or animation accessors.

const MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

function parse(buffer) {
	const b = Buffer.from(buffer)
	if (b.readUInt32LE(0) !== MAGIC || b.readUInt32LE(4) !== 2) throw new Error('Expected glTF 2.0 GLB')
	let p = 12; let json; let bin = Buffer.alloc(0)
	while (p + 8 <= b.length) {
		const n = b.readUInt32LE(p); const type = b.readUInt32LE(p + 4); const chunk = b.subarray(p + 8, p + 8 + n)
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

function multiply(a, b) {
	const out = Array(16).fill(0)
	for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) for (let k = 0; k < 4; k++) out[row * 4 + col] += a[row * 4 + k] * b[k * 4 + col]
	return out
}

function apply(m, v) {
	return [
		m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3],
		m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7],
		m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11],
	]
}

function nodeMatrix(node) {
	if (node.matrix) {
		const m = node.matrix
		return [m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14], m[3], m[7], m[11], m[15]]
	}
	const [x, y, z, w] = node.rotation || [0, 0, 0, 1]
	const [sx, sy, sz] = node.scale || [1, 1, 1]
	const q = [
		1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
		2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
		2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
	]
	const t = node.translation || [0, 0, 0]
	return [q[0] * sx, q[1] * sy, q[2] * sz, t[0], q[3] * sx, q[4] * sy, q[5] * sz, t[1], q[6] * sx, q[7] * sy, q[8] * sz, t[2], 0, 0, 0, 1]
}

function accessorMinMax(json, index) {
	const accessor = json.accessors[index]
	if (!accessor?.min || !accessor?.max) throw new Error(`POSITION accessor ${index} has no min/max`)
	return [accessor.min, accessor.max]
}

/**
 * Add a centered PowerPoint framing root.
 * @param {Buffer} glb
 * @param {number} targetHeight
 * @returns {{glb: Buffer, scale: number, height: number, center: number[]}}
 */
export function normalizeGlbScale(glb, targetHeight = 100) {
	const { json, bin } = parse(glb)
	const scene = json.scenes?.[json.scene || 0]
	if (!scene) throw new Error('GLB has no active scene')
	const lo = [Infinity, Infinity, Infinity]
	const hi = [-Infinity, -Infinity, -Infinity]
	let found = false
	const visit = (nodeIndex, parent) => {
		const node = json.nodes[nodeIndex]
		const world = multiply(parent, nodeMatrix(node))
		if (node.mesh !== undefined) for (const primitive of json.meshes[node.mesh]?.primitives || []) {
			const position = primitive.attributes?.POSITION
			if (position === undefined) continue
			const [mn, mx] = accessorMinMax(json, position)
			for (const x of [mn[0], mx[0]]) for (const y of [mn[1], mx[1]]) for (const z of [mn[2], mx[2]]) {
				const v = apply(world, [x, y, z])
				for (let axis = 0; axis < 3; axis++) { lo[axis] = Math.min(lo[axis], v[axis]); hi[axis] = Math.max(hi[axis], v[axis]) }
				found = true
			}
		}
		for (const child of node.children || []) visit(child, world)
	}
	for (const root of scene.nodes || []) visit(root, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
	if (!found) return { glb: Buffer.from(glb), scale: 1, height: 0, center: [0, 0, 0] }
	const height = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
	const center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2]
	const scale = targetHeight / (height || 1)
	const root = { name: 'PowerPointFrameRoot', scale: [scale, scale, scale], translation: center.map(value => -scale * value), children: [...(scene.nodes || [])] }
	json.nodes.push(root)
	scene.nodes = [json.nodes.length - 1]
	return { glb: serialize(json, bin), scale, height, center }
}

