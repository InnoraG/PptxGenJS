import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
/**
 * Build Spinner animation (presetID=49)
 * Structure: set + 3 anim (ppt_w, ppt_h, style.rotation) + animEffect
 * Total: 5 elements
 *
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_BATCH2_FIX_v6_spidlabels_v4_FLOATTRANSPLANT_CLEAN.pptx slide 7
 *
 * Fixed 2026-01-05:
 * - Always use nodeType="${nodeType}" (not withEffect)
 * - Always wrap in <p:par> (engine doesn't wrap for us)
 * - Use correct value types: <p:fltVal> for "0", <p:strVal> for formulas
 * - Exit formulas use "ppt_w", "ppt_h" WITHOUT # prefix
 */
export function buildSpinnerAnimation(ctx) {
    const { shapeId, animation, config, type, ids, target } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 500;
    const delay = animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0);
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    const transition = isEntrance ? 'in' : 'out';
    // Build target XML based on sequence mode
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    // Generate IDs for all 5 sub-elements
    const setId = getNextAnimationId();
    const animWId = getNextAnimationId();
    const animHId = getNextAnimationId();
    const animRotId = getNextAnimationId();
    const effectId = getNextAnimationId();
    // Exit vs Entrance differences:
    // - Entrance: set FIRST (delay=0), WITH fill="hold" on inner anim, rotation 360→0
    // - Exit: set LAST (delay=duration-1), NO fill="hold" on inner anim, rotation 0→360
    const innerFill = isEntrance ? ' fill="hold"' : '';
    const setDelay = isEntrance ? 0 : duration - 1;
    // Build the 5-element animation: set + anim(ppt_w) + anim(ppt_h) + anim(style.rotation) + animEffect
    // Width animation: 0 → #ppt_w (entrance) or ppt_w → 0 (exit, NO # prefix)
    const widthFromVal = isEntrance ? '<p:fltVal val="0"/>' : '<p:strVal val="ppt_w"/>';
    const widthToVal = isEntrance ? '<p:strVal val="#ppt_w"/>' : '<p:fltVal val="0"/>';
    // Height animation: 0 → #ppt_h (entrance) or ppt_h → 0 (exit, NO # prefix)
    const heightFromVal = isEntrance ? '<p:fltVal val="0"/>' : '<p:strVal val="ppt_h"/>';
    const heightToVal = isEntrance ? '<p:strVal val="#ppt_h"/>' : '<p:fltVal val="0"/>';
    // Rotation: Entrance 360→0, Exit 0→360
    const rotFromVal = isEntrance ? '360' : '0';
    const rotToVal = isEntrance ? '0' : '360';
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
    const animWElement = `<p:anim calcmode="lin" valueType="num">
		<p:cBhvr>
			<p:cTn id="${animWId}" dur="${duration}"${innerFill}/>
			<p:tgtEl>${targetXml}</p:tgtEl>
			<p:attrNameLst><p:attrName>ppt_w</p:attrName></p:attrNameLst>
		</p:cBhvr>
		<p:tavLst>
			<p:tav tm="0"><p:val>${widthFromVal}</p:val></p:tav>
			<p:tav tm="100000"><p:val>${widthToVal}</p:val></p:tav>
		</p:tavLst>
	</p:anim>`;
    const animHElement = `<p:anim calcmode="lin" valueType="num">
		<p:cBhvr>
			<p:cTn id="${animHId}" dur="${duration}"${innerFill}/>
			<p:tgtEl>${targetXml}</p:tgtEl>
			<p:attrNameLst><p:attrName>ppt_h</p:attrName></p:attrNameLst>
		</p:cBhvr>
		<p:tavLst>
			<p:tav tm="0"><p:val>${heightFromVal}</p:val></p:tav>
			<p:tav tm="100000"><p:val>${heightToVal}</p:val></p:tav>
		</p:tavLst>
	</p:anim>`;
    const animRotElement = `<p:anim calcmode="lin" valueType="num">
		<p:cBhvr>
			<p:cTn id="${animRotId}" dur="${duration}"${innerFill}/>
			<p:tgtEl>${targetXml}</p:tgtEl>
			<p:attrNameLst><p:attrName>style.rotation</p:attrName></p:attrNameLst>
		</p:cBhvr>
		<p:tavLst>
			<p:tav tm="0"><p:val><p:fltVal val="${rotFromVal}"/></p:val></p:tav>
			<p:tav tm="100000"><p:val><p:fltVal val="${rotToVal}"/></p:val></p:tav>
		</p:tavLst>
	</p:anim>`;
    const effectElement = `<p:animEffect transition="${transition}" filter="fade">
		<p:cBhvr>
			<p:cTn id="${effectId}" dur="${duration}"/>
			<p:tgtEl>${targetXml}</p:tgtEl>
		</p:cBhvr>
	</p:animEffect>`;
    // Element order: Entrance = set + anims + effect, Exit = anims + effect + set
    const childElements = isEntrance
        ? `${setElement}${animWElement}${animHElement}${animRotElement}${effectElement}`
        : `${animWElement}${animHElement}${animRotElement}${effectElement}${setElement}`;
    // Entrance uses decel easing, exit uses accel easing
    const easingAttr = isEntrance ? 'decel="100000"' : 'accel="100000"';
    // Always use clickEffect and wrap in <p:par>
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" ${easingAttr} fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
			<p:childTnLst>
				${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
//# sourceMappingURL=buildSpinnerAnimation.js.map