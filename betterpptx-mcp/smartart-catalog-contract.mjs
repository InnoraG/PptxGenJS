// Closed, public-facing contract for the read-only SmartArt catalog command.
// The catalog selects no design: it exposes factual native choices and lets the
// AI choose exact ids before the existing native authoring path is invoked.

export const SMARTART_CATALOG_SCHEMA_VERSION = 'betterpptx.unranked-smartart-catalog.v1'
export const SMARTART_CATALOG_FORMATS = Object.freeze(['summary', 'full'])
export const SMARTART_CATALOG_SUPPORT_STATUSES = Object.freeze(['supported-native'])
export const SMARTART_CATALOG_SUMMARY_PAGE_LIMIT = 8
export const SMARTART_CATALOG_FULL_PAGE_LIMIT = 2

const CATEGORY_ALIASES = Object.freeze({
	list: 'list', lists: 'list',
	process: 'process', processes: 'process', flow: 'process', flowchart: 'process',
	cycle: 'cycle', cycles: 'cycle', circular: 'cycle',
	hierarchy: 'hierarchy', hierarchies: 'hierarchy', orgchart: 'hierarchy', organizationchart: 'hierarchy', 'org-chart': 'hierarchy',
	relationship: 'relationship', relationships: 'relationship', radial: 'relationship',
	matrix: 'matrix', matrices: 'matrix',
	pyramid: 'pyramid', pyramids: 'pyramid',
	picture: 'picture', pictures: 'picture', image: 'picture', images: 'picture',
	timeline: 'timeline', timelines: 'timeline', time: 'timeline',
	team: 'team', teams: 'team',
})

const INPUT_FIELDS = Object.freeze([
	'category', 'supportStatus', 'includeLayouts', 'format', 'limit', 'offset',
	'layoutId', 'quickStyleId', 'colorStyleId', 'query', 'intent', 'dataShape',
	'relationship', 'needsImages',
])
const INPUT_FIELD_SET = new Set(INPUT_FIELDS)

const text = { type: 'string' }
const nullableText = { type: ['string', 'null'] }
const publicCatalogItem = {
	type: 'object',
	additionalProperties: false,
	properties: {
		index: { type: ['integer', 'null'] },
		name: text,
		category: text,
		id: text,
		description: text,
		supportStatus: { type: 'string', enum: [...SMARTART_CATALOG_SUPPORT_STATUSES] },
		nativeAuthoring: { type: 'boolean' },
		shapeFallback: { type: 'boolean' },
		roundtripPolicy: text,
		applicability: { type: 'object', additionalProperties: true },
		galleryApplicability: { type: ['object', 'null'], additionalProperties: true },
	},
}
const publicPreset = {
	type: 'object',
	additionalProperties: false,
	properties: {
		index: { type: ['integer', 'null'] }, name: text, category: text, id: text,
		description: text, supportStatus: { type: 'string', enum: [...SMARTART_CATALOG_SUPPORT_STATUSES] },
	},
}

export const SMARTART_CATALOG_INPUT_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	properties: {
		category: { type: 'string', description: 'Optional category or factual alias: list, process, cycle, hierarchy, relationship, matrix, pyramid, picture, timeline, or team.' },
		supportStatus: { type: 'string', enum: [...SMARTART_CATALOG_SUPPORT_STATUSES] },
		includeLayouts: { type: 'boolean', default: true },
		format: { type: 'string', enum: [...SMARTART_CATALOG_FORMATS], default: 'summary' },
		limit: { type: 'integer', minimum: 1, maximum: SMARTART_CATALOG_SUMMARY_PAGE_LIMIT, default: 2 },
		offset: { type: 'integer', minimum: 0, default: 0 },
		layoutId: { type: 'string', minLength: 1 },
		quickStyleId: { type: 'string', minLength: 1 },
		colorStyleId: { type: 'string', minLength: 1 },
		query: { type: 'string' }, intent: { type: 'string' }, dataShape: { type: 'string' }, relationship: { type: 'string' },
		needsImages: { type: 'boolean' },
	},
})

export const SMARTART_CATALOG_DATA_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	properties: {
		contractVersion: { type: 'string', enum: [SMARTART_CATALOG_SCHEMA_VERSION] },
		selectionAuthority: { type: 'string', enum: ['ai'] },
		engineRole: { type: 'string' },
		selectionManifestContract: { type: 'object', additionalProperties: true },
		unranked: { type: 'boolean' }, catalogOrder: { type: 'string', enum: ['id-ascending'] },
		compatibilityAlias: { type: 'string' },
		format: { type: 'string', enum: [...SMARTART_CATALOG_FORMATS] },
		query: text, intent: nullableText, dataShape: nullableText, relationship: nullableText, category: nullableText,
		needsImages: { type: ['boolean', 'null'] },
		nativeMode: { type: 'object', additionalProperties: true },
		legacyCompatibilityDefaults: { type: 'object', additionalProperties: true },
		categories: { type: 'array', items: text },
		counts: { type: 'object', additionalProperties: true },
		galleryApplicability: { type: 'object', additionalProperties: true },
		pagination: { type: 'object', additionalProperties: false, properties: {
			offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 0 }, returned: { type: 'integer', minimum: 0 },
			totalMatches: { type: 'integer', minimum: 0 }, hasMore: { type: 'boolean' },
		}, required: ['offset', 'limit', 'returned', 'totalMatches', 'hasMore'] },
		layouts: { type: ['array', 'null'], items: publicCatalogItem },
		quickStyles: { type: 'array', items: publicPreset }, colors: { type: 'array', items: publicPreset },
		selectedPlan: { type: ['object', 'null'], additionalProperties: false, properties: {
			layoutId: nullableText, quickStyleId: nullableText, colorStyleId: nullableText,
			layout: { type: ['object', 'null'], additionalProperties: true },
			quickStyle: { type: ['object', 'null'], additionalProperties: true },
			colorStyle: { type: ['object', 'null'], additionalProperties: true },
			applicability: { type: ['object', 'null'], additionalProperties: true },
		}, required: ['layoutId', 'quickStyleId', 'colorStyleId', 'layout', 'quickStyle', 'colorStyle', 'applicability'] },
	},
})

export function canonicalSmartArtCategory(value) {
	if (value === undefined || value === null) return null
	const raw = String(value).trim().toLowerCase()
	if (!raw) return null
	const compact = raw.replace(/\s+/g, '')
	return CATEGORY_ALIASES[raw] || CATEGORY_ALIASES[compact] || raw
}

function numberField(value, name, { min, max, defaultValue }) {
	if (value === undefined) return defaultValue
	if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) throw new Error(`SmartArt catalog ${name} must be a finite integer.`)
	if (value < min || value > max) throw new Error(`SmartArt catalog ${name} must be between ${min} and ${max}.`)
	return value
}

function optionalText(value, name) {
	if (value === undefined) return undefined
	if (typeof value !== 'string') throw new Error(`SmartArt catalog ${name} must be a string.`)
	return value.trim()
}

export function normalizeSmartArtCatalogRequest(args = {}) {
	if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('SmartArt catalog arguments must be an object.')
	for (const key of Object.keys(args)) if (!INPUT_FIELD_SET.has(key)) throw new Error(`SmartArt catalog field is not public: ${key}`)
	const format = args.format === undefined ? 'summary' : args.format
	if (typeof format !== 'string' || !SMARTART_CATALOG_FORMATS.includes(format)) throw new Error(`SmartArt catalog format must be one of ${SMARTART_CATALOG_FORMATS.join(', ')}.`)
	const maxLimit = format === 'full' ? SMARTART_CATALOG_FULL_PAGE_LIMIT : SMARTART_CATALOG_SUMMARY_PAGE_LIMIT
	const limit = numberField(args.limit, 'limit', { min: 1, max: maxLimit, defaultValue: 2 })
	const offset = numberField(args.offset, 'offset', { min: 0, max: Number.MAX_SAFE_INTEGER, defaultValue: 0 })
	const includeLayouts = args.includeLayouts === undefined ? true : args.includeLayouts
	if (typeof includeLayouts !== 'boolean') throw new Error('SmartArt catalog includeLayouts must be boolean.')
	const needsImages = args.needsImages === undefined ? undefined : args.needsImages
	if (needsImages !== undefined && typeof needsImages !== 'boolean') throw new Error('SmartArt catalog needsImages must be boolean.')
	const supportStatus = args.supportStatus === undefined ? undefined : args.supportStatus
	if (supportStatus !== undefined && !SMARTART_CATALOG_SUPPORT_STATUSES.includes(supportStatus)) throw new Error(`SmartArt catalog supportStatus must be ${SMARTART_CATALOG_SUPPORT_STATUSES.join(', ')}.`)
	const category = canonicalSmartArtCategory(args.category)
	return {
		category,
		supportStatus,
		includeLayouts,
		format,
		limit,
		offset,
		layoutId: optionalText(args.layoutId, 'layoutId'), quickStyleId: optionalText(args.quickStyleId, 'quickStyleId'), colorStyleId: optionalText(args.colorStyleId, 'colorStyleId'),
		query: optionalText(args.query, 'query') || '', intent: optionalText(args.intent, 'intent'), dataShape: optionalText(args.dataShape, 'dataShape'), relationship: optionalText(args.relationship, 'relationship'),
		needsImages,
	}
}

export const SMARTART_CATALOG_CONTRACT = Object.freeze({
	id: 'smartArtCatalog', schemaVersion: SMARTART_CATALOG_SCHEMA_VERSION, capabilityMode: 'discrete', capabilityStatus: 'host-command-not-persistent-style', runtimeReady: true,
	componentOwnership: Object.freeze(['publicOperation', 'smartartCatalog', 'exactIdValidation']), overrideFields: Object.freeze([]),
	resetBehavior: Object.freeze({ component: 'not-applicable', full: 'not-applicable', nullBehavior: 'not-applicable' }),
	precedence: Object.freeze(['public tool schema', 'canonical factual filters', 'stable id-sorted catalog page', 'exact SmartArt selector applicability validation']),
	legalCombinations: Object.freeze(['category, query, intent, data-shape, relationship, and image-needed factual filters', 'exact layoutId with optional applicable quickStyleId and colorStyleId', 'summary or full bounded pagination', 'catalog discovery followed by AI-selected native SmartArt authoring']),
	applicability: Object.freeze(['native SmartArt layout discovery', 'exact native quick-style and color-style validation', 'bounded public catalog pagination']),
	limitation: 'Compatibility catalog command only; it filters factual SmartArt capabilities and validates opaque selectors but is not serialized as a slide style or SmartArt object.',
	publicSchema: SMARTART_CATALOG_DATA_SCHEMA,
})

export function smartArtCatalogCapabilityContractForEntry(entry = {}) {
	if (entry.family === 'smartart' && String(entry.label || '') === 'betterpptx.smartart.catalog') return SMARTART_CATALOG_CONTRACT
	return null
}
