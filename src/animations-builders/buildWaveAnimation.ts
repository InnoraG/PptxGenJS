import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build Wave emphasis animation (presetID=34)
 * Structure: 1 animMotion + 4 animRot (wave motion with rotation)
 * Reference: Focused_Emphasis_Showcase_BATCH4_BASE.pptx slide29.xml
 */
export function buildWaveAnimation(ctx: AnimationBuildContext): string {
    const { shapeId, animation, config, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const delay = animation.delay ?? config.defaultDelay ?? 0
    
    // Paragraph targets use half the duration of asOneObject/background
    const isParagraph = target?.type === 'paragraph';
    const motionDur = isParagraph ? 250 : 500;
    const rotDur = isParagraph ? 125 : 250;
    
    // Build target XML
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if (target?.type === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    } else if (isParagraph && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    
    // Generate IDs for sub-elements
    const animMotionId = getNextAnimationId();
    const animRotId1 = getNextAnimationId();
    const animRotId2 = getNextAnimationId();
    const animRotId3 = getNextAnimationId();
    const animRotId4 = getNextAnimationId();
    
    // Build child elements (order is CRITICAL)
    // Delays are also scaled for paragraphs
    const delay1 = isParagraph ? 125 : 250;
    const delay2 = isParagraph ? 250 : 500;
    const delay3 = isParagraph ? 375 : 750;
    
    const childElements = `
        <p:animMotion origin="layout" path="M 0.0 0.0 L 0.0 -0.07213" pathEditMode="relative" ptsTypes="">
            <p:cBhvr>
                <p:cTn id="${animMotionId}" dur="${motionDur}" accel="50000" decel="50000" autoRev="1" fill="hold">
                    <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                </p:cTn>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst>
                    <p:attrName>ppt_x</p:attrName>
                    <p:attrName>ppt_y</p:attrName>
                </p:attrNameLst>
            </p:cBhvr>
        </p:animMotion>
        <p:animRot by="1500000">
            <p:cBhvr>
                <p:cTn id="${animRotId1}" dur="${rotDur}" fill="hold">
                    <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                </p:cTn>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst>
            </p:cBhvr>
        </p:animRot>
        <p:animRot by="-1500000">
            <p:cBhvr>
                <p:cTn id="${animRotId2}" dur="${rotDur}" fill="hold">
                    <p:stCondLst><p:cond delay="${delay1}"/></p:stCondLst>
                </p:cTn>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst>
            </p:cBhvr>
        </p:animRot>
        <p:animRot by="-1500000">
            <p:cBhvr>
                <p:cTn id="${animRotId3}" dur="${rotDur}" fill="hold">
                    <p:stCondLst><p:cond delay="${delay2}"/></p:stCondLst>
                </p:cTn>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst>
            </p:cBhvr>
        </p:animRot>
        <p:animRot by="1500000">
            <p:cBhvr>
                <p:cTn id="${animRotId4}" dur="${rotDur}" fill="hold">
                    <p:stCondLst><p:cond delay="${delay3}"/></p:stCondLst>
                </p:cTn>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst>
            </p:cBhvr>
        </p:animRot>`;
    return `<p:par>
        <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="emph" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
            <p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
            <p:iterate type="lt">
                <p:tmPct val="10000"/>
            </p:iterate>
            <p:childTnLst>${childElements}
            </p:childTnLst>
        </p:cTn>
    </p:par>`;
}
