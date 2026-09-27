import type { ComponentCatalogEntry, ExpressiveBuildResult, IntentProfile } from './types.js';
export declare const COMPONENT_CATALOG: ComponentCatalogEntry[];
export declare function listComponents(): ComponentCatalogEntry[];
export declare function validateComponent(name: string, slots?: Record<string, unknown>): {
    ok: boolean;
    errors: any[];
    component?: ComponentCatalogEntry;
};
export declare function expandDesignSystemSpec(spec: any): any;
export declare function buildDesignSystemDeck(args: any, outputPath: string, sourcePath: string, repoRoot: string): Promise<ExpressiveBuildResult>;
export declare function outlineToDesignSystemSpec(outline: string, intent?: IntentProfile, title?: string): any;
