export type CoverageMode = 'native' | 'native-plus-preserve' | 'native-chart' | 'native-composite' | 'shape-built-chart' | 'preserve-only' | 'validate-only' | 'detect-and-reject';
export interface CapabilityLedgerRow {
    featureId: string;
    category: string;
    publicName: string;
    coverageMode: CoverageMode;
    mcpTool: string;
    showcaseSlide: string;
    validationOracle: string[];
    lightDarkStable: boolean;
    implemented: boolean;
    requiredForCompletion: boolean;
}
export interface CapabilityLedger {
    brand: string;
    generatedAt: string;
    version: string;
    rows: CapabilityLedgerRow[];
    summary: CapabilityLedgerSummary;
}
export interface CapabilityLedgerSummary {
    totalRows: number;
    requiredRows: number;
    implementedRows: number;
    lightDarkStableRows: number;
    byCategory: Record<string, number>;
    byCoverageMode: Record<CoverageMode, number>;
    completionReady: boolean;
}
export interface AppliedSpecimenRecord {
    featureId: string;
    category: string;
    slideKey: string;
    slideTitle: string;
    objectName?: string;
    slideTransition?: string;
    appliedKind: string;
    coverageMode: CoverageMode;
    mcpTool: string;
    validationOracle: string[];
    lightDarkStable: boolean;
    notes?: string;
    animationApplied?: boolean;
}
export declare const BETTERPPTX_MCP_CAPABILITY_LEDGER_VERSION = "2026-05-24.live-labs-v2";
export declare const WORD_ART_TRANSFORMS: string[];
export declare const TRANSITION_TYPES: string[];
export declare const MORPH_OPTIONS: string[];
export declare const MOTION_PATHS: string[];
export declare function buildCapabilityLedger(capabilities?: any, brand?: string): CapabilityLedger;
export declare function summarizeRows(rows: CapabilityLedgerRow[]): CapabilityLedgerSummary;
export declare function buildCoverageReport(ledger: CapabilityLedger, artifacts?: string[], appliedSpecimens?: AppliedSpecimenRecord[]): any;
export declare function ledgerSemanticHash(ledger: CapabilityLedger): string;
