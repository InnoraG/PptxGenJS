/**
 * Coordinate contract for authored motion paths.
 *
 * AI and public authoring describe motion in slide space: positive X means
 * slide-right and positive Y means slide-down. The approved K14 native
 * reference and early live probe establish that the relative PowerPoint path
 * carrier used here preserves that authored horizontal sign. Keep the
 * coordinate declaration at the lowering boundary, but do not silently
 * change the author's geometry.
 */

export type MotionPathCoordinateSpace = 'slide' | 'powerpoint'

export const DEFAULT_MOTION_PATH_COORDINATE_SPACE: MotionPathCoordinateSpace = 'slide'

/**
 * Convert an authored path to the exact path representation required by the
 * native PowerPoint animation carrier.
 *
 * `powerpoint` is an explicit escape hatch for callers that already provide
 * native XML-path coordinates. Both supported spaces preserve geometry; the
 * field documents who owns the coordinate convention and is not a direction
 * inference mechanism.
 */
export function lowerMotionPathToPowerPoint(
	pathData: string | undefined | null,
	coordinateSpace: MotionPathCoordinateSpace = DEFAULT_MOTION_PATH_COORDINATE_SPACE,
): string {
	const authoredPath = String(pathData || 'M 0 0 L 0.25 0 Z').trim()
	if (coordinateSpace === 'powerpoint') return authoredPath
	if (coordinateSpace !== 'slide') throw new Error(`Unsupported motion-path coordinate space: ${String(coordinateSpace)}`)

	// The native carrier uses the author's path grammar, including PowerPoint's
	// terminal E command. SVG canonicalization drops E and changes the authored
	// value even though this route requires no coordinate transform. XML entity
	// encoding is performed by the serializer at the attribute boundary.
	return authoredPath
}
