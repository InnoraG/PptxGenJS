import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build Rise Up/Sink Down animation (presetID=37)
 * 
 * ENTRANCE (Rise Up):
 * - Visibility setter (1ms, dur=1, delay=0)
 * - Fade effect (700ms)
 * - X animation (700ms, no movement: #ppt_x → #ppt_x)
 * - Y animation phase 1 (630ms with decel, moving up: #ppt_y+1 → #ppt_y-.03)
 * - Y animation phase 2 (70ms with accel, delay=630ms, bounce: #ppt_y-.03 → #ppt_y)
 * 
 * EXIT (Sink Down):
 * - Fade effect (700ms)
 * - X animation (700ms, no movement: ppt_x → ppt_x - NO # prefix)
 * - Y animation phase 1 (70ms with decel, moving down: ppt_y → ppt_y-.03)
 * - Y animation phase 2 (630ms with accel, delay=70ms, bounce: ppt_y-.03 → ppt_y+1)
 * - Visibility setter (1ms, dur=1, delay=699, hide)
 * 
 * Key: Exit has NO # prefix in formulas and element order is reversed (visibility at END)
 */
export function buildRiseUpAnimation(ctx: AnimationBuildContext): string {
	const { shapeId, animation, config, type, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
	const duration = animation.duration || config.defaultDuration || 500;
	const delay = animation.delay ?? config.defaultDelay ?? 0
	const isEntrance = type === 'entrance';
	const presetClass = isEntrance ? 'entr' : 'exit';
	const visibilityValue = isEntrance ? 'visible' : 'hidden';

	const DEFAULT_DURATION = 700;
	const scaleFactor = duration / DEFAULT_DURATION;
	const dur630 = Math.round(630 * scaleFactor);
	const dur70 = Math.round(70 * scaleFactor);
	const delay630 = Math.round(630 * scaleFactor);
	const delay699 = Math.max(0, Math.round((700 - 1) * scaleFactor));
	const delay70 = Math.round(70 * scaleFactor);

	// Build target XML
	let targetXml = `<p:spTgt spid="${shapeId}"/>`;
	if (target?.type === 'background') {
		targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
	} else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
		const idx = target.paragraphIndex;
		targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
	}

	// Generate IDs for all 5 elements
	const setId = getNextAnimationId();
	const effectId = getNextAnimationId();
	const animXId = getNextAnimationId();
	const animYPhase1Id = getNextAnimationId();
	const animYPhase2Id = getNextAnimationId();

	let childElements: string;

	if (isEntrance) {
		// ENTRANCE: Rise Up
		// Order: set → animEffect → anim(x) → anim(y phase1) → anim(y phase2)
		childElements = `
			<p:set>
				<p:cBhvr>
					<p:cTn id="${setId}" dur="1" fill="hold">
						<p:stCondLst>
							<p:cond delay="0" />
						</p:stCondLst>
					</p:cTn>
					<p:tgtEl>
						${targetXml}
					</p:tgtEl>
					<p:attrNameLst>
						<p:attrName>style.visibility</p:attrName>
					</p:attrNameLst>
				</p:cBhvr>
				<p:to>
					<p:strVal val="visible" />
				</p:to>
			</p:set>
			<p:animEffect transition="in" filter="fade">
				<p:cBhvr>
					<p:cTn id="${effectId}" dur="${duration}" />
					<p:tgtEl>
						${targetXml}
					</p:tgtEl>
				</p:cBhvr>
			</p:animEffect>
			<p:anim calcmode="lin" valueType="num">
				<p:cBhvr>
					<p:cTn id="${animXId}" dur="${duration}" fill="hold" />
					<p:tgtEl>
						${targetXml}
					</p:tgtEl>
					<p:attrNameLst>
						<p:attrName>ppt_x</p:attrName>
					</p:attrNameLst>
				</p:cBhvr>
				<p:tavLst>
					<p:tav tm="0">
						<p:val>
							<p:strVal val="#ppt_x" />
						</p:val>
					</p:tav>
					<p:tav tm="100000">
						<p:val>
							<p:strVal val="#ppt_x" />
						</p:val>
					</p:tav>
				</p:tavLst>
			</p:anim>
			<p:anim calcmode="lin" valueType="num">
				<p:cBhvr>
					<p:cTn id="${animYPhase1Id}" dur="${dur630}" decel="100000" fill="hold" />
					<p:tgtEl>
						${targetXml}
					</p:tgtEl>
					<p:attrNameLst>
						<p:attrName>ppt_y</p:attrName>
					</p:attrNameLst>
				</p:cBhvr>
				<p:tavLst>
					<p:tav tm="0">
						<p:val>
							<p:strVal val="#ppt_y+1" />
						</p:val>
					</p:tav>
					<p:tav tm="100000">
						<p:val>
							<p:strVal val="#ppt_y-.03" />
						</p:val>
					</p:tav>
				</p:tavLst>
			</p:anim>
			<p:anim calcmode="lin" valueType="num">
				<p:cBhvr>
					<p:cTn id="${animYPhase2Id}" dur="${dur70}" accel="100000" fill="hold">
						<p:stCondLst>
							<p:cond delay="${delay630}" />
						</p:stCondLst>
					</p:cTn>
					<p:tgtEl>
						${targetXml}
					</p:tgtEl>
					<p:attrNameLst>
						<p:attrName>ppt_y</p:attrName>
					</p:attrNameLst>
				</p:cBhvr>
				<p:tavLst>
					<p:tav tm="0">
						<p:val>
							<p:strVal val="#ppt_y-.03" />
						</p:val>
					</p:tav>
					<p:tav tm="100000">
						<p:val>
							<p:strVal val="#ppt_y" />
						</p:val>
					</p:tav>
				</p:tavLst>
			</p:anim>
		`;
	} else {
		// EXIT: Sink Down
		// Order: animEffect → anim(x) → anim(y phase1) → anim(y phase2) → set
		// NO # prefix in formulas, visibility setter at END
		childElements = `
			<p:animEffect transition="out" filter="fade">
				<p:cBhvr>
					<p:cTn id="${effectId}" dur="${duration}" />
					<p:tgtEl>
						${targetXml}
					</p:tgtEl>
				</p:cBhvr>
			</p:animEffect>
			<p:anim calcmode="lin" valueType="num">
				<p:cBhvr>
					<p:cTn id="${animXId}" dur="${duration}" />
					<p:tgtEl>
						${targetXml}
					</p:tgtEl>
					<p:attrNameLst>
						<p:attrName>ppt_x</p:attrName>
					</p:attrNameLst>
				</p:cBhvr>
				<p:tavLst>
					<p:tav tm="0">
						<p:val>
							<p:strVal val="ppt_x" />
						</p:val>
					</p:tav>
					<p:tav tm="100000">
						<p:val>
							<p:strVal val="ppt_x" />
						</p:val>
					</p:tav>
				</p:tavLst>
			</p:anim>
			<p:anim calcmode="lin" valueType="num">
				<p:cBhvr>
					<p:cTn id="${animYPhase1Id}" dur="${dur70}" decel="100000" />
					<p:tgtEl>
						${targetXml}
					</p:tgtEl>
					<p:attrNameLst>
						<p:attrName>ppt_y</p:attrName>
					</p:attrNameLst>
				</p:cBhvr>
				<p:tavLst>
					<p:tav tm="0">
						<p:val>
							<p:strVal val="ppt_y" />
						</p:val>
					</p:tav>
					<p:tav tm="100000">
						<p:val>
							<p:strVal val="ppt_y-.03" />
						</p:val>
					</p:tav>
				</p:tavLst>
			</p:anim>
			<p:anim calcmode="lin" valueType="num">
				<p:cBhvr>
					<p:cTn id="${animYPhase2Id}" dur="${dur630}" accel="100000">
						<p:stCondLst>
							<p:cond delay="${delay70}" />
						</p:stCondLst>
					</p:cTn>
					<p:tgtEl>
						${targetXml}
					</p:tgtEl>
					<p:attrNameLst>
						<p:attrName>ppt_y</p:attrName>
					</p:attrNameLst>
				</p:cBhvr>
				<p:tavLst>
					<p:tav tm="0">
						<p:val>
							<p:strVal val="ppt_y" />
						</p:val>
					</p:tav>
					<p:tav tm="100000">
						<p:val>
							<p:strVal val="ppt_y+1" />
						</p:val>
					</p:tav>
				</p:tavLst>
			</p:anim>
			<p:set>
				<p:cBhvr>
					<p:cTn id="${setId}" dur="1" fill="hold">
						<p:stCondLst>
							<p:cond delay="${delay699}" />
						</p:stCondLst>
					</p:cTn>
					<p:tgtEl>
						${targetXml}
					</p:tgtEl>
					<p:attrNameLst>
						<p:attrName>style.visibility</p:attrName>
					</p:attrNameLst>
				</p:cBhvr>
				<p:to>
					<p:strVal val="hidden" />
				</p:to>
			</p:set>
		`;
	}
	return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
			<p:childTnLst>
				${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
