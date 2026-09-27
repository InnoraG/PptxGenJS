import { avatarError } from '../errors.mjs'
import { renderTestStaticFfmpeg } from './testStaticFfmpeg.mjs'
import { renderSadTalkerCli } from './sadtalkerCli.mjs'
import { renderMuseTalkHttp, normalizeAvatarMotionProfile, normalizeAvatarMouthProfile } from './musetalkHttp.mjs'
import { renderLivePortraitMuseTalkHttp } from './liveportraitMuseTalkHttp.mjs'
import {
	PRODUCTION_TALKING_HEAD_CONTRACT_VERSION,
	resolveProductionTalkingHeadOptions,
	resolveProductionTalkingHeadProvider,
} from '../production-profile.mjs'

export function normalizeAvatarProvider(value) {
	return String(value || process.env.BETTERPPTX_AVATAR_PROVIDER || 'disabled').trim().toLowerCase()
}

export function resolveAvatarProvider(value, options = {}) {
	return resolveProductionTalkingHeadProvider(value, options)
}

export function resolveAvatarProviderOptions(provider, options = {}) {
	return resolveProductionTalkingHeadOptions(provider, options, {
		normalizeMotionProfile: normalizeAvatarMotionProfile,
		normalizeMouthProfile: normalizeAvatarMouthProfile,
	})
}

export { normalizeAvatarMotionProfile, normalizeAvatarMouthProfile }
export { PRODUCTION_TALKING_HEAD_CONTRACT_VERSION }

export async function renderWithAvatarProvider(provider, args = {}) {
	const name = resolveAvatarProvider(provider)
	const resolvedArgs = { ...args, options: resolveAvatarProviderOptions(name, args.options || {}) }
	if (name === 'disabled' || !name) throw avatarError('AVATAR_UNAVAILABLE', 'Avatar rendering is disabled.')
	if (name === 'test-static') return renderTestStaticFfmpeg(resolvedArgs)
	if (name === 'sadtalker') return renderSadTalkerCli(resolvedArgs)
	if (name === 'musetalk') return renderMuseTalkHttp({ ...resolvedArgs, provider: name })
	if (name === 'liveportrait-musetalk') return renderLivePortraitMuseTalkHttp(resolvedArgs)
	if (name === 'liveportrait-musetalk-commercial') return renderMuseTalkHttp({ ...resolvedArgs, provider: name })
	throw avatarError('AVATAR_UNAVAILABLE', 'Requested avatar quality is unavailable.')
}
