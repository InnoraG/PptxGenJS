/**
 * ShapeParser - Parse shapes from slide XML
 */
import { ShapeModel, DecypherWarning } from '../types.js';
import { SlideExtracted } from '../extractor/PptxExtractor.js';
export interface SlideNavigationTarget {
    partNumber: number;
    presentationSlideId: string;
    targetSlideId: string;
    targetSlide: number;
}
export interface SectionNavigationTarget {
    presentationSectionId: string;
    targetSectionId: string;
    targetSection: number;
    title: string;
    slideTargets: SlideNavigationTarget[];
}
export interface SlideNavigationContext {
    byPartNumber: Map<number, SlideNavigationTarget>;
    byPresentationSlideId: Map<string, SlideNavigationTarget>;
    byPresentationSectionId: Map<string, SectionNavigationTarget>;
    sectionByPartNumber: Map<number, SectionNavigationTarget>;
    sections: SectionNavigationTarget[];
    thumbnailDataUriByRelationship: Map<string, string>;
}
export declare class ShapeParser {
    private warnings;
    /**
     * Parse all shapes from slide XML
     */
    parseAll(xml: string, slideData: SlideExtracted, slideNum: number, outputFolder: string, relToMediaId?: Map<string, string>, navigationContext?: SlideNavigationContext): ShapeModel[];
    private decodeXmlAttribute;
    private parseAccessibilityMetadata;
    private parsePlaceholderMetadata;
    private buildEditHandle;
    private buildEditability;
    private isChartExXml;
    private isSlideZoomXml;
    private isSectionZoomXml;
    private isSummaryZoomXml;
    private parseOoxmlBoolean;
    private relationshipSlidePartNumber;
    private parseObjectHyperlink;
    private parseObjectSlideJumpActions;
    private slideZoomPassthrough;
    private parseSlideZoom;
    private semanticZoomPassthrough;
    private sameNativeTransform;
    private parseSectionZoom;
    private parseSummaryZoom;
    private parseChartExAlternateContent;
    /**
     * Parse a single <p:sp> shape element
     */
    private parseShape;
    /**
     * Parse a <p:pic> picture element (images, video, audio)
     */
    private parsePicture;
    /**
     * Parse a <p:graphicFrame> element (tables, charts, etc.)
     */
    private parseGraphicFrame;
    /**
     * Parse a table from <a:tbl>
     */
    private parseTable;
    private parseTableCell;
    /**
     * Parse a group shape
     */
    private parseGroupShape;
    /**
     * Parse an unknown/unsupported element (OLE, ActiveX, etc.)
     */
    private parseUnknownElement;
    /**
     * Extract a complete XML element by tag name
     */
    private isTagNameBoundary;
    private readElementTagName;
    private extractShapeTreeChildren;
    private extractElementsByTag;
    private extractElement;
    /**
     * Parse transform (position and size)
     */
    private parseTransform;
    /**
     * Parse shape options (fill, line, effects)
     */
    private parseShapeOptions;
    /**
     * Parse fill from spPr
     */
    private parseFill;
    /**
     * Parse line/border
     */
    private parseLine;
    /**
     * Parse shadow effect
     */
    private parseShadow;
    /**
     * Parse glow effect
     */
    private parseGlow;
    /**
     * Parse 3D effects (scene3d and sp3d) into structured model
     * Returns Effect3DModel matching the library's Text3DProps structure
     */
    private parse3DEffects;
    /**
     * Parse text body
     */
    private parseTextBody;
    private parseTextBodyElement;
    private allTextElements;
    private firstTextElement;
    private directTextElements;
    private directTextElement;
    private textAttribute;
    private numericAttribute;
    private parseBodyProperties;
    private parseParagraph;
    private parseParagraphProperties;
    private parseParagraphBullet;
    private parseTextRun;
    private parseRunProperties;
    private textColor;
    private parseTextHyperlink;
    /**
     * Extract color from XML
     */
    private extractColor;
    /**
     * Save element as passthrough
     */
    private savePassthrough;
    /**
     * Parse XML attributes
     */
    private parseAttributes;
    /**
     * Convert EMUs to inches
     */
    private emuToInches;
    /**
     * Convert EMUs to points
     */
    private emuToPoints;
    getWarnings(): DecypherWarning[];
    clearWarnings(): void;
}
