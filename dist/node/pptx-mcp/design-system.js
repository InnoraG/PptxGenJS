var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { buildExpressiveDeck } from './expressive.js';
import { normalizeFeatureBudget } from './recipes.js';
const DEFAULT_ACCENTS = ['theme://accent1', 'theme://accent2', 'theme://accent3', 'theme://accent4'];
const HEX_ACCENTS = ['20D6E7', '8B5CF6', 'FFB84D', '2FE6A6'];
function gradientFill(stops = ['theme://accent1', 'theme://accent2', 'theme://accent3'], angle = 25) {
    return {
        type: 'gradient',
        gradientDirection: 'linear',
        gradientAngle: angle,
        gradientStops: stops.map((color, index) => ({
            position: Math.round((index / Math.max(1, stops.length - 1)) * 100),
            color,
            transparency: index === 1 ? 10 : 3,
        })),
    };
}
function premiumShadow(opacity = 0.26) {
    return { type: 'outer', color: '000000', opacity, blur: 8, offset: 1.3, angle: 45 };
}
function premiumLine(color = 'theme://text/primary', transparency = 55) {
    return { color, transparency, width: 0.8 };
}
export const COMPONENT_CATALOG = [
    { name: 'hero-band', version: '1.0.0', description: 'Full-slide hero with title, eyebrow, subtitle, and accent geometry.', category: 'hero', slots: [{ key: 'title', kind: 'text', required: true, maxChars: 70 }, { key: 'eyebrow', kind: 'text', maxChars: 28 }, { key: 'subtitle', kind: 'text', maxChars: 180 }], variants: ['wide-left', 'centered', 'split'], intentAware: ['visualQuality', 'motionLevel'], brandAware: ['palette', 'fonts'] },
    { name: 'stat-row', version: '1.0.0', description: 'Three to five stat tiles.', category: 'data', slots: [{ key: 'stats', kind: 'array', required: true }], variants: ['compact', 'large', 'glass'], intentAware: ['contentDensity'], brandAware: ['palette'] },
    { name: 'kpi-tile', version: '1.0.0', description: 'Single KPI tile with label and value.', category: 'data', slots: [{ key: 'label', kind: 'text', required: true }, { key: 'value', kind: 'text', required: true }], variants: ['compact', 'large', 'accent'], intentAware: ['contentDensity'], brandAware: ['palette'] },
    { name: 'quote-slab', version: '1.0.0', description: 'Editorial quote panel.', category: 'content', slots: [{ key: 'quote', kind: 'text', required: true }, { key: 'attribution', kind: 'text' }], variants: ['left', 'center', 'oversized'], intentAware: ['visualQuality'], brandAware: ['fonts', 'palette'] },
    { name: 'side-by-side', version: '1.0.0', description: 'Two-column comparison block.', category: 'layout', slots: [{ key: 'leftTitle', kind: 'text', required: true }, { key: 'rightTitle', kind: 'text', required: true }, { key: 'leftBody', kind: 'text' }, { key: 'rightBody', kind: 'text' }], variants: ['balanced', 'accent-left', 'accent-right'], intentAware: ['contentDensity'], brandAware: ['palette'] },
    { name: 'three-column', version: '1.0.0', description: 'Three equal feature columns.', category: 'layout', slots: [{ key: 'columns', kind: 'array', required: true }], variants: ['cards', 'plain', 'numbered'], intentAware: ['contentDensity'], brandAware: ['palette'] },
    { name: 'section-divider', version: '1.0.0', description: 'Section divider with large title.', category: 'navigation', slots: [{ key: 'title', kind: 'text', required: true }, { key: 'subtitle', kind: 'text' }], variants: ['band', 'minimal', 'kinetic'], intentAware: ['motionLevel'], brandAware: ['palette'] },
    { name: 'agenda-list', version: '1.0.0', description: 'Agenda or table-of-contents list.', category: 'navigation', slots: [{ key: 'items', kind: 'array', required: true }], variants: ['numbered', 'timeline', 'compact'], intentAware: ['contentDensity'], brandAware: ['palette'] },
    { name: 'chart-card', version: '1.0.0', description: 'Chart with title, caption, and accent frame.', category: 'data', slots: [{ key: 'title', kind: 'text', required: true }, { key: 'chart', kind: 'chart', required: true }, { key: 'caption', kind: 'text' }], variants: ['card', 'wide', 'dashboard'], intentAware: ['visualQuality'], brandAware: ['palette'] },
    { name: 'timeline-rail', version: '1.0.0', description: 'Horizontal timeline rail.', category: 'storytelling', slots: [{ key: 'events', kind: 'array', required: true }], variants: ['rail', 'milestone', 'roadmap'], intentAware: ['contentDensity'], brandAware: ['palette'] },
    { name: 'process-chevrons', version: '1.0.0', description: 'Process steps rendered as chevrons.', category: 'storytelling', slots: [{ key: 'steps', kind: 'array', required: true }], variants: ['straight', 'stacked', 'compact'], intentAware: ['contentDensity'], brandAware: ['palette'] },
    { name: 'call-to-action', version: '1.0.0', description: 'Closing CTA slide fragment.', category: 'closing', slots: [{ key: 'title', kind: 'text', required: true }, { key: 'button', kind: 'text' }, { key: 'subtitle', kind: 'text' }], variants: ['centered', 'split', 'kiosk'], intentAware: ['deliveryMode'], brandAware: ['palette'] },
    { name: 'cinematic-hero', version: '1.0.0', description: 'Premium hero scene with gradient stage, depth, WordArt accent, and motion-ready objects.', category: 'hero', slots: [{ key: 'title', kind: 'text', required: true, maxChars: 70 }, { key: 'subtitle', kind: 'text', maxChars: 180 }, { key: 'eyebrow', kind: 'text', maxChars: 28 }], variants: ['neon-orbit', 'editorial-depth', 'glass-stage'], intentAware: ['visualQuality', 'featureDepth', 'motionLevel'], brandAware: ['palette', 'fonts'], featureHighlights: ['gradient', 'shadow', 'wordart3d', 'animation'], recommendedRecipes: ['premium-cinematic-system', 'wordart-effects-lab'] },
    { name: '3d-lab-scene', version: '1.0.0', description: 'Native GLB model scene with poster fallback, lighting/camera metadata, shadow, and orbit cue.', category: '3d', slots: [{ key: 'title', kind: 'text' }, { key: 'body', kind: 'text' }], variants: ['stage-left', 'stage-right', 'product-orbit'], intentAware: ['featureDepth', 'motionLevel'], brandAware: ['palette'], featureHighlights: ['3d', 'model3d', 'shadow', 'animation'], recommendedRecipes: ['native-3d-hero-scene'] },
    { name: '3d-model-gallery', version: '1.0.0', description: 'Premium native GLB object gallery with visible poster fallbacks, depth stage, shadows, and orbit/motion cues.', category: '3d', slots: [{ key: 'title', kind: 'text' }, { key: 'models', kind: 'array' }], variants: ['agency-objects', 'presenter-pair', 'analytics-objects'], intentAware: ['featureDepth', 'motionLevel', 'visualQuality'], brandAware: ['palette'], featureHighlights: ['3d', 'model3d', 'shadow', 'gradient', 'animation'], recommendedRecipes: ['native-3d-hero-scene', 'premium-3d-object-gallery'] },
    { name: 'executive-dashboard', version: '1.0.0', description: 'Executive dashboard with native charts, KPI cards, gauge/funnel/pie shape visuals, and depth effects.', category: 'data', slots: [{ key: 'title', kind: 'text' }, { key: 'metrics', kind: 'array' }], variants: ['boardroom', 'operating-review', 'investor'], intentAware: ['chartRichness', 'contentDensity'], brandAware: ['palette', 'fonts'], featureHighlights: ['advancedCharts', 'shape-built-chart', 'gradient', 'shadow'], recommendedRecipes: ['executive-hybrid-chart-suite', 'shape-built-icon-analytics'] },
    { name: 'dense-chart-wall', version: '1.0.0', description: 'Grid of non-empty native charts for rich analytical presentations.', category: 'data', slots: [{ key: 'title', kind: 'text' }, { key: 'charts', kind: 'array' }], variants: ['native-grid', 'hybrid-grid', 'reference'], intentAware: ['chartRichness', 'contentDensity'], brandAware: ['palette'], featureHighlights: ['advancedCharts', 'native-chart'], recommendedRecipes: ['executive-hybrid-chart-suite'] },
    { name: 'data-story', version: '1.0.0', description: 'Shape-built waterfall, candlestick, timeline, and KPI narrative panel.', category: 'data', slots: [{ key: 'title', kind: 'text' }, { key: 'steps', kind: 'array' }], variants: ['waterfall', 'ohlc', 'timeline'], intentAware: ['chartRichness'], brandAware: ['palette'], featureHighlights: ['shape-built-chart', 'gradient', 'shadow'], recommendedRecipes: ['executive-hybrid-chart-suite', 'shape-built-icon-analytics'] },
    { name: 'media-voice-lab', version: '1.0.0', description: 'Video, audio/voice, cover image, and waveform objects for autoplay media scenes.', category: 'media', slots: [{ key: 'title', kind: 'text' }, { key: 'caption', kind: 'text' }], variants: ['video-left', 'voice-right', 'split-lab'], intentAware: ['motionLevel', 'deliveryMode'], brandAware: ['palette'], featureHighlights: ['media', 'voice', 'audio', 'animation'], recommendedRecipes: ['media-audio-voice-lab'] },
    { name: 'wordart-effects-panel', version: '1.0.0', description: 'Applied WordArt transforms with text effects, bevel/extrusion metadata, glow, reflection, and shadows.', category: 'text', slots: [{ key: 'words', kind: 'array' }, { key: 'title', kind: 'text' }], variants: ['curve-wave-depth', 'brand-letters', 'neon-type'], intentAware: ['visualQuality', 'motionLevel'], brandAware: ['palette', 'fonts'], featureHighlights: ['wordart', 'wordart3d', 'shadow'], recommendedRecipes: ['wordart-effects-lab'] },
    { name: 'motion-lab', version: '1.0.0', description: 'Content objects prepared for entrance, exit, emphasis, color, transform, and motion-path animation.', category: 'motion', slots: [{ key: 'title', kind: 'text' }], variants: ['six-pack', 'path-stage', 'kinetic-cards'], intentAware: ['motionLevel'], brandAware: ['palette'], featureHighlights: ['animation', 'motionPath', 'colorAnimation'], recommendedRecipes: ['motion-animation-lab'] },
    { name: 'shape-icon-cloud', version: '1.0.0', description: 'PowerPoint shape presets used as icons and analytical glyphs with premium styling.', category: 'shapes', slots: [{ key: 'title', kind: 'text' }, { key: 'icons', kind: 'array' }], variants: ['analytics', 'process', 'brand-pattern'], intentAware: ['visualQuality'], brandAware: ['palette'], featureHighlights: ['shape-icons', 'gradient', 'shadow'], recommendedRecipes: ['shape-built-icon-analytics'] },
    { name: 'custom-shape-sculpture', version: '1.0.0', description: 'Custom geometry sculpture built from editable PowerPoint paths, preset primitives, gradients, connectors, shadows, and 3D effects.', category: 'shapes', slots: [{ key: 'title', kind: 'text' }], variants: ['agency-sculpture', 'connected-system', 'analytic-ribbon'], intentAware: ['visualQuality', 'featureDepth'], brandAware: ['palette'], featureHighlights: ['customGeometry', 'shape-icons', 'gradient', 'shadow', 'shape3d'], recommendedRecipes: ['shape-built-icon-analytics'] },
    { name: 'procedural-map-scene', version: '1.0.0', description: 'Native custom-geometry map scene with AI-selected focus regions, route/flow overlays, and motion-ready geometry objects.', category: 'maps', slots: [{ key: 'title', kind: 'text' }, { key: 'focus', kind: 'array' }], variants: ['global-focus', 'route-flow', 'regional-risk'], intentAware: ['featureDepth', 'motionLevel'], brandAware: ['palette'], featureHighlights: ['customGeometry', 'worldMap', 'gradient', 'shadow'], recommendedRecipes: ['shape-built-icon-analytics'] },
    { name: 'procedural-3d-scene', version: '1.0.0', description: 'Procedural native 3D scene using generated GLB handles, poster fallbacks, morph-compatible object names, and content animation cues.', category: '3d', slots: [{ key: 'title', kind: 'text' }, { key: 'body', kind: 'text' }, { key: 'assets', kind: 'array' }], variants: ['hero-object', 'system-scene', 'flow-scene'], intentAware: ['featureDepth', 'motionLevel'], brandAware: ['palette'], featureHighlights: ['procedural3d', 'native3d', 'morph', 'animation'], recommendedRecipes: ['native-3d-hero-scene', 'premium-3d-object-gallery'] },
    { name: 'transition-scene', version: '1.0.0', description: 'Before/after scene with content cues that makes transitions and morph behavior visually obvious.', category: 'motion', slots: [{ key: 'title', kind: 'text' }, { key: 'before', kind: 'text' }, { key: 'after', kind: 'text' }], variants: ['morph-pair', 'push-reveal', 'gallery-shift'], intentAware: ['motionLevel'], brandAware: ['palette'], featureHighlights: ['transition', 'morph', 'animation'], recommendedRecipes: ['transition-scene-suite'] },
];
function catalogEntry(name) {
    return COMPONENT_CATALOG.find(component => component.name === name);
}
export function listComponents() {
    return COMPONENT_CATALOG;
}
export function validateComponent(name, slots = {}) {
    const component = catalogEntry(name);
    if (!component)
        return { ok: false, errors: [{ pointer: '/name', code: 'unknown-component', message: `Unknown component: ${name}` }] };
    const errors = component.slots
        .filter(slot => slot.required && slots[slot.key] == null)
        .map(slot => ({ pointer: `/slots/${slot.key}`, code: 'required-slot-missing', message: `${name} requires slot ${slot.key}` }));
    return { ok: errors.length === 0, errors, component };
}
function textObject(name, text, x, y, w, h, fontSize, color = 'theme://text/primary', extra = {}) {
    return Object.assign({ kind: 'text', name, text, x, y, w, h, fontSize, color, margin: 0, fit: 'shrink' }, extra);
}
function normalizeChartData(chart) {
    if (Array.isArray(chart === null || chart === void 0 ? void 0 : chart.data))
        return chart.data;
    if (Array.isArray(chart === null || chart === void 0 ? void 0 : chart.series))
        return chart.series;
    if (Array.isArray(chart === null || chart === void 0 ? void 0 : chart.values)) {
        return [{
                name: chart.name || chart.seriesName || 'Series',
                labels: Array.isArray(chart.labels) ? chart.labels : chart.values.map((_, index) => `P${index + 1}`),
                values: chart.values,
            }];
    }
    return [{ name: 'Series', labels: ['A', 'B', 'C'], values: [3, 6, 4] }];
}
function renderComponent(component, slideIndex) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const name = String(component.name || component.componentName || 'hero-band');
    const slots = component.slots || {};
    const place = component.place || {};
    const x = Number((_b = (_a = component.x) !== null && _a !== void 0 ? _a : place.x) !== null && _b !== void 0 ? _b : 0.7);
    const y = Number((_d = (_c = component.y) !== null && _c !== void 0 ? _c : place.y) !== null && _d !== void 0 ? _d : 0.7);
    const w = Number((_f = (_e = component.w) !== null && _e !== void 0 ? _e : place.w) !== null && _f !== void 0 ? _f : 11.9);
    const h = Number((_h = (_g = component.h) !== null && _g !== void 0 ? _g : place.h) !== null && _h !== void 0 ? _h : 5.8);
    if (name === 'cinematic-hero') {
        return [
            { kind: 'shape', name: `cinematic-bg-${slideIndex}`, shapeType: 'rect', x, y, w, h, fill: gradientFill(['theme://bg/primary', 'theme://bg/elevated', 'theme://accent2'], 28), line: { color: 'theme://bg/primary', transparency: 100 } },
            { kind: 'shape', name: `cinematic-orbit-${slideIndex}`, shapeType: 'arc', x: x + w - 3.6, y: y + 0.7, w: 2.9, h: 2.9, line: { color: 'theme://accent1', width: 2.1, beginArrowType: 'triangle', endArrowType: 'triangle', transparency: 12 } },
            { kind: 'shape', name: `cinematic-depth-card-${slideIndex}`, shapeType: 'roundRect', x: x + w - 4.25, y: y + 1.25, w: 3.25, h: 2.2, fill: gradientFill(['theme://accent1', 'theme://accent2', 'theme://accent3'], 35), line: premiumLine('theme://text/primary', 58), rotate: -4, shadow: premiumShadow(0.34), effect3D: { bevel: { type: 'circle', width: 5, height: 5 }, extrusion: 2.5, extrusionColor: '8B5CF6', material: 'warmMatte', lightRig: 'threePt', rotationX: 9, rotationY: 8, perspective: 35 } },
            textObject(`cinematic-eyebrow-${slideIndex}`, String(slots.eyebrow || 'betterpptx-mcp recipe'), x + 0.38, y + 0.46, w - 0.76, 0.22, 8, 'theme://accent1', { bold: true }),
            textObject(`cinematic-title-${slideIndex}`, String(slots.title || 'Premium generated presentation'), x + 0.38, y + 1.35, w * 0.62, 0.92, 34, 'theme://text/primary', { fontFace: 'Aptos Display', bold: true, shadow: premiumShadow(0.28), fit: 'shrink' }),
            textObject(`cinematic-subtitle-${slideIndex}`, String(slots.subtitle || 'Feature-budget recipes apply gradients, shadows, advanced charts, 3D, media, WordArt, and motion.'), x + 0.42, y + 2.58, w * 0.55, 0.8, 14, 'theme://text/muted', { fit: 'shrink' }),
            { kind: 'wordart', name: `cinematic-wordart-${slideIndex}`, text: String(slots.word || 'LIVE'), x: x + w - 3.62, y: y + 1.88, w: 2.05, h: 0.68, fontFace: 'Aptos Display', fontSize: 27, bold: true, color: 'theme://accent1', wordArt: { transform: 'textArchUp' }, text3D: { bevel: { type: 'circle', width: 5, height: 5 }, extrusion: 3, extrusionColor: '8B5CF6', material: 'warmMatte', lightRig: 'threePt', rotationX: 8, rotationY: 12 }, shadow: premiumShadow(0.25), glow: { color: 'theme://accent1', size: 4, opacity: 0.3 }, reflection: { type: 'tight', opacity: 0.16, blur: 1, distance: 1.4 } },
        ];
    }
    if (name === '3d-lab-scene') {
        return [
            { kind: 'shape', name: `model3d-stage-${slideIndex}`, shapeType: 'roundRect', x, y, w, h, fill: gradientFill(['theme://bg/elevated', 'theme://bg/primary', 'theme://accent2'], 18), line: { color: 'theme://accent1', transparency: 32 }, shadow: premiumShadow(0.32) },
            textObject(`model3d-title-${slideIndex}`, String(slots.title || 'Native 3D model'), x + 0.4, y + 0.42, w * 0.48, 0.44, 23, 'theme://text/primary', { fontFace: 'Aptos Display', bold: true, shadow: premiumShadow(0.22) }),
            textObject(`model3d-body-${slideIndex}`, String(slots.body || 'Premium GLB fixtures, poster fallbacks, camera, lighting, model relationships, shadow, and motion cues are exposed as public MCP recipes.'), x + 0.44, y + 1.24, w * 0.43, 1.3, 13, 'theme://text/muted', { fit: 'shrink' }),
            { kind: 'model3d', name: `model3d-object-${slideIndex}`, src: slots.src || 'model3d://premium-orbit-torus', fallbackImage: slots.fallbackImage || 'stock://premium-3d-orbit-torus-poster', x: x + w * 0.52, y: y + 0.62, w: w * 0.38, h: h * 0.64, rotate: 5, shadow: premiumShadow(0.28), camera: { fov: 2700000, pos: { x: 0, y: 0, z: 78408333 } }, trans: { rot: { ay: 10800000 } }, objViewport: 3160014, ambientLight: { color: { r: 50000, g: 50000, b: 50000 }, illuminance: 0.5 } },
            { kind: 'shape', name: `model3d-orbit-${slideIndex}`, shapeType: 'arc', x: x + w * 0.51, y: y + 0.46, w: w * 0.42, h: h * 0.7, line: { color: 'theme://accent3', width: 1.6, beginArrowType: 'triangle', endArrowType: 'triangle' } },
        ];
    }
    if (name === '3d-model-gallery') {
        const requested = Array.isArray(slots.models) && slots.models.length ? slots.models : [
            { src: 'model3d://premium-orbit-torus', fallbackImage: 'stock://premium-3d-orbit-torus-poster', shape: 'blockArc' },
            { src: 'model3d://premium-ribbon-wave', fallbackImage: 'stock://premium-3d-ribbon-wave-poster', shape: 'arc' },
            { src: 'model3d://premium-growth-arrow', fallbackImage: 'stock://premium-3d-growth-arrow-poster', shape: 'chevron' },
            { src: 'model3d://premium-blue-presenter', fallbackImage: 'stock://premium-3d-blue-presenter-poster', shape: 'roundRect' },
        ];
        return [
            { kind: 'shape', name: `model3d-gallery-stage-${slideIndex}`, shapeType: 'roundRect', x, y, w, h, fill: gradientFill(['theme://bg/primary', 'theme://bg/elevated', 'theme://accent2'], 24), line: { color: 'theme://accent1', transparency: 38 }, shadow: premiumShadow(0.34) },
            textObject(`model3d-gallery-title-${slideIndex}`, String(slots.title || 'Premium native 3D object gallery'), x + 0.36, y + 0.32, w - 0.72, 0.36, 19, 'theme://text/primary', { fontFace: 'Aptos Display', bold: true, shadow: premiumShadow(0.2) }),
            ...requested.slice(0, 4).flatMap((model, index) => {
                const cellW = (w - 1.0) / 4;
                const mx = x + 0.42 + index * cellW;
                const my = y + 1.12;
                return [
                    { kind: 'shape', name: `model3d-gallery-pad-${slideIndex}-${index}`, shapeType: model.shape || (index % 2 ? 'arc' : 'blockArc'), x: mx + 0.22, y: my + 2.42, w: cellW - 0.55, h: 0.58, fill: gradientFill([DEFAULT_ACCENTS[index % DEFAULT_ACCENTS.length], 'theme://bg/elevated'], 22 + index * 17), line: premiumLine('theme://text/primary', 68), shadow: premiumShadow(0.18) },
                    { kind: 'model3d', name: `model3d-gallery-object-${slideIndex}-${index}`, src: model.src, fallbackImage: model.fallbackImage, x: mx + 0.1, y: my, w: cellW - 0.38, h: 2.42, rotate: (index - 1.5) * 4, shadow: premiumShadow(0.24), camera: { fov: 2700000, pos: { x: 0, y: 0, z: 72274889 } }, objViewport: 2851667 },
                ];
            }),
        ];
    }
    if (name === 'executive-dashboard') {
        const metrics = Array.isArray(slots.metrics) && slots.metrics.length ? slots.metrics : [
            { label: 'Pipeline', value: '42%' },
            { label: 'Quality', value: '98' },
            { label: 'Velocity', value: '3.4x' },
        ];
        return [
            { kind: 'shape', name: `dashboard-bg-${slideIndex}`, shapeType: 'roundRect', x, y, w, h, fill: { color: 'theme://bg/elevated', transparency: 2 }, line: { color: 'theme://accent1', transparency: 40 }, shadow: premiumShadow(0.28) },
            textObject(`dashboard-title-${slideIndex}`, String(slots.title || 'Executive dashboard'), x + 0.34, y + 0.28, w - 0.68, 0.32, 17, 'theme://text/primary', { fontFace: 'Aptos Display', bold: true }),
            { kind: 'chart', name: `dashboard-bar-${slideIndex}`, chartType: 'bar', data: [{ name: 'North', labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [22, 30, 38, 45] }, { name: 'South', labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [18, 24, 31, 36] }], x: x + 0.35, y: y + 0.88, w: w * 0.42, h: h * 0.44, showLegend: true, showTitle: true, title: 'Growth by region', chartColors: ['theme://accent1', 'theme://accent2'], chartArea: { fill: { color: 'theme://bg/elevated' } }, plotArea: { fill: { color: 'theme://bg/primary' } } },
            { kind: 'chart', name: `dashboard-scatter-${slideIndex}`, chartType: 'scatter', data: [{ name: 'X', values: [1, 2, 3, 4, 5, 6] }, { name: 'Signal', values: [2, 5, 4, 9, 7, 11] }, { name: 'Control', values: [1, 3, 6, 7, 10, 9] }], x: x + w * 0.52, y: y + 0.88, w: w * 0.39, h: h * 0.44, showLegend: false, showTitle: true, title: 'Signal quality', chartColors: ['theme://accent1', 'theme://accent3'] },
            ...metrics.slice(0, 3).flatMap((metric, index) => {
                const tx = x + 0.36 + index * (w * 0.29);
                return [
                    { kind: 'shape', name: `dashboard-kpi-${slideIndex}-${index}`, shapeType: 'roundRect', x: tx, y: y + h - 1.15, w: w * 0.25, h: 0.72, fill: gradientFill([DEFAULT_ACCENTS[index % DEFAULT_ACCENTS.length], 'theme://bg/elevated'], 25 + index * 11), line: premiumLine('theme://text/primary', 65), shadow: premiumShadow(0.2) },
                    textObject(`dashboard-kpi-value-${slideIndex}-${index}`, String(metric.value || metric.metric || ''), tx + 0.12, y + h - 0.98, w * 0.12, 0.22, 15, 'theme://text/primary', { bold: true, align: 'center' }),
                    textObject(`dashboard-kpi-label-${slideIndex}-${index}`, String(metric.label || metric.name || ''), tx + 0.12, y + h - 0.68, w * 0.16, 0.16, 7, 'theme://text/muted', { align: 'center' }),
                ];
            }),
            { kind: 'shape', name: `dashboard-gauge-${slideIndex}`, shapeType: 'blockArc', x: x + w - 1.26, y: y + h - 1.24, w: 0.72, h: 0.72, fill: { color: 'theme://accent1', transparency: 10 }, line: { color: 'theme://accent1', transparency: 100 }, shadow: premiumShadow(0.16) },
            { kind: 'shape', name: `dashboard-funnel-${slideIndex}`, shapeType: 'trapezoid', x: x + w - 2.1, y: y + h - 1.15, w: 0.72, h: 0.48, fill: { color: 'theme://accent3', transparency: 5 }, line: premiumLine('theme://text/primary', 70), shadow: premiumShadow(0.16) },
        ];
    }
    if (name === 'dense-chart-wall') {
        const chartSpecs = [
            { type: 'bar3D', title: '3D bars', data: [{ name: 'Series', labels: ['A', 'B', 'C'], values: [5, 9, 7] }] },
            { type: 'line', title: 'Trend', data: [{ name: 'Plan', labels: ['Jan', 'Feb', 'Mar', 'Apr'], values: [2, 4, 5, 9] }, { name: 'Actual', labels: ['Jan', 'Feb', 'Mar', 'Apr'], values: [3, 3, 6, 8] }] },
            { type: 'doughnut', title: 'Mix', data: [{ name: 'Mix', labels: ['A', 'B', 'C'], values: [25, 45, 30] }] },
            { type: 'radar', title: 'Coverage', data: [{ name: 'Score', labels: ['Text', 'Shapes', 'Charts', 'Motion', '3D'], values: [9, 8, 9, 8, 7] }] },
        ];
        return [
            textObject(`chart-wall-title-${slideIndex}`, String(slots.title || 'Native chart wall'), x, y, w, 0.34, 18, 'theme://text/primary', { fontFace: 'Aptos Display', bold: true }),
            ...chartSpecs.flatMap((chart, index) => {
                const cx = x + (index % 2) * (w / 2 + 0.15);
                const cy = y + 0.64 + Math.floor(index / 2) * ((h - 0.8) / 2 + 0.12);
                return [
                    { kind: 'shape', name: `chart-wall-panel-${slideIndex}-${index}`, shapeType: 'roundRect', x: cx, y: cy, w: w / 2 - 0.25, h: (h - 0.9) / 2, fill: { color: 'theme://bg/elevated' }, line: { color: DEFAULT_ACCENTS[index % DEFAULT_ACCENTS.length], transparency: 35 }, shadow: premiumShadow(0.18) },
                    { kind: 'chart', name: `chart-wall-${slideIndex}-${index}`, chartType: chart.type, data: chart.data, x: cx + 0.15, y: cy + 0.18, w: w / 2 - 0.55, h: (h - 1.2) / 2, showLegend: index !== 2, showTitle: true, title: chart.title, chartColors: ['theme://accent1', 'theme://accent2', 'theme://accent3'] },
                ];
            }),
        ];
    }
    if (name === 'data-story') {
        return [
            { kind: 'shape', name: `data-story-bg-${slideIndex}`, shapeType: 'roundRect', x, y, w, h, fill: { color: 'theme://bg/elevated' }, line: { color: 'theme://accent2', transparency: 42 }, shadow: premiumShadow(0.26) },
            textObject(`data-story-title-${slideIndex}`, String(slots.title || 'Shape-built analytical visuals'), x + 0.32, y + 0.32, w - 0.64, 0.34, 18, 'theme://text/primary', { fontFace: 'Aptos Display', bold: true }),
            { kind: 'shape', name: `data-story-waterfall-a-${slideIndex}`, shapeType: 'rect', x: x + 0.58, y: y + 1.6, w: 0.58, h: 1.2, fill: { color: 'theme://accent1' }, line: premiumLine('theme://text/primary', 70) },
            { kind: 'shape', name: `data-story-waterfall-b-${slideIndex}`, shapeType: 'rect', x: x + 1.42, y: y + 1.95, w: 0.58, h: 0.85, fill: { color: 'theme://accent3' }, line: premiumLine('theme://text/primary', 70) },
            { kind: 'shape', name: `data-story-candle-${slideIndex}`, shapeType: 'rect', x: x + 3.05, y: y + 1.7, w: 0.25, h: 0.92, fill: { color: 'theme://accent4' }, line: { color: 'theme://accent4' }, shadow: premiumShadow(0.16) },
            { kind: 'connector', name: `data-story-wick-${slideIndex}`, from: { x: x + 3.18, y: y + 1.38 }, to: { x: x + 3.18, y: y + 2.92 }, line: { color: 'theme://text/primary', width: 1 } },
            { kind: 'shape', name: `data-story-gantt-${slideIndex}`, shapeType: 'roundRect', x: x + 4.9, y: y + 1.72, w: 2.1, h: 0.24, fill: { color: 'theme://accent1' }, line: { color: 'theme://accent1' }, shadow: premiumShadow(0.12) },
            { kind: 'shape', name: `data-story-pie-${slideIndex}`, shapeType: 'pie', x: x + 7.72, y: y + 1.52, w: 1.1, h: 1.1, fill: { color: 'theme://accent2', transparency: 8 }, line: premiumLine('theme://text/primary', 55), shadow: premiumShadow(0.18) },
            { kind: 'shape', name: `data-story-chord-${slideIndex}`, shapeType: 'chord', x: x + 9.35, y: y + 1.56, w: 1.12, h: 1.08, fill: { color: 'theme://accent3', transparency: 8 }, line: premiumLine('theme://text/primary', 55), shadow: premiumShadow(0.18) },
        ];
    }
    if (name === 'media-voice-lab') {
        return [
            textObject(`media-title-${slideIndex}`, String(slots.title || 'Media and voice'), x, y, w, 0.34, 18, 'theme://text/primary', { fontFace: 'Aptos Display', bold: true }),
            { kind: 'shape', name: `media-video-frame-${slideIndex}`, shapeType: 'roundRect', x, y: y + 0.62, w: w * 0.48, h: h - 0.9, fill: { color: 'theme://bg/elevated' }, line: { color: 'theme://accent1', transparency: 35 }, shadow: premiumShadow(0.24) },
            { kind: 'media', name: `media-video-${slideIndex}`, mediaType: 'video', src: 'video://sample-mp4', cover: 'stock://betterpptx-mcp-logo', x: x + 0.24, y: y + 0.9, w: w * 0.43, h: h - 1.58 },
            { kind: 'shape', name: `media-voice-frame-${slideIndex}`, shapeType: 'roundRect', x: x + w * 0.54, y: y + 0.62, w: w * 0.42, h: h - 0.9, fill: gradientFill(['theme://bg/elevated', 'theme://accent2'], 32), line: { color: 'theme://accent2', transparency: 35 }, shadow: premiumShadow(0.24) },
            { kind: 'media', name: `media-audio-${slideIndex}`, mediaType: 'audio', src: 'audio://sample-mp3', x: x + w * 0.57, y: y + h - 0.75, w: 0.3, h: 0.3 },
            { kind: 'shape', name: `media-wave-${slideIndex}`, shapeType: 'wave', x: x + w * 0.6, y: y + 2.2, w: w * 0.3, h: 0.78, fill: { color: 'theme://accent1', transparency: 16 }, line: { color: 'theme://accent1', transparency: 28 }, shadow: premiumShadow(0.16) },
            textObject(`media-caption-${slideIndex}`, String(slots.caption || 'Video, audio, cover posters, and media command timing are available through MCP recipes.'), x + w * 0.58, y + 3.25, w * 0.34, 0.5, 10, 'theme://text/muted', { align: 'center', fit: 'shrink' }),
        ];
    }
    if (name === 'wordart-effects-panel') {
        const words = Array.isArray(slots.words) && slots.words.length ? slots.words : ['CURVE', 'ORBIT', 'WAVE', 'DEPTH'];
        const transforms = ['textArchUp', 'textCircle', 'textWave1', 'textInflate'];
        return [
            textObject(`wordart-panel-title-${slideIndex}`, String(slots.title || 'WordArt effects'), x, y, w, 0.34, 18, 'theme://text/primary', { fontFace: 'Aptos Display', bold: true }),
            ...words.slice(0, 4).map((word, index) => ({
                kind: 'wordart',
                name: `wordart-panel-${slideIndex}-${index}`,
                text: String(word),
                x: x + 0.3 + index * (w / 4),
                y: y + 1.65,
                w: w / 4 - 0.45,
                h: 0.82,
                fontFace: 'Aptos Display',
                fontSize: 26,
                bold: true,
                color: DEFAULT_ACCENTS[index % DEFAULT_ACCENTS.length],
                wordArt: { transform: transforms[index % transforms.length] },
                text3D: { bevel: { type: 'circle', width: 5, height: 5 }, extrusion: 3 + index, extrusionColor: HEX_ACCENTS[(index + 1) % HEX_ACCENTS.length], material: 'warmMatte', lightRig: 'threePt', rotationX: 8 + index, rotationY: 9 + index },
                shadow: premiumShadow(0.28),
                glow: { color: DEFAULT_ACCENTS[index % DEFAULT_ACCENTS.length], size: 4, opacity: 0.3 },
                reflection: { type: 'tight', opacity: 0.18, blur: 1, distance: 1.5 },
            })),
        ];
    }
    if (name === 'motion-lab') {
        const labels = ['entry', 'exit', 'color', 'scale', 'spin', 'path'];
        return [
            textObject(`motion-lab-title-${slideIndex}`, String(slots.title || 'Animation lab'), x, y, w, 0.34, 18, 'theme://text/primary', { fontFace: 'Aptos Display', bold: true }),
            ...labels.map((label, index) => ({
                kind: 'shape',
                name: `motion-lab-${slideIndex}-${label}`,
                shapeType: index % 2 ? 'hexagon' : 'roundRect',
                x: x + 0.25 + (index % 3) * (w / 3),
                y: y + 1.12 + Math.floor(index / 3) * 1.72,
                w: w / 3 - 0.58,
                h: 0.86,
                fill: gradientFill([DEFAULT_ACCENTS[index % DEFAULT_ACCENTS.length], 'theme://bg/elevated'], 20 + index * 12),
                line: premiumLine('theme://text/primary', 54),
                shadow: premiumShadow(0.22),
            })),
        ];
    }
    if (name === 'shape-icon-cloud') {
        const shapes = Array.isArray(slots.icons) && slots.icons.length ? slots.icons : ['trapezoid', 'arc', 'blockArc', 'chord', 'pie', 'chevron', 'flowChartProcess', 'hexagon'];
        return [
            textObject(`shape-icon-title-${slideIndex}`, String(slots.title || 'Shape-built icon system'), x, y, w, 0.34, 18, 'theme://text/primary', { fontFace: 'Aptos Display', bold: true }),
            ...shapes.slice(0, 8).map((shape, index) => ({
                kind: 'shape',
                name: `shape-icon-${slideIndex}-${index}`,
                shapeType: String(shape),
                x: x + 0.35 + (index % 4) * (w / 4),
                y: y + 1.1 + Math.floor(index / 4) * 1.6,
                w: 0.95,
                h: 0.8,
                fill: gradientFill([DEFAULT_ACCENTS[index % DEFAULT_ACCENTS.length], 'theme://bg/elevated'], 18 + index * 10),
                line: premiumLine('theme://text/primary', 58),
                shadow: premiumShadow(0.2),
                rotate: (index % 3 - 1) * 5,
            })),
        ];
    }
    if (name === 'custom-shape-sculpture') {
        return [
            { kind: 'shape', name: `custom-sculpture-stage-${slideIndex}`, shapeType: 'roundRect', x, y, w, h, fill: gradientFill(['theme://bg/elevated', 'theme://bg/primary', 'theme://accent2'], 28), line: { color: 'theme://accent1', transparency: 36 }, shadow: premiumShadow(0.3) },
            textObject(`custom-sculpture-title-${slideIndex}`, String(slots.title || 'Custom editable geometry'), x + 0.36, y + 0.32, w - 0.72, 0.34, 18, 'theme://text/primary', { fontFace: 'Aptos Display', bold: true }),
            {
                kind: 'shape',
                name: `custom-sculpture-path-${slideIndex}`,
                shapeType: 'custGeom',
                x: x + 0.72,
                y: y + 1.28,
                w: w * 0.34,
                h: h * 0.56,
                fill: gradientFill(['theme://accent1', 'theme://accent3', 'theme://accent2'], 35),
                line: { color: 'theme://text/primary', width: 1, transparency: 38 },
                points: [
                    { x: 0, y: 0.22, moveTo: true },
                    { x: 1.18, y: 0 },
                    { x: 2.72, y: 0.58, curve: { type: 'quadratic', x1: 2.02, y1: -0.33 } },
                    { x: 3.18, y: 1.88 },
                    { x: 1.42, y: 2.28, curve: { type: 'cubic', x1: 2.78, y1: 2.38, x2: 2.08, y2: 1.08 } },
                    { x: 0, y: 1.42 },
                    { close: true },
                ],
                shadow: premiumShadow(0.28),
                effect3D: { bevel: { type: 'circle', width: 4, height: 4 }, extrusion: 2, extrusionColor: '8B5CF6', material: 'warmMatte', lightRig: 'threePt', rotationX: 7, rotationY: 11 },
            },
            { kind: 'shape', name: `custom-sculpture-node-a-${slideIndex}`, shapeType: 'ellipse', x: x + w * 0.55, y: y + 1.35, w: 0.88, h: 0.88, fill: gradientFill(['theme://accent1', 'theme://bg/elevated'], 20), line: premiumLine('theme://text/primary', 62), shadow: premiumShadow(0.18) },
            { kind: 'shape', name: `custom-sculpture-node-b-${slideIndex}`, shapeType: 'hexagon', x: x + w * 0.78, y: y + 1.35, w: 0.92, h: 0.82, fill: gradientFill(['theme://accent3', 'theme://bg/elevated'], 32), line: premiumLine('theme://text/primary', 62), shadow: premiumShadow(0.18) },
            { kind: 'shape', name: `custom-sculpture-node-c-${slideIndex}`, shapeType: 'flowChartProcess', x: x + w * 0.66, y: y + 3.62, w: 1.2, h: 0.62, fill: gradientFill(['theme://accent4', 'theme://bg/elevated'], 44), line: premiumLine('theme://text/primary', 62), shadow: premiumShadow(0.18) },
            { kind: 'connector', name: `custom-sculpture-link-ab-${slideIndex}`, from: `custom-sculpture-node-a-${slideIndex}`, to: `custom-sculpture-node-b-${slideIndex}`, line: { color: 'theme://accent1', width: 1.4, beginArrowType: 'oval', endArrowType: 'triangle' } },
            { kind: 'connector', name: `custom-sculpture-link-ac-${slideIndex}`, from: `custom-sculpture-node-a-${slideIndex}`, to: `custom-sculpture-node-c-${slideIndex}`, line: { color: 'theme://accent3', width: 1.2, dashType: 'dashDot', endArrowType: 'arrow' } },
            { kind: 'connector', name: `custom-sculpture-link-bc-${slideIndex}`, from: `custom-sculpture-node-b-${slideIndex}`, to: `custom-sculpture-node-c-${slideIndex}`, line: { color: 'theme://accent4', width: 1.2, dashType: 'lgDash', endArrowType: 'diamond' } },
        ];
    }
    if (name === 'procedural-map-scene') {
        const mapX = x + 0.34;
        const mapY = y + 0.82;
        const mapW = w - 0.68;
        const mapH = h - 1.18;
        const poly = (id, pts, fill, tags = ['customGeometry', 'worldMap']) => ({
            kind: 'shape',
            name: `earth-map-${slideIndex}-${id}`,
            shapeType: 'custGeom',
            x: mapX,
            y: mapY,
            w: mapW,
            h: mapH,
            fill: { color: fill, transparency: id.includes('focus') ? 4 : 12 },
            line: { color: id.includes('focus') ? 'theme://text/primary' : 'theme://accent1', transparency: 22, width: 0.75 },
            points: [...pts.map(([px, py], index) => (Object.assign({ x: px * mapW, y: py * mapH }, (index === 0 ? { moveTo: true } : {})))), { close: true }],
            shadow: premiumShadow(0.13),
            geometryKind: id.includes('focus') ? 'region-highlight' : 'world-map',
            coverageTags: tags,
        });
        return [
            { kind: 'shape', name: `earth-map-stage-${slideIndex}`, shapeType: 'roundRect', x, y, w, h, fill: gradientFill(['theme://bg/primary', 'theme://bg/elevated', 'theme://accent2'], 20), line: { color: 'theme://accent1', transparency: 38 }, shadow: premiumShadow(0.26) },
            textObject(`earth-map-title-${slideIndex}`, String(slots.title || 'Native custom-geometry map scene'), x + 0.34, y + 0.28, w - 0.68, 0.32, 18, 'theme://text/primary', { fontFace: 'Aptos Display', bold: true }),
            poly('north-america', [[0.04, 0.12], [0.2, 0.1], [0.35, 0.24], [0.28, 0.42], [0.16, 0.38], [0.04, 0.12]], '134E4A'),
            poly('south-america', [[0.28, 0.45], [0.38, 0.48], [0.43, 0.63], [0.37, 0.95], [0.28, 0.78], [0.28, 0.45]], '166534'),
            poly('africa', [[0.47, 0.32], [0.58, 0.34], [0.64, 0.53], [0.59, 0.82], [0.49, 0.67], [0.47, 0.32]], '14532D'),
            poly('eurasia', [[0.52, 0.12], [0.78, 0.13], [0.93, 0.31], [0.79, 0.45], [0.6, 0.37], [0.52, 0.12]], '134E4A'),
            poly('focus-a', [[0.3, 0.49], [0.4, 0.5], [0.41, 0.59], [0.34, 0.65], [0.29, 0.57], [0.3, 0.49]], '22C55E', ['customGeometry', 'worldMap', 'region-highlight']),
            poly('focus-b', [[0.52, 0.48], [0.59, 0.49], [0.6, 0.58], [0.54, 0.61], [0.51, 0.55], [0.52, 0.48]], '22C55E', ['customGeometry', 'worldMap', 'region-highlight']),
            poly('focus-c', [[0.77, 0.48], [0.88, 0.49], [0.88, 0.61], [0.8, 0.64], [0.77, 0.48]], '22C55E', ['customGeometry', 'worldMap', 'region-highlight']),
        ];
    }
    if (name === 'procedural-3d-scene') {
        const requested = Array.isArray(slots.assets) && slots.assets.length ? slots.assets : [
            { src: 'procedural3d://abstract-hero?seed=dynamic-hero&theme=cinematic&style=cinematic' },
            { src: 'procedural3d://globe?seed=dynamic-globe&theme=cinematic&style=cinematic' },
            { src: 'procedural3d://route-arc?seed=dynamic-route&theme=cinematic&style=cinematic' },
        ];
        return [
            { kind: 'shape', name: `procedural-3d-stage-${slideIndex}`, shapeType: 'roundRect', x, y, w, h, fill: gradientFill(['theme://bg/primary', '064E3B', 'theme://accent1'], 18), line: { color: 'theme://accent1', transparency: 36 }, shadow: premiumShadow(0.32) },
            textObject(`procedural-3d-title-${slideIndex}`, String(slots.title || 'Procedural 3D scene'), x + 0.38, y + 0.34, w * 0.58, 0.38, 19, 'theme://text/primary', { fontFace: 'Aptos Display', bold: true, shadow: premiumShadow(0.2) }),
            textObject(`procedural-3d-body-${slideIndex}`, String(slots.body || 'Generated GLB objects, poster fallbacks, stable object names, and motion cues can be composed by any AI client through public MCP tools.'), x + 0.42, y + 1.08, w * 0.42, 1.1, 12, 'theme://text/muted', { fit: 'shrink' }),
            ...requested.slice(0, 3).map((asset, index) => ({
                kind: 'model3d',
                name: `procedural-3d-object-${slideIndex}-${index}`,
                src: asset.src || asset.handle || asset,
                x: x + w * (0.18 + index * 0.2),
                y: y + (index === 0 ? h * 0.52 : 0.86),
                w: w * (index === 0 ? 0.28 : 0.24),
                h: h * (index === 0 ? 0.3 : 0.42),
                rotate: (index - 1) * 5,
                shadow: premiumShadow(0.24),
                camera: { fov: 2700000, pos: { x: 0, y: 0, z: 78408333 } },
                objViewport: 2851667,
            })),
            { kind: 'shape', name: `procedural-3d-orbit-${slideIndex}`, shapeType: 'arc', x: x + w * 0.52, y: y + 0.38, w: w * 0.38, h: h * 0.56, line: { color: 'theme://accent3', width: 1.5, beginArrowType: 'triangle', endArrowType: 'triangle' } },
        ];
    }
    if (name === 'transition-scene') {
        return [
            { kind: 'shape', name: `transition-stage-${slideIndex}`, shapeType: 'roundRect', x, y, w, h, fill: gradientFill(['theme://bg/elevated', 'theme://bg/primary', 'theme://accent1'], 35), line: { color: 'theme://accent1', transparency: 38 }, shadow: premiumShadow(0.25) },
            textObject(`transition-title-${slideIndex}`, String(slots.title || 'Applied transition scene'), x + 0.34, y + 0.34, w - 0.68, 0.34, 18, 'theme://text/primary', { fontFace: 'Aptos Display', bold: true }),
            { kind: 'shape', name: `transition-before-${slideIndex}`, shapeType: 'roundRect', x: x + 0.72, y: y + 1.35, w: 3.0, h: 1.4, fill: { color: 'theme://accent1', transparency: 8 }, line: premiumLine('theme://text/primary', 60), shadow: premiumShadow(0.2) },
            textObject(`transition-before-label-${slideIndex}`, String(slots.before || 'before'), x + 1.04, y + 1.84, 2.25, 0.22, 13, 'theme://text/primary', { bold: true, align: 'center' }),
            { kind: 'connector', name: `transition-arrow-${slideIndex}`, from: { x: x + 4.2, y: y + 2.05 }, to: { x: x + 6.7, y: y + 2.05 }, line: { color: 'theme://text/primary', width: 1.2, endArrowType: 'triangle' } },
            { kind: 'shape', name: `transition-after-${slideIndex}`, shapeType: 'roundRect', x: x + 7.1, y: y + 1.35, w: 3.0, h: 1.4, fill: { color: 'theme://accent3', transparency: 8 }, line: premiumLine('theme://text/primary', 60), shadow: premiumShadow(0.2) },
            textObject(`transition-after-label-${slideIndex}`, String(slots.after || 'after'), x + 7.42, y + 1.84, 2.25, 0.22, 13, 'theme://text/primary', { bold: true, align: 'center' }),
        ];
    }
    if (name === 'hero-band') {
        return [
            { kind: 'shape', name: `hero-bg-${slideIndex}`, shapeType: 'rect', x, y, w, h, fill: gradientFill(['theme://bg/elevated', 'theme://bg/primary', 'theme://accent1'], 22), line: { color: 'theme://bg/elevated', transparency: 100 }, shadow: premiumShadow(0.18) },
            textObject(`hero-eyebrow-${slideIndex}`, String(slots.eyebrow || 'betterpptx-mcp'), x + 0.25, y + 0.28, w - 0.5, 0.18, 8, 'theme://accent1', { bold: true }),
            textObject(`hero-title-${slideIndex}`, String(slots.title || 'Untitled'), x + 0.25, y + 0.88, w * 0.68, 0.82, 34, 'theme://text/primary', { fontFace: 'Aptos Display', bold: true, shadow: premiumShadow(0.22) }),
            textObject(`hero-subtitle-${slideIndex}`, String(slots.subtitle || ''), x + 0.3, y + 1.92, w * 0.58, 0.72, 14, 'theme://text/muted'),
            { kind: 'shape', name: `hero-accent-${slideIndex}`, shapeType: 'arc', x: x + w - 2.35, y: y + 0.88, w: 1.8, h: 1.8, line: { color: 'theme://accent1', width: 2, beginArrowType: 'triangle', endArrowType: 'triangle' } },
        ];
    }
    if (name === 'stat-row') {
        const stats = Array.isArray(slots.stats) ? slots.stats : [];
        return stats.slice(0, 5).flatMap((stat, index) => {
            const tileW = (w - 0.18 * Math.max(0, stats.length - 1)) / Math.max(1, Math.min(5, stats.length));
            const tx = x + index * (tileW + 0.18);
            return [
                { kind: 'shape', name: `stat-tile-${slideIndex}-${index}`, shapeType: 'roundRect', x: tx, y, w: tileW, h, fill: { color: 'theme://bg/elevated' }, line: { color: DEFAULT_ACCENTS[index % DEFAULT_ACCENTS.length], transparency: 20 } },
                textObject(`stat-value-${slideIndex}-${index}`, String(stat.value || stat.metric || ''), tx + 0.18, y + 0.3, tileW - 0.36, 0.32, 20, DEFAULT_ACCENTS[index % DEFAULT_ACCENTS.length], { bold: true, align: 'center' }),
                textObject(`stat-label-${slideIndex}-${index}`, String(stat.label || stat.name || ''), tx + 0.18, y + 0.76, tileW - 0.36, 0.32, 9, 'theme://text/muted', { align: 'center' }),
            ];
        });
    }
    if (name === 'chart-card') {
        const chart = slots.chart || { chartType: 'bar', data: [{ name: 'Series', labels: ['A', 'B', 'C'], values: [3, 6, 4] }] };
        const data = normalizeChartData(chart);
        return [
            { kind: 'shape', name: `chart-card-${slideIndex}`, shapeType: 'roundRect', x, y, w, h, fill: { color: 'theme://bg/elevated' }, line: { color: 'theme://accent2', transparency: 25 } },
            textObject(`chart-title-${slideIndex}`, String(slots.title || 'Chart'), x + 0.25, y + 0.22, w - 0.5, 0.28, 15, 'theme://text/primary', { bold: true }),
            { kind: 'chart', name: `chart-${slideIndex}`, chartType: chart.chartType || chart.type || 'bar', data, x: x + 0.25, y: y + 0.68, w: w - 0.5, h: h - 1.25, showLegend: true, showTitle: false },
            textObject(`chart-caption-${slideIndex}`, String(slots.caption || ''), x + 0.25, y + h - 0.38, w - 0.5, 0.18, 8, 'theme://text/muted'),
        ];
    }
    if (name === 'process-chevrons') {
        const steps = Array.isArray(slots.steps) ? slots.steps : [];
        return steps.slice(0, 6).flatMap((step, index) => {
            const stepW = (w - 0.12 * Math.max(0, steps.length - 1)) / Math.max(1, Math.min(6, steps.length));
            const sx = x + index * (stepW + 0.12);
            return [
                { kind: 'shape', name: `process-step-${slideIndex}-${index}`, shapeType: 'chevron', x: sx, y, w: stepW, h, fill: { color: DEFAULT_ACCENTS[index % DEFAULT_ACCENTS.length] }, line: { color: 'theme://text/primary', transparency: 60 } },
                textObject(`process-label-${slideIndex}-${index}`, String(step.label || step.title || step), sx + 0.12, y + h / 2 - 0.12, stepW - 0.24, 0.24, 8, '071018', { bold: true, align: 'center' }),
            ];
        });
    }
    if (name === 'section-divider' || name === 'call-to-action') {
        return [
            { kind: 'shape', name: `${name}-panel-${slideIndex}`, shapeType: 'rect', x, y, w, h, fill: { color: 'theme://bg/elevated' }, line: { color: 'theme://accent1', transparency: 100 } },
            textObject(`${name}-title-${slideIndex}`, String(slots.title || 'Section'), x + 0.35, y + 1.0, w - 0.7, 0.75, 32, 'theme://text/primary', { fontFace: 'Aptos Display', bold: true, align: 'center' }),
            textObject(`${name}-subtitle-${slideIndex}`, String(slots.subtitle || slots.button || ''), x + 1.25, y + 2.02, w - 2.5, 0.42, 14, 'theme://text/muted', { align: 'center' }),
        ];
    }
    return [
        { kind: 'shape', name: `${name}-panel-${slideIndex}`, shapeType: 'roundRect', x, y, w, h, fill: { color: 'theme://bg/elevated' }, line: { color: 'theme://accent1', transparency: 25 } },
        textObject(`${name}-title-${slideIndex}`, String(slots.title || slots.quote || name), x + 0.25, y + 0.28, w - 0.5, 0.5, 18, 'theme://text/primary', { bold: true }),
        textObject(`${name}-body-${slideIndex}`, String(slots.body || slots.subtitle || slots.attribution || ''), x + 0.28, y + 1.0, w - 0.56, h - 1.2, 12, 'theme://text/muted'),
    ];
}
export function expandDesignSystemSpec(spec) {
    const slides = Array.isArray(spec === null || spec === void 0 ? void 0 : spec.slides) ? spec.slides : [];
    return Object.assign(Object.assign({}, spec), { slides: slides.map((slide, slideIndex) => (Object.assign(Object.assign({}, slide), { objects: (Array.isArray(slide.objects) && slide.objects.length ? slide.objects : legacySlideObjects(slide, slideIndex)).flatMap((object) => {
                if ((object === null || object === void 0 ? void 0 : object.kind) === 'component' || (object === null || object === void 0 ? void 0 : object.componentName) || catalogEntry(object === null || object === void 0 ? void 0 : object.name))
                    return renderComponent(object, slideIndex);
                return object;
            }) }))) });
}
function legacySlideObjects(slide, slideIndex) {
    const objects = [];
    if (slide === null || slide === void 0 ? void 0 : slide.title) {
        objects.push({ kind: 'text', name: `legacy-title-${slideIndex}`, text: String(slide.title), x: 0.7, y: 0.52, w: 10.8, h: 0.42, fontSize: 24, bold: true, color: 'theme://text/primary', fontFace: 'Aptos Display' });
    }
    if (slide === null || slide === void 0 ? void 0 : slide.body) {
        objects.push({ kind: 'text', name: `legacy-body-${slideIndex}`, text: String(slide.body), x: 0.82, y: 1.18, w: 5.9, h: 1.15, fontSize: 13, color: 'theme://text/muted', fit: 'shrink' });
    }
    if (Array.isArray(slide === null || slide === void 0 ? void 0 : slide.bullets)) {
        objects.push({ kind: 'text', name: `legacy-bullets-${slideIndex}`, text: slide.bullets.map((text) => ({ text, options: { bullet: { indent: 12 }, breakLine: true } })), x: 0.95, y: 2.55, w: 5.65, h: 1.85, fontSize: 11, color: 'theme://text/primary' });
    }
    if (slide === null || slide === void 0 ? void 0 : slide.chart) {
        objects.push({ kind: 'component', name: 'chart-card', slots: { title: slide.chart.title || slide.title || 'Chart', chart: Object.assign(Object.assign({}, slide.chart), { chartType: slide.chart.type || slide.chart.chartType || 'bar', data: normalizeChartData(slide.chart) }), caption: slide.chart.caption || '' }, x: 7.0, y: 1.15, w: 5.1, h: 4.1 });
    }
    if (slide === null || slide === void 0 ? void 0 : slide.table) {
        objects.push({ kind: 'table', name: `legacy-table-${slideIndex}`, rows: slide.table.rows || [['Metric', 'Value']], x: 7.18, y: 4.95, w: 4.7, h: 1.2, fontSize: 9, color: 'theme://text/primary', fill: { color: 'theme://bg/elevated' }, border: { color: 'theme://accent1', pt: 0.75 } });
    }
    if (!objects.length) {
        objects.push({ kind: 'component', name: 'hero-band', slots: { eyebrow: 'betterpptx-mcp', title: specTitle(slide, slideIndex), subtitle: 'Generated through the design-system mode.' }, x: 0.65, y: 0.65, w: 12.0, h: 6.1 });
    }
    return objects;
}
function specTitle(slide, slideIndex) {
    return String((slide === null || slide === void 0 ? void 0 : slide.title) || `Generated scene ${slideIndex + 1}`);
}
export function buildDesignSystemDeck(args, outputPath, sourcePath, repoRoot) {
    return __awaiter(this, void 0, void 0, function* () {
        const expanded = expandDesignSystemSpec((args === null || args === void 0 ? void 0 : args.spec) || {});
        return buildExpressiveDeck(Object.assign(Object.assign({}, args), { mode: 'expressive', spec: expanded }), outputPath, sourcePath, repoRoot);
    });
}
function titleCase(value) {
    return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
export function outlineToDesignSystemSpec(outline, intent = {}, title = 'Generated betterpptx-mcp deck') {
    var _a;
    const featureBudget = normalizeFeatureBudget({ intent });
    const lines = outline.split(/\r?\n/);
    const headings = [];
    let current = null;
    for (const line of lines) {
        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
            current = { level: heading[1].length, text: heading[2].trim(), bullets: [] };
            headings.push(current);
            continue;
        }
        const bullet = line.match(/^\s*[-*]\s+(.+)$/);
        if (bullet && current)
            current.bullets.push(bullet[1].trim());
    }
    const deckTitle = ((_a = headings.find(item => item.level === 1)) === null || _a === void 0 ? void 0 : _a.text) || title;
    const sections = headings.filter(item => item.level >= 2);
    const premium = featureBudget.visualQuality !== 'standard' && featureBudget.featureDepth !== 'basic';
    const advancedCharts = featureBudget.chartRichness !== 'native' || featureBudget.requireFeatures.includes('advancedCharts');
    const slides = [
        {
            transition: { type: 'fade', speed: 'fast' },
            objects: [{ kind: 'component', name: premium ? 'cinematic-hero' : 'hero-band', slots: { eyebrow: 'betterpptx-mcp', title: deckTitle, subtitle: premium ? 'Built from outline with betterpptx-mcp premium recipes: depth, data, 3D, media, and content motion.' : 'Generated from a deterministic outline-to-deck flow.' }, x: 0.55, y: 0.55, w: 12.2, h: 6.25 }],
            animations: [{ target: premium ? 'cinematic-title-0' : 'hero-title-0', kind: 'entrance', effect: 'fade', duration: 700 }],
        },
        ...sections.map((section, index) => {
            const hasNumbers = section.bullets.some(item => /\d/.test(item));
            const component = premium && hasNumbers && advancedCharts
                ? 'executive-dashboard'
                : premium && index % 5 === 1
                    ? 'wordart-effects-panel'
                    : premium && index % 5 === 2
                        ? 'motion-lab'
                        : premium && index % 5 === 3
                            ? 'shape-icon-cloud'
                            : hasNumbers
                                ? 'stat-row'
                                : index % 3 === 0 ? 'process-chevrons' : 'side-by-side';
            const slots = component === 'stat-row'
                ? { stats: section.bullets.slice(0, 4).map((item, i) => { var _a; return ({ label: item.replace(/\d+[.,]?\d*%?/g, '').trim() || `Metric ${i + 1}`, value: ((_a = item.match(/\d+[.,]?\d*%?/)) === null || _a === void 0 ? void 0 : _a[0]) || `${i + 1}` }); }) }
                : component === 'executive-dashboard'
                    ? { title: section.text, metrics: section.bullets.slice(0, 3).map((item, i) => { var _a; return ({ label: item.replace(/\d+[.,]?\d*%?/g, '').trim() || `Metric ${i + 1}`, value: ((_a = item.match(/\d+[.,]?\d*%?/)) === null || _a === void 0 ? void 0 : _a[0]) || `${i + 1}` }); }) }
                    : component === 'wordart-effects-panel'
                        ? { title: section.text, words: section.bullets.slice(0, 4).map(item => item.split(/\s+/)[0] || 'AIM') }
                        : component === 'motion-lab'
                            ? { title: section.text }
                            : component === 'shape-icon-cloud'
                                ? { title: section.text }
                                : component === 'process-chevrons'
                                    ? { steps: section.bullets.slice(0, 5).map(item => ({ label: item })) }
                                    : { title: section.text, body: section.bullets.join('\n') };
            return {
                transition: { type: index % 2 ? 'push' : 'wipe', speed: 'fast' },
                objects: [
                    { kind: 'text', name: `section-heading-${index}`, text: titleCase(section.text), x: 0.72, y: 0.52, w: 10.5, h: 0.42, fontSize: 24, bold: true, color: 'theme://text/primary' },
                    { kind: 'component', name: component, slots, x: 0.9, y: 1.42, w: 11.25, h: 3.7 },
                ],
                animations: [
                    { target: `section-heading-${index}`, kind: 'entrance', effect: 'fade', duration: 620 },
                    ...(premium && component === 'motion-lab' ? [
                        { target: `motion-lab-${index + 1}-entry`, kind: 'entrance', effect: 'zoom', duration: 620 },
                        { target: `motion-lab-${index + 1}-path`, kind: 'motionPath', path: 'sineWave', duration: 900 },
                    ] : []),
                ],
            };
        }),
        ...(premium ? [
            {
                transition: { type: 'fade', speed: 'fast' },
                objects: [{ kind: 'component', name: '3d-model-gallery', slots: { title: 'Native 3D as a normal deck feature' }, x: 0.7, y: 0.85, w: 11.9, h: 5.65 }],
                animations: [
                    { target: `model3d-gallery-object-${sections.length + 1}-0`, kind: 'emphasis', effect: 'pulse', duration: 850 },
                    { target: `model3d-gallery-object-${sections.length + 1}-1`, kind: 'motionPath', path: 'sineWave', duration: 1100 },
                    { target: `model3d-gallery-object-${sections.length + 1}-2`, kind: 'entrance', effect: 'zoom', duration: 700 },
                ],
            },
            {
                transition: { type: 'fade', speed: 'fast' },
                objects: [{ kind: 'component', name: 'media-voice-lab', slots: { title: 'Media and voice as first-class slide objects' }, x: 0.7, y: 0.85, w: 11.9, h: 5.65 }],
                animations: [
                    { target: `media-video-${sections.length + 2}`, kind: 'media', command: 'play', duration: 1000 },
                    { target: `media-audio-${sections.length + 2}`, kind: 'media', command: 'play', duration: 1000 },
                ],
            },
        ] : []),
        {
            transition: { type: 'fade', speed: 'fast' },
            objects: [{ kind: 'component', name: 'call-to-action', slots: { title: 'Validated and ready', subtitle: 'PPTX, source, reports, and manifest are returned as artifacts.' }, x: 0.7, y: 0.85, w: 11.9, h: 5.65 }],
            animations: [{ target: `call-to-action-title-${sections.length + (premium ? 3 : 1)}`, kind: 'entrance', effect: 'zoom', duration: 700 }],
        },
    ];
    return { title: deckTitle, brief: outline.slice(0, 2000), intent, featureBudget, slides };
}
//# sourceMappingURL=design-system.js.map