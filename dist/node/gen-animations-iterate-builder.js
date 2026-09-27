/**
 * Iterate Element Builder
 *
 * Builds the <p:iterate> XML element for PowerPoint native text animation.
 * The iterate element is injected INSIDE the animation <p:cTn> to enable
 * word-level or character-level iteration.
 *
 * @module gen-animations-iterate-builder
 */
/**
 * Build iterate element XML
 *
 * PowerPoint structure:
 * ```xml
 * <p:iterate type="lt">
 *   <p:tmPct val="100000"/>
 * </p:iterate>
 * ```
 *
 * Where:
 * - type="lt": Letter/word level iteration (for byParagraph/allAtOnce)
 * - type="wd": Word/character level iteration (for byCharacter)
 * - tmPct val="100000": Timing percentage (100% = 100000)
 *
 * @param config - Iterate configuration
 * @returns XML string for iterate element, or empty string if disabled
 */
export function buildIterateElement(config) {
    var _a;
    if (!config.enabled || !config.type) {
        return '';
    }
    const tmPct = (_a = config.tmPct) !== null && _a !== void 0 ? _a : 100000;
    return `<p:iterate type="${config.type}"><p:tmPct val="${tmPct}"/></p:iterate>`;
}
/**
 * Build iterate element with custom timing percentage
 *
 * Allows customization of the timing percentage for advanced use cases.
 * Most animations use 100% (100000), but this can be adjusted.
 *
 * @param type - Iterate type ('lt' or 'wd')
 * @param tmPct - Timing percentage (0-100000)
 * @returns XML string for iterate element
 */
export function buildIterateElementCustom(type, tmPct) {
    return buildIterateElement({
        enabled: true,
        type,
        tmPct
    });
}
//# sourceMappingURL=gen-animations-iterate-builder.js.map