/**
 * Compact public tool records for tools/list.
 *
 * Claude (and other hosts) load every advertised tool definition into the
 * model context. The complete typed contract of deck.generate_from_spec alone
 * is ~150 KB, so tools/list advertises a bounded projection instead:
 *
 *   • inputSchema keeps the top-level argument shape (and the top-level spec
 *     shape for generate_from_spec); deeper nested objects become permissive
 *     `{ type: 'object' }` records with a short description.
 *   • outputSchema keeps the result envelope and the direct fields of `data`.
 *
 * Nothing is relaxed server-side: the engine still validates every argument
 * against the complete contract and returns actionable corrections. The full
 * public schema of any tool (or any sub-path of it) stays available on demand
 * through betterpptx.help.tool_recipe { schemaFor, schemaPath } and the
 * per-control contracts of betterpptx.authoring.catalog.
 */

export const SCHEMA_DETAIL_HINT = 'Nested objects are summarized; get any exact sub-schema from betterpptx.help.tool_recipe {schemaFor, schemaPath}. The server validates the full contract.'

// Depth counts nested `properties` levels below the tool arguments object.
// 1 = argument names only, 2 = one nested level (e.g. spec.slides), ...
const INPUT_DEPTH = 0
const OUTPUT_DEPTH = 0
const TOOL_INPUT_DEPTH = Object.freeze({
	'betterpptx.deck.generate_from_spec': 1,
})
// BetterPPTX's distinctive capabilities are advertised in depth; common slide
// basics stay summarized. Each path (dotted property names, array items are
// transparent) is expanded N levels further with real descriptions, and its
// ancestors stay visible. Everything else is fetched with schemaFor/schemaPath.
const TOOL_EXPANDED_INPUT_PATHS = Object.freeze({
	'betterpptx.narration.create_voice': Object.freeze({ consent: 1 }),
	'betterpptx.deck.generate_from_spec': Object.freeze({
		// Every native object kind (animated-table, media, model3d, ink, laser, ...).
		'spec.slides.content.kind': 0,
		// animated-table: independently editable rows/cells revealed by native timing.
		'spec.slides.content.header': 1,
		'spec.slides.content.rows': 1,
		'spec.slides.content.reveal': 3,
		'spec.slides.content.appearance': 2,
		// Native 3-D presenter, continuous performance, cast scenes, triggers.
		'spec.presenter': 2,
		'spec.slides.presenter': 2,
		'spec.slides.presenterPerformance': 2,
		'spec.slides.scene': 2,
		'spec.slides.interactions': 2,
		// Cross-slide identity/Morph handoffs and the deck motion clock.
		'spec.slideContinuities': 2,
		'spec.motionTime': 2,
	}),
})
const EXPANDED_DESCRIPTION_CHARS = 240
const PINNED_DESCRIPTION_CHARS = 600
const MAX_ENUM_VALUES = 40
// Description budget per nesting depth (0 omits the description). Output
// schemas only need field names and types for structuredContent validation.
const INPUT_DESCRIPTION_CHARS = depth => depth <= 1 ? 600 : 0
const OUTPUT_DESCRIPTION_CHARS = () => 0

const KEPT_SCALAR_KEYWORDS = ['type', 'const', 'default', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'format']
const COMBINATORS = ['anyOf', 'oneOf', 'allOf']

// Generated placeholders ("The idempotency key.") repeat the field name and
// carry no information for the model.
const PLACEHOLDER_DESCRIPTION = /^The [A-Za-z0-9 ]{1,48}\.$/

function shorten(text, limit) {
	const value = String(text || '').replace(/\s+/g, ' ').trim()
	if (PLACEHOLDER_DESCRIPTION.test(value)) return ''
	if (value.length <= limit) return value
	const cut = value.slice(0, limit)
	const sentence = cut.lastIndexOf('. ')
	return `${(sentence > limit * 0.5 ? cut.slice(0, sentence + 1) : cut.replace(/\s+\S*$/, '')).trim()}…`
}

function inferredType(schema) {
	if (schema.type) return schema.type
	if (schema.properties || schema.additionalProperties !== undefined) return 'object'
	if (schema.items) return 'array'
	if (Array.isArray(schema.enum) && schema.enum.length) {
		const types = [...new Set(schema.enum.map(value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value))]
		return types.length === 1 ? types[0] : types
	}
	if (schema.const !== undefined) return schema.const === null ? 'null' : typeof schema.const
	for (const key of COMBINATORS) {
		if (!Array.isArray(schema[key])) continue
		const types = [...new Set(schema[key].flatMap(branch => {
			const type = branch && typeof branch === 'object' ? inferredType(branch) : undefined
			return Array.isArray(type) ? type : type ? [type] : []
		}))]
		if (types.length) return types.length === 1 ? types[0] : types
	}
	return undefined
}

function hasNestedStructure(schema) {
	return Boolean(schema.properties || schema.items || schema.patternProperties
		|| (schema.additionalProperties && typeof schema.additionalProperties === 'object')
		|| COMBINATORS.some(key => Array.isArray(schema[key])))
}

function isScalarArray(schema) {
	return Boolean(schema.items && !Array.isArray(schema.items) && !hasNestedStructure(schema.items) && schema.items.type
		&& !schema.properties && !COMBINATORS.some(key => Array.isArray(schema[key])))
}

function summarize(schema, descriptionChars) {
	const out = {}
	const type = inferredType(schema)
	if (type !== undefined) out.type = type
	for (const key of ['const', 'default', 'minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'format']) {
		if (schema[key] !== undefined && typeof schema[key] !== 'object') out[key] = schema[key]
	}
	if (Array.isArray(schema.enum) && schema.enum.length <= MAX_ENUM_VALUES && schema.enum.every(value => value === null || typeof value !== 'object')) out.enum = schema.enum
	// Arrays of plain scalars keep their item type; only structured items are elided.
	if (schema.items && !Array.isArray(schema.items) && !hasNestedStructure(schema.items) && schema.items.type) {
		out.items = { type: schema.items.type }
		if (Array.isArray(schema.items.enum) && schema.items.enum.length <= MAX_ENUM_VALUES) out.items.enum = schema.items.enum
	}
	if (schema.description && descriptionChars && shorten(schema.description, descriptionChars)) out.description = shorten(schema.description, descriptionChars)
	return out
}

function expandedBelow(policy, path) {
	const prefix = path.join('.')
	return Object.keys(policy.expanded || {}).filter(target => target.startsWith(`${prefix}.`))
}

// A summarized node that still leads to its expanded descendants.
function summarizeKeepingExpanded(schema, depth, policy, path, descriptionChars) {
	const out = summarize(schema, descriptionChars)
	if (schema.items && !Array.isArray(schema.items) && typeof schema.items === 'object') {
		out.items = summarizeKeepingExpanded(schema.items, depth + 1, policy, path, policy.descriptionChars(depth + 1))
		return out
	}
	const leads = new Set(expandedBelow(policy, path).map(target => target.split('.')[path.length]))
	if ([...leads].some(name => schema.properties?.[name])) {
		// Every sibling is still named (type only); only the expanded ones carry detail.
		out.properties = Object.fromEntries(Object.entries(schema.properties).map(([name, child]) => [name, leads.has(name)
			? compactNode(child, depth + 1, policy, [...path, name])
			: summarize(child, 0)]))
		out.additionalProperties = true
	}
	return out
}

function compactNode(schema, depth, policy, path = []) {
	if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema
	const levels = policy.expanded?.[path.join('.')]
	if (levels !== undefined && !policy.expanding) {
		return compactNode(schema, depth, {
			maxDepth: depth + levels,
			descriptionChars: nested => nested <= depth ? PINNED_DESCRIPTION_CHARS : EXPANDED_DESCRIPTION_CHARS,
			expanding: true,
			report: policy,
		}, path)
	}
	const descriptionChars = policy.descriptionChars(depth)
	if (depth > policy.maxDepth && hasNestedStructure(schema)) {
		if (!isScalarArray(schema)) (policy.report || policy).summarized = true
		return !policy.expanding && expandedBelow(policy, path).length
			? summarizeKeepingExpanded(schema, depth, policy, path, descriptionChars)
			: summarize(schema, descriptionChars)
	}
	const out = {}
	for (const key of KEPT_SCALAR_KEYWORDS) if (schema[key] !== undefined) out[key] = schema[key]
	if (Array.isArray(schema.enum)) {
		if (schema.enum.length <= MAX_ENUM_VALUES || depth <= 1) out.enum = schema.enum
	}
	if (Array.isArray(schema.required)) out.required = schema.required
	if (schema.description && descriptionChars && shorten(schema.description, descriptionChars)) out.description = shorten(schema.description, descriptionChars)
	if (schema.properties && typeof schema.properties === 'object') {
		out.properties = Object.fromEntries(Object.entries(schema.properties)
			.map(([key, child]) => [key, compactNode(child, depth + 1, policy, [...path, key])]))
	}
	if (schema.additionalProperties !== undefined) {
		out.additionalProperties = typeof schema.additionalProperties === 'object'
			? compactNode(schema.additionalProperties, depth + 1, policy, path)
			: schema.additionalProperties
	}
	// Array items sit at the same nesting level as their array.
	if (schema.items !== undefined) out.items = Array.isArray(schema.items)
		? schema.items.map(item => compactNode(item, depth + 1, policy, path))
		: compactNode(schema.items, depth + 1, policy, path)
	for (const key of COMBINATORS) {
		if (!Array.isArray(schema[key])) continue
		const branches = schema[key].map(branch => compactNode(branch, depth, policy, path))
			.filter(branch => !(branch && typeof branch === 'object' && Object.keys(branch).length === 0))
		if (branches.length) out[key] = branches
	}
	if (out.type === undefined && !COMBINATORS.some(key => out[key])) {
		const type = inferredType(schema)
		if (type !== undefined) out.type = type
	}
	return out
}

export function compactInputSchema(schema, toolName = '') {
	if (!schema || typeof schema !== 'object') return schema
	const policy = { maxDepth: TOOL_INPUT_DEPTH[toolName] ?? INPUT_DEPTH, descriptionChars: INPUT_DESCRIPTION_CHARS, expanded: TOOL_EXPANDED_INPUT_PATHS[toolName] }
	const compact = compactNode(schema, 0, policy)
	if (policy.summarized) compact.description = compact.description ? `${compact.description} ${SCHEMA_DETAIL_HINT}` : SCHEMA_DETAIL_HINT
	return compact
}

export function compactOutputSchema(schema) {
	if (!schema || typeof schema !== 'object') return schema
	return compactNode(schema, 0, { maxDepth: OUTPUT_DEPTH, descriptionChars: OUTPUT_DESCRIPTION_CHARS })
}

export function compactPublicTool(tool) {
	const compact = { ...tool }
	if (tool.inputSchema) compact.inputSchema = compactInputSchema(tool.inputSchema, tool.name)
	if (tool.outputSchema) compact.outputSchema = compactOutputSchema(tool.outputSchema)
	return compact
}

function childAt(schema, segment) {
	if (!schema || typeof schema !== 'object') return undefined
	if (segment === 'items' && schema.items) return schema.items
	if (schema.properties?.[segment]) return schema.properties[segment]
	if (schema.items && !Array.isArray(schema.items)) {
		const fromItems = childAt(schema.items, segment)
		if (fromItems) return fromItems
	}
	for (const key of COMBINATORS) {
		for (const branch of schema[key] || []) {
			const found = childAt(branch, segment)
			if (found) return found
		}
	}
	if (schema.additionalProperties && typeof schema.additionalProperties === 'object') return childAt(schema.additionalProperties, segment)
	return undefined
}

function childNames(schema, seen = new Set()) {
	if (!schema || typeof schema !== 'object' || seen.has(schema)) return []
	seen.add(schema)
	const names = Object.keys(schema.properties || {})
	if (schema.items && !Array.isArray(schema.items)) names.push(...childNames(schema.items, seen))
	for (const key of COMBINATORS) for (const branch of schema[key] || []) names.push(...childNames(branch, seen))
	return [...new Set(names)]
}

/**
 * Resolve one public tool schema, optionally at a dotted path such as
 * "spec.slides.blocks" (array `items` are traversed implicitly). Returns a
 * bounded projection two levels deep from the requested node, plus the child
 * paths an AI can request next.
 */
export function publicToolSchemaDetail(tools, toolName, { schemaPath = '', which = 'input' } = {}) {
	const tool = tools.find(candidate => candidate.name === toolName)
	if (!tool) {
		return { ok: false, code: 'SCHEMA_TOOL_UNKNOWN', message: `Unknown public tool "${toolName}".`, availableTools: tools.map(candidate => candidate.name).sort() }
	}
	const root = which === 'output' ? tool.outputSchema : tool.inputSchema
	const segments = String(schemaPath || '').split('.').map(part => part.trim()).filter(Boolean)
	let node = root
	const resolved = []
	for (const segment of segments) {
		const next = childAt(node, segment)
		if (!next) {
			return {
				ok: false,
				code: 'SCHEMA_PATH_UNKNOWN',
				message: `No field "${segment}" under ${which} schema path "${resolved.join('.') || '(root)'}" of ${toolName}.`,
				tool: toolName,
				which,
				resolvedPath: resolved.join('.'),
				childFields: childNames(node),
			}
		}
		resolved.push(segment)
		node = next
	}
	return {
		ok: true,
		tool: toolName,
		which,
		schemaPath: resolved.join('.'),
		schema: compactNode(node, 1, { maxDepth: 3, descriptionChars: depth => depth <= 2 ? 1200 : 400 }),
		childFields: childNames(node),
		note: 'Bounded to three nested levels; request a child path for deeper detail.',
	}
}
