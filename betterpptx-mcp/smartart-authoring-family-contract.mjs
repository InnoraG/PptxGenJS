import { SMARTART_FORMAT_PARAMETERS, validateSmartArtFormatOptions } from './option-registry.mjs'

// Closed authoring contract for the executable native SmartArt subset. Imported
// diagrams that cannot be safely decomposed remain preserve-only rows; this
// contract covers the 18 generated rows whose selectors/topology are authored
// through the native data model and public JSON-spec surface.
export const SMARTART_AUTHORING_UNIT_ID = 'impl-c-389075ac98f2ffaa'
export const SMARTART_AUTHORING_SCHEMA_VERSION = 'betterpptx.smartart-authoring-family.v1'
export const SMARTART_AUTHORING_STATE_SCHEMA_VERSION = 'betterpptx.smartart-authoring-state.v1'
export const SMARTART_RUNTIME_INTEGRATION_COMPLETE = true

export const SMARTART_ROW_IDS = Object.freeze([
	'cap_0a654e839aa558cbd160', 'cap_1dc384bacc1b5b0efbac', 'cap_21c86dfde5c280faebf5',
	'cap_23fe60904d5458ba9906', 'cap_24e08a867bd838823477', 'cap_4bd2bef6ae9b244f1cda',
	'cap_5065ccf7c9b062385ab2', 'cap_54c52491d27019e654e5', 'cap_62620624798848481ac2',
	'cap_826386e54e7030c6d2f1', 'cap_89f46a9291cf74de3044', 'cap_9095f9e8b7e6c23b89bc',
	'cap_9a8feaa6d63b41de63c5', 'cap_af41b1e2b46e34bb79cd', 'cap_b1a0f6b0031df602e2fe',
	'cap_c2a9c57c0f9d4d991778', 'cap_dd2ada5b72117c9adfb1', 'cap_dfbc325b9439830e42e1',
])

export const SMARTART_LAYOUT_CATEGORIES = Object.freeze(['list', 'process', 'cycle', 'hierarchy', 'relationship', 'matrix', 'pyramid', 'picture', 'timeline', 'team'])
export const SMARTART_MODES = Object.freeze(['native', 'shape'])
export const SMARTART_NODE_ROLES = Object.freeze(['root', 'manager', 'member', 'peer', 'node', 'image', 'caption', 'assistant'])
const HEX = '^(?:#?[0-9A-Fa-f]{6})$'
const MAX_TEXT = 4096

const nullable = schema => ({ anyOf: [schema, { type: 'null' }] })
const colorSchema = nullable({ type: 'string', minLength: 1, maxLength: 128, pattern: HEX })
const textSchema = nullable({ type: 'string', maxLength: MAX_TEXT })

const nodeObjectSchema = {
	type: 'object', additionalProperties: false,
	properties: {
		id: nullable({ type: 'string', minLength: 1, maxLength: 256 }),
		text: textSchema, title: textSchema, subtitle: textSchema, label: textSchema, name: textSchema,
		role: nullable({ type: 'string', enum: [...SMARTART_NODE_ROLES] }),
		textColorRole: nullable({ type: 'string', minLength: 1, maxLength: 128 }),
		image: textSchema, imagePath: textSchema, imageUrl: nullable({ type: 'string', minLength: 1, maxLength: 4096 }), imageData: textSchema,
		color: colorSchema,
		fill: { type: ['object', 'null'] }, line: { type: ['object', 'null'] },
		children: { type: ['array', 'null'], maxItems: 1000, items: { type: 'object' } },
	},
}

export const SMARTART_NODE_PUBLIC_SCHEMA = Object.freeze({
	$defs: { node: nodeObjectSchema },
	oneOf: [{ type: 'string', minLength: 1, maxLength: MAX_TEXT }, { $ref: '#/$defs/node' }],
})

export const SMARTART_OPTIONS_PUBLIC_SCHEMA = Object.freeze({
	type: 'object', additionalProperties: false,
	properties: {
		x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number', exclusiveMinimum: 0 }, h: { type: 'number', exclusiveMinimum: 0 },
		rotate: { type: 'number' }, rotation: { type: 'number' }, flipH: { type: 'boolean' }, flipV: { type: 'boolean' },
		mode: { type: 'string', enum: [...SMARTART_MODES] }, native: { type: ['boolean', 'null'] },
		layout: { type: ['string', 'null'], minLength: 1, maxLength: 256 }, layoutId: textSchema, layoutName: textSchema,
		quickStyleId: textSchema, quickStyleName: textSchema, colorStyleId: textSchema, colorStyleName: textSchema,
		presetFallback: { type: ['string', 'null'], enum: ['reject', 'default', null] }, rightToLeft: { type: ['boolean', 'null'] },
		fontFace: textSchema, fontSize: nullable({ type: 'number', exclusiveMinimum: 0, maximum: 400 }), color: colorSchema,
		textColors: { type: ['array', 'null'], maxItems: 1000, items: colorSchema }, palette: { type: ['array', 'null'], maxItems: 12, items: colorSchema },
		nodes: { type: ['array', 'null'], maxItems: 1000, items: SMARTART_NODE_PUBLIC_SCHEMA },
		title: textSchema, altText: textSchema, accessibilityTitle: textSchema, isDecorative: { type: ['boolean', 'null'] },
		objectName: nullable({ type: 'string', minLength: 1, maxLength: 256 }), editHandle: nullable({ type: 'string', minLength: 1, maxLength: 256 }),
		fill: { type: ['object', 'null'] }, line: { type: ['object', 'null'] }, shadow: { type: ['object', 'null'] },
		margin: { anyOf: [{ type: 'number', minimum: 0 }, { type: 'array', minItems: 4, maxItems: 4, items: { type: 'number', minimum: 0 } }, { type: 'null' }] },
		fit: { type: ['object', 'null'] }, transparency: nullable({ type: 'number', minimum: 0, maximum: 100 }), textDirection: nullable({ type: 'string', minLength: 1, maxLength: 64 }),
		animation: { type: ['object', 'array', 'null'] }, spid: { type: ['integer', 'null'], minimum: 1 },
	},
})

export const SMARTART_PANEL_PUBLIC_SCHEMA = Object.freeze({
	type: 'object', additionalProperties: true, required: ['kind', 'name'],
	properties: {
		kind: { enum: ['smartart', 'diagram'] }, name: { type: 'string', minLength: 1, maxLength: 256 },
		...SMARTART_OPTIONS_PUBLIC_SCHEMA.properties,
		items: { type: ['array', 'null'], maxItems: 1000, items: SMARTART_NODE_PUBLIC_SCHEMA },
		summary: textSchema,
		style: { type: ['object', 'null'] }, bbox: { type: ['object', 'null'] }, rect: { type: ['object', 'null'] },
		role: { type: ['string', 'null'] }, region: { type: ['string', 'null'] }, patch: { type: ['object', 'null'] }, delete: { type: 'boolean' }, remove: { type: 'boolean' },
	},
})

const OPTION_KEYS = new Set(Object.keys(SMARTART_OPTIONS_PUBLIC_SCHEMA.properties))
const NODE_KEYS = new Set(['id', 'text', 'title', 'subtitle', 'label', 'name', 'role', 'textColorRole', 'image', 'imagePath', 'imageUrl', 'imageData', 'color', 'fill', 'line', 'children'])

function clone(value) { return value === undefined ? undefined : structuredClone(value) }
function finite(value, path, min = -Infinity, max = Infinity) {
	const number = Number(value)
	if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${path} must be a finite number between ${min} and ${max}.`)
	return number
}
function rejectUnknown(value, path, allowed) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return
	for (const key of Object.keys(value)) {
		if (key.startsWith('_') || /(?:xml|package|filesystem|filePath|sourcePath|raw)/i.test(key)) throw new Error(`${path}.${key} is private and cannot be authored.`)
		if (!allowed.has(key)) throw new Error(`${path}.${key} is not part of the public SmartArt contract.`)
	}
}
function normalizeColor(value, path) {
	if (value === undefined || value === null) return value
	const text = String(value).trim().replace(/^#/, '')
	if (!/^[0-9A-F]{6}$/i.test(text)) throw new Error(`${path} must be a six-digit RGB color.`)
	return text.toUpperCase()
}
function normalizeNode(value, path, depth = 0) {
	if (typeof value === 'string') {
		if (!value.trim() || value.length > MAX_TEXT) throw new Error(`${path} must be a non-empty string of at most ${MAX_TEXT} characters.`)
		return value
	}
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be a string or node object.`)
	if (depth > 32) throw new Error(`${path} exceeds the maximum SmartArt nesting depth of 32.`)
	rejectUnknown(value, path, NODE_KEYS)
	const out = clone(value)
	if (out.id !== undefined && out.id !== null && (typeof out.id !== 'string' || !out.id.trim() || out.id.length > 256)) throw new Error(`${path}.id must be a non-empty string of at most 256 characters or null.`)
	if (out.text === undefined && (out.label !== undefined || out.name !== undefined)) out.text = out.label ?? out.name
	for (const key of ['text', 'title', 'subtitle']) if (out[key] !== undefined && out[key] !== null) { out[key] = String(out[key]); if (!out[key].trim() || out[key].length > MAX_TEXT) throw new Error(`${path}.${key} must be non-empty and at most ${MAX_TEXT} characters.`) }
	if (out.role !== undefined && out.role !== null && !SMARTART_NODE_ROLES.includes(String(out.role))) throw new Error(`${path}.role must be one of ${SMARTART_NODE_ROLES.join(', ')}.`)
	if (out.textColorRole !== undefined && out.textColorRole !== null && (typeof out.textColorRole !== 'string' || !out.textColorRole.trim())) throw new Error(`${path}.textColorRole must be a non-empty string.`)
	for (const key of ['color']) if (out[key] !== undefined) out[key] = normalizeColor(out[key], `${path}.${key}`)
	for (const key of ['image', 'imagePath', 'imageUrl', 'imageData']) if (out[key] !== undefined && out[key] !== null && typeof out[key] !== 'string') throw new Error(`${path}.${key} must be a string or null.`)
	if (out.children !== undefined && out.children !== null) {
		if (!Array.isArray(out.children) || out.children.length > 1000) throw new Error(`${path}.children must contain at most 1000 nodes.`)
		out.children = out.children.map((child, index) => normalizeNode(child, `${path}.children[${index}]`, depth + 1))
	}
	return out
}

export function normalizeSmartArtOptions(value, path = 'smartArt') {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
	rejectUnknown(value, path, OPTION_KEYS)
	const out = clone(value)
	if (out.mode !== undefined && out.mode !== null && !SMARTART_MODES.includes(String(out.mode))) throw new Error(`${path}.mode must be native or shape.`)
	if (out.native !== undefined && out.native !== null && typeof out.native !== 'boolean') throw new Error(`${path}.native must be boolean or null.`)
	for (const key of ['x', 'y', 'w', 'h', 'rotate', 'rotation']) if (out[key] !== undefined && out[key] !== null) out[key] = finite(out[key], `${path}.${key}`, key === 'w' || key === 'h' ? 0.0001 : -100000)
	for (const key of ['flipH', 'flipV']) if (out[key] !== undefined && out[key] !== null && typeof out[key] !== 'boolean') throw new Error(`${path}.${key} must be boolean or null.`)
	for (const key of ['layout', 'layoutId', 'layoutName', 'quickStyleId', 'quickStyleName', 'colorStyleId', 'colorStyleName', 'fontFace', 'title', 'altText', 'accessibilityTitle', 'objectName', 'editHandle']) if (out[key] !== undefined && out[key] !== null && (typeof out[key] !== 'string' || !out[key].trim())) throw new Error(`${path}.${key} must be a non-empty string or null.`)
	if (out.presetFallback !== undefined && out.presetFallback !== null && !['reject', 'default'].includes(out.presetFallback)) throw new Error(`${path}.presetFallback must be reject or default.`)
	if (out.rightToLeft !== undefined && out.rightToLeft !== null && typeof out.rightToLeft !== 'boolean') throw new Error(`${path}.rightToLeft must be boolean or null.`)
	if (out.fontSize !== undefined && out.fontSize !== null) out.fontSize = finite(out.fontSize, `${path}.fontSize`, 1, 400)
	if (out.color !== undefined) out.color = normalizeColor(out.color, `${path}.color`)
	for (const key of ['textColors', 'palette']) if (out[key] !== undefined && out[key] !== null) {
		const max = key === 'palette' ? 12 : 1000
		if (!Array.isArray(out[key]) || out[key].length > max) throw new Error(`${path}.${key} must contain at most ${max} colors.`)
		out[key] = out[key].map((color, index) => normalizeColor(color, `${path}.${key}[${index}]`))
	}
	if (out.nodes !== undefined && out.nodes !== null) {
		if (!Array.isArray(out.nodes) || out.nodes.length > 1000 || out.nodes.length < 1) throw new Error(`${path}.nodes must contain between 1 and 1000 nodes.`)
		out.nodes = out.nodes.map((node, index) => normalizeNode(node, `${path}.nodes[${index}]`))
	}
	// Retain the existing format validator for its generated numeric/enum rules.
	validateSmartArtFormatOptions(out, path)
	return out
}

export function validateSmartArtBlock(value, path = 'content') {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return value
	if (value.kind !== 'smartart' && value.kind !== 'diagram') return value
	const style = value.style && typeof value.style === 'object' && !Array.isArray(value.style) ? value.style : {}
	const optionFields = Object.fromEntries([...OPTION_KEYS].filter(key => Object.prototype.hasOwnProperty.call(value, key)).map(key => [key, value[key]]))
	for (const key of ['fontFace', 'fontSize', 'color', 'textColors', 'palette']) if (!Object.prototype.hasOwnProperty.call(optionFields, key) && Object.prototype.hasOwnProperty.call(style, key)) optionFields[key] = style[key]
	const normalized = normalizeSmartArtOptions(optionFields, path)
	for (const key of Object.keys(normalized)) if (Object.prototype.hasOwnProperty.call(value, key)) value[key] = normalized[key]
	if (Object.prototype.hasOwnProperty.call(value, 'nodes')) value.nodes = normalized.nodes
	if (Object.prototype.hasOwnProperty.call(value, 'items') && Array.isArray(value.items)) value.items = value.items.map((item, index) => normalizeNode(item, `${path}.items[${index}]`))
	return value
}

export const SMARTART_CONTRACT = Object.freeze({
	id: 'smartArtAuthoring', schemaVersion: SMARTART_AUTHORING_SCHEMA_VERSION, capabilityMode: 'preset-plus-parameters', capabilityStatus: SMARTART_RUNTIME_INTEGRATION_COMPLETE ? 'executable-exact-structured' : 'structured-partial', runtimeReady: SMARTART_RUNTIME_INTEGRATION_COMPLETE,
	componentOwnership: Object.freeze(['layout', 'quickStyle', 'colorStyle', 'topology', 'text', 'palette', 'accessibility']),
	overrideFields: Object.freeze(SMARTART_FORMAT_PARAMETERS.map(item => item.id)),
	resetBehavior: Object.freeze({ component: 'set one SmartArt field to null to restore the selected native default', full: 'remove or replace the SmartArt object while preserving explicit node content when re-editing', nullBehavior: 'null removes only that manual override; omission preserves the current authored value' }),
	precedence: Object.freeze(['explicit node topology and text', 'explicit layout/style/color selectors', 'authored typography and palette', 'native catalog defaults']),
	legalCombinations: Object.freeze(['native layout with quickStyleId and colorStyleId', 'hierarchy roles with child topology', 'picture layouts with an image source on every node', 'right-to-left direction with explicit text colors', 'sparse selector reset followed by node re-edit', 'shape-built fallback only when explicitly selected']),
	rowIds: SMARTART_ROW_IDS, parameters: SMARTART_FORMAT_PARAMETERS, publicSchema: SMARTART_PANEL_PUBLIC_SCHEMA,
})

export function smartArtCapabilityContractForEntry(entry = {}) {
	if (SMARTART_ROW_IDS.includes(entry.id)) return SMARTART_CONTRACT
	if (entry.family === 'smartart' && (entry.sourceKind === 'authoring-family' || entry.sourceKind === 'capability-row')) return SMARTART_CONTRACT
	return null
}
