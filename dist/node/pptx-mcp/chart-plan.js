var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { chartGalleryTilePresetById, chartStylePresetById, chartPresetById, normalizeNativeChartType } from './chart-presets.js';
import { CHART_GALLERY } from '../chart-gallery.js';
import { CHART_TYPE_REGISTRY } from './chart-type-registry.js';
import { chartTreatmentPresetById } from './chart-treatment-runtime.js';
function zipPath(value) {
    const normalized = path.posix.normalize(value.replace(/\\/g, '/').replace(/^\/+/, ''));
    return normalized.startsWith('../') ? normalized.slice(3) : normalized;
}
function relationshipTarget(xml, relationshipType) {
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    const relationships = document.getElementsByTagName('Relationship');
    for (let index = 0; index < relationships.length; index += 1) {
        const relationship = relationships.item(index);
        if ((relationship === null || relationship === void 0 ? void 0 : relationship.getAttribute('Type')) === relationshipType)
            return relationship.getAttribute('Target') || null;
    }
    return null;
}
function rewriteRelationshipTarget(xml, relationshipType, target) {
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    const relationships = document.getElementsByTagName('Relationship');
    for (let index = 0; index < relationships.length; index += 1) {
        const relationship = relationships.item(index);
        if ((relationship === null || relationship === void 0 ? void 0 : relationship.getAttribute('Type')) === relationshipType)
            relationship.setAttribute('Target', target);
    }
    return new XMLSerializer().serializeToString(document);
}
function imageContentTypeForPath(value) {
    const ext = path.posix.extname(value).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg')
        return 'image/jpeg';
    if (ext === '.gif')
        return 'image/gif';
    if (ext === '.svg')
        return 'image/svg+xml';
    return 'image/png';
}
/**
 * ChartEx map captures contain a deterministic picture fallback in the same
 * slide's AlternateContent block.  Keep that visual payload attached to the
 * replay plan so the shared serializer can emit the same governed fallback
 * without exposing package paths or raw internals through the public MCP.
 */
function slideFallbackImage(zip, chartPath, chartType) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (chartType !== 'regionMap')
            return null;
        const slideRels = Object.keys(zip.files).filter(name => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/i.test(name));
        for (const relsPath of slideRels) {
            const relsXml = yield ((_a = zip.file(relsPath)) === null || _a === void 0 ? void 0 : _a.async('string'));
            if (!relsXml)
                continue;
            const document = new DOMParser().parseFromString(relsXml, 'application/xml');
            const relationships = document.getElementsByTagName('Relationship');
            let ownsChart = false;
            for (let index = 0; index < relationships.length; index += 1) {
                const relationship = relationships.item(index);
                if (!relationship)
                    continue;
                const type = relationship.getAttribute('Type') || '';
                const target = relationship.getAttribute('Target') || '';
                if (!type.toLowerCase().includes('/chart') && !type.toLowerCase().includes('chartex'))
                    continue;
                const resolvedTarget = zipPath(path.posix.join('ppt/slides', target));
                if (resolvedTarget === chartPath) {
                    ownsChart = true;
                    break;
                }
            }
            if (!ownsChart)
                continue;
            for (let index = 0; index < relationships.length; index += 1) {
                const relationship = relationships.item(index);
                if (!relationship)
                    continue;
                const type = relationship.getAttribute('Type') || '';
                if (!type.toLowerCase().endsWith('/image'))
                    continue;
                const target = relationship.getAttribute('Target') || '';
                const imagePath = zipPath(path.posix.join('ppt/slides', target));
                const imageEntry = zip.file(imagePath);
                if (!imageEntry)
                    continue;
                return {
                    base64: yield imageEntry.async('base64'),
                    contentType: imageContentTypeForPath(imagePath),
                };
            }
        }
        return null;
    });
}
function chartXmlMatchesType(xml, chartType) {
    var _a;
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    const legacyTags = {
        area: 'c:areaChart', area3D: 'c:area3DChart', bar: 'c:barChart', bar3D: 'c:bar3DChart', bubble: 'c:bubbleChart', bubble3D: 'c:bubbleChart',
        line: 'c:lineChart', line3D: 'c:line3DChart', pie: 'c:pieChart', pie3D: 'c:pie3DChart', ofPie: 'c:ofPieChart', doughnut: 'c:doughnutChart', radar: 'c:radarChart', scatter: 'c:scatterChart', combo: 'c:barChart', stock: 'c:stockChart', surface: 'c:surfaceChart', surface3D: 'c:surface3DChart',
    };
    const legacyTag = legacyTags[chartType];
    if (legacyTag && document.getElementsByTagName(legacyTag).length > 0)
        return true;
    // Some Office surface gallery captures are emitted as a 3-D surface chart
    // even when the semantic catalog entry is the surface family. Accept that
    // native tag for the surface semantic while keeping surface3D explicit.
    if (chartType === 'surface' && document.getElementsByTagName('c:surface3DChart').length > 0)
        return true;
    // ChartEx families do not expose legacy c:* chart tags.  Their native
    // layout is carried by cx:series/layoutPr (and a few families use a
    // family-specific child under layoutPr).  Keep this matcher semantic so
    // package replay can select the correct chartEx part from a multi-chart
    // capture bundle without relying on private part names.
    const chartExMarkers = {
        treemap: ['treemap'],
        sunburst: ['sunburst'],
        histogram: ['binning'],
        pareto: ['paretoLine'],
        boxWhisker: ['boxWhisker', 'statistics'],
        waterfall: ['waterfall'],
        funnel: ['funnel'],
        regionMap: ['regionMap', 'geography'],
    };
    const markers = chartExMarkers[chartType] || [];
    if (markers.some(marker => document.getElementsByTagName(`cx:${marker}`).length > 0))
        return true;
    const layoutIds = document.getElementsByTagName('cx:series');
    const chartExLayoutIds = {
        histogram: ['histogram', 'clusteredColumn'],
        pareto: ['pareto', 'paretoLine'],
        boxWhisker: ['boxWhisker'],
        waterfall: ['waterfall'],
        funnel: ['funnel'],
        regionMap: ['regionMap'],
        treemap: ['treemap'],
        sunburst: ['sunburst'],
    };
    const acceptedLayoutIds = (chartExLayoutIds[chartType] || [chartType]).map(value => value.toLowerCase());
    for (let index = 0; index < layoutIds.length; index += 1) {
        const layoutId = (_a = layoutIds.item(index)) === null || _a === void 0 ? void 0 : _a.getAttribute('layoutId');
        if (layoutId && acceptedLayoutIds.includes(layoutId.toLowerCase()))
            return true;
    }
    return false;
}
const REPLAY_RUNTIME_CHART_TYPES = {
    area3D: 'area',
    line3D: 'line',
    pie3D: 'pie',
    ofPie: 'pie',
    surface: 'bar',
    surface3D: 'bar',
    stock: 'bar',
    combo: 'bar',
};
function semanticChartType(value) {
    const raw = String(value !== null && value !== void 0 ? value : '').trim();
    if (!raw)
        return null;
    const normalized = normalizeNativeChartType(raw);
    if (normalized)
        return normalized;
    const record = CHART_TYPE_REGISTRY.find(item => item.semanticType.toLowerCase() === raw.toLowerCase());
    return (record === null || record === void 0 ? void 0 : record.semanticType) || null;
}
function runtimeChartType(semanticType) {
    if (!semanticType)
        return null;
    return REPLAY_RUNTIME_CHART_TYPES[semanticType] || semanticType;
}
function requiresPackageReplay(semanticType) {
    return Boolean(semanticType && ['area3D', 'line3D', 'pie3D', 'ofPie', 'surface', 'surface3D', 'stock'].includes(semanticType));
}
function packageFile(repoRoot, packagePath) {
    const resolved = path.isAbsolute(packagePath) ? packagePath : path.resolve(repoRoot, packagePath);
    if (!fs.existsSync(resolved))
        throw new Error(`Chart gallery package is unavailable for the selected preset: ${packagePath}`);
    return resolved;
}
function integerAttribute(document, tagName, attribute = 'val') {
    var _a;
    const raw = (_a = document.getElementsByTagName(tagName).item(0)) === null || _a === void 0 ? void 0 : _a.getAttribute(attribute);
    if (raw == null || raw === '')
        return undefined;
    const value = Number(raw);
    return Number.isInteger(value) ? value : undefined;
}
function generatedChartGalleryState(chartXml) {
    const document = new DOMParser().parseFromString(chartXml, 'application/xml');
    const chartStyleId = integerAttribute(document, 'c:style');
    const chartStyleModernId = integerAttribute(document, 'c14:style');
    return Object.assign(Object.assign({}, (chartStyleId !== undefined ? { chartStyleId } : {})), (chartStyleModernId !== undefined ? { chartStyleModernId } : {}));
}
function loadPackageReplay(tile, repoRoot) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        // A screenshot-only Color applicability probe is still executable when the
        // native PowerPoint ChartColor id is present. The engine has the exact
        // native-id colorStyle XML from the frozen Office gallery corpus, so no
        // per-type package copy is needed to serialize the selected color resource.
        if (tile.serializationStatus === 'native-engine' && tile.galleryKind === 'colors' && Number.isInteger(tile.nativeColorId)) {
            const colorXml = CHART_GALLERY.nativeColorCatalog[tile.nativeColorId];
            if (colorXml) {
                return {
                    _rawChartColorsXml: colorXml,
                    _rawChartColorsName: `mcp-chart-colors-native-${tile.nativeColorId}.xml`,
                };
            }
        }
        if (tile.serializationStatus !== 'package-backed' || !tile.packagePath)
            return null;
        const zip = yield JSZip.loadAsync(fs.readFileSync(packageFile(repoRoot, tile.packagePath)));
        let chartPath = tile.chartXmlPath ? zipPath(tile.chartXmlPath) : null;
        let chartXml = chartPath ? yield ((_a = zip.file(chartPath)) === null || _a === void 0 ? void 0 : _a.async('string')) : undefined;
        if (!chartXml && tile.chartXmlSha256) {
            for (const entryName of Object.keys(zip.files).filter(name => /^ppt\/(?:charts|chartEx)\/chart(?:Ex)?[^/]+\.xml$/i.test(name))) {
                const candidate = yield ((_b = zip.file(entryName)) === null || _b === void 0 ? void 0 : _b.async('string'));
                if (!candidate)
                    continue;
                const hash = createHash('sha256').update(candidate).digest('hex');
                if (hash === tile.chartXmlSha256 && chartXmlMatchesType(candidate, tile.chartType)) {
                    chartPath = entryName;
                    chartXml = candidate;
                    break;
                }
            }
        }
        if (!chartXml) {
            for (const entryName of Object.keys(zip.files).filter(name => /^ppt\/(?:charts|chartEx)\/chart(?:Ex)?[^/]+\.xml$/i.test(name))) {
                const candidate = yield ((_c = zip.file(entryName)) === null || _c === void 0 ? void 0 : _c.async('string'));
                if (!candidate)
                    continue;
                if (chartXmlMatchesType(candidate, tile.chartType)) {
                    chartPath = entryName;
                    chartXml = candidate;
                    break;
                }
            }
        }
        if (!chartPath)
            throw new Error(`Chart gallery preset ${tile.id} has no executable chart payload`);
        if (!chartXml)
            throw new Error(`Chart gallery preset ${tile.id} chart payload is missing`);
        const chartRelPath = zipPath(`${path.posix.dirname(chartPath)}/_rels/${path.posix.basename(chartPath)}.rels`);
        const chartRelsXml = yield ((_d = zip.file(chartRelPath)) === null || _d === void 0 ? void 0 : _d.async('string'));
        if (!chartRelsXml)
            throw new Error(`Chart gallery preset ${tile.id} chart relationship payload is missing`);
        const packageDir = path.posix.dirname(chartPath);
        const workbookTarget = relationshipTarget(chartRelsXml, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/package');
        const workbookPath = workbookTarget ? zipPath(path.posix.join(packageDir, workbookTarget)) : null;
        const workbookEntry = workbookPath ? zip.file(workbookPath) : null;
        const workbookBase64 = workbookEntry ? yield workbookEntry.async('base64') : undefined;
        // Captured bundles commonly reuse PowerPoint's worksheet basename (for
        // example, Worksheet124.xlsx) across different source packages.  A replay
        // atlas combines those packages, so preserving the basename would silently
        // make later charts overwrite an earlier chart's workbook.  Namespace the
        // embedded workbook by the opaque tile id while keeping the payload bytes
        // unchanged.
        const suffix = tile.id.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        const workbookName = workbookPath ? `mcp-chart-data-${suffix}${path.posix.extname(workbookPath) || '.xlsx'}` : undefined;
        const styleTarget = relationshipTarget(chartRelsXml, 'http://schemas.microsoft.com/office/2011/relationships/chartStyle');
        const colorsTarget = relationshipTarget(chartRelsXml, 'http://schemas.microsoft.com/office/2011/relationships/chartColorStyle');
        const stylePath = styleTarget ? zipPath(path.posix.join(packageDir, styleTarget)) : null;
        const colorsPath = colorsTarget ? zipPath(path.posix.join(packageDir, colorsTarget)) : null;
        const styleXml = stylePath ? yield ((_e = zip.file(stylePath)) === null || _e === void 0 ? void 0 : _e.async('string')) : undefined;
        const colorsXml = colorsPath ? yield ((_f = zip.file(colorsPath)) === null || _f === void 0 ? void 0 : _f.async('string')) : undefined;
        const styleName = styleXml ? `mcp-chart-style-${suffix}.xml` : undefined;
        const colorsName = colorsXml ? `mcp-chart-colors-${suffix}.xml` : undefined;
        let rewrittenRels = chartRelsXml;
        if (styleName)
            rewrittenRels = rewriteRelationshipTarget(rewrittenRels, 'http://schemas.microsoft.com/office/2011/relationships/chartStyle', styleName);
        if (colorsName)
            rewrittenRels = rewriteRelationshipTarget(rewrittenRels, 'http://schemas.microsoft.com/office/2011/relationships/chartColorStyle', colorsName);
        if (workbookName)
            rewrittenRels = rewriteRelationshipTarget(rewrittenRels, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/package', `../embeddings/${workbookName}`);
        const fallbackImage = yield slideFallbackImage(zip, chartPath, tile.chartType);
        const capturedResources = Object.assign(Object.assign({}, (styleXml && styleName ? { _rawChartStyleXml: styleXml, _rawChartStyleName: styleName } : {})), (colorsXml && colorsName ? { _rawChartColorsXml: colorsXml, _rawChartColorsName: colorsName } : {}));
        // An exact Ribbon Style/Color tile is a visual treatment, not a license to
        // replace the author's data with the frozen corpus specimen. For every family
        // the native serializer can author (legacy and ChartEx), keep the caller's
        // data and generated chart XML authoritative, then attach the captured Office
        // style/color resources. Full package replay remains necessary for imported
        // preserve-only families and Filled Map, whose geography/fallback payload is
        // part of the executable object rather than merely its visual treatment.
        const generatedFamily = !requiresPackageReplay(tile.chartType) && tile.chartType !== 'regionMap';
        if (generatedFamily && ['styles', 'colors'].includes(tile.galleryKind)) {
            return Object.assign(Object.assign({}, generatedChartGalleryState(chartXml)), capturedResources);
        }
        return Object.assign(Object.assign(Object.assign({ _rawChartXml: chartXml, _rawChartRelsXml: rewrittenRels }, (workbookBase64 && workbookName ? { _rawChartWorkbookBase64: workbookBase64, _rawChartWorkbookName: workbookName } : {})), capturedResources), (fallbackImage ? { _rawChartFallbackImageBase64: `data:${fallbackImage.contentType};base64,${fallbackImage.base64}`, _rawChartFallbackImageContentType: fallbackImage.contentType } : {}));
    });
}
/** Resolve the same chart plan for direct-code and MCP authoring. */
export function resolveChartPlan() {
    return __awaiter(this, arguments, void 0, function* (request = {}, repoRoot) {
        var _a;
        const hasRequestedType = request.chartType != null && String(request.chartType).trim() !== '';
        const requestedSemanticType = semanticChartType(request.chartType);
        if (hasRequestedType && !requestedSemanticType)
            throw new Error(`Unsupported chart type: ${String(request.chartType)}`);
        const requestedType = requestedSemanticType;
        const semanticPreset = request.chartPresetId ? chartPresetById(String(request.chartPresetId)) : undefined;
        if (request.chartPresetId && !semanticPreset)
            throw new Error(`Unknown chartPresetId: ${String(request.chartPresetId)}`);
        if (semanticPreset && !['native', 'native-composite'].includes(semanticPreset.authoringMode))
            throw new Error(`Chart preset ${semanticPreset.id} is ${semanticPreset.authoringMode}; use its governed shape/preserve route rather than native chart insertion`);
        const presetTypes = semanticPreset ? [semanticPreset.chartType, ...(semanticPreset.chartTypes || [])].map(type => semanticChartType(type)).filter(Boolean) : [];
        if (requestedType && presetTypes.length && !presetTypes.includes(requestedType))
            throw new Error(`Chart preset ${semanticPreset.id} is not applicable to ${requestedType}`);
        const plan = Object.assign(Object.assign({}, (semanticPreset ? Object.assign({ chartPresetId: semanticPreset.id }, (semanticPreset.optionDefaults || {})) : {})), (requestedType ? { chartType: runtimeChartType(requestedType) || requestedType } : (semanticPreset === null || semanticPreset === void 0 ? void 0 : semanticPreset.chartType) ? { chartType: runtimeChartType(semanticChartType(semanticPreset.chartType)) || semanticPreset.chartType } : {}));
        if (requestedType && requiresPackageReplay(requestedType) && !request.chartGalleryTilePresetId && !((_a = semanticPreset === null || semanticPreset === void 0 ? void 0 : semanticPreset.optionDefaults) === null || _a === void 0 ? void 0 : _a._rawChartXml)) {
            throw new Error(`Chart type ${requestedType} is preserve/replay-backed; select an exact chartGalleryTilePresetId or use its governed preserve/edit route`);
        }
        if (request.chartStylePresetId) {
            const preset = chartStylePresetById(String(request.chartStylePresetId));
            if (!preset)
                throw new Error(`Unknown chartStylePresetId: ${String(request.chartStylePresetId)}`);
            if (requestedType && !preset.supportedChartTypes.includes(requestedType))
                throw new Error(`Chart style preset ${preset.id} is not applicable to ${requestedType}`);
            Object.assign(plan, preset.optionDefaults, { chartStylePresetId: preset.id });
        }
        if (request.chartGalleryVariant != null)
            plan.chartGalleryVariant = Number(request.chartGalleryVariant);
        if (request.chartStyleId != null)
            plan.chartStyleId = Number(request.chartStyleId);
        if (request.chartStyleModernId != null)
            plan.chartStyleModernId = Number(request.chartStyleModernId);
        if (request.chartColorStyleId != null)
            plan.chartColorStyleId = Number(request.chartColorStyleId);
        if (request.chartLayoutPresetId)
            plan.chartLayoutPresetId = String(request.chartLayoutPresetId);
        const treatmentIds = [...(request.chartTreatmentPresetIds || []), ...(request.chartTreatmentPresetId ? [request.chartTreatmentPresetId] : [])].map(String);
        if (treatmentIds.length) {
            if (request.chartGalleryTilePresetId)
                throw new Error('An exact Ribbon tile and a treatment bundle cannot be combined in one chart plan; choose one package-backed state or use the treatment on a native chart preset.');
            for (const id of treatmentIds) {
                const treatment = chartTreatmentPresetById(id);
                if (!treatment)
                    throw new Error(`Unknown chartTreatmentPresetId: ${id}`);
                const treatmentType = semanticChartType(treatment.preset.semanticType);
                if (requestedType && treatmentType && requestedType !== treatmentType)
                    throw new Error(`Chart treatment ${id} is not applicable to ${requestedType}`);
                if (!plan.chartType && treatmentType)
                    plan.chartType = treatmentType;
                Object.assign(plan, treatment.optionDefaults);
            }
            plan.chartTreatmentPresetIds = treatmentIds;
            if (treatmentIds.length === 1)
                plan.chartTreatmentPresetId = treatmentIds[0];
        }
        if (!request.chartGalleryTilePresetId)
            return { plan, mode: Object.keys(plan).length ? 'native-style' : 'none' };
        if (request.chartStylePresetId || request.chartGalleryVariant != null || request.chartStyleId != null || request.chartStyleModernId != null || request.chartColorStyleId != null || request.chartLayoutPresetId || treatmentIds.length) {
            throw new Error('An exact Ribbon tile already contains its captured style, color, and layout state; do not combine it with another exact chart resource or treatment in one chart plan.');
        }
        const tile = chartGalleryTilePresetById(String(request.chartGalleryTilePresetId), { chartType: requestedType || undefined });
        if (!tile)
            throw new Error(`Unknown or inapplicable chartGalleryTilePresetId: ${String(request.chartGalleryTilePresetId)}`);
        const replay = yield loadPackageReplay(tile, repoRoot);
        if (!replay)
            throw new Error(`Chart gallery preset ${tile.id} has no executable package replay yet`);
        Object.assign(plan, replay, { chartGalleryTilePresetId: tile.id, chartType: runtimeChartType(tile.chartType) || tile.chartType });
        const mode = replay._rawChartXml
            ? 'gallery-package-replay'
            : tile.galleryKind === 'colors'
                ? 'native-color'
                : 'native-style';
        return { plan, tile, mode };
    });
}
//# sourceMappingURL=chart-plan.js.map