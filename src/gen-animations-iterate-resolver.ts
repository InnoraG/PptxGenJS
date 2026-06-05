/**
 * Iterate Mode Resolver
 * 
 * Resolves sequence mode (asOneObject/allAtOnce/byParagraph) into iterate configuration.
 * This is PowerPoint's native approach to text-level animation.
 * 
 * @module gen-animations-iterate-resolver
 */

import { AnimationSequence } from './animation-timing-orchestrator'

type SequenceMode = AnimationSequence

/**
 * Iterate configuration for PowerPoint native text animation
 */
export interface IterateConfig {
  /** Whether iterate element should be added */
  enabled: boolean
  /** Iterate type: 'lt' (letter/word) or 'wd' (character) */
  type?: 'lt' | 'wd'
  /** Timing percentage (default: 100000 = 100%) */
  tmPct?: number
}

/**
 * Resolve sequence mode to iterate configuration
 * 
 * PowerPoint native behavior:
 * - asOneObject: No iterate element (all text animates together)
 * - byParagraph: iterate type="lt" (word-level iteration)
 * - allAtOnce: iterate type="lt" (word-level iteration, but with withPrevious grouping)
 * 
 * Note: The difference between byParagraph and allAtOnce is in nodeType/trigger,
 * not in the iterate element itself. Both use type="lt".
 * 
 * @param sequenceMode - The sequence mode from animation options
 * @returns Iterate configuration
 */
export function resolveIterateMode(sequenceMode?: SequenceMode): IterateConfig {
  // Default to asOneObject if not specified
  if (!sequenceMode || sequenceMode === 'asOneObject') {
    return { enabled: false }
  }

  // Both byParagraph and allAtOnce use iterate type="lt"
  if (sequenceMode === 'byParagraph' || sequenceMode === 'allAtOnce') {
    return {
      enabled: true,
      type: 'lt',  // letter/word level
      tmPct: 100000  // 100%
    }
  }

  // Fallback (should never reach here with typed inputs)
  return { enabled: false }
}

/**
 * Resolve iterate mode for character-level animation
 * 
 * This is a specialized version for byCharacter animation (not commonly used).
 * PowerPoint uses iterate type="wd" for character-level iteration.
 * 
 * @returns Iterate configuration for character-level animation
 */
export function resolveIterateModeByCharacter(): IterateConfig {
  return {
    enabled: true,
    type: 'wd',  // word/character level
    tmPct: 100000
  }
}
