import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
	buildDefaultPresenterMotionSelections,
	validateBuiltPresenterMotionChannels,
	validateDefaultPresenterBuildContract,
} from './build-default-presenter-roster.mjs'
import { assertPowerPointSafeStaticPose } from './glb-static-pose-profile.mjs'
import { canonicalizeMixamoBoneNames } from './glb-rig-profile.mjs'
import { inspectMaterialProfile } from './glb-material-profile.mjs'
import { optimizeGlbTexturesSafeBuffer } from './optimize-glb-textures-safe.mjs'
import { simplifyGlbGeometrySafeBuffer } from './simplify-glb-geometry-safe.mjs'
import { parseGlb, transplantMotionSet } from '../ir/kinetic-transplant.mjs'
import { resolveDefaultPresenterContacts } from './default-presenter-roster.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.dirname(path.dirname(here))
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex')

const motionContractPath = path.join(here, 'default-presenter-motion-contract.json')
const sourcePath = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar', 'production-hybrid-proof.glb')
const outputPath = path.join(here, 'default-presenter-mena.glb')
const posterPath = path.join(here, 'default-presenter-mena.png')
const provenLibraryPath = path.join(here, 'presenter-motion-library-proven-v1.glb')
const MENA_GEOMETRY_RATIO = 0.25
const MENA_TEXTURE_MAX_SIZE = 512

const requiredFiles = [
	motionContractPath,
	sourcePath,
	posterPath,
	provenLibraryPath,
]

function assertRequiredFiles() {
	for (const file of requiredFiles) {
		if (!fs.existsSync(file)) throw new Error(`Missing Mena presenter build input: ${file}`)
	}
}

function animationTargetPaths(json) {
	return (json.animations || []).map(animation => animation.channels.reduce((counts, channel) => {
		const target = channel?.target?.path || 'unknown'
		counts[target] = (counts[target] || 0) + 1
		return counts
	}, {}))
}

function assertVisiblePayloadRetained(sourceJson, outputJson, { allowGeometryRebuild = false } = {}) {
	for (const field of allowGeometryRebuild ? ['images', 'textures', 'materials'] : ['meshes', 'skins', 'images', 'textures', 'materials']) {
		if (JSON.stringify(sourceJson[field] || []) !== JSON.stringify(outputJson[field] || [])) {
			throw new Error(`Mena visible ${field} payload changed during motion-only bake`)
		}
	}
	const sourceSkin = sourceJson.skins?.[0]
	const outputSkin = outputJson.skins?.[0]
	if (sourceSkin?.name !== outputSkin?.name || JSON.stringify(sourceSkin?.joints || []) !== JSON.stringify(outputSkin?.joints || [])) {
		throw new Error('Mena skin joint order changed during build')
	}
	if (sourceSkin?.joints?.length !== 65 || outputSkin?.joints?.length !== 65) {
		throw new Error('Mena presenter must retain the 65-joint PowerPoint skeleton')
	}
}

function geometryStats(json) {
	const primitives = (json.meshes || []).flatMap(mesh => mesh.primitives || [])
	const rows = primitives.map(primitive => ({
		vertexCount: Number(json.accessors?.[primitive.attributes?.POSITION]?.count || 0),
		triangleCount: primitive.indices === undefined ? 0 : Number(json.accessors?.[primitive.indices]?.count || 0) / 3,
		indexComponentType: json.accessors?.[primitive.indices]?.componentType || null,
		mode: primitive.mode ?? 4,
	}))
	return {
		primitives: rows.length,
		vertices: rows.reduce((sum, row) => sum + row.vertexCount, 0),
		triangles: rows.reduce((sum, row) => sum + row.triangleCount, 0),
		maxPrimitiveVertices: Math.max(0, ...rows.map(row => row.vertexCount)),
		indexComponentTypes: [...new Set(rows.map(row => row.indexComponentType).filter(Boolean))],
		modes: [...new Set(rows.map(row => row.mode))],
	}
}

function assertPowerPointSafeGeometry(json) {
	const stats = geometryStats(json)
	if (stats.maxPrimitiveVertices > 65534 || stats.indexComponentTypes.some(type => type !== 5123) || stats.modes.some(mode => mode !== 4)) {
		throw new Error(`Mena geometry is not PowerPoint-safe after optimization: ${JSON.stringify(stats)}`)
	}
	if (stats.vertices > 60000 || stats.triangles > 70000) {
		throw new Error(`Mena geometry exceeds the working presenter budget: ${JSON.stringify(stats)}`)
	}
	return stats
}

export async function buildMenaPresenterRoster() {
	assertRequiredFiles()
	const motionContract = JSON.parse(fs.readFileSync(motionContractPath, 'utf8'))
	validateDefaultPresenterBuildContract(motionContract)
	const source = fs.readFileSync(sourcePath)
	const sourceParsed = parseGlb(source)
	const provenLibrary = fs.readFileSync(provenLibraryPath)
	const selections = buildDefaultPresenterMotionSelections(motionContract, source, {
		libraries: { proven: provenLibrary },
		readNativeSource: sourceFile => fs.readFileSync(path.join(here, sourceFile)),
	})
	const motion = transplantMotionSet(source, selections, { strict: true, channelPolicy: 'rotation-only' })
	if (motion.report.some(row => !String(row.status).includes('skip=0'))) {
		throw new Error(`Mena motion transplant skipped channels: ${JSON.stringify(motion.report)}`)
	}
	const motionParsed = parseGlb(motion.glb)
	assertVisiblePayloadRetained(sourceParsed.json, motionParsed.json)
	validateBuiltPresenterMotionChannels(motionParsed.json, motionContract)
	const nativeIds = motionContract.motions.filter(row => row.source === 'native-mixamo').map(row => row.intent)
	if (motion.retargetValidation.length !== nativeIds.length || motion.retargetValidation.some(row =>
		!nativeIds.includes(row.motionId) || row.status !== 'PASS' || row.maxParityErrorDegrees > 0.01 || row.boundaryBlendMs !== 0)) {
		throw new Error(`Mena native motion retarget parity failed: ${JSON.stringify(motion.retargetValidation)}`)
	}

	// The original hybrid already has a native PowerPoint-safe stopped pose.
	// Replacing it with the first frame of the transplanted Mixamo idle clip
	// makes Mena's arms swing behind her in PowerPoint, even though the numeric
	// arm-drop check still passes. Preserve the source base pose instead.
	const staticSafety = assertPowerPointSafeStaticPose(motion.glb, { label: 'Mena source base' })
	const staticPose = {
		buffer: motion.glb,
		clipName: 'source-base-pose',
		clipIndex: null,
		sampleTimeMs: null,
		changedNodeChannels: 0,
		powerPointStaticPose: staticSafety,
	}
	if (!motionParsed.bin.equals(parseGlb(staticPose.buffer).bin)) {
		throw new Error('Mena static display pose changed the motion/visible binary payload')
	}
	const preOptimizationParsed = parseGlb(staticPose.buffer)
	const geometryBefore = geometryStats(preOptimizationParsed.json)
	const simplified = await simplifyGlbGeometrySafeBuffer(staticPose.buffer, { ratio: MENA_GEOMETRY_RATIO, error: 1 })
	const optimizedTextures = await optimizeGlbTexturesSafeBuffer(simplified, { maxTextureSize: MENA_TEXTURE_MAX_SIZE })
	const canonical = canonicalizeMixamoBoneNames(optimizedTextures.buffer)
	const outputParsed = parseGlb(canonical.buffer)
	assertVisiblePayloadRetained(sourceParsed.json, outputParsed.json, { allowGeometryRebuild: true })
	validateBuiltPresenterMotionChannels(outputParsed.json, motionContract)
	const geometryAfter = assertPowerPointSafeGeometry(outputParsed.json)
	const finalStaticSafety = assertPowerPointSafeStaticPose(canonical.buffer, { label: 'Mena fourth presenter' })
	const contacts = resolveDefaultPresenterContacts(canonical.buffer, motionContract)
	const materials = inspectMaterialProfile(canonical.buffer)
	if (!materials.length || materials.some(material =>
		material.metallicFactor !== 0 || material.roughnessFactor !== 1
		|| material.hasMetallicRoughnessTexture || material.hasSpecularExtension)) {
		throw new Error(`Mena strict matte material drift: ${JSON.stringify(materials)}`)
	}

	fs.writeFileSync(outputPath, canonical.buffer)
	const report = {
		schemaVersion: 'betterpptx.default-presenter-mena-build.v1',
		status: 'RESEARCH_ONLY_OWNER_GATED',
		audienceFocus: 'youth-and-young-adult-topics',
		motionContract: { path: motionContractPath, sha256: sha256(Buffer.from(JSON.stringify(motionContract))) },
		source: { path: sourcePath, bytes: source.length, sha256: sha256(source), meshes: sourceParsed.json.meshes?.length || 0, skins: sourceParsed.json.skins?.length || 0, joints: sourceParsed.json.skins?.[0]?.joints?.length || 0, images: sourceParsed.json.images?.length || 0, textures: sourceParsed.json.textures?.length || 0 },
		output: { path: outputPath, bytes: canonical.buffer.length, sha256: sha256(canonical.buffer), meshes: outputParsed.json.meshes?.length || 0, skins: outputParsed.json.skins?.length || 0, joints: outputParsed.json.skins?.[0]?.joints?.length || 0, images: outputParsed.json.images?.length || 0, textures: outputParsed.json.textures?.length || 0, animationTargetPaths: animationTargetPaths(outputParsed.json) },
		geometry: { before: geometryBefore, after: geometryAfter, simplifier: { ratio: MENA_GEOMETRY_RATIO, error: 1 }, textureOptimization: optimizedTextures.report, canonicalBoneNamesChanged: canonical.changed, canonicalBoneCount: canonical.canonicalBoneCount },
		motion: { nativeRetargetValidation: motion.retargetValidation, report: motion.report, boneNameMatching: selections.filter(selection => selection.boneNameMatch).map(selection => ({ motionId: selection.motionId, ...selection.boneNameMatch })) },
		staticPose: {
			clipName: staticPose.clipName,
			clipIndex: staticPose.clipIndex,
			sampleTimeMs: staticPose.sampleTimeMs,
			changedNodeChannels: staticPose.changedNodeChannels,
			powerPointStaticPose: finalStaticSafety,
		},
		contacts,
		materials,
		poster: { path: posterPath, bytes: fs.statSync(posterPath).size, sha256: sha256(fs.readFileSync(posterPath)) },
		releaseBoundary: { ownerApprovalRequired: true, liveMeshyCanaryRequired: true, approvedForAutomaticSelection: false },
	}
	const reportPath = path.join(here, 'default-presenter-mena-build-report.json')
	fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
	return { reportPath, ...report }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	console.log(JSON.stringify(await buildMenaPresenterRoster(), null, 2))
}
