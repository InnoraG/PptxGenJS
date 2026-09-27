import { CHART_GALLERY, getChartGalleryStyleVariant } from '../chart-gallery.js';
import { chartGalleryApplicabilityById } from './chart-gallery-applicability.js';
import { CHART_TYPE_REGISTRY } from './chart-type-registry.js';
import { chartGalleryUiEvidenceByType } from './chart-gallery-ui-evidence.js';
import { CHART_TREATMENT_PRESETS, listChartTreatmentPresets } from './chart-treatment-catalog.js';
export { CHART_TREATMENT_PRESETS, listChartTreatmentPresets };
export const NATIVE_CHART_TYPES = ['area', 'bar', 'bar3D', 'bubble', 'bubble3D', 'doughnut', 'line', 'pie', 'radar', 'scatter', 'treemap', 'sunburst', 'histogram', 'pareto', 'boxWhisker', 'waterfall', 'funnel', 'regionMap', 'combo'];
function hasUiEvidenceForSemanticType(semanticType, galleryKind = 'styles') {
    return CHART_TYPE_REGISTRY.some(record => record.semanticType === semanticType && chartGalleryUiEvidenceByType(Number(record.comChartType), galleryKind).length > 0);
}
/**
 * Resolve a gallery filter without collapsing canonical registry semantics
 * such as area3D/line3D/pie3D into an unrelated base family.  The ordinary
 * native option normalizer intentionally knows only executable serializer
 * types; Ribbon evidence also has preserve/edit semantics and therefore must
 * retain the registry's semantic type when filtering.
 */
function galleryChartTypeFilter(value) {
    const raw = String(value !== null && value !== void 0 ? value : '').trim();
    if (!raw)
        return { provided: false, type: null };
    const normalized = normalizeNativeChartType(raw);
    if (normalized)
        return { provided: true, type: normalized };
    const record = CHART_TYPE_REGISTRY.find(item => item.semanticType.toLowerCase() === raw.toLowerCase());
    return { provided: true, type: (record === null || record === void 0 ? void 0 : record.semanticType) || null };
}
/**
 * All 49 style/color resource combinations present in the PowerPoint-authored
 * chart COM matrix. The first 48 also have legacy ChartStyle read-back IDs;
 * variant 49 is a ChartEx gallery resource without a legacy c:style ID.
 */
export const CHART_STYLE_PRESET_CATALOG = Object.freeze(Object.values(CHART_GALLERY.variants).map((variant) => {
    const legacy = getChartGalleryStyleVariant(variant.galleryId);
    const applicability = chartGalleryApplicabilityById(variant.galleryId);
    const packageTypes = [...new Set([...((applicability === null || applicability === void 0 ? void 0 : applicability.style.semanticTypes) || []), ...((applicability === null || applicability === void 0 ? void 0 : applicability.color.semanticTypes) || [])])];
    const packageTags = [...new Set([...((applicability === null || applicability === void 0 ? void 0 : applicability.style.chartTags) || []), ...((applicability === null || applicability === void 0 ? void 0 : applicability.color.chartTags) || [])])];
    const packageParts = [...new Set([...((applicability === null || applicability === void 0 ? void 0 : applicability.style.chartParts) || []), ...((applicability === null || applicability === void 0 ? void 0 : applicability.color.chartParts) || [])])];
    const observedChartEx = packageTags.some(tag => tag.startsWith('chartEx:'));
    const observedLegacy = packageTags.some(tag => !tag.startsWith('chartEx:'));
    const scope = observedLegacy && observedChartEx ? 'legacy-and-chartex' : observedLegacy ? 'legacy-only' : observedChartEx ? 'chartex-only' : legacy ? 'package-observed' : 'chartex-only';
    const evidenceByType = Object.fromEntries(packageTypes.map(type => [type, hasUiEvidenceForSemanticType(type, 'styles') ? 'type-specific-ui-captured' : 'type-specific-capture-pending']));
    const colorEvidenceByType = Object.fromEntries(packageTypes.map(type => [type, hasUiEvidenceForSemanticType(type, 'colors') ? 'type-specific-ui-captured' : 'type-specific-capture-pending']));
    const layoutEvidenceByType = Object.fromEntries(packageTypes.map(type => [type, hasUiEvidenceForSemanticType(type, 'layouts') ? 'type-specific-ui-captured' : 'type-specific-capture-pending']));
    return Object.assign(Object.assign(Object.assign({ id: `office-chart-style-${String(variant.galleryId).padStart(2, '0')}`, title: `Office Chart Design style ${String(variant.galleryId).padStart(2, '0')}`, powerPointCategory: 'Chart Design', powerPointPreset: `Chart Design style ${variant.galleryId}`, authoringMode: 'native', chartGalleryVariant: variant.galleryId, chartStyleId: variant.chartStyleId }, ((legacy === null || legacy === void 0 ? void 0 : legacy.modernStyleId) ? { chartStyleModernId: legacy.modernStyleId } : {})), ((legacy === null || legacy === void 0 ? void 0 : legacy.fallbackStyleId) ? { legacyFallbackStyleId: legacy.fallbackStyleId } : {})), { chartFamilyScope: scope, supportedChartTypes: packageTypes.length ? packageTypes : (legacy ? [...NATIVE_CHART_TYPES] : ['treemap', 'sunburst', 'histogram', 'pareto', 'boxWhisker', 'waterfall', 'funnel', 'regionMap']), packageObservedChartParts: packageParts, packageObservedChartTags: packageTags, ribbonEvidenceByChartType: evidenceByType, colorEvidenceByChartType: colorEvidenceByType, layoutEvidenceByChartType: layoutEvidenceByType, evidenceStatus: 'package-captured-ui-pending', styleFamilyId: variant.styleCatalogId, colorFamilyId: variant.colorCatalogId, optionDefaults: { chartGalleryVariant: variant.galleryId }, tags: ['chart', 'office-gallery', 'chart-style', 'chart-color', ...(legacy ? [] : ['chartex-only']), `style-family-${variant.styleCatalogId}`, `color-family-${variant.colorCatalogId}`], fidelityNote: 'PowerPoint gallery state captured and executable; select this governed style resource instead of rebuilding the appearance manually.' });
}));
export function chartStylePresetById(id) {
    return CHART_STYLE_PRESET_CATALOG.find(preset => preset.id === id);
}
/** Resolve one exact chart-type-specific Ribbon tile by its opaque id. */
export function chartGalleryTilePresetById(id, args = {}) {
    const chartTypeFilter = galleryChartTypeFilter(args.chartType);
    if (chartTypeFilter.provided && !chartTypeFilter.type)
        return undefined;
    const requestedType = chartTypeFilter.type;
    const requestedKind = args.galleryKind;
    return listChartGalleryUiPresets({ limit: 2000, chartType: requestedType, galleryKind: requestedKind })
        .find(tile => tile.id === id);
}
/**
 * Public-safe tile metadata.  Package paths, local manifests, screenshots and
 * XML hashes remain implementation/provenance details and never cross the
 * product boundary.  The opaque id is sufficient for the authoring resolver.
 */
export function publicChartGalleryTilePreset(tile) {
    return {
        id: tile.id,
        title: tile.title,
        chartType: tile.chartType,
        galleryKind: tile.galleryKind,
        tileIndex: tile.tileIndex,
        row: tile.row,
        column: tile.column,
        serializationStatus: tile.serializationStatus === 'package-backed' || tile.serializationStatus === 'native-engine' ? 'verified-executable' : 'unavailable',
        fidelity: tile.serializationStatus === 'package-backed' ? 'package-verified' : tile.serializationStatus === 'native-engine' ? 'native-engine-verified' : 'not-executable',
    };
}
export function publicChartStylePreset(preset) {
    return {
        id: preset.id,
        title: preset.title,
        powerPointCategory: preset.powerPointCategory,
        authoringMode: preset.authoringMode,
        chartFamilyScope: preset.chartFamilyScope,
        supportedChartTypes: preset.supportedChartTypes,
        ribbonEvidenceByChartType: preset.ribbonEvidenceByChartType,
        colorEvidenceByChartType: preset.colorEvidenceByChartType,
        layoutEvidenceByChartType: preset.layoutEvidenceByChartType,
        evidenceStatus: preset.evidenceStatus,
        styleFamilyId: preset.styleFamilyId,
        colorFamilyId: preset.colorFamilyId,
        fidelityNote: preset.fidelityNote,
    };
}
export function listChartGalleryUiPresets(args = {}) {
    var _a, _b, _c, _d, _e, _f, _g;
    const chartTypeFilter = galleryChartTypeFilter(args === null || args === void 0 ? void 0 : args.chartType);
    if (chartTypeFilter.provided && !chartTypeFilter.type)
        return [];
    const requestedType = chartTypeFilter.type;
    const requestedKind = (args === null || args === void 0 ? void 0 : args.galleryKind) === 'colors' || (args === null || args === void 0 ? void 0 : args.galleryKind) === 'layouts' || (args === null || args === void 0 ? void 0 : args.galleryKind) === 'styles' ? args.galleryKind : undefined;
    // The public listing is an exhaustive catalog by default.  Callers that
    // need a UI-sized recommendation can pass an explicit limit; silently
    // truncating the default would make the engine appear to have fewer Ribbon
    // states than the captured corpus actually contains.
    const requestedLimit = (args === null || args === void 0 ? void 0 : args.limit) == null ? 2000 : Number(args.limit);
    const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 2000, 2000));
    const seen = new Set();
    const result = [];
    for (const record of CHART_TYPE_REGISTRY) {
        const semanticType = record.semanticType;
        if (requestedType && semanticType !== requestedType)
            continue;
        for (const galleryKind of (requestedKind ? [requestedKind] : ['styles', 'colors', 'layouts'])) {
            // Promoted UI captures and package-backed captures can describe the
            // same tile hash. Prefer the package-backed record so the opaque id is
            // executable through both direct-code and MCP generation.
            const evidences = chartGalleryUiEvidenceByType(Number(record.comChartType), galleryKind)
                .slice()
                .sort((left, right) => Number(right.tiles.some(tile => tile.packageSha256 && tile.chartXmlSha256)) - Number(left.tiles.some(tile => tile.packageSha256 && tile.chartXmlSha256)));
            for (const evidence of evidences) {
                for (const tile of evidence.tiles) {
                    const key = `${semanticType}:${galleryKind}:${tile.sha256}`;
                    if (seen.has(key))
                        continue;
                    seen.add(key);
                    const tileIndex = evidence.tiles.indexOf(tile);
                    result.push({
                        id: `office-ribbon-${semanticType}-${galleryKind}-${tile.sha256.slice(0, 12)}`,
                        title: `${semanticType} · ${galleryKind} tile ${tileIndex + 1}`,
                        chartType: semanticType,
                        chartTypeCom: Number(record.comChartType),
                        chartFamily: record.family,
                        galleryKind,
                        tileIndex,
                        row: tile.row,
                        column: tile.column,
                        nativeStyleId: tile.chartStyleAfter,
                        nativeColorId: tile.chartColorAfter,
                        renderedHash: tile.sha256,
                        screenshot: tile.screenshot,
                        packageSha256: (_a = tile.packageSha256) !== null && _a !== void 0 ? _a : null,
                        chartXmlSha256: (_b = tile.chartXmlSha256) !== null && _b !== void 0 ? _b : null,
                        selectedChartXmlSha256: (_c = tile.selectedChartXmlSha256) !== null && _c !== void 0 ? _c : null,
                        chartXmlPath: (_d = tile.chartXmlPath) !== null && _d !== void 0 ? _d : null,
                        bundleSlide: tile.bundleSlide == null ? null : Number(tile.bundleSlide),
                        layoutId: tile.layoutId == null ? null : Number(tile.layoutId),
                        packageReplay: (_e = tile.packageReplay) !== null && _e !== void 0 ? _e : null,
                        packagePath: (_f = tile.packagePath) !== null && _f !== void 0 ? _f : null,
                        packageError: (_g = tile.packageError) !== null && _g !== void 0 ? _g : null,
                        // Color tiles with a native ChartColor read-back are executable
                        // through the engine's native-id catalog even when this particular
                        // applicability probe was intentionally screenshot-only. Layout
                        // tiles remain UI-only until their native layout payload is modeled.
                        serializationStatus: tile.packageSha256 && tile.chartXmlSha256
                            ? 'package-backed'
                            : galleryKind === 'colors' && Number.isInteger(tile.chartColorAfter)
                                ? 'native-engine'
                                : 'ui-only',
                        manifest: evidence.manifest,
                        referencePptx: evidence.referencePptx,
                        tags: ['chart', 'office-ribbon', galleryKind, semanticType],
                    });
                    if (result.length >= limit)
                        return result;
                }
            }
        }
    }
    return result;
}
export function listChartStylePresets(args = {}) {
    const limit = Math.max(1, Math.min(Number((args === null || args === void 0 ? void 0 : args.limit) || CHART_STYLE_PRESET_CATALOG.length), CHART_STYLE_PRESET_CATALOG.length));
    const styleFamilyId = Number(args === null || args === void 0 ? void 0 : args.styleFamilyId);
    const colorFamilyId = Number(args === null || args === void 0 ? void 0 : args.colorFamilyId);
    const chartTypeFilter = galleryChartTypeFilter(args === null || args === void 0 ? void 0 : args.chartType);
    if (chartTypeFilter.provided && !chartTypeFilter.type)
        return [];
    const chartType = chartTypeFilter.type;
    const requireRibbonEvidence = (args === null || args === void 0 ? void 0 : args.requireRibbonEvidence) === true;
    const requireGalleryKind = (args === null || args === void 0 ? void 0 : args.requireGalleryKind) === 'colors' || (args === null || args === void 0 ? void 0 : args.requireGalleryKind) === 'layouts' || (args === null || args === void 0 ? void 0 : args.requireGalleryKind) === 'styles' ? args.requireGalleryKind : undefined;
    const hasRequestedEvidence = (preset, kind) => {
        const map = kind === 'colors' ? preset.colorEvidenceByChartType : kind === 'layouts' ? preset.layoutEvidenceByChartType : preset.ribbonEvidenceByChartType;
        return Object.entries(map).some(([type, status]) => (!chartType || type === chartType) && status === 'type-specific-ui-captured');
    };
    return CHART_STYLE_PRESET_CATALOG
        .filter(preset => !Number.isInteger(styleFamilyId) || preset.styleFamilyId === styleFamilyId)
        .filter(preset => !Number.isInteger(colorFamilyId) || preset.colorFamilyId === colorFamilyId)
        .filter(preset => !chartType || preset.supportedChartTypes.includes(chartType))
        .filter(preset => !requireRibbonEvidence || hasRequestedEvidence(preset, 'styles'))
        .filter(preset => !requireGalleryKind || hasRequestedEvidence(preset, requireGalleryKind))
        .slice(0, limit);
}
export function chartStyleCoverageByType(chartType) {
    const types = chartType ? [normalizeNativeChartType(chartType) || chartType] : [...new Set(CHART_TYPE_REGISTRY.map(record => record.semanticType))];
    return types.map(type => {
        const presets = CHART_STYLE_PRESET_CATALOG.filter(preset => preset.supportedChartTypes.includes(type));
        const evidenceTileCount = (galleryKind) => {
            const hashes = new Set();
            for (const record of CHART_TYPE_REGISTRY.filter(record => record.semanticType === type)) {
                for (const evidence of chartGalleryUiEvidenceByType(Number(record.comChartType), galleryKind)) {
                    for (const tile of evidence.tiles)
                        hashes.add(tile.sha256);
                }
            }
            return hashes.size;
        };
        return {
            chartType: type,
            matrixSpecimens: CHART_TYPE_REGISTRY.filter(record => record.semanticType === type).length,
            packageObservedPresets: presets.length,
            typeSpecificRibbonCaptured: presets.filter(preset => preset.ribbonEvidenceByChartType[type] === 'type-specific-ui-captured').length,
            // UI tile evidence is intentionally separate from package-preset mapping.
            // Until a tile's native read-back/XML hash is linked to a package variant,
            // the package preset remains pending even when its chart family has been
            // photographed and read back in the Ribbon.
            typeSpecificRibbonPending: presets.filter(preset => preset.ribbonEvidenceByChartType[type] !== 'type-specific-ui-captured').length,
            typeSpecificUiTileEvidence: {
                styles: evidenceTileCount('styles'),
                colors: evidenceTileCount('colors'),
                layouts: evidenceTileCount('layouts'),
            },
        };
    });
}
export function normalizeNativeChartType(value) {
    const raw = String(value || '').trim();
    const lower = raw.toLowerCase();
    const compact = lower.replace(/[^a-z0-9]+/g, '');
    if (compact === 'column' || compact === 'clusteredcolumn')
        return 'bar';
    if (lower === 'bar3d')
        return 'bar3D';
    if (lower === 'bubble3d')
        return 'bubble3D';
    if (compact === 'boxwhisker' || compact === 'boxandwhisker')
        return 'boxWhisker';
    if (compact === 'filledmap' || compact === 'map' || compact === 'regionmap')
        return 'regionMap';
    if (compact === 'combo' || compact === 'combination')
        return 'combo';
    return NATIVE_CHART_TYPES.includes(raw) ? raw : NATIVE_CHART_TYPES.find(type => type.toLowerCase() === lower) || null;
}
const categoryLabels = ['Q1', 'Q2', 'Q3', 'Q4'];
const trendLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
function categorySeries(a = [18, 24, 31, 38], b = [12, 20, 27, 34]) {
    return [
        { name: 'Current', labels: categoryLabels, values: a },
        { name: 'Prior', labels: categoryLabels, values: b },
    ];
}
function trendSeries() {
    return [
        { name: 'Revenue', labels: trendLabels, values: [22, 28, 31, 36, 39, 44] },
        { name: 'Margin', labels: trendLabels, values: [12, 15, 17, 19, 20, 23] },
    ];
}
function shareSeries() {
    return [{ name: 'Share', labels: ['Product', 'Services', 'Support', 'Other'], values: [42, 28, 18, 12] }];
}
function xySeries() {
    return [
        { name: 'X', values: [1, 2, 3, 4, 5, 6, 7] },
        { name: 'Signal', values: [2, 5, 4, 9, 7, 11, 13] },
        { name: 'Control', values: [1, 3, 6, 7, 10, 9, 12] },
    ];
}
function bubbleSeries() {
    return [
        { name: 'X', values: [1, 2, 3, 4, 5, 6] },
        { name: 'Portfolio', values: [3, 5, 8, 6, 9, 11], sizes: [12, 22, 8, 30, 18, 26] },
        { name: 'Market', values: [2, 4, 5, 7, 8, 10], sizes: [8, 14, 18, 12, 24, 20] },
    ];
}
export const CHART_PRESET_CATALOG = [
    {
        id: 'column-clustered',
        title: 'Clustered column',
        powerPointCategory: 'Column',
        powerPointPreset: 'Clustered Column',
        authoringMode: 'native',
        chartType: 'bar',
        dataShape: 'categorical comparison with one or more series',
        requiredFields: ['labels', 'values'],
        useWhen: ['Compare categories across a small number of series.', 'Use for quarterly performance, regions, products, or before/after category comparisons.'],
        avoidWhen: ['Avoid for long category labels; use clustered bar instead.', 'Avoid for part-to-whole share; use doughnut or pie.'],
        tags: ['comparison', 'category', 'column', 'clustered', 'quarterly', 'default'],
        optionDefaults: { barDir: 'col', barGrouping: 'clustered', showLegend: true, showTitle: true },
        sampleData: categorySeries(),
        fidelityNote: 'Native chart XML using barChart with barDir=col and clustered grouping.',
        rank: 1,
    },
    {
        id: 'column-stacked',
        title: 'Stacked column',
        powerPointCategory: 'Column',
        powerPointPreset: 'Stacked Column',
        authoringMode: 'native',
        chartType: 'bar',
        dataShape: 'categorical contribution by segment',
        requiredFields: ['labels', 'values'],
        useWhen: ['Show absolute contribution of segments within each category.', 'Use when both totals and component mix matter.'],
        avoidWhen: ['Avoid when precise segment comparison matters across many categories.'],
        tags: ['comparison', 'composition', 'column', 'stacked', 'segments'],
        optionDefaults: { barDir: 'col', barGrouping: 'stacked', showLegend: true, showTitle: true },
        sampleData: categorySeries([18, 24, 31, 38], [7, 9, 11, 13]),
        fidelityNote: 'Native chart XML using stacked column grouping.',
        rank: 4,
    },
    {
        id: 'column-100-stacked',
        title: '100% stacked column',
        powerPointCategory: 'Column',
        powerPointPreset: '100% Stacked Column',
        authoringMode: 'native',
        chartType: 'bar',
        dataShape: 'normalized categorical contribution by segment',
        requiredFields: ['labels', 'values'],
        useWhen: ['Compare mix or share of components across categories.', 'Use when each category should total to 100%.'],
        avoidWhen: ['Avoid when absolute totals are important.'],
        tags: ['composition', 'percentage', 'share', 'column', 'stacked'],
        optionDefaults: { barDir: 'col', barGrouping: 'percentStacked', showLegend: true, showTitle: true, valLabelFormatCode: '0%' },
        sampleData: categorySeries([42, 48, 52, 55], [58, 52, 48, 45]),
        fidelityNote: 'Native chart XML using percentStacked column grouping.',
        rank: 8,
    },
    {
        id: 'column-3d-clustered',
        title: '3-D clustered column',
        powerPointCategory: 'Column',
        powerPointPreset: '3-D Clustered Column',
        authoringMode: 'native',
        chartType: 'bar3D',
        dataShape: 'categorical comparison with 3-D view metadata',
        requiredFields: ['labels', 'values'],
        useWhen: ['Use sparingly for presentation-showcase specimens or when the brief explicitly asks for 3-D chart styling.'],
        avoidWhen: ['Avoid for analytical precision or dense dashboards.'],
        tags: ['comparison', 'category', '3d', 'column', 'showcase'],
        optionDefaults: { barDir: 'col', barGrouping: 'clustered', showLegend: true, showTitle: true, v3DRotX: 20, v3DRotY: 35, v3DPerspective: 30 },
        sampleData: categorySeries(),
        fidelityNote: 'Native bar3DChart with view3D rotation options.',
        rank: 16,
    },
    {
        id: 'bar-clustered',
        title: 'Clustered bar',
        powerPointCategory: 'Bar',
        powerPointPreset: 'Clustered Bar',
        authoringMode: 'native',
        chartType: 'bar',
        dataShape: 'ranked categories or categories with long labels',
        requiredFields: ['labels', 'values'],
        useWhen: ['Compare ranked categories.', 'Use when labels are long or category count is higher than a column chart can comfortably hold.'],
        avoidWhen: ['Avoid for time series; use line or area.'],
        tags: ['comparison', 'ranking', 'category', 'bar', 'long-labels'],
        optionDefaults: { barDir: 'bar', barGrouping: 'clustered', showLegend: true, showTitle: true },
        sampleData: [
            { name: 'Score', labels: ['Enterprise accounts', 'Mid-market', 'SMB', 'Partner channel'], values: [88, 74, 62, 54] },
        ],
        fidelityNote: 'Native chart XML using barChart with barDir=bar.',
        rank: 2,
    },
    {
        id: 'line-trend',
        title: 'Line trend',
        powerPointCategory: 'Line',
        powerPointPreset: 'Line',
        authoringMode: 'native',
        chartType: 'line',
        dataShape: 'ordered time or sequence series',
        requiredFields: ['labels', 'values'],
        useWhen: ['Show trend over time.', 'Use for rates, revenue, adoption, forecast, or progress across periods.'],
        avoidWhen: ['Avoid for unrelated nominal categories.'],
        tags: ['trend', 'time', 'forecast', 'growth', 'line'],
        optionDefaults: { showLegend: true, showTitle: true, lineDataSymbol: 'none', lineSmooth: false },
        sampleData: trendSeries(),
        fidelityNote: 'Native lineChart with workbook-backed series.',
        rank: 1,
    },
    {
        id: 'line-marker',
        title: 'Line with markers',
        powerPointCategory: 'Line',
        powerPointPreset: 'Line with Markers',
        authoringMode: 'native',
        chartType: 'line',
        dataShape: 'short ordered series where individual points matter',
        requiredFields: ['labels', 'values'],
        useWhen: ['Show a trend while emphasizing each measured point.', 'Use when there are fewer than about 12 periods.'],
        avoidWhen: ['Avoid when markers create visual clutter.'],
        tags: ['trend', 'time', 'marker', 'line', 'points'],
        optionDefaults: { showLegend: true, showTitle: true, lineDataSymbol: 'circle', lineDataSymbolSize: 5 },
        sampleData: trendSeries(),
        fidelityNote: 'Native lineChart with marker options.',
        rank: 5,
    },
    {
        id: 'area-stacked',
        title: 'Stacked area',
        powerPointCategory: 'Area',
        powerPointPreset: 'Stacked Area',
        authoringMode: 'native',
        chartType: 'area',
        dataShape: 'time trend with cumulative contribution',
        requiredFields: ['labels', 'values'],
        useWhen: ['Show cumulative volume and changing contribution over time.', 'Use for capacity, pipeline, or audience mix over periods.'],
        avoidWhen: ['Avoid for many overlapping series or exact comparisons.'],
        tags: ['trend', 'time', 'composition', 'area', 'stacked'],
        optionDefaults: { barGrouping: 'stacked', showLegend: true, showTitle: true, chartColorsOpacity: 72 },
        sampleData: trendSeries(),
        fidelityNote: 'Native areaChart with stacked grouping.',
        rank: 7,
    },
    {
        id: 'pie-simple',
        title: 'Pie',
        powerPointCategory: 'Pie',
        powerPointPreset: 'Pie',
        authoringMode: 'native',
        chartType: 'pie',
        dataShape: 'single series part-to-whole share',
        requiredFields: ['labels', 'values'],
        useWhen: ['Show a simple part-to-whole split with few categories.', 'Use when the total is obvious and categories are mutually exclusive.'],
        avoidWhen: ['Avoid for more than five or six slices; use doughnut, bar, or treemap.'],
        tags: ['share', 'part-to-whole', 'composition', 'pie'],
        optionDefaults: { showLegend: true, showTitle: true, showValue: true, showLabel: true, dataLabelPosition: 'bestFit' },
        sampleData: shareSeries(),
        fidelityNote: 'Native pieChart.',
        rank: 6,
    },
    {
        id: 'doughnut-share',
        title: 'Doughnut share',
        powerPointCategory: 'Pie',
        powerPointPreset: 'Doughnut',
        authoringMode: 'native',
        chartType: 'doughnut',
        dataShape: 'single series part-to-whole share with center annotation space',
        requiredFields: ['labels', 'values'],
        useWhen: ['Show share while leaving room for a center KPI label.', 'Use in executive dashboards and compact KPI cards.'],
        avoidWhen: ['Avoid when exact slice comparison is critical.'],
        tags: ['share', 'part-to-whole', 'composition', 'doughnut', 'dashboard', 'kpi'],
        optionDefaults: { showLegend: true, showTitle: true, showValue: true, holeSize: 62 },
        sampleData: shareSeries(),
        fidelityNote: 'Native doughnutChart with hole size.',
        rank: 3,
    },
    {
        id: 'scatter-correlation',
        title: 'Scatter correlation',
        powerPointCategory: 'X Y (Scatter)',
        powerPointPreset: 'Scatter with Straight Lines and Markers',
        authoringMode: 'native',
        chartType: 'scatter',
        dataShape: 'numeric x values plus one or more numeric y series',
        requiredFields: ['xValues', 'yValues'],
        useWhen: ['Show relationship, correlation, outliers, or measured x/y observations.'],
        avoidWhen: ['Avoid for categorical x axes; use line or column.'],
        tags: ['correlation', 'relationship', 'xy', 'scatter', 'outlier', 'numeric', 'risk', 'market'],
        optionDefaults: { showLegend: true, showTitle: true, lineDataSymbol: 'circle', lineDataSymbolSize: 6, lineSize: 1.5 },
        sampleData: xySeries(),
        fidelityNote: 'Native scatterChart. Data expects first series as X values and following series as Y values.',
        rank: 4,
    },
    {
        id: 'bubble-portfolio',
        title: 'Bubble portfolio',
        powerPointCategory: 'X Y (Scatter)',
        powerPointPreset: 'Bubble',
        authoringMode: 'native',
        chartType: 'bubble',
        dataShape: 'numeric x/y values plus bubble sizes',
        requiredFields: ['xValues', 'yValues', 'sizes'],
        useWhen: ['Compare three numeric dimensions, such as risk, return, and size.', 'Use for portfolio or market maps.'],
        avoidWhen: ['Avoid when bubble area would imply false precision.'],
        tags: ['correlation', 'portfolio', 'risk', 'return', 'size', 'bubble'],
        optionDefaults: { showLegend: true, showTitle: true },
        sampleData: bubbleSeries(),
        fidelityNote: 'Native bubbleChart with sizes arrays.',
        rank: 9,
    },
    {
        id: 'radar-filled-capability',
        title: 'Filled radar capability profile',
        powerPointCategory: 'Radar',
        powerPointPreset: 'Filled Radar',
        authoringMode: 'native',
        chartType: 'radar',
        dataShape: 'multivariate score profile on shared dimensions',
        requiredFields: ['labels', 'values'],
        useWhen: ['Compare capability, maturity, feature coverage, or balanced-scorecard dimensions.', 'Use for the Radar picker specimen shown in PowerPoint.'],
        avoidWhen: ['Avoid for unrelated metrics with different scales.'],
        tags: ['radar', 'capability', 'maturity', 'scorecard', 'multivariate', 'coverage'],
        optionDefaults: { radarStyle: 'filled', showLegend: true, showTitle: true },
        sampleData: [
            { name: 'Current', labels: ['Design', 'Charts', 'Motion', 'Media', '3D'], values: [9, 8.5, 9, 8, 7.5] },
            { name: 'Target', labels: ['Design', 'Charts', 'Motion', 'Media', '3D'], values: [8, 8, 8, 8, 8] },
        ],
        fidelityNote: 'Native radarChart with radarStyle=filled.',
        rank: 10,
    },
    {
        id: 'combo-column-line-dual-axis',
        title: 'Column plus line combo',
        powerPointCategory: 'Combo',
        powerPointPreset: 'Clustered Column - Line on Secondary Axis',
        authoringMode: 'native-composite',
        chartTypes: ['bar', 'line'],
        dataShape: 'two measures with different units or scales over the same categories',
        requiredFields: ['labels', 'barValues', 'lineValues'],
        useWhen: ['Combine volume and rate, revenue and margin, or actual and target on one plot.', 'Best default for executive chart dashboards.'],
        avoidWhen: ['Avoid when the second axis would confuse the story.'],
        tags: ['combo', 'dashboard', 'executive', 'dual-axis', 'bar-line', 'volume-rate'],
        optionDefaults: { showLegend: true, showTitle: true },
        sampleData: trendSeries(),
        fidelityNote: 'Native multi-type chart using bar and line chart definitions in one plot area.',
        rank: 2,
    },
    {
        id: 'treemap-hierarchy',
        title: 'Treemap hierarchy',
        powerPointCategory: 'Treemap',
        powerPointPreset: 'Treemap',
        authoringMode: 'native',
        chartType: 'treemap',
        dataShape: 'hierarchical part-to-whole values',
        requiredFields: ['label', 'parent', 'value'],
        useWhen: ['Show hierarchical contribution or portfolio composition.', 'Use as the best native new-authoring choice for nested part-to-whole values.'],
        avoidWhen: ['Avoid when exact comparisons or trends matter.'],
        tags: ['treemap', 'hierarchy', 'portfolio', 'composition', 'share', 'chartEx', 'native'],
        fidelityNote: 'Native ChartEx treemap authoring; roundtrip reference ChartEx is preserved exactly.',
        rank: 6,
    },
    {
        id: 'sunburst-hierarchy',
        title: 'Sunburst hierarchy',
        powerPointCategory: 'Sunburst',
        powerPointPreset: 'Sunburst',
        authoringMode: 'native',
        chartType: 'sunburst',
        dataShape: 'two or more hierarchy levels with part-to-whole values',
        requiredFields: ['label', 'parent', 'value'],
        useWhen: ['Show hierarchy depth and share in a compact radial view.'],
        avoidWhen: ['Avoid for dense labels or analytical precision.'],
        tags: ['sunburst', 'hierarchy', 'radial', 'composition', 'chartEx', 'native'],
        fidelityNote: 'Native ChartEx sunburst authoring; roundtrip reference ChartEx is preserved exactly.',
        rank: 15,
    },
    {
        id: 'histogram-distribution',
        title: 'Histogram distribution',
        powerPointCategory: 'Histogram',
        powerPointPreset: 'Histogram',
        authoringMode: 'native',
        chartType: 'histogram',
        dataShape: 'binned numeric frequency distribution',
        requiredFields: ['bins', 'frequencies'],
        useWhen: ['Show distribution, frequency, quality spread, or volume by bin.'],
        avoidWhen: ['Avoid for category comparison; use column or bar.'],
        tags: ['histogram', 'distribution', 'frequency', 'bins', 'quality', 'chartEx', 'native'],
        fidelityNote: 'Native ChartEx histogram authoring; roundtrip reference ChartEx is preserved exactly.',
        rank: 9,
    },
    {
        id: 'pareto-priority',
        title: 'Pareto priority',
        powerPointCategory: 'Histogram',
        powerPointPreset: 'Pareto',
        authoringMode: 'native',
        chartType: 'pareto',
        dataShape: 'categories ordered by frequency or impact with cumulative percentage',
        requiredFields: ['categories', 'values'],
        useWhen: ['Prioritize the vital few causes, defects, segments, or drivers.', 'Use for quality analysis and operational root-cause summaries.'],
        avoidWhen: ['Avoid when categories have no meaningful descending priority.'],
        tags: ['pareto', 'histogram', 'priority', 'quality', 'cumulative', 'chartEx', 'native'],
        fidelityNote: 'Native ChartEx Pareto authoring with clusteredColumn plus paretoLine layout ids.',
        rank: 8,
    },
    {
        id: 'box-whisker-distribution',
        title: 'Box and whisker distribution',
        powerPointCategory: 'Box & Whisker',
        powerPointPreset: 'Box & Whisker',
        authoringMode: 'native',
        chartType: 'boxWhisker',
        dataShape: 'quartiles, median, whiskers, and outliers',
        requiredFields: ['min', 'q1', 'median', 'q3', 'max'],
        useWhen: ['Compare spread, median, and outliers across groups.'],
        avoidWhen: ['Avoid when the audience is unfamiliar with quartile notation.'],
        tags: ['box', 'whisker', 'distribution', 'quartile', 'outlier', 'chartEx', 'native'],
        fidelityNote: 'Native ChartEx boxWhisker authoring; roundtrip reference ChartEx is preserved exactly.',
        rank: 14,
    },
    {
        id: 'waterfall-bridge',
        title: 'Waterfall bridge',
        powerPointCategory: 'Waterfall',
        powerPointPreset: 'Waterfall',
        authoringMode: 'native',
        chartType: 'waterfall',
        dataShape: 'starting value, positive/negative deltas, ending value',
        requiredFields: ['labels', 'deltas'],
        useWhen: ['Explain drivers from start to finish, such as revenue bridge, cost bridge, or margin bridge.'],
        avoidWhen: ['Avoid for independent categories.'],
        tags: ['waterfall', 'bridge', 'delta', 'variance', 'finance', 'chartEx', 'native'],
        fidelityNote: 'Native ChartEx waterfall authoring; roundtrip reference ChartEx is preserved exactly.',
        rank: 5,
    },
    {
        id: 'funnel-conversion',
        title: 'Funnel conversion',
        powerPointCategory: 'Funnel',
        powerPointPreset: 'Funnel',
        authoringMode: 'native',
        chartType: 'funnel',
        dataShape: 'ordered stage values that narrow through a process',
        requiredFields: ['stages', 'values'],
        useWhen: ['Show pipeline, conversion, retention, recruiting, or process drop-off.'],
        avoidWhen: ['Avoid when stages are not sequential.'],
        tags: ['funnel', 'pipeline', 'conversion', 'sales', 'retention', 'process', 'chartEx', 'native'],
        fidelityNote: 'Native ChartEx funnel authoring; roundtrip reference ChartEx is preserved exactly.',
        rank: 4,
    },
    {
        id: 'stock-ohlc',
        title: 'Stock OHLC',
        powerPointCategory: 'Stock',
        powerPointPreset: 'Open-High-Low-Close',
        authoringMode: 'shape-built',
        shapeBuiltVisual: 'candlestick',
        dataShape: 'open, high, low, close values by period',
        requiredFields: ['open', 'high', 'low', 'close'],
        useWhen: ['Show market price movement, OHLC, or candlestick-style ranges.'],
        avoidWhen: ['Avoid for non-financial audiences unless ranges are explained.'],
        tags: ['stock', 'ohlc', 'candlestick', 'finance', 'range', 'shape-built'],
        fidelityNote: 'New authoring uses editable lines and candle bodies; native stock chart parts are preserve-only on roundtrip.',
        rank: 17,
    },
    {
        id: 'surface-heatmap',
        title: 'Surface heatmap',
        powerPointCategory: 'Surface',
        powerPointPreset: '3-D Surface / Contour substitute',
        authoringMode: 'shape-built',
        shapeBuiltVisual: 'heatmap-surface',
        dataShape: 'matrix values across two categorical or numeric dimensions',
        requiredFields: ['xLabels', 'yLabels', 'matrix'],
        useWhen: ['Show matrix intensity, scenario grid, or contour-like surfaces.', 'Use as the safest new-authoring substitute for PowerPoint Surface charts.'],
        avoidWhen: ['Avoid when a true 3-D surface mesh is required; preserve a native reference chart instead.'],
        tags: ['surface', 'heatmap', 'matrix', 'contour', '3d-surface', 'shape-built'],
        fidelityNote: 'New authoring uses editable heatmap/grid shapes; native surface chart parts are preserve-only on roundtrip.',
        rank: 18,
    },
    {
        id: 'map-region-choropleth',
        title: 'Map region choropleth',
        powerPointCategory: 'Map',
        powerPointPreset: 'Filled Map',
        authoringMode: 'native',
        chartType: 'regionMap',
        dataShape: 'region labels plus values',
        requiredFields: ['region', 'value'],
        useWhen: ['Show geography, territory performance, regional risk, or route context.', 'Use when a PowerPoint Filled Map chart is appropriate.'],
        avoidWhen: ['Avoid when geocoding or exact GIS boundaries are required without a reference dataset.'],
        tags: ['map', 'geography', 'region', 'territory', 'choropleth', 'worldMap', 'chartEx', 'native'],
        fidelityNote: 'Native ChartEx regionMap authoring; exact geocoding fidelity still depends on PowerPoint/Bing map resolution.',
        rank: 11,
    },
];
const INTENT_TAG_RULES = [
    { pattern: /\b(compare|comparison|rank|ranking|category|categories|region|product|quarter|cluster)\b/i, tags: ['comparison', 'category'], reason: 'category comparison language' },
    { pattern: /\b(trend|time|timeline|forecast|growth|run rate|monthly|weekly|year|over time)\b/i, tags: ['trend', 'time'], reason: 'trend/time-series language' },
    { pattern: /\b(share|mix|composition|part.to.whole|percent|percentage|portion)\b/i, tags: ['share', 'composition', 'part-to-whole'], reason: 'part-to-whole language' },
    { pattern: /\b(correlation|relationship|scatter|x.?y|outlier|portfolio|risk|return)\b/i, tags: ['correlation', 'portfolio', 'numeric'], reason: 'relationship/correlation language' },
    { pattern: /\b(hierarchy|breakdown|tree|treemap|nested|portfolio composition)\b/i, tags: ['hierarchy', 'treemap'], reason: 'hierarchy language' },
    { pattern: /\b(distribution|frequency|histogram|bins?|quartile|outlier|spread)\b/i, tags: ['distribution', 'histogram'], reason: 'distribution language' },
    { pattern: /\b(funnel|pipeline|conversion|drop.?off|retention|stage)\b/i, tags: ['funnel', 'pipeline', 'conversion'], reason: 'funnel/process language' },
    { pattern: /\b(waterfall|bridge|variance|delta|driver|reconciliation)\b/i, tags: ['waterfall', 'bridge', 'delta'], reason: 'bridge/variance language' },
    { pattern: /\b(stock|ohlc|candlestick|open high low close|market price)\b/i, tags: ['stock', 'ohlc', 'candlestick'], reason: 'stock/OHLC language' },
    { pattern: /\b(surface|heatmap|matrix|contour|scenario grid)\b/i, tags: ['surface', 'heatmap', 'matrix'], reason: 'surface/matrix language' },
    { pattern: /\b(map|geography|territory|region|country|route|choropleth)\b/i, tags: ['map', 'geography', 'worldMap'], reason: 'geographic language' },
    { pattern: /\b(radar|capability|maturity|scorecard|multivariate|coverage)\b/i, tags: ['radar', 'capability', 'scorecard'], reason: 'multivariate profile language' },
    { pattern: /\b(executive|dashboard|board|kpi|operating review|investor)\b/i, tags: ['dashboard', 'executive', 'kpi'], reason: 'executive/dashboard language' },
];
function normalizeText(value) {
    return String(value || '').toLowerCase();
}
function presetHaystack(preset) {
    return [
        preset.id,
        preset.title,
        preset.powerPointCategory,
        preset.powerPointPreset,
        preset.authoringMode,
        preset.chartType || '',
        ...(preset.chartTypes || []),
        preset.shapeBuiltVisual || '',
        preset.dataShape,
        ...preset.requiredFields,
        ...preset.useWhen,
        ...preset.tags,
    ].join(' ').toLowerCase();
}
function queryTerms(query) {
    const stop = new Set(['and', 'with', 'for', 'the', 'that', 'this', 'into', 'from', 'showing', 'show', 'executive', 'dashboard']);
    return normalizeText(query).split(/[^a-z0-9+-]+/).filter(term => term.length > 2 && !stop.has(term));
}
function inferredTags(query) {
    const out = [];
    for (const rule of INTENT_TAG_RULES) {
        if (rule.pattern.test(query)) {
            for (const tag of rule.tags)
                out.push({ tag, reason: rule.reason });
        }
    }
    return out;
}
function budgetTags(budget) {
    const tags = [];
    if ((budget === null || budget === void 0 ? void 0 : budget.chartRichness) === 'executive-dashboard') {
        tags.push({ tag: 'executive', reason: 'executive-dashboard chart richness' }, { tag: 'combo', reason: 'executive-dashboard chart richness' }, { tag: 'funnel', reason: 'executive-dashboard chart richness' }, { tag: 'waterfall', reason: 'executive-dashboard chart richness' });
    }
    if ((budget === null || budget === void 0 ? void 0 : budget.chartRichness) === 'hybrid') {
        tags.push({ tag: 'shape-built', reason: 'hybrid chart richness allows shape-built analytical visuals' });
    }
    if ((budget === null || budget === void 0 ? void 0 : budget.chartRichness) === 'native') {
        tags.push({ tag: 'native', reason: 'native chart richness requested' });
    }
    for (const feature of (budget === null || budget === void 0 ? void 0 : budget.requireFeatures) || []) {
        const normalized = normalizeText(feature);
        if (normalized.includes('chart'))
            tags.push({ tag: 'dashboard', reason: `required feature: ${feature}` });
        if (normalized.includes('map'))
            tags.push({ tag: 'map', reason: `required feature: ${feature}` });
    }
    return tags;
}
export function chartPresetById(id) {
    return CHART_PRESET_CATALOG.find(preset => preset.id === id);
}
export function listChartPresets(args = {}) {
    const category = normalizeText(args === null || args === void 0 ? void 0 : args.category);
    const mode = normalizeText((args === null || args === void 0 ? void 0 : args.authoringMode) || (args === null || args === void 0 ? void 0 : args.mode));
    const query = normalizeText(args === null || args === void 0 ? void 0 : args.query);
    const terms = queryTerms(query);
    const limit = Math.max(1, Math.min(Number((args === null || args === void 0 ? void 0 : args.limit) || CHART_PRESET_CATALOG.length), CHART_PRESET_CATALOG.length));
    return CHART_PRESET_CATALOG
        .filter(preset => !category || normalizeText(preset.powerPointCategory) === category || preset.tags.includes(category))
        .filter(preset => !mode || preset.authoringMode === mode)
        .map(preset => ({ preset, text: presetHaystack(preset) }))
        .filter(item => !terms.length || terms.some(term => item.text.includes(term)))
        .sort((a, b) => a.preset.rank - b.preset.rank || a.preset.id.localeCompare(b.preset.id))
        .map(item => item.preset)
        .slice(0, limit);
}
export function recommendChartPresets(query = '', budget = {}, args = {}) {
    const combinedQuery = [
        query,
        args === null || args === void 0 ? void 0 : args.chartIntent,
        args === null || args === void 0 ? void 0 : args.intent,
        args === null || args === void 0 ? void 0 : args.dataShape,
        args === null || args === void 0 ? void 0 : args.category,
        Array.isArray(args === null || args === void 0 ? void 0 : args.requireFeatures) ? args.requireFeatures.join(' ') : '',
    ].filter(Boolean).join(' ');
    const terms = queryTerms(combinedQuery);
    const tagHints = [...inferredTags(combinedQuery), ...budgetTags(budget)];
    const explicitPreset = (args === null || args === void 0 ? void 0 : args.chartPresetId) ? chartPresetById(String(args.chartPresetId)) : undefined;
    const explicitType = normalizeNativeChartType(args === null || args === void 0 ? void 0 : args.chartType);
    const explicitCategory = normalizeText(args === null || args === void 0 ? void 0 : args.category);
    const explicitMode = normalizeText((args === null || args === void 0 ? void 0 : args.authoringMode) || (args === null || args === void 0 ? void 0 : args.mode));
    const dataShape = normalizeText(args === null || args === void 0 ? void 0 : args.dataShape);
    return CHART_PRESET_CATALOG
        .filter(preset => !explicitPreset || preset.id === explicitPreset.id)
        .filter(preset => !explicitType || [preset.chartType, ...(preset.chartTypes || [])].map(type => normalizeNativeChartType(type)).includes(explicitType))
        .filter(preset => !explicitCategory || normalizeText(preset.powerPointCategory) === explicitCategory || preset.tags.includes(explicitCategory))
        .filter(preset => !explicitMode || preset.authoringMode === explicitMode)
        .map(preset => {
        const text = presetHaystack(preset);
        const selectionReason = [];
        let score = combinedQuery ? Math.max(0, 8 - Math.floor(preset.rank / 4)) : Math.max(0, 22 - preset.rank);
        for (const term of terms) {
            if (text.includes(term)) {
                score += term.length > 5 ? 3 : 1;
                if (selectionReason.length < 4)
                    selectionReason.push(`matched "${term}"`);
            }
        }
        for (const hint of tagHints) {
            if (preset.tags.includes(hint.tag) || text.includes(hint.tag)) {
                score += hint.tag === 'shape-built' && preset.authoringMode !== 'shape-built' ? 1 : 6;
                if (!selectionReason.includes(hint.reason))
                    selectionReason.push(hint.reason);
            }
        }
        if (dataShape && text.includes(dataShape)) {
            score += 8;
            selectionReason.push(`fits data shape: ${dataShape}`);
        }
        if ((budget === null || budget === void 0 ? void 0 : budget.chartRichness) === 'native' && preset.authoringMode === 'native')
            score += 5;
        if ((budget === null || budget === void 0 ? void 0 : budget.chartRichness) === 'hybrid' && preset.authoringMode !== 'native')
            score += 3;
        if ((budget === null || budget === void 0 ? void 0 : budget.chartRichness) === 'executive-dashboard' && ['native-composite', 'shape-built'].includes(preset.authoringMode))
            score += 5;
        if (!combinedQuery && ['column-clustered', 'line-trend', 'doughnut-share', 'combo-column-line-dual-axis'].includes(preset.id)) {
            score += 8;
            selectionReason.push('strong general-purpose default');
        }
        if (!selectionReason.length)
            selectionReason.push('balanced default chart preset');
        return { preset, score, selectionReason };
    })
        .filter(item => item.score > (combinedQuery ? 8 : 0))
        .sort((a, b) => b.score - a.score || a.preset.rank - b.preset.rank || a.preset.id.localeCompare(b.preset.id));
}
//# sourceMappingURL=chart-presets.js.map