/**
 * PptxGenJS: Animation Engine V3 - Fully Data-Driven
 *
 * This is the main animation engine that uses the registry and builder.
 * No hardcoded animation logic - everything is configuration-driven.
 *
 * To add a new animation:
 * 1. Add configuration to gen-animations-registry.ts
 * 2. That's it! No engine changes needed.
 */
import { getNextAnimationId, resetAnimationId } from './gen-animations-ids';
import { buildAnimation, canBuildAnimation, getAnimationMetadata } from './gen-animations-builder';
import { buildSequenceAnimation } from './animations-builders/buildSequenceAnimation';
import { buildAnimationWithIterate, shouldUseIteratePath, ENABLE_ITERATE_ENGINE } from './gen-animations-engine-iterate';
// ============================================================================
// PUBLIC API
// ============================================================================
/**
 * Generate animation for a shape
 * Main entry point for single-shape animations
 */
export function generateShapeAnimation(shape, animation, shapeId) {
    const type = (animation.type === 'exit' ? 'exit'
        : animation.type === 'emphasis' ? 'emphasis'
            : animation.type === 'motion' ? 'motion'
                : 'entrance');
    // For motion paths, use motionPath property instead of effect
    const effect = (type === 'motion' && animation.motionPath
        ? animation.motionPath
        : animation.effect || 'appear').toLowerCase();
    // Ensure the animation object has the correct effect set
    // This is critical for motion paths where motionPath property is used instead of effect
    const normalizedAnimation = Object.assign(Object.assign({}, animation), { effect });
    // Check if animation is supported
    if (!isEffectSupported(effect, type)) {
        console.warn(`Animation effect "${effect}" not found in registry. Falling back to "appear".`);
        normalizedAnimation.effect = 'appear';
    }
    try {
        return buildAnimation(shapeId, normalizedAnimation);
    }
    catch (error) {
        console.error(`Error generating animation:`, error);
        // Fallback to simple appear
        return buildAnimation(shapeId, Object.assign(Object.assign({}, animation), { effect: 'appear', direction: undefined }));
    }
}
/**
 * Generate animation for text with sequence modes
 * Handles asOneObject, allAtOnce, and byParagraph modes
 *
 * CLEAN ARCHITECTURE - V3 ONLY:
 * V3 ALWAYS returns string[] for ALL modes with ALL wrapping done internally.
 * NO external dependencies on gen-animations.ts - completely self-contained.
 *
 * @param shapeId - Shape ID
 * @param animation - Animation properties
 * @param paragraphCount - Number of paragraphs
 * @param options - Options for generation
 * @param options.skipGrpId - When true, omit grpId attribute (for Multiple Animation Principle)
 * @param options.skipIndefiniteWrapper - When true, skip the delay="indefinite" wrapper (for auto-play)
 */
export function generateTextAnimation(shapeId, animation, paragraphCount, options) {
    var _a, _b;
    const sequence = animation.sequence || 'asOneObject';
    const effect = (animation.effect || 'appear').toLowerCase();
    const skipGrpId = (_a = options === null || options === void 0 ? void 0 : options.skipGrpId) !== null && _a !== void 0 ? _a : false;
    const skipIndefiniteWrapper = (_b = options === null || options === void 0 ? void 0 : options.skipIndefiniteWrapper) !== null && _b !== void 0 ? _b : false;
    // Check if effect is supported
    if (!canBuildAnimation(effect)) {
        console.warn(`Animation effect "${effect}" not found in registry. Falling back to "appear".`);
        animation.effect = 'appear';
    }
    // ========================================================================
    // ITERATE PATH: PowerPoint-native approach (FEATURE FLAG - EXPERIMENTAL)
    // ========================================================================
    // If iterate engine is enabled and animation should use iterate path,
    // use the simpler PowerPoint-native approach (1 animation + <p:iterate>)
    // NOTE: Currently disabled by default as PowerPoint doesn't fully recognize
    // the generated iterate structure. Kept for future investigation.
    if (ENABLE_ITERATE_ENGINE && shouldUseIteratePath(animation)) {
        return buildAnimationWithIterate(shapeId, animation, skipGrpId);
    }
    // ========================================================================
    // asOneObject: Single animation for entire shape with double-wrapper
    // ========================================================================
    if (sequence === 'asOneObject') {
        // asOneObject generates ONE animation for the entire shape
        // The multiplier is already baked into directional effects via their sub-animation structure
        const xml = buildAnimation(shapeId, animation, undefined, { skipGrpId });
        if (!xml)
            return [];
        // For auto-play (skipIndefiniteWrapper=true), return just the animation XML
        // buildAnimation already wraps in <p:par>, so no additional wrapping needed
        // The outer wrapper in genXmlTimingStructure provides the click group structure
        if (skipIndefiniteWrapper) {
            return [xml];
        }
        // Wrap with double-wrapper (delay="indefinite" structure) for click-triggered animations
        const id1 = getNextAnimationId();
        const id2 = getNextAnimationId();
        const wrapped = `
		<p:par>
			<p:cTn id="${id1}" fill="hold">
				<p:stCondLst>
					<p:cond delay="indefinite"/>
				</p:stCondLst>
				<p:childTnLst>
					<p:par>
						<p:cTn id="${id2}" fill="hold">
							<p:stCondLst>
								<p:cond delay="0"/>
							</p:stCondLst>
							<p:childTnLst>
								${xml}
							</p:childTnLst>
						</p:cTn>
					</p:par>
				</p:childTnLst>
			</p:cTn>
		</p:par>`.trim();
        return [wrapped];
    }
    // ========================================================================
    // allAtOnce & byParagraph: Sequence modes for text animations
    // ========================================================================
    if (sequence === 'allAtOnce' || sequence === 'byParagraph') {
        // Determine animation type for registry lookup
        // Note: animation.type can be 'entrance', 'exit', 'emphasis', 'motion', or 'path'
        // Map to the correct type for getAnimationMetadata
        const animTypeRaw = animation.type;
        const animType = animTypeRaw === 'path' ? 'motion'
            : animTypeRaw === 'exit' ? 'exit'
                : animTypeRaw === 'emphasis' ? 'emphasis'
                    : animTypeRaw === 'motion' ? 'motion'
                        : 'entrance';
        const metadata = getAnimationMetadata(effect, animType);
        // CRITICAL FIX (2026-01-27): Respect trigger for sequence mode wrapping
        // When trigger is afterPrevious or withPrevious, skip the indefinite wrapper
        // to avoid double-nesting (gen-animations.ts will add proper sibling structure)
        const trigger = animation.trigger || 'onClick';
        const shouldSkipWrapper = skipIndefiniteWrapper || trigger === 'afterPrevious' || trigger === 'withPrevious';
        console.log(`[ENGINE DEBUG] spid=${shapeId}, seq=${sequence}, trigger=${trigger}, shouldSkip=${shouldSkipWrapper}`);
        if (!(metadata === null || metadata === void 0 ? void 0 : metadata.supportsSequence)) {
            console.warn(`Effect "${effect}" does not support sequence modes. Using asOneObject instead.`);
            const xml = buildAnimation(shapeId, animation, undefined, { skipGrpId });
            if (!xml)
                return [];
            const id1 = getNextAnimationId();
            const id2 = getNextAnimationId();
            const wrapped = `
		<p:par>
			<p:cTn id="${id1}" fill="hold">
				<p:stCondLst>
					<p:cond delay="indefinite"/>
				</p:stCondLst>
				<p:childTnLst>
					<p:par>
						<p:cTn id="${id2}" fill="hold">
							<p:stCondLst>
								<p:cond delay="0"/>
							</p:stCondLst>
							<p:childTnLst>
								${xml}
							</p:childTnLst>
						</p:cTn>
					</p:par>
				</p:childTnLst>
			</p:cTn>
		</p:par>`.trim();
            return [wrapped];
        }
        try {
            // Get unwrapped animations from builder
            // Can be: string (single), string[] (flat array), or string[][] (grouped by paragraph)
            const animations = buildSequenceAnimation(shapeId, animation, paragraphCount, sequence);
            // Flatten if needed (string[][] → string[])
            let animationsArray;
            if (Array.isArray(animations)) {
                // Check if it's string[][] (grouped structure)
                if (animations.length > 0 && Array.isArray(animations[0])) {
                    // It's grouped! Keep the grouped structure for proper wrapping
                    const grouped = animations;
                    // NOTE: sequenceModeForcedAllAtOnce flag removed to preserve user freedom
                    // Users can now specify any sequence mode for any effect without engine override
                    // For byParagraph: wrap each group separately
                    // For allAtOnce: flatten and wrap all together
                    if (sequence === 'byParagraph') {
                        // byParagraph: Each group contains ALL animations for one paragraph (multiplier effects)
                        // Wrap each group in DOUBLE-WRAPPER for per-paragraph click sequencing
                        // UNLESS shouldSkipWrapper is true (afterPrevious/withPrevious triggers)
                        if (shouldSkipWrapper) {
                            // Return unwrapped groups (just join, keep par wrappers intact)
                            return grouped.map(group => group.join('\n'));
                        }
                        return grouped.map(group => {
                            const id1 = getNextAnimationId();
                            const id2 = getNextAnimationId();
                            // Join all animations in the group (handles multiplier > 1)
                            return `
		<p:par>
			<p:cTn id="${id1}" fill="hold">
				<p:stCondLst>
					<p:cond delay="indefinite"/>
				</p:stCondLst>
				<p:childTnLst>
					<p:par>
						<p:cTn id="${id2}" fill="hold">
							<p:stCondLst>
								<p:cond delay="0"/>
							</p:stCondLst>
							<p:childTnLst>
								${group.join('\n')}
							</p:childTnLst>
						</p:cTn>
					</p:par>
				</p:childTnLst>
			</p:cTn>
		</p:par>`.trim();
                        });
                    }
                    else {
                        // allAtOnce: flatten all groups into single array
                        animationsArray = grouped.flat();
                    }
                }
                else {
                    // It's already a flat string[]
                    animationsArray = animations;
                }
            }
            else {
                // It's a single string
                animationsArray = [animations];
            }
            // Wrap according to sequence mode
            // NOTE: byParagraph with grouped structure is handled above
            // NOTE: sequenceModeForcedAllAtOnce flag removed to preserve user freedom
            if (sequence === 'byParagraph') {
                // This path is for legacy/fallback - should not be reached with grouped structure
                if (shouldSkipWrapper) {
                    // Return as-is, keep par wrappers intact
                    return animationsArray;
                }
                return animationsArray.map(animXml => {
                    const id1 = getNextAnimationId();
                    const id2 = getNextAnimationId();
                    return `
		<p:par>
			<p:cTn id="${id1}" fill="hold">
				<p:stCondLst>
					<p:cond delay="indefinite"/>
				</p:stCondLst>
				<p:childTnLst>
					<p:par>
						<p:cTn id="${id2}" fill="hold">
							<p:stCondLst>
								<p:cond delay="0"/>
							</p:stCondLst>
							<p:childTnLst>
								${animXml}
							</p:childTnLst>
						</p:cTn>
					</p:par>
				</p:childTnLst>
			</p:cTn>
		</p:par>`.trim();
                });
            }
            else {
                // allAtOnce: All animations in ONE wrapper (1 click, simultaneous play)
                // If shouldSkipWrapper, return animations WITHOUT indefinite wrapper
                if (shouldSkipWrapper) {
                    // REFACTORED (2026-01-27): For allAtOnce + afterPrevious/withPrevious:
                    // Return animations as SEPARATE items with marker indicating they share delay
                    // Add XML comment marker so gen-animations.ts knows these are siblings
                    const groupId = `allAtOnce_${Math.random().toString(36).substr(2, 9)}`;
                    console.log(`[ENGINE DEBUG] allAtOnce + ${trigger}: Adding markers ${groupId} for ${animationsArray.length} animations`);
                    return animationsArray.map((anim, idx) => {
                        // Prepend comment marker to each animation
                        return `<!-- ${groupId}_${idx} -->\n${anim}`;
                    });
                }
                const id1 = getNextAnimationId();
                const id2 = getNextAnimationId();
                // Check if we need to unwrap: only unwrap if animations are duplicates (same nodeType)
                // For allAtOnce, we MUST preserve wrappers if they contain explicit nodeType attributes
                // (e.g. withEffect) or if they are mixed. Unwrapping strips nodeType!
                const firstAnim = animationsArray[0] || '';
                const hasExplicitNodeType = animationsArray.some(a => a.includes('nodeType="'));
                const shouldKeepWrapped = hasExplicitNodeType;
                console.log(`[ENGINE DEBUG] allAtOnce: count=${animationsArray.length}, hasExplicitNodeType=${hasExplicitNodeType}, keepWrapped=${shouldKeepWrapped}`);
                if (!hasExplicitNodeType && animationsArray.length > 1) {
                    console.log(`[ENGINE DEBUG] Note: Unwrapping simple animations in allAtOnce sequence.`);
                }
                // If we have multiple animations that need unwrapping (same wrappers, no withEffect)
                const allContent = (animationsArray.length > 1 && !shouldKeepWrapped)
                    ? animationsArray.map(anim => {
                        // Extract the childTnLst content (set, animEffect, anim, etc.)
                        const match = anim.match(/<p:childTnLst>\s*([\s\S]*?)\s*<\/p:childTnLst>/m);
                        if (match) {
                            return match[1].trim();
                        }
                        console.warn('[allAtOnce] Could not unwrap animation:', anim.substring(0, 100));
                        return anim;
                    }).join('\n')
                    : animationsArray.join('\n');
                return [`
		<p:par>
			<p:cTn id="${id1}" fill="hold">
				<p:stCondLst>
					<p:cond delay="indefinite"/>
				</p:stCondLst>
				<p:childTnLst>
					<p:par>
						<p:cTn id="${id2}" fill="hold">
							<p:stCondLst>
								<p:cond delay="0"/>
							</p:stCondLst>
							<p:childTnLst>
								${allContent}
							</p:childTnLst>
						</p:cTn>
					</p:par>
				</p:childTnLst>
			</p:cTn>
		</p:par>`.trim()];
            }
        }
        catch (error) {
            console.error(`Error generating sequence animation:`, error);
            // Fallback to asOneObject
            const xml = buildAnimation(shapeId, animation, undefined, { skipGrpId });
            if (!xml)
                return [];
            const id1 = getNextAnimationId();
            const id2 = getNextAnimationId();
            const wrapped = `
		<p:par>
			<p:cTn id="${id1}" fill="hold">
				<p:stCondLst>
					<p:cond delay="indefinite"/>
				</p:stCondLst>
				<p:childTnLst>
					<p:par>
						<p:cTn id="${id2}" fill="hold">
							<p:stCondLst>
								<p:cond delay="0"/>
							</p:stCondLst>
							<p:childTnLst>
								${xml}
							</p:childTnLst>
						</p:cTn>
					</p:par>
				</p:childTnLst>
			</p:cTn>
		</p:par>`.trim();
            return [wrapped];
        }
    }
    throw new Error(`Unknown sequence mode: "${sequence}"`);
}
/**
 * Check if an effect is supported
 */
export function isEffectSupported(effect, type = 'entrance') {
    // We consider an effect supported if we can resolve it in the registry for the given type.
    // Note: for exit effects, the registry may store them as `${effect}-exit`.
    try {
        const meta = getAnimationMetadata(effect, type);
        return meta !== undefined;
    }
    catch (_a) {
        return false;
    }
}
/**
 * Get information about an effect
 */
export function getEffectInfo(effect) {
    const metadata = getAnimationMetadata(effect);
    if (!metadata) {
        return null;
    }
    return Object.assign({ supported: true }, metadata);
}
/**
 * List all supported effects
 */
export function listSupportedEffects() {
    const { getAllEffects } = require('./gen-animations-registry');
    return getAllEffects();
}
/**
 * List effects by category
 */
export function listEffectsByCategory(category) {
    const { getAnimationsByCategory } = require('./gen-animations-registry');
    return getAnimationsByCategory(category).map(config => Object.keys(require('./gen-animations-registry').ANIMATION_REGISTRY).find(key => require('./gen-animations-registry').ANIMATION_REGISTRY[key] === config)).filter(Boolean);
}
// ============================================================================
// SLIDE-LEVEL FUNCTIONS
// ============================================================================
/**
 * Generate complete animation timing structure for a slide
 * This wraps all animations in the proper PowerPoint timing hierarchy
 */
export function generateSlideTimingStructure(animationXmls) {
    if (!animationXmls || animationXmls.length === 0) {
        return '';
    }
    // Build the main sequence with all animations
    const mainSeqContent = animationXmls.join('\n');
    return `
		<p:timing>
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
								<p:nextCondLst>
									<p:cond evt="onClick" delay="0">
										<p:tgtEl>
											<p:sldTgt/>
										</p:tgtEl>
									</p:cond>
								</p:nextCondLst>
								<p:prevCondLst>
									<p:cond evt="onPrev" delay="0">
										<p:tgtEl>
											<p:sldTgt/>
										</p:tgtEl>
									</p:cond>
								</p:prevCondLst>
							</p:seq>
						</p:childTnLst>
					</p:cTn>
				</p:par>
			</p:tnLst>
		</p:timing>`;
}
/**
 * Reset animation IDs (call this for each new slide)
 */
export function resetSlideAnimations() {
    resetAnimationId();
}
// ============================================================================
// LEGACY COMPATIBILITY
// ============================================================================
/**
 * Generate animation using V3 engine (compatibility wrapper)
 * This maintains compatibility with existing code
 */
export function generateAnimationV3(shape, animation, shapeId) {
    try {
        return generateShapeAnimation(shape, animation, shapeId);
    }
    catch (error) {
        console.error(`V3 engine error:`, error);
        return undefined;
    }
}
/**
 * Check if effect can be generated by V3 engine
 */
export function canGenerateV3(effect, type = 'entrance') {
    return isEffectSupported(effect, type);
}
// ============================================================================
// BATCH OPERATIONS
// ============================================================================
/**
 * Generate animations for multiple shapes
 */
export function generateMultipleAnimations(shapes) {
    return shapes.map(({ shape, animation, shapeId }) => {
        try {
            return generateShapeAnimation(shape, animation, shapeId);
        }
        catch (error) {
            console.error(`Error generating animation for shape ${shapeId}:`, error);
            return '';
        }
    }).filter(xml => xml !== '');
}
/**
 * Validate all animations before generation
 */
export function validateAnimations(animations) {
    const { validateAnimation } = require('./gen-animations-registry');
    return animations.map(({ effect, direction }) => {
        const result = validateAnimation(effect, direction);
        return {
            effect,
            valid: result.valid,
            error: result.error
        };
    });
}
// ============================================================================
// DEBUGGING AND INTROSPECTION
// ============================================================================
/**
 * Get detailed information about the animation system
 */
export function getSystemInfo() {
    const effects = listSupportedEffects();
    const categories = ['entrance', 'exit', 'emphasis', 'motion-path'];
    return {
        version: '3.0.0-data-driven',
        supportedEffectsCount: effects.length,
        categories
    };
}
/**
 * Get animation catalog (for debugging)
 */
export function getAnimationCatalog() {
    const { ANIMATION_REGISTRY } = require('./gen-animations-registry');
    return ANIMATION_REGISTRY;
}
//# sourceMappingURL=gen-animations-engine-v3.js.map