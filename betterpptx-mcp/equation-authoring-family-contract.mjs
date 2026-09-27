import { EQUATION_GALLERY_PRESETS } from './source-api-gallery-presets.mjs'

// Equations are a native Office Math carrier.  This contract intentionally
// keeps the public surface semantic: callers can choose a source format,
// bounded template nodes, and an optional caller-owned fallback image, but can
// never inject package/XML implementation details.
export const EQUATION_AUTHORING_UNIT_ID = 'impl-c-746bedb030485c4f'
export const EQUATION_AUTHORING_SCHEMA_VERSION = 'betterpptx.equation-authoring-family.v1'
export const EQUATION_AUTHORING_STATE_SCHEMA_VERSION = 'betterpptx.equation-authoring-state.v1'
export const EQUATION_SOURCE_FORMATS = Object.freeze(['plain', 'unicodeMath', 'omml', 'template'])
export const EQUATION_DISPLAY_MODES = Object.freeze(['professional', 'linear'])
export const EQUATION_SELECTOR_FIELDS = Object.freeze(['equationGalleryPresetId', 'equationPresetId'])
export const EQUATION_TEMPLATE_KINDS = Object.freeze([
	'text', 'row', 'group', 'fraction', 'frac', 'superscript', 'sup', 'subscript', 'sub', 'subsup',
	'presubsup', 'preSubSup', 'radical', 'sqrt', 'nary', 'summation', 'sum', 'integral', 'operator',
	'bracket', 'delimiter', 'cases', 'eqArr', 'function', 'func', 'log', 'accent', 'bar', 'overbar',
	'underbar', 'box', 'boxed', 'limit', 'limlow', 'limitUpper', 'limupp', 'groupChar', 'groupchr', 'matrix',
])
export const EQUATION_AUTHORING_LIMITS = Object.freeze({ maxTextLength: 65536, maxOmmlLength: 2 * 1024 * 1024, maxDepth: 32, maxArrayItems: 4096, maxMatrixRows: 256, maxMatrixColumns: 256 })
export const EQUATION_PRESET_IDS = Object.freeze(EQUATION_GALLERY_PRESETS.map(item => item.id))

const TEMPLATE_KEYS = new Set([
	'kind', 'text', 'value', 'items', 'children', 'base', 'expression', 'numerator', 'denominator', 'fractionType',
	'num', 'den', 'exponent', 'sup', 'subscript', 'sub', 'degree', 'radicand', 'lower', 'upper', 'body', 'left', 'right',
	'separator', 'functionName', 'name', 'accentChar', 'position', 'groupChar', 'verticalJustification', 'limitLocation',
	'hideSub', 'hideSup', 'grow', 'italic', 'rows', 'cells', 'symbol', 'slots',
])
const DIRECT_KEYS = new Set([
	'source', 'sourceFormat', 'display', 'align', 'lang', 'fontFace', 'fontSize', 'color', 'italic', 'x', 'y', 'w', 'h',
	'objectName', 'editHandle', 'rotate', 'rotation', 'flipH', 'flipV', 'altText', 'accessibilityTitle', 'isDecorative',
	'fallback', 'equationGalleryPresetId', 'equationPresetId', 'parameters', 'semanticSlots', 'slots', 'animation', 'spid',
])
const DIRECT_ADD_KEYS = new Set(['deckId', 'slideIndex', 'options', ...DIRECT_KEYS])
const DIRECT_UPDATE_KEYS = new Set(['deckId', 'slideIndex', 'target', 'patch', ...DIRECT_KEYS, 'optionsPatch'])
const PRIVATE_KEY = /^(?:_|.*(?:xml|package|filesystem|filePath|sourcePath|raw).*)$/i
const OMML_ROOT = /<(?:[A-Za-z_][\w.-]*:)?(?:oMath|oMathPara)(?:\s|>)/i
const OMML_NAMESPACE = /(?:xmlns(?::[A-Za-z_][\w.-]*)?\s*=\s*["']http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/math["'])|(?:<m:(?:oMath|oMathPara)\b)/i

function clone(value) { return value === undefined ? undefined : structuredClone(value) }
function plainObject(value, path) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
}
function rejectUnknown(value, allowed, path) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return
	for (const key of Object.keys(value)) {
		if (PRIVATE_KEY.test(key)) throw new Error(`${path}.${key} is private and cannot be authored.`)
		if (!allowed.has(key)) throw new Error(`${path}.${key} is not part of the public equation contract.`)
	}
}
function text(value, path, { allowEmpty = true, max = EQUATION_AUTHORING_LIMITS.maxTextLength } = {}) {
	if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) throw new Error(`${path} must be a ${allowEmpty ? '' : 'non-empty '}string of at most ${max} characters.`)
	return value
}
function finite(value, path, min = -Infinity, max = Infinity) {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${path} must be a finite number between ${min} and ${max}.`)
	return value
}
function normalizeTemplate(value, path, depth = 0) {
	if (typeof value === 'string') return text(value, path)
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be a string or template object.`)
	if (depth > EQUATION_AUTHORING_LIMITS.maxDepth) throw new Error(`${path} exceeds equation nesting depth ${EQUATION_AUTHORING_LIMITS.maxDepth}.`)
	rejectUnknown(value, TEMPLATE_KEYS, path)
	const out = clone(value)
	if (out.kind !== undefined && !EQUATION_TEMPLATE_KINDS.includes(String(out.kind))) throw new Error(`${path}.kind is not a supported equation template kind.`)
	for (const key of ['text', 'value', 'left', 'right', 'separator', 'accentChar', 'groupChar', 'name', 'symbol']) if (out[key] !== undefined && out[key] !== null) text(out[key], `${path}.${key}`)
	if (out.fractionType !== undefined && !['bar', 'skw', 'lin', 'noBar'].includes(out.fractionType)) throw new Error(`${path}.fractionType is unsupported.`)
	for (const key of ['position']) if (out[key] !== undefined && !['top', 'bottom'].includes(out[key])) throw new Error(`${path}.${key} must be top or bottom.`)
	for (const key of ['limitLocation']) if (out[key] !== undefined && !['undOvr', 'subSup'].includes(out[key])) throw new Error(`${path}.${key} is unsupported.`)
	for (const key of ['hideSub', 'hideSup', 'grow', 'italic']) if (out[key] !== undefined && typeof out[key] !== 'boolean') throw new Error(`${path}.${key} must be boolean.`)
	for (const key of ['base', 'expression', 'numerator', 'denominator', 'num', 'den', 'exponent', 'sup', 'subscript', 'sub', 'degree', 'radicand', 'lower', 'upper', 'body', 'functionName']) {
		if (out[key] !== undefined && out[key] !== null) out[key] = normalizeTemplate(out[key], `${path}.${key}`, depth + 1)
	}
	for (const key of ['items', 'children']) if (out[key] !== undefined && out[key] !== null) {
		if (!Array.isArray(out[key]) || out[key].length > EQUATION_AUTHORING_LIMITS.maxArrayItems) throw new Error(`${path}.${key} must contain at most ${EQUATION_AUTHORING_LIMITS.maxArrayItems} items.`)
		out[key] = out[key].map((item, index) => normalizeTemplate(item, `${path}.${key}[${index}]`, depth + 1))
	}
	for (const key of ['rows', 'cells']) if (out[key] !== undefined && out[key] !== null) {
		if (!Array.isArray(out[key]) || out[key].length > EQUATION_AUTHORING_LIMITS.maxMatrixRows) throw new Error(`${path}.${key} must contain at most ${EQUATION_AUTHORING_LIMITS.maxMatrixRows} rows.`)
		out[key] = out[key].map((row, rowIndex) => {
			if (!Array.isArray(row) || row.length > EQUATION_AUTHORING_LIMITS.maxMatrixColumns) throw new Error(`${path}.${key}[${rowIndex}] must be a bounded row.`)
			return row.map((item, columnIndex) => normalizeTemplate(item, `${path}.${key}[${rowIndex}][${columnIndex}]`, depth + 1))
		})
	}
	if (out.slots !== undefined && out.slots !== null) {
		plainObject(out.slots, `${path}.slots`)
		out.slots = Object.fromEntries(Object.entries(out.slots).map(([key, item]) => [text(key, `${path}.slots key`, { allowEmpty: false, max: 256 }), normalizeTemplate(item, `${path}.slots.${key}`, depth + 1)]))
	}
	return out
}
function normalizeSource(source, sourceFormat, path) {
	const format = sourceFormat || (typeof source === 'object' ? 'template' : 'unicodeMath')
	if (!EQUATION_SOURCE_FORMATS.includes(format)) throw new Error(`${path}.sourceFormat must be one of ${EQUATION_SOURCE_FORMATS.join(', ')}.`)
	if (source === undefined || source === null) throw new Error(`${path}.source is required and cannot be null.`)
	if (format === 'template') return { source: normalizeTemplate(source, `${path}.source`), sourceFormat: format }
	if (typeof source !== 'string') throw new Error(`${path}.source must be a string for sourceFormat ${format}.`)
	if (!source.trim()) throw new Error(`${path}.source must be non-empty.`)
	if (format === 'omml') {
		if (source.length > EQUATION_AUTHORING_LIMITS.maxOmmlLength || !OMML_ROOT.test(source) || !OMML_NAMESPACE.test(source)) throw new Error(`${path}.source must be bounded Office Math markup with the Office Math namespace.`)
	}
	return { source, sourceFormat: format }
}
function normalizeFallback(value, path) {
	if (value === undefined || value === false || value === null) return value
	if (value === true) throw new Error(`${path} must be false, null, or a caller-supplied image object.`)
	plainObject(value, path)
	rejectUnknown(value, new Set(['path', 'data', 'rendered']), path)
	if ((value.path === undefined || value.path === null || value.path === '') && (value.data === undefined || value.data === null || value.data === '')) throw new Error(`${path} requires path or data.`)
	if (value.path !== undefined && value.path !== null) text(value.path, `${path}.path`, { allowEmpty: false, max: 4096 })
	if (value.data !== undefined && value.data !== null) {
		text(value.data, `${path}.data`, { allowEmpty: false, max: 32 * 1024 * 1024 })
		if (!/^data:image\/(?:png|jpeg|jpg|gif|bmp|webp);base64,[A-Za-z0-9+/]+=*$/i.test(value.data)) throw new Error(`${path}.data must be a base64 image data URL.`)
	}
	if (value.rendered !== undefined && typeof value.rendered !== 'boolean') throw new Error(`${path}.rendered must be boolean.`)
	return clone(value)
}
function normalizeParameters(value, path) {
	if (value === undefined || value === null) return value
	plainObject(value, path)
	if (Object.keys(value).length > 128) throw new Error(`${path} contains too many semantic slots.`)
	return Object.fromEntries(Object.entries(value).map(([key, item]) => {
		if (!/^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(key)) throw new Error(`${path}.${key} is not a valid semantic slot.`)
		return [key, typeof item === 'object' && item !== null ? normalizeTemplate(item, `${path}.${key}`) : text(String(item), `${path}.${key}`)]
	}))
}

export const EQUATION_PUBLIC_SCHEMA = Object.freeze({
	type: 'object', additionalProperties: false,
	properties: {
		kind: { type: 'string', enum: ['equation'] }, name: { type: 'string', minLength: 1, maxLength: 256 },
		source: { oneOf: [{ type: 'string', minLength: 1, maxLength: EQUATION_AUTHORING_LIMITS.maxOmmlLength }, { type: 'object' }] },
		sourceFormat: { type: 'string', enum: [...EQUATION_SOURCE_FORMATS] }, display: { type: ['string', 'null'], enum: [...EQUATION_DISPLAY_MODES, null] },
		equationGalleryPresetId: { type: ['string', 'null'], minLength: 1, maxLength: 256 }, equationPresetId: { type: ['string', 'null'], minLength: 1, maxLength: 256 },
		parameters: { type: ['object', 'null'], additionalProperties: true }, semanticSlots: { type: ['object', 'null'], additionalProperties: true }, slots: { type: ['object', 'null'], additionalProperties: true },
		align: { type: ['string', 'null'], enum: ['left', 'center', 'right', 'justify', null] }, lang: { type: ['string', 'null'], minLength: 1, maxLength: 128 },
		fontFace: { type: ['string', 'null'], minLength: 1, maxLength: 4096 }, fontSize: { type: ['number', 'null'], exclusiveMinimum: 0, maximum: 400 }, color: { type: ['string', 'null'], minLength: 1, maxLength: 128 }, italic: { type: ['boolean', 'null'] },
		x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number', exclusiveMinimum: 0 }, h: { type: 'number', exclusiveMinimum: 0 }, rotate: { type: 'number' }, rotation: { type: 'number' }, flipH: { type: 'boolean' }, flipV: { type: 'boolean' },
		objectName: { type: ['string', 'null'], minLength: 1, maxLength: 256 }, editHandle: { type: ['string', 'null'], minLength: 1, maxLength: 256 }, altText: { type: ['string', 'null'], maxLength: 4096 }, accessibilityTitle: { type: ['string', 'null'], maxLength: 4096 }, isDecorative: { type: ['boolean', 'null'] },
		fallback: { oneOf: [{ type: 'boolean' }, { type: 'null' }, { type: 'object' }] },
	},
})

export function normalizeEquationOptions(value, path = 'equation', { allowPatch = false } = {}) {
	plainObject(value, path)
	rejectUnknown(value, DIRECT_KEYS, path)
	const out = clone(value)
	if (Object.prototype.hasOwnProperty.call(out, 'source') && out.source === null) throw new Error(`${path}.source is required and cannot be null.`)
	const selector = out.equationGalleryPresetId ?? out.equationPresetId
	if (out.equationGalleryPresetId !== undefined && out.equationPresetId !== undefined && out.equationGalleryPresetId !== out.equationPresetId) throw new Error(`${path} equation preset aliases disagree.`)
	if (selector !== undefined && selector !== null && !EQUATION_PRESET_IDS.includes(String(selector))) throw new Error(`${path}.equationGalleryPresetId is not an exact equation catalog id.`)
	const parameterValue = out.parameters ?? out.semanticSlots ?? out.slots
	if (out.parameters !== undefined && out.semanticSlots !== undefined && JSON.stringify(out.parameters) !== JSON.stringify(out.semanticSlots)) throw new Error(`${path}.parameters and semanticSlots disagree.`)
	if (out.parameters !== undefined && out.slots !== undefined && JSON.stringify(out.parameters) !== JSON.stringify(out.slots)) throw new Error(`${path}.parameters and slots disagree.`)
	if (parameterValue !== undefined) out.parameters = normalizeParameters(parameterValue, `${path}.parameters`)
	if (out.source !== undefined && out.source !== null) Object.assign(out, normalizeSource(out.source, out.sourceFormat, path))
	else if (!allowPatch && (selector === undefined || selector === null)) throw new Error(`${path}.source is required unless an exact equation preset is selected.`)
	if (out.sourceFormat !== undefined && !EQUATION_SOURCE_FORMATS.includes(out.sourceFormat)) throw new Error(`${path}.sourceFormat is unsupported.`)
	if (out.display !== undefined && out.display !== null && !EQUATION_DISPLAY_MODES.includes(out.display)) throw new Error(`${path}.display is unsupported.`)
	if (out.align !== undefined && out.align !== null && !['left', 'center', 'right', 'justify'].includes(out.align)) throw new Error(`${path}.align is unsupported.`)
	for (const key of ['fontFace', 'lang', 'objectName', 'editHandle', 'altText', 'accessibilityTitle']) if (out[key] !== undefined && out[key] !== null) text(out[key], `${path}.${key}`, { allowEmpty: false, max: key === 'altText' || key === 'accessibilityTitle' ? 4096 : 4096 })
	if (out.fontSize !== undefined && out.fontSize !== null) finite(out.fontSize, `${path}.fontSize`, 0.1, 400)
	for (const key of ['x', 'y', 'w', 'h', 'rotate', 'rotation']) if (out[key] !== undefined && out[key] !== null) finite(out[key], `${path}.${key}`, key === 'w' || key === 'h' ? 0.0001 : -100000, 100000)
	for (const key of ['flipH', 'flipV', 'italic', 'isDecorative']) if (out[key] !== undefined && out[key] !== null && typeof out[key] !== 'boolean') throw new Error(`${path}.${key} must be boolean.`)
	if (out.color !== undefined && out.color !== null) text(out.color, `${path}.color`, { allowEmpty: false, max: 128 })
	if (out.fallback !== undefined) out.fallback = normalizeFallback(out.fallback, `${path}.fallback`)
	return out
}

export function validateEquationBlock(value, path = 'content') {
	if (!value || typeof value !== 'object' || Array.isArray(value) || value.kind !== 'equation') return value
	const candidate = Object.fromEntries([...DIRECT_KEYS].filter(key => Object.prototype.hasOwnProperty.call(value, key)).map(key => [key, value[key]]))
	if (value.name !== undefined && candidate.objectName === undefined) candidate.objectName = value.name
	// Preserve the established Deck Spec aliases while validating them through
	// the canonical public equation contract. The layout compiler still owns
	// lowering these aliases; this boundary only normalizes their meaning.
	if (candidate.source === undefined) {
		if (value.unicodeMath !== undefined) {
			candidate.source = value.unicodeMath
			candidate.sourceFormat ??= 'unicodeMath'
		} else if (value.omml !== undefined) {
			candidate.source = value.omml
			candidate.sourceFormat ??= 'omml'
		} else if (value.equation !== undefined) {
			candidate.source = value.equation
		} else if (value.text !== undefined) {
			candidate.source = value.text
		}
	}
	const normalized = normalizeEquationOptions(candidate, path)
	for (const key of Object.keys(normalized)) if (Object.prototype.hasOwnProperty.call(value, key)) value[key] = normalized[key]
	return value
}
export function validateDirectEquationAdd(value, path = 'slide.add_equation') {
	plainObject(value, path); rejectUnknown(value, DIRECT_ADD_KEYS, path)
	if (value.options !== undefined) normalizeEquationOptions(value.options, `${path}.options`)
	const direct = Object.fromEntries([...DIRECT_KEYS].filter(key => value[key] !== undefined).map(key => [key, value[key]]))
	return normalizeEquationOptions({ ...direct, ...(value.options || {}) }, path)
}
export function validateDirectEquationUpdate(value, path = 'slide.update_equation') {
	plainObject(value, path); rejectUnknown(value, DIRECT_UPDATE_KEYS, path)
	if (value.patch !== undefined) normalizeEquationOptions(value.patch, `${path}.patch`, { allowPatch: true })
	if (value.optionsPatch !== undefined && value.optionsPatch !== null) normalizeEquationOptions(value.optionsPatch, `${path}.optionsPatch`, { allowPatch: true })
	const fields = Object.fromEntries([...DIRECT_KEYS].filter(key => value[key] !== undefined).map(key => [key, value[key]]))
	if (Object.keys(fields).length) normalizeEquationOptions(fields, path, { allowPatch: true })
	return clone(value)
}

export function authoredEquationState(options = {}) {
	const normalized = normalizeEquationOptions(options, 'equation state')
	return Object.freeze({ schemaVersion: EQUATION_AUTHORING_STATE_SCHEMA_VERSION, options: clone(normalized) })
}

export const EQUATION_AUTHORING_RUNTIME_READY = true
export const EQUATION_AUTHORING_FAMILY_CONTRACT = Object.freeze({
	id: EQUATION_AUTHORING_UNIT_ID, schemaVersion: EQUATION_AUTHORING_SCHEMA_VERSION, capabilityMode: 'discrete', capabilityStatus: 'executable-exact-structured', runtimeReady: EQUATION_AUTHORING_RUNTIME_READY,
	componentOwnership: Object.freeze(['equationStructure', 'equationTypography', 'equationGeometry', 'equationFallback', 'equationAccessibility', 'equationSourceReadback']),
	overrideFields: Object.freeze(['source', 'sourceFormat', 'semanticSlots', 'display', 'align', 'lang', 'fontFace', 'fontSize', 'color', 'fallback', 'geometry', 'accessibility']),
	resetBehavior: Object.freeze({ component: 'set one owned equation field to null to remove that authored override while preserving source and geometry', full: 'replace the source or remove the equation block; fallback media is rebuilt atomically', nullBehavior: 'null removes only the named owned override; omission preserves the current authored value; source:null is rejected' }),
	precedence: Object.freeze(['exact equation gallery preset selects the semantic source base', 'explicit semanticSlots/parameters fill only declared preset slots', 'explicit source/sourceFormat wins over a preset only when the preset has been resolved by the compiler', 'typography, geometry, accessibility, and fallback are last-wins explicit overrides']),
	legalCombinations: Object.freeze(['plain or unicodeMath string source with native editable Office Math carrier', 'template source with bounded semantic nodes and recursive slots', 'exact equation gallery preset with declared parameters', 'bounded OMML source with namespace-gated exact preservation', 'native equation with or without caller-supplied fallback image', 'fallback replacement, null reset, and source replacement as atomic edits']),
	publicSchema: EQUATION_PUBLIC_SCHEMA,
})
export function equationAuthoringCapabilityContractForEntry(entry = {}) {
	if (entry.family !== 'equations' || !EQUATION_AUTHORING_RUNTIME_READY) return null
	return { ...EQUATION_AUTHORING_FAMILY_CONTRACT, capabilityMode: entry.selection?.executableId || entry.selection?.executableValue ? 'preset-plus-parameters' : 'discrete', applicability: entry.coverageMode || 'native editable Office Math authoring and bounded exact OMML preservation' }
}
