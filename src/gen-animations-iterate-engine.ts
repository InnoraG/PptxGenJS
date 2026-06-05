/**
 * Iterate-Based Animation Engine
 * 
 * Integration point between the animation system and iterate functionality.
 * This module handles the orchestration of creating animations with iterate support.
 * 
 * @module gen-animations-iterate-engine
 */

import { AnimationSequence } from './animation-timing-orchestrator'
import { resolveIterateMode } from './gen-animations-iterate-resolver'
import { buildIterateElement } from './gen-animations-iterate-builder'
import { injectIterateElement } from './gen-animations-xml-injector'

/**
 * Animation builder function type
 * Represents any animation builder (buildFadeAnimation, buildFlyAnimation, etc.)
 */
type AnimationBuilderFn = (...args: any[]) => string

/**
 * Options for creating animation with iterate support
 */
export interface IterateEngineOptions {
  /** Sequence mode (asOneObject/allAtOnce/byParagraph) */
  sequence?: AnimationSequence
  /** Animation builder function */
  builderFn: AnimationBuilderFn
  /** Arguments for the animation builder */
  builderArgs: any[]
  /** Enable debug logging */
  debug?: boolean
}

/**
 * Create animation with iterate support
 * 
 * This is the main integration function that:
 * 1. Calls the animation builder to get base XML
 * 2. Resolves iterate configuration based on sequence mode
 * 3. Builds iterate element if needed
 * 4. Injects iterate into animation XML
 * 
 * @param options - Engine options
 * @returns Animation XML with iterate element (if applicable)
 */
export function createAnimationWithIterate(options: IterateEngineOptions): string {
  const { builderFn, builderArgs, sequence, debug } = options

  if (debug) {
    console.log('[iterate-engine] Creating animation with sequence:', sequence)
  }

  // Step 1: Call animation builder to get base XML
  const baseXml = builderFn(...builderArgs)

  if (debug) {
    console.log('[iterate-engine] Base XML length:', baseXml.length)
  }

  // Step 2: Resolve iterate configuration
  const iterateConfig = resolveIterateMode(sequence)

  if (debug) {
    console.log('[iterate-engine] Iterate config:', iterateConfig)
  }

  // Step 3: If no iterate needed, return base XML
  if (!iterateConfig.enabled) {
    if (debug) {
      console.log('[iterate-engine] No iterate needed, returning base XML')
    }
    return baseXml
  }

  // Step 4: Build iterate element
  const iterateXml = buildIterateElement(iterateConfig)

  if (debug) {
    console.log('[iterate-engine] Iterate XML:', iterateXml)
  }

  // Step 5: Inject iterate into animation XML
  const finalXml = injectIterateElement(baseXml, iterateXml)

  if (debug) {
    console.log('[iterate-engine] Final XML length:', finalXml.length)
  }

  return finalXml
}

/**
 * Create text animation with iterate support (convenience function)
 * 
 * This is a higher-level function specifically for text animations.
 * It handles the common case where you have a text shape and want to
 * apply an animation with sequence mode support.
 * 
 * @param builderFn - Animation builder function
 * @param args - Arguments for the builder
 * @param sequence - Sequence mode
 * @returns Animation XML with iterate
 */
export function createTextAnimation(
  builderFn: AnimationBuilderFn,
  args: any[],
  sequence?: AnimationSequence
): string {
  return createAnimationWithIterate({
    builderFn,
    builderArgs: args,
    sequence
  })
}

/**
 * Check if sequence mode requires iterate element
 * 
 * @param sequence - Sequence mode
 * @returns True if iterate element is needed
 */
export function requiresIterate(sequence?: AnimationSequence): boolean {
  const config = resolveIterateMode(sequence)
  return config.enabled
}

/**
 * Get iterate type for sequence mode
 * 
 * @param sequence - Sequence mode
 * @returns Iterate type ('lt' or 'wd') or null if no iterate
 */
export function getIterateType(sequence?: AnimationSequence): 'lt' | 'wd' | null {
  const config = resolveIterateMode(sequence)
  return config.type ?? null
}
