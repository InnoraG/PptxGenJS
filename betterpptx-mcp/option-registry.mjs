import { createHash } from 'node:crypto'

import { TRANSITION_GALLERY_PRESETS } from './source-api-gallery-presets.mjs'
import { ANIMATION_FORMAT_EFFECTS, ANIMATION_FORMAT_PARAMETERS, ANIMATION_FORMAT_TYPES, validateAnimationFormatOptions } from './animation-format-catalog.mjs'
export { ANIMATION_FORMAT_EFFECTS, ANIMATION_FORMAT_PARAMETERS, ANIMATION_FORMAT_TYPES, validateAnimationFormatOptions }
import { MEDIA_FORMAT_EXTENSIONS, MEDIA_FORMAT_PARAMETERS, MEDIA_FORMAT_SCHEMA, MEDIA_FORMAT_SCHEMA_PROPERTIES, MEDIA_FORMAT_SIZING_TYPES, MEDIA_FORMAT_TYPES, validateMediaFormatOptions, validatePublicMediaFormatOptions } from './media-format-catalog.mjs'
export { MEDIA_FORMAT_EXTENSIONS, MEDIA_FORMAT_PARAMETERS, MEDIA_FORMAT_SCHEMA, MEDIA_FORMAT_SCHEMA_PROPERTIES, MEDIA_FORMAT_SIZING_TYPES, MEDIA_FORMAT_TYPES, validateMediaFormatOptions, validatePublicMediaFormatOptions }
import { IMAGE_ACCESSIBILITY_PARAMETERS, validateImageAccessibilityOptions, validateImageAltText } from './image-accessibility-catalog.mjs'
export { IMAGE_ACCESSIBILITY_PARAMETERS, validateImageAccessibilityOptions, validateImageAltText }
import { ACCESSIBILITY_METADATA_PARAMETERS, normalizeAccessibilityMetadata } from './accessibility-metadata-contract.mjs'
export { ACCESSIBILITY_METADATA_PARAMETERS, normalizeAccessibilityMetadata }
import { normalizeImageFraming } from './media-image-formatting-contract.mjs'
import { normalizeHyperlink } from './hyperlink-entry-contract.mjs'
import { normalizeTextFill } from './text-fill-contract.mjs'
export { normalizeTextFill } from './text-fill-contract.mjs'
import { TEXT_3D_BEVEL_PRESETS, TEXT_3D_LIGHT_RIGS, TEXT_3D_MATERIALS, WORDART_TEXT3D_RUNTIME_READY } from './wordart-text3d-contract.mjs'
export { TEXT_3D_BEVEL_PRESETS, TEXT_3D_LIGHT_RIGS, TEXT_3D_MATERIALS } from './wordart-text3d-contract.mjs'
import {
	CONNECTOR_STYLE_CONTRACT,
	CONNECTOR_STYLE_PARAMETERS,
	CONNECTOR_STYLE_PUBLIC_PRESETS,
	normalizeConnectorStyleFormatting,
} from './connector-style-contract.mjs'
export { CONNECTOR_STYLE_CONTRACT, CONNECTOR_STYLE_PARAMETERS, CONNECTOR_STYLE_PUBLIC_PRESETS, normalizeConnectorStyleFormatting }
import { STRUCTURAL_CONTRACT, STRUCTURAL_PARAMETERS } from './structural-authoring-family-contract.mjs'
export { STRUCTURAL_CONTRACT, STRUCTURAL_PARAMETERS }

const GRADIENT_DIRECTION_ALIASES = {
	radial: 'circle',
}

export const GRADIENT_DIRECTIONS = ['linear', 'circle', 'rect', 'shape']

export const TEXT_BULLET_GLYPHS = Object.freeze({
	DEFAULT: '2022',
	CHECK: '2713',
	STAR: '2605',
	TRIANGLE: '25B6',
})

const TEXT_FIELD_GUID = /^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$/i

function deterministicTextFieldGuid(seed) {
	const hex = createHash('sha256').update(`betterpptx:text-field:${seed}`).digest('hex').toUpperCase()
	// Field identifiers are identity tokens, not security UUIDs. Set the familiar
	// RFC variant/version bits so the generated value is accepted consistently by
	// PowerPoint while remaining deterministic across export/recompile.
	const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}${(['8', '9', 'A', 'B'][parseInt(hex[16], 16) % 4])}${hex.slice(17, 32)}`
	return `{${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20, 32)}}`
}

// Model 3-D View gallery tiles are exact discrete selectors, but the native
// carrier also has a portable manual view surface. Keep those controls typed
// beside the gallery instead of hiding them behind private recipe payloads.
// Coordinates are DrawingML EMU-like integers; friendly rotation/FOV values
// use degrees and are quantized to PowerPoint's 1/60000-degree unit by the
// native serializer. Lighting remains a structured array because PowerPoint
// exposes multiple point lights rather than one scalar slider.
export const MODEL3D_VIEW_PARAMETERS = Object.freeze([
	{ id: 'cameraFovDeg', type: 'continuous', valueType: 'number', minimum: 0.01, maximum: 360, default: 34, step: 1 / 60000, unit: 'degrees', semanticPath: 'camera.fov', serializer: 'native am3d:camera/am3d:perspective/@fov', reset: 'set camera.fov to null or omit camera to restore the selected view/default camera', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'cameraPositionXEmu', type: 'continuous', valueType: 'integer', minimum: -2147483648, maximum: 2147483647, default: 0, step: 1, unit: 'EMU', semanticPath: 'camera.pos.x', serializer: 'native am3d:camera/am3d:pos/@x', reset: 'set camera.pos.x to null or omit camera.pos to restore the selected view/default camera', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'cameraPositionYEmu', type: 'continuous', valueType: 'integer', minimum: -2147483648, maximum: 2147483647, default: 0, step: 1, unit: 'EMU', semanticPath: 'camera.pos.y', serializer: 'native am3d:camera/am3d:pos/@y', reset: 'set camera.pos.y to null or omit camera.pos to restore the selected view/default camera', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'cameraPositionZEmu', type: 'continuous', valueType: 'integer', minimum: -2147483648, maximum: 2147483647, default: 96250576, step: 1, unit: 'EMU', semanticPath: 'camera.pos.z', serializer: 'native am3d:camera/am3d:pos/@z', reset: 'set camera.pos.z to null or omit camera.pos to restore the selected view/default camera', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'rotationXDeg', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 1 / 60000, unit: 'degrees', semanticPath: 'trans.rot.x', serializer: 'native am3d:trans/am3d:rot/@ax', reset: 'set trans.rot.x to null or omit trans.rot to restore the selected view/default pose', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'rotationYDeg', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 1 / 60000, unit: 'degrees', semanticPath: 'trans.rot.y', serializer: 'native am3d:trans/am3d:rot/@ay', reset: 'set trans.rot.y to null or omit trans.rot to restore the selected view/default pose', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'rotationZDeg', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 1 / 60000, unit: 'degrees', semanticPath: 'trans.rot.z', serializer: 'native am3d:trans/am3d:rot/@az', reset: 'set trans.rot.z to null or omit trans.rot to restore the selected view/default pose', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'scaleX', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 1, step: 0.000001, unit: 'multiplier', semanticPath: 'trans.scale.x', serializer: 'native am3d:trans/am3d:scale/am3d:sx/@n', reset: 'set trans.scale.x to null or omit trans.scale to restore the selected view/default scale', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'scaleY', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 1, step: 0.000001, unit: 'multiplier', semanticPath: 'trans.scale.y', serializer: 'native am3d:trans/am3d:scale/am3d:sy/@n', reset: 'set trans.scale.y to null or omit trans.scale to restore the selected view/default scale', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'scaleZ', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 1, step: 0.000001, unit: 'multiplier', semanticPath: 'trans.scale.z', serializer: 'native am3d:trans/am3d:scale/am3d:sz/@n', reset: 'set trans.scale.z to null or omit trans.scale to restore the selected view/default scale', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'viewportSizeEmu', type: 'continuous', valueType: 'integer', minimum: 1, maximum: 2147483647, default: 2867650, step: 1, unit: 'EMU', semanticPath: 'objViewport', serializer: 'native am3d:objViewport/@viewportSz', reset: 'set objViewport to null or omit it to restore the engine/default viewport', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'ambientIlluminance', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0.58, step: 0.000001, unit: 'normalized', semanticPath: 'ambientLight.illuminance', serializer: 'native am3d:ambientLight/am3d:illuminance n/d', reset: 'set ambientLight.illuminance to null or omit ambientLight to restore the selected view/default lighting', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'ambientColor', type: 'color', valueType: 'rgb-object', semanticPath: 'ambientLight.color', serializer: 'native am3d:ambientLight/am3d:clr/a:scrgbClr', reset: 'set ambientLight.color to null or omit ambientLight to restore the selected view/default lighting', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'pointLights', type: 'structured', valueType: 'array', maximumItems: 3, itemSchema: { color: 'rgb-object', intensity: '0..100 normalized scalar', pos: { x: 'EMU', y: 'EMU', z: 'EMU' } }, semanticPath: 'ptLights[]', serializer: 'native am3d:ptLight[]', reset: 'set ptLights to null or omit it to restore the selected view/default lighting', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
])

// Native SmartArt formatting is a parameter surface, not only a category tile.
// These leaves mirror the fields that the native diagram serializer owns. The
// node array is deliberately structured and bounded rather than an opaque XML
// passthrough, so a public client can author topology and styling safely.
export const SMARTART_FORMAT_PARAMETERS = Object.freeze([
	{ id: 'layoutId', type: 'discrete', valueType: 'string', semanticPath: 'object.layoutId', serializer: 'native dgm:dataModel/dgm:pt[type=doc]/dgm:prSet/@loTypeId', reset: 'set layoutId to null or omit it to restore the selected category/default layout' },
	{ id: 'quickStyleId', type: 'discrete', valueType: 'string', semanticPath: 'object.quickStyleId', serializer: 'native dgm:dataModel/dgm:pt[type=doc]/dgm:prSet/@qsTypeId', reset: 'set quickStyleId to null or omit it to restore the native Quick Style default' },
	{ id: 'colorStyleId', type: 'discrete', valueType: 'string', semanticPath: 'object.colorStyleId', serializer: 'native dgm:dataModel/dgm:pt[type=doc]/dgm:prSet/@csTypeId', reset: 'set colorStyleId to null or omit it to restore the native Color Style default' },
	{ id: 'presetFallback', type: 'discrete', canonical: ['reject', 'default'], default: 'reject', semanticPath: 'object.presetFallback', serializer: 'native catalog resolver policy', reset: 'set presetFallback to null or omit it to restore strict exact-ID rejection' },
	{ id: 'rightToLeft', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'object.rightToLeft', serializer: 'native dgm:presLayoutVars/dgm:dir/@val', reset: 'set rightToLeft to null or omit it to restore left-to-right ordering' },
	{ id: 'fontFace', type: 'structured', valueType: 'font-family', semanticPath: 'object.fontFace', serializer: 'native dsp:drawing/a:fontRef and text runs when authored', reset: 'set fontFace to null or omit it to restore the theme font' },
	{ id: 'fontSize', type: 'continuous', valueType: 'number', minimum: 1, maximum: 400, default: 12, step: 0.1, unit: 'points', semanticPath: 'object.fontSize', serializer: 'native dsp:drawing/a:rPr/@sz', reset: 'set fontSize to null or omit it to restore the diagram default' },
	{ id: 'color', type: 'color', valueType: 'hex', semanticPath: 'object.color', serializer: 'native dgm:dataModel/dgm:t/a:rPr/a:solidFill and dsp:drawing text runs', reset: 'set color to null or omit it to restore the selected Color Style text color' },
	{ id: 'textColors', type: 'structured', valueType: 'color-array', maximumItems: 1000, semanticPath: 'object.textColors[]', serializer: 'native per-node dgm:t/a:rPr/a:solidFill', reset: 'set textColors to null or omit it to restore the whole-diagram color' },
	{ id: 'palette', type: 'structured', valueType: 'color-array', maximumItems: 12, semanticPath: 'object.palette[]', serializer: 'native theme/palette context', reset: 'set palette to null or omit it to restore the theme palette' },
	{ id: 'nodes', type: 'structured', valueType: 'smartart-node-array', maximumItems: 1000, itemSchema: { text: 'string', title: 'string?', subtitle: 'string?', role: ['root', 'manager', 'member', 'peer', 'node', 'image', 'caption', 'assistant'], children: 'recursive node array', image: 'opaque/data image reference?', color: 'hex?' }, semanticPath: 'object.nodes[]', serializer: 'native dgm:pt/dgm:cxn topology, text, role, and picture relationships', reset: 'set nodes to null or omit it to restore generated placeholder nodes' },
	{ id: 'title', type: 'structured', valueType: 'string', semanticPath: 'object.title', serializer: 'native SmartArt semantic title carrier', reset: 'set title to null or omit it to remove the authored title' },
	{ id: 'altText', type: 'structured', valueType: 'string', semanticPath: 'object.altText', serializer: 'native p:cNvPr/@descr', reset: 'set altText to null or omit it to remove the authored description' },
])

// Slide transitions are not only ribbon tiles.  The native serializer carries
// typed timing, direction, inversion, pattern, and morph-option attributes in
// addition to the selected transition family.  Keep the public contract in
// one place so an AI client can compose a gallery selector with every safe
// extended control instead of guessing private XML names.
export const TRANSITION_FORMAT_TYPES = Object.freeze([
	'none', 'morph', 'fade', 'cut', 'newsflash', 'random', 'push', 'wipe',
	'cover', 'uncover', 'split', 'reveal', 'randomBar', 'shape', 'circle',
	'diamond', 'plus', 'wedge', 'wheel', 'comb', 'zoom', 'strips',
	'checkerboard', 'checker', 'blinds', 'flash', 'curtains', 'drape',
	'wind', 'prestige', 'fracture', 'crush', 'peelOff', 'pageCurl',
	'pageCurlDouble', 'pageCurlSingle', 'airplane', 'origami', 'fallOver',
	'clock', 'ripple', 'honeycomb', 'glitter', 'shred', 'vortex', 'switch',
	'flip', 'gallery', 'prism', 'cube', 'box', 'rotate', 'orbit', 'doors',
	'warp', 'pan', 'ferrisWheel', 'conveyor', 'window', 'flyThrough',
])

export const TRANSITION_FORMAT_DIRECTIONS = Object.freeze([
	'horz', 'vert', 'up', 'down', 'left', 'right', 'u', 'd', 'l', 'r',
	'lu', 'ld', 'ru', 'rd', 'in', 'out',
])

export const TRANSITION_FORMAT_PATTERNS = Object.freeze([
	'circle', 'diamond', 'plus', 'wedge', 'fromBottomLeft', 'fromBottomRight',
	'fromTopRight', 'fromTopLeft', 'hexagon', 'stripsIn', 'stripsOut',
	'particlesIn', 'particlesOut', 'bounce',
])

export const TRANSITION_FORMAT_PARAMETERS = Object.freeze([
	{ id: 'type', type: 'discrete', valueType: 'string', canonical: [...TRANSITION_FORMAT_TYPES], semanticPath: 'slides[].transition.type', serializer: 'native p:transition child selector', reset: 'set type to none or remove the transition to restore an instant cut' },
	{ id: 'speed', type: 'discrete', valueType: 'string', canonical: ['slow', 'medium', 'med', 'fast'], default: 'medium', semanticPath: 'slides[].transition.speed', serializer: 'native p:transition/@spd', reset: 'set speed to null or omit it to restore the Office default' },
	{ id: 'duration', type: 'continuous', valueType: 'number', minimum: 0, maximum: 86400000, default: null, step: 1, unit: 'milliseconds', aliases: ['durationMs'], semanticPath: 'slides[].transition.duration', serializer: 'native p14:transition/@p14:dur where supported', reset: 'set duration/durationMs to null or omit it to restore the transition default' },
	{ id: 'advanceOnClick', type: 'discrete', valueType: 'boolean', default: true, semanticPath: 'slides[].transition.advanceOnClick', serializer: 'native p:transition/@advClick', reset: 'set advanceOnClick to null or omit it to restore click advance' },
	{ id: 'advanceAfterTime', type: 'continuous', valueType: 'number', minimum: 0, maximum: 86400000, default: null, step: 1, unit: 'milliseconds', semanticPath: 'slides[].transition.advanceAfterTime', serializer: 'native p:transition/@advTm', reset: 'set advanceAfterTime to null or omit it to restore click-only advance' },
	{ id: 'direction', type: 'discrete', valueType: 'string', canonical: [...TRANSITION_FORMAT_DIRECTIONS], semanticPath: 'slides[].transition.direction', serializer: 'native transition child direction/orientation attribute', reset: 'set direction to null or omit it to restore the selected transition default' },
	{ id: 'throughBlack', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'slides[].transition.throughBlack', serializer: 'native fade/cut/pull/push transition thruBlk attribute', reset: 'set throughBlack to null or omit it to restore the selected transition default' },
	{ id: 'splitDirection', type: 'discrete', valueType: 'string', canonical: ['horz', 'vert', 'in', 'out'], semanticPath: 'slides[].transition.splitDirection', serializer: 'native p:split/@dir', reset: 'set splitDirection to null or omit it to restore the split default' },
	{ id: 'pattern', type: 'discrete', valueType: 'string', canonical: [...TRANSITION_FORMAT_PATTERNS], semanticPath: 'slides[].transition.pattern', serializer: 'native transition pattern/direction attribute', reset: 'set pattern to null or omit it to restore the selected transition default' },
	{ id: 'spokes', type: 'continuous', valueType: 'integer', minimum: 1, maximum: 64, default: 4, step: 1, unit: 'wheel spokes', applicability: ['wheel'], semanticPath: 'slides[].transition.spokes', serializer: 'native p:wheel/@spokes or p14:wheelReverse/@spokes', reset: 'set spokes to null or omit it to restore four spokes' },
	{ id: 'clockwise', type: 'discrete', valueType: 'boolean', default: true, applicability: ['wheel', 'clock'], semanticPath: 'slides[].transition.clockwise', serializer: 'native wheel direction / p14:wheelReverse', reset: 'set clockwise to null or omit it to restore clockwise motion' },
	{ id: 'zoomFrom', type: 'discrete', valueType: 'string', canonical: ['in', 'out'], applicability: ['zoom'], semanticPath: 'slides[].transition.zoomFrom', serializer: 'native p14:zoom/@dir', reset: 'set zoomFrom to null or omit it to restore the zoom default' },
	{ id: 'option', type: 'discrete', valueType: 'string', canonical: ['byObject', 'byWord', 'byChar'], applicability: ['morph'], semanticPath: 'slides[].transition.option', serializer: 'native p159:morph/@option', reset: 'set option to null or omit it to restore Morph-by-object' },
	{ id: 'invX', type: 'discrete', valueType: 'boolean', default: false, applicability: ['curtains', 'drape', 'wind', 'prestige', 'fracture', 'crush', 'peelOff', 'pageCurl', 'pageCurlDouble', 'pageCurlSingle', 'airplane', 'origami', 'fallOver', 'clock'], semanticPath: 'slides[].transition.invX', serializer: 'native p15:prstTrans/@invX', reset: 'set invX to null or omit it to restore the selected preset orientation' },
	{ id: 'invY', type: 'discrete', valueType: 'boolean', default: false, applicability: ['curtains', 'drape', 'wind', 'prestige', 'fracture', 'crush', 'peelOff', 'pageCurl', 'pageCurlDouble', 'pageCurlSingle', 'airplane', 'origami', 'fallOver', 'clock'], semanticPath: 'slides[].transition.invY', serializer: 'native p15:prstTrans/@invY', reset: 'set invY to null or omit it to restore the selected preset orientation' },
	{ id: 'p14dur', type: 'continuous', valueType: 'number', minimum: 0, maximum: 86400000, default: null, step: 1, unit: 'milliseconds', applicability: ['morph'], semanticPath: 'slides[].transition.p14dur', serializer: 'native p159:morph parent transition/@p14:dur', reset: 'set p14dur to null or omit it to restore the Morph default' },
])

const TRANSITION_FORMAT_NUMERIC_RULES = Object.freeze(Object.fromEntries(TRANSITION_FORMAT_PARAMETERS.filter(item => item.type === 'continuous').map(item => [item.id, item])))
const TRANSITION_FORMAT_ENUM_RULES = Object.freeze(Object.fromEntries(TRANSITION_FORMAT_PARAMETERS.filter(item => Array.isArray(item.canonical)).map(item => [item.id, item.canonical])))
const TRANSITION_FORMAT_BOOLEAN_FIELDS = Object.freeze(TRANSITION_FORMAT_PARAMETERS.filter(item => item.valueType === 'boolean').map(item => item.id))

function validateTransitionFormatNumber(value, rule, path) {
	if (value === undefined || value === null) return
	if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number.`)
	if (value < rule.minimum || value > rule.maximum) throw new Error(`${path} must be between ${rule.minimum} and ${rule.maximum}.`)
	if (rule.step && Math.abs((value - (rule.minimum || 0)) / rule.step - Math.round((value - (rule.minimum || 0)) / rule.step)) > 1e-7) throw new Error(`${path} must use a ${rule.step}-unit step.`)
}

export function validateTransitionFormatOptions(value, path = 'transition') {
	if (value === undefined || value === null) return value
	if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object or null.`)
	for (const [key, rule] of Object.entries(TRANSITION_FORMAT_NUMERIC_RULES)) validateTransitionFormatNumber(value[key], rule, `${path}.${key}`)
	validateTransitionFormatNumber(value.durationMs, TRANSITION_FORMAT_NUMERIC_RULES.duration, `${path}.durationMs`)
	for (const [key, values] of Object.entries(TRANSITION_FORMAT_ENUM_RULES)) if (value[key] !== undefined && value[key] !== null && !values.includes(value[key])) throw new Error(`${path}.${key} must be one of ${values.join(', ')}.`)
	for (const key of TRANSITION_FORMAT_BOOLEAN_FIELDS) if (value[key] !== undefined && value[key] !== null && typeof value[key] !== 'boolean') throw new Error(`${path}.${key} must be boolean or null.`)
	for (const key of ['transitionPresetId', 'presetId']) if (value[key] !== undefined && value[key] !== null && !TRANSITION_GALLERY_PRESETS.some(item => item.id === String(value[key]))) throw new Error(`${path}.${key} must reference a known transition gallery preset.`)
	return value
}

const SMARTART_FORMAT_NUMERIC_RULES = Object.freeze(Object.fromEntries(SMARTART_FORMAT_PARAMETERS.filter(item => item.type === 'continuous').map(item => [item.id, item])))
const SMARTART_FORMAT_ENUM_RULES = Object.freeze(Object.fromEntries(SMARTART_FORMAT_PARAMETERS.filter(item => Array.isArray(item.canonical)).map(item => [item.id, item.canonical])))
const SMARTART_NODE_ROLES = Object.freeze(['root', 'manager', 'member', 'peer', 'node', 'image', 'caption', 'assistant'])

function validateSmartArtFormatNumber(value, rule, path) {
	if (value === undefined || value === null) return
	if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number.`)
	if (value < rule.minimum || value > rule.maximum) throw new Error(`${path} must be between ${rule.minimum} and ${rule.maximum}.`)
	if (rule.step && Math.abs((value - (rule.minimum || 0)) / rule.step - Math.round((value - (rule.minimum || 0)) / rule.step)) > 1e-7) throw new Error(`${path} must use a ${rule.step}-unit step.`)
}

function validateSmartArtNode(node, path, depth = 0) {
	if (typeof node === 'string') return
	if (!node || typeof node !== 'object' || Array.isArray(node)) throw new Error(`${path} must be a string or node object.`)
	if (node.role !== undefined && node.role !== null && !SMARTART_NODE_ROLES.includes(node.role)) throw new Error(`${path}.role must be one of ${SMARTART_NODE_ROLES.join(', ')}.`)
	for (const key of ['text', 'title', 'subtitle', 'image', 'imagePath', 'imageUrl', 'imageData', 'color']) if (node[key] !== undefined && node[key] !== null && typeof node[key] !== 'string') throw new Error(`${path}.${key} must be a string or null.`)
	if (node.children !== undefined && node.children !== null) {
		if (!Array.isArray(node.children) || node.children.length > 1000) throw new Error(`${path}.children must contain at most 1000 nodes.`)
		if (depth >= 32) throw new Error(`${path}.children exceeds the maximum SmartArt nesting depth of 32.`)
		node.children.forEach((child, index) => validateSmartArtNode(child, `${path}.children[${index}]`, depth + 1))
	}
}

export function validateSmartArtFormatOptions(value, path = 'smartArtOptions') {
	if (value === undefined || value === null) return value
	if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object or null.`)
	for (const [key, rule] of Object.entries(SMARTART_FORMAT_NUMERIC_RULES)) validateSmartArtFormatNumber(value[key], rule, `${path}.${key}`)
	for (const [key, values] of Object.entries(SMARTART_FORMAT_ENUM_RULES)) if (value[key] !== undefined && value[key] !== null && !values.includes(value[key])) throw new Error(`${path}.${key} must be one of ${values.join(', ')}.`)
	if (value.rightToLeft !== undefined && value.rightToLeft !== null && typeof value.rightToLeft !== 'boolean') throw new Error(`${path}.rightToLeft must be boolean or null.`)
	for (const key of ['textColors', 'palette']) {
		if (value[key] === undefined || value[key] === null) continue
		if (!Array.isArray(value[key]) || value[key].length > (key === 'palette' ? 12 : 1000) || value[key].some(color => typeof color !== 'string' || !color.trim())) throw new Error(`${path}.${key} must be a bounded array of color strings or null.`)
	}
	if (value.nodes !== undefined && value.nodes !== null) {
		if (!Array.isArray(value.nodes) || value.nodes.length > 1000) throw new Error(`${path}.nodes must contain at most 1000 nodes.`)
		value.nodes.forEach((node, index) => validateSmartArtNode(node, `${path}.nodes[${index}]`))
	}
	for (const key of ['layoutId', 'quickStyleId', 'colorStyleId', 'fontFace', 'color', 'title', 'altText']) if (value[key] !== undefined && value[key] !== null && typeof value[key] !== 'string') throw new Error(`${path}.${key} must be a string or null.`)
	return value
}

// Native chart formatting is a parameter surface, not only a chart-type
// gallery.  These leaves mirror the public IChartOpts fields that the native
// serializer already emits.  Keep the ranges and defaults explicit so an AI
// client can choose a slider value instead of guessing from a preset.
export const CHART_FORMAT_PARAMETERS = Object.freeze([
	{ id: 'chartColors', type: 'structured', valueType: 'color-array', semanticPath: 'chartColors', serializer: 'native c:ser/c:spPr/a:solidFill', reset: 'set chartColors to null or omit to restore the native palette' },
	{ id: 'chartColorsOpacity', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: null, step: 1, unit: 'percent', semanticPath: 'chartColorsOpacity', serializer: 'native c:ser/c:dPt/c:spPr/a:alpha', reset: 'set chartColorsOpacity to null or omit to restore the native opacity' },
	{ id: 'showLegend', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'showLegend', serializer: 'native c:legend', reset: 'set showLegend to null or omit to restore chart-type default' },
	{ id: 'legendPos', type: 'discrete', canonical: ['b', 'l', 'r', 't', 'tr'], default: 'r', semanticPath: 'legendPos', serializer: 'native c:legend/c:legendPos/@val', reset: 'set legendPos to null or omit to restore the native position' },
	{ id: 'legendFontSize', type: 'continuous', valueType: 'number', minimum: 1, maximum: 400, default: null, step: 0.1, unit: 'points', semanticPath: 'legendFontSize', serializer: 'native c:legend/c:txPr/a:defRPr/@sz', reset: 'set legendFontSize to null or omit to restore the theme size' },
	{ id: 'legendColor', type: 'color', valueType: 'hex-or-theme', semanticPath: 'legendColor', serializer: 'native c:legend/c:txPr/a:solidFill', reset: 'set legendColor to null or omit to restore the theme color' },
	{ id: 'showTitle', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'showTitle', serializer: 'native c:title', reset: 'set showTitle to null or omit to restore chart-type default' },
	{ id: 'titleFontSize', type: 'continuous', valueType: 'number', minimum: 1, maximum: 400, default: null, step: 0.1, unit: 'points', semanticPath: 'titleFontSize', serializer: 'native c:title/c:txPr/a:defRPr/@sz', reset: 'set titleFontSize to null or omit to restore the theme size' },
	{ id: 'titleColor', type: 'color', valueType: 'hex-or-theme', semanticPath: 'titleColor', serializer: 'native c:title/c:txPr/a:solidFill', reset: 'set titleColor to null or omit to restore the theme color' },
	{ id: 'titleRotate', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 0.1, unit: 'degrees', semanticPath: 'titleRotate', serializer: 'native c:title/c:txPr/a:bodyPr/@rot', reset: 'set titleRotate to null or omit to restore zero rotation' },
	{ id: 'showValue', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'showValue', serializer: 'native c:dLbls/c:showVal', reset: 'set showValue to null or omit to restore chart-type default' },
	{ id: 'showLabel', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'showLabel', serializer: 'native c:dLbls/c:showCatName', reset: 'set showLabel to null or omit to restore chart-type default' },
	{ id: 'showSerName', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'showSerName', serializer: 'native c:dLbls/c:showSerName', reset: 'set showSerName to null or omit to restore chart-type default' },
	{ id: 'showPercent', type: 'discrete', valueType: 'boolean', default: false, applicability: ['pie', 'doughnut'], semanticPath: 'showPercent', serializer: 'native c:dLbls/c:showPercent', reset: 'set showPercent to null or omit to restore pie/doughnut default' },
	{ id: 'showLeaderLines', type: 'discrete', valueType: 'boolean', default: false, applicability: ['pie', 'doughnut'], semanticPath: 'showLeaderLines', serializer: 'native c:dLbls/c:showLeaderLines', reset: 'set showLeaderLines to null or omit to restore chart-type default' },
	{ id: 'dataLabelPosition', type: 'discrete', canonical: ['b', 'bestFit', 'ctr', 'l', 'r', 't', 'inEnd', 'outEnd'], semanticPath: 'dataLabelPosition', serializer: 'native c:dLbls/c:dLblPos/@val', reset: 'set dataLabelPosition to null or omit to restore chart-type default' },
	{ id: 'dataLabelFontSize', type: 'continuous', valueType: 'number', minimum: 1, maximum: 400, default: null, step: 0.1, unit: 'points', semanticPath: 'dataLabelFontSize', serializer: 'native c:dLbls/c:txPr/a:defRPr/@sz', reset: 'set dataLabelFontSize to null or omit to restore the theme size' },
	{ id: 'dataLabelColor', type: 'color', valueType: 'hex-or-theme', semanticPath: 'dataLabelColor', serializer: 'native c:dLbls/c:txPr/a:solidFill', reset: 'set dataLabelColor to null or omit to restore the theme color' },
	{ id: 'dataLabelFormatCode', type: 'structured', valueType: 'format-code', semanticPath: 'dataLabelFormatCode', serializer: 'native c:dLbls/c:numFmt/@formatCode', reset: 'set dataLabelFormatCode to null or omit to restore the chart default' },
	{ id: 'dataLabelBkgrdColors', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'dataLabelBkgrdColors', serializer: 'native c:dLbls/c:showBubbleSize/c:txPr', reset: 'set dataLabelBkgrdColors to null or omit to restore the native default' },
	{ id: 'catAxisHidden', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'catAxisHidden', serializer: 'native c:catAx/c:delete', reset: 'set catAxisHidden to null or omit to restore axis visibility' },
	{ id: 'valAxisHidden', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'valAxisHidden', serializer: 'native c:valAx/c:delete', reset: 'set valAxisHidden to null or omit to restore axis visibility' },
	{ id: 'catAxisLabelFontSize', type: 'continuous', valueType: 'number', minimum: 1, maximum: 400, default: null, step: 0.1, unit: 'points', semanticPath: 'catAxisLabelFontSize', serializer: 'native c:catAx/c:txPr/a:defRPr/@sz', reset: 'set catAxisLabelFontSize to null or omit to restore the theme size' },
	{ id: 'valAxisLabelFontSize', type: 'continuous', valueType: 'number', minimum: 1, maximum: 400, default: null, step: 0.1, unit: 'points', semanticPath: 'valAxisLabelFontSize', serializer: 'native c:valAx/c:txPr/a:defRPr/@sz', reset: 'set valAxisLabelFontSize to null or omit to restore the theme size' },
	{ id: 'catAxisLabelRotate', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 0.1, unit: 'degrees', semanticPath: 'catAxisLabelRotate', serializer: 'native c:catAx/c:txPr/a:bodyPr/@rot', reset: 'set catAxisLabelRotate to null or omit to restore zero rotation' },
	{ id: 'valAxisLabelRotate', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 0.1, unit: 'degrees', semanticPath: 'valAxisLabelRotate', serializer: 'native c:valAx/c:txPr/a:bodyPr/@rot', reset: 'set valAxisLabelRotate to null or omit to restore zero rotation' },
	{ id: 'catAxisLabelColor', type: 'color', valueType: 'hex-or-theme', semanticPath: 'catAxisLabelColor', serializer: 'native c:catAx/c:txPr/a:solidFill', reset: 'set catAxisLabelColor to null or omit to restore the theme color' },
	{ id: 'valAxisLabelColor', type: 'color', valueType: 'hex-or-theme', semanticPath: 'valAxisLabelColor', serializer: 'native c:valAx/c:txPr/a:solidFill', reset: 'set valAxisLabelColor to null or omit to restore the theme color' },
	{ id: 'catAxisLineSize', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1584, default: null, step: 0.01, unit: 'points', semanticPath: 'catAxisLineSize', serializer: 'native c:catAx/c:spPr/a:ln/a:solidFill', reset: 'set catAxisLineSize to null or omit to restore the native line width' },
	{ id: 'valAxisLineSize', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1584, default: null, step: 0.01, unit: 'points', semanticPath: 'valAxisLineSize', serializer: 'native c:valAx/c:spPr/a:ln/a:solidFill', reset: 'set valAxisLineSize to null or omit to restore the native line width' },
	{ id: 'catAxisMajorUnit', type: 'continuous', valueType: 'number', minimum: 0, maximum: 2147483647, default: null, step: 0.000001, unit: 'axis units', semanticPath: 'catAxisMajorUnit', serializer: 'native c:catAx/c:majorUnit/@val', applicability: ['numeric-category-axis'], reset: 'set catAxisMajorUnit to null or omit to restore automatic spacing' },
	{ id: 'valAxisMajorUnit', type: 'continuous', valueType: 'number', minimum: 0, maximum: 2147483647, default: null, step: 0.000001, unit: 'axis units', semanticPath: 'valAxisMajorUnit', serializer: 'native c:valAx/c:majorUnit/@val', applicability: ['numeric-value-axis'], reset: 'set valAxisMajorUnit to null or omit to restore automatic spacing' },
	{ id: 'catAxisMinVal', type: 'continuous', valueType: 'number', minimum: -2147483647, maximum: 2147483647, default: null, step: 0.000001, unit: 'axis units', semanticPath: 'catAxisMinVal', serializer: 'native c:catAx/c:scaling/c:min/@val', applicability: ['numeric-category-axis'], reset: 'set catAxisMinVal to null or omit to restore automatic bounds' },
	{ id: 'catAxisMaxVal', type: 'continuous', valueType: 'number', minimum: -2147483647, maximum: 2147483647, default: null, step: 0.000001, unit: 'axis units', semanticPath: 'catAxisMaxVal', applicability: ['numeric-category-axis'], serializer: 'native c:catAx/c:scaling/c:max/@val', reset: 'set catAxisMaxVal to null or omit to restore automatic bounds' },
	{ id: 'valAxisMinVal', type: 'continuous', valueType: 'number', minimum: -2147483647, maximum: 2147483647, default: null, step: 0.000001, unit: 'axis units', semanticPath: 'valAxisMinVal', serializer: 'native c:valAx/c:scaling/c:min/@val', applicability: ['numeric-value-axis'], reset: 'set valAxisMinVal to null or omit to restore automatic bounds' },
	{ id: 'valAxisMaxVal', type: 'continuous', valueType: 'number', minimum: -2147483647, maximum: 2147483647, default: null, step: 0.000001, unit: 'axis units', semanticPath: 'valAxisMaxVal', applicability: ['numeric-value-axis'], reset: 'set valAxisMaxVal to null or omit to restore automatic bounds' },
	{ id: 'valAxisLogScaleBase', type: 'continuous', valueType: 'number', minimum: 2, maximum: 99, default: null, step: 1, unit: 'base', applicability: ['numeric-value-axis'], semanticPath: 'valAxisLogScaleBase', serializer: 'native c:valAx/c:scaling/c:logBase/@val', reset: 'set valAxisLogScaleBase to null or omit to restore linear scale' },
	{ id: 'lineSize', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1584, default: 2, step: 0.01, unit: 'points', applicability: ['line', 'scatter', 'bubble', 'radar'], semanticPath: 'lineSize', serializer: 'native c:ser/c:spPr/a:ln/@w', reset: 'set lineSize to null or omit to restore the native line width' },
	{ id: 'lineDataSymbolSize', type: 'continuous', valueType: 'number', minimum: 2, maximum: 72, default: 6, step: 1, unit: 'points', applicability: ['line', 'scatter', 'bubble'], semanticPath: 'lineDataSymbolSize', serializer: 'native c:ser/c:marker/c:size/@val', reset: 'set lineDataSymbolSize to null or omit to restore the native marker size' },
	{ id: 'lineSmooth', type: 'discrete', valueType: 'boolean', default: false, applicability: ['line', 'scatter'], semanticPath: 'lineSmooth', serializer: 'native c:ser/c:smooth/@val', reset: 'set lineSmooth to null or omit to restore straight segments' },
	{ id: 'firstSliceAng', type: 'continuous', valueType: 'number', minimum: 0, maximum: 359, default: 0, step: 1, unit: 'degrees', applicability: ['pie', 'doughnut'], semanticPath: 'firstSliceAng', serializer: 'native c:firstSliceAng/@val', reset: 'set firstSliceAng to null or omit to restore zero degrees' },
	{ id: 'holeSize', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 50, step: 1, unit: 'percent', applicability: ['doughnut'], semanticPath: 'holeSize', serializer: 'native c:holeSize/@val', reset: 'set holeSize to null or omit to restore the native hole size' },
	{ id: 'barGapWidthPct', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1000, default: 150, step: 1, unit: 'percent', applicability: ['bar', 'bar3D', 'area'], semanticPath: 'barGapWidthPct', serializer: 'native c:gapWidth/@val', reset: 'set barGapWidthPct to null or omit to restore the native gap width' },
	{ id: 'barGapDepthPct', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1000, default: 150, step: 1, unit: 'percent', applicability: ['bar3D'], semanticPath: 'barGapDepthPct', serializer: 'native c:gapDepth/@val', reset: 'set barGapDepthPct to null or omit to restore the native gap depth' },
	{ id: 'barOverlapPct', type: 'continuous', valueType: 'number', minimum: -100, maximum: 100, default: 0, step: 1, unit: 'percent', applicability: ['bar', 'bar3D', 'area'], semanticPath: 'barOverlapPct', serializer: 'native c:overlap/@val', reset: 'set barOverlapPct to null or omit to restore zero overlap' },
	{ id: 'v3DRotX', type: 'continuous', valueType: 'number', minimum: -90, maximum: 90, default: 30, step: 0.1, unit: 'degrees', applicability: ['bar3D', 'bubble3D'], semanticPath: 'v3DRotX', serializer: 'native c:view3D/c:rotX/@val', reset: 'set v3DRotX to null or omit to restore the native view' },
	{ id: 'v3DRotY', type: 'continuous', valueType: 'number', minimum: 0, maximum: 360, default: 30, step: 0.1, unit: 'degrees', applicability: ['bar3D', 'bubble3D'], semanticPath: 'v3DRotY', serializer: 'native c:view3D/c:rotY/@val', reset: 'set v3DRotY to null or omit to restore the native view' },
	{ id: 'v3DPerspective', type: 'continuous', valueType: 'number', minimum: 0, maximum: 240, default: 30, step: 0.1, unit: 'degrees', applicability: ['bar3D', 'bubble3D'], semanticPath: 'v3DPerspective', serializer: 'native c:view3D/c:perspective/@val', reset: 'set v3DPerspective to null or omit to restore the native view' },
	{ id: 'chartArea', type: 'structured', valueType: 'fill-line', semanticPath: 'chartArea', serializer: 'native c:chart/c:spPr', reset: 'set chartArea to null or omit to restore the native chart-area style' },
	{ id: 'plotArea', type: 'structured', valueType: 'fill-line', semanticPath: 'plotArea', serializer: 'native c:plotArea/c:spPr', reset: 'set plotArea to null or omit to restore the native plot-area style' },
	{ id: 'catGridLine', type: 'structured', valueType: 'grid-line', semanticPath: 'catGridLine', serializer: 'native c:catAx/c:majorGridlines', reset: 'set catGridLine to null or omit to restore the chart-type gridline' },
	{ id: 'valGridLine', type: 'structured', valueType: 'grid-line', semanticPath: 'valGridLine', serializer: 'native c:valAx/c:majorGridlines', reset: 'set valGridLine to null or omit to restore the chart-type gridline' },
	{ id: 'catAxes', type: 'structured', valueType: 'axis-array', maximumItems: 2, applicability: ['combo'], semanticPath: 'catAxes[]', serializer: 'native c:catAx[]', reset: 'set catAxes to null or omit to restore the primary category axis' },
	{ id: 'valAxes', type: 'structured', valueType: 'axis-array', maximumItems: 2, applicability: ['combo'], semanticPath: 'valAxes[]', serializer: 'native c:valAx[]', reset: 'set valAxes to null or omit to restore the primary value axis' },
	{ id: 'axisPos', type: 'discrete', canonical: ['b', 'l', 'r', 't'], semanticPath: 'axisPos', serializer: 'native chart axis position defaults', reset: 'set axisPos to null or omit it to restore the chart-type axis positions' },
	{ id: 'dataBorder', type: 'structured', valueType: 'border', semanticPath: 'dataBorder', serializer: 'native c:ser/c:spPr/a:ln', reset: 'set dataBorder to null or omit it to restore the native series border' },
	{ id: 'displayBlanksAs', type: 'discrete', canonical: ['gap', 'span', 'zero'], semanticPath: 'displayBlanksAs', serializer: 'native c:dispBlanksAs/@val', reset: 'set displayBlanksAs to null or omit it to restore gap handling' },
	{ id: 'invertedColors', type: 'structured', valueType: 'color-array', maximumItems: 256, semanticPath: 'invertedColors[]', serializer: 'native c:invertIfNegative/c:spPr', reset: 'set invertedColors to null or omit it to restore automatic negative-value colors' },
	{ id: 'lang', type: 'structured', valueType: 'string', semanticPath: 'lang', serializer: 'native c:lang/@val', reset: 'set lang to null or omit it to restore the presentation language' },
	{ id: 'layout', type: 'structured', valueType: 'position', semanticPath: 'layout', serializer: 'native c:manualLayout', reset: 'set layout to null or omit it to restore automatic chart layout' },
	{ id: 'shadow', type: 'structured', valueType: 'shadow', semanticPath: 'shadow', serializer: 'native chart-frame p:spPr/a:effectLst', reset: 'set shadow to null or omit it to remove the chart-frame shadow override' },
	{ id: 'v3DRAngAx', type: 'discrete', valueType: 'boolean', default: false, applicability: ['bar3D', 'bubble3D'], semanticPath: 'v3DRAngAx', serializer: 'native c:view3D/c:rAngAx/@val', reset: 'set v3DRAngAx to null or omit it to restore perspective projection' },
	{ id: 'bar3DShape', type: 'discrete', canonical: ['box', 'cylinder', 'cone', 'coneToMax', 'pyramid', 'pyramidToMax'], applicability: ['bar3D'], semanticPath: 'bar3DShape', serializer: 'native c:shape/@val', reset: 'set bar3DShape to null or omit it to restore box columns' },
	{ id: 'barDir', type: 'discrete', canonical: ['bar', 'col'], applicability: ['bar', 'bar3D'], semanticPath: 'barDir', serializer: 'native c:barDir/@val', reset: 'set barDir to null or omit it to restore column orientation' },
	{ id: 'barGrouping', type: 'discrete', canonical: ['clustered', 'percentStacked', 'stacked', 'standard'], applicability: ['bar', 'bar3D'], semanticPath: 'barGrouping', serializer: 'native c:grouping/@val', reset: 'set barGrouping to null or omit it to restore clustered grouping' },
	{ id: 'dataNoEffects', type: 'discrete', valueType: 'boolean', default: false, applicability: ['pie', 'doughnut'], semanticPath: 'dataNoEffects', serializer: 'native series effect suppression', reset: 'set dataNoEffects to null or omit it to restore native series effects' },
	{ id: 'lineCap', type: 'discrete', canonical: ['flat', 'round', 'square'], applicability: ['line', 'scatter', 'radar'], semanticPath: 'lineCap', serializer: 'native c:ser/c:spPr/a:ln/@cap', reset: 'set lineCap to null or omit it to restore flat line caps' },
	{ id: 'lineDash', type: 'discrete', canonical: ['dash', 'dashDot', 'lgDash', 'lgDashDot', 'lgDashDotDot', 'solid', 'sysDash', 'sysDot'], applicability: ['line', 'scatter', 'radar'], semanticPath: 'lineDash', serializer: 'native c:ser/c:spPr/a:ln/a:prstDash', reset: 'set lineDash to null or omit it to restore a solid line' },
	{ id: 'lineDataSymbol', type: 'discrete', canonical: ['circle', 'dash', 'diamond', 'dot', 'none', 'square', 'triangle'], applicability: ['line', 'scatter', 'bubble'], semanticPath: 'lineDataSymbol', serializer: 'native c:ser/c:marker/c:symbol/@val', reset: 'set lineDataSymbol to null or omit it to restore the chart-type marker' },
	{ id: 'lineDataSymbolLineColor', type: 'color', valueType: 'hex-or-theme', applicability: ['line', 'scatter', 'bubble'], semanticPath: 'lineDataSymbolLineColor', serializer: 'native c:ser/c:marker/c:spPr/a:ln/a:solidFill', reset: 'set lineDataSymbolLineColor to null or omit it to restore the series color' },
	{ id: 'lineDataSymbolLineSize', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1584, default: 0.75, step: 0.01, unit: 'points', applicability: ['line', 'scatter', 'bubble'], semanticPath: 'lineDataSymbolLineSize', serializer: 'native c:ser/c:marker/c:spPr/a:ln/@w', reset: 'set lineDataSymbolLineSize to null or omit it to restore the native marker border width' },
	{ id: 'radarStyle', type: 'discrete', canonical: ['standard', 'marker', 'filled'], applicability: ['radar'], semanticPath: 'radarStyle', serializer: 'native c:radarStyle/@val', reset: 'set radarStyle to null or omit it to restore standard radar' },
	{ id: 'dataLabelFontBold', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'dataLabelFontBold', serializer: 'native c:dLbls/c:txPr/a:defRPr/@b', reset: 'set dataLabelFontBold to null or omit it to restore the theme weight' },
	{ id: 'dataLabelFontFace', type: 'structured', valueType: 'font-family', semanticPath: 'dataLabelFontFace', serializer: 'native c:dLbls/c:txPr/a:defRPr/a:latin/@typeface', reset: 'set dataLabelFontFace to null or omit it to restore the theme font' },
	{ id: 'dataLabelFontItalic', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'dataLabelFontItalic', serializer: 'native c:dLbls/c:txPr/a:defRPr/@i', reset: 'set dataLabelFontItalic to null or omit it to restore the theme posture' },
	{ id: 'dataLabelFormatScatter', type: 'discrete', canonical: ['custom', 'customXY', 'XY'], applicability: ['scatter', 'bubble'], semanticPath: 'dataLabelFormatScatter', serializer: 'native scatter data-label text policy', reset: 'set dataLabelFormatScatter to null or omit it to restore the chart default' },
	{ id: 'showDataTable', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'showDataTable', serializer: 'native c:dTable', reset: 'set showDataTable to null or omit it to remove the data table override' },
	{ id: 'showDataTableHorzBorder', type: 'discrete', valueType: 'boolean', default: true, applicability: ['showDataTable'], semanticPath: 'showDataTableHorzBorder', serializer: 'native c:dTable/c:showHorzBorder/@val', reset: 'set showDataTableHorzBorder to null or omit it to restore the data-table default' },
	{ id: 'showDataTableVertBorder', type: 'discrete', valueType: 'boolean', default: true, applicability: ['showDataTable'], semanticPath: 'showDataTableVertBorder', serializer: 'native c:dTable/c:showVertBorder/@val', reset: 'set showDataTableVertBorder to null or omit it to restore the data-table default' },
	{ id: 'showDataTableOutline', type: 'discrete', valueType: 'boolean', default: true, applicability: ['showDataTable'], semanticPath: 'showDataTableOutline', serializer: 'native c:dTable/c:showOutline/@val', reset: 'set showDataTableOutline to null or omit it to restore the data-table default' },
	{ id: 'showDataTableKeys', type: 'discrete', valueType: 'boolean', default: true, applicability: ['showDataTable'], semanticPath: 'showDataTableKeys', serializer: 'native c:dTable/c:showKeys/@val', reset: 'set showDataTableKeys to null or omit it to restore the data-table default' },
	{ id: 'dataTableFontSize', type: 'continuous', valueType: 'number', minimum: 1, maximum: 400, default: 12, step: 0.1, unit: 'points', applicability: ['showDataTable'], semanticPath: 'dataTableFontSize', serializer: 'native c:dTable/c:txPr/a:defRPr/@sz', reset: 'set dataTableFontSize to null or omit it to restore the theme size' },
	{ id: 'dataTableFormatCode', type: 'structured', valueType: 'format-code', applicability: ['showDataTable'], semanticPath: 'dataTableFormatCode', serializer: 'native data-table number formatting', reset: 'set dataTableFormatCode to null or omit it to restore the value-axis format' },
	{ id: 'legendFontFace', type: 'structured', valueType: 'font-family', semanticPath: 'legendFontFace', serializer: 'native c:legend/c:txPr/a:defRPr/a:latin/@typeface', reset: 'set legendFontFace to null or omit it to restore the theme font' },
	{ id: 'title', type: 'structured', valueType: 'string', semanticPath: 'title', serializer: 'native c:title/c:tx/c:rich', reset: 'set title to null or omit it to remove the authored title text' },
	{ id: 'titleAlign', type: 'discrete', canonical: ['left', 'center', 'right', 'justify'], semanticPath: 'titleAlign', serializer: 'native c:title/c:txPr/a:pPr/@algn', reset: 'set titleAlign to null or omit it to restore centered title text' },
	{ id: 'titleBold', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'titleBold', serializer: 'native c:title/c:txPr/a:defRPr/@b', reset: 'set titleBold to null or omit it to restore the theme weight' },
	{ id: 'titleFontFace', type: 'structured', valueType: 'font-family', semanticPath: 'titleFontFace', serializer: 'native c:title/c:txPr/a:defRPr/a:latin/@typeface', reset: 'set titleFontFace to null or omit it to restore the theme font' },
	{ id: 'titlePos', type: 'structured', valueType: 'position', semanticPath: 'titlePos', serializer: 'native c:title/c:layout/c:manualLayout', reset: 'set titlePos to null or omit it to restore automatic title placement' },
	{ id: 'catAxisBaseTimeUnit', type: 'discrete', canonical: ['days', 'months', 'years'], semanticPath: 'catAxisBaseTimeUnit', serializer: 'native c:catAx/c:baseTimeUnit/@val', reset: 'set catAxisBaseTimeUnit to null or omit it to restore automatic time scaling' },
	{ id: 'catAxisCrossesAt', type: 'structured', valueType: 'number-or-autoZero', semanticPath: 'catAxisCrossesAt', serializer: 'native c:catAx/c:crossesAt or c:crosses', reset: 'set catAxisCrossesAt to null or omit it to restore automatic crossing' },
	{ id: 'catAxisLabelFontBold', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'catAxisLabelFontBold', serializer: 'native c:catAx/c:txPr/a:defRPr/@b', reset: 'set catAxisLabelFontBold to null or omit it to restore the theme weight' },
	{ id: 'catAxisLabelFontFace', type: 'structured', valueType: 'font-family', semanticPath: 'catAxisLabelFontFace', serializer: 'native c:catAx/c:txPr/a:defRPr/a:latin/@typeface', reset: 'set catAxisLabelFontFace to null or omit it to restore the theme font' },
	{ id: 'catAxisLabelFontItalic', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'catAxisLabelFontItalic', serializer: 'native c:catAx/c:txPr/a:defRPr/@i', reset: 'set catAxisLabelFontItalic to null or omit it to restore the theme posture' },
	{ id: 'catAxisLabelFrequency', type: 'structured', valueType: 'string', semanticPath: 'catAxisLabelFrequency', serializer: 'native c:catAx/c:tickLblSkip/@val', reset: 'set catAxisLabelFrequency to null or omit it to restore automatic label frequency' },
	{ id: 'catAxisLabelPos', type: 'discrete', canonical: ['none', 'low', 'high', 'nextTo'], semanticPath: 'catAxisLabelPos', serializer: 'native c:catAx/c:tickLblPos/@val', reset: 'set catAxisLabelPos to null or omit it to restore next-to-axis labels' },
	{ id: 'catAxisLineColor', type: 'color', valueType: 'hex-or-theme', semanticPath: 'catAxisLineColor', serializer: 'native c:catAx/c:spPr/a:ln/a:solidFill', reset: 'set catAxisLineColor to null or omit it to restore the theme line color' },
	{ id: 'catAxisLineShow', type: 'discrete', valueType: 'boolean', default: true, semanticPath: 'catAxisLineShow', serializer: 'native c:catAx/c:spPr/a:ln', reset: 'set catAxisLineShow to null or omit it to restore the native axis line' },
	{ id: 'catAxisLineStyle', type: 'discrete', canonical: ['solid', 'dash', 'dot'], semanticPath: 'catAxisLineStyle', serializer: 'native c:catAx/c:spPr/a:ln/a:prstDash', reset: 'set catAxisLineStyle to null or omit it to restore a solid axis line' },
	{ id: 'catAxisMajorTickMark', type: 'discrete', canonical: ['cross', 'in', 'none', 'out'], semanticPath: 'catAxisMajorTickMark', serializer: 'native c:catAx/c:majorTickMark/@val', reset: 'set catAxisMajorTickMark to null or omit it to restore the chart-type tick mark' },
	{ id: 'catAxisMajorTimeUnit', type: 'discrete', canonical: ['days', 'months', 'years'], semanticPath: 'catAxisMajorTimeUnit', serializer: 'native c:catAx/c:majorTimeUnit/@val', reset: 'set catAxisMajorTimeUnit to null or omit it to restore automatic scaling' },
	{ id: 'catAxisMinorTickMark', type: 'discrete', canonical: ['cross', 'in', 'none', 'out'], semanticPath: 'catAxisMinorTickMark', serializer: 'native c:catAx/c:minorTickMark/@val', reset: 'set catAxisMinorTickMark to null or omit it to restore the chart-type tick mark' },
	{ id: 'catAxisMinorTimeUnit', type: 'discrete', canonical: ['days', 'months', 'years'], semanticPath: 'catAxisMinorTimeUnit', serializer: 'native c:catAx/c:minorTimeUnit/@val', reset: 'set catAxisMinorTimeUnit to null or omit it to restore automatic scaling' },
	{ id: 'catAxisMinorUnit', type: 'continuous', valueType: 'number', minimum: 0, maximum: 2147483647, default: null, step: 0.000001, unit: 'axis units', semanticPath: 'catAxisMinorUnit', serializer: 'native c:catAx/c:minorUnit/@val', reset: 'set catAxisMinorUnit to null or omit it to restore automatic spacing' },
	{ id: 'catAxisMultiLevelLabels', type: 'discrete', valueType: 'boolean', default: true, semanticPath: 'catAxisMultiLevelLabels', serializer: 'native c:catAx/c:noMultiLvlLbl/@val', reset: 'set catAxisMultiLevelLabels to null or omit it to restore multi-level labels' },
	{ id: 'catAxisOrientation', type: 'discrete', canonical: ['minMax'], semanticPath: 'catAxisOrientation', serializer: 'native c:catAx/c:scaling/c:orientation/@val', reset: 'set catAxisOrientation to null or omit it to restore min-to-max order' },
	{ id: 'catAxisTitle', type: 'structured', valueType: 'string', semanticPath: 'catAxisTitle', serializer: 'native c:catAx/c:title', reset: 'set catAxisTitle to null or omit it to remove the authored axis title' },
	{ id: 'catAxisTitleColor', type: 'color', valueType: 'hex-or-theme', semanticPath: 'catAxisTitleColor', serializer: 'native c:catAx/c:title/c:txPr/a:solidFill', reset: 'set catAxisTitleColor to null or omit it to restore the theme color' },
	{ id: 'catAxisTitleFontFace', type: 'structured', valueType: 'font-family', semanticPath: 'catAxisTitleFontFace', serializer: 'native c:catAx/c:title/c:txPr/a:latin/@typeface', reset: 'set catAxisTitleFontFace to null or omit it to restore the theme font' },
	{ id: 'catAxisTitleFontSize', type: 'continuous', valueType: 'number', minimum: 1, maximum: 400, default: null, step: 0.1, unit: 'points', semanticPath: 'catAxisTitleFontSize', serializer: 'native c:catAx/c:title/c:txPr/a:defRPr/@sz', reset: 'set catAxisTitleFontSize to null or omit it to restore the theme size' },
	{ id: 'catAxisTitleRotate', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 0.1, unit: 'degrees', semanticPath: 'catAxisTitleRotate', serializer: 'native c:catAx/c:title/c:txPr/a:bodyPr/@rot', reset: 'set catAxisTitleRotate to null or omit it to restore zero rotation' },
	{ id: 'catLabelFormatCode', type: 'structured', valueType: 'format-code', semanticPath: 'catLabelFormatCode', serializer: 'native c:catAx/c:numFmt/@formatCode', reset: 'set catLabelFormatCode to null or omit it to restore the source number format' },
	{ id: 'secondaryCatAxis', type: 'discrete', valueType: 'boolean', default: false, applicability: ['combo'], semanticPath: 'secondaryCatAxis', serializer: 'native secondary c:catAx selection', reset: 'set secondaryCatAxis to null or omit it to restore the primary category axis' },
	{ id: 'showCatAxisTitle', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'showCatAxisTitle', serializer: 'native c:catAx/c:title presence', reset: 'set showCatAxisTitle to null or omit it to restore the chart-type default' },
	{ id: 'serAxisHidden', type: 'discrete', valueType: 'boolean', default: false, applicability: ['bar3D'], semanticPath: 'serAxisHidden', serializer: 'native c:serAx/c:delete/@val', reset: 'set serAxisHidden to null or omit it to restore series-axis visibility' },
	{ id: 'serAxisLabelColor', type: 'color', valueType: 'hex-or-theme', applicability: ['bar3D'], semanticPath: 'serAxisLabelColor', serializer: 'native c:serAx/c:txPr/a:solidFill', reset: 'set serAxisLabelColor to null or omit it to restore the theme color' },
	{ id: 'serAxisLabelFontBold', type: 'discrete', valueType: 'boolean', default: false, applicability: ['bar3D'], semanticPath: 'serAxisLabelFontBold', serializer: 'native c:serAx/c:txPr/a:defRPr/@b', reset: 'set serAxisLabelFontBold to null or omit it to restore the theme weight' },
	{ id: 'serAxisLabelFontFace', type: 'structured', valueType: 'font-family', applicability: ['bar3D'], semanticPath: 'serAxisLabelFontFace', serializer: 'native c:serAx/c:txPr/a:latin/@typeface', reset: 'set serAxisLabelFontFace to null or omit it to restore the theme font' },
	{ id: 'serAxisLabelFontItalic', type: 'discrete', valueType: 'boolean', default: false, applicability: ['bar3D'], semanticPath: 'serAxisLabelFontItalic', serializer: 'native c:serAx/c:txPr/a:defRPr/@i', reset: 'set serAxisLabelFontItalic to null or omit it to restore the theme posture' },
	{ id: 'serAxisLabelFontSize', type: 'continuous', valueType: 'number', minimum: 1, maximum: 400, default: null, step: 0.1, unit: 'points', applicability: ['bar3D'], semanticPath: 'serAxisLabelFontSize', serializer: 'native c:serAx/c:txPr/a:defRPr/@sz', reset: 'set serAxisLabelFontSize to null or omit it to restore the theme size' },
	{ id: 'serAxisLabelFrequency', type: 'structured', valueType: 'string', applicability: ['bar3D'], semanticPath: 'serAxisLabelFrequency', serializer: 'native c:serAx/c:tickLblSkip/@val', reset: 'set serAxisLabelFrequency to null or omit it to restore automatic label frequency' },
	{ id: 'serAxisLabelPos', type: 'discrete', canonical: ['none', 'low', 'high', 'nextTo'], applicability: ['bar3D'], semanticPath: 'serAxisLabelPos', serializer: 'native c:serAx/c:tickLblPos/@val', reset: 'set serAxisLabelPos to null or omit it to restore next-to-axis labels' },
	{ id: 'serAxisLineColor', type: 'color', valueType: 'hex-or-theme', applicability: ['bar3D'], semanticPath: 'serAxisLineColor', serializer: 'native c:serAx/c:spPr/a:ln/a:solidFill', reset: 'set serAxisLineColor to null or omit it to restore the theme line color' },
	{ id: 'serAxisLineShow', type: 'discrete', valueType: 'boolean', default: true, applicability: ['bar3D'], semanticPath: 'serAxisLineShow', serializer: 'native c:serAx/c:spPr/a:ln', reset: 'set serAxisLineShow to null or omit it to restore the native axis line' },
	{ id: 'serAxisMajorUnit', type: 'continuous', valueType: 'number', minimum: 0, maximum: 2147483647, default: null, step: 0.000001, unit: 'axis units', applicability: ['bar3D'], semanticPath: 'serAxisMajorUnit', serializer: 'native c:serAx/c:majorUnit/@val', reset: 'set serAxisMajorUnit to null or omit it to restore automatic spacing' },
	{ id: 'serAxisMinorUnit', type: 'continuous', valueType: 'number', minimum: 0, maximum: 2147483647, default: null, step: 0.000001, unit: 'axis units', applicability: ['bar3D'], semanticPath: 'serAxisMinorUnit', serializer: 'native c:serAx/c:minorUnit/@val', reset: 'set serAxisMinorUnit to null or omit it to restore automatic spacing' },
	{ id: 'serAxisOrientation', type: 'discrete', canonical: ['minMax', 'maxMin'], applicability: ['bar3D'], semanticPath: 'serAxisOrientation', serializer: 'native c:serAx/c:scaling/c:orientation/@val', reset: 'set serAxisOrientation to null or omit it to restore min-to-max order' },
	{ id: 'serAxisTitle', type: 'structured', valueType: 'string', applicability: ['bar3D'], semanticPath: 'serAxisTitle', serializer: 'native c:serAx/c:title', reset: 'set serAxisTitle to null or omit it to remove the authored series-axis title' },
	{ id: 'serAxisTitleColor', type: 'color', valueType: 'hex-or-theme', applicability: ['bar3D'], semanticPath: 'serAxisTitleColor', serializer: 'native c:serAx/c:title/c:txPr/a:solidFill', reset: 'set serAxisTitleColor to null or omit it to restore the theme color' },
	{ id: 'serAxisTitleFontFace', type: 'structured', valueType: 'font-family', applicability: ['bar3D'], semanticPath: 'serAxisTitleFontFace', serializer: 'native c:serAx/c:title/c:txPr/a:latin/@typeface', reset: 'set serAxisTitleFontFace to null or omit it to restore the theme font' },
	{ id: 'serAxisTitleFontSize', type: 'continuous', valueType: 'number', minimum: 1, maximum: 400, default: null, step: 0.1, unit: 'points', applicability: ['bar3D'], semanticPath: 'serAxisTitleFontSize', serializer: 'native c:serAx/c:title/c:txPr/a:defRPr/@sz', reset: 'set serAxisTitleFontSize to null or omit it to restore the theme size' },
	{ id: 'serAxisTitleRotate', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 0.1, unit: 'degrees', applicability: ['bar3D'], semanticPath: 'serAxisTitleRotate', serializer: 'native c:serAx/c:title/c:txPr/a:bodyPr/@rot', reset: 'set serAxisTitleRotate to null or omit it to restore zero rotation' },
	{ id: 'serGridLine', type: 'structured', valueType: 'grid-line', applicability: ['bar3D'], semanticPath: 'serGridLine', serializer: 'native c:serAx/c:majorGridlines', reset: 'set serGridLine to null or omit it to restore the chart-type gridline' },
	{ id: 'serLabelFormatCode', type: 'structured', valueType: 'format-code', applicability: ['bar3D'], semanticPath: 'serLabelFormatCode', serializer: 'native c:serAx/c:numFmt/@formatCode', reset: 'set serLabelFormatCode to null or omit it to restore the source number format' },
	{ id: 'showSerAxisTitle', type: 'discrete', valueType: 'boolean', default: false, applicability: ['bar3D'], semanticPath: 'showSerAxisTitle', serializer: 'native c:serAx/c:title presence', reset: 'set showSerAxisTitle to null or omit it to restore the chart-type default' },
	{ id: 'secondaryValAxis', type: 'discrete', valueType: 'boolean', default: false, applicability: ['combo'], semanticPath: 'secondaryValAxis', serializer: 'native secondary c:valAx selection', reset: 'set secondaryValAxis to null or omit it to restore the primary value axis' },
	{ id: 'showValAxisTitle', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'showValAxisTitle', serializer: 'native c:valAx/c:title presence', reset: 'set showValAxisTitle to null or omit it to restore the chart-type default' },
	{ id: 'valAxisCrossesAt', type: 'structured', valueType: 'number-or-autoZero', semanticPath: 'valAxisCrossesAt', serializer: 'native c:valAx/c:crossesAt or c:crosses', reset: 'set valAxisCrossesAt to null or omit it to restore automatic crossing' },
	{ id: 'valAxisDisplayUnit', type: 'discrete', canonical: ['billions', 'hundredMillions', 'hundreds', 'hundredThousands', 'millions', 'tenMillions', 'tenThousands', 'thousands', 'trillions'], semanticPath: 'valAxisDisplayUnit', serializer: 'native c:valAx/c:dispUnits/c:builtInUnit/@val', reset: 'set valAxisDisplayUnit to null or omit it to restore no display unit' },
	{ id: 'valAxisDisplayUnitLabel', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'valAxisDisplayUnitLabel', serializer: 'native c:valAx/c:dispUnits/c:dispUnitsLbl', reset: 'set valAxisDisplayUnitLabel to null or omit it to restore the chart-type default' },
	{ id: 'valAxisLabelFontBold', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'valAxisLabelFontBold', serializer: 'native c:valAx/c:txPr/a:defRPr/@b', reset: 'set valAxisLabelFontBold to null or omit it to restore the theme weight' },
	{ id: 'valAxisLabelFontFace', type: 'structured', valueType: 'font-family', semanticPath: 'valAxisLabelFontFace', serializer: 'native c:valAx/c:txPr/a:latin/@typeface', reset: 'set valAxisLabelFontFace to null or omit it to restore the theme font' },
	{ id: 'valAxisLabelFontItalic', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'valAxisLabelFontItalic', serializer: 'native c:valAx/c:txPr/a:defRPr/@i', reset: 'set valAxisLabelFontItalic to null or omit it to restore the theme posture' },
	{ id: 'valAxisLabelFormatCode', type: 'structured', valueType: 'format-code', semanticPath: 'valAxisLabelFormatCode', serializer: 'native c:valAx/c:numFmt/@formatCode', reset: 'set valAxisLabelFormatCode to null or omit it to restore the source number format' },
	{ id: 'valAxisLabelPos', type: 'discrete', canonical: ['none', 'low', 'high', 'nextTo'], semanticPath: 'valAxisLabelPos', serializer: 'native c:valAx/c:tickLblPos/@val', reset: 'set valAxisLabelPos to null or omit it to restore next-to-axis labels' },
	{ id: 'valAxisLineColor', type: 'color', valueType: 'hex-or-theme', semanticPath: 'valAxisLineColor', serializer: 'native c:valAx/c:spPr/a:ln/a:solidFill', reset: 'set valAxisLineColor to null or omit it to restore the theme line color' },
	{ id: 'valAxisLineShow', type: 'discrete', valueType: 'boolean', default: true, semanticPath: 'valAxisLineShow', serializer: 'native c:valAx/c:spPr/a:ln', reset: 'set valAxisLineShow to null or omit it to restore the native axis line' },
	{ id: 'valAxisLineStyle', type: 'discrete', canonical: ['solid', 'dash', 'dot'], semanticPath: 'valAxisLineStyle', serializer: 'native c:valAx/c:spPr/a:ln/a:prstDash', reset: 'set valAxisLineStyle to null or omit it to restore a solid axis line' },
	{ id: 'valAxisMajorTickMark', type: 'discrete', canonical: ['cross', 'in', 'none', 'out'], semanticPath: 'valAxisMajorTickMark', serializer: 'native c:valAx/c:majorTickMark/@val', reset: 'set valAxisMajorTickMark to null or omit it to restore the chart-type tick mark' },
	{ id: 'valAxisMinorTickMark', type: 'discrete', canonical: ['cross', 'in', 'none', 'out'], semanticPath: 'valAxisMinorTickMark', serializer: 'native c:valAx/c:minorTickMark/@val', reset: 'set valAxisMinorTickMark to null or omit it to restore the chart-type tick mark' },
	{ id: 'valAxisMinorUnit', type: 'continuous', valueType: 'number', minimum: 0, maximum: 2147483647, default: null, step: 0.000001, unit: 'axis units', semanticPath: 'valAxisMinorUnit', serializer: 'native c:valAx/c:minorUnit/@val', reset: 'set valAxisMinorUnit to null or omit it to restore automatic spacing' },
	{ id: 'valAxisOrientation', type: 'discrete', canonical: ['minMax', 'maxMin'], semanticPath: 'valAxisOrientation', serializer: 'native c:valAx/c:scaling/c:orientation/@val', reset: 'set valAxisOrientation to null or omit it to restore min-to-max order' },
	{ id: 'valAxisTitle', type: 'structured', valueType: 'string', semanticPath: 'valAxisTitle', serializer: 'native c:valAx/c:title', reset: 'set valAxisTitle to null or omit it to remove the authored axis title' },
	{ id: 'valAxisTitleColor', type: 'color', valueType: 'hex-or-theme', semanticPath: 'valAxisTitleColor', serializer: 'native c:valAx/c:title/c:txPr/a:solidFill', reset: 'set valAxisTitleColor to null or omit it to restore the theme color' },
	{ id: 'valAxisTitleFontFace', type: 'structured', valueType: 'font-family', semanticPath: 'valAxisTitleFontFace', serializer: 'native c:valAx/c:title/c:txPr/a:latin/@typeface', reset: 'set valAxisTitleFontFace to null or omit it to restore the theme font' },
	{ id: 'valAxisTitleFontSize', type: 'continuous', valueType: 'number', minimum: 1, maximum: 400, default: null, step: 0.1, unit: 'points', semanticPath: 'valAxisTitleFontSize', serializer: 'native c:valAx/c:title/c:txPr/a:defRPr/@sz', reset: 'set valAxisTitleFontSize to null or omit it to restore the theme size' },
	{ id: 'valAxisTitleRotate', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 0.1, unit: 'degrees', semanticPath: 'valAxisTitleRotate', serializer: 'native c:valAx/c:title/c:txPr/a:bodyPr/@rot', reset: 'set valAxisTitleRotate to null or omit it to restore zero rotation' },
	{ id: 'valLabelFormatCode', type: 'structured', valueType: 'format-code', semanticPath: 'valLabelFormatCode', serializer: 'native c:valAx/c:numFmt/@formatCode', reset: 'set valLabelFormatCode to null or omit it to restore the source number format' },
])

const CHART_FORMAT_NUMERIC_RULES = Object.freeze(Object.fromEntries(CHART_FORMAT_PARAMETERS.filter(item => item.type === 'continuous').map(item => [item.id, item])))
const CHART_FORMAT_ENUM_RULES = Object.freeze(Object.fromEntries(CHART_FORMAT_PARAMETERS.filter(item => Array.isArray(item.canonical)).map(item => [item.id, item.canonical])))
const CHART_FORMAT_BOOLEAN_FIELDS = Object.freeze(CHART_FORMAT_PARAMETERS.filter(item => item.valueType === 'boolean').map(item => item.id))
const CHART_FORMAT_COLOR_FIELDS = Object.freeze(CHART_FORMAT_PARAMETERS.filter(item => item.type === 'color').map(item => item.id))
const CHART_FORMAT_STRING_FIELDS = Object.freeze(CHART_FORMAT_PARAMETERS.filter(item => ['string', 'font-family', 'format-code'].includes(item.valueType)).map(item => item.id))

function validateChartFormatNumber(value, rule, path) {
	if (value === undefined || value === null) return
	if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number.`)
	if (value < rule.minimum || value > rule.maximum) throw new Error(`${path} must be between ${rule.minimum} and ${rule.maximum}.`)
	if (rule.step >= 1 && Math.abs(value - Math.round(value)) > 1e-9) throw new Error(`${path} must use a ${rule.step}-unit step.`)
}

export function validateChartFormatOptions(value, path = 'chartOptions') {
	if (value === undefined || value === null) return value
	if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object or null.`)
	for (const [key, rule] of Object.entries(CHART_FORMAT_NUMERIC_RULES)) validateChartFormatNumber(value[key], rule, `${path}.${key}`)
	for (const [key, values] of Object.entries(CHART_FORMAT_ENUM_RULES)) {
		if (value[key] !== undefined && value[key] !== null && !values.includes(value[key])) throw new Error(`${path}.${key} must be one of ${values.join(', ')}.`)
	}
	for (const key of CHART_FORMAT_BOOLEAN_FIELDS) {
		if (value[key] !== undefined && value[key] !== null && typeof value[key] !== 'boolean') throw new Error(`${path}.${key} must be boolean or null.`)
	}
	for (const key of CHART_FORMAT_COLOR_FIELDS) if (value[key] !== undefined && value[key] !== null && (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > 128)) throw new Error(`${path}.${key} must be a non-empty color string no longer than 128 characters or null.`)
	for (const key of CHART_FORMAT_STRING_FIELDS) if (value[key] !== undefined && value[key] !== null && (typeof value[key] !== 'string' || value[key].length > 4096)) throw new Error(`${path}.${key} must be a string no longer than 4096 characters or null.`)
	for (const key of ['chartColors', 'invertedColors']) if (value[key] !== undefined && value[key] !== null && (!Array.isArray(value[key]) || value[key].length > 256 || value[key].some(color => typeof color !== 'string' || !color.trim() || color.length > 128))) throw new Error(`${path}.${key} must contain at most 256 non-empty color strings or null.`)
	for (const key of ['catAxisCrossesAt', 'valAxisCrossesAt']) if (value[key] !== undefined && value[key] !== null && value[key] !== 'autoZero' && (typeof value[key] !== 'number' || !Number.isFinite(value[key]))) throw new Error(`${path}.${key} must be a finite number, autoZero, or null.`)
	for (const key of ['chartArea', 'plotArea']) {
		const area = value[key]
		if (area === undefined || area === null) continue
		if (typeof area !== 'object' || Array.isArray(area)) throw new Error(`${path}.${key} must be an object or null.`)
		for (const sub of ['fill', 'border']) if (area[sub] !== undefined && area[sub] !== null && (typeof area[sub] !== 'object' || Array.isArray(area[sub]))) throw new Error(`${path}.${key}.${sub} must be an object or null.`)
		for (const sub of Object.keys(area)) if (!['fill', 'border', 'roundedCorners'].includes(sub)) throw new Error(`${path}.${key}.${sub} is not part of the public chart-area contract.`)
		if (area.roundedCorners !== undefined && area.roundedCorners !== null && typeof area.roundedCorners !== 'boolean') throw new Error(`${path}.${key}.roundedCorners must be boolean or null.`)
	}
	for (const key of ['catGridLine', 'valGridLine', 'serGridLine']) {
		const grid = value[key]
		if (grid === undefined || grid === null) continue
		if (!grid || typeof grid !== 'object' || Array.isArray(grid)) throw new Error(`${path}.${key} must be an object or null.`)
		for (const sub of Object.keys(grid)) if (!['cap', 'color', 'size', 'style'].includes(sub)) throw new Error(`${path}.${key}.${sub} is not part of the public grid-line contract.`)
		if (grid.style !== undefined && grid.style !== null && !['solid', 'dash', 'dot', 'none'].includes(grid.style)) throw new Error(`${path}.${key}.style must be solid, dash, dot, none, or null.`)
		if (grid.size !== undefined && grid.size !== null && (typeof grid.size !== 'number' || !Number.isFinite(grid.size) || grid.size < 0 || grid.size > 1584)) throw new Error(`${path}.${key}.size must be between 0 and 1584 points or null.`)
	}
	for (const key of ['layout', 'titlePos']) {
		const position = value[key]
		if (position === undefined || position === null) continue
		if (!position || typeof position !== 'object' || Array.isArray(position)) throw new Error(`${path}.${key} must be an object or null.`)
		for (const sub of Object.keys(position)) {
			if (!['x', 'y', 'w', 'h'].includes(sub)) throw new Error(`${path}.${key}.${sub} is not part of the public position contract.`)
			if (position[sub] !== undefined && position[sub] !== null && (typeof position[sub] !== 'number' || !Number.isFinite(position[sub]))) throw new Error(`${path}.${key}.${sub} must be a finite number or null.`)
		}
	}
	for (const key of ['catAxes', 'valAxes']) if (value[key] !== undefined && value[key] !== null && (!Array.isArray(value[key]) || value[key].length > 2 || value[key].some(axis => !axis || typeof axis !== 'object' || Array.isArray(axis)))) throw new Error(`${path}.${key} must contain at most two axis objects or null.`)
	return value
}

// Native table formatting is split between table properties and per-cell
// properties.  Publish both layers as one typed contract so a client can move
// beyond Table Design tiles without smuggling an unbounded options object.
export const TABLE_FORMAT_PARAMETERS = Object.freeze([
	{ id: 'headerRow', type: 'discrete', valueType: 'boolean', default: true, semanticPath: 'tableOptions.headerRow', serializer: 'native a:tblPr/a:tableStyleInfo/@firstRow', reset: 'set headerRow to null or omit to restore the selected style default' },
	{ id: 'totalRow', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'tableOptions.totalRow', serializer: 'native a:tblPr/a:tableStyleInfo/@lastRow', reset: 'set totalRow to null or omit to restore the selected style default' },
	{ id: 'firstColumn', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'tableOptions.firstColumn', serializer: 'native a:tblPr/a:tableStyleInfo/@firstCol', reset: 'set firstColumn to null or omit to restore the selected style default' },
	{ id: 'lastColumn', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'tableOptions.lastColumn', serializer: 'native a:tblPr/a:tableStyleInfo/@lastCol', reset: 'set lastColumn to null or omit to restore the selected style default' },
	{ id: 'bandedRows', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'tableOptions.bandedRows', serializer: 'native a:tblPr/a:tableStyleInfo/@rowBanded', reset: 'set bandedRows to null or omit to restore the selected style default' },
	{ id: 'bandedColumns', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'tableOptions.bandedColumns', serializer: 'native a:tblPr/a:tableStyleInfo/@colBanded', reset: 'set bandedColumns to null or omit to restore the selected style default' },
	{ id: 'fontFace', type: 'structured', valueType: 'font-family', semanticPath: 'tableOptions.fontFace', serializer: 'native a:tbl/c:txBody/a:p/a:rPr/@typeface', reset: 'set fontFace to null or omit to restore the theme font' },
	{ id: 'fontSize', type: 'continuous', valueType: 'number', minimum: 1, maximum: 400, default: 12, step: 0.1, unit: 'points', semanticPath: 'tableOptions.fontSize', serializer: 'native a:rPr/@sz', reset: 'set fontSize to null or omit to restore the table default' },
	{ id: 'color', type: 'color', valueType: 'hex-or-theme', semanticPath: 'tableOptions.color', serializer: 'native a:rPr/a:solidFill', reset: 'set color to null or omit to restore the theme color' },
	{ id: 'bold', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'tableOptions.bold', serializer: 'native a:rPr/@b', reset: 'set bold to null or omit to restore the table default' },
	{ id: 'italic', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'tableOptions.italic', serializer: 'native a:rPr/@i', reset: 'set italic to null or omit to restore the table default' },
	{ id: 'align', type: 'discrete', canonical: ['left', 'center', 'right', 'justify'], semanticPath: 'tableOptions.align', serializer: 'native a:pPr/@algn', reset: 'set align to null or omit to restore left alignment' },
	{ id: 'valign', type: 'discrete', canonical: ['top', 'middle', 'bottom'], semanticPath: 'tableOptions.valign', serializer: 'native a:tc/a:tcPr/a:anchor', reset: 'set valign to null or omit to restore middle alignment' },
	{ id: 'fill', type: 'structured', valueType: 'fill', semanticPath: 'tableOptions.fill', serializer: 'native a:tc/a:tcPr/a:solidFill|a:gradFill', reset: 'set fill to null or omit to restore the selected style fill' },
	{ id: 'border', type: 'structured', valueType: 'border-or-four-sides', semanticPath: 'tableOptions.border', serializer: 'native a:tc/a:tcPr/a:ln*', reset: 'set border to null or omit to restore the selected style border' },
	{ id: 'margin', type: 'structured', valueType: 'inches-or-four-sides', semanticPath: 'tableOptions.margin', serializer: 'native a:tc/a:tcPr/@marL/@marR/@marT/@marB', reset: 'set margin to null or omit to restore the table default padding' },
	{ id: 'colW', type: 'structured', valueType: 'number-or-number-array', minimum: 0, maximum: 56, step: 0.001, unit: 'inches', semanticPath: 'tableOptions.colW', serializer: 'native a:tblGrid/a:gridCol/@w', reset: 'set colW to null or omit to restore equal-width columns' },
	{ id: 'rowH', type: 'structured', valueType: 'number-or-number-array', minimum: 0, maximum: 56, step: 0.001, unit: 'inches', semanticPath: 'tableOptions.rowH', serializer: 'native a:tr/@h', reset: 'set rowH to null or omit to restore equal-height rows' },
	{ id: 'autoPage', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'tableOptions.autoPage', serializer: 'native engine table pagination', reset: 'set autoPage to null or omit to disable auto-page' },
	{ id: 'autoPageRepeatHeader', type: 'discrete', valueType: 'boolean', default: false, applicability: ['autoPage'], semanticPath: 'tableOptions.autoPageRepeatHeader', serializer: 'native engine repeated header rows', reset: 'set autoPageRepeatHeader to null or omit to disable repeated headers' },
	{ id: 'autoPageHeaderRows', type: 'continuous', valueType: 'integer', minimum: 1, maximum: 1000, default: 1, step: 1, unit: 'rows', applicability: ['autoPage'], semanticPath: 'tableOptions.autoPageHeaderRows', serializer: 'native engine repeated header row count', reset: 'set autoPageHeaderRows to null or omit to restore one header row' },
	{ id: 'autoPageCharWeight', type: 'continuous', valueType: 'number', minimum: -1, maximum: 1, default: 0, step: 0.01, unit: 'normalized', applicability: ['autoPage'], semanticPath: 'tableOptions.autoPageCharWeight', serializer: 'native engine pagination weight', reset: 'set autoPageCharWeight to null or omit to restore neutral wrapping' },
	{ id: 'autoPageLineWeight', type: 'continuous', valueType: 'number', minimum: -1, maximum: 1, default: 0, step: 0.01, unit: 'normalized', applicability: ['autoPage'], semanticPath: 'tableOptions.autoPageLineWeight', serializer: 'native engine pagination weight', reset: 'set autoPageLineWeight to null or omit to restore neutral paging' },
	{ id: 'autoPageSlideStartY', type: 'continuous', valueType: 'number', minimum: 0, maximum: 56, default: 0, step: 0.001, unit: 'inches', applicability: ['autoPage'], semanticPath: 'tableOptions.autoPageSlideStartY', serializer: 'native engine pagination start', reset: 'set autoPageSlideStartY to null or omit to restore the slide margin' },
	{ id: 'cellFill', type: 'structured', valueType: 'fill', semanticPath: 'rows[].options.fill', serializer: 'native a:tc/a:tcPr/a:solidFill|a:gradFill', reset: 'set cell fill to null or omit to inherit the table/style fill' },
	{ id: 'cellBorder', type: 'structured', valueType: 'border-or-four-sides', semanticPath: 'rows[].options.border', serializer: 'native a:tc/a:tcPr/a:ln*', reset: 'set cell border to null or omit to inherit the table/style border' },
	{ id: 'cellMargin', type: 'structured', valueType: 'inches-or-four-sides', semanticPath: 'rows[].options.margin', serializer: 'native a:tc/a:tcPr/@marL/@marR/@marT/@marB', reset: 'set cell margin to null or omit to inherit the table padding' },
	{ id: 'cellFontSize', type: 'continuous', valueType: 'number', minimum: 1, maximum: 400, default: null, step: 0.1, unit: 'points', semanticPath: 'rows[].options.fontSize', serializer: 'native a:rPr/@sz', reset: 'set cell fontSize to null or omit to inherit the table font size' },
	{ id: 'cellFontFace', type: 'structured', valueType: 'font-family', semanticPath: 'rows[].options.fontFace', serializer: 'native a:rPr/@typeface', reset: 'set cell fontFace to null or omit to inherit the table font' },
	{ id: 'cellColor', type: 'color', valueType: 'hex-or-theme', semanticPath: 'rows[].options.color', serializer: 'native a:rPr/a:solidFill', reset: 'set cell color to null or omit to inherit the table text color' },
	{ id: 'cellBold', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'rows[].options.bold', serializer: 'native a:rPr/@b', reset: 'set cell bold to null or omit to inherit the table default' },
	{ id: 'cellItalic', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'rows[].options.italic', serializer: 'native a:rPr/@i', reset: 'set cell italic to null or omit to inherit the table default' },
	{ id: 'cellAlign', type: 'discrete', canonical: ['left', 'center', 'right', 'justify'], semanticPath: 'rows[].options.align', serializer: 'native a:pPr/@algn', reset: 'set cell align to null or omit to inherit the table alignment' },
	{ id: 'cellValign', type: 'discrete', canonical: ['top', 'middle', 'bottom'], semanticPath: 'rows[].options.valign', serializer: 'native a:tc/a:tcPr/a:anchor', reset: 'set cell valign to null or omit to inherit the table alignment' },
	{ id: 'cellColspan', type: 'continuous', valueType: 'integer', minimum: 1, maximum: 1000, default: 1, step: 1, unit: 'columns', semanticPath: 'rows[].options.colspan', serializer: 'native a:gridSpan/@val', reset: 'set cell colspan to null or omit to restore one column' },
	{ id: 'cellRowspan', type: 'continuous', valueType: 'integer', minimum: 1, maximum: 1000, default: 1, step: 1, unit: 'rows', semanticPath: 'rows[].options.rowspan', serializer: 'native a:vMerge', reset: 'set cell rowspan to null or omit to restore one row' },
	{ id: 'cellAutoPageCharWeight', type: 'continuous', valueType: 'number', minimum: -1, maximum: 1, default: 0, step: 0.01, unit: 'normalized', applicability: ['autoPage'], semanticPath: 'rows[].options.autoPageCharWeight', serializer: 'native engine pagination weight', reset: 'set cell autoPageCharWeight to null or omit to restore neutral wrapping' },
	{ id: 'cellAutoPageLineWeight', type: 'continuous', valueType: 'number', minimum: -1, maximum: 1, default: 0, step: 0.01, unit: 'normalized', applicability: ['autoPage'], semanticPath: 'rows[].options.autoPageLineWeight', serializer: 'native engine pagination weight', reset: 'set cell autoPageLineWeight to null or omit to restore neutral paging' },
])

const TABLE_FORMAT_NUMERIC_RULES = Object.freeze({
	...Object.fromEntries(TABLE_FORMAT_PARAMETERS.filter(item => item.type === 'continuous').map(item => [item.id, item])),
	colW: { minimum: 0, maximum: 56, step: 0.001 },
	rowH: { minimum: 0, maximum: 56, step: 0.001 },
})
const TABLE_FORMAT_ENUM_RULES = Object.freeze(Object.fromEntries(TABLE_FORMAT_PARAMETERS.filter(item => Array.isArray(item.canonical)).map(item => [item.id, item.canonical])))

function validateTableFormatNumber(value, rule, path) {
	if (value === undefined || value === null) return
	if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number.`)
	if (value < rule.minimum || value > rule.maximum) throw new Error(`${path} must be between ${rule.minimum} and ${rule.maximum}.`)
	if (rule.step >= 1 && Math.abs(value - Math.round(value)) > 1e-9) throw new Error(`${path} must use a ${rule.step}-unit step.`)
}

export function validateTableFormatOptions(value, path = 'tableOptions') {
	if (value === undefined || value === null) return value
	if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object or null.`)
	for (const [key, rule] of Object.entries(TABLE_FORMAT_NUMERIC_RULES)) {
		if (key === 'colW' || key === 'rowH') continue
		validateTableFormatNumber(value[key], rule, `${path}.${key}`)
	}
	for (const [key, values] of Object.entries(TABLE_FORMAT_ENUM_RULES)) if (value[key] !== undefined && value[key] !== null && !values.includes(value[key])) throw new Error(`${path}.${key} must be one of ${values.join(', ')}.`)
	for (const key of ['headerRow', 'totalRow', 'firstColumn', 'lastColumn', 'bandedRows', 'bandedColumns', 'bold', 'italic', 'autoPage', 'autoPageRepeatHeader']) if (value[key] !== undefined && value[key] !== null && typeof value[key] !== 'boolean') throw new Error(`${path}.${key} must be boolean or null.`)
	for (const key of ['colW', 'rowH']) {
		const raw = value[key]
		if (raw === undefined || raw === null) continue
		const values = Array.isArray(raw) ? raw : [raw]
		values.forEach((item, index) => validateTableFormatNumber(item, TABLE_FORMAT_NUMERIC_RULES[key], `${path}.${key}[${index}]`))
	}
	if (value.fill !== undefined && value.fill !== null && (typeof value.fill !== 'object' || Array.isArray(value.fill))) throw new Error(`${path}.fill must be an object or null.`)
	if (value.border !== undefined && value.border !== null && !((typeof value.border === 'object' && !Array.isArray(value.border)) || (Array.isArray(value.border) && value.border.length === 4 && value.border.every(side => side === null || (typeof side === 'object' && !Array.isArray(side)))))) throw new Error(`${path}.border must be one border object, exactly four border-side objects, or null.`)
	if (value.margin !== undefined && value.margin !== null && !(typeof value.margin === 'number' || (Array.isArray(value.margin) && value.margin.length === 4))) throw new Error(`${path}.margin must be a number or four-side array.`)
	return value
}

export function validateTableCellOptions(value, path = 'rows[].options') {
	if (value === undefined || value === null) return value
	if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object or null.`)
	const rules = {
		fontSize: TABLE_FORMAT_NUMERIC_RULES.cellFontSize,
		colspan: TABLE_FORMAT_NUMERIC_RULES.cellColspan,
		rowspan: TABLE_FORMAT_NUMERIC_RULES.cellRowspan,
		autoPageCharWeight: TABLE_FORMAT_NUMERIC_RULES.cellAutoPageCharWeight,
		autoPageLineWeight: TABLE_FORMAT_NUMERIC_RULES.cellAutoPageLineWeight,
	}
	for (const [key, rule] of Object.entries(rules)) validateTableFormatNumber(value[key], rule, `${path}.${key}`)
	for (const [key, values] of Object.entries({ align: ['left', 'center', 'right', 'justify'], valign: ['top', 'middle', 'bottom'] })) if (value[key] !== undefined && value[key] !== null && !values.includes(value[key])) throw new Error(`${path}.${key} must be one of ${values.join(', ')}.`)
	for (const key of ['bold', 'italic']) if (value[key] !== undefined && value[key] !== null && typeof value[key] !== 'boolean') throw new Error(`${path}.${key} must be boolean or null.`)
	if (value.fill !== undefined && value.fill !== null && (typeof value.fill !== 'object' || Array.isArray(value.fill))) throw new Error(`${path}.fill must be an object or null.`)
	if (value.border !== undefined && value.border !== null && !((typeof value.border === 'object' && !Array.isArray(value.border)) || (Array.isArray(value.border) && value.border.length === 4 && value.border.every(side => side === null || (typeof side === 'object' && !Array.isArray(side)))))) throw new Error(`${path}.border must be one border object, exactly four border-side objects, or null.`)
	if (value.margin !== undefined && value.margin !== null && !(typeof value.margin === 'number' || (Array.isArray(value.margin) && value.margin.length === 4))) throw new Error(`${path}.margin must be a number or four-side array.`)
	return value
}

// Native DrawingML underline selectors exposed by PowerPoint. The historical
// library type misspelled dotDashHeavy as dotDashHeave; the public/native
// contract uses the real Office selector and accepts the typo as an alias.
export const TEXT_UNDERLINE_STYLES = Object.freeze([
	'dash', 'dashHeavy', 'dashLong', 'dashLongHeavy', 'dbl', 'dotDash',
	'dotDashHeavy', 'dotDotDash', 'dotDotDashHeavy', 'dotted', 'dottedHeavy',
	'heavy', 'none', 'sng', 'wavy', 'wavyDbl', 'wavyHeavy',
])

// DrawingML object rotation is an angle in degrees persisted as a 1/60000
// degree fixed-point value. Keep the public contract in the same signed range
// documented by the library while rejecting values that cannot survive the
// native serializer without quantization drift.
export const OBJECT_ROTATION_MIN_DEGREES = -360
export const OBJECT_ROTATION_MAX_DEGREES = 360
export const OBJECT_ROTATION_SERIALIZER_STEPS_PER_DEGREE = 60000

// Native object-frame reflection is persisted as boolean flipH/flipV flags on
// the same DrawingML transform carrier as rotation. Null is an explicit reset
// (the serializer omits the attribute and restores the native false default).
export function normalizeObjectFlip(value, path = 'flip') {
	if (value === undefined || value === null) return value
	if (typeof value !== 'boolean') throw new Error(`${path} must be boolean or null.`)
	return value
}

// Image framing is a semantic fit selector. The Director owns the target box;
// the native library owns the resulting srcRect/stretch serialization. Keep
// the public type narrow so a client cannot smuggle a second geometry model.
export function normalizeImageSizing(value, path = 'sizing') {
	return normalizeImageFraming(value, path, { allowEngineGeometry: true })
}

const TEXT_UNDERLINE_STYLE_ALIASES = Object.freeze({
	dotDashHeave: 'dotDashHeavy',
	single: 'sng',
	double: 'dbl',
	none: 'none',
})

import { SHAPE_STYLE_PRESETS, WORDART_STYLE_PRESETS } from './native-style-presets.mjs'
import { SHAPE_EFFECT_PRESETS, TEXT_EFFECT_PRESETS } from './native-effect-presets.mjs'
import { PICTURE_STYLE_3D_PARAMETER_CATALOG, PICTURE_STYLE_COLOR_PARAMETER_CATALOG, PICTURE_STYLE_COMPONENT_OWNERSHIP, PICTURE_STYLE_LINE_PARAMETER_CATALOG, PICTURE_STYLE_OVERRIDE_FIELDS, PICTURE_STYLE_PUBLIC_SCHEMA, PICTURE_STYLE_RESET_BEHAVIOR, PICTURE_STYLE_PRESETS, publicPictureStylePresets } from './picture-style-presets.mjs'
import { MODEL3D_VIEW_PRESETS } from './model3d-view-presets.mjs'
import { MODEL3D_AUTHORING_CAPABILITY_CONTRACT } from './model3d-authoring-family-contract.mjs'
import { matchNativeVisualSurface, RESET_3D_COMPONENT } from './ir/native-visual-primitives.mjs'
import {
	WORDART_ADJUSTMENT_TRANSFORMS,
	WORDART_ADJUSTMENT_TRANSFORM_SET,
	WORDART_TRANSFORM_ALIASES,
	WORDART_TRANSFORM_CONTRACT,
	WORDART_TRANSFORM_PUBLIC_SCHEMA,
	WORDART_TRANSFORMS,
	WORDART_TRANSFORM_SET,
	isValidWordArtTransform,
	normalizeWordArtOptions,
	normalizeWordArtPatch,
	normalizeWordArtTransform,
} from './wordart-transform-contract.mjs'
export {
	WORDART_ADJUSTMENT_TRANSFORMS,
	WORDART_ADJUSTMENT_TRANSFORM_SET,
	WORDART_TRANSFORM_ALIASES,
	WORDART_TRANSFORM_CONTRACT,
	WORDART_TRANSFORM_PUBLIC_SCHEMA,
	WORDART_TRANSFORMS,
	WORDART_TRANSFORM_SET,
	isValidWordArtTransform,
	normalizeWordArtOptions,
	normalizeWordArtPatch,
	normalizeWordArtTransform,
} from './wordart-transform-contract.mjs'

const SHAPE_EFFECT_OVERRIDE_SURFACE_IDS = Object.freeze(['shadow', 'glow', 'reflection', 'softEdge', 'blur', 'fillOverlay', 'effects', 'shape3D'])

function shapeEffectOverrideParameters() {
	return SHAPE_EFFECT_OVERRIDE_SURFACE_IDS.flatMap(surfaceId => {
		const surface = matchNativeVisualSurface(surfaceId)[0]
		if (!surface) return []
		const parameters = Array.isArray(surface.parameters) ? surface.parameters : Object.values(surface.parameters || {}).flat()
		return [{
			id: surfaceId,
			type: 'compound',
			valueType: 'object',
			semanticPath: surface.field,
			parameters,
			reset: surface.resetBehavior,
			applicability: surface.applicability,
			capabilityMode: surface.capabilityMode || 'parameterized',
			capabilityStatus: surface.capabilityStatus || 'executable-exact-structured',
		}]
	})
}

const STYLE_PRESET_OVERRIDE_SURFACE_IDS = Object.freeze({
	shape: ['fill', 'line', 'shadow', 'glow', 'reflection', 'softEdge', 'blur', 'fillOverlay', 'effects', 'shape3D'],
	wordArt: ['fill', 'line', 'shadow', 'glow', 'reflection', 'softEdge', 'effects', 'textFill', 'textOutline', 'text3D', 'wordArt'],
	textEffect: ['shadow', 'glow', 'reflection', 'softEdge', 'effects', 'textFill', 'textOutline', 'text3D'],
})

function stylePresetOverrideParameters(kind) {
	return STYLE_PRESET_OVERRIDE_SURFACE_IDS[kind].flatMap(surfaceId => {
		const surface = matchNativeVisualSurface(surfaceId)[0]
		if (!surface) return []
		const parameters = Array.isArray(surface.parameters) ? surface.parameters : Object.values(surface.parameters || {}).flat()
		return [{
			id: surfaceId,
			type: 'compound',
			valueType: 'object',
			semanticPath: surface.field,
			parameters,
			reset: surface.resetBehavior,
			applicability: surface.applicability,
			capabilityMode: surface.capabilityMode || 'parameterized',
			capabilityStatus: surface.capabilityStatus || 'executable-exact-structured',
		}]
	})
}

// Text Outline is a distinct Text Options surface.  It targets the glyph
// stroke (<a:rPr>/<a:ln>) rather than the containing shape border (`line`).
// Keep the semantic contract independent so sparse patches cannot accidentally
// restyle the text-box panel.
export function normalizeTextOutline(value, path = 'textOutline') {
	if (value == null) return value
	if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object or null.`)
	const out = { ...value }
	if (out.color !== undefined && out.color !== null) {
		if (typeof out.color !== 'string' || !out.color.trim()) throw new Error(`${path}.color must be a non-empty color string.`)
		out.color = out.color.replace(/^#/, '')
	}
	if (out.transparency !== undefined && out.transparency !== null) {
		const raw = Number(out.transparency)
		if (!Number.isFinite(raw) || raw < 0 || raw > 100) throw new Error(`${path}.transparency must be between 0 and 100 percent.`)
		const rounded = Math.round(raw * 1000) / 1000
		if (Math.abs(raw - rounded) > 1e-9) throw new Error(`${path}.transparency must use a 0.001 percentage-point step.`)
		out.transparency = rounded
	}
	const width = out.widthPt ?? out.size
	if (width !== undefined && width !== null) {
		const raw = Number(width)
		if (!Number.isFinite(raw) || raw < 0 || raw > 100) throw new Error(`${path}.widthPt must be between 0 and 100 points.`)
		const rounded = Math.round(raw * 1000) / 1000
		if (Math.abs(raw - rounded) > 1e-9) throw new Error(`${path}.widthPt must use a 0.001-point step.`)
		out.widthPt = rounded
		delete out.size
	}
	return out
}

export function normalizeTextUnderline(value, path = 'underline') {
	if (value == null || value === false) return value
	if (value === true) return { style: 'sng' }
	let out
	if (typeof value === 'string') out = { style: value }
	else if (typeof value === 'object' && !Array.isArray(value)) out = { ...value }
	else throw new Error(`${path} must be boolean, a native underline style, an object, or null.`)
	const rawStyle = out.style === undefined || out.style === null ? 'sng' : String(out.style).trim()
	const styleKey = rawStyle || 'sng'
	const canonical = TEXT_UNDERLINE_STYLE_ALIASES[styleKey] || styleKey
	if (!TEXT_UNDERLINE_STYLES.includes(canonical)) throw new Error(`${path}.style must be one of ${TEXT_UNDERLINE_STYLES.join(', ')}.`)
	out.style = canonical
	if (out.color !== undefined && out.color !== null) {
		if (typeof out.color !== 'string' || !out.color.trim()) throw new Error(`${path}.color must be a non-empty hex or theme color string.`)
		out.color = out.color.replace(/^#/, '').trim()
	}
	return out
}

export function normalizeObjectRotation(value, path = 'rotate') {
	if (value === undefined || value === null) return value
	const raw = Number(value)
	if (!Number.isFinite(raw) || raw < OBJECT_ROTATION_MIN_DEGREES || raw > OBJECT_ROTATION_MAX_DEGREES) {
		throw new Error(`${path} must be between ${OBJECT_ROTATION_MIN_DEGREES} and ${OBJECT_ROTATION_MAX_DEGREES} degrees.`)
	}
	const scaled = raw * OBJECT_ROTATION_SERIALIZER_STEPS_PER_DEGREE
	const quantized = Math.round(scaled)
	if (Math.abs(scaled - quantized) > 1e-7) {
		throw new Error(`${path} must use a 1/${OBJECT_ROTATION_SERIALIZER_STEPS_PER_DEGREE}-degree step.`)
	}
	return quantized / OBJECT_ROTATION_SERIALIZER_STEPS_PER_DEGREE
}

// Character spacing is stored by DrawingML on the text run as `spc` in
// hundredths of a point. Keep the public contract in points, with the exact
// serializer precision and the full signed authoring range exposed.
export function normalizeCharSpacing(value, path = 'charSpacing') {
	if (value == null) return value
	const raw = Number(value)
	if (!Number.isFinite(raw) || raw < -100 || raw > 100) throw new Error(`${path} must be between -100 and 100 points.`)
	const rounded = Math.round(raw * 100) / 100
	if (Math.abs(raw - rounded) > 1e-9) throw new Error(`${path} must use a 0.01-point step.`)
	return rounded
}

export function normalizeLineSpacing(value, path = 'lineSpacing') {
	if (value == null) return value
	const raw = Number(value)
	if (!Number.isFinite(raw) || raw < 0 || raw > 400) throw new Error(`${path} must be between 0 and 400 points.`)
	const rounded = Math.round(raw * 100) / 100
	if (Math.abs(raw - rounded) > 1e-9) throw new Error(`${path} must use a 0.01-point step.`)
	return rounded
}

export function normalizeLineSpacingMultiple(value, path = 'lineSpacingMultiple') {
	if (value == null) return value
	const raw = Number(value)
	if (!Number.isFinite(raw) || raw < 0 || raw > 9.99) throw new Error(`${path} must be between 0 and 9.99.`)
	const rounded = Math.round(raw * 100000) / 100000
	if (Math.abs(raw - rounded) > 1e-9) throw new Error(`${path} must use a 0.00001 step.`)
	return rounded
}

// Paragraph before/after spacing is authored in points by PowerPoint's
// paragraph dialog and serialized as a:spcBef/a:spcAft/a:spcPts. Keep the
// two leaves independent so a sparse patch or null reset cannot shadow the
// other paragraph edge.
export function normalizeParagraphSpacing(value, path = 'paragraphSpacing') {
	if (value == null) return value
	const raw = Number(value)
	if (!Number.isFinite(raw) || raw < 0 || raw > 400) throw new Error(`${path} must be between 0 and 400 points.`)
	const rounded = Math.round(raw * 100) / 100
	if (Math.abs(raw - rounded) > 1e-9) throw new Error(`${path} must use a 0.01-point step.`)
	return rounded
}

export function normalizeParagraphIndent(value, path = 'indent') {
	if (value == null) return value
	const raw = Number(value)
	if (!Number.isFinite(raw) || raw < 0 || raw > 400) throw new Error(`${path} must be between 0 and 400 points.`)
	const rounded = Math.round(raw * 100) / 100
	if (Math.abs(raw - rounded) > 1e-9) throw new Error(`${path} must use a 0.01-point step.`)
	return rounded
}

// Text-box insets are persisted by DrawingML bodyPr in points.  The public
// contract accepts either one scalar applied to all four sides or the native
// [top, right, bottom, left] tuple; both forms use the same bounded 0.01-point
// precision so sparse patches and null resets are deterministic.
export function normalizeTextBoxMargin(value, path = 'margin') {
	if (value == null) return value
	const normalize = (raw, leaf) => {
		const n = Number(raw)
		if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${path}${leaf} must be between 0 and 100 points.`)
		const rounded = Math.round(n * 100) / 100
		if (Math.abs(n - rounded) > 1e-9) throw new Error(`${path}${leaf} must use a 0.01-point step.`)
		return rounded
	}
	if (typeof value === 'number') return normalize(value, '')
	if (Array.isArray(value)) {
		if (value.length !== 4) throw new Error(`${path} must be a number or a four-number [top,right,bottom,left] array.`)
		return value.map((item, index) => normalize(item, `[${index}]`))
	}
	throw new Error(`${path} must be a number, a four-number array, or null.`)
}

export function normalizeTextVerticalAlign(value, path = 'valign') {
	if (value == null) return value
	if (typeof value !== 'string') throw new Error(`${path} must be top, middle, or bottom.`)
	const key = value.trim().toLowerCase()
	const aliases = { t: 'top', top: 'top', ctr: 'middle', center: 'middle', middle: 'middle', m: 'middle', b: 'bottom', bottom: 'bottom' }
	if (!aliases[key]) throw new Error(`${path} must be top, middle, or bottom.`)
	return aliases[key]
}

// Paragraph alignment is a native pPr enum.  Keep aliases at the public
// boundary so imported OOXML tokens and authored prose both converge on the
// four PptxGenJS values that the serializer can emit exactly.
export function normalizeTextAlignment(value, path = 'align') {
	if (value == null) return value
	if (typeof value !== 'string') throw new Error(`${path} must be left, center, right, or justify.`)
	const key = value.trim().toLowerCase()
	const aliases = { l: 'left', left: 'left', c: 'center', ctr: 'center', center: 'center', centre: 'center', r: 'right', right: 'right', j: 'justify', just: 'justify', justify: 'justify' }
	if (!aliases[key]) throw new Error(`${path} must be left, center, right, or justify.`)
	return aliases[key]
}

export function normalizeTextRtlMode(value, path = 'rtlMode') {
	if (value == null || typeof value === 'boolean') return value
	if (typeof value === 'string') {
		const key = value.trim().toLowerCase()
		if (key === 'true' || key === 'rtl' || key === '1') return true
		if (key === 'false' || key === 'ltr' || key === '0') return false
	}
	throw new Error(`${path} must be boolean or null.`)
}

export function normalizeTextLanguage(value, path = 'lang') {
	if (value == null) return value
	if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} must be a non-empty BCP-47 language tag or null.`)
	const normalized = value.trim()
	if (normalized.length > 35 || !/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/.test(normalized)) throw new Error(`${path} must be a non-empty BCP-47 language tag or null.`)
	return normalized.replace(/_/g, '-')
}

export function normalizeTextFit(value, path = 'fit') {
	if (value == null) return value
	if (typeof value !== 'string') throw new Error(`${path} must be none, shrink, or resize; received ${JSON.stringify(value)}.`)
	const key = value.trim().toLowerCase()
	const aliases = { none: 'none', noautofit: 'none', noautofittext: 'none', shrink: 'shrink', normautofit: 'shrink', autofit: 'shrink', resize: 'resize', spautofit: 'resize', fitshape: 'resize' }
	if (!aliases[key]) throw new Error(`${path} must be none, shrink, or resize; received ${JSON.stringify(value)}.`)
	return aliases[key]
}

export function normalizeTextWrap(value, path = 'wrap') {
	if (value == null || typeof value === 'boolean') return value
	if (typeof value === 'string') {
		const key = value.trim().toLowerCase()
		if (key === 'square' || key === 'wrap' || key === 'true') return true
		if (key === 'none' || key === 'nowrap' || key === 'false') return false
	}
	throw new Error(`${path} must be boolean or null.`)
}

export function normalizeTextDirection(value, path = 'vert') {
	if (value == null) return value
	if (typeof value !== 'string') throw new Error(`${path} must be a native text direction.`)
	const key = value.trim().toLowerCase()
	const aliases = { horizontal: 'horz', horz: 'horz', vertical: 'vert', vert: 'vert', 'vertical270': 'vert270', vert270: 'vert270', 'wordartvertical': 'wordArtVert', wordartvert: 'wordArtVert', 'wordartverticalrtl': 'wordArtVertRtl', wordartvertrtl: 'wordArtVertRtl', 'eastasiavertical': 'eaVert', eavert: 'eaVert', mongolian: 'mongolianVert', mongolianvert: 'mongolianVert' }
	if (!aliases[key]) throw new Error(`${path} must be one of eaVert, horz, mongolianVert, vert, vert270, wordArtVert, or wordArtVertRtl.`)
	return aliases[key]
}

export function normalizeIndentLevel(value, path = 'indentLevel') {
	if (value == null) return value
	if (!Number.isInteger(value) || value < 0 || value > 8) throw new Error(`${path} must be an integer between 0 and 8.`)
	return value
}

export function normalizeBulletOptions(value, path = 'bullet') {
	if (value == null || typeof value === 'boolean') return value
	if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be boolean, null, or an object.`)
	const out = { ...value }
	if (out.type !== undefined && out.type !== null) {
		if (typeof out.type !== 'string' || !['bullet', 'number'].includes(out.type.trim().toLowerCase())) throw new Error(`${path}.type must be bullet, number, null, or omitted.`)
		out.type = out.type.trim().toLowerCase()
	}
	if (out.glyph !== undefined && out.glyph !== null) {
		if (typeof out.glyph !== 'string' || !TEXT_BULLET_GLYPHS[out.glyph.trim().toUpperCase()]) throw new Error(`${path}.glyph must be DEFAULT, CHECK, STAR, or TRIANGLE.`)
		out.glyph = out.glyph.trim().toUpperCase()
		const characterCode = TEXT_BULLET_GLYPHS[out.glyph]
		if (out.characterCode !== undefined && out.characterCode !== null && String(out.characterCode).toUpperCase() !== characterCode) {
			throw new Error(`${path}.glyph and ${path}.characterCode must identify the same bullet.`)
		}
		out.characterCode = characterCode
	}
	if (out.characterCode !== undefined && out.characterCode !== null) {
		if (typeof out.characterCode !== 'string' || !/^[0-9A-Fa-f]{4}$/.test(out.characterCode)) throw new Error(`${path}.characterCode must be exactly four hexadecimal digits.`)
		out.characterCode = out.characterCode.toUpperCase()
		const knownGlyph = Object.entries(TEXT_BULLET_GLYPHS).find(([, code]) => code === out.characterCode)?.[0]
		if (knownGlyph && out.glyph === undefined) out.glyph = knownGlyph
	}
	if (out.type === 'number' && (out.glyph !== undefined || out.characterCode !== undefined)) throw new Error(`${path} cannot combine a numbered bullet with a glyph or characterCode.`)
	if (out.none === true && Object.keys(out).some(key => !['none', 'color', 'font', 'fontSize'].includes(key))) throw new Error(`${path}.none cannot be combined with a bullet type, glyph, characterCode, numbering, or indentation.`)
	if (out.indent !== undefined && out.indent !== null) out.indent = normalizeParagraphIndent(out.indent, `${path}.indent`)
	if (out.marginPt !== undefined && out.marginPt !== null) out.marginPt = normalizeParagraphIndent(out.marginPt, `${path}.marginPt`)
	if (out.fontSize !== undefined && out.fontSize !== null) out.fontSize = normalizeParagraphIndent(out.fontSize, `${path}.fontSize`)
	if (out.numberStartAt !== undefined && out.numberStartAt !== null && (!Number.isInteger(out.numberStartAt) || out.numberStartAt < 1 || out.numberStartAt > 32767)) throw new Error(`${path}.numberStartAt must be an integer between 1 and 32767.`)
	if (out.startAt !== undefined && out.startAt !== null && (!Number.isInteger(Number(out.startAt)) || Number(out.startAt) < 1 || Number(out.startAt) > 32767)) throw new Error(`${path}.startAt must be an integer between 1 and 32767.`)
	if (out.startAt !== undefined && out.numberStartAt === undefined) out.numberStartAt = Number(out.startAt)
	if (out.numberType !== undefined && out.style === undefined) out.style = out.numberType
	if (out.style !== undefined && out.numberType === undefined) out.numberType = out.style
	return out
}

export function normalizeTextHyperlink(value, path = 'hyperlink') {
	return normalizeHyperlink(value, path)
}

export function normalizeTextField(value, path = 'field', context = {}) {
	if (value == null) return value
	if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object, null, or omitted.`)
	if (typeof value.type !== 'string' || !value.type.trim()) throw new Error(`${path}.type must be a non-empty native field type.`)
	const type = value.type.trim()
	let id = value.id
	if (id !== undefined && id !== null) {
		if (typeof id !== 'string' || !TEXT_FIELD_GUID.test(id.trim())) throw new Error(`${path}.id must be a GUID in {XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX} form.`)
		id = id.trim().toUpperCase()
	} else {
		id = deterministicTextFieldGuid(`${String(path)}:${type}:${context.text ?? ''}`)
	}
	return { id, type }
}

export function normalizeTabStops(value, path = 'tabStops') {
	if (value == null) return value
	if (!Array.isArray(value)) throw new Error(`${path} must be an array or null.`)
	if (value.length > 32) throw new Error(`${path} must contain at most 32 tab stops.`)
	return value.map((stop, index) => {
		if (!stop || typeof stop !== 'object' || Array.isArray(stop)) throw new Error(`${path}[${index}] must be an object.`)
		const out = { ...stop }
		const position = Number(out.position)
		if (!Number.isFinite(position) || position < 0 || position > 100) throw new Error(`${path}[${index}].position must be between 0 and 100 inches.`)
		const rounded = Math.round(position * 100) / 100
		if (Math.abs(position - rounded) > 1e-9) throw new Error(`${path}[${index}].position must use a 0.01-inch step.`)
		out.position = rounded
		if (out.alignment !== undefined && out.alignment !== null && !['l', 'r', 'ctr', 'dec'].includes(out.alignment)) throw new Error(`${path}[${index}].alignment must be l, r, ctr, or dec.`)
		return out
	})
}

export function normalizeRichRunOptions(value, path = 'run.options', context = {}) {
	if (value == null) return value
	if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
	const out = { ...value }
	for (const key of ['bold', 'italic', 'rtl', 'softBreakBefore', 'breakLine']) {
		if (out[key] !== undefined && out[key] !== null && typeof out[key] !== 'boolean') throw new Error(`${path}.${key} must be boolean or null.`)
	}
	if (out.fontFace !== undefined && out.fontFace !== null && (typeof out.fontFace !== 'string' || !out.fontFace.trim())) throw new Error(`${path}.fontFace must be a non-empty string or null.`)
	if (typeof out.fontFace === 'string') out.fontFace = out.fontFace.trim()
	if (out.fontFaceComplexScript !== undefined && out.fontFaceComplexScript !== null && (typeof out.fontFaceComplexScript !== 'string' || !out.fontFaceComplexScript.trim())) throw new Error(`${path}.fontFaceComplexScript must be a non-empty string or null.`)
	if (typeof out.fontFaceComplexScript === 'string') out.fontFaceComplexScript = out.fontFaceComplexScript.trim()
	if (out.fontSize !== undefined && out.fontSize !== null && (!Number.isFinite(out.fontSize) || out.fontSize <= 0 || out.fontSize > 400)) throw new Error(`${path}.fontSize must be greater than 0 and at most 400 points, or null.`)
	if (out.color !== undefined && out.color !== null) {
		if (typeof out.color !== 'string' || !/^#?[0-9A-Fa-f]{6}$/.test(out.color)) throw new Error(`${path}.color must be a six-digit hexadecimal color or null.`)
		out.color = out.color.replace(/^#/, '').toUpperCase()
	}
	if (out.baseline !== undefined && out.baseline !== null) {
		if (!Number.isFinite(out.baseline) || out.baseline < -100 || out.baseline > 100) throw new Error(`${path}.baseline must be between -100 and 100 percent at native 0.001 precision, or null.`)
		const rounded = Math.round(out.baseline * 1000) / 1000
		if (Math.abs(out.baseline - rounded) > 1e-9) throw new Error(`${path}.baseline must use native 0.001 precision.`)
		out.baseline = rounded
	}
	if (out.highlight !== undefined && out.highlight !== null) {
		if (typeof out.highlight !== 'string' || !out.highlight.trim()) throw new Error(`${path}.highlight must be a non-empty color string.`)
		out.highlight = out.highlight.replace(/^#/, '')
	}
	if (out.strike !== undefined && out.strike !== null && out.strike !== false && out.strike !== true && !['sngStrike', 'dblStrike'].includes(out.strike)) throw new Error(`${path}.strike must be boolean, sngStrike, or dblStrike.`)
	if (Object.prototype.hasOwnProperty.call(out, 'underline')) out.underline = normalizeTextUnderline(out.underline, `${path}.underline`)
	for (const key of ['superscript', 'subscript']) if (out[key] !== undefined && out[key] !== null && typeof out[key] !== 'boolean') throw new Error(`${path}.${key} must be boolean or null.`)
	if (out.superscript === true && out.subscript === true) throw new Error(`${path} cannot enable superscript and subscript together.`)
	if (out.baseline !== undefined && out.baseline !== null && (out.superscript === true || out.subscript === true)) throw new Error(`${path}.baseline cannot be combined with superscript or subscript.`)
	if (Object.prototype.hasOwnProperty.call(out, 'bullet')) out.bullet = normalizeBulletOptions(out.bullet, `${path}.bullet`)
	if (Object.prototype.hasOwnProperty.call(out, 'hyperlink')) out.hyperlink = normalizeTextHyperlink(out.hyperlink, `${path}.hyperlink`)
	if (Object.prototype.hasOwnProperty.call(out, 'field')) out.field = normalizeTextField(out.field, `${path}.field`, context)
	if (Object.prototype.hasOwnProperty.call(out, 'textFill')) out.textFill = normalizeTextFill(out.textFill, `${path}.textFill`)
	return out
}

function optionSurfaceCatalog() {
	return [
		{
			id: 'gradientDirection',
			field: 'fill.gradientDirection',
			description: 'DrawingML gradient direction/path selector. Use the fill surface parameters for the independent angle, flip, rotate-with-shape, focus rectangle, and tile rectangle controls; radial is accepted as an intent alias and serializes to circle.',
			canonical: GRADIENT_DIRECTIONS,
			aliases: GRADIENT_DIRECTION_ALIASES,
			examples: ['linear', 'circle'],
			parameters: [
				{ id: 'gradientAngle', type: 'continuous', minimum: 0, maximum: 360, step: 0.001, unit: 'degrees', applicability: ['linear'] },
				{ id: 'gradientFlip', type: 'discrete', canonical: ['none', 'x', 'y', 'xy'] },
				{ id: 'rotateGradientWithShape', type: 'discrete', valueType: 'boolean', default: true },
				{ id: 'fillToRect', type: 'compound', leaves: ['l', 't', 'r', 'b'], minimum: 0, maximum: 100, step: 0.001, unit: 'percent', applicability: ['circle', 'rect', 'shape'] },
				{ id: 'tileRect', type: 'compound', leaves: ['l', 't', 'r', 'b'], minimum: 0, maximum: 100, step: 0.001, unit: 'percent' },
			],
		},
		{
			id: 'wordArtTransform',
			field: 'options.wordArt.transform',
			description: 'DrawingML WordArt text warp with an independently editable native adjustment handle where PowerPoint exposes one. The gallery selector chooses the warp family; adjustment0 is a normalized native guide rather than a preset ceiling, while non-applicable families and a second adj1 guide remain explicitly rejected.',
			schema: WORDART_TRANSFORM_PUBLIC_SCHEMA,
			canonical: WORDART_TRANSFORMS,
			aliases: WORDART_TRANSFORM_ALIASES,
			examples: [
				'textArchUp',
				'textWave1',
				'textWave4',
				'textChevronInverted',
				{ transform: 'textArchUp', adjustments: [50000] },
				{ transform: 'textChevron', adjustments: [75000] },
			],
			capabilityMode: WORDART_TRANSFORM_CONTRACT.capabilityMode,
			capabilityStatus: WORDART_TRANSFORM_CONTRACT.capabilityStatus,
			componentOwnership: WORDART_TRANSFORM_CONTRACT.componentOwnership,
			overrideFields: WORDART_TRANSFORM_CONTRACT.overrideFields,
			parameters: [
				{ id: 'adjustment0', type: 'continuous', valueType: 'integer', minimum: 0, maximum: 100000, default: 0, step: 1, unit: '1/100000 shape-dimension', semanticPath: 'options.wordArt.adjustments[0]', applicability: WORDART_ADJUSTMENT_TRANSFORMS, serializer: 'generated XML a:prstTxWarp/a:avLst/a:gd name="adj" fmla="val N"', reset: 'set adjustment0 to null or replace the WordArt transform component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			],
			limitation: 'PowerPoint persists one native adj guide for the listed transforms. Other transform families remain discrete selectors; a second adj1 guide is rejected rather than serialized as unsupported XML.',
			resetBehavior: WORDART_TRANSFORM_CONTRACT.resetBehavior,
			precedence: WORDART_TRANSFORM_CONTRACT.precedence,
			legalCombinations: WORDART_TRANSFORM_CONTRACT.legalCombinations,
		},
		{
			id: 'shapeStylePreset',
			field: 'options.shapeStylePresetId / style.shapeStylePresetId',
			description: 'Captured native PowerPoint Shape Styles gallery tiles used as an exact native base. Fill, line, effect, and shape 3-D controls remain independently authorable after the tile is selected.',
			canonical: SHAPE_STYLE_PRESETS.map(item => ({ id: item.id, label: item.label })),
			examples: SHAPE_STYLE_PRESETS.slice(0, 3).map(item => item.id),
			parameters: stylePresetOverrideParameters('shape'),
			overrideFields: ['style.fill', 'style.line', 'style.shadow', 'style.glow', 'style.reflection', 'style.softEdges', 'style.blur', 'style.fillOverlay', 'style.effects', 'style.effect3D'],
			specializedTool: 'betterpptx.authoring.catalog',
		},
		{
			id: 'connectorStylePreset',
			field: 'content[].connectorStylePresetId / style.connectorStylePresetId plus style.line',
			description: 'All 42 native connector ribbon tiles as theme-aware preset bases with independently typed line, dash, and arrow overrides. Public discovery exposes IDs and parameter contracts without raw preset payloads.',
			canonical: CONNECTOR_STYLE_PUBLIC_PRESETS,
			schema: CONNECTOR_STYLE_CONTRACT.publicSchema,
			capabilityMode: CONNECTOR_STYLE_CONTRACT.capabilityMode,
			capabilityStatus: CONNECTOR_STYLE_CONTRACT.capabilityStatus,
			componentOwnership: CONNECTOR_STYLE_CONTRACT.componentOwnership,
			overrideFields: CONNECTOR_STYLE_CONTRACT.overrideFields,
			parameters: CONNECTOR_STYLE_PARAMETERS,
			resetBehavior: CONNECTOR_STYLE_CONTRACT.resetBehavior,
			precedence: CONNECTOR_STYLE_CONTRACT.precedence,
			legalCombinations: CONNECTOR_STYLE_CONTRACT.legalCombinations,
			examples: CONNECTOR_STYLE_PUBLIC_PRESETS.slice(0, 3).map(item => item.id),
			limitation: CONNECTOR_STYLE_CONTRACT.runtimeIntegrationComplete ? undefined : 'Exact promotion remains gated on runtime ownership of typed override precedence, reset, and selector/readback state.',
			specializedTool: 'betterpptx.slide.add_connector / betterpptx.deck.generate_from_spec',
		},
		{
			id: 'wordArtStylePreset',
			field: 'options.wordArtStylePresetId / style.wordArtStylePresetId',
			description: 'Captured native PowerPoint WordArt Quick Style gallery tiles used as an exact native base. Text fill, outline, effects, text 3-D, and warp controls remain independently authorable after the tile is selected.',
			canonical: WORDART_STYLE_PRESETS.map(item => ({ id: item.id, label: item.label })),
			examples: WORDART_STYLE_PRESETS.slice(0, 3).map(item => item.id),
			parameters: stylePresetOverrideParameters('wordArt'),
			overrideFields: ['style.fill', 'style.line', 'style.textFill', 'style.textOutline', 'style.textShadow', 'style.textGlow', 'style.textReflection', 'style.effects', 'style.text3D', 'style.wordArt'],
			specializedTool: 'betterpptx.authoring.catalog',
		},
		{
			id: 'shapeEffectPreset',
			field: 'options.shapeEffectPresetIds / style.shapeEffectPresetIds',
			description: 'Captured native PowerPoint Shape Effects gallery tiles used as a native base treatment. Every independent shadow, glow, reflection, soft-edge, blur, fill-overlay, and 3-D field remains authorable as a typed override; presets are not an authoring ceiling.',
			canonical: SHAPE_EFFECT_PRESETS.map(item => ({ id: item.id, category: item.category, tileIndex: item.tileIndex, label: item.label })),
			examples: SHAPE_EFFECT_PRESETS.filter(item => item.tileIndex === 2).slice(0, 4).map(item => item.id),
			parameters: shapeEffectOverrideParameters(),
			capabilityMode: 'preset-plus-parameters',
			capabilityStatus: 'executable-exact-structured',
			componentOwnership: ['fill', 'line', 'shadow', 'glow', 'reflection', 'softEdge', 'blur', 'fillOverlay', 'effects', 'shape3D'],
			overrideFields: ['style.shadow', 'style.glow', 'style.reflection', 'style.softEdges', 'style.blur', 'style.fillOverlay', 'style.effects', 'style.effect3D'],
			resetBehavior: { component: 'set the named style/effect3D component to null or omit it to restore the selected preset base', full: 'set shapeEffectPresetIds to null and remove explicit effect components', nullBehavior: 'preset remains the base while the named override is removed' },
			limitation: 'Preset recipe payloads remain exact native references; typed overrides are applied after the preset. Office may canonicalize neutral 3-D defaults and effect endpoints on SaveCopyAs/reopen, which is reported by the proof boundary rather than hidden.',
			specializedTool: 'betterpptx.authoring.catalog',
		},
		{
			id: 'textEffectPreset',
			field: 'options.textEffectPresetIds / style.textEffectPresetIds',
			description: 'Captured native PowerPoint Text Effects gallery tiles. The AI may compose one tile per desired effect family in execution order; the engine executes the editable native treatment.',
			canonical: TEXT_EFFECT_PRESETS.map(item => ({ id: item.id, category: item.category, tileIndex: item.tileIndex, label: item.label })),
			examples: TEXT_EFFECT_PRESETS.filter(item => item.tileIndex === 2).slice(0, 4).map(item => item.id),
			parameters: stylePresetOverrideParameters('textEffect'),
			capabilityMode: 'preset-plus-parameters',
			capabilityStatus: 'executable-exact-structured',
			componentOwnership: ['textFill', 'textOutline', 'shadow', 'glow', 'reflection', 'softEdge', 'effects', 'text3D'],
			overrideFields: ['style.textFill', 'style.textOutline', 'style.textShadow', 'style.textGlow', 'style.textReflection', 'style.effects', 'style.text3D'],
			resetBehavior: { component: 'set the named text effect component to null or omit it to restore the selected preset base', full: 'set textEffectPresetIds to null and remove explicit text effect components', nullBehavior: 'preset remains the base while the named override is removed' },
			limitation: 'Preset recipe payloads remain exact native references; typed text effect overrides are merged into the captured run-level effect list. Office may canonicalize neutral effect endpoints on SaveCopyAs/reopen.',
			specializedTool: 'betterpptx.authoring.catalog',
		},
		{
			id: 'pictureStylePreset',
			field: 'pictureStylePresetId plus pictureStyle / imageOptions.pictureStyle',
			description: 'All 28 native PowerPoint Picture Styles as exact editable preset-plus-parameter recipes. Select a tile, inspect its expanded geometry/fill/line/effects/3-D vector, then override any component or slider without private payloads.',
			canonical: publicPictureStylePresets(),
			schema: PICTURE_STYLE_PUBLIC_SCHEMA,
			capabilityMode: 'preset-plus-parameters',
			capabilityStatus: 'executable-exact-structured',
			componentOwnership: [...PICTURE_STYLE_COMPONENT_OWNERSHIP],
			overrideFields: [...PICTURE_STYLE_OVERRIDE_FIELDS],
			parameters: [...PICTURE_STYLE_LINE_PARAMETER_CATALOG, ...PICTURE_STYLE_COLOR_PARAMETER_CATALOG, ...PICTURE_STYLE_3D_PARAMETER_CATALOG],
			resetBehavior: { ...PICTURE_STYLE_RESET_BEHAVIOR },
			examples: PICTURE_STYLE_PRESETS.slice(0, 3).map(item => item.id),
			specializedTool: 'betterpptx.authoring.catalog',
		},
		{
			id: 'model3dViewPreset',
			field: 'model3dViewPresetId / modelOptions.model3dViewPresetId',
			description: 'Captured native PowerPoint Model 3D Views gallery tiles plus the portable manual camera, transform, viewport, and lighting controls that can override a selected tile without exposing private recipe payloads.',
			canonical: MODEL3D_VIEW_PRESETS.map(item => ({ id: item.id, label: item.label })),
			capabilityMode: 'preset-plus-parameters',
			capabilityStatus: 'executable-exact-structured',
			componentOwnership: ['camera', 'transform', 'lighting', 'viewport'],
			overrideFields: ['camera', 'trans', 'ambientLight', 'ptLights', 'objViewport'],
			parameters: [...MODEL3D_VIEW_PARAMETERS],
			resetBehavior: { component: 'set a named camera/trans/light/viewport field to null or omit it to restore the selected tile/default', full: 'set model3dViewPresetId to null and remove manual view fields', nullBehavior: 'remove the named manual override while preserving the selected gallery tile' },
			precedence: MODEL3D_AUTHORING_CAPABILITY_CONTRACT.precedence,
			legalCombinations: MODEL3D_AUTHORING_CAPABILITY_CONTRACT.legalCombinations,
			applicability: MODEL3D_AUTHORING_CAPABILITY_CONTRACT.applicability,
			limitation: MODEL3D_AUTHORING_CAPABILITY_CONTRACT.limitation,
			examples: MODEL3D_VIEW_PRESETS.slice(0, 3).map(item => item.id),
			specializedTool: 'betterpptx.authoring.catalog',
		},
		{
			id: 'text3DRotation',
			field: 'options.text3D.rotationX/Y/Z',
			description: 'Text3D camera rotations in degrees. Each axis is an independent typed override and the serializer emits normalized PowerPoint fixed angles.',
			canonical: ['number: 0 <= degrees < 360'],
			aliases: { '-12': 348, '372': 12 },
			capabilityMode: 'parameterized',
			capabilityStatus: 'executable-exact-structured',
			componentOwnership: ['options.text3D.rotationX', 'options.text3D.rotationY', 'options.text3D.rotationZ'],
			overrideFields: ['options.text3D.rotationX', 'options.text3D.rotationY', 'options.text3D.rotationZ'],
			parameters: [
				{ id: 'rotationX', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 1 / 60000, unit: 'degrees', semanticPath: 'options.text3D.rotationX', serializer: 'a:scene3d/a:camera/a:rot/@lat = normalize(rotationX * 60000)', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
				{ id: 'rotationY', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 1 / 60000, unit: 'degrees', semanticPath: 'options.text3D.rotationY', serializer: 'a:scene3d/a:camera/a:rot/@lon = normalize(rotationY * 60000)', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
				{ id: 'rotationZ', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 1 / 60000, unit: 'degrees', semanticPath: 'options.text3D.rotationZ', serializer: 'a:scene3d/a:camera/a:rot/@rev = normalize(rotationZ * 60000)', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			],
			resetBehavior: { component: 'set the named rotation axis to null or omit it', full: 'set options.text3D to null', nullBehavior: 'remove the authored axis while retaining other text3D leaves' },
			examples: [0, 12, 348],
		},
		{
			id: 'text3DShape',
			field: 'options.text3D / options.effect3D',
			description: 'Parameterized native 3-D text/shape controls. Gallery presets remain conveniences; bevel, extrusion, contour, material, and lighting leaves are independently discoverable, composable, resettable, and serialized.',
			capabilityMode: 'parameterized',
			capabilityStatus: WORDART_TEXT3D_RUNTIME_READY ? 'executable-exact-structured' : 'structured-partial',
			componentOwnership: ['bevel', 'bevelBottom', 'extrusion', 'extrusionColor', 'contour', 'material', 'lighting', 'lightDirection', 'rotation'],
			overrideFields: ['bevel', 'bevelBottom', 'extrusion', 'extrusionColor', 'contourWidth', 'contourColor', 'material', 'lightRig', 'lightDirection', 'rotationX', 'rotationY', 'rotationZ', 'perspective'],
			applicability: ['shape', 'text', 'picture'],
			resetBehavior: { ...RESET_3D_COMPONENT },
			canonical: [
				'bevel: { type, width, height }',
				'bevelBottom: { type, width, height }; width/height=0..1000 points; default=6',
				'extrusion: number; unit=points; range 0..5000; default=0; continuous; serializerStep=1/12700pt; reset=null',
				'extrusionColor: hex string',
				'lightDirection: number; unit=degrees; range 0..359; continuous; serializerStep=1/60000deg; reset=null',
				'contourWidth: number; unit=points; range 0..1000; default=0; continuous; serializerStep=1/12700pt; reset=null',
				'contourColor: hex string',
				`material: one of ${TEXT_3D_MATERIALS.length} native presets; exact domain is ${TEXT_3D_MATERIALS.join(', ')}`,
				`lightRig: one of ${TEXT_3D_LIGHT_RIGS.length} native presets; exact domain is ${TEXT_3D_LIGHT_RIGS.join(', ')}`,
			],
			parameters: [
				{ id: 'bevelTopWidthPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1000, default: 6, step: 0.01, unit: 'points', semanticPath: 'options.text3D.bevel.width', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/a:bevelT/@w = round(bevel.width * 12700)', limitation: 'PowerPoint may omit the neutral default bevel node while retaining the default value; this is an explicit canonical serialization boundary.' },
				{ id: 'bevelTopHeightPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1000, default: 6, step: 0.01, unit: 'points', semanticPath: 'options.text3D.bevel.height', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/a:bevelT/@h = round(bevel.height * 12700)', limitation: 'PowerPoint may omit the neutral default bevel node while retaining the default value; this is an explicit canonical serialization boundary.' },
				{ id: 'bevelTopPreset', type: 'discrete', valueType: 'string', values: [...TEXT_3D_BEVEL_PRESETS], semanticPath: 'options.text3D.bevel.type', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/a:bevelT/@prst' },
				{ id: 'bevelBottomWidthPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1000, default: 6, step: 0.01, unit: 'points', semanticPath: 'options.text3D.bevelBottom.width', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/a:bevelB/@w = round(bevelBottom.width * 12700)' },
				{ id: 'bevelBottomHeightPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1000, default: 6, step: 0.01, unit: 'points', semanticPath: 'options.text3D.bevelBottom.height', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/a:bevelB/@h = round(bevelBottom.height * 12700)' },
				{ id: 'bevelBottomPreset', type: 'discrete', valueType: 'string', values: [...TEXT_3D_BEVEL_PRESETS], semanticPath: 'options.text3D.bevelBottom.type', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/a:bevelB/@prst' },
				{ id: 'extrusionPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 5000, default: 0, step: 1 / 12700, unit: 'points', semanticPath: 'options.text3D.extrusion', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/@extrusionH = round(extrusion * 12700)' },
				{ id: 'extrusionColor', type: 'color', valueType: 'hex', semanticPath: 'options.text3D.extrusionColor', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/a:extrusionClr' },
				{ id: 'material', type: 'discrete', valueType: 'string', values: [...TEXT_3D_MATERIALS], semanticPath: 'options.text3D.material', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/@prstMaterial' },
				{ id: 'lightRig', type: 'discrete', valueType: 'string', values: [...TEXT_3D_LIGHT_RIGS], semanticPath: 'options.text3D.lightRig', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:scene3d/a:lightRig/@rig' },
				{ id: 'lightDirectionDeg', type: 'continuous', valueType: 'number', minimum: 0, maximum: 359, default: 0, step: 0.01, unit: 'degrees', semanticPath: 'options.text3D.lightDirection', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:scene3d/a:lightRig/a:rot/@rev = round(lightDirection * 60000)' },
				{ id: 'rotationX', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 1 / 60000, unit: 'degrees', semanticPath: 'options.text3D.rotationX', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:scene3d/a:camera/a:rot/@lat = normalize(rotationX * 60000)' },
				{ id: 'rotationY', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 1 / 60000, unit: 'degrees', semanticPath: 'options.text3D.rotationY', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:scene3d/a:camera/a:rot/@lon = normalize(rotationY * 60000)' },
				{ id: 'rotationZ', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 1 / 60000, unit: 'degrees', semanticPath: 'options.text3D.rotationZ', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:scene3d/a:camera/a:rot/@rev = normalize(rotationZ * 60000)' },
				{ id: 'contourWidthPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1000, default: 0, step: 0.01, unit: 'points', semanticPath: 'options.text3D.contourWidth', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/@contourW = round(contourWidth * 12700)' },
				{ id: 'contourColor', type: 'color', valueType: 'hex', semanticPath: 'options.text3D.contourColor', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/a:contourClr' },
			],
			aliases: {
				'bevel.w/h': 'bevel.width/height',
				'bevelBottom.w/h': 'bevelBottom.width/height',
				'extrusion.depth': 'extrusion',
				'extrusion.color': 'extrusionColor',
				'lightRig.rig': 'lightRig',
				'lightRig.direction': 'lightDirection',
			},
			examples: [
				{ bevel: { type: 'circle', width: 4, height: 4 }, extrusion: 8, extrusionColor: '6D28D9', material: 'warmMatte', lightRig: 'threePt', lightDirection: 45 },
				{ bevel: { type: 'circle', w: 4, h: 4 }, extrusion: { depth: 8, color: '6D28D9' }, lightRig: { rig: 'threePt' } },
			],
		},
		{
			id: 'chartPreset',
			field: 'chartType / chartMulti',
			description: 'Native and composite chart presets plus the full typed chart-format surface are available. Use the parameters to author sliders and structured axis/area controls beyond the discrete gallery tile.',
			canonical: ['bar', 'bar3D', 'line', 'area', 'pie', 'doughnut', 'scatter', 'bubble', 'radar'],
			capabilityMode: 'preset-plus-parameters',
			capabilityStatus: 'executable-exact-structured',
			componentOwnership: ['chartType', 'series', 'axes', 'labels', 'legend', 'chartArea', 'plotArea', '3dView'],
			overrideFields: CHART_FORMAT_PARAMETERS.map(item => item.id),
			parameters: [...CHART_FORMAT_PARAMETERS],
			resetBehavior: { component: 'set any named chart option to null or omit it to restore the selected chart-type/preset default', full: 'set chartPresetId to null and remove chart-format options', nullBehavior: 'remove the named manual override while preserving chart data and selected type' },
			examples: ['bar', 'line', 'pie'],
			specializedTool: 'betterpptx.chart.recommend',
		},
		{
			id: 'tablePreset',
			field: 'slide.add_table.options / per-cell options',
			description: 'Contextual table presets plus the full typed table/cell formatting surface are available. Use the parameters for explicit Table Design flags, typography, fill/border/padding, dimensions, auto-page controls, merges, and per-cell overrides beyond a preset tile.',
			canonical: ['headerRow', 'totalRow', 'bandedRows', 'firstColumn', 'lastColumn', 'bandedColumns', 'tableStyleId'],
			capabilityMode: 'preset-plus-parameters',
			capabilityStatus: 'executable-exact-structured',
			componentOwnership: ['tableStyle', 'flags', 'typography', 'fill', 'border', 'padding', 'dimensions', 'pagination', 'cells'],
			overrideFields: TABLE_FORMAT_PARAMETERS.map(item => item.id),
			parameters: [...TABLE_FORMAT_PARAMETERS],
			resetBehavior: { component: 'set any named table or cell option to null or omit it to restore the selected style/default', full: 'set tableStylePresetId to null and remove explicit table/cell options', nullBehavior: 'remove the named manual override while preserving rows and selected style' },
			examples: ['executive-kpi-scorecard', 'financial-variance-total', 'feature-comparison-matrix'],
			specializedTool: 'betterpptx.table.recommend',
		},
		{
			id: 'smartArtLayout',
			field: 'slide.add_smartart.layout/layoutId',
			description: 'Native SmartArt gallery selectors plus the full typed layout/style/topology/text/accessibility surface are available. Use the parameters to author exact diagram controls beyond category tiles.',
			canonical: ['list', 'process', 'cycle', 'hierarchy', 'relationship', 'matrix', 'pyramid', 'picture', 'timeline', 'team'],
			capabilityMode: 'preset-plus-parameters',
			capabilityStatus: 'executable-exact-structured',
			componentOwnership: ['layout', 'quickStyle', 'colorStyle', 'topology', 'text', 'palette', 'accessibility'],
			overrideFields: SMARTART_FORMAT_PARAMETERS.map(item => item.id),
			parameters: [...SMARTART_FORMAT_PARAMETERS],
			resetBehavior: { component: 'set any named SmartArt option to null or omit it to restore the selected gallery/default behavior', full: 'set layoutId, quickStyleId, colorStyleId, and explicit SmartArt fields to null or omit them', nullBehavior: 'remove the named manual override while preserving authored node content' },
			examples: ['Basic Process', 'Organization Chart', 'Picture Caption List'],
			specializedTool: 'betterpptx.smartart.catalog',
		},
		{
			id: 'transitionPreset',
			field: 'slides[].transition / transitionPolicy.transition / transitionsAll.transition',
			description: 'Native PowerPoint Transitions gallery selectors plus every extended transition control already serialized by the engine: speed, duration, auto-advance timing, direction, pattern, spokes, inversion, through-black, and Morph option. Gallery tiles are conveniences, not an authoring ceiling.',
			canonical: TRANSITION_GALLERY_PRESETS.map(item => ({ id: item.id, label: item.label })),
			capabilityMode: 'preset-plus-parameters',
			capabilityStatus: 'executable-exact-structured',
			componentOwnership: ['type', 'direction', 'pattern', 'speed', 'duration', 'advanceOnClick', 'advanceAfterTime', 'throughBlack', 'spokes', 'clockwise', 'zoomFrom', 'option', 'invX', 'invY', 'p14dur'],
			overrideFields: TRANSITION_FORMAT_PARAMETERS.map(item => item.id),
			parameters: [...TRANSITION_FORMAT_PARAMETERS],
			resetBehavior: { component: 'set a named transition field to null or omit it to restore the selected transition default', full: 'set transitionPresetId/type to none or remove the transition object', nullBehavior: 'remove the named timing or visual override while preserving the selected transition family' },
			examples: ['transition-ribbon-003', 'transition-ribbon-004', { transitionPresetId: 'transition-ribbon-004', speed: 'fast', duration: 900, advanceOnClick: false, advanceAfterTime: 6000 }, { type: 'morph', option: 'byObject', p14dur: 700 }],
			specializedTool: 'betterpptx.slide.set_transition',
		},
		{
			id: 'animationPreset',
			field: 'content[].animation / slides[].timeline[] / slide.animate_shapes.animation',
			description: 'Native PowerPoint Animation Pane effects and motion paths with the complete typed timing, trigger, direction, sequence, repeat, scale, rotation, color, media, and reset surface. Effect names are exact native selectors; aliases are normalized before serialization and custom motion paths use a bounded path string.',
			canonical: ANIMATION_FORMAT_EFFECTS.map(id => ({ id, label: id })),
			capabilityMode: 'preset-plus-parameters',
			capabilityStatus: 'structured-partial',
			componentOwnership: ['type', 'effect', 'timing', 'trigger', 'direction', 'sequence', 'repeat', 'motionPath', 'transform', 'color', 'media'],
			overrideFields: ANIMATION_FORMAT_PARAMETERS.map(item => item.id),
			parameters: [...ANIMATION_FORMAT_PARAMETERS],
			resetBehavior: { component: 'set a named animation field to null or omit it to restore the native effect default', full: 'set content[].animation to null or remove the timeline step', nullBehavior: 'remove the named override while preserving the selected effect and target' },
			examples: [{ type: 'entrance', effect: 'fly', direction: 'fromLeft', durationMs: 650, delayMs: 100, trigger: 'afterPrevious' }, { type: 'motion', motionPath: 'arcUp', duration: 1400, trigger: 'withPrevious' }, { type: 'emphasis', effect: 'colorWave', repeatCount: 'indefinite' }],
			limitation: 'PowerPoint owns the effect registry and may canonicalize timing internals on SaveCopyAs/reopen; no raw preset IDs, shape IDs, or XML payloads are exposed. Effect, timing, trigger, direction, sequence, path, color, media, visibility, repeatCount, autoReverse, and proven effect-specific leaves are executable through the generic native owner serializer. Unsupported CSS motion remains an explicit AI/client finding.',
			specializedTool: 'betterpptx.slide.animate_shapes',
		},
		{
			id: 'objectAccessibility',
			field: 'content[].title / content[].altText / content[].decorative / content[].hiddenFromAccessibility',
			description: 'Native accessibility metadata for every editable top-level slide object. Accessibility title is independent of visible chart/SmartArt titles, and decorative state is independent of layout-purpose decoration.',
			canonical: ['title', 'altText', 'decorative'],
			capabilityMode: 'parameterized',
			capabilityStatus: 'executable-exact-structured',
			componentOwnership: ['cNvPr.title', 'cNvPr.descr', 'adec:decorative'],
			overrideFields: ACCESSIBILITY_METADATA_PARAMETERS.map(item => item.id),
			parameters: [...ACCESSIBILITY_METADATA_PARAMETERS],
			resetBehavior: { component: 'set title, altText, or decorative to null', full: 'set all three canonical fields to null', nullBehavior: 'remove only the named metadata carrier while preserving the object and its other accessibility state' },
			examples: [{ title: 'Revenue chart', altText: 'Quarterly revenue rises from 2.1 to 3.4 million.', decorative: false }, { decorative: true }],
			limitation: 'decorative=true is mutually exclusive with a non-null title or altText. hiddenFromAccessibility is accepted only as a compatibility alias for decorative and does not visually hide the object.',
			specializedTool: 'betterpptx.deck.generate_from_spec / betterpptx.deck.patch_from_spec / betterpptx.slide.update_shape',
		},
		{
			id: 'imageAccessibility',
			field: 'content[].image / content[].altText',
			description: 'Native picture accessibility metadata. Author a concise semantic description that survives export, PowerPoint roundtrip, public current-spec readback, and screen-reader inspection; private paths and implementation details are rejected.',
			canonical: ['altText'],
			capabilityMode: 'parameterized',
			capabilityStatus: 'executable-exact-structured',
			componentOwnership: ['picture.cNvPr.descr'],
			overrideFields: IMAGE_ACCESSIBILITY_PARAMETERS.map(item => item.id),
			parameters: [...IMAGE_ACCESSIBILITY_PARAMETERS],
			resetBehavior: { component: 'set content[].altText or imageAccessibility.altText to null to restore the asset/object fallback', full: 'remove the authored image accessibility component', nullBehavior: 'remove only the authored description while retaining the picture and its visual effects' },
			examples: [{ altText: 'A blue workflow diagram showing three native authoring checkpoints.' }],
			limitation: 'Decorative-image semantics remain an explicit client decision; this surface only serializes the native description carrier and fails closed on private implementation metadata.',
			specializedTool: 'betterpptx.slide.add_image / betterpptx.slide.update_shape',
		},
		{
			id: 'mediaPlayback',
			field: 'content[].media / slide.add_media / slide.update_media',
			description: 'Native audio/video playback and accessibility controls beyond merely inserting a media asset: type-safe extension/package identity, contain/cover/crop framing, transparency, rounded frame, interactive playback, volume, stopped-state behavior, and native WebVTT captions.',
			canonical: MEDIA_FORMAT_TYPES,
			capabilityMode: 'asset-plus-parameters',
			capabilityStatus: 'executable-exact-structured',
			componentOwnership: ['source', 'type', 'extn', 'cover', 'sizing', 'transparency', 'rounding', 'interactivePlayback', 'mediaVolume', 'showWhenStopped', 'endOnStopAudio', 'closedCaptionTracks'],
			overrideFields: MEDIA_FORMAT_PARAMETERS.map(item => item.id),
			parameters: [...MEDIA_FORMAT_PARAMETERS],
			resetBehavior: { component: 'set a named media field to null or omit it to restore the native media/default behavior', full: 'remove the media object or replace its authorized source', nullBehavior: 'remove the named playback/framing/accessibility override while preserving the media asset' },
			examples: [{ type: 'video', sizing: { type: 'cover', w: 8, h: 4.5 }, transparency: 12.5, rounding: true, interactivePlayback: false, mediaVolume: 65000 }, { type: 'audio', closedCaptionTracks: [{ language: 'en-US', label: 'English', vtt: 'WEBVTT\\n\\n00:00.000 --> 00:01.000\\nHello' }] }],
			limitation: 'Source and poster assets are resolved through opaque asset handles. PowerPoint may canonicalize preview alpha and timing internals on SaveCopyAs/reopen; exact semantics are claimed only where package and Office roundtrip evidence retain them. Captions remain native WebVTT tracks and never become visible slide text.',
			specializedTool: 'betterpptx.slide.add_media / betterpptx.slide.update_media',
		},
		{
			id: 'structuralGeometry',
			field: 'content[].connector / group / freeform / customGeometry',
			description: 'Native editable structural objects: connector endpoint bindings, grouped child coordinate spaces, bounded vector paths, and safe custom-geometry handles.',
			canonical: STRUCTURAL_CONTRACT.parameters.map(item => item.id),
			capabilityMode: STRUCTURAL_CONTRACT.capabilityMode,
			capabilityStatus: STRUCTURAL_CONTRACT.capabilityStatus,
			componentOwnership: STRUCTURAL_CONTRACT.componentOwnership,
			overrideFields: STRUCTURAL_CONTRACT.overrideFields,
			parameters: [...STRUCTURAL_PARAMETERS],
			resetBehavior: STRUCTURAL_CONTRACT.resetBehavior,
			precedence: STRUCTURAL_CONTRACT.precedence,
			legalCombinations: STRUCTURAL_CONTRACT.legalCombinations,
			examples: [{ connectorType: 'elbowConnector2', routing: 'orthogonal', startShapeId: 2, startConnectionIndex: 3, endShapeId: 3, endConnectionIndex: 1 }, { children: [{ kind: 'shape', shape: 'roundRect', x: 0, y: 0, w: 2, h: 1 }], chOff: { x: 0, y: 0, w: 2, h: 1 }, chExt: { x: 0, y: 0, w: 2, h: 1 } }, { points: [{ x: 0, y: 0, moveTo: true }, { x: 1, y: 1 }, { close: true }], booleanOperation: 'combine' }],
			specializedTool: 'betterpptx.slide.add_connector / betterpptx.slide.add_group / betterpptx.slide.add_freeform / betterpptx.deck.generate_from_spec',
		},
	]
}

function gallerySurfaceTruth(item) {
	const id = String(item.id || '')
	if (id === 'gradientDirection') return { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['gradientDirection', 'gradientAngle', 'gradientFlip', 'rotateGradientWithShape', 'fillToRect', 'tileRect'], overrideFields: ['gradientDirection', 'gradientAngle', 'gradientFlip', 'rotateGradientWithShape', 'fillToRect', 'tileRect'], resetBehavior: { component: 'set any named gradient geometry field to null or omit it to restore the selected gradient/default', full: 'remove the fill/gradient object', nullBehavior: 'remove only the named gradient geometry override while preserving stops' } }
	if (id === 'pictureStylePreset') {
		return { capabilityMode: 'preset-plus-parameters', capabilityStatus: 'executable-exact-structured', componentOwnership: [...PICTURE_STYLE_COMPONENT_OWNERSHIP], overrideFields: [...PICTURE_STYLE_OVERRIDE_FIELDS], resetBehavior: { ...PICTURE_STYLE_RESET_BEHAVIOR } }
	}
	if (id === 'shapeStylePreset') return { capabilityMode: 'preset-plus-parameters', capabilityStatus: 'executable-exact-structured', componentOwnership: ['fill', 'line', 'effects', 'shape3D'], overrideFields: ['style.fill', 'style.line', 'style.shadow', 'style.glow', 'style.reflection', 'style.softEdges', 'style.blur', 'style.fillOverlay', 'style.effects', 'style.effect3D'], resetBehavior: { component: 'set the named style/effect3D component to null or omit it to restore the selected preset base', full: 'set shapeStylePresetId to null and remove explicit style components', nullBehavior: 'preset remains the base while the named override is removed' } }
	if (id === 'connectorStylePreset') return { capabilityMode: CONNECTOR_STYLE_CONTRACT.capabilityMode, capabilityStatus: CONNECTOR_STYLE_CONTRACT.capabilityStatus, componentOwnership: CONNECTOR_STYLE_CONTRACT.componentOwnership, overrideFields: CONNECTOR_STYLE_CONTRACT.overrideFields, resetBehavior: CONNECTOR_STYLE_CONTRACT.resetBehavior }
	if (id === 'wordArtStylePreset') return { capabilityMode: 'preset-plus-parameters', capabilityStatus: 'executable-exact-structured', componentOwnership: ['fill', 'line', 'textEffects', 'text3D', 'wordArt'], overrideFields: ['style.fill', 'style.line', 'style.textFill', 'style.textOutline', 'style.textShadow', 'style.textGlow', 'style.textReflection', 'style.effects', 'style.text3D', 'style.wordArt'], resetBehavior: { component: 'set the named style/text3D/wordArt component to null or omit it to restore the selected preset base', full: 'set wordArtStylePresetId to null and remove explicit style components', nullBehavior: 'preset remains the base while the named override is removed' } }
	if (id === 'textEffectPreset') return { capabilityMode: 'preset-plus-parameters', capabilityStatus: 'executable-exact-structured', componentOwnership: ['textEffects', 'text3D'], overrideFields: ['style.textFill', 'style.textOutline', 'style.textShadow', 'style.textGlow', 'style.textReflection', 'style.effects', 'style.text3D'], resetBehavior: { component: 'set the named text effect component to null or omit it to restore the selected preset base', full: 'set textEffectPresetIds to null and remove explicit text effect components', nullBehavior: 'preset remains the base while the named override is removed' } }
	if (id === 'model3dViewPreset') return { capabilityMode: MODEL3D_AUTHORING_CAPABILITY_CONTRACT.capabilityMode, capabilityStatus: MODEL3D_AUTHORING_CAPABILITY_CONTRACT.capabilityStatus, componentOwnership: MODEL3D_AUTHORING_CAPABILITY_CONTRACT.componentOwnership.filter(key => ['camera', 'transform', 'lighting', 'viewport'].includes(key)), overrideFields: ['camera', 'trans', 'ambientLight', 'ptLights', 'objViewport'], resetBehavior: MODEL3D_AUTHORING_CAPABILITY_CONTRACT.resetBehavior, precedence: MODEL3D_AUTHORING_CAPABILITY_CONTRACT.precedence, legalCombinations: MODEL3D_AUTHORING_CAPABILITY_CONTRACT.legalCombinations, applicability: MODEL3D_AUTHORING_CAPABILITY_CONTRACT.applicability, limitation: MODEL3D_AUTHORING_CAPABILITY_CONTRACT.limitation }
	if (id === 'wordArtTransform') return { capabilityMode: 'discrete', capabilityStatus: 'structured-partial', componentOwnership: [id], overrideFields: [], resetBehavior: { component: 'not-public', full: 'not-public', nullBehavior: 'not-defined' } }
	return { capabilityMode: 'parameterized', capabilityStatus: 'structured-partial', componentOwnership: [item.field], overrideFields: [], resetBehavior: { component: 'not-public', full: 'not-public', nullBehavior: 'not-defined' } }
}

export function listOptionCatalog({ surface, format = 'summary' } = {}) {
	const needle = String(surface || '').trim().toLowerCase()
	const gallery = optionSurfaceCatalog().filter(item => !needle || item.id.toLowerCase().includes(needle) || item.field.toLowerCase().includes(needle)).map(item => ({ ...gallerySurfaceTruth(item), ...item }))
	const visual = matchNativeVisualSurface(needle).map(item => ({
		id: item.id,
		field: item.field,
		description: item.description,
		status: item.status,
		editability: item.editability,
		canonical: item.canonical || item.schema,
		schema: item.schema,
		ranges: item.ranges,
		examples: item.examples,
		aliases: item.aliases,
		valueDomains: item.valueDomains,
		parameters: item.parameters,
		capabilityMode: item.capabilityMode,
		capabilityStatus: item.capabilityStatus,
		componentOwnership: item.componentOwnership,
		overrideFields: item.overrideFields,
		resetBehavior: item.resetBehavior,
		applicability: item.applicability,
		limitation: item.limitation,
	}))
	const seen = new Set()
	const surfaces = []
	for (const item of [...visual, ...gallery]) {
		if (seen.has(item.id)) continue
		seen.add(item.id)
		surfaces.push(item)
	}
	return {
		ok: true,
		schemaVersion: 'betterpptx.options.catalog.v2',
		acceptedFilter: { surface: surface || null, format },
		principle: 'Gallery selectors are classified as discrete, parameterized, preset-plus-parameters, preset-only, preserve-only, or missing. Exact preset replay does not imply that every underlying control is independently authorable.',
		count: surfaces.length,
		surfaces: format === 'full' ? surfaces : surfaces.map(item => ({
			id: item.id,
			field: item.field,
			description: item.description,
			status: item.status,
			editability: item.editability,
			examples: item.examples || item.canonical?.slice?.(0, 6) || item.canonical,
			schema: item.schema,
			aliases: item.aliases,
			valueDomains: item.valueDomains,
			specializedTool: item.specializedTool,
			capabilityMode: item.capabilityMode,
			capabilityStatus: item.capabilityStatus,
			componentOwnership: item.componentOwnership,
			overrideFields: item.overrideFields,
			resetBehavior: item.resetBehavior,
			precedence: item.precedence,
			legalCombinations: item.legalCombinations,
			applicability: item.applicability,
			limitation: item.limitation,
			parameters: item.parameters,
		})),
	}
}
