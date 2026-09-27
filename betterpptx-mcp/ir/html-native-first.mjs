/**
 * Explicit secondary automatic HTML-conversion mapping.
 * The principal product route remains client-AI reconstruction.
 */
import { HTML_CSS_MOTION_CONTRACT } from './html-css-motion.mjs'

export const HTML_NATIVE_FIRST_CONTRACT_VERSION = 'betterpptx.html-native-first.v1'
export { HTML_CSS_MOTION_CONTRACT }

export const HTML_NATIVE_FIRST_CONTRACT = Object.freeze({
	schemaVersion: HTML_NATIVE_FIRST_CONTRACT_VERSION,
	rule: 'This is the explicitly selected secondary automatic HTML-conversion route. Pass source only under spec.htmlConversion. The principal route is client-AI visualReference reconstruction. Conversion prefers editable native PowerPoint and is never eligible as proof of AI reconstruction.',
	architecture: Object.freeze({
		flow: Object.freeze(['Explicit spec.htmlConversion source', 'Native-first conversion plan', 'Editable PowerPoint objects', 'Validation and full-size preview', 'One verified PPTX save']),
		adapter: 'Automatic HTML conversion is isolated from the principal visualReference AI reconstruction route.',
		fixtureRule: 'A large HTML package may be a conformance fixture. Its object counts must not be built into schemas, recipes, or validators.',
	}),
	representation: Object.freeze({
		decisions: Object.freeze(['native-exact', 'native-composite', 'editable-custom-geometry', 'preserved-vector', 'isolated-raster-element', 'whole-slide-raster']),
		rule: 'Decompose each source visual into supported and unsupported components. Whole-slide rasterization is forbidden by default. Isolated raster only for the unsupported remainder, as a separate selectable object, with a reason and owner relationship when it is an effect layer.',
		silentFallback: 'forbidden',
	}),
	authority: Object.freeze({
		designSurface: 'Use spec.htmlConversion.html for inline source, or upload kind:"htmlPackage" and pass the returned handle as spec.htmlConversion.package. assetMap is an override only.',
		engineLowers: 'The engine assigns native PowerPoint kinds and owns geometry. Never copy CSS left/top/width/height into JSON bbox, rect, or x/y/w/h.',
		niceties: 'spec.niceties / spec.powerpointNiceties upgrade HTML sketches after live catalog inspection',
		recipe: 'Call betterpptx.help.tool_recipe with surface:"htmlConversion" for this secondary contract',
		animationRecipe: 'Call betterpptx.help.tool_recipe with surface:"animation" for the native PowerPoint object-animation vocabulary. Presenter catalog motion.* IDs are a different vocabulary.',
	}),
	imageRule: 'HTML img, picture layers, nested img, CSS background-image photos, and SVG that only contains raster <image> always become kind:"image". They never become customGeometry and are never sent to from_svg. This is true for any HTML original, not one zip convention.',
	cssMotion: HTML_CSS_MOTION_CONTRACT,
	unsupportedEffects: 'Keep text, preset geometry, lines, and photos native. Decompose atmosphere and filter subtrees node by node: native fill, shape/freeform, image adjustment, effect list, effect DAG, 3-D, picture/texture fill, then preserved SVG. Only the smallest truly unsupported node may become an owner-linked transparent local asset or tileable texture. Never screenshot or flatten the slide. A full-canvas effect-only grain texture is allowed; a full-slide screenshot is forbidden. Dry-run returns native coverage, editability, and atmosphere readback.',
	morphRule: 'Reuse stable object names across adjacent slides when Morph is intended. Default morphPolicy.unmatched is warn with fade. Save blocks only for morphPolicy.requiredPairs when requiredPairFailure is block, or when a Morph slide sets matchingPolicy:"strict". Continuity reports list matched and unmatched names.',
	fontRule: 'Dry-run reports the source font-family stack, compiled face, embedding status, declared CSS fallbacks, and substitution risk. Embedding happens only when a licensed font file is supplied. Default fontPolicy.mode is substitute-and-warn. strict-match blocks save. Do not assume a designed web face is installed.',
	outputVariants: Object.freeze({
		rule: 'Detected HTML runtime modes and selected PowerPoint output variants are separate. Do not assume a fixed set of HTML runtimes.',
		narrated: Object.freeze({
			outputVariant: 'narrated',
			synthesizeAudio: true,
			preserveInNotes: true,
			useGeneratedAudioAsTimingAuthority: true,
			voiceId: 'required from betterpptx.narration.voices unless a locale default is explicitly reported',
			rule: 'When narration is enabled, authored text is the authority. The engine synthesizes internal approved-voice audio, measures duration, cue-syncs native motion, embeds the audio, and auto-advances. Narration never generates transcript text boxes. Native WebVTT tracks are created only when audio.closedCaptionTracks is explicit.',
		}),
		silentTimedNotes: Object.freeze({ outputVariant: 'silent-timed-notes', synthesizeAudio: false, preserveInNotes: true, useAsTimingAuthority: true, rule: 'Explicit non-narrated variant only. Never a silent fallback of narrated.' }),
		voiceOnly: Object.freeze({ outputVariant: 'voice-only', requiresAudio: true, preserveInNotes: true, rule: 'Same as narrated: notes, Piper audio, cues, motion, auto-advance. No caption overlay and no implicit VTT track.' }),
	}),
	outputProfiles: Object.freeze({
		rule: 'Output profiles are explicit policies, not silent resize. faithful-html preserves the designed original. projection and accessible-large-text are redesigns. projector, desktop-screen, mobile, print, and social-video change canvas, type, and motion policy only when selected.',
		profiles: Object.freeze(['faithful-html', 'projection', 'projector', 'desktop-screen', 'mobile', 'print', 'social-video', 'accessible-large-text']),
	}),
	narrationNotesOnly: Object.freeze({
		synthesizeAudio: false,
		preserveInNotes: true,
		useAsTimingAuthority: true,
		outputVariant: 'silent-timed-notes',
		rule: 'silent-timed-notes is an explicit non-narrated variant. The narrated profile synthesizes internal approved-voice audio, keeps original text in speaker notes, and blocks if the synthesis runtime or selected voice is unavailable. Narration has no caption mode.',
	}),
	readabilityPolicy: Object.freeze({
		faithfulHtml: 'validation.readabilityPolicy:"faithful-html" preserves designed microcopy, including intentional small type, and does not enlarge or reflow to a 16pt floor. Sub-16pt is advisory. Clipping, truncation, inaccessible contrast, and off-slide text remain defects.',
		projection: 'validation.readabilityPolicy:"projection" is a separate redesigned derivative. The AI must change hierarchy and copy, not scale every text box. The 16pt floor is a redesign requirement.',
	}),
	motionGate: Object.freeze({
		dryRunTimeline: 'necessary, not sufficient',
		gifMp4: 'not a hard save gate; MCP evolution request',
		currentGate: 'dry-run timeline plus post-commit native timing validation plus saved-package reopen of the timing tree. Unexplained animation loss must be zero. Grouping, inherited support-layer motion, and equivalent keyframe collapse are allowed.',
	}),
	commitLifecycle: Object.freeze({
		path: Object.freeze(['upload', 'inspect', 'dryRun', 'semantic correction', 'lock plan', 'one logical commit', 'validate', 'authoritative preview', 'one save']),
		planId: 'Dry-run returns planId / planDigest. Commit should persist that locked plan. Patch mode is for later edits, branches, and review, not for assembling the first generation.',
		pinning: 'Recovery, not the normal authoring strategy.',
	}),
	deckSession: Object.freeze({
		idleTtl: 'Unsaved decks remain available for 30 minutes after last use, and committed decks stay pinned until the first save.',
		lookup: 'betterpptx.deck.recent lists active deckId, deckVersion, remainingTtlMs, and pinUntilSave.',
		operations: 'betterpptx.operation.recent lists recent operationId values for recovery by idempotency key.',
		commitEnvelope: 'Every commit returns deckId, deckVersion, and operationId when a durable operation is recorded. Prefer one-shot commit of the full HTML original over inventing a deck-specific atomic API.',
	}),
	authoringDecisions: Object.freeze([
		{
			id: 'readabilityPolicy',
			ask: 'Declare validation.readabilityPolicy for this original: faithful-html (preserve designed sizes, including small microcopy; 16pt is advisory) or projection (a separate redesign, never silent enlargement).',
		},
		{
			id: 'unsupportedAtmosphere',
			ask: 'Declare atmosphere as native effect-graph intent first. The engine decomposes each filter node into native fill, shape, image adjustment, effect list, or the smallest owner-linked transparent remainder. It does not screenshot or flatten.',
		},
		{
			id: 'outputVariant',
			ask: 'Declare selectedOutputVariants separately from detectedSourceModes. HTML runtime modes such as voice+captions are player chrome, not PowerPoint overlay captions. narrated synthesizes internal approved-voice audio with notes, cue-synced motion, and auto-advance. Native WebVTT is audio.closedCaptionTracks only. silent-timed-notes is an explicit non-narrated variant, never a silent fallback.',
		},
		{
			id: 'oneShotCommit',
			ask: 'Author HTML, motion, notes, and niceties in one specification. Dry-run, correct, lock, then one logical commit. Patch is for later edits. Pinning is recovery.',
		},
		{
			id: 'motionAcceptance',
			ask: 'Accept animation only when the dry-run timeline plus post-commit native timing plus saved-package reopen show unexplained loss of zero. GIF/MP4 is not a hard gate; request it as MCP evolution if human-visible playback proof is required.',
		},
		{
			id: 'morphUnmatched',
			ask: 'Default unmatched Morph objects warn and fade. Declare morphPolicy.requiredPairs with requiredPairFailure:"block" only for identities that must survive. matchingPolicy:"strict" is slide-level.',
		},
		{
			id: 'fontEmbedding',
			ask: 'Declare the required faces from this original CSS stack and whether licensed files are supplied. Default fontPolicy.mode is substitute-and-warn using the source-declared fallback. strict-match blocks save.',
		},
	]),
	doNot: Object.freeze([
		'Do not classify every HTML layer into a hand-authored JSON object with coordinates.',
		'Do not screenshot the HTML and place one picture per slide.',
		'Do not keep CSS bars, HTML tables, or math as pictures when a native chart, table, or equation can express them.',
		'Do not convert HTML browser caption chrome, cue phrases, or narration text into PowerPoint text boxes.',
		'Do not silently fall back from narrated output to notes-only when the voice runtime or selected voice is unavailable.',
		'Do not send HTML img or raster illustrations to customGeometry or from_svg.',
		'Do not flatten an entire slide to one picture because a blur or glow has no native equivalent.',
		'Do not silently drop unsupported CSS/SVG filter layers. Report them in the fallback ledger and require an isolated asset or MCP evolution.',
		'Do not treat one HTML package\'s object counts as API constants.',
		'Do not silently enlarge faithful HTML microcopy to meet the projection readability floor.',
		'Do not reconstruct CSS motion by hand from a four-class map. Ordinary CSS animation-name, class tokens, and @keyframes are inferred into native PowerPoint object animation. Call help.tool_recipe surface:"animation" for the vocabulary. Unmapped CSS is an AI resolution item: author a native object effect, rewrite inferable CSS, or request MCP evolution. Do not leave the motion out.',
		'Do not put text on kind:"shape"; use textShape. Shape is geometry only.',
		'Do not treat presenter catalog motion.* IDs as CSS entrance effects.',
	]),
	preference: Object.freeze([
		{
			rank: 1,
			when: 'Slide canvas solid fill or simple equivalent linear/radial CSS/SVG backdrop',
			native: 'slides[].background native fill',
			avoid: 'A full-slide photograph of the backdrop',
		},
		{
			rank: 2,
			when: 'Quantitative comparison: CSS bars, .plot, sparkline sketch, data series',
			native: 'kind:"chart-panel" plus selectionManifest native chart IDs',
			avoid: 'Keeping the CSS bars, or rasterizing the plot',
		},
		{
			rank: 3,
			when: 'Tabular comparison',
			native: 'kind:"table-panel" plus selectionManifest native table style',
			avoid: 'HTML table as a picture or as a grid of rectangles',
		},
		{
			rank: 4,
			when: 'Process, cycle, hierarchy, relationship, or org flow',
			native: 'kind:"smartart" or kind:"process" with native gallery IDs',
			avoid: 'A nest of rectangles and arrows unless native SmartArt cannot express the relationship (then customReason)',
		},
		{
			rank: 5,
			when: 'Mathematics',
			native: 'kind:"equation" with unicodeMath',
			avoid: 'Styled HTML/SVG as the shipped equation',
		},
		{
			rank: 6,
			when: 'Giant numeral / KPI',
			native: 'kind:"stat" or kind:"kpi"',
			avoid: 'A textBox that only happens to be large',
		},
		{
			rank: 7,
			when: 'Filled chrome that carries copy: button, pill, chip, badge, room card, price capsule',
			native: 'kind:"textShape" (native shape plus text)',
			avoid: 'kind:"shape" plus a second textBox, or a screenshot of the control',
		},
		{
			rank: 8,
			when: 'Standalone type: headline, kicker, body, quote, label, on-slide copy',
			native: 'kind:"textBox"; column h1 becomes large type in that region, not the PowerPoint title band',
			avoid: 'Flattening type into a picture',
		},
		{
			rank: 9,
			when: 'Preset geometry with no text: rectangle, rounded rectangle, ellipse/circle, triangle, chevron, panel',
			native: 'kind:"shape" with shapeName (rect, roundRect, ellipse, …) plus native fill/line/effect',
			avoid: 'customGeometry when a preset exists',
		},
		{
			rank: 10,
			when: 'A line or arrow that connects two named objects',
			native: 'kind:"connector" with semantic from/to names',
			avoid: 'A freeform path when a connector can express the relationship',
		},
		{
			rank: 11,
			when: 'A decorative hairline with no object endpoints',
			native: 'kind:"shape" shapeName:"line", or a semantic accent-rule / divider visualIntent',
			avoid: 'Inventing connector endpoints',
		},
		{
			rank: 12,
			when: 'Catalog glyph / UI icon',
			native: 'kind:"icon" from the advertised catalog',
			avoid: 'A photograph of an icon',
		},
		{
			rank: 13,
			when: 'Photograph, HTML img, content-image, or raster-only SVG image',
			native: 'kind:"image" (opaque handle; noFrame on a canvas port). Dry-run uses the same serializer as commit.',
			avoid: 'Tracing a photo into customGeometry or sending img markup to from_svg',
		},
		{
			rank: 14,
			when: 'Simple SVG that is still one preset (one rect/circle/ellipse/line)',
			native: 'kind:"shape" with the matching shapeName',
			avoid: 'customGeometry for a circle or rounded rect',
		},
		{
			rank: 15,
			when: 'Simple SVG path / freeform that is still one editable outline and is not a preset, connector, chart, or SmartArt',
			native: 'kind:"customGeometry" / editable freeform, with a specific customReason when Director custom is required',
			avoid: 'Rasterizing a path PowerPoint can still edit',
		},
		{
			rank: 16,
			when: 'CSS box-shadow, text-shadow, or glow with a PowerPoint equivalent',
			native: 'object shadow, glow, or textGlow on that object',
			avoid: 'A second raster layer that fakes the shadow',
		},
		{
			rank: 17,
			when: 'Spatial presence / real 3D / on-stage presenter',
			native: 'kind:"model3d" / presenter contract',
			avoid: 'CSS fake 3D or a flattened PNG when an editable model exists',
		},
		{
			rank: 18,
			when: 'Video or audio',
			native: 'kind:"media"',
			avoid: 'A poster image standing in for the media',
		},
		{
			rank: 19,
			when: 'Spoken show',
			native: 'kind:"narration" plus notes, cues, and motionTime. Use synthesizeAudio:false when the script should stay in notes and govern timing without speech synthesis',
			avoid: 'HTML browser caption chrome. Narration is notes + embedded audio + cues. Native captions are WebVTT media tracks only when explicitly requested',
		},
		{
			rank: 20,
			when: 'CSS animation, autoplay, or sequenced reveal',
			native: 'In the secondary htmlConversion route, the engine may infer content[].animation from ordinary CSS. In the principal visualReference route, the AI authors native animation explicitly. Dry-run timing plus commit/reopen evidence must show unexplained loss of zero.',
			avoid: 'Treating unmapped CSS as a finished gap, requiring a 1:1 source-node count, reconstructing a few showcase class names, or using presenter catalog motion.* IDs as CSS entrance effects',
		},
		{
			rank: 21,
			when: 'Multi-layer atmospheric SVG, filters, clip-paths, procedural shaders, or effects with no native equivalent',
			native: 'Decompose each source visual. Native fills, preset shapes, grids, and equivalent glow/shadow first. Isolated transparent image only for the unsupported remainder, as a separate selectable object with a source-derived fallback ledger and effectOwnerId when it is a support layer. Never flatten the slide.',
			avoid: 'Rasterizing every background or effect as one indivisible object, broad raw HTML passthrough, or one screenshot of the whole slide',
		},
	]),
})
