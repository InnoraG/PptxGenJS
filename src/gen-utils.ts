/**
 * PptxGenJS: Utility Methods
 */

import { EMU, REGEX_HEX_COLOR, DEF_FONT_COLOR, ONEPT, SCHEME_COLORS } from './core-enums'
import { PresLayout, TextGlowProps, TextReflectionProps, Text3DProps, PresSlide, SlideLayout, ShapeFillProps, Color, ShapeLineProps, Coord, ShadowProps, GradientStopProps, PictureStyleColorProps } from './core-interfaces'
import { normalizeGradientDirection, normalizeScene3DRotationDegrees, normalizeWordArtAdjustments, normalizeWordArtTransform } from './option-registry'

export { getOptionCatalog, normalizeGradientDirection, normalizeWordArtAdjustments, normalizeWordArtTransform } from './option-registry'

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
export function getSmartParseNumber(size: Coord, xyDir: 'X' | 'Y', layout: PresLayout): number {
	// FIRST: Convert string numeric value if reqd
	if (typeof size === 'string' && !isNaN(Number(size))) size = Number(size)

	// CASE 1: Number in inches
	// Assume any number less than 100 is inches
	if (typeof size === 'number' && size < 100) return inch2Emu(size)

	// CASE 2: Number is already converted to something other than inches
	// Assume any number greater than 100 sure isnt inches! Just return it (assume value is EMU already).
	if (typeof size === 'number' && size >= 100) return size

	// CASE 3: Percentage (ex: '50%')
	if (typeof size === 'string' && size.includes('%')) {
		if (xyDir && xyDir === 'X') return Math.round((parseFloat(size) / 100) * layout.width)
		if (xyDir && xyDir === 'Y') return Math.round((parseFloat(size) / 100) * layout.height)

		// Default: Assume width (x/cx)
		return Math.round((parseFloat(size) / 100) * layout.width)
	}

	// LAST: Default value
	return 0
}

/**
 * Basic UUID Generator Adapted
 * @link https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript#answer-2117523
 * @param {string} uuidFormat - UUID format
 * @returns {string} UUID
 */
export function getUuid(uuidFormat: string): string {
	return uuidFormat.replace(/[xy]/g, function (c) {
		const r = (Math.random() * 16) | 0
		const v = c === 'x' ? r : (r & 0x3) | 0x8
		return v.toString(16)
	})
}

/**
 * Replace special XML characters with HTML-encoded strings
 * @param {string} xml - XML string to encode
 * @returns {string} escaped XML
 */
export function encodeXmlEntities(xml: string): string {
	// NOTE: Dont use short-circuit eval here as value c/b "0" (zero) etc.!
	if (typeof xml === 'undefined' || xml == null) return ''
	return xml.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/**
 * Convert inches into EMU
 * @param {number|string} inches - as string or number
 * @returns {number} EMU value
 */
export function inch2Emu(inches: number | string): number {
	// NOTE: Provide Caller Safety: Numbers may get conv<->conv during flight, so be kind and do some simple checks to ensure inches were passed
	// Any value over 100 damn sure isnt inches, so lets assume its in EMU already, therefore, just return the same value
	if (typeof inches === 'number' && inches > 100) return inches
	if (typeof inches === 'string') inches = Number(inches.replace(/in*/gi, ''))
	return Math.round(EMU * inches)
}

/**
 * Convert `pt` into points (using `ONEPT`)
 * @param {number|string} pt
 * @returns {number} value in points (`ONEPT`)
 */
export function valToPts(pt: number | string): number {
	const points = Number(pt) || 0
	return isNaN(points) ? 0 : Math.round(points * ONEPT)
}

/**
 * Convert degrees (0..360) to PowerPoint `rot` value
 * @param {number} d degrees
 * @returns {number} calculated `rot` value
 */
export function convertRotationDegrees(d: number): number {
	d = d || 0
	return Math.round((d > 360 ? d - 360 : d) * 60000)
}

const convertScene3DRotationDegrees = (d: number | undefined, label: string, prefix = 'options.text3D'): number => normalizeScene3DRotationDegrees(d, `${prefix}.${label}`)

const TEXT_3D_KEYS = new Set(['bevel', 'bevelBottom', 'extrusion', 'extrusionColor', 'contourWidth', 'contourColor', 'material', 'lightRig', 'lightDirection', 'rotationX', 'rotationY', 'rotationZ', 'perspective'])
const TEXT_3D_BEVELS = new Set(['angle', 'artDeco', 'circle', 'convex', 'coolSlant', 'cross', 'divot', 'hardEdge', 'relaxedInset', 'riblet', 'slope', 'softRound'])
const TEXT_3D_MATERIALS = new Set(['clear', 'dkEdge', 'flat', 'legacyMatte', 'legacyMetal', 'legacyPlastic', 'legacyWireframe', 'matte', 'metal', 'plastic', 'powder', 'softEdge', 'softmetal', 'translucentPowder', 'warmMatte'])
const TEXT_3D_LIGHT_RIGS = new Set(['balanced', 'brightRoom', 'chilly', 'contrasting', 'flat', 'flood', 'freezing', 'glow', 'harsh', 'legacyFlat1', 'legacyFlat2', 'legacyFlat3', 'legacyFlat4', 'legacyHarsh1', 'legacyHarsh2', 'legacyHarsh3', 'legacyHarsh4', 'legacyNormal1', 'legacyNormal2', 'legacyNormal3', 'legacyNormal4', 'morning', 'soft', 'sunrise', 'sunset', 'threePt', 'twoPt'])

function assertText3DNumber(value: unknown, field: string, minimum: number, maximum: number): void {
	if (value === undefined) return
	if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${field} must be a finite number between ${minimum} and ${maximum}.`)
}

function assertText3DBevel(value: unknown, field: string): void {
	if (value === undefined) return
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} must be an object.`)
	const bevel = value as Record<string, unknown>
	for (const key of Object.keys(bevel)) if (!['type', 'width', 'height'].includes(key)) throw new Error(`${field}.${key} is not supported.`)
	if (bevel.type !== undefined && (typeof bevel.type !== 'string' || !TEXT_3D_BEVELS.has(bevel.type))) throw new Error(`${field}.type is not a supported native bevel preset.`)
	assertText3DNumber(bevel.width, `${field}.width`, 0, 1000)
	assertText3DNumber(bevel.height, `${field}.height`, 0, 1000)
}

function assertText3DOptions(options: Text3DProps, field: string): void {
	if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error(`${field} must be an object.`)
	for (const key of Object.keys(options)) if (!TEXT_3D_KEYS.has(key)) throw new Error(`${field}.${key} is not supported.`)
	assertText3DBevel(options.bevel, `${field}.bevel`)
	assertText3DBevel(options.bevelBottom, `${field}.bevelBottom`)
	assertText3DNumber(options.extrusion, `${field}.extrusion`, 0, 5000)
	assertText3DNumber(options.contourWidth, `${field}.contourWidth`, 0, 1000)
	assertText3DNumber(options.lightDirection, `${field}.lightDirection`, 0, 359)
	assertText3DNumber(options.rotationX, `${field}.rotationX`, -360, 360)
	assertText3DNumber(options.rotationY, `${field}.rotationY`, -360, 360)
	assertText3DNumber(options.rotationZ, `${field}.rotationZ`, -360, 360)
	assertText3DNumber(options.perspective, `${field}.perspective`, 0, 120)
	for (const [key, value] of [['extrusionColor', options.extrusionColor], ['contourColor', options.contourColor]] as const) {
		if (value !== undefined && (typeof value !== 'string' || !REGEX_HEX_COLOR.test(value))) throw new Error(`${field}.${key} must be a 6-digit RGB hex color.`)
	}
	if (options.material !== undefined && !TEXT_3D_MATERIALS.has(options.material)) throw new Error(`${field}.material is not a supported native material.`)
	if (options.lightRig !== undefined && !TEXT_3D_LIGHT_RIGS.has(options.lightRig)) throw new Error(`${field}.lightRig is not a supported native light rig.`)
}

function normalizeOpacityValue(value: unknown, fallback: number, label: string): number {
	if (value === undefined || value === null || value === '') return fallback
	const raw = Number(value)
	if (!Number.isFinite(raw)) {
		console.warn(`Warning: ${label} can only be 0-1 or 0-100. ${fallback} used instead.`)
		return fallback
	}
	const scalar = raw > 1 ? raw / 100 : raw
	if (scalar < 0 || scalar > 1) {
		console.warn(`Warning: ${label} can only be 0-1 or 0-100. Value was clamped.`)
	}
	return Math.max(0, Math.min(1, scalar))
}

function opacityToOoxmlAlpha(value: unknown, fallback: number, label: string): number {
	return Math.round(normalizeOpacityValue(value, fallback, label) * 100000)
}

/**
 * Converts component value to hex value
 * @param {number} c - component color
 * @returns {string} hex string
 */
export function componentToHex(c: number): string {
	const hex = c.toString(16)
	return hex.length === 1 ? '0' + hex : hex
}

/**
 * Converts RGB colors from css selectors to Hex for Presentation colors
 * @param {number} r - red value
 * @param {number} g - green value
 * @param {number} b - blue value
 * @returns {string} XML string
 */
export function rgbToHex(r: number, g: number, b: number): string {
	return (componentToHex(r) + componentToHex(g) + componentToHex(b)).toUpperCase()
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

/**
 * Create a DrawingML colour element while preserving optional continuous
 * transforms.  The structured form is shared by Picture Styles and gradient
 * stops so authored tint/shade/saturation/luminance/opacity values never get
 * reduced to a gallery colour token.
 */
export function createColorElement(colorStr: string | SCHEME_COLORS | PictureStyleColorProps, innerElements?: string): string {
	if (colorStr && typeof colorStr === 'object') {
		const structured = colorStr as PictureStyleColorProps
		const base = structured.color ?? structured.scheme ?? structured.preset ?? DEF_FONT_COLOR
		const transforms: string[] = []
		const add = (tag: string, value: unknown, minimum: number, maximum: number) => {
			if (value === undefined || value === null || value === '') return
			const numeric = Number(value)
			if (!Number.isFinite(numeric)) return
			const clamped = Math.max(minimum, Math.min(maximum, numeric))
			transforms.push(`<a:${tag} val="${Math.round(clamped * 100000)}"/>`)
		}
		add('tint', structured.tint, 0, 1)
		add('shade', structured.shade, 0, 1)
		add('satMod', structured.saturation, 0, 4)
		add('lumMod', structured.luminance, 0, 4)
		add('lumOff', structured.luminanceOffset, -1, 1)
		add('alpha', structured.opacity, 0, 1)
		const content = `${transforms.join('')}${innerElements || ''}`
		return createColorElement(String(base), content)
	}
	let colorVal = String(colorStr || '').replace('#', '')
	const schemeColors = new Set<string>([
		'tx1', 'tx2', 'bg1', 'bg2', 'dk1', 'lt1', 'dk2', 'lt2',
		'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6',
		'hlink', 'folHlink', 'phClr',
	])

	// Preset colors (PowerPoint named colors)
	const presetColors = ['black', 'white', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta', 
	                      'gray', 'darkGray', 'lightGray', 'darkRed', 'darkGreen', 'darkBlue',
	                      'darkYellow', 'darkCyan', 'darkMagenta', 'lightRed', 'lightGreen',
	                      'lightBlue', 'lightYellow', 'lightCyan', 'lightMagenta']
	
	// Check if it's a preset color
	if (presetColors.includes(colorVal.toLowerCase())) {
		const colorAttr = 'val="' + colorVal.toLowerCase() + '"'
		return innerElements ? `<a:prstClr ${colorAttr}>${innerElements}</a:prstClr>` : `<a:prstClr ${colorAttr}/>`
	}

	// Check if it's a scheme color or hex
	if (!REGEX_HEX_COLOR.test(colorVal) && !schemeColors.has(colorVal)) {
		console.warn(`"${colorVal}" is not a valid scheme color, preset color, or hex RGB! "${DEF_FONT_COLOR}" used instead. Only provide 6-digit RGB, 'pptx.SchemeColor' values, or preset color names!`)
		colorVal = DEF_FONT_COLOR
	}

	const tagName = REGEX_HEX_COLOR.test(colorVal) ? 'srgbClr' : 'schemeClr'
	const colorAttr = 'val="' + (REGEX_HEX_COLOR.test(colorVal) ? colorVal.toUpperCase() : colorVal) + '"'

	return innerElements ? `<a:${tagName} ${colorAttr}>${innerElements}</a:${tagName}>` : `<a:${tagName} ${colorAttr}/>`
}

/**
 * Creates `a:glow` element
 * @param {TextGlowProps} options glow properties
 * @param {TextGlowProps} defaults defaults for unspecified properties in `opts`
 * @see http://officeopenxml.com/drwSp-effects.php
 * { size: 8, color: 'FFFFFF', opacity: 0.75 };
 */
export function createGlowElement(options: TextGlowProps, defaults: TextGlowProps): string {
	let strXml = ''
	const opts = { ...defaults, ...options }
	// PowerPoint treats a zero-radius glow as a neutral/no-op setting and
	// drops the effect node when the file is saved.  Match that native
	// serialization boundary instead of emitting an empty visual effect.
	if (opts.size <= 0) return strXml
	const size = Math.round(opts.size * ONEPT)
	const color = opts.color
	const opacity = opacityToOoxmlAlpha(opts.opacity, defaults.opacity ?? 0.75, 'options.glow.opacity')

	strXml += `<a:glow rad="${size}">`
	strXml += createColorElement(color, `<a:alpha val="${opacity}"/>`)
	strXml += '</a:glow>'

	return strXml
}

/**
 * Returns whether a glow has a non-neutral radius after applying defaults.
 * This is shared by XML callers so a zero-radius glow does not leave an
 * otherwise-empty effectLst wrapper behind.
 */
export function hasGlowElement(options: TextGlowProps | undefined, defaults: TextGlowProps): boolean {
	if (!options) return false
	const size = options.size ?? defaults.size
	return size > 0
}

/**
 * Creates `a:outerShdw` or `a:innerShdw` element for text shadow effect
 * @param {ShadowProps} options shadow properties
 * @returns {string} XML string for shadow element (without effectLst wrapper)
 * @see http://officeopenxml.com/drwSp-effects.php
 */
/** Map of preset color names to hex equivalents (for use in srgbClr contexts like shadows) */
const PRESET_COLOR_HEX_MAP: Record<string, string> = {
	black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF',
	yellow: 'FFFF00', cyan: '00FFFF', magenta: 'FF00FF', gray: '808080',
	darkGray: 'A9A9A9', lightGray: 'D3D3D3', darkRed: '8B0000', darkGreen: '006400',
	darkBlue: '00008B', darkYellow: '808000', darkCyan: '008B8B', darkMagenta: '8B008B',
	lightRed: 'FF6666', lightGreen: '90EE90', lightBlue: 'ADD8E6',
	lightYellow: 'FFFFE0', lightCyan: 'E0FFFF', lightMagenta: 'FF80FF',
}

export function createShadowElement(options: ShadowProps): string {
	if (!options || options.type === 'none') {
		return ''
	}

	const type = options.type || 'outer'
	const blur = Math.round((options.blur ?? 4) * ONEPT)
	const offset = Math.round((options.offset ?? 3) * ONEPT)
	const angle = Math.round((options.angle ?? 45) * 60000)
	const rawColor = options.color ?? '000000'
	const opacity = opacityToOoxmlAlpha(options.opacity, 0.5, 'options.shadow.opacity')
	const rotShape = options.rotateWithShape ? 1 : 0

	// Determine color XML: support preset color objects { type: 'preset', preset: 'black' } or hex strings
	let colorXml: string
	if (rawColor && typeof rawColor === 'object' && (rawColor as any).type === 'preset') {
		// Use prstClr element to match native PowerPoint output
		const presetVal = (rawColor as any).preset
		colorXml = `<a:prstClr val="${presetVal}"><a:alpha val="${opacity}"/></a:prstClr>`
	} else {
		// Hex color: convert preset name to hex if needed, then emit srgbClr
		const colorStr = typeof rawColor === 'string' ? rawColor : '000000'
		const color = PRESET_COLOR_HEX_MAP[colorStr.toLowerCase()] ?? colorStr.replace('#', '')
		colorXml = `<a:srgbClr val="${color.toUpperCase()}"><a:alpha val="${opacity}"/></a:srgbClr>`
	}

	// The outer-shadow carrier exposes the same transform sliders as the
	// Picture Format effect dialog: scale, skew, alignment, and rotation. Keep
	// them on the native text-run shadow instead of silently collapsing those
	// authored values to the basic blur/distance/angle subset. Inner shadows do
	// not define these transform attributes in the OOXML schema.
	const transformAttrs = type === 'outer'
		? ` sx="${Math.round((options.scaleX ?? 1) * 100000)}" sy="${Math.round((options.scaleY ?? 1) * 100000)}" kx="${Math.round((options.skewX ?? 0) * 60000)}" ky="${Math.round((options.skewY ?? 0) * 60000)}" algn="bl"`
		: ''
	let strXml = `<a:${type}Shdw${transformAttrs} blurRad="${blur}" dist="${offset}" dir="${angle}" rotWithShape="${rotShape}">`
	strXml += colorXml
	strXml += `</a:${type}Shdw>`

	return strXml
}

/**
 * Creates `a:reflection` element for text reflection effect
 * @param {TextReflectionProps} options reflection properties
 * @returns {string} XML string for <a:reflection>
 * @see https://docs.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.reflection
 */
export function createReflectionElement(options: TextReflectionProps): string {
	// Defaults based on PowerPoint's "Tight Reflection Touching" preset
	const blur = Math.round((options.blur ?? 0) * ONEPT)
	const offset = Math.round((options.offset ?? 0) * ONEPT)
	const startOpacity = opacityToOoxmlAlpha(options.opacity, 0.5, 'options.reflection.opacity')
	const endOpacity = opacityToOoxmlAlpha(options.endOpacity, 0, 'options.reflection.endOpacity')
	const fadeStart = Math.round((options.fadeStart ?? 0) * 1000) // percentage in 1000ths
	const fadeEnd = Math.round((options.fadeEnd ?? 100) * 1000) // percentage in 1000ths
	const angle = Math.round((options.angle ?? 90) * 60000) // degrees in 60000ths
	const scaleY = Math.round((options.scaleY ?? -100) * 1000) // percentage in 1000ths

	return `<a:reflection blurRad="${blur}" stA="${startOpacity}" endA="${endOpacity}" stPos="${fadeStart}" endPos="${fadeEnd}" dist="${offset}" dir="${angle}" sy="${scaleY}" algn="bl" rotWithShape="0"/>`
}

/**
 * Creates 3D scene and shape properties for text 3D effects
 * @param {Text3DProps} options 3D properties
 * @returns {string} XML string for <a:scene3d> and <a:sp3d>
 */
export function create3DElements(options: Text3DProps): string {
	assertText3DOptions(options, 'options.effect3D')
	let strXml = ''

	// Scene 3D (camera and lighting setup)
	const lightRig = options.lightRig ?? 'threePt'
	const lightDir = convertScene3DRotationDegrees(options.lightDirection, 'lightDirection', 'options.effect3D')
	
	// Check if rotation is specified - if so, use perspective camera with rotation
	const hasRotation = options.rotationX !== undefined || options.rotationY !== undefined || options.rotationZ !== undefined
	const hasPerspective = options.perspective !== undefined && options.perspective !== 0
	
	strXml += '<a:scene3d>'
	
	if (hasRotation || hasPerspective) {
		// PowerPoint's public X/Y/Z controls map to the DrawingML camera tuple as
		// lon=-X, lat=Y, rev=-Z. Keep that conversion here so callers use the
		// familiar UI axes while the package receives PowerPoint's native axes.
		const cameraLat = convertScene3DRotationDegrees(options.rotationY, 'rotationY', 'options.effect3D')
		const cameraLon = convertScene3DRotationDegrees(-(options.rotationX ?? 0), 'rotationX', 'options.effect3D')
		const cameraRev = convertScene3DRotationDegrees(-(options.rotationZ ?? 0), 'rotationZ', 'options.effect3D')
		const fov = Math.round((options.perspective ?? 45) * 60000)
		
		// Use perspectiveFront camera preset with rotation
		strXml += `<a:camera prst="perspectiveFront" fov="${fov}">`
		if (hasRotation) strXml += `<a:rot lat="${cameraLat}" lon="${cameraLon}" rev="${cameraRev}"/>`
		strXml += '</a:camera>'
	} else {
		// Default orthographic camera (flat view)
		strXml += '<a:camera prst="orthographicFront"/>'
	}
	
	strXml += `<a:lightRig rig="${lightRig}" dir="t">`
	if (lightDir !== 0) strXml += `<a:rot lat="0" lon="0" rev="${lightDir}"/>`
	strXml += '</a:lightRig></a:scene3d>'

	// Shape 3D (bevel, extrusion, material)
	// Note: Don't add default material - PowerPoint removes it when saving
	const sp3dAttrs: string[] = []
	if (options.extrusion != null) sp3dAttrs.push(`extrusionH="${Math.round(options.extrusion * ONEPT)}"`)
	if (options.contourWidth != null) sp3dAttrs.push(`contourW="${Math.round(options.contourWidth * ONEPT)}"`)
	if (options.material) sp3dAttrs.push(`prstMaterial="${options.material}"`)
	strXml += `<a:sp3d${sp3dAttrs.length ? ` ${sp3dAttrs.join(' ')}` : ''}>`

	// Top bevel
	if (options.bevel) {
		const bevelW = Math.round((options.bevel.width ?? 6) * ONEPT)
		const bevelH = Math.round((options.bevel.height ?? 6) * ONEPT)
		strXml += `<a:bevelT w="${bevelW}" h="${bevelH}"`
		// Note: Don't add default prst - PowerPoint removes it when saving
		if (options.bevel.type) strXml += ` prst="${options.bevel.type}"`
		strXml += '/>'
	}

	// Bottom bevel
	if (options.bevelBottom) {
		const bevelW = Math.round((options.bevelBottom.width ?? 6) * ONEPT)
		const bevelH = Math.round((options.bevelBottom.height ?? 6) * ONEPT)
		strXml += `<a:bevelB w="${bevelW}" h="${bevelH}"`
		// Note: Don't add default prst - PowerPoint removes it when saving
		if (options.bevelBottom.type) strXml += ` prst="${options.bevelBottom.type}"`
		strXml += '/>'
	}

	// Extrusion (depth)
	if (options.extrusionColor != null) strXml += `<a:extrusionClr><a:srgbClr val="${options.extrusionColor}"/></a:extrusionClr>`

	// Contour
	if (options.contourColor != null) strXml += `<a:contourClr><a:srgbClr val="${options.contourColor}"/></a:contourClr>`

	strXml += '</a:sp3d>'

	return strXml
}

/**
 * Creates 3D elements specifically for text body (inside <a:bodyPr>)
 * This is different from shape-level 3D - text 3D affects the text characters themselves
 * Text 3D goes inside <a:bodyPr> while shape 3D goes in <p:spPr>
 * @param {Text3DProps} options 3D effect properties for text
 * @returns {string} XML string containing scene3d and sp3d elements for text body
 */
export function createText3DElements(options: Text3DProps): string {
	if (!options) return ''
	assertText3DOptions(options, 'options.text3D')

	let strXml = ''

	// Scene 3D with camera and light rig for text rotation
	const cameraLat = options.rotationY != null ? convertScene3DRotationDegrees(options.rotationY, 'rotationY') : 0
	const cameraLon = options.rotationX != null ? convertScene3DRotationDegrees(-options.rotationX, 'rotationX') : 0
	const cameraRev = options.rotationZ != null ? convertScene3DRotationDegrees(-options.rotationZ, 'rotationZ') : 0
	const lightDirection = options.lightDirection != null ? convertScene3DRotationDegrees(options.lightDirection, 'lightDirection') : 0
	const perspective = options.perspective != null ? Math.round(options.perspective * 60000) : 0
	const lightRig = options.lightRig || 'threePt'
	const material = options.material || 'warmMatte'

	// Add scene3d if there's any 3D configuration
	const hasRotation = cameraLat !== 0 || cameraLon !== 0 || cameraRev !== 0
	const hasBevel = options.bevel != null
	const hasBottomBevel = options.bevelBottom != null
	const hasExtrusion = options.extrusion != null
	const hasText3DFormat = hasBevel || hasBottomBevel || hasExtrusion || options.extrusionColor != null || options.contourWidth != null || options.contourColor != null || options.material != null || options.lightRig != null

	if (hasRotation || hasText3DFormat || lightDirection !== 0 || perspective !== 0) {
		strXml += '<a:scene3d>'
		strXml += `<a:camera prst="${perspective !== 0 ? 'perspectiveFront' : 'orthographicFront'}"`
		if (perspective !== 0) {
			strXml += ` fov="${perspective}"`
		}
		strXml += '>'
		if (hasRotation) {
			strXml += `<a:rot lat="${cameraLat}" lon="${cameraLon}" rev="${cameraRev}"/>`
		}
		strXml += '</a:camera>'
		strXml += `<a:lightRig rig="${lightRig}" dir="t">`
		if (lightDirection !== 0) strXml += `<a:rot lat="0" lon="0" rev="${lightDirection}"/>`
		strXml += '</a:lightRig>'
		strXml += '</a:scene3d>'

		// Text 3D properties (sp3d inside bodyPr for text-specific effects)
		// Note: Don't add default material - PowerPoint removes it when saving
		const sp3dAttrs: string[] = []
		if (hasExtrusion) sp3dAttrs.push(`extrusionH="${Math.round(options.extrusion * ONEPT)}"`)
		if (options.contourWidth != null) sp3dAttrs.push(`contourW="${Math.round(options.contourWidth * ONEPT)}"`)
		if (options.material) sp3dAttrs.push(`prstMaterial="${options.material}"`)
		strXml += `<a:sp3d${sp3dAttrs.length ? ` ${sp3dAttrs.join(' ')}` : ''}>`

		// Top bevel for text
		if (hasBevel) {
			const bevelW = Math.round((options.bevel.width ?? 6) * ONEPT)
			const bevelH = Math.round((options.bevel.height ?? 6) * ONEPT)
			strXml += `<a:bevelT w="${bevelW}" h="${bevelH}"`
			// Note: Don't add default prst - PowerPoint removes it when saving
			if (options.bevel.type) strXml += ` prst="${options.bevel.type}"`
			strXml += '/>'
		}

		// Bottom bevel is a separate PowerPoint 3-D Format control. Keep it
		// independent from the top bevel so a typed edit does not collapse the
		// two native DrawingML leaves into one preset approximation.
		if (options.bevelBottom) {
			const bevelW = Math.round((options.bevelBottom.width ?? 6) * ONEPT)
			const bevelH = Math.round((options.bevelBottom.height ?? 6) * ONEPT)
			strXml += `<a:bevelB w="${bevelW}" h="${bevelH}"`
			if (options.bevelBottom.type) strXml += ` prst="${options.bevelBottom.type}"`
			strXml += '/>'
		}

		// Extrusion for text depth
		if (options.extrusionColor != null) strXml += `<a:extrusionClr><a:srgbClr val="${options.extrusionColor}"/></a:extrusionClr>`

		// Contour is another independent 3-D Format control. Serialize both the
		// measured width and its authored color when present.
		if (options.contourColor != null) strXml += `<a:contourClr><a:srgbClr val="${options.contourColor}"/></a:contourClr>`

		strXml += '</a:sp3d>'
	}

	return strXml
}

/**
 * Generate gradient fill XML (a:gradFill)
 * @param {ShapeFillProps} props - fill properties with gradient settings
 * @returns {string} XML string for <a:gradFill>
 * @see http://www.datypic.com/sc/ooxml/e-a_gradFill-1.html
 */
export function genXmlGradientFill(props: ShapeFillProps): string {
	// Handle preset gradients
	if (props.gradientPreset) {
		return genXmlGradientPreset(props.gradientPreset, props.rotateGradientWithShape)
	}

	// Validate: must have gradient stops
	if (!props.gradientStops || props.gradientStops.length < 2) {
		console.warn('Gradient fill requires at least 2 gradient stops. Using default solid fill.')
		return ''
	}

	const rotWithShape = props.rotateGradientWithShape !== false ? '1' : '0'
	const flip = props.gradientFlip || 'none'

	let strXml = `<a:gradFill rotWithShape="${rotWithShape}" flip="${flip}">`

	// Gradient stops (<a:gsLst>)
	strXml += '<a:gsLst>'
	for (let idx = 0; idx < props.gradientStops.length; idx++) {
		const stop = props.gradientStops[idx] as GradientStopProps & { pos?: number }
		const rawPosition = typeof stop.position === 'number' ? stop.position : stop.pos
		const fallbackPosition = props.gradientStops.length === 1 ? 0 : (idx / (props.gradientStops.length - 1)) * 100
		const stopPosition = Number.isFinite(rawPosition) ? rawPosition : fallbackPosition
		// Position: 0-100 -> 0-100000. Never emit NaN; PowerPoint treats that as package corruption.
		const pos = Math.round(Math.max(0, Math.min(100, stopPosition)) * 1000)
		let innerElements = ''

		// Add transparency if specified
		if (stop.transparency != null && stop.transparency > 0) {
			const alpha = Math.round((100 - Math.max(0, Math.min(100, stop.transparency))) * 1000)
			innerElements = `<a:alpha val="${alpha}"/>`
		}

		strXml += `<a:gs pos="${pos}">`
		// A legacy stop-level transparency is the authoritative alpha control.
		// Do not emit a second alpha child when a structured colour also carries
		// opacity; PowerPoint keeps only one effective alpha transform.
		const color = stop.transparency != null && stop.color && typeof stop.color === 'object'
			? { ...(stop.color as PictureStyleColorProps), opacity: undefined }
			: stop.color
		strXml += createColorElement(color, innerElements)
		strXml += '</a:gs>'
	}
	strXml += '</a:gsLst>'

	// Direction: linear or valid DrawingML path gradient.
	const direction = normalizeGradientDirection((props as ShapeFillProps & { gradientDirection?: unknown }).gradientDirection)

	if (direction === 'linear') {
		// Linear gradient: angle in 60000ths of a degree
		// DrawingML ST_PositiveFixedAngle is max-exclusive at 360 degrees.
		// Normalize defensively here as this serializer is also used outside the
		// public validation boundary (for example, by direct library callers).
		const authoredAngle = Number(props.gradientAngle ?? 0)
		const angle = Number.isFinite(authoredAngle) ? ((authoredAngle % 360) + 360) % 360 : 0
		const ang = Math.min(21599999, Math.round(angle * 60000))
		strXml += `<a:lin ang="${ang}" scaled="0"/>`
	} else {
		// Path gradient: circle, rect, or shape
		strXml += `<a:path path="${direction}">`

		// Fill-to-rect (focus rectangle for path gradients)
		if (props.fillToRect) {
			const r = props.fillToRect
			const l = Math.round((r.l || 0) * 1000)
			const t = Math.round((r.t || 0) * 1000)
			const rt = Math.round((r.r || 0) * 1000)
			const b = Math.round((r.b || 0) * 1000)
			strXml += `<a:fillToRect l="${l}" t="${t}" r="${rt}" b="${b}"/>`
		}

		strXml += '</a:path>'
	}

	// Tile rect (optional)
	if (props.tileRect) {
		const tr = props.tileRect
		const l = Math.round((tr.l || 0) * 1000)
		const t = Math.round((tr.t || 0) * 1000)
		const r = Math.round((tr.r || 0) * 1000)
		const b = Math.round((tr.b || 0) * 1000)
		strXml += `<a:tileRect l="${l}" t="${t}" r="${r}" b="${b}"/>`
	}

	strXml += '</a:gradFill>'
	return strXml
}

/**
 * Generate preset gradient XML
 * @param {string} preset - preset gradient name
 * @param {boolean} rotWithShape - rotate with shape
 * @returns {string} XML string
 */
function genXmlGradientPreset(preset: string, rotWithShape?: boolean): string {
	const rotAttr = rotWithShape !== false ? '1' : '0'

	// Parse preset name: e.g., 'lightGradient-accent1' → type='lightGradient', accent='accent1'
	const parts = preset.split('-')
	const presetType = parts[0]
	const accentColor = parts[1] || 'accent1'

	// Generate appropriate stops based on preset type
	let stops: GradientStopProps[] = []
	let angle = 0

	switch (presetType) {
		case 'lightGradient':
			// Light gradient: white → accent color (45°)
			stops = [
				{ position: 0, color: 'FFFFFF' },
				{ position: 100, color: accentColor as any }
			]
			angle = 45
			break
		case 'topSpotlight':
			// Top spotlight: transparent accent → solid accent (radial from top)
			stops = [
				{ position: 0, color: accentColor as any, transparency: 0 },
				{ position: 100, color: accentColor as any, transparency: 80 }
			]
			// Return path gradient
			let strXml = `<a:gradFill rotWithShape="${rotAttr}" flip="none">`
			strXml += '<a:gsLst>'
			for (const stop of stops) {
				const pos = Math.round(stop.position * 1000)
				const innerElements = stop.transparency ? `<a:alpha val="${Math.round((100 - stop.transparency) * 1000)}"/>` : ''
				strXml += `<a:gs pos="${pos}">${createColorElement(stop.color, innerElements)}</a:gs>`
			}
			strXml += '</a:gsLst>'
			strXml += '<a:path path="circle"><a:fillToRect l="50000" t="0" r="50000" b="100000"/></a:path>'
			strXml += '</a:gradFill>'
			return strXml
		case 'bottomSpotlight':
			// Bottom spotlight
			stops = [
				{ position: 0, color: accentColor as any, transparency: 0 },
				{ position: 100, color: accentColor as any, transparency: 80 }
			]
			let strXmlBottom = `<a:gradFill rotWithShape="${rotAttr}" flip="none">`
			strXmlBottom += '<a:gsLst>'
			for (const stop of stops) {
				const pos = Math.round(stop.position * 1000)
				const innerElements = stop.transparency ? `<a:alpha val="${Math.round((100 - stop.transparency) * 1000)}"/>` : ''
				strXmlBottom += `<a:gs pos="${pos}">${createColorElement(stop.color, innerElements)}</a:gs>`
			}
			strXmlBottom += '</a:gsLst>'
			strXmlBottom += '<a:path path="circle"><a:fillToRect l="50000" t="100000" r="50000" b="0"/></a:path>'
			strXmlBottom += '</a:gradFill>'
			return strXmlBottom
		default:
			// Default linear gradient
			stops = [
				{ position: 0, color: 'FFFFFF' },
				{ position: 100, color: accentColor as any }
			]
			angle = 90
	}

	// Generate linear gradient XML
	let strXmlLinear = `<a:gradFill rotWithShape="${rotAttr}" flip="none">`
	strXmlLinear += '<a:gsLst>'
	for (const stop of stops) {
		const pos = Math.round(stop.position * 1000)
		const innerElements = stop.transparency ? `<a:alpha val="${Math.round((100 - stop.transparency) * 1000)}"/>` : ''
		strXmlLinear += `<a:gs pos="${pos}">${createColorElement(stop.color, innerElements)}</a:gs>`
	}
	strXmlLinear += '</a:gsLst>'
	strXmlLinear += `<a:lin ang="${angle * 60000}" scaled="0"/>`
	strXmlLinear += '</a:gradFill>'
	return strXmlLinear
}

const BLIP_ALIGN = new Set(['tl', 't', 'tr', 'l', 'ctr', 'r', 'bl', 'b', 'br'])
const BLIP_FLIP = new Set(['none', 'x', 'y', 'xy'])

function genXmlBlipFill(props: ShapeFillProps): string {
	const rid = Number(props._blipRid)
	if (!Number.isFinite(rid) || rid < 1) return '<a:noFill/>'
	const tex = props.texture || {}
	const placement = tex.placement || {}
	const rotate = placement.rotateWithShape ?? tex.rotateWithShape
	const rotAttr = rotate === false ? '0' : '1'
	const transparency = Number(tex.transparency ?? props.transparency ?? 0)
	const alpha = Number.isFinite(transparency) && transparency > 0
		? `<a:alpha val="${Math.round((100 - (transparency <= 1 ? transparency * 100 : transparency)) * 1000)}"/>`
		: ''
	const mode = String(placement.mode || (tex.tile === false || props.type === 'picture' ? 'stretch' : 'tile')).toLowerCase()
	let placementXml = '<a:stretch><a:fillRect/></a:stretch>'
	if (mode !== 'stretch') {
		const scaleX = Number(placement.scaleX ?? tex.scaleX ?? 1)
		const scaleY = Number(placement.scaleY ?? tex.scaleY ?? 1)
		const sx = Math.round((Number.isFinite(scaleX) ? scaleX : 1) * 100000)
		const sy = Math.round((Number.isFinite(scaleY) ? scaleY : 1) * 100000)
		const offsetX = Number(placement.offsetX ?? tex.offsetX ?? 0)
		const offsetY = Number(placement.offsetY ?? tex.offsetY ?? 0)
		const tx = inch2Emu(Number.isFinite(offsetX) ? offsetX : 0)
		const ty = inch2Emu(Number.isFinite(offsetY) ? offsetY : 0)
		const alignRaw = String(placement.alignment || tex.alignment || 'ctr').toLowerCase()
		const algn = BLIP_ALIGN.has(alignRaw) ? alignRaw : 'ctr'
		const flipRaw = String(placement.flip || tex.flip || 'none').toLowerCase()
		const flip = BLIP_FLIP.has(flipRaw) ? flipRaw : 'none'
		placementXml = `<a:tile tx="${tx}" ty="${ty}" sx="${sx}" sy="${sy}" flip="${flip}" algn="${algn}"/>`
	}
	return `<a:blipFill rotWithShape="${rotAttr}"><a:blip r:embed="rId${rid}">${alpha}</a:blip>${placementXml}</a:blipFill>`
}

/**
 * Create color selection
 * @param {Color | ShapeFillProps | ShapeLineProps} props fill props
 * @returns XML string
 */
export function genXmlColorSelection(props: Color | ShapeFillProps | ShapeLineProps): string {

	let fillType = 'solid'
	let colorVal = ''
	let internalElements = ''
	let outText = ''

	if (props) {
		if (typeof props === 'string') colorVal = props
		else {
			if (props.type) fillType = props.type
			if (props.color) colorVal = props.color
			if (props.alpha) internalElements += `<a:alpha val="${Math.round((100 - props.alpha) * 1000)}"/>` // DEPRECATED: @deprecated v3.3.0
			if (props.transparency) internalElements += `<a:alpha val="${Math.round((100 - props.transparency) * 1000)}"/>`
		}

		switch (fillType) {
			case 'solid':
				outText += `<a:solidFill>${createColorElement(colorVal, internalElements)}</a:solidFill>`
				break
			case 'gradient':
				outText += genXmlGradientFill(props as ShapeFillProps)
				break
			case 'pattern': {
				const pattern = (props as ShapeFillProps).pattern || {}
				const preset = String(pattern.preset || 'pct20')
				const fg = String(pattern.foreground || colorVal || 'FFFFFF').replace('#', '')
				const bg = String(pattern.background || '000000').replace('#', '')
				outText += `<a:pattFill prst="${preset}"><a:fgClr>${createColorElement(fg)}</a:fgClr><a:bgClr>${createColorElement(bg)}</a:bgClr></a:pattFill>`
				break
			}
			case 'texture':
			case 'picture':
				outText += genXmlBlipFill(props as ShapeFillProps)
				break
			case 'none':
				outText += '<a:noFill/>'
				break
			default: // @note need a statement as having only "break" is removed by rollup, then tiggers "no-default" js-linter
				outText += ''
				break
		}
	}

	return outText
}

/**
 * Get a new rel ID (rId) for charts, media, etc.
 * @param {PresSlide|SlideLayout} target - the slide or layout to use
 * @returns {number} count of all current rels plus 1 for the caller to use as its "rId"
 */
export function getNewRelId(target: PresSlide | SlideLayout): number {
	const rawRels = Array.isArray((target as (PresSlide | SlideLayout) & { _rawRels?: Array<{ id?: string }> })._rawRels)
		? (target as (PresSlide | SlideLayout) & { _rawRels: Array<{ id?: string }> })._rawRels
		: []
	const rawMax = rawRels.reduce((maxId, rel) => {
		const id = rel?.id || ''
		const n = id.startsWith('rId') ? Number(id.substring(3)) : Number(id)
		return Number.isFinite(n) ? Math.max(maxId, n) : maxId
	}, 0)
	const normalMax = [
		...(target._rels || []).map(rel => rel.rId),
		...(target._relsChart || []).map(rel => rel.rId),
		...(target._relsMedia || []).map(rel => rel.rId),
	].reduce((maxId, rId) => Math.max(maxId, Number(rId) || 0), 0)
	return Math.max(rawMax, normalMax) + 1
}

/**
 * Checks shadow options passed by user and performs corrections if needed.
 * @param {ShadowProps} ShadowProps - shadow options
 */
export function correctShadowOptions(ShadowProps: ShadowProps): ShadowProps | undefined {
	if (!ShadowProps || typeof ShadowProps !== 'object') {
		// console.warn("`shadow` options must be an object. Ex: `{shadow: {type:'none'}}`")
		return
	}

	// OPT: `type`
	if (ShadowProps.type !== 'outer' && ShadowProps.type !== 'inner' && ShadowProps.type !== 'none') {
		const alias = String(ShadowProps.type || '').toLowerCase()
		if (alias.includes('inner')) ShadowProps.type = 'inner'
		else if (alias === 'none') ShadowProps.type = 'none'
		else ShadowProps.type = 'outer'
	}

	// OPT: `angle`
	if (ShadowProps.angle) {
		// A: REALITY-CHECK
		if (isNaN(Number(ShadowProps.angle)) || ShadowProps.angle < 0 || ShadowProps.angle > 359) {
			console.warn('Warning: shadow.angle can only be 0-359')
			ShadowProps.angle = 270
		}

		// B: ROBUST: Cast any type of valid arg to int: '12', 12.3, etc. -> 12
		ShadowProps.angle = Math.round(Number(ShadowProps.angle))
	}

	// OPT: `opacity`
	if (ShadowProps.opacity !== undefined && ShadowProps.opacity !== null) {
		ShadowProps.opacity = normalizeOpacityValue(ShadowProps.opacity, 0.75, 'shadow.opacity')
	}

	// OPT: `color`
	if (ShadowProps.color) {
		// INCORRECT FORMAT (only applies to string hex colors, not preset color objects)
		if (typeof ShadowProps.color === 'string' && ShadowProps.color.startsWith('#')) {
			console.warn('Warning: shadow.color should not include hash (#) character, , e.g. "FF0000"')
			ShadowProps.color = ShadowProps.color.replace('#', '')
		}
	}

	return ShadowProps
}
