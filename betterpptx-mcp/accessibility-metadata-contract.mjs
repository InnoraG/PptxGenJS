const OWN = (value, key) => Object.prototype.hasOwnProperty.call(value, key)

export const ACCESSIBILITY_METADATA_PUBLIC_FIELDS = Object.freeze([
	'title',
	'altText',
	'decorative',
	'hiddenFromAccessibility',
])

export const ACCESSIBILITY_METADATA_PARAMETERS = Object.freeze([
	{ id: 'title', type: 'text', valueType: 'non-empty-string-or-null', minimumLength: 1, maximumLength: 4096, semanticPath: 'cNvPr.title', serializer: 'native cNvPr/@title', reset: 'set title to null', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'altText', type: 'text', valueType: 'non-empty-string-or-null', minimumLength: 1, maximumLength: 4096, semanticPath: 'cNvPr.descr', serializer: 'native cNvPr/@descr', reset: 'set altText to null', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'decorative', type: 'boolean', valueType: 'boolean-or-null', semanticPath: 'decorative', serializer: 'native adec:decorative/@val', reset: 'set decorative to null', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'hiddenFromAccessibility', type: 'boolean', valueType: 'boolean-or-null', semanticPath: 'decorative', serializer: 'compatibility alias for native adec:decorative/@val', reset: 'set hiddenFromAccessibility to null', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
])

function normalizeNullableNonEmptyText(value, path) {
	if (value === null) return null
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new Error(`${path} must be a non-empty string, null, or omitted.`)
	}
	if (value.length > 4096) throw new Error(`${path} must contain at most 4096 characters.`)
	return value
}

function normalizeNullableBoolean(value, path) {
	if (value === null || typeof value === 'boolean') return value
	throw new Error(`${path} must be a boolean, null, or omitted.`)
}

export function hasPublicAccessibilityMetadata(value) {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value) && ACCESSIBILITY_METADATA_PUBLIC_FIELDS.some(key => OWN(value, key)))
}

/**
 * Validate the collision-free public accessibility vocabulary and lower it to
 * the native/internal option names.  Own-property checks are deliberate:
 * false is a meaningful persisted value and null is a component reset.
 */
export function normalizeAccessibilityMetadata(value = {}, path = 'accessibility') {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
	const hasTitle = OWN(value, 'title')
	const hasAltText = OWN(value, 'altText')
	const hasDecorative = OWN(value, 'decorative')
	const hasHidden = OWN(value, 'hiddenFromAccessibility')
	const title = hasTitle ? normalizeNullableNonEmptyText(value.title, `${path}.title`) : undefined
	const altText = hasAltText ? normalizeNullableNonEmptyText(value.altText, `${path}.altText`) : undefined
	const decorative = hasDecorative ? normalizeNullableBoolean(value.decorative, `${path}.decorative`) : undefined
	const hidden = hasHidden ? normalizeNullableBoolean(value.hiddenFromAccessibility, `${path}.hiddenFromAccessibility`) : undefined
	if (hasDecorative && hasHidden && decorative !== hidden) {
		throw new Error(`${path}.decorative and ${path}.hiddenFromAccessibility must agree when both are provided.`)
	}
	const hasDecorativeState = hasDecorative || hasHidden
	const isDecorative = hasDecorative ? decorative : hidden
	if (isDecorative === true && ((title !== undefined && title !== null) || (altText !== undefined && altText !== null))) {
		throw new Error(`${path} cannot combine effective decorative=true with a non-null title or altText.`)
	}
	return {
		...(hasTitle ? { accessibilityTitle: title } : {}),
		...(hasAltText ? { altText } : {}),
		...(hasDecorativeState ? { isDecorative } : {}),
	}
}

export function normalizeInternalAccessibilityMetadata(value = {}, path = 'options') {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
	const hasTitle = OWN(value, 'accessibilityTitle')
	const hasAltText = OWN(value, 'altText')
	const hasDecorative = OWN(value, 'isDecorative')
	if (!hasTitle && !hasAltText && !hasDecorative) return {}
	return normalizeAccessibilityMetadata({
		...(hasTitle ? { title: value.accessibilityTitle } : {}),
		...(hasAltText ? { altText: value.altText } : {}),
		...(hasDecorative ? { decorative: value.isDecorative } : {}),
	}, path)
}

/** Convert internal/native state back to the one canonical public shape. */
export function publicAccessibilityMetadataFromOptions(value = {}) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
	return {
		...(OWN(value, 'accessibilityTitle') && value.accessibilityTitle !== undefined ? { title: value.accessibilityTitle } : {}),
		...(OWN(value, 'altText') && value.altText !== undefined ? { altText: value.altText } : {}),
		...(OWN(value, 'isDecorative') && value.isDecorative !== undefined ? { decorative: value.isDecorative } : {}),
	}
}
