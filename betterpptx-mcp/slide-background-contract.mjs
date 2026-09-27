// Background catalog controls and the portable native fill use the same
// carrier. Lower the documented catalog aliases once, without losing any
// gradient, pattern, or opaque asset-backed fill fields.
const FILL_TYPES = new Set(['none', 'solid', 'gradient', 'pattern', 'texture', 'picture'])

export function normalizeSlideBackground(value, path = 'background') {
	if (value == null) return value
	if (typeof value === 'string') {
		const color = value.trim().replace(/^#/, '')
		return color ? { color } : value
	}
	if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be a native fill object, a colour, or null.`)
	const out = { ...value }
	for (const [alias, canonical] of [['fillType', 'type'], ['fillColor', 'color'], ['fillTransparency', 'transparency']]) {
		if (!Object.prototype.hasOwnProperty.call(value, alias)) continue
		if (Object.prototype.hasOwnProperty.call(value, canonical) && value[canonical] !== value[alias]) {
			throw new Error(`${path}.${alias} and ${path}.${canonical} must agree when both are supplied.`)
		}
		const leaf = value[alias]
		if (leaf != null) {
			if (alias === 'fillType' && !FILL_TYPES.has(leaf)) throw new Error(`${path}.fillType must select a supported native fill type.`)
			if (alias === 'fillColor' && (typeof leaf !== 'string' || !/^#?[0-9a-f]{6}$/i.test(leaf))) throw new Error(`${path}.fillColor must be a six-digit colour.`)
			if (alias === 'fillTransparency' && (typeof leaf !== 'number' || !Number.isFinite(leaf) || leaf < 0 || leaf > 100 || Math.abs(leaf * 1000 - Math.round(leaf * 1000)) > 1e-7)) throw new Error(`${path}.fillTransparency must be a percentage from 0 to 100 at 0.001 precision.`)
			out[canonical] = leaf
		} else delete out[canonical]
		delete out[alias]
	}
	return out
}
