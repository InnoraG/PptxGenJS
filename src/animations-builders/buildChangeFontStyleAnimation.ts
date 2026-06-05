import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build ChangeFontStyle emphasis animation (presetID=5)
 * 
 * Supports 3 style variants via presetSubtype:
 * - presetSubtype=0 (Bold): fontStyle=normal, fontWeight=normal, underline=false
 * - presetSubtype=3 (Italic): fontStyle=italic, fontWeight=bold, underline=false
 * - presetSubtype=5 (Underline): fontStyle=normal, fontWeight=bold, underline=true
 * 
 * Structure: 3 set elements for font style properties
 * Reference: tmp_autonomous_test/Focused_Emphasis_Showcase_BATCH4_BASE_MANUALLYFROZEN.pptx slide5.xml
 */
// Map variant names to presetSubtype values
const FONT_STYLE_VARIANTS: Record<string, number> = {
    'bold': 0,
    'italic': 3,
    'underline': 5,
};

export function buildChangeFontStyleAnimation(ctx: AnimationBuildContext): string {
    const { shapeId, animation, config, ids, target, directionConfig , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 750;  // Reference uses 750ms
    const delay = animation.delay ?? config.defaultDelay ?? 0
    
    // Get presetSubtype from animation.direction (variant name) or directionConfig
    const variantKey = (animation.direction || '').toLowerCase();
    const presetSubtype = FONT_STYLE_VARIANTS[variantKey] ?? directionConfig?.presetSubtype ?? 0;
    
    // Determine values based on presetSubtype
    let fontStyleValue: string;
    let fontWeightValue: string;
    let underlineValue: string;
    
    switch (presetSubtype) {
        case 0:  // Bold variant - ✅ VERIFIED: Sets ALL to normal (removes formatting)
            fontStyleValue = 'normal';
            fontWeightValue = 'normal';
            underlineValue = 'false';
            break;
        case 3:  // Italic variant - ✅ VERIFIED: Applies italic + bold
            fontStyleValue = 'italic';
            fontWeightValue = 'bold';
            underlineValue = 'false';
            break;
        case 5:  // Underline variant - ✅ VERIFIED: Applies underline + bold
            fontStyleValue = 'normal';
            fontWeightValue = 'bold';
            underlineValue = 'true';
            break;
        default:
            // Fallback to Bold variant
            fontStyleValue = 'normal';
            fontWeightValue = 'normal';
            underlineValue = 'false';
    }
    
    // Build target XML
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if (target?.type === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    } else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    
    // Generate IDs for 3 set elements
    const setId1 = getNextAnimationId();
    const setId2 = getNextAnimationId();
    const setId3 = getNextAnimationId();
    return `<p:par>
        <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="emph" presetSubtype="${presetSubtype}" grpId="0" nodeType="${nodeType}">
            <p:stCondLst>
                <p:cond delay="${delay}"/>
            </p:stCondLst>
            <p:childTnLst>
                <p:set>
                    <p:cBhvr override="childStyle">
                        <p:cTn id="${setId1}" dur="${duration}"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>style.fontStyle</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:to>
                        <p:strVal val="${fontStyleValue}"/>
                    </p:to>
                </p:set>
                <p:set>
                    <p:cBhvr override="childStyle">
                        <p:cTn id="${setId2}" dur="${duration}"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>style.fontWeight</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:to>
                        <p:strVal val="${fontWeightValue}"/>
                    </p:to>
                </p:set>
                <p:set>
                    <p:cBhvr override="childStyle">
                        <p:cTn id="${setId3}" dur="${duration}"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>style.textDecorationUnderline</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:to>
                        <p:strVal val="${underlineValue}"/>
                    </p:to>
                </p:set>
            </p:childTnLst>
        </p:cTn>
    </p:par>`;
}
