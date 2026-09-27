import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
/**
 * Build Faded Swivel animation (presetID 45)
 * Entrance: ppt_w with formula #ppt_w*sin(2.5*pi*$), ppt_h with #ppt_h
 * Verified from Batch3 frozen reference slide12.xml
 */
export function buildFadedSwivelAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, type, ids, target, sequence } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 700;
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
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
    const animWId = getNextAnimationId();
    const animHId = getNextAnimationId();
    const setElement = `<p:set>
		<p:cBhvr>
			<p:cTn id="${setId}" dur="1" fill="hold">
				<p:stCondLst><p:cond delay="${isEntrance ? '0' : '699'}"/></p:stCondLst>
			</p:cTn>
			<p:tgtEl>${targetXml}</p:tgtEl>
			<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
		</p:cBhvr>
		<p:to><p:strVal val="${visibilityValue}"/></p:to>
	</p:set>`;
    const animEffectElement = `<p:animEffect transition="${isEntrance ? 'in' : 'out'}" filter="fade">
		<p:cBhvr>
			<p:cTn id="${effectId}" dur="${duration}"/>
			<p:tgtEl>${targetXml}</p:tgtEl>
		</p:cBhvr>
	</p:animEffect>`;
    const animWElement = `<p:anim calcmode="lin" valueType="num">
		<p:cBhvr>
			<p:cTn id="${animWId}" dur="${duration}" fill="hold"/>
			<p:tgtEl>${targetXml}</p:tgtEl>
			<p:attrNameLst><p:attrName>ppt_w</p:attrName></p:attrNameLst>
		</p:cBhvr>
		<p:tavLst>
			<p:tav tm="0" fmla="#ppt_w*sin(2.5*pi*$)">
				<p:val><p:fltVal val="0"/></p:val>
			</p:tav>
			<p:tav tm="100000">
				<p:val><p:fltVal val="1"/></p:val>
			</p:tav>
		</p:tavLst>
	</p:anim>`;
    const animHElement = `<p:anim calcmode="lin" valueType="num">
		<p:cBhvr>
			<p:cTn id="${animHId}" dur="${duration}" fill="hold"/>
			<p:tgtEl>${targetXml}</p:tgtEl>
			<p:attrNameLst><p:attrName>ppt_h</p:attrName></p:attrNameLst>
		</p:cBhvr>
		<p:tavLst>
			<p:tav tm="0">
				<p:val><p:strVal val="#ppt_h"/></p:val>
			</p:tav>
			<p:tav tm="100000">
				<p:val><p:strVal val="#ppt_h"/></p:val>
			</p:tav>
		</p:tavLst>
	</p:anim>`;
    // Exit animations - multi-keyframe with complex formulas
    const animEffectExitElement = `<p:animEffect transition="out" filter="fade">
		<p:cBhvr>
			<p:cTn id="${effectId}" dur="${duration}"/>
			<p:tgtEl>${targetXml}</p:tgtEl>
		</p:cBhvr>
	</p:animEffect>`;
    const animWExitElement = `<p:anim calcmode="lin" valueType="num">
		<p:cBhvr>
			<p:cTn id="${animWId}" dur="${duration}"/>
			<p:tgtEl>${targetXml}</p:tgtEl>
			<p:attrNameLst><p:attrName>ppt_w</p:attrName></p:attrNameLst>
		</p:cBhvr>
		<p:tavLst>
			<p:tav tm="0"><p:val><p:strVal val="ppt_w"/></p:val></p:tav>
			<p:tav tm="5000"><p:val><p:strVal val="0.92*ppt_w"/></p:val></p:tav>
			<p:tav tm="10000"><p:val><p:strVal val="0.71*ppt_w"/></p:val></p:tav>
			<p:tav tm="15000"><p:val><p:strVal val="0.38*ppt_w"/></p:val></p:tav>
			<p:tav tm="20000"><p:val><p:fltVal val="0"/></p:val></p:tav>
			<p:tav tm="25000"><p:val><p:strVal val="-0.38*ppt_w"/></p:val></p:tav>
			<p:tav tm="30000"><p:val><p:strVal val="-0.71*ppt_w"/></p:val></p:tav>
			<p:tav tm="35000"><p:val><p:strVal val="-0.92*ppt_w"/></p:val></p:tav>
			<p:tav tm="40000"><p:val><p:strVal val="-ppt_w"/></p:val></p:tav>
			<p:tav tm="45000"><p:val><p:strVal val="-0.92*ppt_w"/></p:val></p:tav>
			<p:tav tm="50000"><p:val><p:strVal val="-0.71*ppt_w"/></p:val></p:tav>
			<p:tav tm="55000"><p:val><p:strVal val="-0.38*ppt_w"/></p:val></p:tav>
			<p:tav tm="60000"><p:val><p:fltVal val="0"/></p:val></p:tav>
			<p:tav tm="65000"><p:val><p:strVal val="0.38*ppt_w"/></p:val></p:tav>
			<p:tav tm="70000"><p:val><p:strVal val="0.71*ppt_w"/></p:val></p:tav>
			<p:tav tm="75000"><p:val><p:strVal val="0.92*ppt_w"/></p:val></p:tav>
			<p:tav tm="80000"><p:val><p:strVal val="ppt_w"/></p:val></p:tav>
			<p:tav tm="85000"><p:val><p:strVal val="0.92*ppt_w"/></p:val></p:tav>
			<p:tav tm="90000"><p:val><p:strVal val="0.71*ppt_w"/></p:val></p:tav>
			<p:tav tm="95000"><p:val><p:strVal val="0.38*ppt_w"/></p:val></p:tav>
			<p:tav tm="100000"><p:val><p:fltVal val="0"/></p:val></p:tav>
		</p:tavLst>
	</p:anim>`;
    const animHExitElement = `<p:anim calcmode="lin" valueType="num">
		<p:cBhvr>
			<p:cTn id="${animHId}" dur="${duration}"/>
			<p:tgtEl>${targetXml}</p:tgtEl>
			<p:attrNameLst><p:attrName>ppt_h</p:attrName></p:attrNameLst>
		</p:cBhvr>
		<p:tavLst>
			<p:tav tm="0"><p:val><p:strVal val="ppt_h"/></p:val></p:tav>
			<p:tav tm="100000"><p:val><p:strVal val="ppt_h"/></p:val></p:tav>
		</p:tavLst>
	</p:anim>`;
    const childElements = isEntrance
        ? `${setElement}\n${animEffectElement}\n${animWElement}\n${animHElement}`
        : `${animEffectExitElement}\n${animWExitElement}\n${animHExitElement}\n${setElement}`;
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="${presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
			<p:childTnLst>
				${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
//# sourceMappingURL=buildFadedSwivelAnimation.js.map