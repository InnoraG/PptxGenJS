import { getNextAnimationId } from '../gen-animations-ids';
import { getAnimationConfig } from '../gen-animations-registry';
import { getAnimationConfigMerged } from '../gen-animations-registry-merged';
// REMOVED: COMPLETE_ANIMATION_REGISTRY - using only ANIMATION_REGISTRY_MERGED as single source of truth
import { buildFadedZoomAnimation } from './buildFadedZoomAnimation';
import { buildTeeterAnimation } from './buildTeeterAnimation';
import { buildSpinAnimation } from './buildSpinAnimation';
import { buildVerticalGrowAnimation } from './buildVerticalGrowAnimation';
import { buildWaveAnimation } from './buildWaveAnimation';
import { buildGrowShrinkAnimation } from './buildGrowShrinkAnimation';
import { buildSimpleAnimation, buildDirectionalAnimation, buildEmphasisAnimation, CUSTOM_BUILDER_MAP } from '../gen-animations-builder';
/**
 * Build sequence animation (allAtOnce, byParagraph)
 * This handles text animations with multiple paragraphs
 */
export function buildSequenceAnimation(shapeId, animation, paragraphCount, sequence, mappedDirectionConfig) {
    var _a, _b;
    const effect = (animation.effect || 'appear').toLowerCase();
    // Handle Wheel spokes property: convert to direction for directional builder
    if (effect === 'wheel' && animation.spokes !== undefined) {
        animation = Object.assign(Object.assign({}, animation), { direction: String(animation.spokes) });
    }
    const type = (animation.type === 'exit' ? 'exit'
        : animation.type === 'emphasis' ? 'emphasis'
            : animation.type === 'motion' ? 'motion'
                : 'entrance');
    // Single source of truth: ANIMATION_REGISTRY_MERGED
    let config = getAnimationConfigMerged(effect, type);
    if (!config)
        config = getAnimationConfig(effect, type); // Fallback to original registry for backwards compatibility
    if (!config) {
        throw new Error(`Unknown animation effect: "${effect}"`);
    }
    if (!config.supportsSequence) {
        throw new Error(`Effect "${effect}" does not support sequence modes`);
    }
    // Perform direction mapping for exit animations (same as buildAnimation does)
    // Case-insensitive lookup to support both camelCase API input and PowerPoint-friendly names
    let globalDirectionConfig = mappedDirectionConfig;
    if (!globalDirectionConfig && animation.direction && config.directions) {
        const direction = animation.direction;
        globalDirectionConfig = config.directions.find(d => d.name.toLowerCase() === direction.toLowerCase());
        // For exit animations, try mapping "toXXX" to "fromXXX" direction
        if (!globalDirectionConfig && type === 'exit' && direction.toLowerCase().startsWith('to')) {
            const entranceDirection = direction.replace(/^to/i, 'from');
            const entranceConfig = config.directions.find(d => d.name.toLowerCase() === entranceDirection.toLowerCase());
            if (entranceConfig) {
                // Clone and flip formulas for exit
                globalDirectionConfig = {
                    name: direction,
                    presetSubtype: entranceConfig.presetSubtype,
                    xFormula: entranceConfig.xFormula ? {
                        from: entranceConfig.xFormula.to,
                        to: entranceConfig.xFormula.from
                    } : undefined,
                    yFormula: entranceConfig.yFormula ? {
                        from: entranceConfig.yFormula.to,
                        to: entranceConfig.yFormula.from
                    } : undefined
                };
            }
        }
    }
    const isAllAtOnce = sequence === 'allAtOnce';
    const sequenceTargetBackgroundOnly = config.sequenceTargetBackgroundOnly || false;
    const animations = [];
    // For effects that only target background in allAtOnce mode (like FadedZoom),
    // generate only ONE animation for the background, not one per paragraph
    if (sequenceTargetBackgroundOnly && isAllAtOnce && paragraphCount > 0) {
        console.log(`[SEQUENCE] Effect uses sequenceTargetBackgroundOnly=true in allAtOnce mode - generating only background animation`);
        const ctx = {
            shapeId,
            animation,
            config,
            directionConfig: mappedDirectionConfig,
            type,
            ids: { main: getNextAnimationId() },
            target: { type: 'background' }
        };
        let animXml = '';
        const customTemplate = config.customTemplate;
        if (customTemplate === 'buildFadedZoomAnimation') {
            animXml = buildFadedZoomAnimation(ctx);
        }
        else if (customTemplate === 'buildSpinAnimation') {
            animXml = buildSpinAnimation(ctx);
        }
        else if (customTemplate === 'buildTeeterAnimation') {
            animXml = buildTeeterAnimation(ctx);
        }
        else if (customTemplate === 'buildGrowShrinkAnimation') {
            animXml = buildGrowShrinkAnimation(ctx);
        }
        else if (customTemplate === 'buildVerticalGrowAnimation') {
            animXml = buildVerticalGrowAnimation(ctx);
        }
        else if (customTemplate === 'buildWaveAnimation') {
            animXml = buildWaveAnimation(ctx);
        }
        else {
            console.warn(`[SEQUENCE] sequenceTargetBackgroundOnly not implemented for template: ${customTemplate}`);
        }
        return [animXml];
    }
    // Get animation multiplier (how many copies per paragraph)
    // The multiplier creates N copies of EACH target (for layered/staggered effect)
    // 
    // CRITICAL: Different animation types have different sub-animation counts:
    // 1. Motion directional (Fly): visibility + X + Y = 3 sub-animations
    // 2. Motion directional without visibility (rare): X + Y = 2 sub-animations  
    // 3. Non-motion directional (Wipe, Stretch, Unfold): animEffect only = 1 sub-animation
    //
    // Examples:
    // - Fly (multiplier=3, motion with visibility): 3 sub-anims, loop=1 (3/3=1)
    // - Wipe (multiplier=2, non-motion): 1 sub-anim, loop=2 (2/1=2)
    // - Unfold (multiplier=4, non-motion): 1 sub-anim, loop=4 (4/1=4)
    // - Stretch (multiplier=5, non-motion): 1 sub-anim, loop=5 (5/1=5)
    //
    const configMultiplier = config.subAnimationCount || 1;
    // DEBUG: Log multiplier for all effects with multiplier > 1
    if (configMultiplier > 1) {
        console.log(`[MULTIPLIER DEBUG] ${effect}: configMultiplier=${configMultiplier}, config.subAnimationCount=${config.subAnimationCount}`);
    }
    // DEBUG: Log template generator for stretch
    if (effect === 'stretch' || effect === 'stretchy') {
        console.log(`[TEMPLATE DEBUG] ${effect}: templateGenerator=${config.templateGenerator}, customTemplate=${config.customTemplate}`);
    }
    // For sequence modes (allAtOnce/byParagraph), the multiplier logic is:
    // - Motion directional effects (Fly): Have built-in sub-animations (visibility+X+Y)
    //   that COUNT as the multiplier, so loop=1
    // - Non-motion effects (Wipe, Stretch): Don't have built-in multiplier structure,
    //   so loop must generate the copies
    //
    // Key insight: The multiplier in registry represents HOW MANY sub-animations exist,
    // not how many times to loop! We only loop if the effect doesn't naturally have that many.
    const firstDirection = (_a = config.directions) === null || _a === void 0 ? void 0 : _a[0];
    const isMotionDirectional = !!((firstDirection === null || firstDirection === void 0 ? void 0 : firstDirection.xFormula) && (firstDirection === null || firstDirection === void 0 ? void 0 : firstDirection.yFormula));
    const usesVisibility = ((_b = config.metadata) === null || _b === void 0 ? void 0 : _b.usesVisibility) === true;
    // Motion directional effects have multiple sub-animations built-in
    // Non-motion effects have only 1 animation per iteration
    const builtInSubAnimations = isMotionDirectional ? (usesVisibility ? 3 : 2) : 1;
    // If the effect naturally has the right number of sub-animations, loop=1
    // Otherwise, loop to make up the difference
    const multiplier = builtInSubAnimations >= configMultiplier ? 1 : Math.ceil(configMultiplier / builtInSubAnimations);
    // DEBUG: Log loop multiplier
    if (configMultiplier > 1) {
        console.log(`[MULTIPLIER DEBUG] ${effect}: builtInSubAnimations=${builtInSubAnimations}, multiplier(loop)=${multiplier}, isMotionDirectional=${isMotionDirectional}, usesVisibility=${usesVisibility}`);
    }
    // Allocate shared IDs for allAtOnce mode
    let sharedIds = null;
    if (isAllAtOnce) {
        sharedIds = {
            main: getNextAnimationId(),
            set: getNextAnimationId(),
            animX: getNextAnimationId(),
            animY: getNextAnimationId(),
            effect: getNextAnimationId()
        };
    }
    // Generate base animation + paragraph animations
    // Generate ONE animation for each target (base or paragraph)
    // Return as grouped array: [[base], [para0], [para1], ...]
    // Each group contains exactly ONE animation (no multiplier duplicates)
    // ? FIXED: ALL preset classes (entr/exit/emph/path) use base animation for allAtOnce/byParagraph
    // EXCEPT: Text-based effects (requiresParagraphTargeting) only animate paragraphs, no base
    // Base animation targets the shape with <p:bg/> for allAtOnce/byParagraph modes
    const includeBaseAnimation = !(config.requiresParagraphTargeting === true);
    const totalAnimations = includeBaseAnimation ? (1 + paragraphCount) : paragraphCount;
    const grouped = [];
    const trigger = animation.trigger || 'onClick';
    const exitParagraphsFirst = type === 'exit'
        && includeBaseAnimation
        && (effect === 'spiral' || (trigger === 'onClick' && isAllAtOnce && paragraphCount <= 2));
    // Loop through each animation (base + paragraphs, or just paragraphs for emphasis)
    for (let i = 0; i < totalAnimations; i++) {
        // For emphasis: i=0 is paragraph 0, i=1 is paragraph 1, etc. (no base)
        // For entrance/exit: i=0 is base, i=1+ are paragraphs
        const isBase = exitParagraphsFirst
            ? i === totalAnimations - 1
            : includeBaseAnimation && i === 0;
        const paragraphIdx = exitParagraphsFirst
            ? i
            : includeBaseAnimation ? i - 1 : i;
        const target = isBase
            ? { type: 'background' } // Base: targets whole shape with <p:bg />
            : { type: 'paragraph', paragraphIndex: paragraphIdx }; // Paragraph: targets specific paragraph
        // CRITICAL FIX (2026-01-27): Always use unique IDs to avoid XML corruption with afterPrevious
        const ids = {
            main: getNextAnimationId(),
            set: getNextAnimationId(),
            animX: getNextAnimationId(),
            animY: getNextAnimationId(),
            effect: getNextAnimationId(),
            setBhvr: getNextAnimationId(),
            animXBhvr: getNextAnimationId(),
            animYBhvr: getNextAnimationId()
        };
        // Use the global direction config that was already mapped above
        let directionConfig = globalDirectionConfig;
        // Determine nodeType based on PowerPoint Truth Table
        // Source: SEQUENCE_TRIGGER_TRUTH_TABLE_DEFINITIVE.md
        // Pattern: 1+N animations (1 for shape/base + N for paragraphs)
        // i=0 is the shape/base animation, i>0 are paragraph animations
        // NOTE: asOneObject is handled elsewhere - this function only handles allAtOnce/byParagraph
        let nodeType;
        if (isAllAtOnce) {
            // allAtOnce: 1+N animations (1 base + N paragraphs)
            // CRITICAL DISCOVERY: nodeType pattern is SAME for onClick and withPrevious!
            // - onClick: Background=clickEffect, Paragraphs=withEffect (when N>1)
            // - afterPrevious: ALL=afterEffect (uniform)
            // - withPrevious: Background=afterEffect, Paragraphs=withEffect (SAME as onClick structure!)
            console.log(`[ALLATONCE DEBUG] spid=${shapeId} i=${i} paraCount=${paragraphCount} trigger=${trigger}`);
            if (trigger === 'afterPrevious') {
                // afterPrevious: Threshold-based pattern at 2 paragraphs
                // - 1-2 paragraphs: ALL use afterEffect (uniform)
                // - 3+ paragraphs: Background=afterEffect, Paragraphs=withEffect (mixed)
                if (paragraphCount <= 2) {
                    // 1-2 paragraphs: ALL use afterEffect
                    nodeType = 'afterEffect';
                    console.log(`[ALLATONCE DEBUG] afterPrevious <=2para, ALL use afterEffect`);
                }
                else {
                    // 3+ paragraphs: bg=afterEffect, paras=withEffect
                    if (i === 0) {
                        nodeType = 'afterEffect';
                        console.log(`[ALLATONCE DEBUG] afterPrevious 3+para i=0, use afterEffect`);
                    }
                    else {
                        nodeType = 'withEffect';
                        console.log(`[ALLATONCE DEBUG] afterPrevious 3+para i>0, use withEffect`);
                    }
                }
            }
            else if (trigger === 'withPrevious') {
                // withPrevious: ALL animations use withEffect (uniform pattern)
                // This applies to both single and multi-paragraph cases
                nodeType = 'withEffect';
                console.log(`[ALLATONCE DEBUG] withPrevious path, ALL use withEffect`);
            }
            else {
                // onClick: Background=clickEffect, Paragraphs=withEffect (for multi-para)
                if (i === 0) {
                    nodeType = 'clickEffect'; // base always clickEffect
                }
                else if (paragraphCount === 1) {
                    // Single paragraph: para0 also uses clickEffect (no concurrent play needed)
                    nodeType = 'clickEffect';
                }
                else {
                    // Multiple paragraphs: para0+ use withEffect (concurrent with base)
                    nodeType = 'withEffect';
                }
            }
        }
        else {
            // byParagraph: 1+N animations (1 base + N paragraphs)
            // CRITICAL DISCOVERY: nodeType depends on TRIGGER!
            //   - onClick: Background=clickEffect, Paragraphs=clickEffect (ALL create separate clicks)
            //   - afterPrevious: Background=afterEffect, Paragraphs=afterEffect (ALL stay in same CG)
            //   - withPrevious: Background=withEffect, Paragraphs=clickEffect (paras create separate clicks)
            if (trigger === 'afterPrevious') {
                // afterPrevious: Threshold-based pattern at 2 paragraphs (same as allAtOnce!)
                // - 1-2 paragraphs: ALL use afterEffect (chained into existing sequence)
                // - 3+ paragraphs: Background=afterEffect, Paragraphs=clickEffect (paras create separate CGs)
                if (paragraphCount <= 2) {
                    // 1-2 paragraphs: ALL chained with afterEffect
                    nodeType = 'afterEffect';
                }
                else {
                    // 3+ paragraphs: bg chains, paras create new clicks
                    nodeType = i === 0 ? 'afterEffect' : 'clickEffect';
                }
            }
            else if (trigger === 'withPrevious') {
                // withPrevious: Background uses withEffect, paragraphs create separate clicks
                nodeType = i === 0 ? 'withEffect' : 'clickEffect';
            }
            else {
                // onClick: ALL create separate clicks (clickEffect)
                nodeType = 'clickEffect';
            }
        }
        // DEBUG: Trace nodeType calculation
        console.log(`[SEQ DEBUG] spid=${shapeId} seq=${sequence} i=${i} trigger=${trigger} -> nodeType=${nodeType}`);
        // ARCHITECTURE: Strategy Pattern with Overrides
        // buildSequenceAnimation provides DEFAULT values (nodeType, delay handling)
        // Individual builders can USE these defaults OR OVERRIDE when needed
        // This keeps common logic centralized while allowing edge-case flexibility
        const ctx = {
            shapeId,
            animation,
            config,
            directionConfig,
            type,
            multiplier,
            ids,
            target,
            sequence,
            nodeType, // DEFAULT nodeType - builders can use or override
            // NEW: Sequence utilities for builders that need custom logic
            sequenceUtils: {
                isFirstAnimation: i === 0,
                animationIndex: i,
                totalAnimations: totalAnimations,
                sequenceMode: sequence
            }
        };
        let animXml = '';
        switch (config.templateGenerator) {
            case 'simple':
                animXml = buildSimpleAnimation(ctx);
                break;
            case 'directional':
                animXml = buildDirectionalAnimation(ctx);
                break;
            case 'emphasis':
                animXml = buildEmphasisAnimation(ctx);
                break;
            case 'custom': {
                // Opus Refactor: Use lookup table instead of 175-line if-else chain
                const customTemplate = config.customTemplate;
                const builder = CUSTOM_BUILDER_MAP[customTemplate];
                if (builder) {
                    animXml = builder(ctx);
                }
                else {
                    throw new Error(`Custom template "${customTemplate}" not supported in sequence mode`);
                }
                break;
            }
            case 'path':
                // Motion path animations - use buildMotionPathSequenceAnimation
                animXml = buildMotionPathSequenceAnimation(ctx);
                break;
            default:
                throw new Error(`Sequence not supported for template generator: ${config.templateGenerator}`);
        }
        // Each group contains exactly ONE animation
        // The multiplier effects are generated INSIDE the template (buildNonMotionDirectional)
        grouped.push([animXml]);
    } // End loop (base + paragraphs)
    // Return grouped animations for wrapping by the dispatcher
    // Each group represents one paragraph (with N multiplier copies)
    // byParagraph: Each group will be wrapped separately (N click entries)
    // allAtOnce: All groups will be wrapped together (1 click entry)
    return grouped;
}
/**
 * Build motion path animation for sequence modes (allAtOnce, byParagraph)
 * Motion paths use <p:animMotion> with SVG-like path data
 * All motion paths use presetID=1 and presetClass="path"
 */
function buildMotionPathSequenceAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, ids, target } = ctx;
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
    const duration = animation.duration || config.defaultDuration || 2000;
    // Get path data from config
    const pathData = config.pathData || 'M 0 0 L 0.25 0 Z';
    // Build target XML based on targeting mode
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    // Motion path animation structure
    // Each motion path has unique presetID from registry, presetClass="path", accel/decel for smooth easing
    // nodeType is passed from context (clickEffect for first, withEffect for rest in allAtOnce mode)
    const nodeType = ctx.nodeType || 'clickEffect';
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="path" presetSubtype="0" accel="50000" decel="50000" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>
				<p:animMotion origin="layout" path="${pathData}" pathEditMode="relative" ptsTypes="">
					<p:cBhvr>
						<p:cTn id="${ids.main + 1}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:animMotion>
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
//# sourceMappingURL=buildSequenceAnimation.js.map