/**
 * PptxGenJS: Structural Animation Wrapper
 * 
 * This module provides a parallel entry point for structural animation generation.
 * It uses the existing animation builders but wraps them with the new structural
 * click group assembly logic.
 * 
 * Usage:
 * - Import generateSlideTimingStructuralWrapper
 * - Call it with a slide to get properly structured timing XML
 * - Compare output with existing regex-based generation
 * 
 * @module gen-animations-structural-wrapper
 * @since v4.0.0
 */

import { PresSlide, AnimationProps, ISlideObject } from './core-interfaces'
import { buildAnimation } from './gen-animations-builder'
import { buildSequenceAnimation } from './animations-builders/buildSequenceAnimation'
import { resetAnimationId } from './gen-animations-ids'
import {
	ResolvedAnimation,
	ClickGroup,
	ClickGroupEntry,
	AnimationNodeType,
	assembleClickGroups
} from './gen-animations-structural'
import { ANIMATION_REGISTRY_MERGED } from './gen-animations-registry-merged'
import { generateMediaTimingAdditions } from './gen-animations-media'
import {
	buildAnimationWithIterate,
	shouldUseIteratePath,
	ENABLE_ITERATE_ENGINE
} from './gen-animations-engine-iterate'
import { isModel3DAnimationEffect } from './animations-builders/data3DAnimationTemplates'
// XML DOM utils removed - caused corruption
// Using template literal approach instead

const MEDIA_COMMAND_EFFECTS = new Set(['play', 'pause', 'togglepause', 'stop'])

function isBuildListNeutralAnimation(animationType: string, effect: string): boolean {
	return animationType === 'media'
		|| effect.startsWith('media')
		|| MEDIA_COMMAND_EFFECTS.has(effect)
		|| isModel3DAnimationEffect(effect)
}

// ============================================================================
// STRUCTURAL TIMING GENERATION
// ============================================================================

/**
 * Generate complete timing XML for a slide using the structural approach.
 * 
 * This is the main entry point for structural animation generation.
 * It:
 * 1. Resets animation IDs for clean generation
 * 2. Generates effect XML for each animation using existing builders
 * 3. Assembles click groups based on triggers
 * 4. Generates properly nested timing XML
 * 
 * @param slide - The slide to generate timing for
 * @returns Complete timing XML string, or empty string if no animations
 */
export function generateSlideTimingStructuralWrapper(slide: PresSlide): string {
	const animations = slide._animations
	if (!animations || animations.length === 0) {
		return ''
	}

	// Reset animation IDs for clean generation
	resetAnimationId()

	// Step 1: Generate effect XML for each animation using existing builders
	// For byParagraph mode, we need to expand into multiple ResolvedAnimations (one per click)
	const resolvedAnimations: ResolvedAnimation[] = []

	// Track grpId per shape - each animation on same shape gets incrementing grpId
	const shapeGrpIdTracker: Map<number, number> = new Map()

	// Determine if we need grpId - needed when:
	// 1. sequence mode (allAtOnce/byParagraph) is used, OR
	// 2. any shape has MULTIPLE animations (e.g., entrance + exit on same shape)
	// Track animation counts per shape
	const animCountPerShape: Map<number, number> = new Map()
	for (const anim of animations) {
		const animationType = anim.animation?.type || 'entrance'
		const effect = anim.animation?.effect?.toLowerCase() || ''
		if (isBuildListNeutralAnimation(animationType, effect)) continue
		const count = animCountPerShape.get(anim.shapeId) || 0
		animCountPerShape.set(anim.shapeId, count + 1)
	}

	const hasMultipleAnimsOnSameShape = Array.from(animCountPerShape.values()).some(count => count > 1)

	const hasSequenceMode = animations.some(anim => {
		const sequence = anim.animation?.sequence || 'asOneObject'
		const animationType = anim.animation?.type || 'entrance'
		const effect = anim.animation?.effect?.toLowerCase() || ''
		if (isBuildListNeutralAnimation(animationType, effect)) return false
		return sequence === 'allAtOnce' || sequence === 'byParagraph'
	})

	// Also check for non-onClick triggers (afterPrevious/withPrevious)
	const hasNonClickTriggerForGrpId = animations.some(anim => {
		const trigger = anim.animation?.trigger || 'onClick'
		const animationType = anim.animation?.type || 'entrance'
		const effect = anim.animation?.effect?.toLowerCase() || ''
		if (isBuildListNeutralAnimation(animationType, effect)) return false
		return trigger === 'afterPrevious' || trigger === 'withPrevious'
	})

	const needsGrpId = hasSequenceMode || hasMultipleAnimsOnSameShape || hasNonClickTriggerForGrpId

	for (const anim of animations) {
		const sequence = anim.animation.sequence || 'asOneObject'
		const paragraphCount = anim.paragraphCount || 1
		const animationType = anim.animation?.type || 'entrance'
		const effect = anim.animation?.effect?.toLowerCase() || ''
		const buildListNeutral = isBuildListNeutralAnimation(animationType, effect)

		// Get and increment grpId for this shape
		const currentGrpId = buildListNeutral ? 0 : (shapeGrpIdTracker.get(anim.shapeId) || 0)
		if (!buildListNeutral) shapeGrpIdTracker.set(anim.shapeId, currentGrpId + 1)

		// Add grpId to animation options so builders can use it
		const animWithGrpId = { ...anim.animation, grpId: currentGrpId }

		if (sequence === 'asOneObject') {
			// Simple case: single animation for the whole shape
			let effectXml = buildAnimation(
				anim.shapeId,
				animWithGrpId,
				undefined // Target handled by builder based on animation props
			)

			// Handle grpId in the generated XML
			// Only include grpId when bldLst/sequence mode is needed
			if (needsGrpId) {
				effectXml = effectXml.replace(/grpId="0"/g, `grpId="${currentGrpId}"`)
			} else {
				// Remove grpId entirely when no bldLst is needed
				effectXml = effectXml.replace(/ grpId="\d+"/g, '')
			}

			resolvedAnimations.push({
				shapeId: anim.shapeId,
				target: anim.target,
				animation: anim.animation,
				paragraphCount: paragraphCount,
				duration: anim.animation.duration || 500,
				delay: anim.animation.delay || 0,
				effectXml: effectXml
			})
		} else if (sequence === 'allAtOnce') {
			// ================================================================
			// ITERATE PATH CHECK (PowerPoint-native - EXPERIMENTAL)
			// ================================================================
			// If iterate engine is enabled, use PowerPoint-native iterate
			// NOTE: Currently disabled by default - kept for future work
			if (ENABLE_ITERATE_ENGINE && shouldUseIteratePath(anim.animation)) {
				// Use PowerPoint-native iterate approach (1 animation + <p:iterate>)
				const iterateXml = buildAnimationWithIterate(anim.shapeId, animWithGrpId, needsGrpId ? false : true)

				// Create single ResolvedAnimation with iterate
				resolvedAnimations.push({
					shapeId: anim.shapeId,
					target: anim.target,
					animation: anim.animation,
					paragraphCount: 1,
					duration: anim.animation.duration || 500,
					delay: anim.animation.delay || 0,
					effectXml: iterateXml.join('\n')
				})
				continue // Skip the legacy path below
			}

			// allAtOnce: All paragraphs animate together
			// Build sub-animation XML groups: [[bg], [p0], [p1], ...]
			const effectXmlGroups = buildSequenceAnimation(
				anim.shapeId,
				animWithGrpId,
				paragraphCount,
				'allAtOnce'
			) as string[][]

			const originalTrigger = anim.animation.trigger || 'onClick'

			// Apply grpId to all groups
			const processedXmls: string[] = []
			for (const group of effectXmlGroups) {
				let groupXml = Array.isArray(group) ? group.join('\n') : group
				if (needsGrpId) {
					groupXml = groupXml.replace(/grpId="0"/g, `grpId="${currentGrpId}"`)
				} else {
					groupXml = groupXml.replace(/ grpId="\d+"/g, '')
				}
				processedXmls.push(groupXml)
			}

			if (originalTrigger === 'afterPrevious') {
				// allAtOnce + afterPrevious: Threshold-based trigger pattern (same as byParagraph!)
				// - 1-2 paragraphs: ALL use afterPrevious (staggered delays)
				// - 3+ paragraphs: bg uses afterPrevious, paras use withPrevious (all play together)
				if (paragraphCount <= 2) {
					// 1-2 paragraphs: ALL get staggered delays (each uses afterPrevious)
					for (let i = 0; i < processedXmls.length; i++) {
						resolvedAnimations.push({
							shapeId: anim.shapeId,
							target: anim.target,
							animation: { ...anim.animation, trigger: 'afterPrevious' as any },
							paragraphCount: 1,
							duration: anim.animation.duration || 500,
							delay: anim.animation.delay || 0,
							effectXml: processedXmls[i]
						})
					}
				} else {
					// 3+ paragraphs: bg uses afterPrevious, paras use withPrevious (play together)
					for (let i = 0; i < processedXmls.length; i++) {
						const trigger = (i === 0) ? 'afterPrevious' : 'withPrevious'
						resolvedAnimations.push({
							shapeId: anim.shapeId,
							target: anim.target,
							animation: { ...anim.animation, trigger: trigger as any },
							paragraphCount: 1,
							duration: anim.animation.duration || 500,
							delay: anim.animation.delay || 0,
							effectXml: processedXmls[i]
						})
					}
				}
			} else if (paragraphCount <= 1 && originalTrigger === 'onClick') {
				// SPECIAL CASE: 1-paragraph allAtOnce + onClick
				// Reference shows bg and p0 in SEPARATE click groups
				// bg = own CG with clickEffect, p0 = starts new CG with clickEffect
				for (let i = 0; i < processedXmls.length; i++) {
					resolvedAnimations.push({
						shapeId: anim.shapeId,
						target: anim.target,
						animation: { ...anim.animation, trigger: 'onClick' as any },
						paragraphCount: 1,
						duration: anim.animation.duration || 500,
						delay: anim.animation.delay || 0,
						effectXml: processedXmls[i]
					})
				}
			} else {
				// 2+ paragraphs onClick / withPrevious — Create separate ResolvedAnimations
				// This preserves individual nodeTypes for each sub-animation
				// assembleClickGroups will group them correctly by trigger
				const baseTrigger = originalTrigger === 'withPrevious' ? 'withPrevious' : 'onClick'
				
				for (let i = 0; i < processedXmls.length; i++) {
					// First animation (bg) gets the original trigger
					// Rest get withPrevious to join the same delay bucket
					const trigger = (i === 0) ? baseTrigger : 'withPrevious'
					
					resolvedAnimations.push({
						shapeId: anim.shapeId,
						target: anim.target,
						animation: { ...anim.animation, trigger: trigger as any },
						paragraphCount: 1,
						duration: anim.animation.duration || 500,
						delay: anim.animation.delay || 0,
						effectXml: processedXmls[i]
					})
				}
			}
		} else if (sequence === 'byParagraph') {
			// ================================================================
			// ITERATE PATH CHECK (PowerPoint-native - EXPERIMENTAL)
			// ================================================================
			// If iterate engine is enabled, use PowerPoint-native iterate
			// NOTE: Currently disabled by default - kept for future work
			if (ENABLE_ITERATE_ENGINE && shouldUseIteratePath(anim.animation)) {
				// Use PowerPoint-native iterate approach (1 animation + <p:iterate>)
				const iterateXml = buildAnimationWithIterate(anim.shapeId, animWithGrpId, needsGrpId ? false : true)

				// Create single ResolvedAnimation with iterate
				resolvedAnimations.push({
					shapeId: anim.shapeId,
					target: anim.target,
					animation: anim.animation,
					paragraphCount: 1,
					duration: anim.animation.duration || 500,
					delay: anim.animation.delay || 0,
					effectXml: iterateXml.join('\n')
				})
				continue // Skip the legacy path below
			}

			// byParagraph: Each paragraph requires its OWN click group
			// buildSequenceAnimation returns [[base], [para0], [para1], ...]
			const effectXmlGroups = buildSequenceAnimation(
				anim.shapeId,
				animWithGrpId,
				paragraphCount,
				'byParagraph'
			) as string[][]

			// Create a separate ResolvedAnimation for each group (each becomes its own click)
			// For byParagraph: EVERY group needs its own clickEffect (including first)
			for (let i = 0; i < effectXmlGroups.length; i++) {
				const group = effectXmlGroups[i]
				let groupXml = Array.isArray(group) ? group.join('\n') : group

				// Handle grpId in the generated XML
				if (needsGrpId) {
					groupXml = groupXml.replace(/grpId="0"/g, `grpId="${currentGrpId}"`)
				} else {
					groupXml = groupXml.replace(/ grpId="\d+"/g, '')
				}

				// TRIGGER MAPPING for byParagraph sub-animations:
				// CRITICAL: For byParagraph mode, paragraph animations create SEPARATE click groups!
				// - Background (i=0): Uses API trigger (onClick/afterPrevious/withPrevious)
				// - Paragraphs (i>0): ALWAYS use onClick to create separate click groups
				// - The nodeType (set in buildSequenceAnimation.ts) is INDEPENDENT of trigger
				//   - For withPrevious: bg=withEffect, paragraphs=clickEffect (creates new CG!)
				//   - For afterPrevious: bg=afterEffect, paragraphs=afterEffect (in same CG)
				const byParaOrigTrigger = anim.animation.trigger || 'onClick'
				let byParaTrigger: 'onClick' | 'afterPrevious' | 'withPrevious'
				
				if (byParaOrigTrigger === 'onClick') {
					// onClick: ALL use onClick (creates separate CGs)
					byParaTrigger = 'onClick'
				} else if (byParaOrigTrigger === 'afterPrevious') {
					// afterPrevious: Depends on paragraph count (2-paragraph threshold)
					// - 1-2 paragraphs: ALL use afterPrevious (stay in same CG)
					// - 3+ paragraphs: bg uses afterPrevious, paras use onClick (create new CGs)
					if (paragraphCount <= 2) {
						byParaTrigger = 'afterPrevious'  // ALL in same CG
					} else {
						byParaTrigger = i === 0 ? 'afterPrevious' : 'onClick'  // bg chains, paras create new CGs
					}
				} else {
					// withPrevious: bg uses withPrevious, paragraphs use onClick (create new CGs)
					byParaTrigger = i === 0 ? 'withPrevious' : 'onClick'
				}
				
				console.log(`[WRAPPER DEBUG] SPID=${anim.shapeId} i=${i} origTrigger=${byParaOrigTrigger} -> finalTrigger=${byParaTrigger}`);
				
				const groupAnimation = { ...anim.animation, trigger: byParaTrigger as any }

				resolvedAnimations.push({
					shapeId: anim.shapeId,
					target: anim.target,
					animation: groupAnimation,
					paragraphCount: 1, // Each group is one "unit"
					duration: anim.animation.duration || 500,
					delay: anim.animation.delay || 0,
					effectXml: groupXml
				})
			}
		}
	}

	// Step 2: Assemble into click groups
	const { clickGroups } = assembleClickGroups(resolvedAnimations)

	// Step 3: Generate structural timing XML (pass original animations for bldLst generation)
	return generateStructuralTimingXmlFromGroups(clickGroups, animations, slide._slideObjects)
}

/**
 * Generate the complete timing XML from assembled click groups.
 * 
 * Structure follows ANIMATION_TIMING_TREE_SPECIFICATION.md:
 * - tmRoot (id=1) → mainSeq (id=2) → Click Groups (id=3+)
 * - Each click group has delay="indefinite" (wait for click)
 * - Animations within a click group are SIBLINGS with different delays
 * 
 * @param clickGroups - Assembled click groups
 * @param animations - Original animation data for build list generation
 * @returns Complete timing XML string
 */
function generateStructuralTimingXmlFromGroups(clickGroups: ClickGroup[], animations?: any[], slideObjects?: ISlideObject[]): string {
	if (clickGroups.length === 0) {
		return ''
	}

	let currentId = 3 // Start after tmRoot (1) and mainSeq (2)
	const clickGroupXmls: string[] = []

	for (let i = 0; i < clickGroups.length; i++) {
		const group = clickGroups[i]
		const isFirstGroup = (i === 0)
		const { xml, nextId } = generateClickGroupXmlStructural(group, currentId, isFirstGroup)
		clickGroupXmls.push(xml)
		currentId = nextId
	}

	const mainSeqContent = clickGroupXmls.join('\n')

	// Generate build list for sequence modes (allAtOnce, byParagraph)
	const buildListXml = animations ? generateBuildList(animations) : ''

	// Generate media timing additions (interactiveSeq + p:video) if slide has media
	const mediaTimingXml = generateMediaTimingAdditions(animations, slideObjects)

	return `<p:timing>
<p:tnLst>
<p:par>
<p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot">
<p:childTnLst>
<p:seq concurrent="1" nextAc="seek">
<p:cTn id="2" dur="indefinite" nodeType="mainSeq">
<p:childTnLst>
${mainSeqContent}
</p:childTnLst>
</p:cTn>
<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>
<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>
</p:seq>${mediaTimingXml}
</p:childTnLst>
</p:cTn>
</p:par>
</p:tnLst>
${buildListXml}
</p:timing>`
}

/**
 * Generate XML build list for animation sequence modes
 * 
 * This generates p:bldLst with p:bldP entries based on these rules:
 * 
 * 1. If ANY shape on the slide has allAtOnce or byParagraph sequence mode,
 *    then ALL animated shapes need bldP entries.
 * 
 * 2. If ALL shapes are asOneObject, NO bldLst is needed (Batch 4 slide 1 case).
 * 
 * 3. animBg="1" logic (verified against frozen truth decks):
 *    - Entrance/Exit/Motion Path: ALWAYS has animBg="1"
 *    - Emphasis with asOneObject: has animBg="1"
 *    - Emphasis with allAtOnce/byParagraph: has animBg="1" UNLESS effect has
 *      requiresParagraphTargeting: true (text-only effects like ChangeFont, ChangeFontColor)
 * 
 * 4. uiExpand attribute: ONLY added when explicitly set via animation.uiExpand = true
 *    (NOT automatically for byParagraph - this differs from some documentation)
 *    Verified against Batch 4 frozen reference which has NO uiExpand attributes.
 */
function generateBuildList(animations: any[]): string {
	if (!animations || animations.length === 0) return ''

	// First pass: check if ANY shape has allAtOnce/byParagraph OR multiple animations
	let hasSequenceMode = false
	const animCountPerShape: Map<number, number> = new Map()

	for (const anim of animations) {
		const sequence = anim.animation?.sequence || 'asOneObject'
		const animationType = anim.animation?.type || 'entrance'
		const effect = anim.animation?.effect?.toLowerCase() || ''

		if (isBuildListNeutralAnimation(animationType, effect)) continue

		// Count animations per shape
		const count = animCountPerShape.get(anim.shapeId) || 0
		animCountPerShape.set(anim.shapeId, count + 1)

		if (sequence === 'allAtOnce' || sequence === 'byParagraph') {
			hasSequenceMode = true
		}
	}

	const hasMultipleAnimsOnSameShape = Array.from(animCountPerShape.values()).some(count => count > 1)

	// Also check for non-onClick triggers (afterPrevious/withPrevious) - these also need bldLst
	let hasNonClickTrigger = false
	for (const anim of animations) {
		const trigger = anim.animation?.trigger || 'onClick'
		const animationType = anim.animation?.type || 'entrance'
		const effect = anim.animation?.effect?.toLowerCase() || ''
		if (isBuildListNeutralAnimation(animationType, effect)) continue
		if (trigger === 'afterPrevious' || trigger === 'withPrevious') {
			hasNonClickTrigger = true
			break
		}
	}

	// If no shape has sequence mode AND no shape has multiple animations AND no non-click triggers, no bldLst needed
	if (!hasSequenceMode && !hasMultipleAnimsOnSameShape && !hasNonClickTrigger) {
		return ''
	}

	// Second pass: build bldP entries for EACH animation (not just per shape)
	// When a shape has multiple animations, each needs its own bldP with incrementing grpId
	const bldPEntries: { shapeId: number; grpId: number; buildAttr: string; animBgAttr: string; uiExpandAttr: string }[] = []
	const shapeGrpIdCounter: Map<number, number> = new Map()

	for (const anim of animations) {
		const shapeId = anim.shapeId
		const sequence = anim.animation?.sequence || 'asOneObject'
		const animationType = anim.animation?.type || 'entrance'
		const effect = anim.animation?.effect?.toLowerCase() || ''
		const uiExpand = anim.animation?.uiExpand === true

		if (isBuildListNeutralAnimation(animationType, effect)) continue

		// Get and increment grpId for this shape
		const currentGrpId = shapeGrpIdCounter.get(shapeId) || 0
		shapeGrpIdCounter.set(shapeId, currentGrpId + 1)

		// Get effect config from registry to check requiresParagraphTargeting
		const effectConfig = (ANIMATION_REGISTRY_MERGED as any)[effect] || {}
		const isEmphasis = animationType === 'emphasis' || effectConfig.presetClass === 'emph'
		const requiresParagraphTargeting = effectConfig.requiresParagraphTargeting === true

		// ================================================================
		// ITERATE ENGINE: Special build list handling
		// ================================================================
		// When iterate engine is enabled and animation uses iterate,
		// the build list should NOT include build="p" or build="allAtOnce"
		// and should use autoUpdateAnimBg="0" instead of animBg="1"
		// This matches PowerPoint COM behavior
		const usesIterate = ENABLE_ITERATE_ENGINE && shouldUseIteratePath(anim.animation)

		// Determine build attribute based on sequence mode
		// NOTE: When using iterate, NO build attribute should be added
		let buildAttr = ''
		if (!usesIterate) {
			if (sequence === 'allAtOnce') {
				buildAttr = ' build="allAtOnce"'
			} else if (sequence === 'byParagraph') {
				buildAttr = ' build="p"'
			}
		}
		// asOneObject or iterate: no build attribute

		// uiExpand: only when explicitly set (NOT automatic for byParagraph)
		const uiExpandAttr = uiExpand ? ' uiExpand="1"' : ''

		// animBg/autoUpdateAnimBg logic:
		// - With iterate: use autoUpdateAnimBg="0" (PowerPoint COM pattern)
		// - Without iterate: use animBg="1" (legacy pattern)
		let animBgAttr = ''
		if (usesIterate) {
			animBgAttr = ' autoUpdateAnimBg="0"'
		} else {
			// Legacy animBg="1" logic:
			// - Entrance/Exit/Motion Path: ALWAYS has animBg="1"
			// - Emphasis with asOneObject: has animBg="1"
			// - Emphasis with allAtOnce/byParagraph: has animBg="1" UNLESS requiresParagraphTargeting
			let includeAnimBg = true
			if (isEmphasis) {
				if (sequence === 'asOneObject') {
					includeAnimBg = true
				} else {
					// allAtOnce or byParagraph: include animBg unless text-only effect
					includeAnimBg = !requiresParagraphTargeting
				}
			}
			animBgAttr = includeAnimBg ? ' animBg="1"' : ''
		}

		bldPEntries.push({ shapeId, grpId: currentGrpId, buildAttr, animBgAttr, uiExpandAttr })
	}

	if (bldPEntries.length === 0) return ''

	// Sort by shapeId then grpId and build XML
	bldPEntries.sort((a, b) => {
		if (a.shapeId !== b.shapeId) return a.shapeId - b.shapeId
		return a.grpId - b.grpId
	})

	const buildElements: string[] = []
	for (const entry of bldPEntries) {
		buildElements.push(`<p:bldP spid="${entry.shapeId}" grpId="${entry.grpId}"${entry.uiExpandAttr}${entry.buildAttr}${entry.animBgAttr}/>`)
	}

	return `<p:bldLst>
${buildElements.join('\n')}
</p:bldLst>`
}

/**
 * Generate XML for a single click group using STRUCTURAL approach.
 * 
 * CORRECT POWERPOINT STRUCTURE (from frozen references):
 * - onClick animations: ALL go inside ONE delay='0' container
 * - afterPrevious animations: Each gets its own delay='N' wrapper as SIBLING
 * - withPrevious animations: Each gets its own delay='N' wrapper as SIBLING
 * 
 * Structure:
 * ```
 * <p:par>  <!-- Click group: delay="indefinite" -->
 *   <p:cTn id="X" fill="hold">
 *     <p:stCondLst><p:cond delay="indefinite"/></p:stCondLst>
 *     <p:childTnLst>
 *       <p:par>  <!-- delay="0" container for ALL onClick -->
 *         <p:cTn id="Y" fill="hold">
 *           <p:stCondLst><p:cond delay="0"/></p:stCondLst>
 *           <p:childTnLst>
 *             <!-- All clickEffect animations here -->
 *           </p:childTnLst>
 *         </p:cTn>
 *       </p:par>
 *       <p:par>...</p:par>  <!-- afterEffect: delay="500" - SIBLING! -->
 *       <p:par>...</p:par>  <!-- withEffect: delay="500" - SIBLING! -->
 *     </p:childTnLst>
 *   </p:cTn>
 * </p:par>
 * ```
 * 
 * @param group - The click group to generate
 * @param startId - Starting cTn ID
 * @returns Object with xml string and next available ID
 */
function generateClickGroupXmlStructural(group: ClickGroup, startId: number, isFirstGroup: boolean = false): { xml: string; nextId: number } {
	const clickGroupId = startId
	let currentId = startId + 1
	const siblingWrappers: string[] = []

	// Separate animations based on their timing:
	// - Animations with 0 delay (onClick, simultaneous withPrevious) go in the delay='0' container
	// - Animations with delay > 0 (afterPrevious, delayed withPrevious) are SIBLINGS with their own delay wrappers

	// DEBUG: Investigate entries classification
	console.log(`[generateClickGroupXmlStructural] Group ${clickGroupId} has ${group.entries.length} entries`);
	group.entries.forEach((e, i) => {
		console.log(`  Entry ${i}: ID=${e.animation.shapeId} Type=${e.nodeType} Delay=${e.cumulativeDelay} Duration=${e.animation.duration}`);
	});

	console.log(`  -> All entries: ${group.entries.length}`);

	// REFERENCE PATTERN (verified from frozen PPTX):
	// ALL animations in a click group go into ONE par[delay=0] container.
	// Each animation gets its OWN par wrapper inside delay=0 (no extra delay on the wrapper).
	// Timing is encoded via nodeType (withEffect/afterEffect) on each animation's own cTn.
	//
	// Structure:
	//   par[delay=indefinite] + evt=onBegin(tn val=2)
	//   └── par[delay=0]
	//       ├── par[delay=0]                ← wrapper for first (onClick) item
	//       │   └── par[nodeType=withEffect, spid=A]
	//       ├── par[delay=0]                ← wrapper for afterPrevious item
	//       │   └── par[nodeType=afterEffect, spid=B]
	//       └── par[delay=0]                ← wrapper for afterPrevious item
	//           └── par[nodeType=afterEffect, spid=C]

	// REFERENCE PATTERN (verified from frozen PPTX):
	// - onClick/withEffect entries: each gets its OWN par[delay=0] wrapper as a sibling
	// - afterEffect entries: ALL go into ONE shared par[delay=0] wrapper
	//
	// Structure:
	//   par[delay=indefinite + onBegin]
	//   ├── par[delay=0] → par[nodeType=withEffect]    ← onClick item (own wrapper)
	//   └── par[delay=0]                               ← shared wrapper for afterEffect items
	//       ├── par[nodeType=afterEffect, spid=B]
	//       └── par[nodeType=afterEffect, spid=C]

	// REFERENCE PATTERN (verified from frozen PPTX slides 9, 10, and batch 12):
	// - Entries with cumulativeDelay=0: get delay=0 wrapper (onClick/withEffect at start)
	// - Entries with cumulativeDelay>0: each gets own delay wrapper with correct delay value
	// All are SIBLINGS inside the click group's childTnLst.
	// The click group header has delay="indefinite" + evt="onBegin" when afterEffect entries present.

	const delay0Entries = group.entries.filter(e => e.cumulativeDelay === 0)
	const delayedEntries = group.entries.filter(e => e.cumulativeDelay > 0)

	// Delay=0 entries: ONE shared delay=0 wrapper containing all of them
	if (delay0Entries.length > 0) {
		const delay0Id = currentId++
		const delay0Xmls: string[] = []
		for (const entry of delay0Entries) {
			let effectXml = entry.animation.effectXml
			effectXml = renumberCtnIds(effectXml, currentId, (newNextId) => { currentId = newNextId })
			delay0Xmls.push(effectXml)
		}
		siblingWrappers.push(`<p:par>
<p:cTn id="${delay0Id}" fill="hold">
<p:stCondLst><p:cond delay="0"/></p:stCondLst>
<p:childTnLst>
${delay0Xmls.join('\n')}
</p:childTnLst>
</p:cTn>
</p:par>`)
	}

	// Delayed entries: each gets its own sibling wrapper with cumulative delay
	// Group entries at the same delay into ONE shared wrapper (withEffect siblings)
	const delayBuckets = new Map<number, ClickGroupEntry[]>()
	const delayOrder: number[] = []
	for (const entry of delayedEntries) {
		if (!delayBuckets.has(entry.cumulativeDelay)) {
			delayBuckets.set(entry.cumulativeDelay, [])
			delayOrder.push(entry.cumulativeDelay)
		}
		delayBuckets.get(entry.cumulativeDelay)!.push(entry)
	}

	for (const delay of delayOrder) {
		const bucketEntries = delayBuckets.get(delay)!
		const bucketId = currentId++
		const bucketXmls: string[] = []
		for (const entry of bucketEntries) {
			let effectXml = entry.animation.effectXml
			effectXml = renumberCtnIds(effectXml, currentId, (newNextId) => { currentId = newNextId })
			bucketXmls.push(effectXml)
		}
		siblingWrappers.push(`<p:par>
<p:cTn id="${bucketId}" fill="hold">
<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
<p:childTnLst>
${bucketXmls.join('\n')}
</p:childTnLst>
</p:cTn>
</p:par>`)
	}

	// All wrappers are SIBLINGS inside the click group's childTnLst
	const clickGroupChildContent = siblingWrappers.join('\n')

	// First auto-triggered groups with an onBegin guard use the same indefinite
	// root condition PowerPoint writes for click-triggered groups.
	const groupDelay = group.isClickTriggered || (isFirstGroup && !group.isClickTriggered) ? "indefinite" : "0"

	// Reference pattern: add onBegin condition in two cases:
	// 1. Non-click-triggered FIRST group (isFirstGroup && !isClickTriggered):
	//    - Batch 12 slide 5: first anim=afterEffect, no onClick → HAS onBegin
	// 2. Click-triggered group where first animation is NOT clickEffect:
	//    - Agency slides 9/10: first anim=withEffect (onClick) + afterEffect siblings → HAS onBegin
	// NOT added when:
	//    - Batch 12 slides 1-4: click groups where first anim=clickEffect → NO onBegin
	const firstEntryNodeType = group.entries.length > 0 ? group.entries[0].nodeType : 'clickEffect'
	const needsOnBegin =
		(isFirstGroup && !group.isClickTriggered) ||
		(group.isClickTriggered && firstEntryNodeType !== 'clickEffect')
	const stCondLst = needsOnBegin
		? `<p:stCondLst><p:cond delay="${groupDelay}"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst>`
		: `<p:stCondLst><p:cond delay="${groupDelay}"/></p:stCondLst>`

	const xml = `<p:par>
<p:cTn id="${clickGroupId}" fill="hold">
${stCondLst}
<p:childTnLst>
${clickGroupChildContent}
</p:childTnLst>
</p:cTn>
</p:par>`

	return { xml, nextId: currentId }
}

/**
 * Generate XML wrapper for a single animation entry.
 * 
 * Each animation gets its own delay wrapper that is a SIBLING of other animations
 * in the same click group. The delay determines when this animation starts
 * relative to the click.
 * 
 * Structure:
 * ```
 * <p:par>  <!-- Delay wrapper -->
 *   <p:cTn id="X" fill="hold">
 *     <p:stCondLst><p:cond delay="N"/></p:stCondLst>
 *     <p:childTnLst>
 *       <!-- Effect content from builder (already wrapped in p:par) -->
 *     </p:childTnLst>
 *   </p:cTn>
 * </p:par>
 * ```
 * 
 * @param entry - The animation entry
 * @param startId - Starting cTn ID
 * @returns Object with xml string and next available ID
 */
function generateAnimationWrapperXml(entry: ClickGroupEntry, startId: number): { xml: string; nextId: number } {
	const wrapperId = startId
	let nextId = startId + 1  // Wrapper uses one ID

	// The delay for this wrapper (from cumulative delay calculation)
	const delay = entry.cumulativeDelay

	// The effect XML from the builder already contains the animation structure
	// We need to:
	// 1. Update the nodeType to match the entry's nodeType
	// 2. Re-number all cTn IDs to ensure uniqueness
	let effectXml = entry.animation.effectXml

	// Update nodeType in the effect XML
	effectXml = updateNodeType(effectXml, entry.nodeType)

	// CRITICAL: Re-number all cTn IDs in the effect XML to ensure uniqueness
	// The builders generate IDs internally which can collide with our wrapper IDs
	// We need to replace each id="N" with sequential IDs starting from nextId
	effectXml = renumberCtnIds(effectXml, nextId, (newNextId) => {
		nextId = newNextId
	})

	// The effect XML from builders is already wrapped in <p:par>
	// We just need to wrap it in our delay container
	const xml = `<p:par>
<p:cTn id="${wrapperId}" fill="hold">
<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
<p:childTnLst>
${effectXml}
</p:childTnLst>
</p:cTn>
</p:par>`

	return { xml, nextId }
}

/**
 * Re-number all cTn id attributes in the XML to ensure uniqueness.
 * 
 * CRITICAL: Animation builders generate IDs internally using getAnimationId(),
 * but these IDs are independent of the structural wrapper's ID counter.
 * This causes duplicate IDs when multiple animations are assembled.
 * 
 * This function replaces each p:cTn id="N" with sequential IDs starting from startId.
 * 
 * @param xml - The XML string containing p:cTn elements
 * @param startId - The starting ID to use
 * @param updateNextId - Callback to update the next available ID
 * @returns The XML with re-numbered IDs
 */
function renumberCtnIds(xml: string, startId: number, updateNextId: (nextId: number) => void): string {
	let currentId = startId

	// Replace each p:cTn id="N" with sequential IDs
	// Pattern: <p:cTn id="NUMBER" (captures the rest of the attributes)
	const result = xml.replace(/<p:cTn id="\d+"/g, () => {
		const replacement = `<p:cTn id="${currentId}"`
		currentId++
		return replacement
	})

	updateNextId(currentId)
	return result
}

/**
 * Add nodeType attributes to animation XML.
 * 
 * ARCHITECTURAL PRINCIPLE: Builders generate neutral XML without nodeType.
 * The structural wrapper adds nodeType based on context (trigger, position, etc.)
 * This makes the library future-proof and flexible.
 * 
 * CRITICAL: nodeType should ONLY be added to OUTER <p:par> wrapper <p:cTn> elements,
 * NOT to inner behavioral <p:cTn> elements (like those in <p:cBhvr>).
 * 
 * CRITICAL: nodeType must be added at the END of attributes (after fill="hold" grpId="0"),
 * NOT at the beginning! PowerPoint requires specific attribute order:
 * id, presetID, presetClass, presetSubtype, fill, grpId, nodeType
 * 
 * @param effectXml - The effect XML from builder (without nodeType)
 * @param primaryNodeType - The nodeType based on trigger
 * @returns XML with nodeType attributes added to outer wrappers only
 */
function addNodeTypeToXml(effectXml: string, primaryNodeType: AnimationNodeType): string {
	// Count how many OUTER <p:cTn elements we have (those immediately after <p:par>)
	const outerCTnMatches = effectXml.match(/<p:par>\s*<p:cTn[^>]*grpId="0">/g) || []
	const outerBlockCount = outerCTnMatches.length

	if (outerBlockCount === 0) {
		// No outer <p:cTn with grpId="0" found - shouldn't happen, but return unchanged
		console.warn('[addNodeTypeToXml] No outer <p:cTn> with grpId="0" found in XML')
		return effectXml
	}

	// Replace ONLY the outer <p:cTn> elements that have grpId="0"
	// Add nodeType AFTER grpId="0" to maintain proper attribute order
	let replacementCount = 0
	return effectXml.replace(/(<p:par>\s*<p:cTn[^>]*grpId="0")>/g, (match, beforeClosing) => {
		replacementCount++
		if (outerBlockCount === 1 || replacementCount === 1) {
			// First block (or only block): use primary nodeType
			return `${beforeClosing} nodeType="${primaryNodeType}">`
		} else {
			// Subsequent blocks in allAtOnce: use withEffect
			return `${beforeClosing} nodeType="withEffect">`
		}
	})
}

/**
 * DEPRECATED: Use addNodeTypeToXml instead.
 * This function assumed nodeType already existed and replaced it.
 * Now builders don't include nodeType, so we ADD it instead.
 */
function updateNodeType(effectXml: string, nodeType: AnimationNodeType): string {
	// This is only used in generateAnimationWrapperXml for the unused afterEntries path
	// Since afterEntries is always empty now, this is dead code
	return effectXml.replace(
		/nodeType="(clickEffect|afterEffect|withEffect)"/g,
		`nodeType="${nodeType}"`
	)
}

// Function is already exported at definition
