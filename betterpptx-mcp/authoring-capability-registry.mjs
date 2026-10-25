// Public, semantic capability contract for the Authoring Excellence Director.
//
// This registry deliberately contains no repository paths, provider names,
// package internals, or private evidence locations.  It teaches a cold AI
// what it may ask for and what the engine guarantees; it does not design a
// slide or expose implementation details.

import { createHash } from 'node:crypto'
import { PUBLIC_SPEC_FIRST_TOOLS } from './blackbox.mjs'
import { authoringMotionCatalog } from './ir/authoring-motion-catalog.mjs'
import { CONTENT_REPRESENTATION_CONTRACT } from './ir/layout-engine.mjs'
import { PRESENTER_PERFORMANCE_CONTRACT, PRESENTER_PERFORMANCE_LIMITS } from './presenter-performance-contract.mjs'
import { publicGeneratedImagePolicy } from './verification-policy.mjs'
import { publicCompositionModes } from './ir/authoring-geometry-policy.mjs'
import { publicCreativeAuthorityModes } from './ir/authoring-authority-policy.mjs'

export const PUBLIC_CAPABILITY_REGISTRY_SCHEMA_VERSION = 'betterpptx.authoring-capability-registry.v2'
export const PUBLIC_CAPABILITY_REGISTRY_VERSION = '2026-09-24.1'
export const PUBLIC_CAPABILITY_OVERVIEW_SCHEMA_VERSION = 'betterpptx.public-capability-overview.v1'
export const PUBLIC_CAPABILITY_DISCOVERY_DESCRIPTION = 'Canonical, read-only first discovery for BetterPPTX. It returns the complete family map, extended visual layers, motion and narration contracts, current readiness boundaries, and the exact public follow-up calls.'

const BASE_GATES = Object.freeze({
	reference: false,
	uiEvidence: false,
	package: false,
	editability: false,
	visual: false,
	mcp: true,
	blackBox: true,
	release: false,
})

const capability = (entry) => Object.freeze({
	...entry,
	gates: Object.freeze({ ...BASE_GATES, ...(entry.gates || {}) }),
	aiOwns: Object.freeze([...(entry.aiOwns || [])]),
	engineOwns: Object.freeze([...(entry.engineOwns || [])]),
	nativeModes: Object.freeze([...(entry.nativeModes || [])]),
	fallbackModes: Object.freeze([...(entry.fallbackModes || [])]),
	selectionSignals: Object.freeze([...(entry.selectionSignals || [])]),
	publicTools: Object.freeze([...(entry.publicTools || [])]),
})

export const AUTHORING_CAPABILITY_REGISTRY = Object.freeze([
	capability({
		id: 'charts', label: 'Charts and ChartEx', status: 'external-gates-pending',
		summary: 'Type-specific native chart, color, layout, and ChartEx states.',
		nativeModes: ['native', 'native-composite'], fallbackModes: ['shape-built'],
		aiOwns: ['choose the semantic chart family', 'choose the data story', 'choose the visual intent', 'choose the exact native style/color/layout IDs and record why they fit'],
		engineOwns: ['expose type-specific gallery vocabulary and executable IDs', 'serialize editable chart objects exactly as requested', 'verify selected IDs and chart relationships in the saved package'],
		selectionSignals: ['comparison', 'trend', 'composition', 'distribution', 'hierarchy', 'correlation', 'ranking', 'process'],
		publicTools: ['betterpptx.chart.recommend', 'betterpptx.deck.generate_from_spec'],
		gates: { reference: true, uiEvidence: true, package: true, editability: true, visual: true },
		evidence: { semanticTypes: 26, executableStates: 1760, packageBackedStates: 1701, nativeEngineColorFallbacks: 59, baseComTypes: 85, chartObjects: 723, chartExObjects: 209, galleryCounts: 'vary by chart type' },
		issues: ['Immutable release provenance and owner/deployment gates remain external.'],
	}),
	capability({
			id: 'smartart', label: 'SmartArt', status: 'external-gates-pending',
		summary: 'Native diagram data/layout/style/color parts with semantic layout selection.',
		nativeModes: ['native'], fallbackModes: ['shape-built', 'preserve-only'],
		aiOwns: ['choose diagram language', 'choose hierarchy/process/list intent', 'choose content and emphasis', 'choose exact native layout/style/color IDs and justify any custom exception'],
		engineOwns: ['expose captured layout/style/color vocabulary and executable IDs', 'build native diagram parts exactly as requested', 'keep text, hierarchy roles, and relationships editable', 'verify requested IDs without substitution'],
		selectionSignals: ['hierarchy', 'process', 'cycle', 'relationship', 'matrix', 'pyramid', 'picture', 'timeline'],
		publicTools: ['betterpptx.smartart.catalog', 'betterpptx.slide.add_smartart', 'betterpptx.deck.generate_from_spec'],
		evidence: { layoutDefinitions: 164, executableLayoutDefinitions: 176, currentOfficeExtensionLayouts: 12, currentOfficeOnlyLayoutDefinitions: 0, quickStyles: 14, colorStyles: 38, mcpStyleColorCrossProductPairs: 532, engineArtifactComReadback: 164, comApplicabilityReplay: { layouts: 176, appliedLayouts: 176, quickStyleProbes: 2464, colorStyleProbes: 6688, failures: 0 }, ribbonApplicability: { capturedLayouts: 176, observedLayouts: 176, quickStyleLayouts: 176, colorLayouts: 176, uniqueQuickStyleIds: 14, uniqueColorIds: 38, acceptedQuickStyleTiles: 2464, acceptedColorTiles: 6688, claimScope: 'captured-layouts-only; complete requires QuickStyles and Colors' }, currentOfficeOnlyMcpReplay: { layouts: 12, serialized: 12, failures: 0 }, currentOfficeReconciliation: 'RECONCILIATION_VERIFIED', pictureLayoutsWithEmbeddedImages: 37, assistantRolePolicy: 'native-asst-semantic-node; MCP/package/COM verified' },
			issues: ['The 176-layout / 14-style / 38-color vocabulary, per-layout Ribbon evidence, picture binding, supported assistant-role mapping, and three cold-AI choice samples have MCP/package/PowerPoint COM proof; owner release approval remains open.'],
	}),
	capability({
			id: 'tables', label: 'Tables', status: 'external-gates-pending',
		summary: 'Semantic tables with native or visual-adapted treatment selected by intent.',
		nativeModes: ['native-table'], fallbackModes: ['visual-adapted', 'preserve-only'],
		aiOwns: ['decide whether a table is the right visual', 'choose emphasis and reading order', 'choose density and story', 'choose the exact native table-style ID'],
		engineOwns: ['expose native and visual table treatment vocabulary', 'preserve merges and borders', 'apply and package-verify the AI-requested treatment', 'keep cells editable'],
		selectionSignals: ['lookup', 'comparison', 'schedule', 'matrix', 'scorecard', 'dense evidence'],
		publicTools: ['betterpptx.table.recommend', 'betterpptx.slide.add_table', 'betterpptx.deck.generate_from_spec'],
		evidence: { visualAdaptedPresets: 7, nativeTablePresets: 1, nativeTableStylesReplayTiles: 74, executableNativeStyleCatalog: 74, embeddedTableStylesXml: 74, mcpOpaqueStyleReplay: { selected: 1, packageStyleCount: 74, nativeIdMatch: true, opaqueFieldLeak: false }, galleryCountsAreSpecimenAndThemeSpecific: true },
			issues: ['Light/dark replay, all-74 rendered atlas, and the 320 conditional-flag matrix are engine-verified; owner release approval remains open.'],
	}),
	capability({
			id: 'wordart-text3d', label: 'WordArt and Text3D', status: 'external-gates-pending',
		summary: 'Semantic display typography with canonical transform and 3D option vocabularies.',
		nativeModes: ['native'], fallbackModes: ['plain-text'],
		aiOwns: ['decide whether expressive type serves the message', 'choose hierarchy and emphasis'],
		engineOwns: ['expose transform/effect vocabulary and executable IDs', 'serialize the AI-requested text effects', 'preserve text editability'],
		selectionSignals: ['title emphasis', 'section marker', 'hero statement', 'dimensional label'],
		publicTools: ['betterpptx.options.catalog', 'betterpptx.deck.generate_from_spec'],
		evidence: { wordArtTransforms: 41, quickStylesReplayTiles: 20, shapeEffectsCategoryEvidence: 7, mcpEngineProof: { canonicalWordArtTransforms: 41, text3dMaterials: 15, text3dLightRigs: 27, text3dBevels: 12, editableNativeXml: true, parserErrors: 0 }, galleryCountsAreSpecimenAndThemeSpecific: true },
			issues: ['The 20 Quick Styles, 41 transforms, 15 materials, 27 light rigs, 12 bevels, and editable native effect XML are cataloged and executable; owner release approval remains open.'],
	}),
	capability({
			id: 'shapes-gradients', label: 'Shapes, gradients, and effects', status: 'external-gates-pending',
		summary: 'Native PowerPoint primitives whose geometry and effects follow semantic intent.',
		nativeModes: ['native'], fallbackModes: ['preserve-only'],
		aiOwns: ['choose the visual metaphor', 'choose depth level and restraint', 'choose composition'],
		engineOwns: ['expose geometry/fill/effect vocabulary and executable IDs', 'serialize the AI-requested fills/effects', 'preserve editability', 'reject opaque native blocks'],
		selectionSignals: ['callout', 'container', 'flow', 'emphasis', 'depth', 'background'],
		publicTools: ['betterpptx.options.catalog', 'betterpptx.slide.add_shape', 'betterpptx.deck.generate_from_spec'],
		evidence: { gradientDirections: 15, shapeStylesReplayTiles: 77, shapeEffectsCategoryEvidence: 7, mcpEngineProof: { shadow: true, glow: true, reflection: true, softEdges: true, effect3D: true, editableNativeXml: true, parserErrors: 0 }, galleryCountsAreSpecimenAndThemeSpecific: true },
			issues: ['The 77 Shape Styles, supported gradients/effects, and editable shape-level 3-D serialization are cataloged and executable; owner release approval remains open.'],
	}),
	capability({
		id: 'layouts-themes-masters', label: 'Layouts, themes, and masters', status: 'partial',
		summary: 'AI-authored exact geometry with optional theme, master, and slide-role consistency.',
		nativeModes: ['native'], fallbackModes: ['default-layout'],
		aiOwns: ['choose design language', 'choose slide role', 'choose balance and visual rhythm', 'author exact rectangles in ai-authored-geometry-v1 or observed pixel frames in visual-reference-pixels-v1'],
		engineOwns: ['expose layout/theme/master vocabulary and executable IDs', 'validate and serialize AI-authored exact geometry in every active authoring mode', 'report off-slide and fit findings without moving objects', 'apply inherited theme/master rules', 'audit collisions'],
		selectionSignals: ['role', 'density', 'narration', 'evidence weight', 'light/dark mode'],
		publicTools: ['betterpptx.deck.generate_from_spec', 'betterpptx.help.capabilities', 'betterpptx.deck.define_design_system', 'betterpptx.deck.define_layout'],
		evidence: { semanticLayoutApi: true, layoutAuditApi: true },
		issues: ['Exhaustive native gallery/theme/master capture and render comparison remain open.'],
	}),
	capability({
		id: 'media-images-avatar', label: 'Images, video, and identity media', status: 'external-gates-pending',
		summary: 'Governed media with semantic crop, placement, timing, and identity-quality boundaries.',
		nativeModes: ['native-media'], fallbackModes: ['poster-image', 'speaker-notes'],
		aiOwns: ['choose whether media improves the message', 'choose crop emphasis and visual role', 'choose timing intent'],
		engineOwns: ['enforce consent and asset policy', 'validate and preserve AI-authored media frame/crop', 'serialize media relationships', 'keep provider details opaque'],
		selectionSignals: ['identity', 'demonstration', 'evidence', 'hero visual', 'narration'],
		publicTools: ['betterpptx.deck.generate_from_spec', 'betterpptx.assets.upload', 'betterpptx.assets.search_stock', 'betterpptx.narration.voices', 'betterpptx.narration.get_voice_timing'],
		evidence: { semanticSources: true, nativePictureAndMedia: true, framingAndAdjustments: true, playbackAndTiming: true, accessibilityAndCaptions: true, narration: true },
		issues: ['Owner release, service availability, asset-policy approvals, and identity-media rendering remain external to this native image/media/narration authoring closure.', 'Generated images are allowed when the deployment permits the governed provider route and the caller is authorized; a durable handle must resolve to the exact media bytes before packaging. PowerPoint preview is not a production dependency.'],
	}),
	capability({
		id: 'model3d', label: '3D models and presenters', status: 'partial',
		summary: 'Native 3D assets selected for semantic fit, camera, depth, and presentation role.',
		nativeModes: ['native-3d'], fallbackModes: ['poster-image'],
		aiOwns: ['choose semantic model and role', 'choose camera/depth intent', 'choose whether 3D is warranted', 'choose an exact unranked presenter stage treatment when a visible presenter needs grounding'],
		engineOwns: ['expose governed asset and presenter-stage vocabularies', 'validate license/size/dependencies', 'serialize the AI-requested native model parts', 'derive collision-safe presenter-stage geometry from the resolved presenter frame', 'apply safe camera defaults'],
		selectionSignals: ['hero', 'exploded view', 'spatial concept', 'product', 'presenter'],
		publicTools: ['betterpptx.assets.catalog', 'betterpptx.deck.generate_from_spec'],
		evidence: { nativeEmbedding: true, formatGallery: 'pending' },
		issues: ['Native 3D Format gallery, dependency pinning, owner approvals, and visual corpus remain open.'],
	}),
	capability({
		id: 'equations', label: 'Equations and math', status: 'partial',
		summary: 'Native equation authoring where math is part of the message rather than decoration.',
		nativeModes: ['native-equation'], fallbackModes: ['text-math'],
		aiOwns: ['decide math representation', 'choose explanatory context and notation'],
		engineOwns: ['expose supported syntax and fallback vocabulary', 'serialize the AI-requested native math', 'preserve equation editability', 'apply only the AI-requested fallback'],
		selectionSignals: ['formula', 'derivation', 'model', 'technical evidence'],
		publicTools: ['betterpptx.equation.catalog', 'betterpptx.slide.add_equation', 'betterpptx.deck.generate_from_spec'],
		evidence: { nativeV1: true },
		issues: ['Inline math, extraction, UnicodeMath/LaTeX, fallback, comparator, and visual coverage remain open.'],
	}),
	capability({
		id: 'structural', label: 'Connectors, groups, comments, and custom geometry', status: 'open',
		summary: 'Structured native objects and preservation paths for complex authored content.',
		nativeModes: ['native', 'native-preserve'], fallbackModes: ['preserve-only'],
		aiOwns: ['choose relationship and grouping semantics', 'choose whether an object is essential'],
		engineOwns: ['bind endpoints', 'maintain transforms', 'preserve supported metadata', 'fail closed where editing is unsafe'],
		selectionSignals: ['relationship', 'flow', 'annotation', 'custom mark'],
		publicTools: ['betterpptx.deck.generate_from_spec', 'betterpptx.slide.add_connector', 'betterpptx.slide.add_group', 'betterpptx.slide.add_comment', 'betterpptx.slide.list_comments', 'betterpptx.slide.resolve_comment', 'betterpptx.custom_geometry.catalog'],
		evidence: { roadmapTrack: true, mcpEngineProof: { nativeConnectors: true, connectorTypes: 2, endpointBindings: 4, nativeCustomGeometry: true, freeformGeometry: true, nativeGroups: true, groupedChildren: 2, nativeReviewComments: true, commentPersistence: 'classic-native-with-typed-resolution-fallback', editableNativeXml: true, opaqueNativeBlocks: 0, parserErrors: 0 } },
		issues: ['Native extraction, richer modern comment threading, broader round-trip editability beyond the verified connector/custom-geometry/group/comment lanes, visual corpus, and release evidence remain open; semantic connector, custom-geometry, group, and basic native review-comment authoring are now engine-verified.'],
	}),
	capability({
		id: 'motion-transitions-morph', label: 'Motion, transitions, and Morph', status: 'partial',
		summary: 'Narration-led timing plus AI-selected exact semantic presenter motion, transitions, and Morph.',
		nativeModes: ['native-timing', 'editable-native-3d-presenter-motion'], fallbackModes: ['static'],
		aiOwns: ['choose tempo, emphasis, and reveal story', 'choose motion restraint', 'choose exact public motion IDs per presenter and slide', 'choose explicit target layering and occlusion policy when objects overlap the presenter'],
		engineOwns: ['expose the factual motion catalog', 'validate exact IDs and the 18-motion bundle ceiling', 'execute and package the exact ordered selection', 'derive timing from narration', 'measure/report spatial contact, validate named layering targets, and compile the exact authored native order without inventing a conflict solution'],
		selectionSignals: ['reveal', 'compare', 'focus', 'sequence', 'narration', 'presenter-motion'],
		publicTools: ['betterpptx.authoring.catalog', 'betterpptx.deck.generate_from_spec', 'betterpptx.deck.validate_narration', 'betterpptx.deck.validate_quality'],
		evidence: { policy: true, maximumPerPresenterBundle: 18, exhaustivePlaybackCorpus: 'powerpoint-oracle' },
		issues: ['Final visual acceptance and production release remain separate gates; executable catalog availability does not grant release approval.'],
	}),
])

const aliases = Object.freeze({
	chart: 'charts', charts: 'charts', chartex: 'charts', area: 'charts', bar: 'charts', bar3d: 'charts',
	line: 'charts', pie: 'charts', doughnut: 'charts', radar: 'charts', scatter: 'charts', bubble: 'charts',
	funnel: 'charts', waterfall: 'charts', histogram: 'charts', pareto: 'charts', boxwhisker: 'charts',
	treemap: 'charts', sunburst: 'charts', regionmap: 'charts', combo: 'charts', smartart: 'smartart', table: 'tables',
	wordart: 'wordart-text3d', text3d: 'wordart-text3d', shape: 'shapes-gradients', shapes: 'shapes-gradients',
	gradient: 'shapes-gradients', layout: 'layouts-themes-masters', theme: 'layouts-themes-masters',
	media: 'media-images-avatar', image: 'media-images-avatar', avatar: 'media-images-avatar',
	'3d': 'model3d', model: 'model3d', equation: 'equations', math: 'equations',
	connector: 'structural', group: 'structural', comments: 'structural', geometry: 'structural',
	motion: 'motion-transitions-morph', 'presenter-motion': 'motion-transitions-morph', kinetic: 'motion-transitions-morph', transition: 'motion-transitions-morph', morph: 'motion-transitions-morph',
})

// This is the single semantic contract behind the family map, the focused
// family catalog, the capability overview, and the public tool descriptions.
// Counts and live readiness are deliberately not stored here: they are
// measured by the relevant catalog/runtime call and returned with a timestamp.
const PUBLIC_FAMILY_CONTRACTS = Object.freeze({
	charts: {
		audienceResult: 'The audience sees an editable chart or an explicitly labeled shape-built visual that explains the selected data story.',
		howToUse: 'Choose the semantic chart family, exact style/color/layout IDs, and truthful data; compile through the deck spec.',
		extendedCapabilities: ['native chart types', 'ChartEx where the target accepts it', 'structured data, labels, units, summaries, and semantic color roles'],
		implementation: 'Native editable chart objects are the primary carrier; shape-built charts are an explicit fallback.',
		editability: 'Native chart and data structures remain editable; fallback geometry is editable as shapes but is not a native chart.',
		controls: ['chart family/type', 'data and series', 'style/color/layout selectors', 'labels, units, titles, and summaries'],
		carriers: ['native chart', 'ChartEx', 'shape-built fallback'],
		requirements: ['structured data with truthful units', 'AI-selected exact variant recorded in the selection manifest'],
		limits: ['ChartEx and some gallery states depend on the target PowerPoint feature set.', 'Visual acceptance is separate from catalog availability.'],
		recovery: ['Use the native chart route when the selected type is available.', 'Use an explicitly stated shape-built fallback only when native authoring cannot express the requested story.'],
		examples: [{ intent: 'trend comparison', tool: 'betterpptx.chart.recommend', request: { query: 'monthly growth trend' } }],
	},
	smartart: {
		audienceResult: 'The audience sees a structured process, hierarchy, cycle, relationship, or picture-node diagram instead of a bullet wall.',
		howToUse: 'Choose an exact native layout/style/color and named semantic nodes, then compile through the deck spec.',
		extendedCapabilities: ['native SmartArt data/layout/style/color parts', 'picture-node layouts', 'hierarchy, process, cycle, relationship, matrix, pyramid, and timeline semantics'],
		implementation: 'Native SmartArt is preferred; shape-built diagrams and preserve-only imported content are explicit alternatives.',
		editability: 'Native diagram text, hierarchy, and relationships remain editable; shape-built diagrams remain editable as ordinary objects.',
		controls: ['layout, quick style, color style', 'node text and hierarchy roles', 'picture-node media handles', 'relationships and emphasis'],
		carriers: ['native SmartArt', 'editable shape-built diagram', 'preserve-only imported SmartArt'],
		requirements: ['semantic node topology', 'AI-selected exact layout/style/color IDs when native'],
		limits: ['Office applicability varies by layout family.', 'A native-looking fallback is not silently substituted for a requested native layout.'],
		recovery: ['Query the focused SmartArt catalog for a supported native layout.', 'If native authoring is not available, choose an editable shape-built diagram or preserve the imported object.'],
		examples: [{ intent: 'process reveal', tool: 'betterpptx.smartart.catalog', request: { query: 'four-step process', limit: 8 } }],
	},
	tables: {
		audienceResult: 'The audience sees readable, structured rows and columns with native emphasis, headers, merges, and summaries.',
		howToUse: 'Choose the table treatment and exact style, supply truthful headers/rows, and validate density after compile.',
		extendedCapabilities: ['native table styles', 'cell fills, borders, margins, merges, banding, header rows, and readable summaries'],
		implementation: 'Native tables are the primary carrier; visual table treatments remain explicit and structured.',
		editability: 'Rows, cells, text, merges, fills, and borders remain editable in the native table carrier.',
		controls: ['header/body structure', 'banded rows and columns', 'cell fill/border', 'padding, column width, row height, and summary'],
		carriers: ['native table', 'editable shape/card fallback only when explicitly requested'],
		requirements: ['structured headers and rows', 'truthful units and an accessible summary for dense evidence'],
		limits: ['Some Office-specific table flags are structured-partial and must be verified after save.', 'Dense tables still need visual review.'],
		recovery: ['Reduce density or split the evidence across slides before choosing a non-native fallback.', 'Validate the saved table and its accessibility summary.'],
		examples: [{ intent: 'decision matrix', tool: 'betterpptx.table.recommend', request: { query: 'decision matrix' } }],
	},
	'wordart-text3d': {
		audienceResult: 'The audience sees expressive but readable editable type with gradient glyphs or controlled dimensional depth.',
		howToUse: 'Choose expressive type only for a message-bearing headline or label, then select typed text/3D options.',
		extendedCapabilities: ['editable WordArt transforms', 'gradient glyph fills', 'dimensional text', 'bevel, extrusion, contour, material, light-rig, shadow, glow, and reflection controls'],
		implementation: 'Native text and WordArt carriers are preferred; plain text is the explicit readable fallback.',
		editability: 'Text remains editable in PowerPoint; expressive fill and dimensional controls are semantic options, not raster decoration.',
		controls: ['transform and fit', 'glyph fill/gradient', 'bevel and extrusion', 'contour/material/light rig', 'spacing and emphasis effects'],
		carriers: ['native text/WordArt', 'native text3D', 'plain editable text fallback'],
		requirements: ['a communicative reason for expressive type', 'exact option IDs or typed parameters selected by the AI'],
		limits: ['Dimensional rendering is target-version dependent and needs visual review.', 'Do not use WordArt merely to demonstrate coverage.'],
		recovery: ['Keep the wording and hierarchy, then fall back to editable text with explicit style controls if a dimensional option is unavailable.'],
		examples: [{ intent: 'dimensional headline', tool: 'betterpptx.options.catalog', request: { surface: 'text3D', format: 'summary' } }],
	},
	'shapes-gradients': {
		audienceResult: 'The audience sees native panels, accents, diagrams, and depth effects whose fills and geometry remain editable.',
		howToUse: 'Choose the semantic primitive and supported effect parameters; use the native shape route and verify visual restraint.',
		extendedCapabilities: ['native shape primitives', 'linear/radial gradients and transformed stops', 'shadow, glow, reflection, blur, soft edge, fill overlay, and 3D effects'],
		implementation: 'Native geometry and effect lists are the primary carrier; complex imported geometry is preserve-only unless a supported editable path is selected.',
		editability: 'Shape geometry, fills, lines, and supported effects remain editable; unsupported effect graphs are not claimed as authorable.',
		controls: ['shape geometry', 'gradient stops/direction/angle', 'line and transparency', 'shadow, glow, reflection, blur, soft edge, fill overlay, and 3D'],
		carriers: ['native shape', 'native custom geometry when supported', 'preserve-only imported effect graph'],
		requirements: ['semantic role or visual metaphor', 'explicit style/effect parameters when the AI wants more than a safe default'],
		limits: ['Effect-graph authoring is not pursued.', 'A catalog entry exposes a control only when its editability status says it is structured.'],
		recovery: ['Remove the unsupported effect while preserving the shape and message.', 'Use custom geometry catalog handles for a proven editable geometry specimen.'],
		examples: [{ intent: 'gradient emphasis panel', tool: 'betterpptx.options.catalog', request: { surface: 'gradient', format: 'summary' } }],
	},
	'layouts-themes-masters': {
		audienceResult: 'The audience sees a coherent deck-wide visual world, hierarchy, safe composition, and consistent slide roles.',
		howToUse: 'Declare audience/story, world, framing, slide roles, and every object frame; the compiler measures fit and serializes the AI-authored geometry without creative repositioning.',
		extendedCapabilities: ['AI-authored exact frames with semantic slide roles', 'theme color/type hierarchy', 'slide masters and layouts', 'placeholders, inheritance, safe bounds, headers/footers, and slide numbering'],
		implementation: 'Semantic design-system, layout, theme, and master contracts are available; exhaustive Office gallery parity remains a separate release gate.',
		editability: 'Layouts, masters, placeholders, inherited theme values, and slide assignments remain editable when authored through their public contract.',
		controls: ['AI-authored object frames and optional named regions', 'theme colors and fonts', 'master/layout inheritance', 'placeholders, margins, header/footer, and slide number policy'],
		carriers: ['theme', 'master', 'layout', 'semantic slide spec'],
		requirements: ['Content/Story, Visual/Design, and Motion/Time declarations', 'AI-authored geometry for visible objects; optional world and slide-role choices'],
		limits: ['The engine measures fit and reports conflicts but never owns or silently changes authored geometry.', 'Target template inheritance may constrain choices.'],
		recovery: ['Revise the exact object frames or optional named regions yourself after inspecting fit findings.', 'For an uploaded deck, preserve unrelated inheritance and express only the intended semantic patch.'],
		examples: [{ intent: 'coherent design system', tool: 'betterpptx.help.tool_recipe', request: { surface: 'theme', detail: 'summary' } }],
	},
	'media-images-avatar': {
		audienceResult: 'The audience sees or hears an authorized picture, video, audio, voice narration, or consented identity presentation.',
		howToUse: 'Choose an opaque permitted asset or voice path, define framing/timing/accessibility, and keep captions separate.',
		extendedCapabilities: ['images and picture adjustments', 'video/audio media', 'licensed/opaque asset handles', 'voice narration', 'identity media with consent', 'captions as separate timed metadata'],
		implementation: 'Media remains a governed asset carrier; native text, shapes, diagrams, and data are preferred for ordinary visuals.',
		editability: 'Media bytes are not editable PowerPoint geometry; frames, crop, timing, alt text, notes, and playback intent remain editable.',
		controls: ['asset handle/source', 'crop and framing', 'alt text and summaries', 'playback/timing', 'voice/narration and caption policy'],
		carriers: ['native picture', 'native audio/video', 'opaque asset handle', 'speaker notes or poster fallback'],
		requirements: ['authorized asset or uploaded bytes', 'consent for identity media', 'accessibility metadata for meaningful media', 'native composition or approved supplied/stock media for production visuals'],
		limits: ['Service/runtime readiness and production approval are separate from the media capability contract.', 'Generic server-side image generation is retired; AI-client-generated, user-supplied, licensed stock, and previously authorized durable image handles remain supported.', 'Publicly available pictures and logos may be supplied by HTTPS URL or connector upload, but public visibility alone does not prove copyright, trademark, or brand-use permission.', 'No default persona is invented for identity media.'],
		recovery: ['Generate or edit bespoke imagery in the AI client, then upload it or use an approved supplied/stock asset.', 'Use a caller-supplied audio/media handle, speaker notes, or an explicit poster image when synthesis or rendering is unavailable.', 'Keep narration documentation even when one runtime stage fails.'],
		examples: [{ intent: 'voice-only narrated slide', tool: 'betterpptx.narration.voices', request: { language: 'en-US' } }],
	},
	model3d: {
		audienceResult: 'The audience sees a native 3D model with an authored camera/depth/pose treatment or an explicitly labeled poster fallback.',
		howToUse: 'Choose an exact compatible model handle and static or motion treatment; compile the asset through the deck spec.',
		extendedCapabilities: ['native 3D asset handles', 'camera/view presets', 'depth and static pose', 'native 3D motion distinction', 'presenter stage treatments'],
		implementation: 'Catalog-selected native 3D is supported; poster-image fallback is explicit and does not claim native 3D editability.',
		editability: 'A native model remains an editable PowerPoint 3D object; the asset mesh itself is not rewritten by the semantic compiler.',
		controls: ['opaque model handle', 'view/camera preset', 'depth/framing', 'static pose and presenter-stage treatment'],
		carriers: ['native 3D model', 'native media poster fallback'],
		requirements: ['compatible licensed asset handle', 'size and target compatibility checks', 'static pose or motion policy when a presenter is present'],
		limits: ['Native 3D motion is distinct from ordinary object animation and presenter performance.', 'Asset availability does not imply production visual approval.'],
		recovery: ['Use a catalog asset with compatible limits or a poster image while retaining the semantic role.', 'Do not procedurally invent a replacement mesh.'],
		examples: [{ intent: 'single hero 3D asset', tool: 'betterpptx.assets.catalog', request: { kind: 'model3d', query: 'hero object', maxResults: 8 } }],
	},
	equations: {
		audienceResult: 'The audience sees a readable native equation or an explicitly labeled editable text-math fallback.',
		howToUse: 'Choose supported source syntax and display intent, add context and accessibility text, then validate the carrier.',
		extendedCapabilities: ['native editable equations', 'semantic math structures', 'supported source formats', 'explicit text-math fallback'],
		implementation: 'Native equation output is preferred where the syntax and carrier are supported; text-math fallback is explicit.',
		editability: 'Native equations remain editable in the equation carrier; fallback text remains editable text but is not a native equation.',
		controls: ['source format and syntax', 'equation structure', 'display/inline intent', 'accessible description and fallback'],
		carriers: ['native equation', 'editable text-math fallback'],
		requirements: ['supported source syntax', 'semantic context explaining why the equation matters'],
		limits: ['Unsupported syntax must fail closed or use an explicit fallback.', 'Rendered visual acceptance still matters for complex notation.'],
		recovery: ['Query the equation catalog for a supported template or author a readable text fallback with the limitation recorded.'],
		examples: [{ intent: 'editable formula', tool: 'betterpptx.equation.catalog', request: { query: 'quadratic equation', limit: 8 } }],
	},
	structural: {
		audienceResult: 'The audience sees connected, grouped, annotated, or custom-shaped native structures with meaningful relationships.',
		howToUse: 'Name targets and endpoints, choose a supported structural carrier, and use catalog handles for custom geometry.',
		extendedCapabilities: ['connectors with endpoint binding', 'native groups and transforms', 'custom geometry/freeform paths', 'review comments and annotations', 'preservation-only complex structures'],
		implementation: 'Supported structural lanes are native/editable; unverified imported structures remain preserve-only and fail closed for unsafe edits.',
		editability: 'Connectors, groups, custom geometry, and supported review comments expose semantic edits; preservation-only objects are not promoted silently.',
		controls: ['relationship endpoints', 'group membership/transforms', 'custom geometry handle', 'comment text/status', 'semantic annotation target'],
		carriers: ['native connector', 'native group', 'native custom geometry', 'review-comment carrier', 'preserve-only object'],
		requirements: ['stable object names or semantic handles', 'valid endpoint/relationship semantics', 'explicit reason for custom construction'],
		limits: ['Modern threaded-comment breadth and arbitrary raw structure are not claimed as fully authorable.', 'No raw package passthrough is a public composition route.'],
		recovery: ['Preserve an unsafe object and author a new supported semantic counterpart only when the message requires it.', 'Use custom geometry catalog handles rather than raw path payloads.'],
		examples: [{ intent: 'editable relationship diagram', tool: 'betterpptx.authoring.catalog', request: { family: 'structural', query: 'connector relationship', limit: 8 } }],
	},
	'motion-transitions-morph': {
		audienceResult: 'The audience sees deliberate entrances, emphasis, exits, paths, transitions, Morph continuity, or a verified presenter performance.',
		howToUse: 'Choose named targets, exact motion IDs, carrier, trigger, and one timing policy; validate playback-sensitive claims separately.',
		extendedCapabilities: ['native object animations', 'slide transitions and Morph', 'native 3D motion distinction', 'exact presenter-motion catalog IDs', 'continuous presenter performance', 'semantic interactions and annotations', 'explicit AI-authored presenter/target layering'],
		implementation: 'Motion is a first-class semantic domain. Ordinary native builds, transitions, presenter motion, and performance are distinct carriers with separate readiness evidence.',
		editability: 'Animation, transition, Morph, presenter-performance, and interaction intent remain editable semantic fields; realization is verified after compilation.',
		controls: ['effect/type/direction/trigger/delay/duration/repeat/easing', 'transition/Morph options and advance timing', 'motion ID and ordered selection', '3D transform/action timing', 'interaction targets, annotations, and reduced-motion policy', 'explicit presenterPerformance.layering mode and named target list'],
		carriers: ['content[].animation', 'slides[].timeline', 'slides[].transition', 'slides[].presenterPerformance', 'slides[].interactions'],
		requirements: ['stable target names', 'one authored timing clock', 'exact public motion IDs for presenter catalog selections', 'valid carrier/dependency combination', 'explicit named layering targets when an overlap is intentional'],
		limits: ['The presenter bundle ceiling is 18 selected motions per presenter.', 'Catalog availability, executable source, target compatibility, and production visual acceptance are separate facts.', 'The engine does not infer or automatically repair overlap, occlusion, visibility or z-order policy.'],
		recovery: ['If presenter source readiness is degraded, keep ordinary animation/transition documentation and return a localized motion degradation.', 'Use static or ordinary native builds only when the AI explicitly accepts the change.'],
		examples: [{ intent: 'continuous presenter reveal', tool: 'betterpptx.authoring.catalog', request: { family: 'presenter-motion', query: 'reveal gesture', limit: 8 } }],
	},
})

// Persona terminology is deliberately a separate first-class contract rather
// than another family.  The existing eleven-family taxonomy remains stable
// for clients, while cold clients receive the three owner-defined meanings in
// the default overview and focused recipes.
export const PUBLIC_PERSONA_CAPABILITY_CONTRACT = Object.freeze({
	schemaVersion: 'betterpptx.persona-capability-contract.v1',
	terminology: {
		avatar: 'Avatar means talking-head video only.',
		threeDPresenter: '3D presenter means an existing compatible native 3D character in the presentation.',
		riggedPersona: 'Rigged persona generation means creating a new personalized animation-ready 3D character and is currently partial/experimental.',
	},
	capabilities: Object.freeze([
		Object.freeze({
			id: 'avatar-talking-head-video',
			name: 'Avatar — talking-head video',
			status: 'implemented-with-runtime-and-approval-gates',
			productionReady: null,
			representation: 'Synchronized video with an audio track embedded in the presentation; the person inside the video is not editable native 3D geometry.',
			summary: 'Create a talking-head video from an authorized source image and narration or supplied audio, then embed the synchronized audiovisual result in the presentation. Video placement and playback are editable; the person inside the video is not native 3D geometry.',
			audienceResult: 'The audience sees and hears one synchronized talking-head audiovisual presentation with measured duration and supported autoplay.',
			editability: 'The slide video frame, placement, playback settings, notes, timing, and supported cues remain editable; the rendered person is video content, not a native 3D character.',
			authoringFields: ['authorized source image', 'consentAffirmed', 'script or supplied audio', 'eligible voice and language', 'quality', 'timing and cues', 'video placement', 'autoplay'],
			publicTools: ['betterpptx.narration.get_voice_timing', 'betterpptx.operation.status', 'betterpptx.deck.validate_avatar_narration', 'betterpptx.deck.generate_from_spec'],
			sequence: ['check capability and readiness', 'obtain authorized source image and consent', 'select script/eligible voice or supplied audio', 'estimate and authorize applicable cost', 'start render job', 'poll the stable job id', 'attach the completed asset through the documented route', 'validate media, timing, and playback settings', 'save under the deployment-selected verification policy'],
			readiness: ['catalog availability', 'synthesis or supplied-audio readiness', 'source-image authorization and consent', 'caller entitlement', 'per-voice approval where synthesis is used', 'production approval', 'per-presentation media and timing validation'],
			limits: ['Discovery never starts a render job.', 'Structural media checks do not prove perceptual lip-sync quality.', 'A talking-head video must not be silently duplicated by a standalone narration track with the same audio.'],
			recovery: ['Use supplied audio or an explicit voice-only narration route when the talking-head service is unavailable.', 'Preserve the completed deck and job result when attachment or validation fails; do not silently convert the request into a native 3D presenter.'],
		}),
		Object.freeze({
			id: 'native-3d-presenter',
			name: '3D presenter',
			status: 'implemented-with-source-and-approval-gates',
			productionReady: null,
			representation: 'Existing compatible native 3D character object in PowerPoint, with semantic performance and supported object controls.',
			summary: 'Use an existing compatible native 3D character with supported gestures, continuous performances, stage movement, interactions, and synchronization with narration.',
			audienceResult: 'The audience sees a native 3D character performing selected, catalog-backed actions on the slide.',
			editability: 'PowerPoint placement, view/camera/pose controls, semantic performance choices, and supported timing remain editable; animation embedded inside the model asset is a separate asset-level representation.',
			authoringFields: ['existing opaque model or identity handle', 'exact selectable motion IDs', 'ordered performance actions', 'stage placement', 'interaction targets', 'timing authority', 'narration synchronization'],
			publicTools: ['betterpptx.assets.catalog', 'betterpptx.authoring.catalog', 'betterpptx.help.tool_recipe', 'betterpptx.deck.generate_from_spec'],
			sequence: ['select an available compatible identity/model', 'query exact selectable presenter-motion IDs', 'author the semantic presenter performance and stable targets', 'compile and validate the native package', 'use release playback evidence when qualification requires it'],
			readiness: ['compatible asset availability', 'identity and asset approval', 'motion-source availability', 'caller authorization', 'package validation', 'release playback evidence where claimed'],
			limits: ['An existing 3D presenter does not depend on rigged-persona generation.', 'PowerPoint object animation, model-embedded animation, and semantic performance controls are distinct.', 'Unsupported interaction verbs or unavailable motion IDs fail closed.'],
			recovery: ['Choose another compatible catalog identity or an explicit static native model treatment.', 'If a motion dependency fails, preserve ordinary authoring and return a scoped motion finding.'],
		}),
		Object.freeze({
			id: 'rigged-persona-generation',
			name: 'Rigged persona generation',
			status: 'partial-experimental',
			productionReady: false,
			executableNow: false,
			representation: 'A newly generated 3D asset only after every required generation, rigging, deformation, motion-compatibility, and packaging stage succeeds; it is not automatically a presenter.',
			summary: 'Rigged persona generation: personalized 3D-character generation is under development/partial and not production-ready; consult current stage readiness before use.',
			stageReadiness: [
				{ stage: 'source-preparation', status: 'supported-input-route-with-authorization' },
				{ stage: 'model-generation', status: 'experimental' },
				{ stage: 'rigging-and-skinning', status: 'not-production-qualified' },
				{ stage: 'presenter-motion-compatibility', status: 'unknown-until-verified' },
				{ stage: 'native-package-and-playback', status: 'not-production-qualified' },
			],
			publicTools: ['betterpptx.deck.generate_from_spec', 'betterpptx.assets.upload', 'betterpptx.operation.status'],
			prerequisites: ['explicit experimental authorization', 'two to four approved multiview identity assets', 'remaining rolling custom-persona allowance on the sponsored route or explicit paid authorization', 'current stage-readiness check'],
			limits: ['A callable tool or complete schema does not establish production readiness.', 'Do not route an ordinary 3D-presenter request through this unfinished generator.', 'Unknown stage evidence remains unknown.'],
			recovery: ['Use an existing compatible 3D presenter for production work.', 'If an experimental stage is blocked, preserve the source and report the exact stage rather than claiming an animation-ready result.'],
		}),
	]),
})

export function publicContentRepresentationContract({ compact = false } = {}) {
	if (!compact) return JSON.parse(JSON.stringify(CONTENT_REPRESENTATION_CONTRACT))
	return {
		schemaVersion: CONTENT_REPRESENTATION_CONTRACT.schemaVersion,
		discriminator: CONTENT_REPRESENTATION_CONTRACT.discriminator,
		canonicalKinds: [...CONTENT_REPRESENTATION_CONTRACT.canonicalKinds],
		aliases: { ...CONTENT_REPRESENTATION_CONTRACT.aliases },
		expectations: Object.fromEntries(Object.entries(CONTENT_REPRESENTATION_CONTRACT.expectations).map(([kind, value]) => [kind, {
			capability: value.capability,
			expected: value.expected,
			nativeRequired: value.nativeRequired,
		}])),
		policy: { ...CONTENT_REPRESENTATION_CONTRACT.policy },
	}
}

export function publicPersonaCapabilities() {
	return PUBLIC_PERSONA_CAPABILITY_CONTRACT.capabilities.map(capability => JSON.parse(JSON.stringify(capability)))
}

export const PUBLIC_MOTION_CAPABILITY_CONTRACT = Object.freeze({
	schemaVersion: 'betterpptx.motion-capability-contract.v1',
	identity: 'Motion is an authored semantic domain, not an automatic decoration pass.',
	objectAnimations: {
	status: 'implemented',
	carrier: 'content[].animation or slides[].timeline.cues',
	fields: ['type', 'effect', 'direction', 'trigger', 'delay', 'duration', 'repeatCount', 'autoReverse', 'motionPath', 'motionPathCoordinateSpace', 'motionEasing', 'sequence'],
	triggers: ['withPrevious', 'afterPrevious', 'onClick'],
	composition: ['multiple actions may target one named object', 'withPrevious runs simultaneously', 'afterPrevious sequences actions', 'named targets are required for later edits and cue alignment'],
	},
	transitionsMorph: {
	status: 'implemented',
	carrier: 'slides[].transition and motionTime',
	fields: ['type', 'option', 'speed', 'duration/durationMs', 'advanceOnClick', 'advanceAfterTime', 'direction', 'p14dur'],
	identity: 'Morph-by-object pairs adjacent-slide objects that retain the same semantic name; unmatched objects follow the declared fallback policy.',
	},
	native3dMotion: {
	status: 'separate-carrier',
	definition: 'Native 3D object motion is distinct from ordinary 2D object animation and from presenter choreography.',
	carrier: 'semantic 3D model/presenter motion fields',
	},
	presenterCatalog: {
	status: 'catalog-and-runtime-checked-per-call',
	tool: 'betterpptx.authoring.catalog',
	selector: 'exact public motion IDs selected by the AI',
	limits: { maximumSelectedMotionIdsPerPresenter: PRESENTER_PERFORMANCE_LIMITS.maximumSelectedMotionIdsPerPresenter },
	evidence: ['catalog version and inventory', 'selectable/unavailable row counts', 'source and playback gate status'],
	},
	continuousPerformance: {
	status: 'implemented-when-contract-and-source-are-ready',
	carrier: 'slides[].presenterPerformance',
	fields: ['ordered actions', 'action IDs', 'durationMs', 'cycles', 'source range', 'blendMs', 'transform keyframes/easing', 'entry/exit', 'travel target', 'interaction target', 'explicit target layering mode and target names'],
	limits: PRESENTER_PERFORMANCE_LIMITS,
	sampling: PRESENTER_PERFORMANCE_CONTRACT.sampling,
	definition: 'Several actions by one presenter are authored as one continuous native performance, not unrelated feature clips.',
	},
	layering: {
	status: 'explicit-ai-authored-policy',
	carrier: 'slides[].presenterPerformance.layering',
	fields: ['mode', 'targets'],
	modes: ['presenter-behind-targets'],
	rule: 'The AI chooses whether named targets render above the presenter. The engine measures and reports overlap, validates target identity, and compiles the requested native order; it never infers, rejects or repairs creative layering.',
	},
	interactions: {
	status: 'semantic-compatibility-checked',
	carrier: 'slides[].interactions and named targets',
	verbs: PRESENTER_PERFORMANCE_CONTRACT.interactions.verbs,
	compatibility: ['target exists', 'motion and interaction do not claim the same exclusive carrier', 'reduced-motion policy is explicit'],
	requirements: 'A schema-accepted verb is executable only when its actor, action, named editable target, timing, and carrier are compatible.',
	carry: PRESENTER_PERFORMANCE_CONTRACT.interactions.carry,
	},
	annotations: {
		status: 'implemented-as-explicit-carriers',
		carriers: ['editable ink/custom-geometry strokes', 'editable laser beam/dot overlay', 'timed emphasis animation', 'semantic review comments'],
		modes: ['static', 'recorded/native timing', 'simulated overlay'],
		accessibility: 'Keep annotation meaning in alt text or review metadata; do not treat a laser or ink overlay as the only accessible representation.',
	},
	reducedMotion: {
		status: 'explicit-authoring-policy',
		fields: ['policy', 'staticAlternative'],
		rule: 'A motion request is not silently replaced. If reduced motion is requested, the AI chooses and declares a static or restrained alternative.',
	},
	limits: { maximumSelectedMotionIdsPerPresenter: PRESENTER_PERFORMANCE_LIMITS.maximumSelectedMotionIdsPerPresenter, objectAnimationDurationMs: [0, 86400000], transitionDurationMs: [0, 86400000] },
	timing: {
	contractVersion: 'authoring-excellence.timing.v2',
	masterClock: 'one effective clock per slide: authored/native timing for silent slides, narration only when explicit narration is active, presenter performance for silent continuous performances',
	modes: ['static/manual', 'silent authored timeline', 'silent explicit autoplay', 'narrated', 'silent presenter performance', 'combined narration and presenter performance'],
	precision: 'integer milliseconds for authored cues and measured audio duration',
	evidence: ['none for manual slides', 'authored-transition or authored-autoplay for silent timed slides', 'authored-performance for silent performances', 'estimate then measured-audio for narration', 'narration estimate/measured-audio plus authored-performance when the two are combined'],
	scope: ['slide transition', 'object build', 'presenter performance', 'narration cue', 'autoplay advance'],
	readback: ['authoredIntent', 'normalizedIntent', 'effectiveClock', 'secondaryClock', 'reconciliation', 'performanceFits', 'timingEvidence'],
	},
	dependencies: ['stable objectName or semantic target', 'selected motion ID is present and selectable', 'carrier-specific fields are valid', 'narration audio exists before measured sync is certified'],
	conflicts: ['duplicate presence of presenter video and native presenter performance', 'competing timing clocks', 'unsupported carrier combination', 'reduced-motion or autoplay policy conflict'],
	recovery: ['Return a scoped motion issue with code, scope, retryability, and next public call; preserve unrelated narration and authoring guidance.'],
	nextCalls: [
		{ tool: 'betterpptx.help.tool_recipe', request: { surface: 'animation', detail: 'full' } },
		{ tool: 'betterpptx.authoring.catalog', request: { family: 'presenter-motion', offset: 0, limit: 20 } },
		{ tool: 'betterpptx.deck.validate_narration', request: { deckId: 'returned-deck-handle' } },
	],
})

export const PUBLIC_NARRATION_CAPABILITY_CONTRACT = Object.freeze({
	schemaVersion: 'betterpptx.narration-capability-contract.v1',
	identity: 'Narration is a first-class audio, timing, autoplay, and verification pipeline; captions are a separate accessibility surface.',
	implementation: 'The public contract describes each stage independently so a catalog, runtime, or synthesis failure cannot erase the other stages.',
	publicExposure: ['betterpptx.narration.voices', 'betterpptx.narration.get_voice_timing', 'betterpptx.billing.estimate', 'betterpptx.deck.generate_from_spec', 'betterpptx.deck.validate_narration'],
	editability: 'Scripts, notes, voice selection, cues, timing, autoplay intent, and accessibility metadata remain semantic/editable fields; audio bytes are governed media assets.',
	stages: [
		{ id: 'script-and-notes', input: 'slide script or speaker notes', output: 'authored narration text and semantic notes' },
		{ id: 'approved-voice', tool: 'betterpptx.narration.voices', output: 'voice ID, language, gender/profile facts, and approval status' },
		{ id: 'tts-preparation', tool: 'betterpptx.narration.get_voice_timing', output: 'one measured WAV per authored segment plus an assembled opaque audio reference and immutable preparation manifest; this stage is explicit and happens before the final quote' },
		{ id: 'quote', tool: 'betterpptx.billing.estimate', output: 'final-generation estimate plus opaque quoteBinding bound to the exact spec, measured narration timeline, execution-plan digest, and rate card; reuse does not synthesize a second clip' },
		{ id: 'embedded-audio', output: 'native slide audio/media carrier' },
		{ id: 'measured-timing', output: 'integer-millisecond duration, cues, padding, and advance plan' },
		{ id: 'visual-sync', output: 'native object builds and transitions aligned to the narration clock' },
		{ id: 'autoplay', output: 'slide show advance/playback intent' },
		{ id: 'verification', tool: 'betterpptx.deck.validate_narration', output: 'package, timing, cue, and autoplay findings' },
	],
	readinessDimensions: [
		{ dimension: 'catalog', evidence: 'catalogAvailable, listedVoiceCount, approvedVoiceCount' },
		{ dimension: 'synthesis-runtime', evidence: 'synthesisRuntimeAvailable and a bounded readiness reason' },
		{ dimension: 'environment-mode', evidence: 'mode; development is not production acceptance' },
		{ dimension: 'production-approval', evidence: 'productionReady plus productionApprovedVoiceCount and lineage review counts' },
		{ dimension: 'caller-authorized', evidence: 'the caller may select only voices returned by the current public catalog and entitlement boundary' },
	],
	supportedFields: ['script', 'notes', 'text', 'segments[].id', 'segments[].text', 'segments[].slideId', 'segments[].gapBeforeMs', 'segments[].gapAfterMs', 'voice', 'language/lang', 'gender', 'speaker', 'lengthScale', 'noiseScale', 'noiseWScale', 'audio handle', 'preparedNarration.manifestHandle', 'preparedNarration.preparationId', 'preparedNarration.segmentIds', 'preparedNarration.slideId', 'cues', 'atMs/endMs', 'startDelayMs', 'expectedDurationMs', 'paddingMs', 'timingToleranceMs', 'autoplay'],
	timing: { unit: 'milliseconds', precision: 'integer millisecond authored anchors; measured audio duration is authoritative for advance', anchors: ['audio start', 'phrase/word cue when supplied', 'slide advance'] },
	autoplay: { carrier: 'native show/slide playback settings', rule: 'advance only after measured audio duration plus authored padding when narration is active' },
	captionPolicy: 'Captions/transcripts remain separate timed accessibility metadata or tracks; narration does not create a visible subtitle overlay.',
	conflicts: ['missing or unapproved voice', 'synthesis runtime unavailable', 'audio duration and cue clock disagree', 'autoplay conflicts with authored transition/advance policy', 'presenter video duplicates a native presenter representation'],
	failureIsolation: 'A failed voice catalog, synthesis stage, or runtime probe returns a scoped degraded/blocked record and preserves the rest of the narration documentation and next calls.',
	outputProfiles: ['voice-only native audio', 'caller-supplied audio with measured timing', 'consented presenter video with embedded narration audio', 'notes-only fallback when no audio is available'],
	recovery: ['Use caller-supplied audio or speaker notes when synthesis is unavailable.', 'Run narration validation after the chosen audio path is attached.', 'Do not silently downgrade a requested narrated deliverable to silence.'],
	nextCalls: [
		{ tool: 'betterpptx.narration.voices', request: { language: 'en-US' } },
		{ tool: 'betterpptx.narration.get_voice_timing', request: { text: 'caller-authored script', voice: 'selected voice id', idempotencyKey: 'caller retry key' }, type: 'template', missingInputs: ['caller-authored text', 'selected eligible voice', 'caller authorization'] },
		{ tool: 'betterpptx.billing.estimate', request: { toolName: 'betterpptx.deck.generate_from_spec', toolArgs: { spec: 'complete authored semantic spec with preparedNarration reference', plan: 'premium' } }, type: 'template', missingInputs: ['authored semantic spec', 'returned preparation manifest', 'entitlement or payment authorization for the selected plan'] },
		{ tool: 'betterpptx.help.tool_recipe', request: { surface: 'narration', detail: 'full' } },
		{ tool: 'betterpptx.deck.validate_narration', request: { deckId: 'returned-deck-handle' } },
	],
})

// These are composition recipes, not templates. They give a cold client a
// valid public route for combining domains while leaving the story, exact
// variants, and final acceptance with the AI author.
export const PUBLIC_COMBINED_CAPABILITY_EXAMPLES = Object.freeze([
	{
		id: 'dimensional-editable-headline',
		intent: 'Short hero headline with restrained native depth.',
		tool: 'betterpptx.help.tool_recipe',
		request: { surface: 'text3d', detail: 'full' },
		composeWith: 'betterpptx.deck.generate_from_spec',
		composition: 'editable text + gradient glyph fill + bevel/extrusion/material/light controls',
		verifyWith: ['betterpptx.deck.validate_quality', 'betterpptx.deck.preview'],
	},
	{
		id: 'named-diagram-reveal',
		intent: 'Meaningful process diagram whose named parts reveal in order.',
		tool: 'betterpptx.help.tool_recipe',
		request: { surface: 'animation', detail: 'full' },
		composeWith: 'betterpptx.deck.generate_from_spec',
		composition: 'native SmartArt or named editable nodes + object animation triggers withPrevious/afterPrevious',
		verifyWith: ['betterpptx.deck.validate', 'betterpptx.deck.preview'],
	},
	{
		id: 'presenter-and-named-objects',
		intent: 'Supported presenter performance coordinated with named slide objects.',
		tool: 'betterpptx.authoring.catalog',
		request: { family: 'presenter-motion', offset: 0, limit: 8 },
		composeWith: 'betterpptx.deck.generate_from_spec',
		composition: 'exact selectable motion IDs + ordered presenter actions + stable objectName interaction targets',
		verifyWith: ['betterpptx.deck.validate_quality', 'betterpptx.deck.preview'],
	},
	{
		id: 'narrated-two-slide-sync',
		intent: 'Two-slide explanation with measured voice, cue-led builds, and autoplay.',
		tool: 'betterpptx.help.tool_recipe',
		request: { surface: 'narration', detail: 'full' },
		composeWith: 'betterpptx.deck.generate_from_spec',
		composition: 'script/notes → approved voice → measured embedded audio → integer-ms cues → native builds → automatic advance',
		verifyWith: ['betterpptx.deck.validate_narration', 'betterpptx.deck.preview'],
	},
])

export const PUBLIC_EXTENDED_CAPABILITY_LAYERS = Object.freeze([
	{ id: 'typography', label: 'Typography and dimensional text', families: ['wordart-text3d'], includes: ['Editable WordArt with gradient glyph fills and supported transforms.', 'Dimensional text with bevels, extrusion, contours, materials, and lighting.'] },
	{ id: 'shapes-effects', label: 'Shapes, gradients, and effects', families: ['shapes-gradients'], includes: ['Native geometry, gradients, transparency, and textures remain editable.', 'Parameterized shadows, glow, reflections, blur, soft edges, and supported 3D treatments.'] },
	{ id: 'structured-visuals', label: 'Structured visuals and relationships', families: ['smartart', 'structural'], includes: ['SmartArt and picture-node diagrams with semantic hierarchy and relationships.', 'Custom geometry, connectors, groups, annotations, and supported review structures.'] },
	{ id: 'data-and-math', label: 'Charts, ChartEx, tables, and equations', families: ['charts', 'tables', 'equations'], includes: ['Native charts, ChartEx where accepted, readable tables, and equations.', 'Every result identifies native, native-composite, shape-built, text-math, or preservation-only representation.'] },
	{ id: 'images-media-3d', label: 'Images, media, identity, and 3D', families: ['media-images-avatar', 'model3d'], includes: ['Asset discovery, AI-client/user uploads, picture treatments, licensed stock, and embedded media; generic server-side image generation is retired.', 'Native models with camera/pose controls, identity requirements, consent, and explicit poster alternatives.'] },
	{ id: 'authoring-delivery', label: 'Authoring, validation, and delivery', families: ['layouts-themes-masters'], includes: ['Semantic composition, visual-reference reconstruction, portable specifications, and revision.', 'Validation, preview, supported output routes, package evidence, and save approval gates.'] },
	{ id: 'composability', label: 'Carriers, dependencies, and conflicts', families: ['motion-transitions-morph', 'structural', 'media-images-avatar'], includes: ['Valid carrier combinations, stable named targets, and one authoritative timing clock.', 'Localized recovery for missing assets, motion sources, synthesis, authorization, or verification.'] },
])

function normalizeFamily(value) {
	const raw = String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-')
	return aliases[raw] || raw
}

function publicImplementationStatus(row) {
	if (row.status === 'partial' || row.status === 'open') return 'partial'
	return 'implemented'
}

function publicMotionFailure(error, checkedAt) {
	const sourceCode = String(error?.code || '').toUpperCase()
	return {
		status: 'degraded',
		catalogAvailable: false,
		authorable: true,
		executableNow: false,
		checkedAt,
		failure: {
			code: sourceCode === 'AUTHORING_MOTION_SOURCE_INVALID' ? sourceCode : 'AUTHORING_MOTION_CATALOG_UNAVAILABLE',
			scope: 'presenter-motion',
			retryable: true,
			nextAction: {
				tool: 'betterpptx.authoring.catalog',
				request: { family: 'presenter-motion', includePlanned: true, offset: 0, limit: 20 },
			},
		},
		validForMs: 30000,
	}
}

function motionRuntimeSnapshot() {
	const checkedAt = new Date().toISOString()
	try {
		const catalog = authoringMotionCatalog()
		const inventory = catalog?.inventory || {}
		return {
			status: 'available',
			catalogAvailable: true,
			authorable: true,
			executableNow: Number(inventory.selectable || 0) > 0,
			checkedAt,
			catalogVersion: catalog?.version || catalog?.catalogVersion || null,
			selectableRows: Number(inventory.selectable || 0),
			unavailableRows: Number(inventory.notSelectable || 0),
			validForMs: 30000,
		}
	} catch (error) {
		return publicMotionFailure(error, checkedAt)
	}
}

function publicEvidence(evidence = {}) {
	return Object.fromEntries(Object.entries(evidence).filter(([key]) => ![
		'mcpEngineProof', 'engineArtifactComReadback', 'comApplicabilityReplay', 'ribbonApplicability',
		'currentOfficeOnlyMcpReplay', 'currentOfficeReconciliation',
	].includes(key)))
}

function publicRow(row, { includeReadiness = true } = {}) {
	// Source approvals and playback proofs can change during a server lifetime.
	// Report the same effective availability that the selection runtime enforces.
	const motionState = row.id === 'motion-transitions-morph' && includeReadiness ? motionRuntimeSnapshot() : null
	const motionCatalog = row.id === 'motion-transitions-morph' && motionState?.status === 'available' ? (() => {
		try { return authoringMotionCatalog() } catch { return null }
	})() : null
	const inventory = motionCatalog?.inventory
	const interactions = Array.isArray(motionCatalog?.records) ? motionCatalog.records.filter(entry => entry.family === 'interaction') : []
	const motionEvidence = inventory ? {
		trackedMotionRows: inventory.total,
		executableMotionRows: inventory.selectable,
		unavailableMotionRows: inventory.notSelectable,
		kineticPlanRows: inventory.kineticPlanEntries,
		bakedKineticRows: inventory.kineticBakedEntries,
		ordinaryGestureRows: inventory.ordinaryGestureEntries,
		dedicatedInteractionRows: inventory.interactionCandidateEntries,
		dedicatedInteractionStatus: interactions.length && interactions.every(entry => entry.selectable) ? 'EXECUTABLE' : interactions.some(entry => entry.selectable) ? 'PARTIAL' : 'NOT_EXECUTABLE',
	} : {}
	const contract = PUBLIC_FAMILY_CONTRACTS[row.id] || {}
	const publicTools = row.publicTools.filter(tool => PUBLIC_SPEC_FIRST_TOOLS.has(tool))
	const implementationStatus = publicImplementationStatus(row)
	const readiness = includeReadiness
		? row.id === 'motion-transitions-morph'
			? motionState
			: {
				status: 'route-available-not-probed',
				authorable: true,
				executableNow: null,
				productionReady: null,
				checkedAt: new Date().toISOString(),
				validForMs: 30000,
				nextAction: { tool: 'betterpptx.authoring.catalog', request: { family: row.id, offset: 0, limit: 20 } },
			}
		: { status: 'not-probed', authorable: true, executableNow: null, productionReady: null }
	const issues = [...(row.issues || [])]
	if (inventory?.notSelectable) issues.push(`${inventory.notSelectable} catalog motion rows are unavailable for selection until their source, approval, and playback gates pass.`)
	if (motionState?.failure) issues.push('Presenter-motion discovery is temporarily degraded; unrelated authoring families remain available.')
	return {
		id: row.id,
		family: row.id,
		label: row.label,
		identity: { publicId: row.id, label: row.label },
		status: row.status,
		implementation: {
			status: implementationStatus,
			scope: contract.implementation || null,
			native: row.nativeModes.length > 0,
			fallback: row.fallbackModes.length > 0,
			releaseGate: row.status === 'external-gates-pending' ? 'external-gates-pending' : 'not-claimed',
		},
		summary: row.summary,
		audienceResult: contract.audienceResult || row.summary,
		howToUse: contract.howToUse || `Choose an exact exposed option for ${row.label}, then compile through the semantic deck spec.`,
		extendedCapabilities: [...(contract.extendedCapabilities || [])],
		editability: contract.editability || 'Use the family-specific public contract to determine the editable carrier.',
		controls: [...(contract.controls || [])],
		carriers: [...(contract.carriers || [])],
		nativeModes: [...row.nativeModes],
		fallbackModes: [...row.fallbackModes],
		aiOwns: [...row.aiOwns],
		engineOwns: [...row.engineOwns],
		selectionSignals: [...row.selectionSignals],
		publicTools,
		publicExposure: {
			tools: [...publicTools],
			authoringRoute: 'betterpptx.deck.generate_from_spec',
			selectionDiscovery: publicTools[0] || null,
			schemaReferences: ['betterpptx.deck-spec.v1'],
		},
		requirements: [...(contract.requirements || [])],
		limits: [...(contract.limits || [])],
		recovery: [...(contract.recovery || [])],
		examples: [...(contract.examples || [])],
		readiness,
		evidence: { ...publicEvidence(row.evidence), ...motionEvidence },
		issues,
		gates: { ...row.gates },
	}
}

function compactPublicRow(row) {
	return {
		id: row.id,
		label: row.label,
		status: row.status,
		summary: row.summary,
		audienceResult: row.audienceResult,
		howToUse: row.howToUse,
		implementation: { ...row.implementation },
		extendedCapabilities: [...row.extendedCapabilities],
		editability: row.editability,
		controls: [...row.controls],
		carriers: [...row.carriers],
		publicTools: [...row.publicTools],
		use: { tool: row.publicTools[0] || 'betterpptx.deck.generate_from_spec', route: 'betterpptx.deck.generate_from_spec' },
		limits: [...row.limits],
		readiness: {
			status: row.readiness.status,
			authorable: row.readiness.authorable,
			executableNow: row.readiness.executableNow,
			...(row.readiness.catalogAvailable !== undefined ? { catalogAvailable: row.readiness.catalogAvailable } : {}),
			...(row.readiness.selectableRows !== undefined ? { selectableRows: row.readiness.selectableRows } : {}),
			...(row.readiness.unavailableRows !== undefined ? { unavailableRows: row.readiness.unavailableRows } : {}),
			...(row.readiness.failure ? { failure: row.readiness.failure } : {}),
			...(row.readiness.checkedAt ? { checkedAt: row.readiness.checkedAt } : {}),
		},
	}
}

function compactMotionContract(contract) {
	return {
		schemaVersion: contract.schemaVersion,
		identity: contract.identity,
		objectAnimations: { status: contract.objectAnimations.status, carrier: contract.objectAnimations.carrier, fields: contract.objectAnimations.fields, triggers: contract.objectAnimations.triggers, composition: contract.objectAnimations.composition },
		transitionsMorph: { status: contract.transitionsMorph.status, carrier: contract.transitionsMorph.carrier, fields: contract.transitionsMorph.fields, identity: contract.transitionsMorph.identity },
		native3dMotion: { status: contract.native3dMotion.status, definition: contract.native3dMotion.definition, carrier: contract.native3dMotion.carrier },
		presenterCatalog: { status: contract.presenterCatalog.status, tool: contract.presenterCatalog.tool, selector: contract.presenterCatalog.selector, limits: contract.presenterCatalog.limits },
		continuousPerformance: { status: contract.continuousPerformance.status, carrier: contract.continuousPerformance.carrier, fields: contract.continuousPerformance.fields, limits: contract.continuousPerformance.limits, definition: contract.continuousPerformance.definition },
		interactions: { status: contract.interactions.status, carrier: contract.interactions.carrier, compatibility: contract.interactions.compatibility },
		annotations: contract.annotations,
		reducedMotion: contract.reducedMotion,
		limits: contract.limits,
		timing: { masterClock: contract.timing.masterClock, precision: contract.timing.precision, scope: contract.timing.scope },
		dependencies: contract.dependencies.slice(0, 4),
		conflicts: contract.conflicts.slice(0, 3),
		recovery: contract.recovery,
		nextCalls: contract.nextCalls.slice(0, 2),
	}
}

function compactNarrationContract(contract) {
	return {
		schemaVersion: contract.schemaVersion,
		identity: contract.identity,
		implementation: 'Each narration stage is reported independently; one unavailable stage does not erase the others.',
		publicExposure: contract.publicExposure,
		editability: 'Scripts, notes, voice, cues, timing, autoplay, and accessibility remain semantic; audio is a media asset.',
		stages: contract.stages.map(stage => ({ id: stage.id, ...(stage.tool ? { tool: stage.tool } : {}), output: stage.output })),
		readinessDimensions: contract.readinessDimensions,
		supportedFields: contract.supportedFields,
		timing: contract.timing,
		autoplay: contract.autoplay,
		captionPolicy: contract.captionPolicy,
		conflicts: contract.conflicts,
		failureIsolation: contract.failureIsolation,
		outputProfiles: contract.outputProfiles,
		nextCalls: contract.nextCalls,
	}
}

export function listAuthoringCapabilities(args = {}) {
	const family = normalizeFamily(args.family || args.surface)
	const includeReadiness = args.includeReadiness !== false
	const rows = family && family !== 'all'
		? AUTHORING_CAPABILITY_REGISTRY.filter(row => row.id === family)
		: AUTHORING_CAPABILITY_REGISTRY
	return rows.map(row => publicRow(row, { includeReadiness }))
}

export function resolveAuthoringCapability(args = {}) {
	const family = normalizeFamily(args.family || args.surface)
	const row = AUTHORING_CAPABILITY_REGISTRY.find(item => item.id === family)
	if (!row) {
		return {
			status: 'UNSUPPORTED_CAPABILITY',
			requestedFamily: String(args.family || args.surface || ''),
			correction: 'Choose a family from listAuthoringCapabilities({family:"all"}) or use the semantic public capability catalog.',
			availableFamilies: AUTHORING_CAPABILITY_REGISTRY.map(item => item.id),
		}
	}
	const requestedMode = String(args.mode || '').trim()
	if (requestedMode && !row.nativeModes.includes(requestedMode) && !row.fallbackModes.includes(requestedMode)) {
		return {
			status: 'UNSUPPORTED_MODE',
			capability: publicRow(row),
			requestedMode,
			correction: 'Select a mode from nativeModes or fallbackModes; do not pass opaque native payloads.',
		}
	}
	return {
		status: row.status === 'open' ? 'CAPABILITY_OPEN_WITH_GATES' : 'CAPABILITY_RESOLVED',
		capability: publicRow(row),
		selection: {
			intent: String(args.intent || '').trim() || null,
			mode: requestedMode || row.nativeModes[0] || row.fallbackModes[0] || null,
			aiRemainsDesignMaster: true,
			engineProvidesRulesAndSerialization: true,
			catalogRole: 'exposure-only',
			variantChoice: 'AI-selected exact variant; engine executes only exposed capabilities',
			selectionAuthority: 'AI',
			nativePreference: 'native-when-available',
			customFallback: 'explicit-specific-reason-required',
			selectionManifest: 'AI-authored before generation; exact choices are verified again after save',
		},
	}
}

export function publicAuthoringCapabilityCatalog(args = {}) {
	const rows = listAuthoringCapabilities(args)
	return {
		schemaVersion: 'betterpptx.authoring-capability-catalog.v1',
		registry: publicCapabilityRegistryMetadata(),
		status: 'PUBLIC_SEMANTIC_CATALOG',
		principle: {
			aiIsDesignMaster: true,
			engineOwnsRulesSafetySerialization: true,
			nativePreference: 'native-when-available',
			customFallbackRequiresSpecificAiReason: true,
			aiAuthorsSelectionManifest: true,
			selectedIdsVerifiedInSavedPackage: true,
			unknownChoicesFailClosed: true,
			galleryApplicabilityIsDescriptiveCatalogData: true,
			selectionAuthority: 'AI',
			engineRole: 'expose-and-execute',
			catalogDoesNotSelect: true,
			privateImplementationDetailsHidden: true,
		},
		capabilities: rows,
		personaCapabilities: publicPersonaCapabilities(),
		resolution: args.family || args.surface ? resolveAuthoringCapability(args) : null,
	}
}

function digestableRegistryRow(row) {
	const contract = PUBLIC_FAMILY_CONTRACTS[row.id] || {}
	return {
		...row,
		publicTools: row.publicTools.filter(tool => PUBLIC_SPEC_FIRST_TOOLS.has(tool)),
		contract,
	}
}

function stable(value) {
	if (Array.isArray(value)) return value.map(stable)
	if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
	return value
}

export function publicCapabilityRegistryMetadata() {
	const rows = AUTHORING_CAPABILITY_REGISTRY.map(digestableRegistryRow)
	const content = JSON.stringify(stable({
		families: rows,
		extendedLayers: PUBLIC_EXTENDED_CAPABILITY_LAYERS,
		motion: PUBLIC_MOTION_CAPABILITY_CONTRACT,
		narration: PUBLIC_NARRATION_CAPABILITY_CONTRACT,
		personaCapabilities: PUBLIC_PERSONA_CAPABILITY_CONTRACT,
		combinedExamples: PUBLIC_COMBINED_CAPABILITY_EXAMPLES,
		contentRepresentation: CONTENT_REPRESENTATION_CONTRACT,
	}))
	return {
		schemaVersion: PUBLIC_CAPABILITY_REGISTRY_SCHEMA_VERSION,
		registryVersion: PUBLIC_CAPABILITY_REGISTRY_VERSION,
		familyCount: rows.length,
		families: rows.map(row => row.id),
		capabilityContentDigest: createHash('sha256').update(content).digest('hex'),
		contentScope: 'stable family, content-representation, extended-layer, persona, motion, and narration contracts; live readiness and measured catalog counts are returned separately',
	}
}


export function publicCapabilityOverview({ includeReadiness = true, compact = false } = {}) {
	const families = listAuthoringCapabilities({ family: 'all', includeReadiness }).map(row => compact ? compactPublicRow(row) : row)
	return {
		schemaVersion: PUBLIC_CAPABILITY_OVERVIEW_SCHEMA_VERSION,
		registry: publicCapabilityRegistryMetadata(),
		families,
		personaCapabilities: publicPersonaCapabilities(),
		generatedImagePolicy: publicGeneratedImagePolicy(),
		extendedLayers: [...PUBLIC_EXTENDED_CAPABILITY_LAYERS],
		combinedExamples: [...PUBLIC_COMBINED_CAPABILITY_EXAMPLES],
		contentRepresentation: publicContentRepresentationContract({ compact }),
		motion: compact ? compactMotionContract(PUBLIC_MOTION_CAPABILITY_CONTRACT) : PUBLIC_MOTION_CAPABILITY_CONTRACT,
		narration: compact ? compactNarrationContract(PUBLIC_NARRATION_CAPABILITY_CONTRACT) : PUBLIC_NARRATION_CAPABILITY_CONTRACT,
		availability: {
			implemented: AUTHORING_CAPABILITY_REGISTRY.filter(row => publicImplementationStatus(row) === 'implemented').map(row => row.id),
			partial: AUTHORING_CAPABILITY_REGISTRY.filter(row => publicImplementationStatus(row) === 'partial').map(row => row.id),
			generatedImages: publicGeneratedImagePolicy(),
			planned: [
				{ id: 'powerpoint-native-visual-reopen-validation', family: 'shapes-gradients', status: 'planned', reason: 'Additional PowerPoint reopen evidence is a separate release track.' },
				{ id: 'powerpoint-timing-tree-reopen', family: 'motion-transitions-morph', status: 'planned', reason: 'Additional PowerPoint timing-tree reopen evidence is a separate release track.' },
			],
			preservationOnly: [
				{ family: 'structural', status: 'preservation-only', rule: 'Unsupported imported structures may be preserved but are not silently promoted to editable authoring.' },
			],
			unsupported: [
				{ id: 'unknown-family-or-mode', status: 'unsupported', rule: 'Unknown families and modes fail closed with a correction.' },
			],
		},
		authoringContract: {
		identity: 'The AI is the creative author and selects the exact semantic variant.',
		implementation: 'BetterPPTX executes, measures, validates, and serializes the selected semantic request.',
		recommendedWorkflow: 'ai-sovereign-v1',
		creativeAuthorityModes: publicCreativeAuthorityModes(),
		compositionModes: publicCompositionModes(),
		publicExposure: 'Use the public tools named in each family row; primitive and private implementation surfaces are not required.',
		composability: 'Use one betterpptx.deck-spec.v1 JSON spec. AI-sovereign keeps Director domains optional; Director-assisted mode composes Content/Story, Visual/Design, and Motion/Time.',
		readiness: 'Separate contract availability, runtime readiness, environment mode, entitlement, and production approval; do not infer one from another.',
		requirements: ['semantic intent', 'typed public fields', 'opaque asset handles or authorized inputs', 'validation before save'],
		limits: ['feature availability is not visual acceptance', 'fallbacks must be explicit', 'unsupported combinations fail closed'],
		recovery: 'Use the scoped nextAction returned by the failed or degraded call and preserve completed independent work.',
	},
		nextCalls: [
			{ tool: 'betterpptx.help.tool_recipe', request: { surface: 'animation', detail: 'full' }, why: 'Get the complete object-animation, transition, Morph, presenter-performance, interaction, and timing contract.', exampleType: 'executable' },
			{ tool: 'betterpptx.help.tool_recipe', request: { surface: 'narration', detail: 'full' }, why: 'Get the end-to-end voice, audio, measured-cue, synchronization, autoplay, and verification contract.', exampleType: 'executable' },
			{ tool: 'betterpptx.authoring.catalog', request: { family: 'wordart-text3d', query: 'bevel', offset: 0, limit: 20 }, why: 'Inspect exact unranked typography choices and their current readiness.', exampleType: 'executable' },
			{ tool: 'betterpptx.deck.generate_from_spec', request: { phase: 'dryRun', dryRun: true, commitMode: 'createNew', detail: 'summary', spec: { schemaVersion: 'betterpptx.deck-spec.v1', title: 'Decision', layout: 'LAYOUT_WIDE', authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches' }, contentStory: { audience: 'Leaders', outcome: 'Understand the decision.', remember: 'Choose with evidence.' }, visualDesign: { world: 'Clear', framing: 'One message.' }, styleIntent: { artDirection: 'editorial', mode: 'light' }, motionTime: { masterClock: 'static', timingSource: 'authored slide timing', syncPolicy: 'one static visual clock' }, validation: { validateBeforeSave: true, requireAccessibility: true }, slides: [{ id: 'slide-1', title: 'Decision', message: 'Choose with evidence.', layoutIntent: 'title-only', content: [{ kind: 'title', name: 'headline', text: 'Choose with evidence.', rect: { x: 0.9, y: 2.35, w: 11.5, h: 1.2 } }] }] } }, why: 'Executable minimal sovereign dry-run with explicit slide-inch geometry. It is a compilation fixture, not an audience-ready showcase.', exampleType: 'executable-complete-dryRun' },
		],
	}
}




























