#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { constrainPresenterArmArticulations, DEFAULT_CONSTRAINTS } from './assets/glb-joint-rotation-constraints.mjs'
import { smoothRotationAnimations } from './assets/glb-motion-smoothing.mjs'
import { applyStaticPoseFromSource, assertPowerPointSafeStaticPose } from './assets/glb-static-pose-profile.mjs'
import { presenterMotionSourceProvider, validateDefaultPresenterBuildContract } from './assets/build-default-presenter-roster.mjs'
import { parseGlb, transplantMotionSet } from './ir/kinetic-transplant.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.dirname(here)
const assets = path.join(here, 'assets')
// Legacy display names follow the selected source, never an output intent that
// may later be replaced. Explicit contract provenance always has precedence.
const legacySourceTakeNames = {
	proven: {
		idle: 'Breathing Idle', greet: 'Waving', point: 'Pointing', magnitude: 'Rallying', contrast: 'Weight Shift Gesture',
		ask: 'Shrugging', present: 'Standing Greeting', agree: 'Lengthy Head Nod', bow: 'Quick Informal Bow',
		think: 'Thinking', disagree: 'Shaking Head No', happy: 'Cheering', surprise: 'Surprised', walk: 'Walking (in place)',
	},
	kimodo: { talk: 'Kimodo standing talk', clap: 'Kimodo standing clap' },
	'kimodo-emphasize': { emphasize: 'Kimodo measured emphasize' },
}

export function buildOrdinaryMotionProvenanceRows(contract, durationsMs) {
	validateDefaultPresenterBuildContract(contract)
	if (!Array.isArray(durationsMs) || durationsMs.length !== contract.motions.length
		|| durationsMs.some(duration => !Number.isSafeInteger(duration) || duration <= 0)) throw new Error('Ordinary motion provenance requires each exact measured whole-millisecond duration.')
	return contract.motions.map((motion, animId) => {
		const provider = presenterMotionSourceProvider(motion.source)
		const alias = motion.sourceSlug !== motion.intent
		const legacyTake = legacySourceTakeNames[motion.source]?.[motion.sourceSlug] || motion.sourceSlug
		return {
			index: animId + 1,
			family: 'ordinary',
			bank: 'ordinary',
			animId,
			clipName: contract.clipNames[animId],
			motionId: motion.intent,
			provider,
			sourceLabel: provider === 'mixamo' ? 'SOURCE · MIXAMO' : 'SOURCE · KIMODO',
			sourceSlug: motion.sourceSlug,
			sourceTake: motion.sourceTake ?? `${legacyTake}${alias ? ` / ${motion.sourceSlug} take reused` : ''}`,
			qualifier: motion.sourceQualifier ?? (alias ? `semantic alias · ${motion.sourceSlug} take reused`
				: (provider === 'nvidia-kimodo' ? 'standing corrective generation' : 'direct approved take')),
			durationMs: durationsMs[animId],
		}
	})
}

export function expectedPresenterMotionProviderCounts(contract, banks) {
	validateDefaultPresenterBuildContract(contract)
	const counts = { mixamo: 0, 'nvidia-kimodo': 0 }
	for (const motion of contract.motions) counts[presenterMotionSourceProvider(motion.source)]++
	if (!Array.isArray(banks)) throw new Error('Source-first motion banks must be an array.')
	for (const bank of banks) {
		if (!Object.hasOwn(counts, bank?.provider) || !Array.isArray(bank?.sourceNames)) throw new Error('Unknown source-first bank provider or source coverage.')
		counts[bank.provider] += bank.sourceNames.length
	}
	return counts
}

export function validatePresenterMotionProviderCounts(motions, contract, banks) {
	const expected = expectedPresenterMotionProviderCounts(contract, banks)
	const actual = { mixamo: 0, 'nvidia-kimodo': 0 }
	for (const motion of motions) {
		if (!Object.hasOwn(actual, motion?.provider)) throw new Error('Unknown source-first motion provider.')
		actual[motion.provider]++
	}
	if (Object.keys(expected).some(provider => expected[provider] !== actual[provider])) throw new Error(`Unexpected provider counts ${JSON.stringify(actual)}; the motion contract and banks require ${JSON.stringify(expected)}.`)
	return actual
}

export async function buildPresenterMotion51SourceFirstModels() {
const outputRoot = process.env.PRESENTER_MOTION_51_OUTPUT_ROOT
	? path.resolve(process.env.PRESENTER_MOTION_51_OUTPUT_ROOT)
	: path.join(repo, 'outputs', 'mixamo', 'presenter-motion-51-source-first')
const identities = ['joe', 'louise', 'pete']
const kineticLibraryPath = process.env.PRESENTER_KINETIC_LIBRARY_PATH
	? path.resolve(process.env.PRESENTER_KINETIC_LIBRARY_PATH)
	: path.join(assets, 'kinetic-clips.glb')
const nativeKineticLibraryDir = process.env.PRESENTER_NATIVE_KINETIC_LIBRARY_DIR
	? path.resolve(process.env.PRESENTER_NATIVE_KINETIC_LIBRARY_DIR)
	: null
const kineticLibrary = fs.readFileSync(kineticLibraryPath)
const kineticNames = parseGlb(kineticLibrary).json.animations.map(animation => animation.name)
const nativeKineticLibraries = new Map()
const kineticLibraryFor = sourceName => {
	if (!nativeKineticLibraryDir) return { library: kineticLibrary, libraryKey: 'canonical-kinetic-library' }
	const cached = nativeKineticLibraries.get(sourceName)
	if (cached) return cached
	const sourcePath = path.join(nativeKineticLibraryDir, `${sourceName}.glb`)
	if (!fs.existsSync(sourcePath)) throw new Error(`missing native Mixamo kinetic library for ${sourceName}: ${sourcePath}`)
	const library = fs.readFileSync(sourcePath)
	const names = parseGlb(library).json.animations.map(animation => animation.name)
	if (!names.includes(sourceName)) throw new Error(`native Mixamo library ${sourcePath} does not contain ${sourceName}: ${names.join(', ')}`)
	const entry = { library, libraryKey: `native-${sourceName}`, sourcePath }
	nativeKineticLibraries.set(sourceName, entry)
	return entry
}
const kineticSourcePolicy = JSON.parse(fs.readFileSync(path.join(here, 'deploy', 'model3d-worker', 'bake', 'kinetic-clips-map.json'), 'utf8')).clips
const ordinaryContract = JSON.parse(fs.readFileSync(path.join(assets, 'default-presenter-motion-contract.json'), 'utf8'))
validateDefaultPresenterBuildContract(ordinaryContract)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')

const accessorMaximum = (json, bin, accessorIndex) => {
	const accessor = json.accessors[accessorIndex]
	const view = json.bufferViews[accessor.bufferView]
	const start = (view.byteOffset || 0) + (accessor.byteOffset || 0)
	const stride = view.byteStride || 4
	let maximum = 0
	for (let index = 0; index < accessor.count; index++) maximum = Math.max(maximum, bin.readFloatLE(start + index * stride))
	return maximum
}

const animationDurationsMs = buffer => {
	const { json, bin } = parseGlb(buffer)
	return (json.animations || []).map(animation => Math.round(Math.max(...animation.samplers.map(sampler => accessorMaximum(json, bin, sampler.input))) * 1000))
}

const banks = [
	{ id: 'mixamo-kinetic-a', family: 'kinetic', provider: 'mixamo', library: kineticLibrary, sourceNames: kineticNames.slice(0, 18) },
	{ id: 'mixamo-kinetic-b', family: 'kinetic', provider: 'mixamo', library: kineticLibrary, sourceNames: kineticNames.slice(18) },
	{
		id: 'mixamo-essential', family: 'interaction-essential', provider: 'mixamo', sourceKind: 'kinetic',
		sourceNames: ['12_heavy_push', '30_atlas_lift'],
		outputSlugs: ['press_tap', 'grab_carry_near'],
		includeBonesByAnim: [[
			'mixamorig:Hips', 'mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2',
			'mixamorig:Neck', 'mixamorig:Head', 'mixamorig:RightShoulder',
			'mixamorig:RightArm', 'mixamorig:RightForeArm', 'mixamorig:RightHand',
		], null],
	},
]

const modelRows = []
for (const bank of banks) {
	for (const identity of identities) {
		const constructionPath = path.join(assets, `presenter-source-${identity}-static.glb`)
		const displayPath = path.join(assets, `default-presenter-${identity}.glb`)
		const construction = fs.readFileSync(constructionPath)
		const display = fs.readFileSync(displayPath)
		const selections = bank.sourceNames.map((sourceName, animId) => {
			const semanticSlug = sourceName.replace(/^\d{2}_/, '')
			const outputSlug = bank.outputSlugs?.[animId] || semanticSlug
			const sourcePolicy = kineticSourcePolicy[semanticSlug] || {}
			const sourceLibrary = bank.family === 'kinetic' || bank.sourceKind === 'kinetic'
				? kineticLibraryFor(sourceName)
				: { library: bank.library, libraryKey: bank.id }
			return {
				motionId: sourceName,
				sourceSlug: sourceName,
				outputSlug,
				library: sourceLibrary.library,
				libraryKey: sourceLibrary.libraryKey,
				rotationRetargetSpace: 'global',
				channelPolicy: (bank.family === 'kinetic' || bank.sourceKind === 'kinetic') && sourcePolicy.inPlace === false ? 'root-motion' : 'rotation-only',
				...(bank.includeBonesByAnim?.[animId] ? { includeBones: bank.includeBonesByAnim[animId] } : {}),
				...((bank.family === 'kinetic' || bank.sourceKind === 'kinetic') && sourcePolicy.inPlace === false ? {
					rootMotionAnchor: sourcePolicy.rootAnchor || 'start',
					rootMotionMaxStatures: 0.35,
					rootMotionMaxHorizontalStatures: 0.5,
				} : {}),
			}
		})
		const transplanted = transplantMotionSet(construction, selections, {
			rotationRetargetSpace: 'global',
		})
		if (transplanted.retargetValidation.some(row => row.status !== 'PASS' || row.maxParityErrorDegrees > 0.01)) {
			throw new Error(`${bank.id}/${identity} failed global retarget parity`)
		}
		let animated = transplanted.glb
		let articulation = null
		let stabilization = null
		if (bank.provider === 'nvidia-kimodo') {
			const animationNames = bank.sourceNames.map((name, index) => `${String(index).padStart(2, '0')}_${name.replace(/^\d{2}_/, '')}`)
			const constraints = Object.fromEntries(Object.entries(DEFAULT_CONSTRAINTS).map(([joint, constraint]) => [
				joint,
				constraint.twistMaxDegrees ? { ...constraint, twistAnimationNames: animationNames } : constraint,
			]))
			articulation = constrainPresenterArmArticulations(animated, { animationNames, constraints })
			stabilization = smoothRotationAnimations(articulation.buffer, { passes: 2, animationNames, maxStepDegrees: 18, preserveFirstKey: true })
			animated = stabilization.buffer
		}
		const staticPose = applyStaticPoseFromSource(animated, display, { clipName: '00_idle' })
		const powerPointStaticPose = assertPowerPointSafeStaticPose(staticPose.buffer, { label: `${bank.id}/${identity}` })
		const outputDir = path.join(outputRoot, bank.id, identity)
		const outputPath = path.join(outputDir, `default-presenter-${identity}-${bank.id}.glb`)
		fs.mkdirSync(outputDir, { recursive: true })
		fs.writeFileSync(outputPath, staticPose.buffer)
		modelRows.push({
			bank: bank.id,
			provider: bank.provider,
			identity,
			path: outputPath,
			bytes: staticPose.buffer.length,
			sha256: sha256(staticPose.buffer),
			animationNames: parseGlb(staticPose.buffer).json.animations.map(animation => animation.name),
			durationsMs: animationDurationsMs(staticPose.buffer),
			retargetValidation: transplanted.retargetValidation,
			powerPointStaticPose,
			...(articulation ? { articulation: articulation.report } : {}),
			...(stabilization ? { stabilization: stabilization.report } : {}),
		})
	}
}

const ordinaryJoe = fs.readFileSync(path.join(assets, 'default-presenter-joe.glb'))
const ordinaryDurations = animationDurationsMs(ordinaryJoe)
const motions = buildOrdinaryMotionProvenanceRows(ordinaryContract, ordinaryDurations)

let nextIndex = motions.length + 1
for (const bank of banks.slice(0, 2)) {
	const joe = modelRows.find(row => row.bank === bank.id && row.identity === 'joe')
	for (let animId = 0; animId < bank.sourceNames.length; animId++) {
		const sourceName = bank.sourceNames[animId]
		const semanticSlug = sourceName.replace(/^\d{2}_/, '')
		const sourcePolicy = kineticSourcePolicy[semanticSlug] || {}
		motions.push({
			index: nextIndex++,
			family: bank.family,
			bank: bank.id,
			animId,
			clipName: joe.animationNames[animId],
			motionId: semanticSlug,
			displayName: sourcePolicy.displayName || semanticSlug.replaceAll('_', ' '),
			provider: 'mixamo',
			sourceLabel: 'SOURCE · MIXAMO',
			sourceSlug: sourceName,
			sourceTake: sourcePolicy.sourceTake || path.basename(sourcePolicy.fbx || semanticSlug, path.extname(sourcePolicy.fbx || '')),
			sourceFbx: sourcePolicy.fbx || null,
			inPlace: sourcePolicy.inPlace !== false,
			rootAnchor: sourcePolicy.rootAnchor || null,
			qualifier: sourcePolicy.sourceQualifier || 'direct approved kinetic take',
			durationMs: joe.durationsMs[animId],
		})
	}
}
const essentialJoe = modelRows.find(row => row.bank === 'mixamo-essential' && row.identity === 'joe')
for (let animId = 0; animId < 2; animId++) {
	const sourceName = banks[2].sourceNames[animId]
	const semanticSlug = sourceName.replace(/^\d{2}_/, '')
	const motionId = banks[2].outputSlugs[animId]
	const sourcePolicy = kineticSourcePolicy[semanticSlug] || {}
	motions.push({
		index: nextIndex++,
		family: 'interaction-essential',
		bank: 'mixamo-essential',
		animId,
		clipName: essentialJoe.animationNames[animId],
		motionId,
		displayName: animId === 0 ? 'Press Tap' : 'Grab Carry Near',
		provider: 'mixamo',
		sourceLabel: 'SOURCE · MIXAMO',
		sourceSlug: sourceName,
		sourceTake: sourcePolicy.sourceTake || (animId === 0 ? 'Pushing' : 'Lifting'),
		sourceFbx: sourcePolicy.fbx || null,
		qualifier: animId === 0
			? 'semantic interaction alias · proven forward hand-contact take'
			: 'semantic interaction alias · proven near-body lift and release take',
		durationMs: essentialJoe.durationsMs[animId],
	})
}
if (motions.length !== 51) throw new Error(`expected 51 source-first motions, received ${motions.length}`)
const providerCounts = validatePresenterMotionProviderCounts(motions, ordinaryContract, banks)
const selectionPolicy = providerCounts['nvidia-kimodo'] === 0
	? 'Active source-first materialization is Mixamo-only: every contract and kinetic-bank row is sourced from the governed Mixamo libraries; the quarantined own-provider Kimodo candidates are not selected or substituted.'
	: `Active source-first materialization preserves Mixamo coverage and keeps ${providerCounts['nvidia-kimodo']} own-provider rows quarantined until their independent native playback proof is complete.`

const report = {
	schemaVersion: 'betterpptx.presenter-motion-51-source-first.v1',
	status: 'PASS',
	selectionPolicy,
	kineticRetargetPipeline: nativeKineticLibraryDir
		? 'Direct per-take Mixamo native-axis library -> anchored and PowerPoint-viewport-bounded root motion -> one global rest-aware presenter retarget; no intermediate canonical local-rotation bake.'
		: 'Canonical kinetic library -> global rest-aware presenter retarget.',
	providerCounts,
	motions,
	models: modelRows,
	ordinaryModels: Object.fromEntries(identities.map(identity => [identity, path.join(assets, `default-presenter-${identity}.glb`)])),
	posters: Object.fromEntries(identities.map(identity => [identity, path.join(assets, `default-presenter-${identity}.png`)])),
}
fs.mkdirSync(outputRoot, { recursive: true })
fs.writeFileSync(path.join(outputRoot, 'source-first-manifest.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ status: report.status, motions: motions.length, providerCounts, models: modelRows.map(row => ({ bank: row.bank, identity: row.identity, bytes: row.bytes, sha256: row.sha256 })) }, null, 2))
return report
}

// Provenance helpers are read-only on import; full asset generation is explicit.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildPresenterMotion51SourceFirstModels()
