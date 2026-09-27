import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const workerRoot = path.join(here, 'deploy', 'model3d-worker')
const profilePath = path.join(workerRoot, 'kimodo', 'authoring-v3-profile.json')
const clipmapPath = path.join(workerRoot, 'canonical', 'authoring-clipmap-v3.json')
const skeletonPath = path.join(workerRoot, 'canonical', 'canonical_skeleton.json')
const bonemapPath = path.join(workerRoot, 'kimodo', 'soma77-bonemap.json')

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const profile = readJson(profilePath)
const clipmap = readJson(clipmapPath)
const skeleton = readJson(skeletonPath)
const bonemap = readJson(bonemapPath)
const failures = []
const assert = (condition, message) => { if (!condition) failures.push(message) }
const sha256 = value => createHash('sha256').update(value).digest('hex')
const finite = value => Number.isFinite(Number(value))

assert(profile.schema === 'betterpptx.kimodo-authoring-profile.v1', 'profile schema must be v1')
assert(profile.strategy === 'improve-all', 'profile must evaluate all 18 slots, including existing local clips')
assert(profile.generator?.provider === 'nvidia-kimodo', 'provider must be nvidia-kimodo')
assert(profile.generator?.model === 'Kimodo-SOMA-RP-v1.1', 'model must be Kimodo-SOMA-RP-v1.1')
assert(/^[0-9a-f]{40}$/.test(profile.generator?.codeRevision || ''), 'Kimodo code revision must be a 40-character commit')
assert(/^[0-9a-f]{40}$/.test(profile.generator?.modelRevision || ''), 'Kimodo model revision must be a 40-character snapshot')
assert(profile.generator?.textEncoder?.baseRepository === 'meta-llama/Meta-Llama-3-8B-Instruct', 'Kimodo must declare its gated Meta Llama text-encoder base')
for (const key of ['baseRevision', 'mntpAdapterRevision', 'supervisedAdapterRevision']) {
	assert(/^[0-9a-f]{40}$/.test(profile.generator?.textEncoder?.[key] || ''), `textEncoder.${key} must be an immutable 40-character revision`)
}
assert(profile.generator?.textEncoder?.accessPolicy === 'official-gated-repository-only', 'text encoder must use the official gated repository')
assert(profile.generator?.textEncoder?.unofficialMirrorFallbackForbidden === true, 'unofficial Meta Llama mirror fallback must remain forbidden')
assert(profile.generator?.fps === 30, 'authoring-v3 Kimodo export must be 30 fps')
assert(profile.generator?.standardTPoseBvh === true, 'Kimodo BVH must use the standard T-pose export')
assert(profile.promotionPolicy?.automaticReplacementForbidden === true, 'automatic replacement must remain forbidden')
for (const key of ['requireAllKinematicGates', 'requireRetargetValidation', 'requirePowerPointOracleTimeline', 'requireG5DistributionRecord', 'requireOwnerReleaseApproval']) {
	assert(profile.promotionPolicy?.[key] === true, `promotionPolicy.${key} must be true`)
}

const profileSlots = profile.slots || []
const contractSlots = clipmap.slots || []
assert(profileSlots.length === clipmap.clipCeiling, `profile must contain exactly clipCeiling=${clipmap.clipCeiling} slots`)
assert(profileSlots.length === contractSlots.length, 'profile and frozen clipmap slot counts must match')
const seenSeeds = new Set()
for (let index = 0; index < contractSlots.length; index += 1) {
	const contract = contractSlots[index]
	const slot = profileSlots[index]
	if (!slot) continue
	assert(slot.slot === index, `profile slot ${index} must retain frozen slot order`)
	assert(slot.slot === contract.slot, `profile slot ${index} number differs from clipmap`)
	assert(slot.slug === contract.slug, `profile slot ${index} slug differs from clipmap (${slot.slug} != ${contract.slug})`)
	assert(Number.isInteger(slot.seed) && slot.seed >= 0, `slot ${index} seed must be a non-negative integer`)
	assert(!seenSeeds.has(slot.seed), `slot ${index} seed must be unique`)
	seenSeeds.add(slot.seed)
	assert(finite(slot.durationSeconds) && slot.durationSeconds >= 2 && slot.durationSeconds <= 8, `slot ${index} durationSeconds must be in [2,8]`)
	assert(Array.isArray(slot.promptVariants) && slot.promptVariants.length >= 3, `slot ${index} needs at least three prompt variants`)
	for (const prompt of slot.promptVariants || []) assert(typeof prompt === 'string' && prompt.length >= 80, `slot ${index} prompt is too vague`)
	assert(Array.isArray(slot.plateaus), `slot ${index} plateaus must be an array`)
	const expectedPlateauMs = Number(contract.plateauMs || contract.grabPlateauMs || 0)
	for (const plateau of slot.plateaus || []) {
		assert(finite(plateau.startMs) && finite(plateau.endMs) && plateau.endMs > plateau.startMs, `slot ${index} plateau must have a valid time range`)
		assert(plateau.startMs >= 0 && plateau.endMs <= slot.durationSeconds * 1000, `slot ${index} plateau must be inside the motion duration`)
		assert(typeof plateau.joint === 'string' && plateau.joint.length > 0, `slot ${index} plateau needs a SOMA joint`)
		if (expectedPlateauMs) assert(plateau.endMs - plateau.startMs >= expectedPlateauMs, `slot ${index} plateau is shorter than the frozen ${expectedPlateauMs} ms contract`)
	}
	if (expectedPlateauMs) assert(slot.plateaus.length > 0, `slot ${index} requires at least one plateau`)
	if (contract.grabPlateauMs || contract.dropPlateauMs) assert(slot.plateaus.length === 2, `carry slot ${index} needs grab and drop plateaus`)
	if (contract.heightBand) assert(slot.qualityGates?.heightBand === contract.heightBand, `slot ${index} height band differs from clipmap`)
	if (contract.side) assert(slot.qualityGates?.preferredSide === contract.side, `slot ${index} preferred side differs from clipmap`)
	if (contract.loopable) assert(slot.qualityGates?.loopable === true, `slot ${index} must preserve loopable=true`)
}

const canonicalNames = new Set((skeleton.bones || []).map(bone => bone.name))
const sourceNames = new Set([
	'Hips', 'Spine1', 'Spine2', 'Chest', 'Neck1', 'Neck2', 'Head',
	'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
	'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
	'LeftLeg', 'LeftShin', 'LeftFoot', 'LeftToeBase',
	'RightLeg', 'RightShin', 'RightFoot', 'RightToeBase',
])
for (const [target, source] of Object.entries(bonemap.map || {})) {
	assert(canonicalNames.has(target), `bonemap target is not on canonical skeleton: ${target}`)
	assert(sourceNames.has(source), `bonemap source is not on SOMA77 skeleton: ${source}`)
}
for (const required of canonicalNames) assert(Boolean(bonemap.map?.[required]), `bonemap is missing canonical bone: ${required}`)

const report = {
	schema: 'betterpptx.kimodo-authoring-profile-report.v1',
	status: failures.length ? 'FAIL' : 'PASS',
	profile: path.relative(here, profilePath).replaceAll('\\', '/'),
	profileSha256: sha256(fs.readFileSync(profilePath)),
	contractSha256: sha256(fs.readFileSync(clipmapPath)),
	slotCount: profileSlots.length,
	strategy: profile.strategy,
	generator: profile.generator,
	promotionState: profile.promotionPolicy?.initialState,
	failures,
}
fs.mkdirSync(path.join(here, 'outputs'), { recursive: true })
fs.writeFileSync(path.join(here, 'outputs', 'kimodo-authoring-v3-profile-report.json'), `${JSON.stringify(report, null, 2)}\n`)
if (failures.length) {
	console.error(`KIMODO AUTHORING-V3 PROFILE: FAIL (${failures.length})`)
	for (const failure of failures) console.error(`- ${failure}`)
	process.exit(1)
}
console.log(`KIMODO AUTHORING-V3 PROFILE: PASS slots=${profileSlots.length} strategy=${profile.strategy} promotion=${profile.promotionPolicy.initialState}`)
