/**
 * PptxGenJS: Utility Methods
 */
import { EMU, REGEX_HEX_COLOR, DEF_FONT_COLOR, ONEPT, SchemeColor } from './core-enums';
import { normalizeGradientDirection, normalizeScene3DRotationDegrees } from './option-registry';
export { getOptionCatalog, normalizeGradientDirection, normalizeWordArtTransform } from './option-registry';
/**
 * Translates any type of `x`/`y`/`w`/`h` prop to EMU
 * - guaranteed to return a result regardless of undefined, null, etc. (0)
 * - {number} - 12800 (EMU)
 * - {number} - 0.5 (inches)
 * - {string} - "75%"
 * @param {number|string} size - numeric ("5.5") or percentage ("90%")
 * @param {'X' | 'Y'} xyDir - direction
 * @param {PresLayout} layout - presentation layout
 * @returns {number} calculated size
 */
export function getSmartParseNumber(size, xyDir, layout) {
    // FIRST: Convert string numeric value if reqd
    if (typeof size === 'string' && !isNaN(Number(size)))
        size = Number(size);
    // CASE 1: Number in inches
    // Assume any number less than 100 is inches
    if (typeof size === 'number' && size < 100)
        return inch2Emu(size);
    // CASE 2: Number is already converted to something other than inches
    // Assume any number greater than 100 sure isnt inches! Just return it (assume value is EMU already).
    if (typeof size === 'number' && size >= 100)
        return size;
    // CASE 3: Percentage (ex: '50%')
    if (typeof size === 'string' && size.includes('%')) {
        if (xyDir && xyDir === 'X')
            return Math.round((parseFloat(size) / 100) * layout.width);
        if (xyDir && xyDir === 'Y')
            return Math.round((parseFloat(size) / 100) * layout.height);
        // Default: Assume width (x/cx)
        return Math.round((parseFloat(size) / 100) * layout.width);
    }
    // LAST: Default value
    return 0;
}
/**
 * Basic UUID Generator Adapted
 * @link https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript#answer-2117523
 * @param {string} uuidFormat - UUID format
 * @returns {string} UUID
 */
export function getUuid(uuidFormat) {
    return uuidFormat.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
/**
 * Replace special XML characters with HTML-encoded strings
 * @param {string} xml - XML string to encode
 * @returns {string} escaped XML
 */
export function encodeXmlEntities(xml) {
    // NOTE: Dont use short-circuit eval here as value c/b "0" (zero) etc.!
    if (typeof xml === 'undefined' || xml == null)
        return '';
    return xml.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
/**
 * Convert inches into EMU
 * @param {number|string} inches - as string or number
 * @returns {number} EMU value
 */
export function inch2Emu(inches) {
    // NOTE: Provide Caller Safety: Numbers may get conv<->conv during flight, so be kind and do some simple checks to ensure inches were passed
    // Any value over 100 damn sure isnt inches, so lets assume its in EMU already, therefore, just return the same value
    if (typeof inches === 'number' && inches > 100)
        return inches;
    if (typeof inches === 'string')
        inches = Number(inches.replace(/in*/gi, ''));
    return Math.round(EMU * inches);
}
/**
 * Convert `pt` into points (using `ONEPT`)
 * @param {number|string} pt
 * @returns {number} value in points (`ONEPT`)
 */
export function valToPts(pt) {
    const points = Number(pt) || 0;
    return isNaN(points) ? 0 : Math.round(points * ONEPT);
}
/**
 * Convert degrees (0..360) to PowerPoint `rot` value
 * @param {number} d degrees
 * @returns {number} calculated `rot` value
 */
export function convertRotationDegrees(d) {
    d = d || 0;
    return Math.round((d > 360 ? d - 360 : d) * 60000);
}
const convertScene3DRotationDegrees = (d, label, prefix = 'options.text3D') => normalizeScene3DRotationDegrees(d, `${prefix}.${label}`);
function normalizeOpacityValue(value, fallback, label) {
    if (value === undefined || value === null || value === '')
        return fallback;
    const raw = Number(value);
    if (!Number.isFinite(raw)) {
        console.warn(`Warning: ${label} can only be 0-1 or 0-100. ${fallback} used instead.`);
        return fallback;
    }
    const scalar = raw > 1 ? raw / 100 : raw;
    if (scalar < 0 || scalar > 1) {
        console.warn(`Warning: ${label} can only be 0-1 or 0-100. Value was clamped.`);
    }
    return Math.max(0, Math.min(1, scalar));
}
function opacityToOoxmlAlpha(value, fallback, label) {
    return Math.round(normalizeOpacityValue(value, fallback, label) * 100000);
}
/**
 * Converts component value to hex value
 * @param {number} c - component color
 * @returns {string} hex string
 */
export function componentToHex(c) {
    const hex = c.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
}
/**
 * Converts RGB colors from css selectors to Hex for Presentation colors
 * @param {number} r - red value
 * @param {number} g - green value
 * @param {number} b - blue value
 * @returns {string} XML string
 */
export function rgbToHex(r, g, b) {
    return (componentToHex(r) + componentToHex(g) + componentToHex(b)).toUpperCase();
}
/**  TODO: FUTURE: TODO-4.0:
 * @date 2022-04-10
 * @tldr this s/b a private method with all current calls switched to `genXmlColorSelection()`
 * @desc lots of code calls this method
 * @example [gen-charts.tx] `strXml += '<a:solidFill>' + createColorElement(seriesColor, `<a:alpha val="${Math.round(opts.chartColorsOpacity * 1000)}"/>`) + '</a:solidFill>'`
 * Thi sis wrong. We s/b calling `genXmlColorSelection()` instead as it returns `<a:solidfill>BLAH</a:solidFill>`!!
 */
/**
 * Create either a `a:schemeClr` - (scheme color), `a:srgbClr` (hexa representation), or `a:prstClr` (preset color).
 * @param {string|SCHEME_COLORS} colorStr - hexa representation (eg. "FFFF00"), scheme color constant (eg. pptx.SchemeColor.ACCENT1), or preset color name (eg. "black")
 * @param {string} innerElements - additional elements that adjust the color and are enclosed by the color element
 * @returns {string} XML string
 */
export function createColorElement(colorStr, innerElements) {
    let colorVal = (colorStr || '').replace('#', '');
    // Preset colors (PowerPoint named colors)
    const presetColors = ['black', 'white', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta',
        'gray', 'darkGray', 'lightGray', 'darkRed', 'darkGreen', 'darkBlue',
        'darkYellow', 'darkCyan', 'darkMagenta', 'lightRed', 'lightGreen',
        'lightBlue', 'lightYellow', 'lightCyan', 'lightMagenta'];
    // Check if it's a preset color
    if (presetColors.includes(colorVal.toLowerCase())) {
        const colorAttr = 'val="' + colorVal.toLowerCase() + '"';
        return innerElements ? `<a:prstClr ${colorAttr}>${innerElements}</a:prstClr>` : `<a:prstClr ${colorAttr}/>`;
    }
    // Check if it's a scheme color or hex
    if (!REGEX_HEX_COLOR.test(colorVal) &&
        colorVal !== SchemeColor.background1 &&
        colorVal !== SchemeColor.background2 &&
        colorVal !== SchemeColor.text1 &&
        colorVal !== SchemeColor.text2 &&
        colorVal !== SchemeColor.accent1 &&
        colorVal !== SchemeColor.accent2 &&
        colorVal !== SchemeColor.accent3 &&
        colorVal !== SchemeColor.accent4 &&
        colorVal !== SchemeColor.accent5 &&
        colorVal !== SchemeColor.accent6) {
        console.warn(`"${colorVal}" is not a valid scheme color, preset color, or hex RGB! "${DEF_FONT_COLOR}" used instead. Only provide 6-digit RGB, 'pptx.SchemeColor' values, or preset color names!`);
        colorVal = DEF_FONT_COLOR;
    }
    const tagName = REGEX_HEX_COLOR.test(colorVal) ? 'srgbClr' : 'schemeClr';
    const colorAttr = 'val="' + (REGEX_HEX_COLOR.test(colorVal) ? colorVal.toUpperCase() : colorVal) + '"';
    return innerElements ? `<a:${tagName} ${colorAttr}>${innerElements}</a:${tagName}>` : `<a:${tagName} ${colorAttr}/>`;
}
/**
 * Creates `a:glow` element
 * @param {TextGlowProps} options glow properties
 * @param {TextGlowProps} defaults defaults for unspecified properties in `opts`
 * @see http://officeopenxml.com/drwSp-effects.php
 * { size: 8, color: 'FFFFFF', opacity: 0.75 };
 */
export function createGlowElement(options, defaults) {
    var _a;
    let strXml = '';
    const opts = Object.assign(Object.assign({}, defaults), options);
    const size = Math.round(opts.size * ONEPT);
    const color = opts.color;
    const opacity = opacityToOoxmlAlpha(opts.opacity, (_a = defaults.opacity) !== null && _a !== void 0 ? _a : 0.75, 'options.glow.opacity');
    strXml += `<a:glow rad="${size}">`;
    strXml += createColorElement(color, `<a:alpha val="${opacity}"/>`);
    strXml += '</a:glow>';
    return strXml;
}
/**
 * Creates `a:outerShdw` or `a:innerShdw` element for text shadow effect
 * @param {ShadowProps} options shadow properties
 * @returns {string} XML string for shadow element (without effectLst wrapper)
 * @see http://officeopenxml.com/drwSp-effects.php
 */
/** Map of preset color names to hex equivalents (for use in srgbClr contexts like shadows) */
const PRESET_COLOR_HEX_MAP = {
    black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF',
    yellow: 'FFFF00', cyan: '00FFFF', magenta: 'FF00FF', gray: '808080',
    darkGray: 'A9A9A9', lightGray: 'D3D3D3', darkRed: '8B0000', darkGreen: '006400',
    darkBlue: '00008B', darkYellow: '808000', darkCyan: '008B8B', darkMagenta: '8B008B',
    lightRed: 'FF6666', lightGreen: '90EE90', lightBlue: 'ADD8E6',
    lightYellow: 'FFFFE0', lightCyan: 'E0FFFF', lightMagenta: 'FF80FF',
};
export function createShadowElement(options) {
    var _a, _b, _c, _d, _e;
    if (!options || options.type === 'none') {
        return '';
    }
    const type = options.type || 'outer';
    const blur = Math.round(((_a = options.blur) !== null && _a !== void 0 ? _a : 4) * ONEPT);
    const offset = Math.round(((_b = options.offset) !== null && _b !== void 0 ? _b : 3) * ONEPT);
    const angle = Math.round(((_c = options.angle) !== null && _c !== void 0 ? _c : 45) * 60000);
    const rawColor = (_d = options.color) !== null && _d !== void 0 ? _d : '000000';
    const opacity = opacityToOoxmlAlpha(options.opacity, 0.5, 'options.shadow.opacity');
    const rotShape = options.rotateWithShape ? 1 : 0;
    // Determine color XML: support preset color objects { type: 'preset', preset: 'black' } or hex strings
    let colorXml;
    if (rawColor && typeof rawColor === 'object' && rawColor.type === 'preset') {
        // Use prstClr element to match native PowerPoint output
        const presetVal = rawColor.preset;
        colorXml = `<a:prstClr val="${presetVal}"><a:alpha val="${opacity}"/></a:prstClr>`;
    }
    else {
        // Hex color: convert preset name to hex if needed, then emit srgbClr
        const colorStr = typeof rawColor === 'string' ? rawColor : '000000';
        const color = (_e = PRESET_COLOR_HEX_MAP[colorStr.toLowerCase()]) !== null && _e !== void 0 ? _e : colorStr.replace('#', '');
        colorXml = `<a:srgbClr val="${color.toUpperCase()}"><a:alpha val="${opacity}"/></a:srgbClr>`;
    }
    let strXml = `<a:${type}Shdw blurRad="${blur}" dist="${offset}" dir="${angle}" rotWithShape="${rotShape}">`;
    strXml += colorXml;
    strXml += `</a:${type}Shdw>`;
    return strXml;
}
/**
 * Creates `a:reflection` element for text reflection effect
 * @param {TextReflectionProps} options reflection properties
 * @returns {string} XML string for <a:reflection>
 * @see https://docs.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.reflection
 */
export function createReflectionElement(options) {
    var _a, _b, _c, _d, _e, _f;
    // Defaults based on PowerPoint's "Tight Reflection Touching" preset
    const blur = Math.round(((_a = options.blur) !== null && _a !== void 0 ? _a : 0) * ONEPT);
    const offset = Math.round(((_b = options.offset) !== null && _b !== void 0 ? _b : 0) * ONEPT);
    const startOpacity = opacityToOoxmlAlpha(options.opacity, 0.5, 'options.reflection.opacity');
    const endOpacity = opacityToOoxmlAlpha(options.endOpacity, 0, 'options.reflection.endOpacity');
    const fadeStart = Math.round(((_c = options.fadeStart) !== null && _c !== void 0 ? _c : 0) * 1000); // percentage in 1000ths
    const fadeEnd = Math.round(((_d = options.fadeEnd) !== null && _d !== void 0 ? _d : 100) * 1000); // percentage in 1000ths
    const angle = Math.round(((_e = options.angle) !== null && _e !== void 0 ? _e : 90) * 60000); // degrees in 60000ths
    const scaleY = Math.round(((_f = options.scaleY) !== null && _f !== void 0 ? _f : -100) * 1000); // percentage in 1000ths
    return `<a:reflection blurRad="${blur}" stA="${startOpacity}" endA="${endOpacity}" stPos="${fadeStart}" endPos="${fadeEnd}" dist="${offset}" dir="${angle}" sy="${scaleY}" algn="bl" rotWithShape="0"/>`;
}
/**
 * Creates 3D scene and shape properties for text 3D effects
 * @param {Text3DProps} options 3D properties
 * @returns {string} XML string for <a:scene3d> and <a:sp3d>
 */
export function create3DElements(options) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    let strXml = '';
    // Scene 3D (camera and lighting setup)
    const lightRig = (_a = options.lightRig) !== null && _a !== void 0 ? _a : 'threePt';
    const lightDir = convertScene3DRotationDegrees(options.lightDirection, 'lightDirection', 'options.effect3D');
    // Check if rotation is specified - if so, use perspective camera with rotation
    const hasRotation = options.rotationX || options.rotationY || options.rotationZ;
    strXml += '<a:scene3d>';
    if (hasRotation) {
        // Use perspective camera with rotation for 3D visibility
        // Rotation values: PowerPoint uses 60000ths of a degree
        const rotX = convertScene3DRotationDegrees(options.rotationX, 'rotationX', 'options.effect3D');
        const rotY = convertScene3DRotationDegrees(options.rotationY, 'rotationY', 'options.effect3D');
        const rotZ = convertScene3DRotationDegrees(options.rotationZ, 'rotationZ', 'options.effect3D');
        const fov = Math.round(((_b = options.perspective) !== null && _b !== void 0 ? _b : 45) * 60000);
        // Use perspectiveFront camera preset with rotation
        strXml += `<a:camera prst="perspectiveFront" fov="${fov}">`;
        strXml += `<a:rot lat="${rotX}" lon="${rotY}" rev="${rotZ}"/>`;
        strXml += '</a:camera>';
    }
    else {
        // Default orthographic camera (flat view)
        strXml += '<a:camera prst="orthographicFront"/>';
    }
    strXml += `<a:lightRig rig="${lightRig}" dir="t">`;
    if (lightDir !== 0)
        strXml += `<a:rot lat="0" lon="0" rev="${lightDir}"/>`;
    strXml += '</a:lightRig></a:scene3d>';
    // Shape 3D (bevel, extrusion, material)
    // Note: Don't add default material - PowerPoint removes it when saving
    strXml += '<a:sp3d';
    if (options.material)
        strXml += ` prstMaterial="${options.material}"`;
    strXml += '>';
    // Top bevel
    if (options.bevel) {
        const bevelW = Math.round(((_c = options.bevel.width) !== null && _c !== void 0 ? _c : 6) * ONEPT);
        const bevelH = Math.round(((_d = options.bevel.height) !== null && _d !== void 0 ? _d : 6) * ONEPT);
        strXml += `<a:bevelT w="${bevelW}" h="${bevelH}"`;
        // Note: Don't add default prst - PowerPoint removes it when saving
        if (options.bevel.type)
            strXml += ` prst="${options.bevel.type}"`;
        strXml += '/>';
    }
    // Bottom bevel
    if (options.bevelBottom) {
        const bevelW = Math.round(((_e = options.bevelBottom.width) !== null && _e !== void 0 ? _e : 6) * ONEPT);
        const bevelH = Math.round(((_f = options.bevelBottom.height) !== null && _f !== void 0 ? _f : 6) * ONEPT);
        strXml += `<a:bevelB w="${bevelW}" h="${bevelH}"`;
        // Note: Don't add default prst - PowerPoint removes it when saving
        if (options.bevelBottom.type)
            strXml += ` prst="${options.bevelBottom.type}"`;
        strXml += '/>';
    }
    // Extrusion (depth)
    if (options.extrusion) {
        const extrusionDepth = Math.round(options.extrusion * ONEPT);
        strXml += `<a:extrusionClr><a:srgbClr val="${(_g = options.extrusionColor) !== null && _g !== void 0 ? _g : '000000'}"/></a:extrusionClr>`;
        strXml = strXml.replace('<a:sp3d', `<a:sp3d extrusionH="${extrusionDepth}"`);
    }
    // Contour
    if (options.contourWidth) {
        const contourW = Math.round(options.contourWidth * ONEPT);
        strXml += `<a:contourClr><a:srgbClr val="${(_h = options.contourColor) !== null && _h !== void 0 ? _h : '000000'}"/></a:contourClr>`;
        strXml = strXml.replace(/<a:sp3d ([^>]*)>/, `<a:sp3d contourW="${contourW}" $1>`);
    }
    strXml += '</a:sp3d>';
    return strXml;
}
/**
 * Creates 3D elements specifically for text body (inside <a:bodyPr>)
 * This is different from shape-level 3D - text 3D affects the text characters themselves
 * Text 3D goes inside <a:bodyPr> while shape 3D goes in <p:spPr>
 * @param {Text3DProps} options 3D effect properties for text
 * @returns {string} XML string containing scene3d and sp3d elements for text body
 */
export function createText3DElements(options) {
    if (!options)
        return '';
    let strXml = '';
    // Scene 3D with camera and light rig for text rotation
    const rotX = options.rotationX != null ? convertScene3DRotationDegrees(options.rotationX, 'rotationX') : 0;
    const rotY = options.rotationY != null ? convertScene3DRotationDegrees(options.rotationY, 'rotationY') : 0;
    const rotZ = options.rotationZ != null ? convertScene3DRotationDegrees(options.rotationZ, 'rotationZ') : 0;
    const perspective = options.perspective != null ? Math.round(options.perspective * 60000) : 0;
    const lightRig = options.lightRig || 'threePt';
    const material = options.material || 'warmMatte';
    // Add scene3d if there's any 3D configuration
    const hasRotation = rotX !== 0 || rotY !== 0 || rotZ !== 0;
    const hasBevel = options.bevel != null;
    const hasExtrusion = options.extrusion != null;
    if (hasRotation || hasBevel || hasExtrusion || perspective !== 0) {
        strXml += '<a:scene3d>';
        strXml += '<a:camera prst="orthographicFront"';
        if (perspective !== 0) {
            strXml += ` fov="${perspective}"`;
        }
        strXml += '>';
        if (hasRotation) {
            strXml += `<a:rot lat="${rotX}" lon="${rotY}" rev="${rotZ}"/>`;
        }
        strXml += '</a:camera>';
        strXml += `<a:lightRig rig="${lightRig}" dir="t"/>`;
        strXml += '</a:scene3d>';
        // Text 3D properties (sp3d inside bodyPr for text-specific effects)
        // Note: Don't add default material - PowerPoint removes it when saving
        strXml += '<a:sp3d';
        if (options.material)
            strXml += ` prstMaterial="${options.material}"`;
        strXml += '>';
        // Top bevel for text
        if (hasBevel) {
            const bevelW = Math.round((options.bevel.width || 6) * ONEPT);
            const bevelH = Math.round((options.bevel.height || 6) * ONEPT);
            strXml += `<a:bevelT w="${bevelW}" h="${bevelH}"`;
            // Note: Don't add default prst - PowerPoint removes it when saving
            if (options.bevel.type)
                strXml += ` prst="${options.bevel.type}"`;
            strXml += '/>';
        }
        // Extrusion for text depth
        if (hasExtrusion) {
            const extrusionDepth = Math.round(options.extrusion * ONEPT);
            // Update sp3d opening tag to include extrusion height
            strXml = strXml.replace('<a:sp3d', `<a:sp3d extrusionH="${extrusionDepth}"`);
            if (options.extrusionColor) {
                strXml += `<a:extrusionClr><a:srgbClr val="${options.extrusionColor}"/></a:extrusionClr>`;
            }
        }
        strXml += '</a:sp3d>';
    }
    return strXml;
}
/**
 * Generate gradient fill XML (a:gradFill)
 * @param {ShapeFillProps} props - fill properties with gradient settings
 * @returns {string} XML string for <a:gradFill>
 * @see http://www.datypic.com/sc/ooxml/e-a_gradFill-1.html
 */
export function genXmlGradientFill(props) {
    // Handle preset gradients
    if (props.gradientPreset) {
        return genXmlGradientPreset(props.gradientPreset, props.rotateGradientWithShape);
    }
    // Validate: must have gradient stops
    if (!props.gradientStops || props.gradientStops.length < 2) {
        console.warn('Gradient fill requires at least 2 gradient stops. Using default solid fill.');
        return '';
    }
    const rotWithShape = props.rotateGradientWithShape !== false ? '1' : '0';
    const flip = props.gradientFlip || 'none';
    let strXml = `<a:gradFill rotWithShape="${rotWithShape}" flip="${flip}">`;
    // Gradient stops (<a:gsLst>)
    strXml += '<a:gsLst>';
    for (let idx = 0; idx < props.gradientStops.length; idx++) {
        const stop = props.gradientStops[idx];
        const rawPosition = typeof stop.position === 'number' ? stop.position : stop.pos;
        const fallbackPosition = props.gradientStops.length === 1 ? 0 : (idx / (props.gradientStops.length - 1)) * 100;
        const stopPosition = Number.isFinite(rawPosition) ? rawPosition : fallbackPosition;
        // Position: 0-100 -> 0-100000. Never emit NaN; PowerPoint treats that as package corruption.
        const pos = Math.round(Math.max(0, Math.min(100, stopPosition)) * 1000);
        let innerElements = '';
        // Add transparency if specified
        if (stop.transparency != null && stop.transparency > 0) {
            const alpha = Math.round((100 - Math.max(0, Math.min(100, stop.transparency))) * 1000);
            innerElements = `<a:alpha val="${alpha}"/>`;
        }
        strXml += `<a:gs pos="${pos}">`;
        strXml += createColorElement(stop.color, innerElements);
        strXml += '</a:gs>';
    }
    strXml += '</a:gsLst>';
    // Direction: linear or valid DrawingML path gradient.
    const direction = normalizeGradientDirection(props.gradientDirection);
    if (direction === 'linear') {
        // Linear gradient: angle in 60000ths of a degree
        const angle = props.gradientAngle || 0;
        const ang = Math.round(angle * 60000);
        strXml += `<a:lin ang="${ang}" scaled="0"/>`;
    }
    else {
        // Path gradient: circle, rect, or shape
        strXml += `<a:path path="${direction}">`;
        // Fill-to-rect (focus rectangle for path gradients)
        if (props.fillToRect) {
            const r = props.fillToRect;
            const l = Math.round((r.l || 0) * 1000);
            const t = Math.round((r.t || 0) * 1000);
            const rt = Math.round((r.r || 0) * 1000);
            const b = Math.round((r.b || 0) * 1000);
            strXml += `<a:fillToRect l="${l}" t="${t}" r="${rt}" b="${b}"/>`;
        }
        strXml += '</a:path>';
    }
    // Tile rect (optional)
    if (props.tileRect) {
        const tr = props.tileRect;
        const l = Math.round((tr.l || 0) * 1000);
        const t = Math.round((tr.t || 0) * 1000);
        const r = Math.round((tr.r || 0) * 1000);
        const b = Math.round((tr.b || 0) * 1000);
        strXml += `<a:tileRect l="${l}" t="${t}" r="${r}" b="${b}"/>`;
    }
    strXml += '</a:gradFill>';
    return strXml;
}
/**
 * Generate preset gradient XML
 * @param {string} preset - preset gradient name
 * @param {boolean} rotWithShape - rotate with shape
 * @returns {string} XML string
 */
function genXmlGradientPreset(preset, rotWithShape) {
    const rotAttr = rotWithShape !== false ? '1' : '0';
    // Parse preset name: e.g., 'lightGradient-accent1' → type='lightGradient', accent='accent1'
    const parts = preset.split('-');
    const presetType = parts[0];
    const accentColor = parts[1] || 'accent1';
    // Generate appropriate stops based on preset type
    let stops = [];
    let angle = 0;
    switch (presetType) {
        case 'lightGradient':
            // Light gradient: white → accent color (45°)
            stops = [
                { position: 0, color: 'FFFFFF' },
                { position: 100, color: accentColor }
            ];
            angle = 45;
            break;
        case 'topSpotlight':
            // Top spotlight: transparent accent → solid accent (radial from top)
            stops = [
                { position: 0, color: accentColor, transparency: 0 },
                { position: 100, color: accentColor, transparency: 80 }
            ];
            // Return path gradient
            let strXml = `<a:gradFill rotWithShape="${rotAttr}" flip="none">`;
            strXml += '<a:gsLst>';
            for (const stop of stops) {
                const pos = Math.round(stop.position * 1000);
                const innerElements = stop.transparency ? `<a:alpha val="${Math.round((100 - stop.transparency) * 1000)}"/>` : '';
                strXml += `<a:gs pos="${pos}">${createColorElement(stop.color, innerElements)}</a:gs>`;
            }
            strXml += '</a:gsLst>';
            strXml += '<a:path path="circle"><a:fillToRect l="50000" t="0" r="50000" b="100000"/></a:path>';
            strXml += '</a:gradFill>';
            return strXml;
        case 'bottomSpotlight':
            // Bottom spotlight
            stops = [
                { position: 0, color: accentColor, transparency: 0 },
                { position: 100, color: accentColor, transparency: 80 }
            ];
            let strXmlBottom = `<a:gradFill rotWithShape="${rotAttr}" flip="none">`;
            strXmlBottom += '<a:gsLst>';
            for (const stop of stops) {
                const pos = Math.round(stop.position * 1000);
                const innerElements = stop.transparency ? `<a:alpha val="${Math.round((100 - stop.transparency) * 1000)}"/>` : '';
                strXmlBottom += `<a:gs pos="${pos}">${createColorElement(stop.color, innerElements)}</a:gs>`;
            }
            strXmlBottom += '</a:gsLst>';
            strXmlBottom += '<a:path path="circle"><a:fillToRect l="50000" t="100000" r="50000" b="0"/></a:path>';
            strXmlBottom += '</a:gradFill>';
            return strXmlBottom;
        default:
            // Default linear gradient
            stops = [
                { position: 0, color: 'FFFFFF' },
                { position: 100, color: accentColor }
            ];
            angle = 90;
    }
    // Generate linear gradient XML
    let strXmlLinear = `<a:gradFill rotWithShape="${rotAttr}" flip="none">`;
    strXmlLinear += '<a:gsLst>';
    for (const stop of stops) {
        const pos = Math.round(stop.position * 1000);
        const innerElements = stop.transparency ? `<a:alpha val="${Math.round((100 - stop.transparency) * 1000)}"/>` : '';
        strXmlLinear += `<a:gs pos="${pos}">${createColorElement(stop.color, innerElements)}</a:gs>`;
    }
    strXmlLinear += '</a:gsLst>';
    strXmlLinear += `<a:lin ang="${angle * 60000}" scaled="0"/>`;
    strXmlLinear += '</a:gradFill>';
    return strXmlLinear;
}
/**
 * Create color selection
 * @param {Color | ShapeFillProps | ShapeLineProps} props fill props
 * @returns XML string
 */
export function genXmlColorSelection(props) {
    let fillType = 'solid';
    let colorVal = '';
    let internalElements = '';
    let outText = '';
    if (props) {
        if (typeof props === 'string')
            colorVal = props;
        else {
            if (props.type)
                fillType = props.type;
            if (props.color)
                colorVal = props.color;
            if (props.alpha)
                internalElements += `<a:alpha val="${Math.round((100 - props.alpha) * 1000)}"/>`; // DEPRECATED: @deprecated v3.3.0
            if (props.transparency)
                internalElements += `<a:alpha val="${Math.round((100 - props.transparency) * 1000)}"/>`;
        }
        switch (fillType) {
            case 'solid':
                outText += `<a:solidFill>${createColorElement(colorVal, internalElements)}</a:solidFill>`;
                break;
            case 'gradient':
                outText += genXmlGradientFill(props);
                break;
            case 'none':
                outText += '<a:noFill/>';
                break;
            default: // @note need a statement as having only "break" is removed by rollup, then tiggers "no-default" js-linter
                outText += '';
                break;
        }
    }
    return outText;
}
/**
 * Get a new rel ID (rId) for charts, media, etc.
 * @param {PresSlide} target - the slide to use
 * @returns {number} count of all current rels plus 1 for the caller to use as its "rId"
 */
export function getNewRelId(target) {
    const rawRels = Array.isArray(target._rawRels)
        ? target._rawRels
        : [];
    const rawMax = rawRels.reduce((maxId, rel) => {
        const id = (rel === null || rel === void 0 ? void 0 : rel.id) || '';
        const n = id.startsWith('rId') ? Number(id.substring(3)) : Number(id);
        return Number.isFinite(n) ? Math.max(maxId, n) : maxId;
    }, 0);
    const normalMax = [
        ...(target._rels || []).map(rel => rel.rId),
        ...(target._relsChart || []).map(rel => rel.rId),
        ...(target._relsMedia || []).map(rel => rel.rId),
    ].reduce((maxId, rId) => Math.max(maxId, Number(rId) || 0), 0);
    return Math.max(rawMax, normalMax) + 1;
}
/**
 * Checks shadow options passed by user and performs corrections if needed.
 * @param {ShadowProps} ShadowProps - shadow options
 */
export function correctShadowOptions(ShadowProps) {
    if (!ShadowProps || typeof ShadowProps !== 'object') {
        // console.warn("`shadow` options must be an object. Ex: `{shadow: {type:'none'}}`")
        return;
    }
    // OPT: `type`
    if (ShadowProps.type !== 'outer' && ShadowProps.type !== 'inner' && ShadowProps.type !== 'none') {
        console.warn('Warning: shadow.type options are `outer`, `inner` or `none`.');
        ShadowProps.type = 'outer';
    }
    // OPT: `angle`
    if (ShadowProps.angle) {
        // A: REALITY-CHECK
        if (isNaN(Number(ShadowProps.angle)) || ShadowProps.angle < 0 || ShadowProps.angle > 359) {
            console.warn('Warning: shadow.angle can only be 0-359');
            ShadowProps.angle = 270;
        }
        // B: ROBUST: Cast any type of valid arg to int: '12', 12.3, etc. -> 12
        ShadowProps.angle = Math.round(Number(ShadowProps.angle));
    }
    // OPT: `opacity`
    if (ShadowProps.opacity !== undefined && ShadowProps.opacity !== null) {
        ShadowProps.opacity = normalizeOpacityValue(ShadowProps.opacity, 0.75, 'shadow.opacity');
    }
    // OPT: `color`
    if (ShadowProps.color) {
        // INCORRECT FORMAT (only applies to string hex colors, not preset color objects)
        if (typeof ShadowProps.color === 'string' && ShadowProps.color.startsWith('#')) {
            console.warn('Warning: shadow.color should not include hash (#) character, , e.g. "FF0000"');
            ShadowProps.color = ShadowProps.color.replace('#', '');
        }
    }
    return ShadowProps;
}
//# sourceMappingURL=gen-utils.js.map