import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
/**
 * Build VerticalGrow emphasis animation (presetID=33)
 * Structure: 2 animClr + 2 set + 1 animScale (vertical growth)
 * Reference: Focused_Emphasis_Showcase_BATCH4_BASE.pptx slide28.xml
 *
 * Duration pattern (from frozen reference):
 * - asOneObject/background: animClr=500, set=1000, animScale=500
 * - paragraphs: 3× scaling → animClr=1500, set=3000, animScale=1500
 */
export function buildVerticalGrowAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, ids, target, sequence } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
    // Paragraph targets use 3× duration scaling
    const isParagraph = (target === null || target === void 0 ? void 0 : target.type) === 'paragraph';
    const durAnimClr = isParagraph ? 1500 : 500;
    const durSet = isParagraph ? 3000 : 1000;
    const durAnimScale = isParagraph ? 1500 : 500;
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
    const setId1 = getNextAnimationId();
    const setId2 = getNextAnimationId();
    const animScaleId = getNextAnimationId();
    // Build child elements (order is CRITICAL)
    const childElements = `
        <p:animClr clrSpc="rgb" dir="cw">
            <p:cBhvr override="childStyle">
                <p:cTn id="${animClrId1}" dur="${durAnimClr}" accel="50000" autoRev="1" fill="hold" tmFilter="0, 0; .33333, 1; 1, 1">
                    <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                </p:cTn>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>style.color</p:attrName></p:attrNameLst>
            </p:cBhvr>
            <p:to>
                <a:schemeClr val="accent2" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>
            </p:to>
        </p:animClr>
        <p:animClr clrSpc="rgb" dir="cw">
            <p:cBhvr>
                <p:cTn id="${animClrId2}" dur="${durAnimClr}" accel="50000" autoRev="1" fill="hold" tmFilter="0, 0; .33333, 1; 1, 1">
                    <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                </p:cTn>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>fillcolor</p:attrName></p:attrNameLst>
            </p:cBhvr>
            <p:to>
                <a:schemeClr val="accent2" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>
            </p:to>
        </p:animClr>
        <p:set>
            <p:cBhvr>
                <p:cTn id="${setId1}" dur="${durSet}" fill="hold"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>fill.type</p:attrName></p:attrNameLst>
            </p:cBhvr>
            <p:to><p:strVal val="solid"/></p:to>
        </p:set>
        <p:set>
            <p:cBhvr>
                <p:cTn id="${setId2}" dur="${durSet}" fill="hold"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>fill.on</p:attrName></p:attrNameLst>
            </p:cBhvr>
            <p:to><p:strVal val="true"/></p:to>
        </p:set>
        <p:animScale>
            <p:cBhvr>
                <p:cTn id="${animScaleId}" dur="${durAnimScale}" accel="50000" autoRev="1" fill="hold" tmFilter="0, 0; .33333, 1; 1, 1">
                    <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                </p:cTn>
                <p:tgtEl>${targetXml}</p:tgtEl>
            </p:cBhvr>
            <p:from x="100000" y="100000"/>
            <p:to x="100000" y="140000"/>
        </p:animScale>`;
    return `<p:par>
        <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="emph" presetSubtype="0" fill="remove" grpId="0" nodeType="${nodeType}">
            <p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
            <p:childTnLst>${childElements}
            </p:childTnLst>
        </p:cTn>
    </p:par>`;
}
//# sourceMappingURL=buildVerticalGrowAnimation.js.map