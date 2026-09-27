import type { ExpressiveBuildResult } from './types.js';
export declare class ExpressiveSpecValidationError extends Error {
    readonly result: any;
    constructor(result: any);
}
export declare function buildExpressiveDeck(args: any, outputPath: string, sourcePath: string, repoRoot: string): Promise<ExpressiveBuildResult>;
