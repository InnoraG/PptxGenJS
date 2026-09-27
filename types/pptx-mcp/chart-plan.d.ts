import { type ChartGalleryTilePreset } from './chart-presets.js';
export interface ChartPlanRequest {
    chartPresetId?: string;
    chartType?: string;
    chartGalleryTilePresetId?: string;
    chartStylePresetId?: string;
    chartGalleryVariant?: number;
    chartStyleId?: number;
    chartStyleModernId?: number;
    chartColorStyleId?: number;
    chartLayoutPresetId?: string;
    chartTreatmentPresetId?: string;
    chartTreatmentPresetIds?: string[];
}
export interface ResolvedChartPlan {
    chartPresetId?: string;
    chartType?: string;
    chartGalleryTilePresetId?: string;
    chartStylePresetId?: string;
    chartGalleryVariant?: number;
    chartStyleId?: number;
    chartStyleModernId?: number;
    chartColorStyleId?: number;
    chartLayoutPresetId?: string;
    chartTreatmentPresetId?: string;
    chartTreatmentPresetIds?: string[];
    /** Captured native style ids used by generated, data-authoritative charts. */
    showTitle?: boolean;
    showLegend?: boolean;
    legendPos?: 'b' | 'l' | 'r' | 't' | 'tr';
    showValue?: boolean;
    /** Internal package replay fields consumed by the chart serializer only. */
    _rawChartXml?: string;
    _rawChartRelsXml?: string;
    _rawChartWorkbookBase64?: string;
    _rawChartWorkbookName?: string;
    _rawChartStyleXml?: string;
    _rawChartStyleName?: string;
    _rawChartColorsXml?: string;
    _rawChartColorsName?: string;
    /** Internal visual fallback for ChartEx families whose native renderer is incomplete. */
    _rawChartFallbackImageBase64?: string;
    _rawChartFallbackImageContentType?: string;
}
export interface ChartPlanResolution {
    plan: ResolvedChartPlan;
    tile?: ChartGalleryTilePreset;
    mode: 'native-style' | 'native-color' | 'gallery-package-replay' | 'none';
}
/** Resolve the same chart plan for direct-code and MCP authoring. */
export declare function resolveChartPlan(request: ChartPlanRequest, repoRoot: string): Promise<ChartPlanResolution>;
