import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { persistGeneratedRigged3d, registerLocalRigged3d } from './model3d-gen-providers.mjs'
import { inspectMaterialProfile } from './glb-material-profile.mjs'
import { computeContacts, extractRetargetRestProfile, parseGlb } from '../ir/kinetic-transplant.mjs'

const clipContract = JSON.parse(readFileSync(new URL('../deploy/model3d-worker/canonical/canonical-clipmap.json', import.meta.url), 'utf8'))
// Rendered PowerPoint oracle profiles are maintainer-only inputs. They never
// cross the public tool boundary. The old eight-clip research file is not a
// valid production/current-A1 profile; only an explicitly supplied, hash-matched
// schema-v2 profile with all 18 clips may enable current/production interaction
// solving for the default Joe. A bounded legacy fallback exists only for local
// non-public interaction-contract fixtures.
const JOE_PROFILE_ENV = 'BETTERPPTX_DEFAULT_PRESENTER_TIMELINES_FILE'
const LEGACY_JOE_PROFILE_URL = new URL('../../research-demos/2026-07-13-synergy-calibration/joe-clip-timelines.json', import.meta.url)
const EXPECTED_TIMELINE_KEYS = Object.freeze(clipContract.clipNames.map((_, index) => String(index)))
const CONTACTS = Object.freeze([
	[3602, 9958], [2021, 4800], [507, 542], [926, 3625], [2050, 5200], [3302, 6208],
	[681, 2000], [723, 2000], [723, 2000], [2726, 5125], [521, 1750], [995, 2750],
	[1628, 4250], [819, 1833], [693, 1917], [1702, 4000], [798, 1042], [1250, 4200],
].map(([contactMs, durationMs], animId) => ({ animId, clipName: clipContract.clipNames[animId], contactMs, durationMs })))

function contactContractError(reason) {
	return Object.assign(new Error(`Invalid default presenter contact contract: ${reason}`), { code: 'DEFAULT_PRESENTER_CONTACTS_INVALID' })
}

function contactAccessorRows(json, bin, index, type, label) {
	const accessor = Number.isInteger(index) && index >= 0 ? json.accessors?.[index] : null
	const view = Number.isInteger(accessor?.bufferView) && accessor.bufferView >= 0 ? json.bufferViews?.[accessor.bufferView] : null
	const components = type === 'VEC4' ? 4 : (type === 'VEC3' ? 3 : 1)
	if (!accessor || accessor.componentType !== 5126 || accessor.type !== type
		|| (accessor.normalized !== undefined && accessor.normalized !== false) || accessor.sparse !== undefined
		|| !Number.isSafeInteger(accessor.count) || accessor.count < 1 || !view || view.buffer !== 0) {
		throw contactContractError(`${label} requires a nonempty ordinary float ${type} accessor`)
	}
	const viewOffset = view.byteOffset ?? 0
	const accessorOffset = accessor.byteOffset ?? 0
	const stride = view.byteStride ?? components * 4
	const end = accessorOffset + (accessor.count - 1) * stride + components * 4
	if (![viewOffset, accessorOffset, view.byteLength, stride, end].every(Number.isSafeInteger)
		|| viewOffset < 0 || accessorOffset < 0 || stride < components * 4 || stride % 4 !== 0
		|| end > view.byteLength || viewOffset + view.byteLength > bin.length) {
		throw contactContractError(`${label} accessor exceeds its animation buffer`)
	}
	return Array.from({ length: accessor.count }, (_, row) => Array.from({ length: components }, (_, component) => {
		const value = bin.readFloatLE(viewOffset + accessorOffset + row * stride + component * 4)
		if (!Number.isFinite(value)) throw contactContractError(`${label} contains a non-finite sample`)
		return value
	}))
}

function validateRotationPeakClip(json, bin, animation, motion) {
	if (!Array.isArray(animation.channels) || !animation.channels.length || !Array.isArray(animation.samplers) || !animation.samplers.length) {
		throw contactContractError(`${animation.name} has no measurable rotation tracks`)
	}
	const policy = motion.channelPolicy === undefined ? 'rotation-only' : motion.channelPolicy
	const rootMotion = policy === 'root-motion'
	if (!['rotation-only', 'root-motion'].includes(policy) || (rootMotion && (motion.rootMotionSpace !== 'world' || motion.rootMotionAnchor !== 'start'
		|| !Number.isFinite(motion.rootMotionMaxStatures) || motion.rootMotionMaxStatures <= 0
		|| !Number.isFinite(motion.rootMotionMaxHorizontalStatures) || motion.rootMotionMaxHorizontalStatures <= 0))) {
		throw contactContractError(`${animation.name} requires an explicit supported channel policy and bounded world/start root motion`)
	}
	if (!rootMotion && ['rootMotionSpace', 'rootMotionAnchor', 'rootMotionMaxStatures', 'rootMotionMaxHorizontalStatures'].some(field => motion[field] !== undefined)) {
		throw contactContractError(`${animation.name} cannot discard root-motion options under a rotation-only policy`)
	}
	const rotations = animation.channels.filter(channel => channel?.target?.path === 'rotation')
	const translations = animation.channels.filter(channel => channel?.target?.path === 'translation')
	if (!rotations.length || translations.length !== (rootMotion ? 1 : 0) || animation.channels.length !== rotations.length + translations.length) {
		throw contactContractError(`${animation.name} requires rotation tracks and only its explicitly selected Hips translation`)
	}
	if (motion.expectedRotationChannels !== undefined && (!Number.isSafeInteger(motion.expectedRotationChannels)
		|| motion.expectedRotationChannels < 1 || rotations.length !== motion.expectedRotationChannels)) {
		throw contactContractError(`${animation.name} rotation channel cardinality does not match the motion contract`)
	}
	const targets = new Set()
	let sharedTimes = null
	for (const channel of rotations) {
		const target = channel?.target
		const sampler = Number.isInteger(channel?.sampler) && channel.sampler >= 0 ? animation.samplers[channel.sampler] : null
		if (target?.path !== 'rotation' || !Number.isInteger(target.node) || target.node < 0 || !json.nodes?.[target.node]
			|| targets.has(target.node) || !sampler || !['LINEAR', 'STEP'].includes(sampler.interpolation === undefined ? 'LINEAR' : sampler.interpolation)) {
			throw contactContractError(`${animation.name} requires unique ordinary rotation tracks with supported interpolation`)
		}
		targets.add(target.node)
		const times = contactAccessorRows(json, bin, sampler.input, 'SCALAR', animation.name).map(row => row[0])
		const values = contactAccessorRows(json, bin, sampler.output, 'VEC4', animation.name)
		if (times.length !== values.length || times.some((time, index) => time < 0 || (index > 0 && time <= times[index - 1]))) {
			throw contactContractError(`${animation.name} requires matching rotation keys and strictly increasing nonnegative times`)
		}
		if (values.some(rotation => Math.abs(Math.hypot(...rotation) - 1) > 0.001)) {
			throw contactContractError(`${animation.name} contains a non-unit rotation sample`)
		}
		if (rootMotion && sharedTimes && (sharedTimes.length !== times.length || times.some((time, index) => time !== sharedTimes[index]))) {
			throw contactContractError(`${animation.name} root-motion measurements require exactly matching rotation and translation times`)
		}
		sharedTimes = times
	}
	if (rootMotion) {
		const channel = translations[0]
		const nodeIndex = channel.target.node
		const sampler = Number.isInteger(channel.sampler) && channel.sampler >= 0 ? animation.samplers[channel.sampler] : null
		if (!targets.has(nodeIndex) || !/^mixamorig\d*:Hips$/.test(json.nodes?.[nodeIndex]?.name || '')
			|| !sampler || !['LINEAR', 'STEP'].includes(sampler.interpolation === undefined ? 'LINEAR' : sampler.interpolation)) {
			throw contactContractError(`${animation.name} root motion requires exactly one supported Hips translation track`)
		}
		const times = contactAccessorRows(json, bin, sampler.input, 'SCALAR', animation.name).map(row => row[0])
		const values = contactAccessorRows(json, bin, sampler.output, 'VEC3', animation.name)
		if (times.length !== values.length || times.length !== sharedTimes.length || times.some((time, index) => time !== sharedTimes[index])) {
			throw contactContractError(`${animation.name} root-motion measurements require exactly matching rotation and translation times`)
		}
	}
}

/**
 * Preserve the curated legacy rows unless a motion explicitly opts into a
 * measured rotation peak. That peak is an expressive timing heuristic, not a
 * physical contact or a PowerPoint interaction-oracle proof. Only metadata is
 * derived; the supplied animation, material, skin and geometry bytes stay exact.
 */
export function resolveDefaultPresenterContacts(rawGlb, motionContract) {
	const names = motionContract?.clipNames
	const motions = motionContract?.motions
	if (!Array.isArray(names) || !Array.isArray(motions) || names.length !== CONTACTS.length || motions.length !== CONTACTS.length
		|| names.some((name, index) => name !== clipContract.clipNames[index])) {
		throw contactContractError('the exact ordered clip names and motion cardinality are required')
	}
	const optedIn = motions.map((motion, index) => {
		if (!motion || typeof motion !== 'object' || Array.isArray(motion) || clipContract.clipMap[motion.intent] !== index) {
			throw contactContractError(`motion ${index} does not match its canonical clip`)
		}
		if (Object.prototype.hasOwnProperty.call(motion, 'contactPolicy') && motion.contactPolicy !== 'rotation-peak') {
			throw contactContractError(`motion ${index} has an unsupported contact policy`)
		}
		return motion.contactPolicy === 'rotation-peak'
	})
	const { json, bin } = parseGlb(rawGlb)
	if (!Array.isArray(json.animations) || json.animations.length !== names.length || json.animations.some((animation, index) => animation?.name !== names[index])) {
		throw contactContractError('the source animation names and cardinality must match the exact ordered contract')
	}
	const contacts = CONTACTS.map(contact => ({ ...contact }))
	if (!optedIn.some(Boolean)) return contacts
	for (let index = 0; index < optedIn.length; index++) {
		if (optedIn[index]) validateRotationPeakClip(json, bin, json.animations[index], motions[index])
	}
	const measured = computeContacts(rawGlb)
	return contacts.map((contact, index) => {
		if (!optedIn[index]) return contact
		const measurement = measured[motions[index].intent]
		if (!measurement || !Number.isSafeInteger(measurement.durationMs) || measurement.durationMs < 1
			|| !Number.isSafeInteger(measurement.contactMs) || measurement.contactMs < 0 || measurement.contactMs > measurement.durationMs) {
			throw contactContractError(`${contact.clipName} has no finite whole-millisecond peak within its measured duration`)
		}
		return { ...contact, ...measurement, contactPolicy: 'rotation-peak' }
	})
}

const ASSETS = Object.freeze({
	joe: {
		id: 'joe',
		sex: 'male',
		glb: fileURLToPath(new URL('./default-presenter-joe.glb', import.meta.url)),
		poster: fileURLToPath(new URL('./default-presenter-joe.png', import.meta.url)),
	},
	louise: {
		id: 'louise',
		sex: 'female',
		glb: fileURLToPath(new URL('./default-presenter-louise.glb', import.meta.url)),
		poster: fileURLToPath(new URL('./default-presenter-louise.png', import.meta.url)),
	},
	pete: {
		id: 'pete',
		sex: 'male',
		glb: fileURLToPath(new URL('./default-presenter-pete.glb', import.meta.url)),
		poster: fileURLToPath(new URL('./default-presenter-pete.png', import.meta.url)),
	},
	mena: {
		id: 'mena',
		sex: 'unspecified',
		glb: fileURLToPath(new URL('./default-presenter-mena.glb', import.meta.url)),
		poster: fileURLToPath(new URL('./default-presenter-mena.png', import.meta.url)),
	},
})
const handles = new Map()
const PUBLIC_DEFAULT_IDENTITIES = new Set(['joe', 'louise', 'pete'])
export const PUBLIC_PRESENTER_IDENTITIES = Object.freeze([...PUBLIC_DEFAULT_IDENTITIES])
const PUBLIC_DEFAULT_DERIVED_HANDLES = new Set()

// Built-in release-roster assets are product catalog content, not user-produced
// resources. Their generated-style cache handles remain an internal transport
// detail and must not acquire one tenant's asset grant. Mena stays excluded: it
// is explicitly research-only and owner-gated.
export function isPublicDefaultPresenterHandle(handle) {
	if (typeof handle !== 'string' || !handle) return false
	if (PUBLIC_DEFAULT_DERIVED_HANDLES.has(handle)) return true
	for (const identity of PUBLIC_DEFAULT_IDENTITIES) {
		if (handles.get(identity)?.handle === handle) return true
	}
	return false
}

// Deterministic motion bundles and continuous-performance assets composed from
// a built-in release-roster presenter retain product-catalog authority. Record
// only an internal derivation whose immediate source is already trusted; user
// supplied and owner-gated generated assets never enter this set.
export function registerPublicDefaultPresenterDerivation(sourceHandle, derivedHandle) {
	if (!isPublicDefaultPresenterHandle(sourceHandle)) return false
	if (typeof derivedHandle !== 'string' || !/^gen:\/\/rigged3d\/[a-f0-9]{40}$/.test(derivedHandle)) return false
	PUBLIC_DEFAULT_DERIVED_HANDLES.add(derivedHandle)
	return true
}
// Bump whenever the delivered material transformation changes. The version is
// part of the generated handle so fresh and durable workers cannot hydrate a
// previously registered glossy asset under the corrected source contract.
const MATERIAL_PROFILE_VERSION = 'mixamo-dielectric-v4'
// PowerPoint's supported native-3D branch renders the GLB base transforms in
// edit/static views; am3d:raster is not a native pose override. Seed those base
// transforms from the curated idle clip while leaving all animation bytes and
// inverse-bind matrices untouched.
const STATIC_POSE_PROFILE_VERSION = 'idle-frame0-v1'

function env(name) { return String(process.env[name] || '').trim() }

function profileHash(value) {
	return String(value || '').replace(/^sha256:/i, '').toLowerCase()
}

function validateJoeOracleProfile(profile, sourceSignature) {
	if (!profile || typeof profile !== 'object') return { ok: false, reason: 'profile is not an object' }
	if (Number(profile.schemaVersion) !== 2) return { ok: false, reason: 'schemaVersion must be 2' }
	if (profileHash(profile.actorHash) !== profileHash(sourceSignature)) return { ok: false, reason: 'actorHash does not match the default Joe GLB' }
	if (!profile.executionProfileId || !profile.oracleVersion) return { ok: false, reason: 'executionProfileId and oracleVersion are required' }
	const timelines = profile.timelines
	if (!timelines || typeof timelines !== 'object' || Array.isArray(timelines)) return { ok: false, reason: 'timelines must be an object' }
	const actualKeys = Object.keys(timelines).sort((a, b) => Number(a) - Number(b))
	const missing = EXPECTED_TIMELINE_KEYS.filter(key => !Object.prototype.hasOwnProperty.call(timelines, key))
	const extra = actualKeys.filter(key => !EXPECTED_TIMELINE_KEYS.includes(key))
	if (missing.length || extra.length) return { ok: false, reason: `timeline coverage mismatch (missing=${missing.join(',') || 'none'}, extra=${extra.join(',') || 'none'})` }
	for (const key of EXPECTED_TIMELINE_KEYS) {
		const points = timelines[key]
		if (!Array.isArray(points) || points.length < 5 || points.some(point => !Array.isArray(point) || point.length < 3 || point.some(value => !Number.isFinite(Number(value))))) {
			return { ok: false, reason: `timeline ${key} is not a numeric oracle series with at least five points` }
		}
	}
	return { ok: true, profile }
}

/**
 * Load the current private A1 profile for the built-in Joe asset.
 *
 * This deliberately requires an explicit maintainer path. Packaged/public
 * installs therefore fail closed for interactions instead of accidentally
 * using the historical eight-clip research calibration.
 */
export function loadDefaultPresenterOracleProfile(sourceSignature) {
	const publicMode = ['1', 'true', 'yes', 'on'].includes(String(process.env.BETTERPPTX_PUBLIC_BLACK_BOX || process.env.BETTERPPTX_BLACK_BOX || '').trim().toLowerCase())
	if (publicMode) return { profile: null, source: null, reason: 'public mode refuses private oracle profiles' }
	const file = env(JOE_PROFILE_ENV)
	if (!file) {
		// Existing local interaction-contract fixtures predate schema-v2. Keep
		// that research-only fallback available to a non-public maintainer
		// process, but never allow it through a public/production boundary.
		if (process.env.BETTERPPTX_PUBLIC_BLACK_BOX !== '1' && process.env.BETTERPPTX_ENV !== 'production') {
			try {
				const legacy = JSON.parse(readFileSync(LEGACY_JOE_PROFILE_URL, 'utf8'))
				return { profile: legacy, source: 'legacy-local-research', reason: 'legacy profile is local research-only; supply schema-v2 for current A1 evidence' }
			} catch { /* packaged installs omit research artifacts; interactions fail closed */ }
		}
		return { profile: null, source: null, reason: 'no private profile configured' }
	}
	try {
		if (!statSync(file).isFile()) return { profile: null, source: file, reason: 'configured profile is not a file' }
		const profile = JSON.parse(readFileSync(file, 'utf8'))
		const checked = validateJoeOracleProfile(profile, sourceSignature)
		return checked.ok
			? { profile: checked.profile, source: 'private-a1-profile', reason: null }
			: { profile: null, source: file, reason: checked.reason }
	} catch (error) {
		return { profile: null, source: file, reason: `profile could not be read: ${error?.message || error}` }
	}
}

const LOUISE_SIGNALS = ['health', 'wellness', 'education', 'people', 'community', 'culture', 'human', 'fashion', 'beauty', 'care', 'editorial', 'warm', 'story', 'atelier', 'luxe', 'empathy', 'hr']
const JOE_SIGNALS = ['engineering', 'developer', 'technology', 'finance', 'security', 'operations', 'sports', 'data', 'command', 'brutalist', 'playbook', 'technical']
const PETE_SIGNALS = ['terrain', 'construction', 'civil', 'infrastructure', 'industrial', 'mining', 'agriculture', 'field', 'worksite', 'site safety', 'worker', 'utilities', 'energy', 'logistics', 'maintenance']

function occurrences(text, signals) {
	return signals.reduce((score, signal) => score + (text.includes(signal) ? 1 : 0), 0)
}

export function chooseDefaultPresenter(spec = {}, worldPresenter = null) {
	const requested = String(spec?.presenter?.identity || spec?.presenter?.person || spec?.presenter?.sex || 'auto').toLowerCase()
	if (requested === 'joe' || requested === 'male') return { identity: 'joe', mode: 'explicit', reason: 'explicit author choice', scores: { joe: 1, louise: 0, pete: 0, mena: 0 } }
	if (requested === 'louise' || requested === 'female') return { identity: 'louise', mode: 'explicit', reason: 'explicit author choice', scores: { joe: 0, louise: 1, pete: 0, mena: 0 } }
	if (requested === 'pete' || requested === 'worker' || requested === 'terrain-worker') return { identity: 'pete', mode: 'explicit', reason: 'explicit author choice', scores: { joe: 0, louise: 0, pete: 1, mena: 0 } }
	if (requested === 'mena') return { identity: 'mena', mode: 'explicit', reason: 'explicit author choice', scores: { joe: 0, louise: 0, pete: 0, mena: 1 } }
	const text = JSON.stringify({ title: spec.title, audience: spec.audience, objective: spec.objective, styleIntent: spec.styleIntent, theme: spec.theme, world: spec.world, persona: worldPresenter?.persona, slides: spec.slides?.map(slide => ({ title: slide.title, message: slide.message, role: slide.role })) }).toLowerCase()
	const scores = { joe: occurrences(text, JOE_SIGNALS), louise: occurrences(text, LOUISE_SIGNALS), pete: occurrences(text, PETE_SIGNALS) }
	const highest = Math.max(...Object.values(scores))
	const tied = Object.keys(scores).filter(identity => scores[identity] === highest)
	const identity = tied.length === 1
		? tied[0]
		: tied[parseInt(createHash('sha256').update(text).digest('hex').slice(0, 2), 16) % tied.length]
	return { identity, mode: 'auto-fallback', reason: tied.length > 1 ? 'balanced deterministic choice' : 'topic and visual-world fit', scores }
}

export function ensureDefaultPresenterRegistered(identity) {
	const id = Object.prototype.hasOwnProperty.call(ASSETS, identity) ? identity : 'joe'
	const asset = ASSETS[id]
	const rawGlb = readFileSync(asset.glb)
	const motionContract = JSON.parse(readFileSync(new URL('./default-presenter-motion-contract.json', import.meta.url), 'utf8'))
	const contacts = resolveDefaultPresenterContacts(rawGlb, motionContract)
	// A policy-only change must not reuse a durable legacy metadata record. The
	// unchanged default keeps its historical handle; opted-in records bind both
	// the exact source bytes and their measured contact metadata.
	const contactProfileKey = contacts.some(contact => contact.contactPolicy)
		? `:rotation-peak-v1:${createHash('sha256').update(JSON.stringify(contacts)).digest('hex').slice(0, 16)}`
		: ''
	const retargetBaseGlb = id === 'mena'
		? rawGlb
		: readFileSync(new URL(`./presenter-source-${id}-static.glb`, import.meta.url))
	const retargetRestProfile = extractRetargetRestProfile(retargetBaseGlb)
	const sourceSignature = createHash('sha256').update(rawGlb).digest('hex')
	const oracle = id === 'joe' ? loadDefaultPresenterOracleProfile(sourceSignature) : { profile: null, source: null, reason: null }
	const oracleDigest = oracle.profile ? createHash('sha256').update(JSON.stringify(oracle.profile)).digest('hex').slice(0, 16) : 'none'
	const registrationKey = `${sourceSignature}:${MATERIAL_PROFILE_VERSION}:${STATIC_POSE_PROFILE_VERSION}:${oracleDigest}${contactProfileKey}`
	const existing = handles.get(id)
	if (existing && existing.registrationKey === registrationKey) return existing
	// The governed roster builder verifies and freezes the built-in roster assets
	// as strict matte before registration. Keep these bytes exact here so the
	// PowerPoint-verified files are the files actually served.
	const material = { buffer: rawGlb, changed: 0 }
	const glb = material.buffer
	const previewBase64 = readFileSync(asset.poster).toString('base64')
	const manifest = {
		contract: 'betterpptx.default-presenter.v1',
		identity: id,
		sex: asset.sex,
		canonicalSkeletonVersion: String(clipContract.canonicalSkeletonVersion),
		clipMap: { ...clipContract.clipMap },
		clipNames: [...clipContract.clipNames],
		animCount: clipContract.clipNames.length,
		materialProfile: 'mixamo-dielectric-strict-matte',
		materialProfileVersion: MATERIAL_PROFILE_VERSION,
		materialProfileChanges: material.changed,
		materialProfileMaterials: inspectMaterialProfile(glb),
		relativeCastHeight: id === 'louise' ? 0.94 : (id === 'pete' ? 1.0012537 : 1),
		...(id === 'mena' ? {
			personaKind: 'mena-supplied-meshy-hybrid-research',
			audienceFocus: 'youth-and-young-adult-topics',
			releaseStatus: 'research-only-owner-gated',
		} : {}),
		staticPoseProfile: 'post-bake-source-animation-frame',
		staticPoseProfileVersion: STATIC_POSE_PROFILE_VERSION,
		staticPoseClipName: '00_idle',
		contacts,
		...(id === 'joe' && oracle.profile ? {
			clipTimelines: oracle.profile,
			timelineSource: oracle.source === 'private-a1-profile' ? 'powerpoint-oracle-calibration' : 'legacy-local-research',
			timelineProfile: oracle.source === 'private-a1-profile' ? `joe-a1-${oracle.profile.executionProfileId}` : 'joe-legacy-local-v1',
			timelineProfileDigest: oracleDigest,
		} : {}),
	}
	const registered = registerLocalRigged3d({
		glbBase64: glb.toString('base64'),
		glbBytes: glb.length,
		retargetRestProfile,
		previewBase64,
		manifest,
		basisKey: `default-presenter.v4:${id}:${sourceSignature.slice(0, 16)}:${MATERIAL_PROFILE_VERSION}:${STATIC_POSE_PROFILE_VERSION}:${oracleDigest}${contactProfileKey}`,
		license: id === 'mena'
			? { source: 'meshy-supplied-research-artifact', performer: 'mixamo-baked', commercialUse: 'owner-gated', attributionRequired: true, releaseStatus: 'research-only' }
			: { source: 'mixamo-character', performer: 'mixamo-baked', commercialUse: 'in-project', attributionRequired: false },
	})
	const result = { ...registered, identity: id, sex: asset.sex, sourceSignature, registrationKey, manifest, oracleProfile: oracle.profile ? { source: oracle.source, executionProfileId: oracle.profile.executionProfileId, oracleVersion: oracle.profile.oracleVersion, timelineCount: Object.keys(oracle.profile.timelines).length, digest: oracleDigest } : { source: oracle.source, reason: oracle.reason } }
	handles.set(id, result)
	return result
}

// Explicit maintainer/bootstrap operation. Default registration remains
// synchronous because the compiler is synchronous; callers that own the
// durable-asset lifecycle can persist the exact hash-linked record separately.
// No public tool calls this helper implicitly.
export async function persistDefaultPresenterRegistration(identity = 'joe', tenantId = 'default-presenter') {
	const registered = ensureDefaultPresenterRegistered(identity)
	const persisted = await persistGeneratedRigged3d(registered.hash, tenantId)
	return { ...registered, persisted }
}

export function materializeDefaultPresenterForSpec(spec, worldPresenter = null) {
	if (!spec || typeof spec !== 'object') return spec
	const materialize = entry => {
		const presenter = entry === true ? {} : entry
		if (!presenter || typeof presenter !== 'object' || presenter.enabled === false || presenter.model || presenter.avatar || presenter.glb) return presenter
		const selection = chooseDefaultPresenter({ ...spec, presenter }, worldPresenter)
		const asset = ensureDefaultPresenterRegistered(selection.identity)
		return {
			...presenter,
			model: asset.handle,
			identity: selection.identity,
			selection: { mode: selection.mode, reason: selection.reason, scores: selection.scores },
		}
	}
	let out = spec
	if (spec.presenter) out = { ...out, presenter: materialize(spec.presenter) }
	const cast = spec.presenters && Array.isArray(spec.presenters.cast) ? spec.presenters.cast : null
	if (cast?.length) {
		out = {
			...out,
			presenters: {
				...out.presenters,
				cast: cast.map(entry => entry && typeof entry === 'object' ? materialize(entry) : entry),
			},
		}
	}
	return out
}
