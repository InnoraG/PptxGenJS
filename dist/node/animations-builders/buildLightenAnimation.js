import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
/**
 * Build Lighten emphasis animation (presetID=30)
 * Structure: 3 animClr (HSL color space with <p:by>) + 1 set
 * Reference: Focused_Emphasis_Showcase_BATCH4_BASE.pptx slide25.xml
 */
export function buildLightenAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, ids, target, sequence } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    // Duration: Only paragraph targets use defaultDuration (500ms for Lighten)
    // All other targets (asOneObject, background) use 1000ms
    const isParagraph = (target === null || target === void 0 ? void 0 : target.type) === 'paragraph';
    const duration = isParagraph ? (animation.duration || config.defaultDuration || 500) : 1000;
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
    // Build target XML
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if (isParagraph && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    // Generate IDs for sub-elements
    const animClrId1 = getNextAnimationId();
    const animClrId2 = getNextAnimationId();
    const animClrId3 = getNextAnimationId();
    const setId = getNextAnimationId();
    // Build child elements (order is CRITICAL)
    const childElements = `
        <p:animClr clrSpc="hsl" dir="cw">
            <p:cBhvr override="childStyle">
                <p:cTn id="${animClrId1}" dur="${duration}" fill="hold"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>style.color</p:attrName></p:attrNameLst>
            </p:cBhvr>
            <p:by>
                <p:hsl h="0" s="12549" l="25098"/>
            </p:by>
        </p:animClr>
        <p:animClr clrSpc="hsl" dir="cw">
            <p:cBhvr>
                <p:cTn id="${animClrId2}" dur="${duration}" fill="hold"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>fillcolor</p:attrName></p:attrNameLst>
            </p:cBhvr>
            <p:by>
                <p:hsl h="0" s="12549" l="25098"/>
            </p:by>
        </p:animClr>
        <p:animClr clrSpc="hsl" dir="cw">
            <p:cBhvr>
                <p:cTn id="${animClrId3}" dur="${duration}" fill="hold"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>stroke.color</p:attrName></p:attrNameLst>
            </p:cBhvr>
            <p:by>
                <p:hsl h="0" s="12549" l="25098"/>
            </p:by>
        </p:animClr>
        <p:set>
            <p:cBhvr>
                <p:cTn id="${setId}" dur="${duration}" fill="hold"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>fill.type</p:attrName></p:attrNameLst>
            </p:cBhvr>
            <p:to><p:strVal val="solid"/></p:to>
        </p:set>`;
    return `<p:par>
        <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="emph" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
            <p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
            <p:childTnLst>${childElements}
            </p:childTnLst>
        </p:cTn>
    </p:par>`;
}
//# sourceMappingURL=buildLightenAnimation.js.map