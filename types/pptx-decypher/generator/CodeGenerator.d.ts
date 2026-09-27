/**
 * CodeGenerator - Generate .mjs code from PresentationModel
 */
import { PresentationModel } from '../types.js';
export declare class CodeGenerator {
    /**
     * Generate .mjs generator script from presentation model
     */
    generate(model: PresentationModel, outputFolder: string, signature: string, sourcePath: string): Promise<string>;
    /**
     * Build the complete generator code
     */
    private buildCode;
    /**
     * Build a single slide definition
     */
    private buildSlideDefinition;
    /**
     * Build a shape definition
     */
    private buildShapeDefinition;
    /**
     * Build options code
     */
    private buildOptionsCode;
    /**
     * Build text model code
     */
    private buildTextModelCode;
    /**
     * Build text run code
     */
    private buildTextRunCode;
    /**
     * Build animation definition
     */
    private buildAnimationDefinition;
    /**
     * Build passthrough handler code
     */
    private buildPassthroughHandler;
    /**
     * Check if model has any passthrough items
     */
    private hasPassthroughItems;
    /**
     * Quote a string for JavaScript
     */
    private quote;
}
