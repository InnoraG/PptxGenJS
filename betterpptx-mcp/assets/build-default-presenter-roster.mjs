import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getBounds, NodeIO } from '@gltf-transform/core'
import { prune } from '@gltf-transform/functions'

import { applyUniformSceneScale, inspectMaterialProfile } from './glb-material-profile.mjs'
import { applyStaticPoseProfile } from './glb-static-pose-profile.mjs'
import { matchMixamoMotionBoneNames } from './mixamo-motion-bone-names.mjs'
import { parseGlb, transplantMotionSet } from '../ir/kinetic-transplant.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const io = new NodeIO()
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex')
const LOUISE_TO_JOE_HEIGHT_TARGET = 0.94
const canonicalClips = JSON.parse(fs.readFileSync(new URL('../deploy/model3d-worker/canonical/canonical-clipmap.json', import.meta.url), 'utf8'))

export function presenterMotionSourceProvider(source) {
	if (source === 'proven' || source === 'native-mixamo') return 'mixamo'
	if (source === 'kimodo' || source === 'kimodo-emphasize') return 'nvidia-kimodo'
	throw new Error(`Unsupported presenter motion source: ${String(source)}`)
}

function safeNativeSourceFile(sourceFile) {
	if (typeof sourceFile !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.glb$/.test(sourceFile)
		|| /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(sourceFile)) {
		throw new Error('A native presenter motion sourceFile must be a safe GLB basename.')
	}
	return sourceFile
}

export function validateDefaultPresenterBuildContract(contract) {
	if (!Array.isArray(contract?.clipNames) || !Array.isArray(contract?.motions)
		|| contract.clipNames.length !== canonicalClips.clipNames.length || contract.motions.length !== canonicalClips.clipNames.length
		|| contract.clipNames.some((name, index) => name !== canonicalClips.clipNames[index])) {
		throw new Error('Presenter motion contract must retain the exact canonical ordered clips.')
	}
	contract.motions.forEach((motion, index) => {
		if (!motion || motion.intent !== canonicalClips.intents[index] || typeof motion.sourceSlug !== 'string' || !motion.sourceSlug.trim()
			|| !Number.isSafeInteger(motion.expectedRotationChannels) || motion.expectedRotationChannels < 1) {
			throw new Error(`Invalid presenter motion identity, source slug or channel count at slot ${index}.`)
		}
		presenterMotionSourceProvider(motion.source)
		for (const field of ['sourceTake', 'sourceQualifier']) {
			if (motion[field] !== undefined && (typeof motion[field] !== 'string' || !motion[field].trim())) throw new Error(`Invalid presenter motion ${field} at slot ${index}.`)
		}
		if (motion.source === 'native-mixamo') {
			safeNativeSourceFile(motion.sourceFile)
			if (!['rotation-only', 'root-motion'].includes(motion.channelPolicy) || motion.rotationRetargetSpace !== 'global' || motion.boneNamePolicy !== 'mixamo-suffix'
				|| typeof motion.sourceTake !== 'string' || !motion.sourceTake.trim()) {
				throw new Error(`Native presenter motion ${motion.intent} requires its exact take, explicit channel policy, global retarget and collision-checked bone-name policy.`)
			}
			if (motion.channelPolicy === 'root-motion' && (motion.rootMotionSpace !== 'world' || motion.rootMotionAnchor !== 'start'
				|| !Number.isFinite(motion.rootMotionMaxStatures) || motion.rootMotionMaxStatures <= 0
				|| !Number.isFinite(motion.rootMotionMaxHorizontalStatures) || motion.rootMotionMaxHorizontalStatures <= 0)) {
				throw new Error(`Native presenter motion ${motion.intent} requires world-space root motion anchored at the start with explicit positive stature bounds.`)
			}
			if (motion.channelPolicy === 'rotation-only' && ['rootMotionSpace', 'rootMotionAnchor', 'rootMotionMaxStatures', 'rootMotionMaxHorizontalStatures'].some(field => motion[field] !== undefined)) {
				throw new Error(`Rotation-only presenter motion ${motion.intent} cannot silently discard root-motion options.`)
			}
		} else if (motion.sourceFile !== undefined || motion.boneNamePolicy !== undefined
			|| (motion.channelPolicy !== undefined && motion.channelPolicy !== 'rotation-only')
			|| (motion.rotationRetargetSpace !== undefined && motion.rotationRetargetSpace !== 'local')
			|| ['rootMotionSpace', 'rootMotionAnchor', 'rootMotionMaxStatures', 'rootMotionMaxHorizontalStatures'].some(field => motion[field] !== undefined)) {
			throw new Error(`Legacy presenter motion ${motion.intent} cannot silently change its source or local rotation policy.`)
		}
	})
	return contract
}

function validateNativeMotionSource(library, motion) {
	if (!Buffer.isBuffer(library) && !(library instanceof Uint8Array)) throw new Error(`Missing native presenter motion library: ${motion.sourceFile}`)
	const { json } = parseGlb(library)
	const animation = json.animations?.[0]
	if (json.animations?.length !== 1 || animation?.name !== motion.sourceSlug) throw new Error(`Native source must contain the exact single motion ${motion.sourceSlug}.`)
	const channels = animation.channels
	const rotations = Array.isArray(channels) ? channels.filter(channel => channel?.target?.path === 'rotation') : []
	const hipsTranslations = Array.isArray(channels) ? channels.filter(channel => channel?.target?.path === 'translation'
		&& /^mixamorig\d*:Hips$/.test(json.nodes?.[channel.target.node]?.name || '')) : []
	// Native donor files may retain the original TRS tracks. The explicit
	// transplant policy discards non-root translations and scales; only the
	// delivered output is required to contain rotations plus the retained Hips T.
	if (!Array.isArray(channels) || rotations.length !== motion.expectedRotationChannels
		|| channels.some(channel => !Number.isSafeInteger(channel?.target?.node) || channel.target.node < 0
			|| typeof json.nodes?.[channel.target.node]?.name !== 'string' || !json.nodes[channel.target.node].name.trim()
			|| !['rotation', 'translation', 'scale'].includes(channel.target.path)
			|| !Number.isSafeInteger(channel.sampler) || channel.sampler < 0 || !animation.samplers?.[channel.sampler])
		|| new Set(channels.map(channel => `${channel.target.node}:${channel.target.path}`)).size !== channels.length
		|| (motion.channelPolicy === 'root-motion' && (hipsTranslations.length !== 1
			|| !rotations.some(channel => channel.target.node === hipsTranslations[0].target.node)))) {
		throw new Error(`Native source rotation coverage does not match ${motion.intent}.`)
	}
	return library
}

/** Prepare sources for one construction rig; never smooth native donor tracks. */
export function buildDefaultPresenterMotionSelections(contract, targetBuffer, {
	libraries = {},
	readNativeSource = sourceFile => fs.readFileSync(path.join(here, sourceFile)),
} = {}) {
	validateDefaultPresenterBuildContract(contract)
	return contract.motions.map((motion, index) => {
		let library = libraries[motion.source]
		let boneNameMatch = null
		if (motion.source === 'native-mixamo') {
			const source = validateNativeMotionSource(readNativeSource(safeNativeSourceFile(motion.sourceFile)), motion)
			const matched = matchMixamoMotionBoneNames(source, targetBuffer)
			library = matched.buffer
			boneNameMatch = matched.report
		}
		if (!Buffer.isBuffer(library) && !(library instanceof Uint8Array)) throw new Error(`Missing presenter motion library for ${motion.source}.`)
		return {
			motionId: motion.intent,
			sourceSlug: motion.sourceSlug,
			outputSlug: motion.intent,
			library,
			libraryKey: `${motion.source}-presenter-motion${motion.source === 'native-mixamo' ? `:${motion.sourceFile}` : ''}`,
			expectedName: contract.clipNames[index],
			...(boneNameMatch ? { channelPolicy: motion.channelPolicy, rotationRetargetSpace: motion.rotationRetargetSpace, boneNameMatch,
				...(motion.channelPolicy === 'root-motion' ? {
					rootMotionSpace: motion.rootMotionSpace,
					rootMotionAnchor: motion.rootMotionAnchor,
					rootMotionMaxStatures: motion.rootMotionMaxStatures,
					rootMotionMaxHorizontalStatures: motion.rootMotionMaxHorizontalStatures,
				} : {}),
			} : {}),
		}
	})
}

export function validateBuiltPresenterMotionChannels(json, contract) {
	validateDefaultPresenterBuildContract(contract)
	if (!Array.isArray(json.animations) || json.animations.length !== contract.clipNames.length
		|| json.animations.some((animation, index) => animation.name !== contract.clipNames[index])) throw new Error('Presenter output clip order or cardinality drifted.')
	return json.animations.map((animation, index) => {
		const channels = animation.channels
		const expectedTranslations = contract.motions[index].channelPolicy === 'root-motion' ? 1 : 0
		const rotations = Array.isArray(channels) ? channels.filter(channel => channel?.target?.path === 'rotation') : []
		const translations = Array.isArray(channels) ? channels.filter(channel => channel?.target?.path === 'translation') : []
		if (!Array.isArray(channels) || rotations.length !== contract.motions[index].expectedRotationChannels || translations.length !== expectedTranslations
			|| channels.length !== rotations.length + translations.length
			|| translations.some(channel => !/^mixamorig\d*:Hips$/.test(json.nodes?.[channel.target.node]?.name || ''))) throw new Error(`Presenter output motion-channel drift at ${contract.clipNames[index]}.`)
		return { rotation: rotations.length, ...(translations.length ? { translation: translations.length } : {}) }
	})
}

export async function buildDefaultPresenterRoster() {

const motionContractPath = path.join(here, 'default-presenter-motion-contract.json')
const motionContract = JSON.parse(fs.readFileSync(motionContractPath, 'utf8'))
validateDefaultPresenterBuildContract(motionContract)
const disabledMotionSources = motionContract.motions.filter(motion => presenterMotionSourceProvider(motion.source) !== 'mixamo')
if (disabledMotionSources.length) {
	throw new Error(`The default presenter roster is Mixamo-only; disabled source rows: ${disabledMotionSources.map(motion => motion.intent).join(', ')}`)
}
const provenLibraryPath = path.join(here, 'presenter-motion-library-proven-v1.glb')
const louiseStaticPath = path.join(here, 'presenter-source-louise-static.glb')
const presenters = [
	{
		identity: 'joe',
		sourcePath: path.join(here, 'presenter-source-joe-static.glb'),
		outputPath: path.join(here, 'default-presenter-joe.glb'),
		posterOutput: path.join(here, 'default-presenter-joe.png'),
	},
	{
		identity: 'louise',
		sourcePath: louiseStaticPath,
		outputPath: path.join(here, 'default-presenter-louise.glb'),
		posterOutput: path.join(here, 'default-presenter-louise.png'),
	},
	{
		identity: 'pete',
		sourcePath: path.join(here, 'presenter-source-pete-static.glb'),
		outputPath: path.join(here, 'default-presenter-pete.glb'),
		posterOutput: path.join(here, 'default-presenter-pete.png'),
	},
]

for (const required of [motionContractPath, provenLibraryPath, ...presenters.filter(item => item.identity !== 'louise').map(item => item.sourcePath)]) {
	if (!fs.existsSync(required)) throw new Error(`Missing presenter roster input: ${required}`)
}
const nativeLibraries = new Map(motionContract.motions.filter(motion => motion.source === 'native-mixamo').map(motion => [
	motion.sourceFile,
	validateNativeMotionSource(fs.readFileSync(path.join(here, safeNativeSourceFile(motion.sourceFile))), motion),
]))

const provenLibrary = fs.readFileSync(provenLibraryPath)

const accessorDigest = accessor => {
	const array = accessor?.getArray()
	return array ? sha256(Buffer.from(array.buffer, array.byteOffset, array.byteLength)) : null
}
const visiblePayloadFingerprint = document => ({
	meshes: document.getRoot().listMeshes().map(mesh => mesh.listPrimitives().map(primitive => ({
		attributes: primitive.listSemantics().map(semantic => [semantic, accessorDigest(primitive.getAttribute(semantic))]),
		indices: accessorDigest(primitive.getIndices()),
	}))),
	textures: document.getRoot().listTextures().map(texture => [texture.getName(), texture.getMimeType(), sha256(texture.getImage())]),
	skins: document.getRoot().listSkins().map(skin => skin.listJoints().map(joint => joint.getName())),
})
const originalLouiseDoc = await io.readBinary(provenLibrary)
const originalLouiseFingerprint = visiblePayloadFingerprint(originalLouiseDoc)
const originalWorldByName = new Map(originalLouiseDoc.getRoot().listNodes().map(node => [node.getName(), [...node.getWorldMatrix()]]))
for (const animation of originalLouiseDoc.getRoot().listAnimations()) animation.dispose()
await originalLouiseDoc.transform(prune())
const louiseStatic = Buffer.from(await io.writeBinary(originalLouiseDoc))
const staticLouiseDoc = await io.readBinary(louiseStatic)
const staticLouiseFingerprint = visiblePayloadFingerprint(staticLouiseDoc)
if (JSON.stringify(originalLouiseFingerprint) !== JSON.stringify(staticLouiseFingerprint)) {
	throw new Error('Louise static compaction changed mesh, texture, or skin payload')
}
let louiseStaticMaxWorldMatrixError = 0
for (const node of staticLouiseDoc.getRoot().listNodes()) {
	const before = originalWorldByName.get(node.getName())
	if (!before) throw new Error(`Louise static compaction changed node identity: ${node.getName()}`)
	const after = node.getWorldMatrix()
	for (let index = 0; index < before.length; index++) {
		louiseStaticMaxWorldMatrixError = Math.max(louiseStaticMaxWorldMatrixError, Math.abs(before[index] - after[index]))
	}
}
if (louiseStaticMaxWorldMatrixError > 0.00001) {
	throw new Error(`Louise static compaction changed node transforms: ${louiseStaticMaxWorldMatrixError}`)
}
fs.writeFileSync(louiseStaticPath, louiseStatic)

const libraries = { proven: provenLibrary }

const boundsHeight = async buffer => {
	const doc = await io.readBinary(buffer)
	const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0]
	const bounds = getBounds(scene)
	return bounds.max[1] - bounds.min[1]
}

const built = new Map()
for (const presenter of presenters) {
	const source = fs.readFileSync(presenter.sourcePath)
	const sourceParsed = parseGlb(source)
	const selections = buildDefaultPresenterMotionSelections(motionContract, source, { libraries, readNativeSource: sourceFile => nativeLibraries.get(sourceFile) })
	const motion = transplantMotionSet(source, selections, { strict: true, channelPolicy: 'rotation-only' })
	if (motion.report.some(row => !String(row.status).includes('skip=0'))) {
		throw new Error(`${presenter.identity} motion transplant skipped channels: ${JSON.stringify(motion.report)}`)
	}
	const outputParsed = parseGlb(motion.glb)
	validateBuiltPresenterMotionChannels(outputParsed.json, motionContract)
	const nativeIds = motionContract.motions.filter(row => row.source === 'native-mixamo').map(row => row.intent)
	if (motion.retargetValidation.length !== nativeIds.length || motion.retargetValidation.some(row =>
		!nativeIds.includes(row.motionId) || row.status !== 'PASS' || row.maxParityErrorDegrees > 0.01 || row.boundaryBlendMs !== 0)) {
		throw new Error(`${presenter.identity} native motion retarget parity failed`)
	}
	if ((outputParsed.json.meshes || []).length !== (sourceParsed.json.meshes || []).length) {
		throw new Error(`${presenter.identity} mesh count changed during motion-only build`)
	}
	built.set(presenter.identity, { presenter, source, buffer: motion.glb, report: motion.report,
		boneNameMatching: selections.filter(selection => selection.boneNameMatch).map(selection => ({ motionId: selection.motionId, ...selection.boneNameMatch })),
	})
}

for (const entry of built.values()) {
	const before = parseGlb(entry.buffer)
	const staticPose = applyStaticPoseProfile(entry.buffer)
	const after = parseGlb(staticPose.buffer)
	if (!before.bin.equals(after.bin)) throw new Error(`${entry.presenter.identity} static display pose changed binary payload`)
	entry.buffer = staticPose.buffer
	entry.staticPose = staticPose
}

const joeHeight = await boundsHeight(built.get('joe').buffer)
const louise = built.get('louise')
const louiseHeightBefore = await boundsHeight(louise.buffer)
const louiseUniformScale = LOUISE_TO_JOE_HEIGHT_TARGET * joeHeight / louiseHeightBefore
if (Math.abs(louiseUniformScale - 1) > 0.0005) {
	louise.buffer = applyUniformSceneScale(louise.buffer, louiseUniformScale, { rootName: 'LouiseCastHeightRoot' }).buffer
}

const report = {
	schemaVersion: 'betterpptx.default-presenter-roster-build.v11',
	motionContract: motionContractPath,
	provenLibrary: { path: provenLibraryPath, bytes: provenLibrary.length, sha256: sha256(provenLibrary) },
	louiseStaticBase: {
		path: louiseStaticPath,
		bytes: louiseStatic.length,
		sha256: sha256(louiseStatic),
		removedAnimations: 18,
		meshTextureSkinPayloadExact: true,
		maxWorldMatrixError: louiseStaticMaxWorldMatrixError,
	},
	articulationPolicy: {
		stage: 'post-retarget-post-display-pose-per-presenter',
		animations: [],
		provider: 'mixamo-only',
		postRetargetSmoothing: false,
	},
	nativeMixamoLibraries: [...nativeLibraries].map(([sourceFile, library]) => ({ sourceFile, bytes: library.length, sha256: sha256(library), smoothing: false })),
	presenters: {},
}

for (const { identity, sourcePath, outputPath, posterSource, posterOutput } of presenters) {
	const entry = built.get(identity)
	fs.writeFileSync(outputPath, entry.buffer)
	if (posterSource && fs.existsSync(posterSource)) fs.copyFileSync(posterSource, posterOutput)

	const doc = await io.read(outputPath)
	const root = doc.getRoot()
	const names = root.listAnimations().map(animation => animation.getName())
	if (JSON.stringify(names) !== JSON.stringify(motionContract.clipNames)) {
		throw new Error(`${identity} clip order drift: ${JSON.stringify(names)}`)
	}
	if (root.listSkins().length !== 1 || root.listSkins()[0].listJoints().length !== 65) {
		throw new Error(`${identity} skeleton drift`)
	}
	const animationTargetPaths = root.listAnimations().map(animation =>
		animation.listChannels().reduce((counts, channel) => {
			const target = channel.getTargetPath() || 'unknown'
			counts[target] = (counts[target] || 0) + 1
			return counts
		}, {})
	)
	if (animationTargetPaths.some((counts, index) =>
		(counts.rotation || 0) !== motionContract.motions[index].expectedRotationChannels
		|| (counts.translation || 0) !== (motionContract.motions[index].channelPolicy === 'root-motion' ? 1 : 0)
		|| Object.keys(counts).some(key => !['rotation', 'translation'].includes(key))
	)) throw new Error(`${identity} unsafe animation channel drift: ${JSON.stringify(animationTargetPaths)}`)
	const materials = inspectMaterialProfile(entry.buffer)
	if (!materials.length || materials.some(material =>
		material.metallicFactor !== 0 || material.roughnessFactor !== 1 || material.hasMetallicRoughnessTexture || material.hasSpecularExtension
	)) throw new Error(`${identity} strict matte material drift: ${JSON.stringify(materials)}`)
	const height = await boundsHeight(entry.buffer)
	report.presenters[identity] = {
		source: { path: sourcePath, bytes: entry.source.length, sha256: sha256(entry.source) },
		output: { path: outputPath, bytes: entry.buffer.length, sha256: sha256(entry.buffer) },
		poster: fs.existsSync(posterOutput) ? { path: posterOutput, bytes: fs.statSync(posterOutput).size } : null,
		meshes: root.listMeshes().length,
		textures: root.listTextures().length,
		joints: 65,
		clips: names.length,
		animationTargetPaths,
		materials,
		staticPose: {
			clipName: entry.staticPose.clipName,
			clipIndex: entry.staticPose.clipIndex,
			sampleTimeMs: entry.staticPose.sampleTimeMs,
			changedNodeChannels: entry.staticPose.changedNodeChannels,
			binaryPayloadExact: true,
		},
		castHeight: {
			modelUnits: height,
			relativeToJoe: height / joeHeight,
			...(identity === 'louise' ? { target: LOUISE_TO_JOE_HEIGHT_TARGET, uniformScaleApplied: louiseUniformScale } : {}),
		},
		motionReport: entry.report,
		boneNameMatching: entry.boneNameMatching,
		articulationConstraints: [],
	}
}

const louiseRatio = report.presenters.louise.castHeight.relativeToJoe
if (Math.abs(louiseRatio - LOUISE_TO_JOE_HEIGHT_TARGET) > 0.001) {
	throw new Error(`Louise/Joe relative height drift: ${louiseRatio} vs ${LOUISE_TO_JOE_HEIGHT_TARGET}`)
}
const reportPath = path.join(here, 'default-presenter-roster-build-report.json')
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ reportPath, ...report }, null, 2))
return report
}

// Importing the selection/validation helpers must never regenerate any asset.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildDefaultPresenterRoster()
