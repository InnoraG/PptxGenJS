import {createHash} from 'node:crypto'
import {ownerBindingKey} from './motion-preparation-planner.mjs'

export const TRUSTED_MOTION_PREPARATION_REPOSITORY_SCHEMA_VERSION =
	'betterpptx.trusted-motion-preparation-repository.v1'

/** One private target alias for registration, profile lookup and execution. */
export function motionPreparationTargetResourceId(handle, owner) {
	if (typeof handle !== 'string' || !/^gen:\/\/rigged3d\/[a-f0-9]{40}$/.test(handle)) throw unavailable()
	return `resource_${createHash('sha256').update(`motion-preparation-target.v1\0${ownerBindingKey(owner)}\0${handle}`).digest('hex').slice(0,32)}`
}

const REQUIRED_METHODS = Object.freeze([
	'lookupCandidate',
	'lookupTarget',
	'resolvePreparationInput',
	'verifyPreparationEvidence',
	'authorizeResource',
	'readResourceBytes',
])

const unavailable = () => Object.assign(
	new Error('Motion preparation is unavailable for this request.'),
	{ code: 'MOTION_PREPARATION_REGISTRY_UNAVAILABLE' },
)

/** Validate the private, owner-configured registry boundary without exposing it to MCP callers. */
export function assertTrustedMotionPreparationRepository(repository) {
	if (!repository || typeof repository !== 'object' || Array.isArray(repository)) throw unavailable()
	const version = Object.getOwnPropertyDescriptor(repository, 'schemaVersion')
	if (!version || !Object.hasOwn(version, 'value')
		|| version.value !== TRUSTED_MOTION_PREPARATION_REPOSITORY_SCHEMA_VERSION) throw unavailable()
	for (const method of REQUIRED_METHODS) {
		if (typeof repository[method] !== 'function') throw unavailable()
	}
	return repository
}

export function isMotionPreparationEligibilityRefusal(error){return /^PREPARATION_(?:SOURCE_NOT_APPROVED|DOMAIN_UNSUPPORTED|SOURCE_CLOCK_UNKNOWN|ANIMATION_PROFILE_UNSUPPORTED|RIG_REST_COMPATIBILITY_UNKNOWN|CALIBRATION_UNKNOWN|CORRESPONDENCE_UNKNOWN|NO_DISTINCT_MIRROR|MIRROR_DISTINCTNESS_UNKNOWN|PROFILE_UNAVAILABLE|INPUT_DRIFT|OWNER_OR_RESOURCE_MISMATCH)$/.test(error?.code||'');}
