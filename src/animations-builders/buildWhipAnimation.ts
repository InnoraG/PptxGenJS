/**
 * Build Whip animation (presetID=41)
 * 
 * Structure: 6 elements with iterate
 * - Entrance: set + anim(x) + anim(y) + anim(h) + anim(w) + animEffect
 * - Exit: anim(x) + anim(y) + anim(h) + anim(w) + animEffect + set
 * 
 * Special features:
 * - Uses iterate element (type="lt", tmPct="10000")
 * - 3-keyframe animations (0, 50000, 100000)
 * - animEffect has tmFilter attribute
 * - Entrance uses # prefix, exit doesn't
 * 
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_WHEELFIX_v7.pptx slide16.xml
 */

import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils'
import {  addHashPrefixForEntrance } from './utils'
import { getNextAnimationId } from '../gen-animations-ids'

export function buildWhipAnimation(ctx: AnimationBuildContext): string {
	const { shapeId, animation, config, directionConfig, type, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
	const duration = animation.duration || config.defaultDuration || 700
	const delay = animation.delay ?? config.defaultDelay ?? 0
	
	const isEntrance = type === 'entrance'
	const presetClass = isEntrance ? 'entr' : 'exit'
	const visibilityValue = isEntrance ? 'visible' : 'hidden'
	const presetSubtype = directionConfig?.presetSubtype || 0
	const transition = isEntrance ? 'in' : 'out'
	
	// Build target XML
	let targetXml = `<p:spTgt spid="${shapeId}"/>`
	if (target?.type === 'background') {
		targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`
	} else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
		const idx = target.paragraphIndex
		targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`
	}
	
	// Generate IDs for all sub-elements
	const setId = getNextAnimationId()
	const animXId = getNextAnimationId()
	const animYId = getNextAnimationId()
	const animHId = getNextAnimationId()
	const animWId = getNextAnimationId()
	const effectId = getNextAnimationId()
	
	// Apply # prefix for entrance
	const prefixX = addHashPrefixForEntrance('ppt_x', isEntrance)
	const prefixY = addHashPrefixForEntrance('ppt_y', isEntrance)
	const prefixH = addHashPrefixForEntrance('ppt_h', isEntrance)
	const prefixW = addHashPrefixForEntrance('ppt_w', isEntrance)
	
	// Whip-specific formulas with 3 keyframes (0%, 50%, 100%)
	// X: wobbles horizontally (ppt_x → ppt_x+.1 → ppt_x)
	const xKeyframes = `
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${prefixX}"/></p:val></p:tav>
						<p:tav tm="50000"><p:val><p:strVal val="${prefixX}+.1"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${prefixX}"/></p:val></p:tav>
					</p:tavLst>`
	
	// Y: stays constant (ppt_y → ppt_y)
	const yKeyframes = `
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${prefixY}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${prefixY}"/></p:val></p:tav>
					</p:tavLst>`
	
	// H: entrance grows (ppt_h/10 → ppt_h+.01 → ppt_h), exit shrinks (ppt_h → ppt_h+.01 → ppt_h/10)
	const hKeyframes = isEntrance ? `
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${prefixH}/10"/></p:val></p:tav>
						<p:tav tm="50000"><p:val><p:strVal val="${prefixH}+.01"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${prefixH}"/></p:val></p:tav>
					</p:tavLst>` : `
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${prefixH}"/></p:val></p:tav>
						<p:tav tm="50000"><p:val><p:strVal val="${prefixH}+.01"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${prefixH}/10"/></p:val></p:tav>
					</p:tavLst>`
	
	// W: entrance grows (ppt_w/10 → ppt_w+.01 → ppt_w), exit shrinks (ppt_w → ppt_w+.01 → ppt_w/10)
	const wKeyframes = isEntrance ? `
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${prefixW}/10"/></p:val></p:tav>
						<p:tav tm="50000"><p:val><p:strVal val="${prefixW}+.01"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${prefixW}"/></p:val></p:tav>
					</p:tavLst>` : `
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${prefixW}"/></p:val></p:tav>
						<p:tav tm="50000"><p:val><p:strVal val="${prefixW}+.01"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${prefixW}/10"/></p:val></p:tav>
					</p:tavLst>`
	
	// tmFilter differs for entrance vs exit
	const tmFilter = isEntrance ? '0,0; .5, 1; 1, 1' : '0,0; .5, 0; 1, 1'
	
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
	
	// Build animation elements
	// CRITICAL: Entrance has fill="hold" on anim elements, Exit does NOT
	const fillAttr = isEntrance ? ' fill="hold"' : ''
	const animElements = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animXId}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>${xKeyframes}
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animYId}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>${yKeyframes}
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animHId}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_h</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>${hKeyframes}
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animWId}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_w</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>${wKeyframes}
				</p:anim>
				<p:animEffect transition="${transition}" filter="fade">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${duration}" tmFilter="${tmFilter}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>`
	
	// CRITICAL: Element order differs for entrance vs exit
	// Entrance: set + animations
	// Exit: animations + set
	const childElements = isEntrance ? (setElement + animElements) : (animElements + setElement)
	return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="${presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:iterate type="lt">
				<p:tmPct val="10000"/>
			</p:iterate>
			<p:childTnLst>${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`
}
