/**
 * PptxGenJS: Animation ID Management
 *
 * Centralized ID counter for all animation engines.
 * This file has no dependencies to avoid circular imports.
 */
/**
 * Global animation ID counter for generating unique IDs
 * Each animation element needs a unique ID within the slide
 */
let globalAnimationId = 5; // Start from 5 (1-4 reserved for timing structure)
/**
 * Reset animation ID counter (called for each new slide)
 */
export function resetAnimationId() {
    globalAnimationId = 5;
}
/**
 * Get next unique animation ID
 * This function is used by BOTH legacy and registry engines
 * to ensure unique IDs across all animations
 */
export function getNextAnimationId() {
    // Start from 5 to avoid any conflict with standard IDs (1, 2)
    if (globalAnimationId < 5)
        globalAnimationId = 5;
    return globalAnimationId++;
}
/**
 * Get current animation ID (for debugging)
 */
export function getCurrentAnimationId() {
    return globalAnimationId;
}
//# sourceMappingURL=gen-animations-ids.js.map