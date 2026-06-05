import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build Drop animation (presetID=38)
 * Entrance: 2 set + 4 anim (rotation + bounce effect)
 * Exit: 2 anim + 1 set (simpler reverse)
 */
export function buildDropAnimation(ctx: AnimationBuildContext): string {
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

	let childElements = '';

	if (isEntrance) {
		// Entrance: Complex bounce (2 set + 4 anim)
		// Total animation duration = 700ms
		// Timing: set(0ms) + drop(0-318ms) + bounce1(318-427ms) + bounce2(427-536ms) + land(605-700ms)
		// Note: land anim starts at 700-95=605ms (NOT at dur1+dur2+dur2=536ms)
		const dur1 = 318, dur2 = 109, dur3 = 95;
		const totalDuration = 700;
		const animY3Delay = totalDuration - dur3; // 700-95=605
		const setVisId = getNextAnimationId();
		const setRotId = getNextAnimationId();
		const animRot1Id = getNextAnimationId();
		const animY1Id = getNextAnimationId();
		const animY2Id = getNextAnimationId();
		const animY3Id = getNextAnimationId();

		childElements = `
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setVisId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setRotId}" dur="${dur1}" fill="hold">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>style.rotation</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="-45.0"/></p:to>
				</p:set>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animRot1Id}" dur="${dur1}" fill="hold">
							<p:stCondLst><p:cond delay="${dur1}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>style.rotation</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:fltVal val="-45"/></p:val></p:tav>
						<p:tav tm="69900"><p:val><p:fltVal val="45"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:fltVal val="0"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animY1Id}" dur="${dur1}" fill="hold">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="#ppt_y-1"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="#ppt_y-(0.354*#ppt_w-0.172*#ppt_h)"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animY2Id}" dur="${dur2}" decel="50000" autoRev="1" fill="hold">
							<p:stCondLst><p:cond delay="${dur1}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="#ppt_y-(0.354*#ppt_w-0.172*#ppt_h)"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="#ppt_y-(0.354*#ppt_w-0.172*#ppt_h)-#ppt_h/2"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animY3Id}" dur="${dur3}" fill="hold">
							<p:stCondLst><p:cond delay="${animY3Delay}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="#ppt_y-(0.354*#ppt_w-0.172*#ppt_h)"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="#ppt_y"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>`;
	} else {
		// Exit: Simple fall (2 anim + 1 set)
		const dur = 700;
		const animRotId = getNextAnimationId();
		const animYId = getNextAnimationId();
		const setVisId = getNextAnimationId();

		childElements = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animRotId}" dur="${dur}">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>style.rotation</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:fltVal val="0"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:fltVal val="45"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animYId}" dur="${dur}">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="ppt_y"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="ppt_y+1"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setVisId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="${dur - 1}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>`;
	}
	return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" accel="50000" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:iterate type="lt">
				<p:tmPct val="50000"/>
			</p:iterate>
			<p:childTnLst>
				${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
