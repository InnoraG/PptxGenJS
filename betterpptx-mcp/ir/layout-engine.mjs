import crypto from 'node:crypto'
import { promoteColumnHeadlines } from './html-slide-compiler.mjs'
import { validateChartPanel } from '../chart-authoring-family-contract.mjs'
import { model3dStaticPose, normalizeStaticPoseScene } from '../presenter-static-pose-contract.mjs'
import { model3dMotionFraming } from '../model3d-motion-framing-contract.mjs'
import { isVisualReferenceReconstruction } from './visual-reference-reconstruction.mjs'
import { isAiAuthoredGeometrySpec } from './authoring-geometry-policy.mjs'

export const LAYOUT_ENGINE_VERSION = 'betterpptx.layout-engine.v1'
export const SCHEMA_VERSION = 'betterpptx.deck-spec.v1'

export const WIDE_SLIDE = Object.freeze({ w: 13.333, h: 7.5 })
const DEFAULT_MARGIN = 0.58
// The body already reserves a 0.90in title band. Expose that full band to the
// title object so the Director's 35pt slide-title baseline—and the published
// 50pt deck-title floor—can render at 1.20 line height with the default text
// margins. Keep the body start aligned with this engine-owned host.
const TITLE_H = 1.05
const FOOTER_H = 0.32
const GAP = 0.22
const MIN_FONT_SIZE = 9
export const READABILITY_TYPE_FLOORS_PT = Object.freeze({
	deckTitle: 50,
	slideTitle: 35,
	subheading: 24,
	body: 16,
	dataLabel: 12,
	tableCell: 12,
	diagramLabel: 14,
	metadata: 10,
})

export function readabilityPolicyForSpec(spec = {}, slide = null) {
	const explicit = String(spec?.validation?.readabilityPolicy || spec?.authoringContract?.readabilityPolicy || '').toLowerCase()
	if (explicit === 'faithful-html' || explicit === 'faithful' || explicit === 'preserve') return 'faithful-html'
	if (explicit === 'projection' || explicit === 'presentation') return 'projection'
	if (slide?.htmlCanvas || spec?.authoringContract?.htmlStagePolicy === 'preserve-canvas-geometry') return 'faithful-html'
	if ((spec?.slides || []).some(item => item?.htmlCanvas)) return 'faithful-html'
	return 'projection'
}
// Accepted native Record Studio presenter window. This is an engine-owned
// exclusion zone, never client-authored geometry. Narrated layouts use it to
// keep proof and footer copy clear of the fixed lower-right ellipse.
const NATIVE_RECORD_STUDIO_PRESENTER_ZONE = Object.freeze({
	x0: 10.993,
	y0: 5.160,
	x1: 13.243,
	y1: 7.410,
	lowerOnly: true,
})

// Public semantic vocabulary.  Keep this list engine-owned so the AI can
// discover the same layout intents that the compiler actually accepts rather
// than learning a stale hand-written copy from a client prompt.
export const AUTHORING_LAYOUT_INTENTS = Object.freeze([
	'title-only',
	'title-body',
	'title-body-footer',
	'two-column',
	'three-column',
	'chart-left-insights-right',
	'insights-left-chart-right',
	'metric-grid',
	'comparison',
	'timeline',
	'process-flow',
	'image-left-copy-right',
	'copy-left-image-right',
	'section-divider',
	'dense-appendix',
	// M18 richer layout grammar
	'hero',
	'pull-quote',
	'sidebar-left',
	'sidebar-right',
])
// Compatibility aliases are semantic shorthand, not a second geometry API.
// Cold AI clients sometimes describe a proof-led comparison in natural
// language; normalize that phrase to the governed comparison contract before
// region solving so it cannot silently fall back to title-body.
export const AUTHORING_LAYOUT_INTENT_ALIASES = Object.freeze({
	'statement': 'title-body',
	'comparison-left-proof-right': 'comparison',
	'comparison-left-evidence-right': 'comparison',
	'image-right-copy-left': 'copy-left-image-right',
	// Compatibility spelling used by the finite picture-passage contract.  The
	// semantic picture-focused composition uses the governed title/body host;
	// overlay/stack relationships remain explicit content metadata and are not
	// invented by this alias.
	'image-focus': 'title-body',
})
// The AI chooses a communicative archetype, so it needs to know what semantic
// evidence each archetype is designed to carry before it commits a spec.  This
// is deliberately expressed as content contracts (never coordinates): the
// compiler and the public capabilities API share this table so the guidance
// cannot drift from the runtime balance checks.
export const LAYOUT_INTENT_CONTRACTS = Object.freeze({
	'title-only': { purpose: 'single statement', proof: [], explanation: ['title', 'quote', 'text'], fallback: ['title-body'] },
	'title-body': { purpose: 'statement with explanation', proof: ['image', 'image-feature', 'chart-panel', 'table-panel', 'media', 'model3d'], explanation: ['title', 'text', 'textBox', 'body', 'callout'], fallback: ['two-column', 'hero'] },
	'title-body-footer': { purpose: 'statement, explanation, and metadata', proof: ['image', 'image-feature', 'chart-panel', 'table-panel', 'media'], explanation: ['title', 'text', 'textBox', 'body'], fallback: ['title-body'] },
	'two-column': { purpose: 'paired proof and explanation', proof: ['image', 'image-feature', 'chart-panel', 'table-panel', 'media', 'model3d'], explanation: ['title', 'text', 'textBox', 'body', 'callout'], fallback: ['title-body', 'image-left-copy-right'] },
	'three-column': { purpose: 'three comparable semantic items', proof: ['image', 'image-feature', 'chart-panel', 'stat', 'kpi', 'icon'], explanation: ['title', 'text', 'textBox', 'body', 'callout'], fallback: ['two-column'] },
	'chart-left-insights-right': { purpose: 'chart evidence paired with its reading', requiredProof: 'chart/chart-panel', proof: ['chart', 'chart-panel'], explanation: ['title', 'text', 'textBox', 'body', 'callout'], fallback: ['title-body', 'two-column'] },
	'insights-left-chart-right': { purpose: 'reading paired with chart evidence', requiredProof: 'chart/chart-panel', proof: ['chart', 'chart-panel'], explanation: ['title', 'text', 'textBox', 'body', 'callout'], fallback: ['title-body', 'two-column'] },
	'metric-grid': { purpose: 'compact KPI/stat comparison', requiredProof: 'stat/kpi', proof: ['stat', 'kpi', 'metric-grid'], explanation: ['title', 'text', 'textBox', 'body'], fallback: ['title-body', 'two-column'] },
	'comparison': { purpose: 'side-by-side alternatives', proof: ['image', 'image-feature', 'chart-panel', 'stat', 'kpi', 'table-panel'], explanation: ['title', 'text', 'textBox', 'body', 'callout'], fallback: ['two-column'] },
	'timeline': { purpose: 'ordered time sequence', proof: ['timeline', 'process'], explanation: ['title', 'text', 'textBox', 'body'], fallback: ['process-flow', 'title-body'] },
	'process-flow': { purpose: 'ordered transformation or workflow', proof: ['process', 'timeline', 'smartart', 'diagram'], explanation: ['title', 'text', 'textBox', 'body'], fallback: ['timeline', 'title-body'] },
	'image-left-copy-right': { purpose: 'visual proof left, explanation right', requiredProof: 'image/image-feature', proof: ['image', 'image-feature'], explanation: ['title', 'text', 'textBox', 'body', 'callout'], fallback: ['title-body', 'hero'] },
	'copy-left-image-right': { purpose: 'explanation left, visual proof right', requiredProof: 'image/image-feature', proof: ['image', 'image-feature'], explanation: ['title', 'text', 'textBox', 'body', 'callout'], fallback: ['title-body', 'hero'] },
	'section-divider': { purpose: 'section transition', proof: ['image', 'image-feature', 'media', 'model3d'], explanation: ['title', 'quote', 'text'], fallback: ['title-only', 'hero'] },
	'dense-appendix': { purpose: 'dense reference evidence', proof: ['table-panel', 'chart-panel', 'image', 'image-feature'], explanation: ['title', 'text', 'textBox', 'body'], fallback: ['title-body', 'two-column'] },
	'hero': { purpose: 'single focal visual with message', proof: ['image', 'image-feature', 'media', 'model3d'], explanation: ['title', 'quote', 'text', 'textBox'], fallback: ['title-body', 'section-divider'] },
	'pull-quote': { purpose: 'memorable quotation or claim', proof: ['image', 'image-feature', 'media'], explanation: ['quote', 'title', 'text', 'textBox'], fallback: ['title-only', 'title-body'] },
	'sidebar-left': { purpose: 'sidebar context with main explanation', proof: ['image', 'image-feature', 'chart-panel', 'stat', 'kpi', 'icon'], explanation: ['title', 'text', 'textBox', 'body', 'callout'], fallback: ['two-column', 'title-body'] },
	'sidebar-right': { purpose: 'main explanation with sidebar context', proof: ['image', 'image-feature', 'chart-panel', 'stat', 'kpi', 'icon'], explanation: ['title', 'text', 'textBox', 'body', 'callout'], fallback: ['two-column', 'title-body'] },
})
export const AUTHORING_REGION_ALIASES = Object.freeze([
	'title', 'body', 'footer', 'left', 'right', 'leftThird', 'midThird', 'rightThird',
	'leftOneThird', 'rightTwoThirds', 'leftTwoThirds', 'rightOneThird',
	'media', 'hero', 'sidebar', 'main',
])
export const AUTHORING_REGION_NAME_ALIASES = Object.freeze({
	'left-one-third': 'leftOneThird',
	'right-two-thirds': 'rightTwoThirds',
	'left-two-thirds': 'leftTwoThirds',
	'right-one-third': 'rightOneThird',
	'left1third': 'leftOneThird',
	'right2thirds': 'rightTwoThirds',
	'left2thirds': 'leftTwoThirds',
	'right1third': 'rightOneThird',
})
// Keep connector names fail-closed at the semantic boundary.  PowerPoint's
// DrawingML preset vocabulary does not include the informal `elbowConnector`
// alias; letting it reach XML serialization creates a package that can pass
// structural checks but cannot be opened by PowerPoint.  The AI can discover
// these exact executable values from the public capability surface.
export const AUTHORING_CONNECTOR_TYPES = Object.freeze([
	'straightConnector1',
	'elbowConnector2',
	'elbowConnector3',
	'elbowConnector4',
	'curvedConnector2',
	'curvedConnector3',
	'curvedConnector4',
])
const AUTHORING_CONNECTOR_TYPE_SET = new Set(AUTHORING_CONNECTOR_TYPES)
const INTENTS = new Set(AUTHORING_LAYOUT_INTENTS)

function normalizedSemanticKey(value) {
	return String(value || '').trim().toLowerCase()
}

export function normalizeLayoutIntent(value) {
	const raw = String(value || '').trim()
	if (!raw) return null
	if (INTENTS.has(raw)) return raw
	const canonical = AUTHORING_LAYOUT_INTENTS.find(intent => normalizedSemanticKey(intent) === normalizedSemanticKey(raw))
	return canonical || AUTHORING_LAYOUT_INTENT_ALIASES[normalizedSemanticKey(raw)] || null
}

export function normalizeRegionName(value) {
	const raw = String(value || '').trim()
	if (!raw) return null
	if (AUTHORING_REGION_ALIASES.includes(raw)) return raw
	return AUTHORING_REGION_NAME_ALIASES[normalizedSemanticKey(raw)] || null
}

// Content blocks are the representation boundary of the portable spec.  Keep
// the vocabulary normalization here, beside the layout planner, so every
// caller (direct compiler, public handler, and imported-spec path) resolves the
// same aliases before a primitive is selected.  In particular, a chart/table/
// SmartArt alias must never fall through to the generic text branch.
export const CONTENT_REPRESENTATION_SCHEMA_VERSION = 'betterpptx.content-representation.v1'

const CONTENT_KIND_ALIASES = Object.freeze({
	// Structured native objects. These three aliases are retained for portable
	// specs produced by earlier authoring clients and resolve to the closed
	// authoring contracts before validation.
	chart: 'chart-panel',
	'chart-panel': 'chart-panel',
	chartpanel: 'chart-panel',
	table: 'table-panel',
	'table-panel': 'table-panel',
	tablepanel: 'table-panel',
	'animated-table': 'animated-table',
	animatedtable: 'animated-table',
	'progressive-table': 'animated-table',
	'row-reveal-table': 'animated-table',
	smartart: 'smartart',
	'smart-art': 'smartart',
	smartartdiagram: 'smartart',

	// Existing public compatibility spellings.
	textbox: 'textBox',
	'text-box': 'textBox',
	textshape: 'textShape',
	'text-shape': 'textShape',
	customgeometry: 'customGeometry',
	'custom-geometry': 'customGeometry',
	'wordart': 'wordart',
	'word-art': 'wordart',
	text3d: 'text3d',
	'text-3d': 'text3d',
	image: 'image-feature',
	photo: 'image-feature',
	'image-feature': 'image-feature',
	imagefeature: 'image-feature',
	'avatar-narration': 'avatarNarration',
	'slide-zoom': 'slideZoom',
	'opaque-native': 'opaqueNative',
	opaquenative: 'opaqueNative',

	// Canonical values are included explicitly so the function also acts as a
	// fail-closed validator for an unsupported kind.
	title: 'title',
	text: 'text',
	textshape: 'textShape',
	shape: 'shape',
	connector: 'connector',
	group: 'group',
	icon: 'icon',
	stat: 'stat',
	kpi: 'kpi',
	atmosphere: 'atmosphere',
	body: 'body',
	'two-column': 'two-column',
	'metric-grid': 'metric-grid',
	comparison: 'comparison',
	timeline: 'timeline',
	process: 'process',
	diagram: 'diagram',
	equation: 'equation',
	model3d: 'model3d',
	freeform: 'freeform',
	media: 'media',
	ink: 'ink',
	laser: 'laser',
	narration: 'narration',
	avatarnation: 'avatarNarration',
	cameo: 'cameo',
	slidezoom: 'slideZoom',
	quote: 'quote',
	'section-divider': 'section-divider',
	agenda: 'agenda',
	callout: 'callout',
})

const CONTENT_REPRESENTATION_EXPECTATIONS = Object.freeze({
	'chart-panel': { capability: 'chart', expected: 'native-chart', nativeRequired: true },
	'table-panel': { capability: 'table', expected: 'native-table', nativeRequired: true },
	'animated-table': { capability: 'animated-table', expected: 'editable-shape-built-animated-table', nativeRequired: false },
	smartart: { capability: 'smartart', expected: 'native-smartart', nativeRequired: true },
	diagram: { capability: 'smartart', expected: 'native-smartart', nativeRequired: true },
	model3d: { capability: 'model3d', expected: 'native-model3d', nativeRequired: true },
	media: { capability: 'media', expected: 'embedded-media', nativeRequired: true },
	'image-feature': { capability: 'picture', expected: 'editable-picture-frame', nativeRequired: true },
	narration: { capability: 'narration', expected: 'embedded-audio-or-notes', nativeRequired: false },
	avatarNarration: { capability: 'talking-head', expected: 'embedded-audiovisual-video', nativeRequired: true },
	text3d: { capability: 'text3d', expected: 'editable-native-dimensional-text', nativeRequired: true },
	wordart: { capability: 'wordart', expected: 'editable-native-wordart', nativeRequired: true },
	shape: { capability: 'shape', expected: 'editable-native-shape', nativeRequired: true },
	customGeometry: { capability: 'custom-geometry', expected: 'editable-custom-geometry', nativeRequired: true },
	equation: { capability: 'equation', expected: 'native-equation', nativeRequired: true },
	connector: { capability: 'connector', expected: 'editable-native-connector', nativeRequired: true },
	group: { capability: 'group', expected: 'editable-native-group', nativeRequired: true },
})

// This is the public projection of the same discriminator and native-carrier
// table used by normalizeContentKindsInSpec and the compiler. Keeping the
// published vocabulary derived from the validator prevents discovery from
// teaching a kind or alias that the execution path interprets differently.
export const CONTENT_REPRESENTATION_CONTRACT = Object.freeze({
	schemaVersion: CONTENT_REPRESENTATION_SCHEMA_VERSION,
	discriminator: 'slides[].content[].kind',
	canonicalKinds: Object.freeze([...new Set(Object.values(CONTENT_KIND_ALIASES))].sort()),
	aliases: Object.freeze({ ...CONTENT_KIND_ALIASES }),
	expectations: Object.freeze(Object.fromEntries(Object.entries(CONTENT_REPRESENTATION_EXPECTATIONS).map(([kind, value]) => [kind, { ...value, fallbackAuthorized: false }]))),
	policy: {
		unknownKinds: 'reject-with-actionable-error',
		nativeMismatch: 'block-unless-explicit-fallback-is-authorized',
		readback: ['requestedKind', 'canonicalKind', 'expectedRepresentation', 'plannedRepresentation', 'serializedRepresentation', 'fallbackAuthorized', 'status'],
		aliases: 'Lossless legacy spellings are normalized before validation and retained only in representation audit/readback.',
		primitiveDefaults: 'Kinds without a specialized expectation use the compiler primitive contract and still expose their planned native representation in readback.',
	},
})

function contentKindKey(value) {
	return String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-')
}

export function canonicalContentKind(value) {
	const key = contentKindKey(value)
	if (!key) return null
	return CONTENT_KIND_ALIASES[key] || null
}

export function contentRepresentationExpectation(kind, block = {}) {
	const canonicalKind = canonicalContentKind(kind) || String(kind || '').trim()
	const base = CONTENT_REPRESENTATION_EXPECTATIONS[canonicalKind] || {
		capability: canonicalKind || 'unknown',
		expected: 'editable-native-content',
		nativeRequired: false,
	}
	if (canonicalKind === 'smartart' && String(block.mode || '').toLowerCase() === 'shape') {
		return { ...base, expected: 'explicit-shape-built-diagram', nativeRequired: false, fallbackAuthorized: true }
	}
	return { ...base, fallbackAuthorized: false }
}

function contentKindError({ requestedKind, path, slideId, blockName }) {
	const received = requestedKind || null
	const error = new Error(`${path}.kind must be a supported BetterPPTX content kind; received ${received === null ? 'missing' : JSON.stringify(received)}.`)
	error.code = received === null ? 'CONTENT_KIND_REQUIRED' : 'CONTENT_KIND_UNSUPPORTED'
	error.details = {
		path,
		slideId: slideId || null,
		blockName: blockName || null,
		received: received,
		accepted: Array.from(new Set(Object.values(CONTENT_KIND_ALIASES))).sort(),
		aliases: CONTENT_KIND_ALIASES,
		fix: 'Choose a documented content kind. Native chart, table, and SmartArt requests use chart-panel, table-panel, and smartart. Independently animated rows or cells use animated-table, which is an explicit editable native-composite rather than a native p:tbl.',
	}
	return error
}

/**
 * Normalize content kind aliases before any validator or layout decision runs.
 * The original requested spelling is returned as audit data; it is not added
 * to the submitted spec, so public specs and their digests stay portable and
 * free of internal provenance fields.
 */
export function normalizeContentKindsInSpec(inputSpec = {}) {
	const audit = []
	const normalizeBlock = (block, path, slideId, fallbackName) => {
		if (!block || typeof block !== 'object' || Array.isArray(block)) return block
		const requestedKind = String(block.kind ?? '').trim()
		const canonicalKind = canonicalContentKind(requestedKind)
		if (!canonicalKind) throw contentKindError({ requestedKind: requestedKind || null, path, slideId, blockName: block.name || block.objectName || fallbackName })
		const normalized = canonicalKind === requestedKind ? { ...block } : { ...block, kind: canonicalKind }
		// Group children are native child descriptors in most specs. Normalize a
		// nested content block only when it declares its own kind; leave text-only
		// child descriptors untouched and let the group contract validate them.
		if (Array.isArray(block.children)) {
			normalized.children = block.children.map((child, childIndex) => child && typeof child === 'object' && !Array.isArray(child) && child.kind
				? normalizeBlock(child, `${path}.children[${childIndex}]`, slideId, `${fallbackName || 'group'}-child-${childIndex + 1}`)
				: child)
		}
		const blockName = block.name || block.objectName || fallbackName || null
		const expectation = contentRepresentationExpectation(canonicalKind, normalized)
		audit.push({
			slideId: slideId || null,
			blockName,
			path,
			requestedKind: requestedKind || null,
			canonicalKind,
			aliasNormalized: requestedKind !== canonicalKind,
			...expectation,
		})
		return normalized
	}
	const slides = Array.isArray(inputSpec?.slides)
		? inputSpec.slides.map((slide, slideIndex) => {
			if (!slide || typeof slide !== 'object' || Array.isArray(slide)) return slide
			const slideId = slide.id || `slide-${slideIndex + 1}`
			return {
				...slide,
				content: Array.isArray(slide.content)
					? slide.content.map((block, blockIndex) => normalizeBlock(block, `slides[${slideIndex}].content[${blockIndex}]`, slideId, `block-${blockIndex + 1}`))
					: slide.content,
			}
		})
		: inputSpec?.slides
	return { spec: { ...inputSpec, ...(slides === inputSpec?.slides ? {} : { slides }) }, audit }
}

export function plannedRepresentationForObject(object = {}) {
	const canonicalKind = canonicalContentKind(object.primitive || object.kind)
	const primitive = object.primitive || ({
		'chart-panel': 'chart',
		'table-panel': 'table',
		'animated-table': 'group',
		smartart: 'smartart',
		diagram: 'smartart',
		model3d: 'model3d',
		media: 'media',
		'image-feature': 'image',
		avatarNarration: 'media',
		text3d: 'text3d',
		wordart: 'wordart',
		customGeometry: 'customGeometry',
		equation: 'equation',
		connector: 'connector',
		group: 'group',
		shape: 'shape',
		textShape: 'textShape',
		textBox: 'textBox',
		text: 'text',
		opaqueNative: 'opaqueNative',
	}[canonicalKind] || canonicalKind)
	// WordArt and Text3D serialize through PowerPoint's native text-shape
	// carrier. The layout primitive therefore remains `text`, while the role and
	// structured style identify the stronger native representation. Treating
	// every text primitive as a plain text box made the advertised dedicated
	// WordArt/Text3D kinds fail their own representation gate.
	if ((primitive === 'text' || primitive === 'textBox') && object.role === 'wordart') return 'editable-native-wordart'
	if ((primitive === 'text' || primitive === 'textBox') && object.role === 'text3d') return 'editable-native-dimensional-text'
	if (primitive === 'group' && object.role === 'animated-table') return 'editable-shape-built-animated-table'
	if (primitive === 'chart') return 'native-chart'
	if (primitive === 'table') return 'native-table'
	if (primitive === 'smartart') return String(object.mode || '').toLowerCase() === 'shape' ? 'explicit-shape-built-diagram' : 'native-smartart'
	if (primitive === 'model3d') return 'native-model3d'
	if (primitive === 'media') return 'embedded-media'
	if (primitive === 'image') return 'editable-picture-frame'
	if (primitive === 'text3d') return 'editable-native-dimensional-text'
	if (primitive === 'wordart') return 'editable-native-wordart'
	if (primitive === 'customGeometry') return 'editable-custom-geometry'
	if (primitive === 'equation') return 'native-equation'
	if (primitive === 'connector') return 'editable-native-connector'
	if (primitive === 'group') return 'editable-native-group'
	if (primitive === 'shape') return 'editable-native-shape'
	if (primitive === 'textShape') return 'editable-native-text-shape'
	if (primitive === 'text' || primitive === 'textBox') return 'editable-native-text-box'
	if (primitive === 'opaqueNative') return 'preserved-native-object'
	return primitive ? `editable-native-${primitive}` : 'unknown'
}

export function attachContentRepresentationAudit(plan, audit = []) {
	if (!plan || !Array.isArray(audit) || !audit.length) return plan
	const byKey = new Map(audit.map(item => [`${item.slideId}|${item.blockName}`, item]))
	const flatten = (objects, result = []) => {
		for (const object of objects || []) {
			result.push(object)
			flatten(object.children, result)
		}
		return result
	}
	const isExplicitNativePreservation = object => plannedRepresentationForObject(object) === 'preserved-native-object'
		&& typeof object.preservationHandle === 'string'
		&& object.preservationHandle.trim() !== ''
	for (const slide of plan.slides || []) {
		const objects = flatten(slide.objects)
		for (const item of audit.filter(candidate => String(candidate.slideId) === String(slide.slideId))) {
			const candidates = objects.filter(object => String(object.blockName || object.objectName || object.name) === String(item.blockName))
			const matching = candidates.filter(object => plannedRepresentationForObject(object) === item.expected || isExplicitNativePreservation(object))
			// A semantic block can produce an engine-owned frame plus its real
			// carrier. Attach the contract to the carrier so readback never claims
			// that the auxiliary frame is the requested native representation.
			const targets = matching.length ? matching : candidates.slice(0, 1)
			for (const object of targets) {
				object.contentRepresentation = {
					schemaVersion: CONTENT_REPRESENTATION_SCHEMA_VERSION,
					requestedKind: item.requestedKind,
					canonicalKind: item.canonicalKind,
					capability: item.capability,
					expectedRepresentation: item.expected,
					plannedRepresentation: plannedRepresentationForObject(object),
					fallbackAuthorized: item.fallbackAuthorized === true,
					aliasNormalized: item.aliasNormalized,
					status: 'planned-before-serialization',
				}
			}
		}
	}
	return plan
}

export function assertContentRepresentationIntegrity(plan, audit = []) {
	const mismatches = []
	const objectsForSlide = slide => {
		const result = []
		const visit = object => {
			result.push(object)
			for (const child of object.children || []) visit(child)
		}
		for (const object of slide?.objects || []) visit(object)
		return result
	}
	for (const item of audit || []) {
		const objects = objectsForSlide((plan?.slides || []).find(slide => String(slide.slideId) === String(item.slideId)))
			.filter(object => String(object.blockName || object.objectName || object.name) === String(item.blockName))
		if (!objects.length) {
			mismatches.push({ ...item, plannedRepresentation: null, reason: 'no-planned-object' })
			continue
		}
		// One semantic block can intentionally produce more than one native object
		// (for example, an image frame plus the image itself). Validate that the
		// requested carrier exists rather than treating an engine-owned frame as a
		// generic-text lowering of the authored block.
		const isExplicitNativePreservation = object => {
			const plannedRepresentation = plannedRepresentationForObject(object)
			return plannedRepresentation === 'preserved-native-object'
				&& typeof object.preservationHandle === 'string'
				&& object.preservationHandle.trim() !== ''
		}
		const matchingNativeObject = objects.find(object => {
			const plannedRepresentation = plannedRepresentationForObject(object)
			return plannedRepresentation === item.expected || isExplicitNativePreservation(object)
		})
		if (item.nativeRequired && !matchingNativeObject) {
			const first = objects[0]
			mismatches.push({ ...item, plannedRepresentation: first ? plannedRepresentationForObject(first) : null, objectName: first?.objectName, reason: 'native-representation-mismatch' })
		}
	}
	if (!mismatches.length) return
	const error = new Error(`Content representation contract failed for ${mismatches.length} object${mismatches.length === 1 ? '' : 's'}; a requested native object cannot be lowered as generic text.`)
	error.code = 'CONTENT_REPRESENTATION_MISMATCH'
	error.details = { schemaVersion: CONTENT_REPRESENTATION_SCHEMA_VERSION, mismatches }
	throw error
}

function splitRatiosAreSafe(values, netSpan = null) {
	if (!Array.isArray(values) || values.length < 2) return false
	const numeric = values.map(Number)
	if (numeric.some(value => !Number.isFinite(value) || value <= 0)) return false
	const sum = numeric.reduce((total, value) => total + value, 0)
	if (!Number.isFinite(sum) || !(sum > 0)) return false
	if (netSpan !== null && (!(Number(netSpan) > 0.02) || numeric.some(value => Number(netSpan) * value / sum <= 0.01))) return false
	return true
}

export const AUTHORING_DATA_BLOCK_KINDS = Object.freeze(['chart-panel', 'table-panel', 'metric-grid', 'stat', 'kpi', 'timeline', 'process', 'smartart', 'diagram'])
const DATA_BLOCK_KINDS = new Set(AUTHORING_DATA_BLOCK_KINDS)
const NONVISUAL_PRIMITIVES = new Set(['narration'])
const TEXT_PRIMITIVES = new Set(['text', 'textBox', 'textShape', 'title', 'body', 'quote', 'callout'])
const VISUAL_PRIMITIVES = new Set(['image', 'media', 'chart', 'table', 'model3d', 'freeform', 'shape', 'group'])
// Semantic roles that are intentionally virtual rather than geometry entries.
// `media` is routed by chooseRegion() according to the selected layout; it must
// not be mistaken for an unresolved client-authored geometry name by the
// commit gate.
// `hero` is also virtual: it names the focal visual relationship and is routed
// by chooseRegion() through the selected layout intent. It is deliberately not
// a raw rectangle in regionCatalog, so the same semantic pin works for hero and
// title-body slides without exposing a second geometry API.
export const RESERVED_SEMANTIC_REGIONS = Object.freeze(new Set(['media', 'hero']))

function round(n) {
	return Math.round(Number(n) * 1000) / 1000
}

function rect(x, y, w, h, role = 'body') {
	return { x: round(x), y: round(y), w: round(w), h: round(h), role }
}

function explicitRect(value, role = 'body', preservePrecision = false) {
	if (!value || typeof value !== 'object') return null
	const x = Number(value.x)
	const y = Number(value.y)
	const w = Number(value.w)
	const h = Number(value.h)
	if (![x, y, w, h].every(Number.isFinite)) return null
	if (preservePrecision) return { x, y, w, h, role: value.role || role }
	return rect(x, y, w, h, value.role || role)
}

function inset(r, amount) {
	return rect(r.x + amount, r.y + amount, Math.max(0.01, r.w - amount * 2), Math.max(0.01, r.h - amount * 2), r.role)
}

function stableHandle(deckId, slideId, objectName, schemaVersion = SCHEMA_VERSION) {
	return crypto.createHash('sha256').update(`${deckId}|${slideId}|${objectName}|${schemaVersion}`).digest('hex').slice(0, 20)
}

// Curated, overridable identity presets. The AI opts in with styleIntent.preset
// (e.g. "command-center") and instantly gets an on-brand palette + mode without a
// forced template — explicit theme.palette / styleIntent.palette / mode still win.
const STYLE_PRESETS = {
	'command-center': { mode: 'dark', palette: ['E2E8F0', '22D3EE', '34D399', 'F59E0B', '0B1120'], headFontFace: 'Aptos Display', bodyFontFace: 'Aptos' },
	'editorial-light': { mode: 'light', palette: ['0F172A', '2563EB', '0EA5E9', 'F59E0B', 'FFFFFF'], headFontFace: 'Aptos Display', bodyFontFace: 'Aptos' },
	'warm-keynote': { mode: 'dark', palette: ['FDF4E3', 'F59E0B', 'F472B6', '22D3EE', '1C1410'], headFontFace: 'Aptos Display', bodyFontFace: 'Aptos' },
	'forest': { mode: 'dark', palette: ['ECFDF5', '34D399', '22D3EE', 'F59E0B', '052E2B'], headFontFace: 'Aptos Display', bodyFontFace: 'Aptos' },
	'violet-noir': { mode: 'dark', palette: ['EDE9FE', 'A78BFA', '22D3EE', 'F472B6', '0B0A1A'], headFontFace: 'Aptos Display', bodyFontFace: 'Aptos' },
	'slate-pro': { mode: 'light', palette: ['111827', '0EA5E9', '10B981', 'F59E0B', 'F8FAFC'], headFontFace: 'Aptos Display', bodyFontFace: 'Aptos' },
}

// --- Art directions: genuinely distinct visual WORLDS, not just recolors ---
// Each world branches background treatment, card language, type system, corners and accent
// logic so two decks look STRUCTURALLY different. The AI picks one via styleIntent.artDirection
// to match the audience/tone; default stays 'aurora'. Author overrides (theme.palette,
// slide.background, content[].options.fill) always win over any of this.
// M12 application fidelity: the canvas builders derive from the EFFECTIVE bg (b.bg = the
// author's brand palette[4] when supplied, else the world's own signature) so a brand colour
// flows through while each world keeps its TREATMENT (flat vs gradient).
function artDarkGrad(base) { return gradient([[0, lightenHex(base, 0.16), 0], [0.55, base, 0], [1, darkenHex(base, 0.42), 0]], 115) }
function artLightGrad(base) { return gradient([[0, 'FFFFFF', 0], [0.72, base, 0], [1, darkenHex(base, 0.05), 0]], 15) }
const ART_DIRECTIONS = {
	aurora: {
		label: 'Aurora — modern SaaS: dark navy gradient, glassy lifted cards, clean grotesk. Default; good for product/startup/exec.',
		mode: 'dark', palette: ['F8FAFC', '2DD4BF', '38BDF8', 'F59E0B', '0B1120'],
		headFontFace: 'Segoe UI Semibold', bodyFontFace: 'Calibri',
		bg: (b, dark) => dark ? artDarkGrad(b.bg || '0B1120') : artLightGrad(b.bg || 'F8FAFC'),
		panel: (b, dark) => dark ? lightenHex(b.bg || '0B1120', 0.07) : 'FFFFFF', card: 'glass',
	},
	editorial: {
		label: 'Editorial — light print/magazine: flat warm paper, serif headings, NO boxes (typographic, thin rules + whitespace), left-aligned. Good for reports, essays, narrative.',
		mode: 'light', palette: ['1A1A1A', 'B91C1C', '1D4ED8', '0F766E', 'FBFBF9'],
		headFontFace: 'Georgia', bodyFontFace: 'Calibri',
		bg: (b) => ({ color: b.bg || 'FBFBF9' }), panel: (b) => b.bg || 'FBFBF9', card: 'bare',
	},
	blueprint: {
		label: 'Blueprint — dark technical: flat near-black, monospace headings, outline/wireframe cards, sharp corners, cyan accent. Good for engineering, architecture, data ops.',
		mode: 'dark', palette: ['D6E4F0', '38BDF8', '22C55E', 'F59E0B', '0A0F1A'],
		headFontFace: 'Consolas', bodyFontFace: 'Segoe UI',
		bg: (b) => ({ color: b.bg || '0A0F1A' }), panel: (b) => lightenHex(b.bg || '0A0F1A', 0.05), card: 'outline',
	},
	brutalist: {
		label: 'Brutalist — pure black poster: heavy type, solid hard-edge blocks, no shadows, one loud accent. Good for bold keynotes, launches, manifestos.',
		mode: 'dark', palette: ['FFFFFF', 'FACC15', 'FFFFFF', 'FACC15', '000000'],
		headFontFace: 'Arial Black', bodyFontFace: 'Arial',
		bg: (b) => ({ color: b.bg || '000000' }), panel: (b) => lightenHex(b.bg || '000000', 0.09), card: 'solid',
	},
	luxe: {
		label: 'Luxe — warm espresso gradient, gold accent, serif display, thin elegant gold-edged cards, centered, generous space. Good for premium brand, luxury, fundraising.',
		mode: 'dark', palette: ['F5ECD9', 'C8A24B', 'E8C26B', '9C6B3F', '141008'],
		headFontFace: 'Georgia', bodyFontFace: 'Calibri',
		bg: (b) => artDarkGrad(b.bg || '141008'),
		panel: (b) => lightenHex(b.bg || '141008', 0.06), card: 'thin',
	},
	mist: {
		label: 'Mist — soft near-white minimal: airy whitespace, muted indigo accent, rounded flat cards, light. Good for calm, wellness, education, design-forward.',
		mode: 'light', palette: ['334155', '6366F1', '14B8A6', 'F59E0B', 'FAFAFC'],
		headFontFace: 'Segoe UI Semibold', bodyFontFace: 'Calibri',
		bg: (b) => ({ color: b.bg || 'FAFAFC' }), panel: (b) => darkenHex(b.bg || 'FAFAFC', 0.03), card: 'soft',
	},
	// ---- EXPANSION WAVE 1 (2026-07-03): six new intent-placed worlds. Each is a NEW point in
	// axis-space (new card surface key + its own temperament in every axis switch), covering
	// three market families: Professional (atelier, meridian), Explainer (chalkline, playbook),
	// Creator/Social (pulse, collage). Same doctrine: defaults, never limits.
	atelier: {
		label: 'Atelier — warm editorial craft: cream paper, terracotta/ochre accents, humanist serif headings, thin craft-framed cards, generous margins. Good for brand storytelling, consulting, humanities.',
		mode: 'light', palette: ['2B2118', 'C2551F', 'B45309', '4D7C0F', 'F7F1E5'],
		headFontFace: 'Georgia', bodyFontFace: 'Calibri',
		bg: (b) => ({ color: b.bg || 'F7F1E5' }), panel: (b) => darkenHex(b.bg || 'F7F1E5', 0.04), card: 'craft',
	},
	meridian: {
		label: 'Meridian — corporate trust classic: cool paper, deep navy ink, royal blue accent, crisp hairline panels, disciplined grid, restrained motion. Good for finance, board, enterprise sales.',
		mode: 'light', palette: ['0F2A43', '1D4ED8', '0E7490', 'B45309', 'F6F8FB'],
		headFontFace: 'Segoe UI Semibold', bodyFontFace: 'Calibri',
		bg: (b) => ({ color: b.bg || 'F6F8FB' }), panel: () => 'FFFFFF', card: 'panel',
	},
	chalkline: {
		label: 'Chalkline — tutorial native: clean instructional canvas, step-badge blue, success green, highlight amber; screenshot plates with device chrome, numbered steps, region zooms. Good for how-to lessons, onboarding, product walkthroughs.',
		mode: 'light', palette: ['1E293B', '2563EB', '16A34A', 'F59E0B', 'FCFCFD'],
		headFontFace: 'Segoe UI Semibold', bodyFontFace: 'Segoe UI',
		bg: (b) => ({ color: b.bg || 'FCFCFD' }), panel: (b) => darkenHex(b.bg || 'FCFCFD', 0.03), card: 'frame',
	},
	playbook: {
		label: 'Playbook — friendly explainer: bright white, violet/cyan/orange accessible accents, big rounded cards, checklist energy. Good for onboarding, guides, non-expert audiences.',
		mode: 'light', palette: ['1F2937', '7C3AED', '06B6D4', 'F97316', 'FFFFFF'],
		headFontFace: 'Segoe UI Semibold', bodyFontFace: 'Segoe UI',
		bg: (b) => ({ color: b.bg || 'FFFFFF' }), panel: (b) => darkenHex(b.bg || 'FFFFFF', 0.035), card: 'rounded',
	},
	pulse: {
		label: 'Pulse — short-video native: near-black stage, hot rose/cyan/yellow, huge kinetic type, hard cuts, beat-tight builds, center poster energy. Good for Shorts/Reels/TikTok decks and hook-first stories (pairs with a 9:16 layout).',
		mode: 'dark', palette: ['FAFAFA', 'F43F5E', '22D3EE', 'FDE047', '09090B'],
		headFontFace: 'Arial Black', bodyFontFace: 'Segoe UI',
		bg: (b) => ({ color: b.bg || '09090B' }), panel: (b) => lightenHex(b.bg || '09090B', 0.08), card: 'poster',
	},
	collage: {
		label: 'Collage — creator scrapbook: warm paper, pink/teal/mustard stickers, polaroid-framed images, handcrafted playfulness. Good for lifestyle creators, mood boards, event and community decks.',
		mode: 'light', palette: ['292524', 'DB2777', '0D9488', 'EAB308', 'FDF6EC'],
		headFontFace: 'Trebuchet MS', bodyFontFace: 'Segoe UI',
		bg: (b) => ({ color: b.bg || 'FDF6EC' }), panel: (b) => darkenHex(b.bg || 'FDF6EC', 0.045), card: 'scrap',
	},
	// ---- EXPANSION WAVE 2 (2026-07-03, owner decision): completes the three families at 3/3/3
	// (15 worlds). Vision decides the catalog; usage data tunes it later.
	observatory: {
		label: 'Observatory — scientific/analytic: deep-space dark, data-cyan and signal-lime accents, precision grids, thin plot frames, slow deliberate builds. Good for research, quant reviews, engineering deep-dives.',
		mode: 'dark', palette: ['D8E3F0', '7DD3FC', 'A3E635', 'F472B6', '0D1321'],
		headFontFace: 'Segoe UI Semibold', bodyFontFace: 'Segoe UI',
		bg: (b) => ({ color: b.bg || '0D1321' }), panel: (b) => lightenHex(b.bg || '0D1321', 0.05), card: 'plot',
	},
	storybook: {
		label: 'Storybook — young-learner warmth: warm page canvas, sunshine/sky/candy accents, handwriting headings, oversized type, bouncy unhurried builds, storyteller narration. Good for kids, language learning, gentle onboarding.',
		mode: 'light', palette: ['3B2E2A', 'F59E0B', '38BDF8', 'F472B6', 'FFF9EF'],
		headFontFace: 'Segoe Print', bodyFontFace: 'Segoe UI',
		bg: (b) => ({ color: b.bg || 'FFF9EF' }), panel: (b) => darkenHex(b.bg || 'FFF9EF', 0.04), card: 'page',
	},
	candy: {
		label: 'Candy — vibrant social pop: blush gradient canvas, pink/violet/emerald, chunky black type, lifted glossy cards, fluid morphs. Good for marketing cards, product carousels, playful launches.',
		mode: 'light', palette: ['3F3F46', 'EC4899', '8B5CF6', '10B981', 'FEF6FB'],
		headFontFace: 'Segoe UI Black', bodyFontFace: 'Segoe UI',
		bg: (b, dark) => dark ? artDarkGrad(b.bg || '1E1B26') : artLightGrad(b.bg || 'FEF6FB'),
		panel: () => 'FFFFFF', card: 'candy',
	},
	// ---- EXPANSION WAVE 3 (2026-07-03, owner decision): three intent gaps closed — image-first
	// (horizon), quiet-minimal keynote (mono), organic wellness (botanical) → 18 worlds × 2 modes.
	horizon: {
		label: 'Horizon — travel/photo full-bleed: deep photo-neutral canvas, golden-hour amber, lagoon teal and coral accents, light elegant type, glassy caption scrims over edge-to-edge imagery. Good for travel, photography, real estate, portfolios (pairs with photo search).',
		mode: 'dark', palette: ['F5F7F8', 'F59E0B', '2DD4BF', 'FB7185', '10151A'],
		headFontFace: 'Segoe UI Semilight', bodyFontFace: 'Segoe UI',
		bg: (b) => ({ color: b.bg || '10151A' }), panel: (b) => lightenHex(b.bg || '10151A', 0.07), card: 'bleed',
	},
	mono: {
		label: 'Mono — quiet keynote minimal: gallery white, near-black light-weight type at large sizes, ONE electric-blue accent, no boxes, vast whitespace, centered statements. Good for product launches, visionary keynotes, design portfolios.',
		mode: 'light', palette: ['0A0A0A', '0071E3', '6E6E73', 'FF9F0A', 'FFFFFF'],
		headFontFace: 'Segoe UI Light', bodyFontFace: 'Segoe UI',
		bg: (b) => ({ color: b.bg || 'FFFFFF' }), panel: (b) => darkenHex(b.bg || 'FFFFFF', 0.03), card: 'quiet',
	},
	botanical: {
		label: 'Botanical — organic wellness: sage paper, moss/marigold/berry accents, humanist serif headings, softly rounded leaf cards, airy garden margins, calm breathing pace. Good for wellness, sustainability, food, coaching, lifestyle brands.',
		mode: 'light', palette: ['253320', '4D7C0F', 'D97706', '9D174D', 'F3F5EC'],
		headFontFace: 'Palatino Linotype', bodyFontFace: 'Segoe UI',
		bg: (b) => ({ color: b.bg || 'F3F5EC' }), panel: () => 'FFFFFF', card: 'leaf',
	},
}
// BOTH-MODE WORLDS — "world = starting point, full palette open" applied to light/dark. Each
// named world ships a tuned OPPOSITE-mode variant so styleIntent.mode:"light|dark" flips it to a
// HIGHEST-GRADE version of that mode (not a naive invert): the world's CHARACTER — accent hues,
// type, card language — is preserved; only the value (ink↔canvas) and the canvas treatment flip.
// A world is thus available in both modes. Only activates on an explicit mode override, so decks
// that don't ask keep their canonical mode unchanged (zero regression).
const ART_MODE_VARIANTS = {
	aurora:    { light: { palette: ['0B1120', '0EA5E9', '2DD4BF', 'F59E0B', 'F8FAFC'] } }, // bg/panel already mode-aware
	editorial: { dark:  { palette: ['F5F5F4', 'F87171', '60A5FA', '5EEAD4', '141414'], bg: b => ({ color: b.bg || '141414' }), panel: b => lightenHex(b.bg || '141414', 0.06) } },
	blueprint: { light: { palette: ['0A0F1A', '0284C7', '16A34A', 'EA580C', 'F1F5F9'], bg: b => ({ color: b.bg || 'F1F5F9' }), panel: b => darkenHex(b.bg || 'F1F5F9', 0.04) } },
	brutalist: { light: { palette: ['000000', 'DC2626', '000000', 'DC2626', 'FFFFFF'], bg: b => ({ color: b.bg || 'FFFFFF' }), panel: b => darkenHex(b.bg || 'FFFFFF', 0.06) } },
	luxe:      { light: { palette: ['3B2F1E', 'A97C1F', '9C6B3F', 'C8A24B', 'FBF6EA'], bg: b => artLightGrad(b.bg || 'FBF6EA'), panel: b => darkenHex(b.bg || 'FBF6EA', 0.03) } },
	// Mist remains a soft, flat minimal World in both modes.  Its dark variant
	// changes value/palette only; it must not silently introduce a gradient while
	// the Director reports gradientPolicy.expected=false.
	mist:      { dark:  { palette: ['E2E8F0', '818CF8', '2DD4BF', 'F59E0B', '0F1120'], bg: b => ({ color: b.bg || '0F1120' }), panel: b => lightenHex(b.bg || '0F1120', 0.06) } },
	atelier:   { dark:  { palette: ['F4EBDD', 'E8703A', 'D9A03F', '8FA35C', '201812'], bg: b => ({ color: b.bg || '201812' }), panel: b => lightenHex(b.bg || '201812', 0.06) } },
	meridian:  { dark:  { palette: ['E4EDF7', '60A5FA', '22D3EE', 'F59E0B', '0B1B2E'], bg: b => ({ color: b.bg || '0B1B2E' }), panel: b => lightenHex(b.bg || '0B1B2E', 0.07) } },
	chalkline: { dark:  { palette: ['F1F5F9', '60A5FA', '4ADE80', 'FBBF24', '111827'], bg: b => ({ color: b.bg || '111827' }), panel: b => lightenHex(b.bg || '111827', 0.06) } },
	playbook:  { dark:  { palette: ['F4F4F5', 'A78BFA', '22D3EE', 'FB923C', '17141F'], bg: b => ({ color: b.bg || '17141F' }), panel: b => lightenHex(b.bg || '17141F', 0.07) } },
	pulse:     { light: { palette: ['18181B', 'E11D48', '0891B2', 'CA8A04', 'FAFAFA'], bg: b => ({ color: b.bg || 'FAFAFA' }), panel: b => darkenHex(b.bg || 'FAFAFA', 0.05) } },
	collage:   { dark:  { palette: ['F5F5F4', 'F472B6', '2DD4BF', 'FACC15', '1C1917'], bg: b => ({ color: b.bg || '1C1917' }), panel: b => lightenHex(b.bg || '1C1917', 0.06) } },
	observatory: { light: { palette: ['18263B', '0284C7', '65A30D', 'DB2777', 'F4F7FB'], bg: b => ({ color: b.bg || 'F4F7FB' }), panel: b => darkenHex(b.bg || 'F4F7FB', 0.04) } },
	storybook: { dark:  { palette: ['F5EDFF', 'FBBF24', '7DD3FC', 'F9A8D4', '221A2E'], bg: b => ({ color: b.bg || '221A2E' }), panel: b => lightenHex(b.bg || '221A2E', 0.07) } },
	candy:     { dark:  { palette: ['FAF5FF', 'F472B6', 'A78BFA', '2DD4BF', '1E1B26'], bg: b => artDarkGrad(b.bg || '1E1B26'), panel: b => lightenHex(b.bg || '1E1B26', 0.08) } },
	horizon:   { light: { palette: ['1C2833', 'B45309', '0F766E', 'BE123C', 'FAF7F2'], bg: b => ({ color: b.bg || 'FAF7F2' }), panel: b => darkenHex(b.bg || 'FAF7F2', 0.04) } },
	mono:      { dark:  { palette: ['F5F5F7', '2997FF', '86868B', 'FFD60A', '000000'], bg: b => ({ color: b.bg || '000000' }), panel: b => lightenHex(b.bg || '000000', 0.07) } },
	botanical: { dark:  { palette: ['ECF2E0', '94B347', 'E8A33D', 'E17BAA', '141A10'], bg: b => ({ color: b.bg || '141A10' }), panel: b => lightenHex(b.bg || '141A10', 0.06) } },
}

function requestedModeFor(spec) {
	const vals = [spec?.styleIntent?.mode, spec?.styleIntent?.tone, spec?.theme?.mode].map(v => String(v || '').toLowerCase())
	if (vals.some(v => v.includes('dark') || v.includes('night'))) return 'dark'
	if (vals.some(v => v.includes('light'))) return 'light'
	return null
}

function resolveWorldMode(base, key, spec) {
	const req = requestedModeFor(spec)
	if (!req || req === base.mode) return base
	const variant = ART_MODE_VARIANTS[key]?.[req]
	if (!variant) return base   // no tuned variant → keep canonical styling (mode flag still flips downstream)
	return {
		...base,
		mode: req,
		palette: variant.palette || base.palette,
		...(variant.card ? { card: variant.card } : {}),
		...(variant.headFontFace ? { headFontFace: variant.headFontFace } : {}),
		bg: variant.bg || base.bg,
		panel: variant.panel || base.panel,
		modeVariantOf: base.mode,
	}
}

// Synthesize a COMPLETE art-direction entry from inline AI-supplied axes — the
// bespoke-world front door (M17). The named worlds are curated points in a
// continuous space; this lets the AI compose a brand-new world by naming the same
// axes (mode, palette, card surface, type pairing) and get bg/panel canvases for
// free. Because every consumer reads `art` through artDirectionFor, ONE synthesis
// generalizes the whole machinery (canvas, cards, type, theme accents, data
// language). Unspecified axes fall back so the AI can supply only what it cares about.
function synthesizeArtDirection(obj) {
	const modeIn = String(obj.mode || '').toLowerCase().trim()
	const palette = Array.isArray(obj.palette) && obj.palette.length >= 2 ? obj.palette : null
	const bgHex = String(obj.bg || (palette && palette[4]) || '').replace(/^#/, '') || null
	const mode = modeIn === 'light' ? 'light' : modeIn === 'dark' ? 'dark' : (bgHex ? (isDarkHex(bgHex) ? 'dark' : 'light') : 'dark')
	const card = String(obj.card || (mode === 'dark' ? 'glass' : 'soft')).toLowerCase()
	const surfaceFill = String(obj.surface?.fill || '').toLowerCase()
	// Keep bespoke synthesis aligned with gradientPolicyForArtDirection. A
	// flat/outline/bare surface is a deliberate visual choice, not a request
	// for a gradient canvas that merely happens to be scored as flat.
	const gradientNative = surfaceFill
		? ['glass', 'lift'].includes(surfaceFill)
		: ['glass', 'candy'].includes(card)
	const fallbackBg = mode === 'dark' ? '0B1120' : 'F8FAFC'
	return {
		label: obj.label || obj.name || 'Bespoke world (AI-composed)',
		mode,
		palette: palette || undefined,
		headFontFace: obj.headFontFace || obj.headFont || (mode === 'dark' ? 'Segoe UI Semibold' : 'Segoe UI Semibold'),
		bodyFontFace: obj.bodyFontFace || obj.bodyFont || 'Calibri',
		card,
		// Continuous surface knobs (corner/fill/border/elevation) — the AI can sculpt the
		// surface beyond the 6 card presets. card stays as the base preset; surface overrides.
		...(obj.surface && typeof obj.surface === 'object' ? { surface: obj.surface } : {}),
		// Full per-temperament freedom: a bespoke world may pin ANY temperament directly
		// (each merges over the axes-derived base). The invariants still guard the result.
		...(obj.composition && typeof obj.composition === 'object' ? { composition: obj.composition } : {}),
		...(obj.emphasis && typeof obj.emphasis === 'object' ? { emphasis: obj.emphasis } : {}),
		...(obj.depth && typeof obj.depth === 'object' ? { depth: obj.depth } : {}),
		...(obj.motion && typeof obj.motion === 'object' ? { motion: obj.motion } : {}),
		...(obj.voice && typeof obj.voice === 'object' ? { voice: obj.voice } : {}),
		...(obj.dataStyle && typeof obj.dataStyle === 'object' ? { dataStyle: obj.dataStyle } : {}),
		bespoke: true,
		bg: (b, dark) => {
			const base = b.bg || bgHex || fallbackBg
			return gradientNative ? (dark ? artDarkGrad(base) : artLightGrad(base)) : { color: base }
		},
		panel: (b, dark) => {
			const base = b.bg || bgHex || fallbackBg
			return dark ? lightenHex(base, 0.07) : 'FFFFFF'
		},
	}
}

// World selection is an AI design decision. Explicit artDirection/theme.artDirection
// always wins. Luxe remains only as a legacy execution-compatibility fallback for
// older specs that omit a World; that fallback is never an AI selection and is not
// eligible for first-time-right certification. The public catalog is descriptive
// and deliberately unranked.
export const DEFAULT_ART_DIRECTION = 'luxe'
export const AURORA_LAST_RESORT_ART_DIRECTION = 'aurora'

export const WORLD_CAPABILITY_PROFILES = Object.freeze({
	luxe: { strengths: ['gradient', 'depth', 'expressive-type', 'premium-space'] },
	candy: { strengths: ['gradient', 'glossy-depth', 'fluid-morph', 'bold-type'] },
	horizon: { strengths: ['full-bleed-image', 'caption-scrim', 'depth', 'photo-proof'] },
	observatory: { strengths: ['data-proof', 'precision-grid', 'signal-accents', 'deliberate-builds'] },
	pulse: { strengths: ['kinetic-type', 'beat-tight-motion', 'poster-energy', 'social-video'] },
	aurora: { strengths: ['gradient', 'glass', 'safe-defaults'], compatibilityFallback: true },
})

function artDirectionFor(spec) {
	const raw = spec?.styleIntent?.artDirection ?? spec?.theme?.artDirection
	// Inline object = a bespoke, AI-composed world (not one of the named six).
	if (raw && typeof raw === 'object') return synthesizeArtDirection(raw)
	const key = String(raw || DEFAULT_ART_DIRECTION).toLowerCase().trim().replace(/\s+/g, '-')
	const base = ART_DIRECTIONS[key]
	if (!base) return null
	// Both-mode resolution: swap in the tuned light/dark variant if the spec asks for the
	// non-canonical mode (else return the world unchanged).
	return resolveWorldMode(base, key, spec)
}
export function listArtDirections() {
	return Object.entries(ART_DIRECTIONS).map(([key, a]) => {
		const altMode = ART_MODE_VARIANTS[key] ? (a.mode === 'dark' ? 'light' : 'dark') : null
		// Every world is a STARTING POINT: canonical mode plus a tuned opposite-mode variant.
		const capabilities = WORLD_CAPABILITY_PROFILES[key] || { strengths: [] }
		return { key, defaultMode: a.mode, availableModes: altMode ? [a.mode, altMode] : [a.mode], label: a.label, ...capabilities }
	})
}
// Key for an art-direction selection. A named world returns its registry key; a
// bespoke inline world returns 'bespoke' (so callers can label/log it).
function artDirectionKey(spec) {
	const raw = spec?.styleIntent?.artDirection ?? spec?.theme?.artDirection
	if (raw && typeof raw === 'object') return 'bespoke'
	return String(raw || DEFAULT_ART_DIRECTION).toLowerCase().trim().replace(/\s+/g, '-')
}
export function artDirectionInfo(spec) {
	const art = artDirectionFor(spec)
	if (!art) return null
	const key = artDirectionKey(spec)
	const profile = WORLD_CAPABILITY_PROFILES[key] || null
	return { key, mode: art.mode, headFontFace: art.headFontFace, bodyFontFace: art.bodyFontFace, card: art.card, bespoke: !!art.bespoke, label: art.label, ...(profile || {}) }
}

// Completeness is an AI-authored intent, not a request to add decorative
// objects. The engine reports deterministic execution constraints and never
// chooses a richer or simpler treatment on the AI's behalf. The compatibility
// default keeps older specs executable but cannot replace an explicit World in
// a first-time-right certification run.
const COMPLETENESS_TIERS = Object.freeze({ complete: 'complete', balanced: 'balanced', minimal: 'minimal' })
const COMPLETENESS_ALIASES = Object.freeze({ premium: 'complete', rich: 'complete', full: 'complete', standard: 'balanced', simple: 'minimal', basic: 'minimal' })
const COMPLETENESS_PREFERENCE_ORDER = Object.freeze([
	'gradient-world',
	'semantic-visual-proof',
	'native-3d-when-a-meaningful-model-or-presenter-is-authored',
	'hero-type-emphasis-when-short-and-legible',
	'diagram-or-native-smartart-for-process-relationships',
	'narration-synchronised-motion-on-meaningful-objects',
])
const COMPLETENESS_LAST_RESORTS = Object.freeze([
	'flat-or-unadorned-canvas-when-the-selected-world-is-not-gradient-native',
	'ordinary-text-only-visual-when-no-proof-or-asset-is-available',
	'no-presenter-when-no-consented-or-authored-presenter-asset-exists',
	'plain-hero-type-when-text-art-would-reduce-legibility-or-compete-with-a-model',
	'static-or-minimal-process-rendering-when-no-semantic-relationship-is-declared',
])

function completenessTierValue(value) {
	const raw = typeof value === 'string' ? value : value?.tier
	const key = String(raw || '').trim().toLowerCase().replace(/\s+/g, '-')
	return COMPLETENESS_TIERS[key] || COMPLETENESS_ALIASES[key] || null
}

export function authoringCompletenessForSpec(spec = {}) {
	const contract = spec?.authoringContract && typeof spec.authoringContract === 'object' ? spec.authoringContract : {}
	const style = spec?.styleIntent && typeof spec.styleIntent === 'object' ? spec.styleIntent : {}
	const policy = spec?.complexityPolicy ?? contract.completeness ?? style.completeness
	const requested = completenessTierValue(policy)
	const tier = requested || COMPLETENESS_TIERS.complete
	const source = requested
		? (spec?.complexityPolicy !== undefined ? 'spec.complexityPolicy' : contract.completeness !== undefined ? 'authoringContract.completeness' : 'styleIntent.completeness')
		: 'engine-default'
	const allowDowngrade = policy && typeof policy === 'object' && policy.allowDowngrade === false ? false : true
	return {
		contractVersion: 'authoring-excellence.completeness.v1',
		requestedTier: requested || null,
		effectiveTier: tier,
		defaultTier: COMPLETENESS_TIERS.complete,
		defaultWorld: DEFAULT_ART_DIRECTION,
		lastResortWorld: AURORA_LAST_RESORT_ART_DIRECTION,
		source,
		allowDowngrade,
		preferenceOrder: [...COMPLETENESS_PREFERENCE_ORDER],
		lastResortRules: [...COMPLETENESS_LAST_RESORTS],
		selectionRule: tier === 'complete'
			? 'The AI selects the most complete coherent treatment the story can honestly support; the engine executes that choice and records any factual downgrade constraint.'
			: tier === 'balanced'
				? 'The AI selects a coherent, evidence-led treatment and may choose restraint when complexity would not serve the story.'
				: 'Use the minimum semantic treatment requested by the author; this is an explicit exception to the complete default.',
		forbiddenShortcuts: ['empty decoration without communicative purpose', 'engine-invented geometry', 'opaque native payloads', 'invented media or presenter identity'],
	}
}

// Keep the named gradient vocabulary explicit and shared by synthesis, quality
// accounting, and the public Director contract. The other named Worlds are
// intentionally flat/outline/quiet treatments; they must not be pushed toward
// decorative gradients merely to satisfy a universal score.
export const GRADIENT_NATIVE_WORLDS = Object.freeze(['aurora', 'luxe', 'candy'])
export const INTENTIONALLY_FLAT_WORLDS = Object.freeze(Object.keys(ART_DIRECTIONS).filter(key => !GRADIENT_NATIVE_WORLDS.includes(key)))

// Gradient coverage is a World contract shared by the Director plan and the
// quality validator. Keep the decision in one place so a semantic readback
// cannot claim one treatment while quality scoring applies another.
export function gradientPolicyForArtDirection(spec = {}) {
	// `styleIntent.artDirection` is the public Director form, while
	// `theme.artDirection` remains a supported compatibility/readback form.
	// Resolve the same precedence as artDirectionInfo so a bespoke gradient
	// World cannot silently become a flat quality result merely because it was
	// supplied through `theme`.
	const rawArtDirection = spec?.styleIntent?.artDirection ?? spec?.theme?.artDirection
	const surfaceFill = rawArtDirection && typeof rawArtDirection === 'object'
		? rawArtDirection.surface?.fill || rawArtDirection.fill || null
		: null
	const art = artDirectionInfo(spec)
	const expected = surfaceFill
		? ['glass', 'lift'].includes(String(surfaceFill).toLowerCase())
		: art
			? GRADIENT_NATIVE_WORLDS.includes(art.key) || ['glass', 'candy'].includes(art.card)
			: true
	const world = art?.key || (surfaceFill ? 'bespoke-surface' : 'default-aurora')
	return {
		contractVersion: 'authoring-excellence.gradient.v1',
		expected,
		world,
		surfaces: ['canvas', 'cards', 'charts', 'process bands', 'accent bands'],
		rule: expected
			? 'The selected World expects at least one gradient surface across the canvas or authored visual system.'
			: 'The selected World intentionally uses a flat, outline, bare, or wireframe treatment; gradient coverage is not required.',
	}
}

// Accent coverage is a World contract, not a universal score target. These Worlds
// deliberately use one restrained accent in their visual language; forcing a second
// accent would make the Director add decorative colour that the selected World does
// not call for. All other named/bespoke Worlds retain the default two-accent minimum.
const SINGLE_ACCENT_WORLDS = new Set(['editorial', 'brutalist', 'luxe', 'mist', 'meridian', 'mono'])
export function accentPolicyForArtDirection(spec = {}) {
	const info = artDirectionInfo(spec)
	const world = info?.key || 'default-aurora'
	const minimumDistinctAccents = SINGLE_ACCENT_WORLDS.has(world) ? 1 : 2
	return {
		contractVersion: 'authoring-excellence.accent.v1',
		minimumDistinctAccents,
		world,
		singleAccentWorlds: [...SINGLE_ACCENT_WORLDS],
		rule: minimumDistinctAccents === 1
			? 'The selected World permits a restrained single-accent treatment; do not add a second accent merely to satisfy a score.'
			: 'The selected World expects at least two distinct accent colours across the authored visual system.',
	}
}

// Depth coverage is also a World contract. A full-bleed, poster, quiet-keynote,
// or frameless editorial treatment must not be forced to add shadows merely to
// satisfy a universal quota; Worlds with soft elevation or a meaningful frame
// still need at least one authored/engine depth treatment per slide.
export function depthPolicyForArtDirection(spec = {}) {
	const info = artDirectionInfo(spec)
	const world = info?.key || 'default-aurora'
	// Match artDirectionInfo/gradientPolicy precedence so a bespoke flat
	// surface supplied through the supported theme compatibility form cannot
	// inherit a soft shadow/frame requirement by accident.
	const rawDirection = spec?.styleIntent?.artDirection ?? spec?.theme?.artDirection
	const surface = rawDirection && typeof rawDirection === 'object' && rawDirection.surface && typeof rawDirection.surface === 'object'
		? rawDirection.surface
		: null
	const depth = artDepthForSpec(spec)
	const explicitlyFlat = String(surface?.elevation || '').toLowerCase() === 'none'
		|| (String(surface?.fill || '').toLowerCase() === 'flat' && (!surface?.border || String(surface.border).toLowerCase() === 'none'))
	const minimumDepthObjectsPerSlide = explicitlyFlat
		? 0
		: (depth?.shadow === 'soft' || depth?.imageFrame ? 1 : 0)
	return {
		contractVersion: 'authoring-excellence.depth.v1',
		minimumDepthObjectsPerSlide,
		world,
		shadow: depth?.shadow || 'none',
		imageFrame: !!depth?.imageFrame,
		rule: minimumDepthObjectsPerSlide > 0
			? 'The selected World uses soft elevation or a meaningful frame; provide at least one depth treatment per slide where visual objects call for it.'
			: 'The selected World intentionally uses a flat, poster, quiet, or frameless treatment; do not add shadows or depth merely to satisfy a score.',
	}
}
// Resolve dark/light the way the renderer does: explicit mode > art-direction > preset > custom-bg > light.
// (Naive `styleIntent.mode.includes('dark')` checks miss preset/art worlds — e.g. warm-keynote IS dark.)
export function specIsDark(spec) {
	return deckIsDark(spec || {}, {})
}

// Map a spec's *resolved* design palette (explicit theme.palette > styleIntent >
// preset > art-direction > default) into OOXML theme accent slots, so the deck's
// theme color scheme matches the colours the renderer already paints with. This
// is what makes scheme-colour consumers — native SmartArt (accent1) and any
// theme-driven chart series — adopt the world instead of the Office default.
// accent1..3 are the world's primary/secondary/tertiary; accent4..6 are tints/
// shades of them so multi-accent layouts stay inside the same family.
function resolvedPanelColor(art, paletteValue, dark) {
	const raw = art
		? (typeof art.panel === 'function' ? art.panel(paletteValue, dark) : art.panel)
		: (dark ? '172033' : 'FFFFFF')
	const candidate = raw && typeof raw === 'object'
		? (raw.color || raw.fill?.color || raw.gradientStops?.[0]?.color)
		: raw
	const normalized = String(candidate || '').replace(/^#/, '').toUpperCase()
	return /^[0-9A-F]{6}$/.test(normalized) ? normalized : (dark ? '172033' : 'FFFFFF')
}
export function themeColorSchemeForSpec(spec = {}) {
	const p = palette(spec || {})
	const dark = deckIsDark(spec || {}, {})
	const panel = resolvedPanelColor(artDirectionFor(spec), p, dark)
	const accent = ensureAccentOnCanvas(p.accent, panel).accent
	const success = ensureAccentOnCanvas(p.success, panel).accent
	const warn = ensureAccentOnCanvas(p.warn, panel).accent
	const norm = hex => String(hex || '').replace(/^#/, '').toUpperCase()
	const generated = {
		accent1: norm(accent),
		accent2: norm(success),
		accent3: norm(warn),
		accent4: norm(lightenHex(accent, 0.18)),
		accent5: norm(lightenHex(success, 0.18)),
		accent6: norm(darkenHex(accent, 0.18)),
	}
	const authored = spec?.theme?.colorScheme && typeof spec.theme.colorScheme === 'object' ? spec.theme.colorScheme : {}
	const slots = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']
	for (const slot of slots) {
		const value = authored[slot]
		if (value == null) continue
		const normalized = norm(value)
		if (/^[0-9A-F]{6}$/.test(normalized)) generated[slot] = normalized
	}
	return generated
}

// Chromatic typography is an AI design decision, not an engine decoration.
// Expose a small set of theme-synchronised, contrast-qualified text roles so a
// cold AI can deliberately use colour for hierarchy without hard-coding a new
// palette on every object. The engine only resolves the role the AI selected;
// explicit style.color remains fully authoritative.
const TEXT_COLOR_ROLE_ALIASES = Object.freeze({
	primary: 'primary', ink: 'primary', foreground: 'primary',
	secondary: 'secondary', muted: 'secondary', supporting: 'secondary',
	accent: 'accent', brand: 'accent', emphasis: 'accent',
	'display-accent': 'displayAccent', displayaccent: 'displayAccent', hero: 'displayAccent',
	proof: 'proof', positive: 'proof', success: 'proof',
	caution: 'caution', warning: 'caution', warn: 'caution',
	'on-accent': 'onAccent', onaccent: 'onAccent',
	'on-proof': 'onProof', onproof: 'onProof',
	'on-caution': 'onCaution', oncaution: 'onCaution',
	'on-dark': 'onDark', ondark: 'onDark', lightink: 'onDark',
	'on-light': 'onLight', onlight: 'onLight', darkink: 'onLight',
})

function normalizedHexColor(value, fallback = '0B1220') {
	const normalized = String(value || '').replace(/^#/, '').toUpperCase()
	return /^[0-9A-F]{6}$/.test(normalized) ? normalized : fallback
}

function minimumContrastAcross(color, surfaces) {
	return Math.min(...surfaces.map(surface => contrastRatio(color, surface)))
}

// Find the nearest lighter/darker shade of the authored hue that clears every
// ordinary text surface. Only fall back to a neutral extreme when a palette has
// genuinely incompatible light and dark surfaces.
function contrastQualifiedHue(color, surfaces, floor) {
	const source = normalizedHexColor(color)
	const backgrounds = [...new Set((surfaces || []).map(value => normalizedHexColor(value, 'FFFFFF')))]
	if (!backgrounds.length || minimumContrastAcross(source, backgrounds) >= floor) return source
	let best = source
	let bestRatio = minimumContrastAcross(source, backgrounds)
	for (let step = 1; step <= 12; step += 1) {
		const amount = Math.min(0.96, step * 0.08)
		for (const candidate of [darkenHex(source, amount), lightenHex(source, amount)]) {
			const ratio = minimumContrastAcross(candidate, backgrounds)
			if (ratio > bestRatio) {
				best = candidate
				bestRatio = ratio
			}
			if (ratio >= floor) return candidate
		}
	}
	for (const candidate of ['0B1220', 'F8FAFC']) {
		const ratio = minimumContrastAcross(candidate, backgrounds)
		if (ratio > bestRatio) {
			best = candidate
			bestRatio = ratio
		}
	}
	return best
}

function onFillInk(fill, authoredInk) {
	const surface = normalizedHexColor(fill, 'FFFFFF')
	const candidates = [normalizedHexColor(authoredInk), '0B1220', 'F8FAFC']
	return candidates.sort((left, right) => contrastRatio(right, surface) - contrastRatio(left, surface))[0]
}

export function textColorRolesForSpec(spec = {}) {
	const p = palette(spec || {})
	const dark = deckIsDark(spec || {}, {})
	const panel = resolvedPanelColor(artDirectionFor(spec), p, dark)
	const ordinarySurfaces = [...new Set([normalizedHexColor(p.bg, dark ? '0B1120' : 'F8FAFC'), normalizedHexColor(panel, dark ? '172033' : 'FFFFFF')])]
	const secondarySeed = dark ? darkenHex(p.ink, 0.24) : lightenHex(p.ink, 0.28)
	const lightInk = [normalizedHexColor(p.bg, 'F8FAFC'), normalizedHexColor(p.ink), 'F8FAFC']
		.sort((left, right) => contrastRatio(right, '0B1220') - contrastRatio(left, '0B1220'))[0]
	const darkInk = [normalizedHexColor(p.ink), normalizedHexColor(p.bg, 'F8FAFC'), '0B1220']
		.sort((left, right) => contrastRatio(right, 'F8FAFC') - contrastRatio(left, 'F8FAFC'))[0]
	const role = (color, use, minimumContrast = 4.5, minimumTextSizePt = 16, renderedReviewRequired = false) => ({ color, use, minimumContrast, minimumTextSizePt, ...(renderedReviewRequired ? { renderedReviewRequired: true } : {}) })
	return {
		contractVersion: 'authoring-excellence.typographic-color.v1',
		decisionAuthority: 'AI',
		engineRole: 'resolve-selected-role-and-execute',
		authoringSyntax: 'content[].style.textColorRole (or content[].options.textColorRole); explicit style.color wins',
		surfaces: ordinarySurfaces,
		roles: {
			primary: role(contrastQualifiedHue(p.ink, ordinarySurfaces, 4.5), 'titles and principal reading copy'),
			secondary: role(contrastQualifiedHue(secondarySeed, ordinarySurfaces, 4.5), 'supporting copy, annotations, and quieter hierarchy'),
			accent: role(contrastQualifiedHue(p.accent, ordinarySurfaces, 4.5), 'short brand emphasis, key phrases, and decision labels'),
			displayAccent: role(contrastQualifiedHue(p.accent, ordinarySurfaces, 3), 'large or bold expressive display type only', 3, 24),
			proof: role(contrastQualifiedHue(p.success, ordinarySurfaces, 4.5), 'verified positive evidence and achieved states'),
			caution: role(contrastQualifiedHue(p.warn, ordinarySurfaces, 4.5), 'risk, threshold, and caution language'),
			onAccent: role(onFillInk(p.accent, p.ink), 'text placed on the primary accent fill'),
			onProof: role(onFillInk(p.success, p.ink), 'text placed on the proof/success fill'),
			onCaution: role(onFillInk(p.warn, p.ink), 'text placed on the caution fill'),
			onDark: role(lightInk, 'light ink on a dark, shaded, image-backed, or heavily lit surface', 4.5, 16, true),
			onLight: role(darkInk, 'dark ink on a light or luminous surface', 4.5, 16, true),
		},
		rule: 'The AI chooses colour by rhetorical role and may still supply an exact RGB value. For mixed-fill native composites such as SmartArt, select nodes[].textColorRole (or nodes[].color) independently and confirm every node in the rendered slide; gallery lighting can change perceived contrast. Use chromatic text selectively for hierarchy and meaning; monochrome typography remains valid when intentionally chosen.',
	}
}

// Classify a font face into a family so data-viz can echo the world's typographic
// character (mono → technical, serif → editorial/luxe, else sans).
function classifyFontFamily(face) {
	const f = String(face || '').toLowerCase()
	if (/consol|\bmono\b|courier|menlo|cascad|fira\s*code|jetbrains|ibm\s*plex\s*mono|source\s*code/.test(f)) return 'mono'
	if (/georgia|times|garamond|cambria|playfair|merriweather|caslon|didot|baskerville|minion|\bserif\b/.test(f)) return 'serif'
	return 'sans'
}

// Data-language mapping is part of the public Director grammar.  Keep the map
// next to the axis-derived resolver so capability readback and compilation can
// never drift into separate per-world switches.
export const DATA_STYLE_CARD_RULES = Object.freeze({
	outline: Object.freeze({ grid: 'grid', tableStyle: 'grid' }),
	bare: Object.freeze({ grid: 'none', tableStyle: 'rule' }),
	solid: Object.freeze({ grid: 'none', tableStyle: 'bold-flat' }),
	thin: Object.freeze({ grid: 'horizontal', tableStyle: 'rule' }),
	craft: Object.freeze({ grid: 'none', tableStyle: 'rule' }),
	panel: Object.freeze({ grid: 'horizontal', tableStyle: 'grid' }),
	frame: Object.freeze({ grid: 'horizontal', tableStyle: 'fill' }),
	rounded: Object.freeze({ grid: 'horizontal', tableStyle: 'fill' }),
	poster: Object.freeze({ grid: 'none', tableStyle: 'bold-flat' }),
	scrap: Object.freeze({ grid: 'none', tableStyle: 'fill' }),
	plot: Object.freeze({ grid: 'grid', tableStyle: 'grid' }),
	page: Object.freeze({ grid: 'none', tableStyle: 'fill' }),
	candy: Object.freeze({ grid: 'horizontal', tableStyle: 'fill' }),
	bleed: Object.freeze({ grid: 'none', tableStyle: 'rule' }),
	quiet: Object.freeze({ grid: 'none', tableStyle: 'rule' }),
	leaf: Object.freeze({ grid: 'none', tableStyle: 'fill' }),
})

// Derive the data-viz LANGUAGE (chart gridlines, table treatment, label font) from
// a world's AXES — its surface/card language + type pairing — NOT from a per-world
// switch. This is the generalizing move: a bespoke, AI-composed world that sets
// `card:'outline'` + a mono heading automatically gets a blueprint-style grid; an
// editorial-style `card:'bare'` + serif heading gets typographic rules. Works for
// the 6 named worlds AND any world the AI invents (the teamwork "freedom within a
// grammar" principle). Returns safe clean defaults when axes are absent.
//   grid:       'grid' | 'horizontal' | 'none'   (chart gridlines)
//   tableStyle: 'grid' | 'rule' | 'bold-flat' | 'fill'
//   font:       axis/table label font face (null → caller's theme font)
export function dataLanguageForAxes(axes = {}) {
	const { card, headFontFace, bodyFontFace } = axes
	const fam = classifyFontFamily(headFontFace)
	// serif/mono worlds carry their character into the data labels; sans worlds use
	// the (more legible at small sizes) body font.
	const font = fam === 'sans' ? (bodyFontFace || headFontFace || null) : (headFontFace || bodyFontFace || null)
	const rule = DATA_STYLE_CARD_RULES[String(card || '').toLowerCase()] || { grid: 'horizontal', tableStyle: 'fill' }
	const { grid, tableStyle } = rule
	return { font, grid, tableStyle, fontFamily: fam }
}

// Resolve the data-viz language for a spec. Prefers a named art-direction's axes,
// else derives from whatever theme axes are present (so presets / bespoke worlds /
// plain decks all flow through the SAME derivation). Honors an explicit author
// override at theme.dataStyle / styleIntent.dataStyle.
export function artDataStyleForSpec(spec = {}) {
	const art = artDirectionFor(spec)
	const override = art?.dataStyle || spec?.theme?.dataStyle || spec?.styleIntent?.dataStyle
	const base = art
		? dataLanguageForAxes({ card: art.card, headFontFace: art.headFontFace, bodyFontFace: art.bodyFontFace })
		: dataLanguageForAxes({
			card: spec?.theme?.card || spec?.styleIntent?.card,
			headFontFace: spec?.theme?.headFontFace || spec?.theme?.displayFontFace,
			bodyFontFace: spec?.theme?.bodyFontFace || spec?.theme?.fontFace,
		})
	const surface = artTableSurfaceForSpec(spec)
	const resolved = surface ? { ...base, ...surface } : base
	return (override && typeof override === 'object') ? { ...resolved, ...override } : resolved
}

// Resolve the flat data surface from the same World panel/canvas contract used
// by cards and readability checks.  Tables are native PowerPoint objects, so
// their body fill must stay solid even when the World canvas is a gradient;
// using a generic dark navy here silently breaks warm Worlds such as Luxe and
// makes bespoke Worlds lose their authored surface character.
export function artTableSurfaceForSpec(spec = {}) {
	const art = artDirectionFor(spec)
	if (!art) return null
	const dark = specIsDark(spec)
	const resolvedPalette = palette(spec)
	const rawPanel = typeof art.panel === 'function'
		? art.panel(resolvedPalette, dark)
		: art.panel
	const panel = typeof rawPanel === 'object' && rawPanel
		? rawPanel.color || rawPanel.fill?.color
		: rawPanel
	const fill = /^[0-9A-Fa-f]{6}$/.test(String(panel || ''))
		? String(panel).toUpperCase()
		: (dark ? '0E1A30' : 'FFFFFF')
	// Keep borders in the World family while preserving enough separation from
	// the body fill.  Accent-derived rules suit Luxe/editorial and technical
	// grids; the luminance nudge is deterministic and remains author-overridable.
	const accentCheck = ensureAccentOnCanvas(resolvedPalette.accent, fill, 1.35)
	const accent = accentCheck.accent
	const neutralBorder = dark ? lightenHex(fill, 0.16) : darkenHex(fill, 0.14)
	const card = String(art.card || '').toLowerCase()
	const tableBorder = ['solid', 'poster'].includes(card) ? accent : neutralBorder
	const ruleColor = ['thin', 'craft', 'bare', 'quiet'].includes(card) ? accent : neutralBorder
	return { tableFill: fill, tableBorder, tableRule: ruleColor }
}

// Derive per-world COMPOSITION rhythm (M15) from the same axes: corner geometry,
// heading/cover alignment, and page margin. Like the data language, this is a pure
// function of the surface axis so it generalizes to bespoke worlds. Editorial/
// technical/poster worlds read LEFT with their own margin rhythm; the elegant
// (thin) world centers with generous margins; glass/soft keep the balanced default.
//   corner:    'sharp' | 'round'
//   titleAlign/coverAlign: 'left' | 'center'
//   margin:    page margin in inches
export function compositionForAxes(axes = {}) {
	const card = String(axes.card || '').toLowerCase()
	switch (card) {
		case 'bare':    return { corner: 'sharp', titleAlign: 'left',   coverAlign: 'left',   margin: 0.86 } // editorial: generous magazine margin
		case 'outline': return { corner: 'sharp', titleAlign: 'left',   coverAlign: 'left',   margin: 0.50 } // blueprint: tight technical grid
		case 'solid':   return { corner: 'sharp', titleAlign: 'left',   coverAlign: 'left',   margin: 0.54 } // brutalist: heavy left poster
		case 'thin':    return { corner: 'round', titleAlign: 'center', coverAlign: 'center', margin: 0.92 } // luxe: centered, generous space
		case 'soft':    return { corner: 'round', titleAlign: 'left',   coverAlign: 'center', margin: 0.64 } // mist: airy
		case 'glass':   return { corner: 'round', titleAlign: 'left',   coverAlign: 'center', margin: 0.58 } // aurora: balanced default
		case 'craft':   return { corner: 'round', titleAlign: 'left',   coverAlign: 'left',   margin: 0.78 } // atelier: generous craft margin
		case 'panel':   return { corner: 'sharp', titleAlign: 'left',   coverAlign: 'left',   margin: 0.62 } // meridian: disciplined corporate
		case 'frame':   return { corner: 'sharp', titleAlign: 'left',   coverAlign: 'left',   margin: 0.55 } // chalkline: content-forward lesson
		case 'rounded': return { corner: 'round', titleAlign: 'left',   coverAlign: 'center', margin: 0.60 } // playbook: friendly balance
		case 'poster':  return { corner: 'sharp', titleAlign: 'center', coverAlign: 'center', margin: 0.42 } // pulse: edge-to-edge poster energy
		case 'scrap':   return { corner: 'round', titleAlign: 'left',   coverAlign: 'center', margin: 0.66 } // collage: relaxed scrapbook
		case 'plot':    return { corner: 'sharp', titleAlign: 'left',   coverAlign: 'left',   margin: 0.52 } // observatory: data-dense analytic
		case 'page':    return { corner: 'round', titleAlign: 'left',   coverAlign: 'center', margin: 0.70 } // storybook: generous page air
		case 'candy':   return { corner: 'round', titleAlign: 'left',   coverAlign: 'center', margin: 0.55 } // candy: balanced pop
		case 'bleed':   return { corner: 'sharp', titleAlign: 'left',   coverAlign: 'left',   margin: 0.46 } // horizon: edge-to-edge photographic
		case 'quiet':   return { corner: 'round', titleAlign: 'center', coverAlign: 'center', margin: 1.00 } // mono: vast centered whitespace
		case 'leaf':    return { corner: 'round', titleAlign: 'left',   coverAlign: 'center', margin: 0.80 } // botanical: airy garden margins
		default:        return { corner: 'round', titleAlign: 'left',   coverAlign: 'center', margin: 0.58 }
	}
}
export function artCompositionForSpec(spec = {}) {
	const art = artDirectionFor(spec)
	const base = compositionForAxes({ card: art ? art.card : (spec?.theme?.card || spec?.styleIntent?.card) })
	const override = art?.composition || spec?.theme?.composition
	return (override && typeof override === 'object') ? { ...base, ...override } : base
}

// M19 — the world in TIME. Derive a MOTION temperament from the surface axis: the
// deck-wide transition feel + the build/emphasis character. Pure function → applies
// to bespoke worlds too. RESTRAINT is part of it: editorial/brutalist barely move;
// luxe/aurora morph slowly; blueprint is mechanical. The transition is applied as a
// per-world DEFAULT (fill-only, so a per-slide override like a hero Morph wins); the
// build/emphasis are SURFACED as the world's character, never force-animated (the
// anti-"feature-coverage" rule — motion must serve attention, not prove a feature).
//   transition: a PowerPoint transition object (or null = instant cut)
//   build:      'none' | 'fade' | 'wipe'   (recommended entrance character)
//   emphasis:   'none' | 'gentle' | 'precise' | 'hard' | 'clean'
export function motionForAxes(axes = {}) {
	// `model3d` = the per-world DYNAMIC for a 3D model — its native PowerPoint 3D
	// animation (arrive/turntable/swing/jumpAndTurn). 3D is top-premium precisely BECAUSE
	// of dynamics, so a 3D model adopts the world's motion temperament: luxe slow-turntable,
	// brutalist jump-and-turn snap, blueprint precise rotate, editorial quiet arrive, etc.
	switch (String(axes.card || '').toLowerCase()) {
		case 'solid':   return { transition: { type: 'none' },                         build: 'none', emphasis: 'hard',    model3d: { effect: 'jumpAndTurn', type: 'emphasis', durationMs: 1500 } } // brutalist: snap/impact
		case 'bare':    return { transition: { type: 'fade', durationMs: 400 },        build: 'none', emphasis: 'none',    model3d: { effect: 'arrive', type: 'entrance', durationMs: 1000 } }    // editorial: quiet reveal
		case 'outline': return { transition: { type: 'push', direction: 'left' },      build: 'wipe', emphasis: 'precise', model3d: { effect: 'turntable', type: 'emphasis', durationMs: 2200 } }  // blueprint: precise rotate
		case 'thin':    return { transition: { type: 'morph', option: 'byObject', durationMs: 900 }, build: 'fade', emphasis: 'gentle', model3d: { effect: 'turntable', type: 'emphasis', durationMs: 3000 } } // luxe: slow elegant rotation
		case 'soft':    return { transition: { type: 'fade', durationMs: 600 },        build: 'fade', emphasis: 'gentle',  model3d: { effect: 'swing', type: 'emphasis', durationMs: 2400 } }     // mist: gentle swing
		case 'glass':   return { transition: { type: 'morph', option: 'byObject', durationMs: 600 }, build: 'fade', emphasis: 'clean', model3d: { effect: 'arrive', type: 'entrance', durationMs: 1000 } } // aurora: clean arrive
		case 'craft':   return { transition: { type: 'fade', durationMs: 550 },        build: 'fade', emphasis: 'gentle',  model3d: { effect: 'arrive', type: 'entrance', durationMs: 1200 } }    // atelier: warm quiet reveal
		case 'panel':   return { transition: { type: 'fade', durationMs: 450 },        build: 'wipe', emphasis: 'clean',   model3d: { effect: 'arrive', type: 'entrance', durationMs: 900 } }     // meridian: restrained corporate
		case 'frame':   return { transition: { type: 'fade', durationMs: 380 },        build: 'rise', emphasis: 'precise', model3d: { effect: 'turntable', type: 'emphasis', durationMs: 2000 } }  // chalkline: brisk instructional steps
		case 'rounded': return { transition: { type: 'fade', durationMs: 450 },        build: 'rise', emphasis: 'gentle',  model3d: { effect: 'swing', type: 'emphasis', durationMs: 2000 } }     // playbook: friendly lift
		case 'poster':  return { transition: { type: 'morph', option: 'byObject', durationMs: 400 }, build: 'rise', emphasis: 'hard', model3d: { effect: 'jumpAndTurn', type: 'emphasis', durationMs: 1200 } } // pulse: beat-tight kinetic
		case 'scrap':   return { transition: { type: 'fade', durationMs: 500 },        build: 'rise', emphasis: 'gentle',  model3d: { effect: 'swing', type: 'emphasis', durationMs: 2400 } }     // collage: playful drop-in
		case 'plot':    return { transition: { type: 'fade', durationMs: 450 },        build: 'wipe', emphasis: 'precise', model3d: { effect: 'turntable', type: 'emphasis', durationMs: 2600 } }  // observatory: deliberate analytic
		case 'page':    return { transition: { type: 'fade', durationMs: 600 },        build: 'rise', emphasis: 'gentle',  model3d: { effect: 'swing', type: 'emphasis', durationMs: 2600 } }     // storybook: bouncy but unhurried
		case 'candy':   return { transition: { type: 'morph', option: 'byObject', durationMs: 500 }, build: 'rise', emphasis: 'clean', model3d: { effect: 'arrive', type: 'entrance', durationMs: 900 } } // candy: fluid pop
		case 'bleed':   return { transition: { type: 'fade', durationMs: 700 },        build: 'fade', emphasis: 'gentle',  model3d: { effect: 'arrive', type: 'entrance', durationMs: 1200 } }   // horizon: slow photo crossfade
		case 'quiet':   return { transition: { type: 'fade', durationMs: 500 },        build: 'fade', emphasis: 'gentle',  model3d: { effect: 'arrive', type: 'entrance', durationMs: 1100 } }   // mono: near-still gallery
		case 'leaf':    return { transition: { type: 'fade', durationMs: 650 },        build: 'fade', emphasis: 'gentle',  model3d: { effect: 'swing', type: 'emphasis', durationMs: 2800 } }    // botanical: organic sway
		default:        return { transition: { type: 'fade', durationMs: 500 },        build: 'fade', emphasis: 'clean',   model3d: { effect: 'arrive', type: 'entrance', durationMs: 1000 } }
	}
}
export function artMotionForSpec(spec = {}) {
	const art = artDirectionFor(spec)
	const override = art?.motion || spec?.motion?.temperament || spec?.styleIntent?.motion
	const base = motionForAxes({ card: art ? art.card : (spec?.theme?.card || spec?.styleIntent?.card) })
	const resolved = (override && typeof override === 'object') ? { ...base, ...override } : base
	const effectivePolicy = String(spec?._motionPolicyApplied?.policy || spec?.motionPolicy || spec?.motion?.policy || '').trim().toLowerCase()
	// A static compilation may retain the World's harmless slide transition, but it
	// must never reintroduce a default 3-D playback effect after applyMotionPolicy
	// has stripped authored motion from the expanded semantic spec.
	return effectivePolicy === 'static' ? { ...resolved, model3d: null } : resolved
}

// The world's 3D STAGING temperament — how each world FRAMES and LIGHTS a 3D model. Framing
// (camera lens + pose) and lighting are core premium levers: the SAME model reads as a warm
// cinematic hero in luxe, a cool technical schematic in blueprint, a hard-lit statement in
// brutalist. Applied only when the author set no camera/trans/lights of their own (author
// always wins). `fov` = lens (low = telephoto/flatter/elegant; high = wide/dramatic); `rot` =
// pose in deg (x=pitch, y=yaw, z=roll — roll stays 0). `ambient` = fill light colour+level;
// `key` = the point/key light colour+intensity (warm gold vs cool cyan vs hard white).
export function stageForAxes(axes = {}) {
	switch (String(axes.card || '').toLowerCase()) {
		// luxe: cinematic telephoto hero-tilt, WARM GOLD key light
		case 'thin':    return { camera: { pos: { x: 0, y: 0, z: 96000000 }, fov: 22 }, rot: { x: 15, y: -26, z: 0 }, ambient: { color: { r: 255, g: 242, b: 220 }, illuminance: 0.60 }, key: { color: { r: 255, g: 222, b: 168 }, intensity: 9 } }
		// editorial: calm eye-level, NEUTRAL DAYLIGHT
		case 'bare':    return { camera: { pos: { x: 0, y: 0, z: 90000000 }, fov: 27 }, rot: { x: 8,  y: -14, z: 0 }, ambient: { color: { r: 236, g: 239, b: 243 }, illuminance: 0.70 }, key: { color: { r: 255, g: 252, b: 246 }, intensity: 8 } }
		// blueprint: restrained technical 3/4, COOL CYAN. Keep the angle schematic
		// rather than cinematic, but give native models two meaningful axes so the
		// exported poster does not read as a flat/front-on cutout.
		case 'outline': return { camera: { pos: { x: 0, y: 0, z: 115000000 }, fov: 24 }, rot: { x: 11, y: -24, z: 0 }, ambient: { color: { r: 198, g: 222, b: 255 }, illuminance: 0.64 }, key: { color: { r: 150, g: 220, b: 255 }, intensity: 9 } }
		// brutalist: wide imposing, HARD BRIGHT WHITE (punchy shadows)
		case 'solid':   return { camera: { pos: { x: 0, y: 0, z: 82000000 }, fov: 35 }, rot: { x: 16, y: -32, z: 0 }, ambient: { color: { r: 228, g: 228, b: 230 }, illuminance: 0.52 }, key: { color: { r: 255, g: 255, b: 255 }, intensity: 11 } }
		// mist: gentle soft angle, SOFT COOL-NEUTRAL
		case 'soft':    return { camera: { pos: { x: 0, y: 0, z: 91000000 }, fov: 26 }, rot: { x: 10, y: -17, z: 0 }, ambient: { color: { r: 224, g: 228, b: 236 }, illuminance: 0.66 }, key: { color: { r: 238, g: 244, b: 255 }, intensity: 8 } }
		// aurora: clean floating 3/4, COOL TEAL
		case 'glass':   return { camera: { pos: { x: 0, y: 0, z: 90000000 }, fov: 28 }, rot: { x: 12, y: -22, z: 0 }, ambient: { color: { r: 180, g: 212, b: 255 }, illuminance: 0.66 }, key: { color: { r: 130, g: 235, b: 255 }, intensity: 9 } }
		// atelier: calm eye-level, WARM CRAFT DAYLIGHT
		case 'craft':   return { camera: { pos: { x: 0, y: 0, z: 91000000 }, fov: 26 }, rot: { x: 9,  y: -16, z: 0 }, ambient: { color: { r: 246, g: 236, b: 218 }, illuminance: 0.68 }, key: { color: { r: 255, g: 226, b: 186 }, intensity: 8 } }
		// meridian: composed boardroom angle, NEUTRAL COOL
		case 'panel':   return { camera: { pos: { x: 0, y: 0, z: 93000000 }, fov: 24 }, rot: { x: 8,  y: -15, z: 0 }, ambient: { color: { r: 226, g: 234, b: 244 }, illuminance: 0.68 }, key: { color: { r: 214, g: 232, b: 255 }, intensity: 8 } }
		// chalkline: flat instructional, CLEAN NEUTRAL (schematic-lite)
		case 'frame':   return { camera: { pos: { x: 0, y: 0, z: 95000000 }, fov: 22 }, rot: { x: 6,  y: -12, z: 0 }, ambient: { color: { r: 238, g: 242, b: 248 }, illuminance: 0.70 }, key: { color: { r: 255, g: 251, b: 240 }, intensity: 8 } }
		// playbook: friendly 3/4 lift, BRIGHT SOFT
		case 'rounded': return { camera: { pos: { x: 0, y: 0, z: 88000000 }, fov: 30 }, rot: { x: 12, y: -20, z: 0 }, ambient: { color: { r: 236, g: 238, b: 246 }, illuminance: 0.70 }, key: { color: { r: 226, g: 214, b: 255 }, intensity: 9 } }
		// pulse: wide punchy hero, HOT HIGH-CONTRAST
		case 'poster':  return { camera: { pos: { x: 0, y: 0, z: 80000000 }, fov: 37 }, rot: { x: 17, y: -34, z: 0 }, ambient: { color: { r: 220, g: 214, b: 222 }, illuminance: 0.50 }, key: { color: { r: 255, g: 120, b: 150 }, intensity: 11 } }
		// observatory: near-orthographic analytic, COLD STARLIGHT
		case 'plot':    return { camera: { pos: { x: 0, y: 0, z: 97000000 }, fov: 21 }, rot: { x: 7,  y: -13, z: 0 }, ambient: { color: { r: 196, g: 214, b: 236 }, illuminance: 0.62 }, key: { color: { r: 168, g: 226, b: 255 }, intensity: 9 } }
		// storybook: gentle friendly tilt, WARM SUNSHINE
		case 'page':    return { camera: { pos: { x: 0, y: 0, z: 88000000 }, fov: 31 }, rot: { x: 13, y: -21, z: 0 }, ambient: { color: { r: 252, g: 243, b: 224 }, illuminance: 0.72 }, key: { color: { r: 255, g: 224, b: 160 }, intensity: 9 } }
		// candy: glossy 3/4 pop, PINK-VIOLET SHEEN
		case 'candy':   return { camera: { pos: { x: 0, y: 0, z: 87000000 }, fov: 31 }, rot: { x: 14, y: -24, z: 0 }, ambient: { color: { r: 240, g: 226, b: 244 }, illuminance: 0.66 }, key: { color: { r: 244, g: 170, b: 220 }, intensity: 10 } }
		// collage: casual warm tilt, SOFT AFTERNOON
		case 'scrap':   return { camera: { pos: { x: 0, y: 0, z: 89000000 }, fov: 29 }, rot: { x: 13, y: -24, z: 0 }, ambient: { color: { r: 248, g: 240, b: 226 }, illuminance: 0.66 }, key: { color: { r: 255, g: 214, b: 224 }, intensity: 8 } }
		// horizon: wide scenic vista, GOLDEN-HOUR WARMTH
		case 'bleed':   return { camera: { pos: { x: 0, y: 0, z: 84000000 }, fov: 33 }, rot: { x: 11, y: -19, z: 0 }, ambient: { color: { r: 244, g: 232, b: 210 }, illuminance: 0.60 }, key: { color: { r: 255, g: 196, b: 128 }, intensity: 10 } }
		// mono: flat telephoto gallery, NEUTRAL WHITE
		case 'quiet':   return { camera: { pos: { x: 0, y: 0, z: 97000000 }, fov: 21 }, rot: { x: 6,  y: -10, z: 0 }, ambient: { color: { r: 242, g: 242, b: 244 }, illuminance: 0.72 }, key: { color: { r: 255, g: 255, b: 255 }, intensity: 8 } }
		// botanical: gentle tilt, LEAF-FILTERED DAYLIGHT
		case 'leaf':    return { camera: { pos: { x: 0, y: 0, z: 90000000 }, fov: 27 }, rot: { x: 10, y: -18, z: 0 }, ambient: { color: { r: 232, g: 240, b: 222 }, illuminance: 0.70 }, key: { color: { r: 214, g: 244, b: 186 }, intensity: 8 } }
		default:        return { camera: { pos: { x: 0, y: 0, z: 90000000 }, fov: 28 }, rot: { x: 12, y: -20, z: 0 }, ambient: { color: { r: 180, g: 212, b: 255 }, illuminance: 0.66 }, key: { color: { r: 130, g: 235, b: 255 }, intensity: 9 } }
	}
}
export function artStageForSpec(spec = {}) {
	const art = artDirectionFor(spec)
	const override = art?.stage || art?.stage3d || spec?.stage3d || spec?.styleIntent?.stage3d
	const base = stageForAxes({ card: art ? art.card : (spec?.theme?.card || spec?.styleIntent?.card) })
	return (override && typeof override === 'object') ? { ...base, ...override } : base
}

// The world's ICON temperament — the DEFAULT look for a kind:'icon' when the author didn't
// pick a style. Matches world character: luxe = elegant accent CHIP (rounded gold tile),
// aurora = soft glass chip, brutalist = HARD chip (sharp corners = a bold block); editorial,
// blueprint and mist = PLAIN accent glyph on the canvas (restraint — line/ink iconography).
// Author iconStyle/color/chipColor/cornerRadius always win.
export function iconForAxes(axes = {}) {
	switch (String(axes.card || '').toLowerCase()) {
		case 'thin':    return { style: 'chip', cornerRadius: 0.16 } // luxe: elegant rounded chip
		case 'glass':   return { style: 'chip', cornerRadius: 0.22 } // aurora: soft glass chip
		case 'solid':   return { style: 'chip', cornerRadius: 0.0 }  // brutalist: hard square block
		case 'bare':    return { style: 'plain', cornerRadius: 0 }   // editorial: plain ink glyph
		case 'outline': return { style: 'plain', cornerRadius: 0 }   // blueprint: technical line glyph
		case 'soft':    return { style: 'plain', cornerRadius: 0 }   // mist: understated plain glyph
		case 'craft':   return { style: 'plain', cornerRadius: 0 }   // atelier: ink glyph (print restraint)
		case 'panel':   return { style: 'plain', cornerRadius: 0 }   // meridian: corporate restraint
		case 'frame':   return { style: 'chip', cornerRadius: 0.10 } // chalkline: step-badge chip
		case 'rounded': return { style: 'chip', cornerRadius: 0.30 } // playbook: friendly round chip
		case 'poster':  return { style: 'chip', cornerRadius: 0.0 }  // pulse: hard block chip
		case 'scrap':   return { style: 'chip', cornerRadius: 0.50 } // collage: sticker chip
		case 'plot':    return { style: 'plain', cornerRadius: 0 }   // observatory: precise line glyph
		case 'page':    return { style: 'chip', cornerRadius: 0.45 } // storybook: friendly round badge
		case 'candy':   return { style: 'chip', cornerRadius: 0.35 } // candy: glossy chip
		case 'bleed':   return { style: 'plain', cornerRadius: 0 }   // horizon: restraint over photography
		case 'quiet':   return { style: 'plain', cornerRadius: 0 }   // mono: ink glyph only
		case 'leaf':    return { style: 'chip', cornerRadius: 0.50 } // botanical: soft pebble chip
		default:        return { style: 'plain', cornerRadius: 0 }
	}
}
export function artIconForSpec(spec = {}) {
	const art = artDirectionFor(spec)
	const override = art?.icon || spec?.icon?.temperament || spec?.styleIntent?.icon
	const base = iconForAxes({ card: art ? art.card : (spec?.theme?.card || spec?.styleIntent?.card) })
	return (override && typeof override === 'object') ? { ...base, ...override } : base
}

// The world's PRESENTER persona — the STYLE a 3D-avatar presenter takes IN THIS WORLD (persona name +
// choreography boldness + which stage edge it lives on). This is a DEFAULT that only takes effect when
// the author activates a presenter (spec.presenter with a rigged-avatar model); the world never forces
// one. The author supplies the MODEL + its semantic clipMap (beat -> glTF animId); the world supplies the
// performance temperament. Matches world character: luxe = measured keynote-host, brutalist = commanding,
// editorial = restrained narrator, pulse = high-energy. Author spec.presenter overrides any field.
export function presenterForAxes(axes = {}) {
	switch (String(axes.card || '').toLowerCase()) {
		case 'thin':    return { persona: 'keynote-host', choreography: 'keynote', stage: 'left' }   // luxe
		case 'glass':   return { persona: 'product-host', choreography: 'keynote', stage: 'right' }  // aurora
		case 'solid':   return { persona: 'commander', choreography: 'energetic', stage: 'center' }  // brutalist
		case 'bare':    return { persona: 'narrator', choreography: 'subtle', stage: 'left' }         // editorial
		case 'outline': return { persona: 'analyst', choreography: 'subtle', stage: 'right' }         // blueprint
		case 'soft':    return { persona: 'guide', choreography: 'subtle', stage: 'left' }            // mist
		case 'poster':  return { persona: 'hype', choreography: 'energetic', stage: 'center' }        // pulse
		case 'rounded': return { persona: 'coach', choreography: 'keynote', stage: 'left' }           // playbook
		case 'page':    return { persona: 'storyteller', choreography: 'keynote', stage: 'left' }     // storybook
		default:        return { persona: 'host', choreography: 'keynote', stage: 'left' }
	}
}
export function artPresenterForSpec(spec = {}) {
	const art = artDirectionFor(spec)
	const override = art?.presenter || spec?.styleIntent?.presenter
	const base = presenterForAxes({ card: art ? art.card : (spec?.theme?.card || spec?.styleIntent?.card) })
	return (override && typeof override === 'object') ? { ...base, ...override } : base
}

// The world's EMPHASIS temperament resolved to a REAL default effect (+ duration) — so a
// type:"emphasis" with no named effect gets the WORLD's attention beat instead of a stray fade.
// BALANCE: the default is restrained (a tasteful pulse; brutalist gets a harder flash to match
// its character) — NOT a garish blast. The FULL emphasis palette (teeter / growShrink /
// flashOnce / shimmer / spin / colorWave / grow / …) stays open to the author. Draw the eye to
// ONE thing at a time (attention, not coverage). Author effect/duration always win.
export function emphasisForAxes(axes = {}) {
	switch (String(axes.card || '').toLowerCase()) {
		case 'thin':    return { effect: 'pulse', durationMs: 700 } // luxe: slow, elegant pulse
		case 'bare':    return { effect: 'pulse', durationMs: 520 } // editorial: quiet (its real emphasis is type)
		case 'solid':   return { effect: 'boldFlash', durationMs: 320 } // brutalist: a hard flash, matching character
		case 'outline': return { effect: 'pulse', durationMs: 480 } // blueprint: precise, tight
		case 'soft':    return { effect: 'pulse', durationMs: 640 } // mist: gentle
		case 'glass':   return { effect: 'pulse', durationMs: 560 } // aurora: clean
		case 'craft':   return { effect: 'pulse', durationMs: 620 } // atelier: warm, unhurried
		case 'panel':   return { effect: 'pulse', durationMs: 500 } // meridian: composed
		case 'frame':   return { effect: 'pulse', durationMs: 440 } // chalkline: crisp instructional beat
		case 'rounded': return { effect: 'pulse', durationMs: 560 } // playbook: friendly
		case 'poster':  return { effect: 'boldFlash', durationMs: 260 } // pulse: hot flash on the beat
		case 'scrap':   return { effect: 'teeter', durationMs: 500 } // collage: playful wiggle
		case 'plot':    return { effect: 'pulse', durationMs: 500 } // observatory: precise beat
		case 'page':    return { effect: 'teeter', durationMs: 620 } // storybook: gentle wiggle
		case 'candy':   return { effect: 'pulse', durationMs: 480 } // candy: upbeat clean
		case 'bleed':   return { effect: 'pulse', durationMs: 600 } // horizon: unhurried scenic beat
		case 'quiet':   return { effect: 'pulse', durationMs: 540 } // mono: quiet single beat
		case 'leaf':    return { effect: 'pulse', durationMs: 640 } // botanical: calm breath
		default:        return { effect: 'pulse', durationMs: 560 }
	}
}
export function artEmphasisForSpec(spec = {}) {
	const art = artDirectionFor(spec)
	const base = emphasisForAxes({ card: art ? art.card : (spec?.theme?.card || spec?.styleIntent?.card) })
	const override = (art?.emphasis && typeof art.emphasis === 'object') ? art.emphasis : (spec?.styleIntent?.emphasis && typeof spec.styleIntent.emphasis === 'object' ? spec.styleIntent.emphasis : null)
	return override ? { ...base, ...override } : base
}

// EDITION E2 — resolve the COMPLETE world styling for elevating an existing deck: palette (mode
// -resolved), typography, canvas + panel, card language, and the motion/emphasis temperaments.
// One call gives the elevate engine everything it needs to re-skin ANY deck "the world way".
export function worldStylingForElevation(world, mode) {
	const spec = { styleIntent: { artDirection: world, ...(mode ? { mode } : {}) } }
	const art = artDirectionFor(spec)
	if (!art) return null
	const dark = specIsDark(spec)
	const pal = Array.isArray(art.palette) ? art.palette : ['0B1220', '2563EB', '14B8A6', 'F59E0B', 'F8FAFC']
	const [ink, accent, accent2, accent3, bg] = pal
	// E3 — the world's composition alignment (luxe/mist centered; editorial/blueprint/brutalist/
	// aurora left) for a conservative hierarchy re-flow on elevate.
	const alignByCard = { thin: 'center', soft: 'center', glass: 'left', outline: 'left', solid: 'left', bare: 'left', craft: 'left', panel: 'left', frame: 'left', rounded: 'left', poster: 'center', scrap: 'left', plot: 'left', page: 'left', candy: 'left', bleed: 'left', quiet: 'center', leaf: 'left' }
	return {
		world, mode: art.mode, dark,
		palette: { ink, accent, accent2, accent3, bg },
		headFontFace: art.headFontFace, bodyFontFace: art.bodyFontFace,
		titleAlign: alignByCard[art.card] || 'left',
		card: art.card,
		background: typeof art.bg === 'function' ? art.bg({ bg }, dark) : { color: bg },
		panel: typeof art.panel === 'function' ? art.panel({ bg }, dark) : bg,
		motion: artMotionForSpec(spec),
		emphasis: artEmphasisForSpec(spec),
		label: art.label,
	}
}

// M19 — the world's VOICE temperament (applied only when the deck is narrated): pace
// and pause rhythm. lengthScale >1 = slower/more measured; paddingMs = gap padding
// around cues. The voice IDENTITY stays the author's choice (language-bound); the
// world sets HOW it speaks, not WHO. Restraint: small, tasteful deltas.
export function voiceForAxes(axes = {}) {
	switch (String(axes.card || '').toLowerCase()) {
		case 'thin':    return { lengthScale: 1.12, paddingMs: 650 } // luxe: slow, generous pauses
		case 'bare':    return { lengthScale: 1.04, paddingMs: 450 } // editorial: even, calm
		case 'solid':   return { lengthScale: 0.94, paddingMs: 200 } // brutalist: terse, snappy
		case 'outline': return { lengthScale: 1.0,  paddingMs: 250 } // blueprint: precise
		case 'soft':    return { lengthScale: 1.06, paddingMs: 500 } // mist: gentle
		case 'glass':   return { lengthScale: 1.0,  paddingMs: 350 } // aurora: clean
		case 'craft':   return { lengthScale: 1.05, paddingMs: 480 } // atelier: warm, measured
		case 'panel':   return { lengthScale: 1.0,  paddingMs: 320 } // meridian: composed corporate
		case 'frame':   return { lengthScale: 0.98, paddingMs: 420 } // chalkline: brisk teacher, pause between steps
		case 'rounded': return { lengthScale: 1.02, paddingMs: 380 } // playbook: friendly guide
		case 'poster':  return { lengthScale: 0.92, paddingMs: 220 } // pulse: hook-fast delivery
		case 'scrap':   return { lengthScale: 1.02, paddingMs: 400 } // collage: casual storyteller
		case 'plot':    return { lengthScale: 1.0,  paddingMs: 300 } // observatory: precise analyst
		case 'page':    return { lengthScale: 1.10, paddingMs: 560 } // storybook: slow storyteller with pauses
		case 'candy':   return { lengthScale: 0.98, paddingMs: 300 } // candy: upbeat presenter
		case 'bleed':   return { lengthScale: 1.06, paddingMs: 500 } // horizon: travelogue storyteller
		case 'quiet':   return { lengthScale: 1.08, paddingMs: 620 } // mono: measured keynote pauses
		case 'leaf':    return { lengthScale: 1.08, paddingMs: 540 } // botanical: calm breathing pace
		default:        return { lengthScale: 1.0,  paddingMs: 350 }
	}
}
export function artVoiceForSpec(spec = {}) {
	const art = artDirectionFor(spec)
	const override = art?.voice || spec?.narrationVoice?.temperament || spec?.styleIntent?.voice
	const base = voiceForAxes({ card: art ? art.card : (spec?.theme?.card || spec?.styleIntent?.card) })
	return (override && typeof override === 'object') ? { ...base, ...override } : base
}

// The world's BUILD TEMPO — the aesthetic guardrail for the narration-synced build. The
// narration owns WHEN a reveal fires; this owns HOW it moves: a tasteful per-world entrance
// duration (never stretched to chase the audio) and a minimum breathing interval so
// closely-spoken beats never fire on top of each other (chaotic). Luxe = slow + generous
// breathing; brutalist = snappy + tight; the rest sit between. The motion stays beautiful in
// its own right — sync moves its trigger, it never rubber-bands the animation.
export function buildTempoForAxes(axes = {}) {
	switch (String(axes.card || '').toLowerCase()) {
		case 'thin':    return { durationMs: 650, minIntervalMs: 820 } // luxe: slow, generous breathing
		case 'bare':    return { durationMs: 480, minIntervalMs: 640 } // editorial: calm, even
		case 'solid':   return { durationMs: 320, minIntervalMs: 520 } // brutalist: snappy, tight
		case 'outline': return { durationMs: 450, minIntervalMs: 600 } // blueprint: precise
		case 'soft':    return { durationMs: 600, minIntervalMs: 760 } // mist: gentle
		case 'glass':   return { durationMs: 520, minIntervalMs: 700 } // aurora: clean
		case 'craft':   return { durationMs: 560, minIntervalMs: 720 } // atelier: unhurried craft
		case 'panel':   return { durationMs: 460, minIntervalMs: 620 } // meridian: composed
		case 'frame':   return { durationMs: 420, minIntervalMs: 580 } // chalkline: step-by-step clarity
		case 'rounded': return { durationMs: 470, minIntervalMs: 640 } // playbook: friendly rhythm
		case 'poster':  return { durationMs: 300, minIntervalMs: 380 } // pulse: beat-tight kinetic
		case 'scrap':   return { durationMs: 500, minIntervalMs: 660 } // collage: playful but readable
		case 'plot':    return { durationMs: 440, minIntervalMs: 600 } // observatory: deliberate precision
		case 'page':    return { durationMs: 620, minIntervalMs: 800 } // storybook: unhurried page-turns
		case 'candy':   return { durationMs: 420, minIntervalMs: 560 } // candy: upbeat pop
		case 'bleed':   return { durationMs: 560, minIntervalMs: 740 } // horizon: unhurried scenic
		case 'quiet':   return { durationMs: 540, minIntervalMs: 760 } // mono: sparse, deliberate
		case 'leaf':    return { durationMs: 600, minIntervalMs: 780 } // botanical: slow growth
		default:        return { durationMs: 500, minIntervalMs: 680 }
	}
}
export function artBuildTempoForSpec(spec = {}) {
	const art = artDirectionFor(spec)
	const base = buildTempoForAxes({ card: art ? art.card : (spec?.theme?.card || spec?.styleIntent?.card) })
	const override = art?.buildTempo || spec?.styleIntent?.buildTempo || spec?.motion?.buildTempo
	return (override && typeof override === 'object') ? { ...base, ...override } : base
}

// M19b — TYPOGRAPHIC-EMPHASIS temperament: per-world hero-text treatment. This is
// where "maximize the premium surface" and RESTRAINT meet: glassy/elegant worlds
// DO use glow/reflection on the hero line (premium), while editorial/brutalist/
// blueprint use NONE — their emphasis is type weight/family, and the restraint IS
// the premium choice. Applied to HERO/COVER headings only, never body. accent drives
// the glow colour so a bespoke world glows in its own accent.
export function typeEmphasisForAxes(axes = {}, accent = '2DD4BF') {
	switch (String(axes.card || '').toLowerCase()) {
		case 'glass': return { heroGlow: { size: 16, color: accent, opacity: 0.55 }, heroReflection: false } // aurora: accent glow
		case 'thin':  return { heroGlow: null, heroReflection: true }                                        // luxe: elegant reflection
		case 'soft':  return { heroGlow: { size: 10, color: accent, opacity: 0.32 }, heroReflection: false } // mist: faint soft glow
		case 'bare':  return { heroGlow: null, heroReflection: false }                                       // editorial: restraint
		case 'outline': return { heroGlow: null, heroReflection: false }                                     // blueprint: restraint
		case 'solid': return { heroGlow: null, heroReflection: false }                                       // brutalist: restraint
		case 'craft': return { heroGlow: null, heroReflection: false }                                       // atelier: type IS the emphasis
		case 'panel': return { heroGlow: null, heroReflection: false }                                       // meridian: corporate restraint
		case 'frame': return { heroGlow: null, heroReflection: false }                                       // chalkline: clarity over drama
		case 'rounded': return { heroGlow: { size: 8, color: accent, opacity: 0.25 }, heroReflection: false } // playbook: faint friendly glow
		case 'poster': return { heroGlow: { size: 18, color: accent, opacity: 0.60 }, heroReflection: false } // pulse: hot poster glow
		case 'scrap': return { heroGlow: null, heroReflection: false }                                        // collage: handcrafted restraint
		case 'plot': return { heroGlow: null, heroReflection: false }                                         // observatory: data restraint
		case 'page': return { heroGlow: { size: 9, color: accent, opacity: 0.28 }, heroReflection: false }    // storybook: soft sunshine glow
		case 'candy': return { heroGlow: { size: 14, color: accent, opacity: 0.45 }, heroReflection: false }  // candy: glossy pop glow
		case 'bleed': return { heroGlow: null, heroReflection: false }                                        // horizon: the photo is the drama
		case 'quiet': return { heroGlow: null, heroReflection: false }                                        // mono: type weight IS the emphasis
		case 'leaf':  return { heroGlow: null, heroReflection: false }                                        // botanical: organic restraint
		default:      return { heroGlow: null, heroReflection: false }
	}
}
export function artTypeEmphasisForSpec(spec = {}) {
	const accent = palette(spec || {}).accent
	const art = artDirectionFor(spec)
	const base = typeEmphasisForAxes({ card: art ? art.card : (spec?.theme?.card || spec?.styleIntent?.card) }, accent)
	const override = art?.emphasis || spec?.theme?.emphasis || spec?.styleIntent?.emphasis
	return (override && typeof override === 'object') ? { ...base, ...override } : base
}

// M19b — MATERIAL / DEPTH temperament: per-world image framing + elevation. Wireframe/
// poster worlds get a hard accent frame and sharp corners; elegant gets a thin accent
// edge; glassy/soft get rounded clean with a soft shadow; editorial stays frameless
// (print). frame colour = world accent (generalizes to bespoke). shadow: 'soft'|'none'.
export function depthForAxes(axes = {}, accent = '2DD4BF') {
	switch (String(axes.card || '').toLowerCase()) {
		case 'thin':    return { imageFrame: { color: accent, width: 1.25 }, imageRadius: 0.02, shadow: 'soft' } // luxe: thin edge
		case 'outline': return { imageFrame: { color: accent, width: 1 },    imageRadius: 0,    shadow: 'none' } // blueprint: technical frame, sharp
		case 'solid':   return { imageFrame: { color: accent, width: 3 },    imageRadius: 0,    shadow: 'none' } // brutalist: hard heavy frame
		case 'bare':    return { imageFrame: null,                            imageRadius: 0,    shadow: 'none' } // editorial: frameless print
		case 'glass':   return { imageFrame: null,                            imageRadius: 0.06, shadow: 'soft' } // aurora: rounded soft
		case 'soft':    return { imageFrame: null,                            imageRadius: 0.10, shadow: 'soft' } // mist: rounded soft
		case 'craft':   return { imageFrame: { color: accent, width: 0.75 },  imageRadius: 0.02, shadow: 'soft' } // atelier: thin craft edge
		case 'panel':   return { imageFrame: { color: accent, width: 0.75 },  imageRadius: 0.03, shadow: 'soft' } // meridian: hairline corporate frame
		case 'frame':   return { imageFrame: { color: accent, width: 1.5 },   imageRadius: 0.04, shadow: 'soft' } // chalkline: screenshot plate (pairs with deviceFrame op)
		case 'rounded': return { imageFrame: null,                            imageRadius: 0.14, shadow: 'soft' } // playbook: big friendly radius
		case 'poster':  return { imageFrame: null,                            imageRadius: 0,    shadow: 'none' } // pulse: hard full-bleed punch
		case 'scrap':   return { imageFrame: { color: 'FFFFFF', width: 5 },   imageRadius: 0.01, shadow: 'soft' } // collage: polaroid white border
		case 'plot':    return { imageFrame: { color: accent, width: 0.75 },  imageRadius: 0.02, shadow: 'none' } // observatory: thin plot frame
		case 'page':    return { imageFrame: null,                            imageRadius: 0.16, shadow: 'soft' } // storybook: big soft rounding
		case 'candy':   return { imageFrame: null,                            imageRadius: 0.14, shadow: 'soft' } // candy: glossy rounding
		case 'bleed':   return { imageFrame: null,                            imageRadius: 0,    shadow: 'none' } // horizon: frameless full-bleed
		case 'quiet':   return { imageFrame: null,                            imageRadius: 0.06, shadow: 'none' } // mono: clean floating image
		case 'leaf':    return { imageFrame: null,                            imageRadius: 0.18, shadow: 'soft' } // botanical: organic rounding
		default:        return { imageFrame: null,                            imageRadius: 0.05, shadow: 'soft' }
	}
}
export function artDepthForSpec(spec = {}) {
	const accent = palette(spec || {}).accent
	const art = artDirectionFor(spec)
	const base = depthForAxes({ card: art ? art.card : (spec?.theme?.card || spec?.styleIntent?.card) }, accent)
	const override = art?.depth || spec?.theme?.depth || spec?.styleIntent?.depth
	return (override && typeof override === 'object') ? { ...base, ...override } : base
}

// M22 — IMAGE-TREATMENT temperament (worlds/media expansion axis): how the world frames
// and grades raster media. `treatment` is the named look; `worldOps` are the imageOps the
// treatment applies WHEN THE AUTHOR OPTS IN via content[].imageTreatment:"world" (defaults,
// never limits — nothing is grafted onto an image the author didn't ask to grade).
export function imageTreatmentForAxes(axes = {}, palette = {}) {
	const ink = String(palette.ink || '0B1220').replace(/^#/, '')
	const canvas = String(palette.bg || 'F8FAFC').replace(/^#/, '')
	switch (String(axes.card || '').toLowerCase()) {
		case 'thin':    return { treatment: 'gilded-edge',     worldOps: [] }                                            // luxe: the frame IS the treatment
		case 'bare':    return { treatment: 'frameless-print', worldOps: [{ op: 'grayscale' }] }                          // editorial: print grayscale
		case 'outline': return { treatment: 'technical-plate', worldOps: [{ op: 'duotone', dark: ink, light: canvas }] } // blueprint: schematic duotone
		case 'solid':   return { treatment: 'poster-block',    worldOps: [{ op: 'duotone', dark: '000000', light: 'FFFFFF' }] } // brutalist: hard mono
		case 'soft':    return { treatment: 'soft-rounded',    worldOps: [] }                                            // mist: untouched, rounded by depth
		case 'glass':   return { treatment: 'rounded-clean',   worldOps: [] }                                            // aurora: clean
		case 'craft':   return { treatment: 'warm-editorial',  worldOps: [{ op: 'duotone', dark: '2B2118', light: 'F7F1E5' }] } // atelier: warm craft grade
		case 'panel':   return { treatment: 'crisp-panel',     worldOps: [] }                                            // meridian: honest corporate photo
		case 'frame':   return { treatment: 'device-chrome',   worldOps: [{ op: 'deviceFrame', style: 'browser' }] }      // chalkline: screenshot chrome
		case 'rounded': return { treatment: 'friendly-round',  worldOps: [{ op: 'pad', px: 16, color: 'FFFFFF' }] }       // playbook: breathing pad
		case 'poster':  return { treatment: 'kinetic-fullbleed', worldOps: [] }                                          // pulse: raw full-bleed punch
		case 'scrap':   return { treatment: 'polaroid',        worldOps: [{ op: 'pad', px: 22, color: 'FFFFFF' }] }       // collage: polaroid mat
		case 'plot':    return { treatment: 'analytic-plate',  worldOps: [] }                                             // observatory: untouched data fidelity
		case 'page':    return { treatment: 'picture-book',    worldOps: [{ op: 'pad', px: 18, color: 'FFF9EF' }] }        // storybook: warm page mat
		case 'candy':   return { treatment: 'glossy-card',     worldOps: [{ op: 'pad', px: 14, color: 'FFFFFF' }] }        // candy: card mat
		case 'bleed':   return { treatment: 'full-bleed-fidelity', worldOps: [] }                                         // horizon: the photograph untouched
		case 'quiet':   return { treatment: 'gallery-mono',    worldOps: [{ op: 'grayscale' }] }                           // mono: monochrome gallery print
		case 'leaf':    return { treatment: 'garden-mat',      worldOps: [{ op: 'pad', px: 16, color: 'F3F5EC' }] }        // botanical: sage mat
		default:        return { treatment: 'rounded-clean',   worldOps: [] }
	}
}
export function artImageTreatmentForSpec(spec = {}) {
	const art = artDirectionFor(spec)
	const pal = palette(spec || {})
	const base = imageTreatmentForAxes({ card: art ? art.card : (spec?.theme?.card || spec?.styleIntent?.card) }, pal)
	const override = art?.imageTreatment || spec?.theme?.imageTreatment || spec?.styleIntent?.imageTreatment
	return (override && typeof override === 'object') ? { ...base, ...override } : base
}

// M22 — MEDIA-MOTION temperament: how the world moves media in time. Advisory defaults the
// AI reads (appliedDefaults) and applies through the open animation vocabulary; kenBurns
// hints pair with imageOps crop/zoom regions. Nothing auto-animates without authoring.
export function mediaMotionForAxes(axes = {}) {
	switch (String(axes.card || '').toLowerCase()) {
		case 'thin':    return { entrance: 'fade', pacing: 'slow',   kenBurns: 'subtle', cut: 'dissolve' } // luxe: slow cinematic drift
		case 'bare':    return { entrance: 'fade', pacing: 'calm',   kenBurns: 'none',   cut: 'cut' }      // editorial: still print
		case 'outline': return { entrance: 'wipe', pacing: 'even',   kenBurns: 'none',   cut: 'cut' }      // blueprint: mechanical
		case 'solid':   return { entrance: 'appear', pacing: 'hard', kenBurns: 'none',   cut: 'cut' }      // brutalist: hard cuts
		case 'soft':    return { entrance: 'fade', pacing: 'calm',   kenBurns: 'subtle', cut: 'dissolve' } // mist: gentle drift
		case 'glass':   return { entrance: 'fade', pacing: 'even',   kenBurns: 'subtle', cut: 'dissolve' } // aurora: clean drift
		case 'craft':   return { entrance: 'fade', pacing: 'calm',   kenBurns: 'subtle', cut: 'dissolve' } // atelier: warm drift
		case 'panel':   return { entrance: 'fade', pacing: 'even',   kenBurns: 'none',   cut: 'cut' }      // meridian: composed stills
		case 'frame':   return { entrance: 'rise', pacing: 'brisk',  kenBurns: 'region-zoom', cut: 'cut' } // chalkline: zoom into the step region
		case 'rounded': return { entrance: 'rise', pacing: 'even',   kenBurns: 'subtle', cut: 'dissolve' } // playbook: friendly lift
		case 'poster':  return { entrance: 'rise', pacing: 'beat',   kenBurns: 'punch',  cut: 'hard' }     // pulse: beat-synced punch-ins
		case 'scrap':   return { entrance: 'rise', pacing: 'playful', kenBurns: 'subtle', cut: 'cut' }     // collage: drop-in stills
		case 'plot':    return { entrance: 'wipe', pacing: 'even',   kenBurns: 'none',   cut: 'cut' }      // observatory: mechanical stills
		case 'page':    return { entrance: 'rise', pacing: 'calm',   kenBurns: 'subtle', cut: 'dissolve' } // storybook: gentle page-turn
		case 'candy':   return { entrance: 'rise', pacing: 'even',   kenBurns: 'subtle', cut: 'dissolve' } // candy: fluid pop
		case 'bleed':   return { entrance: 'fade', pacing: 'slow',   kenBurns: 'drift',  cut: 'dissolve' } // horizon: panoramic drift
		case 'quiet':   return { entrance: 'fade', pacing: 'slow',   kenBurns: 'none',   cut: 'dissolve' } // mono: still gallery
		case 'leaf':    return { entrance: 'fade', pacing: 'calm',   kenBurns: 'subtle', cut: 'dissolve' } // botanical: gentle sway
		default:        return { entrance: 'fade', pacing: 'even',   kenBurns: 'subtle', cut: 'dissolve' }
	}
}
export function artMediaMotionForSpec(spec = {}) {
	const art = artDirectionFor(spec)
	const base = mediaMotionForAxes({ card: art ? art.card : (spec?.theme?.card || spec?.styleIntent?.card) })
	const override = art?.mediaMotion || spec?.theme?.mediaMotion || spec?.styleIntent?.mediaMotion
	return (override && typeof override === 'object') ? { ...base, ...override } : base
}

function presetFor(spec) {
	const key = String(spec?.styleIntent?.preset || spec?.theme?.preset || '').toLowerCase().trim().replace(/\s+/g, '-')
	return STYLE_PRESETS[key] || null
}

export function listStylePresets() {
	return Object.keys(STYLE_PRESETS)
}

function palette(spec) {
	// Honor author intent: theme.palette (array) wins, then styleIntent.palette
	// (array OR semantic object), then the safe default. This lets an AI client
	// express brand colours the natural way without them being silently dropped.
	const si = spec.styleIntent?.palette
	let p = Array.isArray(spec.theme?.palette) && spec.theme.palette.length ? spec.theme.palette : null
	if (!p && Array.isArray(si) && si.length) p = si
	if (!p && si && typeof si === 'object') {
		p = [
			si.ink || si.textPrimary || si.text || '0B1220',
			si.primary || si.accent || '2563EB',
			si.secondary || si.success || si.accent2 || '14B8A6',
			si.warn || si.warning || si.accent3 || 'F59E0B',
			si.background || si.bg || si.surface || 'F8FAFC',
		]
	}
	if (!p) { const pr = presetFor(spec); if (pr && Array.isArray(pr.palette)) p = pr.palette }
	if (!p) { const ar = artDirectionFor(spec); if (ar && Array.isArray(ar.palette)) p = ar.palette }
	if (!p) p = ['0B1220', '2563EB', '14B8A6', 'F59E0B', 'F8FAFC']
	const authoredBg = p[4] || 'F8FAFC'
	// A declared mode is a canvas contract, not a suggestion.  A common cold-AI
	// failure is to select a dark World while copying a light brand palette (or
	// vice versa).  Letting that contradictory background flow into the World's
	// gradient/card functions produces an unreadable muddy render.  Preserve the
	// authored accents, but use the selected World's tuned mode background when
	// the supplied palette has the opposite polarity.  The correction is surfaced
	// to appliedDefaults so the AI can learn the safe semantic edit.
	const requestedDark = deckIsDark(spec || {}, {})
	const authoredDark = isDarkHex(authoredBg)
	let bg = authoredBg
	let modeCorrection = null
	if (requestedDark !== authoredDark) {
		const art = artDirectionFor(spec)
		const preset = presetFor(spec)
		// A bespoke World may have supplied the contradictory background itself;
		// reusing art.palette[4] here would report a correction while leaving the
		// canvas on the wrong side of the mode polarity. Named Worlds retain their
		// tuned background; bespoke Worlds fall back to a safe neutral canvas.
		const fallbackBg = art?.bespoke
			? (requestedDark ? '0B1120' : 'F8FAFC')
			: (art?.palette?.[4] || preset?.palette?.[4] || (requestedDark ? '0B1120' : 'F8FAFC'))
		bg = fallbackBg
		modeCorrection = {
			requested: requestedDark ? 'dark' : 'light',
			authoredBackground: authoredBg,
			appliedBackground: bg,
			reason: 'The authored palette background contradicted the selected mode; the World mode background preserves legibility and treatment while authored accents remain active.',
		}
	}
	// Legibility invariant: never let the ink/canvas pairing fall below the readable
	// floor — the guardrail that keeps a bespoke AI-composed palette safe. Corrects
	// only the polarity (light-on-light / dark-on-dark); tasteful muted inks pass.
	const ink = ensureReadableInk(p[0] || '0B1220', bg).ink
	return {
		ink,
		accent: p[1] || '2563EB',
		success: p[2] || '14B8A6',
		warn: p[3] || 'F59E0B',
		bg,
		raw: p,
		...(modeCorrection ? { modeCorrection } : {}),
	}
}

// Internal compiler consumers need the same mode-corrected palette that drives
// the canvas. Keep the raw authored accents available, but never make a chart
// or table decide contrast against an obsolete background from theme.raw.
export function resolvedPaletteForSpec(spec = {}) {
	return palette(spec || {})
}

// Style fields an AI client legitimately sets per object. The spec compiler
// historically only read block.style, but every primitive tool takes `options`,
// so an AI naturally puts fontSize/color/text3D/etc. under options. Merge both
// (explicit block.style still wins) so author intent is not silently discarded.
const AUTHOR_STYLE_KEYS = new Set([
	'fontFace', 'fontSize', 'color', 'textFill', 'textOutline', 'textColorRole', 'textColors', 'bold', 'italic', 'underline', 'strike',
	'align', 'valign', 'transparency', 'fill', 'line', 'margin', 'wrap', 'fit',
	'autoFit', 'rectRadius', 'shadow', 'glow', 'reflection', 'softEdges', 'blur', 'fillOverlay', 'effects',
	'effect3D', 'text3D', 'wordArt', 'textShadow', 'textGlow', 'charSpacing', 'lineSpacing',
	'paraSpaceBefore', 'paraSpaceAfter', 'lineSpacingMultiple', 'bullet', 'indent', 'hanging', 'indentLevel', 'tabStops', 'highlight', 'superscript', 'subscript', 'rotate',
	'flipH', 'flipV', 'hyperlink',
])

function authorStyleFromOptions(options) {
	const out = {}
	if (options && typeof options === 'object') {
		for (const key of AUTHOR_STYLE_KEYS) if (options[key] !== undefined) out[key] = options[key]
	}
	return out
}

function effectiveBlockStyle(block, theme = null) {
	const out = { ...authorStyleFromOptions(block?.options), ...(block?.style && typeof block.style === 'object' ? block.style : {}) }
	if (out.color === undefined && out.textColorRole && theme?.textColorRoles?.roles) {
		const normalizedRole = String(out.textColorRole).trim().toLowerCase().replace(/[\s_]+/g, '-')
		const roleKey = TEXT_COLOR_ROLE_ALIASES[normalizedRole]
		const resolved = roleKey ? theme.textColorRoles.roles[roleKey] : null
		if (resolved?.color) out.color = resolved.color
	}
	return out
}

function resolvedTextColorRole(role, theme = null) {
	if (!role || !theme?.textColorRoles?.roles) return null
	const normalizedRole = String(role).trim().toLowerCase().replace(/[\s_]+/g, '-')
	const roleKey = TEXT_COLOR_ROLE_ALIASES[normalizedRole]
	return roleKey ? theme.textColorRoles.roles[roleKey]?.color || null : null
}

function resolveSmartArtNodeTextRoles(nodes, theme = null) {
	if (!Array.isArray(nodes)) return nodes
	return nodes.map(node => {
		if (!node || typeof node !== 'object' || Array.isArray(node)) return node
		const explicitColor = node.color || node.style?.color
		const roleColor = explicitColor ? null : resolvedTextColorRole(node.textColorRole || node.style?.textColorRole, theme)
		return {
			...node,
			...(roleColor ? { color: roleColor } : {}),
			...(Array.isArray(node.children) ? { children: resolveSmartArtNodeTextRoles(node.children, theme) } : {}),
		}
	})
}

const SMARTART_THEME_LINKED_STYLE_KEYS = Object.freeze([
	'quickStyleId', 'quickStyleName', 'colorStyleId', 'colorStyleName',
])

// Some native SmartArt layouts render semantic levels rather than a flat list.
// Keep the contract explicit and executable so a public client cannot submit
// five visible concepts and receive a diagram that silently displays only one.
// Add entries only after a PowerPoint render proves the exact native topology.
export const SMARTART_NODE_TOPOLOGY_CONTRACTS = Object.freeze({
	'urn:microsoft.com/office/officeart/2008/layout/RadialCluster': Object.freeze({
		layoutId: 'urn:microsoft.com/office/officeart/2008/layout/RadialCluster',
		layoutName: 'Radial Cluster',
		nodeModel: 'single-root-with-children',
		requiredTopLevelNodes: 1,
		minChildren: 1,
		maxChildren: 7,
		maxDepth: 2,
		authoringShape: 'nodes:[{text:"central idea",children:[{text:"related idea"},...]}]',
	}),
})

function smartArtTopologyKey(value) {
	return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function smartArtNodeTopologyContractFor(input = {}) {
	const layoutId = String(input?.layoutId || input?.id || '').trim()
	if (layoutId && SMARTART_NODE_TOPOLOGY_CONTRACTS[layoutId]) return SMARTART_NODE_TOPOLOGY_CONTRACTS[layoutId]
	const requested = [input?.layoutName, input?.name, input?.layout, layoutId].filter(Boolean).map(smartArtTopologyKey)
	return Object.values(SMARTART_NODE_TOPOLOGY_CONTRACTS).find(contract => requested.includes(smartArtTopologyKey(contract.layoutName))) || null
}

export function inspectSmartArtNodeTopology(input = {}) {
	const mode = String(input?.mode || (input?.native === false ? 'shape' : 'native')).trim().toLowerCase()
	if (mode === 'shape' || mode === 'custom') return null
	const contract = smartArtNodeTopologyContractFor(input)
	if (!contract) return null
	const nodes = Array.isArray(input?.nodes) ? input.nodes : (Array.isArray(input?.items) ? input.items : [])
	const root = nodes[0]
	const children = root && typeof root === 'object' && !Array.isArray(root) && Array.isArray(root.children) ? root.children : []
	const level3NodeCount = children.reduce((count, child) => count + (child && typeof child === 'object' && !Array.isArray(child) && Array.isArray(child.children) ? child.children.length : 0), 0)
	let failure = null
	if (nodes.length !== contract.requiredTopLevelNodes) failure = 'top-level-node-count'
	else if (!root || typeof root !== 'object' || Array.isArray(root)) failure = 'root-must-be-an-object'
	else if (children.length < contract.minChildren) failure = 'missing-level-2-children'
	else if (Number.isFinite(contract.maxChildren) && children.length > contract.maxChildren) failure = 'too-many-level-2-children'
	else if (level3NodeCount > 0) failure = 'unsupported-level-3-nodes'
	return {
		valid: failure === null,
		failure,
		contract,
		topLevelNodeCount: nodes.length,
		childNodeCount: children.length,
		level3NodeCount,
	}
}

function smartArtNodeTopologyFinding({ block, items, slideId, objectName }) {
	const inspection = inspectSmartArtNodeTopology({ ...block, nodes: items })
	if (!inspection || inspection.valid) return null
	return {
		code: 'SMARTART_NODE_TOPOLOGY_INVALID',
		severity: 'error',
		slideId,
		objectName,
		message: `Native SmartArt layout "${inspection.contract.layoutName}" requires one central Level 1 node with its surrounding Level 2 nodes authored as children.`,
		reason: 'PowerPoint uses the diagram data-model hierarchy for this layout. Flat top-level nodes remain in the package but only the first node is visible in the rendered diagram.',
		fix: `Restructure the semantic nodes as ${inspection.contract.authoringShape}, then rerun dryRun and inspect the full PowerPoint render.`,
		evidence: {
			layoutId: inspection.contract.layoutId,
			layoutName: inspection.contract.layoutName,
			nodeModel: inspection.contract.nodeModel,
			failure: inspection.failure,
			topLevelNodeCount: inspection.topLevelNodeCount,
			childNodeCount: inspection.childNodeCount,
			requiredTopLevelNodes: inspection.contract.requiredTopLevelNodes,
			minChildren: inspection.contract.minChildren,
			maxChildren: inspection.contract.maxChildren,
			maxDepth: inspection.contract.maxDepth,
			level3NodeCount: inspection.level3NodeCount,
			engineAction: 'block-before-commit',
		},
	}
}

function executableSmartArtTextColor(value) {
	const color = String(value || '').trim().replace(/^#/, '')
	return /^[0-9A-F]{6}$/i.test(color)
}

function smartArtTopLevelTextPolarityIsExplicit(block) {
	if (executableSmartArtTextColor(block?.color)
		|| executableSmartArtTextColor(block?.style?.color)
		|| executableSmartArtTextColor(block?.options?.color)) return true
	for (const colors of [block?.textColors, block?.style?.textColors, block?.options?.textColors]) {
		if (Array.isArray(colors) && colors.length > 0 && colors.every(executableSmartArtTextColor)) return true
	}
	return false
}

function unresolvedSmartArtNodeTextPolarity(nodes, root = 'nodes') {
	const unresolvedNodePaths = []
	const unresolvedRolePaths = []
	const visit = (node, nodePath) => {
		if (!node || typeof node !== 'object' || Array.isArray(node)) {
			unresolvedNodePaths.push(nodePath)
			return
		}
		if (!executableSmartArtTextColor(node.color)) {
			unresolvedNodePaths.push(nodePath)
			if (node.textColorRole || node.style?.textColorRole) unresolvedRolePaths.push(nodePath)
		}
		if (Array.isArray(node.children)) node.children.forEach((child, index) => visit(child, `${nodePath}.children[${index}]`))
	}
	if (Array.isArray(nodes)) nodes.forEach((node, index) => visit(node, `${root}[${index}]`))
	return { unresolvedNodePaths, unresolvedRolePaths }
}

function smartArtTextPolarityFinding({ block, items, slideId, objectName }) {
	const mode = String(block?.mode || 'native').trim().toLowerCase()
	if (mode === 'shape' || mode === 'custom') return null
	const selectedStyleKeys = SMARTART_THEME_LINKED_STYLE_KEYS.filter(key => block?.[key] !== undefined && block?.[key] !== null && String(block[key]).trim())
	if (selectedStyleKeys.length === 0 || smartArtTopLevelTextPolarityIsExplicit(block)) return null
	const nodeRoot = Array.isArray(block?.nodes) && block.nodes.length ? 'nodes' : 'items'
	const { unresolvedNodePaths, unresolvedRolePaths } = unresolvedSmartArtNodeTextPolarity(items, nodeRoot)
	if (unresolvedNodePaths.length === 0) return null
	return {
		code: 'SMARTART_TEXT_POLARITY_UNRESOLVED',
		severity: 'error',
		slideId,
		objectName,
		message: 'Native SmartArt uses an explicit Quick Style or Color Style, but one or more node text colours have no explicit author decision.',
		reason: 'Native SmartArt gallery fills are theme-linked and can render light or dark in PowerPoint. The selected gallery IDs alone do not establish readable text polarity, so a mechanical theme-ink fallback is not safe pre-save evidence.',
		fix: 'Use AI design judgment to set content[].style.color or content[].style.textColorRole for the whole SmartArt, or set nodes[].color or nodes[].textColorRole for every listed node; then rerun dryRun and inspect the full PowerPoint render. The engine will not choose a text colour.',
		evidence: {
			mode: 'native',
			selectedStyleKeys,
			selectedStyles: Object.fromEntries(selectedStyleKeys.map(key => [key, block[key]])),
			unresolvedNodeCount: unresolvedNodePaths.length,
			unresolvedNodePaths: unresolvedNodePaths.slice(0, 24),
			...(unresolvedRolePaths.length ? { unresolvableTextColorRolePaths: unresolvedRolePaths.slice(0, 24) } : {}),
			acceptedTopLevelFields: ['style.color', 'style.textColorRole', 'options.color', 'options.textColorRole', 'color', 'textColors'],
			acceptedNodeFields: ['nodes[].color', 'nodes[].textColorRole'],
			decisionAuthority: 'AI',
			engineAction: 'block-without-selecting',
		},
	}
}

function flattenSemanticNodeText(nodes) {
	const out = []
	const visit = (node, nodePath) => {
		if (node === undefined || node === null) return
		if (typeof node === 'string' || typeof node === 'number') out.push({ nodePath, text: String(node) })
		else if (typeof node === 'object') {
			const text = [node.title, node.label, node.text, node.value].filter(value => value !== undefined && value !== null && String(value).trim()).join(' — ')
			if (text) out.push({ nodePath, text, fontSize: node.style?.fontSize || node.fontSize })
			if (Array.isArray(node.children)) node.children.forEach((child, index) => visit(child, `${nodePath}.children[${index}]`))
		}
	}
	if (Array.isArray(nodes)) nodes.forEach((node, index) => visit(node, `[${index}]`))
	return out
}

function normalizedShapeBuiltSmartArtLayout(layout = 'process') {
	const name = String(layout || 'process').toLowerCase().replace(/[^a-z0-9]+/g, '')
	return name.includes('picture') ? 'picture'
		: name.includes('timeline') ? 'timeline'
			: name.includes('team') || name.includes('meet') ? 'team'
				: name.includes('cycle') ? 'cycle'
					: name.includes('hierarchy') || name.includes('org') ? 'hierarchy'
						: name.includes('matrix') ? 'matrix'
							: name.includes('pyramid') ? 'pyramid'
								: name.includes('relation') || name.includes('venn') || name.includes('radial') ? 'relationship'
									: name.includes('list') || name.includes('block') ? 'list'
										: 'process'
}

// Shape-mode SmartArt is lowered into ordinary editable shapes.  Its text-fit
// oracle must therefore use the same inner label frames as the emitter instead
// of a native-SmartArt/equal-area proxy.  Keep this as a layout-family helper so
// additional shape layouts can join the same contract without changing the
// caller or weakening native SmartArt's separate rendered-review behavior.
export function shapeBuiltSmartArtTextFrames({ layout = 'process', box = {}, nodeCount = 0, hasTitle = false } = {}) {
	const count = Math.max(0, Math.floor(Number(nodeCount) || 0))
	if (!count) return []
	const x = Number.isFinite(Number(box.x)) ? Number(box.x) : 1
	const y = Number.isFinite(Number(box.y)) ? Number(box.y) : 1
	const w = Math.max(1, Number.isFinite(Number(box.w)) ? Number(box.w) : 8)
	const h = Math.max(0.8, Number.isFinite(Number(box.h)) ? Number(box.h) : 3)
	let workY = y
	let workH = h
	if (hasTitle) {
		workY += 0.38
		workH = Math.max(0.5, workH - 0.38)
	}
	const kind = normalizedShapeBuiltSmartArtLayout(layout)
	if (kind !== 'timeline') return []

	const midY = workY + workH * 0.5
	const gap = w / Math.max(count, 1)
	const nodeW = Math.min(2.2, gap * 0.8)
	// Alternate nodes around the centre line while keeping every backing shape
	// inside its semantic host.  Larger hosts can use a two-line presentation
	// label at the diagram floor; compact hosts stay bounded and fail text fit
	// truthfully instead of leaking past the region.
	const verticalCapacity = Math.max(0.1, workH * 0.5 - 0.22)
	const nodeH = Math.min(0.9, workH * 0.34, verticalCapacity)
	return Array.from({ length: count }, (_unused, index) => {
		const cx = x + gap * index + gap / 2
		const ny = index % 2 === 0 ? midY - nodeH - 0.22 : midY + 0.22
		const nodeRect = { x: cx - nodeW / 2, y: ny, w: nodeW, h: nodeH }
		return {
			index,
			layout: kind,
			nodeRect,
			labelRect: {
				x: nodeRect.x + 0.08,
				y: nodeRect.y + Math.max(0.03, nodeRect.h * 0.18),
				w: Math.max(0.1, nodeRect.w - 0.16),
				h: Math.max(0.1, nodeRect.h * 0.64),
			},
			margin: 0.02,
			geometrySource: 'shape-built-smartart-emitter-contract',
		}
	})
}

function tableCellTextPayload(cell, inheritedOptions = {}) {
	if (cell === undefined || cell === null) return { text: '', options: { ...inheritedOptions }, runs: null }
	if (typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean') {
		return { text: String(cell), options: { ...inheritedOptions }, runs: null }
	}
	if (Array.isArray(cell)) {
		const runs = cell.map(run => typeof run === 'object' && run !== null
			? { text: String(run.text ?? ''), options: { ...inheritedOptions, ...(run.options || {}) } }
			: { text: String(run ?? ''), options: { ...inheritedOptions } })
		return { text: runs.map(run => run.text).join(''), options: { ...inheritedOptions }, runs }
	}
	const options = { ...inheritedOptions, ...(cell.options || {}), ...(cell.style || {}) }
	const source = Array.isArray(cell.text) ? cell.text : (Array.isArray(cell.runs) ? cell.runs : null)
	if (source) {
		const runs = source.map(run => typeof run === 'object' && run !== null
			? { text: String(run.text ?? ''), options: { ...options, ...(run.options || {}) } }
			: { text: String(run ?? ''), options: { ...options } })
		return { text: runs.map(run => run.text).join(''), options, runs }
	}
	return { text: String(cell.text ?? cell.value ?? cell.label ?? ''), options, runs: null }
}

function tableTrackSizes(raw, count, total) {
	const fallback = Array.from({ length: count }, () => Math.max(0.1, total / Math.max(1, count)))
	if (raw === undefined || raw === null) return { sizes: fallback, explicit: false, valid: true }
	if (Number.isFinite(Number(raw)) && Number(raw) > 0) return { sizes: Array.from({ length: count }, () => Number(raw)), explicit: true, valid: true }
	if (Array.isArray(raw) && raw.length >= count) {
		const sizes = raw.slice(0, count).map(Number)
		if (sizes.every(value => Number.isFinite(value) && value > 0)) return { sizes, explicit: true, valid: true }
	}
	return { sizes: fallback, explicit: true, valid: false }
}

function deckIsDark(spec = {}, slide = {}) {
	const modes = [slide.mode, slide.styleIntent?.mode, slide.styleIntent?.tone, spec.styleIntent?.mode, spec.styleIntent?.tone, spec.theme?.mode]
		.map(value => String(value || '').toLowerCase())
	if (modes.some(value => value.includes('dark') || value.includes('night'))) return true
	if (modes.some(value => value.includes('light'))) return false
	const art = artDirectionFor(spec)
	if (art?.mode) return art.mode === 'dark'
	const preset = presetFor(spec)
	if (preset?.mode) return preset.mode === 'dark'
	return false
}

function isDarkHex(hex) {
	const h = String(hex || '').replace('#', '')
	if (!/^[0-9a-fA-F]{6}$/.test(h)) return false
	const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
	return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 110
}

// WCAG relative luminance + contrast ratio (1..21). The legibility INVARIANT — the
// MCP-owned guardrail that lets AI design-freedom stay safe: whatever world the AI
// composes, text is never allowed to fall below a readable floor against its canvas.
function relLuminance(hex) {
	const h = String(hex || '').replace('#', '')
	if (!/^[0-9a-fA-F]{6}$/.test(h)) return 0
	const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
	const lin = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
function contrastRatio(a, b) {
	const la = relLuminance(a), lb = relLuminance(b)
	const hi = Math.max(la, lb), lo = Math.min(la, lb)
	return (hi + 0.05) / (lo + 0.05)
}
// Guarantee ink is at least large-text legible (floor 3.0) against its canvas; if
// not, snap it to the readable extreme for that canvas. Returns the (possibly
// corrected) ink plus whether a correction happened, so it can be surfaced.
function ensureReadableInk(ink, bg, floor = 3.0) {
	const norm = String(ink || '').replace(/^#/, '').toUpperCase()
	if (contrastRatio(norm, bg) >= floor) return { ink: norm, corrected: false }
	const candidate = isDarkHex(bg) ? 'F8FAFC' : '0B1220'
	return { ink: candidate, corrected: true, from: norm, ratio: Number(contrastRatio(norm, bg).toFixed(2)) }
}
// Push a fill colour away from the canvas luminance (preserving hue) until it is
// visibly distinguishable — so chart bars / shapes never vanish into the canvas,
// even with a low-contrast bespoke palette. Fills need far less contrast than text,
// hence the lower floor.
function nudgeLuminanceFromCanvas(hex, canvas, floor) {
	let c = String(hex || '').replace(/^#/, '')
	if (!/^[0-9a-fA-F]{6}$/.test(c)) return String(hex || '').toUpperCase()
	const lighten = isDarkHex(canvas)
	for (let i = 0; i < 12 && contrastRatio(c, canvas) < floor; i++) {
		c = lighten ? lightenHex(c, 0.12) : darkenHex(c, 0.12)
	}
	return c.toUpperCase()
}
export function ensureAccentOnCanvas(accent, canvas, floor = 1.7) {
	const a = String(accent || '').replace(/^#/, '').toUpperCase()
	if (contrastRatio(a, canvas) >= floor) return { accent: a, nudged: false }
	const fixed = nudgeLuminanceFromCanvas(a, canvas, floor)
	return { accent: fixed, nudged: fixed !== a, from: a, ratio: Number(contrastRatio(a, canvas).toFixed(2)) }
}
// Public: palette HEALTH beyond text legibility — is the accent visible on the
// canvas (else charts/diagrams disappear), and is the derived theme ramp distinct
// (else multi-series data viz collapses to one colour). Advisory (surfaced in
// appliedDefaults); the chart builder applies the accent nudge at point of use.
export function paletteHealth(spec = {}) {
	const p = palette(spec || {})
	const dark = deckIsDark(spec || {}, {})
	const art = artDirectionFor(spec)
	const canvas = resolvedPanelColor(art, p, dark)
	const check = ensureAccentOnCanvas(p.accent, canvas)
	// A nudge is an engine correction, not a visibility failure: the rendered
	// chart/shape consumes the resolved accent. Re-check the resolved value so
	// AI readback describes the actual output rather than the pre-correction input.
	const resolvedCheck = ensureAccentOnCanvas(check.accent, canvas)
	const ramp = themeColorSchemeForSpec(spec)
	const vals = Object.values(ramp)
	return {
		accentOnCanvas: {
			ratio: Number(contrastRatio(p.accent, canvas).toFixed(2)),
			visible: !resolvedCheck.nudged,
			...(check.nudged ? { note: `accent ${p.accent} is low-contrast on the canvas; charts/shapes auto-nudge to ${check.accent}` } : {}),
		},
		rampDistinct: `${new Set(vals).size}/${vals.length}`,
		...(p.modeCorrection ? { modeCorrection: p.modeCorrection } : {}),
	}
}

// Public: report the deck's ink/background legibility status (for appliedDefaults).
export function legibilityReport(spec = {}) {
	const p = palette(spec || {})
	const dark = deckIsDark(spec || {}, {})
	// The canvas the body text actually sits on: panel in dark worlds, paper/bg in light.
	const art = artDirectionFor(spec)
	const canvas = resolvedPanelColor(art, p, dark)
	// Check the RAW author ink (p.ink is already invariant-corrected by palette()),
	// so the report can tell the AI a correction was applied.
	const check = ensureReadableInk(p.raw?.[0] || p.ink, canvas)
	return {
		ink: check.ink,
		canvas: String(canvas).replace(/^#/, '').toUpperCase(),
		ratio: Number(contrastRatio(check.ink, canvas).toFixed(2)),
		corrected: check.corrected,
		...(check.corrected ? { correctedFrom: check.from, originalRatio: check.ratio } : {}),
	}
}

export function gradientStopPositionPercent(value, index, count) {
	const raw = Number(value)
	// Engine defaults traditionally use normalized 0..1 positions, while the
	// library contract accepts percentage positions 0..100. Accept both at the
	// single engine boundary so a future World/surface cannot accidentally emit
	// 5500 instead of 55 by supplying an already-normalized percentage.
	const fallback = count <= 1 ? 0 : (index / (count - 1)) * 100
	const percent = Number.isFinite(raw) ? (Math.abs(raw) <= 1 ? raw * 100 : raw) : fallback
	return Math.round(Math.max(0, Math.min(100, percent)))
}

function gradient(stops, angle = 0) {
	return {
		type: 'gradient',
		gradientAngle: angle,
		// The shared PPTX serializer's public gradient contract uses percentage
		// positions (0–100). World defaults are authored with normalized
		// coordinates (0–1), so convert at this single engine boundary instead
		// of emitting fractional positions that PowerPoint clamps to the first
		// one percent and makes the canvas appear flat.
		gradientStops: stops.map(([pos, color, transparency = 0], index) => ({
			position: gradientStopPositionPercent(pos, index, stops.length),
			color,
			transparency,
		})),
	}
}

function subtleShadow(opacity = 0.14, blur = 3, distance = 1) {
	return { type: 'outer', color: '000000', opacity, blur, angle: 45, distance }
}

// --- Premium default depth (M2a): make dark cards glassy by default ---
function clampByte(v) { return Math.max(0, Math.min(255, Math.round(v))) }
function lightenHex(hex, amt) {
	const h = String(hex || '').replace('#', '')
	if (!/^[0-9a-fA-F]{6}$/.test(h)) return (h || 'FFFFFF').toUpperCase()
	const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
	return c.map(v => clampByte(v + (255 - v) * amt).toString(16).padStart(2, '0')).join('').toUpperCase()
}
function darkenHex(hex, amt) {
	const h = String(hex || '').replace('#', '')
	if (!/^[0-9a-fA-F]{6}$/.test(h)) return (h || '000000').toUpperCase()
	const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16))
	return c.map(v => clampByte(v * (1 - amt)).toString(16).padStart(2, '0')).join('').toUpperCase()
}
function isDarkTheme(theme) { return isDarkHex(theme?.bg) || isDarkHex(theme?.panel) }
// Default card fill: on dark, a subtle top-lit gradient (glassy depth); on light, flat panel.
// Author-supplied fill always overrides (spread after the defaults).
// SURFACE GRAMMAR (the "6 worlds is not enough" unlock): the 6 named `card` values are
// PRESETS over a continuous knob space — corner (radius), fill, border, elevation. A
// bespoke world can set styleIntent.artDirection.surface (or theme.surface) to ANY knob
// combination, so the surface space is continuous, not a 6-item menu. The presets below
// reproduce the named worlds EXACTLY (zero regression); explicit knobs override per-knob.
//   corner:    number (rectRadius inches)
//   fill:      'transparent' | 'flat' | 'lift' | 'glass'
//   border:    'none' | 'wireframe' | 'accent' | 'lifted'
//   elevation: 'none' | 'soft' | 'thin' | 'glass'  (shadow weight)
const SURFACE_PRESETS = {
	glass:   { corner: 0.10, fill: 'glass',       border: 'lifted',    elevation: 'glass' },
	soft:    { corner: 0.14, fill: 'flat',        border: 'none',      elevation: 'soft'  },
	thin:    { corner: 0.06, fill: 'lift',        border: 'accent',    elevation: 'thin'  },
	outline: { corner: 0,    fill: 'transparent', border: 'wireframe', elevation: 'none'  },
	solid:   { corner: 0,    fill: 'flat',        border: 'none',      elevation: 'none'  },
	bare:    { corner: 0,    fill: 'transparent', border: 'none',      elevation: 'none'  },
	// Wave-1 worlds (2026-07-03)
	craft:   { corner: 0.05, fill: 'flat',        border: 'lifted',    elevation: 'soft'  }, // atelier: paper card, warm hairline
	panel:   { corner: 0.03, fill: 'flat',        border: 'lifted',    elevation: 'thin'  }, // meridian: crisp corporate panel
	frame:   { corner: 0.04, fill: 'flat',        border: 'lifted',    elevation: 'soft'  }, // chalkline: instructional plate
	rounded: { corner: 0.18, fill: 'flat',        border: 'none',      elevation: 'soft'  }, // playbook: big friendly radius
	poster:  { corner: 0,    fill: 'flat',        border: 'none',      elevation: 'none'  }, // pulse: hard flat block
	scrap:   { corner: 0.02, fill: 'flat',        border: 'lifted',    elevation: 'soft'  }, // collage: paper scrap
	// Wave-2 worlds (2026-07-03)
	plot:    { corner: 0.02, fill: 'transparent', border: 'wireframe', elevation: 'none'  }, // observatory: thin plot frame
	page:    { corner: 0.20, fill: 'flat',        border: 'none',      elevation: 'soft'  }, // storybook: soft page card
	candy:   { corner: 0.16, fill: 'lift',        border: 'none',      elevation: 'soft'  }, // candy: glossy lifted card
	// Wave-3 worlds (2026-07-03)
	// Horizon is intentionally flat at the World contract level. Its caption
	// scrim remains edge-to-edge and frameless, but must not inherit the dark
	// glass gradient used by Aurora; otherwise semantic data cards contradict
	// gradientPolicy.expected=false when no photo is present.
	bleed:   { corner: 0,    fill: 'flat',        border: 'none',      elevation: 'none'  }, // horizon: caption scrim over photo
	quiet:   { corner: 0.08, fill: 'transparent', border: 'none',      elevation: 'none'  }, // mono: no boxes, whisper rounding
	leaf:    { corner: 0.24, fill: 'flat',        border: 'lifted',    elevation: 'soft'  }, // botanical: soft leaf card
}
export function listSurfaceKnobs() {
	return { corner: 'number (0–0.2 in)', fill: ['transparent', 'flat', 'lift', 'glass'], border: ['none', 'wireframe', 'accent', 'lifted'], elevation: ['none', 'soft', 'thin', 'glass'], presets: Object.keys(SURFACE_PRESETS) }
}
// Resolve continuous surface knobs: explicit theme.art.surface / theme.surface over the
// card preset (or the dark/light default). This is the single seam every card* default reads.
function resolveSurfaceKnobs(theme) {
	const card = theme?.art?.card || (isDarkTheme(theme) ? 'glass' : 'soft')
	const preset = SURFACE_PRESETS[card] || SURFACE_PRESETS.glass
	const explicit = (theme?.art?.surface && typeof theme.art.surface === 'object') ? theme.art.surface
		: (theme?.surface && typeof theme.surface === 'object') ? theme.surface : {}
	return { ...preset, ...explicit }
}
function cardFillDefault(theme) {
	const base = theme?.panel || theme?.bg || 'FFFFFF'
	const k = resolveSurfaceKnobs(theme)
	switch (k.fill) {
		case 'transparent': return { color: theme?.bg || base, transparency: 100 }
		case 'flat': return { color: base }
		case 'lift': return gradient([[0, lightenHex(base, 0.07), 0], [1, base, 0]], 90)
		case 'glass': return isDarkTheme(theme)
			? gradient([[0, lightenHex(base, 0.12), 0], [1, darkenHex(base, 0.16), 0]], 90)
			: { color: base }
		default: return { color: base }
	}
}
// Default card border from the resolved surface knob: lifted = lighter edge; wireframe =
// outline; accent = brand hairline; none = no visible border. Accent stays reserved for the
// one focal element (so most borders are neutral).
function cardBorderDefault(theme) {
	const base = theme?.panel || theme?.bg || 'FFFFFF'
	const k = resolveSurfaceKnobs(theme)
	switch (k.border) {
		case 'wireframe': return { color: lightenHex(base, 0.34), width: 1 }
		case 'accent': return { color: theme?.accent || 'C8A24B', width: 1 }
		case 'lifted': return isDarkTheme(theme) ? { color: lightenHex(base, 0.26), width: 1 } : { color: 'E2E8F0', width: 1 }
		case 'none': return { color: base, transparency: 100, width: 0 }
		default: return { color: base, transparency: 100, width: 0 }
	}
}
function cardShadowDefault(theme) {
	const k = resolveSurfaceKnobs(theme)
	switch (k.elevation) {
		case 'none': return null
		case 'soft': return subtleShadow(0.10, 8, 2)
		case 'thin': return subtleShadow(0.18, 6, 2)
		case 'glass': return subtleShadow(0.16, 6, 2)
		case 'medium': return subtleShadow(0.16, 6, 2)
		default: return subtleShadow(0.16, 6, 2)
	}
}
function cardRadiusDefault(theme) {
	const k = resolveSurfaceKnobs(theme)
	return typeof k.corner === 'number' ? k.corner : 0.1
}

function deltaColor(delta, theme = {}) {
	const s = String(delta || '').trim()
	if (/^[+▲]|^↑|\bup\b/i.test(s)) return resolvedTextColorRole('proof', theme) || theme.positive || '16A34A'
	if (/^[-▼]|^↓|\bdown\b/i.test(s)) return resolvedTextColorRole('caution', theme) || theme.negative || 'DC2626'
	return resolvedTextColorRole('accent', theme) || theme.accent || '2563EB'
}

function line(color, transparency = 100, width = 1) {
	return { color, transparency, width }
}

function slideVisualSystem(spec, slide, slideIndex, slideSize, baseTheme, options = {}) {
	const isDark = deckIsDark(spec, slide)
	const accent2 = baseTheme.success || baseTheme.raw[2] || '14B8A6'
	const accent3 = baseTheme.warn || baseTheme.raw[3] || 'F59E0B'
	const paper = baseTheme.bg || 'F8FAFC'
	// In dark mode `ink` is the (light) text colour, so derive a genuine dark
	// canvas base from the palette background instead of from ink.
	// Premium dark canvas (M2a): a clean navy -> near-black diagonal gradient with a
	// visible (not invisible near-black) luminance range. If the author supplied a real
	// dark palette background, derive the gradient from it; otherwise use a tuned navy.
	const customDark = isDarkHex(baseTheme.bg)
	const darkBase = customDark ? baseTheme.bg : '0B1120'
	// Art-direction owns the canvas + card base; without one we keep the original Aurora look.
	const art = artDirectionFor(spec)
	const panelHex = art ? art.panel(baseTheme, isDark) : (isDark ? '172033' : 'FFFFFF')
	const background = art
		? art.bg(baseTheme, isDark)
		: isDark
		? (customDark
			? gradient([[0, lightenHex(darkBase, 0.16), 0], [0.55, darkBase, 0], [1, darkenHex(darkBase, 0.45), 0]], 115)
			: gradient([[0, '17314D', 0], [0.55, '0B1626', 0], [1, '05080F', 0]], 115))
		: gradient([[0, 'FFFFFF', 0], [0.74, paper, 0], [1, 'E0F2FE', 0]], 15)
	const visualTheme = isDark
		? {
			ink: baseTheme.ink || 'F8FAFC',
			bg: panelHex,
			panel: panelHex,
			muted: 'CBD5E1',
			accent: baseTheme.accent,
			success: accent2,
			warn: accent3,
		}
		: {
			ink: baseTheme.ink,
			bg: art ? panelHex : 'FFFFFF',
			panel: panelHex,
			muted: '475569',
			accent: baseTheme.accent,
			success: accent2,
			warn: accent3,
		}
	const mk = (suffix, box, fill, extra = {}) => {
		const objectName = createObjectName(slide.id, 'visual-system', 'decorative', suffix)
		const resolvedFill = fill
		const resolvedShadow = subtleShadow(extra.shadowOpacity ?? 0.12, extra.shadowBlur ?? 3, extra.shadowDistance ?? 1)
		return {
			slideId: slide.id,
			blockName: 'visual-system',
			blockKind: 'decorative',
			role: 'decorative',
			objectName,
			editHandle: stableHandle('semantic-spec', slide.id, objectName, spec.schemaVersion),
			primitive: 'shape',
			shapeName: extra.shapeName || 'roundRect',
			text: '',
			rect: box,
			style: {
				fill: resolvedFill,
				line: line(extra.lineColor || resolvedFill?.gradientStops?.[0]?.color || resolvedFill?.color || visualTheme.accent, extra.lineTransparency ?? 100, extra.lineWidth || 1),
				...(resolvedShadow ? { shadow: resolvedShadow } : {}),
				rectRadius: extra.rectRadius ?? 0.04,
				color: visualTheme.ink,
			},
			altText: '',
		}
	}
	// Dark precision Worlds use an architectural scaffold: a north-star mark,
	// disciplined edge guides, and a quiet right-stage coordinate system. The
	// scaffold is still opt-in through styleIntent.scaffold/decorations, remains
	// fully native/editable, and is deliberately sparse enough to support rather
	// than replace the AI-authored composition.
	const precisionScaffold = isDark && ['glass', 'plot', 'outline'].includes(String(art?.card || ''))
	const objects = precisionScaffold
		? [
			mk('north-star', rect(0.30, 0.24, 0.46, 0.46, 'decorative'), { color: visualTheme.warn, transparency: 90 }, { shapeName: 'star4', lineColor: visualTheme.warn, lineTransparency: 4, lineWidth: 1.15, shadowOpacity: 0.06 }),
			mk('left-guide', rect(0.49, 1.08, 0.018, Math.max(0.8, slideSize.h - 2.02), 'decorative'), { color: visualTheme.accent, transparency: 48 }, { shapeName: 'rect', lineTransparency: 100, shadowOpacity: 0 }),
			mk('accent-band', rect(0.68, 1.19, 1.28, 0.035, 'decorative'), gradient([[0, visualTheme.warn, 0], [1, visualTheme.accent, 0]], 0), { shapeName: 'rect', lineTransparency: 100, shadowOpacity: 0.08 }),
			mk('bottom-guide', rect(0.49, Math.max(0.4, slideSize.h - 0.56), Math.max(1, slideSize.w - 1.34), 0.018, 'decorative'), { color: visualTheme.accent, transparency: 62 }, { shapeName: 'rect', lineTransparency: 100, shadowOpacity: 0 }),
			mk('stage-axis-v', rect(Math.max(0.6, slideSize.w - 1.88), 1.10, 0.015, Math.max(0.7, slideSize.h - 2.24), 'decorative'), { color: visualTheme.accent, transparency: 72 }, { shapeName: 'rect', lineTransparency: 100, shadowOpacity: 0 }),
			mk('stage-axis-h', rect(Math.max(0.6, slideSize.w - 3.08), 2.84, 2.42, 0.015, 'decorative'), { color: visualTheme.accent, transparency: 72 }, { shapeName: 'rect', lineTransparency: 100, shadowOpacity: 0 }),
			mk('stage-ring', rect(Math.max(0.6, slideSize.w - 2.62), 1.72, 1.48, 1.48, 'decorative'), { color: visualTheme.bg, transparency: 100 }, { shapeName: 'ellipse', lineColor: visualTheme.accent, lineTransparency: 70, lineWidth: 0.85, shadowOpacity: 0 }),
			mk('decision-node', rect(Math.max(0.6, slideSize.w - 0.79), 2.75, 0.13, 0.13, 'decorative'), { color: visualTheme.warn, transparency: 0 }, { shapeName: 'ellipse', lineColor: visualTheme.warn, lineTransparency: 0, lineWidth: 0.5, shadowOpacity: 0.18, shadowBlur: 4 }),
		]
		: [
			mk('accent-band', rect(0.58, 1.22, 2.18, 0.09, 'decorative'), gradient([[0, visualTheme.accent, 0], [1, visualTheme.success, 0]], 0), { shadowOpacity: 0.1 }),
			mk('right-rail', rect(Math.max(0, slideSize.w - 0.34), 0.62, 0.12, Math.max(0.5, slideSize.h - 1.34), 'decorative'), gradient([[0, visualTheme.success, 4], [1, visualTheme.accent, 0]], 90), { shadowOpacity: 0.13 }),
			mk('proof-tile', rect(Math.max(0, slideSize.w - 2.55), Math.max(0, slideSize.h - 1.08), 1.44, 0.28, 'decorative'), gradient([[0, visualTheme.warn, 8], [1, visualTheme.accent, 18]], 0), { shadowOpacity: 0.08, rectRadius: 0.08 }),
		]
	return { background, theme: visualTheme, objects, tone: isDark ? 'dark' : 'light', art, headFontFace: art?.headFontFace, bodyFontFace: art?.bodyFontFace }
}

function wantsExplicitSlideDesign(spec, slide) {
	const values = [
		spec?.styleIntent?.visualSystem,
		spec?.styleIntent?.layoutMode,
		spec?.styleIntent?.composition,
		slide?.visualSystem,
		slide?.layoutMode,
		slide?.composition,
	].map(value => String(value || '').toLowerCase())
	return slide?.decorations === false ||
		slide?.scaffold === false ||
		values.some(value => /\b(explicit|canvas|absolute|manual|no-scaffold|no decorations|no-decorations)\b/.test(value))
}

// json-spec authoring is author-driven: the AI client owns the composition via
// the spec. The engine's decorative scaffold (accent band / rail / proof tile)
// is therefore OPT-IN, not forced. Without this, every deck shared one fixed
// skin regardless of what the AI authored. The AI opts in with
// styleIntent.scaffold:true (or "assisted"/"auto-design"/"polished" visualSystem,
// or per-slide decorations/scaffold:true) when it wants the engine to add polish.
function wantsAutoScaffold(spec = {}, slide = {}) {
	if (slide.decorations === true || slide.scaffold === true) return true
	if (slide.decorations === false || slide.scaffold === false) return false
	const flags = [spec?.styleIntent?.scaffold, spec?.styleIntent?.autoDesign, spec?.styleIntent?.decorations, slide?.styleIntent?.scaffold]
	if (flags.some(value => value === true)) return true
	if (flags.some(value => value === false)) return false
	const systems = [spec?.styleIntent?.visualSystem, spec?.styleIntent?.composition, slide?.composition]
		.map(value => String(value || '').toLowerCase())
	if (systems.some(value => /\b(scaffold|assisted|auto-?design|designed|template|polished)\b/.test(value))) return true
	return false
}

function normalizeBackground(background) {
	if (!background) return null
	if (typeof background === 'string') return { color: background }
	if (typeof background === 'object') return background
	return null
}

export function createObjectName(slideId, blockName, role, itemName = null) {
	const safeSlide = String(slideId || 'slide').replace(/[^A-Za-z0-9._:-]/g, '-')
	const safeBlock = String(blockName || 'block').replace(/[^A-Za-z0-9._:-]/g, '-')
	const safeRole = String(role || 'object').replace(/[^A-Za-z0-9._:-]/g, '-')
	const suffix = itemName ? `.${String(itemName).replace(/[^A-Za-z0-9._:-]/g, '-')}` : ''
	return `${safeSlide}.${safeBlock}.${safeRole}${suffix}`
}

// M6: PowerPoint-faithful text metrics, calibrated from PowerPoint's own layout via COM
// BoundWidth/BoundHeight (see ir/text-metrics-calibration.json). lineHeight 1.20 matches
// PPT single-spacing (the old 1.16 UNDER-counted height -> could miss overflow); per-font
// width factors are the measured BoundWidth/char ratios (+~5% safety) so the estimator
// stays conservative without over-shrinking.
const TEXT_METRICS = {
	lineHeightFactor: 1.20,
	defaultWidthFactor: 0.50,
	widthFactorByFont: { 'segoe ui': 0.50, 'calibri': 0.46, 'aptos': 0.48, 'arial': 0.50, 'georgia': 0.50, 'consolas': 0.58, 'times new roman': 0.46 },
}
function textWidthFactor(fontFace) {
	return TEXT_METRICS.widthFactorByFont[String(fontFace || '').toLowerCase()] || TEXT_METRICS.defaultWidthFactor
}

function numericTextMargin(margin, fallback = 0.08) {
	if (Number.isFinite(Number(margin))) return Math.max(0, Number(margin))
	if (Array.isArray(margin)) {
		const values = margin.map(Number).filter(Number.isFinite)
		if (values.length) return Math.max(0, ...values)
	}
	return fallback
}

function estimatedWrappedLineCount(paragraph, availableWidthPt, size, widthFactor, charSpacing = 0) {
	const text = String(paragraph || '')
	if (!text) return 1
	const glyphWidth = Math.max(0.1, size * widthFactor + Math.max(0, Number(charSpacing) || 0))
	const spaceWidth = glyphWidth
	const words = text.split(/\s+/).filter(Boolean)
	if (!words.length) return 1
	let lines = 1
	let used = 0
	for (const word of words) {
		const wordWidth = word.length * glyphWidth
		if (wordWidth > availableWidthPt) {
			if (used > 0) { lines += 1; used = 0 }
			const hardLines = Math.max(1, Math.ceil(wordWidth / availableWidthPt))
			lines += hardLines - 1
			used = wordWidth - availableWidthPt * (hardLines - 1)
			continue
		}
		const next = used > 0 ? used + spaceWidth + wordWidth : wordWidth
		if (next <= availableWidthPt + 0.01) used = next
		else { lines += 1; used = wordWidth }
	}
	return lines
}

export function estimateTextFit({ text = '', rect: box, fontSize = 16, minFontSize = MIN_FONT_SIZE, margin = 0.08, lineHeight = TEXT_METRICS.lineHeightFactor, fontFace = null, charSpacing = 0, bullet = false }) {
	const normalized = Array.isArray(text)
		? text.map(item => item?.text || '').join('\n')
		: String(text || '')
	const paragraphs = normalized.replace(/\r\n?/g, '\n').split('\n').map(s => s.trim())
	const resolvedMargin = numericTextMargin(margin)
	const bulletInset = bullet ? 0.22 : 0
	const usableW = Math.max(0.1, (box?.w || 1) - resolvedMargin * 2 - bulletInset)
	const usableH = Math.max(0.1, (box?.h || 1) - resolvedMargin * 2)
	const widthFactor = textWidthFactor(fontFace)
	function measure(size) {
		let lines = 0
		for (const p of paragraphs.length ? paragraphs : ['']) {
			lines += estimatedWrappedLineCount(p, usableW * 72, size, widthFactor, charSpacing)
		}
		const height = lines * size * lineHeight / 72
		return { size, lines, height, usableWidthIn: usableW, usableHeightIn: usableH, fits: height <= usableH + 0.001 }
	}
	let current = measure(fontSize)
	if (current.fits) return { ...current, requestedFontSize: fontSize, fontSize, overflow: false, truncated: false }
	let chosen = current
	for (let size = fontSize - 1; size >= minFontSize; size -= 1) {
		const candidate = measure(size)
		chosen = candidate
		if (candidate.fits) break
	}
	return {
		...chosen,
		requestedFontSize: fontSize,
		fontSize: chosen.size,
		overflow: !chosen.fits,
		truncated: false,
	}
}

export function estimateRichTextFit({ runs = [], rect: box, margin = 0.08, fontFace = null, lineHeight = TEXT_METRICS.lineHeightFactor }) {
	const resolvedMargin = numericTextMargin(margin)
	const usableW = Math.max(0.1, (box?.w || 1) - resolvedMargin * 2)
	const usableH = Math.max(0.1, (box?.h || 1) - resolvedMargin * 2)
	const flattened = []
	for (const source of runs.length ? runs : [{ text: '', options: { fontSize: 16 } }]) {
		const options = { ...(source?.options || {}) }
		const parts = String(source?.text || '').replace(/\r\n?/g, '\n').split('\n')
		parts.forEach((text, index) => flattened.push({ text, options: { ...options, breakLine: index < parts.length - 1 || options.breakLine === true } }))
	}
	const paragraphs = []
	let paragraph = []
	for (let index = 0; index < flattened.length; index += 1) {
		const run = flattened[index]
		const previous = flattened[index - 1]
		const startsParagraph = paragraph.length > 0 && (run.options?.bullet || (run.options?.align && run.options.align !== previous?.options?.align))
		if (startsParagraph) { paragraphs.push(paragraph); paragraph = [] }
		paragraph.push(run)
		if (run.options?.breakLine) { paragraphs.push(paragraph); paragraph = [] }
	}
	if (paragraph.length) paragraphs.push(paragraph)
	let lines = 0
	let height = 0
	let smallestFontSize = Infinity
	let largestFontSize = 0
	for (const para of paragraphs.length ? paragraphs : [[{ text: '', options: { fontSize: 16 } }]]) {
		let usedWidthPt = 0
		let lineMaxSize = 0
		const finishLine = () => {
			lines += 1
			height += Math.max(1, lineMaxSize) * lineHeight / 72
			usedWidthPt = 0
			lineMaxSize = 0
		}
		for (const run of para) {
			const size = Math.max(1, Number(run?.options?.fontSize || 16))
			const glyphWidth = Math.max(0.1, size * textWidthFactor(run?.options?.fontFace || fontFace) + Math.max(0, Number(run?.options?.charSpacing) || 0))
			smallestFontSize = Math.min(smallestFontSize, size)
			largestFontSize = Math.max(largestFontSize, size)
			const words = String(run?.text || '').split(/\s+/).filter(Boolean)
			if (!words.length) lineMaxSize = Math.max(lineMaxSize, size)
			for (const word of words) {
				const wordWidthPt = word.length * glyphWidth
				const prefixWidthPt = usedWidthPt > 0 ? glyphWidth : 0
				if (wordWidthPt + prefixWidthPt <= usableW * 72 - usedWidthPt + 0.01) {
					usedWidthPt += prefixWidthPt + wordWidthPt
					lineMaxSize = Math.max(lineMaxSize, size)
					continue
				}
				if (usedWidthPt > 0) finishLine()
				const hardLines = Math.max(1, Math.ceil(wordWidthPt / (usableW * 72)))
				for (let split = 1; split < hardLines; split += 1) {
					lineMaxSize = size
					finishLine()
				}
				usedWidthPt = wordWidthPt - (hardLines - 1) * usableW * 72
				lineMaxSize = size
			}
		}
		finishLine()
	}
	return {
		requestedFontSize: largestFontSize,
		fontSize: Number.isFinite(smallestFontSize) ? smallestFontSize : 0,
		lines,
		height,
		usableWidthIn: usableW,
		usableHeightIn: usableH,
		fits: height <= usableH + 0.001,
		overflow: height > usableH + 0.001,
		truncated: false,
	}
}

function textOverflowFinding({ slideId, objectName, fit, rect, text, minFontSize = MIN_FONT_SIZE, message = 'Text may overflow at minimum font size.' }) {
	const normalized = Array.isArray(text)
		? text.map(item => item?.text || '').join('\n')
		: String(text || '')
	return {
		code: 'TEXT_OVERFLOW_RISK',
		severity: 'warning',
		slideId,
		objectName,
		message,
		reason: 'The engine could not fit the semantic copy inside its solved text box even at the configured minimum font size.',
		fix: 'Shorten or split the semantic copy, reduce competing content, or choose a fit-friendly layoutIntent; never patch a rectangle.',
		evidence: {
			textCharacters: normalized.length,
			requestedFontSize: Number(fit?.requestedFontSize || 0),
			resolvedFontSize: Number(fit?.fontSize || 0),
			minimumFontSize: Number(minFontSize || 0),
			lineCount: Number(fit?.lines || 0),
			estimatedHeightIn: round(Number(fit?.height || 0)),
			availableHeightIn: round(Number(fit?.usableHeightIn ?? rect?.h ?? 0)),
			fits: fit?.fits === true,
		},
	}
}

function readabilityRoleForBlock(block = {}, slideIndex = 0) {
	const kind = String(block.kind || '').trim().toLowerCase()
	const role = String(block.role || block.style?.role || block.options?.role || '').trim().toLowerCase()
	const name = String(block.name || block.objectName || '').trim().toLowerCase()
	const signal = `${kind} ${role} ${name}`
	if (/(?:^|[.\s_-])(?:footer|metadata|eyebrow|source|citation|slide[-_ ]?number)(?:$|[.\s_-])/.test(signal)) return 'metadata'
	if (/(?:^|[.\s_-])(?:subtitle|subhead|section[-_ ]?heading|callout[-_ ]?header)(?:$|[.\s_-])/.test(signal)) return 'subheading'
	if (kind === 'title' || role === 'title' || /^(?:deck[\s_-]?title|slide[\s_-]?title|title)$/.test(name)) return slideIndex === 0 ? 'deckTitle' : 'slideTitle'
	if (['smartart', 'diagram', 'process', 'timeline'].includes(kind) || /diagram[-_ ]?label/.test(signal)) return 'diagramLabel'
	if (['chart', 'chart-panel', 'stat', 'kpi', 'metric-grid'].includes(kind) || /data[-_ ]?label/.test(signal)) return 'dataLabel'
	if (kind === 'table' || kind === 'table-panel' || /table[-_ ]?cell/.test(signal)) return 'tableCell'
	return 'body'
}

function readabilityFloorForBlock(block = {}, slideIndex = 0) {
	const role = readabilityRoleForBlock(block, slideIndex)
	return { role, floorPt: Number(READABILITY_TYPE_FLOORS_PT[role] || READABILITY_TYPE_FLOORS_PT.body) }
}

function smallTextReadabilityFinding({ slideId, objectName, role, floorPt, requestedFontSize, resolvedFontSize, source = 'semantic-block' }) {
	return {
		code: 'SMALL_TEXT_READABILITY_RISK',
		severity: 'warning',
		slideId,
		objectName,
		message: `Text resolves to ${Number(resolvedFontSize)}pt, below the ${Number(floorPt)}pt presentation-size floor for ${role}.`,
		reason: 'The submitted semantic style or fitted result is smaller than the public readability floor for its role, so package validity cannot establish projection comfort.',
		fix: 'Shorten or split the copy, choose a clearer semantic layout, or use a larger role-appropriate size; do not shrink important text merely to make it fit.',
		evidence: { role, floorPt: Number(floorPt), requestedFontSize: Number(requestedFontSize), resolvedFontSize: Number(resolvedFontSize), source },
	}
}

function offSlideFinding({ slideId, object, rect, slideSize, tolerated, allowOffSlide, aiAuthoredGeometry = false }) {
	const left = Math.max(0, -Number(rect?.x || 0))
	const top = Math.max(0, -Number(rect?.y || 0))
	const right = Math.max(0, Number(rect?.x || 0) + Number(rect?.w || 0) - Number(slideSize?.w || 0))
	const bottom = Math.max(0, Number(rect?.y || 0) + Number(rect?.h || 0) - Number(slideSize?.h || 0))
	const intentionalBleed = object?.bleed === true
	return {
		code: 'OFF_SLIDE_OBJECT',
		severity: tolerated ? 'warning' : 'error',
		slideId,
		objectName: object?.objectName,
		message: intentionalBleed
			? 'Decorative bleed: this element intentionally extends past the slide edge.'
			: aiAuthoredGeometry
				? 'AI-authored geometry extends beyond the slide canvas.'
			: allowOffSlide
				? 'Source geometry extends beyond the slide and is preserved for round-trip fidelity.'
				: 'This substantive object extends beyond the slide canvas.',
		reason: intentionalBleed
			? 'The object is marked as intentional decorative bleed, so the extension is preserved as a non-blocking advisory.'
			: aiAuthoredGeometry
				? 'The explicit AI rectangle is outside the current slide canvas, so part of the authored object may be clipped.'
			: allowOffSlide
				? 'Uploaded/source geometry is outside the canvas and is being preserved for round-trip fidelity.'
				: 'The engine solved or received a substantive object outside the slide canvas, so part of its content may be clipped.',
		fix: intentionalBleed
			? 'Keep the bleed only when it is an intentional decorative treatment; otherwise mark the visual semantic region so the engine can keep it on-canvas.'
			: aiAuthoredGeometry
				? 'Keep the authored rectangle on-canvas, or mark the object bleed:true when the extension is an intentional decorative treatment; the engine will not move it.'
			: allowOffSlide
				? 'For a new semantic authoring pass, remove authored geometry and choose a supported layoutIntent or region; preserve source geometry only for faithful re-editing.'
				: 'Remove authored geometry and choose a supported layoutIntent or semantic region so the engine can keep the object inside the canvas.',
		evidence: {
			edges: { left: round(left), right: round(right), top: round(top), bottom: round(bottom) },
			slideSize: { w: round(Number(slideSize?.w || 0)), h: round(Number(slideSize?.h || 0)) },
			allowed: tolerated,
			decorativeBleed: intentionalBleed,
			placementSource: object?.placementSource || null,
		},
	}
}

function contentBandForPresenterZone(zone, slideWidth, margin = DEFAULT_MARGIN) {
	if (!zone || !Number.isFinite(Number(zone.x0)) || !Number.isFinite(Number(zone.x1))) return null
	// A fixed lower-corner Record Studio presenter does not consume the whole
	// right side. Region-level exclusion below keeps the upper-right canvas
	// available while protecting only the actual presenter window.
	if (zone.lowerOnly === true) return null
	const x0 = Number(zone.x0)
	const x1 = Number(zone.x1)
	const gap = GAP
	const midpoint = slideWidth / 2
	if (x0 >= midpoint - 0.05) {
		const right = Math.min(slideWidth - margin, x0 - gap)
		return right - margin > 0.5 ? { x: margin, w: right - margin } : null
	}
	if (x1 <= midpoint + 0.05) {
		const left = Math.max(margin, x1 + gap)
		return slideWidth - margin - left > 0.5 ? { x: left, w: slideWidth - margin - left } : null
	}
	return null
}

function presenterZoneForSlide(slide = {}) {
	if (slide?.presenterZone && typeof slide.presenterZone === 'object') return slide.presenterZone
	if (slide?.avatarNarration && typeof slide.avatarNarration === 'object' && slide.avatarNarration.enabled !== false) {
		return NATIVE_RECORD_STUDIO_PRESENTER_ZONE
	}
	return null
}

function lowerPresenterZone(zone) {
	if (!zone || zone.lowerOnly !== true) return null
	const x0 = Number(zone.x0)
	const y0 = Number(zone.y0)
	const x1 = Number(zone.x1)
	const y1 = Number(zone.y1)
	return [x0, y0, x1, y1].every(Number.isFinite) ? { x0, y0, x1, y1 } : null
}

function applyLowerPresenterExclusion(regions, zone) {
	const presenter = lowerPresenterZone(zone)
	if (!presenter) return regions
	const safeX = presenter.x0 - GAP
	const safeY = presenter.y0 - GAP
	for (const [name, value] of Object.entries(regions)) {
		if (!value || typeof value !== 'object' || ![value.x, value.y, value.w, value.h].every(v => Number.isFinite(Number(v)))) continue
		const r = value
		const overlapsX = r.x < presenter.x1 && r.x + r.w > presenter.x0
		const overlapsY = r.y < presenter.y1 && r.y + r.h > presenter.y0
		if (!overlapsX || !overlapsY) continue
		if (['footer', 'protectedFooter', 'caption'].includes(name) || ['footer', 'caption'].includes(String(r.role || ''))) {
			regions[name] = rect(r.x, r.y, Math.max(0.5, Math.min(r.w, safeX - r.x)), r.h, r.role)
			continue
		}
		if (r.y < safeY) {
			regions[name] = rect(r.x, r.y, r.w, Math.max(0.45, Math.min(r.h, safeY - r.y)), r.role)
			continue
		}
		regions[name] = rect(r.x, r.y, Math.max(0.5, Math.min(r.w, safeX - r.x)), r.h, r.role)
	}
	return regions
}

function contentUsesTitleBand(content, intent) {
	if (['title-only', 'hero', 'pull-quote', 'section-divider'].includes(String(intent || ''))) return true
	return (Array.isArray(content) ? content : []).some(block => {
		const kind = String(block?.kind || '').toLowerCase()
		return kind === 'title' || kind === 'quote'
	})
}

function regionCatalog(intent, slideSize = WIDE_SLIDE, templateContract = null, margin = DEFAULT_MARGIN, presenterZone = null, arrange = null, options = {}) {
	const w = slideSize.w
	const h = slideSize.h
	const m = margin || DEFAULT_MARGIN
	const contentBand = contentBandForPresenterZone(presenterZone, w, m)
	const contentX = contentBand?.x ?? m
	const contentW = contentBand?.w ?? (w - m * 2)
	const compactTitle = options?.compactTitle === true
	const kickerHeader = options?.kickerHeader === true
	let title = rect(contentX, 0.42, contentW, (compactTitle ? 0.08 : TITLE_H) + (kickerHeader ? 0.52 : 0), 'title')
	let footer = rect(contentX, h - 0.52, contentW, FOOTER_H, 'footer')
	// Engine auto-flow gives a semantic title a 0.90in proposal (larger than the
	// compact title-region token). Reserve against that actual authored-by-engine
	// height plus a visible breathing gap so a body image/text block can never
	// collide with the title at the boundary. This is shared composition policy,
	// not a client coordinate. When the author put the headline in a column
	// instead of kind:title, do not keep an empty title band.
	const bodyTop = compactTitle ? 0.48 : title.y + Math.max(title.h, 0.9) + 0.25
	// Narration is native audio, speaker notes, cues, and timing. Authoring
	// Excellence does not create a visible caption lane or reserve dead space for
	// one; ordinary semantic content owns the full safe body band.
	const lowerPresenter = lowerPresenterZone(presenterZone)
	const bodyBottom = Math.min(
		h - 0.7,
		lowerPresenter ? lowerPresenter.y0 - GAP : Number.POSITIVE_INFINITY,
	)
	let body = rect(contentX, bodyTop, contentW, bodyBottom - bodyTop, 'body')
	const halfW = (body.w - GAP) / 2
	const thirdW = (body.w - GAP * 2) / 3
	// Asymmetric proof-led compositions are still semantic regions.  They are
	// derived from the same body box and gap as the balanced columns, so a
	// rightTwoThirds proof lane can never overlap the left explanatory lane.
	const oneThirdW = thirdW
	const twoThirdsW = body.w - oneThirdW - GAP
	const regions = {
		title,
		body,
		footer,
		left: rect(body.x, body.y, halfW, body.h, 'left'),
		right: rect(body.x + halfW + GAP, body.y, halfW, body.h, 'right'),
		leftThird: rect(body.x, body.y, thirdW, body.h, 'leftThird'),
		midThird: rect(body.x + thirdW + GAP, body.y, thirdW, body.h, 'midThird'),
		rightThird: rect(body.x + (thirdW + GAP) * 2, body.y, thirdW, body.h, 'rightThird'),
		leftOneThird: rect(body.x, body.y, oneThirdW, body.h, 'leftOneThird'),
		rightTwoThirds: rect(body.x + oneThirdW + GAP, body.y, twoThirdsW, body.h, 'rightTwoThirds'),
		leftTwoThirds: rect(body.x, body.y, twoThirdsW, body.h, 'leftTwoThirds'),
		rightOneThird: rect(body.x + twoThirdsW + GAP, body.y, oneThirdW, body.h, 'rightOneThird'),
		protectedFooter: footer,
	}
	if (intent === 'title-only') regions.body = rect(contentX, 2.45, contentW, 1.4, 'body')
	if (intent === 'section-divider') {
		regions.title = rect(contentX, 2.28, contentW, 0.95, 'title')
		const sectionInset = Math.min(0.8, Math.max(0, (contentW - 1) * 0.08))
		regions.body = rect(contentX + sectionInset, 3.42, Math.max(1, contentW - sectionInset * 2), 0.75, 'body')
	}
	if (intent === 'dense-appendix') {
		regions.title = rect(contentX, 0.28, contentW, 0.45, 'title')
		regions.body = rect(contentX, 0.92, contentW, Math.max(0.5, bodyBottom - 0.92), 'body')
	}
	// M18: hero — a dramatic full-canvas cover with an oversized title anchored in
	// the lower band (poster/magazine feel), subtitle beneath. The background is the
	// world's full-bleed canvas (slideVisualSystem).
	if (intent === 'hero') {
		if (lowerPresenter) {
			// A presenter-bearing hero remains a hero, but its message moves into
			// the clear stage above the native presenter instead of becoming a
			// bottom poster hidden by Record Studio controls. This is presenter
			// geometry protection, not a subtitle-safe lane.
			regions.title = rect(contentX, 1.08, contentW, 1.2, 'title')
			regions.body = rect(contentX, 2.55, contentW, Math.max(1.2, lowerPresenter.y0 - GAP - 2.55), 'body')
		} else {
			regions.title = rect(contentX, h * 0.50, contentW, 1.85, 'title')
			regions.body = rect(contentX, h * 0.50 + 1.78, contentW, 0.85, 'body')
		}
	}
	// M18: pull-quote — a single large centered statement with generous breathing room.
	if (intent === 'pull-quote') {
		regions.title = rect(contentX, 0.5, contentW, 0.5, 'title')
		const quoteInset = Math.min(0.9, Math.max(0, (contentW - 1) * 0.10))
		regions.body = rect(contentX + quoteInset, h * 0.24, Math.max(1, contentW - quoteInset * 2), h * 0.52, 'body')
	}
	// M18: sidebar — an asymmetric split: a narrow rail (label/stats/eyebrow) beside a
	// wide main column (the editorial-grid look). left/right variants per reading order.
	if (intent === 'sidebar-left' || intent === 'sidebar-right') {
		const sbTop = title.y + title.h + 0.35
		const sbH = Math.max(0.5, bodyBottom - sbTop)
		const sidebarW = contentW * 0.30
		const mainW = contentW - sidebarW - GAP
		const left = intent === 'sidebar-left'
		regions.sidebar = rect(left ? contentX : contentX + mainW + GAP, sbTop, sidebarW, sbH, 'sidebar')
		regions.main = rect(left ? contentX + sidebarW + GAP : contentX, sbTop, mainW, sbH, 'main')
	}
	// A semantic split intent owns the relationship between proof and explanation.
	// When the AI also supplies arrange:{split:[...]} it is a weighted balance
	// request, not permission for array-order pre-gridding. Keep the named left /
	// right hosts aligned with the same weights used by engine auto-flow so the
	// recommendation and compiled placement measure the same composition.
	const splitIntents = new Set(['two-column', 'comparison', 'image-left-copy-right', 'copy-left-image-right', 'chart-left-insights-right', 'insights-left-chart-right'])
	const split = Array.isArray(arrange?.split) ? arrange.split.map(Number) : null
	if (splitIntents.has(intent) && split?.length === 2 && splitRatiosAreSafe(split, body.w - GAP)) {
		const sum = split[0] + split[1]
		const width = Math.max(0.01, body.w - GAP)
		const leftW = width * split[0] / sum
		regions.left = rect(body.x, body.y, leftW, body.h, 'left')
		regions.right = rect(body.x + leftW + GAP, body.y, width - leftW, body.h, 'right')
	}
	if (templateContract?.placeholders?.length) {
		regions.placeholderBinding = 'contract-aware'
	} else {
		regions.placeholderBinding = 'geometry-matched-fallback'
	}
	return applyLowerPresenterExclusion(regions, presenterZone)
}

// M19 TEAMWORK — slides[].regionPlan: the AI chooses semantic named regions (the engine
// offers the catalog; the engine still solves every rectangle). The only geometry-bearing
// form is a semantic split request:
//   { split: 'columns'|'rows', names: [...], weights?: [...], area?: 'body'|<region>, gap? }
// A named alias may point at an existing engine region with { area: '<region>', role? }.
// Exact named rectangles are also accepted when the explicit AI-authored geometry
// composition mode is selected.  They still pass through the same finite/positive
// rectangle validation and layout findings as content objects.
function applyRegionPlan(regions, plan, warnings, slideId, options = {}) {
	if (!plan || typeof plan !== 'object') return
	const allowAuthoredGeometry = options.allowAuthoredGeometry === true
	const push = (message, extra = {}) => {
		const { evidence: extraEvidence, ...rest } = extra
		warnings.push({
			code: 'REGION_PLAN_INVALID',
			severity: 'warning',
			slideId,
			message,
			reason: 'The regionPlan does not match the semantic region grammar, so the engine cannot apply the requested named-region relationship safely.',
			fix: 'Use an existing semantic region alias or a columns/rows split with semantic names; never add coordinates or raw rectangles.',
			evidence: { form: typeof plan.split === 'string' ? 'split' : 'aliases', ...(extraEvidence || {}) },
			...rest,
		})
	}
	const rejectGeometry = (name, value) => {
		const hasCoordinates = value && typeof value === 'object' &&
			['x', 'y', 'w', 'h', 'rect', 'bbox'].some(key => Object.prototype.hasOwnProperty.call(value, key))
		if (!hasCoordinates) return false
		if (allowAuthoredGeometry) {
			const source = value.rect || value.bbox || value
			const candidate = explicitRect(source, name, true)
			if (!candidate || !(candidate.w > 0) || !(candidate.h > 0)) {
				warnings.push({
					code: 'REGION_PLAN_GEOMETRY_INVALID',
					severity: 'error',
					slideId,
					region: name,
					message: `regionPlan.${name} must contain finite x/y/w/h values with positive width and height.`,
					reason: 'The AI-authored geometry mode requires every named region rectangle to be explicit and package-safe.',
					fix: 'Provide a finite positive rect or bbox in slide inches. Engine-owned semantic placement is deactivated.',
					evidence: { region: name, received: value },
				})
				return true
			}
			regions[name] = { ...candidate, source: 'author-plan' }
			return true
		}
		warnings.push({
			code: 'REGION_PLAN_GEOMETRY_FORBIDDEN',
			severity: 'error',
			slideId,
			region: name,
			message: `regionPlan.${name} cannot contain x/y/w/h, rect, or bbox; choose a named engine region or semantic split instead.`,
			reason: 'Region plans are semantic labels only and may not replace the required AI-authored object rectangles.',
			fix: 'Replace the coordinate-bearing entry with {area:"body"} or a semantic columns/rows split, then rerun dryRun.',
			evidence: { region: name, forbiddenFields: ['x', 'y', 'w', 'h', 'rect', 'bbox'].filter(key => Object.prototype.hasOwnProperty.call(value, key)) },
			suggestions: [{ area: 'body' }, { split: 'columns', names: ['left', 'right'], weights: [62, 38] }],
		})
		return true
	}
	if (Object.prototype.hasOwnProperty.call(plan, 'split') && typeof plan.split !== 'string') {
		return push('regionPlan.split must be the semantic axis string "columns" or "rows"; use arrange.split for weighted columns.')
	}
	if (typeof plan.split === 'string') {
		const axis = plan.split.trim().toLowerCase()
		if (!['columns', 'rows'].includes(axis)) {
			return push(`regionPlan.split "${plan.split}" is not supported; choose the semantic axis string "columns" or "rows".`)
		}
		const names = Array.isArray(plan.names) ? plan.names.map(n => normalizeRegionName(n) || String(n || '').trim()).filter(Boolean) : []
		if (names.length < 2) return push('regionPlan.split needs names[] with at least two region names.')
		if (new Set(names).size !== names.length) return push('regionPlan.split names[] must contain unique semantic region names.')
		if (plan.weights !== undefined && (!Array.isArray(plan.weights) || plan.weights.length !== names.length || plan.weights.some(value => !Number.isFinite(Number(value)) || Number(value) <= 0))) {
			return push('regionPlan.weights must contain one finite positive number per semantic region name.')
		}
		const weights = Array.isArray(plan.weights) ? plan.weights.map(Number) : names.map(() => 1)
		if (plan.gap !== undefined && (!Number.isFinite(Number(plan.gap)) || Number(plan.gap) < 0)) {
			return push('regionPlan.gap must be a finite non-negative number.')
		}
		const gap = plan.gap === undefined ? GAP : Number(plan.gap)
		const areaName = typeof plan.area === 'string' && plan.area.trim() ? (normalizeRegionName(plan.area) || plan.area.trim()) : 'body'
		const area = regions[areaName]
		if (!area || !Number.isFinite(Number(area.x))) {
			return push(`regionPlan.area "${areaName}" is not a region on this slide.`, {
				suggestions: Object.keys(regions).filter(k => regions[k] && Number.isFinite(Number(regions[k].x))),
			})
		}
		const sum = weights.reduce((a, c) => a + c, 0)
		let cursor = axis === 'columns' ? area.x : area.y
		const span = (axis === 'columns' ? area.w : area.h) - gap * (names.length - 1)
		if (!(span > 0.02)) return push(`regionPlan.gap leaves no usable ${axis === 'columns' ? 'column' : 'row'} span in area "${areaName}".`)
		const sizes = weights.map(weight => span * (weight / sum))
		if (sizes.some(size => !(size > 0.01))) return push('regionPlan weights must give every semantic region at least 0.01in of engine-owned space.')
		names.forEach((name, i) => {
			const size = sizes[i]
			regions[name] = axis === 'columns'
				? rect(cursor, area.y, size, area.h, name)
				: rect(area.x, cursor, area.w, size, name)
			cursor += size + gap
		})
		return
	}
	for (const [name, value] of Object.entries(plan)) {
		if (name === 'version') continue
		const normalizedName = normalizeRegionName(name) || name
		if (rejectGeometry(normalizedName, value)) continue
		const r = value && typeof value === 'object' ? value : null
		const areaName = typeof r?.area === 'string' && r.area.trim() ? (normalizeRegionName(r.area) || r.area.trim()) : null
		if (!areaName) {
			push(`regionPlan.${normalizedName} must choose an existing semantic region with {area:"..."} (or use the split form).`)
			continue
		}
		const area = regions[areaName]
		if (!area || !Number.isFinite(Number(area.x))) {
			push(`regionPlan.${normalizedName}.area "${areaName}" is not a region on this slide.`, {
				suggestions: Object.keys(regions).filter(k => regions[k] && Number.isFinite(Number(regions[k].x))),
			})
			continue
		}
		const semanticName = String(normalizedName).trim()
		if (!semanticName) {
			push('regionPlan aliases must use a non-empty semantic name.')
			continue
		}
		regions[semanticName] = { ...area, role: r.role || semanticName, source: 'author-plan' }
	}
}

function isFooterBlock(block) {
	const name = String(block?.name || block?.objectName || '').toLowerCase()
	return block?.kind === 'footer' || /(^|[-_.])footer($|[-_.])/.test(name)
}

function isKickerBlock(block) {
	const name = String(block?.name || block?.objectName || '').toLowerCase()
	return name === 'kicker' || name.endsWith('-kicker')
}

function contentHasKickerHeader(content) {
	const items = Array.isArray(content) ? content : []
	const titleAt = items.findIndex(item => String(item?.kind || '').toLowerCase() === 'title' && !blockNamedRegion(item))
	if (titleAt < 0) return false
	return items.slice(0, titleAt).some(isKickerBlock)
}

function isColumnSpanBand(block) {
	const kind = String(block?.kind || '').toLowerCase()
	if (!block || kind === 'title' || isFooterBlock(block) || isKickerBlock(block)) return false
	const named = blockNamedRegion(block)
	if (named === 'left' || named === 'right') return false
	if (isHairlineShape(block)) return true
	if (['stat', 'kpi', 'chart-panel', 'chart', 'customgeometry', 'htmlsketch', 'textshape', 'equation', 'shape'].includes(kind)) return false
	return kind === 'body' || kind === 'text' || kind === 'textbox'
}

function isHairlineShape(block) {
	if (String(block?.kind || '').toLowerCase() !== 'shape') return false
	if (block?.hairline === true) return true
	return /^(rule|divider|hairline)(-|$)/i.test(String(block?.name || block?.objectName || ''))
}

function compactTypeHostRect(block, host) {
	if (!host || !block || String(block.stackGroup || '').trim() || block?.clusterHost === true) return null
	const kind = String(block.kind || '').toLowerCase()
	const role = String(block.role || '')
	const chars = semanticStackText(block).trim().length
	let maxH = null
	if (role === 'headline' || kind === 'title') maxH = Math.min(2.45, Math.max(1.28, 0.78 + chars / 26))
	else if (kind === 'textbox' && (role === 'headline' || chars < 90)) maxH = Math.min(2.7, Math.max(1.35, 0.88 + chars / 24))
	else if (kind === 'stat' || kind === 'kpi') maxH = 2.35
	else if (kind === 'equation') maxH = 1.22
	else if ((kind === 'body' || kind === 'text') && chars <= 90) maxH = Math.min(1.7, Math.max(0.72, 0.48 + chars / 42))
	if (maxH == null || host.h <= maxH + 0.28) return null
	const h = Math.min(maxH, host.h)
	return rect(host.x, host.y + Math.max(0, (host.h - h) / 2), host.w, h, 'compact-type')
}

function blockIdentity(block) {
	return `${String(block?.kind || '').toLowerCase()}|${String(block?.name || block?.objectName || '').toLowerCase()}|${String(block?.text || block?.value || '').slice(0, 80)}`
}

function stackRectFor(map, block) {
	if (!map || !block) return null
	if (map.has(block)) return map.get(block)
	const key = blockIdentity(block)
	for (const [item, rect] of map.entries()) {
		if (blockIdentity(item) === key) return rect
	}
	const name = String(block?.name || block?.objectName || '').trim()
	if (!name) return null
	for (const [item, rect] of map.entries()) {
		if (String(item?.name || item?.objectName || '').trim() === name) return rect
	}
	return null
}

function twoColumnSpanBands(content, regions) {
	const items = Array.isArray(content) ? content : []
	const columned = items.filter(item => {
		const named = blockNamedRegion(item)
		return named === 'left' || named === 'right'
	})
	const firstCol = items.findIndex(item => columned.includes(item))
	let lastCol = -1
	for (let i = items.length - 1; i >= 0; i -= 1) {
		if (columned.includes(items[i])) {
			lastCol = i
			break
		}
	}
	const bands = items.filter(isColumnSpanBand)
	const opening = firstCol >= 0 ? bands.filter(item => items.indexOf(item) < firstCol) : bands
	const closing = lastCol >= 0 ? bands.filter(item => items.indexOf(item) > lastCol) : []
	const openingH = opening.length
		? (opening.every(isHairlineShape) ? 0.14 : Math.min(0.9, 0.52 + 0.32 * (opening.length - 1)))
		: 0
	const closingH = closing.length ? Math.max(0.72, Math.min(1.1, 0.62 + 0.32 * (closing.length - 1))) : 0
	const y = Number(regions.body?.y || regions.left?.y || 0) + openingH
	const h = Math.max(0.5, Number(regions.body?.h || regions.left?.h || 0) - openingH - closingH)
	const leftSrc = regions.left || regions.body
	const rightSrc = regions.right || regions.body
	const openingKeys = new Set(opening.map(blockIdentity))
	const closingKeys = new Set(closing.map(blockIdentity))
	return {
		opening,
		closing,
		openingKeys,
		closingKeys,
		owns(block, which) {
			const key = blockIdentity(block)
			return which === 'opening' ? openingKeys.has(key) : closingKeys.has(key)
		},
		left: rect(leftSrc.x, y, leftSrc.w, h, 'left'),
		right: rect(rightSrc.x, y, rightSrc.w, h, 'right'),
		openingRect: openingH ? rect(regions.body.x, regions.body.y, regions.body.w, openingH, 'span-opening') : null,
		closingRect: closingH ? rect(regions.body.x, regions.body.y + regions.body.h - closingH, regions.body.w, closingH, 'span-closing') : null,
	}
}

function semanticStackText(block) {
	const value = block?.text ?? block?.label ?? block?.value ?? ''
	if (Array.isArray(value)) return value.map(item => typeof item === 'object' ? item?.text || '' : String(item || '')).join(' ')
	return String(value || '')
}

function semanticStackRank(block) {
	const kind = String(block?.kind || '').toLowerCase()
	if (block?.role === 'headline' || kind === 'title') return 5
	if (kind === 'equation') return 10
	if (['kpi', 'stat', 'metric'].includes(kind)) return 20
	if (['body', 'text', 'textbox', 'textshape', 'quote', 'bullets'].includes(kind)) return 30
	if (kind === 'chart-panel' || kind === 'chart' || kind === 'customgeometry') return 40
	if (kind === 'callout') return 90
	return 50
}

function semanticStackWeight(block) {
	const kind = String(block?.kind || '').toLowerCase()
	if (kind === 'chart-panel' || kind === 'chart' || kind === 'customgeometry') return 3.4
	if (block?.role === 'headline' || kind === 'title') return 0.72
	if (kind === 'equation') return 0.85
	if (kind === 'shape') return 0.95
	if (kind === 'callout') return 0.60
	if (block?.role === 'cluster') return 1.55
	if (kind === 'wordart') return 0.85
	if (kind === 'text3d') return 1.0
	if (kind === 'textshape') return 1.15
	if (['body', 'text', 'textbox', 'quote', 'bullets'].includes(kind)) return 1.65
	return 1
}

function semanticStackMaxHeight(block, stackRole = '') {
	const kind = String(block?.kind || '').toLowerCase()
	const chars = semanticStackText(block).trim().length
	if (isHairlineShape(block)) return 0.08
	if (String(block?.role || '') === 'cluster') {
		const members = Array.isArray(block.members) ? block.members : []
		if (members.some(item => String(item?.kind || '').toLowerCase() === 'shape' && item?.clusterHost !== true && !isHairlineShape(item))) {
			return Number.POSITIVE_INFINITY
		}
		return 1.92
	}
	if (stackRole === 'html-cluster') {
		if (block?.clusterHost === true) return Number.POSITIVE_INFINITY
		if (kind === 'shape') return 1.12
		if (block?.role === 'headline' || kind === 'title' || kind === 'textbox') return chars <= 24 ? 0.46 : 0.72
		if (kind === 'textshape' && chars > 20) return Math.min(1.28, Math.max(0.92, 0.70 + chars / 80))
		if (['body', 'text'].includes(kind) && chars > 20) return Math.min(1.15, Math.max(0.88, 0.62 + chars / 80))
		if (chars <= 8) return 0.52
		if (chars <= 20) return 0.58
		return 0.92
	}
	if (kind === 'chart-panel' || kind === 'chart' || kind === 'customgeometry') return Number.POSITIVE_INFINITY
	if (block?.role === 'headline' || kind === 'title') return 1.35
	if (kind === 'callout') return chars > 100 ? 1.10 : chars > 72 ? 0.94 : 0.78
	if (kind === 'equation') return 1.08
	if (kind === 'wordart') return 1.18
	if (kind === 'text3d') return 1.30
	if (kind === 'textshape') return Math.min(1.80, Math.max(1.05, 0.82 + chars / 72))
	if (['body', 'text', 'textbox', 'quote'].includes(kind) && chars <= 260) return Math.min(2.55, Math.max(1.35, 0.98 + chars / 98))
	return Number.POSITIVE_INFINITY
}

function semanticStackRects(items, lane, { sortByKind = true, role = 'semantic-stack' } = {}) {
	const result = new Map()
	if (!lane || !Array.isArray(items) || !items.length) return result
	const ordered = sortByKind
		? [...items].sort((a, b) => semanticStackRank(a) - semanticStackRank(b)
			|| String(a?.name || a?.objectName || '').localeCompare(String(b?.name || b?.objectName || '')))
		: [...items]
	if (ordered.length === 1) {
		if (isHairlineShape(ordered[0])) {
			result.set(ordered[0], rect(lane.x, lane.y, lane.w, Math.min(0.08, lane.h), `${role}-hairline`))
			return result
		}
		const compact = compactTypeHostRect(ordered[0], lane)
		result.set(ordered[0], compact || lane)
		return result
	}
	const packLane = role === 'html-cluster'
		? inset(lane, Math.min(0.14, Math.max(0.08, Number(lane.w || 0) * 0.035)))
		: lane
	const desiredGap = role === 'html-cluster'
		? 0.10
		: GAP + (ordered.some(item => String(item?.kind || '').toLowerCase() === 'callout') ? 0.12 : 0)
	const gap = Math.min(desiredGap, Math.max(role === 'html-cluster' ? 0.08 : 0.10, packLane.h / Math.max(8, ordered.length * 6)))
	const available = Math.max(0.5, packLane.h - gap * (ordered.length - 1))
	const weights = ordered.map(semanticStackWeight)
	const totalWeight = weights.reduce((sum, value) => sum + value, 0)
	const minRow = role === 'html-cluster' ? 0.26 : 0.45
	let heights = weights.map((value, index) => Math.min(
		available * value / Math.max(0.01, totalWeight),
		semanticStackMaxHeight(ordered[index], role),
	))
	if (role !== 'html-cluster' && heights.some((value, index) => value < minRow && !isHairlineShape(ordered[index]))) {
		heights = ordered.map((item, index) => isHairlineShape(item) ? Math.min(0.08, available) : available / Math.max(1, ordered.filter(entry => !isHairlineShape(entry)).length))
	}
	const used = heights.reduce((sum, value) => sum + value, 0) + gap * (ordered.length - 1)
	let y = role === 'html-cluster'
		? packLane.y
		: packLane.y + Math.max(0, (packLane.h - used) / 2)
	ordered.forEach((item, index) => {
		result.set(item, rect(packLane.x, y, packLane.w, heights[index], `${role}-${String(item?.kind || 'item').toLowerCase()}`))
		y += heights[index] + gap
	})
	return result
}

function chooseRegion(block, slide, regions, blockIndex) {
	// autoPlaceBlocks clones semantic blocks before the compiler asks for a
	// region.  Never rely on object identity here: matching only with
	// Array#indexOf makes every cloned text block resolve to row zero, which
	// collapses a whole column into one rectangle.  Stable semantic names are
	// the authoring contract, so use them as the fallback identity.
	const indexOfBlock = (items, candidate) => {
		const direct = items.indexOf(candidate)
		if (direct >= 0) return direct
		const candidateName = String(candidate?.name || candidate?.objectName || '').trim()
		if (!candidateName) return -1
		return items.findIndex(item => String(item?.name || item?.objectName || '').trim() === candidateName)
	}
	const weightedLaneStack = (items, candidate, lane, role = 'semantic-stack') => {
		if (!lane || !items.length) return lane
		const solved = semanticStackRects(items, lane, { sortByKind: true, role })
		if (solved.has(candidate)) return solved.get(candidate)
		const candidateName = String(candidate?.name || candidate?.objectName || '').trim()
		if (candidateName) {
			for (const [item, itemRect] of solved.entries()) {
				if (String(item?.name || item?.objectName || '').trim() === candidateName) return itemRect
			}
		}
		return lane
	}
	const explicit = explicitRect(block.rect || block.bbox, block.role || block.kind || 'explicit')
	if (explicit) return explicit
	const intent = slide.layoutIntent
	const semanticName = String(block?.name || block?.objectName || '').toLowerCase()
	if (block.kind === 'section-divider') return regions.title
	// Footers are metadata, not body content. Keeping them in the footer band
	// prevents them from stealing a column cell and fixes the common left-heavy
	// composition caused by authored role/footer text being treated as content.
	if (isFooterBlock(block)) {
		// Footer metadata is still semantic content, but an accepted talking-head
		// ellipse owns the bottom-right window. Keep footer copy in the clear left
		// lane so the footer never paints underneath the presenter.
		if (slide.avatarNarration && slide.avatarNarration.enabled !== false) {
			const safeW = Math.max(1, Math.min(regions.footer.w, 10.993 - regions.footer.x - 0.25))
			return rect(regions.footer.x, regions.footer.y, safeW, regions.footer.h, 'footer-avatar-safe')
		}
		return regions.footer
	}
	const content = slide.content || []
	const hasCallout = content.some(item => item.kind === 'callout')
	const nonTitle = content.filter(item => item.kind !== 'title' && item.kind !== 'section-divider' && !isFooterBlock(item))
	const reserveCallout = hasCallout && block.kind !== 'callout' ? 0.95 : 0
	// A side-pinned semantic callout is a real occupied lane.  Keep ordinary
	// title-body copy out of that lane; otherwise a full-width body text box can
	// run underneath the callout even though both choices were semantic.
	const pinnedCallout = content.find(item => item?.kind === 'callout' && blockNamedRegion(item) && regions[blockNamedRegion(item)])
	const pinnedHost = pinnedCallout ? regions[blockNamedRegion(pinnedCallout)] : null
	// A visual hero is a distinct semantic family from a title-only poster. Keep
	// its title in a top safe band, reserve the focal visual below it, and place a
	// callout in a separate lower band. If explanatory copy is also present, the
	// engine composes a balanced copy-left / visual-right split. The AI chooses
	// only the hero intent and semantic block kinds; all rectangles remain engine
	// proposals and never become client-authored geometry.
	const heroVisual = intent === 'hero' && content.some(item => HERO_VISUAL_KINDS.has(String(item?.kind || '').toLowerCase()))
	const heroCopy = heroVisual && content.some(item => ['body', 'text', 'textbox', 'textshape', 'quote'].includes(String(item?.kind || '').toLowerCase()))
	const heroCallout = heroVisual && content.some(item => item?.kind === 'callout')
	const heroSide = pinnedHost && ['leftThird', 'rightThird'].includes(blockNamedRegion(pinnedCallout))
		? blockNamedRegion(pinnedCallout)
		: null
	// A side-pinned callout is an occupied semantic lane even on a visual hero.
	// Keep the focal visual (and any optional hero copy) inside the opposite
	// two-thirds host instead of letting the hero default reclaim the full body.
	const heroMain = heroSide === 'leftThird'
		? regions.rightTwoThirds
		: heroSide === 'rightThird'
			? regions.leftTwoThirds
			: regions.body
	const heroLayout = (() => {
		if (!heroVisual) return null
		const slideH = regions.footer.y + 0.52
		const top = Math.max(1.36, Number(regions.title?.y || 0.42) + Number(regions.title?.h || TITLE_H) + 0.12)
		const calloutH = 0.72
		const calloutY = slideH - 1.48
		const visualBottom = heroCallout ? calloutY - 0.16 : slideH - 0.70
		const visualH = Math.max(1.1, visualBottom - top)
		const title = rect(regions.title.x, regions.title.y, regions.title.w, regions.title.h, 'hero-visual-title')
		if (!heroCopy) {
			const visual = rect(heroMain.x, top, heroMain.w, visualH, 'hero-visual')
			const calloutW = Math.min(heroMain.w, 9.4)
			const callout = rect(heroMain.x + Math.max(0, (heroMain.w - calloutW) / 2), calloutY, calloutW, calloutH, 'hero-callout')
			return { title, visual, callout }
		}
		const splitGap = GAP
		const leftW = (heroMain.w - splitGap) * 0.40
		const rightW = heroMain.w - splitGap - leftW
		const copy = rect(heroMain.x, top, leftW, visualH, 'hero-copy')
		const visual = rect(heroMain.x + leftW + splitGap, top, rightW, visualH, 'hero-visual')
		const callout = rect(copy.x, calloutY, copy.w, calloutH, 'hero-callout')
		return { title, copy, visual, callout }
	})()
	if (heroLayout) {
		if (block.kind === 'title') return heroLayout.title
		if (HERO_VISUAL_KINDS.has(String(block.kind || '').toLowerCase())) return heroLayout.visual
		if (block.kind === 'callout') return heroLayout.callout
		if (heroLayout.copy) return heroLayout.copy
	}
	if (isKickerBlock(block) && regions.title) {
		return rect(regions.title.x, regions.title.y, regions.title.w, 0.50, 'kicker')
	}
	if (block.kind === 'title') {
		if (contentHasKickerHeader(content) && regions.title) {
			return rect(regions.title.x, regions.title.y + 0.50, regions.title.w, Math.max(0.72, regions.title.h - 0.50), 'title')
		}
		// A hero title is oversized by design. When a semantic callout is pinned
		// to a side lane, give the title the remaining safe lane so a long
		// headline cannot paint underneath the callout. The engine still owns the
		// resulting rectangle; the AI only chose the semantic region relationship.
		if (intent === 'hero' && pinnedHost && ['leftThird', 'rightThird'].includes(blockNamedRegion(pinnedCallout))) {
			const side = blockNamedRegion(pinnedCallout)
			if (side === 'rightThird') {
				return rect(regions.title.x, regions.title.y, Math.max(1, pinnedHost.x - regions.title.x - GAP), regions.title.h, 'hero-title-safe')
			}
			const x = pinnedHost.x + pinnedHost.w + GAP
			return rect(x, regions.title.y, Math.max(1, regions.title.x + regions.title.w - x), regions.title.h, 'hero-title-safe')
		}
		return regions.title
	}
	const calloutSafeBody = (() => {
		if (!pinnedHost || block.kind === 'callout') return regions.body
		const name = blockNamedRegion(pinnedCallout)
		if (name === 'rightThird') {
			return rect(regions.body.x, regions.body.y, Math.max(0.5, pinnedHost.x - regions.body.x - GAP), regions.body.h, 'body-callout-safe')
		}
		if (name === 'leftThird') {
			const x = pinnedHost.x + pinnedHost.w + GAP
			return rect(x, regions.body.y, Math.max(0.5, regions.body.x + regions.body.w - x), regions.body.h, 'body-callout-safe')
		}
		return regions.body
	})()
	const bodyForNonCallout = reserveCallout
		? rect(calloutSafeBody.x, calloutSafeBody.y, calloutSafeBody.w, Math.max(0.4, calloutSafeBody.h - reserveCallout), calloutSafeBody.role)
		: calloutSafeBody
	// Comparison and sidebar intents own callout affinity: comparison callouts
	// belong to a semantic side and sidebar callouts belong to the narrow rail.
	// The generic bottom-band treatment is only for intents without an explicit
	// callout relationship.
	if (block.kind === 'callout' && !CALLOUT_AFFINITY_INTENTS.has(intent)) {
		// A one-line generic callout is a semantic accent, not a full-width
		// content panel. Size the bottom band from its text and center it so
		// short callouts do not create an empty-looking rectangle across the
		// entire slide. Longer text is allowed to grow toward the body width.
		const calloutText = String(block.text || block.label || '').trim()
		const calloutW = Math.min(regions.body.w, Math.max(4.5, Math.min(9.4, 3.4 + calloutText.length * 0.075)))
		const calloutH = calloutText.length > 72 ? 0.9 : 0.72
		const calloutX = regions.body.x + Math.max(0, (regions.body.w - calloutW) / 2)
		return rect(calloutX, regions.body.y + regions.body.h - calloutH - 0.06, calloutW, calloutH, 'callout')
	}
	if (intent === 'chart-left-insights-right' || intent === 'insights-left-chart-right') {
		const proofRegion = intent === 'chart-left-insights-right' ? regions.left : regions.right
		const explanationRegion = intent === 'chart-left-insights-right' ? regions.right : regions.left
		const chartKinds = new Set(['chart', 'chart-panel'])
		const named = blockNamedRegion(block)
		if (named === 'left' || named === 'right') {
			const col = named === 'left' ? regions.left : regions.right
			const columnBlocks = nonTitle.filter(item => blockNamedRegion(item) === named)
			const clustered = clusteredStackRects(columnBlocks, col)
			if (clustered.has(block)) return clustered.get(block)
			return weightedLaneStack(columnBlocks, block, col, named)
		}
		if (chartKinds.has(String(block.kind || '').toLowerCase())) {
			const proofBlocks = nonTitle.filter(item => chartKinds.has(String(item?.kind || '').toLowerCase()) && !blockHasExplicitGeometry(item))
			return weightedLaneStack(proofBlocks, block, proofRegion, 'chart-proof')
		}
		const explanationBlocks = nonTitle.filter(item => {
			const kind = String(item?.kind || '').toLowerCase()
			const name = String(item?.name || item?.objectName || '').toLowerCase()
			return !chartKinds.has(kind)
				&& !blockHasExplicitGeometry(item)
				&& kind !== 'model3d'
				&& name !== 'presenter'
		})
		return weightedLaneStack(explanationBlocks, block, explanationRegion, 'chart-explanation')
	}
	if (intent === 'image-left-copy-right' || intent === 'copy-left-image-right') {
		const imageRegion = intent === 'image-left-copy-right' ? regions.left : regions.right
		const copyRegion = intent === 'image-left-copy-right' ? regions.right : regions.left
		// A talking head owns the accepted bottom-right ellipse. Reserve its
		// horizontal lane from adjacent explanatory copy; this keeps semantic
		// identity text readable without requiring client-authored coordinates.
		const hasTalkingHead = Boolean(slide.avatarNarration && slide.avatarNarration.enabled !== false)
		const avatarSafeCopyRegion = hasTalkingHead && copyRegion === regions.right
			? rect(copyRegion.x, copyRegion.y, Math.max(1.45, copyRegion.w - 2.65), copyRegion.h, 'copy-avatar-safe')
			: copyRegion
		const visualKinds = new Set(['image', 'image-feature', 'chart', 'chart-panel', 'table', 'table-panel', 'media', 'model3d', 'ink', 'laser', 'freeform'])
		if (visualKinds.has(String(block.kind || '').toLowerCase())) return imageRegion
		// Annotation and proof labels belong with the proof canvas, not with the
		// explanatory copy.  Keeping these semantic anchors on the visual side
		// prevents an apparently empty left half on annotation slides.
		if (/(^|[-_.])(annotation|target|proof)([-_.]|$)/.test(semanticName)) return imageRegion
		// Editorial split slots: semantic headings need height for their actual
		// wrapping. Treating role/title/subtitle as equal body rows makes a long
		// title collide with its subtitle in a narrow copy column.
		if (/(^|[-_.])footer($|[-_.])/.test(semanticName)) {
			if (hasTalkingHead) {
				const safeW = Math.max(1, Math.min(regions.footer.w, 10.993 - regions.footer.x - 0.25))
				return rect(regions.footer.x, regions.footer.y, safeW, regions.footer.h, 'footer-avatar-safe')
			}
			return regions.footer
		}
		if (/(^|[-_.])(role|eyebrow)($|[-_.])/.test(semanticName)) return rect(copyRegion.x, copyRegion.y, copyRegion.w, 0.34, 'copy-role')
		if (/(^|[-_.])title($|[-_.])/.test(semanticName)) return rect(copyRegion.x, copyRegion.y + 0.46, copyRegion.w, Math.min(1.24, copyRegion.h * 0.30), 'copy-title')
		if (/(^|[-_.])subtitle($|[-_.])/.test(semanticName)) return rect(copyRegion.x, copyRegion.y + 1.82, copyRegion.w, Math.min(0.78, copyRegion.h * 0.18), 'copy-subtitle')
		if (/(^|[-_.])(caption|label)($|[-_.])/.test(semanticName)) return rect(copyRegion.x, copyRegion.y + copyRegion.h - 0.42, copyRegion.w, 0.34, 'copy-caption')
		if (hasTalkingHead && /(?:avatar|identity).*(?:copy|head)|identity-copy/.test(semanticName)) {
			return rect(avatarSafeCopyRegion.x, avatarSafeCopyRegion.y + 2.42, avatarSafeCopyRegion.w, Math.min(1.22, Math.max(0.58, avatarSafeCopyRegion.h - 2.42)), 'avatar-copy-safe')
		}
		// A split slide's explanatory column is a semantic stack.  Callouts are
		// part of that stack when they accompany body copy; treating them as a
		// separate generic object gives both blocks the full copy region and lets
		// the later callout hide the body.  Keep the decision engine-owned: the AI
		// supplies semantic roles, while the engine derives the shared geometry.
		const splitStackBlocks = content.filter(item => {
			const kind = String(item?.kind || '').toLowerCase()
			const name = String(item?.name || item?.objectName || '').toLowerCase()
			return !visualKinds.has(kind)
				&& kind !== 'title'
				&& kind !== 'section-divider'
				&& !isFooterBlock(item)
				&& !/(^|[-_.])(role|eyebrow|subtitle|caption|label)($|[-_.])/.test(name)
		})
		const splitStackIndex = indexOfBlock(splitStackBlocks, block)
		if (splitStackBlocks.length > 1 && splitStackIndex >= 0) {
			const rowH = Math.max(0.45, (copyRegion.h - GAP * (splitStackBlocks.length - 1)) / splitStackBlocks.length)
			return rect(copyRegion.x, copyRegion.y + splitStackIndex * (rowH + GAP), copyRegion.w, rowH, 'copy-stack')
		}
		const copyBlocks = content.filter(item => !visualKinds.has(String(item.kind || '').toLowerCase()) && item.kind !== 'callout')
		const copyIndex = Math.max(0, indexOfBlock(copyBlocks, block))
		const titleLike = block.kind === 'title'
		if (copyBlocks.length <= 1) return copyRegion
		if (titleLike) return rect(copyRegion.x, copyRegion.y, copyRegion.w, Math.min(0.72, copyRegion.h * 0.22), 'copy-title')
		const consumedTitle = copyBlocks.some(item => item.kind === 'title') ? 0.9 : 0
		const remaining = copyBlocks.filter(item => item.kind !== 'title')
		const rowIndex = Math.max(0, indexOfBlock(remaining, block))
		const rowH = Math.max(0.45, (copyRegion.h - consumedTitle - GAP * Math.max(0, remaining.length - 1)) / Math.max(1, remaining.length))
		return rect(copyRegion.x, copyRegion.y + consumedTitle + rowIndex * (rowH + GAP), copyRegion.w, rowH, 'copy')
	}
	if (intent === 'metric-grid') {
		// Metric grids still use the shared title band.  AI-authored title/subtitle
		// blocks are often semantic text blocks rather than kind:'title'; keep them
		// out of the card row instead of letting the generic body stack place them
		// on top of the metrics.
		if (/(^|[-_.])title($|[-_.])/.test(semanticName)) return regions.title
		if (/(^|[-_.])subtitle($|[-_.])/.test(semanticName)) {
			return rect(regions.title.x, regions.title.y + regions.title.h + 0.08, regions.title.w, 0.42, 'metric-subtitle')
		}
		// Metric cards are authored as a semantic family: metric-N is the card
		// surface, metric-N-value and metric-N-label are its internal slots.  A
		// generic pre-grid placed those three objects in unrelated cells, leaving
		// hollow cards and detached values.  The engine now resolves the family
		// into a balanced four-column row (or a natural subset when fewer metrics
		// exist) while preserving the AI's semantic names.
		const match = semanticName.match(/(?:^|[-_.])metric[-_.]?(\d+)(?:[-_.](value|label))?$/)
		if (match) {
			const index = Math.max(0, Number(match[1]) - 1)
			const slot = match[2] || 'card'
			const metricNames = new Set(content.map(item => String(item?.name || item?.objectName || '').toLowerCase()).map(name => {
				const m = name.match(/(?:^|[-_.])metric[-_.]?(\d+)(?:[-_.](?:value|label))?$/)
				return m ? Number(m[1]) : null
			}).filter(Number.isFinite))
			const count = Math.max(1, metricNames.size || 1)
			const cols = Math.min(4, count)
			const gap = GAP
			const cellW = (regions.body.w - gap * (cols - 1)) / cols
			const cardH = Math.min(2.15, Math.max(1.55, regions.body.h * 0.46))
			const cardY = regions.body.y + Math.max(0.28, (regions.body.h - cardH) / 2)
			const card = rect(regions.body.x + (index % cols) * (cellW + gap), cardY, cellW, cardH, 'metric-card')
			if (slot === 'value') return rect(card.x + 0.18, card.y + 0.28, card.w - 0.36, 0.62, 'metric-value')
			if (slot === 'label') return rect(card.x + 0.18, card.y + card.h - 0.58, card.w - 0.36, 0.34, 'metric-label')
			return card
		}
	}
	if (intent === 'two-column') {
		const bands = twoColumnSpanBands(content, regions)
		if (bands.owns(block, 'opening') && bands.openingRect) {
			const stacked = semanticStackRects(bands.opening, bands.openingRect, { sortByKind: false, role: 'span-opening' })
			const match = [...stacked.entries()].find(([item]) => blockIdentity(item) === blockIdentity(block))
			if (match) return match[1]
			return bands.openingRect
		}
		if (bands.owns(block, 'closing') && bands.closingRect) {
			const stacked = semanticStackRects(bands.closing, bands.closingRect, { sortByKind: false, role: 'span-closing' })
			const match = [...stacked.entries()].find(([item]) => blockIdentity(item) === blockIdentity(block))
			if (match) return match[1]
			return bands.closingRect
		}
		const named = blockNamedRegion(block)
		if (named === 'left' || named === 'right') {
			const col = named === 'right' ? bands.right : bands.left
			const columnBlocks = nonTitle.filter(item => blockNamedRegion(item) === named)
			const clustered = clusteredStackRects(columnBlocks, col)
			const stacked = stackRectFor(clustered, block)
			if (stacked) return stacked
			return weightedLaneStack(columnBlocks, block, col, named)
		}
		// Motion timelines are a semantic label/bar family, not ordinary stacked
		// copy.  Resolve each pair into one compact row in the copy column so the
		// bars stay short, legible, and visually coupled to their labels while a
		// presenter or other proof remains in the visual column.
		const motionPart = semanticName.match(/(?:^|[-_.])motion-(label|bar)-(\d+)(?:$|[-_.])/)
		if (motionPart) {
			const motionIndex = Math.max(0, Number(motionPart[2]) - 1)
			const motionBlocks = nonTitle.filter(item => /(?:^|[-_.])motion-(?:label|bar)-(\d+)(?:$|[-_.])/.test(String(item?.name || item?.objectName || '').toLowerCase()))
			const rowCount = Math.max(1, new Set(motionBlocks.map(item => {
				const m = String(item?.name || item?.objectName || '').toLowerCase().match(/motion-(?:label|bar)-(\d+)/)
				return m ? Number(m[1]) : null
			}).filter(Number.isFinite)).size)
			const motionRegion = bands.left
			const rowH = 0.24
			const rowGap = Math.min(0.22, Math.max(0.10, (motionRegion.h - rowH * rowCount - 0.45) / Math.max(1, rowCount + 2)))
			const totalH = rowH * rowCount + rowGap * Math.max(0, rowCount - 1)
			const rowY = Math.max(motionRegion.y + 2.65, motionRegion.y + Math.max(0, motionRegion.h - totalH) - 0.30)
			const y = rowY + motionIndex * (rowH + rowGap)
			if (motionPart[1] === 'label') return rect(motionRegion.x, y, Math.min(1.72, motionRegion.w * 0.34), rowH, 'motion-label')
			const barX = motionRegion.x + Math.min(1.92, motionRegion.w * 0.38)
			const barW = Math.max(0.55, motionRegion.w - (barX - motionRegion.x) - 0.08) * [0.38, 0.62, 0.84, 0.52][motionIndex % 4]
			return rect(barX, y, barW, rowH, 'motion-bar')
		}
		// Decide column affinity from semantic content, then stack within each
		// column. Object order is only a fallback; it must not determine balance.
		const visualRight = new Set(['chart', 'chart-panel', 'table', 'table-panel', 'image', 'image-feature', 'media', 'model3d', 'diagram', 'smartart'])
		const isRight = visualRight.has(String(block.kind || '').toLowerCase()) || /(^|[-_.])(bar|chart|table|image|media|model|visual|proof|poster)([-_.]|$)/.test(semanticName)
		const nonTitleBlocks = nonTitle.filter(item => !isFooterBlock(item) && !bands.owns(item, 'opening') && !bands.owns(item, 'closing'))
		const columnBlocks = nonTitleBlocks.filter(item => {
			const n = String(item?.name || item?.objectName || '').toLowerCase()
			const right = visualRight.has(String(item.kind || '').toLowerCase()) || /(^|[-_.])(bar|chart|table|image|media|model|visual|proof|poster)([-_.]|$)/.test(n)
			return right === isRight
		})
		const col = isRight ? bands.right : bands.left
		if (!isRight && /(^|[-_.])(role|eyebrow)($|[-_.])/.test(semanticName)) return rect(col.x, col.y, col.w, 0.34, 'left-role')
		if (!isRight && /(^|[-_.])title($|[-_.])/.test(semanticName)) return rect(col.x, col.y + 0.46, col.w, Math.min(1.24, col.h * 0.30), 'left-title')
		if (!isRight && /(^|[-_.])subtitle($|[-_.])/.test(semanticName)) return rect(col.x, col.y + 1.82, col.w, Math.min(0.78, col.h * 0.18), 'left-subtitle')
		const ci = Math.max(0, indexOfBlock(columnBlocks, block))
		// Keep the semantic header stack on the left, then fit all remaining
		// blocks inside the actual column.  The previous fixed-height rows could
		// push the last label below the slide when a column had four or more
		// evidence blocks.  Row height and placement are therefore derived from
		// the available column geometry and clamped to its bottom edge.
		const reserved = !isRight ? Math.min(2.6, Math.max(0, col.h - 0.36)) : 0
		const bodyBlocks = !isRight ? columnBlocks.filter(item => {
			const n = String(item?.name || item?.objectName || '').toLowerCase()
			return !/(^|[-_.])(role|eyebrow|title|subtitle)($|[-_.])/.test(n)
		}) : columnBlocks
		const bodyIndex = Math.max(0, indexOfBlock(bodyBlocks, block))
		const bodyTop = col.y + reserved
		const bodyH = Math.max(0.36, col.y + col.h - bodyTop)
		const rowCount = Math.max(1, bodyBlocks.length)
		const rowGap = Math.min(GAP, Math.max(0.08, bodyH / Math.max(1, rowCount * 5)))
		const ch = Math.max(0.36, (bodyH - rowGap * Math.max(0, rowCount - 1)) / rowCount)
		const y = Math.min(bodyTop + bodyIndex * (ch + rowGap), col.y + col.h - ch)
		return rect(col.x, y, col.w, ch, isRight ? 'right' : 'left')
	}
	if (intent === 'comparison') {
		// Comparison is a semantic two-sided relationship. Preserve explicit
		// semantic side names when supplied; otherwise distribute substantive
		// blocks by side and stack within that side. Array order chooses only the
		// first-vs-second comparison side, never a raw rectangle.
		// A comparison block is composite: it owns both side panels. If a
		// semantic callout accompanies it, reserve a bottom band for that callout
		// before the composite receives its host. Otherwise the callout is
		// assigned to one side and paints over that side's comparison panel.
		const comparisonBlock = content.find(item => String(item?.kind || '').toLowerCase() === 'comparison')
		const comparisonCallout = content.find(item => String(item?.kind || '').toLowerCase() === 'callout')
		const comparisonCalloutText = String(comparisonCallout?.text || comparisonCallout?.label || '').trim()
		const comparisonCalloutH = comparisonCallout
			? Math.min(1.15, Math.max(0.72, comparisonCalloutText.length > 72 ? 0.92 : 0.72))
			: 0
		if (block.kind === 'comparison' && comparisonCallout) {
			const hostH = Math.max(1.5, regions.body.h - comparisonCalloutH - GAP)
			return rect(regions.body.x, regions.body.y, regions.body.w, hostH, 'comparison-safe')
		}
		if (block.kind === 'callout' && comparisonBlock) {
			return rect(regions.body.x, regions.body.y + regions.body.h - comparisonCalloutH, regions.body.w, comparisonCalloutH, 'comparison-callout')
		}
		const compareBlocks = nonTitle.filter(item => !isFooterBlock(item))
		const sideFor = item => {
			const name = String(item?.name || item?.objectName || '').toLowerCase()
			if (item?.region === 'left' || /(^|[-_.])(left|before|current|baseline)([-_.]|$)/.test(name)) return 'left'
			if (item?.region === 'right' || /(^|[-_.])(right|after|future|target)([-_.]|$)/.test(name)) return 'right'
			return indexOfBlock(compareBlocks, item) % 2 === 0 ? 'left' : 'right'
		}
		const side = sideFor(block)
		const col = side === 'right' ? regions.right : regions.left
		const sideBlocks = compareBlocks.filter(item => sideFor(item) === side)
		const sideIndex = Math.max(0, indexOfBlock(sideBlocks, block))
		const rowGap = Math.min(GAP, Math.max(0.08, col.h / Math.max(1, sideBlocks.length * 5)))
		const rowH = Math.max(0.45, (col.h - rowGap * Math.max(0, sideBlocks.length - 1)) / Math.max(1, sideBlocks.length))
		return rect(col.x, col.y + sideIndex * (rowH + rowGap), col.w, rowH, side)
	}
	if (intent === 'three-column') {
		const named = blockNamedRegion(block)
		if (named === 'leftThird' || named === 'midThird' || named === 'rightThird') {
			const col = regions[named]
			const columnBlocks = nonTitle.filter(item => blockNamedRegion(item) === named)
			const clustered = clusteredStackRects(columnBlocks, col)
			const stacked = stackRectFor(clustered, block)
			if (stacked) return stacked
			return col
		}
		const comparable = content.filter(item => item.kind !== 'title' && item.kind !== 'section-divider' && !isFooterBlock(item))
		const comparableIndex = Math.max(0, indexOfBlock(comparable, block))
		return [regions.leftThird, regions.midThird, regions.rightThird][comparableIndex % 3]
	}
	if ((intent === 'sidebar-left' || intent === 'sidebar-right') && regions.sidebar && regions.main) {
		// Rail-bound blocks: explicit region:'sidebar', or compact rail kinds (stat/kpi/
		// callout/eyebrow). Everything else fills the wide main column (stacked if many).
		const railRole = block.region === 'sidebar' || block.role === 'sidebar' || ['stat', 'kpi', 'callout', 'eyebrow'].includes(block.kind)
		if (railRole) {
			const railBlocks = nonTitle.filter(item => item.region === 'sidebar' || item.role === 'sidebar' || ['stat', 'kpi', 'callout', 'eyebrow'].includes(item.kind))
			const ri = Math.max(0, indexOfBlock(railBlocks, block))
			const rawRh = (regions.sidebar.h - GAP * Math.max(0, railBlocks.length - 1)) / Math.max(1, railBlocks.length)
			if (rawRh < MIN_STACK_H) return splitCardRects(regions.sidebar, railBlocks.length, { maxCols: 2 })[ri]
			const rh = Math.max(0.5, Math.min(rawRh, MAX_CARD_H))
			const stackH = railBlocks.length * rh + GAP * Math.max(0, railBlocks.length - 1)
			const yOffset = regions.sidebar.y + Math.max(0, (regions.sidebar.h - stackH) / 2)
			return rect(regions.sidebar.x, yOffset + ri * (rh + GAP), regions.sidebar.w, rh, 'sidebar')
		}
		const mainBlocks = nonTitle.filter(item => !(item.region === 'sidebar' || item.role === 'sidebar' || ['stat', 'kpi', 'callout', 'eyebrow'].includes(item.kind)))
		if (mainBlocks.length > 1) {
			const mi = Math.max(0, indexOfBlock(mainBlocks, block))
			const rawMh = (regions.main.h - GAP * (mainBlocks.length - 1)) / mainBlocks.length
			if (rawMh < MIN_STACK_H) return splitCardRects(regions.main, mainBlocks.length, { maxCols: 2 })[mi]
			const mh = Math.max(0.45, rawMh)
			return rect(regions.main.x, regions.main.y + mi * (mh + GAP), regions.main.w, mh, 'main')
		}
		return regions.main
	}
	const stackBlocks = nonTitle.filter(item => item.kind !== 'callout' && !isFooterBlock(item))
	if (stackBlocks.length > 1) {
		const stackIndex = Math.max(0, indexOfBlock(stackBlocks, block))
		const stackH = Math.max(0.45, (bodyForNonCallout.h - GAP * (stackBlocks.length - 1)) / stackBlocks.length)
		return rect(bodyForNonCallout.x, bodyForNonCallout.y + stackIndex * (stackH + GAP), bodyForNonCallout.w, stackH, bodyForNonCallout.role)
	}
	return bodyForNonCallout
}

function blockText(block, slide) {
	const normalizeText = value => typeof value === 'string' ? value.replace(/\\n/g, '\n') : value
	if (block.text) return normalizeText(block.text)
	if (Array.isArray(block.items)) {
		return block.items.map(item => normalizeText(item.text || `${item.label || ''}${item.value !== undefined ? ` ${item.value}` : ''}`.trim())).filter(Boolean).join('\n')
	}
	return normalizeText(block.kind === 'title' ? slide.title : slide.message || '')
}

function plannedTextAltText(block, text, objectName) {
	if (block.altText !== undefined && block.altText !== null && block.altText !== '') {
		if (typeof block.altText !== 'string' || !block.altText.trim()) throw new Error(`${objectName}.altText must be non-empty text.`)
		return block.altText
	}
	if (typeof text === 'string') return text || objectName
	if (Array.isArray(text)) {
		const runs = text.map(run => typeof run === 'string' ? run : run?.text)
		if (runs.some(run => typeof run !== 'string')) throw new Error(`${objectName}.text must contain only rich text runs.`)
		return runs.join('') || objectName
	}
	return objectName
}

function makeWarningsForBlock(block, slide, objectName, box, warnings) {
	if (DATA_BLOCK_KINDS.has(block.kind) || block.dataRef || block.dataSource) {
		// `evidenceSource` is the public semantic proof field. Internal/runtime
		// `provenance` remains supported for maintainer specs but is intentionally
		// hidden by the public black-box sanitizer.
		const hasProof = value => {
			const evidence = value?.evidenceSource
			const provenance = value?.provenance
			return (typeof evidence === 'string' && evidence.trim().length > 0) || (typeof provenance === 'string' && provenance.trim().length > 0)
		}
		const verifiedItems = Array.isArray(block.items) && block.items.length > 0 && block.items.every(item => hasProof(item) && item.verified === true)
		if ((!hasProof(block) || block.verified !== true) && !verifiedItems) {
			const itemCount = Array.isArray(block.items) ? block.items.length : 0
			const verifiedItemCount = Array.isArray(block.items) ? block.items.filter(item => item?.verified === true && hasProof(item)).length : 0
			warnings.push({
				code: 'UNVERIFIED_DATA',
				severity: 'warning',
				slideId: slide.id,
				objectName,
				message: 'Data-bearing block is missing semantic evidence or verified=true.',
				reason: 'Data-bearing content cannot be treated as proof until its claim is explicitly marked verified and linked to a public evidence source.',
				fix: 'Set verified:true and a concise public evidenceSource on the block or every data item, then rerun dryRun; private runtime provenance is not a substitute.',
				evidence: { kind: block.kind, name: block.name || objectName, verified: block.verified === true, evidenceSourcePresent: hasProof(block), itemCount, verifiedItemCount },
				next: { recommendedTool: 'betterpptx.deck.generate_from_spec', reason: 'Regenerate after adding verified semantic evidence.' },
			})
		}
	}
	// A native connector is line geometry, so a horizontal or vertical connector
	// legitimately has one zero extent. It is invalid only when both dimensions
	// collapse (or either dimension is negative).
	const validConnectorLine = block.kind === 'connector'
		&& box.w >= 0
		&& box.h >= 0
		&& (box.w > 0 || box.h > 0)
	if (!validConnectorLine && (box.w <= 0 || box.h <= 0)) {
		warnings.push({
			code: 'INVALID_REGION',
			severity: 'error',
			slideId: slide.id,
			objectName,
			message: 'Layout region collapsed to a non-positive size.',
			reason: 'The selected semantic region or engine layout produced a non-positive host box, so the object cannot be rendered safely.',
			fix: 'Choose a supported layoutIntent or semantic region and remove authored geometry; let the engine solve a positive box before commit.',
			evidence: { width: Number(box.w || 0), height: Number(box.h || 0), region: block.region || null, layoutIntent: slide.layoutIntent || null },
		})
	}
}

function splitCardRects(base, count, { maxCols = 3 } = {}) {
	const n = Math.max(1, count)
	const cols = n <= 2 ? n : Math.min(Math.max(1, Number(maxCols) || 3), n)
	const rows = Math.ceil(n / cols)
	const cellW = (base.w - GAP * (cols - 1)) / cols
	const cellH = (base.h - GAP * (rows - 1)) / rows
	const out = []
	for (let i = 0; i < n; i += 1) {
		const c = i % cols
		const r = Math.floor(i / cols)
		out.push(rect(base.x + c * (cellW + GAP), base.y + r * (cellH + GAP), cellW, cellH, 'card'))
	}
	return out
}

function validateAuthoring3DDepth(style = {}, path = 'block') {
	const threeD = style.text3D || style.effect3D
	if (!threeD || typeof threeD !== 'object') return
	const materialValues = ['legacyMatte', 'legacyPlastic', 'legacyMetal', 'legacyWireframe', 'matte', 'plastic', 'metal', 'warmMatte', 'translucentPowder', 'powder', 'dkEdge', 'softEdge', 'clear', 'flat', 'softmetal']
	const lightRigValues = ['balanced', 'brightRoom', 'chilly', 'contrasting', 'flat', 'flood', 'freezing', 'glow', 'harsh', 'legacyFlat1', 'legacyFlat2', 'legacyFlat3', 'legacyFlat4', 'legacyHarsh1', 'legacyHarsh2', 'legacyHarsh3', 'legacyHarsh4', 'legacyNormal1', 'legacyNormal2', 'legacyNormal3', 'legacyNormal4', 'morning', 'soft', 'sunrise', 'sunset', 'threePt', 'twoPt']
	const bevelPresetValues = ['angle', 'artDeco', 'circle', 'convex', 'coolSlant', 'cross', 'divot', 'hardEdge', 'relaxedInset', 'riblet', 'slope', 'softRound']
	if (threeD.material !== undefined && threeD.material !== null && threeD.material !== '') {
		if (typeof threeD.material !== 'string' || !materialValues.includes(threeD.material)) throw new Error(`${path}.material must be one of: ${materialValues.join(', ')}.`)
	}
	if (threeD.lightRig !== undefined && threeD.lightRig !== null && threeD.lightRig !== '') {
		const requestedRig = threeD.lightRig && typeof threeD.lightRig === 'object' ? (threeD.lightRig.rig ?? threeD.lightRig.name ?? threeD.lightRig.value) : threeD.lightRig
		if (typeof requestedRig !== 'string' || !lightRigValues.includes(requestedRig)) throw new Error(`${path}.lightRig must be one of: ${lightRigValues.join(', ')}.`)
	}
	const boundedPoints = (raw, field, minimum, maximum, defaultValue) => {
		if (raw === undefined || raw === null || raw === '') return
		const numeric = Number(raw)
		if (!Number.isFinite(numeric)) throw new Error(`${path}.${field} must be a finite number in points.`)
		if (numeric < minimum || numeric > maximum) throw new Error(`${path}.${field} must be between ${minimum} and ${maximum} points.`)
		return numeric || defaultValue
	}
	for (const [name, bevel] of [['bevel', threeD.bevel], ['bevelBottom', threeD.bevelBottom]]) {
		if (!bevel || typeof bevel !== 'object' || Array.isArray(bevel)) continue
		if (bevel.type !== undefined && bevel.type !== null && bevel.type !== '' && (typeof bevel.type !== 'string' || !bevelPresetValues.includes(bevel.type))) throw new Error(`${path}.${name}.type must be one of: ${bevelPresetValues.join(', ')}.`)
		boundedPoints(bevel.width ?? bevel.w, `${name}.width`, 0, 1000, 6)
		boundedPoints(bevel.height ?? bevel.h, `${name}.height`, 0, 1000, 6)
	}
	boundedPoints(threeD.contourWidth, 'contourWidth', 0, 1000, 0)
	const lightDirection = threeD.lightDirection
	if (lightDirection !== undefined && lightDirection !== null && lightDirection !== '') {
		const numericDirection = Number(lightDirection)
		if (!Number.isFinite(numericDirection) || numericDirection < 0 || numericDirection > 359) throw new Error(`${path}.lightDirection must be between 0 and 359 degrees.`)
	}
	for (const field of ['extrusionColor', 'contourColor']) {
		const rawColor = threeD[field]
		if (rawColor === undefined || rawColor === null || rawColor === '') continue
		const color = String(rawColor).replace(/^#/, '')
		const validLength = color.length === 6 || color.length === 8
		const validDigits = [...color].every(char => '0123456789abcdefABCDEF'.includes(char))
		if (!validLength || !validDigits) throw new Error(`${path}.${field} must be a 6- or 8-digit hexadecimal color.`)
	}
	const raw = threeD.extrusion
	if (raw === undefined || raw === null) return
	const value = raw && typeof raw === 'object' ? (raw.depth ?? raw.height ?? raw.h ?? raw.value) : raw
	if (value === undefined || value === null || value === '') return
	const numeric = Number(value)
	if (!Number.isFinite(numeric)) throw new Error(`${path}.extrusion must be a finite number in points.`)
	if (numeric < 0 || numeric > 5000) throw new Error(`${path}.extrusion must be between 0 and 5000 points.`)
}

function validateAuthoringShadowBlur(style = {}, path = 'block') {
	const shadow = style.shadow
	if (!shadow || typeof shadow !== 'object' || Array.isArray(shadow)) return
	if (shadow.rotateWithShape !== undefined && typeof shadow.rotateWithShape !== 'boolean') {
		throw new Error(`${path}.shadow.rotateWithShape must be boolean.`)
	}
	for (const [field, raw, minimum, maximum, unit] of [
		['blurPt', shadow.blurPt ?? shadow.blur ?? shadow.size, 0, 100, 'points'],
		['distancePt', shadow.distancePt ?? shadow.distance ?? shadow.offset, 0, 200, 'points'],
		['angleDeg', shadow.angleDeg ?? shadow.angle, 0, 359, 'degrees'],
		['scaleX', shadow.scaleX, 0, 2, 'multiplier'],
		['scaleY', shadow.scaleY, 0, 2, 'multiplier'],
		['skewXDeg', shadow.skewXDeg ?? shadow.skewX, -90, 90, 'degrees'],
		['skewYDeg', shadow.skewYDeg ?? shadow.skewY, -90, 90, 'degrees'],
	]) {
		if (raw === undefined || raw === null || raw === '') continue
		const numeric = Number(raw)
		if (!Number.isFinite(numeric)) throw new Error(`${path}.shadow.${field} must be a finite number in ${unit}.`)
		const exclusive = field === 'skewXDeg' || field === 'skewYDeg'
		if (exclusive ? (numeric <= minimum || numeric >= maximum) : (numeric < minimum || numeric > maximum)) {
			throw new Error(`${path}.shadow.${field} must be between ${minimum} and ${maximum} ${unit}${exclusive ? ' (exclusive endpoints)' : ''}.`)
		}
	}
}

function validateAuthoringBlur(style = {}, path = 'block') {
	const blur = style.blur
	if (!blur || typeof blur !== 'object' || Array.isArray(blur)) return
	if (blur.growBounds !== undefined && typeof blur.growBounds !== 'boolean') {
		throw new Error(`${path}.blur.growBounds must be boolean.`)
	}
	if (blur.grow !== undefined && typeof blur.grow !== 'boolean') {
		throw new Error(`${path}.blur.grow must be boolean.`)
	}
	const raw = blur.radiusPt ?? blur.radius ?? blur.size
	if (raw === undefined || raw === null || raw === '') return
	const numeric = Number(raw)
	if (!Number.isFinite(numeric)) throw new Error(`${path}.blur.radiusPt must be a finite number in points.`)
	if (numeric < 0 || numeric > 100) throw new Error(`${path}.blur.radiusPt must be between 0 and 100 points.`)
}

function validateAuthoringFillOverlay(style = {}, path = 'block') {
	const overlay = style.fillOverlay
	if (!overlay || typeof overlay !== 'object' || Array.isArray(overlay)) return
	const fill = overlay.fill
	if (!fill || typeof fill !== 'object' || Array.isArray(fill) || fill.transparency === undefined || fill.transparency === null || fill.transparency === '') return
	const numeric = Number(fill.transparency)
	if (!Number.isFinite(numeric)) throw new Error(`${path}.fillOverlay.fill.transparency must be a finite normalized number.`)
	if (numeric < 0 || numeric > 100) throw new Error(`${path}.fillOverlay.fill.transparency must be between 0 and 1 normalized (or 0 and 100 percent compatibility input).`)
}

function validateAuthoringGlow(style = {}, path = 'block') {
	const glow = style.glow
	if (!glow || typeof glow !== 'object' || Array.isArray(glow)) return
	const radiusRaw = glow.radiusPt ?? glow.radius ?? glow.size
	if (radiusRaw !== undefined && radiusRaw !== null && radiusRaw !== '') {
		const radius = Number(radiusRaw)
		if (!Number.isFinite(radius)) throw new Error(`${path}.glow.radiusPt must be a finite number in points.`)
		if (radius < 0 || radius > 100) throw new Error(`${path}.glow.radiusPt must be between 0 and 100 points.`)
	}
	if (glow.opacity !== undefined && glow.opacity !== null && glow.opacity !== '') {
		const opacity = Number(glow.opacity)
		if (!Number.isFinite(opacity)) throw new Error(`${path}.glow.opacity must be a finite normalized number.`)
		if (opacity < 0 || opacity > 1) throw new Error(`${path}.glow.opacity must be between 0 and 1 normalized.`)
	}
}

function validateAuthoringSoftEdges(style = {}, path = 'block') {
	const softEdges = style.softEdges
	if (!softEdges || typeof softEdges !== 'object' || Array.isArray(softEdges)) return
	const raw = softEdges.radiusPt ?? softEdges.radius ?? softEdges.size
	if (raw === undefined || raw === null || raw === '') return
	const numeric = Number(raw)
	if (!Number.isFinite(numeric)) throw new Error(`${path}.softEdges.radiusPt must be a finite number in points.`)
	if (numeric < 0 || numeric > 100) throw new Error(`${path}.softEdges.radiusPt must be between 0 and 100 points.`)
}

function validateAuthoringReflection(style = {}, path = 'block') {
	const reflection = style.reflection
	if (!reflection || typeof reflection !== 'object' || Array.isArray(reflection)) return
	const numeric = (value, label, minimum, maximum) => {
		if (value === undefined || value === null || value === '') return
		const parsed = Number(value)
		if (!Number.isFinite(parsed)) throw new Error(`${path}.reflection.${label} must be a finite number.`)
		if (parsed < minimum || parsed > maximum) throw new Error(`${path}.reflection.${label} must be between ${minimum} and ${maximum}.`)
	}
	numeric(reflection.blurPt ?? reflection.blur, 'blurPt', 0, 100)
	numeric(reflection.distancePt ?? reflection.offset, 'distancePt', 0, 200)
	numeric(reflection.directionDeg ?? reflection.angle, 'directionDeg', 0, 359)
	numeric(reflection.startOpacity ?? reflection.opacity, 'startOpacity', 0, 1)
	numeric(reflection.endOpacity, 'endOpacity', 0, 1)
	if (reflection.startPosition != null) numeric(reflection.startPosition, 'startPosition', 0, 1)
	else numeric(reflection.fadeStart, 'fadeStart', 0, 100)
	if (reflection.endPosition != null) numeric(reflection.endPosition, 'endPosition', 0, 1)
	else numeric(reflection.fadeEnd, 'fadeEnd', 0, 100)
}

function blockStyle(block, defaults = {}) {
	const style = {
		...defaults,
		...effectiveBlockStyle(block),
	}
	validateAuthoring3DDepth(style, `${block?.kind || 'block'}.text3D`)
	validateAuthoringShadowBlur(style, `${block?.kind || 'block'}`)
	validateAuthoringBlur(style, `${block?.kind || 'block'}`)
	validateAuthoringFillOverlay(style, `${block?.kind || 'block'}`)
	validateAuthoringGlow(style, `${block?.kind || 'block'}`)
	validateAuthoringSoftEdges(style, `${block?.kind || 'block'}`)
	validateAuthoringReflection(style, `${block?.kind || 'block'}`)
	return style
}

// M5 Declarative layout: let the AI omit absolute bbox and have the engine distribute
// content. Leading full-width text stacks at the top; the remaining bbox-less card/data
// blocks distribute as a row/grid (via splitCardRects) in the area below. Any block that
// DOES carry a bbox/rect is honored as-is (so this is a no-op for fully-anchored decks and
// the AI keeps absolute control whenever it wants it).
const LEAD_KINDS = new Set(['textBox', 'title', 'body', 'text', 'quote'])
// D5: structural elements recur on every slide (title, accent rule, brand eyebrow). Sharing
// these names must NOT auto-trigger a Morph between unrelated content slides, nor collapse
// their per-slide edit handles. An EXPLICIT transition:morph still pairs every shared name.
const STRUCTURAL_MORPH_SKIP = new Set(['t', 'r', 'title', 'rule', 'accent', 'brand', 'bg', 'background', 'subtitle', 'eyebrow', 'header', 'footer', 'meta', 'lede'])
// D12: bbox-less stat/kpi/textShape cards used to balloon to the full content band, leaving
// short content floating with hollow top/bottom. Cap card height and vertically center the
// row/grid so they read as intentional cards. Data/visual blocks (chart/table/image/3D/media)
// still take the full height they deserve, so split layouts like chart-left keep a tall chart.
const CARD_KINDS = new Set(['stat', 'kpi', 'textShape'])
const MAX_CARD_H = 3.0
const MIN_STACK_H = 0.45
const RAIL_KINDS = new Set(['stat', 'kpi', 'callout', 'eyebrow'])

// These are legacy client scaffolds, not authored content. A World already
// supplies the surface/background and accent treatment; retaining these named
// stage plates as ordinary blocks creates empty cards and consumes layout cells.
// Keep an explicit decorative/keep flag available for a genuinely intentional
// surface, but omit the accidental scaffolds by default.
function isEngineScaffoldBlock(block) {
	if (!block || block.keep === true || block.decorative === true) return false
	if (String(block.kind || '').toLowerCase() !== 'shape' || block.text) return false
	const name = String(block.name || block.objectName || '').toLowerCase()
	return /(^|[-_.])(stage|accent)$/.test(name) || name === 'annotation-stage' || /(^|[-_.])phase-\d+($|[-_.])/.test(name)
}

function hasSemanticShapeTreatment(block) {
	if (!block || String(block.kind || '').toLowerCase() !== 'shape') return true
	if (block.decorative === true || block.keep === true || block.visualIntent) return true
	const style = block.style && typeof block.style === 'object' ? block.style : {}
	const options = block.options && typeof block.options === 'object' ? block.options : {}
	const treatmentKeys = ['fill', 'line', 'shadow', 'reflection', 'softEdges', 'glow', 'effect3D', 'transparency', 'color', 'gradient']
	return treatmentKeys.some(key => Object.prototype.hasOwnProperty.call(style, key) || Object.prototype.hasOwnProperty.call(options, key))
}

// Semantic decorative geometry is still authored by meaning, not coordinates.
// The AI can request an accent rule/divider and choose its semantic host region;
// the engine derives the narrow rail from that region so it cannot consume an
// entire content column or collide with the copy it is meant to accent.
function semanticDecorativeShapeRect(block, host) {
	if (!host || String(block?.kind || '').toLowerCase() !== 'shape') return null
	const intent = block?.visualIntent && typeof block.visualIntent === 'object' ? block.visualIntent : null
	if (!intent) return null
	const purpose = String(intent.purpose || intent.role || '').trim().toLowerCase()
	if (!['accent-rule', 'divider'].includes(purpose)) return null
	const orientation = String(intent.orientation || 'vertical').trim().toLowerCase()
	const thickness = orientation === 'horizontal'
		? Math.max(0.06, Math.min(0.14, host.h * 0.018))
		: Math.max(0.06, Math.min(0.14, host.w * 0.018))
	const edge = String(intent.edge || 'start').trim().toLowerCase()
	if (orientation === 'horizontal') {
		const y = edge === 'end' ? host.y + host.h - thickness : Math.max(0.12, host.y - thickness - 0.08)
		return rect(host.x, y, host.w, thickness, 'semantic-divider')
	}
	const x = edge === 'end' ? host.x + host.w - thickness : Math.max(0.12, host.x - thickness - 0.08)
	return rect(x, host.y, thickness, host.h, 'semantic-accent-rule')
}

function semanticCardRect(block, host) {
	const kind = String(block?.kind || '').toLowerCase()
	// A named semantic host is a placement choice, not a request to stretch a
	// short callout across the entire column.  Keep callouts compact as well as
	// textShape cards; otherwise a rightThird/rail callout renders as a hollow
	// white panel with one line stranded at the bottom.
	if (!host || !['textshape', 'callout'].includes(kind) || blockHasExplicitGeometry(block) || !blockNamedRegion(block)) return null
	if (String(block.stackGroup || '').trim()) return null
	// A named region is a semantic host, not a request to stretch a short card to
	// the full column. Keep the card visually intentional and vertically balanced.
	const text = String(block.text || block.label || '').trim()
	const charsPerLine = Math.max(18, Math.floor(host.w * 12))
	const lines = Math.max(1, Math.ceil(text.length / charsPerLine))
	let cardH = kind === 'callout'
		? Math.min(1.8, Math.max(1.05, 0.78 + lines * 0.32))
		: Math.min(2.4, Math.max(1.35, 0.95 + lines * 0.34))
	if (host.role === 'caption-safe-footer-card' || /-callout$/.test(String(host.role || ''))) cardH = Math.min(cardH, host.h)
	// A compact semantic host (most notably the footer band) is an anchor, not
	// permission to grow past the slide edge.  When the desired card is taller
	// than its host, align its bottom to the host bottom so growth happens inward
	// toward the canvas.  This keeps engine-owned callouts/text-shapes on-slide
	// without asking the AI for coordinates or silently clipping the object.
	const cardY = cardH > host.h
		? host.y + host.h - cardH
		: host.y + (host.h - cardH) / 2
	return rect(host.x, cardY, host.w, cardH, kind === 'callout' ? 'semantic-callout' : 'semantic-card')
}

const INTENT_LAYOUT_DELEGATES = new Set(['image-left-copy-right', 'copy-left-image-right', 'chart-left-insights-right', 'insights-left-chart-right', 'two-column', 'three-column', 'metric-grid', 'sidebar-left', 'sidebar-right', 'comparison', 'title-only', 'section-divider', 'pull-quote'])
const CALLOUT_AFFINITY_INTENTS = new Set(['comparison', 'sidebar-left', 'sidebar-right', 'two-column', 'three-column', 'image-left-copy-right', 'copy-left-image-right', 'chart-left-insights-right', 'insights-left-chart-right'])
// Expressive hero typography is a visual focal object, not ordinary body text.
// Treat Text3D/WordArt as hero visuals so named region:"hero" uses the same
// reserved visual host as images and models instead of collapsing into the
// generic body band.
const HERO_VISUAL_KINDS = new Set(['image', 'image-feature', 'media', 'model3d', 'chart', 'chart-panel', 'table', 'table-panel', 'freeform', 'text3d', 'wordart'])
// A block's author-supplied geometry, from any of the natural forms (rect/bbox, or
// x/y/w/h on the block, or under options). Used so the auto-distributor leaves
// author-positioned blocks (e.g. a shape with options.x/y/w/h) exactly where they are.
function explicitGeometryOf(b) {
	if (!b) return null
	// autoPlaceBlocks writes a proposal bbox so downstream primitives can render
	// the solved rectangle. That proposal is still engine-owned geometry; it must
	// not be reclassified as author geometry when the compiler builds readback or
	// resolves named semantic regions. autoPlaceBlocks sets this marker only after
	// confirming that no explicit client geometry was supplied.
	if (b._enginePlaced === true) return null
	if (b._engineOwnedGeometry === true && b._engineRect && Number.isFinite(Number(b._engineRect.x))) {
		return {
			x: Number(b._engineRect.x),
			y: Number(b._engineRect.y),
			w: Number(b._engineRect.w),
			h: Number(b._engineRect.h),
		}
	}
	if (b.bbox && Number.isFinite(Number(b.bbox.y))) return b.bbox
	if (b.rect && Number.isFinite(Number(b.rect.y))) return b.rect
	const o = (b.options && typeof b.options === 'object') ? b.options : null
	if (o && [o.x, o.y, o.w, o.h].every(v => Number.isFinite(Number(v)))) return { x: Number(o.x), y: Number(o.y), w: Number(o.w), h: Number(o.h) }
	if ([b.x, b.y, b.w, b.h].every(v => Number.isFinite(Number(v)))) return { x: Number(b.x), y: Number(b.y), w: Number(b.w), h: Number(b.h) }
	return null
}
function blockHasExplicitGeometry(b) {
	return explicitGeometryOf(b) !== null
}
// M19 TEAMWORK — content[].region: the AI PICKS a named region from the offered layout
// plan (regionCatalog built-ins or its own slides[].regionPlan). A region pin is author
// judgment: the auto-distributor must honor the semantic region while the engine
// still owns the resulting rectangle.
function blockNamedRegion(b) {
	if (typeof b?.region !== 'string' || !b.region.trim()) return null
	const raw = b.region.trim()
	return normalizeRegionName(raw) || raw
}
function blockIsAuthorPositioned(b) {
	return blockHasExplicitGeometry(b) || blockNamedRegion(b) !== null
}
function autoPlaceBlocks(content, slideSize, arrange = null, intent = null, presenterZone = null, margin = DEFAULT_MARGIN, warningSink = null, warningSlideId = null, resolvedRegions = null) {
	if (!Array.isArray(content) || !content.length) return content
	if (!content.some(b => b && !blockIsAuthorPositioned(b))) return content
	const W = (slideSize && slideSize.w) || WIDE_SLIDE.w
	const H = (slideSize && slideSize.h) || WIDE_SLIDE.h
	const m = Number.isFinite(Number(margin)) ? Number(margin) : DEFAULT_MARGIN
	const contentBand = contentBandForPresenterZone(presenterZone, W, m)
	const L = contentBand?.x ?? m
	const R = contentBand ? W - (contentBand.x + contentBand.w) : m
	const lowerPresenter = lowerPresenterZone(presenterZone)
	const top = 0.62
	const bottom = Math.max(0.55, lowerPresenter ? H - (lowerPresenter.y0 - GAP) : 0)
	const contentW = W - L - R
	const out = content.map(b => ({ ...b }))
	// A semantic side-pinned callout changes the available copy lane. Let the
	// shared resolver see the original semantic blocks; array-order lead preflow
	// would otherwise stamp a full-width body bbox before chooseRegion can
	// subtract the callout lane.
	const sidePinnedCallout = out.some(b => b?.kind === 'callout' && ['leftThird', 'rightThird'].includes(blockNamedRegion(b)))
	if (sidePinnedCallout) return out
	// TEAMWORK — every block the ENGINE is about to place (no author geometry) is tagged so the
	// compiled plan can label its rect as a PROPOSAL (placementSource:'engine'), not a verdict:
	// the AI reads the proposed rects in dryRun and takes ownership by pinning bbox / arrange.
	for (const b of out) if (b && !blockIsAuthorPositioned(b)) b._enginePlaced = true
	// These intents already encode semantic region assignment in chooseRegion.
	// Do not pre-grid them by array order, or the generated proposal will mask the
	// intent and put copy/visuals on the same side. The compiler will place them
	// into the balanced semantic regions below.
	// These intents have semantic region ownership. Do not replace that contract
	// with array-order pre-gridding merely because the AI also requested weighted
	// arrangement; regionCatalog has already applied the same semantic split.
	if (INTENT_LAYOUT_DELEGATES.has(intent)) return out
	// A hero with a visual is also a semantic layout family. The poster-style
	// title-only hero can use the lead-stack auto-flow below, but a visual hero
	// needs chooseRegion() to reserve a non-overlapping visual host.
	if (intent === 'hero' && out.some(b => HERO_VISUAL_KINDS.has(String(b?.kind || '').toLowerCase()))) return out
	// Generic title-body/hero compositions still have semantic callout affinity:
	// an unpinned callout belongs in the compact bottom band resolved by
	// chooseRegion(), not in the implicit full-height card grid. Pre-gridding it
	// creates a hollow panel and strands one line of text inside it.
	if (out.some(b => b?.kind === 'callout') && !CALLOUT_AFFINITY_INTENTS.has(intent)) return out
	let cursorY = top
	let i = 0
	const placedLeads = []
	for (; i < out.length; i += 1) {
		const b = out[i]
		// Footer/metadata belongs to the protected footer band. It must not be
		// consumed by the lead stack or the body grid.
		if (isFooterBlock(b)) continue
		// A block carrying its own geometry (bbox/rect OR options.x/y/w/h OR top-level
		// x/y/w/h) is already positioned by the author — leave it where it is. Only a
		// true rect/bbox advances the auto-flow cursor (original behavior, for a pinned
		// header); an options-positioned block elsewhere must NOT shift the auto-stack.
		if (blockIsAuthorPositioned(b)) {
			const r = b.bbox || b.rect
			if (r && typeof r.y === 'number' && typeof r.h === 'number') cursorY = Math.max(cursorY, r.y + r.h + 0.12)
			continue
		}
		if (!LEAD_KINDS.has(b.kind)) break
		const isTitle = i === 0
		const h = isTitle ? Math.max(TITLE_H, Number(resolvedRegions?.title?.h) || TITLE_H) : 0.6
		b.bbox = { x: L, y: cursorY, w: contentW, h }
		placedLeads.push(b)
		cursorY += h + (isTitle ? 0.18 : 0.12)
	}
	const rest = []
	for (let j = i; j < out.length; j += 1) {
		if (!blockIsAuthorPositioned(out[j]) && !isFooterBlock(out[j])) rest.push(out[j])
	}
	// D-cover-center: a pure title/cover slide (only lead text, no card/data blocks) should sit
	// vertically centered rather than jammed at the top with a large empty void below.
	// M18 hero: anchor the lead stack LOW (poster/magazine feel) instead of dead-center.
	// Guard: only center/anchor on a COVER intent, or when there is genuinely no non-lead
	// content. A content slide whose only other block is author-positioned (e.g. an image
	// at explicit x/y) must NOT center its title (that block is excluded from `rest`).
	const _isCoverIntent = intent === 'hero' || intent === 'title-only'
	const _hasNonLeadContent = out.some(b => b && !LEAD_KINDS.has(b.kind) && !isFooterBlock(b))
	if (!rest.length && placedLeads.length && (_isCoverIntent || (placedLeads.length === 1 && !_hasNonLeadContent))) {
		const firstY = placedLeads[0].bbox.y
		const lastBox = placedLeads[placedLeads.length - 1].bbox
		const usableMid = intent === 'hero' && !lowerPresenter ? (H * 0.66) : (top + (H - bottom)) / 2
		const stackMid = (firstY + lastBox.y + lastBox.h) / 2
		const shift = Math.max(0, usableMid - stackMid)
		if (shift > 0.1) for (const b of placedLeads) b.bbox = { ...b.bbox, y: b.bbox.y + shift }
	}
	// M18 sidebar: an asymmetric rail + main split. Rail kinds (stat/kpi/callout) stack in a
	// narrow column; everything else fills the wide column. The lead title stays full-width on top.
	if (rest.length && (intent === 'sidebar-left' || intent === 'sidebar-right')) {
		const areaY = cursorY + 0.1
		const areaH = Math.max(1.5, H - bottom - areaY)
		const railW = contentW * 0.30
		const mainW = contentW - railW - GAP
		const leftRail = intent === 'sidebar-left'
		const railX = leftRail ? L : L + mainW + GAP
		const mainX = leftRail ? L + railW + GAP : L
		const railBlocks = rest.filter(b => RAIL_KINDS.has(b.kind))
		const mainBlocks = rest.filter(b => !RAIL_KINDS.has(b.kind))
		const placeCol = (blocks, x, w, cap, laneRole) => {
			const n = blocks.length || 1
			const rawCh = (areaH - GAP * (n - 1)) / n
			if (n > 0 && rawCh < MIN_STACK_H) {
				const rects = splitCardRects({ x, y: areaY, w, h: areaH }, n, { maxCols: 2 })
				blocks.forEach((b, i) => { const r = rects[i]; b.bbox = { x: r.x, y: r.y, w: r.w, h: r.h } })
				if (Array.isArray(warningSink)) warningSink.push({
					code: 'ARRANGE_SIDEBAR_TOO_DENSE',
					severity: 'warning',
					slideId: warningSlideId,
					message: `Semantic ${laneRole} sidebar lane is too dense; using a bounded engine grid inside the lane.`,
					reason: 'The requested sidebar composition would place one or more semantic blocks below the slide canvas.',
					fix: 'Reduce substantive blocks, split the story across slides, or revise the AI-authored frames.',
					evidence: { layoutIntent: intent, lane: laneRole, blockCount: n, availableHeightIn: Number(areaH.toFixed(3)), gapIn: GAP, minimumLaneHeightIn: MIN_STACK_H, fallback: 'lane-grid' },
					suggestions: [{ layoutIntent: 'two-column' }, { layoutIntent: 'title-body' }, 'split across slides'],
				})
				return
			}
			const ch = cap ? Math.min(rawCh, MAX_CARD_H) : rawCh
			const stackH = n * ch + GAP * (n - 1)
			const yOff = areaY + (cap ? Math.max(0, (areaH - stackH) / 2) : 0)
			blocks.forEach((b, i) => { b.bbox = { x, y: yOff + i * (ch + GAP), w, h: ch } })
		}
		placeCol(railBlocks, railX, railW, true, 'sidebar')
		placeCol(mainBlocks, mainX, mainW, false, 'main')
		return out
	}
	if (rest.length) {
		const areaY = cursorY + 0.1
		const areaH = Math.max(1.5, H - bottom - areaY)
		const area = { x: L, y: areaY, w: contentW, h: areaH }
		// Named arrangements the AI drives: arrange:{split:[60,40]} (ratio columns; block k -> column
		// min(k, cols-1), extras stack in the last column), arrange:{cols:2..4} (balanced semantic
		// grid), or arrange:"stack" (full-width vertical). Default = the implicit row/grid via
		// splitCardRects. Absolute bbox always overrides upstream.
		const rawSplitRatios = Array.isArray(arrange?.split) ? arrange.split.map(Number) : null
		// Weighted semantic splits are positive proportions, never coordinates. Keep
		// malformed input out of the rectangle math; planDeckLayout reports an
		// actionable warning and falls back to the normal engine arrangement.
		const splitRatios = rawSplitRatios && splitRatiosAreSafe(rawSplitRatios, area.w - GAP * (rawSplitRatios.length - 1))
			? rawSplitRatios
			: null
		const requestedCols = Number(arrange?.cols)
		// The public semantic grammar is intentionally 2–4 columns. A one-column
		// request is ambiguous with stack and is handled as the implicit default;
		// planDeckLayout emits a visible warning so the AI can choose deliberately.
		const gridCols = Number.isInteger(requestedCols) && requestedCols >= 2 ? Math.min(4, requestedCols) : null
		if (splitRatios) {
			const sum = splitRatios.reduce((a, c) => a + (c || 0), 0) || 1
			const cols = []; let cx = area.x
			splitRatios.forEach(rt => { const cw = (area.w - GAP * (splitRatios.length - 1)) * ((rt || 0) / sum); cols.push({ x: cx, w: cw }); cx += cw + GAP })
			const perCol = cols.map(() => [])
			// Keep weighted lanes semantically meaningful while distributing extras
			// evenly. If any lane would fall below the stack minimum, use the
			// bounded engine grid instead of emitting negative/zero-height boxes.
			rest.forEach((b, k) => perCol[k % cols.length].push(b))
			const tooDense = perCol.some(blocks => {
				const n = blocks.length
				return n > 0 && (area.h - GAP * (n - 1)) / n < MIN_STACK_H
			})
			if (tooDense) {
				const rects = splitCardRects(area, rest.length, { maxCols: Math.min(4, cols.length) })
				rest.forEach((b, k) => { const r = rects[k]; b.bbox = { x: r.x, y: r.y, w: r.w, h: r.h } })
				if (Array.isArray(warningSink)) warningSink.push({
					code: 'ARRANGE_SPLIT_TOO_DENSE',
					severity: 'warning',
					slideId: warningSlideId,
					message: 'Semantic arrange.split is too dense for the available slide body; using a bounded engine grid.',
					reason: 'One or more weighted lanes would fall below the engine minimum after semantic blocks are distributed.',
					fix: 'Reduce substantive blocks, split the story across slides, or revise the AI-authored frames.',
					evidence: { requested: 'split', blockCount: rest.length, laneCount: cols.length, availableHeightIn: Number(area.h.toFixed(3)), gapIn: GAP, minimumLaneHeightIn: MIN_STACK_H, fallback: 'engine-grid' },
					suggestions: [{ cols: Math.min(4, cols.length) }, { layoutIntent: 'two-column' }, 'split across slides'],
				})
			} else {
				perCol.forEach((blocks, ci) => { const n = blocks.length || 1; const rawCh = (area.h - GAP * (n - 1)) / n
					const allCards = blocks.length > 0 && blocks.every(b => CARD_KINDS.has(b.kind))
					const ch = allCards ? Math.min(rawCh, MAX_CARD_H) : rawCh
					const stackH = n * ch + GAP * (n - 1)
					const yOff = area.y + (allCards ? Math.max(0, (area.h - stackH) / 2) : 0)
					blocks.forEach((b, bi) => { b.bbox = { x: cols[ci].x, y: yOff + bi * (ch + GAP), w: cols[ci].w, h: ch } }) })
			}
		} else if (gridCols) {
			const requestedRows = Math.ceil(rest.length / gridCols)
			const requestedCellH = (area.h - GAP * (requestedRows - 1)) / requestedRows
			// A named column count is a semantic preference, not permission to
			// compress a dense story into unreadable rows. When the requested grid
			// falls below the same minimum lane height used by stack/split/sidebar,
			// widen it to the bounded four-column engine grid (when possible) and
			// tell the AI why. At four columns the warning remains actionable: the
			// engine has reached its safe grid limit and the story must be reduced
			// or split rather than shrinking text indefinitely.
			const denseGrid = rest.length > 0 && requestedCellH < MIN_STACK_H
			const resolvedGridCols = denseGrid ? 4 : gridCols
			const rows = Math.ceil(rest.length / resolvedGridCols)
			const cellW = (area.w - GAP * (resolvedGridCols - 1)) / resolvedGridCols
			const cellH = (area.h - GAP * (rows - 1)) / rows
			if (denseGrid && Array.isArray(warningSink)) warningSink.push({
				code: 'ARRANGE_COLS_TOO_DENSE',
				severity: 'warning',
				slideId: warningSlideId,
				message: 'Semantic arrange.cols is too dense for the available slide body; using the bounded engine grid.',
				reason: 'The requested column count would compress one or more semantic rows below the engine minimum readable height.',
					fix: 'Reduce substantive blocks, split the story across slides, or revise the AI-authored frames.',
				evidence: { requested: gridCols, resolvedColumns: resolvedGridCols, blockCount: rest.length, availableHeightIn: Number(area.h.toFixed(3)), requestedRowHeightIn: Number(requestedCellH.toFixed(3)), resolvedRowHeightIn: Number(cellH.toFixed(3)), minimumLaneHeightIn: MIN_STACK_H, fallback: 'engine-grid' },
				suggestions: [{ cols: 4 }, { layoutIntent: 'two-column' }, 'split across slides'],
			})
			const allCards = rest.every(b => CARD_KINDS.has(b.kind))
			const rowH = allCards ? Math.min(cellH, MAX_CARD_H) : cellH
			const gridH = rows * rowH + GAP * (rows - 1)
			const yOffset = area.y + (allCards ? Math.max(0, (area.h - gridH) / 2) : 0)
			rest.forEach((b, k) => {
				const row = Math.floor(k / resolvedGridCols)
				const col = k % resolvedGridCols
				b.bbox = { x: area.x + col * (cellW + GAP), y: yOffset + row * (rowH + GAP), w: cellW, h: rowH }
			})
		} else if (arrange === 'stack' || arrange?.stack === true) {
			const n = rest.length
			const ch = (area.h - GAP * (n - 1)) / n
			// A full-width stack is a semantic choice for a short sequence, not a
			// permission to push an arbitrary number of blocks below the canvas.
			// Once the usable lane falls below the same 0.45in minimum used by the
			// semantic stack resolver, fall back to the bounded engine grid and tell
			// the AI which semantic levers to revise. This keeps every proposal
			// package-safe while preserving the author's meaning-first workflow.
			if (!(ch >= MIN_STACK_H)) {
				const rects = splitCardRects(area, n)
				rest.forEach((b, k) => { const r = rects[k]; b.bbox = { x: r.x, y: r.y, w: r.w, h: r.h } })
				if (Array.isArray(warningSink)) warningSink.push({
					code: 'ARRANGE_STACK_TOO_DENSE',
					severity: 'warning',
					slideId: warningSlideId,
					message: 'Semantic arrange:"stack" is too dense for the available slide body; using the bounded engine grid.',
					reason: 'A full-width vertical stack would produce lanes below the engine minimum and place content outside the slide canvas.',
					fix: 'Reduce the number of substantive blocks, split the story across slides, or choose arrange.cols 2–4; do not author coordinates.',
					evidence: { requested: 'stack', blockCount: n, availableHeightIn: Number(area.h.toFixed(3)), gapIn: GAP, resolvedLaneHeightIn: Number(ch.toFixed(3)), minimumLaneHeightIn: MIN_STACK_H, fallback: 'engine-grid' },
					suggestions: [{ cols: 2 }, { cols: 3 }, { cols: 4 }, 'split across slides'],
				})
			} else {
				rest.forEach((b, k) => { b.bbox = { x: area.x, y: area.y + k * (ch + GAP), w: area.w, h: ch } })
			}
		} else {
			const rects = splitCardRects(area, rest.length)
			const allCards = rest.every(b => CARD_KINDS.has(b.kind))
				if (allCards) {
					const rowKeys = [...new Set(rects.map(r => Math.round(r.y * 1000)))].sort((a, b) => a - b)
					const rowH = Math.min(rects[0].h, MAX_CARD_H)
					const gridH = rowKeys.length * rowH + GAP * (rowKeys.length - 1)
					const yOffset = area.y + Math.max(0, (area.h - gridH) / 2)
					rest.forEach((b, k) => {
						const ri = rowKeys.indexOf(Math.round(rects[k].y * 1000))
						b.bbox = { x: rects[k].x, y: yOffset + ri * (rowH + GAP), w: rects[k].w, h: rowH }
					})
				} else {
					rest.forEach((b, k) => { b.bbox = { x: rects[k].x, y: rects[k].y, w: rects[k].w, h: rects[k].h } })
				}
		}
	}
	return out
}

// A semantic region is a host area, not a request to stamp every block at the
// same full-size rectangle.  When an AI intentionally assigns several
// substantive blocks to one named region, solve a compact vertical stack inside
// that region.  Decorative/geometry-only shapes stay untouched so they can act
// as intentional rails or backgrounds; substantive blocks never silently
// overlap merely because they share a semantic region name.
function namedRegionStackRects(content, regions) {
	const groups = new Map()
	for (const block of content || []) {
		if (!block || !blockNamedRegion(block) || blockHasExplicitGeometry(block)) continue
		if (String(block.kind || '').toLowerCase() === 'shape' && !String(block.stackGroup || '').trim()) continue
		if (block.decorative === true && block.clusterHost !== true) continue
		const name = blockNamedRegion(block)
		if (!regions?.[name] || !Number.isFinite(Number(regions[name].x))) continue
		if (!groups.has(name)) groups.set(name, [])
		groups.get(name).push(block)
	}
	const result = new Map()
	for (const blocks of groups.values()) {
		if (!blocks.length) continue
		const region = regions[blockNamedRegion(blocks[0])]
		const clustered = clusteredStackRects(blocks, region)
		for (const [block, blockRect] of clustered.entries()) result.set(block, blockRect)
	}
	return result
}

function clusteredStackRects(blocks, region) {
	if (!region || !Array.isArray(blocks) || !blocks.length) return new Map()
	if (blocks.length === 1 && !String(blocks[0]?.stackGroup || '').trim()) {
		const single = new Map()
		single.set(blocks[0], compactTypeHostRect(blocks[0], region) || region)
		return single
	}
	const units = []
	const seen = new Map()
	for (const block of blocks) {
		const group = String(block?.stackGroup || '').trim()
		if (!group) {
			units.push({ kind: block.kind, role: block.role, text: block.text, members: [block] })
			continue
		}
		if (seen.has(group)) {
			seen.get(group).members.push(block)
			continue
		}
		const unit = { kind: 'textShape', role: 'cluster', text: group, members: [block] }
		seen.set(group, unit)
		units.push(unit)
	}
	if (units.length === 1 && units[0].members.length === 1) {
		const only = units[0].members[0]
		const single = new Map()
		single.set(only, compactTypeHostRect(only, region) || region)
		return single
	}
	const solvedUnits = semanticStackRects(units, region, {
		sortByKind: false,
		role: region.role || blockNamedRegion(units[0]?.members?.[0]) || 'clustered-stack',
	})
	const result = new Map()
	for (const unit of units) {
		const host = solvedUnits.get(unit)
		if (!host) continue
		const plates = unit.members.filter(item => item?.clusterHost === true)
		const stacked = unit.members.filter(item => item?.clusterHost !== true)
		for (const plate of plates) result.set(plate, host)
		if (!stacked.length) continue
		if (stacked.length === 1) {
			result.set(stacked[0], compactTypeHostRect(stacked[0], host) || host)
			continue
		}
		const inner = semanticStackRects(stacked, host, { sortByKind: false, role: 'html-cluster' })
		for (const [member, memberRect] of inner.entries()) result.set(member, memberRect)
	}
	return result
}

function resolveExplicitBlockRect(block, fallback, role = null, preservePrecision = false) {
	// Honor geometry from the natural authoring forms: block.rect/bbox, OR x/y/w/h on
	// the block, OR x/y/w/h under options (the way the primitive tools take geometry —
	// an AI naturally writes options:{x,y,w,h}). Without this, a shape/image with
	// options.x/y/w/h was silently auto-placed (audit finding).
	const fromEngine = block?._engineOwnedGeometry === true && block._engineRect && Number.isFinite(Number(block._engineRect.x))
		? { x: Number(block._engineRect.x), y: Number(block._engineRect.y), w: Number(block._engineRect.w), h: Number(block._engineRect.h) }
		: null
	const o = (block && typeof block.options === 'object') ? block.options : null
	const fromOptions = o && [o.x, o.y, o.w, o.h].every(v => Number.isFinite(Number(v))) ? { x: o.x, y: o.y, w: o.w, h: o.h, role: o.role } : null
	const fromTop = block && [block.x, block.y, block.w, block.h].every(v => Number.isFinite(Number(v))) ? { x: block.x, y: block.y, w: block.w, h: block.h } : null
	return explicitRect(fromEngine || block?.rect || block?.bbox || fromOptions || fromTop, role || block?.role || block?.kind || 'explicit', preservePrecision) || fallback
}

function nativePreservationHandle(block = {}) {
	const native = block.nativePreservation && typeof block.nativePreservation === 'object' ? block.nativePreservation : null
	return native?.handle || native?.preservationHandle || block.preservationHandle || null
}

function shouldUseNativePreservation(block = {}, preserveSourceGeometry = false) {
	if (!preserveSourceGeometry || block.kind === 'opaqueNative') return false
	// A sampled stopped pose (including null reset) must be revalidated from its
	// durable original source, never restored as an unchecked binary snapshot.
	if (block.kind === 'model3d' && [block, block.modelOptions, block.model3dOptions].some(value => value && Object.prototype.hasOwnProperty.call(value, 'staticPose'))) return false
	if (block.kind === 'model3d' && model3dMotionFraming(block) !== undefined) return false
	if (block.preserveNative === false || block.nativePreservation === false) return false
	if (block.patch || block.delete === true || block.remove === true) return false
	return typeof nativePreservationHandle(block) === 'string' && nativePreservationHandle(block).trim() !== ''
}

// A rigged model with a selected Scene auto-plays that embedded clip (the clip IS the motion).
// The clip is SELECTED + played by the playScene animation's `embedded{animId+1}` channel (PowerPoint's
// round-trip-safe selector); the am3d:embedAnim ext is NOT emitted (it corrupts the deck, 0x80070570).
// So animId must ride on the animation → the playScene builder maps it to the embedded channel. A
// non-number animId yields NO playback (→ falls through to the world turntable); loop follows
// Boolean(scene.loop) with undefined/null defaulting to looping; only a real numeric length sets
// the ramp duration. Returns null when the scene is absent/invalid.
function autoScenePlayAnimation(scene) {
	if (!scene || typeof scene !== 'object') return null
	if (typeof scene.animId !== 'number' || !Number.isFinite(scene.animId)) return null
	const anim = { type: 'emphasis', effect: 'playScene', trigger: 'afterPrevious', animId: Math.max(0, Math.round(scene.animId)) }
	if (typeof scene.length === 'number' && Number.isFinite(scene.length)) anim.duration = Math.max(1, Math.round(scene.length))
	// Single pass only when loop is explicitly present and falsy (matches the emitter's Boolean()).
	if (scene.loop !== undefined && scene.loop !== null && !scene.loop) anim.loop = false
	return anim
}

function planBlock({ spec, slide, slideIndex = 0, block, blockIndex, regions, regionRect = null, theme, warnings, handles, templateContract, preserveSourceGeometry = false, preserveAuthoredPrecision = false }) {
	const objects = []
	// Default elevation is a World temperament, not a universal decoration.
	// Flat/quiet/outline Worlds explicitly resolve depth.shadow:'none'; preserve
	// that decision for every semantic data/card primitive while still allowing
	// an authored style.shadow to override the default.
	const worldDepth = artDepthForSpec(spec)
	const defaultShadow = worldDepth?.shadow === 'none' ? null : subtleShadow(0.13, 3, 1)
	// Normalize author intent once: fold content[].options (the natural way an AI
	// expresses styling, matching the primitive tools) into block.style for every
	// kind. effectiveBlockStyle only lifts cosmetic style keys, so data fields
	// (chartType/data/modelAsset/nodes/items) are untouched. This lets the AI draw
	// its own shapes, accents, and decorations through the spec instead of relying
	// on a fixed engine skin.
	block = { ...block, style: effectiveBlockStyle(block, theme) }
	// Natural vocabulary: kind "image"/"photo" is the canonical image-feature (M21 —
	// AIs write kind:"image" constantly; routing it to text was a silent surprise).
	if (['image', 'photo'].includes(String(block.kind || '').toLowerCase())) block = { ...block, kind: 'image-feature' }
	const blockName = block.name || `block-${blockIndex + 1}`
	if (!block.name) {
		warnings.push({
			code: 'UNSTABLE_HANDLE',
			severity: 'warning',
			slideId: slide.id,
			message: 'Block has no stable name; positional fallback will be used.',
			reason: 'Later edits, narration cues, interactions, and Morph pairing need a stable semantic content name.',
			fix: 'Add a concise unique content[].name and rerun dryRun; do not target generated handles by position.',
			evidence: { blockKind: block.kind || null, generatedFallbackName: blockName, namingAuthority: 'AI-semantic-name' },
		})
	}
	// M19 TEAMWORK — content[].region: the AI picked a named region (from the offered
	// catalog or its own regionPlan); that pick IS the confirmation and outranks the
	// engine's auto-choice. Precedence: explicit rect/bbox > region > auto-placement.
	// An unknown name degrades soft: warn with the live vocabulary.
	let base = null
	const namedRegion = explicitRect(block.rect || block.bbox, 'explicit') ? null : blockNamedRegion(block)
	// A hero visual is a semantic host, not the generic body rectangle exposed by
	// the region catalog.  When the AI selects region:"hero" on a visual hero,
	// let the same hero solver that auto-placement uses reserve the title/callout
	// lanes and return the focal visual rectangle.  This keeps named-region
	// authoring and engine-proposed authoring on one quality path.
	const namedHeroVisual = namedRegion === 'hero'
		&& slide.layoutIntent === 'hero'
		&& HERO_VISUAL_KINDS.has(String(block.kind || '').toLowerCase())
	if (namedHeroVisual) {
		base = chooseRegion(block, slide, regions, blockIndex)
	} else if (namedRegion) {
		const named = regions[namedRegion]
		if (named && typeof named === 'object' && Number.isFinite(Number(named.x))) {
			const solved = regionRect && Number.isFinite(Number(regionRect.x)) ? regionRect : named
			base = rect(Number(solved.x), Number(solved.y), Number(solved.w), Number(solved.h), solved.role || named.role || namedRegion)
		} else if (!RESERVED_SEMANTIC_REGIONS.has(namedRegion)) {
			warnings.push({
				code: 'UNKNOWN_REGION',
				severity: 'warning',
				slideId: slide.id,
				blockName,
				message: `content[].region "${namedRegion}" is not a region on this slide; auto-placement used instead.`,
				reason: 'The requested semantic region is not present in the selected layout vocabulary, so the engine used its safe auto-placement fallback.',
				fix: 'Choose a named region from the current engine readback or remove content[].region and let the selected layoutIntent assign it.',
				evidence: { requestedRegion: namedRegion, availableRegions: Object.keys(regions).filter(k => regions[k] && typeof regions[k] === 'object' && Number.isFinite(Number(regions[k].x))), fallback: 'auto-placement' },
				suggestions: Object.keys(regions).filter(k => regions[k] && typeof regions[k] === 'object' && Number.isFinite(Number(regions[k].x))),
			})
		}
	}
	if (!base) base = chooseRegion(block, slide, regions, blockIndex)
	// In semantic mode, visualIntent may refine the engine host into a compact
	// treatment rectangle. In explicit AI-authored geometry mode, a supplied
	// rectangle is the composition decision and must remain authoritative; style
	// still flows through the native treatment without silently moving the object.
	const aiAuthoredGeometry = isAiAuthoredGeometrySpec(spec)
	if (!(aiAuthoredGeometry && blockHasExplicitGeometry(block))) {
		const semanticShapeRect = semanticDecorativeShapeRect(block, base)
		if (semanticShapeRect) base = semanticShapeRect
		const semanticCard = semanticCardRect(block, base)
		if (semanticCard) base = semanticCard
	}
	const engineOwnedGeometry = block?._engineOwnedGeometry === true
	// Only an actual author-owned source rectangle may bypass layout's 0.001-inch
	// grid. Track the resolved rectangle by identity so fallback hosts and derived
	// child/layout rectangles keep their existing rounding; no marker reaches IR.
	const preciseSourceRects = new WeakSet()
	const explicitBlockRect = (sourceBlock, fallback, role = null) => {
		const preservePrecision = preserveAuthoredPrecision && sourceBlock?._engineOwnedGeometry !== true && blockHasExplicitGeometry(sourceBlock)
		const resolved = resolveExplicitBlockRect(sourceBlock, fallback, role, preservePrecision)
		if (preservePrecision && resolved && resolved !== fallback) preciseSourceRects.add(resolved)
		return resolved
	}
	const common = {
		slideId: slide.id,
		blockName,
		blockKind: block.kind,
		dataRef: block.dataRef,
		assetRef: block.assetRef,
		// Rotation is a common native transform, not a carrier-specific style leaf.
		// Preserve the authored top-level value through semantic layout so the
		// compiler can normalize and serialize it for every applicable object.
		...(Object.prototype.hasOwnProperty.call(block, 'rotate') ? { rotate: block.rotate } : {}),
		...(Object.prototype.hasOwnProperty.call(block, 'flipH') ? { flipH: block.flipH } : {}),
		...(Object.prototype.hasOwnProperty.call(block, 'flipV') ? { flipV: block.flipV } : {}),
		// Hyperlink destination is semantic object state, not a cosmetic style.
		// Keep a top-level authored link attached while layout resolves geometry so
		// shape and whole-text carriers reach the compiler unchanged.
		...(Object.prototype.hasOwnProperty.call(block, 'hyperlink') ? { hyperlink: block.hyperlink } : {}),
		// D8: an intentional decorative-bleed element (e.g. a glow-wash/ring that bleeds
		// off-canvas for atmosphere) is exempt from the off-slide hard error + overlap lint.
		bleed: block.bleed === true || block.decorative === true,
		placeholderBinding: templateContract?.placeholders?.length ? 'contract-aware-or-geometry' : 'geometry-matched-fallback',
		// TEAMWORK — placementSource describes rectangle ownership: 'author' only when
		// explicit geometry (or source-preserved geometry) supplied the rect, and 'engine'
		// whenever the layout engine solved it. placementIntentSource separately records
		// whether the semantic region choice came from the AI or the engine proposal.
		placementSource: engineOwnedGeometry ? 'engine' : blockHasExplicitGeometry(block) ? 'author' : 'engine',
		placementIntentSource: engineOwnedGeometry ? 'engine-proposal' : blockHasExplicitGeometry(block) ? 'author-geometry' : blockNamedRegion(block) ? 'author-semantic-region' : 'engine-proposal',
	}
	const addObject = obj => {
		const { warningSource, ...payload } = obj
		// A semantic block may lower to more than one native carrier.  Pictures
		// with an authored frame are the clearest example: the AI names the
		// picture once, while the engine also emits a backing frame shape.  The
		// primary carrier keeps the authored identity; derived carriers receive a
		// stable role suffix so they remain editable without making cue targeting
		// ambiguous.  This is identity bookkeeping only—the AI still owns the
		// geometry, overlap, stacking and timing decisions.
		const authoredObjectName = typeof block.objectName === 'string' && block.objectName.trim() ? block.objectName.trim() : null
		const primaryRole = block.role || ({
			'image-feature': 'image',
			'media': 'media',
		}[String(block.kind || '').toLowerCase()] || block.kind)
		const isDerivedCarrier = Boolean(authoredObjectName && payload.objectName == null && payload.role && payload.role !== primaryRole)
		const carrierRole = String(payload.role || block.kind || 'object').trim().replace(/[^A-Za-z0-9_.-]+/g, '-') || 'object'
		const objectName = payload.objectName || (isDerivedCarrier ? `${authoredObjectName}.${carrierRole}` : authoredObjectName || createObjectName(slide.id, blockName, payload.role || block.kind))
		const editHandle = payload.editHandle || (isDerivedCarrier ? stableHandle('semantic-spec', slide.id, objectName, spec.schemaVersion) : block.editHandle || stableHandle('semantic-spec', slide.id, objectName, spec.schemaVersion))
		if (handles.has(editHandle)) warnings.push({
			code: 'DUPLICATE_HANDLE',
			severity: 'error',
			slideId: slide.id,
			objectName,
			message: 'Duplicate edit handle.',
			reason: 'Two semantic objects resolve to the same edit identity, so later edits or cue targets would be ambiguous.',
			fix: 'Give each content block a unique semantic name/editHandle and rerun dryRun; never rely on array position.',
			evidence: { editHandle, objectName, uniquenessScope: 'deck' },
		})
		handles.add(editHandle)
		const coordinate = preciseSourceRects.has(payload.rect) ? Number : round
		const normalized = {
			...common,
			...payload,
			objectName,
			editHandle,
			rect: {
				x: coordinate(payload.rect.x),
				y: coordinate(payload.rect.y),
				w: coordinate(payload.rect.w),
				h: coordinate(payload.rect.h),
			},
		}
		objects.push(normalized)
		makeWarningsForBlock(warningSource || block, slide, objectName, normalized.rect, warnings)
	}

	if (shouldUseNativePreservation(block, preserveSourceGeometry)) {
		const native = block.nativePreservation && typeof block.nativePreservation === 'object' ? block.nativePreservation : {}
		addObject({
			role: block.role || 'native-preserved',
			primitive: 'opaqueNative',
			preservationHandle: nativePreservationHandle(block),
			visibleSummary: native.visibleSummary || block.visibleSummary || `${block.kind || 'object'} preserved from opened deck`,
			editabilityTier: native.editabilityTier || block.editabilityTier || 'semantic',
			dependencyHandles: native.dependencyHandles || block.dependencyHandles,
			allowedEdits: native.allowedEdits || block.allowedEdits || ['retain', 'move', 'resize', 'recolor', 'delete'],
			preserveGeometry: block.preserveGeometry === true,
			rect: explicitBlockRect(block, base, block.kind || 'native-preserved'),
			style: blockStyle(block, {}),
			altText: block.altText || block.visibleSummary || native.visibleSummary || `${block.kind || 'object'} preserved from opened deck`,
		})
		return objects
	}

	if (block.kind === 'stat' || block.kind === 'kpi') {
		// A single, faithful KPI card: big value, small label, optional signed delta —
		// stacked, auto-fit, with depth. Everything overridable via options.
		const box = explicitBlockRect(block, base, 'stat')
		const author = effectiveBlockStyle(block)
		const value = String(block.value ?? block.text ?? '')
		const label = String(block.label ?? '')
		const delta = block.delta != null ? String(block.delta) : ''
		// Scale the hero value to the card height so a tall KPI card reads as a big,
		// deliberate number instead of a small block floating in empty space (autoFit
		// only shrinks, never grows). Author fontSize still wins.
		const cardH = box.h || 1.4
		const metricTreatment = String(block?.visualIntent?.metricTreatment || block?.visualIntent?.treatment || block?.metricTreatment || '').toLowerCase()
		const monumental = metricTreatment === 'monumental' || metricTreatment === 'bare-monumental'
		const valueFontSize = author.fontSize || Math.round(monumental
			? Math.max(42, Math.min(76, cardH * 18))
			: Math.max(26, Math.min(56, cardH * 13)))
		const labelFontSize = Math.round(Math.max(READABILITY_TYPE_FLOORS_PT.dataLabel, Math.min(17, cardH * 4.5)))
		const deltaFontSize = Math.round(Math.max(READABILITY_TYPE_FLOORS_PT.dataLabel, Math.min(15, cardH * 4)))
		const text = [{ text: value, options: { fontSize: valueFontSize, bold: true, color: author.color || block.valueColor || theme.accent, breakLine: !!(label || delta) } }]
		// Delta colour: author override wins (deltaColor) so a strict one-accent
		// palette isn't broken by the positive/negative auto-colour; else auto.
		const dColor = block.deltaColor || block.options?.deltaColor || deltaColor(delta, theme)
		if (label) text.push({ text: label, options: { fontSize: labelFontSize, color: theme.muted || '94A3B8', breakLine: !!delta } })
		// Keep the semantic reading order stable: the eye reads the metric, then what
		// it measures, then the signed change. This is also the exported text order.
		if (delta) text.push({ text: delta, options: { fontSize: deltaFontSize, bold: true, color: dColor } })
		const objectName = createObjectName(slide.id, blockName, 'stat')
		const fit = estimateRichTextFit({ runs: text, rect: box, margin: author.margin, fontFace: author.fontFace || theme.headFontFace || theme.bodyFontFace || 'Aptos' })
		addObject({
			role: 'stat',
			objectName,
			primitive: 'textShape',
			shapeName: block.shapeName || (monumental ? 'rect' : 'roundRect'),
			text,
			rect: box,
			style: {
				fill: monumental ? { color: theme.bg || '000000', transparency: 100 } : cardFillDefault(theme),
				line: monumental ? { color: theme.accent, transparency: 100, width: 0.5 } : cardBorderDefault(theme),
				...(monumental ? { shadow: null } : (cardShadowDefault(theme) ? { shadow: cardShadowDefault(theme) } : {})),
				rectRadius: monumental ? 0 : cardRadiusDefault(theme),
				fontFace: theme.headFontFace || theme.bodyFontFace || 'Aptos',
				valign: 'middle',
				align: 'left',
				autoFit: 'shrink',
				...author,
			},
			fit,
			altText: `${label || 'metric'}: ${value}${delta ? ` (${delta})` : ''}`,
		})
		if (fit.overflow) warnings.push(textOverflowFinding({ slideId: slide.id, objectName, fit, rect: box, text: [value, label, delta].filter(Boolean).join('\n'), minFontSize: READABILITY_TYPE_FLOORS_PT.dataLabel, message: 'KPI text may overflow at the data-label readability floor.' }))
		if (valueFontSize < READABILITY_TYPE_FLOORS_PT.dataLabel) warnings.push(smallTextReadabilityFinding({ slideId: slide.id, objectName, role: 'dataLabel', floorPt: READABILITY_TYPE_FLOORS_PT.dataLabel, requestedFontSize: valueFontSize, resolvedFontSize: valueFontSize, source: 'ai-authored-style' }))
		return objects
	}

	if (block.kind === 'metric-grid') {
		const items = Array.isArray(block.items) && block.items.length ? block.items : [{ name: 'metric', label: block.text || block.name, value: '' }]
		const metricTreatment = String(block?.visualIntent?.metricTreatment || block?.visualIntent?.treatment || block?.metricTreatment || '').toLowerCase()
		const monumental = metricTreatment === 'monumental' || metricTreatment === 'bare-monumental'
		const authorStyle = effectiveBlockStyle(block)
		const readability = readabilityFloorForBlock(block, slideIndex)
		const authoredFont = Number(authorStyle.fontSize)
		const hasAuthoredFont = Number.isFinite(authoredFont) && authoredFont > 0
		const valueFontSize = hasAuthoredFont ? authoredFont : (monumental ? Math.max(36, readability.floorPt + 22) : Math.max(24, readability.floorPt + 8))
		const labelFontSize = Math.max(readability.floorPt, Math.min(monumental ? 16 : 15, valueFontSize - 7))
		const trendFontSize = Math.max(readability.floorPt, Math.min(15, valueFontSize - 8))
		const detailFontSize = Math.max(readability.floorPt, Math.min(14, valueFontSize - 9))
		const primaryTextColor = resolvedTextColorRole('primary', theme) || theme.ink
		const secondaryTextColor = resolvedTextColorRole('secondary', theme) || theme.muted || theme.ink
		const accentTextColor = resolvedTextColorRole('accent', theme) || theme.accent || primaryTextColor
		// A metric family is a compact reading row, not a set of full-height panels.
		// Derive a centered card band from the engine-owned host region so short KPI
		// text does not leave hollow cards spanning the entire slide.
		const gridCharsPerLine = Math.max(18, Math.floor((base.w / Math.min(4, items.length)) * 11))
		const gridLines = Math.max(1, ...items.map(item => Math.max(1, Math.ceil([item.label, item.value, item.trend, item.text].filter(Boolean).join(' ').length / gridCharsPerLine))))
		const gridH = monumental
			? Math.min(base.h, Math.max(2.25, 1.45 + gridLines * 0.38))
			: Math.min(2.7, Math.max(1.7, 1.0 + gridLines * 0.35))
		const gridBase = rect(base.x, base.y + Math.max(0, (base.h - gridH) / 2), base.w, gridH, 'metric-grid')
		// Four semantic signals are a single balanced row; the 3+1 fallback made
		// the last card appear stranded on the left and left the right side empty.
		const cardRects = splitCardRects(inset(gridBase, 0.02), items.length, { maxCols: items.length <= 4 ? 4 : 3 })
		items.forEach((item, index) => {
			if (!item.name) warnings.push({
				code: 'UNSTABLE_HANDLE',
				severity: 'warning',
				slideId: slide.id,
				message: 'Metric item has no stable name.',
				reason: 'Later edits, narration cues, interactions, and Morph pairing need a stable semantic name for each metric item.',
				fix: 'Add a concise unique name to every metric item and rerun dryRun; do not target generated handles by array position.',
				evidence: { blockKind: block.kind, blockName, itemIndex: index, namingAuthority: 'AI-semantic-name' },
			})
			const objectName = createObjectName(slide.id, blockName, 'metric-card', item.name || String(index + 1))
			const label = String(item.label || item.name || '').trim()
			const value = String(item.value || '').trim()
			const trend = String(item.trend || '').trim()
			const detail = String(item.text || '').trim()
			// Keep long monumental words on one editable line.  The visual system
			// deliberately uses value-first typography, but a fixed 36 pt value can
			// split words such as EDITABLE inside a three-up presenter lane.  Size
			// only the individual value run from the actual native card width; short
			// values remain monumental and the surrounding labels stay unchanged.
			const valueGlyphCount = Math.max(1, Array.from(value).length)
			const estimatedValueWidthInches = Math.max(0.2, cardRects[index].w - 0.24)
			const oneLineValueFontSize = Math.floor((estimatedValueWidthInches * 72) / (valueGlyphCount * 0.62))
			const itemValueFontSize = monumental
				? Math.max(readability.floorPt, Math.min(valueFontSize, oneLineValueFontSize))
				: valueFontSize
			// Metric cards need a scannable semantic hierarchy, not four equally bold
			// newline-delimited fragments. Keep value + trend on one visual line and
			// retain the measurement window/owner as a quieter evidence line. Explicit
			// run breaks mirror the PowerPoint serializer's paragraph rules, so the
			// pre-commit rich-text estimator measures the same structure we emit.
			const cardText = []
			if (monumental) {
				if (value) cardText.push({ text: value, options: { fontSize: itemValueFontSize, bold: true, color: authorStyle.color || primaryTextColor, breakLine: Boolean(label || trend || detail) } })
				if (label) cardText.push({ text: label, options: { fontSize: labelFontSize, bold: true, color: secondaryTextColor, breakLine: Boolean(trend || detail), charSpacing: 0.7 } })
				if (trend) cardText.push({ text: trend, options: { fontSize: trendFontSize, bold: true, color: accentTextColor, breakLine: Boolean(detail) } })
				if (detail) cardText.push({ text: detail, options: { fontSize: detailFontSize, bold: false, color: secondaryTextColor } })
			} else {
				if (label) cardText.push({
					text: label,
					options: { fontSize: labelFontSize, bold: true, color: secondaryTextColor, breakLine: Boolean(value || trend || detail) },
				})
				if (value) cardText.push({
					text: value,
					options: { fontSize: itemValueFontSize, bold: true, color: authorStyle.color || primaryTextColor, breakLine: !trend && Boolean(detail) },
				})
				if (value && trend) cardText.push({
					// A non-breaking middle-dot separator remains explicit in OOXML and
					// keeps the value and qualifier together as one editable reading unit.
					text: '\u00A0·\u00A0',
					options: { fontSize: trendFontSize, bold: true, color: accentTextColor, breakLine: false },
				})
				if (trend) cardText.push({ text: trend, options: { fontSize: trendFontSize, bold: true, color: accentTextColor, breakLine: Boolean(detail) } })
				if (detail) cardText.push({ text: detail, options: { fontSize: detailFontSize, bold: false, color: secondaryTextColor } })
			}
			if (!cardText.length) cardText.push({ text: String(item.name || 'Metric'), options: { fontSize: labelFontSize, bold: true, color: primaryTextColor } })
			const plainText = [label, value, trend, detail].filter(Boolean).join('\n')
			const fit = estimateRichTextFit({ runs: cardText, rect: cardRects[index], margin: authorStyle.margin, fontFace: authorStyle.fontFace || theme.bodyFontFace || 'Aptos' })
			const resolvedFont = fit.fontSize
			addObject({
				role: 'metric-card',
				objectName,
				itemName: item.name,
				primitive: 'textShape',
				shapeName: monumental ? 'rect' : 'roundRect',
				text: cardText,
				rect: cardRects[index],
				style: {
					fill: monumental ? { color: theme.bg || '000000', transparency: 100 } : cardFillDefault(theme),
					line: monumental ? { color: theme.accent, transparency: 100, width: 0.5 } : cardBorderDefault(theme),
					...(monumental ? { shadow: null } : (defaultShadow ? { shadow: defaultShadow } : { shadow: null })),
					color: primaryTextColor,
					fontSize: itemValueFontSize,
					bold: false,
					accent: theme.accent,
					rectRadius: monumental ? 0 : 0.08,
					align: 'left',
					valign: 'middle',
					autoFit: 'shrink',
					...authorStyle,
				},
				fit,
				animation: block.animation,
				altText: `${item.label || item.name}: ${[item.value, item.trend, item.text].filter(Boolean).join(' · ')}`.trim(),
				warningSource: {
					...item,
					verified: item.verified !== undefined ? item.verified : block.verified,
					evidenceSource: item.evidenceSource || block.evidenceSource,
					kind: block.kind,
				},
			})
			if (fit.overflow) warnings.push(textOverflowFinding({ slideId: slide.id, objectName, fit, rect: cardRects[index], text: plainText, minFontSize: readability.floorPt, message: 'Metric text may overflow at the data-label readability floor.' }))
			if (resolvedFont < readability.floorPt) warnings.push(smallTextReadabilityFinding({ slideId: slide.id, objectName, role: readability.role, floorPt: readability.floorPt, requestedFontSize: valueFontSize, resolvedFontSize: resolvedFont, source: hasAuthoredFont ? 'ai-authored-style' : 'engine-fit' }))
			if (monumental && index < cardRects.length - 1) {
				const nextRect = cardRects[index + 1]
				const dividerX = cardRects[index].x + cardRects[index].w + Math.max(0.02, (nextRect.x - cardRects[index].x - cardRects[index].w) / 2)
				addObject({
					role: 'decorative',
					objectName: createObjectName(slide.id, blockName, 'metric-divider', String(index + 1)),
					primitive: 'shape',
					shapeName: 'rect',
					text: '',
					rect: rect(dividerX, cardRects[index].y + 0.16, 0.012, Math.max(0.2, cardRects[index].h - 0.32), 'decorative'),
					style: { fill: { color: theme.accent, transparency: 58 }, line: { color: theme.accent, transparency: 100, width: 0.1 }, shadow: null },
					altText: '',
				})
			}
		})
		return objects
	}

	if (block.kind === 'timeline' || block.kind === 'process') {
		const items = Array.isArray(block.items) && block.items.length ? block.items : [{ name: 'step', text: blockText(block, slide) }]
		const authorStyle = effectiveBlockStyle(block)
		const readability = readabilityFloorForBlock(block, slideIndex)
		const authoredFont = Number(authorStyle.fontSize)
		const hasAuthoredFont = Number.isFinite(authoredFont) && authoredFont > 0
		const requestedFont = hasAuthoredFont ? authoredFont : readability.floorPt
		const processTreatment = String(block?.visualIntent?.processTreatment || block?.visualIntent?.treatment || block?.processTreatment || '').toLowerCase()
		const steppedLane = processTreatment === 'stepped-lane' || processTreatment === 'ascending-lane'
		const signalLine = processTreatment === 'signal-line' || processTreatment === 'editorial-timeline'
		if (steppedLane || signalLine) {
			const host = inset(base, 0.08)
			const nodeNames = items.map((item, index) => createObjectName(slide.id, blockName, 'step', item.name || String(index + 1)))
			if (steppedLane) {
				const count = Math.max(1, items.length)
				const gap = Math.min(0.18, host.w * 0.018)
				const nodeW = Math.max(0.72, (host.w - gap * Math.max(0, count - 1)) / count)
				const nodeH = Math.min(1.28, Math.max(0.92, host.h * 0.24))
				const travel = Math.max(0, host.h - nodeH)
				const stepRects = items.map((item, index) => rect(
					host.x + index * (nodeW + gap),
					host.y + (count === 1 ? travel / 2 : travel * (1 - index / (count - 1))),
					nodeW,
					nodeH,
					'process-step',
				))
				for (let index = 0; index < count - 1; index += 1) {
					addObject({
						role: 'connector',
						objectName: createObjectName(slide.id, blockName, 'lane-connector', String(index + 1)),
						primitive: 'connector',
						connectorType: 'elbowConnector3',
						from: nodeNames[index],
						to: nodeNames[index + 1],
						rect: rect(0.01, 0.01, 0.01, 0.01, 'connector'),
						style: { line: { color: theme.accent, width: 1.8, transparency: 8, endArrowType: 'triangle' }, shadow: null },
						animation: block.animation,
						altText: `Editable process connection from ${items[index]?.label || items[index]?.name || index + 1} to ${items[index + 1]?.label || items[index + 1]?.name || index + 2}`,
					})
				}
				items.forEach((item, index) => {
					const heading = item.title || item.label || item.name || `Step ${index + 1}`
					const body = item.value || item.text || ''
					const plainText = [heading, body].filter(Boolean).join('\n')
					const text = [
						{ text: String(heading).toUpperCase(), options: { bold: true, fontSize: Math.max(readability.floorPt, requestedFont + 1), color: index === 0 ? theme.warn : theme.ink, breakLine: Boolean(body), charSpacing: 0.5 } },
						...(body ? [{ text: String(body), options: { fontSize: requestedFont, color: theme.muted || theme.ink } }] : []),
					]
					const fit = estimateRichTextFit({ runs: text, rect: stepRects[index], margin: 0.1, fontFace: authorStyle.fontFace || theme.bodyFontFace || 'Aptos' })
					addObject({
						role: 'step',
						objectName: nodeNames[index],
						itemName: item.name,
						primitive: 'textShape',
						shapeName: 'roundRect',
						text,
						rect: stepRects[index],
						style: {
							fill: { color: index === 0 ? theme.warn : (theme.panel || theme.bg), transparency: index === 0 ? 82 : 18 },
							line: { color: index === 0 ? theme.warn : theme.accent, width: index === 0 ? 1.6 : 1.1, transparency: index === 0 ? 4 : 18 },
							shadow: index === 0 ? subtleShadow(0.16, 6, 1) : null,
							color: theme.ink,
							fontSize: requestedFont,
							rectRadius: 0.05,
							align: 'left',
							valign: 'middle',
							margin: 0.11,
							autoFit: 'shrink',
							...authorStyle,
						},
						fit,
						animation: block.animation,
						altText: plainText,
						warningSource: { ...item, verified: item.verified !== undefined ? item.verified : block.verified, evidenceSource: item.evidenceSource || block.evidenceSource, kind: block.kind },
					})
				})
			} else {
				const count = Math.max(1, items.length)
				const nodeSize = Math.min(0.78, Math.max(0.65, host.w / Math.max(7, count * 4)))
				const centerY = host.y + host.h * 0.42
				const usableW = Math.max(0.2, host.w - nodeSize)
				const nodeRects = items.map((item, index) => rect(host.x + (count === 1 ? usableW / 2 : usableW * index / (count - 1)), centerY - nodeSize / 2, nodeSize, nodeSize, 'timeline-node'))
				for (let index = 0; index < count - 1; index += 1) {
					addObject({
						role: 'connector',
						objectName: createObjectName(slide.id, blockName, 'signal-connector', String(index + 1)),
						primitive: 'connector',
						connectorType: 'straightConnector1',
						from: nodeNames[index],
						to: nodeNames[index + 1],
						rect: rect(0.01, 0.01, 0.01, 0.01, 'connector'),
						style: { line: { color: theme.accent, width: 1.5, transparency: 12 }, shadow: null },
						animation: block.animation,
						altText: `Editable timeline connection ${index + 1}`,
					})
				}
				items.forEach((item, index) => {
					const heading = item.title || item.label || item.name || `Step ${index + 1}`
					const body = item.value || item.text || ''
					addObject({
						role: 'step',
						objectName: nodeNames[index],
						itemName: item.name,
						primitive: 'textShape',
						shapeName: 'ellipse',
						text: String(item.badge || String(index + 1).padStart(2, '0')),
						rect: nodeRects[index],
						style: { fill: { color: index === 0 ? theme.warn : theme.panel, transparency: index === 0 ? 5 : 20 }, line: { color: index === 0 ? theme.warn : theme.accent, width: 1.4, transparency: 5 }, shadow: subtleShadow(index === 0 ? 0.14 : 0.09, index === 0 ? 5 : 3, 1), color: index === 0 ? (theme.bg || '07101F') : theme.ink, fontSize: Math.max(13, requestedFont), bold: true, align: 'center', valign: 'middle', margin: 0.03, autoFit: 'shrink', ...authorStyle },
						animation: block.animation,
						altText: `Timeline stage ${index + 1}: ${heading}${body ? `, ${body}` : ''}`,
						warningSource: { ...item, verified: item.verified !== undefined ? item.verified : block.verified, evidenceSource: item.evidenceSource || block.evidenceSource, kind: block.kind },
					})
					const labelW = Math.min(1.36, Math.max(0.78, host.w / count - 0.12))
					const labelY = nodeRects[index].y + nodeSize + 0.16
					const labelX = Math.max(host.x, Math.min(nodeRects[index].x - Math.max(0, (labelW - nodeSize) / 2), host.x + host.w - labelW))
					const labelRect = rect(labelX, labelY, labelW, Math.max(0.58, Math.min(0.92, host.y + host.h - labelY)), 'timeline-label')
					const text = [
						{ text: String(heading).toUpperCase(), options: { bold: true, fontSize: Math.max(readability.floorPt, requestedFont), color: theme.ink, breakLine: Boolean(body), charSpacing: 0.4 } },
						...(body ? [{ text: String(body), options: { fontSize: requestedFont, color: theme.muted || theme.ink } }] : []),
					]
					addObject({
						role: 'step-label',
						objectName: createObjectName(slide.id, blockName, 'step-label', item.name || String(index + 1)),
						itemName: item.name,
						primitive: 'textBox',
						text,
						rect: labelRect,
						style: { color: theme.ink, fontSize: requestedFont, align: 'center', valign: 'top', margin: 0.02, autoFit: 'shrink', ...authorStyle },
						animation: block.animation,
						altText: [heading, body].filter(Boolean).join(': '),
					})
				})
			}
			return objects
		}
		const compactH = Math.min(base.h, 1.75)
		const compactBase = items.length <= 4
			? rect(base.x, base.y + Math.max(0, (base.h - compactH) / 2), base.w, compactH, base.role)
			: base
		const stepRects = splitCardRects(inset(compactBase, 0.04), Math.max(1, items.length), { maxCols: items.length <= 4 ? 4 : 3 })
		items.forEach((item, index) => {
			const objectName = createObjectName(slide.id, blockName, 'step', item.name || String(index + 1))
			const heading = item.title || item.label || item.name || `Step ${index + 1}`
			const body = item.value || item.text || ''
			const plainText = [heading, body].filter(Boolean).join('\n')
			const text = [
				{ text: String(heading), options: { bold: true, fontSize: Math.max(readability.floorPt, requestedFont) } },
				...(body ? [{ text: String(body), options: { fontSize: requestedFont } }] : []),
			]
			const fit = estimateTextFit({ text: plainText, rect: stepRects[index], fontSize: requestedFont, minFontSize: readability.floorPt, fontFace: authorStyle.fontFace || theme.bodyFontFace || 'Aptos', margin: authorStyle.margin, charSpacing: authorStyle.charSpacing })
			const resolvedFont = hasAuthoredFont ? authoredFont : fit.fontSize
			addObject({
				role: 'step',
				objectName,
				itemName: item.name,
				primitive: 'textShape',
				shapeName: 'roundRect',
				text,
				rect: stepRects[index],
				style: {
					fill: theme.panel || theme.bg,
					line: index % 2 === 0 ? theme.accent : theme.success,
					...(defaultShadow ? { shadow: defaultShadow } : { shadow: null }),
					color: theme.ink,
					fontSize: resolvedFont,
					rectRadius: 0.08,
					align: 'center',
					valign: 'middle',
					autoFit: 'shrink',
					...authorStyle,
				},
				fit,
				animation: block.animation,
				altText: plainText,
				warningSource: {
					...item,
					verified: item.verified !== undefined ? item.verified : block.verified,
					evidenceSource: item.evidenceSource || block.evidenceSource,
					kind: block.kind,
				},
			})
			if (fit.overflow) warnings.push(textOverflowFinding({ slideId: slide.id, objectName, fit, rect: stepRects[index], text: plainText, minFontSize: readability.floorPt, message: 'Step text may overflow at the diagram-label readability floor.' }))
			if (resolvedFont < readability.floorPt) warnings.push(smallTextReadabilityFinding({ slideId: slide.id, objectName, role: readability.role, floorPt: readability.floorPt, requestedFontSize: requestedFont, resolvedFontSize: resolvedFont, source: hasAuthoredFont ? 'ai-authored-style' : 'engine-fit' }))
		})
		return objects
	}

	if (block.kind === 'smartart' || block.kind === 'diagram') {
		const box = explicitBlockRect(block, base, 'smartart')
		const authorStyle = effectiveBlockStyle(block)
		const readability = readabilityFloorForBlock(block, slideIndex)
		const authoredFont = Number(authorStyle.fontSize)
		const hasAuthoredFont = Number.isFinite(authoredFont) && authoredFont > 0
		const resolvedFont = hasAuthoredFont ? authoredFont : readability.floorPt
		const sourceItems = Array.isArray(block.nodes) && block.nodes.length
			? block.nodes
			: (Array.isArray(block.items) && block.items.length ? block.items : [{ name: 'step', text: blockText(block, slide) }])
		const items = resolveSmartArtNodeTextRoles(sourceItems, theme)
		const objectName = createObjectName(slide.id, blockName, 'smartart')
		const smartArtLayout = block.layout || block.smartArtLayout || (slide.layoutIntent === 'timeline' ? 'timeline' : 'process')
		const smartArtMode = block.mode || 'native'
		const textPolarityFinding = smartArtTextPolarityFinding({ block, items, slideId: slide.id, objectName })
		if (textPolarityFinding) warnings.push(textPolarityFinding)
		const topologyFinding = smartArtNodeTopologyFinding({ block, items, slideId: slide.id, objectName })
		if (topologyFinding) warnings.push(topologyFinding)
		addObject({
			role: 'smartart',
			objectName,
			primitive: 'smartart',
			layout: smartArtLayout,
			// Preserve exact native catalog selections through the semantic layout
			// plan.  These are authoring choices (not rectangles): dropping them here
			// makes a picture layout degrade to the generic process default and also
			// loses the requested Quick Style/Color gallery state before execution.
			...(block.layoutId ? { layoutId: block.layoutId } : {}),
			...(block.layoutName ? { layoutName: block.layoutName } : {}),
			...(block.rightToLeft !== undefined ? { rightToLeft: block.rightToLeft } : {}),
			// Representation policy is native-first.  The AI remains responsible for
			// choosing the exact layout/style/color and for deciding when native
			// SmartArt cannot express the intended result.  A custom shape-built mode
			// is accepted only after the manifest layer records a specific reason.
			mode: smartArtMode,
			summary: block.summary,
			// Default to a single-accent monochrome color style + simple quick style so SmartArt does
			// not render in PowerPoint's rainbow Office default (calibration r1 D-SmartArt-palette).
			// Crucially, do not inject those defaults when the AI explicitly selected a native
			// gallery name.  The serializer resolves IDs before names; injecting a default ID here
			// would silently discard the requested Quick Style/Color Style and make the engine appear
			// to support the gallery while always emitting the same package state.
			...(block.quickStyleId
				? { quickStyleId: block.quickStyleId }
				: (!block.quickStyleName ? { quickStyleId: 'urn:microsoft.com/office/officeart/2005/8/quickstyle/simple1' } : {})),
			...(block.colorStyleId
				? { colorStyleId: block.colorStyleId }
				: (!block.colorStyleName ? { colorStyleId: 'urn:microsoft.com/office/officeart/2005/8/colors/accent1_2' } : {})),
			...(block.colorStyleName ? { colorStyleName: block.colorStyleName } : {}),
			...(block.quickStyleName ? { quickStyleName: block.quickStyleName } : {}),
			...(block.presetFallback ? { presetFallback: block.presetFallback } : {}),
			// Slide metadata is already represented by the semantic title block. Do
			// not repeat it inside the diagram unless the AI explicitly asks for an
			// internal diagram heading; otherwise every diagram slide gets a second
			// visible title in the COM render.
			title: block.title || block.text || null,
			nodes: items,
			items,
			rect: box,
			style: blockStyle(block, {
				palette: theme.raw,
				fill: theme.panel || theme.bg,
				line: theme.accent,
				// SmartArt recommendations may carry an executable contrast color
				// alongside the native gallery IDs. Preserve that semantic choice
				// through the engine layout plan; do not let the World ink default
				// silently replace it.
				color: block.color || theme.ink,
				...(Array.isArray(block.textColors) ? { textColors: block.textColors } : {}),
				...(defaultShadow ? { shadow: defaultShadow } : { shadow: null }),
				fontSize: resolvedFont,
			}),
			animation: block.animation,
			altText: block.altText || block.summary || `Diagram: ${slide.message || slide.title}`,
		})
		if (resolvedFont < readability.floorPt) warnings.push(smallTextReadabilityFinding({ slideId: slide.id, objectName, role: readability.role, floorPt: readability.floorPt, requestedFontSize: resolvedFont, resolvedFontSize: resolvedFont, source: 'ai-authored-style' }))
		const nodeText = flattenSemanticNodeText(items)
		if (nodeText.length) {
			const shapeFrames = String(smartArtMode).toLowerCase() === 'shape'
				? shapeBuiltSmartArtTextFrames({ layout: smartArtLayout, box, nodeCount: items.length, hasTitle: Boolean(block.title || block.text) })
				: []
			if (shapeFrames.length) {
				for (const frame of shapeFrames.slice(0, 24)) {
					const source = items[frame.index]
					const text = typeof source === 'string' || typeof source === 'number'
						? String(source)
						: String(source?.text || source?.title || `Node ${frame.index + 1}`)
					const nodePath = `[${frame.index}]`
					const fit = estimateTextFit({ text, rect: frame.labelRect, fontSize: resolvedFont, minFontSize: readability.floorPt, fontFace: authorStyle.fontFace || theme.bodyFontFace || 'Aptos', margin: frame.margin })
					if (fit.overflow) {
						const finding = textOverflowFinding({ slideId: slide.id, objectName: `${objectName}${nodePath}`, fit, rect: frame.labelRect, text, minFontSize: readability.floorPt, message: 'Shape-built SmartArt node text cannot fit inside its emitted label frame at the diagram-label readability floor.' })
						warnings.push({
							...finding,
							severity: 'error',
							evidence: {
								...finding.evidence,
								nodePath,
								layout: frame.layout,
								nodeRect: frame.nodeRect,
								labelRect: frame.labelRect,
								hostEstimate: frame.geometrySource,
								nativeRenderReviewRequired: false,
							},
						})
					}
				}
			} else {
				// Native SmartArt and shape layouts without an executable inner-frame
				// contract retain the prior conservative proxy plus mandatory render review.
				const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(nodeText.length))))
				const rows = Math.ceil(nodeText.length / cols)
				const nodeRect = { w: Math.max(0.25, (box.w - GAP * Math.max(0, cols - 1)) / cols), h: Math.max(0.2, (box.h - GAP * Math.max(0, rows - 1)) / rows) }
				for (const node of nodeText.slice(0, 24)) {
					const nodeFont = Number(node.fontSize) > 0 ? Number(node.fontSize) : resolvedFont
					const fit = estimateTextFit({ text: node.text, rect: nodeRect, fontSize: nodeFont, minFontSize: readability.floorPt, fontFace: authorStyle.fontFace || theme.bodyFontFace || 'Aptos', margin: authorStyle.margin, charSpacing: authorStyle.charSpacing })
					if (nodeFont < readability.floorPt) warnings.push(smallTextReadabilityFinding({ slideId: slide.id, objectName: `${objectName}${node.nodePath}`, role: readability.role, floorPt: readability.floorPt, requestedFontSize: nodeFont, resolvedFontSize: nodeFont, source: 'ai-authored-smartart-node-style' }))
					if (fit.overflow) warnings.push({
						...textOverflowFinding({ slideId: slide.id, objectName: `${objectName}${node.nodePath}`, fit, rect: nodeRect, text: node.text, minFontSize: readability.floorPt, message: 'SmartArt node text may overflow at the diagram-label readability floor.' }),
						evidence: { ...textOverflowFinding({ slideId: slide.id, objectName, fit, rect: nodeRect, text: node.text, minFontSize: readability.floorPt }).evidence, nodePath: node.nodePath, hostEstimate: 'conservative-equal-area-node-proxy', nativeRenderReviewRequired: true },
					})
				}
			}
		}
		return objects
	}

	if (block.kind === 'chart-panel') {
		// `_enginePlaced` is an internal second-pass layout marker, never caller input.
		// Validate the public authored block while leaving the engine-owned marker out
		// of the fail-closed authoring contract.
		const { _enginePlaced: _ignoredEnginePlaced, ...authoredChartBlock } = block
		validateChartPanel(authoredChartBlock, `slides[${slide?.id || '?'}].content.${blockName || 'chart'}`)
		const chartMulti = Array.isArray(block.chartMulti)
			? block.chartMulti
			: (Array.isArray(block.charts) ? block.charts : undefined)
		const chartSelectors = Object.fromEntries([
			'chartPresetId', 'chartGalleryTilePresetId', 'chartStylePresetId',
			'chartGalleryVariant', 'chartStyleId', 'chartStyleModernId',
			'chartColorStyleId', 'chartLayoutPresetId', 'chartTreatmentPresetId',
			'chartTreatmentPresetIds',
		].filter(key => block[key] !== undefined).map(key => [key, block[key]]))
		const objectName = block.objectName || createObjectName(slide.id, blockName, 'chart')
		const chartOptions = { ...chartSelectors, ...(block.chartOptions || {}) }
		addObject({
			role: 'chart',
			objectName,
			primitive: 'chart',
			...(chartMulti
				? { chartMulti }
				: { chartType: block.chartType || block.type || 'line' }),
			// Catalog IDs are semantic design choices, not geometry. Preserve them
			// through layout exactly so the chart executor can resolve the requested
			// native Ribbon state; explicit chartOptions remain authoritative.
			chartOptions,
			data: block.data,
			series: block.series,
			summary: block.summary,
			text: blockText(block, slide),
			rect: base,
			style: blockStyle(block, { palette: theme.raw, color: theme.ink, ...(defaultShadow ? { shadow: defaultShadow } : {}), fill: theme.panel || theme.bg }),
			animation: block.animation,
			altText: block.altText || block.summary || `Chart: ${slide.message || slide.title}`,
		})
		for (const [field, semanticRole] of [
			['catAxisLabelFontSize', 'category-axis labels'],
			['valAxisLabelFontSize', 'value-axis labels'],
			['dataLabelFontSize', 'data labels'],
			['legendFontSize', 'legend labels'],
		]) {
			const fontSize = Number(chartOptions[field])
			if (Number.isFinite(fontSize) && fontSize > 0 && fontSize < READABILITY_TYPE_FLOORS_PT.dataLabel) {
				warnings.push({
					...smallTextReadabilityFinding({ slideId: slide.id, objectName, role: 'dataLabel', floorPt: READABILITY_TYPE_FLOORS_PT.dataLabel, requestedFontSize: fontSize, resolvedFontSize: fontSize, source: `chartOptions.${field}` }),
					message: `${semanticRole} resolve to ${fontSize}pt, below the ${READABILITY_TYPE_FLOORS_PT.dataLabel}pt presentation-size floor.`,
					evidence: { role: 'dataLabel', semanticRole, field, floorPt: READABILITY_TYPE_FLOORS_PT.dataLabel, requestedFontSize: fontSize, resolvedFontSize: fontSize, source: `chartOptions.${field}` },
				})
			}
		}
		return objects
	}

	if (block.kind === 'table-panel') {
		const objectName = createObjectName(slide.id, blockName, 'table')
		const authorStyle = effectiveBlockStyle(block)
		const tableOptions = {
			...(block.tablePresetId !== undefined ? { tablePresetId: block.tablePresetId } : {}),
			...(block.tableStylePresetId !== undefined ? { tableStylePresetId: block.tableStylePresetId } : {}),
			...(block.tableStyleId !== undefined ? { tableStyleId: block.tableStyleId } : {}),
			...(block.tableOptions || {}),
		}
		const inheritedFont = Number(tableOptions.fontSize ?? authorStyle.fontSize)
		const resolvedDefaultFont = Number.isFinite(inheritedFont) && inheritedFont > 0 ? inheritedFont : READABILITY_TYPE_FLOORS_PT.tableCell
		const sourceRows = [
			...(Array.isArray(block.header) && block.header.length ? [block.header] : []),
			...(Array.isArray(block.rows) ? block.rows : []),
		]
		const rowCount = Math.max(1, sourceRows.length)
		const columnCount = Math.max(1, ...sourceRows.map(row => Array.isArray(row) ? row.length : 1))
		const columnTracks = tableTrackSizes(tableOptions.colW, columnCount, base.w)
		const rowTracks = tableTrackSizes(tableOptions.rowH, rowCount, base.h)
		if (!columnTracks.valid || !rowTracks.valid) warnings.push({
			code: 'COMPOSITE_TEXT_FIT_UNRESOLVED',
			severity: 'warning',
			slideId: slide.id,
			objectName,
			message: 'Table text fit could not resolve the authored row or column track geometry.',
			reason: 'One or more tableOptions.colW/rowH values are missing, non-positive, or non-numeric, so a conservative cell host cannot be proven before commit.',
			fix: 'Provide one positive width per column and one positive height per row, or remove the malformed track override and rerun dryRun.',
			evidence: { rowCount, columnCount, colW: tableOptions.colW ?? null, rowH: tableOptions.rowH ?? null },
		})
		const cellFits = []
		for (let rowIndex = 0; rowIndex < Math.min(sourceRows.length, 24); rowIndex += 1) {
			const row = Array.isArray(sourceRows[rowIndex]) ? sourceRows[rowIndex] : [sourceRows[rowIndex]]
			for (let columnIndex = 0; columnIndex < Math.min(row.length, 12); columnIndex += 1) {
				const payload = tableCellTextPayload(row[columnIndex], { fontSize: resolvedDefaultFont, fontFace: tableOptions.fontFace || authorStyle.fontFace || theme.bodyFontFace || 'Aptos' })
				if (!payload.text.trim()) continue
				const rawCell = row[columnIndex]
				const rawCellOptions = rawCell && typeof rawCell === 'object' && !Array.isArray(rawCell) ? { ...(rawCell.options || {}), ...(rawCell.style || {}) } : {}
				const colSpan = Math.max(1, Math.min(columnCount - columnIndex, Math.trunc(Number(rawCellOptions.colSpan ?? rawCellOptions.colspan ?? rawCell?.colSpan ?? rawCell?.colspan) || 1)))
				const rowSpan = Math.max(1, Math.min(rowCount - rowIndex, Math.trunc(Number(rawCellOptions.rowSpan ?? rawCellOptions.rowspan ?? rawCell?.rowSpan ?? rawCell?.rowspan) || 1)))
				const cellRect = {
					w: Math.max(0.1, columnTracks.sizes.slice(columnIndex, columnIndex + colSpan).reduce((sum, value) => sum + value, 0)),
					h: Math.max(0.1, rowTracks.sizes.slice(rowIndex, rowIndex + rowSpan).reduce((sum, value) => sum + value, 0)),
				}
				const runSizes = (payload.runs || []).map(run => Number(run.options?.fontSize)).filter(size => Number.isFinite(size) && size > 0)
				const cellFont = Number(payload.options.fontSize) > 0 ? Number(payload.options.fontSize) : resolvedDefaultFont
				const smallestFont = runSizes.length ? Math.min(cellFont, ...runSizes) : cellFont
				const fit = payload.runs?.length
					? estimateRichTextFit({ runs: payload.runs, rect: cellRect, margin: payload.options.margin ?? tableOptions.margin ?? 0.04, fontFace: payload.options.fontFace || theme.bodyFontFace || 'Aptos' })
					: estimateTextFit({ text: payload.text, rect: cellRect, fontSize: cellFont, minFontSize: READABILITY_TYPE_FLOORS_PT.tableCell, margin: payload.options.margin ?? tableOptions.margin ?? 0.04, fontFace: payload.options.fontFace || theme.bodyFontFace || 'Aptos', charSpacing: payload.options.charSpacing })
				cellFits.push({ rowIndex, columnIndex, colSpan, rowSpan, hostWidthIn: round(cellRect.w), hostHeightIn: round(cellRect.h), textCharacters: payload.text.length, fontSize: smallestFont, lines: fit.lines, overflow: fit.overflow })
				const cellName = `${objectName}.cell-${rowIndex + 1}-${columnIndex + 1}`
				if (smallestFont < READABILITY_TYPE_FLOORS_PT.tableCell) warnings.push(smallTextReadabilityFinding({ slideId: slide.id, objectName: cellName, role: 'tableCell', floorPt: READABILITY_TYPE_FLOORS_PT.tableCell, requestedFontSize: smallestFont, resolvedFontSize: smallestFont, source: payload.runs?.length ? 'table-cell-rich-run-style' : 'table-cell-style' }))
				if (fit.overflow) warnings.push({
					...textOverflowFinding({ slideId: slide.id, objectName: cellName, fit, rect: cellRect, text: payload.text, minFontSize: READABILITY_TYPE_FLOORS_PT.tableCell, message: 'Table cell text may overflow at the table-cell readability floor.' }),
					evidence: { ...textOverflowFinding({ slideId: slide.id, objectName: cellName, fit, rect: cellRect, text: payload.text, minFontSize: READABILITY_TYPE_FLOORS_PT.tableCell }).evidence, rowIndex, columnIndex, colSpan, rowSpan, hostEstimate: columnTracks.explicit || rowTracks.explicit ? 'authored-table-track-geometry' : 'equal-row-column-cell-proxy', nativeRenderReviewRequired: true },
				})
			}
		}
		addObject({
			role: 'table',
			objectName,
			primitive: 'table',
			text: blockText(block, slide),
			rows: block.rows,
			tableOptions: { fontSize: resolvedDefaultFont, ...tableOptions },
			header: block.header,
			rect: base,
			cellFit: { rowCount, columnCount, inspectedCells: cellFits.length, columnWidthsIn: columnTracks.sizes.map(value => round(value)), rowHeightsIn: rowTracks.sizes.map(value => round(value)), explicitTrackGeometry: columnTracks.explicit || rowTracks.explicit, cells: cellFits },
			style: blockStyle(block, { palette: theme.raw, color: theme.ink, headerFill: theme.accent, ...(defaultShadow ? { shadow: defaultShadow } : {}) }),
			animation: block.animation,
			summary: block.summary,
			altText: block.altText || block.summary || `Table: ${slide.message || slide.title}`,
		})
		return objects
	}

	if (block.kind === 'icon') {
		// First-class ICONOGRAPHY with a semantic front-door: author {kind:'icon', query:'shield'}
		// (or icon:'shield') and the engine resolves a native Lucide glyph, themes it, and
		// rasterizes it via sharp (SVG images don't render in the PowerPoint export path). Two
		// looks: 'plain' (accent glyph on the canvas) and 'chip' (glyph on a rounded accent tile
		// with an auto-contrast glyph). Colors are resolved HERE (theme concern); the engine only
		// rasterizes. Author color/size always win; the accent is kept visible on the canvas.
		// Style: author iconStyle wins; else the world's icon temperament (luxe/aurora/brutalist
		// = chip; editorial/blueprint/mist = plain). 'none'/'plain' explicitly forces plain.
		const authorStyle = String(block.iconStyle || block.variant || '').toLowerCase()
		const worldIcon = theme.iconTemperament || { style: 'plain', cornerRadius: 0 }
		const wantChip = authorStyle
			? ['chip', 'tile', 'badge'].includes(authorStyle)
			: worldIcon.style === 'chip'
		const worldCorner = worldIcon.cornerRadius ?? 0.16
		const authorColor = block.color || block.style?.color
		const accent = ensureAccentOnCanvas(authorColor || theme.accent, theme.bg).accent
		let glyphColor = accent
		let chipColor = null
		if (wantChip) {
			chipColor = String(block.chipColor || theme.accent).replace(/^#/, '').toUpperCase()
			// glyph must read on the chip, not the canvas: author color if legible, else auto.
			glyphColor = ensureReadableInk(authorColor || (isDarkHex(chipColor) ? 'F8FAFC' : '0B1220'), chipColor).ink
		}
		// Icons are small: honor an explicit rect, else center a modest square in the region.
		let iconRect
		if (blockHasExplicitGeometry(block)) {
			iconRect = explicitBlockRect(block, base, 'icon')
		} else {
			const side = Math.max(0.6, Math.min(1.5, base.h * 0.7, base.w))
			iconRect = rect(base.x + (base.w - side) / 2, base.y + (base.h - side) / 2, side, side, 'icon')
		}
		addObject({
			role: 'icon',
			primitive: 'icon',
			rect: iconRect,
			iconSource: {
				icon: block.icon || block.iconName || block.glyph,
				query: block.query || block.context || block.prompt,
				glyphColor,
				chipColor,
				style: wantChip ? 'chip' : 'plain',
				cornerRadius: wantChip ? (block.cornerRadius ?? worldCorner) : 0,
				sizePx: block.sizePx || 512,
			},
			animation: block.animation,
			altText: block.altText || `Icon: ${block.icon || block.query || blockName}`,
		})
		return objects
	}

	if (block.kind === 'image-feature') {
		// M19b material/depth: per-world image framing + elevation. Frameless print
		// (editorial) vs hard accent frame (brutalist/blueprint) vs thin edge (luxe) vs
		// rounded soft-shadow (aurora/mist). pptxgenjs images take no border, so the
		// per-world FRAME is a backing rectangle the image sits on (the border shows
		// around it). Author rect/shadow always win; a per-cell author fill suppresses it.
		const _depth = theme.depth || {}
		// Reference pixels already define the complete picture frame. World
		// decoration must not shrink that frame or invent a second backing shape.
		// Explicit Picture Style/line/effect choices still flow through below.
		const exactReferenceImage = isVisualReferenceReconstruction(spec)
			&& spec.authoringContract?.placementPolicy === 'visual-reference-pixels-v1'
		const pictureStylePresetId = block.pictureStylePresetId || block.imageOptions?.pictureStylePresetId
		const hasPictureStyleDirective = Object.prototype.hasOwnProperty.call(block, 'pictureStyle') || Object.prototype.hasOwnProperty.call(block.imageOptions || {}, 'pictureStyle')
		const imgRect = explicitBlockRect(block, base, 'image')
		let renderedImageRect = imgRect
		if (!exactReferenceImage && _depth.imageFrame && !block.noFrame) {
			const fw = Math.max(0.025, (_depth.imageFrame.width || 1) * 0.022) // frame thickness in inches
			renderedImageRect = inset(imgRect, fw)
			addObject({
				role: 'image-frame',
				primitive: 'shape',
				shapeName: 'rect',
				text: '',
				// The proposal rectangle is the hard geometry host. Keep the frame
				// inside it and inset the image, so a visual nicety never escapes the
				// AI-selected semantic region or collides with neighboring content.
				rect: rect(imgRect.x, imgRect.y, imgRect.w, imgRect.h, 'image-frame'),
				style: { fill: { color: _depth.imageFrame.color }, line: { color: _depth.imageFrame.color, width: _depth.imageFrame.width }, ...(_depth.shadow === 'none' ? {} : { shadow: subtleShadow(0.18, 4, 1) }) },
				altText: '',
			})
		}
		// M22 — imageTreatment:"world": the author OPTS IN to the world's raster grade;
		// the treatment's worldOps prepend so author-specified ops still apply on top.
		const worldGradeOps = (block.imageTreatment === 'world' && Array.isArray(theme.imageTreatment?.worldOps))
			? theme.imageTreatment.worldOps
			: []
		const effectiveImageOps = [...worldGradeOps, ...(Array.isArray(block.imageOps) ? block.imageOps : [])]
		addObject({
			role: exactReferenceImage ? (block.role || 'image') : 'image',
			primitive: 'image',
			rect: renderedImageRect,
			assetRef: block.assetRef,
			image: block.image,
			data: block.data,
			path: block.path,
			url: block.url,
			// The AI selects an exact native Picture Styles tile. Keep the opaque
			// ID attached while the Director independently resolves geometry.
			...(pictureStylePresetId
				? { pictureStylePresetId }
				: {}),
			// Contextual image-generation intent stays semantic until the final geometry is
			// known. The spec compiler's Visual Director then combines this intent with the
			// slide message, resolved World, brand palette, and this exact target rectangle.
			visualIntent: block.visualIntent,
			generation: block.generation,
			generate: block.generate,
			imageOptions: block.imageOptions,
			...(Object.prototype.hasOwnProperty.call(block, 'sizing') ? { sizing: block.sizing } : {}),
			imageAdjustments: block.imageAdjustments,
			...(Object.prototype.hasOwnProperty.call(block, 'pictureStyle') ? { pictureStyle: block.pictureStyle } : {}),
			...(effectiveImageOps.length ? { imageOps: effectiveImageOps } : {}),
			style: blockStyle(block, exactReferenceImage ? {} : {
				fill: theme.bg,
				rectRadius: _depth.imageRadius,
				// A Picture Style owns its effect stack. World depth may still be
				// explicitly overridden by the author, but it must not silently
				// replace the selected native gallery style's shadow/reflection/
				// soft edge merely because the current World has elevation.
				...(_depth.shadow === 'none' || _depth.imageFrame || pictureStylePresetId || hasPictureStyleDirective ? {} : { shadow: subtleShadow(0.12, 3, 1) }),
			}),
			animation: block.animation,
			altText: block.altText || `Image: ${slide.message || slide.title}`,
		})
		return objects
	}

	if (block.kind === 'media') {
		// M19c: video/media adopts the world's material/depth temperament — same per-world
		// frame + elevation as image (luxe gold edge, blueprint cyan, editorial frameless).
		// The frame is a backing rectangle behind the media (poster/player sits on it).
		const _mdepth = theme.depth || {}
		const _mRect = explicitBlockRect(block, base, 'media')
		let renderedMediaRect = _mRect
		if (_mdepth.imageFrame && !block.noFrame) {
			const fw = Math.max(0.025, (_mdepth.imageFrame.width || 1) * 0.022)
			renderedMediaRect = inset(_mRect, fw)
			addObject({
				role: 'media-frame', primitive: 'shape', shapeName: 'rect', text: '',
				rect: rect(_mRect.x, _mRect.y, _mRect.w, _mRect.h, 'media-frame'),
				style: { fill: { color: _mdepth.imageFrame.color }, line: { color: _mdepth.imageFrame.color, width: _mdepth.imageFrame.width }, ...(_mdepth.shadow === 'none' ? {} : { shadow: subtleShadow(0.18, 4, 1) }) },
				altText: '',
			})
		}
		addObject({
			role: 'media',
			primitive: 'media',
			assetRef: block.assetRef,
			mediaType: block.mediaType || block.type,
			type: block.type,
			link: block.link || block.url,
			path: block.path,
			data: block.data,
			cover: block.cover,
			extn: block.extn,
			mediaOptions: block.mediaOptions || block.options,
			mediaCommandTiming: block.mediaCommandTiming,
			rect: renderedMediaRect,
			style: blockStyle(block, {
				fill: theme.bg,
				...(_mdepth.shadow === 'none' || _mdepth.imageFrame ? {} : { shadow: subtleShadow(0.12, 3, 1) }),
			}),
			animation: block.animation ?? block.animations,
			altText: block.altText || `Media: ${slide.message || slide.title}`,
		})
		return objects
	}

	if (block.kind === 'ink') {
		addObject({
			role: 'ink',
			primitive: 'ink',
			points: block.points,
			strokes: block.strokes,
			coordinateMode: block.coordinateMode,
			inkType: block.inkType || block.tool,
			color: block.color,
			width: block.width,
			transparency: block.transparency,
			inkOptions: block.inkOptions || block.options,
			rect: explicitBlockRect(block, base, 'ink'),
			style: blockStyle(block, {
				color: theme.accent,
				line: theme.accent,
			}),
			animation: block.animation,
			altText: block.altText || `Ink annotation: ${slide.message || slide.title}`,
		})
		return objects
	}

	if (block.kind === 'laser') {
		addObject({
			role: 'laser',
			primitive: 'laser',
			points: block.points,
			coordinateMode: block.coordinateMode,
			color: block.color,
			width: block.width,
			transparency: block.transparency,
			glow: block.glow,
			dot: block.dot,
			durationMs: block.durationMs,
			startDelayMs: block.startDelayMs,
			rect: explicitBlockRect(block, base, 'laser'),
			style: blockStyle(block, {
				color: theme.warn,
				line: theme.warn,
			}),
			animation: block.animation,
			altText: block.altText || `Laser pointer: ${slide.message || slide.title}`,
		})
		return objects
	}

	if (block.kind === 'narration') {
		const fallback = rect(0.3, 0.3, 0.22, 0.18, 'narration')
		addObject({
			role: 'narration',
			primitive: 'narration',
			script: block.script || block.text || slide.notes || '',
			audio: block.audio,
			lockedAudio: block.lockedAudio,
			timing: block.timing,
			timeline: block.timeline,
			narrationTiming: block.narrationTiming,
			cues: block.cues,
			timingAuthority: block.timingAuthority,
			targetDurationMs: block.targetDurationMs,
			durationToleranceMs: block.durationToleranceMs,
			resolutionPolicy: block.resolutionPolicy,
			costPolicy: block.costPolicy,
			estimation: block.estimation,
			voice: block.voice,
			lang: block.lang,
			provider: block.provider,
			speaker: block.speaker,
			lengthScale: block.lengthScale,
			noiseScale: block.noiseScale,
			noiseWScale: block.noiseWScale,
			paddingMs: block.paddingMs,
			startDelayMs: block.startDelayMs,
			expectedDurationMs: block.expectedDurationMs,
			timingToleranceMs: block.timingToleranceMs,
			durationMs: block.durationMs,
			allowUnreviewedVoices: block.allowUnreviewedVoices,
			rect: explicitBlockRect(block, fallback, 'narration'),
			style: blockStyle(block, {}),
			altText: block.altText || `Narration audio: ${slide.title}`,
		})
		return objects
	}

	if (block.kind === 'avatarNarration') {
		addObject({
			role: 'avatar',
			primitive: 'avatar',
			script: block.script || block.text || slide.notes || '',
			audio: block.audio,
			avatar: block.avatar,
			consent: block.consent,
			avatarMode: block.avatarMode,
			renderPolicy: block.renderPolicy,
			resolutionPolicy: block.resolutionPolicy,
			costPolicy: block.costPolicy,
			timingAuthority: block.timingAuthority,
			lockedVideo: block.lockedVideo,
			lockedPoster: block.lockedPoster,
			durationMs: block.durationMs,
			hash: block.hash,
			settingsDigest: block.settingsDigest,
			cues: block.cues,
			// The presenter window is a shared product contract, not a per-slide
			// rectangle. The compiler rejects authored geometry; keep this fallback
			// fixed as a final guard for internal/rehydrated specs.
			rect: rect(10.993, 5.160, 2.25, 2.25, 'avatar'),
			style: blockStyle(block, { fill: { color: theme.panel || theme.bg, transparency: 0 }, line: theme.accent, ...(defaultShadow ? { shadow: defaultShadow } : {}) }),
			altText: block.altText || `Avatar narration: ${slide.title}`,
		})
		return objects
	}

	if (block.kind === 'cameo') {
		// Live camera feed (Cameo) placeholder — a native PowerPoint object that shows the
		// presenter's webcam during the show. The primitive paints the camera-glyph poster
		// inside the chosen frame. Default: a ~2.14in ellipse parked bottom-right (the
		// presenter corner) unless the author supplies geometry.
		addObject({
			role: 'cameo',
			primitive: 'cameo',
			shape: block.shape || block.frame,
			posterSvgDataUri: block.posterSvgDataUri,
			rect: explicitBlockRect(block, rect(10.7, 4.86, 2.14, 2.14, 'cameo'), 'cameo'),
			style: blockStyle(block, { line: theme.accent, ...(defaultShadow ? { shadow: defaultShadow } : {}) }),
			animation: block.animation,
			altText: block.altText || `Live camera feed: ${slide.title || slide.message || 'presenter'}`,
		})
		return objects
	}

	if (block.kind === 'slideZoom') {
		addObject({
			role: block.role || 'slide-zoom',
			primitive: 'slideZoom',
			targetSlideId: block.targetSlideId,
			patchOnly: Boolean(block.patch && typeof block.patch === 'object'),
			returnToParent: block.returnToParent,
			transitionDur: block.transitionDur,
			thumbnailDataUri: block.thumbnailDataUri,
			rect: explicitBlockRect(block, base, 'slideZoom'),
			altText: block.altText || `Slide Zoom to ${block.targetSlideId}`,
		})
		return objects
	}

	if (block.kind === 'opaqueNative') {
		const preservationPlaceholder = rect(
			regions.body.x,
			regions.body.y,
			Math.min(0.2, Math.max(0.01, regions.body.w)),
			Math.min(0.2, Math.max(0.01, regions.body.h)),
			'opaque-native'
		)
		addObject({
			role: block.role || 'opaque-native',
			primitive: 'opaqueNative',
			preservationHandle: block.preservationHandle,
			visibleSummary: block.visibleSummary,
			editabilityTier: block.editabilityTier,
			dependencyHandles: block.dependencyHandles,
			allowedEdits: block.allowedEdits,
			preserveGeometry: block.preserveGeometry === true,
			rect: block.preserveGeometry === true ? preservationPlaceholder : explicitBlockRect(block, base, 'opaqueNative'),
			style: blockStyle(block, {}),
			altText: block.altText || block.visibleSummary || `Opaque native content: ${slide.title}`,
		})
		return objects
	}

	if (block.kind === 'customGeometry' || block.kind === 'custom-geometry') {
		addObject({
			role: 'custom-geometry',
			primitive: 'customGeometry',
			handle: block.handle || block.geometryId,
			assetRef: block.assetRef,
			svg: block.svg || block.svgText || block.markup,
			pathData: block.pathData || block.d,
			points: block.points,
			fit: block.fit,
			precision: block.precision,
			rect: explicitBlockRect(block, base, 'custom-geometry'),
			style: blockStyle(block, {
				fill: { color: theme.success, transparency: 10 },
				line: theme.accent,
				...(defaultShadow ? { shadow: defaultShadow } : {}),
			}),
			animation: block.animation,
			altText: block.altText || `Editable custom geometry: ${slide.message || slide.title}`,
		})
		return objects
	}

	if (block.kind === 'shape') {
		if (String(block.text || '').trim()) {
			warnings.push({
				code: 'SHAPE_TEXT_FORBIDDEN',
				severity: 'error',
				slideId: slide.id,
				objectName: createObjectName(slide.id, blockName, block.role || 'shape'),
				message: 'A shape block is geometry-only. Use kind:"textShape" for text inside a PowerPoint shape, or add a separate kind:"textBox" object.',
				reason: 'The shape object model reserves kind:"shape" for geometry; embedding text there makes semantic text ownership ambiguous.',
				fix: 'Move the copy to kind:"textShape" or kind:"textBox", keep kind:"shape" text-free, and rerun dryRun.',
				evidence: { kind: block.kind, textCharacters: String(block.text).length, suggestedKinds: ['textShape', 'textBox'] },
				next: { recommendedTool: 'betterpptx.deck.generate_from_spec', reason: 'Revise the deterministic spec object model before compiling.' },
			})
		}
		addObject({
			role: block.role || 'shape',
			primitive: 'shape',
			shapeName: block.shapeName || block.shape || 'rect',
			...(block._isPureShape === true ? { _isPureShape: true } : {}),
			...(block.shapeStylePresetId || block.style?.shapeStylePresetId ? { shapeStylePresetId: block.shapeStylePresetId || block.style.shapeStylePresetId } : {}),
			...(block.wordArtStylePresetId || block.style?.wordArtStylePresetId ? { wordArtStylePresetId: block.wordArtStylePresetId || block.style.wordArtStylePresetId } : {}),
			...(block.shapeEffectPresetIds || block.shapeEffectPresetId || block.style?.shapeEffectPresetIds || block.style?.shapeEffectPresetId
				? { shapeEffectPresetIds: block.shapeEffectPresetIds || block.shapeEffectPresetId || block.style?.shapeEffectPresetIds || block.style.shapeEffectPresetId }
				: {}),
			text: '',
			rect: explicitBlockRect(block, base, 'shape'),
			style: blockStyle(block, {
				fill: theme.panel || theme.bg || 'FFFFFF',
				line: theme.accent,
				color: theme.ink,
				fontFace: theme.bodyFontFace || spec.theme?.fontFace || 'Aptos',
				fontSize: 14,
			}),
			animation: block.animation,
			altText: block.altText || `${block.shapeName || block.shape || 'shape'}: ${slide.title}`,
		})
		return objects
	}

	if (block.kind === 'connector') {
		// Connector geometry is resolved after all semantic blocks have been laid
		// out. `from`/`to` identify the AI-chosen relationship; the compiler then
		// derives the native line rectangle and endpoint IDs from engine geometry.
		const connectorType = block.connectorType || block.connectorShape || 'straightConnector1'
		if (!AUTHORING_CONNECTOR_TYPE_SET.has(connectorType)) {
			warnings.push({
				code: 'INVALID_CONNECTOR_TYPE',
				severity: 'error',
				slideId: slide.id,
				objectName: createObjectName(slide.id, blockName, 'connector'),
				message: `Connector type "${connectorType}" is not in the executable native vocabulary.`,
				reason: 'PowerPoint stores only the supported DrawingML connector presets; an informal alias would produce an unreadable package.',
				fix: 'Use one of the connector types returned by the public capability catalog.',
				evidence: { received: connectorType, supported: AUTHORING_CONNECTOR_TYPES },
				next: { recommendedTool: 'betterpptx.options.catalog', reason: 'Read the canonical connectorType values before compiling the semantic spec.' },
			})
		}
		addObject({
			role: block.role || 'connector',
			primitive: 'connector',
			connectorType: AUTHORING_CONNECTOR_TYPE_SET.has(connectorType) ? connectorType : 'straightConnector1',
			// The AI owns the gallery selection.  Preserve its exact public preset ID
			// through semantic layout so the executor can replay the selected native
			// state; layout planning must not replace or reinterpret that decision.
			...(block.connectorStylePresetId || block.style?.connectorStylePresetId
				? { connectorStylePresetId: block.connectorStylePresetId || block.style.connectorStylePresetId }
				: {}),
			from: block.from || block.source || block.start,
			to: block.to || block.target || block.end,
			rect: explicitBlockRect(block, base, 'connector'),
			style: blockStyle(block, { line: theme.accent, ...(defaultShadow ? { shadow: defaultShadow } : {}) }),
			animation: block.animation,
			altText: block.altText || `Connector: ${block.from || block.source || 'source'} to ${block.to || block.target || 'target'}`,
		})
		return objects
	}

	if (block.kind === 'group') {
		const box = explicitBlockRect(block, base, 'group')
		const sourceChildren = Array.isArray(block.children) ? block.children : []
		const direction = String(block.direction || block.layout || 'row').toLowerCase() === 'column' ? 'column' : 'row'
		const childObjects = (items, parentBox, parentName, localDirection = direction) => {
			const gap = items.length > 1 ? Math.min(0.18, localDirection === 'row' ? parentBox.w * 0.04 : parentBox.h * 0.04) : 0
			const span = localDirection === 'row' ? parentBox.w : parentBox.h
			const childSpan = Math.max(0.08, (span - gap * Math.max(0, items.length - 1)) / Math.max(1, items.length))
			return items.map((child, index) => {
				const explicit = [child?.x, child?.y, child?.w, child?.h].every(value => value !== undefined && value !== null && Number.isFinite(Number(value)))
				const frame = {
					x: explicit ? Number(child.x) : localDirection === 'row' ? (childSpan + gap) * index : 0,
					y: explicit ? Number(child.y) : localDirection === 'column' ? (childSpan + gap) * index : 0,
					w: explicit ? Number(child.w) : localDirection === 'row' ? childSpan : parentBox.w,
					h: explicit ? Number(child.h) : localDirection === 'column' ? childSpan : parentBox.h,
				}
				const objectName = child?.objectName || child?.name || `${parentName}-child-${index + 1}`
				return {
					...child,
					kind: child?.kind || 'shape',
					...frame,
					objectName,
					...(Array.isArray(child?.children) ? { children: childObjects(child.children, child.chExt || frame, objectName, String(child.direction || child.layout || localDirection).toLowerCase() === 'column' ? 'column' : 'row') } : {}),
					style: child && typeof child.style === 'object' ? child.style : {},
				}
			})
		}
		const children = childObjects(sourceChildren, block.chExt || box, blockName)
		addObject({
			role: block.role || 'group',
			primitive: 'group',
			children,
			direction,
			rect: box,
			...(block.animatedTable ? { animatedTable: block.animatedTable } : {}),
			...(block.chOff ? { chOff: block.chOff } : {}),
			...(block.chExt ? { chExt: block.chExt } : {}),
			...(block.rotate !== undefined || block.rotation !== undefined ? { rotate: block.rotate ?? block.rotation } : {}),
			...(block.flipH !== undefined ? { flipH: block.flipH } : {}),
			...(block.flipV !== undefined ? { flipV: block.flipV } : {}),
			animation: block.animation,
			altText: block.altText || `Editable native group: ${slide.message || slide.title}`,
		})
		return objects
	}

	if (block.kind === 'textBox' || block.kind === 'textShape') {
		const text = blockText(block, slide)
		const box = explicitBlockRect(block, base, block.kind)
		const _eff = effectiveBlockStyle(block)
		const readability = readabilityFloorForBlock(block, slideIndex)
		const defaultFont = block.kind === 'textShape' ? 14 : 16
		const authoredFont = Number(_eff.fontSize ?? block.fontSize)
		const hasAuthoredFont = Number.isFinite(authoredFont) && authoredFont > 0
		const requestedFont = hasAuthoredFont ? authoredFont : Math.max(defaultFont, readability.floorPt)
		const fontFace = _eff.fontFace || theme.headFontFace || spec.theme?.fontFace || 'Aptos'
		const fit = estimateTextFit({
			text,
			rect: box,
			fontSize: requestedFont,
			minFontSize: readability.floorPt,
			fontFace,
			margin: _eff.margin,
			charSpacing: _eff.charSpacing,
			bullet: !!_eff.bullet,
		})
		const resolvedFont = hasAuthoredFont ? authoredFont : fit.fontSize
		// M15 per-world composition: a HEADING-ish standalone text box defaults to the
		// world's heading/cover alignment (editorial/blueprint/brutalist read left, luxe
		// centers). Body text and any author-set align are untouched (author wins below).
		const _effSize = Number(_eff.fontSize ?? block.fontSize ?? resolvedFont) || resolvedFont
		const _isHeading = block.kind === 'textBox' && (_effSize >= 24 || (_eff.bold && _effSize >= 20))
		const _comp = theme.composition || {}
		// On a COVER (title-only/hero) the whole text stack shares the cover alignment so
		// title + subtitle read as one composition; elsewhere only a heading follows the
		// world's title alignment (body stays left for readability). Author align wins below.
		const _isCover = slide.layoutIntent === 'title-only' || slide.layoutIntent === 'hero'
		const _worldAlign = _isCover ? _comp.coverAlign : _comp.titleAlign
		const _applies = block.kind === 'textBox' && (_isCover || _isHeading)
		const headingAlign = block.kind === 'textShape' ? 'center' : (_applies && _worldAlign ? _worldAlign : undefined)
		// M19b typographic-emphasis: apply the world's hero-text treatment (glow/reflection)
		// to the COVER/HERO heading line ONLY — restraint: most worlds add nothing, glassy/
		// elegant worlds glow/reflect. Author glow/reflection always wins (blockStyle).
		const _te = theme.typeEmphasis || {}
		const _heroText = block.kind === 'textBox' && _isCover && _isHeading
		// A faithful HTML canvas is itself the visual authority. World defaults may
		// help semantic authoring, but they must not invent glow/reflection absent
		// from the submitted design. Explicit block effects still pass through
		// blockStyle and therefore remain author-controlled.
		const _allowWorldHeroTreatment = readabilityPolicyForSpec(spec, slide) !== 'faithful-html'
		const objectName = block.objectName || createObjectName(slide.id, blockName, block.kind)
		addObject({
			objectName,
			role: block.role || (block.kind === 'textShape' ? 'text-shape' : 'text'),
			primitive: block.kind === 'textShape' ? 'textShape' : 'text',
			shapeName: block.shapeName || block.shape || 'roundRect',
			...(block.wordArtStylePresetId || block.style?.wordArtStylePresetId ? { wordArtStylePresetId: block.wordArtStylePresetId || block.style.wordArtStylePresetId } : {}),
			...(block.shapeStylePresetId || block.style?.shapeStylePresetId ? { shapeStylePresetId: block.shapeStylePresetId || block.style.shapeStylePresetId } : {}),
			...(block.shapeEffectPresetIds || block.shapeEffectPresetId || block.style?.shapeEffectPresetIds || block.style?.shapeEffectPresetId
				? { shapeEffectPresetIds: block.shapeEffectPresetIds || block.shapeEffectPresetId || block.style?.shapeEffectPresetIds || block.style.shapeEffectPresetId }
				: {}),
			...(block.textEffectPresetIds || block.textEffectPresetId || block.style?.textEffectPresetIds || block.style?.textEffectPresetId
				? { textEffectPresetIds: block.textEffectPresetIds || block.textEffectPresetId || block.style?.textEffectPresetIds || block.style.textEffectPresetId }
				: {}),
			text,
			rect: box,
			style: blockStyle(block, {
				// D10/M7: textShape cards get the same glassy fill + SUBTLE border as stat
				// cards (was flat panel + accent border on every card — over-accented).
				fill: block.kind === 'textShape' ? cardFillDefault(theme) : undefined,
				line: block.kind === 'textShape' ? cardBorderDefault(theme) : undefined,
				shadow: block.kind === 'textShape' ? (cardShadowDefault(theme) || null) : undefined,
				rectRadius: block.kind === 'textShape' ? cardRadiusDefault(theme) : undefined,
				color: theme.ink,
				fontFace,
				fontSize: resolvedFont,
				align: headingAlign,
				...(_allowWorldHeroTreatment && _heroText && _te.heroGlow ? { textGlow: _te.heroGlow } : {}),
				...(_allowWorldHeroTreatment && _heroText && _te.heroReflection ? { reflection: { type: 'standard' } } : {}),
				valign: block.kind === 'textShape' ? 'middle' : undefined,
				rectRadius: block.kind === 'textShape' ? 0.08 : undefined,
			}),
			animation: block.animation,
			fit,
			altText: plannedTextAltText(block, text, objectName),
		})
		if (fit.overflow) warnings.push(textOverflowFinding({ slideId: slide.id, objectName, fit, rect: box, text, minFontSize: readability.floorPt, message: 'Text may overflow at the role-specific readability floor.' }))
		if (resolvedFont < readability.floorPt) warnings.push(smallTextReadabilityFinding({ slideId: slide.id, objectName, role: readability.role, floorPt: readability.floorPt, requestedFontSize: requestedFont, resolvedFontSize: resolvedFont, source: hasAuthoredFont ? 'ai-authored-style' : 'engine-fit' }))
		return objects
	}

	if (block.kind === 'equation') {
		// Read the actual math source (unicodeMath renders natively; latex/omml/template also
		// accepted). Never fall back to the slide message as the formula (calibration r1 bug).
		const eqSource = block.unicodeMath ?? block.latex ?? block.omml ?? block.source ?? block.equation ?? block.text ?? ((block.equationGalleryPresetId || block.equationPresetId) ? undefined : '')
		const eqFormat = block.sourceFormat
			|| (block.omml ? 'omml' : block.latex ? 'latex' : block.unicodeMath ? 'unicodeMath'
				: (typeof (block.source || block.equation) === 'object' ? 'template' : 'unicodeMath'))
		const fallbackText = blockText(block, slide)
		// Keep structured templates as objects all the way to the native equation
		// handler. Only derive a short display label for layout/readability; the
		// previous String(object) coercion silently authored "[object Object]".
		const mathText = typeof eqSource === 'string'
			? (eqSource.trim() || fallbackText)
			: (eqSource && typeof eqSource === 'object' ? `[${eqSource.kind || 'equation'}]` : fallbackText)
		addObject({
			role: 'equation',
			primitive: 'equation',
			// Keep the AI-selected Ribbon structure and its semantic slots intact;
			// the compiler resolves the opaque ID to native OMML at execution time.
			...(block.equationGalleryPresetId || block.equationPresetId
				? { equationGalleryPresetId: block.equationGalleryPresetId || block.equationPresetId }
				: {}),
			...(block.parameters ? { parameters: block.parameters } : {}),
			...(block.slots ? { slots: block.slots } : {}),
			...(block.semanticSlots ? { semanticSlots: block.semanticSlots } : {}),
			source: eqSource,
			sourceFormat: eqFormat,
			...(block.display !== undefined ? { display: block.display } : {}),
			...(block.align !== undefined ? { align: block.align } : {}),
			...(block.lang !== undefined ? { lang: block.lang } : {}),
			...(block.fontFace !== undefined ? { fontFace: block.fontFace } : {}),
			...(block.fontSize !== undefined ? { fontSize: block.fontSize } : {}),
			...(block.color !== undefined ? { color: block.color } : {}),
			...(block.italic !== undefined ? { italic: block.italic } : {}),
			...(block.fallback !== undefined ? { fallback: block.fallback } : {}),
			...(block.rotate !== undefined ? { rotate: block.rotate } : {}),
			...(block.rotation !== undefined ? { rotation: block.rotation } : {}),
			...(block.flipH !== undefined ? { flipH: block.flipH } : {}),
			...(block.flipV !== undefined ? { flipV: block.flipV } : {}),
			text: mathText,
			rect: explicitBlockRect(block, base, 'equation'),
			style: blockStyle(block, {
				color: theme.ink,
				fontFace: 'Cambria Math',
				fontSize: 22,
				align: 'center',
			}),
			animation: block.animation,
			altText: block.altText || `Equation: ${mathText || slide.title}`,
		})
		return objects
	}

	if (block.kind === 'model3d') {
		const motionFraming = model3dMotionFraming(block)
		const modelOptions = motionFraming === undefined ? block.modelOptions : { ...(block.model3dOptions || {}), ...(block.modelOptions || {}) }
		const scene = normalizeStaticPoseScene(modelOptions?.scene ?? block.scene, model3dStaticPose(block))
		const hasModelReference = Boolean(block.assetRef || block.modelAsset || block.model3DAsset || block.model)
		if (block.scene && typeof block.scene === 'object' && Object.prototype.hasOwnProperty.call(block.scene, 'posterAnimId')) {
			warnings.push({
				code: 'MODEL3D_POSTER_ANIMATION_UNSUPPORTED',
				severity: 'error',
				slideId: slide.id,
				objectName: createObjectName(slide.id, blockName, 'model3d'),
				message: 'posterAnimId is not an executable PowerPoint scene option and cannot be used as pre-save static-pose evidence.',
				reason: 'Repair-safe native playback selects embedded animation clips through the slide timing tree. PowerPoint edit/static view comes from the GLB base pose with a raster fallback; the rejected poster-frame scene extension can corrupt the package.',
				fix: 'Remove scene.posterAnimId. Author a presentation-ready GLB base pose or use a governed presenter/static-mode asset, then rerun dryRun and inspect the full PowerPoint render.',
				evidence: { unsupportedField: 'scene.posterAnimId', supportedSceneFields: ['animId', 'length', 'loop'], engineAction: 'block-without-emitting-unsafe-package-state' },
			})
		}
		// Semantic front-door: an AI author can express INTENT (a story query / context /
		// intent) instead of pre-fetching a catalog handle. The compiler resolves the best
		// native Microsoft-Stock model at compile time (see model3DOptionsForObject + the
		// injected ctx.resolveModel3d). Only a block with neither a handle nor a query is a
		// true placeholder.
		const hasSemanticQuery = Boolean(block.query || block.context || block.prompt || block.intent || block.useCase || block.aiContext)
		if (!hasModelReference && !hasSemanticQuery) {
			warnings.push({
				code: 'MODEL3D_ASSET_MISSING',
				severity: 'warning',
				slideId: slide.id,
				message: '3D model block has no opaque asset handle or semantic query; it will compile to a visual placeholder.',
				reason: 'The engine has neither a semantic request to resolve nor an asset reference to render as the visual proof.',
				fix: 'Add a story query/intent (for example query or useCase) or select a public asset handle, then rerun dryRun.',
				evidence: { kind: block.kind, name: block.name || blockName, hasModelReference: false, hasSemanticQuery: false, fallback: 'visual-placeholder' },
			})
		}
		addObject({
			role: 'model3d',
			primitive: 'model3d',
			assetRef: block.assetRef,
			modelAsset: block.modelAsset || block.model3DAsset || block.model,
			posterAsset: block.posterAsset || block.poster,
			// Semantic selection fields (used only when no explicit handle is given).
			query: block.query,
			context: block.context,
			prompt: block.prompt,
			intent: block.intent,
			useCase: block.useCase,
			aiContext: block.aiContext,
			sizePolicy: block.sizePolicy,
			preferNative: block.preferNative,
			maxModelSizeMb: block.maxModelSizeMb,
			modelOptions,
			...(motionFraming !== undefined ? { motionFraming } : {}),
			...(Object.prototype.hasOwnProperty.call(block, 'staticPose') ? { staticPose: block.staticPose }
				: Object.prototype.hasOwnProperty.call(block.model3dOptions || {}, 'staticPose') ? { staticPose: block.model3dOptions.staticPose } : {}),
			model3dViewPresetId: block.model3dViewPresetId || block.modelOptions?.model3dViewPresetId,
			// Per-world STAGING: the world frames AND lights the model (camera lens + pose +
			// key-light tint) unless the author set their own. luxe = cinematic telephoto + warm
			// gold light, blueprint = flat technical + cool cyan, brutalist = wide + hard white.
			camera: block.camera || (!motionFraming && !block.model3dViewPresetId && !block.modelOptions?.model3dViewPresetId && theme.stage3d ? theme.stage3d.camera : undefined),
			trans: block.trans || (!motionFraming && !block.model3dViewPresetId && !block.modelOptions?.model3dViewPresetId && theme.stage3d ? { scale: { x: 1, y: 1, z: 1 }, rot: block.rotation || theme.stage3d.rot } : undefined),
			ambientLight: block.ambientLight || (!block.model3dViewPresetId && !block.modelOptions?.model3dViewPresetId && theme.stage3d?.ambient ? { color: theme.stage3d.ambient.color, illuminance: theme.stage3d.ambient.illuminance } : undefined),
			ptLights: block.ptLights || (!block.model3dViewPresetId && !block.modelOptions?.model3dViewPresetId && theme.stage3d?.key ? [{ color: theme.stage3d.key.color, intensity: theme.stage3d.key.intensity, pos: { x: 24000000, y: 56000000, z: 30000000 } }] : undefined),
			nativeOnly: block.nativeOnly,
			// Rigged-model Scene playback selects an embedded glTF animation through
			// PowerPoint's repair-safe timing tree ({ animId, length?, loop? }). Static/edit
			// posture comes from the GLB base transforms, not a poster animation selector.
			scene,
			// am3d viewport size (EMU) — PowerPoint sizes the model by THIS, not the shape frame or the
			// model's own scale. The presenter-director sets it (frame-height-proportional) so a Baker-flattened
			// performer fills its box head-to-toe instead of rendering at ~25%. Author/default otherwise.
			objViewport: block.objViewport,
			text: block.text || '',
			rect: explicitBlockRect(block, base, 'model3d'),
			style: blockStyle(block, {
				fill: { color: 'E0F2FE', transparency: 2 },
				line: theme.accent,
				...(defaultShadow ? { shadow: defaultShadow } : {}),
				color: theme.ink,
				fontSize: 11,
			}),
			// 3D is top-premium THROUGH dynamics: a model with no author animation adopts the
			// world's native 3D dynamic (luxe turntable, brutalist jump&turn, …). One tasteful
			// motion per model (restraint). Author animation / animation:false always wins.
			// EXCEPTION: a rigged model with a selected Scene auto-plays that embedded clip (the
			// clip IS the motion) instead of the world turntable — duration/loop follow the scene.
			// autoScenePlayAnimation mirrors the emitter's strict predicates so playback and
			// selection never disagree; it returns null (→ world dynamic) when there is no valid scene.
			animation: block.animation !== undefined ? block.animation
				: (autoScenePlayAnimation(scene)
					|| (theme.motion?.model3d ? { type: theme.motion.model3d.type, effect: theme.motion.model3d.effect, duration: theme.motion.model3d.durationMs, trigger: 'afterPrevious' } : undefined)),
			altText: block.altText || `3D model: ${slide.message || slide.title}`,
		})
		return objects
	}

	if (block.kind === 'freeform') {
		// freeform accepts a point list OR an SVG path. When the author gives a path/svg
		// (the natural way to draw a curve) but no points, route to the SVG-capable
		// customGeometry primitive (insert_svg) instead of falling back to default points
		// (audit finding: a bezier svgPath rendered a default pentagon).
		const pathData = block.pathData || block.d || block.svgPath || block.path
		const svg = block.svg || block.svgText || block.markup
		const hasPoints = Array.isArray(block.points) && block.points.length > 0
		const usePath = !hasPoints && !!(pathData || svg)
		addObject({
			role: 'freeform',
			primitive: usePath ? 'customGeometry' : 'freeform',
			points: block.points,
			...(pathData ? { pathData } : {}),
			...(svg ? { svg } : {}),
			...(block.fit ? { fit: block.fit } : {}),
			rotate: block.rotate,
			rect: explicitBlockRect(block, base, 'freeform'),
			style: blockStyle(block, {
				fill: { color: theme.success, transparency: 10 },
				line: theme.accent,
				...(defaultShadow ? { shadow: defaultShadow } : {}),
			}),
			animation: block.animation,
			altText: block.altText || `Custom vector shape: ${slide.message || slide.title}`,
		})
		return objects
	}

	if (block.kind === 'wordart' || block.kind === 'text3d') {
		const text = blockText(block, slide)
		const box = explicitBlockRect(block, base, block.kind)
		const authorStyle = effectiveBlockStyle(block)
		const readability = readabilityFloorForBlock(block, slideIndex)
		const authoredFontSize = Number(authorStyle.fontSize ?? block.fontSize)
		const fontFace = authorStyle.fontFace || theme.headFontFace || spec.theme?.fontFace || 'Aptos Display'
		// Text3D is normally a focal mark, not body copy. When the AI omits an
		// explicit size, derive a conservative display size from the solved host and
		// the longest line. An authored fontSize remains fully authoritative.
		const longestLineChars = Math.max(1, ...String(text || '').split(/\r?\n/).map(line => line.trim().length))
		const widthBound = (Math.max(0.1, box.w - 0.16) * 72) / (longestLineChars * textWidthFactor(fontFace) * 1.08)
		const heightBound = Math.max(12, Math.max(0.1, box.h - 0.16) * 72 * 0.38)
		const defaultFontSize = block.kind === 'text3d'
			? Math.round(Math.max(28, Math.min(132, widthBound, heightBound)))
			: 34
		const requestedFontSize = Number.isFinite(authoredFontSize) && authoredFontSize > 0 ? authoredFontSize : defaultFontSize
		const fit = estimateTextFit({ text, rect: box, fontSize: requestedFontSize, minFontSize: readability.floorPt, fontFace, margin: authorStyle.margin, charSpacing: authorStyle.charSpacing })
		const resolvedFontSize = Number.isFinite(authoredFontSize) && authoredFontSize > 0 ? authoredFontSize : fit.fontSize
		addObject({
			role: block.kind,
			primitive: 'text',
			text,
			rect: box,
			...(Object.prototype.hasOwnProperty.call(block, 'wordArt') ? { wordArt: block.wordArt } : {}),
			...(Object.prototype.hasOwnProperty.call(block, 'text3D') ? { text3D: block.text3D } : {}),
			// Keep the AI-selected native WordArt tile attached to the semantic
			// object.  The text/text3d branch used to synthesize the transform but
			// dropped wordArtStylePresetId before compilation, making the public
			// 20-tile catalog unreachable for these dedicated kinds.
			...(block.wordArtStylePresetId || block.style?.wordArtStylePresetId
				? { wordArtStylePresetId: block.wordArtStylePresetId || block.style.wordArtStylePresetId }
				: {}),
			...(block.textEffectPresetIds || block.textEffectPresetId || block.style?.textEffectPresetIds || block.style?.textEffectPresetId
				? { textEffectPresetIds: block.textEffectPresetIds || block.textEffectPresetId || block.style?.textEffectPresetIds || block.style.textEffectPresetId }
				: {}),
			style: blockStyle(block, {
				color: theme.ink,
				fontFace,
				fontSize: resolvedFontSize,
				bold: true,
				align: block.kind === 'text3d' ? 'center' : undefined,
				valign: block.kind === 'text3d' ? 'middle' : undefined,
				wordArt: block.kind === 'wordart' ? { ...(block.wordArt || {}), transform: block.transform || block.wordArt?.transform || 'textWave1' } : undefined,
				text3D: block.kind === 'text3d' ? (block.text3D || {
					bevel: { type: 'relaxedInset', w: 4, h: 2 },
					extrusion: { depth: 16, color: theme.accent },
					material: 'matte',
					lightRig: 'balanced',
					rotationX: 0,
					rotationY: 0,
					rotationZ: 0,
				}) : undefined,
				...(block.effect3D ? { effect3D: block.effect3D } : {}),
				glow: { color: theme.success, opacity: 0.22, size: 2 },
			}),
			animation: block.animation,
			fit: (block.fit === null || typeof block.fit === 'string') ? block.fit : fit,
			altText: text,
		})
		const objectName = createObjectName(slide.id, blockName, block.kind)
		if (fit.overflow) warnings.push(textOverflowFinding({ slideId: slide.id, objectName, fit, rect: box, text, minFontSize: readability.floorPt, message: 'Decorative text may overflow at the role-specific readability floor.' }))
		if (resolvedFontSize < readability.floorPt) warnings.push(smallTextReadabilityFinding({ slideId: slide.id, objectName, role: readability.role, floorPt: readability.floorPt, requestedFontSize, resolvedFontSize, source: Number.isFinite(authoredFontSize) && authoredFontSize > 0 ? 'ai-authored-style' : 'engine-fit' }))
		return objects
	}

	if (block.kind === 'comparison') {
		const compactH = Math.min(regions.left.h, 2.35)
		const compactY = regions.left.y + Math.max(0, (regions.left.h - compactH) / 2)
		const halves = [
			rect(regions.left.x, compactY, regions.left.w, compactH, regions.left.role),
			rect(regions.right.x, compactY, regions.right.w, compactH, regions.right.role),
		]
		const items = Array.isArray(block.items) && block.items.length ? block.items.slice(0, 2) : [{ name: 'left', text: block.text || slide.message }, { name: 'right', text: '' }]
		items.forEach((item, index) => {
			const box = halves[index] || base
			const text = [item.label, item.text || item.value].filter(Boolean).join('\n') || `${item.name || ''}`
			const authorStyle = effectiveBlockStyle(block)
			const readability = readabilityFloorForBlock(block, slideIndex)
			const authoredFont = Number(authorStyle.fontSize)
			const hasAuthoredFont = Number.isFinite(authoredFont) && authoredFont > 0
			const requestedFont = hasAuthoredFont ? authoredFont : Math.max(16, readability.floorPt)
			const fit = estimateTextFit({ text, rect: box, fontSize: requestedFont, minFontSize: readability.floorPt, fontFace: authorStyle.fontFace || theme.bodyFontFace || spec.theme?.fontFace || 'Aptos', margin: authorStyle.margin, charSpacing: authorStyle.charSpacing })
			const resolvedFont = hasAuthoredFont ? authoredFont : fit.fontSize
			const objectName = createObjectName(slide.id, blockName, 'comparison-panel', item.name || String(index + 1))
			addObject({
				role: 'comparison-panel',
				objectName,
				itemName: item.name,
				primitive: 'textShape',
				shapeName: 'roundRect',
				text,
				rect: box,
				style: {
					fill: theme.panel || 'FFFFFF',
					line: index === 0 ? theme.accent : theme.success,
					...(defaultShadow ? { shadow: defaultShadow } : { shadow: null }),
					color: theme.ink,
					fontSize: resolvedFont,
					rectRadius: 0.08,
					align: 'center',
					valign: 'middle',
					autoFit: 'shrink',
					...effectiveBlockStyle(block),
				},
				fit,
				animation: block.animation,
				altText: text,
			})
			if (fit.overflow) warnings.push(textOverflowFinding({ slideId: slide.id, objectName, fit, rect: box, text, minFontSize: readability.floorPt, message: 'Comparison copy may overflow at the role-specific readability floor.' }))
			if (resolvedFont < readability.floorPt) warnings.push(smallTextReadabilityFinding({ slideId: slide.id, objectName, role: readability.role, floorPt: readability.floorPt, requestedFontSize: requestedFont, resolvedFontSize: resolvedFont, source: hasAuthoredFont ? 'ai-authored-style' : 'engine-fit' }))
		})
		return objects
	}

	const text = blockText(block, slide)
	const role = block.kind === 'title' ? 'title' : block.kind === 'callout' ? 'callout' : 'text'
	let box = base
	const authorStyle = effectiveBlockStyle(block)
	const readability = readabilityFloorForBlock(block, slideIndex)
	// M18: hero titles and pull-quotes read large by default (the AI can still override).
	const _heroTitle = slide.layoutIntent === 'hero' && block.kind === 'title'
	const _pullQuote = slide.layoutIntent === 'pull-quote' && (block.kind === 'quote' || block.kind === 'body' || block.kind === 'text')
	const defaultFont = _heroTitle ? 50 : _pullQuote ? 32 : (block.kind === 'title' ? 35 : block.kind === 'quote' ? 22 : block.kind === 'callout' ? 16 : 16)
	const hasAuthoredFont = Number(authorStyle.fontSize) > 0
	const requestedFont = hasAuthoredFont ? Number(authorStyle.fontSize) : Math.max(defaultFont, readability.floorPt)
	const headingType = block.kind === 'title' || block.kind === 'quote'
	const headFace = theme.headFontFace || spec.theme?.headFontFace || spec.theme?.fontFace
	const bodyFace = theme.bodyFontFace || spec.theme?.bodyFontFace || spec.theme?.fontFace
	const fontFace = authorStyle.fontFace || (headingType ? headFace : bodyFace) || 'Aptos'
	const coverIntent = slide.layoutIntent === 'title-only' || slide.layoutIntent === 'hero' || slide.layoutIntent === 'pull-quote' || slide.layoutIntent === 'section-divider'
	const worldAlign = headingType
		? ((coverIntent ? theme.composition?.coverAlign : theme.composition?.titleAlign) || theme.composition?.titleAlign)
		: undefined
	const lightHead = /light/i.test(String(headFace || ''))
	const fit = estimateTextFit({ text, rect: box, fontSize: requestedFont, minFontSize: readability.floorPt, fontFace, margin: authorStyle.margin, charSpacing: authorStyle.charSpacing, bullet: !!authorStyle.bullet })
	// Honor an author-specified font size even if it risks overflow (we warn);
	// only auto-fit when the size was the compiler default.
	const resolvedFont = hasAuthoredFont ? Number(authorStyle.fontSize) : fit.fontSize
	addObject({
		role,
		primitive: 'text',
		text,
		rect: box,
		style: {
			color: theme.ink,
			fontFace,
			fontSize: resolvedFont,
			bold: block.kind === 'title' ? !lightHead : undefined,
			fill: block.kind === 'callout' ? theme.panel || theme.bg : undefined,
			line: block.kind === 'callout' ? cardBorderDefault(theme) : undefined,
			shadow: block.kind === 'callout' ? cardShadowDefault(theme) : undefined,
			align: block.kind === 'callout' ? 'center' : worldAlign,
			valign: block.kind === 'callout' ? 'middle' : undefined,
			autoFit: block.kind === 'callout' ? 'shrink' : undefined,
			rectRadius: block.kind === 'callout' ? cardRadiusDefault(theme) : undefined,
			...authorStyle,
		},
		animation: block.animation,
		fit,
		altText: text,
	})
	const objectName = createObjectName(slide.id, blockName, role)
	if (fit.overflow) warnings.push(textOverflowFinding({ slideId: slide.id, objectName, fit, rect: box, text, minFontSize: readability.floorPt, message: 'Text may overflow at the role-specific readability floor.' }))
	if (resolvedFont < readability.floorPt) warnings.push(smallTextReadabilityFinding({ slideId: slide.id, objectName, role: readability.role, floorPt: readability.floorPt, requestedFontSize: requestedFont, resolvedFontSize: resolvedFont, source: hasAuthoredFont ? 'ai-authored-style' : 'engine-fit' }))
	return objects
}

// ---- M19: SELECTED-LAYOUT FEASIBILITY READBACK -------------------------------------------
// The AI chooses slides[].layoutIntent. The engine reports the regions and block assignments
// it will mechanically use for that exact choice, plus factual fit/balance findings. It does
// not score, rank, or recommend alternative compositions.
function slideContentShape(slide) {
	const content = (Array.isArray(slide.content) ? slide.content : []).filter(block => !isEngineScaffoldBlock(block))
	const kinds = content.map(b => String(b?.kind || '').toLowerCase())
	const count = (...names) => kinds.filter(x => names.includes(x)).length
	return {
		content,
		total: content.length,
		charts: count('chart', 'chart-panel'),
		images: count('image', 'image-feature'),
		tables: count('table', 'table-panel'),
		kpis: count('kpi', 'stat', 'metric-grid'),
		quotes: count('quote', 'pull-quote'),
		textish: count('textbox', 'text', 'body', 'bullets', 'callout', 'title', 'subtitle', 'eyebrow'),
	}
}

function regionIntersectionArea(object, region) {
	const r = object?.rect
	if (!r || !region) return 0
	const w = Math.max(0, Math.min(r.x + r.w, region.x + region.w) - Math.max(r.x, region.x))
	const h = Math.max(0, Math.min(r.y + r.h, region.y + region.h) - Math.max(r.y, region.y))
	return w * h
}

function isSubstantiveLayoutObject(object) {
	if (!object || object.bleed === true) return false
	if (['background', 'decorative'].includes(String(object.role || '').toLowerCase())) return false
	if (['title', 'footer', 'section-divider', 'narration'].includes(String(object.blockKind || object.primitive || '').toLowerCase())) return false
	return true
}

function isSupportingCaptionObject(object) {
	const name = String(object?.blockName || object?.objectName || '').toLowerCase()
	return /(^|[-_.])(caption|label)($|[-_.])/.test(name)
}

function isMatchingBackingFrame(object, objects) {
	const role = String(object?.role || '').toLowerCase()
	if (!['image-frame', 'media-frame'].includes(role)) return false
	const blockName = object?.blockName
	if (!blockName) return false
	const visibleRole = role === 'image-frame' ? 'image' : 'media'
	return (objects || []).some(candidate => candidate !== object && candidate?.blockName === blockName && String(candidate?.role || '').toLowerCase() === visibleRole && regionIntersectionArea(object, candidate?.rect) > 0.5 * Math.max(0.01, Number(object?.rect?.w || 0) * Number(object?.rect?.h || 0)))
}

function semanticRegionOccupancy(objects, regions, names, options = {}) {
	const allObjects = Array.isArray(objects) ? objects : []
	// World depth may add a same-block backing frame under an image/video. It is
	// intentional visual treatment, not a second proof item; excluding it here
	// keeps balance density aligned with the semantic content and with overlap
	// lint's narrow frame/media exemption.
	const substantive = allObjects.filter(object => isSubstantiveLayoutObject(object) && !isMatchingBackingFrame(object, allObjects))
	return Object.fromEntries(names.map(name => {
		const region = regions?.[name]
		const hits = options.exclusive
			? substantive.filter(object => {
				const ownArea = regionIntersectionArea(object, region)
				if (ownArea <= 0.08) return false
				const overlaps = names.map(candidate => regionIntersectionArea(object, regions?.[candidate]))
				const maxArea = Math.max(...overlaps)
				const firstMax = overlaps.findIndex(value => value >= maxArea - 0.001)
				return names.indexOf(name) === firstMax
			})
			: substantive.filter(object => regionIntersectionArea(object, region) > 0.08)
		return [name, {
			area: round(hits.reduce((sum, object) => sum + regionIntersectionArea(object, region), 0)),
			blocks: [...new Set(hits.map(object => object.blockName || object.blockKind || object.objectName).filter(Boolean))],
		}]
	}))
}

function addUnderfilledRegionWarning(warnings, slideId, layoutIntent, regions, objects, contract) {
	if (!contract || !['image-left-copy-right', 'copy-left-image-right', 'chart-left-insights-right', 'insights-left-chart-right'].includes(layoutIntent)) return
	const occupancy = semanticRegionOccupancy(objects, regions, ['left', 'right'])
	const empty = Object.entries(occupancy).filter(([, value]) => value.area < 0.08).map(([name]) => name)
	if (!empty.length) return
	warnings.push({
		code: 'LAYOUT_REGION_UNDERFILLED',
		severity: 'warning',
		slideId,
		message: `layoutIntent "${layoutIntent}" leaves the ${empty.join(' and ')} semantic region underfilled after placement.`,
		reason: 'Content was supplied, but the selected proof/explanation split does not have substantive content in every primary region.',
		fix: 'Change content[].region or regionPlan semantically, or choose a compatible layoutIntent; do not add coordinates.',
		evidence: { layoutIntent, occupancy, expected: 'both primary semantic regions contain substantive content', contract: { purpose: contract.purpose, proof: contract.proof, explanation: contract.explanation } },
		suggestions: contract.fallback,
	})
}

// A split can be technically populated while still reading as visibly lopsided:
// for example, several substantive blocks pinned to one side and one small label
// on the other.  Keep this advisory deliberately conservative so intentional
// negative space remains valid, while giving the AI a semantic correction path
// before a deck is committed.
function addBalanceImbalanceWarning(warnings, slideId, layoutIntent, regions, objects, contract) {
	if (!contract || !['image-left-copy-right', 'copy-left-image-right', 'chart-left-insights-right', 'insights-left-chart-right'].includes(layoutIntent)) return
	const occupancy = semanticRegionOccupancy(objects, regions, ['left', 'right'])
	const leftRegion = regions?.left
	const rightRegion = regions?.right
	if (!leftRegion || !rightRegion || occupancy.left.area < 0.08 || occupancy.right.area < 0.08) return
	const leftArea = Math.max(0.01, leftRegion.w * leftRegion.h)
	const rightArea = Math.max(0.01, rightRegion.w * rightRegion.h)
	const density = {
		left: occupancy.left.area / leftArea,
		right: occupancy.right.area / rightArea,
	}
	const low = Math.min(density.left, density.right)
	const high = Math.max(density.left, density.right)
	const ratio = high / Math.max(0.01, low)
	const blockCountSkew = Math.abs(occupancy.left.blocks.length - occupancy.right.blocks.length)
	const blockCounts = [occupancy.left.blocks.length, occupancy.right.blocks.length]
	const blockCountRatio = Math.max(...blockCounts) / Math.max(1, Math.min(...blockCounts))
	const severeDensitySkew = ratio >= 3.5 && low < 0.18 && high >= 0.48 && blockCountSkew >= 2
	// One proof object beside several correctly stacked explanation objects is a
	// normal chart-reading composition. Block count alone is not imbalance; it
	// becomes advisory only when occupied visual density is also strongly skewed.
	const severeCountSkew = blockCountRatio >= 3 && Math.max(...blockCounts) >= 3 && Math.min(...blockCounts) <= 1
		&& ratio >= 2 && low < 0.4 && high >= 0.7
	if (!severeDensitySkew && !severeCountSkew) return
	warnings.push({
		code: 'LAYOUT_BALANCE_IMBALANCE',
		severity: 'warning',
		slideId,
		message: `layoutIntent "${layoutIntent}" is populated on both sides but the semantic density is strongly imbalanced.`,
		reason: 'Substantive content occupies substantially more of one primary region than the other, which can make the slide read as left- or right-heavy.',
		fix: 'Reassign content[].region semantically, reduce competing blocks, or choose a layoutIntent whose proof/explanation contract matches the story; do not add coordinates.',
		evidence: { layoutIntent, occupancy, density: { left: round(density.left), right: round(density.right) }, densityRatio: round(ratio), blockCountRatio: round(blockCountRatio), expected: 'proof and explanation should have a deliberate, readable visual weight in both primary regions', contract: { purpose: contract.purpose, proof: contract.proof, explanation: contract.explanation } },
		suggestions: contract.fallback,
	})
}

// Public engine readback for the AI's visual-composition decision.  Warnings are
// deliberately conservative (they only fire for severe cases), but the AI still
// needs a normalized measurement for every split layout to decide whether a
// proposal is balanced, intentionally quiet, or worth revising semantically.
// This reports occupied semantic area and density, never authoring instructions;
// the engine remains the sole owner of the rectangles used to measure it.
export function visualBalanceReadback(slide = {}) {
	const layoutIntent = String(slide.layoutIntent || '')
	const regionSets = {
		three: ['leftThird', 'midThird', 'rightThird'],
		two: ['left', 'right'],
		asymmetric: ['sidebar', 'main'],
	}
	let mode = layoutIntent === 'three-column'
		? 'three-column'
		: ['sidebar-left', 'sidebar-right'].includes(layoutIntent)
			? 'sidebar'
			: ['image-left-copy-right', 'copy-left-image-right', 'chart-left-insights-right', 'insights-left-chart-right', 'two-column', 'comparison'].includes(layoutIntent)
				? 'two-column'
				: 'single-or-compact'
	let names = mode === 'three-column'
		? regionSets.three
		: mode === 'sidebar'
			? regionSets.asymmetric
			: mode === 'two-column'
				? regionSets.two
				: []
	let effectiveRegions = slide.regions || {}
	let arrangementMode = false
	const arrangementEligible = new Set(['title-body', 'title-body-footer', 'two-column', 'three-column', 'comparison', 'timeline', 'process-flow', 'dense-appendix'])
	if (!names.length && arrangementEligible.has(layoutIntent) && slide.arrange && typeof slide.arrange === 'object') {
		const body = effectiveRegions.body || effectiveRegions.main
		const rawWeights = Array.isArray(slide.arrange.split) ? slide.arrange.split.map(Number) : null
		const validWeights = rawWeights && rawWeights.length >= 2 && rawWeights.every(value => Number.isFinite(value) && value > 0)
		const requestedCols = Number(slide.arrange.cols)
		const gridWeights = Number.isInteger(requestedCols) && requestedCols >= 2 && requestedCols <= 4
			? Array.from({ length: requestedCols }, () => 1)
			: null
		const weights = validWeights ? rawWeights : gridWeights
		if (body && weights) {
			arrangementMode = true
			mode = validWeights ? 'arrange-split' : 'arrange-grid'
			names = weights.map((_, index) => `${validWeights ? 'split' : 'grid'}${index + 1}`)
			const sum = weights.reduce((total, value) => total + value, 0)
			const gapTotal = GAP * Math.max(0, weights.length - 1)
			let cursor = Number(body.x || 0)
			const synthetic = {}
			weights.forEach((weight, index) => {
				const width = Math.max(0.01, (Number(body.w || 0) - gapTotal) * weight / Math.max(0.01, sum))
				synthetic[names[index]] = { x: cursor, y: body.y, w: width, h: body.h, role: names[index] }
				cursor += width + GAP
			})
			effectiveRegions = { ...effectiveRegions, ...synthetic }
		}
	}
	if (!names.length) {
		return {
			contractVersion: 'authoring-excellence.visual-balance.v1',
			layoutIntent,
			mode,
			status: 'not-applicable',
			arrangementApplied: false,
			regions: {},
			note: 'This layout family is single-stage or compact; do not infer a split imbalance from its intentional negative space.',
		}
	}
	const occupancy = semanticRegionOccupancy(slide.objects || [], effectiveRegions, names, { exclusive: arrangementMode })
	const substantiveObjects = (slide.objects || []).filter(object => isSubstantiveLayoutObject(object) && !isMatchingBackingFrame(object, slide.objects || []))
	const supportingCaptionOnly = names.some(name => {
		const region = effectiveRegions[name]
		const objects = substantiveObjects.filter(object => regionIntersectionArea(object, region) > 0.08)
		return objects.length > 0 && objects.every(isSupportingCaptionObject)
	})
	const regions = Object.fromEntries(names.map(name => {
		const region = effectiveRegions[name] || {}
		const availableArea = Math.max(0, Number(region.w || 0) * Number(region.h || 0))
		const occupiedArea = Number(occupancy[name]?.area || 0)
		return [name, {
			availableArea: round(availableArea),
			occupiedArea: round(occupiedArea),
			density: round(occupiedArea / Math.max(0.01, availableArea)),
			blockCount: occupancy[name]?.blocks?.length || 0,
			blocks: occupancy[name]?.blocks || [],
		}]
	}))
	const densities = names.map(name => regions[name].density)
	const arrangementApplied = !arrangementMode || (slide.objects || [])
		.filter(object => isSubstantiveLayoutObject(object))
		.every(object => {
			const objectArea = Math.max(0.01, Number(object.rect?.w || 0) * Number(object.rect?.h || 0))
			const maxRegionArea = Math.max(...names.map(name => regionIntersectionArea(object, effectiveRegions[name])))
			return maxRegionArea / objectArea >= 0.8
		})
	// Keep zero-density regions in the ratio.  An empty semantic side is the
	// strongest possible skew and must not be hidden by filtering it out; the
	// status remains `underfilled` so the AI gets both the classification and the
	// measured magnitude of the problem.
	const low = densities.length ? Math.min(...densities) : 0
	const high = densities.length ? Math.max(...densities) : 0
	const densityRatio = round(high / Math.max(0.01, low))
	const totalBlocks = names.reduce((sum, name) => sum + regions[name].blockCount, 0)
	const occupiedRegions = names.filter(name => regions[name].occupiedArea >= 0.08).length
	const status = arrangementMode && !arrangementApplied
		? 'review'
		: occupiedRegions < names.length
		? 'underfilled'
		: supportingCaptionOnly
			? 'review'
		: densityRatio >= 3.5
			? 'imbalanced'
			: densityRatio >= 2
				? 'review'
				: 'balanced'
	return {
		contractVersion: 'authoring-excellence.visual-balance.v1',
		layoutIntent,
		mode,
		status,
		arrangementApplied,
		regions,
		densityRatio,
		occupiedRegionCount: occupiedRegions,
		totalRegionCount: names.length,
		totalSubstantiveBlocks: totalBlocks,
		correction: arrangementMode && !arrangementApplied
			? 'The requested semantic arrangement did not govern every substantive block; revise block roles/content or choose a compatible layoutIntent and rerun dryRun.'
			: status === 'balanced'
			? 'No semantic balance correction is indicated by the engine measurement.'
			: 'Change layoutIntent, arrange, region, or content meaning semantically and rerun dryRun; never copy engine rectangles into the spec.',
		note: 'Engine-measured occupied-area density is a proposal readback. Negative space is valid when the selected layout family is intentional; caption/label-only lanes are treated as supporting negative space; review this status together with warnings, story, and visual proof.',
	}
}

// Legacy/uploaded decks can carry an explicit textShape rectangle that is much
// taller than its actual copy.  Preserve that source geometry for faithful
// round-tripping, but make the quality problem visible to the authoring client
// so a governed semantic edit can reflow it.  New Director specs normally avoid
// this path because manual geometry is forbidden; `keep`/`decorative` are the
// explicit maintainer escape hatches for intentional quiet-space cards.
function addOverexpandedTextShapeWarning(warnings, slideId, block, object) {
	if (!block || !object || String(block.kind || '').toLowerCase() !== 'textshape') return
	if (!blockHasExplicitGeometry(block) || block.keep === true || block.decorative === true) return
	const rawText = blockText(block, { title: '', message: '' })
	const text = (Array.isArray(rawText)
		? rawText.map(run => typeof run === 'object' ? run?.text || '' : String(run || '')).join('')
		: String(rawText || '')).trim()
	const rect = object.rect || {}
	const width = Number(rect.w)
	const height = Number(rect.h)
	const chars = text.length
	if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2.2 || height < 3.0 || chars > 180) return
	const density = chars / Math.max(0.1, width * height)
	if (density > 18) return
	warnings.push({
		code: 'LAYOUT_TEXTSHAPE_OVEREXPANDED',
		severity: 'warning',
		slideId,
		blockName: block.name || block.objectName || null,
		message: 'Explicit textShape geometry is substantially larger than its short copy and may render as an empty or unbalanced card.',
		reason: 'Source geometry was preserved for round-trip fidelity, but the visible copy occupies only a small fraction of the card surface.',
		fix: 'Re-author the block through a semantic region/layoutIntent so the engine can compact and vertically balance the card; use keep:true only for intentional quiet space.',
		evidence: { kind: block.kind, textCharacters: chars, rect: { x: round(Number(rect.x)), y: round(Number(rect.y)), w: round(width), h: round(height) }, characterDensityPerSquareIn: round(density), thresholds: { minHeightIn: 3, maxTextCharacters: 180, maxCharacterDensityPerSquareIn: 18 } },
		suggestions: ['remove explicit geometry', 'choose a semantic region', { keep: true }],
	})
}

function expandTitleRegionForReadability({ spec, slide, slideIndex, regions }) {
	const visualHero = slide?.layoutIntent === 'hero' && (slide.content || []).some(block => HERO_VISUAL_KINDS.has(String(block?.kind || '').toLowerCase()))
	if (visualHero && regions?.title) {
		const pinnedCallout = (slide.content || []).find(block => block?.kind === 'callout' && ['leftThird', 'rightThird'].includes(blockNamedRegion(block)))
		const pinnedSide = blockNamedRegion(pinnedCallout)
		const safeLane = pinnedSide === 'leftThird' ? regions.rightTwoThirds : (pinnedSide === 'rightThird' ? regions.leftTwoThirds : null)
		regions.title = rect(safeLane?.x ?? regions.title.x, 0.42, safeLane?.w ?? regions.title.w, TITLE_H, 'title')
	}
	const hasTitleBandBlock = (slide.content || []).some(block => {
		const kind = String(block?.kind || '').toLowerCase()
		return kind === 'title' || kind === 'quote'
	})
	if (!hasTitleBandBlock) return
	const titleRegion = regions?.title
	const bodyRegion = regions?.body
	if (!titleRegion || !bodyRegion || !Number.isFinite(Number(titleRegion.w)) || !Number.isFinite(Number(bodyRegion.h))) return
	const titleBlock = (slide.content || []).find(block => readabilityRoleForBlock(block, slideIndex) === (slideIndex === 0 ? 'deckTitle' : 'slideTitle'))
	if (!titleBlock || blockHasExplicitGeometry(titleBlock)) return
	const style = effectiveBlockStyle(titleBlock)
	const role = readabilityRoleForBlock(titleBlock, slideIndex)
	const floorPt = Number(READABILITY_TYPE_FLOORS_PT[role])
	const authoredFont = Number(style.fontSize ?? titleBlock.fontSize)
	const fontSize = Number.isFinite(authoredFont) && authoredFont > 0 ? authoredFont : Math.max(floorPt, slide.layoutIntent === 'hero' ? 50 : 35)
	const margin = numericTextMargin(style.margin)
	const fit = estimateTextFit({ text: blockText(titleBlock, slide), rect: titleRegion, fontSize, minFontSize: fontSize, fontFace: style.fontFace || spec.theme?.headFontFace || artDirectionFor(spec)?.headFontFace || spec.theme?.bodyFontFace || spec.theme?.fontFace || 'Aptos Display', margin, charSpacing: style.charSpacing })
	const requiredHeight = fit.height + margin * 2
	if (requiredHeight <= titleRegion.h + 0.001) return
	const minimumBodyHeight = 0.8
	const maximumTitleHeight = visualHero
		? Math.max(titleRegion.h, Math.min(2.4, Number(regions.footer?.y || 7) - titleRegion.y - 1.2))
		: Math.max(titleRegion.h, titleRegion.h + Math.max(0, bodyRegion.h - minimumBodyHeight))
	const nextHeight = Math.min(requiredHeight, maximumTitleHeight)
	const delta = nextHeight - titleRegion.h
	if (!(delta > 0.001)) return
	const oldBodyY = bodyRegion.y
	titleRegion.h = round(nextHeight)
	for (const [name, region] of Object.entries(regions)) {
		if (name === 'title' || name === 'footer' || name === 'protectedFooter' || !region || !Number.isFinite(Number(region.y)) || region.y < oldBodyY - 0.01) continue
		region.y = round(region.y + delta)
		region.h = round(Math.max(0.1, region.h - delta))
	}
}

export function recommendSlideLayouts(spec, options = {}) {
	if (!spec || !Array.isArray(spec.slides)) return { slides: [], vocabulary: Array.from(INTENTS) }
	const slideSize = options.slideSize || WIDE_SLIDE
	const margin = artCompositionForSpec(spec).margin
	const slides = spec.slides.map((slide, slideIndex) => {
		const authoredIntent = normalizeLayoutIntent(slide.layoutIntent)
		const currentIntent = authoredIntent || 'title-body'
		const presenterZone = presenterZoneForSlide(slide)
		// This compatibility-named surface now reports geometry only for the
		// AI-selected intent. It does not score or recommend alternative compositions.
		// Missing/invalid intent uses title-body solely as a legacy execution fallback
		// and is explicitly non-certifying.
		const proposals = [{
			layoutIntent: currentIntent,
			status: 'selected-intent-factual-readback',
			selectionSource: authoredIntent ? 'ai-selected' : 'legacy-compatibility-fallback',
		}].map(candidate => {
			const out = { ...candidate }
			// Return semantic region/assignment readback for the selected intent so a
			// cold AI can inspect its mechanical consequence before committing.
		const regions = regionCatalog(candidate.layoutIntent, slideSize, null, margin, presenterZone, slide.arrange, {
			compactTitle: !contentUsesTitleBand(slide.content, candidate.layoutIntent),
			kickerHeader: contentHasKickerHeader(slide.content),
		})
			if (candidate.layoutIntent === 'two-column') {
				const bands = twoColumnSpanBands(slide.content, regions)
				regions.left = bands.left
				regions.right = bands.right
			}
			applyRegionPlan(regions, slide.regionPlan, [], slide.id, { allowAuthoredGeometry: isAiAuthoredGeometrySpec(spec) })
			expandTitleRegionForReadability({ spec, slide, slideIndex, regions })
			out.regions = Object.fromEntries(Object.entries(regions)
				.filter(([, v]) => v && typeof v === 'object' && Number.isFinite(Number(v.x)))
				.map(([k, v]) => [k, { x: round(v.x), y: round(v.y), w: round(v.w), h: round(v.h) }]))
			const probeContent = autoPlaceBlocks(
				(slide.content || []).filter(block => !isEngineScaffoldBlock(block)).map(block => ({ ...block })),
				slideSize,
				slide.arrange,
				candidate.layoutIntent,
				presenterZone,
				margin,
				null,
				null,
				regions,
			)
			const probe = { ...slide, layoutIntent: candidate.layoutIntent, content: probeContent }
			// Mirror compilation's scaffold policy in the feasibility readback so the AI
			// sees the same semantic surface it will actually get.  A legacy empty
			// stage/accent is not a body item and must not appear as a fake left or
			// right assignment in dryRun guidance.
			const assignmentRegionName = chosen => {
				const role = String(chosen?.role || '').trim()
				// Specialized engine slots are semantic readback labels rather than
				// entries in the top-level region catalog; preserve them verbatim.
				if (/^(metric-(?:card|value|label)|motion-(?:label|bar)|semantic-card)$/.test(role)) return role
				const chosenRect = chosen && [chosen.x, chosen.y, chosen.w, chosen.h].every(value => Number.isFinite(Number(value))) ? chosen : null
				if (!chosenRect) return role || 'body'
				const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
				const chosenArea = Math.max(0.01, chosenRect.w * chosenRect.h)
				const named = Object.entries(regions).filter(([, region]) => region && typeof region === 'object' && Number.isFinite(Number(region.x)))
				const exact = named.find(([, region]) => ['x', 'y', 'w', 'h'].every(key => Math.abs(Number(region[key]) - Number(chosenRect[key])) < 0.002))
				if (exact) return exact[0]
				const containing = named
					.map(([name, region]) => [name, overlap(chosenRect, region) / chosenArea, Number(region.w || 0) * Number(region.h || 0)])
					.sort((a, b) => b[1] - a[1] || a[2] - b[2])
				if (containing[0]?.[1] >= 0.5) return containing[0][0]
				return role || 'body'
			}
			const assignmentRects = {}
			const readbackRect = value => value && ['x', 'y', 'w', 'h'].every(key => Number.isFinite(Number(value[key])))
				? { x: round(Number(value.x)), y: round(Number(value.y)), w: round(Number(value.w)), h: round(Number(value.h)) }
				: null
			out.assignment = Object.fromEntries((probe.content || []).filter(block => !isEngineScaffoldBlock(block)).map((block, blockIndex) => {
				const name = block?.name || `block-${blockIndex + 1}`
				if (blockNamedRegion(block)) {
					const semanticRegion = blockNamedRegion(block)
					const namedRect = readbackRect(regions[semanticRegion])
					if (namedRect) assignmentRects[name] = namedRect
					return [name, semanticRegion]
				}
				if (explicitGeometryOf(block)) return [name, 'explicit-rect']
				const chosen = chooseRegion(block, probe, regions, blockIndex)
				const chosenRect = readbackRect(chosen)
				if (chosenRect) assignmentRects[name] = chosenRect
				return [name, assignmentRegionName(chosen)]
			}))
			// A specialized slot such as metric-card or motion-bar is an intentional
			// semantic label, but it still needs a numeric engine readback before the
			// AI selects the proposal.  Keep that rectangle in a separate map so the
			// named top-level regions remain stable and no authored geometry path is
			// implied.
			out.assignmentRects = assignmentRects
			return out
		})
		return {
			slideId: slide.id || `slide-${slideIndex + 1}`,
			slideIndex,
			current: currentIntent,
			selectionStatus: authoredIntent ? 'ai-selected' : 'legacy-compatibility-fallback',
			certificationEligible: !!authoredIntent,
			proposals,
			confidence: 'factual-geometry-readback',
			unranked: true,
		}
	})
	return {
		slides,
		vocabulary: Array.from(INTENTS),
		contractVersion: 'authoring-excellence.layout-feasibility.v1',
		selectionAuthority: 'ai',
		unranked: true,
		confirmVia: 'Choose slides[].layoutIntent with AI design judgment for semantic mode. The engine returns factual regions and assignments only for that selected intent. Use content[].region only when a semantic named region is needed, and use slides[].arrange or regionPlan split weights for balance. For exact composition, select ai-authored-geometry-v1 and author finite slide-inch rectangles; the engine validates and serializes them without creative movement.',
	}
}

export function planDeckLayout(spec, options = {}) {
	if (!spec || spec.schemaVersion !== SCHEMA_VERSION) throw new Error(`Expected ${SCHEMA_VERSION}.`)
	spec = promoteColumnHeadlines(spec)
	// Direct planner callers must receive the same representation guarantee as
	// the full compiler: aliases are normalized before semantic placement and an
	// unsupported explicit kind cannot silently become a text object.
	spec = normalizeContentKindsInSpec(spec).spec
	const slideSize = options.slideSize || WIDE_SLIDE
	const templateContract = options.templateContract || null
	const preserveSourceGeometry = options.preserveSourceGeometry === true
	const preserveAuthoredPrecision = options.preserveAuthoredPrecision === true || preserveSourceGeometry
	// M12 precedence: when a brand template (.potx master) is applied, the engine must NOT
	// paint its own canvas over the master — an explicit slide.background still wins, but
	// otherwise we leave the background null so the brand master shows through.
	const t = spec.template
	const hasTemplateMaster = !!(t && typeof t === 'object' && (t.handle || t.templateHandle || t.path || t.templatePath || t.url || t.link || t.data))
	const warnings = []
	const handles = new Set()
	const theme = palette(spec)
	const textColorRoles = textColorRolesForSpec(spec)
	const nominalSplitSpan = slideSize.w - DEFAULT_MARGIN * 2 - GAP
	const slides = (spec.slides || []).map((rawSlide, slideIndex) => {
		// layoutIntent is fail-soft: missing -> default, unknown -> warn + fall back,
		// and we always surface the full supported vocabulary so an AI client can
		// self-correct without having to trigger a hard compile error first.
		const requestedLayoutIntent = String(rawSlide.layoutIntent || '').trim()
		const normalizedLayoutIntent = normalizeLayoutIntent(requestedLayoutIntent)
		const layoutIntent = normalizedLayoutIntent || 'title-body'
		const asymmetricProofAlias = normalizedLayoutIntent === 'comparison' && requestedLayoutIntent !== 'comparison'
		const resolvedArrange = rawSlide.arrange || (asymmetricProofAlias ? { split: [1, 2] } : null)
		if (normalizedLayoutIntent && requestedLayoutIntent && normalizedLayoutIntent !== requestedLayoutIntent) {
			warnings.push({
				code: 'LAYOUT_INTENT_ALIAS_NORMALIZED',
				severity: 'info',
				slideId: rawSlide.id,
				message: `layoutIntent "${requestedLayoutIntent}" was normalized to the governed "${normalizedLayoutIntent}" contract.`,
				reason: 'A documented compatibility alias was resolved before semantic layout, so the engine could preserve the requested proof/explanation relationship.',
				fix: `Use the canonical layoutIntent "${normalizedLayoutIntent}" in a future spec; no coordinates are needed.`,
				evidence: { requested: requestedLayoutIntent, resolved: normalizedLayoutIntent, alias: true },
			})
		}
		// A selected editorial split is a semantic contract: if the spec omits the
		// proof kind that owns one side, silently leaving that side hollow makes the
		// AI believe the layout succeeded when the slide will read unbalanced. Keep
		// the AI in charge (do not silently change its intent), but surface an
		// actionable finding with the observed content kinds and safe alternatives.
		const contentShape = slideContentShape(rawSlide)
		const contract = LAYOUT_INTENT_CONTRACTS[layoutIntent]
		const intentRequirement = contract?.requiredProof
			? {
				present: contract.requiredProof === 'image/image-feature' ? contentShape.images > 0
					: contract.requiredProof === 'chart/chart-panel' ? contentShape.charts > 0
					: contract.requiredProof === 'stat/kpi' ? contentShape.kpis > 0
					: true,
				kind: contract.requiredProof,
				fallback: contract.fallback,
			}
			: null
		if (intentRequirement && !intentRequirement.present) {
			warnings.push({
				code: 'LAYOUT_INTENT_CONTENT_MISMATCH',
				severity: 'warning',
				slideId: rawSlide.id,
				message: `layoutIntent "${layoutIntent}" expects ${intentRequirement.kind} content, but none was supplied; one semantic region may remain underfilled.`,
				reason: 'The selected split reserves a proof region that the current semantic content cannot occupy.',
				fix: `Add a ${intentRequirement.kind} block or choose a compatible layoutIntent before commit.`,
				evidence: { layoutIntent, contentKinds: contentShape.content.map(block => String(block?.kind || 'unknown')), expected: intentRequirement.kind },
				suggestions: intentRequirement.fallback,
			})
		}
		if (requestedLayoutIntent && !normalizedLayoutIntent) {
			warnings.push({
				code: 'UNKNOWN_LAYOUT_INTENT',
				severity: 'warning',
				slideId: rawSlide.id,
				message: `Unsupported layoutIntent "${requestedLayoutIntent}"; using "title-body".`,
				reason: 'The requested layout intent is not in the engine vocabulary, so the compiler cannot apply its semantic proof/explanation contract.',
				fix: 'Choose a supported semantic layoutIntent for classification and also provide exact AI-authored coordinates for every object.',
				evidence: { received: requestedLayoutIntent, fallback: 'title-body', supported: Array.from(INTENTS), aliases: AUTHORING_LAYOUT_INTENT_ALIASES },
				suggestions: Array.from(INTENTS),
			})
		} else if (!requestedLayoutIntent) {
			warnings.push({
				code: 'LAYOUT_INTENT_DEFAULTED',
				severity: 'info',
				slideId: rawSlide.id,
				message: 'No layoutIntent provided; using "title-body".',
				reason: 'No semantic composition relationship was supplied, so the engine selected its conservative title/body default.',
				fix: 'Choose a semantic layoutIntent to describe the proof/comparison/data relationship without delegating geometry.',
				evidence: { received: null, fallback: 'title-body', supported: Array.from(INTENTS) },
				suggestions: Array.from(INTENTS),
			})
		}
		if (rawSlide.arrange && typeof rawSlide.arrange === 'object' && rawSlide.arrange.cols !== undefined) {
			const requestedCols = Number(rawSlide.arrange.cols)
			if (!Number.isInteger(requestedCols) || requestedCols < 2 || requestedCols > 4) {
				warnings.push({
					code: 'ARRANGE_COLS_OUT_OF_RANGE',
					severity: 'warning',
					slideId: rawSlide.id,
					message: 'Semantic arrange.cols must be an integer from 2 through 4; using the default engine arrangement.',
					reason: 'The requested column count is outside the public semantic arrangement grammar.',
					fix: 'Use arrange.cols 2, 3, or 4, or choose arrange:"stack"; never author the resulting column rectangles.',
					evidence: { received: rawSlide.arrange.cols, allowed: { minimum: 2, maximum: 4, integer: true }, fallback: 'engine-default' },
					received: rawSlide.arrange.cols,
					suggestions: [{ cols: 2 }, { cols: 3 }, { cols: 4 }, 'stack'],
				})
			}
		}
		if (rawSlide.arrange && typeof rawSlide.arrange === 'object' && rawSlide.arrange.split !== undefined) {
			const split = rawSlide.arrange.split
			const validSplit = Array.isArray(split) && splitRatiosAreSafe(split, nominalSplitSpan)
			if (!validSplit) {
				warnings.push({
					code: 'ARRANGE_SPLIT_INVALID',
					severity: 'warning',
					slideId: rawSlide.id,
					message: 'Semantic arrange.split must contain at least two finite positive weights that resolve to usable lanes; using the default engine arrangement.',
					reason: 'The requested weighted split has invalid numeric stability, overflow, or a lane smaller than the engine minimum.',
					fix: 'Use arrange.split with finite positive numbers such as [62, 38] whose lanes remain at least 0.01in, or choose arrange.cols/"stack"; never author column rectangles.',
					evidence: { received: split, rule: 'array of at least two finite positive weights with finite sum and usable lane widths', minimumLaneIn: 0.01, fallback: 'engine-default' },
					received: split,
					suggestions: [{ split: [62, 38] }, { cols: 2 }, 'stack'],
				})
			}
		}
		const sourceContent = Array.isArray(rawSlide.content) ? rawSlide.content : []
		const content = sourceContent.map(block => {
			const rawRegion = typeof block?.region === 'string' ? block.region.trim() : ''
			const normalizedRegion = normalizeRegionName(rawRegion)
			if (rawRegion && normalizedRegion && rawRegion !== normalizedRegion) {
				warnings.push({
					code: 'REGION_ALIAS_NORMALIZED',
					severity: 'info',
					slideId: rawSlide.id,
					blockName: block?.name || block?.objectName || null,
					message: `content[].region "${rawRegion}" was normalized to the governed "${normalizedRegion}" region.`,
					reason: 'A documented compatibility alias was resolved before semantic placement, so the engine retained the requested region relationship.',
					fix: `Use the canonical region name "${normalizedRegion}" in a future spec; do not author coordinates.`,
					evidence: { requested: rawRegion, resolved: normalizedRegion, alias: true },
				})
			}
			return normalizedRegion ? { ...block, region: normalizedRegion } : block
		})
		const slide = { ...rawSlide, layoutIntent, content, ...(resolvedArrange ? { arrange: resolvedArrange } : {}) }
		const composition = artCompositionForSpec(spec)
		const typeEmphasis = artTypeEmphasisForSpec(spec)
		const depth = artDepthForSpec(spec)
		const motion = artMotionForSpec(spec)
		const stage3d = artStageForSpec(spec)
		const iconTemperament = artIconForSpec(spec)
		const imageTreatment = artImageTreatmentForSpec(spec)
		const mediaMotion = artMediaMotionForSpec(spec)
		const presenterZone = presenterZoneForSlide(rawSlide)
		const regions = regionCatalog(layoutIntent, slideSize, templateContract, composition.margin, presenterZone, slide.arrange, {
			compactTitle: !contentUsesTitleBand(content, layoutIntent),
			kickerHeader: contentHasKickerHeader(content),
		})
		if (layoutIntent === 'two-column') {
			const bands = twoColumnSpanBands(content, regions)
			regions.left = bands.left
			regions.right = bands.right
		}
		applyRegionPlan(regions, rawSlide.regionPlan, warnings, rawSlide.id, { allowAuthoredGeometry: isAiAuthoredGeometrySpec(spec) })
		expandTitleRegionForReadability({ spec, slide, slideIndex, regions })
		const visual = slideVisualSystem(spec, slide, slideIndex, slideSize, theme, options)
		const explicitSlideDesign = wantsExplicitSlideDesign(spec, slide)
		// Engine decorative scaffold is fully DEACTIVATED. The json-spec is the sole
		// source of composition: the AI client authors its own visual system (shapes,
		// accents, backgrounds, panels) through spec content. No engine-injected skin,
		// no opt-in. (The previous forced/opt-in scaffold is intentionally bypassed.)
		const autoScaffold = false
		const objects = []
		if (autoScaffold) {
			for (const object of visual.objects) {
				if (handles.has(object.editHandle)) warnings.push({
					code: 'DUPLICATE_HANDLE',
					severity: 'error',
					slideId: slide.id,
					objectName: object.objectName,
					message: 'Duplicate edit handle.',
					reason: 'Two engine-generated objects resolve to the same edit identity, so later edits or cue targets would be ambiguous.',
					fix: 'Use a unique semantic content name or remove the duplicate visual treatment, then rerun dryRun.',
					evidence: { editHandle: object.editHandle, objectName: object.objectName, uniquenessScope: 'deck' },
				})
				handles.add(object.editHandle)
				objects.push(object)
			}
		}
		const contentForLayout = content.filter(block => !isEngineScaffoldBlock(block))
		if (layoutIntent === 'sidebar-left' || layoutIntent === 'sidebar-right') {
			const nonTitle = contentForLayout.filter(block => block.kind !== 'title' && block.kind !== 'section-divider' && !isFooterBlock(block))
			const railBlocks = nonTitle.filter(block => block.region === 'sidebar' || block.role === 'sidebar' || RAIL_KINDS.has(block.kind))
			const mainBlocks = nonTitle.filter(block => !railBlocks.includes(block))
			for (const [lane, blocks, region] of [['sidebar', railBlocks, regions.sidebar], ['main', mainBlocks, regions.main]]) {
				if (!region || !blocks.length) continue
				const resolvedLaneHeight = (region.h - GAP * Math.max(0, blocks.length - 1)) / blocks.length
				if (resolvedLaneHeight < MIN_STACK_H) warnings.push({
					code: 'ARRANGE_SIDEBAR_TOO_DENSE',
					severity: 'warning',
					slideId: slide.id,
					message: `Semantic ${lane} sidebar lane is too dense; using a bounded engine grid inside the lane.`,
					reason: 'The requested sidebar composition would place one or more semantic blocks below the slide canvas.',
					fix: 'Reduce substantive blocks, split the story across slides, or revise the AI-authored frames.',
					evidence: { layoutIntent, lane, blockCount: blocks.length, availableHeightIn: Number(region.h.toFixed(3)), gapIn: GAP, resolvedLaneHeightIn: Number(resolvedLaneHeight.toFixed(3)), minimumLaneHeightIn: MIN_STACK_H, fallback: 'lane-grid' },
					suggestions: [{ layoutIntent: 'two-column' }, { layoutIntent: 'title-body' }, 'split across slides'],
				})
			}
		}
		for (const block of contentForLayout) {
			if (String(block?.kind || '').toLowerCase() !== 'shape' || hasSemanticShapeTreatment(block)) continue
			warnings.push({
				code: 'EMPTY_GEOMETRY_SHAPE',
				severity: 'warning',
				slideId: slide.id,
				blockName: block.name || block.objectName || null,
				message: 'Geometry-only shape has no semantic visual treatment and may render as an empty panel.',
				reason: 'The shape supplies geometry but no fill, line, effect, visual intent, or explicit decorative/keep policy.',
				fix: 'Add semantic style/visualIntent, mark an intentional decorative shape explicitly, or remove the shape before commit.',
				evidence: { kind: block.kind, name: block.name || block.objectName || null, styleKeys: Object.keys(block.style || {}), optionsKeys: Object.keys(block.options || {}) },
				suggestions: [{ decorative: true }, { keep: true }, { style: { fill: 'theme-panel', line: 'theme-accent' } }],
			})
		}
		// No forced auto-title injection: the AI client composes titles explicitly
		// via spec content (a textBox/title block) so nothing is templated onto the
		// slide that the author did not ask for. slide.title remains deck metadata.
		const effectiveContent = autoPlaceBlocks(contentForLayout, slideSize, slide.arrange, layoutIntent, presenterZone, composition.margin, warnings, slide.id, regions)
		const namedRegionRects = namedRegionStackRects(effectiveContent, regions)
		for (let i = 0; i < effectiveContent.length; i += 1) {
			const blockTheme = { ...theme, ...visual.theme, textColorRoles, art: visual.art, composition, typeEmphasis, depth, motion, stage3d, iconTemperament, imageTreatment, mediaMotion, headFontFace: spec.theme?.headFontFace || visual.headFontFace, bodyFontFace: spec.theme?.bodyFontFace || visual.bodyFontFace }
			const blockObjects = planBlock({ spec, slide, slideIndex, block: effectiveContent[i], blockIndex: i, regions, regionRect: stackRectFor(namedRegionRects, effectiveContent[i]), theme: blockTheme, warnings, handles, templateContract, preserveSourceGeometry, preserveAuthoredPrecision })
			objects.push(...blockObjects)
			for (const object of blockObjects) addOverexpandedTextShapeWarning(warnings, slide.id, effectiveContent[i], object)
		}
		addUnderfilledRegionWarning(warnings, slide.id, layoutIntent, regions, objects, contract)
		addBalanceImbalanceWarning(warnings, slide.id, layoutIntent, regions, objects, contract)
		return {
			slideId: slide.id,
			slideIndex,
			title: slide.title,
			role: slide.role,
			message: slide.message,
			layoutIntent: slide.layoutIntent,
			htmlCanvas: slide.htmlCanvas === true,
			placeholderBinding: regions.placeholderBinding,
			background: normalizeBackground(slide.background) || ((preserveSourceGeometry || hasTemplateMaster) ? null : visual.background),
			visualSystem: { tone: visual.tone, explicit: explicitSlideDesign, scaffold: autoScaffold },
			regions,
			objects,
			visualBalance: visualBalanceReadback({ layoutIntent, arrange: slide.arrange, regions, objects }),
			notes: slide.notes || '',
			transition: slide.transition || null,
		}
	})
	// Morph-by-object pairing. PowerPoint interpolates shapes that share a NAME
	// across the two slides of a Morph. Per-slide objectNames are slide-prefixed
	// (unique), which prevents pairing, so when adjacent slides share a block base
	// name and the later slide uses morph byObject, expose a shared morphName the
	// compiler emits as the shape name. Edit handles stay slide-unique.
	const baseOf = (slideId, name) => (typeof name === 'string' && name.startsWith(`${slideId}.`) ? name.slice(slideId.length + 1) : name)
	for (let i = 1; i < slides.length; i += 1) {
		const cur = slides[i]
		const prev = slides[i - 1]
		const prevByBase = new Map()
		for (const o of prev.objects) {
			const b = baseOf(prev.slideId, o.objectName)
			if (b && !prevByBase.has(b)) prevByBase.set(b, o)
		}
		// Cinematic by default: if the author didn't set a transition and this slide
		// shares object names with the previous one, default to Morph-by-object.
		// Explicit transition (including {type:"none"}) always wins.
		if (cur.transition == null && cur.objects.some(o => {
			const b = baseOf(cur.slideId, o.objectName)
			// b is "<blockName>.<role>"; skip when the blockName is purely structural
			// (title/rule/brand/etc.) so recurring chrome doesn't auto-trigger a Morph.
			return b && prevByBase.has(b) && !STRUCTURAL_MORPH_SKIP.has(String(b).split('.')[0].toLowerCase())
		})) {
			cur.transition = { type: 'morph', option: 'byObject' }
		}
		const tr = cur.transition
		const isMorphByObject = tr && String(tr.type || '').toLowerCase() === 'morph' && /obj/i.test(String(tr.option || tr.morphOption || 'byObject'))
		if (!isMorphByObject) continue
		let paired = 0
		for (const o of cur.objects) {
			const b = baseOf(cur.slideId, o.objectName)
			if (b && prevByBase.has(b)) {
				// Rename both shapes to the shared bare base so the plan, the
				// committed objects, and the emitted PPTX shape name all agree and
				// PowerPoint pairs them. Edit handles remain slide-unique.
				o.objectName = b
				o.morphName = b
				const prevObj = prevByBase.get(b)
				prevObj.objectName = b
				prevObj.morphName = b
				paired += 1
			}
		}
		if (paired === 0) {
			warnings.push({
				code: 'MORPH_NO_PAIRED_OBJECTS',
				severity: 'warning',
				slideId: cur.slideId,
				message: 'Morph by object is set but no object on the previous slide shares a base name to morph from. Reuse the same content "name" on both slides (or duplicate the slide) so objects interpolate instead of cross-fading.',
				reason: 'Morph-by-object can only interpolate semantic objects that retain the same content name across adjacent slides.',
				fix: 'Reuse the same content[].name on both slides for the intended pair, or choose an explicit non-Morph transition and rerun dryRun.',
				evidence: { previousSlideId: prev.slideId, currentSlideId: cur.slideId, pairedObjects: 0, transition: tr },
			})
		}
	}
	return {
		schemaVersion: spec.schemaVersion,
		layoutEngineVersion: LAYOUT_ENGINE_VERSION,
		slideSize: { w: slideSize.w, h: slideSize.h },
		placeholderPolicy: templateContract?.placeholders?.length ? 'contract-aware-with-geometry-fallback' : 'geometry-matched-fallback',
		slides,
		warnings: collapseFaithfulHtmlReadabilityWarnings(spec, warnings),
	}
}

function collapseFaithfulHtmlReadabilityWarnings(spec, warnings = []) {
	if (readabilityPolicyForSpec(spec) !== 'faithful-html') return warnings
	const small = warnings.filter(item => item?.code === 'SMALL_TEXT_READABILITY_RISK')
	if (!small.length) return warnings
	return [
		...warnings.filter(item => item?.code !== 'SMALL_TEXT_READABILITY_RISK'),
		{
			code: 'FAITHFUL_HTML_READABILITY_POLICY',
			severity: 'info',
			message: `${small.length} text object${small.length === 1 ? '' : 's'} are below the 16pt projection floor. Designed sizes were preserved because validation.readabilityPolicy is faithful-html.`,
			reason: 'A faithful HTML port keeps authored microcopy instead of silently enlarging text.',
			fix: 'Keep the designed sizes, or set validation.readabilityPolicy to projection if this deck must warn at the 16pt body floor.',
			evidence: { count: small.length, policy: 'faithful-html', typeFloorsPt: { ...READABILITY_TYPE_FLOORS_PT } },
		},
	]
}

function intersects(a, b, tolerance = 0.03) {
	const ax2 = a.x + a.w
	const ay2 = a.y + a.h
	const bx2 = b.x + b.w
	const by2 = b.y + b.h
	const xOverlap = Math.min(ax2, bx2) - Math.max(a.x, b.x)
	const yOverlap = Math.min(ay2, by2) - Math.max(a.y, b.y)
	return xOverlap > tolerance && yOverlap > tolerance
}

// Spatial overlap is a fact for the authoring AI to reason about, not a design
// decision for the compiler to make.  Keep this contract intentionally
// one-way: the engine measures and reports the relationship, then compiles the
// AI-authored geometry/layering/timing exactly as selected.  Structural input
// faults (missing identities, duplicate identities, malformed geometry, etc.)
// remain separate validation errors.
export const SPATIAL_CONFLICT_POLICY = 'report-only'

export function validateLayoutPlan(plan, options = {}) {
	const issues = []
	const slideSize = plan.slideSize || WIDE_SLIDE
	const allowOffSlide = options.allowOffSlide === true || options.preserveSourceGeometry === true
	const aiAuthoredGeometry = options.aiAuthoredGeometry === true
	const spatialConflictPolicy = options.spatialConflictPolicy || SPATIAL_CONFLICT_POLICY
	if (spatialConflictPolicy !== SPATIAL_CONFLICT_POLICY) throw new Error(`Unsupported spatialConflictPolicy: ${spatialConflictPolicy}. The engine only exposes the AI-authoring report-only contract.`)
	const plannedOverflowKeys = new Set((plan.warnings || [])
		.filter(item => item?.code === 'TEXT_OVERFLOW_RISK')
		.map(item => `${item.slideId || ''}|${item.objectName || ''}`))
	for (const slide of plan.slides || []) {
		const seen = new Set()
		for (const object of slide.objects || []) {
			if (!object.objectName) issues.push({ code: 'MISSING_OBJECT_NAME', severity: 'error', slideId: slide.slideId, reason: 'The layout object has no stable semantic handle, so later edits and timing cues cannot target its meaning.', fix: 'Add a concise unique objectName/editHandle derived from content meaning, then rerun the semantic layout pass.', evidence: { slideId: slide.slideId, objectName: null } })
			if (seen.has(object.objectName)) issues.push({ code: 'DUPLICATE_OBJECT_NAME', severity: 'error', slideId: slide.slideId, objectName: object.objectName, reason: 'Two objects on the same slide share a semantic handle, making edits and cues ambiguous.', fix: 'Give each semantic object a unique objectName/editHandle or remove the duplicate, then rerun the semantic layout pass.', evidence: { slideId: slide.slideId, objectName: object.objectName } })
			seen.add(object.objectName)
			const r = object.rect || {}
			const offSlide = r.x < -0.001 || r.y < -0.001 || r.x + r.w > slideSize.w + 0.001 || r.y + r.h > slideSize.h + 0.001
			if (offSlide) {
				// D8: intentional decorative bleed (object.bleed) is allowed — warn, don't block.
				const tolerated = allowOffSlide || object.bleed === true || slide.htmlCanvas === true
				issues.push({ ...offSlideFinding({ slideId: slide.slideId, object, rect: r, slideSize, tolerated, allowOffSlide, aiAuthoredGeometry }), rect: r })
			}
			if (object.fit?.overflow && !plannedOverflowKeys.has(`${slide.slideId}|${object.objectName || ''}`)) issues.push(textOverflowFinding({ slideId: slide.slideId, objectName: object.objectName, fit: object.fit, rect: r, text: object.text }))
		}
		// M7 design advisory: pairing a 3D model with Text3D on the same slide competes for
		// attention (blueprint design canon: pair 3D models with FLAT text). Non-blocking.
		const slideObjs = slide.objects || []
		const hasModel3d = slideObjs.some(o => o.primitive === 'model3d' || o.blockKind === 'model3d')
		const text3dObj = slideObjs.find(o => o.style?.text3D || o.options?.text3D)
		if (hasModel3d && text3dObj) {
			issues.push({ code: 'TEXT3D_WITH_MODEL3D', severity: 'warning', slideId: slide.slideId, objectName: text3dObj.objectName, message: 'Avoid mixing Text3D with a 3D model on one slide — pair the 3D model with flat text so they do not compete.', reason: 'A 3D model and Text3D compete for the same visual focus in one composition.', fix: 'Keep the model and pair it with flat semantic text, or choose a separate slide/transition for the Text3D treatment.', evidence: { slideId: slide.slideId, model3dPresent: true, text3dObjectName: text3dObj.objectName } })
		}
		const objects = slide.htmlCanvas === true
			? []
			: slideObjs.filter(o => !['background', 'decorative'].includes(o.role) && o.bleed !== true && !NONVISUAL_PRIMITIVES.has(o.primitive))
		// A metric card is an intentional semantic composite: its value and label
		// are placed inside the card surface.  This narrow exemption preserves the
		// blocking text/visual collision gate for all unrelated objects while
		// allowing the engine to author a legible card family.
		const metricCardOverlayPair = (a, b) => {
			const parse = value => {
				const name = String(value?.objectName || '').toLowerCase()
				const card = name.match(/(?:^|[.])metric-(\d+)\.shape$/)
				if (card) return { index: Number(card[1]), role: 'card' }
				const slot = name.match(/(?:^|[.])metric-(\d+)-(value|label)\.text$/)
				return slot ? { index: Number(slot[1]), role: slot[2] } : null
			}
			const left = parse(a)
			const right = parse(b)
			return Boolean(left && right && left.index === right.index && (left.role === 'card' || right.role === 'card'))
		}
		// World depth may add a backing frame behind the matching image/video. The
		// frame intentionally occupies the same semantic host rectangle; only exempt
		// the same-block pair, so unrelated visual overlays remain visible to the lint.
		const backingVisualPair = (a, b) => {
			const isBacking = role => role === 'image-frame' || role === 'media-frame'
			const identity = object => {
				if (object?.blockName) return String(object.blockName)
				const name = String(object?.objectName || '')
				return name.replace(/\.(?:image-frame|media-frame|image|media)$/i, '')
			}
			return Boolean(
				(identity(a) && identity(a) === identity(b) && isBacking(a.role) && ((a.role === 'image-frame' && b.role === 'image') || (a.role === 'media-frame' && b.role === 'media'))) ||
				(identity(a) && identity(a) === identity(b) && isBacking(b.role) && ((b.role === 'image-frame' && a.role === 'image') || (b.role === 'media-frame' && a.role === 'media')))
			)
		}
		for (let i = 0; i < objects.length; i += 1) {
			for (let j = i + 1; j < objects.length; j += 1) {
				// A native annotation is intentionally layered over its generated raster
				// source. Do not report that authored overlay as an accidental collision;
				// label-to-label and arrow-to-label collisions remain linted normally.
				const isAnnotation = object => object?.role === 'native-annotation-label' || object?.role === 'native-annotation-arrow'
				const isAnnotationHost = object => object?.primitive === 'image' || object?.role === 'image-frame' || object?.role === 'media-frame'
				const sameAnnotationHost = (annotation, host) => !annotation?.blockName || !host?.blockName || String(annotation.blockName) === String(host.blockName)
				const annotationRasterPair = isAnnotation(objects[i]) && isAnnotationHost(objects[j]) && sameAnnotationHost(objects[i], objects[j])
					|| isAnnotation(objects[j]) && isAnnotationHost(objects[i]) && sameAnnotationHost(objects[j], objects[i])
				if (annotationRasterPair) continue
				if (metricCardOverlayPair(objects[i], objects[j])) continue
				if (backingVisualPair(objects[i], objects[j])) continue
				if (intersects(objects[i].rect, objects[j].rect)) {
					const left = objects[i]
					const right = objects[j]
					const textPrimitive = TEXT_PRIMITIVES.has(left.primitive) || TEXT_PRIMITIVES.has(right.primitive)
					const visualPrimitive = VISUAL_PRIMITIVES.has(left.primitive) || VISUAL_PRIMITIVES.has(right.primitive)
					const overlapWidth = Math.max(0, Math.min(left.rect.x + left.rect.w, right.rect.x + right.rect.w) - Math.max(left.rect.x, right.rect.x))
					const overlapHeight = Math.max(0, Math.min(left.rect.y + left.rect.h, right.rect.y + right.rect.h) - Math.max(left.rect.y, right.rect.y))
					const overlapArea = overlapWidth * overlapHeight
					const smallerArea = Math.max(0.01, Math.min(left.rect.w * left.rect.h, right.rect.w * right.rect.h))
					issues.push({
						code: 'OBJECT_OVERLAP',
						// The engine has no creative spatial policy.  Text/visual and
						// visual/visual overlap are both measured facts; the AI decides
						// whether the relation is intentional, should be layered, or
						// should be revised.  Never block or auto-repair it here.
						severity: 'warning',
						slideId: slide.slideId,
						objects: [left.objectName, right.objectName],
						reason: 'Measured spatial overlap between two authored objects. The engine does not infer whether the relationship is intentional or undesirable.',
						fix: 'AI authoring must choose the spatial policy: keep the overlap, change layer/depth, move or resize an object, change timing/visibility, or revise the composition. The engine will not choose or apply that decision.',
						evidence: {
							objects: [left.objectName, right.objectName],
							primitives: [left.primitive, right.primitive],
							overlapArea: round(overlapArea),
							overlapFractionOfSmaller: round(overlapArea / smallerArea),
							textVisualCollision: textPrimitive && visualPrimitive,
							measurementSpace: 'slide-inches',
							spatialConflictPolicy,
							authoringAuthority: 'ai',
							engineAction: 'report-only',
						},
					})
				}
			}
		}
	}
	return { ok: !issues.some(issue => issue.severity === 'error'), spatialConflictPolicy, issues }
}

export function deterministicPlanDigest(plan) {
	const stable = canonicalStringify(plan)
	return crypto.createHash('sha256').update(stable).digest('hex')
}

function canonicalStringify(value) {
	if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`
	if (value && typeof value === 'object') {
		return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(',')}}`
	}
	return JSON.stringify(value)
}
