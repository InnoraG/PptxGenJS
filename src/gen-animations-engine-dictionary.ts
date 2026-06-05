/**
 * PptxGenJS: Dictionary-Based Animation Engine
 * 
 * Simplified animation engine that uses template lookup + parameter substitution.
 * No formula generation, no complex logic - just:
 *   1. Template lookup
 *   2. Parameter substitution
 *   3. Target XML generation
 *   4. ID assignment
 * 
 * This is the CLEAN replacement for the complex builder system.
 */

import { AnimationRequest } from './gen-animations-dictionary/types.js'
import { getAnimationTemplate } from './gen-animations-dictionary/index.js'
import { getNextAnimationId } from './gen-animations-ids.js'

/**
 * Generate target XML for animation
 * 
 * PowerPoint uses different targeting structures based on what's being animated:
 * - Shape (whole object): <p:spTgt spid="X"/>
 * - Paragraph: <p:spTgt spid="X"><p:txEl><p:pRg st="N" end="N"/></p:txEl></p:spTgt>
 * 
 * @param spid - Shape ID
 * @param targetType - What to target (shape or paragraph)
 * @param paragraphIndex - Paragraph index (required if targetType is 'paragraph')
 * @returns Target XML string
 */
export function generateTargetXml(
	spid: number,
	sequenceMode: 'asOneObject' | 'allAtOnce' | 'byParagraph',
	paragraphIndex?: number
): string {
	if (sequenceMode === 'asOneObject') {
		// Bare self-closing tag for asOneObject (NO children)
		return `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>`
	} else if (paragraphIndex === undefined) {
		// Base shape for allAtOnce/byParagraph (WITH <p:bg/> child)
		return `<p:tgtEl><p:spTgt spid="${spid}"><p:bg/></p:spTgt></p:tgtEl>`
	} else {
		// Paragraph targeting for allAtOnce/byParagraph (WITH <p:txEl>)
		return `<p:tgtEl><p:spTgt spid="${spid}"><p:txEl><p:pRg st="${paragraphIndex}" end="${paragraphIndex}"/></p:txEl></p:spTgt></p:tgtEl>`
	}
}

/**
 * Substitute template parameters with actual values
 * 
 * Replaces all {{placeholder}} tokens with real values.
 * For {{targetXml}}, if an array is provided, substitutes sequentially.
 * 
 * @param templateXml - OOXML template with {{placeholders}}
 * @param params - Parameter map (placeholder name -> value or value array)
 * @returns OOXML with all placeholders replaced
 */
export function substituteTemplateParams(
	templateXml: string,
	params: { [key: string]: string | number | string[] }
): string {
	let result = templateXml
	
	// Replace all {{placeholder}} with actual values
	for (const [key, value] of Object.entries(params)) {
		const placeholder = `{{${key}}}`
		
		if (Array.isArray(value)) {
			// Sequential replacement for arrays (used for targetXml in allAtOnce/byParagraph)
			let index = 0
			result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), () => {
				const replacement = value[index % value.length]
				index++
				return replacement
			})
		} else {
			// Standard replacement for scalars
			result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), String(value))
		}
	}
	
	// Check for any remaining placeholders (indicates missing parameters)
	const remainingPlaceholders = result.match(/\{\{[^}]+\}\}/g)
	if (remainingPlaceholders) {
		throw new Error(`Missing template parameters: ${remainingPlaceholders.join(', ')}`)
	}
	
	return result
}

/**
 * Build animation from dictionary template
 * 
 * This is the MAIN function - takes a request, looks up template, substitutes parameters.
 * 
 * @param request - Animation request with all necessary parameters
 * @returns Complete animation OOXML
 */
/**
 * Get presetSubtype for a given effect and direction
 * Maps direction names to PowerPoint presetSubtype values
 */
function getPresetSubtypeForDirection(effectName: string, direction: string | undefined, sequenceMode: string): number {
	if (!direction) return 0
	
	const dir = direction.toLowerCase()
	
	// Fly uses spatial directions (8-directional)
	if (effectName === 'Fly') {
		const spatialMap: { [key: string]: number } = {
			'frombottom': 3, 'fromtop': 1, 'fromleft': 4, 'fromright': 2,
			'frombottomleft': 9, 'frombottomright': 8, 'fromtopleft': 6, 'fromtopright': 7,
			'tobottom': 3, 'totop': 1, 'toleft': 4, 'toright': 2,
			'tobottomleft': 9, 'tobottomright': 8, 'totopleft': 6, 'totopright': 7
		}
		return spatialMap[dir] || 3
	}
	
	// For other effects, return 0 (will use template default)
	return 0
}

export function buildAnimationFromTemplate(request: AnimationRequest): string {
	// 1. Get template from dictionary (direction parameter ignored since templates are not directional)
	const template = getAnimationTemplate(
		request.type,
		request.effectName,
		undefined, // Direction not used - templates are already extracted for specific directions
		request.sequenceMode
	)
	
	// 2. Generate target XML based on sequence mode and paragraph index
	// For allAtOnce/byParagraph with multiple paragraphs, generate array of targets
	let targetXmlValue: string | string[]
	
	if (request.paragraphIndex !== undefined) {
		// Single paragraph targeting (for byParagraph individual calls)
		targetXmlValue = generateTargetXml(request.spid, request.sequenceMode, request.paragraphIndex)
	} else if (request.sequenceMode === 'asOneObject') {
		// Single whole-shape targeting
		targetXmlValue = generateTargetXml(request.spid, request.sequenceMode, undefined)
	} else {
		// allAtOnce or byParagraph base: template expects multiple targetXml (base + paragraphs)
		// We don't know paragraph count here, so we need to pass it in request
		// For now, assume standard 5 paragraphs (will fix in integration layer)
		const paragraphCount = (request as any).paragraphCount || 5
		const targets: string[] = []
		
		// Base shape (with <p:bg/>)
		const baseTarget = generateTargetXml(request.spid, request.sequenceMode, undefined)
		// Each animation node has 3 targetXml refs (set, anim, anim)
		targets.push(baseTarget, baseTarget, baseTarget)
		
		// Paragraph targets (with <p:txEl>)
		for (let p = 0; p < paragraphCount; p++) {
			const paraTarget = generateTargetXml(request.spid, request.sequenceMode, p)
			// Each animation node has 3 targetXml refs
			targets.push(paraTarget, paraTarget, paraTarget)
		}
		
		targetXmlValue = targets
	}
	
	// 3. Allocate IDs for all {{idN}} placeholders
	// Find all unique ID placeholders in template
	const idMatches = template.ooxml.match(/\{\{id\d+\}\}/g) || []
	const uniqueIds = [...new Set(idMatches)]
	
	const idParams: { [key: string]: number } = {}
	for (const idPlaceholder of uniqueIds) {
		const idKey = idPlaceholder.replace(/[{}]/g, '') // "id0", "id1", etc.
		idParams[idKey] = getNextAnimationId()
	}
	
	// 4. Build complete parameter map
	const params: { [key: string]: string | number | string[] } = {
		...idParams,
		duration: request.duration,
		delay: request.delay,
		targetXml: targetXmlValue,
		visibility: request.type === 'entrance' ? 'visible' : 'hidden',
		presetSubtype: (request as any).presetSubtype || 0 // Allow override from request
	}
	
	// 5. Substitute parameters
	let result = substituteTemplateParams(template.ooxml, params)
	
	// 6. Post-process: Replace hardcoded presetSubtype with correct direction-based value
	const correctSubtype = getPresetSubtypeForDirection(request.effectName, request.direction, request.sequenceMode)
	if (correctSubtype > 0) {
		// Replace all presetSubtype="X" with correct value
		result = result.replace(/presetSubtype="\d+"/g, `presetSubtype="${correctSubtype}"`)
	}
	
	return result
}

/**
 * Build multiple animations (for sequence modes like byParagraph)
 * 
 * @param requests - Array of animation requests
 * @returns Array of animation OOXML strings
 */
export function buildAnimationsFromTemplate(requests: AnimationRequest[]): string[] {
	return requests.map(req => buildAnimationFromTemplate(req))
}
