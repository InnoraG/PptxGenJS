/** Public chart color palettes. Users can copy and customize any palette. */
export const CHART_COLOR_PRESETS = Object.freeze({
    modern: Object.freeze(['4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47']),
    ocean: Object.freeze(['0F6B8F', '18A6A6', '48C1B5', '7BC96F', 'F2C14E', 'E07A5F']),
    indigo: Object.freeze(['4338CA', '6366F1', '818CF8', 'A5B4FC', 'C7D2FE', 'E0E7FF']),
    diverging: Object.freeze(['B2182B', 'EF8A62', 'FDDBC7', 'D1E5F0', '67A9CF', '2166AC']),
    mono: Object.freeze(['1F3A5F', '365F91', '5B84B1', '7FA6C9', 'A8C2DC', 'D1DFEC']),
});
const base = (chartColors) => ({
    chartColors: [...chartColors],
    chartColorsOpacity: 94,
    dataBorder: { color: 'FFFFFF', pt: 0.5 },
    chartArea: { fill: { color: 'FFFFFF' }, border: { color: 'D9E2F3', pt: 0.75 }, roundedCorners: true },
    plotArea: { fill: { color: 'F7F9FC' }, border: { color: 'D9E2F3', pt: 0.5 } },
    catAxisLabelColor: '44546A',
    valAxisLabelColor: '44546A',
    catAxisLineColor: 'A6A6A6',
    valAxisLineColor: 'A6A6A6',
    catGridLine: { color: 'D9E2F3', size: 0.6, style: 'solid' },
    valGridLine: { color: 'D9E2F3', size: 0.6, style: 'solid' },
    legendColor: '44546A',
    legendFontSize: 10,
    dataLabelColor: '44546A',
    dataLabelFontSize: 9,
    dataLabelFontBold: true,
});
const modern = [...CHART_COLOR_PRESETS.modern];
const pie = ['5B9BD5', 'ED7D31', 'A5A5A5', 'FFC000', '4472C4', '70AD47'];
const chartEx = Object.assign({}, base(modern));
/**
 * Ready-to-use defaults for every evolved chart family.
 *
 * These are intentionally ordinary option objects: callers can spread a
 * preset and override any field without opting into a separate styling API.
 */
export const CHART_STYLE_PRESETS = Object.freeze({
    area: Object.assign(Object.assign({}, base(modern)), { chartColorsOpacity: 72, lineSize: 2, barGrouping: 'standard' }),
    bar: Object.assign(Object.assign({}, base(modern)), { barGapWidthPct: 80, showValue: true, dataLabelPosition: 'outEnd' }),
    bar3D: Object.assign(Object.assign({}, base(modern)), { bar3DShape: 'box', barGapWidthPct: 80, barGapDepthPct: 80, v3DPerspective: 24, v3DRotX: 18, v3DRotY: 22, v3DRAngAx: true, showValue: true }),
    bubble: Object.assign(Object.assign({}, base(CHART_COLOR_PRESETS.ocean)), { chartColorsOpacity: 82, lineSize: 1.5, lineDataSymbol: 'circle', lineDataSymbolSize: 7 }),
    bubble3D: Object.assign(Object.assign({}, base(CHART_COLOR_PRESETS.ocean)), { chartColorsOpacity: 82, lineSize: 1.5, lineDataSymbol: 'circle', lineDataSymbolSize: 7, v3DPerspective: 24, v3DRotX: 18, v3DRotY: 22, v3DRAngAx: true }),
    doughnut: Object.assign(Object.assign({}, base(pie)), { holeSize: 55, firstSliceAng: 270, showPercent: true, dataLabelPosition: 'bestFit' }),
    line: Object.assign(Object.assign({}, base(CHART_COLOR_PRESETS.ocean)), { lineSize: 2.25, lineSmooth: true, lineDataSymbol: 'circle', lineDataSymbolSize: 7, dataLabelPosition: 'r' }),
    pie: Object.assign(Object.assign({}, base(pie)), { firstSliceAng: 270, showPercent: true, dataLabelPosition: 'bestFit' }),
    radar: Object.assign(Object.assign({}, base(CHART_COLOR_PRESETS.indigo)), { radarStyle: 'filled', chartColorsOpacity: 56, lineSize: 2.25 }),
    scatter: Object.assign(Object.assign({}, base(CHART_COLOR_PRESETS.ocean)), { lineSize: 1.75, lineDataSymbol: 'circle', lineDataSymbolSize: 7, dataLabelFormatScatter: 'XY' }),
    treemap: Object.assign(Object.assign({}, chartEx), { chartColors: modern }),
    sunburst: Object.assign(Object.assign({}, chartEx), { chartColors: pie }),
    histogram: Object.assign(Object.assign({}, chartEx), { chartColors: [modern[0], modern[1], modern[2]] }),
    pareto: Object.assign(Object.assign({}, chartEx), { chartColors: [modern[0], modern[4]], lineSize: 2.25 }),
    boxWhisker: Object.assign(Object.assign({}, chartEx), { chartColors: [modern[0], modern[1], modern[3], modern[5]] }),
    waterfall: Object.assign(Object.assign({}, chartEx), { chartColors: [modern[0], modern[1], modern[3]], invertedColors: ['C00000', 'ED7D31'] }),
    funnel: Object.assign(Object.assign({}, chartEx), { chartColors: pie }),
    regionMap: Object.assign(Object.assign({}, chartEx), { chartColors: [...CHART_COLOR_PRESETS.ocean] }),
});
export function getChartStylePreset(type) {
    return CHART_STYLE_PRESETS[type] || {};
}
const NATIVE_GALLERY_OWNED_OPTION_KEYS = [
    'chartColors',
    'chartColorsOpacity',
    'dataBorder',
    'chartArea',
    'plotArea',
    'catAxisLabelColor',
    'valAxisLabelColor',
    'catAxisLineColor',
    'valAxisLineColor',
    'catGridLine',
    'valGridLine',
    'legendColor',
    'dataLabelColor',
    'dataLabelFontSize',
    'dataLabelFontBold',
    'showValue',
    'showPercent',
    'dataLabelPosition',
    'lineSize',
    'lineDataSymbol',
    'lineDataSymbolSize',
];
/**
 * Return family defaults without overriding appearance owned by a native
 * PowerPoint Ribbon style. Structural defaults remain available, while fills,
 * lines, labels and chart surfaces are left to the selected gallery payload.
 */
export function getChartStylePresetForNativeGallery(type, nativeGalleryStyle) {
    const preset = Object.assign({}, getChartStylePreset(type));
    if (!nativeGalleryStyle)
        return preset;
    for (const key of NATIVE_GALLERY_OWNED_OPTION_KEYS)
        delete preset[key];
    return preset;
}
//# sourceMappingURL=chart-presets.js.map