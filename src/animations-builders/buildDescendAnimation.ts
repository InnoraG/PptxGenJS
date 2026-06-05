/**
 * Descend Animation Builder (Batch 2)
 * 
 * Effect: Descend (presetID=47) - EXIT ONLY
 * Structure: animEffect + anim(ppt_x) + anim(ppt_y) + set
 * 
 * Simple descend-and-fade-out animation:
 * - ppt_x stays constant (ppt_x → ppt_x) - NO hash prefix
 * - ppt_y descends (ppt_y → ppt_y-.1) - NO hash prefix
 * - visibility set to hidden at end (delay=duration-1)
 * 
 * Reference: Focused_EntranceExit_Showcase_BATCH2_*.pptx slide4.xml spid6
 */

import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils'
import { getNextAnimationId } from '../gen-animations-ids'

export function buildDescendAnimation(ctx: AnimationBuildContext): string {
	const { shapeId, animation, config, directionConfig, type, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
	const duration = animation.duration || config.defaultDuration || 700
	const delay = animation.delay ?? config.defaultDelay ?? 0
	
	const presetSubtype = directionConfig?.presetSubtype || 0
	
	// Build target XML
	let targetXml = `<p:spTgt spid="${shapeId}"/>`
	if (target?.type === 'background') {
		targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`
	} else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
		const idx = target.paragraphIndex
		targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`
	}
	
	// Generate IDs for sub-elements
	const animEffectId = getNextAnimationId()
	const animXId = getNextAnimationId()
	const animYId = getNextAnimationId()
	const setId = getNextAnimationId()
	
	// Descend is EXIT ONLY (presetClass="exit")
	// NO hash prefix for formulas
	// Y moves from ppt_y to ppt_y-.1 (floats up as it fades out)
	
	// Build animEffect element (fade out) - FIRST for exit
	const animEffectElement = `
				<p:animEffect transition="out" filter="fade">
					<p:cBhvr>
						<p:cTn id="${animEffectId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>`
	
	// Build anim elements for ppt_x and ppt_y (NO hash prefix for exit)
	// Note: exit animations don't have fill="hold" on anim elements
	const animXElement = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animXId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="ppt_x"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="ppt_x"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>`
	
	const animYElement = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animYId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="ppt_y"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="ppt_y-.1"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>`
	
	// Build visibility setter element (LAST for exit, delay=duration-1)
	const setElement = `
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="${duration - 1}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="hidden"/></p:to>
				</p:set>`
	
	// Element order for exit: animEffect + anim(x) + anim(y) + set
	const childElements = animEffectElement + animXElement + animYElement + setElement
	return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="exit" presetSubtype="${presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`
}
