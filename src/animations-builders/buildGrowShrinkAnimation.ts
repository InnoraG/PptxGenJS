import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build GrowShrink emphasis animation (presetID=6)
 * Structure: Single animScale element with by attribute
 * Reference: Focused_Emphasis_Showcase_BATCH4_BASE_MANUALLYFROZEN.pptx slide6.xml
 * 
 * Key characteristics:
 * - Uses <p:animScale> with <p:by> attribute (relative scaling)
 * - by values in 100000ths: 100000 = 100% (no change), 150000 = 150% (50% growth)
 * - Duration: 2000ms for text elements, 1000ms for background element
 * - NO entrance/exit visibility setters (emphasis only modifies existing object)
 * 
 * Frozen reference shows 12 variants with different by values:
 * - Horizontal Tiny: by.x=25000, by.y=100000 (no change)
 * - Horizontal Smaller: by.x=50000, by.y=100000
 * - Horizontal Larger: by.x=150000, by.y=100000
 * - Horizontal Huge: by.x=400000, by.y=100000
 * - Vertical Tiny: by.x=100000, by.y=25000
 * - Vertical Smaller: by.x=100000, by.y=50000
 * - Vertical Larger: by.x=100000, by.y=150000
 * - Vertical Huge: by.x=100000, by.y=400000
 * - Both Tiny: by.x=25000, by.y=25000
 * - Both Smaller: by.x=50000, by.y=50000
 * - Both Larger: by.x=150000, by.y=150000
 * - Both Huge: by.x=400000, by.y=400000
 */

// Variant scale mappings (in 100000ths)
const GROW_SHRINK_VARIANTS: Record<string, { x: string; y: string }> = {
    'horizontal tiny': { x: '25000', y: '100000' },
    'horizontal smaller': { x: '50000', y: '100000' },
    'horizontal larger': { x: '150000', y: '100000' },
    'horizontal huge': { x: '400000', y: '100000' },
    'vertical tiny': { x: '100000', y: '25000' },
    'vertical smaller': { x: '100000', y: '50000' },
    'vertical larger': { x: '100000', y: '150000' },
    'vertical huge': { x: '100000', y: '400000' },
    'both tiny': { x: '25000', y: '25000' },
    'both smaller': { x: '50000', y: '50000' },
    'both larger': { x: '150000', y: '150000' },
    'both huge': { x: '400000', y: '400000' },
};

export function buildGrowShrinkAnimation(ctx: AnimationBuildContext): string {
    const { shapeId, animation, config, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    
    // Duration: Only paragraph targets use defaultDuration (2000ms)
    // All other targets (asOneObject, background) use 1000ms
    // This matches frozen reference behavior
    const isParagraph = target?.type === 'paragraph';
    // Preserve the frozen-reference defaults, but an explicit authored
    // duration must win for any target (including shapes and 3D models).
    const duration = animation.duration ?? (isParagraph ? (config.defaultDuration || 2000) : 1000);
    const delay = animation.delay ?? config.defaultDelay ?? 0
    
    // Build target XML based on sequence mode
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if (target?.type === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    } else if (isParagraph && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    
    // Generate ID for animScale element
    const scaleId = getNextAnimationId();
    
    // Public authoring uses a direct scale factor: 1.12 = 112%, 0.90 = 90%.
    // The previous builder ignored `animation.scale` and silently fell back to
    // "both larger" (150%), which made restrained emphasis unexpectedly huge.
    const explicitScale = Number((animation as any).scale);
    const explicitScaleX = Number((animation as any).scaleX);
    const explicitScaleY = Number((animation as any).scaleY);
    const hasExplicitScale = animation.scale != null && Number.isFinite(explicitScale) && explicitScale >= 0;
    const hasExplicitScaleX = animation.scaleX != null && Number.isFinite(explicitScaleX) && explicitScaleX >= 0;
    const hasExplicitScaleY = animation.scaleY != null && Number.isFinite(explicitScaleY) && explicitScaleY >= 0;
    const variantKey = (animation.direction || 'both larger').toLowerCase();
    const scaleValues = GROW_SHRINK_VARIANTS[variantKey] || GROW_SHRINK_VARIANTS['both larger'];
    const byX = String(Math.round((hasExplicitScaleX ? explicitScaleX : hasExplicitScale ? explicitScale : Number(scaleValues.x) / 100000) * 100000));
    const byY = String(Math.round((hasExplicitScaleY ? explicitScaleY : hasExplicitScale ? explicitScale : Number(scaleValues.y) / 100000) * 100000));
    
    // Build the animScale element
    const animScaleElement = `<p:animScale>
    <p:cBhvr>
      <p:cTn id="${scaleId}" dur="${duration}" fill="hold"/>
      <p:tgtEl>${targetXml}</p:tgtEl>
    </p:cBhvr>
    <p:by x="${byX}" y="${byY}"/>
  </p:animScale>`;
    return `<p:par>
    <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="emph" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
      <p:stCondLst>
        <p:cond delay="${delay}"/>
      </p:stCondLst>
      <p:childTnLst>
        ${animScaleElement}
      </p:childTnLst>
    </p:cTn>
  </p:par>`;
}
