/**
 * PptxGenJS: Animation Timing Orchestrator
 *
 * SINGLE SOURCE OF TRUTH for all timing-related concerns:
 * - nodeType computation
 * - trigger handling
 * - click group assembly
 * - delay calculation
 * - grpId/bldLst coordination
 *
 * Created: 2026-02-01 (Opus Timing Refactor)
 */
import { getNextAnimationId } from './gen-animations-ids';
// ============================================================================
// NODETYPE COMPUTATION - Single Source of Truth
// ============================================================================
/**
 * Compute nodeType based on the SEQUENCE_TRIGGER_TRUTH_TABLE_DEFINITIVE.md
 *
 * Truth Table Summary:
 *
 * | Sequence Mode | Trigger       | First Animation | Subsequent |
 * |---------------|---------------|-----------------|------------|
 * | asOneObject   | onClick       | clickEffect     | N/A        |
 * | asOneObject   | afterPrevious | afterEffect     | N/A        |
 * | asOneObject   | withPrevious  | withEffect      | N/A        |
 * | allAtOnce     | onClick       | clickEffect     | withEffect |
 * | allAtOnce     | afterPrevious | afterEffect     | withEffect |
 * | allAtOnce     | withPrevious  | withEffect      | withEffect |
 * | byParagraph   | onClick       | clickEffect     | clickEffect|
 * | byParagraph   | afterPrevious | afterEffect     | afterEffect|
 * | byParagraph   | withPrevious  | withEffect      | withEffect |
 *
 * @param trigger - The animation trigger mode
 * @param sequence - The sequence mode
 * @param isFirstInSequence - True for first animation in sequence expansion
 */
export function computeNodeType(trigger, sequence, isFirstInSequence) {
    // Map trigger to base nodeType
    const baseNodeType = trigger === 'afterPrevious' ? 'afterEffect' :
        trigger === 'withPrevious' ? 'withEffect' :
            'clickEffect';
    // asOneObject: Always use trigger-based nodeType
    if (sequence === 'asOneObject') {
        return baseNodeType;
    }
    // allAtOnce: First matches trigger, rest are withEffect (simultaneous)
    if (sequence === 'allAtOnce') {
        return isFirstInSequence ? baseNodeType : 'withEffect';
    }
    // byParagraph: All match trigger (uniform pattern)
    // Each paragraph animation creates its own click/trigger
    return baseNodeType;
}
// ============================================================================
// DELAY COMPUTATION - Single Source of Truth
// ============================================================================
/**
 * Compute animation delay from multiple sources.
 * Priority: animation.delay > config.defaultDelay > 0
 *
 * This replaces the scattered `animation.delay || config.defaultDelay || 0`
 * pattern found in 75+ builder files.
 */
export function computeDelay(animation, configDefaultDelay) {
    if (animation.delay !== undefined) {
        return animation.delay;
    }
    if (configDefaultDelay !== undefined) {
        return configDefaultDelay;
    }
    return 0;
}
// ============================================================================
// CLICK GROUP ASSEMBLY - Single Source of Truth
// ============================================================================
/**
 * Group animations into click groups based on trigger patterns.
 *
 * Rules:
 * 1. onClick starts a new click group
 * 2. withPrevious joins the current click group (simultaneous)
 * 3. afterPrevious joins the current click group (sequential)
 * 4. allAtOnce: First matches trigger, subsequent are withPrevious
 * 5. byParagraph: Each paragraph respects its trigger
 *
 * @param animations - Flattened animation entries with subIndex
 */
export function assembleClickGroups(animations) {
    const clickGroups = [];
    let currentGroup = null;
    let accumulatedDelay = 0;
    for (const entry of animations) {
        const trigger = (entry.animation.trigger || 'onClick');
        const sequence = (entry.animation.sequence || 'asOneObject');
        // Determine effective trigger for this entry
        let effectiveTrigger = trigger;
        if (sequence === 'allAtOnce' && entry.subIndex > 0) {
            // allAtOnce: subsequent items are always withPrevious
            effectiveTrigger = 'withPrevious';
        }
        // Compute nodeType
        const nodeType = computeNodeType(trigger, sequence, entry.subIndex === 0);
        // Compute delay
        const baseDelay = computeDelay(entry.animation, entry.configDefaultDelay);
        // Determine if this starts a new click group
        const startsNewGroup = effectiveTrigger === 'onClick' &&
            (currentGroup === null || currentGroup.entries.length > 0);
        if (startsNewGroup) {
            // Start new click group
            if (currentGroup && currentGroup.entries.length > 0) {
                clickGroups.push(currentGroup);
            }
            currentGroup = {
                id: getNextAnimationId(),
                trigger: effectiveTrigger,
                entries: []
            };
            accumulatedDelay = 0;
        }
        if (!currentGroup) {
            currentGroup = {
                id: getNextAnimationId(),
                trigger: effectiveTrigger,
                entries: []
            };
        }
        // Compute timing context
        const timing = {
            nodeType,
            delay: baseDelay,
            grpId: undefined, // Computed later by computeGrpIdContext
            shouldIncludeGrpId: false, // Computed later
            clickGroupIndex: clickGroups.length,
            positionInGroup: currentGroup.entries.length,
            wrapperNesting: effectiveTrigger === 'onClick' ? 'indefinite' :
                effectiveTrigger === 'afterPrevious' ? 'accumulated' : 'delay0',
            accumulatedDelay: effectiveTrigger === 'afterPrevious' ? accumulatedDelay : 0
        };
        currentGroup.entries.push({
            animation: entry.animation,
            shapeId: entry.shapeId,
            paragraphIndex: entry.paragraphIndex,
            timing,
            originalIndex: entry.originalIndex,
            subIndex: entry.subIndex
        });
        // Update accumulated delay for afterPrevious chains
        if (effectiveTrigger === 'afterPrevious' || effectiveTrigger === 'onClick') {
            accumulatedDelay += entry.animation.duration || 500;
        }
    }
    // Push final group
    if (currentGroup && currentGroup.entries.length > 0) {
        clickGroups.push(currentGroup);
    }
    return clickGroups;
}
// ============================================================================
// GRPID/BLDLST COORDINATION - Single Source of Truth
// ============================================================================
/**
 * Compute grpId values for all animations.
 *
 * Rules:
 * 1. grpId is per-shape animation index (0, 1, 2, ...)
 * 2. Media animations never have grpId
 * 3. Shapes with multiple animations skip grpId
 * 4. Effects with supportsSequence:false skip grpId
 *
 * @param animations - All animations on the slide
 * @param effectConfigs - Map of effect name to config (for supportsSequence check)
 */
export function computeGrpIdContext(animations, effectConfigs) {
    var _a;
    const result = new Map();
    const shapeAnimCounters = new Map();
    const shapeAnimCounts = new Map();
    // First pass: count animations per shape
    for (const anim of animations) {
        const effect = ((_a = anim.animation.effect) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
        const type = anim.animation.type || 'entrance';
        // Skip media animations
        if (type === 'media' || effect.startsWith('media') ||
            effect === 'play' || effect === 'pause' || effect === 'stop') {
            continue;
        }
        const count = shapeAnimCounts.get(anim.shapeId) || 0;
        shapeAnimCounts.set(anim.shapeId, count + 1);
    }
    // Second pass: compute grpId
    animations.forEach((anim, index) => {
        var _a, _b;
        const shapeId = anim.shapeId;
        const effect = ((_a = anim.animation.effect) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
        const type = anim.animation.type || 'entrance';
        // Skip media animations
        if (type === 'media' || effect.startsWith('media') ||
            effect === 'play' || effect === 'pause' || effect === 'stop') {
            return;
        }
        if (!result.has(shapeId)) {
            result.set(shapeId, new Map());
            shapeAnimCounters.set(shapeId, 0);
        }
        const currentGrpId = (_b = shapeAnimCounters.get(shapeId)) !== null && _b !== void 0 ? _b : 0;
        const animCountForShape = shapeAnimCounts.get(shapeId) || 1;
        // Determine if grpId should be included
        const effectConfig = effectConfigs.get(effect);
        const supportsSequence = (effectConfig === null || effectConfig === void 0 ? void 0 : effectConfig.supportsSequence) !== false;
        const shouldInclude = animCountForShape === 1 && supportsSequence;
        result.get(shapeId).set(index, {
            grpId: currentGrpId,
            shouldInclude
        });
        shapeAnimCounters.set(shapeId, currentGrpId + 1);
    });
    return result;
}
/**
 * Determine if bldLst should be generated for this slide.
 */
export function shouldGenerateBldLst(animations) {
    var _a;
    if (!animations || animations.length === 0)
        return false;
    // Count non-media animations per shape
    const shapeAnimCounts = new Map();
    let anyNonAsOneObject = false;
    let anyNonOnClick = false;
    for (const anim of animations) {
        const type = anim.animation.type || 'entrance';
        const effect = ((_a = anim.animation.effect) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
        // Skip media
        if (type === 'media' || effect.startsWith('media'))
            continue;
        const count = shapeAnimCounts.get(anim.shapeId) || 0;
        shapeAnimCounts.set(anim.shapeId, count + 1);
        if (anim.animation.sequence && anim.animation.sequence !== 'asOneObject') {
            anyNonAsOneObject = true;
        }
        if (anim.animation.trigger && anim.animation.trigger !== 'onClick') {
            anyNonOnClick = true;
        }
    }
    const anyShapeHasMultipleAnims = Array.from(shapeAnimCounts.values()).some(c => c > 1);
    // bldLst generated if: non-asOneObject OR multiple anims per shape OR non-onClick triggers
    return anyNonAsOneObject || anyShapeHasMultipleAnims || anyNonOnClick;
}
// ============================================================================
// XML GENERATION HELPERS
// ============================================================================
/**
 * Generate click group wrapper XML structure.
 *
 * Structure:
 * <p:par>
 *   <p:cTn id="X" fill="hold">
 *     <p:stCondLst><p:cond delay="indefinite"/></p:stCondLst>
 *     <p:childTnLst>
 *       <!-- animations with delay wrappers -->
 *     </p:childTnLst>
 *   </p:cTn>
 * </p:par>
 */
export function generateClickGroupWrapper(clickGroupId, innerContent) {
    return `<p:par>
	<p:cTn id="${clickGroupId}" fill="hold">
		<p:stCondLst>
			<p:cond delay="indefinite"/>
		</p:stCondLst>
		<p:childTnLst>
${innerContent}
		</p:childTnLst>
	</p:cTn>
</p:par>`;
}
/**
 * Generate delay wrapper for an animation.
 *
 * @param wrapperId - cTn ID for wrapper
 * @param delay - Delay in ms (0 for simultaneous, accumulated for afterPrevious)
 * @param animationXml - The animation XML to wrap
 */
export function generateDelayWrapper(wrapperId, delay, animationXml) {
    return `<p:par>
	<p:cTn id="${wrapperId}" fill="hold">
		<p:stCondLst>
			<p:cond delay="${delay}"/>
		</p:stCondLst>
		<p:childTnLst>
${animationXml}
		</p:childTnLst>
	</p:cTn>
</p:par>`;
}
//# sourceMappingURL=animation-timing-orchestrator.js.map