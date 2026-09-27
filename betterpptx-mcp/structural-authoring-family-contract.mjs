// Closed public contract for the structural authoring family.  Structural
// objects are native PowerPoint geometry carriers: connectors keep endpoint
// bindings, groups keep local coordinate spaces, and custom geometry keeps a
// bounded vector path or an opaque catalog handle.  Raw XML/package fields are
// deliberately rejected at this boundary.

import { CONNECTOR_STYLE_LINE_SCHEMA, CONNECTOR_STYLE_SELECTOR_SCHEMA, CONNECTOR_STYLE_ROW_IDS, normalizeConnectorLineOverrides, normalizeConnectorStylePresetId } from './connector-style-contract.mjs'
import { CONNECTOR_EFFECT_FIELDS, CONNECTOR_EFFECT_PROPERTIES, normalizeConnectorEffects } from './connector-effects-contract.mjs'
import { IMAGE_ASSET_SOURCE_SCHEMA, validateImageAssetSource } from './media-image-formatting-contract.mjs'
import { TEXT_FILL_PUBLIC_SCHEMA, normalizeTextFill } from './text-fill-contract.mjs'

export const STRUCTURAL_RUNTIME_INTEGRATION_COMPLETE = true
export const STRUCTURAL_STATE_VERSION = 'betterpptx.structural-state.v1'

export const STRUCTURAL_ROW_IDS = Object.freeze([
	'cap_21e645cffcc4a2bc11c8', 'cap_22a402205464fcc1d479', 'cap_3e937015b2d3c5796f3e',
	'cap_3f1b753ad7d33aacf621', 'cap_412f027e1e98a6625c10', 'cap_4b4379a59f0bbdd0115b',
	'cap_4c1a2c98a1e98c464a8d', 'cap_4f348b78e18398bab7c8', 'cap_57cae632df21da46e528',
	'cap_606d8ef53f5e50d15ed3', 'cap_64c2544a81525adbf8af', 'cap_810ebaf88495a33c886c',
	'cap_ab007af279674b28c194', 'cap_ad9f45284d196130f8ed', 'cap_ade192173bfae42f86ee',
	'cap_bd78378ac3429611aa7a', 'cap_beb0ed12103dce2499b8', 'cap_e4415ed6a11cecec7335',
	'cap_e84949e21c276ac05eea', 'cap_fb3b07aaed1cd8500c07', 'cap_fdcf05600f4b98a92efc',
])

export const STRUCTURAL_CONNECTOR_TYPES = Object.freeze([
	'straightConnector1', 'elbowConnector2', 'elbowConnector3', 'elbowConnector4',
	'curvedConnector2', 'curvedConnector3', 'curvedConnector4',
])
export const STRUCTURAL_ROUTING_MODES = Object.freeze(['auto', 'straight', 'orthogonal', 'elbow', 'curved'])
export const STRUCTURAL_BOOLEAN_OPERATIONS = Object.freeze(['combine', 'fragment', 'intersect', 'subtract', 'union'])
export const STRUCTURAL_POINT_COMMANDS = Object.freeze(['moveTo', 'lineTo', 'arcTo', 'cubicBezier', 'quadraticBezier', 'close'])
export const STRUCTURAL_GROUP_CHILD_KINDS = Object.freeze(['shape', 'connector', 'group', 'freeform', 'customGeometry', 'custom-geometry', 'text', 'textBox', 'textShape', 'image', 'image-feature'])
export const STRUCTURAL_SHAPE_LINE_KINDS = Object.freeze(['shape', 'freeform', 'customGeometry', 'custom-geometry', 'text', 'textBox', 'textShape'])
export const STRUCTURAL_SHAPE_LINE_CAPS = Object.freeze(['flat', 'round', 'square'])
export const STRUCTURAL_SHAPE_LINE_GRADIENT_FIELDS = Object.freeze(['gradientDirection', 'gradientAngle', 'gradientStops', 'rotateGradientWithShape'])

// Ordinary vector strokes share the existing closed line vocabulary but may
// deliberately choose native end caps and bounded linear gradients. Keep connector formatting separate:
// reusing this superset must not silently expand a connector's public contract.
const structuralLineObjectSchema = CONNECTOR_STYLE_LINE_SCHEMA.oneOf.find(branch => branch.type === 'object')
export const STRUCTURAL_SHAPE_LINE_SCHEMA = Object.freeze({
	oneOf: [
		{ type: 'null' },
		{ ...structuralLineObjectSchema, properties: {
			...structuralLineObjectSchema.properties,
			type: { type: 'string', enum: ['none', 'solid', 'gradient'] },
			gradientDirection: { type: 'string', const: 'linear', description: 'Native linear stroke gradient; omitted means linear.' },
			gradientAngle: { type: 'number', minimum: 0, exclusiveMaximum: 360, multipleOf: 0.001, description: 'Degrees: 0 fades left to right; 90 fades top to bottom.' },
			gradientStops: TEXT_FILL_PUBLIC_SCHEMA.oneOf[3].properties.gradientStops,
			rotateGradientWithShape: { type: 'boolean' },
			cap: { type: 'string', enum: [...STRUCTURAL_SHAPE_LINE_CAPS], description: 'Native stroke end cap for ordinary or freeform shapes. Omit to retain the normal default.' },
		}, allOf: [{
			if: { properties: { type: { const: 'gradient' } }, required: ['type'] },
			then: { required: ['gradientStops'], not: { anyOf: [{ required: ['color'] }, { required: ['transparency'] }] } },
			else: { not: { anyOf: STRUCTURAL_SHAPE_LINE_GRADIENT_FIELDS.map(key => ({ required: [key] })) } },
		}] },
	],
})

// This branch is intentionally separate from connector formatting. Existing
// solid/none options retain their established behavior; a new gradient must
// satisfy the closed stop contract before any geometry or asset is compiled.
export function normalizeStructuralShapeLine(value, path = 'line') {
	if (!isObject(value)) return value
	const gradient = value.type === 'gradient'
	const hasGradientFields = STRUCTURAL_SHAPE_LINE_GRADIENT_FIELDS.some(key => Object.prototype.hasOwnProperty.call(value, key))
	if (!gradient && !hasGradientFields) return clone(value)
	if (!gradient) throw new Error(`${path} gradient fields require type gradient.`)
	const allowed = new Set(Object.keys(STRUCTURAL_SHAPE_LINE_SCHEMA.oneOf[1].properties))
	rejectPrivateKeys(value, path, allowed)
	if (Object.prototype.hasOwnProperty.call(value, 'color') || Object.prototype.hasOwnProperty.call(value, 'transparency')) throw new Error(`${path} gradient color and transparency belong on each stop.`)
	if (Object.prototype.hasOwnProperty.call(value, 'gradientDirection') && value.gradientDirection !== 'linear') throw new Error(`${path}.gradientDirection must be linear.`)
	if (Object.prototype.hasOwnProperty.call(value, 'gradientAngle') && value.gradientAngle === null) throw new Error(`${path}.gradientAngle must be a number.`)
	if (Object.prototype.hasOwnProperty.call(value, 'rotateGradientWithShape') && typeof value.rotateGradientWithShape !== 'boolean') throw new Error(`${path}.rotateGradientWithShape must be boolean.`)
	if (Object.prototype.hasOwnProperty.call(value, 'cap') && !STRUCTURAL_SHAPE_LINE_CAPS.includes(value.cap)) throw new Error(`${path}.cap must be flat, round, or square.`)
	const fill = normalizeTextFill({ type: 'gradient', ...Object.fromEntries(STRUCTURAL_SHAPE_LINE_GRADIENT_FIELDS.filter(key => Object.prototype.hasOwnProperty.call(value, key)).map(key => [key, value[key]])) }, path)
	const stroke = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'type' && key !== 'cap' && !STRUCTURAL_SHAPE_LINE_GRADIENT_FIELDS.includes(key)))
	const normalizedStroke = normalizeConnectorLineOverrides(stroke, path)
	return { ...normalizedStroke, ...fill, ...(Object.prototype.hasOwnProperty.call(value, 'cap') ? { cap: value.cap } : {}) }
}
export const STRUCTURAL_LINE_CARRIER_SCHEMA = Object.freeze({
	if: { properties: { kind: { enum: [...STRUCTURAL_SHAPE_LINE_KINDS] } } },
	then: { properties: { line: STRUCTURAL_SHAPE_LINE_SCHEMA, style: { type: ['object', 'null'], properties: { line: STRUCTURAL_SHAPE_LINE_SCHEMA } } } },
	else: { properties: { line: CONNECTOR_STYLE_LINE_SCHEMA, style: { type: ['object', 'null'], properties: { line: CONNECTOR_STYLE_LINE_SCHEMA } } } },
})

const CONNECTOR_TYPE_SET = new Set(STRUCTURAL_CONNECTOR_TYPES)
const ROUTING_SET = new Set(STRUCTURAL_ROUTING_MODES)
const BOOLEAN_SET = new Set(STRUCTURAL_BOOLEAN_OPERATIONS)
const POINT_KEYS = new Set(['x', 'y', 'moveTo', 'close', 'curve', 'command', 'hR', 'wR', 'stAng', 'swAng', 'x1', 'y1', 'x2', 'y2'])
const GEOMETRY_KEYS = new Set(['kind', 'handle', 'geometryId', 'svg', 'svgText', 'markup', 'dataUri', 'pathData', 'd', 'points', 'paths', 'booleanOperation', 'operation', 'operands', 'bounds', 'adjustments', 'preset', 'x', 'y', 'w', 'h', 'objectName', 'editHandle', 'region', 'fill', 'line', 'shadow', 'glow', 'reflection', 'softEdges', 'effect3D', 'flipH', 'flipV', 'rotate', 'hyperlink', 'animation', 'decorative'])
const GROUP_TEXT_KINDS = new Set(['text', 'textBox', 'textShape'])
const GROUP_IMAGE_KINDS = new Set(['image', 'image-feature'])
const GROUP_STYLE_KEYS = new Set(['fontFace', 'fontFaceComplexScript', 'fontSize', 'color', 'bold', 'italic', 'baseline', 'rtl', 'rtlMode', 'softBreakBefore', 'field', 'hyperlink', 'underline', 'align', 'valign', 'lang', 'transparency', 'textFill', 'textOutline', 'outline', 'charSpacing', 'lineSpacing', 'lineSpacingMultiple', 'paraSpaceBefore', 'paraSpaceAfter', 'indent', 'hanging', 'indentLevel', 'bullet', 'tabStops', 'strike', 'highlight', 'superscript', 'subscript', 'margin', 'wrap', 'fit', 'vert', 'fill', 'line', 'shadow', 'glow', 'reflection', 'softEdges', 'blur', 'fillOverlay', 'effect3D', 'text3D', 'textShadow', 'textGlow', 'textReflection', 'wordArt', 'effects', 'rectRadius', 'shape', 'rotate', 'flipH', 'flipV', 'wordArtStylePresetId', 'shapeStylePresetId', 'shapeEffectPresetId', 'shapeEffectPresetIds', 'textEffectPresetId', 'textEffectPresetIds', 'connectorStylePresetId', 'accent', 'isTextBox'])
const GROUP_IMAGE_OPTION_KEYS = new Set(['source', 'data', 'path', 'url', 'sizing', 'transparency', 'rounding', 'hyperlink', 'imageAdjustments', 'pictureStyle', 'pictureStylePresetId', 'pictureAdjuncts', 'imageAccessibility', 'line', 'shadow', 'glow', 'reflection', 'softEdges', 'blur', 'fillOverlay', 'effect3D', 'effects', 'rotate', 'flipH', 'flipV'])

function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function clone(value) { return value === undefined ? undefined : structuredClone(value) }
function finite(value, path, { min = -Infinity, max = Infinity } = {}) {
	const n = Number(value)
	if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${path} must be a finite number between ${min} and ${max}.`)
	return n
}
function integer(value, path, { min = -2147483648, max = 2147483647 } = {}) {
	const n = Number(value)
	if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${path} must be an integer between ${min} and ${max}.`)
	return n
}
function rejectPrivateKeys(value, path, allowed) {
	if (!isObject(value)) return
	for (const key of Object.keys(value)) {
		if (key.startsWith('_') || /(?:xml|package|filesystem|filePath|sourcePath|raw)/i.test(key)) throw new Error(`${path}.${key} is private and not part of the public structural contract.`)
		if (allowed && !allowed.has(key)) throw new Error(`${path}.${key} is not part of the public structural contract.`)
	}
}

function rejectPrivateTree(value, path) {
	if (Array.isArray(value)) { value.forEach((item, index) => rejectPrivateTree(item, `${path}[${index}]`)); return }
	if (!isObject(value)) return
	rejectPrivateKeys(value, path)
	for (const [key, item] of Object.entries(value)) {
		if (key === 'constructor' || key === 'prototype') throw new Error(`${path}.${key} is private and not part of the public structural contract.`)
		rejectPrivateTree(item, `${path}.${key}`)
	}
}

function validateDecorativeMetadata(value, path) {
	if (value.decorative !== undefined && typeof value.decorative !== 'boolean') throw new Error(`${path}.decorative must be boolean.`)
}

export const STRUCTURAL_BBOX_SCHEMA = Object.freeze({
	type: 'object', additionalProperties: false,
	properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number', minimum: 0 }, h: { type: 'number', minimum: 0 } },
})

export const STRUCTURAL_CONNECTOR_SCHEMA = Object.freeze({
	type: 'object', additionalProperties: false,
	properties: {
		connectorType: { type: 'string', enum: [...STRUCTURAL_CONNECTOR_TYPES] },
		routing: { type: ['string', 'null'], enum: [...STRUCTURAL_ROUTING_MODES, null] },
		region: { type: ['string', 'null'], minLength: 1, maxLength: 256 },
		x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number', minimum: 0 }, h: { type: 'number', minimum: 0 },
		startShapeId: { type: ['integer', 'null'], minimum: 1 }, startConnectionIndex: { type: ['integer', 'null'], minimum: 0, maximum: 8 },
		endShapeId: { type: ['integer', 'null'], minimum: 1 }, endConnectionIndex: { type: ['integer', 'null'], minimum: 0, maximum: 8 },
		connectorStylePresetId: CONNECTOR_STYLE_SELECTOR_SCHEMA, line: CONNECTOR_STYLE_LINE_SCHEMA,
		...CONNECTOR_EFFECT_PROPERTIES,
		rotate: { type: ['number', 'null'], minimum: -360, maximum: 360 }, flipH: { type: ['boolean', 'null'] }, flipV: { type: ['boolean', 'null'] },
		decorative: { type: 'boolean' },
		objectName: { type: ['string', 'null'], minLength: 1, maxLength: 256 }, editHandle: { type: ['string', 'null'], minLength: 1, maxLength: 256 }, title: { type: ['string', 'null'], minLength: 1, maxLength: 4096 }, altText: { type: ['string', 'null'], maxLength: 4096 },
	},
})

export const STRUCTURAL_POINT_SCHEMA = Object.freeze({
	type: 'object', additionalProperties: false,
	properties: {
		x: { type: 'number' }, y: { type: 'number' }, moveTo: { type: 'boolean' }, close: { type: 'boolean' },
		curve: { type: 'object', additionalProperties: false, properties: {
			type: { type: 'string', enum: ['arc', 'cubic', 'quadratic'] }, hR: { type: 'number' }, wR: { type: 'number' }, stAng: { type: 'number' }, swAng: { type: 'number' },
			x1: { type: 'number' }, y1: { type: 'number' }, x2: { type: 'number' }, y2: { type: 'number' },
		} },
	},
})

export const STRUCTURAL_GEOMETRY_SCHEMA = Object.freeze({
	type: 'object', additionalProperties: false,
	properties: {
		handle: { type: ['string', 'null'], pattern: '^customShape://[A-Za-z0-9._:/-]+$' }, geometryId: { type: ['string', 'null'], minLength: 1 },
		svg: { type: 'string', maxLength: 16777216 }, svgText: { type: 'string', maxLength: 16777216 }, markup: { type: 'string', maxLength: 16777216 }, dataUri: { type: 'string', maxLength: 16777216 }, pathData: { type: 'string', maxLength: 1048576 }, d: { type: 'string', maxLength: 1048576 },
		points: { type: 'array', minItems: 1, maxItems: 10000, items: STRUCTURAL_POINT_SCHEMA }, paths: { type: 'array', minItems: 1, maxItems: 256, items: { type: 'array', minItems: 1, maxItems: 10000, items: STRUCTURAL_POINT_SCHEMA } },
		booleanOperation: { type: ['string', 'null'], enum: [...STRUCTURAL_BOOLEAN_OPERATIONS, null] }, operation: { type: ['string', 'null'], enum: [...STRUCTURAL_BOOLEAN_OPERATIONS, null] }, operands: { type: 'array', minItems: 2, maxItems: 32, items: { type: 'object' } },
		bounds: STRUCTURAL_BBOX_SCHEMA, adjustments: { type: 'array', maxItems: 16, items: { type: 'number' } }, preset: { type: ['string', 'null'], minLength: 1 },
		decorative: { type: 'boolean' },
		x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number', exclusiveMinimum: 0 }, h: { type: 'number', exclusiveMinimum: 0 }, objectName: { type: ['string', 'null'], minLength: 1, maxLength: 256 }, editHandle: { type: ['string', 'null'], minLength: 1, maxLength: 256 }, region: { type: ['string', 'null'], minLength: 1, maxLength: 256 },
	},
})

export const STRUCTURAL_GROUP_CHILD_SCHEMA = Object.freeze({
	type: 'object', additionalProperties: false,
	allOf: [STRUCTURAL_LINE_CARRIER_SCHEMA, { if: { properties: { kind: { const: 'connector' } }, required: ['kind'] }, then: { properties: { style: { type: ['object', 'null'], properties: CONNECTOR_EFFECT_PROPERTIES } } } }],
	properties: {
		kind: { type: 'string', enum: [...STRUCTURAL_GROUP_CHILD_KINDS] },
		name: { type: 'string', minLength: 1, maxLength: 256 }, objectName: { type: 'string', minLength: 1, maxLength: 256 }, editHandle: { type: 'string', minLength: 1, maxLength: 256 }, altText: { type: 'string', maxLength: 4096 }, role: { type: 'string' }, decorative: { type: 'boolean' },
		x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number', minimum: 0 }, h: { type: 'number', minimum: 0 },
		shape: { type: 'string' }, shapeName: { type: 'string' }, connectorType: { type: 'string', enum: [...STRUCTURAL_CONNECTOR_TYPES] }, routing: { type: ['string', 'null'], enum: [...STRUCTURAL_ROUTING_MODES, null] },
		startShapeId: { type: 'integer', minimum: 1 }, startConnectionIndex: { type: 'integer', minimum: 0, maximum: 8 }, endShapeId: { type: 'integer', minimum: 1 }, endConnectionIndex: { type: 'integer', minimum: 0, maximum: 8 },
		connectorStylePresetId: CONNECTOR_STYLE_SELECTOR_SCHEMA, line: STRUCTURAL_SHAPE_LINE_SCHEMA, fill: { type: ['object', 'null'] },
		...CONNECTOR_EFFECT_PROPERTIES,
		style: { type: ['object', 'null'], additionalProperties: false, properties: Object.fromEntries([...GROUP_STYLE_KEYS].map(key => [key, key === 'textFill' ? TEXT_FILL_PUBLIC_SCHEMA : key === 'line' ? STRUCTURAL_SHAPE_LINE_SCHEMA : {}])) },
		text: { oneOf: [{ type: 'string', maxLength: 1048576 }, { type: 'array', maxItems: 10000, items: { type: ['string', 'object'] } }] },
		assetRef: { type: 'string', minLength: 1 }, source: IMAGE_ASSET_SOURCE_SCHEMA, data: { type: 'string' }, path: { type: 'string' }, url: { type: 'string' },
		imageOptions: { type: 'object', additionalProperties: false, properties: Object.fromEntries([...GROUP_IMAGE_OPTION_KEYS].map(key => [key, key === 'source' ? IMAGE_ASSET_SOURCE_SCHEMA : {}])) },
		sizing: { type: ['object', 'null'] }, pictureStyle: { type: ['object', 'null'] }, pictureStylePresetId: { type: ['string', 'null'] }, imageAdjustments: { type: ['object', 'null'] },
		rotation: { type: 'number', minimum: -360, maximum: 360 }, rotate: { type: 'number', minimum: -360, maximum: 360 }, flipH: { type: 'boolean' }, flipV: { type: 'boolean' },
		chOff: STRUCTURAL_BBOX_SCHEMA, chExt: STRUCTURAL_BBOX_SCHEMA,
		children: { type: 'array', minItems: 1, maxItems: 256, description: 'Nested children use this same closed group-child contract; maximum nesting depth is 12.', items: { type: 'object' } },
		points: { type: 'array', items: STRUCTURAL_POINT_SCHEMA }, paths: { type: 'array', items: { type: 'array', items: STRUCTURAL_POINT_SCHEMA } },
		handle: { type: 'string' }, geometryId: { type: 'string' }, svg: { type: 'string' }, svgText: { type: 'string' }, markup: { type: 'string' }, dataUri: { type: 'string' }, pathData: { type: 'string' }, d: { type: 'string' },
		booleanOperation: { type: ['string', 'null'], enum: [...STRUCTURAL_BOOLEAN_OPERATIONS, null] }, operation: { type: ['string', 'null'], enum: [...STRUCTURAL_BOOLEAN_OPERATIONS, null] }, operands: { type: 'array' }, bounds: STRUCTURAL_BBOX_SCHEMA, adjustments: { type: 'array' }, preset: { type: 'string' }, region: { type: 'string' },
	},
})

export const STRUCTURAL_GROUP_SCHEMA = Object.freeze({
	type: 'object', additionalProperties: false,
	properties: {
		x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number', exclusiveMinimum: 0 }, h: { type: 'number', exclusiveMinimum: 0 },
		rotation: { type: 'number', minimum: -360, maximum: 360 }, rotate: { type: 'number', minimum: -360, maximum: 360 }, flipH: { type: 'boolean' }, flipV: { type: 'boolean' },
		chOff: STRUCTURAL_BBOX_SCHEMA, chExt: STRUCTURAL_BBOX_SCHEMA, children: { type: 'array', minItems: 1, maxItems: 256, items: STRUCTURAL_GROUP_CHILD_SCHEMA },
		decorative: { type: 'boolean' },
		objectName: { type: ['string', 'null'], minLength: 1, maxLength: 256 }, editHandle: { type: ['string', 'null'], minLength: 1, maxLength: 256 }, region: { type: ['string', 'null'], minLength: 1, maxLength: 256 }, altText: { type: ['string', 'null'], minLength: 1, maxLength: 4096 },
	},
})

function normalizeRect(value, path, defaults = {}) {
	const source = isObject(value) ? value : {}
	const out = { ...defaults }
	for (const key of ['x', 'y', 'w', 'h']) if (source[key] !== undefined && source[key] !== null) out[key] = finite(source[key], `${path}.${key}`, { min: key === 'w' || key === 'h' ? 0 : -100000 })
	return out
}

function validatePoint(point, path) {
	if (!isObject(point)) throw new Error(`${path} must be an object.`)
	rejectPrivateKeys(point, path, POINT_KEYS)
	if (point.close === true) return { close: true }
	if (point.x === undefined || point.y === undefined) throw new Error(`${path} requires x and y, or close:true.`)
	const out = { x: finite(point.x, `${path}.x`), y: finite(point.y, `${path}.y`) }
	if (point.moveTo !== undefined) { if (typeof point.moveTo !== 'boolean') throw new Error(`${path}.moveTo must be boolean.`); out.moveTo = point.moveTo }
	if (point.curve !== undefined) {
		if (!isObject(point.curve)) throw new Error(`${path}.curve must be an object.`)
		rejectPrivateKeys(point.curve, `${path}.curve`, new Set(['type', 'hR', 'wR', 'stAng', 'swAng', 'x1', 'y1', 'x2', 'y2']))
		const type = String(point.curve.type || '')
		if (!['arc', 'cubic', 'quadratic'].includes(type)) throw new Error(`${path}.curve.type must be arc, cubic, or quadratic.`)
		const curve = { type }
		const required = type === 'arc' ? ['hR', 'wR', 'stAng', 'swAng'] : type === 'cubic' ? ['x1', 'y1', 'x2', 'y2'] : ['x1', 'y1']
		for (const key of required) curve[key] = finite(point.curve[key], `${path}.curve.${key}`)
		out.curve = curve
	}
	return out
}

export function normalizeStructuralPoints(points, path = 'points') {
	if (!Array.isArray(points) || points.length < 1 || points.length > 10000) throw new Error(`${path} must contain between 1 and 10000 vector commands.`)
	const out = points.map((point, index) => validatePoint(point, `${path}[${index}]`))
	if (!out.some(point => point.close !== true)) throw new Error(`${path} must contain drawable vector commands.`)
	return out
}

export function normalizeStructuralConnector(value, path = 'connector') {
	if (!isObject(value)) throw new Error(`${path} must be an object.`)
	rejectPrivateKeys(value, path, new Set(['kind', 'name', 'role', 'primitive', 'style', 'rect', 'bbox', 'patch', 'delete', 'remove', 'action', 'connectorType', 'connectorShape', 'routing', 'x', 'y', 'w', 'h', 'region', 'startShapeId', 'startConnectionIndex', 'endShapeId', 'endConnectionIndex', 'connectorStylePresetId', 'line', 'objectName', 'editHandle', 'title', 'altText', 'from', 'to', 'hyperlink', ...CONNECTOR_EFFECT_FIELDS, 'rotate', 'rotation', 'flipH', 'flipV', 'animation', 'decorative']))
	rejectPrivateTree(value, path)
	validateDecorativeMetadata(value, path)
	const out = clone(value)
	if (value.style != null && !isObject(value.style)) throw new Error(`${path}.style must be an object or null.`)
	// A dry run must reject invalid sparse effect edits too. Validate without
	// lowering the patch: filling defaults here would erase untouched components.
	if (isObject(value.patch)) normalizeConnectorEffects(value.patch, `${path}.patch`)
	const rootEffects = Object.fromEntries(CONNECTOR_EFFECT_FIELDS.filter(key => Object.prototype.hasOwnProperty.call(value, key)).map(key => [key, value[key]]))
	const normalizedEffects = normalizeConnectorEffects({ ...value.style, ...rootEffects }, `${path}.style`)
	if (Object.keys(normalizedEffects).length) {
		// Layout reads sparse style, while direct insertion reads native options.
		// Keep the same validated components in both lanes, including null resets.
		out.style = { ...out.style, ...normalizedEffects }
		Object.assign(out, normalizedEffects)
	}
	const connectorType = String(value.connectorType || value.connectorShape || 'straightConnector1')
	if (!CONNECTOR_TYPE_SET.has(connectorType)) throw new Error(`${path}.connectorType must be one of the supported native connector types.`)
	out.connectorType = connectorType
	if (value.routing !== undefined && value.routing !== null) { const routing = String(value.routing); if (!ROUTING_SET.has(routing)) throw new Error(`${path}.routing must be one of auto, straight, orthogonal, elbow, or curved.`); out.routing = routing }
	for (const key of ['x', 'y', 'w', 'h']) if (value[key] !== undefined && value[key] !== null) out[key] = finite(value[key], `${path}.${key}`, { min: key === 'w' || key === 'h' ? 0 : -100000 })
	for (const [idKey, indexKey] of [['startShapeId', 'startConnectionIndex'], ['endShapeId', 'endConnectionIndex']]) {
		if (value[idKey] !== undefined && value[idKey] !== null) out[idKey] = integer(value[idKey], `${path}.${idKey}`, { min: 1 })
		if (value[indexKey] !== undefined && value[indexKey] !== null) out[indexKey] = integer(value[indexKey], `${path}.${indexKey}`, { min: 0, max: 8 })
		if (out[indexKey] !== undefined && out[idKey] === undefined) throw new Error(`${path}.${indexKey} requires ${idKey}.`)
	}
	if (Object.prototype.hasOwnProperty.call(value, 'connectorStylePresetId')) out.connectorStylePresetId = normalizeConnectorStylePresetId(value.connectorStylePresetId, `${path}.connectorStylePresetId`)
	if (Object.prototype.hasOwnProperty.call(value, 'line')) out.line = normalizeConnectorLineOverrides(value.line, `${path}.line`)
	if (value.rotate !== undefined && value.rotate !== null) out.rotate = finite(value.rotate, `${path}.rotate`, { min: -360, max: 360 })
	for (const key of ['flipH', 'flipV']) if (value[key] != null && typeof value[key] !== 'boolean') throw new Error(`${path}.${key} must be a boolean or null.`)
	return out
}

function normalizeGeometrySource(value, path) {
	if (!isObject(value)) throw new Error(`${path} must be an object.`)
	rejectPrivateKeys(value, path, new Set([...GEOMETRY_KEYS, 'name', 'role', 'primitive', 'style', 'rect', 'bbox', 'patch', 'delete', 'remove', 'action', 'title', 'altText']))
	validateDecorativeMetadata(value, path)
	const out = clone(value)
	for (const [line, linePath] of [[value.line, `${path}.line`], [value.style?.line, `${path}.style.line`]]) normalizeStructuralShapeLine(line, linePath)
	if (value.handle !== undefined && value.handle !== null) {
		const handle = String(value.handle).trim()
		if (!/^customShape:\/\/[A-Za-z0-9._:/-]+$/.test(handle)) throw new Error(`${path}.handle must be an opaque customShape:// handle.`)
		out.handle = handle
	}
	if (value.geometryId !== undefined && value.geometryId !== null) out.geometryId = String(value.geometryId).trim()
	for (const key of ['x', 'y', 'w', 'h']) if (value[key] !== undefined && value[key] !== null) out[key] = finite(value[key], `${path}.${key}`, { min: key === 'w' || key === 'h' ? 0.0001 : -100000 })
	if (value.points !== undefined) out.points = normalizeStructuralPoints(value.points, `${path}.points`)
	if (value.paths !== undefined) {
		if (!Array.isArray(value.paths) || value.paths.length < 1 || value.paths.length > 256) throw new Error(`${path}.paths must contain 1..256 paths.`)
		out.paths = value.paths.map((points, index) => normalizeStructuralPoints(points, `${path}.paths[${index}]`))
	}
	const operation = value.booleanOperation ?? value.operation
	if (operation !== undefined && operation !== null) { const normalized = String(operation).toLowerCase(); if (!BOOLEAN_SET.has(normalized)) throw new Error(`${path}.booleanOperation must be one of ${[...BOOLEAN_SET].join(', ')}.`); out.booleanOperation = normalized; out.operation = normalized }
	if (value.operands !== undefined) {
		if (!Array.isArray(value.operands) || value.operands.length < 2 || value.operands.length > 32) throw new Error(`${path}.operands must contain 2..32 bounded geometry operands.`)
		out.operands = value.operands.map((operand, index) => normalizeGeometrySource(operand, `${path}.operands[${index}]`))
	}
	if (!out.handle && !out.geometryId && !out.points && !out.paths && !out.svg && !out.svgText && !out.markup && !out.dataUri && !out.pathData && !out.d) throw new Error(`${path} requires an opaque handle or a bounded vector source.`)
	return out
}

export function normalizeStructuralGeometry(value, path = 'geometry') {
	const out = normalizeGeometrySource(value, path)
	// PowerPoint's custGeom path list is represented by one ordered command
	// array in the library.  Flatten bounded path/operand collections into that
	// carrier deterministically; the operation selector remains semantic state
	// for readback and can be edited independently.
	if (!out.points && Array.isArray(out.paths)) {
		out.points = out.paths.flatMap((points, index) => index === 0 ? points : [{ close: true }, ...points.map((point, pointIndex) => pointIndex === 0 && point.close !== true ? { ...point, moveTo: true } : point)])
	}
	if (!out.points && Array.isArray(out.operands)) {
		const operandPoints = out.operands.flatMap(operand => Array.isArray(operand.points) ? operand.points : [])
		if (operandPoints.length) out.points = operandPoints
	}
	return out
}

function normalizeGroupChild(value, path, depth = 0) {
	if (!isObject(value)) throw new Error(`${path} must be an object.`)
	if (depth > 12) throw new Error(`${path} exceeds the maximum nested group depth of 12.`)
	const kind = String(value.kind || 'shape')
	if (!STRUCTURAL_GROUP_CHILD_KINDS.includes(kind)) throw new Error(`${path}.kind is not a supported native group child kind.`)
	const allowed = new Set(Object.keys(STRUCTURAL_GROUP_CHILD_SCHEMA.properties))
	rejectPrivateKeys(value, path, allowed)
	rejectPrivateTree(value, path)
	validateDecorativeMetadata(value, path)
	if (value.style !== undefined && value.style !== null) {
		if (!isObject(value.style)) throw new Error(`${path}.style must be an object or null.`)
		rejectPrivateKeys(value.style, `${path}.style`, GROUP_STYLE_KEYS)
		if (Object.prototype.hasOwnProperty.call(value.style, 'textFill')) normalizeTextFill(value.style.textFill, `${path}.style.textFill`)
	}
	for (const [line, linePath] of [[value.line, `${path}.line`], [value.style?.line, `${path}.style.line`]]) {
		if (STRUCTURAL_SHAPE_LINE_KINDS.includes(kind)) normalizeStructuralShapeLine(line, linePath)
		if (!isObject(line) || !Object.prototype.hasOwnProperty.call(line, 'cap')) continue
		if (!STRUCTURAL_SHAPE_LINE_KINDS.includes(kind)) throw new Error(`${linePath}.cap is supported only on ordinary or freeform shape strokes.`)
		if (!STRUCTURAL_SHAPE_LINE_CAPS.includes(line.cap)) throw new Error(`${linePath}.cap must be flat, round, or square.`)
	}
	if (GROUP_TEXT_KINDS.has(kind) && typeof value.text !== 'string' && !Array.isArray(value.text)) throw new Error(`${path}.text must be a string or a rich-text array.`)
	if (!GROUP_TEXT_KINDS.has(kind) && value.text !== undefined) throw new Error(`${path}.text requires a text, textBox, or textShape child.`)
	if (GROUP_IMAGE_KINDS.has(kind)) {
		if (value.imageOptions !== undefined) {
			if (!isObject(value.imageOptions)) throw new Error(`${path}.imageOptions must be an object.`)
			rejectPrivateKeys(value.imageOptions, `${path}.imageOptions`, GROUP_IMAGE_OPTION_KEYS)
		}
		for (const [sourcePath, source] of [[`${path}.source`, value.source], [`${path}.imageOptions.source`, value.imageOptions?.source]]) if (source !== undefined && source !== null) validateImageAssetSource(source, sourcePath)
		if (![value.assetRef, value.source, value.data, value.path, value.url, value.imageOptions?.source, value.imageOptions?.data, value.imageOptions?.path, value.imageOptions?.url].some(Boolean)) throw new Error(`${path} image child requires an explicit media source.`)
	}
	let out = clone(value)
	if (kind === 'connector') out = { ...out, ...normalizeStructuralConnector(value, path) }
	if (kind === 'freeform' || kind === 'customGeometry' || kind === 'custom-geometry') out = { ...out, ...normalizeGeometrySource(value, path) }
	if (kind === 'group') out = { ...out, ...normalizeStructuralGroup(value, path, depth + 1) }
	for (const key of ['x', 'y', 'w', 'h']) if (value[key] !== undefined && value[key] !== null) out[key] = finite(value[key], `${path}.${key}`, { min: key === 'w' || key === 'h' ? 0 : -100000 })
	if (value.objectName !== undefined && value.objectName !== null && !String(value.objectName).trim()) throw new Error(`${path}.objectName must be non-empty.`)
	for (const key of ['rotate', 'rotation']) if (value[key] !== undefined && value[key] !== null) out[key] = finite(value[key], `${path}.${key}`, { min: -360, max: 360 })
	return out
}

export function normalizeStructuralGroup(value, path = 'group', depth = 0) {
	if (!isObject(value)) throw new Error(`${path} must be an object.`)
	if (depth > 12) throw new Error(`${path} exceeds the maximum nested group depth of 12.`)
	const allowed = new Set(['kind', 'name', 'role', 'primitive', 'style', 'rect', 'bbox', 'patch', 'delete', 'remove', 'action', 'x', 'y', 'w', 'h', 'region', 'rotation', 'rotate', 'flipH', 'flipV', 'chOff', 'chExt', 'children', 'objectName', 'editHandle', 'altText', 'decorative'])
	rejectPrivateKeys(value, path, allowed)
	rejectPrivateTree(value, path)
	validateDecorativeMetadata(value, path)
	if (!Array.isArray(value.children) || value.children.length < 1 || value.children.length > 256) throw new Error(`${path}.children must contain between 1 and 256 children.`)
	const out = clone(value)
	for (const key of ['x', 'y', 'w', 'h']) if (value[key] !== undefined && value[key] !== null) out[key] = finite(value[key], `${path}.${key}`, { min: key === 'w' || key === 'h' ? 0.0001 : -100000 })
	for (const key of ['rotate', 'rotation']) if (value[key] !== undefined && value[key] !== null) out[key] = finite(value[key], `${path}.${key}`, { min: -360, max: 360 })
	for (const key of ['chOff', 'chExt']) if (value[key] !== undefined && value[key] !== null) out[key] = normalizeRect(value[key], `${path}.${key}`, { x: 0, y: 0, w: 0, h: 0 })
	out.children = value.children.map((child, index) => normalizeGroupChild(child, `${path}.children[${index}]`, depth))
	return out
}

export function validateStructuralBlock(value, path = 'content') {
	if (!isObject(value)) return value
	if (STRUCTURAL_SHAPE_LINE_KINDS.includes(value.kind)) {
		for (const [line, linePath] of [[value.line, `${path}.line`], [value.style?.line, `${path}.style.line`]]) normalizeStructuralShapeLine(line, linePath)
	}
	if (value.kind === 'connector') return normalizeStructuralConnector(value, path)
	if (value.kind === 'group') return normalizeStructuralGroup(value, path)
	if (value.kind === 'freeform' || value.kind === 'customGeometry' || value.kind === 'custom-geometry') return normalizeStructuralGeometry(value, path)
	if (Array.isArray(value.children)) return { ...value, children: value.children.map((child, index) => validateStructuralBlock(child, `${path}.children[${index}]`)) }
	return value
}

export const STRUCTURAL_PARAMETERS = Object.freeze([
	{ id: 'connectorType', type: 'discrete', valueType: 'enum', values: STRUCTURAL_CONNECTOR_TYPES, semanticPath: 'content[].connectorType', serializer: 'native p:cxnSp/a:prstGeom/@prst', reset: 'set connectorType to null to restore straightConnector1', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'connectorRouting', type: 'discrete', valueType: 'enum', values: STRUCTURAL_ROUTING_MODES, semanticPath: 'content[].routing', serializer: 'native connector geometry selection', reset: 'set routing to null to restore auto routing', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'startConnection', type: 'structured', valueType: 'shape-id-plus-index', semanticPath: 'content[].startShapeId/startConnectionIndex', serializer: 'native a:stCxn', reset: 'set both start fields to null', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'endConnection', type: 'structured', valueType: 'shape-id-plus-index', semanticPath: 'content[].endShapeId/endConnectionIndex', serializer: 'native a:endCxn', reset: 'set both end fields to null', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'groupCoordinateSpace', type: 'structured', valueType: 'chOff-chExt', semanticPath: 'content[].chOff/content[].chExt', serializer: 'native a:xfrm/a:chOff+a:chExt', reset: 'set chOff/chExt to null to restore the group box', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'groupChildren', type: 'structured', valueType: 'ordered-structural-children', semanticPath: 'content[].children[]', serializer: 'native p:grpSp child tree', reset: 'set children to null only when deleting the group', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'customGeometryPaths', type: 'structured', valueType: 'bounded-vector-command-array', semanticPath: 'content[].points[]/paths[]', serializer: 'native a:custGeom/a:pathLst', reset: 'set points/paths to null and provide a new source', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'booleanGeometryOperation', type: 'discrete', valueType: 'enum', values: STRUCTURAL_BOOLEAN_OPERATIONS, semanticPath: 'content[].booleanOperation', serializer: 'native custGeom path composition', reset: 'set booleanOperation to null', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'customGeometryHandle', type: 'discrete', valueType: 'opaque-handle', semanticPath: 'content[].handle', serializer: 'native catalog geometry materialization', reset: 'set handle to null and provide vector source', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
])

export const STRUCTURAL_PUBLIC_SCHEMA = Object.freeze({
	oneOf: [STRUCTURAL_CONNECTOR_SCHEMA, STRUCTURAL_GEOMETRY_SCHEMA, STRUCTURAL_GROUP_SCHEMA],
})

export const STRUCTURAL_CONTRACT = Object.freeze({
	id: 'structuralAuthoring', schemaVersion: 'betterpptx.structural-authoring-contract.v1', capabilityMode: 'parameterized', capabilityStatus: STRUCTURAL_RUNTIME_INTEGRATION_COMPLETE ? 'executable-exact-structured' : 'structured-partial', runtimeReady: STRUCTURAL_RUNTIME_INTEGRATION_COMPLETE,
	componentOwnership: Object.freeze(['geometry', 'relationships', 'metadata']),
	overrideFields: Object.freeze(['connectorType', 'routing', 'startShapeId', 'startConnectionIndex', 'endShapeId', 'endConnectionIndex', 'chOff', 'chExt', 'children', 'points', 'paths', 'booleanOperation', 'handle']),
	resetBehavior: Object.freeze({ component: 'set one structural field to null to remove that authored override', full: 'remove the structural object or replace its complete bounded geometry/group definition', nullBehavior: 'explicit null resets the named component; omission preserves the authored structural state' }),
	precedence: Object.freeze(['semantic endpoint/child relationships', 'authored group coordinate space', 'authored bounded geometry', 'native defaults']),
	legalCombinations: Object.freeze(['connector with endpoint IDs and line style', 'nested groups with transformed child coordinate spaces', 'freeform paths with one boolean operation', 'opaque imported geometry beside authored vector geometry', 'sparse reset followed by re-edit']),
	rowIds: STRUCTURAL_ROW_IDS,
	publicSchema: STRUCTURAL_PUBLIC_SCHEMA,
	parameters: STRUCTURAL_PARAMETERS,
})

export function structuralCapabilityContractForEntry(entry = {}) {
	if (STRUCTURAL_ROW_IDS.includes(entry.id)) return STRUCTURAL_CONTRACT
	if (entry.family === 'structural' && (entry.sourceKind === 'authoring-family' || entry.sourceKind === 'capability-row')) return STRUCTURAL_CONTRACT
	return null
}

export const STRUCTURAL_CONNECTOR_STYLE_ROW_IDS = CONNECTOR_STYLE_ROW_IDS
