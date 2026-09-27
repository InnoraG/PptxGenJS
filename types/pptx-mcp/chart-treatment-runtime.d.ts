import { type ChartTreatmentPreset } from './chart-treatment-catalog.js';
/**
 * Runtime-facing treatment metadata.  The generated catalog remains the
 * immutable evidence source; this module is the small product adapter that
 * turns those rows into safe, executable chart options.
 */
export interface ChartTreatmentRuntime {
    readonly preset: ChartTreatmentPreset;
    readonly optionDefaults: Record<string, unknown>;
    readonly support: 'native' | 'native-partial' | 'preserve-only';
    readonly unsupportedFeatures: readonly string[];
}
export declare function chartTreatmentPresetById(id: string): ChartTreatmentRuntime | undefined;
export declare function publicChartTreatmentPreset(runtime: ChartTreatmentRuntime): Record<string, unknown>;
export declare function listPublicChartTreatmentPresets(args?: {
    chartType?: string | number;
    optionSet?: string;
    limit?: number;
}): Record<string, unknown>[];
