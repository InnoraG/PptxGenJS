import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
/**
 * Build Flicker animation (presetID=27, emphasis)
 * Structure: 2 animClr (style.color, fillcolor) + 2 set (fill.type, fill.on)
 * Reference: Focused_Emphasis_Showcase_BATCH4_BASE_MANUALLYFROZEN.pptx slide23.xml
 *
 * Key characteristics:
 * - All elements use autoRev="1" and fill="remove" for blinking effect
 * - Changes colors to background (bg1) temporarily
 * - Sets fill.type to solid and fill.on to true
 */
export function buildFlickerAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, ids, target, sequence } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    // Duration: Only paragraph targets use defaultDuration (250ms for Flicker)
    // All other targets (asOneObject, background) use 500ms
    const isParagraph = (target === null || target === void 0 ? void 0 : target.type) === 'paragraph';
    const duration = isParagraph ? (animation.duration || config.defaultDuration || 250) : 500;
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
    // Build target XML based on sequence mode
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if (isParagraph && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    // Generate IDs for all sub-elements
    const animClr1Id = getNextAnimationId();
    const animClr2Id = getNextAnimationId();
    const set1Id = getNextAnimationId();
    const set2Id = getNextAnimationId();
    // Build the 4 elements in exact order from reference
    const childElements = `
        <p:animClr clrSpc="rgb" dir="cw">
            <p:cBhvr override="childStyle">
                <p:cTn id="${animClr1Id}" dur="${duration}" autoRev="1" fill="remove"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst>
                    <p:attrName>style.color</p:attrName>
                </p:attrNameLst>
            </p:cBhvr>
            <p:to>
                <a:schemeClr val="bg1" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>
            </p:to>
        </p:animClr>
        <p:animClr clrSpc="rgb" dir="cw">
            <p:cBhvr>
                <p:cTn id="${animClr2Id}" dur="${duration}" autoRev="1" fill="remove"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst>
                    <p:attrName>fillcolor</p:attrName>
                </p:attrNameLst>
            </p:cBhvr>
            <p:to>
                <a:schemeClr val="bg1" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>
            </p:to>
        </p:animClr>
        <p:set>
            <p:cBhvr>
                <p:cTn id="${set1Id}" dur="${duration}" autoRev="1" fill="remove"/>
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
                <p:cTn id="${set2Id}" dur="${duration}" autoRev="1" fill="remove"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst>
                    <p:attrName>fill.on</p:attrName>
                </p:attrNameLst>
            </p:cBhvr>
            <p:to>
                <p:strVal val="true"/>
            </p:to>
        </p:set>`;
    // Wrap in main par structure
    return `<p:par>
        <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="emph" presetSubtype="0" fill="remove" grpId="0" nodeType="${nodeType}">
            <p:stCondLst>
                <p:cond delay="${delay}"/>
            </p:stCondLst>
            <p:childTnLst>${childElements}
            </p:childTnLst>
        </p:cTn>
    </p:par>`;
}
//# sourceMappingURL=buildFlickerAnimation.js.map