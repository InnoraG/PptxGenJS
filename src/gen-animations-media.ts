/**
 * PptxGenJS: Media Animation Support (interactiveSeq)
 * 
 * This module handles media-specific animation structures:
 * - interactiveSeq: Click-on-media triggers (e.g., click video to pause)
 * - <p:video>: Media node definition in timing XML
 * 
 * ISOLATION PRINCIPLE:
 * This module is ONLY invoked when a slide has media animations.
 * Non-media slides (Batches 1-6) are completely unaffected.
 * 
 * Reference: Focused_Media_Showcase_BATCH7_MANUALLYFROZEN.pptx
 */

import { getNextAnimationId } from './gen-animations-ids'
import { ISlideObject } from './core-interfaces'

/**
 * Animation data interface for media detection
 */
interface AnimationData {
	shapeId: number
	animation: {
		type?: string
		effect?: string
		trigger?: string
	}
}

/**
 * Check if a slide has any media animations
 * Media animations have type='media' or effect starting with 'media'
 * Also returns true for any animation targeting a video/audio object
 */
export function hasMediaAnimations(animations: AnimationData[], slideObjects?: ISlideObject[]): boolean {
	if (!animations || animations.length === 0) return false

	// Check for direct media animations
	const hasDirectMedia = animations.some(anim => {
		const type = anim.animation?.type?.toLowerCase() || ''
		const effect = anim.animation?.effect?.toLowerCase() || ''
		return type === 'media' || effect.startsWith('media')
	})

	if (hasDirectMedia) return true

	// Check for any animation on media objects
	if (slideObjects) {
		return animations.some(anim => {
			const targetIdx = anim.shapeId - 2 // SPID to array index
			const targetObj = slideObjects[targetIdx]
			return targetObj && targetObj._type === 'media'
		})
	}

	return false
}

/**
 * Get all media shape IDs from animations
 * Returns unique SPIDs that have media animations
 */
export function getMediaShapeIds(animations: AnimationData[], slideObjects?: ISlideObject[]): number[] {
	if (!animations || animations.length === 0) return []

	const mediaShapeIds = new Set<number>()

	for (const anim of animations) {
		const type = anim.animation?.type?.toLowerCase() || ''
		const effect = anim.animation?.effect?.toLowerCase() || ''

		// Direct media animations (type='media' or effect starts with 'media')
		if (type === 'media' || effect.startsWith('media')) {
			mediaShapeIds.add(anim.shapeId)
		}
		// Any animation targeting a video/audio slide object
		else if (slideObjects) {
			const targetIdx = anim.shapeId - 2 // SPID to array index conversion
			const targetObj = slideObjects[targetIdx]
			if (targetObj && targetObj._type === 'media') {
				mediaShapeIds.add(anim.shapeId)
			}
		}
	}

	return Array.from(mediaShapeIds)
}

/**
 * Generate interactiveSeq XML for media click triggers
 * 
 * This creates a separate <p:seq> with nodeType="interactiveSeq" that:
 * - Triggers when user clicks on the media element
 * - Contains togglePause command for play/pause toggle
 * 
 * Structure from frozen reference:
 * <p:seq concurrent="1" nextAc="seek">
 *   <p:cTn id="X" restart="whenNotActive" fill="hold" evtFilter="cancelBubble" nodeType="interactiveSeq">
 *     <p:stCondLst>
 *       <p:cond evt="onClick" delay="0">
 *         <p:tgtEl><p:spTgt spid="MEDIA_SPID"/></p:tgtEl>
 *       </p:cond>
 *     </p:stCondLst>
 *     <p:endSync evt="end" delay="0"><p:rtn val="all"/></p:endSync>
 *     <p:childTnLst>
 *       ... togglePause command ...
 *     </p:childTnLst>
 *   </p:cTn>
 *   <p:nextCondLst>
 *     <p:cond evt="onClick" delay="0">
 *       <p:tgtEl><p:spTgt spid="MEDIA_SPID"/></p:tgtEl>
 *     </p:cond>
 *   </p:nextCondLst>
 * </p:seq>
 */
export function generateInteractiveSeq(mediaSpid: number): string {
	const seqCtnId = getNextAnimationId()
	const parCtnId1 = getNextAnimationId()
	const parCtnId2 = getNextAnimationId()
	const cmdCtnId = getNextAnimationId()
	const cmdBhvrId = getNextAnimationId()

	return `
							<p:seq concurrent="1" nextAc="seek">
								<p:cTn id="${seqCtnId}" restart="whenNotActive" fill="hold" evtFilter="cancelBubble" nodeType="interactiveSeq">
									<p:stCondLst>
										<p:cond evt="onClick" delay="0">
											<p:tgtEl>
												<p:spTgt spid="${mediaSpid}"/>
											</p:tgtEl>
										</p:cond>
									</p:stCondLst>
									<p:endSync evt="end" delay="0">
										<p:rtn val="all"/>
									</p:endSync>
									<p:childTnLst>
										<p:par>
											<p:cTn id="${parCtnId1}" fill="hold">
												<p:stCondLst>
													<p:cond delay="0"/>
												</p:stCondLst>
												<p:childTnLst>
													<p:par>
														<p:cTn id="${parCtnId2}" fill="hold">
															<p:stCondLst>
																<p:cond delay="0"/>
															</p:stCondLst>
															<p:childTnLst>
																<p:par>
																	<p:cTn id="${cmdCtnId}" presetID="2" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="clickEffect">
																		<p:stCondLst>
																			<p:cond delay="0"/>
																		</p:stCondLst>
																		<p:childTnLst>
																			<p:cmd type="call" cmd="togglePause">
																				<p:cBhvr>
																					<p:cTn id="${cmdBhvrId}" dur="1" fill="hold"/>
																					<p:tgtEl>
																						<p:spTgt spid="${mediaSpid}"/>
																					</p:tgtEl>
																				</p:cBhvr>
																			</p:cmd>
																		</p:childTnLst>
																	</p:cTn>
																</p:par>
															</p:childTnLst>
														</p:cTn>
													</p:par>
												</p:childTnLst>
											</p:cTn>
										</p:par>
									</p:childTnLst>
								</p:cTn>
								<p:nextCondLst>
									<p:cond evt="onClick" delay="0">
										<p:tgtEl>
											<p:spTgt spid="${mediaSpid}"/>
										</p:tgtEl>
									</p:cond>
								</p:nextCondLst>
							</p:seq>`
}

/**
 * Generate <p:video> element for media timing
 * 
 * This creates the media node definition that PowerPoint needs:
 * <p:video>
 *   <p:cMediaNode vol="80000">
 *     <p:cTn id="X" [fill="hold"] display="0">
 *       <p:stCondLst><p:cond delay="indefinite"/></p:stCondLst>
 *     </p:cTn>
 *     <p:tgtEl><p:spTgt spid="MEDIA_SPID"/></p:tgtEl>
 *   </p:cMediaNode>
 * </p:video>
 * 
 * @param mediaSpid - The shape ID of the media object
 * @param volume - Volume level (default 80000 = 80%)
 * @param fillHold - Whether to include fill="hold" attribute (default true for first media, false for subsequent)
 */
export function generateVideoNode(mediaSpid: number, volume: number = 80000, fillHold: boolean = true): string {
	const ctnId = getNextAnimationId()
	const fillAttr = fillHold ? ' fill="hold"' : ''

	return `
							<p:video>
								<p:cMediaNode vol="${volume}">
									<p:cTn id="${ctnId}"${fillAttr} display="0">
										<p:stCondLst>
											<p:cond delay="indefinite"/>
										</p:stCondLst>
									</p:cTn>
									<p:tgtEl>
										<p:spTgt spid="${mediaSpid}"/>
									</p:tgtEl>
								</p:cMediaNode>
							</p:video>`
}

/**
 * Generate <p:audio> element for media timing.
 */
export function generateAudioNode(mediaSpid: number, volume: number = 80000, fillHold: boolean = true): string {
	const ctnId = getNextAnimationId()
	const fillAttr = fillHold ? ' fill="hold"' : ''

	return `
							<p:audio>
								<p:cMediaNode vol="${volume}">
									<p:cTn id="${ctnId}"${fillAttr} display="0">
										<p:stCondLst>
											<p:cond delay="indefinite"/>
										</p:stCondLst>
									</p:cTn>
									<p:tgtEl>
										<p:spTgt spid="${mediaSpid}"/>
									</p:tgtEl>
								</p:cMediaNode>
							</p:audio>`
}

function generateMediaNode(mediaSpid: number, slideObjects: ISlideObject[] | undefined, fillHold: boolean): string {
	const targetObj = slideObjects ? slideObjects[mediaSpid - 2] : null
	const mtype = String((targetObj as any)?.mtype || '').toLowerCase()
	const rawVolume = (targetObj as any)?.options?.mediaVolume ?? (targetObj as any)?.options?.volume
	const volume = typeof rawVolume === 'number' && Number.isFinite(rawVolume)
		? Math.max(0, Math.min(100000, Math.round(rawVolume)))
		: 80000
	return mtype === 'audio'
		? generateAudioNode(mediaSpid, volume, fillHold)
		: generateVideoNode(mediaSpid, volume, fillHold)
}

/**
 * Generate complete media timing additions for a slide
 * 
 * This generates all media-specific XML that should be appended
 * INSIDE the <p:childTnLst> of the tmRoot <p:cTn>, AFTER the mainSeq.
 * 
 * Returns empty string if no media animations present.
 * 
 * For videos with type='media' animations: generates interactiveSeq + p:video (click-to-play)
 * For videos with regular animations (entrance/exit): generates just p:video (playback control)
 */
export function generateMediaTimingAdditions(animations: AnimationData[], slideObjects?: ISlideObject[]): string {
	if (!hasMediaAnimations(animations, slideObjects)) {
		return ''
	}

	let mediaXml = ''

	// Get all media animations (type='media' or effect='media*')
	const mediaShapeIds = new Set<number>()

	for (const anim of animations) {
		const type = anim.animation?.type?.toLowerCase() || ''
		const effect = anim.animation?.effect?.toLowerCase() || ''
		if (type === 'media' || effect.startsWith('media')) {
			mediaShapeIds.add(anim.shapeId)
		}
	}

	// Track all shapes that will get p:video nodes (to avoid duplicates)
	const processedShapeIds = new Set<number>()
	let isFirstVideo = true  // Track if this is the first video node (for fill="hold" attribute)

	// Generate media timing for each media shape
	// interactiveSeq is controlled by interactivePlayback property (default: true)
	// This is INDEPENDENT of whether there are inline triggers
	for (const spid of mediaShapeIds) {
		if (processedShapeIds.has(spid)) continue

		// Check if this media object has interactivePlayback disabled
		const targetIdx = spid - 2
		const targetObj = slideObjects ? slideObjects[targetIdx] : null
		const interactivePlayback = (targetObj?.options as any)?.interactivePlayback !== false // default true

		if (interactivePlayback) {
			mediaXml += generateInteractiveSeq(spid)
		}
		// First video gets fill="hold", subsequent ones don't (matches frozen reference pattern)
		mediaXml += generateMediaNode(spid, slideObjects, isFirstVideo)
		processedShapeIds.add(spid)
		isFirstVideo = false
	}

	// For videos with regular animations (entrance/exit), generate just p:video
	// But only if they're NOT already handled above
	if (slideObjects) {
		for (const anim of animations) {
			if (processedShapeIds.has(anim.shapeId)) continue

			const targetIdx = anim.shapeId - 2
			const targetObj = slideObjects[targetIdx]
			if (targetObj && targetObj._type === 'media') {
				// First video gets fill="hold", subsequent ones don't
				mediaXml += generateMediaNode(anim.shapeId, slideObjects, isFirstVideo)
				processedShapeIds.add(anim.shapeId)
				isFirstVideo = false
			}
		}
	}

	return mediaXml
}
