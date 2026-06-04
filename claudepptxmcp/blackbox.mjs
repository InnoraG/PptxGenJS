// Public endpoint hardening. In black-box mode the MCP surface should expose
// presentation capabilities, not server internals, local paths, or source files.

const PUBLIC_PRODUCT_NAME = process.env.BETTERPPTX_PUBLIC_PRODUCT || process.env.BETTERPPTX_PUBLIC_BRAND || 'BetterPPTX'

export function isPublicBlackBoxMode() {
	return process.env.BETTERPPTX_PUBLIC_BLACK_BOX === '1' || process.env.BETTERPPTX_BLACK_BOX === '1'
}

export const PUBLIC_BLACK_BOX_BLOCKED_TOOLS = new Set([
	'betterpptx.version',
	'betterpptx.options.catalog',
	'betterpptx.equation.catalog',
	'betterpptx.smartart.catalog',
	'betterpptx.deck.load_template',
	'betterpptx.deck.open_existing',
	'betterpptx.deck.audit_layouts',
	'betterpptx.deck.inspect_layouts',
	'betterpptx.deck.editability_report',
	'betterpptx.deck.transform_shapes',
	'betterpptx.slide.inspect_shapes',
	'betterpptx.slide.passthrough_xml',
	'betterpptx.io.read_file',
	'betterpptx.io.write_file',
	'betterpptx.io.list_dir',
	'betterpptx.io.read_json',
	'betterpptx.fs.find',
	'betterpptx.http.fetch',
	'betterpptx.image.sample_palette',
	'betterpptx.geometry.polygon_to_custgeom',
	'betterpptx.geometry.simplify_path',
	'betterpptx.library.list_xml_groups',
	'betterpptx.library.import_xml_group',
	'betterpptx.deck.list',
])

export function isPublicToolAllowed(name) {
	return !(isPublicBlackBoxMode() && PUBLIC_BLACK_BOX_BLOCKED_TOOLS.has(String(name || '')))
}

export function assertPublicToolAllowed(name) {
	if (!isPublicToolAllowed(name)) throw new Error('This endpoint exposes presentation capabilities only.')
}

export function publicToolList(tools) {
	if (!isPublicBlackBoxMode()) return tools
	return tools.filter(t => isPublicToolAllowed(t.name)).map(sanitizePublicTool)
}

export function toPublicToolName(name) {
	return String(name || '')
}

export function toInternalToolName(name) {
	return String(name || '')
}

export function isLegacyPublicToolName(name) {
	return false
}

function sanitizeStringForPublic(value) {
	return String(value)
		.replace(/\bPolar\.sh or Dodo Payments\b/gi, 'the payment provider')
		.replace(/\bPolar or Dodo\b/gi, 'the payment provider')
		.replace(/\bPolar\/Dodo\b/gi, 'the payment provider')
		.replace(/\bPolar\b/g, 'payment provider')
		.replace(/\bDodo Payments\b/g, 'payment provider')
		.replace(/\bDodo\b/g, 'payment provider')
		.replace(/\bMCP session\b/gi, 'current session')
		.replace(/\bMCP server\b/gi, 'presentation service')
		.replace(/\bself-contained\b/gi, 'full-featured')
		.replace(/\bPPTX engine\b/gi, 'PPTX feature set')
		.replace(/\bnative OOXML chart\b/gi, 'presentation chart')
		.replace(/\bnative Office Math XML\b/gi, 'editable equation format')
		.replace(/\braw XML\b/gi, 'low-level markup')
		.replace(/\bbinary glTF \(\.glb\)\b/gi, '3D model')
		.replace(/\bglTF \(\.glb\)\b/gi, '3D model')
		.replace(/\bGLB\b/g, '3D model')
		.replace(/\bglbFile\b/g, 'modelAsset')
		.replace(/\brasterFile\b/g, 'posterAsset')
		.replace(/\braw OOXML\b/gi, 'advanced package markup')
		.replace(/\bOOXML\b/g, 'package markup')
		.replace(/\bSave deck to disk\b/gi, 'Save deck')
		.replace(/\bwrite the \.pptx to disk\b/gi, 'export the .pptx')
		.replace(/\bReturns absolute file path plus\b/gi, 'Returns a download link plus')
		.replace(/\bor absolute path\b/gi, '')
		.replace(/\bin CWD\b/gi, 'in the default output area')
		.replace(/\bCWD\b/g, 'default output area')
		.replace(/\bserver-side path\b/gi, 'opaque asset handle')
		.replace(/\bserver-side\b/gi, 'by the service')
		.replace(/\bserver filesystem path is required or exposed\b/gi, 'local file path is required')
		.replace(/\bno local file path is required\b/gi, 'uploaded bytes are used directly')
		.replace(/\bserver filesystem\b/gi, 'local file storage')
		.replace(/\bFilesystem path\b/g, 'Opaque asset reference')
		.replace(/\blocal filesystem\b/gi, 'server internals')
		.replace(/\bReturn a compact catalog\b/gi, 'Return a concise summary')
		.replace(/\bReturn token-friendly canonical option values, safe aliases, and correction guidance[^.]*\./gi, 'Return concise guidance for presentation options.')
		.replace(/\bAll \d+\+ PowerPoint transitions[^.]*\./gi, 'Presentation transitions with timing controls.')
		.replace(/\b\d+-layout PowerPoint catalog\b/gi, 'PowerPoint SmartArt authoring')
		.replace(/\bfull-catalog-authoring\b/gi, 'available')
		.replace(/\bfull feature inventories?\b/gi, 'capability summaries')
		.replace(/\bcapability ledger\b/gi, 'capability summary')
		.replace(/\bcoverage matrix\b/gi, 'capability summary')
		.replace(/\bpreset ID map\b/gi, 'preset guidance')
		.replace(/\binternal option names?\b/gi, 'presentation options')
		.replace(/\bsource policy\b/gi, 'selection guidance')
		.replace(/\bmatrix artifact paths?\b/gi, 'service internals')
		.replace(/\bfrozen reference\b/gi, 'reference material')
		.replace(/\bdecypher\b/gi, 'analysis')
		.replace(/\bcomparator\b/gi, 'validator')
		.replace(/\bUse text boxes, shapes, images, WordArt, Text3D, 3D models\/3D model, and shape-built SmartArt for the strongest Morph results\./gi, 'Use related visual objects when they naturally serve the story.')
		.replace(/\bPrefer text boxes, shapes, images, WordArt, Text3D, 3D models\/3D model, and shape-built SmartArt only when they naturally serve the deck\./gi, 'Prefer related visual objects only when they naturally serve the deck.')
		.replace(/\bFor uploaded or existing decks, do not add banners, badges, 3D, WordArt, Text3D, SmartArt, charts, or decorative panels merely to satisfy preview coverage\./gi, 'For uploaded or existing decks, do not add decorative objects merely to satisfy preview coverage.')
		.replace(/\bReturn endpoint health and capacity\. Public endpoints return black-box service readiness only; maintainer-local diagnostics may include deeper runtime freshness details\./gi, 'Return service readiness.')
		.replace(/\bMaintainer-local diagnostic option; public endpoints ignore or redact implementation details\./gi, 'Optional diagnostic flag; public responses stay generic.')
}

function sanitizeSchema(value) {
	if (typeof value === 'string') return sanitizeStringForPublic(value)
	if (!value || typeof value !== 'object') return value
	if (Array.isArray(value)) return value.map(sanitizeSchema)
	const hiddenSchemaKeys = new Set([
		'path',
		'filePath',
		'root',
		'outputDir',
		'saveToPath',
		'pptxPath',
		'templatePath',
		'sourcePath',
		'imagePath',
		'glbFile',
		'rasterFile',
		'provider',
		'license',
		'licenses',
		'spdx',
		'commercialUse',
		'attributionRequired',
		'reviewStatus',
		'tags',
		'capabilityLedger',
		'coverageMatrix',
		'featureInventory',
		'featureMatrix',
		'optionRegistry',
		'presetIdMap',
		'catalogMetadata',
		'catalogContext',
		'catalogResultIndex',
		'resultIndex',
		'sourcePolicy',
		'provenance',
		'searchTokens',
		'categoryAliases',
		'rawTags',
		'nodeNames',
		'morphPreviewCoverage',
		'previewFeatures',
		'preferredObjectKinds',
		'morphFriendlyObjects',
		'includeCandidates',
		'allowUnreviewedVoices',
		'includeEnvironment',
		'includeGitStatus',
		'enableIterateEngine',
	])
	const out = {}
	for (const [key, child] of Object.entries(value)) {
		if (hiddenSchemaKeys.has(key)) continue
		out[key] = sanitizeSchema(child)
	}
	return clarifyPublicSchema(out)
}

const NUMBER_OR_PERCENT = {
	description: 'Position or size value: number in inches, or a percentage string such as "50%".',
	oneOf: [
		{ type: 'number', description: 'Value in inches.' },
		{ type: 'string', pattern: '^\\d+(\\.\\d+)?%$', description: 'Percentage value such as "50%".' },
	],
}

const COLOR = { type: 'string', description: 'RGB hex colour without "#", for example "1F2937".' }

const GRADIENT_STOP = {
	type: 'object',
	description: 'Gradient stop.',
	properties: {
		color: COLOR,
		position: { type: 'number', description: 'Stop position from 0 to 1, or 0 to 100 depending on the tool.' },
		transparency: { type: 'number', description: 'Transparency percentage.' },
	},
	additionalProperties: true,
}

const FILL_SCHEMA = {
	type: 'object',
	description: 'Fill style. Use { color } for a solid fill or gradient fields for a gradient fill.',
	properties: {
		color: COLOR,
		transparency: { type: 'number', description: 'Transparency percentage from 0 to 100.' },
		type: { type: 'string', enum: ['solid', 'gradient'], description: 'Fill type.' },
		gradientStops: { type: 'array', items: GRADIENT_STOP, description: 'Gradient stops.' },
		gradientAngle: { type: 'number', description: 'Gradient angle in degrees.' },
		gradientDirection: { type: 'string', description: 'Named gradient direction.' },
	},
	additionalProperties: true,
}

const LINE_SCHEMA = {
	type: 'object',
	description: 'Line or border style.',
	properties: {
		color: COLOR,
		width: { type: 'number', description: 'Line width in points.' },
		transparency: { type: 'number', description: 'Transparency percentage from 0 to 100.' },
		dash: { type: 'string', description: 'Dash style such as "dash" or "dot".' },
		beginArrowType: { type: 'string', description: 'Optional starting arrow style.' },
		endArrowType: { type: 'string', description: 'Optional ending arrow style.' },
	},
	additionalProperties: true,
}

const SHADOW_SCHEMA = {
	type: 'object',
	description: 'Shadow effect.',
	properties: {
		type: { type: 'string', description: 'Shadow type or preset.' },
		color: COLOR,
		opacity: { type: 'number', description: 'Opacity percentage.' },
		blur: { type: 'number', description: 'Blur radius.' },
		angle: { type: 'number', description: 'Shadow angle in degrees.' },
		distance: { type: 'number', description: 'Shadow distance.' },
	},
	additionalProperties: true,
}

const EFFECT_SCHEMA = {
	type: 'object',
	description: 'Visual effect options.',
	properties: {
		color: COLOR,
		size: { type: 'number', description: 'Effect size.' },
		opacity: { type: 'number', description: 'Opacity percentage.' },
		blur: { type: 'number', description: 'Blur radius.' },
		distance: { type: 'number', description: 'Distance or offset.' },
	},
	additionalProperties: true,
}

const TRANSITION_SCHEMA = {
	type: 'object',
	description: 'Slide transition.',
	properties: {
		type: { type: 'string', description: 'Transition type such as "fade", "push", "wipe", or "morph".' },
		option: { type: 'string', description: 'Transition option, for example Morph uses "byObject", "byWord", or "byChar".' },
		direction: { type: 'string', description: 'Direction such as left, right, up, down, in, or out.' },
		speed: { type: 'string', enum: ['slow', 'medium', 'fast'], description: 'Transition speed.' },
		duration: { type: 'number', description: 'Duration in milliseconds.' },
		p14dur: { type: 'number', description: 'PowerPoint transition duration in milliseconds.' },
		advanceOnClick: { type: 'boolean', description: 'Advance when clicked.' },
		advanceAfterTime: { type: 'number', description: 'Auto-advance delay in milliseconds.' },
	},
	additionalProperties: true,
}

const ANIMATION_SCHEMA = {
	type: 'object',
	description: 'Animation to apply to existing or newly created objects.',
	properties: {
		type: { type: 'string', enum: ['entrance', 'exit', 'emphasis', 'motion', 'media'], description: 'Animation category.' },
		effect: { type: 'string', description: 'Effect name such as fade, fly, wipe, zoom, spin, or growShrink.' },
		trigger: { type: 'string', enum: ['onClick', 'withPrevious', 'afterPrevious'], description: 'Animation trigger.' },
		duration: { type: 'number', description: 'Duration in milliseconds.' },
		delay: { type: 'number', description: 'Delay in milliseconds.' },
		direction: { type: 'string', description: 'Effect direction when applicable.' },
		order: { type: 'number', description: 'Animation order on the slide.' },
	},
	additionalProperties: true,
}

const SIZING_SCHEMA = {
	type: 'object',
	description: 'Image sizing policy.',
	properties: {
		type: { type: 'string', enum: ['contain', 'cover', 'crop'], description: 'How the image fits its box.' },
		x: NUMBER_OR_PERCENT,
		y: NUMBER_OR_PERCENT,
		w: NUMBER_OR_PERCENT,
		h: NUMBER_OR_PERCENT,
	},
	additionalProperties: true,
}

const TARGET_SCHEMA = {
	type: 'object',
	description: 'Object selector from slide.list_shapes.',
	properties: {
		objectName: { type: 'string', description: 'Stable objectName returned by slide.list_shapes.' },
		index: { type: 'number', description: 'Zero-based object index returned by slide.list_shapes.' },
	},
	additionalProperties: false,
}

const GENERIC_OPTIONS_SCHEMA = {
	type: 'object',
	description: 'Common object options. Extra presentation-specific fields are allowed.',
	properties: {
		x: NUMBER_OR_PERCENT,
		y: NUMBER_OR_PERCENT,
		w: NUMBER_OR_PERCENT,
		h: NUMBER_OR_PERCENT,
		objectName: { type: 'string', description: 'Stable name used for later edits, animation targeting, and Morph matching.' },
		fill: FILL_SCHEMA,
		line: LINE_SCHEMA,
		shadow: SHADOW_SCHEMA,
		glow: EFFECT_SCHEMA,
		reflection: EFFECT_SCHEMA,
		softEdges: EFFECT_SCHEMA,
		animation: ANIMATION_SCHEMA,
		rotate: { type: 'number', description: 'Rotation in degrees.' },
		transparency: { type: 'number', description: 'Transparency percentage from 0 to 100.' },
		color: COLOR,
		fontFace: { type: 'string', description: 'Font family for text.' },
		fontSize: { type: 'number', description: 'Font size in points.' },
		bold: { type: 'boolean', description: 'Use bold text.' },
		italic: { type: 'boolean', description: 'Use italic text.' },
		align: { type: 'string', description: 'Horizontal text alignment.' },
		valign: { type: 'string', description: 'Vertical text alignment.' },
		sizing: SIZING_SCHEMA,
		altText: { type: 'string', description: 'Accessible alternative text.' },
	},
	additionalProperties: true,
}

const BACKGROUND_SCHEMA = {
	type: 'object',
	description: 'Slide background.',
	properties: {
		color: COLOR,
		transparency: { type: 'number', description: 'Transparency percentage from 0 to 100.' },
		type: { type: 'string', enum: ['solid', 'gradient', 'image'], description: 'Background type.' },
		gradientStops: { type: 'array', items: GRADIENT_STOP, description: 'Gradient stops.' },
		gradientAngle: { type: 'number', description: 'Gradient angle in degrees.' },
		data: { type: 'string', description: 'Inline image data URL for an image background.' },
		url: { type: 'string', description: 'Remote image URL for an image background.' },
	},
	additionalProperties: true,
}

const TTS_SCHEMA = {
	type: 'object',
	description: 'Narration voice defaults.',
	properties: {
		voice: { type: 'string', description: 'Voice identifier.' },
		lang: { type: 'string', description: 'Language code.' },
		speaker: { type: 'number', description: 'Speaker index for multi-speaker voices.' },
		lengthScale: { type: 'number', description: 'Speech speed control.' },
		noiseScale: { type: 'number', description: 'Voice variation control.' },
		noiseWScale: { type: 'number', description: 'Phoneme variation control.' },
	},
	additionalProperties: true,
}

const TABLE_OPERATION_SCHEMA = {
	type: 'object',
	description: 'Table edit operation.',
	properties: {
		op: { type: 'string', description: 'Operation name such as setCell, patchCell, addRow, deleteRow, addColumn, or deleteColumn.' },
		row: { type: 'number', description: 'Zero-based row index.' },
		col: { type: 'number', description: 'Zero-based column index.' },
		text: { type: 'string', description: 'Replacement cell text.' },
		options: GENERIC_OPTIONS_SCHEMA,
		patch: GENERIC_OPTIONS_SCHEMA,
		index: { type: 'number', description: 'Insertion or deletion index.' },
		cells: { type: 'array', description: 'Row or column cell values.' },
	},
	additionalProperties: true,
}

const CHART_SERIES_SCHEMA = {
	type: 'object',
	description: 'Chart series data.',
	properties: {
		name: { type: 'string', description: 'Series name.' },
		labels: { type: 'array', items: { type: 'string' }, description: 'Category labels.' },
		values: { type: 'array', items: { type: 'number' }, description: 'Numeric values.' },
		categories: { type: 'array', items: { type: 'string' }, description: 'Alternative category labels.' },
		x: { type: 'array', items: { type: 'number' }, description: 'X values for scatter/bubble charts.' },
		y: { type: 'array', items: { type: 'number' }, description: 'Y values for scatter/bubble charts.' },
		sizes: { type: 'array', items: { type: 'number' }, description: 'Bubble sizes.' },
	},
	additionalProperties: true,
}

function clarifiedSchemaForKey(key) {
	switch (key) {
		case 'background': return BACKGROUND_SCHEMA
		case 'transition':
		case 'defaultTransition': return TRANSITION_SCHEMA
		case 'animation': return ANIMATION_SCHEMA
		case 'options':
		case 'textOptions':
		case 'optionsPatch':
		case 'patch':
		case 'fillToRect': return GENERIC_OPTIONS_SCHEMA
		case 'fill': return FILL_SCHEMA
		case 'line':
		case 'border': return LINE_SCHEMA
		case 'shadow': return SHADOW_SCHEMA
		case 'glow':
		case 'reflection':
		case 'softEdges': return EFFECT_SCHEMA
		case 'sizing': return SIZING_SCHEMA
		case 'target': return TARGET_SCHEMA
		case 'tts': return TTS_SCHEMA
		case 'captionPolicy':
			return { type: 'object', description: 'Caption placement policy.', properties: { enabled: { type: 'boolean', description: 'Whether captions are enabled.' }, stackStatic: { type: 'boolean', description: 'Stack captions in fixed positions.' }, fontSize: { type: 'number', description: 'Caption font size.' }, color: COLOR }, additionalProperties: true }
		case 'autoplay':
			return { type: 'object', description: 'Autoplay settings.', properties: { paddingMs: { type: 'number', description: 'Padding after each slide in milliseconds.' }, mode: { type: 'string', description: 'Autoplay mode.' }, loop: { type: 'boolean', description: 'Loop the show.' } }, additionalProperties: true }
		case 'audio':
			return { type: 'object', description: 'Audio input.', properties: { data: { type: 'string', description: 'Inline audio data URL or base64.' }, durationMs: { type: 'number', description: 'Audio duration in milliseconds.' }, extn: { type: 'string', description: 'Audio extension such as wav or mp3.' } }, additionalProperties: true }
		case 'playback':
			return { type: 'object', description: 'Media playback settings.', properties: { command: { type: 'string', description: 'Playback command such as play, pause, or stop.' }, trigger: { type: 'string', description: 'Playback trigger.' }, delay: { type: 'number', description: 'Delay in milliseconds.' }, duration: { type: 'number', description: 'Duration in milliseconds.' }, volume: { type: 'number', description: 'Playback volume.' } }, additionalProperties: true }
		case 'setCell':
		case 'patchCell':
			return TABLE_OPERATION_SCHEMA
		case 'addRow':
		case 'deleteRow':
		case 'addColumn':
		case 'deleteColumn':
			return TABLE_OPERATION_SCHEMA
		case 'slideNumber':
			return { type: 'object', description: 'Slide number display settings.', properties: { enabled: { type: 'boolean', description: 'Show slide number.' }, x: NUMBER_OR_PERCENT, y: NUMBER_OR_PERCENT, w: NUMBER_OR_PERCENT, h: NUMBER_OR_PERCENT, fontSize: { type: 'number', description: 'Font size.' }, color: COLOR }, additionalProperties: true }
		default:
			return null
	}
}

function mergeSchema(base, replacement) {
	return {
		...replacement,
		description: base.description || replacement.description,
		required: base.required || replacement.required,
	}
}

function clarifyPublicSchema(schema, key = '') {
	if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema
	if (schema.type === 'object' && schema.properties && Object.keys(schema.properties).length === 0 && !schema.description) {
		return { ...schema, description: 'This tool takes no arguments.', additionalProperties: false }
	}
	const replacement = clarifiedSchemaForKey(key)
	if (replacement && schema.type === 'object' && (!schema.properties || Object.keys(schema.properties).length === 0)) {
		return mergeSchema(schema, replacement)
	}
	if (schema.type === 'object' && schema.properties) {
		const props = {}
		for (const [childKey, child] of Object.entries(schema.properties)) props[childKey] = clarifyPublicSchema(child, childKey)
		return { ...schema, properties: props }
	}
	if (schema.items) {
		const itemReplacement = key === 'operations' ? TABLE_OPERATION_SCHEMA
			: (key === 'variants' ? TRANSITION_SCHEMA : null)
			|| (key === 'chartMulti' || key === 'data' ? CHART_SERIES_SCHEMA : null)
		return { ...schema, items: itemReplacement ? mergeSchema(schema.items || {}, itemReplacement) : clarifyPublicSchema(schema.items, key) }
	}
	return schema
}

function sanitizePublicTool(tool) {
	const clone = JSON.parse(JSON.stringify(tool))
	clone.name = toPublicToolName(clone.name)
	clone.description = sanitizeStringForPublic(clone.description || '')
	if (clone.title) clone.title = sanitizeStringForPublic(clone.title)
	if (clone.inputSchema) clone.inputSchema = sanitizeSchema(clone.inputSchema)
	if (clone.outputSchema) clone.outputSchema = sanitizeSchema(clone.outputSchema)
	if (clone.annotations) clone.annotations = sanitizeSchema(clone.annotations)
	return clone
}

export const PUBLIC_BLACK_BOX_PATH_KEYS = new Set([
	'path',
	'filePath',
	'root',
	'outputDir',
	'saveToPath',
	'pptxPath',
	'templatePath',
	'sourcePath',
	'imagePath',
	'glbFile',
	'rasterFile',
	'modelAsset',
	'posterAsset',
	'cover',
])

function isOpaqueAssetRef(value) {
	return /^(asset:\/\/generated\/|model3d:\/\/|stock:\/\/|audio:\/\/|video:\/\/|texture:\/\/)/i.test(String(value || ''))
}

function isInlineOrRemoteRef(value) {
	const s = String(value || '')
	return /^data:/i.test(s) || /^https?:\/\//i.test(s)
}

function isLocalPathLike(value) {
	const s = String(value || '').trim()
	if (!s) return false
	if (isOpaqueAssetRef(s) || isInlineOrRemoteRef(s)) return false
	return /^[A-Za-z]:[\\/]/.test(s) || s.startsWith('\\\\') || s.startsWith('/') || s.startsWith('./') || s.startsWith('../') || s.includes('..\\') || s.includes('../')
}

export function assertNoPublicLocalPathArgs(value, trail = []) {
	if (!isPublicBlackBoxMode() || value == null) return
	if (Array.isArray(value)) {
		value.forEach((item, i) => assertNoPublicLocalPathArgs(item, trail.concat(String(i))))
		return
	}
	if (typeof value !== 'object') return
	for (const [key, child] of Object.entries(value)) {
		const nextTrail = trail.concat(key)
		if (typeof child === 'string' && PUBLIC_BLACK_BOX_PATH_KEYS.has(key) && isLocalPathLike(child)) {
			throw new Error(`Local resource references are not available on this endpoint (${nextTrail.join('.')}).`)
		}
		assertNoPublicLocalPathArgs(child, nextTrail)
	}
}

const PUBLIC_BLACK_BOX_RESULT_HIDDEN_KEYS = new Set([
	'path',
	'filePath',
	'root',
	'outputDir',
	'saveToPath',
	'pptxPath',
	'templatePath',
	'sourcePath',
	'sourceXmlPath',
	'imagePath',
	'glbFile',
	'rasterFile',
	'workDir',
	'packagePassthrough',
	'timingPassthrough',
	'rawXmlBytes',
	'relsAdded',
	'rawIndex',
	'license',
	'licenses',
	'spdx',
	'commercialUse',
	'attributionRequired',
	'reviewStatus',
	'tags',
	'capabilityLedger',
	'coverageMatrix',
	'featureInventory',
	'featureMatrix',
	'optionRegistry',
	'presetIdMap',
	'catalog',
	'catalogMetadata',
	'catalogContext',
	'catalogResultIndex',
	'resultIndex',
	'sourcePolicy',
	'provenance',
	'searchTokens',
	'categoryAliases',
	'rawTags',
	'nodeNames',
	'matchScore',
	'morphPreviewCoverage',
	'previewFeatures',
	'preferredObjectKinds',
	'morphFriendlyObjects',
	'stack',
])

function sanitizePublicEditHandle(handle) {
	const selectors = Array.isArray(handle?.stableSelectors)
		? handle.stableSelectors.filter(item => /^objectName:|^index:/i.test(String(item || '')))
		: []
	return {
		stableSelectors: selectors,
		targetHint: 'Use target { objectName } when available; otherwise use the zero-based index returned by list_shapes.',
	}
}

export function sanitizePublicResult(value) {
	if (!isPublicBlackBoxMode() || value == null) return value
	if (Array.isArray(value)) return value.map(sanitizePublicResult)
	if (typeof value !== 'object') {
		if (typeof value === 'string' && isLocalPathLike(value)) return undefined
		if (typeof value === 'string') return sanitizeStringForPublic(value)
		return value
	}
	const out = {}
	for (const [key, child] of Object.entries(value)) {
		if (key.startsWith('_')) continue
		if (PUBLIC_BLACK_BOX_RESULT_HIDDEN_KEYS.has(key)) {
			if (!(['modelAsset', 'posterAsset', 'cover'].includes(key) && typeof child === 'string' && isOpaqueAssetRef(child))) continue
		}
		if (key === 'editHandle') {
			out[key] = sanitizePublicEditHandle(child)
			continue
		}
		if (key === 'stableSelectors' && Array.isArray(child)) {
			out[key] = child.filter(item => /^objectName:|^index:/i.test(String(item || '')))
			continue
		}
		const sanitized = sanitizePublicResult(child)
		if (sanitized !== undefined) out[key] = sanitized
	}
	return out
}
