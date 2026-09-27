import { createHash } from 'node:crypto'
import { applyRotationOnlyStaticPoseAtTime } from './glb-static-pose-at-time.mjs'
import { normalizeStaticPose, ORDINARY_STATIC_POSE_MOTIONS, staticPoseError } from '../presenter-static-pose-contract.mjs'

// Exact approved ordinary bundles from the v8 source-first verification and the
// 2026-09-03 Talk/Counting native-playback replacement proofs. A new roster
// release needs fresh approval/proof before it enters this allowlist.
// Never accept a caller-supplied manifest as evidence of an approved source.
const APPROVED_ORDINARY_SOURCES = new Map([
	['c97e5c8da788ae84ff62e5225d3a94e338ff75c1ec356d9601611974e5ce1e47', 'joe'],
	['34bd0237ddb5961c7c1ebb31c6a28644e1966fb2d1f4c193096c8778d6a1e25c', 'louise'],
	['99d0f66e010e295cfc2157dea47fb5e428f6ad0cb831aa30ec5696e10b5cd34a', 'pete'],
	['4e6bdce20c194e8326ee92bd0bd24b46b713cbef7cd13906f3af26c73e3f455a', 'joe'],
	['b0afc53516de27f6bd3f7ba30915677f4c989c54153af5d014490bf235fae1f3', 'louise'],
	['aa76447ae9aec973763e229fc5554c799744a6c55b324697e1a6bac629005ad3', 'pete'],
])

export function assertApprovedOrdinaryPresenterSource(sourceBuffer) {
	if (!(sourceBuffer instanceof Uint8Array)) throw staticPoseError('STATIC_POSE_SOURCE_UNAVAILABLE', 'The original approved presenter asset must be available before staticPose can be validated.')
	const source = Buffer.isBuffer(sourceBuffer) ? sourceBuffer : Buffer.from(sourceBuffer)
	const sourceDigest = createHash('sha256').update(source).digest('hex')
	const identity = APPROVED_ORDINARY_SOURCES.get(sourceDigest)
	if (!identity) {
		throw staticPoseError('STATIC_POSE_SOURCE_UNSUPPORTED', 'staticPose requires an unchanged approved ordinary Joe, Louise, or Pete model. A custom, rebuilt, already-posed, or modified motion bank is not supported; use the original source asset.')
	}
	return { sourceDigest, identity }
}

// Pure validation and sampling: this adapter never writes a source or cache.
export function prepareApprovedPresenterStaticPose(sourceBuffer, request) {
	const staticPose = normalizeStaticPose(request)
	if (!staticPose) throw staticPoseError('STATIC_POSE_INVALID', 'A motionId and timeMs are required to sample a static pose.')
	const { sourceDigest, identity } = assertApprovedOrdinaryPresenterSource(sourceBuffer)
	const clipIndex = ORDINARY_STATIC_POSE_MOTIONS.indexOf(staticPose.motionId)
	let sampled
	try {
		sampled = applyRotationOnlyStaticPoseAtTime(sourceBuffer, { clipIndex, timeMs: staticPose.timeMs, allowPassiveRootMotion: true })
	} catch (error) {
		if (error?.code === 'STATIC_POSE_TIME_INVALID') throw staticPoseError(error.code, 'staticPose.timeMs lies outside the selected motion. Choose a time within that motion; playback start time is independent.')
		if (error?.code === 'POWERPOINT_TPOSE_FORBIDDEN') throw staticPoseError(error.code, 'The selected frame is a construction T-pose and cannot be used in PowerPoint. Choose another frame.')
		throw staticPoseError('STATIC_POSE_SAMPLE_UNSUPPORTED', 'This motion frame cannot be sampled while preserving all approved motion and appearance data. Choose another supported ordinary motion or time.')
	}
	return {
		buffer: sampled.buffer, sourceDigest, identity, staticPose,
		report: { ...staticPose, appliesTo: 'stopped-edit-view', playbackStartOffsetApplied: false, animationDataPreserved: true, appearanceDataPreserved: true },
	}
}
