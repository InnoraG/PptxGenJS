import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build Spin emphasis animation (presetID=8)
 * Structure: 1 animRot element
 * Reference: Focused_Emphasis_Showcase_BATCH4_BASE_MANUALLYFROZEN.pptx slide8.xml
 * 
 * Spin rotates objects by specified degrees (Quarter/Half/Full/Two × Clockwise/Counter)
 * Rotation values in 60000ths of a degree:
 * - Quarter: 90° = 5400000
 * - Half: 180° = 10800000
 * - Full: 360° = 21600000
 * - Two: 720° = 43200000
 * Positive = clockwise, Negative = counter-clockwise
 * 
 * Duration: Background uses 1000ms, text paragraphs use 2000ms (from defaultDuration)
 */

// Spin variant mappings (direction string to rotation value)
const SPIN_VARIANTS: Record<string, number> = {
    'quarter clockwise': 5400000,
    'quarter counterclockwise': -5400000,
    'half clockwise': 10800000,
    'half counterclockwise': -10800000,
    'full clockwise': 21600000,
    'full counterclockwise': -21600000,
    'two clockwise': 43200000,
    'two counterclockwise': -43200000,
};

export function buildSpinAnimation(ctx: AnimationBuildContext): string {
    const { shapeId, animation, config, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    
    // Duration: Use animation.duration if provided, otherwise fall back to defaults
    // Paragraph targets: defaultDuration (2000ms), Background/whole shape: 1000ms
    const isParagraph = target?.type === 'paragraph';
    const defaultDuration = isParagraph ? (config.defaultDuration || 2000) : 1000;
    const duration = animation.duration ?? defaultDuration;
    const delay = animation.delay ?? config.defaultDelay ?? 0
    
    // Numeric public rotation wins, including zero. An explicit null resets
    // that numeric override and must not revive the local legacy alias.
    // Without a numeric override, retain the frozen direction-variant value.
    const variantKey = (animation.direction || 'full clockwise').toLowerCase();
    const variantRotation = SPIN_VARIANTS[variantKey] ?? SPIN_VARIANTS['full clockwise'];
    const degrees = animation.rotation !== undefined ? animation.rotation : (animation as any).degrees;
    const rotationValue = degrees != null
        ? Math.round(degrees * 60000) * (animation.clockwise === false ? -1 : 1)
        : animation.clockwise == null ? variantRotation : Math.abs(variantRotation) * (animation.clockwise === false ? -1 : 1);
    
    // Build target XML
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if (target?.type === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    } else if (isParagraph && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    
    // Generate ID for animRot element
    const animRotId = getNextAnimationId();
    
    // Build animRot element with calculated rotation
    const childElements = `
        <p:animRot by="${rotationValue}">
            <p:cBhvr>
                <p:cTn id="${animRotId}" dur="${duration}" fill="hold"/>
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
