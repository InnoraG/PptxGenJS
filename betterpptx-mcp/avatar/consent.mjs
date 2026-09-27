import { avatarError } from './errors.mjs'
import { consentAuditHash } from './artifacts.mjs'

// Maintainer-only artifact helpers may still inspect the engineering fixture,
// but product generation boundaries must use assertAvatarGenerationInput.
export function assertAvatarConsent(avatar = {}) {
	if (!avatar || avatar.source === undefined || avatar.source === 'default') return null
	if (avatar.source !== 'uploaded') throw avatarError('MEDIA_UNSUPPORTED_INPUT', 'Unsupported avatar source.')
	if (avatar.consentAffirmed !== true) {
		throw avatarError('AVATAR_CONSENT_REQUIRED', 'Uploaded avatar images require consentAffirmed=true.')
	}
	return true
}

export function assertAvatarGenerationInput(avatar = {}) {
	if (!avatar || avatar.source !== 'uploaded') {
		throw avatarError('AVATAR_SELFIE_REQUIRED', 'Talking-head generation requires a user-uploaded selfie in this request.')
	}
	return assertAvatarConsent(avatar)
}

export function avatarConsentAudit({ avatar = {}, sessionId = '', deckId = '', imageHash = '' } = {}) {
	if (avatar?.source !== 'uploaded') return null
	return {
		affirmed: avatar.consentAffirmed === true,
		fingerprint: consentAuditHash({ sessionId, deckId, imageHash }),
	}
}
