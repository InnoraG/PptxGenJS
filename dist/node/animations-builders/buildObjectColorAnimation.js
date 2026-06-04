import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
import { animationColorXml, getAnimationVariantRgb } from './colorVariantUtils';
/**
 * Build Object Color emphasis animation (presetID=19)
 * Structure: 2 animClr (style.color + fillcolor) + 2 set (fill.type + fill.on)
 * Reference: Focused_Emphasis_Showcase_BATCH4_BASE_MANUALLYFROZEN.pptx slide15.xml
 *
 * NO visibility setter - emphasis animations modify already-visible objects
 */
export function buildObjectColorAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, ids, target, sequence } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    // Duration: Only paragraph targets use defaultDuration (500ms for ObjectColor)
    // All other targets (asOneObject, background) use 1000ms
    const isParagraph = (target === null || target === void 0 ? void 0 : target.type) === 'paragraph';
    const duration = isParagraph ? (animation.duration || config.defaultDuration || 500) : 1000;
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
    const presetSubtype = 0; // From reference
    const colorXml = animationColorXml(getAnimationVariantRgb(animation), isParagraph);
    // Build target XML based on sequence mode
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if (isParagraph && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    // Generate IDs for sub-elements
    const animClr1Id = getNextAnimationId();
    const animClr2Id = getNextAnimationId();
    const set1Id = getNextAnimationId();
    const set2Id = getNextAnimationId();
    // Build elements in exact order from reference: animClr(style.color), animClr(fillcolor), set(fill.type), set(fill.on)
    const childElements = `
        <p:animClr clrSpc="rgb" dir="cw">
            <p:cBhvr override="childStyle">
                <p:cTn id="${animClr1Id}" dur="${duration}" fill="hold"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst>
                    <p:attrName>style.color</p:attrName>
                </p:attrNameLst>
            </p:cBhvr>
            <p:to>
                ${colorXml}
            </p:to>
        </p:animClr>
        <p:animClr clrSpc="rgb" dir="cw">
            <p:cBhvr>
                <p:cTn id="${animClr2Id}" dur="${duration}" fill="hold"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst>
                    <p:attrName>fillcolor</p:attrName>
                </p:attrNameLst>
            </p:cBhvr>
            <p:to>
                ${colorXml}
            </p:to>
        </p:animClr>
        <p:set>
            <p:cBhvr>
                <p:cTn id="${set1Id}" dur="${duration}" fill="hold"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst>
                    <p:attrName>fill.type</p:attrName>
                </p:attrNameLst>
            </p:cBhvr>
            <p:to>
                <p:strVal val="solid"/>
            </p:to>
        </p:set>
        <p:set>
            <p:cBhvr>
                <p:cTn id="${set2Id}" dur="${duration}" fill="hold"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst>
                    <p:attrName>fill.on</p:attrName>
                </p:attrNameLst>
            </p:cBhvr>
            <p:to>
                <p:strVal val="true"/>
            </p:to>
        </p:set>`;
    return `<p:par>
        <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="emph" presetSubtype="${presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
            <p:stCondLst>
                <p:cond delay="${delay}"/>
            </p:stCondLst>
            <p:childTnLst>
                ${childElements}
            </p:childTnLst>
        </p:cTn>
    </p:par>`;
}
//# sourceMappingURL=buildObjectColorAnimation.js.map