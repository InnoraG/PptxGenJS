export class AvatarError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'AvatarError'
		this.code = code
		this.details = details
	}
}

export function avatarError(code, message, details = {}) {
	return new AvatarError(code, message, details)
}

export function publicAvatarWarnings(warnings) {
	if (!Array.isArray(warnings) || warnings.length === 0) return []
	return warnings.map((warning, index) => {
		const originalCode = String(warning?.code || '')
		if (originalCode === 'AVATAR_NARRATION_DURATION_DRIFT') return {
			code: originalCode,
			severity: 'warning',
			message: 'Resolved avatar narration duration differs from the authored expectation beyond the accepted tolerance.',
			reason: 'The resolved avatar narration duration differs from the authored expectation beyond the accepted tolerance.',
			fix: 'Review the script/audio duration or adjust the semantic timing expectation and tolerance, then rerun validation.',
			evidence: {
				expectedDurationMs: Number.isFinite(Number(warning.expectedDurationMs)) ? Number(warning.expectedDurationMs) : null,
				actualDurationMs: Number.isFinite(Number(warning.actualDurationMs)) ? Number(warning.actualDurationMs) : null,
				driftMs: Number.isFinite(Number(warning.durationDriftMs)) ? Number(warning.durationDriftMs) : null,
				toleranceMs: Number.isFinite(Number(warning.toleranceMs)) ? Number(warning.toleranceMs) : null,
			},
		}
		if (originalCode === 'AVATAR_CUE_TARGET_MISSING') {
			const requestedCues = Number(warning.requestedCues) || 0
			const appliedCues = Number(warning.appliedCues) || 0
			return {
				code: originalCode,
				severity: 'warning',
				message: 'One or more authored avatar narration cues did not resolve to a visible semantic object.',
				reason: 'One or more authored avatar narration cues could not resolve to a visible semantic object, so the requested spoken-to-visual beat was not applied.',
				fix: 'Create or name the target visual before narration, target a stable content[].name/objectName, or remove the stale cue and rerun dryRun.',
				evidence: { requestedCues, appliedCues, missingCues: Math.max(0, requestedCues - appliedCues), targetAuthority: 'stable semantic object name' },
			}
		}
		return {
			code: 'AVATAR_NOTICE',
			severity: 'info',
			message: 'The avatar narration engine recorded a non-blocking notice while preparing the presenter timeline.',
			reason: 'The avatar narration engine recorded a non-blocking notice while preparing the presenter timeline.',
			fix: 'Review the returned presenter/timing readback and rerun the semantic authoring request if correction is needed.',
			evidence: { noticeCount: warnings.length, noticeIndex: index },
		}
	})
}

export function publicAvatarError(err) {
	const code = err?.code || 'AVATAR_FAILED'
	if (code === 'AVATAR_UNAVAILABLE') return 'Avatar video generation is not available in this environment.'
	if (code === 'AVATAR_CAPACITY_EXHAUSTED') return 'Talking-head rendering capacity is temporarily exhausted. No video was rendered and no talking-head allowance was used. Retry later, or continue with voice-only narration.'
	if (code === 'MEDIA_PROBE_FAILED') return 'Avatar media could not be verified.'
	if (code === 'MEDIA_NORMALIZE_FAILED') return 'Avatar media could not be normalized for PowerPoint.'
	if (code === 'MEDIA_UNSUPPORTED_INPUT') return 'Avatar media input is not supported.'
	if (code === 'AVATAR_SELFIE_REQUIRED') return 'Talking-head generation requires a selfie uploaded in this request.'
	if (code === 'AVATAR_CONSENT_REQUIRED') return 'Uploaded presenter images require explicit consent confirmation.'
	if (code === 'AVATAR_LICENSE_REVIEW_REQUIRED') return 'Avatar narration is not enabled for this production environment.'
	if (code === 'AVATAR_SHARED_STORE_REQUIRED') return 'Avatar narration is temporarily unavailable while shared storage is being configured.'
	return 'Avatar narration failed.'
}
