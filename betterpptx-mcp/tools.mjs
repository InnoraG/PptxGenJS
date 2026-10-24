import {MOTION_WINDOW_REQUIREMENTS_SCHEMA} from './motion-source-movement-timeline.mjs'
import {MOTION_COMPARISON_PREPARATION_TARGET_SCHEMA} from './motion-comparison-readiness.mjs'
// BetterPPTX tool catalog
// MCP tool definitions for a self-contained PPTX generation and editing engine.
// The AI client does not need to call any external PPTX authoring library.

import { SHAPE_FORMATTING_SCHEMA, SHAPE_PRESET_GEOMETRIES } from './native-formatting-contract.mjs'
import { MOTION_REQUIREMENTS_SCHEMA } from './motion-catalog-requirements.mjs'
import {
	IMAGE_ASSET_SOURCE_SCHEMA,
	IMAGE_FRAMING_SCHEMA,
	MEDIA_COMMAND_TIMING_SCHEMA,
	MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS,
	NARRATION_PROVIDER_SCHEMA,
	PICTURE_ADJUNCTS_SCHEMA,
} from './media-image-formatting-contract.mjs'
import { CONNECTOR_STYLE_LINE_SCHEMA, CONNECTOR_STYLE_SELECTOR_SCHEMA } from './connector-style-contract.mjs'
import { CONNECTOR_EFFECT_PROPERTIES } from './connector-effects-contract.mjs'
import { TEXT_FILL_PUBLIC_SCHEMA, TEXT_FILL_PATCH_SCHEMA } from './text-fill-contract.mjs'
import { ADD_IMAGE_AUTHORING_CORE_SCHEMA } from './layout-image-entry-contract.mjs'
import { LAYOUT_PLACEHOLDER_DEFINITION_SCHEMA } from './layout-placeholder-variants-contract.mjs'
import { ADD_MEDIA_AUTHORING_CORE_SCHEMA, UPDATE_MEDIA_OPTIONS_PATCH_SCHEMA } from './layout-media-entry-contract.mjs'
import { HYPERLINK_PUBLIC_SCHEMA } from './hyperlink-entry-contract.mjs'
import { MULTIPLE_SLIDE_MASTERS_PUBLIC_SCHEMA } from './multiple-slide-masters-contract.mjs'
import {
	CHART_DATA_PUBLIC_SCHEMA,
	CHART_MULTI_PUBLIC_SCHEMA,
	CHART_SEMANTIC_TYPES,
	DIRECT_CHART_OPTIONS_PUBLIC_SCHEMA,
} from './chart-authoring-family-contract.mjs'
import {
	DIRECT_TABLE_ADD_PUBLIC_SCHEMA,
	DIRECT_TABLE_UPDATE_PUBLIC_SCHEMA,
} from './table-authoring-family-contract.mjs'
import { STRUCTURAL_CONNECTOR_SCHEMA, STRUCTURAL_GEOMETRY_SCHEMA, STRUCTURAL_GROUP_SCHEMA, STRUCTURAL_GROUP_CHILD_SCHEMA, STRUCTURAL_POINT_SCHEMA, STRUCTURAL_LINE_CARRIER_SCHEMA } from './structural-authoring-family-contract.mjs'
import { SMARTART_OPTIONS_PUBLIC_SCHEMA, SMARTART_NODE_PUBLIC_SCHEMA } from './smartart-authoring-family-contract.mjs'
import { EQUATION_SOURCE_FORMATS, EQUATION_DISPLAY_MODES, EQUATION_PUBLIC_SCHEMA } from './equation-authoring-family-contract.mjs'
import { SMARTART_CATALOG_INPUT_SCHEMA, SMARTART_CATALOG_DATA_SCHEMA } from './smartart-catalog-contract.mjs'
import { MODEL3D_OPTIONS_PUBLIC_SCHEMA } from './model3d-authoring-family-contract.mjs'
import { STATIC_POSE_PUBLIC_SCHEMA } from './presenter-static-pose-contract.mjs'
import { PRESENTER_PERFORMANCE_SCHEMA } from './presenter-performance-contract.mjs'
import { SLIDE_CONTINUITIES_PUBLIC_SCHEMA, SLIDE_CONTINUITIES_READBACK_SCHEMA } from './ir/slide-continuity-contract.mjs'
import { MODEL3D_PUBLIC_OPERATION_SCHEMAS } from './model3d-public-operation-contract.mjs'
import { MEDIA_AVATAR_PUBLIC_OPERATION_SCHEMAS } from './media-avatar-public-operation-contract.mjs'
import { premiumQuoteBindingPublicSchema } from './billing/premium-quote-contract.mjs'
import { PUBLIC_CANDIDATE_TOOLS } from './motion-candidate-contract.mjs'
import { MOTION_PREPARATION_TOOLS } from './motion-preparation-contract.mjs'

// The node contract is recursive at runtime. For JSON-Schema consumers that
// embed an item schema (where a fragment-local $ref would resolve against the
// parent document), expose a bounded typed child shape without an unresolved
// reference while the engine performs the full recursive validation.
const SMARTART_NODE_TOOL_SCHEMA = {
	type: ['string', 'object'],
	oneOf: [
		{ type: 'string', minLength: 1, maxLength: 4096 },
		{
			...JSON.parse(JSON.stringify(SMARTART_NODE_PUBLIC_SCHEMA.$defs.node)),
			properties: {
				...JSON.parse(JSON.stringify(SMARTART_NODE_PUBLIC_SCHEMA.$defs.node.properties)),
				children: { type: ['array', 'null'], maxItems: 1000, items: { type: ['string', 'object'] } },
			},
		},
	],
}

const SHAPE_FORMATTING_TOOL_SCHEMA = JSON.parse(JSON.stringify(SHAPE_FORMATTING_SCHEMA))
const GROUP_CHILD_TOOL_SCHEMA = JSON.parse(JSON.stringify(STRUCTURAL_GROUP_CHILD_SCHEMA))
// Source pixels are a separate public coordinate domain. Give every numeric
// leaf an explicit description so the generic metadata pass cannot label it
// as slide inches. Reuse the closed native point vocabulary, narrowing curves
// to the control-coordinate forms supported by pixel conversion.
const PIXEL_FRAME_TOOL_SCHEMA = {
	type: 'object', required: ['x', 'y', 'w', 'h'], additionalProperties: false,
	description: 'Source-pixel rectangle, valid only in visualReference ai-reconstructed-native/pixels mode. Top-level frames use the slide source viewport; native group children use their immediate parent frame. Ordinary objects require positive width and height; a line or connector may have one zero dimension.',
	properties: {
		x: { type: 'number', description: 'Left offset in source pixels, never slide units or a percentage.' },
		y: { type: 'number', description: 'Top offset in source pixels, never slide units or a percentage.' },
		w: { type: 'number', minimum: 0, description: 'Width in source pixels.' },
		h: { type: 'number', minimum: 0, description: 'Height in source pixels.' },
	},
	anyOf: [{ properties: { w: { exclusiveMinimum: 0, description: 'Positive width in source pixels; a line may instead have zero width and positive height.' } } }, { properties: { h: { exclusiveMinimum: 0, description: 'Positive height in source pixels; a line may instead have zero height and positive width.' } } }],
}
const PRESENTER_PIXEL_FRAME_TOOL_SCHEMA = {
	...JSON.parse(JSON.stringify(PIXEL_FRAME_TOOL_SCHEMA)),
	description: 'Exact native presenter viewport in source pixels, valid only in visualReference ai-reconstructed-native/pixels mode. Deck placement uses visualReference.viewport; a slide override uses slides[].pixelViewport when supplied, otherwise the root viewport. The slide frame overrides the deck frame. This is not the visible body silhouette and does not change the approved safe idle opening pose, materials, motion cadence, camera, or playback time offset.',
	properties: {
		...JSON.parse(JSON.stringify(PIXEL_FRAME_TOOL_SCHEMA.properties)),
		w: { type: 'number', exclusiveMinimum: 0, description: 'Native presenter viewport width in source pixels; must be positive.' },
		h: { type: 'number', exclusiveMinimum: 0, description: 'Native presenter viewport height in source pixels; must be positive.' },
	},
}
const PIXEL_POINT_TOOL_SCHEMA = {
	...JSON.parse(JSON.stringify(STRUCTURAL_POINT_SCHEMA)),
	description: 'One native vector command local to the required pixelFrame. Use x/y for a line endpoint, moveTo:true for a new subpath, close:true to close it, or curve for a cubic/quadratic endpoint. Endpoint and control coordinates are source pixels; they are not global slide positions.',
	anyOf: [{ required: ['x', 'y'] }, { required: ['close'], properties: { close: { const: true } } }],
	properties: {
		x: { type: 'number', description: 'Endpoint X in source pixels local to this object pixelFrame.' },
		y: { type: 'number', description: 'Endpoint Y in source pixels local to this object pixelFrame.' },
		moveTo: { type: 'boolean', description: 'Start a new subpath at x/y without drawing a segment; use true on the first point of each path.' },
		close: { type: 'boolean', description: 'With true, close the current subpath back to its start; x/y are unnecessary.' },
		curve: {
			type: 'object', additionalProperties: false, required: ['type', 'x1', 'y1'],
			description: 'Native cubic or quadratic curve ending at the parent command x/y. All control coordinates are local source pixels. Pixel arc radii are not supported by this route.',
			properties: {
				type: { type: 'string', enum: ['cubic', 'quadratic'], description: 'Cubic uses two control points; quadratic uses one.' },
				x1: { type: 'number', description: 'First control-point X in local source pixels.' },
				y1: { type: 'number', description: 'First control-point Y in local source pixels.' },
				x2: { type: 'number', description: 'Second cubic control-point X in local source pixels.' },
				y2: { type: 'number', description: 'Second cubic control-point Y in local source pixels.' },
			},
			oneOf: [
				{ properties: { type: { const: 'cubic' } }, required: ['x2', 'y2'] },
				{ properties: { type: { const: 'quadratic' } }, not: { anyOf: [{ required: ['x2'] }, { required: ['y2'] }] } },
			],
		},
	},
}
const PIXEL_POINTS_TOOL_SCHEMA = {
	type: 'array', minItems: 1, maxItems: 10000, items: PIXEL_POINT_TOOL_SCHEMA,
	description: 'Ordered native path commands local to this object pixelFrame, in source pixels. Requires pixelFrame and explicit visualReference ai-reconstructed-native/pixels mode. Use pixelPoints for one command sequence or pixelPaths for multiple sequences.',
}
const PIXEL_PATHS_TOOL_SCHEMA = {
	type: 'array', minItems: 1, maxItems: 256,
	items: { type: 'array', minItems: 1, maxItems: 10000, items: PIXEL_POINT_TOOL_SCHEMA },
	description: 'Multiple native path command sequences sharing the object pixelFrame. Each endpoint and control point is local source pixels, not a slide-global position. Start each sequence with moveTo:true and explicitly close closed contours. Requires the visualReference pixel route.',
}
const PIXEL_GEOMETRY_FRAME_GUARD = {
	if: { anyOf: [{ required: ['pixelPoints'] }, { required: ['pixelPaths'] }] },
	then: { required: ['pixelFrame'] },
}
// Reuse the runtime's closed group-child vocabulary in the caller-facing
// schema. A permissive fragment previously accepted rect/options/fontSize at
// child root even though the compiler rejected them after a costly dry run.
const PUBLIC_GROUP_CHILD_TOOL_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	allOf: [PIXEL_GEOMETRY_FRAME_GUARD, STRUCTURAL_LINE_CARRIER_SCHEMA],
	properties: {
		...GROUP_CHILD_TOOL_SCHEMA.properties,
		pixelFrame: PIXEL_FRAME_TOOL_SCHEMA,
		pixelPoints: PIXEL_POINTS_TOOL_SCHEMA,
		pixelPaths: PIXEL_PATHS_TOOL_SCHEMA,
	},
}
const POWERPOINT_NICETY_TOOL_SCHEMA = {
	type: 'object',
	description: 'One explicit AI-selected native PowerPoint enhancement. Target a slide, then append a native block, replace a named htmlSketch, add a transition, or record an exact catalog selection. This is an authoring overlay, not an automatic decoration system.',
	additionalProperties: true,
	properties: {
		slideId: { type: 'string', minLength: 1, description: 'Preferred stable target slide id.' },
		slideIndex: { type: 'integer', minimum: 0, description: 'Zero-based target used only when no stable slideId is available.' },
		htmlWorld: { type: 'string', description: 'Optional HTML-conversion world target.' },
		replaceSketch: { type: 'string', description: 'Name of an htmlSketch placeholder to replace with the native object.' },
		kind: { type: 'string', description: 'Native object kind, including chart-panel, table-panel, animated-table, smartart, equation, model3d, media, ink, laser, shape, group, customGeometry, textBox, or image. animated-table is an explicit editable native-composite with independently targetable row and cell shapes.' },
		name: { type: 'string', minLength: 1, description: 'Stable native object name.' },
		block: { type: 'object', description: 'Complete native content block. Its kind/name override may be supplied here or on the nicety itself.', additionalProperties: true },
		pixelFrame: PIXEL_FRAME_TOOL_SCHEMA,
		pixelPoints: PIXEL_POINTS_TOOL_SCHEMA,
		pixelPaths: PIXEL_PATHS_TOOL_SCHEMA,
		rect: {
			type: 'object', required: ['x', 'y', 'w', 'h'], additionalProperties: false,
			description: 'Exact slide-inch rectangle when authoringContract.geometryAuthority=ai and placementPolicy=ai-authored-geometry-v1.',
			properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number', exclusiveMinimum: 0 }, h: { type: 'number', exclusiveMinimum: 0 } },
		},
		region: { type: 'string', description: 'Optional semantic role label for readback and validation. It never delegates or changes the AI-authored rectangle.' },
		transition: { type: 'object', description: 'Native transition merged onto the target slide.', additionalProperties: true },
		selection: { type: 'object', description: 'Exact selection-manifest entry for this enhancement.', additionalProperties: true },
		chartPresetId: { type: 'string', description: 'Convenience selector for a native chart replacement.' },
		coherenceReason: { type: 'string', description: 'Why this enhancement serves the presentation rather than decorating it.' },
	},
	anyOf: [{ required: ['slideId'] }, { required: ['slideIndex'] }, { required: ['htmlWorld'] }],
}
const PRESENTER_PIXEL_MODE_GUARD = {
	if: {
		required: ['visualReference'],
		properties: { visualReference: { type: 'object', required: ['mode', 'coordinateMode'], properties: { mode: { const: 'ai-reconstructed-native' }, coordinateMode: { const: 'pixels' } } } },
	},
	else: {
		properties: {
			presenter: { not: { required: ['pixelFrame'] } },
			slides: { items: { properties: { presenter: { not: { required: ['pixelFrame'] } } } } },
		},
	},
}
const IMAGE_FRAMING_TOOL_SCHEMA = JSON.parse(JSON.stringify(IMAGE_FRAMING_SCHEMA))
const IMAGE_EXACT_LEAF_TOOL_PROPERTIES = Object.freeze({
	altText: JSON.parse(JSON.stringify(MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS.pictureAltText.publicSchema)),
	rotate: JSON.parse(JSON.stringify(MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS.pictureRotation.publicSchema)),
	flipH: JSON.parse(JSON.stringify(MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS.pictureFlipHorizontal.publicSchema)),
	flipV: JSON.parse(JSON.stringify(MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS.pictureFlipVertical.publicSchema)),
	shadow: JSON.parse(JSON.stringify(MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS.pictureShadow.publicSchema)),
	transparency: JSON.parse(JSON.stringify(MEDIA_IMAGE_RESIDUAL_EXACT_CONTRACTS.pictureTransparency.publicSchema)),
})
const CONNECTOR_STYLE_SELECTOR_TOOL_SCHEMA = JSON.parse(JSON.stringify(CONNECTOR_STYLE_SELECTOR_SCHEMA))
const CONNECTOR_STYLE_LINE_TOOL_SCHEMA = JSON.parse(JSON.stringify(CONNECTOR_STYLE_LINE_SCHEMA))
const CONNECTOR_OPTION_TOOL_PROPERTIES = Object.freeze({
	connectorStylePresetId: CONNECTOR_STYLE_SELECTOR_TOOL_SCHEMA,
	connectorType: { type: 'string', enum: ['straightConnector1', 'elbowConnector2', 'elbowConnector3', 'elbowConnector4', 'curvedConnector2', 'curvedConnector3', 'curvedConnector4'] },
	x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' },
	startShapeId: { type: 'number' }, startConnectionIndex: { type: 'number' },
	endShapeId: { type: 'number' }, endConnectionIndex: { type: 'number' },
	line: CONNECTOR_STYLE_LINE_TOOL_SCHEMA,
	hyperlink: JSON.parse(JSON.stringify(HYPERLINK_PUBLIC_SCHEMA)),
	objectName: { type: 'string' },
	altText: { type: 'string', maxLength: 4096 },
	...JSON.parse(JSON.stringify(CONNECTOR_EFFECT_PROPERTIES)),
	animation: { type: ['object', 'array'] },
})

const PUBLIC_BLACK_BOX_SCHEMA = process.env.BETTERPPTX_PUBLIC_BLACK_BOX === '1'

const MODEL3D_GENERATE_KINDS = [
	'auto',
	'aircraft',
	'ship',
	'building',
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
		context: { type: 'string', description: 'Narrative context or voiceover line used to select or import a presentation-ready 3D model. The catalog is searched first.' },
		prompt: { type: 'string', description: 'Alias for context.' },
		narration: { type: 'string', description: 'Alias for context.' },
		query: { type: 'string', description: 'Optional explicit object search text. Combined with context for catalog and Sketchfab selection.' },
		kind: { type: 'string', enum: MODEL3D_GENERATE_KINDS, default: 'auto' },
		generationMode: { type: 'string', enum: ['auto', 'catalog', 'import'], default: 'auto', description: 'Compatibility hint. This tool only selects catalog assets or imports compatible external models; it does not synthesize new model geometry.' },
		assetSource: { type: 'string', enum: ['auto', 'catalog', 'sketchfab'], default: 'auto', description: 'Preferred source. auto searches assets.catalog first, then attempts a Sketchfab CC0/CC-BY import.' },
		qualityTarget: { type: 'string', enum: ['slides', 'premium', 'hero'], default: 'slides', description: 'Selection target. premium/hero prefer stronger semantic fit and reasonable size.' },
		sizePolicy: { type: 'string', enum: ['compact', 'standard', 'balanced', 'large-ok', 'unrestricted'], default: 'standard', description: 'GLB size policy for catalog and Sketchfab candidates.' },
		maxModelSizeMb: { type: 'number', description: 'Optional explicit GLB/archive size ceiling in MiB. Overrides sizePolicy.' },
		searchLimit: { type: 'number', default: 12, description: 'Maximum Sketchfab candidates considered when catalog has no strong match.' },
		licensePolicy: { type: 'string', enum: ['commercial-safe', 'cc0-only'], default: 'commercial-safe', description: 'Rights filter for import fallback. commercial-safe is restricted to CC0 and CC Attribution.' },
		allowedLicenseSlugs: { type: 'array', items: { type: 'string' }, description: 'Optional explicit import licenses. Defaults to ["cc0","by"].' },
		optimizeFor: { type: 'string', enum: ['slides', 'navigation', 'quality'], default: 'slides', description: 'Suggested slide-use profile for returned sizing, camera, and animation options.' },
		pose: { type: 'string', enum: ['front', 'threeQuarterRight', 'threeQuarterLeft', 'sideRight', 'sideLeft', 'topDown', 'heroTilt', 'dramatic'], default: 'heroTilt', description: 'Suggested view/pose for the returned model options.' },
		nativeOnly: { type: 'boolean', default: true, description: 'When true, returns a native 3D model reference only. Catalog/import selection does not synthesize poster fallbacks.' },
		w: { type: 'number', description: 'Suggested model width in inches.' },
		h: { type: 'number', description: 'Suggested model height in inches.' },
	},
}

const CUSTOM_GEOMETRY_OPTIONS_DESCRIPTION = 'Optional ShapeProps-style override bag. Supports the same visual/editable options as native shapes, including fill, line, effects, 3D options, flips, transparency, hyperlinks, animation, objectName, and optional replacement points; x/y/w/h rescale the stored path into the requested box when points are not supplied.'

const CUSTOM_GEOMETRY_EDITABLE_PROPS = {
	options: { type: 'object', description: CUSTOM_GEOMETRY_OPTIONS_DESCRIPTION },
	x: { type: 'number', description: 'Left position in inches. Overrides the stored default.' },
	y: { type: 'number', description: 'Top position in inches. Overrides the stored default.' },
	w: { type: 'number', description: 'Width in inches. Rescales the stored geometry path.' },
	h: { type: 'number', description: 'Height in inches. Rescales the stored geometry path.' },
	points: { type: 'array', description: 'Optional replacement custom-geometry point payload. Omit this to use the stored library path, automatically scaled by w/h.' },
	fill: { type: 'object', description: 'ShapeFillProps override.' },
	line: { type: 'object', description: 'ShapeLineProps override.' },
	shadow: { type: 'object', description: 'Shadow override.' },
	glow: { type: 'object', description: 'Glow effect override.' },
	reflection: { type: 'object', description: 'Reflection effect override.' },
	softEdges: { type: 'object', description: 'Soft-edge effect override.' },
	effect3D: { type: 'object', description: 'Shape 3D effect options override.' },
	flipH: { type: 'boolean', description: 'Flip horizontally.' },
	flipV: { type: 'boolean', description: 'Flip vertically.' },
	transparency: { type: 'number', description: 'Overall shape transparency when supported by the underlying shape options.' },
	hyperlink: { type: 'object', description: 'Hyperlink options.' },
	rotate: { type: 'number', description: 'Clockwise rotation in degrees.' },
	animation: { description: 'AnimationProps or array of AnimationProps.' },
	objectName: { type: 'string', description: 'Editable object name assigned to the inserted shape.' },
}

const SVG_CUSTOM_GEOMETRY_SOURCE_PROPS = {
	svg: { type: 'string', description: 'Inline SVG markup. Supported drawable elements include path, polygon, polyline, rect, circle, ellipse, and line.' },
	svgText: { type: 'string', description: 'Alias for svg.' },
	markup: { type: 'string', description: 'Alias for svg.' },
	dataUri: { type: 'string', description: 'data:image/svg+xml URI containing SVG markup.' },
	pathData: { type: 'string', description: 'Raw SVG path d attribute. Use this for one path without wrapping it in an SVG element.' },
	d: { type: 'string', description: 'Alias for pathData.' },
	w: { type: 'number', default: 1, description: 'Target custom-geometry width in inches.' },
	h: { type: 'number', description: 'Target custom-geometry height in inches. Defaults to the source aspect ratio when omitted.' },
	fit: { type: 'string', enum: ['preserve-aspect', 'stretch'], default: 'preserve-aspect', description: 'preserve-aspect keeps the source ratio inside w/h; stretch fills the requested box exactly.' },
	precision: { type: 'number', default: 4, description: 'Decimal precision used after transform and scaling normalization.' },
}

const SVG_CUSTOM_GEOMETRY_COMPILE_PROPS = {
	...SVG_CUSTOM_GEOMETRY_SOURCE_PROPS,
	x: { type: 'number', default: 0, description: 'Suggested left position in inches for the returned add_freeform arguments.' },
	y: { type: 'number', default: 0, description: 'Suggested top position in inches for the returned add_freeform arguments.' },
	includePoints: { type: 'boolean', default: true, description: 'When false, omit the point payload and return counts plus ready sizing metadata only.' },
}

export const TOOLS = [
	...PUBLIC_CANDIDATE_TOOLS,
	...MOTION_PREPARATION_TOOLS,
	{
		name: 'betterpptx.help.capabilities',
		title: 'List BetterPPTX capabilities',
		description: 'Read-only discovery for a BetterPPTX presentation brief. Return a compact capability map and task-relevant learning paths for AI-authored exact composition, editable typography and data, native gradients and shadows, picture framing, slide transitions, layered object animation, narration, and specialist 3D/identity media when relevant. Report availability, limitations, and valid follow-up calls; do not select a design or start a deck or asset job.',
		inputSchema: {
			type: 'object',
			properties: {
				intent: { type: 'string', maxLength: 512, description: 'A brief presentation intent, including desired visual design, pictures, gradients, shadows, transitions, animation, or explicit exclusions; for example "premium product reveal with pictures and purposeful motion, no narration".' },
				deckType: { type: 'string', enum: ['auto', 'new', 'uploaded', 'existing'], default: 'auto', description: 'Whether the task starts from a new deck or uploaded PPTX bytes. existing is treated as uploaded on public endpoints.' },
				detail: { type: 'string', enum: ['summary', 'plan', 'full'], default: 'summary', description: 'summary returns compact guidance; plan adds an explicit call sequence; full may include broader capability notes.' },
			},
		},
	},
	{
		name: 'betterpptx.help.workflow',
		title: 'Plan a public tool workflow',
		description: 'Return a compact, phased public workflow for a new or uploaded presentation. It references the capability authority contract instead of duplicating it, then routes the AI through story, medium, AI-owned exact composition, relevant control lessons, deterministic production validation, optional visual qualification, and first save. This public workflow is usable without a host-provided slide skill.',
		inputSchema: {
			type: 'object',
			properties: {
				intent: { type: 'string', maxLength: 512, description: 'User-facing presentation task or workflow goal.' },
				deckType: { type: 'string', enum: ['auto', 'new', 'uploaded', 'existing'], default: 'auto' },
				features: { type: 'array', items: { type: 'string' }, description: 'Optional requested capability areas such as theme/designSystem, narration, timing, charts, tables, 3d, customGeometry, ink, laser, accessibility, quality.' },
				profile: { type: 'string', enum: ['modern', 'narrated', 'static'], default: 'modern', description: 'Quality profile used for validation guidance.' },
				detail: { type: 'string', enum: ['summary', 'full'], default: 'summary' },
			},
		},
	},
	{
		name: 'betterpptx.help.tool_recipe',
		title: 'Explain how to compose public tools',
		description: 'Return functional recipes for a capability area, expressed only as public BetterPPTX tool calls, sequencing, required object naming, validation checks, and safe fallbacks. This does not return private implementation details or predefined deck content.',
		inputSchema: {
			type: 'object',
			properties: {
				surface: { type: 'string', description: 'Capability area: theme/designSystem, narration, timing, animation, chart, table, animated-table/progressive-table, 3d, customGeometry, ink, laser, media, visualReference, htmlConversion, accessibility, quality, uploaded, or full. visualReference is the principal AI reconstruction route. html/htmlConversion selects the separate optional automatic conversion route.' },
				intent: { type: 'string', maxLength: 512, description: 'Optional user-facing task used to rank relevant recipes.' },
				profile: { type: 'string', enum: ['modern', 'narrated', 'static'], default: 'modern' },
				detail: { type: 'string', enum: ['summary', 'full'], default: 'summary' },
				schemaFor: { type: 'string', maxLength: 128, description: 'Exact public tool name whose complete schema to return instead of a recipe, e.g. betterpptx.deck.generate_from_spec. tools/list advertises nested fields in summarized form.' },
				schemaPath: { type: 'string', maxLength: 256, description: 'Optional dotted field path inside schemaFor, e.g. spec.slides.content or spec.theme. Array items are traversed implicitly; the response lists childFields for the next request.' },
				schemaKind: { type: 'string', enum: ['input', 'output'], default: 'input', description: 'Which schema of schemaFor to return.' },
			},
		},
	},
	{
		name: 'betterpptx.options.catalog',
		title: 'List canonical presentation options',
		description: 'Return token-friendly canonical option values, capabilityMode truth, component ownership, supported overrides, reset status, safe aliases, and correction guidance. Some gallery families remain preset-only or partially structured. Picture Styles are exact structured preset-plus-parameter recipes exposing geometry, fill, border, effects, and 3-D controls; Picture adjustments expose native corrections, color controls, and every persistent Artistic Effects slider. Combinations use effectLst; effectDag is preserve-only and not a public authoring surface.',
		inputSchema: {
			type: 'object',
			properties: {
				surface: {
					type: 'string',
					description: 'Optional filter such as shadow, glow, blur, fill, pattern, texture, background, imageAdjustments, artisticEffect, effects, atmosphere, wordArt, gradient, text3D, chart, table, smartArt, or a field path like options.wordArt.transform.',
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
		name: 'betterpptx.authoring.capabilities',
		title: 'Resolve Authoring Excellence capabilities',
		description: 'Return the registry-backed public authoring capability contract, including identity, implementation status, public exposure, editability, controls, carriers, requirements, limits, evidence, readiness, recovery, and executable examples. AI-owned exact composition is the default; Director assistance is optional. The engine owns rules, safety, serialization, and explicit fail-closed corrections.',
		inputSchema: {
			type: 'object',
			properties: {
				family: { type: 'string', description: 'Optional family such as charts, smartart, tables, wordart, shapes, layouts, media, model3d, equations, structural, motion, or presenter-motion. Omit to list all.' },
				intent: { type: 'string', maxLength: 512, description: 'Optional semantic intent used to explain the relevant decision boundary.' },
				mode: { type: 'string', description: 'Optional native or explicit fallback mode. Unknown modes fail closed with a correction.' },
			},
		},
	},
	{
		name: 'betterpptx.authoring.catalog',
		title: 'Discover authoring controls and lessons',
		description: 'Return the canonical paginated catalog, individual-control contracts, or an immediately usable teaching lesson. Use view:"controls" with ordinary-language intent for relevant controls and transparent exclusions; use view:"lesson" with lessonId for a complete public-contract example. Omit filters for the unranked catalog. Every executable advertisement remains bound to its schema and readiness evidence.',
		inputSchema: {
			type: 'object',
			properties: {
				motionRequirements: MOTION_REQUIREMENTS_SCHEMA,
				preparationTarget: MOTION_COMPARISON_PREPARATION_TARGET_SCHEMA,
				motionWindowRequirements: MOTION_WINDOW_REQUIREMENTS_SCHEMA,
				view: { type: 'string', enum: ['catalog', 'controls', 'lesson', 'motion-comparisons'], default: 'catalog', description: 'Catalog rows, enriched individual controls, one teaching lesson, or compact motion comparison cards with exact full-evidence routes.' },
				family: { type: 'string', description: 'Optional semantic family filter, such as charts, tables, smartart, shapes-gradients, media-images-avatar, model3d, equations, structural, motion-transitions-morph, or presenter-motion.' },
				surface: { type: 'string', description: 'Alias for family.' },
				intent: { type: 'string', maxLength: 512, description: 'Ordinary-language task intent such as design niceties, premium polish, dimensional headline, impressive readable screenshot, animate a process, animated table, presenter table, or more than fade. Explicit exclusions are preserved.' },
				controlId: { type: 'string', description: 'Direct opaque control ID lookup from a previous page.' },
				lessonId: { type: 'string', description: 'Direct lesson lookup, such as dimensional-typography, picture-treatment, layered-motion, custom-process, chart-emphasis, connected-object-identity, animated-table-synergy, or restrained-flat.' },
				query: { type: 'string', description: 'Optional literal token search across family, label, description, tags, exact JSON paths, aliases, and selection facts. Use intent for semantic routing and scoped exclusions; a literal miss returns a schema-valid intent recovery call.' },
				q: { type: 'string', description: 'Alias for query.' },
				includePlanned: { type: 'boolean', default: false, description: 'When true, include planned-but-not-implemented ledger entries for roadmap awareness. Product MVP entries are returned by default.' },
				offset: { type: 'integer', minimum: 0, default: 0, description: 'Zero-based pagination offset.' },
				limit: { type: 'integer', minimum: 1, maximum: 500, default: 12, description: 'Maximum entries to return. Pagination always reports totals and continuation.' },
			},
		},
	},
	{
		name: 'betterpptx.auth.status',
		title: 'Report SaaS plan and activation status',
		description: 'Return current authorization plus the canonical workflow-stage matrix and secured rolling publication allowance. Eligible identities can publish up to the currently reported number of complete downloadable PPTX files without a customer charge; provider-backed media allowances and paid overage remain separate. Call this before media preparation or final publication.',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'betterpptx.auth.get_profile',
		title: 'Get the signed-in BetterPPTX profile',
		description: 'Return the stable opaque profile identifier for the currently authenticated BetterPPTX account. This standard profile tool contains no presentation content and never exposes the underlying identity-provider subject.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		outputSchema: {
			$schema: 'https://json-schema.org/draft/2020-12/schema',
			type: 'object',
			properties: {
				id: { type: 'string', minLength: 1, pattern: '\\S', description: 'Stable opaque BetterPPTX profile identifier.' },
				name: { type: 'string', minLength: 1, pattern: '\\S', description: 'Optional display name.' },
				email: { type: 'string', format: 'email', description: 'Optional verified email address.' },
				nickname: { type: 'string', minLength: 1, pattern: '\\S', description: 'Optional nickname.' },
			},
			required: ['id'],
			additionalProperties: false,
		},
		protocolRawOutput: true,
		annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		_meta: { 'openai/profile': true },
	},
	{
		name: 'betterpptx.auth.activate_key',
		title: 'Activate a Polar or PayRam payment key',
		description: 'Validate and activate a user-provided Polar (subscription) or PayRam (crypto credits) key for this MCP session. Use this when the user pastes a premium key in chat after checkout.',
		inputSchema: {
			type: 'object',
			required: ['key'],
			properties: {
				key: { type: 'string', description: 'Activation or credit key returned by checkout.' },
				provider: { type: 'string', enum: ['auto', 'polar', 'payram'], default: 'auto', description: 'Payment provider hint. Use auto unless the key source is known.' },
			},
		},
	},
	{
		name: 'betterpptx.billing.explain_plan',
		title: 'Explain free, premium, and credit plans',
		description: 'Return plan details and the canonical per-stage authorization boundary for learning, planning, draft commit, source export, package audit, media resolution, final save, and recovery. The rolling free allowance includes downloadable delivery; provider and overage boundaries remain explicit.',
		inputSchema: { type: 'object', properties: {} },
	},
	{
		name: 'betterpptx.billing.portal',
		title: 'Get billing or upgrade URL',
		description: 'Return the provider-neutral checkout, pricing, or customer portal URL. Use when a tool returns REQUIRES_UPGRADE, QUOTA_EXCEEDED, or the user asks to manage billing.',
		inputSchema: {
			type: 'object',
			properties: {
				provider: { type: 'string', enum: ['auto', 'polar', 'payram'], default: 'auto', description: 'Payment provider hint for checkout or portal routing.' },
				feature: { type: 'string', description: 'Optional reason that caused the upgrade prompt, such as slide_limit, transition, narration, model3d, or uploaded editing.' },
			},
		},
	},
	{
		name: 'betterpptx.billing.payment_options',
		title: 'List web, app, and agent payment options',
		description: 'Return identity-bound payment recovery for browser wallets, desktop or IDE clients, and autonomous x402 agents. Use this when credits are insufficient or the user asks how payment works on their current surface.',
		inputSchema: { type: 'object', properties: {} },
		annotations: { title: 'List BetterPPTX payment options', readOnlyHint: true, destructiveHint: false },
	},
	{
		name: 'betterpptx.billing.redeem_promo',
		title: 'Redeem a BetterPPTX promo code',
		description: 'Legacy compatibility route for an owner-configured credit-pack promotion. It is disabled when pay-per-job billing is active because promotions must never create a reusable balance; a deployment without a bounded job-sponsorship campaign must report that route as unavailable.',
		inputSchema: {
			type: 'object',
			required: ['promoCode', 'packId'],
			additionalProperties: false,
			properties: {
				promoCode: { type: 'string', minLength: 3, maxLength: 128, description: 'The promo code supplied by the owner or campaign. It is never returned or stored in public results.' },
				packId: { type: 'string', minLength: 1, description: 'Credit pack to which the promo applies, such as starter_500, builder_1500, or studio_5000.' },
				customerEmail: { type: 'string', format: 'email', description: 'Required only when the discounted remainder must be paid through PayRam.' },
				idempotencyKey: { type: 'string', minLength: 8, maxLength: 256, description: 'Stable retry key. Repeating the same redemption does not consume the code twice or create a second PayRam payment.' },
			},
		},
		annotations: { title: 'Redeem BetterPPTX promo code', readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	},
	{
		name: 'betterpptx.operation.status',
		title: 'Check durable operation status',
		description: 'Poll an opaque durable operation id returned by BetterPPTX. Returns owner-scoped state and the completed result. For a saved artifact, this read-only call refreshes its browser download link without another publication or charge. New files and links default to 12 hours; refresh is capped at the original file expiry and never extends retention. If the AI client cannot fetch the download host, use betterpptx.operation.read_file with the same operationId.',
		inputSchema: {
			type: 'object',
			required: ['operationId'],
			properties: {
				operationId: { type: 'string', description: 'Opaque durable operation id returned by OPERATION_PENDING or a durable operation replay.' },
			},
		},
		annotations: { title: 'Check BetterPPTX operation status', readOnlyHint: true, destructiveHint: false },
	},
	{
		name: 'betterpptx.operation.read_file',
		title: 'Read a saved presentation through MCP',
		description: 'Owner-scoped, read-only retrieval of an already-published PPTX. Default mode:"link" returns a browser download URL and file integrity metadata without placing file bytes in the chat context. New files and links default to 12 hours; actual expiries are returned, and late retrieval uses only the remaining file lifetime. mode:"resource" embeds only small files; larger files return the link instead, because a large MCP resource can exhaust a client conversation. mode:"chunk" is for explicit bounded byte retrieval by capable clients. Link renewal never extends artifact retention. No save, charge, or publication is performed.',
		inputSchema: {
			type: 'object', required: ['operationId'], additionalProperties: false,
			properties: {
				operationId: { type: 'string', pattern: '^op_[0-9a-fA-F]{32}$', description: 'Opaque successful save operation id; ownership is checked server-side.' },
				mode: { type: 'string', enum: ['link', 'resource', 'chunk'], default: 'link', description: 'Use link for normal delivery; resource embeds only small files; chunk retrieves bounded bytes.' },
				offset: { type: 'integer', minimum: 0, default: 0, description: 'Byte offset for chunk mode.' },
				maxBytes: { type: 'integer', minimum: 1, maximum: 32768, default: 32768, description: 'Maximum bytes per chunk response.' },
			},
		},
		annotations: { title: 'Read a saved BetterPPTX file', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
	},
	{
		name: 'betterpptx.operation.recent',
		title: 'List recent operations',
		description: 'List recent opaque operationId values from this session so a multi-stage build can recover after an expired deck handle. Pair with betterpptx.deck.recent.',
		inputSchema: { type: 'object', properties: {} },
		annotations: { title: 'List recent BetterPPTX operations', readOnlyHint: true, destructiveHint: false },
	},
	{
		name: 'betterpptx.billing.estimate',
		title: 'Estimate BetterPPTX job cost',
		description: 'Return a read-only cost estimate for the requested BetterPPTX operation. To authorize generate_from_spec commit, estimate toolArgs.phase:"commit" with the exact final spec or specHandle, commitMode, prepared media, and other execution inputs; a quote for phase:"dryRun" cannot authorize commit. Pass the complete issued quoteBinding unchanged to the matching commit. Estimation neither charges nor reserves a publication. In pay-per-job mode internal cost units are not a customer balance or reusable entitlement.',
		inputSchema: {
			type: 'object',
			properties: {
				toolName: { type: 'string', default: 'betterpptx.deck.save', description: 'BetterPPTX tool to estimate, such as betterpptx.deck.save or betterpptx.narration.synthesize.' },
				deckId: { type: 'string', description: 'Optional deck handle for save estimates.' },
				toolArgs: { type: 'object', description: 'Optional public-safe arguments for the tool being estimated.', additionalProperties: true },
			},
		},
		annotations: { title: 'Estimate BetterPPTX job cost', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
	},
	{
		name: 'betterpptx.billing.usage_summary',
		title: 'Summarize BetterPPTX payment status',
		description: 'Return public-safe BetterPPTX payment status. In pay-per-job mode it reports that no reusable product balance is maintained and points to the exact job quotation/payment route; legacy balance fields are migration evidence only.',
		inputSchema: { type: 'object', properties: {} },
		annotations: { title: 'Summarize BetterPPTX payment status', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
	},
	{
		name: 'betterpptx.billing.job_status',
		title: 'Recover BetterPPTX job status',
		description: 'Recover one pay-per-job presentation using the opaque job-bound purchaseContext returned by price-listing. Polling or reconnecting does not charge again. A public transaction hash alone is not accepted as a credential.',
		inputSchema: {
			type: 'object',
			required: ['purchaseContext'],
			properties: {
				jobId: { type: 'string', description: 'Optional job id returned by price-listing; when supplied it must match the protected purchase context.' },
				quoteId: { type: 'string', description: 'Optional quote id returned by price-listing. Keep it unchanged when recovering that job.' },
				purchaseContext: { type: 'string', description: 'Opaque server-issued job recovery credential returned by price-listing. Do not replace it with a transaction hash.' },
			},
		},
		annotations: { title: 'Recover BetterPPTX job status', readOnlyHint: true, destructiveHint: false, idempotentHint: true },
	},
	{
		name: 'price-listing',
		title: 'List purchasable BetterPPTX items',
		description: 'Return the agent-native BetterPPTX payment catalog. In pay-per-job mode it exposes one exact payment for one bounded presentation job with an opaque job-bound purchase context; legacy credit packs appear only when that compatibility model is enabled.',
		protocolRawOutput: true,
		inputSchema: {
			type: 'object',
			properties: {
				searchQuery: { type: 'string', description: 'Optional text used to filter the available BetterPPTX purchasable items.' },
				spec: { type: 'object', description: 'Optional BetterPPTX deck spec to price as one dynamic full premium presentation before make-purchase.' },
				deckId: { type: 'string', description: 'Optional current deck handle to price as one dynamic full premium presentation.' },
				jobId: { type: 'string', description: 'Optional stable bounded-job identifier when resuming a previously prepared pay-per-job quote.' },
				toolName: { type: 'string', description: 'Optional BetterPPTX tool name for deck-handle pricing. Defaults to betterpptx.deck.save.' },
			},
		},
		annotations: { title: 'List purchasable BetterPPTX items', readOnlyHint: true, destructiveHint: false },
	},
	{
		name: 'pricing-listing',
		title: 'List purchasable BetterPPTX items',
		description: 'Compatibility alias for price-listing. It follows the active payment model, including one-payment-per-bounded-job when enabled.',
		protocolRawOutput: true,
		inputSchema: {
			type: 'object',
			properties: {
				searchQuery: { type: 'string', description: 'Optional text used to filter the available BetterPPTX purchasable items.' },
				spec: { type: 'object', description: 'Optional BetterPPTX deck spec to price as one dynamic full premium presentation before make-purchase.' },
				deckId: { type: 'string', description: 'Optional current deck handle to price as one dynamic full premium presentation.' },
				jobId: { type: 'string', description: 'Optional stable bounded-job identifier when resuming a previously prepared pay-per-job quote.' },
				toolName: { type: 'string', description: 'Optional BetterPPTX tool name for deck-handle pricing. Defaults to betterpptx.deck.save.' },
			},
		},
		annotations: { title: 'List purchasable BetterPPTX items', readOnlyHint: true, destructiveHint: false },
	},
	{
		name: 'payment-methods',
		title: 'List supported agent payment methods',
		description: 'Return the one exact USDC payment method enabled for this deployment, including its network, chain, token contract, and treasury. Production and testnet are separate deployments; use only the returned method.',
		protocolRawOutput: true,
		inputSchema: { type: 'object', properties: {} },
		annotations: { title: 'List supported agent payment methods', readOnlyHint: true, destructiveHint: false },
	},
	{
		name: 'make-purchase',
		title: 'Purchase a BetterPPTX item',
		description: 'Settle a signed x402 EIP-3009 USDC authorization and fulfill the item bound to the opaque purchase context. In pay-per-job mode this authorizes exactly one bounded presentation job and returns its result; it does not create a reusable credit balance. Legacy credit-pack behavior is available only in compatibility mode.',
		protocolRawOutput: true,
		inputSchema: {
			type: 'object',
			required: ['itemId', 'params', 'paymentMethod'],
			properties: {
				itemId: { type: 'string', description: 'Purchasable item id returned by price-listing.' },
				params: {
					type: 'object',
					description: 'Purchase parameters containing the opaque purchaseContext returned by price-listing.',
					properties: {
						purchaseContext: { type: 'string', description: 'Opaque server-issued purchase context bound to the installation or exact bounded job, depending on the active payment model.' },
						quoteId: { type: 'string', description: 'Quote id returned by price-listing; keep it unchanged for the same bounded job.' },
						jobId: { type: 'string', description: 'Job id returned by price-listing in pay-per-job mode.' },
						bindingDigest: { type: 'string', description: 'Opaque digest binding the payment to the exact authored presentation job.' },
						spec: { type: 'object', description: 'The exact authored BetterPPTX spec that was used to obtain the quote.' },
						resume: { type: 'boolean', description: 'Set true only to resume an already-settled bounded job with its same protected purchaseContext; it never authorizes a new payment.' },
					},
					additionalProperties: true,
				},
				signedTransaction: {
					oneOf: [
						{ type: 'string' },
						{ type: 'object', additionalProperties: true },
					],
					description: 'Signed x402 EIP-3009 authorization for first settlement. Omit it only for an already-settled bounded job with params.resume:true and the same protected purchaseContext.',
				},
				paymentMethod: { type: 'string', enum: ['USDC_BASE_MAINNET', 'USDC_BASE_SEPOLIA'], description: 'Use the exact payment method returned by payment-methods for this deployment; Base Sepolia is testnet-only.' },
			},
		},
		annotations: { title: 'Pay for a BetterPPTX job', readOnlyHint: false, destructiveHint: false, idempotentHint: true },
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
		description: 'Return endpoint health and capacity. Public endpoints return black-box service readiness only.',
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
		title: 'Search chart preset catalog',
		description: 'Compatibility alias for an unranked PowerPoint chart catalog search. Returns exact executable ids, native/editable classification, applicability facts, and stable pagination; the AI chooses the chart and style.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Case-insensitive catalog text filter; results remain unranked and id-sorted.' },
				chartIntent: { type: 'string', description: 'Optional catalog search term such as trend, comparison, distribution, funnel, geography, or dashboard; never used for aesthetic scoring.' },
				dataShape: { type: 'string', description: 'Optional factual data-shape filter such as categorical, time-series, x/y, hierarchy, distribution, bridge, or matrix.' },
				category: { type: 'string', description: 'Optional PowerPoint picker category or tag filter.' },
				authoringMode: { type: 'string', enum: ['native', 'native-composite', 'shape-built'] },
				chartType: { type: 'string', description: 'Optional native chart family filter, including bar3D and ChartEx families.' },
				chartPresetId: { type: 'string', description: 'Optional exact preset id.' },
				chartGalleryTilePresetId: { type: 'string', description: 'Optional opaque, chart-type-specific Ribbon tile id.' },
				galleryKind: { type: 'string', enum: ['styles', 'colors', 'layouts'], description: 'Optional Ribbon gallery filter. Omit to return all three type-specific catalogs.' },
				chartStylePresetId: { type: 'string', description: 'Optional semantic Chart Design style preset id.' },
				chartTreatmentPresetId: { type: 'string', description: 'Optional executable chart treatment preset id.' },
				chartTreatmentPresetIds: { type: 'array', items: { type: 'string' }, description: 'Optional ordered executable treatment preset ids.' },
				galleryLimit: { type: 'number', default: 24 },
				styleLimit: { type: 'number', default: 24 },
				treatmentLimit: { type: 'number', default: 24 },
				offset: { type: 'number', minimum: 0, default: 0 },
				limit: { type: 'number', default: 8 },
				format: { type: 'string', enum: ['summary', 'full'], default: 'summary' },
				requireFeatures: { type: 'array', items: { type: 'string' }, description: 'Factual catalog tokens that every returned entry must contain.' },
			},
		},
	},
	{
		name: 'betterpptx.table.recommend',
		title: 'Search table preset catalog',
		description: 'Compatibility alias for an unranked PowerPoint table catalog search. Returns exact executable ids, native/editable classification, Table Design facts, and stable pagination; the AI chooses the table treatment.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Case-insensitive catalog text filter; results remain unranked and id-sorted.' },
				tableIntent: { type: 'string', description: 'Optional catalog search term such as KPI scorecard, financial variance, roadmap status, comparison matrix, risk heatmap, evidence grid, or dense appendix; never used for aesthetic scoring.' },
				dataShape: { type: 'string', description: 'Known row/column shape such as metrics, numeric variance, roadmap status, feature matrix, risk heatmap, or dense data grid.' },
				category: { type: 'string', description: 'Optional PowerPoint picker category or tag filter.' },
				authoringMode: { type: 'string', enum: ['native-table', 'visual-adapted', 'preserve-only'] },
				tablePresetId: { type: 'string', description: 'Optional exact preset id, e.g. executive-kpi-scorecard, financial-variance-total, roadmap-status-lanes, feature-comparison-matrix, risk-heatmap-matrix, dark-evidence-grid, clean-dense-data-grid, or pricing-tier-matrix.' },
				includeNativeStyles: { type: 'boolean', description: 'Include the executable opaque Table Design gallery catalog with actual per-style family and tile order.' },
				nativeStyleLimit: { type: 'number', default: 74 },
				styleQuery: { type: 'string', description: 'Optional native Table Design style name or family filter.' },
				themeMode: { type: 'string', enum: ['unstyled', 'themed', 'light', 'medium', 'dark'] },
				offset: { type: 'number', minimum: 0, default: 0 },
				limit: { type: 'number', default: 8 },
				format: { type: 'string', enum: ['summary', 'full'], default: 'summary' },
				requireFeatures: { type: 'array', items: { type: 'string' }, description: 'Factual catalog tokens that every returned entry must contain.' },
			},
		},
	},
	{
		name: 'betterpptx.deck.new',
		title: 'Internal deck allocator (not exposed)',
		description: 'Internal compiler primitive. AI clients cannot call this tool. Create presentations only by connecting to the running MCP endpoint and compiling an Authoring Excellence JSON spec with betterpptx.deck.generate_from_spec.',
		inputSchema: {
			type: 'object',
			properties: {
				layout: { type: 'string', enum: ['LAYOUT_4x3', 'LAYOUT_16x9', 'LAYOUT_16x10', 'LAYOUT_WIDE'], default: 'LAYOUT_WIDE' },
				title: { type: 'string' },
				subject: { type: 'string' },
				author: { type: 'string' },
				company: { type: 'string' },
				revision: { oneOf: [{ type: 'string', pattern: '^(?:0|[1-9]\\d*)$' }, { type: 'integer', minimum: 0 }] },
				rtlMode: { type: 'boolean' },
				theme: {
					type: 'object',
					properties: {
						headFontFace: { type: 'string' },
						bodyFontFace: { type: 'string' },
					},
				},
				enableIterateEngine: { type: 'boolean', description: 'Enable PowerPoint-native iterate text animation engine.' },
				intent: { type: 'string', description: 'Optional user-facing deck intent used to initialize director workflow metadata.' },
				directorMode: { type: 'string', enum: ['ai-sovereign', 'director-strict', 'director-guided', 'primitive-direct'], default: 'ai-sovereign', description: 'Internal compiler allocation mode. ai-sovereign disables creative Director enforcement while retaining complete validation; primitive-direct remains unavailable to public clients.' },
				authoringMode: { type: 'string', enum: ['ai-sovereign', 'director-strict', 'director-guided', 'primitive-direct'], description: 'Alias for directorMode. Public authoring still uses generate_from_spec, never direct primitives.' },
			},
		},
	},
	{
		name: 'betterpptx.deck.generate_from_spec',
		title: 'Author and compile a governed PowerPoint JSON spec',
		description: PUBLIC_BLACK_BOX_SCHEMA
			? 'Validate, create, or revise a native-editable PowerPoint from a BetterPPTX JSON specification. phase:"dryRun" checks the proposed deck without creating it; phase:"commit" creates or revises a deck under the applicable authorization. The specification carries authored geometry, styling, media, and timing. The result reports validation findings, effective native representations, and deck identity when committed. Beyond standard slides it compiles: animated-table (independently editable rows, columns, or cells revealed through native timing, usable as presenter targets); narration with native audio and measured cues on one autoplay clock (narration.voices, narration.synthesize, deck.validate_narration); talking-head video from an authorized image and narration (avatar.render_job, avatar.attach_result); an editable native 3-D presenter with gestures, continuous performances, and stage movement (spec.presenter, slides[].presenterPerformance, slides[].scene); layered entrance, emphasis, motion-path, and exit motion; cross-slide continuities and triggered interactions. Exact contracts: help.tool_recipe surface animated-table, narration, avatar, 3d-presenter, or layered-motion.'
			: 'The sole presentation construction and editing front door. Use ai-sovereign-v1 when the AI must retain sole creative authority with creativeAuthority=ai, directorMode=off, and verificationMode=complete. In this workflow Content/Story, Visual/Design, and Motion/Time Director domains are optional, no Director stage blocks authoring, and the engine may report but may not creatively rewrite explicit choices. Use authoring-excellence-director-v1 only when structured assistance is desired. Both workflows share the typed native object model, deterministic dryRun/resolve/commit phases, package safety, accessibility, selection, media, timing, and current-version validation. Exact AI geometry uses geometryAuthority=ai with placementPolicy=ai-authored-geometry-v1. Raw PowerPoint XML, opaque native-preservation payloads, private runtime mappings, direct primitives, and maintainer bypasses remain unavailable.',
		inputSchema: {
			type: 'object',
			anyOf: [{ required: ['spec'] }, { required: ['specHandle'] }],
			properties: {
				deckId: { type: 'string', description: 'Optional existing deck handle. Omit to create a new deck from the spec.' },
				deckVersion: { type: 'number', description: 'Expected deck version when compiling into an existing deck.' },
				spec: {
					type: 'object',
					description: 'Native PowerPoint deck specification. ai-sovereign-v1 accepts AI-authored content, design, motion, and exact geometry; authoring-excellence-director-v1 adds structured assistance domains. Exact placement uses geometryAuthority=ai and placementPolicy=ai-authored-geometry-v1 with slide-inch rectangles. selectionManifest records explicit catalog selections for later verification.',
					allOf: [PRESENTER_PIXEL_MODE_GUARD],
					properties: {
						title: { type: 'string', minLength: 1, description: 'Portable document title.' },
						subject: { type: ['string', 'null'], description: 'Portable document subject; null restores the safe product default.' },
						author: { type: ['string', 'null'], description: 'Portable document author; null restores the safe product default.' },
						company: { type: ['string', 'null'], description: 'Portable document company; null restores the safe product default.' },
						revision: { oneOf: [{ type: 'string', pattern: '^(?:0|[1-9]\\d*)$' }, { type: 'integer', minimum: 0 }, { type: 'null' }], description: 'Whole-number document revision; null restores revision 1.' },
						rtlMode: { type: ['boolean', 'null'], description: 'Presentation-level right-to-left mode; null restores left-to-right mode.' },
						visualReference: {
							type: 'object',
							description: 'Optional exact visual-reference reconstruction contract. The client AI observes the reference outside BetterPPTX and authors native objects. BetterPPTX performs coordinate conversion only.',
							required: ['mode', 'coordinateMode', 'representationPolicy', 'viewport'],
							properties: {
								schemaVersion: { type: 'string', enum: ['betterpptx.visual-reference-reconstruction.v1'] },
								mode: { type: 'string', enum: ['ai-reconstructed-native'] },
								coordinateMode: { type: 'string', enum: ['pixels'] },
								representationPolicy: { type: 'string', enum: ['native-except-media'] },
								viewport: {
									type: 'object', required: ['width', 'height'], additionalProperties: false,
									properties: { width: { type: 'number', exclusiveMinimum: 0 }, height: { type: 'number', exclusiveMinimum: 0 } },
								},
								mediaAssets: {
									type: 'array',
									description: 'Every true media object in the reconstruction must be declared by matching content name and immutable assetRef. Full-slide coverage requires an explicit legitimate fullBleed declaration.',
									items: {
										type: 'object', required: ['name', 'kind', 'assetRef', 'purpose'], additionalProperties: false,
										properties: {
											name: { type: 'string', minLength: 1 },
											kind: { type: 'string', enum: ['photograph', 'detailed-illustration', 'model3d', 'video', 'audio'] },
											assetRef: { type: 'string', minLength: 1, description: 'Immutable opaque asset reference used by the matching media object.' },
											sha256: { type: 'string', pattern: '^[A-Fa-f0-9]{64}$', description: 'Optional content hash for package-level media binding; content-addressed handles imply the same digest.' },
											purpose: { type: 'string', minLength: 1 },
											fullBleed: { type: 'boolean' },
										},
									},
								},
							},
							additionalProperties: false,
						},
						htmlConversion: {
							type: 'object',
							description: 'Secondary automatic HTML conversion route. The primary route remains AI reconstruction through visualReference. Provide inline html or an htmlPackage handle, never both routes in one spec.',
							properties: {
								html: { type: 'string', minLength: 1 },
								package: {
									anyOf: [
										{ type: 'string' },
										{ type: 'object', required: ['handle'], additionalProperties: false, properties: { handle: { type: 'string' }, entryFile: { type: 'string' }, viewport: { type: 'object', required: ['width', 'height'], additionalProperties: false, properties: { width: { type: 'number', exclusiveMinimum: 0 }, height: { type: 'number', exclusiveMinimum: 0 } } } } },
									],
								},
								assetMap: { type: 'object', additionalProperties: { type: 'string' } },
							},
							anyOf: [{ required: ['html'] }, { required: ['package'] }],
							additionalProperties: false,
						},
						selectionManifest: {
							type: 'object',
							description: 'AI-authored exact capability choices. Use schemaVersion betterpptx.ai-selection-manifest.v1 and enforcement required for release candidates. selectors may contain only the capability contract keys advertised by the matching catalog selectionManifestContract (chart: chartPresetId, chartGalleryTilePresetId, chartStylePresetId, chartColorStyleId, chartLayoutPresetId, chartTreatmentPresetId; table: tableStylePresetId, tableStyleId; smartart: layoutId, quickStyleId, colorStyleId). Semantic fields such as chartType belong on the content block, never in selectors. Native is preferred; custom requires a specific customReason.',
							additionalProperties: true,
						},
						niceties: {
							type: 'array', maxItems: 1000, items: POWERPOINT_NICETY_TOOL_SCHEMA,
							description: 'Optional explicit native PowerPoint enhancements selected by the AI. Use these to append or replace native charts, tables, SmartArt, equations, 3D, media, ink/laser annotations, custom geometry, motion-bearing blocks, or slide transitions without rewriting the base slide. Works with semantic layout, AI-authored slide-inch rects, visual-reference pixelFrame geometry, and HTML conversion. Omission means no enhancement; the engine never invents one.',
						},
						powerpointNiceties: {
							type: 'array', maxItems: 1000, items: POWERPOINT_NICETY_TOOL_SCHEMA,
							description: 'Compatibility alias for spec.niceties. New authoring should use niceties.',
						},
						slideContinuities: SLIDE_CONTINUITIES_PUBLIC_SCHEMA,
						slides: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									pixelViewport: { type: 'object', description: 'Optional source-image width and height in pixels for this slide. Overrides visualReference.viewport for slide content and this slide presenter.pixelFrame, but not for an inherited deck presenter frame.', required: ['width', 'height'], additionalProperties: false, properties: { width: { type: 'number', exclusiveMinimum: 0 }, height: { type: 'number', exclusiveMinimum: 0 } } },
									presenter: { type: 'object', additionalProperties: false, description: 'Per-slide deck-presenter overrides. pixelFrame requires the explicit visualReference pixel route. Omitted fields inherit the deck presenter. staticPose controls stopped/edit posture only; select playback separately through presenterMotion.', properties: { pixelFrame: PRESENTER_PIXEL_FRAME_TOOL_SCHEMA, staticPose: STATIC_POSE_PUBLIC_SCHEMA } },
									presenterPerformance: { oneOf: [PRESENTER_PERFORMANCE_SCHEMA, { type: 'null' }], description: 'A continuous same-slide performance for any supported presenter: ordered motion IDs, pose blending, 3D transform keyframes, exact AI-authored slide-inch travel centers, entry/exit and named target interactions. All times are milliseconds relative to startMs.' },
									scene: { type: 'array', description: 'Authored presenter-cast beats. Select motionId and optional loop behavior; staticPose independently controls stopped/edit posture.', items: { type: 'object', additionalProperties: true, properties: { actor: { type: 'string' }, motionId: { type: 'string' }, loop: { type: 'boolean', description: 'False plays the selected motion once and holds its final pose until slide advance. True or omission repeats. Does not change motion duration, speed, or stopped/edit posture; allow enough slide time for the full motion.' }, staticPose: STATIC_POSE_PUBLIC_SCHEMA } } },
									content: {
										type: 'array',
										items: {
											type: 'object', required: ['kind', 'name'], additionalProperties: true,
											allOf: [PIXEL_GEOMETRY_FRAME_GUARD, STRUCTURAL_LINE_CARRIER_SCHEMA],
											properties: {
												kind: { type: 'string', description: 'Native presentation object kind such as textBox, textShape, shape, connector, group, freeform, customGeometry, chart-panel, table-panel, animated-table, smartart, equation, image, model3d, media, ink, or laser. Use table-panel for a native p:tbl and animated-table when rows or cells need independent motion or presenter interaction.' },
												name: { type: 'string', minLength: 1 },
												textFill: TEXT_FILL_PUBLIC_SCHEMA,
												style: { type: ['object', 'null'], properties: { textFill: TEXT_FILL_PUBLIC_SCHEMA }, additionalProperties: true },
												text: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'object', properties: { text: { type: ['string', 'number'] }, options: { type: 'object', properties: { textFill: TEXT_FILL_PUBLIC_SCHEMA }, additionalProperties: true } }, additionalProperties: true } }] },
												patch: { type: 'object', properties: { textFill: TEXT_FILL_PATCH_SCHEMA }, additionalProperties: true },
												pixelFrame: PIXEL_FRAME_TOOL_SCHEMA,
												staticPose: STATIC_POSE_PUBLIC_SCHEMA,
												motionFraming: MODEL3D_OPTIONS_PUBLIC_SCHEMA.properties.motionFraming,
												scene: MODEL3D_OPTIONS_PUBLIC_SCHEMA.properties.scene,
												pixelPoints: PIXEL_POINTS_TOOL_SCHEMA,
												pixelPaths: PIXEL_PATHS_TOOL_SCHEMA,
												children: { type: 'array', minItems: 1, maxItems: 256, description: 'Native editable group children use local x/y/w/h in slide inches in ai-sovereign-v1, or local pixelFrame only in the visual-reference pixel route. Put fontSize/fill/line in child.style. Unlike a top-level content block, do not put rect, options, shapeId, or fontSize at the child root. Children may mix text, images, shapes, connectors, freeforms, and nested groups; animate the named group or named descendant.', items: PUBLIC_GROUP_CHILD_TOOL_SCHEMA },
												header: { type: ['array', 'null'], minItems: 1, maxItems: 20, description: 'Column headings for table-panel or animated-table.', items: { type: ['string', 'number', 'object'] } },
												rows: { type: 'array', minItems: 1, maxItems: 50, description: 'Rows for table-panel or animated-table. animated-table v1 supports up to 20 independently editable cells per row and rejects merged cells.', items: { type: 'array', minItems: 1, maxItems: 20, items: { type: ['string', 'number', 'object'] } } },
												reveal: { type: ['object', 'null'], additionalProperties: false, description: 'For animated-table, reveal independently editable rows, columns, or cells through native timing. Omit or set enabled:false for a static but still Synergy-ready composite.', properties: { enabled: { type: 'boolean' }, by: { type: 'string', enum: ['row', 'column', 'cell'] }, mode: { type: 'string', enum: ['row', 'column', 'cell'] }, order: { type: 'string', enum: ['forward', 'reverse', 'row-major', 'column-major'] }, includeHeader: { type: 'boolean' }, effect: { type: 'string' }, trigger: { type: 'string', enum: ['withPrevious', 'afterPrevious'] }, startMs: { type: 'number', minimum: 0, maximum: 86400000 }, staggerMs: { type: 'number', minimum: 0, maximum: 60000 }, durationMs: { type: 'number', exclusiveMinimum: 0, maximum: 60000 } } },
											appearance: { type: ['object', 'null'], additionalProperties: false, description: 'For animated-table, sparse shape-built cell styling. Every cell remains a native editable text shape.', properties: { headerFill: { type: ['string', 'null'], pattern: '^[#]?[0-9A-Fa-f]{6}$' }, rowFill: { type: ['string', 'null'], pattern: '^[#]?[0-9A-Fa-f]{6}$' }, alternateRowFill: { type: ['string', 'null'], pattern: '^[#]?[0-9A-Fa-f]{6}$' }, headerTextColor: { type: ['string', 'null'], pattern: '^[#]?[0-9A-Fa-f]{6}$' }, textColor: { type: ['string', 'null'], pattern: '^[#]?[0-9A-Fa-f]{6}$' }, borderColor: { type: ['string', 'null'], pattern: '^[#]?[0-9A-Fa-f]{6}$' }, fontFace: { type: ['string', 'null'] }, fontSize: { type: ['number', 'null'], minimum: 8, maximum: 72 }, headerFontSize: { type: ['number', 'null'], minimum: 8, maximum: 72 }, borderWidth: { type: ['number', 'null'], minimum: 0, maximum: 12 }, cellMargin: { type: ['number', 'null'], minimum: 0, maximum: 0.4 } } },
											},
										},
									},
									interactions: {
										type: 'array',
										items: {
											type: 'object',
											required: ['actor', 'verb', 'target'],
											properties: {
												actor: { type: 'string' },
												verb: { type: 'string', enum: ['touch', 'point-at', 'press', 'push', 'knock-over', 'carry'] },
											target: { type: 'string', description: 'Stable same-slide content objectName/name, including a named editable group descendant such as an animated-table row or cell.' },
												hand: { type: 'string' },
												distIn: { type: 'number' },
												startMs: { type: 'integer', minimum: 0, maximum: 120000, description: 'Absolute slide-clock start for the presenter clip; solved contact timing is offset from it.' },
											},
											additionalProperties: false,
										},
									},
								},
								additionalProperties: true,
							},
						},
						motionTime: {
							type: 'object',
							properties: {
								masterClock: { type: 'string' },
								timingSource: { type: 'string' },
								syncPolicy: { type: 'string' },
								kineticSelection: {
									type: 'object',
									description: 'AI-owned exact semantic presenter bundles. The full catalog is larger; each presenter selects at most 18 public motion IDs.',
									required: ['presenters'],
									properties: {
										presenters: {
											type: 'array', minItems: 1,
											items: {
												type: 'object', required: ['presenterId', 'selectedMotionIds'],
												properties: {
													presenterId: { type: 'string' },
													selectedMotionIds: { type: 'array', minItems: 1, maxItems: 18, uniqueItems: true, items: { type: 'string', pattern: '^motion\\.' } },
												},
												additionalProperties: false,
											},
										},
									},
									additionalProperties: false,
								},
							},
							additionalProperties: true,
						},
						presenter: {
							type: 'object',
							description: 'Optional editable native 3-D presenter. The AI chooses identity, motion, stage treatment, and exact geometry. Use rect/bbox in ai-authored-geometry-v1 or pixelFrame in the visual-reference pixel route. Engine-owned presenter placement is deactivated.',
							properties: {
								identity: { type: 'string', enum: ['auto', 'joe', 'louise', 'pete'] },
								id: { type: 'string', minLength: 1, description: 'Stable presenter id used by motionTime.kineticSelection and slides[].presenterMotion.' },
								pixelFrame: PRESENTER_PIXEL_FRAME_TOOL_SCHEMA,
								rect: { type: 'object', required: ['x', 'y', 'w', 'h'], additionalProperties: false, properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number', exclusiveMinimum: 0 }, h: { type: 'number', exclusiveMinimum: 0 } }, description: 'Exact AI-authored presenter frame in slide inches.' },
								bbox: { type: 'object', required: ['x', 'y', 'w', 'h'], additionalProperties: false, properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number', exclusiveMinimum: 0 }, h: { type: 'number', exclusiveMinimum: 0 } }, description: 'Alias for rect.' },
								staticPose: STATIC_POSE_PUBLIC_SCHEMA,
								stage: { type: 'string', enum: ['left', 'right', 'center', 'corner'] },
								stageTreatment: { type: 'string', enum: ['none', 'floor-ellipse'], default: 'none', description: 'Explicit AI-owned visual treatment; the list is unranked and omission never triggers automatic decoration.' },
								onSlides: { type: ['string', 'array'] },
								choreography: { type: 'string', enum: ['keynote', 'subtle', 'energetic'] },
							},
							additionalProperties: true,
						},
						presenters: { type: 'object', additionalProperties: true, properties: { cast: { type: 'array', items: { type: 'object', additionalProperties: true, properties: { staticPose: STATIC_POSE_PUBLIC_SCHEMA } } } } },
					},
					additionalProperties: true,
				},
				specHandle: { type: 'string', description: 'Opaque handle returned by assets.upload kind:"jsonSpec". Use this when a person gives the AI a portable BetterPPTX JSON file; the MCP loads the immutable source and applies the same dryRun/resolve/commit workflow as an inline spec.' },
				phase: { type: 'string', enum: ['dryRun', 'resolve', 'lockedDryRun', 'commit'], description: 'Canonical spec execution phase. dryRun is mutation-free; resolve estimates or locks billable media when supported; lockedDryRun validates an already locked deterministic spec; commit mutates or creates the deck. Do not send conflicting dryRun and phase values.' },
				dryRun: { type: 'boolean', default: false, description: 'When true, compile and validate the operation plan without creating or mutating a deck.' },
				commitMode: { type: 'string', enum: ['createNew', 'append', 'replaceDeck', 'patch'], description: 'Required when deckId is supplied for phase:"commit". createNew creates a new deck, append adds generated slides to an existing deck, replaceDeck atomically rebuilds the deck from the spec, and patch applies supported JSON-spec edits to existing exported objects.' },
				detail: { type: 'string', enum: ['summary', 'full'], default: 'summary', description: 'summary returns compact slide/object plan; full includes object geometry and call-plan details.' },
				plan: { type: 'string', enum: ['free', 'premium'], default: 'free', description: 'Compilation entitlement mode. Free mode keeps all slides but emits upgrade warnings after the preview boundary.' },
				accountPlan: { type: 'string', enum: ['free', 'premium'], description: 'Alias for plan.' },
				billingConfirmed: { type: 'boolean', default: false, description: 'Set true only after the user accepts the dry-run/resolve cost estimate for billable spec operations.' },
				quoteBinding: {
					...premiumQuoteBindingPublicSchema(),
				},
				alternativeAuthorization: {
					type: 'object',
					description: 'Explicit acceptance of one exact representation-changing alternative proposed by a prior ALTERNATIVE_AUTHORIZATION_REQUIRED response. This never authorizes a different delta, paid work, or a future proposal.',
					required: ['accept', 'proposalDigest'],
					additionalProperties: false,
					properties: {
						accept: { const: true, description: 'True only after the user or consuming AI deliberately accepts the disclosed delta.' },
						proposalDigest: { type: 'string', pattern: '^[0-9a-f]{64}$', description: 'Exact proposalDigest returned by the unchanged specification and current entitlement evaluation.' },
					},
				},
				billingOverride: { type: 'boolean', default: false, description: 'Owner/maintainer override for unusually large accepted billing estimates where policy allows it.' },
				idempotencyKey: { type: 'string', description: 'Stable retry key for side-effecting operations. Hosted deployments may require it for resolve/commit; reuse the exact key and arguments on retries. Mutation-free dryRun and lockedDryRun do not require or persist a durable operation key. This key does not authorize payment.' },
				planId: { type: 'string', description: 'Locked compile plan id returned by dryRun. Commit should pass this value so generation persists the same plan instead of reclassifying independently.' },
				lockedPlanId: { type: 'string', description: 'Alias for planId. Pass the dry-run planId so commit consumes the locked compile plan.' },
				planDigest: { type: 'string', description: 'Alias for planId. The dry-run planDigest may be sent on commit for compile-once generation.' },
				validateAfterCompile: { type: 'boolean', default: false, description: 'Run deck.validate after committing the compiled operations.' },
				saveAfterCommit: { type: 'boolean', default: false, description: 'After a successful commit, attempt save under the deployment-selected verification policy. Release-powerpoint requires a complete PowerPoint preview of this deckVersion; production-non-rendering uses deterministic package, media, timing, accessibility, and selection checks without hosted PowerPoint.' },
				validationMode: { type: 'string', enum: ['lenient', 'normal', 'strict'], default: 'normal' },
				includeCallPlan: { type: 'boolean', default: false, description: 'When true in full detail, include the primitive tool call sequence for debugging AI authoring decisions.' },
			},
		},
	},
	{
		name: 'betterpptx.deck.recent',
		title: 'List recent decks',
		description: 'List active in-memory deck handles with deckId, deckVersion, remainingTtlMs, and pinUntilSave. Committed unsaved decks stay pinned until the first save. Use this when a later patch reports an expired deck.',
		inputSchema: { type: 'object', properties: {} },
		annotations: { title: 'List recent BetterPPTX decks', readOnlyHint: true, destructiveHint: false },
	},
	{
		name: 'betterpptx.deck.director_status',
		title: 'Inspect authoring authority and optional Director status',
		description: 'Return the effective authoring mode for a deck. In ai-sovereign mode Director assistance is off, creative planning stages are not obligations, and complete technical verification remains active. In assisted modes the response reports applicable Director stages, coverage, and the next recommended public tool.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
			},
		},
	},
	{
		name: 'betterpptx.deck.define_message_architecture',
		title: 'Define message architecture',
		description: 'Record the author-supplied message architecture before slide primitives: audience, delivery mode, thesis, story arc, one idea per slide, evidence/source plan, and visible word budget. This is generic planning metadata, not a template or predefined deck spec.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				architecture: { type: 'object', description: 'Arbitrary structured message architecture payload.' },
				audience: { type: 'string' },
				deliveryMode: { type: 'string', description: 'Presentation context such as keynote, spoken-support, executive, self-reading, or training/reference.' },
				objective: { type: 'string' },
				thesis: { type: 'string' },
				storyArc: { type: ['string', 'array', 'object'], description: 'Narrative sequence or argument arc.' },
				oneIdeaPerSlide: { type: 'boolean' },
				wordBudget: { type: ['string', 'object'], description: 'Visible word budget policy.' },
				slides: { type: 'array', description: 'Planned slide messages, one core idea per item.', items: { type: 'object', additionalProperties: true } },
				sources: { type: 'array', description: 'Evidence/source plan for factual grounding.', items: { type: ['string', 'object'] } },
				notesPolicy: { type: ['string', 'object'], description: 'Speaker notes or narration-copy policy.' },
			},
		},
	},
	{
		name: 'betterpptx.deck.assign_slide_roles',
		title: 'Assign slide roles',
		description: 'Record author-supplied communicative roles or layout archetypes for planned slides. Roles guide variety and function; they are not slide templates.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				rolePlan: { type: 'object', description: 'Arbitrary structured slide-role assignment payload.' },
				roles: { type: 'array', description: 'Per-slide role assignments.', items: { type: ['object', 'string'] } },
				slideRoles: { type: 'array', description: 'Alias for roles.', items: { type: ['object', 'string'] } },
				assignments: { type: 'array', description: 'Alias for roles.', items: { type: ['object', 'string'] } },
				slides: { type: 'array', description: 'Planned slides with role/function/archetype fields.', items: { type: 'object', additionalProperties: true } },
				roleVocabulary: { type: 'array', description: 'Optional vocabulary used by the author.', items: { type: 'string' } },
				varietyPolicy: { type: ['string', 'object'], description: 'Rules for avoiding repetitive slide roles and layouts.' },
			},
		},
	},
	{
		name: 'betterpptx.deck.define_design_system',
		title: 'Define design system',
		description: 'Record the author-supplied seven-pillar presentation design system before slide primitives: structural architecture, semantic color, typography, visual assets, data visualization, motion, and packaging/pack-out policy.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				designSystem: { type: 'object', description: 'Arbitrary structured design-system contract. It should cover all seven pillars.' },
				pillars: { type: ['object', 'array'], description: 'Seven-pillar coverage payload.' },
				structuralArchitecture: { type: 'object', description: 'Masters, micro-layouts, grid, margins, metadata controls.' },
				semanticColorArchitecture: { type: 'object', description: 'Palette, semantic data colors, light/dark modes, depth/transparency rules.' },
				semanticColor: { type: 'object', description: 'Alias for semanticColorArchitecture.' },
				typographicHierarchy: { type: 'object', description: 'Font pairing, type scale, leading, tracking, metadata/footnote levels.' },
				typography: { type: 'object', description: 'Alias for typographicHierarchy.' },
				visualAssetEcosystem: { type: 'object', description: 'Shape/icon geometry, imagery rules, component blueprints, 3D/custom geometry policy.' },
				visualAssets: { type: 'object', description: 'Alias for visualAssetEcosystem.' },
				dataVisualizationSystems: { type: 'object', description: 'Chart and table styling rules, data color sequence, gridlines, padding.' },
				dataVisualization: { type: 'object', description: 'Alias for dataVisualizationSystems.' },
				motionTransitionDynamics: { type: 'object', description: 'Transition/animation restraints, duration limits, narration/timing sync.' },
				motion: { type: 'object', description: 'Alias for motionTransitionDynamics.' },
				packagingPackout: { type: 'object', description: 'PPTX/POTX/THMX export policy and repair-safe validation requirements.' },
				packaging: { type: 'object', description: 'Alias for packagingPackout.' },
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
		description: 'Create or re-edit one named physical slide master in the deck’s ordered master collection, including its native background, placeholders, fixed objects, color map, text styles, slide number, and header/footer policy.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'master'],
			properties: {
				deckId: { type: 'string' },
				master: JSON.parse(JSON.stringify(MULTIPLE_SLIDE_MASTERS_PUBLIC_SCHEMA.properties.masters.items)),
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
					description: 'Background props: { color, transparency, type: solid|gradient, gradientStops, gradientAngle, gradientPreset, path, data, fillToRect, ... }. Gradient stops may use color:{ color|scheme|preset, tint, shade, saturation, luminance, luminanceOffset, opacity } for continuous native colour transforms.',
				},
				transition: {
					type: 'object',
					description: 'TransitionProps: { type, speed|duration, direction, throughBlack, splitDirection, pattern, spokes, clockwise, zoomFrom, option, advanceOnClick, advanceAfterTime }',
				},
				slideNumber: { type: 'object' },
				color: { type: 'string' },
				hidden: { type: 'boolean', description: 'Hide the slide in show mode while retaining it in the editable deck.' },
				showMasterShapes: { type: 'boolean', description: 'Show or suppress shapes inherited from the selected master; null/reset restores the native default through slide.update.' },
				showMasterBackground: { type: 'boolean', description: 'PowerPoint semantic alias for showing or hiding master background graphics; maps to the native showMasterSp carrier.' },
				showMasterPhAnim: { type: 'boolean', description: 'Show or suppress placeholder animations inherited from the selected master; null/reset restores the native default through slide.update.' },
				notes: { type: 'string' },
			},
		},
	},
	{
		name: 'betterpptx.slide.set_transition',
		title: 'Set one slide transition',
		description: 'Set or clear the transition for exactly one slide. Morph-by-object is optional and should be selected only when it serves the authored story.',
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
		description: 'Return one slide\'s editable state: background, transition, hidden flag, slide number, master-shape/placeholder-animation visibility, notes text, layout name, and object count. Use before slide.update when editing slide-level properties.',
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
		name: 'betterpptx.slide.revise',
		title: 'Revise one editable slide object semantically',
		description: 'Patch an editable object by stable objectName or editHandle using a semantic patch. Use this after slide.inspect or slide.list_shapes when the AI needs a reliable non-index edit.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'target', 'patch'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				target: {
					type: 'object',
					description: 'Target selector such as { objectName } or { editHandle }. objectName is preferred when visible in the plan.',
					properties: {
						objectName: { type: 'string' },
						editHandle: { type: 'string' },
					},
				},
				patch: {
					type: 'object',
					description: 'Semantic patch such as { text, fit:"shrink", emphasis:"high", tone:"more concise", style:{ color, fill, fontSize }, x,y,w,h }.',
					additionalProperties: true,
				},
			},
		},
	},
	{
		name: 'betterpptx.deck.revise',
		title: 'Revise multiple generated objects semantically',
		description: 'Apply a small batch of semantic object patches by stable objectName or editHandle. Each patch is compiled to existing editable-object updates and is safe to retry with an idempotency key.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'patches'],
			properties: {
				deckId: { type: 'string' },
				patches: {
					type: 'array',
					items: {
						type: 'object',
						required: ['target', 'patch'],
						properties: {
							slideIndex: { type: 'number' },
							target: { type: 'object', additionalProperties: true },
							patch: { type: 'object', additionalProperties: true },
						},
					},
				},
			},
		},
	},
	{
		name: 'betterpptx.slide.preview',
		title: 'Render slide preview image',
		description: 'Optionally render a pixel-faithful PNG preview of one slide through PowerPoint for explicit visual inspection or release qualification. Production save under the production-non-rendering policy does not require this tool. Optional includeNativeModelPreviews returns verified transparent 3D-object previews as opaque image assets for matching compatibility posters; this does not prove animation playback.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				width: { type: 'number', default: 1280, description: 'Output image width in pixels.' },
				includeNativeModelPreviews: { type: 'boolean', default: false, description: 'Also publish each verified 3D-object appearance as a transparent PNG with an opaque posterAsset, download link, exact frame, and pose/view binding. Reuse only on that same model, stopped pose, view, and frame in a new public specification, then revalidate and preview. A trusted matching poster can prove static appearance only; its evidence explicitly leaves live native hydration unverified and playback not verified.' },
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
				showMasterShapes: { type: ['boolean', 'null'], description: 'Show/suppress master shapes, or null to restore the native default.' },
				showMasterBackground: { type: ['boolean', 'null'], description: 'Show/hide master background graphics (PowerPoint semantic alias), or null to restore the native default.' },
				showMasterPhAnim: { type: ['boolean', 'null'], description: 'Show/suppress master placeholder animations, or null to restore the native default.' },
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
		description: 'Add text/paragraphs. Supports the captured WordArt Quick Style vocabulary through options.wordArtStylePresetId (20 native style tiles) and the complete captured Text Effects vocabulary through options.textEffectPresetIds (one or more opaque IDs in execution order), plus WordArt transforms, Text3D, reflection, glow, gradient fill, animation, scheme colors, and custom paragraphs.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'text'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				text: {
					oneOf: [
						{ type: 'string' },
						{ type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, options: { type: 'object', properties: { textFill: TEXT_FILL_PUBLIC_SCHEMA }, additionalProperties: true } } } },
					],
					description: 'String or array of paragraph TextProps (each with text/options).',
				},
				options: {
					type: 'object',
					description: 'TextPropsOptions: wordArtStylePresetId; textEffectPresetIds; x/y/w/h; fontFace/fontSize/color; editable solid/none/gradient glyph textFill; panel fill/line; wordArt transform; Text3D; animation; fit; spacing; bullets; hyperlink; transparency. Discover exact effect IDs with betterpptx.options.catalog.',
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
			required: ['deckId', 'slideIndex'],
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
					enum: [...EQUATION_SOURCE_FORMATS],
					description: 'Input interpretation. Use template for semantic structures and omml for exact Office Math XML.',
				},
				equationGalleryPresetId: { type: 'string', description: 'Exact opaque ID from the native equation gallery or semantic-structure catalog. Supply source instead when not using a preset.' },
				parameters: { type: 'object', description: 'Semantic slots for parameterized gallery structures, for example { numerator:"a", denominator:"b" }.' },
				x: { type: 'number', description: 'X position, inches.' },
				y: { type: 'number', description: 'Y position, inches.' },
				w: { type: 'number', description: 'Width, inches.' },
				h: { type: 'number', description: 'Height, inches.' },
				objectName: { type: 'string' },
				fontSize: { type: 'number' },
				fontFace: { type: 'string' },
				color: { type: 'string' },
					align: { type: 'string', enum: ['left', 'center', 'right', 'justify'] },
				display: { type: ['string', 'null'], enum: [...EQUATION_DISPLAY_MODES, null], description: 'Office Math display mode.' },
				lang: { type: 'string' },
				rotate: { type: 'number' },
				flipH: { type: 'boolean' },
				flipV: { type: 'boolean' },
				accessibilityTitle: { type: ['string', 'null'] },
				isDecorative: { type: ['boolean', 'null'] },
				semanticSlots: { type: 'object' },
				slots: { type: 'object' },
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
					additionalProperties: false,
					properties: EQUATION_PUBLIC_SCHEMA.properties,
					description: 'Additional EquationProps fields; explicit top-level arguments win.',
				},
			},
		},
	},
	{
		name: 'betterpptx.equation.catalog',
		title: 'List native equation authoring capabilities',
		description: 'Compatibility alias for an unranked native PowerPoint equation catalog search. Returns exact executable preset ids, source-format and semantic-structure facts, and stable pagination; the AI chooses the equation.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			properties: {
				query: { type: 'string', description: 'Case-insensitive catalog text filter; results remain unranked and id-sorted.' },
				templateKind: { type: 'string', description: 'Optional exact semantic template kind filter such as fraction, radical, summation, cases, or matrix.' },
				equationGalleryPresetId: { type: 'string', description: 'Optional exact equation gallery or semantic-structure preset id.' },
				offset: { type: 'number', minimum: 0, default: 0 },
				limit: { type: 'number', default: 12 },
				format: { type: 'string', enum: ['summary', 'full'], default: 'summary' },
				requireFeatures: { type: 'array', items: { type: 'string' }, description: 'Factual catalog tokens that every returned entry must contain.' },
			},
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
				display: { type: ['string', 'null'], enum: [...EQUATION_DISPLAY_MODES, null] },
				x: { type: 'number' },
				y: { type: 'number' },
				w: { type: 'number' },
				h: { type: 'number' },
				objectName: { type: 'string' },
				fontSize: { type: 'number' },
				fontFace: { type: 'string' },
				color: { type: 'string' },
				align: { type: 'string', enum: ['left', 'center', 'right', 'justify'] },
				rotate: { type: 'number' },
				flipH: { type: 'boolean' },
				flipV: { type: 'boolean' },
				accessibilityTitle: { type: ['string', 'null'] },
				isDecorative: { type: ['boolean', 'null'] },
				semanticSlots: { type: 'object' },
				slots: { type: 'object' },
				lang: { type: 'string' },
				altText: { type: 'string' },
				fallback: { description: 'Optional replacement caller-supplied fallback image config.' },
			},
		},
	},
	{
		name: 'betterpptx.smartart.catalog',
		title: 'List SmartArt authoring capabilities',
		description: 'Return an unranked PowerPoint SmartArt catalog with exact layout, quick-style, and color-style ids plus native support and applicability facts. The AI chooses the relationship and design; the engine filters and validates exact ids.',
		inputSchema: JSON.parse(JSON.stringify(SMARTART_CATALOG_INPUT_SCHEMA)),
	},
	{
		name: 'betterpptx.deck.define_layout',
		title: 'Define a custom slide layout/size',
		description: 'Register a native slide layout (name + width/height in inches), bind it to a named physical master, add editable placeholders or layout-owned objects, and optionally activate it for the deck.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'name', 'width', 'height'],
			properties: {
				deckId: { type: 'string' },
				name: { type: 'string' },
				kind: { type: 'string', enum: ['layout', 'master'], description: 'Optional imported carrier kind; master edits target the linked master-owned carrier.' },
				carrierType: { type: 'string', enum: ['layout', 'master'], description: 'Alias for kind when applying a governed template-carrier patch.' },
				masterName: { type: 'string', description: 'Physical parent-master name. Required for authored layouts when the deck has multiple authored masters; kind/master carrierType still targets an imported master carrier.' },
				width: { type: 'number', description: 'Inches' },
				height: { type: 'number', description: 'Inches' },
				type: { type: 'string', description: 'Optional PowerPoint slide-size type such as screen16x9 or custom.' },
				placeholders: { oneOf: [{ type: 'null' }, { type: 'array', items: JSON.parse(JSON.stringify(LAYOUT_PLACEHOLDER_DEFINITION_SCHEMA)) }], description: 'Optional semantic editable placeholder definitions; friendly type aliases lower to native tokens and null or [] clears this component.' },
				objects: { type: ['array', 'null'], items: { type: 'object', additionalProperties: true }, description: 'Optional editable objects owned by the layout part; null or [] clears this component.' },
				reset: { type: 'boolean', default: false, description: 'For an imported template carrier, restore the exact source carrier XML and clear native edits before returning readback.' },
				background: { type: ['object', 'string', 'null'], description: 'Optional native layout background fill.' },
				margin: { description: 'Optional layout content margin in inches/points using the native margin contract.' },
				slideNumber: { type: ['object', 'null'], additionalProperties: true, description: 'Optional native slide-number field contract; null removes it.' },
				headerFooter: { type: ['object', 'null'], additionalProperties: true, description: 'Optional native header/footer visibility policy: { date, header, footer, slideNumber } booleans; show* aliases are accepted; null clears it.' },
				activate: { type: 'boolean', default: true, description: 'Switch the deck to this layout immediately.' },
			},
		},
	},
	{
		name: 'betterpptx.deck.load_template',
		title: 'Load an existing .pptx as a base template',
		description: 'Open an existing .pptx file, preserve every authored theme/master/slide-layout part and its placeholder gallery, expose native layout carriers for editable authoring, audit header/footer/logo regions, and optionally enforce a strict layout policy for newly authored slides.',
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
				strictLayout: { type: 'boolean', default: true, description: 'Reject unknown or disallowed template layouts when a layout policy is active.' },
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
				deckId: { type: 'string', description: 'Deck handle returned by deck.new or deck.open_uploaded.' },
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
		description: 'Configure autoplay with useTimings, native animation, timed slide advance and advanceOnClick:false. For narrated slides use showNarration:true and preserveTimedSlides:true so measured audio-driven dwell is not overwritten by the fallback secondsPerSlide. If a slide has no transition, a default fade transition is added. No narration audio is synthesized by this tool.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				secondsPerSlide: { type: 'number', default: 6, description: 'Seconds each slide stays on screen.' },
				loop: { type: 'boolean', default: true },
				mode: { type: 'string', enum: ['present', 'browse', 'kiosk'], default: 'kiosk' },
				showNarration: { type: 'boolean', description: 'Also enable showNarration in presentation show settings.' },
				preserveTimedSlides: { type: 'boolean', default: false, description: 'Retain authored or measured per-slide advanceAfterTime values; secondsPerSlide fills only untimed slides.' },
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
		description: 'Read the narration voice catalog and independent readiness facts. Filter by language/lang, gender, or query. The response distinguishes catalog availability, synthesis-runtime availability, environment mode, production approval, caller authorization, and productionReady; public endpoints return only voices selectable under the current policy.',
		inputSchema: JSON.parse(JSON.stringify(MEDIA_AVATAR_PUBLIC_OPERATION_SCHEMAS['betterpptx.narration.voices'])),
	},
	{
		name: 'betterpptx.narration.synthesize',
		title: 'Synthesize narration audio',
		description: 'Prepare narration before quotation or final deck generation. Provide text or ordered segments; the service measures each returned WAV, records exact segment timing and authored gaps, and returns opaque audio and preparation-manifest handles. Reuse the returned manifest in the deck spec so final generation never synthesizes a different clip after the quote. This is a mutating, potentially metered operation; supply a stable idempotencyKey. For long multi-clip preparations, a response deadline may return TOOL_TIMEOUT while synthesis continues: poll the returned operationId with betterpptx.operation.status or replay the identical request/key; never start a changed retry to recover the same preparation. Discovery never starts synthesis.',
		inputSchema: {
			type: 'object',
			description: 'Provide text or segments. A segment requires text or script; gap values are non-negative integer milliseconds. Use a caller-generated idempotencyKey for retries.',
			properties: {
				text: { type: 'string', description: 'One narration script. Use this or segments, not an empty request.' },
				script: { type: 'string', description: 'Compatibility alias for text.' },
				segments: {
					type: 'array',
					description: 'Ordered narration clips. Each clip is synthesized and measured independently, then assembled with the authored gaps.',
					items: {
						type: 'object',
						properties: {
							id: { type: 'string', description: 'Stable segment identifier.' },
							slideId: { type: 'string', description: 'Optional semantic slide identifier.' },
							text: { type: 'string' },
							script: { type: 'string', description: 'Compatibility alias for text.' },
							synthesisText: { type: 'string', description: 'Optional normalized speech text while text remains the authored notes/script.' },
							gapBeforeMs: { type: 'integer', minimum: 0, description: 'Measured-timeline silence before this segment. If both this and the preceding segment gapAfterMs are supplied, both authored gaps are retained.' },
							gapAfterMs: { type: 'integer', minimum: 0, description: 'Measured-timeline silence after this segment. If both this and the following segment gapBeforeMs are supplied, both authored gaps are retained.' },
							voice: { type: 'string' },
							lang: { type: 'string' },
							gender: { type: 'string', enum: ['female', 'male'] },
							speaker: { type: 'integer', minimum: 0 },
							lengthScale: { type: 'number', exclusiveMinimum: 0 },
							noiseScale: { type: 'number', minimum: 0 },
							noiseWScale: { type: 'number', minimum: 0 },
						},
						additionalProperties: false,
					},
				},
				voice: { type: 'string', description: 'Voice id from betterpptx.narration.voices.' },
				lang: { type: 'string', description: 'Language/locale fallback, e.g. en, en_US, fr_FR.' },
				gender: { type: 'string', enum: ['female', 'male'], description: 'Optional gender preference. For multi-speaker Piper models, the matching speaker profile is selected automatically.' },
				speaker: { type: 'integer', minimum: 0 },
				lengthScale: { type: 'number', exclusiveMinimum: 0 },
				noiseScale: { type: 'number', minimum: 0 },
				noiseWScale: { type: 'number', minimum: 0 },
				segmentGapMs: { type: 'integer', minimum: 0, description: 'Default gap before each ordered segment after the first when that segment does not set gapBeforeMs.' },
			},
			additionalProperties: false,
		},
	},
	{
		name: 'betterpptx.deck.add_narration',
		title: 'Add narrated autoplay timing to multiple slides',
		description: 'For each slide, synthesize or attach native PowerPoint narration audio, add speaker notes, schedule AI-authored cues on an absolute narration timeline, and set deck show settings for narrated autoplay. Visible subtitle objects are not created.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slides'],
			properties: {
				deckId: { type: 'string' },
				slides: { type: 'array', description: 'Array of { slideIndex, script|audio, cues?, timing?, voice?, lang?, provider?, paddingMs? }. timing may contain startDelayMs, paddingMs, expectedDurationMs, timingToleranceMs, and cues. cue atMs values are milliseconds from narration audio start; startDelayMs shifts audio and cues together.' },
				tts: { type: 'object', description: 'Deck-level TTS defaults: { provider, voice, lang, gender, speaker, lengthScale, noiseScale, noiseWScale }.' },
				autoplay: { type: 'object', description: 'Autoplay settings: { paddingMs, mode, loop }.' },
				voice: { type: 'string' },
				lang: { type: 'string' },
				gender: { type: 'string', enum: ['female', 'male'] },
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
		name: 'betterpptx.avatar.render_job',
		title: 'Start Avatar talking-head video job',
		description: 'Start the asynchronous custom talking-head video stage from an uploaded face image. Explicit source-image consent and an idempotency key are mandatory. This high-value identity-media route is sponsored within the bounded free allowance (three completed generations per secured identity per rolling 30 days), independent of the three free deck-publication slots. The completed audiovisual asset is attached through betterpptx.avatar.attach_result; no hosted PowerPoint renderer is required.',
		inputSchema: JSON.parse(JSON.stringify(MEDIA_AVATAR_PUBLIC_OPERATION_SCHEMAS['betterpptx.avatar.render_job'])),
	},
	{
		name: 'betterpptx.avatar.job_status',
		title: 'Check Avatar talking-head job',
		description: 'Return the bounded queued, running, succeeded, or failed state for an Avatar talking-head video job. A succeeded job includes an opaque completed audiovisual asset reference and measured media metadata for betterpptx.avatar.attach_result.',
		inputSchema: JSON.parse(JSON.stringify(MEDIA_AVATAR_PUBLIC_OPERATION_SCHEMAS['betterpptx.avatar.job_status'])),
	},
	{
		name: 'betterpptx.avatar.attach_result',
		title: 'Attach completed Avatar talking-head video',
		description: 'Prefer betterpptx.deck.generate_from_spec commitMode:"patch" with slides:[{ slideIndex, avatarNarration: { jobId (or avatarAsset), script, rect } }]: decks are edited only through the spec compiler, so this tool returns AVATAR_ATTACH_SPEC_ROUTE with that exact patch request. The attach resolves the returned poster, writes the editable video frame/playback/timing contract, embeds the video audio once, and preserves the script in speaker notes. This is audiovisual media, not editable native 3D geometry.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'script'],
			anyOf: [
				{ required: ['jobId'] },
				{ required: ['avatarAsset'] },
			],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				jobId: { type: 'string', minLength: 1, description: 'Stable succeeded Avatar talking-head render job id returned by betterpptx.avatar.render_job.' },
				avatarAsset: { type: 'string', minLength: 1, description: 'Opaque completed audiovisual asset reference returned by a succeeded Avatar talking-head job.' },
				script: { type: 'string', minLength: 1, description: 'The authored narration text to preserve in speaker notes; required even when attaching a completed asset.' },
				options: {
					type: 'object',
					additionalProperties: false,
					description: 'Semantic Avatar video playback options. The completed job supplies its poster; placement remains AI-owned through the authored presenter/media frame. Host filesystem paths are not accepted here.',
					properties: {
						objectName: { type: 'string', minLength: 1, maxLength: 256, description: 'Stable semantic name for the attached video target.' },
						interactivePlayback: { type: 'boolean', description: 'Whether the embedded talking-head video participates in the supported pause/resume interaction.' },
						mediaVolume: { type: 'number', minimum: 0, maximum: 100000, description: 'Native media volume value; use the endpoint-supported normalized or fixed-point representation.' },
						altText: { type: 'string', minLength: 1, maxLength: 4000, description: 'Accessible description of the talking-head audiovisual media.' },
						startDelayMs: { type: 'number', minimum: 0, maximum: 120000, description: 'Delay before the attached media begins, in milliseconds.' },
						playTrigger: { type: 'string', enum: ['withPrevious', 'afterPrevious', 'onClick'], description: 'Supported playback trigger for the attached media.' },
					},
				},
				reuseExistingNarration: { type: 'boolean', description: 'For an imported deck, reuse the slide narration clock instead of adding a second narration asset.' },
				replaceExistingNarrationWithVideo: { type: 'boolean', description: 'When the MP4 already contains the narration audio, replace the imported native audio node with the video while preserving the existing visual timing tree.' },
				cues: { type: 'array', description: 'Cue animations aligned to the avatar narration. atMs values are milliseconds from avatar media start.' },
				timing: { type: 'object', description: 'Optional spec-style timing contract: { startDelayMs, paddingMs, expectedDurationMs, timingToleranceMs, cues }. Explicit top-level fields override nested timing fields.' },
				expectedDurationMs: { type: 'number', description: 'Optional AI-authored expected media duration. Avatar validation flags drift beyond timingToleranceMs.' },
				timingToleranceMs: { type: 'number', description: 'Allowed drift between expectedDurationMs and resolved media duration. Defaults to max(250ms, 8% of expectedDurationMs).' },
				paddingMs: { type: 'number', default: 700 },
				startDelayMs: { type: 'number', default: 0 },
				mode: { type: 'string', enum: ['videoWithAudio'], default: 'videoWithAudio' },
			},
		},
	},
	{
		name: 'betterpptx.deck.add_avatar_narration',
		title: 'Add Avatar talking-head narration to multiple slides',
		description: 'Author Avatar talking-head audiovisual media on multiple slides. Each completed video contains the selected narration audio once; narration text remains editable in the final notes block and free user notes above it are preserved. This route is distinct from an existing native 3D presenter.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slides'],
			properties: {
				deckId: { type: 'string' },
				slides: { type: 'array', description: 'Array of { slideIndex, script|audio|jobId, avatar?, options?, cues?, timing? }. timing may contain startDelayMs, paddingMs, expectedDurationMs, timingToleranceMs, and cues.' },
				avatar: { type: 'object', description: 'Current-request selfie source applied to each generated talking head in this call. Ask the end user for the image and permission first; use {source:"uploaded",image:{data},consentAffirmed:true}. This is not a persistent or default avatar persona.' },
				avatarQuality: { type: 'string', enum: ['fast', 'default', 'quality'], default: 'default' },
				mode: { type: 'string', enum: ['videoWithAudio'], default: 'videoWithAudio' },
				tts: { type: 'object', description: 'Deck-level TTS defaults.' },
				autoplay: { type: 'object', description: 'Autoplay settings: { paddingMs, mode, loop }.' },
				voice: { type: 'string' },
				lang: { type: 'string' },
				gender: { type: 'string', enum: ['female', 'male'] },
				provider: { type: 'string' },
				paddingMs: { type: 'number' },
				billingConfirmed: { type: 'boolean' },
				billingOverride: { type: 'boolean' },
			},
		},
	},
	{
		name: 'betterpptx.slide.add_shape',
		title: 'Add a shape to a slide',
		description: 'Add any of 180+ geometry presets with the captured 77-tile native Shape Styles vocabulary through options.shapeStylePresetId and the complete captured Shape Effects vocabulary through options.shapeEffectPresetIds (one or more opaque IDs in execution order), plus gradient fill, line, animation, and hyperlink. For deterministic authoring, use this as geometry-only; add labels with slide.add_text or use deck.generate_from_spec kind:"textShape".',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'shapeName'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				shapeName: { type: 'string', enum: [...SHAPE_PRESET_GEOMETRIES], description: 'Executable native geometry preset. The enum is generated from the bundled ShapeType catalog.' },
				options: {
					type: 'object',
					description: 'ShapeProps with generated typed formatting. Preset bases execute first, ordered effect presets second, and explicit fields last. In update_shape, null removes the authored override and restores the selected preset/native base.',
					properties: {
						...SHAPE_FORMATTING_TOOL_SCHEMA.properties,
						x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' },
						objectName: { type: 'string' }, altText: { type: 'string' }, hyperlink: JSON.parse(JSON.stringify(HYPERLINK_PUBLIC_SCHEMA)), animation: { type: 'object' },
						rectRadius: { type: 'number' }, angleRange: { type: 'object' }, arcThicknessRatio: { type: 'number' }, points: { type: 'array' }, adjustments: { type: 'array' },
					},
					additionalProperties: true,
				},
				text: { type: 'string', description: 'Legacy optional text shorthand. Deterministic specs should not use shape text; use add_text or kind:"textShape" instead.' },
				textOptions: { type: 'object', description: 'Legacy text options when text is provided.' },
			},
		},
	},
	{
		name: 'betterpptx.slide.add_connector',
		title: 'Add a native connector to a slide',
		description: 'Add an editable PowerPoint connector (straight, elbow, or curved) with optional endpoint bindings, an exact connectorStylePresetId from the 42-tile native line gallery, and native glow, shadow, reflection or soft edges. This is a native connector object, distinct from a decorative line shape.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				options: {
					type: 'object',
					description: 'Typed connector options. The gallery base executes first; sparse line fields override it. Effect components are independent of the line and endpoints; null clears a component, while effects:null or effects:[] clears all connector effects.',
					properties: CONNECTOR_OPTION_TOOL_PROPERTIES,
					additionalProperties: false,
				},
				connectorStylePresetId: CONNECTOR_STYLE_SELECTOR_TOOL_SCHEMA,
				connectorType: { type: 'string', enum: ['straightConnector1', 'elbowConnector2', 'elbowConnector3', 'elbowConnector4', 'curvedConnector2', 'curvedConnector3', 'curvedConnector4'] },
				routing: { type: ['string', 'null'], enum: ['auto', 'straight', 'orthogonal', 'elbow', 'curved', null] },
				x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' },
				startShapeId: { type: 'number' }, startConnectionIndex: { type: 'number' },
				endShapeId: { type: 'number' }, endConnectionIndex: { type: 'number' },
				line: CONNECTOR_STYLE_LINE_TOOL_SCHEMA, objectName: { type: 'string' },
				...JSON.parse(JSON.stringify(CONNECTOR_EFFECT_PROPERTIES)),
			},
		},
	},
	{
		name: 'betterpptx.slide.add_group',
		title: 'Add a native editable group to a slide',
		description: 'Add a native PowerPoint group whose text, images, shapes, connectors, and nested groups remain individually editable and move together. Child geometry is local to its immediate parent group.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				options: { ...JSON.parse(JSON.stringify(STRUCTURAL_GROUP_SCHEMA)), description: 'Closed group options: bounds, chOff/chExt, and ordered mixed native children.' },
				children: { ...JSON.parse(JSON.stringify(STRUCTURAL_GROUP_SCHEMA.properties.children)), description: 'Optional mixed native child definitions. Text and pictures stay real editable group members; nested coordinates are parent-local.' },
				objectName: { type: 'string' },
			},
		},
	},
	{
		name: 'betterpptx.slide.add_comment',
		title: 'Add a native review comment',
		description: 'Add a native PowerPoint review comment without placing visible slide content. The comment is editable in the Review pane; coordinates and an optional target object provide the review anchor when the native package supports it.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'text'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				text: { type: 'string', minLength: 1 },
				author: { type: 'string', description: 'Review author display name.' },
				authorInitials: { type: 'string' },
				x: { type: 'number', description: 'Optional slide-space anchor x in inches.' },
				y: { type: 'number', description: 'Optional slide-space anchor y in inches.' },
				targetObjectName: { type: 'string', description: 'Optional semantic object name for the review anchor.' },
				status: { type: 'string', enum: ['open', 'resolved'], default: 'open' },
			},
		},
	},
	{
		name: 'betterpptx.slide.list_comments',
		title: 'List review comments',
		description: 'List native review threads known to the current deck, including imported comments and comments queued in this authoring session. Returns semantic review data only.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: { deckId: { type: 'string' }, slideIndex: { type: 'number' }, includeResolved: { type: 'boolean', default: true } },
		},
	},
	{
		name: 'betterpptx.slide.resolve_comment',
		title: 'Resolve a review comment',
		description: 'Mark a review comment resolved in the engine review state. The saved package carries the resolution as a native review update where supported, or a clearly typed audit record when the source dialect cannot store resolution safely.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'commentId'],
			properties: { deckId: { type: 'string' }, commentId: { type: 'string' }, note: { type: 'string' } },
		},
	},
	{
		name: 'betterpptx.slide.add_smartart',
		title: 'Add a SmartArt diagram',
		description: 'Add a SmartArt diagram. Native mode creates editable PowerPoint SmartArt with layout, style, color, semantic node applicability controls, and an accessible altText description, including reference-backed assistant roles for hierarchy layouts. Picture layouts require caller-provided images on every node; unsupported roles are rejected rather than masquerading as ordinary nodes. Shape mode remains available for an explicit editable shape-built fallback.',
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
				nodes: { type: 'array', maxItems: 1000, items: SMARTART_NODE_TOOL_SCHEMA, description: 'Closed SmartArt node labels or objects. Nested children preserve hierarchy; picture layouts require an image source on every applicable node.' },
				options: { ...JSON.parse(JSON.stringify(SMARTART_OPTIONS_PUBLIC_SCHEMA)), description: 'Closed SmartArt authoring options. Unknown/private keys are rejected; selector IDs are resolved against the native catalog and picture layouts enforce per-node images.' },
				x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' },
				title: { type: 'string' },
				altText: { type: 'string', description: 'Concise accessible description written to the SmartArt graphic frame.' },
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
		description: 'Add image by path, data URL, or remote URL. Remote URLs are fetched server-side and embedded into the PPTX package. Supports the 28 captured native Picture Styles and continuous native Picture Format controls: border, transparency, shadow, glow, reflection, soft edges, blur, fill overlay, and picture 3-D, plus corrections and artistic effects.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'options'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				options: {
					...JSON.parse(JSON.stringify(ADD_IMAGE_AUTHORING_CORE_SCHEMA)),
					description: 'Closed canonical image-authoring contract. source is required and immutable after creation; use slide.delete_shapes followed by add_image to replace it. Formatting components support explicit null resets where their schemas permit. pictureAdjuncts owns rounding, hyperlink, and native placeholder binding.',
				},
			},
		},
	},
	{
		name: 'betterpptx.slide.add_cameo',
		title: 'Add a cameo (live camera feed) to a slide',
		description: 'Add a native PowerPoint cameo: a live camera-feed object shown during a presentation. Renders the camera-glyph placeholder until a live show binds the camera. Default frame is an ellipse (circle) at 2.14"; pass options to position/size it or set a different frame shape.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				options: {
					type: 'object',
					description: 'CameoProps: x/y/w/h (defaults to a centered 2.14" circle), shape (preset geometry name such as ellipse|rect|roundRect, default "ellipse"), objectName, altText.',
				},
			},
		},
	},
	{
		name: 'betterpptx.slide.add_zoom',
		title: 'Add a Slide Zoom (zoom navigation) to a slide',
		description: 'Add a native PowerPoint Slide Zoom: a clickable thumbnail that jumps to a target slide during the show. Pass targetSlide (1-based slide index). A neutral placeholder thumbnail is used and PowerPoint refreshes the real preview on edit.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'options'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				options: {
					type: 'object',
					description: 'ZoomProps: targetSlide (1-based index of the slide to jump to; required), x/y/w/h (defaults to a centered 3.33"x1.875" frame), returnToParent (bool), transitionDur (ms, default 1000), objectName, altText, thumbnailDataUri (optional custom PNG/JPEG data URI).',
				},
			},
		},
	},
	{
		name: 'betterpptx.slide.add_section_zoom',
		title: 'Add a Section Zoom (zoom navigation to a section) to a slide',
		description: 'Add a native PowerPoint Section Zoom: a clickable thumbnail that jumps to a section during the show. Pass targetSection (the section title string, or its 1-based index). The deck must already have sections (pptx.addSection / betterpptx.deck.sections). A neutral placeholder thumbnail is used and PowerPoint refreshes the real preview on edit.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'options'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				options: {
					type: 'object',
					description: 'SectionZoomProps: targetSection (section title or 1-based section index; required), x/y/w/h (defaults to a centered 3.33"x1.875" frame), transitionDur (ms, default 1000), objectName, altText, thumbnailDataUri (optional custom PNG/JPEG data URI).',
				},
			},
		},
	},
	{
		name: 'betterpptx.deck.add_summary_zoom',
		title: 'Add a Summary Zoom (generated summary slide) to the deck',
		description: 'Add a native PowerPoint Summary Zoom: appends a generated summary slide with one clickable thumbnail per content section (grid layout), plus a "Summary Section". The deck must already have sections with slides (pptx.addSection + slide.add with sectionTitle). Neutral placeholder thumbnails are used and PowerPoint refreshes the real previews on edit. Returns summarySlideIndex.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				options: {
					type: 'object',
					description: 'SummaryZoomProps (all optional): sections (array of section titles or 1-based indices to include, in order; default = all content sections), summarySectionTitle (default "Summary Section"), transitionDur (ms, default 1000), objectName, altText, thumbnailDataUri (optional custom PNG/JPEG data URI).',
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
			additionalProperties: false,
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				chartType: { type: 'string', enum: [...CHART_SEMANTIC_TYPES], description: 'Exact semantic chart type. Preserve/replay-backed families require their governed exact package route.' },
				chartMulti: { ...JSON.parse(JSON.stringify(CHART_MULTI_PUBLIC_SCHEMA)), description: 'For combo charts: two to sixteen closed { type, data, options } descriptors. Mutually exclusive with chartType.' },
				data: { ...JSON.parse(JSON.stringify(CHART_DATA_PUBLIC_SCHEMA)), description: 'One to 128 bounded series. Scatter/bubble also accept xValues/yValues shorthand; the engine normalizes it before native serialization.' },
				chartPresetId: { type: 'string', description: 'Optional semantic chart preset.' },
				chartGalleryTilePresetId: { type: 'string', description: 'Optional opaque exact Ribbon tile id.' },
				chartStylePresetId: { type: 'string', description: 'Optional semantic Chart Design style preset id.' },
				chartGalleryVariant: { type: 'number' },
				chartStyleId: { type: 'number' },
				chartStyleModernId: { type: 'number' },
				chartColorStyleId: { type: 'number' },
				chartLayoutPresetId: { type: 'string' },
				chartTreatmentPresetId: { type: 'string' },
				chartTreatmentPresetIds: { type: 'array', items: { type: 'string' } },
				options: { ...JSON.parse(JSON.stringify(DIRECT_CHART_OPTIONS_PUBLIC_SCHEMA)), description: 'Closed typed native chart options plus governed selectors and native chart-placeholder carrier fields. Private raw-package fields are rejected.' },
			},
		},
	},
	{
		name: 'betterpptx.slide.add_table',
		title: 'Add a table to a slide',
		description: 'Add one native editable table through the closed bounded table-family contract. Choose exactly one semantic tablePresetId, opaque Table Design tableStylePresetId, or native tableStyleId; explicit table and cell options are last-wins. Rich cells, hyperlinks, fills, borders, dimensions, legal row/column spans, conditional flags, and deterministic auto paging are supported. Private/raw package fields are rejected before mutation.',
		inputSchema: JSON.parse(JSON.stringify(DIRECT_TABLE_ADD_PUBLIC_SCHEMA)),
	},
	{
		name: 'betterpptx.slide.add_media',
		title: 'Add audio/video media to a slide',
		description: 'Add native audio, embedded video, or online media through one closed source-first contract. type and source are required; mediaCommandTiming authors owned play, pause, or stop timing.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'options'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				options: {
					...JSON.parse(JSON.stringify(ADD_MEDIA_AUTHORING_CORE_SCHEMA)),
					description: 'Closed canonical media-authoring contract. type and one safe source are required. Poster, framing, playback, captions, accessibility, owned commands, and atomic source replacement remain editable through update_media.',
				},
			},
		},
	},
	{
		name: 'betterpptx.slide.add_narration',
		title: 'Add slide narration',
		description: 'Attach slide narration as native PowerPoint narration audio. Uses script->TTS or caller-provided audio, writes speaker notes, schedules cues on an absolute narration timeline, and sets slide advance timing in milliseconds. Visible subtitle objects are not created.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				script: { type: 'string', description: 'Narration script; also added to speaker notes.' },
				audio: { type: 'object', description: 'Provided audio: { path } or { data }, optional durationMs and extn. Non-WAV requires durationMs.' },
				cues: { type: 'array', description: 'Cue animations: [{ atMs, target:objectName|index, effect, type, duration, text? }]. The AI client authors these timestamps. atMs is milliseconds from narration audio start; narration cues serialize with withPrevious so timestamps are absolute, not cumulative.' },
				timing: { type: 'object', description: 'Optional spec-style timing contract: { startDelayMs, paddingMs, expectedDurationMs, timingToleranceMs, cues }. Explicit top-level fields override nested timing fields.' },
				expectedDurationMs: { type: 'number', description: 'Optional AI-authored expected media duration. validate_narration flags drift beyond timingToleranceMs.' },
				timingToleranceMs: { type: 'number', description: 'Allowed drift between expectedDurationMs and resolved media duration. Defaults to max(250ms, 8% of expectedDurationMs).' },
				voice: { type: 'string' },
				lang: { type: 'string' },
				gender: { type: 'string', enum: ['female', 'male'] },
				provider: { type: 'string' },
				narration: JSON.parse(JSON.stringify(NARRATION_PROVIDER_SCHEMA)),
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
		name: 'betterpptx.slide.add_avatar_narration',
		title: 'Add slide Avatar talking-head video',
		description: 'Author an Avatar talking-head audiovisual capture on a slide. The supplied narration script or audio and authorized source image produce one synchronized video-with-audio result; the engine writes editable frame/playback/timing controls and the final narration notes block while preserving free user notes. The talking head is audiovisual media, not a native editable 3D presenter.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				script: { type: 'string', description: 'Narration script; also added to speaker notes.' },
				audio: { type: 'object', description: 'Provided audio as data URI, with optional durationMs and extn. Non-WAV requires durationMs.' },
				avatar: {
					type: 'object',
					description: 'Current-request selfie source. Use an uploaded image with consentAffirmed true; there is no default presenter persona.',
					properties: {
						source: { type: 'string', enum: ['uploaded'] },
						image: { type: 'object' },
						consentAffirmed: { type: 'boolean' },
					},
				},
				renderMode: { type: 'string', enum: ['inline', 'job', 'completedAsset'], default: 'inline' },
				jobId: { type: 'string', description: 'Completed job id when renderMode is completedAsset.' },
				avatarAsset: { type: 'string', description: 'Completed opaque Avatar talking-head audiovisual asset reference returned by a succeeded render job.' },
				avatarQuality: { type: 'string', enum: ['fast', 'default', 'quality'], default: 'default' },
				mode: { type: 'string', enum: ['videoWithAudio'], default: 'videoWithAudio' },
				options: { type: 'object', description: 'Avatar video placement/media options: x,y,w,h,objectName,cover,interactivePlayback.' },
				cues: { type: 'array', description: 'Cue animations: [{ atMs, target:objectName|index, effect, type, duration, text? }]. The AI client authors these timestamps. atMs is milliseconds from avatar media start; narration cues serialize with withPrevious so timestamps are absolute, not cumulative.' },
				timing: { type: 'object', description: 'Optional spec-style timing contract: { startDelayMs, paddingMs, expectedDurationMs, timingToleranceMs, cues }. Explicit top-level fields override nested timing fields.' },
				expectedDurationMs: { type: 'number', description: 'Optional AI-authored expected media duration. Avatar/narration validation flags drift beyond timingToleranceMs.' },
				timingToleranceMs: { type: 'number', description: 'Allowed drift between expectedDurationMs and resolved media duration. Defaults to max(250ms, 8% of expectedDurationMs).' },
				voice: { type: 'string' },
				lang: { type: 'string' },
				gender: { type: 'string', enum: ['female', 'male'] },
				provider: { type: 'string' },
				speaker: { type: 'number' },
				lengthScale: { type: 'number' },
				noiseScale: { type: 'number' },
				noiseWScale: { type: 'number' },
				paddingMs: { type: 'number', default: 700 },
				startDelayMs: { type: 'number', default: 0 },
				billingConfirmed: { type: 'boolean' },
				billingOverride: { type: 'boolean' },
				allowUnreviewedVoices: { type: 'boolean', default: false },
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
				model3dViewPresetId: { type: ['string', 'null'], enum: [...MODEL3D_OPTIONS_PUBLIC_SCHEMA.properties.model3dViewPresetId.enum] },
				options: { ...JSON.parse(JSON.stringify(MODEL3D_OPTIONS_PUBLIC_SCHEMA)), description: 'Closed native 3-D authoring options. Use an opaque modelAsset handle and optional posterAsset. Choose a view preset/manual controls, or opt in to selected-motion framing through motionFraming.' },
			},
		},
	},
	{
		name: 'betterpptx.slide.add_freeform',
		title: 'Add a freeform / custGeom shape',
		description: 'Add an editable custom-geometry shape from vector commands (moveTo, lineTo, arcTo, cubicBezier, quadraticBezier, close). Coordinates are inches or percent strings inside the shape box. Use options for the full supported ShapeProps-style visual surface.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'x', 'y', 'w', 'h'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				options: { type: 'object', description: CUSTOM_GEOMETRY_OPTIONS_DESCRIPTION },
				x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' },
				points: {
					type: 'array',
					items: JSON.parse(JSON.stringify(STRUCTURAL_GEOMETRY_SCHEMA.properties.points.items)),
					description: 'Array of points in drawing order. Each entry is one of: { x, y, moveTo:true }, { x, y } (lineTo), { x, y, curve:{ type:"arc", hR, wR, stAng, swAng } }, { x, y, curve:{ type:"cubic", x1,y1,x2,y2 } }, { x, y, curve:{ type:"quadratic", x1,y1 } }, or { close:true }.',
				},
				paths: JSON.parse(JSON.stringify(STRUCTURAL_GEOMETRY_SCHEMA.properties.paths)),
				booleanOperation: JSON.parse(JSON.stringify(STRUCTURAL_GEOMETRY_SCHEMA.properties.booleanOperation)),
				operands: JSON.parse(JSON.stringify(STRUCTURAL_GEOMETRY_SCHEMA.properties.operands)),
				fill: { type: 'object', description: 'ShapeFillProps (solid or gradient).' },
				line: { type: 'object', description: 'ShapeLineProps.' },
				shadow: { type: 'object' },
				glow: { type: 'object' },
				reflection: { type: 'object' },
				softEdges: { type: 'object' },
				effect3D: { type: 'object', description: 'Shape 3D effect options.' },
				flipH: { type: 'boolean' },
				flipV: { type: 'boolean' },
				transparency: { type: 'number' },
				hyperlink: { type: 'object' },
				rotate: { type: 'number' },
				animation: { description: 'AnimationProps or array of them.' },
				objectName: { type: 'string' },
			},
		},
	},
	{
		name: 'betterpptx.slide.add_ink',
		title: 'Add ink-style annotation strokes',
		description: 'Add editable pen, marker, or highlighter strokes as PowerPoint-safe custom geometry. Use for drawn annotations, review markup, signatures, and hand-drawn emphasis without exposing internal XML.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				x: { type: 'number', default: 0.8, description: 'Left edge of the annotation box in inches.' },
				y: { type: 'number', default: 1.2, description: 'Top edge of the annotation box in inches.' },
				w: { type: 'number', default: 3.6, description: 'Width of the annotation box in inches.' },
				h: { type: 'number', default: 1.4, description: 'Height of the annotation box in inches.' },
				points: { type: 'array', description: 'Single stroke points. Use [{x,y}, ...] or full custGeom points. Defaults to a natural hand-drawn stroke.' },
				strokes: { type: 'array', description: 'Multiple strokes. Each item can be an array of points or { points, color, width, transparency, inkType, objectName }.' },
				coordinateMode: { type: 'string', enum: ['relative', 'box'], default: 'relative', description: 'relative treats point x/y as 0..1 inside the box; box treats x/y as local inches inside the box.' },
				inkType: { type: 'string', enum: ['pen', 'marker', 'highlighter'], default: 'pen' },
				color: { type: 'string', default: '2563EB' },
				width: { type: 'number', description: 'Stroke width in points. Defaults by inkType.' },
				transparency: { type: 'number', description: 'Line transparency percent. Defaults by inkType.' },
				objectName: { type: 'string' },
				animation: { description: 'AnimationProps or array of them.' },
				options: { type: 'object', description: 'Optional ShapeProps-style overrides shared by all strokes.' },
			},
		},
	},
	{
		name: 'betterpptx.slide.add_laser_pointer',
		title: 'Add laser pointer overlay',
		description: 'Add an editable laser pointer beam/path with glow, optional pointer dot, and optional animation timing. Also covers clients that ask for "lazer" pointer effects.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				x: { type: 'number', default: 0.8, description: 'Left edge of the pointer path box in inches.' },
				y: { type: 'number', default: 1.0, description: 'Top edge of the pointer path box in inches.' },
				w: { type: 'number', default: 4.2, description: 'Width of the pointer path box in inches.' },
				h: { type: 'number', default: 2.4, description: 'Height of the pointer path box in inches.' },
				points: { type: 'array', description: 'Pointer path points. Defaults to a curved sweep ending at the target dot.' },
				coordinateMode: { type: 'string', enum: ['relative', 'box'], default: 'relative' },
				color: { type: 'string', default: 'FF2D55' },
				width: { type: 'number', default: 2.4 },
				transparency: { type: 'number', default: 0 },
				glow: { type: 'object', description: 'Glow effect override, e.g. { size: 14, color: "FF2D55", opacity: 0.75 }.' },
				dot: { type: 'boolean', default: true, description: 'Add a glowing target dot at the final path point.' },
				durationMs: { type: 'number', description: 'Animation duration for the beam in milliseconds.' },
				startDelayMs: { type: 'number', default: 0 },
				static: { type: 'boolean', description: 'Render the editable annotation as a static self-demonstration without an autoplay animation.' },
				objectName: { type: 'string' },
				animation: { description: 'AnimationProps or array of them. Defaults to a wipe-style afterPrevious animation.' },
				options: { type: 'object', description: 'Optional ShapeProps-style overrides for the beam.' },
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
		name: 'betterpptx.deck.analyze_reference',
		title: 'Analyze an uploaded or in-memory reference deck',
		description: 'Create a public-safe reference analysis with slide/object inventory, theme-level summary, and an opaque referenceHandle. Does not expose package markup or private implementation details.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				detail: { type: 'string', enum: ['summary', 'full'], default: 'summary' },
			},
		},
	},
	{
		name: 'betterpptx.deck.recreate_reference',
		title: 'Recreate a reference deck as editable PowerPoint content',
		description: 'Inspection-only reference analysis. Construction is intentionally disabled here; compile an exact Authoring Excellence JSON spec through betterpptx.deck.generate_from_spec. The consuming AI owns geometry, styling, layering, and timing; BetterPPTX validates and serializes the submitted composition.',
		inputSchema: {
			type: 'object',
			properties: {
				referenceHandle: { type: 'string' },
				deckId: { type: 'string', description: 'Reference deck id when a handle has not been created yet.' },
				dryRun: { type: 'boolean', default: false },
				detail: { type: 'string', enum: ['summary', 'full'], default: 'summary' },
			},
		},
	},
	{
		name: 'betterpptx.deck.compare_reference',
		title: 'Compare a recreation candidate with a reference analysis',
		description: 'Compare supported public-safe reference summary signals against a generated deck and return slide-level mismatch summaries plus recommended next actions.',
		inputSchema: {
			type: 'object',
			required: ['generatedDeckId'],
			properties: {
				referenceHandle: { type: 'string' },
				referenceDeckId: { type: 'string' },
				generatedDeckId: { type: 'string' },
			},
		},
	},
	{
		name: 'betterpptx.deck.preview',
		title: 'Render deck preview images',
		description: 'After current-version validation passes, freeze the public PPTX package and render pixel-faithful PNG previews through PowerPoint. Renders at most 12 slides per call, reports exact rendered and remaining indexes without silent truncation, and keeps every batch bound to one packageSha256 and validationEvidenceSha256 until a semantic mutation changes the deck version. Optional includeNativeModelPreviews publishes verified transparent 3D-object previews as opaque poster assets for a subsequent public spec; these do not replace native models or certify animation playback. If authoritative PowerPoint rendering is not configured, the tool fails closed with an external-infrastructure capability blocker.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				slides: { type: 'array', uniqueItems: true, items: { type: 'integer', minimum: 0 }, description: 'Optional zero-based slide indexes. The call renders the first batch of at most 12 requested indexes and reports every still-unpreviewed index. When omitted, it renders the next unpreviewed batch (the first batch on the initial call).' },
				width: { type: 'number', default: 1280, description: 'Output image width in pixels.' },
				includeNativeModelPreviews: { type: 'boolean', default: false, description: 'Also publish each verified 3D-object appearance as a transparent PNG with an opaque posterAsset, download link, exact frame, and pose/view binding. Reuse only on that same model, stopped pose, view, and frame in a new public specification, then revalidate and preview. A trusted matching poster can prove static appearance only; its evidence explicitly leaves live native hydration unverified and playback not verified.' },
			},
		},
	},
	{
		name: 'betterpptx.deck.inspect_layouts',
		title: 'Inspect deck layouts, masters, and sections',
		description: 'Return presentation layout presets, slide master/layout summaries, per-slide layout binding, and section membership without exposing private implementation details.',
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
		name: 'betterpptx.deck.export_spec',
		title: 'Export opened deck to BetterPPTX spec',
		description: 'Export a public-safe BetterPPTX JSON spec. mode:"current" reconstructs the current editable deck; authoredInput and effectivePrecompile return immutable authoring artifacts captured from the exact JSON-spec workflow. Optional download:true publishes a portable .betterpptx-spec.json artifact that a person can give directly to another AI.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				mode: { type: 'string', enum: ['current', 'authoredInput', 'effectivePrecompile'], default: 'current', description: 'current reconstructs the deck; authoredInput returns the parsed submitted JSON; effectivePrecompile returns the exact deterministic object immediately before plan compilation.' },
				deckVersion: { type: 'number', description: 'Optional historical deck version for an immutable authored/effective artifact.' },
				download: { type: 'boolean', default: false, description: 'Publish the exported spec (any mode, including current) as a portable JSON download artifact.' },
				fileName: { type: 'string', description: 'Optional public filename for the JSON download artifact.' },
				title: { type: 'string', description: 'Optional title override for the exported spec.' },
				detail: { type: 'string', enum: ['summary', 'full'], default: 'summary', description: 'summary returns compact editability rows; full includes the full public editability map.' },
			},
		},
	},
	{
		name: 'betterpptx.spec.export_bundle',
		title: 'Export a portable BetterPPTX source bundle',
		description: 'Export the selected immutable BetterPPTX source stage as a deterministic .betterpptx bundle. The bundle contains a canonical logical source spec, a source lock, and embedded content-addressed assets; runtime session handles and server paths are never placed in the bundle.',
		inputSchema: {
			type: 'object',
			anyOf: [{ required: ['deckId'] }, { required: ['specHandle'] }],
			properties: {
				deckId: { type: 'string' },
				specHandle: { type: 'string', description: 'Optional opaque JSON-spec handle returned by assets.upload. When supplied, the source is archived directly without compiling a deck.' },
				mode: { type: 'string', enum: ['authoredInput', 'effectivePrecompile', 'current'], default: 'effectivePrecompile' },
				deckVersion: { type: 'number', description: 'Optional immutable deck version for authoredInput/effectivePrecompile.' },
				profile: { type: 'string', enum: ['source-only'], default: 'source-only' },
				download: { type: 'boolean', default: true, description: 'Publish the bundle as a client-downloadable artifact.' },
				fileName: { type: 'string', description: 'Optional user-facing .betterpptx filename.' },
				title: { type: 'string', description: 'Optional bundle title.' },
			},
		},
	},
	{
		name: 'betterpptx.bundle.inspect',
		title: 'Inspect a BetterPPTX source bundle',
		description: 'Verify a .betterpptx source bundle manifest, member digests, canonical source digest, ZIP safety limits, portability grade, and required capabilities without compiling or exposing server internals.',
		inputSchema: {
			type: 'object',
			required: [],
			anyOf: [{ required: ['file'] }, { required: ['data'] }, { required: ['url'] }],
			properties: {
				file: { type: 'string', description: 'Attach the .betterpptx file through the host connector.' },
				data: { type: 'string', description: 'Base64 data URI alternative when a connector attachment is unavailable.' },
				url: { type: 'string', description: 'HTTPS URL alternative.' },
			},
		},
		_meta: { 'openai/fileParams': ['file'] },
	},
	{
		name: 'betterpptx.bundle.import',
		title: 'Import a BetterPPTX source bundle',
		description: 'Verify and import a portable .betterpptx source bundle in the current session, bind embedded assets to opaque handles, and return a specHandle for the governed JSON-spec dryRun/resolve/commit workflow.',
		inputSchema: {
			type: 'object',
			required: [],
			anyOf: [{ required: ['file'] }, { required: ['data'] }, { required: ['url'] }],
			properties: {
				file: { type: 'string', description: 'Attach the .betterpptx file through the host connector.' },
				data: { type: 'string', description: 'Base64 data URI alternative when a connector attachment is unavailable.' },
				url: { type: 'string', description: 'HTTPS URL alternative.' },
			},
		},
		_meta: { 'openai/fileParams': ['file'] },
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
		description: 'Score a deck against modern design expectations separately from package validity: gradients, shadows/depth, accent palette, text hierarchy, visual proof, expressive 3D pose, motion, narration/notes/timing, and two-slide Morph preview object-kind coverage. Use this after deck.validate and validate_narration for generated decks.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				profile: { type: 'string', enum: ['modern', 'narrated', 'static'], default: 'modern' },
				minScore: { type: 'number', description: 'Required score from 0-100. Defaults to 70 for modern, 80 for narrated.' },
				requireNarration: { type: 'boolean', description: 'Require narration coverage on every slide.' },
				requireMotion: { type: 'boolean', description: 'Require motion coverage across the story.' },
				requireVisualProof: { type: 'boolean', description: 'Require charts, data/KPI blocks, images, 3D assets, process, or architecture visuals.' },
				requireExpressive3D: { type: 'boolean', description: 'Require embedded 3D models to use expressive pose/rotation and 3D motion coverage.' },
			},
		},
	},
	{
		name: 'betterpptx.deck.validate_accessibility',
		title: 'Validate basic presentation accessibility',
		description: 'Check slide titles, image alt text, chart/table summaries, reading-order basics, and fixable accessibility issues. Findings include exact fix tools and example semantic patches where possible.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				mode: { type: 'string', enum: ['basic', 'strict'], default: 'basic' },
			},
		},
	},
	{
		name: 'betterpptx.deck.validate_native_visuals',
		title: 'Validate native visual fidelity',
		description: 'Verify native visual primitives, atmosphere decomposition, owner-linked support layers, and the absence of whole-slide screenshots. Renderer-free production validation uses deterministic package and structural evidence. Desktop PowerPoint reopen evidence is optional application/release qualification and is required only when explicitly requested.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				profile: { type: 'string', enum: ['native-visuals', 'g6b-ai-reconstruction'], default: 'native-visuals', description: 'native-visuals performs renderer-free production structural validation. g6b-ai-reconstruction additionally checks reconstruction-route eligibility; application reopen evidence is required only when requireAuthoritativeReopen is true.' },
				requireAuthoritativeReopen: { type: 'boolean', default: false, description: 'Optional release/application qualification gate. When true, fail closed until desktop PowerPoint reopen evidence exists. When false, production validation remains renderer-free and does not claim per-artifact visual inspection.' },
				requireAiReconstructionRoute: { type: 'boolean', default: false, description: 'When true, fail unless the deck was authored through the principal visualReference-ai route. Required for G6B AI-reconstruction certification; htmlConversion is intentionally ineligible.' },
			},
		},
	},
	{
		name: 'betterpptx.deck.validate_quality',
		title: 'Validate presentation quality',
		description: 'Run the aggregate MCP quality gate for generated or edited presentations. Combines package/layout validation, modern design scoring, accessibility checks, narration timing/package validation when required or present, and returns functional quality guidance without relying on local client skills.',
		inputSchema: {
			type: 'object',
			required: ['deckId'],
			properties: {
				deckId: { type: 'string' },
				profile: { type: 'string', enum: ['modern', 'narrated', 'static'], default: 'modern', description: 'Quality profile. narrated requires narration coverage, speaker notes, and valid timing.' },
				minScore: { type: 'number', description: 'Optional design score threshold passed through to validate_design.' },
				mode: { type: 'string', enum: ['lenient', 'normal', 'strict'], default: 'normal', description: 'Package/layout validation mode.' },
				accessibilityMode: { type: 'string', enum: ['basic', 'strict'], default: 'basic' },
				requireNarration: { type: 'boolean', description: 'Override whether narration is required on every slide.' },
				requireMotion: { type: 'boolean', description: 'Override whether motion is required across the story.' },
				requireVisualProof: { type: 'boolean', description: 'Override whether concrete proof visuals are required.' },
				requireExpressive3D: { type: 'boolean', description: 'Override whether 3D assets need expressive non-flat pose/motion coverage.' },
				filePath: { type: 'string', description: 'Optional saved PPTX path for narration package inspection. Public clients normally omit this and use the in-memory deck.' },
				compression: { type: 'boolean', default: true },
			},
		},
	},
	{
		name: 'betterpptx.deck.validate_narration',
		title: 'Validate narration package XML',
		description: 'Serialize or inspect a saved deck and verify native PowerPoint narration media plus authored timing alignment: p:audio isNarration="1", showWhenStopped="0", onStopAudio timing, mediacall playFrom commands, notes, showNarration/useTimings, cue-target application, expected-duration drift, and slide advTm covering audio, cues, and padding.',
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
		name: 'betterpptx.deck.validate_avatar_narration',
		title: 'Validate Avatar talking-head package media and timing',
		description: 'Serialize or inspect a deck and deterministically verify Avatar talking-head video/audio tracks, measured duration metadata, package relationships, poster, video timing nodes, media playback commands, notes, and slide advance timing. This inspection is not a PowerPoint visual or perceptual lip-sync review.',
		inputSchema: JSON.parse(JSON.stringify(MEDIA_AVATAR_PUBLIC_OPERATION_SCHEMAS['betterpptx.deck.validate_avatar_narration'])),
	},
	{
		name: 'betterpptx.deck.save',
		title: 'Publish the approved deck artifact',
		description: PUBLIC_BLACK_BOX_SCHEMA
			? 'Publish an approved PPTX artifact under the deployment-selected verification policy. Release qualification requires current-version deterministic validation plus a complete PowerPoint preview of the exact frozen package; production-non-rendering intentionally has no hosted PowerPoint dependency and requires deterministic package, media, timing, accessibility, and selection validation instead. One logical save requires one stable idempotencyKey; retries with identical arguments do not publish twice. New files default to 12-hour retention, with a browser download link valid until that file expiry. Keep an owned copy before expiry. Read-only recovery with the saved operationId does not extend retention or consume another publication.'
			: 'Serialize the deck as .pptx, .potx, or .thmx when theme export is available. Local maintainer behavior remains available without the public preview-freeze requirement.',
		inputSchema: {
			type: 'object',
			required: PUBLIC_BLACK_BOX_SCHEMA ? ['deckId', 'idempotencyKey'] : ['deckId'],
			properties: {
				deckId: { type: 'string' },
				deckVersion: { type: 'integer', minimum: 0, description: 'Optional current deck version returned by the commit or latest readback. The public service binds the current version automatically when omitted and rejects a save if a queued semantic mutation makes it stale.' },
				idempotencyKey: { type: 'string', minLength: 1, maxLength: 160, pattern: '^[A-Za-z0-9._:-]+$', description: PUBLIC_BLACK_BOX_SCHEMA ? 'Required stable key for one logical save. A same-key identical replay can recover original artifact metadata after transport uncertainty, but strict first-time-right certification ends when a retry is needed.' : 'Optional client retry key. Repeating deck.save with the same key and same arguments returns the same saved artifact metadata instead of publishing another artifact.' },
				fileName: { type: 'string', description: PUBLIC_BLACK_BOX_SCHEMA ? 'Optional suggested download filename. Public clients provide a name only, never a server path.' : 'Output filename (or absolute path). Defaults to betterpptx_<deckId>.pptx in the current directory.' },
				outputFormat: { type: 'string', enum: PUBLIC_BLACK_BOX_SCHEMA ? ['pptx'] : ['pptx', 'potx', 'thmx'], default: 'pptx', description: PUBLIC_BLACK_BOX_SCHEMA ? 'Public publication uses pptx. Whether PowerPoint preview is required is selected by deployment policy, not by the client specification.' : 'pptx exports a normal presentation. potx exports a PowerPoint template package. thmx exports a theme-only package when available.' },
				...(PUBLIC_BLACK_BOX_SCHEMA ? {} : {
					outputDir: { type: 'string', description: 'Optional local directory used when fileName is a bare filename.' },
					format: { type: 'string', enum: ['pptx', 'potx', 'thmx'], description: 'Alias for outputFormat.' },
					compression: { type: 'boolean', default: true },
				}),
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
				kind: { type: 'string', enum: ['model3d', 'model', 'glb', 'icon', 'shapeScene', 'customShape', 'customGeometry', 'customGeom', 'freeform'], description: 'Optional asset category filter. shapeScene returns scene-level references; customShape/customGeometry/customGeom/freeform return individual editable custom-geometry handles.' },
				query: { type: 'string', description: 'Optional semantic search across titles, categories, use roles, and AI-facing intent collections. Abstract prompts such as "executive growth strategy" or "cybersecurity risk" are expanded to concrete catalog objects.' },
				intent: { type: 'string', description: 'Optional high-level presentation intent such as strategy, growth, finance, security, technology, health, education, operations, environment, people, travel, or visual emphasis.' },
				useCase: { type: 'string', description: 'Optional slide/story context used with query and intent to rank the best object.' },
				aiContext: { type: 'string', description: 'Optional broader deck context for AI ranking when the exact object is not obvious.' },
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
		name: 'betterpptx.assets.upload',
		title: 'Upload presentation media, an HTML-conversion package, or a JSON spec',
		description: 'Accept a host connector file, data URI, or HTTPS URL and return an opaque handle. Media assets and portable JSON specs support the primary AI authoring route. kind:"htmlPackage" exists only for the explicitly selected secondary htmlConversion route.',
		inputSchema: {
			type: 'object',
			required: ['kind'],
			anyOf: [
				{ required: ['file'] },
				{ required: ['data'] },
				{ required: ['url'] },
			],
			$defs: {
				OpenAIFile: {
					type: 'object',
					properties: {
						download_url: { type: 'string' },
						file_id: { type: 'string' },
						mime_type: { type: 'string' },
						file_name: { type: 'string' },
					},
					required: ['download_url', 'file_id'],
					additionalProperties: false,
				},
			},
			properties: {
				kind: { type: 'string', enum: ['video', 'audio', 'image', 'media', 'htmlPackage', 'jsonSpec'], description: 'Declared artifact class. htmlPackage is secondary automatic conversion input; jsonSpec is a portable betterpptx.deck-spec.v1 file.' },
				file: {
					type: 'string',
					description: 'Host connector file containing the uploaded media asset or JSON spec. Attach the conversation file here. The host replaces sandbox paths with an authorized file reference. Do not paste Base64 into this field.',
				},
				data: { type: 'string', description: 'Optional Base64 data URI when the host cannot attach a connector file, for example data:application/zip;base64,... .' },
				url: { type: 'string', description: 'HTTPS URL alternative to data or file.' },
				fileName: { type: 'string', description: 'Optional user-facing filename hint used only to infer an extension when the MIME type is generic.' },
				entryFile: { type: 'string', description: 'HTML entry point for a secondary htmlPackage conversion, normally index.html.' },
				durationMs: { type: 'number', description: 'Optional duration hint. Audio/video are probed when possible.' },
			},
		},
		_meta: { 'openai/fileParams': ['file'] },
		annotations: { title: 'Upload a presentation media asset or JSON spec', readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: true },
	},
	{
		name: 'betterpptx.assets.inspect',
		title: 'Inspect a secondary HTML-conversion package',
		description: 'Inspect an uploaded htmlPackage without converting it. This supports only the optional automatic htmlConversion route; it is not part of the primary AI reconstruction workflow.',
		inputSchema: {
			type: 'object', required: ['handle'], additionalProperties: false,
			properties: { handle: { type: 'string' }, entryFile: { type: 'string' } },
		},
		annotations: { title: 'Inspect an HTML-conversion package', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
	},
	{
		name: 'betterpptx.assets.search_stock',
		title: 'Search licensed stock photos, illustrations, videos, and audio',
		description: 'Search commercially-licensed stock media (photos, illustrations, vectors, videos, CC0 audio for music beds/SFX) and receive opaque stock:// handles plus author and license facts. Use a returned handle directly as the image/media source in the deck spec (content[].image, or content[].path on a kind:"media" block — audio handles embed as slide audio). The license record is kept with the deck automatically. All results allow commercial use without attribution. Photo + illustration search works with NO setup via the free Openverse provider (CC0-only, no API key); Pexels/Pixabay/Freesound add breadth when their free keys are set.',
		inputSchema: {
			type: 'object',
			required: ['query'],
			properties: {
				query: { type: 'string', description: 'What the visual/sound should convey, e.g. "team collaborating whiteboard", "city skyline dusk", or "upbeat corporate background".' },
				kind: { type: 'string', enum: ['photo', 'illustration', 'vector', 'video', 'audio'], default: 'photo' },
				provider: { type: 'string', enum: ['any', 'pexels', 'pixabay', 'freesound', 'openverse'], default: 'any' },
				orientation: { type: 'string', enum: ['landscape', 'portrait', 'square'], description: 'Optional orientation filter.' },
				perPage: { type: 'number', default: 8, description: 'Results per provider (max 24).' },
			},
		},
	},
	{
		name: 'betterpptx.assets.generate_image',
		title: 'Generate a bespoke presentation image from text',
		description: 'Create or revise a presentation image and receive an opaque durable gen:// handle when the selected deployment permits the governed route. Production may use this route when the caller is authorized and the provider is ready; PowerPoint preview is not required for production media validation. Use capability:"create" for a new visual from text or edit/reference capabilities with durable referenceHandles; generation is metered and identical requests reuse the tenant-safe cached handle. The handle must resolve to the exact image bytes before packaging. Prefer native editable content when that better expresses the requested meaning.',
		inputSchema: JSON.parse(JSON.stringify(MEDIA_AVATAR_PUBLIC_OPERATION_SCHEMAS['betterpptx.assets.generate_image'])),
	},
	{
		name: 'betterpptx.custom_geometry.catalog',
		title: 'Catalog editable custom geometry',
		description: 'Return built-in editable custom-geometry specimens as opaque customShape:// handles. Use inspect to preview the shape payload or insert to place it as a native, tweakable PowerPoint custom geometry shape.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Optional semantic search across shape names, tags, and source labels.' },
				q: { type: 'string', description: 'Alias for query.' },
				useCase: { type: 'string', description: 'Optional slide/story context used with query to rank the best shape.' },
				sceneHandle: { type: 'string', description: 'Optional shapeScene:// handle to restrict results to one scene.' },
				slideNumber: { type: 'number', description: 'Optional reference slide number filter.' },
				slide: { type: 'number', description: 'Alias for slideNumber.' },
				minPoints: { type: 'number', description: 'Minimum geometry command count.' },
				maxPoints: { type: 'number', description: 'Maximum geometry command count.' },
				limit: { type: 'number', default: 30, description: 'Maximum number of shapes to return.' },
				maxResults: { type: 'number', description: 'Alias for limit.' },
				format: { type: 'string', enum: ['summary', 'full'], default: 'summary', description: 'summary returns compact metadata; full includes a small object summary.' },
			},
		},
	},
	{
		name: 'betterpptx.custom_geometry.inspect',
		title: 'Inspect editable custom geometry',
		description: 'Resolve a customShape:// handle and return a ready-to-use custom-geometry object. Optional overrides preview how the shape will be materialized, including path scaling, path replacement, and any supported ShapeProps options.',
		inputSchema: {
			type: 'object',
			required: ['handle'],
			properties: {
				handle: { type: 'string', description: 'customShape:// handle returned by betterpptx.custom_geometry.catalog or assets.catalog.' },
				includePoints: { type: 'boolean', default: true, description: 'When false, omit the point payload and return only the point count.' },
				...CUSTOM_GEOMETRY_EDITABLE_PROPS,
			},
		},
	},
	{
		name: 'betterpptx.custom_geometry.insert',
		title: 'Insert editable custom geometry',
		description: 'Insert a customShape:// library specimen onto a slide as a native editable PowerPoint custom-geometry shape. Pass options for any supported ShapeProps tweak; x/y/w/h rescale the stored path, or pass points to replace/edit it.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'handle'],
			properties: {
				deckId: { type: 'string', description: 'Deck identifier returned by betterpptx.deck.new or open tools.' },
				slideIndex: { type: 'number', description: 'Zero-based slide index.' },
				handle: { type: 'string', description: 'customShape:// handle returned by betterpptx.custom_geometry.catalog or assets.catalog.' },
				...CUSTOM_GEOMETRY_EDITABLE_PROPS,
			},
		},
	},
	{
		name: 'betterpptx.custom_geometry.from_svg',
		title: 'Compile SVG to editable custom geometry',
		description: 'Convert inline SVG markup or SVG path data into BetterPPTX custom-geometry points using svgpath normalization. Returns a native custGeom payload ready for slide.add_freeform or custom_geometry.insert_svg.',
		inputSchema: {
			type: 'object',
			properties: SVG_CUSTOM_GEOMETRY_COMPILE_PROPS,
		},
	},
	{
		name: 'betterpptx.custom_geometry.insert_svg',
		title: 'Insert SVG as editable custom geometry',
		description: 'Convert inline SVG markup or SVG path data into native editable PowerPoint custom geometry and insert it onto a slide. Styling, rotation, effects, animation, hyperlinks, objectName, and other ShapeProps tweaks are accepted like slide.add_freeform.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex'],
			properties: {
				deckId: { type: 'string', description: 'Deck identifier returned by betterpptx.deck.new or open tools.' },
				slideIndex: { type: 'number', description: 'Zero-based slide index.' },
				...CUSTOM_GEOMETRY_EDITABLE_PROPS,
				...SVG_CUSTOM_GEOMETRY_SOURCE_PROPS,
				points: { type: 'array', description: 'Ignored by insert_svg; SVG source data supplies the editable geometry path.' },
			},
		},
	},
	{
		name: 'betterpptx.assets.generate_model3d',
		title: 'Select or import a presentation-ready 3D model asset',
		description: 'Select a slide-ready 3D model from assets.catalog first, then optionally import a compatible Sketchfab CC0 or CC-BY model. Returns opaque asset handles plus ready-to-use slide.add_model3d options; it does not synthesize new model geometry.',
		inputSchema: MODEL3D_GENERATE_INPUT_SCHEMA,
	},
	{
		name: 'betterpptx.assets.generate_rigged3d',
		title: 'Generate experimental rigged persona',
		description: 'Generate an experimental personalized rigged 3D persona from authorized multiview full-body images. Explicit experimental opt-in and an idempotency key are mandatory. Two to four uploaded image handles qualify for the bounded sponsored allowance (three completed generations per secured identity per rolling 30 days); prompt-only and single-view generation remain outside that free route. A returned handle is not production-ready until deformation, motion, packaging, identity/asset approval, and release evidence succeed.',
		inputSchema: {
			type: 'object',
			required: ['experimentalConfirmed', 'idempotencyKey'],
			properties: {
				experimentalConfirmed: { type: 'boolean', const: true, description: 'Required explicit opt-in for this experimental route. It does not grant production approval or bypass authorization, cost, identity, asset, or release gates.' },
				prompt: { type: 'string', description: 'Optional. If no image is supplied, a source image is generated from this prompt first, then converted to 3D.' },
				imageHandle: { type: 'string', description: 'Optional existing authorized image asset handle for a paid single-view route.' },
				imageUrl: { type: 'string', description: 'Optional URL of the source image (fetched through the safe remote-asset path).' },
				imageBase64: { type: 'string', description: 'Optional base64-encoded source image bytes (PNG/JPEG); a data: URI prefix is accepted and stripped.' },
				imageHandles: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string' }, description: 'Ordered 1-4 generated-image handles for a personalized humanoid: front first, then side/back views. Use exactly one plural image field.' },
				imageUrls: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string' }, description: 'Ordered 1-4 HTTPS PNG/JPEG URLs or PNG/JPEG data URIs for the same full-body person from different angles.' },
				imageBase64s: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string' }, description: 'Ordered 1-4 PNG/JPEG data URIs or base64 payloads for the same full-body person.' },
				heightMeters: { type: 'number', minimum: 0.1, default: 1.7, description: 'Approximate real height for personalized humanoid scaling and rigging.' },
				targetPolycount: { type: 'integer', minimum: 100, maximum: 300000, default: 220000, description: 'Experimental personalized rigged-persona triangle target; capped at 300,000 for the rigging service.' },
				hdTexture: { type: 'boolean', default: true, description: 'Use a 4K base-color texture for the experimental personalized rigged-persona path.' },
				style: { type: 'string', enum: ['photo', 'illustration', '3d'], description: 'Optional style steer for the generated source image when using prompt.' },
				rig: { type: 'boolean', default: true, description: 'Request skeleton and skin-weight generation. This stage is experimental and must pass downstream deformation and motion-compatibility checks before any presenter use.' },
				perform: { type: 'boolean', default: false, description: 'Request experimental presenter gesture clips in the generated asset. This does not establish native 3D-presenter compatibility or production approval.' },
				quality: { type: 'string', enum: ['ppt-lite', 'standard'], default: 'ppt-lite', description: 'ppt-lite: small low-poly deck-friendly GLB (fast PowerPoint import). standard: higher poly/texture for hero assets.' },
				force: { type: 'boolean', description: 'Bypass the in-session cache and regenerate (incurs new GPU compute cost).' },
				production: { type: 'boolean', default: false, description: 'Require the production native-3D route. When true, an ordered 1-4 full-body image array is mandatory and the self-hosted single-image PoC route fails closed.' },
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
		description: 'Open a user-uploaded PowerPoint file from base64/data-URL bytes into a fresh deckId. This is the public/chat-safe import path: no server filesystem path is required or exposed. Import and editing use the complete authoring vocabulary; only publication/provider value is subject to the rolling allowance or an explicit paid entitlement.',
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
				patch: {
					type: 'object',
					description: 'Sparse shape patch. Formatting nulls remove authored overrides and recompute the selected base; ordinary option keys retain deep-merge semantics.',
					properties: { ...SHAPE_FORMATTING_TOOL_SCHEMA.properties, connectorStylePresetId: CONNECTOR_STYLE_SELECTOR_TOOL_SCHEMA, line: CONNECTOR_STYLE_LINE_TOOL_SCHEMA, ...IMAGE_EXACT_LEAF_TOOL_PROPERTIES, sizing: IMAGE_FRAMING_TOOL_SCHEMA, pictureAdjuncts: JSON.parse(JSON.stringify(PICTURE_ADJUNCTS_SCHEMA)) },
					additionalProperties: true,
				},
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
		description: 'Mutate a structurally editable native table through closed typed sparse edits: replace rows, patch or reset table options and selectors, edit rich cells, or add/delete rows and columns. The final span grid is validated before the mutation commits. Raw passthrough tables can be converted only through the same closed rows/options contract.',
		inputSchema: JSON.parse(JSON.stringify(DIRECT_TABLE_UPDATE_PUBLIC_SCHEMA)),
	},
	{
		name: 'betterpptx.slide.update_chart',
		title: 'Edit native chart data and options',
		description: 'Mutate a structurally editable native chart in place by replacing its data, changing the chart type, and/or patching chart options. Preserved ChartEx passthrough charts are editable: the first update converts them to native editable ChartEx while untouched imports remain exact.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['deckId', 'slideIndex', 'target'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				target: { description: 'Chart selector: number, { index }, { rawIndex }, or { objectName }.' },
				chartType: { type: ['string', 'null'], enum: [...CHART_SEMANTIC_TYPES, null], description: 'Replacement semantic chart type.' },
				type: { type: ['string', 'null'], enum: [...CHART_SEMANTIC_TYPES, null], description: 'Alias for chartType.' },
				chartMulti: { ...JSON.parse(JSON.stringify(CHART_MULTI_PUBLIC_SCHEMA)), description: 'Replacement combo chart type/data descriptors.' },
				data: { ...JSON.parse(JSON.stringify(CHART_DATA_PUBLIC_SCHEMA)), description: 'Replacement bounded chart data.' },
				chartPresetId: { type: 'string', description: 'Optional semantic chart preset.' },
				chartGalleryTilePresetId: { type: 'string', description: 'Optional opaque exact Ribbon tile id.' },
				chartStylePresetId: { type: 'string', description: 'Optional semantic Chart Design style preset id.' },
				chartGalleryVariant: { type: 'number' },
				chartStyleId: { type: 'number' },
				chartStyleModernId: { type: 'number' },
				chartColorStyleId: { type: 'number' },
				chartLayoutPresetId: { type: 'string' },
				chartTreatmentPresetId: { type: 'string' },
				chartTreatmentPresetIds: { type: 'array', items: { type: 'string' } },
				optionsPatch: { ...JSON.parse(JSON.stringify(DIRECT_CHART_OPTIONS_PUBLIC_SCHEMA)), type: ['object', 'null'], description: 'Sparse typed patch. Null performs a full authored chart-options reset while preserving data, geometry, identity, and accessibility.' },
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
		description: 'Patch an existing audio/video shape and optionally add media play/pause/stop timing commands. Supports interactivePlayback and media timing volume. Maintainer mode can replace an imported recording payload while preserving its authored timing and annotation package.',
		inputSchema: {
			type: 'object',
			required: ['deckId', 'slideIndex', 'target'],
			properties: {
				deckId: { type: 'string' },
				slideIndex: { type: 'number' },
				target: { description: 'Media selector: number, { index }, { rawIndex }, or { objectName }.' },
				optionsPatch: {
					...JSON.parse(JSON.stringify(UPDATE_MEDIA_OPTIONS_PATCH_SCHEMA)),
					description: 'Typed sparse media patch. Null restores the selected resettable playback, framing, poster, caption, geometry, or accessibility component. Source replacement is atomic; source removal or online/packaged topology changes require delete plus add.',
				},
				...(PUBLIC_BLACK_BOX_SCHEMA ? {} : {
					replacementMediaPath: { type: 'string', description: 'Maintainer media replacement for an imported recording.' },
					coverDataUri: { type: 'string', description: 'Maintainer base64 poster replacement paired with replacementMediaPath.' },
				}),
				interactivePlayback: { type: 'boolean', description: 'Enable or disable click-on-media interactive playback sequence.' },
				volume: { type: 'number', description: 'Volume as 0-1, 0-100 percent, or 0-100000 PowerPoint units.' },
				command: { oneOf: [{ type: 'null' }, { type: 'string', pattern: '^(?:playFrom\\((?:0|[1-9]\\d*)(?:\\.\\d+)?\\)|togglePause|stop)$' }], description: 'Canonical native media command. Null removes BetterPPTX-owned generated commands for the target.' },
				mediaCommand: { oneOf: [{ type: 'null' }, { type: 'string', pattern: '^(?:playFrom\\((?:0|[1-9]\\d*)(?:\\.\\d+)?\\)|togglePause|stop)$' }], description: 'Alias for command.' },
				addCommand: { type: 'boolean', description: 'Add a default playFrom(0.0) command when command is omitted.' },
				trigger: { type: 'string', enum: ['onClick', 'withPrevious', 'afterPrevious'] },
				delay: { type: 'number' },
				duration: { type: 'number' },
				effect: { type: 'string', description: 'Optional animation effect label, e.g. mediaplay, mediapause, mediastop.' },
				replaceExistingCommands: { type: 'boolean', default: false, description: 'Remove existing generated media commands for the target before adding the new command.' },
				preserveExistingTiming: { type: 'boolean', default: false, description: 'Keep imported raw timing XML even if adding generated media commands.' },
				playback: { type: 'object', description: 'Nested alias object for command, trigger, delay, duration, volume, interactivePlayback, replaceExistingCommands, preserveExistingTiming.' },
				mediaCommandTiming: { ...JSON.parse(JSON.stringify(MEDIA_COMMAND_TIMING_SCHEMA)), description: 'Closed semantic media-command contract. Null removes only BetterPPTX-owned commands; omission preserves current timing.' },
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
				animation: { type: 'object', description: 'Native animation controls. Public motion paths are authored in slide space by default (positive X means slide-right); the compiler deterministically lowers them to native PowerPoint coordinates. Set motionPathCoordinateSpace to powerpoint only for an already-lowered native path. Motion paths accept motionEasing linear or smooth (default); null resets smooth. Grow/shrink accepts scaleX and scaleY multipliers (1 = unchanged) with scalar scale as fallback. Spin uses rotation in degrees; zero means no rotation and null resets the native default.', properties: { motionPathCoordinateSpace: { type: ['string', 'null'], enum: ['slide', 'powerpoint', null] }, motionEasing: { type: ['string', 'null'], enum: ['smooth', 'linear', null] }, scaleX: { type: ['number', 'null'], minimum: 0, maximum: 1000, multipleOf: 0.00001 }, scaleY: { type: ['number', 'null'], minimum: 0, maximum: 1000, multipleOf: 0.00001 }, rotation: { type: ['number', 'null'], minimum: -36000, maximum: 36000, multipleOf: 0.001 } } },
				names: { type: 'array', items: { type: 'string' }, description: 'Explicit unique object names, including native editable group descendants. Ambiguous names reject before mutation. Descendants are never implicitly selected by kind, index or an empty selector.' },
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
	deckId: 'Deck handle returned by deck.new or deck.open_uploaded.',
	slideIndex: 'Zero-based index of the target slide within the deck.',
	slideNumbers: 'Optional 1-based slide numbers to import (omit for all).',
	pptxPath: 'Absolute or relative path to a .pptx file on the server.',
	fileName: 'Output file name; ".pptx" is appended when saving normal presentations unless outputFormat:"potx" or outputFormat:"thmx" is selected.',
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
	for (const branch of schema.anyOf || schema.oneOf || schema.allOf || []) ensureDescriptions(branch)
	if (schema.$defs && typeof schema.$defs === 'object') {
		for (const def of Object.values(schema.$defs)) ensureDescriptions(def)
	}
}

// Standard result envelope (server.mjs sets structuredContent to exactly this).
// Keep the recovery contract explicit: schema-driven clients must not have to guess
// that code/retry/next_actions/details exist behind additionalProperties.
const ERROR_FINDING_SCHEMA = {
	type: 'object',
	description: 'Typed semantic correction finding; change the named semantic input and rerun the governed dry-run.',
	properties: {
		code: { type: 'string' },
		severity: { type: 'string', enum: ['info', 'warning', 'error'] },
		message: { type: 'string' },
		reason: { type: 'string' },
		fix: { type: 'string' },
		evidence: { type: 'object' },
		suggestions: { type: 'array' },
		next: { type: ['object', 'string', 'null'] },
	},
	additionalProperties: true,
}
const ERROR_SCHEMA = {
	type: 'object',
	description: 'Public error info and recovery contract (present when ok=false).',
	properties: {
		code: { type: 'string', description: 'Stable public error code.' },
		message: { type: 'string', description: 'Human-readable error message.' },
		recoverable: { type: 'boolean', description: 'Whether a corrected request or later retry can recover without discarding valid work.' },
		next_actions: { type: 'array', description: 'Concrete public actions for the AI or user.', items: { type: 'object', properties: { type: { type: 'string' }, tool: { type: 'string' }, description: { type: 'string' } }, additionalProperties: true } },
		retry_safe: { type: 'boolean', description: 'Whether retrying the same arguments is safe.' },
		retryable: { type: 'boolean', description: 'Alias of retry_safe for connector-file upload errors.' },
		requestId: { type: 'string', description: 'Request identifier for this failed call.' },
		acceptedInputFields: { type: 'array', items: { type: 'string' }, description: 'Upload fields the runtime accepts, typically file, data, and url.' },
		artifact_state: { type: 'string', description: 'What happened to the deck/artifact after the failed call.' },
		details: { type: 'object', description: 'Bounded evidence and typed findings for semantic correction.', properties: { errors: { type: 'array', items: ERROR_FINDING_SCHEMA }, warnings: { type: 'array', items: ERROR_FINDING_SCHEMA }, issues: { type: 'array', items: ERROR_FINDING_SCHEMA } }, additionalProperties: true },
	},
	required: ['code', 'message'],
	additionalProperties: true,
}
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
// Keep the Director readback nested schema explicit: a cold AI must be able to
// discover semantic-vs-engine ownership from metadata, not reverse-engineer it
// from one example response.
const AUTHORING_FINDING_SCHEMA = {
	type: 'object',
	description: 'A machine-readable authoring finding. Resolve it by changing semantic inputs, never by patching returned geometry.',
	properties: {
		code: { type: 'string' },
		severity: { type: 'string', enum: ['info', 'warning', 'error'] },
		message: { type: 'string' },
		reason: { type: 'string' },
		fix: { type: 'string' },
		evidence: { type: 'object' },
		suggestions: { type: 'array' },
		next: { type: ['object', 'string', 'null'], description: 'Optional next semantic correction or public tool recommendation.' },
	},
	additionalProperties: true,
}
const AUTHORING_OBJECT_READBACK_SCHEMA = {
	type: 'object',
	description: 'Engine readback for one compiled object. Semantic intent is separate from solved geometry.',
	properties: {
		objectName: { type: 'string' },
		editHandle: { type: 'string' },
		blockName: { type: 'string' },
		blockKind: { type: 'string' },
		role: { type: 'string' },
		placementSource: { type: 'string', enum: ['engine', 'author'] },
		placementIntentSource: { type: 'string', enum: ['engine-proposal', 'author-semantic-region', 'author-geometry'] },
		rect: { type: 'object', description: 'Engine-solved rectangle in slide units; readback only.' },
		region: { type: 'string' },
		altText: { type: 'string' },
		contentRepresentation: { type: 'object', description: 'Requested content kind, canonical kind, expected native representation, and planned representation before serialization.', additionalProperties: true },
	},
	additionalProperties: true,
}
const AUTHORING_VISUAL_BALANCE_SCHEMA = {
	type: 'object',
	description: 'Engine-measured semantic visual-weight readback. Review status and density before revising semantic inputs; never author the returned geometry.',
	properties: {
		contractVersion: { type: 'string', enum: ['authoring-excellence.visual-balance.v1'] },
		layoutIntent: { type: 'string' },
		mode: { type: 'string', enum: ['three-column', 'sidebar', 'two-column', 'arrange-split', 'arrange-grid', 'single-or-compact'] },
		status: { type: 'string', enum: ['balanced', 'review', 'imbalanced', 'underfilled', 'not-applicable'] },
		arrangementApplied: { type: 'boolean', description: 'Whether the requested semantic arrange split actually governed substantive blocks; readback only.' },
		regions: {
			type: 'object',
			additionalProperties: {
				type: 'object',
				properties: {
					availableArea: { type: 'number' },
					occupiedArea: { type: 'number' },
					density: { type: 'number' },
					blockCount: { type: 'number' },
					blocks: { type: 'array', items: { type: 'string' }, description: 'Semantic block names or kinds contributing to this region; readback only.' },
				},
				additionalProperties: false,
			},
		},
		densityRatio: { type: 'number' },
		occupiedRegionCount: { type: 'number' },
		totalRegionCount: { type: 'number' },
		totalSubstantiveBlocks: { type: 'number' },
		correction: { type: 'string' },
		note: { type: 'string' },
	},
	additionalProperties: false,
}
const AUTHORING_SLIDE_READBACK_SCHEMA = {
	type: 'object',
	description: 'Engine readback for one compiled slide.',
	properties: {
		slideId: { type: 'string' },
		slideIndex: { type: 'number' },
		layoutIntent: { type: 'string' },
		visualBalance: AUTHORING_VISUAL_BALANCE_SCHEMA,
		regions: { type: 'object', description: 'Named semantic hosts resolved by the engine.' },
		placeholderBinding: { type: ['object', 'string', 'null'], description: 'Template or placeholder binding readback when applicable.' },
		objects: { type: 'array', items: AUTHORING_OBJECT_READBACK_SCHEMA },
		warnings: { type: 'array', items: AUTHORING_FINDING_SCHEMA },
	},
	additionalProperties: true,
}
const AUTHORING_LAYOUT_RECOMMENDATIONS_SCHEMA = {
	type: 'object',
	description: 'Compatibility-named, unranked factual geometry readback for the AI-selected layoutIntent. The engine does not score or recommend a composition; do not copy returned rectangles into the spec.',
	properties: {
		slides: { type: 'array', items: { type: 'object', properties: {
			slideId: { type: 'string' },
			slideIndex: { type: 'number' },
			current: { type: 'string' },
			selectionStatus: { type: 'string', enum: ['ai-selected', 'legacy-compatibility-fallback'] },
			certificationEligible: { type: 'boolean' },
			unranked: { type: 'boolean' },
			proposals: { type: 'array', maxItems: 1, items: { type: 'object', properties: { layoutIntent: { type: 'string' }, status: { type: 'string', enum: ['selected-intent-factual-readback'] }, selectionSource: { type: 'string', enum: ['ai-selected', 'legacy-compatibility-fallback'] }, regions: { type: 'object', description: 'Engine-resolved region rectangles for readback only; never copy them into a Director spec.', additionalProperties: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } }, additionalProperties: false } }, assignment: { type: 'object', description: 'Factual semantic block-to-region assignment for the selected intent.', additionalProperties: { type: 'string' } }, assignmentRects: { type: 'object', description: 'Engine-owned rectangle readback for each semantic block assignment, including specialized slots such as metric-card; never copy into a Director spec.', additionalProperties: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } }, additionalProperties: false } } }, required: ['layoutIntent', 'status', 'selectionSource'], additionalProperties: true } },
			confidence: { type: 'string' },
		}, required: ['slideId', 'slideIndex', 'current', 'selectionStatus', 'certificationEligible', 'proposals', 'confidence', 'unranked'], additionalProperties: true } },
		contractVersion: { type: 'string' },
		selectionAuthority: { type: 'string', enum: ['ai'] },
		unranked: { type: 'boolean' },
		vocabulary: { type: 'array' },
		confirmVia: { type: 'string' },
	},
	required: ['contractVersion', 'selectionAuthority', 'unranked', 'slides', 'vocabulary', 'confirmVia'],
	additionalProperties: true,
}

const AUTHORING_PRESENTER_CONTRACT_SCHEMA = {
	type: 'object',
	description: 'Semantic presenter policy, narration clock, and readiness readback. Implementation-specific native flags and operation references are intentionally omitted from the public surface.',
	properties: {
		schemaVersion: { type: 'string' },
		identity: { type: ['string', 'object', 'null'] },
		policy: { type: 'object', properties: { modes: { type: 'array' }, fallback: { type: 'array' }, avoidDuplicatePresence: { type: 'boolean' }, reducedMotion: { type: 'string' } }, additionalProperties: false },
		clock: { type: 'object', properties: { source: { type: 'string' }, master: { type: 'string' }, shared: { type: 'boolean' } }, additionalProperties: false },
		timeline: { type: 'object', properties: { schemaVersion: { type: 'string' }, entries: { type: 'array', items: { type: 'object', properties: { slide: { type: 'number' }, slideId: { type: 'string' }, source: { type: 'string' }, script: { type: ['string', 'null'] }, startDelayMs: { type: 'number' }, paddingMs: { type: ['number', 'null'] }, expectedDurationMs: { type: ['number', 'null'] }, timingAuthority: { type: 'string' }, cues: { type: 'array' } }, additionalProperties: false } } }, additionalProperties: false },
		executionPlan: { type: 'object', properties: { schemaVersion: { type: 'string' }, motionPolicy: { type: 'string' }, entries: { type: 'array', items: { type: 'object', properties: { slide: { type: 'number' }, slideId: { type: 'string' }, mode: { type: 'string' }, active: { type: 'boolean' }, reason: { type: 'string' }, talkingHead: { type: 'boolean' }, fallback: { type: 'boolean' }, timingAuthority: { type: 'string' }, expectedDurationMs: { type: ['number', 'null'] }, timelineSource: { type: 'string' } }, additionalProperties: false } } }, additionalProperties: false },
		representations: { type: 'array', items: { type: 'object', properties: { slide: { type: 'number' }, slideId: { type: 'string' }, mode: { type: 'string' }, talkingHead: { type: 'boolean' }, duplicatePresence: { type: 'boolean' }, fallback: { type: 'string' } }, additionalProperties: false } },
		lanes: { type: 'object', properties: { talkingHead: { type: 'boolean' }, fallback: { type: 'boolean' } }, additionalProperties: false },
		warnings: { type: 'array', items: AUTHORING_FINDING_SCHEMA, description: 'Safe semantic presenter findings; each exposes reason, fix, and bounded evidence without native implementation details.' },
		ready: { type: 'boolean' },
	},
	additionalProperties: false,
}

const AUTHORING_PRESENTER_RUNTIME_SCHEMA = {
	type: 'object',
	description: 'Semantic presenter readiness and issue readback; internal operation references are not public.',
	properties: {
		schemaVersion: { type: 'string' },
		status: { type: 'string' },
		motionPolicy: { type: 'string' },
		entries: { type: 'array', items: { type: 'object', properties: { slide: { type: 'number' }, slideId: { type: 'string' }, mode: { type: 'string' }, active: { type: 'boolean' }, status: { type: 'string' }, missing: { type: 'array' }, timingAuthority: { type: 'string' }, expectedDurationMs: { type: ['number', 'null'] } }, additionalProperties: false } },
		issues: { type: 'array', items: { type: 'object', additionalProperties: true } },
		ready: { type: 'boolean' },
	},
	additionalProperties: false,
}

const AUTHORING_COMPLETENESS_READBACK_SCHEMA = {
	type: 'object',
	description: 'Mechanical completeness-tier readback. The AI remains the design authority; compatibility defaults are execution fallbacks and are not certifying creative choices.',
	properties: {
		contractVersion: { type: 'string' },
		requestedTier: { type: ['string', 'null'] },
		effectiveTier: { type: 'string' },
		defaultTier: { type: 'string' },
		defaultWorld: { type: ['string', 'null'], description: 'Null means no named World is selected by default.' },
		lastResortWorld: { type: ['string', 'null'], description: 'Null means no named aesthetic fallback is imposed.' },
		source: { type: 'string' },
		allowDowngrade: { type: 'boolean' },
		preferenceOrder: { type: 'array', items: { type: 'string' } },
		lastResortRules: { type: 'array', items: { type: 'string' } },
		selectionRule: { type: 'string' },
		forbiddenShortcuts: { type: 'array', items: { type: 'string' } },
		semanticOnly: { type: 'boolean' },
		readback: { type: 'string' },
	},
	additionalProperties: false,
}

const AUTHORING_GENERATION_DOMAIN_CONTRACT_SCHEMA = {
	type: 'object',
	description: 'Accepted authoring authority and optional Director domain contract echoed by the compiler.',
	properties: {
		workflow: { type: 'string', enum: ['ai-sovereign-v1', 'authoring-excellence-director-v1'] },
		creativeAuthority: { type: 'string', enum: ['ai', 'ai-with-director-assistance'] },
		directorMode: { type: 'string', enum: ['off', 'assisted'] },
		verificationMode: { type: 'string', enum: ['complete'] },
		creativeMutationPolicy: { type: 'string', enum: ['report-only-no-creative-rewrite', 'director-assistance-enabled'] },
		domains: {
			type: 'object',
			properties: {
				required: { type: 'array', items: { type: 'string' } },
				contentStory: { type: 'string' },
				visualDesign: { type: 'string' },
				motionTime: { type: 'string' },
				'content-story': { type: 'object', properties: { audience: { type: 'string' }, outcome: { type: 'string' }, remember: { type: 'string' }, narrativeArc: { type: 'array', items: { type: 'string' } } }, additionalProperties: true },
				'visual-design': { type: 'object', properties: { world: { type: 'string' }, mode: { type: 'string' }, framing: { type: 'string' } }, additionalProperties: true },
				'motion-time': { type: 'object', properties: { masterClock: { type: 'string' }, timingSource: { type: 'string' }, syncPolicy: { type: 'string' } }, additionalProperties: true },
				compiledOperations: { type: 'number' },
			},
			additionalProperties: true,
		},
		level: { type: 'string' },
		coordinateSystem: { type: 'string', enum: ['inches'] },
		layerModel: { type: 'string', enum: ['flat-object-array'] },
		objectIdentity: { type: 'string', enum: ['stable-names-required'] },
		geometryAuthority: { type: 'string', enum: ['ai'] },
		placementPolicy: { type: 'string', enum: ['visual-reference-pixels-v1', 'ai-authored-geometry-v1', 'html-conversion-secondary-v1'] },
		compositionModes: { type: 'array', description: 'Versioned authoring routes and their accepted placement inputs.', items: { type: 'object', additionalProperties: true } },
		geometryPrecision: { type: 'string' },
		rawNativePreservationPolicy: { type: 'string', enum: ['forbidden-in-director-spec', 'forbidden-in-public-spec'] },
		nativePreference: { type: 'string' },
		selectionManifestPolicy: { type: 'string' },
		selectionManifestStatus: { type: 'string' },
		completeness: AUTHORING_COMPLETENESS_READBACK_SCHEMA,
		textPolicy: { type: 'string' },
	},
	additionalProperties: false,
}

const AUTHORING_MOTION_SELECTION_INPUT_SCHEMA = {
	type: 'object',
	description: 'AI-owned exact semantic motion selection. The engine validates and executes these IDs without ranking, substitution, or exposing private animation indexes.',
	required: ['presenters'],
	properties: {
		presenters: {
			type: 'array', minItems: 1,
			items: {
				type: 'object', required: ['presenterId', 'selectedMotionIds'],
				properties: {
					presenterId: { type: 'string' },
					selectedMotionIds: { type: 'array', minItems: 1, maxItems: 18, uniqueItems: true, items: { type: 'string', pattern: '^motion\\.' } },
				},
				additionalProperties: false,
			},
		},
	},
	additionalProperties: false,
}

const AUTHORING_TIMING_SPINE_SCHEMA = {
	type: ['object', 'null'],
	description: 'Per-slide timing readback. It separates authored intent, normalized intent, effective clock, and timing evidence; fallback notes never create an implicit narration clock.',
	properties: {
		contractVersion: { type: 'string', enum: ['authoring-excellence.timing.v2'] },
		note: { type: 'string' },
		effectiveClock: { type: 'string', enum: ['narration-text', 'authored slide timing', 'presenter performance', 'per-slide timing authorities'] },
		authorityModes: { type: 'array', items: { type: 'string' } },
		timingEvidence: { type: 'array', items: { type: 'string' } },
		reconciliationModes: { type: 'array', items: { type: 'string' } },
		authoredIntent: { type: ['object', 'null'], properties: { masterClock: { type: 'string' }, timingSource: { type: 'string' }, syncPolicy: { type: 'string' }, kineticSelection: AUTHORING_MOTION_SELECTION_INPUT_SCHEMA }, additionalProperties: false },
		slides: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					slideId: { type: 'string' },
					narrationMs: { type: ['number', 'null'], description: 'Measured or estimated narration duration only when narration is explicit; null for silent/manual timing.' },
					narrationEstimateMs: { type: 'number', description: 'Dry-run estimate only; never present for a silent/manual slide.' },
					visualComfortMs: { type: 'number' },
					dwellMs: { type: ['number', 'null'] },
					performanceEndMs: { type: 'number' },
					governedBy: { type: 'string', enum: ['narration (text is master)', 'authored slide timing', 'presenter performance'] },
					visualFits: { type: ['boolean', 'null'], description: 'Narration-fit result when narration is the effective clock; null when no narration fit was evaluated.' },
					explicitNarration: { type: 'boolean' },
					timingSource: { type: 'string', enum: ['estimate', 'locked-audio', 'presenter-performance', 'explicit-autoplay', 'authored-timeline', 'static-authoring'], description: 'Evidence source for the effective slide clock. static-authoring means no inferred speech timing is active.' },
					effectiveClock: { type: 'string', enum: ['narration-text', 'authored slide timing', 'presenter performance'] },
					authorityMode: { type: 'string', enum: ['narrated', 'legacy-narration-compatibility', 'combined-narration-and-performance', 'silent-presenter-performance', 'silent-authored-autoplay', 'silent-authored-timeline', 'static-manual'] },
					secondaryClock: { type: ['string', 'null'], enum: ['presenter performance', null] },
					reconciliation: { type: 'string' },
					performanceFits: { type: ['boolean', 'null'] },
					legacyCompatibility: { type: 'boolean' },
					timingEvidence: { type: 'string', enum: ['estimate', 'measured-audio', 'authored-performance', 'authored-autoplay', 'authored-transition', 'none'] },
					authoredIntent: { type: 'object', properties: { masterClock: { type: 'string' }, timingSource: { type: 'string' }, syncPolicy: { type: 'string' }, kineticSelection: AUTHORING_MOTION_SELECTION_INPUT_SCHEMA }, additionalProperties: false },
					normalizedIntent: { type: 'object', properties: { masterClock: { type: 'string' }, timingSource: { type: 'string' } }, additionalProperties: false },
				},
				additionalProperties: false,
			},
		},
	},
	additionalProperties: false,
}

const AUTHORING_NARRATION_TIMELINE_SCHEMA = {
	type: ['object', 'null'],
	description: 'Mutation-free resolve/lockedDryRun and commit narration timing readback from measured audio. Phrase anchors are reported as deterministic duration-proportional script-position anchors, not word-level audio alignment.',
	properties: {
		phase: { type: 'string', enum: ['resolve', 'lockedDryRun', 'commit'] },
		source: { type: 'string', enum: ['resolved-audio', 'locked-audio', 'commit-manifest'] },
		note: { type: 'string' },
		slides: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					slideIndex: { type: 'number' },
					slideId: { type: ['string', 'null'] },
					lang: { type: 'string' },
					voiceId: { type: ['string', 'null'] },
					realDurationMs: { type: 'number' },
					dwellMs: { type: 'number' },
					startDelayMs: { type: 'number' },
					paddingMs: { type: ['number', 'null'] },
					segmented: { type: 'boolean' },
					segments: { type: 'array', items: { type: 'object', properties: { startMs: { type: 'number' }, durationMs: { type: 'number' }, gapBeforeMs: { type: 'number' } }, required: ['startMs', 'durationMs', 'gapBeforeMs'], additionalProperties: false } },
					beats: { type: 'array', items: { type: 'object', properties: { target: { type: 'string' }, atMs: { type: 'number' }, endMs: { type: 'number' }, anchorMethod: { type: 'string', description: 'duration-proportional-script-position for atPhrase/atWord cues; omitted for explicit atMs cues.' }, balancedBy: { type: 'string' }, autoSyncedBuild: { type: 'boolean' }, presenterMotion: { type: 'boolean', description: 'True when this cue binds an existing native presenter motion.' }, motionId: { type: 'string', description: 'Exact public semantic presenter motion ID bound to this real-clock cue.' } }, required: ['target', 'atMs', 'endMs'], additionalProperties: false } },
				},
				required: ['slideIndex', 'slideId', 'lang', 'voiceId', 'realDurationMs', 'dwellMs', 'startDelayMs', 'paddingMs', 'segmented', 'beats'],
				additionalProperties: false,
			},
		},
	},
	required: ['phase', 'source', 'note', 'slides'],
	additionalProperties: false,
}

const AUTHORING_RESOLVED_ASSETS_SCHEMA = {
	type: 'array',
	description: 'Public-safe media resolution readback. Pass the returned lockedSpec unchanged to lockedDryRun or commit; handles are opaque and no provider or filesystem details are part of this contract.',
	items: {
		type: 'object',
		properties: {
			kind: { type: 'string' },
			slideIndex: { type: 'number' },
			slideId: { type: ['string', 'null'] },
			objectName: { type: ['string', 'null'] },
			segmented: { type: 'boolean' },
			durationMs: { type: 'number' },
			textHash: { type: ['string', 'null'] },
			lockedAudio: { type: ['object', 'null'], properties: { handle: { type: 'string' }, digest: { type: 'string' }, extn: { type: 'string' }, durationMs: { type: 'number' }, mimeType: { type: 'string' }, settingsDigest: { type: 'string' } }, additionalProperties: false },
			segments: { type: 'array', items: { type: 'object', properties: { durationMs: { type: 'number' }, textHash: { type: ['string', 'null'] }, lockedAudio: { type: ['object', 'null'], properties: { handle: { type: 'string' }, digest: { type: 'string' }, extn: { type: 'string' }, durationMs: { type: 'number' }, mimeType: { type: 'string' }, settingsDigest: { type: 'string' } }, additionalProperties: false }, warnings: { type: 'array' } }, additionalProperties: true } },
			warnings: { type: 'array' },
		},
		additionalProperties: true,
	},
}

const AUTHORING_LOCKED_SPEC_SCHEMA = {
	type: ['object', 'null'],
	description: 'Semantic spec after billable media has been locked. Keep this object opaque and pass it verbatim to phase:"lockedDryRun" or phase:"commit"; do not inspect or rewrite engine-owned handles.',
	additionalProperties: true,
}

const AUTHORING_LOCKED_SPEC_PATCH_SCHEMA = {
	type: 'array',
	description: 'Semantic patch describing the locked media values merged into the spec. It is informational; prefer the returned lockedSpec as the next input.',
	items: { type: 'object', properties: { op: { type: 'string', enum: ['merge'] }, path: { type: 'string' }, value: { type: 'object', additionalProperties: true } }, additionalProperties: true },
}

const AUTHORING_HANDSHAKE_SCHEMA = {
	type: 'object',
	description: 'Deterministic consistency mirror between the AI-declared brief and compiled facts. It reports gaps but never grades taste; the AI owns the excellence bar and final decision.',
	properties: {
		note: { type: 'string' },
		contractVersion: { type: 'string' },
		scope: { type: 'string' },
		status: { type: 'string' },
		certifiesFirstTimeRight: { type: 'boolean' },
		firstTimeRightContractVersion: { type: 'string' },
		declared: {
			type: 'object',
			properties: {
				audience: { type: ['string', 'null'] },
				promise: { type: ['string', 'null'] },
				proof: { type: ['array', 'null'], items: { type: 'string' } },
				payoff: { type: ['string', 'null'] },
				bar: { type: ['string', 'null'] },
				commitments: { type: ['array', 'null'], items: { type: 'string' } },
			},
			additionalProperties: false,
		},
		checks: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					kind: { type: 'string' },
					status: { type: 'string', enum: ['consistent', 'gap'] },
					slideId: { type: 'string' },
					detail: { type: 'string' },
				},
				additionalProperties: false,
			},
		},
		gaps: { type: 'number' },
		consistent: { type: 'boolean' },
		declaredBrief: { type: 'boolean' },
	},
	additionalProperties: false,
}

const AUTHORING_MOTION_SELECTION_READBACK_SCHEMA = {
	type: 'object',
	description: 'Semantic motion selection readback. Public responses return the exact selected semantic IDs and bundle budget; private bundle handles, catalog fingerprints, and animation indexes are never returned.',
	properties: {
		contractVersion: { type: 'string', enum: ['betterpptx.authoring-motion-selection.v1'] },
		catalogVersion: { type: ['string', 'null'] },
		catalogFingerprint: { type: ['string', 'null'] },
		selectionAuthority: { type: 'string', enum: ['AI'] },
		engineRole: { type: 'string' },
		maximumMotionsPerPresenterBundle: { type: 'number' },
		presenters: {
			type: 'array', items: {
				type: 'object',
				properties: {
					presenterId: { type: 'string' },
					selectedMotionIds: { type: 'array', items: { type: 'string' } },
					bundleBudget: { type: 'object', properties: { used: { type: 'number' }, maximum: { type: 'number' }, remaining: { type: 'number' } }, additionalProperties: false },
					bundleHandle: { type: 'string' },
					noSilentSubstitution: { type: 'boolean' },
				},
				additionalProperties: false,
			},
		},
	},
	additionalProperties: false,
}

const AUTHORING_PRESENTER_PERFORMANCE_READBACK_SCHEMA = {
	type: 'object',
	properties: {
		contractVersion: { type: 'string', enum: ['betterpptx.presenter-performance.v2'] },
		timelineUnit: { type: 'string', enum: ['milliseconds-from-slide-start'] },
		performances: { type: 'array', items: {
			type: 'object',
			properties: {
				slideId: { type: 'string' }, actor: { type: 'string' },
				startMs: { type: 'number' }, durationMs: { type: 'number' }, endMs: { type: 'number' }, dwellMs: { type: 'number' },
				realization: { type: 'string', enum: ['continuous-native-3d'] }, sceneCount: { type: 'integer', const: 1 }, blendMs: { type: 'number' },
				frame: PRESENTER_PERFORMANCE_SCHEMA.properties.frame, travelCoordinateUnit: { type: 'string', enum: ['slide-inches'] },
				actions: { type: 'array', items: { type: 'object', properties: {
					id: { type: 'string' }, motionId: { type: 'string' }, startMs: { type: 'number' }, durationMs: { type: 'number' }, endMs: { type: 'number' }, cycles: { type: 'integer' }, contactMs: { type: 'number' },
					sourceStartMs: { type: 'integer' }, sourceEndMs: { type: 'integer' },
				}, required: ['id', 'motionId', 'startMs', 'durationMs', 'endMs', 'cycles'], additionalProperties: false } },
				entry: { ...PRESENTER_PERFORMANCE_SCHEMA.properties.entry, properties: { ...PRESENTER_PERFORMANCE_SCHEMA.properties.entry.properties, atMs: { type: 'number' } } },
				exit: { ...PRESENTER_PERFORMANCE_SCHEMA.properties.exit, properties: { ...PRESENTER_PERFORMANCE_SCHEMA.properties.exit.properties, atMs: { type: 'number', description: 'Absolute cue time from slide start.' } } },
				transforms: { ...PRESENTER_PERFORMANCE_SCHEMA.properties.transforms, description: 'Authored transform keys, relative to performance startMs.' },
				travel: { ...PRESENTER_PERFORMANCE_SCHEMA.properties.travel, description: 'Authored exact slide-inch centers, relative to performance startMs; stage labels are descriptive only.' },
				realizedTravel: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { atMs: { type: 'integer' }, center: PRESENTER_PERFORMANCE_SCHEMA.properties.travel.items.properties.center, stage: { type: 'string' } }, required: ['atMs', 'center'] } },
				layering: { ...PRESENTER_PERFORMANCE_SCHEMA.properties.layering, description: 'Explicit AI-authored native z-order policy; the engine does not infer layering from overlap.' },
				interactions: { type: 'array', items: { ...PRESENTER_PERFORMANCE_SCHEMA.properties.interactions.items, properties: {
					...PRESENTER_PERFORMANCE_SCHEMA.properties.interactions.items.properties,
					atMs: { type: 'number' }, contactSource: { type: 'string', enum: ['measured-performer-motion'] }, alignment: { type: 'string', enum: ['aligned', 'stage-constrained'] },
					grabMs: { type: 'integer', minimum: 0, description: 'Absolute grab time from slide start.' }, dropMs: { type: 'integer', minimum: 1, description: 'Absolute drop time from slide start.' },
					realization: { type: 'string', enum: ['native-projected-hand-follow'] }, stageTravelIncluded: { type: 'boolean' },
				} } },
			},
			required: ['slideId', 'actor', 'startMs', 'durationMs', 'endMs', 'dwellMs', 'realization', 'sceneCount', 'blendMs', 'frame', 'travelCoordinateUnit', 'actions', 'transforms', 'travel', 'realizedTravel', 'interactions'],
			additionalProperties: false,
		} },
	},
	required: ['contractVersion', 'timelineUnit', 'performances'], additionalProperties: false,
}

const AUTHORING_GENERATION_CONTRACTS_SCHEMA = {
	type: 'object',
	description: 'Engine-owned acceptance contracts returned with every semantic generation readback so the AI can evaluate the concrete plan without inferring rules from geometry.',
	properties: {
		presenterPerformance: AUTHORING_PRESENTER_PERFORMANCE_READBACK_SCHEMA,
		slideContinuities: SLIDE_CONTINUITIES_READBACK_SCHEMA,
		motionSelection: AUTHORING_MOTION_SELECTION_READBACK_SCHEMA,
		timingAuthority: { type: 'object', description: 'Shared timing-authority readback separating authored intent, normalized intent, effective clock, and evidence.', additionalProperties: true },
		completeness: AUTHORING_COMPLETENESS_READBACK_SCHEMA,
		avatarFrame: {
			type: 'object',
			description: 'Presenter-frame acceptance contract; the rectangle is engine readback, not an authoring input.',
			properties: {
				shape: { type: 'string', enum: ['ellipse'] },
				crop: { type: 'string', enum: ['centered-cover'] },
				duplicateVisualPolicy: { type: 'string' },
			},
			additionalProperties: false,
		},
		composition: {
			type: 'object',
			description: 'Shared semantic composition safety contract applied by the layout engine.',
			properties: {
				designAuthority: { type: 'string', enum: ['ai'] },
				creativeAuthority: { type: 'string', enum: ['ai', 'ai-with-director-assistance'] },
				directorMode: { type: 'string', enum: ['off', 'assisted'] },
				verificationMode: { type: 'string', enum: ['complete'] },
				creativeMutationPolicy: { type: 'string' },
				creativeAuthorityModes: { type: 'array', items: { type: 'object', additionalProperties: true } },
				engineRole: { type: 'string', enum: ['catalog-executor-package-verifier'] },
				knowledgeAuthority: { type: 'string', enum: ['ai-first-rag-when-unknown'] },
				ragPolicy: { type: 'string' },
				designRule: { type: 'string' },
				nativeFirstPolicy: { type: 'object', description: 'AI-selection/native-first execution and saved-package verification contract.', additionalProperties: true },
				selectionManifest: { type: 'object', description: 'Selection-manifest enforcement and no-silent-substitution contract.', additionalProperties: true },
				geometryAuthority: { type: 'string', enum: ['ai'] },
				placementPolicy: { type: 'string', enum: ['visual-reference-pixels-v1', 'ai-authored-geometry-v1', 'html-conversion-secondary-v1'] },
				compositionModes: { type: 'array', description: 'Versioned authoring routes and their accepted placement inputs.', items: { type: 'object', additionalProperties: true } },
				spatialDecisionAuthority: { type: 'string', enum: ['ai'] },
				spatialConflictPolicy: { type: 'string', enum: ['report-only'] },
				opaqueNativePolicy: { type: 'string' },
				textVisualOverlap: { type: 'string', enum: ['report-only'] },
				nativeMediaCaptionTracks: { type: 'object', additionalProperties: true },
				nonNativeCaptionOverlays: { type: 'object', additionalProperties: true },
				literalNewlinePolicy: { type: 'string' },
				worldScope: { type: 'string' },
				worldSelection: { type: 'object', additionalProperties: true },
			},
			additionalProperties: false,
		},
	},
	additionalProperties: false,
}
const AUTHORING_SEMANTIC_ROUNDTRIP_SCHEMA = {
	type: 'object',
	description: 'Sanitized semantic intent and solved interaction continuity that survives save, export, and reopen. Provider, path, clip-id, animation-id, and target-geometry details are excluded.',
	properties: {
		schemaVersion: { type: 'string', enum: ['betterpptx.semantic-roundtrip.v1'] },
		specDigest: { type: 'string' },
		planDigest: { type: ['string', 'null'] },
		semanticDigest: { type: 'string' },
		domainContract: {
			type: 'object',
			properties: {
				contentStory: { type: 'object', properties: { audience: { type: 'string' }, outcome: { type: 'string' }, remember: { type: 'string' }, narrativeArc: { type: 'array', items: { type: 'string' } } }, required: ['audience', 'outcome', 'remember'], additionalProperties: false },
				visualDesign: { type: 'object', properties: { world: { type: 'string' }, mode: { type: 'string' }, framing: { type: 'string' }, visualPromise: { type: 'string' }, worldRole: { type: 'string', enum: ['descriptive-intent', 'operational-selection'] }, worldIntent: { type: 'string' }, selectedWorld: { type: ['string', 'null'] }, effectiveWorld: { type: 'string' }, selectionSource: { type: 'string' } }, required: ['world', 'mode', 'framing'], additionalProperties: false },
				motionTime: { type: 'object', properties: { masterClock: { type: 'string' }, timingSource: { type: 'string' }, syncPolicy: { type: 'string' }, kineticSelection: AUTHORING_MOTION_SELECTION_INPUT_SCHEMA, authoredIntent: { type: 'object', properties: { masterClock: { type: 'string' }, timingSource: { type: 'string' }, syncPolicy: { type: 'string' } }, additionalProperties: false }, normalizedIntent: { type: 'object', properties: { masterClock: { type: 'string' }, timingSource: { type: 'string' } }, additionalProperties: false }, effectiveClock: { type: 'string' }, timingEvidence: { type: ['string', 'array'], items: { type: 'string' } } }, required: ['masterClock', 'timingSource', 'syncPolicy'], additionalProperties: false },
			},
			required: ['contentStory', 'visualDesign', 'motionTime'],
			additionalProperties: false,
		},
		slides: { type: 'object', properties: {
			performances: { type: 'array', items: { type: 'object', properties: { slide: { type: 'number' }, slideId: { type: 'string' }, performance: PRESENTER_PERFORMANCE_SCHEMA }, required: ['slide', 'slideId', 'performance'], additionalProperties: false } },
			interactions: { type: 'array', items: { type: 'object', properties: { slide: { type: 'number' }, slideId: { type: 'string' }, actor: { type: 'string' }, verb: { type: 'string' }, target: { type: 'string' }, hand: { type: 'string' }, distIn: { type: 'number' }, startMs: { type: 'number' } }, required: ['slide', 'slideId', 'actor', 'verb', 'target'], additionalProperties: false } },
			motions: { type: 'array', items: { type: 'object', properties: { slide: { type: 'number' }, slideId: { type: 'string' }, presenterId: { type: 'string' }, motionId: { type: 'string' }, narrationCue: { type: ['string', 'object', 'null'] } }, required: ['slide', 'slideId', 'presenterId', 'motionId'], additionalProperties: false } },
		}, required: ['interactions', 'motions'], additionalProperties: false },
		interactionPlan: { type: 'array', items: { type: 'object', properties: { slide: { type: 'number' }, slideId: { type: 'string' }, actor: { type: 'string' }, verb: { type: 'string' }, target: { type: 'string' }, status: { type: 'string', enum: ['solved', 'review'] }, startMs: { type: 'number' }, contactMs: { type: 'number' }, grabMs: { type: 'number' }, dropMs: { type: 'number' }, verdictCodes: { type: 'array', items: { type: 'string' } } }, required: ['slide', 'slideId', 'actor', 'verb', 'target', 'status', 'verdictCodes'], additionalProperties: false } },
		selectionAuthority: { type: 'string', enum: ['AI'] },
		persistenceRule: { type: 'string' },
	},
	required: ['schemaVersion', 'specDigest', 'planDigest', 'semanticDigest', 'domainContract', 'slides', 'interactionPlan', 'selectionAuthority', 'persistenceRule'],
	additionalProperties: false,
}
const AUTHORING_API_SCHEMA = {
	type: 'object',
	description: 'Versioned machine-readable API contract showing discovery, generate_from_spec phases, semantic inputs, engine readback, correction loop, layout vocabulary, and forbidden low-level inputs.',
	properties: {
		contractVersion: { type: 'string' },
		decisionGuide: { type: 'string', description: 'Reference to authoringPrinciples.decisionGuide.' },
		kineticPolicy: { type: 'string', description: 'Reference to authoringPrinciples.kineticPolicy; use it to select motion semantically and respect the catalog/per-deck limits.' },
		discovery: { type: 'object', properties: { tool: { type: 'string' }, request: { type: 'object', properties: { detail: { type: 'string' }, intent: { type: 'string' }, deckType: { type: 'string' } }, additionalProperties: true }, returns: { type: 'array' } }, additionalProperties: true },
		compose: { type: 'object', properties: { tool: { type: 'string' }, request: { type: 'object', properties: { schemaVersion: { type: 'string' }, workflow: { type: 'string' }, phase: { type: 'string' } }, additionalProperties: true }, mutationRule: { type: 'string' }, phases: { type: 'object', properties: { dryRun: { type: 'object', properties: { deckMutation: { type: 'boolean' }, purpose: { type: 'string' } }, additionalProperties: true }, resolve: { type: 'object', properties: { deckMutation: { type: 'boolean' }, purpose: { type: 'string' } }, additionalProperties: true }, lockedDryRun: { type: 'object', properties: { deckMutation: { type: 'boolean' }, purpose: { type: 'string' } }, additionalProperties: true }, commit: { type: 'object', properties: { deckMutation: { type: 'boolean' }, purpose: { type: 'string' } }, additionalProperties: true } }, additionalProperties: true } }, additionalProperties: true },
		semanticDecisionInputs: { type: 'object', description: 'AI-owned story, visual, timing, and identity inputs.', properties: { story: { type: 'array' }, visual: { type: 'array' }, time: { type: 'array' }, identity: { type: 'array' } }, additionalProperties: true },
		engineReadback: { type: 'object', description: 'Engine-owned plan, decision, and finding readback fields.', properties: { plan: { type: 'array' }, decisions: { type: 'array' }, findingShape: { type: 'array' } }, additionalProperties: true },
		errorReadback: { type: 'object', description: 'Public error envelope and typed semantic correction contract for cold AI clients.', properties: { contractVersion: { type: 'string', enum: ['authoring-excellence.errors.v1'] }, topLevel: { type: 'array', items: { type: 'string' } }, findingShape: { type: 'array', items: { type: 'string' } }, earlySpecCodes: { type: 'array', items: { type: 'string' } }, correctionRule: { type: 'string' } }, required: ['contractVersion', 'topLevel', 'findingShape', 'earlySpecCodes', 'correctionRule'], additionalProperties: false },
		decisionContext: { type: 'object', description: 'Compact preflight contract telling the AI what to decide, what the engine decides, and what must be reviewed before commit.', properties: {
			contractVersion: { type: 'string' },
			beforeDrafting: { type: 'array', items: { type: 'object', properties: { stage: { type: 'string' }, aiDecides: { type: 'array' }, engineMustNotBeAsked: { type: 'array' } }, additionalProperties: false } },
			engineResolves: { type: 'array' },
			reviewBeforeCommit: { type: 'array' },
			reviewBeforeDelivery: { type: 'array' },
			correctionRule: { type: 'string' },
		}, additionalProperties: false },
		correctionLoop: { type: 'array', description: 'Dry-run, inspect, revise semantic inputs, repeat, then commit and validate.' },
		layoutVocabulary: { type: 'array' },
		layoutIntentContracts: { type: 'object', additionalProperties: { type: 'object' } },
		compositionModes: { type: 'array', items: { type: 'object', additionalProperties: true } },
		regionVocabulary: { type: 'object', properties: { aliases: { type: 'array' }, conditions: { type: 'object', additionalProperties: { type: 'string' } }, customRule: { type: 'string' } }, additionalProperties: true },
		forbiddenInputs: { type: 'array', description: 'Placement/raw-native fields the AI must not author.' },
		coordinatePolicy: { type: 'object', properties: { placement: { type: 'object', properties: { forbiddenFields: { type: 'array' }, appliesTo: { type: 'string' }, owner: { type: 'string' }, rule: { type: 'string' } }, additionalProperties: true }, allowedSemanticContexts: { type: 'array' }, readback: { type: 'string' } }, additionalProperties: true },
		powerPointNiceties: { type: 'object', description: 'Explicit AI-selected native enhancement overlay, including targeting, actions, geometry modes, examples, and discovery routes.', additionalProperties: true },
		rule: { type: 'string' },
	},
	required: ['contractVersion', 'decisionGuide', 'kineticPolicy', 'discovery', 'compose', 'semanticDecisionInputs', 'engineReadback', 'errorReadback', 'decisionContext', 'correctionLoop', 'layoutVocabulary', 'layoutIntentContracts', 'regionVocabulary', 'forbiddenInputs', 'coordinatePolicy', 'rule'],
	additionalProperties: true,
}
const AUTHORING_TALKING_HEAD_SCHEMA = {
	type: 'object',
	description: 'Accepted presenter-window and source-crop contract. Presenter placement remains AI-authored; the engine only applies crop mechanics inside the authored frame.',
	properties: {
		contract: { type: 'string' },
		shape: { type: 'string', enum: ['ellipse'] },
		crop: { type: 'string', enum: ['centered-cover'] },
		geometryAuthority: { type: 'string', enum: ['ai'] },
		canonicalWindowIn: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } }, additionalProperties: true },
		sourceCrop: { type: 'object', properties: { sourceAspectRatio: { type: 'string' }, targetAspectRatio: { type: 'string' }, axis: { type: 'string' }, perSidePercent: { type: 'number' }, retainedCenterPercent: { type: 'number' } }, additionalProperties: true },
		canonicalWindowRule: { type: 'string' },
		nativeNarrationMarker: { type: 'string', description: 'Required native PowerPoint narration identity for a narrated presenter video.' },
	},
	required: ['contract', 'shape', 'crop', 'geometryAuthority', 'canonicalWindowIn', 'canonicalWindowRule', 'sourceCrop', 'nativeNarrationMarker'],
	additionalProperties: true,
}
const AUTHORING_TIMING_SCHEMA = {
	type: 'object',
	description: 'Versioned timing authority contract: authored intent, effective clock, and measured evidence are kept separate.',
	properties: {
		contract: { type: 'string' },
		masterClock: { type: 'string' },
		textIsMaster: { type: ['boolean', 'string'] },
		modes: { type: 'array', items: { type: 'object', additionalProperties: true } },
		authoringSource: { type: 'array' },
		chain: { type: 'array' },
		rule: { type: 'string' },
		shortContentRule: { type: 'string' },
		presenterRule: { type: 'string' },
		forbiddenCompetingClocks: { type: 'array' },
		phaseTruth: { type: 'object', properties: { dryRun: { type: 'string' }, resolve: { type: 'string' }, lockedDryRun: { type: 'string' }, commit: { type: 'string' } }, additionalProperties: true },
		combinedMode: { type: 'object', properties: { effectiveClock: { type: 'string', enum: ['narration-text'] }, secondaryClock: { type: 'string', enum: ['presenter performance'] }, reconciliation: { type: 'string' }, failureCode: { type: 'string' } }, required: ['effectiveClock', 'secondaryClock', 'reconciliation', 'failureCode'], additionalProperties: false },
		readback: { type: 'array' },
	},
	required: ['contract', 'masterClock', 'textIsMaster', 'authoringSource', 'chain', 'rule', 'shortContentRule', 'presenterRule', 'forbiddenCompetingClocks', 'phaseTruth', 'readback'],
	additionalProperties: true,
}
const AUTHORING_KINETIC_SCHEMA = {
	type: 'object',
	description: 'Public motion-selection policy: planned catalog, baked pool, per-deck cap, and the separate dedicated authoring-v3 contract status.',
	properties: {
		contract: { type: 'string' },
		plannedCatalogEntries: { type: 'number' },
		currentlyBakedPoolEntries: { type: 'number' },
		executableCatalogEntries: { type: 'number' },
		ordinaryGestureEntries: { type: 'number' },
		totalTrackedMotionRows: { type: 'number' },
		maxPerAvatarOrDeck: { type: 'number' },
		dedicatedInteractionSlots: { type: 'number' },
		dedicatedInteractionStatus: { type: 'string', enum: ['TO_SOURCE', 'IN_REVIEW', 'READY'] },
		selectionRule: { type: 'string' },
		interactionVocabulary: { type: 'array', items: { type: 'object', properties: { verb: { type: 'string', enum: ['touch', 'point-at', 'press', 'push', 'knock-over', 'carry'] }, meaning: { type: 'string' }, class: { type: 'string', enum: ['contact', 'impulse', 'transport'] } }, required: ['verb', 'meaning', 'class'], additionalProperties: false } },
		selectionAuthority: { type: 'string', enum: ['AI'] },
		engineRole: { type: 'string', enum: ['expose-validate-and-execute'] },
		catalogTool: { type: 'string' },
		selectionContract: AUTHORING_MOTION_SELECTION_INPUT_SCHEMA,
		interactionPlanRule: { type: 'string' },
		forbiddenMotionInputs: { type: 'array' },
		aiDecisionInputs: { type: 'array' },
		engineReadback: { type: 'array' },
		rule: { type: 'string' },
	},
	required: ['contract', 'plannedCatalogEntries', 'currentlyBakedPoolEntries', 'executableCatalogEntries', 'ordinaryGestureEntries', 'totalTrackedMotionRows', 'maxPerAvatarOrDeck', 'dedicatedInteractionSlots', 'dedicatedInteractionStatus', 'selectionRule', 'interactionVocabulary', 'selectionAuthority', 'engineRole', 'catalogTool', 'selectionContract', 'interactionPlanRule', 'forbiddenMotionInputs', 'aiDecisionInputs', 'engineReadback', 'rule'],
	additionalProperties: true,
}
const AUTHORING_DECISION_GUIDE_SCHEMA = {
	type: 'object',
	description: 'Ordered semantic decisions, engine readback, and correction actions for a cold AI author.',
	properties: {
		contractVersion: { type: 'string' },
		principle: { type: 'string' },
		recommendedWorkflow: { type: 'string', enum: ['ai-sovereign-v1'] },
		creativeAuthorityModes: { type: 'array', items: { type: 'object', additionalProperties: true } },
		orderedDecisions: { type: 'array', items: { type: 'object', properties: { stage: { type: 'string' }, question: { type: 'string' }, inputs: { type: 'array' } }, additionalProperties: true } },
		readbackOrder: { type: 'array' },
		correctionPolicy: { type: 'object', properties: { semanticOnly: { type: 'boolean' }, semanticDefault: { type: 'boolean' }, allowedInputs: { type: 'array' }, forbiddenInputs: { type: 'array' }, modeRules: { type: 'object', additionalProperties: { type: 'string' } }, rule: { type: 'string' } }, additionalProperties: true },
		compositionModes: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, geometryAuthority: { type: 'string' }, placementPolicy: { type: 'string' }, coordinateSystem: { type: 'string' }, purpose: { type: 'string' }, acceptedPlacementInputs: { type: 'array' }, engineResponsibilities: { type: 'array' }, forbiddenInputs: { type: 'array' } }, additionalProperties: true } },
		findingActions: { type: 'array', items: { type: 'object', properties: { code: { type: 'string' }, action: { type: 'string' } }, additionalProperties: true } },
	},
	required: ['contractVersion', 'principle', 'orderedDecisions', 'readbackOrder', 'correctionPolicy', 'findingActions'],
	additionalProperties: true,
}
const AUTHORING_DATA_PROOF_SCHEMA = {
	type: 'object',
	description: 'Public semantic proof contract for data-bearing content; runtime/provider provenance remains private.',
	properties: {
		contractVersion: { type: 'string' },
		required: { type: 'array' },
		dataBearingKinds: { type: 'array' },
		appliesTo: { type: 'array' },
		rule: { type: 'string' },
		engineReadback: { type: 'string' },
	},
	additionalProperties: true,
}
const AUTHORING_DECISION_AUTHORITY_SCHEMA = {
	type: 'object',
	description: 'Ownership matrix separating AI semantic choices, engine mechanics, and shared review.',
	properties: {
		aiOwns: { type: 'array' },
		engineOwns: { type: 'array' },
		sharedReview: { type: 'array' },
		 rule: { type: 'string' },
	},
	additionalProperties: true,
}
const AUTHORING_UPLOADED_PRESENTER_REPAIR_SCHEMA = {
	type: 'object',
	description: 'Semantic contract for repairing an uploaded deck with its existing approved presenter media; the AI retains or explicitly replaces the frame, while the engine owns crop mechanics within that frame, measured dwell, and package-safe timing.',
	properties: {
		contractVersion: { type: 'string', enum: ['betterpptx.avatar.uploaded-presenter-repair.v1'] },
		input: { type: 'string', description: 'Use slides[].avatarNarration with objectName, enabled:true, and reuseExisting:true.' },
		engineOwns: { type: 'array', items: { type: 'string' } },
		forbiddenInputs: { type: 'array', items: { type: 'string' } },
		workflow: { type: 'array', items: { type: 'string' } },
		rule: { type: 'string' },
	},
	required: ['contractVersion', 'input', 'engineOwns', 'forbiddenInputs', 'workflow', 'rule'],
	additionalProperties: false,
}
const AUTHORING_PRINCIPLES_SCHEMA = {
	type: 'object',
	description: 'Complete authoring principles for AI-owned geometry in sovereign and Director-assisted workflows. BetterPPTX reports measurements, serializes native objects, and verifies technical correctness without taking placement authority.',
	properties: {
		contractVersion: { type: 'string' },
		designAuthority: { type: 'string', enum: ['ai'] },
		engineRole: { type: 'string', enum: ['catalog-executor-package-verifier'] },
		designRule: { type: 'string' },
		recommendedWorkflow: { type: 'string', enum: ['ai-sovereign-v1'] },
		creativeAuthorityModes: { type: 'array', items: { type: 'object', additionalProperties: true } },
		compositionModes: { type: 'array', items: { type: 'object', additionalProperties: true } },
		nativeFirstPolicy: { type: 'object', description: 'AI owns design and exact variants; native PowerPoint is preferred; custom requires a specific reason; the engine executes and verifies.', additionalProperties: true },
		powerPointNiceties: { type: 'object', description: 'Explicit AI-selected native enhancement overlay.', additionalProperties: true },
		knowledgeAuthority: { type: 'string', enum: ['ai-first-rag-when-unknown'] },
		ragPolicy: { type: 'object', additionalProperties: true },
		geometryAuthority: { type: 'string' },
		placementPolicy: { type: 'string' },
		semanticInputs: { type: 'object', additionalProperties: { type: 'array' } },
		presenterFrame: { type: 'object' },
		decisionLoop: { type: 'array' },
		forbiddenCompositionPrimitives: { type: 'array' },
		structuralScaffolds: { type: 'object', properties: { policy: { type: 'string' }, why: { type: 'string' }, exception: { type: 'string' } }, additionalProperties: true },
		balanceRules: { type: 'array' },
		layoutIntentContracts: { type: 'object', additionalProperties: { type: 'object' } },
		balanceFindings: { type: 'array', items: { type: 'object', properties: { code: { type: 'string' }, trigger: { type: 'string' }, action: { type: 'string' } }, additionalProperties: true } },
		geometryOnlyShapePolicy: { type: 'object', properties: { text: { type: 'string' }, treatment: { type: 'string' }, rule: { type: 'string' } }, additionalProperties: true },
		namedRegionPolicy: { type: 'object', properties: { role: { type: 'string' }, multipleSubstantiveBlocks: { type: 'string' }, geometryAuthority: { type: 'string' }, overlapRule: { type: 'string' }, decorativeException: { type: 'string' } }, additionalProperties: true },
		semanticShapeTreatments: { type: 'object', properties: { 'accent-rule': { type: 'object', properties: { purpose: { type: 'string' }, orientation: { type: 'array' }, edge: { type: 'array' }, rule: { type: 'string' } }, additionalProperties: true }, divider: { type: 'object', properties: { purpose: { type: 'string' }, orientation: { type: 'array' }, edge: { type: 'array' }, rule: { type: 'string' } }, additionalProperties: true }, rule: { type: 'string' } }, additionalProperties: true },
		presenterStageTreatments: { type: 'object', properties: { contractVersion: { type: 'string' }, input: { type: 'string' }, decisionAuthority: { type: 'string', enum: ['AI'] }, engineRole: { type: 'string' }, default: { type: 'string', enum: ['none'] }, selectionRequired: { type: 'boolean' }, treatments: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' }, description: { type: 'string' } }, additionalProperties: false } }, rule: { type: 'string' } }, additionalProperties: false },
		diagramModePolicy: { type: 'object', properties: { contractVersion: { type: 'string' }, semanticDefault: { type: 'string' }, nativeOptIn: { type: 'string' }, aiDecision: { type: 'array' }, engineOwns: { type: 'array' }, rule: { type: 'string' } }, additionalProperties: true },
		accentPolicy: { type: 'object', properties: { contractVersion: { type: 'string' }, aiDecision: { type: 'string' }, engineDefault: { type: 'string' }, singleAccentWorlds: { type: 'array' }, readback: { type: 'array' }, qualityRule: { type: 'string' }, override: { type: 'string' } }, additionalProperties: true },
		depthPolicy: { type: 'object', properties: { contractVersion: { type: 'string' }, aiDecision: { type: 'string' }, engineDefault: { type: 'string' }, readback: { type: 'array' }, qualityRule: { type: 'string' }, override: { type: 'string' } }, additionalProperties: true },
		motionCoverage: { type: 'object', properties: { contractVersion: { type: 'string' }, aiDecision: { type: 'string' }, worldDefault: { type: 'string' }, semanticInputs: { type: 'array' }, minimumExpectation: { type: 'string' }, readback: { type: 'array' }, correction: { type: 'string' }, rule: { type: 'string' } }, additionalProperties: true },
		contentSignals: { type: 'object', properties: { visualProof: { type: 'array' }, explanation: { type: 'array' }, metadata: { type: 'array' }, rule: { type: 'string' } }, additionalProperties: true },
		dataProof: AUTHORING_DATA_PROOF_SCHEMA,
		decisionAuthority: AUTHORING_DECISION_AUTHORITY_SCHEMA,
		worldSelection: { type: 'object', additionalProperties: true },
		decisionGuide: AUTHORING_DECISION_GUIDE_SCHEMA,
		visualAnnotationContract: { type: 'object', properties: { contractVersion: { type: 'string' }, input: { type: 'string' }, placement: { type: 'string' }, semanticFields: { type: 'array' }, engineOwns: { type: 'array' }, readbackFields: { type: 'array' }, forbiddenInputs: { type: 'array' }, rule: { type: 'string' } }, additionalProperties: true },
		talkingHeadFrame: AUTHORING_TALKING_HEAD_SCHEMA,
		uploadedPresenterRepair: AUTHORING_UPLOADED_PRESENTER_REPAIR_SCHEMA,
		timingAuthority: AUTHORING_TIMING_SCHEMA,
		kineticPolicy: AUTHORING_KINETIC_SCHEMA,
		layoutGrammar: { type: 'object', properties: { layoutIntent: { type: 'string' }, arrange: { type: 'object', properties: { stack: { type: 'string' }, split: { type: 'object', properties: { shape: { type: 'string' }, minimumItems: { type: 'number' }, itemExclusiveMinimum: { type: 'number' }, example: { type: 'object', properties: { split: { type: 'array' } }, additionalProperties: true }, rule: { type: 'string' } }, additionalProperties: true }, cols: { type: 'object', properties: { type: { type: 'string' }, minimum: { type: 'number' }, maximum: { type: 'number' }, example: { type: 'object', properties: { cols: { type: 'number' } }, additionalProperties: true }, rule: { type: 'string' } }, additionalProperties: true } }, additionalProperties: true }, region: { type: 'string' }, visualIntent: { type: 'object', properties: { shapeTreatment: { type: 'object', properties: { purpose: { type: 'array' }, orientation: { type: 'array' }, edge: { type: 'array' }, rule: { type: 'string' } }, additionalProperties: true } }, additionalProperties: true }, regionPlan: { type: 'object', properties: { shape: { type: 'string' }, split: { type: 'object', properties: { axis: { type: 'array' }, namesMinimum: { type: 'number' }, weights: { type: 'string' } }, additionalProperties: true }, alias: { type: 'object', properties: { area: { type: 'string' }, role: { type: 'string' } }, additionalProperties: true }, forbidden: { type: 'array' }, rule: { type: 'string' } }, additionalProperties: true } }, additionalProperties: true },
	proposalReadback: { type: 'object', properties: { dryRunFields: { type: 'array' }, resolveFields: { type: 'array' }, findingFields: { type: 'array' }, correctionFields: { type: 'array' }, rule: { type: 'string' } }, additionalProperties: true },
		decisionReadback: { type: 'object', properties: { contractVersion: { type: 'string' }, fields: { type: 'array' }, sources: { type: 'array' }, rule: { type: 'string' } }, additionalProperties: true },
		qualityExitCriteria: { type: 'array' },
		 authoringApi: AUTHORING_API_SCHEMA,
	},
	required: ['contractVersion', 'geometryAuthority', 'placementPolicy', 'decisionGuide', 'forbiddenCompositionPrimitives', 'semanticInputs', 'layoutIntentContracts', 'balanceFindings', 'decisionAuthority', 'talkingHeadFrame', 'timingAuthority', 'kineticPolicy', 'layoutGrammar', 'proposalReadback', 'decisionReadback', 'qualityExitCriteria', 'authoringApi', 'decisionLoop'],
	additionalProperties: true,
}
const AUTHORING_CAPABILITY_MATRIX_ROW_SCHEMA = {
	type: 'object',
	description: 'One public semantic capability row. The engine route is informational; compose through generate_from_spec rather than invoking a primitive named by an internal implementation.',
	properties: {
		kind: { type: 'string' },
		field: { type: 'string' },
		capability: { type: 'string' },
		status: { type: 'string' },
		engineRoute: { type: 'string', enum: ['betterpptx.deck.generate_from_spec', 'not-available-in-public-spec'] },
		rule: { type: 'string' },
		reason: { type: 'string' },
	},
	additionalProperties: true,
}
const AUTHORING_CAPABILITY_MATRIX_SCHEMA = {
	type: 'object',
	description: 'Machine-readable capability matrix for the public JSON specification. It teaches AI-authored and AI-observed composition boundaries without exposing private primitives or package internals.',
	properties: {
		schemaVersion: { type: 'string', enum: ['betterpptx.deck-spec.v1'] },
		// Generation responses intentionally compact this matrix at summary detail
		// to keep the normal dry-run payload token-efficient.  The full capability
		// response still carries the complete typed fields below; keeping these
		// fields optional here lets the live MCP structured-content validator accept
		// both representations instead of rejecting the AI's default summary readback.
		detail: { type: 'string', enum: ['summary', 'full'] },
		counts: { type: 'object', properties: {
			specNative: { type: 'number' },
			deckLevel: { type: 'number' },
			primitiveOnly: { type: 'number' },
			unsupportedInSpecV1: { type: 'number' },
		}, additionalProperties: true },
		next: { type: 'string' },
		objectModel: { type: 'object', additionalProperties: true },
		interactionContract: { type: 'object', additionalProperties: true },
		routePolicy: { type: 'string' },
		authoringBoundary: { type: 'object', additionalProperties: true },
		specNative: { type: 'array', items: AUTHORING_CAPABILITY_MATRIX_ROW_SCHEMA },
		deckLevel: { type: 'array', items: AUTHORING_CAPABILITY_MATRIX_ROW_SCHEMA },
		uploadedDeckEditing: { type: 'array', items: AUTHORING_CAPABILITY_MATRIX_ROW_SCHEMA },
	},
	// Summary dry-runs return only schemaVersion/detail/counts/interactionContract;
	// full discovery and full-detail generation return the complete matrix.  The
	// two-form contract keeps the transport boundary compatible without accepting
	// a partial matrix as if it were full authoring guidance.
	oneOf: [
		{
			properties: { detail: { const: 'summary' } },
			required: ['schemaVersion', 'detail', 'counts'],
		},
		{
			required: ['schemaVersion', 'objectModel', 'routePolicy', 'authoringBoundary', 'specNative', 'deckLevel'],
			not: { required: ['detail'] },
		},
	],
	additionalProperties: true,
}
const AUTHORING_SEMANTIC_GESTURE_READBACK_SCHEMA = {
	type: 'object',
	description: 'Engine-resolved presenter decision. Semantic intent and timing are public; baked clip and geometry identifiers are intentionally omitted.',
	properties: {
		slide: { type: 'number' }, intent: { type: 'string' }, from: { type: 'string' }, motionId: { type: 'string', description: 'Exact public semantic motion ID selected by the AI.' },
		narrationCue: { type: ['string', 'object', 'null'], description: 'AI-authored spoken phrase/word or semantic timing anchor for the selected motion.' }, biased: { type: 'boolean' },
		valid: { type: 'boolean' }, violations: { type: 'array', items: { type: 'string' } }, travelIn: { type: 'number' },
		suppressed: { type: 'string' }, note: { type: 'string' },
		paired: { type: 'object', properties: { targetKind: { type: 'string' }, effect: { type: 'string' }, type: { type: 'string' }, atMs: { type: 'number' }, contactSource: { type: 'string' } }, additionalProperties: false },
	}, additionalProperties: false,
}
const AUTHORING_SEMANTIC_INTERACTION_READBACK_SCHEMA = {
	type: 'object',
	description: 'Engine-resolved semantic interaction status and timing. Geometry and baked realization identifiers remain private.',
	properties: {
		slide: { type: 'number' }, slideId: { type: 'string' }, actor: { type: 'string' }, verb: { type: 'string' }, target: { type: 'string' },
		status: { type: 'string', enum: ['solved', 'review'] }, startMs: { type: 'number' }, contactMs: { type: 'number' }, grabMs: { type: 'number' }, dropMs: { type: 'number' }, residualIn: { type: 'number' },
		verdictCodes: { type: 'array', items: { type: 'string' } }, verdicts: { type: 'array', items: { type: 'object', properties: { code: { type: 'string' }, severity: { type: 'string' }, reason: { type: 'string' }, fix: { type: 'string' } }, additionalProperties: false } },
	}, additionalProperties: false,
}
const AUTHORING_APPLIED_DEFAULTS_SCHEMA = {
	type: 'object',
	description: 'Defaults and decision readback for the effective authoring route. Explicit AI-authored geometry remains AI-owned; semantic placement is engine-computed only when the author delegates it.',
	properties: {
		decisionSummary: { type: 'object', description: 'Compact correction-ready decision surface. It summarizes world, effective placement authority, narration timing, presenter status, quality findings, correction levers, and the dry-run loop without exposing implementation details.', properties: {
			schemaVersion: { type: 'string' }, status: { type: 'string', enum: ['ready', 'review', 'blocked'] },
			world: { type: 'object', additionalProperties: true }, layout: { type: 'object', additionalProperties: true },
			timing: { type: 'object', additionalProperties: true }, presenter: { type: 'object', additionalProperties: true },
			quality: { type: 'object', additionalProperties: true }, nextActions: { type: 'array', items: { type: 'object', additionalProperties: true } },
			correctionLoop: { type: 'object', additionalProperties: true },
		}, additionalProperties: false },
		gradientPolicy: { type: 'object', properties: { contractVersion: { type: 'string' }, expected: { type: 'boolean' }, world: { type: 'string' }, surfaces: { type: 'array' }, rule: { type: 'string' } }, additionalProperties: true },
		accentPolicy: { type: 'object', properties: { contractVersion: { type: 'string' }, minimumDistinctAccents: { type: 'number' }, world: { type: 'string' }, singleAccentWorlds: { type: 'array' }, rule: { type: 'string' } }, additionalProperties: true },
		depthPolicy: { type: 'object', properties: { contractVersion: { type: 'string' }, minimumDepthObjectsPerSlide: { type: 'number' }, world: { type: 'string' }, shadow: { type: 'string' }, imageFrame: { type: 'boolean' }, rule: { type: 'string' } }, additionalProperties: true },
		motionCoverage: { type: 'object', properties: { contractVersion: { type: 'string' }, authoredAnimationSlides: { type: 'number' }, authoredAnimationObjects: { type: 'number' }, explicitNarrationSlides: { type: 'number' }, readback: { type: 'array' }, recommendation: { type: 'string' }, rule: { type: 'string' } }, additionalProperties: true },
		presenter: { type: 'object', properties: {
			active: { type: 'boolean' }, persona: { type: ['string', 'null'] }, choreography: { type: ['string', 'null'] }, stage: { type: ['string', 'null'] },
			stageTreatment: { type: 'object', properties: { id: { type: 'string', enum: ['none', 'floor-ellipse'] }, source: { type: 'string', enum: ['author', 'default'] }, decisionAuthority: { type: 'string', enum: ['AI'] }, engineRole: { type: 'string' } }, additionalProperties: false },
			dialect: { type: 'object' }, gestures: { type: 'array', items: AUTHORING_SEMANTIC_GESTURE_READBACK_SCHEMA },
			interactions: { type: 'array', items: AUTHORING_SEMANTIC_INTERACTION_READBACK_SCHEMA },
		}, additionalProperties: true },
		storyboard: { type: 'array', items: { type: 'object', properties: {
			slide: { type: 'number' }, slideId: { type: 'string' }, role: { type: ['string', 'null'] }, narration: { type: 'object' },
			plays: { type: 'array', items: { type: 'object', properties: {
				kind: { type: 'string' }, slide: { type: 'number' }, intent: { type: 'string' }, from: { type: 'string' }, actor: { type: 'string' }, verb: { type: 'string' }, target: { type: 'string' },
				motionId: { type: 'string', description: 'Exact public semantic motion ID selected by the AI.' }, narrationCue: { type: ['string', 'object', 'null'], description: 'AI-authored narration timing anchor for this storyboard play.' }, at: { type: ['string', 'number', 'object', 'null'], description: 'AI-authored semantic scene timing anchor when the play is a scene beat.' },
				valid: { type: 'boolean' }, suppressed: { type: 'string' }, note: { type: 'string' }, contactMs: { type: 'number' }, grabMs: { type: 'number' }, dropMs: { type: 'number' }, residualIn: { type: 'number' },
				paired: { type: 'object' }, pairedEffect: { type: 'object' }, verdicts: { type: 'array' },
			}, additionalProperties: false } },
			verdicts: { type: 'array' },
		}, additionalProperties: true } },
		slides: { type: 'array', description: 'Per-slide engine assumptions, including the semantic visual-balance readback.', items: { type: 'object', properties: {
			slideId: { type: 'string' }, layoutIntent: { type: 'string' }, layoutIntentDefaulted: { type: 'boolean' }, visualBalance: AUTHORING_VISUAL_BALANCE_SCHEMA,
		}, additionalProperties: true } },
	}, additionalProperties: true,
}

const PUBLIC_HELP_TOOL_NAMES_SCHEMA = {
	type: 'array',
	items: { type: 'string', pattern: '^betterpptx\\.' },
}
const PUBLIC_HELP_NEXT_ACTION_SCHEMA = {
	type: 'object',
	properties: {
		recommendedTool: { type: 'string', pattern: '^betterpptx\\.' },
		reason: { type: 'string' },
	},
	required: ['recommendedTool', 'reason'],
	additionalProperties: false,
}
const PUBLIC_HELP_PROGRESSIVE_DISCOVERY_SCHEMA = {
	type: 'array',
	description: 'Focused follow-up calls that keep the first response compact.',
	items: {
		type: 'object',
		properties: {
			need: { type: 'string' },
			tool: { type: 'string', pattern: '^betterpptx\\.' },
			request: { type: 'object', additionalProperties: true },
			exampleType: { type: 'string', enum: ['executable', 'executable-complete-dryRun'] },
		},
		required: ['need', 'tool', 'request'],
		additionalProperties: false,
	},
}
const PUBLIC_HELP_RELEASE_INFRASTRUCTURE_SCHEMA = {
	type: 'object',
	properties: {
		verificationPolicy: {
			type: 'object',
			properties: {
				schemaVersion: { type: 'string', enum: ['betterpptx.verification-policy.v1'] },
				policy: { type: 'string', enum: ['release-powerpoint', 'production-non-rendering'] },
				environmentMode: { type: 'string' },
				selectionSource: { type: 'string' },
				configurationStatus: { type: 'string' },
				clientMayOverride: { type: 'boolean', const: false },
				rendererRequiredForSave: { type: 'boolean' },
				nonRenderingValidationRequired: { type: 'boolean' },
				releaseQualificationRequired: { type: 'boolean' },
				previewAvailable: { type: 'boolean' },
				previewRole: { type: 'string' },
				saveRule: { type: 'string' },
				evidenceRule: { type: 'string' },
			},
			required: ['schemaVersion', 'policy', 'environmentMode', 'selectionSource', 'configurationStatus', 'clientMayOverride', 'rendererRequiredForSave', 'nonRenderingValidationRequired', 'releaseQualificationRequired', 'previewAvailable', 'previewRole', 'saveRule', 'evidenceRule'],
			additionalProperties: false,
		},
		authoritativePreview: {
			type: 'object',
			properties: {
				schemaVersion: { type: 'string', enum: ['betterpptx.authoritative-preview-capability.v1'] },
				status: { type: 'string', enum: ['available', 'external-infrastructure-required'] },
				available: { type: 'boolean' },
				renderer: { type: 'string', enum: ['powerpoint'] },
				certificationImpact: { type: 'string', enum: ['first-save-preview-enabled', 'public-save-blocked', 'not-required-for-production-save'] },
				policy: { type: 'string', enum: ['release-powerpoint', 'production-non-rendering'] },
				rendererRequiredForSave: { type: 'boolean' },
				requirement: { type: 'string' },
				nextAction: { type: 'string' },
			},
			required: ['schemaVersion', 'status', 'available', 'renderer', 'certificationImpact', 'policy', 'rendererRequiredForSave', 'requirement', 'nextAction'],
			additionalProperties: false,
		},
	},
	required: ['verificationPolicy', 'authoritativePreview'],
	additionalProperties: false,
}
const PUBLIC_HELP_FIRST_SAVE_SCHEMA = {
	type: 'object',
	properties: {
		contractVersion: { type: 'string', enum: ['authoring-excellence.first-time-right.v2'] },
		attemptBoundary: {
			type: 'object',
			properties: {
				startsAt: { type: 'string' },
				preSaveAuthoringRoom: { type: 'string' },
				passingSaveRule: { type: 'string' },
			},
			required: ['startsAt', 'preSaveAuthoringRoom', 'passingSaveRule'],
			additionalProperties: false,
		},
		releaseCriteria: { type: 'array', items: { type: 'string' } },
		releaseCall: {
			type: 'object',
			properties: {
				preview: { type: 'string' },
				save: { type: 'string' },
				retry: { type: 'string' },
			},
			required: ['preview', 'save', 'retry'],
			additionalProperties: false,
		},
		visualReview: {
			type: 'object',
			properties: {
				contractVersion: { type: 'string', enum: ['authoring-excellence.visual-review.v2'] },
				scope: { type: 'string' },
				contactSheetIsSufficient: { type: 'boolean', const: false },
				lenses: { type: 'array', minItems: 10, maxItems: 10, items: { type: 'string' } },
				rule: { type: 'string' },
			},
			required: ['contractVersion', 'scope', 'contactSheetIsSufficient', 'lenses', 'rule'],
			additionalProperties: false,
		},
	},
	required: ['contractVersion', 'attemptBoundary', 'releaseCriteria', 'releaseCall', 'visualReview'],
	additionalProperties: false,
}

const PUBLIC_CAPABILITY_FAMILY_SCHEMA = {
	type: 'object',
	properties: {
		id: { type: 'string' },
		family: { type: 'string' },
		label: { type: 'string' },
		status: { type: 'string' },
		summary: { type: 'string' },
		identity: { type: 'object', additionalProperties: true },
		implementation: { type: 'object', additionalProperties: true },
		extendedCapabilities: { type: 'array', items: { type: 'string' } },
		editability: { type: 'string' },
		controls: { type: 'array', items: { type: 'string' } },
		carriers: { type: 'array', items: { type: 'string' } },
		nativeModes: { type: 'array', items: { type: 'string' } },
		fallbackModes: { type: 'array', items: { type: 'string' } },
		aiOwns: { type: 'array', items: { type: 'string' } },
		engineOwns: { type: 'array', items: { type: 'string' } },
		selectionSignals: { type: 'array', items: { type: 'string' } },
		publicTools: PUBLIC_HELP_TOOL_NAMES_SCHEMA,
		requirements: { type: 'array', items: { type: 'string' } },
		limits: { type: 'array', items: { type: 'string' } },
		recovery: { type: 'array', items: { type: 'string' } },
		examples: { type: 'array', items: { type: 'object', additionalProperties: true } },
		readiness: { type: 'object', additionalProperties: true },
		evidence: { type: 'object', additionalProperties: true },
		issues: { type: 'array', items: { type: 'string' } },
		gates: { type: 'object', additionalProperties: true },
	},
	// First-call family rows are intentionally compact. Detailed registry rows
	// still carry implementation, controls, carriers, editability, evidence,
	// recovery, and readiness fields through authoring.capabilities.
	required: ['id', 'label', 'status', 'summary', 'publicTools'],
	additionalProperties: true,
}
const PUBLIC_CAPABILITY_OVERVIEW_SCHEMA = {
	type: 'object',
	properties: {
		schemaVersion: { type: 'string' },
		registry: { type: 'object', additionalProperties: true },
		families: { type: 'array', items: PUBLIC_CAPABILITY_FAMILY_SCHEMA },
		personaCapabilities: { type: 'array', description: 'Separate identity-media and character capabilities: Avatar talking-head video, existing 3D presenter, and partial rigged persona generation.', items: { type: 'object', additionalProperties: true } },
		extendedLayers: { type: 'array', items: { type: 'object', additionalProperties: true } },
	},
	required: ['schemaVersion', 'registry', 'families', 'extendedLayers'],
	additionalProperties: true,
}
const PUBLIC_CAPABILITY_NEXT_CALL_SCHEMA = {
	type: 'object',
	properties: {
		tool: { type: 'string', pattern: '^betterpptx\\.' },
		request: { type: 'object', additionalProperties: true },
		why: { type: 'string' },
	},
	required: ['tool', 'request'],
	additionalProperties: true,
}
const PUBLIC_MOTION_CONTRACT_SCHEMA = {
	type: 'object',
	properties: {
		schemaVersion: { type: 'string' },
		objectAnimations: { type: 'object', additionalProperties: true },
		transitionsMorph: { type: 'object', additionalProperties: true },
		native3dMotion: { type: 'object', additionalProperties: true },
		presenterCatalog: { type: 'object', additionalProperties: true },
		continuousPerformance: { type: 'object', additionalProperties: true },
		interactions: { type: 'object', additionalProperties: true },
		timing: { type: 'object', additionalProperties: true },
		dependencies: { type: 'array', items: { type: 'string' } },
		conflicts: { type: 'array', items: { type: 'string' } },
		nextCalls: { type: 'array', items: PUBLIC_CAPABILITY_NEXT_CALL_SCHEMA },
	},
	required: ['schemaVersion', 'objectAnimations', 'transitionsMorph', 'native3dMotion', 'presenterCatalog', 'continuousPerformance', 'interactions', 'timing'],
	additionalProperties: true,
}
const PUBLIC_NARRATION_CONTRACT_SCHEMA = {
	type: 'object',
	properties: {
		schemaVersion: { type: 'string' },
		identity: { type: 'string' },
		implementation: { type: 'string' },
		publicExposure: PUBLIC_HELP_TOOL_NAMES_SCHEMA,
		editability: { type: 'string' },
		stages: { type: 'array', items: { type: 'object', additionalProperties: true } },
		readinessDimensions: { type: 'array', items: { type: 'object', additionalProperties: true } },
		supportedFields: { type: 'array', items: { type: 'string' } },
		timing: { type: 'object', additionalProperties: true },
		autoplay: { type: 'object', additionalProperties: true },
		captionPolicy: { type: 'string' },
		conflicts: { type: 'array', items: { type: 'string' } },
		failureIsolation: { type: 'string' },
		outputProfiles: { type: 'array', items: { type: 'string' } },
		nextCalls: { type: 'array', items: PUBLIC_CAPABILITY_NEXT_CALL_SCHEMA },
	},
	required: ['schemaVersion', 'identity', 'stages', 'readinessDimensions', 'supportedFields', 'timing', 'autoplay', 'captionPolicy', 'failureIsolation'],
	additionalProperties: true,
}
const PUBLIC_HELP_PRINCIPLES_SCHEMA = {
	type: 'object',
	description: 'Compact ownership and first-save contract for an AI presentation author.',
	properties: {
		contractVersion: { type: 'string', enum: ['authoring-excellence.public-principles.v2'] },
		designAuthority: { type: 'string', enum: ['ai'] },
		engineRole: { type: 'string', enum: ['execute-measure-validate-serialize'] },
		designRule: { type: 'string' },
		recommendedWorkflow: { type: 'string', enum: ['ai-sovereign-v1'] },
		creativeAuthorityModes: { type: 'array', items: { type: 'object', additionalProperties: true } },
		compositionModes: { type: 'array', items: { type: 'object', additionalProperties: true } },
		decisionAuthority: {
			type: 'object',
			properties: {
				aiOwns: { type: 'array', items: { type: 'string' } },
				engineOwns: { type: 'array', items: { type: 'string' } },
				sharedReview: { type: 'array', items: { type: 'string' } },
			},
			required: ['aiOwns', 'engineOwns', 'sharedReview'],
			additionalProperties: false,
		},
		nativeFirstPolicy: {
			type: 'object',
			properties: { preference: { type: 'string' }, customException: { type: 'string' }, selectionRule: { type: 'string' }, visualReference: { type: 'string' } },
			required: ['preference', 'customException', 'selectionRule'],
			additionalProperties: false,
		},
		placementPolicy: {
			type: 'object',
			properties: {
				mode: { type: 'string', enum: ['ai-authored-or-ai-observed'] },
				aiInputs: { type: 'array', items: { type: 'string' } },
				engineOwns: { type: 'array', items: { type: 'string' } },
				forbiddenFields: { type: 'array', items: { type: 'string' } },
				forbiddenFieldsApplyTo: { type: 'string', enum: ['deactivated-engine-placement'] },
				exactModeAcceptedFields: { type: 'array', items: { type: 'string' } },
				rule: { type: 'string' },
			},
			required: ['mode', 'aiInputs', 'engineOwns', 'forbiddenFields', 'rule'],
			additionalProperties: false,
		},
		dataProof: {
			type: 'object',
			properties: { required: { type: 'array', items: { type: 'string' } }, rule: { type: 'string' } },
			required: ['required', 'rule'],
			additionalProperties: false,
		},
		visualReference: { type: 'object', description: 'Client-AI visual-reference reconstruction contract: native objects plus exact pixel frames, with no HTML ingestion or lowering.', additionalProperties: true },
		powerPointNiceties: { type: 'object', description: 'Visible first-class contract for deliberate native PowerPoint enhancements.', additionalProperties: true },
		portableJsonSpec: {
			type: 'object',
			description: 'Portable attached JSON-spec import, immutable stage archive, and explicit-publication contract.',
			properties: {
				schemaVersion: { type: 'string', enum: ['betterpptx.deck-spec.v1'] },
				rule: { type: 'string' },
				import: { type: 'string' },
				archive: { type: 'string' },
				publication: { type: 'string' },
			},
			required: ['schemaVersion', 'rule', 'import', 'archive', 'publication'],
			additionalProperties: false,
		},
		firstTimeRight: PUBLIC_HELP_FIRST_SAVE_SCHEMA,
	},
		// The compact response is still a complete contract. Full detail expands
		// the same fields; it does not introduce authority that summary omitted.
		required: ['contractVersion', 'designAuthority', 'engineRole', 'designRule', 'recommendedWorkflow', 'creativeAuthorityModes', 'compositionModes', 'decisionAuthority', 'nativeFirstPolicy', 'visualReference', 'powerPointNiceties', 'portableJsonSpec', 'placementPolicy', 'dataProof', 'firstTimeRight'],
	additionalProperties: false,
}
const PUBLIC_HELP_API_SCHEMA = {
	type: 'object',
	description: 'Compact semantic composition and correction contract.',
	properties: {
		contractVersion: { type: 'string', enum: ['authoring-excellence.public-api.v2'] },
		compose: {
			type: 'object',
			properties: {
				tool: { type: 'string', enum: ['betterpptx.deck.generate_from_spec'] },
				specSchema: { type: 'string', enum: ['betterpptx.deck-spec.v1'] },
				workflow: { type: 'string', enum: ['ai-sovereign-v1', 'authoring-excellence-director-v1'] },
				workflows: { type: 'array', items: { type: 'string', enum: ['ai-sovereign-v1', 'authoring-excellence-director-v1'] } },
				phases: {
					type: 'array',
					items: {
						type: 'object',
						properties: { id: { type: 'string', enum: ['dryRun', 'resolve', 'commit'] }, mutatesDeck: { type: 'boolean' }, purpose: { type: 'string' } },
						required: ['id', 'mutatesDeck', 'purpose'],
						additionalProperties: false,
					},
				},
			},
			required: ['tool', 'specSchema', 'workflow', 'workflows', 'phases'],
			additionalProperties: false,
		},
		requiredDomains: {
			type: 'object',
			properties: {
				appliesTo: { type: 'string', enum: ['authoring-excellence-director-v1'] },
				contentStory: { type: 'array', items: { type: 'string' } },
				visualDesign: { type: 'array', items: { type: 'string' } },
				motionTime: { type: 'array', items: { type: 'string' } },
			},
			required: ['appliesTo', 'contentStory', 'visualDesign', 'motionTime'],
			additionalProperties: false,
		},
		readbackOrder: { type: 'array', items: { type: 'string' } },
		correctionLoop: { type: 'array', items: { type: 'string' } },
		visualReference: { type: 'object', description: 'Public client-AI visual-reference reconstruction route using native objects and exact pixel frames.', additionalProperties: true },
		powerPointNiceties: { type: 'object', description: 'Visible first-class contract for deliberate native PowerPoint enhancements.', additionalProperties: true },
		portableJsonSpec: {
			type: 'object',
			description: 'Direct attached JSON-spec workflow through opaque handles.',
			properties: {
				acceptedInput: { type: 'string' },
				importRoute: { type: 'array', items: { type: 'string' } },
				phases: { type: 'array', items: { type: 'string' } },
				exportModes: { type: 'array', items: { type: 'string', enum: ['authoredInput', 'effectivePrecompile', 'current'] } },
				download: { type: 'string' },
				productionVisualRule: { type: 'string' },
			},
			required: ['acceptedInput', 'importRoute', 'phases', 'exportModes', 'download'],
			additionalProperties: false,
		},
	},
		// Summary responses keep the compose route and its correction/readback
		// contract; focused detail expands the same fields.
		required: ['contractVersion', 'compose', 'requiredDomains', 'readbackOrder', 'correctionLoop', 'portableJsonSpec'],
	additionalProperties: false,
}
const PUBLIC_HELP_PHASE_SCHEMA = {
	type: 'object',
	properties: {
		key: { type: 'string' },
		goal: { type: 'string' },
		tools: PUBLIC_HELP_TOOL_NAMES_SCHEMA,
		exitCriteria: { type: 'array', items: { type: 'string' } },
	},
	required: ['key', 'goal', 'tools', 'exitCriteria'],
	additionalProperties: false,
}
const PUBLIC_HELP_CAPABILITY_PROPERTIES = {
	schemaVersion: { type: 'string', enum: ['betterpptx.public-help.v2'] },
	product: { type: 'string' },
	detail: { type: 'string', enum: ['summary', 'plan', 'full'] },
	deckType: { type: 'string', enum: ['new', 'uploaded'] },
	requestProfile: {
		type: 'object',
		properties: { qualityProfile: { type: 'string', enum: ['modern', 'narrated', 'static'] }, requestedFeatures: { type: 'array', items: { type: 'string' } } },
		required: ['qualityProfile', 'requestedFeatures'],
		additionalProperties: false,
	},
	recommendedMode: { type: 'string', enum: ['mcp-authoring-excellence-json-spec'] },
	authoringSurface: { type: 'string', enum: ['mcp-generate-from-spec-only'] },
	releaseInfrastructure: PUBLIC_HELP_RELEASE_INFRASTRUCTURE_SCHEMA,
	whyBetterPptx: { type: 'array', items: { type: 'string' } },
	capabilityOverview: PUBLIC_CAPABILITY_OVERVIEW_SCHEMA,
	creativeExploration: {
		type: 'object',
		properties: {
			status: { type: 'string', enum: ['optional-teaching-candidates-not-selected'] },
			contrasts: {
				type: 'array',
				items: {
					type: 'object',
					properties: { moment: { type: 'string' }, lessonIds: { type: 'array', items: { type: 'string' } } },
					required: ['moment', 'lessonIds'],
					additionalProperties: false,
				},
			},
			rule: { type: 'string' },
		},
		required: ['status', 'contrasts', 'rule'],
		additionalProperties: false,
	},
	combinedExamples: {
		type: 'array',
		items: {
			type: 'object',
			properties: {
				id: { type: 'string' },
				intent: { type: 'string' },
				tool: { type: 'string', pattern: '^betterpptx\\.' },
				request: { type: 'object', additionalProperties: true },
				composeWith: { type: 'string', pattern: '^betterpptx\\.' },
				composition: { type: 'string' },
				verifyWith: { type: 'array', items: { type: 'string', pattern: '^betterpptx\\.' } },
				exampleType: { type: 'string', enum: ['recipe-requires-AI-authored-spec'] },
			},
			required: ['id', 'intent', 'tool', 'request', 'composeWith', 'composition', 'verifyWith'],
			additionalProperties: false,
		},
	},
	motion: { type: 'object', additionalProperties: true },
	narration: { type: 'object', additionalProperties: true },
	availability: { type: 'object', additionalProperties: true },
	authoringContract: { type: 'object', additionalProperties: true },
	responseBudget: {
		type: 'object',
		properties: {
			status: { type: 'string', enum: ['within-configured-byte-budget', 'over-configured-byte-budget', 'measuring'] },
			configured: {
				type: 'object',
				properties: {
					maxBytes: { type: 'integer', minimum: 0 },
					maxProxyTokens: { type: 'integer', minimum: 0 },
					source: { type: 'string', enum: ['service-default', 'environment-override'] },
				},
				required: ['maxBytes', 'maxProxyTokens', 'source'],
				additionalProperties: false,
			},
			measuredBytes: { type: 'integer', minimum: 0 },
			estimatedTokens: { type: 'integer', minimum: 0 },
			proxy: {
				type: 'object',
				properties: {
					status: { type: 'string', enum: ['approximate'] },
					method: { type: 'string' },
					withinConfiguredLimit: { type: ['boolean', 'null'] },
				},
				required: ['status', 'method', 'withinConfiguredLimit'],
				additionalProperties: false,
			},
			actualTokenizer: {
				type: 'object',
				properties: { status: { type: 'string', enum: ['not-measured'] }, reason: { type: 'string' } },
				required: ['status', 'reason'],
				additionalProperties: false,
			},
			connectorVisiblePayload: {
				type: 'object',
				properties: {
					status: { type: 'string', enum: ['estimated-server-boundary'] },
					structuredContentBytes: { type: ['integer', 'null'], minimum: 0 },
					textFallbackBytes: { type: ['integer', 'null'], minimum: 0 },
					estimatedCompleteToolResultBytes: { type: ['integer', 'null'], minimum: 0 },
					protocolEnvelopeBytes: { type: ['integer', 'null'], minimum: 0 },
					duplicationExpectedForCompatibility: { type: 'boolean' },
					note: { type: 'string' },
				},
				required: ['status', 'structuredContentBytes', 'textFallbackBytes', 'estimatedCompleteToolResultBytes', 'protocolEnvelopeBytes', 'duplicationExpectedForCompatibility', 'note'],
				additionalProperties: false,
			},
		},
		required: ['status', 'configured', 'measuredBytes', 'estimatedTokens', 'proxy', 'actualTokenizer', 'connectorVisiblePayload'],
		additionalProperties: false,
	},
	nextCalls: { type: 'array', items: PUBLIC_CAPABILITY_NEXT_CALL_SCHEMA },
	authoringPrinciples: { type: 'object', additionalProperties: true },
	authoringApi: { type: 'object', additionalProperties: true },
	intentInterpretation: { type: 'object', additionalProperties: true },
	authority: { type: 'object', additionalProperties: true },
	productionBoundaries: { type: 'object', additionalProperties: true },
	identityTerminology: { type: 'string' },
	controlRegistry: { type: 'object', additionalProperties: true },
	learningPath: { type: 'string' },
	unfilteredPath: { type: 'object', additionalProperties: true },
	capabilityDiscovery: { type: 'object', description: 'Six-way registered, published, host-loaded, callable, conditional, and planned capability census.', additionalProperties: true },
	capabilityIndex: { type: 'array', items: { type: 'object', properties: { area: { type: 'string' }, composeWith: { type: 'string' }, discoverWith: { type: 'string' } }, required: ['area', 'composeWith', 'discoverWith'], additionalProperties: false } },
	requiredTools: PUBLIC_HELP_TOOL_NAMES_SCHEMA,
	optionalTools: PUBLIC_HELP_TOOL_NAMES_SCHEMA,
	progressiveDiscovery: PUBLIC_HELP_PROGRESSIVE_DISCOVERY_SCHEMA,
	avoid: { type: 'array', items: { type: 'string' } },
	examples: { type: 'array', maxItems: 1, items: { type: 'object', properties: { tool: { type: 'string', enum: ['betterpptx.deck.generate_from_spec'] }, payload: { type: 'object', additionalProperties: true }, note: { type: 'string' } }, required: ['tool', 'payload', 'note'], additionalProperties: false } },
	nextAction: PUBLIC_HELP_NEXT_ACTION_SCHEMA,
}
const PUBLIC_HELP_WORKFLOW_PROPERTIES = {
	schemaVersion: { type: 'string', enum: ['betterpptx.public-help.v2'] },
	product: { type: 'string' },
	detail: { type: 'string', enum: ['summary', 'full'] },
	deckType: { type: 'string', enum: ['new', 'uploaded'] },
	responseBudget: PUBLIC_HELP_CAPABILITY_PROPERTIES.responseBudget,
	recommendedMode: { type: 'string', enum: ['mcp-authoring-excellence-json-spec'] },
	authoringSurface: { type: 'string', enum: ['mcp-generate-from-spec-only'] },
	releaseInfrastructure: PUBLIC_HELP_RELEASE_INFRASTRUCTURE_SCHEMA,
	authoritySummary: {
		type: 'object',
		properties: {
			designAuthority: { type: 'string', enum: ['ai'] },
			aiDecides: { type: 'array', items: { type: 'string' } },
			engineDelivers: { type: 'array', items: { type: 'string' } },
			rule: { type: 'string' },
		},
		required: ['designAuthority', 'aiDecides', 'engineDelivers', 'rule'],
		additionalProperties: false,
	},
	capabilityDiscovery: {
		type: 'object',
		properties: { tool: { type: 'string', enum: ['betterpptx.help.capabilities'] }, useBeforeAuthoring: { type: 'boolean' }, request: { type: 'object', additionalProperties: true }, read: { type: 'array', items: { type: 'string' } } },
		required: ['tool', 'useBeforeAuthoring', 'request', 'read'],
		additionalProperties: false,
	},
	recommendedFirstCalls: PUBLIC_HELP_TOOL_NAMES_SCHEMA,
	phases: { type: 'array', minItems: 5, maxItems: 5, items: PUBLIC_HELP_PHASE_SCHEMA },
	routing: { type: 'object', properties: { selected: PUBLIC_HELP_TOOL_NAMES_SCHEMA, optional: PUBLIC_HELP_TOOL_NAMES_SCHEMA }, required: ['selected', 'optional'], additionalProperties: false },
	progressiveDiscovery: PUBLIC_HELP_PROGRESSIVE_DISCOVERY_SCHEMA,
	qualityGates: { type: 'array', items: { type: 'string' } },
	fallbackPolicy: { type: 'array', items: { type: 'string' } },
	nextAction: PUBLIC_HELP_NEXT_ACTION_SCHEMA,
}

const SPECIFIC_DATA = {
	'betterpptx.help.capabilities': {
		...PUBLIC_HELP_CAPABILITY_PROPERTIES,
	},
	'betterpptx.equation.catalog': {
		brand: { type: 'string' },
		contractVersion: { type: 'string' },
		selectionAuthority: { type: 'string' },
		engineRole: { type: 'string' },
		selectionManifestContract: { type: 'object', additionalProperties: true },
		unranked: { type: 'boolean' },
		catalogOrder: { type: 'string' },
		compatibilityAlias: { type: 'string' },
		query: { type: 'string' },
		templateKind: { type: ['string', 'null'] },
		pagination: { type: 'object', additionalProperties: true },
		sourceFormats: { type: 'array', items: { type: 'string' } },
		nativeOutput: { type: 'string' },
		fallbackPolicy: { type: 'string' },
		templateKinds: { type: 'array', items: { type: 'string' } },
		commonStructures: { type: 'object', additionalProperties: true },
		presets: { type: 'array', items: { type: 'object', additionalProperties: true } },
		ribbonPresets: { type: 'array', items: { type: 'object', additionalProperties: true } },
		semanticPresets: { type: 'array', items: { type: 'object', additionalProperties: true } },
		selectedPreset: { type: ['object', 'null'], additionalProperties: true },
	},
	'betterpptx.smartart.catalog': SMARTART_CATALOG_DATA_SCHEMA.properties,
	'betterpptx.auth.status': { plan: { type: 'string', description: 'Current plan: free, premium, or credits.' }, authenticated: { type: 'boolean', description: 'Whether the current MCP session has an activated entitlement.' }, workflowStages: { type: 'object', description: 'Canonical workflow-stage authorization and delivery boundary.', additionalProperties: true } },
	'betterpptx.auth.activate_key': { activated: { type: 'boolean', description: 'True when the key was accepted.' }, plan: { type: 'string', description: 'Activated plan or credit status.' }, credits: { type: 'number', description: 'Credits activated when the key represents a credit pack.' } },
	'betterpptx.help.workflow': { ...PUBLIC_HELP_WORKFLOW_PROPERTIES },
	'betterpptx.help.tool_recipe': {
		schemaVersion: { type: 'string', enum: ['betterpptx.public-help.v2'] },
		detail: { type: 'string', enum: ['summary', 'full'] },
		surface: { type: 'string' },
		designAuthority: { type: 'string', enum: ['ai'] },
		engineRole: { type: 'string' },
		recipes: { type: 'array', description: 'Functional recipes for the requested capability area.', items: { type: 'object', additionalProperties: true } },
		validation: { type: 'array', description: 'Validation tools related to the selected recipes.' },
		objectNaming: { type: 'array', description: 'Stable object naming rules for editing, animation, and transitions.' },
		unknownSurfaces: { type: 'array', items: { type: 'string' } },
		rule: { type: 'string' },
		toolSchema: { type: 'object', description: 'Present when schemaFor was requested: the exact public schema node (tool, which, schemaPath, schema, childFields).', additionalProperties: true },
	},
	'betterpptx.authoring.capabilities': {
		schemaVersion: { type: 'string' },
		registry: { type: 'object', additionalProperties: true },
		status: { type: 'string' },
		principle: { type: 'object', additionalProperties: true },
		capabilities: { type: 'array', items: PUBLIC_CAPABILITY_FAMILY_SCHEMA },
		resolution: { type: ['object', 'null'], additionalProperties: true },
	},
	'betterpptx.authoring.catalog': {
		schemaVersion: { type: 'string' },
		registryVersion: { type: 'string' },
		status: { type: 'string' },
		principle: { type: 'object', additionalProperties: true },
		registry: { type: 'object', additionalProperties: true },
		interpretation: { type: 'object', additionalProperties: true },
		pagination: { type: 'object', additionalProperties: true },
		entries: { type: 'array', items: { type: 'object', additionalProperties: true } },
		controls: { type: 'array', items: { type: 'object', additionalProperties: true } },
		lessons: { type: 'array', items: { type: 'object', additionalProperties: true } },
		unfiltered: { type: 'object', additionalProperties: true },
		id: { type: 'string' },
		family: { type: 'string' },
		result: { type: 'string' },
		why: { type: 'string' },
		minimalSpec: { type: 'object', additionalProperties: true },
		expectedReadback: { type: 'array', items: { type: 'string' } },
		degradations: { type: 'array', items: { type: 'object', additionalProperties: true } },
	},
	'betterpptx.narration.voices': {
		catalogAvailable: { type: 'boolean' },
		synthesisRuntimeAvailable: { type: 'boolean' },
		mode: { type: 'string' },
		productionReady: { type: 'boolean' },
		listedVoiceCount: { type: 'integer', minimum: 0 },
		approvedVoiceCount: { type: 'integer', minimum: 0 },
		productionApprovedVoiceCount: { type: 'integer', minimum: 0 },
		lineageReviewRequiredCount: { type: 'integer', minimum: 0 },
		filter: { type: 'object', additionalProperties: true },
		readiness: { type: 'object', additionalProperties: true },
		genderCoverage: { type: 'object', additionalProperties: true },
		voices: { type: 'array', items: { type: 'object', additionalProperties: true } },
		failure: { type: 'object', additionalProperties: true },
		note: { type: 'string' },
	},
	'betterpptx.billing.explain_plan': {
		billingModel: { type: 'string', description: 'Freemium access model summary.' },
		paymentModel: { type: 'object', description: 'Configured public payment and credit-pack model.' },
		workflowStages: { type: 'object', description: 'Canonical workflow-stage authorization and delivery boundary.', additionalProperties: true },
		upgradeUrl: { type: 'string', description: 'URL the AI can give the user for upgrading.' },
		topUpCheckoutUrl: { type: ['string', 'null'], description: 'Opaque-token top-up URL when install-bound payment is available.' },
	},
	'betterpptx.billing.portal': { portalUrl: { type: 'string', description: 'Customer portal URL when configured.' }, checkoutUrl: { type: 'string', description: 'Checkout URL when configured.' }, activationTool: { type: 'string', description: 'Tool to call after the user provides a key.' } },
	'betterpptx.billing.payment_options': { surfaces: { type: 'object', description: 'Web, app, and agentic payment entry points and readiness.' }, readiness: { type: 'object', description: 'Public-safe payment-surface readiness summary.' }, promotions: { type: 'object', description: 'Public-safe BetterPPTX promo-code capability and redemption route.' } },
	'betterpptx.billing.redeem_promo': {
		state: { type: 'string', description: 'Legacy credit-pack state. This route is unavailable in pay-per-job mode unless a separate bounded job-sponsorship route is configured.' },
		creditedCredits: { type: 'integer', description: 'Legacy compatibility field only; absent in pay-per-job mode because a promotion never creates a reusable balance.' },
		promo: { type: 'object', description: 'Sanitized promo decision without the raw code.', additionalProperties: true },
		redemption: { type: 'object', description: 'Opaque redemption state and idempotency identity.', additionalProperties: true },
		payment: { type: ['object', 'null'], description: 'Payment intent for any remaining PayRam amount.', additionalProperties: true },
		paymentUrl: { type: ['string', 'null'], description: 'PayRam checkout URL when a remaining payment is required.' },
		startUrl: { type: ['string', 'null'], description: 'BetterPPTX continuation URL for the PayRam checkout.' },
		statusUrl: { type: ['string', 'null'], description: 'BetterPPTX status URL for the payment intent.' },
	},
	'betterpptx.operation.status': { operationId: { type: 'string', description: 'Opaque durable operation id.' }, state: { type: 'string', description: 'queued, running, succeeded, retry, failed, or cancelled.' }, result: { type: 'object', description: 'Completed public-safe tool result when state is succeeded.' } },
	'betterpptx.operation.read_file': {
		operationId: { type: 'string' }, fileName: { type: 'string' }, mimeType: { type: 'string' },
		totalBytes: { type: 'integer' }, packageSha256: { type: 'string' }, offset: { type: 'integer' },
		bytesReturned: { type: 'integer' }, nextOffset: { type: ['integer', 'null'] },
		encoding: { type: 'string', enum: ['base64'] }, mode: { type: 'string', enum: ['link', 'resource', 'chunk'] },
		downloadUrl: { type: 'string', description: 'Owner-issued browser URL, valid for up to 12 hours and capped at the original file expiry, when bytes are not embedded.' },
		downloadName: { type: 'string' }, downloadLinkExpiresAt: { type: 'string' }, artifactExpiresAt: { type: 'string' },
		deliveryReason: { type: 'string', description: 'Why link delivery was used instead of embedding bytes.' },
		dataBase64: { type: 'string', description: 'Returned in chunk mode as structuredContent; omitted from duplicate text content.' },
	},
	'betterpptx.billing.estimate': {
		quoteSchemaVersion: { type: 'string', description: 'Quote contract version.' },
		pricingModel: { type: 'string', description: 'Pricing model used for this estimate.' },
		toolName: { type: 'string', description: 'Operation scope priced by the quote.' },
		source: { type: 'string', description: 'Quote source, such as spec or deck.' },
		pricingInputDigest: { type: 'string', description: 'Digest binding the priced inputs, metrics, rate card, and quote cap.' },
		quoteId: { type: 'string', description: 'Opaque deterministic identity of this exact quote binding.' },
		quoteBindingDigest: { type: 'string', description: 'Digest of the exact quote/spec/plan/measured-timeline binding that must be copied into a premium final commit.' },
		issuedAt: { type: 'string', description: 'Quote issue timestamp.' },
		estimatedCredits: { type: 'number', description: 'Uncalibrated estimated BetterPPTX credits for the requested operation.' },
		quoteCapCredits: { type: 'number', description: 'Maximum credits that may be committed after the user accepts the quote.' },
		calibrationMultiplier: { type: 'number', description: 'Estimate-only calibration factor applied to the quote cap.' },
		calibrated: { type: 'boolean', description: 'Whether estimate calibration changed the quote cap.' },
		billingCategory: { type: 'string', description: 'free, draft-accrual, checkpoint, or heavy.' },
		confirmationRequired: { type: 'boolean', description: 'Whether explicit billing confirmation should be requested before running the operation.' },
		confirmationThresholdCredits: { type: 'number', description: 'Quote-cap threshold requiring explicit confirmation.' },
		hardBlockThresholdCredits: { type: 'number', description: 'Quote-cap threshold requiring an explicit billing override.' },
		rateCardVersion: { type: 'string', description: 'Version of the rate card used for the estimate.' },
		metrics: { type: 'object', description: 'Priced-scope metrics, including measured preparation reuse when a spec quote is requested.', additionalProperties: true },
		spec: { type: 'object', description: 'Compiled specification identity and nested operation scope when a spec quote is requested.', additionalProperties: true },
		specDigest: { type: 'string', description: 'Normalized specification digest included in the quote binding.' },
		estimatedPlanDigest: { type: 'string', description: 'Estimated execution-plan digest included in the quote binding.' },
		planDigest: { type: 'string', description: 'Resolved execution-plan digest when available.' },
		preparedTimelineDigest: { type: 'string', description: 'Digest of the server-validated measured narration timeline used by the quote.' },
		quoteBinding: premiumQuoteBindingPublicSchema(),
		narrationPreparation: { type: 'object', description: 'Preparation count, manifest digests, and duplicate-synthesis treatment.', additionalProperties: true },
		quoteReadiness: { type: 'string', enum: ['ready-for-authorization', 'preparation-required'], description: 'Whether the quote is final-authorizable or only a preparation-required preliminary result.' },
		readyForExecution: { type: 'boolean', description: 'False when required measured narration preparation is missing.' },
		remainingBlockers: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'Actionable blockers that prevent final authorization or execution.' },
		next: { type: 'object', additionalProperties: true, description: 'Exact next public call for the quoted state.' },
		specEstimate: { type: 'object', description: 'Compiled-operation estimate before final save/delivery.', additionalProperties: true },
		projectedResult: { type: 'object', description: 'Public size projection used for the final save component.', additionalProperties: true },
		costInputLedger: { type: 'object', description: 'Compiled-plan, support-carrier, transition, and projected-save inputs used to reconcile precommit and materialized pricing.', additionalProperties: true },
		estimate: { type: 'object', description: 'Underlying public-safe estimate and quote-cap calculation.', additionalProperties: true },
	},
	'betterpptx.billing.usage_summary': { billingModel: { type: 'string', description: 'Active billing model, including one_payment_per_job when reusable product balances are disabled.' }, balance: { type: 'object', description: 'Public-safe legacy balance state; not a customer-held balance in pay-per-job mode.' }, urls: { type: 'object', description: 'Public pricing and payment guidance URLs where available.' }, recentUsage: { type: 'object', description: 'Public-safe recent usage summary.' } },
	'betterpptx.billing.job_status': {
		ok: { type: 'boolean' },
		paymentModel: { type: 'string', const: 'one_payment_per_job' },
		jobId: { type: 'string' },
		quoteId: { type: 'string' },
		state: { type: 'string', description: 'quoted, payment_pending, settlement_uncertain, paid, running, succeeded, failed, reconciliation_required, refund_pending, refunded, cancelled, or expired.' },
		jobPayment: { type: 'object', description: 'Public job/payment binding and execution evidence; private input content and credentials are excluded.', additionalProperties: true },
		quote: { type: 'object', description: 'Public x402 quote and settlement terms for this exact job.', additionalProperties: true },
		result: { type: ['object', 'null'], description: 'Previously stored public-safe job result when execution succeeded.', additionalProperties: true },
		recovery: { type: 'object', description: 'Credential verification and recovery limitation.', additionalProperties: true },
		next: { type: 'object', description: 'Next action for this same job.', additionalProperties: true },
	},
	'betterpptx.deck.new': { deckId: { type: 'string', description: 'Handle to pass to subsequent slide.* / deck.* calls.' }, director: { type: 'object', description: 'Director workflow status for the new deck.' } },
	'betterpptx.deck.generate_from_spec': {
		schemaVersion: { type: 'string', description: 'Public generation readback schema version.' },
		ok: { type: 'boolean', description: 'True when the semantic compilation completed.' },
		deckId: { type: 'string', description: 'Handle for the generated or mutated deck when dryRun is false.' },
		authoringRoute: { type: 'object', description: 'Immutable route provenance. visualReference-ai is principal and AI-reconstruction eligible; htmlConversion-secondary is optional and ineligible for that certification.', additionalProperties: true },
		phase: { type: 'string', description: 'Compilation phase: dryRun, resolve, lockedDryRun, or commit.' },
		commitMode: { type: 'string' },
		dryRun: { type: 'boolean' },
		mutationFree: { type: 'boolean', description: 'True when the response made no deck mutation.' },
		compilerVersion: { type: 'string', description: 'Public compiler contract version.' },
		layoutEngineVersion: { type: 'string', description: 'Public layout engine contract version.' },
		specDigest: { type: 'string' },
		estimatedPlanDigest: { type: 'string' },
		lockedSpecDigest: { type: ['string', 'null'] },
		lockedPlanDigest: { type: ['string', 'null'] },
		planDigest: { type: 'string', description: 'Compatibility alias for estimatedPlanDigest until locked media phases are complete.' },
		specProvenance: { type: 'object', description: 'Public-safe immutable identity for the author-submitted and effective pre-compile JSON specs, including canonical hashes, sizes, stage, lineage, and durability without storage internals.', additionalProperties: true },
		title: { type: 'string' },
		slideCount: { type: 'number' },
		objectCount: { type: 'number' },
		operationCount: { type: 'number' },
		resolution: { type: 'object', description: 'Public resolution requirements and result summary.', additionalProperties: true },
		billing: { type: 'object', description: 'Public billing estimate and entitlement summary.', additionalProperties: true },
		requiresUpgrade: { type: 'boolean' },
		entitlement: { type: 'object', description: 'Compiled-plan entitlement result before mutation.', additionalProperties: true },
		quoteVerification: { type: 'object', description: 'Read-only server verification of an issued quote binding supplied unchanged by the caller.', additionalProperties: true },
		identityMap: { type: 'object', description: 'Slide-scoped mapping from stable author IDs to compiled native object IDs and edit handles.', additionalProperties: true },
		capabilityMatrix: AUTHORING_CAPABILITY_MATRIX_SCHEMA,
		authoringContract: AUTHORING_GENERATION_DOMAIN_CONTRACT_SCHEMA,
		authoringContracts: AUTHORING_GENERATION_CONTRACTS_SCHEMA,
		semanticRoundtrip: AUTHORING_SEMANTIC_ROUNDTRIP_SCHEMA,
		appliedDefaults: AUTHORING_APPLIED_DEFAULTS_SCHEMA,
		visualDirection: { type: 'object', description: 'Resolved visual-world and design-system readback.', additionalProperties: true },
		timingSpine: AUTHORING_TIMING_SPINE_SCHEMA,
		narrationTimeline: AUTHORING_NARRATION_TIMELINE_SCHEMA,
		lockedSpec: AUTHORING_LOCKED_SPEC_SCHEMA,
		lockedSpecPatch: AUTHORING_LOCKED_SPEC_PATCH_SCHEMA,
		resolvedAssets: AUTHORING_RESOLVED_ASSETS_SCHEMA,
		presenterContract: AUTHORING_PRESENTER_CONTRACT_SCHEMA,
		presenterRuntime: AUTHORING_PRESENTER_RUNTIME_SCHEMA,
		selectionManifest: { type: 'object', description: 'Pre-generation proof that every AI-authored selector reached the exact executable operation. Saved-package proof is returned by deck.save.', additionalProperties: true },
		slides: { type: 'array', description: 'Per-slide engine readback, including semantic assignments and placement ownership.', items: AUTHORING_SLIDE_READBACK_SCHEMA },
		layoutRecommendations: AUTHORING_LAYOUT_RECOMMENDATIONS_SCHEMA,
		warnings: { type: 'array', description: 'Non-blocking findings. Each may include code, reason, fix, evidence, suggestions, and next action.', items: AUTHORING_FINDING_SCHEMA },
		errors: { type: 'array', description: 'Blocking findings. Resolve them through semantic spec changes and rerun the same phase.', items: AUTHORING_FINDING_SCHEMA },
		next: { type: 'object', description: 'Recommended next public tool and reason for the current phase.', additionalProperties: true },
		handshake: AUTHORING_HANDSHAKE_SCHEMA,
		operations: { type: 'array', description: 'Deterministic engine operations derived from the semantic spec.' },
		committedObjects: { type: 'array', description: 'Committed object readback when the phase mutates a deck.' },
		artifacts: { type: 'array', description: 'Public-safe artifact references when the phase resolves or commits media.' },
	},
	'betterpptx.deck.director_status': {
		mode: { type: 'string', enum: ['ai-sovereign', 'director-strict', 'director-guided'], description: 'Effective authoring mode. ai-sovereign keeps Director assistance off while retaining complete technical verification.' },
		directorMode: { type: 'string', enum: ['off', 'assisted'], description: 'Whether optional Director assistance is active.' },
		directorActive: { type: 'boolean', description: 'False in ai-sovereign mode; no Director planning stage is then required.' },
		verificationRequired: { type: 'boolean', description: 'Whether technical validation is required independently of Director assistance.' },
		requiredBeforeAuthoring: { type: 'boolean', description: 'Whether the effective assisted workflow requires planning decisions before the next authoring operation. False for ai-sovereign mode.' },
		readyForAuthoring: { type: 'boolean', description: 'Whether the effective authoring contract permits the next operation.' },
		readyForSave: { type: 'boolean', description: 'Whether the deck satisfies its effective save contract, including technical verification independently of Director mode.' },
		missingStages: { type: 'array', description: 'Applicable assisted-Director stages still missing. Empty when Director assistance is off.' },
		next: { type: 'object', description: 'Recommended next public tool.' },
	},
	'betterpptx.deck.define_message_architecture': { stage: { type: 'string' }, completed: { type: 'boolean' }, plannedSlides: { type: 'number' }, director: { type: 'object', description: 'Updated director workflow status.' } },
	'betterpptx.deck.assign_slide_roles': { stage: { type: 'string' }, completed: { type: 'boolean' }, assignedSlides: { type: 'number' }, uniqueRoleCount: { type: 'number' }, director: { type: 'object', description: 'Updated director workflow status.' } },
	'betterpptx.deck.define_design_system': { stage: { type: 'string' }, completed: { type: 'boolean' }, coverage: { type: 'object', description: 'Seven-pillar design-system coverage.' }, director: { type: 'object', description: 'Updated director workflow status.' } },
	'betterpptx.deck.open_existing': { deckId: { type: 'string', description: 'Deck handle for the imported presentation.' }, slideCount: { type: 'number', description: 'Number of slides imported.' }, shapeCount: { type: 'number', description: 'Total shapes imported.' } },
	'betterpptx.deck.open_uploaded': { deckId: { type: 'string', description: 'Deck handle for the uploaded presentation.' }, slideCount: { type: 'number', description: 'Number of slides imported.' }, shapeCount: { type: 'number', description: 'Total shapes imported.' } },
	'betterpptx.slide.add': {
		slideIndex: { type: 'number', description: 'Index of the slide just added.' },
		idempotentReplay: { type: 'boolean', description: 'True when this response replays an earlier call with the same idempotency key.' },
	},
	'betterpptx.slide.inspect': { slideIndex: { type: 'number' }, transition: { type: 'object', description: 'Current slide transition, or null.' }, background: { type: 'object', description: 'Current slide background, or null.' }, hidden: { type: 'boolean' }, showMasterShapes: { type: 'boolean' }, showMasterBackground: { type: 'boolean', description: 'PowerPoint semantic alias for showMasterShapes.' }, showMasterPhAnim: { type: 'boolean' }, slideNumber: { type: 'object' }, objectCount: { type: 'number', description: 'Editable objects on this slide.' } },
	'betterpptx.slide.preview': { authoringRoute: { type: 'object', additionalProperties: true }, preview: { type: 'object', description: 'Preview artifact metadata and download link when configured.' }, renderer: { type: 'object', description: 'Renderer type and preview limitations.' } },
	'betterpptx.deck.preview': {
		authoringRoute: { type: 'object', description: 'Route provenance bound to the frozen preview package.', additionalProperties: true },
		slideCount: { type: 'number', description: 'Slides in the frozen current-version PPTX package.' },
		packageSha256: { type: 'string', description: 'SHA-256 of the exact frozen PPTX bytes used by PowerPoint for every preview batch and later published by deck.save.' },
		powerPointOpen: { type: 'object', description: 'Successful read-only PowerPoint open evidence with repair disabled; repaired is false for every credited render.' },
		renderSetSha256: { type: ['string', 'null'], description: 'SHA-256 binding the frozen package hash to the ordered per-slide PNG hashes accumulated so far.' },
		validationEvidenceSha256: { type: 'string', description: 'SHA-256 binding the preview freeze to the successful current-version aggregate validation evidence.' },
		validationVerification: { type: 'object', description: 'Current deckVersion proof that package, design, accessibility, narration, and aggregate quality validation ran successfully before the freeze.' },
		requestedSlideIndexes: { type: 'array', items: { type: 'integer' }, description: 'Valid unique zero-based indexes requested for this call before the 12-slide batch boundary.' },
		renderedSlideIndexes: { type: 'array', items: { type: 'integer' }, description: 'Exact zero-based indexes rendered by this call; never more than batchLimit.' },
		previewedSlideIndexes: { type: 'array', items: { type: 'integer' }, description: 'Accumulated current-version indexes rendered from this packageSha256.' },
		remainingSlideIndexes: { type: 'array', items: { type: 'integer' }, description: 'Every current-version slide still requiring preview before public save.' },
		complete: { type: 'boolean', description: 'True only when every current-version slide has been previewed from this packageSha256.' },
		batchLimit: { type: 'number', description: 'Maximum slides rendered per preview call; currently 12.' },
		previews: { type: 'array', description: 'PowerPoint-rendered preview artifacts for renderedSlideIndexes.' },
		renderer: { type: 'object', description: 'Renderer fidelity and runtime limitations.' },
	},
	'betterpptx.slide.update': { slideIndex: { type: 'number' }, updated: { type: 'array', description: 'Slide-level fields changed.' } },
	'betterpptx.slide.set_transition': { slideIndex: { type: 'number' }, transition: { type: 'object', description: 'Updated transition, or null when cleared.' } },
	'betterpptx.slide.delete_shapes': { slideIndex: { type: 'number' }, deletedCount: { type: 'number', description: 'Number of editable slide objects removed.' }, remainingObjects: { type: 'number', description: 'Editable objects left on the slide.' } },
	'betterpptx.slide.reorder_shape': { slideIndex: { type: 'number' }, fromIndex: { type: 'number' }, toIndex: { type: 'number' }, objectName: { type: 'string' } },
	'betterpptx.slide.update_equation': { slideIndex: { type: 'number' }, objectName: { type: 'string' }, sourceFormat: { type: 'string' }, patchedKeys: { type: 'array', description: 'Equation fields changed.' } },
	'betterpptx.deck.export_spec': { authoringRoute: { type: 'object', description: 'Route provenance for the exported authoring artifact.', additionalProperties: true }, mode: { type: 'string' }, spec: { type: 'object', description: 'Public-safe BetterPPTX JSON spec.' }, specArtifact: { type: 'object', description: 'Immutable authored/effective spec identity when an archive mode is requested.' }, artifact: { type: 'object', description: 'Portable JSON download artifact when download:true.' }, editabilityMap: { type: 'array' }, byTier: { type: 'object' }, unsupportedFindings: { type: 'array' }, privacy: { type: 'object' } },
	'betterpptx.deck.editability_report': { slideCount: { type: 'number' }, objectCount: { type: 'number' }, byTier: { type: 'object', description: 'Object counts by editability tier.' }, byKind: { type: 'object', description: 'Object counts by kind.' } },
	'betterpptx.narration.synthesize': {
		state: { type: 'string', enum: ['succeeded', 'failed'], description: 'Preparation state. A succeeded result contains an immutable measured-audio manifest.' },
		preparationId: { type: 'string', description: 'Opaque preparation identifier bound to the measured script, settings, segment timings, and audio bytes.' },
		operationId: { type: 'string', description: 'Opaque preparation operation identifier for correlation; use the returned state and manifest for reuse.' },
		manifestHandle: { type: 'string', description: 'Opaque locked JSON manifest handle. Copy it into preparedNarration.manifestHandle in the semantic deck spec.' },
		manifestDigest: { type: 'string', description: 'SHA-256 digest of the preparation manifest content.' },
		schemaVersion: { type: 'string', const: 'betterpptx.narration-preparation.v1' },
		scriptDigest: { type: 'string', description: 'Digest of the normalized authored narration sequence.' },
		audio: { type: 'object', description: 'Opaque assembled WAV reference with measured duration; no local path is exposed.', properties: { ref: { type: 'string' }, digest: { type: 'string' }, durationMs: { type: 'integer', minimum: 1 }, extn: { type: 'string', const: 'wav' }, mimeType: { type: 'string', const: 'audio/wav' } }, required: ['ref', 'durationMs', 'extn'], additionalProperties: false },
		durationMs: { type: 'integer', minimum: 1, description: 'Measured duration of the assembled audio in milliseconds.' },
		voice: { type: ['object', 'null'], description: 'Selected public voice facts, including its catalog id; catalog listing and readiness remain separate.', additionalProperties: true },
		settings: { type: 'object', description: 'Publicly authorable synthesis settings used for preparation.', additionalProperties: true },
		segments: { type: 'array', description: 'Measured ordered segments and absolute offsets in the assembled audio.', items: { type: 'object', properties: { id: { type: 'string' }, slideId: { type: ['string', 'null'] }, textDigest: { type: 'string' }, audio: { type: 'object', description: 'Opaque per-segment audio reference.', additionalProperties: true }, durationMs: { type: 'integer', minimum: 1 }, gapBeforeMs: { type: 'integer', minimum: 0 }, gapAfterMs: { type: 'integer', minimum: 0 }, startMs: { type: 'integer', minimum: 0 }, endMs: { type: 'integer', minimum: 1 }, timingEvidence: { type: 'string' } }, required: ['id', 'durationMs'], additionalProperties: true } },
		timingEvidence: { type: 'object', description: 'Evidence classification. Segment boundaries are measured from returned audio; this is not word-level alignment proof.', additionalProperties: true },
		retention: { type: 'string', description: 'Public retention policy for the opaque preparation and audio handles.' },
		reuse: { type: 'string', description: 'Public instruction for reusing this exact measured preparation during quotation and final generation.' },
		warnings: { type: 'array', items: { type: 'object', additionalProperties: true } },
		billing: { type: 'object', description: 'Preparation/quote relationship and duplicate-synthesis policy.', additionalProperties: true },
		next: { type: 'object', description: 'Next public action after preparation.', additionalProperties: true },
	},
	'betterpptx.slide.add_narration': { slideIndex: { type: 'number' }, advanceAfterTime: { type: 'number', description: 'Slide advance timing in milliseconds.' } },
	'betterpptx.avatar.render_job': { jobId: { type: 'string', description: 'Avatar render job id.' }, status: { type: 'string', description: 'queued, running, succeeded, or failed.' } },
	'betterpptx.avatar.job_status': { jobId: { type: 'string' }, status: { type: 'string' }, video: { type: ['object', 'null'], description: 'Completed Avatar talking-head audiovisual asset reference and measured metadata when succeeded; null while queued or running.' } },
	'betterpptx.avatar.attach_result': {
		ok: { type: 'boolean', description: 'True when the completed talking-head asset was attached to the requested slide.' },
		slideIndex: { type: 'number' },
		objectName: { type: 'string' },
		video: { type: 'object', additionalProperties: false, properties: {
			durationMs: { type: 'number', description: 'Measured duration of the attached video/audio media in milliseconds.' },
			extn: { type: 'string', const: 'mp4' },
			cacheHit: { type: 'boolean' },
		} },
		advanceAfterTime: { type: 'number', description: 'Automatic slide advance time derived from measured media, cues, and padding, in milliseconds.' },
		timing: { type: 'object', description: 'Measured media and cue timing readback.', additionalProperties: false, properties: {
			startDelayMs: { type: 'number' },
			mediaEndMs: { type: 'number' },
			cueTimelineEndMs: { type: 'number' },
			captionTimelineEndMs: { type: 'number' },
			timelineEndMs: { type: 'number' },
			paddingMs: { type: 'number' },
		} },
		cues: { type: 'number' },
		captions: { type: 'number' },
		mode: { type: 'string', const: 'videoWithAudio' },
		warnings: { type: 'array', items: { type: 'object', additionalProperties: true } },
	},
	'betterpptx.assets.upload': {
		handle: { type: 'string', description: 'Opaque content-addressed asset handle.' },
		sha256: { type: 'string', description: 'SHA-256 of the uploaded bytes.' },
		rawSha256: { type: 'string', description: 'Exact transport-byte SHA-256 for a portable jsonSpec upload.' },
		canonicalSha256: { type: 'string', description: 'Canonical JSON SHA-256 for a parsed portable jsonSpec.' },
		canonicalBytes: { type: 'number', description: 'Canonical JSON byte length for a parsed portable jsonSpec.' },
		slideCount: { type: 'number', description: 'Validated slide count for a portable jsonSpec.' },
		mimeType: { type: 'string', description: 'Detected MIME type.' },
		kind: { type: 'string', description: 'Declared asset class.' },
		asset: { type: 'object', description: 'Opaque content-addressed asset handle plus safe media facts.' },
	},
	'betterpptx.assets.inspect': {
		handle: { type: 'string', description: 'Opaque inspected package handle.' },
		entryFile: { type: 'string', description: 'Selected HTML entry path.' },
		images: { type: 'number', description: 'Image assets in the conversion package.' },
		missingAssets: { type: 'array', items: { type: 'string' } },
		sidecars: { type: 'array', items: { type: 'string' } },
		htmlViewport: { type: 'object', description: 'Detected source viewport.' },
		detectedSlides: { type: 'number' },
	},
	'betterpptx.slide.add_avatar_narration': { slideIndex: { type: 'number' }, objectName: { type: 'string' }, advanceAfterTime: { type: 'number' }, video: { type: 'object' } },
	'betterpptx.deck.add_avatar_narration': { slides: { type: 'array', description: 'Per-slide avatar narration results.' }, estimatedRuntimeMs: { type: 'number' } },
	'betterpptx.slide.add_ink': { slideIndex: { type: 'number' }, strokesAdded: { type: 'number' }, pointsAdded: { type: 'number' }, editableAs: { type: 'string' } },
	'betterpptx.slide.add_laser_pointer': { slideIndex: { type: 'number' }, beamObjectName: { type: 'string' }, dotObjectName: { type: 'string' }, editableAs: { type: 'string' } },
	'betterpptx.deck.validate_quality': { ok: { type: 'boolean', description: 'True when no deterministic blocking defects remain.' }, checks: { type: 'array', description: 'Package, design, accessibility, narration, and saved-package gate summaries.' }, blockingIssues: { type: 'array', description: 'Objective issues that should be fixed before delivery.', items: AUTHORING_FINDING_SCHEMA }, warnings: { type: 'array', description: 'Advisory design/accessibility/style findings that do not block save by themselves.', items: AUTHORING_FINDING_SCHEMA }, next: { type: 'object', description: 'Recommended next tool/action.' } },
	'betterpptx.deck.validate_native_visuals': {
		ok: { type: 'boolean' },
		profile: { type: 'string', enum: ['native-visuals', 'g6b-ai-reconstruction'] },
		authoringRoute: { type: 'object', description: 'Immutable authoring-route provenance.', additionalProperties: true },
		nativeRepresentation: { type: 'object', description: 'Semantic native/media classification.', additionalProperties: true },
		packageAudit: { type: 'object', description: 'Package-backed carrier counts and content-hash media binding without package paths or implementation details.', additionalProperties: true },
		issues: { type: 'array', items: { type: 'object', additionalProperties: true } },
	},
	'betterpptx.deck.save': {
		operationId: { type: 'string', description: 'Owner-scoped durable save operation ID. Pass unchanged to operation.read_file or operation.status; identical save retries return this same ID.' },
		durableOperation: { type: 'object', description: 'Durable save state and replay provenance.' },
		authoringRoute: { type: 'object', description: 'Route provenance bound to the published artifact.', additionalProperties: true },
		outputFormat: { type: 'string', description: 'Published package format. Public publication currently returns pptx; the verification evidence identifies whether release preview or production non-rendering policy applied.' },
		bytes: { type: 'number', description: 'Published artifact size in bytes.' },
		slideCount: { type: 'number', description: 'Slides in the published deck.' },
		packageSha256: { type: 'string', description: 'SHA-256 of the exact published PPTX bytes. Under release-powerpoint it equals the frozen preview package; under production-non-rendering it binds the delivered package to deterministic validation evidence.' },
		previewVerification: { type: 'object', description: 'Current-version proof containing packageSha256, validationEvidenceSha256, validation verification, previewed and remaining slide indexes, completion, deckVersion, and batchLimit.' },
		verification: { type: 'object', description: 'Deployment-selected verification evidence. Production-non-rendering records renderPerformed:false, policy, package binding, deterministic validation evidence, and media/timing inspection without claiming PowerPoint preview.' },
		selectionVerification: { type: 'object', description: 'Saved-package proof that required AI-authored native selections survived serialization without substitution.' },
		artifact: { type: 'object', description: 'Opaque delivery state and expiry for the published artifact.' },
		downloadUrl: { type: 'string', description: 'Browser-usable link for the published artifact, valid for up to 12 hours and capped at its original expiry. Anyone possessing this link can download until its expiry; recovery does not extend the file lifetime.' },
		downloadName: { type: 'string', description: 'Suggested user-facing download file name.' },
		idempotentReplay: { type: 'boolean', description: 'True when this response replays an earlier call with the same idempotency key.' },
	},
}

const SPECIFIC_DATA_REQUIRED = {
	'betterpptx.help.capabilities': [
		'schemaVersion', 'product', 'detail', 'deckType', 'requestProfile',
	'recommendedMode', 'authoringSurface',
	'capabilityOverview', 'motion', 'narration', 'responseBudget', 'nextCalls',
	'authoringPrinciples', 'authoringApi',
		'capabilityDiscovery', 'requiredTools', 'optionalTools', 'progressiveDiscovery',
	],
	'betterpptx.help.workflow': [
		'schemaVersion', 'product', 'detail', 'deckType', 'recommendedMode',
		'authoringSurface', 'releaseInfrastructure', 'authoritySummary', 'capabilityDiscovery',
		'recommendedFirstCalls', 'phases', 'routing', 'progressiveDiscovery',
		'qualityGates', 'fallbackPolicy', 'responseBudget', 'nextAction',
	],
	'betterpptx.avatar.attach_result': [
		'ok', 'slideIndex', 'objectName', 'video', 'advanceAfterTime', 'timing', 'cues', 'captions', 'mode', 'warnings',
	],
}
const CLOSED_SPECIFIC_DATA = new Set(['betterpptx.help.capabilities', 'betterpptx.help.workflow', 'betterpptx.help.tool_recipe', 'betterpptx.equation.catalog', 'betterpptx.smartart.catalog', 'betterpptx.avatar.attach_result'])

const READONLY = /\.(capabilities|workflow|tool_recipe|version|status|get_profile|director_status|voices|list|list_comments|summary|inspect|preview|search|job_status|inspect_layouts|editability_report|export_spec|analyze_reference|compare_reference|validate|validate_design|validate_accessibility|validate_quality|validate_native_visuals|validate_narration|validate_avatar_narration|list_shapes|inspect_shapes|read_file|read_json|list_dir|find|catalog|recommend|sample_palette|list_xml_groups|polygon_to_custgeom|simplify_path|from_svg|fetch|explain_plan|portal)$/
const IDEMPOTENT_DECK_MUTATION_TOOLS = new Set([
	'betterpptx.deck.generate_from_spec',
	'betterpptx.deck.define_message_architecture',
	'betterpptx.deck.assign_slide_roles',
	'betterpptx.deck.define_design_system',
	'betterpptx.deck.set_show_settings',
	'betterpptx.deck.define_master',
	'betterpptx.deck.define_layout',
	'betterpptx.deck.load_template',
	'betterpptx.deck.audit_layouts',
	'betterpptx.deck.autoplay',
	'betterpptx.deck.sections',
	'betterpptx.deck.add_summary_zoom',
	'betterpptx.deck.set_transitions_all',
	'betterpptx.deck.add_narration',
	'betterpptx.deck.add_avatar_narration',
	'betterpptx.deck.transform_shapes',
	'betterpptx.deck.revise',
	'betterpptx.deck.save',
	'betterpptx.slide.add',
	'betterpptx.slide.update',
	'betterpptx.slide.duplicate',
	'betterpptx.slide.delete',
	'betterpptx.slide.reorder',
	'betterpptx.slide.add_text',
	'betterpptx.slide.add_equation',
	'betterpptx.slide.add_shape',
	'betterpptx.slide.add_connector',
	'betterpptx.slide.add_group',
	'betterpptx.slide.add_comment',
	'betterpptx.slide.resolve_comment',
	'betterpptx.slide.add_smartart',
	'betterpptx.slide.add_image',
	'betterpptx.slide.add_cameo',
	'betterpptx.slide.add_zoom',
	'betterpptx.slide.add_section_zoom',
	'betterpptx.slide.add_chart',
	'betterpptx.slide.add_table',
	'betterpptx.slide.add_media',
	'betterpptx.slide.add_model3d',
	'betterpptx.slide.add_freeform',
	'betterpptx.slide.add_ink',
	'betterpptx.slide.add_laser_pointer',
	'betterpptx.custom_geometry.insert',
	'betterpptx.custom_geometry.insert_svg',
	'betterpptx.slide.add_notes',
	'betterpptx.slide.add_narration',
	'betterpptx.slide.add_avatar_narration',
	'betterpptx.avatar.attach_result',
	'betterpptx.slide.revise',
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
	'betterpptx.billing.redeem_promo',
	'betterpptx.deck.new',
	'betterpptx.deck.generate_from_spec',
	'betterpptx.deck.recreate_reference',
	'betterpptx.deck.open_existing',
	'betterpptx.deck.open_uploaded',
	'betterpptx.deck.dispose',
	'betterpptx.io.write_file',
	'betterpptx.narration.synthesize',
	'betterpptx.avatar.render_job',
	'betterpptx.assets.upload',
		'betterpptx.sketchfab.import',
		'betterpptx.assets.generate_model3d',
		'betterpptx.assets.generate_rigged3d',
	])
// Tools that discard or delete user work. Claude always confirms a destructive
// tool before running it, so the hint stays true even when the call is
// replay-safe (idempotent).
const DESTRUCTIVE_TOOLS = new Set([
	'betterpptx.deck.dispose',
	'betterpptx.slide.delete_shapes',
	'betterpptx.io.write_file',
])

for (const t of TOOLS) {
	if (MODEL3D_PUBLIC_OPERATION_SCHEMAS[t.name]) t.inputSchema = JSON.parse(JSON.stringify(MODEL3D_PUBLIC_OPERATION_SCHEMAS[t.name]))
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
	if (!t.outputSchema && !t.protocolRawOutput) {
		if (SPECIFIC_DATA[t.name]) {
			const required = SPECIFIC_DATA_REQUIRED[t.name]
			const dataSchema = {
				type: 'object',
				description: 'Result payload.',
				properties: SPECIFIC_DATA[t.name],
				...(required ? { required } : {}),
				additionalProperties: !CLOSED_SPECIFIC_DATA.has(t.name),
			}
			t.outputSchema = {
				type: 'object',
				description: 'BetterPPTX result envelope.',
				properties: { ok: { type: 'boolean', description: 'True on success.' }, data: dataSchema, error: ERROR_SCHEMA },
				required: ['ok'],
				additionalProperties: true,
			}
		} else {
			t.outputSchema = RESULT_OUTPUT_SCHEMA
		}
	}
	if (!t.annotations) t.annotations = { title: t.title || t.name, readOnlyHint: READONLY.test(t.name), destructiveHint: false }
	// Hosts may project or defer tools according to MCP safety annotations. Keep
	// these facts truthful and explicit so a non-destructive write-capable route
	// is not mistaken for a destructive or open-world action. Estimation and
	// usage readback are always non-mutating; governed mutations are idempotent
	// when their public contract accepts a stable idempotency key.
	if (['betterpptx.billing.estimate', 'betterpptx.billing.usage_summary'].includes(t.name)) {
		t.annotations.readOnlyHint = true
		t.annotations.destructiveHint = false
		t.annotations.openWorldHint = false
	}
	if (IDEMPOTENT_DECK_MUTATION_TOOLS.has(t.name) || IDEMPOTENT_SESSION_MUTATION_TOOLS.has(t.name)) {
		t.annotations.idempotentHint = true
		t.annotations.destructiveHint = false
		t.annotations.openWorldHint ??= false
	}
	if (DESTRUCTIVE_TOOLS.has(t.name)) t.annotations.destructiveHint = true
	// Connector directory review requires a human-readable title on every tool.
	t.annotations.title ??= t.title || t.name
}

export function codexSafeToolName(name) {
	return String(name || '').replace(/[^A-Za-z0-9_-]/g, '_')
}

export const TOOL_NAME_ALIASES = Object.fromEntries(
	TOOLS
		.map(t => [codexSafeToolName(t.name), t.name])
		.filter(([alias, canonical]) => alias && alias !== canonical)
)

export function canonicalToolName(name) {
	const value = String(name || '')
	return TOOL_NAME_ALIASES[value] || value
}

export function isToolNameAlias(name) {
	return Object.prototype.hasOwnProperty.call(TOOL_NAME_ALIASES, String(name || ''))
}

export function normalizeToolNameProfile(profile = process.env.BETTERPPTX_TOOL_NAME_PROFILE || 'canonical') {
	const value = String(profile || 'canonical').trim().toLowerCase()
	if (['codex', 'safe', 'safe-only', 'alias', 'aliases', 'underscore', 'identifier', 'identifier-safe'].includes(value)) return 'aliases'
	if (['both', 'dual', 'canonical-and-aliases', 'aliases-and-canonical'].includes(value)) return 'both'
	return 'canonical'
}

function cloneToolDefinition(tool) {
	return JSON.parse(JSON.stringify(tool))
}

function aliasToolDefinition(tool) {
	const clone = cloneToolDefinition(tool)
	const alias = codexSafeToolName(tool.name)
	clone.name = alias
	clone.description = `${clone.description || ''} Equivalent identifier-safe tool name for ${tool.name}.`.trim()
	if (clone.annotations?.title) clone.annotations.title = `${clone.annotations.title} (${alias})`
	return clone
}

export function toolListForNameProfile(tools, profile = process.env.BETTERPPTX_TOOL_NAME_PROFILE || 'canonical') {
	const normalized = normalizeToolNameProfile(profile)
	if (normalized === 'canonical') return tools
	const aliases = tools
		.map(aliasToolDefinition)
		.filter(tool => tool.name && tool.name !== canonicalToolName(tool.name))
	if (normalized === 'aliases') return aliases
	return [
		...tools,
		...aliases,
	]
}

export function rewriteToolNamesForProfile(value, profile = process.env.BETTERPPTX_TOOL_NAME_PROFILE || 'canonical') {
	if (normalizeToolNameProfile(profile) === 'canonical') return value
	const names = TOOLS.map(t => t.name).sort((a, b) => b.length - a.length)
	const rewriteString = text => {
		let out = String(text)
		for (const name of names) out = out.replaceAll(name, codexSafeToolName(name))
		return out
	}
	if (typeof value === 'string') return rewriteString(value)
	if (!value || typeof value !== 'object') return value
	if (Array.isArray(value)) return value.map(item => rewriteToolNamesForProfile(item, profile))
	const clone = {}
	for (const [key, child] of Object.entries(value)) clone[key] = rewriteToolNamesForProfile(child, profile)
	return clone
}

export const TOOL_NAMES = TOOLS.map(t => t.name)
