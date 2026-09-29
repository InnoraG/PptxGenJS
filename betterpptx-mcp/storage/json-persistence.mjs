// A shared JSON persistence boundary, independent of provider configuration and
// request hashing. Omit optional object fields, keep array slots as null, and
// retain explicit null/false/zero, finite numbers and valid dates. Callers supply
// their existing typed error without exposing a field path or provider detail.
export function jsonPersistenceValue(value, createError = () => new TypeError('The value must be JSON-compatible.')) {
	const ancestors = new Set()
	function normalize(item) {
		if (item === undefined || item === null || typeof item === 'string' || typeof item === 'boolean') return item
		if (typeof item === 'number') {
			if (!Number.isFinite(item)) throw createError()
			return Object.is(item, -0) ? 0 : item
		}
		if (item instanceof Date) {
			if (!Number.isFinite(item.getTime())) throw createError()
			return item.toISOString()
		}
		if (typeof item !== 'object' || ancestors.has(item)) throw createError()
		if (!Array.isArray(item) && ![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw createError()
		ancestors.add(item)
		try {
			if (Array.isArray(item)) return Array.from(item, entry => normalize(entry) ?? null)
			return Object.fromEntries(Object.entries(item)
				.filter(([, entry]) => entry !== undefined)
				.map(([key, entry]) => [key, normalize(entry)]))
		} finally { ancestors.delete(item) }
	}
	return normalize(value)
}
