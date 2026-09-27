import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
/**
 * Swish animation builder (presetId=35)
 * Structure: set + animEffect(fade) + anim(rotation) + anim(ppt_h) + anim(ppt_w)
 * Reference: slide24.xml from Focused_EntranceExit_Showcase_WHEELFIX_v7.pptx
 */
export function buildSwishAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, type, ids, target, sequence } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 700;
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
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
    // Generate unique IDs for sub-elements
    const setId = getNextAnimationId();
    const animEffectId = getNextAnimationId();
    const rotationId = getNextAnimationId();
    const pptHId = getNextAnimationId();
    const pptWId = getNextAnimationId();
    // Build visibility setter element
    const setElement = `
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="${isEntrance ? '0' : duration - 1}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>`;
    // Build animation elements (animEffect + 3 anim)
    const animElements = `
				<p:animEffect transition="${transition}" filter="fade">
					<p:cBhvr>
						<p:cTn id="${animEffectId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${rotationId}" dur="${duration}"${isEntrance ? ' fill="hold"' : ''}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>style.rotation</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:fltVal val="${isEntrance ? '720' : '0'}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:fltVal val="${isEntrance ? '0' : '720'}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${pptHId}" dur="${duration}"${isEntrance ? ' fill="hold"' : ''}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>ppt_h</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val>${isEntrance ? '<p:fltVal val="0"/>' : '<p:strVal val="ppt_h"/>'}</p:val></p:tav>
						<p:tav tm="100000"><p:val>${isEntrance ? '<p:strVal val="#ppt_h"/>' : '<p:fltVal val="0"/>'}</p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${pptWId}" dur="${duration}"${isEntrance ? ' fill="hold"' : ''}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>ppt_w</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val>${isEntrance ? '<p:fltVal val="0"/>' : '<p:strVal val="ppt_w"/>'}</p:val></p:tav>
						<p:tav tm="100000"><p:val>${isEntrance ? '<p:strVal val="#ppt_w"/>' : '<p:fltVal val="0"/>'}</p:val></p:tav>
					</p:tavLst>
				</p:anim>`;
    // CRITICAL: Element order differs for entrance vs exit
    // Entrance: set + animEffect + anim(rotation) + anim(ppt_h) + anim(ppt_w)
    // Exit: animEffect + anim(rotation) + anim(ppt_h) + anim(ppt_w) + set
    const childElements = isEntrance ? (setElement + animElements) : (animElements + setElement);
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
			<p:childTnLst>${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`.trim();
}
//# sourceMappingURL=buildSwishAnimation.js.map