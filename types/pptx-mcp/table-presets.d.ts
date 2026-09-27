import type { FeatureBudget } from './types.js';
import { POWERPOINT_TABLE_STYLE_CATALOG, type PowerPointTableStylePreset } from './table-style-catalog.js';
export type TablePresetMode = 'native-table' | 'visual-adapted' | 'preserve-only';
export interface TableStyleOptions {
    headerRow?: boolean;
    totalRow?: boolean;
    bandedRows?: boolean;
    firstColumn?: boolean;
    lastColumn?: boolean;
    bandedColumns?: boolean;
    tableStyleId?: string;
    /** Opaque executable catalog id; resolved to the native GUID by the engine. */
    tableStylePresetId?: string;
}
export interface TablePreset {
    id: string;
    title: string;
    powerPointCategory: string;
    powerPointPreset: string;
    authoringMode: TablePresetMode;
    tableIntent: string;
    dataShape: string;
    requiredStructure: string[];
    useWhen: string[];
    avoidWhen: string[];
    tags: string[];
    tableStyleOptions: TableStyleOptions;
    optionDefaults: Record<string, unknown>;
    cellStyleRecipe: Record<string, unknown>;
    layoutGuardrails: Record<string, unknown>;
    sampleRows: unknown[][];
    fidelityNote: string;
    rank: number;
}
export interface RecommendedTablePreset {
    preset: TablePreset;
    score: number;
    selectionReason: string[];
}
export declare const DEFAULT_POWERPOINT_TABLE_STYLE_ID = "{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}";
export declare const POWERPOINT_TABLE_STYLE_OPTIONS: string[];
export { POWERPOINT_TABLE_STYLE_CATALOG };
export type { PowerPointTableStylePreset };
export declare function tableStyleByPublicId(id: string): PowerPointTableStylePreset | undefined;
export declare function tableStyleByNativeId(id: string): PowerPointTableStylePreset | undefined;
export declare function resolveTableStylePreset(value: unknown): PowerPointTableStylePreset | undefined;
export declare function listPowerPointTableStyles(args?: any): PowerPointTableStylePreset[];
export declare const TABLE_PRESET_CATALOG: TablePreset[];
export declare function tablePresetById(id: string): TablePreset | undefined;
export declare function listTablePresets(args?: any): TablePreset[];
export declare function recommendTablePresets(query?: string, budget?: Partial<FeatureBudget>, args?: any): RecommendedTablePreset[];
