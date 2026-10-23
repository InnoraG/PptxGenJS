// Authoring-v3 unified motion catalog.
//
// This is the semantic source of truth for AI-authored presenter motion.  It
// deliberately separates the complete motion vocabulary from PowerPoint's
// per-presenter 18-animation runtime ceiling.  Public callers see only the
// safe semantic projection; private source/provenance details remain inside
// this maintainer-side module and generated reconciliation reports.

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseGlb } from './kinetic-transplant.mjs'
import { governedAuthoringMotionSources, isMotionSourceProviderActive, motionSourceProviderPolicy } from '../assets/authoring-motion-sources.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const canonicalRoot = path.join(root, 'deploy', 'model3d-worker', 'canonical')
const bakeRoot = path.join(root, 'deploy', 'model3d-worker', 'bake')
const assetsRoot = path.join(root, 'assets')
const releaseManifestPath = path.join(root, 'docs', 'release-safety', 'G5-PRODUCT-ASSET-RELEASE-MANIFEST.json')

export const AUTHORING_MOTION_CATALOG_SCHEMA = 'betterpptx.authoring-motion-catalog.v1'
export const AUTHORING_MOTION_PUBLIC_SCHEMA = 'betterpptx.authoring-motion-catalog.public.v1'
export const AUTHORING_MOTION_BUNDLE_CEILING = 18

const PRIVATE_SOURCE_FILES = Object.freeze({
	kineticPlan: path.join(bakeRoot, 'kinetic_clips.json'),
	kineticClipmap: path.join(canonicalRoot, 'kinetic-clipmap.json'),
	kineticExtensionClipmap: path.join(canonicalRoot, 'kinetic-extension-clipmap.json'),
	ordinaryClipmap: path.join(canonicalRoot, 'canonical-clipmap.json'),
	interactionClipmap: path.join(canonicalRoot, 'authoring-clipmap-v3.json'),
	kineticPool: path.join(assetsRoot, 'kinetic-clips.glb'),
	kineticExtensionPool: path.join(assetsRoot, 'kinetic-clips-extension.glb'),
	kineticExtensionProof: path.join(assetsRoot, 'kinetic-clips-extension-proof.json'),
	ordinaryPool: path.join(assetsRoot, 'powerpoint-proven-mixamo-library.glb'),
	interactionPool: path.join(assetsRoot, 'authoring-interaction-clips-v3-proven.glb'),
	interactionProof: path.join(assetsRoot, 'authoring-interaction-clips-v3-proof.json'),
	releaseManifest: releaseManifestPath,
})

const ORDINARY_MOTION_DESCRIPTIONS = Object.freeze({
	idle: 'Calm resting presence while the presenter remains visible.',
	talk: 'Conversational speaking gesture for explanation and continuity.',
	greet: 'Warm opening or acknowledgement gesture.',
	point: 'Directional emphasis toward a visual without claiming physical contact.',
	emphasize: 'Focused beat that reinforces an important claim.',
	magnitude: 'Scale gesture for size, growth, or impact.',
	contrast: 'Comparative gesture for alternatives or tension.',
	enumerate: 'Measured counting gesture for a finite sequence.',
	ask: 'Questioning gesture that invites attention or reflection.',
	present: 'Open-handed presentation gesture for a proof visual.',
	agree: 'Affirming motion for confirmation or validated progress.',
	bow: 'Respectful acknowledgement or closing gesture.',
	think: 'Reflective pause for analysis or uncertainty.',
	disagree: 'Measured negative response for risk, trade-off, or rejection.',
	happy: 'Positive celebratory beat for milestones.',
	surprise: 'Reaction gesture for a notable reveal or change.',
	walk: 'In-place travel rhythm for motion continuity.',
	clap: 'Celebratory completion or team-recognition gesture.',
})

// A baked, owner-approved source row is still withheld from AI selection when
// the native PowerPoint playback oracle cannot make its authored motion
// materially visible.  This does not mutate or replace the hash-bound G5
// source bundle; it keeps the row in the full catalog until a separately
// approved replacement clip closes the runtime proof gap.
const POWERPOINT_PLAYBACK_HOLDS = Object.freeze({
	enumerate: Object.freeze({
		code: 'POWERPOINT_VISUAL_MOTION_NOT_PROVEN',
		observedAt: '2026-08-15',
	}),
})

const INTERACTION_ROLE_DESCRIPTIONS = Object.freeze({
	'reach-touch': 'Contact-precise reach toward a target at a declared height and side.',
	point: 'Contact-aware pointing posture toward a target.',
	press: 'Deliberate press/tap posture with a measured contact plateau.',
	carry: 'Grab, transport, and release motion with separate plateaus.',
	travel: 'Travel or turn motion used for presenter movement.',
	idle: 'Loopable resting motion for a visible presenter.',
	beat: 'Expressive beat intended for emphasis or impulse semantics.',
	greet: 'Greeting or bow posture.',
	nod: 'Agreement or disagreement head motion.',
})

function readJson(file) {
	return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex')
}

function stable(value) {
	if (Array.isArray(value)) return value.map(stable)
	if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
	return value
}

function stableJson(value) {
	return JSON.stringify(stable(value))
}

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function recordCounts(records) {
	return records.reduce((out, row) => {
		out.total += 1
		out.byFamily[row.family] = (out.byFamily[row.family] || 0) + 1
		out.byProductState[row.lifecycle.productState] = (out.byProductState[row.lifecycle.productState] || 0) + 1
		if (row.selectable) out.selectable += 1
		else out.notSelectable += 1
		return out
	}, { total: 0, selectable: 0, notSelectable: 0, byFamily: {}, byProductState: {} })
}

function recordFingerprint(records) {
	const input = records.map(row => ({ motionId: row.motionId, family: row.family, slug: row.slug, behavior: row.behavior, lifecycle: row.lifecycle, selectable: row.selectable }))
	return `motion-catalog-${sha256(stableJson(input)).slice(0, 24)}`
}

function cleanSlug(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/^\d+[_-]/, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

function titleCase(value) {
	return String(value || '')
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map(part => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ')
}

function tagsForKinetic(name, use) {
	const text = `${name} ${use || ''}`.toLowerCase()
	const tags = new Set(['kinetic', 'expressive'])
	const matches = [
		['launch', /launch|jump|leap|flying|float|fall|landing/],
		['impact', /impact|pound|slam|stomp|smash|uppercut|kick|punch|breaker|swat|slash/],
		['travel', /sprint|slide|roll|walk|run|strafe|dodge|orbit|descent/],
		['reveal', /reveal|scan|look|organize|shield|atlas|magical|stretch/],
		['risk-recovery', /trip|stumble|recovery|dodge|block/],
		['celebration', /victory|clap|celebrat/],
		['data-emphasis', /chart|data|kpi|table|graph|timeline|text/],
	]
	for (const [tag, pattern] of matches) if (pattern.test(text)) tags.add(tag)
	return [...tags]
}

function energyForKinetic(name) {
	const text = String(name || '').toLowerCase()
	if (/idle|float|scan|lean|meditate|look/.test(text)) return 'low'
	if (/sprint|jump|kick|pound|slam|smash|uppercut|launch|flying|backflip|stomp/.test(text)) return 'high'
	return 'medium'
}

function tempoForKinetic(name) {
	const text = String(name || '').toLowerCase()
	if (/slowmo|float|meditate|lean|idle/.test(text)) return 'slow'
	if (/sprint|kick|punch|slam|jump|launch|dodge|slide/.test(text)) return 'fast'
	return 'moderate'
}

function g5AssetState(manifest, id) {
	const asset = (manifest.assets || []).find(item => item?.id === id)
	return {
		approved: asset?.approvalStatus === 'APPROVED',
		approvalStatus: String(asset?.approvalStatus || 'NOT_REVIEWED'),
		distributionForm: String(asset?.distributionForm || ''),
	}
}

function animationNames(file) {
	const { json } = parseGlb(fs.readFileSync(file))
	return (json.animations || []).map(animation => String(animation.name || '')).filter(Boolean)
}

function productState({ baked, approved, contactReady = false }) {
	if (!baked || !approved) return 'PLANNED_NOT_SELECTABLE'
	return contactReady ? 'EXECUTABLE_INTERACTION_MOTION' : 'EXECUTABLE_GENERAL_MOTION'
}

function catalogId(family, slug) {
	return `motion.${family}.${cleanSlug(slug)}`
}

function assertUnique(records, issues) {
	const seen = new Set()
	for (const row of records) {
		if (seen.has(row.motionId)) issues.push({ code: 'DUPLICATE_MOTION_ID', motionId: row.motionId })
		seen.add(row.motionId)
	}
}

function buildCatalog() {
	const kineticPlan = readJson(PRIVATE_SOURCE_FILES.kineticPlan)
	const kineticClipmap = readJson(PRIVATE_SOURCE_FILES.kineticClipmap)
	const kineticExtensionClipmap = readJson(PRIVATE_SOURCE_FILES.kineticExtensionClipmap)
	const kineticExtensionProof = readJson(PRIVATE_SOURCE_FILES.kineticExtensionProof)
	const ordinaryClipmap = readJson(PRIVATE_SOURCE_FILES.ordinaryClipmap)
	const interactionClipmap = readJson(PRIVATE_SOURCE_FILES.interactionClipmap)
	const interactionProof = readJson(PRIVATE_SOURCE_FILES.interactionProof)
	const releaseManifest = readJson(PRIVATE_SOURCE_FILES.releaseManifest)
	const kineticApproval = g5AssetState(releaseManifest, 'kinetic-clips-pool')
	const kineticExtensionApproval = g5AssetState(releaseManifest, 'kinetic-clips-extension')
	const ordinaryApproval = g5AssetState(releaseManifest, 'ordinary-18-gesture-library')
	const interactionApproval = g5AssetState(releaseManifest, 'authoring-interaction-18')
	const kineticAnimations = animationNames(PRIVATE_SOURCE_FILES.kineticPool)
	const kineticExtensionAnimations = animationNames(PRIVATE_SOURCE_FILES.kineticExtensionPool)
	const ordinaryAnimations = animationNames(PRIVATE_SOURCE_FILES.ordinaryPool)
	const interactionAnimations = animationNames(PRIVATE_SOURCE_FILES.interactionPool)
	const kineticBaked = new Set((kineticClipmap.intents || []).map(cleanSlug))
	const kineticActual = new Map(kineticAnimations.map(name => [cleanSlug(name), name]))
	const kineticExtensionActual = new Map(kineticExtensionAnimations.map(name => [cleanSlug(name), name]))
	const ordinaryActual = new Set(ordinaryAnimations.map(cleanSlug))
	const interactionActual = new Set(interactionAnimations.map(cleanSlug))
	const issues = []
	const records = []
	const kineticAliases = Object.fromEntries(Object.entries(kineticExtensionClipmap.aliases || {}).map(([alias, source]) => [cleanSlug(alias), cleanSlug(source)]))
	const resolveKineticSource = slug => {
		if (kineticBaked.has(slug) && kineticActual.has(slug)) return { sourceSlug: kineticActual.get(slug), sourceSemanticSlug: slug, sourceLibrary: 'kinetic', sourceProvider: 'mixamo', alias: false }
		if (kineticExtensionActual.has(slug)) return { sourceSlug: kineticExtensionActual.get(slug), sourceSemanticSlug: slug, sourceLibrary: 'kinetic-extension', sourceProvider: 'nvidia-kimodo', alias: false }
		const sourceSemanticSlug = kineticAliases[slug]
		if (!sourceSemanticSlug) return null
		if (kineticBaked.has(sourceSemanticSlug) && kineticActual.has(sourceSemanticSlug)) return { sourceSlug: kineticActual.get(sourceSemanticSlug), sourceSemanticSlug, sourceLibrary: 'kinetic', sourceProvider: 'mixamo', alias: true }
		if (kineticExtensionActual.has(sourceSemanticSlug)) return { sourceSlug: kineticExtensionActual.get(sourceSemanticSlug), sourceSemanticSlug, sourceLibrary: 'kinetic-extension', sourceProvider: 'nvidia-kimodo', alias: true }
		return null
	}

	for (const clip of kineticPlan.clips || []) {
		const slug = cleanSlug(clip.name)
		const source = resolveKineticSource(slug)
		const baked = Boolean(source)
		const sourceApproval = source?.sourceLibrary === 'kinetic-extension' ? kineticExtensionApproval : kineticApproval
		const powerpointMeasured = source?.sourceLibrary === 'kinetic-extension'
			? kineticExtensionProof.status === 'PASS'
			: baked
		const state = productState({ baked, approved: sourceApproval.approved && powerpointMeasured })
		records.push({
			motionId: catalogId('kinetic', slug),
			family: 'kinetic',
			slug,
			displayName: titleCase(slug),
			description: String(clip.use || `Expressive kinetic ${titleCase(slug)} motion.`),
			narrativeUses: [String(clip.use || '')].filter(Boolean),
			semanticTags: tagsForKinetic(slug, clip.use),
			expressiveRoles: ['kinetic-emphasis'],
			interactionVerbs: [],
			behavior: {
				inPlace: Boolean(clip.inPlace),
				rootMotion: clip.inPlace ? 'in-place' : 'traveling',
				loopable: /idle|floating|flying|walking|meditate/i.test(slug),
				energy: energyForKinetic(slug),
				tempo: tempoForKinetic(slug),
			},
			lifecycle: {
				sourceState: baked ? 'SOURCE_IDENTIFIED' : 'PLANNED',
				buildState: baked ? 'BAKED' : 'NOT_BAKED',
				measurementState: state === 'EXECUTABLE_GENERAL_MOTION' ? 'POWERPOINT_MEASURED' : baked ? 'DURATION_MEASURED' : 'UNMEASURED',
				distributionState: sourceApproval.approved ? 'APPROVED_IN_PROJECT' : 'NOT_REVIEWED',
				productState: state,
			},
			selectable: state === 'EXECUTABLE_GENERAL_MOTION',
			privateEvidence: {
				familyIndex: Number(clip.n),
				sourceSlug: source?.sourceSlug || String(clip.name),
				sourceLibrary: source?.sourceLibrary || null,
				sourceProvider: source?.sourceProvider || null,
				bakedPoolMember: baked,
				sourcePlan: 'kinetic-plan',
				...(source?.alias ? { declaredAliasOf: source.sourceSemanticSlug, declaredAliasPlanIndex: Number(clip.dupeOf || 0) || null } : {}),
			},
		})
	}

	for (const intent of ordinaryClipmap.intents || []) {
		const slug = cleanSlug(intent)
		const expectedName = cleanSlug((ordinaryClipmap.clipNames || [])[Number(ordinaryClipmap.clipMap?.[intent])])
		const baked = Boolean(expectedName && ordinaryActual.has(expectedName))
		const playbackHold = POWERPOINT_PLAYBACK_HOLDS[slug] || null
		const sourceState = productState({ baked, approved: ordinaryApproval.approved })
		const state = playbackHold && sourceState === 'EXECUTABLE_GENERAL_MOTION' ? 'IMPLEMENTED_NOT_SELECTABLE' : sourceState
		records.push({
			motionId: catalogId('ordinary', slug),
			family: 'ordinary-gesture',
			slug,
			displayName: titleCase(slug),
			description: ORDINARY_MOTION_DESCRIPTIONS[slug] || `Professional ${titleCase(slug)} gesture.`,
			narrativeUses: [ORDINARY_MOTION_DESCRIPTIONS[slug] || `Use for ${titleCase(slug).toLowerCase()} meaning.`],
			semanticTags: ['ordinary-gesture', slug],
			expressiveRoles: ['presenter-gesture'],
			interactionVerbs: [],
			behavior: {
				inPlace: slug !== 'walk',
				rootMotion: slug === 'walk' ? 'in-place-travel-cycle' : 'in-place',
				loopable: slug === 'idle' || slug === 'walk',
				energy: ['happy', 'surprise', 'clap'].includes(slug) ? 'high' : ['think', 'idle'].includes(slug) ? 'low' : 'medium',
				tempo: ['idle', 'think'].includes(slug) ? 'slow' : 'moderate',
			},
			lifecycle: {
				sourceState: baked ? 'SOURCE_IDENTIFIED' : 'PLANNED',
				buildState: baked ? 'BAKED' : 'NOT_BAKED',
				measurementState: playbackHold
					? 'POWERPOINT_VISUAL_PROOF_FAILED'
					: state === 'EXECUTABLE_GENERAL_MOTION' ? 'POWERPOINT_MEASURED' : baked ? 'DURATION_MEASURED' : 'UNMEASURED',
				distributionState: ordinaryApproval.approved ? 'APPROVED_IN_PROJECT' : 'NOT_REVIEWED',
				productState: state,
			},
			selectable: state === 'EXECUTABLE_GENERAL_MOTION',
			privateEvidence: { canonicalIntent: intent, sourceSlug: String((ordinaryClipmap.clipNames || [])[Number(ordinaryClipmap.clipMap?.[intent])] || intent), canonicalClipIndex: Number(ordinaryClipmap.clipMap?.[intent]), sourcePoolMember: baked, ...(playbackHold ? { playbackHold } : {}) },
		})
	}

	for (const slot of interactionClipmap.slots || []) {
		const slug = cleanSlug(slot.slug)
		const sourceClipName = `${String(slot.slot).padStart(2, '0')}_${slot.slug}`
		const expectedName = cleanSlug(sourceClipName)
		const baked = interactionActual.has(expectedName)
		const powerpointMeasured = interactionProof.status === 'PASS'
		const state = productState({ baked, approved: interactionApproval.approved && powerpointMeasured, contactReady: true })
		records.push({
			motionId: catalogId('interaction', slug),
			family: 'interaction',
			slug,
			displayName: titleCase(slug),
			description: INTERACTION_ROLE_DESCRIPTIONS[slot.role] || `Specialized ${titleCase(slot.role)} interaction motion.`,
			narrativeUses: [`Semantic ${slot.role} interaction for ${Array.isArray(slot.servesVerbs) ? slot.servesVerbs.join(', ') : 'presenter interaction'}.`],
			semanticTags: ['interaction', String(slot.role || 'interaction'), ...(slot.servesVerbs || [])],
			expressiveRoles: ['contact-precise-interaction'],
			interactionVerbs: [...(slot.servesVerbs || [])],
			behavior: {
				inPlace: !['travel'].includes(String(slot.role || '')),
				rootMotion: String(slot.role || '') === 'travel' ? 'traveling' : 'in-place',
				loopable: Boolean(slot.loopable),
				side: slot.side || null,
				heightBand: slot.heightBand || null,
				energy: String(slot.role || '') === 'beat' ? 'high' : 'medium',
				tempo: 'moderate',
			},
			lifecycle: {
				sourceState: baked ? 'SOURCE_IDENTIFIED' : 'PLANNED',
				buildState: baked ? 'BAKED' : 'NOT_BAKED',
				measurementState: state === 'EXECUTABLE_INTERACTION_MOTION' ? 'POWERPOINT_MEASURED' : baked ? 'DURATION_MEASURED' : 'UNMEASURED',
				distributionState: interactionApproval.approved ? 'APPROVED_IN_PROJECT' : 'NOT_REVIEWED',
				productState: state,
			},
			selectable: state === 'EXECUTABLE_INTERACTION_MOTION',
			privateEvidence: {
				legacyAuthoringV3Slot: Number(slot.slot),
				sourceSlug: sourceClipName,
				sourceLibrary: 'interaction',
				sourceProvider: 'nvidia-kimodo',
				sourcePoolMember: baked,
				contactBone: slot.contactBone || null,
				plateauMs: Number(slot.plateauMs || slot.grabPlateauMs || 0) || null,
			},
		})
	}

	assertUnique(records, issues)
	const expectedKinetic = Number(kineticPlan.clips?.length || 0)
	const expectedOrdinary = Number(ordinaryClipmap.intents?.length || 0)
	const expectedInteraction = Number(interactionClipmap.slots?.length || 0)
	if (expectedKinetic !== 60) issues.push({ code: 'KINETIC_PLAN_COUNT_MISMATCH', expected: 60, actual: expectedKinetic })
	if (Number(kineticClipmap.poolSize) !== 31) issues.push({ code: 'KINETIC_POOL_COUNT_MISMATCH', expected: 31, actual: Number(kineticClipmap.poolSize) })
	if (kineticAnimations.length !== Number(kineticClipmap.poolSize)) issues.push({ code: 'KINETIC_GLB_ANIMATION_COUNT_MISMATCH', expected: Number(kineticClipmap.poolSize), actual: kineticAnimations.length })
	if (kineticExtensionAnimations.length !== Number(kineticExtensionClipmap.sourcePoolSize)) issues.push({ code: 'KINETIC_EXTENSION_GLB_ANIMATION_COUNT_MISMATCH', expected: Number(kineticExtensionClipmap.sourcePoolSize), actual: kineticExtensionAnimations.length })
	if (ordinaryAnimations.length !== expectedOrdinary) issues.push({ code: 'ORDINARY_GLB_ANIMATION_COUNT_MISMATCH', expected: expectedOrdinary, actual: ordinaryAnimations.length })
	if (expectedInteraction !== 18) issues.push({ code: 'INTERACTION_CANDIDATE_COUNT_MISMATCH', expected: 18, actual: expectedInteraction })
	if (interactionAnimations.length !== expectedInteraction) issues.push({ code: 'INTERACTION_GLB_ANIMATION_COUNT_MISMATCH', expected: expectedInteraction, actual: interactionAnimations.length })
	for (const name of kineticClipmap.intents || []) if (!kineticActual.has(cleanSlug(name))) issues.push({ code: 'KINETIC_CLIPMAP_ANIMATION_MISSING', slug: cleanSlug(name) })
	for (const name of kineticExtensionClipmap.intents || []) if (!kineticExtensionActual.has(cleanSlug(name))) issues.push({ code: 'KINETIC_EXTENSION_CLIPMAP_ANIMATION_MISSING', slug: cleanSlug(name) })
	for (const clip of kineticPlan.clips || []) if (!resolveKineticSource(cleanSlug(clip.name))) issues.push({ code: 'KINETIC_PLAN_SOURCE_MISSING', slug: cleanSlug(clip.name) })
	for (const intent of ordinaryClipmap.intents || []) {
		const expectedName = cleanSlug((ordinaryClipmap.clipNames || [])[Number(ordinaryClipmap.clipMap?.[intent])])
		if (!ordinaryActual.has(expectedName)) issues.push({ code: 'ORDINARY_CLIPMAP_ANIMATION_MISSING', intent, expectedName })
	}

	const counts = recordCounts(records)
	const catalogFingerprint = recordFingerprint(records)
	return {
		schemaVersion: AUTHORING_MOTION_CATALOG_SCHEMA,
		catalogVersion: '2026-08-31.1',
		catalogFingerprint,
		bundleCeiling: AUTHORING_MOTION_BUNDLE_CEILING,
		inventory: {
			kineticPlanEntries: expectedKinetic,
			kineticBakedEntries: records.filter(row => row.family === 'kinetic' && row.lifecycle.buildState === 'BAKED').length,
			ordinaryGestureEntries: expectedOrdinary,
			interactionCandidateEntries: expectedInteraction,
			...counts,
		},
		provenance: {
			kineticPoolApproval: kineticApproval.approvalStatus,
			kineticExtensionPoolApproval: kineticExtensionApproval.approvalStatus,
			ordinaryPoolApproval: ordinaryApproval.approvalStatus,
			interactionPoolApproval: interactionApproval.approvalStatus,
			motionSourcePolicy: motionSourceProviderPolicy(),
			derivativeDistributionRule: 'approved in-project source assets may construct per-project presenter bundles; raw source and standalone reusable library distribution remain forbidden',
		},
		records,
		verification: { ok: issues.length === 0, issues },
	}
}

let catalogCache = null

export function resolveGovernedCatalogSources(catalog, sources = governedAuthoringMotionSources()) {
	const result = clone(catalog)
	result.sourceResolutionFingerprint = sources.fingerprint
	// The maintainer can freeze an effective catalog. Always recover its base
	// state before applying today's ledger, so revocation/removal cannot leave
	// a formerly proven override selectable through a stale frozen snapshot.
	for (const row of result.records) {
		const fallback = row.privateEvidence?.governedSourceFallback
		if (!fallback) continue
		row.behavior = clone(fallback.behavior)
		row.lifecycle = clone(fallback.lifecycle)
		row.selectable = fallback.selectable
		if (fallback.hasSourceProvider) row.privateEvidence.sourceProvider = fallback.sourceProvider
		else delete row.privateEvidence.sourceProvider
		delete row.privateEvidence.sourceProviderStatus
		delete row.privateEvidence.governedSourceFallback
		delete row.privateEvidence.resolvedSource
		delete row.privateEvidence.playbackHoldSupersededBy
	}
	for (const source of sources.sources) for (const motionId of source.motionIds) {
		const row = result.records.find(record => record.motionId === motionId)
		if (!row) {
			const error = new Error('A governed motion source does not match the presentation motion catalog.')
			error.code = 'AUTHORING_MOTION_SOURCE_INVALID'
			throw error
		}
		const proof = source.playbackValidation, ordinary = row.family === 'ordinary-gesture'
		const governedProofRequired = ordinary || source.retarget?.rotationRetargetSpace === 'world-delta' || source.playbackProof !== undefined
		row.privateEvidence = { ...row.privateEvidence, governedSourceFallback: {
			behavior: clone(row.behavior), lifecycle: clone(row.lifecycle), selectable: row.selectable,
			hasSourceProvider: Object.hasOwn(row.privateEvidence || {}, 'sourceProvider'),
			...(Object.hasOwn(row.privateEvidence || {}, 'sourceProvider') ? { sourceProvider: row.privateEvidence.sourceProvider } : {}),
		}, resolvedSource: {
			id: source.id, sha256: source.sha256, sourceSlug: source.sourceSlug, sourceTake: source.sourceTake,
			sourceProvider: source.sourceProvider, retarget: clone(source.retarget),
			...(proof ? { playbackStatus: proof.status } : {}),
			...(proof?.status === 'PASS' ? { durationMs: proof.durationMs, playbackProofSha256: proof.proofSha256 } : {}),
		} }
		if (!governedProofRequired || proof?.status === 'PASS') row.privateEvidence.sourceProvider = source.sourceProvider
		if (governedProofRequired) {
			delete row.privateEvidence.playbackHoldSupersededBy
			const hold = row.privateEvidence.playbackHold
			const supersedableHold = ordinary && row.slug === 'enumerate' && hold?.code === POWERPOINT_PLAYBACK_HOLDS.enumerate.code && hold?.observedAt === POWERPOINT_PLAYBACK_HOLDS.enumerate.observedAt
			const proven = proof?.status === 'PASS' && (!hold || supersedableHold)
			row.selectable = proven
			row.lifecycle = { ...row.lifecycle,
				...(proven ? { sourceState: 'SOURCE_IDENTIFIED', buildState: 'BAKED', distributionState: 'APPROVED_IN_PROJECT' } : {}),
				measurementState: proven ? 'POWERPOINT_MEASURED' : hold ? 'POWERPOINT_VISUAL_PROOF_FAILED' : 'POWERPOINT_VISUAL_PROOF_REQUIRED',
				productState: proven ? row.family === 'interaction' ? 'EXECUTABLE_INTERACTION_MOTION' : 'EXECUTABLE_GENERAL_MOTION' : 'IMPLEMENTED_NOT_SELECTABLE',
			}
			if (proof?.status === 'PASS') row.behavior = { ...row.behavior, durationMs: proof.durationMs }
			// Keep the failed historical observation intact. Only this exact old
			// hold is superseded, by a separately bound native-playback proof.
			if (proven && supersedableHold) row.privateEvidence.playbackHoldSupersededBy = { sourceId: source.id, sourceSha256: source.sha256, playbackProofSha256: proof.proofSha256 }
		}
	}
	// A source can remain fully baked and have valid historical proof while its
	// provider is temporarily outside the active runtime policy.  Mark that
	// state explicitly after ledger overlay so both fresh and frozen catalogs
	// fail closed without aliasing the motion to another library.
	for (const row of result.records) {
		const provider = row.privateEvidence?.sourceProvider || row.privateEvidence?.resolvedSource?.sourceProvider || null
		if (!provider) continue
		if (!isMotionSourceProviderActive(provider)) {
			row.selectable = false
			row.privateEvidence = { ...row.privateEvidence, sourceProviderStatus: 'QUARANTINED' }
			row.lifecycle = { ...row.lifecycle, measurementState: 'SOURCE_PROVIDER_QUARANTINED', productState: 'IMPLEMENTED_NOT_SELECTABLE' }
		} else {
			row.privateEvidence = { ...row.privateEvidence, sourceProviderStatus: 'ACTIVE' }
		}
	}
	result.inventory = { ...result.inventory, ...recordCounts(result.records), kineticBakedEntries: result.records.filter(row => row.family === 'kinetic' && row.lifecycle.buildState === 'BAKED').length }
	result.catalogFingerprint = recordFingerprint(result.records)
	result.runtimeMotionPolicy = motionSourceProviderPolicy()
	return result
}

export function authoringMotionCatalog({ refresh = false } = {}) {
	if (refresh) catalogCache = buildCatalog()
	else if (!catalogCache) {
		const canonical = readJson(path.join(canonicalRoot, 'authoring-motion-catalog.json'))
		if (canonical?.schemaVersion !== AUTHORING_MOTION_CATALOG_SCHEMA || canonical?.verification?.ok !== true) {
			const error = new Error('The frozen Authoring-v3 motion catalog is missing or invalid; run the maintainer catalog build before starting the authoring runtime.')
			error.code = 'AUTHORING_MOTION_CATALOG_INVALID'
			throw error
		}
		catalogCache = canonical
	}
	return resolveGovernedCatalogSources(catalogCache)
}

export function authoringMotionById(motionId, { refresh = false } = {}) {
	const id = String(motionId || '').trim()
	return authoringMotionCatalog({ refresh }).records.find(row => row.motionId === id) || null
}

// The same pure selection gate serves the live runtime and isolated maintainer
// fixtures. A fixture never mutates the governed catalog or source ledger.
export function resolveAuthoringMotionSelectionForCatalog(catalog, motionIds, { allowPlanned = false, max = AUTHORING_MOTION_BUNDLE_CEILING } = {}) {
	const requested = Array.isArray(motionIds) ? motionIds.map(value => String(value || '').trim()) : []
	const maximum = Math.min(AUTHORING_MOTION_BUNDLE_CEILING, Math.max(1, Number.isFinite(Number(max)) ? Math.floor(Number(max)) : AUTHORING_MOTION_BUNDLE_CEILING))
	const byId = new Map(catalog.records.map(row => [row.motionId, row]))
	const errors = []
	const seen = new Set()
	for (const motionId of requested) {
		if (!motionId) {
			errors.push({ code: 'MOTION_ID_INVALID', motionId, reason: 'Every selected motion position must contain one exact motion.* ID.' })
			continue
		}
		if (seen.has(motionId)) errors.push({ code: 'MOTION_ID_DUPLICATE', motionId, reason: `${motionId} is selected more than once; select each motion at most once per presenter bundle.` })
		seen.add(motionId)
		const row = byId.get(motionId)
		if (!row) {
			errors.push({ code: 'MOTION_ID_UNKNOWN', motionId, reason: `${motionId} is not in the motion catalog; choose an ID returned by the public motion catalog.` })
			continue
		}
		if (!allowPlanned && !row.selectable) errors.push({ code: 'MOTION_NOT_EXECUTABLE', motionId, reason: `${motionId} is tracked in the catalog but is not yet an executable product capability; choose a selectable motion from betterpptx.authoring.catalog.` })
	}
	if (seen.size > maximum) errors.push({ code: 'MOTION_BUNDLE_LIMIT_EXCEEDED', maximum, requested: seen.size, reason: `Choose at most ${maximum} unique motions for one presenter bundle.` })
	const selected = [...seen].map(id => byId.get(id)).filter(Boolean)
	return {
		schemaVersion: 'betterpptx.authoring-motion-selection.v1',
		catalogVersion: catalog.catalogVersion,
		catalogFingerprint: catalog.catalogFingerprint,
		sourceResolutionFingerprint: catalog.sourceResolutionFingerprint,
		ok: errors.length === 0,
		selected,
		selectedMotionIds: selected.map(row => row.motionId),
		budget: { used: seen.size, maximum, remaining: Math.max(0, maximum - seen.size) },
		errors,
	}
}

export function resolveAuthoringMotionSelection(motionIds, options = {}) {
	return resolveAuthoringMotionSelectionForCatalog(authoringMotionCatalog(), motionIds, options)
}

function publicMotionRow(row) {
	const limitation = row.privateEvidence?.sourceProviderStatus === 'QUARANTINED'
		? 'Implemented source is retained in the catalog but temporarily withheld while its animation provider remains under independent runtime validation.'
		: row.lifecycle.productState === 'IMPLEMENTED_NOT_SELECTABLE'
			? 'Implemented source is retained in the catalog but withheld from selection pending satisfactory native PowerPoint playback proof.'
		: 'Tracked for future catalog completion; not currently selectable for a generated presenter bundle.'
	return {
		id: row.motionId,
		family: row.family,
		label: row.displayName,
		description: row.description,
		narrativeUses: [...row.narrativeUses],
		semanticTags: [...row.semanticTags],
		expressiveRoles: [...row.expressiveRoles],
		interactionVerbs: [...row.interactionVerbs],
		behavior: { ...row.behavior },
		availability: row.lifecycle.productState,
		selectable: row.selectable,
		...(row.selectable ? {} : { limitation }),
	}
}

export function publicAuthoringMotionCatalog(args = {}) {
	const catalog = authoringMotionCatalog()
	const family = String(args.family || args.surface || '').trim().toLowerCase()
	const includePlanned = args.includePlanned === true
	const all = catalog.records.filter(row => includePlanned || row.selectable)
	const filtered = family && family !== 'all'
		? all.filter(row => row.family === family || row.family.includes(family) || (family === 'motion' && ['kinetic', 'ordinary-gesture', 'interaction'].includes(row.family)))
		: all
	const limit = Math.max(1, Math.min(500, Number(args.limit) || 100))
	const offset = Math.max(0, Number(args.offset) || 0)
	const records = filtered.slice(offset, offset + limit).map(publicMotionRow)
	return {
		schemaVersion: AUTHORING_MOTION_PUBLIC_SCHEMA,
		status: 'PUBLIC_AUTHORING_MOTION_CATALOG',
		principle: {
			selectionAuthority: 'AI',
			engineRole: 'expose-validate-and-execute',
			catalogDoesNotSelect: true,
			privateAnimationIndicesHidden: true,
			maximumMotionsPerPresenterBundle: catalog.bundleCeiling,
		},
		catalog: {
			catalogVersion: catalog.catalogVersion,
			inventory: { ...catalog.inventory },
			runtimeMotionPolicy: { mode: catalog.runtimeMotionPolicy?.mode || 'mixamo-only', version: catalog.runtimeMotionPolicy?.version || 'mixamo-only-v1', activeProviders: ['mixamo'] },
			includePlanned,
		},
		pagination: {
			offset,
			limit,
			returned: records.length,
			total: filtered.length,
			nextOffset: offset + records.length < filtered.length ? offset + records.length : null,
		},
		motions: records,
	}
}

export function writeAuthoringMotionCatalog(file) {
	const destination = path.resolve(String(file || path.join(root, 'outputs', 'authoring-motion-catalog-reconciliation.json')))
	fs.mkdirSync(path.dirname(destination), { recursive: true })
	fs.writeFileSync(destination, `${JSON.stringify(authoringMotionCatalog({ refresh: true }), null, 2)}\n`)
	return destination
}

export function privateAuthoringMotionCatalogPaths() {
	return { ...PRIVATE_SOURCE_FILES }
}
