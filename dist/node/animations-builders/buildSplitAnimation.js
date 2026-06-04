import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
/**
 * Build Split animation (presetID=30)
 *
 * Reference structure (slide 13):
 * - Entrance: set + animEffect + anim(rotation) + anim(ppt_x) + anim(ppt_y) + anim(ppt_x phase2) + anim(ppt_y phase2)
 * - Exit: animEffect + anim(rotation) + anim(ppt_x phase1) + anim(ppt_y phase1) + anim(ppt_x phase2) + anim(ppt_y phase2) + set
 *
 * Key characteristics:
 * - Uses 7 elements for entrance (set first), 7 for exit (set last)
 * - animEffect comes FIRST in childTnLst (not after anim elements)
 * - Two-phase motion: initial split movement + settling movement
 * - Rotation animation from -90° to 0° (entrance) or 0° to -90° (exit)
 * - Different durations: 560ms main, 140ms phase2
 * - delay="${delay150}" for main cTn, delay="${delay140}" or delay="${delay560}" for phase2 anims
 * - Uses accel/decel attributes: decel="100000" for main phase, accel="100000" for phase2
 */
export function buildSplitAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, type, ids, target } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 560;
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    // Internal timing constants for float (split) animation phases
    // delay140 = start of phase-2 exit elements (always 140ms = phase2Dur, absolute)
    // delay150 = outer cTn delay (scaled with user duration if customized)
    // delay560 = start of entrance phase-2 (always 560ms = mainDur, absolute)
    // These match PowerPoint/COM behavior: internal phase delays are fixed, not scaled
    const scaleFactor = duration / 700;
    const delay140 = 140; // Fixed: always phase2Dur (140ms) regardless of total duration
    const delay150 = Math.round(150 * scaleFactor);
    const delay560 = 560; // Fixed: always mainDur (560ms) regardless of total duration
    // Build target XML
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    // Phase durations
    const mainDur = 560;
    const phase2Dur = 140;
    // Generate IDs for all elements
    const setId = getNextAnimationId();
    const effectId = getNextAnimationId();
    const rotId = getNextAnimationId();
    const xId1 = getNextAnimationId();
    const yId1 = getNextAnimationId();
    const xId2 = getNextAnimationId();
    const yId2 = getNextAnimationId();
    // Rotation values (entrance vs exit)
    const rotFrom = isEntrance ? '-90' : '0';
    const rotTo = isEntrance ? '0' : '-90';
    // Position formulas for entrance vs exit
    // Entrance: Phase 1 (0-560ms) = large movement, Phase 2 (560-700ms) = settling
    // Exit: Phase 1 (0-140ms) = settling, Phase 2 (140-700ms) = large movement
    // For entrance phase1 (large movement) / exit phase2 (large movement)
    const xLargeFrom = isEntrance ? '#ppt_x+0.4' : 'ppt_x';
    const xLargeTo = isEntrance ? '#ppt_x-0.05' : 'ppt_x+0.4+0.05';
    const yLargeFrom = isEntrance ? '#ppt_y-0.4' : 'ppt_y';
    const yLargeTo = isEntrance ? '#ppt_y+0.1' : 'ppt_y-0.4-0.1';
    // For entrance phase2 (settling) / exit phase1 (settling)
    const xSmallFrom = isEntrance ? '#ppt_x-0.05' : 'ppt_x';
    const xSmallTo = isEntrance ? '#ppt_x' : 'ppt_x-0.05';
    const ySmallFrom = isEntrance ? '#ppt_y+0.1' : 'ppt_y';
    const ySmallTo = isEntrance ? '#ppt_y' : 'ppt_y+0.1';
    // Visibility timing
    const visDelay = isEntrance ? 0 : 699;
    // Transition for animEffect
    const transition = isEntrance ? 'in' : 'out';
    // Build child elements based on entrance/exit
    let childElements = '';
    if (isEntrance) {
        // Entrance: set + animEffect + anim(rotation) + anim(ppt_x) + anim(ppt_y) + anim(ppt_x phase2) + anim(ppt_y phase2)
        childElements = `
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="${visDelay}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>
				<p:animEffect transition="${transition}" filter="fade">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${mainDur}" decel="100000"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${rotId}" dur="${mainDur}" decel="100000" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.rotation</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:fltVal val="${rotFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:fltVal val="${rotTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${xId1}" dur="${mainDur}" decel="100000" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${xLargeFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${xLargeTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${yId1}" dur="${mainDur}" decel="100000" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${yLargeFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${yLargeTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${xId2}" dur="${phase2Dur}" accel="100000" fill="hold">
							<p:stCondLst><p:cond delay="${mainDur}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${xSmallFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${xSmallTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${yId2}" dur="${phase2Dur}" accel="100000" fill="hold">
							<p:stCondLst><p:cond delay="${mainDur}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${ySmallFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${ySmallTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>`;
    }
    else {
        // Exit: animEffect + anim(rotation) + anim(ppt_x phase1) + anim(ppt_y phase1) + anim(ppt_x phase2) + anim(ppt_y phase2) + set
        childElements = `
				<p:animEffect transition="${transition}" filter="fade">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${mainDur}" accel="100000">
							<p:stCondLst><p:cond delay="${delay140}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${rotId}" dur="${mainDur}" accel="100000">
							<p:stCondLst><p:cond delay="${delay140}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.rotation</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:fltVal val="${rotFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:fltVal val="${rotTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${xId1}" dur="${phase2Dur}" decel="100000"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${xSmallFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${xSmallTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${yId1}" dur="${phase2Dur}" decel="100000"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${ySmallFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${ySmallTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${xId2}" dur="${mainDur}" accel="100000">
							<p:stCondLst><p:cond delay="${delay140}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${xLargeFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${xLargeTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${yId2}" dur="${mainDur}" accel="100000">
							<p:stCondLst><p:cond delay="${delay140}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${yLargeFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${yLargeTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="${visDelay}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>`;
    }
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
//# sourceMappingURL=buildSplitAnimation.js.map