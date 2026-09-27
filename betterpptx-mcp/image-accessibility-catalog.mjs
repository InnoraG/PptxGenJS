// Typed native image accessibility contract shared by the private compiler and public catalog.
export const IMAGE_ACCESSIBILITY_PARAMETERS = [
	{
		id: 'altText',
		type: 'structured',
		valueType: 'string',
		minimumLength: 1,
		maximumLength: 1000,
		semanticPath: 'content[].altText',
		serializer: 'native picture p:cNvPr/@descr',
		capabilityMode: 'parameterized',
		capabilityStatus: 'executable-exact-structured',
		reset: 'set altText to null to restore the engine/asset fallback description',
		limitation: 'Author a concise visual description; private filesystem paths, implementation names, data URIs, and opaque asset handles are rejected from the semantic description.',
	},
]

const PRIVATE_ALT_TEXT = /(?:[A-Z]:[\\/]|(?:^|[\\/])(?:node_modules|PptxGenJS_Claude|betterpptx-mcp)(?:[\\/]|$)|file:\/\/|data:image\/|asset:\/\/|https?:\/\/)/i

export function validateImageAccessibilityOptions(value, path = 'imageAccessibility') {
	if (value == null) return null
	if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object or null.`)
	if (value.altText !== undefined && value.altText !== null) {
		if (typeof value.altText !== 'string' || !value.altText.trim()) throw new Error(`${path}.altText must be a non-empty string.`)
		if (value.altText.length > 1000) throw new Error(`${path}.altText must be at most 1000 characters.`)
		if (PRIVATE_ALT_TEXT.test(value.altText)) throw new Error(`${path}.altText must be semantic text and must not contain private paths, implementation names, URLs, data URIs, or asset handles.`)
	}
	return { ...(value.altText !== undefined ? { altText: value.altText === null ? null : value.altText.trim() } : {}) }
}

export function validateImageAltText(value, path = 'image.altText') {
	if (value === undefined || value === null) return null
	return validateImageAccessibilityOptions({ altText: value }, path.replace(/\.altText$/, ''))?.altText || null
}
