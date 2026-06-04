/**
 * Iterate-Based Animation Wrapper
 *
 * This module provides a higher-level API for creating animations with iterate support.
 * It wraps existing animation builders and injects the iterate element when needed.
 *
 * This is the main integration point between the existing animation system and
 * the new iterate-based approach.
 *
 * @module gen-animations-iterate-wrapper
 */
import { resolveIterateMode } from './gen-animations-iterate-resolver';
import { buildIterateElement } from './gen-animations-iterate-builder';
import { injectIterateElement } from './gen-animations-xml-injector';
/**
 * Wrap an animation builder function with iterate support
 *
 * This is a higher-order function that takes any animation builder
 * and returns a version that supports iterate elements.
 *
 * Example:
 * ```typescript
 * const fadeWithIterate = wrapWithIterate(buildFadeAnimation)
 * const xml = fadeWithIterate(shape, text, { sequenceMode: 'byParagraph' })
 * // Result: Fade animation XML with <p:iterate type="lt"> injected
 * ```
 *
 * @param builderFn - The animation builder function to wrap
 * @returns Wrapped function that adds iterate support
 */
export function wrapWithIterate(builderFn) {
    return (...args) => {
        // Extract options from last argument if it exists
        const lastArg = args[args.length - 1];
        const options = lastArg && typeof lastArg === 'object' && 'sequenceMode' in lastArg
            ? lastArg
            : {};
        // Call the original builder
        const baseXml = builderFn(...args);
        // If iterate is disabled, return base XML
        if (options.disableIterate) {
            return baseXml;
        }
        // Resolve iterate configuration
        const iterateConfig = resolveIterateMode(options.sequenceMode);
        // Build iterate element
        const iterateXml = buildIterateElement(iterateConfig);
        // Inject iterate element if needed
        if (iterateXml) {
            return injectIterateElement(baseXml, iterateXml);
        }
        return baseXml;
    };
}
/**
 * Add iterate element to existing animation XML
 *
 * This is a direct utility function for cases where you already have
 * animation XML and want to add iterate support.
 *
 * @param animationXml - Existing animation XML
 * @param sequenceMode - Sequence mode to determine iterate config
 * @returns Animation XML with iterate element (if applicable)
 */
export function addIterateToAnimation(animationXml, sequenceMode) {
    const iterateConfig = resolveIterateMode(sequenceMode);
    const iterateXml = buildIterateElement(iterateConfig);
    if (!iterateXml) {
        return animationXml;
    }
    return injectIterateElement(animationXml, iterateXml);
}
/**
 * Create animation with iterate support (functional approach)
 *
 * This is a more functional approach where you provide the builder function
 * and options together.
 *
 * @param builderFn - Animation builder function
 * @param args - Arguments for the builder function
 * @param options - Iterate options
 * @returns Animation XML with iterate element (if applicable)
 */
export function createAnimationWithIterate(builderFn, args, options) {
    const baseXml = builderFn(...args);
    if (options === null || options === void 0 ? void 0 : options.disableIterate) {
        return baseXml;
    }
    return addIterateToAnimation(baseXml, options === null || options === void 0 ? void 0 : options.sequenceMode);
}
//# sourceMappingURL=gen-animations-iterate-wrapper.js.map