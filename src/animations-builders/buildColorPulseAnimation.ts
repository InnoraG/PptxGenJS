import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build ColorPulse emphasis animation (presetID=27)
 * Structure: 2 animClr + 2 set
 * Reference: Focused_Emphasis_Showcase_BATCH4_BASE.pptx slide23.xml
 */
export function buildColorPulseAnimation(ctx: AnimationBuildContext): string {
    const { shapeId, animation, config, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 500;
    const delay = animation.delay ?? config.defaultDelay ?? 0
    
    // Build target XML
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if (target?.type === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    } else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    
    // Generate IDs for sub-elements
    const animClrId1 = getNextAnimationId();
    const animClrId2 = getNextAnimationId();
    const setId1 = getNextAnimationId();
    const setId2 = getNextAnimationId();
    
    // Build child elements (order is CRITICAL)
    const childElements = `
        <p:animClr clrSpc="rgb" dir="cw">
            <p:cBhvr override="childStyle">
                <p:cTn id="${animClrId1}" dur="${duration}" autoRev="1" fill="remove"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>style.color</p:attrName></p:attrNameLst>
            </p:cBhvr>
            <p:to>
                <a:schemeClr val="bg1" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>
            </p:to>
        </p:animClr>
        <p:animClr clrSpc="rgb" dir="cw">
            <p:cBhvr>
                <p:cTn id="${animClrId2}" dur="${duration}" autoRev="1" fill="remove"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>fillcolor</p:attrName></p:attrNameLst>
            </p:cBhvr>
            <p:to>
                <a:schemeClr val="bg1" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>
            </p:to>
        </p:animClr>
        <p:set>
            <p:cBhvr>
                <p:cTn id="${setId1}" dur="${duration}" autoRev="1" fill="remove"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>fill.type</p:attrName></p:attrNameLst>
            </p:cBhvr>
            <p:to><p:strVal val="solid"/></p:to>
        </p:set>
        <p:set>
            <p:cBhvr>
                <p:cTn id="${setId2}" dur="${duration}" autoRev="1" fill="remove"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>fill.on</p:attrName></p:attrNameLst>
            </p:cBhvr>
            <p:to><p:strVal val="true"/></p:to>
        </p:set>`;
    return `<p:par>
        <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="emph" presetSubtype="0" fill="remove" grpId="0" nodeType="${nodeType}">
            <p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
            <p:childTnLst>${childElements}
            </p:childTnLst>
        </p:cTn>
    </p:par>`;
}
