/**
 * PptxGenJS: Dictionary-Based Animation System - Type Definitions
 * 
 * Defines the type structure for template-based animation generation.
 * Templates contain frozen OOXML with parameter placeholders.
 */

/**
 * Animation template with OOXML and parameter list
 */
export interface AnimationTemplate {
	/** OOXML string with {{placeholder}} tokens */
	ooxml: string
	
	/** List of parameter placeholders used in the template */
	params: string[]
}

/**
 * Animation effect definition with metadata and templates
 */
export interface AnimationEffect {
	/** PowerPoint preset ID (from frozen reference) */
	presetId: number
	
	/** Animation class (entrance/exit/emphasis/motion path) */
	presetClass: 'entr' | 'exit' | 'emph' | 'path'
	
	/** PowerPoint preset subtype (for non-directional or default direction) */
	presetSubtype?: number
	
	/** Effect name (e.g., 'Expand', 'Fly', 'Fade') */
	name: string
	
	/** Template for asOneObject sequence mode (single click, whole shape) */
	asOneObject?: AnimationTemplate
	
	/** Template for byParagraph sequence mode (N clicks, one per paragraph) */
	byParagraph?: AnimationTemplate
	
	/** Template for allAtOnce sequence mode (1 click, all paragraphs simultaneously) */
	allAtOnce?: AnimationTemplate
	
	/** For directional effects (Fly, Wipe, etc.) */
	directions?: {
		[directionName: string]: {
			/** PowerPoint preset subtype for this direction */
			presetSubtype: number
			
			/** Templates for each sequence mode */
			asOneObject?: AnimationTemplate
			byParagraph?: AnimationTemplate
			allAtOnce?: AnimationTemplate
		}
	}
}

/**
 * Request to build an animation from a template
 */
export interface AnimationRequest {
	/** Effect name (must exist in dictionary) */
	effectName: string
	
	/** Animation type (entrance or exit) */
	type: 'entrance' | 'exit'
	
	/** Direction name (optional - not used in current template structure) */
	direction?: string
	
	/** Sequence mode (how to handle multi-paragraph text) */
	sequenceMode: 'asOneObject' | 'byParagraph' | 'allAtOnce'
	
	/** Shape ID (spid) to target */
	spid: number
	
	/** Animation duration in milliseconds */
	duration: number
	
	/** Delay before animation starts in milliseconds */
	delay: number
	
	/** Paragraph index (optional - for byParagraph/allAtOnce paragraph targeting) */
	paragraphIndex?: number
}
