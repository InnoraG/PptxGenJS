import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
/**
 * Build StyleEmphasis emphasis animation (presetID=31)
 * Structure: 4 set elements (color, fontStyle, fontWeight, textDecorationUnderline)
 * Reference: Focused_Emphasis_Showcase_BATCH4_BASE.pptx slide26.xml
 */
export function buildStyleEmphasisAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, ids, target, sequence } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 1000;
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
    // Build target XML
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    // Generate IDs for sub-elements
    const setId1 = getNextAnimationId();
    const setId2 = getNextAnimationId();
    const setId3 = getNextAnimationId();
    const setId4 = getNextAnimationId();
    // Build child elements (order is CRITICAL)
    const childElements = `
        <p:set>
            <p:cBhvr override="childStyle">
                <p:cTn id="${setId1}" dur="${duration}" fill="hold"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>style.color</p:attrName></p:attrNameLst>
            </p:cBhvr>
            <p:to>
                <p:clrVal>
                    <a:schemeClr val="accent2" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>
                </p:clrVal>
            </p:to>
        </p:set>
        <p:set>
            <p:cBhvr override="childStyle">
                <p:cTn id="${setId2}" dur="${duration}" fill="hold"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>style.fontStyle</p:attrName></p:attrNameLst>
            </p:cBhvr>
            <p:to><p:strVal val="italic"/></p:to>
        </p:set>
        <p:set>
            <p:cBhvr>
                <p:cTn id="${setId3}" dur="${duration}" fill="hold"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>style.fontWeight</p:attrName></p:attrNameLst>
            </p:cBhvr>
            <p:to><p:strVal val="bold"/></p:to>
        </p:set>
        <p:set>
            <p:cBhvr>
                <p:cTn id="${setId4}" dur="${duration}" fill="hold"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>style.textDecorationUnderline</p:attrName></p:attrNameLst>
            </p:cBhvr>
            <p:to><p:strVal val="true"/></p:to>
        </p:set>`;
    return `<p:par>
        <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="emph" presetSubtype="0" grpId="0" nodeType="${nodeType}">
            <p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
            <p:childTnLst>${childElements}
            </p:childTnLst>
        </p:cTn>
    </p:par>`;
}
//# sourceMappingURL=buildStyleEmphasisAnimation.js.map