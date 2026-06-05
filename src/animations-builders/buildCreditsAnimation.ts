/**
 * Credits Animation Builder
 * 
 * Effect: Credits (presetID=28)
 * Structure: 1 set + 2 anim (ppt_x, ppt_y for POSITION scrolling)
 * 
 * CRITICAL: Credits animates POSITION (ppt_x, ppt_y), NOT size (ppt_w, ppt_h)
 * - Entrance: Y scrolls from #ppt_y+1 to #ppt_y-1 (scrolls up like movie credits)
 * - Exit: Y scrolls from ppt_y-1 to ppt_y+1 (scrolls down)
 * - X stays constant at #ppt_x (entrance) or ppt_x (exit)
 * 
 * Reference: Focused_EntranceExit_Showcase_WHEELFIX_v7.pptx slide14.xml
 */

import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils'
import { getNextAnimationId } from '../gen-animations-ids'

export function buildCreditsAnimation(ctx: AnimationBuildContext): string {
	const { shapeId, animation, config, directionConfig, type, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
	const duration = animation.duration || config.defaultDuration || 500
	const delay = animation.delay ?? config.defaultDelay ?? 0
	
	const isEntrance = type === 'entrance'
	const presetClass = isEntrance ? 'entr' : 'exit'
	const visibilityValue = isEntrance ? 'visible' : 'hidden'
	const presetSubtype = directionConfig?.presetSubtype || 0
	
	// Build target XML
	let targetXml = `<p:spTgt spid="${shapeId}"/>`
	if (target?.type === 'background') {
		targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`
	} else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
		const idx = target.paragraphIndex
		targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`
	}
	
	// CRITICAL: Credits uses POSITION animation (ppt_x, ppt_y), not size
	// X stays constant, Y scrolls vertically
	// Entrance: X=#ppt_x→#ppt_x, Y=#ppt_y+1→#ppt_y-1 (scroll up)
	// Exit: X=ppt_x→ppt_x, Y=ppt_y-1→ppt_y+1 (scroll down)
	
	// Formula prefix: Entrance uses #, Exit does NOT
	const xFormula = isEntrance ? '#ppt_x' : 'ppt_x'
	const yFrom = isEntrance ? '#ppt_y+1' : 'ppt_y-1'
	const yTo = isEntrance ? '#ppt_y-1' : 'ppt_y+1'
	
	// Generate IDs for sub-elements
	const setId = getNextAnimationId()
	const animXId = getNextAnimationId()
	const animYId = getNextAnimationId()
	
	// Build visibility setter element
	const setElement = `
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="${isEntrance ? 0 : duration - 1}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>`
	
	// Build anim elements
	// CRITICAL: Entrance has fill="hold", Exit does NOT have fill="hold"
	// Reference shows NO additive="base" for Credits animation
	const fillAttr = isEntrance ? ' fill="hold"' : ''
	const animElements = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animXId}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${xFormula}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${xFormula}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animYId}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${yFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${yTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>`
	
	// CRITICAL: Element order differs for entrance vs exit
	// Entrance: set + anim(x) + anim(y)
	// Exit: anim(x) + anim(y) + set
	const childElements = isEntrance ? (setElement + animElements) : (animElements + setElement)
	return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="${presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`
}
