#!/usr/bin/env node
// Mechanical executor gate for Authoring-v3 presenter bundles.
//
// The AI owns semantic motion selection.  This verifier proves that the engine
// can execute an exact ordered mixed selection across every source route, assign its
// private PowerPoint animation slots deterministically, and reject invalid
// construction before a deck is mutated.

import { createHash } from 'node:crypto'
import fs from 'node:fs'

import {
	AUTHORING_MOTION_BUNDLE_CEILING,
	authoringMotionCatalog,
	privateAuthoringMotionCatalogPaths,
	resolveAuthoringMotionSelection,
} from './ir/authoring-motion-catalog.mjs'
import { computeContacts, parseGlb, transplantKinetic, transplantMotionSet } from './ir/kinetic-transplant.mjs'
import { ensureDefaultPresenterRegistered } from './assets/default-presenter-roster.mjs'
import { getCachedGeneratedRigged3d, materializeAuthoringMotionPresenter } from './assets/model3d-gen-providers.mjs'

const sourcePaths = privateAuthoringMotionCatalogPaths()
const registeredBase = ensureDefaultPresenterRegistered('joe')
const baseAsset = getCachedGeneratedRigged3d(registeredBase.hash)
const base = Buffer.from(baseAsset.glbBase64, 'base64')
// This source is used only by the independent low-level compatibility probes.
// Product bundle construction below always uses the shared governed materializer.
const kineticLibrary = fs.readFileSync(sourcePaths.kineticPool)

const failures = []
let passed = 0
function ok(label, condition, detail = '') {
	if (condition) {
		passed += 1
		console.log(`PASS ${label}`)
	} else {
		failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
		console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`)
	}
}

function digest(buffer) {
	return createHash('sha256').update(buffer).digest('hex')
}

function glbIntegrity(buffer) {
	const issues = []
	const { json, bin } = parseGlb(buffer)
	const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
	const componentCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }
	if (buffer.readUInt32LE(8) !== buffer.length) issues.push({ code: 'GLB_HEADER_LENGTH_MISMATCH', header: buffer.readUInt32LE(8), actual: buffer.length })
	if (Number(json.buffers?.[0]?.byteLength) !== bin.length) issues.push({ code: 'GLB_BUFFER_LENGTH_MISMATCH', declared: json.buffers?.[0]?.byteLength, actual: bin.length })
	for (const [index, view] of (json.bufferViews || []).entries()) {
		const start = Number(view.byteOffset || 0)
		const length = Number(view.byteLength || 0)
		if (length <= 0 || start < 0 || start + length > bin.length) issues.push({ code: 'BUFFER_VIEW_OUT_OF_BOUNDS', index, start, length, binLength: bin.length })
	}
	for (const [index, accessor] of (json.accessors || []).entries()) {
		const view = json.bufferViews?.[accessor.bufferView]
		const bytes = componentBytes[accessor.componentType]
		const count = componentCount[accessor.type]
		if (!view || !bytes || !count) {
			issues.push({ code: 'ACCESSOR_METADATA_INVALID', index })
			continue
		}
		const elementBytes = bytes * count
		const stride = Number(view.byteStride || elementBytes)
		const offset = Number(accessor.byteOffset || 0)
		const end = offset + Math.max(0, Number(accessor.count || 0) - 1) * stride + elementBytes
		if (offset < 0 || end > Number(view.byteLength || 0)) issues.push({ code: 'ACCESSOR_OUT_OF_BOUNDS', index, offset, end, viewLength: view.byteLength })
	}
	for (const [index, animation] of (json.animations || []).entries()) {
		if (!animation.channels?.length || !animation.samplers?.length) issues.push({ code: 'EMPTY_ANIMATION', index, name: animation.name })
		for (const channel of animation.channels || []) {
			if (!animation.samplers[channel.sampler]) issues.push({ code: 'ANIMATION_SAMPLER_MISSING', index, sampler: channel.sampler })
			if (!json.nodes?.[channel.target?.node]) issues.push({ code: 'ANIMATION_TARGET_MISSING', index, node: channel.target?.node })
		}
	}
	return { json, bin, issues }
}

function accessorRows(parsed, accessorIndex) {
	const { json, bin } = parsed
	const accessor = json.accessors[accessorIndex]
	const view = json.bufferViews[accessor.bufferView]
	const componentCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type]
	if (accessor.componentType !== 5126 || !componentCount) throw new Error(`Verifier only decodes float animation accessors; got ${accessor.componentType}/${accessor.type}`)
	const stride = view.byteStride || componentCount * 4
	const start = (view.byteOffset || 0) + (accessor.byteOffset || 0)
	return Array.from({ length: accessor.count }, (_, row) => Array.from({ length: componentCount }, (_, component) => bin.readFloatLE(start + row * stride + component * 4)))
}

function channelByBoneAndPath(parsed, animation, boneName, targetPath) {
	return animation.channels.find(channel => parsed.json.nodes[channel.target.node]?.name === boneName && channel.target.path === targetPath)
}

function nearRows(actual, expected, tolerance = 1e-5) {
	return actual.length === expected.length && actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance)
}

const catalog = authoringMotionCatalog({ refresh: true })
const routeProbeIds = [
	'motion.ordinary.talk', 'motion.ordinary.enumerate', 'motion.kinetic.drop-to-landing',
	'motion.kinetic.ground-smash', 'motion.kinetic.heavy-kick',
]
const selectedMotionIds = [...new Set([...routeProbeIds, ...catalog.records.filter(row => row.selectable).map(row => row.motionId)])].slice(0, AUTHORING_MOTION_BUNDLE_CEILING)
const selection = resolveAuthoringMotionSelection(selectedMotionIds)

ok('mixed 18-motion semantic selection is valid before construction', selection.ok && selection.selected.length === AUTHORING_MOTION_BUNDLE_CEILING, JSON.stringify(selection.errors))

const materializeOptions = {
	baseGlbBase64: baseAsset.glbBase64,
	retargetRestProfile: baseAsset.retargetRestProfile,
	baseHash: registeredBase.hash,
	selectedMotionIds,
	previewBase64: baseAsset.previewBase64,
	license: baseAsset.license,
	staticPoseClipName: baseAsset.manifest?.staticPoseClipName || null,
	staticPoseProfileVersion: baseAsset.manifest?.staticPoseProfileVersion || null,
}
const first = materializeAuthoringMotionPresenter(materializeOptions)
const second = materializeAuthoringMotionPresenter(materializeOptions)
// A second opaque cache identity forces a fresh materialization of identical
// tested bytes. This proves deterministic output without clearing shared state.
const cold = materializeAuthoringMotionPresenter({ ...materializeOptions, baseHash: `${registeredBase.hash}:cold-replay` })
const firstGlb = Buffer.from(getCachedGeneratedRigged3d(first.hash).glbBase64, 'base64')
const secondGlb = Buffer.from(getCachedGeneratedRigged3d(second.hash).glbBase64, 'base64')
const coldGlb = Buffer.from(getCachedGeneratedRigged3d(cold.hash).glbBase64, 'base64')
const integrity = glbIntegrity(firstGlb)
const animationNames = integrity.json.animations?.map(animation => animation.name) || []
const expectedNames = selection.selectedMotionIds.map((motionId, index) => `${String(index).padStart(2, '0')}_${motionId}`)

ok('executor emits exactly 18 real animation objects in requested order', animationNames.length === 18 && JSON.stringify(animationNames) === JSON.stringify(expectedNames), JSON.stringify(animationNames))
ok('private semantic ID to animId allocation is exact and contiguous', selection.selectedMotionIds.every((motionId, index) => first.motionIdToAnimId[motionId] === index), JSON.stringify(first.motionIdToAnimId))
ok('ordinary, kinetic, alias and governed Mixamo routes materialize exactly',
	!selection.selected.some(row => row.privateEvidence.sourceProvider === 'nvidia-kimodo')
	&& selection.selected.some(row => row.privateEvidence.sourceLibrary === 'kinetic')
	&& selection.selected.some(row => row.family === 'ordinary-gesture')
	&& selection.selected.some(row => row.privateEvidence.declaredAliasOf)
	&& selection.selected.some(row => row.privateEvidence.resolvedSource)
	&& routeProbeIds.every(motionId => Object.hasOwn(first.motionIdToAnimId, motionId)), JSON.stringify(first.motionIdToAnimId))
ok('GLB package, views, accessors, channels, and targets are structurally bounded', integrity.issues.length === 0, JSON.stringify(integrity.issues.slice(0, 20)))
ok('compact accessor packing keeps an 18-motion presenter practical', firstGlb.length < 40 * 1024 * 1024, `${firstGlb.length} bytes`)
ok('warm replay reuses the exact governed bundle', second.cached === true && first.handle === second.handle && digest(firstGlb) === digest(secondGlb))
ok('cold repeated construction is byte deterministic', cold.cached === false && digest(firstGlb) === digest(coldGlb), `${digest(firstGlb)} vs ${digest(coldGlb)}`)
ok('presenter-safe construction permits only rotations and explicitly governed root translations',
	(integrity.json.animations || []).every((animation, index) => {
		const rootMotion = selection.selected[index].privateEvidence.resolvedSource?.retarget?.channelPolicy === 'root-motion'
		return (animation.channels || []).every(channel => channel.target.path === 'rotation' || (rootMotion && channel.target.path === 'translation' && integrity.json.nodes[channel.target.node]?.name === 'mixamorig:Hips'))
	}),
	JSON.stringify((integrity.json.animations?.[0]?.channels || []).map(channel => channel.target.path)))

const firstSourceRow = catalog.records.find(row => row.family === 'kinetic' && row.privateEvidence.sourceLibrary === 'kinetic' && !row.privateEvidence.declaredAliasOf)
const sourceParsed = parseGlb(kineticLibrary)
const sourceAnimation = sourceParsed.json.animations.find(animation => animation.name === firstSourceRow.privateEvidence.sourceSlug || animation.name.replace(/^\d+_/, '') === firstSourceRow.privateEvidence.sourceSlug)
const buildInput = [{ motionId: firstSourceRow.motionId, sourceSlug: firstSourceRow.privateEvidence.sourceSlug, outputSlug: firstSourceRow.motionId, library: kineticLibrary, libraryKey: 'kinetic' }]
const fullTrs = transplantMotionSet(base, buildInput, { channelPolicy: 'full-trs' })
const targetParsed = parseGlb(fullTrs.glb)
const targetAnimation = targetParsed.json.animations[0]
const sourceHipsIndex = sourceParsed.json.nodes.findIndex(node => node.name === 'mixamorig:Hips')
const targetHipsIndex = targetParsed.json.nodes.findIndex(node => node.name === 'mixamorig:Hips')
const sourceTranslationChannel = channelByBoneAndPath(sourceParsed, sourceAnimation, 'mixamorig:Hips', 'translation')
const targetTranslationChannel = channelByBoneAndPath(targetParsed, targetAnimation, 'mixamorig:Hips', 'translation')
const sourceScaleChannel = channelByBoneAndPath(sourceParsed, sourceAnimation, 'mixamorig:Hips', 'scale')
const targetScaleChannel = channelByBoneAndPath(targetParsed, targetAnimation, 'mixamorig:Hips', 'scale')
const sourceTranslation = accessorRows(sourceParsed, sourceAnimation.samplers[sourceTranslationChannel.sampler].output)[0]
const targetTranslation = accessorRows(targetParsed, targetAnimation.samplers[targetTranslationChannel.sampler].output)[0]
const sourceRestTranslation = sourceParsed.json.nodes[sourceHipsIndex].translation || [0, 0, 0]
const targetRestTranslation = targetParsed.json.nodes[targetHipsIndex].translation || [0, 0, 0]
const expectedTranslation = sourceTranslation.map((value, axis) => targetRestTranslation[axis] + value - sourceRestTranslation[axis])
ok('translation tracks preserve source motion delta on the destination rest pose', nearRows(targetTranslation, expectedTranslation), JSON.stringify({ sourceTranslation, targetTranslation, expectedTranslation }))
const sourceScale = accessorRows(sourceParsed, sourceAnimation.samplers[sourceScaleChannel.sampler].output)[0]
const targetScale = accessorRows(targetParsed, targetAnimation.samplers[targetScaleChannel.sampler].output)[0]
const sourceRestScale = sourceParsed.json.nodes[sourceHipsIndex].scale || [1, 1, 1]
const targetRestScale = targetParsed.json.nodes[targetHipsIndex].scale || [1, 1, 1]
const expectedScale = sourceScale.map((value, axis) => targetRestScale[axis] * value / sourceRestScale[axis])
ok('scale tracks preserve source multiplicative delta on the destination rest pose', nearRows(targetScale, expectedScale), JSON.stringify({ sourceScale, targetScale, expectedScale }))

const contacts = computeContacts(firstGlb)
ok('every emitted motion has deterministic duration/contact metadata', selection.selectedMotionIds.every(motionId => Number.isFinite(contacts[motionId]?.durationMs) && Number.isFinite(contacts[motionId]?.contactMs)), JSON.stringify(contacts))

let limitError = null
try {
	transplantMotionSet(base, Array.from({ length: 19 }, (_, index) => ({ ...buildInput[0], motionId: `motion.test.entry-${index}` })))
} catch (error) {
	limitError = error
}
ok('executor independently rejects a nineteenth motion', limitError?.code === 'MOTION_BUNDLE_LIMIT_EXCEEDED' && limitError.maximum === 18, String(limitError?.message || 'no error'))

let sourceError = null
try {
	transplantMotionSet(base, [{ ...buildInput[0], motionId: 'motion.test.missing', sourceSlug: 'not_in_source_library' }])
} catch (error) {
	sourceError = error
}
ok('missing source motion is an explicit hard error', sourceError?.code === 'MOTION_SOURCE_MISSING', String(sourceError?.message || 'no error'))

const legacySlug = firstSourceRow.privateEvidence.sourceSlug
const legacy = transplantKinetic(base, kineticLibrary, [legacySlug])
const generic = transplantMotionSet(base, [{ motionId: legacySlug, sourceSlug: legacySlug, outputSlug: legacySlug, library: kineticLibrary, libraryKey: 'kinetic' }])
ok('legacy one-library wrapper remains byte-compatible', digest(legacy.glb) === digest(generic.glb) && legacy.slugToAnimId[legacySlug] === 0, `${digest(legacy.glb)} vs ${digest(generic.glb)}`)

console.log(`AUTHORING MOTION BUNDLE GATE: ${passed} passed, ${failures.length} failed`)
console.log(JSON.stringify({ bytes: firstGlb.length, sha256: digest(firstGlb), animations: animationNames.length, catalogFingerprint: catalog.catalogFingerprint }, null, 2))
if (failures.length) {
	console.error(failures.join('\n'))
	process.exitCode = 1
}
