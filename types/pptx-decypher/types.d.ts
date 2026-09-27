/**
 * PptxDecypher Type Definitions
 */
export interface DecypherOptions {
    /** Output directory for decyphered files (default: './decyphered') */
    outputDir?: string;
    /** Whether to extract raw XML for debugging (default: true) */
    extractXml?: boolean;
    /** Whether to extract media assets (default: true) */
    extractMedia?: boolean;
    /** Whether to run validation after generation (default: true) */
    validate?: boolean;
}
export interface DecypherResult {
    /** Success status */
    success: boolean;
    /** Unique signature hash of the PPTX */
    signature: string;
    /** Path to the generated .mjs file */
    generatorPath: string;
    /** Path to the output folder */
    outputFolder: string;
    /** Statistics about the decyphering process */
    stats: DecypherStats;
    /** Any warnings or passthrough items */
    warnings: DecypherWarning[];
    /** Errors if any */
    errors: string[];
}
export interface DecypherStats {
    slideCount: number;
    shapeCount: number;
    animationCount: number;
    mediaCount: number;
    passthroughCount: number;
}
export interface DecypherWarning {
    type: 'passthrough' | 'unsupported' | 'approximation';
    location: string;
    message: string;
    details?: string;
}
export interface PresentationModel {
    metadata: PresentationMetadata;
    slides: SlideModel[];
    media: MediaAsset[];
    /** Native gallery identity recovered from an exact theme-family marker. */
    themePresetId?: string;
    /** Portable presentation section order and slide membership. */
    sections?: PresentationSectionModel[];
    theme?: ThemeModel;
    /** Ordered portable physical slide masters in presentation relationship order. */
    masters?: SlideMasterModel[];
    /** Ordered portable layouts, each bound to its owning physical master by name. */
    layouts?: SlideLayoutModel[];
}
export interface PresentationSectionModel {
    /** Relationship-independent identity assigned in presentation order. */
    id: string;
    title: string;
    /** Relationship-independent slide identities in native section order. */
    slideIds: string[];
}
export interface PresentationMetadata {
    title?: string;
    subject?: string;
    author?: string;
    company?: string;
    revision?: number;
    layout: {
        width: number;
        height: number;
    };
}
export interface SlideModel {
    /** Relationship-independent identity in native presentation order. */
    id?: string;
    index: number;
    /** Public semantic slide title; falls back to the presentation-order label. */
    title?: string;
    /** Legacy generator alias for title. */
    name?: string;
    /** Relationship-independent identity of the section containing this slide. */
    sectionId?: string;
    background?: BackgroundModel;
    shapes: ShapeModel[];
    animations: AnimationModel[];
    transition?: TransitionModel;
    notes?: string;
    /** Native p:sld@show state projected as the public hidden semantic. */
    hidden?: boolean;
    /** Relationship-independent binding to a projected semantic layout. */
    layoutName?: string;
    /** Relationship-independent binding to the slide's physical semantic master. */
    masterName?: string;
    colorMapOverride?: InheritanceColorMap;
    showMasterShapes?: boolean | null;
    /** Compatibility alias for showMasterShapes. */
    showMasterBackground?: boolean | null;
    showMasterPhAnim?: boolean | null;
}
export interface BackgroundModel {
    type: 'solid' | 'gradient' | 'image' | 'pattern';
    color?: string;
    transparency?: number;
    gradient?: GradientModel;
    imagePath?: string;
}
export type InheritanceColorMap = Partial<Record<'bg1' | 'tx1' | 'bg2' | 'tx2' | 'accent1' | 'accent2' | 'accent3' | 'accent4' | 'accent5' | 'accent6' | 'hlink' | 'folHlink', string>>;
export interface InheritanceFillModel {
    type: 'none' | 'solid';
    color?: string;
    transparency?: number;
}
export interface InheritanceLineModel extends InheritanceFillModel {
    width?: number;
    dashType?: string;
}
export interface InheritanceShadowModel {
    type: 'outer';
    color?: string;
    blur?: number;
    distance?: number;
    angle?: number;
    opacity?: number;
}
export interface InheritanceStyleReferenceModel {
    index?: number;
    role?: 'major' | 'minor' | 'none';
    color?: string;
}
export interface InheritanceTextStyleModel {
    fontFace?: string;
    fontSize?: number;
    color?: string;
    bold?: boolean;
    italic?: boolean;
    align?: 'left' | 'center' | 'right' | 'justify';
    valign?: 'top' | 'middle' | 'bottom';
}
export interface PlaceholderVisualStyleModel extends InheritanceTextStyleModel {
    preset?: string;
    fill?: InheritanceFillModel;
    line?: InheritanceLineModel;
    shadow?: InheritanceShadowModel;
    styleRefs?: {
        line?: InheritanceStyleReferenceModel;
        fill?: InheritanceStyleReferenceModel;
        effect?: InheritanceStyleReferenceModel;
        font?: InheritanceStyleReferenceModel;
    };
}
export interface PlaceholderDefinitionModel {
    name: string;
    type: string;
    idx?: number;
    size?: 'full' | 'half' | 'quarter';
    orient?: 'horz' | 'vert';
    hasCustomPrompt?: boolean;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    style?: PlaceholderVisualStyleModel;
}
export interface HeaderFooterPolicyModel {
    date?: boolean;
    header?: boolean;
    footer?: boolean;
    slideNumber?: boolean;
}
export interface LayoutOwnedObjectOptions extends InheritanceTextStyleModel {
    x: number;
    y: number;
    w: number;
    h: number;
    objectName?: string;
    fill?: InheritanceFillModel;
    line?: InheritanceLineModel;
    shadow?: InheritanceShadowModel;
}
export type LayoutOwnedObjectModel = {
    text: {
        text: string;
        options: LayoutOwnedObjectOptions;
    };
} | {
    rect: LayoutOwnedObjectOptions;
} | {
    line: LayoutOwnedObjectOptions;
};
export interface SlideMasterModel {
    title: string;
    name?: string;
    background?: InheritanceFillModel;
    objects?: LayoutOwnedObjectModel[];
    placeholders?: PlaceholderDefinitionModel[];
    headerFooter?: HeaderFooterPolicyModel;
    colorMap?: InheritanceColorMap;
    textStyles?: {
        title?: InheritanceTextStyleModel;
        body?: InheritanceTextStyleModel;
        other?: InheritanceTextStyleModel;
    };
}
export interface SlideLayoutModel {
    name: string;
    width: number;
    height: number;
    type?: string;
    masterName?: string;
    background?: InheritanceFillModel;
    objects?: LayoutOwnedObjectModel[];
    placeholders?: PlaceholderDefinitionModel[];
    headerFooter?: HeaderFooterPolicyModel;
    colorMapOverride?: InheritanceColorMap;
}
export interface GradientModel {
    type: 'linear' | 'radial';
    angle?: number;
    stops: {
        position: number;
        color: string;
    }[];
}
export interface ShapeModel {
    /** Unique identifier within the slide */
    id: number;
    /** Shape name (from PPTX) */
    name: string;
    /** Shape type */
    type: ShapeType;
    /** Public semantic discriminator for native objects whose runtime type differs. */
    kind?: 'slideZoom' | 'sectionZoom' | 'summaryZoom';
    /** Export/inspection geometry in inches for semantic native blocks. */
    bbox?: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    targetSlideId?: string;
    targetSectionId?: string;
    summarySectionId?: string;
    sectionIds?: string[];
    summaryZoomItems?: SummaryZoomItemModel[];
    returnToParent?: boolean;
    transitionDur?: number;
    thumbnailDataUri?: string;
    altText?: string;
    /** Position and size in inches */
    x: number;
    y: number;
    w: number;
    h: number;
    /** Rotation in degrees */
    rotation?: number;
    /** Shape-specific options */
    options: ShapeOptions;
    /** For text shapes */
    text?: TextModel;
    /** For image shapes */
    imagePath?: string;
    /** For media shapes (video/audio) */
    mediaPath?: string;
    mediaType?: 'video' | 'audio';
    /** Native poster/preview image associated with an audio/video shape */
    mediaCoverPath?: string;
    /** For table shapes */
    tableData?: TableModel;
    /** For chart shapes */
    chartData?: ChartModel;
    /** For passthrough (unsupported) shapes */
    passthrough?: PassthroughModel;
    /** Stable edit handle and AI-facing mutation contract */
    edit?: ShapeEditHandle;
}
export interface SummaryZoomItemModel {
    targetSectionId: string;
    targetSection: number;
    targetSlideId: string;
    thumbnailDataUri: string;
    bbox: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
}
export type ShapeType = 'text' | 'shape' | 'image' | 'table' | 'chart' | 'smartArt' | 'media' | 'group' | 'slideZoom' | 'sectionZoom' | 'summaryZoom' | '__passthrough__';
export interface SlideJumpActionModel {
    type: 'slide';
    targetSlideId: string;
    /** One-based target used by the generated PptxGenJS replay. */
    targetSlide: number;
    tooltip?: string;
    history?: boolean;
    highlightClick?: boolean;
    endSound?: boolean;
}
export interface InteractiveActionsModel {
    click?: SlideJumpActionModel;
    hover?: SlideJumpActionModel;
}
export interface ShapeOptions {
    fill?: FillModel;
    line?: LineModel;
    shadow?: ShadowModel;
    effect3D?: Effect3DModel;
    glow?: GlowModel;
    softEdge?: {
        size: number;
    };
    reflection?: ReflectionModel;
    shapeType?: string;
    hyperlink?: HyperlinkModel;
    interactiveActions?: InteractiveActionsModel;
    /** Stable target used by semantic Slide Zoom readback. */
    targetSlideId?: string;
    /** One-based target used only by generated replay. */
    targetSlide?: number;
    /** Stable semantic section target used by Section/Summary Zoom readback. */
    targetSectionId?: string;
    /** One-based section target used only by generated replay. */
    targetSection?: number;
    sectionIds?: string[];
    summarySectionId?: string;
    summaryZoomItems?: SummaryZoomItemModel[];
    returnToParent?: boolean;
    transitionDur?: number;
    thumbnailDataUri?: string;
    accessibilityTitle?: string;
    altText?: string;
    isDecorative?: boolean;
    /** Portable semantic binding plus its native serializer carrier. */
    placeholderBinding?: PlaceholderBindingModel;
    importedPlaceholderRole?: string;
    phType?: string;
    phIdx?: number;
    phSz?: string;
    phOrient?: string;
    phHasCustomPrompt?: boolean;
    hasBarePh?: boolean;
    adjustments?: number[];
}
export interface PlaceholderBindingModel {
    type?: string;
    idx?: number;
    size?: string;
    orient?: string;
    hasCustomPrompt?: boolean;
    bare?: true;
}
export type EditabilityTier = 'semantic' | 'promotable' | 'wrapper-editable' | 'preserve-only';
export interface ShapeEditabilityModel {
    /** How deep the MCP can safely mutate this object */
    tier: EditabilityTier;
    /** True when object-specific mutation tools can update content/structure */
    semantic: boolean;
    /** Token-friendly tool names the AI client should try first */
    tools: string[];
    /** Supported operation classes, e.g. text, data, style, geometry */
    operations: string[];
    /** Short user/AI-readable explanation */
    note: string;
    /** Optional limitations to avoid repair-prone edits */
    limitations?: string[];
    /** Optional generator primitive for recreate-as-structured fallback */
    recreateWith?: string;
}
export interface ShapeEditHandle {
    /** Stable opaque identifier derived from source slide/object identity */
    id: string;
    /** Decypher/source provenance useful for edit routing */
    source: {
        kind: 'decypher';
        slideNumber: number;
        shapeIndex: number;
        shapeId: number;
        objectName: string;
        ooxmlType?: string;
    };
    /** Preferred selectors in order of stability */
    stableSelectors: string[];
    /** Editability contract for this object */
    editability: ShapeEditabilityModel;
}
export interface FillModel {
    type: 'solid' | 'gradient' | 'pattern' | 'picture' | 'none';
    color?: string;
    transparency?: number;
    gradient?: GradientModel;
    patternType?: string;
    imagePath?: string;
}
export interface LineModel {
    color?: string;
    width?: number;
    dashType?: string;
    transparency?: number;
    compoundType?: string;
    capType?: string;
    joinType?: string;
}
export interface ShadowModel {
    type: 'outer' | 'inner';
    color?: string;
    blur?: number;
    offset?: number;
    angle?: number;
    opacity?: number;
}
export interface GlowModel {
    color?: string;
    size?: number;
    transparency?: number;
    opacity?: number;
}
export interface ReflectionModel {
    blur?: number;
    offset?: number;
    transparency?: number;
}
export interface Effect3DModel {
    /** Top bevel settings */
    bevel?: {
        type: string;
        width: number;
        height: number;
    };
    /** Bottom bevel settings */
    bevelBottom?: {
        type: string;
        width: number;
        height: number;
    };
    /** Extrusion/depth (points) */
    extrusion?: number;
    /** Extrusion color (hex) */
    extrusionColor?: string;
    /** Contour width (points) */
    contourWidth?: number;
    /** Contour color (hex) */
    contourColor?: string;
    /** Material/surface type */
    material?: string;
    /** Lighting rig type */
    lightRig?: string;
    /** Light direction/rotation (degrees) */
    lightDirection?: number;
    /** X-axis rotation (degrees) */
    rotationX?: number;
    /** Y-axis rotation (degrees) */
    rotationY?: number;
    /** Z-axis rotation (degrees) */
    rotationZ?: number;
    /** Perspective field of view (degrees) */
    perspective?: number;
}
export interface HyperlinkModel {
    url?: string;
    slide?: number;
    tooltip?: string;
    target?: string;
}
export interface TextModel {
    paragraphs: ParagraphModel[];
    bodyProperties?: TextBodyProperties;
}
export interface TextBodyProperties {
    anchor?: 'top' | 'middle' | 'bottom';
    anchorCtr?: boolean;
    wrap?: 'square' | 'none';
    lIns?: number;
    rIns?: number;
    tIns?: number;
    bIns?: number;
    autoFit?: 'none' | 'shrink' | 'resize';
    rotation?: number;
    verticalText?: boolean;
    textShadow?: ShadowModel;
    textGlow?: GlowModel;
    textReflection?: ReflectionModel;
    text3D?: Text3DModel;
}
export interface Text3DModel {
    bevel?: {
        type: string;
        width: number;
        height: number;
    };
    depth?: number;
    contour?: {
        color: string;
        width: number;
    };
    material?: string;
}
export interface ParagraphModel {
    runs: TextRunModel[];
    properties?: ParagraphProperties;
}
export interface ParagraphProperties {
    align?: 'left' | 'center' | 'right' | 'justify';
    /** Paragraph left indentation in points. */
    indent?: number;
    /** Paragraph hanging indentation in points. */
    hanging?: number;
    level?: number;
    rtlMode?: boolean;
    lineSpacing?: number;
    lineSpacingMultiple?: number;
    spaceBefore?: number;
    spaceAfter?: number;
    tabStops?: Array<{
        position: number;
        alignment?: 'l' | 'r' | 'ctr' | 'dec';
    }>;
    bullet?: BulletModel;
}
export interface BulletModel {
    type: 'bullet' | 'number' | 'none';
    character?: string;
    startAt?: number;
    numberType?: string;
    font?: string;
    color?: string;
    size?: number;
}
export interface TextRunModel {
    text: string;
    properties?: TextRunProperties;
}
export interface TextRunProperties {
    fontSize?: number;
    fontFace?: string;
    fontFaceComplexScript?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean | {
        style: string;
    };
    strike?: boolean | 'single' | 'double' | 'sngStrike' | 'dblStrike';
    color?: string;
    transparency?: number;
    highlight?: string;
    subscript?: boolean;
    superscript?: boolean;
    charSpacing?: number;
    baseline?: number;
    lang?: string;
    rtl?: boolean;
    softBreakBefore?: boolean;
    /** Emit a leading/standalone a:br when the break is the first paragraph child. */
    standaloneBreakParagraph?: boolean;
    hyperlink?: HyperlinkModel;
    field?: {
        id?: string;
        type: string;
    };
    shadow?: ShadowModel;
    glow?: GlowModel;
    outline?: LineModel;
}
export interface TableModel {
    rows: TableRowModel[];
    options?: TableOptions;
}
export interface TableRowModel {
    cells: TableCellModel[];
    height?: number;
}
export interface TableCellModel {
    text?: TextModel;
    fill?: FillModel;
    border?: TableBorderModel;
    colspan?: number;
    rowspan?: number;
    margin?: {
        left?: number;
        right?: number;
        top?: number;
        bottom?: number;
    };
    valign?: 'top' | 'middle' | 'bottom';
}
export interface TableBorderModel {
    left?: LineModel;
    right?: LineModel;
    top?: LineModel;
    bottom?: LineModel;
}
export interface TableOptions {
    colWidths?: number[];
    rowHeights?: number[];
}
export interface ChartModel {
    type: string;
    data: ChartDataModel[];
    options?: ChartOptions;
}
export interface ChartDataModel {
    name: string;
    labels: string[];
    values: number[];
}
export interface ChartOptions {
    [key: string]: unknown;
}
export interface AnimationModel {
    /** Target shape name */
    target: string;
    /** Target shape ID */
    targetId?: number;
    /** Animation type */
    type: 'entrance' | 'exit' | 'emphasis' | 'motion' | 'media' | '__passthrough__';
    /** Effect name (PptxGenJS effect name) */
    effect?: string;
    /** Preset ID from OOXML */
    presetId?: number;
    /** Preset subtype */
    presetSubtype?: number;
    /** Sequence mode */
    sequence?: 'asOneObject' | 'byParagraph' | 'allAtOnce';
    /** Duration in milliseconds */
    duration?: number;
    /** Delay in milliseconds */
    delay?: number;
    /** Direction */
    direction?: string;
    /** Trigger type */
    trigger?: 'onClick' | 'afterPrevious' | 'withPrevious';
    /** For media animations: media command (e.g., 'playFrom(3.8)', 'stop', 'togglePause') */
    mediaCommand?: string;
    /** For motion path animations: named path (e.g., 'circlePath', 'heart') */
    motionPath?: string;
    /** For motion path animations: raw SVG path data from <p:animMotion> */
    motionPathData?: string;
    /** For emphasis animations: target color from <p:to> */
    emphasisColor?: string;
    /** For emphasis animations: scale factor from <p:by> (e.g., 1.5 = 150%) */
    emphasisScale?: number;
    /** For emphasis animations: raw <p:to> value */
    emphasisTo?: string;
    /** For emphasis animations: raw <p:by> value */
    emphasisBy?: string;
    /** For passthrough animations */
    passthrough?: PassthroughModel;
}
export interface TransitionModel {
    type: string;
    speed?: 'slow' | 'medium' | 'fast';
    direction?: string;
    advanceOnClick?: boolean;
    /** Canonical transition auto-advance time in milliseconds. */
    advanceAfterTime?: number;
    /** @deprecated Legacy structured decypher alias. */
    advanceAfter?: number;
    throughBlack?: boolean;
    splitDirection?: 'horz' | 'vert' | 'in' | 'out';
    pattern?: string;
    spokes?: number;
    clockwise?: boolean;
    zoomFrom?: 'in' | 'out';
}
export interface MediaAsset {
    id: string;
    type: 'image' | 'video' | 'audio';
    originalName: string;
    extractedPath: string;
    mimeType: string;
    relationshipId: string;
}
export interface ThemeModel {
    /** Legacy structured theme carrier retained for source compatibility. */
    colors?: {
        [key: string]: string;
    };
    /** Legacy structured theme carrier retained for source compatibility. */
    fonts?: {
        major: string;
        minor: string;
    };
    name?: string;
    fontFace?: string;
    headFontFace?: string;
    bodyFontFace?: string;
    lang?: string;
    colorScheme?: Partial<Record<'dk1' | 'lt1' | 'dk2' | 'lt2' | 'accent1' | 'accent2' | 'accent3' | 'accent4' | 'accent5' | 'accent6' | 'hlink' | 'folHlink', string>>;
}
export interface PassthroughModel {
    /** Reason why this element is passthrough */
    reason: string;
    /** Path to the raw XML file */
    sourceXmlPath: string;
    /** Original element type from OOXML */
    originalType: string;
    /** Any extracted metadata */
    metadata?: {
        [key: string]: unknown;
    };
}
