import { ShapeType, SHAPE_TYPE } from '../dist/node/core-enums.js'

import {
	FILL_OVERLAY_BLENDS,
	PATTERN_PRESETS,
	SHAPE_LINE_ARROW_SIZE_VALUES,
	SHAPE_LINE_ARROW_TYPES,
	SHAPE_LINE_DASH_TYPES,
} from './ir/native-visual-primitives.mjs'
import { applyShapeEffectPresets, shapeEffectPresetById, SHAPE_EFFECT_PRESETS } from './native-effect-presets.mjs'
import { applyNativeStylePreset, shapeStylePresetById, SHAPE_STYLE_PRESETS } from './native-style-presets.mjs'
import { normalizeTextFill } from './text-fill-contract.mjs'

export const SHAPE_FORMATTING_STATE_VERSION = 'betterpptx.shape-formatting-state.v1'

export const SHAPE_PRESET_GEOMETRIES = Object.freeze(
	[...new Set(Object.values(ShapeType))].sort(),
)

export const SHAPE_GEOMETRY_ALIASES = Object.freeze(
	Object.fromEntries(Object.entries(SHAPE_TYPE).sort(([a], [b]) => a.localeCompare(b))),
)

export const SHAPE_STYLE_PRESET_IDS = Object.freeze(SHAPE_STYLE_PRESETS.map(row => row.id))
export const SHAPE_EFFECT_PRESET_IDS = Object.freeze(SHAPE_EFFECT_PRESETS.map(row => row.id))

export const SHAPE_FORMATTING_COMPONENT_KEYS = Object.freeze([
	'fill', 'line', 'shadow', 'glow', 'reflection', 'softEdges', 'blur', 'fillOverlay',
	'effects', 'effect3D', 'rotate', 'flipH', 'flipV',
])

export const SHAPE_FORMATTING_SELECTOR_KEYS = Object.freeze([
	'shapeStylePresetId', 'shapeEffectPresetIds', 'shapeEffectPresetId',
])

const GRADIENT_PRESETS = Object.freeze([
	'lightGradient-accent1', 'lightGradient-accent2', 'lightGradient-accent3',
	'lightGradient-accent4', 'lightGradient-accent5', 'lightGradient-accent6',
	'topSpotlight-accent1', 'topSpotlight-accent2', 'topSpotlight-accent3',
	'topSpotlight-accent4', 'topSpotlight-accent5', 'topSpotlight-accent6',
	'bottomSpotlight-accent1', 'bottomSpotlight-accent2', 'bottomSpotlight-accent3',
	'bottomSpotlight-accent4', 'bottomSpotlight-accent5', 'bottomSpotlight-accent6',
])

const COLOR_SCHEMA = Object.freeze({
	oneOf: [
		{ type: 'string', minLength: 1 },
		{
			type: 'object',
			properties: {
				color: { type: 'string' }, scheme: { type: 'string' }, preset: { type: 'string' },
				tint: { type: 'number', minimum: 0, maximum: 1 },
				shade: { type: 'number', minimum: 0, maximum: 1 },
				saturation: { type: 'number', minimum: 0, maximum: 4 },
				luminance: { type: 'number', minimum: 0, maximum: 4 },
				luminanceOffset: { type: 'number', minimum: -1, maximum: 1 },
				opacity: { type: 'number', minimum: 0, maximum: 1 },
			},
			additionalProperties: false,
		},
	],
})

const NULLABLE = schema => Object.freeze({ oneOf: [{ type: 'null' }, schema] })

export const SHAPE_FILL_SCHEMA = NULLABLE({
	type: 'object',
	properties: {
		type: { type: 'string', enum: ['none', 'solid', 'gradient', 'pattern', 'texture', 'picture'] },
		color: COLOR_SCHEMA,
		transparency: { type: 'number', minimum: 0, maximum: 100, multipleOf: 0.001 },
		gradientPreset: { type: 'string', enum: GRADIENT_PRESETS },
		gradientStops: {
			type: 'array', minItems: 2,
			items: {
				type: 'object', required: ['color'],
				properties: {
					position: { type: 'number', minimum: 0, maximum: 100 },
					pos: { type: 'number', minimum: 0, maximum: 100 },
					color: COLOR_SCHEMA,
					transparency: { type: 'number', minimum: 0, maximum: 100, multipleOf: 0.001 },
				},
				additionalProperties: false,
			},
		},
		gradientAngle: { type: 'number', minimum: 0, maximum: 360 },
		gradientDirection: { type: 'string', enum: ['linear', 'circle', 'rect', 'shape', 'radial'] },
		gradientFlip: { type: 'string', enum: ['none', 'x', 'y', 'xy'] },
		rotateGradientWithShape: { type: 'boolean' },
		fillToRect: { type: 'object', properties: Object.fromEntries(['l', 't', 'r', 'b'].map(key => [key, { type: 'number' }])), additionalProperties: false },
		tileRect: { type: 'object', properties: Object.fromEntries(['l', 't', 'r', 'b'].map(key => [key, { type: 'number' }])), additionalProperties: false },
		pattern: {
			type: 'object',
			properties: { preset: { type: 'string', enum: [...PATTERN_PRESETS] }, foreground: COLOR_SCHEMA, background: COLOR_SCHEMA },
			additionalProperties: false,
		},
		texture: { type: 'object', description: 'Opaque asset-backed texture plus typed tile/stretch placement.', additionalProperties: true },
		picture: { type: 'object', description: 'Opaque asset-backed stretch picture fill.', additionalProperties: true },
	},
	additionalProperties: false,
})

export const SHAPE_LINE_SCHEMA = NULLABLE({
	type: 'object',
	properties: {
		type: { type: 'string', enum: ['none', 'solid'] },
		color: COLOR_SCHEMA,
		transparency: { type: 'number', minimum: 0, maximum: 100, multipleOf: 0.001 },
		width: { type: 'number', minimum: 0, maximum: 1584, multipleOf: 0.001 },
		dashType: { type: 'string', enum: [...SHAPE_LINE_DASH_TYPES] },
		dash: { type: 'string', enum: [...SHAPE_LINE_DASH_TYPES] },
		beginArrowType: { type: 'string', enum: [...SHAPE_LINE_ARROW_TYPES] },
		endArrowType: { type: 'string', enum: [...SHAPE_LINE_ARROW_TYPES] },
		beginArrowWidth: { type: 'string', enum: [...SHAPE_LINE_ARROW_SIZE_VALUES] },
		beginArrowLength: { type: 'string', enum: [...SHAPE_LINE_ARROW_SIZE_VALUES] },
		endArrowWidth: { type: 'string', enum: [...SHAPE_LINE_ARROW_SIZE_VALUES] },
		endArrowLength: { type: 'string', enum: [...SHAPE_LINE_ARROW_SIZE_VALUES] },
	},
	additionalProperties: false,
})

export const SHAPE_EFFECT_3D_SCHEMA = NULLABLE({
	type: 'object',
	properties: {
		bevel: { type: 'object', additionalProperties: false, properties: { type: { type: 'string' }, width: { type: 'number', minimum: 0, maximum: 1000 }, height: { type: 'number', minimum: 0, maximum: 1000 } } },
		bevelBottom: { type: 'object', additionalProperties: false, properties: { type: { type: 'string' }, width: { type: 'number', minimum: 0, maximum: 1000 }, height: { type: 'number', minimum: 0, maximum: 1000 } } },
		extrusion: { oneOf: [{ type: 'number', minimum: 0, maximum: 5000 }, { type: 'object', additionalProperties: true }] },
		extrusionColor: COLOR_SCHEMA,
		contourWidth: { type: 'number', minimum: 0, maximum: 1000 },
		contourColor: COLOR_SCHEMA,
		material: { type: 'string' }, lightRig: { oneOf: [{ type: 'string' }, { type: 'object' }] },
		lightDirection: { type: 'number', minimum: 0, maximum: 359 },
		rotationX: { type: 'number', minimum: -360, maximum: 360 },
		rotationY: { type: 'number', minimum: -360, maximum: 360 },
		rotationZ: { type: 'number', minimum: -360, maximum: 360 },
		perspective: { type: 'number' },
	},
	additionalProperties: false,
})

export const SHAPE_FORMATTING_SCHEMA = Object.freeze({
	type: 'object',
	properties: {
		shapeStylePresetId: NULLABLE({ type: 'string', enum: [...SHAPE_STYLE_PRESET_IDS] }),
		shapeEffectPresetIds: NULLABLE({ type: 'array', items: { type: 'string', enum: [...SHAPE_EFFECT_PRESET_IDS] }, uniqueItems: true }),
		shapeEffectPresetId: NULLABLE({ type: 'string', enum: [...SHAPE_EFFECT_PRESET_IDS], description: 'Compatibility alias for a one-item shapeEffectPresetIds array.' }),
		fill: SHAPE_FILL_SCHEMA,
		line: SHAPE_LINE_SCHEMA,
		shadow: NULLABLE({ type: 'object', additionalProperties: true }),
		glow: NULLABLE({ type: 'object', additionalProperties: true }),
		reflection: NULLABLE({ type: 'object', additionalProperties: true }),
		softEdges: NULLABLE({ type: 'object', additionalProperties: true }),
		blur: NULLABLE({ type: 'object', additionalProperties: true }),
		fillOverlay: NULLABLE({ type: 'object', properties: { blend: { type: 'string', enum: [...FILL_OVERLAY_BLENDS] }, blendMode: { type: 'string', enum: [...FILL_OVERLAY_BLENDS] }, fill: SHAPE_FILL_SCHEMA }, additionalProperties: false }),
		effects: NULLABLE({ type: 'array', items: { type: 'object', required: ['type'], additionalProperties: true } }),
		effect3D: SHAPE_EFFECT_3D_SCHEMA,
		rotate: NULLABLE({ type: 'number', minimum: -360, maximum: 360 }),
		flipH: NULLABLE({ type: 'boolean' }),
		flipV: NULLABLE({ type: 'boolean' }),
	},
	additionalProperties: false,
})

export const SHAPE_FORMATTING_CONTRACT = Object.freeze({
	schemaVersion: 'betterpptx.shape-formatting-contract.v1',
	capabilityMode: 'preset-plus-parameters',
	capabilityStatus: 'executable-exact-structured',
	componentOwnership: Object.freeze(['geometry', 'fill', 'line', 'effects', 'shape3D', 'transform']),
	overrideFields: Object.freeze([
		'shapeName', 'shapeStylePresetId', 'shapeEffectPresetIds',
		...SHAPE_FORMATTING_COMPONENT_KEYS.map(key => `style.${key}`),
	]),
	resetBehavior: Object.freeze({
		component: 'set a typed style component or leaf to null to remove that authored override and restore the selected preset/native base',
		full: 'set shapeStylePresetId and shapeEffectPresetIds to null and clear explicit formatting components',
		nullBehavior: 'null edits authored override state; effective native options are recomputed so stale preset recipe values cannot survive',
	}),
	precedence: Object.freeze(['native/default base', 'shape-style preset', 'ordered shape-effect presets', 'explicit authored overrides']),
	legalCombinations: Object.freeze([
		'preset geometry + shape style + ordered effect presets + explicit typed overrides',
		'gradient/pattern/texture/picture fill + line + effects + shape 3-D + transform',
		'component reset + sparse re-edit + preset replacement',
	]),
	examples: Object.freeze([
		Object.freeze({ shapeName: 'roundRect', shapeStylePresetId: SHAPE_STYLE_PRESET_IDS[0], fill: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 45, gradientStops: [{ position: 0, color: '2563EB' }, { position: 100, color: '7C3AED', transparency: 15 }] }, line: { width: 2, color: 'FFFFFF', endArrowType: 'triangle', endArrowWidth: 'lg', endArrowLength: 'sm' }, effect3D: { bevel: { type: 'circle', width: 4, height: 4 }, extrusion: 6, material: 'warmMatte', lightRig: 'threePt' } }),
	]),
	validVectors: Object.freeze([
		Object.freeze({ shapeStylePresetId: SHAPE_STYLE_PRESET_IDS[0], fill: { color: 'FFFFFF' } }),
		Object.freeze({ shapeEffectPresetIds: SHAPE_EFFECT_PRESET_IDS.slice(0, 2), glow: { color: '38BDF8', opacity: 0.5, radiusPt: 8 } }),
		Object.freeze({ fill: null, line: null, effect3D: null }),
	]),
	invalidVectors: Object.freeze([
		Object.freeze({ shapeStylePresetId: 'shape-style-999' }),
		Object.freeze({ fill: { type: 'gradient', gradientStops: [{ position: 0, color: 'FFFFFF' }] } }),
		Object.freeze({ line: { endArrowWidth: 'xl' } }),
	]),
})

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function isObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function deleteNullLeaves(target, patch) {
	for (const [key, value] of Object.entries(patch || {})) {
		if (value === null) {
			delete target[key]
		} else if (isObject(value)) {
			const next = isObject(target[key]) ? clone(target[key]) : {}
			deleteNullLeaves(next, value)
			if (Object.keys(next).length) target[key] = next
			else delete target[key]
		} else {
			target[key] = clone(value)
		}
	}
	return target
}

function mergeEffective(target, source) {
	for (const [key, value] of Object.entries(source || {})) {
		if (isObject(value) && isObject(target[key])) {
			if (key === 'line') prepareLineFillTypeChange(target[key], value)
			mergeEffective(target[key], value)
		}
		else target[key] = clone(value)
	}
	return target
}

const LINE_GRADIENT_FIELDS = ['gradientDirection', 'gradientAngle', 'gradientStops', 'rotateGradientWithShape']
function prepareLineFillTypeChange(target, patch) {
	// Stroke geometry stays sparse, but its fill is a native choice. A selected
	// gradient must not inherit solid color/alpha from a prior edit or gallery.
	if (patch.type === 'gradient') {
		delete target.color
		delete target.transparency
	} else if (target.type === 'gradient' && (patch.type === 'solid' || patch.type === 'none')) {
		for (const key of LINE_GRADIENT_FIELDS) delete target[key]
	}
}

function normalizeEffectIds(value, path) {
	if (value == null || value === '') return []
	const ids = Array.isArray(value) ? value.map(String) : [String(value)]
	for (const id of ids) if (!shapeEffectPresetById(id)) throw new Error(`${path} contains unknown shape effect preset: ${id}`)
	return ids
}

function validateFill(fill, path) {
	if (fill == null) return
	if (!isObject(fill)) throw new Error(`${path} must be an object or null`)
	if (fill.type != null && !['none', 'solid', 'gradient', 'pattern', 'texture', 'picture'].includes(fill.type)) throw new Error(`${path}.type is not supported`)
	if (fill.transparency != null && (!Number.isFinite(fill.transparency) || fill.transparency < 0 || fill.transparency > 100)) throw new Error(`${path}.transparency must be between 0 and 100`)
	if (fill.gradientAngle != null && (!Number.isFinite(fill.gradientAngle) || fill.gradientAngle < 0 || fill.gradientAngle > 360)) throw new Error(`${path}.gradientAngle must be between 0 and 360`)
	if ((fill.type === 'gradient' && fill.gradientPreset == null) || fill.gradientStops !== undefined) {
		if (!Array.isArray(fill.gradientStops) || fill.gradientStops.length < 2) throw new Error(`${path}.gradientStops must contain at least two stops`)
		for (const [index, stop] of fill.gradientStops.entries()) {
			if (!isObject(stop) || stop.color == null) throw new Error(`${path}.gradientStops[${index}] must include color`)
			const pos = stop.position ?? stop.pos
			if (pos != null && (!Number.isFinite(pos) || pos < 0 || pos > 100)) throw new Error(`${path}.gradientStops[${index}].position must be between 0 and 100`)
		}
	}
}

function validateLine(line, path) {
	if (line == null) return
	if (!isObject(line)) throw new Error(`${path} must be an object or null`)
	if (Object.hasOwn(line, 'type') && line.type !== 'gradient' && LINE_GRADIENT_FIELDS.some(key => Object.hasOwn(line, key))) throw new Error(`${path} gradient fields require type gradient.`)
	if (line.type === 'gradient') {
		const allowed = new Set([...Object.keys(SHAPE_LINE_SCHEMA.oneOf[1].properties).filter(key => !['color', 'transparency', 'dash'].includes(key)), 'cap', ...LINE_GRADIENT_FIELDS])
		for (const key of Object.keys(line)) if (!allowed.has(key)) throw new Error(`${path}.${key} is not supported for a native gradient stroke.`)
		if (Object.hasOwn(line, 'gradientDirection') && line.gradientDirection !== 'linear') throw new Error(`${path}.gradientDirection must be linear.`)
		if (Object.hasOwn(line, 'gradientAngle') && line.gradientAngle === null) throw new Error(`${path}.gradientAngle must be a number.`)
		if (Object.hasOwn(line, 'rotateGradientWithShape') && typeof line.rotateGradientWithShape !== 'boolean') throw new Error(`${path}.rotateGradientWithShape must be boolean.`)
		if (Object.hasOwn(line, 'cap') && !['flat', 'round', 'square'].includes(line.cap)) throw new Error(`${path}.cap must be flat, round, or square.`)
		normalizeTextFill({ type: 'gradient', ...Object.fromEntries(LINE_GRADIENT_FIELDS.filter(key => Object.hasOwn(line, key)).map(key => [key, line[key]])) }, path)
	}
	const dash = line.dashType ?? line.dash
	if (dash != null && !SHAPE_LINE_DASH_TYPES.includes(dash)) throw new Error(`${path}.dashType is not supported`)
	for (const key of ['beginArrowType', 'endArrowType']) if (line[key] != null && !SHAPE_LINE_ARROW_TYPES.includes(line[key])) throw new Error(`${path}.${key} is not supported`)
	for (const key of ['beginArrowWidth', 'beginArrowLength', 'endArrowWidth', 'endArrowLength']) if (line[key] != null && !SHAPE_LINE_ARROW_SIZE_VALUES.includes(line[key])) throw new Error(`${path}.${key} is not supported`)
	if (line.width != null && (!Number.isFinite(line.width) || line.width < 0 || line.width > 1584)) throw new Error(`${path}.width must be between 0 and 1584`)
	if (line.transparency != null && (!Number.isFinite(line.transparency) || line.transparency < 0 || line.transparency > 100)) throw new Error(`${path}.transparency must be between 0 and 100`)
}

export function validateShapeFormattingInput(input = {}, path = 'shape formatting') {
	if (!isObject(input)) throw new Error(`${path} must be an object`)
	if (input.shapeStylePresetId != null && !shapeStylePresetById(input.shapeStylePresetId)) throw new Error(`${path}.shapeStylePresetId is unknown: ${input.shapeStylePresetId}`)
	normalizeEffectIds(input.shapeEffectPresetIds ?? input.shapeEffectPresetId, `${path}.shapeEffectPresetIds`)
	if (Object.hasOwn(input, 'fill')) validateFill(input.fill, `${path}.fill`)
	if (Object.hasOwn(input, 'line')) validateLine(input.line, `${path}.line`)
	for (const key of ['rotate']) if (input[key] != null && (!Number.isFinite(input[key]) || input[key] < -360 || input[key] > 360)) throw new Error(`${path}.${key} must be between -360 and 360`)
	for (const key of ['flipH', 'flipV']) if (input[key] != null && typeof input[key] !== 'boolean') throw new Error(`${path}.${key} must be boolean or null`)
	return input
}

export function resolveShapeFormatting(input = {}, previousState = null, options = {}) {
	validateShapeFormattingInput(input, options.path || 'shape formatting')
	const mode = options.mode === 'patch' ? 'patch' : 'replace'
	const state = previousState && previousState.schemaVersion === SHAPE_FORMATTING_STATE_VERSION
		? clone(previousState)
		: { schemaVersion: SHAPE_FORMATTING_STATE_VERSION, shapeStylePresetId: null, shapeEffectPresetIds: [], authoredOverrides: {} }

	if (mode === 'replace') {
		state.shapeStylePresetId = null
		state.shapeEffectPresetIds = []
		state.authoredOverrides = {}
	}
	if (Object.hasOwn(input, 'shapeStylePresetId')) state.shapeStylePresetId = input.shapeStylePresetId == null || input.shapeStylePresetId === '' ? null : String(input.shapeStylePresetId)
	if (Object.hasOwn(input, 'shapeEffectPresetIds') || Object.hasOwn(input, 'shapeEffectPresetId')) state.shapeEffectPresetIds = normalizeEffectIds(input.shapeEffectPresetIds ?? input.shapeEffectPresetId, 'shapeEffectPresetIds')
	for (const key of SHAPE_FORMATTING_COMPONENT_KEYS) {
		if (!Object.hasOwn(input, key)) continue
		if (input[key] === null) delete state.authoredOverrides[key]
		else if (isObject(input[key])) {
			const next = isObject(state.authoredOverrides[key]) ? clone(state.authoredOverrides[key]) : {}
			if (key === 'line') prepareLineFillTypeChange(next, input[key])
			deleteNullLeaves(next, input[key])
			if (Object.keys(next).length) state.authoredOverrides[key] = next
			else delete state.authoredOverrides[key]
		} else state.authoredOverrides[key] = clone(input[key])
	}

	let effective = {}
	if (state.shapeStylePresetId) effective = applyNativeStylePreset(effective, state.shapeStylePresetId).style
	if (state.shapeEffectPresetIds.length) effective = applyShapeEffectPresets(effective, state.shapeEffectPresetIds).style
	mergeEffective(effective, state.authoredOverrides)
	if (effective.line?.type === 'gradient' || LINE_GRADIENT_FIELDS.some(key => Object.hasOwn(effective.line || {}, key))) {
		if (effective.line.type !== 'gradient') throw new Error(`${options.path || 'shape formatting'}.line gradient fields require type gradient.`)
		validateLine(effective.line, `${options.path || 'shape formatting'}.line`)
	}
	if (state.shapeStylePresetId) effective.shapeStylePresetId = state.shapeStylePresetId
	if (state.shapeEffectPresetIds.length) effective.shapeEffectPresetIds = clone(state.shapeEffectPresetIds)
	effective._shapeFormattingState = clone(state)
	return { state, effectiveOptions: effective }
}

export function applyShapeFormattingToOptions(options = {}, previousState = null, mode = 'replace') {
	const input = { ...options }
	const stateFromInput = input._shapeFormattingState
	delete input._shapeFormattingState
	const state = previousState || stateFromInput || null
	const formatting = {}
	const passthrough = {}
	for (const [key, value] of Object.entries(input)) {
		if (SHAPE_FORMATTING_COMPONENT_KEYS.includes(key) || SHAPE_FORMATTING_SELECTOR_KEYS.includes(key)) formatting[key] = value
		else passthrough[key] = value
	}
	const resolved = resolveShapeFormatting(formatting, state, { mode, path: 'shape options' })
	return { ...resolved, options: { ...passthrough, ...resolved.effectiveOptions } }
}

export function rehydrateShapeFormattingOptions(options = {}) {
	const state = options?._shapeFormattingState
	if (!state || state.schemaVersion !== SHAPE_FORMATTING_STATE_VERSION) return applyShapeFormattingToOptions(options).options
	const passthrough = Object.fromEntries(Object.entries(options).filter(([key]) =>
		key !== '_shapeFormattingState'
		&& !SHAPE_FORMATTING_COMPONENT_KEYS.includes(key)
		&& !SHAPE_FORMATTING_SELECTOR_KEYS.includes(key)))
	const resolved = resolveShapeFormatting({}, state, { mode: 'patch', path: 'shape options' })
	return { ...passthrough, ...resolved.effectiveOptions }
}

export function publicShapeFormattingReadback(options = {}) {
	const state = options?._shapeFormattingState
	if (!state || state.schemaVersion !== SHAPE_FORMATTING_STATE_VERSION) {
		return Object.fromEntries([...SHAPE_FORMATTING_SELECTOR_KEYS, ...SHAPE_FORMATTING_COMPONENT_KEYS]
			.filter(key => Object.hasOwn(options || {}, key) && options[key] !== undefined)
			.map(key => [key, clone(options[key])]))
	}
	return {
		...(state.shapeStylePresetId ? { shapeStylePresetId: state.shapeStylePresetId } : {}),
		...(state.shapeEffectPresetIds?.length ? { shapeEffectPresetIds: clone(state.shapeEffectPresetIds) } : {}),
		...clone(state.authoredOverrides),
	}
}
