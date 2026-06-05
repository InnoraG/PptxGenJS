import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build Transparency animation (presetID=9, emphasis)
 * Structure: set (style.opacity) + animEffect (filter="image")
 * Reference: Focused_Emphasis_Showcase_BATCH4_BASE.pptx slide9.xml
 */
export function buildTransparencyAnimation(ctx: AnimationBuildContext): string {
    const { shapeId, animation, config, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    
    // Duration: Only paragraph targets use defaultDuration
    // All other targets (asOneObject, background) use 1000ms
    const isParagraph = target?.type === 'paragraph';
    const duration = isParagraph ? (animation.duration || config.defaultDuration || 1000) : 1000;
    const delay = animation.delay ?? config.defaultDelay ?? 0
    
    // Determine opacity value based on animation property or direction
    // Transparency percentages map to opacity values:
    // 25% transparency = 0.75 opacity (shape is 75% opaque)
    // 50% transparency = 0.5 opacity
    // 75% transparency = 0.25 opacity
    // 100% transparency = 0 opacity (fully transparent)
    let opacityValue = '0.5'; // Default 50% transparency
    
    if (animation.amount !== undefined) {
        // amount is the opacity value (0 to 1)
        opacityValue = animation.amount.toString();
    } else if (animation.direction) {
        // Convert direction string (e.g., "25%", "50%", "75%", "100%") to opacity
        const match = animation.direction.match(/(\d+)%/);
        if (match) {
            const transparencyPercent = parseInt(match[1]);
            // Opacity = 1 - (transparency / 100)
            const opacity = 1 - (transparencyPercent / 100);
            opacityValue = opacity.toString();
        }
    }
    
    // Build target XML based on sequence mode
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    let effectDuration: string | number = duration;
    
    if (target?.type === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    } else if (isParagraph && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
        // Paragraph-level animations use indefinite duration
        effectDuration = 'indefinite';
    }
    
    // Generate IDs for sub-elements
    const setId = getNextAnimationId();
    const effectId = getNextAnimationId();
    
    // Build elements in exact order from reference
    const setElement = `
        <p:set>
            <p:cBhvr>
                <p:cTn id="${setId}" dur="${effectDuration}"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
                <p:attrNameLst>
                    <p:attrName>style.opacity</p:attrName>
                </p:attrNameLst>
            </p:cBhvr>
            <p:to>
                <p:strVal val="${opacityValue}"/>
            </p:to>
        </p:set>`;
    
    const effectOpacityValue = opacityValue === '0.75' ? '0.5' : opacityValue;
    const animEffectElement = `
        <p:animEffect filter="image" prLst="opacity: ${effectOpacityValue}">
            <p:cBhvr rctx="IE">
                <p:cTn id="${effectId}" dur="${effectDuration}"/>
                <p:tgtEl>${targetXml}</p:tgtEl>
            </p:cBhvr>
        </p:animEffect>`;
    
    // Wrap in main par structure - emphasis does NOT use fill="hold" on preset cTn
    return `<p:par>
        <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="emph" presetSubtype="0" grpId="0" nodeType="${nodeType}">
            <p:stCondLst>
                <p:cond delay="${delay}"/>
            </p:stCondLst>
            <p:childTnLst>
                ${setElement}
                ${animEffectElement}
            </p:childTnLst>
        </p:cTn>
    </p:par>`;
}
