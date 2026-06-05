import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';
import { getAnimationVariantRgb } from './colorVariantUtils';

/**
 * Build ChangeFontColor emphasis animation (presetID=3)
 * Structure: Single animClr element (changes text color)
 * Reference: Focused_Emphasis_Showcase_BATCH4_BASE.pptx slide3.xml
 * 
 * NO visibility setter - emphasis animations modify already-visible objects
 * 
 * Sequence modes:
 * - asOneObject: bare <p:spTgt spid="X"/>
 * - allAtOnce: <p:spTgt spid="X"><p:txEl><p:pRg st="N" end="N"/></p:txEl></p:spTgt>
 * - byParagraph: <p:spTgt spid="X"><p:txEl><p:pRg st="N" end="N"/></p:txEl></p:spTgt>
 */
export function buildChangeFontColorAnimation(ctx: AnimationBuildContext): string {
    const { shapeId, animation, config, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 1000;
    const delay = animation.delay ?? config.defaultDelay ?? 0
    
    // Determine presetSubtype based on sequence mode
    // Reference shows: asOneObject=2, allAtOnce=2, byParagraph=2 (all use 2)
    const presetSubtype = 2;
    
    // Build target XML based on sequence mode
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    
    // Generate ID for animClr element
    const animClrId = getNextAnimationId();
    
    // Frozen reference uses Office's cyan-blue for Change Font Color.
    const colorValue = getAnimationVariantRgb(animation, '00B0F0');
    
    // Build animClr element
    const childElements = `
        <p:animClr clrSpc="rgb" dir="cw">
            <p:cBhvr override="childStyle">
                <p:cTn id="${animClrId}" dur="${duration}" fill="hold"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst>
                    <p:attrName>style.color</p:attrName>
                </p:attrNameLst>
            </p:cBhvr>
            <p:to>
                <a:srgbClr val="${colorValue}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>
            </p:to>
        </p:animClr>`;
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
