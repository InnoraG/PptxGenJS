/**
 * Iterate-Based Animation Engine (Alternative Path)
 * 
 * This module provides a SEPARATE, SIMPLER path for iterate-based animations.
 * It bypasses the complex engine-v3 logic and creates animations the PowerPoint-native way.
 * 
 * Key differences from engine-v3:
 * - Creates 1 animation (not N for paragraphs)
 * - Uses <p:iterate> element (not multiple animations)
 * - No complex wrapping logic
 * - Direct, clean structure
 * 
 * @module gen-animations-engine-iterate
 */

import { AnimationProps, ISlideObject } from './core-interfaces'
import { getNextAnimationId } from './gen-animations-ids'
import { buildAnimation, canBuildAnimation } from './gen-animations-builder'
import { resolveIterateMode } from './gen-animations-iterate-resolver'
import { buildIterateElement } from './gen-animations-iterate-builder'
import { injectIterateElement } from './gen-animations-xml-injector'

/**
 * Build animation with iterate support (PowerPoint native approach)
 * 
 * This function:
 * 1. Creates a SINGLE animation for the entire text
 * 2. Adds <p:iterate> element if needed (byParagraph/allAtOnce)
 * 3. Returns clean, simple structure
 * 
 * No complex wrapping, no multiple animations, no paragraph loops.
 * 
 * @param shapeId - Shape SPID
 * @param animation - Animation properties
 * @param skipGrpId - Skip grpId attribute (for internal use)
 * @returns Array with single animation XML string
 */
export function buildAnimationWithIterate(
  shapeId: number,
  animation: AnimationProps,
  skipGrpId?: boolean
): string[] {
  const { effect, sequence } = animation

  // Check if effect can be built
  if (!canBuildAnimation(effect)) {
    console.warn(`[iterate-engine] Cannot build animation: ${effect}`)
    return []
  }

  // Step 1: Build the base animation (for entire text, not per paragraph)
  // buildAnimation creates animation for the entire shape by default
  const baseXml = buildAnimation(shapeId, animation)

  if (!baseXml) {
    console.warn(`[iterate-engine] buildAnimation returned empty for ${effect}`)
    return []
  }

  // Step 2: Determine if we need iterate element
  const iterateConfig = resolveIterateMode(sequence)

  // Step 3: If no iterate needed (asOneObject), return base XML as-is
  if (!iterateConfig.enabled) {
    return [baseXml]
  }

  // Step 4: Build iterate element
  const iterateXml = buildIterateElement(iterateConfig)

  // Step 5: Inject iterate into animation
  const finalXml = injectIterateElement(baseXml, iterateXml)

  // Step 6: Return single animation (not N animations)
  return [finalXml]
}

/**
 * Check if animation should use iterate path
 * 
 * Determines if an animation should use the new iterate-based approach
 * vs the legacy engine-v3 approach.
 * 
 * Criteria:
 * - Must have sequence mode (byParagraph/allAtOnce)
 * - Must be text animation (not motion path, not media)
 * - Effect must support sequence modes
 * 
 * @param animation - Animation properties
 * @returns True if should use iterate path
 */
export function shouldUseIteratePath(animation: AnimationProps): boolean {
  const { sequence, effect, type } = animation

  // Only for sequence modes (not asOneObject)
  if (!sequence || sequence === 'asOneObject') {
    return false
  }

  // Not for motion paths (they have different structure)
  // Note: type can be undefined, 'entrance', 'exit', 'emphasis', 'motion', or 'media'
  if (type === 'motion') {
    return false
  }

  // Not for media animations
  if (effect === 'media' || effect === 'audio' || effect === 'video') {
    return false
  }

  // Use iterate path for byParagraph and allAtOnce
  return sequence === 'byParagraph' || sequence === 'allAtOnce'
}

/**
 * Feature flag to enable/disable iterate-based animations
 * 
 * Set this to true to use PowerPoint-native iterate approach.
 * Set to false to use legacy engine-v3 approach.
 * 
 * Default: false (use legacy for backward compatibility)
 */
export let ENABLE_ITERATE_ENGINE = false

/**
 * Enable iterate-based animation engine
 */
export function enableIterateEngine() {
  ENABLE_ITERATE_ENGINE = true
  console.log('[iterate-engine] Iterate-based animations ENABLED (PowerPoint native)')
}

/**
 * Disable iterate-based animation engine (use legacy)
 */
export function disableIterateEngine() {
  ENABLE_ITERATE_ENGINE = false
  console.log('[iterate-engine] Iterate-based animations DISABLED (using legacy engine-v3)')
}
