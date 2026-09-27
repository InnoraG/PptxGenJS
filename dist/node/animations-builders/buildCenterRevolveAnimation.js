import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
/**
 * Build CenterRevolve animation (presetID 43)
 * Entrance: Circular revolve motion from center
 * Exit: Reverse circular revolve motion to center
 * Verified from Focused_EntranceExit_Showcase_BATCH2_FIX_v6_spidlabels_v4_FLOATTRANSPLANT_CLEAN.pptx slide8.xml
 *
 * Element structure: set + animEffect(fade) + anim(ppt_x static) + anim(ppt_y static) + anim(ppt_x revolve) + anim(ppt_y revolve)
 * Timing: Phase 1 (280ms) - static hold, Phase 2 (420ms) - circular revolve motion
 */
export function buildCenterRevolveAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, type, ids, target, sequence } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 500;
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    const DEFAULT_DURATION = 700;
    const scaleFactor = duration / DEFAULT_DURATION;
    const dur70 = Math.round(70 * scaleFactor);
    const dur280 = Math.round(280 * scaleFactor);
    const dur420 = Math.round(420 * scaleFactor);
    const presetSubtype = 0;
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    const setId = getNextAnimationId();
    const effectId = getNextAnimationId();
    const anim1Id = getNextAnimationId();
    const anim2Id = getNextAnimationId();
    const anim3Id = getNextAnimationId();
    const anim4Id = getNextAnimationId();
    // Exit vs Entrance differences:
    // - Entrance: set FIRST (delay=0), WITH fill="hold" on inner anim
    // - Exit: set LAST (delay=duration-1), NO fill="hold" on inner anim
    const innerFill = isEntrance ? ' fill="hold"' : '';
    const setDelay = isEntrance ? 0 : 699; // CenterRevolve uses 700ms total, so exit set at 699
    // Visibility setter - appear at start for entrance, disappear at end for exit
    const setElement = `<p:set>
		<p:cBhvr>
			<p:cTn id="${setId}" dur="1" fill="hold">
				<p:stCondLst><p:cond delay="${setDelay}"/></p:stCondLst>
			</p:cTn>
			<p:tgtEl>${targetXml}</p:tgtEl>
			<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
		</p:cBhvr>
		<p:to><p:strVal val="${visibilityValue}"/></p:to>
	</p:set>`;
    // Fade effect element (70ms duration) - NEVER has fill="hold" (verified from frozen reference)
    const effectDelay = isEntrance ? 0 : (duration - 70);
    const effectElement = `<p:animEffect transition="${isEntrance ? 'in' : 'out'}" filter="fade">
		<p:cBhvr>
			<p:cTn id="${effectId}" dur="${dur70}">
				${effectDelay > 0 ? '<p:stCondLst><p:cond delay="' + effectDelay + '"/></p:stCondLst>' : ''}
			</p:cTn>
			<p:tgtEl>${targetXml}</p:tgtEl>
		</p:cBhvr>
	</p:animEffect>`;
    // Phase timing is REVERSED for exit vs entrance
    // Entrance: Phase 1 (static hold) first, then Phase 2 (circular motion)
    // Exit: Phase 2 (circular motion) first, then Phase 1 (static hold)
    const phase1Delay = isEntrance ? 0 : 420;
    const phase2Delay = isEntrance ? 280 : 0;
    // Formula patterns differ between entrance and exit:
    // Entrance Phase 1 (static hold): holds at offset (#ppt_x, #ppt_y+0.31)
    // Entrance Phase 2 (circular): goes from offset to natural
    // Exit Phase 1 (static hold): holds at NATURAL position (ppt_x, ppt_y) - NOT offset!
    // Exit Phase 2 (circular): goes from natural up to offset peak
    const xStatic = isEntrance ? '#ppt_x' : 'ppt_x';
    const yStatic = isEntrance ? '#ppt_y+0.31' : 'ppt_y';
    // For circular motion phase:
    // Entrance: starts at current (#ppt_x), goes through offsets, ends at natural (#ppt_x)
    // Exit: starts at natural (ppt_x), goes through offsets, peaks at offset
    // X needs different formatting: entrance uses +0.1550, exit uses +0.155
    const xCircularBase = isEntrance ? '#ppt_x' : 'ppt_x';
    const yCircularBase = isEntrance ? '#ppt_y' : 'ppt_y';
    const xPeakOffset = isEntrance ? '0.1550' : '0.155';
    // Phase 1: Static hold animations (280ms)
    const anim1Element = `<p:anim calcmode="lin" valueType="num">
		<p:cBhvr>
			<p:cTn id="${anim1Id}" dur="${dur280}"${phase1Delay > 0 ? '' : ' fill="hold"'}>
				${phase1Delay > 0 ? '<p:stCondLst><p:cond delay="' + phase1Delay + '"/></p:stCondLst>' : ''}
			</p:cTn>
			<p:tgtEl>${targetXml}</p:tgtEl>
			<p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst>
		</p:cBhvr>
		<p:tavLst>
			<p:tav tm="0"><p:val><p:strVal val="${xStatic}"/></p:val></p:tav>
			<p:tav tm="100000"><p:val><p:strVal val="${xStatic}"/></p:val></p:tav>
		</p:tavLst>
	</p:anim>`;
    const anim2Element = `<p:anim calcmode="lin" valueType="num">
		<p:cBhvr>
			<p:cTn id="${anim2Id}" dur="${dur280}"${phase1Delay > 0 ? '' : ' fill="hold"'}>
				${phase1Delay > 0 ? '<p:stCondLst><p:cond delay="' + phase1Delay + '"/></p:stCondLst>' : ''}
			</p:cTn>
			<p:tgtEl>${targetXml}</p:tgtEl>
			<p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst>
		</p:cBhvr>
		<p:tavLst>
			<p:tav tm="0"><p:val><p:strVal val="${yStatic}"/></p:val></p:tav>
			<p:tav tm="100000"><p:val><p:strVal val="${yStatic}"/></p:val></p:tav>
		</p:tavLst>
	</p:anim>`;
    // Phase 2: Circular motion animations (420ms, decel 50%)
    // Entrance Y: starts at offset (#ppt_y+0.31), goes down to natural (#ppt_y)
    // Exit Y: starts at natural (ppt_y), goes through offsets, back to natural (ppt_y)
    const anim3Element = `<p:anim calcmode="lin" valueType="num">
		<p:cBhvr>
			<p:cTn id="${anim3Id}" dur="${dur420}" decel="50000"${phase2Delay > 0 ? ' fill="hold"' : ''}>
				${phase2Delay > 0 ? '<p:stCondLst><p:cond delay="' + phase2Delay + '"/></p:stCondLst>' : '<p:stCondLst><p:cond delay="0"/></p:stCondLst>'}
			</p:cTn>
			<p:tgtEl>${targetXml}</p:tgtEl>
			<p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst>
		</p:cBhvr>
		<p:tavLst>
			<p:tav tm="0"><p:val><p:strVal val="${xCircularBase}"/></p:val></p:tav>
			<p:tav tm="5000"><p:val><p:strVal val="${xCircularBase}+0.0242"/></p:val></p:tav>
			<p:tav tm="10000"><p:val><p:strVal val="${xCircularBase}+0.0479"/></p:val></p:tav>
			<p:tav tm="15000"><p:val><p:strVal val="${xCircularBase}+0.0704"/></p:val></p:tav>
			<p:tav tm="20000"><p:val><p:strVal val="${xCircularBase}+0.0911"/></p:val></p:tav>
			<p:tav tm="25000"><p:val><p:strVal val="${xCircularBase}+0.1096"/></p:val></p:tav>
			<p:tav tm="30000"><p:val><p:strVal val="${xCircularBase}+0.1254"/></p:val></p:tav>
			<p:tav tm="35000"><p:val><p:strVal val="${xCircularBase}+0.1381"/></p:val></p:tav>
			<p:tav tm="40000"><p:val><p:strVal val="${xCircularBase}+0.1474"/></p:val></p:tav>
			<p:tav tm="45000"><p:val><p:strVal val="${xCircularBase}+0.1531"/></p:val></p:tav>
			<p:tav tm="50000"><p:val><p:strVal val="${xCircularBase}+${xPeakOffset}"/></p:val></p:tav>
			<p:tav tm="55000"><p:val><p:strVal val="${xCircularBase}+0.1531"/></p:val></p:tav>
			<p:tav tm="60000"><p:val><p:strVal val="${xCircularBase}+0.1474"/></p:val></p:tav>
			<p:tav tm="65000"><p:val><p:strVal val="${xCircularBase}+0.1381"/></p:val></p:tav>
			<p:tav tm="70000"><p:val><p:strVal val="${xCircularBase}+0.1254"/></p:val></p:tav>
			<p:tav tm="75000"><p:val><p:strVal val="${xCircularBase}+0.1096"/></p:val></p:tav>
			<p:tav tm="80000"><p:val><p:strVal val="${xCircularBase}+0.0911"/></p:val></p:tav>
			<p:tav tm="85000"><p:val><p:strVal val="${xCircularBase}+0.0704"/></p:val></p:tav>
			<p:tav tm="90000"><p:val><p:strVal val="${xCircularBase}+0.0479"/></p:val></p:tav>
			<p:tav tm="95000"><p:val><p:strVal val="${xCircularBase}+0.0242"/></p:val></p:tav>
			<p:tav tm="100000"><p:val><p:strVal val="${xCircularBase}"/></p:val></p:tav>
		</p:tavLst>
	</p:anim>`;
    // Y circular motion keyframes differ between entrance and exit
    // Entrance: starts high (0.31), decreases to 0
    // Exit: starts low (0), increases to peak (0.155), decreases back to 0
    const yCircularStart = isEntrance ? `${yCircularBase}+0.31` : yCircularBase;
    const yCircularEnd = yCircularBase;
    let anim4Element;
    if (isEntrance) {
        // Entrance: Y goes from offset (0.31) down to natural (0)
        anim4Element = `<p:anim calcmode="lin" valueType="num">
			<p:cBhvr>
				<p:cTn id="${anim4Id}" dur="${dur420}" decel="50000"${phase2Delay > 0 ? ' fill="hold"' : ''}>
					${phase2Delay > 0 ? '<p:stCondLst><p:cond delay="' + phase2Delay + '"/></p:stCondLst>' : '<p:stCondLst><p:cond delay="0"/></p:stCondLst>'}
				</p:cTn>
				<p:tgtEl>${targetXml}</p:tgtEl>
				<p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst>
			</p:cBhvr>
			<p:tavLst>
				<p:tav tm="0"><p:val><p:strVal val="${yCircularStart}"/></p:val></p:tav>
				<p:tav tm="5000"><p:val><p:strVal val="${yCircularBase}+0.308"/></p:val></p:tav>
				<p:tav tm="10000"><p:val><p:strVal val="${yCircularBase}+0.3024"/></p:val></p:tav>
				<p:tav tm="15000"><p:val><p:strVal val="${yCircularBase}+0.2931"/></p:val></p:tav>
				<p:tav tm="20000"><p:val><p:strVal val="${yCircularBase}+0.2804"/></p:val></p:tav>
				<p:tav tm="25000"><p:val><p:strVal val="${yCircularBase}+0.2646"/></p:val></p:tav>
				<p:tav tm="30000"><p:val><p:strVal val="${yCircularBase}+0.2461"/></p:val></p:tav>
				<p:tav tm="35000"><p:val><p:strVal val="${yCircularBase}+0.2253"/></p:val></p:tav>
				<p:tav tm="40000"><p:val><p:strVal val="${yCircularBase}+0.2029"/></p:val></p:tav>
				<p:tav tm="45000"><p:val><p:strVal val="${yCircularBase}+0.1792"/></p:val></p:tav>
				<p:tav tm="50000"><p:val><p:strVal val="${yCircularBase}+0.155"/></p:val></p:tav>
				<p:tav tm="55000"><p:val><p:strVal val="${yCircularBase}+0.1307"/></p:val></p:tav>
				<p:tav tm="60000"><p:val><p:strVal val="${yCircularBase}+0.1071"/></p:val></p:tav>
				<p:tav tm="65000"><p:val><p:strVal val="${yCircularBase}+0.0846"/></p:val></p:tav>
				<p:tav tm="70000"><p:val><p:strVal val="${yCircularBase}+0.0639"/></p:val></p:tav>
				<p:tav tm="75000"><p:val><p:strVal val="${yCircularBase}+0.0454"/></p:val></p:tav>
				<p:tav tm="80000"><p:val><p:strVal val="${yCircularBase}+0.0296"/></p:val></p:tav>
				<p:tav tm="85000"><p:val><p:strVal val="${yCircularBase}+0.0169"/></p:val></p:tav>
				<p:tav tm="90000"><p:val><p:strVal val="${yCircularBase}+0.0076"/></p:val></p:tav>
				<p:tav tm="95000"><p:val><p:strVal val="${yCircularBase}+0.0019"/></p:val></p:tav>
				<p:tav tm="100000"><p:val><p:strVal val="${yCircularEnd}"/></p:val></p:tav>
			</p:tavLst>
		</p:anim>`;
    }
    else {
        // Exit: Y goes from natural (0) UP to peak (0.31) - copied exactly from reference
        anim4Element = `<p:anim calcmode="lin" valueType="num">
			<p:cBhvr>
				<p:cTn id="${anim4Id}" dur="${dur420}" decel="50000"${phase2Delay > 0 ? ' fill="hold"' : ''}>
					${phase2Delay > 0 ? '<p:stCondLst><p:cond delay="' + phase2Delay + '"/></p:stCondLst>' : '<p:stCondLst><p:cond delay="0"/></p:stCondLst>'}
				</p:cTn>
				<p:tgtEl>${targetXml}</p:tgtEl>
				<p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst>
			</p:cBhvr>
			<p:tavLst>
				<p:tav tm="0"><p:val><p:strVal val="${yCircularBase}"/></p:val></p:tav>
				<p:tav tm="5000"><p:val><p:strVal val="${yCircularBase}+0.0019"/></p:val></p:tav>
				<p:tav tm="10000"><p:val><p:strVal val="${yCircularBase}+0.0076"/></p:val></p:tav>
				<p:tav tm="15000"><p:val><p:strVal val="${yCircularBase}+0.0169"/></p:val></p:tav>
				<p:tav tm="20000"><p:val><p:strVal val="${yCircularBase}+0.0296"/></p:val></p:tav>
				<p:tav tm="25000"><p:val><p:strVal val="${yCircularBase}+0.0454"/></p:val></p:tav>
				<p:tav tm="30000"><p:val><p:strVal val="${yCircularBase}+0.0639"/></p:val></p:tav>
				<p:tav tm="35000"><p:val><p:strVal val="${yCircularBase}+0.0846"/></p:val></p:tav>
				<p:tav tm="40000"><p:val><p:strVal val="${yCircularBase}+0.1071"/></p:val></p:tav>
				<p:tav tm="45000"><p:val><p:strVal val="${yCircularBase}+0.1307"/></p:val></p:tav>
				<p:tav tm="50000"><p:val><p:strVal val="${yCircularBase}+0.155"/></p:val></p:tav>
				<p:tav tm="55000"><p:val><p:strVal val="${yCircularBase}+0.1792"/></p:val></p:tav>
				<p:tav tm="60000"><p:val><p:strVal val="${yCircularBase}+0.2029"/></p:val></p:tav>
				<p:tav tm="65000"><p:val><p:strVal val="${yCircularBase}+0.2253"/></p:val></p:tav>
				<p:tav tm="70000"><p:val><p:strVal val="${yCircularBase}+0.2461"/></p:val></p:tav>
				<p:tav tm="75000"><p:val><p:strVal val="${yCircularBase}+0.2646"/></p:val></p:tav>
				<p:tav tm="80000"><p:val><p:strVal val="${yCircularBase}+0.2804"/></p:val></p:tav>
				<p:tav tm="85000"><p:val><p:strVal val="${yCircularBase}+0.2931"/></p:val></p:tav>
				<p:tav tm="90000"><p:val><p:strVal val="${yCircularBase}+0.3024"/></p:val></p:tav>
				<p:tav tm="95000"><p:val><p:strVal val="${yCircularBase}+0.308"/></p:val></p:tav>
				<p:tav tm="100000"><p:val><p:strVal val="${yCircularBase}+0.31"/></p:val></p:tav>
			</p:tavLst>
		</p:anim>`;
    }
    // Element order differs between entrance and exit:
    // Entrance: set (visibility) -> effect (fade) -> anims (motion)
    // Exit: anims (motion) -> effect (fade) -> set (visibility hide)
    // Exit Order: Interleaved X/Y (Circular X, Static X, Circular Y, Static Y) to match delays
    const childElements = isEntrance
        ? `${setElement}
		${effectElement}
		${anim1Element}
		${anim2Element}
		${anim3Element}
		${anim4Element}`
        : `${anim3Element}
		${anim1Element}
		${anim4Element}
		${anim2Element}
		${effectElement}
		${setElement}`;
    // ✅ FIXED: Return single animation with proper targeting
    // The V3 engine will handle wrapping for allAtOnce/byParagraph modes
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="${presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
			<p:childTnLst>
				${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
//# sourceMappingURL=buildCenterRevolveAnimation.js.map