import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
/**
 * Build GrowAndTurn animation (presetID=31)
 * Structure: set + anim(ppt_w) + anim(ppt_h) + anim(rotation) + animEffect(fade)
 * Reference: Batch2 slide9.xml, presetSubtype varies by sequence mode:
 * - asOneObject: 2
 * - allAtOnce: 4
 * - byParagraph: 2
 */
export function buildGrowAndTurnAnimation(ctx) {
    const { shapeId, animation, config, type, ids, target } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 500;
    const delay = animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0);
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    // Determine presetSubtype - frozen reference uses 0 for ALL sequence modes
    // Previously used 2/4 but Batch2 slide9 frozen reference shows 0 throughout
    const presetSubtype = 0;
    // Build target XML based on sequence mode
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    // Generate IDs for each sub-element
    const setId = getNextAnimationId();
    const animWId = getNextAnimationId();
    const animHId = getNextAnimationId();
    const animRotId = getNextAnimationId();
    const effectId = getNextAnimationId();
    // Exit vs Entrance differences:
    // - Entrance: set FIRST (delay=0), WITH fill="hold" on inner anim
    // - Exit: set LAST (delay=duration-1), NO fill="hold" on inner anim
    const innerFill = isEntrance ? ' fill="hold"' : '';
    const setDelay = isEntrance ? 0 : duration - 1;
    // Build elements in exact order from reference
    // 1. Visibility setter (instant, dur=1)
    const setElement = `<p:set>
		<p:cBhvr>
			<p:cTn id="${setId}" dur="1" fill="hold">
				<p:stCondLst><p:cond delay="${setDelay}"/></p:stCondLst>
			</p:cTn>
			<p:tgtEl>${targetXml}</p:tgtEl>
			<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
		</p:cBhvr>
		<p:to><p:strVal val="${isEntrance ? 'visible' : 'hidden'}"/></p:to>
	</p:set>`;
    // 2. Width animation: 0 → #ppt_w (entrance) or ppt_w → 0 (exit, NO # prefix)
    const widthFromVal = isEntrance ? '<p:fltVal val="0"/>' : '<p:strVal val="ppt_w"/>';
    const widthToVal = isEntrance ? '<p:strVal val="#ppt_w"/>' : '<p:fltVal val="0"/>';
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
    // 3. Height animation: 0 → #ppt_h (entrance) or ppt_h → 0 (exit, NO # prefix)
    const heightFromVal = isEntrance ? '<p:fltVal val="0"/>' : '<p:strVal val="ppt_h"/>';
    const heightToVal = isEntrance ? '<p:strVal val="#ppt_h"/>' : '<p:fltVal val="0"/>';
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
    // 4. Rotation animation: 90° → 0° (entrance) or 0° → 90° (exit)
    // Rotation uses fltVal for numeric literals
    const rotFrom = isEntrance ? '90' : '0';
    const rotTo = isEntrance ? '0' : '90';
    const animRotElement = `<p:anim calcmode="lin" valueType="num">
		<p:cBhvr>
			<p:cTn id="${animRotId}" dur="${duration}"${innerFill}/>
			<p:tgtEl>${targetXml}</p:tgtEl>
			<p:attrNameLst><p:attrName>style.rotation</p:attrName></p:attrNameLst>
		</p:cBhvr>
		<p:tavLst>
			<p:tav tm="0"><p:val><p:fltVal val="${rotFrom}"/></p:val></p:tav>
			<p:tav tm="100000"><p:val><p:fltVal val="${rotTo}"/></p:val></p:tav>
		</p:tavLst>
	</p:anim>`;
    // 5. Fade effect
    const effectElement = `<p:animEffect transition="${isEntrance ? 'in' : 'out'}" filter="fade">
		<p:cBhvr>
			<p:cTn id="${effectId}" dur="${duration}"/>
			<p:tgtEl>${targetXml}</p:tgtEl>
		</p:cBhvr>
	</p:animEffect>`;
    // Element order: Entrance = set + anims + effect, Exit = anims + effect + set
    const childElements = isEntrance
        ? `${setElement}${animWElement}${animHElement}${animRotElement}${effectElement}`
        : `${animWElement}${animHElement}${animRotElement}${effectElement}${setElement}`;
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="${presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
			<p:childTnLst>
				${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
//# sourceMappingURL=buildGrowAndTurnAnimation.js.map