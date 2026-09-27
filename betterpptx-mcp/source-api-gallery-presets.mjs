// Deterministic Office gallery states that are available from the runtime or a
// stable Office object model.  The public projection exposes only IDs, labels,
// descriptions, and semantic parameters; private DrawingML recipes stay here.

import { fileURLToPath } from 'node:url'
import {
	EQUATION_FRACTION_RIBBON_PRESETS,
	EQUATION_RIBBON_GALLERY_PRESETS,
} from './equation-ribbon-presets.generated.mjs'
import {
	LAYOUT_PRESET_CONTRACT_ROWS,
	LAYOUT_PRESET_RESOURCE_CONTRACTS,
} from './layout-preset-contract.mjs'

export { EQUATION_RIBBON_GALLERY_PRESETS }

const TEMPLATE_RESOURCES = Object.freeze({
	'office-baseline-wide': Object.freeze({
		id: LAYOUT_PRESET_RESOURCE_CONTRACTS['office-baseline-wide'].templatePresetId,
		path: fileURLToPath(new URL('./assets/templates/office-baseline-wide.pptx', import.meta.url)),
		defaultLayout: LAYOUT_PRESET_RESOURCE_CONTRACTS['office-baseline-wide'].defaultLayout,
		themeId: LAYOUT_PRESET_RESOURCE_CONTRACTS['office-baseline-wide'].themeId,
		masterId: LAYOUT_PRESET_RESOURCE_CONTRACTS['office-baseline-wide'].masterId,
	}),
	'corporate-reference-wide': Object.freeze({
		id: LAYOUT_PRESET_RESOURCE_CONTRACTS['corporate-reference-wide'].templatePresetId,
		path: fileURLToPath(new URL('./assets/templates/corporate-layout-reference-wide.pptx', import.meta.url)),
		defaultLayout: LAYOUT_PRESET_RESOURCE_CONTRACTS['corporate-reference-wide'].defaultLayout,
		themeId: LAYOUT_PRESET_RESOURCE_CONTRACTS['corporate-reference-wide'].themeId,
		masterId: LAYOUT_PRESET_RESOURCE_CONTRACTS['corporate-reference-wide'].masterId,
	}),
})

function templateRecipe(resourceKey, layoutName = undefined) {
	const resource = TEMPLATE_RESOURCES[resourceKey]
	return Object.freeze({
		resourceKey,
		templatePresetId: resource.id,
		templatePath: resource.path,
		defaultLayout: resource.defaultLayout,
		...(layoutName ? { layoutName } : {}),
	})
}

export const THEME_GALLERY_PRESETS = Object.freeze([
	Object.freeze({
		id: 'theme-office-001',
		family: 'layouts-themes-masters',
		gallery: 'themes',
		kind: 'theme',
		tileIndex: 1,
		label: 'Office Theme',
		description: 'Native Office theme used by the bundled baseline and corporate-reference masters.',
		parameters: ['themePresetId'],
		scope: Object.freeze({ resourceId: 'template-office-baseline-wide-001' }),
		recipe: templateRecipe('office-baseline-wide'),
	}),
])

export const MASTER_GALLERY_PRESETS = Object.freeze([
	Object.freeze({
		id: 'master-office-baseline-wide-001',
		family: 'layouts-themes-masters',
		gallery: 'masters',
		kind: 'master',
		tileIndex: 1,
		label: 'Office Baseline Wide Master',
		description: 'Clean 16:9 Office master containing all eleven native layouts stored by the baseline master.',
		parameters: ['masterPresetId'],
		scope: Object.freeze({ themeId: 'theme-office-001', resourceId: 'template-office-baseline-wide-001' }),
		recipe: templateRecipe('office-baseline-wide'),
	}),
	Object.freeze({
		id: 'master-corporate-reference-wide-001',
		family: 'layouts-themes-masters',
		gallery: 'masters',
		kind: 'master',
		tileIndex: 2,
		label: 'Corporate Reference Wide Master',
		description: 'Existing 16:9 governed corporate master containing eight editable custom layouts.',
		parameters: ['masterPresetId'],
		scope: Object.freeze({ themeId: 'theme-office-001', resourceId: 'template-corporate-reference-wide-001' }),
		recipe: templateRecipe('corporate-reference-wide'),
	}),
])

function layoutRow(contract) {
	return Object.freeze({
		id: contract.id,
		family: 'layouts-themes-masters',
		gallery: 'slide-layouts',
		kind: 'layout',
		tileIndex: contract.tileIndex,
		label: contract.layoutName,
		description: `${contract.layoutName} native editable layout, scoped to ${contract.masterId}.`,
		parameters: ['slides[].layoutPresetId'],
		scope: Object.freeze({ themeId: contract.themeId, masterId: contract.masterId, resourceId: contract.templatePresetId }),
		recipe: templateRecipe(contract.resourceKey, contract.layoutName),
	})
}

export const LAYOUT_GALLERY_PRESETS = Object.freeze(LAYOUT_PRESET_CONTRACT_ROWS.map(layoutRow))

export const LAYOUT_THEME_MASTER_PRESETS = Object.freeze([
	...THEME_GALLERY_PRESETS,
	...MASTER_GALLERY_PRESETS,
	...LAYOUT_GALLERY_PRESETS,
])

const TRANSITION_ROWS = [
	['None', { type: 'none' }],
	['Morph', { type: 'morph', option: 'byObject' }],
	['Fade', { type: 'fade' }],
	['Push', { type: 'push' }],
	['Wipe', { type: 'wipe' }],
	['Split', { type: 'split' }],
	['Reveal', { type: 'reveal' }],
	['Cut', { type: 'cut' }],
	['Random Bars', { type: 'randomBar' }],
	['Shape', { type: 'shape', pattern: 'circle' }],
	['Uncover', { type: 'uncover' }],
	['Cover', { type: 'cover' }],
	['Flash', { type: 'flash' }],
	['Fall Over', { type: 'fallOver' }],
	['Drape', { type: 'drape' }],
	['Curtains', { type: 'curtains' }],
	['Wind', { type: 'wind' }],
	['Prestige', { type: 'prestige' }],
	['Fracture', { type: 'fracture' }],
	['Crush', { type: 'crush' }],
	['Peel Off', { type: 'peelOff' }],
	['Page Curl', { type: 'pageCurl' }],
	['Airplane', { type: 'airplane' }],
	['Origami', { type: 'origami' }],
	['Dissolve', { type: 'dissolve' }],
	['Checkerboard', { type: 'checkerboard' }],
	['Blinds', { type: 'blinds' }],
	['Clock', { type: 'clock', clockwise: true }],
	['Ripple', { type: 'ripple' }],
	['Honeycomb', { type: 'honeycomb' }],
	['Glitter', { type: 'glitter', pattern: 'hexagon' }],
	['Vortex', { type: 'vortex' }],
	['Shred', { type: 'shred', pattern: 'stripsIn' }],
	['Switch', { type: 'switch' }],
	['Flip', { type: 'flip' }],
	['Gallery', { type: 'gallery' }],
	['Cube', { type: 'cube' }],
	['Doors', { type: 'doors' }],
	['Box', { type: 'box' }],
	['Comb', { type: 'comb' }],
	['Zoom', { type: 'zoom' }],
	['Random', { type: 'random' }],
	['Pan', { type: 'pan' }],
	['Ferris Wheel', { type: 'ferrisWheel' }],
	['Conveyor', { type: 'conveyor' }],
	['Rotate', { type: 'rotate' }],
	['Window', { type: 'window' }],
	['Orbit', { type: 'orbit' }],
	['Fly Through', { type: 'flyThrough' }],
]

export const TRANSITION_GALLERY_PRESETS = Object.freeze(TRANSITION_ROWS.map(([label, recipe], index) => Object.freeze({
	id: `transition-ribbon-${String(index + 1).padStart(3, '0')}`,
	family: 'motion-transitions-morph',
	gallery: 'transitions',
	kind: 'transition',
	tileIndex: index + 1,
	label,
	description: `${label} slide transition, matching the top-level PowerPoint Transitions gallery state.`,
	parameters: ['speed', 'duration', 'advanceOnClick', 'advanceAfterTime'],
	recipe: Object.freeze({ ...recipe }),
})))

const CONNECTOR_COLORS = [
	['Dark 1', 'dk1'],
	['Accent 1', 'accent1'],
	['Accent 2', 'accent2'],
	['Accent 3', 'accent3'],
	['Accent 4', 'accent4'],
	['Accent 5', 'accent5'],
	['Accent 6', 'accent6'],
]

const CONNECTOR_OVERRIDE_PARAMETERS = Object.freeze([
	'line.type', 'line.color', 'line.width', 'line.transparency', 'line.dashType',
	'line.beginArrowType', 'line.beginArrowWidth', 'line.beginArrowLength',
	'line.endArrowType', 'line.endArrowWidth', 'line.endArrowLength',
])

function connectorThemeStyle(treatment, scheme) {
	if (treatment === 'moderate') {
		return Object.freeze({
			lineRef: Object.freeze({ index: 2, color: Object.freeze({ scheme, shade: 0.15 }) }),
			fillRef: Object.freeze({ index: 1, color: Object.freeze({ scheme }) }),
			effectRef: Object.freeze({ index: 0, color: Object.freeze({ scheme }) }),
			fontRef: Object.freeze({ role: 'minor', color: Object.freeze({ scheme: 'lt1' }) }),
		})
	}
	if (treatment === 'intense') {
		return Object.freeze({
			lineRef: Object.freeze({ index: 3, color: Object.freeze({ scheme: 'lt1' }) }),
			fillRef: Object.freeze({ index: 1, color: Object.freeze({ scheme }) }),
			effectRef: Object.freeze({ index: 1, color: Object.freeze({ scheme }) }),
			fontRef: Object.freeze({ role: 'minor', color: Object.freeze({ scheme: 'lt1' }) }),
		})
	}
	return Object.freeze({
		lineRef: Object.freeze({ index: 2, color: Object.freeze({ scheme }) }),
		fillRef: Object.freeze({ index: 1, color: Object.freeze({ scheme: 'lt1' }) }),
		effectRef: Object.freeze({ index: 0, color: Object.freeze({ scheme }) }),
		fontRef: Object.freeze({ role: 'minor', color: Object.freeze({ scheme: 'dk1' }) }),
	})
}

function connectorLineXml(lineDefaults = {}) {
	const children = []
	if (lineDefaults.dashType) children.push(`<a:prstDash val="${lineDefaults.dashType}"/>`)
	if (lineDefaults.beginArrowType) children.push(`<a:headEnd type="${lineDefaults.beginArrowType}"/>`)
	if (lineDefaults.endArrowType) children.push(`<a:tailEnd type="${lineDefaults.endArrowType}"/>`)
	return children.length ? `<a:ln>${children.join('')}</a:ln>` : ''
}

function connectorStyleXml(treatment, scheme) {
	if (treatment === 'moderate') {
		return `<p:style><a:lnRef idx="2"><a:schemeClr val="${scheme}"><a:shade val="15000"/></a:schemeClr></a:lnRef><a:fillRef idx="1"><a:schemeClr val="${scheme}"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="${scheme}"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></p:style>`
	}
	if (treatment === 'intense') {
		return `<p:style><a:lnRef idx="3"><a:schemeClr val="lt1"/></a:lnRef><a:fillRef idx="1"><a:schemeClr val="${scheme}"/></a:fillRef><a:effectRef idx="1"><a:schemeClr val="${scheme}"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></p:style>`
	}
	return `<p:style><a:lnRef idx="2"><a:schemeClr val="${scheme}"/></a:lnRef><a:fillRef idx="1"><a:schemeClr val="lt1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="${scheme}"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="dk1"/></a:fontRef></p:style>`
}

const CONNECTOR_TREATMENTS = [
	['Subtle Line', 'subtle', Object.freeze({})],
	['Moderate Line', 'moderate', Object.freeze({})],
	['Intense Line', 'intense', Object.freeze({})],
	['Dash', 'subtle', Object.freeze({ dashType: 'dash' })],
	['Single Arrow', 'subtle', Object.freeze({ endArrowType: 'triangle' })],
	['Double Arrow', 'subtle', Object.freeze({ beginArrowType: 'triangle', endArrowType: 'triangle' })],
]

export const CONNECTOR_STYLE_PRESETS = Object.freeze(CONNECTOR_TREATMENTS.flatMap(([treatmentLabel, treatment, lineDefaults], treatmentIndex) =>
	CONNECTOR_COLORS.map(([colorLabel, scheme], colorIndex) => {
		const tileIndex = treatmentIndex * CONNECTOR_COLORS.length + colorIndex + 1
		const id = `connector-ribbon-${String(tileIndex).padStart(3, '0')}`
		const themeStyle = connectorThemeStyle(treatment, scheme)
		return Object.freeze({
			id,
			family: 'structural',
			gallery: 'connector-styles',
			kind: 'connector',
			tileIndex,
			label: `${treatmentLabel} - ${colorLabel}`,
			description: `${treatmentLabel} connector using the theme-aware ${colorLabel} color.`,
			parameters: Object.freeze(['connectorType', 'from', 'to', ...CONNECTOR_OVERRIDE_PARAMETERS]),
			themeStyle,
			lineDefaults,
			recipe: Object.freeze({
				_rawConnectorLineXml: connectorLineXml(lineDefaults),
				_rawConnectorStyleXml: connectorStyleXml(treatment, scheme),
			}),
		})
	}),
))

export const EQUATION_FRACTION_GALLERY_PRESETS = EQUATION_FRACTION_RIBBON_PRESETS

// Existing semantic Office Math structures are product capabilities in their
// own right.  Give each one a stable opaque selection ID so an AI can discover
// and execute it without depending on implementation-facing `kind` strings.
// Alias rows remain visible because they are already supported public inputs;
// their canonical payload may intentionally match the primary row.
const EQUATION_SEMANTIC_ROWS = [
	['Text', { kind: 'text', text: 'x' }, ['text']],
	['Row', { kind: 'row', items: ['a', '+', 'b'] }, ['items']],
	['Group', { kind: 'group', items: ['a', 'b'] }, ['items']],
	['Fraction', { kind: 'fraction', numerator: 'a', denominator: 'b' }, ['numerator', 'denominator', 'fractionType']],
	['Fraction alias', { kind: 'frac', numerator: 'a', denominator: 'b' }, ['numerator', 'denominator', 'fractionType']],
	['Superscript', { kind: 'superscript', base: 'x', exponent: '2' }, ['base', 'exponent']],
	['Superscript alias', { kind: 'sup', base: 'x', exponent: '2' }, ['base', 'exponent']],
	['Subscript', { kind: 'subscript', base: 'x', subscript: 'i' }, ['base', 'subscript']],
	['Subscript alias', { kind: 'sub', base: 'x', subscript: 'i' }, ['base', 'subscript']],
	['Subscript and superscript', { kind: 'subsup', base: 'x', subscript: 'i', exponent: '2' }, ['base', 'subscript', 'exponent']],
	['Radical', { kind: 'radical', radicand: 'x+a' }, ['radicand', 'degree']],
	['Square-root alias', { kind: 'sqrt', radicand: 'x+a' }, ['radicand', 'degree']],
	['N-ary operator', { kind: 'nary', symbol: '∑', lower: 'i=0', upper: 'n', body: 'i' }, ['symbol', 'lower', 'upper', 'body']],
	['Summation', { kind: 'summation', lower: 'i=0', upper: 'n', body: 'i' }, ['lower', 'upper', 'body']],
	['Summation alias', { kind: 'sum', lower: 'i=0', upper: 'n', body: 'i' }, ['lower', 'upper', 'body']],
	['Integral', { kind: 'integral', lower: '0', upper: '1', body: 'f(x)' }, ['symbol', 'lower', 'upper', 'body']],
	['Large operator', { kind: 'operator', symbol: '∏', lower: 'i=1', upper: 'n', body: 'a_i' }, ['symbol', 'lower', 'upper', 'body']],
	['Bracket', { kind: 'bracket', left: '(', right: ')', items: ['x', 'y'] }, ['left', 'right', 'separator', 'items']],
	['Delimiter alias', { kind: 'delimiter', left: '[', right: ']', items: ['x', 'y'] }, ['left', 'right', 'separator', 'items']],
	['Cases', { kind: 'cases', rows: ['x < 0', 'x ≥ 0'] }, ['rows']],
	['Equation array', { kind: 'eqArr', rows: [['a', 'b'], ['c', 'd']] }, ['rows']],
	['Function', { kind: 'function', functionName: 'f', body: 'x' }, ['functionName', 'body']],
	['Function alias', { kind: 'func', functionName: 'g', body: 'x' }, ['functionName', 'body']],
	['Logarithm', { kind: 'log', body: 'x' }, ['functionName', 'body']],
	['Accent', { kind: 'accent', accentChar: '̂', body: 'x' }, ['accentChar', 'body']],
	['Bar', { kind: 'bar', body: 'x' }, ['position', 'body']],
	['Overbar alias', { kind: 'overbar', body: 'x' }, ['body']],
	['Underbar', { kind: 'underbar', body: 'x' }, ['body']],
	['Border box', { kind: 'box', body: 'x' }, ['body']],
	['Boxed alias', { kind: 'boxed', body: 'x' }, ['body']],
	['Lower limit', { kind: 'limit', base: 'f', lower: 'x→0' }, ['base', 'lower']],
	['Lower-limit alias', { kind: 'limlow', base: 'f', lower: 'x→0' }, ['base', 'lower']],
	['Matrix', { kind: 'matrix', rows: [['1', '0'], ['0', '1']] }, ['rows']],
]

export const EQUATION_SEMANTIC_GALLERY_PRESETS = Object.freeze(EQUATION_SEMANTIC_ROWS.map(([label, source, parameters], index) => Object.freeze({
	id: `equation-semantic-${String(index + 1).padStart(3, '0')}`,
	family: 'equations',
	gallery: 'equation-semantic-structures',
	kind: 'equation',
	tileIndex: index + 1,
	label,
	description: `${label} native editable Office Math structure with explicit semantic slots.`,
	parameters,
	recipe: Object.freeze({ sourceFormat: 'template', source: Object.freeze({ ...source }) }),
})))

export const EQUATION_GALLERY_PRESETS = Object.freeze([
	...EQUATION_RIBBON_GALLERY_PRESETS,
	...EQUATION_SEMANTIC_GALLERY_PRESETS,
])

export const SOURCE_API_GALLERY_PRESETS = Object.freeze([
	...LAYOUT_THEME_MASTER_PRESETS,
	...TRANSITION_GALLERY_PRESETS,
	...CONNECTOR_STYLE_PRESETS,
	...EQUATION_GALLERY_PRESETS,
])

function byId(rows, id) {
	return rows.find(item => item.id === String(id)) || null
}

export function sourceApiGalleryPresetById(id) {
	return byId(SOURCE_API_GALLERY_PRESETS, id)
}

function templateResourceByPresetId(id) {
	const value = String(id || '')
	return Object.values(TEMPLATE_RESOURCES).find(resource => resource.id === value) || null
}

function templateSelectionById(id) {
	if (id == null || String(id).trim() === '') return null
	const preset = byId(LAYOUT_THEME_MASTER_PRESETS, id)
	if (preset) return { preset, recipe: preset.recipe }
	const resource = templateResourceByPresetId(id)
	if (resource) return { preset: null, recipe: templateRecipe(Object.keys(TEMPLATE_RESOURCES).find(key => TEMPLATE_RESOURCES[key] === resource)) }
	throw new Error(`Unknown layout/theme/master gallery preset: ${id}`)
}

// Resolve only the exact public selections made by the AI.  This function does
// not recommend a theme, master, or layout: it binds the requested opaque IDs
// to their bundled native resource and fails when one deck requests layouts
// from incompatible master resources.
export function resolveLayoutThemeMasterSpec(spec = {}) {
	if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return spec
	const template = spec.template && typeof spec.template === 'object' ? { ...spec.template } : {}
	if (Object.prototype.hasOwnProperty.call(spec, 'masterPresetId')
		&& (typeof spec.masterPresetId !== 'string' || spec.masterPresetId.trim() === '')) {
		throw new Error('masterPresetId must be one of the non-null bundled master preset IDs; replace the deck to remove or switch its master resource.')
	}
	if (Object.prototype.hasOwnProperty.call(spec, 'themePresetId')
		&& (typeof spec.themePresetId !== 'string' || spec.themePresetId.trim() === '')) {
		throw new Error('themePresetId must be one of the non-null bundled theme preset IDs; use theme:null to restore the selected source theme, or replace the deck to remove its template resource.')
	}
	const rootIds = [
		spec.templatePresetId,
		spec.themePresetId,
		spec.masterPresetId,
		template.templatePresetId,
		template.themePresetId,
		template.masterPresetId,
	].filter(value => value != null && String(value).trim() !== '')
	const selected = rootIds.map(templateSelectionById)
	for (const [field, value, expectedKind] of [
		['themePresetId', spec.themePresetId, 'theme'],
		['masterPresetId', spec.masterPresetId, 'master'],
		['template.themePresetId', template.themePresetId, 'theme'],
		['template.masterPresetId', template.masterPresetId, 'master'],
	]) {
		if (value == null || String(value).trim() === '') continue
		const selection = templateSelectionById(value)
		if (selection.preset?.kind !== expectedKind) {
			throw new Error(`${field} must identify a ${expectedKind} gallery preset: ${value}`)
		}
	}
	const slides = (spec.slides || []).map(slide => {
		if (!slide || typeof slide !== 'object' || Array.isArray(slide)) return slide
		const hasCanonicalPreset = Object.prototype.hasOwnProperty.call(slide, 'layoutPresetId')
		const presetId = hasCanonicalPreset ? slide.layoutPresetId : slide.nativeLayoutPresetId
		if (hasCanonicalPreset && presetId == null && slide.layoutName != null) {
			throw new Error(`Conflicting slide layout selectors: layoutPresetId null requests the template default, not "${slide.layoutName}".`)
		}
		if (!presetId) return { ...slide }
		const match = templateSelectionById(presetId)
		if (match.preset?.kind !== 'layout' || !match.recipe.layoutName) throw new Error(`Gallery preset is not a slide layout: ${presetId}`)
		if (Object.prototype.hasOwnProperty.call(slide, 'layoutName') && slide.layoutName !== match.recipe.layoutName) {
			throw new Error(`Conflicting slide layout selectors: layoutPresetId ${presetId} resolves to "${match.recipe.layoutName}", not "${slide.layoutName}".`)
		}
		selected.push(match)
		return { ...slide, layoutName: match.recipe.layoutName }
	})
	if (!selected.length) return { ...spec, slides }

	const explicitResource = selected.map(item => item.recipe.resourceKey).filter(Boolean)
	const nonThemeResources = selected
		.filter(item => item.preset?.kind !== 'theme')
		.map(item => item.recipe.resourceKey)
		.filter(Boolean)
	const unique = [...new Set(nonThemeResources.length ? nonThemeResources : explicitResource)]
	if (unique.length !== 1) throw new Error(`Selected layout/master presets require different template resources: ${unique.join(', ')}`)
	const resourceKey = unique[0]
	const resource = TEMPLATE_RESOURCES[resourceKey]
	if (!resource) throw new Error(`Unknown bundled template resource: ${resourceKey}`)
	for (const requestedThemePresetId of [spec.themePresetId, template.themePresetId].filter(value => value != null && String(value).trim() !== '')) {
		if (String(requestedThemePresetId) !== String(resource.themeId)) {
			throw new Error(`Theme preset ${requestedThemePresetId} is not available from bundled template resource ${resource.id}.`)
		}
	}
	if ((template.path || template.templatePath || template.handle || template.templateHandle) && !template.templatePresetId) {
		throw new Error('Do not combine a bundled layout/theme/master preset with an unrelated explicit template source.')
	}
	return {
		...spec,
		template: {
			...template,
			templatePresetId: resource.id,
			path: resource.path,
			preserveLayouts: true,
			enforceLayoutPolicy: true,
			strictLayout: true,
			defaultLayout: resource.defaultLayout,
		},
		slides,
	}
}

export function resolveTransitionPreset(transition) {
	if (!transition || typeof transition !== 'object') return transition || null
	const presetId = transition.transitionPresetId || transition.presetId
	let resolved
	if (!presetId) {
		resolved = { ...transition }
	} else {
		const preset = byId(TRANSITION_GALLERY_PRESETS, presetId)
		if (!preset) throw new Error(`Unknown transition gallery preset: ${presetId}`)
		const overrides = { ...transition }
		delete overrides.transitionPresetId
		delete overrides.presetId
		resolved = { ...preset.recipe, ...overrides }
	}
	// The semantic compiler and art-direction layer use the readable durationMs
	// alias, while DrawingML's transition serializer consumes duration. Normalize
	// once at the native boundary so authored timing is never silently dropped.
	if (resolved.duration === undefined && resolved.durationMs != null && Number.isFinite(Number(resolved.durationMs))) resolved.duration = Number(resolved.durationMs)
	delete resolved.durationMs
	return resolved
}

function connectorStyleStateForPreset(preset, resolvedState = null) {
	if (resolvedState?.schemaVersion === 'betterpptx.connector-style-state.v1' && resolvedState.connectorStylePresetId === preset.id) {
		return Object.freeze({
			schemaVersion: resolvedState.schemaVersion,
			connectorStylePresetId: preset.id,
			themeStyle: preset.themeStyle,
			presetLineDefaults: preset.lineDefaults,
			authoredLineOverrides: Object.freeze(structuredClone(resolvedState.authoredLineOverrides || {})),
			effectiveLine: Object.freeze(structuredClone(resolvedState.effectiveLine || { ...preset.lineDefaults, ...(resolvedState.authoredLineOverrides || {}) })),
		})
	}
	return Object.freeze({
		schemaVersion: 'betterpptx.connector-style-state.v1',
		connectorStylePresetId: preset.id,
		themeStyle: preset.themeStyle,
		presetLineDefaults: preset.lineDefaults,
		authoredLineOverrides: Object.freeze({}),
		effectiveLine: preset.lineDefaults,
	})
}

export function applyConnectorStylePreset(options = {}, presetId, resolvedState = null) {
	if (presetId == null || String(presetId).trim() === '') return { options: { ...options }, preset: null }
	const preset = byId(CONNECTOR_STYLE_PRESETS, presetId)
	if (!preset) throw new Error(`Unknown connector gallery preset: ${presetId}`)
	const clean = { ...options }
	delete clean.connectorStylePresetId
	delete clean._connectorStyleState
	// The exact preset wins over a generic fallback line produced by the semantic
	// compiler. Geometry, endpoints, and naming remain caller-owned.
	const state = connectorStyleStateForPreset(preset, resolvedState)
	return { options: { ...clean, ...preset.recipe, _connectorStyleState: state }, preset, state }
}

export function applyConnectorStyleComposition(options = {}, state) {
	if (!state || state.schemaVersion !== 'betterpptx.connector-style-state.v1') throw new Error('Connector style composition requires a normalized connector style state.')
	const clean = { ...options }
	delete clean.connectorStylePresetId
	delete clean._rawConnectorLineXml
	delete clean._rawConnectorStyleXml
	delete clean._connectorStyleState
	if (!state.connectorStylePresetId) {
		return {
			options: { ...clean, line: structuredClone(state.effectiveLine || {}), _connectorStyleState: state },
			preset: null,
			state,
		}
	}
	const applied = applyConnectorStylePreset(clean, state.connectorStylePresetId, state)
	return { ...applied, options: { ...applied.options, line: structuredClone(state.effectiveLine || {}) } }
}

export function applyEquationGalleryPreset(options = {}, presetId, parameters = {}) {
	if (presetId == null || String(presetId).trim() === '') return { options: { ...options }, preset: null }
	const preset = byId(EQUATION_GALLERY_PRESETS, presetId)
	if (!preset) throw new Error(`Unknown equation gallery preset: ${presetId}`)
	const source = structuredClone(preset.recipe.source)
	for (const parameter of preset.parameters || []) {
		if (parameters[parameter] !== undefined) source[parameter] = parameters[parameter]
	}
	const clean = { ...options }
	delete clean.equationGalleryPresetId
	delete clean.equationPresetId
	delete clean.parameters
	return { options: { ...clean, ...preset.recipe, source }, preset }
}

export function publicSourceApiGalleryPresets() {
	return SOURCE_API_GALLERY_PRESETS.map(({ recipe: _privateRecipe, themeStyle: _privateThemeStyle, lineDefaults: _privateLineDefaults, ...entry }) => ({ ...entry }))
}
