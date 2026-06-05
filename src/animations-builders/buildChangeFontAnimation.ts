import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build ChangeFont emphasis animation (presetID=2)
 * Structure: 1 set element targeting style.fontFamily
 * 
 * Reference: tmp_autonomous_test/Focused_Emphasis_Showcase_BATCH4_BASE.pptx slide2.xml
 * - presetClass: emph
 * - presetSubtype: 0
 * - Single set element with to="Times New Roman"
 * - Targets style.fontFamily attribute
 * - Duration: 1000ms
 * - override="childStyle" on cBhvr
 */
export function buildChangeFontAnimation(ctx: AnimationBuildContext): string {
    const { shapeId, animation, config, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 1000;
    const delay = animation.delay ?? config.defaultDelay ?? 0
    
    // Build target XML based on sequence mode
    // For emphasis animations, allAtOnce uses paragraph targeting (NOT p:bg)
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    // Note: No special handling for 'background' - emphasis uses paragraph targeting for allAtOnce
    
    // Generate ID for set element
    const setId = getNextAnimationId();
    return `<p:par>
        <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="emph" presetSubtype="0" grpId="0" nodeType="${nodeType}">
            <p:stCondLst>
                <p:cond delay="${delay}"/>
            </p:stCondLst>
            <p:childTnLst>
                <p:set>
                    <p:cBhvr override="childStyle">
                        <p:cTn id="${setId}" dur="${duration}"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>style.fontFamily</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:to>
                        <p:strVal val="Times New Roman"/>
                    </p:to>
                </p:set>
            </p:childTnLst>
        </p:cTn>
    </p:par>`;
}
