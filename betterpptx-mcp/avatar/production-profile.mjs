import { avatarError } from './errors.mjs'

// Private deployment contract for the owner-approved talking-head lane. These
// implementation identifiers are never returned by public tools or written to
// delivered presentations; they exist only to make production fail closed.
export const PRODUCTION_TALKING_HEAD_PROVIDER = 'liveportrait-musetalk-commercial'
export const PRODUCTION_TALKING_HEAD_MOTION_PROFILE = 'blink'
export const PRODUCTION_TALKING_HEAD_MOUTH_PROFILE = 'jaw'
export const PRODUCTION_TALKING_HEAD_PIPELINE = 'liveportrait-musetalk-commercial-restoreformer-pp'
export const PRODUCTION_TALKING_HEAD_ENHANCEMENT = 'restoreformer++'
export const PRODUCTION_TALKING_HEAD_CONTRACT_VERSION = 'commercial-only-reviewed-2026-08-14.v1'

function enabled(value) {
	return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase())
}

function normalized(value) {
	return String(value || '').trim().toLowerCase()
}

export function avatarDevelopmentLaneEnabled(env = process.env) {
	// An explicit production-only deployment can never be relaxed by a second
	// flag. The development switch exists solely for local/CI fixture renders.
	return !enabled(env.BETTERPPTX_AVATAR_PRODUCTION_ONLY)
		&& enabled(env.BETTERPPTX_AVATAR_DEVELOPMENT_MODE)
}

export function productionTalkingHeadOnlyEnabled(env = process.env) {
	if (enabled(env.BETTERPPTX_AVATAR_PRODUCTION_ONLY)) return true
	return enabled(env.BETTERPPTX_PUBLIC_BLACK_BOX) && !avatarDevelopmentLaneEnabled(env)
}

function productionProfileError() {
	return avatarError(
		'AVATAR_PRODUCTION_PROFILE_REQUIRED',
		'Talking-head generation is unavailable because the approved production profile is not active.',
		{ retryable: false },
	)
}

export function resolveProductionTalkingHeadProvider(value, { env = process.env, fallback = 'disabled' } = {}) {
	const productionOnly = productionTalkingHeadOnlyEnabled(env)
	const configured = normalized(env.BETTERPPTX_AVATAR_PROVIDER || (productionOnly ? PRODUCTION_TALKING_HEAD_PROVIDER : fallback))
	const requested = normalized(value || configured || fallback)
	if (!productionOnly) return requested
	if (configured !== PRODUCTION_TALKING_HEAD_PROVIDER) throw productionProfileError()
	if (requested && requested !== PRODUCTION_TALKING_HEAD_PROVIDER) throw productionProfileError()
	return PRODUCTION_TALKING_HEAD_PROVIDER
}

export function resolveProductionTalkingHeadOptions(provider, options = {}, {
	env = process.env,
	normalizeMotionProfile,
	normalizeMouthProfile,
} = {}) {
	if (provider !== PRODUCTION_TALKING_HEAD_PROVIDER || !productionTalkingHeadOnlyEnabled(env)) return { ...options }
	const normalizeMotion = typeof normalizeMotionProfile === 'function' ? normalizeMotionProfile : normalized
	const normalizeMouth = typeof normalizeMouthProfile === 'function' ? normalizeMouthProfile : normalized
	const configuredMotion = normalizeMotion(env.BETTERPPTX_AVATAR_PRODUCTION_MOTION_PROFILE || PRODUCTION_TALKING_HEAD_MOTION_PROFILE)
	const configuredMouth = normalizeMouth(env.BETTERPPTX_AVATAR_PRODUCTION_MOUTH_PROFILE || PRODUCTION_TALKING_HEAD_MOUTH_PROFILE)
	if (configuredMotion !== PRODUCTION_TALKING_HEAD_MOTION_PROFILE || configuredMouth !== PRODUCTION_TALKING_HEAD_MOUTH_PROFILE) {
		throw productionProfileError()
	}
	const requestedMotion = options.motionProfile == null ? 'default' : normalizeMotion(options.motionProfile)
	const requestedMouth = options.mouthProfile == null ? 'default' : normalizeMouth(options.mouthProfile)
	if (!['default', PRODUCTION_TALKING_HEAD_MOTION_PROFILE].includes(requestedMotion)) throw productionProfileError()
	if (!['default', PRODUCTION_TALKING_HEAD_MOUTH_PROFILE].includes(requestedMouth)) throw productionProfileError()
	return {
		...options,
		motionProfile: PRODUCTION_TALKING_HEAD_MOTION_PROFILE,
		mouthProfile: PRODUCTION_TALKING_HEAD_MOUTH_PROFILE,
	}
}

export function assertProductionTalkingHeadAttestation(provider, usage = {}, { env = process.env } = {}) {
	if (provider !== PRODUCTION_TALKING_HEAD_PROVIDER) return true
	const pipelineOk = normalized(usage.pipeline) === PRODUCTION_TALKING_HEAD_PIPELINE
	const enhancementOk = normalized(usage.enhancement) === PRODUCTION_TALKING_HEAD_ENHANCEMENT
	const restorationOk = Number.isFinite(Number(usage.restorationSeconds)) && Number(usage.restorationSeconds) > 0
	let profileOk = true
	if (productionTalkingHeadOnlyEnabled(env)) {
		profileOk = normalized(usage.motionProfile) === PRODUCTION_TALKING_HEAD_MOTION_PROFILE
			&& normalized(usage.mouthProfile) === PRODUCTION_TALKING_HEAD_MOUTH_PROFILE
	}
	if (!pipelineOk || !enhancementOk || !restorationOk || !profileOk) {
		throw avatarError(
			'AVATAR_PRODUCTION_PROFILE_MISMATCH',
			'Talking-head generation did not return the approved production profile.',
			{ retryable: true },
		)
	}
	return true
}
