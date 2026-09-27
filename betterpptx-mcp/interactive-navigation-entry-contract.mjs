// Exact public contracts for the two internal-slide navigation entry points.
// An ordinary jump is an Action Settings relationship on an existing object;
// a Slide Zoom is a distinct native visual object with its own zoom payload and
// a hyperlinked picture fallback.  Keeping them separate prevents the fallback
// hyperlink from being misreported as the whole Slide Zoom feature.

import { INTERACTIVE_ACTION_ENDPOINT_SCHEMA } from './interactive-actions-contract.mjs'

const OWN = (value, key) => Object.prototype.hasOwnProperty.call(value, key)

export const INTERACTIVE_NAVIGATION_UNIT_ID = 'impl-b-3f5d04322d51e076'

export const INTERACTIVE_NAVIGATION_ROWS = Object.freeze([
	Object.freeze({
		id: 'cap_3cbed884e2e57a42232c',
		label: 'slide zoom',
		semanticKind: 'slideZoom',
		executableValue: 'slideZoom',
		semanticPath: 'slides[].content[kind=slideZoom]',
	}),
	Object.freeze({
		id: 'cap_f4961a44a304c4d91694',
		label: 'jump to slide',
		semanticKind: 'interactiveAction',
		executableValue: 'slide',
		semanticPath: 'slides[].content[].action.{click,hover}',
	}),
])

const SLIDE_ZOOM_PATCH_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	minProperties: 1,
	properties: Object.freeze({
		targetSlideId: Object.freeze({ type: 'string', minLength: 1, maxLength: 256 }),
		returnToParent: Object.freeze({ type: ['boolean', 'null'] }),
		transitionDur: Object.freeze({ type: ['integer', 'null'], minimum: 0, maximum: 600000 }),
		thumbnailDataUri: Object.freeze({ type: ['string', 'null'], maxLength: 16777216, pattern: '^data:image/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$' }),
		title: Object.freeze({ type: ['string', 'null'], minLength: 1, maxLength: 4096 }),
		altText: Object.freeze({ type: ['string', 'null'], minLength: 1, maxLength: 4096 }),
		decorative: Object.freeze({ type: ['boolean', 'null'] }),
		hiddenFromAccessibility: Object.freeze({ type: ['boolean', 'null'] }),
		bbox: Object.freeze({ oneOf: Object.freeze([{ type: 'null' }, { $ref: '#/$defs/bbox' }]) }),
		rect: Object.freeze({ oneOf: Object.freeze([{ type: 'null' }, { $ref: '#/$defs/bbox' }]) }),
	}),
})

export const SLIDE_ZOOM_BLOCK_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	required: Object.freeze(['kind', 'name']),
	properties: Object.freeze({
		kind: Object.freeze({ const: 'slideZoom' }),
		name: Object.freeze({ type: 'string', pattern: '^[A-Za-z0-9._:-]+$' }),
		objectName: Object.freeze({ type: 'string', pattern: '^[A-Za-z0-9._:-]+$' }),
		editHandle: Object.freeze({ type: 'string', minLength: 1, maxLength: 512 }),
		role: Object.freeze({ type: 'string', maxLength: 256 }),
		region: Object.freeze({ type: 'string', maxLength: 256 }),
		targetSlideId: Object.freeze({ type: 'string', minLength: 1, maxLength: 256 }),
		returnToParent: Object.freeze({ type: ['boolean', 'null'] }),
		transitionDur: Object.freeze({ type: ['integer', 'null'], minimum: 0, maximum: 600000 }),
		thumbnailDataUri: Object.freeze({
			type: ['string', 'null'],
			maxLength: 16777216,
			pattern: '^data:image/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$',
		}),
		title: Object.freeze({ type: ['string', 'null'], minLength: 1, maxLength: 4096 }),
		altText: Object.freeze({ type: ['string', 'null'], minLength: 1, maxLength: 4096 }),
		decorative: Object.freeze({ type: ['boolean', 'null'] }),
		hiddenFromAccessibility: Object.freeze({ type: ['boolean', 'null'] }),
		bbox: Object.freeze({ oneOf: Object.freeze([{ type: 'null' }, { $ref: '#/$defs/bbox' }]) }),
		rect: Object.freeze({ oneOf: Object.freeze([{ type: 'null' }, { $ref: '#/$defs/bbox' }]) }),
		preserveGeometry: Object.freeze({ type: 'boolean' }),
		patch: SLIDE_ZOOM_PATCH_SCHEMA,
		delete: Object.freeze({ type: 'boolean' }),
		remove: Object.freeze({ type: 'boolean' }),
		retain: Object.freeze({ type: 'boolean' }),
		preserve: Object.freeze({ type: 'boolean' }),
		action: Object.freeze({ type: 'string', enum: Object.freeze(['retain', 'unchanged', 'keep']) }),
		reorderToIndex: Object.freeze({ type: 'integer', minimum: 0 }),
		toIndex: Object.freeze({ type: 'integer', minimum: 0 }),
		position: Object.freeze({ type: 'string', enum: Object.freeze(['front', 'back', 'forward', 'backward']) }),
	}),
})

const JUMP_TO_SLIDE_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	required: Object.freeze(['type', 'targetSlideId']),
	properties: Object.freeze({
		type: Object.freeze({ const: 'slide' }),
		targetSlideId: Object.freeze({ type: 'string', minLength: 1, maxLength: 256 }),
		tooltip: Object.freeze({ type: ['string', 'null'], maxLength: 4096 }),
		history: Object.freeze({ type: ['boolean', 'null'] }),
		highlightClick: Object.freeze({ type: ['boolean', 'null'] }),
		endSound: Object.freeze({ type: ['boolean', 'null'] }),
		sound: Object.freeze(INTERACTIVE_ACTION_ENDPOINT_SCHEMA.oneOf[1].properties.sound),
	}),
})

const RESET = Object.freeze({
	component: 'set returnToParent, transitionDur, thumbnailDataUri, bbox, action.click, or action.hover to null to restore that component default',
	full: 'remove the slideZoom content block or set the owning object action to null',
	nullBehavior: 'null resets the named optional component; targetSlideId is required for creation, non-null when edited, and a missing target fails closed',
})

const contractByRowId = new Map([
	[INTERACTIVE_NAVIGATION_ROWS[0].id, Object.freeze({
		id: 'nativeSlideZoomEntry',
		capabilityMode: 'parameterized',
		capabilityStatus: 'executable-exact-structured',
		runtimeReady: true,
		componentOwnership: Object.freeze(['slide.zoomNavigation', 'slideZoom.choicePayload', 'slideZoom.fallbackPicture', 'slideZoom.thumbnail', 'slideZoom.targetRelationship']),
		overrideFields: Object.freeze(['content[].targetSlideId', 'content[].returnToParent', 'content[].transitionDur', 'content[].thumbnailDataUri', 'content[].bbox', 'content[].title', 'content[].altText']),
		resetBehavior: RESET,
		precedence: Object.freeze(['semantic targetSlideId', 'authored zoom options including false and zero', 'engine-owned placement when bbox is omitted', 'native Slide Zoom defaults']),
		legalCombinations: Object.freeze(['one or more native Slide Zoom blocks may coexist with ordinary click/hover slide actions, sections, transitions, and other editable content']),
		publicSchema: SLIDE_ZOOM_BLOCK_SCHEMA,
	})],
	[INTERACTIVE_NAVIGATION_ROWS[1].id, Object.freeze({
		id: 'jumpToSlideActionEntry',
		capabilityMode: 'parameterized',
		capabilityStatus: 'executable-exact-structured',
		runtimeReady: true,
		componentOwnership: Object.freeze(['object.interactiveAction', 'object.targetSlideRelationship']),
		overrideFields: Object.freeze(['content[].action.click', 'content[].action.hover', 'content[].action.{click,hover}.targetSlideId', 'content[].action.{click,hover}.tooltip']),
		resetBehavior: RESET,
		precedence: Object.freeze(['authored click/hover endpoint', 'semantic targetSlideId', 'resolved internal slide relationship']),
		legalCombinations: Object.freeze(['independent click and hover slide destinations may coexist with tooltips, supported action metadata, action-button geometry, and neighboring Slide Zoom objects']),
		publicSchema: JUMP_TO_SLIDE_SCHEMA,
	})],
])

export function interactiveNavigationCapabilityContractForEntry(entry = {}) {
	return contractByRowId.get(String(entry.id || '')) || null
}

function nonEmptyString(value, path, maxLength) {
	if (typeof value !== 'string') throw new Error(`${path} must be a string.`)
	const normalized = value.trim()
	if (!normalized || normalized.length > maxLength) throw new Error(`${path} must be a non-empty string no longer than ${maxLength} characters.`)
	return normalized
}

function normalizeNullableBoolean(value, path) {
	if (value === null || typeof value === 'boolean') return value
	throw new Error(`${path} must be a boolean, null, or omitted.`)
}

function normalizeNullableDuration(value, path) {
	if (value === null) return null
	const number = Number(value)
	if (!Number.isInteger(number) || number < 0 || number > 600000) throw new Error(`${path} must be an integer from 0 through 600000, null, or omitted.`)
	return number
}

function normalizeThumbnail(value, path) {
	if (value === null) return null
	if (typeof value !== 'string' || value.length > 16777216 || !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
		throw new Error(`${path} must be a PNG/JPEG data URI no longer than 16 MiB, null, or omitted.`)
	}
	return value
}

const SLIDE_ZOOM_KEYS = Object.freeze(Object.keys(SLIDE_ZOOM_BLOCK_SCHEMA.properties))
const SLIDE_ZOOM_PATCH_KEYS = Object.freeze([
	'targetSlideId',
	'returnToParent',
	'transitionDur',
	'thumbnailDataUri',
	'bbox',
	'rect',
	'title',
	'altText',
	'decorative',
	'hiddenFromAccessibility',
])

function hasPatchDirective(value) {
	return Boolean(
		value?.patch && typeof value.patch === 'object' && !Array.isArray(value.patch)
		|| value?.delete === true
		|| value?.remove === true
		|| value?.retain === true
		|| value?.preserve === true
		|| value?.action
		|| value?.reorderToIndex !== undefined
		|| value?.toIndex !== undefined
		|| value?.position !== undefined
	)
}

function normalizeTargetSlideId(value, context, path) {
	const targetSlideId = nonEmptyString(value, path, 256)
	const slides = Array.isArray(context.slides) ? context.slides : []
	const targetIndex = slides.findIndex(slide => String(slide?.id || '') === targetSlideId)
	if (targetIndex < 0) throw new Error(`${path} must name an existing semantic slide.`)
	if (context.sourceSlideId && String(context.sourceSlideId) === targetSlideId) throw new Error(`${path} cannot name the Slide Zoom's own source slide.`)
	return targetSlideId
}

function normalizeSlideZoomPatch(value, context, path) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
	for (const key of Object.keys(value)) if (!SLIDE_ZOOM_PATCH_KEYS.includes(key)) throw new Error(`${path}.${key} is not a supported Slide Zoom patch field.`)
	if (!Object.keys(value).length) throw new Error(`${path} must contain at least one Slide Zoom patch field.`)
	if (OWN(value, 'bbox') && OWN(value, 'rect')) throw new Error(`${path} cannot provide both bbox and rect.`)
	const out = { ...value }
	if (OWN(value, 'targetSlideId')) {
		if (value.targetSlideId === null) throw new Error(`${path}.targetSlideId cannot be reset; provide an existing semantic slide ID.`)
		out.targetSlideId = nonEmptyString(value.targetSlideId, `${path}.targetSlideId`, 256)
		if (context.sourceSlideId && String(context.sourceSlideId) === out.targetSlideId) throw new Error(`${path}.targetSlideId cannot name the Slide Zoom's own source slide.`)
	}
	if (OWN(value, 'returnToParent')) out.returnToParent = normalizeNullableBoolean(value.returnToParent, `${path}.returnToParent`)
	if (OWN(value, 'transitionDur')) out.transitionDur = normalizeNullableDuration(value.transitionDur, `${path}.transitionDur`)
	if (OWN(value, 'thumbnailDataUri')) out.thumbnailDataUri = normalizeThumbnail(value.thumbnailDataUri, `${path}.thumbnailDataUri`)
	return out
}

export function normalizeSlideZoomBlock(value, context = {}, path = 'content[]') {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
	for (const key of Object.keys(value)) if (!SLIDE_ZOOM_KEYS.includes(key)) throw new Error(`${path}.${key} is not part of the public Slide Zoom contract.`)
	if (value.kind !== 'slideZoom') throw new Error(`${path}.kind must be slideZoom.`)
	const name = nonEmptyString(value.name, `${path}.name`, 256)
	if (!/^[A-Za-z0-9._:-]+$/.test(name)) throw new Error(`${path}.name must use only letters, numbers, dot, underscore, colon, or hyphen.`)
	const patchDirective = hasPatchDirective(value)
	if (OWN(value, 'bbox') && OWN(value, 'rect')) throw new Error(`${path} cannot provide both bbox and rect.`)
	if (!patchDirective && !OWN(value, 'targetSlideId')) throw new Error(`${path}.targetSlideId is required when creating a Slide Zoom.`)
	const out = { ...value, name }
	if (OWN(value, 'targetSlideId')) {
		out.targetSlideId = patchDirective
			? nonEmptyString(value.targetSlideId, `${path}.targetSlideId`, 256)
			: normalizeTargetSlideId(value.targetSlideId, context, `${path}.targetSlideId`)
		if (context.sourceSlideId && String(context.sourceSlideId) === out.targetSlideId) throw new Error(`${path}.targetSlideId cannot name the Slide Zoom's own source slide.`)
	}
	if (OWN(value, 'objectName')) out.objectName = nonEmptyString(value.objectName, `${path}.objectName`, 256)
	if (OWN(value, 'returnToParent')) out.returnToParent = normalizeNullableBoolean(value.returnToParent, `${path}.returnToParent`)
	if (OWN(value, 'transitionDur')) out.transitionDur = normalizeNullableDuration(value.transitionDur, `${path}.transitionDur`)
	if (OWN(value, 'thumbnailDataUri')) out.thumbnailDataUri = normalizeThumbnail(value.thumbnailDataUri, `${path}.thumbnailDataUri`)
	if (OWN(value, 'patch')) out.patch = normalizeSlideZoomPatch(value.patch, context, `${path}.patch`)
	return out
}

export function normalizeSlideZoomBlocksInSpec(spec = {}) {
	const slides = Array.isArray(spec.slides) ? spec.slides : []
	let changed = false
	const nextSlides = slides.map((slide, slideIndex) => {
		const content = Array.isArray(slide?.content) ? slide.content : []
		let slideChanged = false
		const nextContent = content.map((block, blockIndex) => {
			if (block?.kind !== 'slideZoom') return block
			slideChanged = true
			changed = true
			return normalizeSlideZoomBlock(block, { slides, sourceSlideId: slide?.id }, `slides[${slideIndex}].content[${blockIndex}]`)
		})
		return slideChanged ? { ...slide, content: nextContent } : slide
	})
	return changed ? { ...spec, slides: nextSlides } : spec
}
