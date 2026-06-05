/**
 * PptxGenJS: Animation Registry
 * Re-exports from the merged registry with standard names for backward compatibility
 */

// Re-export types
export type { AnimationDirection, AnimationConfig } from './gen-animations-registry-types'

import {
	ANIMATION_REGISTRY_MERGED,
	getAnimationConfigMerged,
	getAllEffectsMerged,
	TOTAL_ANIMATIONS
} from './gen-animations-registry-merged'

// Re-export with standard names
export const ANIMATION_REGISTRY = ANIMATION_REGISTRY_MERGED
export const getAnimationConfig = getAnimationConfigMerged
export const getAllEffects = getAllEffectsMerged

// Stub functions for compatibility (can be implemented if needed)
export function getAnimationsByCategory(category: string): string[] {
	return Object.keys(ANIMATION_REGISTRY_MERGED).filter(key => {
		const config = ANIMATION_REGISTRY_MERGED[key]
		return config.category === category
	})
}

export function validateAnimation(effect: string): boolean {
	return effect.toLowerCase() in Object.fromEntries(
		Object.entries(ANIMATION_REGISTRY_MERGED).map(([k, v]) => [k.toLowerCase(), v])
	)
}
