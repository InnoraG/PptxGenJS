// Exact semantic contracts for native Section Zoom and Summary Zoom.
// Public callers address sections by durable ids. Native GUIDs, relationship
// ids, summary-slide construction, and Choice/Fallback package topology remain
// engine-owned implementation details.

const OWN = (value, key) => Object.prototype.hasOwnProperty.call(value, key)
const NAME_PATTERN = '^[A-Za-z0-9._:-]+$'
const THUMBNAIL_PATTERN = '^data:image/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$'

export const SECTION_SUMMARY_ZOOM_UNIT_ID = 'impl-b-b788572e1bb6d7f7'

export const SECTION_SUMMARY_ZOOM_ROWS = Object.freeze([
	Object.freeze({
		id: 'cap_5adc3514c23e1839a324',
		label: 'summary zoom',
		semanticKind: 'summaryZoom',
		executableValue: 'summaryZoom',
		semanticPath: 'summaryZoom',
	}),
	Object.freeze({
		id: 'cap_8955ad9479da6e1f4185',
		label: 'section zoom',
		semanticKind: 'sectionZoom',
		executableValue: 'sectionZoom',
		semanticPath: 'slides[].sectionZooms',
	}),
])

export const PRESENTATION_SECTION_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	required: Object.freeze(['id', 'title', 'slideIds']),
	properties: Object.freeze({
		id: Object.freeze({ type: 'string', pattern: NAME_PATTERN, minLength: 1, maxLength: 256 }),
		title: Object.freeze({ type: 'string', minLength: 1, maxLength: 4096 }),
		slideIds: Object.freeze({
			type: 'array',
			minItems: 1,
			uniqueItems: true,
			items: Object.freeze({ type: 'string', pattern: NAME_PATTERN, minLength: 1, maxLength: 256 }),
		}),
	}),
})

const ACCESSIBILITY_PROPERTIES = Object.freeze({
	title: Object.freeze({ type: ['string', 'null'], minLength: 1, maxLength: 4096 }),
	altText: Object.freeze({ type: ['string', 'null'], minLength: 1, maxLength: 4096 }),
	decorative: Object.freeze({ type: ['boolean', 'null'] }),
	hiddenFromAccessibility: Object.freeze({ type: ['boolean', 'null'] }),
})

const SECTION_ZOOM_PATCH_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	minProperties: 1,
	properties: Object.freeze({
		targetSectionId: Object.freeze({ type: 'string', pattern: NAME_PATTERN, minLength: 1, maxLength: 256 }),
		transitionDur: Object.freeze({ type: ['integer', 'null'], minimum: 0, maximum: 600000 }),
		thumbnailDataUri: Object.freeze({ type: ['string', 'null'], maxLength: 16777216, pattern: THUMBNAIL_PATTERN }),
		bbox: Object.freeze({ oneOf: Object.freeze([{ type: 'null' }, { $ref: '#/$defs/bbox' }]) }),
		rect: Object.freeze({ oneOf: Object.freeze([{ type: 'null' }, { $ref: '#/$defs/bbox' }]) }),
		...ACCESSIBILITY_PROPERTIES,
	}),
})

export const SECTION_ZOOM_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	required: Object.freeze(['name']),
	properties: Object.freeze({
		name: Object.freeze({ type: 'string', pattern: NAME_PATTERN, minLength: 1, maxLength: 256 }),
		enabled: Object.freeze({ type: 'boolean' }),
		objectName: Object.freeze({ type: 'string', pattern: NAME_PATTERN, minLength: 1, maxLength: 256 }),
		editHandle: Object.freeze({ type: 'string', minLength: 1, maxLength: 512 }),
		targetSectionId: Object.freeze({ type: 'string', pattern: NAME_PATTERN, minLength: 1, maxLength: 256 }),
		transitionDur: Object.freeze({ type: ['integer', 'null'], minimum: 0, maximum: 600000 }),
		thumbnailDataUri: Object.freeze({ type: ['string', 'null'], maxLength: 16777216, pattern: THUMBNAIL_PATTERN }),
		bbox: Object.freeze({ oneOf: Object.freeze([{ type: 'null' }, { $ref: '#/$defs/bbox' }]) }),
		rect: Object.freeze({ oneOf: Object.freeze([{ type: 'null' }, { $ref: '#/$defs/bbox' }]) }),
		preserveGeometry: Object.freeze({ type: 'boolean' }),
		...ACCESSIBILITY_PROPERTIES,
		patch: SECTION_ZOOM_PATCH_SCHEMA,
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

const SUMMARY_ZOOM_PATCH_SCHEMA = Object.freeze({
	type: 'object',
	additionalProperties: false,
	minProperties: 1,
	properties: Object.freeze({
		sectionIds: Object.freeze({ type: 'array', minItems: 1, uniqueItems: true, items: Object.freeze({ type: 'string', pattern: NAME_PATTERN, minLength: 1, maxLength: 256 }) }),
		summarySectionTitle: Object.freeze({ type: ['string', 'null'], minLength: 1, maxLength: 4096 }),
		transitionDur: Object.freeze({ type: ['integer', 'null'], minimum: 0, maximum: 600000 }),
		thumbnailDataUri: Object.freeze({ type: ['string', 'null'], maxLength: 16777216, pattern: THUMBNAIL_PATTERN }),
		...ACCESSIBILITY_PROPERTIES,
	}),
})

export const SUMMARY_ZOOM_SCHEMA = Object.freeze({
	type: ['object', 'null'],
	additionalProperties: false,
	properties: Object.freeze({
		name: Object.freeze({ type: 'string', pattern: NAME_PATTERN, minLength: 1, maxLength: 256 }),
		enabled: Object.freeze({ type: 'boolean' }),
		objectName: Object.freeze({ type: 'string', pattern: NAME_PATTERN, minLength: 1, maxLength: 256 }),
		sectionIds: Object.freeze({ type: 'array', minItems: 1, uniqueItems: true, items: Object.freeze({ type: 'string', pattern: NAME_PATTERN, minLength: 1, maxLength: 256 }) }),
		summarySectionId: Object.freeze({ type: 'string', pattern: NAME_PATTERN, minLength: 1, maxLength: 256 }),
		summarySlideId: Object.freeze({ type: 'string', pattern: NAME_PATTERN, minLength: 1, maxLength: 256 }),
		summarySectionTitle: Object.freeze({ type: ['string', 'null'], minLength: 1, maxLength: 4096 }),
		transitionDur: Object.freeze({ type: ['integer', 'null'], minimum: 0, maximum: 600000 }),
		thumbnailDataUri: Object.freeze({ type: ['string', 'null'], maxLength: 16777216, pattern: THUMBNAIL_PATTERN }),
		...ACCESSIBILITY_PROPERTIES,
		patch: SUMMARY_ZOOM_PATCH_SCHEMA,
		delete: Object.freeze({ type: 'boolean' }),
		remove: Object.freeze({ type: 'boolean' }),
		retain: Object.freeze({ type: 'boolean' }),
		preserve: Object.freeze({ type: 'boolean' }),
		action: Object.freeze({ type: 'string', enum: Object.freeze(['retain', 'unchanged', 'keep']) }),
	}),
})

const RESET = Object.freeze({
	component: 'set transitionDur, thumbnailDataUri, summarySectionTitle, title, altText, decorative, or hiddenFromAccessibility to null to restore that component default',
	full: 'remove a Section Zoom entry or set summaryZoom to null; the engine removes only relationships and generated graph nodes owned by that Zoom',
	nullBehavior: 'optional component null restores its native default; durable section targets cannot be null and missing targets fail before mutation',
})

const contractByRowId = new Map([
	[SECTION_SUMMARY_ZOOM_ROWS[0].id, Object.freeze({
		id: 'nativeSummaryZoomEntry', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', runtimeReady: true,
		componentOwnership: Object.freeze(['deck.summaryZoom', 'summaryZoom.generatedSection', 'summaryZoom.generatedSlide', 'summaryZoom.title', 'summaryZoom.choicePayload', 'summaryZoom.fallbackGroup', 'summaryZoom.thumbnails', 'summaryZoom.targetRelationships']),
		overrideFields: Object.freeze(['summaryZoom.sectionIds', 'summaryZoom.summarySectionId', 'summaryZoom.summarySlideId', 'summaryZoom.summarySectionTitle', 'summaryZoom.transitionDur', 'summaryZoom.thumbnailDataUri', 'summaryZoom.title', 'summaryZoom.altText']),
		resetBehavior: RESET,
		precedence: Object.freeze(['ordered semantic sectionIds', 'authored summary metadata including zero and false', 'engine-owned generated summary graph', 'native Summary Zoom defaults']),
		legalCombinations: Object.freeze(['one root Summary Zoom may summarize one or more nonempty content sections in an explicit semantic order and coexist with independent Section Zoom objects']),
		publicSchema: SUMMARY_ZOOM_SCHEMA,
	})],
	[SECTION_SUMMARY_ZOOM_ROWS[1].id, Object.freeze({
		id: 'nativeSectionZoomEntry', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', runtimeReady: true,
		componentOwnership: Object.freeze(['slide.sectionZoom', 'sectionZoom.choicePayload', 'sectionZoom.fallbackPicture', 'sectionZoom.thumbnail', 'sectionZoom.targetRelationship']),
		overrideFields: Object.freeze(['slides[].sectionZooms[].targetSectionId', 'slides[].sectionZooms[].transitionDur', 'slides[].sectionZooms[].thumbnailDataUri', 'slides[].sectionZooms[].bbox', 'slides[].sectionZooms[].title', 'slides[].sectionZooms[].altText']),
		resetBehavior: RESET,
		precedence: Object.freeze(['semantic targetSectionId', 'current first slide of the target section', 'authored Zoom options including zero and false', 'native Section Zoom defaults']),
		legalCombinations: Object.freeze(['one or more Section Zooms may coexist on a slide and retain destinations across section rename/reorder and slide reorder']),
		publicSchema: SECTION_ZOOM_SCHEMA,
	})],
])

export function sectionSummaryZoomCapabilityContractForEntry(entry = {}) {
	return contractByRowId.get(String(entry.id || '')) || null
}

function plainObject(value, path) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
}

function nonEmptyString(value, path, maxLength = 4096, pattern = null) {
	if (typeof value !== 'string') throw new Error(`${path} must be a string.`)
	const out = value.trim()
	if (!out || out.length > maxLength) throw new Error(`${path} must be a non-empty string no longer than ${maxLength} characters.`)
	if (pattern && !pattern.test(out)) throw new Error(`${path} contains unsupported characters.`)
	return out
}

function rejectUnknown(value, allowed, path) {
	for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${path}.${key} is not part of the public Section/Summary Zoom contract.`)
}

function normalizeDuration(value, path) {
	if (value === null) return null
	const out = Number(value)
	if (!Number.isInteger(out) || out < 0 || out > 600000) throw new Error(`${path} must be an integer from 0 through 600000, null, or omitted.`)
	return out
}

function normalizeThumbnail(value, path) {
	if (value === null) return null
	if (typeof value !== 'string' || value.length > 16777216 || !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
		throw new Error(`${path} must be a PNG/JPEG data URI no longer than 16 MiB, null, or omitted.`)
	}
	return value
}

function normalizeAccessibility(value, path) {
	const out = { ...value }
	for (const key of ['title', 'altText']) {
		if (OWN(value, key) && value[key] !== null) out[key] = nonEmptyString(value[key], `${path}.${key}`)
	}
	for (const key of ['decorative', 'hiddenFromAccessibility']) {
		if (OWN(value, key) && value[key] !== null && typeof value[key] !== 'boolean') throw new Error(`${path}.${key} must be a boolean, null, or omitted.`)
	}
	if (OWN(value, 'decorative') && OWN(value, 'hiddenFromAccessibility') && value.decorative !== null && value.hiddenFromAccessibility !== null && value.decorative !== value.hiddenFromAccessibility) {
		throw new Error(`${path}.decorative and ${path}.hiddenFromAccessibility must agree when both are supplied.`)
	}
	const decorative = value.decorative === true || value.hiddenFromAccessibility === true
	if (decorative && (value.title != null || value.altText != null)) throw new Error(`${path} cannot combine decorative=true with non-null title or altText.`)
	return out
}

function normalizeSectionIds(value, path, knownSectionIds, { required = false } = {}) {
	if (value === undefined && !required) return undefined
	if (!Array.isArray(value) || !value.length) throw new Error(`${path} must be a non-empty array of semantic section IDs.`)
	const out = value.map((id, index) => nonEmptyString(id, `${path}[${index}]`, 256, /^[A-Za-z0-9._:-]+$/))
	if (new Set(out).size !== out.length) throw new Error(`${path} must not contain duplicate section IDs.`)
	if (knownSectionIds) for (const id of out) if (!knownSectionIds.has(id)) throw new Error(`${path} references missing semantic section ${id}.`)
	return out
}

export function normalizePresentationSections(value, slides = [], path = 'sections') {
	if (value === undefined || value === null) return value
	if (!Array.isArray(value)) throw new Error(`${path} must be an array, null, or omitted.`)
	const knownSlideIds = new Set((Array.isArray(slides) ? slides : []).map(slide => String(slide?.id || '')).filter(Boolean))
	const ids = new Set()
	const assignedSlides = new Set()
	return value.map((section, index) => {
		const itemPath = `${path}[${index}]`
		plainObject(section, itemPath)
		rejectUnknown(section, ['id', 'title', 'slideIds'], itemPath)
		const id = nonEmptyString(section.id, `${itemPath}.id`, 256, /^[A-Za-z0-9._:-]+$/)
		if (ids.has(id)) throw new Error(`${path} must not contain duplicate section id ${id}.`)
		ids.add(id)
		const title = nonEmptyString(section.title, `${itemPath}.title`)
		if (!Array.isArray(section.slideIds) || !section.slideIds.length) throw new Error(`${itemPath}.slideIds must be a non-empty array.`)
		const slideIds = section.slideIds.map((slideId, slideIndex) => nonEmptyString(slideId, `${itemPath}.slideIds[${slideIndex}]`, 256, /^[A-Za-z0-9._:-]+$/))
		if (new Set(slideIds).size !== slideIds.length) throw new Error(`${itemPath}.slideIds must not contain duplicate slide IDs.`)
		for (const slideId of slideIds) {
			if (knownSlideIds.size && !knownSlideIds.has(slideId)) throw new Error(`${itemPath}.slideIds references missing semantic slide ${slideId}.`)
			if (assignedSlides.has(slideId)) throw new Error(`${path} assigns semantic slide ${slideId} to more than one section.`)
			assignedSlides.add(slideId)
		}
		return { id, title, slideIds }
	})
}

const SECTION_ZOOM_KEYS = Object.freeze(Object.keys(SECTION_ZOOM_SCHEMA.properties))
const SECTION_ZOOM_PATCH_KEYS = Object.freeze(Object.keys(SECTION_ZOOM_PATCH_SCHEMA.properties))

function hasPatchIntent(value) {
	return Boolean(value?.patch || value?.delete === true || value?.remove === true || value?.retain === true || value?.preserve === true || value?.action || value?.reorderToIndex !== undefined || value?.toIndex !== undefined || value?.position !== undefined)
}

function normalizeSectionZoomPatch(value, path) {
	plainObject(value, path)
	rejectUnknown(value, SECTION_ZOOM_PATCH_KEYS, path)
	if (!Object.keys(value).length) throw new Error(`${path} must contain at least one patch field.`)
	if (OWN(value, 'bbox') && OWN(value, 'rect')) throw new Error(`${path} cannot provide both bbox and rect.`)
	const out = normalizeAccessibility(value, path)
	if (OWN(value, 'targetSectionId')) out.targetSectionId = nonEmptyString(value.targetSectionId, `${path}.targetSectionId`, 256, /^[A-Za-z0-9._:-]+$/)
	if (OWN(value, 'transitionDur')) out.transitionDur = normalizeDuration(value.transitionDur, `${path}.transitionDur`)
	if (OWN(value, 'thumbnailDataUri')) out.thumbnailDataUri = normalizeThumbnail(value.thumbnailDataUri, `${path}.thumbnailDataUri`)
	return out
}

export function normalizeSectionZoom(value, context = {}, path = 'sectionZoom') {
	plainObject(value, path)
	rejectUnknown(value, SECTION_ZOOM_KEYS, path)
	if (OWN(value, 'bbox') && OWN(value, 'rect')) throw new Error(`${path} cannot provide both bbox and rect.`)
	const patchIntent = hasPatchIntent(value)
	const out = normalizeAccessibility(value, path)
	out.name = nonEmptyString(value.name || value.objectName, `${path}.name`, 256, /^[A-Za-z0-9._:-]+$/)
	if (OWN(value, 'enabled')) {
		if (typeof value.enabled !== 'boolean') throw new Error(`${path}.enabled must be a boolean.`)
		out.enabled = value.enabled
	}
	if (OWN(value, 'objectName')) out.objectName = nonEmptyString(value.objectName, `${path}.objectName`, 256, /^[A-Za-z0-9._:-]+$/)
	if (!patchIntent && value.enabled !== true && !OWN(value, 'targetSectionId')) throw new Error(`${path}.targetSectionId is required when creating a Section Zoom.`)
	if (OWN(value, 'targetSectionId')) {
		out.targetSectionId = nonEmptyString(value.targetSectionId, `${path}.targetSectionId`, 256, /^[A-Za-z0-9._:-]+$/)
		if (!patchIntent && context.knownSectionIds && !context.knownSectionIds.has(out.targetSectionId)) throw new Error(`${path}.targetSectionId must name an existing semantic section.`)
	}
	if (OWN(value, 'transitionDur')) out.transitionDur = normalizeDuration(value.transitionDur, `${path}.transitionDur`)
	if (OWN(value, 'thumbnailDataUri')) out.thumbnailDataUri = normalizeThumbnail(value.thumbnailDataUri, `${path}.thumbnailDataUri`)
	if (OWN(value, 'patch')) out.patch = normalizeSectionZoomPatch(value.patch, `${path}.patch`)
	return out
}

const SUMMARY_ZOOM_KEYS = Object.freeze(Object.keys(SUMMARY_ZOOM_SCHEMA.properties))
const SUMMARY_ZOOM_PATCH_KEYS = Object.freeze(Object.keys(SUMMARY_ZOOM_PATCH_SCHEMA.properties))

function normalizeSummaryZoomPatch(value, context, path) {
	plainObject(value, path)
	rejectUnknown(value, SUMMARY_ZOOM_PATCH_KEYS, path)
	if (!Object.keys(value).length) throw new Error(`${path} must contain at least one patch field.`)
	const out = normalizeAccessibility(value, path)
	if (OWN(value, 'sectionIds')) out.sectionIds = normalizeSectionIds(value.sectionIds, `${path}.sectionIds`, context.knownSectionIds)
	if (OWN(value, 'summarySectionTitle') && value.summarySectionTitle !== null) out.summarySectionTitle = nonEmptyString(value.summarySectionTitle, `${path}.summarySectionTitle`)
	if (OWN(value, 'transitionDur')) out.transitionDur = normalizeDuration(value.transitionDur, `${path}.transitionDur`)
	if (OWN(value, 'thumbnailDataUri')) out.thumbnailDataUri = normalizeThumbnail(value.thumbnailDataUri, `${path}.thumbnailDataUri`)
	return out
}

export function normalizeSummaryZoom(value, context = {}, path = 'summaryZoom') {
	if (value === null) return null
	plainObject(value, path)
	rejectUnknown(value, SUMMARY_ZOOM_KEYS, path)
	const out = normalizeAccessibility(value, path)
	if (OWN(value, 'enabled')) {
		if (typeof value.enabled !== 'boolean') throw new Error(`${path}.enabled must be a boolean.`)
		out.enabled = value.enabled
	}
	for (const key of ['name', 'objectName', 'summarySectionId', 'summarySlideId']) {
		if (OWN(value, key)) out[key] = nonEmptyString(value[key], `${path}.${key}`, 256, /^[A-Za-z0-9._:-]+$/)
	}
	if (!out.name) out.name = out.objectName || 'summary-zoom'
	if (OWN(value, 'sectionIds')) out.sectionIds = normalizeSectionIds(value.sectionIds, `${path}.sectionIds`, hasPatchIntent(value) ? null : context.knownSectionIds)
	if (OWN(value, 'summarySectionTitle') && value.summarySectionTitle !== null) out.summarySectionTitle = nonEmptyString(value.summarySectionTitle, `${path}.summarySectionTitle`)
	if (OWN(value, 'transitionDur')) out.transitionDur = normalizeDuration(value.transitionDur, `${path}.transitionDur`)
	if (OWN(value, 'thumbnailDataUri')) out.thumbnailDataUri = normalizeThumbnail(value.thumbnailDataUri, `${path}.thumbnailDataUri`)
	if (OWN(value, 'patch')) out.patch = normalizeSummaryZoomPatch(value.patch, context, `${path}.patch`)
	return out
}

export function normalizeSectionSummaryZoomSpec(spec = {}, options = {}) {
	const slides = Array.isArray(spec.slides) ? spec.slides : []
	const normalizedSections = OWN(spec, 'sections') ? normalizePresentationSections(spec.sections, options.patchMode ? [] : slides) : spec.sections
	const knownSectionIds = Array.isArray(normalizedSections) ? new Set(normalizedSections.map(section => section.id)) : null
	let changed = normalizedSections !== spec.sections
	const nextSlides = slides.map((slide, slideIndex) => {
		if (!slide || typeof slide !== 'object') return slide
		let next = slide
		for (const field of ['sectionZoom', 'sectionZooms']) {
			if (!OWN(slide, field) || slide[field] === null) continue
			const values = field === 'sectionZooms' ? slide[field] : [slide[field]]
			if (!Array.isArray(values)) throw new Error(`slides[${slideIndex}].${field} must be ${field === 'sectionZooms' ? 'an array' : 'an object'}, null, or omitted.`)
			const normalized = values.map((value, index) => normalizeSectionZoom(value, { knownSectionIds: options.patchMode ? null : knownSectionIds }, `slides[${slideIndex}].${field}${field === 'sectionZooms' ? `[${index}]` : ''}`))
			next = { ...next, [field]: field === 'sectionZooms' ? normalized : normalized[0] }
			changed = true
		}
		return next
	})
	const out = changed ? { ...spec, slides: nextSlides, ...(OWN(spec, 'sections') ? { sections: normalizedSections } : {}) } : spec
	if (!OWN(out, 'summaryZoom')) return out
	return { ...out, summaryZoom: normalizeSummaryZoom(out.summaryZoom, { knownSectionIds: options.patchMode ? null : knownSectionIds }) }
}
