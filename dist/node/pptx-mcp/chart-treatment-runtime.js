import { CHART_TREATMENT_PRESETS } from './chart-treatment-catalog.js';
function treatmentOptionDefaults(optionSet) {
    switch (optionSet) {
        case 'format':
            return {
                chartArea: { fill: { color: 'EEF4F7' }, border: { color: '2563EB', pt: 1 } },
                plotArea: { fill: { color: 'FFFFFF' }, border: { color: '94A3B8', pt: 1 } },
                shadow: { type: 'outer', color: '94A3B8', opacity: 0.25, blur: 2, angle: 45, distance: 2 },
            };
        case 'legend-bottom': return { showLegend: true, legendPos: 'b' };
        case 'legend-left': return { showLegend: true, legendPos: 'l' };
        case 'legend-right': return { showLegend: true, legendPos: 'r' };
        case 'legend-top': return { showLegend: true, legendPos: 't' };
        case 'data-labels': return { showValue: true, showLabel: true, dataLabelPosition: 'outEnd' };
        case 'axes': return { showTitle: true, catAxisLabelPos: 'low', valAxisMinVal: 0, valAxisMajorUnit: 20 };
        case 'reverse-log': return { valAxisLogScaleBase: 10, valAxisMinVal: 1, valAxisMaxVal: 100, valAxisMajorUnit: 10 };
        case 'trend-error': return { showLegend: true, lineDataSymbol: 'circle', lineDataSymbolSize: 6, lineSize: 2 };
        case 'line-overlays': return { showLegend: true, lineDataSymbol: 'circle', lineDataSymbolSize: 5, lineSize: 2 };
        case 'pie': return { showLegend: true, showValue: true, showPercent: true, showLabel: true, dataLabelPosition: 'bestFit', firstSliceAng: 45 };
        case 'doughnut': return { showLegend: true, showValue: true, showPercent: true, showLabel: true, holeSize: 62, firstSliceAng: 45 };
        case '3d': return { barDir: 'col', barGrouping: 'clustered', v3DRotX: 20, v3DRotY: 35, v3DPerspective: 30, showLegend: true };
        case 'secondary-axis': return { showLegend: true, legendPos: 'b', showTitle: true };
        default: {
            if (optionSet.startsWith('layout-')) {
                const index = Number(optionSet.slice('layout-'.length));
                return { showTitle: index % 2 === 0, showLegend: index % 3 !== 0, showValue: index % 4 === 0 };
            }
            return {};
        }
    }
}
function supportFor(optionSet) {
    if (optionSet === 'trend-error')
        return { support: 'native-partial', unsupportedFeatures: ['native trendline and error-bar objects require preserve/edit until the chart treatment API is extended'] };
    if (optionSet === 'line-overlays')
        return { support: 'native-partial', unsupportedFeatures: ['drop lines, hi-lo lines, and up/down bars require preserve/edit until the overlay API is extended'] };
    if (optionSet === 'secondary-axis')
        return { support: 'native-partial', unsupportedFeatures: ['a true secondary axis is available for native combo chart series; this single-specimen treatment does not synthesize a combo series'] };
    return { support: 'native', unsupportedFeatures: [] };
}
export function chartTreatmentPresetById(id) {
    const preset = CHART_TREATMENT_PRESETS.find(item => item.id === id);
    if (!preset)
        return undefined;
    return Object.assign({ preset, optionDefaults: treatmentOptionDefaults(preset.optionSet) }, supportFor(preset.optionSet));
}
export function publicChartTreatmentPreset(runtime) {
    const { preset, optionDefaults, support, unsupportedFeatures } = runtime;
    return {
        id: preset.id,
        title: preset.title,
        family: preset.family,
        optionSet: preset.optionSet,
        semanticType: preset.semanticType,
        dataShape: preset.dataShape,
        notes: preset.notes,
        selection: 'chartTreatmentPresetId',
        support,
        unsupportedFeatures,
        fidelity: support === 'native' ? 'native-engine' : support === 'native-partial' ? 'native-engine-partial' : 'preserve-only',
    };
}
export function listPublicChartTreatmentPresets(args = {}) {
    const type = args.chartType == null ? null : String(args.chartType);
    const limit = Math.max(1, Math.min(Number.isFinite(Number(args.limit)) ? Number(args.limit) : 200, 200));
    return CHART_TREATMENT_PRESETS
        .filter(item => (!type || item.semanticType === type || String(item.comChartType) === type) && (!args.optionSet || item.optionSet === args.optionSet))
        .map(item => publicChartTreatmentPreset(chartTreatmentPresetById(item.id)))
        .slice(0, limit);
}
//# sourceMappingURL=chart-treatment-runtime.js.map