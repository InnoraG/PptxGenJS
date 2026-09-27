export interface ReferenceGate {
    minSlides?: number;
    minTimingNodes?: number;
    minMotionNodes?: number;
    minMediaCommands?: number;
    minWordArtWarps?: number;
    minText3DNodes?: number;
    minShape3DNodes?: number;
    minGradients?: number;
    minShadows?: number;
    minCharts?: number;
    minChartSeries?: number;
    minMediaParts?: number;
    minModel3DParts?: number;
}
export interface ReferenceTarget {
    id: string;
    title: string;
    category: string;
    summary: string;
    privateReferencePath?: string;
    slideCount?: number;
    requiredFeatures: string[];
    recommendedRecipes: string[];
    recommendedChartPresets?: string[];
    recommendedTools: string[];
    brief: string[];
    acceptance: string[];
    gates: ReferenceGate;
}
export declare const REFERENCE_TARGETS: ReferenceTarget[];
export declare function listReferenceTargets(): ReferenceTarget[];
export declare function referenceTargetById(id: string): ReferenceTarget | undefined;
export declare function publicReferenceTarget(target: ReferenceTarget): any;
