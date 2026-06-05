/**
 * Shared utility functions for animation builders
 */

/**
 * Convert animation trigger to OOXML nodeType attribute value
 * 
 * @param trigger - The animation trigger ('onClick', 'afterPrevious', 'withPrevious')
 * @returns The corresponding nodeType value
 * 
 * PowerPoint nodeType values:
 * - 'clickEffect': Animation starts on mouse click (default)
 * - 'afterEffect': Animation starts after the previous animation completes
 * - 'withEffect': Animation starts at the same time as the previous animation
 */
export function getNodeTypeFromTrigger(trigger?: string): string {
	switch (trigger) {
		case 'afterPrevious':
			return 'afterEffect'
		case 'withPrevious':
			return 'withEffect'
		case 'onClick':
		default:
			return 'clickEffect'
	}
}

/**
 * Add # prefix to ppt_ variables for entrance animations ONLY.
 * Exit animations typically do NOT use # prefix.
 * This helper is ENTRANCE-ONLY and completely independent.
 */
export function addHashPrefixForEntrance(formula: string, isEntrance: boolean): string {
	if (!isEntrance) return formula  // Exit: return unchanged
	
	// Entrance: Add # prefix to all ppt_ variables (avoid double-prefixing)
	// Match ppt_[whxy] that is NOT already preceded by #
	return formula.replace(/(?<!#)(ppt_[whxy])/g, '#$1')
}

/**
 * ALWAYS add # prefix to ppt_ variables (both entrance and exit).
 * Used ONLY for specific effects that require # prefix in both directions.
 * Examples: Strips entrance+exit, certain custom builders.
 * This helper is completely independent from addHashPrefixForEntrance().
 */
export function addHashPrefix(formula: string): string {
	// Replace all ppt_ variables with #ppt_ (but avoid double-prefixing)
	// Match ppt_[whxy] that is NOT already preceded by #
	return formula.replace(/(?<!#)(ppt_[whxy])/g, '#$1')
}

/**
 * Get default delay for animations based on preset class
 * Returns the animation delay or 0 if not specified
 */
export function getDefaultDelay(presetClass: string, delay?: number): number {
	return delay !== undefined ? delay : 0
}

// getAnimationDelay() removed - delay should be registry-driven via config.defaultDelay
// Each effect in the registry can specify its own defaultDelay
// Builders use: animation.delay ?? config.defaultDelay ?? 0
