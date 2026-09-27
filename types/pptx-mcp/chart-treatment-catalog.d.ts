export interface ChartTreatmentPreset {
    id: string;
    title: string;
    family: string;
    optionSet: string;
    comChartType: number;
    semanticType: string | null;
    expectedChartTag: string;
    dataShape: string;
    notes: string;
    referenceSpecimen: string;
    referenceSlide: number;
    referenceChartPath: string;
    referencePackagePath: string;
    packageSha256: string;
    chartXmlSha256: string;
    provenance: 'frozen-com-matrix';
    serializationStatus: 'reference-backed-treatment';
}
export declare const CHART_TREATMENT_PRESETS: ReadonlyArray<ChartTreatmentPreset>;
export declare function listChartTreatmentPresets(args?: {
    chartType?: string | number;
    optionSet?: string;
    limit?: number;
}): ChartTreatmentPreset[];
