// Editable glyph fills, deliberately separate from text-box/panel fills.
// This bounded contract has no image, path, preset, or native-payload escape.
export const TEXT_FILL_COLOR_PATTERN = '^(?:#?[0-9A-Fa-f]{6}|tx1|tx2|bg1|bg2|dk1|lt1|dk2|lt2|accent[1-6]|hlink|folHlink|phClr)$'
export const TEXT_FILL_GRADIENT_FIELDS = Object.freeze(['gradientDirection', 'gradientAngle', 'gradientStops', 'rotateGradientWithShape', 'gradientFlip', 'fillToRect', 'tileRect'])
export const TEXT_FILL_FIELDS = Object.freeze(['type', 'color', 'transparency', ...TEXT_FILL_GRADIENT_FIELDS])
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key)
const colorPattern = new RegExp(TEXT_FILL_COLOR_PATTERN)
const percentage = { type: ['number', 'null'], minimum: 0, maximum: 100, multipleOf: 0.001 }
const color = { type: ['string', 'null'], pattern: TEXT_FILL_COLOR_PATTERN }
const rectangle = { type: ['object', 'null'], additionalProperties: false, properties: Object.fromEntries(['l', 't', 'r', 'b'].map(key => [key, percentage])) }
const gradientProperties = {
	type: { type: 'string', const: 'gradient' },
	gradientDirection: { type: ['string', 'null'], enum: ['linear', 'circle', 'rect', 'shape', null] },
	gradientAngle: { type: ['number', 'null'], minimum: 0, exclusiveMaximum: 360, multipleOf: 0.001 },
	gradientStops: { type: 'array', minItems: 2, maxItems: 32, items: { type: 'object', additionalProperties: false, required: ['position', 'color'], properties: { position: { type: 'number', minimum: 0, maximum: 100, multipleOf: 0.001 }, color: { type: 'string', pattern: TEXT_FILL_COLOR_PATTERN }, transparency: percentage } } },
	rotateGradientWithShape: { type: ['boolean', 'null'] },
	gradientFlip: { type: ['string', 'null'], enum: ['none', 'x', 'y', 'xy', null] },
	fillToRect: rectangle,
	tileRect: rectangle,
}
export const TEXT_FILL_PUBLIC_SCHEMA = Object.freeze({
	description: 'Editable glyph fill, independent of the text-box panel. Use a solid color, no fill, or a native gradient with 2–32 ordered stops. null restores inherited/default text fill. Gradient transparency is authored per stop; angle applies only to linear gradients and fillToRect only to path gradients.',
	oneOf: [
		{ type: 'null' },
		{ type: 'object', additionalProperties: false, properties: { type: { type: 'string', const: 'solid' }, color, transparency: percentage } },
		{ type: 'object', additionalProperties: false, required: ['type'], properties: { type: { type: 'string', const: 'none' } } },
		{ type: 'object', additionalProperties: false, required: ['type', 'gradientStops'], properties: gradientProperties, allOf: [
			{ if: { properties: { gradientDirection: { enum: ['circle', 'rect', 'shape'] } }, required: ['gradientDirection'] }, then: { properties: { gradientAngle: { type: 'null' } } }, else: { properties: { fillToRect: { type: 'null' } } } },
		] },
	],
})
export const TEXT_FILL_PATCH_SCHEMA = Object.freeze({
	type: ['object', 'null'], additionalProperties: false,
	description: 'Sparse glyph-fill patch. Same-type leaves are merged, the stop array is replaced, and an explicit type change discards fields from the previous kind. Required gradient stops cannot be reset individually; replace the fill or set it to null.',
	properties: { ...gradientProperties, type: { type: 'string', enum: ['solid', 'none', 'gradient'] }, color, transparency: percentage },
})

function record(value, path, allowed) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
	for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${path}.${key} is not part of the public text-fill contract.`)
}
function number(value, path, max = 100, exclusive = false) {
	if (value === null) return null
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (exclusive ? value >= max : value > max)) throw new Error(`${path} must be a finite number from 0 to ${exclusive ? 'less than ' : ''}${max}, or null.`)
	const rounded = Math.round(value * 1000) / 1000
	if (Math.abs(value - rounded) > 1e-9) throw new Error(`${path} must use a 0.001 step.`)
	return rounded
}
function normalizedColor(value, path, nullable = true) {
	if (value === null && nullable) return null
	if (typeof value !== 'string' || !colorPattern.test(value)) throw new Error(`${path} must be a six-digit hexadecimal or theme color${nullable ? ', or null' : ''}.`)
	return /^#?[0-9A-Fa-f]{6}$/.test(value) ? value.replace(/^#/, '').toUpperCase() : value
}

export function normalizeTextFill(value, path = 'textFill', { allowPartial = false } = {}) {
	if (value == null) return value
	record(value, path, TEXT_FILL_FIELDS)
	const out = structuredClone(value)
	if (owns(out, 'type') && !['solid', 'none', 'gradient'].includes(out.type)) throw new Error(`${path}.type must be solid, none, or gradient.`)
	if (owns(out, 'color')) out.color = normalizedColor(out.color, `${path}.color`)
	if (owns(out, 'transparency')) out.transparency = number(out.transparency, `${path}.transparency`)
	if (owns(out, 'gradientDirection') && out.gradientDirection !== null && !['linear', 'circle', 'rect', 'shape'].includes(out.gradientDirection)) throw new Error(`${path}.gradientDirection must be linear, circle, rect, or shape.`)
	if (owns(out, 'gradientAngle')) out.gradientAngle = number(out.gradientAngle, `${path}.gradientAngle`, 360, true)
	if (owns(out, 'rotateGradientWithShape') && out.rotateGradientWithShape !== null && typeof out.rotateGradientWithShape !== 'boolean') throw new Error(`${path}.rotateGradientWithShape must be boolean or null.`)
	if (owns(out, 'gradientFlip') && out.gradientFlip !== null && !['none', 'x', 'y', 'xy'].includes(out.gradientFlip)) throw new Error(`${path}.gradientFlip must be none, x, y, or xy.`)
	for (const key of ['fillToRect', 'tileRect']) {
		if (!owns(out, key) || out[key] === null) continue
		record(out[key], `${path}.${key}`, ['l', 't', 'r', 'b'])
		for (const edge of Object.keys(out[key])) out[key][edge] = number(out[key][edge], `${path}.${key}.${edge}`)
	}
	if (owns(out, 'gradientStops')) {
		if (!Array.isArray(out.gradientStops) || out.gradientStops.length < 2 || out.gradientStops.length > 32) throw new Error(`${path}.gradientStops needs 2–32 ordered stops.`)
		let previous = -1
		out.gradientStops = out.gradientStops.map((stop, index) => {
			const field = `${path}.gradientStops[${index}]`
			record(stop, field, ['position', 'color', 'transparency'])
			if (!owns(stop, 'position') || stop.position === null || !owns(stop, 'color')) throw new Error(`${field} requires position and color.`)
			const result = { position: number(stop.position, `${field}.position`), color: normalizedColor(stop.color, `${field}.color`, false) }
			if (result.position < previous) throw new Error(`${path}.gradientStops must be ordered by position; equal positions are allowed for a hard stop.`)
			previous = result.position
			if (owns(stop, 'transparency')) result.transparency = number(stop.transparency, `${field}.transparency`)
			return result
		})
	}
	const kind = out.type || (allowPartial ? undefined : 'solid')
	if (kind === 'none' && Object.keys(out).some(key => key !== 'type')) throw new Error(`${path} type none accepts no other fill fields.`)
	if (kind === 'solid' && TEXT_FILL_GRADIENT_FIELDS.some(key => owns(out, key))) throw new Error(`${path} gradient fields require type gradient.`)
	if (kind === 'gradient') {
		if (owns(out, 'color') || owns(out, 'transparency')) throw new Error(`${path} gradient color and transparency belong on each stop.`)
		if (!allowPartial && !owns(out, 'gradientStops')) throw new Error(`${path} gradient requires gradientStops.`)
		const direction = out.gradientDirection || (!allowPartial ? 'linear' : undefined)
		if (direction === 'linear' && out.fillToRect != null) throw new Error(`${path}.fillToRect applies only to a path gradient.`)
		if (direction && direction !== 'linear' && out.gradientAngle != null) throw new Error(`${path}.gradientAngle applies only to a linear gradient.`)
	}
	return out
}

export function patchTextFill(current, patch, path = 'textFill') {
	const input = normalizeTextFill(patch, path, { allowPartial: true })
	if (input == null) return input
	const previous = current == null ? {} : normalizeTextFill(current, path)
	const changedKind = owns(input, 'type') && input.type !== (previous.type || 'solid')
	const merged = { ...(changedKind ? {} : previous), ...input }
	for (const key of ['fillToRect', 'tileRect']) {
		if (!changedKind && input[key] && previous[key]) merged[key] = { ...previous[key], ...input[key] }
	}
	// A direction switch replaces the mutually exclusive native gradient mode.
	if (owns(input, 'gradientDirection')) {
		if ((input.gradientDirection || 'linear') === 'linear' && !owns(input, 'fillToRect')) delete merged.fillToRect
		else if (input.gradientDirection && input.gradientDirection !== 'linear' && !owns(input, 'gradientAngle')) delete merged.gradientAngle
	}
	return normalizeTextFill(merged, path)
}

// Keep legacy color/transparency readback for solids without leaking a theme
// token into the separate RGB-only typography field on export/replay.
export function textFillCompatibilityOptions(fill) {
	if (fill === null) return { color: null, transparency: null }
	if (!fill || (fill.type && fill.type !== 'solid')) return {}
	const out = {}
	if (owns(fill, 'color') && (fill.color === null || /^[0-9A-F]{6}$/.test(fill.color))) out.color = fill.color
	if (owns(fill, 'transparency')) out.transparency = fill.transparency
	return out
}
