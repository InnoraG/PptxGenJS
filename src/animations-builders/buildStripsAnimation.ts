import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build Strips animation (presetID=18 for Batch2)
 * Structure: 1 set (visibility) + 1 animEffect (with filter)
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_BATCH2_FIX_v6_spidlabels_v4_FLOATTRANSPLANT_CLEAN.pptx slide 1
 */
export function buildStripsAnimation(ctx: AnimationBuildContext): string {

	console.log(`[STRIPS TEMPLATE] Called for spid=${ctx.shapeId}, direction=${ctx.directionConfig?.name}`);

	const { shapeId, animation, config, directionConfig, type, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
	const duration = animation.duration || config.defaultDuration || 700;
	const delay = animation.delay ?? config.defaultDelay ?? 0

	const isEntrance = type === 'entrance';
	const presetClass = isEntrance ? 'entr' : 'exit';
	const visibilityValue = isEntrance ? 'visible' : 'hidden';
	const presetSubtype = directionConfig?.presetSubtype || 0;
	// Entrance: set visibility immediately (delay=0)
	// Exit: set visibility to hidden at end of animation (duration - 1)
	const setDelay = isEntrance ? 0 : (duration - 1);

	// Map presetSubtype to filter direction
	const filterMap: { [key: number]: string } = {
		9: 'upLeft',     // topLeft
		3: 'upRight',    // topRight
		12: 'downLeft',  // bottomLeft
		6: 'downRight'   // bottomRight
	};
	const filterDir = filterMap[presetSubtype] || 'upLeft';

	// Build target XML
	let targetXml = `<p:spTgt spid="${shapeId}"/>`;
	if (target?.type === 'background') {
		targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
	} else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
		const idx = target.paragraphIndex;
		targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
	}

	// Generate IDs for visibility setter and animEffect
	const setId = getNextAnimationId();
	const effectId = getNextAnimationId();

	// Build individual elements
	const setElement = `<p:set>
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
	
	const animEffectElement = `<p:animEffect transition="${isEntrance ? 'in' : 'out'}" filter="strips(${filterDir})">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>`;
	
	// Element order depends on entrance vs exit
	// Entrance: set -> animEffect, Exit: animEffect -> set
	const childElements = isEntrance
		? `
				${setElement}
				${animEffectElement}`
		: `
				${animEffectElement}
				${setElement}`;

	// Use fixed delay of 150ms for Batch2 Strips
	const fixedDelay = 150;
	const result = `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="${presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${fixedDelay}"/>
			</p:stCondLst>
			<p:childTnLst>
				${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;

	console.log(`[STRIPS TEMPLATE] Returning XML with 2 sub-elements (set + animEffect)`);

	return result;
}
