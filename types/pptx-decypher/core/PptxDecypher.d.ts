/**
 * PptxDecypher - Main orchestrator class
 */
import { DecypherOptions, DecypherResult, DecypherStats, DecypherWarning, PresentationModel } from '../types.js';
export declare class PptxDecypher {
    private options;
    private warnings;
    private errors;
    constructor(options?: DecypherOptions);
    /**
     * Decypher a PPTX file and generate a .mjs generator script
     */
    decypher(pptxPath: string): Promise<DecypherResult>;
    /**
     * Decypher a PPTX from an in-memory Buffer (SaaS/server-side use)
     * Same as decypher() but accepts Buffer instead of file path.
     */
    decypherFromBuffer(pptxBuffer: Buffer, sourceName?: string): Promise<DecypherResult>;
    /**
     * Decypher a PPTX and return the raw PresentationModel (for programmatic/AI editing)
     * Does NOT generate code — returns the structured model for manipulation.
     */
    decypherToModel(input: string | Buffer, sourceName?: string): Promise<{
        success: boolean;
        model?: PresentationModel;
        signature: string;
        stats: DecypherStats;
        warnings: DecypherWarning[];
        errors: string[];
    }>;
    /**
     * Internal pipeline shared by decypher() and decypherFromBuffer()
     */
    private runPipeline;
    /**
     * Calculate unique signature from PPTX content
     * Uses SHA256 of core content (excluding volatile metadata)
     */
    private calculateSignature;
    /**
     * Create output folder structure
     */
    private createOutputFolders;
    /**
     * Create output folder structure for buffer-based input (no source file to copy)
     */
    private createOutputFoldersForBuffer;
    /**
     * Calculate statistics from model
     */
    private calculateStats;
}
