/**
 * PptxGenJS: Animation Registry Type Definitions
 * Shared types for animation configurations
 */

export interface AnimationDirection {
	name: string
	presetSubtype: number
	value?: string
	label?: string
	xFormula?: { from: string; to: string }
	yFormula?: { from: string; to: string }
	wFormula?: { from: string; to: string }
	hFormula?: { from: string; to: string }
}

export interface AnimationConfig {
	/** Unique effect ID (from PowerPoint COM) */
	effectId?: number
	
	/** PowerPoint preset ID for this animation */
	presetId: number
	
	/** Display name of the animation */
	name: string
	
	/** PowerPoint preset class (entr, exit, emph, path) */
	presetClass?: string
	
	/** Animation category (entrance, exit, emphasis, motion-path) */
	category?: string
	
	/** Default duration in milliseconds */
	defaultDuration?: number
	
	/** Default delay in milliseconds (registry-driven) */
	defaultDelay?: number
	
	/** Whether this animation supports directional variants */
	supportsDirection?: boolean
	
	/** Default direction to use when none is specified */
	defaultDirection?: string
	
	/** Available directions for this animation */
	directions?: AnimationDirection[]
	
	/** Whether this animation supports sequence modes (allAtOnce, byParagraph) */
	supportsSequence?: boolean
	
	/** For allAtOnce mode, only generate ONE animation targeting background (not per paragraph) */
	sequenceTargetBackgroundOnly?: boolean
	
	/** Text-based effects: always use paragraph targeting in allAtOnce/byParagraph (no base <p:bg/> animation) */
	requiresParagraphTargeting?: boolean
	
	/** Force byParagraph mode to use allAtOnce wrapping (for effects like Bold Reveal that use <p:iterate> internally) */
	sequenceModeForcedAllAtOnce?: boolean
	
	/** Number of animations to generate per paragraph (for sequence modes) */
	/** Number of sub-animation elements in <p:childTnLst> (e.g., Wipe=2, Unfold=4, Stretch=5) */
	subAnimationCount?: number
	
	/** Template generator type (simple, directional, custom) */
	templateGenerator?: string
	
	/** Custom template function name (for complex animations) */
	customTemplate?: string
	
	// ============================================================================
	// EFFECT-SPECIFIC BEHAVIOR FLAGS (for surgical isolation)
	// These flags allow each effect to control its behavior without shared code decisions
	// ============================================================================
	
	/** 
	 * Whether exit animations should have fill="hold" on inner anim elements
	 * Default: true for entrance, false for exit (based on frozen reference patterns)
	 * Set explicitly to override the default behavior for specific effects
	 */
	exitFillHold?: boolean
	
	/**
	 * How to handle direction aliasing (toX → fromY conversion)
	 * - 'auto': Use aliasing if effect doesn't have explicit to* directions (default)
	 * - 'none': Never alias directions (effect has explicit to* directions)
	 * - 'preserve': Keep direction as-is without any transformation
	 */
	directionAliasing?: 'auto' | 'none' | 'preserve'
	
	/**
	 * Explicitly specify whether to use motion-based builder (buildMotionDirectional)
	 * If not specified, inferred from presence of xFormula/yFormula in directions
	 */
	useMotionBuilder?: boolean
	
	/** SVG path data for motion path animations */
	pathData?: string
	
	/** Media command for media animations (playFrom, togglePause, stop) */
	mediaCommand?: string
	
	/**
	 * Custom nodeType mapping for different trigger modes
	 * Allows animations to override default trigger→nodeType behavior
	 * Default mapping (if not specified):
	 *   onClick → clickEffect
	 *   withPrevious → withEffect
	 *   afterPrevious → afterEffect
	 */
	nodeTypeMapping?: {
		onClick?: 'clickEffect' | 'withEffect' | 'afterEffect'
		withPrevious?: 'clickEffect' | 'withEffect' | 'afterEffect'
		afterPrevious?: 'clickEffect' | 'withEffect' | 'afterEffect'
	}
	
	/** Additional metadata about the animation structure */
	metadata?: {
		usesVisibility?: boolean
		exitUsesVisibility?: boolean
		elementOrder?: string[]
	}
}
