import {motionAuthoringGuidance,motionCandidateComparisons} from './motion-authoring-guidance.mjs'
// Public, black-box projection of the complete existing-capability catalog.
// This is intentionally derived from the same capability ledger used by the
// private MVP inventory, but exposes only semantic labels, opaque catalog IDs,
// executable public values, and public composition routes.

import crypto from 'node:crypto'

import { AUTHORING_CAPABILITY_REGISTRY } from './authoring-capability-registry.mjs'
import { TOOLS, TOOL_NAMES } from './tools.mjs'
import { PUBLIC_SPEC_FIRST_TOOLS } from './blackbox.mjs'
import { buildCapabilityLedger, ledgerSemanticHash } from '../dist/node/pptx-mcp/capability-ledger.js'
import { NATIVE_STYLE_PRESETS } from './native-style-presets.mjs'
import { publicNativeEffectPresets } from './native-effect-presets.mjs'
import { publicPictureStylePresets } from './picture-style-presets.mjs'
import { publicModel3dViewPresets } from './model3d-view-presets.mjs'
import { publicSourceApiGalleryPresets } from './source-api-gallery-presets.mjs'
import { publicAuthoringMotionCatalog } from './ir/authoring-motion-catalog.mjs'
import { evaluateMotionCatalog, validateMotionRequirements } from './motion-catalog-requirements.mjs'
import { publicMotionSourceReviews } from './motion-source-authoring-reviews.mjs'
import {evaluateMotionWindowCatalog} from './motion-source-movement-timeline.mjs'
import { AUTHORING_LAYOUT_INTENTS, LAYOUT_INTENT_CONTRACTS, listArtDirections } from './ir/layout-engine.mjs'
import { applyCatalogTruth } from './capability-truth.mjs'
import {
  HEADER_VISIBILITY_ROW_ID,
  LAYOUT_GRAPHIC_PLACEHOLDER_ROWS,
  LAYOUT_PLACEHOLDER_VARIANT_ROWS,
  SLIDE_NUMBER_FIELD_ROW_ID,
} from './layout-placeholder-variants-contract.mjs'
import { LAYOUT_THEME_MASTER_INHERITANCE_ROWS } from './layout-theme-master-inheritance-contract.mjs'
import { SHOW_MASTER_SHAPES_ROW_ID } from './layout-graphic-placeholder-visibility-contract.mjs'
import { TEXT_AUTHORING_ENTRY_ROWS } from './text-authoring-entry-contract.mjs'
import { masterPresetIdForCatalogEntry } from './master-preset-contract.mjs'
import { themePresetIdForCatalogEntry } from './theme-preset-contract.mjs'
import { INTERACTIVE_NAVIGATION_ROWS } from './interactive-navigation-entry-contract.mjs'
import { SECTION_SUMMARY_ZOOM_ROWS } from './section-summary-zoom-entry-contract.mjs'
import { LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_ROW_ID } from './layout-theme-master-family-aggregate-contract.mjs'
import { ADD_SLIDE_ENTRY_ROW_ID } from './add-slide-entry-contract.mjs'
import { HYPERLINK_ENTRY_ROW_ID } from './hyperlink-entry-contract.mjs'
import { MULTIPLE_SLIDE_MASTERS_ROW_ID } from './multiple-slide-masters-contract.mjs'
import { listOptionCatalog } from './option-registry.mjs'
import { FOUNDATION_PUBLIC_OPERATION_NAMES } from './public-operation-capability-contract.mjs'

const CATALOG_SCHEMA = 'betterpptx.authoring.baseline-catalog.v1'
const PUBLIC_COMPOSITION_TOOL = 'betterpptx.deck.generate_from_spec'
const DISCOVERY_TOOLS = ['betterpptx.authoring.capabilities', 'betterpptx.options.catalog']
const FOUNDATION_PUBLIC_OPERATIONS = new Set(FOUNDATION_PUBLIC_OPERATION_NAMES)
const PUBLIC_KNOWN_FAMILIES = new Set([
	...AUTHORING_CAPABILITY_REGISTRY.map(row => row.id),
	'presenter-motion',
	'art-direction',
	'layout-intents',
	'foundation',
])
// Source/bundle lifecycle operations are public product infrastructure, not
// authoring capability rows. Keeping them out of this ledger preserves the
// frozen capability-catalog cardinality and prevents storage mechanics from
// being misreported as visual authoring coverage.
const PUBLIC_LIFECYCLE_TOOLS = new Set([
  'betterpptx.spec.export_bundle',
  'betterpptx.bundle.inspect',
  'betterpptx.bundle.import',
])

const FAMILY_ALIASES = [

  [/connector|group|comment|custom geometry|advanced geometry|structural|\breview\b/i, 'structural'],

  [/chart/i, 'charts'],
  [/smartart/i, 'smartart'],
  [/table/i, 'tables'],
  [/word.?art|text.?3d/i, 'wordart-text3d'],
  [/shape|gradient|icon/i, 'shapes-gradients'],
  [/art.?direction|worlds?/i, 'art-direction'],
  [/layout.?intent/i, 'layout-intents'],
  [/layout|theme|master|slide/i, 'layouts-themes-masters'],
  [/image|picture|media|audio|voice|avatar/i, 'media-images-avatar'],
  [/3d|model/i, 'model3d'],
  [/equation|math/i, 'equations'],
  [/connector|group|comment|custom geometry|structural|\breview\b/i, 'structural'],
  [/motion|transition|morph|animation/i, 'motion-transitions-morph'],
]

// Ledger categories carry the ownership taxonomy. Prefer them to incidental
// words in preset labels (for example, flowChartProcess is still a ShapeType,
// while a shape-built chart remains a chart capability).
const LEDGER_CATEGORY_FAMILIES = [
  [/^Charts(?:\s|$)/i, 'charts'],
  [/^SmartArt(?:\s|$)/i, 'smartart'],
  [/^Advanced Geometry$/i, 'structural'],
  [/^Shapes$/i, 'shapes-gradients'],
  [/^Legacy Shape Aliases$/i, 'shapes-gradients'],
  [/^Shape Styling$/i, 'shapes-gradients'],
  [/^Shape Based Icons$/i, 'shapes-gradients'],
  [/^(?:Transitions|Morph Semantics|Motion Paths|Animation Semantics|Animations(?:\s|$))/i, 'motion-transitions-morph'],
  [/\b(?:layout|master|theme)\b/i, 'layouts-themes-masters'],
]

function publicSafeText(value) {
  return String(value || '')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
  return value
}

function stableJson(value) {
  return JSON.stringify(stable(value))
}

function opaqueId(sourceId) {
  return `cap_${sha256(sourceId).slice(0, 20)}`
}

function familyFor(value) {
  const text = String(value || '')
  return FAMILY_ALIASES.find(([pattern]) => pattern.test(text))?.[1] || 'foundation'
}

function optionFamily(surface) {
	const text = `${surface?.id || ''} ${surface?.field || ''}`
	if (/\btext.?3d|\bword.?art|\btext(?:glow|reflection|shadow|outline|fill)/i.test(text)) return 'wordart-text3d'
	if (/picture|image/i.test(text)) return 'media-images-avatar'
	if (/media|audio|video|caption|voice/i.test(text)) return 'media-images-avatar'
	return familyFor(text)
}

function normalizeSearchText(value) {
	return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function optionParameterEntries() {
	const surfaces = listOptionCatalog({ format: 'full' }).surfaces || []
	const entries = []
	for (const surface of surfaces) {
		const parameterRows = Array.isArray(surface.parameters)
			? surface.parameters.map(parameter => ({ parameter, variant: '' }))
			: Object.entries(surface.parameters || {}).flatMap(([variant, parameters]) => (Array.isArray(parameters) ? parameters : []).map(parameter => ({ parameter, variant })))
		for (const { parameter, variant } of parameterRows) {
			if (!parameter?.id) continue
			const semanticPath = parameter.semanticPath || `${surface.id}${variant ? `.${variant}` : ''}.${parameter.id}`
			const family = optionFamily(surface)
			const aliases = [
				parameter.id,
				`${surface.id} ${variant} ${parameter.id}`.replace(/\s+/g, ' ').trim(),
				semanticPath,
				...(Array.isArray(parameter.aliases) ? parameter.aliases : []),
				...Object.keys(surface.aliases || {}).filter(alias => normalizeSearchText(alias).includes(normalizeSearchText(parameter.id))),
			]
			const id = `${surface.id}.${variant ? `${variant}.` : ''}${parameter.id}`
			entries.push({
				id,
				family,
				label: `${id} — ${semanticPath}`,
				aliases: [...new Set(aliases)],
				description: surface.description,
				sourceKind: 'atomic-option-control',
				source: 'options-contract',
				status: parameter.capabilityStatus === 'unsupported' ? 'unsupported' : 'implemented',
				implemented: parameter.capabilityStatus !== 'unsupported',
				mvp: parameter.capabilityStatus !== 'unsupported',
				requiredForCompletion: false,
				coverageMode: parameter.capabilityMode || surface.capabilityMode || 'parameterized',
				capabilityMode: parameter.capabilityMode || surface.capabilityMode || 'parameterized',
				capabilityStatus: parameter.capabilityStatus || surface.capabilityStatus || 'structured-partial',
				componentOwnership: [semanticPath],
				overrideFields: [semanticPath],
				resetBehavior: surface.resetBehavior || null,
				parameterContract: { ...parameter },
				selection: {
					semanticKind: semanticKind(family, `${surface.id} ${parameter.id}`),
					semanticPath,
				},
				route: routeFor(family, PUBLIC_COMPOSITION_TOOL, semanticKind(family, `${surface.id} ${parameter.id}`), parameter.capabilityMode || surface.capabilityMode),
			})
		}
	}
	return entries
}

function searchableFields(entry) {
	return {
		id: entry.id,
		family: entry.family,
		label: entry.label,
		aliases: entry.aliases,
		description: entry.description,
		narrativeUses: entry.narrativeUses,
		semanticTags: entry.semanticTags,
		status: entry.status,
		capabilityMode: entry.capabilityMode,
		semanticPath: entry.selection?.semanticPath,
		executableId: entry.selection?.executableId,
		executableValue: entry.selection?.executableValue,
		parameterId: entry.parameterContract?.id,
	}
}

function matchReasons(entry, terms) {
	const reasons = []
	for (const term of terms) {
		for (const [field, value] of Object.entries(searchableFields(entry))) {
			if (containsTokenSequence(value, term)) reasons.push({ matchedBy: field, matchedTerm: term })
		}
	}
	return reasons.filter((reason, index, all) => all.findIndex(candidate => candidate.matchedBy === reason.matchedBy && candidate.matchedTerm === reason.matchedTerm) === index)
}

const SEARCH_STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'do', 'for', 'from', 'in', 'is', 'it', 'no', 'not', 'of', 'on', 'only', 'or', 'the', 'to', 'use', 'with', 'without'])

function searchTokens(value) {
	return normalizeSearchText(typeof value === 'string' ? value : JSON.stringify(value ?? '')).split(/\s+/).filter(Boolean)
}

function meaningfulSearchTerms(values) {
	return [...new Set(values.flatMap(searchTokens).filter(token => token.length > 1 && !SEARCH_STOP_WORDS.has(token)))]
}

function containsTokenSequence(value, term) {
	const haystack = searchTokens(value)
	const needle = searchTokens(term)
	if (!needle.length || needle.some(token => SEARCH_STOP_WORDS.has(token))) return false
	return haystack.some((_, index) => needle.every((token, offset) => haystack[index + offset] === token))
}

function ledgerFamilyFor(category, label) {
  const categoryText = String(category || '')
  const labelText = String(label || '')

  if (/^Shapes$/i.test(categoryText) && /^(?:custGeom|freeform)$/i.test(labelText)) return 'structural'
  if (/^Legacy Shape Aliases$/i.test(categoryText) && /^CUSTOM_GEOMETRY\s*->\s*custGeom$/i.test(labelText)) return 'structural'
  if (/^Shape Styling$/i.test(categoryText) && /custom geometry preservation/i.test(labelText)) return 'structural'
  if (/^Slide Authoring$/i.test(categoryText) && /transition|animation|timing/i.test(labelText)) return 'motion-transitions-morph'
  if (/^Slide Authoring$/i.test(categoryText) && /^add image$/i.test(labelText)) return 'media-images-avatar'
  if (/^Slide Authoring$/i.test(categoryText) && /^add media$/i.test(labelText)) return 'media-images-avatar'

  return LEDGER_CATEGORY_FAMILIES.find(([pattern]) => pattern.test(categoryText))?.[1]
    || familyFor(`${categoryText} ${labelText}`)
}

function specializedTools(family) {
  const result = []
  if (family === 'charts') result.push('betterpptx.chart.recommend')
  if (family === 'tables') result.push('betterpptx.table.recommend')
  if (family === 'smartart') result.push('betterpptx.smartart.catalog')
  if (family === 'equations') result.push('betterpptx.equation.catalog')
  if (family === 'media-images-avatar') result.push('betterpptx.assets.upload', 'betterpptx.assets.search_stock', 'betterpptx.narration.voices', 'betterpptx.narration.get_voice_timing')
  if (family === 'model3d') result.push('betterpptx.assets.catalog')
  return result
}

function semanticKind(family, category = '') {
	if (family === 'layouts-themes-masters' && /\badd slide\b/i.test(category)) return 'slide'
	if (/\badd hyperlink\b/i.test(category)) return 'hyperlink'
	if (/\bslide zoom\b/i.test(category)) return 'slideZoom'
	if (/\bjump to slide\b/i.test(category)) return 'interactiveAction'
	if (family === 'foundation') {
		if (/^Validation Oracle Features\b/i.test(category)) return 'validation'
		if (/^MCP Product Surface\b/i.test(category)) return 'productOperation'
		if (/^Sample Object Library\b/i.test(category)) return 'assetDiscovery'
		if (/^Interactive Presentation Features\b/i.test(category)) return 'interactiveAction'
		if (/^Accessibility\b/i.test(category)) return 'accessibility'
		if (/^Deck and System\b/i.test(category)) return 'deck'
	}
  if (family === 'charts') return 'chart-panel'
  if (family === 'tables') return 'table-panel'
  if (family === 'smartart') return /shape built/i.test(category) ? 'diagram' : 'smartart'
  if (family === 'wordart-text3d') return /3d/i.test(category) ? 'text3d' : 'wordart'
  if (family === 'shapes-gradients') return 'shape'
  if (family === 'media-images-avatar') {
    if (/audio|voice|narration/i.test(category)) return 'narration'
    if (/media|video/i.test(category)) return 'media'
    return 'image'
  }
  if (family === 'model3d') return 'model3d'
  if (family === 'layouts-themes-masters' && /showMasterShapes/i.test(category)) return 'slidePolicy'
  if (family === 'layouts-themes-masters' && /placeholder/i.test(category)) return 'layoutPlaceholder'
  if (family === 'layouts-themes-masters') return 'layoutThemeMaster'
  if (family === 'equations') return 'equation'
  if (family === 'structural') {
    if (/connector/i.test(category)) return 'connector'
    if (/group/i.test(category)) return 'group'
    if (/comment|review/i.test(category)) return 'reviewComment'
    return 'freeform'
  }
  if (family === 'motion-transitions-morph') return /transition|morph/i.test(category) ? 'transition' : 'motion'
  return 'textBox'
}

const PLACEHOLDER_SELECTION_BY_ROW_ID = new Map([
  ...LAYOUT_PLACEHOLDER_VARIANT_ROWS.map(row => [row.id, { executableValue: row.semanticType, semanticPath: 'content[].placeholderBinding.type' }]),
  ...LAYOUT_GRAPHIC_PLACEHOLDER_ROWS.map(row => [row.id, { executableValue: row.semanticType, semanticPath: 'content[].placeholderBinding.type' }]),
  [HEADER_VISIBILITY_ROW_ID, { executableValue: true, semanticPath: 'layouts[].headerFooter.header' }],
  [SLIDE_NUMBER_FIELD_ROW_ID, { executableValue: 'slidenum', semanticPath: 'layouts[].slideNumber' }],
  [SHOW_MASTER_SHAPES_ROW_ID, { executableValue: true, semanticPath: 'slides[].showMasterShapes' }],
])

const INHERITANCE_SELECTION_BY_ROW_ID = new Map(
	LAYOUT_THEME_MASTER_INHERITANCE_ROWS.map(row => [row.id, {
		executableValue: row.label,
		semanticPath: row.semanticPath,
	}]),
)

const TEXT_AUTHORING_SELECTION_BY_ROW_ID = new Map(
	TEXT_AUTHORING_ENTRY_ROWS.map(row => [row.id, {
		executableValue: row.executableValue,
		semanticPath: row.semanticPath,
	}]),
)

const INTERACTIVE_NAVIGATION_SELECTION_BY_ROW_ID = new Map(
	INTERACTIVE_NAVIGATION_ROWS.map(row => [row.id, {
		executableValue: row.executableValue,
		semanticPath: row.semanticPath,
	}]),
)

const SECTION_SUMMARY_ZOOM_SELECTION_BY_ROW_ID = new Map(
	SECTION_SUMMARY_ZOOM_ROWS.map(row => [row.id, {
		semanticKind: row.semanticKind,
		executableValue: row.executableValue,
		semanticPath: row.semanticPath,
	}]),
)

function executableHint(label, rowId) {
	if (rowId === MULTIPLE_SLIDE_MASTERS_ROW_ID) return {
		executableValue: 'multiple-slide-masters',
		semanticPath: 'masters[]|layouts[].masterName|slides[].masterName',
	}
	if (rowId === ADD_SLIDE_ENTRY_ROW_ID) return {
		executableValue: 'slide',
		semanticPath: 'slides[]',
	}
	if (rowId === HYPERLINK_ENTRY_ROW_ID) return {
		executableValue: 'hyperlink',
		semanticPath: 'slides[].content[].hyperlink|slides[].content[].text[].options.hyperlink|slides[].content[].pictureAdjuncts.hyperlink',
	}
	if (rowId === LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_ROW_ID) return {
		executableValue: { kind: 'familyAggregate', family: 'layouts-themes-masters' },
		semanticPath: 'theme|masters[]|layouts[]|slides[].layoutName|slides[].masterName',
	}
  if (PLACEHOLDER_SELECTION_BY_ROW_ID.has(rowId)) return { ...PLACEHOLDER_SELECTION_BY_ROW_ID.get(rowId) }
  if (INHERITANCE_SELECTION_BY_ROW_ID.has(rowId)) return { ...INHERITANCE_SELECTION_BY_ROW_ID.get(rowId) }
  if (TEXT_AUTHORING_SELECTION_BY_ROW_ID.has(rowId)) return { ...TEXT_AUTHORING_SELECTION_BY_ROW_ID.get(rowId) }
  if (INTERACTIVE_NAVIGATION_SELECTION_BY_ROW_ID.has(rowId)) return { ...INTERACTIVE_NAVIGATION_SELECTION_BY_ROW_ID.get(rowId) }
  if (SECTION_SUMMARY_ZOOM_SELECTION_BY_ROW_ID.has(rowId)) return { ...SECTION_SUMMARY_ZOOM_SELECTION_BY_ROW_ID.get(rowId) }
  const masterPresetId = masterPresetIdForCatalogEntry({ id: rowId, label })
  if (masterPresetId) return { executableId: masterPresetId, executableValue: masterPresetId, semanticPath: 'masterPresetId' }
  const themePresetId = themePresetIdForCatalogEntry({ id: rowId, label })
  if (themePresetId) return { executableId: themePresetId, executableValue: themePresetId, semanticPath: 'themePresetId' }
  const text = String(label || '')
  const arrow = text.lastIndexOf(' -> ')
  if (arrow >= 0) return { executableId: text.slice(arrow + 4).trim() }
  if (/^[A-Za-z][A-Za-z0-9_-]{2,}$/.test(text) && !/\s/.test(text)) return { executableValue: text }
  return {}
}

function routeFor(family, publicTool, kind, coverageMode) {
  const specialized = specializedTools(family)
  const publicSpecFirst = publicTool && PUBLIC_SPEC_FIRST_TOOLS.has(publicTool)
  if (coverageMode === 'preserve-only') {
    return {
      status: 'preserve-only',
      discovery: ['betterpptx.authoring.catalog', 'betterpptx.help.workflow'],
      composition: ['betterpptx.deck.open_uploaded', PUBLIC_COMPOSITION_TOOL],
      semanticKind: kind,
      exactSelection: 'betterpptx.deck.open_uploaded',
    }
  }
  if (coverageMode === 'validate-only' || coverageMode === 'detect-and-reject') {
    return {
      status: coverageMode,
      discovery: ['betterpptx.authoring.catalog', 'betterpptx.help.capabilities'],
      composition: ['betterpptx.deck.validate'],
      semanticKind: kind,
      exactSelection: 'betterpptx.deck.validate',
    }
  }
  return {
    status: publicSpecFirst ? 'public-tool' : 'spec-front-door',
    discovery: [...DISCOVERY_TOOLS, ...specialized],
    composition: [publicSpecFirst ? publicTool : PUBLIC_COMPOSITION_TOOL],
    semanticKind: kind,
    exactSelection: family === 'media-images-avatar' ? PUBLIC_COMPOSITION_TOOL : specialized.length > 0 ? specialized[0] : PUBLIC_COMPOSITION_TOOL,
  }
}
function makeEntry({ sourceId, source, kind, family, label, status, implemented, coverageMode, nativeModes = [], fallbackModes = [], publicTool, category, requiredForCompletion = true }) {
  const id = opaqueId(sourceId)
  const semanticKindName = id === MULTIPLE_SLIDE_MASTERS_ROW_ID
    ? 'slideMasterCollection'
    : kind === 'public-tool' && family === 'foundation'
    ? 'productOperation'
    : semanticKind(family, `${category} ${label}`)
  const route = routeFor(family, publicTool, semanticKindName, coverageMode)
  if (kind === 'public-tool') route.exactSelection = publicTool
  return {
    id,
    family,
    label,
    sourceKind: kind,
    // Retain the ledger category through capability-truth classification.
    // It is removed from the public projection below; this internal marker
    // prevents category-specific rows from falling through a family default.
    ...(category ? { category } : {}),
    source: source === 'semantic-authoring-registry' ? 'semantic-catalog' : 'capability-catalog',
    status,
    implemented: Boolean(implemented),
    mvp: Boolean(implemented && source !== 'semantic-authoring-registry' || source === 'semantic-authoring-registry'),
    requiredForCompletion: Boolean(requiredForCompletion),
    coverageMode: coverageMode || null,
    nativeModes: [...nativeModes],
    fallbackModes: [...fallbackModes],
    selection: {
      semanticKind: semanticKindName,
      ...executableHint(label, id),
    },
    route,
  }
}

function publicMotionCatalogDegradation(error) {
	const code = String(error?.code || '').toUpperCase() === 'AUTHORING_MOTION_SOURCE_INVALID'
		? 'AUTHORING_MOTION_SOURCE_INVALID'
		: 'AUTHORING_MOTION_CATALOG_UNAVAILABLE'
	return {
		family: 'presenter-motion',
		code,
		scope: 'presenter-motion',
		retryable: true,
		message: 'Presenter-motion discovery is temporarily unavailable; unrelated authoring families remain discoverable.',
		nextAction: {
			tool: 'betterpptx.authoring.catalog',
			request: { family: 'presenter-motion', includePlanned: true, offset: 0, limit: 20 },
		},
	}
}

function buildEntries({ includePlanned = false, diagnostics = [], motionCatalogFactory } = {}) {
  const ledger = buildCapabilityLedger(undefined, 'betterpptx-mcp')
  const entries = []
  for (const row of ledger.rows) {
    if (row.category === 'MCP Internal Admin Surface') continue
    if (!includePlanned && !row.implemented) continue
    const family = ledgerFamilyFor(row.category, row.publicName)
    entries.push(makeEntry({
      sourceId: `ledger:${row.featureId}`,
      source: 'capability-ledger',
      kind: 'capability-row',
      family,
      label: row.publicName,
      status: row.implemented ? 'implemented' : 'planned',
      implemented: row.implemented,
      coverageMode: row.coverageMode,
      publicTool: row.mcpTool,
      category: row.category,
      requiredForCompletion: row.requiredForCompletion,
    }))
  }
  for (const row of AUTHORING_CAPABILITY_REGISTRY) {
    entries.push(makeEntry({
      sourceId: `family:${row.id}`,
      source: 'semantic-authoring-registry',
      kind: 'authoring-family',
      family: row.id,
      label: row.label,
      status: row.status,
      implemented: true,
      nativeModes: row.nativeModes,
      fallbackModes: row.fallbackModes,
      publicTool: row.publicTools.find(tool => PUBLIC_SPEC_FIRST_TOOLS.has(tool)),
      category: row.label,
    }))
  }
	entries.push(...optionParameterEntries())
	entries.push({
		id: opaqueId('native-composite:animated-table'),
		family: 'tables',
		label: 'Animated table — editable row/cell shapes with native timing and Synergy targets',
		sourceKind: 'native-composite-technique',
		source: 'semantic-catalog',
		status: 'implemented',
		implemented: true,
		mvp: true,
		requiredForCompletion: false,
		coverageMode: 'editable-native-composite',
		nativeModes: ['editable-shape-built-animated-table'],
		fallbackModes: [],
		selection: {
			semanticKind: 'animated-table',
			executableValue: 'animated-table',
			semanticPath: 'slides[].content[].kind',
		},
		route: {
			status: 'spec-front-door',
			discovery: ['betterpptx.help.capabilities', 'betterpptx.authoring.catalog', 'betterpptx.help.tool_recipe'],
			composition: [PUBLIC_COMPOSITION_TOOL],
			semanticKind: 'animated-table',
			exactSelection: 'slides[].content[].kind',
		},
	})
	for (const tool of TOOLS) {
    if (!PUBLIC_SPEC_FIRST_TOOLS.has(tool.name)) continue
		if (PUBLIC_LIFECYCLE_TOOLS.has(tool.name)) continue
    // Explicit operation ownership outranks incidental words in a tool name.
    const family = FOUNDATION_PUBLIC_OPERATIONS.has(tool.name) ? 'foundation' : familyFor(tool.name)
    entries.push(makeEntry({
      sourceId: `tool:${tool.name}`,
      source: 'mcp-tool-surface',
      kind: 'public-tool',
      family,
      label: tool.name,
      status: 'implemented',
      implemented: true,
      publicTool: tool.name,
      category: family,
    }))
	}
	for (const preset of NATIVE_STYLE_PRESETS) {
		entries.push(makeEntry({
			sourceId: `native-style:${preset.id}`,
			source: 'native-gallery-style-catalog',
			kind: 'native-gallery-style',
			family: preset.family,
			label: `${preset.label} -> ${preset.id}`,
			status: 'implemented',
			implemented: true,
			publicTool: 'betterpptx.deck.generate_from_spec',
			category: preset.kind,
		}))
	}
	for (const preset of publicNativeEffectPresets()) {
		entries.push(makeEntry({
			sourceId: `native-effect:${preset.id}`,
			source: 'native-effect-gallery-catalog',
			kind: 'native-gallery-style',
			family: preset.family,
			label: `${preset.label} -> ${preset.id}`,
			status: 'implemented',
			implemented: true,
			publicTool: 'betterpptx.deck.generate_from_spec',
			category: preset.kind,
		}))
	}
	for (const preset of publicPictureStylePresets()) {
		entries.push({
			...makeEntry({
			sourceId: `picture-style:${preset.id}`,
			source: 'native-picture-style-catalog',
			kind: 'native-gallery-style',
			family: preset.family,
			label: `${preset.label} -> ${preset.id}`,
			status: 'implemented',
			implemented: true,
			publicTool: 'betterpptx.deck.generate_from_spec',
			category: preset.kind,
			}),
			presetId: preset.id,
			expandedOptions: preset.expandedOptions,
		})
	}
	for (const preset of publicModel3dViewPresets()) {
		entries.push(makeEntry({
			sourceId: `model3d-view:${preset.id}`,
			source: 'native-model3d-view-catalog',
			kind: 'native-gallery-style',
			family: preset.family,
			label: `${preset.label} -> ${preset.id}`,
			status: 'implemented',
			implemented: true,
			publicTool: 'betterpptx.deck.generate_from_spec',
			category: preset.kind,
		}))
	}
	for (const preset of publicSourceApiGalleryPresets()) {
		entries.push(makeEntry({
			sourceId: `source-api-gallery:${preset.id}`,
			source: 'source-api-gallery-catalog',
			kind: 'native-gallery-style',
			family: preset.family,
			label: `${preset.label} -> ${preset.id}`,
			status: 'implemented',
			implemented: true,
			publicTool: 'betterpptx.deck.generate_from_spec',
			category: preset.kind,
		}))
	}
	let motionCatalog = null
	try {
		motionCatalog = typeof motionCatalogFactory === 'function'
			? motionCatalogFactory({ family: 'motion', includePlanned, limit: 500 })
			: publicAuthoringMotionCatalog({ family: 'motion', includePlanned, limit: 500 })
	} catch (error) {
		diagnostics.push(publicMotionCatalogDegradation(error))
	}
	for (const motion of motionCatalog?.motions || []) {
		const implemented = motion.availability !== 'PLANNED_NOT_SELECTABLE'
		entries.push({
			id: motion.id,
			family: 'presenter-motion',
			label: motion.label,
			sourceKind: 'semantic-presenter-motion',
			source: 'semantic-catalog',
			status: motion.selectable ? 'implemented' : implemented ? 'implemented-held' : 'planned',
			implemented,
			mvp: implemented,
			requiredForCompletion: implemented,
			coverageMode: 'native-editable-3d-motion',
			nativeModes: ['editable-native-3d-presenter'],
			fallbackModes: [],
			description: motion.description,
			narrativeUses: motion.narrativeUses,
			semanticTags: motion.semanticTags,
			behavior: motion.behavior,
			...(motion.measurements ? { measurements: {...motion.measurements,...(motion.measurements.schemaVersion==='betterpptx.public-motion-measurements.v1'&&motion.measurements.root?{rootJoint:motion.measurements.root}:{})} } : {}),
			...(motion.qualification ? { qualification: motion.qualification } : {}),
			availability: motion.availability,
			selectable: motion.selectable,
			selection: {
				semanticKind: 'presenter-motion',
				...(motion.selectable ? { executableValue: motion.id } : {}),
			},
			route: {
				status: 'spec-front-door',
				discovery: ['betterpptx.authoring.catalog'],
				composition: [PUBLIC_COMPOSITION_TOOL],
				semanticKind: 'model3d',
				authoringSemantic: 'presenter-motion',
				exactSelection: 'motionTime.kineticSelection.presenters[].selectedMotionIds[]',
				slideUse: 'slides[].presenterMotion.motionId',
			},
			...(motion.limitation ? { limitation: motion.limitation } : {}),
		})
	}
	for (const world of listArtDirections()) {
		entries.push({
			id: opaqueId(`art-direction:${world.key}`),
			family: 'art-direction',
			label: publicSafeText(world.label),
			sourceKind: 'named-world',
			source: 'semantic-catalog',
			status: 'implemented',
			implemented: true,
			mvp: true,
			requiredForCompletion: true,
			coverageMode: 'named-world-grammar',
			nativeModes: ['world-canvas-type-card-language'],
			fallbackModes: [],
			defaultMode: world.defaultMode,
			availableModes: world.availableModes,
			selection: { semanticKind: 'artDirection', executableValue: world.key },
			route: {
				status: 'spec-front-door',
				discovery: ['betterpptx.authoring.catalog', 'betterpptx.help.capabilities'],
				composition: [PUBLIC_COMPOSITION_TOOL],
				semanticKind: 'artDirection',
				exactSelection: 'styleIntent.artDirection',
			},
		})
	}
	for (const intent of AUTHORING_LAYOUT_INTENTS) {
		const contract = LAYOUT_INTENT_CONTRACTS[intent] || {}
		entries.push({
			id: opaqueId(`layout-intent:${intent}`),
			family: 'layout-intents',
			label: `${intent} — ${contract.purpose || 'semantic slide layout'}`,
			sourceKind: 'semantic-layout-intent',
			source: 'semantic-catalog',
			status: 'implemented',
			implemented: true,
			mvp: true,
			requiredForCompletion: true,
			coverageMode: 'ai-authored-exact-geometry',
			nativeModes: ['semantic-layout-labels-with-ai-authored-frames'],
			fallbackModes: Array.isArray(contract.fallback) ? [...contract.fallback] : [],
			selection: { semanticKind: 'layoutIntent', executableValue: intent },
			route: {
				status: 'spec-front-door',
				discovery: ['betterpptx.authoring.catalog'],
				composition: [PUBLIC_COMPOSITION_TOOL],
				semanticKind: 'layoutIntent',
				exactSelection: 'slides[].layoutIntent',
			},
		})
	}
  entries.push(...publicMotionSourceReviews())
  const seen = new Set()
  return entries.filter(entry => {
    if (seen.has(entry.id)) return false
    seen.add(entry.id)
    return true
  }).map(entry => entry.sourceKind === 'atomic-option-control' ? entry : applyCatalogTruth(entry)).map(entry => {
    const { category, ...publicEntry } = entry
    return publicEntry
  }).sort((a, b) => a.family.localeCompare(b.family) || a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
}

export function publicBaselineCatalog(args = {}, options = {}) {
	const family = String(args.family || args.surface || '').trim().toLowerCase()
	if(args.motionWindowRequirements!==undefined&&family!=='presenter-motion')throw Object.assign(new Error('Source movement windows require family presenter-motion.'),{code:'MOTION_REQUIREMENT_FAMILY_REQUIRED'})
	if (args.motionRequirements !== undefined) {
		validateMotionRequirements(args.motionRequirements)
		if (family !== 'presenter-motion') throw Object.assign(new Error('Motion requirements require family presenter-motion.'), { code: 'MOTION_REQUIREMENT_FAMILY_REQUIRED' })
	}
	const query = String(args.query || args.q || '').trim().toLowerCase()
	const requestedFamilies = [...new Set((Array.isArray(args.families) ? args.families : []).map(value => String(value).trim().toLowerCase()).filter(Boolean))]
	const excludedFamilies = new Set((Array.isArray(args.excludeFamilies) ? args.excludeFamilies : []).map(value => String(value).trim().toLowerCase()).filter(Boolean))
	const queryTerms = meaningfulSearchTerms([query])
	const relevanceTerms = meaningfulSearchTerms([
		...queryTerms,
		...(Array.isArray(args.relevanceTerms) ? args.relevanceTerms : []),
	])
	const includePlanned = args.includePlanned === true
	const diagnostics = []
	const all = buildEntries({ includePlanned, diagnostics, motionCatalogFactory: options.motionCatalogFactory })
	const filtered = all.filter(entry => {
		if (family && family !== 'all' && !(entry.family === family || entry.family.includes(family))) return false
		if (requestedFamilies.length && !requestedFamilies.includes(entry.family)) return false
		if (excludedFamilies.has(entry.family)) return false
		if (excludedFamilies.has('narration') && entry.selection?.semanticKind === 'narration') return false
		if (!queryTerms.length) return !query
		return queryTerms.every(term => containsTokenSequence(searchableFields(entry), term))
	}).map(entry => {
		const reasons = matchReasons(entry, relevanceTerms)
		if (requestedFamilies.includes(entry.family)) reasons.push({ matchedBy: 'intentFamily', matchedTerm: entry.family })
		return reasons.length ? { ...entry, matchReasons: reasons } : entry
	}).sort((a, b) => {
		if (!relevanceTerms.length) return 0
		const score = entry => (entry.matchReasons || []).reduce((total, reason) => total + ({ id: 8, semanticPath: 8, parameterId: 7, aliases: 6, label: 5, family: 2, intentFamily: 1 }[reason.matchedBy] || 1), 0)
		return score(b) - score(a)
	})
  const evaluated = args.motionRequirements === undefined ? null : evaluateMotionCatalog(filtered, args.motionRequirements)
  const pageEntries = evaluated?.entries || filtered
  if(typeof options.captureFilteredEntries==='function')options.captureFilteredEntries(pageEntries)
  const limit = Math.max(1, Math.min(500, Number(args.limit) || 100))
  const offset = Math.max(0, Number(args.offset) || 0)
  const motionWindowQuery=args.motionWindowRequirements===undefined?null:evaluateMotionWindowCatalog(pageEntries,args.motionWindowRequirements,{offset})
	const entries = pageEntries.slice(offset, offset + limit).map(entry => entry.family === 'presenter-motion' ? {...entry,authoringGuidance:motionAuthoringGuidance(entry)} : entry)
	const nextOffset = offset + entries.length < filtered.length ? offset + entries.length : null
	const payload = all.map(entry => ({ id: entry.id, family: entry.family, label: entry.label, status: entry.status, implemented: entry.implemented, capabilityMode: entry.capabilityMode, capabilityStatus: entry.capabilityStatus, selection: entry.selection, ...(entry.sourceKind === 'observed-motion-review' ? { measurements:entry.measurements,sourceReview:entry.sourceReview,description:entry.description } : {}) }))
	const catalogFingerprint = `betterpptx-catalog-${sha256(stableJson({ ledgerSemanticHash: ledgerSemanticHash(buildCapabilityLedger(undefined, 'betterpptx-mcp')), entries: payload, diagnostics })).slice(0, 24)}`
	// Public navigation binds only published catalog facts, independently of
	// private build fingerprints and diagnostic ledgers.
	const catalogVersion = `catalog_version_${sha256(stableJson(all.map(entry => ({ id:entry.id,family:entry.family,label:entry.label,description:entry.description,selection:entry.selection,selectable:entry.selectable,measurements:entry.measurements,sourceReview:entry.sourceReview,compatibleTargets:entry.route?.preparationDiscovery?.compatibleTargetModels })))).slice(0,32)}`
  const familyCounts = all.reduce((counts, entry) => {
    counts[entry.family] = (counts[entry.family] || 0) + 1
    return counts
  }, {})
	const familyKnown = !family || family === 'all' || PUBLIC_KNOWN_FAMILIES.has(family) || all.some(entry => entry.family === family)
	const blockedFamily = diagnostics.some(row => row.family === family || (family === 'motion-transitions-morph' && row.family === 'presenter-motion'))
	const emptyReason = entries.length > 0
		? null
		: !familyKnown
			? 'UNKNOWN_FAMILY'
			: blockedFamily
				? 'BLOCKED_DEPENDENCY'
				: query
					? 'NO_MATCHES'
					: 'NOT_SUPPORTED'
	return {
    schemaVersion: CATALOG_SCHEMA,
    status: 'PUBLIC_BASELINE_CATALOG',
    principle: {
      aiIsDesignMaster: true,
      engineRole: 'expose-and-execute',
      catalogDoesNotSelect: true,
      implementedAtClosureIsMvp: true,
      postBaselineOnlyIsContinuous: true,
      privateImplementationDetailsHidden: true,
    },
    catalogFingerprint,
    catalogVersion,
		catalogClosure: {
			baselineEntries: all.filter(entry => entry.implemented).length,
			sourceReviewEntries: all.filter(entry => entry.sourceKind === 'observed-motion-review').length,
		  classifiedEntries: all.length,
		  expectedServedEntriesWithPlanned: includePlanned ? all.length : null,
		  classificationComplete: all.every(entry => entry.capabilityMode && entry.capabilityStatus),
      familyCounts,
      includePlanned,
      ledgerSemanticHash: ledgerSemanticHash(buildCapabilityLedger(undefined, 'betterpptx-mcp')),
      publicSpecFirstTools: TOOL_NAMES.filter(name => PUBLIC_SPEC_FIRST_TOOLS.has(name)).length,
    },
		pagination: { offset, limit, returned: entries.length, total: filtered.length, nextOffset, complete: nextOffset === null, query: query || null },
		entries,
		...(motionWindowQuery?{motionWindowQuery}:{}),
		...(evaluated ? { motionQuery: {...evaluated.motionQuery,candidateComparisons:motionCandidateComparisons(entries),comparisonScope:'returned-page',nextOffset} } : {}),
		...(emptyReason ? { emptyReason } : {}),
		...(diagnostics.length ? { degradations: diagnostics } : {}),
	}
}
