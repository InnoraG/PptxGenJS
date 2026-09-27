export type ChartEvidenceStatus = 'matrix-reference' | 'type-specific-capture-pending' | 'type-specific-ui-captured';
export interface ChartTypeRecord {
    id: string;
    family: string;
    name: string;
    comChartType: number;
    expectedChartTag: string;
    semanticType: string;
    chartEx: boolean;
    chartExLayout: string | null;
    shape: string;
    direction: string | null;
    dataShape: string;
    referenceSpecimen: string;
    packageEvidence: 'matrix-reference';
    ribbonEvidence: ChartEvidenceStatus;
    optionSet: string;
}
export interface ChartOptionRecord {
    id: string;
    family: string;
    name: string;
    comChartType: number;
    expectedChartTag: string;
    optionSet: string;
    dataShape: string;
    notes: string;
}
export declare const CHART_TYPE_REGISTRY: ReadonlyArray<ChartTypeRecord>;
export declare const CHART_OPTION_REGISTRY: ReadonlyArray<ChartOptionRecord>;
export declare const CHART_TYPE_REGISTRY_COUNTS: Readonly<{
    baseChartTypes: 85;
    optionSpecimens: 48;
    totalSpecimens: 133;
    chartExSemantics: 8;
}>;
export declare function chartTypeRecordById(id: string): ChartTypeRecord | undefined;
export declare function chartTypeRecordsForSemantic(semanticType: string): ChartTypeRecord[];
export declare function chartTypeRecordsForFamily(family: string): ChartTypeRecord[];
