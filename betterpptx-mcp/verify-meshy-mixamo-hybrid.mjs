import { readFileSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NodeIO } from '@gltf-transform/core'
import { hybridizeMeshyWithProvenMixamo, verifyMeshyMixamoHybrid } from './ir/meshy-mixamo-hybrid.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.dirname(here)
const meshyPath = process.argv[2] || path.join(repo, 'Meshy_AI_Casual_Denim_Look_biped', 'Meshy_AI_Casual_Denim_Look_biped_Character_output.glb')
const provenPath = process.argv[3] || path.join(repo, 'research-demos', '2026-07-12-presenter-cofire', 'joe-slim.glb')
const outputPath = process.argv[4] || ''

const meshyGlb = readFileSync(meshyPath)
const provenGlb = readFileSync(provenPath)
const result = await hybridizeMeshyWithProvenMixamo({ meshyGlb, provenGlb })
const verified = await verifyMeshyMixamoHybrid(result.glb)
const repeat = await hybridizeMeshyWithProvenMixamo({ meshyGlb, provenGlb })
assert.equal(repeat.manifest.outputSha256, result.manifest.outputSha256, 'hybrid output must be deterministic')
assert.deepEqual(verified.clipNames, result.manifest.clipNames)
assert.equal(verified.joints, 65)
assert.equal(verified.animations, 18)
assert.equal(result.manifest.powerPointSafe.uint32Primitives, 0)
assert.ok(result.manifest.powerPointSafe.optimizedBytes <= 24 * 1024 * 1024, 'production hybrid must stay under the 24 MB presenter budget')
assert.equal(result.manifest.powerPointSafe.textureMax, 2048)

async function expectCode(code, operation) {
	let thrown = null
	try { await operation() } catch (error) { thrown = error }
	assert.ok(thrown, `expected ${code} failure`)
	assert.equal(thrown.code, code)
}

const io = new NodeIO()
const unknownJointDoc = await io.readBinary(meshyGlb)
unknownJointDoc.getRoot().listSkins()[0].listJoints().at(-1).setName('unexpected_meshy_helper')
await expectCode('MESHY_JOINT_MAP_INCOMPLETE', async () => hybridizeMeshyWithProvenMixamo({
	meshyGlb: Buffer.from(await io.writeBinary(unknownJointDoc)), provenGlb,
}))

const clipDriftDoc = await io.readBinary(provenGlb)
clipDriftDoc.getRoot().listAnimations()[17].setName('17_clip_drift')
await expectCode('PROVEN_CLIP_ORDER_DRIFT', async () => hybridizeMeshyWithProvenMixamo({
	meshyGlb, provenGlb: Buffer.from(await io.writeBinary(clipDriftDoc)),
}))

if (outputPath) writeFileSync(outputPath, result.glb)
console.log(JSON.stringify({
	ok: true,
	meshyPath,
	provenPath,
	outputPath: outputPath || null,
	deterministic: true,
	negativeGates: ['MESHY_JOINT_MAP_INCOMPLETE', 'PROVEN_CLIP_ORDER_DRIFT'],
	manifest: result.manifest,
	verified,
}, null, 2))
