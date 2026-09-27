export declare const PROCEDURAL_GEOMETRY_KINDS: readonly ["world-map", "country-map", "region-highlight", "river-path", "deforestation-mask", "canopy-layer", "contour", "organic-blob"];
export type ProceduralGeometryKind = typeof PROCEDURAL_GEOMETRY_KINDS[number];
export interface ProceduralGeometryResult {
    brand: string;
    kind: ProceduralGeometryKind;
    source: 'generated';
    license: string;
    objects: any[];
    specimenMap: Array<{
        featureId: string;
        objectName: string;
        geometryKind: string;
        coverage: string[];
    }>;
    metadata: Record<string, unknown>;
}
export declare function generateProceduralGeometry(repoRoot: string, args?: any): ProceduralGeometryResult;
