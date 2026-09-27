import { CHART_FORMAT_PARAMETERS, validateChartFormatOptions } from './option-registry.mjs'

export const CHART_AUTHORING_UNIT_ID = 'impl-c-e9cb65d5f0db72c7'
export const CHART_AUTHORING_SCHEMA_VERSION = 'betterpptx.chart-authoring-family.v1'

export const CHART_SEMANTIC_TYPES = Object.freeze([
	'area', 'area3D', 'bar', 'bar3D', 'bubble', 'bubble3D', 'doughnut',
	'line', 'line3D', 'pie', 'pie3D', 'ofPie', 'radar', 'scatter',
	'stock', 'surface', 'surface3D', 'treemap', 'sunburst', 'histogram',
	'pareto', 'boxWhisker', 'waterfall', 'funnel', 'regionMap', 'combo',
])

export const CHART_SELECTOR_FIELDS = Object.freeze([
	'chartPresetId', 'chartGalleryTilePresetId', 'chartStylePresetId',
	'chartGalleryVariant', 'chartStyleId', 'chartStyleModernId',
	'chartColorStyleId', 'chartLayoutPresetId', 'chartTreatmentPresetId',
	'chartTreatmentPresetIds',
])

export const CHART_AUTHORING_STATE_SCHEMA_VERSION = 'betterpptx.chart-authoring-state.v1'

const CHART_PANEL_FIELDS = Object.freeze([
	'kind', 'name', 'objectName', 'role', 'region', 'placeholderBinding', 'action',
	'bbox', 'rect', 'style', 'title', 'altText', 'decorative',
	'hiddenFromAccessibility', 'reorderToIndex', 'animation', 'editHandle',
	'visibleSummary', 'summary', 'preserveGeometry', 'hyperlink',
	'chartType', 'type', 'chartMulti', 'charts', 'chartOptions',
	...CHART_SELECTOR_FIELDS,
	'data', 'series', 'dataRef', 'dataSource', 'source', 'provenance',
	'verified', 'evidenceSource', 'emphasis', 'patch', 'delete', 'remove',
])

const DIRECT_CHART_OPTION_FIELDS = Object.freeze([
	'x', 'y', 'w', 'h', 'objectName', 'altText', 'accessibilityTitle',
	'isDecorative', 'placeholder', 'phType', 'phIdx', 'phSz', 'phOrient',
	'phHasCustomPrompt', 'hasCustomPrompt', 'hasBarePh', 'animation',
	'editHandle', 'spid', 'chartExLayoutId',
])

const PRIVATE_CHART_OPTION_PATTERN = /^_/
const HEX_OR_THEME_PATTERN = '^(?:#?[0-9A-Fa-f]{6}|(?:accent|background|text|hyperlink|followedHyperlink|dark|light)[1-6]?|tx[12]|bg[12]|dk[12]|lt[12]|hlink|folHlink)$'

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function nullable(schema) {
	return { anyOf: [schema, { type: 'null' }] }
}

const colorSchema = nullable({ type: 'string', minLength: 1, maxLength: 128, pattern: HEX_OR_THEME_PATTERN })
const boundedString = nullable({ type: 'string', maxLength: 4096 })
const boundedNumber = nullable({ type: 'number', minimum: -2147483647, maximum: 2147483647 })
const boundedBoolean = nullable({ type: 'boolean' })

const fillSchema = nullable({
	type: 'object', additionalProperties: false,
	properties: {
		type: { type: ['string', 'null'], enum: ['none', 'solid', 'gradient', null] },
		color: colorSchema,
		transparency: { type: ['number', 'null'], minimum: 0, maximum: 100 },
		angle: { type: ['number', 'null'], minimum: 0, maximum: 360 },
		stops: { type: ['array', 'null'], maxItems: 32, items: { type: 'object', additionalProperties: false, required: ['pos', 'color'], properties: { pos: { type: 'number', minimum: 0, maximum: 1 }, color: colorSchema, transparency: { type: ['number', 'null'], minimum: 0, maximum: 100 } } } },
	},
})

const borderSchema = nullable({
	type: 'object', additionalProperties: false,
	properties: {
		type: { type: ['string', 'null'], enum: ['none', 'solid', 'dash', 'dot', null] },
		color: colorSchema,
		pt: { type: ['number', 'null'], minimum: 0, maximum: 1584 },
		transparency: { type: ['number', 'null'], minimum: 0, maximum: 100 },
	},
})

const gridLineSchema = nullable({
	type: 'object', additionalProperties: false,
	properties: {
		cap: { type: ['string', 'null'], enum: ['flat', 'round', 'square', null] },
		color: colorSchema,
		size: { type: ['number', 'null'], minimum: 0, maximum: 1584 },
		style: { type: ['string', 'null'], enum: ['solid', 'dash', 'dot', 'none', null] },
	},
})

const areaSchema = nullable({
	type: 'object', additionalProperties: false,
	properties: { fill: fillSchema, border: borderSchema, roundedCorners: boundedBoolean },
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
	},
})

function schemaForParameter(parameter) {
	if (parameter.id === 'chartColors' || parameter.id === 'invertedColors') {
		return nullable({ type: 'array', maxItems: 256, items: colorSchema })
	}
	if (parameter.id === 'chartArea' || parameter.id === 'plotArea') return areaSchema
	if (parameter.id === 'catGridLine' || parameter.id === 'valGridLine' || parameter.id === 'serGridLine') return gridLineSchema
	if (parameter.id === 'shadow') return shadowSchema
	if (parameter.id === 'layout' || parameter.id === 'titlePos') {
		return nullable({ type: 'object', additionalProperties: false, properties: { x: boundedNumber, y: boundedNumber, w: boundedNumber, h: boundedNumber } })
	}
	if (parameter.id === 'dataBorder') return borderSchema
	if (parameter.id === 'catAxes' || parameter.id === 'valAxes') {
		return nullable({ type: 'array', maxItems: 2, items: { type: 'object', maxProperties: 128 } })
	}
	if (parameter.type === 'continuous') {
		return nullable({
			type: 'number',
			...(Number.isFinite(parameter.minimum) ? { minimum: parameter.minimum } : {}),
			...(Number.isFinite(parameter.maximum) ? { maximum: parameter.maximum } : {}),
			...(parameter.step >= 1 ? { multipleOf: parameter.step } : {}),
		})
	}
	if (Array.isArray(parameter.canonical)) return { type: ['string', 'null'], enum: [...parameter.canonical, null] }
	if (parameter.valueType === 'boolean') return boundedBoolean
	if (parameter.type === 'color') return colorSchema
	if (parameter.valueType === 'string' || parameter.valueType === 'font-family' || parameter.valueType === 'format-code') return boundedString
	return nullable({ type: ['object', 'array', 'string', 'number', 'boolean'], maxProperties: 128, maxItems: 256 })
}

const chartOptionProperties = Object.fromEntries(CHART_FORMAT_PARAMETERS.map(parameter => [parameter.id, schemaForParameter(parameter)]))
Object.assign(chartOptionProperties, {
	chartPresetId: boundedString,
	chartGalleryTilePresetId: boundedString,
	chartStylePresetId: boundedString,
	chartGalleryVariant: { type: ['integer', 'null'], minimum: 1, maximum: 49 },
	chartStyleId: { type: ['integer', 'null'], minimum: 1, maximum: 48 },
	chartStyleModernId: { type: ['integer', 'null'], minimum: 101, maximum: 112 },
	chartColorStyleId: { type: ['integer', 'null'], minimum: 1, maximum: 99 },
	chartLayoutPresetId: boundedString,
	chartTreatmentPresetId: boundedString,
	chartTreatmentPresetIds: nullable({ type: 'array', minItems: 1, maxItems: 24, uniqueItems: true, items: { type: 'string', minLength: 1, maxLength: 256 } }),
	showCatAxis: boundedBoolean,
	showValAxis: boundedBoolean,
})

export const CHART_OPTIONS_PUBLIC_SCHEMA = Object.freeze({
	type: ['object', 'null'],
	additionalProperties: false,
	properties: Object.freeze(chartOptionProperties),
})

export const CHART_SERIES_PUBLIC_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	properties: {
		name: { type: 'string', maxLength: 4096 },
		labels: { type: 'array', maxItems: 10000, items: { anyOf: [{ type: 'string', maxLength: 4096 }, { type: 'array', maxItems: 32, items: { type: 'string', maxLength: 4096 } }] } },
		values: { type: 'array', maxItems: 10000, items: { type: 'number', minimum: -1e308, maximum: 1e308 } },
		sizes: { type: 'array', maxItems: 10000, items: { type: 'number', minimum: 0, maximum: 1e308 } },
		xValues: { type: 'array', maxItems: 10000, items: { type: 'number', minimum: -1e308, maximum: 1e308 } },
		yValues: { type: 'array', maxItems: 10000, items: { type: 'number', minimum: -1e308, maximum: 1e308 } },
	},
})

export const CHART_DATA_PUBLIC_SCHEMA = Object.freeze({
	type: 'array', minItems: 1, maxItems: 128, items: CHART_SERIES_PUBLIC_SCHEMA,
})

export const CHART_MULTI_PUBLIC_SCHEMA = Object.freeze({
	type: 'array', minItems: 2, maxItems: 16,
	items: {
		type: 'object', additionalProperties: false, required: ['type', 'data'],
		properties: {
			type: { type: 'string', enum: CHART_SEMANTIC_TYPES.filter(type => !['combo', 'stock', 'surface', 'surface3D', 'area3D', 'line3D', 'pie3D', 'ofPie'].includes(type)) },
			data: CHART_DATA_PUBLIC_SCHEMA,
			options: CHART_OPTIONS_PUBLIC_SCHEMA,
		},
	},
})

export const CHART_PANEL_PUBLIC_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	required: ['kind', 'name'],
	properties: Object.freeze({
		kind: { const: 'chart-panel' },
		name: { type: 'string', minLength: 1, maxLength: 256, pattern: '^[A-Za-z0-9._:-]+$' },
		objectName: { type: 'string', minLength: 1, maxLength: 256 },
		role: { type: 'string', maxLength: 256 },
		region: { type: 'string', maxLength: 256 },
		placeholderBinding: { type: ['object', 'null'] },
		action: { type: ['object', 'null'] },
		bbox: { type: ['object', 'null'] }, rect: { type: ['object', 'null'] },
		style: { type: ['object', 'null'] }, title: boundedString, altText: boundedString,
		decorative: boundedBoolean, hiddenFromAccessibility: boundedBoolean,
		visibleSummary: boundedString, summary: boundedString, preserveGeometry: boundedBoolean,
		hyperlink: { type: ['object', 'null'] },
		reorderToIndex: { type: ['integer', 'null'], minimum: 0 },
		animation: { type: ['object', 'array', 'null'] }, editHandle: boundedString,
		chartType: { type: ['string', 'null'], enum: [...CHART_SEMANTIC_TYPES, null] },
		type: { type: ['string', 'null'], enum: [...CHART_SEMANTIC_TYPES, null] },
		chartMulti: CHART_MULTI_PUBLIC_SCHEMA, charts: CHART_MULTI_PUBLIC_SCHEMA,
		chartOptions: CHART_OPTIONS_PUBLIC_SCHEMA,
		...Object.fromEntries(CHART_SELECTOR_FIELDS.map(field => [field, chartOptionProperties[field]])),
		data: CHART_DATA_PUBLIC_SCHEMA, series: CHART_DATA_PUBLIC_SCHEMA,
		dataRef: boundedString, dataSource: boundedString, source: boundedString,
		provenance: boundedString, verified: boundedBoolean, evidenceSource: boundedString,
		emphasis: boundedString, patch: { type: ['object', 'null'] },
		delete: boundedBoolean, remove: boundedBoolean,
	}),
})

export const DIRECT_CHART_OPTIONS_PUBLIC_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	properties: Object.freeze({
		...chartOptionProperties,
		x: boundedNumber, y: boundedNumber, w: nullable({ anyOf: [{ type: 'number', exclusiveMinimum: 0 }, { type: 'string', maxLength: 32 }] }), h: nullable({ anyOf: [{ type: 'number', exclusiveMinimum: 0 }, { type: 'string', maxLength: 32 }] }),
		objectName: boundedString, altText: boundedString, accessibilityTitle: boundedString,
		isDecorative: boundedBoolean, placeholder: boundedString,
		phType: { type: ['string', 'null'], enum: ['chart', 'obj', null] },
		phIdx: { type: ['integer', 'null'], minimum: 0, maximum: 4294967295 },
		phSz: { type: ['string', 'null'], enum: ['full', 'half', 'quarter', null] },
		phOrient: { type: ['string', 'null'], enum: ['horz', 'vert', null] },
		phHasCustomPrompt: boundedBoolean, hasCustomPrompt: boundedBoolean, hasBarePh: boundedBoolean,
		animation: { type: ['object', 'array', 'null'] }, editHandle: boundedString,
		spid: { type: ['integer', 'null'], minimum: 1, maximum: 4294967295 },
		chartExLayoutId: boundedString,
	}),
})

function plainObject(value, path) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
	return value
}

function rejectUnknown(value, allowed, path) {
	for (const key of Object.keys(value)) {
		if (PRIVATE_CHART_OPTION_PATTERN.test(key)) throw new Error(`${path}.${key} is private and cannot be authored.`)
		if (!allowed.has(key)) throw new Error(`${path}.${key} is not part of the public chart contract.`)
	}
}

function finiteArray(value, path, { minimum = -Infinity } = {}) {
	if (!Array.isArray(value)) throw new Error(`${path} must be an array.`)
	if (value.length > 10000) throw new Error(`${path} exceeds the 10000-point limit.`)
	for (const [index, item] of value.entries()) {
		if (typeof item !== 'number' || !Number.isFinite(item) || item < minimum) throw new Error(`${path}[${index}] must be a finite number${minimum > -Infinity ? ` greater than or equal to ${minimum}` : ''}.`)
	}
}

export function validateChartSeries(value, path = 'chart data') {
	plainObject(value, path)
	rejectUnknown(value, new Set(['name', 'labels', 'values', 'sizes', 'xValues', 'yValues']), path)
	if (value.name !== undefined && (typeof value.name !== 'string' || value.name.length > 4096)) throw new Error(`${path}.name must be a string no longer than 4096 characters.`)
	if (value.labels !== undefined) {
		if (!Array.isArray(value.labels) || value.labels.length > 10000) throw new Error(`${path}.labels must contain at most 10000 labels.`)
		for (const [index, label] of value.labels.entries()) {
			if (typeof label === 'string') {
				if (label.length > 4096) throw new Error(`${path}.labels[${index}] exceeds 4096 characters.`)
			} else if (!Array.isArray(label) || label.length > 32 || label.some(level => typeof level !== 'string' || level.length > 4096)) {
				throw new Error(`${path}.labels[${index}] must be a string or at most 32 string levels.`)
			}
		}
	}
	if (value.values !== undefined) finiteArray(value.values, `${path}.values`)
	if (value.xValues !== undefined) finiteArray(value.xValues, `${path}.xValues`)
	if (value.yValues !== undefined) finiteArray(value.yValues, `${path}.yValues`)
	if (value.sizes !== undefined) finiteArray(value.sizes, `${path}.sizes`, { minimum: 0 })
	const pointCount = value.yValues?.length ?? value.values?.length ?? 0
	if (value.labels && pointCount) {
		const hierarchical = value.labels.length > 0 && value.labels.every(Array.isArray)
		if (hierarchical) {
			for (const [levelIndex, level] of value.labels.entries()) {
				if (level.length !== pointCount) throw new Error(`${path}.labels[${levelIndex}] and values must have equal lengths.`)
			}
		} else if (value.labels.length !== pointCount) throw new Error(`${path}.labels and values must have equal lengths.`)
	}
	if (value.xValues && value.yValues && value.xValues.length !== value.yValues.length) throw new Error(`${path}.xValues and yValues must have equal lengths.`)
	if (value.sizes && pointCount && value.sizes.length !== pointCount) throw new Error(`${path}.sizes and values must have equal lengths.`)
	if (!value.values && !value.yValues) throw new Error(`${path} requires values or yValues.`)
	return clone(value)
}

export function validateChartData(value, path = 'chart data') {
	if (!Array.isArray(value) || value.length < 1 || value.length > 128) throw new Error(`${path} must contain between 1 and 128 series.`)
	const normalized = value.map((series, index) => validateChartSeries(series, `${path}[${index}]`))
	const totalPoints = normalized.reduce((count, series) => count + Number(series.values?.length || series.yValues?.length || 0), 0)
	if (totalPoints > 100000) throw new Error(`${path} exceeds the 100000-point chart limit.`)
	return normalized
}

function validateSelectorCombinations(options, path) {
	const present = key => options[key] !== undefined && options[key] !== null
	if (present('chartTreatmentPresetId') && present('chartTreatmentPresetIds')) throw new Error(`${path} must use chartTreatmentPresetId or chartTreatmentPresetIds, not both.`)
	if (present('chartGalleryTilePresetId')) {
		for (const key of ['chartStylePresetId', 'chartGalleryVariant', 'chartStyleId', 'chartStyleModernId', 'chartColorStyleId', 'chartLayoutPresetId', 'chartTreatmentPresetId', 'chartTreatmentPresetIds']) {
			if (present(key)) throw new Error(`${path}.chartGalleryTilePresetId cannot be combined with ${key}.`)
		}
	}
}

export function validateChartOptions(value, path = 'chartOptions', { direct = false } = {}) {
	if (value === undefined || value === null) return value
	plainObject(value, path)
	const allowed = new Set([...Object.keys(chartOptionProperties), ...(direct ? DIRECT_CHART_OPTION_FIELDS : [])])
	rejectUnknown(value, allowed, path)
	validateChartFormatOptions(value, path)
	validateSelectorCombinations(value, path)
	for (const field of ['chartPresetId', 'chartGalleryTilePresetId', 'chartStylePresetId', 'chartLayoutPresetId', 'chartTreatmentPresetId']) {
		const item = value[field]
		if (item !== undefined && item !== null && (typeof item !== 'string' || !item.trim() || item.length > 256)) throw new Error(`${path}.${field} must be a non-empty string no longer than 256 characters or null.`)
	}
	for (const [field, minimum, maximum] of [
		['chartGalleryVariant', 1, 49], ['chartStyleId', 1, 48],
		['chartStyleModernId', 101, 112], ['chartColorStyleId', 1, 99],
	]) {
		const item = value[field]
		if (item !== undefined && item !== null && (!Number.isInteger(item) || item < minimum || item > maximum)) throw new Error(`${path}.${field} must be an integer from ${minimum} through ${maximum} or null.`)
	}
	if (value.chartTreatmentPresetIds !== undefined && value.chartTreatmentPresetIds !== null) {
		if (!Array.isArray(value.chartTreatmentPresetIds) || value.chartTreatmentPresetIds.length < 1 || value.chartTreatmentPresetIds.length > 24 || new Set(value.chartTreatmentPresetIds).size !== value.chartTreatmentPresetIds.length || value.chartTreatmentPresetIds.some(id => typeof id !== 'string' || !id.trim() || id.length > 256)) throw new Error(`${path}.chartTreatmentPresetIds must contain 1 to 24 unique non-empty ids.`)
	}
	return clone(value)
}

export function validateChartMulti(value, path = 'chartMulti') {
	if (!Array.isArray(value) || value.length < 2 || value.length > 16) throw new Error(`${path} must contain between 2 and 16 chart descriptors.`)
	return value.map((item, index) => {
		plainObject(item, `${path}[${index}]`)
		rejectUnknown(item, new Set(['type', 'data', 'options']), `${path}[${index}]`)
		if (!CHART_SEMANTIC_TYPES.includes(item.type) || ['combo', 'stock', 'surface', 'surface3D', 'area3D', 'line3D', 'pie3D', 'ofPie'].includes(item.type)) throw new Error(`${path}[${index}].type is not a native combo component type.`)
		return { type: item.type, data: validateChartData(item.data, `${path}[${index}].data`), ...(item.options === undefined ? {} : { options: validateChartOptions(item.options, `${path}[${index}].options`) }) }
	})
}

export function validateChartPanel(value, path = 'chart-panel') {
	plainObject(value, path)
	rejectUnknown(value, new Set(CHART_PANEL_FIELDS), path)
	if (value.kind !== 'chart-panel') throw new Error(`${path}.kind must be chart-panel.`)
	if (typeof value.name !== 'string' || !/^[A-Za-z0-9._:-]+$/.test(value.name) || value.name.length > 256) throw new Error(`${path}.name must be a stable semantic name.`)
	const chartType = value.chartType ?? value.type
	const chartMulti = value.chartMulti ?? value.charts
	if (value.chartType !== undefined && value.type !== undefined && value.chartType !== value.type) throw new Error(`${path}.chartType and type aliases disagree.`)
	if (value.chartMulti !== undefined && value.charts !== undefined) throw new Error(`${path} must use chartMulti or charts, not both.`)
	if (chartType !== undefined && chartType !== null && chartMulti !== undefined) throw new Error(`${path} must use chartType or chartMulti, not both.`)
	if (chartType !== undefined && chartType !== null && !CHART_SEMANTIC_TYPES.includes(chartType)) throw new Error(`${path}.chartType is unsupported.`)
	if (chartMulti !== undefined) validateChartMulti(chartMulti, `${path}.chartMulti`)
	else if (value.data !== undefined || value.series !== undefined) validateChartData(value.data ?? value.series, `${path}.data`)
	const selectors = Object.fromEntries(CHART_SELECTOR_FIELDS.filter(key => value[key] !== undefined).map(key => [key, value[key]]))
	const options = { ...selectors, ...(value.chartOptions && typeof value.chartOptions === 'object' ? value.chartOptions : {}) }
	validateChartOptions(options, `${path}.chartOptions`)
	return clone(value)
}

export function validateDirectChartAdd(value, path = 'slide.add_chart') {
	plainObject(value, path)
	const allowed = new Set(['deckId', 'slideIndex', 'chartType', 'chartMulti', 'data', 'options', ...CHART_SELECTOR_FIELDS])
	rejectUnknown(value, allowed, path)
	const chartType = value.chartType
	if (value.chartMulti !== undefined && chartType !== undefined) throw new Error(`${path} must use chartType or chartMulti, not both.`)
	if (value.chartMulti !== undefined) validateChartMulti(value.chartMulti, `${path}.chartMulti`)
	else {
		const typeSelector = value.chartPresetId || value.chartGalleryTilePresetId || value.options?.chartPresetId || value.options?.chartGalleryTilePresetId
		if (chartType !== undefined && !CHART_SEMANTIC_TYPES.includes(chartType)) throw new Error(`${path}.chartType is unsupported.`)
		if (chartType === undefined && !typeSelector) throw new Error(`${path} requires chartType or a governed type-bearing chart preset/tile.`)
		validateChartData(value.data, `${path}.data`)
	}
	const selectors = Object.fromEntries(CHART_SELECTOR_FIELDS.filter(key => value[key] !== undefined).map(key => [key, value[key]]))
	validateChartOptions({ ...selectors, ...(value.options || {}) }, `${path}.options`, { direct: true })
	return clone(value)
}

export function validateDirectChartUpdate(value, path = 'slide.update_chart') {
	plainObject(value, path)
	const allowed = new Set(['deckId', 'slideIndex', 'target', 'chartType', 'type', 'chartMulti', 'data', 'optionsPatch', ...CHART_SELECTOR_FIELDS])
	rejectUnknown(value, allowed, path)
	if (value.chartType !== undefined && value.type !== undefined && value.chartType !== value.type) throw new Error(`${path}.chartType and type aliases disagree.`)
	const chartType = value.chartType ?? value.type
	if (value.chartMulti !== undefined && chartType !== undefined && chartType !== null) throw new Error(`${path} must use chartType or chartMulti, not both.`)
	if (chartType !== undefined && chartType !== null && !CHART_SEMANTIC_TYPES.includes(chartType)) throw new Error(`${path}.chartType is unsupported.`)
	if (value.chartMulti !== undefined) validateChartMulti(value.chartMulti, `${path}.chartMulti`)
	if (value.data !== undefined) validateChartData(value.data, `${path}.data`)
	const selectors = Object.fromEntries(CHART_SELECTOR_FIELDS.filter(key => value[key] !== undefined).map(key => [key, value[key]]))
	if (value.optionsPatch !== null) validateChartOptions({ ...selectors, ...(value.optionsPatch || {}) }, `${path}.optionsPatch`, { direct: true })
	return clone(value)
}

export function authoredChartState(selectors = {}, explicitOptions = {}) {
	const publicOptionFields = new Set(Object.keys(CHART_OPTIONS_PUBLIC_SCHEMA.properties))
	return Object.freeze({
		schemaVersion: CHART_AUTHORING_STATE_SCHEMA_VERSION,
		selectors: clone(Object.fromEntries(CHART_SELECTOR_FIELDS.filter(key => selectors[key] !== undefined && selectors[key] !== null).map(key => [key, selectors[key]]))),
		explicitOptions: clone(Object.fromEntries(Object.entries(explicitOptions || {}).filter(([key, item]) => publicOptionFields.has(key) && !CHART_SELECTOR_FIELDS.includes(key) && !PRIVATE_CHART_OPTION_PATTERN.test(key) && item !== undefined && item !== null))),
	})
}

export const CHART_AUTHORING_RUNTIME_READY = true

export const CHART_AUTHORING_FAMILY_CONTRACT = Object.freeze({
	id: CHART_AUTHORING_UNIT_ID,
	schemaVersion: CHART_AUTHORING_SCHEMA_VERSION,
	capabilityMode: 'preset-plus-parameters',
	capabilityStatus: 'executable-exact-structured',
	runtimeReady: CHART_AUTHORING_RUNTIME_READY,
	componentOwnership: Object.freeze(['chartType', 'seriesData', 'chartStyle', 'chartColors', 'chartLayout', 'axes', 'labels', 'legend', 'chartArea', 'plotArea', 'embeddedWorkbook', 'chartRelationships', 'shapeBuiltAnalytics']),
	overrideFields: Object.freeze(['chartType', 'chartMulti', 'data', 'chartOptions', ...CHART_SELECTOR_FIELDS, ...CHART_FORMAT_PARAMETERS.map(parameter => `chartOptions.${parameter.id}`)]),
	resetBehavior: Object.freeze({
		component: 'set one chartOptions field or governed selector to null to remove that authored override while preserving chart type and data',
		full: 'set optionsPatch to null on update, or remove chartOptions and selectors in current-spec replay, to restore native chart-type defaults while preserving data and geometry',
		nullBehavior: 'null removes only the owned component; omission preserves it; data or chart-type replacement is explicit and independent',
	}),
	precedence: Object.freeze([
		'chartType or chartMulti selects the native carrier; exactly one lane is allowed',
		'a semantic chart preset supplies a compatible type/default base',
		'an exact Ribbon tile is exclusive with other exact style, color, layout, and treatment selectors',
		'compatible style and treatment resources overlay the type/preset base',
		'explicit chartOptions are last-wins; null removes the named override',
	]),
	legalCombinations: Object.freeze([
		'single native legacy or ChartEx type plus bounded data and options',
		'combo chartMulti with two to sixteen native component descriptors',
		'semantic preset plus compatible style/treatment plus explicit options',
		'exact Ribbon tile alone plus explicit non-resource options',
		'shape-built analytics use editable native shapes, groups, and connectors rather than false native chart insertion',
	]),
	publicSchema: CHART_PANEL_PUBLIC_SCHEMA,
})

export function chartAuthoringCapabilityContractForEntry(entry = {}) {
	if (entry.family !== 'charts' || !CHART_AUTHORING_RUNTIME_READY) return null
	return {
		...CHART_AUTHORING_FAMILY_CONTRACT,
		capabilityMode: entry.selection?.executableId || entry.selection?.executableValue ? 'preset-plus-parameters' : 'parameterized',
		applicability: entry.coverageMode === 'shape-built-chart'
			? 'editable native shape/group/connector composition'
			: entry.coverageMode === 'native-plus-preserve'
				? 'new native authoring plus exact imported-package preservation'
				: entry.coverageMode || 'native and ChartEx authoring family',
	}
}
