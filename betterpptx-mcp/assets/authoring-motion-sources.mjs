import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseGlb } from '../ir/kinetic-transplant.mjs'

const assetsRoot = path.dirname(fileURLToPath(import.meta.url))
const registryPath = path.join(assetsRoot, 'authoring-motion-source-registry.json')
const releasePath = path.resolve(assetsRoot, '../docs/release-safety/G5-PRODUCT-ASSET-RELEASE-MANIFEST.json')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const copy = value => JSON.parse(JSON.stringify(value))
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const safeId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(value)
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value
const stableJson = value => JSON.stringify(stable(value))

// Runtime source policy is deliberately centralized here.  The catalog and
// materializer both call the same predicate, so a disabled provider cannot be
// selected through a stale catalog snapshot, a direct motion id, or a warm
// bundle cache.  The quarantined source bytes and their proofs remain in the
// private ledger for later re-evaluation; they are not active runtime inputs.
export const ACTIVE_MOTION_SOURCE_PROVIDERS = Object.freeze(['mixamo'])
export const QUARANTINED_MOTION_SOURCE_PROVIDERS = Object.freeze(['nvidia-kimodo'])
export const MOTION_SOURCE_PROVIDER_POLICY_VERSION = 'mixamo-only-v1'

export function isMotionSourceProviderActive(provider) {
	return ACTIVE_MOTION_SOURCE_PROVIDERS.includes(String(provider || '').trim().toLowerCase())
}

export function motionSourceProviderPolicy() {
	return {
		version: MOTION_SOURCE_PROVIDER_POLICY_VERSION,
		activeProviders: [...ACTIVE_MOTION_SOURCE_PROVIDERS],
		quarantinedProviders: [...QUARANTINED_MOTION_SOURCE_PROVIDERS],
		mode: 'mixamo-only',
	}
}
const requiresPlaybackProof = source => source.motionIds.some(id => id.startsWith('motion.ordinary.'))
	|| source.retarget?.rotationRetargetSpace === 'world-delta'

function unavailable() {
	const error = new Error('A governed presenter motion source is unavailable or has not passed its integrity check.')
	error.code = 'AUTHORING_MOTION_SOURCE_INVALID'
	return error
}

/** Pure private proof-authoring helpers; never part of the public motion schema. */
export function governedMotionRestProfileSha256(profile) {
	return sha256(stableJson(profile ?? null))
}

export function normalizeGovernedMotionRetargetPolicy(policy) {
	const keys = ['rotationRetargetSpace', 'rotationReference', 'channelPolicy', 'boneNamePolicy', 'rootMotionSpace', 'rootMotionAxes', 'rootMotionAnchor', 'rootMotionMaxStatures', 'rootMotionMaxHorizontalStatures', 'rootMotionScale', 'includeBones', 'excludeBones']
	if (!policy || typeof policy !== 'object' || Array.isArray(policy) || Object.keys(policy).some(key => !keys.includes(key))) throw unavailable()
	if (!['global', 'world-delta'].includes(policy.rotationRetargetSpace) || !['rotation-only', 'root-motion'].includes(policy.channelPolicy) || !['exact', 'mixamo-suffix'].includes(policy.boneNamePolicy ?? 'exact')) throw unavailable()
	if (policy.rotationReference !== undefined && !['rest', 'first-frame'].includes(policy.rotationReference)) throw unavailable()
	if (policy.rotationReference === 'first-frame' && policy.rotationRetargetSpace !== 'world-delta') throw unavailable()
	// World-delta composes the complete mapped hierarchy. Partial bone filters
	// would omit animated parents used in that solution and cannot be guessed.
	if (policy.rotationRetargetSpace === 'world-delta' && (policy.includeBones?.length || policy.excludeBones?.length)) throw unavailable()
	if (policy.rootMotionSpace !== undefined && (policy.channelPolicy !== 'root-motion' || !['local', 'world'].includes(policy.rootMotionSpace))) throw unavailable()
	// Axis restriction is explicit in the governed policy and therefore in its
	// playback-proof binding. Do not infer an in-place policy from a clip's name.
	// Omission retains the existing all-axis behavior and prior proof hashes.
	if (policy.rootMotionAxes !== undefined && (policy.channelPolicy !== 'root-motion' || policy.rootMotionSpace !== 'world' || !['all', 'vertical'].includes(policy.rootMotionAxes))) throw unavailable()
	if (policy.channelPolicy === 'root-motion' && (!['start', 'end', 'rest'].includes(policy.rootMotionAnchor) || !Number.isFinite(policy.rootMotionMaxStatures) || policy.rootMotionMaxStatures <= 0 || policy.rootMotionMaxStatures > 4 || !Number.isFinite(policy.rootMotionMaxHorizontalStatures) || policy.rootMotionMaxHorizontalStatures <= 0 || policy.rootMotionMaxHorizontalStatures > 4)) throw unavailable()
	if (policy.rootMotionScale !== undefined && (!Number.isFinite(policy.rootMotionScale) || policy.rootMotionScale <= 0)) throw unavailable()
	for (const key of ['includeBones', 'excludeBones']) if (policy[key] !== undefined && (!Array.isArray(policy[key]) || policy[key].some(name => typeof name !== 'string' || !name))) throw unavailable()
	return stable({ ...copy(policy), boneNamePolicy: policy.boneNamePolicy ?? 'exact' })
}

function sourceTiming(library, source) {
	const { json, bin } = parseGlb(library)
	const matches = (json.animations || []).filter(animation => animation.name === source.sourceSlug)
	if (matches.length !== 1) throw unavailable()
	const animation = matches[0], ordinary = requiresPlaybackProof(source)
	if (!animation.channels?.length || !animation.samplers?.length) throw unavailable()
	const rotations = animation.channels.filter(channel => channel.target?.path === 'rotation')
	if (ordinary && (!rotations.length || animation.channels.some(channel => !['rotation', 'translation', 'scale'].includes(channel.target?.path)))) throw unavailable()
	// World-root preserves the Hips translation clock without resampling it.
	// The discarded non-root T/S tracks do not define the output's duration.
	const retained = source.retarget.channelPolicy === 'root-motion' ? animation.channels.filter(channel => channel.target?.path === 'rotation' || (channel.target?.path === 'translation' && (source.retarget.boneNamePolicy === 'mixamo-suffix' ? /^mixamorig\d*:Hips$/.test(json.nodes?.[channel.target.node]?.name || '') : json.nodes?.[channel.target.node]?.name === 'mixamorig:Hips'))) : rotations
	const samplers = ordinary ? [...new Set(retained.map(channel => channel.sampler))].map(index => animation.samplers[index]) : animation.samplers
	let maximum = 0
	for (const sampler of samplers) {
		const accessor = json.accessors?.[sampler?.input], view = json.bufferViews?.[accessor?.bufferView]
		if (accessor?.componentType !== 5126 || accessor.type !== 'SCALAR' || !Number.isInteger(accessor.count) || accessor.count < 1 || accessor.sparse || !view || (view.buffer ?? 0) !== 0) throw unavailable()
		const stride = view.byteStride ?? 4, offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
		if (!Number.isInteger(stride) || stride < 4 || !Number.isInteger(offset) || offset < 0 || offset + (accessor.count - 1) * stride + 4 > bin.length || (accessor.byteOffset ?? 0) + (accessor.count - 1) * stride + 4 > view.byteLength) throw unavailable()
		let previous = -Infinity
		for (let index = 0; index < accessor.count; index++) {
			const time = bin.readFloatLE(offset + index * stride)
			if (!Number.isFinite(time) || time < 0 || time <= previous || (ordinary && index === 0 && time !== 0)) throw unavailable()
			previous = time
			maximum = Math.max(maximum, time)
		}
	}
	const durationMs = Math.round(maximum * 1000)
	if (durationMs < 1) throw unavailable()
	return { durationMs }
}

function verifiedPlaybackProof(source, proof, durationMs) {
	if (proof?.schemaVersion !== 'betterpptx.authoring-motion-playback-proof.v1' || proof.status !== 'PASS' || proof.renderer !== 'native-powerpoint') throw unavailable()
	if (proof.source?.id !== source.id || proof.source.sha256 !== source.sha256 || proof.source.sourceSlug !== source.sourceSlug || proof.source.sourceProvider !== source.sourceProvider || proof.source.durationMs !== durationMs) throw unavailable()
	if (stableJson(normalizeGovernedMotionRetargetPolicy(proof.retarget)) !== stableJson(source.retarget) || !Array.isArray(proof.targets) || !proof.targets.length) throw unavailable()
	const seen = new Set()
	for (const target of proof.targets) {
		const key = `${target.targetGlbSha256}:${target.retargetRestProfileSha256}`
		if (!safeId(target.identity) || !isHash(target.targetGlbSha256) || !isHash(target.retargetRestProfileSha256) || seen.has(key) || target.status !== 'PASS' || !isHash(target.evidence?.pptxSha256) || !isHash(target.evidence?.videoSha256)) throw unavailable()
		if (target.checks?.fullClipPlayback !== true || target.checks.noTPose !== true || target.checks.noExcessiveTorsion !== true) throw unavailable()
		seen.add(key)
	}
	return { status: 'PASS', proofSha256: source.playbackProof.sha256, durationMs, targets: copy(proof.targets) }
}

/** Private factory permits isolated integrity tests without touching the live ledger. */
export function createGovernedAuthoringMotionSourceResolver({ assetsDirectory = assetsRoot, registryFile = registryPath, releaseFile = releasePath, readFile = file => fs.readFileSync(file) } = {}) {
	function readLibrary(source) {
		const library = Buffer.from(readFile(path.join(assetsDirectory, source.file)))
		if (library.length !== source.bytes || sha256(library) !== source.sha256) throw unavailable()
		return library
	}
	function registry() {
		try {
			// Re-read governing bytes. A long-lived server must observe revocation,
			// changed proof bytes and updated source hashes even on warm bundle hits.
			const bytes = Buffer.from(readFile(registryFile)), value = JSON.parse(bytes), release = JSON.parse(readFile(releaseFile))
			if (value.schemaVersion !== 'betterpptx.authoring-motion-source-registry.v1' || !value.revision || !Array.isArray(value.sources)) throw unavailable()
			if (value.runtimePolicy && (value.runtimePolicy.mode !== 'mixamo-only'
				|| JSON.stringify(value.runtimePolicy.activeSourceProviders || []) !== JSON.stringify([...ACTIVE_MOTION_SOURCE_PROVIDERS])
				|| JSON.stringify(value.runtimePolicy.quarantinedSourceProviders || []) !== JSON.stringify([...QUARANTINED_MOTION_SOURCE_PROVIDERS]))) throw unavailable()
			const ids = new Set(), motions = new Set(), approvals = []
			for (const source of value.sources) {
				const approval = release.assets?.find(asset => asset.id === source.id)
				if (!safeId(source.id) || ids.has(source.id) || typeof source.file !== 'string' || !/^[a-z0-9][a-z0-9._-]*\.glb$/.test(source.file) || !isHash(source.sha256) || !Number.isInteger(source.bytes) || source.bytes < 1 || typeof source.sourceSlug !== 'string' || !source.sourceSlug || !Array.isArray(source.motionIds) || !source.motionIds.length) throw unavailable()
				if (approval?.approvalStatus !== 'APPROVED' || approval.sha256 !== source.sha256 || approval.bytes !== source.bytes || approval.path !== `betterpptx-mcp/assets/${source.file}`) throw unavailable()
				source.retarget = normalizeGovernedMotionRetargetPolicy(source.retarget)
				for (const motionId of source.motionIds) {
					if (typeof motionId !== 'string' || !/^motion\.[a-z0-9-]+\.[a-z0-9-]+$/.test(motionId) || motions.has(motionId)) throw unavailable()
					motions.add(motionId)
				}
				ids.add(source.id)
				approvals.push({ id: approval.id, sha256: approval.sha256, bytes: approval.bytes, approvalStatus: approval.approvalStatus })
				const required = requiresPlaybackProof(source)
				delete source.playbackValidation
				if (required && (!['mixamo', 'nvidia-kimodo'].includes(source.sourceProvider) || (source.retarget.channelPolicy === 'root-motion' && (source.retarget.rootMotionSpace !== 'world' || source.retarget.rootMotionAnchor !== 'start')))) throw unavailable()
				if (required || source.playbackProof !== undefined) {
					source.playbackValidation = { status: source.playbackProof === undefined ? 'MISSING' : 'INVALID' }
					try {
						const reference = source.playbackProof
						if (!reference || typeof reference.file !== 'string' || !/^[a-z0-9][a-z0-9._-]*\.json$/.test(reference.file) || !isHash(reference.sha256)) throw unavailable()
						const proofBytes = Buffer.from(readFile(path.join(assetsDirectory, reference.file)))
						if (sha256(proofBytes) !== reference.sha256) throw unavailable()
						const timing = sourceTiming(readLibrary(source), source)
						source.playbackValidation = verifiedPlaybackProof(source, JSON.parse(proofBytes), timing.durationMs)
					} catch { /* A failed replacement stays withheld; never silently use the old take. */ }
				}
			}
			return { ...value, fingerprint: `motion-sources-${sha256(stableJson({ registrySha256: sha256(bytes), approvals, playback: value.sources.map(source => [source.id, source.playbackValidation ?? null]) })).slice(0, 32)}` }
		} catch { throw unavailable() }
	}
	return {
		sources: () => copy(registry()),
		selection(motionId, { targetGlbBuffer = null, retargetRestProfile = null, expectedSourceFingerprint = null } = {}) {
			try {
				const ledger = registry(), source = ledger.sources.find(item => item.motionIds.includes(motionId))
				if (expectedSourceFingerprint && ledger.fingerprint !== expectedSourceFingerprint) throw unavailable()
				if (!source) return null
				// Fail closed before reading or parsing the source library.  This is
				// important for the Mixamo-only hold: a disabled provider must not
				// become executable merely because its historical proof still passes.
				if (!isMotionSourceProviderActive(source.sourceProvider)) throw unavailable()
				const library = readLibrary(source), timing = sourceTiming(library, source)
				if (requiresPlaybackProof(source) || source.playbackProof !== undefined) {
					const proof = source.playbackValidation
					if (proof?.status !== 'PASS' || !targetGlbBuffer) throw unavailable()
					const targetSha = sha256(Buffer.from(targetGlbBuffer)), restSha = governedMotionRestProfileSha256(retargetRestProfile)
					if (!proof.targets.some(target => target.targetGlbSha256 === targetSha && target.retargetRestProfileSha256 === restSha)) throw unavailable()
				}
				return { library, libraryKey: `${source.id}:${source.sha256}`, sourceSlug: source.sourceSlug, sourceProvider: source.sourceProvider, durationMs: timing.durationMs, ...(source.playbackValidation?.proofSha256 ? { playbackProofSha256: source.playbackValidation.proofSha256 } : {}), ...copy(source.retarget) }
			} catch { throw unavailable() }
		},
	}
}

const resolver = createGovernedAuthoringMotionSourceResolver()

/** Private source ledger; public motion projections must not expose it. */
export const governedAuthoringMotionSources = () => resolver.sources()

/** Exact source, proof and tested-target binding, checked before materialization/cache lookup. */
export const governedAuthoringMotionSelection = (motionId, options) => resolver.selection(motionId, options)
