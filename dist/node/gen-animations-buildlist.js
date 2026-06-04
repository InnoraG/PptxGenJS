/**
 * Build List Generation for PowerPoint Animations
 * Extracted from gen-animations.ts to break circular dependency with genXmlTimingStructure.ts
 */
import { ANIMATION_REGISTRY_MERGED } from './gen-animations-registry-merged';
import { isModel3DAnimationEffect } from './animations-builders/data3DAnimationTemplates';
/**
 * Generate Build List
 * @param {any[]} animations - animations sorted by click group
 * @param {boolean} skipBuildList - whether to skip bldLst generation
 * @param {Set<number>} shapeIdsToSkipBldP - shape IDs to skip in bldLst
 * @returns {string} XML for p:bldLst
 * @description
 * This function maps animations to build list structure.
 * - Each click generates a sequence in bldLst
 * - Within a click: animations appear in the order they were added
 * - grpId must match between bldLst and timing (managed by injectGrpId)
 * - allAtOnce: single bldP with grpId=0
 * - byParagraph: multiple bldPs, one per paragraph, with sequential grpIds
 * - Multiple animations with same index are siblings (allAtOnce/withPrevious)
 *
 * Refactored: 2026-01-12 (replaced flat array with Map<clickNum, ISlideAnimation[]>)
 * Purpose: Cleaner grouping logic, explicit click number tracking
 * Extracted: 2026-01-28 (moved to separate file to break circular dependency)
 */
export function genXmlBuildList(animations, skipBuildList = false, shapeIdsToSkipBldP = new Set()) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!animations || animations.length === 0)
        return '';
    // Check if ALL animations are asOneObject AND no shape has multiple animations
    // If shapes have multiple animations (entrance + exit), they need bldLst with grpId
    // This matches PowerPoint behavior where shape-only effects (no paragraph targeting) 
    // don't generate any bldLst entries, UNLESS they have multiple animations
    // First, count animations per shape (excluding ALL media animations)
    const shapeAnimCounts = new Map();
    for (const anim of animations) {
        const animationType = ((_a = anim.animation) === null || _a === void 0 ? void 0 : _a.type) || 'entrance';
        const effect = ((_c = (_b = anim.animation) === null || _b === void 0 ? void 0 : _b.effect) === null || _c === void 0 ? void 0 : _c.toLowerCase()) || '';
        // Skip ALL media animations - they NEVER contribute to bldLst/grpId
        if (animationType === 'media' || effect.startsWith('media') ||
            effect === 'play' || effect === 'pause' || effect === 'togglepause' || effect === 'stop')
            continue;
        // Skip native 3D model animations - reference emits no bldLst for them
        if (isModel3DAnimationEffect(effect))
            continue;
        const count = shapeAnimCounts.get(anim.shapeId) || 0;
        shapeAnimCounts.set(anim.shapeId, count + 1);
    }
    // Check if any shape has multiple animations
    const anyShapeHasMultipleAnims = Array.from(shapeAnimCounts.values()).some(count => count > 1);
    const allAsOneObject = animations.every(anim => {
        var _a, _b, _c, _d;
        const sequence = ((_a = anim.animation) === null || _a === void 0 ? void 0 : _a.sequence) || 'asOneObject';
        const animationType = ((_b = anim.animation) === null || _b === void 0 ? void 0 : _b.type) || 'entrance';
        const effect = ((_d = (_c = anim.animation) === null || _c === void 0 ? void 0 : _c.effect) === null || _d === void 0 ? void 0 : _d.toLowerCase()) || '';
        // Skip media animations in this check
        if (animationType === 'media' || effect.startsWith('media')) {
            return true; // Don't count media against the check
        }
        // 3D model animations never drive bldLst
        if (isModel3DAnimationEffect(effect))
            return true;
        return sequence === 'asOneObject';
    });
    // Skip bldLst only if ALL are asOneObject AND no shape has multiple animations
    // AND all animations are onClick (no afterPrevious/withPrevious triggers)
    const allOnClick = animations.every(anim => {
        var _a, _b, _c, _d;
        const trigger = ((_a = anim.animation) === null || _a === void 0 ? void 0 : _a.trigger) || 'onClick';
        const animationType = ((_b = anim.animation) === null || _b === void 0 ? void 0 : _b.type) || 'entrance';
        const effect = ((_d = (_c = anim.animation) === null || _c === void 0 ? void 0 : _c.effect) === null || _d === void 0 ? void 0 : _d.toLowerCase()) || '';
        // Skip media animations in this check
        if (animationType === 'media' || effect.startsWith('media')) {
            return true;
        }
        // 3D model animations never drive bldLst
        if (isModel3DAnimationEffect(effect))
            return true;
        return trigger === 'onClick';
    });
    if (allAsOneObject && !anyShapeHasMultipleAnims && allOnClick) {
        // No bldLst needed when all animations target whole shapes with single animation per shape
        // AND all use onClick triggers
        return '';
    }
    // For shapes with multiple animations (entrance + exit), we need MULTIPLE bldP entries
    // with incrementing grpId values (0 for first animation, 1 for second, etc.)
    // 
    // Structure: Map<shapeId, Array<{grpId, animBgAttr, buildAttr, uiExpand}>>
    const bldPByShape = new Map();
    const shapeGrpIdCounter = new Map();
    for (const anim of animations) {
        const shapeId = anim.shapeId;
        const effect = ((_e = (_d = anim.animation) === null || _d === void 0 ? void 0 : _d.effect) === null || _e === void 0 ? void 0 : _e.toLowerCase()) || '';
        const animationType = ((_f = anim.animation) === null || _f === void 0 ? void 0 : _f.type) || 'entrance';
        const sequence = ((_g = anim.animation) === null || _g === void 0 ? void 0 : _g.sequence) || 'asOneObject';
        const uiExpand = ((_h = anim.animation) === null || _h === void 0 ? void 0 : _h.uiExpand) === true;
        // Skip media animations - they NEVER need bldP entries (regardless of triggers)
        // Media commands (play, pause, stop) use presetClass="mediacall" which doesn't use bldLst
        if (animationType === 'media' || effect.startsWith('media') ||
            effect === 'play' || effect === 'pause' || effect === 'togglepause' || effect === 'stop') {
            continue;
        }
        // Skip native 3D model animations - reference emits no bldP for them
        if (isModel3DAnimationEffect(effect)) {
            continue;
        }
        // Get effect config from registry
        const effectConfig = ANIMATION_REGISTRY_MERGED[effect] || {};
        const isEmphasis = animationType === 'emphasis' || effectConfig.presetClass === 'emph';
        const requiresParagraphTargeting = effectConfig.requiresParagraphTargeting === true;
        // Determine if animBg="1" should be added
        let includeAnimBg = true;
        if (isEmphasis) {
            if (sequence === 'asOneObject') {
                includeAnimBg = true;
            }
            else {
                includeAnimBg = !requiresParagraphTargeting;
            }
        }
        const animBgAttr = includeAnimBg ? ' animBg="1"' : '';
        // Determine build attribute based on sequence mode
        // - asOneObject: No build attribute (whole shape animates as one)
        // - allAtOnce: build="allAtOnce" (all paragraphs animate simultaneously)
        // - byParagraph: build="p" (each paragraph requires a click)
        let buildAttr = '';
        if (sequence === 'allAtOnce') {
            buildAttr = ' build="allAtOnce"';
        }
        else if (sequence === 'byParagraph') {
            buildAttr = ' build="p"';
        }
        // Get current grpId for this shape and increment for next animation
        const currentGrpId = shapeGrpIdCounter.get(shapeId) || 0;
        shapeGrpIdCounter.set(shapeId, currentGrpId + 1);
        // Add bldP entry for this animation
        if (!bldPByShape.has(shapeId)) {
            bldPByShape.set(shapeId, []);
        }
        bldPByShape.get(shapeId).push({ grpId: currentGrpId, animBgAttr, buildAttr, uiExpand });
    }
    if (bldPByShape.size === 0)
        return '';
    // Sort by shapeId ascending (bldLst must be in shape creation order)
    const sortedShapeIds = Array.from(bldPByShape.keys()).sort((a, b) => a - b);
    // Build bldP elements - each animation for each shape gets its own entry
    const buildElements = [];
    for (const shapeId of sortedShapeIds) {
        const entries = bldPByShape.get(shapeId);
        for (const entry of entries) {
            const uiExpandAttr = entry.uiExpand ? ' uiExpand="1"' : '';
            buildElements.push(`<p:bldP spid="${shapeId}" grpId="${entry.grpId}"${uiExpandAttr}${entry.buildAttr}${entry.animBgAttr}/>`);
        }
    }
    const result = `
		<p:bldLst>
			${buildElements.join('\n')}
		</p:bldLst>
	`.trim();
    return result;
}
//# sourceMappingURL=gen-animations-buildlist.js.map