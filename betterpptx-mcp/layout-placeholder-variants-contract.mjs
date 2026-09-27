import {
	MAX_NATIVE_PLACEHOLDER_INDEX,
	NATIVE_PLACEHOLDER_ORIENTATIONS,
	NATIVE_PLACEHOLDER_SIZES,
	NATIVE_PLACEHOLDER_TYPES,
} from './ir/native-visual-primitives.mjs'

const OWN = (value, key) => Object.prototype.hasOwnProperty.call(value, key)

export const LAYOUT_PLACEHOLDER_VARIANTS_UNIT_ID = 'impl-b-a401766c4db63681'
export const SLIDE_NUMBER_FIELD_ROW_ID = 'cap_1202b1a8af7d8070105c'
export const HEADER_VISIBILITY_ROW_ID = 'cap_081e874a48edb87f19a2'

export const LAYOUT_PLACEHOLDER_VARIANT_ROWS = Object.freeze([
	Object.freeze({ id: 'cap_08785c644fe82b5ec3f2', label: 'slideNum', semanticType: 'slideNum', nativeType: 'sldNum' }),
	Object.freeze({ id: 'cap_584b523aa9e2d6b7e9e1', label: 'date', semanticType: 'date', nativeType: 'dt' }),
	Object.freeze({ id: 'cap_596f63b0c2b2690a1782', label: 'media', semanticType: 'media', nativeType: 'media' }),
	Object.freeze({ id: 'cap_c3e72c6bfaf00e553dfe', label: 'body', semanticType: 'body', nativeType: 'body' }),
	Object.freeze({ id: 'cap_da722df959d0def8e8ee', label: 'footer', semanticType: 'footer', nativeType: 'ftr' }),
	Object.freeze({ id: 'cap_e41a662c27ece1260561', label: 'title', semanticType: 'title', nativeType: 'title' }),
	Object.freeze({ id: 'cap_fe790b8581c07ca42a29', label: 'subtitle', semanticType: 'subtitle', nativeType: 'subTitle' }),
])

// Graphic-frame placeholders use the same semantic/native normalization as
// shape-backed placeholders, but their populated slide carriers are
// p:graphicFrame rather than p:sp and therefore have a separate proof unit.
export const LAYOUT_GRAPHIC_PLACEHOLDER_ROWS = Object.freeze([
	Object.freeze({ id: 'cap_adb7f3edf5645381f0f6', label: 'chart', semanticType: 'chart', nativeType: 'chart' }),
	Object.freeze({ id: 'cap_d8cf7ea86a8ff0992e12', label: 'table', semanticType: 'table', nativeType: 'tbl' }),
])

export const LAYOUT_GRAPHIC_PLACEHOLDER_ROW_IDS = Object.freeze(LAYOUT_GRAPHIC_PLACEHOLDER_ROWS.map(row => row.id))

export const LAYOUT_PLACEHOLDER_VARIANT_ROW_IDS = Object.freeze(LAYOUT_PLACEHOLDER_VARIANT_ROWS.map(row => row.id))
export const LAYOUT_PLACEHOLDER_VARIANT_SEMANTIC_TYPES = Object.freeze(LAYOUT_PLACEHOLDER_VARIANT_ROWS.map(row => row.semanticType))

const ALL_PLACEHOLDER_VARIANT_ROWS = Object.freeze([...LAYOUT_PLACEHOLDER_VARIANT_ROWS, ...LAYOUT_GRAPHIC_PLACEHOLDER_ROWS])
const SEMANTIC_TO_NATIVE = new Map(ALL_PLACEHOLDER_VARIANT_ROWS.map(row => [row.semanticType, row.nativeType]))
const NATIVE_TO_SEMANTIC = new Map(ALL_PLACEHOLDER_VARIANT_ROWS.map(row => [row.nativeType, row.semanticType]))

export const PUBLIC_PLACEHOLDER_TYPE_INPUTS = Object.freeze([...new Set([
	...NATIVE_PLACEHOLDER_TYPES.filter(type => type !== 'hdr'),
	...LAYOUT_PLACEHOLDER_VARIANT_SEMANTIC_TYPES,
	...LAYOUT_GRAPHIC_PLACEHOLDER_ROWS.map(row => row.semanticType),
])])

const PLACEHOLDER_BINDING_KEYS = Object.freeze([
	'name', 'placeholder', 'type', 'phType', 'idx', 'phIdx', 'size', 'phSz',
	'orient', 'phOrient', 'hasCustomPrompt', 'customPrompt', 'bare',
])
const PLACEHOLDER_DEFINITION_KEYS = Object.freeze([
	...PLACEHOLDER_BINDING_KEYS, 'x', 'y', 'w', 'h', 'margin', 'text', 'style',
])

const publicTypeSchema = Object.freeze({ type: 'string', enum: PUBLIC_PLACEHOLDER_TYPE_INPUTS })
const indexSchema = Object.freeze({ type: 'integer', minimum: 0, maximum: MAX_NATIVE_PLACEHOLDER_INDEX })
const sizeSchema = Object.freeze({ type: 'string', enum: [...NATIVE_PLACEHOLDER_SIZES] })
const orientationSchema = Object.freeze({ type: 'string', enum: [...NATIVE_PLACEHOLDER_ORIENTATIONS] })

const bindingObjectSchema = Object.freeze({
	type: 'object',
	additionalProperties: false,
	properties: Object.freeze({
		name: Object.freeze({ type: 'string', minLength: 1, maxLength: 128 }),
		placeholder: Object.freeze({ type: 'string', minLength: 1, maxLength: 128 }),
		type: publicTypeSchema,
		phType: publicTypeSchema,
		idx: indexSchema,
		phIdx: indexSchema,
		size: sizeSchema,
		phSz: sizeSchema,
		orient: orientationSchema,
		phOrient: orientationSchema,
		hasCustomPrompt: Object.freeze({ type: 'boolean' }),
		customPrompt: Object.freeze({ type: 'boolean' }),
		bare: Object.freeze({ const: true }),
	}),
	anyOf: Object.freeze([
		Object.freeze({ required: ['name'] }), Object.freeze({ required: ['placeholder'] }),
		Object.freeze({ required: ['type'] }), Object.freeze({ required: ['phType'] }),
		Object.freeze({ required: ['idx'] }), Object.freeze({ required: ['phIdx'] }),
		Object.freeze({ required: ['bare'] }),
	]),
})

export const LAYOUT_PLACEHOLDER_BINDING_SCHEMA = Object.freeze({
	description: 'Canonical semantic placeholder binding. Semantic aliases lower to native PresentationML tokens; legacy ph* aliases are accepted only when they agree. header/hdr is deliberately not authorable here; use headerFooter.header.',
	oneOf: Object.freeze([
		Object.freeze({ type: 'null' }),
		Object.freeze({ const: false, description: 'Explicitly clear/suppress the placeholder binding.' }),
		Object.freeze({ type: 'string', minLength: 1, maxLength: 128 }),
		bindingObjectSchema,
	]),
})

const placeholderMarginSchema = Object.freeze({
	oneOf: Object.freeze([
		Object.freeze({ type: 'number', minimum: 0 }),
		Object.freeze({ type: 'array', minItems: 1, maxItems: 4, items: Object.freeze({ type: 'number', minimum: 0 }) }),
		Object.freeze({
			type: 'object', additionalProperties: false,
			properties: Object.freeze({
				top: Object.freeze({ type: 'number', minimum: 0 }), right: Object.freeze({ type: 'number', minimum: 0 }),
				bottom: Object.freeze({ type: 'number', minimum: 0 }), left: Object.freeze({ type: 'number', minimum: 0 }),
			}),
		}),
	]),
})

const inheritanceColorSchema = Object.freeze({ type: 'string', pattern: '^(?:#?[0-9A-Fa-f]{6}|bg1|tx1|bg2|tx2|dk1|lt1|dk2|lt2|accent1|accent2|accent3|accent4|accent5|accent6|hlink|folHlink|phClr)$' })
const inheritanceStyleReferenceSchema = Object.freeze({
	type: 'object', additionalProperties: false,
	properties: Object.freeze({
		index: Object.freeze({ type: 'integer', minimum: 0, maximum: MAX_NATIVE_PLACEHOLDER_INDEX }),
		role: Object.freeze({ type: 'string', enum: Object.freeze(['major', 'minor', 'none']) }),
		color: inheritanceColorSchema,
	}),
})
export const PLACEHOLDER_VISUAL_STYLE_SCHEMA = Object.freeze({
	oneOf: Object.freeze([
		Object.freeze({ type: 'null' }),
		Object.freeze({
			type: 'object', additionalProperties: false,
			properties: Object.freeze({
				preset: Object.freeze({ type: ['string', 'null'], minLength: 1 }),
				fill: Object.freeze({ oneOf: Object.freeze([
					Object.freeze({ type: 'null' }),
					Object.freeze({ type: 'object', additionalProperties: false, properties: Object.freeze({ type: Object.freeze({ type: 'string', enum: Object.freeze(['none', 'solid']) }), color: inheritanceColorSchema, transparency: Object.freeze({ type: 'number', minimum: 0, maximum: 100 }) }) }),
				]) }),
				line: Object.freeze({ oneOf: Object.freeze([
					Object.freeze({ type: 'null' }),
					Object.freeze({ type: 'object', additionalProperties: false, properties: Object.freeze({ type: Object.freeze({ type: 'string', enum: Object.freeze(['none', 'solid']) }), color: inheritanceColorSchema, width: Object.freeze({ type: 'number', minimum: 0 }), transparency: Object.freeze({ type: 'number', minimum: 0, maximum: 100 }), dashType: Object.freeze({ type: 'string', minLength: 1 }) }) }),
				]) }),
				shadow: Object.freeze({ type: ['object', 'null'] }),
				styleRefs: Object.freeze({ oneOf: Object.freeze([
					Object.freeze({ type: 'null' }),
					Object.freeze({ type: 'object', additionalProperties: false, properties: Object.freeze({ line: inheritanceStyleReferenceSchema, fill: inheritanceStyleReferenceSchema, effect: inheritanceStyleReferenceSchema, font: inheritanceStyleReferenceSchema }) }),
				]) }),
				fontFace: Object.freeze({ type: ['string', 'null'], minLength: 1, maxLength: 256 }),
				fontSize: Object.freeze({ type: ['number', 'null'], exclusiveMinimum: 0, maximum: 400 }),
				color: Object.freeze({ oneOf: Object.freeze([Object.freeze({ type: 'null' }), inheritanceColorSchema]) }),
				bold: Object.freeze({ type: ['boolean', 'null'] }), italic: Object.freeze({ type: ['boolean', 'null'] }),
				align: Object.freeze({ type: ['string', 'null'], enum: Object.freeze(['left', 'center', 'right', 'justify', null]) }),
				valign: Object.freeze({ type: ['string', 'null'], enum: Object.freeze(['top', 'middle', 'bottom', null]) }),
			}),
		}),
	]),
})

export const LAYOUT_MARGIN_SCHEMA = Object.freeze({
	oneOf: Object.freeze([Object.freeze({ type: 'null' }), ...placeholderMarginSchema.oneOf]),
})

export const LAYOUT_OWNED_OBJECT_SCHEMA = Object.freeze({
	oneOf: Object.freeze([
		Object.freeze({ type: 'string', minLength: 1, description: 'Backward-compatible JSON-encoded native object.' }),
		Object.freeze({
			type: 'object', minProperties: 1, maxProperties: 1, additionalProperties: false,
			properties: Object.freeze({
				chart: Object.freeze({ type: 'object' }), image: Object.freeze({ type: 'object' }),
				line: Object.freeze({ type: 'object' }), rect: Object.freeze({ type: 'object' }),
				text: Object.freeze({ type: 'object' }), placeholder: Object.freeze({ type: 'object' }),
			}),
		}),
	]),
})

export const LAYOUT_PLACEHOLDER_DEFINITION_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	properties: Object.freeze({
		...bindingObjectSchema.properties,
		x: Object.freeze({ type: 'number' }), y: Object.freeze({ type: 'number' }),
		w: Object.freeze({ type: 'number', exclusiveMinimum: 0 }), h: Object.freeze({ type: 'number', exclusiveMinimum: 0 }),
		margin: placeholderMarginSchema,
		style: PLACEHOLDER_VISUAL_STYLE_SCHEMA,
		text: Object.freeze({ oneOf: Object.freeze([
			Object.freeze({ type: 'string' }),
			Object.freeze({
				type: 'array', minItems: 1, maxItems: 10000,
				items: Object.freeze({
					type: 'object', required: ['text'], additionalProperties: false,
					properties: Object.freeze({ text: Object.freeze({ type: ['string', 'number'] }), options: Object.freeze({ type: 'object' }) }),
				}),
			}),
		]) }),
	}),
	allOf: Object.freeze([
		Object.freeze({ anyOf: Object.freeze([Object.freeze({ required: ['name'] }), Object.freeze({ required: ['placeholder'] })]) }),
		Object.freeze({ anyOf: Object.freeze([Object.freeze({ required: ['type'] }), Object.freeze({ required: ['phType'] })]) }),
	]),
})

export const HEADER_FOOTER_POLICY_SCHEMA = Object.freeze({
	oneOf: Object.freeze([
		Object.freeze({ type: 'null' }),
		Object.freeze({
			type: 'object', additionalProperties: false,
			properties: Object.freeze({
				date: Object.freeze({ type: 'boolean' }), header: Object.freeze({ type: 'boolean' }),
				footer: Object.freeze({ type: 'boolean' }), slideNumber: Object.freeze({ type: 'boolean' }),
				showDate: Object.freeze({ type: 'boolean' }), showHeader: Object.freeze({ type: 'boolean' }),
				showFooter: Object.freeze({ type: 'boolean' }), showSlideNumber: Object.freeze({ type: 'boolean' }),
			}),
		}),
	]),
})

const coordinateSchema = Object.freeze({ oneOf: Object.freeze([
	Object.freeze({ type: 'number' }),
	Object.freeze({ type: 'string', pattern: '^-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)%$' }),
]) })

export const SLIDE_NUMBER_FIELD_SCHEMA = Object.freeze({
	oneOf: Object.freeze([
		Object.freeze({ type: 'null' }),
		Object.freeze({
			type: 'object', additionalProperties: false,
			properties: Object.freeze({
				x: coordinateSchema, y: coordinateSchema, w: coordinateSchema, h: coordinateSchema,
				margin: LAYOUT_MARGIN_SCHEMA,
				align: Object.freeze({ type: 'string', enum: Object.freeze(['left', 'center', 'right']) }),
				valign: Object.freeze({ type: 'string', enum: Object.freeze(['top', 'middle', 'bottom']) }),
				fontFace: Object.freeze({ type: 'string', minLength: 1, maxLength: 256 }),
				fontSize: Object.freeze({ type: 'number', exclusiveMinimum: 0, maximum: 400 }),
				color: Object.freeze({ type: 'string', pattern: '^[#]?[0-9A-Fa-f]{6}$' }),
				bold: Object.freeze({ type: 'boolean' }),
			}),
		}),
	]),
})

export const LAYOUT_MASTER_COMPONENT_LIFECYCLE = Object.freeze({
	placeholders: Object.freeze({ omitted: 'preserve current component', null: 'restore the named carrier placeholder component to its inherited/source default', emptyArray: 'author an explicitly empty placeholder component' }),
	layouts: Object.freeze({ omitted: 'preserve current authored collection', null: 'restore the deck layout collection to its imported/default baseline', emptyArray: 'clear all authored custom layout definitions' }),
	masters: Object.freeze({ omitted: 'preserve current authored collection', null: 'restore the deck master collection to its imported/default baseline', emptyArray: 'clear all authored custom master definitions' }),
	slideNumber: Object.freeze({ omitted: 'preserve current component', null: 'clear the named carrier slide-number field', object: 'replace the named carrier slide-number field' }),
	headerFooter: Object.freeze({ omitted: 'preserve current component', null: 'restore/clear the named carrier header/footer policy', object: 'replace the named carrier header/footer policy' }),
})

function plainObject(value, path) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
}

function rejectUnknownKeys(value, allowed, path) {
	for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${path}.${key} is not part of the public layout-placeholder contract.`)
}

function aliasedValue(value, keys, path, normalize) {
	const present = keys.filter(key => OWN(value, key) && value[key] !== undefined)
	if (!present.length) return undefined
	const normalized = present.map(key => normalize(value[key], `${path}.${key}`))
	if (normalized.some(item => item !== normalized[0])) throw new Error(`${path} aliases ${present.join(', ')} must agree when supplied together.`)
	return normalized[0]
}

function nonEmptyName(value, path) {
	if (typeof value !== 'string') throw new Error(`${path} must be a string.`)
	const normalized = value.trim()
	if (!normalized || normalized.length > 128) throw new Error(`${path} must be a non-empty string no longer than 128 characters.`)
	return normalized
}

export function nativePlaceholderType(value, path = 'placeholder.type') {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} must be a non-empty placeholder type string.`)
	const normalized = value.trim()
	if (normalized === 'header' || normalized === 'hdr') {
		throw new Error(`${path} cannot author header/hdr as a physical placeholder because PowerPoint repairs slide-layout carriers containing p:ph type="hdr"; use headerFooter.header instead.`)
	}
	const native = SEMANTIC_TO_NATIVE.get(normalized) || normalized
	if (!NATIVE_PLACEHOLDER_TYPES.includes(native)) {
		throw new Error(`${path} must be one of ${PUBLIC_PLACEHOLDER_TYPE_INPUTS.join(', ')}.`)
	}
	return native
}

export function semanticPlaceholderType(value, path = 'placeholder.type') {
	if (value === 'hdr') return 'header'
	const native = nativePlaceholderType(value, path)
	return NATIVE_TO_SEMANTIC.get(native) || native
}

export function importedPlaceholderRoleFromNative(value) {
	return value === 'hdr' ? 'header' : (NATIVE_TO_SEMANTIC.get(value) || value)
}

function unsignedIndex(value, path) {
	if (!Number.isInteger(value) || value < 0 || value > MAX_NATIVE_PLACEHOLDER_INDEX) throw new Error(`${path} must be an unsigned 32-bit integer.`)
	return value
}

function enumValue(value, allowed, path) {
	if (typeof value !== 'string' || !allowed.includes(value)) throw new Error(`${path} must be one of ${allowed.join(', ')}.`)
	return value
}

function booleanValue(value, path) {
	if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean.`)
	return value
}

function ooxmlBoolean(value, path) {
	if (typeof value === 'boolean') return value
	if (value === 1 || value === '1') return true
	if (value === 0 || value === '0') return false
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase()
		if (['true', 'on', 'yes'].includes(normalized)) return true
		if (['false', 'off', 'no'].includes(normalized)) return false
	}
	throw new Error(`${path} must be an OOXML boolean token (0/1, false/true, off/on, or no/yes).`)
}

function finiteNumber(value, path, { positive = false, nonNegative = false } = {}) {
	if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${path} must be a finite number.`)
	if (positive && value <= 0) throw new Error(`${path} must be greater than zero.`)
	if (nonNegative && value < 0) throw new Error(`${path} must be non-negative.`)
	return value
}

function normalizeMargin(value, path) {
	if (typeof value === 'number') return finiteNumber(value, path, { nonNegative: true })
	if (Array.isArray(value)) {
		if (value.length < 1 || value.length > 4) throw new Error(`${path} must contain one to four values.`)
		return value.map((item, index) => finiteNumber(item, `${path}[${index}]`, { nonNegative: true }))
	}
	plainObject(value, path)
	rejectUnknownKeys(value, ['top', 'right', 'bottom', 'left'], path)
	return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, finiteNumber(item, `${path}.${key}`, { nonNegative: true })]))
}

function inheritanceColor(value, path) {
	if (typeof value !== 'string' || !/^(?:#?[0-9A-Fa-f]{6}|bg1|tx1|bg2|tx2|dk1|lt1|dk2|lt2|accent1|accent2|accent3|accent4|accent5|accent6|hlink|folHlink|phClr)$/.test(value)) {
		throw new Error(`${path} must be a six-digit RGB value or a supported PowerPoint theme color token.`)
	}
	return value.replace(/^#/, '')
}

function normalizePlaceholderVisualStyle(value, path) {
	if (value === null) return null
	plainObject(value, path)
	rejectUnknownKeys(value, ['preset', 'fill', 'line', 'shadow', 'styleRefs', 'fontFace', 'fontSize', 'color', 'bold', 'italic', 'align', 'valign'], path)
	const out = {}
	if (OWN(value, 'preset')) {
		if (value.preset === null) out.preset = null
		else out.preset = nonEmptyName(value.preset, `${path}.preset`)
	}
	for (const family of ['fill', 'line']) {
		if (!OWN(value, family)) continue
		if (value[family] === null) { out[family] = null; continue }
		plainObject(value[family], `${path}.${family}`)
		const allowed = family === 'fill' ? ['type', 'color', 'transparency'] : ['type', 'color', 'width', 'transparency', 'dashType']
		rejectUnknownKeys(value[family], allowed, `${path}.${family}`)
		const normalized = {}
		if (OWN(value[family], 'type')) normalized.type = enumValue(value[family].type, ['none', 'solid'], `${path}.${family}.type`)
		if (OWN(value[family], 'color')) normalized.color = inheritanceColor(value[family].color, `${path}.${family}.color`)
		if (OWN(value[family], 'transparency')) {
			const transparency = finiteNumber(value[family].transparency, `${path}.${family}.transparency`, { nonNegative: true })
			if (transparency > 100) throw new Error(`${path}.${family}.transparency must be at most 100.`)
			normalized.transparency = transparency
		}
		if (family === 'line' && OWN(value.line, 'width')) normalized.width = finiteNumber(value.line.width, `${path}.line.width`, { nonNegative: true })
		if (family === 'line' && OWN(value.line, 'dashType')) normalized.dashType = nonEmptyName(value.line.dashType, `${path}.line.dashType`)
		out[family] = normalized
	}
	if (OWN(value, 'shadow')) {
		if (value.shadow === null) out.shadow = null
		else { plainObject(value.shadow, `${path}.shadow`); out.shadow = structuredClone(value.shadow) }
	}
	if (OWN(value, 'styleRefs')) {
		if (value.styleRefs === null) out.styleRefs = null
		else {
			plainObject(value.styleRefs, `${path}.styleRefs`)
			rejectUnknownKeys(value.styleRefs, ['line', 'fill', 'effect', 'font'], `${path}.styleRefs`)
			out.styleRefs = {}
			for (const [key, ref] of Object.entries(value.styleRefs)) {
				plainObject(ref, `${path}.styleRefs.${key}`)
				rejectUnknownKeys(ref, ['index', 'role', 'color'], `${path}.styleRefs.${key}`)
				const item = {}
				if (OWN(ref, 'index')) item.index = unsignedIndex(ref.index, `${path}.styleRefs.${key}.index`)
				if (OWN(ref, 'role')) item.role = enumValue(ref.role, ['major', 'minor', 'none'], `${path}.styleRefs.${key}.role`)
				if (OWN(ref, 'color')) item.color = inheritanceColor(ref.color, `${path}.styleRefs.${key}.color`)
				out.styleRefs[key] = item
			}
		}
	}
	for (const key of ['fontFace', 'fontSize', 'color', 'bold', 'italic', 'align', 'valign']) {
		if (!OWN(value, key)) continue
		if (value[key] === null) { out[key] = null; continue }
		if (key === 'fontFace') out[key] = nonEmptyName(value[key], `${path}.${key}`)
		else if (key === 'fontSize') {
			const size = finiteNumber(value[key], `${path}.${key}`, { positive: true })
			if (size > 400) throw new Error(`${path}.${key} must be at most 400.`)
			out[key] = size
		} else if (key === 'color') out[key] = inheritanceColor(value[key], `${path}.${key}`)
		else if (key === 'bold' || key === 'italic') out[key] = booleanValue(value[key], `${path}.${key}`)
		else if (key === 'align') out[key] = enumValue(value[key], ['left', 'center', 'right', 'justify'], `${path}.${key}`)
		else out[key] = enumValue(value[key], ['top', 'middle', 'bottom'], `${path}.${key}`)
	}
	return out
}

/**
 * Lower the public semantic vocabulary to the existing native option carrier.
 * The returned keys intentionally match the serializer-facing ph* option names.
 */
export function normalizePlaceholderBinding(value, path = 'placeholderBinding') {
	if (value === undefined || value === null || value === false) return null
	if (typeof value === 'string') {
		const token = nonEmptyName(value, path)
		if (PUBLIC_PLACEHOLDER_TYPE_INPUTS.includes(token)) {
			const nativeType = nativePlaceholderType(token, path)
			return { placeholder: nativeType, phType: nativeType }
		}
		return { placeholder: token }
	}
	plainObject(value, path)
	rejectUnknownKeys(value, PLACEHOLDER_BINDING_KEYS, path)
	const name = aliasedValue(value, ['name', 'placeholder'], path, nonEmptyName)
	const type = aliasedValue(value, ['type', 'phType'], path, nativePlaceholderType)
	const idx = aliasedValue(value, ['idx', 'phIdx'], path, unsignedIndex)
	const size = aliasedValue(value, ['size', 'phSz'], path, (item, itemPath) => enumValue(item, NATIVE_PLACEHOLDER_SIZES, itemPath))
	const orient = aliasedValue(value, ['orient', 'phOrient'], path, (item, itemPath) => enumValue(item, NATIVE_PLACEHOLDER_ORIENTATIONS, itemPath))
	const customPrompt = aliasedValue(value, ['hasCustomPrompt', 'customPrompt'], path, booleanValue)
	const bare = OWN(value, 'bare') ? value.bare : undefined
	if (bare !== undefined && bare !== true) throw new Error(`${path}.bare must be true when supplied.`)
	if (name === undefined && type === undefined && idx === undefined && bare !== true) {
		throw new Error(`${path} requires name, placeholder, type, phType, idx, phIdx, or bare:true.`)
	}
	if (type === 'clipArt' && orient !== undefined) throw new Error(`${path}.orient is not applicable to clipArt placeholders because PowerPoint canonicalizes it away on save.`)
	return {
		placeholder: name ?? type ?? true,
		...(type !== undefined ? { phType: type } : {}),
		...(idx !== undefined ? { phIdx: idx } : {}),
		...(size !== undefined ? { phSz: size } : {}),
		...(orient !== undefined ? { phOrient: orient } : {}),
		...(customPrompt !== undefined ? { hasCustomPrompt: customPrompt } : {}),
	}
}

/** Convert serializer/native state to the one canonical public binding input. */
export function publicPlaceholderBindingFromNative(value = {}) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
	const nativeTypeValue = value.phType ?? value.type
	const nativeType = nativeTypeValue === undefined || nativeTypeValue === null ? undefined : String(nativeTypeValue)
	if (nativeType !== undefined && !NATIVE_PLACEHOLDER_TYPES.includes(nativeType)) throw new Error(`placeholderBinding.type is not a recognized native placeholder token: ${nativeType}.`)
	// hdr is preservation-only on import. Returning an authorable placeholderBinding
	// here would make export/recompile generate a PowerPoint-repairing layout carrier.
	if (nativeType === 'hdr') return undefined
	const idxValue = value.phIdx ?? value.idx
	const sizeValue = value.phSz ?? value.size
	const orientValue = value.phOrient ?? value.orient
	const customPromptValue = value.phHasCustomPrompt ?? value.hasCustomPrompt ?? value.customPrompt
	if (nativeType === undefined && idxValue === undefined && sizeValue === undefined && orientValue === undefined && customPromptValue === undefined) {
		return value.hasBarePh || value.placeholder === true ? { bare: true } : undefined
	}
	const result = {
		...(nativeType !== undefined ? { type: semanticPlaceholderType(nativeType) } : {}),
		...(idxValue !== undefined && idxValue !== null ? { idx: unsignedIndex(Number(idxValue), 'placeholderBinding.idx') } : {}),
		...(sizeValue !== undefined && sizeValue !== null ? { size: enumValue(String(sizeValue), NATIVE_PLACEHOLDER_SIZES, 'placeholderBinding.size') } : {}),
		...(orientValue !== undefined && orientValue !== null && nativeType !== 'clipArt' ? { orient: enumValue(String(orientValue), NATIVE_PLACEHOLDER_ORIENTATIONS, 'placeholderBinding.orient') } : {}),
		...(customPromptValue !== undefined && customPromptValue !== null ? { hasCustomPrompt: ooxmlBoolean(customPromptValue, 'placeholderBinding.hasCustomPrompt') } : {}),
	}
	if (!OWN(result, 'type') && !OWN(result, 'idx')) result.bare = true
	return result
}

export function normalizePlaceholderDefinition(value, path = 'placeholder') {
	plainObject(value, path)
	rejectUnknownKeys(value, PLACEHOLDER_DEFINITION_KEYS, path)
	const name = aliasedValue(value, ['name', 'placeholder'], path, nonEmptyName)
	if (name === undefined) throw new Error(`${path} requires name or placeholder.`)
	const type = aliasedValue(value, ['type', 'phType'], path, nativePlaceholderType)
	if (type === undefined) throw new Error(`${path} requires type or phType.`)
	const binding = normalizePlaceholderBinding({
		name,
		type,
		...(OWN(value, 'idx') ? { idx: value.idx } : {}),
		...(OWN(value, 'phIdx') ? { phIdx: value.phIdx } : {}),
		...(OWN(value, 'size') ? { size: value.size } : {}),
		...(OWN(value, 'phSz') ? { phSz: value.phSz } : {}),
		...(OWN(value, 'orient') ? { orient: value.orient } : {}),
		...(OWN(value, 'phOrient') ? { phOrient: value.phOrient } : {}),
		...(OWN(value, 'hasCustomPrompt') ? { hasCustomPrompt: value.hasCustomPrompt } : {}),
		...(OWN(value, 'customPrompt') ? { customPrompt: value.customPrompt } : {}),
	}, path)
	const result = {
		name,
		type: binding.phType,
		...(binding.phIdx !== undefined ? { idx: binding.phIdx } : {}),
		...(binding.phSz !== undefined ? { size: binding.phSz } : {}),
		...(binding.phOrient !== undefined ? { orient: binding.phOrient } : {}),
		...(binding.hasCustomPrompt !== undefined ? { hasCustomPrompt: binding.hasCustomPrompt } : {}),
	}
	for (const key of ['x', 'y']) if (OWN(value, key)) result[key] = finiteNumber(value[key], `${path}.${key}`)
	for (const key of ['w', 'h']) if (OWN(value, key)) result[key] = finiteNumber(value[key], `${path}.${key}`, { positive: true })
	if (OWN(value, 'margin')) result.margin = normalizeMargin(value.margin, `${path}.margin`)
	if (OWN(value, 'style')) result.style = normalizePlaceholderVisualStyle(value.style, `${path}.style`)
	if (OWN(value, 'text')) {
		if (typeof value.text !== 'string' && !Array.isArray(value.text)) throw new Error(`${path}.text must be a string or rich-text run array.`)
		result.text = value.text
	}
	return result
}

export function normalizeHeaderFooterPolicy(value, path = 'headerFooter') {
	if (value === undefined || value === null) return value
	plainObject(value, path)
	rejectUnknownKeys(value, ['date', 'header', 'footer', 'slideNumber', 'showDate', 'showHeader', 'showFooter', 'showSlideNumber'], path)
	const out = {}
	for (const [canonical, alias] of [['date', 'showDate'], ['header', 'showHeader'], ['footer', 'showFooter'], ['slideNumber', 'showSlideNumber']]) {
		const normalized = aliasedValue(value, [canonical, alias], path, booleanValue)
		if (normalized !== undefined) out[canonical] = normalized
	}
	return out
}

function coordinate(value, path) {
	if (typeof value === 'number' && Number.isFinite(value)) return value
	if (typeof value === 'string' && /^-?(?:\d+(?:\.\d+)?|\.\d+)%$/.test(value)) return value
	throw new Error(`${path} must be a finite number or percentage string.`)
}

export function normalizeSlideNumberField(value, path = 'slideNumber') {
	if (value === undefined || value === null) return value
	plainObject(value, path)
	rejectUnknownKeys(value, ['x', 'y', 'w', 'h', 'margin', 'align', 'valign', 'fontFace', 'fontSize', 'color', 'bold'], path)
	const out = {}
	for (const key of ['x', 'y', 'w', 'h']) if (OWN(value, key)) out[key] = coordinate(value[key], `${path}.${key}`)
	if (OWN(value, 'margin')) out.margin = value.margin === null ? null : normalizeMargin(value.margin, `${path}.margin`)
	if (OWN(value, 'align')) out.align = enumValue(value.align, ['left', 'center', 'right'], `${path}.align`)
	if (OWN(value, 'valign')) out.valign = enumValue(value.valign, ['top', 'middle', 'bottom'], `${path}.valign`)
	if (OWN(value, 'fontFace')) {
		if (typeof value.fontFace !== 'string' || !value.fontFace.trim() || value.fontFace.trim().length > 256) throw new Error(`${path}.fontFace must be a non-empty string no longer than 256 characters.`)
		out.fontFace = value.fontFace.trim()
	}
	if (OWN(value, 'fontSize')) out.fontSize = finiteNumber(value.fontSize, `${path}.fontSize`, { positive: true })
	if (out.fontSize > 400) throw new Error(`${path}.fontSize must be no greater than 400.`)
	if (OWN(value, 'color')) {
		if (typeof value.color !== 'string' || !/^#?[0-9a-f]{6}$/i.test(value.color)) throw new Error(`${path}.color must be a 6-digit RGB hex string.`)
		out.color = value.color.replace(/^#/, '').toUpperCase()
	}
	if (OWN(value, 'bold')) out.bold = booleanValue(value.bold, `${path}.bold`)
	return out
}

export const SLIDE_NUMBER_FIELD_CONTRACT = Object.freeze({
	id: 'nativeSlideNumberField',
	rowIds: Object.freeze([SLIDE_NUMBER_FIELD_ROW_ID]),
	capabilityMode: 'parameterized',
	capabilityStatus: 'executable-exact-structured',
	runtimeReady: true,
	componentOwnership: Object.freeze(['layouts[].slideNumber', 'masters[].slideNumber', 'a:fld[type="slidenum"]']),
	overrideFields: Object.freeze(['layouts[].slideNumber', 'masters[].slideNumber', 'slideNumber.x', 'slideNumber.y', 'slideNumber.w', 'slideNumber.h', 'slideNumber.margin', 'slideNumber.align', 'slideNumber.valign', 'slideNumber.fontFace', 'slideNumber.fontSize', 'slideNumber.color', 'slideNumber.bold']),
	publicSchema: SLIDE_NUMBER_FIELD_SCHEMA,
	resetBehavior: LAYOUT_MASTER_COMPONENT_LIFECYCLE.slideNumber,
	precedence: Object.freeze(['named layout/master slide-number component', 'native slide-number placeholder inheritance', 'dynamic a:fld slidenum payload']),
	legalCombinations: Object.freeze(['dynamic slide-number field with a distinct sldNum placeholder binding', 'header/footer visibility policy plus slide-number field geometry/style', 'component reset followed by sparse re-edit and export/recompile']),
})

export const HEADER_VISIBILITY_CONTRACT = Object.freeze({
	id: 'nativeHeaderVisibilityPolicy',
	rowIds: Object.freeze([HEADER_VISIBILITY_ROW_ID]),
	capabilityMode: 'parameterized',
	capabilityStatus: 'executable-exact-structured',
	runtimeReady: true,
	componentOwnership: Object.freeze(['layouts[].headerFooter.header', 'masters[].headerFooter.header', 'p:hf@hdr']),
	overrideFields: Object.freeze(['layouts[].headerFooter.header', 'masters[].headerFooter.header']),
	forbiddenPhysicalCarrier: 'p:ph type="hdr"',
	safeAuthoringPath: 'headerFooter.header',
	publicSchema: HEADER_FOOTER_POLICY_SCHEMA,
	resetBehavior: LAYOUT_MASTER_COMPONENT_LIFECYCLE.headerFooter,
	precedence: Object.freeze(['named layout/master header-footer policy', 'inherited native p:hf policy', 'PowerPoint canonical header visibility behavior']),
	legalCombinations: Object.freeze(['header visibility with date, footer, and slide-number visibility flags', 'null component reset followed by explicit true or false re-edit', 'preservation-only imported hdr metadata without authoring a physical hdr placeholder']),
})

export const LAYOUT_PLACEHOLDER_VARIANTS_CONTRACT = Object.freeze({
	id: 'layoutPlaceholderSemanticVariants',
	schemaVersion: 'betterpptx.layout-placeholder-variants-contract.v1',
	unitId: LAYOUT_PLACEHOLDER_VARIANTS_UNIT_ID,
	capabilityMode: 'parameterized',
	capabilityStatus: 'executable-exact-structured',
	runtimeReady: true,
	rowIds: LAYOUT_PLACEHOLDER_VARIANT_ROW_IDS,
	excludedRowIds: Object.freeze([HEADER_VISIBILITY_ROW_ID, SLIDE_NUMBER_FIELD_ROW_ID]),
	componentOwnership: Object.freeze(['placeholder.type', 'placeholder.index', 'placeholder.size', 'placeholder.orientation', 'placeholder.customPrompt', 'content[].placeholderBinding']),
	overrideFields: Object.freeze(['layouts[].placeholders', 'masters[].placeholders', 'layoutContract.placeholderBindings', 'content[].placeholderBinding', 'placeholder.type', 'placeholder.name', 'placeholder.idx', 'placeholder.size', 'placeholder.orient', 'placeholder.hasCustomPrompt', 'placeholder.x', 'placeholder.y', 'placeholder.w', 'placeholder.h', 'placeholder.margin', 'placeholder.text']),
	publicSchema: LAYOUT_PLACEHOLDER_BINDING_SCHEMA,
	resetBehavior: LAYOUT_MASTER_COMPONENT_LIFECYCLE.placeholders,
	precedence: Object.freeze(['master placeholder with normalized type/index', 'layout placeholder with normalized type/index', 'explicit slide object placeholderBinding', 'explicit null suppression of an inherited role binding']),
	legalCombinations: Object.freeze(['seven repair-safe physical roles on one layout/master atlas with distinct indices', 'text, picture, and media carriers bound by canonical semantic type/index', 'size, orientation, custom prompt, geometry, and text with idx zero and explicit false preserved', 'named carrier replacement, component reset, re-edit, export/recompile, and deletion without duplicate inherited placeholders']),
})

export const LAYOUT_PLACEHOLDER_VARIANTS_UNIT_PARTITION = Object.freeze({
	unitId: LAYOUT_PLACEHOLDER_VARIANTS_UNIT_ID,
	rows: 9,
	physicalPlaceholderRows: 7,
	headerVisibilityRows: 1,
	slideNumberFieldRows: 1,
	rowIds: Object.freeze([...LAYOUT_PLACEHOLDER_VARIANT_ROW_IDS, HEADER_VISIBILITY_ROW_ID, SLIDE_NUMBER_FIELD_ROW_ID]),
})
