/**
 * PptxGenJS: XML Generation
 */
import { BULLET_TYPES, CRLF, DEF_BULLET_MARGIN, DEF_CELL_MARGIN_IN, DEF_PRES_LAYOUT_NAME, DEF_SHAPE_LINE_COLOR, DEF_TEXT_GLOW, DEF_TEXT_SHADOW, EMU, LAYOUT_IDX_SERIES_BASE, PLACEHOLDER_TYPES, ShapeType, SLDNUMFLDID, SLIDE_OBJECT_TYPES, TEXT_VALIGN, } from './core-enums';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { convertRotationDegrees, createColorElement, createGlowElement, hasGlowElement, createReflectionElement, createShadowElement, create3DElements, createText3DElements, encodeXmlEntities, genXmlColorSelection, getSmartParseNumber, getUuid, inch2Emu, normalizeWordArtTransform, normalizeWordArtAdjustments, valToPts, } from './gen-utils';
import { CAMEO_LIVEFEED_EXT_URI, CAMEO_LIVEFEED_NS } from './cameo-placeholder';
import { ZOOM_SLIDEZOOM_NS, ZOOM_SECTIONZOOM_NS, ZOOM_SUMMARYZOOM_NS, ZOOM_P166_NS } from './zoom-placeholder';
import { genXmlTransition } from './gen-transitions';
import { genXmlAnimations } from './gen-animations';
import { genXmlModel3D } from './gen-model3d';
import { genXmlEquation } from './gen-equations';
import { genXmlNativeSmartArt } from './gen-smartart';
import { POWERPOINT_TABLE_STYLES_XML, POWERPOINT_TABLE_STYLE_PRESET_TO_NATIVE_ID } from './table-style-reference';
import { normalizeScene3DRotationDegrees } from './option-registry';
import { genXmlCNvPr } from './gen-accessibility';
import { nativeGroupIdentityPlan } from './gen-group-animation-targets';
const PRESET_SHAPE_ALIASES = {
    folderCorner: 'foldedCorner',
    play: 'actionButtonMovie',
    playButton: 'actionButtonMovie',
    mediaPlay: 'actionButtonMovie',
    pause: 'actionButtonSound',
    stop: 'actionButtonBlank',
};
const VALID_PRESET_SHAPE_NAMES = new Set([
    ...Object.values(ShapeType),
    'foldedCorner',
]);
/** Closed native cap mapping; never interpolate unvalidated line attributes. */
function nativeLineCap(cap) {
    if (cap == null || cap === 'flat')
        return 'flat';
    if (cap === 'round')
        return 'rnd';
    if (cap === 'square')
        return 'sq';
    throw new Error('line.cap must be flat, round, or square.');
}
/** Serialize the native PowerPoint header/footer visibility policy. */
function genXmlHeaderFooter(policy, force = false) {
    if (!policy && !force)
        return '';
    const value = (primary, alias) => {
        var _a;
        const raw = (_a = policy === null || policy === void 0 ? void 0 : policy[primary]) !== null && _a !== void 0 ? _a : policy === null || policy === void 0 ? void 0 : policy[alias];
        return raw === true || raw === 1 || raw === '1' ? 1 : 0;
    };
    return `<p:hf sldNum="${value('slideNumber', 'showSlideNumber')}" hdr="${value('header', 'showHeader')}" ftr="${value('footer', 'showFooter')}" dt="${value('date', 'showDate')}"/>`;
}
const DEFAULT_INHERITANCE_COLOR_MAP = {
    bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2',
    accent1: 'accent1', accent2: 'accent2', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6',
    hlink: 'hlink', folHlink: 'folHlink',
};
function genXmlColorMapAttributes(map) {
    const effective = Object.assign(Object.assign({}, DEFAULT_INHERITANCE_COLOR_MAP), (map || {}));
    return Object.entries(effective).map(([key, value]) => `${key}="${encodeXmlEntities(String(value))}"`).join(' ');
}
function genXmlColorMapOverride(map) {
    if (!map || Object.keys(map).length === 0)
        return '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>';
    return `<p:clrMapOvr><a:overrideClrMapping ${genXmlColorMapAttributes(map)}/></p:clrMapOvr>`;
}
function isHexColorToken(value) {
    const normalized = value.charAt(0) === '#' ? value.substring(1) : value;
    if (normalized.length !== 6)
        return false;
    return [...normalized].every(char => '0123456789abcdefABCDEF'.includes(char));
}
function genXmlInheritanceColor(value, fallback) {
    const token = String(value || fallback);
    if (isHexColorToken(token))
        return `<a:srgbClr val="${encodeXmlEntities(token.replace('#', '').toUpperCase())}"/>`;
    return `<a:schemeClr val="${encodeXmlEntities(token)}"/>`;
}
function genXmlShapeStyleRefs(refs) {
    if (!refs)
        return '';
    const ref = (tag, item, fallbackIndex, fallbackColor) => {
        if (tag === 'fontRef') {
            const role = (item === null || item === void 0 ? void 0 : item.role) || 'minor';
            return `<a:fontRef idx="${encodeXmlEntities(role)}">${genXmlInheritanceColor(item === null || item === void 0 ? void 0 : item.color, fallbackColor)}</a:fontRef>`;
        }
        const index = Number.isInteger(item === null || item === void 0 ? void 0 : item.index) ? Number(item === null || item === void 0 ? void 0 : item.index) : fallbackIndex;
        return `<a:${tag} idx="${index}">${genXmlInheritanceColor(item === null || item === void 0 ? void 0 : item.color, fallbackColor)}</a:${tag}>`;
    };
    return '<p:style>' +
        ref('lnRef', refs.line, 2, 'accent1') +
        ref('fillRef', refs.fill, 1, 'accent1') +
        ref('effectRef', refs.effect, 0, 'accent1') +
        ref('fontRef', refs.font, 0, 'tx1') +
        '</p:style>';
}
function textAlignToken(value, fallback) {
    if (value === 'center')
        return 'ctr';
    if (value === 'right')
        return 'r';
    if (value === 'justify')
        return 'just';
    if (value === 'left')
        return 'l';
    return fallback;
}
function genXmlInheritanceTextRun(style, defaults, lang) {
    const fontFace = (style === null || style === void 0 ? void 0 : style.fontFace) || defaults.fontFace;
    const fontSize = Math.round(Number((style === null || style === void 0 ? void 0 : style.fontSize) || defaults.fontSize) * 100);
    const attrs = [
        `sz="${fontSize}"`, 'kern="1200"', `lang="${encodeXmlEntities(lang)}"`,
        (style === null || style === void 0 ? void 0 : style.bold) === true ? 'b="1"' : '', (style === null || style === void 0 ? void 0 : style.italic) === true ? 'i="1"' : '',
    ].filter(Boolean).join(' ');
    return `<a:defRPr ${attrs}><a:solidFill>${genXmlInheritanceColor(style === null || style === void 0 ? void 0 : style.color, defaults.color)}</a:solidFill><a:latin typeface="${encodeXmlEntities(fontFace)}"/><a:ea typeface="${encodeXmlEntities(fontFace)}"/><a:cs typeface="${encodeXmlEntities(fontFace)}"/></a:defRPr>`;
}
function genXmlInheritanceTextFamily(tag, style, lang) {
    const title = tag === 'titleStyle';
    const body = tag === 'bodyStyle';
    const defaults = title
        ? { fontFace: '+mj-lt', fontSize: 44, color: 'tx1', align: 'ctr' }
        : body
            ? { fontFace: '+mn-lt', fontSize: 32, color: 'tx1', align: 'l' }
            : { fontFace: '+mn-lt', fontSize: 18, color: 'tx1', align: 'l' };
    let xml = `<p:${tag}>`;
    for (let level = 1; level <= 9; level += 1) {
        const margin = title ? 0 : (level - 1) * 457200;
        const indent = body ? -Math.max(228600, 342900 - (level - 1) * 57150) : 0;
        xml += `<a:lvl${level}pPr marL="${margin}"${body ? ` indent="${indent}"` : ''} algn="${textAlignToken(style === null || style === void 0 ? void 0 : style.align, defaults.align)}" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">`;
        if (title)
            xml += '<a:buNone/>';
        else if (body)
            xml += `<a:buChar char="${level % 2 === 0 ? '–' : '•'}"/>`;
        xml += genXmlInheritanceTextRun(style, defaults, lang);
        xml += `</a:lvl${level}pPr>`;
    }
    return `${xml}</p:${tag}>`;
}
function genXmlAuthoredMasterTextStyles(styles, lang) {
    return '<p:txStyles>' +
        genXmlInheritanceTextFamily('titleStyle', styles.title, lang) +
        genXmlInheritanceTextFamily('bodyStyle', styles.body, lang) +
        genXmlInheritanceTextFamily('otherStyle', styles.other, lang) +
        '</p:txStyles>';
}
// DrawingML exposes the PowerPoint arrow-size grid directly on each line end.
// Keep the four dimensions independent so a client can change width without
// disturbing length (and vice versa). The compiler validates the public enum;
// this helper only serializes the already-normalized native values.
function genXmlArrowEnd(tag, type, width, length) {
    if (type == null && width == null && length == null)
        return '';
    const attrs = [
        type == null ? '' : ` type="${encodeXmlEntities(type)}"`,
        width == null ? '' : ` w="${encodeXmlEntities(width)}"`,
        length == null ? '' : ` len="${encodeXmlEntities(length)}"`,
    ].join('');
    return `<a:${tag}${attrs}/>`;
}
function normalizePresetShapeName(shape) {
    const normalized = PRESET_SHAPE_ALIASES[shape] || shape;
    return VALID_PRESET_SHAPE_NAMES.has(normalized) ? normalized : 'rect';
}
function isCustomGeometryShape(shape, options) {
    return shape === 'custGeom' || (shape === 'freeform' && Array.isArray(options.points) && options.points.length > 0);
}
function normalizeTableStyleId(styleId) {
    const value = String(styleId || '').trim();
    if (!value)
        return '';
    if (value.charAt(0) === '{' && value.charAt(value.length - 1) === '}')
        return value;
    return `{${value}}`;
}
function genXmlTableProperties(options) {
    var _a, _b, _c, _d, _e, _f;
    const attrPairs = [
        ['firstRow', (_a = options.headerRow) !== null && _a !== void 0 ? _a : options.firstRow],
        ['lastRow', (_b = options.totalRow) !== null && _b !== void 0 ? _b : options.lastRow],
        ['firstCol', (_c = options.firstColumn) !== null && _c !== void 0 ? _c : options.firstCol],
        ['lastCol', (_d = options.lastColumn) !== null && _d !== void 0 ? _d : options.lastCol],
        ['bandRow', (_e = options.bandedRows) !== null && _e !== void 0 ? _e : options.bandRow],
        ['bandCol', (_f = options.bandedColumns) !== null && _f !== void 0 ? _f : options.bandCol],
    ];
    const attrs = attrPairs
        .filter(([, value]) => typeof value === 'boolean')
        .map(([name, value]) => `${name}="${value ? 1 : 0}"`)
        .join(' ');
    const attrXml = attrs ? ` ${attrs}` : '';
    const requestedPreset = options.tableStylePresetId === undefined ? undefined : String(options.tableStylePresetId);
    const presetStyleId = requestedPreset ? POWERPOINT_TABLE_STYLE_PRESET_TO_NATIVE_ID[requestedPreset] : undefined;
    const styleId = normalizeTableStyleId(options.tableStyleId || presetStyleId);
    const styleXml = styleId ? `<a:tableStyleId>${encodeXmlEntities(styleId)}</a:tableStyleId>` : '';
    return styleXml ? `<a:tblPr${attrXml}>${styleXml}</a:tblPr>` : `<a:tblPr${attrXml}/>`;
}
const ImageSizingXml = {
    cover: function (imgSize, boxDim) {
        const imgRatio = imgSize.h / imgSize.w;
        const boxRatio = boxDim.h / boxDim.w;
        const isBoxBased = boxRatio > imgRatio;
        const width = isBoxBased ? boxDim.h / imgRatio : boxDim.w;
        const height = isBoxBased ? boxDim.h : boxDim.w * imgRatio;
        const hzPerc = Math.round(1e5 * 0.5 * (1 - boxDim.w / width));
        const vzPerc = Math.round(1e5 * 0.5 * (1 - boxDim.h / height));
        return `<a:srcRect l="${hzPerc}" r="${hzPerc}" t="${vzPerc}" b="${vzPerc}"/><a:stretch><a:fillRect/></a:stretch>`;
    },
    contain: function (imgSize, boxDim) {
        const imgRatio = imgSize.h / imgSize.w;
        const boxRatio = boxDim.h / boxDim.w;
        const widthBased = boxRatio > imgRatio;
        const width = widthBased ? boxDim.w : boxDim.h / imgRatio;
        const height = widthBased ? boxDim.w * imgRatio : boxDim.h;
        const hzPerc = Math.round(1e5 * 0.5 * (1 - boxDim.w / width));
        const vzPerc = Math.round(1e5 * 0.5 * (1 - boxDim.h / height));
        return `<a:srcRect l="${hzPerc}" r="${hzPerc}" t="${vzPerc}" b="${vzPerc}"/><a:stretch><a:fillRect/></a:stretch>`;
    },
    crop: function (imgSize, boxDim) {
        const l = boxDim.x;
        const r = imgSize.w - (boxDim.x + boxDim.w);
        const t = boxDim.y;
        const b = imgSize.h - (boxDim.y + boxDim.h);
        const lPerc = Math.round(1e5 * (l / imgSize.w));
        const rPerc = Math.round(1e5 * (r / imgSize.w));
        const tPerc = Math.round(1e5 * (t / imgSize.h));
        const bPerc = Math.round(1e5 * (b / imgSize.h));
        return `<a:srcRect l="${lPerc}" r="${rPerc}" t="${tPerc}" b="${bPerc}"/><a:stretch><a:fillRect/></a:stretch>`;
    },
};
function clampPct100000(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.min(100000, Math.round(value)));
}
function shadowLengthToEmu(value, defaultPt) {
    const n = Number(value !== null && value !== void 0 ? value : defaultPt);
    if (!Number.isFinite(n))
        return valToPts(defaultPt);
    // Serializer calls must be idempotent. Values above this threshold are
    // treated as already-converted OOXML EMUs from an older in-memory mutation.
    return Math.round(Math.abs(n) > 10000 ? n : valToPts(n));
}
function shadowAngleToOoxml(value, defaultDeg) {
    const n = Number(value !== null && value !== void 0 ? value : defaultDeg);
    if (!Number.isFinite(n))
        return Math.round(defaultDeg * 60000);
    return Math.round(Math.abs(n) > 360 ? n : n * 60000);
}
function shadowOpacityToOoxml(value, defaultOpacity) {
    const n = Number(value !== null && value !== void 0 ? value : defaultOpacity);
    if (!Number.isFinite(n))
        return clampPct100000(defaultOpacity * 100000);
    return clampPct100000(n > 1 ? n : n * 100000);
}
function createInlineShadowXml(shadow) {
    var _a, _b, _c, _d, _e, _f;
    if (!shadow || shadow.type === 'none')
        return '';
    const type = shadow.type === 'inner' ? 'inner' : 'outer';
    const blur = shadowLengthToEmu(shadow.blur, 8);
    const offset = shadowLengthToEmu(shadow.offset, 4);
    const angle = shadowAngleToOoxml(shadow.angle, 270);
    const opacity = shadowOpacityToOoxml(shadow.opacity, 0.75);
    const color = shadow.color || DEF_TEXT_SHADOW.color;
    const sx = Math.round(((_a = shadow.scaleX) !== null && _a !== void 0 ? _a : 1) * 100000);
    const sy = Math.round(((_b = shadow.scaleY) !== null && _b !== void 0 ? _b : 1) * 100000);
    const kx = Math.round(((_c = shadow.skewX) !== null && _c !== void 0 ? _c : 0) * 60000);
    const ky = Math.round(((_d = shadow.skewY) !== null && _d !== void 0 ? _d : 0) * 60000);
    const rot = shadow.rotateWithShape ? 1 : 0;
    let xml = `<a:${type}Shdw${type === 'outer' ? ` sx="${sx}" sy="${sy}" kx="${kx}" ky="${ky}" algn="bl" rotWithShape="${rot}"` : ''} blurRad="${blur}" dist="${offset}" dir="${angle}">`;
    if (color && typeof color === 'object' && color.type === 'preset') {
        xml += `<a:prstClr val="${color.preset}"><a:alpha val="${opacity}"/></a:prstClr>`;
    }
    else {
        const hex = (_f = (_e = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', cyan: '00FFFF', magenta: 'FF00FF', gray: '808080' }[color === null || color === void 0 ? void 0 : color.toLowerCase()]) !== null && _e !== void 0 ? _e : color === null || color === void 0 ? void 0 : color.replace('#', '')) !== null && _f !== void 0 ? _f : '000000';
        xml += `<a:srgbClr val="${hex.toUpperCase()}"><a:alpha val="${opacity}"/></a:srgbClr>`;
    }
    xml += `</a:${type}Shdw>`;
    return xml;
}
/** Connectors own the same typed shape effects, inside their native spPr. */
function createConnectorEffectsXml(options) {
    let effects = '';
    const glowDefaults = { size: 8, color: '00FFFF', opacity: 0.75 };
    // CT_EffectList has a fixed order: glow, shadows, reflection, softEdge.
    if (hasGlowElement(options.glow, glowDefaults))
        effects += createGlowElement(options.glow, glowDefaults);
    if (options.shadow && options.shadow.type !== 'none')
        effects += createInlineShadowXml(options.shadow);
    if (options.reflection)
        effects += createReflectionElement(options.reflection);
    if (options.softEdges && options.softEdges.size > 0)
        effects += `<a:softEdge rad="${valToPts(options.softEdges.size)}"/>`;
    return effects ? `<a:effectLst>${effects}</a:effectLst>` : '';
}
const PICTURE_STYLE_DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
function pictureStyleNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
function pictureStyleColorXml(color) {
    if (!color)
        return '';
    const authored = String(color.color || color.scheme || color.preset || '000000').replace(/^#/, '');
    const inferred = /^[0-9a-f]{6}$/i.test(authored) ? 'rgb' : 'scheme';
    const colorType = color.colorType || (color.preset ? 'preset' : color.scheme ? 'scheme' : inferred);
    const tag = colorType === 'preset' ? 'prstClr' : colorType === 'scheme' ? 'schemeClr' : 'srgbClr';
    let xml = `<a:${tag} val="${encodeXmlEntities(colorType === 'rgb' ? authored.toUpperCase() : authored)}">`;
    if (color.tint !== undefined)
        xml += `<a:tint val="${clampPct100000(pictureStyleNumber(color.tint) * 100000)}"/>`;
    if (color.shade !== undefined)
        xml += `<a:shade val="${clampPct100000(pictureStyleNumber(color.shade) * 100000)}"/>`;
    if (color.saturation !== undefined)
        xml += `<a:satMod val="${Math.max(0, Math.round(pictureStyleNumber(color.saturation, 1) * 100000))}"/>`;
    if (color.luminance !== undefined)
        xml += `<a:lumMod val="${Math.max(0, Math.round(pictureStyleNumber(color.luminance, 1) * 100000))}"/>`;
    if (color.luminanceOffset !== undefined)
        xml += `<a:lumOff val="${Math.max(0, Math.round(pictureStyleNumber(color.luminanceOffset, 0) * 100000))}"/>`;
    if (color.opacity !== undefined)
        xml += `<a:alpha val="${clampPct100000(pictureStyleNumber(color.opacity, 1) * 100000)}"/>`;
    return `${xml}</a:${tag}>`;
}
function createPictureStyleGeometryXml(style) {
    const geometry = style.geometry;
    if (!geometry)
        return '';
    let xml = `<a:prstGeom prst="${encodeXmlEntities(geometry.preset)}" xmlns:a="${PICTURE_STYLE_DRAWING_NS}"><a:avLst>`;
    for (const [name, value] of Object.entries(geometry.adjustments || {})) {
        xml += `<a:gd name="${encodeXmlEntities(name)}" fmla="val ${Math.round(pictureStyleNumber(value) * 100000)}"/>`;
    }
    return `${xml}</a:avLst></a:prstGeom>`;
}
function createPictureStyleFillXml(style) {
    const fill = style.fill;
    if (!fill)
        return '';
    if (fill.type === 'none')
        return `<a:noFill xmlns:a="${PICTURE_STYLE_DRAWING_NS}"/>`;
    return `<a:solidFill xmlns:a="${PICTURE_STYLE_DRAWING_NS}">${pictureStyleColorXml(fill.color)}</a:solidFill>`;
}
function createPictureStyleLineXml(style) {
    const line = style.line;
    if (!line)
        return '';
    const attrs = [];
    if (line.widthPt !== undefined)
        attrs.push(`w="${Math.round(pictureStyleNumber(line.widthPt) * 12700)}"`);
    if (line.cap !== undefined)
        attrs.push(`cap="${{ flat: 'flat', round: 'rnd', square: 'sq' }[line.cap] || line.cap}"`);
    if (line.compound !== undefined)
        attrs.push(`cmpd="${{ single: 'sng', double: 'dbl', thickThin: 'thickThin', thinThick: 'thinThick', triple: 'tri' }[line.compound] || line.compound}"`);
    if (line.alignment !== undefined)
        attrs.push(`algn="${line.alignment === 'center' ? 'ctr' : 'in'}"`);
    let xml = `<a:ln${attrs.length ? ` ${attrs.join(' ')}` : ''} xmlns:a="${PICTURE_STYLE_DRAWING_NS}">`;
    if (line.type === 'none')
        xml += '<a:noFill/>';
    else
        xml += `<a:solidFill>${pictureStyleColorXml(line.color)}</a:solidFill>`;
    if (line.dash !== undefined)
        xml += `<a:prstDash val="${encodeXmlEntities(line.dash)}"/>`;
    if (line.join === 'round')
        xml += '<a:round/>';
    else if (line.join === 'bevel')
        xml += '<a:bevel/>';
    else if (line.join === 'miter' || line.miterLimit !== undefined)
        xml += `<a:miter${line.miterLimit !== undefined ? ` lim="${Math.round(pictureStyleNumber(line.miterLimit) * 100000)}"` : ''}/>`;
    return `${xml}</a:ln>`;
}
const PICTURE_STYLE_ALIGNMENT_TO_XML = {
    topLeft: 'tl', top: 't', topRight: 'tr', left: 'l', center: 'ctr', right: 'r', bottomLeft: 'bl', bottom: 'b', bottomRight: 'br',
};
function pictureStyleEffectAttributes(effect) {
    const attrs = [];
    if ('blurPt' in effect && effect.blurPt !== undefined)
        attrs.push(`blurRad="${Math.round(pictureStyleNumber(effect.blurPt) * 12700)}"`);
    if ('distancePt' in effect && effect.distancePt !== undefined)
        attrs.push(`dist="${Math.round(pictureStyleNumber(effect.distancePt) * 12700)}"`);
    if ('directionDeg' in effect && effect.directionDeg !== undefined)
        attrs.push(`dir="${Math.round(pictureStyleNumber(effect.directionDeg) * 60000)}"`);
    if ('scaleX' in effect && effect.scaleX !== undefined)
        attrs.push(`sx="${Math.round(pictureStyleNumber(effect.scaleX, 1) * 100000)}"`);
    if ('scaleY' in effect && effect.scaleY !== undefined)
        attrs.push(`sy="${Math.round(pictureStyleNumber(effect.scaleY, 1) * 100000)}"`);
    if ('skewXDeg' in effect && effect.skewXDeg !== undefined)
        attrs.push(`kx="${Math.round(pictureStyleNumber(effect.skewXDeg) * 60000)}"`);
    if ('skewYDeg' in effect && effect.skewYDeg !== undefined)
        attrs.push(`ky="${Math.round(pictureStyleNumber(effect.skewYDeg) * 60000)}"`);
    if ('alignment' in effect && effect.alignment !== undefined)
        attrs.push(`algn="${PICTURE_STYLE_ALIGNMENT_TO_XML[effect.alignment] || effect.alignment}"`);
    if ('rotateWithShape' in effect && effect.rotateWithShape !== undefined)
        attrs.push(`rotWithShape="${effect.rotateWithShape ? 1 : 0}"`);
    return attrs;
}
function createPictureStyleEffectXml(effect) {
    if (effect.type === 'softEdge')
        return `<a:softEdge rad="${Math.round(pictureStyleNumber(effect.radiusPt) * 12700)}"/>`;
    if (effect.type === 'reflection') {
        const attrs = [];
        if (effect.blurPt !== undefined)
            attrs.push(`blurRad="${Math.round(pictureStyleNumber(effect.blurPt) * 12700)}"`);
        if (effect.startOpacity !== undefined)
            attrs.push(`stA="${clampPct100000(pictureStyleNumber(effect.startOpacity) * 100000)}"`);
        if (effect.endOpacity !== undefined)
            attrs.push(`endA="${clampPct100000(pictureStyleNumber(effect.endOpacity) * 100000)}"`);
        if (effect.startPosition !== undefined)
            attrs.push(`stPos="${clampPct100000(pictureStyleNumber(effect.startPosition) * 100000)}"`);
        if (effect.endPosition !== undefined)
            attrs.push(`endPos="${clampPct100000(pictureStyleNumber(effect.endPosition) * 100000)}"`);
        attrs.push(...pictureStyleEffectAttributes(effect).filter(attribute => !attribute.startsWith('blurRad=')));
        return `<a:reflection${attrs.length ? ` ${attrs.join(' ')}` : ''}/>`;
    }
    const tag = effect.type === 'innerShadow' ? 'innerShdw' : 'outerShdw';
    return `<a:${tag}${pictureStyleEffectAttributes(effect).length ? ` ${pictureStyleEffectAttributes(effect).join(' ')}` : ''}>${pictureStyleColorXml(effect.color)}</a:${tag}>`;
}
function createPictureStyleEffectsXml(style) {
    if (!style.effects)
        return '';
    return `<a:effectLst xmlns:a="${PICTURE_STYLE_DRAWING_NS}">${style.effects.map(createPictureStyleEffectXml).join('')}</a:effectLst>`;
}
function createPictureStyle3DXml(style) {
    var _a;
    const threeD = style.threeD;
    if (!threeD)
        return '';
    let scene = `<a:scene3d xmlns:a="${PICTURE_STYLE_DRAWING_NS}">`;
    const format = threeD.format || {};
    const formatHasContent = Object.entries(format).some(([key, value]) => {
        if (value !== undefined && value !== null)
            return true;
        return key === 'bevelTop' || key === 'bevelBottom';
    });
    if (threeD.camera) {
        const cameraAttrs = [`prst="${encodeXmlEntities(threeD.camera.preset)}"`];
        const fieldOfView = (_a = threeD.camera.perspectiveDeg) !== null && _a !== void 0 ? _a : threeD.camera.fieldOfView;
        if (fieldOfView !== undefined)
            cameraAttrs.push(`fov="${Math.round(pictureStyleNumber(fieldOfView) * 60000)}"`);
        const rotation = threeD.camera.rotation;
        scene += `<a:camera ${cameraAttrs.join(' ')}>`;
        if (rotation)
            scene += `<a:rot lat="${normalizeScene3DRotationDegrees(rotation.xDeg, 'pictureStyle.threeD.camera.rotation.xDeg')}" lon="${normalizeScene3DRotationDegrees(rotation.yDeg, 'pictureStyle.threeD.camera.rotation.yDeg')}" rev="${normalizeScene3DRotationDegrees(-pictureStyleNumber(rotation.zDeg), 'pictureStyle.threeD.camera.rotation.zDeg')}"/>`;
        scene += '</a:camera>';
    }
    if (threeD.lightRig) {
        const direction = { top: 't', bottom: 'b', left: 'l', right: 'r', topLeft: 'tl', topRight: 'tr', bottomLeft: 'bl', bottomRight: 'br' }[threeD.lightRig.direction || 'top'] || threeD.lightRig.direction || 't';
        scene += `<a:lightRig rig="${encodeXmlEntities(threeD.lightRig.preset)}" dir="${encodeXmlEntities(direction)}">`;
        const rotation = threeD.lightRig.rotation;
        if (rotation)
            scene += `<a:rot lat="${normalizeScene3DRotationDegrees(rotation.xDeg, 'pictureStyle.threeD.lightRig.rotation.xDeg')}" lon="${normalizeScene3DRotationDegrees(rotation.yDeg, 'pictureStyle.threeD.lightRig.rotation.yDeg')}" rev="${normalizeScene3DRotationDegrees(rotation.zDeg, 'pictureStyle.threeD.lightRig.rotation.zDeg')}"/>`;
        scene += '</a:lightRig>';
    }
    else if (threeD.camera || formatHasContent) {
        // PowerPoint-authored picture 3-D always carries a default light rig.
        // Without it, a camera-only native picture can be rejected as corrupt by
        // PowerPoint even though the DrawingML is XML-well-formed.
        scene += '<a:lightRig rig="threePt" dir="t"/>';
    }
    scene += '</a:scene3d>';
    if (!formatHasContent)
        return scene;
    const attrs = [];
    if (format.extrusionDepthPt !== undefined)
        attrs.push(`extrusionH="${Math.round(pictureStyleNumber(format.extrusionDepthPt) * 12700)}"`);
    if (format.contourWidthPt !== undefined)
        attrs.push(`contourW="${Math.round(pictureStyleNumber(format.contourWidthPt) * 12700)}"`);
    if (format.material !== undefined)
        attrs.push(`prstMaterial="${encodeXmlEntities(format.material)}"`);
    let shape = `<a:sp3d${attrs.length ? ` ${attrs.join(' ')}` : ''} xmlns:a="${PICTURE_STYLE_DRAWING_NS}">`;
    for (const [tag, bevel] of [['bevelT', format.bevelTop], ['bevelB', format.bevelBottom]]) {
        if (!bevel)
            continue;
        const bevelAttrs = [];
        if (bevel.widthPt !== undefined)
            bevelAttrs.push(`w="${Math.round(pictureStyleNumber(bevel.widthPt) * 12700)}"`);
        if (bevel.heightPt !== undefined)
            bevelAttrs.push(`h="${Math.round(pictureStyleNumber(bevel.heightPt) * 12700)}"`);
        if (bevel.type !== undefined)
            bevelAttrs.push(`prst="${encodeXmlEntities(bevel.type)}"`);
        shape += `<a:${tag}${bevelAttrs.length ? ` ${bevelAttrs.join(' ')}` : ''}/>`;
    }
    if (format.extrusionColor)
        shape += `<a:extrusionClr>${pictureStyleColorXml(format.extrusionColor)}</a:extrusionClr>`;
    if (format.contourColor)
        shape += `<a:contourClr>${pictureStyleColorXml(format.contourColor)}</a:contourClr>`;
    shape += '</a:sp3d>';
    return `${scene}${shape}`;
}
function createBlurXml(blur) {
    var _a, _b;
    if (!blur)
        return '';
    const radius = Number((_b = (_a = blur.radiusPt) !== null && _a !== void 0 ? _a : blur.size) !== null && _b !== void 0 ? _b : 0);
    if (!Number.isFinite(radius) || radius <= 0)
        return '';
    const rad = shadowLengthToEmu(radius, 8);
    // PowerPoint serializes the default grow=true state by omitting the
    // attribute.  Emit grow only for the explicit false form so native
    // authoring round-trips without a cosmetic XML/render delta.
    const grow = blur.grow === false ? ' grow="0"' : '';
    return `<a:blur rad="${rad}"${grow}/>`;
}
function createFillOverlayXml(overlay) {
    var _a;
    if (!overlay)
        return '';
    const blendRaw = String(overlay.blend || 'mult').toLowerCase();
    const blend = blendRaw === 'multiply' ? 'mult' : blendRaw;
    const fill = overlay.fill && typeof overlay.fill === 'object' ? overlay.fill : { type: 'solid', color: '000000', transparency: 30 };
    const color = String(fill.color || '000000').replace('#', '');
    let transparency = Number((_a = fill.transparency) !== null && _a !== void 0 ? _a : 0);
    if (transparency > 0 && transparency <= 1)
        transparency *= 100;
    const alpha = Math.round((100 - (Number.isFinite(transparency) ? transparency : 0)) * 1000);
    return `<a:fillOverlay blend="${encodeXmlEntities(blend)}"><a:solidFill><a:srgbClr val="${encodeXmlEntities(color.toUpperCase())}"><a:alpha val="${alpha}"/></a:srgbClr></a:solidFill></a:fillOverlay>`;
}
const ARTISTIC_EFFECT_TAGS = {
    blur: 'artisticBlur',
    artisticblur: 'artisticBlur',
    brightnesscontrast: 'brightnessContrast',
    cement: 'artisticCement',
    chalksketch: 'artisticChalkSketch',
    crisscrossetching: 'artisticCrisscrossEtching',
    colortemperature: 'colorTemperature',
    cutout: 'artisticCutout',
    filmgrain: 'artisticFilmGrain',
    glass: 'artisticGlass',
    glowdiffused: 'artisticGlowDiffused',
    glowedges: 'artisticGlowEdges',
    lightscreen: 'artisticLightScreen',
    linedrawing: 'artisticLineDrawing',
    marker: 'artisticMarker',
    mosaic: 'artisticMosiaicBubbles',
    mosaicbubbles: 'artisticMosiaicBubbles',
    paintbrush: 'artisticPaintBrush',
    paintstrokes: 'artisticPaintStrokes',
    pastelssmooth: 'artisticPastelsSmooth',
    pencilgrayscale: 'artisticPencilGrayscale',
    pencilsketch: 'artisticPencilSketch',
    photocopy: 'artisticPhotocopy',
    plasticwrap: 'artisticPlasticWrap',
    saturation: 'saturation',
    sharpensoften: 'sharpenSoften',
    texturizer: 'artisticTexturizer',
    watercolorsponge: 'artisticWatercolorSponge',
};
// PowerPoint's PictureEffects parameter setter truncates values at the
// integer-valued slider boundary. Mirroring it keeps native canaries aligned
// with Office for fractional checkpoints (for example 68.5 -> 68 and 2.74 -> 2).
function quantizeArtisticEffectValue(value) {
    return Number.isFinite(value) ? Math.trunc(value) : 0;
}
const artisticTransparency = (defaultValue) => ({
    attribute: 'trans', keys: ['transparency'], rawKeys: ['trans'], minimum: 0, maximum: 1, defaultValue, scale: 100000,
});
// PowerPoint-authored COM specimens establish these exact parameter domains,
// default values, OOXML attribute names, and fixed-percentage scales.
const ARTISTIC_EFFECT_PARAMETER_DEFINITIONS = {
    artisticBlur: [{ attribute: 'radius', keys: ['radius', 'radiusPt'], minimum: 0, maximum: 100, defaultValue: 10 }],
    brightnessContrast: [
        { attribute: 'bright', keys: ['brightness'], rawKeys: ['bright'], minimum: -1, maximum: 1, defaultValue: 0, scale: 100000 },
        { attribute: 'contrast', keys: ['contrast'], minimum: -1, maximum: 1, defaultValue: 0, scale: 100000 },
    ],
    artisticCement: [artisticTransparency(0), { attribute: 'crackSpacing', keys: ['crackSpacing'], minimum: 0, maximum: 100, defaultValue: 24 }],
    artisticCrisscrossEtching: [artisticTransparency(0.75), { attribute: 'pressure', keys: ['pressure'], minimum: 0, maximum: 100, defaultValue: 30 }],
    artisticChalkSketch: [artisticTransparency(0), { attribute: 'pressure', keys: ['pressure'], minimum: 0, maximum: 4, defaultValue: 0 }],
    colorTemperature: [{ attribute: 'colorTemp', keys: ['temperature', 'colorTemp'], minimum: 1500, maximum: 11500, defaultValue: 6500 }],
    artisticCutout: [artisticTransparency(0), { attribute: 'numberOfShades', keys: ['numberOfShades', 'shades'], minimum: 0, maximum: 6, defaultValue: 2 }],
    artisticFilmGrain: [artisticTransparency(0), { attribute: 'grainSize', keys: ['grainSize'], minimum: 0, maximum: 100, defaultValue: 40 }],
    artisticGlass: [artisticTransparency(0), { attribute: 'scaling', keys: ['scaling'], minimum: 0, maximum: 100, defaultValue: 34 }],
    artisticGlowDiffused: [artisticTransparency(0), { attribute: 'intensity', keys: ['intensity'], minimum: 0, maximum: 10, defaultValue: 5 }],
    artisticGlowEdges: [artisticTransparency(0.15), { attribute: 'smoothness', keys: ['smoothness'], minimum: 0, maximum: 10, defaultValue: 3 }],
    artisticLightScreen: [artisticTransparency(0), { attribute: 'gridSize', keys: ['gridSize'], minimum: 0, maximum: 10, defaultValue: 4 }],
    artisticLineDrawing: [artisticTransparency(0.25), { attribute: 'pencilSize', keys: ['pencilSize'], minimum: 0, maximum: 100, defaultValue: 0 }],
    artisticMarker: [artisticTransparency(0), { attribute: 'size', keys: ['size'], minimum: 0, maximum: 100, defaultValue: 97 }],
    artisticMosiaicBubbles: [artisticTransparency(0), { attribute: 'pressure', keys: ['pressure'], minimum: 0, maximum: 100, defaultValue: 14 }],
    artisticPaintBrush: [artisticTransparency(0), { attribute: 'brushSize', keys: ['brushSize'], minimum: 0, maximum: 10, defaultValue: 2 }],
    artisticPaintStrokes: [artisticTransparency(0), { attribute: 'intensity', keys: ['intensity'], minimum: 0, maximum: 10, defaultValue: 5 }],
    artisticPastelsSmooth: [artisticTransparency(0), { attribute: 'scaling', keys: ['scaling'], minimum: 0, maximum: 100, defaultValue: 34 }],
    artisticPencilGrayscale: [artisticTransparency(0), { attribute: 'pencilSize', keys: ['pencilSize'], minimum: 0, maximum: 100, defaultValue: 27 }],
    artisticPencilSketch: [artisticTransparency(0), { attribute: 'pressure', keys: ['pressure'], minimum: 0, maximum: 100, defaultValue: 22 }],
    artisticPhotocopy: [artisticTransparency(0.3), { attribute: 'detail', keys: ['detail'], minimum: 0, maximum: 10, defaultValue: 3 }],
    artisticPlasticWrap: [artisticTransparency(0), { attribute: 'smoothness', keys: ['smoothness'], minimum: 0, maximum: 10, defaultValue: 5 }],
    saturation: [{ attribute: 'sat', keys: ['saturation'], rawKeys: ['sat'], minimum: 0, maximum: 4, defaultValue: 1, scale: 100000 }],
    sharpenSoften: [{ attribute: 'amount', keys: ['amount', 'sharpness'], rawKeys: ['amountRaw'], minimum: -1, maximum: 1, defaultValue: 0, scale: 100000 }],
    artisticTexturizer: [artisticTransparency(0), { attribute: 'scaling', keys: ['scaling'], minimum: 0, maximum: 100, defaultValue: 34 }],
    artisticWatercolorSponge: [artisticTransparency(0), { attribute: 'brushSize', keys: ['brushSize'], minimum: 0, maximum: 10, defaultValue: 2 }],
};
function artisticEffectTag(input) {
    if (!input)
        return '';
    const raw = typeof input === 'string' ? input : String(input.type || input.id || '');
    const key = raw.replace(/^artistic\./i, '').replace(/[-_\s]/g, '').toLowerCase();
    return ARTISTIC_EFFECT_TAGS[key] || '';
}
function artisticEffectAttributes(tag, input) {
    const params = input && typeof input === 'object' ? Object.assign(Object.assign({}, input), (input.parameters || {})) : {};
    const parts = [];
    const readFirst = (keys) => {
        for (const key of keys)
            if (Object.prototype.hasOwnProperty.call(params, key) && params[key] != null && params[key] !== '')
                return params[key];
        return undefined;
    };
    for (const definition of ARTISTIC_EFFECT_PARAMETER_DEFINITIONS[tag] || []) {
        const semanticValue = readFirst(definition.keys);
        const rawValue = semanticValue === undefined ? readFirst(definition.rawKeys || []) : undefined;
        if (semanticValue === undefined && rawValue === undefined)
            continue;
        let serialized;
        if (rawValue !== undefined) {
            const raw = Number(rawValue);
            if (!Number.isFinite(raw))
                continue;
            const scale = definition.scale || 1;
            serialized = quantizeArtisticEffectValue(Math.max(definition.minimum * scale, Math.min(definition.maximum * scale, raw)));
        }
        else {
            const semantic = Number(semanticValue);
            if (!Number.isFinite(semantic))
                continue;
            const clamped = Math.max(definition.minimum, Math.min(definition.maximum, semantic));
            serialized = quantizeArtisticEffectValue(clamped * (definition.scale || 1));
        }
        const serializedDefault = quantizeArtisticEffectValue(definition.defaultValue * (definition.scale || 1));
        if (serialized !== serializedDefault)
            parts.push(`${definition.attribute}="${serialized}"`);
    }
    return parts.length ? ' ' + parts.join(' ') : '';
}
function createPictureEffectExtLst(adjust, imageRid) {
    if (!adjust || typeof adjust !== 'object' || !Number.isFinite(imageRid) || imageRid < 1)
        return '';
    const effects = [];
    if (Object.prototype.hasOwnProperty.call(adjust, 'temperature') && Number.isFinite(Number(adjust.temperature))) {
        const temperature = Math.round(Math.max(1500, Math.min(11500, Number(adjust.temperature))));
        effects.push(`<a14:imgEffect><a14:colorTemperature${temperature === 6500 ? '' : ` colorTemp="${temperature}"`}/></a14:imgEffect>`);
    }
    if (Object.prototype.hasOwnProperty.call(adjust, 'saturation') && Number.isFinite(Number(adjust.saturation))) {
        const saturation = Math.round(Math.max(0, Math.min(4, Number(adjust.saturation))) * 100000);
        effects.push(`<a14:imgEffect><a14:saturation${saturation === 100000 ? '' : ` sat="${saturation}"`}/></a14:imgEffect>`);
    }
    if (Object.prototype.hasOwnProperty.call(adjust, 'sharpness') && Number.isFinite(Number(adjust.sharpness))) {
        const sharpness = Math.round(Math.max(-1, Math.min(1, Number(adjust.sharpness))) * 100000);
        effects.push(`<a14:imgEffect><a14:sharpenSoften${sharpness === 0 ? '' : ` amount="${sharpness}"`}/></a14:imgEffect>`);
    }
    const artisticEffect = adjust.artisticEffect;
    const artisticTag = artisticEffectTag(artisticEffect);
    if (artisticTag) {
        const attrs = artisticEffectAttributes(artisticTag, artisticEffect);
        effects.push(`<a14:imgEffect><a14:${artisticTag}${attrs}/></a14:imgEffect>`);
    }
    if (!effects.length)
        return '';
    return `<a:extLst><a:ext uri="{BEBA8EAE-BF5A-486C-A8C5-ECC9F3942E4B}"><a14:imgProps xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main"><a14:imgLayer r:embed="rId${imageRid}">${effects.join('')}</a14:imgLayer></a14:imgProps></a:ext><a:ext uri="{28A0092B-C50C-407E-A947-70E740481C1C}"><a14:useLocalDpi xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main" val="0"/></a:ext></a:extLst>`;
}
function createPictureAdjustmentXml(adjust) {
    if (!adjust || typeof adjust !== 'object')
        return '';
    let duotoneXml = '';
    let grayscaleXml = '';
    let luminanceXml = '';
    const brightness = Number(adjust.brightness || 0);
    const contrast = Number(adjust.contrast || 0);
    if (brightness || contrast) {
        const bright = Math.round(Math.max(-1, Math.min(1, brightness)) * 100000);
        const contr = Math.round(Math.max(-1, Math.min(1, contrast)) * 100000);
        luminanceXml = `<a:lum bright="${bright}" contrast="${contr}"/>`;
    }
    const mode = String(adjust.colorMode || '').toLowerCase();
    if (mode === 'grayscale' || mode === 'greyscale')
        grayscaleXml = '<a:grayscl/>';
    const mapping = adjust.recolor || adjust.duotone;
    if (mode !== 'normal' && mapping && (mode === 'duotone' || mode === 'recolor' || !mode)) {
        duotoneXml = `<a:duotone>${createPictureColorEndpointXml(mapping.dark, '000000')}${createPictureColorEndpointXml(mapping.light, 'FFFFFF')}</a:duotone>`;
    }
    // CT_Blip child order: duotone, grayscl, hsl, lum, extLst.
    return duotoneXml + grayscaleXml + luminanceXml;
}
function createPictureColorEndpointXml(input, fallback) {
    var _a;
    if (typeof input === 'string')
        return createColorElement(input);
    const endpoint = input && typeof input === 'object' ? input : {};
    const color = endpoint.color || endpoint.scheme || endpoint.preset || fallback;
    const transforms = [];
    const addRatio = (tag, value, minimum, maximum) => {
        if (value == null || !Number.isFinite(Number(value)))
            return;
        const clamped = Math.max(minimum, Math.min(maximum, Number(value)));
        transforms.push(`<a:${tag} val="${Math.round(clamped * 100000)}"/>`);
    };
    addRatio('tint', endpoint.tint, 0, 1);
    addRatio('shade', endpoint.shade, 0, 1);
    addRatio('satMod', (_a = endpoint.saturation) !== null && _a !== void 0 ? _a : endpoint.saturationMultiplier, 0, 4);
    addRatio('alpha', endpoint.opacity, 0, 1);
    return createColorElement(color, transforms.join(''));
}
/**
 * Transforms a slide or slideLayout to resulting XML string - Creates `ppt/slide*.xml`
 * @param {PresSlide|SlideLayout} slideObject - slide object created within createSlideObject
 * @return {string} XML string with <p:cSld> as the root
 */
function slideObjectToXml(slide, groupChildren, groupIdState) {
    var _a, _b, _c, _d, _e;
    let strSlideXml = '';
    let intTableNum = 1;
    // Group descendants share one slide-wide ID allocator. The old id*100
    // scheme collided at 100+ siblings and overflowed for deeply nested groups.
    const childIds = groupIdState || nativeGroupIdentityPlan(slide).childIds;
    if (!groupChildren) {
        strSlideXml = slide._name ? '<p:cSld name="' + slide._name + '">' : '<p:cSld>';
        // STEP 1: Add background color/image (ensure only a single `<p:bg>` tag is created, ex: when master-baskground has both `color` and `path`)
        const rawBgXml = (_a = slide.background) === null || _a === void 0 ? void 0 : _a._rawBgXml;
        if (rawBgXml) {
            strSlideXml += rawBgXml;
        }
        else if (slide._bkgdImgRid) {
            const backgroundFill = Object.assign(Object.assign({}, (slide.background || {})), { type: ((((_b = slide.background) === null || _b === void 0 ? void 0 : _b.type) === 'texture' || ((_c = slide.background) === null || _c === void 0 ? void 0 : _c.texture)) ? 'texture' : 'picture'), _blipRid: slide._bkgdImgRid });
            strSlideXml += `<p:bg><p:bgPr>${genXmlColorSelection(backgroundFill)}<a:effectLst/></p:bgPr></p:bg>`;
        }
        else if (((_d = slide.background) === null || _d === void 0 ? void 0 : _d.color) || ['none', 'gradient', 'pattern'].includes((_e = slide.background) === null || _e === void 0 ? void 0 : _e.type)) {
            strSlideXml += `<p:bg><p:bgPr>${genXmlColorSelection(slide.background)}<a:effectLst/></p:bgPr></p:bg>`;
        }
        else if (!slide.bkgd && slide._name && slide._name === DEF_PRES_LAYOUT_NAME) {
            // NOTE: Default [white] background is needed on slideMaster1.xml to avoid gray background in Keynote (and Finder previews)
            strSlideXml += '<p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>';
        }
        // STEP 2: Continue slide by starting spTree node
        strSlideXml += '<p:spTree>';
        strSlideXml += '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>';
        strSlideXml += '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>';
        strSlideXml += '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
    }
    // STEP 3: Loop over all Slide.data objects and add them to this slide
    ;
    (groupChildren || slide._slideObjects).forEach((slideItemObj, objectIndex) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14;
        const idx = groupChildren ? (Number((_a = slideItemObj.options) === null || _a === void 0 ? void 0 : _a.spid) || objectIndex + 2) - 2 : objectIndex;
        let x = 0;
        let y = 0;
        let cx = getSmartParseNumber('75%', 'X', slide._presLayout);
        let cy = 0;
        let placeholderObj;
        let locationAttr = '';
        let arrTabRows = null;
        let objTabOpts = null;
        let intColCnt = 0;
        let intColW = 0;
        let cellOpts = null;
        let strXml = null;
        const sizing = (_b = slideItemObj.options) === null || _b === void 0 ? void 0 : _b.sizing;
        const rounding = (_c = slideItemObj.options) === null || _c === void 0 ? void 0 : _c.rounding;
        if (((_d = slide._slideLayout) === null || _d === void 0 ? void 0 : _d._slideObjects) && slideItemObj.options) {
            const slideOptions = slideItemObj.options;
            const slideType = (_f = (_e = slideOptions._placeholderType) !== null && _e !== void 0 ? _e : slideOptions.phType) !== null && _f !== void 0 ? _f : slideOptions._phType;
            const slideIdx = (_h = (_g = slideOptions._placeholderIdx) !== null && _g !== void 0 ? _g : slideOptions.phIdx) !== null && _h !== void 0 ? _h : slideOptions._phIdx;
            placeholderObj = slide._slideLayout._slideObjects.find((object) => {
                var _a, _b, _c, _d;
                const layoutOptions = object.options;
                if (slideOptions.placeholder && layoutOptions.placeholder === slideOptions.placeholder)
                    return true;
                const layoutType = (_b = (_a = layoutOptions._placeholderType) !== null && _a !== void 0 ? _a : layoutOptions.phType) !== null && _b !== void 0 ? _b : layoutOptions._phType;
                const layoutIdx = (_d = (_c = layoutOptions._placeholderIdx) !== null && _c !== void 0 ? _c : layoutOptions.phIdx) !== null && _d !== void 0 ? _d : layoutOptions._phIdx;
                if (!slideType || slideType !== layoutType)
                    return false;
                if (slideIdx === undefined || slideIdx === null)
                    return true;
                return layoutIdx !== undefined && layoutIdx !== null && String(slideIdx) === String(layoutIdx);
            });
        }
        // A: Set option vars
        slideItemObj.options = slideItemObj.options || {};
        if (typeof slideItemObj.options.x !== 'undefined')
            x = getSmartParseNumber(slideItemObj.options.x, 'X', slide._presLayout);
        if (typeof slideItemObj.options.y !== 'undefined')
            y = getSmartParseNumber(slideItemObj.options.y, 'Y', slide._presLayout);
        if (typeof slideItemObj.options.w !== 'undefined')
            cx = getSmartParseNumber(slideItemObj.options.w, 'X', slide._presLayout);
        if (typeof slideItemObj.options.h !== 'undefined')
            cy = getSmartParseNumber(slideItemObj.options.h, 'Y', slide._presLayout);
        // Set w/h now that smart parse is done
        let imgWidth = cx;
        let imgHeight = cy;
        // If using a placeholder then inherit it's position
        if (placeholderObj) {
            if (placeholderObj.options.x || placeholderObj.options.x === 0)
                x = getSmartParseNumber(placeholderObj.options.x, 'X', slide._presLayout);
            if (placeholderObj.options.y || placeholderObj.options.y === 0)
                y = getSmartParseNumber(placeholderObj.options.y, 'Y', slide._presLayout);
            if (placeholderObj.options.w || placeholderObj.options.w === 0)
                cx = getSmartParseNumber(placeholderObj.options.w, 'X', slide._presLayout);
            if (placeholderObj.options.h || placeholderObj.options.h === 0)
                cy = getSmartParseNumber(placeholderObj.options.h, 'Y', slide._presLayout);
        }
        //
        let flipH = !!slideItemObj.options.flipH;
        let flipV = !!slideItemObj.options.flipV;
        if (cx < 0) {
            x += cx;
            cx = Math.abs(cx);
            imgWidth = cx;
            flipH = !flipH;
        }
        if (cy < 0) {
            y += cy;
            cy = Math.abs(cy);
            imgHeight = cy;
            flipV = !flipV;
        }
        if (flipH)
            locationAttr += ' flipH="1"';
        if (flipV)
            locationAttr += ' flipV="1"';
        if (slideItemObj.options.rotate)
            locationAttr += ` rot="${convertRotationDegrees(slideItemObj.options.rotate)}"`;
        // B: Add OBJECT to the current Slide
        switch (slideItemObj._type) {
            case SLIDE_OBJECT_TYPES.smartart: {
                const smartArtShapeId = slideItemObj.options.spid || (idx + 2);
                const smartArtCreationId = (slide._slideNum * 10000) + Number(smartArtShapeId);
                strSlideXml += genXmlNativeSmartArt(slideItemObj, {
                    shapeId: smartArtShapeId,
                    creationId: smartArtCreationId,
                    x,
                    y,
                    cx: cx || getSmartParseNumber('75%', 'X', slide._presLayout),
                    cy: cy || getSmartParseNumber('45%', 'Y', slide._presLayout),
                    locationAttr,
                });
                break;
            }
            case SLIDE_OBJECT_TYPES.equation: {
                const equationShapeId = slideItemObj.options.spid || (idx + 2);
                const equationCreationId = (slide._slideNum * 10000) + Number(equationShapeId);
                strSlideXml += genXmlEquation(slideItemObj, {
                    shapeId: equationShapeId,
                    creationId: equationCreationId,
                    x,
                    y,
                    cx: cx || getSmartParseNumber('75%', 'X', slide._presLayout),
                    cy: cy || EMU * 0.35,
                    locationAttr,
                });
                break;
            }
            case SLIDE_OBJECT_TYPES.table:
                // Merge-grid expansion below inserts continuation cells and table-level
                // option inheritance fills missing cell options. Perform both operations
                // on a per-write copy so serializing the same presentation again does not
                // accumulate hMerge/vMerge cells or leak inherited defaults into authored
                // table state.
                arrTabRows = slideItemObj.arrTabRows.map(row => row.map(cell => (Object.assign(Object.assign({}, cell), { options: Object.assign({}, (cell.options || {})) }))));
                objTabOpts = slideItemObj.options;
                intColCnt = 0;
                intColW = 0;
                // Calc number of columns
                // NOTE: Cells may have a colspan, so merely taking the length of the [0] (or any other) row is not
                // ....: sufficient to determine column count. Therefore, check each cell for a colspan and total cols as reqd
                arrTabRows[0].forEach(cell => {
                    cellOpts = cell.options || null;
                    intColCnt += (cellOpts === null || cellOpts === void 0 ? void 0 : cellOpts.colspan) ? Number(cellOpts.colspan) : 1;
                });
                // STEP 1: Start Table XML
                // NOTE: Non-numeric cNvPr id values will trigger "presentation needs repair" type warning in MS-PPT-2013
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const tableShapeId = slideItemObj.options.spid || (idx + 2);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const tableRawGraphicFrameNvXml = slideItemObj.options._rawGraphicFrameNvXml;
                strXml = '<p:graphicFrame>';
                if (tableRawGraphicFrameNvXml) {
                    strXml += tableRawGraphicFrameNvXml;
                }
                else {
                    strXml += `<p:nvGraphicFramePr>${genXmlCNvPr({ id: tableShapeId, name: slideItemObj.options.objectName, options: slideItemObj.options })}`;
                    strXml +=
                        '<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>' +
                            `  <p:nvPr>${genXmlPlaceholderForSlideObject(slideItemObj, placeholderObj)}<p:extLst><p:ext uri="{D42A27DB-BD31-4B8C-83A1-F6EECF244321}"><p14:modId val="1579011935"/></p:ext></p:extLst></p:nvPr>` +
                            '</p:nvGraphicFramePr>';
                }
                strXml += `<p:xfrm><a:off x="${x || (x === 0 ? 0 : EMU)}" y="${y || (y === 0 ? 0 : EMU)}"/><a:ext cx="${cx || (cx === 0 ? 0 : EMU)}" cy="${cy || EMU}"/></p:xfrm>`;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const _rawTblPrXml = slideItemObj.options._rawTblPrXml;
                strXml += '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>' + (_rawTblPrXml || genXmlTableProperties(slideItemObj.options));
                // STEP 2: Set column widths
                // Evenly distribute cols/rows across size provided when applicable (calc them if only overall dimensions were provided)
                // A: Col widths provided?
                // B: Table Width provided without colW? Then distribute cols
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const _rawGridColXmls = slideItemObj.options._rawGridColXmls;
                if (Array.isArray(_rawGridColXmls) && _rawGridColXmls.length > 0) {
                    strXml += '<a:tblGrid>' + _rawGridColXmls.join('') + '</a:tblGrid>';
                }
                else if (Array.isArray(objTabOpts.colW)) {
                    strXml += '<a:tblGrid>';
                    for (let col = 0; col < intColCnt; col++) {
                        let w = inch2Emu(objTabOpts.colW[col]);
                        if (w == null || isNaN(w)) {
                            w = (typeof slideItemObj.options.w === 'number' ? slideItemObj.options.w : 1) / intColCnt;
                        }
                        strXml += `<a:gridCol w="${Math.round(w)}"/>`;
                    }
                    strXml += '</a:tblGrid>';
                }
                else {
                    intColW = objTabOpts.colW ? objTabOpts.colW : EMU;
                    if (slideItemObj.options.w && !objTabOpts.colW)
                        intColW = Math.round((typeof slideItemObj.options.w === 'number' ? slideItemObj.options.w : 1) / intColCnt);
                    strXml += '<a:tblGrid>';
                    for (let colw = 0; colw < intColCnt; colw++) {
                        strXml += `<a:gridCol w="${intColW}"/>`;
                    }
                    strXml += '</a:tblGrid>';
                }
                // STEP 3: Build our row arrays into an actual grid to match the XML we will be building next (ISSUE #36)
                // Note row arrays can arrive "lopsided" as in row1:[1,2,3] row2:[3] when first two cols rowspan!,
                // so a simple loop below in XML building wont suffice to build table correctly.
                // We have to build an actual grid now
                /*
                    EX: (A0:rowspan=3, B1:rowspan=2, C1:colspan=2)

                    /------|------|------|------\
                    |  A0  |  B0  |  C0  |  D0  |
                    |      |  B1  |  C1  |      |
                    |      |      |  C2  |  D2  |
                    \------|------|------|------/
                */
                // A: add _hmerge cell for colspan. should reserve rowspan
                arrTabRows.forEach(cells => {
                    var _a, _b;
                    for (let cIdx = 0; cIdx < cells.length;) {
                        const cell = cells[cIdx];
                        const colspan = (_a = cell.options) === null || _a === void 0 ? void 0 : _a.colspan;
                        const rowspan = (_b = cell.options) === null || _b === void 0 ? void 0 : _b.rowspan;
                        if (colspan && colspan > 1) {
                            const vMergeCells = new Array(colspan - 1).fill(undefined).map(() => {
                                return { _type: SLIDE_OBJECT_TYPES.tablecell, options: { rowspan }, _hmerge: true };
                            });
                            cells.splice(cIdx + 1, 0, ...vMergeCells);
                            cIdx += colspan;
                        }
                        else {
                            cIdx += 1;
                        }
                    }
                });
                // B: add _vmerge cell for rowspan. should reserve colspan/_hmerge
                arrTabRows.forEach((cells, rIdx) => {
                    const nextRow = arrTabRows[rIdx + 1];
                    if (!nextRow)
                        return;
                    cells.forEach((cell, cIdx) => {
                        var _a, _b;
                        const rowspan = cell._rowContinue || ((_a = cell.options) === null || _a === void 0 ? void 0 : _a.rowspan);
                        const colspan = (_b = cell.options) === null || _b === void 0 ? void 0 : _b.colspan;
                        const _hmerge = cell._hmerge;
                        if (rowspan && rowspan > 1) {
                            const hMergeCell = { _type: SLIDE_OBJECT_TYPES.tablecell, options: { colspan }, _rowContinue: rowspan - 1, _vmerge: true, _hmerge };
                            nextRow.splice(cIdx, 0, hMergeCell);
                        }
                    });
                });
                // STEP 4: Build table rows/cells
                arrTabRows.forEach((cells, rIdx) => {
                    // A: Table Height provided without rowH? Then distribute rows
                    let intRowH = 0; // IMPORTANT: Default must be zero for auto-sizing to work
                    if (Array.isArray(objTabOpts.rowH) && objTabOpts.rowH[rIdx])
                        intRowH = inch2Emu(Number(objTabOpts.rowH[rIdx]));
                    else if (objTabOpts.rowH && !isNaN(Number(objTabOpts.rowH)))
                        intRowH = inch2Emu(Number(objTabOpts.rowH));
                    else if (slideItemObj.options.cy || slideItemObj.options.h) {
                        intRowH = Math.round((slideItemObj.options.h ? inch2Emu(slideItemObj.options.h) : typeof slideItemObj.options.cy === 'number' ? slideItemObj.options.cy : 1) /
                            arrTabRows.length);
                    }
                    // B: Start row
                    strXml += `<a:tr h="${intRowH}">`;
                    // C: Loop over each CELL
                    cells.forEach(cellObj => {
                        var _a, _b, _c, _d, _e;
                        const cell = cellObj;
                        const cellSpanAttrs = {
                            rowSpan: ((_a = cell.options) === null || _a === void 0 ? void 0 : _a.rowspan) > 1 ? cell.options.rowspan : undefined,
                            gridSpan: ((_b = cell.options) === null || _b === void 0 ? void 0 : _b.colspan) > 1 ? cell.options.colspan : undefined,
                            vMerge: cell._vmerge ? 1 : undefined,
                            hMerge: cell._hmerge ? 1 : undefined,
                        };
                        let cellSpanAttrStr = Object.keys(cellSpanAttrs)
                            .map(k => [k, cellSpanAttrs[k]])
                            .filter(([, v]) => !!v)
                            .map(([k, v]) => `${String(k)}="${String(v)}"`)
                            .join(' ');
                        if (cellSpanAttrStr)
                            cellSpanAttrStr = ' ' + cellSpanAttrStr;
                        // 1: COLSPAN/ROWSPAN: Add dummy cells for any active colspan/rowspan
                        if (cell._hmerge || cell._vmerge) {
                            strXml += `<a:tc${cellSpanAttrStr}><a:tcPr/></a:tc>`;
                            return;
                        }
                        // 2: OPTIONS: Build/set cell options
                        const cellOpts = cell.options || {};
                        cell.options = cellOpts;
                        ['align', 'bold', 'border', 'color', 'fill', 'fontFace', 'fontSize', 'margin', 'textDirection', 'underline', 'valign'].forEach(name => {
                            if (objTabOpts[name] && !cellOpts[name] && cellOpts[name] !== 0)
                                cellOpts[name] = objTabOpts[name];
                        });
                        const cellValign = cellOpts.valign
                            ? ` anchor="${cellOpts.valign.replace(/^c$/i, 'ctr').replace(/^m$/i, 'ctr').replace('center', 'ctr').replace('middle', 'ctr').replace('top', 't').replace('btm', 'b').replace('bottom', 'b')}"`
                            : '';
                        const cellTextDir = (cellOpts.textDirection && cellOpts.textDirection !== 'horz') ? ` vert="${cellOpts.textDirection}"` : '';
                        let fillColor = ((_d = (_c = cell._optImp) === null || _c === void 0 ? void 0 : _c.fill) === null || _d === void 0 ? void 0 : _d.color)
                            ? cell._optImp.fill.color
                            : ((_e = cell._optImp) === null || _e === void 0 ? void 0 : _e.fill) && typeof cell._optImp.fill === 'string'
                                ? cell._optImp.fill
                                : '';
                        fillColor = fillColor || cellOpts.fill ? cellOpts.fill : '';
                        const cellFill = fillColor ? genXmlColorSelection(fillColor) : '';
                        let cellMargin = cellOpts.margin === 0 || cellOpts.margin ? cellOpts.margin : DEF_CELL_MARGIN_IN;
                        if (!Array.isArray(cellMargin) && typeof cellMargin === 'number')
                            cellMargin = [cellMargin, cellMargin, cellMargin, cellMargin];
                        /** FUTURE: DEPRECATED:
                         * - Backwards-Compat: Oops! Discovered we were still using points for cell margin before v3.8.0 (UGH!)
                         * - We cant introduce a breaking change before v4.0, so...
                         */
                        let cellMarginXml = '';
                        if (cellMargin[0] >= 1) {
                            cellMarginXml = ` marL="${valToPts(cellMargin[3])}" marR="${valToPts(cellMargin[1])}" marT="${valToPts(cellMargin[0])}" marB="${valToPts(cellMargin[2])}"`;
                        }
                        else {
                            cellMarginXml = ` marL="${inch2Emu(cellMargin[3])}" marR="${inch2Emu(cellMargin[1])}" marT="${inch2Emu(cellMargin[0])}" marB="${inch2Emu(cellMargin[2])}"`;
                        }
                        // FUTURE: Cell NOWRAP property (textwrap: add to a:tcPr (horzOverflow="overflow" or whatever options exist)
                        // 4: Set CELL content and properties ==================================
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const _rawTxBodyXml = cellOpts._rawTxBodyXml;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const _rawTcPrAttrs = cellOpts._rawTcPrAttrs || '';
                        strXml += `<a:tc${cellSpanAttrStr}>${_rawTxBodyXml || genXmlTextBody(cell)}<a:tcPr${_rawTcPrAttrs || (cellMarginXml + cellValign + cellTextDir)}>`;
                        // strXml += `<a:tc${cellColspan}${cellRowspan}>${genXmlTextBody(cell)}<a:tcPr${cellMarginXml}${cellValign}${cellTextDir}>`
                        // FIXME: 20200525: ^^^
                        // <a:tcPr marL="38100" marR="38100" marT="38100" marB="38100" vert="vert270">
                        // 5: Borders: Add any borders
                        if (cellOpts.border && Array.isArray(cellOpts.border)) {
                            // NOTE: *** IMPORTANT! *** LRTB order matters! (Reorder a line below to watch the borders go wonky in MS-PPT-2013!!)
                            [
                                { idx: 3, name: 'lnL' },
                                { idx: 1, name: 'lnR' },
                                { idx: 0, name: 'lnT' },
                                { idx: 2, name: 'lnB' },
                            ].forEach(obj => {
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const borderSide = cellOpts.border[obj.idx];
                                const nativeBorder = !!borderSide._nativeTableBorder;
                                if (borderSide.type !== 'none') {
                                    const lineW = borderSide._lnW || valToPts(borderSide.pt);
                                    let lineAttrs = `w="${lineW}"`;
                                    if (nativeBorder) {
                                        if (borderSide._lnCap)
                                            lineAttrs += ` cap="${borderSide._lnCap}"`;
                                        if (borderSide._lnCmpd)
                                            lineAttrs += ` cmpd="${borderSide._lnCmpd}"`;
                                        if (borderSide._lnAlgn)
                                            lineAttrs += ` algn="${borderSide._lnAlgn}"`;
                                    }
                                    else {
                                        lineAttrs += ' cap="flat" cmpd="sng" algn="ctr"';
                                    }
                                    strXml += `<a:${obj.name} ${lineAttrs}>`;
                                    const borderAlphaXml = (borderSide.transparency !== undefined && borderSide.transparency !== null)
                                        ? `<a:alpha val="${Math.round((100 - borderSide.transparency) * 1000)}"/>`
                                        : '';
                                    strXml += `<a:solidFill>${createColorElement(borderSide.color, borderAlphaXml)}</a:solidFill>`;
                                    strXml += `<a:prstDash val="${borderSide._prstDash || (borderSide.type === 'dash' ? 'sysDash' : 'solid')}"/>`;
                                    if (!nativeBorder || borderSide._hasRound)
                                        strXml += '<a:round/>';
                                    if (nativeBorder) {
                                        if (borderSide._headEndType)
                                            strXml += `<a:headEnd type="${borderSide._headEndType}"${borderSide._headEndW ? ` w="${borderSide._headEndW}"` : ''}${borderSide._headEndLen ? ` len="${borderSide._headEndLen}"` : ''}/>`;
                                        if (borderSide._tailEndType)
                                            strXml += `<a:tailEnd type="${borderSide._tailEndType}"${borderSide._tailEndW ? ` w="${borderSide._tailEndW}"` : ''}${borderSide._tailEndLen ? ` len="${borderSide._tailEndLen}"` : ''}/>`;
                                    }
                                    else {
                                        strXml += '<a:headEnd type="none" w="med" len="med"/><a:tailEnd type="none" w="med" len="med"/>';
                                    }
                                    strXml += `</a:${obj.name}>`;
                                }
                                else if (!nativeBorder || borderSide._hasLineElement !== false) {
                                    const lineW = borderSide._lnW || '0';
                                    let lineAttrs = `w="${lineW}"`;
                                    if (nativeBorder) {
                                        if (borderSide._lnCap)
                                            lineAttrs += ` cap="${borderSide._lnCap}"`;
                                        if (borderSide._lnCmpd)
                                            lineAttrs += ` cmpd="${borderSide._lnCmpd}"`;
                                        if (borderSide._lnAlgn)
                                            lineAttrs += ` algn="${borderSide._lnAlgn}"`;
                                    }
                                    else {
                                        lineAttrs += ' cap="flat" cmpd="sng" algn="ctr"';
                                    }
                                    strXml += `<a:${obj.name} ${lineAttrs}><a:noFill/></a:${obj.name}>`;
                                }
                            });
                        }
                        // 6: Close cell Properties & Cell
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const _rawTcPrChildXml = cellOpts._rawTcPrChildXml;
                        if (_rawTcPrChildXml) {
                            let tcChildXml = _rawTcPrChildXml;
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const ridMap = (slideItemObj.options._rawTableRidMap || {});
                            Object.keys(ridMap).forEach(origRid => {
                                tcChildXml = tcChildXml.replace(new RegExp(`__RAWRID_${origRid}__`, 'g'), `rId${ridMap[origRid]}`);
                            });
                            strXml += tcChildXml;
                        }
                        else {
                            strXml += cellFill;
                        }
                        strXml += '  </a:tcPr>';
                        strXml += ' </a:tc>';
                    });
                    // D: Complete row
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const _rawRowExtLstXmls = slideItemObj.options._rawRowExtLstXmls;
                    if (Array.isArray(_rawRowExtLstXmls) && _rawRowExtLstXmls[rIdx])
                        strXml += _rawRowExtLstXmls[rIdx];
                    strXml += '</a:tr>';
                });
                // STEP 5: Complete table
                strXml += '      </a:tbl>';
                strXml += '    </a:graphicData>';
                strXml += '  </a:graphic>';
                strXml += '</p:graphicFrame>';
                // STEP 6: Set table XML
                strSlideXml += strXml;
                // LAST: Increment counter
                intTableNum++;
                break;
            case SLIDE_OBJECT_TYPES.group: {
                const group = slideItemObj.group || slideItemObj.options || {};
                const groupId = Number((_j = slideItemObj.options) === null || _j === void 0 ? void 0 : _j.spid) || idx + 2;
                const groupName = String(group.objectName || `Group ${idx + 1}`);
                const renderGroup = (value, id, name) => {
                    var _a;
                    const children = Array.isArray(value.children) ? value.children : [];
                    const groupX = Math.round(Number(value.x || 0) * EMU);
                    const groupY = Math.round(Number(value.y || 0) * EMU);
                    const groupW = Math.round(Number(value.w || 1) * EMU);
                    const groupH = Math.round(Number(value.h || 1) * EMU);
                    const childOffset = value.chOff || { x: 0, y: 0 };
                    const childExtent = value.chExt || { x: 0, y: 0, w: value.w || 1, h: value.h || 1 };
                    const chOffX = Math.round(Number(childOffset.x || 0) * EMU);
                    const chOffY = Math.round(Number(childOffset.y || 0) * EMU);
                    const chExtW = Math.round(Number(childExtent.w || value.w || 1) * EMU);
                    const chExtH = Math.round(Number(childExtent.h || value.h || 1) * EMU);
                    const transformAttrs = `${value.rotate !== undefined || value.rotation !== undefined ? ` rot="${Math.round(Number((_a = value.rotate) !== null && _a !== void 0 ? _a : value.rotation) * 60000)}"` : ''}${value.flipH ? ' flipH="1"' : ''}${value.flipV ? ' flipV="1"' : ''}`;
                    let xml = '<p:grpSp><p:nvGrpSpPr>';
                    xml += genXmlCNvPr({ id, name, creationId: (slide._slideNum * 10000) + id, options: value });
                    xml += '<p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>';
                    xml += `<p:grpSpPr><a:xfrm${transformAttrs}><a:off x="${groupX}" y="${groupY}"/><a:ext cx="${groupW}" cy="${groupH}"/><a:chOff x="${chOffX}" y="${chOffY}"/><a:chExt cx="${chExtW}" cy="${chExtH}"/></a:xfrm></p:grpSpPr>`;
                    children.forEach((child, childIndex) => {
                        var _a, _b, _c, _d;
                        const childId = childIds.get(child);
                        if (childId === undefined)
                            throw new Error('Native group child is missing from the slide identity plan.');
                        const childName = String(child.objectName || `${name} child ${childIndex + 1}`);
                        if (child.kind === 'group') {
                            xml += renderGroup(child, childId, childName);
                            return;
                        }
                        if (child._nativeObject) {
                            const prepared = child._nativeObject;
                            const nativeChild = Object.assign(Object.assign({}, prepared), { options: Object.assign(Object.assign({}, prepared.options), { spid: childId, objectName: childName }) });
                            // Native connectors read their connector carrier, not only options.
                            // Propagate the group-assigned ID there too to avoid duplicate IDs.
                            if (prepared.connector)
                                nativeChild.connector = Object.assign(Object.assign({}, prepared.connector), { spid: childId, objectName: childName });
                            xml += slideObjectToXml(slide, [nativeChild], childIds);
                            return;
                        }
                        const childX = Math.round(Number(child.x || 0) * EMU);
                        const childY = Math.round(Number(child.y || 0) * EMU);
                        const childW = Math.round(Number((_a = child.w) !== null && _a !== void 0 ? _a : 1) * EMU);
                        const childH = Math.round(Number((_b = child.h) !== null && _b !== void 0 ? _b : 1) * EMU);
                        const childType = child.kind === 'connector' ? 'connector' : 'shape';
                        if (childType === 'connector') {
                            xml += '<p:cxnSp><p:nvCxnSpPr>';
                            xml += genXmlCNvPr({ id: childId, name: childName, creationId: (slide._slideNum * 10000) + childId, options: child });
                            xml += '<p:cNvCxnSpPr><a:cxnSpLocks/>';
                            if (child.startShapeId !== undefined)
                                xml += `<a:stCxn id="${child.startShapeId}" idx="${(_c = child.startConnectionIndex) !== null && _c !== void 0 ? _c : 0}"/>`;
                            if (child.endShapeId !== undefined)
                                xml += `<a:endCxn id="${child.endShapeId}" idx="${(_d = child.endConnectionIndex) !== null && _d !== void 0 ? _d : 0}"/>`;
                            xml += '</p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr>';
                            const connectorAlias = String(child.connectorType || 'straightConnector1');
                            const connectorPreset = { elbowConnector2: 'bentConnector2', elbowConnector3: 'bentConnector3', elbowConnector4: 'bentConnector4' }[connectorAlias] || connectorAlias;
                            const childTransformAttrs = `${child.rotate ? ` rot="${convertRotationDegrees(child.rotate)}"` : ''}${child.flipH ? ' flipH="1"' : ''}${child.flipV ? ' flipV="1"' : ''}`;
                            xml += `<p:spPr><a:xfrm${childTransformAttrs}><a:off x="${childX}" y="${childY}"/><a:ext cx="${childW}" cy="${childH}"/></a:xfrm><a:prstGeom prst="${connectorPreset}"><a:avLst/></a:prstGeom>`;
                            const line = child.line || { type: 'solid', color: DEF_SHAPE_LINE_COLOR, width: 1 };
                            xml += `<a:ln w="${valToPts(line.width || 1)}" cap="${nativeLineCap(line.cap)}" cmpd="sng" algn="ctr">${line.type === 'none' ? '<a:noFill/>' : genXmlColorSelection(line)}${line.dashType ? `<a:prstDash val="${encodeXmlEntities(line.dashType)}"/>` : ''}</a:ln>`;
                            xml += createConnectorEffectsXml(Object.assign(Object.assign({}, child.style), child));
                            xml += '</p:spPr></p:cxnSp>';
                        }
                        else {
                            xml += '<p:sp><p:nvSpPr>';
                            xml += `${genXmlCNvPr({ id: childId, name: childName, creationId: (slide._slideNum * 10000) + childId, options: child })}<p:cNvSpPr/><p:nvPr/></p:nvSpPr>`;
                            const fill = child.fill || { type: 'solid', color: 'FFFFFF' };
                            const line = child.line || { type: 'solid', color: DEF_SHAPE_LINE_COLOR, width: 1 };
                            xml += `<p:spPr><a:xfrm><a:off x="${childX}" y="${childY}"/><a:ext cx="${childW}" cy="${childH}"/></a:xfrm>`;
                            const childPoints = Array.isArray(child.points) ? child.points : [];
                            const customChild = (child.kind === 'freeform' || child.kind === 'customGeometry' || child.kind === 'custom-geometry' || child.shape === 'custGeom' || child.shapeName === 'custGeom') && childPoints.length > 0;
                            if (customChild) {
                                xml += '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/><a:pathLst>';
                                xml += `<a:path w="${childW}" h="${childH}">`;
                                childPoints.forEach((point, pointIndex) => {
                                    if (point === null || point === void 0 ? void 0 : point.curve) {
                                        if (point.curve.type === 'arc')
                                            xml += `<a:arcTo hR="${getSmartParseNumber(point.curve.hR, 'Y', slide._presLayout)}" wR="${getSmartParseNumber(point.curve.wR, 'X', slide._presLayout)}" stAng="${convertRotationDegrees(point.curve.stAng)}" swAng="${convertRotationDegrees(point.curve.swAng)}"/>`;
                                        else if (point.curve.type === 'cubic')
                                            xml += `<a:cubicBezTo><a:pt x="${getSmartParseNumber(point.curve.x1, 'X', slide._presLayout)}" y="${getSmartParseNumber(point.curve.y1, 'Y', slide._presLayout)}"/><a:pt x="${getSmartParseNumber(point.curve.x2, 'X', slide._presLayout)}" y="${getSmartParseNumber(point.curve.y2, 'Y', slide._presLayout)}"/><a:pt x="${getSmartParseNumber(point.x, 'X', slide._presLayout)}" y="${getSmartParseNumber(point.y, 'Y', slide._presLayout)}"/></a:cubicBezTo>`;
                                        else if (point.curve.type === 'quadratic')
                                            xml += `<a:quadBezTo><a:pt x="${getSmartParseNumber(point.curve.x1, 'X', slide._presLayout)}" y="${getSmartParseNumber(point.curve.y1, 'Y', slide._presLayout)}"/><a:pt x="${getSmartParseNumber(point.x, 'X', slide._presLayout)}" y="${getSmartParseNumber(point.y, 'Y', slide._presLayout)}"/></a:quadBezTo>`;
                                    }
                                    else if (point === null || point === void 0 ? void 0 : point.close)
                                        xml += '<a:close/>';
                                    else if ((point === null || point === void 0 ? void 0 : point.moveTo) || pointIndex === 0)
                                        xml += `<a:moveTo><a:pt x="${getSmartParseNumber(point.x, 'X', slide._presLayout)}" y="${getSmartParseNumber(point.y, 'Y', slide._presLayout)}"/></a:moveTo>`;
                                    else
                                        xml += `<a:lnTo><a:pt x="${getSmartParseNumber(point.x, 'X', slide._presLayout)}" y="${getSmartParseNumber(point.y, 'Y', slide._presLayout)}"/></a:lnTo>`;
                                });
                                xml += '</a:path></a:pathLst></a:custGeom>';
                            }
                            else {
                                xml += `<a:prstGeom prst="${child.shape || child.shapeName || 'rect'}"><a:avLst/></a:prstGeom>`;
                            }
                            xml += fill.type === 'none' ? '<a:noFill/>' : genXmlColorSelection(fill);
                            xml += `<a:ln w="${valToPts(line.width || 1)}"${line.cap != null ? ` cap="${nativeLineCap(line.cap)}"` : ''}>${line.type === 'none' ? '<a:noFill/>' : genXmlColorSelection(line)}</a:ln></p:spPr></p:sp>`;
                        }
                    });
                    return xml + '</p:grpSp>';
                };
                strSlideXml += renderGroup(group, groupId, groupName);
                break;
            }
            case SLIDE_OBJECT_TYPES.connector: {
                // Native connectors are not ordinary line shapes. Keeping the
                // p:cxnSp structure is what lets PowerPoint retain endpoint
                // attachment and expose connector editing in the UI.
                const connector = slideItemObj.connector || slideItemObj.options || {};
                const cxnX = Math.round(Number(connector.x || 0) * EMU);
                const cxnY = Math.round(Number(connector.y || 0) * EMU);
                const cxnW = Math.round(Number(connector.w || 0) * EMU);
                const cxnH = Math.round(Number(connector.h || 0) * EMU);
                const creationId = (slide._slideNum * 10000) + (idx + 2);
                const explicitSpid = connector.spid;
                // The ordinary generated-object sequence is deterministic. Callers
                // importing a deck with preserved IDs can provide `spid` explicitly.
                const seqId = idx + 2;
                const connectorId = explicitSpid || seqId;
                const name = String(connector.objectName || `Connector ${idx + 1}`);
                strSlideXml += '<p:cxnSp>';
                strSlideXml += `<p:nvCxnSpPr>${genXmlCNvPr({ id: connectorId, name, creationId, options: connector })}`;
                strSlideXml += '<p:cNvCxnSpPr><a:cxnSpLocks/>';
                if (connector.startShapeId !== undefined)
                    strSlideXml += `<a:stCxn id="${connector.startShapeId}" idx="${(_k = connector.startConnectionIndex) !== null && _k !== void 0 ? _k : 0}"/>`;
                if (connector.endShapeId !== undefined)
                    strSlideXml += `<a:endCxn id="${connector.endShapeId}" idx="${(_l = connector.endConnectionIndex) !== null && _l !== void 0 ? _l : 0}"/>`;
                strSlideXml += '</p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr>';
                strSlideXml += `<p:spPr><a:xfrm${locationAttr}>`;
                strSlideXml += `<a:off x="${cxnX}" y="${cxnY}"/><a:ext cx="${cxnW}" cy="${cxnH}"/>`;
                // The public authoring vocabulary keeps the PowerPoint-facing
                // `elbowConnectorN` names used by the MCP contract, while DrawingML
                // serializes those presets as `bentConnectorN`.  Emitting the public
                // alias verbatim produces a package PowerPoint cannot open.
                const connectorPreset = String(connector.connectorType || 'straightConnector1');
                const drawingmlPreset = { elbowConnector2: 'bentConnector2', elbowConnector3: 'bentConnector3', elbowConnector4: 'bentConnector4' }[connectorPreset] || connectorPreset;
                strSlideXml += `</a:xfrm><a:prstGeom prst="${drawingmlPreset}"><a:avLst/></a:prstGeom>`;
                const line = connector.line || {};
                // Exact connector gallery presets carry the narrow line/style fragments
                // derived from PowerPoint's stable ShapeStyle API. An empty raw line is an
                // intentional omission so the connector inherits the theme line reference.
                const connectorAny = connector;
                const typedConnectorStyle = ((_m = connectorAny._connectorStyleState) === null || _m === void 0 ? void 0 : _m.schemaVersion) === 'betterpptx.connector-style-state.v1';
                if (typedConnectorStyle) {
                    const hasLineLeaves = Object.keys(line).length > 0;
                    if (hasLineLeaves) {
                        const lineAttrs = (Object.prototype.hasOwnProperty.call(line, 'width') ? ` w="${valToPts(line.width)}"` : '') + (line.cap != null ? ` cap="${nativeLineCap(line.cap)}"` : '');
                        strSlideXml += `<a:ln${lineAttrs}>`;
                        if (line.type === 'none') {
                            strSlideXml += '<a:noFill/>';
                        }
                        else if (Object.prototype.hasOwnProperty.call(line, 'color') || Object.prototype.hasOwnProperty.call(line, 'transparency')) {
                            const inheritedColor = (_q = (_p = (_o = connectorAny._connectorStyleState) === null || _o === void 0 ? void 0 : _o.themeStyle) === null || _p === void 0 ? void 0 : _p.lineRef) === null || _q === void 0 ? void 0 : _q.color;
                            const colorLine = Object.prototype.hasOwnProperty.call(line, 'color')
                                ? line
                                : Object.assign(Object.assign({}, line), { color: inheritedColor || DEF_SHAPE_LINE_COLOR });
                            strSlideXml += genXmlColorSelection(colorLine);
                        }
                        if (line.dashType)
                            strSlideXml += `<a:prstDash val="${encodeXmlEntities(line.dashType)}"/>`;
                        strSlideXml += genXmlArrowEnd('headEnd', line.beginArrowType, line.beginArrowWidth, line.beginArrowLength);
                        strSlideXml += genXmlArrowEnd('tailEnd', line.endArrowType, line.endArrowWidth, line.endArrowLength);
                        strSlideXml += '</a:ln>';
                    }
                }
                else if (Object.prototype.hasOwnProperty.call(connectorAny, '_rawConnectorLineXml')) {
                    strSlideXml += connectorAny._rawConnectorLineXml || '';
                }
                else {
                    const lineWidth = line.width ? valToPts(line.width) : valToPts(1);
                    strSlideXml += `<a:ln w="${lineWidth}" cap="${nativeLineCap(line.cap)}" cmpd="sng" algn="ctr">`;
                    if (line.type === 'none')
                        strSlideXml += '<a:noFill/>';
                    else
                        strSlideXml += genXmlColorSelection(line);
                    if (line.dashType)
                        strSlideXml += `<a:prstDash val="${encodeXmlEntities(line.dashType)}"/>`;
                    strSlideXml += genXmlArrowEnd('headEnd', line.beginArrowType, line.beginArrowWidth, line.beginArrowLength);
                    strSlideXml += genXmlArrowEnd('tailEnd', line.endArrowType, line.endArrowWidth, line.endArrowLength);
                    strSlideXml += '</a:ln>';
                }
                strSlideXml += createConnectorEffectsXml(connector);
                strSlideXml += '</p:spPr>';
                strSlideXml += connectorAny._rawConnectorStyleXml || '<p:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="1"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef></p:style>';
                strSlideXml += '</p:cxnSp>';
                break;
            }
            case SLIDE_OBJECT_TYPES.shape:
            case SLIDE_OBJECT_TYPES.text:
            case SLIDE_OBJECT_TYPES.placeholder:
                // Lines can have zero cy, but text should not
                if (!slideItemObj.options.line && cy === 0)
                    cy = EMU * 0.3;
                // Margin/Padding/Inset for textboxes (skip for pure shapes)
                if (slideItemObj._type !== SLIDE_OBJECT_TYPES.shape) {
                    if (!slideItemObj.options._bodyProp)
                        slideItemObj.options._bodyProp = {};
                    if (slideItemObj.options.margin && Array.isArray(slideItemObj.options.margin)) {
                        // margin order is [top, right, bottom, left]
                        slideItemObj.options._bodyProp.tIns = valToPts(slideItemObj.options.margin[0] || 0);
                        slideItemObj.options._bodyProp.rIns = valToPts(slideItemObj.options.margin[1] || 0);
                        slideItemObj.options._bodyProp.bIns = valToPts(slideItemObj.options.margin[2] || 0);
                        slideItemObj.options._bodyProp.lIns = valToPts(slideItemObj.options.margin[3] || 0);
                    }
                    else if (typeof slideItemObj.options.margin === 'number') {
                        slideItemObj.options._bodyProp.lIns = valToPts(slideItemObj.options.margin);
                        slideItemObj.options._bodyProp.rIns = valToPts(slideItemObj.options.margin);
                        slideItemObj.options._bodyProp.bIns = valToPts(slideItemObj.options.margin);
                        slideItemObj.options._bodyProp.tIns = valToPts(slideItemObj.options.margin);
                    }
                    else if (slideItemObj.options.margin === null) {
                        delete slideItemObj.options._bodyProp.lIns;
                        delete slideItemObj.options._bodyProp.rIns;
                        delete slideItemObj.options._bodyProp.bIns;
                        delete slideItemObj.options._bodyProp.tIns;
                    }
                    if (typeof slideItemObj.options.valign === 'string') {
                        const valign = slideItemObj.options.valign.toLowerCase();
                        slideItemObj.options._bodyProp.anchor = valign.startsWith('b')
                            ? TEXT_VALIGN.b
                            : valign.startsWith('m') || valign.startsWith('c')
                                ? TEXT_VALIGN.ctr
                                : TEXT_VALIGN.t;
                    }
                    else if (slideItemObj.options.valign === null) {
                        delete slideItemObj.options._bodyProp.anchor;
                    }
                }
                // A: Start SHAPE =======================================================
                strSlideXml += '<p:sp>';
                // B: The addition of the "txBox" attribute is the sole determiner of if an object is a shape or textbox
                // Generate creationId (unique per object, starts from a large number to avoid conflicts)
                const creationId = (slide._slideNum * 10000) + (idx + 2);
                // Use options.spid if provided (decyphered shapes preserve original PowerPoint IDs for comparator matching).
                // When spid is set, use it directly. Otherwise use sequential idx+2, but skip any IDs already
                // claimed by passthrough shapes (via addPassthroughXml) to prevent duplicate shape IDs (0x80070570).
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const explicitSpid = slideItemObj.options.spid;
                let seqId = idx + 2;
                if (!explicitSpid) {
                    // Collect IDs used by passthrough shapes to avoid collision
                    const passthroughIds = new Set();
                    slide._slideObjects.forEach(obj => {
                        var _a;
                        if (obj._type === SLIDE_OBJECT_TYPES.passthrough && ((_a = obj.passthrough) === null || _a === void 0 ? void 0 : _a.xml)) {
                            const ptIdMatches = obj.passthrough.xml.matchAll(/<p:cNvPr\s+id="(\d+)"/g);
                            for (const m of ptIdMatches)
                                passthroughIds.add(parseInt(m[1]));
                        }
                    });
                    // Skip sequential IDs that would collide with passthrough shape IDs
                    while (passthroughIds.has(seqId))
                        seqId++;
                }
                const shapeId = explicitSpid || seqId;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const shapePhType = slideItemObj.options.phType ||
                    slideItemObj.options._phType ||
                    slideItemObj.options._placeholderType;
                const isClipArtPlaceholderShape = shapePhType === 'clipArt';
                let shapeCNvPrChildren = '';
                // <Hyperlink>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const _rawShapeHlinkClickXml = slideItemObj.options._rawShapeHlinkClickXml;
                const suppressLegacyShapeHyperlink = Boolean(slideItemObj.options._suppressLegacyHyperlinkForInteractiveAction);
                if (_rawShapeHlinkClickXml && !suppressLegacyShapeHyperlink) {
                    shapeCNvPrChildren += _rawShapeHlinkClickXml;
                }
                else if (!suppressLegacyShapeHyperlink) {
                    if ((_r = slideItemObj.options.hyperlink) === null || _r === void 0 ? void 0 : _r.url) {
                        shapeCNvPrChildren += `<a:hlinkClick r:id="rId${slideItemObj.options.hyperlink._rId}" tooltip="${slideItemObj.options.hyperlink.tooltip ? encodeXmlEntities(slideItemObj.options.hyperlink.tooltip) : ''}"${slideItemObj.options.hyperlink.target ? ` tgtFrame="${encodeXmlEntities(slideItemObj.options.hyperlink.target)}"` : ''}/>`;
                    }
                    if ((_s = slideItemObj.options.hyperlink) === null || _s === void 0 ? void 0 : _s.slide) {
                        shapeCNvPrChildren += `<a:hlinkClick r:id="rId${slideItemObj.options.hyperlink._rId}" tooltip="${slideItemObj.options.hyperlink.tooltip ? encodeXmlEntities(slideItemObj.options.hyperlink.tooltip) : ''}" action="ppaction://hlinksldjump"/>`;
                    }
                }
                // </Hyperlink>
                strSlideXml += `<p:nvSpPr>${genXmlCNvPr({
                    id: shapeId,
                    name: slideItemObj.options.objectName,
                    creationId: isClipArtPlaceholderShape ? undefined : creationId,
                    options: slideItemObj.options,
                    children: shapeCNvPrChildren,
                })}`;
                // Emit spLocks if _spLocks option is set (decyphered native placeholder shapes have noGrp="1")
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const spLocksAttr = slideItemObj.options._spLocks;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const hasSpLocks = Object.prototype.hasOwnProperty.call(slideItemObj.options, '_spLocks');
                const spLocksXml = spLocksAttr ? `<a:spLocks ${spLocksAttr}/>` : '<a:spLocks/>';
                if ((_t = slideItemObj.options) === null || _t === void 0 ? void 0 : _t.isTextBox) {
                    strSlideXml += hasSpLocks ? `<p:cNvSpPr txBox="1">${spLocksXml}</p:cNvSpPr>` : '<p:cNvSpPr txBox="1"/>';
                }
                else if (hasSpLocks) {
                    strSlideXml += `<p:cNvSpPr>${spLocksXml}</p:cNvSpPr>`;
                }
                else if (isClipArtPlaceholderShape) {
                    strSlideXml += '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>';
                }
                else {
                    strSlideXml += '<p:cNvSpPr/>';
                }
                // Emit ph placeholder element if phType/_phType/placeholder is set (decyphered native placeholder shapes)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const phType = shapePhType;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const phIdx = (_v = (_u = slideItemObj.options.phIdx) !== null && _u !== void 0 ? _u : slideItemObj.options._phIdx) !== null && _v !== void 0 ? _v : slideItemObj.options._placeholderIdx;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const phSz = slideItemObj.options.phSz ||
                    slideItemObj.options._phSz ||
                    slideItemObj.options._placeholderSz;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const phOrient = slideItemObj.options.phOrient ||
                    slideItemObj.options._phOrient ||
                    slideItemObj.options._placeholderOrient;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const phHasCustomPrompt = (_y = (_x = (_w = slideItemObj.options.phHasCustomPrompt) !== null && _w !== void 0 ? _w : slideItemObj.options.hasCustomPrompt) !== null && _x !== void 0 ? _x : slideItemObj.options._phHasCustomPrompt) !== null && _y !== void 0 ? _y : slideItemObj.options._placeholderHasCustomPrompt;
                // Also check options.placeholder - decypher tool sets this when phType is detected
                // If placeholder is set but no slide layout found (placeholderObj is null), emit ph directly
                const placeholderProp = slideItemObj.options.placeholder;
                let nvPrContent = '';
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const hasBarePh = slideItemObj.options.hasBarePh || slideItemObj.options._barePlaceholder;
                if (phType) {
                    nvPrContent = genXmlPlaceholderElement(phType, phIdx, phSz, phOrient, phHasCustomPrompt);
                }
                else if (phIdx !== undefined && phIdx !== null) {
                    nvPrContent = genXmlPlaceholderElement('', phIdx, phSz, phOrient, phHasCustomPrompt);
                }
                else if (hasBarePh) {
                    nvPrContent = `<p:ph/>`;
                }
                else if (slideItemObj._type === 'placeholder') {
                    nvPrContent = genXmlPlaceholder(slideItemObj);
                }
                else if (placeholderProp && !placeholderObj) {
                    // placeholder set but no layout object found - emit ph type directly (decypher mode)
                    nvPrContent = `<p:ph type="${placeholderProp}"/>`;
                }
                else {
                    nvPrContent = genXmlPlaceholder(placeholderObj);
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const rawNvPrChildXml = slideItemObj.options._rawNvPrChildXml;
                if (rawNvPrChildXml)
                    nvPrContent += rawNvPrChildXml;
                strSlideXml += `<p:nvPr>${nvPrContent}</p:nvPr>`;
                strSlideXml += '</p:nvSpPr><p:spPr>';
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const emptySpPr = slideItemObj.options._emptySpPr;
                if (!emptySpPr) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const omitTransform = !!slideItemObj.options._omitTransform;
                    if (!omitTransform) {
                        strSlideXml += `<a:xfrm${locationAttr}>`;
                        strSlideXml += `<a:off x="${x}" y="${y}"/>`;
                        strSlideXml += `<a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;
                    }
                    const presetShapeName = normalizePresetShapeName(slideItemObj.shape);
                    // `rectRadius` is a rounded-rectangle adjustment, not a generic
                    // preset-geometry adjustment.  Emitting an `adj` guide for shapes
                    // such as `ellipse` produces a package that PowerPoint cannot open
                    // (the ellipse preset has no `adj` guide).  Keep the preset geometry
                    // itself, but only serialize the rounded-rectangle guide where the
                    // preset defines that adjustment.
                    const supportsRectRadiusAdjustment = presetShapeName === 'roundRect';
                    // Decyphered native placeholders can legally have only xfrm in p:spPr.
                    // Preserve that source structure only when the decypher explicitly marks it.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const omitShapePresetGeometry = !!slideItemObj.options._omitShapePrstGeom;
                    const shouldEmitPresetGeometry = !omitShapePresetGeometry ||
                        presetShapeName !== 'rect' ||
                        !!slideItemObj.options.rectRadius ||
                        !!slideItemObj.options.angleRange;
                    if (isCustomGeometryShape(slideItemObj.shape, slideItemObj.options)) {
                        strSlideXml += '<a:custGeom><a:avLst />';
                        strSlideXml += '<a:gdLst>';
                        strSlideXml += '</a:gdLst>';
                        strSlideXml += '<a:ahLst />';
                        strSlideXml += '<a:cxnLst>';
                        strSlideXml += '</a:cxnLst>';
                        strSlideXml += '<a:rect l="l" t="t" r="r" b="b" />';
                        strSlideXml += '<a:pathLst>';
                        strSlideXml += `<a:path w="${cx}" h="${cy}">`;
                        (_z = slideItemObj.options.points) === null || _z === void 0 ? void 0 : _z.forEach((point, i) => {
                            if ('curve' in point) {
                                switch (point.curve.type) {
                                    case 'arc':
                                        strSlideXml += `<a:arcTo hR="${getSmartParseNumber(point.curve.hR, 'Y', slide._presLayout)}" wR="${getSmartParseNumber(point.curve.wR, 'X', slide._presLayout)}" stAng="${convertRotationDegrees(point.curve.stAng)}" swAng="${convertRotationDegrees(point.curve.swAng)}" />`;
                                        break;
                                    case 'cubic':
                                        strSlideXml += `<a:cubicBezTo>
									<a:pt x="${getSmartParseNumber(point.curve.x1, 'X', slide._presLayout)}" y="${getSmartParseNumber(point.curve.y1, 'Y', slide._presLayout)}" />
									<a:pt x="${getSmartParseNumber(point.curve.x2, 'X', slide._presLayout)}" y="${getSmartParseNumber(point.curve.y2, 'Y', slide._presLayout)}" />
									<a:pt x="${getSmartParseNumber(point.x, 'X', slide._presLayout)}" y="${getSmartParseNumber(point.y, 'Y', slide._presLayout)}" />
									</a:cubicBezTo>`;
                                        break;
                                    case 'quadratic':
                                        strSlideXml += `<a:quadBezTo>
									<a:pt x="${getSmartParseNumber(point.curve.x1, 'X', slide._presLayout)}" y="${getSmartParseNumber(point.curve.y1, 'Y', slide._presLayout)}" />
									<a:pt x="${getSmartParseNumber(point.x, 'X', slide._presLayout)}" y="${getSmartParseNumber(point.y, 'Y', slide._presLayout)}" />
									</a:quadBezTo>`;
                                        break;
                                    default:
                                        break;
                                }
                            }
                            else if ('close' in point) {
                                strSlideXml += '<a:close />';
                            }
                            else if (point.moveTo || i === 0) {
                                strSlideXml += `<a:moveTo><a:pt x="${getSmartParseNumber(point.x, 'X', slide._presLayout)}" y="${getSmartParseNumber(point.y, 'Y', slide._presLayout)}" /></a:moveTo>`;
                            }
                            else {
                                strSlideXml += `<a:lnTo><a:pt x="${getSmartParseNumber(point.x, 'X', slide._presLayout)}" y="${getSmartParseNumber(point.y, 'Y', slide._presLayout)}" /></a:lnTo>`;
                            }
                        });
                        strSlideXml += '</a:path>';
                        strSlideXml += '</a:pathLst>';
                        strSlideXml += '</a:custGeom>';
                    }
                    else if (shouldEmitPresetGeometry) {
                        strSlideXml += '<a:prstGeom prst="' + presetShapeName + '"><a:avLst>';
                        if (slideItemObj.options.rectRadius && supportsRectRadiusAdjustment) {
                            strSlideXml += `<a:gd name="adj" fmla="val ${Math.round((slideItemObj.options.rectRadius * EMU * 100000) / Math.min(cx, cy))}"/>`;
                        }
                        else if (slideItemObj.options.angleRange) {
                            for (let i = 0; i < 2; i++) {
                                const angle = slideItemObj.options.angleRange[i];
                                strSlideXml += `<a:gd name="adj${i + 1}" fmla="val ${convertRotationDegrees(angle)}" />`;
                            }
                            if (slideItemObj.options.arcThicknessRatio) {
                                strSlideXml += `<a:gd name="adj3" fmla="val ${Math.round(slideItemObj.options.arcThicknessRatio * 50000)}" />`;
                            }
                        }
                        strSlideXml += '</a:avLst></a:prstGeom>';
                    }
                    // Option: FILL
                    // Native shapes (_nativeMinimal) from decyphered PPTX files inherit fill from slide master/layout.
                    // Do NOT emit <a:noFill/> for these shapes - they should get fill from inheritance.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const rawFillXml = slideItemObj.options._rawFillXml;
                    const hasRawFillXml = Object.prototype.hasOwnProperty.call(slideItemObj.options, '_rawFillXml');
                    if (hasRawFillXml) {
                        // _rawFillXml: passthrough raw fill XML (used for schemeClr fills that can't go through color API)
                        // An empty string is intentional: exact native styles may inherit their fill
                        // exclusively from the sibling p:style block and must suppress compiler defaults.
                        strSlideXml += rawFillXml || '';
                    }
                    else if (slideItemObj.options.fill) {
                        strSlideXml += genXmlColorSelection(slideItemObj.options.fill);
                    }
                    else if (!slideItemObj.options._nativeMinimal) {
                        strSlideXml += '<a:noFill/>';
                    }
                    // shape Type: LINE: line color
                    // _rawLineXml: passthrough raw line XML (used for explicit noFill borders, schemeClr line colors etc.)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const rawLineXml = slideItemObj.options._rawLineXml;
                    const hasRawLineXml = Object.prototype.hasOwnProperty.call(slideItemObj.options, '_rawLineXml');
                    if (hasRawLineXml) {
                        // Empty is an exact suppression state, analogous to _rawFillXml above.
                        strSlideXml += rawLineXml || '';
                    }
                    // Add PowerPoint default line attributes: cap="flat" cmpd="sng" algn="ctr"
                    // Native shapes (_nativeMinimal) usually inherit line from slide master/layout.
                    // Still emit an explicit line when decypher preserved a real border; otherwise
                    // filled native text panels lose their visible outline.
                    const hasExplicitLine = !!slideItemObj.options.line && slideItemObj.options.line.type !== 'none';
                    const hasExplicitNoLine = !!slideItemObj.options._explicitNoLine && ((_0 = slideItemObj.options.line) === null || _0 === void 0 ? void 0 : _0.type) === 'none';
                    if (!hasRawLineXml && hasExplicitNoLine) {
                        // An omitted a:ln inherits from p:style/theme. Explicit type:none must
                        // therefore author noFill so a themed border cannot reappear.
                        strSlideXml += '<a:ln><a:noFill/></a:ln>';
                    }
                    else if (!hasRawLineXml && hasExplicitLine) {
                        const lineWidth = slideItemObj.options.line.width ? valToPts(slideItemObj.options.line.width) : valToPts(1);
                        strSlideXml += `<a:ln w="${lineWidth}" cap="${nativeLineCap(slideItemObj.options.line.cap)}" cmpd="sng" algn="ctr">`;
                        const lineHasFill = !!slideItemObj.options.line.color || slideItemObj.options.line.type === 'gradient';
                        if (lineHasFill) {
                            strSlideXml += genXmlColorSelection(slideItemObj.options.line);
                        }
                        else {
                            strSlideXml += '<a:noFill/>';
                        }
                        // Add dash pattern: always when explicitly set; for non-native shapes add default
                        if (slideItemObj.options.line.dashType) {
                            strSlideXml += `<a:prstDash val="${encodeXmlEntities(slideItemObj.options.line.dashType)}"/>`;
                        }
                        else if (!slideItemObj.options._nativeMinimal) {
                            strSlideXml += '<a:prstDash val="solid"/>';
                        }
                        // CT_LineProperties requires dash before the line-join choice.
                        // Native shapes (_nativeMinimal=true) from PPTX files don't need the default join.
                        if (!slideItemObj.options._nativeMinimal)
                            strSlideXml += '<a:miter lim="800000"/>';
                        strSlideXml += genXmlArrowEnd('headEnd', slideItemObj.options.line.beginArrowType, slideItemObj.options.line.beginArrowWidth, slideItemObj.options.line.beginArrowLength);
                        strSlideXml += genXmlArrowEnd('tailEnd', slideItemObj.options.line.endArrowType, slideItemObj.options.line.endArrowWidth, slideItemObj.options.line.endArrowLength);
                        strSlideXml += '</a:ln>';
                    }
                    // EFFECTS: Shadow, Glow, Reflection, Soft Edges
                    // REF: @see http://officeopenxml.com/drwSp-effects.php
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const _rawEffectLstXml = slideItemObj.options._rawEffectLstXml;
                    if (_rawEffectLstXml) {
                        // Passthrough: emit raw effectLst XML (e.g. reflection+shadow from native PP shapes)
                        strSlideXml += _rawEffectLstXml;
                    }
                    else {
                        const hasGlow = hasGlowElement(slideItemObj.options.glow, { size: 8, color: '00FFFF', opacity: 0.75 });
                        const hasEffects = slideItemObj.options.shadow || hasGlow || slideItemObj.options.reflection || slideItemObj.options.softEdges || slideItemObj.options.blur || slideItemObj.options.fillOverlay;
                        if (hasEffects) {
                            strSlideXml += '<a:effectLst>';
                            if (slideItemObj.options.blur) {
                                strSlideXml += createBlurXml(slideItemObj.options.blur);
                            }
                            if (slideItemObj.options.fillOverlay) {
                                strSlideXml += createFillOverlayXml(slideItemObj.options.fillOverlay);
                            }
                            // GLOW: Must come before shadow in effectLst
                            if (hasGlow) {
                                strSlideXml += createGlowElement(slideItemObj.options.glow, { size: 8, color: '00FFFF', opacity: 0.75 });
                            }
                            // SHADOW
                            if (slideItemObj.options.shadow && slideItemObj.options.shadow.type !== 'none') {
                                strSlideXml += createInlineShadowXml(slideItemObj.options.shadow);
                            }
                            // REFLECTION
                            if (slideItemObj.options.reflection) {
                                strSlideXml += createReflectionElement(slideItemObj.options.reflection);
                            }
                            // SOFT EDGES
                            if (slideItemObj.options.softEdges) {
                                const softEdgeSize = valToPts(slideItemObj.options.softEdges.size || 0);
                                if (softEdgeSize > 0) {
                                    strSlideXml += `<a:softEdge rad="${softEdgeSize}"/>`;
                                }
                            }
                            strSlideXml += '</a:effectLst>';
                        }
                        else if (!slideItemObj.options._nativeMinimal) {
                            // PowerPoint includes empty effectLst tag even when no effects
                            // Skip when _nativeMinimal is set (native PowerPoint files don't include this)
                            strSlideXml += '<a:effectLst/>';
                        }
                    }
                    // 3D EFFECTS: Add scene3d and sp3d for 3D effects on shapes
                    // NOTE: effect3D is for shape-level 3D (applied here in <p:spPr>)
                    // NOTE: text3D is for text-level 3D (applied in <a:bodyPr>, not here)
                    // OOXML/PowerPoint order is effectLst, then scene3d, then sp3d.
                    // Passthrough: emit raw scene3d/sp3d XML from p:spPr (for native PP 3D shapes)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const _rawSpPrScene3dXml = slideItemObj.options._rawSpPrScene3dXml;
                    if (slideItemObj.options.effect3D && !_rawSpPrScene3dXml) {
                        strSlideXml += create3DElements(slideItemObj.options.effect3D);
                    }
                    if (_rawSpPrScene3dXml) {
                        strSlideXml += _rawSpPrScene3dXml;
                    }
                    // PowerPoint Office 2014+ extension: hiddenFill and hiddenLine
                    // These are cosmetic tags that PowerPoint adds for compatibility.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const _rawSpPrExtLstXml = slideItemObj.options._rawSpPrExtLstXml;
                    if (_rawSpPrExtLstXml) {
                        strSlideXml += _rawSpPrExtLstXml;
                    }
                    else if (!slideItemObj.options._nativeMinimal) {
                        strSlideXml += '<a:extLst>';
                        strSlideXml += '<a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}"><a14:hiddenLine xmlns:a14="http://schemas.microsoft.com/office/drawing/2014/main"/></a:ext>';
                        if (!isClipArtPlaceholderShape) {
                            strSlideXml += '<a:ext uri="{909E8E84-426E-40DD-AFC4-6F175D3DCCD1}"><a14:hiddenFill xmlns:a14="http://schemas.microsoft.com/office/drawing/2014/main"/></a:ext>';
                        }
                        strSlideXml += '</a:extLst>';
                    }
                }
                /* TODO: FUTURE: Text wrapping (copied from MS-PPTX export)
                    // Commented out b/c i'm not even sure this works - current code produces text that wraps in shapes and textboxes, so...
                    if ( slideItemObj.options.textWrap ) {
                        strSlideXml += '<a:extLst>'
                                    + '<a:ext uri="{C572A759-6A51-4108-AA02-DFA0A04FC94B}">'
                                    + '<ma14:wrappingTextBoxFlag xmlns:ma14="http://schemas.microsoft.com/office/mac/drawingml/2011/main" val="1"/>'
                                    + '</a:ext>'
                                    + '</a:extLst>';
                    }
                */
                // B: Close shape Properties
                strSlideXml += '</p:spPr>';
                // Native PowerPoint shapes can rely on this sibling style block for theme
                // fill/effect references even when their spPr is otherwise minimal.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const _rawShapeStyleXml = slideItemObj.options._rawShapeStyleXml;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const _shapeStyleRefs = slideItemObj.options._shapeStyleRefs;
                if (_rawShapeStyleXml)
                    strSlideXml += _rawShapeStyleXml;
                else if (_shapeStyleRefs)
                    strSlideXml += genXmlShapeStyleRefs(_shapeStyleRefs);
                // C: Add formatted text (text body "bodyPr") - skip for pure shapes
                if (slideItemObj._type !== SLIDE_OBJECT_TYPES.shape) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const _rawTxBodyXml = slideItemObj.options._rawTxBodyXml;
                    if (slideItemObj._type === SLIDE_OBJECT_TYPES.text && slideItemObj.options._nativeMinimal && _rawTxBodyXml)
                        strSlideXml += _rawTxBodyXml;
                    else
                        strSlideXml += genXmlTextBody(slideItemObj);
                }
                // LAST: Close SHAPE =======================================================
                strSlideXml += '</p:sp>';
                break;
            case SLIDE_OBJECT_TYPES.cameo: {
                // Native PowerPoint cameo (live camera feed): picture marked with alf:liveFeedProps,
                // svg-only camera-glyph placeholder, default ellipse frame. @see plans/cameo-ooxml-ground-truth.md
                const cameoId = slideItemObj.options.spid ? slideItemObj.options.spid : idx + 2;
                const cameoName = slideItemObj.options.objectName || `Camera ${idx + 1}`;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const cameoShape = slideItemObj.options._cameoShape || 'ellipse';
                strSlideXml += '<p:pic>';
                strSlideXml += ' <p:nvPicPr>';
                strSlideXml += `  ${genXmlCNvPr({ id: cameoId, name: cameoName, options: slideItemObj.options })}`;
                strSlideXml += '  <p:cNvPicPr><a:picLocks noChangeAspect="1"/><a:extLst>';
                strSlideXml += `   <a:ext uri="${CAMEO_LIVEFEED_EXT_URI}"><alf:liveFeedProps xmlns:alf="${CAMEO_LIVEFEED_NS}"/></a:ext>`;
                strSlideXml += '  </a:extLst></p:cNvPicPr>';
                strSlideXml += '  <p:nvPr/>';
                strSlideXml += ' </p:nvPicPr>';
                strSlideXml += ' <p:blipFill>';
                strSlideXml += '  <a:blip><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">';
                strSlideXml += `   <asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rId${slideItemObj.imageRid}"/>`;
                strSlideXml += '  </a:ext></a:extLst></a:blip>';
                strSlideXml += '  <a:stretch><a:fillRect/></a:stretch>';
                strSlideXml += ' </p:blipFill>';
                strSlideXml += ' <p:spPr>';
                strSlideXml += `  <a:xfrm${locationAttr}><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;
                strSlideXml += `  <a:prstGeom prst="${cameoShape}"><a:avLst/></a:prstGeom>`;
                strSlideXml += ' </p:spPr>';
                strSlideXml += '</p:pic>';
                break;
            }
            case SLIDE_OBJECT_TYPES.zoom: {
                // Native PowerPoint Slide Zoom: mc:AlternateContent (pslz:sldZm Choice + hyperlinked
                // picture Fallback). @see plans/zoom-ooxml-ground-truth.md
                const zo = slideItemObj.options;
                const zId = zo.spid ? zo.spid : idx + 2;
                const zName = slideItemObj.options.objectName || `Slide Zoom ${idx + 1}`;
                const zSldId = zo._zoomSldId;
                const zSlideRid = zo._zoomSlideRid;
                const zThumbRid = slideItemObj.imageRid;
                const zRet = zo._zoomReturnToParent ? 1 : 0;
                const zDur = zo._zoomTransitionDur != null ? zo._zoomTransitionDur : 1000;
                const zGuid = zo._zoomGuid;
                strSlideXml += '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">';
                strSlideXml += `<mc:Choice xmlns:pslz="${ZOOM_SLIDEZOOM_NS}" Requires="pslz">`;
                strSlideXml += '<p:graphicFrame><p:nvGraphicFramePr>';
                strSlideXml += genXmlCNvPr({ id: zId, name: zName, options: zo });
                strSlideXml += '<p:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></p:cNvGraphicFramePr>';
                strSlideXml += '<p:nvPr/></p:nvGraphicFramePr>';
                strSlideXml += `<p:xfrm${locationAttr}><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></p:xfrm>`;
                strSlideXml += `<a:graphic><a:graphicData uri="${ZOOM_SLIDEZOOM_NS}">`;
                strSlideXml += `<pslz:sldZm><pslz:sldZmObj sldId="${zSldId}" cId="0">`;
                strSlideXml += `<pslz:zmPr id="${zGuid}" returnToParent="${zRet}" transitionDur="${zDur}">`;
                strSlideXml += `<p166:blipFill xmlns:p166="${ZOOM_P166_NS}"><a:blip r:embed="rId${zThumbRid}"/><a:stretch><a:fillRect/></a:stretch></p166:blipFill>`;
                strSlideXml += `<p166:spPr xmlns:p166="${ZOOM_P166_NS}"><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="3175"><a:solidFill><a:prstClr val="ltGray"/></a:solidFill></a:ln></p166:spPr>`;
                strSlideXml += '</pslz:zmPr></pslz:sldZmObj></pslz:sldZm>';
                strSlideXml += '</a:graphicData></a:graphic></p:graphicFrame></mc:Choice>';
                strSlideXml += '<mc:Fallback><p:pic><p:nvPicPr>';
                strSlideXml += genXmlCNvPr({ id: zId, name: zName, options: zo, children: `<a:hlinkClick r:id="rId${zSlideRid}" action="ppaction://hlinksldjump"/>` });
                strSlideXml += '<p:cNvPicPr><a:picLocks noGrp="1" noRot="1" noChangeAspect="1" noMove="1" noResize="1" noEditPoints="1" noAdjustHandles="1" noChangeArrowheads="1" noChangeShapeType="1"/></p:cNvPicPr>';
                strSlideXml += '<p:nvPr/></p:nvPicPr>';
                strSlideXml += `<p:blipFill><a:blip r:embed="rId${zThumbRid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>`;
                strSlideXml += `<p:spPr><a:xfrm${locationAttr}><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="3175"><a:solidFill><a:prstClr val="ltGray"/></a:solidFill></a:ln></p:spPr>`;
                strSlideXml += '</p:pic></mc:Fallback></mc:AlternateContent>';
                break;
            }
            case SLIDE_OBJECT_TYPES.sectionZoom: {
                // Native PowerPoint Section Zoom: mc:AlternateContent (psez:sectionZm Choice + picture
                // Fallback hyperlinked to the section's first slide). @see plans/section-zoom-ooxml-ground-truth.md
                const zo = slideItemObj.options;
                const zId = zo.spid ? zo.spid : idx + 2;
                const zName = slideItemObj.options.objectName || `Section Zoom ${idx + 1}`;
                const zSectionId = zo._zoomSectionId;
                const zSlideRid = zo._zoomSlideRid;
                const zThumbRid = slideItemObj.imageRid;
                const zDur = zo._zoomTransitionDur != null ? zo._zoomTransitionDur : 1000;
                const zGuid = zo._zoomGuid;
                strSlideXml += '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">';
                strSlideXml += `<mc:Choice xmlns:psez="${ZOOM_SECTIONZOOM_NS}" Requires="psez">`;
                strSlideXml += '<p:graphicFrame><p:nvGraphicFramePr>';
                strSlideXml += genXmlCNvPr({ id: zId, name: zName, options: zo });
                strSlideXml += '<p:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></p:cNvGraphicFramePr>';
                strSlideXml += '<p:nvPr/></p:nvGraphicFramePr>';
                strSlideXml += `<p:xfrm${locationAttr}><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></p:xfrm>`;
                strSlideXml += `<a:graphic><a:graphicData uri="${ZOOM_SECTIONZOOM_NS}">`;
                strSlideXml += `<psez:sectionZm><psez:sectionZmObj sectionId="${zSectionId}">`;
                strSlideXml += `<psez:zmPr id="${zGuid}" transitionDur="${zDur}">`;
                strSlideXml += `<p166:blipFill xmlns:p166="${ZOOM_P166_NS}"><a:blip r:embed="rId${zThumbRid}"/><a:stretch><a:fillRect/></a:stretch></p166:blipFill>`;
                strSlideXml += `<p166:spPr xmlns:p166="${ZOOM_P166_NS}"><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="3175"><a:solidFill><a:prstClr val="ltGray"/></a:solidFill></a:ln></p166:spPr>`;
                strSlideXml += '</psez:zmPr></psez:sectionZmObj></psez:sectionZm>';
                strSlideXml += '</a:graphicData></a:graphic></p:graphicFrame></mc:Choice>';
                strSlideXml += '<mc:Fallback><p:pic><p:nvPicPr>';
                strSlideXml += genXmlCNvPr({ id: zId, name: zName, options: zo, children: `<a:hlinkClick r:id="rId${zSlideRid}" action="ppaction://hlinksldjump"/>` });
                strSlideXml += '<p:cNvPicPr><a:picLocks noGrp="1" noRot="1" noChangeAspect="1" noMove="1" noResize="1" noEditPoints="1" noAdjustHandles="1" noChangeArrowheads="1" noChangeShapeType="1"/></p:cNvPicPr>';
                strSlideXml += '<p:nvPr/></p:nvPicPr>';
                strSlideXml += `<p:blipFill><a:blip r:embed="rId${zThumbRid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>`;
                strSlideXml += `<p:spPr><a:xfrm${locationAttr}><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="3175"><a:solidFill><a:prstClr val="ltGray"/></a:solidFill></a:ln></p:spPr>`;
                strSlideXml += '</p:pic></mc:Fallback></mc:AlternateContent>';
                break;
            }
            case SLIDE_OBJECT_TYPES.summaryZoom: {
                // Native PowerPoint Summary Zoom: mc:AlternateContent (psuz:summaryZm Choice with one
                // summaryZmObj per section + a locked grpSp picture Fallback). @see plans/summary-zoom-ooxml-ground-truth.md
                const zo = slideItemObj.options;
                const zName = slideItemObj.options.objectName || `Summary Zoom ${idx + 1}`;
                const zDur = zo._zoomTransitionDur != null ? zo._zoomTransitionDur : 1000;
                const fr = zo._summaryFrame;
                const sObjs = zo._summaryObjs || [];
                const zId = zo.spid ? zo.spid : idx + 2;
                const E = (v) => String(Math.round(v));
                strSlideXml += '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">';
                strSlideXml += `<mc:Choice xmlns:psuz="${ZOOM_SUMMARYZOOM_NS}" Requires="psuz">`;
                strSlideXml += '<p:graphicFrame><p:nvGraphicFramePr>';
                strSlideXml += genXmlCNvPr({ id: zId, name: zName, options: zo });
                strSlideXml += '<p:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></p:cNvGraphicFramePr>';
                strSlideXml += '<p:nvPr/></p:nvGraphicFramePr>';
                strSlideXml += `<p:xfrm><a:off x="${E(fr.x)}" y="${E(fr.y)}"/><a:ext cx="${E(fr.w)}" cy="${E(fr.h)}"/></p:xfrm>`;
                strSlideXml += `<a:graphic><a:graphicData uri="${ZOOM_SUMMARYZOOM_NS}"><psuz:summaryZm>`;
                sObjs.forEach((o) => {
                    strSlideXml += `<psuz:summaryZmObj sectionId="${o.sectionId}">`;
                    strSlideXml += `<psuz:zmPr id="${o.guid}" transitionDur="${zDur}">`;
                    strSlideXml += `<p166:blipFill xmlns:p166="${ZOOM_P166_NS}"><a:blip r:embed="rId${o.thumbRid}"/><a:stretch><a:fillRect/></a:stretch></p166:blipFill>`;
                    strSlideXml += `<p166:spPr xmlns:p166="${ZOOM_P166_NS}"><a:xfrm><a:off x="${E(o.x)}" y="${E(o.y)}"/><a:ext cx="${E(o.w)}" cy="${E(o.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="3175"><a:solidFill><a:prstClr val="ltGray"/></a:solidFill></a:ln></p166:spPr>`;
                    strSlideXml += '</psuz:zmPr></psuz:summaryZmObj>';
                });
                strSlideXml += '<psuz:gridLayout/></psuz:summaryZm></a:graphicData></a:graphic></p:graphicFrame></mc:Choice>';
                strSlideXml += '<mc:Fallback><p:grpSp><p:nvGrpSpPr>';
                strSlideXml += genXmlCNvPr({ id: zId, name: zName, options: zo });
                strSlideXml += '<p:cNvGrpSpPr><a:grpSpLocks noGrp="1" noUngrp="1" noRot="1" noChangeAspect="1" noMove="1" noResize="1"/></p:cNvGrpSpPr>';
                strSlideXml += '<p:nvPr/></p:nvGrpSpPr>';
                strSlideXml += `<p:grpSpPr><a:xfrm><a:off x="${E(fr.x)}" y="${E(fr.y)}"/><a:ext cx="${E(fr.w)}" cy="${E(fr.h)}"/><a:chOff x="${E(fr.x)}" y="${E(fr.y)}"/><a:chExt cx="${E(fr.w)}" cy="${E(fr.h)}"/></a:xfrm></p:grpSpPr>`;
                let picId = zId + 1;
                sObjs.forEach((o) => {
                    strSlideXml += '<p:pic><p:nvPicPr>';
                    strSlideXml += `<p:cNvPr id="${picId}" name="Picture ${picId}"><a:hlinkClick r:id="rId${o.slideRid}" action="ppaction://hlinksldjump"/></p:cNvPr>`;
                    strSlideXml += '<p:cNvPicPr><a:picLocks noSelect="1" noRot="1" noChangeAspect="1" noMove="1" noResize="1" noEditPoints="1" noAdjustHandles="1" noChangeArrowheads="1" noChangeShapeType="1"/></p:cNvPicPr>';
                    strSlideXml += '<p:nvPr/></p:nvPicPr>';
                    strSlideXml += `<p:blipFill><a:blip r:embed="rId${o.thumbRid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>`;
                    strSlideXml += `<p:spPr><a:xfrm><a:off x="${E(o.x)}" y="${E(o.y)}"/><a:ext cx="${E(o.w)}" cy="${E(o.h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="3175"><a:solidFill><a:prstClr val="ltGray"/></a:solidFill></a:ln></p:spPr>`;
                    strSlideXml += '</p:pic>';
                    picId++;
                });
                strSlideXml += '</p:grpSp></mc:Fallback></mc:AlternateContent>';
                break;
            }
            case SLIDE_OBJECT_TYPES.image:
                strSlideXml += '<p:pic>';
                strSlideXml += '  <p:nvPicPr>';
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const imgShapeId = slideItemObj.options.spid ? slideItemObj.options.spid : idx + 2;
                let imageCNvPrChildren = '';
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const _rawHlinkClickXml = slideItemObj.options._rawHlinkClickXml;
                // A structured hyperlink is newly allocated against this package. Prefer it
                // over an imported raw click record whose relationship ID may be stale.
                const suppressLegacyImageHyperlink = Boolean(slideItemObj.options._suppressLegacyHyperlinkForInteractiveAction);
                if (((_1 = slideItemObj.hyperlink) === null || _1 === void 0 ? void 0 : _1.url) && !suppressLegacyImageHyperlink) {
                    imageCNvPrChildren += `<a:hlinkClick r:id="rId${slideItemObj.hyperlink._rId}" tooltip="${slideItemObj.hyperlink.tooltip ? encodeXmlEntities(slideItemObj.hyperlink.tooltip) : ''}"${slideItemObj.hyperlink.target ? ` tgtFrame="${encodeXmlEntities(slideItemObj.hyperlink.target)}"` : ''}/>`;
                }
                else if (((_2 = slideItemObj.hyperlink) === null || _2 === void 0 ? void 0 : _2.slide) && !suppressLegacyImageHyperlink) {
                    imageCNvPrChildren += `<a:hlinkClick r:id="rId${slideItemObj.hyperlink._rId}" tooltip="${slideItemObj.hyperlink.tooltip ? encodeXmlEntities(slideItemObj.hyperlink.tooltip) : ''}" action="ppaction://hlinksldjump"/>`;
                }
                else if (_rawHlinkClickXml && !suppressLegacyImageHyperlink) {
                    imageCNvPrChildren += _rawHlinkClickXml;
                }
                strSlideXml += genXmlCNvPr({ id: imgShapeId, name: slideItemObj.options.objectName, options: slideItemObj.options, children: imageCNvPrChildren });
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const imgPhType = slideItemObj.options.phType || slideItemObj.options._phType;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const imgPhIdx = (_3 = slideItemObj.options.phIdx) !== null && _3 !== void 0 ? _3 : slideItemObj.options._phIdx;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const imgPhSz = slideItemObj.options.phSz || slideItemObj.options._phSz;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const imgPhOrient = slideItemObj.options.phOrient || slideItemObj.options._phOrient;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const imgPhHasCustomPrompt = (_5 = (_4 = slideItemObj.options.phHasCustomPrompt) !== null && _4 !== void 0 ? _4 : slideItemObj.options.hasCustomPrompt) !== null && _5 !== void 0 ? _5 : slideItemObj.options._phHasCustomPrompt;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const imgHasBarePh = slideItemObj.options.hasBarePh || slideItemObj.options._barePlaceholder;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const _rawCNvPicPrXml = slideItemObj.options._rawCNvPicPrXml;
                if (_rawCNvPicPrXml)
                    strSlideXml += '    ' + _rawCNvPicPrXml;
                else
                    strSlideXml += `    <p:cNvPicPr><a:picLocks${imgPhType ? ' noGrp="1"' : ''} noChangeAspect="1"/></p:cNvPicPr>`;
                let imgNvPrContent = '';
                if (imgPhType) {
                    imgNvPrContent = genXmlPlaceholderElement(imgPhType, imgPhIdx, imgPhSz, imgPhOrient, imgPhHasCustomPrompt);
                }
                else if (imgPhIdx !== undefined && imgPhIdx !== null) {
                    imgNvPrContent = genXmlPlaceholderElement('', imgPhIdx, imgPhSz, imgPhOrient, imgPhHasCustomPrompt);
                }
                else if (imgHasBarePh) {
                    imgNvPrContent = `<p:ph/>`;
                }
                else {
                    imgNvPrContent = genXmlPlaceholder(placeholderObj);
                }
                strSlideXml += '    <p:nvPr>' + imgNvPrContent + '</p:nvPr>';
                strSlideXml += '  </p:nvPicPr>';
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const _rawBlipFillAttrs = Object.prototype.hasOwnProperty.call(slideItemObj.options, '_rawBlipFillAttrs') ? slideItemObj.options._rawBlipFillAttrs : ' rotWithShape="1"';
                strSlideXml += `<p:blipFill${_rawBlipFillAttrs}>`;
                // NOTE: This works for both cases: either `path` or `data` contains the SVG
                if ((slide._relsMedia || []).filter(rel => rel.rId === slideItemObj.imageRid)[0] &&
                    (slide._relsMedia || []).filter(rel => rel.rId === slideItemObj.imageRid)[0].extn === 'svg') {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const _rawSvgBlipAttrs = slideItemObj.options._rawBlipAttrs || '';
                    strSlideXml += `<a:blip r:embed="rId${slideItemObj.imageRid - 1}"${_rawSvgBlipAttrs}>`;
                    strSlideXml += slideItemObj.options.transparency ? ` <a:alphaModFix amt="${Math.round((100 - slideItemObj.options.transparency) * 1000)}"/>` : '';
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const _rawSvgBlipInnerXml = slideItemObj.options._rawBlipInnerXml;
                    if (_rawSvgBlipInnerXml)
                        strSlideXml += _rawSvgBlipInnerXml;
                    strSlideXml += ' <a:extLst>';
                    strSlideXml += '  <a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">';
                    strSlideXml += `   <asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rId${slideItemObj.imageRid}"/>`;
                    strSlideXml += '  </a:ext>';
                    strSlideXml += ' </a:extLst>';
                    strSlideXml += '</a:blip>';
                }
                else {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const _rawBlipAttrs = slideItemObj.options._rawBlipAttrs || '';
                    strSlideXml += `<a:blip r:embed="rId${slideItemObj.imageRid}"${_rawBlipAttrs}>`;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const _rawBlipInnerXml = slideItemObj.options._rawBlipInnerXml;
                    if (_rawBlipInnerXml) {
                        strSlideXml += _rawBlipInnerXml;
                    }
                    else {
                        strSlideXml += slideItemObj.options.transparency ? `<a:alphaModFix amt="${Math.round((100 - slideItemObj.options.transparency) * 1000)}"/>` : '';
                        strSlideXml += createPictureAdjustmentXml(slideItemObj.options.imageAdjustments);
                    }
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const _rawBlipExtLstXml = slideItemObj.options._rawBlipExtLstXml;
                    if (_rawBlipExtLstXml)
                        strSlideXml += _rawBlipExtLstXml;
                    else
                        strSlideXml += createPictureEffectExtLst(slideItemObj.options.imageAdjustments, slideItemObj.artisticEffectRid || slideItemObj.imageRid);
                    strSlideXml += '</a:blip>';
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const _rawBlipTailXml = slideItemObj.options._rawBlipTailXml;
                if (_rawBlipTailXml) {
                    strSlideXml += _rawBlipTailXml;
                }
                else if (sizing === null || sizing === void 0 ? void 0 : sizing.type) {
                    const boxW = sizing.w ? getSmartParseNumber(sizing.w, 'X', slide._presLayout) : cx;
                    const boxH = sizing.h ? getSmartParseNumber(sizing.h, 'Y', slide._presLayout) : cy;
                    const boxX = getSmartParseNumber(sizing.x || 0, 'X', slide._presLayout);
                    const boxY = getSmartParseNumber(sizing.y || 0, 'Y', slide._presLayout);
                    // Semantic callers provide only the framing mode.  The Director may
                    // attach measured source dimensions so crop math uses the raster's
                    // aspect ratio rather than treating the target box as the source.
                    const imageSourceW = Number(slideItemObj.options._imageSourceW);
                    const imageSourceH = Number(slideItemObj.options._imageSourceH);
                    const sizingSource = Number.isFinite(imageSourceW) && imageSourceW > 0 && Number.isFinite(imageSourceH) && imageSourceH > 0
                        ? { w: imageSourceW, h: imageSourceH }
                        : { w: imgWidth, h: imgHeight };
                    const semanticSizing = Boolean(slideItemObj.options._semanticSizing);
                    const sizingType = semanticSizing && sizing.type === 'crop' ? 'cover' : sizing.type;
                    strSlideXml += ImageSizingXml[sizingType](sizingSource, { w: boxW, h: boxH, x: boxX, y: boxY });
                    imgWidth = boxW;
                    imgHeight = boxH;
                }
                else {
                    strSlideXml += '  <a:stretch><a:fillRect/></a:stretch>';
                }
                strSlideXml += '</p:blipFill>';
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const _rawPicSpPrXml = slideItemObj.options._rawPicSpPrXml;
                if (_rawPicSpPrXml) {
                    strSlideXml += _rawPicSpPrXml;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                }
                else if (slideItemObj.options._emptySpPr) {
                    strSlideXml += '<p:spPr/>';
                }
                else {
                    strSlideXml += '<p:spPr>';
                    strSlideXml += ' <a:xfrm' + locationAttr + '>';
                    strSlideXml += `  <a:off x="${x}" y="${y}"/>`;
                    strSlideXml += `  <a:ext cx="${imgWidth}" cy="${imgHeight}"/>`;
                    strSlideXml += ' </a:xfrm>';
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const _rawPicPrstGeomXml = slideItemObj.options._rawPicPrstGeomXml;
                    const pictureStyle = slideItemObj.options.pictureStyle;
                    if (pictureStyle === null || pictureStyle === void 0 ? void 0 : pictureStyle.geometry) {
                        strSlideXml += createPictureStyleGeometryXml(pictureStyle);
                    }
                    else if (_rawPicPrstGeomXml) {
                        strSlideXml += _rawPicPrstGeomXml;
                    }
                    else if (!slideItemObj.options._omitPicPrstGeom) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const _picPrstGeom = slideItemObj.options._picPrstGeom;
                        strSlideXml += ` <a:prstGeom prst="${_picPrstGeom || (rounding ? 'ellipse' : 'rect')}"><a:avLst/></a:prstGeom>`;
                    }
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const _imgRawFillXml = slideItemObj.options._rawFillXml;
                    if (pictureStyle === null || pictureStyle === void 0 ? void 0 : pictureStyle.fill) {
                        strSlideXml += createPictureStyleFillXml(pictureStyle);
                    }
                    else if (_imgRawFillXml) {
                        strSlideXml += _imgRawFillXml;
                    }
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const _imgRawLineXml = slideItemObj.options._rawLineXml;
                    if (pictureStyle === null || pictureStyle === void 0 ? void 0 : pictureStyle.line) {
                        strSlideXml += createPictureStyleLineXml(pictureStyle);
                    }
                    else if (_imgRawLineXml) {
                        strSlideXml += _imgRawLineXml;
                    }
                    else if (slideItemObj.options.line) {
                        const pictureLine = slideItemObj.options.line;
                        if (pictureLine.type === 'none') {
                            strSlideXml += '<a:ln><a:noFill/></a:ln>';
                        }
                        else {
                            const lineWidth = pictureLine.width ? valToPts(pictureLine.width) : valToPts(1);
                            strSlideXml += `<a:ln w="${lineWidth}" cap="flat" cmpd="sng" algn="ctr">`;
                            strSlideXml += pictureLine.color ? genXmlColorSelection(pictureLine) : '<a:noFill/>';
                            strSlideXml += `<a:prstDash val="${pictureLine.dashType || 'solid'}"/>`;
                            strSlideXml += '<a:miter lim="800000"/>';
                            strSlideXml += '</a:ln>';
                        }
                    }
                    // Picture Format > Picture Effects. PowerPoint stores these native
                    // controls in the picture p:spPr using the same a:effectLst model as
                    // shapes. Keep imported raw XML authoritative until a structured edit
                    // explicitly clears it in the MCP update path.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const _imgRawEffectLstXml = slideItemObj.options._rawEffectLstXml;
                    if (pictureStyle === null || pictureStyle === void 0 ? void 0 : pictureStyle.effects) {
                        strSlideXml += createPictureStyleEffectsXml(pictureStyle);
                    }
                    else if (_imgRawEffectLstXml) {
                        strSlideXml += _imgRawEffectLstXml;
                    }
                    else {
                        const hasGlow = hasGlowElement(slideItemObj.options.glow, { size: 8, color: '00FFFF', opacity: 0.75 });
                        if (slideItemObj.options.shadow || hasGlow || slideItemObj.options.reflection || slideItemObj.options.softEdges || slideItemObj.options.blur || slideItemObj.options.fillOverlay) {
                            strSlideXml += '<a:effectLst>';
                            if (slideItemObj.options.blur)
                                strSlideXml += createBlurXml(slideItemObj.options.blur);
                            if (slideItemObj.options.fillOverlay)
                                strSlideXml += createFillOverlayXml(slideItemObj.options.fillOverlay);
                            if (hasGlow)
                                strSlideXml += createGlowElement(slideItemObj.options.glow, { size: 8, color: '00FFFF', opacity: 0.75 });
                            if (slideItemObj.options.shadow && slideItemObj.options.shadow.type !== 'none')
                                strSlideXml += createInlineShadowXml(slideItemObj.options.shadow);
                            if (slideItemObj.options.reflection)
                                strSlideXml += createReflectionElement(slideItemObj.options.reflection);
                            if (slideItemObj.options.softEdges) {
                                const softEdgeSize = valToPts(slideItemObj.options.softEdges.size || 0);
                                if (softEdgeSize > 0)
                                    strSlideXml += `<a:softEdge rad="${softEdgeSize}"/>`;
                            }
                            strSlideXml += '</a:effectLst>';
                        }
                    }
                    // Native picture 3-D plus passthrough for imported picture 3-D.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const _imgRawSpPrScene3dXml = slideItemObj.options._rawSpPrScene3dXml;
                    if (pictureStyle === null || pictureStyle === void 0 ? void 0 : pictureStyle.threeD) {
                        strSlideXml += createPictureStyle3DXml(pictureStyle);
                    }
                    else if (slideItemObj.options.effect3D && !_imgRawSpPrScene3dXml) {
                        strSlideXml += create3DElements(slideItemObj.options.effect3D);
                    }
                    if (_imgRawSpPrScene3dXml && !(pictureStyle === null || pictureStyle === void 0 ? void 0 : pictureStyle.threeD)) {
                        strSlideXml += _imgRawSpPrScene3dXml;
                    }
                    // Narrow spPr extension passthrough used by exact native picture styles.
                    // Geometry remains engine-owned because the captured fragment excludes xfrm.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const _imgRawSpPrExtLstXml = slideItemObj.options._rawSpPrExtLstXml;
                    if (_imgRawSpPrExtLstXml) {
                        strSlideXml += _imgRawSpPrExtLstXml;
                    }
                    strSlideXml += '</p:spPr>';
                }
                strSlideXml += '</p:pic>';
                break;
            case SLIDE_OBJECT_TYPES.media:
                const mediaTransparencyXml = slideItemObj.options.transparency ? `<a:alphaModFix amt="${Math.round((100 - slideItemObj.options.transparency) * 1000)}"/>` : '';
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const mediaOptionsAny = slideItemObj.options;
                const mediaPhType = mediaOptionsAny.phType || mediaOptionsAny._phType || mediaOptionsAny._placeholderType;
                const mediaPhIdx = (_7 = (_6 = mediaOptionsAny.phIdx) !== null && _6 !== void 0 ? _6 : mediaOptionsAny._phIdx) !== null && _7 !== void 0 ? _7 : mediaOptionsAny._placeholderIdx;
                const mediaPhSz = mediaOptionsAny.phSz || mediaOptionsAny._phSz || mediaOptionsAny._placeholderSz;
                const mediaPhOrient = mediaOptionsAny.phOrient || mediaOptionsAny._phOrient || mediaOptionsAny._placeholderOrient;
                const mediaPhHasCustomPrompt = (_10 = (_9 = (_8 = mediaOptionsAny.phHasCustomPrompt) !== null && _8 !== void 0 ? _8 : mediaOptionsAny.hasCustomPrompt) !== null && _9 !== void 0 ? _9 : mediaOptionsAny._phHasCustomPrompt) !== null && _10 !== void 0 ? _10 : mediaOptionsAny._placeholderHasCustomPrompt;
                const mediaPlaceholderXml = mediaPhType
                    ? genXmlPlaceholderElement(mediaPhType, mediaPhIdx, mediaPhSz, mediaPhOrient, mediaPhHasCustomPrompt)
                    : mediaPhIdx !== undefined && mediaPhIdx !== null
                        ? genXmlPlaceholderElement('', mediaPhIdx, mediaPhSz, mediaPhOrient, mediaPhHasCustomPrompt)
                        : mediaOptionsAny.hasBarePh || mediaOptionsAny._barePlaceholder ? '<p:ph/>' : '';
                const mediaRawBlipFillAttrs = Object.prototype.hasOwnProperty.call(mediaOptionsAny, '_rawBlipFillAttrs') ? mediaOptionsAny._rawBlipFillAttrs : '';
                const mediaRawBlipAttrs = mediaOptionsAny._rawBlipAttrs || '';
                const mediaRawBlipInnerXml = mediaOptionsAny._rawBlipInnerXml || '';
                const mediaRawBlipExtLstXml = mediaOptionsAny._rawBlipExtLstXml || '';
                const mediaSizing = mediaOptionsAny.sizing;
                const mediaSourceW = Number(mediaOptionsAny._sizingSourceW);
                const mediaSourceH = Number(mediaOptionsAny._sizingSourceH);
                const mediaRawBlipTailXml = mediaOptionsAny._rawBlipTailXml || ((mediaSizing === null || mediaSizing === void 0 ? void 0 : mediaSizing.type) && Number.isFinite(mediaSourceW) && mediaSourceW > 0 && Number.isFinite(mediaSourceH) && mediaSourceH > 0
                    ? ImageSizingXml[mediaSizing.type]({ w: mediaSourceW, h: mediaSourceH }, { w: cx, h: cy, x: getSmartParseNumber(mediaSizing.x || 0, 'X', slide._presLayout), y: getSmartParseNumber(mediaSizing.y || 0, 'Y', slide._presLayout) })
                    : '<a:stretch><a:fillRect/></a:stretch>');
                const mediaIsNarrationXml = mediaOptionsAny.isNarration ? '<p:ext uri="{42D2F446-02D8-4167-A562-619A0277C38B}"><p15:isNarration xmlns:p15="http://schemas.microsoft.com/office/powerpoint/2012/main" val="1"/></p:ext>' : '';
                if (slideItemObj.mtype === 'online') {
                    strSlideXml += '<p:pic>';
                    strSlideXml += ' <p:nvPicPr>';
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const mediaOnlineShapeId = slideItemObj.options.spid || idx + 2;
                    const mediaOnlineCreationId = (slide._slideNum * 10000) + Number(mediaOnlineShapeId);
                    strSlideXml += genXmlCNvPr({ id: mediaOnlineShapeId, name: slideItemObj.options.objectName, creationId: mediaOnlineCreationId, options: mediaOptionsAny });
                    strSlideXml += mediaPhType ? ' <p:cNvPicPr><a:picLocks noGrp="1"/></p:cNvPicPr>' : ' <p:cNvPicPr/>';
                    strSlideXml += ' <p:nvPr>';
                    strSlideXml += mediaPlaceholderXml;
                    strSlideXml += `  <a:videoFile r:link="rId${slideItemObj.mediaRid}"/>`;
                    if (mediaIsNarrationXml)
                        strSlideXml += `  <p:extLst>${mediaIsNarrationXml}</p:extLst>`;
                    strSlideXml += ' </p:nvPr>';
                    strSlideXml += ' </p:nvPicPr>';
                    // NOTE: `blip` is diferent than videos; also there's no preview "p:extLst" above but exists in videos
                    strSlideXml += ` <p:blipFill${mediaRawBlipFillAttrs}><a:blip r:embed="rId${(_11 = slideItemObj.mediaCoverRid) !== null && _11 !== void 0 ? _11 : slideItemObj.mediaRid + 1}"${mediaRawBlipAttrs}>${mediaTransparencyXml}${mediaRawBlipInnerXml}${mediaRawBlipExtLstXml}</a:blip>${mediaRawBlipTailXml}</p:blipFill>`; // NOTE: Preview image is required!
                    strSlideXml += ' <p:spPr>';
                    strSlideXml += `  <a:xfrm${locationAttr}><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;
                    strSlideXml += `  <a:prstGeom prst="${mediaOptionsAny._picPrstGeom || (mediaOptionsAny.rounding ? 'ellipse' : 'rect')}"><a:avLst/></a:prstGeom>`;
                    strSlideXml += ' </p:spPr>';
                    strSlideXml += '</p:pic>';
                }
                else {
                    strSlideXml += '<p:pic>';
                    strSlideXml += ' <p:nvPicPr>';
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const mediaLocalShapeId = slideItemObj.options.spid || idx + 2;
                    const mediaLocalCreationId = (slide._slideNum * 10000) + Number(mediaLocalShapeId);
                    const mediaFileTag = slideItemObj.mtype === 'audio' ? 'audioFile' : 'videoFile';
                    strSlideXml += genXmlCNvPr({ id: mediaLocalShapeId, name: slideItemObj.options.objectName, creationId: mediaLocalCreationId, options: mediaOptionsAny, children: '<a:hlinkClick r:id="" action="ppaction://media"/>' });
                    strSlideXml += ` <p:cNvPicPr><a:picLocks${mediaPhType ? ' noGrp="1"' : ''} noChangeAspect="1"/></p:cNvPicPr>`;
                    strSlideXml += ' <p:nvPr>';
                    strSlideXml += mediaPlaceholderXml;
                    strSlideXml += `  <a:${mediaFileTag} r:link="rId${slideItemObj.mediaRid}"/>`;
                    strSlideXml += '  <p:extLst>';
                    strSlideXml += '   <p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}">';
                    const mediaCaptionTracks = Array.isArray(mediaOptionsAny.closedCaptionTracks) ? mediaOptionsAny.closedCaptionTracks : [];
                    if (mediaCaptionTracks.length) {
                        strSlideXml += `    <p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="rId${(_12 = slideItemObj.mediaCompanionRid) !== null && _12 !== void 0 ? _12 : slideItemObj.mediaRid + 1}">`;
                        strSlideXml += '     <p14:extLst>';
                        strSlideXml += '      <p:ext uri="{3AFAAA56-56D3-431D-BCD4-E75A35582382}">';
                        strSlideXml += '       <p173:tracksInfo xmlns:p173="http://schemas.microsoft.com/office/powerpoint/2017/3/main" displayLoc="slide">';
                        strSlideXml += '        <p173:trackLst>';
                        for (const track of mediaCaptionTracks) {
                            const trackId = String(track.id || '').trim();
                            const label = encodeXmlEntities(String(track.label || 'English'));
                            const lang = encodeXmlEntities(String(track.language || track.lang || ''));
                            strSlideXml += `<p173:track id="${encodeXmlEntities(trackId)}" label="${label}" lang="${lang}" r:embed="rId${track.rId}"/>`;
                        }
                        strSlideXml += '        </p173:trackLst>';
                        strSlideXml += '       </p173:tracksInfo>';
                        strSlideXml += '      </p:ext>';
                        strSlideXml += '     </p14:extLst>';
                        strSlideXml += '    </p14:media>';
                    }
                    else {
                        strSlideXml += `    <p14:media r:embed="rId${(_13 = slideItemObj.mediaCompanionRid) !== null && _13 !== void 0 ? _13 : slideItemObj.mediaRid + 1}"/>`;
                    }
                    strSlideXml += '   </p:ext>';
                    strSlideXml += mediaIsNarrationXml;
                    strSlideXml += '  </p:extLst>';
                    strSlideXml += ' </p:nvPr>';
                    strSlideXml += ' </p:nvPicPr>';
                    strSlideXml += ` <p:blipFill${mediaRawBlipFillAttrs}><a:blip r:embed="rId${(_14 = slideItemObj.mediaCoverRid) !== null && _14 !== void 0 ? _14 : slideItemObj.mediaRid + 2}"${mediaRawBlipAttrs}>${mediaTransparencyXml}${mediaRawBlipInnerXml}${mediaRawBlipExtLstXml}</a:blip>${mediaRawBlipTailXml}</p:blipFill>`; // NOTE: Preview image is required!
                    strSlideXml += ' <p:spPr>';
                    strSlideXml += `  <a:xfrm${locationAttr}><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;
                    strSlideXml += `  <a:prstGeom prst="${mediaOptionsAny._picPrstGeom || (mediaOptionsAny.rounding ? 'ellipse' : 'rect')}"><a:avLst/></a:prstGeom>`;
                    strSlideXml += ' </p:spPr>';
                    strSlideXml += '</p:pic>';
                }
                break;
            case SLIDE_OBJECT_TYPES.model3d:
                strSlideXml += genXmlModel3D(slideItemObj, idx, slide._slideNum);
                break;
            case SLIDE_OBJECT_TYPES.chart:
                // A few ChartEx families (currently Filled Map) have an editable
                // native object whose geographic renderer is not available in every
                // PowerPoint build.  The replay resolver supplies the exact source
                // fallback image; keep it in governed AlternateContent so the chart
                // remains the authoritative editable object while compatible clients
                // can display the proven visual fallback.
                const chartFallbackRid = Number(slideItemObj.options._rawChartFallbackImageRid);
                const hasChartFallback = Number.isFinite(chartFallbackRid) && chartFallbackRid > 0;
                if (hasChartFallback) {
                    strSlideXml += '<mc:AlternateContent>';
                    strSlideXml += '<mc:Choice xmlns:cx4="http://schemas.microsoft.com/office/drawing/2016/5/10/chartex" Requires="cx4">';
                }
                strSlideXml += '<p:graphicFrame>';
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const rawGraphicFrameNvXml = slideItemObj.options._rawGraphicFrameNvXml;
                if (rawGraphicFrameNvXml) {
                    strSlideXml += rawGraphicFrameNvXml;
                }
                else {
                    strSlideXml += ' <p:nvGraphicFramePr>';
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const chartCreationId = (slide._slideNum * 10000) + (idx + 2);
                    const chartShapeId = slideItemObj.options.spid || (idx + 2);
                    strSlideXml += `   ${genXmlCNvPr({ id: chartShapeId, name: slideItemObj.options.objectName, creationId: chartCreationId, options: slideItemObj.options })}`;
                    strSlideXml += '   <p:cNvGraphicFramePr/>';
                    strSlideXml += `   <p:nvPr>${genXmlPlaceholderForSlideObject(slideItemObj, placeholderObj)}</p:nvPr>`;
                    strSlideXml += ' </p:nvGraphicFramePr>';
                }
                strSlideXml += ` <p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></p:xfrm>`;
                strSlideXml += ' <a:graphic>';
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const rawChartAttrs = slideItemObj.options._rawChartAttrs;
                if (slideItemObj.options._chartEx) {
                    strSlideXml += '  <a:graphicData uri="http://schemas.microsoft.com/office/drawing/2014/chartex">';
                    strSlideXml += `   <cx:chart r:id="rId${slideItemObj.chartRid}" xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>`;
                }
                else {
                    strSlideXml += '  <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">';
                    if (rawChartAttrs)
                        strSlideXml += `   <c:chart ${rawChartAttrs} r:id="rId${slideItemObj.chartRid}"/>`;
                    else
                        strSlideXml += `   <c:chart r:id="rId${slideItemObj.chartRid}" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/>`;
                }
                strSlideXml += '  </a:graphicData>';
                strSlideXml += ' </a:graphic>';
                strSlideXml += '</p:graphicFrame>';
                if (hasChartFallback) {
                    strSlideXml += '</mc:Choice><mc:Fallback><p:pic>';
                    strSlideXml += '<p:nvPicPr>';
                    const fallbackShapeId = slideItemObj.options.spid || (idx + 2);
                    strSlideXml += `<p:cNvPr id="${fallbackShapeId}" name="${encodeXmlEntities(String(slideItemObj.options.objectName || 'Chart'))} visual fallback" descr="ChartEx visual fallback"/>`;
                    strSlideXml += '<p:cNvPicPr><a:picLocks noGrp="1" noRot="1" noChangeAspect="1" noMove="1" noResize="1" noEditPoints="1" noAdjustHandles="1" noChangeArrowheads="1" noChangeShapeType="1"/></p:cNvPicPr>';
                    strSlideXml += '<p:nvPr/></p:nvPicPr>';
                    strSlideXml += `<p:blipFill><a:blip r:embed="rId${chartFallbackRid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>`;
                    strSlideXml += `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>`;
                    strSlideXml += '</p:pic></mc:Fallback></mc:AlternateContent>';
                }
                break;
            case SLIDE_OBJECT_TYPES.passthrough:
                // Inject raw OOXML directly
                // This allows unsupported elements (tables, complex graphics, etc.) to be preserved as-is
                if (slideItemObj.passthrough && slideItemObj.passthrough.xml) {
                    strSlideXml += slideItemObj.passthrough.xml;
                }
                break;
            default:
                strSlideXml += '';
                break;
        }
    });
    if (groupChildren)
        return strSlideXml;
    // STEP 4: Add slide numbers (if any) last
    if (slide._slideNumberProps) {
        // Set some defaults (done here b/c SlideNumber canbe added to masters or slides and has numerous entry points)
        if (!slide._slideNumberProps.align)
            slide._slideNumberProps.align = 'left';
        strSlideXml += '<p:sp>';
        strSlideXml += ' <p:nvSpPr>';
        strSlideXml += '  <p:cNvPr id="25" name="Slide Number Placeholder 0"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>';
        strSlideXml += '  <p:nvPr><p:ph type="sldNum" sz="quarter" idx="4294967295"/></p:nvPr>';
        strSlideXml += ' </p:nvSpPr>';
        strSlideXml += ' <p:spPr>';
        strSlideXml += '<a:xfrm>' +
            `<a:off x="${getSmartParseNumber(slide._slideNumberProps.x, 'X', slide._presLayout)}" y="${getSmartParseNumber(slide._slideNumberProps.y, 'Y', slide._presLayout)}"/>` +
            `<a:ext cx="${slide._slideNumberProps.w ? getSmartParseNumber(slide._slideNumberProps.w, 'X', slide._presLayout) : '800000'}" cy="${slide._slideNumberProps.h ? getSmartParseNumber(slide._slideNumberProps.h, 'Y', slide._presLayout) : '300000'}"/>` +
            '</a:xfrm>' +
            ' <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
            ' <a:extLst><a:ext uri="{C572A759-6A51-4108-AA02-DFA0A04FC94B}"><ma14:wrappingTextBoxFlag val="0" xmlns:ma14="http://schemas.microsoft.com/office/mac/drawingml/2011/main"/></a:ext></a:extLst>' +
            '</p:spPr>';
        strSlideXml += '<p:txBody>';
        strSlideXml += '<a:bodyPr';
        if (slide._slideNumberProps.margin && Array.isArray(slide._slideNumberProps.margin)) {
            strSlideXml += ` lIns="${valToPts(slide._slideNumberProps.margin[3] || 0)}"`;
            strSlideXml += ` tIns="${valToPts(slide._slideNumberProps.margin[0] || 0)}"`;
            strSlideXml += ` rIns="${valToPts(slide._slideNumberProps.margin[1] || 0)}"`;
            strSlideXml += ` bIns="${valToPts(slide._slideNumberProps.margin[2] || 0)}"`;
        }
        else if (typeof slide._slideNumberProps.margin === 'number') {
            strSlideXml += ` lIns="${valToPts(slide._slideNumberProps.margin || 0)}"`;
            strSlideXml += ` tIns="${valToPts(slide._slideNumberProps.margin || 0)}"`;
            strSlideXml += ` rIns="${valToPts(slide._slideNumberProps.margin || 0)}"`;
            strSlideXml += ` bIns="${valToPts(slide._slideNumberProps.margin || 0)}"`;
        }
        if (slide._slideNumberProps.valign) {
            strSlideXml += ` anchor="${slide._slideNumberProps.valign.replace('top', 't').replace('middle', 'ctr').replace('bottom', 'b')}"`;
        }
        strSlideXml += '/>';
        strSlideXml += '  <a:lstStyle><a:lvl1pPr>';
        if (slide._slideNumberProps.fontFace || slide._slideNumberProps.fontSize || slide._slideNumberProps.color) {
            strSlideXml += `<a:defRPr sz="${Math.round((slide._slideNumberProps.fontSize || 12) * 100)}">`;
            if (slide._slideNumberProps.color)
                strSlideXml += genXmlColorSelection(slide._slideNumberProps.color);
            if (slide._slideNumberProps.fontFace) {
                strSlideXml += `<a:latin typeface="${slide._slideNumberProps.fontFace}"/><a:ea typeface="${slide._slideNumberProps.fontFace}"/><a:cs typeface="${slide._slideNumberProps.fontFace}"/>`;
            }
            strSlideXml += '</a:defRPr>';
        }
        strSlideXml += '</a:lvl1pPr></a:lstStyle>';
        strSlideXml += '<a:p>';
        if (slide._slideNumberProps.align.startsWith('l'))
            strSlideXml += '<a:pPr algn="l"/>';
        else if (slide._slideNumberProps.align.startsWith('c'))
            strSlideXml += '<a:pPr algn="ctr"/>';
        else if (slide._slideNumberProps.align.startsWith('r'))
            strSlideXml += '<a:pPr algn="r"/>';
        else
            strSlideXml += '<a:pPr algn="l"/>';
        strSlideXml += `<a:fld id="${SLDNUMFLDID}" type="slidenum"><a:rPr b="${slide._slideNumberProps.bold ? 1 : 0}" lang="en-US"/>`;
        strSlideXml += `<a:t>${slide._slideNum}</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p>`;
        strSlideXml += '</p:txBody></p:sp>';
    }
    // STEP 5: Close spTree and finalize slide XML
    strSlideXml += '</p:spTree>';
    strSlideXml += slide._rawControlsXml || '';
    strSlideXml += slide._rawCSldExtLstXml || '';
    strSlideXml += '</p:cSld>';
    // LAST: Return
    return strSlideXml;
}
/**
 * Transforms slide relations to XML string.
 * Extra relations that are not dynamic can be passed using the 2nd arg (e.g. theme relation in master file).
 * These relations use rId series that starts with 1-increased maximum of rIds used for dynamic relations.
 * @param {PresSlide | SlideLayout} slide - slide object whose relations are being transformed
 * @param {{ target: string; type: string }[]} defaultRels - array of default relations
 * @return {string} XML
 */
function slideObjectRelationsToXml(slide, defaultRels, options = {}) {
    let lastRid = 0; // stores maximum rId used for dynamic relations
    let strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + CRLF + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    const defaultsFirst = options.defaultsFirst === true;
    if (defaultsFirst) {
        defaultRels.forEach((rel, idx) => {
            lastRid = idx + 1;
            strXml += `<Relationship Id="rId${lastRid}" Type="${encodeXmlEntities(rel.type)}" Target="${encodeXmlEntities(rel.target)}"/>`;
        });
    }
    const rawRels = Array.isArray(slide._rawRels)
        ? slide._rawRels
        : [];
    rawRels.forEach(rel => {
        if (!(rel === null || rel === void 0 ? void 0 : rel.id) || !rel.type || !rel.target)
            return;
        const ridNum = rel.id.startsWith('rId') ? Number(rel.id.substring(3)) : Number(rel.id);
        if (Number.isFinite(ridNum))
            lastRid = Math.max(lastRid, ridNum);
        strXml += `<Relationship Id="${encodeXmlEntities(rel.id)}" Type="${encodeXmlEntities(rel.type)}" Target="${encodeXmlEntities(rel.target)}"${rel.targetMode ? ` TargetMode="${encodeXmlEntities(rel.targetMode)}"` : ''}/>`;
    });
    // STEP 1: Add all rels for this Slide
    slide._rels.forEach((rel) => {
        lastRid = Math.max(lastRid, rel.rId);
        const safeTarget = encodeXmlEntities(rel.Target);
        if (rel.type.toLowerCase().includes('hyperlink')) {
            if (rel.data === 'slide') {
                strXml += `<Relationship Id="rId${rel.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slide${rel.Target}.xml"/>`;
            }
            else {
                strXml += `<Relationship Id="rId${rel.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${safeTarget}" TargetMode="External"/>`;
            }
        }
        else if (rel.type.toLowerCase().includes('notesSlide')) {
            strXml += `<Relationship Id="rId${rel.rId}" Target="${safeTarget}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide"/>`;
        }
    });
    (slide._relsChart || []).forEach((rel) => {
        lastRid = Math.max(lastRid, rel.rId);
        const relType = rel.chartFamily === 'chartEx'
            ? 'http://schemas.microsoft.com/office/2014/relationships/chartEx'
            : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart';
        strXml += `<Relationship Id="rId${rel.rId}" Type="${relType}" Target="${encodeXmlEntities(rel.Target)}"/>`;
    });
    {
        const emittedMediaTargets = new Set();
        (slide._relsMedia || []).forEach((rel) => {
            const relRid = rel.rId.toString();
            const safeTarget = encodeXmlEntities(rel.Target);
            const duplicateTarget = emittedMediaTargets.has(rel.Target);
            lastRid = Math.max(lastRid, rel.rId);
            if (rel.isCaptionTrack || rel.type === 'text/vtt' || String(rel.extn || '').toLowerCase() === 'vtt') {
                strXml += `<Relationship Id="rId${relRid}" Type="http://schemas.microsoft.com/office/2017/04/relationships/track" Target="${safeTarget}"/>`;
            }
            else if (rel.isArtisticEffectWdp || String(rel.extn || '').toLowerCase() === 'wdp') {
                strXml += `<Relationship Id="rId${relRid}" Type="http://schemas.microsoft.com/office/2007/relationships/hdphoto" Target="${safeTarget}"/>`;
            }
            else if (rel.type === 'model/gltf.binary' || rel.type.toLowerCase().includes('gltf')) {
                // 3D model (GLB) file requires the model3d relationship type
                strXml += `<Relationship Id="rId${relRid}" Type="http://schemas.microsoft.com/office/2017/06/relationships/model3d" Target="${safeTarget}"/>`;
            }
            else if (rel.mediaRelationshipRole === 'online') {
                strXml += '<Relationship Id="rId' + relRid + '" Target="' + safeTarget + '" TargetMode="External" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video"/>';
            }
            else if (rel.type.toLowerCase().includes('image')) {
                strXml += '<Relationship Id="rId' + relRid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="' + safeTarget + '"/>';
            }
            else if (rel.type.toLowerCase().includes('audio')) {
                // As media has *TWO* rel entries per item, check for first one, if found add second rel with alt style
                if (rel.mediaRelationshipRole === 'companion' || (!rel.mediaRelationshipRole && duplicateTarget)) {
                    strXml += '<Relationship Id="rId' + relRid + '" Type="http://schemas.microsoft.com/office/2007/relationships/media" Target="' + safeTarget + '"/>';
                }
                else {
                    strXml += '<Relationship Id="rId' + relRid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio" Target="' + safeTarget + '"/>';
                }
            }
            else if (rel.type.toLowerCase().includes('video')) {
                // As media has *TWO* rel entries per item, check for first one, if found add second rel with alt style
                if (rel.mediaRelationshipRole === 'companion' || (!rel.mediaRelationshipRole && duplicateTarget)) {
                    strXml += '<Relationship Id="rId' + relRid + '" Type="http://schemas.microsoft.com/office/2007/relationships/media" Target="' + safeTarget + '"/>';
                }
                else {
                    strXml += '<Relationship Id="rId' + relRid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video" Target="' + safeTarget + '"/>';
                }
            }
            else if (rel.type.toLowerCase().includes('online')) {
                // As media has *TWO* rel entries per item, check for first one, if found add second rel with alt style
                if (duplicateTarget) {
                    strXml += '<Relationship Id="rId' + relRid + '" Type="http://schemas.microsoft.com/office/2007/relationships/image" Target="' + safeTarget + '"/>';
                }
                else {
                    strXml += '<Relationship Id="rId' + relRid + '" Target="' + safeTarget + '" TargetMode="External" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video"/>';
                }
            }
            emittedMediaTargets.add(rel.Target);
        });
    }
    // STEP 2: Add default rels. Master relationships use defaultsFirst so the
    // hard-coded r:id values in p:sldLayoutIdLst stay aligned when preserved
    // source relationships are appended after the generated layout/theme links.
    if (!defaultsFirst) {
        defaultRels.forEach((rel, idx) => {
            strXml += `<Relationship Id="rId${lastRid + idx + 1}" Type="${encodeXmlEntities(rel.type)}" Target="${encodeXmlEntities(rel.target)}"/>`;
        });
    }
    strXml += '</Relationships>';
    return strXml;
}
/**
 * Generate XML Paragraph Properties
 * @param {ISlideObject|TextProps} textObj - text object
 * @param {boolean} isDefault - array of default relations
 * @return {string} XML
 */
function genXmlParagraphProperties(textObj, isDefault) {
    var _a, _b, _c, _d, _e, _f;
    let strXmlBullet = '';
    let strXmlLnSpc = '';
    let strXmlParaSpc = '';
    let strXmlTabStops = '';
    const tag = isDefault ? 'a:lvl1pPr' : 'a:pPr';
    let bulletMarL = valToPts(DEF_BULLET_MARGIN);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textOptionsAny = textObj.options;
    const _rawPPrAttrs = textOptionsAny._rawPPrAttrs || '';
    const _pPrMarL = textOptionsAny._pPrMarL;
    const _pPrIndent = textOptionsAny._pPrIndent;
    const authoredIndent = textOptionsAny.indent;
    const authoredHanging = textOptionsAny.hanging;
    const hasAuthoredIndent = authoredIndent !== undefined && !isNaN(Number(authoredIndent));
    const hasAuthoredHanging = authoredHanging !== undefined && !isNaN(Number(authoredHanging));
    const hasPreservedParagraphMargins = _pPrMarL !== undefined || _pPrIndent !== undefined || hasAuthoredIndent || hasAuthoredHanging;
    const appendPreservedParagraphMargins = () => {
        if (_pPrIndent !== undefined)
            paragraphPropXml += ` indent="${_pPrIndent}"`;
        else if (hasAuthoredHanging)
            paragraphPropXml += ` indent="-${Math.round(Number(authoredHanging) * 12700)}"`;
        if (_pPrMarL !== undefined)
            paragraphPropXml += ` marL="${_pPrMarL}"`;
        else if (hasAuthoredIndent)
            paragraphPropXml += ` marL="${Math.round(Number(authoredIndent) * 12700)}"`;
    };
    const appendDefaultBulletMargins = () => {
        if (hasPreservedParagraphMargins)
            return;
        if (textObj.options._nativeMinimal)
            return;
        paragraphPropXml += ` marL="${textObj.options.indentLevel && textObj.options.indentLevel > 0 ? bulletMarL + bulletMarL * textObj.options.indentLevel : bulletMarL}" indent="-${bulletMarL}"`;
    };
    let paragraphPropXml = `<${tag}${textObj.options.rtlMode === true ? ' rtl="1" ' : textObj.options.rtlMode === false ? ' rtl="0" ' : ''}${_rawPPrAttrs ? ' ' + _rawPPrAttrs : ''}`;
    // A: Build paragraphProperties
    {
        // OPTION: align
        if (textObj.options.align) {
            switch (textObj.options.align) {
                case 'left':
                    paragraphPropXml += ' algn="l"';
                    break;
                case 'right':
                    paragraphPropXml += ' algn="r"';
                    break;
                case 'center':
                    paragraphPropXml += ' algn="ctr"';
                    break;
                case 'justify':
                    paragraphPropXml += ' algn="just"';
                    break;
                default:
                    paragraphPropXml += '';
                    break;
            }
        }
        appendPreservedParagraphMargins();
        if (textObj.options.lineSpacing) {
            strXmlLnSpc = `<a:lnSpc><a:spcPts val="${Math.round(textObj.options.lineSpacing * 100)}"/></a:lnSpc>`;
        }
        else if (textObj.options.lineSpacingMultiple) {
            strXmlLnSpc = `<a:lnSpc><a:spcPct val="${Math.round(textObj.options.lineSpacingMultiple * 100000)}"/></a:lnSpc>`;
        }
        // OPTION: indent
        if (textObj.options.indentLevel && !isNaN(Number(textObj.options.indentLevel)) && textObj.options.indentLevel > 0) {
            paragraphPropXml += ` lvl="${textObj.options.indentLevel}"`;
        }
        // OPTION: Paragraph Spacing: Before/After
        if (textObj.options.paraSpaceBefore !== undefined && !isNaN(Number(textObj.options.paraSpaceBefore))) {
            strXmlParaSpc += `<a:spcBef><a:spcPts val="${Math.round(textObj.options.paraSpaceBefore * 100)}"/></a:spcBef>`;
        }
        else if (textObj.options.paraSpaceBeforeMultiple !== undefined) {
            strXmlParaSpc += `<a:spcBef><a:spcPct val="${Math.round(textObj.options.paraSpaceBeforeMultiple * 100000)}"/></a:spcBef>`;
        }
        if (textObj.options.paraSpaceAfter !== undefined && !isNaN(Number(textObj.options.paraSpaceAfter))) {
            strXmlParaSpc += `<a:spcAft><a:spcPts val="${Math.round(textObj.options.paraSpaceAfter * 100)}"/></a:spcAft>`;
        }
        else if (textObj.options.paraSpaceAfterMultiple !== undefined) {
            strXmlParaSpc += `<a:spcAft><a:spcPct val="${Math.round(textObj.options.paraSpaceAfterMultiple * 100000)}"/></a:spcAft>`;
        }
        // OPTION: bullet
        // NOTE: OOXML uses the unicode character set for Bullets
        // EX: Unicode Character 'BULLET' (U+2022) ==> '<a:buChar char="&#x2022;"/>'
        if (typeof textObj.options.bullet === 'object' && textObj.options.bullet.none === true) {
            // bullet.none: true - emit style properties (buClr/buSzPts/buFont) followed by buNone
            // This matches native PPTX / Google Slides pattern where style props accompany buNone
            const b = textObj.options.bullet;
            const bulletColorXml = b._rawBuClrXml ? b._rawBuClrXml : (b.color ? `<a:buClr><a:srgbClr val="${b.color}"/></a:buClr>` : '');
            const bulletSzXml = b.fontSize ? `<a:buSzPts val="${Math.round(b.fontSize * 100)}"/>` : '';
            const bulletFontXml = b.font ? `<a:buFont typeface="${b.font}"/>` : '';
            strXmlBullet = bulletColorXml + bulletSzXml + bulletFontXml + '<a:buNone/>';
        }
        else if (typeof textObj.options.bullet === 'object') {
            if (((_b = (_a = textObj === null || textObj === void 0 ? void 0 : textObj.options) === null || _a === void 0 ? void 0 : _a.bullet) === null || _b === void 0 ? void 0 : _b.indent) && !hasAuthoredHanging)
                bulletMarL = valToPts(textObj.options.bullet.indent);
            if (textObj.options.bullet.type) {
                if (textObj.options.bullet.type.toString().toLowerCase() === 'number') {
                    appendDefaultBulletMargins();
                    const bulletStartAt = textObj.options.bullet.numberStartAt || textObj.options.bullet.startAt;
                    const bulletStartAtAttr = bulletStartAt ? ` startAt="${bulletStartAt}"` : (textObj.options._nativeMinimal ? '' : ' startAt="1"');
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const rawBulletSizePctXml = ((_c = textObj.options.bullet) === null || _c === void 0 ? void 0 : _c._rawBuSzPctXml) || '';
                    strXmlBullet = `${rawBulletSizePctXml || (textObj.options._nativeMinimal ? '' : '<a:buSzPct val="100000"/>')}<a:buFont typeface="+mj-lt"/><a:buAutoNum type="${textObj.options.bullet.style || 'arabicPeriod'}"${bulletStartAtAttr}/>`;
                }
            }
            else if (textObj.options.bullet.characterCode) {
                let bulletCode = `&#x${textObj.options.bullet.characterCode};`;
                // Check value for hex-ness (s/b 4 char hex)
                if (!/^[0-9A-Fa-f]{4}$/.test(textObj.options.bullet.characterCode)) {
                    console.warn('Warning: `bullet.characterCode should be a 4-digit unicode charatcer (ex: 22AB)`!');
                    bulletCode = BULLET_TYPES.DEFAULT;
                }
                appendDefaultBulletMargins();
                // Build bullet XML with optional color, font, size overrides
                // buClr expects the color element directly (NOT wrapped in solidFill)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const bulletColorXml = ((_d = textObj.options.bullet) === null || _d === void 0 ? void 0 : _d._rawBuClrXml) ? textObj.options.bullet._rawBuClrXml : (textObj.options.bullet.color ? `<a:buClr><a:srgbClr val="${textObj.options.bullet.color}"/></a:buClr>` : '');
                const bulletSzXml = textObj.options.bullet.fontSize ? `<a:buSzPts val="${Math.round(textObj.options.bullet.fontSize * 100)}"/>` : (((_e = textObj.options.bullet) === null || _e === void 0 ? void 0 : _e._rawBuSzPctXml) || (textObj.options._nativeMinimal ? '' : '<a:buSzPct val="100000"/>'));
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const _buFontAttrs = (_f = textObj.options.bullet) === null || _f === void 0 ? void 0 : _f._buFontAttrs;
                const bulletFontXml = textObj.options.bullet.font
                    ? (_buFontAttrs ? `<a:buFont typeface="${textObj.options.bullet.font}" ${_buFontAttrs}/>` : `<a:buFont typeface="${textObj.options.bullet.font}"/>`)
                    : '';
                strXmlBullet = bulletColorXml + bulletSzXml + bulletFontXml + '<a:buChar char="' + bulletCode + '"/>';
            }
            else if (textObj.options.bullet.code) {
                // @deprecated `bullet.code` v3.3.0
                let bulletCode = `&#x${textObj.options.bullet.code};`;
                // Check value for hex-ness (s/b 4 char hex)
                if (!/^[0-9A-Fa-f]{4}$/.test(textObj.options.bullet.code)) {
                    console.warn('Warning: `bullet.code should be a 4-digit hex code (ex: 22AB)`!');
                    bulletCode = BULLET_TYPES.DEFAULT;
                }
                appendDefaultBulletMargins();
                strXmlBullet = '<a:buSzPct val="100000"/><a:buChar char="' + bulletCode + '"/>';
            }
            else {
                appendDefaultBulletMargins();
                strXmlBullet = `<a:buSzPct val="100000"/><a:buChar char="${BULLET_TYPES.DEFAULT}"/>`;
            }
        }
        else if (textObj.options.bullet) {
            appendDefaultBulletMargins();
            strXmlBullet = `<a:buSzPct val="100000"/><a:buChar char="${BULLET_TYPES.DEFAULT}"/>`;
        }
        else if (!textObj.options.bullet) {
            // We only add this when the user explicitely asks for no bullet, otherwise, it can override the master defaults!
            // Skip buNone when _nativeMinimal is set (native PowerPoint files don't include this)
            // EXCEPTION: if bullet is explicitly set to false (not just undefined/falsy), always emit buNone
            const explicitBulletFalse = textObj.options.bullet === false;
            if (!textObj.options._nativeMinimal || explicitBulletFalse) {
                if (!hasPreservedParagraphMargins)
                    paragraphPropXml += ' indent="0" marL="0"'; // FIX: ISSUE#589 - specify zero indent and marL or default will be hanging paragraph
                strXmlBullet = '<a:buNone/>';
            }
        }
        // OPTION: tabStops
        if (textObj.options.tabStops && Array.isArray(textObj.options.tabStops)) {
            const tabStopsXml = textObj.options.tabStops.map(stop => { var _a; return `<a:tab pos="${inch2Emu((_a = stop.position) !== null && _a !== void 0 ? _a : 1)}" algn="${stop.alignment || 'l'}"/>`; }).join('');
            strXmlTabStops = `<a:tabLst>${tabStopsXml}</a:tabLst>`;
        }
        // B: Close Paragraph-Properties
        // IMPORTANT: strXmlLnSpc, strXmlParaSpc, and strXmlBullet require strict ordering - anything out of order is ignored. (PPT-Online, PPT for Mac)
        paragraphPropXml += '>' + strXmlLnSpc + strXmlParaSpc + strXmlBullet + strXmlTabStops;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const _rawPPrChildXml = textObj.options._rawPPrChildXml || '';
        if (_rawPPrChildXml)
            paragraphPropXml += _rawPPrChildXml;
        if (isDefault)
            paragraphPropXml += genXmlTextRunProperties(textObj.options, true);
        paragraphPropXml += '</' + tag + '>';
    }
    return paragraphPropXml;
}
function genXmlAuthoredTextFill(opts) {
    var _a, _b, _c;
    const fill = opts.textFill;
    if (fill == null)
        return '';
    return genXmlColorSelection(Object.assign(Object.assign({}, fill), { color: fill.color === null ? 'tx1' : ((_b = (_a = fill.color) !== null && _a !== void 0 ? _a : opts.color) !== null && _b !== void 0 ? _b : 'tx1'), transparency: fill.transparency === null ? undefined : ((_c = fill.transparency) !== null && _c !== void 0 ? _c : opts.transparency) }));
}
// Captured WordArt styles contain a complete run-properties fragment. Replace
// only its direct fill choice; preserve outline/effects/fonts and their order.
// Unedited native fragments remain byte-for-byte on the original fast path.
function replaceNativeRunFill(fragment, fillXml) {
    const ns = 'http://schemas.openxmlformats.org/drawingml/2006/main';
    const wrap = (xml) => `<root xmlns:a="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${xml}</root>`;
    const document = new DOMParser().parseFromString(wrap(fragment), 'application/xml');
    const root = document.documentElement;
    const fillNames = new Set(['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill']);
    for (const node of Array.from(root.childNodes)) {
        const element = node;
        if (node.nodeType === 1 && element.namespaceURI === ns && fillNames.has(element.localName))
            root.removeChild(node);
    }
    if (fillXml) {
        const fill = new DOMParser().parseFromString(wrap(fillXml), 'application/xml').documentElement.firstChild;
        const before = Array.from(root.childNodes).find(node => node.nodeType === 1 && !(node.namespaceURI === ns && node.localName === 'ln')) || null;
        root.insertBefore(document.importNode(fill, true), before);
    }
    const serializer = new XMLSerializer();
    return Array.from(root.childNodes).map(node => serializer.serializeToString(node)).join('');
}
/**
 * Generate XML Text Run Properties (`a:rPr`)
 * @param {ObjectOptions|TextPropsOptions} opts - text options
 * @param {boolean} isDefault - whether these are the default text run properties
 * @return {string} XML
 */
function genXmlTextRunProperties(opts, isDefault) {
    let runProps = '';
    const runPropsTag = isDefault ? 'a:defRPr' : 'a:rPr';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const optsAny = opts;
    const isNativeMinimal = !!optsAny._nativeMinimal;
    // BEGIN runProperties (ex: `<a:rPr lang="en-US" sz="1600" b="1" dirty="0">`)
    runProps += '<' + runPropsTag + ' lang="' + (opts.lang ? opts.lang : 'en-US') + '"';
    if (optsAny._rPrAltLang !== undefined)
        runProps += ` altLang="${optsAny._rPrAltLang}"`;
    else if (opts.lang && !isNativeMinimal)
        runProps += ' altLang="en-US"';
    runProps += opts.fontSize ? ` sz="${Math.round(opts.fontSize * 100)}"` : ''; // NOTE: Use round so sizes like '7.5' wont cause corrupt presentations
    // Preserve uncommon native rPr attrs verbatim when provided by decypher
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (optsAny._rawRprAttrs)
        runProps += optsAny._rawRprAttrs;
    // Exact native run properties outrank inherited text defaults. This avoids
    // duplicate attributes when a gallery tile explicitly carries b="0|1".
    if (optsAny._rPrB !== undefined) {
        if (optsAny._rPrB !== null)
            runProps += ` b="${optsAny._rPrB}"`;
    }
    else if ((opts === null || opts === void 0 ? void 0 : opts.bold) === true)
        runProps += ' b="1"';
    else if ((opts === null || opts === void 0 ? void 0 : opts.bold) === false)
        runProps += ' b="0"';
    // Emit i="1" when italic=true, i="0" when explicitly italic=false (PowerPoint sometimes sets this explicitly)
    if ((opts === null || opts === void 0 ? void 0 : opts.italic) === true)
        runProps += ' i="1"';
    else if ((opts === null || opts === void 0 ? void 0 : opts.italic) === false)
        runProps += ' i="0"';
    // Emit strike when set; strike=false emits noStrike (PowerPoint sometimes sets explicitly)
    if ((opts === null || opts === void 0 ? void 0 : opts.strike) === false)
        runProps += ' strike="noStrike"';
    else if (opts === null || opts === void 0 ? void 0 : opts.strike)
        runProps += ` strike="${typeof opts.strike === 'string' ? opts.strike : 'sngStrike'}"`;
    const rawRprAttrs = (opts._rawRprAttrs || '');
    const hasExplicitUnderlineAttr = /\su="[^"]*"/.test(rawRprAttrs);
    const underlineObject = opts.underline && typeof opts.underline === 'object' ? opts.underline : undefined;
    const underlineStyle = (underlineObject === null || underlineObject === void 0 ? void 0 : underlineObject.style) === 'dotDashHeave'
        ? 'dotDashHeavy'
        : underlineObject === null || underlineObject === void 0 ? void 0 : underlineObject.style;
    if (optsAny._rPrU !== undefined) {
        runProps += ` u="${optsAny._rPrU}"`;
    }
    else if (underlineStyle) {
        runProps += ` u="${underlineStyle}"`;
    }
    else if (typeof opts.underline === 'string') {
        // DEPRECATED: opts.underline is an object as of v3.5.0
        runProps += ` u="${String(opts.underline) === 'dotDashHeave' ? 'dotDashHeavy' : String(opts.underline)}"`;
    }
    else if (opts.hyperlink && !optsAny._suppressHyperlinkUnderline && !hasExplicitUnderlineAttr && !(opts._rawRprXml || opts._rawRprAttrs)) {
        runProps += ' u="sng"';
    }
    if (opts.baseline !== undefined && opts.baseline !== null) {
        // CT_Percentage uses thousandths of one percent. Keep this symmetric
        // with decypher readback, which divides the native value by 1000.
        runProps += ` baseline="${Math.round(opts.baseline * 1000)}"`;
    }
    else if (opts.subscript) {
        runProps += ' baseline="-40000"';
    }
    else if (opts.superscript) {
        runProps += ' baseline="30000"';
    }
    // Gallery-derived WordArt may carry native spc without a companion kern.
    // Preserve that exact value before considering the public charSpacing API.
    if (optsAny._rPrSpc !== undefined) {
        if (optsAny._rPrSpc !== null)
            runProps += ` spc="${optsAny._rPrSpc}"`;
    }
    else
        runProps += opts.charSpacing ? ` spc="${Math.round(opts.charSpacing * 100)}" kern="0"` : ''; // IMPORTANT: Also disable kerning; otherwise text won't actually expand
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((opts === null || opts === void 0 ? void 0 : opts.rtl) === true)
        runProps += ' rtl="1"';
    if (optsAny._rPrErr !== undefined)
        runProps += ` err="${optsAny._rPrErr}"`;
    if (optsAny._rPrDirty !== undefined)
        runProps += ` dirty="${optsAny._rPrDirty}"`;
    else if (!isNativeMinimal)
        runProps += ' dirty="0"';
    runProps += '>';
    // Color / Font / Highlight / Outline are children of <a:rPr>, so add them now before closing the runProperties tag
    if (optsAny._rawRprChildXmlExact) {
        runProps += opts.textFill !== undefined
            ? replaceNativeRunFill(optsAny._rawRprChildXmlExact, genXmlAuthoredTextFill(opts))
            : optsAny._rawRprChildXmlExact;
    }
    else if (opts.textFill !== undefined || opts.color || opts.fontFace || optsAny.fontFaceComplexScript || opts.outline || (opts.underline && typeof opts.underline === 'object' && opts.underline.color) || optsAny._rawRprXml || optsAny._rawRprEffectXmlExact) {
        if (opts.outline && typeof opts.outline === 'object') {
            runProps += `<a:ln w="${valToPts(opts.outline.size || 0.75)}">${genXmlColorSelection(opts.outline.color || 'FFFFFF')}</a:ln>`;
        }
        // For native decyphered shapes (_nativeMinimal), skip emitting default black (000000) text color
        // as it's inherited from the slide master/theme and would create spurious <a:solidFill> tags
        const _skipDefaultColor = opts._nativeMinimal && (opts.color === '000000' || opts.color === '000000'.toLowerCase());
        if (opts.textFill != null) {
            // One native glyph-fill choice, independent of the containing shape.
            // Reuse the shape gradient's typed DrawingML writer, never a picture.
            // Explicit leaf null resets to theme/default rather than stale aliases.
            runProps += genXmlAuthoredTextFill(opts);
        }
        else if (opts.textFill !== null && opts.color && !_skipDefaultColor) {
            runProps += genXmlColorSelection({ color: opts.color, transparency: opts.transparency });
        }
        const rawRprXml = optsAny._rawRprXml || '';
        const rawRprHasFontChildren = rawRprXml.includes('<a:ea') || rawRprXml.includes('<a:cs') || rawRprXml.includes('<a:sym');
        const rawRprHasNonFontChildren = rawRprXml.includes('<a:u') ||
            rawRprXml.includes('<a:ln') ||
            rawRprXml.includes('<a:effect') ||
            rawRprXml.includes('<a:hlink') ||
            rawRprXml.includes('<a:highlight');
        const emitLatinBeforeRawFonts = !!(opts.fontFace && rawRprHasFontChildren && !rawRprHasNonFontChildren);
        if (emitLatinBeforeRawFonts) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const _lattrA = opts._latinAttrs;
            runProps += _lattrA
                ? `<a:latin typeface="${opts.fontFace}" ${_lattrA}/>`
                : `<a:latin typeface="${opts.fontFace}"/>`;
        }
        // Inject raw rPr XML (e.g. <a:cs typeface="..."/> <a:sym typeface="..."/>) from decyphered shapes
        if (rawRprXml)
            runProps += opts.textFill !== undefined ? replaceNativeRunFill(rawRprXml, '') : rawRprXml;
        // Exact native Text Effects gallery payload. This narrow field contains
        // only one complete effectLst/effectDag and therefore composes with the
        // AI-selected text fill, outline, typeface, and typography above.
        if (optsAny._rawRprEffectXmlExact)
            runProps += optsAny._rawRprEffectXmlExact;
        // Text effects (shadow, glow, reflection) - combined in effectLst
        // NOTE: textShadow/textGlow/textReflection apply ONLY to text characters
        // NOTE: shadow/glow/reflection apply to shape (and glow/reflection also to text)
        // CT_TextCharacterProperties orders effectLst before highlight/underline,
        // and CT_EffectList orders glow before shadows before reflection. A raw
        // exact effect payload is authoritative and suppresses a duplicate typed
        // effect list.
        if (!optsAny._rawRprEffectXmlExact && (opts.textShadow || opts.textGlow || opts.glow || opts.textReflection || opts.reflection)) {
            runProps += '<a:effectLst>';
            if (opts.textGlow)
                runProps += createGlowElement(opts.textGlow, DEF_TEXT_GLOW);
            else if (opts.glow)
                runProps += createGlowElement(opts.glow, DEF_TEXT_GLOW);
            if (opts.textShadow)
                runProps += createShadowElement(opts.textShadow);
            if (opts.textReflection)
                runProps += createReflectionElement(opts.textReflection);
            else if (opts.reflection)
                runProps += createReflectionElement(opts.reflection);
            runProps += '</a:effectLst>';
        }
        if (opts.highlight)
            runProps += `<a:highlight>${createColorElement(opts.highlight)}</a:highlight>`;
        if (opts.underline && typeof opts.underline === 'object' && opts.underline.color)
            runProps += `<a:uFill>${genXmlColorSelection(opts.underline.color)}</a:uFill>`;
        if (opts.fontFace && !emitLatinBeforeRawFonts) {
            // NOTE: 'cs' = Complex Script, 'ea' = East Asian (use "-120" instead of "0" - per Issue #174); ea must come first (Issue #174)
            // Use _latinAttrs from decyphered shapes (panose/pitchFamily/charset extracted from source)
            // Otherwise use default pitchFamily/charset attributes
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const _lattrA = opts._latinAttrs;
            const _latStr = _lattrA
                ? `<a:latin typeface="${opts.fontFace}" ${_lattrA}/>`
                : `<a:latin typeface="${opts.fontFace}"/>`;
            // Only emit ea/cs when no _rawRprXml (otherwise cs/sym are already in _rawRprXml)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const _hasRawRpr = !!opts._rawRprXml;
            const _eacsStr = _hasRawRpr
                ? ''
                : `<a:ea typeface="${encodeXmlEntities(opts.fontFace)}" pitchFamily="34" charset="-122"/><a:cs typeface="${encodeXmlEntities(optsAny.fontFaceComplexScript || opts.fontFace)}" pitchFamily="34" charset="-120"/>`;
            runProps += _latStr + _eacsStr;
        }
        else if (optsAny.fontFaceComplexScript) {
            runProps += `<a:cs typeface="${encodeXmlEntities(optsAny.fontFaceComplexScript)}" pitchFamily="34" charset="-120"/>`;
        }
    }
    // Hyperlink support
    if (opts.hyperlink) {
        if (typeof opts.hyperlink !== 'object')
            throw new Error('ERROR: text `hyperlink` option should be an object. Ex: `hyperlink:{url:\'https://github.com\'}` ');
        else if (!opts.hyperlink.url && !opts.hyperlink.slide)
            throw new Error('ERROR: \'hyperlink requires either `url` or `slide`\'');
        else if (optsAny._preserveRawHlinkClick) {
            const rawHlinkAttrs = optsAny._rawHlinkClickAttrs || '';
            const rawHlinkChildXml = optsAny._rawHlinkClickChildXml || '';
            if (rawHlinkChildXml) {
                runProps += `<a:hlinkClick r:id="rId${opts.hyperlink._rId}"${rawHlinkAttrs}>${rawHlinkChildXml}</a:hlinkClick>`;
            }
            else {
                runProps += `<a:hlinkClick r:id="rId${opts.hyperlink._rId}"${rawHlinkAttrs}/>`;
            }
        }
        else if (opts.hyperlink.url) {
            // runProps += '<a:uFill>'+ genXmlColorSelection('0000FF') +'</a:uFill>'; // Breaks PPT2010! (Issue#74)
            runProps += `<a:hlinkClick r:id="rId${opts.hyperlink._rId}" invalidUrl="" action="" tgtFrame="${opts.hyperlink.target ? encodeXmlEntities(opts.hyperlink.target) : ''}" tooltip="${opts.hyperlink.tooltip ? encodeXmlEntities(opts.hyperlink.tooltip) : ''}" history="1" highlightClick="0" endSnd="0"${opts.color ? '>' : '/>'}`;
        }
        else if (opts.hyperlink.slide) {
            runProps += `<a:hlinkClick r:id="rId${opts.hyperlink._rId}" action="ppaction://hlinksldjump" tooltip="${opts.hyperlink.tooltip ? encodeXmlEntities(opts.hyperlink.tooltip) : ''}"${opts.color ? '>' : '/>'}`;
        }
        if (opts.color && !optsAny._preserveRawHlinkClick) {
            runProps += ' <a:extLst>';
            runProps += '  <a:ext uri="{A12FA001-AC4F-418D-AE19-62706E023703}">';
            runProps += '   <ahyp:hlinkClr xmlns:ahyp="http://schemas.microsoft.com/office/drawing/2018/hyperlinkcolor" val="tx"/>';
            runProps += '  </a:ext>';
            runProps += ' </a:extLst>';
            runProps += '</a:hlinkClick>';
        }
    }
    // END runProperties
    runProps += `</${runPropsTag}>`;
    return runProps;
}
/**
 * Build textBody text runs [`<a:r></a:r>`] for paragraphs [`<a:p>`]
 * @param {TextProps} textObj - Text object
 * @return {string} XML string
 */
function genXmlTextRun(textObj) {
    // NOTE: Dont create full rPr runProps for empty [lineBreak] runs
    // Why? The size of the lineBreak wont match (eg: below it will be 18px instead of the correct 36px)
    // Do this:
    /*
        <a:p>
            <a:pPr algn="r"/>
            <a:endParaRPr lang="en-US" sz="3600" dirty="0"/>
        </a:p>
    */
    // NOT this:
    /*
        <a:p>
            <a:pPr algn="r"/>
            <a:r>
                <a:rPr lang="en-US" sz="3600" dirty="0">
                    <a:solidFill>
                        <a:schemeClr val="accent5"/>
                    </a:solidFill>
                    <a:latin typeface="Times" pitchFamily="34" charset="0"/>
                    <a:ea typeface="Times" pitchFamily="34" charset="-122"/>
                    <a:cs typeface="Times" pitchFamily="34" charset="-120"/>
                </a:rPr>
                <a:t></a:t>
            </a:r>
            <a:endParaRPr lang="en-US" dirty="0"/>
        </a:p>
    */
    // Return paragraph with text run
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const optsAny = textObj.options;
    if (optsAny === null || optsAny === void 0 ? void 0 : optsAny.field) {
        const field = optsAny.field;
        if (!field.id || !field.type)
            throw new Error('ERROR: text field requires canonical `id` and `type` values');
        return `<a:fld id="${encodeXmlEntities(field.id)}" type="${encodeXmlEntities(field.type)}">${genXmlTextRunProperties(textObj.options, false)}<a:t>${encodeXmlEntities(textObj.text || '')}</a:t></a:fld>`;
    }
    if (textObj.text && (optsAny === null || optsAny === void 0 ? void 0 : optsAny._omitRPr))
        return `<a:r><a:t>${encodeXmlEntities(textObj.text)}</a:t></a:r>`;
    return textObj.text ? `<a:r>${genXmlTextRunProperties(textObj.options, false)}<a:t>${encodeXmlEntities(textObj.text)}</a:t></a:r>` : '';
}
/**
 * Builds `<a:bodyPr></a:bodyPr>` tag for "genXmlTextBody()"
 * @param {ISlideObject | TableCell} slideObject - various options
 * @return {string} XML string
 */
function genXmlBodyProperties(slideObject) {
    var _a, _b, _c, _d, _e, _f;
    let bodyProperties = '<a:bodyPr';
    if (slideObject && slideObject._type === SLIDE_OBJECT_TYPES.text && slideObject.options._bodyProp) {
        // PPT-2019 EX: <a:bodyPr wrap="square" lIns="1270" tIns="1270" rIns="1270" bIns="1270" rtlCol="0" anchor="ctr"/>
        // A: Enable or disable text wrapping only when explicitly needed.
        const bodyProp = slideObject.options._bodyProp;
        const isNativeMinimal = !!slideObject.options._nativeMinimal;
        if (bodyProp.wrap === false)
            bodyProperties += ' wrap="none"';
        else if (bodyProp.wrap)
            bodyProperties += ' wrap="square"';
        // B: Textbox margins [padding]. When decypher supplies explicit zero insets,
        // they are source XML, not invented defaults.
        if (bodyProp.lIns || bodyProp.lIns === 0)
            bodyProperties += ` lIns="${bodyProp.lIns}"`;
        if (bodyProp.tIns || bodyProp.tIns === 0)
            bodyProperties += ` tIns="${bodyProp.tIns}"`;
        if (bodyProp.rIns || bodyProp.rIns === 0)
            bodyProperties += ` rIns="${bodyProp.rIns}"`;
        if (bodyProp.bIns || bodyProp.bIns === 0)
            bodyProperties += ` bIns="${bodyProp.bIns}"`;
        // Extra passthrough attributes from decypher tool
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const _extraBodyPrAttr = slideObject.options._extraBodyPrAttr;
        if (_extraBodyPrAttr)
            bodyProperties += ` ${_extraBodyPrAttr}`;
        if (bodyProp.rtlCol !== undefined && !String(_extraBodyPrAttr || '').includes('rtlCol='))
            bodyProperties += ` rtlCol="${bodyProp.rtlCol}"`;
        else if (!isNativeMinimal)
            bodyProperties += ' rtlCol="0"';
        // D: Add anchorPoints
        if (slideObject.options._bodyProp.anchor)
            bodyProperties += ' anchor="' + slideObject.options._bodyProp.anchor + '"'; // VALS: [t,ctr,b]
        if (slideObject.options._bodyProp.vert && !String(_extraBodyPrAttr || '').includes('vert='))
            bodyProperties += ' vert="' + slideObject.options._bodyProp.vert + '"'; // VALS: [eaVert,horz,mongolianVert,vert,vert270,wordArtVert,wordArtVertRtl]
        // E: Close <a:bodyPr element
        bodyProperties += '>';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const _rawBodyPrChildXml = slideObject.options._rawBodyPrChildXml;
        if (!_rawBodyPrChildXml && slideObject.options.fit === 'resize' && ((_a = slideObject.options.wordArt) === null || _a === void 0 ? void 0 : _a.transform) && slideObject.options.text3D) {
            throw new Error('options.fit="resize" cannot be combined with both options.wordArt and options.text3D because PowerPoint renders that native carrier invisible; use fit="none" or fit="shrink".');
        }
        const hasRawAutofit = !!_rawBodyPrChildXml &&
            (_rawBodyPrChildXml.includes('<a:spAutoFit') ||
                _rawBodyPrChildXml.includes('<a:normAutofit') ||
                _rawBodyPrChildXml.includes('<a:noAutofit'));
        let autoFitXml = '';
        /**
         * F: Text Fit/AutoFit/Shrink option
         * @see: http://officeopenxml.com/drwSp-text-bodyPr-fit.php
         * @see: http://www.datypic.com/sc/ooxml/g-a_EG_TextAutofit.html
         */
        if (slideObject.options.fit && !hasRawAutofit) {
            // NOTE: Use of '<a:noAutofit/>' instead of '' causes issues in PPT-2013!
            // Exception: native shapes (_nativeMinimal=true) from decyphered PPTX files DO need <a:noAutofit/>
            // because the reference XML explicitly contains it and we must match it exactly.
            if (slideObject.options.fit === 'none')
                autoFitXml = slideObject.options._nativeMinimal ? '<a:noAutofit/>' : '';
            // NOTE: Shrink does not work automatically - PowerPoint calculates the `fontScale` value dynamically upon resize
            // else if (slideObject.options.fit === 'shrink') autoFitXml = '<a:normAutofit fontScale="85000" lnSpcReduction="20000"/>' // MS-PPT > Format shape > Text Options: "Shrink text on overflow"
            else if (slideObject.options.fit === 'shrink')
                autoFitXml = '<a:normAutofit/>';
            else if (slideObject.options.fit === 'resize')
                autoFitXml = '<a:spAutoFit/>';
        }
        //
        // DEPRECATED: below (@deprecated v3.3.0)
        if (!autoFitXml && slideObject.options.shrinkText && !hasRawAutofit)
            autoFitXml = '<a:normAutofit/>'; // MS-PPT > Format shape > Text Options: "Shrink text on overflow"
        /* DEPRECATED: below (@deprecated v3.3.0)
         * MS-PPT > Format shape > Text Options: "Resize shape to fit text" [spAutoFit]
         * NOTE: Use of '<a:noAutofit/>' in lieu of '' below causes issues in PPT-2013
         */
        if (!autoFitXml && slideObject.options._bodyProp.autoFit && !hasRawAutofit)
            autoFitXml = '<a:spAutoFit/>';
        // CT_TextBodyProperties requires prstTxWarp before the mutually exclusive
        // autofit choice, followed by scene3d and sp3d. Keeping these fragments
        // separate prevents WordArt + shrink/resize from producing schema-invalid
        // child order even though the XML remains well-formed.
        if ((_b = slideObject.options.wordArt) === null || _b === void 0 ? void 0 : _b.transform) {
            const transform = normalizeWordArtTransform(slideObject.options.wordArt.transform);
            const adjustments = normalizeWordArtAdjustments(transform, slideObject.options.wordArt.adjustments);
            bodyProperties += `<a:prstTxWarp prst="${transform}">`;
            bodyProperties += '<a:avLst>';
            if (adjustments.length)
                bodyProperties += `<a:gd name="adj" fmla="val ${adjustments[0]}"/>`;
            bodyProperties += '</a:avLst>';
            bodyProperties += '</a:prstTxWarp>';
        }
        bodyProperties += autoFitXml;
        // G: Add text-specific 3D effects (scene3d + sp3d inside bodyPr)
        // This is different from shape-level 3D - affects text characters directly.
        if (slideObject.options.text3D && !_rawBodyPrChildXml) {
            bodyProperties += createText3DElements(slideObject.options.text3D);
        }
        if (_rawBodyPrChildXml) {
            bodyProperties += _rawBodyPrChildXml;
        }
        // LAST: Close _bodyProp
        bodyProperties += '</a:bodyPr>';
    }
    else {
        // DEFAULT:
        bodyProperties += ' wrap="square" rtlCol="0">';
        // Add WordArt transform if specified (for non-text objects with wordArt)
        if ((_d = (_c = slideObject.options) === null || _c === void 0 ? void 0 : _c.wordArt) === null || _d === void 0 ? void 0 : _d.transform) {
            const wordArt = slideObject.options.wordArt;
            const transform = normalizeWordArtTransform(wordArt.transform);
            const adjustments = normalizeWordArtAdjustments(transform, wordArt.adjustments);
            bodyProperties += `<a:prstTxWarp prst="${transform}">`;
            bodyProperties += '<a:avLst>';
            if (adjustments.length)
                bodyProperties += `<a:gd name="adj" fmla="val ${adjustments[0]}"/>`;
            bodyProperties += '</a:avLst>';
            bodyProperties += '</a:prstTxWarp>';
        }
        // Add raw bodyPr child XML (scene3d/sp3d from decyphered shapes)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const _rawBodyPrChildXml2 = (_e = slideObject.options) === null || _e === void 0 ? void 0 : _e._rawBodyPrChildXml;
        // Add text-specific 3D effects for non-text objects
        if (((_f = slideObject.options) === null || _f === void 0 ? void 0 : _f.text3D) && !_rawBodyPrChildXml2) {
            bodyProperties += createText3DElements(slideObject.options.text3D);
        }
        if (_rawBodyPrChildXml2) {
            bodyProperties += _rawBodyPrChildXml2;
        }
        bodyProperties += '</a:bodyPr>';
    }
    // LAST: Return Close _bodyProp
    return slideObject._type === SLIDE_OBJECT_TYPES.tablecell ? '<a:bodyPr/>' : bodyProperties;
}
/**
 * Generate the XML for text and its options (bold, bullet, etc) including text runs (word-level formatting)
 * @param {ISlideObject|TableCell} slideObj - slideObj or tableCell
 * @note PPT text lines [lines followed by line-breaks] are created using <p>-aragraph's
 * @note Bullets are a paragragh-level formatting device
 * @template
 *    <p:txBody>
 *        <a:bodyPr wrap="square" rtlCol="0">
 *            <a:spAutoFit/>
 *        </a:bodyPr>
 *        <a:lstStyle/>
 *        <a:p>
 *            <a:pPr algn="ctr"/>
 *            <a:r>
 *                <a:rPr lang="en-US" dirty="0" err="1"/>
 *                <a:t>textbox text</a:t>
 *            </a:r>
 *            <a:endParaRPr lang="en-US" dirty="0"/>
 *        </a:p>
 *    </p:txBody>
 * @returns XML containing the param object's text and formatting
 */
export function genXmlTextBody(slideObj) {
    // Serialization must be referentially transparent. The grouping/inheritance
    // passes below annotate options while building XML; keep those annotations on
    // a write-local copy so a second write cannot observe invented run state.
    const opts = Object.assign({}, (slideObj.options || {}));
    let tmpTextObjects = [];
    const arrTextObjects = [];
    // FIRST: Shapes without text, etc. may be sent here during build, but have no text to render so return an empty string
    if (opts && slideObj._type !== SLIDE_OBJECT_TYPES.tablecell && (typeof slideObj.text === 'undefined' || slideObj.text === null))
        return '';
    // STEP 1: Start textBody
    let strSlideXml = slideObj._type === SLIDE_OBJECT_TYPES.tablecell ? '<a:txBody>' : '<p:txBody>';
    // STEP 2: Add bodyProperties
    {
        // A: 'bodyPr'
        strSlideXml += genXmlBodyProperties(slideObj);
        // B: 'lstStyle'
        // NOTE: shape type 'LINE' has different text align needs (a lstStyle.lvl1pPr between bodyPr and p)
        // FIXME: LINE horiz-align doesnt work (text is always to the left inside line) (FYI: the PPT code diff is substantial!)
        if (opts.h === 0 && opts.line && opts.align)
            strSlideXml += '<a:lstStyle><a:lvl1pPr algn="l"/></a:lstStyle>';
        else if (slideObj._type === 'placeholder')
            strSlideXml += `<a:lstStyle>${genXmlParagraphProperties(slideObj, true)}</a:lstStyle>`;
        else
            strSlideXml += '<a:lstStyle/>';
    }
    /* STEP 3: Modify slideObj.text to array
        CASES:
        addText( 'string' ) // string
        addText( 'line1\n line2' ) // string with lineBreak
        addText( {text:'word1'} ) // TextProps object
        addText( ['barry','allen'] ) // array of strings
        addText( [{text:'word1'}, {text:'word2'}] ) // TextProps object array
        addText( [{text:'line1\n line2'}, {text:'end word'}] ) // TextProps object array with lineBreak
    */
    if (typeof slideObj.text === 'string' || typeof slideObj.text === 'number') {
        // Handle cases 1,2
        tmpTextObjects.push({ text: slideObj.text.toString(), options: Object.assign({}, opts) });
    }
    else if (slideObj.text && !Array.isArray(slideObj.text) && typeof slideObj.text === 'object' && Object.keys(slideObj.text).includes('text')) {
        // } else if (!Array.isArray(slideObj.text) && slideObj.text!.hasOwnProperty('text')) { // 20210706: replaced with below as ts compiler rejected it
        // Handle case 3
        tmpTextObjects.push({ text: slideObj.text || '', options: Object.assign({}, (slideObj.options || {})) });
    }
    else if (Array.isArray(slideObj.text)) {
        // Handle cases 4,5,6
        // NOTE: use cast as text is TextProps[]|TableCell[] and their `options` dont overlap (they share the same TextBaseProps though)
        tmpTextObjects = slideObj.text.map(item => ({ text: item.text, options: Object.assign({}, (item.options || {})) }));
    }
    // STEP 4: Iterate over text objects, set text/options, break into pieces if '\n'/breakLine found
    tmpTextObjects.forEach((itext, idx) => {
        if (!itext.text)
            itext.text = '';
        // A: Set options
        itext.options = itext.options || opts || {};
        if (idx === 0 && itext.options && !itext.options.bullet && opts.bullet)
            itext.options.bullet = opts.bullet;
        // Propagate _nativeMinimal from parent shape options to each text item
        if (opts._nativeMinimal && itext.options !== opts)
            itext.options._nativeMinimal = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const preserveEmbeddedNewlines = !!itext.options._preserveEmbeddedNewlines;
        // B: Cast to text-object and fix line-breaks (if needed)
        if (typeof itext.text === 'string' || typeof itext.text === 'number') {
            // 1: Convert "\n" or any variation into CRLF unless native decypher fidelity needs
            // embedded <a:t> newlines to remain inside a single run.
            itext.text = preserveEmbeddedNewlines
                ? itext.text.toString().replace(/\r\n/g, '\n').replace(/\r/g, '\n')
                : itext.text.toString().replace(/\r*\n/g, CRLF);
        }
        // C: If text string has line-breaks, then create a separate text-object for each (much easier than dealing with split inside a loop below)
        // NOTE: Filter for trailing lineBreak prevents the creation of an empty textObj as the last item
        if (!preserveEmbeddedNewlines && itext.text.includes(CRLF) && itext.text.match(/\n$/g) === null) {
            itext.text.split(CRLF).forEach(line => {
                itext.options.breakLine = true;
                arrTextObjects.push({ text: line, options: itext.options });
            });
        }
        else {
            arrTextObjects.push(itext);
        }
    });
    // STEP 5: Group textObj into lines by checking for lineBreak, bullets, alignment change, etc.
    const arrLines = [];
    let arrTexts = [];
    arrTextObjects.forEach((textObj, idx) => {
        // A: Align or Bullet trigger new line
        if (arrTexts.length > 0 && (textObj.options.align || opts.align)) {
            // Only start a new paragraph when align *changes*
            if (textObj.options.align !== arrTextObjects[idx - 1].options.align) {
                arrLines.push(arrTexts);
                arrTexts = [];
            }
        }
        else if (arrTexts.length > 0 && textObj.options.bullet && arrTexts.length > 0) {
            arrLines.push(arrTexts);
            arrTexts = [];
            textObj.options.breakLine = false; // For cases with both `bullet` and `brekaLine` - prevent double lineBreak
        }
        // B: Add this text to current line
        arrTexts.push(textObj);
        // C: BreakLine begins new line **after** adding current text
        if (arrTexts.length > 0 && textObj.options.breakLine) {
            // Avoid starting a para right as loop is exhausted
            if (idx + 1 < arrTextObjects.length) {
                arrLines.push(arrTexts);
                arrTexts = [];
            }
        }
        // D: Flush buffer
        if (idx + 1 === arrTextObjects.length)
            arrLines.push(arrTexts);
    });
    // STEP 6: Loop over each line and create paragraph props, text run, etc.
    arrLines.forEach((line, lineIdx) => {
        var _a, _b;
        let reqsClosingFontSize = false;
        const isLastLine = lineIdx === arrLines.length - 1;
        // A: Start paragraph, add paraProps
        strSlideXml += '<a:p>';
        // Run-local paragraph direction outranks the parent text block. Explicit
        // false is authored state and must not be replaced by a true parent value.
        const _rtlMode0 = (_b = (_a = line[0].options) === null || _a === void 0 ? void 0 : _a.rtlMode) !== null && _b !== void 0 ? _b : opts.rtlMode;
        let paragraphPropXml = `<a:pPr ${_rtlMode0 === true ? ' rtl="1" ' : _rtlMode0 === false ? ' rtl="0" ' : ''}`;
        let closingFontSize = 0;
        // B: Start paragraph, loop over lines and add text runs
        line.forEach((textObj, idx) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
            // A: Set line index
            textObj.options._lineIdx = idx;
            // A.1: Add soft break. If the break-run carries raw rPr payload, emit full <a:br><a:rPr.../></a:br>.
            if ((idx > 0 && textObj.options.softBreakBefore) || textObj.options.standaloneBreakParagraph) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const brOptionsAny = textObj.options;
                const _rawBrRprXml = brOptionsAny._rawRprChildXmlExact || brOptionsAny._rawRprXml || '';
                const hasBrRpr = !!(_rawBrRprXml || textObj.options.lang || textObj.options.fontSize || brOptionsAny._rawRprAttrs || brOptionsAny._rPrAltLang !== undefined || brOptionsAny._rPrB !== undefined || brOptionsAny._rPrU !== undefined || brOptionsAny._rPrErr !== undefined || brOptionsAny._rPrDirty !== undefined);
                if (hasBrRpr) {
                    const _brLang = textObj.options.lang ? ` lang="${textObj.options.lang}"` : '';
                    const _brSz = textObj.options.fontSize ? ` sz="${Math.round(textObj.options.fontSize * 100)}"` : '';
                    const _rawBrRprAttrs = brOptionsAny._rawRprAttrs || '';
                    const _brAltLang = brOptionsAny._rPrAltLang !== undefined ? ` altLang="${brOptionsAny._rPrAltLang}"` : '';
                    const _brB = brOptionsAny._rPrB !== undefined ? ` b="${brOptionsAny._rPrB}"` : '';
                    const _brU = brOptionsAny._rPrU !== undefined ? ` u="${brOptionsAny._rPrU}"` : '';
                    const _brErr = brOptionsAny._rPrErr !== undefined ? ` err="${brOptionsAny._rPrErr}"` : '';
                    const _brDirty = brOptionsAny._rPrDirty !== undefined ? ` dirty="${brOptionsAny._rPrDirty}"` : (!brOptionsAny._nativeMinimal ? ' dirty="0"' : '');
                    const _brAttrs = `${_brLang}${_brAltLang}${_brSz}${_rawBrRprAttrs}${_brB}${_brU}${_brErr}${_brDirty}`;
                    strSlideXml += _rawBrRprXml ? `<a:br><a:rPr${_brAttrs}>${_rawBrRprXml}</a:rPr></a:br>` : `<a:br><a:rPr${_brAttrs}/></a:br>`;
                }
                else {
                    strSlideXml += '<a:br/>';
                }
            }
            // B: Inherit pPr-type options from parent shape's `options`
            textObj.options.align = (_a = textObj.options.align) !== null && _a !== void 0 ? _a : opts.align;
            textObj.options.lineSpacing = (_b = textObj.options.lineSpacing) !== null && _b !== void 0 ? _b : opts.lineSpacing;
            textObj.options.lineSpacingMultiple = (_c = textObj.options.lineSpacingMultiple) !== null && _c !== void 0 ? _c : opts.lineSpacingMultiple;
            textObj.options.indentLevel = (_d = textObj.options.indentLevel) !== null && _d !== void 0 ? _d : opts.indentLevel;
            textObj.options.indent = (_e = textObj.options.indent) !== null && _e !== void 0 ? _e : opts.indent;
            textObj.options.hanging = (_f = textObj.options.hanging) !== null && _f !== void 0 ? _f : opts.hanging;
            textObj.options.bullet = (_g = textObj.options.bullet) !== null && _g !== void 0 ? _g : opts.bullet;
            textObj.options.tabStops = (_h = textObj.options.tabStops) !== null && _h !== void 0 ? _h : opts.tabStops;
            textObj.options.strike = (_j = textObj.options.strike) !== null && _j !== void 0 ? _j : opts.strike;
            textObj.options.highlight = (_k = textObj.options.highlight) !== null && _k !== void 0 ? _k : opts.highlight;
            textObj.options.superscript = (_l = textObj.options.superscript) !== null && _l !== void 0 ? _l : opts.superscript;
            textObj.options.subscript = (_m = textObj.options.subscript) !== null && _m !== void 0 ? _m : opts.subscript;
            textObj.options.paraSpaceBefore = (_o = textObj.options.paraSpaceBefore) !== null && _o !== void 0 ? _o : opts.paraSpaceBefore;
            textObj.options.paraSpaceAfter = (_p = textObj.options.paraSpaceAfter) !== null && _p !== void 0 ? _p : opts.paraSpaceAfter;
            // Paragraph properties are only valid as the first child of a:p.
            if (idx === 0) {
                // Propagate _nativeMinimal before calling genXmlParagraphProperties (needed for buNone suppression)
                if (opts._nativeMinimal && !textObj.options._nativeMinimal)
                    textObj.options._nativeMinimal = true;
                paragraphPropXml = genXmlParagraphProperties(textObj, false);
                strSlideXml += paragraphPropXml.replace('<a:pPr></a:pPr>', ''); // IMPORTANT: Empty "pPr" blocks will generate needs-repair/corrupt msg
            }
            // C: Inherit any main options (color, fontSize, etc.)
            // NOTE: We only pass the text.options to genXmlTextRun (not the Slide.options),
            // so the run building function cant just fallback to Slide.color, therefore, we need to do that here before passing options below.
            // FILTER RULE: Hyperlinks should not inherit `color` from main options (let PPT default to local color, eg: blue on MacOS)
            Object.entries(opts).filter(([key]) => !(textObj.options.hyperlink && key === 'color')).forEach(([key, val]) => {
                // if (textObj.options.hyperlink && key === 'color') null
                // NOTE: This loop will pick up unecessary keys (`x`, etc.), but it doesnt hurt anything
                if (opts._nativeMinimal && key === 'fontSize')
                    return;
                // A top-level text-object hyperlink is emitted on p:cNvPr so the
                // whole text box is clickable. It must not also be inherited into
                // every a:rPr, which would create duplicate native carriers sharing
                // one relationship. Explicit run hyperlinks remain run-local.
                if (key === 'hyperlink')
                    return;
                // A run-local glyph-fill reset must not inherit a parent gradient.
                if (key === 'textFill' && textObj.options.textFill === null)
                    return;
                // null removes the local leaf and falls back; false, zero, and an
                // explicitly empty string are authored values and must win.
                if (key !== 'bullet' && (textObj.options[key] === undefined || textObj.options[key] === null))
                    textObj.options[key] = val;
            });
            // D: Add formatted textrun
            strSlideXml += genXmlTextRun(textObj);
            // E: Flag close fontSize for empty [lineBreak] elements
            if ((!textObj.text && opts.fontSize)) {
                reqsClosingFontSize = true;
                closingFontSize = Math.max(closingFontSize, opts.fontSize || 0);
            }
            else if (textObj.options.fontSize) {
                reqsClosingFontSize = true;
                opts.fontSize = opts.fontSize || textObj.options.fontSize;
                closingFontSize = Math.max(closingFontSize, textObj.options.fontSize);
            }
        });
        /* C: Append 'endParaRPr' (when needed) and close current open paragraph
         * NOTE: (ISSUE#20, ISSUE#193): Add 'endParaRPr' with font/size props or PPT default (Arial/18pt en-us) is used making row "too tall"/not honoring options
         */
        if (slideObj._type === SLIDE_OBJECT_TYPES.tablecell && (opts.fontSize || opts.fontFace)) {
            if (!opts._nativeMinimal || opts.color || isLastLine) {
                if (opts.fontFace) {
                    strSlideXml += `<a:endParaRPr lang="${opts.lang || 'en-US'}"` + (opts.fontSize ? ` sz="${Math.round(opts.fontSize * 100)}"` : '') + ' dirty="0">';
                    strSlideXml += `<a:latin typeface="${opts.fontFace}" charset="0"/>`;
                    strSlideXml += `<a:ea typeface="${opts.fontFace}" charset="0"/>`;
                    strSlideXml += `<a:cs typeface="${opts.fontFace}" charset="0"/>`;
                    strSlideXml += '</a:endParaRPr>';
                }
                else {
                    strSlideXml += `<a:endParaRPr lang="${opts.lang || 'en-US'}"` + (opts.fontSize ? ` sz="${Math.round(opts.fontSize * 100)}"` : '') + ' dirty="0"/>';
                }
            }
        }
        else if (line.length > 0 && ((line[line.length - 1].options._rawEndParaRprXml) || (line[line.length - 1].options._forceEndParaRpr))) {
            // Passthrough: emit endParaRPr with preserved attrs and optional raw child XML
            const endParaOptionsAny = line[line.length - 1].options;
            const _rawEndParaRprXml = endParaOptionsAny._rawEndParaRprXml || '';
            const _rawEndParaRprAttrs = endParaOptionsAny._rawEndParaRprAttrs;
            const hasRawEndParaRprAttrs = Object.prototype.hasOwnProperty.call(endParaOptionsAny, '_rawEndParaRprAttrs');
            const _endParaLang = endParaOptionsAny._endParaLang;
            const _endParaLangAttr = _endParaLang ? ` lang="${_endParaLang}"` : '';
            const _endParaFontSize = endParaOptionsAny._endParaFontSize;
            const _endParaSz = _endParaFontSize ? ` sz="${Math.round(_endParaFontSize * 100)}"` : (opts.fontSize ? ` sz="${Math.round(opts.fontSize * 100)}"` : '');
            const _endParaAttrs = hasRawEndParaRprAttrs ? _rawEndParaRprAttrs : `${_endParaLangAttr}${_endParaSz} dirty="0"`;
            if (_rawEndParaRprXml) {
                strSlideXml += `<a:endParaRPr${_endParaAttrs}>${_rawEndParaRprXml}</a:endParaRPr>`;
            }
            else {
                strSlideXml += `<a:endParaRPr${_endParaAttrs}/>`;
            }
        }
        else if (reqsClosingFontSize && !opts._nativeMinimal) {
            // Empty [lineBreak] lines should not contain runProp, however, they need to specify fontSize in `endParaRPr`
            strSlideXml += `<a:endParaRPr lang="${opts.lang || 'en-US'}"` + (opts.fontSize ? ` sz="${Math.round(opts.fontSize * 100)}"` : '') + ' dirty="0"/>';
        }
        else if (!opts._nativeMinimal || (opts.color && opts.color !== '000000')) {
            // Skip plain endParaRPr for native decyphered shapes unless it is carrying explicit visual state.
            // This avoids inventing default endParaRPr nodes that are absent in the reference PPTX.
            strSlideXml += `<a:endParaRPr lang="${opts.lang || 'en-US'}" dirty="0"/>`; // Added 20180101 to address PPT-2007 issues
        }
        // D: End paragraph
        strSlideXml += '</a:p>';
    });
    // IMPORTANT: An empty txBody will cause "needs repair" error! Add <p> content if missing.
    // [FIXED in v3.13.0]: This fixes issue with table auto-paging where some cells w/b empty on subsequent pages.
    /*
        <a:txBody>
            <a:bodyPr/>
            <a:lstStyle/>
        </a:txBody>
    */
    if (strSlideXml.indexOf('<a:p>') === -1) {
        strSlideXml += '<a:p><a:endParaRPr/></a:p>';
    }
    // STEP 7: Close the textBody
    strSlideXml += slideObj._type === SLIDE_OBJECT_TYPES.tablecell ? '</a:txBody>' : '</p:txBody>';
    // LAST: Return XML
    return strSlideXml;
}
/**
 * Generate an XML Placeholder
 * @param {ISlideObject} placeholderObj
 * @returns XML
 */
function genXmlPlaceholderForSlideObject(slideItemObj, placeholderObj) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const options = ((slideItemObj === null || slideItemObj === void 0 ? void 0 : slideItemObj.options) || {});
    const type = (_b = (_a = options.phType) !== null && _a !== void 0 ? _a : options._phType) !== null && _b !== void 0 ? _b : options._placeholderType;
    const idx = (_d = (_c = options.phIdx) !== null && _c !== void 0 ? _c : options._phIdx) !== null && _d !== void 0 ? _d : options._placeholderIdx;
    const size = (_f = (_e = options.phSz) !== null && _e !== void 0 ? _e : options._phSz) !== null && _f !== void 0 ? _f : options._placeholderSz;
    const orient = (_h = (_g = options.phOrient) !== null && _g !== void 0 ? _g : options._phOrient) !== null && _h !== void 0 ? _h : options._placeholderOrient;
    const customPrompt = (_l = (_k = (_j = options.phHasCustomPrompt) !== null && _j !== void 0 ? _j : options.hasCustomPrompt) !== null && _k !== void 0 ? _k : options._phHasCustomPrompt) !== null && _l !== void 0 ? _l : options._placeholderHasCustomPrompt;
    if (type !== undefined && type !== null && type !== '')
        return genXmlPlaceholderElement(type, idx, size, orient, customPrompt);
    if (idx !== undefined && idx !== null)
        return genXmlPlaceholderElement('', idx, size, orient, customPrompt);
    if (options.hasBarePh || options._barePlaceholder)
        return '<p:ph/>';
    return genXmlPlaceholder(placeholderObj);
}
export function genXmlPlaceholder(placeholderObj) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    if (!placeholderObj)
        return '';
    const authoredPlaceholderIdx = (_a = placeholderObj.options) === null || _a === void 0 ? void 0 : _a._placeholderIdx;
    const placeholderIdx = authoredPlaceholderIdx !== undefined && authoredPlaceholderIdx !== null ? authoredPlaceholderIdx : '';
    const placeholderTyp = ((_b = placeholderObj.options) === null || _b === void 0 ? void 0 : _b._placeholderType) ? placeholderObj.options._placeholderType : '';
    const placeholderType = placeholderTyp ? String(PLACEHOLDER_TYPES[placeholderTyp] || placeholderTyp) : '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const placeholderSz = ((_c = placeholderObj.options) === null || _c === void 0 ? void 0 : _c._placeholderSz) || ((_d = placeholderObj.options) === null || _d === void 0 ? void 0 : _d.phSz) || '';
    const placeholderOrient = ((_e = placeholderObj.options) === null || _e === void 0 ? void 0 : _e._placeholderOrient) || ((_f = placeholderObj.options) === null || _f === void 0 ? void 0 : _f.phOrient) || ((_g = placeholderObj.options) === null || _g === void 0 ? void 0 : _g.orient) || '';
    const placeholderText = (placeholderObj.text || []).map(textRun => (textRun === null || textRun === void 0 ? void 0 : textRun.text) || '').join('');
    const explicitCustomPrompt = (_l = (_j = (_h = placeholderObj.options) === null || _h === void 0 ? void 0 : _h._placeholderHasCustomPrompt) !== null && _j !== void 0 ? _j : (_k = placeholderObj.options) === null || _k === void 0 ? void 0 : _k.hasCustomPrompt) !== null && _l !== void 0 ? _l : (_m = placeholderObj.options) === null || _m === void 0 ? void 0 : _m.customPrompt;
    const hasCustomPrompt = explicitCustomPrompt !== undefined && explicitCustomPrompt !== null
        ? Boolean(explicitCustomPrompt)
        : placeholderText.length > 0;
    return genXmlPlaceholderElement(placeholderType, placeholderIdx, placeholderSz, placeholderOrient, hasCustomPrompt);
}
function genXmlPlaceholderElement(type, idx, size, orient, hasCustomPrompt) {
    const placeholderType = type == null ? '' : String(type);
    const placeholderIdx = idx == null || idx === '' || Number(idx) === 0 ? '' : String(idx);
    const placeholderSize = size == null ? '' : String(size);
    // PowerPoint treats clipArt orientation as non-applicable and removes it on
    // save. Horizontal is the schema default for applicable placeholder types.
    const placeholderOrient = orient == null || String(orient) === 'horz' || placeholderType === 'clipArt' ? '' : String(orient);
    return `<p:ph${placeholderType ? ` type="${encodeXmlEntities(placeholderType)}"` : ''}${placeholderSize ? ` sz="${encodeXmlEntities(placeholderSize)}"` : ''}${placeholderOrient ? ` orient="${encodeXmlEntities(placeholderOrient)}"` : ''}${hasCustomPrompt === true ? ' hasCustomPrompt="1"' : ''}${placeholderIdx ? ` idx="${encodeXmlEntities(placeholderIdx)}"` : ''}/>`;
}
// XML-GEN: First 6 functions create the base /ppt files
/**
 * Generate XML ContentType
 * @param {PresSlide[]} slides - slides
 * @param {SlideLayout[]} slideLayouts - slide layouts
 * @param {PresSlide} masterSlide - master slide
 * @returns XML
 */
export function makeXmlContTypes(slides, slideLayouts, masterSlides, rawPackageParts, rawPresentationContentType) {
    const physicalMasters = Array.isArray(masterSlides) ? masterSlides : masterSlides ? [masterSlides] : [];
    let strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + CRLF;
    strXml += '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">';
    strXml += '<Default Extension="xml" ContentType="application/xml"/>';
    strXml += '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>';
    // STEP 1: Collect all media types actually used in Presentation
    const usedExtensions = new Set();
    const allMedia = [];
    // Gather media from all slides
    slides.forEach(slide => {
        (slide._relsMedia || []).forEach(rel => {
            if (rel.extn && rel.type) {
                allMedia.push({ extn: rel.extn, type: rel.type });
                usedExtensions.add(rel.extn.toLowerCase());
            }
        });
    });
    // Gather media from master slide
    physicalMasters.forEach(masterSlide => {
        ;
        ((masterSlide === null || masterSlide === void 0 ? void 0 : masterSlide._relsMedia) || []).forEach(rel => {
            if (rel.extn && rel.type) {
                allMedia.push({ extn: rel.extn, type: rel.type });
                usedExtensions.add(rel.extn.toLowerCase());
            }
        });
    });
    (rawPackageParts || []).forEach(part => {
        const partPath = (part === null || part === void 0 ? void 0 : part.path) || '';
        const fileName = partPath.split('/').pop() || '';
        const dotIdx = fileName.lastIndexOf('.');
        if (dotIdx > -1)
            usedExtensions.add(fileName.substring(dotIdx + 1).toLowerCase());
    });
    // Only add media type declarations for extensions actually used
    if (usedExtensions.has('jpeg') || usedExtensions.has('jpg')) {
        strXml += '<Default Extension="jpeg" ContentType="image/jpeg"/>';
        strXml += '<Default Extension="jpg" ContentType="image/jpeg"/>';
    }
    if (usedExtensions.has('png')) {
        strXml += '<Default Extension="png" ContentType="image/png"/>';
    }
    if (usedExtensions.has('gif')) {
        strXml += '<Default Extension="gif" ContentType="image/gif"/>';
    }
    if (usedExtensions.has('svg')) {
        strXml += '<Default Extension="svg" ContentType="image/svg+xml"/>';
    }
    if (usedExtensions.has('m4v')) {
        strXml += '<Default Extension="m4v" ContentType="video/mp4"/>';
    }
    if (usedExtensions.has('m4a')) {
        strXml += '<Default Extension="m4a" ContentType="audio/mp4"/>';
    }
    if (usedExtensions.has('mp4')) {
        strXml += '<Default Extension="mp4" ContentType="video/mp4"/>';
    }
    if (usedExtensions.has('glb')) {
        strXml += '<Default Extension="glb" ContentType="model/gltf.binary"/>';
    }
    if (usedExtensions.has('fntdata')) {
        strXml += '<Default Extension="fntdata" ContentType="application/x-fontdata"/>';
    }
    ;
    (rawPackageParts || []).forEach(part => {
        const partPath = (part === null || part === void 0 ? void 0 : part.path) || '';
        const fileName = partPath.split('/').pop() || '';
        const dotIdx = fileName.lastIndexOf('.');
        const ext = dotIdx > -1 ? fileName.substring(dotIdx + 1).toLowerCase() : '';
        if (!ext || !(part === null || part === void 0 ? void 0 : part.defaultContentType))
            return;
        if (!strXml.includes(`Extension="${ext}"`)) {
            strXml += `<Default Extension="${encodeXmlEntities(ext)}" ContentType="${encodeXmlEntities(part.defaultContentType)}"/>`;
        }
    });
    // Check if any charts exist (charts require xlsx for embedded Excel data)
    const hasCharts = slides.some(slide => slide._relsChart && slide._relsChart.length > 0) ||
        slideLayouts.some(layout => layout._relsChart && layout._relsChart.length > 0) ||
        physicalMasters.some(masterSlide => (masterSlide === null || masterSlide === void 0 ? void 0 : masterSlide._relsChart) && masterSlide._relsChart.length > 0);
    if (hasCharts && !strXml.includes('Extension="xlsx"')) {
        strXml += '<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>';
    }
    // Add any other custom media types
    allMedia.forEach(rel => {
        if (rel.type !== 'image' && rel.type !== 'online' && rel.type !== 'chart' && !strXml.includes(`Extension="${encodeXmlEntities(rel.extn)}"`)) {
            strXml += '<Default Extension="' + encodeXmlEntities(rel.extn) + '" ContentType="' + encodeXmlEntities(rel.type) + '"/>';
        }
    });
    const overridePartNames = new Set();
    const addContentTypeOverride = (partName, contentType) => {
        if (!partName || !contentType)
            return;
        const normalizedPartName = partName.startsWith('/') ? partName : `/${partName}`;
        if (overridePartNames.has(normalizedPartName))
            return;
        overridePartNames.add(normalizedPartName);
        strXml += `<Override PartName="${encodeXmlEntities(normalizedPartName)}" ContentType="${encodeXmlEntities(contentType)}"/>`;
    };
    // STEP 2: Add presentation and slide master(s)/slide(s)
    strXml += `<Override PartName="/ppt/presentation.xml" ContentType="${encodeXmlEntities(rawPresentationContentType || 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml')}"/>`;
    overridePartNames.add('/ppt/presentation.xml');
    strXml += '<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>';
    overridePartNames.add('/ppt/notesMasters/notesMaster1.xml');
    (physicalMasters.length ? physicalMasters : [null]).forEach((_master, idx) => {
        addContentTypeOverride(`/ppt/slideMasters/slideMaster${idx + 1}.xml`, 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml');
    });
    // Add each slide
    slides.forEach((slide, idx) => {
        addContentTypeOverride(`/ppt/slides/slide${idx + 1}.xml`, 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml');
        // Add charts if any
        slide._relsChart.forEach(rel => {
            const chartPartName = rel.Target.startsWith('../charts/') ? `/ppt/charts/${rel.Target.substring('../charts/'.length)}` : rel.Target;
            const chartContentType = rel.chartFamily === 'chartEx'
                ? 'application/vnd.ms-office.chartex+xml'
                : 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml';
            addContentTypeOverride(chartPartName, chartContentType);
            const rawOpts = rel.opts;
            const chartStyleName = rawOpts._rawChartStyleName || (rel.chartFamily === 'chartEx' ? `style${rel.globalId}.xml` : null);
            const chartColorsName = rawOpts._rawChartColorsName || (rel.chartFamily === 'chartEx' ? `colors${rel.globalId}.xml` : null);
            if (chartStyleName)
                addContentTypeOverride(`/ppt/charts/${chartStyleName}`, 'application/vnd.ms-office.chartstyle+xml');
            if (chartColorsName)
                addContentTypeOverride(`/ppt/charts/${chartColorsName}`, 'application/vnd.ms-office.chartcolorstyle+xml');
        });
    });
    // STEP 3: Core PPT
    addContentTypeOverride('/ppt/presProps.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presProps+xml');
    addContentTypeOverride('/ppt/viewProps.xml', 'application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml');
    (physicalMasters.length ? physicalMasters : [null]).forEach((_master, idx) => {
        addContentTypeOverride(`/ppt/theme/theme${idx + 1}.xml`, 'application/vnd.openxmlformats-officedocument.theme+xml');
    });
    addContentTypeOverride('/ppt/tableStyles.xml', 'application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml');
    // STEP 4: Add Slide Layouts
    slideLayouts.forEach((layout, idx) => {
        addContentTypeOverride(`/ppt/slideLayouts/slideLayout${idx + 1}.xml`, 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml');
        (layout._relsChart || []).forEach(rel => {
            const chartPartName = rel.Target.startsWith('../charts/') ? `/ppt/charts/${rel.Target.substring('../charts/'.length)}` : rel.Target;
            const chartContentType = rel.chartFamily === 'chartEx' ? 'application/vnd.ms-office.chartex+xml' : 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml';
            addContentTypeOverride(chartPartName, chartContentType);
            const rawOpts = rel.opts;
            const chartStyleName = rawOpts._rawChartStyleName || (rel.chartFamily === 'chartEx' ? `style${rel.globalId}.xml` : null);
            const chartColorsName = rawOpts._rawChartColorsName || (rel.chartFamily === 'chartEx' ? `colors${rel.globalId}.xml` : null);
            if (chartStyleName)
                addContentTypeOverride('/ppt/charts/' + chartStyleName, 'application/vnd.ms-office.chartstyle+xml');
            if (chartColorsName)
                addContentTypeOverride('/ppt/charts/' + chartColorsName, 'application/vnd.ms-office.chartcolorstyle+xml');
        });
    });
    // STEP 5: Add notes slide(s)
    slides.forEach((_slide, idx) => {
        addContentTypeOverride(`/ppt/notesSlides/notesSlide${idx + 1}.xml`, 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml');
    });
    // STEP 6: Add master slide charts (media already handled in STEP 1)
    physicalMasters.forEach(masterSlide => {
        ;
        ((masterSlide === null || masterSlide === void 0 ? void 0 : masterSlide._relsChart) || []).forEach(rel => {
            const chartPartName = rel.Target.startsWith('../charts/') ? `/ppt/charts/${rel.Target.substring('../charts/'.length)}` : rel.Target;
            const chartContentType = rel.chartFamily === 'chartEx' ? 'application/vnd.ms-office.chartex+xml' : 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml';
            addContentTypeOverride(chartPartName, chartContentType);
            const rawOpts = rel.opts;
            const chartStyleName = rawOpts._rawChartStyleName || (rel.chartFamily === 'chartEx' ? `style${rel.globalId}.xml` : null);
            const chartColorsName = rawOpts._rawChartColorsName || (rel.chartFamily === 'chartEx' ? `colors${rel.globalId}.xml` : null);
            if (chartStyleName)
                addContentTypeOverride('/ppt/charts/' + chartStyleName, 'application/vnd.ms-office.chartstyle+xml');
            if (chartColorsName)
                addContentTypeOverride('/ppt/charts/' + chartColorsName, 'application/vnd.ms-office.chartcolorstyle+xml');
        });
    });
    // STEP 7: Add raw package passthrough overrides for decyphered template infrastructure.
    const addOverride = (partPath, contentType) => {
        let normalizedPath = partPath;
        while (normalizedPath.startsWith('/'))
            normalizedPath = normalizedPath.substring(1);
        addContentTypeOverride('/' + normalizedPath, contentType);
    };
    (rawPackageParts || []).forEach(part => {
        let partPath = (part === null || part === void 0 ? void 0 : part.path) || '';
        while (partPath.startsWith('/'))
            partPath = partPath.substring(1);
        if (!partPath || partPath.includes('/_rels/') || partPath.endsWith('.rels'))
            return;
        if (part.contentType) {
            addOverride(partPath, part.contentType);
        }
        else if (!partPath.endsWith('.xml')) {
            return;
        }
        else if (partPath.startsWith('ppt/slideLayouts/')) {
            addOverride(partPath, 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml');
        }
        else if (partPath.startsWith('ppt/slideMasters/')) {
            addOverride(partPath, 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml');
        }
        else if (partPath.startsWith('ppt/theme/')) {
            addOverride(partPath, 'application/vnd.openxmlformats-officedocument.theme+xml');
        }
        else if (partPath.startsWith('ppt/drawings/')) {
            addOverride(partPath, 'application/vnd.openxmlformats-officedocument.drawingml.chartshapes+xml');
        }
        else if (partPath === 'ppt/authors.xml') {
            addOverride(partPath, 'application/vnd.ms-powerpoint.authors+xml');
        }
    });
    // LAST: Finish XML (Resume core)
    strXml += ' <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>';
    strXml += ' <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>';
    strXml += '</Types>';
    return strXml;
}
/**
 * Creates `_rels/.rels`
 * @returns XML
 */
export function makeXmlRootRels(rawRootExtraRels) {
    let strXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${CRLF}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
		<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
		<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
		<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>`;
    let nextRid = 4;
    (rawRootExtraRels || []).forEach(rel => {
        if (!(rel === null || rel === void 0 ? void 0 : rel.type) || !(rel === null || rel === void 0 ? void 0 : rel.target))
            return;
        strXml += `<Relationship Id="rId${nextRid++}" Type="${encodeXmlEntities(rel.type)}" Target="${encodeXmlEntities(rel.target)}"${rel.targetMode ? ` TargetMode="${encodeXmlEntities(rel.targetMode)}"` : ''}/>`;
    });
    strXml += '</Relationships>';
    return strXml;
}
/**
 * Creates `docProps/app.xml`
 * @param {PresSlide[]} slides - Presenation Slides
 * @param {string} company - "Company" metadata
 * @returns XML
 */
export function makeXmlApp(slides, company) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${CRLF}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
	<TotalTime>0</TotalTime>
	<Words>0</Words>
	<Application>Microsoft Office PowerPoint</Application>
	<PresentationFormat>On-screen Show (16:9)</PresentationFormat>
	<Paragraphs>0</Paragraphs>
	<Slides>${slides.length}</Slides>
	<Notes>${slides.length}</Notes>
	<HiddenSlides>0</HiddenSlides>
	<MMClips>0</MMClips>
	<ScaleCrop>false</ScaleCrop>
	<HeadingPairs>
		<vt:vector size="6" baseType="variant">
			<vt:variant><vt:lpstr>Fonts Used</vt:lpstr></vt:variant>
			<vt:variant><vt:i4>2</vt:i4></vt:variant>
			<vt:variant><vt:lpstr>Theme</vt:lpstr></vt:variant>
			<vt:variant><vt:i4>1</vt:i4></vt:variant>
			<vt:variant><vt:lpstr>Slide Titles</vt:lpstr></vt:variant>
			<vt:variant><vt:i4>${slides.length}</vt:i4></vt:variant>
		</vt:vector>
	</HeadingPairs>
	<TitlesOfParts>
		<vt:vector size="${slides.length + 1 + 2}" baseType="lpstr">
			<vt:lpstr>Arial</vt:lpstr>
			<vt:lpstr>Calibri</vt:lpstr>
			<vt:lpstr>Office Theme</vt:lpstr>
			${slides.map((_slideObj, idx) => `<vt:lpstr>Slide ${idx + 1}</vt:lpstr>`).join('')}
		</vt:vector>
	</TitlesOfParts>
	<Company>${encodeXmlEntities(company)}</Company>
	<LinksUpToDate>false</LinksUpToDate>
	<SharedDoc>false</SharedDoc>
	<HyperlinksChanged>false</HyperlinksChanged>
	<AppVersion>16.0000</AppVersion>
	</Properties>`;
}
/**
 * Creates `docProps/core.xml`
 * @param {string} title - metadata data
 * @param {string} subject - metadata data
 * @param {string} author - metadata value
 * @param {string} revision - metadata value
 * @returns XML
 */
export function makeXmlCore(title, subject, author, revision, keywords, timestamp) {
    const coreTimestamp = timestamp || new Date().toISOString().replace(/\.\d\d\dZ/, 'Z');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
	<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
		<dc:title>${encodeXmlEntities(title)}</dc:title>
		<dc:subject>${encodeXmlEntities(subject)}</dc:subject>
		<dc:creator>${encodeXmlEntities(author)}</dc:creator>
		${keywords ? `<cp:keywords>${encodeXmlEntities(keywords)}</cp:keywords>` : ''}
		<cp:lastModifiedBy>${encodeXmlEntities(author)}</cp:lastModifiedBy>
		<cp:revision>${encodeXmlEntities(revision)}</cp:revision>
		<dcterms:created xsi:type="dcterms:W3CDTF">${coreTimestamp}</dcterms:created>
		<dcterms:modified xsi:type="dcterms:W3CDTF">${coreTimestamp}</dcterms:modified>
	</cp:coreProperties>`;
}
function normalizeRawSlideMasterRefs(rawSlideMasters) {
    const seenTargets = new Set();
    return (rawSlideMasters || [])
        .filter(master => getSlideMasterNumberFromTarget(master === null || master === void 0 ? void 0 : master.target) > 0)
        .sort((a, b) => getSlideMasterNumberFromTarget(a.target) - getSlideMasterNumberFromTarget(b.target))
        .filter(master => {
        const target = master.target;
        if (seenTargets.has(target))
            return false;
        seenTargets.add(target);
        return true;
    });
}
function normalizePresentationSlideMasterRefs(rawSlideMasters, typedMasterCount = 1, typedLayoutCount = 0) {
    const refs = [...(rawSlideMasters || [])];
    for (let idx = 0; idx < Math.max(1, typedMasterCount); idx++) {
        const target = `slideMasters/slideMaster${idx + 1}.xml`;
        // p:sldMasterId/@id and p:sldLayoutId/@id share one presentation-wide
        // unsigned-ID namespace. Master 1 owns the series base; put additional
        // typed masters after every typed layout ID to avoid Office repair.
        const id = idx === 0 ? 2147483648 : 2147483648 + Math.max(0, typedLayoutCount) + idx;
        if (!refs.some(master => (master === null || master === void 0 ? void 0 : master.target) === target))
            refs.push({ id: String(id), target });
    }
    return normalizeRawSlideMasterRefs(refs);
}
function getSlideMasterNumberFromTarget(target) {
    if (!target || !target.startsWith('slideMasters/slideMaster') || !target.endsWith('.xml'))
        return 0;
    const numPart = target.substring('slideMasters/slideMaster'.length, target.length - '.xml'.length);
    const parsed = Number(numPart);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}
function getAdditionalRawSlideMasterRid(slideCount, additionalIndex) {
    return slideCount + 7 + additionalIndex;
}
function normalizeRawPresentationFonts(rawPresentationFonts) {
    return (rawPresentationFonts || []).filter(font => !!(font === null || font === void 0 ? void 0 : font.typeface) && !!(font.regular || font.bold || font.italic || font.boldItalic));
}
function getRawPresentationFontRelations(slideCount, rawSlideMasters, rawPresentationFonts) {
    const additionalMasterCount = normalizeRawSlideMasterRefs(rawSlideMasters).filter(master => master.target !== 'slideMasters/slideMaster1.xml').length;
    let nextRawRelId = slideCount + 7 + additionalMasterCount;
    const seenTargets = new Set();
    const rels = [];
    normalizeRawPresentationFonts(rawPresentationFonts).forEach(font => {
        ;
        ['regular', 'bold', 'italic', 'boldItalic'].forEach(style => {
            const target = font[style];
            if (!target || seenTargets.has(target))
                return;
            if (!target.startsWith('fonts/') || !target.endsWith('.fntdata'))
                return;
            seenTargets.add(target);
            rels.push({ target, rId: `rId${nextRawRelId++}` });
        });
    });
    return rels;
}
/**
 * Creates `ppt/_rels/presentation.xml.rels`
 * @param {PresSlide[]} slides - Presenation Slides
 * @returns XML
 */
export function makeXmlPresentationRels(slides, rawSlideMasters, rawPresentationFonts, rawPresentationExtraRels, slideMasters) {
    const masters = normalizePresentationSlideMasterRefs(rawSlideMasters, (slideMasters === null || slideMasters === void 0 ? void 0 : slideMasters.length) || 1);
    const additionalMasters = masters.filter(master => master.target !== 'slideMasters/slideMaster1.xml');
    let intRelNum = 1;
    let strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + CRLF;
    strXml += '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    strXml += '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>';
    for (let idx = 1; idx <= slides.length; idx++) {
        strXml += `<Relationship Id="rId${++intRelNum}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${idx}.xml"/>`;
    }
    intRelNum++;
    strXml +=
        `<Relationship Id="rId${intRelNum + 0}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="notesMasters/notesMaster1.xml"/>` +
            `<Relationship Id="rId${intRelNum + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>` +
            `<Relationship Id="rId${intRelNum + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>` +
            `<Relationship Id="rId${intRelNum + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>` +
            `<Relationship Id="rId${intRelNum + 4}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>`;
    additionalMasters
        .forEach((master, idx) => {
        strXml += `<Relationship Id="rId${getAdditionalRawSlideMasterRid(slides.length, idx)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="${master.target}"/>`;
    });
    const fontRelations = getRawPresentationFontRelations(slides.length, masters, rawPresentationFonts);
    fontRelations.forEach(rel => {
        strXml += `<Relationship Id="${rel.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="${encodeXmlEntities(rel.target)}"/>`;
    });
    const additionalMasterMaxRid = additionalMasters.length > 0
        ? getAdditionalRawSlideMasterRid(slides.length, additionalMasters.length - 1)
        : intRelNum + 4;
    const extraStart = fontRelations.reduce((maxId, rel) => {
        const n = rel.rId.startsWith('rId') ? Number(rel.rId.substring(3)) : 0;
        return Math.max(maxId, n);
    }, Math.max(intRelNum + 4, additionalMasterMaxRid));
    let nextExtraRid = extraStart + 1;
    (rawPresentationExtraRels || []).forEach(rel => {
        if (!(rel === null || rel === void 0 ? void 0 : rel.type) || !(rel === null || rel === void 0 ? void 0 : rel.target))
            return;
        strXml += `<Relationship Id="rId${nextExtraRid++}" Type="${encodeXmlEntities(rel.type)}" Target="${encodeXmlEntities(rel.target)}"${rel.targetMode ? ` TargetMode="${encodeXmlEntities(rel.targetMode)}"` : ''}/>`;
    });
    strXml += '</Relationships>';
    return strXml;
}
// XML-GEN: Functions that run 1-N times (once for each Slide)
/**
 * Generates XML for the slide file (`ppt/slides/slide1.xml`)
 * @param {PresSlide} slide - the slide object to transform into XML
 * @return {string} XML
 */
export function makeXmlSlide(slide) {
    var _a, _b;
    // Generate animation XML using the centralized function
    const animationXml = genXmlAnimations(slide);
    // Only include am3d/a16 namespaces if slide has model3d content
    const hasModel3D = (_b = (_a = slide._slideObjects) === null || _a === void 0 ? void 0 : _a.some(obj => obj._type === SLIDE_OBJECT_TYPES.model3d)) !== null && _b !== void 0 ? _b : false;
    const model3dNs = hasModel3D
        ? 'xmlns:am3d="http://schemas.microsoft.com/office/drawing/2017/model3d" xmlns:a16="http://schemas.microsoft.com/office/drawing/2014/main" '
        : '';
    return (`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${CRLF}` +
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
        'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
        `${model3dNs}` +
        'xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" ' +
        'xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main"' +
        `${(slide === null || slide === void 0 ? void 0 : slide.hidden) ? ' show="0"' : ''}` +
        `${(slide === null || slide === void 0 ? void 0 : slide._showMasterSp) === false ? ' showMasterSp="0"' : ''}` +
        `${(slide === null || slide === void 0 ? void 0 : slide._showMasterPhAnim) === false ? ' showMasterPhAnim="0"' : ''}>` +
        `${slideObjectToXml(slide)}` +
        genXmlColorMapOverride(slide._colorMapOverride) +
        `${slide._rawTransitionXml || (slide.transition ? genXmlTransition(slide.transition) : '')}` +
        `${animationXml}` +
        `${slide._rawSlideExtLstXml || ''}` +
        '</p:sld>');
}
/**
 * Get text content of Notes from Slide
 * @param {PresSlide} slide - the slide object to transform into XML
 * @return {string} notes text
 */
export function getNotesFromSlide(slide) {
    let notesText = '';
    slide._slideObjects.forEach(data => {
        if (data._type === SLIDE_OBJECT_TYPES.notes)
            notesText += (data === null || data === void 0 ? void 0 : data.text) && data.text[0] ? data.text[0].text : '';
    });
    return notesText.replace(/\r*\n/g, CRLF);
}
/**
 * Generate XML for Notes Master (notesMaster1.xml)
 * @returns {string} XML
 */
export function makeXmlNotesMaster() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${CRLF}<p:notesMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Header Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="hdr" sz="quarter"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2971800" cy="458788"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle><a:lvl1pPr algn="l"><a:defRPr sz="1200"/></a:lvl1pPr></a:lstStyle><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Date Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="dt" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="3884613" y="0"/><a:ext cx="2971800" cy="458788"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle><a:lvl1pPr algn="r"><a:defRPr sz="1200"/></a:lvl1pPr></a:lstStyle><a:p><a:fld id="{5282F153-3F37-0F45-9E97-73ACFA13230C}" type="datetimeFigureOut"><a:rPr lang="en-US"/><a:t>7/23/19</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="4" name="Slide Image Placeholder 3"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="1143000"/><a:ext cx="5486400" cy="3086100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="5" name="Notes Placeholder 4"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/><a:p><a:pPr lvl="0"/><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master text styles</a:t></a:r></a:p><a:p><a:pPr lvl="1"/><a:r><a:rPr lang="en-US"/><a:t>Second level</a:t></a:r></a:p><a:p><a:pPr lvl="2"/><a:r><a:rPr lang="en-US"/><a:t>Third level</a:t></a:r></a:p><a:p><a:pPr lvl="3"/><a:r><a:rPr lang="en-US"/><a:t>Fourth level</a:t></a:r></a:p><a:p><a:pPr lvl="4"/><a:r><a:rPr lang="en-US"/><a:t>Fifth level</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="6" name="Footer Placeholder 5"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="ftr" sz="quarter" idx="4"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="8685213"/><a:ext cx="2971800" cy="458787"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="b"/><a:lstStyle><a:lvl1pPr algn="l"><a:defRPr sz="1200"/></a:lvl1pPr></a:lstStyle><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="7" name="Slide Number Placeholder 6"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldNum" sz="quarter" idx="5"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="3884613" y="8685213"/><a:ext cx="2971800" cy="458787"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="b"/><a:lstStyle><a:lvl1pPr algn="r"><a:defRPr sz="1200"/></a:lvl1pPr></a:lstStyle><a:p><a:fld id="{CE5E9CC1-C706-0F49-92D6-E571CC5EEA8F}" type="slidenum"><a:rPr lang="en-US"/><a:t>‹#›</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp></p:spTree><p:extLst><p:ext uri="{BB962C8B-B14F-4D97-AF65-F5344CB8AC3E}"><p14:creationId val="1024086991"/></p:ext></p:extLst></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:notesStyle><a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL="457200" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL="914400" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL="1371600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL="1828800" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL="2286000" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL="2743200" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL="3200400" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL="3657600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl9pPr></p:notesStyle></p:notesMaster>`;
}
/**
 * Creates Notes Slide (`ppt/notesSlides/notesSlide1.xml`)
 * @param {PresSlide} slide - the slide object to transform into XML
 * @return {string} XML
 */
export function makeXmlNotesSlide(slide) {
    return (`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${CRLF}<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${encodeXmlEntities(getNotesFromSlide(slide))}</a:t></a:r><a:endParaRPr lang="en-US" dirty="0"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="4" name="Slide Number Placeholder 3"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldNum" sz="quarter" idx="10"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id="${SLDNUMFLDID}" type="slidenum"><a:rPr lang="en-US"/><a:t>${slide._slideNum}</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp></p:spTree><p:extLst><p:ext uri="{BB962C8B-B14F-4D97-AF65-F5344CB8AC3E}"><p14:creationId val="1024086991"/></p:ext></p:extLst></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`);
}
/**
 * Generates the XML layout resource from a layout object
 * @param {SlideLayout} layout - slide layout (master)
 * @return {string} XML
 */
export function makeXmlLayout(layout) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
		<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" preserve="1">
		${slideObjectToXml(layout)}
		${genXmlColorMapOverride(layout._colorMapOverride)}${genXmlHeaderFooter(layout._headerFooter)}</p:sldLayout>`;
}
/**
 * Creates Slide Master 1 (`ppt/slideMasters/slideMaster1.xml`)
 * @param {PresSlide} slide - slide object that represents master slide layout
 * @param {SlideLayout[]} layouts - slide layouts
 * @param {SlideLayout[]} allLayouts - presentation-wide layout order used for globally unique IDs
 * @return {string} XML
 */
export function makeXmlMaster(slide, layouts, theme, allLayouts = layouts) {
    // NOTE: Pass layouts as static rels because they are not referenced any time
    // The CT_SlideLayoutId.id value is unique across the whole presentation, not
    // merely within one master. Keep relationship IDs local to this master while
    // deriving the numeric layout ID from the presentation-wide layout order.
    const layoutDefs = layouts.map((layoutDef, idx) => {
        const globalIdx = allLayouts.indexOf(layoutDef);
        return `<p:sldLayoutId id="${LAYOUT_IDX_SERIES_BASE + (globalIdx >= 0 ? globalIdx : idx)}" r:id="rId${slide._rels.length + idx + 1}"/>`;
    });
    const inheritedLang = encodeXmlEntities((theme === null || theme === void 0 ? void 0 : theme.lang) || 'en-US');
    let strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + CRLF;
    strXml +=
        '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">';
    strXml += slideObjectToXml(slide);
    strXml += `<p:clrMap ${genXmlColorMapAttributes(slide._colorMap)}/>`;
    strXml += '<p:sldLayoutIdLst>' + layoutDefs.join('') + '</p:sldLayoutIdLst>';
    strXml += genXmlHeaderFooter(slide._headerFooter, true);
    if (slide._textStyles)
        strXml += genXmlAuthoredMasterTextStyles(slide._textStyles, inheritedLang);
    else
        strXml +=
            '<p:txStyles>' +
                ' <p:titleStyle>' +
                '  <a:lvl1pPr algn="ctr" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/><a:defRPr sz="4400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/><a:cs typeface="+mj-cs"/></a:defRPr></a:lvl1pPr>' +
                ' </p:titleStyle>' +
                ' <p:bodyStyle>' +
                '  <a:lvl1pPr marL="342900" indent="-342900" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="•"/><a:defRPr sz="3200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr>' +
                '  <a:lvl2pPr marL="742950" indent="-285750" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="–"/><a:defRPr sz="2800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl2pPr>' +
                '  <a:lvl3pPr marL="1143000" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="•"/><a:defRPr sz="2400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl3pPr>' +
                '  <a:lvl4pPr marL="1600200" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="–"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl4pPr>' +
                '  <a:lvl5pPr marL="2057400" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="»"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl5pPr>' +
                '  <a:lvl6pPr marL="2514600" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="•"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl6pPr>' +
                '  <a:lvl7pPr marL="2971800" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="•"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl7pPr>' +
                '  <a:lvl8pPr marL="3429000" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="•"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl8pPr>' +
                '  <a:lvl9pPr marL="3886200" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="•"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl9pPr>' +
                ' </p:bodyStyle>' +
                ' <p:otherStyle>' +
                '  <a:defPPr><a:defRPr lang="' + inheritedLang + '"/></a:defPPr>' +
                '  <a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr>' +
                '  <a:lvl2pPr marL="457200" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl2pPr>' +
                '  <a:lvl3pPr marL="914400" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl3pPr>' +
                '  <a:lvl4pPr marL="1371600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl4pPr>' +
                '  <a:lvl5pPr marL="1828800" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl5pPr>' +
                '  <a:lvl6pPr marL="2286000" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl6pPr>' +
                '  <a:lvl7pPr marL="2743200" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl7pPr>' +
                '  <a:lvl8pPr marL="3200400" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl8pPr>' +
                '  <a:lvl9pPr marL="3657600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl9pPr>' +
                ' </p:otherStyle>' +
                '</p:txStyles>';
    strXml += '</p:sldMaster>';
    return strXml;
}
/**
 * Generates XML string for a slide layout relation file
 * @param {number} layoutNumber - 1-indexed number of a layout that relations are generated for
 * @param {SlideLayout[]} slideLayouts - Slide Layouts
 * @return {string} XML
 */
export function makeXmlSlideLayoutRel(layoutNumber, slideLayouts, slideMasters = []) {
    const layout = slideLayouts[layoutNumber - 1];
    // Imported layouts may belong to an opaque source master other than the
    // generated master1.  Keep that binding when the raw master parts are
    // carried through the package; otherwise a multi-master source silently
    // rebinds every layout to master1 on the next compile.
    const sourceMasterPart = layout === null || layout === void 0 ? void 0 : layout._templateSourceMasterPart;
    const typedMasterIndex = (layout === null || layout === void 0 ? void 0 : layout._slideMaster) ? slideMasters.indexOf(layout._slideMaster) : -1;
    const semanticMasterIndex = typedMasterIndex >= 0 ? typedMasterIndex : (layout === null || layout === void 0 ? void 0 : layout._betterpptxMasterName)
        ? slideMasters.findIndex(master => (master === null || master === void 0 ? void 0 : master._name) === layout._betterpptxMasterName)
        : -1;
    const masterPart = sourceMasterPart && sourceMasterPart.startsWith('ppt/slideMasters/')
        ? sourceMasterPart.slice('ppt/'.length)
        : `slideMasters/slideMaster${semanticMasterIndex >= 0 ? semanticMasterIndex + 1 : 1}.xml`;
    return slideObjectRelationsToXml(slideLayouts[layoutNumber - 1], [
        {
            target: `../${masterPart}`,
            type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
        },
    ]);
}
/**
 * Creates `ppt/_rels/slide*.xml.rels`
 * @param {PresSlide[]} slides
 * @param {SlideLayout[]} slideLayouts - Slide Layout(s)
 * @param {number} `slideNumber` 1-indexed number of a layout that relations are generated for
 * @return {string} XML
 */
export function makeXmlSlideRel(slides, slideLayouts, slideNumber) {
    return slideObjectRelationsToXml(slides[slideNumber - 1], [
        {
            target: `../slideLayouts/slideLayout${getLayoutIdxForSlide(slides, slideLayouts, slideNumber)}.xml`,
            type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
        },
        {
            target: `../notesSlides/notesSlide${slideNumber}.xml`,
            type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide',
        },
    ]);
}
/**
 * Generates XML string for a slide relation file.
 * @param {number} slideNumber - 1-indexed number of a layout that relations are generated for
 * @return {string} XML
 */
export function makeXmlNotesSlideRel(slideNumber) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
		<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
			<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/>
			<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${slideNumber}.xml"/>
		</Relationships>`;
}
/**
 * Creates `ppt/slideMasters/_rels/slideMaster1.xml.rels`
 * @param {PresSlide} masterSlide - Slide object
 * @param {SlideLayout[]} slideLayouts - Slide Layouts
 * @return {string} XML
 */
export function makeXmlMasterRel(masterSlide, slideLayouts, slideMasters = [masterSlide]) {
    const masterIndex = Math.max(0, slideMasters.indexOf(masterSlide));
    const defaultRels = slideLayouts
        .map((layout, idx) => ({ layout, idx }))
        .filter(({ layout }) => {
        if (layout._slideMaster)
            return layout._slideMaster === masterSlide;
        if (layout._betterpptxMasterName)
            return layout._betterpptxMasterName === masterSlide._name;
        return masterIndex === 0;
    })
        .map(({ idx }) => ({
        target: `../slideLayouts/slideLayout${idx + 1}.xml`,
        type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
    }));
    defaultRels.push({ target: `../theme/theme${masterIndex + 1}.xml`, type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme' });
    return slideObjectRelationsToXml(masterSlide, defaultRels, { defaultsFirst: true });
}
/**
 * Creates `ppt/notesMasters/_rels/notesMaster1.xml.rels`
 * @return {string} XML
 */
export function makeXmlNotesMasterRel() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${CRLF}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
		<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
		</Relationships>`;
}
/**
 * For the passed slide number, resolves name of a layout that is used for.
 * @param {PresSlide[]} slides - srray of slides
 * @param {SlideLayout[]} slideLayouts - array of slideLayouts
 * @param {number} slideNumber
 * @return {number} slide number
 */
function getLayoutIdxForSlide(slides, slideLayouts, slideNumber) {
    const rawSlideLayoutNumber = slides[slideNumber - 1]._rawSlideLayoutNumber;
    if (rawSlideLayoutNumber && rawSlideLayoutNumber > 0)
        return rawSlideLayoutNumber;
    for (let i = 0; i < slideLayouts.length; i++) {
        if (slideLayouts[i]._name === slides[slideNumber - 1]._slideLayout._name) {
            return i + 1;
        }
    }
    // IMPORTANT: Return 1 (for `slideLayout1.xml`) when no def is found
    // So all objects are in Layout1 and every slide that references it uses this layout.
    return 1;
}
// XML-GEN: Last 5 functions create root /ppt files
/**
 * Creates `ppt/theme/theme1.xml`
 * @return {string} XML
 */
function makeXmlThemeBase(pres) {
    var _a, _b, _c, _d, _e;
    const majorFont = ((_a = pres.theme) === null || _a === void 0 ? void 0 : _a.headFontFace) ? `<a:latin typeface="${(_b = pres.theme) === null || _b === void 0 ? void 0 : _b.headFontFace}"/>` : '<a:latin typeface="Calibri Light" panose="020F0302020204030204"/>';
    const minorFont = ((_c = pres.theme) === null || _c === void 0 ? void 0 : _c.bodyFontFace) ? `<a:latin typeface="${(_d = pres.theme) === null || _d === void 0 ? void 0 : _d.bodyFontFace}"/>` : '<a:latin typeface="Calibri" panose="020F0502020204030204"/>';
    // Color scheme: any slot supplied via pres.theme.palette overrides the Office
    // default. This lets a deck push its brand / art-direction palette into the
    // theme so scheme-color consumers (native SmartArt, theme-driven chart series)
    // render on-brand instead of Office blue/rainbow. dk1/lt1 keep the sysClr
    // system colors unless explicitly overridden, preserving auto text contrast.
    const pal = ((_e = pres.theme) === null || _e === void 0 ? void 0 : _e.palette) || {};
    const hex = (v) => String(v || '').replace(/^#/, '').toUpperCase();
    const slot = (name, def) => {
        const v = pal[name];
        const inner = v ? `<a:srgbClr val="${hex(v)}"/>` : def;
        return `<a:${name}>${inner}</a:${name}>`;
    };
    const clrScheme = '<a:clrScheme name="Office">' +
        slot('dk1', '<a:sysClr val="windowText" lastClr="000000"/>') +
        slot('lt1', '<a:sysClr val="window" lastClr="FFFFFF"/>') +
        slot('dk2', '<a:srgbClr val="44546A"/>') +
        slot('lt2', '<a:srgbClr val="E7E6E6"/>') +
        slot('accent1', '<a:srgbClr val="4472C4"/>') +
        slot('accent2', '<a:srgbClr val="ED7D31"/>') +
        slot('accent3', '<a:srgbClr val="A5A5A5"/>') +
        slot('accent4', '<a:srgbClr val="FFC000"/>') +
        slot('accent5', '<a:srgbClr val="5B9BD5"/>') +
        slot('accent6', '<a:srgbClr val="70AD47"/>') +
        slot('hlink', '<a:srgbClr val="0563C1"/>') +
        slot('folHlink', '<a:srgbClr val="954F72"/>') +
        '</a:clrScheme>';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements>${clrScheme}<a:fontScheme name="Office"><a:majorFont>${majorFont}<a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="游ゴシック Light"/><a:font script="Hang" typeface="맑은 고딕"/><a:font script="Hans" typeface="等线 Light"/><a:font script="Hant" typeface="新細明體"/><a:font script="Arab" typeface="Times New Roman"/><a:font script="Hebr" typeface="Times New Roman"/><a:font script="Thai" typeface="Angsana New"/><a:font script="Ethi" typeface="Nyala"/><a:font script="Beng" typeface="Vrinda"/><a:font script="Gujr" typeface="Shruti"/><a:font script="Khmr" typeface="MoolBoran"/><a:font script="Knda" typeface="Tunga"/><a:font script="Guru" typeface="Raavi"/><a:font script="Cans" typeface="Euphemia"/><a:font script="Cher" typeface="Plantagenet Cherokee"/><a:font script="Yiii" typeface="Microsoft Yi Baiti"/><a:font script="Tibt" typeface="Microsoft Himalaya"/><a:font script="Thaa" typeface="MV Boli"/><a:font script="Deva" typeface="Mangal"/><a:font script="Telu" typeface="Gautami"/><a:font script="Taml" typeface="Latha"/><a:font script="Syrc" typeface="Estrangelo Edessa"/><a:font script="Orya" typeface="Kalinga"/><a:font script="Mlym" typeface="Kartika"/><a:font script="Laoo" typeface="DokChampa"/><a:font script="Sinh" typeface="Iskoola Pota"/><a:font script="Mong" typeface="Mongolian Baiti"/><a:font script="Viet" typeface="Times New Roman"/><a:font script="Uigh" typeface="Microsoft Uighur"/><a:font script="Geor" typeface="Sylfaen"/><a:font script="Armn" typeface="Arial"/><a:font script="Bugi" typeface="Leelawadee UI"/><a:font script="Bopo" typeface="Microsoft JhengHei"/><a:font script="Java" typeface="Javanese Text"/><a:font script="Lisu" typeface="Segoe UI"/><a:font script="Mymr" typeface="Myanmar Text"/><a:font script="Nkoo" typeface="Ebrima"/><a:font script="Olck" typeface="Nirmala UI"/><a:font script="Osma" typeface="Ebrima"/><a:font script="Phag" typeface="Phagspa"/><a:font script="Syrn" typeface="Estrangelo Edessa"/><a:font script="Syrj" typeface="Estrangelo Edessa"/><a:font script="Syre" typeface="Estrangelo Edessa"/><a:font script="Sora" typeface="Nirmala UI"/><a:font script="Tale" typeface="Microsoft Tai Le"/><a:font script="Talu" typeface="Microsoft New Tai Lue"/><a:font script="Tfng" typeface="Ebrima"/></a:majorFont><a:minorFont>${minorFont}<a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="游ゴシック"/><a:font script="Hang" typeface="맑은 고딕"/><a:font script="Hans" typeface="等线"/><a:font script="Hant" typeface="新細明體"/><a:font script="Arab" typeface="Arial"/><a:font script="Hebr" typeface="Arial"/><a:font script="Thai" typeface="Cordia New"/><a:font script="Ethi" typeface="Nyala"/><a:font script="Beng" typeface="Vrinda"/><a:font script="Gujr" typeface="Shruti"/><a:font script="Khmr" typeface="DaunPenh"/><a:font script="Knda" typeface="Tunga"/><a:font script="Guru" typeface="Raavi"/><a:font script="Cans" typeface="Euphemia"/><a:font script="Cher" typeface="Plantagenet Cherokee"/><a:font script="Yiii" typeface="Microsoft Yi Baiti"/><a:font script="Tibt" typeface="Microsoft Himalaya"/><a:font script="Thaa" typeface="MV Boli"/><a:font script="Deva" typeface="Mangal"/><a:font script="Telu" typeface="Gautami"/><a:font script="Taml" typeface="Latha"/><a:font script="Syrc" typeface="Estrangelo Edessa"/><a:font script="Orya" typeface="Kalinga"/><a:font script="Mlym" typeface="Kartika"/><a:font script="Laoo" typeface="DokChampa"/><a:font script="Sinh" typeface="Iskoola Pota"/><a:font script="Mong" typeface="Mongolian Baiti"/><a:font script="Viet" typeface="Arial"/><a:font script="Uigh" typeface="Microsoft Uighur"/><a:font script="Geor" typeface="Sylfaen"/><a:font script="Armn" typeface="Arial"/><a:font script="Bugi" typeface="Leelawadee UI"/><a:font script="Bopo" typeface="Microsoft JhengHei"/><a:font script="Java" typeface="Javanese Text"/><a:font script="Lisu" typeface="Segoe UI"/><a:font script="Mymr" typeface="Myanmar Text"/><a:font script="Nkoo" typeface="Ebrima"/><a:font script="Olck" typeface="Nirmala UI"/><a:font script="Osma" typeface="Ebrima"/><a:font script="Phag" typeface="Phagspa"/><a:font script="Syrn" typeface="Estrangelo Edessa"/><a:font script="Syrj" typeface="Estrangelo Edessa"/><a:font script="Syre" typeface="Estrangelo Edessa"/><a:font script="Sora" typeface="Nirmala UI"/><a:font script="Tale" typeface="Microsoft Tai Le"/><a:font script="Talu" typeface="Microsoft New Tai Lue"/><a:font script="Tfng" typeface="Ebrima"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:lumMod val="110000"/><a:satMod val="105000"/><a:tint val="67000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="103000"/><a:tint val="73000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="109000"/><a:tint val="81000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:satMod val="103000"/><a:lumMod val="102000"/><a:tint val="94000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:satMod val="110000"/><a:lumMod val="100000"/><a:shade val="100000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="99000"/><a:satMod val="120000"/><a:shade val="78000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst><a:outerShdw blurRad="57150" dist="19050" dir="5400000" algn="ctr" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="63000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="93000"/><a:satMod val="150000"/><a:shade val="98000"/><a:lumMod val="102000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:tint val="98000"/><a:satMod val="130000"/><a:shade val="90000"/><a:lumMod val="103000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="63000"/><a:satMod val="120000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/><a:extLst><a:ext uri="{05A4C25C-085E-4340-85A3-A5531E510DB2}"><thm15:themeFamily xmlns:thm15="http://schemas.microsoft.com/office/thememl/2012/main" name="Office Theme" id="{62F939B6-93AF-4DB8-9C6B-D6C7DFDC589F}" vid="{4A3C46E8-61CC-4603-A589-7422A47A8E4A}"/></a:ext></a:extLst></a:theme>`;
}
export function makeXmlTheme(pres) {
    var _a;
    const document = new DOMParser().parseFromString(makeXmlThemeBase(pres), 'application/xml');
    const themeName = ((_a = pres.theme) === null || _a === void 0 ? void 0 : _a.name) || 'Office Theme';
    for (const tagName of ['a:theme', 'a:clrScheme', 'a:fontScheme', 'a:fmtScheme', 'thm15:themeFamily']) {
        const element = document.getElementsByTagName(tagName).item(0);
        if (element)
            element.setAttribute('name', themeName);
    }
    return new XMLSerializer().serializeToString(document);
}
/**
 * Create presentation file (`ppt/presentation.xml`)
 * @see https://docs.microsoft.com/en-us/office/open-xml/structure-of-a-presentationml-document
 * @see http://www.datypic.com/sc/ooxml/t-p_CT_Presentation.html
 * @param {IPresentationProps} pres - presentation
 * @return {string} XML
 */
export function makeXmlPresentation(pres) {
    var _a, _b, _c;
    const masters = normalizePresentationSlideMasterRefs(pres._rawSlideMasters, ((_a = pres.slideMasters) === null || _a === void 0 ? void 0 : _a.length) || 1, ((_b = pres.slideLayouts) === null || _b === void 0 ? void 0 : _b.length) || 0);
    const rawPresentationFonts = normalizeRawPresentationFonts(pres._rawPresentationFonts);
    const rawDefaultTextStyleXml = pres._rawDefaultTextStyleXml;
    const master1Id = ((_c = masters.find(master => master.target === 'slideMasters/slideMaster1.xml')) === null || _c === void 0 ? void 0 : _c.id) || '2147483648';
    let strXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${CRLF}` +
        '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
        `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ${pres.rtlMode ? 'rtl="1"' : ''} saveSubsetFonts="1" autoCompressPictures="0">`;
    // STEP 1: Add slide master (SPEC: tag 1 under <presentation>)
    strXml += `<p:sldMasterIdLst><p:sldMasterId id="${master1Id}" r:id="rId1"/>`;
    masters
        .filter(master => master.target !== 'slideMasters/slideMaster1.xml')
        .forEach((master, idx) => {
        strXml += `<p:sldMasterId id="${master.id || 2147483648 + idx + 1}" r:id="rId${getAdditionalRawSlideMasterRid(pres.slides.length, idx)}"/>`;
    });
    strXml += '</p:sldMasterIdLst>';
    // STEP 2: Add all Slides (SPEC: tag 3 under <presentation>)
    strXml += '<p:sldIdLst>';
    pres.slides.forEach(slide => (strXml += `<p:sldId id="${slide._slideId}" r:id="rId${slide._rId}"/>`));
    strXml += '</p:sldIdLst>';
    // STEP 3: Add Notes Master (SPEC: tag 2 under <presentation>)
    // (NOTE: length+2 is from `presentation.xml.rels` func (since we have to match this rId, we just use same logic))
    // IMPORTANT: In this order (matches PPT2019) PPT will give corruption message on open!
    // IMPORTANT: Placing this before `<p:sldIdLst>` causes warning in modern powerpoint!
    // IMPORTANT: Presentations open without warning Without this line, however, the pres isnt preview in Finder anymore or viewable in iOS!
    strXml += `<p:notesMasterIdLst><p:notesMasterId r:id="rId${pres.slides.length + 2}"/></p:notesMasterIdLst>`;
    // STEP 4: Add sizes
    const slideSizeType = String(pres.presLayout.type || pres.presLayout.name || '');
    const slideSizeTypeAttr = [
        'screen4x3',
        'letter',
        'A4',
        '35mm',
        'overhead',
        'banner',
        'custom',
        'ledger',
        'A3',
        'B4ISO',
        'B5ISO',
        'B4JIS',
        'B5JIS',
        'hagakiCard',
        'screen16x9',
        'screen16x10',
    ].includes(slideSizeType)
        ? ` type="${encodeXmlEntities(slideSizeType)}"`
        : '';
    strXml += `<p:sldSz cx="${pres.presLayout.width}" cy="${pres.presLayout.height}"${slideSizeTypeAttr}/>`;
    strXml += `<p:notesSz cx="${pres.presLayout.height}" cy="${pres.presLayout.width}"/>`;
    // Custom shows are presentation topology, not separate package parts. Their
    // slide references reuse the existing presentation-to-slide relationships.
    const customShows = Array.isArray(pres.customShows) ? pres.customShows : [];
    if (customShows.length) {
        strXml += '<p:custShowLst>';
        customShows.forEach((show) => {
            if (!show || !show.name || !Number.isInteger(show.id) || show.id < 0 || show.id > 4294967295) {
                throw new Error('Custom shows require a name and a unique unsigned 32-bit id.');
            }
            const showSlides = Array.isArray(show.slides) && show.slides.length
                ? show.slides.map(slideId => pres.slides.find(slide => slide._betterpptxSemanticId === slideId))
                : (show.slideIndexes || []).map(slideIndex => pres.slides[slideIndex]);
            if (!showSlides.length || showSlides.some(slide => !slide)) {
                throw new Error(`Custom show '${show.name}' must contain at least one slide.`);
            }
            strXml += `<p:custShow name="${encodeXmlEntities(show.name)}" id="${show.id}"><p:sldLst>`;
            showSlides.forEach(slide => {
                if (!slide)
                    throw new Error(`Custom show '${show.name}' references an unknown slide.`);
                strXml += `<p:sld r:id="rId${slide._rId}"/>`;
            });
            strXml += '</p:sldLst></p:custShow>';
        });
        strXml += '</p:custShowLst>';
    }
    const fontRelByTarget = new Map(getRawPresentationFontRelations(pres.slides.length, masters, rawPresentationFonts).map(rel => [rel.target, rel.rId]));
    if (rawPresentationFonts.length > 0 && fontRelByTarget.size > 0) {
        strXml += '<p:embeddedFontLst>';
        rawPresentationFonts.forEach(font => {
            strXml += `<p:embeddedFont><p:font typeface="${encodeXmlEntities(font.typeface || '')}"/>`;
            [
                ['regular', 'regular'],
                ['bold', 'bold'],
                ['italic', 'italic'],
                ['boldItalic', 'boldItalic'],
            ].forEach(([style, tagName]) => {
                const target = font[style];
                const rId = target ? fontRelByTarget.get(target) : null;
                if (rId)
                    strXml += `<p:${tagName} r:id="${rId}"/>`;
            });
            strXml += '</p:embeddedFont>';
        });
        strXml += '</p:embeddedFontLst>';
    }
    // STEP 5: Add text styles
    if (rawDefaultTextStyleXml) {
        strXml += rawDefaultTextStyleXml;
    }
    else {
        strXml += '<p:defaultTextStyle>';
        for (let idy = 1; idy < 10; idy++) {
            strXml +=
                `<a:lvl${idy}pPr marL="${(idy - 1) * 457200}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">` +
                    '<a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/>' +
                    `</a:defRPr></a:lvl${idy}pPr>`;
        }
        strXml += '</p:defaultTextStyle>';
    }
    // STEP 6: Add Sections (if any)
    if (pres.sections && pres.sections.length > 0) {
        strXml += '<p:extLst><p:ext uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}">';
        strXml += '<p14:sectionLst xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main">';
        pres.sections.forEach(sect => {
            // Stable, reused GUID (so a Section Zoom can reference this section by id). @see plans/section-zoom-ooxml-ground-truth.md
            if (!sect._id)
                sect._id = '{' + getUuid('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx').toUpperCase() + '}';
            strXml += `<p14:section name="${encodeXmlEntities(sect.title)}" id="${sect._id}"><p14:sldIdLst>`;
            sect._slides.forEach(slide => (strXml += `<p14:sldId id="${slide._slideId}"/>`));
            strXml += '</p14:sldIdLst></p14:section>';
        });
        strXml += '</p14:sectionLst></p:ext>';
        strXml += '<p:ext uri="{EFAFB233-063F-42B5-8137-9DF3F51BA10A}"><p15:sldGuideLst xmlns:p15="http://schemas.microsoft.com/office/powerpoint/2012/main"/></p:ext>';
        strXml += '</p:extLst>';
    }
    // Done
    strXml += '</p:presentation>';
    return strXml;
}
/**
 * Create `ppt/presProps.xml`
 * @return {string} XML
 */
export function makeXmlPresProps(pres) {
    const settings = pres === null || pres === void 0 ? void 0 : pres.showSettings;
    if (!settings) {
        return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${CRLF}<p:presentationPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`;
    }
    const attr = [
        settings.showNarration !== undefined ? `showNarration="${settings.showNarration ? 1 : 0}"` : '',
        settings.showAnimation !== undefined ? `showAnimation="${settings.showAnimation ? 1 : 0}"` : '',
        settings.useTimings !== undefined ? `useTimings="${settings.useTimings ? 1 : 0}"` : '',
        settings.loop !== undefined ? `loop="${settings.loop ? 1 : 0}"` : '',
    ].filter(Boolean).join(' ');
    const showPrAttr = attr ? ` ${attr}` : '';
    const mode = settings.mode === 'browse'
        ? '<p:browse/>'
        : settings.mode === 'kiosk'
            ? `<p:kiosk restart="${Math.max(0, Math.round(settings.restartMs || 300000))}"/>`
            : '<p:present/>';
    const mediaControls = settings.showMediaControls === false
        ? ''
        : '<p:extLst><p:ext uri="{2FDB2607-1784-4EEB-B798-7EB5836EED8A}"><p14:showMediaCtrls xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" val="1"/></p:ext></p:extLst>';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${CRLF}<p:presentationPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:showPr${showPrAttr}>${mode}<p:sldAll/>${mediaControls}</p:showPr></p:presentationPr>`;
}
/**
 * Create `ppt/tableStyles.xml`
 * @see: http://openxmldeveloper.org/discussions/formats/f/13/p/2398/8107.aspx
 * @return {string} XML
 */
export function makeXmlTableStyles() {
    return POWERPOINT_TABLE_STYLES_XML;
}
/**
 * Creates `ppt/viewProps.xml`
 * @return {string} XML
 */
export function makeXmlViewProps() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${CRLF}<p:viewPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:normalViewPr horzBarState="maximized"><p:restoredLeft sz="15611"/><p:restoredTop sz="94610"/></p:normalViewPr><p:slideViewPr><p:cSldViewPr snapToGrid="0" snapToObjects="1"><p:cViewPr varScale="1"><p:scale><a:sx n="136" d="100"/><a:sy n="136" d="100"/></p:scale><p:origin x="216" y="312"/></p:cViewPr><p:guideLst/></p:cSldViewPr></p:slideViewPr><p:notesTextViewPr><p:cViewPr><p:scale><a:sx n="1" d="1"/><a:sy n="1" d="1"/></p:scale><p:origin x="0" y="0"/></p:cViewPr></p:notesTextViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`;
}
/**
 * Checks shadow options passed by user and performs corrections if needed.
 * @param {ShadowProps} shadowProps - shadow options
 */
export function correctShadowOptions(shadowProps) {
    if (!shadowProps || typeof shadowProps !== 'object') {
        // console.warn("`shadow` options must be an object. Ex: `{shadow: {type:'none'}}`")
        return;
    }
    // OPT: `type`
    if (shadowProps.type !== 'outer' && shadowProps.type !== 'inner' && shadowProps.type !== 'none') {
        console.warn('Warning: shadow.type options are `outer`, `inner` or `none`.');
        shadowProps.type = 'outer';
    }
    // OPT: `angle`
    if (shadowProps.angle) {
        // A: REALITY-CHECK
        if (isNaN(Number(shadowProps.angle)) || shadowProps.angle < 0 || shadowProps.angle > 359) {
            console.warn('Warning: shadow.angle can only be 0-359');
            shadowProps.angle = 270;
        }
        // B: ROBUST: Cast any type of valid arg to int: '12', 12.3, etc. -> 12
        shadowProps.angle = Math.round(Number(shadowProps.angle));
    }
    // OPT: `opacity`
    if (shadowProps.opacity !== undefined && shadowProps.opacity !== null) {
        const opacity = Number(shadowProps.opacity);
        if (!Number.isFinite(opacity)) {
            console.warn('Warning: shadow.opacity can only be 0-1 or 0-100');
            shadowProps.opacity = 0.75;
        }
        else {
            if (opacity < 0 || opacity > 100)
                console.warn('Warning: shadow.opacity can only be 0-1 or 0-100. Value was clamped.');
            shadowProps.opacity = Math.max(0, Math.min(1, opacity > 1 ? opacity / 100 : opacity));
        }
    }
}
//# sourceMappingURL=gen-xml.js.map