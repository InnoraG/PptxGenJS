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
export { DecypherOptions, DecypherResult, DecypherStats, DecypherWarning } from './types.js';
export type { DecypherEngine, DecypherGeneratorOptions, DecypherGeneratorResult, DecypherModelOptions, DecypherModelResult, RegenerateOptions, RegenerateResult, CompareOptions, OracleResult, } from './runner.js';
export type { PresentationModel, PresentationMetadata, SlideModel, ShapeModel, AnimationModel, TextModel, TextRunModel, FillModel, LineModel, BackgroundModel, TransitionModel, ShapeOptions, PlaceholderBindingModel, ShadowModel, GlowModel, MediaAsset } from './types.js';
