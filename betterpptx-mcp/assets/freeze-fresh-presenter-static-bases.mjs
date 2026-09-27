import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { applyMixamoNonMetalMaterialProfile, inspectMaterialProfile } from './glb-material-profile.mjs'
import { canonicalizeMixamoBoneNames } from './glb-rig-profile.mjs'
import { optimizeGlbTexturesSafeBuffer } from './optimize-glb-textures-safe.mjs'
import { parseGlb } from '../ir/kinetic-transplant.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.dirname(path.dirname(here))
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const sources = [
	{
		identity: 'joe',
		fbxPath: 'C:/Users/SafeUser/Downloads/JoeFreshOriginal.fbx',
		fbxSha256: '4fc6e3952d97007e337897f76bceb5925d4cf4d83c8362f7898827f52a9b81b9',
		flatPath: path.join(repo, 'outputs', 'kimodo', 'joe-fresh-original-preserved-v1', 'joe-fresh-original-flat.glb'),
		flatSha256: '7aca7f03a09ba3d6138b82c89ed5f34835b0781253382ccad319e4dd4db4b1f8',
	},
	{
		identity: 'pete',
		fbxPath: 'C:/Users/SafeUser/Downloads/PeteWorkerFreshOriginal.fbx',
		fbxSha256: '03f5922a1011f0a1f3a42888118b6643848b2163849fd9d0f7b7453d999fad59',
		flatPath: path.join(repo, 'outputs', 'kimodo', 'pete-fresh-original-preserved-v1', 'pete-fresh-original-flat.glb'),
		flatSha256: 'e914aabe47470652f512a1ea50e0a256acd0dbe1245447680e43759a5d935776',
	},
]

const manifest = { schemaVersion: 'betterpptx.fresh-presenter-static-bases.v1', generatedAt: new Date().toISOString(), presenters: {} }
for (const source of sources) {
	const fbx = fs.readFileSync(source.fbxPath)
	const flat = fs.readFileSync(source.flatPath)
	if (sha256(fbx) !== source.fbxSha256) throw new Error(`${source.identity} fresh FBX hash drift`)
	if (sha256(flat) !== source.flatSha256) throw new Error(`${source.identity} flattened GLB hash drift`)
	const before = parseGlb(flat)
	if ((before.json.animations || []).length) throw new Error(`${source.identity} static source unexpectedly contains animation`)
	const named = canonicalizeMixamoBoneNames(flat)
	const matte = applyMixamoNonMetalMaterialProfile(named.buffer, { keepSourceSpecular: false })
	const optimized = await optimizeGlbTexturesSafeBuffer(matte.buffer, { maxTextureSize: 512 })
	if (!optimized.report.payloadPreserved) throw new Error(`${source.identity} static optimization changed a non-image payload`)
	const after = parseGlb(optimized.buffer)
	if ((after.json.meshes || []).length !== (before.json.meshes || []).length || (after.json.skins || []).length !== 1 || (after.json.skins[0].joints || []).length !== 65) {
		throw new Error(`${source.identity} static structure drift`)
	}
	const material = inspectMaterialProfile(optimized.buffer)
	if (!material.length || material.some(item => item.metallicFactor !== 0 || item.roughnessFactor !== 1 || item.hasMetallicRoughnessTexture || item.hasSpecularExtension)) {
		throw new Error(`${source.identity} strict matte profile drift`)
	}
	const output = path.join(here, `presenter-source-${source.identity}-static.glb`)
	fs.writeFileSync(output, optimized.buffer)
	manifest.presenters[source.identity] = {
		fbx: { path: source.fbxPath, bytes: fbx.length, sha256: sha256(fbx) },
		flat: { path: source.flatPath, bytes: flat.length, sha256: sha256(flat) },
		static: { path: output, bytes: optimized.buffer.length, sha256: sha256(optimized.buffer) },
		canonicalBoneNamesChanged: named.changed,
		matteChanges: matte.changed,
		material,
		textureOptimization: optimized.report,
	}
}
const manifestPath = path.join(here, 'presenter-source-manifest.json')
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ manifestPath, ...manifest }, null, 2))
