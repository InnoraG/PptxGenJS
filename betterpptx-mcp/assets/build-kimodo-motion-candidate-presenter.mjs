import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { inspectMaterialProfile } from './glb-material-profile.mjs'
import { constrainPresenterArmArticulations, DEFAULT_CONSTRAINTS } from './glb-joint-rotation-constraints.mjs'
import { smoothRotationAnimations } from './glb-motion-smoothing.mjs'
import { parseGlb, serializeGlb, transplantMotionSet } from '../ir/kinetic-transplant.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.dirname(path.dirname(here))
const identity = String(process.env.PRESENTER_IDENTITY || 'joe').trim().toLowerCase()
if (!['joe', 'louise', 'pete'].includes(identity)) throw new Error(`unsupported candidate identity: ${identity}`)

const sourcePath = path.join(here, `presenter-source-${identity}-static.glb`)
const libraryPath = path.resolve(process.env.PRESENTER_LIBRARY || path.join(
	repo,
	'outputs',
	'kimodo',
	'presenter-motion-quality-20260830-v4-direct-joe-front-unpacked',
	'presenter-motion-quality-20260830-v4',
	'default-presenter-kimodo-candidate.glb',
))
const clipmapPath = path.resolve(process.env.PRESENTER_CLIPMAP || path.join(here, 'kimodo-presenter-motion-clipmap.json'))
const outputPath = path.resolve(process.env.PRESENTER_OUTPUT || path.join(
	repo,
	'outputs',
	'kimodo',
	'presenter-motion-quality-20260830-v4-unpacked',
	`default-presenter-${identity}-kimodo-candidate.glb`,
))

const source = fs.readFileSync(sourcePath)
const rawLibrary = fs.readFileSync(libraryPath)
const libraryParsed = parseGlb(rawLibrary)
const canonicalSkeleton = JSON.parse(fs.readFileSync(path.join(
	repo,
	'betterpptx-mcp',
	'deploy',
	'model3d-worker',
	'canonical',
	'canonical_skeleton.json',
), 'utf8'))
const presenterBones = new Set(canonicalSkeleton.bones.map(bone => bone.name))
for (const animation of libraryParsed.json.animations || []) {
	const sourceSamplers = animation.samplers || []
	const selected = (animation.channels || []).filter(channel => {
		const node = libraryParsed.json.nodes?.[channel.target?.node]
		return channel.target?.path === 'rotation' && presenterBones.has(node?.name)
	})
	const usedSamplers = [...new Set(selected.map(channel => channel.sampler))]
	const samplerMap = new Map(usedSamplers.map((samplerIndex, index) => [samplerIndex, index]))
	animation.samplers = usedSamplers.map(samplerIndex => sourceSamplers[samplerIndex])
	animation.channels = selected.map(channel => ({ ...channel, sampler: samplerMap.get(channel.sampler) }))
}
const unsmoothedLibrary = serializeGlb(libraryParsed.json, libraryParsed.bin)
const smoothingPasses = Number(process.env.PRESENTER_SMOOTHING_PASSES ?? 6)
const smoothing = smoothingPasses > 0
	? smoothRotationAnimations(unsmoothedLibrary, { passes: smoothingPasses })
	: { buffer: unsmoothedLibrary, report: [], passes: 0 }
const library = smoothing.buffer
const clipmap = JSON.parse(fs.readFileSync(clipmapPath, 'utf8'))
const clipNames = Array.isArray(clipmap.clipNames)
	? clipmap.clipNames
	: (clipmap.slots || []).map(slot => `${String(slot.slot).padStart(2, '0')}_${slot.slug}`)
if (!clipNames.length) throw new Error(`clip map has no clips: ${clipmapPath}`)
const selections = clipNames.map(name => {
	const sourceSlug = name.slice(name.indexOf('_') + 1)
	return { motionId: sourceSlug, sourceSlug, outputSlug: sourceSlug, library, libraryKey: 'kimodo-presenter-motion' }
})
const motion = transplantMotionSet(source, selections, { strict: true, channelPolicy: 'rotation-only' })
const constraints = Object.fromEntries(Object.entries(DEFAULT_CONSTRAINTS).map(([joint, constraint]) => [
	joint,
	constraint.twistMaxDegrees ? { ...constraint, twistAnimationNames: clipNames } : constraint,
]))
const articulation = constrainPresenterArmArticulations(motion.glb, { animationNames: clipNames, constraints })
const parsed = parseGlb(articulation.buffer)
const counts = (parsed.json.animations || []).map(animation =>
	(animation.channels || []).reduce((result, channel) => {
		const target = channel.target?.path || 'unknown'
		result[target] = (result[target] || 0) + 1
		return result
	}, {}))
if (counts.length !== clipNames.length || counts.some(count => count.rotation !== 22 || (count.translation || 0) !== 0 || (count.scale || 0) !== 0)) {
	throw new Error(`Kimodo candidate channel drift: ${JSON.stringify(counts)}`)
}
if (motion.report.some(row => !String(row.status).includes('skip=0'))) {
	throw new Error(`Kimodo candidate skipped channels: ${JSON.stringify(motion.report)}`)
}
const materials = inspectMaterialProfile(articulation.buffer)
if (!materials.length || materials.some(item => item.metallicFactor !== 0 || item.roughnessFactor !== 1 || item.hasMetallicRoughnessTexture || item.hasSpecularExtension)) {
	throw new Error(`${identity} Kimodo candidate is not strict matte`)
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, articulation.buffer)
console.log(JSON.stringify({
	identity,
	sourcePath,
	libraryPath,
	outputPath,
	bytes: articulation.buffer.length,
	clips: clipNames,
	channelCounts: counts,
	report: motion.report,
	smoothing: smoothing.report,
	articulationConstraints: articulation.report,
	materials,
}, null, 2))
