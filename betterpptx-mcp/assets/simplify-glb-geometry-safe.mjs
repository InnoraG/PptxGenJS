import { NodeIO } from '@gltf-transform/core'
import { simplify } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'

/**
 * Reduce indexed glTF geometry while retaining the skin, animation, material,
 * and texture graph. The output is intentionally uncompressed so PowerPoint
 * receives ordinary indexed primitives rather than a meshopt or Draco stream.
 */
export async function simplifyGlbGeometrySafeBuffer(sourceBuffer, {
	ratio = 0.25,
	error = 1,
	lockBorder = false,
} = {}) {
	const source = Buffer.isBuffer(sourceBuffer) ? sourceBuffer : Buffer.from(sourceBuffer)
	const io = new NodeIO()
	const document = await io.readBinary(source)
	await document.transform(simplify({
		simplifier: MeshoptSimplifier,
		ratio: Math.max(0.05, Math.min(1, Number(ratio))),
		error: Math.max(0, Number(error)),
		lockBorder: Boolean(lockBorder),
	}))
	return Buffer.from(await io.writeBinary(document))
}
