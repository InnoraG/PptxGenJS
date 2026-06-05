import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';
import { animationColorXml, getAnimationVariantRgb } from './colorVariantUtils';

/**
 * Build ChangeFillColor emphasis animation (presetID=1)
 * Structure: animClr + 2 set (fill.type, fill.on)
 * Reference: Focused_Emphasis_Showcase_BATCH4_BASE.pptx slide1.xml
 * 
 * NO visibility setter - emphasis animations modify already-visible objects
 */
export function buildChangeFillColorAnimation(ctx: AnimationBuildContext): string {
    const { shapeId, animation, config, ids , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 1000;
    const delay = animation.delay ?? config.defaultDelay ?? 0
    const presetSubtype = 2;  // From reference
    const colorXml = animationColorXml(getAnimationVariantRgb(animation));
    
    // Build target XML - emphasis uses bare spTgt for asOneObject
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    
    // Generate IDs for sub-elements
    const animClrId = getNextAnimationId();
    const set1Id = getNextAnimationId();
    const set2Id = getNextAnimationId();
    
    // Build elements in exact order from reference: animClr, set, set
    const childElements = `
        <p:animClr clrSpc="rgb" dir="cw">
            <p:cBhvr>
                <p:cTn id="${animClrId}" dur="${duration}" fill="hold"/>
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
        <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="emph" presetSubtype="${presetSubtype}" fill="hold" nodeType="${nodeType}">
            <p:stCondLst>
                <p:cond delay="${delay}"/>
            </p:stCondLst>
            <p:childTnLst>
                ${childElements}
            </p:childTnLst>
        </p:cTn>
    </p:par>`;
}
