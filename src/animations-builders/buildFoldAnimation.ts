import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build Fold animation (presetID=58)
 *
 * Structure:
 * - Entrance: set + anim(w) + anim(h) + anim(x) + anim(y) + animEffect
 * - Exit: anim(w) + anim(h) + anim(x) + anim(y) + animEffect + set
 *
 * Reference: Batch3 frozen reference slide16.xml (SPIDs 4, 7)
 */
export function buildFoldAnimation(ctx: AnimationBuildContext): string {
	const { shapeId, animation, config, type, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
	const duration = animation.duration || config.defaultDuration || 700;
	const delay = animation.delay ?? config.defaultDelay ?? 0
	const isEntrance = type === 'entrance';
	const presetClass = isEntrance ? 'entr' : 'exit';
	const visibilityValue = isEntrance ? 'visible' : 'hidden';
	const transition = isEntrance ? 'in' : 'out';
	const easingAttr = isEntrance ? 'accel="100000"' : 'decel="100000"';

	// Build target XML based on sequence mode
	let targetXml = `<p:spTgt spid="${shapeId}"/>`;
	if (target?.type === 'background') {
		targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
	} else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
		const idx = target.paragraphIndex;
		targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
	}

	const setId = getNextAnimationId();
	const animWId = getNextAnimationId();
	const animHId = getNextAnimationId();
	const animXId = getNextAnimationId();
	const animYId = getNextAnimationId();
	const effectId = getNextAnimationId();

	const animFill = isEntrance ? ' fill="hold"' : '';
	const setDelay = isEntrance ? 0 : Math.max(0, duration - 1);

	const wFrom = isEntrance ? '#ppt_w*2.5' : 'ppt_w';
	const wTo = isEntrance ? '#ppt_w' : 'ppt_w*2.5';
	const hFrom = isEntrance ? '#ppt_h*0.01' : 'ppt_h';
	const hTo = isEntrance ? '#ppt_h' : 'ppt_h*0.01';
	const xFrom = isEntrance ? '#ppt_x' : 'ppt_x';
	const xTo = isEntrance ? '#ppt_x' : 'ppt_x';
	const yFrom = isEntrance ? '#ppt_h+1' : 'ppt_y';
	const yTo = isEntrance ? '#ppt_y' : 'ppt_h+1';

	const setElement = `
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="${setDelay}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>`;

	const animWElement = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animWId}" dur="${duration}"${animFill}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_w</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${wFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${wTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>`;

	const animHElement = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animHId}" dur="${duration}"${animFill}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_h</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${hFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${hTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>`;

	const animXElement = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animXId}" dur="${duration}"${animFill}/>
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

	const animYElement = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animYId}" dur="${duration}"${animFill}/>
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

	const effectElement = `
				<p:animEffect transition="${transition}" filter="fade">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>`;

	const childElements = isEntrance
		? `${setElement}${animWElement}${animHElement}${animXElement}${animYElement}${effectElement}`
		: `${animWElement}${animHElement}${animXElement}${animYElement}${effectElement}${setElement}`;
	return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" ${easingAttr} fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>
				${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
