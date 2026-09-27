// AI-authored native-capability selection contract.
//
// The AI remains the presentation designer.  This module does not rank, choose,
// or beautify anything.  It only turns the AI's already-resolved choices into a
// deterministic execution contract, prefers editable native PowerPoint objects
// when they can express the intent, and produces readback that can be checked
// again against the saved package.

import { resolveTransitionPreset, sourceApiGalleryPresetById } from '../source-api-gallery-presets.mjs'
import { model3dViewPresetById } from '../model3d-view-presets.mjs'
import { VISUAL_REFERENCE_RECONSTRUCTION_CONTRACT } from './visual-reference-reconstruction.mjs'

export const AI_SELECTION_MANIFEST_VERSION = 'betterpptx.ai-selection-manifest.v1'

export const NATIVE_FIRST_AUTHORING_POLICY = Object.freeze({
	designAuthority: 'ai',
	selectionAuthority: 'ai',
	engineRole: 'catalog-executor-package-verifier',
	nativePreference: 'native-when-available',
	customFallback: 'explicit-specific-reason-required',
	noSilentSubstitution: true,
	coherenceOwner: 'ai',
})

const CHART_SELECTOR_KEYS = Object.freeze([
	'chartPresetId', 'chartGalleryTilePresetId', 'chartStylePresetId',
	'chartGalleryVariant', 'chartStyleId', 'chartStyleModernId',
	'chartColorStyleId', 'chartLayoutPresetId', 'chartTreatmentPresetId',
	'chartTreatmentPresetIds',
])

const TABLE_SELECTOR_KEYS = Object.freeze(['tableStylePresetId', 'tableStyleId'])
const SMARTART_SELECTOR_KEYS = Object.freeze([
	'layoutId', 'layoutName', 'quickStyleId', 'quickStyleName',
	'colorStyleId', 'colorStyleName', 'rightToLeft',
])
const WORDART_SELECTOR_KEYS = Object.freeze([
	'wordArtStylePresetId', 'textEffectPresetId', 'textEffectPresetIds',
	'transform', 'text3D', 'effect3D',
])
const SHAPE_SELECTOR_KEYS = Object.freeze([
	'shapeStylePresetId', 'shapeEffectPresetId', 'shapeEffectPresetIds',
	'textEffectPresetId', 'textEffectPresetIds', 'effect3D',
])
const PICTURE_SELECTOR_KEYS = Object.freeze(['pictureStylePresetId'])
const MODEL3D_SELECTOR_KEYS = Object.freeze(['model3dViewPresetId'])
const CONNECTOR_SELECTOR_KEYS = Object.freeze(['connectorStylePresetId'])
const EQUATION_SELECTOR_KEYS = Object.freeze(['equationGalleryPresetId', 'equationPresetId'])
const SLIDE_LAYOUT_SELECTOR_KEYS = Object.freeze(['layoutPresetId', 'layoutName'])
const TRANSITION_SELECTOR_KEYS = Object.freeze(['transitionPresetId', 'presetId'])

const SELECTOR_KEYS_BY_CAPABILITY = Object.freeze({
	chart: CHART_SELECTOR_KEYS,
	table: TABLE_SELECTOR_KEYS,
	smartart: SMARTART_SELECTOR_KEYS,
	wordart: WORDART_SELECTOR_KEYS,
	shape: SHAPE_SELECTOR_KEYS,
	picture: PICTURE_SELECTOR_KEYS,
	model3d: MODEL3D_SELECTOR_KEYS,
	connector: CONNECTOR_SELECTOR_KEYS,
	equation: EQUATION_SELECTOR_KEYS,
	'layout': SLIDE_LAYOUT_SELECTOR_KEYS,
	'transition': TRANSITION_SELECTOR_KEYS,
})

const CONTENT_FIELDS_NOT_SELECTORS = Object.freeze({
	chart: ['chartType'],
	table: ['header', 'rows'],
	smartart: ['nodes', 'layout'],
})

const CAPABILITY_ALIASES = Object.freeze({
	charts: 'chart', chartex: 'chart',
	tables: 'table',
	diagram: 'smartart', 'smart-art': 'smartart',
	'word-art': 'wordart', text3d: 'wordart',
	shapes: 'shape', gradient: 'shape', gradients: 'shape', shape3d: 'shape',
	image: 'picture', photo: 'picture',
	'3d': 'model3d', model: 'model3d',
	math: 'equation',
	'slide-layout': 'layout',
	transitions: 'transition',
})

function clone(value) {
	return value == null ? value : JSON.parse(JSON.stringify(value))
}

function normalizedCapability(value) {
	const raw = String(value || '').trim().toLowerCase().replace(/[\s_]+/g, '-')
	return CAPABILITY_ALIASES[raw] || raw
}

function normalizedRepresentation(value) {
	const raw = String(value || 'native').trim().toLowerCase()
	if (['native', 'powerpoint-native', 'editable-native'].includes(raw)) return 'native'
	if (['custom', 'shape-built', 'visual-adapted'].includes(raw)) return 'custom'
	return raw
}

function targetName(selection = {}) {
	return String(selection.target || selection.targetName || selection.blockName || selection.objectName || '').trim()
}

function capabilityForBlock(block = {}) {
	const kind = String(block.kind || '').trim().toLowerCase()
	if (['chart', 'chart-panel'].includes(kind)) return 'chart'
	if (['table', 'table-panel'].includes(kind)) return 'table'
	if (['smartart', 'diagram'].includes(kind)) return 'smartart'
	if (['wordart', 'text3d'].includes(kind)) return 'wordart'
	if (['shape', 'freeform', 'textshape', 'callout'].includes(kind)) return 'shape'
	if (['image', 'image-feature', 'photo', 'picture'].includes(kind)) return 'picture'
	if (kind === 'model3d') return 'model3d'
	if (kind === 'connector') return 'connector'
	if (kind === 'equation') return 'equation'
	return kind
}

function meaningfulReason(value) {
	const text = String(value || '').trim()
	if (text.length < 16) return false
	return !/^(custom|required|needed|better|design|n\/a|none|fallback)$/i.test(text)
}

function valuesEqual(left, right) {
	return JSON.stringify(left) === JSON.stringify(right)
}

function issue(code, message, path, extra = {}) {
	return { code, message, path, severity: 'error', ...extra }
}

function manifestSelections(spec = {}) {
	return Array.isArray(spec.selectionManifest?.selections) ? spec.selectionManifest.selections : []
}

function customReasonForBlock(spec, slideId, block = {}) {
	const name = String(block.name || block.objectName || '').trim()
	const match = manifestSelections(spec).find(selection =>
		String(selection?.slideId || '').trim() === String(slideId || '').trim()
		&& targetName(selection) === name
		&& normalizedRepresentation(selection?.representation) === 'custom')
	return String(block.customReason || block.customRequirement || match?.customReason || '').trim()
}

export function aiSelectionManifestIssues(spec = {}) {
	const issues = []
	const manifest = spec.selectionManifest
	if (manifest !== undefined && (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))) {
		return [issue('AI_SELECTION_MANIFEST_INVALID', 'selectionManifest must be an object.', 'selectionManifest')]
	}
	if (manifest?.schemaVersion && manifest.schemaVersion !== AI_SELECTION_MANIFEST_VERSION) {
		issues.push(issue('AI_SELECTION_MANIFEST_VERSION_UNSUPPORTED', `selectionManifest.schemaVersion must be "${AI_SELECTION_MANIFEST_VERSION}".`, 'selectionManifest.schemaVersion'))
	}
	const enforcement = String(manifest?.enforcement || 'advisory').toLowerCase()
	if (!['advisory', 'required'].includes(enforcement)) {
		issues.push(issue('AI_SELECTION_MANIFEST_ENFORCEMENT_INVALID', 'selectionManifest.enforcement must be "advisory" or "required".', 'selectionManifest.enforcement'))
	}
	const slides = Array.isArray(spec.slides) ? spec.slides : []
	const slideById = new Map(slides.map((slide, index) => [String(slide?.id || `slide-${index + 1}`), { slide, index }]))
	const seen = new Set()
	for (let index = 0; index < manifestSelections(spec).length; index += 1) {
		const selection = manifestSelections(spec)[index] || {}
		const basePath = `selectionManifest.selections[${index}]`
		const capability = normalizedCapability(selection.capability)
		const representation = normalizedRepresentation(selection.representation)
		const slideId = String(selection.slideId || '').trim()
		const target = targetName(selection)
		if (!capability || !SELECTOR_KEYS_BY_CAPABILITY[capability]) {
			issues.push(issue('AI_SELECTION_CAPABILITY_INVALID', 'Each selection must name a supported capability family.', `${basePath}.capability`, { capability }))
		}
		if (!['native', 'custom'].includes(representation)) {
			issues.push(issue('AI_SELECTION_REPRESENTATION_INVALID', 'selection.representation must be "native" or "custom".', `${basePath}.representation`))
		}
		if (representation === 'custom' && !meaningfulReason(selection.customReason)) {
			issues.push(issue('AI_CUSTOM_REASON_REQUIRED', 'A custom representation is allowed only with a specific reason explaining why native PowerPoint cannot express the intended result.', `${basePath}.customReason`))
		}
		if (enforcement === 'required' && !meaningfulReason(selection.coherenceReason || selection.reason || selection.intent)) {
			issues.push(issue('AI_SELECTION_COHERENCE_REQUIRED', 'A required selection must record the AI design rationale that makes it coherent with the story, audience, theme, and density.', `${basePath}.coherenceReason`))
		}
		const slideLevel = capability === 'layout' || capability === 'transition'
		if (!slideId) issues.push(issue('AI_SELECTION_SLIDE_REQUIRED', 'Each selection must identify its slideId.', `${basePath}.slideId`))
		const slideRef = slideById.get(slideId)
		if (slideId && !slideRef) issues.push(issue('AI_SELECTION_SLIDE_NOT_FOUND', `Selection slideId "${slideId}" does not exist.`, `${basePath}.slideId`))
		if (!slideLevel && !target) issues.push(issue('AI_SELECTION_TARGET_REQUIRED', 'Object selections must target a stable content[].name or content[].objectName.', `${basePath}.target`))
		if (slideRef && !slideLevel && target) {
			const blocks = (slideRef.slide.content || []).filter(block => [block?.name, block?.objectName].some(value => String(value || '').trim() === target))
			if (blocks.length !== 1) {
				issues.push(issue(blocks.length ? 'AI_SELECTION_TARGET_AMBIGUOUS' : 'AI_SELECTION_TARGET_NOT_FOUND', `Selection target "${target}" must resolve to exactly one content block on slide "${slideId}".`, `${basePath}.target`, { matches: blocks.length }))
			} else if (capability && capabilityForBlock(blocks[0]) !== capability) {
				issues.push(issue('AI_SELECTION_CAPABILITY_MISMATCH', `Selection capability "${capability}" does not match target block kind "${blocks[0].kind}".`, `${basePath}.capability`, { target, blockKind: blocks[0].kind }))
			}
		}
		const selectorKeys = Object.keys(selection.selectors && typeof selection.selectors === 'object' && !Array.isArray(selection.selectors) ? selection.selectors : {})
		const allowed = new Set(SELECTOR_KEYS_BY_CAPABILITY[capability] || [])
		for (const key of selectorKeys) {
			if (!allowed.has(key)) issues.push(issue('AI_SELECTION_SELECTOR_INVALID', `Selector "${key}" is not part of the ${capability || 'unknown'} capability contract.`, `${basePath}.selectors.${key}`))
			if (key === 'model3dViewPresetId' && model3dViewPresetById(selection.selectors[key]) == null) {
				issues.push(issue('AI_SELECTION_MODEL3D_VIEW_INVALID', `Model 3-D view selector "${selection.selectors[key]}" is not one of the captured native view IDs.`, `${basePath}.selectors.${key}`))
			}
		}
		if (representation === 'native' && enforcement === 'required' && selectorKeys.length === 0 && !(Array.isArray(selection.nativeFeatures) && selection.nativeFeatures.length)) {
			issues.push(issue('AI_NATIVE_SELECTION_EMPTY', 'A required native selection must include an exact catalog selector or an explicit nativeFeatures list.', `${basePath}.selectors`))
		}
		const uniquenessKey = [slideId, target || '@slide', capability].join('|')
		if (seen.has(uniquenessKey)) issues.push(issue('AI_SELECTION_DUPLICATE', 'Only one resolved selection is allowed for a capability target.', basePath, { slideId, target, capability }))
		seen.add(uniquenessKey)
	}

	// Native-first is a platform rule, independent of whether a manifest was
	// supplied.  Shape-built SmartArt/diagram rendering is a custom exception and
	// therefore must carry an explicit, specific reason.
	for (let slideIndex = 0; slideIndex < slides.length; slideIndex += 1) {
		const slide = slides[slideIndex] || {}
		for (let blockIndex = 0; blockIndex < (slide.content || []).length; blockIndex += 1) {
			const block = slide.content[blockIndex] || {}
			if (!['smartart', 'diagram'].includes(String(block.kind || '').toLowerCase())) continue
			const mode = String(block.mode || (block.native === false ? 'shape' : 'native')).toLowerCase()
			if (['shape', 'custom', 'shape-built'].includes(mode) && !meaningfulReason(customReasonForBlock(spec, slide.id, block))) {
				issues.push(issue('AI_CUSTOM_REASON_REQUIRED', 'Native SmartArt is preferred. A shape-built diagram requires a specific AI-authored reason explaining why the native object is insufficient.', `slides[${slideIndex}].content[${blockIndex}].customReason`))
			}
		}
	}
	return issues
}

function failOnIssues(spec) {
	const issues = aiSelectionManifestIssues(spec)
	if (!issues.length) return
	const error = new Error(issues[0].message)
	error.code = issues[0].code
	error.issues = issues
	throw error
}

function assignWithoutConflict(target, key, value, path) {
	if (target[key] !== undefined && !valuesEqual(target[key], value)) {
		const error = new Error(`AI selection conflicts with an already-authored value at ${path}.`)
		error.code = 'AI_SELECTION_CONFLICT'
		error.issues = [issue('AI_SELECTION_CONFLICT', error.message, path, { authoredValue: target[key], selectedValue: value })]
		throw error
	}
	target[key] = clone(value)
}

function applyObjectSelection(block, capability, representation, selectors, selectionPath, customReason) {
	if (representation === 'custom') {
		block.customReason = customReason
		if (capability === 'smartart') block.mode = 'shape'
		return
	}
	if (capability === 'smartart') block.mode = 'native'
	if (capability === 'model3d') block.preferNative = true
	if (capability === 'chart') {
		block.chartOptions ||= {}
		for (const [key, value] of Object.entries(selectors)) assignWithoutConflict(block.chartOptions, key, value, `${selectionPath}.selectors.${key}`)
		return
	}
	if (capability === 'table') {
		block.tableOptions ||= {}
		for (const [key, value] of Object.entries(selectors)) assignWithoutConflict(block.tableOptions, key, value, `${selectionPath}.selectors.${key}`)
		return
	}
	for (const [key, value] of Object.entries(selectors)) assignWithoutConflict(block, key, value, `${selectionPath}.selectors.${key}`)
}

/**
 * Apply the AI's resolved manifest to a cloned spec.  This is execution only:
 * no selection is invented and no conflicting authored value is overwritten.
 */
export function materializeAiSelectionManifest(inputSpec = {}) {
	failOnIssues(inputSpec)
	const spec = clone(inputSpec)
	const sourceManifest = spec.selectionManifest
	const explicit = Boolean(sourceManifest)
	const manifest = {
		schemaVersion: AI_SELECTION_MANIFEST_VERSION,
		enforcement: String(sourceManifest?.enforcement || 'advisory').toLowerCase(),
		policy: { ...NATIVE_FIRST_AUTHORING_POLICY, ...(sourceManifest?.policy || {}) },
		selections: clone(sourceManifest?.selections || []),
	}
	const slideById = new Map((spec.slides || []).map((slide, index) => [String(slide.id || `slide-${index + 1}`), { slide, index }]))
	for (let index = 0; index < manifest.selections.length; index += 1) {
		const selection = manifest.selections[index]
		const capability = normalizedCapability(selection.capability)
		const representation = normalizedRepresentation(selection.representation)
		const slideRef = slideById.get(String(selection.slideId || '').trim())
		const selectors = selection.selectors && typeof selection.selectors === 'object' && !Array.isArray(selection.selectors) ? selection.selectors : {}
		if (capability === 'layout') {
			for (const [key, value] of Object.entries(selectors)) assignWithoutConflict(slideRef.slide, key, value, `selectionManifest.selections[${index}].selectors.${key}`)
			continue
		}
		if (capability === 'transition') {
			slideRef.slide.transition ||= {}
			for (const [key, value] of Object.entries(selectors)) assignWithoutConflict(slideRef.slide.transition, key, value, `selectionManifest.selections[${index}].selectors.${key}`)
			continue
		}
		const target = targetName(selection)
		const block = (slideRef.slide.content || []).find(item => [item?.name, item?.objectName].some(value => String(value || '').trim() === target))
		applyObjectSelection(block, capability, representation, selectors, `selectionManifest.selections[${index}]`, String(selection.customReason || '').trim())
	}

	// Native is the default representation whenever the semantic family has a
	// native PowerPoint object.  This is not a style choice; the AI still chooses
	// the exact layout/style/color/effect IDs and all visual composition.
	for (const slide of spec.slides || []) {
		for (const block of slide.content || []) {
			if (!['smartart', 'diagram'].includes(String(block?.kind || '').toLowerCase())) continue
			if (block.mode === undefined && block.native === undefined) block.mode = 'native'
		}
	}
	spec.selectionManifest = manifest
	return { spec, manifest, source: explicit ? 'ai-authored' : 'legacy-implicit' }
}

function operationSelectorContainer(capability, operation) {
	if (!operation) return null
	if (['chart', 'table', 'wordart', 'shape', 'picture', 'model3d', 'connector', 'equation'].includes(capability)) return operation.args?.options || operation.args || null
	if (capability === 'smartart') return operation.args || null
	if (capability === 'layout' || capability === 'transition') return operation.args || null
	return operation.args || null
}

function expectedTool(capability, object = {}) {
	if (capability === 'shape' && object?.primitive === 'textShape') return 'betterpptx.slide.add_text'
	return {
		chart: 'betterpptx.slide.add_chart',
		table: 'betterpptx.slide.add_table',
		smartart: 'betterpptx.slide.add_smartart',
		wordart: 'betterpptx.slide.add_text',
		shape: 'betterpptx.slide.add_shape',
		picture: 'betterpptx.slide.add_image',
		model3d: 'betterpptx.slide.add_model3d',
		connector: 'betterpptx.slide.add_connector',
		equation: 'betterpptx.slide.add_equation',
		layout: 'betterpptx.slide.add',
		transition: 'betterpptx.slide.add',
	}[capability]
}

/** Build the pre-generation selected-ID forwarding proof used by dry-run and save. */
export function buildAiSelectionExecutionReadback({ manifest, source = 'ai-authored', plan, operations } = {}) {
	const selections = []
	const errors = []
	for (let index = 0; index < (manifest?.selections || []).length; index += 1) {
		const selection = manifest.selections[index]
		const capability = normalizedCapability(selection.capability)
		const representation = normalizedRepresentation(selection.representation)
		const target = targetName(selection)
		const slidePlan = (plan?.slides || []).find(slide => String(slide.slideId) === String(selection.slideId))
		const object = (slidePlan?.objects || []).find(item => [item?.blockName, item?.objectName].some(value => String(value || '') === target))
		const tool = expectedTool(capability, object)
		const operation = capability === 'layout' || capability === 'transition'
			? (operations || []).find(item => item.tool === tool && item.slideId === selection.slideId)
			: (operations || []).find(item => item.tool === tool && item.slideId === selection.slideId && item.objectName === object?.objectName)
		const container = operationSelectorContainer(capability, operation)
		const requestedSelectors = clone(selection.selectors || {})
		const forwardedSelectors = {}
		const missingSelectors = []
		for (const [key, value] of Object.entries(requestedSelectors)) {
			let actual = container?.[key] ?? operation?.args?.[key]
			if (capability === 'layout' && key === 'layoutPresetId') {
				const preset = sourceApiGalleryPresetById(value)
				actual = preset?.recipe?.layoutName && operation?.args?.layoutName === preset.recipe.layoutName ? value : undefined
			}
			if (capability === 'transition' && ['transitionPresetId', 'presetId'].includes(key)) {
				let expected = null
				try { expected = resolveTransitionPreset({ transitionPresetId: value }) } catch { expected = null }
				actual = expected && valuesEqual(operation?.args?.transition, expected) ? value : undefined
			}
			if (actual === undefined && capability === 'wordart' && key === 'transform') actual = container?.wordArt?.transform
			if (actual === undefined && capability === 'wordart' && key === 'text3D') actual = container?.text3D
			if (actual === undefined && capability === 'wordart' && key === 'effect3D') actual = container?.effect3D
			if (actual === undefined && key === 'shapeEffectPresetId') actual = container?.shapeEffectPresetIds
			if (actual === undefined && key === 'textEffectPresetId') actual = container?.textEffectPresetIds
			if (!valuesEqual(actual, value)) missingSelectors.push(key)
			else forwardedSelectors[key] = clone(actual)
		}
		const compiled = Boolean(operation) && missingSelectors.length === 0
		const entry = {
			selectionIndex: index,
			slideId: selection.slideId,
			slideIndex: Number.isInteger(slidePlan?.slideIndex) ? slidePlan.slideIndex : null,
			target,
			resolvedObjectName: object?.objectName || null,
			chartType: capability === 'chart' ? (object?.chartType || null) : null,
			capability,
			representation,
			intent: String(selection.intent || '').trim() || null,
			coherenceReason: String(selection.coherenceReason || selection.reason || '').trim() || null,
			customReason: representation === 'custom' ? String(selection.customReason || '').trim() || null : null,
			requestedSelectors,
			forwardedSelectors,
			nativeFeatures: Array.isArray(selection.nativeFeatures) ? selection.nativeFeatures.map(String) : [],
			status: compiled ? 'compiled-exactly' : 'not-compiled',
			...(missingSelectors.length ? { missingSelectors } : {}),
		}
		selections.push(entry)
		if (!compiled) errors.push({ code: 'AI_SELECTION_NOT_COMPILED', slideId: selection.slideId, target, capability, missingSelectors, operationFound: Boolean(operation) })
	}
	const enforcement = String(manifest?.enforcement || 'advisory').toLowerCase()
	if (enforcement === 'required' && errors.length) {
		const error = new Error('One or more AI-authored capability selections did not reach the executable operation plan.')
		error.code = 'AI_SELECTION_NOT_COMPILED'
		error.issues = errors
		throw error
	}
	return {
		schemaVersion: AI_SELECTION_MANIFEST_VERSION,
		status: source === 'ai-authored' ? (errors.length ? 'AI_SELECTION_FORWARDING_FAILED' : 'AI_SELECTIONS_COMPILED') : 'LEGACY_IMPLICIT_SELECTIONS',
		source,
		enforcement,
		policy: { ...NATIVE_FIRST_AUTHORING_POLICY, ...(manifest?.policy || {}) },
		selectionCount: selections.length,
		compiledCount: selections.filter(entry => entry.status === 'compiled-exactly').length,
		selections,
		errors,
	}
}

export function publicSelectionManifestContract(capability) {
	const normalized = capability ? normalizedCapability(capability) : null
	const bindRule = 'Copy only listed selector keys into selectionManifest.selections[].selectors. Semantic content fields such as chartType belong on the content block, never in selectors.'
	if (!normalized || !SELECTOR_KEYS_BY_CAPABILITY[normalized]) {
		return {
			schemaVersion: AI_SELECTION_MANIFEST_VERSION,
			bindRule,
			selectorKeysByCapability: { ...SELECTOR_KEYS_BY_CAPABILITY },
			contentFieldsNotSelectors: { ...CONTENT_FIELDS_NOT_SELECTORS },
		}
	}
	return {
		schemaVersion: AI_SELECTION_MANIFEST_VERSION,
		capability: normalized,
		bindRule,
		selectorKeys: [...SELECTOR_KEYS_BY_CAPABILITY[normalized]],
		contentFieldsNotSelectors: [...(CONTENT_FIELDS_NOT_SELECTORS[normalized] || [])],
	}
}

export function publicNativeFirstAuthoringPolicy() {
	return {
		...NATIVE_FIRST_AUTHORING_POLICY,
		manifestSchemaVersion: AI_SELECTION_MANIFEST_VERSION,
		selectionManifestBindRule: 'Use only selector keys from the matching catalog selectionManifestContract. Semantic fields such as chartType belong on the content block.',
		visualReference: VISUAL_REFERENCE_RECONSTRUCTION_CONTRACT,
		htmlConversion: {
			role: 'explicit-secondary-route',
			input: 'spec.htmlConversion only',
			principal: false,
			g6bAiReconstructionEligible: false,
		},
	}
}
