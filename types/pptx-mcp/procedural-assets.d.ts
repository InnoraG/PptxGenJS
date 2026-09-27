export declare const PROCEDURAL_ASSET_KINDS: readonly ["globe", "terrain", "leaf", "tree-canopy", "river-ribbon", "route-arc", "abstract-hero", "growth-arrow", "biome-scene"];
export type ProceduralAssetKind = typeof PROCEDURAL_ASSET_KINDS[number];
export interface ProceduralAssetResult {
    handle: string;
    id: string;
    kind: ProceduralAssetKind;
    source: 'generated';
    src: string;
    preview: string;
    altText: string;
    tags: string[];
    usage: string;
    license: string;
    metadata: Record<string, unknown>;
}
export declare function isProceduralAssetHandle(value: unknown): value is string;
export declare function proceduralAssetTemplates(repoRoot: string): ProceduralAssetResult[];
export declare function generateProceduralAsset(repoRoot: string, outputDir: string, request?: {
    kind?: unknown;
    seed?: unknown;
    theme?: unknown;
    style?: unknown;
    id?: unknown;
}): ProceduralAssetResult;
export declare function materializeProceduralAssetHandle(handle: string, repoRoot: string, outputDir: string): ProceduralAssetResult | null;
