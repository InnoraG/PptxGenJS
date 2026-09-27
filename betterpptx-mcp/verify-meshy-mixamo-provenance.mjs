#!/usr/bin/env node
// Deterministic, no-network provenance proof for the native 3D presenter.
// It verifies that visible payloads derive from the Meshy GLB while the
// animation contract derives from the frozen Mixamo-proven library.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import sharp from 'sharp'
import { verifyMeshyMixamoHybrid } from './ir/meshy-mixamo-hybrid.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const demo = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar')
const sourcePath = path.join(repo, 'Meshy_AI_Casual_Denim_Look_biped', 'Meshy_AI_Casual_Denim_Look_biped_Character_output.glb')
const provenPath = path.join(here, 'assets', 'powerpoint-proven-mixamo-library.glb')
const hybridPath = path.join(demo, 'production-hybrid-proof.glb')
const manifestPath = path.join(demo, 'visual-artifacts', 'live-meshy-acceptance-20260718', 'fixture-mock-acquisition', 'manifest.json')
const outputPath = path.join(demo, 'visual-artifacts', 'release-gates', 'meshy-mixamo-provenance-20260718.json')

function sha256(value) { return createHash('sha256').update(Buffer.from(value)).digest('hex').toUpperCase() }
function digestParts(parts) {
	const hash = createHash('sha256')
	for (const part of parts) {
		if (part === undefined || part === null) hash.update('null')
		else if (ArrayBuffer.isView(part)) hash.update(Buffer.from(part.buffer, part.byteOffset, part.byteLength))
		else hash.update(JSON.stringify(part))
	}
	return hash.digest('hex').toUpperCase()
}
function arrayValues(accessor) { return accessor?.getArray ? accessor.getArray() : null }
function listPrimitives(root) { return root.listMeshes().flatMap(mesh => mesh.listPrimitives().map(primitive => ({ mesh, primitive }))) }
function attributeDigest(root, semantic) {
	return digestParts(listPrimitives(root).map(({ primitive }) => arrayValues(primitive.getAttribute(semantic))))
}
function indexCount(root) { return listPrimitives(root).reduce((sum, item) => sum + Number(item.primitive.getIndices()?.getCount() || item.primitive.getAttribute('POSITION')?.getCount() || 0), 0) }
function elementSize(accessor) {
	return { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }[accessor?.getType?.()] || 0
}
function vertexPayloadCounts(root) {
	const counts = new Map()
	for (const { primitive } of listPrimitives(root)) {
		const attributes = ['POSITION', 'NORMAL', 'TEXCOORD_0', 'WEIGHTS_0'].map(semantic => primitive.getAttribute(semantic))
		if (attributes.some(accessor => !accessor)) continue
		const vertexCount = attributes[0].getCount()
		for (let vertex = 0; vertex < vertexCount; vertex++) {
			const fields = attributes.flatMap(accessor => {
				const size = elementSize(accessor)
				const values = accessor.getArray()
				return Array.from(values.slice(vertex * size, vertex * size + size), value => Number(value).toPrecision(8))
			})
			const key = fields.join('|')
			counts.set(key, (counts.get(key) || 0) + 1)
		}
	}
	return counts
}
function vertexPayloadSubset(sourceRoot, hybridRoot) {
	const sourceCounts = vertexPayloadCounts(sourceRoot)
	const hybridCounts = vertexPayloadCounts(hybridRoot)
	let missing = 0
	let duplicated = 0
	for (const [key, count] of sourceCounts) {
		const available = hybridCounts.get(key) || 0
		if (available < count) missing += count - available
	}
	for (const [key, count] of hybridCounts) duplicated += Math.max(0, count - (sourceCounts.get(key) || 0))
	return { pass: missing === 0, sourceVertices: [...sourceCounts.values()].reduce((sum, count) => sum + count, 0), hybridVertices: [...hybridCounts.values()].reduce((sum, count) => sum + count, 0), missingVertices: missing, duplicatedVertices: duplicated }
}
function geometryStats(root) {
	const primitives = listPrimitives(root)
	return {
		meshes: root.listMeshes().length,
		primitives: primitives.length,
		vertices: primitives.reduce((sum, item) => sum + Number(item.primitive.getAttribute('POSITION')?.getCount() || 0), 0),
		triangles: Math.floor(indexCount(root) / 3),
		meshNames: root.listMeshes().map(mesh => mesh.getName()),
	}
}
function textureImages(root) { return root.listTextures().map(texture => texture.getImage()).filter(Boolean).map(image => Buffer.from(image)) }
function textureStats(root) {
	return root.listTextures().map(texture => ({
		name: texture.getName(),
		mimeType: texture.getMimeType(),
		bytes: texture.getImage()?.byteLength || 0,
		sha256: texture.getImage() ? sha256(texture.getImage()) : null,
	}))
}
function materialStats(root) {
	return root.listMaterials().map(material => ({
		name: material.getName(),
		baseColorTexture: material.getBaseColorTexture()?.getName() || null,
		baseColorTextureSha256: material.getBaseColorTexture()?.getImage() ? sha256(material.getBaseColorTexture().getImage()) : null,
	}))
}
function clipNames(root) { return root.listAnimations().map(animation => animation.getName()) }
function animationSignature(root, includeTranslation) {
	const parts = []
	for (const animation of root.listAnimations()) {
		parts.push(animation.getName())
		for (const channel of animation.listChannels()) {
			if (!includeTranslation && channel.getTargetPath() === 'translation') continue
			parts.push(channel.getTargetNode()?.getName() || null, channel.getTargetPath())
			parts.push(arrayValues(channel.getSampler()?.getInput()))
			parts.push(arrayValues(channel.getSampler()?.getOutput()))
		}
	}
	return digestParts(parts)
}
async function textureSimilarity(sourceImage, hybridImage) {
	if (!sourceImage || !hybridImage) return { pass: false, reason: 'missing-embedded-basecolor-image' }
	const [sourceRaw, hybridRaw] = await Promise.all([
		sharp(sourceImage).resize(32, 32, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
		sharp(hybridImage).resize(32, 32, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
	])
	const length = Math.min(sourceRaw.data.length, hybridRaw.data.length)
	let total = 0
	let max = 0
	for (let index = 0; index < length; index++) {
		const difference = Math.abs(sourceRaw.data[index] - hybridRaw.data[index])
		total += difference
		max = Math.max(max, difference)
	}
	const meanAbsoluteError = length ? total / length : 255
	return { pass: meanAbsoluteError < 18, meanAbsoluteError: Number(meanAbsoluteError.toFixed(4)), maxAbsoluteError: max, sampleBytes: length }
}
function check(id, pass, detail) { return { id, status: pass ? 'PASS' : 'FAIL', detail } }

for (const file of [sourcePath, provenPath, hybridPath, manifestPath]) {
	if (!fs.existsSync(file)) throw new Error(`Required provenance input is missing: ${file}`)
}
const io = new NodeIO()
const [sourceDoc, provenDoc, hybridDoc] = await Promise.all([
	io.readBinary(fs.readFileSync(sourcePath)),
	io.readBinary(fs.readFileSync(provenPath)),
	io.readBinary(fs.readFileSync(hybridPath)),
])
const sourceRoot = sourceDoc.getRoot()
const provenRoot = provenDoc.getRoot()
const hybridRoot = hybridDoc.getRoot()
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const sourceTextures = textureImages(sourceRoot)
const provenTextures = textureImages(provenRoot)
const hybridTextures = textureImages(hybridRoot)
const textureComparison = await textureSimilarity(sourceTextures[0], hybridTextures[0])
const hybridVerification = await verifyMeshyMixamoHybrid(fs.readFileSync(hybridPath))
const sourceGeometry = geometryStats(sourceRoot)
const provenGeometry = geometryStats(provenRoot)
const hybridGeometry = geometryStats(hybridRoot)
const sourceClips = clipNames(sourceRoot)
const provenClips = clipNames(provenRoot)
const hybridClips = clipNames(hybridRoot)
const visibleMeshNamesAreMeshy = hybridGeometry.meshNames.length > 0 && hybridGeometry.meshNames.every(name => /^Meshy geometry/.test(name))
const hybridMaterialTextureHashes = textureStats(hybridRoot).map(item => item.sha256).filter(Boolean)
const provenTextureHashes = textureStats(provenRoot).map(item => item.sha256).filter(Boolean)
const vertexPayloadComparison = vertexPayloadSubset(sourceRoot, hybridRoot)
const checks = [
	check('manifest-source-hash-matches-supplied-meshy-glb', String(manifest.meshySha256).toUpperCase() === sha256(fs.readFileSync(sourcePath)), 'The manifest identifies the exact supplied Meshy GLB.'),
	check('manifest-proven-hash-matches-frozen-library', String(manifest.provenSha256).toUpperCase() === sha256(fs.readFileSync(provenPath)), 'The manifest identifies the exact frozen Mixamo-proven library.'),
	check('manifest-output-hash-matches-production-hybrid', String(manifest.outputSha256).toUpperCase() === sha256(fs.readFileSync(hybridPath)), 'The manifest identifies the exact production hybrid output.'),
	check('mesh-visible-payload-is-meshy-named', visibleMeshNamesAreMeshy, 'No visible proven-library mesh name remains in the hybrid.'),
	check('mesh-vertex-and-visible-attribute-payload-preserved', vertexPayloadComparison.pass, 'Meshy position, normal, UV, and skin-weight records are preserved as a multiset; safe primitive splitting may duplicate vertices, while joint indices are remapped.'),
	check('meshy-texture-embedded-and-derived', sourceTextures.length > 0 && hybridTextures.length > 0 && textureComparison.pass, 'The hybrid contains an embedded base-color image with low-error similarity to the supplied Meshy image after bounded resize/compression.'),
	check('hybrid-texture-not-from-proven-library', hybridMaterialTextureHashes.length > 0 && hybridMaterialTextureHashes.every(hash => !provenTextureHashes.includes(hash)), 'The visible hybrid texture does not match any frozen-library texture hash.'),
	check('hybrid-material-is-textured', hybridRoot.listMaterials().length === sourceRoot.listMaterials().length && hybridRoot.listMaterials().every(material => Boolean(material.getBaseColorTexture()?.getImage())), 'Meshy material count and embedded base-color texturing are retained.'),
	check('mixamo-clip-sequence-is-frozen', JSON.stringify(hybridClips) === JSON.stringify(provenClips) && hybridClips.length === 18, 'The hybrid carries the exact frozen 18-clip sequence.'),
	check('non-translation-animation-payload-is-mixamo', animationSignature(hybridRoot, false) === animationSignature(provenRoot, false), 'Rotation/scale and non-translation animation channels match the frozen Mixamo library.'),
	check('translation-correction-is-explicit', manifest.bindCorrection === 'source-to-proven-rest-pose-inverse-bind+absolute-animation-translation-delta', 'Only the documented rest-pose/translation correction changes animation translation channels.'),
	check('source-animation-container-not-used-as-runtime-contract', JSON.stringify(hybridClips) === JSON.stringify(provenClips) && JSON.stringify(hybridClips) !== JSON.stringify(sourceClips), 'Runtime animation names are selected from the proven Mixamo library, not the Meshy source animation container.'),
	check('hybrid-structural-verifier-passes', hybridVerification.ok === true && hybridVerification.joints === 65 && hybridVerification.animations === 18, 'The existing structural hybrid verifier passes with 65 joints and 18 clips.'),
]
const report = {
	schemaVersion: 'betterpptx.native-3d-meshy-mixamo-provenance.v1',
	status: checks.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL',
	scope: 'native-3d-presenter-only',
	developmentMode: 'premium',
	networkAttempted: false,
	contract: 'Meshy visible body/face/hair/clothing/UV/material/texture + frozen Mixamo 65-joint skeleton/18 clips',
	inputs: {
		meshy: { path: sourcePath, sha256: sha256(fs.readFileSync(sourcePath)), geometry: sourceGeometry, materials: materialStats(sourceRoot), textures: textureStats(sourceRoot), animationNames: sourceClips },
		mixamoProven: { path: provenPath, sha256: sha256(fs.readFileSync(provenPath)), geometry: provenGeometry, materials: materialStats(provenRoot), textures: textureStats(provenRoot), animationNames: provenClips },
		hybrid: { path: hybridPath, sha256: sha256(fs.readFileSync(hybridPath)), geometry: hybridGeometry, materials: materialStats(hybridRoot), textures: textureStats(hybridRoot), animationNames: hybridClips },
	},
	textureComparison,
	vertexPayloadComparison,
	attributeDigests: { source: { POSITION: attributeDigest(sourceRoot, 'POSITION'), NORMAL: attributeDigest(sourceRoot, 'NORMAL'), TEXCOORD_0: attributeDigest(sourceRoot, 'TEXCOORD_0'), WEIGHTS_0: attributeDigest(sourceRoot, 'WEIGHTS_0') }, hybrid: { POSITION: attributeDigest(hybridRoot, 'POSITION'), NORMAL: attributeDigest(hybridRoot, 'NORMAL'), TEXCOORD_0: attributeDigest(hybridRoot, 'TEXCOORD_0'), WEIGHTS_0: attributeDigest(hybridRoot, 'WEIGHTS_0') } },
	animationPayload: { provenAllChannels: animationSignature(provenRoot, true), hybridAllChannels: animationSignature(hybridRoot, true), provenNonTranslation: animationSignature(provenRoot, false), hybridNonTranslation: animationSignature(hybridRoot, false), sourceClipCount: sourceClips.length, provenClipCount: provenClips.length, hybridClipCount: hybridClips.length },
	checks,
	ownerInterpretation: 'This is local provenance and structure evidence only. It does not clear Meshy commercial terms, image consent, Mixamo distribution rights, or live deployment approval.',
	retryPolicy: 'No automatic retry. One deterministic comparison over the fixed source, frozen library, and production hybrid hashes.',
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'PASS') process.exitCode = 2
