export interface ChartGalleryUiTileEvidence {
    row: number;
    column: number;
    x: number;
    y: number;
    chartStyleAfter: number | null;
    chartColorAfter: number | null;
    sha256: string;
    screenshot: string;
    packageSha256?: string | null;
    chartXmlSha256?: string | null;
    selectedChartXmlSha256?: string | null;
    chartXmlPath?: string | null;
    bundleSlide?: number | null;
    layoutId?: number | null;
    packageReplay?: 'bundle-com' | 'headless-com' | 'ui' | null;
    packagePath?: string | null;
    packageError?: string | null;
}
export interface ChartGalleryUiEvidence {
    chartType: number;
    chartTypeReadBack: number;
    label: string;
    specimenId: string | null;
    family: string | null;
    expectedChartTag: string | null;
    galleryKind: 'styles' | 'colors' | 'layouts';
    visibleTileCount: number;
    anchor: {
        Left: number;
        Top: number;
        Width: number;
        Height: number;
    } | null;
    grid: {
        Columns: number;
        Rows: number;
        OffsetX: number;
        OffsetY: number;
        StepX: number;
        StepY: number;
    } | null;
    manifest: string;
    referencePptx: string;
    tiles: ChartGalleryUiTileEvidence[];
}
export declare const CHART_GALLERY_UI_EVIDENCE: ReadonlyArray<ChartGalleryUiEvidence>;
export declare const CHART_GALLERY_UI_EVIDENCE_ERRORS: ReadonlyArray<string>;
export declare const CHART_GALLERY_UI_EVIDENCE_IGNORED: ReadonlyArray<string>;
export declare function chartGalleryUiEvidenceByType(chartType: number, galleryKind?: string): ChartGalleryUiEvidence[];
export declare const CHART_GALLERY_UI_EVIDENCE_BY_TYPE_KIND: Readonly<Record<string, ChartGalleryUiEvidence>>;
