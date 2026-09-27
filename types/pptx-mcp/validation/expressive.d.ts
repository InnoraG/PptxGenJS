import type { BrandKit, ExpressiveValidationResult } from '../types.js';
export declare function validateExpressiveSpec(spec: any, context: {
    repoRoot: string;
    outputDir: string;
    brandKit?: BrandKit;
}): ExpressiveValidationResult;
