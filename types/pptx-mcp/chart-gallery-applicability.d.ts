export type GalleryEvidenceStatus = 'type-specific-capture-pending' | 'type-specific-ui-captured';
export interface GalleryPayloadApplicability {
    sourceFile: string | null;
    chartParts: string[];
    chartTags: string[];
    semanticTypes: string[];
    chartExParts: string[];
}
export interface ChartGalleryApplicability {
    galleryId: number;
    styleCatalogId: number;
    colorCatalogId: number;
    style: GalleryPayloadApplicability;
    color: GalleryPayloadApplicability;
    ribbonEvidence: GalleryEvidenceStatus;
}
export declare const CHART_GALLERY_APPLICABILITY: ReadonlyArray<ChartGalleryApplicability>;
export declare const CHART_GALLERY_APPLICABILITY_BY_ID: Readonly<{
    [k: string]: ChartGalleryApplicability;
}>;
export declare function chartGalleryApplicabilityById(id: number): ChartGalleryApplicability | undefined;
