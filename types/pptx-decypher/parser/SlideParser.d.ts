/**
 * SlideParser - Parse individual slide XML into SlideModel
 */
import { SlideModel, DecypherWarning } from '../types.js';
import { ExtractedData, SlideExtracted } from '../extractor/PptxExtractor.js';
import type { SlideNavigationContext } from './ShapeParser.js';
export declare class SlideParser {
    private warnings;
    private shapeParser;
    private animationParser;
    constructor();
    /**
     * Parse slide XML into SlideModel
     */
    parse(slideNum: number, slideData: SlideExtracted, extractedData: ExtractedData, outputFolder: string, relToMediaId?: Map<string, string>, // NEW: relationship ID → media ID mapping
    navigationContext?: SlideNavigationContext): Promise<SlideModel>;
    private allElements;
    private directElements;
    private presentAttribute;
    private ooxmlBoolean;
    private parseSlideProperties;
    /**
     * Parse slide background
     */
    private parseBackground;
    /**
     * Parse shapes from slide XML
     */
    private parseShapes;
    /**
     * Parse animations from slide XML
     */
    private parseAnimations;
    /**
     * Parse slide transition
     */
    private parseTransition;
    /**
     * Parse notes from notes XML
     */
    private parseNotes;
    /**
     * Extract color from XML fragment
     */
    private extractColor;
    /**
     * Parse XML attributes
     */
    private parseAttributes;
    getWarnings(): DecypherWarning[];
    clearWarnings(): void;
}
