import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';
import {  addHashPrefixForEntrance } from './utils';

/**
 * Build Ease In animation (presetID=29)
 * Batch 3 variation - combines motion (ppt_x, ppt_y) with wipe effect
 * 
 * Structure: 1 set + 2 anim (x,y) + 1 animEffect
 * Entrance: set + 2 anim + animEffect
 * Exit: 2 anim + animEffect + set
 * 
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_BATCH3_BASE_v8_ZOOMVP.pptx slide 10
 */
export function buildEaseInAnimation(ctx: AnimationBuildContext): string {
	const { shapeId, animation, config, type, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
	const duration = animation.duration || config.defaultDuration || 700;
	const delay = animation.delay ?? config.defaultDelay ?? 0
	
	const isEntrance = type === 'entrance';
	const presetClass = isEntrance ? 'entr' : 'exit';
	const visibilityValue = isEntrance ? 'visible' : 'hidden';
	const transition = isEntrance ? 'in' : 'out';
	
	// Build target XML
	let targetXml = `<p:spTgt spid="${shapeId}"/>`;
	if (target?.type === 'background') {
		targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
	} else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
		const idx = target.paragraphIndex;
		targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
	}
	
	// Generate IDs for all sub-elements
	const setId = getNextAnimationId();
	const animXId = getNextAnimationId();
	const animYId = getNextAnimationId();
	const effectId = getNextAnimationId();
	
	// Build visibility setter
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
				</p:set>`;
	
	// Exit vs Entrance: Exit animations should NOT have fill="hold" on inner anim cTn
	const innerFill = isEntrance ? ' fill="hold"' : '';
	
	// Build ppt_x animation
	// Entrance: #ppt_x-.2 → #ppt_x (moves from left, eases in)
	// Exit: ppt_x → ppt_x-.2 (moves to left, eases out)
	const xFrom = isEntrance ? '#ppt_x-.2' : 'ppt_x';
	const xTo = isEntrance ? '#ppt_x' : 'ppt_x-.2';
	
	const animXElement = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animXId}" dur="${duration}"${innerFill}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${xFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${xTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>`;
	
	// Build ppt_y animation
	// Entrance: #ppt_y → #ppt_y (no vertical movement)
	// Exit: ppt_y → ppt_y (no change)
	const yFrom = isEntrance ? '#ppt_y' : 'ppt_y';
	const yTo = isEntrance ? '#ppt_y' : 'ppt_y';
	
	const animYElement = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animYId}" dur="${duration}"${innerFill}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${yFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${yTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>`;
	
	// Build animEffect element
	// Entrance: wipe(right) with gradientSize property
	// Exit: fade (simple fade out)
	const filter = isEntrance ? 'wipe(right)' : 'fade';
	const prLst = isEntrance ? ' prLst="gradientSize: 0.1"' : '';
	
	const effectElement = `
				<p:animEffect transition="${transition}" filter="${filter}"${prLst}>
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>`;
	
	// Combine in correct order
	// Entrance: set + anim(x) + anim(y) + animEffect
	// Exit: anim(x) + anim(y) + animEffect + set
	const childElements = isEntrance 
		? (setElement + animXElement + animYElement + effectElement)
		: (animXElement + animYElement + effectElement + setElement);
	const result = `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>
				${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
	
	console.log(`[EASE_IN TEMPLATE] Returning XML with 4 sub-elements (1 set + 2 anim + 1 animEffect)`);
	
	return result;
}
