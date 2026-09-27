export interface AssetCatalogItem {
    handle: string;
    category: 'stock' | 'icons' | 'models3d' | 'audio' | 'video' | 'textures' | 'datasets' | 'shape-scenes';
    src: string;
    preview?: string;
    altText?: string;
    tags?: string[];
    usage?: string;
    source?: string;
    sourceKey?: string;
    sourceLabel?: string;
    sourceCategory?: string;
    sourcePriority?: number;
    bytes?: number;
    sizeMiB?: number;
    sizeTier?: 'tiny' | 'small' | 'standard' | 'balanced' | 'large' | 'oversized';
    license?: string;
    sourceUrl?: string;
    attribution?: string;
    proceduralKind?: string;
    metadata?: Record<string, unknown>;
}
export declare function assetCatalog(repoRoot: string): AssetCatalogItem[];
export declare function findAsset(repoRoot: string, handle: string): AssetCatalogItem | undefined;
