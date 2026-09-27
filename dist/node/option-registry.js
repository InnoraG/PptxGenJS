const GRADIENT_DIRECTION_ALIASES = {
    radial: 'circle',
};
export const GRADIENT_DIRECTIONS = ['linear', 'circle', 'rect', 'shape'];
const WORDART_TRANSFORM_ALIASES = {
    textDoubleWave2: 'textWave4',
    textChevronDown: 'textChevronInverted',
};
export const WORDART_TRANSFORMS = [
    'textNoShape',
    'textPlain',
    'textArchUp',
    'textArchDown',
    'textCircle',
    'textButton',
    'textArchUpPour',
    'textArchDownPour',
    'textCirclePour',
    'textButtonPour',
    'textCurveUp',
    'textCurveDown',
    'textCanUp',
    'textCanDown',
    'textWave1',
    'textWave2',
    'textWave4',
    'textDoubleWave1',
    'textInflate',
    'textDeflate',
    'textInflateBottom',
    'textDeflateBottom',
    'textInflateTop',
    'textDeflateTop',
    'textDeflateInflate',
    'textDeflateInflateDeflate',
    'textFadeRight',
    'textFadeLeft',
    'textFadeUp',
    'textFadeDown',
    'textSlantUp',
    'textSlantDown',
    'textCascadeUp',
    'textCascadeDown',
    'textChevron',
    'textChevronInverted',
    'textRingInside',
    'textRingOutside',
    'textTriangle',
    'textTriangleInverted',
    'textStop',
];
export const WORDART_ADJUSTMENT_TRANSFORMS = [
    'textPlain', 'textArchUp', 'textArchDown', 'textCircle', 'textButton',
    'textCurveUp', 'textCurveDown', 'textCanUp', 'textCanDown',
    'textInflate', 'textDeflate', 'textInflateBottom', 'textDeflateBottom',
    'textInflateTop', 'textDeflateTop', 'textDeflateInflate',
    'textDeflateInflateDeflate', 'textFadeRight', 'textFadeLeft',
    'textFadeUp', 'textFadeDown', 'textSlantUp', 'textSlantDown',
    'textCascadeUp', 'textCascadeDown', 'textChevron', 'textChevronInverted',
    'textRingInside', 'textRingOutside', 'textTriangle', 'textTriangleInverted',
    'textStop',
];
const WORDART_TRANSFORM_SET = new Set(WORDART_TRANSFORMS);
const WORDART_ADJUSTMENT_TRANSFORM_SET = new Set(WORDART_ADJUSTMENT_TRANSFORMS);
const GRADIENT_DIRECTION_SET = new Set(GRADIENT_DIRECTIONS);
export function optionRegistryError(issue) {
    const err = new Error(issue.message);
    err.code = issue.code;
    err.details = { status: 'failed', issue };
    return err;
}
export function normalizeGradientDirection(direction) {
    const value = String(direction || 'linear').trim();
    const alias = GRADIENT_DIRECTION_ALIASES[value];
    if (alias)
        return alias;
    if (GRADIENT_DIRECTION_SET.has(value))
        return value;
    throw optionRegistryError({
        code: 'INVALID_GRADIENT_DIRECTION',
        field: 'fill.gradientDirection',
        received: value,
        message: `Invalid gradientDirection "${value}".`,
        suggestion: 'Use one of: linear, circle, rect, shape. Use circle for radial gradients.',
        allowed: GRADIENT_DIRECTIONS,
    });
}
export function normalizeWordArtTransform(transform) {
    const value = String(transform || '').trim();
    const alias = WORDART_TRANSFORM_ALIASES[value];
    if (alias)
        return alias;
    if (WORDART_TRANSFORM_SET.has(value))
        return value;
    throw optionRegistryError({
        code: 'INVALID_WORDART_TRANSFORM',
        field: 'options.wordArt.transform',
        received: value,
        message: `Invalid WordArt transform "${value}".`,
        suggestion: 'Use a supported DrawingML preset. Use textWave4 instead of textDoubleWave2, and textChevronInverted instead of textChevronDown.',
        allowed: WORDART_TRANSFORMS,
    });
}
export function normalizeWordArtAdjustments(transform, adjustments) {
    if (adjustments == null)
        return [];
    if (!Array.isArray(adjustments) || adjustments.length > 1) {
        throw optionRegistryError({
            code: 'INVALID_WORDART_ADJUSTMENTS',
            field: 'options.wordArt.adjustments',
            received: adjustments,
            message: 'WordArt adjustments must contain zero or one native guide value.',
            suggestion: 'Use [] to reset the guide, or one integer from 0 through 100000 on a guide-capable transform.',
        });
    }
    const normalized = adjustments.map(value => Number(value));
    if (normalized.some(value => !Number.isInteger(value) || value < 0 || value > 100000)) {
        throw optionRegistryError({
            code: 'INVALID_WORDART_ADJUSTMENT_VALUE',
            field: 'options.wordArt.adjustments[0]',
            received: adjustments[0],
            message: 'The WordArt guide must be an integer from 0 through 100000.',
            suggestion: 'Use the native 1/100000 shape-dimension guide domain.',
        });
    }
    if (normalized.length && !WORDART_ADJUSTMENT_TRANSFORM_SET.has(transform)) {
        throw optionRegistryError({
            code: 'WORDART_ADJUSTMENT_NOT_APPLICABLE',
            field: 'options.wordArt.adjustments',
            received: adjustments,
            message: `WordArt transform "${transform}" does not expose a persisted native adjustment guide.`,
            suggestion: 'Author this transform as a discrete selector without adjustments.',
            allowed: WORDART_ADJUSTMENT_TRANSFORMS,
        });
    }
    return normalized;
}
export function normalizeScene3DRotationDegrees(degreesValue, field) {
    const degrees = Number(degreesValue !== null && degreesValue !== void 0 ? degreesValue : 0);
    if (!Number.isFinite(degrees)) {
        throw optionRegistryError({
            code: 'INVALID_TEXT3D_ROTATION',
            field,
            received: degreesValue,
            message: `${field} must be a finite number of degrees.`,
            suggestion: 'Use a numeric degree value. 0..360 is safest; negative values are normalized modulo 360.',
        });
    }
    const normalized = ((degrees % 360) + 360) % 360;
    return Math.round(normalized * 60000);
}
export function validateGradientDirectionOption(direction, field = 'fill.gradientDirection') {
    if (direction == null)
        return null;
    const value = String(direction).trim();
    const alias = GRADIENT_DIRECTION_ALIASES[value];
    if (alias) {
        return {
            code: 'GRADIENT_DIRECTION_ALIAS',
            field,
            received: value,
            canonical: alias,
            message: `${field} "${value}" will be serialized as DrawingML path "${alias}".`,
            suggestion: `Use "${alias}" for this gradient direction.`,
            allowed: GRADIENT_DIRECTIONS,
        };
    }
    if (!GRADIENT_DIRECTION_SET.has(value)) {
        return {
            code: 'INVALID_GRADIENT_DIRECTION',
            field,
            received: value,
            message: `${field} "${value}" is not a supported DrawingML gradient direction.`,
            suggestion: 'Use one of: linear, circle, rect, shape.',
            allowed: GRADIENT_DIRECTIONS,
        };
    }
    return null;
}
export function validateWordArtTransformOption(transform, field = 'options.wordArt.transform') {
    if (transform == null)
        return null;
    const value = String(transform).trim();
    const alias = WORDART_TRANSFORM_ALIASES[value];
    if (alias) {
        return {
            code: 'WORDART_TRANSFORM_ALIAS',
            field,
            received: value,
            canonical: alias,
            message: `${field} "${value}" will be serialized as DrawingML preset "${alias}".`,
            suggestion: `Use "${alias}" for this WordArt transform.`,
            allowed: WORDART_TRANSFORMS,
        };
    }
    if (!WORDART_TRANSFORM_SET.has(value)) {
        return {
            code: 'INVALID_WORDART_TRANSFORM',
            field,
            received: value,
            message: `${field} "${value}" is not a supported DrawingML WordArt preset.`,
            suggestion: 'Use a supported preset such as textWave4 or textChevronInverted. textDoubleWave2 and textChevronDown are aliases, not OOXML preset names.',
            allowed: WORDART_TRANSFORMS,
        };
    }
    return null;
}
export function validateText3DRotationOption(value, field) {
    if (value == null)
        return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return {
            code: 'INVALID_TEXT3D_ROTATION',
            field,
            received: value,
            message: `${field} must be a finite number of degrees.`,
            suggestion: 'Use a numeric degree value. 0..360 is safest; negative values are normalized modulo 360.',
        };
    }
    if (numeric < 0 || numeric >= 360) {
        const normalized = ((numeric % 360) + 360) % 360;
        return {
            code: 'TEXT3D_ROTATION_NORMALIZED',
            field,
            received: numeric,
            requested: numeric,
            canonical: normalized,
            normalized,
            effective: normalized,
            message: `${field} (${numeric}) will be serialized as ${normalized} degrees for PowerPoint-safe 3D camera XML.`,
            suggestion: `Use ${normalized} for ${field.split('.').pop()} to avoid relying on serializer normalization.`,
        };
    }
    return null;
}
export function getOptionCatalog(surface) {
    const catalog = [
        {
            id: 'gradientDirection',
            field: 'fill.gradientDirection',
            description: 'DrawingML gradient direction. radial is accepted as an intent alias and serializes to circle.',
            canonical: GRADIENT_DIRECTIONS,
            aliases: GRADIENT_DIRECTION_ALIASES,
            examples: ['linear', 'circle'],
        },
        {
            id: 'wordArtTransform',
            field: 'options.wordArt.transform',
            description: 'DrawingML preset text warp used by WordArt.',
            canonical: WORDART_TRANSFORMS,
            aliases: WORDART_TRANSFORM_ALIASES,
            examples: ['textArchUp', 'textWave1', 'textWave4', 'textChevronInverted'],
        },
        {
            id: 'text3DRotation',
            field: 'options.text3D.rotationX/Y/Z',
            description: 'Text3D camera rotations in degrees. The serializer emits non-negative PowerPoint fixed angles.',
            canonical: ['number: 0 <= degrees < 360'],
            aliases: { '-12': 348, '372': 12 },
            examples: [0, 12, 348],
        },
        {
            id: 'chartPreset',
            field: 'chartType / chartMulti',
            description: 'Native and composite chart presets are available through a specialized recommendation catalog.',
            canonical: ['bar', 'bar3D', 'line', 'area', 'pie', 'doughnut', 'scatter', 'bubble', 'radar'],
            specializedTool: 'betterpptx.chart.recommend',
        },
        {
            id: 'tablePreset',
            field: 'slide.add_table.options / per-cell options',
            description: 'Contextual table presets are available through a specialized recommendation catalog. Presets cover PowerPoint Table Design variants: Header Row, Total Row, First/Last Column, and Banded Rows/Columns.',
            canonical: ['headerRow', 'totalRow', 'bandedRows', 'firstColumn', 'lastColumn', 'bandedColumns', 'tableStyleId'],
            examples: ['executive-kpi-scorecard', 'financial-variance-total', 'feature-comparison-matrix'],
            specializedTool: 'betterpptx.table.recommend',
        },
        {
            id: 'smartArtLayout',
            field: 'slide.add_smartart.layout/layoutId',
            description: 'SmartArt layouts and support status are available through a specialized catalog.',
            canonical: ['list', 'process', 'cycle', 'hierarchy', 'relationship', 'matrix', 'pyramid', 'picture', 'timeline', 'team'],
            specializedTool: 'betterpptx.smartart.catalog',
        },
    ];
    if (!surface)
        return catalog;
    const needle = surface.toLowerCase();
    return catalog.filter(item => item.id.toLowerCase().includes(needle) || item.field.toLowerCase().includes(needle));
}
//# sourceMappingURL=option-registry.js.map