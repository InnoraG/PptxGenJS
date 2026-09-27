/**
 * Pinwheel Animation Builder (presetID=35)
 *
 * Structure: 5 elements
 * - 1 set (style.visibility)
 * - 1 animEffect (fade)
 * - 3 anim (style.rotation, ppt_h, ppt_w)
 *
 * CRITICAL: Uses style.rotation (NOT ppt_x like Pattern B)
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_WHEELFIX_v7.pptx slide24.xml
 */
import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
export function buildPinwheelAnimation(ctx) {
    var _a, _b, _c;
    const { shapeId, animation, config, type, ids, target, sequence } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 500;
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    const transition = isEntrance ? 'in' : 'out';
    // Build target XML
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
    const effectId = getNextAnimationId();
    const animRotId = getNextAnimationId();
    const animHId = getNextAnimationId();
    const animWId = getNextAnimationId();
    // CRITICAL: Pinwheel rotates while scaling
    // Entrance: rotate 720→0 (backwards 2 full rotations), scale 0→#ppt_h/#ppt_w
    // Exit: rotate 0→720 (forward 2 full rotations), scale ppt_h/ppt_w→0
    const rotFrom = isEntrance ? '720' : '0';
    const rotTo = isEntrance ? '0' : '720';
    const hFrom = isEntrance ? '0' : 'ppt_h';
    const hTo = isEntrance ? '#ppt_h' : '0';
    const wFrom = isEntrance ? '0' : 'ppt_w';
    const wTo = isEntrance ? '#ppt_w' : '0';
    // Helper to generate correct value element
    // RULE: Numeric values (0, 720) use fltVal, formulas (ppt_h, #ppt_h, ppt_w, #ppt_w) use strVal
    const genVal = (val) => {
        // Check if value is purely numeric
        if (/^\d+(\.\d+)?$/.test(val)) {
            return `<p:fltVal val=\"${val}\"/>`;
        }
        // Otherwise it's a formula or string reference
        return `<p:strVal val=\"${val}\"/>`;
    };
    // Build elements in correct order
    // Entrance: set, animEffect, anim(rotation), anim(h), anim(w)
    // Exit: animEffect, anim(rotation), anim(h), anim(w), set
    const setElement = `
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="${isEntrance ? 0 : duration - 1}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>`;
    // CRITICAL: Entrance has fill="hold" on anim elements, Exit does NOT
    const fillAttr = isEntrance ? ' fill="hold"' : '';
    const otherElements = `
				<p:animEffect transition="${transition}" filter="fade">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animRotId}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.rotation</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val>${genVal(rotFrom)}</p:val></p:tav>
						<p:tav tm="100000"><p:val>${genVal(rotTo)}</p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animHId}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_h</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val>${genVal(hFrom)}</p:val></p:tav>
						<p:tav tm="100000"><p:val>${genVal(hTo)}</p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animWId}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_w</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val>${genVal(wFrom)}</p:val></p:tav>
						<p:tav tm="100000"><p:val>${genVal(wTo)}</p:val></p:tav>
					</p:tavLst>
				</p:anim>`;
    // Combine in correct order
    const childElements = isEntrance ? (setElement + otherElements) : (otherElements + setElement);
    const grpId = (_c = ctx.grpId) !== null && _c !== void 0 ? _c : 0;
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="${grpId}" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
//# sourceMappingURL=buildPinwheelAnimation.js.map