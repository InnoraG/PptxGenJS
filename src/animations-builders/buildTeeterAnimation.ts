import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build Teeter emphasis animation (presetID=32)
 * Structure: 5 animRot elements with oscillating rotation
 * Reference: Focused_Emphasis_Showcase_BATCH4_BASE.pptx slide27.xml
 */
export function buildTeeterAnimation(ctx: AnimationBuildContext): string {
    const { shapeId, animation, config, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const delay = animation.delay ?? config.defaultDelay ?? 0
	const duration = animation.duration || config.defaultDuration || 700;
    
	// Calculate scaling factor for proportional choreography
	const DEFAULT_DURATION = 700;
	const scaleFactor = duration / DEFAULT_DURATION;
	const dur100 = Math.round(100 * scaleFactor);
	const dur200 = Math.round(200 * scaleFactor);
	const delay200 = Math.round(200 * scaleFactor);
	const delay400 = Math.round(400 * scaleFactor);
	const delay600 = Math.round(600 * scaleFactor);
	const delay800 = Math.round(800 * scaleFactor);
    
    // Build target XML
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if (target?.type === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    } else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    
    // Generate IDs for sub-elements
    const animRotId1 = getNextAnimationId();
    const animRotId2 = getNextAnimationId();
    const animRotId3 = getNextAnimationId();
    const animRotId4 = getNextAnimationId();
    const animRotId5 = getNextAnimationId();
    
    // Build child elements with oscillating rotation (order is CRITICAL)
    const childElements = `
        <p:animRot by="120000">
            <p:cBhvr>
                <p:cTn id="${animRotId1}" dur="${dur100}" fill="hold">
                    <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                </p:cTn>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst>
            </p:cBhvr>
        </p:animRot>
        <p:animRot by="-240000">
            <p:cBhvr>
                <p:cTn id="${animRotId2}" dur="${dur200}" fill="hold">
                    <p:stCondLst><p:cond delay="${delay200}"/></p:stCondLst>
                </p:cTn>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst>
            </p:cBhvr>
        </p:animRot>
        <p:animRot by="240000">
            <p:cBhvr>
                <p:cTn id="${animRotId3}" dur="${dur200}" fill="hold">
                    <p:stCondLst><p:cond delay="${delay400}"/></p:stCondLst>
                </p:cTn>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst>
            </p:cBhvr>
        </p:animRot>
        <p:animRot by="-240000">
            <p:cBhvr>
                <p:cTn id="${animRotId4}" dur="${dur200}" fill="hold">
                    <p:stCondLst><p:cond delay="${delay600}"/></p:stCondLst>
                </p:cTn>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst>
            </p:cBhvr>
        </p:animRot>
        <p:animRot by="120000">
            <p:cBhvr>
                <p:cTn id="${animRotId5}" dur="${dur200}" fill="hold">
                    <p:stCondLst><p:cond delay="${delay800}"/></p:stCondLst>
                </p:cTn>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst>
            </p:cBhvr>
        </p:animRot>`;
    return `<p:par>
        <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="emph" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
            <p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
            <p:childTnLst>${childElements}
            </p:childTnLst>
        </p:cTn>
    </p:par>`;
}
