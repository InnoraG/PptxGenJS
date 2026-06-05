/**
 * Shared types for animation builders
 */

import { AnimationProps } from '../core-interfaces'
import type { AnimationConfig, AnimationDirection } from '../gen-animations-registry-types'
import type { TimingContext } from '../animation-timing-orchestrator'

// Re-export canonical types
export type { AnimationConfig, AnimationDirection }
export type { TimingContext }

export interface AnimationBuildContext {
	shapeId: number
	animation: AnimationProps
	config: AnimationConfig
	directionConfig?: AnimationDirection
	type: 'entrance' | 'exit' | 'emphasis' | 'motion' | 'media'
	ids: {
		main: number
		[key: string]: number
	}
	target?: {
		type: 'shape' | 'background' | 'paragraph'
		paragraphIndex?: number
	}
	multiplier?: number  // For motion paths
	sequence?: 'asOneObject' | 'allAtOnce' | 'byParagraph'  // Sequence mode for subtype determination
	grpId?: number  // Per-shape click group index (for bldLst coordination)
	nodeType?: string  // Node type for trigger-based animations (clickEffect, afterEffect, withEffect)

	// NEW (Opus Refactor): Pre-computed timing context from orchestrator
	// When provided, builders should use these values instead of computing their own
	timingContext?: TimingContext

	// Sequence utilities for builders that need custom logic (Strategy Pattern with Overrides)
	// buildSequenceAnimation provides these for animations in sequence modes
	// Individual builders can use these to override default behavior when needed
	sequenceUtils?: {
		isFirstAnimation: boolean      // Is this the first animation in the sequence?
		animationIndex: number          // Index in the sequence (0-based)
		totalAnimations: number         // Total animations in the sequence
		sequenceMode: 'asOneObject' | 'allAtOnce' | 'byParagraph'  // Current sequence mode
	}
}
