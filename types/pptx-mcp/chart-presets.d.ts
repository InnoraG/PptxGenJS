import type { FeatureBudget } from './types.js';
import { CHART_TREATMENT_PRESETS, listChartTreatmentPresets } from './chart-treatment-catalog.js';
export { CHART_TREATMENT_PRESETS, listChartTreatmentPresets };
export type ChartPresetMode = 'native' | 'native-composite' | 'shape-built';
export interface ChartPreset {
    id: string;
    title: string;
    powerPointCategory: string;
    powerPointPreset: string;
    authoringMode: ChartPresetMode;
    chartType?: string;
    chartTypes?: string[];
    shapeBuiltVisual?: string;
    dataShape: string;
    requiredFields: string[];
    useWhen: string[];
    avoidWhen: string[];
    tags: string[];
    optionDefaults?: Record<string, unknown>;
    sampleData?: unknown[];
    fidelityNote: string;
    rank: number;
}
/**
 * Exact Office Chart Design gallery state captured from PowerPoint COM/UI.
 *
 * These are deliberately separate from semantic chart presets: the semantic
 * preset chooses the chart family and data story, while this catalog chooses
 * the native Office style/color state to apply through `chartGalleryVariant`.
 */
export type ChartFamilyScope = 'legacy-and-chartex' | 'legacy-only' | 'chartex-only' | 'package-observed';
export interface ChartStylePreset {
    id: string;
    title: string;
    powerPointCategory: 'Chart Design';
    powerPointPreset: string;
    authoringMode: 'native';
    chartGalleryVariant: number;
    chartStyleId: number;
    chartStyleModernId?: number;
    legacyFallbackStyleId?: number;
    chartFamilyScope: ChartFamilyScope;
    /** Runtime chart families observed carrying this exact package preset. */
    supportedChartTypes: string[];
    /** Exact matrix specimen ids observed carrying the package resource. */
    packageObservedChartParts: string[];
    /** Raw XML tags observed carrying the package resource. */
    packageObservedChartTags: string[];
    /** Per-type Ribbon evidence; this is independent of package-resource applicability. */
    ribbonEvidenceByChartType: Record<string, 'type-specific-capture-pending' | 'type-specific-ui-captured'>;
    /** Per-type Chart Colors and Quick Layout evidence are tracked separately. */
    colorEvidenceByChartType: Record<string, 'type-specific-capture-pending' | 'type-specific-ui-captured'>;
    layoutEvidenceByChartType: Record<string, 'type-specific-capture-pending' | 'type-specific-ui-captured'>;
    /** Package/UI provenance; visible Ribbon tile counts are exposed by listChartGalleryUiPresets. */
    evidenceStatus: 'package-captured' | 'ui-captured' | 'package-captured-ui-pending';
    styleFamilyId: number;
    colorFamilyId: number;
    optionDefaults: {
        chartGalleryVariant: number;
    };
    tags: string[];
    fidelityNote: string;
}
/**
 * A concrete, chart-type-specific Ribbon tile state captured from PowerPoint.
 * This is intentionally separate from ChartStylePreset: a package style/color
 * resource can be reused by many chart families, while a Ribbon gallery tile
 * is an observed UI state with its own applicability and rendered provenance.
 */
export interface ChartGalleryTilePreset {
    id: string;
    title: string;
    chartType: string;
    chartTypeCom: number;
    chartFamily: string | null;
    galleryKind: 'styles' | 'colors' | 'layouts';
    tileIndex: number;
    row: number;
    column: number;
    nativeStyleId: number | null;
    nativeColorId: number | null;
    renderedHash: string;
    screenshot: string;
    packageSha256?: string | null;
    chartXmlSha256?: string | null;
    /** Exact chart part selected for this tile inside the provenance bundle. */
    selectedChartXmlSha256?: string | null;
    chartXmlPath?: string | null;
    bundleSlide?: number | null;
    layoutId?: number | null;
    packageReplay?: 'bundle-com' | 'headless-com' | 'ui' | null;
    packagePath?: string | null;
    packageError?: string | null;
    serializationStatus: 'package-backed' | 'native-engine' | 'ui-only';
    manifest: string;
    referencePptx: string;
    tags: string[];
}
export interface RecommendedChartPreset {
    preset: ChartPreset;
    score: number;
    selectionReason: string[];
}
export declare const NATIVE_CHART_TYPES: string[];
/**
 * All 49 style/color resource combinations present in the PowerPoint-authored
 * chart COM matrix. The first 48 also have legacy ChartStyle read-back IDs;
 * variant 49 is a ChartEx gallery resource without a legacy c:style ID.
 */
export declare const CHART_STYLE_PRESET_CATALOG: ReadonlyArray<ChartStylePreset>;
export declare function chartStylePresetById(id: string): ChartStylePreset | undefined;
/** Resolve one exact chart-type-specific Ribbon tile by its opaque id. */
export declare function chartGalleryTilePresetById(id: string, args?: {
    chartType?: string;
    galleryKind?: 'styles' | 'colors' | 'layouts';
}): ChartGalleryTilePreset | undefined;
/**
 * Public-safe tile metadata.  Package paths, local manifests, screenshots and
 * XML hashes remain implementation/provenance details and never cross the
 * product boundary.  The opaque id is sufficient for the authoring resolver.
 */
export declare function publicChartGalleryTilePreset(tile: ChartGalleryTilePreset): Record<string, unknown>;
export declare function publicChartStylePreset(preset: ChartStylePreset): Record<string, unknown>;
export declare function listChartGalleryUiPresets(args?: any): ChartGalleryTilePreset[];
export declare function listChartStylePresets(args?: any): ChartStylePreset[];
export declare function chartStyleCoverageByType(chartType?: string): {
    chartType: string;
    matrixSpecimens: number;
    packageObservedPresets: number;
    typeSpecificRibbonCaptured: number;
    typeSpecificRibbonPending: number;
    typeSpecificUiTileEvidence: {
        styles: number;
        colors: number;
        layouts: number;
    };
}[];
export declare function normalizeNativeChartType(value: unknown): string | null;
export declare const CHART_PRESET_CATALOG: ChartPreset[];
export declare function chartPresetById(id: string): ChartPreset | undefined;
export declare function listChartPresets(args?: any): ChartPreset[];
export declare function recommendChartPresets(query?: string, budget?: Partial<FeatureBudget>, args?: any): RecommendedChartPreset[];
