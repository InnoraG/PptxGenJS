/**
 * Ascend Animation Builder (Batch 2)
 * 
 * Effect: Ascend (presetID=42) - ENTRANCE ONLY
 * Structure: set + animEffect + anim(ppt_x) + anim(ppt_y)
 * 
 * Simple rise-up animation:
 * - ppt_x stays constant (#ppt_x → #ppt_x)
 * - ppt_y rises from below (#ppt_y+.1 → #ppt_y)
 * 
 * Reference: Focused_EntranceExit_Showcase_BATCH2_*.pptx slide4.xml
 */

import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils'
import { getNextAnimationId } from '../gen-animations-ids'

export function buildAscendAnimation(ctx: AnimationBuildContext): string {
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
	const setId = getNextAnimationId()
	const animEffectId = getNextAnimationId()
	const animXId = getNextAnimationId()
	const animYId = getNextAnimationId()
	
	// Ascend is ENTRANCE ONLY (presetClass="entr")
	// Uses hash prefix for formulas
	// Y rises from #ppt_y+.1 to #ppt_y
	
	// Build visibility setter element (FIRST for entrance)
	const setElement = `
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="visible"/></p:to>
				</p:set>`
	
	// Build animEffect element (fade in)
	const animEffectElement = `
				<p:animEffect transition="in" filter="fade">
					<p:cBhvr>
						<p:cTn id="${animEffectId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>`
	
	// Build anim elements for ppt_x and ppt_y (with hash prefix for entrance)
	const animXElement = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animXId}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="#ppt_x"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="#ppt_x"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>`
	
	const animYElement = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animYId}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="#ppt_y+.1"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="#ppt_y"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>`
	
	// Element order for entrance: set + animEffect + anim(x) + anim(y)
	const childElements = setElement + animEffectElement + animXElement + animYElement
	return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="entr" presetSubtype="${presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`
}
