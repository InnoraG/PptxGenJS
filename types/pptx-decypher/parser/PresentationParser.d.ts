/**
 * PresentationParser - Parse extracted PPTX data into presentation model
 */
import { PresentationModel, DecypherWarning } from '../types.js';
import { ExtractedData } from '../extractor/PptxExtractor.js';
export declare class PresentationParser {
    private warnings;
    private slideParser;
    constructor();
    /**
     * Parse extracted data into presentation model
     */
    parse(data: ExtractedData, outputFolder: string): Promise<PresentationModel>;
    private slidePartNumber;
    private buildSlideNavigationContext;
    private parseInheritanceTopology;
    private parseXml;
    private allElements;
    private firstElement;
    private directElements;
    private directElement;
    private presentAttribute;
    private resolvePackageTarget;
    private semanticIdentifier;
    private ooxmlBoolean;
    private semanticHeaderFooter;
    private semanticColorToken;
    private semanticTransparency;
    private semanticSolidFill;
    private semanticLine;
    private semanticShadow;
    private semanticTextStyle;
    private semanticStyleReferences;
    private semanticPlaceholderStyle;
    private semanticGeometry;
    private semanticShapeText;
    private semanticFixedObjects;
    private semanticSolidBackground;
    private semanticColorMap;
    private semanticMasterTextStyles;
    private semanticPlaceholderDefinitions;
    private semanticTheme;
    private semanticThemePresetId;
    /**
     * Parse presentation metadata from presentation.xml
     */
    private parseMetadata;
    /**
     * Convert media file entries to MediaAsset objects
     */
    private convertMediaToAssets;
    /**
     * Build mapping from relationship ID to media asset ID
     * Maps: rId5 → media1, rId6 → media2, etc.
     */
    private buildRelationshipToMediaIdMap;
    /**
     * Parse XML attributes
     */
    private parseAttributes;
    /**
     * Convert EMUs to inches
     * 1 inch = 914400 EMUs
     */
    private emuToInches;
    private emuToPoints;
    getWarnings(): DecypherWarning[];
}
