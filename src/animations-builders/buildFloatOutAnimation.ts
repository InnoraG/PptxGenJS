import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build Float Out animation (presetID=47)
 * Structure: set + animEffect + anim(ppt_x) + anim(ppt_y)
 * Total: 4 elements
 *
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_BATCH2_FIX_v6_spidlabels_v4_FLOATTRANSPLANT_CLEAN.pptx slide 4 (exit)
 */
export function buildFloatOutAnimation(ctx: AnimationBuildContext): string {
	const { shapeId, animation, config, type, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
	const duration = animation.duration || config.defaultDuration || 1000;
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

	// Generate IDs for all 4 sub-elements
	const setId = getNextAnimationId();
	const effectId = getNextAnimationId();
	const animXId = getNextAnimationId();
	const animYId = getNextAnimationId();

	// For Float In (entrance): moves from below up to position
	// For Float Out (exit): moves from position down below
	// NOTE: Entrance uses # prefix; exit uses literal values without #
	const xFrom = isEntrance ? '#ppt_x' : 'ppt_x';
	const xTo = isEntrance ? '#ppt_x' : 'ppt_x';
	const yFrom = isEntrance ? '#ppt_y+.1' : 'ppt_y';
	const yTo = isEntrance ? '#ppt_y' : 'ppt_y-.1';

	// Float Out (exit): animEffect → anim(x) → anim(y) → set (set LAST, NO fill on inner elements)
	// Float In (entrance): set → animEffect → anim(x) → anim(y) (set FIRST, WITH fill on inner elements)
	const innerFill = isEntrance ? ' fill="hold"' : '';
	const setDelay = isEntrance ? 0 : duration - 1;
	
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

	const animElements = `
				<p:animEffect transition="${isEntrance ? 'in' : 'out'}" filter="fade">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>
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
				</p:anim>
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

	// Order: Entrance = set + anims, Exit = anims + set
	const childElements = isEntrance 
		? setElement + animElements 
		: animElements + setElement;
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

	return result;
}
