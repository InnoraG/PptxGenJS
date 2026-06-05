/**
 * PptxGenJS: Animation Generation V3 - Clean Architecture
 * 
 * This is the ONLY animation generation path. No legacy, no V2, just V3.
 * All animations are data-driven through the registry system.
 * 
 * Architecture:
 * - V3 Engine (gen-animations-engine-v3.ts): Main entry point
 * - Builder (gen-animations-builder.ts): Builds XML from registry config
 * - Registry (gen-animations-registry*.ts): Animation definitions
 */

import { AnimationProps, ISlideObject, PresSlide } from './core-interfaces'
import { getTemplate, remapSpidsInTimingXml } from './ui-truth/template-engine'
import {
	generateTextAnimation as generateTextAnimationV3,
	isEffectSupported as canGenerateV3
} from './gen-animations-engine-v3'
import { getNextAnimationId, resetAnimationId } from './gen-animations-ids'
import { generateSlideTimingStructuralWrapper } from './gen-animations-structural-wrapper'
import { buildAnimationFromTemplate } from './gen-animations-engine-dictionary'
import { hasAnimation } from './gen-animations-dictionary/index'
import { buildSequenceAnimation } from './animations-builders/buildSequenceAnimation'
import { ANIMATION_REGISTRY_MERGED } from './gen-animations-registry-merged'
// Media animation support (interactiveSeq) - isolated module for zero regression risk
import { genXmlTimingStructure } from './genXmlTimingStructure'
import { genXmlBuildList } from './gen-animations-buildlist'
import { isModel3DAnimationEffect } from './animations-builders/data3DAnimationTemplates'

// Re-export for backwards compatibility
export { genXmlBuildList } from './gen-animations-buildlist'

const VALID_TRIGGERS = new Set(['onClick', 'withPrevious', 'afterPrevious'] as const)
const VALID_SEQUENCES = new Set(['asOneObject', 'allAtOnce', 'byParagraph'] as const)

/**
 * STRUCTURAL CLICK GROUP ASSEMBLY (ALWAYS ACTIVE)
 * 
 * Uses the structural approach that correctly places afterEffect animations
 * as siblings of the delay="0" wrapper. This is the only path now.
 * Legacy regex-based approach has been removed.
 */

/**
 * Compute grpId map for all animations on a slide
 * 
 * grpId is per-shape animation index:
 * - Each animation on a shape gets an incrementing grpId (0, 1, 2, ...)
 * - This matches the bldP entries in bldLst which also use incrementing grpId
 * - Media animations are excluded (they don't have bldP entries)
 * 
 * @returns Map<shapeId, Map<animationIndex, grpId>>
 */
function computeGrpIdMap(animations: any[]): Map<number, Map<number, number>> {
	const result = new Map<number, Map<number, number>>()
	const shapeAnimCounters = new Map<number, number>() // animation counter per shape

	animations.forEach((anim, index) => {
		const shapeId = anim.shapeId
		const effect = anim.animation?.effect?.toLowerCase() || ''
		const animationType = anim.animation?.type || 'entrance'

		// Skip ALL media animations - they NEVER use grpId (regardless of triggers)
		// Media commands (play, pause, stop) use presetClass="mediacall" which doesn't use bldLst/grpId
		if (animationType === 'media' || effect.startsWith('media') ||
			effect === 'play' || effect === 'pause' || effect === 'togglepause' || effect === 'stop') return
		// Native 3D model animations never use grpId (reference has none)
		if (isModel3DAnimationEffect(effect)) return

		if (!result.has(shapeId)) {
			result.set(shapeId, new Map())
			shapeAnimCounters.set(shapeId, 0)
		}

		// Each animation on a shape gets the next grpId (0, 1, 2, ...)
		const currentGrpId = shapeAnimCounters.get(shapeId) ?? 0
		result.get(shapeId)!.set(index, currentGrpId)
		shapeAnimCounters.set(shapeId, currentGrpId + 1)
	})

	return result
}

/**
 * Check if bldLst will be generated for this slide
 * Mirrors logic in genXmlBuildList to ensure coordination
 */
function willGenerateBldLst(animations: any[]): boolean {
	if (!animations || animations.length === 0) return false

	// Count animations per shape (excluding ALL media animations)
	const shapeAnimCounts = new Map<number, number>()
	for (const anim of animations) {
		const animationType = anim.animation?.type || 'entrance'
		const effect = anim.animation?.effect?.toLowerCase() || ''
		// Skip ALL media animations - they NEVER contribute to bldLst/grpId
		if (animationType === 'media' || effect.startsWith('media') ||
			effect === 'play' || effect === 'pause' || effect === 'togglepause' || effect === 'stop') continue
		// Skip native 3D model animations - reference emits no bldLst for them
		if (isModel3DAnimationEffect(effect)) continue

		const count = shapeAnimCounts.get(anim.shapeId) || 0
		shapeAnimCounts.set(anim.shapeId, count + 1)
	}

	// Check if any shape has multiple animations
	const anyShapeHasMultipleAnims = Array.from(shapeAnimCounts.values()).some(count => count > 1)

	// Check if all are asOneObject
	const allAsOneObject = animations.every(anim => {
		const sequence = anim.animation?.sequence || 'asOneObject'
		const animationType = anim.animation?.type || 'entrance'
		const effect = anim.animation?.effect?.toLowerCase() || ''
		if (animationType === 'media' || effect.startsWith('media')) return true
		if (isModel3DAnimationEffect(effect)) return true
		return sequence === 'asOneObject'
	})

	// Check if all animations are onClick (no afterPrevious/withPrevious triggers)
	const allOnClick = animations.every(anim => {
		const trigger = anim.animation?.trigger || 'onClick'
		const animationType = anim.animation?.type || 'entrance'
		const effect = anim.animation?.effect?.toLowerCase() || ''
		if (animationType === 'media' || effect.startsWith('media')) return true
		if (isModel3DAnimationEffect(effect)) return true
		return trigger === 'onClick'
	})

	// bldLst generated if NOT (all asOneObject AND no multi-anim shapes AND all onClick)
	return !(allAsOneObject && !anyShapeHasMultipleAnims && allOnClick)
}

/**
 * Inject or remove grpId attribute in animation XML
 * 
 * Targets the FIRST <p:cTn> element that has presetID (the outer animation wrapper).
 * This avoids injecting into nested cTn elements.
 * 
 * Strategy:
 * - If shouldInject is FALSE: REMOVE any existing grpId (asOneObject with no bldLst)
 * - If shouldInject is TRUE:
 *   1. If grpId="X" already exists, replace it with correct value
 *   2. If no grpId exists but presetID does, inject grpId before presetID
 */
function injectGrpId(xml: string, grpId: number | undefined, shouldInject: boolean): string {
	const hasExistingGrpId = xml.includes('grpId="')

	// When NOT injecting, REMOVE any existing grpId from builders
	// This handles asOneObject animations with no bldLst
	if (!shouldInject) {
		if (hasExistingGrpId) {
			// Remove grpId="X" attribute (with optional leading space)
			return xml.replace(/ grpId="\d+"/g, '')
		}
		return xml
	}

	// shouldInject is TRUE - need to inject/update grpId
	if (grpId === undefined) return xml

	if (hasExistingGrpId) {
		// Replace first occurrence of grpId="X" with correct value
		return xml.replace(/grpId="\d+"/, `grpId="${grpId}"`)
	}

	// No existing grpId - inject before presetID on the first cTn that has presetID
	// Pattern: <p:cTn id="X" presetID="Y" ...> → <p:cTn id="X" grpId="Z" presetID="Y" ...>
	return xml.replace(
		/(<p:cTn\s+id="[^"]+"\s*)(presetID=)/,
		`$1grpId="${grpId}" $2`
	)
}

/**
 * Wrap animation XML in a <p:par> container for afterEffect/withEffect animations
 * 
 * PowerPoint wraps EACH animation in its own <p:par> container, even for 
 * afterEffect/withEffect animations. Our engine generates these flat, which
 * causes structural mismatches.
 * 
 * Reference structure:
 *   <p:par>                    ← Click group wrapper
 *     <p:par><p:cTn>           ← Individual wrapper (WHAT WE ADD)
 *       <p:par>...ANIM...      ← Animation content
 *     </p:cTn></p:par>
 *   </p:par>
 * 
 * @param xml - The animation XML to wrap
 * @param trigger - The trigger type ('onClick', 'afterPrevious', 'withPrevious')
 * @param getNextId - Function to get next animation ID
 * @returns Wrapped XML for non-click triggers, original XML for onClick
 */
function wrapInParContainer(xml: string, trigger: string, getNextId: () => number): string {
	// WRAPPING NOW HANDLED IN genXmlTimingStructure
	// The click group structure is built there with proper delay calculations.
	// This function now just returns the XML as-is - the grouping logic handles everything.
	//
	// Previous approach was wrong: we were adding wrappers to individual animations
	// but the wrappers need to be part of the click group structure with accumulated delays.
	return xml
}

function normalizeAndValidateAnimationProps(anim: AnimationProps): AnimationProps {
	const effect = (anim.effect || 'appear')
	const effectKey = effect.toLowerCase()
	const cfg = (ANIMATION_REGISTRY_MERGED as any)[effectKey] || {}

	// API PRECISION: Validate enums and throw helpful errors with suggestions
	if (anim.trigger && !VALID_TRIGGERS.has(anim.trigger as any)) {
		throw new Error(
			`Invalid animation.trigger="${anim.trigger}" for effect "${effectKey}". ` +
			`Valid options: ${Array.from(VALID_TRIGGERS).join(', ')}`
		)
	}
	if (anim.sequence && !VALID_SEQUENCES.has(anim.sequence as any)) {
		throw new Error(
			`Invalid animation.sequence="${anim.sequence}" for effect "${effectKey}". ` +
			`Valid options: ${Array.from(VALID_SEQUENCES).join(', ')}`
		)
	}

	// API PRECISION: Effects with supportsSequence: false only support 'asOneObject' mode
	// Throw helpful error if user tries to use paragraph-level sequence modes
	if (cfg.supportsSequence === false && anim.sequence && anim.sequence !== 'asOneObject') {
		throw new Error(
			`Effect "${effectKey}" does not support paragraph-level animation. ` +
			`You specified sequence="${anim.sequence}", but this effect only supports sequence="asOneObject" (whole shape).`
		)
	}

	// Handle special parameter mappings before validation
	// Wheel effect: spokes -> direction
	if (effectKey === 'wheel' && (anim as any).spokes !== undefined && !anim.direction) {
		anim.direction = String((anim as any).spokes) as any
	}

	// Direction aliases: toX -> fromX for effects that don't have explicit toX directions
	// NOTE: Some effects (like Fly) now have explicit toX directions with correct presetSubtypes.
	// For those, we should NOT alias. For effects without explicit toX, we still need aliasing.
	const dirAliasMap: Record<string, string> = {
		toTop: 'fromBottom',
		toBottom: 'fromTop',
		toLeft: 'fromRight',
		toRight: 'fromLeft',
		toTopLeft: 'fromBottomRight',
		toTopRight: 'fromBottomLeft',
		toBottomLeft: 'fromTopRight',
		toBottomRight: 'fromTopLeft',
	}
	const reverseAliases: Record<string, string> = {
		fromBottom: 'toTop',
		fromTop: 'toBottom',
		fromRight: 'toLeft',
		fromLeft: 'toRight',
		fromBottomRight: 'toTopLeft',
		fromBottomLeft: 'toTopRight',
		fromTopRight: 'toBottomLeft',
		fromTopLeft: 'toBottomRight',
	}

	// Determine direction aliasing behavior based on config flag or auto-detection
	// Priority: 1) Explicit config.directionAliasing, 2) Auto-detect from directions
	let shouldAlias = true // default: apply aliasing

	if (cfg.directionAliasing === 'none' || cfg.directionAliasing === 'preserve') {
		// Explicitly disabled aliasing
		shouldAlias = false
	} else if (cfg.directionAliasing === 'auto' || !cfg.directionAliasing) {
		// Auto-detect: check if effect has explicit toX directions
		const hasExplicitToDirections = Array.isArray(cfg.directions) &&
			cfg.directions.some((d: any) => d.name && d.name.toLowerCase().startsWith('to'))
		shouldAlias = !hasExplicitToDirections
	}

	// Only apply aliasing when shouldAlias is true
	const dirAliases: Record<string, string> = shouldAlias ? dirAliasMap : {}

	// Validate direction if effect supports it
	if (cfg.supportsDirection) {
		const allowedDirs: string[] = Array.isArray(cfg.directions)
			? cfg.directions.map((d: any) => d.name).filter(Boolean)
			: []

		// Build context-aware direction suggestions based on animation type
		const isExitAnimation = anim.type === 'exit'
		const buildDirectionHint = (dirs: string[]): string => {
			return dirs.map(dir => {
				// For exit animations, show "toX" form; for entrance, show "fromX" form
				if (isExitAnimation && reverseAliases[dir]) {
					return reverseAliases[dir]
				}
				return dir
			}).join(', ')
		}

		if (!anim.direction) {
			// Use defaultDirection from registry if available
			if (cfg.defaultDirection) {
				anim.direction = cfg.defaultDirection
			} else if (allowedDirs.length > 0) {
				// API PRECISION: Throw helpful error with valid options
				const paramHint = effectKey === 'wheel' ? ' (or use spokes: 1|2|3|4|8)' : ''
				const animType = isExitAnimation ? 'exit' : 'entrance'
				throw new Error(
					`Missing required animation.direction for ${animType} effect "${effectKey}"${paramHint}. ` +
					`Valid options: ${buildDirectionHint(allowedDirs)}`
				)
			}
		} else {
			// Normalize aliases before validation
			const normalized = dirAliases[anim.direction as string] || anim.direction
			if (normalized !== anim.direction) {
				anim.direction = normalized as any
			}

			// Validate provided (possibly normalized) direction - case-insensitive
			const dirLower = (anim.direction as string).toLowerCase()
			const allowedDirsLower = allowedDirs.map(d => d.toLowerCase())
			if (allowedDirs.length > 0 && !allowedDirsLower.includes(dirLower)) {
				// API PRECISION: Throw helpful error with valid options
				const animType = isExitAnimation ? 'exit' : 'entrance'
				throw new Error(
					`Invalid animation.direction="${anim.direction}" for ${animType} effect "${effectKey}". ` +
					`Valid options: ${buildDirectionHint(allowedDirs)}`
				)
			}
			// Normalize direction to canonical case from registry
			const canonicalIndex = allowedDirsLower.indexOf(dirLower)
			if (canonicalIndex >= 0) {
				anim.direction = allowedDirs[canonicalIndex] as any
			}
		}
	}

	return anim
}


/**
 * Animation Preset IDs (from ECMA-376)
 * Maps user-friendly names to PowerPoint presetID values
 */
export const ANIMATION_PRESET_IDS = {
	// Entrance Effects
	appear: 1, fly: 2, blinds: 3, box: 4, checkerboard: 5,
	circle: 6, crawl: 7, diamond: 8, dissolve: 9, peek: 10,
	lighten: 11, randomBars: 12, plus: 13, strips: 14, wedge: 15,
	wheel: 16, wipe: 17, zoom: 18, split: 19, fade: 20,
	swivel: 21, float: 22, spiral: 23, randomEffects: 24,
	// Emphasis Effects
	spin: 8, growShrink: 26, desaturate: 27, darken: 28, lightenEmph: 29,
	transparency: 30, growAndTurn: 31, colorPulse: 32, complementaryColor: 33,
	complementaryColor2: 34, contrastingColor: 35, // More emphasis effects...
	// Exit Effects (same presetID, different presetClass)
	// Motion Path Effects
	// ... (keep existing mapping)
} as const

/**
 * UI-Truth template detection and application
 * Some effects (Float, Zoom with VP) require special timing templates
 */
function tryApplyUiTruthTimingTemplates(slide: PresSlide): string | null {
	if (!slide._animations || slide._animations.length === 0) return null

	const effects = slide._animations.map(a => String((a.animation as any)?.effect || '').toLowerCase())
	const dirs = slide._animations.map(a => String((a.animation as any)?.direction || '').toLowerCase())

	let templateKey: string | null = null
	// DISABLED: Float now uses registry-driven V3 engine instead of hardcoded template (presetId 30)
	// if (effects.includes('float')) {
	// 	templateKey = 'float_inout_timing'
	// }
	// DISABLED: Zoom now uses registry-driven V3 engine instead of hardcoded template
	// else if (effects.includes('zoom') && dirs.some(d => d.includes('objectcenter') || d.includes('slidecenter'))) {
	// 	templateKey = 'zoom_vp_timing'
	// }
	if (!templateKey) return null

	// Remap template spids to actual shape ids
	// Preserve user-specified animation order (no sorting) - shapes are mapped in the order they were added
	const shapeIds = Array.from(new Set(slide._animations.map(a => String(a.shapeId))))
	const tpl = getTemplate(templateKey)
	// Template SPIDs are extracted in document order (no sorting needed)
	const tplSpids = Array.from(new Set((tpl.match(/spid=\"(\d+)\"/g) || []).map(m => m.match(/\"(\d+)\"/)?.[1]).filter(Boolean) as string[]))
	if (shapeIds.length < tplSpids.length) return null

	const shapeIdSet = new Set(shapeIds)
	const spidRemap: Record<string, string> = {}
	let cursor = 0
	for (let i = 0; i < tplSpids.length; i++) {
		const tplSpid = tplSpids[i]
		if (shapeIdSet.has(tplSpid)) {
			spidRemap[tplSpid] = tplSpid
			continue
		}
		while (cursor < shapeIds.length && Object.values(spidRemap).includes(shapeIds[cursor])) cursor++
		if (cursor >= shapeIds.length) return null
		spidRemap[tplSpid] = shapeIds[cursor]
		cursor++
	}

	return remapSpidsInTimingXml(tpl, spidRemap)
}

/**
 * Add animation to a slide object
 */
export function addAnimation(
	slide: PresSlide,
	target: ISlideObject,
	shapeId: number,
	animation: AnimationProps | AnimationProps[],
	paragraphCount?: number
): void {
	if (!slide._animations) {
		slide._animations = []
	}

	const animations = Array.isArray(animation) ? animation : [animation]

	animations.forEach(anim => {
		slide._animations!.push({
			target: target,
			animation: anim,
			shapeId,
			paragraphCount: paragraphCount || 1,
		})
	})
}

/**
 * Generate animation XML for a single animation object
 * V3 ONLY PATH - no fallbacks, no legacy
 * 
 * @param animData - Animation data
 * @param options - Options for generation
 * @param options.skipGrpId - When true, omit grpId attribute (for Multiple Animation Principle)
 * @param options.skipIndefiniteWrapper - When true, skip delay="indefinite" wrapper (for auto-play)
 */
export function genXmlAnimationForObject(animData: {
	target: ISlideObject
	animation: AnimationProps
	shapeId: number
	paragraphCount?: number
}, options?: { skipGrpId?: boolean, skipIndefiniteWrapper?: boolean }): string | string[] {
	const { animation, shapeId, paragraphCount = 1 } = animData
	// For motion paths, use motionPath property instead of effect
	const effect = (animation.type === 'motion' && animation.motionPath)
		? animation.motionPath
		: (animation.effect || 'appear')
	const type = animation.type
	const skipGrpId = options?.skipGrpId ?? false
	const skipIndefiniteWrapper = options?.skipIndefiniteWrapper ?? false

	// DICTIONARY ENGINE: Template-based generation (highest priority)
	// DISABLED: Dictionary templates have hardcoded values that don't generalize across directions/modes
	// Keeping for future when templates can be properly parameterized
	const effectName = effect.charAt(0).toUpperCase() + effect.slice(1) // Capitalize first letter
	const sequenceMode = (animation.sequence || 'asOneObject') as 'asOneObject' | 'byParagraph' | 'allAtOnce'

	if ((animation as any).useDictionaryEngine === true && false) { // DISABLED
		// Check if template exists
		if (hasAnimation(type as 'entrance' | 'exit', effectName)) {
			try {
				console.log(`[Dictionary Engine] Using template for ${type}/${effectName}, sequence=${sequenceMode}, paragraphs=${paragraphCount}`)

				if (sequenceMode === 'asOneObject') {
					// Single animation for whole shape
					const request = {
						type: type as 'entrance' | 'exit',
						effectName: effectName,
						direction: animation.direction,
						sequenceMode: 'asOneObject' as const,
						spid: shapeId,
						duration: animation.duration || 500,
						delay: animation.delay || 0,
						paragraphIndex: undefined
					}

					const dictResult = buildAnimationFromTemplate(request)

					// Wrap in double-wrapper (indefinite delay structure)
					const wrappedXml = `
						<p:par>
							<p:cTn id="${getNextAnimationId()}" fill="hold">
								<p:stCondLst>
									<p:cond delay="indefinite"/>
								</p:stCondLst>
								<p:childTnLst>
									<p:par>
										<p:cTn id="${getNextAnimationId()}" fill="hold">
											<p:stCondLst>
												<p:cond delay="0"/>
											</p:stCondLst>
											<p:childTnLst>
												${dictResult}
											</p:childTnLst>
										</p:cTn>
									</p:par>
								</p:childTnLst>
							</p:cTn>
						</p:par>
					`.trim()

					return [wrappedXml]
				} else if (sequenceMode === 'byParagraph') {
					// Generate separate animations for base + each paragraph
					const animations: string[] = []

					// Base shape animation (with <p:bg/>)
					const baseRequest = {
						type: type as 'entrance' | 'exit',
						effectName: effectName,
						direction: animation.direction,
						sequenceMode: 'byParagraph' as const,
						spid: shapeId,
						duration: animation.duration || 500,
						delay: animation.delay || 0,
						paragraphIndex: undefined // Base shape
					}
					animations.push(buildAnimationFromTemplate(baseRequest))

					// Paragraph animations (with <p:txEl>)
					for (let p = 0; p < paragraphCount; p++) {
						const paraRequest = {
							type: type as 'entrance' | 'exit',
							effectName: effectName,
							direction: animation.direction,
							sequenceMode: 'byParagraph' as const,
							spid: shapeId,
							duration: animation.duration || 500,
							delay: animation.delay || 0,
							paragraphIndex: p
						}
						animations.push(buildAnimationFromTemplate(paraRequest))
					}

					// Wrap each in double-wrapper separately
					return animations.map(anim => `
						<p:par>
							<p:cTn id="${getNextAnimationId()}" fill="hold">
								<p:stCondLst>
									<p:cond delay="indefinite"/>
								</p:stCondLst>
								<p:childTnLst>
									<p:par>
										<p:cTn id="${getNextAnimationId()}" fill="hold">
											<p:stCondLst>
												<p:cond delay="0"/>
											</p:stCondLst>
											<p:childTnLst>
												${anim}
											</p:childTnLst>
										</p:cTn>
									</p:par>
								</p:childTnLst>
							</p:cTn>
						</p:par>
					`.trim())
				} else if (sequenceMode === 'allAtOnce') {
					// allAtOnce: Use V3 engine (not dictionary) to preserve correct presetSubtype
					const allAtOnceXml = generateTextAnimationV3(shapeId, animation, paragraphCount)

					// Wrap in double-wrapper (template already has clickEffect/withEffect nodes)
					const wrappedXml = `
						<p:par>
							<p:cTn id="${getNextAnimationId()}" fill="hold">
								<p:stCondLst>
									<p:cond delay="indefinite"/>
								</p:stCondLst>
								<p:childTnLst>
									<p:par>
										<p:cTn id="${getNextAnimationId()}" fill="hold">
											<p:stCondLst>
												<p:cond delay="0"/>
											</p:stCondLst>
											<p:childTnLst>
												${allAtOnceXml}
											</p:childTnLst>
										</p:cTn>
									</p:par>
								</p:childTnLst>
							</p:cTn>
						</p:par>
					`.trim()

					return [wrappedXml]
				}
			} catch (error) {
				console.error(`Dictionary engine error for '${effectName}':`, error)
				// Fall through to V3 engine
			}
		} else {
			console.warn(`[Dictionary Engine] Template not found for ${type}/${effectName}, falling back to V3`)
		}
	}

	// V3 ENGINE: Data-driven registry-based generation
	if (canGenerateV3(effect, type as any)) {
		try {
			// V3 ALWAYS returns string[] with ALL wrapping done internally
			const v3Result = generateTextAnimationV3(shapeId, animation, paragraphCount, { skipGrpId, skipIndefiniteWrapper })
			if (v3Result && v3Result.length > 0) {
				return v3Result
			}
		} catch (error) {
			console.error(`V3 engine error for '${effect}':`, error)
			throw error // No fallback - if V3 fails, we want to know
		}
	}

	// Effect not supported - throw error instead of silent fallback
	throw new Error(
		`Animation effect "${effect}" is not supported. Check ANIMATION_API_GUIDE.md for supported effects.`
	)
}

/**
 * Determine which shapeIds should skip grpId/bldP
 * 
 * Rules:
 * 1. Shapes with multiple API-level animations (e.g., entrance + exit array)
 * 2. Shapes with effects that don't support sequence modes (supportsSequence: false)
 * 3. Effects that generate multiple internal spTgt elements (like fade with set+animEffect)
 *    when mixed with simpler effects on the same slide
 * 
 * Rule 3 is needed because when complex effects (with multiple sub-elements) are mixed
 * with simple effects on the same slide, the bldP/grpId mechanism can cause playback issues.
 */
function getShapeIdsToSkipBldP(animations: any[]): Set<number> {
	const skipSet = new Set<number>()

	// Count API-level animations per shape
	const shapeAnimationCounts = new Map<number, number>()
	for (const anim of animations) {
		const count = shapeAnimationCounts.get(anim.shapeId) || 0
		shapeAnimationCounts.set(anim.shapeId, count + 1)
	}

	// Detect if slide has mixed complexity (some effects with subAnimationCount > 1, some with 1)
	// This is important because complex effects mixed with simple ones need special handling
	let hasSimpleEffects = false
	let hasComplexEffects = false
	const complexShapeIds = new Set<number>()

	for (const anim of animations) {
		const effect = anim.animation?.effect?.toLowerCase() || ''
		// Registry keys may be camelCase (e.g., 'floatIn') or lowercase (e.g., 'floatoutentrance')
		// Try lowercase first, then original effect name
		const effectConfig = (ANIMATION_REGISTRY_MERGED as any)[effect] || (ANIMATION_REGISTRY_MERGED as any)[anim.animation?.effect || ''] || {}
		const elementOrder = effectConfig.metadata?.elementOrder || []
		const subAnimationCount = effectConfig.subAnimationCount || elementOrder.length || 1


		if (subAnimationCount > 1) {
			hasComplexEffects = true
			complexShapeIds.add(anim.shapeId)
		} else {
			hasSimpleEffects = true
		}
	}


	const hasMixedComplexity = hasSimpleEffects && hasComplexEffects

	for (const anim of animations) {
		const shapeId = anim.shapeId
		const effect = anim.animation?.effect?.toLowerCase() || ''

		// Rule 1: Skip shapes with multiple API-level animations
		const animCountForShape = shapeAnimationCounts.get(shapeId) || 1
		if (animCountForShape > 1) {
			skipSet.add(shapeId)
			continue
		}

		// Rule 2: Skip effects that don't support sequence modes
		const effectConfig = ANIMATION_REGISTRY_MERGED[effect] as any || {}
		const supportsSequence = effectConfig.supportsSequence !== false
		if (!supportsSequence) {
			skipSet.add(shapeId)
			continue
		}

		// Rule 3: When slide has mixed complexity (simple + complex effects),
		// skip bldP for complex effects to avoid playback issues
		if (hasMixedComplexity && complexShapeIds.has(shapeId)) {
			skipSet.add(shapeId)
		}
	}


	return skipSet
}

/**
 * Generate XML for slide animations
 * Main entry point
 */
export function genXmlAnimations(slide: PresSlide): string {
	resetAnimationId()

	// Check for raw timing XML passthrough first
	if (slide._rawTimingXml) {
		console.log('[genXmlAnimations] Using raw timing XML passthrough (unsupported animations)')
		return slide._rawTimingXml
	}

	if (!slide._animations || slide._animations.length === 0) {
		console.log('[genXmlAnimations] No animations on slide')
		return ''
	}

	console.log(`[genXmlAnimations] Processing ${slide._animations.length} animations`)

	// STRUCTURAL PATH: Always use structural wrapper (only path)
	console.log('[genXmlAnimations] Using STRUCTURAL click group assembly')
	console.log('DEBUG: GEN-ANIMATIONS REBUILD CHECK ' + Date.now())
	return generateSlideTimingStructuralWrapper(slide)

	// LEGACY CODE BELOW - NO LONGER REACHED
	// Keeping temporarily for reference during transition
	// TODO: Remove after all batches verified with structural path

	// Check for UI-truth timing templates first
	const uiTruthTiming = tryApplyUiTruthTimingTemplates(slide)
	if (uiTruthTiming) {
		console.log('[genXmlAnimations] Using UI-truth template')
		return uiTruthTiming
	}

	// Determine which shapes should skip grpId/bldP
	const shapeIdsToSkipBldP = getShapeIdsToSkipBldP(slide._animations)

	// MULTIPLE ANIMATION PRINCIPLE:
	// Detect if any shape has multiple animations (e.g., entrance + exit on same shape)
	// When this happens, grpId/bldP must NOT be used for those shapes
	const shapeAnimationCounts = new Map<number, number>()
	for (const anim of slide._animations) {
		const count = shapeAnimationCounts.get(anim.shapeId) || 0
		shapeAnimationCounts.set(anim.shapeId, count + 1)
	}
	const hasMultipleAnimationsPerShape = Array.from(shapeAnimationCounts.values()).some(count => count > 1)

	if (hasMultipleAnimationsPerShape) {
		console.log('[genXmlAnimations] MULTIPLE ANIMATION PRINCIPLE: Shapes have multiple animations, skipping grpId/bldP')
	}

	// AUTO-PLAY DETECTION:
	// If ALL animations use non-click triggers (afterPrevious/withPrevious),
	// they should share ONE click group instead of each having their own
	const hasAnyClickTrigger = slide._animations.some(anim => {
		const trigger = anim.animation?.trigger
		return !trigger || trigger === 'onClick'
	})
	const skipIndefiniteWrapper = !hasAnyClickTrigger && hasMultipleAnimationsPerShape

	if (skipIndefiniteWrapper) {
		console.log('[genXmlAnimations] AUTO-PLAY: All animations use non-click triggers, sharing ONE click group')
	}

	// GRPID COMPUTATION (Single Source of Truth):
	// Compute grpId map ONCE here, coordinated with bldLst generation
	const grpIdMap = computeGrpIdMap(slide._animations)
	const hasBldLst = willGenerateBldLst(slide._animations)

	if (hasBldLst) {
		console.log('[genXmlAnimations] bldLst will be generated, injecting grpId into animations')
	}

	// Generate animations using V3 engine
	// Pass per-shape skipGrpId information
	// Always-on validation + default filling:
	// - Missing required params (e.g., direction) are filled deterministically
	// - Invalid enum values throw (hard error)
	// 
	// ANIMATION ORDER: Preserve user-specified order (no sorting)
	// Animations are processed in the exact order they were added to the slide
	//
	// TRIGGER HANDLING:
	// - onClick: Gets indefinite wrapper (creates clickEffect nodeType)
	// - withPrevious/afterPrevious: Skips indefinite wrapper (creates withEffect/afterEffect nodeType)
	//
	// MAPPING FIX: We must return objects { xml, anim } to preserve the link between
	// generated XML chunks and their source animation properties.
	const allAnimationsXml = slide._animations
		.flatMap((anim, index) => {
			// Normalize/validate animation props
			anim.animation = normalizeAndValidateAnimationProps(anim.animation)

			const shouldSkipGrpId = shapeIdsToSkipBldP.has(anim.shapeId)
			// Per-animation check: skip indefinite wrapper for withPrevious/afterPrevious triggers
			const trigger = anim.animation?.trigger || 'onClick'
			const animSkipIndefiniteWrapper = trigger === 'withPrevious' || trigger === 'afterPrevious'
			const xmlResult = genXmlAnimationForObject(anim, { skipGrpId: shouldSkipGrpId, skipIndefiniteWrapper: animSkipIndefiniteWrapper })
			console.log(`[genXmlAnimations] Generated XML for ${anim.animation.effect}: ${Array.isArray(xmlResult) ? xmlResult.length : 'string'} items`)

			// DEBUG: Check for withEffect in output
			const xmlStr = Array.isArray(xmlResult) ? xmlResult.join('\n') : xmlResult as string;
			if (xmlStr.includes('nodeType="withEffect"')) {
				console.log(`[DEBUG XML] FOUND withEffect in ${anim.animation.effect}`);
			} else if (anim.animation.sequence === 'allAtOnce') {
				console.log(`[DEBUG XML] MISSING withEffect in allAtOnce ${anim.animation.effect}! Content snippet: ${xmlStr.substring(0, 300)}...`);
			}

			// Get computed grpId for this animation
			const grpId = grpIdMap.get(anim.shapeId)?.get(index)
			// Inject grpId if bldLst exists AND grpId was computed
			const shouldInjectGrpId = hasBldLst && grpId !== undefined

			// Post-process and map to source animation
			let processedXmls: string[] = []

			if (Array.isArray(xmlResult)) {
				processedXmls = xmlResult.map(x => {
					let processed = injectGrpId(x, grpId, shouldInjectGrpId)
					processed = wrapInParContainer(processed, trigger, getNextAnimationId)
					return processed
				})
			} else if (xmlResult.length > 0) {
				let processed = injectGrpId(xmlResult, grpId, shouldInjectGrpId)
				processed = wrapInParContainer(processed, trigger, getNextAnimationId)
				processedXmls = [processed]
			}

			// Return objects linking XML to source animation
			return processedXmls.map((xml, subIndex) => ({
				xml,
				anim, // The source animation object
				index, // Index in slide._animations
				subIndex // Index within this expansion (0=bg, 1=para0, etc.)
			}))
		})

	console.log(`[genXmlAnimations] Total animations XML: ${allAnimationsXml.length}`)

	if (allAnimationsXml.length === 0) {
		console.log('[genXmlAnimations] No animations generated!')
		return ''
	}

	const result = genXmlTimingStructure(allAnimationsXml, hasMultipleAnimationsPerShape, skipIndefiniteWrapper, shapeIdsToSkipBldP, slide._slideObjects)
	console.log(`[genXmlAnimations] Returning ${result.length} characters of XML`)
	return result
}

/*
 * genXmlBuildList moved to gen-animations-buildlist.ts to break circular dependency
 * Now imported and re-exported above
 * 
 * Keeping the old implementation commented out for reference during transition
 */
/*
function genXmlBuildList_OLD_REMOVED(animations: any[], skipBuildList: boolean = false, shapeIdsToSkipBldP: Set<number> = new Set()): string {
	if (!animations || animations.length === 0) return ''

	// Check if ALL animations are asOneObject AND no shape has multiple animations
	// If shapes have multiple animations (entrance + exit), they need bldLst with grpId
	// This matches PowerPoint behavior where shape-only effects (no paragraph targeting) 
	// don't generate any bldLst entries, UNLESS they have multiple animations
	
	// First, count animations per shape (excluding ALL media animations)
	const shapeAnimCounts = new Map<number, number>()
	for (const anim of animations) {
		const animationType = anim.animation?.type || 'entrance'
		const effect = anim.animation?.effect?.toLowerCase() || ''
		// Skip ALL media animations - they NEVER contribute to bldLst/grpId
		if (animationType === 'media' || effect.startsWith('media') ||
			effect === 'play' || effect === 'pause' || effect === 'togglepause' || effect === 'stop') continue
		
		const count = shapeAnimCounts.get(anim.shapeId) || 0
		shapeAnimCounts.set(anim.shapeId, count + 1)
	}
	
	// Check if any shape has multiple animations
	const anyShapeHasMultipleAnims = Array.from(shapeAnimCounts.values()).some(count => count > 1)
	
	const allAsOneObject = animations.every(anim => {
		const sequence = anim.animation?.sequence || 'asOneObject'
		const animationType = anim.animation?.type || 'entrance'
		const effect = anim.animation?.effect?.toLowerCase() || ''
		// Skip media animations in this check
		if (animationType === 'media' || effect.startsWith('media')) {
			return true // Don't count media against the check
		}
		return sequence === 'asOneObject'
	})
	
	// Skip bldLst only if ALL are asOneObject AND no shape has multiple animations
	// AND all animations are onClick (no afterPrevious/withPrevious triggers)
	const allOnClick = animations.every(anim => {
		const trigger = anim.animation?.trigger || 'onClick'
		const animationType = anim.animation?.type || 'entrance'
		const effect = anim.animation?.effect?.toLowerCase() || ''
		// Skip media animations in this check
		if (animationType === 'media' || effect.startsWith('media')) {
			return true
		}
		return trigger === 'onClick'
	})
	
	if (allAsOneObject && !anyShapeHasMultipleAnims && allOnClick) {
		// No bldLst needed when all animations target whole shapes with single animation per shape
		// AND all use onClick triggers
		return ''
	}

	// For shapes with multiple animations (entrance + exit), we need MULTIPLE bldP entries
	// with incrementing grpId values (0 for first animation, 1 for second, etc.)
	// 
	// Structure: Map<shapeId, Array<{grpId, animBgAttr, buildAttr, uiExpand}>>
	const bldPByShape: Map<number, Array<{ grpId: number; animBgAttr: string; buildAttr: string; uiExpand: boolean }>> = new Map()
	const shapeGrpIdCounter: Map<number, number> = new Map()

	for (const anim of animations) {
		const shapeId = anim.shapeId
		const effect = anim.animation?.effect?.toLowerCase() || ''
		const animationType = anim.animation?.type || 'entrance'
		const sequence = anim.animation?.sequence || 'asOneObject'
		const uiExpand = anim.animation?.uiExpand === true
		
		// Skip media animations - they NEVER need bldP entries (regardless of triggers)
		// Media commands (play, pause, stop) use presetClass="mediacall" which doesn't use bldLst
		if (animationType === 'media' || effect.startsWith('media') || 
			effect === 'play' || effect === 'pause' || effect === 'togglepause' || effect === 'stop') {
			continue
		}
		
		// Get effect config from registry
		const effectConfig = ANIMATION_REGISTRY_MERGED[effect] as any || {}
		const isEmphasis = animationType === 'emphasis' || effectConfig.presetClass === 'emph'
		const requiresParagraphTargeting = effectConfig.requiresParagraphTargeting === true
		
		// Determine if animBg="1" should be added
		let includeAnimBg = true
		if (isEmphasis) {
			if (sequence === 'asOneObject') {
				includeAnimBg = true
			} else {
				includeAnimBg = !requiresParagraphTargeting
			}
		}
		const animBgAttr = includeAnimBg ? ' animBg="1"' : ''
		
		// Determine build attribute based on sequence mode
		// - asOneObject: No build attribute (whole shape animates as one)
		// - allAtOnce: build="allAtOnce" (all paragraphs animate simultaneously)
		// - byParagraph: build="p" (each paragraph requires a click)
		let buildAttr = ''
		if (sequence === 'allAtOnce') {
			buildAttr = ' build="allAtOnce"'
		} else if (sequence === 'byParagraph') {
			buildAttr = ' build="p"'
		}
		
		// Get current grpId for this shape and increment for next animation
		const currentGrpId = shapeGrpIdCounter.get(shapeId) || 0
		shapeGrpIdCounter.set(shapeId, currentGrpId + 1)
		
		// Add bldP entry for this animation
		if (!bldPByShape.has(shapeId)) {
			bldPByShape.set(shapeId, [])
		}
		bldPByShape.get(shapeId)!.push({ grpId: currentGrpId, animBgAttr, buildAttr, uiExpand })
	}

	if (bldPByShape.size === 0) return ''

	// Sort by shapeId ascending (bldLst must be in shape creation order)
	const sortedShapeIds = Array.from(bldPByShape.keys()).sort((a, b) => a - b)
	
	// Build bldP elements - each animation for each shape gets its own entry
	const buildElements: string[] = []
	for (const shapeId of sortedShapeIds) {
		const entries = bldPByShape.get(shapeId)!
		for (const entry of entries) {
			const uiExpandAttr = entry.uiExpand ? ' uiExpand="1"' : ''
			buildElements.push(`<p:bldP spid="${shapeId}" grpId="${entry.grpId}"${uiExpandAttr}${entry.buildAttr}${entry.animBgAttr}/>`)
		}
	}

	const result = `
		<p:bldLst>
			${buildElements.join('\n')}
		</p:bldLst>
	`.trim()
	
	return result
}
*/

// Re-export V3 engine functions
export { canGenerateV3 as isEffectSupportedV3 }

// Re-export registry and builder functions
export {
	getAnimationConfig,
	getAnimationsByCategory,
	validateAnimation,
	getAllEffects,
	ANIMATION_REGISTRY
} from './gen-animations-registry'

export {
	buildAnimation,
	canBuildAnimation,
	getAvailableDirections,
	getAnimationMetadata
} from './gen-animations-builder'

export { buildSequenceAnimation } from './animations-builders/buildSequenceAnimation'

