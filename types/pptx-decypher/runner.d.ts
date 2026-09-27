import { DecypherOptions, DecypherResult, DecypherStats, PresentationModel } from './types.js';
export type DecypherEngine = 'auto' | 'ultimate' | 'structured';
export interface DecypherGeneratorOptions extends DecypherOptions {
    pptxPath?: string;
    pptxBase64?: string;
    sourceName?: string;
    engine?: DecypherEngine;
    autoRegenerate?: boolean;
    includeGeneratorCode?: boolean;
    timeoutMs?: number;
}
export interface DecypherGeneratorResult extends DecypherResult {
    engine: 'ultimate' | 'structured';
    sourcePath?: string;
    regeneratedPath?: string;
    regenerateSuccess?: boolean | null;
    regenerateError?: string | null;
    generatorCode?: string;
    stdout?: string;
    stderr?: string;
    runtimeAvailable: boolean;
}
export interface DecypherModelOptions extends DecypherOptions {
    pptxPath?: string;
    pptxBase64?: string;
    sourceName?: string;
    engine?: DecypherEngine;
    limitSlides?: number;
    timeoutMs?: number;
}
export interface DecypherModelResult {
    success: boolean;
    engine: 'ultimate' | 'structured';
    model?: PresentationModel;
    signature: string;
    stats: DecypherStats;
    warnings: DecypherResult['warnings'];
    errors: string[];
    runtimeAvailable: boolean;
}
export interface RegenerateOptions {
    generatorPath: string;
    outputPath?: string;
    timeoutMs?: number;
}
export interface RegenerateResult {
    success: boolean;
    generatorPath: string;
    outputPath: string;
    exitCode: number;
    stdout: string;
    stderr: string;
}
export interface CompareOptions {
    referencePath: string;
    generatedPath: string;
    slides?: Array<number | string>;
    comparatorPath?: string;
    timeoutMs?: number;
}
export interface OracleResult {
    success: boolean;
    runtimeAvailable: boolean;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    error?: string;
}
export declare function decypherToGenerator(input: string | DecypherGeneratorOptions): Promise<DecypherGeneratorResult>;
export declare function decypherToModel(options: DecypherModelOptions): Promise<DecypherModelResult>;
export declare function regenerateFromGenerator(options: RegenerateOptions): Promise<RegenerateResult>;
export declare function comparePresentations(options: CompareOptions): Promise<OracleResult>;
export declare function repairCheck(pptxPath: string, timeoutMs?: number): Promise<OracleResult>;
