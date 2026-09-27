import { TABLE_FORMAT_PARAMETERS, validateTableCellOptions, validateTableFormatOptions } from './option-registry.mjs'

export const TABLE_AUTHORING_UNIT_ID = 'impl-c-4e199c49def769be'
export const TABLE_AUTHORING_SCHEMA_VERSION = 'betterpptx.table-authoring-family.v1'
export const TABLE_AUTHORING_STATE_SCHEMA_VERSION = 'betterpptx.table-authoring-state.v1'

export const TABLE_SEMANTIC_PRESET_IDS = Object.freeze([
	'executive-kpi-scorecard',
	'financial-variance-total',
	'roadmap-status-lanes',
	'feature-comparison-matrix',
	'risk-heatmap-matrix',
	'dark-evidence-grid',
	'clean-dense-data-grid',
	'pricing-tier-matrix',
])

export const TABLE_SELECTOR_FIELDS = Object.freeze(['tablePresetId', 'tableStylePresetId', 'tableStyleId'])

export const TABLE_AUTHORING_LIMITS = Object.freeze({
	maxRows: 1000,
	maxColumns: 256,
	maxAuthoredCells: 100000,
	maxRichTextRunsPerCell: 1000,
	maxTextLength: 1048576,
})

const PRIVATE_FIELD_PATTERN = /^_/
const HEX_OR_THEME_PATTERN = '^(?:#?[0-9A-Fa-f]{6}|(?:accent|background|text|hyperlink|followedHyperlink|dark|light)[1-6]?|tx[12]|bg[12]|dk[12]|lt[12]|hlink|folHlink)$'
const GUID_PATTERN = '^\\{?[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\\}?$'

const TABLE_OPTION_PARAMETER_IDS = Object.freeze(TABLE_FORMAT_PARAMETERS
	.filter(parameter => !String(parameter.id).startsWith('cell'))
	.map(parameter => parameter.id))

const CELL_OPTION_FIELDS = Object.freeze([
	'fill', 'border', 'margin', 'fontSize', 'fontFace', 'color', 'bold', 'italic',
	'align', 'valign', 'colspan', 'rowspan', 'autoPageCharWeight',
	'autoPageLineWeight', 'hyperlink', 'breakLine',
])

const DIRECT_TABLE_OPTION_FIELDS = Object.freeze([
	'x', 'y', 'w', 'h', 'objectName', 'altText', 'accessibilityTitle',
	'isDecorative', 'placeholder', 'phType', 'phIdx', 'phSz', 'phOrient',
	'phHasCustomPrompt', 'hasCustomPrompt', 'hasBarePh', 'animation',
	'editHandle', 'spid', 'shadow',
])

const TABLE_PANEL_FIELDS = Object.freeze([
	'kind', 'name', 'objectName', 'role', 'region', 'placeholderBinding', 'action',
	'bbox', 'rect', 'style', 'title', 'altText', 'decorative',
	'hiddenFromAccessibility', 'reorderToIndex', 'animation', 'editHandle',
	'visibleSummary', 'summary', 'preserveGeometry', 'hyperlink', 'header', 'rows',
	'tableOptions', ...TABLE_SELECTOR_FIELDS, 'dataRef', 'dataSource', 'source',
	'provenance', 'verified', 'evidenceSource', 'emphasis', 'patch', 'delete',
	'remove',
])

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function nullable(schema) {
	return { anyOf: [schema, { type: 'null' }] }
}

const boundedString = nullable({ type: 'string', maxLength: TABLE_AUTHORING_LIMITS.maxTextLength })
const shortString = nullable({ type: 'string', maxLength: 4096 })
const boundedBoolean = nullable({ type: 'boolean' })
const boundedNumber = nullable({ type: 'number', minimum: -2147483647, maximum: 2147483647 })
const colorSchema = nullable({ type: 'string', minLength: 1, maxLength: 128, pattern: HEX_OR_THEME_PATTERN })

const hyperlinkSchema = nullable({
	type: 'object',
	additionalProperties: false,
	properties: {
		url: { type: ['string', 'null'], minLength: 1, maxLength: 4096, pattern: '^(?:https://|mailto:|tel:)[^\\s]+$' },
		slide: { type: ['integer', 'null'], minimum: 1, maximum: 100000 },
		tooltip: { type: ['string', 'null'], minLength: 1, maxLength: 1024 },
		target: { type: ['string', 'null'], minLength: 1, maxLength: 255 },
	},
})

const fillSchema = nullable({
	type: 'object', additionalProperties: false,
	properties: {
		type: { type: ['string', 'null'], enum: ['none', 'solid', 'gradient', null] },
		color: colorSchema,
		transparency: { type: ['number', 'null'], minimum: 0, maximum: 100 },
		angle: { type: ['number', 'null'], minimum: 0, maximum: 360 },
		stops: {
			type: ['array', 'null'], maxItems: 32,
			items: {
				type: 'object', additionalProperties: false, required: ['pos', 'color'],
				properties: {
					pos: { type: 'number', minimum: 0, maximum: 1 },
					color: colorSchema,
					transparency: { type: ['number', 'null'], minimum: 0, maximum: 100 },
				},
			},
		},
	},
})

const borderSideSchema = nullable({
	type: 'object', additionalProperties: false,
	properties: {
		type: { type: ['string', 'null'], enum: ['none', 'solid', 'dash', 'dot', 'dashDot', 'longDash', null] },
		color: colorSchema,
		pt: { type: ['number', 'null'], minimum: 0, maximum: 1584 },
		transparency: { type: ['number', 'null'], minimum: 0, maximum: 100 },
	},
})

const borderSchema = nullable({
	oneOf: [
		borderSideSchema.anyOf[0],
		{ type: 'array', minItems: 4, maxItems: 4, items: borderSideSchema },
	],
})

const marginSchema = nullable({
	oneOf: [
		{ type: 'number', minimum: 0, maximum: 56 },
		{ type: 'array', minItems: 4, maxItems: 4, items: { type: 'number', minimum: 0, maximum: 56 } },
	],
})

const shadowSchema = nullable({
	type: 'object', additionalProperties: false,
	properties: {
		type: { type: ['string', 'null'], enum: ['none', 'outer', 'inner', null] },
		color: colorSchema,
		opacity: { type: ['number', 'null'], minimum: 0, maximum: 1 },
		blur: { type: ['number', 'null'], minimum: 0, maximum: 1000 },
		offset: { type: ['number', 'null'], minimum: 0, maximum: 1000 },
		angle: { type: ['number', 'null'], minimum: 0, maximum: 360 },
		scaleX: { type: ['number', 'null'], minimum: 0, maximum: 2 },
		scaleY: { type: ['number', 'null'], minimum: 0, maximum: 2 },
		skewX: { type: ['number', 'null'], minimum: -90, maximum: 90 },
		skewY: { type: ['number', 'null'], minimum: -90, maximum: 90 },
		rotateWithShape: boundedBoolean,
	},
})

const richTextRunOptionsSchema = Object.freeze({
	type: 'object', additionalProperties: false,
	properties: {
		fontFace: shortString,
		fontSize: { type: ['number', 'null'], exclusiveMinimum: 0, maximum: 400 },
		color: colorSchema,
		bold: boundedBoolean,
		italic: boundedBoolean,
		underline: nullable({ oneOf: [{ type: 'boolean' }, { type: 'object', additionalProperties: false, properties: { color: colorSchema, style: shortString } }] }),
		breakLine: boundedBoolean,
		hyperlink: hyperlinkSchema,
	},
})

export const TABLE_RICH_TEXT_RUN_PUBLIC_SCHEMA = Object.freeze({
	type: 'object', additionalProperties: false, required: ['text'],
	properties: {
		text: { type: ['string', 'number'], maxLength: TABLE_AUTHORING_LIMITS.maxTextLength },
		options: richTextRunOptionsSchema,
	},
})

const richTextSchema = Object.freeze({
	oneOf: [
		{ type: 'string', maxLength: TABLE_AUTHORING_LIMITS.maxTextLength },
		{ type: 'number' },
		{ type: 'boolean' },
		{ type: 'array', minItems: 1, maxItems: TABLE_AUTHORING_LIMITS.maxRichTextRunsPerCell, items: TABLE_RICH_TEXT_RUN_PUBLIC_SCHEMA },
	],
})

export const TABLE_CELL_OPTIONS_PUBLIC_SCHEMA = Object.freeze({
	type: ['object', 'null'], additionalProperties: false,
	properties: Object.freeze({
		fill: fillSchema,
		border: borderSchema,
		margin: marginSchema,
		fontSize: { type: ['number', 'null'], exclusiveMinimum: 0, maximum: 400 },
		fontFace: shortString,
		color: colorSchema,
		bold: boundedBoolean,
		italic: boundedBoolean,
		align: { type: ['string', 'null'], enum: ['left', 'center', 'right', 'justify', null] },
		valign: { type: ['string', 'null'], enum: ['top', 'middle', 'bottom', null] },
		colspan: { type: ['integer', 'null'], minimum: 1, maximum: TABLE_AUTHORING_LIMITS.maxColumns },
		rowspan: { type: ['integer', 'null'], minimum: 1, maximum: TABLE_AUTHORING_LIMITS.maxRows },
		autoPageCharWeight: { type: ['number', 'null'], minimum: -1, maximum: 1 },
		autoPageLineWeight: { type: ['number', 'null'], minimum: -1, maximum: 1 },
		hyperlink: hyperlinkSchema,
		breakLine: boundedBoolean,
	}),
})

export const TABLE_CELL_PUBLIC_SCHEMA = Object.freeze({
	oneOf: [
		richTextSchema,
		{
			type: 'object', additionalProperties: false, required: ['text'],
			properties: { text: richTextSchema, options: TABLE_CELL_OPTIONS_PUBLIC_SCHEMA },
		},
	],
})

export const TABLE_ROWS_PUBLIC_SCHEMA = Object.freeze({
	type: 'array', minItems: 1, maxItems: TABLE_AUTHORING_LIMITS.maxRows,
	items: {
		type: 'array', minItems: 0, maxItems: TABLE_AUTHORING_LIMITS.maxColumns,
		items: TABLE_CELL_PUBLIC_SCHEMA,
	},
})

function schemaForTableParameter(parameter) {
	if (parameter.id === 'fill') return fillSchema
	if (parameter.id === 'border') return borderSchema
	if (parameter.id === 'margin') return marginSchema
	if (parameter.id === 'colW' || parameter.id === 'rowH') {
		const item = { type: 'number', minimum: parameter.minimum, maximum: parameter.maximum }
		return nullable({ oneOf: [item, { type: 'array', minItems: 1, maxItems: parameter.id === 'colW' ? TABLE_AUTHORING_LIMITS.maxColumns : TABLE_AUTHORING_LIMITS.maxRows, items: item }] })
	}
	if (parameter.type === 'continuous') return { type: [parameter.valueType === 'integer' ? 'integer' : 'number', 'null'], minimum: parameter.minimum, maximum: parameter.maximum }
	if (Array.isArray(parameter.canonical)) return { type: ['string', 'null'], enum: [...parameter.canonical, null] }
	if (parameter.valueType === 'boolean') return boundedBoolean
	if (parameter.type === 'color') return colorSchema
	return shortString
}

const tableOptionProperties = Object.fromEntries(TABLE_FORMAT_PARAMETERS
	.filter(parameter => TABLE_OPTION_PARAMETER_IDS.includes(parameter.id))
	.map(parameter => [parameter.id, schemaForTableParameter(parameter)]))

Object.assign(tableOptionProperties, {
	tablePresetId: { type: ['string', 'null'], enum: [...TABLE_SEMANTIC_PRESET_IDS, null] },
	tableStylePresetId: shortString,
	tableStyleId: nullable({ type: 'string', minLength: 1, maxLength: 256, pattern: GUID_PATTERN }),
})

export const TABLE_OPTIONS_PUBLIC_SCHEMA = Object.freeze({
	type: ['object', 'null'], additionalProperties: false,
	properties: Object.freeze(tableOptionProperties),
})

export const DIRECT_TABLE_OPTIONS_PUBLIC_SCHEMA = Object.freeze({
	type: ['object', 'null'], additionalProperties: false,
	properties: Object.freeze({
		...tableOptionProperties,
		x: boundedNumber, y: boundedNumber,
		w: nullable({ oneOf: [{ type: 'number', exclusiveMinimum: 0, maximum: 56 }, { type: 'string', maxLength: 32 }] }),
		h: nullable({ oneOf: [{ type: 'number', exclusiveMinimum: 0, maximum: 56 }, { type: 'string', maxLength: 32 }] }),
		objectName: shortString, altText: boundedString, accessibilityTitle: boundedString,
		isDecorative: boundedBoolean, placeholder: shortString,
		phType: { type: ['string', 'null'], enum: ['tbl', 'obj', null] },
		phIdx: { type: ['integer', 'null'], minimum: 0, maximum: 4294967295 },
		phSz: { type: ['string', 'null'], enum: ['full', 'half', 'quarter', null] },
		phOrient: { type: ['string', 'null'], enum: ['horz', 'vert', null] },
		phHasCustomPrompt: boundedBoolean, hasCustomPrompt: boundedBoolean,
		hasBarePh: boundedBoolean, animation: { type: ['object', 'array', 'null'] },
		editHandle: shortString, shadow: shadowSchema,
		spid: { type: ['integer', 'null'], minimum: 1, maximum: 4294967295 },
	}),
})

export const TABLE_PANEL_PUBLIC_SCHEMA = Object.freeze({
	type: 'object', additionalProperties: false, required: ['kind', 'name', 'rows'],
	properties: Object.freeze({
		kind: { const: 'table-panel' },
		name: { type: 'string', minLength: 1, maxLength: 256, pattern: '^[A-Za-z0-9._:-]+$' },
		objectName: shortString, role: shortString, region: shortString,
		placeholderBinding: { type: ['object', 'string', 'boolean', 'null'] },
		action: { type: ['object', 'null'] }, bbox: { type: ['object', 'null'] },
		rect: { type: ['object', 'null'] }, style: { type: ['object', 'null'] },
		title: boundedString, altText: boundedString, decorative: boundedBoolean,
		hiddenFromAccessibility: boundedBoolean,
		reorderToIndex: { type: ['integer', 'null'], minimum: 0 },
		animation: { type: ['object', 'array', 'null'] }, editHandle: shortString,
		visibleSummary: boundedString, summary: boundedString, preserveGeometry: boundedBoolean,
		hyperlink: hyperlinkSchema,
		header: nullable({ type: 'array', minItems: 1, maxItems: TABLE_AUTHORING_LIMITS.maxColumns, items: TABLE_CELL_PUBLIC_SCHEMA }),
		rows: TABLE_ROWS_PUBLIC_SCHEMA,
		tableOptions: TABLE_OPTIONS_PUBLIC_SCHEMA,
		...Object.fromEntries(TABLE_SELECTOR_FIELDS.map(field => [field, tableOptionProperties[field]])),
		dataRef: shortString, dataSource: shortString, source: shortString,
		provenance: shortString, verified: boundedBoolean, evidenceSource: shortString,
		emphasis: shortString, patch: { type: ['object', 'null'] },
		delete: boundedBoolean, remove: boundedBoolean,
	}),
})

const targetSchema = Object.freeze({
	oneOf: [
		{ type: 'integer', minimum: 0 },
		{ type: 'string', minLength: 1, maxLength: 4096 },
		{ type: 'object', additionalProperties: false, minProperties: 1, maxProperties: 1, properties: { index: { type: 'integer', minimum: 0 }, rawIndex: { type: 'integer', minimum: 0 }, objectName: { type: 'string', minLength: 1, maxLength: 4096 } } },
	],
})

const cellEditSchema = Object.freeze({
	type: 'object', additionalProperties: false, required: ['row', 'col'],
	properties: {
		row: { type: 'integer', minimum: 0, maximum: TABLE_AUTHORING_LIMITS.maxRows - 1 },
		col: { type: 'integer', minimum: 0, maximum: TABLE_AUTHORING_LIMITS.maxColumns - 1 },
		text: richTextSchema,
		options: TABLE_CELL_OPTIONS_PUBLIC_SCHEMA,
	},
})

const rowInsertSchema = Object.freeze({
	type: 'object', additionalProperties: false,
	properties: {
		index: { type: 'integer', minimum: 0, maximum: TABLE_AUTHORING_LIMITS.maxRows },
		cells: { type: 'array', minItems: 1, maxItems: TABLE_AUTHORING_LIMITS.maxColumns, items: TABLE_CELL_PUBLIC_SCHEMA },
	},
})

const columnInsertSchema = Object.freeze({
	type: 'object', additionalProperties: false,
	properties: {
		index: { type: 'integer', minimum: 0, maximum: TABLE_AUTHORING_LIMITS.maxColumns },
		cells: { type: 'array', maxItems: TABLE_AUTHORING_LIMITS.maxRows, items: TABLE_CELL_PUBLIC_SCHEMA },
	},
})

const indexedDeleteSchema = Object.freeze({
	type: 'object', additionalProperties: false, required: ['index'],
	properties: { index: { type: 'integer', minimum: 0 } },
})

const tableOperationSchema = Object.freeze({
	oneOf: [
		{ type: 'object', additionalProperties: false, required: ['op', 'rows'], properties: { op: { const: 'replaceRows' }, rows: TABLE_ROWS_PUBLIC_SCHEMA } },
		{ type: 'object', additionalProperties: false, required: ['op'], properties: { op: { const: 'patchOptions' }, patch: DIRECT_TABLE_OPTIONS_PUBLIC_SCHEMA, options: DIRECT_TABLE_OPTIONS_PUBLIC_SCHEMA } },
		{ type: 'object', additionalProperties: false, required: ['op', 'row', 'col'], properties: { op: { enum: ['setCell', 'patchCell'] }, ...cellEditSchema.properties } },
		{ type: 'object', additionalProperties: false, required: ['op'], properties: { op: { const: 'addRow' }, ...rowInsertSchema.properties } },
		{ type: 'object', additionalProperties: false, required: ['op', 'index'], properties: { op: { const: 'deleteRow' }, ...indexedDeleteSchema.properties } },
		{ type: 'object', additionalProperties: false, required: ['op'], properties: { op: { const: 'addColumn' }, ...columnInsertSchema.properties } },
		{ type: 'object', additionalProperties: false, required: ['op', 'index'], properties: { op: { const: 'deleteColumn' }, ...indexedDeleteSchema.properties } },
	],
})

export const DIRECT_TABLE_ADD_PUBLIC_SCHEMA = Object.freeze({
	type: 'object', additionalProperties: false, required: ['deckId', 'slideIndex', 'rows'],
	properties: Object.freeze({
		deckId: { type: 'string', minLength: 1 },
		slideIndex: { type: 'integer', minimum: 0 },
		rows: TABLE_ROWS_PUBLIC_SCHEMA,
		options: DIRECT_TABLE_OPTIONS_PUBLIC_SCHEMA,
		...Object.fromEntries(TABLE_SELECTOR_FIELDS.map(field => [field, tableOptionProperties[field]])),
	}),
})

export const DIRECT_TABLE_UPDATE_PUBLIC_SCHEMA = Object.freeze({
	type: 'object', additionalProperties: false, required: ['deckId', 'slideIndex', 'target'],
	properties: Object.freeze({
		deckId: { type: 'string', minLength: 1 },
		slideIndex: { type: 'integer', minimum: 0 },
		target: targetSchema,
		rows: TABLE_ROWS_PUBLIC_SCHEMA,
		optionsPatch: DIRECT_TABLE_OPTIONS_PUBLIC_SCHEMA,
		setCell: cellEditSchema, patchCell: cellEditSchema,
		addRow: rowInsertSchema, deleteRow: indexedDeleteSchema,
		addColumn: columnInsertSchema, deleteColumn: indexedDeleteSchema,
		operations: { type: 'array', maxItems: 10000, items: tableOperationSchema },
		...Object.fromEntries(TABLE_SELECTOR_FIELDS.map(field => [field, tableOptionProperties[field]])),
	}),
})

function plainObject(value, path) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
	return value
}

function rejectUnknown(value, allowed, path) {
	for (const key of Object.keys(value)) {
		if (PRIVATE_FIELD_PATTERN.test(key)) throw new Error(`${path}.${key} is private and cannot be authored.`)
		if (!allowed.has(key)) throw new Error(`${path}.${key} is not part of the public table contract.`)
	}
}

function validateBoundedString(value, path, maxLength = 4096) {
	if (value !== undefined && value !== null && (typeof value !== 'string' || value.length > maxLength)) throw new Error(`${path} must be a string no longer than ${maxLength} characters or null.`)
}

function validateColor(value, path) {
	if (value === undefined || value === null) return
	if (typeof value !== 'string' || value.length > 128 || !new RegExp(HEX_OR_THEME_PATTERN).test(value)) throw new Error(`${path} must be a six-digit hex or theme color token.`)
}

function validateHyperlink(value, path) {
	if (value === undefined || value === null) return
	plainObject(value, path)
	rejectUnknown(value, new Set(['url', 'slide', 'tooltip', 'target']), path)
	const hasUrl = value.url !== undefined && value.url !== null
	const hasSlide = value.slide !== undefined && value.slide !== null
	if (hasUrl === hasSlide) throw new Error(`${path} requires exactly one of url or slide.`)
	if (hasUrl && (typeof value.url !== 'string' || value.url.length > 4096 || !/^(?:https:\/\/|mailto:|tel:)\S+$/.test(value.url))) throw new Error(`${path}.url must be an HTTPS, mailto, or tel URL.`)
	if (hasSlide && (!Number.isInteger(value.slide) || value.slide < 1 || value.slide > 100000)) throw new Error(`${path}.slide must be an integer from 1 through 100000.`)
	validateBoundedString(value.tooltip, `${path}.tooltip`, 1024)
	validateBoundedString(value.target, `${path}.target`, 255)
}

function validateFill(value, path) {
	if (value === undefined || value === null) return
	plainObject(value, path)
	rejectUnknown(value, new Set(['type', 'color', 'transparency', 'angle', 'stops']), path)
	if (value.type !== undefined && value.type !== null && !['none', 'solid', 'gradient'].includes(value.type)) throw new Error(`${path}.type is unsupported.`)
	validateColor(value.color, `${path}.color`)
	if (value.transparency !== undefined && value.transparency !== null && (!Number.isFinite(value.transparency) || value.transparency < 0 || value.transparency > 100)) throw new Error(`${path}.transparency must be from 0 through 100.`)
	if (value.angle !== undefined && value.angle !== null && (!Number.isFinite(value.angle) || value.angle < 0 || value.angle > 360)) throw new Error(`${path}.angle must be from 0 through 360.`)
	if (value.stops !== undefined && value.stops !== null) {
		if (!Array.isArray(value.stops) || value.stops.length > 32) throw new Error(`${path}.stops must contain at most 32 stops.`)
		for (const [index, stop] of value.stops.entries()) {
			plainObject(stop, `${path}.stops[${index}]`)
			rejectUnknown(stop, new Set(['pos', 'color', 'transparency']), `${path}.stops[${index}]`)
			if (!Number.isFinite(stop.pos) || stop.pos < 0 || stop.pos > 1) throw new Error(`${path}.stops[${index}].pos must be from 0 through 1.`)
			validateColor(stop.color, `${path}.stops[${index}].color`)
		}
	}
}

function validateBorderSide(value, path) {
	if (value === undefined || value === null) return
	plainObject(value, path)
	rejectUnknown(value, new Set(['type', 'color', 'pt', 'transparency']), path)
	if (value.type !== undefined && value.type !== null && !['none', 'solid', 'dash', 'dot', 'dashDot', 'longDash'].includes(value.type)) throw new Error(`${path}.type is unsupported.`)
	validateColor(value.color, `${path}.color`)
	if (value.pt !== undefined && value.pt !== null && (!Number.isFinite(value.pt) || value.pt < 0 || value.pt > 1584)) throw new Error(`${path}.pt must be from 0 through 1584.`)
	if (value.transparency !== undefined && value.transparency !== null && (!Number.isFinite(value.transparency) || value.transparency < 0 || value.transparency > 100)) throw new Error(`${path}.transparency must be from 0 through 100.`)
}

function validateBorder(value, path) {
	if (value === undefined || value === null) return
	if (Array.isArray(value)) {
		if (value.length !== 4) throw new Error(`${path} must contain exactly four sides.`)
		value.forEach((side, index) => validateBorderSide(side, `${path}[${index}]`))
		return
	}
	validateBorderSide(value, path)
}

function validateMargin(value, path) {
	if (value === undefined || value === null) return
	const values = Array.isArray(value) ? value : [value]
	if (Array.isArray(value) && value.length !== 4) throw new Error(`${path} must be one number or exactly four side values.`)
	if (values.some(item => !Number.isFinite(item) || item < 0 || item > 56)) throw new Error(`${path} values must be finite numbers from 0 through 56 inches.`)
}

function validateShadow(value, path) {
	if (value === undefined || value === null) return
	plainObject(value, path)
	rejectUnknown(value, new Set(['type', 'color', 'opacity', 'blur', 'offset', 'angle', 'scaleX', 'scaleY', 'skewX', 'skewY', 'rotateWithShape']), path)
	if (value.type !== undefined && value.type !== null && !['none', 'outer', 'inner'].includes(value.type)) throw new Error(`${path}.type is unsupported.`)
	validateColor(value.color, `${path}.color`)
	for (const [key, minimum, maximum] of [
		['opacity', 0, 1], ['blur', 0, 1000], ['offset', 0, 1000], ['angle', 0, 360],
		['scaleX', 0, 2], ['scaleY', 0, 2], ['skewX', -90, 90], ['skewY', -90, 90],
	]) {
		if (value[key] !== undefined && value[key] !== null && (!Number.isFinite(value[key]) || value[key] < minimum || value[key] > maximum)) throw new Error(`${path}.${key} must be from ${minimum} through ${maximum}.`)
	}
	if (value.rotateWithShape !== undefined && value.rotateWithShape !== null && typeof value.rotateWithShape !== 'boolean') throw new Error(`${path}.rotateWithShape must be boolean or null.`)
}

function validateRichTextRunOptions(value, path) {
	if (value === undefined || value === null) return
	plainObject(value, path)
	rejectUnknown(value, new Set(['fontFace', 'fontSize', 'color', 'bold', 'italic', 'underline', 'breakLine', 'hyperlink']), path)
	validateBoundedString(value.fontFace, `${path}.fontFace`, 4096)
	if (value.fontSize !== undefined && value.fontSize !== null && (!Number.isFinite(value.fontSize) || value.fontSize <= 0 || value.fontSize > 400)) throw new Error(`${path}.fontSize must be greater than 0 and at most 400.`)
	validateColor(value.color, `${path}.color`)
	for (const key of ['bold', 'italic', 'breakLine']) if (value[key] !== undefined && value[key] !== null && typeof value[key] !== 'boolean') throw new Error(`${path}.${key} must be boolean or null.`)
	if (value.underline !== undefined && value.underline !== null && typeof value.underline !== 'boolean') {
		plainObject(value.underline, `${path}.underline`)
		rejectUnknown(value.underline, new Set(['color', 'style']), `${path}.underline`)
		validateColor(value.underline.color, `${path}.underline.color`)
		validateBoundedString(value.underline.style, `${path}.underline.style`, 128)
	}
	validateHyperlink(value.hyperlink, `${path}.hyperlink`)
}

function validateRichText(value, path) {
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		if (String(value).length > TABLE_AUTHORING_LIMITS.maxTextLength) throw new Error(`${path} exceeds ${TABLE_AUTHORING_LIMITS.maxTextLength} characters.`)
		return clone(value)
	}
	if (!Array.isArray(value) || value.length < 1 || value.length > TABLE_AUTHORING_LIMITS.maxRichTextRunsPerCell) throw new Error(`${path} must be scalar text or 1 to ${TABLE_AUTHORING_LIMITS.maxRichTextRunsPerCell} rich-text runs.`)
	for (const [index, run] of value.entries()) {
		plainObject(run, `${path}[${index}]`)
		rejectUnknown(run, new Set(['text', 'options']), `${path}[${index}]`)
		if (run.text === undefined || (typeof run.text !== 'string' && typeof run.text !== 'number')) throw new Error(`${path}[${index}].text must be a string or number.`)
		if (String(run.text).length > TABLE_AUTHORING_LIMITS.maxTextLength) throw new Error(`${path}[${index}].text is too long.`)
		validateRichTextRunOptions(run.options, `${path}[${index}].options`)
	}
	return clone(value)
}

export function validateTableCellOptionsClosed(value, path = 'rows[].options') {
	if (value === undefined || value === null) return value
	plainObject(value, path)
	rejectUnknown(value, new Set(CELL_OPTION_FIELDS), path)
	validateTableCellOptions(value, path)
	validateFill(value.fill, `${path}.fill`)
	validateBorder(value.border, `${path}.border`)
	validateMargin(value.margin, `${path}.margin`)
	validateBoundedString(value.fontFace, `${path}.fontFace`, 4096)
	validateColor(value.color, `${path}.color`)
	validateHyperlink(value.hyperlink, `${path}.hyperlink`)
	if (value.breakLine !== undefined && value.breakLine !== null && typeof value.breakLine !== 'boolean') throw new Error(`${path}.breakLine must be boolean or null.`)
	return clone(value)
}

export function validateTableCell(value, path = 'table cell') {
	if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
		plainObject(value, path)
		rejectUnknown(value, new Set(['text', 'options']), path)
		if (value.text === undefined) throw new Error(`${path}.text is required.`)
		return { text: validateRichText(value.text, `${path}.text`), ...(value.options === undefined ? {} : { options: validateTableCellOptionsClosed(value.options, `${path}.options`) }) }
	}
	return validateRichText(value, path)
}

export function validateTableRows(value, path = 'rows') {
	if (!Array.isArray(value) || value.length < 1 || value.length > TABLE_AUTHORING_LIMITS.maxRows) throw new Error(`${path} must contain 1 to ${TABLE_AUTHORING_LIMITS.maxRows} rows.`)
	let authoredCells = 0
	const normalized = value.map((row, rowIndex) => {
		if (!Array.isArray(row) || row.length > TABLE_AUTHORING_LIMITS.maxColumns) throw new Error(`${path}[${rowIndex}] must contain at most ${TABLE_AUTHORING_LIMITS.maxColumns} authored cells.`)
		authoredCells += row.length
		return row.map((cell, cellIndex) => validateTableCell(cell, `${path}[${rowIndex}][${cellIndex}]`))
	})
	if (authoredCells > TABLE_AUTHORING_LIMITS.maxAuthoredCells) throw new Error(`${path} exceeds the ${TABLE_AUTHORING_LIMITS.maxAuthoredCells}-cell limit.`)

	const occupied = Array.from({ length: normalized.length }, () => [])
	let maxWidth = 0
	for (let rowIndex = 0; rowIndex < normalized.length; rowIndex++) {
		let cursor = 0
		for (let cellIndex = 0; cellIndex < normalized[rowIndex].length; cellIndex++) {
			while (occupied[rowIndex][cursor]) cursor++
			const cell = normalized[rowIndex][cellIndex]
			const options = cell && typeof cell === 'object' && !Array.isArray(cell) ? (cell.options || {}) : {}
			const colspan = options.colspan ?? 1
			const rowspan = options.rowspan ?? 1
			if (!Number.isInteger(colspan) || colspan < 1 || colspan > TABLE_AUTHORING_LIMITS.maxColumns) throw new Error(`${path}[${rowIndex}][${cellIndex}].options.colspan is invalid.`)
			if (!Number.isInteger(rowspan) || rowspan < 1 || rowspan > TABLE_AUTHORING_LIMITS.maxRows) throw new Error(`${path}[${rowIndex}][${cellIndex}].options.rowspan is invalid.`)
			if (rowIndex + rowspan > normalized.length) throw new Error(`${path}[${rowIndex}][${cellIndex}] rowspan extends beyond the final row.`)
			if (cursor + colspan > TABLE_AUTHORING_LIMITS.maxColumns) throw new Error(`${path}[${rowIndex}][${cellIndex}] span exceeds the ${TABLE_AUTHORING_LIMITS.maxColumns}-column limit.`)
			for (let r = rowIndex; r < rowIndex + rowspan; r++) for (let c = cursor; c < cursor + colspan; c++) {
				if (occupied[r][c]) throw new Error(`${path}[${rowIndex}][${cellIndex}] overlaps an earlier merged span at row ${r}, column ${c}.`)
				occupied[r][c] = true
			}
			cursor += colspan
		}
		maxWidth = Math.max(maxWidth, occupied[rowIndex].length)
	}
	for (let rowIndex = 0; rowIndex < occupied.length; rowIndex++) {
		for (let colIndex = 0; colIndex < maxWidth; colIndex++) if (!occupied[rowIndex][colIndex]) throw new Error(`${path}[${rowIndex}] leaves an uncovered grid cell at column ${colIndex}; every row must resolve to the same rectangular width.`)
	}
	return normalized
}

function validateSelectorCombinations(value, path) {
	const present = field => value[field] !== undefined && value[field] !== null
	if ([...TABLE_SELECTOR_FIELDS].filter(present).length > 1) throw new Error(`${path} must use only one of tablePresetId, tableStylePresetId, or tableStyleId.`)
	if (present('tablePresetId') && !TABLE_SEMANTIC_PRESET_IDS.includes(value.tablePresetId)) throw new Error(`${path}.tablePresetId is not an executable semantic table preset.`)
	if (present('tableStyleId') && !new RegExp(GUID_PATTERN).test(value.tableStyleId)) throw new Error(`${path}.tableStyleId must be a PowerPoint table-style GUID.`)
	for (const field of ['tableStylePresetId']) if (present(field) && (typeof value[field] !== 'string' || !value[field].trim() || value[field].length > 256)) throw new Error(`${path}.${field} must be a non-empty string no longer than 256 characters or null.`)
}

export function validateTableOptions(value, path = 'tableOptions', { direct = false } = {}) {
	if (value === undefined || value === null) return value
	plainObject(value, path)
	const allowed = new Set([...Object.keys(tableOptionProperties), ...(direct ? DIRECT_TABLE_OPTION_FIELDS : [])])
	rejectUnknown(value, allowed, path)
	const tableOnly = Object.fromEntries(Object.entries(value).filter(([key]) => TABLE_OPTION_PARAMETER_IDS.includes(key)))
	validateTableFormatOptions(tableOnly, path)
	validateSelectorCombinations(value, path)
	validateFill(value.fill, `${path}.fill`)
	validateBorder(value.border, `${path}.border`)
	validateMargin(value.margin, `${path}.margin`)
	validateBoundedString(value.fontFace, `${path}.fontFace`, 4096)
	validateColor(value.color, `${path}.color`)
	if (value.autoPageRepeatHeader === true && value.autoPage !== true) throw new Error(`${path}.autoPageRepeatHeader requires autoPage: true.`)
	if (value.autoPageHeaderRows !== undefined && value.autoPageHeaderRows !== null && value.autoPage !== true) throw new Error(`${path}.autoPageHeaderRows requires autoPage: true.`)
	if (direct) {
		for (const key of ['x', 'y']) if (value[key] !== undefined && value[key] !== null && !Number.isFinite(value[key])) throw new Error(`${path}.${key} must be a finite number or null.`)
		for (const key of ['w', 'h']) if (value[key] !== undefined && value[key] !== null && !((typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] > 0 && value[key] <= 56) || (typeof value[key] === 'string' && value[key].length <= 32))) throw new Error(`${path}.${key} must be a positive bounded number, percentage string, or null.`)
		validateShadow(value.shadow, `${path}.shadow`)
	}
	return clone(value)
}

export function validateTablePanel(value, path = 'table-panel') {
	plainObject(value, path)
	rejectUnknown(value, new Set(TABLE_PANEL_FIELDS), path)
	if (value.kind !== 'table-panel') throw new Error(`${path}.kind must be table-panel.`)
	if (typeof value.name !== 'string' || !/^[A-Za-z0-9._:-]+$/.test(value.name) || value.name.length > 256) throw new Error(`${path}.name must be a stable semantic name.`)
	const rows = Array.isArray(value.header) && value.header.length ? [value.header, ...(value.rows || [])] : value.rows
	validateTableRows(rows, `${path}.rows`)
	const selectors = Object.fromEntries(TABLE_SELECTOR_FIELDS.filter(key => value[key] !== undefined).map(key => [key, value[key]]))
	validateTableOptions({ ...selectors, ...(value.tableOptions || {}) }, `${path}.tableOptions`)
	return clone(value)
}

export function validateDirectTableAdd(value, path = 'slide.add_table') {
	plainObject(value, path)
	rejectUnknown(value, new Set(['deckId', 'slideIndex', 'rows', 'options', ...TABLE_SELECTOR_FIELDS]), path)
	validateTableRows(value.rows, `${path}.rows`)
	const selectors = Object.fromEntries(TABLE_SELECTOR_FIELDS.filter(key => value[key] !== undefined).map(key => [key, value[key]]))
	validateTableOptions({ ...selectors, ...(value.options || {}) }, `${path}.options`, { direct: true })
	return clone(value)
}

const TABLE_OPERATION_KINDS = Object.freeze(['replaceRows', 'patchOptions', 'setCell', 'patchCell', 'addRow', 'deleteRow', 'addColumn', 'deleteColumn'])

function validateTarget(value, path) {
	if (typeof value === 'number' || typeof value === 'string') return
	plainObject(value, path)
	rejectUnknown(value, new Set(['index', 'rawIndex', 'objectName']), path)
	if (Object.keys(value).length !== 1) throw new Error(`${path} requires exactly one selector.`)
}

function validateTableOperation(value, path) {
	plainObject(value, path)
	const kind = value.op ?? value.type
	if (!TABLE_OPERATION_KINDS.includes(kind)) throw new Error(`${path}.op is unsupported.`)
	const allowedByKind = {
		replaceRows: ['op', 'type', 'rows'], patchOptions: ['op', 'type', 'patch', 'options'],
		setCell: ['op', 'type', 'row', 'col', 'text', 'options'], patchCell: ['op', 'type', 'row', 'col', 'text', 'options'],
		addRow: ['op', 'type', 'index', 'cells'], deleteRow: ['op', 'type', 'index'],
		addColumn: ['op', 'type', 'index', 'cells'], deleteColumn: ['op', 'type', 'index'],
	}
	rejectUnknown(value, new Set(allowedByKind[kind]), path)
	if (value.op !== undefined && value.type !== undefined && value.op !== value.type) throw new Error(`${path}.op and type aliases disagree.`)
	if (kind === 'replaceRows') validateTableRows(value.rows, `${path}.rows`)
	if (kind === 'patchOptions') validateTableOptions(value.patch ?? value.options, `${path}.patch`, { direct: true })
	if (kind === 'setCell' || kind === 'patchCell') {
		if (!Number.isInteger(value.row) || value.row < 0 || !Number.isInteger(value.col) || value.col < 0) throw new Error(`${path}.row and .col must be non-negative integers.`)
		if (value.text !== undefined) validateRichText(value.text, `${path}.text`)
		if (value.options !== undefined) validateTableCellOptionsClosed(value.options, `${path}.options`)
		if (value.text === undefined && value.options === undefined) throw new Error(`${path} requires text or options.`)
	}
	if (kind === 'addRow' && value.cells !== undefined) {
		if (!Array.isArray(value.cells) || value.cells.length < 1 || value.cells.length > TABLE_AUTHORING_LIMITS.maxColumns) throw new Error(`${path}.cells must be a bounded row.`)
		value.cells.forEach((cell, index) => validateTableCell(cell, `${path}.cells[${index}]`))
	}
	if (kind === 'addColumn' && value.cells !== undefined) {
		if (!Array.isArray(value.cells) || value.cells.length > TABLE_AUTHORING_LIMITS.maxRows) throw new Error(`${path}.cells must be a bounded column.`)
		value.cells.forEach((cell, index) => validateTableCell(cell, `${path}.cells[${index}]`))
	}
	if (['addRow', 'deleteRow', 'addColumn', 'deleteColumn'].includes(kind) && value.index !== undefined && (!Number.isInteger(value.index) || value.index < 0)) throw new Error(`${path}.index must be a non-negative integer.`)
}

export function validateDirectTableUpdate(value, path = 'slide.update_table') {
	plainObject(value, path)
	rejectUnknown(value, new Set(['deckId', 'slideIndex', 'target', 'rows', 'optionsPatch', 'setCell', 'patchCell', 'addRow', 'deleteRow', 'addColumn', 'deleteColumn', 'operations', ...TABLE_SELECTOR_FIELDS]), path)
	validateTarget(value.target, `${path}.target`)
	if (value.rows !== undefined) validateTableRows(value.rows, `${path}.rows`)
	const selectors = Object.fromEntries(TABLE_SELECTOR_FIELDS.filter(key => value[key] !== undefined).map(key => [key, value[key]]))
	if (value.optionsPatch !== null) validateTableOptions({ ...selectors, ...(value.optionsPatch || {}) }, `${path}.optionsPatch`, { direct: true })
	else validateSelectorCombinations(selectors, path)
	for (const key of ['setCell', 'patchCell', 'addRow', 'deleteRow', 'addColumn', 'deleteColumn']) if (value[key] !== undefined) validateTableOperation({ op: key, ...value[key] }, `${path}.${key}`)
	if (value.operations !== undefined) {
		if (!Array.isArray(value.operations) || value.operations.length > 10000) throw new Error(`${path}.operations must contain at most 10000 operations.`)
		value.operations.forEach((operation, index) => validateTableOperation(operation, `${path}.operations[${index}]`))
	}
	const hasMutation = value.rows !== undefined || value.optionsPatch !== undefined || TABLE_SELECTOR_FIELDS.some(key => value[key] !== undefined) || ['setCell', 'patchCell', 'addRow', 'deleteRow', 'addColumn', 'deleteColumn'].some(key => value[key] !== undefined) || (Array.isArray(value.operations) && value.operations.length > 0)
	if (!hasMutation) throw new Error(`${path} requires at least one table mutation.`)
	return clone(value)
}

export function authoredTableState(selectors = {}, explicitOptions = {}, rows = undefined) {
	const publicOptionFields = new Set(Object.keys(TABLE_OPTIONS_PUBLIC_SCHEMA.properties))
	return Object.freeze({
		schemaVersion: TABLE_AUTHORING_STATE_SCHEMA_VERSION,
		selectors: clone(Object.fromEntries(TABLE_SELECTOR_FIELDS.filter(key => selectors[key] !== undefined && selectors[key] !== null).map(key => [key, selectors[key]]))),
		explicitOptions: clone(Object.fromEntries(Object.entries(explicitOptions || {}).filter(([key, item]) => publicOptionFields.has(key) && !TABLE_SELECTOR_FIELDS.includes(key) && !PRIVATE_FIELD_PATTERN.test(key) && item !== undefined && item !== null))),
		...(rows === undefined ? {} : { rows: clone(rows) }),
	})
}

// Set true only after schema, runtime lifecycle, package, comparator, decypher,
// and repair-disabled Office proof agree for the exact 36-row unit.
export const TABLE_AUTHORING_RUNTIME_READY = true

export const TABLE_AUTHORING_FAMILY_CONTRACT = Object.freeze({
	id: TABLE_AUTHORING_UNIT_ID,
	schemaVersion: TABLE_AUTHORING_SCHEMA_VERSION,
	capabilityMode: 'preset-plus-parameters',
	capabilityStatus: TABLE_AUTHORING_RUNTIME_READY ? 'executable-exact-structured' : 'structured-partial',
	runtimeReady: TABLE_AUTHORING_RUNTIME_READY,
	componentOwnership: Object.freeze(['rows', 'richTextCells', 'hyperlinks', 'gridTopology', 'rowspan', 'colspan', 'tableStyle', 'conditionalStyleFlags', 'fills', 'borders', 'margins', 'columnWidths', 'rowHeights', 'autoPaging', 'repeatedHeaders', 'tableRelationships']),
	overrideFields: Object.freeze(['rows', 'tableOptions', ...TABLE_SELECTOR_FIELDS, ...TABLE_FORMAT_PARAMETERS.map(parameter => parameter.semanticPath)]),
	resetBehavior: Object.freeze({
		component: 'set one tableOptions field or governed selector to null to remove that authored override while preserving rows and geometry',
		full: 'set optionsPatch to null on update to restore native table defaults while preserving rows and geometry',
		nullBehavior: 'null removes only the owned component; omission preserves it; rows and structural operations are explicit and independent',
	}),
	precedence: Object.freeze([
		'exactly one semantic table preset, native Table Design preset, or native table style id may select the style base',
		'the selected preset supplies table and contextual cell defaults',
		'explicit tableOptions and per-cell options are last-wins; null removes the named override',
		'structural span topology is validated before mutation and serialized from colspan and rowspan, never private merge flags',
	]),
	legalCombinations: Object.freeze([
		'native style id or opaque Table Design preset plus any legal conditional flags and explicit cell overrides',
		'semantic table preset plus explicit table and cell overrides',
		'colspan and rowspan in one rectangular non-overlapping grid with rich text and hyperlinks in anchor cells',
		'auto paging plus repeated header rows and deterministic continuation slides',
		'imported complex tables use exact preservation until converted through the closed editable table contract',
	]),
	publicSchema: TABLE_PANEL_PUBLIC_SCHEMA,
})

export function tableAuthoringCapabilityContractForEntry(entry = {}) {
	if (entry.family !== 'tables' || !TABLE_AUTHORING_RUNTIME_READY) return null
	return {
		...TABLE_AUTHORING_FAMILY_CONTRACT,
		capabilityStatus: 'executable-exact-structured',
		capabilityMode: entry.selection?.executableId || entry.selection?.executableValue ? 'preset-plus-parameters' : 'parameterized',
		applicability: entry.coverageMode === 'native-plus-preserve'
			? 'new native authoring plus exact imported-package preservation'
			: entry.coverageMode || 'native editable table authoring family',
	}
}
