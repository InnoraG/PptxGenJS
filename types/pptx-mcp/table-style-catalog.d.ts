/**
 * Executable PowerPoint Table Design gallery catalog.
 * Generated from the immutable native capture by tools/generate-table-style-reference.mjs.
 */
export interface PowerPointTableStylePreset {
    publicId: string;
    nativeId: string;
    name: string;
    family: 'unstyled' | 'themed' | 'light' | 'medium' | 'dark';
    accent: number[];
    tileIndex: number;
    source: 'powerpoint-table-styles-gallery';
    editable: true;
}
export declare const POWERPOINT_TABLE_STYLE_CATALOG: readonly PowerPointTableStylePreset[];
export declare const POWERPOINT_TABLE_STYLE_CATALOG_BY_PUBLIC_ID: Map<string, PowerPointTableStylePreset>;
export declare const POWERPOINT_TABLE_STYLE_CATALOG_BY_NATIVE_ID: Map<string, PowerPointTableStylePreset>;
