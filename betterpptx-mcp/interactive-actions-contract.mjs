const OWN = (value, key) => Object.prototype.hasOwnProperty.call(value, key)

export const INTERACTIVE_ACTIONS_UNIT_ID = 'impl-b-5dc2c48339529baf'

export const INTERACTIVE_ACTION_ROWS = Object.freeze([
	Object.freeze({ id: 'cap_5e4628e4208df0355326', label: 'hover actions', semanticPath: 'slides[].content[].action.hover' }),
	Object.freeze({ id: 'cap_68d5d40f2215eae2ec27', label: 'URL action', semanticPath: 'slides[].content[].action.click.url' }),
	Object.freeze({ id: 'cap_a06f420c739065b17b39', label: 'play sound actions', semanticPath: 'slides[].content[].action.{click,hover}.sound' }),
	Object.freeze({ id: 'cap_ae5619804717cfc5954c', label: 'click actions', semanticPath: 'slides[].content[].action.click' }),
	Object.freeze({ id: 'cap_bf541879e51cde191618', label: 'custom shows', semanticPath: 'customShows[]' }),
	Object.freeze({ id: 'cap_e44774790533e94f3b09', label: 'end show', semanticPath: 'slides[].content[].action.click.type=endShow' }),
	Object.freeze({ id: 'cap_f3905ef2e0ad81995a06', label: 'action buttons', semanticPath: 'slides[].content[].shapeName=actionButton*' }),
	Object.freeze({ id: 'cap_f9784c48bcfddf63c337', label: 'jump to custom show', semanticPath: 'slides[].content[].action.click.type=customShow' }),
])

export const INTERACTIVE_ACTION_ROW_IDS = Object.freeze(INTERACTIVE_ACTION_ROWS.map(row => row.id))

export const ACTION_BUTTON_SHAPE_NAMES = Object.freeze([
	'actionButtonBackPrevious',
	'actionButtonBeginning',
	'actionButtonBlank',
	'actionButtonDocument',
	'actionButtonEnd',
	'actionButtonForwardNext',
	'actionButtonHelp',
	'actionButtonHome',
	'actionButtonInformation',
	'actionButtonMovie',
	'actionButtonReturn',
	'actionButtonSound',
])

export const INTERACTIVE_ACTION_TYPES = Object.freeze(['url', 'slide', 'jump', 'endShow', 'customShow', 'none'])
export const INTERACTIVE_ACTION_JUMPS = Object.freeze(['firstSlide', 'lastSlide', 'lastSlideViewed', 'nextSlide', 'previousSlide'])

export const POWERPOINT_ACTION_URIS = Object.freeze({
	slide: 'ppaction://hlinksldjump',
	firstSlide: 'ppaction://hlinkshowjump?jump=firstslide',
	lastSlide: 'ppaction://hlinkshowjump?jump=lastslide',
	lastSlideViewed: 'ppaction://hlinkshowjump?jump=lastslideviewed',
	nextSlide: 'ppaction://hlinkshowjump?jump=nextslide',
	previousSlide: 'ppaction://hlinkshowjump?jump=previousslide',
	endShow: 'ppaction://hlinkshowjump?jump=endshow',
	customShow: 'ppaction://customshow',
	none: 'ppaction://noaction',
})

const nullableBooleanSchema = Object.freeze({ type: ['boolean', 'null'] })

export const INTERACTIVE_ACTION_SOUND_SCHEMA = Object.freeze({
	oneOf: Object.freeze([
		Object.freeze({ type: 'null' }),
		Object.freeze({
			type: 'object',
			additionalProperties: false,
			required: Object.freeze(['source', 'format']),
			properties: Object.freeze({
				source: Object.freeze({ type: 'string', minLength: 1, maxLength: 10485760 }),
				format: Object.freeze({ const: 'wav' }),
				name: Object.freeze({ type: 'string', minLength: 1, maxLength: 255 }),
			}),
		}),
	]),
})

const endpointProperties = Object.freeze({
	type: Object.freeze({ type: 'string', enum: INTERACTIVE_ACTION_TYPES }),
	url: Object.freeze({ type: 'string', minLength: 1, maxLength: 8192 }),
	targetSlideId: Object.freeze({ type: 'string', minLength: 1, maxLength: 256 }),
	jump: Object.freeze({ type: 'string', enum: INTERACTIVE_ACTION_JUMPS }),
	customShow: Object.freeze({ type: 'string', minLength: 1, maxLength: 255 }),
	showAndReturn: Object.freeze({ const: true }),
	tooltip: Object.freeze({ type: ['string', 'null'], maxLength: 4096 }),
	history: nullableBooleanSchema,
	highlightClick: nullableBooleanSchema,
	endSound: nullableBooleanSchema,
	sound: INTERACTIVE_ACTION_SOUND_SCHEMA,
})

function endpointVariant(type, required = [], forbidden = []) {
	return Object.freeze({
		type: 'object',
		additionalProperties: false,
		required: Object.freeze(['type', ...required]),
		properties: endpointProperties,
		allOf: Object.freeze([
			Object.freeze({ properties: Object.freeze({ type: Object.freeze({ const: type }) }) }),
			...forbidden.map(key => Object.freeze({ not: Object.freeze({ required: Object.freeze([key]) }) })),
		]),
	})
}

export const INTERACTIVE_ACTION_ENDPOINT_SCHEMA = Object.freeze({
	oneOf: Object.freeze([
		Object.freeze({ type: 'null' }),
		endpointVariant('url', ['url'], ['targetSlideId', 'jump', 'customShow', 'showAndReturn']),
		endpointVariant('slide', ['targetSlideId'], ['url', 'jump', 'customShow', 'showAndReturn']),
		endpointVariant('jump', ['jump'], ['url', 'targetSlideId', 'customShow', 'showAndReturn']),
		endpointVariant('endShow', [], ['url', 'targetSlideId', 'jump', 'customShow', 'showAndReturn']),
		endpointVariant('customShow', ['customShow', 'showAndReturn'], ['url', 'targetSlideId', 'jump']),
		Object.freeze({
			type: 'object', additionalProperties: false, required: Object.freeze(['type']), properties: endpointProperties,
			allOf: Object.freeze([
				Object.freeze({ properties: Object.freeze({ type: Object.freeze({ const: 'none' }) }) }),
				Object.freeze({ not: Object.freeze({ anyOf: Object.freeze(['url', 'targetSlideId', 'jump', 'customShow', 'showAndReturn'].map(key => Object.freeze({ required: Object.freeze([key]) }))) }) }),
				Object.freeze({ anyOf: Object.freeze([Object.freeze({ required: Object.freeze(['sound']) }), Object.freeze({ required: Object.freeze(['endSound']) })]) }),
			]),
		}),
	]),
})

export const INTERACTIVE_ACTION_SET_SCHEMA = Object.freeze({
	oneOf: Object.freeze([
		Object.freeze({ type: 'null' }),
		...INTERACTIVE_ACTION_ENDPOINT_SCHEMA.oneOf.slice(1),
		Object.freeze({
			type: 'object', additionalProperties: false, minProperties: 1,
			properties: Object.freeze({ click: INTERACTIVE_ACTION_ENDPOINT_SCHEMA, hover: INTERACTIVE_ACTION_ENDPOINT_SCHEMA }),
		}),
	]),
})

export const CUSTOM_SHOWS_SCHEMA = Object.freeze({
	oneOf: Object.freeze([
		Object.freeze({ type: 'null' }),
		Object.freeze({
			type: 'array', maxItems: 10000,
			items: Object.freeze({
				type: 'object', additionalProperties: false, required: Object.freeze(['name', 'slides']),
				properties: Object.freeze({
					name: Object.freeze({ type: 'string', minLength: 1, maxLength: 255 }),
					id: Object.freeze({ type: 'integer', minimum: 0, maximum: 4294967295 }),
					slides: Object.freeze({ type: 'array', minItems: 1, maxItems: 100000, items: Object.freeze({ type: 'string', minLength: 1, maxLength: 256 }) }),
				}),
			}),
		}),
	]),
})

export const INTERACTIVE_ACTIONS_LIFECYCLE = Object.freeze({
	action: Object.freeze({ omitted: 'preserve the current object action settings', null: 'clear both click and hover action settings', object: 'replace the supplied click/hover components' }),
	click: Object.freeze({ omitted: 'preserve the current click action', null: 'clear the current click action', object: 'replace the current click action' }),
	hover: Object.freeze({ omitted: 'preserve the current hover action', null: 'clear the current hover action', object: 'replace the current hover action' }),
	customShows: Object.freeze({ omitted: 'preserve the current custom-show collection', null: 'restore the imported/default custom-show collection', emptyArray: 'clear all authored custom shows', array: 'replace the authored custom-show collection' }),
})

export const INTERACTIVE_ACTIONS_PUBLIC_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	properties: Object.freeze({
		action: INTERACTIVE_ACTION_SET_SCHEMA,
		customShows: CUSTOM_SHOWS_SCHEMA,
	}),
})

export const INTERACTIVE_ACTIONS_CONTRACT = Object.freeze({
	id: INTERACTIVE_ACTIONS_UNIT_ID,
	rowIds: INTERACTIVE_ACTION_ROW_IDS,
	capabilityMode: 'parameterized',
	capabilityStatus: 'executable-exact-structured',
	runtimeReady: true,
	componentOwnership: Object.freeze([
		'customShows[] owns presentation-level p:custShowLst topology and presentation-to-slide relationships',
		'content[].action owns object-level cNvPr a:hlinkClick/a:hlinkHover action settings',
		'content[].shapeName owns the already-supported actionButton* preset geometry independently of action settings',
	]),
	overrideFields: Object.freeze(['customShows', 'content[].action', 'content[].shapeName']),
	resetBehavior: Object.freeze({
		component: 'set action.click, action.hover, or one custom-show collection to null/[] to remove the authored component',
		full: 'set action to null and customShows to null or [] to restore a non-interactive presentation state',
		nullBehavior: 'explicit null resets the selected component; omission preserves the current authored state',
	}),
	precedence: Object.freeze([
		'run text options.hyperlink remains a run hyperlink and never aliases an object action',
		'object action and legacy native object hyperlink must agree when both are supplied; native lifecycle owner must fail closed on disagreement',
		'media playback owns its native media action and cannot combine with a competing object interactive action',
	]),
	legalCombinations: Object.freeze([
		'independent click and hover endpoints may coexist',
		'any endpoint may stop the prior sound and may start one embedded WAV sound',
		'actionButton* geometry may be combined with any legal click/hover endpoint',
		'custom-show actions require a matching customShows[] definition so the name resolves to an exact unsigned id',
	]),
	lifecycle: INTERACTIVE_ACTIONS_LIFECYCLE,
	publicSchema: INTERACTIVE_ACTIONS_PUBLIC_SCHEMA,
})

function plainObject(value, path) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
}

function rejectUnknownKeys(value, allowed, path) {
	for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${path}.${key} is not part of the public interactive-action contract.`)
}

function nonEmptyString(value, path, maxLength) {
	if (typeof value !== 'string') throw new Error(`${path} must be a string.`)
	const normalized = value.trim()
	if (!normalized || normalized.length > maxLength) throw new Error(`${path} must be a non-empty string no longer than ${maxLength} characters.`)
	return normalized
}

function nullableBoolean(value, path) {
	if (value === null || typeof value === 'boolean') return value
	throw new Error(`${path} must be a boolean, null, or omitted.`)
}

function normalizeSound(value, path) {
	if (value === null) return null
	plainObject(value, path)
	rejectUnknownKeys(value, ['source', 'format', 'name'], path)
	if (!OWN(value, 'source')) throw new Error(`${path}.source is required.`)
	if (value.format !== 'wav') throw new Error(`${path}.format must be wav; action sounds are WAV-only.`)
	return {
		source: nonEmptyString(value.source, `${path}.source`, 10485760),
		format: 'wav',
		...(OWN(value, 'name') ? { name: nonEmptyString(value.name, `${path}.name`, 255) } : {}),
	}
}

function safeActionUrl(value, path) {
	const normalized = nonEmptyString(value, path, 8192)
	let parsed
	try { parsed = new URL(normalized) } catch { throw new Error(`${path} must be an absolute https, mailto, or tel URL.`) }
	if (!['https:', 'mailto:', 'tel:'].includes(parsed.protocol)) throw new Error(`${path} must use https, mailto, or tel; local-file and executable schemes are not supported.`)
	return normalized
}

function contextSlideIndex(context = {}) {
	const slides = Array.isArray(context.slides) ? context.slides : []
	return new Map(slides.map((slide, index) => [typeof slide === 'string' ? slide : slide?.id, index]).filter(([id]) => typeof id === 'string' && id.length > 0))
}

function contextShowIndex(context = {}) {
	const shows = Array.isArray(context.customShows) ? context.customShows : []
	return new Map(shows.map(show => [String(show.name).toLocaleLowerCase(), show]))
}

export function normalizeInteractiveActionEndpoint(value, context = {}, path = 'action') {
	if (value === null) return null
	plainObject(value, path)
	const allowed = ['type', 'url', 'targetSlideId', 'jump', 'customShow', 'showAndReturn', 'tooltip', 'history', 'highlightClick', 'endSound', 'sound']
	rejectUnknownKeys(value, allowed, path)
	const type = nonEmptyString(value.type, `${path}.type`, 32)
	if (!INTERACTIVE_ACTION_TYPES.includes(type)) throw new Error(`${path}.type must be one of ${INTERACTIVE_ACTION_TYPES.join(', ')}.`)
	const targetKeys = ['url', 'targetSlideId', 'jump', 'customShow']
	const permittedTarget = { url: 'url', slide: 'targetSlideId', jump: 'jump', customShow: 'customShow' }[type]
	for (const key of targetKeys) {
		if (key !== permittedTarget && OWN(value, key)) throw new Error(`${path}.${key} is not valid for action type ${type}.`)
	}
	if (type !== 'customShow' && OWN(value, 'showAndReturn')) throw new Error(`${path}.showAndReturn is only valid for action type customShow.`)
	const normalized = { type }
	if (type === 'url') {
		if (!OWN(value, 'url')) throw new Error(`${path}.url is required for action type url.`)
		normalized.url = safeActionUrl(value.url, `${path}.url`)
	}
	if (type === 'slide') {
		if (!OWN(value, 'targetSlideId')) throw new Error(`${path}.targetSlideId is required for action type slide.`)
		const targetSlideId = nonEmptyString(value.targetSlideId, `${path}.targetSlideId`, 256)
		const slideIndex = contextSlideIndex(context)
		if (!slideIndex.has(targetSlideId)) throw new Error(`${path}.targetSlideId must identify a slide in the same spec.`)
		Object.assign(normalized, { targetSlideId, targetSlide: slideIndex.get(targetSlideId) + 1 })
	}
	if (type === 'jump') {
		if (!OWN(value, 'jump') || !INTERACTIVE_ACTION_JUMPS.includes(value.jump)) throw new Error(`${path}.jump must be one of ${INTERACTIVE_ACTION_JUMPS.join(', ')}.`)
		normalized.jump = value.jump
	}
	if (type === 'customShow') {
		if (!OWN(value, 'customShow')) throw new Error(`${path}.customShow is required for action type customShow.`)
		if (value.showAndReturn !== true) throw new Error(`${path}.showAndReturn must be true for the safe custom-show action contract.`)
		const customShow = nonEmptyString(value.customShow, `${path}.customShow`, 255)
		const show = contextShowIndex(context).get(customShow.toLocaleLowerCase())
		if (!show) throw new Error(`${path}.customShow must name an entry in the same spec's customShows array.`)
		Object.assign(normalized, { customShow: show.name, customShowId: show.id, showAndReturn: true })
	}
	for (const key of ['history', 'highlightClick', 'endSound']) if (OWN(value, key)) normalized[key] = nullableBoolean(value[key], `${path}.${key}`)
	if (OWN(value, 'tooltip')) {
		if (value.tooltip === null) normalized.tooltip = null
		else if (typeof value.tooltip === 'string' && value.tooltip.length <= 4096) normalized.tooltip = value.tooltip
		else throw new Error(`${path}.tooltip must be a string no longer than 4096 characters, null, or omitted.`)
	}
	if (OWN(value, 'sound')) normalized.sound = normalizeSound(value.sound, `${path}.sound`)
	if (type === 'none' && !OWN(value, 'sound') && !OWN(value, 'endSound')) throw new Error(`${path} type none requires sound or endSound.`)
	return normalized
}

export function normalizeInteractiveActions(value, context = {}, path = 'action') {
	if (value === undefined) return undefined
	if (value === null) return null
	plainObject(value, path)
	if (OWN(value, 'type')) return { click: normalizeInteractiveActionEndpoint(value, context, path) }
	rejectUnknownKeys(value, ['click', 'hover'], path)
	if (!OWN(value, 'click') && !OWN(value, 'hover')) throw new Error(`${path} must contain click and/or hover, or be a direct click endpoint.`)
	return {
		...(OWN(value, 'click') ? { click: normalizeInteractiveActionEndpoint(value.click, context, `${path}.click`) } : {}),
		...(OWN(value, 'hover') ? { hover: normalizeInteractiveActionEndpoint(value.hover, context, `${path}.hover`) } : {}),
	}
}

export function normalizeCustomShows(value, slides = [], path = 'customShows') {
	if (value === undefined) return undefined
	if (value === null) return null
	if (!Array.isArray(value)) throw new Error(`${path} must be an array, null, or omitted.`)
	const slideIds = new Set((Array.isArray(slides) ? slides : []).map(slide => typeof slide === 'string' ? slide : slide?.id).filter(id => typeof id === 'string' && id.length > 0))
	const usedNames = new Set()
	const usedIds = new Set()
	for (const [index, show] of value.entries()) {
		plainObject(show, `${path}[${index}]`)
		rejectUnknownKeys(show, ['name', 'id', 'slides'], `${path}[${index}]`)
		const name = nonEmptyString(show.name, `${path}[${index}].name`, 255).toLocaleLowerCase()
		if (usedNames.has(name)) throw new Error(`${path}[${index}].name must be unique (case-insensitive).`)
		usedNames.add(name)
		if (OWN(show, 'id')) {
			if (!Number.isInteger(show.id) || show.id < 0 || show.id > 4294967295) throw new Error(`${path}[${index}].id must be an unsigned 32-bit integer.`)
			if (usedIds.has(show.id)) throw new Error(`${path}[${index}].id must be unique.`)
			usedIds.add(show.id)
		}
	}
	let nextId = 0
	return value.map((show, index) => {
		const name = nonEmptyString(show.name, `${path}[${index}].name`, 255)
		if (!Array.isArray(show.slides) || show.slides.length < 1) throw new Error(`${path}[${index}].slides must contain at least one slide id.`)
		const showSlides = show.slides.map((slideId, slideIndex) => {
			const normalized = nonEmptyString(slideId, `${path}[${index}].slides[${slideIndex}]`, 256)
			if (!slideIds.has(normalized)) throw new Error(`${path}[${index}].slides[${slideIndex}] must identify a slide in the same spec.`)
			return normalized
		})
		let id = show.id
		if (id === undefined) {
			while (usedIds.has(nextId)) nextId += 1
			id = nextId
			usedIds.add(id)
			nextId += 1
		}
		return { name, id, slides: showSlides }
	})
}

export function powerpointActionUri(endpoint) {
	if (!endpoint || typeof endpoint !== 'object') return undefined
	if (endpoint.type === 'url') return undefined
	if (endpoint.type === 'slide') return POWERPOINT_ACTION_URIS.slide
	if (endpoint.type === 'jump') return POWERPOINT_ACTION_URIS[endpoint.jump]
	if (endpoint.type === 'endShow') return POWERPOINT_ACTION_URIS.endShow
	if (endpoint.type === 'customShow') return `${POWERPOINT_ACTION_URIS.customShow}?id=${endpoint.customShowId}&return=true`
	if (endpoint.type === 'none') return POWERPOINT_ACTION_URIS.none
	return undefined
}
