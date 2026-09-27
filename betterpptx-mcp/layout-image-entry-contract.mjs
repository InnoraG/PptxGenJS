// Exact row contracts for two historically co-located capability-ledger entries.
// `clipArt` is a PresentationML placeholder type; `add image` is an authoring
// operation.  Keeping the contracts separate prevents a placeholder selector
// from inheriting picture-format ownership merely because both rows were
// emitted under the legacy layouts/themes/masters reporting family.

import { IMAGE_ACCESSIBILITY_PARAMETERS } from './image-accessibility-catalog.mjs'
import {
	IMAGE_ASSET_SOURCE_SCHEMA,
	IMAGE_FRAMING_CONTRACT,
	MEDIA_IMAGE_EXACT_CONTRACT_BUCKETS,
	MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS,
	PICTURE_ADJUNCTS_SCHEMA,
	validateImageAssetSource,
	validatePictureAdjuncts,
	normalizeImageFraming,
} from './media-image-formatting-contract.mjs'
import {
	PICTURE_STYLE_COMPONENT_OWNERSHIP,
	PICTURE_STYLE_OVERRIDE_FIELDS,
	PICTURE_STYLE_PRESETS,
	PICTURE_STYLE_PUBLIC_SCHEMA,
	PICTURE_STYLE_RESET_BEHAVIOR,
	normalizePictureStyle,
} from './picture-style-presets.mjs'
import { SHAPE_FORMATTING_SCHEMA } from './native-formatting-contract.mjs'
import {
	ARTISTIC_EFFECTS,
	ARTISTIC_EFFECT_PARAMETER_CATALOG,
	MAX_NATIVE_PLACEHOLDER_INDEX,
	NATIVE_PLACEHOLDER_ORIENTATIONS,
	NATIVE_PLACEHOLDER_SIZES,
	NATIVE_PLACEHOLDER_TYPES,
	PICTURE_COLOR_SCHEMES,
	PICTURE_CORRECTION_PARAMETERS,
	normalizeArtisticEffect,
	normalizeImageAdjustments,
} from './ir/native-visual-primitives.mjs'

export const LAYOUT_IMAGE_ENTRY_UNIT_ID = 'impl-a-02816e2aae476494'
export const CLIPART_PLACEHOLDER_ROW_ID = 'cap_52beb772e20220caedce'
export const ADD_IMAGE_OPERATION_ROW_ID = 'cap_a8ed1560f83db5f233b6'

const PLACEHOLDER_MARGIN_SCHEMA = Object.freeze({
	oneOf: [
		{ type: 'number', minimum: 0 },
		{ type: 'array', minItems: 1, maxItems: 4, items: { type: 'number', minimum: 0 } },
		{
			type: 'object', additionalProperties: false,
			properties: {
				top: { type: 'number', minimum: 0 }, right: { type: 'number', minimum: 0 },
				bottom: { type: 'number', minimum: 0 }, left: { type: 'number', minimum: 0 },
			},
		},
	],
})

export const LAYOUT_PLACEHOLDER_DEFINITION_SCHEMA = Object.freeze({
	type: 'object', required: ['name', 'type'], additionalProperties: false,
	allOf: [{
		if: { properties: { type: { const: 'clipArt' } }, required: ['type'] },
		then: { not: { required: ['orient'] }, description: 'PowerPoint canonicalizes clipArt placeholder orientation away; it is not an applicable authoring field.' },
	}],
	properties: {
				name: { type: 'string', minLength: 1, maxLength: 128 },
				type: { type: 'string', enum: [...NATIVE_PLACEHOLDER_TYPES] },
				idx: { type: 'integer', minimum: 0, maximum: MAX_NATIVE_PLACEHOLDER_INDEX },
				size: { type: 'string', enum: [...NATIVE_PLACEHOLDER_SIZES] },
				orient: { type: 'string', enum: [...NATIVE_PLACEHOLDER_ORIENTATIONS] },
				hasCustomPrompt: { type: 'boolean' },
				x: { type: 'number' }, y: { type: 'number' },
				w: { type: 'number', exclusiveMinimum: 0 }, h: { type: 'number', exclusiveMinimum: 0 },
				margin: PLACEHOLDER_MARGIN_SCHEMA,
				text: { type: 'string' },
	},
})

export const CLIPART_PLACEHOLDER_SCHEMA = Object.freeze({
	...LAYOUT_PLACEHOLDER_DEFINITION_SCHEMA,
	properties: {
		...LAYOUT_PLACEHOLDER_DEFINITION_SCHEMA.properties,
		type: { const: 'clipArt' },
	},
})

function plainObject(value, path) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object or null.`)
}

function rejectUnknownKeys(value, allowed, path) {
	for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${path}.${key} is not part of the public layout-placeholder contract.`)
}

function finiteNumber(value, path, { positive = false, nonNegative = false } = {}) {
	if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number.`)
	if (positive && value <= 0) throw new Error(`${path} must be greater than zero.`)
	if (nonNegative && value < 0) throw new Error(`${path} must be non-negative.`)
	return value
}

function normalizePlaceholderMargin(value, path) {
	if (value === undefined) return undefined
	if (value === null) return null
	if (typeof value === 'number') return finiteNumber(value, path, { nonNegative: true })
	if (Array.isArray(value)) {
		if (value.length < 1 || value.length > 4) throw new Error(`${path} must contain one to four values.`)
		return value.map((item, index) => finiteNumber(item, `${path}[${index}]`, { nonNegative: true }))
	}
	plainObject(value, path)
	rejectUnknownKeys(value, ['top', 'right', 'bottom', 'left'], path)
	return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, finiteNumber(item, `${path}.${key}`, { nonNegative: true })]))
}

export function normalizeLayoutPlaceholderDefinition(value, path = 'layout.placeholder') {
	if (value === undefined || value === null) throw new Error(`${path} must be an object.`)
	plainObject(value, path)
	rejectUnknownKeys(value, ['name', 'type', 'idx', 'size', 'orient', 'hasCustomPrompt', 'x', 'y', 'w', 'h', 'margin', 'text'], path)
	const name = typeof value.name === 'string' ? value.name.trim() : ''
	if (!name || name.length > 128) throw new Error(`${path}.name must be a non-empty string no longer than 128 characters.`)
	if (!NATIVE_PLACEHOLDER_TYPES.includes(value.type)) throw new Error(`${path}.type must be one of ${NATIVE_PLACEHOLDER_TYPES.join(', ')}.`)
	if (value.type === 'clipArt' && value.orient !== undefined) throw new Error(`${path}.orient is not applicable to clipArt placeholders because PowerPoint canonicalizes it away on save.`)
	const out = { name, type: value.type }
	if (value.idx !== undefined) {
		if (!Number.isInteger(value.idx) || value.idx < 0 || value.idx > MAX_NATIVE_PLACEHOLDER_INDEX) throw new Error(`${path}.idx must be an unsigned 32-bit integer.`)
		out.idx = value.idx
	}
	if (value.size !== undefined) {
		if (!NATIVE_PLACEHOLDER_SIZES.includes(value.size)) throw new Error(`${path}.size must be one of ${NATIVE_PLACEHOLDER_SIZES.join(', ')}.`)
		out.size = value.size
	}
	if (value.orient !== undefined) {
		if (!NATIVE_PLACEHOLDER_ORIENTATIONS.includes(value.orient)) throw new Error(`${path}.orient must be one of ${NATIVE_PLACEHOLDER_ORIENTATIONS.join(', ')}.`)
		out.orient = value.orient
	}
	if (value.hasCustomPrompt !== undefined) {
		if (typeof value.hasCustomPrompt !== 'boolean') throw new Error(`${path}.hasCustomPrompt must be a boolean.`)
		out.hasCustomPrompt = value.hasCustomPrompt
	}
	for (const key of ['x', 'y']) if (value[key] !== undefined) out[key] = finiteNumber(value[key], `${path}.${key}`)
	for (const key of ['w', 'h']) if (value[key] !== undefined) out[key] = finiteNumber(value[key], `${path}.${key}`, { positive: true })
	if (value.margin !== undefined) out.margin = normalizePlaceholderMargin(value.margin, `${path}.margin`)
	if (value.text !== undefined) {
		if (typeof value.text !== 'string') throw new Error(`${path}.text must be a string.`)
		out.text = value.text
	}
	return out
}

export function normalizeClipArtPlaceholderDefinition(value, path = 'layout.clipArtPlaceholder') {
	const normalized = normalizeLayoutPlaceholderDefinition(value, path)
	if (normalized && normalized.type !== 'clipArt') throw new Error(`${path}.type must be clipArt.`)
	return normalized
}

const ALT_TEXT_SCHEMA = MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS.pictureAltText.publicSchema
const ROTATION_SCHEMA = MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS.pictureRotation.publicSchema
const FLIP_H_SCHEMA = MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS.pictureFlipHorizontal.publicSchema
const FLIP_V_SCHEMA = MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS.pictureFlipVertical.publicSchema
const SHADOW_SCHEMA = MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS.pictureShadow.publicSchema
const TRANSPARENCY_SCHEMA = MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS.pictureTransparency.publicSchema

const PICTURE_COLOR_ENDPOINT_SCHEMA = Object.freeze({
	oneOf: [
		{ type: 'string', minLength: 1 },
		{
			type: 'object', additionalProperties: false,
			properties: {
				color: { type: 'string', minLength: 1 },
				scheme: { type: 'string', enum: [...PICTURE_COLOR_SCHEMES] },
				preset: { type: 'string', minLength: 1 },
				tint: { type: 'number', minimum: 0, maximum: 1 },
				shade: { type: 'number', minimum: 0, maximum: 1 },
				saturation: { type: 'number', minimum: 0, maximum: 4 },
				opacity: { type: 'number', minimum: 0, maximum: 1 },
			},
			oneOf: [{ required: ['color'] }, { required: ['scheme'] }, { required: ['preset'] }],
		},
	],
})

const PICTURE_COLOR_PAIR_SCHEMA = Object.freeze({
	type: 'object', required: ['dark', 'light'], additionalProperties: false,
	properties: { dark: PICTURE_COLOR_ENDPOINT_SCHEMA, light: PICTURE_COLOR_ENDPOINT_SCHEMA },
})

const ARTISTIC_EFFECT_SCHEMA = Object.freeze({
	oneOf: [
		{ type: 'string', enum: [...ARTISTIC_EFFECTS] },
		...ARTISTIC_EFFECTS.map(type => ({
			type: 'object', required: ['type'], additionalProperties: false,
			properties: {
				type: { const: type },
				...Object.fromEntries((ARTISTIC_EFFECT_PARAMETER_CATALOG[type] || []).map(parameter => [parameter.id, {
					type: 'number', minimum: parameter.minimum, maximum: parameter.maximum,
				}])),
			},
		})),
	],
})

export const IMAGE_ADJUSTMENTS_SCHEMA = Object.freeze({
	oneOf: [
		{ type: 'null' },
		{
			type: 'object', additionalProperties: false,
			properties: {
				...Object.fromEntries(Object.entries(PICTURE_CORRECTION_PARAMETERS).map(([id, parameter]) => [id, {
					type: 'number', minimum: parameter.minimum, maximum: parameter.maximum,
				}])),
				colorMode: { type: 'string', enum: ['normal', 'grayscale', 'duotone', 'recolor'] },
				duotone: { oneOf: [{ type: 'null' }, PICTURE_COLOR_PAIR_SCHEMA] },
				recolor: { oneOf: [{ type: 'null' }, PICTURE_COLOR_PAIR_SCHEMA] },
				artisticEffect: { oneOf: [{ type: 'null' }, ARTISTIC_EFFECT_SCHEMA] },
			},
		},
	],
})

const shapeFormattingProperties = SHAPE_FORMATTING_SCHEMA.properties

// Closed semantic core for the operation row. The public tool also retains
// compatibility fields, but every field advertised by this exact row is owned
// by one already exact child contract.
export const ADD_IMAGE_AUTHORING_CORE_SCHEMA = Object.freeze({
	type: 'object', required: ['source'], additionalProperties: false,
	properties: {
		source: { oneOf: IMAGE_ASSET_SOURCE_SCHEMA.oneOf.slice(1) },
		x: { type: 'number' }, y: { type: 'number' },
		w: { type: 'number', exclusiveMinimum: 0 }, h: { type: 'number', exclusiveMinimum: 0 },
		objectName: { type: 'string', minLength: 1, maxLength: 255 },
		sizing: IMAGE_FRAMING_CONTRACT.publicSchema,
		pictureAdjuncts: PICTURE_ADJUNCTS_SCHEMA,
		imageAccessibility: {
			oneOf: [{ type: 'null' }, { type: 'object', additionalProperties: false, properties: { altText: ALT_TEXT_SCHEMA } }],
		},
		altText: ALT_TEXT_SCHEMA,
		rotate: ROTATION_SCHEMA,
		flipH: FLIP_H_SCHEMA,
		flipV: FLIP_V_SCHEMA,
		shadow: SHADOW_SCHEMA,
		transparency: TRANSPARENCY_SCHEMA,
		line: shapeFormattingProperties.line,
		glow: shapeFormattingProperties.glow,
		reflection: shapeFormattingProperties.reflection,
		softEdges: shapeFormattingProperties.softEdges,
		blur: shapeFormattingProperties.blur,
		fillOverlay: shapeFormattingProperties.fillOverlay,
		effects: shapeFormattingProperties.effects,
		effect3D: shapeFormattingProperties.effect3D,
		imageAdjustments: IMAGE_ADJUSTMENTS_SCHEMA,
		pictureStylePresetId: { oneOf: [{ type: 'null' }, { type: 'string', enum: PICTURE_STYLE_PRESETS.map(preset => preset.id) }] },
		pictureStyle: PICTURE_STYLE_PUBLIC_SCHEMA,
		animation: { oneOf: [{ type: 'object' }, { type: 'array', minItems: 1, items: { type: 'object' } }] },
	},
})

export const CLIPART_PLACEHOLDER_CONTRACT = Object.freeze({
	id: 'nativeClipArtPlaceholder', schemaVersion: 'betterpptx.layout-image-entry-contract.v1',
	capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', runtimeReady: true,
	componentOwnership: Object.freeze(['master.placeholder.type', 'layout.placeholder.type', 'layout.placeholder.index', 'layout.placeholder.size', 'layout.placeholder.customPrompt', 'layout.placeholder.geometry', 'layoutContract.placeholderBinding']),
	overrideFields: Object.freeze(['masters[].placeholders[].type', 'masters[].placeholders[].idx', 'masters[].placeholders[].size', 'masters[].placeholders[].hasCustomPrompt', 'layouts[].placeholders[].type', 'layouts[].placeholders[].idx', 'layouts[].placeholders[].size', 'layouts[].placeholders[].hasCustomPrompt', 'layouts[].placeholders[].bounds', 'layouts[].placeholders[].margin', 'layouts[].placeholders[].text', 'layoutContract.placeholderBindings']),
	resetBehavior: Object.freeze({ component: 'replace the named placeholder definition without the field to restore that field default', full: 'set the parent placeholders array to [] to remove authored placeholders', nullBehavior: 'null or omission preserves the current/inherited placeholder set; an explicit empty array clears authored placeholders' }),
	precedence: Object.freeze(['master placeholder', 'layout placeholder with matching type/index', 'slide picture binding with matching type/index']),
	legalCombinations: Object.freeze(['idx including zero with size and custom prompt', 'bounds, margin, and prompt text', 'clipArt layout placeholder with an ordinary picture in the same deck', 'orientation omitted because Office proves it non-applicable and removes it on save']),
	rowIds: Object.freeze([CLIPART_PLACEHOLDER_ROW_ID]), publicSchema: CLIPART_PLACEHOLDER_SCHEMA,
})

const ADD_IMAGE_CHILD_CONTRACTS = Object.freeze([
	MEDIA_IMAGE_EXACT_CONTRACT_BUCKETS.imageAssetSource,
	IMAGE_FRAMING_CONTRACT,
	MEDIA_IMAGE_EXACT_CONTRACT_BUCKETS.pictureAdjuncts,
	...Object.values(MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS),
])

if (ADD_IMAGE_CHILD_CONTRACTS.some(contract => contract.capabilityStatus !== 'executable-exact-structured')) throw new Error('add-image operation requires exact executable image child contracts.')
if (!IMAGE_ACCESSIBILITY_PARAMETERS.every(parameter => parameter.capabilityStatus === 'executable-exact-structured')) throw new Error('add-image operation requires exact image-accessibility parameters.')

export const ADD_IMAGE_OPERATION_CONTRACT = Object.freeze({
	id: 'addImageAuthoringOperation', schemaVersion: 'betterpptx.layout-image-entry-contract.v1',
	capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', runtimeReady: true,
	componentOwnership: Object.freeze(['picture.authoringOperation', 'picture.assetSource', 'picture.framing', 'picture.accessibility', ...PICTURE_STYLE_COMPONENT_OWNERSHIP]),
	overrideFields: Object.freeze(['content[].imageOptions.source', 'content[].imageOptions.sizing', 'content[].imageOptions.pictureAdjuncts', 'content[].imageOptions.altText', 'content[].imageOptions.rotate', 'content[].imageOptions.flipH', 'content[].imageOptions.flipV', 'content[].imageOptions.transparency', 'content[].imageOptions.shadow', 'content[].imageOptions.imageAdjustments', 'content[].imageOptions.effects', ...PICTURE_STYLE_OVERRIDE_FIELDS.map(field => `content[].imageOptions.${field}`)]),
	resetBehavior: Object.freeze({ ...PICTURE_STYLE_RESET_BEHAVIOR, component: 'set the named non-layered image formatting component to null while retaining the picture identity; HD Photo-backed temperature, saturation, sharpness, and artistic effects require recreate', full: 'remove the picture object with slide.delete_shapes; source or layered Picture Format replacement uses delete plus add after validation', nullBehavior: 'non-layered formatting-component null restores that native/default component; omission preserves current authored state; source and layered adjustments are create/recreate-only' }),
	precedence: Object.freeze(['safe authored image source', 'engine-owned target box', 'selected picture-style base', 'explicit framing/accessibility/format overrides', 'component null reset']),
	legalCombinations: Object.freeze(['inline, opaque, or HTTPS source with contain, cover, or crop', 'accessibility, hyperlink, transform, picture style, corrections, artistic treatment, and native effects together at creation', 'sparse non-layered formatting reset followed by reverse-order re-edit', 'source or HD Photo-backed layered-adjustment replacement only through validated delete plus add']),
	rowIds: Object.freeze([ADD_IMAGE_OPERATION_ROW_ID]), publicSchema: ADD_IMAGE_AUTHORING_CORE_SCHEMA,
	childContractIds: Object.freeze(ADD_IMAGE_CHILD_CONTRACTS.map(contract => contract.id)),
})

export const LAYOUT_IMAGE_ENTRY_CONTRACTS = Object.freeze({
	clipArt: CLIPART_PLACEHOLDER_CONTRACT,
	addImage: ADD_IMAGE_OPERATION_CONTRACT,
})

export function layoutImageEntryCapabilityContractForEntry(entry = {}) {
	if (entry.id === CLIPART_PLACEHOLDER_ROW_ID && entry.family === 'layouts-themes-masters') return CLIPART_PLACEHOLDER_CONTRACT
	if (entry.id === ADD_IMAGE_OPERATION_ROW_ID) return ADD_IMAGE_OPERATION_CONTRACT
	return null
}

export function validateAddImageAuthoringCore(value, path = 'addImage') {
	plainObject(value, path)
	rejectUnknownKeys(value, Object.keys(ADD_IMAGE_AUTHORING_CORE_SCHEMA.properties), path)
	if (!Object.prototype.hasOwnProperty.call(value, 'source')) throw new Error(`${path}.source is required.`)
	const source = validateImageAssetSource(value.source, `${path}.source`)
	if (source === null) throw new Error(`${path}.source cannot be null when creating a picture.`)
	const out = { ...value, source }
	if (Object.prototype.hasOwnProperty.call(value, 'pictureAdjuncts')) out.pictureAdjuncts = validatePictureAdjuncts(value.pictureAdjuncts, `${path}.pictureAdjuncts`)
	if (Object.prototype.hasOwnProperty.call(value, 'sizing')) out.sizing = normalizeImageFraming(value.sizing, `${path}.sizing`)
	if (Object.prototype.hasOwnProperty.call(value, 'pictureStyle')) out.pictureStyle = normalizePictureStyle(value.pictureStyle, `${path}.pictureStyle`)
	if (Object.prototype.hasOwnProperty.call(value, 'pictureStylePresetId') && value.pictureStylePresetId !== null && !PICTURE_STYLE_PRESETS.some(preset => preset.id === value.pictureStylePresetId)) throw new Error(`${path}.pictureStylePresetId is not a measured PowerPoint Picture Style preset.`)
	if (Object.prototype.hasOwnProperty.call(value, 'imageAdjustments')) out.imageAdjustments = validateImageAdjustments(value.imageAdjustments, `${path}.imageAdjustments`)
	return out
}

export function validateImageAdjustments(value, path = 'imageAdjustments') {
	if (value === null) return null
	plainObject(value, path)
	const allowed = [...Object.keys(PICTURE_CORRECTION_PARAMETERS), 'colorMode', 'duotone', 'recolor', 'artisticEffect']
	rejectUnknownKeys(value, allowed, path)
	for (const [id, parameter] of Object.entries(PICTURE_CORRECTION_PARAMETERS)) if (value[id] !== undefined && value[id] !== null) finiteNumber(value[id], `${path}.${id}`, { })
	for (const [id, parameter] of Object.entries(PICTURE_CORRECTION_PARAMETERS)) if (value[id] !== undefined && value[id] !== null && (value[id] < parameter.minimum || value[id] > parameter.maximum)) throw new Error(`${path}.${id} must be between ${parameter.minimum} and ${parameter.maximum}.`)
	if (value.colorMode !== undefined && !['normal', 'grayscale', 'duotone', 'recolor'].includes(value.colorMode)) throw new Error(`${path}.colorMode is not supported.`)
	for (const key of ['duotone', 'recolor']) if (value[key] !== undefined && value[key] !== null) {
		plainObject(value[key], `${path}.${key}`)
		rejectUnknownKeys(value[key], ['dark', 'light'], `${path}.${key}`)
		if (!Object.prototype.hasOwnProperty.call(value[key], 'dark') || !Object.prototype.hasOwnProperty.call(value[key], 'light')) throw new Error(`${path}.${key} requires dark and light endpoints.`)
	}
	if (value.artisticEffect !== undefined && value.artisticEffect !== null) normalizeArtisticEffect(value.artisticEffect)
	return normalizeImageAdjustments(value)
}

export function assertLayoutImageEntryPartition() {
	const ids = Object.values(LAYOUT_IMAGE_ENTRY_CONTRACTS).flatMap(contract => contract.rowIds)
	if (ids.length !== 2 || new Set(ids).size !== 2) throw new Error('layout/image entry unit must contain two distinct rows.')
	return Object.freeze({ unitId: LAYOUT_IMAGE_ENTRY_UNIT_ID, rows: ids.length, runtimeReady: true })
}

export const LAYOUT_IMAGE_ENTRY_PARTITION = assertLayoutImageEntryPartition()
