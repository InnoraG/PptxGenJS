/**
 * PptxGenJS: Animation Builder - Data-Driven Template Engine
 *
 * This module generates animation XML based on configuration data.
 * It replaces hardcoded animation functions with a generic builder.
 *
 * Key principle: Configuration drives behavior, not code.
 */
import { getNextAnimationId } from './gen-animations-ids';
import { getAnimationConfig } from './gen-animations-registry';
// Merged registry with correct presetIDs (priority over original)
// Note: Merged registry re-exports AnimationConfig from original, so types are compatible
import { getAnimationConfigMerged } from './gen-animations-registry-merged';
// Full 149 registry generated from ULTIMATE_149_CATALOG_20251211_091806.csv
// REMOVED: COMPLETE_ANIMATION_REGISTRY - using only ANIMATION_REGISTRY_MERGED as single source of truth
import { buildFadedZoomAnimation } from './animations-builders/buildFadedZoomAnimation';
import { buildUnfoldAnimation } from './animations-builders/buildUnfoldAnimation';
import { buildStretchAnimation } from './animations-builders/buildStretchAnimation';
import { buildStretchyAnimation } from './animations-builders/buildStretchyAnimation';
import { buildZipAnimation } from './animations-builders/buildZipAnimation';
import { getNodeTypeFromTrigger } from './animations-builders/utils';
import { buildDropAnimation } from './animations-builders/buildDropAnimation';
import { buildFloatAnimation } from './animations-builders/buildFloatAnimation';
import { buildStripsAnimation } from './animations-builders/buildStripsAnimation';
import { buildSpiralAnimation } from './animations-builders/buildSpiralAnimation';
import { buildSwivelAnimation } from './animations-builders/buildSwivelAnimation';
import { buildSplitAnimation } from './animations-builders/buildSplitAnimation';
import { buildCrawlAnimation } from './animations-builders/buildCrawlAnimation';
import { buildPeekAnimation } from './animations-builders/buildPeekAnimation';
import { buildCreditsAnimation } from './animations-builders/buildCreditsAnimation';
import { buildAscendAnimation } from './animations-builders/buildAscendAnimation';
import { buildDescendAnimation } from './animations-builders/buildDescendAnimation';
import { buildWhipAnimation } from './animations-builders/buildWhipAnimation';
import { buildThreadAnimation } from './animations-builders/buildThreadAnimation';
import { buildFlipAnimation } from './animations-builders/buildFlipAnimation';
import { buildFoldAnimation } from './animations-builders/buildFoldAnimation';
import { buildPinwheelAnimation } from './animations-builders/buildPinwheelAnimation';
import { buildZoomAnimation } from './animations-builders/buildZoomAnimation';
import { buildLightSpeedAnimation } from './animations-builders/buildLightSpeedAnimation';
import { buildArcUpAnimation } from './animations-builders/buildArcUpAnimation';
import { buildSwishAnimation } from './animations-builders/buildSwishAnimation';
import { buildCurveUpAnimation } from './animations-builders/buildCurveUpAnimation';
import { buildCurveDownAnimation } from './animations-builders/buildCurveDownAnimation';
import { buildFloatInAnimation } from './animations-builders/buildFloatInAnimation';
import { buildFloatOutAnimation } from './animations-builders/buildFloatOutAnimation';
import { buildRiseUpAnimation } from './animations-builders/buildRiseUpAnimation';
import { buildDescendEntranceAnimation } from './animations-builders/buildDescendEntranceAnimation';
import { buildAscendExitAnimation } from './animations-builders/buildAscendExitAnimation';
import { buildGlideAnimation } from './animations-builders/buildGlideAnimation';
import { buildRandomEffectsAnimation } from './animations-builders/buildRandomEffectsAnimation';
import { buildDissolveAnimation } from './animations-builders/buildDissolveAnimation';
import { buildSpinnerAnimation } from './animations-builders/buildSpinnerAnimation';
import { buildCenterRevolveAnimation } from './animations-builders/buildCenterRevolveAnimation';
import { buildFadeAnimation } from './animations-builders/buildFadeAnimation';
import { buildGrowAndTurnAnimation } from './animations-builders/buildGrowAndTurnAnimation';
import { buildFlashOnceAnimation } from './animations-builders/buildFlashOnceAnimation';
import { buildBoomerangAnimation } from './animations-builders/buildBoomerangAnimation';
import { buildBounceAnimation } from './animations-builders/buildBounceAnimation';
import { buildColorRevealAnimation } from './animations-builders/buildColorRevealAnimation';
import { buildShimmerAnimation } from './animations-builders/buildShimmerAnimation';
import { buildEaseInAnimation } from './animations-builders/buildEaseInAnimation';
import { buildFadedSwivelAnimation } from './animations-builders/buildFadedSwivelAnimation';
import { buildThinLineAnimation } from './animations-builders/buildThinLineAnimation';
import { buildSlingAnimation } from './animations-builders/buildSlingAnimation';
import { buildTransparencyAnimation } from './animations-builders/buildTransparencyAnimation';
import { buildColorEmphasisAnimation } from './animations-builders/buildColorEmphasisAnimation';
import { buildChangeFillColorAnimation } from './animations-builders/buildChangeFillColorAnimation';
import { buildObjectColorAnimation } from './animations-builders/buildObjectColorAnimation';
import { buildChangeFontAnimation } from './animations-builders/buildChangeFontAnimation';
import { buildChangeFontColorAnimation } from './animations-builders/buildChangeFontColorAnimation';
import { buildColorPulseAnimation } from './animations-builders/buildColorPulseAnimation';
import { buildFlickerAnimation } from './animations-builders/buildFlickerAnimation';
import { buildGrowWithColorAnimation } from './animations-builders/buildGrowWithColorAnimation';
import { buildLightenAnimation } from './animations-builders/buildLightenAnimation';
import { buildStyleEmphasisAnimation } from './animations-builders/buildStyleEmphasisAnimation';
import { buildTeeterAnimation } from './animations-builders/buildTeeterAnimation';
import { buildSpinAnimation } from './animations-builders/buildSpinAnimation';
import { buildVerticalGrowAnimation } from './animations-builders/buildVerticalGrowAnimation';
import { buildWaveAnimation } from './animations-builders/buildWaveAnimation';
import { buildChangeFontSizeAnimation } from './animations-builders/buildChangeFontSizeAnimation';
import { buildGrowShrinkAnimation } from './animations-builders/buildGrowShrinkAnimation';
import { buildChangeFontStyleAnimation } from './animations-builders/buildChangeFontStyleAnimation';
import { buildChangeLineColorAnimation } from './animations-builders/buildChangeLineColorAnimation';
import { buildBlastAnimation } from './animations-builders/buildBlastAnimation';
import { buildBoldRevealAnimation } from './animations-builders/buildBoldRevealAnimation';
import { buildBoldFlashAnimation } from './animations-builders/buildBoldFlashAnimation';
import { buildBrushColorAnimation } from './animations-builders/buildBrushColorAnimation';
import { buildBrushOnUnderlineAnimation } from './animations-builders/buildBrushOnUnderlineAnimation';
import { buildBlindsAnimation } from './animations-builders/buildBlindsAnimation';
import { buildArriveAnimation, buildTurntableAnimation, buildSwingAnimation, buildJumpAndTurnAnimation, buildLeaveAnimation } from './animations-builders/build3DModelAnimation';
import { normalizeModel3DAnimationEffectName } from './animations-builders/data3DAnimationTemplates';
import { addHashPrefixForEntrance } from './animations-builders/utils';
export { addHashPrefixForEntrance, addHashPrefix, getDefaultDelay } from './animations-builders/utils';
// ============================================================================
// CUSTOM BUILDER LOOKUP TABLE (Opus Refactor 2026-02-01)
// Replaces 170-line if-else chain with O(1) lookup
// ============================================================================
export const CUSTOM_BUILDER_MAP = {
    'buildUnfoldAnimation': buildUnfoldAnimation,
    'buildSpiralAnimation': buildSpiralAnimation,
    'buildFadedSwivelAnimation': buildFadedSwivelAnimation,
    'buildSlingAnimation': buildSlingAnimation,
    'buildTransparencyAnimation': buildTransparencyAnimation,
    'buildSpinAnimation': buildSpinAnimation,
    'buildColorEmphasisAnimation': buildColorEmphasisAnimation,
    'buildChangeFillColorAnimation': buildChangeFillColorAnimation,
    'buildObjectColorAnimation': buildObjectColorAnimation,
    'buildChangeFontAnimation': buildChangeFontAnimation,
    'buildChangeFontColorAnimation': buildChangeFontColorAnimation,
    'buildChangeLineColorAnimation': buildChangeLineColorAnimation,
    'buildChangeFontSizeAnimation': buildChangeFontSizeAnimation,
    'buildChangeFontStyleAnimation': buildChangeFontStyleAnimation,
    'buildGrowShrinkAnimation': buildGrowShrinkAnimation,
    'buildBlastAnimation': buildBlastAnimation,
    'buildBoldRevealAnimation': buildBoldRevealAnimation,
    'buildBoldFlashAnimation': buildBoldFlashAnimation,
    'buildBrushColorAnimation': buildBrushColorAnimation,
    'buildBrushOnUnderlineAnimation': buildBrushOnUnderlineAnimation,
    'buildColorPulseAnimation': buildColorPulseAnimation,
    'buildFlickerAnimation': buildFlickerAnimation,
    'buildGrowWithColorAnimation': buildGrowWithColorAnimation,
    'buildLightenAnimation': buildLightenAnimation,
    'buildStyleEmphasisAnimation': buildStyleEmphasisAnimation,
    'buildTeeterAnimation': buildTeeterAnimation,
    'buildVerticalGrowAnimation': buildVerticalGrowAnimation,
    'buildWaveAnimation': buildWaveAnimation,
    'buildThinLineAnimation': buildThinLineAnimation,
    'buildSwivelAnimation': buildSwivelAnimation,
    'buildStretchAnimation': buildStretchAnimation,
    'buildStretchyAnimation': buildStretchyAnimation,
    'buildFloatAnimation': buildFloatAnimation,
    'buildSplitAnimation': buildSplitAnimation,
    'buildCrawlAnimation': buildCrawlAnimation,
    'buildBlindsAnimation': buildBlindsAnimation,
    'buildPeekAnimation': buildPeekAnimation,
    'buildCreditsAnimation': buildCreditsAnimation,
    'buildCurveUpAnimation': buildCurveUpAnimation,
    'buildCurveDownAnimation': buildCurveDownAnimation,
    'buildFloatInAnimation': buildFloatInAnimation,
    'buildFloatOutAnimation': buildFloatOutAnimation,
    'buildRiseUpAnimation': buildRiseUpAnimation,
    'buildDescendEntranceAnimation': buildDescendEntranceAnimation,
    'buildAscendExitAnimation': buildAscendExitAnimation,
    'buildGlideAnimation': buildGlideAnimation,
    'buildRandomEffectsAnimation': buildRandomEffectsAnimation,
    'buildDissolveAnimation': buildDissolveAnimation,
    'buildSpinnerAnimation': buildSpinnerAnimation,
    'buildCenterRevolveAnimation': buildCenterRevolveAnimation,
    'buildFadeAnimation': buildFadeAnimation,
    'buildGrowAndTurnAnimation': buildGrowAndTurnAnimation,
    'buildFlashOnceAnimation': buildFlashOnceAnimation,
    'buildBoomerangAnimation': buildBoomerangAnimation,
    'buildBounceAnimation': buildBounceAnimation,
    'buildColorRevealAnimation': buildColorRevealAnimation,
    'buildShimmerAnimation': buildShimmerAnimation,
    'buildEaseInAnimation': buildEaseInAnimation,
    'buildAscendAnimation': buildAscendAnimation,
    'buildDescendAnimation': buildDescendAnimation,
    'buildWhipAnimation': buildWhipAnimation,
    'buildThreadAnimation': buildThreadAnimation,
    'buildFlipAnimation': buildFlipAnimation,
    'buildFoldAnimation': buildFoldAnimation,
    'buildPinwheelAnimation': buildPinwheelAnimation,
    'buildStripsAnimation': buildStripsAnimation,
    'buildSwishAnimation': buildSwishAnimation,
    'buildZoomAnimation': buildZoomAnimation,
    'buildLightSpeedAnimation': buildLightSpeedAnimation,
    'buildArcUpAnimation': buildArcUpAnimation,
    'buildFadedZoomAnimation': buildFadedZoomAnimation,
    'buildZipAnimation': buildZipAnimation,
    'buildDropAnimation': buildDropAnimation,
    'build3ElementAnimation': build3ElementAnimation,
    'buildExpandAnimation': buildExpandAnimation,
    'build5ElementPatternA': build5ElementPatternA,
    'build5ElementPatternB': build5ElementPatternB,
    'build5ElementPatternC': build5ElementPatternC,
    'build6ElementAnimation': build6ElementAnimation,
    'build7PlusElementAnimation': build7PlusElementAnimation,
    // Native 3D model animations (reverse-engineered from 3DanimationFrozenReference.pptx)
    'buildArriveAnimation': buildArriveAnimation,
    'buildTurntableAnimation': buildTurntableAnimation,
    'buildSwingAnimation': buildSwingAnimation,
    'buildJumpAndTurnAnimation': buildJumpAndTurnAnimation,
    'buildLeaveAnimation': buildLeaveAnimation,
};
// ============================================================================
// TEMPLATE BUILDERS
// ============================================================================
/**
 * Build simple animation (Appear, Fade, etc.)
 * These animations only use a visibility setter
 *
 * nodeType is now passed via context and included during generation (NO post-processing!)
 */
export function buildSimpleAnimation(ctx) {
    const { shapeId, animation, config, ids, type, target } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const presetClass = config.presetClass === 'emph' ? 'emph'
        : config.presetClass === 'path' ? 'path'
            : (type === 'entrance' ? 'entr' : 'exit');
    const delay = animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0);
    const visibilityValue = type === 'entrance' ? 'visible' : 'hidden';
    // When duration > 1ms, the visibility setter fires at the end of the animation period (duration-1)
    // This matches PowerPoint/COM behavior for Appear/Disappear in sequenced animations
    const duration = animation.duration !== undefined ? animation.duration : (config.defaultDuration || 0);
    const setDelay = duration > 1 ? duration - 1 : 0;
    // Build target XML
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>
				<p:set>
					<p:cBhvr>
						<p:cTn id="${ids.set}" dur="1" fill="hold">
							<p:stCondLst>
								<p:cond delay="${setDelay}"/>
							</p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to>
						<p:strVal val="${visibilityValue}"/>
					</p:to>
				</p:set>
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
/**
 * Build directional animation (Fly, Wipe, etc.)
 * These animations involve motion or directional effects
 */
export function buildDirectionalAnimation(ctx) {
    const { shapeId, animation, config, ids, type, target } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    let directionConfig = ctx.directionConfig;
    // COMPLETE registry entries may not include explicit direction lists; allow generic directionN names.
    if (!directionConfig) {
        const dirStr = animation.direction;
        const m = dirStr ? /^direction(\d+)$/i.exec(dirStr) : null;
        if (m) {
            directionConfig = { name: dirStr, presetSubtype: parseInt(m[1], 10) };
        }
        else {
            // Default subtype when none provided
            // Note: If buildAnimation() already provided directionConfig, we won't reach here
            directionConfig = { name: dirStr || 'direction0', presetSubtype: 0 };
        }
    }
    const duration = animation.duration || config.defaultDuration || 500;
    const presetClass = config.presetClass === 'emph' ? 'emph'
        : config.presetClass === 'path' ? 'path'
            : (type === 'entrance' ? 'entr' : 'exit');
    // Use registry-driven defaultDelay
    const delay = animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0);
    const visibilityValue = type === 'entrance' ? 'visible' : 'hidden';
    // Build target XML
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    // Determine if this is a motion animation
    // Priority: 1) Explicit config.useMotionBuilder, 2) Infer from formulas
    let isMotion;
    if (config.useMotionBuilder !== undefined) {
        // Use explicit config flag
        isMotion = config.useMotionBuilder;
    }
    else {
        // Infer from direction config (has x/y formulas)
        isMotion = !!(directionConfig.xFormula && directionConfig.yFormula);
    }
    // Ensure downstream helpers see the resolved directionConfig
    const ctx2 = Object.assign(Object.assign({}, ctx), { directionConfig });
    if (!isMotion) {
        // Non-motion directional animation (e.g., Blinds, Wipe)
        return buildNonMotionDirectional(ctx2, targetXml, delay, duration, presetClass, visibilityValue);
    }
    // Motion-based directional animation (e.g., Fly)
    return buildMotionDirectional(ctx2, targetXml, delay, duration, presetClass, visibilityValue);
}
/**
 * Build non-motion directional animation (Blinds, Wipe, etc.)
 */
function buildNonMotionDirectional(ctx, targetXml, delay, duration, presetClass, visibilityValue) {
    var _a;
    const { shapeId, animation, config, directionConfig, ids, type } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    // Determine filter string
    let filter = config.name.toLowerCase();
    // Wheel uses special filter format: wheel(N) where N is number of spokes
    // Exception: 1 spoke ENTRANCE uses "wheel(inVertical)", but EXIT uses "wheel(1)"
    if (filter === 'wheel' && directionConfig) {
        // Fixed: Frozen reference uses wheel(1) not wheel(inVertical)
        filter = `wheel(${directionConfig.presetSubtype})`;
    }
    // Checkerboard uses filter format: checkerboard(direction) where direction is across/down
    // NOTE: PowerPoint only has 2 filters: checkerboard(across) and checkerboard(down)
    // The "Up" direction in the UI actually uses the "down" filter internally
    if (filter === 'checkerboard' && directionConfig) {
        const dirName = directionConfig.name.toLowerCase();
        // Map "up" to "down" since PowerPoint doesn't have a separate "up" filter
        const filterDir = dirName === 'up' ? 'down' : dirName;
        filter = `checkerboard(${filterDir})`;
    }
    // Strips uses filter format: strips(direction) where direction is upLeft/upRight/downLeft/downRight
    // Map direction names to filter names: topLeft->upLeft, topRight->upRight, bottomLeft->downLeft, bottomRight->downRight
    if (filter === 'strips' && directionConfig) {
        const dirName = directionConfig.name;
        const filterDir = dirName.replace('top', 'up').replace('bottom', 'down');
        filter = `strips(${filterDir})`;
    }
    // Wipe uses filter format: wipe(direction) where direction is left/right/up/down
    // Map fromLeft->left, fromRight->right, fromTop->up, fromBottom->down (entrance)
    // Map toLeft->left, toRight->right, toTop->up, toBottom->down (exit)
    if (filter === 'wipe' && directionConfig) {
        const dirName = directionConfig.name;
        let filterDir = dirName.replace(/^(from|to)/, ''); // Remove 'from' or 'to' prefix
        // Convert to lowercase and map direction names
        if (filterDir === 'Left')
            filterDir = 'left';
        else if (filterDir === 'Right')
            filterDir = 'right';
        else if (filterDir === 'Top')
            filterDir = 'up';
        else if (filterDir === 'Bottom')
            filterDir = 'down';
        filter = `wipe(${filterDir})`;
    }
    // Blinds uses filter format: blinds(direction) where direction is horizontal/vertical
    if (filter === 'blinds' && directionConfig) {
        filter = `blinds(${directionConfig.name})`;
    }
    // Box uses filter format: box(direction) where direction is in/out
    if (filter === 'box' && directionConfig) {
        filter = `box(${directionConfig.name})`;
    }
    // RandomBars uses filter format: randombar(direction) where direction is horizontal/vertical
    // Note: filter name is 'randombar' (singular), not 'randombars'
    if (filter === 'random bars' && directionConfig) {
        filter = `randombar(${directionConfig.name})`;
    }
    // Split uses filter format: barn(direction) where direction is inHorizontal/outHorizontal/inVertical/outVertical
    // Map horizontalIn->inHorizontal, horizontalOut->outHorizontal, verticalIn->inVertical, verticalOut->outVertical
    if (filter === 'split' && directionConfig) {
        const dirName = directionConfig.name;
        const filterDir = dirName.replace('horizontalIn', 'inHorizontal').replace('horizontalOut', 'outHorizontal')
            .replace('verticalIn', 'inVertical').replace('verticalOut', 'outVertical');
        filter = `barn(${filterDir})`;
    }
    // Circle, Diamond, Plus use filter format: effectName(direction) where direction is in/out
    if ((filter === 'circle' || filter === 'diamond' || filter === 'plus') && directionConfig) {
        filter = `${filter}(${directionConfig.name})`;
    }
    // Check if this effect uses visibility setter
    // Allow user override via animation.usesVisibility, otherwise use registry default
    const usesVisibility = animation.usesVisibility !== undefined
        ? animation.usesVisibility
        : (((_a = config.metadata) === null || _a === void 0 ? void 0 : _a.usesVisibility) === true);
    // Determine transition value based on entrance/exit
    const transition = type === 'entrance' ? 'in' : 'out';
    // Build child elements
    let childElements = '';
    // For entrance with visibility: set comes first
    if (type === 'entrance' && usesVisibility) {
        childElements += `
				<p:set>
					<p:cBhvr>
						<p:cTn id="${ids.set}" dur="1" fill="hold">
							<p:stCondLst>
								<p:cond delay="0"/>
							</p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to>
						<p:strVal val="${visibilityValue}"/>
					</p:to>
				</p:set>`;
    }
    // animEffect element - single element per animation
    // NOTE: multiplier is internal PowerPoint metadata, not XML element count
    // CRITICAL: Inner cTn does NOT have fill="hold" (only outer wrapper has it)
    childElements += `
				<p:animEffect transition="${transition}" filter="${filter}">
					<p:cBhvr>
						<p:cTn id="${ids.effect}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>`;
    // For exit with visibility: set comes last
    if (type === 'exit' && usesVisibility) {
        childElements += `
				<p:set>
					<p:cBhvr>
						<p:cTn id="${ids.set}" dur="1" fill="hold">
							<p:stCondLst>
								<p:cond delay="${duration - 1}"/>
							</p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to>
						<p:strVal val="${visibilityValue}"/>
					</p:to>
				</p:set>`;
    }
    // Build complete animation
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="${directionConfig.presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>
				${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
/**
 * Build emphasis animation (color changes, effects that modify existing objects)
 */
export function buildEmphasisAnimation(ctx) {
    const { shapeId, animation, config, ids, target, type } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const delay = animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0);
    const duration = animation.duration || config.defaultDuration || 500;
    // Build target XML
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    // Determine transition based on type (emphasis usually uses 'in', but respect type)
    const transition = type === 'exit' ? 'out' : 'in';
    // Emphasis animations typically use animEffect with style changes
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="emph" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>
				<p:animEffect transition="${transition}" filter="${config.name}">
					<p:cBhvr>
						<p:cTn id="${ids.effect}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
/**
 * Build path/motion animation (object follows a path)
 * Motion paths use <p:animMotion> with SVG-like path data
 * ALL motion paths use presetID=1 and presetClass="path"
 * They differ by their path data string
 */
function buildPathAnimation(ctx) {
    const { shapeId, animation, config, ids, target } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const delay = animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0);
    const duration = animation.duration || config.defaultDuration || 2000;
    // Get path data - animation options take priority over config defaults
    // This allows custom paths to override the registry default for an effect
    const pathData = animation.pathData || animation.path || config.pathData || 'M 0 0 L 0.25 0 Z';
    // Build target XML based on sequence mode
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    // Motion path animations use animMotion with ppt_x and ppt_y attributes
    // Reference structure from frozen PPTX:
    // - accel="50000" decel="50000" for smooth easing (on cTn wrapper)
    // - origin="layout" pathEditMode="relative" ptsTypes="" on animMotion
    // - Attributes: ppt_x and ppt_y
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="path" presetSubtype="0" accel="50000" decel="50000" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>
				<p:animMotion origin="layout" path="${pathData}" pathEditMode="relative" ptsTypes="">
					<p:cBhvr>
						<p:cTn id="${ids.effect}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:animMotion>
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
/**
 * Build media animation (play, pause, stop commands for video/audio)
 * Media animations use <p:cmd> element with type="call" and a command string
 *
 * Media command presetIDs (from frozen reference):
 * - presetID=1: playFrom(0.0) - start playback
 * - presetID=2: togglePause - pause/resume
 * - presetID=3: stop - stop playback
 *
 * nodeType is determined by trigger:
 * - onClick → clickEffect (separate click group)
 * - withPrevious → withEffect (simultaneous with previous)
 * - afterPrevious → afterEffect (auto-play after previous)
 *
 * Structure based on frozen Batch9 Slide 6 reference
 */
function buildMediaAnimation(ctx) {
    const { shapeId, animation, config, ids } = ctx;
    const delay = animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0);
    // Determine media command from animation props or config
    // Priority: animation.mediaCommand > config.mediaCommand > derive from effect name
    let mediaCommand = animation.mediaCommand || config.mediaCommand;
    let isPlayCommand = false;
    if (!mediaCommand) {
        // Derive from effect name
        const effect = (animation.effect || '').toLowerCase();
        if (effect === 'play' || effect === 'mediaplay') {
            mediaCommand = 'playFrom(0.0)';
            isPlayCommand = true;
        }
        else if (effect === 'pause' || effect === 'togglepause' || effect === 'mediapause') {
            mediaCommand = 'togglePause';
        }
        else if (effect === 'stop' || effect === 'mediastop') {
            mediaCommand = 'stop';
        }
        else {
            mediaCommand = 'playFrom(0.0)'; // default
            isPlayCommand = true;
        }
    }
    else if (mediaCommand.startsWith('playFrom')) {
        isPlayCommand = true;
    }
    // Duration handling:
    // - playFrom commands: use animation.duration if specified (video playback duration), otherwise default to 1
    // - togglePause/stop commands: always use dur="1"
    // The duration for playFrom represents how long the video will play (in ms)
    const duration = isPlayCommand ? (animation.duration || 1) : 1;
    // Determine nodeType from trigger
    const trigger = animation.trigger || 'onClick';
    const nodeTypeMapping = config.nodeTypeMapping || {};
    let nodeType = nodeTypeMapping[trigger] || 'clickEffect';
    if (!nodeTypeMapping[trigger] && trigger === 'withPrevious') {
        nodeType = 'withEffect';
    }
    else if (!nodeTypeMapping[trigger] && trigger === 'afterPrevious') {
        nodeType = 'afterEffect';
    }
    // Allow targeting a different SPID (for cross-targeting scenarios)
    // e.g., Fade Media2 but play Media1 simultaneously
    const targetSpid = animation.targetSpid || animation.spid || shapeId;
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>
				<p:cmd type="call" cmd="${mediaCommand}">
					<p:cBhvr>
						<p:cTn id="${ids.effect}" dur="${duration}" fill="hold"/>
						<p:tgtEl>
							<p:spTgt spid="${targetSpid}"/>
						</p:tgtEl>
					</p:cBhvr>
				</p:cmd>
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
/**
 * Build generic animation (fallback for unsupported types)
 * Uses minimal XML structure that PowerPoint will accept
 */
function buildGenericAnimation(ctx) {
    const { shapeId, animation, config, ids, target, type } = ctx;
    const nodeType = ctx.nodeType || 'clickEffect';
    const presetClass = config.presetClass;
    const delay = animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0);
    const duration = animation.duration || config.defaultDuration || 500;
    // Build target XML
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    // Determine transition based on entrance/exit
    const transition = type === 'entrance' ? 'in' : 'out';
    // Generic structure that works for most animations
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>
				<p:animEffect transition="${transition}" filter="${config.name}">
					<p:cBhvr>
						<p:cTn id="${ids.effect}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
/**
 * Build motion directional animation (Fly)
 */
/**
 * Generate target element based on sequence mode
 * CRITICAL: asOneObject uses bare <p:spTgt>, others use <p:bg /> or <p:txEl>
 *
 * PowerPoint targeting modes:
 * - asOneObject: <p:spTgt spid="X" /> (bare, NO child elements)
 * - allAtOnce/byParagraph base: <p:spTgt spid="X"><p:bg /></p:spTgt>
 * - allAtOnce/byParagraph paragraph: <p:spTgt spid="X"><p:txEl><p:pRg st="N" end="N" /></p:txEl></p:spTgt>
 */
function generateTarget(shapeId, sequence = 'asOneObject', paragraphIndex) {
    if (paragraphIndex === undefined) {
        // Whole shape targeting
        if (sequence === 'asOneObject') {
            return `<p:spTgt spid="${shapeId}" />`; // Bare (NO children)
        }
        else {
            return `<p:spTgt spid="${shapeId}"><p:bg /></p:spTgt>`; // With bg child
        }
    }
    else {
        // Paragraph targeting
        return `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${paragraphIndex}" end="${paragraphIndex}" /></p:txEl></p:spTgt>`;
    }
}
/**
 * Build rotation animation (spin)
 * Used by: spin
 */
function buildRotationAnimation(ctx) {
    const { shapeId, animation, config } = ctx;
    const nodeType = ctx.nodeType || 'clickEffect';
    const duration = animation.duration || config.defaultDuration || 700;
    const delay = animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0);
    // Get rotation parameters
    const degrees = animation.degrees || 360;
    const clockwise = animation.clockwise !== false;
    const byValue = degrees * 60000 * (clockwise ? 1 : -1);
    const mainId = getNextAnimationId();
    const rotId = getNextAnimationId();
    return `
		<p:par>
			<p:cTn id="${mainId}" presetID="${config.presetId}" presetClass="${config.presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
				<p:stCondLst>
					<p:cond delay="${delay}"/>
				</p:stCondLst>
				<p:childTnLst>
					<p:animRot by="${byValue}">
						<p:cBhvr>
							<p:cTn id="${rotId}" dur="${duration}" fill="hold"/>
							<p:tgtEl>
								<p:spTgt spid="${shapeId}"/>
							</p:tgtEl>
							<p:attrNameLst>
								<p:attrName>r</p:attrName>
							</p:attrNameLst>
						</p:cBhvr>
					</p:animRot>
				</p:childTnLst>
			</p:cTn>
		</p:par>`.trim();
}
/**
 * Build scale animation (grow/shrink)
 * Used by: growshrink
 */
function buildScaleAnimation(ctx) {
    const { shapeId, animation, config } = ctx;
    const nodeType = ctx.nodeType || 'clickEffect';
    const duration = animation.duration || config.defaultDuration || 700;
    const delay = animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0);
    const scale = animation.scale || 1.5;
    const scaleX = Math.round(scale * 100000);
    const scaleY = Math.round(scale * 100000);
    const mainId = getNextAnimationId();
    const scaleId = getNextAnimationId();
    return `
		<p:par>
			<p:cTn id="${mainId}" presetID="${config.presetId}" presetClass="${config.presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
				<p:stCondLst>
					<p:cond delay="${delay}"/>
				</p:stCondLst>
				<p:childTnLst>
					<p:animScale>
						<p:cBhvr>
							<p:cTn id="${scaleId}" dur="${duration}" fill="hold"/>
							<p:tgtEl>
								<p:spTgt spid="${shapeId}"/>
							</p:tgtEl>
						</p:cBhvr>
						<p:by x="${scaleX}" y="${scaleY}"/>
					</p:animScale>
				</p:childTnLst>
			</p:cTn>
		</p:par>`.trim();
}
/**
 * Build filter animation (swivel, randombars, float)
 * Used by: swivel, randombars, float
 */
function buildFilterSpecialAnimation(ctx) {
    const { shapeId, animation, config, type, directionConfig } = ctx;
    const nodeType = ctx.nodeType || 'clickEffect';
    const duration = animation.duration || config.defaultDuration || 700;
    const delay = animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0);
    const presetSubtype = (directionConfig === null || directionConfig === void 0 ? void 0 : directionConfig.presetSubtype) || 0;
    const effect = (animation.effect || '').toLowerCase();
    const direction = (animation.direction || '').toLowerCase();
    // Determine filter string
    let filter = '';
    if (effect === 'randombars') {
        filter = `randombar(${direction || 'horizontal'})`;
    }
    else if (effect === 'swivel') {
        filter = 'swivel';
    }
    else if (effect === 'float') {
        filter = `wipe(${direction || 'down'})`;
    }
    const transition = type === 'entrance' ? 'in' : 'out';
    const visibilityValue = type === 'entrance' ? 'visible' : 'hidden';
    const useVisibility = type === 'entrance';
    const mainId = getNextAnimationId();
    const setId = useVisibility ? getNextAnimationId() : 0;
    const effectId = getNextAnimationId();
    return `
		<p:par>
			<p:cTn id="${mainId}" presetID="${config.presetId}" presetClass="${config.presetClass}" presetSubtype="${presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
				<p:stCondLst>
					<p:cond delay="${delay}"/>
				</p:stCondLst>
				<p:childTnLst>
					${useVisibility ? `
					<p:set>
						<p:cBhvr>
							<p:cTn id="${setId}" dur="1" fill="hold">
								<p:stCondLst><p:cond delay="0"/></p:stCondLst>
							</p:cTn>
							<p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl>
							<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
						</p:cBhvr>
						<p:to><p:strVal val="${visibilityValue}"/></p:to>
					</p:set>` : ''}
					<p:animEffect transition="${transition}" filter="${filter}">
						<p:cBhvr>
							<p:cTn id="${effectId}" dur="${duration}"/>
							<p:tgtEl>
								<p:spTgt spid="${shapeId}"/>
							</p:tgtEl>
						</p:cBhvr>
					</p:animEffect>
				</p:childTnLst>
			</p:cTn>
		</p:par>`.trim();
}
/**
 * Build 3-element animation (1 set + 2 anim for width/height)
 * Used by: Box(7), Checkerboard(12), Blinds(19), RandomBars(23), Strips(28)
 */
export function build3ElementAnimation(ctx) {
    const { shapeId, animation, config, directionConfig, type, ids, target } = ctx;
    const nodeType = ctx.nodeType || 'clickEffect';
    const duration = animation.duration || config.defaultDuration || 500;
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const delay = animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0);
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    const presetSubtype = (directionConfig === null || directionConfig === void 0 ? void 0 : directionConfig.presetSubtype) || 0;
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    // Animate width and height from 0 to full (entrance) or reverse (exit)
    const wFrom = addHashPrefixForEntrance(isEntrance ? '0' : 'ppt_w', isEntrance);
    const wTo = addHashPrefixForEntrance(isEntrance ? 'ppt_w' : '0', isEntrance);
    const hFrom = addHashPrefixForEntrance(isEntrance ? '0' : 'ppt_h', isEntrance);
    const hTo = addHashPrefixForEntrance(isEntrance ? 'ppt_h' : '0', isEntrance);
    const setId = getNextAnimationId();
    const animWId = getNextAnimationId();
    const animHId = getNextAnimationId();
    // Helper function to generate correct value element (fltVal for '0', strVal for formulas)
    const genVal = (val) => {
        return val === '0' ? `<p:fltVal val="0"/>` : `<p:strVal val="${val}"/>`;
    };
    const childElements = `
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr additive="base">
						<p:cTn id="${animWId}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_w</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val>${genVal(wFrom)}</p:val></p:tav>
						<p:tav tm="100000"><p:val>${genVal(wTo)}</p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr additive="base">
						<p:cTn id="${animHId}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_h</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val>${genVal(hFrom)}</p:val></p:tav>
						<p:tav tm="100000"><p:val>${genVal(hTo)}</p:val></p:tav>
					</p:tavLst>
				</p:anim>`;
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="${presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>
				${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
/**
 * Build Expand animation (presetID=55)
 * Structure: 1 set + 2 anim (ppt_w, ppt_h) + 1 animEffect
 * Entrance: width scales from 70% to 100%, height stays constant
 * Exit: width scales from 100% to 70%, height stays constant
 *
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_WHEELFIX_v7.pptx slide9.xml
 */
export function buildExpandAnimation(ctx) {
    console.log(`[EXPAND TEMPLATE] Called for spid=${ctx.shapeId}, type=${ctx.type}`);
    const { shapeId, animation, config, type, ids, target } = ctx;
    const nodeType = ctx.nodeType || 'clickEffect';
    const duration = animation.duration || config.defaultDuration || 500;
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const delay = animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0);
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    const transition = isEntrance ? 'in' : 'out';
    // Build target XML
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    // CRITICAL: Entrance uses # prefix, Exit does NOT
    // Entrance: #ppt_w*0.70 → #ppt_w
    // Exit: ppt_w  ppt_w*0.70
    const wFrom = addHashPrefixForEntrance(isEntrance ? 'ppt_w*0.70' : 'ppt_w', isEntrance);
    const wTo = addHashPrefixForEntrance(isEntrance ? 'ppt_w' : 'ppt_w*0.70', isEntrance);
    const hFrom = addHashPrefixForEntrance('ppt_h', isEntrance);
    const hTo = addHashPrefixForEntrance('ppt_h', isEntrance);
    // Generate IDs for all 4 sub-elements
    const setId = getNextAnimationId();
    const animWId = getNextAnimationId();
    const animHId = getNextAnimationId();
    const effectId = getNextAnimationId();
    // Build the visibility setter element
    const setElement = `
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="${isEntrance ? 0 : duration - 1}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>`;
    // Build the anim and animEffect elements
    // CRITICAL: Entrance has fill="hold" on anim elements, Exit does NOT
    // Use config.exitFillHold to override default behavior for specific effects
    const useExitFillHold = config.exitFillHold === true;
    const animFill = isEntrance ? ' fill="hold"' : (useExitFillHold ? ' fill="hold"' : '');
    const animElements = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animWId}" dur="${duration}"${animFill}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_w</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${wFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${wTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animHId}" dur="${duration}"${animFill}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_h</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${hFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${hTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:animEffect transition="${transition}" filter="fade">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>`;
    // CRITICAL: Element order differs for entrance vs exit
    // Entrance: set + anim(w) + anim(h) + animEffect
    // Exit: anim(w) + anim(h) + animEffect + set
    const childElements = isEntrance ? (setElement + animElements) : (animElements + setElement);
    const result = `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
    // DEBUG: Check what we're returning
    const childCount = (result.match(/<p:set|<p:anim|<p:animEffect/g) || []).length;
    console.log(`[EXPAND TEMPLATE] Returning XML with ${childCount} sub-elements (should be 4)`);
    return result;
}
/**
 * Build 5-element animations - Three different patterns
 */
// Pattern A: set + 4 anim (presetID 15,23)
export function build5ElementPatternA(ctx) {
    const { shapeId, animation, config, directionConfig, type, ids, target } = ctx;
    const nodeType = ctx.nodeType || 'clickEffect';
    const duration = animation.duration || config.defaultDuration || 500;
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const delay = animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0);
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    const presetSubtype = (directionConfig === null || directionConfig === void 0 ? void 0 : directionConfig.presetSubtype) || 0;
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    const setId = getNextAnimationId();
    const anim1 = getNextAnimationId();
    const anim2 = getNextAnimationId();
    const anim3 = getNextAnimationId();
    const anim4 = getNextAnimationId();
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="${presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
			<p:childTnLst>
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr><p:cTn id="${anim1}" dur="${duration}" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst></p:cBhvr>
					<p:tavLst><p:tav tm="0"><p:val><p:strVal val="ppt_x"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="ppt_x"/></p:val></p:tav></p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr><p:cTn id="${anim2}" dur="${duration}" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr>
					<p:tavLst><p:tav tm="0"><p:val><p:strVal val="ppt_y"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="ppt_y"/></p:val></p:tav></p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr><p:cTn id="${anim3}" dur="${duration}" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>ppt_w</p:attrName></p:attrNameLst></p:cBhvr>
					<p:tavLst><p:tav tm="0"><p:val><p:strVal val="${isEntrance ? '0' : 'ppt_w'}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${isEntrance ? 'ppt_w' : '0'}"/></p:val></p:tav></p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr><p:cTn id="${anim4}" dur="${duration}" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>ppt_h</p:attrName></p:attrNameLst></p:cBhvr>
					<p:tavLst><p:tav tm="0"><p:val><p:strVal val="${isEntrance ? '0' : 'ppt_h'}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${isEntrance ? 'ppt_h' : '0'}"/></p:val></p:tav></p:tavLst>
				</p:anim>
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
// Pattern B: set + animEffect + 3 anim (presetID 35,24)
export function build5ElementPatternB(ctx) {
    const { shapeId, animation, config, type, ids, target } = ctx;
    const nodeType = ctx.nodeType || 'clickEffect';
    const duration = animation.duration || config.defaultDuration || 500;
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const delay = animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0);
    const transition = isEntrance ? 'in' : 'out';
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    const setId = getNextAnimationId();
    const effectId = getNextAnimationId();
    const anim1 = getNextAnimationId();
    const anim2 = getNextAnimationId();
    const anim3 = getNextAnimationId();
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
			<p:childTnLst>
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>
				<p:animEffect transition="${transition}" filter="fade"><p:cBhvr><p:cTn id="${effectId}" dur="${duration}"/><p:tgtEl>${targetXml}</p:tgtEl></p:cBhvr></p:animEffect>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr><p:cTn id="${anim1}" dur="${duration}" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst></p:cBhvr>
					<p:tavLst><p:tav tm="0"><p:val><p:strVal val="ppt_x"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="ppt_x"/></p:val></p:tav></p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr><p:cTn id="${anim2}" dur="${duration}" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>ppt_w</p:attrName></p:attrNameLst></p:cBhvr>
					<p:tavLst><p:tav tm="0"><p:val><p:strVal val="${isEntrance ? '0' : '1'}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${isEntrance ? '1' : '0'}"/></p:val></p:tav></p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr><p:cTn id="${anim3}" dur="${duration}" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>ppt_h</p:attrName></p:attrNameLst></p:cBhvr>
					<p:tavLst><p:tav tm="0"><p:val><p:strVal val="${isEntrance ? '0' : '1'}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${isEntrance ? '1' : '0'}"/></p:val></p:tav></p:tavLst>
				</p:anim>
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
// Pattern C: set + 3 anim + animRot (presetID 56)
export function build5ElementPatternC(ctx) {
    const { shapeId, animation, config, type, ids, target } = ctx;
    const nodeType = ctx.nodeType || 'clickEffect';
    const duration = animation.duration || config.defaultDuration || 500;
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const delay = animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0);
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    const setId = getNextAnimationId();
    const anim1 = getNextAnimationId();
    const anim2 = getNextAnimationId();
    const anim3 = getNextAnimationId();
    const rotId = getNextAnimationId();
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
			<p:childTnLst>
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr><p:cTn id="${anim1}" dur="${duration}" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst></p:cBhvr>
					<p:tavLst><p:tav tm="0"><p:val><p:strVal val="ppt_x"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="ppt_x"/></p:val></p:tav></p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr><p:cTn id="${anim2}" dur="${duration}" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr>
					<p:tavLst><p:tav tm="0"><p:val><p:strVal val="ppt_y"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="ppt_y"/></p:val></p:tav></p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr><p:cTn id="${anim3}" dur="${duration}" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>ppt_w</p:attrName></p:attrNameLst></p:cBhvr>
					<p:tavLst><p:tav tm="0"><p:val><p:strVal val="${isEntrance ? '0' : '1'}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${isEntrance ? '1' : '0'}"/></p:val></p:tav></p:tavLst>
				</p:anim>
				<p:animRot by="360">
					<p:cBhvr><p:cTn id="${rotId}" dur="${duration}" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl></p:cBhvr>
				</p:animRot>
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
export function build6ElementAnimation(ctx) {
    const { shapeId, animation, config, type, ids, target } = ctx;
    const nodeType = ctx.nodeType || 'clickEffect';
    const duration = animation.duration || config.defaultDuration || 500;
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const delay = animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0);
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    const ids6 = Array.from({ length: 6 }, () => getNextAnimationId());
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
			<p:childTnLst>
				<p:set><p:cBhvr><p:cTn id="${ids6[0]}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${visibilityValue}"/></p:to></p:set>
				<p:set><p:cBhvr><p:cTn id="${ids6[1]}" dur="1" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${visibilityValue}"/></p:to></p:set>
				<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="${ids6[2]}" dur="${duration}" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="ppt_x"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="ppt_x"/></p:val></p:tav></p:tavLst></p:anim>
				<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="${ids6[3]}" dur="${duration}" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="ppt_y"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="ppt_y"/></p:val></p:tav></p:tavLst></p:anim>
				<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="${ids6[4]}" dur="${duration}" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>ppt_w</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="${isEntrance ? '0' : '1'}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${isEntrance ? '1' : '0'}"/></p:val></p:tav></p:tavLst></p:anim>
				<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="${ids6[5]}" dur="${duration}" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>ppt_h</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="${isEntrance ? '0' : '1'}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${isEntrance ? '1' : '0'}"/></p:val></p:tav></p:tavLst></p:anim>
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
// 7+ elements (presetID 30,51): Super complex
export function build7PlusElementAnimation(ctx) {
    const { shapeId, animation, config, type, ids, target } = ctx;
    const nodeType = ctx.nodeType || 'clickEffect';
    const duration = animation.duration || config.defaultDuration || 500;
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const delay = animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0);
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    const ids7 = Array.from({ length: 8 }, () => getNextAnimationId());
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
			<p:childTnLst>
				<p:set><p:cBhvr><p:cTn id="${ids7[0]}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${visibilityValue}"/></p:to></p:set>
				<p:animEffect transition=${isEntrance ? 'in' : 'out'} filter="fade"><p:cBhvr><p:cTn id="${ids7[1]}" dur="${duration}"/><p:tgtEl>${targetXml}</p:tgtEl></p:cBhvr></p:animEffect>
				<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="${ids7[2]}" dur="${duration}" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="ppt_x"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="ppt_x"/></p:val></p:tav></p:tavLst></p:anim>
				<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="${ids7[3]}" dur="${duration}" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="ppt_y"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="ppt_y"/></p:val></p:tav></p:tavLst></p:anim>
				<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="${ids7[4]}" dur="${duration}" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>ppt_w</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="${isEntrance ? '0' : '1'}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${isEntrance ? '1' : '0'}"/></p:val></p:tav></p:tavLst></p:anim>
				<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="${ids7[5]}" dur="${duration}" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>ppt_h</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="${isEntrance ? '0' : '1'}"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="${isEntrance ? '1' : '0'}"/></p:val></p:tav></p:tavLst></p:anim>
				<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="${ids7[6]}" dur="${duration}" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>ppt_w</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="1"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="1"/></p:val></p:tav></p:tavLst></p:anim>
				<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="${ids7[7]}" dur="${duration}" fill="hold"/><p:tgtEl>${targetXml}</p:tgtEl><p:attrNameLst><p:attrName>ppt_h</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="1"/></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="1"/></p:val></p:tav></p:tavLst></p:anim>
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
/**
 * Build complex transform animation (growandturn)
 * Combines width, height, and rotation
 * Used by: growandturn
 */
function buildComplexTransformAnimation(ctx) {
    const { shapeId, animation, config, type, directionConfig } = ctx;
    const nodeType = ctx.nodeType || 'clickEffect';
    const duration = animation.duration || config.defaultDuration || 700;
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const delay = animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0);
    const presetSubtype = (directionConfig === null || directionConfig === void 0 ? void 0 : directionConfig.presetSubtype) || 4;
    const direction = (animation.direction || 'right').toLowerCase();
    const isRight = direction.includes('right');
    const rotationSign = isRight ? '-90' : '90';
    const wFrom = addHashPrefixForEntrance(isEntrance ? '0' : 'ppt_w', isEntrance);
    const wTo = addHashPrefixForEntrance(isEntrance ? 'ppt_w' : '0', isEntrance);
    const hFrom = addHashPrefixForEntrance(isEntrance ? '0' : 'ppt_h', isEntrance);
    const hTo = addHashPrefixForEntrance(isEntrance ? 'ppt_h' : '0', isEntrance);
    const rotStart = isEntrance ? rotationSign : '0';
    const rotEnd = isEntrance ? '0' : rotationSign;
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    const visDelay = type === 'exit' ? duration - 1 : 0;
    const mainId = getNextAnimationId();
    const setId1 = isEntrance ? getNextAnimationId() : 0;
    const widthId = getNextAnimationId();
    const heightId = getNextAnimationId();
    const rotId = getNextAnimationId();
    const setId2 = !isEntrance ? getNextAnimationId() : 0;
    return `
		<p:par>
			<p:cTn id="${mainId}" presetID="${config.presetId}" presetClass="${config.presetClass}" presetSubtype="${presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
				<p:stCondLst>
					<p:cond delay="${delay}"/>
				</p:stCondLst>
				<p:childTnLst>
					${isEntrance ? `
					<p:set>
						<p:cBhvr>
							<p:cTn id="${setId1}" dur="1" fill="hold">
								<p:stCondLst><p:cond delay="0"/></p:stCondLst>
							</p:cTn>
							<p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl>
							<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
						</p:cBhvr>
						<p:to><p:strVal val="${visibilityValue}"/></p:to>
					</p:set>` : ''}
					<p:anim calcmode="lin" valueType="num">
						<p:cBhvr>
							<p:cTn id="${widthId}" dur="${duration}" fill="hold"/>
							<p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl>
							<p:attrNameLst><p:attrName>ppt_w</p:attrName></p:attrNameLst>
						</p:cBhvr>
						<p:tavLst>
							<p:tav tm="0"><p:val><p:fltVal val="${wFrom}"/></p:val></p:tav>
							<p:tav tm="100000"><p:val><p:strVal val="${wTo}"/></p:val></p:tav>
						</p:tavLst>
					</p:anim>
					<p:anim calcmode="lin" valueType="num">
						<p:cBhvr>
							<p:cTn id="${heightId}" dur="${duration}" fill="hold"/>
							<p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl>
							<p:attrNameLst><p:attrName>ppt_h</p:attrName></p:attrNameLst>
						</p:cBhvr>
						<p:tavLst>
							<p:tav tm="0"><p:val><p:fltVal val="${hFrom}"/></p:val></p:tav>
							<p:tav tm="100000"><p:val><p:strVal val="${hTo}"/></p:val></p:tav>
						</p:tavLst>
					</p:anim>
					<p:anim calcmode="lin" valueType="num">
						<p:cBhvr>
							<p:cTn id="${rotId}" dur="${duration}" fill="hold"/>
							<p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl>
							<p:attrNameLst><p:attrName>style.rotation</p:attrName></p:attrNameLst>
						</p:cBhvr>
						<p:tavLst>
							<p:tav tm="0"><p:val><p:fltVal val="${rotStart}"/></p:val></p:tav>
							<p:tav tm="100000"><p:val><p:fltVal val="${rotEnd}"/></p:val></p:tav>
						</p:tavLst>
					</p:anim>
					${!isEntrance ? `
					<p:set>
						<p:cBhvr>
							<p:cTn id="${setId2}" dur="1" fill="hold">
								<p:stCondLst><p:cond delay="${visDelay}"/></p:stCondLst>
							</p:cTn>
							<p:tgtEl><p:spTgt spid="${shapeId}"/></p:tgtEl>
							<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
						</p:cBhvr>
						<p:to><p:strVal val="${visibilityValue}"/></p:to>
					</p:set>` : ''}
				</p:childTnLst>
			</p:cTn>
		</p:par>`.trim();
}
/**
 * Add # prefix to ppt_ variables for entrance animations
 * CRITICAL: Entrance formulas need # prefix on ppt_ vars, Exit formulas do NOT
 * Examples:
 *   "ppt_x" → "#ppt_x" (entrance), "ppt_x" → "ppt_x" (exit)
 *   "0-ppt_w/2" → "0-#ppt_w/2" (entrance), "0-ppt_w/2" → "0-ppt_w/2" (exit)
 *   "ppt_x+ppt_w/2" → "#ppt_x+#ppt_w/2" (entrance)
 */
// The original implementations have been moved to the modular structure for reusability
function buildMotionDirectional(ctx, targetXml, delay, duration, presetClass, visibilityValue) {
    var _a;
    const { shapeId, config, directionConfig, ids, type } = ctx;
    const nodeType = ctx.nodeType || 'clickEffect';
    // Check if this effect uses visibility setter
    // Only effects with usesVisibility:true in metadata should generate visibility setter
    const usesVisibility = ((_a = config.metadata) === null || _a === void 0 ? void 0 : _a.usesVisibility) === true;
    const isEntrance = type === 'entrance';
    let xml = `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="${directionConfig.presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>`;
    // For entrance: visibility setter comes FIRST (only if effect uses it)
    if (type === 'entrance' && usesVisibility) {
        xml += `
				<p:set>
					<p:cBhvr>
						<p:cTn id="${ids.set}" dur="1" fill="hold">
							<p:stCondLst>
								<p:cond delay="0"/>
							</p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to>
						<p:strVal val="${visibilityValue}"/>
					</p:to>
				</p:set>`;
    }
    // X-coordinate animation
    // CRITICAL: Entrance has fill="hold" on anim elements, Exit does NOT
    // Use config.exitFillHold to override default behavior for specific effects
    const useExitFillHold = config.exitFillHold === true;
    const animFill = isEntrance ? ' fill="hold"' : (useExitFillHold ? ' fill="hold"' : '');
    xml += `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr additive="base">
						<p:cTn id="${ids.animX}" dur="${duration}"${animFill}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0">
							<p:val>
								<p:strVal val="${addHashPrefixForEntrance(directionConfig.xFormula.from, isEntrance)}"/>
							</p:val>
						</p:tav>
						<p:tav tm="100000">
							<p:val>
								<p:strVal val="${addHashPrefixForEntrance(directionConfig.xFormula.to, isEntrance)}"/>
							</p:val>
						</p:tav>
					</p:tavLst>
				</p:anim>`;
    // Y-coordinate animation
    xml += `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr additive="base">
						<p:cTn id="${ids.animY}" dur="${duration}"${animFill}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0">
							<p:val>
								<p:strVal val="${addHashPrefixForEntrance(directionConfig.yFormula.from, isEntrance)}"/>
							</p:val>
						</p:tav>
						<p:tav tm="100000">
							<p:val>
								<p:strVal val="${addHashPrefixForEntrance(directionConfig.yFormula.to, isEntrance)}"/>
							</p:val>
						</p:tav>
					</p:tavLst>
				</p:anim>`;
    // For exit: visibility setter comes LAST (only if effect uses it)
    if (type === 'exit' && usesVisibility) {
        xml += `
				<p:set>
					<p:cBhvr>
						<p:cTn id="${ids.set}" dur="1" fill="hold">
							<p:stCondLst>
								<p:cond delay="${duration - 1}"/>
							</p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to>
						<p:strVal val="${visibilityValue}"/>
					</p:to>
				</p:set>`;
    }
    xml += `
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
    return xml;
}
// ============================================================================
// MAIN BUILDER FUNCTION
// ============================================================================
/**
 * Remove grpId attribute from animation XML
 * Used for Multiple Animation Principle - when a shape has multiple animations,
 * grpId must be omitted to prevent PowerPoint repair issues.
 */
function removeGrpIdFromXml(xml) {
    return xml.replace(/ grpId="0"/g, '');
}
/**
 * Build animation XML from configuration
 * This is the main entry point for the data-driven system
 *
 * @param shapeId - Shape ID
 * @param animation - Animation properties
 * @param target - Target type for the animation
 * @param options - Options for generation
 * @param options.skipGrpId - When true, omit grpId attribute (for Multiple Animation Principle)
 */
export function buildAnimation(shapeId, animation, target, options) {
    var _a;
    const skipGrpId = (_a = options === null || options === void 0 ? void 0 : options.skipGrpId) !== null && _a !== void 0 ? _a : false;
    // Call the internal builder
    let xml = buildAnimationInternal(shapeId, animation, target);
    // Post-process: Remove grpId if skipGrpId is true (Multiple Animation Principle)
    if (skipGrpId) {
        xml = removeGrpIdFromXml(xml);
    }
    return xml;
}
/**
 * Internal animation builder - does the actual XML generation
 */
function buildAnimationInternal(shapeId, animation, target) {
    var _a;
    // Get effect name and direction
    // For motion paths, use motionPath property instead of effect
    const rawEffect = animation.type === 'motion' && animation.motionPath
        ? animation.motionPath
        : animation.effect || 'appear';
    const effect = normalizeModel3DAnimationEffectName(rawEffect);
    // Handle Wheel spokes property: convert to direction for directional builder
    let direction = animation.direction;
    if (effect === 'wheel' && animation.spokes !== undefined) {
        direction = String(animation.spokes);
    }
    // Determine animation type FIRST (needed for registry lookup)
    // V3 supports: entrance, exit, emphasis, motion
    const type = (animation.type === 'exit' ? 'exit'
        : animation.type === 'emphasis' ? 'emphasis'
            : animation.type === 'motion' ? 'motion'
                : animation.type === 'media' ? 'media'
                    : 'entrance');
    // Single source of truth: ANIMATION_REGISTRY_MERGED
    let config = getAnimationConfigMerged(effect, type);
    if (!config)
        config = getAnimationConfig(effect, type); // Fallback to original registry for backwards compatibility
    if (!config) {
        throw new Error(`Animation "${effect}" not found in registry`);
    }
    // Get direction config from the same registry we got the config from
    // Case-insensitive lookup to support both camelCase API input and PowerPoint-friendly names
    let directionConfig = undefined;
    if (direction && config.directions) {
        directionConfig = config.directions.find(d => d.name.toLowerCase() === direction.toLowerCase());
        // For exit animations, try mapping "toXXX" to "fromXXX" direction
        if (!directionConfig && type === 'exit' && direction.toLowerCase().startsWith('to')) {
            const entranceDirection = direction.replace(/^to/i, 'from');
            const entranceConfig = config.directions.find(d => d.name.toLowerCase() === entranceDirection.toLowerCase());
            if (entranceConfig) {
                // Clone and flip formulas for exit
                directionConfig = {
                    name: direction,
                    presetSubtype: entranceConfig.presetSubtype,
                    xFormula: entranceConfig.xFormula ? {
                        from: entranceConfig.xFormula.to,
                        to: entranceConfig.xFormula.from
                    } : undefined,
                    yFormula: entranceConfig.yFormula ? {
                        from: entranceConfig.yFormula.to,
                        to: entranceConfig.yFormula.from
                    } : undefined
                };
            }
        }
        // Support generic direction names from CSV registry like "direction4" by mapping to presetSubtype.
        if (!directionConfig) {
            const m = /^direction(\d+)$/i.exec(direction);
            if (m) {
                const sub = parseInt(m[1], 10);
                directionConfig = config.directions.find(d => d.presetSubtype === sub);
                // If the current config doesn't have that subtype, try merged registry config for the effect.
                if (!directionConfig) {
                    const alt = getAnimationConfigMerged(effect, type);
                    if (alt === null || alt === void 0 ? void 0 : alt.directions) {
                        directionConfig = alt.directions.find(d => d.presetSubtype === sub);
                    }
                }
            }
        }
        // Validate direction
        if (!directionConfig) {
            const available = config.directions.map(d => d.name).join(', ');
            throw new Error(`Unknown direction "${direction}" for effect "${effect}" (${type}). Available: ${available}`);
        }
    }
    // Allocate IDs
    const ids = {
        main: getNextAnimationId(),
        set: getNextAnimationId(),
        animX: getNextAnimationId(),
        animY: getNextAnimationId(),
        effect: getNextAnimationId()
    };
    // Build context
    const ctx = {
        shapeId,
        animation,
        config,
        directionConfig,
        type,
        ids,
        target,
        grpId: (_a = animation.grpId) !== null && _a !== void 0 ? _a : 0 // Per-shape animation index (entrance=0, exit=1, etc.)
    };
    // FIRST: Check for custom templates (they override presetClass defaults)
    const templateGen = config.templateGenerator;
    // SECOND: If no custom template, route by presetClass to ensure full catalog works
    // This makes the V3 builder truly data-driven for all 149 entries.
    if (templateGen !== 'custom') {
        if (config.presetClass === 'emph') {
            return buildEmphasisAnimation(Object.assign(Object.assign({}, ctx), { type: 'emphasis' }));
        }
        if (config.presetClass === 'path') {
            return buildPathAnimation(Object.assign(Object.assign({}, ctx), { type: 'motion' }));
        }
        if (config.presetClass === 'mediacall') {
            return buildMediaAnimation(Object.assign(Object.assign({}, ctx), { type: 'media' }));
        }
    }
    // THIRD: entrance/exit routing by templateGenerator
    switch (templateGen) {
        case 'simple':
            return buildSimpleAnimation(ctx);
        case 'directional':
            // Some COMPLETE registry entries omit direction lists; builder can fall back to direction0/directionN.
            return buildDirectionalAnimation(ctx);
        case 'emphasis':
            return buildEmphasisAnimation(ctx);
        case 'rotation':
            return buildRotationAnimation(ctx);
        case 'scale':
            return buildScaleAnimation(ctx);
        case 'filter-special':
            return buildFilterSpecialAnimation(ctx);
        case 'complex-transform':
            return buildComplexTransformAnimation(ctx);
        case 'generic':
            return buildGenericAnimation(ctx);
        case 'custom': {
            // Opus Refactor: Use lookup table instead of 170-line if-else chain
            const customTemplate = config.customTemplate;
            const builder = CUSTOM_BUILDER_MAP[customTemplate];
            if (builder) {
                return builder(ctx);
            }
            throw new Error(`Custom template "${customTemplate}" not implemented for "${effect}"`);
        }
        default:
            return buildGenericAnimation(ctx);
    }
}
// ============================================================================
// COMPATIBILITY FUNCTIONS
// ============================================================================
/**
 * Check if an effect is supported by the builder
 */
export function canBuildAnimation(effect) {
    const effectKey = normalizeModel3DAnimationEffectName(effect);
    // Use getAnimationConfigMerged which handles lowercase lookup properly (single source of truth)
    return getAnimationConfigMerged(effectKey) !== undefined
        || getAnimationConfigMerged(`${effectKey}-exit`) !== undefined
        || getAnimationConfig(effectKey) !== undefined;
}
/**
 * Get available directions for an effect
 */
export function getAvailableDirections(effect, type = 'entrance') {
    const effectKey = normalizeModel3DAnimationEffectName(effect);
    let config = getAnimationConfigMerged(effectKey, type);
    if (!config)
        config = getAnimationConfig(effectKey, type); // Fallback to original registry
    if (!config || !config.directions)
        return [];
    return config.directions.map(d => d.name);
}
/**
 * Get animation metadata
 */
export function getAnimationMetadata(effect, type = 'entrance') {
    const effectKey = normalizeModel3DAnimationEffectName(effect);
    let config = getAnimationConfigMerged(effectKey, type);
    if (!config)
        config = getAnimationConfig(effectKey, type); // Fallback to original registry
    if (!config)
        return undefined;
    return {
        supportsDirection: config.supportsDirection || false,
        supportsSequence: config.supportsSequence || false,
        defaultDuration: config.defaultDuration || 500,
        category: config.category
    };
}
//# sourceMappingURL=gen-animations-builder.js.map