import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
/**
 * Build Basic Swivel animation (presetID 19)
 * Pattern: set + anim(ppt_w) + anim(ppt_h)
 * Entrance: width uses sinusoid formula, height constant
 * Exit: height constant, width oscillates with keyframes
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_BATCH1_MANUALLYFROZEN.pptx slide11.xml
 */
export function buildSwivelAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, directionConfig, type, ids, target, sequence } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 700;
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    const DEFAULT_DURATION = 700;
    const scaleFactor = duration / DEFAULT_DURATION;
    const totalDur = Math.round(700 * scaleFactor);
    const setDelayExit = Math.max(0, Math.round((700 - 1) * scaleFactor));
    const presetSubtype = (directionConfig === null || directionConfig === void 0 ? void 0 : directionConfig.presetSubtype) || 0;
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    const setId = getNextAnimationId();
    const animWId = getNextAnimationId();
    const animHId = getNextAnimationId();
    // Basic Swivel animates width/height (ppt_w / ppt_h)
    // Subtype 10 = Horizontal (width oscillates)
    // Subtype 5 = Vertical (height oscillates)
    const isVertical = presetSubtype === 5;
    const oscillateAttr = isVertical ? 'ppt_h' : 'ppt_w';
    const constantAttr = isVertical ? 'ppt_w' : 'ppt_h';
    const oscFmla = oscillateAttr === 'ppt_w' ? '#ppt_w*sin(2.5*pi*$)' : '#ppt_h*sin(2.5*pi*$)';
    const oscConst = oscillateAttr === 'ppt_w' ? '#ppt_w' : '#ppt_h';
    const constConst = constantAttr === 'ppt_w' ? '#ppt_w' : '#ppt_h';
    const buildOscillationTavList = (attr) => {
        const ref = attr === 'ppt_w' ? 'ppt_w' : 'ppt_h';
        return `
					<p:tav tm="0"><p:val><p:strVal val="${ref}"/></p:val></p:tav>
					<p:tav tm="5000"><p:val><p:strVal val="0.92*${ref}"/></p:val></p:tav>
					<p:tav tm="10000"><p:val><p:strVal val="0.71*${ref}"/></p:val></p:tav>
					<p:tav tm="15000"><p:val><p:strVal val="0.38*${ref}"/></p:val></p:tav>
					<p:tav tm="20000"><p:val><p:fltVal val="0"/></p:val></p:tav>
					<p:tav tm="25000"><p:val><p:strVal val="-0.38*${ref}"/></p:val></p:tav>
					<p:tav tm="30000"><p:val><p:strVal val="-0.71*${ref}"/></p:val></p:tav>
					<p:tav tm="35000"><p:val><p:strVal val="-0.92*${ref}"/></p:val></p:tav>
					<p:tav tm="40000"><p:val><p:strVal val="-${ref}"/></p:val></p:tav>
					<p:tav tm="45000"><p:val><p:strVal val="-0.92*${ref}"/></p:val></p:tav>
					<p:tav tm="50000"><p:val><p:strVal val="-0.71*${ref}"/></p:val></p:tav>
					<p:tav tm="55000"><p:val><p:strVal val="-0.38*${ref}"/></p:val></p:tav>
					<p:tav tm="60000"><p:val><p:fltVal val="0"/></p:val></p:tav>
					<p:tav tm="65000"><p:val><p:strVal val="0.38*${ref}"/></p:val></p:tav>
					<p:tav tm="70000"><p:val><p:strVal val="0.71*${ref}"/></p:val></p:tav>
					<p:tav tm="75000"><p:val><p:strVal val="0.92*${ref}"/></p:val></p:tav>
					<p:tav tm="80000"><p:val><p:strVal val="${ref}"/></p:val></p:tav>
					<p:tav tm="85000"><p:val><p:strVal val="0.92*${ref}"/></p:val></p:tav>
					<p:tav tm="90000"><p:val><p:strVal val="0.71*${ref}"/></p:val></p:tav>
					<p:tav tm="95000"><p:val><p:strVal val="0.38*${ref}"/></p:val></p:tav>
					<p:tav tm="100000"><p:val><p:fltVal val="0"/></p:val></p:tav>`;
    };
    if (!isEntrance) {
        const visibilityDelay = duration - 1; // dur="${totalDur}", delay="${setDelayExit}"
        return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="${presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
			<p:childTnLst>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animHId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>${constantAttr}</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${constantAttr}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${constantAttr}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animWId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>${oscillateAttr}</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
${buildOscillationTavList(oscillateAttr)}
					</p:tavLst>
				</p:anim>
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="${visibilityDelay}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
    }
    // ENTRANCE: visibility setter first, then ppt_w, then ppt_h
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="${presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
			<p:childTnLst>
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animWId}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>${oscillateAttr}</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0" fmla="${oscFmla}"><p:val><p:fltVal val="0"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:fltVal val="1"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animHId}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>${constantAttr}</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${constConst}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${constConst}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
//# sourceMappingURL=buildSwivelAnimation.js.map