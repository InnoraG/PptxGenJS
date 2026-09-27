import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { NodeIO } from '@gltf-transform/core'
import { dedup, prune, textureCompress } from '@gltf-transform/functions'
import sharp from 'sharp'
import { makePowerPointSafeGlb } from './powerpoint-safe-glb.mjs'

const CANONICAL_CLIPMAP_URL = new URL('../deploy/model3d-worker/canonical/canonical-clipmap.json', import.meta.url)
const CANONICAL = JSON.parse(readFileSync(CANONICAL_CLIPMAP_URL, 'utf8'))

export const MESHY_TO_MIXAMO_JOINT = Object.freeze({
	Hips: 'mixamorig:Hips',
	Spine02: 'mixamorig:Spine',
	Spine01: 'mixamorig:Spine1',
	Spine: 'mixamorig:Spine2',
	neck: 'mixamorig:Neck',
	Head: 'mixamorig:Head',
	head_end: 'mixamorig:Head',
	headfront: 'mixamorig:Head',
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

export const MESHY_MIXAMO_CONTRACT = Object.freeze({
	version: 'meshy-mixamo-hybrid.v1',
	canonicalSkeletonVersion: String(CANONICAL.canonicalSkeletonVersion),
	clipNames: Object.freeze([...CANONICAL.clipNames]),
	clipMap: Object.freeze({ ...CANONICAL.clipMap }),
	jointCount: 65,
	maxAnimationCount: 18,
	minHeightMeters: 1.2,
	maxHeightMeters: 2.4,
})

// Measured apex times from the proven 18-clip PowerPoint presenter library. Durations are read
// directly from the frozen animation accessors, so any payload drift is visible in the manifest.
const CONTACT_MS_BY_ANIM_ID = Object.freeze([3602, 2021, 507, 926, 12411, 3302, 681, 794, 723, 2726, 521, 995, 1628, 819, 693, 1702, 798, 1092])

export class MeshyMixamoHybridError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'MeshyMixamoHybridError'
		this.code = code
		this.details = details
	}
}

function fail(code, message, details = {}) {
	throw new MeshyMixamoHybridError(code, message, details)
}

function sha256(bytes) {
	return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function exactArray(actual, expected) {
	return actual.length === expected.length && actual.every((value, index) => value === expected[index])
}

function computeBounds(root) {
	const min = [Infinity, Infinity, Infinity]
	const max = [-Infinity, -Infinity, -Infinity]
	let vertices = 0
	let primitives = 0
	for (const mesh of root.listMeshes()) {
		for (const primitive of mesh.listPrimitives()) {
			const position = primitive.getAttribute('POSITION')
			if (!position) continue
			const values = position.getArray()
			vertices += position.getCount()
			primitives++
			for (let i = 0; i < values.length; i += 3) {
				for (let axis = 0; axis < 3; axis++) {
					min[axis] = Math.min(min[axis], values[i + axis])
					max[axis] = Math.max(max[axis], values[i + axis])
				}
			}
		}
	}
	if (!vertices) fail('MESHY_GEOMETRY_REQUIRED', 'The Meshy GLB contains no position geometry.')
	return { min, max, size: max.map((value, axis) => value - min[axis]), vertices, primitives }
}

function copyAccessor(targetDoc, sourceAccessor, name, arrayOverride = null) {
	const sourceArray = arrayOverride || sourceAccessor.getArray()
	if (!sourceArray) fail('MESHY_ACCESSOR_REQUIRED', `The ${name} accessor has no data.`)
	const target = targetDoc.createAccessor(name).setType(sourceAccessor.getType()).setArray(sourceArray.slice())
	if (typeof sourceAccessor.getNormalized === 'function' && typeof target.setNormalized === 'function') {
		target.setNormalized(sourceAccessor.getNormalized())
	}
	return target
}

// glTF matrices are column-major. The Meshy vertices stay in their original visible rest pose;
// the bind basis is adjusted so that each mapped Mixamo joint reproduces the source skin's rest
// transform before the proven Mixamo clip library begins driving the target skeleton.
function mat4Multiply(a, b) {
	const out = new Float32Array(16)
	for (let column = 0; column < 4; column++) {
		for (let row = 0; row < 4; row++) {
			out[column * 4 + row] = a[row] * b[column * 4]
				+ a[4 + row] * b[column * 4 + 1]
				+ a[8 + row] * b[column * 4 + 2]
				+ a[12 + row] * b[column * 4 + 3]
		}
	}
	return out
}

function mat4Invert(matrix) {
	const a00 = matrix[0], a01 = matrix[1], a02 = matrix[2], a03 = matrix[3]
	const a10 = matrix[4], a11 = matrix[5], a12 = matrix[6], a13 = matrix[7]
	const a20 = matrix[8], a21 = matrix[9], a22 = matrix[10], a23 = matrix[11]
	const a30 = matrix[12], a31 = matrix[13], a32 = matrix[14], a33 = matrix[15]
	const b00 = a00 * a11 - a01 * a10
	const b01 = a00 * a12 - a02 * a10
	const b02 = a00 * a13 - a03 * a10
	const b03 = a01 * a12 - a02 * a11
	const b04 = a01 * a13 - a03 * a11
	const b05 = a02 * a13 - a03 * a12
	const b06 = a20 * a31 - a21 * a30
	const b07 = a20 * a32 - a22 * a30
	const b08 = a20 * a33 - a23 * a30
	const b09 = a21 * a32 - a22 * a31
	const b10 = a21 * a33 - a23 * a31
	const b11 = a22 * a33 - a23 * a32
	const determinant = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
	if (Math.abs(determinant) < 1e-10) fail('MESHY_BIND_MATRIX_SINGULAR', 'A mapped rest-pose joint matrix is not invertible.')
	const invDet = 1 / determinant
	return new Float32Array([
		(a11 * b11 - a12 * b10 + a13 * b09) * invDet,
		(a02 * b10 - a01 * b11 - a03 * b09) * invDet,
		(a31 * b05 - a32 * b04 + a33 * b03) * invDet,
		(a22 * b04 - a21 * b05 - a23 * b03) * invDet,
		(a12 * b08 - a10 * b11 - a13 * b07) * invDet,
		(a00 * b11 - a02 * b08 + a03 * b07) * invDet,
		(a32 * b02 - a30 * b05 - a33 * b01) * invDet,
		(a20 * b05 - a22 * b02 + a23 * b01) * invDet,
		(a10 * b10 - a11 * b08 + a13 * b06) * invDet,
		(a01 * b08 - a00 * b10 - a03 * b06) * invDet,
		(a30 * b04 - a31 * b02 + a33 * b00) * invDet,
		(a21 * b02 - a20 * b04 - a23 * b00) * invDet,
		(a11 * b07 - a10 * b09 - a12 * b06) * invDet,
		(a00 * b09 - a01 * b07 + a02 * b06) * invDet,
		(a31 * b01 - a30 * b03 - a32 * b00) * invDet,
		(a20 * b03 - a21 * b01 + a22 * b00) * invDet,
	])
}

function adjustedInverseBindMatrices(sourceSkin, provenSkin, sourceSlotToProvenSlot) {
	const sourceInverse = sourceSkin.getInverseBindMatrices()?.getArray()
	const provenInverse = provenSkin.getInverseBindMatrices()?.getArray()
	if (!sourceInverse || !provenInverse) fail('MESHY_INVERSE_BIND_REQUIRED', 'Both Meshy and proven skins must carry inverse-bind matrices.')
	const sourceWorld = sourceSkin.listJoints().map(node => new Float32Array(node.getWorldMatrix()))
	const provenWorld = provenSkin.listJoints().map(node => new Float32Array(node.getWorldMatrix()))
	const corrected = new Float32Array(provenInverse)
	for (let sourceSlot = 0; sourceSlot < sourceSlotToProvenSlot.length; sourceSlot++) {
		const provenSlot = sourceSlotToProvenSlot[sourceSlot]
		const sourceIbm = sourceInverse.slice(sourceSlot * 16, sourceSlot * 16 + 16)
		const sourceRestSkin = mat4Multiply(sourceWorld[sourceSlot], sourceIbm)
		const correctedIbm = mat4Multiply(mat4Invert(provenWorld[provenSlot]), sourceRestSkin)
		corrected.set(correctedIbm, provenSlot * 16)
	}
	return corrected
}

// The Meshy body and the frozen Mixamo presenter use different humanoid rest
// proportions. Place each mapped Mixamo joint at the corresponding Meshy rest-pose
// world position so the incoming Meshy weights do not stretch across the shorter
// reference rig. The returned deltas are required because glTF animation
// translation channels are absolute local transforms: without offsetting those
// channels, playback immediately overwrites the corrected rest translations.
function alignProvenRestTranslationsToSource(sourceSkin, provenSkin, sourceSlotToProvenSlot) {
	const sourceWorld = sourceSkin.listJoints().map(node => new Float32Array(node.getWorldMatrix()))
	const provenJoints = provenSkin.listJoints()
	const initialTranslations = new Map()
	for (let sourceSlot = 0; sourceSlot < sourceSlotToProvenSlot.length; sourceSlot++) {
		const provenJoint = provenJoints[sourceSlotToProvenSlot[sourceSlot]]
		if (!initialTranslations.has(provenJoint)) initialTranslations.set(provenJoint, new Float32Array(provenJoint.getTranslation()))
		const parent = provenJoint.getParentNode?.()
		const parentWorld = parent ? new Float32Array(parent.getWorldMatrix()) : new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
		const parentInverse = mat4Invert(parentWorld)
		const sourceMatrix = sourceWorld[sourceSlot]
		const desiredX = sourceMatrix[12]
		const desiredY = sourceMatrix[13]
		const desiredZ = sourceMatrix[14]
		const x = parentInverse[0] * desiredX + parentInverse[4] * desiredY + parentInverse[8] * desiredZ + parentInverse[12]
		const y = parentInverse[1] * desiredX + parentInverse[5] * desiredY + parentInverse[9] * desiredZ + parentInverse[13]
		const z = parentInverse[2] * desiredX + parentInverse[6] * desiredY + parentInverse[10] * desiredZ + parentInverse[14]
		provenJoint.setTranslation([x, y, z])
	}
	const deltas = new Map()
	for (const [joint, before] of initialTranslations) {
		const after = joint.getTranslation()
		deltas.set(joint, [after[0] - before[0], after[1] - before[1], after[2] - before[2]])
	}
	return deltas
}

function offsetAbsoluteAnimationTranslations(root, translationDeltas) {
	for (const animation of root.listAnimations()) {
		for (const channel of animation.listChannels()) {
			if (channel.getTargetPath() !== 'translation') continue
			const target = channel.getTargetNode()
			const delta = translationDeltas.get(target)
			if (!delta) continue
			const output = channel.getSampler()?.getOutput()?.getArray()
			if (!output || output.length % 3 !== 0) fail('PROVEN_TRANSLATION_CHANNEL_INVALID', `Animation ${animation.getName()} has an invalid translation output for ${target.getName()}.`)
			for (let i = 0; i < output.length; i += 3) {
				output[i] += delta[0]
				output[i + 1] += delta[1]
				output[i + 2] += delta[2]
			}
		}
	}
}

function copyTexturedMaterial(targetDoc, sourceMaterial, textureCache, materialIndex) {
	if (!sourceMaterial) fail('MESHY_TEXTURED_MATERIAL_REQUIRED', `Meshy primitive ${materialIndex} has no material.`)
	const sourceTexture = sourceMaterial.getBaseColorTexture()
	if (!sourceTexture?.getImage()) {
		fail('MESHY_BASECOLOR_TEXTURE_REQUIRED', `Meshy material ${sourceMaterial.getName() || materialIndex} has no embedded base-color texture.`)
	}
	let texture = textureCache.get(sourceTexture)
	if (!texture) {
		texture = targetDoc.createTexture(sourceTexture.getName() || `Meshy texture ${textureCache.size + 1}`)
			.setImage(sourceTexture.getImage().slice())
			.setMimeType(sourceTexture.getMimeType() || 'image/png')
		textureCache.set(sourceTexture, texture)
	}
	return targetDoc.createMaterial(sourceMaterial.getName() || `Meshy material ${materialIndex + 1}`)
		.setBaseColorTexture(texture)
		.setBaseColorFactor(sourceMaterial.getBaseColorFactor())
		.setMetallicFactor(sourceMaterial.getMetallicFactor())
		.setRoughnessFactor(sourceMaterial.getRoughnessFactor())
		.setDoubleSided(true)
		.setAlphaMode(sourceMaterial.getAlphaMode())
		.setAlphaCutoff(sourceMaterial.getAlphaCutoff())
}

function validateSource(root) {
	const skins = root.listSkins()
	if (skins.length !== 1) fail('MESHY_SINGLE_SKIN_REQUIRED', `Expected exactly one Meshy skin; found ${skins.length}.`)
	const skin = skins[0]
	const jointNames = skin.listJoints().map(node => node.getName())
	const unknownJoints = jointNames.filter(name => !MESHY_TO_MIXAMO_JOINT[name])
	if (unknownJoints.length) fail('MESHY_JOINT_MAP_INCOMPLETE', 'The Meshy rig contains unsupported joints.', { unknownJoints })
	const missingCoreJoints = ['Hips', 'Spine02', 'Spine01', 'Spine', 'neck', 'Head', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg']
		.filter(name => !jointNames.includes(name))
	if (missingCoreJoints.length) fail('MESHY_CORE_JOINTS_MISSING', 'The Meshy rig is not the expected humanoid skeleton.', { missingCoreJoints })
	const bounds = computeBounds(root)
	const height = bounds.size[1]
	if (height < MESHY_MIXAMO_CONTRACT.minHeightMeters || height > MESHY_MIXAMO_CONTRACT.maxHeightMeters) {
		fail('MESHY_SCALE_OUT_OF_RANGE', `Meshy avatar height ${height.toFixed(3)}m is outside the production range.`, { bounds })
	}
	if (bounds.size[2] >= bounds.size[1] || bounds.size[0] >= bounds.size[1]) {
		fail('MESHY_ORIENTATION_INVALID', 'Meshy avatar is not upright on +Y.', { bounds })
	}
	return { skin, jointNames, bounds }
}

function validateProven(root) {
	const skins = root.listSkins()
	if (skins.length !== 1) fail('PROVEN_SINGLE_SKIN_REQUIRED', `Expected one proven Mixamo skin; found ${skins.length}.`)
	const skin = skins[0]
	const jointNames = skin.listJoints().map(node => node.getName())
	if (jointNames.length !== MESHY_MIXAMO_CONTRACT.jointCount) {
		fail('PROVEN_JOINT_COUNT_DRIFT', `Expected ${MESHY_MIXAMO_CONTRACT.jointCount} proven joints; found ${jointNames.length}.`)
	}
	const clipNames = root.listAnimations().map(animation => animation.getName())
	if (!exactArray(clipNames, MESHY_MIXAMO_CONTRACT.clipNames)) {
		fail('PROVEN_CLIP_ORDER_DRIFT', 'The proven Mixamo animation library no longer matches the frozen 18-clip contract.', { clipNames })
	}
	return { skin, jointNames, clipNames }
}

function animationDurationMs(animation) {
	let maxSeconds = 0
	for (const sampler of animation.listSamplers()) {
		const values = sampler.getInput()?.getArray()
		if (!values) continue
		for (const value of values) maxSeconds = Math.max(maxSeconds, Number(value) || 0)
	}
	return Math.round(maxSeconds * 1000)
}

/**
 * Remove unused source-container payload and keep the Meshy base-color texture
 * within the PowerPoint presenter budget. This preserves the Meshy appearance
 * while avoiding dead accessors/buffers inherited from the proven container.
 */
async function optimizePowerPointHybridGlb(glb, textureMax = 2048) {
	const io = new NodeIO()
	const doc = await io.readBinary(Buffer.from(glb))
	await doc.transform(
		textureCompress({ encoder: sharp, resize: [textureMax, textureMax], effort: 90 }),
		dedup(),
		prune(),
	)
	return Buffer.from(await io.writeBinary(doc))
}

/**
 * Put Meshy's visible geometry, UV texture, and skin weights on the frozen,
 * PowerPoint-proven Mixamo skeleton and 18-clip container.
 */
export async function hybridizeMeshyWithProvenMixamo({ meshyGlb, provenGlb } = {}) {
	if (!meshyGlb?.length) fail('MESHY_GLB_REQUIRED', 'Provide Meshy rigged GLB bytes.')
	if (!provenGlb?.length) fail('PROVEN_GLB_REQUIRED', 'Provide the frozen proven Mixamo GLB bytes.')
	const io = new NodeIO()
	const sourceDoc = await io.readBinary(Buffer.from(meshyGlb))
	const targetDoc = await io.readBinary(Buffer.from(provenGlb))
	const sourceRoot = sourceDoc.getRoot()
	const targetRoot = targetDoc.getRoot()
	const source = validateSource(sourceRoot)
	const proven = validateProven(targetRoot)
	const provenSlotByName = new Map(proven.skin.listJoints().map((node, index) => [node.getName(), index]))
	const sourceSlotToProvenSlot = source.skin.listJoints().map(node => {
		const targetName = MESHY_TO_MIXAMO_JOINT[node.getName()]
		const slot = provenSlotByName.get(targetName)
		if (slot === undefined) fail('PROVEN_JOINT_MISSING', `The proven skeleton has no ${targetName} joint.`)
		return slot
	})
	const restTranslationDeltas = alignProvenRestTranslationsToSource(source.skin, proven.skin, sourceSlotToProvenSlot)
	offsetAbsoluteAnimationTranslations(targetRoot, restTranslationDeltas)
	const correctedInverseBindMatrices = adjustedInverseBindMatrices(source.skin, proven.skin, sourceSlotToProvenSlot)
	proven.skin.setInverseBindMatrices(targetDoc.createAccessor('Meshy-adjusted inverse bind matrices').setType('MAT4').setArray(correctedInverseBindMatrices))

	const originalMeshes = targetRoot.listMeshes().slice()
	const originalMaterials = targetRoot.listMaterials().slice()
	const originalTextures = targetRoot.listTextures().slice()
	for (const node of targetRoot.listNodes()) if (node.getMesh()) node.setMesh(null)

	const mesh = targetDoc.createMesh('Meshy geometry')
	const textureCache = new Map()
	let sourcePrimitiveCount = 0
	let sourceTriangleCount = 0
	for (const sourceMesh of sourceRoot.listMeshes()) {
		for (const sourcePrimitive of sourceMesh.listPrimitives()) {
			sourcePrimitiveCount++
			if (sourcePrimitive.listTargets().length) fail('MESHY_MORPH_TARGETS_UNSUPPORTED', 'Meshy morph targets are not supported by the frozen hybrid contract.')
			const sourceJoints = sourcePrimitive.getAttribute('JOINTS_0')
			const sourceWeights = sourcePrimitive.getAttribute('WEIGHTS_0')
			const positions = sourcePrimitive.getAttribute('POSITION')
			if (!positions || !sourceJoints || !sourceWeights) {
				fail('MESHY_SKIN_ATTRIBUTES_REQUIRED', `Meshy primitive ${sourcePrimitiveCount - 1} is missing POSITION, JOINTS_0, or WEIGHTS_0.`)
			}
			if (sourceJoints.getCount() !== positions.getCount() || sourceWeights.getCount() !== positions.getCount()) {
				fail('MESHY_SKIN_ATTRIBUTE_COUNT_MISMATCH', `Meshy primitive ${sourcePrimitiveCount - 1} has inconsistent vertex/skin counts.`)
			}
			const sourceJointArray = sourceJoints.getArray()
			const remappedJoints = new Uint8Array(sourceJointArray.length)
			for (let i = 0; i < sourceJointArray.length; i++) {
				const sourceSlot = sourceJointArray[i]
				if (sourceSlot >= sourceSlotToProvenSlot.length) fail('MESHY_JOINT_INDEX_OUT_OF_RANGE', `Meshy joint slot ${sourceSlot} is out of range.`)
				remappedJoints[i] = sourceSlotToProvenSlot[sourceSlot]
			}
			const primitive = targetDoc.createPrimitive().setMode(sourcePrimitive.getMode())
			for (const semantic of sourcePrimitive.listSemantics()) {
				const sourceAccessor = sourcePrimitive.getAttribute(semantic)
				primitive.setAttribute(semantic, copyAccessor(targetDoc, sourceAccessor, semantic, semantic === 'JOINTS_0' ? remappedJoints : null))
			}
			const sourceIndices = sourcePrimitive.getIndices()
			if (sourceIndices) {
				primitive.setIndices(copyAccessor(targetDoc, sourceIndices, 'indices'))
				sourceTriangleCount += Math.floor(sourceIndices.getCount() / 3)
			}
			primitive.setMaterial(copyTexturedMaterial(targetDoc, sourcePrimitive.getMaterial(), textureCache, sourcePrimitiveCount - 1))
			mesh.addPrimitive(primitive)
		}
	}
	if (!sourcePrimitiveCount) fail('MESHY_GEOMETRY_REQUIRED', 'The Meshy GLB contains no mesh primitives.')

	const scene = targetRoot.listScenes()[0] || targetDoc.createScene('Scene')
	const meshNode = targetDoc.createNode('meshy-avatar').setMesh(mesh).setSkin(proven.skin)
	// Keep the Meshy skinned node in the same Armature coordinate frame as the proven
	// Mixamo meshes. A scene-root sibling silently changes the mesh-node transform and
	// makes the embedded Mixamo clips deform the Meshy limbs around the wrong origin.
	const skeletonRoot = proven.skin.listJoints()[0]?.getParentNode?.()
	if (skeletonRoot) skeletonRoot.addChild(meshNode)
	else scene.addChild(meshNode)
	for (const oldMesh of originalMeshes) oldMesh.dispose()
	for (const oldMaterial of originalMaterials) oldMaterial.dispose()
	for (const oldTexture of originalTextures) oldTexture.dispose()

	const canonicalBytes = Buffer.from(await io.writeBinary(targetDoc))
	const safe = makePowerPointSafeGlb(canonicalBytes)
	const output = await optimizePowerPointHybridGlb(safe.glb)
	const verified = await verifyMeshyMixamoHybrid(output)
	const contacts = targetRoot.listAnimations().map((animation, animId) => ({
		animId,
		clipName: animation.getName(),
		contactMs: CONTACT_MS_BY_ANIM_ID[animId],
		durationMs: animationDurationMs(animation),
	}))
	return {
		glb: output,
		manifest: {
			contract: MESHY_MIXAMO_CONTRACT.version,
			canonicalSkeletonVersion: MESHY_MIXAMO_CONTRACT.canonicalSkeletonVersion,
			clipMap: { ...MESHY_MIXAMO_CONTRACT.clipMap },
			clipNames: [...MESHY_MIXAMO_CONTRACT.clipNames],
			animCount: MESHY_MIXAMO_CONTRACT.clipNames.length,
			contacts,
			meshySha256: sha256(meshyGlb),
			provenSha256: sha256(provenGlb),
			outputSha256: sha256(output),
			geometry: { vertices: source.bounds.vertices, triangles: sourceTriangleCount, sourcePrimitives: sourcePrimitiveCount, outputMeshes: verified.meshes },
			materials: verified.materials,
			textures: verified.textures,
			jointCount: verified.joints,
			mappingConfidence: 1,
			bindCorrection: 'source-to-proven-rest-pose-inverse-bind+absolute-animation-translation-delta',
			// Native PowerPoint calibration measured against the Meshy sample's larger action envelope.
			// The compiler consumes this only when the author has not supplied an explicit margin.
			viewportMargin: 1.25,
			powerPointSafe: { convertedUint32Primitives: safe.converted, outputParts: safe.parts, uint32Primitives: safe.after.uint32Primitives, textureMax: 2048, optimizedBytes: output.length },
		},
	}
}

export async function verifyMeshyMixamoHybrid(glb) {
	if (!glb?.length) fail('HYBRID_GLB_REQUIRED', 'Provide hybrid GLB bytes to verify.')
	const doc = await new NodeIO().readBinary(Buffer.from(glb))
	const root = doc.getRoot()
	const proven = validateProven(root)
	const meshes = root.listMeshes()
	const materials = root.listMaterials()
	const textures = root.listTextures()
	if (!meshes.length) fail('HYBRID_GEOMETRY_REQUIRED', 'Hybrid GLB has no visible Meshy geometry.')
	if (!materials.length || !textures.length) fail('HYBRID_TEXTURE_REQUIRED', 'Hybrid GLB has no Meshy material/texture.')
	if (meshes.some(mesh => !/^Meshy geometry/.test(mesh.getName()))) {
		fail('HYBRID_PROVEN_GEOMETRY_LEAK', 'Hybrid GLB still contains visible geometry from the proven Mixamo character.')
	}
	let vertices = 0
	let triangles = 0
	for (const mesh of meshes) for (const primitive of mesh.listPrimitives()) {
		const position = primitive.getAttribute('POSITION')
		const joints = primitive.getAttribute('JOINTS_0')
		const weights = primitive.getAttribute('WEIGHTS_0')
		if (!position || !joints || !weights || !primitive.getMaterial()?.getBaseColorTexture()) {
			fail('HYBRID_PRIMITIVE_INVALID', 'Every hybrid primitive must be textured and skinned.')
		}
		vertices += position.getCount()
		triangles += Math.floor((primitive.getIndices()?.getCount() || position.getCount()) / 3)
		for (const slot of joints.getArray()) if (slot >= proven.skin.listJoints().length) fail('HYBRID_JOINT_INDEX_OUT_OF_RANGE', `Hybrid joint slot ${slot} is out of range.`)
	}
	return {
		ok: true,
		sha256: sha256(glb),
		meshes: meshes.length,
		materials: materials.length,
		textures: textures.length,
		joints: proven.jointNames.length,
		animations: proven.clipNames.length,
		clipNames: proven.clipNames,
		vertices,
		triangles,
	}
}
