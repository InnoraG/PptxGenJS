// Generated public composition contract for the 42 native connector ribbon
// tiles. The public truth is typed theme metadata plus sparse line defaults;
// raw DrawingML fragments remain an internal serializer compatibility carrier.

import {
	SHAPE_LINE_SCHEMA,
	validateShapeFormattingInput,
} from './native-formatting-contract.mjs'
import { NATIVE_VISUAL_SURFACES } from './ir/native-visual-primitives.mjs'
import { CONNECTOR_STYLE_PRESETS } from './source-api-gallery-presets.mjs'

export const CONNECTOR_STYLE_RUNTIME_INTEGRATION_COMPLETE = true
export const CONNECTOR_STYLE_STATE_VERSION = 'betterpptx.connector-style-state.v1'

export const CONNECTOR_STYLE_ROW_RECORDS = Object.freeze([
	['cap_f7954e8f57ad8edc95c1', 'connector-ribbon-001', 'Subtle Line - Dark 1'],
	['cap_2e205996a3d313af4a2c', 'connector-ribbon-002', 'Subtle Line - Accent 1'],
	['cap_e7060f34d23b1def6b89', 'connector-ribbon-003', 'Subtle Line - Accent 2'],
	['cap_4bc1059ae2d6a8730afc', 'connector-ribbon-004', 'Subtle Line - Accent 3'],
	['cap_96b4732097ac7ceb3b63', 'connector-ribbon-005', 'Subtle Line - Accent 4'],
	['cap_fb1f0acc3d387e504889', 'connector-ribbon-006', 'Subtle Line - Accent 5'],
	['cap_7311302ce8bd188724e5', 'connector-ribbon-007', 'Subtle Line - Accent 6'],
	['cap_daa92f9f63214cd1b24a', 'connector-ribbon-008', 'Moderate Line - Dark 1'],
	['cap_d451c919650075a41ab5', 'connector-ribbon-009', 'Moderate Line - Accent 1'],
	['cap_37e8a208c010fb4f47e5', 'connector-ribbon-010', 'Moderate Line - Accent 2'],
	['cap_8f60aa09d6e2dcbf7679', 'connector-ribbon-011', 'Moderate Line - Accent 3'],
	['cap_bb7ce730615bb2e6051c', 'connector-ribbon-012', 'Moderate Line - Accent 4'],
	['cap_6a81fc69c683bbc00de7', 'connector-ribbon-013', 'Moderate Line - Accent 5'],
	['cap_c9f7758c9e0faddd277e', 'connector-ribbon-014', 'Moderate Line - Accent 6'],
	['cap_928bb2a1a56e51d97f96', 'connector-ribbon-015', 'Intense Line - Dark 1'],
	['cap_4a4f4bd2b91853f60a48', 'connector-ribbon-016', 'Intense Line - Accent 1'],
	['cap_7899922e306984106c7a', 'connector-ribbon-017', 'Intense Line - Accent 2'],
	['cap_ff0b5fe3bffecff0490f', 'connector-ribbon-018', 'Intense Line - Accent 3'],
	['cap_f299bc29be94bd29a2a9', 'connector-ribbon-019', 'Intense Line - Accent 4'],
	['cap_dee53980cb1a95299381', 'connector-ribbon-020', 'Intense Line - Accent 5'],
	['cap_372857961708241c5278', 'connector-ribbon-021', 'Intense Line - Accent 6'],
	['cap_d4d95c9e7c186ecaa85c', 'connector-ribbon-022', 'Dash - Dark 1'],
	['cap_86edf3b2b397c1356368', 'connector-ribbon-023', 'Dash - Accent 1'],
	['cap_a17565215f5a07242799', 'connector-ribbon-024', 'Dash - Accent 2'],
	['cap_53f4e07d4866f662cf81', 'connector-ribbon-025', 'Dash - Accent 3'],
	['cap_0ad529f6d7c58e792c1f', 'connector-ribbon-026', 'Dash - Accent 4'],
	['cap_b0f6823930fd02c0d408', 'connector-ribbon-027', 'Dash - Accent 5'],
	['cap_f52982b893a78b0b17b9', 'connector-ribbon-028', 'Dash - Accent 6'],
	['cap_922c477bc99415dffac8', 'connector-ribbon-029', 'Single Arrow - Dark 1'],
	['cap_a069a3417772f2fa11e6', 'connector-ribbon-030', 'Single Arrow - Accent 1'],
	['cap_92c8e64640ae08e3b200', 'connector-ribbon-031', 'Single Arrow - Accent 2'],
	['cap_7194869e4ee23859d1a3', 'connector-ribbon-032', 'Single Arrow - Accent 3'],
	['cap_e6881ecd034d2cff134d', 'connector-ribbon-033', 'Single Arrow - Accent 4'],
	['cap_6fefc30e02280774147d', 'connector-ribbon-034', 'Single Arrow - Accent 5'],
	['cap_a85e5a6915ee9426f365', 'connector-ribbon-035', 'Single Arrow - Accent 6'],
	['cap_b019470eb6e91f613497', 'connector-ribbon-036', 'Double Arrow - Dark 1'],
	['cap_5366cc069e49643dbf19', 'connector-ribbon-037', 'Double Arrow - Accent 1'],
	['cap_d601b740e4ced75234df', 'connector-ribbon-038', 'Double Arrow - Accent 2'],
	['cap_73853668ed8b8eb698bb', 'connector-ribbon-039', 'Double Arrow - Accent 3'],
	['cap_e4df55a1a4c4da8af8c2', 'connector-ribbon-040', 'Double Arrow - Accent 4'],
	['cap_94d92f5ed2bd0febad97', 'connector-ribbon-041', 'Double Arrow - Accent 5'],
	['cap_03dcee3316a492f9179e', 'connector-ribbon-042', 'Double Arrow - Accent 6'],
].map(([rowId, presetId, label]) => Object.freeze({ rowId, presetId, label })))

export const CONNECTOR_STYLE_ROW_IDS = Object.freeze(CONNECTOR_STYLE_ROW_RECORDS.map(record => record.rowId))
export const CONNECTOR_STYLE_PRESET_IDS = Object.freeze(CONNECTOR_STYLE_ROW_RECORDS.map(record => record.presetId))
export const CONNECTOR_STYLE_ROW_BY_ID = Object.freeze(Object.fromEntries(CONNECTOR_STYLE_ROW_RECORDS.map(record => [record.rowId, record])))

const CONNECTOR_STYLE_PRESET_BY_ID = Object.freeze(Object.fromEntries(CONNECTOR_STYLE_PRESETS.map(preset => [preset.id, preset])))
const LINE_SURFACE = NATIVE_VISUAL_SURFACES.find(surface => surface.id === 'line')
if (!LINE_SURFACE || LINE_SURFACE.capabilityStatus !== 'executable-exact-structured') throw new Error('connector style contract requires the exact shared native line surface.')

export const CONNECTOR_STYLE_COMPONENT_OWNERSHIP = Object.freeze(['connectorThemeStyle', 'line', 'arrows'])
export const CONNECTOR_STYLE_OVERRIDE_FIELDS = Object.freeze([
	'line.type',
	'line.color',
	'line.widthPt',
	'line.transparency',
	'line.dash',
	'line.beginArrowType',
	'line.endArrowType',
	'line.beginArrowWidth',
	'line.beginArrowLength',
	'line.endArrowWidth',
	'line.endArrowLength',
])

export const CONNECTOR_STYLE_OVERRIDE_CARRIERS = Object.freeze({
	'line.type': 'line.type',
	'line.color': 'line.color',
	'line.widthPt': 'line.width',
	'line.transparency': 'line.transparency',
	'line.dash': 'line.dashType',
	'line.beginArrowType': 'line.beginArrowType',
	'line.beginArrowWidth': 'line.beginArrowWidth',
	'line.beginArrowLength': 'line.beginArrowLength',
	'line.endArrowType': 'line.endArrowType',
	'line.endArrowWidth': 'line.endArrowWidth',
	'line.endArrowLength': 'line.endArrowLength',
})

export const CONNECTOR_STYLE_SELECTOR_SCHEMA = Object.freeze({
	oneOf: [
		{ type: 'null' },
		{ type: 'string', enum: [...CONNECTOR_STYLE_PRESET_IDS] },
	],
})

const sourceLineSchema = SHAPE_LINE_SCHEMA.oneOf.find(branch => branch.type === 'object')
export const CONNECTOR_STYLE_LINE_SCHEMA = Object.freeze({
	oneOf: [
		{ type: 'null' },
		{
			...sourceLineSchema,
			properties: {
				...sourceLineSchema.properties,
				width: { ...sourceLineSchema.properties.width, multipleOf: 1 / 12700 },
			},
		},
	],
})

export const CONNECTOR_STYLE_THEME_SCHEMA = Object.freeze({
	type: 'object',
	required: ['lineRef', 'fillRef', 'effectRef', 'fontRef'],
	additionalProperties: false,
	properties: {
		lineRef: { type: 'object', required: ['index', 'color'], additionalProperties: false, properties: { index: { type: 'integer', minimum: 0, maximum: 3 }, color: { type: 'object' } } },
		fillRef: { type: 'object', required: ['index', 'color'], additionalProperties: false, properties: { index: { type: 'integer', minimum: 0, maximum: 3 }, color: { type: 'object' } } },
		effectRef: { type: 'object', required: ['index', 'color'], additionalProperties: false, properties: { index: { type: 'integer', minimum: 0, maximum: 3 }, color: { type: 'object' } } },
		fontRef: { type: 'object', required: ['role', 'color'], additionalProperties: false, properties: { role: { type: 'string', enum: ['major', 'minor'] }, color: { type: 'object' } } },
	},
})

export const CONNECTOR_STYLE_FORMATTING_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	properties: {
		connectorStylePresetId: CONNECTOR_STYLE_SELECTOR_SCHEMA,
		line: CONNECTOR_STYLE_LINE_SCHEMA,
	},
})

export const CONNECTOR_STYLE_PARAMETERS = Object.freeze([
	Object.freeze({
		id: 'connectorStylePresetId',
		type: 'discrete',
		valueType: 'enum',
		values: CONNECTOR_STYLE_PRESET_IDS,
		semanticPath: 'content[].connectorStylePresetId',
		reset: 'set connectorStylePresetId to null to remove the selected gallery base while retaining explicit line overrides',
		capabilityMode: 'preset-plus-parameters',
		capabilityStatus: CONNECTOR_STYLE_RUNTIME_INTEGRATION_COMPLETE ? 'executable-exact-structured' : 'structured-partial',
	}),
	...LINE_SURFACE.parameters.map(parameter => Object.freeze({ ...parameter, applicability: ['connector'] })),
])

export const CONNECTOR_STYLE_PUBLIC_PRESETS = Object.freeze(CONNECTOR_STYLE_PRESETS.map(preset => Object.freeze({
	id: preset.id,
	label: preset.label,
	tileIndex: preset.tileIndex,
	description: preset.description,
})))

export const CONNECTOR_STYLE_RUNTIME_GAPS = Object.freeze({
	missingFields: Object.freeze([
		'add_connector connectorStylePresetId enum/null projection',
		'add_connector typed line schema projection',
		'authored line override provenance distinct from compiler fallback line',
		'connectorStylePresetId plus explicit line override readback state',
	]),
	missingContexts: Object.freeze([
		'direct add_connector top-level and options forms',
		'deck-spec connector authoring and patch compilation',
		'update_shape against a native connector',
		'current-spec export/readback and opened-deck semantic recovery',
	]),
	missingBehaviors: Object.freeze([
		'typed line overrides must supersede sparse preset line defaults instead of being masked by the raw compatibility carrier',
		'compiler fallback line must not be mistaken for an explicit authored override',
		'per-leaf null must reveal the selected preset default; line:null must clear all explicit overrides',
		'connectorStylePresetId:null must remove the gallery base without deleting explicit line overrides',
		'update/readback must retain the selector and authored/effective line distinction',
	]),
	missingCombinations: Object.freeze([
		'all 42 selectors with every typed line/arrow override',
		'dash and arrow preset defaults with conflicting explicit dash/arrow overrides',
		'line.type:none over every preset followed by component reset and sparse re-edit',
		'selector replacement/null reset with retained explicit line overrides',
	]),
	ownerModules: Object.freeze([
		'betterpptx-mcp/source-api-gallery-presets.mjs',
		'betterpptx-mcp/ir/spec-compiler.mjs',
		'betterpptx-mcp/engine.mjs',
		'betterpptx-mcp/tools.mjs',
		'betterpptx-mcp/ir/deck-spec.v1.json',
		'src/gen-xml.ts',
	]),
	dependencies: Object.freeze([
		'exact shared native line schema/validator/serializer/readback',
		'connector gallery theme-style and sparse line-default catalog',
		'connector formatting state preserved through add, update, save, and semantic export',
	]),
	cheapChecks: Object.freeze([
		'42-row and 42-preset bijection',
		'selector enum/null valid and invalid vectors',
		'sparse line-default family checks for line, dash, single-arrow, and double-arrow treatments',
		'base/default/explicit precedence and per-leaf/full reset unit vectors',
		'compiled options distinguish generic fallback line from authored overrides',
		'serialized connector XML uses typed overrides when present and preset defaults otherwise',
		'current-spec readback returns selector plus explicit line overrides without raw payloads',
	]),
})

function clone(value) {
	return value === undefined ? undefined : structuredClone(value)
}

function isObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeConnectorStylePresetId(value, path = 'connectorStylePresetId') {
	if (value === undefined || value === null || value === '') return value === undefined ? undefined : null
	const id = String(value).trim()
	if (!CONNECTOR_STYLE_PRESET_IDS.includes(id)) throw new Error(`${path} must be one of the 42 public connector ribbon IDs.`)
	return id
}

function validateConnectorColor(value, path) {
	if (value === undefined || value === null) return
	if (typeof value === 'string') {
		if (!value.trim()) throw new Error(`${path} must be a non-empty color string.`)
		return
	}
	if (!isObject(value)) throw new Error(`${path} must be a color string or typed color object.`)
	const allowed = new Set(['color', 'scheme', 'preset', 'tint', 'shade', 'saturation', 'luminance', 'luminanceOffset', 'opacity'])
	for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${path}.${key} is not part of the public color contract.`)
}

export function normalizeConnectorLineOverrides(value, path = 'line') {
	if (value === undefined || value === null) return value
	if (!isObject(value)) throw new Error(`${path} must be an object or null.`)
	const allowed = new Set(Object.keys(sourceLineSchema.properties))
	for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${path}.${key} is not part of the public connector line contract.`)
	if (value.type !== undefined && value.type !== null && !['none', 'solid'].includes(value.type)) throw new Error(`${path}.type must be none or solid.`)
	if (value.dash !== undefined && value.dashType !== undefined && value.dash !== value.dashType) throw new Error(`${path}.dash and ${path}.dashType cannot conflict.`)
	validateConnectorColor(value.color, `${path}.color`)
	validateShapeFormattingInput({ line: value }, path.replace(/\.line$/, '') || 'connector')
	for (const [field, step] of [['width', 1 / 12700], ['transparency', 0.001]]) {
		if (value[field] === undefined || value[field] === null) continue
		const parsed = Number(value[field])
		if (Math.abs(parsed / step - Math.round(parsed / step)) > 1e-7) throw new Error(`${path}.${field} must use a ${step} step.`)
	}
	const line = clone(value)
	if (line.dashType === undefined && line.dash !== undefined) line.dashType = line.dash
	delete line.dash
	return line
}

export function normalizeConnectorStyleFormatting(value, path = 'connectorStyle') {
	if (value === undefined || value === null) return value
	if (!isObject(value)) throw new Error(`${path} must be an object or null.`)
	const allowed = new Set(['connectorStylePresetId', 'line'])
	for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${path}.${key} is not part of the public connector style contract.`)
	return {
		...(Object.hasOwn(value, 'connectorStylePresetId') ? { connectorStylePresetId: normalizeConnectorStylePresetId(value.connectorStylePresetId, `${path}.connectorStylePresetId`) } : {}),
		...(Object.hasOwn(value, 'line') ? { line: normalizeConnectorLineOverrides(value.line, `${path}.line`) } : {}),
	}
}

function patchLineOverrides(previous, patch) {
	if (patch === undefined) return clone(previous || {})
	if (patch === null) return {}
	const next = clone(previous || {})
	for (const [key, value] of Object.entries(patch)) {
		if (value === null) delete next[key]
		else next[key] = clone(value)
	}
	return next
}

export function resolveConnectorStyleComposition(input = {}, previousState = null, { mode = 'replace' } = {}) {
	const normalized = normalizeConnectorStyleFormatting(input) || {}
	const previous = previousState?.schemaVersion === CONNECTOR_STYLE_STATE_VERSION ? previousState : null
	let connectorStylePresetId = mode === 'patch' ? previous?.connectorStylePresetId ?? null : null
	let authoredLineOverrides = mode === 'patch' ? clone(previous?.authoredLineOverrides || {}) : {}
	if (Object.hasOwn(normalized, 'connectorStylePresetId')) connectorStylePresetId = normalized.connectorStylePresetId
	if (Object.hasOwn(normalized, 'line')) authoredLineOverrides = patchLineOverrides(authoredLineOverrides, normalized.line)
	const preset = connectorStylePresetId ? CONNECTOR_STYLE_PRESET_BY_ID[connectorStylePresetId] : null
	const presetLineDefaults = clone(preset?.lineDefaults || {})
	const effectiveLine = { ...presetLineDefaults, ...clone(authoredLineOverrides) }
	return Object.freeze({
		schemaVersion: CONNECTOR_STYLE_STATE_VERSION,
		connectorStylePresetId,
		themeStyle: preset?.themeStyle || null,
		presetLineDefaults: Object.freeze(presetLineDefaults),
		authoredLineOverrides: Object.freeze(authoredLineOverrides),
		effectiveLine: Object.freeze(effectiveLine),
	})
}

export function connectorStylePublicReadback(state) {
	if (!state || state.schemaVersion !== CONNECTOR_STYLE_STATE_VERSION) return null
	return Object.freeze({
		connectorStylePresetId: state.connectorStylePresetId,
		line: Object.freeze(clone(state.authoredLineOverrides || {})),
	})
}

function normalizeConnectorXmlFragment(value) {
	return String(value ?? '').trim().replace(/>\s+</g, '><')
}

export function recoverConnectorStyleState(options = {}) {
	if (options?._connectorStyleState?.schemaVersion === CONNECTOR_STYLE_STATE_VERSION) return options._connectorStyleState
	if (!Object.hasOwn(options, '_rawConnectorStyleXml') || !Object.hasOwn(options, '_rawConnectorLineXml')) return null
	const styleXml = normalizeConnectorXmlFragment(options._rawConnectorStyleXml)
	const lineXml = normalizeConnectorXmlFragment(options._rawConnectorLineXml)
	const preset = CONNECTOR_STYLE_PRESETS.find(candidate =>
		normalizeConnectorXmlFragment(candidate.recipe?._rawConnectorStyleXml) === styleXml &&
		normalizeConnectorXmlFragment(candidate.recipe?._rawConnectorLineXml) === lineXml)
	return preset ? resolveConnectorStyleComposition({ connectorStylePresetId: preset.id }) : null
}

export function buildConnectorStyleContract({ runtimeIntegrationComplete = CONNECTOR_STYLE_RUNTIME_INTEGRATION_COMPLETE } = {}) {
	return Object.freeze({
		id: 'connectorStylePreset',
		schemaVersion: 'betterpptx.connector-style-contract.v1',
		capabilityMode: 'preset-plus-parameters',
		capabilityStatus: runtimeIntegrationComplete ? 'executable-exact-structured' : 'structured-partial',
		componentOwnership: CONNECTOR_STYLE_COMPONENT_OWNERSHIP,
		overrideFields: CONNECTOR_STYLE_OVERRIDE_FIELDS,
		overrideCarriers: CONNECTOR_STYLE_OVERRIDE_CARRIERS,
		resetBehavior: Object.freeze({
			component: 'set one line leaf to null to reveal the selected preset default; set line to null to clear all explicit line overrides',
			full: 'set connectorStylePresetId to null and line to null to restore the native connector theme/default line',
			nullBehavior: 'selector null removes only the gallery base; line-leaf null removes only that explicit override and retains the selected base',
		}),
		precedence: Object.freeze(['native connector theme default', 'selected connector theme style', 'selected sparse dash/arrow defaults', 'explicit typed line overrides', 'line.type none']),
		legalCombinations: Object.freeze([
			'any of 42 selectors + connector geometry/endpoints + typed line overrides',
			'dash/single-arrow/double-arrow preset + conflicting explicit dash/arrow override',
			'line.type none + component reset + sparse re-edit',
			'selector replacement/null reset while explicit line overrides remain independently owned',
		]),
		readbackRequirements: Object.freeze([
			'return connectorStylePresetId',
			'return authored line overrides separately from preset defaults and effective line',
			'never expose raw compatibility fragments',
		]),
		publicSchema: CONNECTOR_STYLE_FORMATTING_SCHEMA,
		parameters: CONNECTOR_STYLE_PARAMETERS,
		presets: CONNECTOR_STYLE_PUBLIC_PRESETS,
		rowIds: CONNECTOR_STYLE_ROW_IDS,
		runtimeIntegrationComplete,
		completionGaps: runtimeIntegrationComplete ? Object.freeze({}) : CONNECTOR_STYLE_RUNTIME_GAPS,
		validVectors: Object.freeze([
			Object.freeze({ connectorStylePresetId: 'connector-ribbon-001' }),
			Object.freeze({ connectorStylePresetId: 'connector-ribbon-028', line: { dashType: 'dashDot', width: 2, transparency: 12.5 } }),
			Object.freeze({ connectorStylePresetId: 'connector-ribbon-036', line: { beginArrowType: null, endArrowWidth: 'lg', endArrowLength: 'sm' } }),
			Object.freeze({ connectorStylePresetId: null, line: null }),
		]),
		invalidVectors: Object.freeze([
			Object.freeze({ connectorStylePresetId: 'connector-ribbon-999' }),
			Object.freeze({ connectorStylePresetId: 'connector-ribbon-001', line: { width: -1 } }),
			Object.freeze({ connectorStylePresetId: 'connector-ribbon-001', line: { endArrowWidth: 'xl' } }),
			Object.freeze({ connectorStylePresetId: 'connector-ribbon-001', line: { dash: 'dash', dashType: 'dot' } }),
		]),
	})
}

export const CONNECTOR_STYLE_CONTRACT = buildConnectorStyleContract()

export function assertConnectorStyleContractPartition() {
	if (CONNECTOR_STYLE_ROW_RECORDS.length !== 42) throw new Error(`connector style contract must map 42 rows; received ${CONNECTOR_STYLE_ROW_RECORDS.length}.`)
	if (new Set(CONNECTOR_STYLE_ROW_IDS).size !== 42 || new Set(CONNECTOR_STYLE_PRESET_IDS).size !== 42) throw new Error('connector style row and preset IDs must be unique.')
	for (const record of CONNECTOR_STYLE_ROW_RECORDS) {
		const preset = CONNECTOR_STYLE_PRESET_BY_ID[record.presetId]
		if (!preset) throw new Error(`connector style row ${record.rowId} maps unknown preset ${record.presetId}.`)
		if (preset.label !== record.label) throw new Error(`connector style row ${record.rowId} label does not match ${record.presetId}.`)
		if (!preset.themeStyle || !preset.lineDefaults) throw new Error(`connector style preset ${record.presetId} lacks typed public base metadata.`)
	}
	return Object.freeze({ rows: 42, presets: 42, capabilityStatus: CONNECTOR_STYLE_CONTRACT.capabilityStatus, runtimeIntegrationComplete: CONNECTOR_STYLE_RUNTIME_INTEGRATION_COMPLETE })
}

export const CONNECTOR_STYLE_PARTITION_ASSERTION = assertConnectorStyleContractPartition()

export function connectorStyleCapabilityContractForEntry(entry = {}) {
	if (entry.family !== 'structural' || !CONNECTOR_STYLE_ROW_BY_ID[entry.id]) return null
	return CONNECTOR_STYLE_CONTRACT
}
