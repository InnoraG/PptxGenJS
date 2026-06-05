import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build Bold Flash animation (presetID=10)
 * 
 * Structure: 1 anim element with discrete string keyframes
 * - Toggles style.fontWeight between "normal" and "bold"
 * - Creates flash effect by rapidly switching font weight
 * 
 * Keyframe pattern:
 *   tm=0: normal
 *   tm=50000: bold (50% through)
 *   tm=60000: normal (60% through)
 *   tm=100000: normal (end)
 * 
 * Reference: tmp_autonomous_test/Focused_Emphasis_Showcase_BATCH4_BASE_MANUALLYFROZEN.pptx slide10.xml
 */
export function buildBoldFlashAnimation(ctx: AnimationBuildContext): string {
    const { shapeId, animation, config, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 1000;
    const delay = animation.delay ?? config.defaultDelay ?? 0
    
    // Build target XML based on sequence mode
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if (target?.type === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    } else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    
    // Generate ID for anim element
    const animId = getNextAnimationId();
    
    // Build the anim element with discrete string keyframes
    const animElement = `
                <p:anim calcmode="discrete" valueType="str">
                    <p:cBhvr override="childStyle">
                        <p:cTn id="${animId}" dur="${duration}" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>style.fontWeight</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:tavLst>
                        <p:tav tm="0">
                            <p:val>
                                <p:strVal val="normal"/>
                            </p:val>
                        </p:tav>
                        <p:tav tm="50000">
                            <p:val>
                                <p:strVal val="bold"/>
                            </p:val>
                        </p:tav>
                        <p:tav tm="60000">
                            <p:val>
                                <p:strVal val="normal"/>
                            </p:val>
                        </p:tav>
                        <p:tav tm="100000">
                            <p:val>
                                <p:strVal val="normal"/>
                            </p:val>
                        </p:tav>
                    </p:tavLst>
                </p:anim>`;
    
    // Wrap in main par structure (emphasis animations don't use visibility setters)
    return `<p:par>
        <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="emph" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
            <p:stCondLst>
                <p:cond delay="${delay}"/>
            </p:stCondLst>
            <p:childTnLst>${animElement}
            </p:childTnLst>
        </p:cTn>
    </p:par>`;
}
