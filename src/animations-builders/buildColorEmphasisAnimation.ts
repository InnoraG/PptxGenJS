import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';
import { animationColorXml, getAnimationVariantRgb } from './colorVariantUtils';

/**
 * Build color-based emphasis animations (ColorWave, ComplementaryColor, etc.)
 * These animations modify colors with HSL transformations
 * 
 * Supported effects:
 * - ColorWave (presetID=20): 3 set elements with scheme colors + iterate
 * - ComplementaryColor (presetID=21): 3 animClr (h=7200000) + 1 set
 * - ComplementaryColor2 (presetID=22): 3 animClr (h=-7200000) + 1 set
 * - ContrastingColor (presetID=23): 1 set element with solid fill type
 * - Darken (presetID=24): 1 animClr element (lightness adjustment)
 * - Desaturate (presetID=25): 1 animClr element (saturation adjustment)
 * - Pulse (presetID=26): animScale elements for pulse effect
 * 
 * Reference: tmp_autonomous_test/Focused_Emphasis_Showcase_BATCH4_BASE.pptx
 */
export function buildColorEmphasisAnimation(ctx: AnimationBuildContext): string {
    const { shapeId, animation, config, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const presetId = config.presetId;
    
    // Duration handling varies by effect:
    // - ColorWave (20): Uses same duration (500ms) for all targets
    // - Other color effects (21-25): 1000ms for asOneObject/background, 500ms for paragraphs
    const isParagraph = target?.type === 'paragraph';
    let duration: number;
    if (presetId === 20) {
        // ColorWave: consistent duration for all
        duration = animation.duration || config.defaultDuration || 500;
    } else {
        // ComplementaryColor, ContrastingColor, Darken, Desaturate: two-tier duration
        duration = isParagraph ? (animation.duration || config.defaultDuration || 500) : 1000;
    }
    const delay = animation.delay ?? config.defaultDelay ?? 0
    const colorXml = animationColorXml(getAnimationVariantRgb(animation), isParagraph);
    
    // Build target XML
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if (target?.type === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    } else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    
    let childElements = '';
    
    // Generate elements based on presetId
    switch (presetId) {
        case 20: // ColorWave
            childElements = buildColorWaveElements(targetXml, duration, colorXml);
            break;
        case 21: // ComplementaryColor
            childElements = buildComplementaryColorElements(targetXml, duration, 7200000);
            break;
        case 22: // ComplementaryColor2
            childElements = buildComplementaryColorElements(targetXml, duration, -7200000);
            break;
        case 23: // ContrastingColor
            childElements = buildContrastingColorElements(targetXml, duration);
            break;
        case 24: // Darken
            childElements = buildDarkenElements(targetXml, duration);
            break;
        case 25: // Desaturate
            childElements = buildDesaturateElements(targetXml, duration);
            break;
        case 26: // Pulse
            childElements = buildPulseElements(targetXml, isParagraph, animation.duration);
            break;
        default:
            // Fallback: generic emphasis effect
            const effectId = getNextAnimationId();
            childElements = `
                <p:animEffect transition="in" filter="fade">
                    <p:cBhvr>
                        <p:cTn id="${effectId}" dur="${duration}" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                    </p:cBhvr>
                </p:animEffect>`;
    }
    
    // Build complete animation with iterate element (for ColorWave)
    const hasIterate = presetId === 20;
    const iterateElement = hasIterate ? `
                <p:iterate type="lt">
                    <p:tmPct val="10000"/>
                </p:iterate>` : '';
    return `<p:par>
        <p:cTn id="${ids.main}" presetID="${presetId}" presetClass="emph" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
            <p:stCondLst>
                <p:cond delay="${delay}"/>
            </p:stCondLst>${iterateElement}
            <p:childTnLst>${childElements}
            </p:childTnLst>
        </p:cTn>
    </p:par>`;
}

/**
 * ColorWave (presetID=20): 3 set elements with scheme colors
 */
function buildColorWaveElements(targetXml: string, duration: number, colorXml: string): string {
    const id1 = getNextAnimationId();
    const id2 = getNextAnimationId();
    const id3 = getNextAnimationId();
    
    return `
                <p:set>
                    <p:cBhvr override="childStyle">
                        <p:cTn id="${id1}" dur="${duration}" autoRev="1" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>style.color</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:to>
                        <p:clrVal>
                            ${colorXml}
                        </p:clrVal>
                    </p:to>
                </p:set>
                <p:set>
                    <p:cBhvr>
                        <p:cTn id="${id2}" dur="${duration}" autoRev="1" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>fillcolor</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:to>
                        <p:clrVal>
                            ${colorXml}
                        </p:clrVal>
                    </p:to>
                </p:set>
                <p:set>
                    <p:cBhvr>
                        <p:cTn id="${id3}" dur="${duration}" autoRev="1" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>fill.type</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:to>
                        <p:strVal val="solid"/>
                    </p:to>
                </p:set>`;
}

/**
 * ComplementaryColor / ComplementaryColor2: 3 animClr + 1 set
 */
function buildComplementaryColorElements(targetXml: string, duration: number, hueValue: number): string {
    const id1 = getNextAnimationId();
    const id2 = getNextAnimationId();
    const id3 = getNextAnimationId();
    const id4 = getNextAnimationId();
    
    return `
                <p:animClr clrSpc="hsl" dir="cw">
                    <p:cBhvr override="childStyle">
                        <p:cTn id="${id1}" dur="${duration}" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>style.color</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:by>
                        <p:hsl h="${hueValue}" s="0" l="0"/>
                    </p:by>
                </p:animClr>
                <p:animClr clrSpc="hsl" dir="cw">
                    <p:cBhvr>
                        <p:cTn id="${id2}" dur="${duration}" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>fillcolor</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:by>
                        <p:hsl h="${hueValue}" s="0" l="0"/>
                    </p:by>
                </p:animClr>
                <p:animClr clrSpc="hsl" dir="cw">
                    <p:cBhvr>
                        <p:cTn id="${id3}" dur="${duration}" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>stroke.color</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:by>
                        <p:hsl h="${hueValue}" s="0" l="0"/>
                    </p:by>
                </p:animClr>
                <p:set>
                    <p:cBhvr>
                        <p:cTn id="${id4}" dur="${duration}" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>fill.type</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:to>
                        <p:strVal val="solid"/>
                    </p:to>
                </p:set>`;
}

/**
 * ContrastingColor: 3 animClr + 1 set element
 */
function buildContrastingColorElements(targetXml: string, duration: number): string {
    const id1 = getNextAnimationId();
    const id2 = getNextAnimationId();
    const id3 = getNextAnimationId();
    const id4 = getNextAnimationId();
    
    return `
                <p:animClr clrSpc="hsl" dir="cw">
                    <p:cBhvr override="childStyle">
                        <p:cTn id="${id1}" dur="${duration}" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>style.color</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:by>
                        <p:hsl h="10842353" s="0" l="0"/>
                    </p:by>
                </p:animClr>
                <p:animClr clrSpc="hsl" dir="cw">
                    <p:cBhvr>
                        <p:cTn id="${id2}" dur="${duration}" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>fillcolor</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:by>
                        <p:hsl h="10842353" s="0" l="0"/>
                    </p:by>
                </p:animClr>
                <p:animClr clrSpc="hsl" dir="cw">
                    <p:cBhvr>
                        <p:cTn id="${id3}" dur="${duration}" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>stroke.color</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:by>
                        <p:hsl h="10842353" s="0" l="0"/>
                    </p:by>
                </p:animClr>
                <p:set>
                    <p:cBhvr>
                        <p:cTn id="${id4}" dur="${duration}" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>fill.type</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:to>
                        <p:strVal val="solid"/>
                    </p:to>
                </p:set>`;
}

/**
 * Darken: 3 animClr + 1 set element with lightness adjustment
 */
function buildDarkenElements(targetXml: string, duration: number): string {
    const id1 = getNextAnimationId();
    const id2 = getNextAnimationId();
    const id3 = getNextAnimationId();
    const id4 = getNextAnimationId();
    
    return `
                <p:animClr clrSpc="hsl" dir="cw">
                    <p:cBhvr override="childStyle">
                        <p:cTn id="${id1}" dur="${duration}" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>style.color</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:by>
                        <p:hsl h="0" s="-12549" l="-25098"/>
                    </p:by>
                </p:animClr>
                <p:animClr clrSpc="hsl" dir="cw">
                    <p:cBhvr>
                        <p:cTn id="${id2}" dur="${duration}" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>fillcolor</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:by>
                        <p:hsl h="0" s="-12549" l="-25098"/>
                    </p:by>
                </p:animClr>
                <p:animClr clrSpc="hsl" dir="cw">
                    <p:cBhvr>
                        <p:cTn id="${id3}" dur="${duration}" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>stroke.color</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:by>
                        <p:hsl h="0" s="-12549" l="-25098"/>
                    </p:by>
                </p:animClr>
                <p:set>
                    <p:cBhvr>
                        <p:cTn id="${id4}" dur="${duration}" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>fill.type</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:to>
                        <p:strVal val="solid"/>
                    </p:to>
                </p:set>`;
}

/**
 * Desaturate: 3 animClr + 1 set element with saturation adjustment
 */
function buildDesaturateElements(targetXml: string, duration: number): string {
    const id1 = getNextAnimationId();
    const id2 = getNextAnimationId();
    const id3 = getNextAnimationId();
    const id4 = getNextAnimationId();
    
    return `
                <p:animClr clrSpc="hsl" dir="cw">
                    <p:cBhvr override="childStyle">
                        <p:cTn id="${id1}" dur="${duration}" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>style.color</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:by>
                        <p:hsl h="0" s="-70588" l="0"/>
                    </p:by>
                </p:animClr>
                <p:animClr clrSpc="hsl" dir="cw">
                    <p:cBhvr>
                        <p:cTn id="${id2}" dur="${duration}" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>fillcolor</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:by>
                        <p:hsl h="0" s="-70588" l="0"/>
                    </p:by>
                </p:animClr>
                <p:animClr clrSpc="hsl" dir="cw">
                    <p:cBhvr>
                        <p:cTn id="${id3}" dur="${duration}" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>stroke.color</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:by>
                        <p:hsl h="0" s="-70588" l="0"/>
                    </p:by>
                </p:animClr>
                <p:set>
                    <p:cBhvr>
                        <p:cTn id="${id4}" dur="${duration}" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                        <p:attrNameLst>
                            <p:attrName>fill.type</p:attrName>
                        </p:attrNameLst>
                    </p:cBhvr>
                    <p:to>
                        <p:strVal val="solid"/>
                    </p:to>
                </p:set>`;
}

/**
 * Pulse: animEffect + animScale for pulse effect
 * Structure: animEffect (fade out with tmFilter) + animScale (5% growth with autoRev)
 */
function buildPulseElements(targetXml: string, isParagraph: boolean, authoredDuration?: number): string {
    const effectId = getNextAnimationId();
    const scaleId = getNextAnimationId();
    
    // An explicit duration owns the complete pulse, including growth and return.
    // Omitted/null retains the frozen defaults: 1000ms for whole/background
    // targets and 500ms for paragraphs. Zero remains an explicit zero-duration
    // effect rather than silently restoring either default.
    const effectDuration = authoredDuration ?? (isParagraph ? 500 : 1000);
    // Native duration attributes are integer milliseconds. For an odd complete
    // duration, a 200% scale-child speed represents the two equal half-cycles
    // exactly without fractional duration attributes or a rounded endpoint.
    const oddDuration = effectDuration % 2 !== 0;
    const scaleDuration = oddDuration ? effectDuration : effectDuration / 2;
    const scaleSpeed = oddDuration ? ' spd="200000"' : '';
    
    return `
                <p:animEffect transition="out" filter="fade">
                    <p:cBhvr>
                        <p:cTn id="${effectId}" dur="${effectDuration}" tmFilter="0, 0; .2, .5; .8, .5; 1, 0"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                    </p:cBhvr>
                </p:animEffect>
                <p:animScale>
                    <p:cBhvr>
                        <p:cTn id="${scaleId}" dur="${scaleDuration}"${scaleSpeed} autoRev="1" fill="hold"/>
                        <p:tgtEl>${targetXml}</p:tgtEl>
                    </p:cBhvr>
                    <p:by x="105000" y="105000"/>
                </p:animScale>`;
}
