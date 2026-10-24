import { AnimationProps } from '../core-interfaces'

/** Validate the normalized interval sampled by a native embedded-scene animation. */
export function resolveSceneProgress(animation: Pick<AnimationProps, 'type' | 'effect' | 'sceneProgress'>): { start: number; end: number } {
	const range = animation.sceneProgress
	if (range === undefined) return { start: 0, end: 1 }
	if (animation.type !== 'emphasis' || (animation.effect || '').toLowerCase() !== 'playscene') {
		throw new Error('sceneProgress is supported only for emphasis/playScene animations.')
	}
	if (!range || typeof range !== 'object' || Array.isArray(range) ||
		typeof range.start !== 'number' || typeof range.end !== 'number' ||
		!Number.isFinite(range.start) || !Number.isFinite(range.end) ||
		range.start < 0 || range.end > 1 || range.start >= range.end) {
		throw new Error('sceneProgress requires finite numeric start and end values with 0 <= start < end <= 1.')
	}
	return { start: range.start, end: range.end }
}
