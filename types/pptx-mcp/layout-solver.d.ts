import type { BrandKit } from './types.js';
export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface SlideSize {
    width: number;
    height: number;
}
export declare function solveLayout(layout: any, objects: any[], slideSize: SlideSize, brand?: BrandKit): Rect[];
