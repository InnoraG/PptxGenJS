// Exact public contract for the frozen "add hyperlink" capability row.
// Relationship identifiers are engine-owned; callers author only semantic
// destinations and the native target-frame/tooltip attributes.

export const HYPERLINK_ENTRY_UNIT_ID = 'impl-b-dd9d9170d70c8ce8'
export const HYPERLINK_ENTRY_ROW_ID = 'cap_ec04790e0410160fc4c3'

export const HYPERLINK_TARGET_MAX_LENGTH = 255
export const HYPERLINK_TOOLTIP_MAX_LENGTH = 1024
export const HYPERLINK_URL_MAX_LENGTH = 4096
export const HYPERLINK_SAFE_TARGETS = Object.freeze(['_blank', '_self', '_parent', '_top'])

const SAFE_URL_PATTERN = '^(?:https://|mailto:|tel:)[^\\s]+$'

export const HYPERLINK_PUBLIC_SCHEMA = Object.freeze({
	oneOf: [
		{ type: 'null' },
		{
			type: 'object',
			required: ['url'],
			additionalProperties: false,
			properties: {
				url: { type: 'string', minLength: 1, maxLength: HYPERLINK_URL_MAX_LENGTH, pattern: SAFE_URL_PATTERN },
				tooltip: { type: ['string', 'null'], minLength: 1, maxLength: HYPERLINK_TOOLTIP_MAX_LENGTH },
				target: { type: ['string', 'null'], enum: [...HYPERLINK_SAFE_TARGETS, null], maxLength: HYPERLINK_TARGET_MAX_LENGTH },
			},
		},
		{
			type: 'object',
			required: ['slide'],
			additionalProperties: false,
			properties: {
				slide: { type: 'integer', minimum: 1 },
				tooltip: { type: ['string', 'null'], minLength: 1, maxLength: HYPERLINK_TOOLTIP_MAX_LENGTH },
			},
		},
	],
	description: 'Native click hyperlink. Provide exactly one safe external URL or 1-based internal slide destination. target maps to the URL-only native target frame; null removes that attribute. Set the whole hyperlink to null to remove its relationship while retaining the object.',
})

function own(value, key) {
	return Object.prototype.hasOwnProperty.call(value, key)
}

function plainObject(value, path) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object, null, or omitted.`)
}

function safeString(value, path, maxLength) {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} must be a non-empty string.`)
	const normalized = value.trim()
	if (normalized.length > maxLength) throw new Error(`${path} must be at most ${maxLength} characters.`)
	if (/[\u0000-\u001F\u007F]/.test(normalized)) throw new Error(`${path} must not contain control characters.`)
	return normalized
}

function safeExternalUrl(value, path) {
	const url = safeString(value, path, HYPERLINK_URL_MAX_LENGTH)
	if (!/^(?:https:\/\/|mailto:|tel:)[^\s]+$/i.test(url)) throw new Error(`${path} must use https, mailto, or tel.`)
	return url
}

export function normalizeHyperlink(value, path = 'hyperlink') {
	if (value == null) return value
	plainObject(value, path)
	const allowed = new Set(['url', 'slide', 'tooltip', 'target'])
	for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${path}.${key} is not part of the public hyperlink contract.`)
	const hasUrl = own(value, 'url') && value.url !== null && value.url !== ''
	const hasSlide = own(value, 'slide') && value.slide !== null
	if (hasUrl === hasSlide) throw new Error(`${path} must contain exactly one of url or slide.`)
	const normalized = hasUrl
		? { url: safeExternalUrl(value.url, `${path}.url`) }
		: { slide: value.slide }
	if (hasSlide && (!Number.isInteger(value.slide) || value.slide < 1)) throw new Error(`${path}.slide must be a positive 1-based slide number.`)
	if (own(value, 'tooltip') && value.tooltip !== null) normalized.tooltip = safeString(value.tooltip, `${path}.tooltip`, HYPERLINK_TOOLTIP_MAX_LENGTH)
	if (own(value, 'target')) {
		if (!hasUrl) throw new Error(`${path}.target is valid only with an external url.`)
		if (value.target !== null) {
			const target = safeString(value.target, `${path}.target`, HYPERLINK_TARGET_MAX_LENGTH)
			if (!HYPERLINK_SAFE_TARGETS.includes(target)) throw new Error(`${path}.target must be one of ${HYPERLINK_SAFE_TARGETS.join(', ')}.`)
			normalized.target = target
		}
	}
	return normalized
}

export const HYPERLINK_ENTRY_CONTRACT = Object.freeze({
	id: 'nativeHyperlinkEntry',
	unitId: HYPERLINK_ENTRY_UNIT_ID,
	rowIds: Object.freeze([HYPERLINK_ENTRY_ROW_ID]),
	capabilityMode: 'parameterized',
	capabilityStatus: 'executable-exact-structured',
	componentOwnership: Object.freeze(['relationships', 'hyperlink']),
	overrideFields: Object.freeze(['hyperlink.url', 'hyperlink.slide', 'hyperlink.tooltip', 'hyperlink.target']),
	resetBehavior: Object.freeze({
		component: 'set hyperlink to null',
		full: 'remove authored hyperlink relationships',
		nullBehavior: 'remove the hyperlink and retain the target object',
	}),
	precedence: Object.freeze(['imported hyperlink preservation', 'authored semantic hyperlink replacement', 'hyperlink null reset']),
	legalCombinations: Object.freeze([
		'HTTPS, mailto, or tel URL with optional tooltip and native target frame',
		'1-based internal slide destination with optional tooltip',
		'run, whole-text, shape, picture, connector, and table rich-run carriers',
		'update, reset, re-edit, delete, export/recompile, and slide reorder without relationship drift',
	]),
	publicSchema: HYPERLINK_PUBLIC_SCHEMA,
	runtimeReady: true,
})

export function hyperlinkEntryCapabilityContractForEntry(entry) {
	return entry?.id === HYPERLINK_ENTRY_ROW_ID ? HYPERLINK_ENTRY_CONTRACT : null
}
