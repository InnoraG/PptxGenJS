// Canonical public contract for native DrawingML WordArt text transforms.
// Keep selector truth, validation, schema projection, and implementation-ledger
// promotion derived from this module so the 41-value domain cannot drift.

export const WORDART_TRANSFORMS = Object.freeze([
	'textNoShape',
	'textPlain',
	'textArchUp',
	'textArchDown',
	'textCircle',
	'textButton',
	'textArchUpPour',
	'textArchDownPour',
	'textCirclePour',
	'textButtonPour',
	'textCurveUp',
	'textCurveDown',
	'textCanUp',
	'textCanDown',
	'textWave1',
	'textWave2',
	'textWave4',
	'textDoubleWave1',
	'textInflate',
	'textDeflate',
	'textInflateBottom',
	'textDeflateBottom',
	'textInflateTop',
	'textDeflateTop',
	'textDeflateInflate',
	'textDeflateInflateDeflate',
	'textFadeRight',
	'textFadeLeft',
	'textFadeUp',
	'textFadeDown',
	'textSlantUp',
	'textSlantDown',
	'textCascadeUp',
	'textCascadeDown',
	'textChevron',
	'textChevronInverted',
	'textRingInside',
	'textRingOutside',
	'textTriangle',
	'textTriangleInverted',
	'textStop',
])

export const WORDART_TRANSFORM_ALIASES = Object.freeze({
	textDoubleWave2: 'textWave4',
	textChevronDown: 'textChevronInverted',
})

// PowerPoint persists one `adj` guide for these transforms. The remaining
// transforms are exact discrete selectors and reject invented guide XML.
export const WORDART_ADJUSTMENT_TRANSFORMS = Object.freeze([
	'textPlain', 'textArchUp', 'textArchDown', 'textCircle', 'textButton',
	'textCurveUp', 'textCurveDown', 'textCanUp', 'textCanDown',
	'textInflate', 'textDeflate', 'textInflateBottom', 'textDeflateBottom',
	'textInflateTop', 'textDeflateTop', 'textDeflateInflate',
	'textDeflateInflateDeflate', 'textFadeRight', 'textFadeLeft',
	'textFadeUp', 'textFadeDown', 'textSlantUp', 'textSlantDown',
	'textCascadeUp', 'textCascadeDown', 'textChevron', 'textChevronInverted',
	'textRingInside', 'textRingOutside', 'textTriangle', 'textTriangleInverted',
	'textStop',
])

export const WORDART_TRANSFORM_SET = new Set(WORDART_TRANSFORMS)
export const WORDART_ADJUSTMENT_TRANSFORM_SET = new Set(WORDART_ADJUSTMENT_TRANSFORMS)

export const WORDART_TRANSFORM_ROW_ID_BY_VALUE = Object.freeze({
	textArchDown: 'cap_a0c424d55a1c6cd08f82',
	textArchDownPour: 'cap_2c68ec7fc26a7bea7fd1',
	textArchUp: 'cap_bbdc8a0f6b61566a2047',
	textArchUpPour: 'cap_2c6cfd40e39f2aa1ae8a',
	textButton: 'cap_5f97adf374d6500fbfda',
	textButtonPour: 'cap_ad9c1a052082568ade57',
	textCanDown: 'cap_52484c29ef8981364898',
	textCanUp: 'cap_412bab153d1c49ec38dd',
	textCascadeDown: 'cap_1fe34cad73ff80764b59',
	textCascadeUp: 'cap_72d10197f38f6aae24e0',
	textChevron: 'cap_f522d04952c42097c6d0',
	textChevronInverted: 'cap_3fc8fd4ca8b4fbdaba7a',
	textCircle: 'cap_b4ea4fa49120451526ed',
	textCirclePour: 'cap_e10ad78ec7edd95f84d2',
	textCurveDown: 'cap_4499639defed99683b4a',
	textCurveUp: 'cap_2231987b86f76a860ef9',
	textDeflate: 'cap_6568244a1a5e1f4b2e45',
	textDeflateBottom: 'cap_02baf12a56bbc574d564',
	textDeflateInflate: 'cap_108f588d08d599fdcf24',
	textDeflateInflateDeflate: 'cap_9932bdb0dfbdb5a54aff',
	textDeflateTop: 'cap_b7f07926de859a7733b2',
	textDoubleWave1: 'cap_522591e661a7bb268d88',
	textFadeDown: 'cap_e1de78a3b41c311d006c',
	textFadeLeft: 'cap_f7c6ba7cdc21c159d32d',
	textFadeRight: 'cap_f674dee7fae0e368b745',
	textFadeUp: 'cap_a9556db5fd9949568385',
	textInflate: 'cap_73c8bd3c297fb63334e5',
	textInflateBottom: 'cap_20141fc236d7322441e7',
	textInflateTop: 'cap_0780c9eb31df9a8a8f1b',
	textNoShape: 'cap_949812ae054d5d71bbd1',
	textPlain: 'cap_cadd49e165927d9073b3',
	textRingInside: 'cap_d5dbadd2626b77be60a5',
	textRingOutside: 'cap_1d37cb05f8c7f1816464',
	textSlantDown: 'cap_a1fd4b6c041d61e20f13',
	textSlantUp: 'cap_1f3378623d6a974de59a',
	textStop: 'cap_a2caf5982a615aa24310',
	textTriangle: 'cap_880a4937c8f79ba30ae4',
	textTriangleInverted: 'cap_f613d349340903325997',
	textWave1: 'cap_6a58524100993129de88',
	textWave2: 'cap_4d39bfc8e3be6ece765d',
	textWave4: 'cap_5647e8551b1028782418',
})

export const WORDART_TRANSFORM_ROW_IDS = Object.freeze(Object.values(WORDART_TRANSFORM_ROW_ID_BY_VALUE))

export const WORDART_TRANSFORM_PUBLIC_SCHEMA = Object.freeze({
	type: 'object',
	description: 'Native WordArt transform plus one independently editable normalized adjustment guide where PowerPoint exposes that slider. Gallery transforms are selectors, not authoring ceilings, and non-applicable guides are rejected.',
	properties: Object.freeze({
		transform: Object.freeze({ type: 'string', enum: WORDART_TRANSFORMS, description: 'Canonical DrawingML preset text warp.' }),
		adjustments: Object.freeze({
			type: 'array',
			items: Object.freeze({ type: 'integer', minimum: 0, maximum: 100000, description: 'Guide value in 1/100000 of the shape dimension.' }),
			minItems: 0,
			maxItems: 1,
			applicability: WORDART_ADJUSTMENT_TRANSFORMS,
			description: 'Transform-specific a:gd guide value. Use null or omit it to reset; unsupported guides and a second guide are not invented.',
		}),
	}),
	additionalProperties: false,
})

const WORDART_TRANSFORM_RESET = Object.freeze({
	component: 'set options.wordArt.adjustments to null or omit adjustment0',
	full: 'set options.wordArt to null',
	nullBehavior: 'remove the authored guide while retaining the transform, or remove the complete native warp when wordArt is null',
})

export const WORDART_TRANSFORM_CONTRACT = Object.freeze({
	schemaVersion: 'betterpptx.wordart-transform-contract.v1',
	capabilityMode: 'parameterized',
	capabilityStatus: 'executable-exact-structured',
	field: 'options.wordArt',
	componentOwnership: Object.freeze(['wordArt.transform', 'wordArt.adjustments']),
	overrideFields: Object.freeze(['options.wordArt.transform', 'options.wordArt.adjustments']),
	resetBehavior: WORDART_TRANSFORM_RESET,
	precedence: Object.freeze([
		'wordArtStylePresetId supplies the native text-style base',
		'ordered textEffectPresetIds apply after the style base',
		'authored options.wordArt.transform and adjustments apply last',
	]),
	legalCombinations: Object.freeze([
		'all 41 canonical transform selectors without a guide',
		'one integer guide from 0 through 100000 on listed guide-capable transforms',
		'WordArt transform with independent text fill, outline, effects, and fit; combined WordArt plus Text3D supports fit none or shrink while fit resize is rejected at the Office boundary',
	]),
	canonical: WORDART_TRANSFORMS,
	aliases: WORDART_TRANSFORM_ALIASES,
	adjustmentApplicability: WORDART_ADJUSTMENT_TRANSFORMS,
	rowIds: WORDART_TRANSFORM_ROW_IDS,
	schema: WORDART_TRANSFORM_PUBLIC_SCHEMA,
})

function assertPlainObject(value, path) {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${path} must be an object.`)
}

function assertKnownKeys(value, path) {
	for (const key of Object.keys(value)) {
		if (key !== 'transform' && key !== 'adjustments') throw new Error(`${path}.${key} is not a supported WordArt field.`)
	}
}

function normalizeAdjustments(rawAdjustments, transform, path) {
	if (rawAdjustments === null) return null
	if (!Array.isArray(rawAdjustments)) throw new Error(`${path}.adjustments must be an array with zero or one native guide value.`)
	if (rawAdjustments.length > 1) throw new Error(`${path}.adjustments supports one persisted native guide (adjustment0); PowerPoint rejects an invented second adj1 guide.`)
	const adjustments = rawAdjustments.map((raw, index) => {
		if (!Number.isInteger(raw) || raw < 0 || raw > 100000) throw new Error(`${path}.adjustment${index} must be an integer between 0 and 100000 (1/100000 shape-dimension units).`)
		return raw
	})
	if (adjustments.length && transform && !WORDART_ADJUSTMENT_TRANSFORM_SET.has(transform)) {
		throw new Error(`${path}.transform ${transform} does not expose a persisted native adjustment guide; author it as a discrete transform selector.`)
	}
	return adjustments
}

export function normalizeWordArtTransform(transform) {
	const value = String(transform || '').trim()
	if (WORDART_TRANSFORM_ALIASES[value]) return WORDART_TRANSFORM_ALIASES[value]
	if (WORDART_TRANSFORM_SET.has(value)) return value
	return null
}

export function isValidWordArtTransform(transform) {
	return WORDART_TRANSFORM_SET.has(String(transform || '').trim())
}

export function normalizeWordArtOptions(value, path = 'wordArt') {
	if (value == null) return null
	assertPlainObject(value, path)
	assertKnownKeys(value, path)
	const transform = normalizeWordArtTransform(value.transform)
	if (!transform) throw new Error(`${path}.transform must be one of the canonical WordArt transforms.`)
	const out = { transform }
	if (Object.prototype.hasOwnProperty.call(value, 'adjustments')) {
		const adjustments = normalizeAdjustments(value.adjustments, transform, path)
		if (adjustments !== null) out.adjustments = adjustments
	}
	return out
}

export function normalizeWordArtPatch(value, path = 'wordArt', currentTransform = null) {
	if (value == null) return null
	assertPlainObject(value, path)
	assertKnownKeys(value, path)
	const out = {}
	let transform = normalizeWordArtTransform(currentTransform)
	if (Object.prototype.hasOwnProperty.call(value, 'transform')) {
		transform = normalizeWordArtTransform(value.transform)
		if (!transform) throw new Error(`${path}.transform must be one of the canonical WordArt transforms.`)
		out.transform = transform
	}
	if (Object.prototype.hasOwnProperty.call(value, 'adjustments')) {
		out.adjustments = normalizeAdjustments(value.adjustments, transform, path)
		if (out.adjustments?.length && !transform) throw new Error(`${path}.adjustments requires a transform in the patch or an existing WordArt transform on the target object.`)
	}
	return out
}

export function wordArtTransformCapabilityContractForEntry(entry = {}) {
	const value = String(entry.selection?.executableValue || entry.label || '').trim()
	const expectedRowId = WORDART_TRANSFORM_ROW_ID_BY_VALUE[value]
	if (!expectedRowId || entry.id !== expectedRowId || entry.sourceKind !== 'capability-row') return null
	const guideCapable = WORDART_ADJUSTMENT_TRANSFORM_SET.has(value)
	return Object.freeze({
		capabilityMode: guideCapable ? 'parameterized' : 'discrete',
		capabilityStatus: WORDART_TRANSFORM_CONTRACT.capabilityStatus,
		componentOwnership: guideCapable ? WORDART_TRANSFORM_CONTRACT.componentOwnership : Object.freeze(['wordArt.transform']),
		overrideFields: guideCapable ? WORDART_TRANSFORM_CONTRACT.overrideFields : Object.freeze(['options.wordArt.transform']),
		resetBehavior: WORDART_TRANSFORM_CONTRACT.resetBehavior,
		precedence: WORDART_TRANSFORM_CONTRACT.precedence,
		legalCombinations: WORDART_TRANSFORM_CONTRACT.legalCombinations,
	})
}
