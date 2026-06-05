import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build Zip animation (presetID=51)
 * PowerPoint UI displays this as "Magnify"
 * Structure: 8 elements with complex scaling and position animations
 * 
 * Key differences entrance vs exit:
 * - Entrance: visibility setter FIRST, formulas use # prefix
 * - Exit: visibility setter LAST, formulas WITHOUT # prefix
 * - Different element order and timing (accel/decel flipped)
 */
export function buildZipAnimation(ctx: AnimationBuildContext): string {
	console.log(`[ZIP TEMPLATE] Called for spid=${ctx.shapeId}, type=${ctx.type}`);

	const { shapeId, animation, config, type, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
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

	// Timing: Split into 2 phases (269ms + 430ms = 699ms total)
	const dur1 = 269; // Phase 1: scale expansion
	const dur2 = 430; // Phase 2: scale + position return

	// Generate IDs for all 8 sub-elements
	const setId1 = getNextAnimationId();
	const effectId = getNextAnimationId();
	const scale1Id = getNextAnimationId();
	const scale2Id = getNextAnimationId();
	const setXId = getNextAnimationId();
	const animXId = getNextAnimationId();
	const setYId = getNextAnimationId();
	const animYId = getNextAnimationId();

	// Build the 8-element animation - DIFFERENT structure for entrance vs exit
	let childElements: string;
	
	if (isEntrance) {
		// ENTRANCE: visibility setter FIRST, formulas with # prefix
		childElements = `
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId1}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>
				<p:animEffect transition="in" filter="fade">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${dur1}" decel="100000"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>
				<p:animScale>
					<p:cBhvr>
						<p:cTn id="${scale1Id}" dur="${dur1}" decel="100000"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
					<p:from x="10000" y="10000"/>
					<p:to x="200000" y="450000"/>
				</p:animScale>
				<p:animScale>
					<p:cBhvr>
						<p:cTn id="${scale2Id}" dur="${dur2}" accel="100000" fill="hold">
							<p:stCondLst><p:cond delay="${dur1}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
					<p:from x="200000" y="450000"/>
					<p:to x="100000" y="100000"/>
				</p:animScale>
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setXId}" dur="${dur1}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="(0.5)"/></p:to>
				</p:set>
				<p:anim from="(0.5)" to="(#ppt_x)" calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animXId}" dur="${dur2}" accel="100000" fill="hold">
							<p:stCondLst><p:cond delay="${dur1}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:anim>
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setYId}" dur="${dur1}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="(#ppt_y+0.4)"/></p:to>
				</p:set>
				<p:anim from="(#ppt_y+0.4)" to="(#ppt_y)" calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animYId}" dur="${dur2}" accel="100000" fill="hold">
							<p:stCondLst><p:cond delay="${dur1}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:anim>`;
	} else {
		// EXIT: visibility setter LAST, formulas WITHOUT # prefix, different order/timing
		childElements = `
				<p:animEffect transition="out" filter="fade">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${dur1}" accel="100000">
							<p:stCondLst><p:cond delay="${dur2}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>
				<p:animScale>
					<p:cBhvr>
						<p:cTn id="${scale1Id}" dur="${dur1}" accel="100000">
							<p:stCondLst><p:cond delay="${dur2}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
					<p:from x="200000" y="450000"/>
					<p:to x="10000" y="10000"/>
				</p:animScale>
				<p:animScale>
					<p:cBhvr>
						<p:cTn id="${scale2Id}" dur="${dur2}" decel="100000"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
					<p:from x="100000" y="100000"/>
					<p:to x="200000" y="450000"/>
				</p:animScale>
				<p:anim from="(ppt_x)" to="(0.5)" calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animXId}" dur="${dur2}" decel="100000"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:anim>
				<p:anim from="(0.5)" to="(0.5)" calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${setXId}" dur="${dur1}">
							<p:stCondLst><p:cond delay="${dur2}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:anim>
				<p:anim from="(ppt_y)" to="(ppt_y+0.4)" calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animYId}" dur="${dur2}" decel="100000"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:anim>
				<p:anim from="(ppt_y)" to="(ppt_y)" calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${setYId}" dur="${dur1}">
							<p:stCondLst><p:cond delay="${dur2}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:anim>
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId1}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="${dur1 + dur2}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>`;
	}
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

	// DEBUG: Check what we're returning
	const childCount = (result.match(/<p:set|<p:anim|<p:animEffect|<p:animScale/g) || []).length;
	console.log(`[ZIP TEMPLATE] Returning ${isEntrance ? 'ENTRANCE' : 'EXIT'} XML with ${childCount} sub-elements (should be 8)`);

	return result;
}
