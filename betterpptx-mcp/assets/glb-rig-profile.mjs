import { parseGlb, serializeGlb } from '../ir/kinetic-transplant.mjs'

const MIXAMO_NAME = /^mixamorig\d*:(.+)$/

/**
 * Canonicalize Mixamo namespace digits as a metadata-only edit.
 *
 * glTF skinning is index based, so node names can be normalized without
 * touching joints, weights, inverse-bind matrices, node transforms, meshes, or
 * the BIN chunk.  Collision detection makes the operation fail closed.
 */
export function canonicalizeMixamoBoneNames(buffer) {
	const { json, bin } = parseGlb(buffer)
	const targets = new Map()
	let changed = 0
	for (const [index, node] of (json.nodes || []).entries()) {
		const match = String(node.name || '').match(MIXAMO_NAME)
		if (!match) continue
		const canonical = `mixamorig:${match[1]}`
		const previous = targets.get(canonical)
		if (previous !== undefined && previous !== index) {
			throw new Error(`glb-rig-profile: Mixamo name collision ${canonical} at nodes ${previous} and ${index}`)
		}
		targets.set(canonical, index)
		if (node.name !== canonical) {
			node.name = canonical
			changed++
		}
	}
	return { buffer: serializeGlb(json, bin), changed, canonicalBoneCount: targets.size }
}
