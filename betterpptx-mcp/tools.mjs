// BetterPPTX tool catalog
// MCP tool definitions for a self-contained PPTX generation and editing engine.
// The AI client does not need to call any external PPTX authoring library.

const MODEL3D_GENERATE_KINDS = [
	'auto',
	'person',
	'team',
	'robot',
	'device',
	'package',
	'product',
	'scene',
	'vehicle',
	'trophy',
	'arrow',
	'interface',
	'user',
	'toggle',
	'bell',
	'cloud',
	'prism',
	'shield',
	'stack',
	'beacon',
	'spark',
]

const MODEL3D_GENERATE_INPUT_SCHEMA = {
	type: 'object',
	properties: {
		context: { type: 'string', description: 'Narrative context or voiceover line used to choose the generated 3D model family when kind="auto".' },
		prompt: { type: 'string', description: 'Alias for context.' },
		narration: { type: 'string', description: 'Alias for context.' },
		kind: { type: 'string', enum: MODEL3D_GENERATE_KINDS, default: 'auto' },
		name: { type: 'string', description: 'Stable asset stem for generated model assets.' },
		outputDir: { type: 'string', description: 'Internal output directory for generated assets. Public endpoints may ignore this value.' },
		generationMode: { type: 'string', enum: ['auto', 'compact', 'balanced', 'high-fidelity', 'legacy'], default: 'auto', description: 'Controls the generation profile without exposing implementation details. compact favors reuse and smaller assets; high-fidelity favors richer geometry.' },
		assetSource: { type: 'string', enum: ['auto', 'curated', 'open-source', 'procedural'], default: 'auto', description: 'Preferred asset source class. open-source uses vetted permissive external models when available; procedural forces generated fallback geometry.' },
		qualityTarget: { type: 'string', enum: ['slides', 'premium', 'hero'], default: 'slides', description: 'Visual quality target. premium/hero prefer richer model geometry, stronger material styling, and stricter size budgeting.' },
		maxAssetBytes: { type: 'number', description: 'Maximum model asset bytes for externally sourced models. Larger candidates are skipped.' },
		optimizeFor: { type: 'string', enum: ['slides', 'navigation', 'quality'], default: 'slides', description: 'slides balances quality and file size; navigation creates smaller reusable assets; quality allows higher detail.' },
		detail: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium', description: 'Geometry detail level. For repeated assets, low keeps model assets small.' },
		pose: { type: 'string', enum: ['front', 'threeQuarterRight', 'threeQuarterLeft', 'sideRight', 'sideLeft', 'topDown', 'heroTilt', 'dramatic'], default: 'heroTilt', description: 'Suggested view/pose for the generated model and poster fallback. Use varied poses so exported slide pictures visibly show 3D rotation.' },
		primaryColor: { type: 'string', description: 'Primary hex color, e.g. 22D3EE.' },
		accentColor: { type: 'string', description: 'Accent hex color, e.g. A78BFA.' },
		highlightColor: { type: 'string', description: 'Highlight hex color.' },
		darkColor: { type: 'string', description: 'Dark/base hex color.' },
		nativeOnly: { type: 'boolean', default: true, description: 'When true, returns a native 3D model reference only and does not create or embed a poster fallback.' },
		posterPolicy: { type: 'string', enum: ['native-only', 'fallback'], default: 'native-only', description: 'native-only avoids misleading preview images; fallback creates a poster only when explicitly requested.' },
		posterSize: { type: 'number', default: 512, description: 'PNG fallback size in pixels, clamped to 128..1024.' },
		w: { type: 'number', description: 'Suggested model width in inches.' },
		h: { type: 'number', description: 'Suggested model height in inches.' },
	},
}

export const TOOLS = [
	{
		name: 'betterpptx.help.capabilities',
		title: 'List BetterPPTX capabilities',
		description: 'Return compact workflow guidance for an AI presentation task. Call early, preferably with the user intent, to get the recommended BetterPPTX call sequence, free/premium boundary, and validation/save path.',
		inputSchema: {
			type: 'object',
			properties: {
				intent: { type: 'string', description: 'The user presentation intent, such as "animated AI history deck", "edit uploaded investor deck", or "narrated product demo".' },
				deckType: { type: 'string', enum: ['auto', 'new', 'uploaded', 'existing'], default: 'auto', description: 'Whether the task starts from a new deck, uploaded PPTX bytes, or an existing server-side deck in maintainer-local mode.' },
				detail: { type: 'string', enum: ['summary', 'plan', 'full'], default: 'summary', description: 'summary returns compact guidance; plan adds an explicit call sequence; full may include broader capability notes.' },
			},
		},
	},
	{
		name: 'betterpptx.options.catalog',
		title: 'List canonical presentation options',
		description: 'Return token-friendly canonical option values, safe aliases, and correction guidance for enum-heavy PPTX options such as WordArt transforms, gradient directions, Text3D rotations, chart presets, table presets, and SmartArt layouts.',
		inputSchema: {
			type: 'object',
			properties: {
				surface: {
					type: 'string',
					description: 'Optional filter such as wordArt, gradient, text3D, chart, table, smartArt, or a field path like options.wordArt.transform.',
				},
				format: {
					type: 'string',
					enum: ['summary', 'full'],
					default: 'summary',
					description: 'summary returns examples and aliases; full includes complete canonical lists where practical.',
				},
			},
		},
	},
	{
		name: 'betterpptx.auth.status',
		title: 'Report SaaS plan and activation status',
		description: 'Return the current freemium SaaS auth state, plan, quota, credits, free-tier limits, and AI-facing activation instructions. Call this before premium work or when the user asks what BetterPPTX can do.',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'betterpptx.auth.activate_key',
		title: 'Activate a Polar or Dodo payment key',
		description: 'Validate and activate a user-provided Polar.sh or Dodo Payments subscription/credit key for this MCP session. Use this when the user pastes a premium key in chat after checkout.',
		inputSchema: {
			type: 'object',
			required: ['key'],
			properties: {
				key: { type: 'string', description: 'Activation or credit key returned by checkout.' },
				provider: { type: 'string', enum: ['auto', 'polar', 'dodo'], default: 'auto', description: 'Payment provider hint. Use auto unless the key source is known.' },
			},
		},
	},
	{
		name: 'betterpptx.billing.explain_plan',
		title: 'Explain free, premium, and credit plans',
		description: 'Return token-friendly plan details for the AI client: the two-slide premium preview, the slide-3 premium-feature boundary, credit-pack behavior, checkout URLs, and the required Morph-by-object slide-2 pattern.',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'betterpptx.billing.portal',
		title: 'Get billing or upgrade URL',
		description: 'Return the provider-neutral checkout, pricing, or customer portal URL. Use when a tool returns REQUIRES_UPGRADE, QUOTA_EXCEEDED, or the user asks to manage billing.',
		inputSchema: {
			type: 'object',
			properties: {
				provider: { type: 'string', enum: ['auto', 'polar', 'dodo'], default: 'auto', description: 'Payment provider hint for checkout or portal routing.' },
				feature: { type: 'string', description: 'Optional reason that caused the upgrade prompt, such as slide_limit, transition, narration, model3d, or open_existing.' },
			},
		},
	},
	{
		name: 'betterpptx.billing.estimate',
		title: 'Estimate billing credits',
		description: 'Return a public-safe estimated credit cost for a checkpoint or heavy BetterPPTX operation. Use before deck.save, narration, model/media work, or when the user asks how many credits an operation may cost.',
		inputSchema: {
			type: 'object',
			properties: {
				toolName: { type: 'string', default: 'betterpptx.deck.save', description: 'BetterPPTX tool to estimate, such as betterpptx.deck.save or betterpptx.narration.synthesize.' },
				deckId: { type: 'string', description: 'Optional deck handle for save estimates.' },
				toolArgs: { type: 'object', description: 'Optional public-safe arguments for the tool being estimated.', additionalProperties: true },
			},
		},
	},
	{
		name: 'betterpptx.billing.usage_summary',
		title: 'Summarize billing usage',
		description: 'Return public-safe BetterPPTX billing balance, pending reservations, queued usage, plan, and checkout/top-up/portal guidance for the current session.',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'betterpptx.version',
		title: 'Report BetterPPTX runtime version',
		description: 'Return runtime identity and freshness details for this MCP process: server mode, pid, cwd, Node version, repo/dist mtimes, tool count, selected non-secret environment flags, and git state. Use this to verify whether a stdio plugin and public HTTP/Tailscale endpoint are running the same rebuilt code.',
		inputSchema: {
			type: 'object',
			properties: {
				includeEnvironment: { type: 'boolean', description: 'Maintainer-local diagnostic option; public endpoints ignore or redact implementation details.', default: true },
				includeGitStatus: { type: 'boolean', description: 'Maintainer-local diagnostic option; public endpoints ignore or redact implementation details.', default: true },
			},
		},
	},
	{
		name: 'betterpptx.status',
		title: 'Report BetterPPTX server status',
		description: 'Return endpoint health and capacity. Public endpoints return black-box service readiness only; maintainer-local diagnostics may include deeper runtime freshness details.',
		inputSchema: {
			type: 'object',
			properties: {
				includeEnvironment: { type: 'boolean', description: 'Maintainer-local diagnostic option; public endpoints ignore or redact implementation details.', default: true },
				includeGitStatus: { type: 'boolean', description: 'Maintainer-local diagnostic option; public endpoints ignore or redact implementation details.', default: true },
			},
		},
	},
	{
		name: 'betterpptx.chart.recommend',
		title: 'Recommend chart presets',
		description: 'Return context-adapted PowerPoint chart presets for an AI client. Results label whether a preset is native-chart, native-composite, or shape-built so unsupported PowerPoint picker families are not mistaken for native chartType values.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Brief, chart intent, or data story to match.' },
				chartIntent: { type: 'string', description: 'Specific chart intent such as trend, comparison, distribution, funnel, geography, or dashboard.' },
				dataShape: { type: 'string', description: 'Known data shape such as categorical, time-series, x/y, hierarchy, distribution, bridge, or matrix.' },
				category: { type: 'string', description: 'Optional PowerPoint picker category or tag filter.' },
				authoringMode: { type: 'string', enum: ['native', 'native-composite', 'shape-built'] },
				chartPresetId: { type: 'string', description: 'Optional exact preset id.' },
				limit: { type: 'number', default: 8 },
				format: { type: 'string', enum: ['summary', 'full'], default: 'summary' },
				visualQuality: { type: 'string', enum: ['standard', 'premium', 'cinematic', 'reference'], default: 'premium' },
				featureDepth: { type: 'string', enum: ['basic', 'advanced', 'exhaustive'], default: 'advanced' },
				chartRichness: { type: 'string', enum: ['native', 'hybrid', 'executive-dashboard'], default: 'hybrid' },
				requireFeatures: { type: 'array', items: { type: 'string' } },
			},
		},
	},
	{
		name: 'betterpptx.table.recommend',
		title: 'Recommend table presets',
		description: 'Return beautiful, context-adapted PowerPoint table presets for an AI client. Includes Table Design ribbon variants such as Header Row, Total Row, First/Last Column, and Banded Rows/Columns plus ready-to-apply table options, per-cell styling recipes, and preventive layout guardrails for safe table boxes, side panels, text fit, and cell-anchored overlays.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Brief, table intent, or data story to match.' },
				tableIntent: { type: 'string', description: 'Specific table intent such as KPI scorecard, financial variance, roadmap status, comparison matrix, risk heatmap, evidence grid, or dense appendix.' },
				dataShape: { type: 'string', description: 'Known row/column shape such as metrics, numeric variance, roadmap status, feature matrix, risk heatmap, or dense data grid.' },
				category: { type: 'string', description: 'Optional PowerPoint picker category or tag filter.' },
				authoringMode: { type: 'string', enum: ['native-table', 'visual-adapted', 'preserve-only'] },
				tablePresetId: { type: 'string', description: 'Optional exact preset id, e.g. executive-kpi-scorecard, financial-variance-total, roadmap-status-lanes, feature-comparison-matrix, risk-heatmap-matrix, dark-evidence-grid, clean-dense-data-grid, or pricing-tier-matrix.' },
				limit: { type: 'number', default: 8 },
				format: { type: 'string', enum: ['summary', 'full'], default: 'summary' },
				visualQuality: { type: 'string', enum: ['standard', 'premium', 'cinematic', 'reference'], default: 'premium' },
				featureDepth: { type: 'string', enum: ['basic', 'advanced', 'exhaustive'], default: 'advanced' },
				requireFeatures: { type: 'array', items: { type: 'string' } },
			},
		},
	},
	{
		name: 'betterpptx.deck.new',
		title: 'Create a new presentation',
		description: 'Start a new in-memory presentation and receive a deckId. All subsequent slide/object/save tools take that deckId.',
		inputSchema: {
			type: 'object',
			properties: {
				layout: { type: 'string', enum: ['LAYOUT_4x3', 'LAYOUT_16x9', 'LAYOUT_16x10', 'LAYOUT_WIDE'], default: 'LAYOUT_WIDE' },
				title: { type: 'string' },
				subject: { type: 'string' },
				author: { type: 'string' },
				company: { type: 'string' },
				rtlMode: { type: 'boolean' },
				theme: {
					type: 'object',
					properties: {
						headFontFace: { type: 'string' },
						bodyFontFace: { type: 'string' },
					},
				},
				enableIterateEngine: { type: 'boolean', description: 'Enable PowerPoint-native iterate text animation engine.' },
			},
		},
	},
	{
		name: 'betterpptx.deck.set_show_settings',
		title: 'Configure slideshow behavior',
		description: 'Configure presentation slideshow behavior (loop, kiosk, useTimings, etc).',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				useTimings: { type: 'boolean' },
				showAnimation: { type: 'boolean' },
				showNarration: { type: 'boolean' },
				loop: { type: 'boolean' },
				mode: { type: 'string', enum: ['present', 'browse', 'kiosk'] },
				restartMs: { type: 'number' },
				showMediaControls: { type: 'boolean' },
			},
		},
	},
	{
		name: 'betterpptx.deck.define_master',
		title: 'Define a slide master',
		description: 'Define a reusable slide master with title, background, objects, slide number config.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'master'],
			properties: {
				deckId: { type: 'string' },
				master: {
					type: 'object',
					required: ['title'],
					properties: {
						title: { type: 'string' },
						background: { type: 'object' },
						margin: { type: ['number', 'array'] },
						slideNumber: { type: 'object' },
						objects: {
							type: 'array',
							items: { type: ['object', 'string'] },
							description: 'Layout-owned master objects. Prefer object entries such as { rect:{...} } or { text:{ text, options } }; JSON strings are accepted for backward compatibility.',
						},
					},
				},
			},
		},
	},
	{
		name: 'betterpptx.slide.add',
		title: 'Add a new slide',
		description: 'Append a slide to the deck. Optional masterName/layoutName/sectionTitle/background/transition. When a template layout policy is loaded, layoutName/masterName is resolved against allowed template layouts and the slide is bound to the preserved PowerPoint layout.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				idempotencyKey: { type: 'string', description: 'Optional client retry key. Repeating slide.add with the same key and same arguments returns the original slide result instead of appending another slide.' },
				masterName: { type: 'string' },
				layoutName: { type: 'string', description: 'Template/native layout name, type, or slideLayoutN identifier to use for this slide.' },
				slideLayout: { type: 'string', description: 'Alias for layoutName.' },
				sectionTitle: { type: 'string' },
				background: {
					type: 'object',
					description: 'Background props: { color, transparency, type: solid|gradient, gradientStops, gradientAngle, gradientPreset, path, data, fillToRect, ... }',
				},
				transition: {
					type: 'object',
					description: 'TransitionProps: { type, speed|duration, direction, throughBlack, splitDirection, pattern, spokes, clockwise, zoomFrom, option, advanceOnClick, advanceAfterTime }',
				},
				slideNumber: { type: 'object' },
				color: { type: 'string' },
				hidden: { type: 'boolean' },
				notes: { type: 'string' },
			},
		},
	},
	{
		name: 'betterpptx.slide.set_transition',
		title: 'Set one slide transition',
		description: 'Set or clear the transition for exactly one slide. Use this to correct the free preview requirement that slide 2 enters with Morph-by-object without changing later slides.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number', description: 'Zero-based slide index. Slide 2 is slideIndex 1.' },
				transition: {
					type: 'object',
					description: 'TransitionProps such as { type:"morph", option:"byObject" }. Omit or pass null to clear the transition.',
				},
			},
		},
	},
	{
		name: 'betterpptx.slide.inspect',
		title: 'Inspect one slide',
		description: 'Return one slide\'s editable state: background, transition, hidden flag, slide number, notes text, layout name, and object count. Use before slide.update when editing slide-level properties.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
			},
		},
	},
	{
		name: 'betterpptx.slide.update',
		title: 'Update one slide',
		description: 'Patch one slide\'s own properties without touching other slides: background, color, hidden flag, slideNumber, transition, and speaker notes. Use slide.set_transition when only the transition changes.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				patch: { type: 'object', description: 'Optional patch object. Top-level fields are also accepted.' },
				background: { type: ['object', 'null'], description: 'Slide background props, or null to clear.' },
				color: { type: ['string', 'null'], description: 'Slide color override, or null to clear.' },
				hidden: { type: ['boolean', 'null'], description: 'Hide/unhide the slide, or null to clear.' },
				slideNumber: { type: ['object', 'null'], description: 'Slide number config, or null to clear.' },
				transition: { type: ['object', 'null'], description: 'Single-slide transition props, or null to clear.' },
				notes: { type: ['string', 'null'], description: 'Speaker notes text. Null with notesMode:"clear" removes notes.' },
				notesMode: { type: 'string', enum: ['replace', 'append', 'clear'], default: 'replace' },
			},
		},
	},
	{
		name: 'betterpptx.slide.duplicate',
		title: 'Duplicate a slide with preserved object identity',
		description: 'Append an identity-preserving deep clone of a slide: all objects (keeping objectName + shape id), relationships (images/media/charts), background, and layout. This supports workflows such as applying a morph transition to the clone and then changing object position, size, rotation, text, or color with update_shape. Returns newSlideIndexes.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number', description: 'Index of the slide to clone.' },
				count: { type: 'number', description: 'How many successive copies to append (default 1).' },
				transition: {
					type: 'object',
					description: 'Transition to set on the clone(s), for example { type:"morph", option:"byObject"|"byWord"|"byChar", p14dur:ms }.',
				},
			},
		},
	},
	{
		name: 'betterpptx.slide.delete',
		title: 'Delete slide(s)',
		description: 'Remove one or more slides from the deck, update section membership, and renumber presentation slide ids/relationships so the saved PPTX remains package-valid. Refuses to delete the final slide.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number', description: 'Single zero-based slide index to delete.' },
				slideIndexes: { type: 'array', items: { type: 'number' }, description: 'Multiple zero-based slide indexes to delete.' },
			},
		},
	},
	{
		name: 'betterpptx.slide.reorder',
		title: 'Reorder slides',
		description: 'Move one slide to a new index, or replace the deck order with an explicit zero-based slide index permutation. Slide ids, relationship ids, and section slide lists are normalized after the move.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				fromIndex: { type: 'number', description: 'Slide index to move.' },
				slideIndex: { type: 'number', description: 'Alias for fromIndex.' },
				toIndex: { type: 'number', description: 'Destination index for the moved slide.' },
				order: { type: 'array', items: { type: 'number' }, description: 'Complete slide order permutation, e.g. [2,0,1].' },
			},
		},
	},
	{
		name: 'betterpptx.slide.add_text',
		title: 'Add text to a slide',
		description: 'Add text/paragraphs. Supports ALL evolved features: WordArt transform (textArchUp, textWave, textCircle, ...), Text3D (bevel/extrusion/material/lightRig/rotationX/Y/Z), reflection, glow, gradient fill, animation array, scheme colors, custom paragraphs. Text3D repair-safe forms: extrusion is a number or { depth, color }; extrusionColor is a hex string; lightRig is a preset string or { rig }. Invalid forms are rejected with a correction instead of being serialized.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'text'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				text: {
					oneOf: [
						{ type: 'string' },
						{ type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, options: { type: 'object' } } } },
					],
					description: 'String or array of paragraph TextProps (each with text/options).',
				},
				options: {
					type: 'object',
					description: 'TextPropsOptions: x/y/w/h, fontFace, fontSize, color, bold, italic, underline, align, valign, fill (solid or gradient), line, shadow, glow, reflection, wordArt: { transform, adjustments }, text3D: { bevel:{type,width,height} or {type,w,h}, extrusion:number or {depth,color}, extrusionColor, material, lightRig:string or {rig}, rotationX/Y/Z }, animation, autoFit, shape, charSpacing, lineSpacing, paraSpaceBefore/After, indentLevel, bullet, hyperlink, transparency, ...',
				},
			},
		},
	},
	{
		name: 'betterpptx.slide.add_equation',
		title: 'Add a native PowerPoint equation',
		description: 'Add an editable native PowerPoint equation/math zone. Emits native Office Math XML by default; fallback preview images are optional and must be caller-supplied or produced by a configured renderer.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'source'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				source: {
					oneOf: [
						{ type: 'string' },
						{ type: 'object' },
					],
					description: 'Equation source: plain/unicodeMath string, raw OMML string when sourceFormat="omml", or a template object such as {kind:"fraction", numerator:"a", denominator:"b"}.',
				},
				sourceFormat: {
					type: 'string',
					enum: ['plain', 'unicodeMath', 'omml', 'template'],
					description: 'Input interpretation. Use template for semantic structures and omml for exact Office Math XML.',
				},
				x: { type: 'number', description: 'X position, inches.' },
				y: { type: 'number', description: 'Y position, inches.' },
				w: { type: 'number', description: 'Width, inches.' },
				h: { type: 'number', description: 'Height, inches.' },
				objectName: { type: 'string' },
				fontSize: { type: 'number' },
				fontFace: { type: 'string' },
				color: { type: 'string' },
				align: { type: 'string', enum: ['left', 'center', 'right', 'justify'] },
				lang: { type: 'string' },
				altText: { type: 'string' },
				fallback: {
					oneOf: [
						{ type: 'boolean' },
						{ type: 'object', properties: { path: { type: 'string' }, data: { type: 'string' }, rendered: { type: 'boolean' } } },
					],
					description: 'Optional caller-supplied fallback image. Use false or omit for native-only equations.',
				},
				options: {
					type: 'object',
					description: 'Additional EquationProps fields; explicit top-level arguments win.',
				},
			},
		},
	},
	{
		name: 'betterpptx.equation.catalog',
		title: 'List native equation authoring capabilities',
		description: 'Return supported native PowerPoint equation source formats, semantic template kinds, common structures, and fallback-image policy for AI-authored education/math decks.',
		inputSchema: {
			type: 'object',
			properties: {},
		},
	},
	{
		name: 'betterpptx.slide.update_equation',
		title: 'Edit a native PowerPoint equation',
		description: 'Mutate an editable native equation in place by replacing its source/sourceFormat or patching layout/text styling. Use inspect_shapes to target equations by objectName or index.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'target'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				target: { description: 'Equation selector: number, { index }, { rawIndex }, or { objectName }.' },
				patch: { type: 'object', description: 'EquationProps patch merged into the existing equation.' },
				source: { description: 'Replacement equation source.' },
				sourceFormat: { type: 'string', enum: ['plain', 'unicodeMath', 'omml', 'template'] },
				x: { type: 'number' },
				y: { type: 'number' },
				w: { type: 'number' },
				h: { type: 'number' },
				objectName: { type: 'string' },
				fontSize: { type: 'number' },
				fontFace: { type: 'string' },
				color: { type: 'string' },
				align: { type: 'string', enum: ['left', 'center', 'right', 'justify'] },
				lang: { type: 'string' },
				altText: { type: 'string' },
				fallback: { description: 'Optional replacement caller-supplied fallback image config.' },
			},
		},
	},
	{
		name: 'betterpptx.smartart.catalog',
		title: 'List SmartArt authoring capabilities',
		description: 'Return PowerPoint SmartArt layouts, categories, native authoring support status, and supported native style/color presets. Results are semantic and do not expose server filesystem or matrix artifact paths.',
		inputSchema: {
			type: 'object',
			properties: {
				category: {
					type: 'string',
					description: 'Optional category filter such as list, process, cycle, hierarchy, relationship, matrix, pyramid, picture, timeline, or team.',
				},
				supportStatus: {
					type: 'string',
					enum: ['supported-native', 'shape-fallback', 'preserve-only', 'planned'],
					description: 'Optional support-status filter.',
				},
				includeLayouts: {
					type: 'boolean',
					default: true,
					description: 'Include layout entries. Set false when only counts and preset policy are needed.',
				},
				limit: {
					type: 'number',
					description: 'Optional maximum number of layout entries to return after filtering.',
				},
			},
		},
	},
	{
		name: 'betterpptx.deck.define_layout',
		title: 'Define a custom slide layout/size',
		description: 'Register a custom slide layout (name + width/height in inches). Then set pptx.layout to that name via deck.new layout argument on a later deck — or use it for unusual print sizes (e.g., A3, square, billboard).',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'name', 'width', 'height'],
			properties: {
				deckId: { type: 'string' },
				name: { type: 'string' },
				width: { type: 'number', description: 'Inches' },
				height: { type: 'number', description: 'Inches' },
				activate: { type: 'boolean', default: true, description: 'Switch the deck to this layout immediately.' },
			},
		},
	},
	{
		name: 'betterpptx.deck.load_template',
		title: 'Load an existing .pptx as a base template',
		description: 'Open an existing .pptx file, preserve its theme/master/layout scaffold, audit allowed layouts/placeholders/header/footer/logo regions, and optionally enforce a strict layout policy for newly authored slides.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'templatePath'],
			properties: {
				deckId: { type: 'string' },
				templatePath: { type: 'string', description: 'Absolute or relative path to a .pptx template file.' },
				applyFonts: { type: 'boolean', default: true, description: 'Apply the template fonts to the deck.' },
				preserveLayouts: { type: 'boolean', default: true, description: 'Copy the template slide masters/layouts/theme/media scaffold so new slides can bind to exact PowerPoint layouts.' },
				enforceLayoutPolicy: { type: 'boolean', default: false, description: 'When true, slide.add must use only allowed template layouts.' },
				strictLayout: { type: 'boolean', default: true, description: 'Reject unknown or disallowed layouts when a policy is active.' },
				allowedLayouts: { type: 'array', items: { type: 'string' }, description: 'Allowed layout names, types, numbers, or slideLayoutN identifiers.' },
				defaultLayout: { type: 'string', description: 'Default layout to apply when slide.add does not specify one.' },
				layoutName: { type: 'string', description: 'Optional custom deck size preset name registered from the template slide dimensions.' },
			},
		},
	},
	{
		name: 'betterpptx.deck.audit_layouts',
		title: 'Audit template layout contract',
		description: 'Return a layout contract for a deck/template: slide size, theme fonts/palette, masters, slide layouts, placeholders, fixed header/footer/logo objects, safe content areas, slide bindings, and suggested allowed-layout policy.',
		inputSchema: {
			type: 'object',
			properties: {
				deckId: { type: 'string', description: 'Deck handle returned by deck.new / deck.open_existing / deck.load_template.' },
				templatePath: { type: 'string', description: 'Optional .pptx template path to audit directly.' },
				setPolicy: { type: 'boolean', default: false, description: 'When true with deckId, store the returned policy on the deck for slide.add enforcement.' },
				enforceLayoutPolicy: { type: 'boolean', default: true, description: 'When setPolicy is true, require slides to use allowed layouts.' },
				strictLayout: { type: 'boolean', default: true, description: 'Reject unknown or disallowed layout names when enforcing.' },
				allowedLayouts: { type: 'array', items: { type: 'string' }, description: 'Allowed layout names, types, numbers, or slideLayoutN identifiers.' },
				defaultLayout: { type: 'string', description: 'Default layout to apply when slide.add omits layoutName/masterName.' },
			},
		},
	},
	{
		name: 'betterpptx.deck.autoplay',
		title: 'Configure deck to autoplay end-to-end',
		description: 'Configure the deck for autoplay: set showSettings (useTimings, mode, loop) AND apply advanceAfterTime + advanceOnClick:false to every existing slide transition. If a slide has no transition, a default fade transition will be added.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				secondsPerSlide: { type: 'number', default: 6, description: 'Seconds each slide stays on screen.' },
				loop: { type: 'boolean', default: true },
				mode: { type: 'string', enum: ['present', 'browse', 'kiosk'], default: 'kiosk' },
				showNarration: { type: 'boolean', description: 'Also enable showNarration in presentation show settings.' },
				defaultTransition: {
					type: 'object', description: 'Transition to apply to slides that have none.',
					default: { type: 'fade', speed: 'medium' },
				},
			},
		},
	},
	{
		name: 'betterpptx.narration.voices',
		title: 'List approved narration voices',
		description: 'List narration voices approved for presentation narration. Public endpoints return only approved voices.',
		inputSchema: {
			type: 'object',
			properties: {
				includeCandidates: { type: 'boolean', default: false },
				allowUnreviewedVoices: { type: 'boolean', default: false },
			},
		},
	},
	{
		name: 'betterpptx.narration.synthesize',
		title: 'Synthesize narration audio',
		description: 'Generate a WAV narration clip from text through the presentation service. Public endpoints return an opaque audio reference, duration, voice, and warnings.',
		inputSchema: {
			type: 'object',
			required: ['text'],
			properties: {
				text: { type: 'string' },
				voice: { type: 'string', description: 'Voice id from betterpptx.narration.voices.' },
				lang: { type: 'string', description: 'Language/locale fallback, e.g. en, en_US, fr_FR.' },
				provider: { type: 'string', description: 'TTS provider: piper-http by default; tone is development/test only.' },
				speaker: { type: 'number' },
				lengthScale: { type: 'number' },
				noiseScale: { type: 'number' },
				noiseWScale: { type: 'number' },
				allowUnreviewedVoices: { type: 'boolean', default: false, description: 'Development-only escape hatch for candidate voices.' },
			},
		},
	},
	{
		name: 'betterpptx.deck.add_narration',
		title: 'Add narrated autoplay timing to multiple slides',
		description: 'For each slide, synthesize or attach narration audio, add speaker notes, auto-play the audio, schedule cues/captions, and set deck show settings for narrated autoplay.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slides'],
			properties: {
				deckId: { type: 'string' },
				slides: { type: 'array', description: 'Array of { slideIndex, script|audio, cues?, captions?, voice?, lang?, provider?, paddingMs? }.' },
				tts: { type: 'object', description: 'Deck-level TTS defaults: { provider, voice, lang, speaker, lengthScale, noiseScale, noiseWScale }.' },
				captionPolicy: { type: 'object', description: 'Optional captions config applied to slides without their own captions; supports stackStatic and per-item x/y/w/h overrides.' },
				autoplay: { type: 'object', description: 'Autoplay settings: { paddingMs, mode, loop }.' },
				voice: { type: 'string' },
				lang: { type: 'string' },
				provider: { type: 'string' },
				paddingMs: { type: 'number' },
				loop: { type: 'boolean' },
				mode: { type: 'string', enum: ['present', 'browse', 'kiosk'] },
				showMediaControls: { type: 'boolean' },
				allowUnreviewedVoices: { type: 'boolean', default: false },
			},
		},
	},
	{
		name: 'betterpptx.slide.add_shape',
		title: 'Add a shape to a slide',
		description: 'Add any of 180+ shape presets (rect, ellipse, roundRect, star5, hexagon, chevron, ribbon, cloud, heart, lightningBolt, plaque, callout shapes, etc.) with gradient fill, line, shadow, reflection, soft edges, glow, animation, hyperlink, text content. Set shapeName to "custGeom" and pass points[] for FREEFORM vector geometry (moveTo, lineTo, arc, cubic/quadratic Bezier, close).',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'shapeName'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				shapeName: { type: 'string', description: 'Shape preset name from SHAPE_TYPE (rect, ellipse, roundRect, line, triangle, rightTriangle, parallelogram, trapezoid, diamond, pentagon, hexagon, octagon, star5..star16, arrowsRightLeft, ribbon, ribbon2, cloud, sun, moon, heart, lightningBolt, smileyFace, can, cube, callout, etc.).' },
				options: {
					type: 'object',
					description: 'ShapeProps: x/y/w/h, fill (solid or gradient: { type:"gradient", gradientStops, gradientAngle, gradientDirection, gradientPreset }), line, shadow, reflection, softEdges, glow, rotate, flipH/V, animation, hyperlink, rectRadius (roundRect), points (custGeom).',
				},
				text: { type: 'string', description: 'Optional text shorthand inside the shape (uses default text formatting).' },
				textOptions: { type: 'object', description: 'Optional explicit text options when text is provided.' },
			},
		},
	},
	{
		name: 'betterpptx.slide.add_smartart',
		title: 'Add a SmartArt diagram',
		description: 'Add a SmartArt diagram. Native mode creates editable PowerPoint SmartArt with layout, style, and color controls. Picture SmartArt layouts require caller-provided images on every node; blank picture placeholders are rejected. Shape mode remains available for editable native-shape diagram helpers.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				mode: { type: 'string', enum: ['shape', 'native'], default: 'native' },
				native: { type: 'boolean', description: 'Convenience alias for mode:"native".' },
				layout: { type: 'string', description: 'Native mode: PowerPoint SmartArt layout name/category such as list, process, Basic Process, or Organization Chart. Shape mode: process|cycle|hierarchy|matrix|pyramid|list|relationship|picture|timeline|team.' },
				layoutId: { type: 'string', description: 'Advanced native SmartArt layout ID when already known. Omit for category-selected defaults.' },
				layoutName: { type: 'string' },
				quickStyleId: { type: 'string' },
				quickStyleName: { type: 'string' },
				colorStyleId: { type: 'string' },
				colorStyleName: { type: 'string' },
				rightToLeft: { type: 'boolean' },
				nodes: { type: 'array', description: 'Node labels or objects { text, title, children?, image?, imageUrl?, imagePath?, imageData?, color?, fill?, line? }. For native picture layouts, every node must be an object with an image field; use non-picture layouts when images are unavailable.' },
				options: { type: 'object', description: 'SmartArtProps: x/y/w/h, title, layout, nodes, mode/native, layoutId, quickStyleId, colorStyleId, rightToLeft, palette, fill, line, shadow, fontFace, fontSize, color, animation, objectName. Picture layouts reject missing node images instead of drawing placeholders.' },
				x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' },
				title: { type: 'string' },
				objectName: { type: 'string' },
				palette: { type: 'array', items: { type: 'string' } },
				fill: { type: 'object' },
				line: { type: 'object' },
				shadow: { type: 'object' },
				fontFace: { type: 'string' },
				fontSize: { type: 'number' },
				color: { type: 'string' },
				animation: { description: 'AnimationProps or array of them applied to each node shape.' },
			},
		},
	},
	{
		name: 'betterpptx.slide.add_image',
		title: 'Add an image to a slide',
		description: 'Add image by path, data URL, or remote URL. Remote URLs are fetched server-side and embedded into the PPTX package. Supports rounding, sizing (contain/cover/crop), rotate, transparency, shadow, hyperlink.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				options: {
					type: 'object',
					description: 'ImageProps: x/y/w/h, path|data, sizing { type:"contain"|"cover"|"crop", w, h, x?, y? }, rounding, rotate, flipH, flipV, shadow, transparency, altText, hyperlink, placeholder. Remote image URLs are fetched and validated before embedding.',
				},
			},
		},
	},
	{
		name: 'betterpptx.slide.add_chart',
		title: 'Add a native chart to a slide',
		description: 'Add a full native OOXML chart. Single-type: pass chartType + data. Combo/multi-type (e.g. bar+line dual-axis): pass chartMulti=[{type,data,options},...]. Supports: gradient series via chartColors + data point overrides; dual axes via catAxes:[{...},{...}] and valAxes:[{...},{...}]; custom data labels (dataLabelFormatCode, dataLabelPosition, dataLabelColor); 3D rotation (v3DRotX, v3DRotY, v3DPerspective); chartArea / plotArea fills; lineSmooth, lineDataSymbol, barOverlapPct, barGapWidthPct, holeSize, firstSliceAng, radarStyle; alt text; per-chart shadow.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				chartType: { type: 'string', description: 'CHART_TYPE name: bar|bar3D|line|area|pie|doughnut|scatter|bubble|radar.' },
				chartMulti: { type: 'array', description: 'For combo charts: array of { type, data, options }. When set, chartType is ignored.' },
				data: { type: 'array', description: 'Array of IOptsChartData: [{ name, labels, values }, ...]. Scatter/bubble accept either [{ name:"X-Axis", values:[...] }, { name:"Series", values:[...], sizes? }] or shorthand [{ name, xValues:[...], yValues:[...], sizes? }]. Required when chartType is set; ignored when chartMulti is set.' },
				options: { type: 'object', description: 'Full IChartOpts. Examples: { chartColors:[ "FF3366","6633CC" ], plotArea:{ fill:{type:"gradient",gradientStops:[...] }}, catAxes:[{catAxisHidden:false}, {catAxisHidden:true}], valAxes:[{valAxisLabelColor:"FF0000"},{valAxisLabelColor:"00AA00"}], v3DRotX:30, v3DRotY:30, v3DPerspective:30, dataLabelFormatCode:"#,##0", holeSize:65, lineSmooth:true }.' },
			},
		},
	},
	{
		name: 'betterpptx.slide.add_table',
		title: 'Add a table to a slide',
		description: 'Add a table. For polished output, call betterpptx.table.recommend first when table intent/style is not specified. Per-cell { text, options } supports fill (solid or GRADIENT), border as single BorderProps OR [top,right,bottom,left], colspan, rowspan, margin, fontSize, fontFace, color, align, valign, bold, italic, hyperlink, autoPageCharWeight/LineWeight. Table-level supports x/y/w, colW, rowH, border, fill, margin, autoPage, autoPageRepeatHeader, autoPageHeaderRows, and PowerPoint Table Design flags: tableStyleId, headerRow, totalRow, bandedRows, firstColumn, lastColumn, bandedColumns.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'rows'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				rows: { type: 'array', description: 'Array of rows; each row is array of TableCell objects { text, options? } (options supports fill incl. gradient, colspan, rowspan, per-side borders).' },
				options: { type: 'object', description: 'TableProps including autoPage, autoPageRepeatHeader, autoPageHeaderRows, colW[], rowH[], border (single or [t,r,b,l]), fill, margin, and Table Design flags tableStyleId/headerRow/totalRow/bandedRows/firstColumn/lastColumn/bandedColumns.' },
			},
		},
	},
	{
		name: 'betterpptx.slide.add_media',
		title: 'Add audio/video media to a slide',
		description: 'Add audio or video. Use online: true with YouTube link for online video.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				options: { type: 'object', description: 'MediaProps: type ("audio"|"video"|"online"), path|link|data, x/y/w/h, cover, transparency, extn.' },
			},
		},
	},
	{
		name: 'betterpptx.slide.add_narration',
		title: 'Add slide narration',
		description: 'Attach slide narration as auto-playing audio. Uses script->TTS or caller-provided audio, writes speaker notes, sets slide advance timing in milliseconds, and optionally schedules cues/captions.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				script: { type: 'string', description: 'Narration script; also added to speaker notes.' },
				audio: { type: 'object', description: 'Provided audio: { path } or { data }, optional durationMs and extn. Non-WAV requires durationMs.' },
				cues: { type: 'array', description: 'Cue animations: [{ atMs, target:objectName|index, effect, type, duration, text? }].' },
				captions: { type: ['boolean', 'object'], description: 'false/off or { enabled:true, items?, x,y,w,h,fontSize,color,fill,stackStatic? }. Items may override x/y/w/h; multiple items stack by default for clean static exports.' },
				voice: { type: 'string' },
				lang: { type: 'string' },
				provider: { type: 'string' },
				speaker: { type: 'number' },
				lengthScale: { type: 'number' },
				noiseScale: { type: 'number' },
				noiseWScale: { type: 'number' },
				paddingMs: { type: 'number', default: 700 },
				startDelayMs: { type: 'number', default: 0 },
				allowUnreviewedVoices: { type: 'boolean', default: false },
				objectName: { type: 'string', description: 'Stable object name for the embedded audio shape.' },
				transparency: { type: 'number', description: 'Audio cover transparency percent. Defaults to 100 so narration controls are visually hidden.' },
			},
		},
	},
	{
		name: 'betterpptx.slide.add_model3d',
		title: 'Add a 3D model to a slide',
		description: 'Embed a presentation-ready 3D model on the slide with an optional poster fallback for viewers that do not render 3D. Supports camera, transform, ambient/point lights, viewport, shadow, rotate, and flip options. Ambient illuminance should be a 0..1 scalar; 0..100 is treated as a percentage.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				options: { type: 'object', description: '3D model options: modelAsset, posterAsset, x/y/w/h, rotate, flipH, shadow, camera, trans, ambientLight, ptLights, objViewport. Maintainer-local flows may also pass native model file fields.' },
			},
		},
	},
	{
		name: 'betterpptx.slide.add_freeform',
		title: 'Add a freeform / custGeom shape',
		description: 'Add a CustomGeometry shape from a sequence of vector commands (moveTo, lineTo, arcTo, cubicBezier, quadraticBezier, close). Coordinates are inches (or % strings) within the shape bounding box. Use it for arbitrary vector logos, icons, badges, paths, and dividers.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'x', 'y', 'w', 'h', 'points'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' },
				points: {
					type: 'array',
					description: 'Array of points in drawing order. Each entry is one of: { x, y, moveTo:true }, { x, y } (lineTo), { x, y, curve:{ type:"arc", hR, wR, stAng, swAng } }, { x, y, curve:{ type:"cubic", x1,y1,x2,y2 } }, { x, y, curve:{ type:"quadratic", x1,y1 } }, or { close:true }.',
				},
				fill: { type: 'object', description: 'ShapeFillProps (solid or gradient).' },
				line: { type: 'object', description: 'ShapeLineProps.' },
				shadow: { type: 'object' },
				glow: { type: 'object' },
				reflection: { type: 'object' },
				softEdges: { type: 'object' },
				rotate: { type: 'number' },
				animation: { description: 'AnimationProps or array of them.' },
				objectName: { type: 'string' },
			},
		},
	},
	{
		name: 'betterpptx.slide.add_notes',
		title: 'Add speaker notes',
		description: 'Append speaker notes to the slide.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'notes'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				notes: { type: 'string' },
			},
		},
	},
	{
		name: 'betterpptx.slide.passthrough_xml',
		title: 'Insert raw OOXML on a slide',
		description: 'Insert raw OOXML element (e.g., <p:sp>...</p:sp>, <p:graphicFrame>...</p:graphicFrame>) for advanced/unsupported features.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'xml'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				xml: { type: 'string' },
			},
		},
	},
	{
		name: 'betterpptx.deck.summary',
		title: 'Summarize current deck',
		description: 'Return slide count, sections, per-slide object counts, design quality, and two-slide Morph preview object-kind coverage for the deck.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: { deckId: { type: 'string' } },
		},
	},
	{
		name: 'betterpptx.deck.inspect_layouts',
		title: 'Inspect deck layouts, masters, and sections',
		description: 'Return presentation layout presets, slide master/layout summaries, per-slide layout binding, and section membership without exposing source files or package internals.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: { deckId: { type: 'string' } },
		},
	},
	{
		name: 'betterpptx.deck.sections',
		title: 'List or mutate PowerPoint sections',
		description: 'Manage section metadata: list, add, rename, delete, move, or assign slides to sections. Slide ordering is not changed; use slide.reorder for slide order.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				action: { type: 'string', enum: ['list', 'add', 'rename', 'delete', 'move', 'assign_slide'], default: 'list' },
				index: { type: 'number', description: 'Section index for rename/delete/move/assign, or insertion index for add.' },
				toIndex: { type: 'number', description: 'Destination section index for action:"move".' },
				title: { type: 'string', description: 'Section title for add/rename.' },
				newTitle: { type: 'string', description: 'Alias for title when renaming.' },
				slideIndex: { type: 'number', description: 'Single slide index for action:"assign_slide".' },
				slideIndexes: { type: 'array', items: { type: 'number' }, description: 'Multiple slide indexes for action:"assign_slide".' },
			},
		},
	},
	{
		name: 'betterpptx.deck.validate',
		title: 'Run presentation validation',
		description: 'Validate the deck (off-slide elements, missing props, etc.) and return issues plus non-blocking Morph preview object-kind coverage warnings.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				mode: { type: 'string', enum: ['lenient', 'normal', 'strict'], default: 'normal' },
				autoFix: { type: 'boolean', default: false },
			},
		},
	},
	{
		name: 'betterpptx.deck.validate_design',
		title: 'Validate modern presentation design quality',
		description: 'Score a deck against modern design expectations separately from package validity: gradients, shadows/depth, accent palette, text hierarchy, visual proof, expressive 3D pose, motion, narration, captions, and two-slide Morph preview object-kind coverage. Use this after deck.validate and validate_narration for showcase or agent-generated decks.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				profile: { type: 'string', enum: ['modern', 'narrated-showcase', 'static'], default: 'modern' },
				minScore: { type: 'number', description: 'Required score from 0-100. Defaults to 70 for modern, 80 for narrated-showcase.' },
				requireNarration: { type: 'boolean', description: 'Require narration coverage on every slide.' },
				requireMotion: { type: 'boolean', description: 'Require motion coverage across the story.' },
				requireVisualProof: { type: 'boolean', description: 'Require charts, data/KPI blocks, images, 3D assets, process, or architecture visuals.' },
				requireExpressive3D: { type: 'boolean', description: 'Require embedded 3D models to use expressive pose/rotation and 3D motion coverage.' },
			},
		},
	},
	{
		name: 'betterpptx.deck.validate_narration',
		title: 'Validate narration package XML',
		description: 'Serialize or inspect a saved deck and verify narration media, p:audio timing nodes, mediacall playFrom commands, notes, showNarration/useTimings, and sane slide advance timings.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				filePath: { type: 'string', description: 'Optional saved PPTX path. If omitted, uses last save path or writes a temporary validation deck.' },
				compression: { type: 'boolean', default: true },
			},
		},
	},
	{
		name: 'betterpptx.deck.save',
		title: 'Write the deck to disk',
		description: 'Serialize the deck and write the .pptx to disk. Returns absolute file path plus Morph preview object-kind coverage so AI clients can see any non-blocking preview-design gaps.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				idempotencyKey: { type: 'string', description: 'Optional client retry key. Repeating deck.save with the same key and same arguments returns the same saved artifact metadata instead of publishing another artifact.' },
				fileName: { type: 'string', description: 'Output filename (or absolute path). Defaults to betterpptx_<deckId>.pptx in CWD.' },
				outputDir: { type: 'string', description: 'Optional directory (used when fileName is a bare filename).' },
				compression: { type: 'boolean', default: true },
			},
		},
	},
	{
		name: 'betterpptx.deck.dispose',
		title: 'Forget a deck',
		description: 'Drop the deck from memory.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: { deckId: { type: 'string' } },
		},
	},
	{
		name: 'betterpptx.deck.list',
		title: 'List active decks',
		description: 'List currently-held deckIds and their titles.',
		inputSchema: { type: 'object', properties: {} },
	},
	// =====================================================================
	//  GENERIC PRIMITIVES — these are the only domain-neutral tools.
	//  Everything above is a deck/slide primitive (creation, mutation,
	//  inspection, save). Everything below is a generic helper any AI client
	//  can use to load data, analyse images, or convert geometry.
	// =====================================================================
	{
		name: 'betterpptx.io.read_file',
		title: 'Read a file from the workspace',
		description: 'Generic file read. Returns content as utf-8 text by default, or base64 if encoding="base64" (use for binary). No domain semantics — the caller chooses what to do with the bytes.',
		inputSchema: {
			type: 'object',
			required: ['path'],
			properties: {
				path: { type: 'string', description: 'Absolute or workspace-relative path.' },
				encoding: { type: 'string', enum: ['utf-8', 'base64'], default: 'utf-8' },
				maxBytes: { type: 'number', description: 'Optional cap; reads at most N bytes.' },
			},
		},
	},
	{
		name: 'betterpptx.io.write_file',
		title: 'Write a file to the workspace',
		description: 'Generic file write. content is utf-8 unless encoding="base64". Creates parent dirs as needed.',
		inputSchema: {
			type: 'object',
			required: ['path', 'content'],
			properties: {
				path: { type: 'string' },
				content: { type: 'string' },
				encoding: { type: 'string', enum: ['utf-8', 'base64'], default: 'utf-8' },
			},
		},
	},
	{
		name: 'betterpptx.io.list_dir',
		title: 'List a directory',
		description: 'Generic dir list. Returns names + sizes + isDirectory flags. Optional glob-style pattern.',
		inputSchema: {
			type: 'object',
			required: ['path'],
			properties: {
				path: { type: 'string' },
				pattern: { type: 'string', description: 'Optional shell-glob (e.g. "*.geojson"). Filters returned entries.' },
			},
		},
	},
	{
		name: 'betterpptx.io.read_json',
		title: 'Read and parse a JSON file',
		description: 'Convenience: io.read_file + JSON.parse. The whole document is returned. For large files, prefer io.read_file + parse client-side.',
		inputSchema: {
			type: 'object',
			required: ['path'],
			properties: {
				path: { type: 'string' },
			},
		},
	},
	{
		name: 'betterpptx.fs.find',
		title: 'Recursively find files matching a glob',
		description: 'Walks a directory tree and returns matching file paths. Pattern syntax: `*` (within a segment), `**` (any depth), `?` (single char). Use this to discover local non-image assets and data such as geojson maps, GLB models, SVG icons, and shape-scene JSON without making N separate io.list_dir calls.',
		inputSchema: {
			type: 'object',
			required: ['root'],
			properties: {
				root: { type: 'string', description: 'Root directory to walk.' },
				pattern: { type: 'string', description: 'Glob pattern. Default: "**" (all files).', default: '**' },
				maxResults: { type: 'number', default: 500 },
				includeStats: { type: 'boolean', default: false, description: 'Include bytes + mtime on each result.' },
			},
		},
	},
	{
		name: 'betterpptx.assets.catalog',
		title: 'Find presentation assets',
		description: 'Return presentation assets as opaque handles. Use this before generic web assets when selecting 3D models, icons, textures, custom geometry scenes, or related media. Public results include user-facing labels, usage guidance, and handle-based slide.add_model3d options without exposing product internals.',
		inputSchema: {
			type: 'object',
			properties: {
				kind: { type: 'string', enum: ['model3d', 'model', 'glb', 'icon', 'shapeScene', 'customShape', 'customGeometry'], description: 'Optional asset category filter. customShape/customGeometry are aliases for shapeScene.' },
				query: { type: 'string', description: 'Optional semantic search across titles, categories, and use roles.' },
				useCase: { type: 'string', description: 'Optional slide/story context used with query to rank the best object.' },
				source: { type: 'string', description: 'Optional category filter.' },
				maxResults: { type: 'number', default: 60 },
				preferNative: { type: 'boolean', default: true, description: 'When true, rank relevant Microsoft PowerPoint Stock 3D models above other sources.' },
				includeDuplicates: { type: 'boolean', default: false, description: 'Normally duplicate asset entries are consolidated while preserving useful categories and titles.' },
				sizePolicy: { type: 'string', enum: ['compact', 'standard', 'balanced', 'large-ok', 'unrestricted'], default: 'standard', description: 'GLB size policy for model3d results. standard keeps results at about 10 MiB or less; use large-ok/unrestricted only when detail matters more than PPTX file size.' },
				maxModelSizeMb: { type: 'number', description: 'Optional explicit GLB size ceiling in MiB for model3d results. Overrides sizePolicy.' },
			},
		},
	},
	{
		name: 'betterpptx.sketchfab.search',
		title: 'Search Sketchfab models',
		description: 'Search live Sketchfab model metadata using website-like inputs. Returns candidate sketchfab:// handles, model uid/id, name, creator, viewer URL, rights, thumbnails, archive sizes, and ranking hints. Import a candidate before using it in a slide.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Search text, for example "office chair", "bank vault", or "solar panel".' },
				q: { type: 'string', description: 'Alias for query.' },
				name: { type: 'string', description: 'Model name to search or exact-match after search.' },
				maxResults: { type: 'number', default: 12 },
				cursor: { type: 'string', description: 'Sketchfab pagination cursor returned by a previous search.' },
				downloadable: { type: 'boolean', default: true, description: 'When true, only return downloadable models.' },
				commercialUseOnly: { type: 'boolean', default: true, description: 'When true, keep only models matching the selected commercial-use rights policy.' },
				licensePolicy: { type: 'string', enum: ['commercial-safe', 'commercial-with-sharealike', 'commercial-broad', 'cc0-only', 'any-downloadable'], default: 'commercial-safe', description: 'Rights filter. commercial-safe keeps CC0 and CC Attribution models by default.' },
				allowedLicenseSlugs: { type: 'array', items: { type: 'string' }, description: 'Optional explicit Sketchfab license slugs, for example ["cc0","by"].' },
				sizePolicy: { type: 'string', enum: ['compact', 'standard', 'balanced', 'large-ok', 'unrestricted'], default: 'standard', description: '3D model size policy. standard keeps results around 10 MiB or less.' },
				maxModelSizeMb: { type: 'number', description: 'Explicit archive size ceiling in MiB.' },
				format: { type: 'string', enum: ['auto', 'glb', 'gltf'], default: 'auto', description: 'Preferred archive format used for size filtering.' },
				categories: { type: 'string', description: 'Optional Sketchfab category slug or comma-separated slugs.' },
				tags: { type: 'string', description: 'Optional Sketchfab tag or comma-separated tags.' },
				keywords: { type: 'string', description: 'Alias for tags when a client uses generic asset terminology.' },
				animated: { type: 'boolean', description: 'Optional Sketchfab animated filter.' },
				staffpicked: { type: 'boolean', description: 'Optional Sketchfab staffpicked filter.' },
				sortBy: { type: 'string', description: 'Sketchfab sort value such as "-publishedAt", "-likeCount", or "-viewCount".' },
				timeoutMs: { type: 'number', default: 30000 },
			},
		},
	},
	{
		name: 'betterpptx.sketchfab.inspect',
		title: 'Inspect a Sketchfab model',
		description: 'Resolve a Sketchfab model by uid/id, Sketchfab URL, sketchfab:// candidate handle, imported model3d:// handle, or query/name. Returns website-like metadata and optional download-format availability without exposing temporary download URLs.',
		inputSchema: {
			type: 'object',
			properties: {
				uid: { type: 'string', description: 'Sketchfab model uid.' },
				id: { type: 'string', description: 'Alias for uid.' },
				modelId: { type: 'string', description: 'Alias for uid.' },
				handle: { type: 'string', description: 'sketchfab://models/{uid} or model3d://sketchfab/{uid}/... handle.' },
				sketchfabHandle: { type: 'string', description: 'Alias for handle.' },
				url: { type: 'string', description: 'Sketchfab model URL.' },
				viewerUrl: { type: 'string', description: 'Sketchfab viewer URL.' },
				query: { type: 'string', description: 'Fallback search text when uid/url/handle is not supplied.' },
				name: { type: 'string', description: 'Fallback model name. Exact name match is preferred when search returns several candidates.' },
				searchLimit: { type: 'number', default: 12 },
				commercialUseOnly: { type: 'boolean', default: true },
				licensePolicy: { type: 'string', enum: ['commercial-safe', 'commercial-with-sharealike', 'commercial-broad', 'cc0-only', 'any-downloadable'], default: 'commercial-safe' },
				sizePolicy: { type: 'string', enum: ['compact', 'standard', 'balanced', 'large-ok', 'unrestricted'], default: 'standard' },
				maxModelSizeMb: { type: 'number' },
				format: { type: 'string', enum: ['auto', 'glb', 'gltf'], default: 'auto' },
				includeDescription: { type: 'boolean', default: true },
				inspectDownload: { type: 'boolean', default: false, description: 'When true, summarize Sketchfab download formats if the installed service API key is configured. Temporary URLs are never returned.' },
				timeoutMs: { type: 'number', default: 30000 },
			},
		},
	},
	{
		name: 'betterpptx.sketchfab.import',
		title: 'Import a Sketchfab model',
		description: 'Download a selected Sketchfab model through the official API and register it as an opaque model3d:// handle usable by slide.add_model3d. Accepts uid/id, URL, sketchfab:// handle, imported handle, or query/name. Downloads use the installed service API key; clients do not pass credentials per request.',
		inputSchema: {
			type: 'object',
			properties: {
				uid: { type: 'string', description: 'Sketchfab model uid.' },
				id: { type: 'string', description: 'Alias for uid.' },
				modelId: { type: 'string', description: 'Alias for uid.' },
				handle: { type: 'string', description: 'sketchfab://models/{uid} or model3d://sketchfab/{uid}/... handle.' },
				sketchfabHandle: { type: 'string', description: 'Alias for handle.' },
				url: { type: 'string', description: 'Sketchfab model URL.' },
				viewerUrl: { type: 'string', description: 'Sketchfab viewer URL.' },
				query: { type: 'string', description: 'Fallback search text when uid/url/handle is not supplied.' },
				name: { type: 'string', description: 'Fallback model name. Exact name match is preferred when search returns several candidates.' },
				searchLimit: { type: 'number', default: 12 },
				commercialUseOnly: { type: 'boolean', default: true },
				licensePolicy: { type: 'string', enum: ['commercial-safe', 'commercial-with-sharealike', 'commercial-broad', 'cc0-only', 'any-downloadable'], default: 'commercial-safe', description: 'Rights filter enforced before download.' },
				sizePolicy: { type: 'string', enum: ['compact', 'standard', 'balanced', 'large-ok', 'unrestricted'], default: 'standard' },
				maxModelSizeMb: { type: 'number', description: 'Explicit archive/import ceiling in MiB.' },
				format: { type: 'string', enum: ['auto', 'glb', 'gltf'], default: 'auto' },
				downloadFormat: { type: 'string', enum: ['auto', 'glb', 'gltf'], default: 'auto', description: 'Alias for format.' },
				downloadThumbnail: { type: 'boolean', default: true },
				convertGltf: { type: 'boolean', default: true, description: 'Convert downloaded glTF packages to GLB for PowerPoint embedding.' },
				refresh: { type: 'boolean', default: false, description: 'When false, an already imported uid returns the existing model3d handle.' },
				idempotencyKey: { type: 'string', description: 'Recommended for repeated imports in production clients.' },
				timeoutMs: { type: 'number', default: 30000 },
				downloadTimeoutMs: { type: 'number', default: 120000 },
			},
		},
	},
	{
		name: 'betterpptx.http.fetch',
		title: 'Fetch any URL over HTTP/HTTPS',
		description: 'Generic HTTP/HTTPS fetch. The MCP server makes the request on its side and returns the body. Use this to pull assets from the open web in the same session: geojson maps, Khronos sample 3D models, raw SVG icons, public datasets, etc. Returns body as text/json/base64 (auto-detected from Content-Type) or writes to disk via saveToPath.',
		inputSchema: {
			type: 'object',
			required: ['url'],
			properties: {
				url: { type: 'string', description: 'http:// or https:// URL.' },
				method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'], default: 'GET' },
				headers: { type: 'object', description: 'Request headers (e.g. {"User-Agent":"...","Authorization":"Bearer ..."}). Object of strings.' },
				body: { type: 'string', description: 'Request body (for POST/PUT/PATCH).' },
				responseType: { type: 'string', enum: ['auto', 'text', 'json', 'base64', 'raw'], default: 'auto', description: 'auto picks based on Content-Type: json/text/base64.' },
				maxBytes: { type: 'number', default: 52428800, description: 'Maximum response size (bytes). Default 50 MB.' },
				timeoutMs: { type: 'number', default: 30000 },
				saveToPath: { type: 'string', description: 'When set, writes the response to disk and returns savedTo path. Body is NOT returned over MCP unless alsoReturnBody is true.' },
				alsoReturnBody: { type: 'boolean', default: false, description: 'When saveToPath is set, also include the body in the response.' },
			},
		},
	},
	{
		name: 'betterpptx.image.sample_palette',
		title: 'Sample a dominant-colour palette from any image',
		description: 'Generic image colour quantisation. Reads a PNG (and JPEGs via byte sampling), runs k-means in RGB, and returns the dominant clusters sorted by saturation × frequency. Does NOT prescribe theme slots — the caller picks which cluster becomes primary/accent/etc.',
		inputSchema: {
			type: 'object',
			required: ['imagePath'],
			properties: {
				imagePath: { type: 'string' },
				k: { type: 'number', default: 8 },
				sampleDim: { type: 'number', default: 96 },
				filterBackground: { type: 'boolean', default: true, description: 'When true, drop near-white/near-black pixels before clustering so brand colours dominate.' },
			},
		},
	},
	{
		name: 'betterpptx.geometry.polygon_to_custgeom',
		title: 'Convert polygon rings to custGeom points',
		description: 'Generic affine projection of polygon rings into custGeom points. Three modes:\n\n• fitToBox (default) — pass {rings, w, h, fit}; each polygon is projected into its own [0..w, 0..h] local box.\n\n• projectInto — pass {rings, projectInto: {sourceBounds:{minX,maxX,minY,maxY}, targetBox:{x,y,w,h}}}; every polygon projected with the same projectInto lands in the same slide coordinate system. Returns shapeBBox + points (local to shapeBBox top-left).\n\n• multiPolygon — pass {polygons: [[ring1, ring2, ...], [ring1], ...]} instead of `rings`. Each top-level entry becomes its own custGeom shape with its own bbox. Returns `shapes: [...]` array (one entry per polygon). Combines with all other options including projectInto and smoothing.',
		inputSchema: {
			type: 'object',
			properties: {
				rings: {
					type: 'array',
					description: 'Array of rings (one polygon). Each ring is an array of [number, number] pairs. Use this OR `polygons`, not both.',
					items: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
				},
				polygons: {
					type: 'array',
					description: 'Array of polygons; each polygon is its own array of rings. Output will be one custGeom shape per polygon. Use for MultiPolygon features.',
					items: { type: 'array', items: { type: 'array', items: { type: 'array', items: { type: 'number' } } } },
				},
				w: { type: 'number', description: '(fitToBox mode) target width in inches.' },
				h: { type: 'number', description: '(fitToBox mode) target height in inches.' },
				projection: { type: 'string', enum: ['none', 'equirectangular'], default: 'none', description: 'Tag indicating the input coordinate semantics. Math is the same either way; this is mainly metadata.' },
				maxPointsPerRing: { type: 'number', default: 80 },
				fit: { type: 'string', enum: ['preserve-aspect', 'stretch'], default: 'preserve-aspect' },
				flipY: { type: 'boolean', default: true, description: 'Flip the Y axis (true for geographic / image-style coords where y grows downward).' },
				smoothing: {
					type: 'string',
					enum: ['none', 'catmull-rom'],
					default: 'none',
					description: 'When set to "catmull-rom", emits cubicBezTo curves through the source points (Catmull-Rom to cubic Bezier conversion). Adds about 3x more <a:pt> nodes per ring; combine with a smaller maxPointsPerRing when file size matters.',
				},
				projectInto: {
					type: 'object',
					description: 'Shared-coordinate projection. When set, w/h/fit are ignored and the polygon is projected into a SINGLE slide coordinate system shared with other polygons projected the same way.',
					properties: {
						sourceBounds: { type: 'object', properties: { minX: { type: 'number' }, maxX: { type: 'number' }, minY: { type: 'number' }, maxY: { type: 'number' } }, required: ['minX', 'maxX', 'minY', 'maxY'] },
						targetBox: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } }, required: ['x', 'y', 'w', 'h'] },
					},
				},
			},
		},
	},
	{
		name: 'betterpptx.geometry.simplify_path',
		title: 'Decimate a point list to <= maxPoints',
		description: 'Uniform decimation of a single polyline/ring. Pass [[x,y],...]; returns the reduced list. No projection.',
		inputSchema: {
			type: 'object',
			required: ['points', 'maxPoints'],
			properties: {
				points: { type: 'array', items: { type: 'array', items: { type: 'number' } } },
				maxPoints: { type: 'number' },
			},
		},
	},
	{
		name: 'betterpptx.library.list_xml_groups',
		title: 'List top-level shape groups in any pptx slide XML',
		description: 'Parses a pptx slide.xml (from a decyphered deck, an uploaded deck, or any pptx) and returns every top-level <p:grpSp> entry with its name, on-slide position/size (inches), shape count, cubicBezTo count, sub-group count, and a `hasRelationships` flag (true means the group references rIds → safe passthrough requires copying rels). Use as the discovery step before library.import_xml_group.',
		inputSchema: {
			type: 'object',
			required: ['sourcePath'],
			properties: {
				sourcePath: { type: 'string', description: 'Absolute or workspace-relative path to a slide.xml file (e.g. one of the files in `decyphered/<deck>/extracted/slideNN.xml`).' },
			},
		},
	},
	{
		name: 'betterpptx.library.import_xml_group',
		title: 'Import a named shape group from any pptx slide XML',
		description: 'Extracts one top-level <p:grpSp> from a source pptx slide XML and embeds it in the target slide via passthrough_xml. Optionally rewrites the outer xfrm to position+resize the group inside a `targetBox` on the destination slide. Automatically renumbers internal shape IDs to avoid collisions. By default refuses to import groups that reference rIds (because the target deck would not have the matching media); pass allowRelationships:true to override.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'sourcePath'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				sourcePath: { type: 'string', description: 'Path to a slide.xml file.' },
				groupName: { type: 'string', description: 'Match by <p:cNvPr name="..."> on the top-level group.' },
				groupIndex: { type: 'number', description: 'Or by index into list_xml_groups output (0-based).' },
				targetBox: {
					type: 'object',
					description: 'Optional { x, y, w, h } in inches. When set, the group is repositioned and resized.',
					properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } },
					required: ['x', 'y', 'w', 'h'],
				},
				fit: { type: 'string', enum: ['preserve-aspect', 'stretch'], default: 'preserve-aspect', description: 'When targetBox is set: preserve-aspect (default) letterboxes the source inside targetBox to avoid distortion; stretch forces the group to fill the box (distorts non-square source).' },
				allowRelationships: { type: 'boolean', default: false, description: 'Allow import even when the group references rIds (images/embeds). Without rels copying, those will render as broken refs.' },
			},
		},
	},
	{
		name: 'betterpptx.deck.open_existing',
		title: 'Open an existing .pptx for editing',
		description: 'Open an existing presentation into a fresh BetterPPTX deck inside the registry. Returns a deckId you can continue to mutate (add animations, set transitions, autoplay, save). Decyphered objects carry edit handles and editability tiers so AI clients can distinguish semantic, promotable, wrapper-editable, and preserve-only objects before editing. Layout, visual scaffold, relationship-backed parts, and source slide timing are preserved by default.',
		inputSchema: {
			type: 'object',
			required: ['pptxPath'],
			properties: {
				pptxPath: { type: 'string' },
				workDir: { type: 'string', description: 'Where to extract assets (defaults to ./.BetterPPTX-cache).' },
				slideNumbers: { type: 'array', items: { type: 'number' }, description: 'Optional 1-based source slide numbers to import instead of the full deck.' },
				preserveTiming: { type: 'boolean', default: true, description: 'Preserve source <p:timing> XML for existing animations when possible.' },
			},
		},
	},
	{
		name: 'betterpptx.deck.open_uploaded',
		title: 'Open an uploaded .pptx for editing',
		description: 'Open a user-uploaded PowerPoint file from base64/data-URL bytes into a fresh deckId. This is the public/chat-safe import path: no server filesystem path is required or exposed. Import is available in the free tier; the same freemium rule applies after import, so slides 1 and 2 can use premium features while slide 3+ premium edits return REQUIRES_UPGRADE unless activated.',
		inputSchema: {
			type: 'object',
			required: ['data'],
			properties: {
				data: { type: 'string', description: 'Base64 PPTX bytes, or a data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,... URL.' },
				fileName: { type: 'string', description: 'Optional display filename for the uploaded presentation.' },
				slideNumbers: { type: 'array', items: { type: 'number' }, description: 'Optional 1-based source slide numbers to import instead of the full deck.' },
				preserveTiming: { type: 'boolean', default: true, description: 'Preserve source timing/animation XML when possible.' },
			},
		},
	},
	{
		name: 'betterpptx.slide.list_shapes',
		title: 'List shapes on a slide',
		description: 'Return all shapes currently on the slide with their objectName, kind, bbox, editHandle, and editability tier. Use this after open_existing to discover stable selectors and what can be animated or edited.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
			},
		},
	},
	{
		name: 'betterpptx.slide.inspect_shapes',
		title: 'Inspect every shape on a slide with full properties',
		description: 'Generic read primitive for edit recipes. Returns each shape with: index, objectName, kind, shapeName, editHandle, editability, bbox, style, text, passthrough metadata when present, and a `colors[]` list of every hex referenced anywhere in that shape, including raw passthrough XML. Use this BEFORE update_shape/update_chart/update_table/etc. to know what can be changed safely.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				includeText: { type: 'boolean', default: true, description: 'Include rich text paragraphs/runs in the dump.' },
				full: { type: 'boolean', default: false, description: 'Also include the entire raw options object (large; useful for advanced edits).' },
			},
		},
	},
	{
		name: 'betterpptx.deck.editability_report',
		title: 'Report deck editability coverage',
		description: 'Summarize every editable object in the deck by kind and editability tier: semantic, promotable, wrapper-editable, or preserve-only. Includes stable edit handles in full mode. Use after open_existing/decypher import to plan exhaustive but repair-safe edits.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				compact: { type: 'boolean', default: false, description: 'When true, return per-slide tier counts instead of every object.' },
			},
		},
	},
	{
		name: 'betterpptx.slide.update_shape',
		title: 'Patch a shape\'s properties in place',
		description: 'Generic write primitive. Target a shape by `target: index` or `target: { objectName: "..." }`, supply a `patch` object — any keys in the patch are deep-merged into the shape\'s options. Examples:\n• Recolor: `patch: { fill: { color: "FF3399" } }`\n• Resize:  `patch: { w: 4.5, h: 2.0 }`\n• Refont:  `patch: { fontFace: "Inter", fontSize: 18, color: "0F172A" }`\n• Add glow: `patch: { glow: { size: 12, color: "22D3EE", opacity: 0.7 } }`\n• Remove a prop: pass null (e.g. `patch: { shadow: null }`).\nArrays in the patch REPLACE arrays in the target (not element-wise merge).',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'target', 'patch'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				target: { description: 'Shape selector: number (index), or object { index } | { objectName }.' },
				patch: { type: 'object', description: 'Partial shape options to deep-merge into the target shape\'s options.' },
			},
		},
	},
	{
		name: 'betterpptx.slide.delete_shapes',
		title: 'Delete objects from one slide',
		description: 'Delete one or more editable slide objects by target, index, name, kind, or objectNameRegex. Notes are never selected. Use inspect_shapes first when targeting imported decks.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				target: { description: 'Single selector: number, { index }, { rawIndex }, or { objectName }.' },
				targets: { type: 'array', items: {}, description: 'Multiple selectors.' },
				indices: { type: 'array', items: { type: 'number' }, description: 'Editable shape indexes from inspect_shapes/list_shapes.' },
				names: { type: 'array', items: { type: 'string' }, description: 'Object names to delete.' },
				objectNames: { type: 'array', items: { type: 'string' }, description: 'Alias for names.' },
				kinds: { type: 'array', items: { type: 'string' }, description: 'Delete all matching object kinds such as text, image, chart, table, smartart, media, model3d.' },
				objectNameRegex: { type: 'string', description: 'Delete objects whose objectName matches this JavaScript regular expression.' },
				allowEmpty: { type: 'boolean', default: false, description: 'When true, no-op if selectors match nothing.' },
			},
		},
	},
	{
		name: 'betterpptx.slide.reorder_shape',
		title: 'Reorder one object on a slide',
		description: 'Move one editable object in z-order by target plus toIndex, or position front/back/forward/backward. This changes only the object order on the selected slide.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'target'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				target: { description: 'Shape selector: number, { index }, { rawIndex }, or { objectName }.' },
				toIndex: { type: 'number', description: 'New editable object index. 0 is back; the largest index is front.' },
				position: { type: 'string', enum: ['front', 'back', 'forward', 'backward'], description: 'Convenience z-order move.' },
			},
		},
	},
	{
		name: 'betterpptx.slide.update_table',
		title: 'Edit table structure and cells',
		description: 'Mutate a structurally editable native table in place: replace rows, patch table options, edit a cell, add/delete rows, or add/delete columns. Raw passthrough tables are rejected with a clear error because they must be recreated or edited through XML-aware tooling.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'target'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				target: { description: 'Table selector: number, { index }, { rawIndex }, or { objectName }.' },
				rows: { type: 'array', description: 'Replacement rows. Each row is an array of strings/numbers or { text, options } cells.' },
				optionsPatch: { type: 'object', description: 'Patch merged into table-level options.' },
				setCell: { type: 'object', description: '{ row, col, text?, options?, patch? }.' },
				patchCell: { type: 'object', description: '{ row, col, text?, options?, patch? }.' },
				addRow: { type: 'object', description: '{ index?, cells? }.' },
				deleteRow: { type: 'object', description: '{ index }.' },
				addColumn: { type: 'object', description: '{ index?, cells? } where cells is one value per row.' },
				deleteColumn: { type: 'object', description: '{ index }.' },
				operations: { type: 'array', items: { type: 'object' }, description: 'Ordered operations with op/type: replaceRows, patchOptions, setCell, patchCell, addRow, deleteRow, addColumn, deleteColumn.' },
			},
		},
	},
	{
		name: 'betterpptx.slide.update_chart',
		title: 'Edit native chart data and options',
		description: 'Mutate a structurally editable native chart in place by replacing its data, changing the chart type, and/or patching chart options. Preserved ChartEx passthrough charts are editable: the first update converts them to native editable ChartEx while untouched imports remain exact.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'target'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				target: { description: 'Chart selector: number, { index }, { rawIndex }, or { objectName }.' },
				chartType: { type: 'string', description: 'Native chart type, e.g. bar, line, pie, doughnut, scatter, bubble, radar, treemap, sunburst, histogram, pareto, boxWhisker, waterfall, funnel, regionMap.' },
				type: { type: 'string', description: 'Alias for chartType.' },
				chartMulti: { type: 'array', items: { type: 'object' }, description: 'Combo chart type/data descriptors.' },
				data: { type: 'array', items: { type: 'object' }, description: 'Replacement IOptsChartData array.' },
				optionsPatch: { type: 'object', description: 'Patch merged into chart options.' },
			},
		},
	},
	{
		name: 'betterpptx.slide.update_smartart',
		title: 'Edit native SmartArt nodes and styles',
		description: 'Mutate native SmartArt by rebuilding its diagram package parts with new node labels and optional layout/style/color updates while preserving position and objectName.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'target'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				target: { description: 'SmartArt selector: number, { index }, { rawIndex }, or { objectName }.' },
				nodes: { type: 'array', description: 'Replacement SmartArt node labels or node objects.' },
				nodeIndex: { type: 'number', description: 'Flat node index to rename when nodes is omitted.' },
				nodePath: { type: 'array', items: { type: 'number' }, description: 'Nested node path to rename, e.g. [0,2].' },
				text: { type: 'string', description: 'Replacement text for nodeIndex/nodePath.' },
				label: { type: 'string', description: 'Alias for text.' },
				layout: { type: 'string' },
				layoutId: { type: 'string' },
				layoutName: { type: 'string' },
				quickStyleId: { type: 'string' },
				colorStyleId: { type: 'string' },
				optionsPatch: { type: 'object', description: 'Patch merged into rebuilt SmartArt options.' },
			},
		},
	},
	{
		name: 'betterpptx.slide.update_media',
		title: 'Edit media playback settings',
		description: 'Patch an existing audio/video shape and optionally add media play/pause/stop timing commands. Supports interactivePlayback and media timing volume without replacing the media file.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'target'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				target: { description: 'Media selector: number, { index }, { rawIndex }, or { objectName }.' },
				optionsPatch: { type: 'object', description: 'Patch merged into media object options (position, size, transparency, etc.).' },
				interactivePlayback: { type: 'boolean', description: 'Enable or disable click-on-media interactive playback sequence.' },
				volume: { type: 'number', description: 'Volume as 0-1, 0-100 percent, or 0-100000 PowerPoint units.' },
				command: { type: 'string', description: 'Media command such as playFrom(0.0), togglePause, or stop.' },
				mediaCommand: { type: 'string', description: 'Alias for command.' },
				addCommand: { type: 'boolean', description: 'Add a default playFrom(0.0) command when command is omitted.' },
				trigger: { type: 'string', enum: ['onClick', 'withPrevious', 'afterPrevious'] },
				delay: { type: 'number' },
				duration: { type: 'number' },
				effect: { type: 'string', description: 'Optional animation effect label, e.g. mediaplay, mediapause, mediastop.' },
				replaceExistingCommands: { type: 'boolean', default: false, description: 'Remove existing generated media commands for the target before adding the new command.' },
				preserveExistingTiming: { type: 'boolean', default: false, description: 'Keep imported raw timing XML even if adding generated media commands.' },
				playback: { type: 'object', description: 'Nested alias object for command, trigger, delay, duration, volume, interactivePlayback, replaceExistingCommands, preserveExistingTiming.' },
			},
		},
	},
	{
		name: 'betterpptx.deck.transform_shapes',
		title: 'Bulk edit: colorMap / colorTransform / patch across the whole deck',
		description: 'Generic deck-wide transformation. Composable operations (any combination in one call):\n• `colorMap: { "FFAAFF": "00FF00", ... }` — explicit hex find/replace everywhere: shape fill / line / text / color options, raw passthrough XML, preserved raw timing/transition XML, slide backgrounds, AND imported raw XML package parts such as layouts, masters, themes, charts.\n• `colorTransform` — a GENERIC colour-math function applied to EVERY hex found anywhere (no enumeration needed). The one-call "invert mode" / restyle primitive. Values (string): "invertLightness" (true dark↔light — flips HSL lightness, preserves hue/saturation) · "invert" (RGB complement) · "grayscale" · "complement" (hue+180) · "rotateHue:N" (N degrees) · "darken:N" / "lighten:N" / "saturate:N" / "desaturate:N" (N is 0..1). Or object { kind, amount }. colorMap wins for hexes it lists; colorTransform handles the rest.\n• `patch: { ... }` — deep-merge a partial options object into every matching shape (same as update_shape).\nOptional `filter` restricts STRUCTURED-shape scope: { kinds, objectNames, objectNameRegex, slideRange }. Raw package-part recolour is deck-global.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				colorMap: { type: 'object', description: 'Map of {sourceHex: replacementHex}. Case-insensitive on source.' },
				colorTransform: { description: 'Generic colour operation applied to every hex anywhere. String ("invertLightness"|"invert"|"grayscale"|"complement"|"rotateHue:N"|"darken:N"|"lighten:N"|"saturate:N"|"desaturate:N") or { kind, amount }.' },
				patch: { type: 'object', description: 'Optional deep-merge patch applied to every matching shape.' },
				filter: {
					type: 'object',
					properties: {
						kinds: { type: 'array', items: { type: 'string' } },
						objectNames: { type: 'array', items: { type: 'string' } },
						objectNameRegex: { type: 'string' },
						slideRange: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
					},
				},
			},
		},
	},
	{
		name: 'betterpptx.slide.animate_shapes',
		title: 'Apply an animation to multiple shapes on a slide',
		description: 'Apply the same animation (with optional cumulative stagger) to a group of shapes selected by name, index, or kind. On imported slides with preserved raw timing, this replaces that slide timing by default so the new animation serializes; set preserveExistingTiming=true only when intentionally keeping source timing unchanged. Native 3D-model animations apply to a model3d shape: target it with kinds:["model3d"] and set animation.effect to arrive (entrance), turntable | swing | jumpAndTurn (emphasis), or leave (exit). Arrive supports PowerPoint Effect Options: animation.direction right|left|up|down|clockwise|counterclockwise, animation.rotationAxis object|view, and animation.intensity subtle|moderate|strong; legacy animation.direction:"view" still selects view-space right/moderate.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'animation'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				animation: { type: 'object', description: 'AnimationProps to apply.' },
				names: { type: 'array', items: { type: 'string' }, description: 'Only apply to shapes whose objectName is in this list.' },
				kinds: { type: 'array', items: { type: 'string' }, description: 'Only apply to shapes of these kinds (text, image, etc.).' },
				indices: { type: 'array', items: { type: 'number' }, description: 'Only apply to shapes with these indices.' },
				staggerMs: { type: 'number', description: 'Add N ms of cumulative delay between consecutive shapes (0 = no stagger).' },
				preserveExistingTiming: { type: 'boolean', default: false, description: 'Keep imported raw timing XML. When true, newly added generated animations may not serialize because raw timing takes precedence.' },
			},
		},
	},
	{
		name: 'betterpptx.deck.set_transitions_all',
		title: 'Apply a transition to every slide',
		description: 'Set the same transition on all slides, or rotate through a list of `variants` so each slide gets a different transition.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				transition: { type: 'object', description: 'Single TransitionProps to apply to every slide.' },
				variants: { type: 'array', items: { type: 'object' }, description: 'Rotate through this list (slide 0 gets variants[0], slide 1 gets variants[1], …).' },
			},
		},
	},
]

// =============================================================================
//  Metadata alignment (MCP 2025-06-18). One pass gives EVERY tool: clear
//  argument descriptions, a structured `outputSchema`, and behaviour
//  `annotations`. This is what clears ChatGPT's "output format recommended" and
//  "unclear argument" badges, and helps every host pick the right tool and pass
//  valid arguments.
// =============================================================================

// Friendly docs for parameter names that recur across tools.
const PARAM_DOCS = {
	deckId: 'Deck handle returned by deck.new / deck.open_existing / deck.load_template.',
	slideIndex: 'Zero-based index of the target slide within the deck.',
	slideNumbers: 'Optional 1-based slide numbers to import (omit for all).',
	pptxPath: 'Absolute or relative path to a .pptx file on the server.',
	fileName: 'Output file name; ".pptx" is appended if missing.',
	outputDir: 'Directory to write into (defaults to server working dir; ignored in public mode, where files go to the download root).',
	compression: 'Whether to DEFLATE-compress the package (default true).',
	options: 'Options for this element: position/size (x,y,w,h in inches or "NN%"), fill, line, font, and evolved effects (gradient, glow, shadow, wordArt, text3D…).',
	text: 'Text content (a string, or an array of run/paragraph objects).',
	textOptions: 'Additional text options merged into the shape.',
	shapeType: 'Preset shape name (rect, roundRect, ellipse, star5, hexagon, chevron…) or "custGeom".',
	masterName: 'Name of a slide master/layout to base the slide on.',
	sectionTitle: 'Optional PowerPoint section title to begin at this slide.',
	background: 'Slide background: { color } or an image { path }/{ data } or a gradient fill object.',
	transition: 'TransitionProps: { type, speed|duration, direction, option (morph)… }.',
	animation: 'AnimationProps: { type:"entrance"|"exit"|"emphasis", effect, duration, delay, trigger }.',
	names: 'Restrict to shapes whose objectName is in this list.',
	kinds: 'Restrict to shape kinds: text, shape, image, media, passthrough…',
	indices: 'Restrict to shapes at these (list_shapes) indices.',
	colorMap: 'Explicit { sourceHex: replacementHex } recolor map (case-insensitive on source).',
	colorTransform: 'Generic colour op applied to every hex (e.g. "invertLightness", "grayscale", "rotateHue:30").',
	patch: 'Partial options object deep-merged into matching shapes.',
	filter: 'Scope filter: { kinds, objectNames, objectNameRegex, slideRange }.',
	x: 'X position, inches (or a "NN%" string).',
	y: 'Y position, inches (or a "NN%" string).',
	w: 'Width, inches (or a "NN%" string).',
	h: 'Height, inches (or a "NN%" string).',
	url: 'HTTP(S) URL.',
	path: 'Filesystem path.',
	data: 'Inline data (e.g. a base64 data URI).',
	layout: 'Slide-size preset (LAYOUT_WIDE, LAYOUT_4x3…) or a custom-defined layout name.',
	title: 'Title text.',
	staggerMs: 'Milliseconds of cumulative delay added between consecutive shapes (0 = none).',
}

function humanizeParam(name) {
	return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_+/g, ' ').toLowerCase().trim()
}

// Recursively ensure every object-schema property carries a description.
function ensureDescriptions(schema) {
	if (!schema || typeof schema !== 'object') return
	if (schema.properties && typeof schema.properties === 'object') {
		for (const [key, prop] of Object.entries(schema.properties)) {
			if (prop && typeof prop === 'object') {
				if (!prop.description) prop.description = PARAM_DOCS[key] || `The ${humanizeParam(key)}.`
				ensureDescriptions(prop)
			}
		}
	}
	if (schema.items) ensureDescriptions(schema.items)
}

// Standard result envelope (server.mjs sets structuredContent to exactly this).
const ERROR_SCHEMA = { type: 'object', description: 'Error info (present when ok=false).', properties: { message: { type: 'string', description: 'Human-readable error message.' } }, additionalProperties: true }
const RESULT_OUTPUT_SCHEMA = {
	type: 'object',
	description: 'Standard BetterPPTX result envelope.',
	properties: {
		ok: { type: 'boolean', description: 'True on success; false if the call failed.' },
		data: { type: 'object', description: 'Tool-specific result payload (present when ok=true).', additionalProperties: true },
		error: ERROR_SCHEMA,
	},
	required: ['ok'],
	additionalProperties: true,
}

// High-value tools document their key data fields so the model can chain calls.
const SPECIFIC_DATA = {
	'betterpptx.auth.status': { plan: { type: 'string', description: 'Current plan: free, premium, or credits.' }, authenticated: { type: 'boolean', description: 'Whether the current MCP session has an activated entitlement.' } },
	'betterpptx.auth.activate_key': { activated: { type: 'boolean', description: 'True when the key was accepted.' }, plan: { type: 'string', description: 'Activated plan or credit status.' }, credits: { type: 'number', description: 'Credits activated when the key represents a credit pack.' } },
	'betterpptx.billing.explain_plan': { billingModel: { type: 'string', description: 'Freemium billing model summary.' }, upgradeUrl: { type: 'string', description: 'URL the AI can give the user for upgrading.' } },
	'betterpptx.billing.portal': { portalUrl: { type: 'string', description: 'Customer portal URL when configured.' }, checkoutUrl: { type: 'string', description: 'Checkout URL when configured.' }, activationTool: { type: 'string', description: 'Tool to call after the user provides a key.' } },
	'betterpptx.billing.estimate': { estimatedCredits: { type: 'number', description: 'Estimated BetterPPTX credits for the requested operation.' }, billingCategory: { type: 'string', description: 'free, draft-accrual, checkpoint, or heavy.' }, confirmationRequired: { type: 'boolean', description: 'Whether explicit billing confirmation should be requested before running the operation.' } },
	'betterpptx.billing.usage_summary': { balance: { type: 'object', description: 'Public-safe credit balance and pending/queued credits.' }, urls: { type: 'object', description: 'Public checkout, top-up, pricing, and portal URLs where available.' }, recentUsage: { type: 'object', description: 'Public-safe recent usage summary.' } },
	'betterpptx.deck.new': { deckId: { type: 'string', description: 'Handle to pass to subsequent slide.* / deck.* calls.' } },
	'betterpptx.deck.open_existing': { deckId: { type: 'string', description: 'Deck handle for the imported presentation.' }, slideCount: { type: 'number', description: 'Number of slides imported.' }, shapeCount: { type: 'number', description: 'Total shapes imported.' } },
	'betterpptx.deck.open_uploaded': { deckId: { type: 'string', description: 'Deck handle for the uploaded presentation.' }, slideCount: { type: 'number', description: 'Number of slides imported.' }, shapeCount: { type: 'number', description: 'Total shapes imported.' } },
	'betterpptx.slide.add': {
		slideIndex: { type: 'number', description: 'Index of the slide just added.' },
		idempotentReplay: { type: 'boolean', description: 'True when this response replays an earlier call with the same idempotency key.' },
	},
	'betterpptx.slide.inspect': { slideIndex: { type: 'number' }, transition: { type: 'object', description: 'Current slide transition, or null.' }, background: { type: 'object', description: 'Current slide background, or null.' }, objectCount: { type: 'number', description: 'Editable objects on this slide.' } },
	'betterpptx.slide.update': { slideIndex: { type: 'number' }, updated: { type: 'array', description: 'Slide-level fields changed.' } },
	'betterpptx.slide.set_transition': { slideIndex: { type: 'number' }, transition: { type: 'object', description: 'Updated transition, or null when cleared.' } },
	'betterpptx.slide.delete_shapes': { slideIndex: { type: 'number' }, deletedCount: { type: 'number', description: 'Number of editable slide objects removed.' }, remainingObjects: { type: 'number', description: 'Editable objects left on the slide.' } },
	'betterpptx.slide.reorder_shape': { slideIndex: { type: 'number' }, fromIndex: { type: 'number' }, toIndex: { type: 'number' }, objectName: { type: 'string' } },
	'betterpptx.slide.update_equation': { slideIndex: { type: 'number' }, objectName: { type: 'string' }, sourceFormat: { type: 'string' }, patchedKeys: { type: 'array', description: 'Equation fields changed.' } },
	'betterpptx.deck.editability_report': { slideCount: { type: 'number' }, objectCount: { type: 'number' }, byTier: { type: 'object', description: 'Object counts by editability tier.' }, byKind: { type: 'object', description: 'Object counts by kind.' } },
	'betterpptx.narration.synthesize': { audio: { type: 'object', description: 'Generated narration audio reference and duration.' }, durationMs: { type: 'number', description: 'Measured WAV duration in milliseconds.' } },
	'betterpptx.slide.add_narration': { slideIndex: { type: 'number' }, advanceAfterTime: { type: 'number', description: 'Slide advance timing in milliseconds.' } },
	'betterpptx.deck.save': {
		filePath: { type: 'string', description: 'Server-side path of the saved .pptx.' },
		bytes: { type: 'number', description: 'File size in bytes.' },
		slideCount: { type: 'number', description: 'Slides in the saved deck.' },
		artifact: { type: 'object', description: 'Delivery status for the saved artifact.' },
		downloadUrl: { type: 'string', description: 'Public HTTPS link to download the file (present when the server runs behind a public base; hand this to the user).' },
		downloadName: { type: 'string', description: 'Suggested download file name.' },
		idempotentReplay: { type: 'boolean', description: 'True when this response replays an earlier call with the same idempotency key.' },
	},
}

const READONLY = /\.(capabilities|version|status|voices|list|summary|inspect|search|inspect_layouts|editability_report|validate|validate_design|validate_narration|list_shapes|inspect_shapes|read_file|read_json|list_dir|find|catalog|recommend|sample_palette|list_xml_groups|polygon_to_custgeom|simplify_path|fetch|explain_plan|portal)$/
const IDEMPOTENT_DECK_MUTATION_TOOLS = new Set([
	'betterpptx.deck.set_show_settings',
	'betterpptx.deck.define_master',
	'betterpptx.deck.define_layout',
	'betterpptx.deck.load_template',
	'betterpptx.deck.audit_layouts',
	'betterpptx.deck.autoplay',
	'betterpptx.deck.sections',
	'betterpptx.deck.set_transitions_all',
	'betterpptx.deck.add_narration',
	'betterpptx.deck.transform_shapes',
	'betterpptx.deck.save',
	'betterpptx.slide.add',
	'betterpptx.slide.update',
	'betterpptx.slide.duplicate',
	'betterpptx.slide.delete',
	'betterpptx.slide.reorder',
	'betterpptx.slide.add_text',
	'betterpptx.slide.add_equation',
	'betterpptx.slide.add_shape',
	'betterpptx.slide.add_smartart',
	'betterpptx.slide.add_image',
	'betterpptx.slide.add_chart',
	'betterpptx.slide.add_table',
	'betterpptx.slide.add_media',
	'betterpptx.slide.add_model3d',
	'betterpptx.slide.add_freeform',
	'betterpptx.slide.add_notes',
	'betterpptx.slide.add_narration',
	'betterpptx.slide.passthrough_xml',
	'betterpptx.slide.update_shape',
	'betterpptx.slide.update_equation',
	'betterpptx.slide.update_table',
	'betterpptx.slide.update_chart',
	'betterpptx.slide.update_smartart',
	'betterpptx.slide.update_media',
	'betterpptx.slide.animate_shapes',
	'betterpptx.slide.set_transition',
	'betterpptx.slide.delete_shapes',
	'betterpptx.slide.reorder_shape',
	'betterpptx.library.import_xml_group',
])
const IDEMPOTENT_SESSION_MUTATION_TOOLS = new Set([
	'betterpptx.auth.activate_key',
	'betterpptx.deck.new',
	'betterpptx.deck.open_existing',
	'betterpptx.deck.open_uploaded',
	'betterpptx.deck.dispose',
	'betterpptx.io.write_file',
	'betterpptx.narration.synthesize',
	'betterpptx.sketchfab.import',
])

for (const t of TOOLS) {
	if (IDEMPOTENT_DECK_MUTATION_TOOLS.has(t.name) && t.inputSchema?.properties?.deckId) {
		t.inputSchema.properties.idempotencyKey ||= {
			type: 'string',
			description: 'Optional client retry key. Repeating this mutating call with the same key and same arguments returns the original result instead of applying the mutation again.',
		}
	}
	if (IDEMPOTENT_SESSION_MUTATION_TOOLS.has(t.name) && t.inputSchema?.properties) {
		t.inputSchema.properties.idempotencyKey ||= {
			type: 'string',
			description: 'Optional client retry key. Repeating this call in the same MCP session with the same key and same arguments returns the original result instead of creating another artifact or deck.',
		}
	}
	ensureDescriptions(t.inputSchema)
	if (!t.outputSchema) {
		t.outputSchema = SPECIFIC_DATA[t.name]
			? { type: 'object', description: 'BetterPPTX result envelope.', properties: { ok: { type: 'boolean', description: 'True on success.' }, data: { type: 'object', description: 'Result payload.', properties: SPECIFIC_DATA[t.name], additionalProperties: true }, error: ERROR_SCHEMA }, required: ['ok'], additionalProperties: true }
			: RESULT_OUTPUT_SCHEMA
	}
	if (!t.annotations) t.annotations = { title: t.title || t.name, readOnlyHint: READONLY.test(t.name), destructiveHint: false }
}

export const TOOL_NAMES = TOOLS.map(t => t.name)
