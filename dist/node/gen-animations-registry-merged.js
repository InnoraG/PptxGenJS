/**
 * PptxGenJS: Merged Animation Registry
 *
 * Combines hand-crafted high-quality animations (24) with auto-generated ones (126)
 * Total: 150 animations covering entrance, exit, emphasis, and motion paths
 */
// ============================================================================
// COMPLETE ANIMATION REGISTRY - 150 ANIMATIONS
// ============================================================================
export const ANIMATION_REGISTRY_MERGED = {
    // ========================================================================
    // NATIVE 3D MODEL ANIMATIONS (5)
    // Reverse-engineered from 3Danimations_MANUALLYFROZENREFERENCE.pptx. Target
    // a model3d graphicFrame (spid). The native 3D effects support PowerPoint
    // Effect Options for direction, rotationAxis object/view, and effect-specific
    // intensity/amount. Object Center directions are Right/Back/Clockwise/Left/
    // Front/Counterclockwise; legacy `direction: 'view'` selects view-space
    // right/moderate (presetSubtype 128).
    // presetClass + templateGenerator:'custom' are required so emphasis entries
    // reach the custom builder instead of the generic emphasis route.
    // ========================================================================
    'arrive': {
        presetId: 60,
        name: 'Arrive',
        presetClass: 'entr',
        category: 'entrance',
        defaultDuration: 1000,
        templateGenerator: 'custom',
        customTemplate: 'buildArriveAnimation'
    },
    'turntable': {
        presetId: 37,
        name: 'Turntable',
        presetClass: 'emph',
        category: 'emphasis',
        defaultDuration: 2000,
        templateGenerator: 'custom',
        customTemplate: 'buildTurntableAnimation'
    },
    'swing': {
        presetId: 38,
        name: 'Swing',
        presetClass: 'emph',
        category: 'emphasis',
        defaultDuration: 2000,
        templateGenerator: 'custom',
        customTemplate: 'buildSwingAnimation'
    },
    'jumpandturn': {
        presetId: 39,
        name: 'Jump & Turn',
        presetClass: 'emph',
        category: 'emphasis',
        defaultDuration: 2000,
        templateGenerator: 'custom',
        customTemplate: 'buildJumpAndTurnAnimation'
    },
    'leave': {
        presetId: 60,
        name: 'Leave',
        presetClass: 'exit',
        category: 'exit',
        defaultDuration: 1000,
        templateGenerator: 'custom',
        customTemplate: 'buildLeaveAnimation'
    },
    // ========================================================================
    // ENTRANCE ANIMATIONS (52) - Hand-crafted quality for common ones
    // ========================================================================
    'appear': {
        presetId: 1,
        name: 'Appear',
        defaultDuration: 700, // ✅ CORRECTED: Frozen reference batch6 shows inner set delay=699 (duration-1)
        defaultDelay: 150, // ✅ CORRECTED: Frozen reference uses 150, not 0
        supportsSequence: true,
        templateGenerator: 'simple',
        metadata: { usesVisibility: true, elementOrder: ['set'] }
    },
    'blinds': {
        presetId: 3,
        name: 'Blinds',
        defaultDuration: 500,
        defaultDelay: 150,
        supportsDirection: true,
        supportsSequence: true,
        subAnimationCount: 1,
        // NOTE: Blinds is a simple animEffect-based animation (NOT motion-based like Crawl)
        // Uses filter="blinds(horizontal)" or filter="blinds(vertical)"
        // COUNTER-INTUITIVE: presetSubtype 10 produces horizontal filter, 5 produces vertical filter
        templateGenerator: 'custom',
        customTemplate: 'buildBlindsAnimation',
        directions: [
            // Blinds direction names map to presetSubtype (filter is derived from subtype in builder)
            { name: 'horizontal', presetSubtype: 10 },
            { name: 'vertical', presetSubtype: 5 }
        ]
    },
    'box': {
        presetId: 4,
        name: 'Box',
        defaultDuration: 500,
        defaultDelay: 150,
        supportsDirection: true,
        supportsSequence: true,
        templateGenerator: 'directional',
        directions: [
            { name: 'in', presetSubtype: 16 },
            { name: 'out', presetSubtype: 32 }
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'animEffect'] }
    },
    'fly': {
        presetId: 2,
        name: 'Fly',
        defaultDuration: 700,
        defaultDelay: 150,
        supportsDirection: true,
        supportsSequence: true,
        // NOTE: Effect has 3 sub-elements (visibility setter + motion/effects)
        templateGenerator: 'directional',
        directions: [
            // Entrance directions (from*)
            { name: 'fromBottom', presetSubtype: 4, xFormula: { from: 'ppt_x', to: 'ppt_x' }, yFormula: { from: '1+ppt_h/2', to: 'ppt_y' } },
            { name: 'fromTop', presetSubtype: 1, xFormula: { from: 'ppt_x', to: 'ppt_x' }, yFormula: { from: '0-ppt_h/2', to: 'ppt_y' } },
            { name: 'fromLeft', presetSubtype: 8, xFormula: { from: '0-ppt_w/2', to: 'ppt_x' }, yFormula: { from: 'ppt_y', to: 'ppt_y' } },
            { name: 'fromRight', presetSubtype: 2, xFormula: { from: '1+ppt_w/2', to: 'ppt_x' }, yFormula: { from: 'ppt_y', to: 'ppt_y' } },
            { name: 'fromTopLeft', presetSubtype: 9, xFormula: { from: '0-ppt_w/2', to: 'ppt_x' }, yFormula: { from: '0-ppt_h/2', to: 'ppt_y' } },
            { name: 'fromTopRight', presetSubtype: 3, xFormula: { from: '1+ppt_w/2', to: 'ppt_x' }, yFormula: { from: '0-ppt_h/2', to: 'ppt_y' } },
            { name: 'fromBottomLeft', presetSubtype: 12, xFormula: { from: '0-ppt_w/2', to: 'ppt_x' }, yFormula: { from: '1+ppt_h/2', to: 'ppt_y' } },
            { name: 'fromBottomRight', presetSubtype: 6, xFormula: { from: '1+ppt_w/2', to: 'ppt_x' }, yFormula: { from: '1+ppt_h/2', to: 'ppt_y' } },
            // Exit directions (to*) - same presetSubtypes, formulas reversed
            { name: 'toBottom', presetSubtype: 4, xFormula: { from: 'ppt_x', to: 'ppt_x' }, yFormula: { from: 'ppt_y', to: '1+ppt_h/2' } },
            { name: 'toTop', presetSubtype: 1, xFormula: { from: 'ppt_x', to: 'ppt_x' }, yFormula: { from: 'ppt_y', to: '0-ppt_h/2' } },
            { name: 'toLeft', presetSubtype: 8, xFormula: { from: 'ppt_x', to: '0-ppt_w/2' }, yFormula: { from: 'ppt_y', to: 'ppt_y' } },
            { name: 'toRight', presetSubtype: 2, xFormula: { from: 'ppt_x', to: '1+ppt_w/2' }, yFormula: { from: 'ppt_y', to: 'ppt_y' } },
            { name: 'toTopLeft', presetSubtype: 9, xFormula: { from: 'ppt_x', to: '0-ppt_w/2' }, yFormula: { from: 'ppt_y', to: '0-ppt_h/2' } },
            { name: 'toTopRight', presetSubtype: 3, xFormula: { from: 'ppt_x', to: '1+ppt_w/2' }, yFormula: { from: 'ppt_y', to: '0-ppt_h/2' } },
            { name: 'toBottomLeft', presetSubtype: 12, xFormula: { from: 'ppt_x', to: '0-ppt_w/2' }, yFormula: { from: 'ppt_y', to: '1+ppt_h/2' } },
            { name: 'toBottomRight', presetSubtype: 6, xFormula: { from: 'ppt_x', to: '1+ppt_w/2' }, yFormula: { from: 'ppt_y', to: '1+ppt_h/2' } }
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'anim', 'anim'] }
    },
    'checkerboard': {
        presetId: 5,
        name: 'Checkerboard',
        defaultDuration: 500,
        defaultDelay: 150,
        supportsDirection: true,
        supportsSequence: true,
        templateGenerator: 'directional',
        directions: [
            { name: 'Across', presetSubtype: 10 }, // filter: checkerboard(across)
            { name: 'Down', presetSubtype: 5 }, // filter: checkerboard(down) - ✅ FIXED: was 10
            { name: 'Up', presetSubtype: 5 } // filter: checkerboard(down) - ✅ FIXED: was 10, PowerPoint uses "down" filter for "Up" direction
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'animEffect'] }
    },
    'circle': {
        presetId: 6,
        name: 'Circle',
        defaultDuration: 500,
        defaultDelay: 150,
        supportsDirection: true,
        supportsSequence: true,
        // NOTE: Effect has 2 sub-elements (visibility setter + motion/effects)
        templateGenerator: 'directional',
        directions: [
            { name: 'in', presetSubtype: 16 },
            { name: 'out', presetSubtype: 32 }
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'animEffect'] }
    },
    'crawl': {
        presetId: 7,
        name: 'Crawl In', // Frozen reference: "Crawl In" (entrance) / "Crawl Out" (exit)
        defaultDuration: 700,
        defaultDelay: 150,
        supportsDirection: true,
        supportsSequence: true,
        subAnimationCount: 3,
        // NOTE: Effect has 3 sub-elements (1 set + 2 anim for POSITION: ppt_x, ppt_y)
        templateGenerator: 'custom',
        customTemplate: 'buildCrawlAnimation',
        directions: [
            // Entrance directions (from*)
            { name: 'fromBottom', presetSubtype: 4 },
            { name: 'fromTop', presetSubtype: 1 },
            { name: 'fromLeft', presetSubtype: 8 },
            { name: 'fromRight', presetSubtype: 2 },
            // Exit directions (to*) - verified from frozen reference slide 6
            { name: 'toBottom', presetSubtype: 4 },
            { name: 'toTop', presetSubtype: 1 },
            { name: 'toLeft', presetSubtype: 8 },
            { name: 'toRight', presetSubtype: 2 }
        ]
    },
    'diamond': {
        presetId: 8,
        name: 'Diamond',
        defaultDuration: 500,
        defaultDelay: 150,
        supportsDirection: true,
        supportsSequence: true,
        // NOTE: Effect has 2 sub-elements (visibility setter + motion/effects)
        templateGenerator: 'directional',
        directions: [
            { name: 'in', presetSubtype: 16 },
            { name: 'out', presetSubtype: 32 }
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'animEffect'] }
    },
    'dissolve': {
        presetId: 9,
        name: 'Dissolve In',
        defaultDuration: 700,
        defaultDelay: 150, // ✅ CORRECTED: Frozen reference uses 150, not 0
        supportsSequence: true, // ✅ FIXED: Supports allAtOnce/byParagraph
        subAnimationCount: 2, // set + animEffect
        templateGenerator: 'custom',
        customTemplate: 'buildDissolveAnimation',
        metadata: { usesVisibility: true, elementOrder: ['set', 'animEffect'] }
    },
    'fade': {
        presetId: 10,
        name: 'Fade',
        defaultDuration: 500,
        defaultDelay: 150, // ✅ CORRECTED: Frozen reference uses 150, not 0
        supportsSequence: true,
        subAnimationCount: 2,
        templateGenerator: 'custom',
        customTemplate: 'buildFadeAnimation',
        // Element order depends on entrance vs exit (handled in builder):
        // - Entrance: set -> animEffect (make visible, then fade in)
        // - Exit: animEffect -> set (fade out, then hide)
        metadata: { usesVisibility: true }
    },
    'flashOnce': {
        presetId: 11,
        name: 'Flash Once',
        defaultDuration: 700,
        defaultDelay: 150, // ✅ CORRECTED: Frozen reference uses 150, not 0
        supportsSequence: true,
        templateGenerator: 'custom',
        customTemplate: 'buildFlashOnceAnimation',
        metadata: { usesVisibility: true, elementOrder: ['set'] }
    },
    'peek': {
        presetId: 12,
        name: 'Peek In', // Frozen reference: "Peek In" (entrance) / "Peek Out" (exit)
        defaultDuration: 500,
        defaultDelay: 150,
        supportsDirection: true,
        supportsSequence: true,
        subAnimationCount: 3,
        // NOTE: Effect has 3 sub-elements (1 set + 1 anim for position + 1 animEffect for wipe)
        templateGenerator: 'custom',
        customTemplate: 'buildPeekAnimation',
        directions: [
            // Entrance directions (from*)
            { name: 'fromBottom', presetSubtype: 4 },
            { name: 'fromTop', presetSubtype: 1 },
            { name: 'fromLeft', presetSubtype: 8 },
            { name: 'fromRight', presetSubtype: 2 },
            // Exit directions (to*) - use SAME presetSubtype as entrance (PowerPoint convention)
            { name: 'toBottom', presetSubtype: 4 }, // Same as fromBottom
            { name: 'toTop', presetSubtype: 1 }, // Same as fromTop
            { name: 'toLeft', presetSubtype: 8 }, // Same as fromLeft
            { name: 'toRight', presetSubtype: 2 } // Same as fromRight
        ]
    },
    'plus': {
        presetId: 13,
        name: 'Plus',
        defaultDuration: 500,
        defaultDelay: 150,
        supportsDirection: true,
        supportsSequence: true,
        templateGenerator: 'directional',
        directions: [
            { name: 'in', presetSubtype: 16 },
            { name: 'out', presetSubtype: 32 }
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'animEffect'] }
    },
    'randomEffects': {
        presetId: 24,
        name: 'Random Effects',
        defaultDuration: 700, // ✅ CORRECTED: Frozen reference batch3 slide6 shows delay=699 (duration-1=700-1)
        defaultDelay: 150, // ✅ CORRECTED: Frozen reference uses 150, not 0
        supportsSequence: true, // ✅ FIXED: Supports allAtOnce/byParagraph
        subAnimationCount: 2, // set + anim (dummy)
        templateGenerator: 'custom',
        customTemplate: 'buildRandomEffectsAnimation',
        metadata: { usesVisibility: true, elementOrder: ['set', 'anim'] }
    },
    'strips': {
        presetId: 18, // ✅ CORRECTED: Batch2 uses 18 (msoAnimEffectStrips), NOT 38 (Whip)
        name: 'Strips',
        defaultDuration: 700,
        defaultDelay: 150, // Batch2 reference uses 700ms
        supportsDirection: true,
        supportsSequence: true,
        subAnimationCount: 2, // Updated: set + animEffect (Batch2 Strips is simpler than Batch1)
        templateGenerator: 'custom',
        customTemplate: 'buildStripsAnimation',
        directions: [
            { name: 'topLeft', presetSubtype: 9 }, // filter: strips(upLeft)
            { name: 'topRight', presetSubtype: 3 }, // filter: strips(upRight)
            { name: 'bottomLeft', presetSubtype: 12 }, // filter: strips(downLeft)
            { name: 'bottomRight', presetSubtype: 6 } // filter: strips(downRight)
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'animEffect'] }
    },
    'randomBars': {
        presetId: 14,
        name: 'Random Bars',
        defaultDuration: 500,
        defaultDelay: 150,
        supportsDirection: true,
        supportsSequence: true,
        // NOTE: Effect has 2 sub-elements (visibility setter + motion/effects)
        templateGenerator: 'directional',
        directions: [
            { name: 'horizontal', presetSubtype: 10 }, // Fixed: was 5, should be 10
            { name: 'vertical', presetSubtype: 5 } // Fixed: was 10, should be 5
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'animEffect'] }
    },
    'wedge': {
        presetId: 20, // ✅ CORRECTED: Extracted from tmp_autonomous_test/Focused_EntranceExit_Showcase_WHEELFIX_v7.pptx slide 22
        name: 'Wedge',
        defaultDuration: 700,
        defaultDelay: 150,
        supportsSequence: true,
        templateGenerator: 'directional',
        directions: [
            { name: 'default', presetSubtype: 0 }
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'animEffect'] }
    },
    'swivel': {
        presetId: 19, // ✅ VERIFIED from Batch1 frozen reference slide11.xml (Basic Swivel)
        name: 'Basic Swivel', // Frozen reference: "Basic Swivel"
        defaultDuration: 700, // ✅ Verified from frozen reference
        defaultDelay: 150,
        supportsDirection: true,
        supportsSequence: true,
        subAnimationCount: 3, // 1 set + 2 anim for POSITION (ppt_x, ppt_y) with vertical oscillation
        templateGenerator: 'custom',
        customTemplate: 'buildSwivelAnimation',
        directions: [
            { name: 'horizontal', presetSubtype: 10 },
            { name: 'vertical', presetSubtype: 5 }
        ]
    },
    'wheel': {
        presetId: 21,
        name: 'Wheel',
        defaultDuration: 500,
        defaultDelay: 150,
        supportsSequence: true,
        // NOTE: Effect has 2 sub-elements (visibility setter + motion/effects)
        templateGenerator: 'directional', // Use directional to handle spokes
        supportsDirection: true,
        directions: [
            { name: '1', presetSubtype: 1 }, // 1 spoke
            { name: '2', presetSubtype: 2 }, // 2 spokes
            { name: '3', presetSubtype: 3 }, // 3 spokes
            { name: '4', presetSubtype: 4 }, // 4 spokes
            { name: '8', presetSubtype: 8 } // 8 spokes
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'animEffect'] }
    },
    'spiral': {
        presetId: 15, // Verified from Batch1 frozen reference
        name: 'Spiral In', // Frozen reference: "Spiral In" (entrance) / "Spiral Out" (exit)
        defaultDuration: 1000, // ✅ CORRECTED: Frozen reference uses 1000ms (was 500ms)
        defaultDelay: 0, // ✅ CORRECTED: Ref uses 0ms
        supportsSequence: true,
        subAnimationCount: 5, // set + 4 anim (ppt_w, ppt_h, ppt_x with formula, ppt_y with formula)
        templateGenerator: 'custom',
        customTemplate: 'buildSpiralAnimation' // Custom: 4 anim with strVal formulas and rotation formulas
    },
    'split': {
        presetId: 16, // Traditional Split effect
        name: 'Split',
        defaultDuration: 500,
        defaultDelay: 150, // Registry-driven default delay
        supportsDirection: true,
        supportsSequence: true,
        templateGenerator: 'directional',
        directions: [
            // NOTE: Mappings adjusted to match frozen reference order, not semantic correctness
            // Generator catalog uses @(HIn, HOut, VIn, VOut) but reference expects @(HOut, VOut, HIn, VIn)
            { name: 'horizontalIn', presetSubtype: 26 }, // Maps to catalog[0]=21->HIn, outputs 26
            { name: 'horizontalOut', presetSubtype: 42 }, // Maps to catalog[1]=26->HOut, outputs 42
            { name: 'verticalIn', presetSubtype: 21 }, // Maps to catalog[2]=37->VIn, outputs 21
            { name: 'verticalOut', presetSubtype: 37 } // Maps to catalog[3]=42->VOut, outputs 37
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'animEffect'] }
    },
    'pinwheel': {
        presetId: 35, // PowerPoint maps msoAnimEffectPinwheel -> presetID=35 in OOXML
        name: 'Pinwheel',
        defaultDuration: 700,
        defaultDelay: 150,
        supportsSequence: true,
        subAnimationCount: 5,
        templateGenerator: 'custom',
        customTemplate: 'buildPinwheelAnimation'
    },
    'swish': {
        presetId: 35, // msoAnimEffectSwish from CSV
        name: 'Swish',
        defaultDuration: 700,
        defaultDelay: 150, // ✅ CORRECTED: Frozen reference Batch1 slide24 uses 150ms
        supportsSequence: true,
        subAnimationCount: 5, // set + animEffect(fade) + anim(rotation) + anim(ppt_h) + anim(ppt_w)
        templateGenerator: 'custom',
        customTemplate: 'buildSwishAnimation'
    },
    'wipe': {
        presetId: 22,
        name: 'Wipe',
        defaultDuration: 500,
        defaultDelay: 150,
        supportsDirection: true,
        supportsSequence: true,
        subAnimationCount: 2,
        // NOTE: Effect has 2 sub-elements (1 set + 1 animEffect)
        templateGenerator: 'directional',
        directions: [
            // Entrance directions (from*)
            { name: 'fromBottom', presetSubtype: 4 },
            { name: 'fromTop', presetSubtype: 1 },
            { name: 'fromLeft', presetSubtype: 8 },
            { name: 'fromRight', presetSubtype: 2 },
            // Exit directions (to*) - same presetSubtypes
            { name: 'toBottom', presetSubtype: 4 },
            { name: 'toTop', presetSubtype: 1 },
            { name: 'toLeft', presetSubtype: 8 },
            { name: 'toRight', presetSubtype: 2 }
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'animEffect'] }
    },
    'zoom': {
        presetId: 23, // Verified from Batch1 frozen reference
        name: 'Basic Zoom', // Frozen reference: "Basic Zoom"
        defaultDuration: 700, // ✅ Verified from frozen reference slide25
        defaultDelay: 150,
        supportsDirection: true,
        supportsSequence: true,
        subAnimationCount: 3, // Variable: 3 (most), 4 (subtype 20), 5 (subtypes 36, 528, 544)
        templateGenerator: 'custom',
        customTemplate: 'buildZoomAnimation',
        directions: [
            { name: 'in', presetSubtype: 16 }, // Basic zoom in (DIR_IN=19 maps to subtype 16)
            { name: 'inSlightly', presetSubtype: 272 }, // DIR_IN_SLIGHTLY=29
            { name: 'objectCenter', presetSubtype: 528 }, // DIR_IN_CENTER=30 for entrance
            { name: 'inCenter', presetSubtype: 528 }, // Alias for objectCenter (generator uses this name)
            { name: 'out', presetSubtype: 32 }, // Basic zoom out (DIR_OUT=20)
            { name: 'outSlightly', presetSubtype: 288 }, // DIR_OUT_SLIGHTLY=32
            { name: 'outBottom', presetSubtype: 36 }, // DIR_OUT_BOTTOM=34 for entrance
            { name: 'inBottom', presetSubtype: 20 }, // DIR_IN_BOTTOM=31 for exit
            { name: 'slideCenter', presetSubtype: 544 }, // DIR_OUT_CENTER=33 for exit
            { name: 'outCenter', presetSubtype: 544 } // Alias for slideCenter (generator uses this name)
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'anim', 'anim'] }
    },
    // Additional entrance animations (23-58) - Generic template
    // NOTE: 'blinds' already defined above with correct presetId: 3, removed duplicate
    'boomerang': {
        presetId: 25, // Correct: Boomerang is presetId 25 per CSV (was incorrectly 23)
        name: 'Boomerang',
        defaultDuration: 700,
        defaultDelay: 150,
        supportsSequence: true,
        subAnimationCount: 9, // ✅ FIXED: 9 elements (1 set + 7 anim + 1 animEffect)
        templateGenerator: 'custom',
        customTemplate: 'buildBoomerangAnimation'
    },
    'bounce': {
        presetId: 26, // ✅ Verified from Batch3 frozen reference slide8.xml
        name: 'Bounce',
        defaultDuration: 700,
        defaultDelay: 150,
        supportsSequence: true,
        subAnimationCount: 15, // set + animEffect + 5 anim + 8 animScale
        templateGenerator: 'custom',
        customTemplate: 'buildBounceAnimation'
    },
    'colorReveal': {
        presetId: 27, // ✅ Verified from Batch3 frozen reference slide9.xml
        name: 'Color Reveal',
        defaultDuration: 700,
        defaultDelay: 150,
        supportsSequence: true,
        subAnimationCount: 4, // set(visibility) + anim(style.color) + anim(fillcolor) + set(fill.type)
        templateGenerator: 'custom',
        customTemplate: 'buildColorRevealAnimation'
    },
    'credits': {
        presetId: 28,
        name: 'Credits',
        defaultDelay: 150,
        supportsDirection: true,
        supportsSequence: true,
        subAnimationCount: 3,
        // NOTE: Effect has 3 sub-elements (1 set + 2 anim for POSITION: ppt_x, ppt_y)
        // NOTE: Credits animates position (scrolling), not size
        // NOTE: Reference uses presetSubtype 0 for all directions (not 1 or 4)
        templateGenerator: 'custom',
        customTemplate: 'buildCreditsAnimation',
        directions: [
            { name: 'fromTop', presetSubtype: 0 },
            { name: 'fromBottom', presetSubtype: 0 }
        ]
    },
    // REMOVED: Duplicate 'curve' entry (presetId 27 conflicts with colorReveal)
    // Use 'curveUp' (presetId 52) and 'curveDown' (presetId 52) instead
    'easeIn': {
        presetId: 29, // ✅ Verified from Batch3 frozen reference slide10.xml
        name: 'Ease In',
        defaultDuration: 700,
        defaultDelay: 150,
        supportsSequence: true,
        templateGenerator: 'custom',
        customTemplate: 'buildEaseInAnimation'
    },
    'thread': {
        presetId: 39, // Frozen reference slide 15: msoAnimEffectThread=36, presetID=39
        name: 'Thread',
        defaultDelay: 150,
        supportsSequence: true,
        templateGenerator: 'custom',
        customTemplate: 'buildThreadAnimation'
    },
    'float': {
        presetId: 30, // ✅ Float uses presetID=30 (manifest is correct, slide 13 IS Float)
        name: 'Float',
        defaultDuration: 560,
        defaultDelay: 150,
        supportsDirection: true,
        supportsSequence: true,
        subAnimationCount: 7, // set + animEffect + 5 anim (rotation, x, y, x phase2, y phase2)
        templateGenerator: 'custom',
        customTemplate: 'buildSplitAnimation', // Uses Split animation builder (structure matches)
        directions: [
            { name: 'fromTop', presetSubtype: 0 }, // Reference uses 0, not 1
            { name: 'fromBottom', presetSubtype: 0 } // Reference uses 0, not 4
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'animEffect', 'anim', 'anim', 'anim', 'anim', 'anim'] }
    },
    'lightspeed': {
        presetId: 34, // ✅ Verified from Batch2 frozen reference
        name: 'LightSpeed',
        defaultDuration: 700,
        defaultDelay: 150, // ✅ Verified: Frozen reference uses 150
        supportsDirection: true,
        supportsSequence: true,
        subAnimationCount: 5, // Entrance: 5 elements, Exit: 4 elements
        templateGenerator: 'custom',
        customTemplate: 'buildLightSpeedAnimation',
        directions: [
            { name: 'fromLeft', presetSubtype: 0 },
            { name: 'fromRight', presetSubtype: 0 }
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'anim', 'anim', 'animScale', 'anim'] }
    },
    'riseup': {
        presetId: 37, // Verified from Batch2 frozen reference
        name: 'Rise Up', // Frozen reference: "Rise Up" (entrance) / "Sink Down" (exit)
        defaultDuration: 700,
        defaultDelay: 150, // Total: 630 + 70 = 700ms
        supportsDirection: true,
        supportsSequence: true,
        subAnimationCount: 5, // set + animEffect + anim(x) + anim(y phase1) + anim(y phase2)
        templateGenerator: 'custom',
        customTemplate: 'buildRiseUpAnimation',
        directions: [
            { name: '(none)', presetSubtype: 0 },
            { name: 'fromBottom', presetSubtype: 0 },
            { name: 'fromTop', presetSubtype: 0 },
            { name: 'toBottom', presetSubtype: 0 },
            { name: 'toTop', presetSubtype: 0 }
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'animEffect', 'anim', 'anim', 'anim'] }
    },
    'floatIn': {
        effectId: 42, // msoAnimEffectAscend
        presetId: 42, // Verified from Batch2 frozen reference slide4.xml
        name: 'Float In', // Frozen reference: "Float In" (entrance)
        defaultDuration: 700,
        defaultDelay: 150,
        supportsDirection: true,
        supportsSequence: true,
        subAnimationCount: 4, // set + animEffect + anim(x) + anim(y)
        templateGenerator: 'custom',
        customTemplate: 'buildFloatInAnimation',
        directions: [
            { name: 'Float Up', presetSubtype: 0 },
            { name: 'Float Down', presetSubtype: 0 }
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'animEffect', 'anim', 'anim'] }
    },
    'floatOut': {
        effectId: 47, // msoAnimEffectDescend
        presetId: 47, // Verified from Batch2 frozen reference (slide4 exit)
        presetClass: 'exit', // ✅ CRITICAL: Prevents overwriting floatoutentrance (47_entr) in preset-id-map
        name: 'Float Out', // Frozen reference: "Float Out" (exit)
        defaultDuration: 700, // ✅ CORRECTED: Frozen reference shows 700ms
        defaultDelay: 150,
        supportsDirection: true,
        supportsSequence: true,
        subAnimationCount: 4, // set + animEffect + anim(x) + anim(y)
        templateGenerator: 'custom',
        customTemplate: 'buildFloatOutAnimation', // Exit version
        directions: [
            { name: 'Float Up', presetSubtype: 0 },
            { name: 'Float Down', presetSubtype: 0 }
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'animEffect', 'anim', 'anim'] }
    },
    // Batch2 variant: floatOut can also be used as entrance (presetID 47, but entrance behavior)
    'floatoutentrance': {
        effectId: 47, // msoAnimEffectDescend (but used for entrance)
        presetId: 47, // Same presetID
        presetClass: 'entr', // ✅ CRITICAL: Must register as 47_entr, not overwrite floatOut (47_exit)
        name: 'Float Out (Entrance)',
        defaultDuration: 700, // ✅ CORRECTED: Frozen reference shows 700ms
        defaultDelay: 150,
        supportsDirection: true,
        defaultDirection: 'Float Up', // Default when not specified
        supportsSequence: true,
        subAnimationCount: 4,
        templateGenerator: 'custom',
        customTemplate: 'buildDescendEntranceAnimation', // Entrance version
        directions: [
            { name: 'Float Up', presetSubtype: 0 },
            { name: 'Float Down', presetSubtype: 0 }
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'animEffect', 'anim', 'anim'] }
    },
    // Batch2 variant: floatIn can also be used as exit (presetID 42, but exit behavior)
    'floatinexit': {
        effectId: 42, // msoAnimEffectAscend (but used for exit)
        presetId: 42, // Same presetID
        presetClass: 'exit', // ✅ CRITICAL: Prevents overwriting floatIn (42_entr) in preset-id-map
        name: 'Float In (Exit)',
        defaultDuration: 700, // ✅ CORRECTED: Frozen reference shows 700ms (same as entrance)
        defaultDelay: 150,
        supportsDirection: true,
        defaultDirection: 'Float Down', // Default when not specified
        supportsSequence: true,
        subAnimationCount: 4,
        templateGenerator: 'custom',
        customTemplate: 'buildAscendExitAnimation', // Exit version
        directions: [
            { name: 'Float Up', presetSubtype: 0 },
            { name: 'Float Down', presetSubtype: 0 }
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'animEffect', 'anim', 'anim'] }
    },
    'curveUp': {
        presetId: 52, // Verified from Batch2 frozen reference
        name: 'Curve Up', // Frozen reference: "Curve Up" (entrance)
        defaultDuration: 700,
        defaultDelay: 150,
        supportsDirection: true,
        supportsSequence: true,
        subAnimationCount: 4, // set + animScale + animMotion + animEffect
        templateGenerator: 'custom',
        customTemplate: 'buildCurveUpAnimation',
        directions: [
            { name: '(none)', presetSubtype: 0 },
            { name: 'fromTop', presetSubtype: 0 },
            { name: 'fromBottom', presetSubtype: 0 },
            { name: 'toTop', presetSubtype: 0 },
            { name: 'toBottom', presetSubtype: 0 }
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'animScale', 'animMotion', 'animEffect'] }
    },
    'curveDown': {
        presetId: 52, // Same as curveUp - exit version
        presetClass: 'exit', // ✅ CRITICAL: Prevents overwriting curveUp (52_entr) in preset-id-map
        name: 'Curve Down', // Frozen reference: "Curve Down" (exit)
        defaultDuration: 700,
        defaultDelay: 150,
        supportsDirection: true,
        supportsSequence: true,
        subAnimationCount: 4, // set + animScale + animMotion + animEffect
        templateGenerator: 'custom',
        customTemplate: 'buildCurveDownAnimation',
        directions: [
            { name: '(none)', presetSubtype: 0 },
            { name: 'fromTop', presetSubtype: 0 },
            { name: 'fromBottom', presetSubtype: 0 },
            { name: 'toTop', presetSubtype: 0 },
            { name: 'toBottom', presetSubtype: 0 }
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'animScale', 'animMotion', 'animEffect'] }
    },
    'glide': {
        presetId: 54, // ✅ CORRECTED: Batch2 frozen reference (was incorrectly 29)
        name: 'Glide',
        defaultDuration: 700,
        defaultDelay: 150, // Registry-driven default delay
        supportsDirection: true,
        supportsSequence: true,
        templateGenerator: 'custom',
        customTemplate: 'buildGlideAnimation',
        directions: [
            { name: 'fromLeft', presetSubtype: 0 },
            { name: 'fromRight', presetSubtype: 0 }
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'anim', 'anim', 'anim', 'anim', 'animEffect'] }
    },
    'spinner': {
        presetId: 49, // ✅ Verified from Batch2 frozen reference
        name: 'Spinner',
        defaultDuration: 500,
        defaultDelay: 150, // Registry-driven default delay
        supportsDirection: true,
        supportsSequence: true,
        subAnimationCount: 5, // set + 3 anim (ppt_w, ppt_h, style.rotation) + animEffect
        templateGenerator: 'custom',
        customTemplate: 'buildSpinnerAnimation',
        directions: [
            { name: 'fromLeft', presetSubtype: 0 },
            { name: 'fromRight', presetSubtype: 0 }
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'anim', 'anim', 'anim', 'animEffect'] }
    },
    // 'magnify': REMOVED - Not in msoAnimEffect CSV (invalid/unsupported effect), was colliding with zip's presetId 51
    'shimmer': {
        presetId: 36, // ✅ Verified from Batch3 frozen reference slide15.xml
        presetClass: 'emph', // ✅ CRITICAL: Prevents collision with turnright (presetId=36, path)
        name: 'Shimmer',
        defaultDuration: 350,
        defaultDelay: 150,
        supportsSequence: true,
        templateGenerator: 'custom',
        customTemplate: 'buildShimmerAnimation'
    },
    'thinLine': {
        presetId: 39, // ✅ Verified from Batch3 frozen reference slide11.xml
        name: 'Thin Line',
        defaultDuration: 700,
        defaultDelay: 150, // Registry-driven default delay
        supportsSequence: true,
        subAnimationCount: 5, // set + 4 anim (ppt_h, ppt_w, ppt_x, ppt_y)
        templateGenerator: 'custom',
        customTemplate: 'buildThinLineAnimation',
        metadata: { usesVisibility: true, elementOrder: ['set', 'anim', 'anim', 'anim', 'anim'] }
    },
    'whip': {
        presetId: 41, // ✅ CORRECTED: Verified from slide16.xml (was correct)
        name: 'Whip',
        defaultDuration: 700, // ✅ Verified from frozen reference
        defaultDelay: 150, // ✅ ADDED: Missing default delay
        supportsDirection: true,
        supportsSequence: true,
        subAnimationCount: 6,
        templateGenerator: 'custom',
        customTemplate: 'buildWhipAnimation',
        directions: [
            { name: 'fromLeft', presetSubtype: 0 }, // ✅ Reference uses 0 for all directions
            { name: 'fromRight', presetSubtype: 0 } // ✅ Reference uses 0 for all directions
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'anim', 'anim', 'anim', 'anim', 'animEffect'] }
    },
    'fadedSwivel': {
        presetId: 45, // ✅ Verified from Batch3 frozen reference slide12.xml
        name: 'Faded Swivel',
        defaultDuration: 700,
        defaultDelay: 150,
        supportsSequence: true,
        templateGenerator: 'custom',
        customTemplate: 'buildFadedSwivelAnimation'
    },
    'sling': {
        presetId: 48, // ✅ Verified from Batch3 frozen reference slide13.xml
        name: 'Sling',
        defaultDuration: 700,
        defaultDelay: 150,
        supportsSequence: true,
        subAnimationCount: 5, // set + 3 anim (rotation, ppt_x, ppt_y) + animEffect
        templateGenerator: 'custom',
        customTemplate: 'buildSlingAnimation'
    },
    'fadedZoom': {
        presetId: 53, // ✅ Verified from Batch3 frozen reference slide1.xml and slide14.xml
        name: 'Faded Zoom',
        defaultDuration: 700,
        defaultDelay: 150, // ✅ Reference uses 700ms (was 500)
        supportsDirection: true,
        supportsSequence: true,
        // NO subAnimationCount - builder generates variable count (4 or 6) internally based on presetSubtype
        // NO sequenceTargetBackgroundOnly - allAtOnce mode DOES animate individual paragraphs (txEl targets)
        templateGenerator: 'custom',
        customTemplate: 'buildFadedZoomAnimation',
        directions: [
            { name: 'in', presetSubtype: 16 }, // Basic in (asOneObject/byParagraph) - 4 elements
            { name: 'inCenter', presetSubtype: 528 }, // DIR_IN_CENTER=30 (allAtOnce) - 6 elements
            { name: 'out', presetSubtype: 32 }, // Basic out (asOneObject/byParagraph) - 4 elements
            { name: 'outCenter', presetSubtype: 544 } // DIR_OUT_CENTER=33 (allAtOnce) - 6 elements
        ],
        metadata: { usesVisibility: true, elementOrder: ['set', 'anim', 'anim', 'anim', 'anim', 'animEffect'] }
    },
    'zip': {
        presetId: 51, // ✅ ADDED: Extracted from tmp_autonomous_test/Focused_EntranceExit_Showcase_WHEELFIX_v7.pptx slide 17
        name: 'Zip', // Note: PowerPoint UI displays this as "Magnify"
        defaultDuration: 700, // Total: 269 + 430 = 699ms, rounded to 700
        defaultDelay: 150,
        supportsSequence: true,
        subAnimationCount: 8, // set + animEffect + 3 animScale + 2 set + 2 anim
        templateGenerator: 'custom',
        customTemplate: 'buildZipAnimation'
    },
    'flip': {
        presetId: 56,
        name: 'Flip',
        defaultDuration: 700, // ✅ Verified from Batch1 frozen reference slide18.xml
        defaultDelay: 150,
        supportsSequence: true,
        subAnimationCount: 5,
        templateGenerator: 'custom',
        customTemplate: 'buildFlipAnimation'
    },
    'fold': {
        presetId: 58, // ✅ Verified from Batch3 frozen reference slide16.xml
        name: 'Fold',
        supportsSequence: true,
        defaultDuration: 700,
        defaultDelay: 150,
        subAnimationCount: 6,
        templateGenerator: 'custom',
        customTemplate: 'buildFoldAnimation'
    },
    'drop': {
        presetId: 38, // ✅ Verified from Batch6 frozen reference slide2.xml
        name: 'Drop',
        defaultDuration: 700,
        defaultDelay: 150, // Entrance: 2 set + 4 anim (bounce), Exit: 2 anim + 1 set
        supportsSequence: true,
        subAnimationCount: 6, // Entrance: 6 elements, Exit: 3 elements
        templateGenerator: 'custom',
        customTemplate: 'buildDropAnimation',
        // Note: Uses <p:iterate type="lt"> for letter-by-letter animation
        metadata: {
            usesVisibility: true,
            elementOrder: ['set', 'set', 'anim', 'anim', 'anim', 'anim'] // Entrance order
        }
    },
    // ========================================================================
    // ENTRANCE/EXIT ANIMATIONS CONTINUED
    // (Unified catalog: type:'entrance' vs type:'exit' selects behavior)
    // ========================================================================
    'stretch': {
        presetId: 17,
        name: 'Stretch',
        defaultDuration: 500,
        defaultDelay: 150,
        supportsDirection: true,
        supportsSequence: true,
        subAnimationCount: 5,
        // NOTE: Effect has 5 sub-elements (1 set + 4 anim) for directional variants, 3 sub-elements (1 set + 2 anim) for across
        templateGenerator: 'custom',
        customTemplate: 'buildStretchAnimation',
        directions: [
            // Entrance directions (from*)
            { name: 'fromBottom', presetSubtype: 4 },
            { name: 'fromTop', presetSubtype: 1 },
            { name: 'fromLeft', presetSubtype: 8 },
            { name: 'fromRight', presetSubtype: 2 },
            { name: 'across', presetSubtype: 10 }, // Horizontal stretch (same for entrance and exit)
            // Exit directions (to*) - same presetSubtypes as entrance
            { name: 'toBottom', presetSubtype: 4 },
            { name: 'toTop', presetSubtype: 1 },
            { name: 'toLeft', presetSubtype: 8 },
            { name: 'toRight', presetSubtype: 2 }
        ]
    },
    'expand': {
        presetId: 55,
        name: 'Expand', // Frozen reference: "Expand" (entrance) / "Contract" (exit)
        defaultDuration: 500,
        defaultDelay: 150,
        supportsSequence: true,
        subAnimationCount: 4,
        // NOTE: Effect has 4 sub-elements (1 set + 2 anim + 1 animEffect)
        // Formulas: entrance uses #ppt_w*0.70→#ppt_w, exit uses ppt_w→ppt_w*0.70
        templateGenerator: 'custom',
        customTemplate: 'buildExpandAnimation'
    },
    'stretchy': {
        presetId: 50, // Stretchy/Compress uses 50 in reference
        name: 'Stretchy',
        defaultDuration: 500,
        defaultDelay: 150,
        supportsSequence: true,
        subAnimationCount: 4,
        // NOTE: Effect has 4 sub-elements (1 set + 2 anim + 1 animEffect)
        templateGenerator: 'custom',
        customTemplate: 'buildStretchyAnimation'
    },
    'centerrevolve': {
        presetId: 43, // Verified from Batch2 frozen reference
        name: 'CenterRevolve', // Frozen reference: "CenterRevolve" (no space)
        defaultDuration: 700, // ✅ CORRECTED: Frozen reference batch2 slide8 shows 700ms total
        defaultDelay: 150,
        supportsSequence: true, // ✅ FIXED: Let engine handle sequence mode wrapping
        subAnimationCount: 6, // set + animEffect + 4 anim
        templateGenerator: 'custom',
        customTemplate: 'buildCenterRevolveAnimation',
        metadata: { usesVisibility: true, elementOrder: ['set', 'animEffect', 'anim', 'anim', 'anim', 'anim'] }
    },
    'growandturn': {
        presetId: 31, // Verified from Batch2 frozen reference
        name: 'Grow and Turn', // Frozen reference: "Grow and Turn" (entrance) / "Shrink and Turn" (exit)
        defaultDuration: 500,
        defaultDelay: 150, // Registry-driven default delay
        supportsSequence: true,
        subAnimationCount: 5, // set + 3 anim (ppt_w, ppt_h, rotation) + animEffect
        templateGenerator: 'custom',
        customTemplate: 'buildGrowAndTurnAnimation',
        metadata: { usesVisibility: true, elementOrder: ['set', 'anim', 'anim', 'anim', 'animEffect'] }
    },
    'unfold': {
        presetId: 40, // Reference deck uses 40 for Unfold (not 37!)
        name: 'Unfold',
        defaultDuration: 700,
        defaultDelay: 150,
        supportsSequence: true,
        subAnimationCount: 4,
        // NOTE: Effect has 4 sub-elements (1 set + 1 animEffect + 2 anim)
        // Element order flips for exit (builder handles this automatically)
        templateGenerator: 'custom',
        customTemplate: 'buildUnfoldAnimation',
        metadata: {
            usesVisibility: true,
            elementOrder: ['set', 'animEffect', 'anim', 'anim'] // Entrance order (exit reverses)
        }
    },
    // ========================================================================
    // EMPHASIS ANIMATIONS (29) - Batch 4
    // ========================================================================
    // Batch 4 Emphasis Effects (IDs 1-34) - Verified from Focused_Emphasis_Showcase_BATCH4_BASE.pptx
    'changefillcolor': {
        presetId: 1,
        presetClass: 'emph',
        name: 'ChangeFillColor',
        category: 'emphasis',
        defaultDuration: 1000,
        defaultDelay: 0,
        supportsSequence: false, // Emphasis animations don't use sequence mode wrapping
        subAnimationCount: 3, // animClr + 2 set
        templateGenerator: 'custom',
        customTemplate: 'buildChangeFillColorAnimation'
    },
    'changefont': {
        presetId: 2,
        presetClass: 'emph',
        name: 'Change Font',
        category: 'emphasis',
        defaultDuration: 1000,
        defaultDelay: 0,
        supportsSequence: true,
        requiresParagraphTargeting: true, // Text-based effect: always uses <p:txEl> targeting in allAtOnce/byParagraph
        subAnimationCount: 1,
        templateGenerator: 'custom',
        customTemplate: 'buildChangeFontAnimation'
    },
    'changefontcolor': {
        presetId: 3,
        presetClass: 'emph',
        name: 'ChangeFontColor',
        category: 'emphasis',
        defaultDuration: 1000,
        defaultDelay: 0,
        supportsSequence: true,
        requiresParagraphTargeting: true, // Text-based effect: always uses <p:txEl> targeting in allAtOnce/byParagraph
        subAnimationCount: 1,
        templateGenerator: 'custom',
        customTemplate: 'buildChangeFontColorAnimation'
    },
    'changefontsize': {
        presetId: 4,
        presetClass: 'emph',
        name: 'ChangeFontSize',
        category: 'emphasis',
        defaultDuration: 1000,
        defaultDelay: 0,
        supportsSequence: true,
        requiresParagraphTargeting: true, // Text-based effect: always uses <p:txEl> targeting in allAtOnce/byParagraph
        subAnimationCount: 1,
        templateGenerator: 'custom',
        customTemplate: 'buildChangeFontSizeAnimation'
    },
    'changefontstyle': {
        presetId: 5,
        presetClass: 'emph',
        name: 'ChangeFontStyle',
        category: 'emphasis',
        defaultDuration: 750,
        defaultDelay: 0, // Reference uses 750ms
        supportsSequence: true, // Supports asOneObject, allAtOnce, byParagraph
        supportsDirection: true, // 3 style variants
        requiresParagraphTargeting: true, // Text-based effect: always uses <p:txEl> targeting in allAtOnce/byParagraph
        templateGenerator: 'custom',
        customTemplate: 'buildChangeFontStyleAnimation',
        subAnimationCount: 3, // 3 set elements
        directions: [
            { name: 'Bold', presetSubtype: 0 },
            { name: 'Italic', presetSubtype: 3 },
            { name: 'Underline', presetSubtype: 5 }
        ]
    },
    'growshrink': {
        presetId: 6, presetClass: 'emph', name: 'GrowShrink', category: 'emphasis', defaultDuration: 2000,
        defaultDelay: 0, supportsSequence: true, templateGenerator: 'custom', customTemplate: 'buildGrowShrinkAnimation'
    },
    'changelinecolor': {
        presetId: 7, presetClass: 'emph', name: 'ChangeLineColor', category: 'emphasis', defaultDuration: 1000,
        defaultDelay: 0, supportsSequence: false, templateGenerator: 'custom', customTemplate: 'buildChangeLineColorAnimation'
    },
    'spin': {
        presetId: 8,
        presetClass: 'emph',
        name: 'Spin',
        category: 'emphasis',
        defaultDuration: 2000,
        defaultDelay: 0, // ✅ FIXED: Frozen reference uses 2000ms
        supportsSequence: true, // ✅ FIXED: Supports asOneObject, allAtOnce, byParagraph
        subAnimationCount: 1, // 1 animRot element
        templateGenerator: 'custom',
        customTemplate: 'buildSpinAnimation'
    },
    'transparency': {
        presetId: 9, presetClass: 'emph', name: 'Transparency', category: 'emphasis', defaultDuration: 1000,
        defaultDelay: 0, supportsSequence: true, subAnimationCount: 2, templateGenerator: 'custom', customTemplate: 'buildTransparencyAnimation'
    },
    'boldflash': {
        presetId: 10,
        presetClass: 'emph',
        name: 'BoldFlash',
        category: 'emphasis',
        defaultDuration: 1000,
        defaultDelay: 0, // Reference uses 1000ms
        supportsSequence: true,
        requiresParagraphTargeting: true, // Text-based effect: always uses <p:txEl> targeting in allAtOnce/byParagraph
        subAnimationCount: 1, // 1 anim element with discrete string keyframes
        templateGenerator: 'custom',
        customTemplate: 'buildBoldFlashAnimation'
    },
    'blast': {
        presetId: 14, presetClass: 'emph', name: 'Blast', category: 'emphasis', defaultDuration: 700,
        defaultDelay: 0, supportsSequence: true, subAnimationCount: 7, templateGenerator: 'custom', customTemplate: 'buildBlastAnimation'
    },
    'boldreveal': {
        presetId: 15, presetClass: 'emph', name: 'BoldReveal', category: 'emphasis', defaultDuration: 1000,
        defaultDelay: 0, supportsSequence: true, requiresParagraphTargeting: true, subAnimationCount: 1, templateGenerator: 'custom', customTemplate: 'buildBoldRevealAnimation'
    },
    'brushcolor': {
        presetId: 16, presetClass: 'emph', name: 'BrushColor', category: 'emphasis', defaultDuration: 500,
        defaultDelay: 0, supportsSequence: true, subAnimationCount: 3, templateGenerator: 'custom', customTemplate: 'buildBrushColorAnimation'
    },
    'brushonunderline': {
        presetId: 18, presetClass: 'emph', name: 'BrushOnUnderline', category: 'emphasis', defaultDuration: 1000,
        defaultDelay: 0, supportsSequence: true, requiresParagraphTargeting: true, templateGenerator: 'custom', customTemplate: 'buildBrushOnUnderlineAnimation'
    },
    'underline': {
        presetId: 18, presetClass: 'emph', name: 'Underline', category: 'emphasis', defaultDuration: 1000,
        defaultDelay: 0, supportsSequence: true, requiresParagraphTargeting: true, templateGenerator: 'custom', customTemplate: 'buildBrushOnUnderlineAnimation'
    },
    'colorblend': {
        presetId: 19, presetClass: 'emph', name: 'ColorBlend', category: 'emphasis', defaultDuration: 500,
        defaultDelay: 0, supportsSequence: true, templateGenerator: 'emphasis'
    },
    'objectcolor': {
        presetId: 19,
        presetClass: 'emph',
        name: 'Object Color',
        category: 'emphasis',
        defaultDuration: 500,
        defaultDelay: 0, // ✅ FIXED: Frozen reference uses 500ms
        supportsSequence: true,
        subAnimationCount: 4, // 2 animClr + 2 set
        templateGenerator: 'custom',
        customTemplate: 'buildObjectColorAnimation'
    },
    'colorwave': {
        presetId: 20, presetClass: 'emph', name: 'ColorWave', category: 'emphasis', defaultDuration: 500,
        defaultDelay: 0, supportsSequence: true, templateGenerator: 'custom', customTemplate: 'buildColorEmphasisAnimation'
    },
    'complementarycolor': {
        presetId: 21, presetClass: 'emph', name: 'ComplementaryColor', category: 'emphasis', defaultDuration: 500,
        defaultDelay: 0, supportsSequence: true, templateGenerator: 'custom', customTemplate: 'buildColorEmphasisAnimation'
    },
    'complementarycolor2': {
        presetId: 22, presetClass: 'emph', name: 'ComplementaryColor2', category: 'emphasis', defaultDuration: 500,
        defaultDelay: 0, supportsSequence: true, templateGenerator: 'custom', customTemplate: 'buildColorEmphasisAnimation'
    },
    'contrastingcolor': {
        presetId: 23, presetClass: 'emph', name: 'ContrastingColor', category: 'emphasis', defaultDuration: 500,
        defaultDelay: 0, supportsSequence: true, templateGenerator: 'custom', customTemplate: 'buildColorEmphasisAnimation'
    },
    'darken': {
        presetId: 24, presetClass: 'emph', name: 'Darken', category: 'emphasis', defaultDuration: 500,
        defaultDelay: 0, supportsSequence: true, templateGenerator: 'custom', customTemplate: 'buildColorEmphasisAnimation'
    },
    'desaturate': {
        presetId: 25, presetClass: 'emph', name: 'Desaturate', category: 'emphasis', defaultDuration: 500,
        defaultDelay: 0, supportsSequence: true, templateGenerator: 'custom', customTemplate: 'buildColorEmphasisAnimation'
    },
    'pulse': {
        presetId: 26, presetClass: 'emph', name: 'Pulse', category: 'emphasis', defaultDuration: 250,
        defaultDelay: 0, supportsSequence: true, templateGenerator: 'custom', customTemplate: 'buildColorEmphasisAnimation'
    },
    'flicker': {
        presetId: 27,
        presetClass: 'emph',
        name: 'Flicker',
        category: 'emphasis',
        defaultDuration: 250,
        defaultDelay: 0, // ✅ FIXED: Frozen reference uses 250ms
        supportsSequence: true,
        subAnimationCount: 4, // 2 animClr + 2 set
        templateGenerator: 'custom',
        customTemplate: 'buildFlickerAnimation' // ✅ FIXED: Use dedicated Flicker builder
    },
    'growwithcolor': {
        presetId: 28, presetClass: 'emph', name: 'GrowWithColor', category: 'emphasis', defaultDuration: 1000,
        defaultDelay: 0, supportsSequence: true, requiresParagraphTargeting: true, subAnimationCount: 4, templateGenerator: 'custom', customTemplate: 'buildGrowWithColorAnimation'
    },
    'lighten': {
        presetId: 30, presetClass: 'emph', name: 'Lighten', category: 'emphasis', defaultDuration: 500,
        defaultDelay: 0, supportsSequence: true, subAnimationCount: 4, templateGenerator: 'custom', customTemplate: 'buildLightenAnimation'
    },
    'styleemphasis': {
        presetId: 31, presetClass: 'emph', name: 'StyleEmphasis', category: 'emphasis', defaultDuration: 1000,
        defaultDelay: 0, supportsSequence: true, requiresParagraphTargeting: true, subAnimationCount: 4, templateGenerator: 'custom', customTemplate: 'buildStyleEmphasisAnimation'
    },
    'teeter': {
        presetId: 32, presetClass: 'emph', name: 'Teeter', category: 'emphasis', defaultDuration: 700,
        defaultDelay: 0, supportsSequence: true, subAnimationCount: 5, templateGenerator: 'custom', customTemplate: 'buildTeeterAnimation'
    },
    'verticalgrow': {
        presetId: 33, presetClass: 'emph', name: 'VerticalGrow', category: 'emphasis', defaultDuration: 500,
        defaultDelay: 0, supportsSequence: true, subAnimationCount: 5, templateGenerator: 'custom', customTemplate: 'buildVerticalGrowAnimation'
    },
    'wave': {
        presetId: 34, presetClass: 'emph', name: 'Wave', category: 'emphasis', defaultDuration: 125,
        defaultDelay: 0, supportsSequence: true, subAnimationCount: 5, templateGenerator: 'custom', customTemplate: 'buildWaveAnimation'
    },
    // ========================================================================
    // MOTION PATH ANIMATIONS (64) - Using path template
    // ========================================================================
    // ============================================================================
    // ============================================================================
    // MEDIA ANIMATIONS (3) - Media control commands
    // These trigger media playback controls (play, pause, stop)
    // ============================================================================
    'mediaplay': {
        presetId: 1,
        presetClass: 'mediacall',
        name: 'MediaPlay',
        category: 'media',
        defaultDuration: 5000,
        defaultDelay: 0,
        supportsSequence: false,
        templateGenerator: 'media',
        mediaCommand: 'playFrom(0.0)',
        // Media animations always use clickEffect, even with withPrevious trigger
        nodeTypeMapping: {
            onClick: 'clickEffect',
            withPrevious: 'clickEffect', // ← OVERRIDE: media uses clickEffect
            afterPrevious: 'afterEffect'
        }
    },
    'mediapause': {
        presetId: 2,
        presetClass: 'mediacall',
        name: 'MediaPause',
        category: 'media',
        defaultDuration: 1,
        defaultDelay: 0,
        supportsSequence: false,
        templateGenerator: 'media',
        mediaCommand: 'togglePause',
        // Media animations always use clickEffect, even with withPrevious trigger
        nodeTypeMapping: {
            onClick: 'clickEffect',
            withPrevious: 'clickEffect', // ← OVERRIDE: media uses clickEffect
            afterPrevious: 'afterEffect'
        }
    },
    'mediastop': {
        presetId: 3,
        presetClass: 'mediacall',
        name: 'MediaStop',
        category: 'media',
        defaultDuration: 1,
        defaultDelay: 0,
        supportsSequence: false,
        templateGenerator: 'media',
        mediaCommand: 'stop',
        // Media animations always use clickEffect, even with withPrevious trigger
        nodeTypeMapping: {
            onClick: 'clickEffect',
            withPrevious: 'clickEffect', // ← OVERRIDE: media uses clickEffect
            afterPrevious: 'afterEffect'
        }
    },
    // Media animation aliases for more natural API
    'play': {
        presetId: 1,
        presetClass: 'mediacall',
        name: 'Play',
        category: 'media',
        defaultDuration: 1,
        defaultDelay: 0,
        supportsSequence: false,
        templateGenerator: 'media',
        mediaCommand: 'playFrom(0.0)',
        // Media animations always use clickEffect, even with withPrevious trigger
        nodeTypeMapping: {
            onClick: 'clickEffect',
            withPrevious: 'clickEffect', // ← OVERRIDE: media uses clickEffect
            afterPrevious: 'afterEffect'
        }
    },
    'pause': {
        presetId: 2,
        presetClass: 'mediacall',
        name: 'Pause',
        category: 'media',
        defaultDuration: 1,
        defaultDelay: 0,
        supportsSequence: false,
        templateGenerator: 'media',
        mediaCommand: 'togglePause',
        // Media animations always use clickEffect, even with withPrevious trigger
        nodeTypeMapping: {
            onClick: 'clickEffect',
            withPrevious: 'clickEffect', // ← OVERRIDE: media uses clickEffect
            afterPrevious: 'afterEffect'
        }
    },
    'togglepause': {
        presetId: 2,
        presetClass: 'mediacall',
        name: 'TogglePause',
        category: 'media',
        defaultDuration: 1,
        defaultDelay: 0,
        supportsSequence: false,
        templateGenerator: 'media',
        mediaCommand: 'togglePause',
        // Media animations always use clickEffect, even with withPrevious trigger
        nodeTypeMapping: {
            onClick: 'clickEffect',
            withPrevious: 'clickEffect', // ← OVERRIDE: media uses clickEffect
            afterPrevious: 'afterEffect'
        }
    },
    'stop': {
        presetId: 3,
        presetClass: 'mediacall',
        name: 'Stop',
        category: 'media',
        defaultDuration: 1,
        defaultDelay: 0,
        supportsSequence: false,
        templateGenerator: 'media',
        mediaCommand: 'stop',
        // Media animations always use clickEffect, even with withPrevious trigger
        nodeTypeMapping: {
            onClick: 'clickEffect',
            withPrevious: 'clickEffect', // ← OVERRIDE: media uses clickEffect
            afterPrevious: 'afterEffect'
        }
    },
    // ============================================================================
    // MOTION PATH ANIMATIONS (64) - Batch 5
    // Each motion path has a unique presetId (1-64)
    // Keys use no hyphens - normalization removes them during lookup
    // ============================================================================
    'circlepath': { presetId: 1, presetClass: 'path', name: 'Circle', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0.069 0 0.125 0.056 0.125 0.125 C 0.125 0.194 0.069 0.25 0 0.25 C -0.069 0.25 -0.125 0.194 -0.125 0.125 C -0.125 0.056 -0.069 0 0 0 Z' },
    'righttriangle': { presetId: 2, presetClass: 'path', name: 'RightTriangle', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0 -0.147 L 0.25 0 L 0 0 Z' },
    'diamondpath': { presetId: 3, presetClass: 'path', name: 'Diamond', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.125 -0.084 L 0.25 0 L 0.125 0.084 L 0 0 Z' },
    'hexagon': { presetId: 4, presetClass: 'path', name: 'Hexagon', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.125 0 L 0.188 0.109 L 0.125 0.217 L 0 0.217 L -0.063 0.109 L 0 0 Z' },
    '5pointstar': { presetId: 5, presetClass: 'path', name: '5PointStar', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.029 0.091 L 0.125 0.091 L 0.048 0.147 L 0.077 0.238 L 0 0.182 L -0.077 0.238 L -0.048 0.147 L -0.125 0.091 L -0.029 0.091 L 0 0 Z' },
    'crescentmoon': { presetId: 6, presetClass: 'path', name: 'CrescentMoon', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C -0.014 -0.005 -0.029 -0.009 -0.044 -0.009 C -0.114 -0.009 -0.169 0.048 -0.169 0.117 C -0.169 0.185 -0.114 0.241 -0.044 0.241 C -0.029 0.241 -0.014 0.238 0 0.233 C -0.047 0.215 -0.08 0.17 -0.08 0.117 C -0.08 0.063 -0.047 0.018 0 0 Z' },
    'squarepath': { presetId: 7, presetClass: 'path', name: 'Square', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.25 0 L 0.25 0.25 L 0 0.25 L 0 0 Z' },
    'trapezoid': { presetId: 8, presetClass: 'path', name: 'Trapezoid', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.167 0 L 0.21 0.167 L -0.04 0.167 L 0 0 Z' },
    'heart': { presetId: 9, presetClass: 'path', name: 'Heart', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0.012 -0.018 0.033 -0.044 0.058 -0.044 C 0.095 -0.044 0.125 -0.017 0.125 0.017 C 0.125 0.028 0.122 0.038 0.116 0.047 C 0.117 0.047 0 0.182 0 0.183 C 0 0.182 -0.117 0.047 -0.116 0.047 C -0.122 0.038 -0.125 0.028 -0.125 0.017 C -0.125 -0.017 -0.095 -0.044 -0.057 -0.044 C -0.033 -0.044 -0.012 -0.018 0 0 Z' },
    'octagon': { presetId: 10, presetClass: 'path', name: 'Octagon', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.073 -0.073 L 0.177 -0.073 L 0.25 0 L 0.25 0.104 L 0.177 0.177 L 0.073 0.177 L 0 0.104 L 0 0 Z' },
    '6pointstar': { presetId: 11, presetClass: 'path', name: '6PointStar', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.036 0.062 L 0.108 0.062 L 0.072 0.125 L 0.108 0.187 L 0.036 0.187 L 0 0.25 L -0.036 0.187 L -0.108 0.187 L -0.072 0.125 L -0.108 0.062 L -0.036 0.062 L 0 0 Z' },
    'football': { presetId: 12, presetClass: 'path', name: 'Football', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0.03 -0.038 0.075 -0.062 0.125 -0.062 C 0.175 -0.062 0.22 -0.038 0.25 0 C 0.22 0.038 0.175 0.062 0.125 0.062 C 0.075 0.062 0.03 0.038 0 0 Z' },
    'equaltriangle': { presetId: 13, presetClass: 'path', name: 'EqualTriangle', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.125 0.216 L -0.125 0.216 L 0 0 Z' },
    'parallelogram': { presetId: 14, presetClass: 'path', name: 'Parallelogram', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.178 0 L 0.25 0.121 L 0.072 0.121 L 0 0 Z' },
    'pentagon': { presetId: 15, presetClass: 'path', name: 'Pentagon', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.125 0.091 L 0.077 0.238 L -0.077 0.238 L -0.125 0.091 L 0 0 Z' },
    '4pointstar': { presetId: 16, presetClass: 'path', name: '4PointStar', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.091 -0.034 L 0.125 -0.125 L 0.158 -0.034 L 0.249 0 L 0.158 0.034 L 0.125 0.125 L 0.091 0.034 L 0 0 Z' },
    '8pointstar': { presetId: 17, presetClass: 'path', name: '8PointStar', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.052 0 L 0.089 -0.037 L 0.125 0 L 0.177 0 L 0.177 0.052 L 0.213 0.089 L 0.177 0.125 L 0.177 0.177 L 0.125 0.177 L 0.089 0.213 L 0.052 0.177 L 0 0.177 L 0 0.125 L -0.037 0.089 L 0 0.052 L 0 0 Z' },
    'teardrop': { presetId: 18, presetClass: 'path', name: 'Teardrop', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0.001 0.034 0.011 0.065 0.028 0.085 C 0.028 0.086 0.055 0.113 0.055 0.112 C 0.07 0.127 0.079 0.148 0.079 0.17 C 0.079 0.214 0.044 0.249 0 0.25 C -0.044 0.249 -0.079 0.214 -0.079 0.17 C -0.079 0.148 -0.07 0.127 -0.055 0.112 C -0.055 0.113 -0.028 0.086 -0.028 0.085 C -0.011 0.065 -0.001 0.034 0 0 Z' },
    'pointystar': { presetId: 19, presetClass: 'path', name: 'PointyStar', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0.069 0 0.124 -0.056 0.124 -0.125 C 0.124 -0.056 0.179 -0.001 0.248 -0.001 C 0.179 -0.001 0.125 0.056 0.125 0.125 C 0.125 0.056 0.069 0 0 0 Z' },
    'curvedsquare': { presetId: 20, presetClass: 'path', name: 'CurvedSquare', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0 -0.032 0.026 -0.058 0.058 -0.058 L 0.192 -0.058 C 0.224 -0.058 0.25 -0.032 0.25 0 L 0.25 0.132 C 0.25 0.164 0.224 0.191 0.192 0.191 L 0.058 0.191 C 0.026 0.191 0 0.164 0 0.132 Z' },
    'curvedx': { presetId: 21, presetClass: 'path', name: 'CurvedX', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0.006 0.006 0.011 0.011 0.015 0.017 C 0.02 0.011 0.024 0.006 0.03 0 C 0.065 -0.035 0.107 -0.05 0.124 -0.034 C 0.14 -0.017 0.125 0.025 0.09 0.06 C 0.084 0.065 0.079 0.07 0.073 0.075 C 0.079 0.079 0.084 0.084 0.09 0.09 C 0.125 0.125 0.14 0.167 0.124 0.183 C 0.107 0.2 0.065 0.185 0.03 0.15 C 0.024 0.144 0.02 0.139 0.015 0.133 C 0.011 0.139 0.006 0.144 0 0.15 C -0.035 0.185 -0.077 0.2 -0.094 0.183 C -0.11 0.167 -0.095 0.125 -0.06 0.09 C -0.054 0.084 -0.049 0.079 -0.043 0.075 C -0.049 0.07 -0.054 0.065 -0.06 0.06 C -0.095 0.025 -0.11 -0.017 -0.094 -0.034 C -0.077 -0.05 -0.035 -0.035 0 0 Z' },
    'verticalfigure8': { presetId: 22, presetClass: 'path', name: 'VerticalFigure8', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0.033 0 0.06 0.027 0.06 0.06 C 0.06 0.099 0.03 0.113 0.012 0.119 L -0.012 0.125 C -0.03 0.131 -0.06 0.146 -0.06 0.19 C -0.06 0.218 -0.033 0.25 0 0.25 C 0.033 0.25 0.06 0.218 0.06 0.19 C 0.06 0.146 0.03 0.131 0.012 0.125 L -0.012 0.119 C -0.03 0.113 -0.06 0.099 -0.06 0.06 C -0.06 0.027 -0.033 0 0 0 Z' },
    'curvystar': { presetId: 23, presetClass: 'path', name: 'CurvyStar', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0.072 0.058 0.1 0.152 0.077 0.238 C -0.015 0.233 -0.093 0.173 -0.125 0.091 C -0.047 0.04 0.051 0.043 0.125 0.091 C 0.092 0.178 0.011 0.233 -0.077 0.238 C -0.101 0.148 -0.068 0.056 0 0 Z' },
    'loopdeloop': { presetId: 24, presetClass: 'path', name: 'LoopdeLoop', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0.023 0.001 0.042 0.009 0.052 0.021 L 0.075 0.049 C 0.08 0.055 0.088 0.058 0.098 0.058 C 0.112 0.058 0.124 0.05 0.125 0.038 C 0.124 0.028 0.112 0.019 0.098 0.019 C 0.088 0.019 0.08 0.023 0.075 0.028 L 0.052 0.056 C 0.042 0.068 0.023 0.076 0 0.077 C -0.023 0.076 -0.042 0.068 -0.052 0.056 L -0.075 0.028 C -0.08 0.023 -0.088 0.019 -0.098 0.019 C -0.112 0.019 -0.124 0.028 -0.125 0.038 C -0.124 0.05 -0.112 0.058 -0.098 0.058 C -0.088 0.058 -0.08 0.055 -0.075 0.049 L -0.052 0.021 C -0.042 0.009 -0.023 0.001 0 0 Z' },
    'buzzsaw': { presetId: 25, presetClass: 'path', name: 'Buzzsaw', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C -0.022 -0.017 -0.033 -0.046 -0.027 -0.075 C -0.024 -0.085 -0.02 -0.095 -0.014 -0.103 C -0.01 -0.08 0.004 -0.059 0.025 -0.046 C 0.025 -0.074 0.041 -0.101 0.068 -0.113 C 0.077 -0.118 0.087 -0.12 0.097 -0.121 C 0.082 -0.104 0.074 -0.08 0.077 -0.055 C 0.099 -0.073 0.13 -0.077 0.157 -0.064 C 0.166 -0.06 0.175 -0.053 0.181 -0.046 C 0.158 -0.048 0.134 -0.039 0.117 -0.021 C 0.144 -0.015 0.167 0.006 0.174 0.035 C 0.176 0.045 0.176 0.055 0.174 0.065 C 0.161 0.046 0.139 0.033 0.115 0.031 C 0.127 0.056 0.124 0.087 0.106 0.11 C 0.099 0.118 0.091 0.125 0.082 0.129 C 0.089 0.107 0.085 0.082 0.072 0.062 C 0.06 0.087 0.034 0.104 0.004 0.104 C -0.007 0.104 -0.017 0.102 -0.026 0.098 C -0.004 0.09 0.013 0.071 0.021 0.048 C -0.007 0.054 -0.036 0.045 -0.055 0.022 C -0.062 0.013 -0.066 0.004 -0.069 -0.006 C -0.049 0.007 -0.023 0.009 0 0 Z' },
    'horizontalfigure8': { presetId: 26, presetClass: 'path', name: 'HorizontalFigure8', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0 0.033 0.027 0.06 0.06 0.06 C 0.099 0.06 0.113 0.03 0.119 0.012 L 0.125 -0.012 C 0.131 -0.03 0.146 -0.06 0.19 -0.06 C 0.218 -0.06 0.25 -0.033 0.25 0 C 0.25 0.033 0.218 0.06 0.19 0.06 C 0.146 0.06 0.131 0.03 0.125 0.012 L 0.119 -0.012 C 0.113 -0.03 0.099 -0.06 0.06 -0.06 C 0.027 -0.06 0 -0.033 0 0 Z' },
    'peanut': { presetId: 27, presetClass: 'path', name: 'Peanut', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0.038 0 0.069 0.031 0.069 0.069 C 0.069 0.094 0.056 0.116 0.037 0.129 C 0.037 0.129 0.036 0.129 0.036 0.129 C 0.029 0.134 0.025 0.142 0.025 0.151 C 0.025 0.159 0.029 0.166 0.034 0.171 C 0.042 0.179 0.047 0.191 0.047 0.203 C 0.047 0.229 0.026 0.25 0 0.25 C -0.026 0.25 -0.047 0.229 -0.047 0.203 C -0.047 0.191 -0.042 0.179 -0.034 0.171 C -0.029 0.166 -0.026 0.159 -0.026 0.151 C -0.026 0.142 -0.03 0.134 -0.036 0.129 C -0.036 0.129 -0.037 0.129 -0.037 0.129 C -0.057 0.116 -0.07 0.094 -0.07 0.069 C -0.07 0.031 -0.039 0 0 0 C 0 0 0 0 0 0 Z' },
    'figure8four': { presetId: 28, presetClass: 'path', name: 'Figure8Four', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0.017 0 0.031 0.014 0.031 0.031 C 0.031 0.049 0.017 0.063 0 0.063 C -0.017 0.063 -0.031 0.077 -0.031 0.094 C -0.031 0.111 -0.017 0.125 0 0.125 C 0.017 0.125 0.031 0.139 0.031 0.156 C 0.031 0.173 0.017 0.187 0 0.187 C -0.017 0.187 -0.031 0.201 -0.031 0.219 C -0.031 0.236 -0.017 0.25 0 0.25 C 0.017 0.25 0.031 0.236 0.031 0.219 C 0.031 0.201 0.017 0.187 0 0.187 C -0.017 0.187 -0.031 0.173 -0.031 0.156 C -0.031 0.139 -0.017 0.125 0 0.125 C 0.017 0.125 0.031 0.111 0.031 0.094 C 0.031 0.077 0.017 0.063 0 0.063 C -0.017 0.063 -0.031 0.049 -0.031 0.031 C -0.031 0.014 -0.017 0 0 0 Z' },
    'neutron': { presetId: 29, presetClass: 'path', name: 'Neutron', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0.007 -0.01 0.014 -0.021 0.021 -0.035 C 0.04 -0.075 0.045 -0.114 0.031 -0.12 C 0.017 -0.127 -0.01 -0.099 -0.029 -0.059 C -0.039 -0.038 -0.045 -0.018 -0.047 -0.003 C -0.05 0.009 -0.051 0.021 -0.051 0.035 C -0.051 0.08 -0.038 0.117 -0.023 0.117 C -0.008 0.117 0.005 0.08 0.005 0.035 C 0.005 0.014 0.002 -0.006 -0.003 -0.02 C -0.005 -0.032 -0.01 -0.045 -0.016 -0.058 C -0.036 -0.099 -0.063 -0.127 -0.077 -0.12 C -0.091 -0.113 -0.086 -0.075 -0.066 -0.034 C -0.058 -0.015 -0.047 0.001 -0.036 0.012 C -0.028 0.022 -0.019 0.031 -0.007 0.04 C 0.029 0.069 0.065 0.082 0.075 0.07 C 0.084 0.058 0.064 0.025 0.028 -0.003 C 0.013 -0.015 -0.003 -0.024 -0.016 -0.03 C -0.028 -0.036 -0.043 -0.041 -0.059 -0.044 C -0.103 -0.054 -0.141 -0.051 -0.144 -0.035 C -0.148 -0.02 -0.115 0 -0.071 0.01 C -0.051 0.014 -0.032 0.016 -0.017 0.015 C -0.004 0.015 0.01 0.013 0.025 0.01 C 0.069 0 0.102 -0.021 0.098 -0.036 C 0.095 -0.051 0.057 -0.055 0.013 -0.045 C -0.008 -0.04 -0.027 -0.033 -0.04 -0.025 C -0.051 -0.019 -0.062 -0.012 -0.074 -0.003 C -0.109 0.026 -0.13 0.058 -0.12 0.07 C -0.111 0.082 -0.074 0.069 -0.039 0.041 C -0.022 0.027 -0.008 0.013 0 0 Z' },
    'swoosh': { presetId: 30, presetClass: 'path', name: 'Swoosh', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0 0 0.017 -0.065 0.017 -0.065 C 0.034 -0.118 0.061 -0.139 0.1 -0.139 C 0.12 -0.139 0.138 -0.131 0.152 -0.118 C 0.162 -0.109 0.174 -0.104 0.187 -0.104 C 0.212 -0.104 0.233 -0.122 0.241 -0.148 C 0.241 -0.148 0.25 -0.179 0.25 -0.179 C 0.25 -0.179 0.232 -0.113 0.232 -0.113 C 0.215 -0.061 0.188 -0.04 0.15 -0.04 C 0.13 -0.04 0.111 -0.048 0.096 -0.062 C 0.087 -0.07 0.075 -0.075 0.063 -0.075 C 0.038 -0.075 0.017 -0.057 0.009 -0.031 C 0.009 -0.031 0 0 0 0 Z' },
    'bean': { presetId: 31, presetClass: 'path', name: 'Bean', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0.002 -0.003 0.012 -0.034 0.037 -0.032 C 0.075 -0.029 0.09 -0.007 0.125 -0.029 C 0.147 -0.042 0.173 -0.075 0.192 -0.074 C 0.235 -0.073 0.244 -0.039 0.244 -0.008 C 0.245 0.036 0.189 0.073 0.121 0.077 C 0.052 0.08 -0.005 0.033 0 0 Z' },
    'pluspath': { presetId: 32, presetClass: 'path', name: 'Plus', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C -0.118 -0.118 0.132 -0.118 0.011 0 C 0.132 -0.118 0.132 0.132 0.011 0.011 C 0.132 0.132 -0.118 0.132 0 0.011 C -0.118 0.132 -0.118 -0.118 0 0 Z' },
    'invertedtriangle': { presetId: 33, presetClass: 'path', name: 'InvertedTriangle', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0.015 0.024 0.037 0.049 0.055 0.059 C 0.082 0.075 0.108 0.081 0.113 0.073 C 0.117 0.065 0.099 0.045 0.072 0.029 C 0.054 0.019 0.021 0.012 -0.008 0.011 C -0.036 0.012 -0.07 0.019 -0.088 0.029 C -0.115 0.045 -0.133 0.065 -0.128 0.073 C -0.123 0.081 -0.097 0.075 -0.071 0.059 C -0.053 0.049 -0.03 0.024 -0.016 0 C -0.001 -0.025 0.009 -0.058 0.009 -0.079 C 0.009 -0.111 0.002 -0.136 -0.008 -0.136 C -0.017 -0.136 -0.025 -0.111 -0.025 -0.079 C -0.025 -0.058 -0.014 -0.025 0 0 Z' },
    'invertedsquare': { presetId: 34, presetClass: 'path', name: 'InvertedSquare', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0.004 -0.004 0.01 -0.006 0.015 -0.006 C 0.022 -0.006 0.029 -0.003 0.033 0.002 C 0.05 0.022 0.063 0.066 0.063 0.118 C 0.063 0.118 0.063 0.119 0.063 0.119 C 0.063 0.119 0.063 0.12 0.063 0.12 C 0.063 0.172 0.05 0.217 0.033 0.237 C 0.029 0.241 0.022 0.244 0.015 0.244 C 0.01 0.244 0.004 0.242 0 0.238 C -0.004 0.234 -0.006 0.229 -0.006 0.223 C -0.006 0.216 -0.003 0.21 0.002 0.206 C 0.022 0.188 0.066 0.175 0.118 0.175 C 0.118 0.175 0.119 0.175 0.119 0.175 C 0.119 0.175 0.12 0.175 0.12 0.175 C 0.172 0.175 0.217 0.188 0.237 0.206 C 0.241 0.21 0.244 0.216 0.244 0.223 C 0.244 0.229 0.242 0.234 0.238 0.238 C 0.234 0.242 0.229 0.244 0.223 0.244 C 0.216 0.244 0.21 0.241 0.206 0.237 C 0.188 0.217 0.175 0.172 0.175 0.12 C 0.175 0.12 0.175 0.119 0.175 0.119 C 0.175 0.119 0.175 0.118 0.175 0.118 C 0.175 0.066 0.188 0.022 0.206 0.001 C 0.21 -0.003 0.216 -0.006 0.223 -0.006 C 0.229 -0.006 0.234 -0.004 0.238 0 C 0.242 0.004 0.244 0.01 0.244 0.015 C 0.244 0.022 0.241 0.028 0.237 0.033 C 0.217 0.05 0.172 0.063 0.12 0.063 C 0.12 0.063 0.12 0.063 0.119 0.063 C 0.119 0.063 0.118 0.063 0.118 0.063 C 0.066 0.063 0.022 0.05 0.002 0.033 C -0.003 0.028 -0.006 0.022 -0.006 0.015 C -0.006 0.01 -0.004 0.004 0 0 Z' },
    'left': { presetId: 35, presetClass: 'path', name: 'Left', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L -0.25 0 E' },
    'turnright': { presetId: 36, presetClass: 'path', name: 'TurnRight', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0 0.125 C 0 0.181 0.069 0.25 0.125 0.25 L 0.25 0.25 E' },
    'arcdown': { presetId: 37, presetClass: 'path', name: 'ArcDown', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.067 0.04 C 0.081 0.049 0.102 0.054 0.124 0.054 C 0.149 0.054 0.169 0.049 0.183 0.04 L 0.25 0 E' },
    'zigzag': { presetId: 38, presetClass: 'path', name: 'Zigzag', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.016 0.099 L 0.031 0 L 0.047 0.099 L 0.063 0 L 0.078 0.099 L 0.094 0 L 0.109 0.099 L 0.125 0 L 0.141 0.099 L 0.156 0 L 0.172 0.099 L 0.187 0 L 0.203 0.099 L 0.219 0 L 0.234 0.099 L 0.25 0 E' },
    'scurve2': { presetId: 39, presetClass: 'path', name: 'SCurve2', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0 0.035 0.028 0.062 0.062 0.062 C 0.097 0.062 0.125 0.035 0.125 0 C 0.125 -0.035 0.153 -0.062 0.188 -0.062 C 0.222 -0.062 0.25 -0.035 0.25 0 E' },
    'sinewave': { presetId: 40, presetClass: 'path', name: 'SineWave', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0.003 -0.019 0.007 -0.037 0.015 -0.037 C 0.024 -0.037 0.027 -0.019 0.03 0 C 0.034 0.021 0.037 0.042 0.047 0.042 C 0.056 0.042 0.059 0.021 0.063 0 C 0.065 -0.019 0.069 -0.037 0.078 -0.037 C 0.086 -0.037 0.09 -0.019 0.093 0 C 0.096 0.021 0.1 0.042 0.109 0.042 C 0.118 0.042 0.125 0 0.125 0 C 0.128 -0.019 0.131 -0.037 0.14 -0.037 C 0.149 -0.037 0.152 -0.019 0.155 0 C 0.159 0.021 0.162 0.042 0.172 0.042 C 0.181 0.042 0.184 0.021 0.187 0 C 0.191 -0.019 0.194 -0.037 0.203 -0.037 C 0.211 -0.037 0.215 -0.019 0.218 0 C 0.221 0.021 0.225 0.042 0.234 0.042 C 0.243 0.042 0.246 0.021 0.25 0 E' },
    'bounceleft': { presetId: 41, presetClass: 'path', name: 'BounceLeft', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 c -0.004 -0.008 -0.018 -0.016 -0.023 -0.016 c -0.031 0 -0.063 0.125 -0.063 0.25 c 0 -0.063 -0.016 -0.125 -0.031 -0.125 c -0.016 0 -0.031 0.063 -0.031 0.125 c 0 -0.031 -0.008 -0.063 -0.016 -0.063 c -0.008 0 -0.016 0.031 -0.016 0.063 c 0 -0.016 -0.004 -0.031 -0.008 -0.031 c -0.004 0 -0.008 0.016 -0.008 0.031 c 0 -0.008 -0.002 -0.016 -0.004 -0.016 c -0.001 0 -0.004 0.008 -0.004 0.016 c 0 -0.004 -0.001 -0.008 -0.002 -0.008 c 0 -0.001 -0.002 0.004 -0.002 0.008 c 0 -0.002 0 -0.004 -0.001 -0.004 c 0 0.001 -0.001 0.002 -0.001 0.004 c 0 -0.001 0 -0.002 0 -0.003 c -0.001 0 -0.001 0.001 -0.001 0.002 c -0.001 0 -0.001 -0.001 -0.001 -0.002 c -0.001 0 -0.001 0.001 -0.001 0.002 E' },
    'down': { presetId: 42, presetClass: 'path', name: 'Down', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0 0.25 E' },
    'turnup': { presetId: 43, presetClass: 'path', name: 'TurnUp', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.125 0 C 0.181 0 0.25 -0.069 0.25 -0.125 L 0.25 -0.25 E' },
    'arcup': { presetId: 44, presetClass: 'path', name: 'ArcUp', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.067 -0.04 C 0.081 -0.049 0.102 -0.054 0.124 -0.054 C 0.149 -0.054 0.169 -0.049 0.183 -0.04 L 0.25 0 E' },
    'heartbeat': { presetId: 45, presetClass: 'path', name: 'Heartbeat', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.017 0 C 0.025 0 0.034 -0.014 0.042 -0.016 C 0.048 -0.016 0.059 -0.003 0.064 -0.003 C 0.071 -0.003 0.078 -0.007 0.091 -0.007 L 0.1 -0.162 L 0.11 0.025 L 0.122 0 L 0.132 -0.007 L 0.156 -0.001 C 0.167 -0.004 0.176 -0.017 0.187 -0.022 C 0.191 -0.023 0.2 -0.024 0.206 -0.022 C 0.212 -0.02 0.217 -0.006 0.219 -0.005 C 0.222 -0.001 0.229 -0.005 0.233 -0.003 L 0.239 0 L 0.25 0 E' },
    'spiralright': { presetId: 46, presetClass: 'path', name: 'SpiralRight', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C -0.004 -0.067 0.046 -0.125 0.113 -0.129 C 0.177 -0.134 0.237 -0.089 0.241 -0.024 C 0.246 0.036 0.204 0.092 0.144 0.096 C 0.089 0.099 0.037 0.062 0.033 0.006 C 0.029 -0.045 0.064 -0.093 0.115 -0.097 C 0.162 -0.1 0.206 -0.069 0.209 -0.022 C 0.212 0.02 0.184 0.061 0.142 0.063 C 0.104 0.066 0.068 0.042 0.065 0.004 C 0.063 -0.03 0.084 -0.063 0.117 -0.065 C 0.146 -0.067 0.175 -0.049 0.177 -0.02 C 0.179 0.005 0.164 0.029 0.14 0.031 C 0.12 0.033 0.099 0.022 0.098 0.002 C 0.096 -0.014 0.104 -0.031 0.119 -0.033 C 0.131 -0.033 0.143 -0.029 0.145 -0.018 C 0.146 -0.011 0.144 -0.004 0.138 -0.001 C 0.135 0 0.133 0 0.13 -0.001 E' },
    'wavepath': { presetId: 47, presetClass: 'path', name: 'Wave', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0.002 0.063 0.009 0.108 0.016 0.108 C 0.023 0.108 0.029 0.063 0.031 0 C 0.034 0.063 0.04 0.108 0.047 0.108 C 0.054 0.108 0.06 0.063 0.062 0 C 0.065 0.063 0.071 0.108 0.078 0.108 C 0.085 0.108 0.092 0.063 0.094 0 C 0.096 0.063 0.102 0.108 0.11 0.108 C 0.116 0.108 0.123 0.063 0.125 0 C 0.127 0.063 0.134 0.108 0.141 0.108 C 0.148 0.108 0.154 0.063 0.156 0 C 0.159 0.063 0.165 0.108 0.172 0.108 C 0.179 0.108 0.185 0.063 0.188 0 C 0.19 0.063 0.196 0.108 0.203 0.108 C 0.21 0.108 0.217 0.063 0.219 0 C 0.221 0.063 0.227 0.108 0.235 0.108 C 0.242 0.108 0.248 0.063 0.25 0 E' },
    'curvyleft': { presetId: 48, presetClass: 'path', name: 'CurvyLeft', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0.008 0.008 0.017 0.016 0.021 0.026 C 0.025 0.037 0.027 0.05 0.029 0.063 C 0.031 0.076 0.029 0.087 0.027 0.099 C 0.025 0.11 0.022 0.122 0.015 0.132 C 0.009 0.142 -0.001 0.15 -0.012 0.156 C -0.022 0.162 -0.034 0.166 -0.046 0.168 C -0.058 0.17 -0.07 0.17 -0.081 0.168 C -0.093 0.166 -0.104 0.161 -0.113 0.153 C -0.122 0.146 -0.13 0.137 -0.134 0.126 C -0.139 0.116 -0.141 0.102 -0.141 0.091 C -0.142 0.08 -0.141 0.067 -0.136 0.056 C -0.131 0.046 -0.122 0.038 -0.11 0.034 C -0.098 0.031 -0.086 0.035 -0.078 0.042 C -0.071 0.049 -0.066 0.06 -0.065 0.073 C -0.065 0.086 -0.066 0.098 -0.071 0.108 C -0.076 0.118 -0.075 0.12 -0.095 0.133 C -0.113 0.147 -0.131 0.143 -0.142 0.144 C -0.153 0.144 -0.162 0.14 -0.173 0.136 C -0.185 0.131 -0.195 0.122 -0.202 0.114 C -0.209 0.106 -0.212 0.096 -0.216 0.08 C -0.219 0.064 -0.219 0.056 -0.219 0.044 C -0.219 0.032 -0.219 0.02 -0.219 0.008 E' },
    'diagonaldownright': { presetId: 49, presetClass: 'path', name: 'DiagonalDownRight', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.25 0.25 E' },
    'turndown': { presetId: 50, presetClass: 'path', name: 'TurnDown', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.125 0 C 0.181 0 0.25 0.069 0.25 0.125 L 0.25 0.25 E' },
    'arcleft': { presetId: 51, presetClass: 'path', name: 'ArcLeft', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L -0.04 0.067 C -0.049 0.081 -0.054 0.102 -0.054 0.124 C -0.054 0.149 -0.049 0.169 -0.04 0.183 L 0 0.25 E' },
    'funnel': { presetId: 52, presetClass: 'path', name: 'Funnel', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C -0.001 0.025 0.06 0.047 0.137 0.048 C 0.198 0.05 0.248 0.038 0.249 0.023 C 0.249 0.008 0.2 -0.006 0.138 -0.007 C 0.107 -0.007 0.079 -0.005 0.059 0 C 0.03 0.007 0.013 0.018 0.013 0.031 C 0.013 0.038 0.018 0.045 0.027 0.051 C 0.048 0.064 0.089 0.073 0.136 0.074 C 0.191 0.076 0.236 0.065 0.236 0.052 C 0.237 0.038 0.192 0.026 0.137 0.024 C 0.109 0.024 0.084 0.026 0.065 0.03 C 0.04 0.037 0.024 0.048 0.024 0.059 C 0.024 0.065 0.029 0.071 0.037 0.077 C 0.056 0.088 0.092 0.097 0.135 0.098 C 0.185 0.099 0.225 0.089 0.225 0.077 C 0.226 0.065 0.186 0.054 0.136 0.053 C 0.111 0.052 0.088 0.054 0.071 0.058 C 0.048 0.064 0.035 0.073 0.035 0.084 C 0.035 0.089 0.039 0.095 0.046 0.1 C 0.063 0.11 0.096 0.118 0.134 0.119 C 0.179 0.119 0.215 0.111 0.215 0.1 C 0.215 0.089 0.18 0.079 0.135 0.078 C 0.113 0.078 0.092 0.08 0.077 0.083 C 0.056 0.088 0.044 0.097 0.043 0.106 C 0.043 0.111 0.048 0.116 0.054 0.12 C 0.069 0.13 0.099 0.137 0.133 0.137 C 0.173 0.138 0.206 0.131 0.206 0.121 C 0.207 0.111 0.174 0.102 0.134 0.101 C 0.114 0.101 0.095 0.102 0.082 0.106 C 0.063 0.11 0.052 0.118 0.052 0.126 C 0.052 0.131 0.055 0.135 0.061 0.139 C 0.075 0.148 0.101 0.154 0.132 0.155 C 0.169 0.155 0.198 0.149 0.198 0.14 C 0.199 0.131 0.17 0.123 0.133 0.122 C 0.115 0.122 0.099 0.123 0.087 0.126 C 0.07 0.13 0.06 0.137 0.06 0.145 C 0.06 0.149 0.063 0.152 0.068 0.156 C 0.08 0.164 0.104 0.169 0.132 0.17 C 0.165 0.171 0.191 0.165 0.191 0.156 C 0.191 0.149 0.166 0.141 0.133 0.141 C 0.116 0.14 0.101 0.142 0.09 0.144 C 0.075 0.148 0.066 0.154 0.066 0.161 C 0.066 0.165 0.069 0.168 0.074 0.171 C 0.085 0.178 0.107 0.183 0.131 0.184 C 0.161 0.185 0.185 0.179 0.185 0.172 C 0.185 0.164 0.161 0.158 0.132 0.157 C 0.118 0.157 0.104 0.158 0.094 0.161 C 0.08 0.164 0.072 0.169 0.072 0.176 C 0.072 0.179 0.075 0.182 0.079 0.185 C 0.089 0.191 0.108 0.196 0.131 0.196 C 0.157 0.197 0.179 0.192 0.179 0.185 C 0.179 0.179 0.158 0.173 0.131 0.173 C 0.119 0.172 0.106 0.173 0.097 0.175 C 0.085 0.179 0.078 0.184 0.078 0.189 C 0.078 0.192 0.08 0.195 0.084 0.197 C 0.093 0.203 0.11 0.207 0.131 0.208 C 0.155 0.208 0.174 0.203 0.174 0.198 C 0.174 0.192 0.155 0.186 0.131 0.186 C 0.119 0.186 0.108 0.187 0.101 0.189 C 0.089 0.191 0.083 0.196 0.083 0.201 C 0.083 0.203 0.085 0.206 0.088 0.208 C 0.096 0.214 0.112 0.217 0.13 0.218 C 0.152 0.218 0.169 0.214 0.169 0.209 C 0.169 0.203 0.152 0.199 0.131 0.198 C 0.12 0.198 0.11 0.199 0.103 0.201 C 0.093 0.203 0.087 0.207 0.087 0.212 C 0.087 0.214 0.089 0.216 0.092 0.218 E' },
    'spring': { presetId: 53, presetClass: 'path', name: 'Spring', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C -0.066 0.006 -0.115 0.021 -0.115 0.033 C -0.115 0.044 -0.067 0.052 -0.003 0.052 C 0.061 0.052 0.115 0.044 0.115 0.033 C 0.115 0.021 0.059 0.018 -0.005 0.026 C -0.068 0.035 -0.115 0.05 -0.115 0.061 C -0.115 0.072 -0.066 0.081 -0.003 0.081 C 0.061 0.081 0.115 0.072 0.115 0.061 C 0.115 0.05 0.059 0.047 -0.004 0.055 C -0.068 0.063 -0.115 0.078 -0.115 0.089 C -0.115 0.101 -0.066 0.11 -0.002 0.11 C 0.061 0.11 0.115 0.101 0.115 0.089 C 0.115 0.079 0.059 0.076 -0.004 0.083 C -0.067 0.091 -0.115 0.107 -0.115 0.118 C -0.115 0.129 -0.065 0.138 -0.002 0.138 C 0.063 0.138 0.115 0.129 0.115 0.118 C 0.115 0.107 0.06 0.104 -0.003 0.112 C -0.066 0.12 -0.115 0.135 -0.115 0.146 C -0.115 0.158 -0.065 0.166 -0.001 0.166 C 0.063 0.166 0.115 0.157 0.115 0.146 C 0.115 0.135 0.06 0.132 -0.003 0.14 C -0.066 0.148 -0.115 0.164 -0.115 0.174 C -0.115 0.185 -0.064 0.194 -0.001 0.194 C 0.063 0.194 0.115 0.185 0.115 0.174 C 0.115 0.164 0.061 0.161 -0.003 0.168 C -0.066 0.176 -0.115 0.192 -0.115 0.203 C -0.115 0.213 -0.064 0.223 0 0.223 C 0.064 0.223 0.115 0.214 0.115 0.203 C 0.115 0.192 0.061 0.189 -0.002 0.197 C -0.065 0.205 -0.116 0.22 -0.115 0.231 C -0.114 0.242 -0.064 0.25 0 0.25 C 0.064 0.25 0.115 0.241 0.115 0.23 C 0.115 0.22 0.063 0.217 0 0.226 E' },
    'bounceright': { presetId: 54, presetClass: 'path', name: 'BounceRight', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 c 0.004 -0.008 0.018 -0.016 0.023 -0.016 c 0.031 0 0.063 0.125 0.063 0.25 c 0 -0.063 0.016 -0.125 0.031 -0.125 c 0.016 0 0.031 0.063 0.031 0.125 c 0 -0.031 0.008 -0.063 0.016 -0.063 c 0.008 0 0.016 0.031 0.016 0.063 c 0 -0.016 0.004 -0.031 0.008 -0.031 c 0.004 0 0.008 0.016 0.008 0.031 c 0 -0.008 0.002 -0.016 0.004 -0.016 c 0.001 0 0.004 0.008 0.004 0.016 c 0 -0.004 0.001 -0.008 0.002 -0.008 c 0 0.001 0.002 0.004 0.002 0.008 c 0 -0.002 0 -0.004 0.001 -0.004 c 0 0.001 0.001 0.002 0.001 0.004 c 0 -0.001 0 -0.002 0 -0.003 c 0.001 0 0.001 0.001 0.001 0.002 c 0.001 0 0.001 -0.001 0.001 -0.002 c 0.001 0 0.001 0.001 0.001 0.002 E' },
    'spiralleft': { presetId: 55, presetClass: 'path', name: 'SpiralLeft', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0.004 -0.067 -0.046 -0.125 -0.113 -0.129 C -0.177 -0.134 -0.237 -0.089 -0.241 -0.024 C -0.246 0.036 -0.204 0.092 -0.144 0.096 C -0.089 0.099 -0.037 0.062 -0.033 0.006 C -0.029 -0.045 -0.064 -0.093 -0.115 -0.097 C -0.162 -0.1 -0.206 -0.069 -0.209 -0.022 C -0.212 0.02 -0.184 0.061 -0.142 0.063 C -0.104 0.066 -0.068 0.042 -0.065 0.004 C -0.063 -0.03 -0.084 -0.063 -0.117 -0.065 C -0.146 -0.067 -0.175 -0.049 -0.177 -0.02 C -0.179 0.005 -0.164 0.029 -0.14 0.031 C -0.12 0.033 -0.099 0.022 -0.098 0.002 C -0.096 -0.014 -0.104 -0.031 -0.119 -0.033 C -0.131 -0.033 -0.143 -0.029 -0.145 -0.018 C -0.146 -0.011 -0.144 -0.004 -0.138 -0.001 C -0.135 0 -0.133 0 -0.13 -0.001 E' },
    'diagonalupright': { presetId: 56, presetClass: 'path', name: 'DiagonalUpRight', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.25 -0.25 E' },
    'turnupright': { presetId: 57, presetClass: 'path', name: 'TurnUpRight', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0 -0.125 C 0 -0.181 0.069 -0.25 0.125 -0.25 L 0.25 -0.25 E' },
    'arcright': { presetId: 58, presetClass: 'path', name: 'ArcRight', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.04 0.067 C 0.049 0.081 0.054 0.102 0.054 0.124 C 0.054 0.149 0.049 0.169 0.04 0.183 L 0 0.25 E' },
    'scurve1': { presetId: 59, presetClass: 'path', name: 'SCurve1', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0 -0.035 0.028 -0.062 0.062 -0.062 C 0.097 -0.062 0.125 -0.035 0.125 0 C 0.125 0.035 0.153 0.062 0.188 0.062 C 0.222 0.062 0.25 0.035 0.25 0 E' },
    'decayingwave': { presetId: 60, presetClass: 'path', name: 'DecayingWave', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C 0.002 0.053 0.007 0.127 0.025 0.126 C 0.051 0.126 0.053 -0.122 0.084 -0.123 C 0.112 -0.123 0.097 0.094 0.124 0.093 C 0.152 0.093 0.137 -0.064 0.167 -0.064 C 0.194 -0.064 0.179 0.042 0.203 0.042 C 0.226 0.042 0.214 -0.039 0.235 -0.039 C 0.247 -0.039 0.248 -0.017 0.249 0 E' },
    'curvyright': { presetId: 61, presetClass: 'path', name: 'CurvyRight', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 C -0.008 0.008 -0.017 0.016 -0.021 0.026 C -0.025 0.037 -0.027 0.05 -0.029 0.063 C -0.031 0.076 -0.029 0.087 -0.027 0.099 C -0.025 0.11 -0.022 0.122 -0.015 0.132 C -0.009 0.142 0.001 0.15 0.012 0.156 C 0.022 0.162 0.034 0.166 0.046 0.168 C 0.058 0.17 0.07 0.17 0.081 0.168 C 0.093 0.166 0.104 0.161 0.113 0.153 C 0.122 0.146 0.13 0.137 0.134 0.126 C 0.139 0.116 0.141 0.102 0.141 0.091 C 0.142 0.08 0.141 0.067 0.136 0.056 C 0.131 0.046 0.122 0.038 0.11 0.034 C 0.098 0.031 0.086 0.035 0.078 0.042 C 0.071 0.049 0.066 0.06 0.065 0.073 C 0.065 0.086 0.066 0.098 0.071 0.108 C 0.076 0.118 0.075 0.12 0.095 0.133 C 0.113 0.147 0.131 0.143 0.142 0.144 C 0.153 0.144 0.162 0.14 0.173 0.136 C 0.185 0.131 0.195 0.122 0.202 0.114 C 0.209 0.106 0.212 0.096 0.216 0.08 C 0.219 0.064 0.219 0.056 0.219 0.044 C 0.219 0.032 0.219 0.02 0.219 0.008 E' },
    'stairsdown': { presetId: 62, presetClass: 'path', name: 'StairsDown', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 l 0.036 0 l 0 0.036 l 0.036 0 l 0 0.036 l 0.036 0 l 0 0.036 l 0.036 0 l 0 0.036 l 0.036 0 l 0 0.036 l 0.036 0 l 0 0.036 l 0.036 0 l 0 0.036 E' },
    'up': { presetId: 64, presetClass: 'path', name: 'Up', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0 -0.25 E' },
    'right': { presetId: 63, presetClass: 'path', name: 'Right', category: 'motion-path', defaultDuration: 2000, defaultDelay: 0, supportsSequence: true, templateGenerator: 'path', pathData: 'M 0 0 L 0.25 0 E' },
};
// ============================================================================
// NORMALIZED LOOKUP MAPS
// ============================================================================
// Registry keys are not guaranteed to be lowercase (some are camelCase).
// The animation API lowercases `effect`, so we maintain a normalized map for lookups.
const ANIMATION_REGISTRY_MERGED_LC = Object.fromEntries(Object.entries(ANIMATION_REGISTRY_MERGED).map(([k, v]) => [k.toLowerCase(), v]));
// ============================================================================
// DIRECTION NAME NORMALIZATION
// ============================================================================
/**
 * Normalizes a direction name to PowerPoint-friendly format.
 * Accepts: 'fromLeft', 'FromLeft', 'from left', 'From Left' → 'From Left'
 *
 * This allows the API to accept camelCase but display PowerPoint Animation Pane names.
 */
export function normalizeDirectionName(input) {
    if (!input)
        return input;
    // Special cases that don't follow camelCase pattern
    const specialCases = {
        'checker(1)': 'Checker(1)',
        'checker1': 'Checker(1)',
        'inslightly': 'In Slightly',
        'outslightly': 'Out Slightly',
        'inbottom': 'In Bottom',
        'outbottom': 'Out Bottom',
        'incenter': 'In Center',
        'outcenter': 'Out Center',
        'objectcenter': 'In Center', // alias
        'slidecenter': 'Out Center', // alias
        'horizontalin': 'Horizontal In',
        'horizontalout': 'Horizontal Out',
        'verticalin': 'Vertical In',
        'verticalout': 'Vertical Out',
        'topleft': 'Top Left',
        'topright': 'Top Right',
        'bottomleft': 'Bottom Left',
        'bottomright': 'Bottom Right',
        'frombottom': 'From Bottom',
        'fromtop': 'From Top',
        'fromleft': 'From Left',
        'fromright': 'From Right',
        'fromtopleft': 'From TopLeft',
        'fromtopright': 'From TopRight',
        'frombottomleft': 'From BottomLeft',
        'frombottomright': 'From BottomRight',
        'tobottom': 'To Bottom',
        'totop': 'To Top',
        'toleft': 'To Left',
        'toright': 'To Right',
        'totopleft': 'To TopLeft',
        'totopright': 'To TopRight',
        'tobottomleft': 'To BottomLeft',
        'tobottomright': 'To BottomRight',
        '(none)': '(none)',
        'none': '(none)',
        'default': '(none)'
    };
    const lower = input.toLowerCase().replace(/[\s_-]+/g, '');
    if (specialCases[lower]) {
        return specialCases[lower];
    }
    // If already in PowerPoint format (has space), return as-is with proper casing
    if (input.includes(' ')) {
        return input.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
    // Convert camelCase to Title Case with spaces: 'fromLeft' → 'From Left'
    const spaced = input.replace(/([a-z])([A-Z])/g, '$1 $2');
    return spaced.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}
/**
 * Finds direction config by name (accepts both camelCase and PowerPoint-friendly names).
 * Returns both the normalized PowerPoint name and the presetSubtype.
 */
export function findDirectionConfig(directions, directionName) {
    if (!directions || !directionName)
        return undefined;
    const normalizedInput = normalizeDirectionName(directionName);
    // Try to find by normalized name
    for (const dir of directions) {
        const normalizedDir = normalizeDirectionName(dir.name);
        if (normalizedDir.toLowerCase() === normalizedInput.toLowerCase()) {
            return { name: normalizedDir, presetSubtype: dir.presetSubtype };
        }
    }
    // Fallback: try direct match on original name (case-insensitive)
    for (const dir of directions) {
        if (dir.name.toLowerCase() === directionName.toLowerCase()) {
            return { name: normalizeDirectionName(dir.name), presetSubtype: dir.presetSubtype };
        }
    }
    return undefined;
}
export function getAnimationConfigMerged(effect, type) {
    // Normalize effect name: lowercase and remove spaces/hyphens
    const effectKey = effect.toLowerCase().replace(/[\s-]+/g, '');
    // For backward compatibility, try with -exit suffix FIRST (during transition)
    if (type === 'exit' && ANIMATION_REGISTRY_MERGED_LC[`${effectKey}-exit`]) {
        return ANIMATION_REGISTRY_MERGED_LC[`${effectKey}-exit`];
    }
    // Try direct lookup
    let config = ANIMATION_REGISTRY_MERGED_LC[effectKey];
    if (!config) {
        return undefined;
    }
    // Clone and enhance config with derived properties based on animation type
    const enhancedConfig = Object.assign({}, config);
    // Derive presetClass and category from animation type if not already set
    if (!enhancedConfig.presetClass && type) {
        switch (type) {
            case 'entrance':
                enhancedConfig.presetClass = 'entr';
                enhancedConfig.category = 'entrance';
                break;
            case 'exit':
                enhancedConfig.presetClass = 'exit';
                enhancedConfig.category = 'exit';
                break;
            case 'emphasis':
                enhancedConfig.presetClass = 'emph';
                enhancedConfig.category = 'emphasis';
                break;
            case 'motion':
                enhancedConfig.presetClass = 'path';
                enhancedConfig.category = 'motion-path';
                break;
        }
    }
    return enhancedConfig;
}
export function getAllEffectsMerged() {
    return Object.keys(ANIMATION_REGISTRY_MERGED_LC);
}
export const TOTAL_ANIMATIONS = Object.keys(ANIMATION_REGISTRY_MERGED_LC).length;
if (typeof process !== 'undefined' && process.env.PPTXGENJS_DEBUG_ANIMATIONS) {
    console.log(`V3 Merged Registry loaded: ${TOTAL_ANIMATIONS} animations`);
}
//# sourceMappingURL=gen-animations-registry-merged.js.map