/**
 * Build Flip animation (presetID=56)
 * 
 * Structure:
 * - Entrance: set (visible) + 3 anim (ppt_y, ppt_x, ppt_w) + animRot
 * - Exit: 3 anim (ppt_w, ppt_x, ppt_y) + animRot + set (hidden)
 * 
 * Key characteristics:
 * - All anim elements have autoRev="1" and dur=350
 * - animRot has dur=700 (double the anim duration)
 * - Entrance uses # prefix for formulas, exit does NOT
 * - Complex formulas manipulate width, position, and rotation
 * 
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_WHEELFIX_v7.pptx slide18.xml
 */

import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils'
import { getNextAnimationId } from '../gen-animations-ids'
import {  addHashPrefixForEntrance } from './utils'

export function buildFlipAnimation(ctx: AnimationBuildContext): string {
	const { shapeId, animation, config, type, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
	const duration = animation.duration || config.defaultDuration || 700;
	const delay = animation.delay ?? config.defaultDelay ?? 0
	
	const isEntrance = type === 'entrance'
	const presetClass = isEntrance ? 'entr' : 'exit'
	const visibilityValue = isEntrance ? 'visible' : 'hidden'
	
	// Calculate scaling factor for proportional choreography
	const DEFAULT_DURATION = 700;
	const scaleFactor = duration / DEFAULT_DURATION;
	const phaseDur = Math.round(350 * scaleFactor);
	const totalDur = Math.round(700 * scaleFactor);
	const setDelayExit = Math.max(0, Math.round((700 - 1) * scaleFactor));
	
	// Build target XML
	let targetXml = `<p:spTgt spid="${shapeId}"/>`
	if (target?.type === 'background') {
		targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`
	} else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
		const idx = target.paragraphIndex
		targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`
	}
	
	// Generate IDs for all sub-elements (5 total)
	const setId = getNextAnimationId()
	const anim1Id = getNextAnimationId()
	const anim2Id = getNextAnimationId()
	const anim3Id = getNextAnimationId()
	const rotId = getNextAnimationId()
	
	// CRITICAL: Formulas differ for entrance vs exit
	// Entrance formulas (with # prefix):
	//   ppt_y: from='(-#ppt_h/2)' to='(#ppt_y)'
	//   ppt_x: from='(#ppt_x-#ppt_w/2)' to='(#ppt_x)'
	//   ppt_w: from='(#ppt_w*2)' to='(#ppt_w)'
	//   animRot: by='21600000' (360 degrees = 21600000 / 60000)
	//
	// Exit formulas (NO # prefix):
	//   ppt_w: from='(ppt_w)' to='(-ppt_w*2)'
	//   ppt_x: from='(ppt_x)' to='(ppt_x+ppt_w*1.5)'
	//   ppt_y: from='(ppt_y)' to='(1+ppt_h/2)'
	//   animRot: by='21600000' (same as entrance)
	
	let childElements: string
	
	if (isEntrance) {
		// ENTRANCE: set + anim(ppt_w) + anim(ppt_x) + anim(ppt_y) + animRot
		// CRITICAL: Frozen reference uses "by=" for ppt_w and ppt_x, "from=/to=" for ppt_y
		// - ppt_w: by="(-#ppt_w*2)" dur=350 autoRev=1
		// - ppt_x: by="(#ppt_w*0.50)" dur=350 decel=50000 autoRev=1
		// - ppt_y: from="(-#ppt_h/2)" to="(#ppt_y)" dur=700 (NO autoRev!)
		// - animRot: by="21600000" dur=700
		
		childElements = `
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
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>
				<p:anim by="(-#ppt_w*2)" calcmode="lin" valueType="num">
					<p:cBhvr rctx="PPT">
						<p:cTn id="${anim1Id}" dur="${phaseDur}" autoRev="1" fill="hold">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_w</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:anim>
				<p:anim by="(#ppt_w*0.50)" calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${anim2Id}" dur="${phaseDur}" decel="50000" autoRev="1" fill="hold">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:anim>
				<p:anim from="(-#ppt_h/2)" to="(#ppt_y)" calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${anim3Id}" dur="${totalDur}" fill="hold">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:anim>
				<p:animRot by="21600000">
					<p:cBhvr>
						<p:cTn id="${rotId}" dur="${totalDur}" fill="hold">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>r</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:animRot>`
	} else {
		// EXIT: anim(ppt_w) + anim(ppt_x) + anim(ppt_y) + animRot + set
		// CRITICAL: Frozen reference uses from/to for ppt_w, by for ppt_x, from/to for ppt_y
		// - ppt_w: from="(ppt_w)" to="(-ppt_w*2)" dur=350 autoRev=1 rctx="PPT"
		// - ppt_x: by="(ppt_w*0.50)" dur=350 decel=50000 autoRev=1 (NO rctx!)
		// - ppt_y: from="(ppt_y)" to="(1+ppt_h/2)" dur=700 (NO autoRev!)
		// - animRot: by="21600000" dur=700
		
		childElements = `
				<p:anim from="(ppt_w)" to="(-ppt_w*2)" calcmode="lin" valueType="num">
					<p:cBhvr rctx="PPT">
						<p:cTn id="${anim1Id}" dur="${phaseDur}" autoRev="1">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_w</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:anim>
				<p:anim by="(ppt_w*0.50)" calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${anim2Id}" dur="${phaseDur}" decel="50000" autoRev="1">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:anim>
				<p:anim from="(ppt_y)" to="(1+ppt_h/2)" calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${anim3Id}" dur="${totalDur}">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:anim>
				<p:animRot by="21600000">
					<p:cBhvr>
						<p:cTn id="${rotId}" dur="${totalDur}">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>r</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:animRot>
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="${setDelayExit}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>`
	}
	return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
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
