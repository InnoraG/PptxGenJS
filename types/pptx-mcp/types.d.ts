export type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
export type VisualQuality = 'standard' | 'premium' | 'cinematic' | 'reference' | 'clean' | 'luxury' | 'editorial';
export type FeatureDepth = 'basic' | 'advanced' | 'exhaustive' | 'standard' | 'stress-test';
export type MotionLevel = 'none' | 'subtle' | 'showcase' | 'dynamic' | 'cinematic' | 'autoplay-live';
export type ChartRichness = 'native' | 'hybrid' | 'executive-dashboard';
export interface FeatureBudget {
    visualQuality: VisualQuality;
    featureDepth: FeatureDepth;
    motionLevel: MotionLevel;
    chartRichness: ChartRichness;
    requireFeatures: string[];
}
export interface IntentProfile {
    visualQuality?: VisualQuality;
    featureDepth?: FeatureDepth;
    motionLevel?: MotionLevel;
    deliveryMode?: 'speaker-led' | 'autoplay' | 'interactive' | 'kiosk';
    contentDensity?: 'minimal' | 'balanced' | 'dense' | 'audit';
    chartRichness?: ChartRichness;
    requireFeatures?: string[];
}
export interface BrandKit {
    name: string;
    version?: string;
    palette?: Record<string, string>;
    fonts?: {
        majorLatin?: string;
        minorLatin?: string;
        majorEa?: string;
        minorEa?: string;
        majorCs?: string;
        minorCs?: string;
    };
    spacing?: {
        unit?: number;
        scale?: number[];
    };
    logo?: Record<string, unknown>;
    motion?: {
        aggressiveness?: 'subtle' | 'standard' | 'cinematic';
    };
    accessibility?: {
        minContrast?: number;
        requireAltText?: boolean;
    };
}
export interface ExpressiveValidationIssue {
    pointer: string;
    code: string;
    message: string;
}
export interface ExpressiveValidationResult {
    ok: boolean;
    errors: ExpressiveValidationIssue[];
    warnings: ExpressiveValidationIssue[];
    objectNames: string[];
    coverage: string[];
}
export interface ExpressiveBuildResult {
    slideCount: number;
    features: string[];
    coverageReport?: unknown;
    validation?: ExpressiveValidationResult;
    mode?: 'structured' | 'expressive' | 'design-system';
    designPlan?: unknown;
    featureUsePlan?: unknown;
    designGate?: unknown;
    recipesApplied?: string[];
    featureBudget?: FeatureBudget;
}
export interface ComponentCatalogEntry {
    name: string;
    version: string;
    description: string;
    category: string;
    slots: Array<{
        key: string;
        kind: string;
        required?: boolean;
        maxChars?: number;
    }>;
    variants: string[];
    intentAware: string[];
    brandAware: string[];
    featureHighlights?: string[];
    recommendedRecipes?: string[];
}
