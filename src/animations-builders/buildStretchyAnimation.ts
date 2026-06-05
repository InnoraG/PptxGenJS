import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';
import {  addHashPrefixForEntrance } from './utils';

/**
 * Build Stretchy (Compress) animation (presetID=50)
 * Structure: 1 set + 2 anim + 1 animEffect (fade)
 * The effect combines size animation with fade in/out
 *
 * NOTE: This is now a wrapper that delegates to the modular version
 */
/**
 * Stretchy (Compress) animation builder (presetID=50)
 * Structure: 1 set + 2 anim + 1 animEffect (fade)
 * The effect combines size animation with fade in/out
 */
export function buildStretchyAnimation(ctx: AnimationBuildContext): string {
	console.log(`[STRETCHY TEMPLATE] Called for spid=${ctx.shapeId}`);

	const { shapeId, animation, config, type, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
	const duration = animation.duration || config.defaultDuration || 500;
	const delay = animation.delay ?? config.defaultDelay ?? 0

	const isEntrance = type === 'entrance';
	const presetClass = isEntrance ? 'entr' : 'exit';
	const visibilityValue = isEntrance ? 'visible' : 'hidden';

	// Build target XML
	let targetXml = `<p:spTgt spid="${shapeId}"/>`;
	if (target?.type === 'background') {
		targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
	} else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
		const idx = target.paragraphIndex;
		targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
	}

	// Animation values: width expands/contracts, height stays same
	// Entrance: width from 130% to 100%
	// Exit: width from 100% to 130%
	const wFrom = addHashPrefixForEntrance(isEntrance ? 'ppt_w+.3' : 'ppt_w', isEntrance);
	const wTo = addHashPrefixForEntrance(isEntrance ? 'ppt_w' : 'ppt_w+.3', isEntrance);
	const hFrom = addHashPrefixForEntrance('ppt_h', isEntrance);
	const hTo = addHashPrefixForEntrance('ppt_h', isEntrance);

	// Generate IDs for all 4 sub-elements
	const setId = getNextAnimationId();
	const animWId = getNextAnimationId();
	const animHId = getNextAnimationId();
	const effectId = getNextAnimationId();

	// Determine transition based on entrance/exit
	const transition = isEntrance ? 'in' : 'out';

	// Build the animation with correct element order
	// ENTRANCE: set + anim(w) + anim(h) + animEffect
	// EXIT: anim(w) + anim(h) + animEffect + set
	let childElements = '';

	if (isEntrance) {
		// Entrance: set comes FIRST
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
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animWId}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_w</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${wFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${wTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animHId}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_h</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${hFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${hTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:animEffect transition="${transition}" filter="fade">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>`;
	} else {
		// Exit: anim elements first, then animEffect, then set LAST
		// EXIT animations: <p:anim> cTn nodes have NO fill attribute (only set has fill="hold")
		childElements = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animWId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_w</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${wFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${wTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animHId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_h</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${hFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${hTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:animEffect transition="${transition}" filter="fade">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>
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
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>`;
	}

	// Timing: entrance uses decel, exit uses accel
	const timingAttr = isEntrance ? 'decel="100000"' : 'accel="100000"';
	const result = `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" ${timingAttr} fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>
				${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;

	// DEBUG: Check what we're returning
	const childCount = (result.match(/<p:set|<p:anim|<p:animEffect/g) || []).length;
	console.log(`[STRETCHY TEMPLATE] Returning XML with ${childCount} sub-elements (should be 4)`);

	return result;
}
