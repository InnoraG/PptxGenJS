/**
 * PptxGenJS: Dictionary-Based Animation System - Main Index
 *
 * Centralized animation template registry and lookup functions.
 * Templates are extracted from frozen PowerPoint reference files.
 */
// Entrance templates (27 effects from Batch 1)
import { BlindsEntranceTemplate } from './entrance/blinds.js';
import { BoxEntranceTemplate } from './entrance/box.js';
import { CheckerboardEntranceTemplate } from './entrance/checkerboard.js';
import { CircleEntranceTemplate } from './entrance/circle.js';
import { CrawlEntranceTemplate } from './entrance/crawl.js';
import { CreditsEntranceTemplate } from './entrance/credits.js';
import { DiamondEntranceTemplate } from './entrance/diamond.js';
import { DropEntranceTemplate } from './entrance/drop.js';
import { DissolveEntranceTemplate } from './entrance/dissolve.js';
import { ExpandEntranceTemplate } from './entrance/expand.js';
import { FadeEntranceTemplate } from './entrance/fade.js';
import { FlipEntranceTemplate } from './entrance/flip.js';
import { FlyEntranceTemplate } from './entrance/fly.js';
import { PeekEntranceTemplate } from './entrance/peek.js';
import { PinwheelEntranceTemplate } from './entrance/pinwheel.js';
import { PlusEntranceTemplate } from './entrance/plus.js';
import { RandomBarsEntranceTemplate } from './entrance/randombars.js';
import { SpiralEntranceTemplate } from './entrance/spiral.js';
import { SplitEntranceTemplate } from './entrance/split.js';
import { StretchEntranceTemplate } from './entrance/stretch.js';
import { StretchyEntranceTemplate } from './entrance/stretchy.js';
import { StripsEntranceTemplate } from './entrance/strips.js';
import { SwishEntranceTemplate } from './entrance/swish.js';
import { SwivelEntranceTemplate } from './entrance/swivel.js';
import { UnfoldEntranceTemplate } from './entrance/unfold.js';
import { WedgeEntranceTemplate } from './entrance/wedge.js';
import { WheelEntranceTemplate } from './entrance/wheel.js';
import { WhipEntranceTemplate } from './entrance/whip.js';
import { WipeEntranceTemplate } from './entrance/wipe.js';
import { ZipEntranceTemplate } from './entrance/zip.js';
import { ZoomEntranceTemplate } from './entrance/zoom.js';
import { LightSpeedEntranceTemplate } from './entrance/lightspeed.js';
import { RiseUpEntranceTemplate } from './entrance/riseup.js';
import { ArcUpEntranceTemplate } from './entrance/arcup.js';
import { GlideEntranceTemplate } from './entrance/glide.js';
import { SpinnerEntranceTemplate } from './entrance/spinner.js';
import { CenterRevolveEntranceTemplate } from './entrance/centerrevolve.js';
import { GrowAndTurnEntranceTemplate } from './entrance/growandturn.js';
// Exit templates (27 effects from Batch 1)
import { BlindsExitTemplate } from './exit/blinds.js';
import { BoxExitTemplate } from './exit/box.js';
import { CheckerboardExitTemplate } from './exit/checkerboard.js';
import { CircleExitTemplate } from './exit/circle.js';
import { CrawlExitTemplate } from './exit/crawl.js';
import { CreditsExitTemplate } from './exit/credits.js';
import { DiamondExitTemplate } from './exit/diamond.js';
import { DropExitTemplate } from './exit/drop.js';
import { DissolveExitTemplate } from './exit/dissolve.js';
import { ExpandExitTemplate } from './exit/expand.js';
import { FadeExitTemplate } from './exit/fade.js';
import { FlipExitTemplate } from './exit/flip.js';
import { FlyExitTemplate } from './exit/fly.js';
import { PeekExitTemplate } from './exit/peek.js';
import { PinwheelExitTemplate } from './exit/pinwheel.js';
import { PlusExitTemplate } from './exit/plus.js';
import { RandomBarsExitTemplate } from './exit/randombars.js';
import { SpiralExitTemplate } from './exit/spiral.js';
import { SplitExitTemplate } from './exit/split.js';
import { StretchExitTemplate } from './exit/stretch.js';
import { StretchyExitTemplate } from './exit/stretchy.js';
import { StripsExitTemplate } from './exit/strips.js';
import { SwishExitTemplate } from './exit/swish.js';
import { SwivelExitTemplate } from './exit/swivel.js';
import { UnfoldExitTemplate } from './exit/unfold.js';
import { WedgeExitTemplate } from './exit/wedge.js';
import { WheelExitTemplate } from './exit/wheel.js';
import { WhipExitTemplate } from './exit/whip.js';
import { WipeExitTemplate } from './exit/wipe.js';
import { ZipExitTemplate } from './exit/zip.js';
import { ZoomExitTemplate } from './exit/zoom.js';
/**
 * Animation template dictionary organized by type and effect name
 */
export const ANIMATION_DICTIONARY = {
    entrance: {
        'Blinds': BlindsEntranceTemplate,
        'Box': BoxEntranceTemplate,
        'Checkerboard': CheckerboardEntranceTemplate,
        'Circle': CircleEntranceTemplate,
        'Crawl': CrawlEntranceTemplate,
        'Credits': CreditsEntranceTemplate,
        'Diamond': DiamondEntranceTemplate,
        'Dissolve': DissolveEntranceTemplate,
        'Drop': DropEntranceTemplate,
        'Expand': ExpandEntranceTemplate,
        'Fade': FadeEntranceTemplate,
        'Flip': FlipEntranceTemplate,
        'Fly': FlyEntranceTemplate,
        'Peek': PeekEntranceTemplate,
        'Pinwheel': PinwheelEntranceTemplate,
        'Plus': PlusEntranceTemplate,
        'RandomBars': RandomBarsEntranceTemplate,
        'Spiral': SpiralEntranceTemplate,
        'Split': SplitEntranceTemplate,
        'Stretch': StretchEntranceTemplate,
        'Stretchy': StretchyEntranceTemplate,
        'Strips': StripsEntranceTemplate,
        'Swish': SwishEntranceTemplate,
        'Swivel': SwivelEntranceTemplate,
        'Unfold': UnfoldEntranceTemplate,
        'Wedge': WedgeEntranceTemplate,
        'Wheel': WheelEntranceTemplate,
        'Whip': WhipEntranceTemplate,
        'Wipe': WipeEntranceTemplate,
        'Zip': ZipEntranceTemplate,
        'Zoom': ZoomEntranceTemplate,
        'LightSpeed': LightSpeedEntranceTemplate,
        'RiseUp': RiseUpEntranceTemplate,
        'ArcUp': ArcUpEntranceTemplate,
        'Glide': GlideEntranceTemplate,
        'Spinner': SpinnerEntranceTemplate,
        'CenterRevolve': CenterRevolveEntranceTemplate,
        'GrowAndTurn': GrowAndTurnEntranceTemplate
    },
    exit: {
        'Blinds': BlindsExitTemplate,
        'Box': BoxExitTemplate,
        'Checkerboard': CheckerboardExitTemplate,
        'Circle': CircleExitTemplate,
        'Crawl': CrawlExitTemplate,
        'Credits': CreditsExitTemplate,
        'Diamond': DiamondExitTemplate,
        'Dissolve': DissolveExitTemplate,
        'Drop': DropExitTemplate,
        'Expand': ExpandExitTemplate,
        'Fade': FadeExitTemplate,
        'Flip': FlipExitTemplate,
        'Fly': FlyExitTemplate,
        'Peek': PeekExitTemplate,
        'Pinwheel': PinwheelExitTemplate,
        'Plus': PlusExitTemplate,
        'RandomBars': RandomBarsExitTemplate,
        'Spiral': SpiralExitTemplate,
        'Split': SplitExitTemplate,
        'Stretch': StretchExitTemplate,
        'Stretchy': StretchyExitTemplate,
        'Strips': StripsExitTemplate,
        'Swish': SwishExitTemplate,
        'Swivel': SwivelExitTemplate,
        'Unfold': UnfoldExitTemplate,
        'Wedge': WedgeExitTemplate,
        'Wheel': WheelExitTemplate,
        'Whip': WhipExitTemplate,
        'Wipe': WipeExitTemplate,
        'Zip': ZipExitTemplate,
        'Zoom': ZoomExitTemplate
    }
};
/**
 * Get animation template from dictionary
 *
 * @param type - Animation type (entrance or exit)
 * @param effectName - Effect name (e.g., 'Expand', 'Fly')
 * @param direction - Direction name (for directional effects like 'From Bottom')
 * @param sequenceMode - Sequence mode (asOneObject/byParagraph/allAtOnce)
 * @returns Animation template with OOXML and parameter list
 * @throws Error if template not found
 */
export function getAnimationTemplate(type, effectName, direction, sequenceMode) {
    // 1. Find effect in dictionary
    const effect = ANIMATION_DICTIONARY[type][effectName];
    if (!effect) {
        throw new Error(`Animation not found in dictionary: ${type}/${effectName}`);
    }
    // 2. Handle directional effects
    if (direction && effect.directions) {
        const dirTemplate = effect.directions[direction];
        if (!dirTemplate) {
            throw new Error(`Direction not found: ${effectName}/${direction}`);
        }
        let template = dirTemplate[sequenceMode];
        // Fallback: if requested mode not found, try asOneObject
        if (!template && sequenceMode !== 'asOneObject') {
            console.warn(`[Dictionary] ${effectName}/${direction}/${sequenceMode} not found, falling back to asOneObject`);
            template = dirTemplate['asOneObject'];
        }
        if (!template) {
            throw new Error(`No templates found for direction: ${effectName}/${direction}`);
        }
        return template;
    }
    // 3. Handle non-directional effects
    let template = effect[sequenceMode];
    // Fallback: if requested mode not found, try asOneObject
    if (!template && sequenceMode !== 'asOneObject') {
        console.warn(`[Dictionary] ${effectName}/${sequenceMode} not found, falling back to asOneObject`);
        template = effect['asOneObject'];
    }
    if (!template) {
        throw new Error(`No templates found for: ${effectName}`);
    }
    return template;
}
/**
 * Check if animation exists in dictionary
 */
export function hasAnimation(type, effectName) {
    return !!ANIMATION_DICTIONARY[type][effectName];
}
//# sourceMappingURL=index.js.map