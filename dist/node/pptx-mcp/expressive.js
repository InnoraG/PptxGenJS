var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
import * as fs from 'fs';
import * as path from 'path';
import { BETTERPPTX_MCP_BRAND, loadBetterPptxMcpPresentationEngine } from './showcase.js';
import { findAsset } from './assets.js';
import { solveLayout } from './layout-solver.js';
import { isProceduralAssetHandle, materializeProceduralAssetHandle } from './procedural-assets.js';
import { validateExpressiveSpec } from './validation/expressive.js';
import { normalizeNativeChartType } from './chart-presets.js';
import { resolveChartPlan } from './chart-plan.js';
const SLIDE_WIDE = { width: 13.333, height: 7.5 };
export class ExpressiveSpecValidationError extends Error {
    constructor(result) {
        super('Expressive spec validation failed');
        this.result = result;
    }
}
function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}
function cleanColor(value) {
    return value.replace(/^#/, '').toUpperCase();
}
function themeToken(value) {
    const token = value.slice('theme://'.length);
    const head = token.split('/shade-')[0].split('/tint-')[0].split('/lumMod-')[0];
    const map = {
        'bg/primary': 'bg1',
        'bg/elevated': 'bg2',
        'text/primary': 'tx1',
        'text/muted': 'tx2',
        accent1: 'accent1',
        accent2: 'accent2',
        accent3: 'accent3',
        accent4: 'accent4',
        accent5: 'accent5',
        accent6: 'accent6',
        link: 'hlink',
        'link/visited': 'folHlink',
    };
    return map[head] || 'accent1';
}
function resolveColor(value, brandKit) {
    var _a, _b;
    if (typeof value !== 'string')
        return value;
    if (value.startsWith('theme://'))
        return themeToken(value);
    if (value.startsWith('brand://')) {
        const key = value.slice('brand://'.length).split('/').pop() || '';
        return cleanColor(((_a = brandKit === null || brandKit === void 0 ? void 0 : brandKit.palette) === null || _a === void 0 ? void 0 : _a[key]) || ((_b = brandKit === null || brandKit === void 0 ? void 0 : brandKit.palette) === null || _b === void 0 ? void 0 : _b.accent1) || '20D6E7');
    }
    if (/^#[0-9a-f]{6}$/i.test(value))
        return cleanColor(value);
    return value;
}
function normalizeOptions(value, brandKit) {
    if (Array.isArray(value))
        return value.map(item => normalizeOptions(item, brandKit));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [key, item] of Object.entries(value)) {
            out[key] = normalizeOptions(item, brandKit);
        }
        return out;
    }
    return resolveColor(value, brandKit);
}
function resolvePathLike(value, repoRoot, outputDir) {
    if (/^(data:|https?:)/.test(value))
        return value;
    const generated = isProceduralAssetHandle(value) ? materializeProceduralAssetHandle(value, repoRoot, outputDir) : null;
    if (generated)
        return generated.src;
    const catalogAsset = findAsset(repoRoot, value);
    if (catalogAsset)
        return catalogAsset.src;
    if (path.isAbsolute(value))
        return value;
    const outputRelative = path.resolve(outputDir, value);
    if (fs.existsSync(outputRelative))
        return outputRelative;
    return path.resolve(repoRoot, value);
}
function resolveAsset(value, repoRoot, outputDir) {
    if (!value)
        return value;
    if (typeof value === 'string')
        return resolvePathLike(value, repoRoot, outputDir);
    if (typeof value === 'object') {
        if (value.data)
            return value.data;
        if (value.path)
            return resolvePathLike(String(value.path), repoRoot, outputDir);
        if (value.src)
            return resolvePathLike(String(value.src), repoRoot, outputDir);
    }
    return value;
}
function dataUriForImage(filePath) {
    if (!fs.existsSync(filePath))
        return undefined;
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.svg'
        ? 'image/svg+xml'
        : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : 'image/png';
    return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
}
function objectName(object) {
    return (object === null || object === void 0 ? void 0 : object.objectName) || (object === null || object === void 0 ? void 0 : object.name);
}
function baseOptions(object, rect, brandKit) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    const reserved = new Set(['kind', 'objectType', 'text', 'objects', 'chartType', 'charts', 'data', 'series', 'labels', 'values', 'rows', 'src', 'path', 'mediaType', 'shapeType', 'type', 'animations', 'from', 'to', 'name', 'options', 'place', 'featureBudget', 'chartPresetId', 'chartGalleryTilePresetId', 'chartStylePresetId', 'chartGalleryVariant', 'chartStyleId', 'chartStyleModernId', 'chartColorStyleId', 'chartLayoutPresetId', 'chartTreatmentPresetId', 'chartTreatmentPresetIds']);
    const options = {};
    for (const [key, value] of Object.entries(object || {})) {
        if (!reserved.has(key))
            options[key] = value;
    }
    const explicit = (object === null || object === void 0 ? void 0 : object.options) && typeof object.options === 'object' ? object.options : {};
    return normalizeOptions(Object.assign(Object.assign(Object.assign(Object.assign({}, options), explicit), { x: (_c = (_b = (_a = rect === null || rect === void 0 ? void 0 : rect.x) !== null && _a !== void 0 ? _a : object === null || object === void 0 ? void 0 : object.x) !== null && _b !== void 0 ? _b : explicit.x) !== null && _c !== void 0 ? _c : 0.7, y: (_f = (_e = (_d = rect === null || rect === void 0 ? void 0 : rect.y) !== null && _d !== void 0 ? _d : object === null || object === void 0 ? void 0 : object.y) !== null && _e !== void 0 ? _e : explicit.y) !== null && _f !== void 0 ? _f : 0.7, w: (_j = (_h = (_g = rect === null || rect === void 0 ? void 0 : rect.w) !== null && _g !== void 0 ? _g : object === null || object === void 0 ? void 0 : object.w) !== null && _h !== void 0 ? _h : explicit.w) !== null && _j !== void 0 ? _j : 4, h: (_m = (_l = (_k = rect === null || rect === void 0 ? void 0 : rect.h) !== null && _k !== void 0 ? _k : object === null || object === void 0 ? void 0 : object.h) !== null && _l !== void 0 ? _l : explicit.h) !== null && _m !== void 0 ? _m : 1 }), (objectName(object) ? { objectName: objectName(object) } : {})), brandKit);
}
function richText(value, brandKit) {
    if (!Array.isArray(value))
        return value == null ? '' : String(value);
    return value.map(run => {
        if (run === null || run === void 0 ? void 0 : run.options)
            return { text: String(run.text || ''), options: normalizeOptions(run.options, brandKit) };
        const _a = run || {}, { text } = _a, options = __rest(_a, ["text"]);
        return { text: String(text || ''), options: normalizeOptions(options, brandKit) };
    });
}
function chartData(object) {
    if (Array.isArray(object === null || object === void 0 ? void 0 : object.data))
        return object.data;
    if (Array.isArray(object === null || object === void 0 ? void 0 : object.series))
        return object.series;
    if (Array.isArray(object === null || object === void 0 ? void 0 : object.values)) {
        return [{
                name: object.name || object.seriesName || 'Series',
                labels: Array.isArray(object.labels) ? object.labels : object.values.map((_, index) => `P${index + 1}`),
                values: object.values,
            }];
    }
    return [];
}
function objectKind(object) {
    return String((object === null || object === void 0 ? void 0 : object.kind) || (object === null || object === void 0 ? void 0 : object.objectType) || ((object === null || object === void 0 ? void 0 : object.shapeType) ? 'shape' : '') || '').trim();
}
function collectNamedObjects(objects = [], predicate) {
    const names = [];
    for (const object of objects) {
        if (predicate(object)) {
            const name = objectName(object);
            if (name)
                names.push(String(name));
        }
        if (Array.isArray(object === null || object === void 0 ? void 0 : object.objects))
            names.push(...collectNamedObjects(object.objects, predicate));
    }
    return names;
}
function isLiveModel3DAnimation(animation) {
    const kind = String((animation === null || animation === void 0 ? void 0 : animation.kind) || (animation === null || animation === void 0 ? void 0 : animation.type) || '').toLowerCase();
    const effect = String((animation === null || animation === void 0 ? void 0 : animation.effect) || (animation === null || animation === void 0 ? void 0 : animation.motionPath) || (animation === null || animation === void 0 ? void 0 : animation.path) || '').toLowerCase();
    return kind === 'motionpath'
        || kind === 'motion'
        || ['spin', 'growandturn', 'centerrevolve', 'boomerang', 'teeter'].includes(effect);
}
function ensureModel3DLiveDynamics(spec) {
    const budget = (spec === null || spec === void 0 ? void 0 : spec.featureBudget) || {};
    if (budget.motionLevel === 'none' || (spec === null || spec === void 0 ? void 0 : spec.disableAutoModel3DAnimation))
        return;
    for (const slide of Array.isArray(spec === null || spec === void 0 ? void 0 : spec.slides) ? spec.slides : []) {
        const modelNames = collectNamedObjects(slide === null || slide === void 0 ? void 0 : slide.objects, object => objectKind(object) === 'model3d');
        if (!modelNames.length)
            continue;
        if (!Array.isArray(slide.animations))
            slide.animations = [];
        for (const name of modelNames) {
            const existing = slide.animations.filter((animation) => String((animation === null || animation === void 0 ? void 0 : animation.target) || '') === name);
            if (existing.some(isLiveModel3DAnimation))
                continue;
            slide.animations.push({ target: name, kind: 'emphasis', effect: 'spin', rotation: 16, duration: 1400, trigger: existing.length ? 'afterPrevious' : 'afterPrevious' }, { target: name, kind: 'motionPath', path: 'sineWave', duration: 1600, trigger: 'withPrevious' });
            slide.notes = slide.notes
                ? `${typeof slide.notes === 'string' ? slide.notes : JSON.stringify(slide.notes)}\nGenerated by ${BETTERPPTX_MCP_BRAND}: injected live 3D spin and motion-path cues for ${name}.`
                : `Generated by ${BETTERPPTX_MCP_BRAND}: injected live 3D spin and motion-path cues for ${name}.`;
        }
    }
}
function center(rect) {
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}
function addPrimitive(slide, object, ctx, rect) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        const offset = ctx.offset || { x: 0, y: 0 };
        const placed = Object.assign(Object.assign({}, rect), { x: rect.x + offset.x, y: rect.y + offset.y });
        const kind = objectKind(object);
        const name = objectName(object);
        if (name)
            ctx.rects.set(name, placed);
        ctx.coverage.add(kind);
        if (kind === 'text' || kind === 'wordart') {
            const options = baseOptions(object, placed, ctx.brandKit);
            if (kind === 'wordart') {
                options.wordArt = object.wordArt || { transform: object.transform || 'textArchUp', adjustments: object.adjustments };
            }
            slide.addText(richText(object.text, ctx.brandKit), options);
            return;
        }
        if (kind === 'shape') {
            slide.addShape(object.shapeType || object.type || 'rect', baseOptions(object, placed, ctx.brandKit));
            return;
        }
        if (kind === 'image') {
            const srcHandle = object.src || object.path;
            const src = resolveAsset(srcHandle, ctx.repoRoot, ctx.outputDir);
            const options = baseOptions(object, placed, ctx.brandKit);
            if (!options.altText) {
                const catalogAsset = typeof srcHandle === 'string' ? findAsset(ctx.repoRoot, srcHandle) : undefined;
                options.altText = (catalogAsset === null || catalogAsset === void 0 ? void 0 : catalogAsset.altText) || `${BETTERPPTX_MCP_BRAND} image asset`;
            }
            if (typeof src === 'string' && src.startsWith('data:'))
                slide.addImage(Object.assign(Object.assign({}, options), { data: src }));
            else
                slide.addImage(Object.assign(Object.assign({}, options), { path: src }));
            return;
        }
        if (kind === 'chart') {
            const options = baseOptions(object, placed, ctx.brandKit);
            const rawChartType = object.chartType || object.type || ((object === null || object === void 0 ? void 0 : object.options) && object.options.chartType);
            const requestedPlan = Object.assign(Object.assign({}, ((object === null || object === void 0 ? void 0 : object.options) && typeof object.options === 'object' ? object.options : {})), Object.fromEntries(['chartPresetId', 'chartType', 'chartGalleryTilePresetId', 'chartStylePresetId', 'chartGalleryVariant', 'chartStyleId', 'chartStyleModernId', 'chartColorStyleId', 'chartLayoutPresetId', 'chartTreatmentPresetId', 'chartTreatmentPresetIds'].filter(key => (object === null || object === void 0 ? void 0 : object[key]) != null).map(key => [key, object[key]])));
            const resolvedPlan = yield resolveChartPlan(requestedPlan, ctx.repoRoot);
            Object.assign(options, resolvedPlan.plan);
            if (Array.isArray(object.charts) || Array.isArray(object.chartType)) {
                const charts = (object.charts || object.chartType).map((chart) => {
                    var _a;
                    return (Object.assign(Object.assign({}, chart), { type: normalizeNativeChartType(chart === null || chart === void 0 ? void 0 : chart.type) || (chart === null || chart === void 0 ? void 0 : chart.type), options: String((chart === null || chart === void 0 ? void 0 : chart.type) || '').toLowerCase().includes('column')
                            ? Object.assign(Object.assign({}, ((chart === null || chart === void 0 ? void 0 : chart.options) || {})), { barDir: ((_a = chart === null || chart === void 0 ? void 0 : chart.options) === null || _a === void 0 ? void 0 : _a.barDir) || 'col' }) : chart === null || chart === void 0 ? void 0 : chart.options }));
                });
                slide.addChart(charts, options);
            }
            else {
                const selectedChartType = resolvedPlan.plan.chartType || rawChartType || 'bar';
                const chartType = normalizeNativeChartType(selectedChartType) || selectedChartType;
                const lower = String(chartType).toLowerCase();
                if (/scatter|bubble|radar|doughnut|bar3d|area|line/.test(lower))
                    ctx.coverage.add('advancedCharts');
                if (String(rawChartType).toLowerCase().includes('column'))
                    options.barDir = options.barDir || 'col';
                slide.addChart(chartType, chartData(object), options);
            }
            return;
        }
        if (kind === 'table') {
            slide.addTable(object.rows || [], baseOptions(object, placed, ctx.brandKit));
            return;
        }
        if (kind === 'media') {
            const srcHandle = object.src || object.path;
            const src = resolveAsset(srcHandle, ctx.repoRoot, ctx.outputDir);
            const coverAsset = object.cover ? resolveAsset(object.cover, ctx.repoRoot, ctx.outputDir) : undefined;
            const cover = typeof coverAsset === 'string' && !/^(data:|https?:)/.test(coverAsset)
                ? dataUriForImage(coverAsset)
                : coverAsset;
            const options = baseOptions(object, placed, ctx.brandKit);
            if (!options.altText) {
                const catalogAsset = typeof srcHandle === 'string' ? findAsset(ctx.repoRoot, srcHandle) : undefined;
                options.altText = (catalogAsset === null || catalogAsset === void 0 ? void 0 : catalogAsset.altText) || `${BETTERPPTX_MCP_BRAND} media asset`;
            }
            slide.addMedia(Object.assign(Object.assign(Object.assign({}, options), { type: object.mediaType || object.type || 'video', path: src }), (cover ? { cover } : {})));
            return;
        }
        if (kind === 'model3d') {
            const srcHandle = object.src || object.path || object.glbFile;
            const generated = typeof srcHandle === 'string' && isProceduralAssetHandle(srcHandle) ? materializeProceduralAssetHandle(srcHandle, ctx.repoRoot, ctx.outputDir) : null;
            const src = resolveAsset(srcHandle, ctx.repoRoot, ctx.outputDir);
            const fallbackHandle = object.fallbackImage || object.rasterFile;
            const catalogPreview = typeof srcHandle === 'string' ? (_a = findAsset(ctx.repoRoot, srcHandle)) === null || _a === void 0 ? void 0 : _a.preview : undefined;
            const catalogAsset = typeof srcHandle === 'string' ? findAsset(ctx.repoRoot, srcHandle) : undefined;
            const fallback = fallbackHandle ? resolveAsset(fallbackHandle, ctx.repoRoot, ctx.outputDir) : (generated === null || generated === void 0 ? void 0 : generated.preview) || catalogPreview;
            const options = baseOptions(object, placed, ctx.brandKit);
            if (!options.altText)
                options.altText = (catalogAsset === null || catalogAsset === void 0 ? void 0 : catalogAsset.altText) || `${BETTERPPTX_MCP_BRAND} native 3D asset`;
            ctx.coverage.add('3d');
            if (generated)
                ctx.coverage.add('procedural3d');
            slide.addModel3D(Object.assign(Object.assign(Object.assign({}, options), { glbFile: src }), (fallback ? { rasterFile: fallback } : {})));
            return;
        }
        if (kind === 'connector') {
            const from = typeof object.from === 'string' ? center(ctx.rects.get(object.from) || placed) : object.from;
            const to = typeof object.to === 'string' ? center(ctx.rects.get(object.to) || Object.assign(Object.assign({}, placed), { x: placed.x + placed.w, y: placed.y })) : object.to;
            const x = Number((_b = from === null || from === void 0 ? void 0 : from.x) !== null && _b !== void 0 ? _b : placed.x);
            const y = Number((_c = from === null || from === void 0 ? void 0 : from.y) !== null && _c !== void 0 ? _c : placed.y);
            const endX = Number((_d = to === null || to === void 0 ? void 0 : to.x) !== null && _d !== void 0 ? _d : x + placed.w);
            const endY = Number((_e = to === null || to === void 0 ? void 0 : to.y) !== null && _e !== void 0 ? _e : y);
            slide.addShape(object.type || 'line', Object.assign(Object.assign({}, baseOptions(object, { x, y, w: endX - x, h: endY - y }, ctx.brandKit)), { x, y, w: endX - x, h: endY - y }));
            return;
        }
        if (kind === 'placeholder') {
            slide.addText(richText(object.text || '', ctx.brandKit), Object.assign(Object.assign({}, baseOptions(object, placed, ctx.brandKit)), { placeholder: object.phType || object.placeholder || 'body' }));
            return;
        }
        if (kind === 'smartart') {
            slide.addSmartArt(Object.assign(Object.assign({}, baseOptions(object, placed, ctx.brandKit)), { layout: object.layout || object.diagram || 'process', nodes: object.nodes || object.items || [object.title || object.name || 'Plan', 'Build', 'Validate'], title: object.title, palette: object.palette || ctx.brandKit.palette, color: object.color || 'FFFFFF', fontSize: object.fontSize || 10 }));
            return;
        }
        if (kind === 'component') {
            const options = baseOptions(object, placed, ctx.brandKit);
            slide.addShape('roundRect', Object.assign(Object.assign({}, options), { fill: object.fill || { color: '102233' }, line: object.line || { color: '20D6E7', transparency: 25 } }));
            slide.addText(object.title || object.diagram || object.name || kind, { x: placed.x + 0.16, y: placed.y + 0.18, w: Math.max(0.5, placed.w - 0.32), h: 0.28, fontSize: 12, bold: true, color: 'FFFFFF', margin: 0 });
            return;
        }
        if (kind === 'group') {
            const childObjects = Array.isArray(object.objects) ? object.objects : [];
            const childRects = solveLayout(object.componentLayout, childObjects, { width: placed.w, height: placed.h }, ctx.brandKit);
            for (let index = 0; index < childObjects.length; index += 1) {
                yield addPrimitive(slide, childObjects[index], Object.assign(Object.assign({}, ctx), { offset: { x: placed.x, y: placed.y } }), childRects[index]);
            }
        }
    });
}
function addAnimation(slide, animation, coverage) {
    const kind = String((animation === null || animation === void 0 ? void 0 : animation.kind) || (animation === null || animation === void 0 ? void 0 : animation.type) || 'entrance');
    const props = Object.assign({}, animation);
    delete props.kind;
    delete props.target;
    if (kind === 'motionPath') {
        props.type = 'motion';
        props.motionPath = animation.path || animation.motionPath || 'right';
    }
    else {
        props.type = kind === 'media' ? 'media' : kind;
    }
    if (animation.effect)
        props.effect = animation.effect;
    if (animation.trigger)
        props.trigger = animation.trigger;
    if (!props.trigger)
        props.trigger = 'afterPrevious';
    coverage.add(kind === 'motionPath' ? 'motionPath' : 'animation');
    slide.addAnimation(String(animation.target), props);
}
function sourceForSpec(title, spec, mode) {
    return `#!/usr/bin/env node
/**
 * ${BETTERPPTX_MCP_BRAND} deterministic public source.
 * Replays the original MCP deck specification.
 */
const deck = await betterpptx-mcp.presentation.create(${JSON.stringify({ title, mode, spec }, null, 2)})
await deck.writeFile(${JSON.stringify(`${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'betterpptx-mcp-deck'}.pptx`)})
`;
}
export function buildExpressiveDeck(args, outputPath, sourcePath, repoRoot) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const spec = (args === null || args === void 0 ? void 0 : args.spec) || {};
        ensureModel3DLiveDynamics(spec);
        const outputDir = path.dirname(outputPath);
        const brandKit = ((_a = spec.brandKit) === null || _a === void 0 ? void 0 : _a.inline) || ((_b = args === null || args === void 0 ? void 0 : args.brandKit) === null || _b === void 0 ? void 0 : _b.inline) || (args === null || args === void 0 ? void 0 : args.brandKit);
        const expressiveValidation = validateExpressiveSpec(spec, { repoRoot, outputDir, brandKit });
        if (!expressiveValidation.ok) {
            throw new ExpressiveSpecValidationError({
                success: false,
                ok: false,
                mode: 'expressive',
                errors: expressiveValidation.errors,
                warnings: expressiveValidation.warnings,
            });
        }
        const PresentationEngine = yield loadBetterPptxMcpPresentationEngine();
        const pptx = new PresentationEngine();
        const title = String((args === null || args === void 0 ? void 0 : args.title) || spec.title || `${BETTERPPTX_MCP_BRAND} expressive deck`);
        pptx.layout = ((_c = spec.size) === null || _c === void 0 ? void 0 : _c.name) || 'LAYOUT_WIDE';
        pptx.author = BETTERPPTX_MCP_BRAND;
        pptx.company = BETTERPPTX_MCP_BRAND;
        pptx.subject = ((_d = spec.meta) === null || _d === void 0 ? void 0 : _d.subject) || `${BETTERPPTX_MCP_BRAND} expressive presentation`;
        pptx.title = title;
        pptx.lang = spec.rtl ? 'ar-SA' : 'en-US';
        if (spec.theme || brandKit) {
            pptx.theme = {
                headFontFace: ((_e = brandKit === null || brandKit === void 0 ? void 0 : brandKit.fonts) === null || _e === void 0 ? void 0 : _e.majorLatin) || ((_f = spec.theme) === null || _f === void 0 ? void 0 : _f.headFontFace) || 'Aptos Display',
                bodyFontFace: ((_g = brandKit === null || brandKit === void 0 ? void 0 : brandKit.fonts) === null || _g === void 0 ? void 0 : _g.minorLatin) || ((_h = spec.theme) === null || _h === void 0 ? void 0 : _h.bodyFontFace) || 'Aptos',
                lang: pptx.lang,
            };
        }
        const coverage = new Set(expressiveValidation.coverage);
        for (const section of Array.isArray(spec.sections) ? spec.sections : []) {
            if ((section === null || section === void 0 ? void 0 : section.title) && typeof pptx.addSection === 'function')
                pptx.addSection({ title: String(section.title) });
        }
        for (const slideSpec of spec.slides || []) {
            const slide = pptx.addSlide(slideSpec.layout || undefined);
            if (slideSpec.background) {
                if (typeof slideSpec.background === 'string')
                    slide.background = { color: resolveColor(slideSpec.background, brandKit) };
                else
                    slide.background = normalizeOptions(slideSpec.background, brandKit);
            }
            if (slideSpec.transition)
                slide.transition = normalizeOptions(slideSpec.transition, brandKit);
            if (slideSpec.hidden)
                slide.hidden = true;
            const objects = Array.isArray(slideSpec.objects) ? slideSpec.objects : [];
            const rects = solveLayout(slideSpec.componentLayout, objects, SLIDE_WIDE, brandKit);
            const objectRects = new Map();
            for (let index = 0; index < objects.length; index += 1) {
                yield addPrimitive(slide, objects[index], { repoRoot, outputDir, brandKit, rects: objectRects, coverage }, rects[index]);
            }
            for (const animation of Array.isArray(slideSpec.animations) ? slideSpec.animations : []) {
                addAnimation(slide, animation, coverage);
            }
            if (slideSpec.notes)
                slide.addNotes(typeof slideSpec.notes === 'string' ? slideSpec.notes : JSON.stringify(slideSpec.notes, null, 2));
            else
                slide.addNotes(`Generated by ${BETTERPPTX_MCP_BRAND}. Expressive MCP deck.`);
        }
        yield pptx.writeFile({ fileName: outputPath, compression: true });
        ensureDir(path.dirname(sourcePath));
        fs.writeFileSync(sourcePath, sourceForSpec(title, spec, 'expressive'));
        const coverageReport = {
            brand: BETTERPPTX_MCP_BRAND,
            mode: 'expressive',
            slideCount: pptx.slides.length,
            features: [...coverage].sort(),
            objectNames: expressiveValidation.objectNames,
            warnings: expressiveValidation.warnings,
        };
        return {
            mode: 'expressive',
            slideCount: pptx.slides.length,
            features: [...coverage].sort(),
            coverageReport,
            validation: expressiveValidation,
            designPlan: spec.designPlan,
            featureUsePlan: spec.featureUsePlan,
            designGate: spec.designGate,
            recipesApplied: spec.recipesApplied,
            featureBudget: spec.featureBudget,
        };
    });
}
//# sourceMappingURL=expressive.js.map