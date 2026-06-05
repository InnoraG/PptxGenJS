import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build Curve Up animation (presetID=52)
 * Structure: set + animScale + animMotion + animEffect
 * Total: 4 elements
 *
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_BATCH2_FIX_v6_spidlabels_v4_FLOATTRANSPLANT_CLEAN.pptx slide 5
 */
export function buildCurveUpAnimation(ctx: AnimationBuildContext): string {
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

	// The motion path for curve up (from reference)
	const motionPath = isEntrance
		? 'M -0.46736 0.92887  C -0.37517 0.88508  -0.02552 0.75279  0.0908 0.66613  C  0.20747 0.57948  0.21649 0.50394  0.23177 0.40825  C 0.24705 0.31256  0.22118 0.15964   0.18264 0.09152  C 0.1441 0.02341  0.03802 0.0  0.0 0.0  '
		: 'M 0.0 0.0  C 0.03802 0.0  0.1441 0.02341  0.18264 0.09152  C 0.22118 0.15964  0.24705 0.31256  0.23177 0.40825  C 0.21649 0.50394  0.20747 0.57948  0.0908 0.66613  C -0.02552 0.75279  -0.37517 0.88508  -0.46736 0.92887  ';

	// Scale from 250% to 100% for entrance, reverse for exit
	const scaleFrom = isEntrance ? '250000' : '100000';
	const scaleTo = isEntrance ? '100000' : '250000';

	// Build the 4-element animation: set + animScale + animMotion + animEffect
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
				<p:animScale>
					<p:cBhvr>
						<p:cTn id="${scaleId}" dur="${duration}" decel="50000" fill="hold">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
					<p:from x="${scaleFrom}" y="${scaleFrom}"/>
					<p:to x="${scaleTo}" y="${scaleTo}"/>
				</p:animScale>
				<p:animMotion origin="layout" path="${motionPath}" pathEditMode="relative" ptsTypes="">
					<p:cBhvr>
						<p:cTn id="${motionId}" dur="${duration}" decel="50000" fill="hold">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:animMotion>
				<p:animEffect transition="${isEntrance ? 'in' : 'out'}" filter="fade">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>`;
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
