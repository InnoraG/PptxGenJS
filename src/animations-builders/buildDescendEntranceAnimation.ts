import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build Descend (Entrance variant) animation (presetID=47, presetClass=entr)
 * Structure: set + animEffect + anim(ppt_x) + anim(ppt_y)
 * Total: 4 elements
 *
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_BATCH2_FIX_v6_spidlabels_v4_FLOATTRANSPLANT_CLEAN.pptx slide 4 SPID 4
 * 
 * This is Descend used as an ENTRANCE animation:
 * - Object appears with fade-in
 * - Moves from below up to position (Y: #ppt_y-.1 → #ppt_y)
 * - X stays constant (#ppt_x → #ppt_x)
 */
export function buildDescendEntranceAnimation(ctx: AnimationBuildContext): string {
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

	// For Descend Entrance: moves from below (#ppt_y-.1) up to position (#ppt_y)
	const yFrom = isEntrance ? '#ppt_y-.1' : '#ppt_y';
	const yTo = isEntrance ? '#ppt_y' : '#ppt_y-.1';

	// Build the 4-element animation: set + animEffect + anim(x) + anim(y)
	const childElements = `
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
				<p:animEffect transition="${isEntrance ? 'in' : 'out'}" filter="fade">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>
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
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animYId}" dur="${duration}" fill="hold"/>
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
