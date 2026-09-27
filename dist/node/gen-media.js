/**
 * PptxGenJS: Media Methods
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { IMG_BROKEN } from './core-enums';
import { DOMParser } from '@xmldom/xmldom';
import { assertPackageMediaBytes, assertPackageMediaData } from './media-types';
function shouldValidatePackageMedia(rel) {
    const type = String(rel.type || '').toLowerCase();
    return !rel.isSvgPng && (type.startsWith('image/') || type.startsWith('audio/') || type.startsWith('video/'));
}
/**
 * Encode Image/Audio/Video into base64
 * @param {PresSlide | SlideLayout} layout - slide layout
 * @return {Promise} promise
 */
export function encodeSlideMediaRels(layout) {
    var _a, _b;
    // STEP 1: Detect real Node runtime once
    const isNode = typeof process !== 'undefined' && !!((_a = process.versions) === null || _a === void 0 ? void 0 : _a.node) && ((_b = process.release) === null || _b === void 0 ? void 0 : _b.name) === 'node';
    // These will be filled only when we’re in Node
    let fs;
    let https;
    // STEP 2: Lazy-load Node built-ins if needed
    const loadNodeDeps = isNode
        ? () => __awaiter(this, void 0, void 0, function* () {
            ;
            ({ default: fs } = yield import('node:fs'));
            ({ default: https } = yield import('node:https'));
        })
        : () => __awaiter(this, void 0, void 0, function* () { });
    // Immediately start it when we know we’re in Node
    if (isNode)
        loadNodeDeps();
    // STEP 3: Prepare promises list
    const imageProms = [];
    if (isNode) {
        layout._relsMedia
            .filter(rel => rel.isSvgPng)
            .forEach(rel => {
            rel.data = IMG_BROKEN;
        });
    }
    // A: Capture all audio/image/video candidates for encoding (filtering online/pre-encoded)
    const candidateRels = layout._relsMedia.filter(rel => !rel.isArtisticEffectWdp && rel.type !== 'online' && !rel.data && (!rel.path || (rel.path && !rel.path.includes('preencoded'))));
    // B: PERF: Mark dupes (same `path`) to avoid loading the same media over-and-over!
    const unqPaths = [];
    candidateRels.forEach(rel => {
        if (!unqPaths.includes(rel.path)) {
            rel.isDuplicate = false;
            unqPaths.push(rel.path);
        }
        else {
            rel.isDuplicate = true;
        }
    });
    // STEP 4: Read/Encode each unique media item
    candidateRels
        .filter(rel => !rel.isDuplicate)
        .forEach(rel => {
        imageProms.push((() => __awaiter(this, void 0, void 0, function* () {
            if (!https)
                yield loadNodeDeps();
            // ────────────  NODE LOCAL FILE  ────────────
            if (isNode && fs && rel.path.indexOf('http') !== 0) {
                try {
                    const bitmap = fs.readFileSync(rel.path);
                    if (shouldValidatePackageMedia(rel)) {
                        assertPackageMediaBytes(bitmap, { extn: rel.extn || '', mimeType: rel.type }, `media '${rel.path}'`);
                    }
                    rel.data = Buffer.from(bitmap).toString('base64');
                    candidateRels
                        .filter(dupe => dupe.isDuplicate && dupe.path === rel.path)
                        .forEach(dupe => (dupe.data = rel.data));
                    return 'done';
                }
                catch (ex) {
                    rel.data = IMG_BROKEN;
                    candidateRels
                        .filter(dupe => dupe.isDuplicate && dupe.path === rel.path)
                        .forEach(dupe => (dupe.data = rel.data));
                    throw new Error(`ERROR: Unable to read media: "${rel.path}"\n${String(ex)}`);
                }
            }
            // ────────────  NODE HTTP(S)  ────────────
            if (isNode && https && rel.path.startsWith('http')) {
                return yield new Promise((resolve, reject) => {
                    https.get(rel.path, res => {
                        let raw = '';
                        res.setEncoding('binary'); // IMPORTANT: Only binary encoding works
                        res.on('data', chunk => (raw += chunk));
                        res.on('end', () => {
                            if (shouldValidatePackageMedia(rel)) {
                                try {
                                    assertPackageMediaBytes(Buffer.from(raw, 'binary'), { extn: rel.extn || '', mimeType: rel.type }, `media '${rel.path}'`);
                                }
                                catch (error) {
                                    reject(error);
                                    return;
                                }
                            }
                            rel.data = Buffer.from(raw, 'binary').toString('base64');
                            candidateRels
                                .filter(dupe => dupe.isDuplicate && dupe.path === rel.path)
                                .forEach(dupe => (dupe.data = rel.data));
                            resolve('done');
                        });
                        res.on('error', () => {
                            rel.data = IMG_BROKEN;
                            candidateRels
                                .filter(dupe => dupe.isDuplicate && dupe.path === rel.path)
                                .forEach(dupe => (dupe.data = rel.data));
                            reject(new Error(`ERROR! Unable to load image (https.get): ${rel.path}`));
                        });
                    });
                });
            }
            // ────────────  BROWSER  ────────────
            return yield new Promise((resolve, reject) => {
                // A: build request
                const xhr = new XMLHttpRequest();
                xhr.onload = () => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        rel.data = reader.result;
                        if (shouldValidatePackageMedia(rel)) {
                            try {
                                assertPackageMediaData(rel.data, { extn: rel.extn || '', mimeType: rel.type }, `media '${rel.path}'`);
                            }
                            catch (error) {
                                reject(error);
                                return;
                            }
                        }
                        candidateRels
                            .filter(dupe => dupe.isDuplicate && dupe.path === rel.path)
                            .forEach(dupe => (dupe.data = rel.data));
                        if (!rel.isSvgPng) {
                            resolve('done');
                        }
                        else {
                            createSvgPngPreview(rel)
                                .then(() => resolve('done'))
                                .catch(reject);
                        }
                    };
                    reader.readAsDataURL(xhr.response);
                };
                xhr.onerror = () => {
                    rel.data = IMG_BROKEN;
                    candidateRels
                        .filter(dupe => dupe.isDuplicate && dupe.path === rel.path)
                        .forEach(dupe => (dupe.data = rel.data));
                    reject(new Error(`ERROR! Unable to load image (xhr.onerror): ${rel.path}`));
                };
                // B: execute request
                xhr.open('GET', rel.path);
                xhr.responseType = 'blob';
                xhr.send();
            });
        }))());
    });
    // STEP 5: SVG-PNG previews
    // ......: "SVG:" base64 data still requires a png to be generated
    // ......: (`isSvgPng` flag this as the preview image, not the SVG itself)
    layout._relsMedia
        .filter(rel => rel.isSvgPng && rel.data)
        .forEach(rel => {
        if (isNode) {
            rel.data = IMG_BROKEN;
            imageProms.push(Promise.resolve('done'));
        }
        else {
            imageProms.push(createSvgPngPreview(rel));
        }
    });
    return imageProms;
}
function base64MediaBytes(data) {
    const comma = data.indexOf(',');
    return Buffer.from(comma >= 0 ? data.substring(comma + 1) : data, 'base64');
}
function isHdPhoto(bytes) {
    if (bytes.length < 4)
        return false;
    // JPEG XR / HD Photo TIFF-like byte-order signatures.
    return (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0xbc && bytes[3] === 0x01)
        || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x01 && bytes[3] === 0xbc);
}
const artisticTransparency = (minimum = 0, maximum = 1) => ({
    keys: ['transparency'], rawKeys: ['trans'], minimum, maximum, scale: 100000, fractional: true,
});
const ARTISTIC_EFFECT_COM_DEFINITIONS = {
    blur: { id: 2, parameters: [{ keys: ['radius', 'radiusPt'], minimum: 0, maximum: 100 }] },
    brightnesscontrast: { id: 3, parameters: [
            { keys: ['brightness'], rawKeys: ['bright'], minimum: -1, maximum: 1, scale: 100000, fractional: true },
            { keys: ['contrast'], minimum: -1, maximum: 1, scale: 100000, fractional: true },
        ] },
    cement: { id: 4, parameters: [artisticTransparency(), { keys: ['crackSpacing'], minimum: 0, maximum: 100 }] },
    crisscrossetching: { id: 5, parameters: [artisticTransparency(), { keys: ['pressure'], minimum: 0, maximum: 100 }] },
    chalksketch: { id: 6, parameters: [artisticTransparency(), { keys: ['pressure'], minimum: 0, maximum: 4 }] },
    colortemperature: { id: 7, parameters: [{ keys: ['temperature'], rawKeys: ['colorTemp'], minimum: 1500, maximum: 11500 }] },
    cutout: { id: 8, parameters: [artisticTransparency(), { keys: ['numberOfShades', 'shades'], minimum: 0, maximum: 6 }] },
    filmgrain: { id: 9, parameters: [artisticTransparency(), { keys: ['grainSize'], minimum: 0, maximum: 100 }] },
    glass: { id: 10, parameters: [artisticTransparency(), { keys: ['scaling'], minimum: 0, maximum: 100 }] },
    glowdiffused: { id: 11, parameters: [artisticTransparency(), { keys: ['intensity'], minimum: 0, maximum: 10 }] },
    glowedges: { id: 12, parameters: [artisticTransparency(), { keys: ['smoothness'], minimum: 0, maximum: 10 }] },
    lightscreen: { id: 13, parameters: [artisticTransparency(), { keys: ['gridSize'], minimum: 0, maximum: 10 }] },
    linedrawing: { id: 14, parameters: [artisticTransparency(), { keys: ['pencilSize'], minimum: 0, maximum: 100 }] },
    marker: { id: 15, parameters: [artisticTransparency(), { keys: ['size'], minimum: 0, maximum: 100 }] },
    mosaic: { id: 16, parameters: [artisticTransparency(), { keys: ['pressure'], minimum: 0, maximum: 100 }] },
    mosaicbubbles: { id: 16, parameters: [artisticTransparency(), { keys: ['pressure'], minimum: 0, maximum: 100 }] },
    paintbrush: { id: 17, parameters: [artisticTransparency(), { keys: ['brushSize'], minimum: 0, maximum: 10 }] },
    paintstrokes: { id: 18, parameters: [artisticTransparency(), { keys: ['intensity'], minimum: 0, maximum: 10 }] },
    pastelssmooth: { id: 19, parameters: [artisticTransparency(), { keys: ['scaling'], minimum: 0, maximum: 100 }] },
    pencilgrayscale: { id: 20, parameters: [artisticTransparency(), { keys: ['pencilSize'], minimum: 0, maximum: 100 }] },
    pencilsketch: { id: 21, parameters: [artisticTransparency(), { keys: ['pressure'], minimum: 0, maximum: 100 }] },
    photocopy: { id: 22, parameters: [artisticTransparency(), { keys: ['detail'], minimum: 0, maximum: 10 }] },
    plasticwrap: { id: 23, parameters: [artisticTransparency(), { keys: ['smoothness'], minimum: 0, maximum: 10 }] },
    saturation: { id: 24, parameters: [{ keys: ['saturation'], rawKeys: ['sat'], minimum: 0, maximum: 4, scale: 100000, fractional: true }] },
    sharpensoften: { id: 25, parameters: [{ keys: ['sharpness', 'amount'], rawKeys: ['amountRaw'], minimum: -1, maximum: 1, scale: 100000, fractional: true }] },
    texturizer: { id: 26, parameters: [artisticTransparency(), { keys: ['scaling'], minimum: 0, maximum: 100 }] },
    watercolorsponge: { id: 27, parameters: [artisticTransparency(), { keys: ['brushSize'], minimum: 0, maximum: 10 }] },
};
function artisticEffectComRequest(input) {
    const spec = input && typeof input === 'object' ? input : {};
    const type = String(spec.type || spec.id || '').replace(/^artistic\./i, '').replace(/[-_\s]/g, '').toLowerCase();
    const definition = ARTISTIC_EFFECT_COM_DEFINITIONS[type];
    if (!definition)
        throw new Error(`Unsupported native Artistic Effect type: ${String(spec.type || spec.id || '')}`);
    const nested = spec.parameters && typeof spec.parameters === 'object' ? spec.parameters : {};
    const readFirst = (keys) => {
        for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(spec, key) && spec[key] != null && spec[key] !== '')
                return spec[key];
            if (Object.prototype.hasOwnProperty.call(nested, key) && nested[key] != null && nested[key] !== '')
                return nested[key];
        }
        return undefined;
    };
    const values = definition.parameters.map(parameter => {
        let value = readFirst(parameter.keys);
        let isRaw = false;
        if (value === undefined && parameter.rawKeys) {
            value = readFirst(parameter.rawKeys);
            isRaw = value !== undefined;
        }
        if (value === undefined)
            return undefined;
        let numberValue = Number(value);
        if (!Number.isFinite(numberValue))
            return undefined;
        if (isRaw && parameter.scale)
            numberValue /= parameter.scale;
        const bounded = Math.max(parameter.minimum, Math.min(parameter.maximum, numberValue));
        // Office's integer-valued PictureEffects setters truncate fractional
        // input before producing the editable layer and its cached preview. Keep
        // the temporary COM renderer on that same durable value; otherwise a
        // request such as chalkSketch.pressure=2.74 would render at 3 while the
        // serialized XML correctly stores 2.
        return parameter.fractional ? bounded : Math.trunc(bounded);
    });
    return { definition, values };
}
function mediaExtensionFromInput(data, filePath) {
    const dataMatch = typeof data === 'string' ? /^data:image\/([^;,]+)/i.exec(data) : null;
    if (dataMatch) {
        const subtype = dataMatch[1].toLowerCase();
        if (subtype === 'jpeg' || subtype === 'jpg')
            return 'jpeg';
        if (subtype === 'vnd.ms-photo')
            return 'wdp';
        return subtype.replace('+xml', '');
    }
    const pathMatch = typeof filePath === 'string' ? /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(filePath) : null;
    return pathMatch ? pathMatch[1].toLowerCase() : 'png';
}
function imageMimeType(extension) {
    if (extension === 'jpg' || extension === 'jpeg')
        return 'image/jpeg';
    if (extension === 'svg')
        return 'image/svg+xml';
    if (extension === 'wdp')
        return 'image/vnd.ms-photo';
    return `image/${extension}`;
}
function readOptionalMedia(data, filePath) {
    return __awaiter(this, void 0, void 0, function* () {
        if (typeof data === 'string' && data)
            return base64MediaBytes(data);
        if (typeof filePath === 'string' && filePath && !filePath.includes('preencoded')) {
            const fsNode = yield import('node:fs/promises');
            return yield fsNode.readFile(filePath);
        }
        return undefined;
    });
}
function updateVisiblePreviewRelation(rel, bytes, extension) {
    const normalizedExtension = extension === 'jpg' ? 'jpeg' : extension;
    rel.extn = normalizedExtension;
    rel.type = imageMimeType(normalizedExtension);
    rel.data = bytes.toString('base64');
    const target = String(rel.Target || '');
    const dot = target.lastIndexOf('.');
    rel.Target = `${dot >= 0 ? target.substring(0, dot) : target}.${normalizedExtension}`;
    rel.isDuplicate = false;
}
/**
 * Materialize native Artistic Effect media after ordinary images have loaded.
 * PowerPoint stores an effect-rendered preview in the normal image part and the
 * editable original in a separate HD Photo/WDP relationship. A single Office
 * batch creates both payloads for every effect in the presentation.
 */
export function encodeArtisticEffectMediaRels(layouts) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        const pairs = layouts.flatMap(layout => (layout._relsMedia || [])
            .filter(rel => rel.isArtisticEffectWdp)
            .map(rel => ({ layout, rel, sourceRel: layout._relsMedia.find(candidate => candidate.rId === rel.artisticEffectSourceRid) })));
        if (!pairs.length)
            return;
        const isNode = typeof process !== 'undefined' && !!((_a = process.versions) === null || _a === void 0 ? void 0 : _a.node) && ((_b = process.release) === null || _b === void 0 ? void 0 : _b.name) === 'node';
        const automatic = [];
        for (const pair of pairs) {
            if (!pair.sourceRel || typeof pair.sourceRel.data !== 'string' || !pair.sourceRel.data) {
                throw new Error('Unable to create the native Picture Format adjustment because the visible raster image could not be loaded.');
            }
            const nativeBytes = isNode ? yield readOptionalMedia(typeof pair.rel.data === 'string' ? pair.rel.data : undefined, pair.rel.path) : undefined;
            const previewBytes = isNode ? yield readOptionalMedia(pair.rel.artisticEffectPreviewData, pair.rel.artisticEffectPreviewPath) : undefined;
            if (nativeBytes && previewBytes) {
                if (!isHdPhoto(nativeBytes))
                    throw new Error('imageAdjustments.nativeImage must contain a valid HD Photo/WDP image.');
                const previewExt = mediaExtensionFromInput(pair.rel.artisticEffectPreviewData, pair.rel.artisticEffectPreviewPath);
                pair.rel.data = nativeBytes.toString('base64');
                updateVisiblePreviewRelation(pair.sourceRel, previewBytes, previewExt);
                continue;
            }
            if (!isNode || process.platform !== 'win32') {
                throw new Error('Native layered Picture Format adjustments require both imageAdjustments.nativeImage and imageAdjustments.previewImage on runtimes without Microsoft PowerPoint rendering.');
            }
            automatic.push(pair);
        }
        if (!automatic.length)
            return;
        const fsNode = yield import('node:fs/promises');
        const osNode = yield import('node:os');
        const pathNode = yield import('node:path');
        const childProcess = yield import('node:child_process');
        const JSZip = (yield import('jszip')).default;
        const tempDir = yield fsNode.mkdtemp(pathNode.join(osNode.tmpdir(), 'pptxgenjs-artistic-'));
        const tempPptx = pathNode.join(tempDir, 'native-artistic-render.pptx');
        const childEnv = Object.assign(Object.assign({}, process.env), { PPTXGENJS_ARTISTIC_PPTX: tempPptx });
        const script = [
            "$ErrorActionPreference='Stop'",
            "for ($wait=0; $wait -lt 100 -and @(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count -gt 0; $wait++) { Start-Sleep -Milliseconds 100 }",
            "if (@(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count -gt 0) { throw 'PowerPoint is already running; native Artistic Effect rendering requires an isolated Office process.' }",
            '$app=$null',
            '$presentation=$null',
            'try {',
            '$app=New-Object -ComObject PowerPoint.Application',
            '$app.Visible=-1',
            'try { $app.WindowState=2 } catch {}',
            '$presentation=$app.Presentations.Add()',
        ];
        try {
            for (let index = 0; index < automatic.length; index++) {
                const pair = automatic[index];
                const sourceExt = String(pair.sourceRel.extn || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png';
                const inputPath = pathNode.join(tempDir, `source-${index + 1}.${sourceExt}`);
                yield fsNode.writeFile(inputPath, base64MediaBytes(pair.sourceRel.data));
                const envKey = `PPTXGENJS_ARTISTIC_INPUT_${index}`;
                childEnv[envKey] = inputPath;
                const adjustmentSpec = pair.rel.pictureAdjustmentSpec && typeof pair.rel.pictureAdjustmentSpec === 'object'
                    ? pair.rel.pictureAdjustmentSpec
                    : { artisticEffect: pair.rel.artisticEffectSpec };
                const artisticEffect = adjustmentSpec.artisticEffect && typeof adjustmentSpec.artisticEffect === 'object'
                    ? adjustmentSpec.artisticEffect
                    : (typeof adjustmentSpec.artisticEffect === 'string' ? { type: adjustmentSpec.artisticEffect } : undefined);
                const requests = [];
                if (Object.prototype.hasOwnProperty.call(adjustmentSpec, 'temperature'))
                    requests.push(artisticEffectComRequest({ type: 'colorTemperature', temperature: adjustmentSpec.temperature }));
                if (Object.prototype.hasOwnProperty.call(adjustmentSpec, 'saturation'))
                    requests.push(artisticEffectComRequest({ type: 'saturation', saturation: adjustmentSpec.saturation }));
                if (Object.prototype.hasOwnProperty.call(adjustmentSpec, 'sharpness'))
                    requests.push(artisticEffectComRequest({ type: 'sharpenSoften', sharpness: adjustmentSpec.sharpness }));
                if (artisticEffect)
                    requests.push(artisticEffectComRequest(artisticEffect));
                const suffix = String(index);
                script.push(`$slide${suffix}=$presentation.Slides.Add(${index + 1},12)`, `$picture${suffix}=$slide${suffix}.Shapes.AddPicture([Environment]::GetEnvironmentVariable('${envKey}'),$false,$true,0,0,480,480)`);
                if (requests.length) {
                    script.push(`$effects${suffix}=$picture${suffix}.Fill.PictureEffects`, `while ($effects${suffix}.Count -gt 0) { $effects${suffix}.Delete(1) }`);
                    requests.forEach((request, requestIndex) => {
                        script.push(`$effect${suffix}_${requestIndex}=$effects${suffix}.Insert(${request.definition.id})`);
                        request.values.forEach((value, parameterIndex) => {
                            if (value === undefined)
                                return;
                            const cast = request.definition.parameters[parameterIndex].fractional ? 'single' : 'int';
                            script.push(`$effect${suffix}_${requestIndex}.EffectParameters.Item(${parameterIndex + 1}).Value=[${cast}]${Number(value).toString()}`);
                        });
                    });
                }
            }
            script.push("$presentation.SaveAs([Environment]::GetEnvironmentVariable('PPTXGENJS_ARTISTIC_PPTX'),24)", '} finally {', 'try { if ($presentation) { $presentation.Close() } } catch {}', 'try { if ($app) { $app.Quit() } } catch {}', '[GC]::Collect()', '[GC]::WaitForPendingFinalizers()', "for ($wait=0; $wait -lt 50 -and @(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count -gt 0; $wait++) { Start-Sleep -Milliseconds 100 }", '}');
            const encodedCommand = Buffer.from(script.join("\n"), 'utf16le').toString('base64');
            yield new Promise((resolve, reject) => {
                childProcess.execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand], {
                    env: childEnv,
                    windowsHide: true,
                    timeout: 180000,
                    maxBuffer: 2 * 1024 * 1024,
                }, error => error ? reject(new Error(`Unable to render native Artistic Effect media: ${error.message}`)) : resolve());
            });
            const zip = yield JSZip.loadAsync(yield fsNode.readFile(tempPptx));
            const parser = new DOMParser();
            for (let index = 0; index < automatic.length; index++) {
                const slideXml = yield ((_c = zip.file(`ppt/slides/slide${index + 1}.xml`)) === null || _c === void 0 ? void 0 : _c.async('string'));
                const relsXml = yield ((_d = zip.file(`ppt/slides/_rels/slide${index + 1}.xml.rels`)) === null || _d === void 0 ? void 0 : _d.async('string'));
                if (!slideXml || !relsXml)
                    throw new Error(`PowerPoint Artistic Effect batch is missing slide ${index + 1} package data.`);
                const slideDoc = parser.parseFromString(slideXml, 'application/xml');
                const relsDoc = parser.parseFromString(relsXml, 'application/xml');
                const visibleRid = ((_e = slideDoc.getElementsByTagName('a:blip').item(0)) === null || _e === void 0 ? void 0 : _e.getAttribute('r:embed')) || '';
                const nativeRid = ((_f = slideDoc.getElementsByTagName('a14:imgLayer').item(0)) === null || _f === void 0 ? void 0 : _f.getAttribute('r:embed')) || '';
                const targetById = new Map();
                for (const relationship of Array.from(relsDoc.getElementsByTagName('Relationship'))) {
                    targetById.set(relationship.getAttribute('Id') || '', relationship.getAttribute('Target') || '');
                }
                const visibleTarget = targetById.get(visibleRid) || '';
                const nativeTarget = targetById.get(nativeRid) || '';
                const visiblePath = pathNode.posix.normalize(pathNode.posix.join('ppt/slides', visibleTarget));
                const nativePath = pathNode.posix.normalize(pathNode.posix.join('ppt/slides', nativeTarget));
                const visiblePart = zip.file(visiblePath);
                const nativePart = zip.file(nativePath);
                if (!visiblePart || !nativePart)
                    throw new Error(`PowerPoint Artistic Effect batch is missing rendered media for slide ${index + 1}.`);
                const visibleBytes = yield visiblePart.async('nodebuffer');
                const nativeBytes = yield nativePart.async('nodebuffer');
                if (!isHdPhoto(nativeBytes))
                    throw new Error(`PowerPoint Artistic Effect batch produced an invalid HD Photo layer for slide ${index + 1}.`);
                const visibleExt = pathNode.posix.extname(visiblePath).substring(1).toLowerCase() || 'png';
                const pair = automatic[index];
                pair.rel.data = nativeBytes.toString('base64');
                updateVisiblePreviewRelation(pair.sourceRel, visibleBytes, visibleExt);
            }
        }
        finally {
            yield fsNode.rm(tempDir, { recursive: true, force: true });
        }
    });
}
/**
 * Create SVG preview image
 * @param {ISlideRelMedia} rel - slide rel
 * @return {Promise} promise
 */
function createSvgPngPreview(rel) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield new Promise((resolve, reject) => {
            // A: Create
            const image = new Image();
            // B: Set onload event
            image.onload = () => {
                // First: Check for any errors: This is the best method (try/catch wont work, etc.)
                if (image.width + image.height === 0) {
                    image.onerror('h/w=0');
                }
                let canvas = document.createElement('CANVAS');
                const ctx = canvas.getContext('2d');
                canvas.width = image.width;
                canvas.height = image.height;
                ctx.drawImage(image, 0, 0);
                // Users running on local machine will get the following error:
                // "SecurityError: Failed to execute 'toDataURL' on 'HTMLCanvasElement': Tainted canvases may not be exported."
                // when the canvas.toDataURL call executes below.
                try {
                    rel.data = canvas.toDataURL(rel.type);
                    resolve('done');
                }
                catch (ex) {
                    image.onerror(ex.toString());
                }
                canvas = null;
            };
            image.onerror = () => {
                rel.data = IMG_BROKEN;
                reject(new Error(`ERROR! Unable to load image (image.onerror): ${rel.path}`));
            };
            // C: Load image
            image.src = typeof rel.data === 'string' ? rel.data : IMG_BROKEN;
        });
    });
}
/**
 * FIXME: TODO: currently unused
 * TODO: Should return a Promise
 */
/*
function getSizeFromImage (inImgUrl: string): { width: number, height: number } {
    const sizeOf = typeof require !== 'undefined' ? require('sizeof') : null // NodeJS

    if (sizeOf) {
        try {
            const dimensions = sizeOf(inImgUrl)
            return { width: dimensions.width, height: dimensions.height }
        } catch (ex) {
            console.error('ERROR: sizeOf: Unable to load image: ' + inImgUrl)
            return { width: 0, height: 0 }
        }
    } else if (Image && typeof Image === 'function') {
        // A: Create
        const image = new Image()

        // B: Set onload event
        image.onload = () => {
            // FIRST: Check for any errors: This is the best method (try/catch wont work, etc.)
            if (image.width + image.height === 0) {
                return { width: 0, height: 0 }
            }
            const obj = { width: image.width, height: image.height }
            return obj
        }
        image.onerror = () => {
            console.error(`ERROR: image.onload: Unable to load image: ${inImgUrl}`)
        }

        // C: Load image
        image.src = inImgUrl
    }
}
*/
//# sourceMappingURL=gen-media.js.map