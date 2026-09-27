/**
 * PptxDecypher - Reverse engineer PPTX files to PptxGenJS generator scripts
 *
 * This module provides deterministic PPTX-to-code conversion, enabling:
 * - Recovery of lost generator scripts
 * - AI-based editing of presentations
 * - SaaS round-trip PPTX manipulation via programmatic API
 *
 * @module pptx-decypher
 */
export { PptxDecypher } from './core/PptxDecypher.js';
export { decypherToGenerator, decypherToModel, regenerateFromGenerator, comparePresentations, repairCheck, } from './runner.js';
//# sourceMappingURL=index.js.map