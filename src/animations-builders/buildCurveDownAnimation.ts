import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build Curve Down animation (presetID=52, exit version)
 * Structure: set + animScale + animMotion + animEffect
 * Total: 4 elements
 *
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_BATCH2_FIX_v6_spidlabels_v4_FLOATTRANSPLANT_CLEAN.pptx slide 5 (exit)
 */
export function buildCurveDownAnimation(ctx: AnimationBuildContext): string {
	const { shapeId, animation, config, type, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
	const duration = animation.duration || config.defaultDuration || 700;
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
	const scaleId = getNextAnimationId();
	const motionId = getNextAnimationId();
	const effectId = getNextAnimationId();

	// The motion path for curve down (inverted from curveUp)
	// Verified from frozen reference: Exit path matches Entrance path exactly
	const motionPath = 'M 0.0000 0.0000 C 0.03802 0.0 0.1441 0.02341 0.1826 0.0915 C 0.22118 0.15964 0.24705 0.31256 0.2318 0.4083 C 0.21649 0.50394 0.20747 0.57948 0.0908 0.6661 C -0.02552 0.75279 -0.37517 0.88508 -0.4674 0.9289';

	// Scale from 250% to 100% for entrance, reverse for exit
	const scaleFrom = isEntrance ? '250000' : '100000';
	const scaleTo = isEntrance ? '100000' : '250000';

	// Exit order: animScale → animMotion → animEffect → set (set comes LAST with delay=duration-1)
	// Exit uses accel="50000" (acceleration), NO fill="hold" on animScale/animMotion
	// Entrance order: set → animScale → animMotion → animEffect (set comes FIRST)
	// Entrance uses decel="50000" (deceleration), WITH fill="hold" on animScale/animMotion
	
	const timingAttr = isEntrance ? 'decel="50000"' : 'accel="50000"';
	const innerFill = isEntrance ? ' fill="hold"' : '';
	const setDelay = isEntrance ? 0 : duration - 1;  // Exit: set fires at end (699 for 700ms)
	
	let childElements: string;
	if (isEntrance) {
		// Entrance: set → animScale → animMotion → animEffect
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
				<p:animScale>
					<p:cBhvr>
						<p:cTn id="${scaleId}" dur="${duration}" ${timingAttr}${innerFill}>
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
					<p:from x="${scaleFrom}" y="${scaleFrom}"/>
					<p:to x="${scaleTo}" y="${scaleTo}"/>
				</p:animScale>
				<p:animMotion origin="layout" path="${motionPath}" pathEditMode="relative" ptsTypes="">
					<p:cBhvr>
						<p:cTn id="${motionId}" dur="${duration}" ${timingAttr}${innerFill}>
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:animMotion>
				<p:animEffect transition="in" filter="fade">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>`;
	} else {
		// Exit: animScale → animMotion → animEffect → set (NO fill="hold" on inner elements)
		childElements = `
				<p:animScale>
					<p:cBhvr>
						<p:cTn id="${scaleId}" dur="${duration}" ${timingAttr}>
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
					<p:from x="${scaleFrom}" y="${scaleFrom}"/>
					<p:to x="${scaleTo}" y="${scaleTo}"/>
				</p:animScale>
				<p:animMotion origin="layout" path="${motionPath}" pathEditMode="relative" ptsTypes="">
					<p:cBhvr>
						<p:cTn id="${motionId}" dur="${duration}" ${timingAttr}>
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:animMotion>
				<p:animEffect transition="out" filter="fade">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>
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

	return result;
}
