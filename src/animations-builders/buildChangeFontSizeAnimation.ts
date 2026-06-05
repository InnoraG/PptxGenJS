import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build ChangeFontSize emphasis animation (presetID=4)
 * Structure: 1 anim element targeting style.fontSize
 * 
 * Reference: tmp_autonomous_test/Focused_Emphasis_Showcase_BATCH4_BASE.pptx slide4.xml
 * - presetClass: emph
 * - presetSubtype: 2
 * - Single anim element with to value based on variant
 * - Targets style.fontSize attribute
 * - Duration: 1000ms
 * - override="childStyle" on cBhvr
 * 
 * Variants:
 * - Tiny: to="0.25" (25% of original size)
 * - Smaller: to="0.5" (50%)
 * - Larger: to="1.5" (150%)
 * - Huge: to="4" (400%)
 */
export function buildChangeFontSizeAnimation(ctx: AnimationBuildContext): string {
    const { shapeId, animation, config, ids, target, directionConfig , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 1000;
    const delay = animation.delay ?? config.defaultDelay ?? 0
    
    // Map variant to 'to' value. Size variants are not registry directions.
    const variant = directionConfig?.name || animation.direction;
    let toValue = '1.5'; // Default: Larger
    if (variant === 'Tiny') {
        toValue = '0.25';
    } else if (variant === 'Smaller') {
        toValue = '0.5';
    } else if (variant === 'Larger') {
        toValue = '1.5';
    } else if (variant === 'Huge') {
        toValue = '4';
    }
    
    // Build target XML based on sequence mode
    // NOTE: Emphasis effects do NOT use <p:bg/> for allAtOnce - they use bare targeting
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    
    // Generate ID for anim element
    const animId = getNextAnimationId();
    return `<p:par>
        <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="emph" presetSubtype="2" fill="hold" grpId="0" nodeType="${nodeType}">
            <p:stCondLst>
                <p:cond delay="${delay}"/>
            </p:stCondLst>
            <p:childTnLst>
                <p:anim to="${toValue}" calcmode="lin" valueType="num">
                    <p:cBhvr override="childStyle">
                        <p:cTn id="${animId}" dur="${duration}" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>style.fontSize</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                </p:anim>
            </p:childTnLst>
        </p:cTn>
    </p:par>`;
}
