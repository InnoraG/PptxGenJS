/**
 * PptxGenJS: Structural Animation Click Group Assembly
 * 
 * This module implements a clean, specification-compliant approach to building
 * PowerPoint animation timing trees. It replaces the regex-based post-processing
 * approach with proper structural assembly.
 * 
 * Based on: ANIMATION_TIMING_TREE_SPECIFICATION.md
 * Reference: ECMA-376 Part 1 Section 19.5, ISO/IEC 29500-1:2016
 * 
 * @module gen-animations-structural
 * @since v4.0.0
 */

import { AnimationProps, ISlideObject, PresSlide } from './core-interfaces'
import { ANIMATION_REGISTRY_MERGED } from './gen-animations-registry-merged'

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract nodeType from animation XML.
 * The builder has already embedded the correct nodeType in the XML.
 * This function extracts it to use as the single source of truth.
 * 
 * @param effectXml - The XML string from the builder
 * @returns The nodeType found in the XML, or 'clickEffect' as fallback
 */
function extractNodeTypeFromXml(effectXml: string): AnimationNodeType {
	// Match the first <p:cTn> element with nodeType attribute
	// Pattern: <p:cTn ... nodeType="clickEffect|withEffect|afterEffect" ...>
	const match = effectXml.match(/nodeType="(clickEffect|withEffect|afterEffect)"/)

	if (match && match[1]) {
		return match[1] as AnimationNodeType
	}

	// Fallback: if no nodeType found, default to clickEffect
	// This shouldn't happen with modern builders but provides safety
	return 'clickEffect'
}

/**
 * CENTRALIZED TIMING CONTAINER WRAPPER
 * 
 * Wraps animation XML in timing containers (delay groups, click groups).
 * Builders provide animation XML with <p:par> wrapper already included.
 * This function adds ONLY the timing structure around those animations.
 * 
 * ARCHITECTURE:
 * - Builders own: Animation structure (<p:par><p:cTn nodeType="X"><animEffect>...</animEffect></p:cTn></p:par>)
 * - This function owns: Timing hierarchy (delay groups, click groups, sequence containers)
 * - Clear separation of concerns: animation content vs timing structure
 * 
 * @param animationXmls - Array of animation XML strings (already wrapped by builders)
 * @param containerType - Type of timing container to create
 * @param delay - Delay value for the container
 * @param containerId - Unique ID for the container's <p:cTn>
 * @returns Complete timing container XML with animations as children
 */
function wrapInTimingContainer(
	animationXmls: string[],
	containerType: 'delayGroup' | 'clickGroup',
	delay: number | 'indefinite',
	containerId: number
): string {
	const childContent = animationXmls.join('\n')

	if (containerType === 'delayGroup') {
		// Delay group: Container for animations with same delay
		// Multiple animations are siblings in childTnLst
		return `<p:par>
<p:cTn id="${containerId}" fill="hold">
<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
<p:childTnLst>
${childContent}
</p:childTnLst>
</p:cTn>
</p:par>`
	} else if (containerType === 'clickGroup') {
		// Click group: Top-level container for click-triggered or sequential animations
		// Contains delay groups as children
		return `<p:par>
<p:cTn id="${containerId}" fill="hold">
<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
<p:childTnLst>
${childContent}
</p:childTnLst>
</p:cTn>
</p:par>`
	}

	// Should never reach here
	throw new Error(`Unknown container type: ${containerType}`)
}

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Trigger types that determine how an animation starts
 */
export type AnimationTrigger = 'onClick' | 'withPrevious' | 'afterPrevious'

/**
 * Node type in the animation pane (determines how animation appears in PPT UI)
 */
export type AnimationNodeType = 'clickEffect' | 'withEffect' | 'afterEffect'

/**
 * Represents a single animation with its resolved properties
 */
export interface ResolvedAnimation {
	/** Shape ID (spid) being animated */
	shapeId: number
	/** The target shape object */
	target: ISlideObject
	/** Original animation properties */
	animation: AnimationProps
	/** Number of paragraphs in the shape (for text animations) */
	paragraphCount: number
	/** The XML content for the animation effect (from builders) */
	effectXml: string
	/** Duration in milliseconds */
	duration: number
	/** Delay before this animation starts (relative to its trigger) */
	delay: number
}

/**
 * Represents a single animation entry within a click group
 * Animations are either the click trigger or follow-ups (with/after)
 */
export interface ClickGroupEntry {
	/** The resolved animation */
	animation: ResolvedAnimation
	/** How this animation relates to previous animations */
	nodeType: AnimationNodeType
	/** Cumulative delay from click (in ms) - determines wrapper delay */
	cumulativeDelay: number
}

/**
 * Represents a click group - all animations triggered by a single user click
 * This maps to a single <p:par> with delay="indefinite" in the mainSeq
 */
export interface ClickGroup {
	/** Unique ID for this click group */
	groupId: number
	/** All animations in this click group */
	entries: ClickGroupEntry[]
	/** Whether this group is triggered by a user click (indefinite delay) */
	isClickTriggered: boolean
}

/**
 * Result of click group assembly
 */
export interface ClickGroupAssemblyResult {
	/** Assembled click groups */
	clickGroups: ClickGroup[]
	/** Starting ID for cTn nodes */
	startingId: number
	/** Total count of animations */
	animationCount: number
}

// ============================================================================
// CLICK GROUP ASSEMBLY
// ============================================================================

/**
 * Assemble animations into click groups based on their triggers.
 * 
 * Rules:
 * - 'onClick' starts a new click group
 * - 'withPrevious' joins the current click group (plays simultaneously)
 * - 'afterPrevious' joins the current click group (plays after previous completes)
 * - If no explicit trigger, defaults to 'onClick' for first animation, 'afterPrevious' for others
 * 
 * @param animations - Array of resolved animations in order
 * @returns ClickGroupAssemblyResult with organized click groups
 */
export function assembleClickGroups(animations: ResolvedAnimation[]): ClickGroupAssemblyResult {
	const clickGroups: ClickGroup[] = []
	let currentGroup: ClickGroup | null = null
	let groupIdCounter = 1
	let cumulativeDelay = 0

	for (let i = 0; i < animations.length; i++) {
		const anim = animations[i]
		const explicitTrigger = anim.animation.trigger
		let trigger: AnimationTrigger

		if (explicitTrigger) {
			trigger = explicitTrigger as AnimationTrigger
		} else {
			const hasTextAnimation = anim.paragraphCount > 1 ||
				(anim.animation.sequence && anim.animation.sequence !== 'asOneObject')
			trigger = (i === 0 || hasTextAnimation) ? 'onClick' : 'afterPrevious'
		}

		// ================================================================
		// NODETYPE DETERMINATION - Based on Sequence + Trigger Truth Table
		// ================================================================
		// Reference: SEQUENCE_TRIGGER_TRUTH_TABLE_DEFINITIVE.md v3
		// 
		// Key rules:
		// - asOneObject: nodeType matches trigger (1 animation)
		// - allAtOnce: first matches trigger, rest are withEffect (N+1 animations)
		// - byParagraph: ALL match trigger type (N+1 animations, uniform nodeType)
		//
		// CRITICAL: byParagraph + withPrevious = ALL withEffect (not split)

		const sequence = anim.animation.sequence || 'asOneObject'
		const effectConfig = ANIMATION_REGISTRY_MERGED[anim.animation.effect || 'appear']

		// Determine nodeType based on sequence + trigger (truth table)
		let nodeTypeMapping: { onClick: AnimationNodeType; withPrevious: AnimationNodeType; afterPrevious: AnimationNodeType }

		if (sequence === 'byParagraph') {
			// byParagraph: ALL animations use the SAME nodeType matching trigger
			// This is uniform - no mixed patterns
			nodeTypeMapping = {
				onClick: 'clickEffect',
				withPrevious: 'withEffect',     // CRITICAL: All withEffect, not mixed
				afterPrevious: 'afterEffect'
			}
		} else if (sequence === 'allAtOnce') {
			// allAtOnce: First matches trigger, rest are withEffect
			// (This will be handled below - for now use standard mapping)
			nodeTypeMapping = {
				onClick: 'clickEffect',
				withPrevious: 'withEffect',
				afterPrevious: 'afterEffect'
			}
		} else {
			// asOneObject or default: Use effect's nodeTypeMapping or standard
			const effectMapping = effectConfig?.nodeTypeMapping
			nodeTypeMapping = {
				onClick: (effectMapping?.onClick || 'clickEffect') as AnimationNodeType,
				withPrevious: (effectMapping?.withPrevious || 'withEffect') as AnimationNodeType,
				afterPrevious: (effectMapping?.afterPrevious || 'afterEffect') as AnimationNodeType
			}
		}

		// ================================================================
		// EXTRACT NODETYPE FROM XML (Single Source of Truth)
		// ================================================================
		// The builder has already embedded the correct nodeType in the XML.
		// Extract it instead of using nodeTypeMapping which doesn't handle
		// complex cases like byParagraph+withPrevious (mixed nodeTypes).
		const extractedNodeType = extractNodeTypeFromXml(anim.effectXml)

		console.log(`[assembleClickGroups] Anm ${i}: Spid=${anim.shapeId} Trigger=${trigger} Delay=${anim.delay} Duration=${anim.duration} Grp=${currentGroup?.groupId} ExtractedNodeType=${extractedNodeType}`);

		// ================================================================
		// Per SEQUENCE_TRIGGER_CLICK_GROUP_DEFINITIVE.md Rule 6:
		// - onClick → NEW CG
		// - afterPrevious → join current CG (new DG with staggered delay)
		// - withPrevious → join current CG (same DG)
		// - First animation → NEW CG
		// No special byParagraph logic needed: the wrapper already sets
		// bg=API trigger and paragraphs=onClick, so normal routing works.

		if (trigger === 'onClick' || currentGroup === null) {
			console.log(`  -> Creating NEW group (onClick or first animation)`);
			const isClickTriggered = (trigger === 'onClick' || (currentGroup === null && trigger !== 'afterPrevious'))

			currentGroup = {
				groupId: groupIdCounter++,
				entries: [],
				isClickTriggered: isClickTriggered
			}
			clickGroups.push(currentGroup)

			// If starting a click-triggered group, reset cumulative delay
			// If starting an auto-triggered group, the previous cumulative delay becomes the baseline
			if (isClickTriggered) {
				cumulativeDelay = 0
				console.log(`  -> New Click Group ${currentGroup.groupId}. Reset Cumulative=0`);
			} else {
				console.log(`  -> New Auto Group ${currentGroup.groupId}. Baseline Cumulative=${cumulativeDelay}`);
			}

			// Add the entry
			const nodeType = trigger === 'onClick' ? (nodeTypeMapping.onClick || 'clickEffect')
				: (nodeTypeMapping.afterPrevious || 'afterEffect')

			currentGroup.entries.push({
				animation: anim,
				nodeType: extractedNodeType, // Use extracted nodeType from XML
				cumulativeDelay: isClickTriggered ? 0 : cumulativeDelay
			})

			// Update cumulative delay for next item
			if (isClickTriggered) {
				cumulativeDelay = (anim.delay || 0) + anim.duration
			} else {
				cumulativeDelay = cumulativeDelay + (anim.delay || 0) + anim.duration
			}
		} else if (trigger === 'afterPrevious') {
			// afterPrevious: Plays AFTER the previous animation completes
			// Uses the cumulative delay from previous animations
			console.log(`  -> AfterPrevious. CumulativeDelay=${cumulativeDelay}. AnimDelay=${anim.delay || 0}`);

			currentGroup!.entries.push({
				animation: anim,
				nodeType: extractedNodeType, // Use extracted nodeType from XML
				cumulativeDelay: cumulativeDelay
			})

			// Update cumulative delay for next animation
			cumulativeDelay = cumulativeDelay + (anim.delay || 0) + anim.duration
		} else if (trigger === 'withPrevious') {
			// EDGE CASE: withPrevious as first animation with no existing group
			// This should not happen in normal usage, but handle it gracefully
			if (currentGroup === null) {
				console.log(`  -> WARNING: withPrevious as first animation (no previous group). Creating onClick group instead.`);
				currentGroup = {
					groupId: groupIdCounter++,
					entries: [],
					isClickTriggered: true
				}
				clickGroups.push(currentGroup)
				cumulativeDelay = 0

				currentGroup.entries.push({
					animation: anim,
					nodeType: extractedNodeType, // Use extracted nodeType from XML
					cumulativeDelay: 0
				})

				cumulativeDelay = (anim.delay || 0) + anim.duration
			} else {
				// Normal withPrevious handling: Play simultaneously with previous
				// Use SAME cumulative delay (bucket) as previous
				const prevEntry = currentGroup.entries[currentGroup.entries.length - 1]
				const bucketDelay = prevEntry ? prevEntry.cumulativeDelay : 0

				console.log(`  -> WithPrevious. BucketDelay=${bucketDelay}. AnimDelay=${anim.delay || 0}`);

				currentGroup.entries.push({
					animation: anim,
					nodeType: extractedNodeType, // Use extracted nodeType from XML
					cumulativeDelay: bucketDelay
				})

				// Track when this animation ENDS for afterPrevious calculations
				const thisEnd = bucketDelay + (anim.delay || 0) + anim.duration
				cumulativeDelay = Math.max(cumulativeDelay, thisEnd)
			}
		}
	}

	return {
		clickGroups,
		startingId: 3, // IDs 1 and 2 are reserved for tmRoot and mainSeq
		animationCount: animations.length
	}
}

// ============================================================================
// XML GENERATION - STRUCTURAL APPROACH
// ============================================================================

/**
 * Generate the complete timing XML for a slide using structural assembly.
 * 
 * This builds the timing tree correctly from the start, without regex post-processing.
 * 
 * Structure:
 * ```
 * <p:timing>
 *   <p:tnLst>
 *     <p:par>
 *       <p:cTn id="1" nodeType="tmRoot">
 *         <p:childTnLst>
 *           <p:seq nodeType="mainSeq">
 *             <p:cTn id="2">
 *               <p:childTnLst>
 *                 <!-- Click groups as siblings here -->
 *               </p:childTnLst>
 *             </p:cTn>
 *           </p:seq>
 *         </p:childTnLst>
 *       </p:cTn>
 *     </p:par>
 *   </p:tnLst>
 * </p:timing>
 * ```
 * 
 * @param clickGroups - Assembled click groups
 * @returns Complete timing XML string
 */
export function generateStructuralTimingXml(clickGroups: ClickGroup[]): string {
	if (clickGroups.length === 0) {
		return ''
	}

	let currentId = 3 // Start after tmRoot (1) and mainSeq (2)
	const clickGroupXmls: string[] = []

	for (let i = 0; i < clickGroups.length; i++) {
		const group = clickGroups[i]
		const isFirstGroup = (i === 0)
		const { xml, nextId } = generateClickGroupXml(group, currentId, isFirstGroup)
		clickGroupXmls.push(xml)
		currentId = nextId
	}

	const mainSeqContent = clickGroupXmls.join('\n')

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
</p:seq>
</p:childTnLst>
</p:cTn>
</p:par>
</p:tnLst>
</p:timing>`
}

/**
 * Generate XML for a single click group.
 * 
 * CRITICAL: Each animation's delay wrapper is a SIBLING of others, not nested.
 * 
 * Correct structure:
 * ```
 * <p:par>  <!-- Click group wrapper: delay="indefinite" -->
 *   <p:cTn id="X" fill="hold">
 *     <p:stCondLst><p:cond delay="indefinite"/></p:stCondLst>
 *     <p:childTnLst>
 *       <p:par>  <!-- Animation 1 wrapper: delay="0" -->
 *         ...
 *       </p:par>
 *       <p:par>  <!-- Animation 2 wrapper: delay="500" - SIBLING! -->
 *         ...
 *       </p:par>
 *       <p:par>  <!-- Animation 3 wrapper: delay="1000" - SIBLING! -->
 *         ...
 *       </p:par>
 *     </p:childTnLst>
 *   </p:cTn>
 * </p:par>
 * ```
 * 
 * @param group - The click group to generate
 * @param startId - Starting cTn ID
 * @returns Object with xml string and next available ID
 */
/**
 * Generate XML for a single click group.
 * 
 * CRITICAL: Group animations with the same delay into a SINGLE <p:par> wrapper.
 * 
 * Reference Structure (Batch 12/Batch 7):
 * ```
 * <p:par> <!-- Click Group -->
 *   <p:cTn id="X" fill="hold">
 *     <p:stCondLst><p:cond delay="indefinite"/></p:stCondLst>
 *     <p:childTnLst>
 *       <!-- Group 1: Delay 0 -->
 *       <p:par>
 *         <p:cTn id="A" fill="hold">
 *           <p:stCondLst><p:cond delay="0"/></p:stCondLst>
 *           <p:childTnLst>
 *             <!-- Animation 1 -->
 *             <p:par><p:cTn ... nodeType="clickEffect">...</p:cTn></p:par>
 *             <!-- Animation 2 (simultaneous) -->
 *             <p:par><p:cTn ... nodeType="withEffect">...</p:cTn></p:par>
 *           </p:childTnLst>
 *         </p:cTn>
 *       </p:par>
 *       <!-- Group 2: Delay 500 (Sibling of Group 1) -->
 *       <p:par>
 *         <p:cTn id="B" fill="hold">
 *           <p:stCondLst><p:cond delay="500"/></p:stCondLst>
 *           <p:childTnLst>
 *             <!-- Animation 3 -->
 *             <p:par><p:cTn ... nodeType="afterEffect">...</p:cTn></p:par>
 *           </p:childTnLst>
 *         </p:cTn>
 *       </p:par>
 *     </p:childTnLst>
 *   </p:cTn>
 * </p:par>
 * ```
 * 
 * @param group - The click group to generate
 * @param startId - Starting cTn ID
 * @returns Object with xml string and next available ID
 */
function generateClickGroupXml(group: ClickGroup, startId: number, isFirstGroup: boolean = false): { xml: string; nextId: number } {
	let currentId = startId

	// Step 1: Group entries by their cumulative delay
	const delayGroups: Map<number, ClickGroupEntry[]> = new Map()
	// Maintain order of delays
	const delayOrder: number[] = []

	for (const entry of group.entries) {
		const delay = entry.cumulativeDelay
		if (!delayGroups.has(delay)) {
			delayGroups.set(delay, [])
			delayOrder.push(delay)
		}
		delayGroups.get(delay)!.push(entry)
	}

	// Step 2: Generate XML for each delay group using central wrapper
	const delayGroupXmls: string[] = []

	for (const delay of delayOrder) {
		const entries = delayGroups.get(delay)!
		const delayGroupId = currentId++

		// Collect animation XMLs for this delay group
		const animationXmls: string[] = []

		for (const entry of entries) {
			// Builder's effectXml already has <p:par> wrapper
			// NO extra wrapping needed - that was the bug!
			const effectXml = entry.animation.effectXml
			const animationId = currentId++

			// Inject correct ID (nodeType already in XML from builder)
			const injectedXml = injectNodeTypeAndId(effectXml, animationId, entry.nodeType)

			// Count IDs used (simple heuristic for now)
			const cTnCount = (effectXml.match(/<p:cTn/g) || []).length
			currentId += Math.max(0, cTnCount - 1)

			// Add builder's XML directly - it already has <p:par> wrapper
			animationXmls.push(injectedXml)
		}

		// Use central wrapper function for delay group
		const delayGroupXml = wrapInTimingContainer(
			animationXmls,
			'delayGroup',
			delay,
			delayGroupId
		)

		delayGroupXmls.push(delayGroupXml)
	}

	// Use central wrapper function for click group
	const clickGroupId = currentId++
	
	// For the first click group with afterPrevious trigger, add an extra start condition that references the mainSeq
	// This is a PowerPoint optimization: <p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>
	// Only add this for non-click-triggered groups (afterPrevious/withPrevious), not onClick
	let xml: string
	if (isFirstGroup && !group.isClickTriggered) {
		// Generate custom stCondLst with two conditions
		const groupDelay = group.isClickTriggered ? "indefinite" : "0"
		const stCondLst = `<p:stCondLst><p:cond delay="${groupDelay}"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst>`
		xml = `<p:par>
<p:cTn id="${clickGroupId}" fill="hold">
${stCondLst}
<p:childTnLst>
${delayGroupXmls.join('\n')}
</p:childTnLst>
</p:cTn>
</p:par>`
	} else {
		// Standard click group for all other cases
		xml = wrapInTimingContainer(
			delayGroupXmls,
			'clickGroup',
			'indefinite',
			clickGroupId
		)
	}

	return { xml, nextId: currentId }
}



/**
 * Inject the correct ID and nodeType into effect XML.
 * 
 * The effect XML from builders already contains the correct nodeType from ctx.nodeType.
 * This function only updates the ID if needed.
 * 
 * Note: Templates now receive nodeType via ctx.nodeType, so we should NOT override it.
 * This function is kept minimal to avoid regex-based XML manipulation (Rule 0).
 * 
 * @param effectXml - The raw effect XML from builder (already has correct nodeType)
 * @param id - The cTn ID to assign
 * @param nodeType - The node type (clickEffect, withEffect, afterEffect) - for validation only
 * @returns Updated XML with correct id (nodeType unchanged from template)
 */
function injectNodeTypeAndId(effectXml: string, id: number, nodeType: AnimationNodeType): string {
	// The templates already generate the correct nodeType via ctx.nodeType
	// We just need to ensure the ID is correct (templates use ids.main which should already be correct)
	// 
	// For now, return XML as-is since templates handle both id and nodeType correctly.
	// If ID needs updating in the future, use proper XML parsing (DOMParser), not regex.
	return effectXml
}

// ============================================================================
// HIGH-LEVEL API
// ============================================================================

/**
 * Generate complete timing XML for a slide using the structural approach.
 * 
 * This is the main entry point for the structural animation system.
 * It takes the slide's animations and produces properly structured timing XML.
 * 
 * @param slide - The slide to generate timing for
 * @param effectXmlGenerator - Function that generates effect XML for an animation
 * @returns Complete timing XML string, or empty string if no animations
 */
export function generateSlideTimingStructural(
	slide: PresSlide,
	effectXmlGenerator: (anim: ResolvedAnimation) => string
): string {
	const animations = slide._animations
	if (!animations || animations.length === 0) {
		return ''
	}

	// Resolve animations with effect XML
	const resolvedAnimations: ResolvedAnimation[] = animations.map(anim => {
		const resolved: ResolvedAnimation = {
			shapeId: anim.shapeId,
			target: anim.target,
			animation: anim.animation,
			paragraphCount: anim.paragraphCount || 1,
			duration: anim.animation.duration || 500,
			delay: anim.animation.delay || 0,
			effectXml: '' // Will be filled by generator
		}
		resolved.effectXml = effectXmlGenerator(resolved)
		return resolved
	})

	// Assemble into click groups
	const { clickGroups } = assembleClickGroups(resolvedAnimations)

	// Generate structural timing XML
	return generateStructuralTimingXml(clickGroups)
}

// Types and functions are already exported at definition
