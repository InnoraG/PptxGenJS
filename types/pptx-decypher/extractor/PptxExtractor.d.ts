/**
 * PptxExtractor - Extract and organize PPTX contents
 */
import JSZip from 'jszip';
import { DecypherOptions } from '../types.js';
export interface ExtractedData {
    /** Parsed content types */
    contentTypes: ContentTypeEntry[];
    /** Presentation.xml content */
    presentationXml: string;
    /** Slide XML contents indexed by slide number */
    slides: Map<number, SlideExtracted>;
    /** Relationships */
    relationships: Map<string, RelationshipEntry[]>;
    /** Theme XML if present */
    themeXml?: string;
    /** All physical theme parts retained privately for relationship-based selection. */
    themes: Map<number, PackageXmlPart>;
    /** Slide layouts */
    slideLayouts: Map<number, PackageXmlPart>;
    /** Slide masters */
    slideMasters: Map<number, PackageXmlPart>;
    /** Media files extracted */
    mediaFiles: MediaFileEntry[];
    /** Raw ZIP for passthrough access */
    zip: JSZip;
}
export interface SlideExtracted {
    xml: string;
    relationships: RelationshipEntry[];
    notesXml?: string;
}
/** Private package carrier. Its path/relationship IDs never enter PresentationModel. */
export interface PackageXmlPart {
    partName: string;
    xml: string;
    relationships: RelationshipEntry[];
}
export interface ContentTypeEntry {
    partName?: string;
    extension?: string;
    contentType: string;
}
export interface RelationshipEntry {
    id: string;
    type: string;
    target: string;
    targetMode?: string;
}
export interface MediaFileEntry {
    partName: string;
    data: Buffer;
    contentType: string;
    extractedPath: string;
}
export declare class PptxExtractor {
    private options;
    constructor(options: Required<DecypherOptions>);
    /**
     * Extract PPTX contents from buffer
     */
    extract(pptxBuffer: Buffer, outputFolder: string): Promise<ExtractedData>;
    /**
     * Retain numbered structural XML parts and their relationships privately.
     * Public semantic names are assigned later, after the selected graph is known.
     */
    private extractNumberedXmlParts;
    /**
     * Parse [Content_Types].xml
     */
    private parseContentTypes;
    /**
     * Parse relationships file
     */
    private parseRelationships;
    /**
     * Extract all slides
     */
    private extractSlides;
    /**
     * Extract media files
     */
    private extractMedia;
    /**
     * Extract XML files for debugging/reference
     */
    private extractXmlFiles;
    /**
     * Get file content from ZIP
     */
    private getFileContent;
    /**
     * Parse XML attributes string into object
     */
    private parseAttributes;
    /**
     * Simple XML formatting for readability
     */
    private formatXml;
}
