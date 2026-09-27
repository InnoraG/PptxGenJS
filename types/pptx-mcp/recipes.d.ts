import type { FeatureBudget } from './types.js';
export interface BetterPptxMcpRecipe {
    id: string;
    title: string;
    category: string;
    description: string;
    featureHighlights: string[];
    requiredFeatures: string[];
    recommendedComponents: string[];
    recommendedAssets: string[];
    chartTypes?: string[];
    recommendedChartPresets?: string[];
    shapeBuiltVisuals?: string[];
    defaultBudget?: Partial<FeatureBudget>;
    example?: Record<string, unknown>;
}
export interface PreparedGenerativeSpec {
    spec: any;
    featureBudget: FeatureBudget;
    recipesApplied: string[];
    designPlan: {
        mode: string;
        featureBudget: FeatureBudget;
        recipesApplied: string[];
        decisions: string[];
        recommendedChartPresets?: Array<{
            id: string;
            title: string;
            authoringMode: string;
            selectionReason: string[];
        }>;
    };
    featureUsePlan: {
        detectedBefore: string[];
        detectedAfter: string[];
        addedFeatures: string[];
        requiredFeatures: string[];
    };
    recommendedChartPresets?: string[];
    designGate: {
        ok: boolean;
        errors: Array<{
            code: string;
            message: string;
        }>;
        warnings: Array<{
            code: string;
            message: string;
        }>;
        requiredFeatures: string[];
        missingRequiredFeatures: string[];
    };
}
export declare const RECIPE_CATALOG: BetterPptxMcpRecipe[];
export declare function normalizeFeatureBudget(input?: any, fallback?: Partial<FeatureBudget>): FeatureBudget;
export declare function listRecipes(args?: any): BetterPptxMcpRecipe[];
export declare function recipeById(id: string): BetterPptxMcpRecipe | undefined;
export declare function recommendRecipes(query?: string, budget?: FeatureBudget): BetterPptxMcpRecipe[];
export declare function composeDynamicRecipe(args?: any): any;
export declare function detectSpecFeatures(spec: any): string[];
export declare function prepareGenerativeSpec(args: any, mode: string): PreparedGenerativeSpec;
