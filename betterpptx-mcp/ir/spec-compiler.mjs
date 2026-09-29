import { deterministicPlanDigest, planDeckLayout, validateLayoutPlan, artDirectionInfo, artDirectionSelectionForSpec, gradientPolicyForArtDirection, accentPolicyForArtDirection, depthPolicyForArtDirection, specIsDark, artDataStyleForSpec, resolvedPaletteForSpec, legibilityReport, paletteHealth, textColorRolesForSpec, ensureAccentOnCanvas, artMotionForSpec, artVoiceForSpec, artBuildTempoForSpec, artEmphasisForSpec, artTypeEmphasisForSpec, artDepthForSpec, artStageForSpec, artIconForSpec, artPresenterForSpec, artImageTreatmentForSpec, artMediaMotionForSpec, authoringCompletenessForSpec, normalizeContentKindsInSpec, attachContentRepresentationAudit, assertContentRepresentationIntegrity } from './layout-engine.mjs'
import { expandPresenterDirective, expandCastDirective, expandPresenterPerformances, planPresenterGestures } from './presenter-director.mjs'
import { expandInteractions, planInteractions, proposeInteractions, publicInteractionContract, interactionPlanIssues, resolveInteractionTargetGeometry } from './synergy-compiler.mjs'
import { expandAnimatedTables } from './animated-table.mjs'
import { applyMotionPolicy, normalizeMotionPolicy, soleCarrierReport } from './motion-policy.mjs'
import { planStoryArc } from './story-director.mjs'
import { buildVisualGenerationPlan, publicVisualDirection, routeVisualNeed } from './visual-director.mjs'
import { getCachedGeneratedRigged3d, parseGenRigged3dHandle, materializeKineticPresenter, materializeAuthoringMotionPresenter, materializePresenterPerformance } from '../assets/model3d-gen-providers.mjs'
import { normalizePresenterPerformance, PRESENTER_PERFORMANCE_CONTRACT } from '../presenter-performance-contract.mjs'
import { materializeDefaultPresenterForSpec, registerPublicDefaultPresenterDerivation } from '../assets/default-presenter-roster.mjs'
import { presenterContractForSpec, applyPresenterRepresentationPolicy } from './presenter-contract.mjs'
import { lowerPresenterRuntime } from './presenter-runtime-director.mjs'
import { applyNativeStylePreset } from '../native-style-presets.mjs'
import { applyShapeEffectPresets, applyTextEffectPresets } from '../native-effect-presets.mjs'
import { applyShapeFormattingToOptions } from '../native-formatting-contract.mjs'
import { normalizeBulletOptions, normalizeCharSpacing, normalizeImageSizing, normalizeIndentLevel, normalizeLineSpacing, normalizeLineSpacingMultiple, normalizeObjectFlip, normalizeObjectRotation, normalizeParagraphIndent, normalizeParagraphSpacing, normalizeRichRunOptions, normalizeTabStops, normalizeTextAlignment, normalizeTextBoxMargin, normalizeTextDirection, normalizeTextFill, normalizeTextFit, normalizeTextHyperlink, normalizeTextLanguage, normalizeTextOutline, normalizeTextRtlMode, normalizeTextUnderline, normalizeTextVerticalAlign, normalizeTextWrap, normalizeWordArtOptions, validateAnimationFormatOptions, validateMediaFormatOptions, validatePublicMediaFormatOptions, validateSmartArtFormatOptions, validateTableCellOptions, validateTableFormatOptions, validateTransitionFormatOptions } from '../option-registry.mjs'
import { validateChartOptions } from '../chart-authoring-family-contract.mjs'
import { validateTableOptions, validateTableRows } from '../table-authoring-family-contract.mjs'
import { validateStructuralBlock, normalizeStructuralShapeLine } from '../structural-authoring-family-contract.mjs'
import { validateSmartArtBlock } from '../smartart-authoring-family-contract.mjs'
import { validateEquationBlock } from '../equation-authoring-family-contract.mjs'
import { normalizePictureStyle, pictureStylePresetById } from '../picture-style-presets.mjs'
import { model3dViewPresetById } from '../model3d-view-presets.mjs'
import { normalizeModel3dOptions } from '../model3d-authoring-family-contract.mjs'
import { model3dMotionFraming, validateModel3dMotionFramingOptions, motionFramingError } from '../model3d-motion-framing-contract.mjs'
import { normalizeStaticPose, model3dStaticPose, normalizeStaticPoseScene, staticPoseError } from '../presenter-static-pose-contract.mjs'
import { applyConnectorStyleComposition, applyEquationGalleryPreset, resolveLayoutThemeMasterSpec, resolveTransitionPreset } from '../source-api-gallery-presets.mjs'
import { connectorStylePublicReadback, normalizeConnectorLineOverrides, normalizeConnectorStylePresetId, resolveConnectorStyleComposition } from '../connector-style-contract.mjs'
import { CONNECTOR_EFFECT_FIELDS, connectorEffectsPublicReadback, normalizeConnectorEffects } from '../connector-effects-contract.mjs'
import { textFillCompatibilityOptions } from '../text-fill-contract.mjs'
import { buildAiSelectionExecutionReadback, materializeAiSelectionManifest, publicNativeFirstAuthoringPolicy } from './ai-selection-manifest.mjs'
import { lowerHtmlAuthoringSurface, promoteColumnHeadlines, applyPowerpointNiceties } from './html-slide-compiler.mjs'
import { VISUAL_REFERENCE_RECONSTRUCTION_VERSION, isVisualReferenceReconstruction, normalizeVisualReferenceReconstruction } from './visual-reference-reconstruction.mjs'
import { isAiAuthoredGeometrySpec, publicCompositionModes } from './authoring-geometry-policy.mjs'
import { isAiSovereignSpec, publicCreativeAuthorityModes } from './authoring-authority-policy.mjs'
import { htmlCssMotionUnmappedFindings } from './html-css-motion.mjs'
import {
	htmlFontSubstitutionFindings,
	htmlMorphRequiredPairFindings,
	htmlUnsupportedRepresentationFindings,
} from './html-representation.mjs'
import { applyEffectsArray, normalizeBlur, normalizeFillOverlay, normalizeGlow, normalizeImageAdjustments, normalizeReflection, normalizeShadow, normalizeSoftEdge, ARTISTIC_EFFECTS, ARTISTIC_EFFECT_PARAMETER_CATALOG, PICTURE_COLOR_ENDPOINT_PARAMETERS, PICTURE_COLOR_SCHEMES, PICTURE_CORRECTION_PARAMETERS, SHAPE_LINE_DASH_TYPES, SHAPE_LINE_ARROW_TYPES, SHAPE_LINE_ARROW_SIZE_VALUES } from './native-visual-primitives.mjs'
import { normalizeSlideBackground } from '../slide-background-contract.mjs'
import { materializeGeneratedTextureFill } from './generated-texture.mjs'
import { cuesToSynthesisSegments, mapCueProsody, narratedProfileRequested, normalizeNarrationForTts } from '../narration/tts-text.mjs'
import { authoredCuesFromNarration, buildNarrationCueLedger, findNonNativeCaptionOverlayField, materializeClosedCaptionTracks, NATIVE_MEDIA_CAPTION_CAPABILITY, nonNativeCaptionOverlayIssue, normalizeAuthoredCue } from './narration-contract.mjs'
import { inlineImageDimensions } from './inline-image-dimensions.mjs'
import { validateImageAccessibilityOptions, validateImageAltText } from '../image-accessibility-catalog.mjs'
import { validateImageAssetSource, validateNarrationProvider, validatePictureAdjuncts } from '../media-image-formatting-contract.mjs'
import { normalizeText3DOptions } from '../wordart-text3d-contract.mjs'
import { hasPublicAccessibilityMetadata, normalizeAccessibilityMetadata, normalizeInternalAccessibilityMetadata } from '../accessibility-metadata-contract.mjs'
import { normalizeHeaderFooterPolicy, normalizePlaceholderBinding, normalizePlaceholderDefinition, normalizeSlideNumberField } from '../layout-placeholder-variants-contract.mjs'
import { normalizeCustomShows, normalizeInteractiveActions } from '../interactive-actions-contract.mjs'
import { normalizeSlideZoomBlocksInSpec } from '../interactive-navigation-entry-contract.mjs'
import { normalizeSectionSummaryZoomSpec } from '../section-summary-zoom-entry-contract.mjs'
import { publicVerificationPolicy } from '../verification-policy.mjs'
import { normalizeSlideContinuities, bindSlideContinuitiesToPlan, assertSlideContinuityItemOperations, bindSlideContinuityItemPayloads, bindSlideContinuitiesToAuthoredActions, checkSlideContinuitiesAgainstKnownDeckStart, bindSlideContinuitiesToMeasuredDeckClock, bindSlideContinuitiesToQualifiedReleases, bindSlideContinuitiesToAuthoredNarration } from './slide-continuity-contract.mjs'
import { qualifiedContinuityReleaseByMotionId } from './qualified-continuity-release.mjs'

export const SPEC_COMPILER_VERSION = 'betterpptx.spec-compiler.v1'

// Dry-run and commit share this non-mutating argument check. It does not claim
// that serialization or PowerPoint playback will succeed; it prevents a valid
// source plan from carrying invalid native accessibility/rich-text arguments
// into a later primitive handler.
export function validateCompiledNativePrimitiveArguments(operations = []) {
	const carrierTools = new Set(['betterpptx.slide.add_text', 'betterpptx.slide.add_shape', 'betterpptx.slide.add_group'])
	const validateRuns = (value, path) => {
		if (value === undefined || value === null || typeof value === 'string') return
		if (!Array.isArray(value)) throw new Error(`${path} must be text or ordered rich runs.`)
		for (const [index, run] of value.entries()) {
			if (typeof run === 'string') continue
			if (!run || typeof run !== 'object' || Array.isArray(run) || typeof run.text !== 'string') throw new Error(`${path}[${index}].text must be a string.`)
			if (run.options !== undefined) normalizeRichRunOptions(run.options, `${path}[${index}].options`, { text: run.text })
		}
	}
	const validateGroupChildren = (children, path) => {
		if (!Array.isArray(children)) throw new Error(`${path} must be an ordered child array.`)
		for (const [index, child] of children.entries()) {
			const field = `${path}[${index}]`
			if (!child || typeof child !== 'object' || Array.isArray(child)) throw new Error(`${field} must be a native child object.`)
			normalizeInternalAccessibilityMetadata(child, field)
			if (child.kind === 'group') validateGroupChildren(child.children, `${field}.children`)
			else if (['text', 'textBox', 'textShape'].includes(child.kind)) validateRuns(child.text, `${field}.text`)
		}
	}
	for (const [index, operation] of operations.entries()) {
		if (!carrierTools.has(operation?.tool)) continue
		const field = `operations[${index}].args.options`
		const options = operation.args?.options
		if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error(`${field} must be a native options object.`)
		normalizeInternalAccessibilityMetadata(options, field)
		if (operation.tool === 'betterpptx.slide.add_text') validateRuns(operation.args?.text, `operations[${index}].args.text`)
		if (operation.tool === 'betterpptx.slide.add_group') validateGroupChildren(options.children, `${field}.children`)
	}
	return operations
}

const ACCESSIBILITY_OPTION_CARRIER_TOOLS = new Set([
	'betterpptx.slide.add_text',
	'betterpptx.slide.add_shape',
	'betterpptx.slide.add_connector',
	'betterpptx.slide.add_group',
	'betterpptx.slide.add_chart',
	'betterpptx.slide.add_table',
	'betterpptx.slide.add_image',
	'betterpptx.slide.add_model3d',
	'betterpptx.slide.add_cameo',
	'betterpptx.slide.add_media',
	'betterpptx.slide.add_ink',
	'betterpptx.slide.add_laser_pointer',
	'betterpptx.slide.add_zoom',
])

function collectAccessibilityMetadata(spec = {}) {
	const bySlide = new Map()
	for (const [slideIndex, slide] of (Array.isArray(spec.slides) ? spec.slides : []).entries()) {
		const byBlock = new Map()
		for (const [blockIndex, block] of (Array.isArray(slide?.content) ? slide.content : []).entries()) {
			if (!hasPublicAccessibilityMetadata(block)) continue
			const blockName = block.name || `block-${blockIndex + 1}`
			byBlock.set(blockName, normalizeAccessibilityMetadata(block, `slides[${slideIndex}].content[${blockIndex}]`))
		}
		if (byBlock.size) bySlide.set(slideIndex, byBlock)
	}
	return bySlide
}

function stripPublicAccessibilityMetadata(spec = {}) {
	return {
		...spec,
		slides: (Array.isArray(spec.slides) ? spec.slides : []).map(slide => ({
			...slide,
			content: (Array.isArray(slide?.content) ? slide.content : []).map(block => {
				if (!hasPublicAccessibilityMetadata(block)) return block
				const clean = { ...block }
				// Keep the historical layout-purpose decorative hint flowing through
				// scaffold retention/bleed/overlap while also lowering its accessibility
				// meaning to the collision-free internal isDecorative carrier.
				for (const key of ['title', 'altText', 'hiddenFromAccessibility']) delete clean[key]
				return clean
			}),
		})),
	}
}

function applyAccessibilityMetadataToOperation(operation, object, slideIndex, metadataBySlide) {
	const metadata = metadataBySlide.get(slideIndex)?.get(object.blockName)
	if (!metadata || !operation?.args) return operation
	const args = { ...operation.args }
	if (ACCESSIBILITY_OPTION_CARRIER_TOOLS.has(operation.tool)) {
		args.options = { ...(args.options || {}), ...metadata }
		if (metadata.isDecorative === true) {
			delete args.options.accessibilityTitle
			delete args.options.altText
		}
	} else {
		Object.assign(args, metadata)
		if (metadata.isDecorative === true) {
			delete args.accessibilityTitle
			delete args.altText
		}
	}
	return { ...operation, args }
}

const INTERACTIVE_ACTION_OPTION_CARRIER_TOOLS = new Set([
	'betterpptx.slide.add_text',
	'betterpptx.slide.add_shape',
	'betterpptx.slide.add_connector',
	'betterpptx.slide.add_group',
	'betterpptx.slide.add_chart',
	'betterpptx.slide.add_table',
	'betterpptx.slide.add_image',
	'betterpptx.slide.add_model3d',
	'betterpptx.slide.add_cameo',
	'betterpptx.slide.add_ink',
	'betterpptx.slide.add_laser_pointer',
])

const INTERACTIVE_ACTION_ROOT_CARRIER_TOOLS = new Set([
	'betterpptx.slide.add_smartart',
	'betterpptx.slide.add_equation',
	'betterpptx.slide.add_freeform',
])

function collectInteractiveActions(spec = {}, customShows) {
	const bySlide = new Map()
	const context = { slides: Array.isArray(spec.slides) ? spec.slides : [], customShows }
	for (const [slideIndex, slide] of (Array.isArray(spec.slides) ? spec.slides : []).entries()) {
		const byBlock = new Map()
		for (const [blockIndex, block] of (Array.isArray(slide?.content) ? slide.content : []).entries()) {
			if (!block || typeof block !== 'object' || Array.isArray(block) || !Object.prototype.hasOwnProperty.call(block, 'action')) continue
			const blockName = block.name || `block-${blockIndex + 1}`
			byBlock.set(blockName, normalizeInteractiveActions(block.action, context, `slides[${slideIndex}].content[${blockIndex}].action`))
		}
		if (byBlock.size) bySlide.set(slideIndex, byBlock)
	}
	return bySlide
}

function stripPublicInteractiveActions(spec = {}) {
	return {
		...spec,
		slides: (Array.isArray(spec.slides) ? spec.slides : []).map(slide => ({
			...slide,
			content: (Array.isArray(slide?.content) ? slide.content : []).map(block => {
				if (!block || typeof block !== 'object' || Array.isArray(block) || !Object.prototype.hasOwnProperty.call(block, 'action')) return block
				const clean = { ...block }
				delete clean.action
				return clean
			}),
		})),
	}
}

function applyInteractiveActionsToOperation(operation, object, slideIndex, actionsBySlide) {
	const byBlock = actionsBySlide.get(slideIndex)
	if (!byBlock?.has(object.blockName) || !operation?.args) return operation
	const interactiveActions = byBlock.get(object.blockName)
	if (operation.tool === 'betterpptx.slide.add_media' || operation.tool === 'betterpptx.slide.add_narration' || operation.tool === 'betterpptx.slide.add_avatar_narration') {
		if (interactiveActions !== null) throw new Error(`slides[${slideIndex}].content.${object.blockName}.action cannot be combined with media playback; media owns ppaction://media.`)
		return operation
	}
	const args = { ...operation.args }
	if (INTERACTIVE_ACTION_OPTION_CARRIER_TOOLS.has(operation.tool)) args.options = { ...(args.options || {}), interactiveActions }
	else if (INTERACTIVE_ACTION_ROOT_CARRIER_TOOLS.has(operation.tool)) args.interactiveActions = interactiveActions
	else throw new Error(`slides[${slideIndex}].content.${object.blockName}.action is not supported by ${operation.tool}; no action was silently dropped.`)
	return { ...operation, args }
}

// The presenter avatar's BAKED clipMap (intent->glTF animId). When the presenter model is a gen:// rigged-3D
// handle that was performed by the Baker, the in-process gen cache carries its manifest.clipMap — the frozen
// identity map. Seeding the director with it makes each intent resolve to its distinct baked clip instead of
// collapsing to clip 0. Returns null for third-party GLBs / uncached handles (director keeps DEFAULT_CLIPMAP).
function avatarClipMapForSpec(spec, worldPresenter) {
	const p = spec && typeof spec === 'object' ? spec.presenter : null
	const model = (p && (p.model || p.avatar || p.glb)) || (worldPresenter && worldPresenter.model) || ''
	const parsed = parseGenRigged3dHandle(model)
	if (!parsed) return null
	const cached = getCachedGeneratedRigged3d(parsed.hash)
	const clipMap = cached && (cached.clipMap || (cached.manifest && cached.manifest.clipMap))
	return clipMap && typeof clipMap === 'object' ? clipMap : null
}

// The presenter avatar's baked CONTACT-FRAME map (animId -> apex ms) from manifest.contacts, so a paired content
// effect fires at the real gesture impact instead of a per-intent heuristic. Same cache as the clipMap above;
// null for third-party / uncached handles (the director then uses the heuristic).
function avatarContactMapForSpec(spec, worldPresenter) {
	const p = spec && typeof spec === 'object' ? spec.presenter : null
	const model = (p && (p.model || p.avatar || p.glb)) || (worldPresenter && worldPresenter.model) || ''
	const parsed = parseGenRigged3dHandle(model)
	if (!parsed) return null
	const cached = getCachedGeneratedRigged3d(parsed.hash)
	const contacts = cached && (cached.contacts || (cached.manifest && cached.manifest.contacts))
	if (!Array.isArray(contacts)) return null
	const map = {}
	for (const c of contacts) if (c && typeof c.animId === 'number' && typeof c.contactMs === 'number') map[c.animId] = c.contactMs
	return Object.keys(map).length ? map : null
}

// The presenter avatar's per-clip LENGTH map (animId -> durationMs) from manifest.contacts.durationMs, so the
// playScene plays each gesture to its apex instead of being cut off at the 2s default. Same cache as above.
function avatarClipDurationsForSpec(spec, worldPresenter) {
	const p = spec && typeof spec === 'object' ? spec.presenter : null
	const model = (p && (p.model || p.avatar || p.glb)) || (worldPresenter && worldPresenter.model) || ''
	const parsed = parseGenRigged3dHandle(model)
	if (!parsed) return null
	const cached = getCachedGeneratedRigged3d(parsed.hash)
	const contacts = cached && (cached.contacts || (cached.manifest && cached.manifest.contacts))
	if (!Array.isArray(contacts)) return null
	const map = {}
	for (const c of contacts) if (c && typeof c.animId === 'number' && typeof c.durationMs === 'number') map[c.animId] = c.durationMs
	return Object.keys(map).length ? map : null
}

// Personalized Meshy hybrids carry a measured native-PowerPoint viewport margin in their manifest.
// Use it only as an asset default; an explicit author/world viewportMargin remains authoritative.
function avatarViewportMarginForSpec(spec, worldPresenter) {
	const p = spec && typeof spec === 'object' ? spec.presenter : null
	const model = (p && (p.model || p.avatar || p.glb)) || (worldPresenter && worldPresenter.model) || ''
	const parsed = parseGenRigged3dHandle(model)
	if (!parsed) return null
	const cached = getCachedGeneratedRigged3d(parsed.hash)
	const value = cached && (cached.viewportMargin ?? cached.manifest?.viewportMargin)
	return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null
}
// KINETIC presenter materialization (in-process, no cloud). When a spec asks for a kinetic presenter —
// `presenter.kinetic:{ clips:[…slugs], intentMap? }` or `presenter.mode:'kinetic'` + `presenter.kineticClips`
// — swap the ANIMATION tracks on the already-built base avatar for a custom N-of-31 kinetic set, at
// deck-compile time. The base must be a cached gen:// rigged avatar (its mesh/skin/poster are reused as-is);
// the transplant is a pure glTF buffer edit (ms). Returns a NEW spec whose presenter.model points at the
// kinetic gen:// handle and whose kinetic directive is consumed (so downstream avatarClipMapForSpec /
// avatarContactMapForSpec read the kinetic clipMap + contacts from the cache). Idempotent + fail-safe:
// unchanged when there's no kinetic ask, when the base isn't a cached gen avatar, or on any transplant error.
function materializeKineticEntry(p) {
	if (!p || typeof p !== 'object') return null
	const kin = p.kinetic && typeof p.kinetic === 'object'
		? p.kinetic
		: (p.mode === 'kinetic' && Array.isArray(p.kineticClips) ? { clips: p.kineticClips, intentMap: p.kineticIntentMap } : null)
	if (!kin || !Array.isArray(kin.clips) || !kin.clips.length) return null
	const baseModel = p.model || p.avatar || p.glb
	const parsed = parseGenRigged3dHandle(baseModel)
	if (!parsed) return null // base must be a cached gen avatar (a prior generate_rigged3d / registered performer)
	const cached = getCachedGeneratedRigged3d(parsed.hash)
	if (!cached || !cached.glbBase64) return null
	try {
		const { handle } = materializeKineticPresenter({
			baseGlbBase64: cached.glbBase64, retargetRestProfile: cached.retargetRestProfile,
			baseHash: parsed.hash, slugs: kin.clips,
			intentMap: kin.intentMap, previewBase64: cached.previewBase64, license: cached.license,
			staticPoseClipName: cached.manifest?.staticPoseClipName || null,
		})
		// Action clips swing limbs far past the rest-pose box the viewport is calibrated on — default a zoom-out
		// margin so leaps/kicks stay in frame (author viewportMargin wins; see presenter-director resolvePresenter).
		const next = { ...p, model: handle, viewportMargin: p.viewportMargin ?? (kin.viewportMargin ?? 2.2) }
		delete next.kinetic
		delete next.mode
		delete next.kineticClips
		delete next.kineticIntentMap
		return next
	} catch { return null } // never let a kinetic build break the compile — fall back to the base avatar
}

function materializeKineticForSpec(spec) {
	if (!spec || typeof spec !== 'object') return spec
	let out = spec
	const swapped = materializeKineticEntry(out.presenter)
	if (swapped) out = { ...out, presenter: swapped }
	// The CAST: each member may bring its own kinetic clip set (a different custom-18 per actor).
	const cast = out.presenters && Array.isArray(out.presenters.cast) ? out.presenters.cast : null
	if (cast && cast.length) {
		let changed = false
		const next = cast.map(entry => {
			const s = materializeKineticEntry(entry)
			if (s) changed = true
			return s ? { ...s, id: entry.id } : entry
		})
		if (changed) out = { ...out, presenters: { ...out.presenters, cast: next } }
	}
	return out
}

// Authoring-v3 semantic motion selection.  `motionTime.kineticSelection` is a
// catalog selection contract, not an animId list and not an engine-ranking
// request.  The AI supplies exact ordered motion IDs for each presenter; this
// pass only validates and materializes that exact bundle.
function authoringMotionSelectionDirectives(spec) {
	const motionTime = spec?.motionTime || spec?.motion?.motionTime || spec?.motion?.time || {}
	const contract = motionTime?.kineticSelection
	if (contract == null) return []
	if (!contract || typeof contract !== 'object' || Array.isArray(contract) || !Array.isArray(contract.presenters)) {
		const error = new Error('motionTime.kineticSelection must contain a presenters array.')
		error.code = 'MOTION_SELECTION_CONTRACT_INVALID'
		throw error
	}
	const seen = new Set()
	return contract.presenters.map((entry, index) => {
		const presenterId = String(entry?.presenterId || '').trim()
		if (!presenterId || !Array.isArray(entry?.selectedMotionIds)) {
			const error = new Error(`motionTime.kineticSelection.presenters[${index}] needs presenterId and selectedMotionIds.`)
			error.code = 'MOTION_SELECTION_CONTRACT_INVALID'
			error.field = `motionTime.kineticSelection.presenters[${index}]`
			throw error
		}
		if (seen.has(presenterId)) {
			const error = new Error(`motion selection for presenter ${presenterId} is declared more than once.`)
			error.code = 'MOTION_PRESENTER_SELECTION_DUPLICATE'
			error.presenterId = presenterId
			throw error
		}
		const selectedMotionIds = entry.selectedMotionIds.map(value => String(value || '').trim())
		if (!selectedMotionIds.length || selectedMotionIds.some(value => !value)) {
			const error = new Error(`motionTime.kineticSelection.presenters[${index}].selectedMotionIds must contain one exact non-empty motion.* ID in every position.`)
			error.code = 'MOTION_ID_INVALID'
			error.field = `motionTime.kineticSelection.presenters[${index}].selectedMotionIds`
			throw error
		}
		seen.add(presenterId)
		return { presenterId, selectedMotionIds }
	})
}

function ensureAuthoringMotionPresenterDeclarations(spec) {
	const directives = authoringMotionSelectionDirectives(spec)
	if (!directives.length) return spec
	const cast = spec?.presenters?.cast
	if (Array.isArray(cast) && cast.length) return spec
	if (directives.length !== 1) {
		const error = new Error('Multiple presenter motion selections require matching presenters.cast entries.')
		error.code = 'MOTION_PRESENTER_UNKNOWN'
		throw error
	}
	const presenter = spec.presenter === true ? {} : (spec.presenter && typeof spec.presenter === 'object' ? spec.presenter : {})
	return { ...spec, presenter: { ...presenter, id: presenter.id || directives[0].presenterId } }
}

function performanceError(code, message, field) {
	const error = new Error(message)
	error.code = code
	if (field) error.field = field
	return error
}

function preparePresenterPerformances(spec) {
	if (!(spec.slides || []).some(slide => slide?.presenterPerformance != null)) return spec
	const explicit = authoringMotionSelectionDirectives(spec)
	const byActor = new Map(explicit.map(entry => [entry.presenterId, { ...entry, selectedMotionIds: [...entry.selectedMotionIds] }]))
	const explicitActors = new Set(byActor.keys())
	const actorId = String(spec.presenter?.id || 'presenter')
	const cast = Array.isArray(spec.presenters?.cast) ? spec.presenters.cast : []
	const slides = spec.slides.map((slide, index) => {
		if (slide?.presenterPerformance == null) return slide
		const field = `slides[${index}].presenterPerformance`
		const performance = normalizePresenterPerformance(slide.presenterPerformance, field)
		const actor = cast.length ? cast.find(entry => String(entry?.id) === performance.actor) : (performance.actor === actorId ? spec.presenter : null)
		if (!actor || actor.enabled === false) throw performanceError('PERFORMANCE_PRESENTER_UNAVAILABLE', `Performance actor ${performance.actor} needs an enabled presenter or matching cast declaration.`, field)
		if (actor.pixelFrame || actor._visualReferenceFrame || slide.presenter?.pixelFrame || slide.presenter?._visualReferenceFrame) throw performanceError('PERFORMANCE_PLACEMENT_CONFLICT', 'A continuous performance uses AI-authored slide-inch geometry. Remove presenter pixelFrame and author presenterPerformance.frame plus exact travel[].center positions.', field)
		if (actor.kinetic || actor.mode === 'kinetic' || actor.kineticClips) throw performanceError('PERFORMANCE_MOTION_SELECTION_CONFLICT', 'A continuous performance selects exact public motion IDs. Remove the older kinetic clip directive for this actor.', field)
		if (actor.staticPose != null || slide.presenter?.staticPose != null) throw performanceError('PERFORMANCE_OWNERSHIP_CONFLICT', 'A static pose cannot own the same presenter as a continuous performance.', field)
		if (normalizeMotionPolicy(spec) !== 'full') throw performanceError('PERFORMANCE_MOTION_POLICY_CONFLICT', 'A continuous presenter performance requires the full motion policy.', field)
		const rawMotion = slide.presenterMotion
		const motionActor = typeof rawMotion === 'string' ? actorId : String(rawMotion?.presenterId || rawMotion?.actor || actorId)
		const authoredSequences = [...(slide.timeline || []), ...(slide.motion?.sequences || []), ...(spec.motion?.sequences || []).filter(sequence => sequence.slideId === slide.id || (sequence.slideIds || sequence.slides || []).includes(slide.id) || sequence.slideIndex === index || (sequence.slideIndexes || []).includes(index))]
		const competingSequence = authoredSequences.some(sequence => (sequence.steps || [sequence]).some(step => {
			const names = [step?.name, step?.objectName, ...(step?.names || []), ...(step?.objectNames || [])]
			return names.includes(performance.actor) || [step?.kind, ...(step?.kinds || [])].includes('model3d')
		}))
		const conflict = (rawMotion != null && motionActor === performance.actor)
			|| competingSequence
			|| (slide.scene || []).some(beat => String(beat?.actor || actorId) === performance.actor)
			|| (slide.interactions || []).some(beat => String(beat?.actor || actorId) === performance.actor)
			|| (slide.content || []).some(block => block?.kind === 'model3d' && [block.name, block.objectName, block.morphName].includes(performance.actor))
		if (conflict) throw performanceError('PERFORMANCE_OWNERSHIP_CONFLICT', `Performance actor ${performance.actor} already has another action owner on this slide. Put all of this actor's actions and interactions in presenterPerformance.`, field)
		if (performance.actorInstanceId && (slide.content || []).some(block => [block?.name, block?.objectName].includes(performance.actorInstanceId))) {
			throw performanceError('PERFORMANCE_INSTANCE_ID_CONFLICT', 'The authored presenter instance ID must not name another content object on its slide.', `${field}.actorInstanceId`)
		}
		const interactingActions = new Set()
		for (const interaction of performance.interactions || []) {
			if (interactingActions.has(interaction.actionId)) throw performanceError('PERFORMANCE_CONTACT_CONFLICT', 'One performance action can contact one target. Use consecutive actions for multiple targets.', field)
			interactingActions.add(interaction.actionId)
			const target = resolveInteractionTargetGeometry(slide.content || [], interaction.target)?.target
			if (!target) throw performanceError('PERFORMANCE_TARGET_NOT_FOUND', `Performance target ${interaction.target} must name exactly one content object or named editable group descendant on its slide.`, field)
			if (['model3d', 'narration', 'avatarNarration', 'media'].includes(target.kind)) throw performanceError('PERFORMANCE_TARGET_UNSUPPORTED', `Performance target ${interaction.target} must be an editable slide element.`, field)
		}
		const selected = byActor.get(performance.actor) || { presenterId: performance.actor, selectedMotionIds: [] }
		for (const action of performance.actions) {
			if (explicitActors.has(performance.actor) && !selected.selectedMotionIds.includes(action.motionId)) throw performanceError('PERFORMANCE_MOTION_NOT_SELECTED', `Performance motion ${action.motionId} was not included in the explicit motion selection for ${performance.actor}.`, field)
			if (!selected.selectedMotionIds.includes(action.motionId)) selected.selectedMotionIds.push(action.motionId)
		}
		byActor.set(performance.actor, selected)
		return { ...slide, presenterPerformance: performance }
	})
	const authoredInstanceIds = new Set()
	for (const [index, slide] of slides.entries()) {
		const instanceId = slide.presenterPerformance?.actorInstanceId
		if (!instanceId) continue
		if (authoredInstanceIds.has(instanceId)) throw performanceError('PERFORMANCE_INSTANCE_ID_CONFLICT', 'Authored presenter instance IDs must be distinct across slides.', `slides[${index}].presenterPerformance.actorInstanceId`)
		authoredInstanceIds.add(instanceId)
	}
	for (const selection of byActor.values()) if (selection.selectedMotionIds.length > 18) throw performanceError('PERFORMANCE_MOTION_BUNDLE_LIMIT', `Performances for ${selection.presenterId} request more than 18 distinct motions across the deck. Reuse selected actions or split the cast.`, 'presenterPerformance.actions')
	const motionTime = spec.motionTime || spec.motion?.motionTime || spec.motion?.time || {}
	return { ...spec, slides, motionTime: { ...motionTime, kineticSelection: { ...(motionTime.kineticSelection || {}), presenters: [...byActor.values()] } } }
}

function materializePresenterPerformancesForSpec(spec, options) {
	const performances = []
	for (const [slideIndex, slide] of spec.slides.entries()) {
		const performance = slide.presenterPerformance
		if (!performance) continue
		const actor = (spec.presenters?.cast || []).find(entry => String(entry?.id) === performance.actor) || (String(spec.presenter?.id || 'presenter') === performance.actor ? spec.presenter : null)
		const sourceHandle = actor?.model || actor?.avatar || actor?.glb
		const resolved = materializePresenterPerformance({ model: sourceHandle, performance })
		registerPublicDefaultPresenterDerivation(sourceHandle, resolved.handle)
		performances.push({ slideIndex, performance, actor, ...resolved })
	}
	return performances.length ? expandPresenterPerformances(spec, { ...options, performances }) : spec
}

function materializeAuthoringMotionForSpec(spec) {
	const directives = authoringMotionSelectionDirectives(spec)
	if (!directives.length) return spec
	const byPresenter = new Map(directives.map(entry => [entry.presenterId, entry]))
	const consumed = new Set()
	const readback = []
	const materialize = (presenter, presenterId) => {
		const directive = byPresenter.get(presenterId)
		if (!directive) return presenter
		consumed.add(presenterId)
		const baseModel = presenter?.model || presenter?.avatar || presenter?.glb
		const parsed = parseGenRigged3dHandle(baseModel)
		const cached = parsed ? getCachedGeneratedRigged3d(parsed.hash) : null
		if (!parsed || !cached?.glbBase64) {
			const error = new Error(`presenter ${presenterId} has no resolvable rigged base for its selected motion bundle.`)
			error.code = 'MOTION_PRESENTER_BASE_UNAVAILABLE'
			error.presenterId = presenterId
			throw error
		}
		const result = materializeAuthoringMotionPresenter({
			baseGlbBase64: cached.glbBase64,
			retargetRestProfile: cached.retargetRestProfile,
			baseHash: parsed.hash,
			selectedMotionIds: directive.selectedMotionIds,
			previewBase64: cached.previewBase64,
			license: cached.license,
			staticPoseClipName: cached.manifest?.staticPoseClipName || null,
			staticPoseProfileVersion: cached.manifest?.staticPoseProfileVersion || null,
		})
		registerPublicDefaultPresenterDerivation(baseModel, result.handle)
		readback.push({
			presenterId,
			selectedMotionIds: [...result.selectedMotionIds],
			bundleBudget: { used: result.selectedMotionIds.length, maximum: 18, remaining: 18 - result.selectedMotionIds.length },
			bundleHandle: result.handle,
			noSilentSubstitution: JSON.stringify(result.selectedMotionIds) === JSON.stringify(directive.selectedMotionIds),
		})
		return { ...presenter, model: result.handle, viewportMargin: presenter.viewportMargin ?? 2.2 }
	}

	let out = spec
	if (out.presenter && typeof out.presenter === 'object') {
		const presenterId = String(out.presenter.id || 'presenter')
		out = { ...out, presenter: materialize(out.presenter, presenterId) }
	}
	const cast = out.presenters && Array.isArray(out.presenters.cast) ? out.presenters.cast : null
	if (cast?.length) {
		out = {
			...out,
			presenters: {
				...out.presenters,
				cast: cast.map(entry => entry && typeof entry === 'object' ? materialize(entry, String(entry.id || '')) : entry),
			},
		}
	}
	const unmatched = directives.filter(entry => !consumed.has(entry.presenterId))
	if (unmatched.length) {
		const error = new Error(`motion selections reference unknown presenters: ${unmatched.map(entry => entry.presenterId).join(', ')}`)
		error.code = 'MOTION_PRESENTER_UNKNOWN'
		error.presenterIds = unmatched.map(entry => entry.presenterId)
		throw error
	}
	const firstManifest = readback.length
		? getCachedGeneratedRigged3d(parseGenRigged3dHandle(readback[0].bundleHandle)?.hash)?.manifest
		: null
	return {
		...out,
		_authoringMotionPlan: {
			contractVersion: 'betterpptx.authoring-motion-selection.v1',
			catalogVersion: firstManifest?.catalogVersion || null,
			catalogFingerprint: firstManifest?.catalogFingerprint || null,
			selectionAuthority: 'AI',
			engineRole: 'validate-and-execute-exact-selection',
			presenters: readback,
		},
	}
}

// Per-actor baked/kinetic maps for the cast, read from the gen cache (same shape the single-presenter path
// resolves): { [actorId]: { clipMap, contactMap, clipDurations, … } }. Null when there is no cast.
// withBytes=true additionally decodes the GLB and pulls the EMPIRICAL clip-timeline manifest — the Synergy
// interaction director needs both (FK + rendered-truth timing); plain cast expansion does not.
function castAssetsForSpec(spec, withBytes = false) {
	let cast = spec && spec.presenters && Array.isArray(spec.presenters.cast) ? spec.presenters.cast : null
	// A2a/T28 (lone-presenter normalization, 2026-07-14): a top-level `presenter` is a cast of ONE
	// for actor resolution — slides[].interactions can name it (id, or 'presenter' by default)
	// without hand-building presenters.cast. Feeds ASSET lookup only; the presenter-directive
	// path is untouched.
	if ((!cast || !cast.length) && spec && spec.presenter && typeof spec.presenter === 'object'
		&& (spec.presenter.model || spec.presenter.avatar || spec.presenter.glb)) {
		cast = [{ id: String(spec.presenter.id || 'presenter'), ...spec.presenter }]
	}
	if (!cast || !cast.length) return null
	const assets = {}
	for (const entry of cast) {
		if (!entry || typeof entry !== 'object' || !entry.id) continue
		const fake = { presenter: entry }
		const a = {
			clipMap: avatarClipMapForSpec(fake, null),
			contactMap: avatarContactMapForSpec(fake, null),
			clipDurations: avatarClipDurationsForSpec(fake, null),
			viewportMargin: avatarViewportMarginForSpec(fake, null),
			scale: Math.max(0.5, Math.min(2.2, Number(entry.scale) || 1)),
		}
		if (withBytes) {
			const model = entry.model || entry.avatar || entry.glb
			const parsed = parseGenRigged3dHandle(model)
			const cached = parsed ? getCachedGeneratedRigged3d(parsed.hash) : null
			if (cached && cached.glbBase64) {
				a.model = model
				a.glbBuf = Buffer.from(cached.glbBase64, 'base64')
				a.clipTimelines = cached.clipTimelines || (cached.manifest && cached.manifest.clipTimelines) || null
				a.poster = cached.previewBase64 ? null : null // poster path resolution stays with the director
				a.faceRotationY = entry.faceRotationY ?? 0
			}
		}
		assets[entry.id] = a
	}
	return assets
}

export const TOOL_RESPONSE_VERSION = 'tool-response.v1'

export const SPEC_CAPABILITY_MATRIX = Object.freeze({
	schemaVersion: 'betterpptx.deck-spec.v1',
	objectModel: {
		coordinateSystem: 'inches',
		layerModel: 'flat ordered content array per slide',
		textPolicy: 'shape is geometry-only; textBox creates standalone text; textShape creates text inside a PowerPoint shape',
		identityPolicy: 'stable slide ids, block names, item names, objectName values, and edit handles',
		timingPolicy: 'AI client authors narration timing; atMs/endMs are milliseconds from narration media start; startDelayMs shifts media and cues together; the spoken script is preserved in speaker notes',
	},
	interactionContract: publicInteractionContract(),
	specNative: [
		{ kind: 'title/text/body/quote/callout', primitive: 'betterpptx.slide.add_text', status: 'editable-native' },
		{ kind: 'textBox', primitive: 'betterpptx.slide.add_text', status: 'editable-native' },
		{ kind: 'textShape', primitive: 'betterpptx.slide.add_text with shape option', status: 'editable-native' },
		{ kind: 'shape', primitive: 'betterpptx.slide.add_shape', status: 'editable-native', rule: 'geometry-only' },
		{ kind: 'connector', primitive: 'betterpptx.slide.add_connector', status: 'editable-native', rule: 'Use semantic endpoint names/targets; the engine resolves connector geometry and bindings.' },
		{ kind: 'group', primitive: 'betterpptx.slide.add_group', status: 'editable-native', rule: 'Group stable named child objects; the engine owns the grouped transform and package topology.' },
		{ kind: 'chart-panel', primitive: 'betterpptx.slide.add_chart', status: 'editable-native' },
		{ kind: 'table-panel', primitive: 'betterpptx.slide.add_table', status: 'editable-native', rule: 'Use header:[column labels] with rows:[data rows] for semantic tables; the compiler prepends and styles the header exactly once. If rows already begin with the same labels, it does not duplicate them.' },
		{ kind: 'image-feature', primitive: 'betterpptx.slide.add_image', status: 'editable-native-wrapper', rule: 'kind:"image" is an accepted alias. Sources: data URI, path/url, a licensed stock:// handle (betterpptx.assets.search_stock), or visualIntent:{mode:"auto|generate",concept,purpose,subjectPlacement,negativeSpace,consistencyGroup,nativeAnnotations} for contextual World-aware generation. nativeAnnotations:{labels:[{text,x,y,w,h}],arrows:[{x,y,w,h}]} keeps generated pixels text-free and compiles factual annotations as editable native PowerPoint objects. imageOps:[{op:crop|resize|rotate|flip|grayscale|duotone|tint|blurRegion|highlightRegion|dimOutsideRegion|pad|deviceFrame}] grades the raster deterministically (percent regions); imageTreatment:"world" opts into the world grade; splitGrid:{rows,cols,pick} explodes one image into placed cells.' },
		{ kind: 'smartart/diagram', primitive: 'betterpptx.slide.add_smartart', status: 'native-first-with-explicit-custom-fallback', rule: 'Native editable SmartArt is the default for both kind:"smartart" and kind:"diagram". A shape-built/custom diagram is allowed only when the AI records a specific reason that the native object cannot express the intended result.' },
		{ kind: 'equation', primitive: 'betterpptx.slide.add_equation', status: 'editable-native-or-fallback' },
		{ kind: 'model3d', primitive: 'betterpptx.slide.add_model3d', status: 'native-3d-with-raster-fallback', rule: 'Rigged models: scene:{animId,length?,loop?} activates one embedded glTF animation clip through PowerPoint\'s repair-safe timing tree. Static/edit posture comes from the GLB base transforms with raster fallback. scene.posterAnimId is unsupported and blocks dryRun.' },
		{ kind: 'cameo', primitive: 'betterpptx.slide.add_cameo', status: 'native-live-camera-feed', rule: 'Live webcam placeholder frame. shape:"ellipse"(default)|"rect"|"roundRect"|any PowerPoint prst name; ~2.14in default parked bottom-right. Gated as premium beyond the free preview like model3d/media/avatar.' },
		{ kind: 'freeform', primitive: 'betterpptx.slide.add_freeform', status: 'editable-native-custom-geometry' },
		{ kind: 'media', primitive: 'betterpptx.slide.add_media', status: 'native-media', rule: 'Video/audio by link, path, or a licensed stock:// handle (stock://pexels/video/…, stock://pixabay/video/…, stock://freesound/audio/… for CC0 music beds); license records ride the deck automatically. The world mediaMotion temperament (appliedDefaults) suggests pacing.' },
		{ kind: 'ink', primitive: 'betterpptx.slide.add_ink', status: 'editable-custom-geometry-annotation' },
		{ kind: 'laser', primitive: 'betterpptx.slide.add_laser_pointer', status: 'editable-custom-geometry-overlay' },
		{ kind: 'narration', primitive: 'betterpptx.slide.add_narration', status: 'native-audio-plus-notes-cues-timing', engine: 'service-side native narration — standalone and independent of presenter media', rule: 'Use narration:{text,voiceId,synthesizeAudio,preserveInNotes,useGeneratedAudioAsTimingAuthority,timing:{cues}}. Cue targets must be stable objectName values. Narration is speaker notes, embedded audio, granular cues, native motion, and auto-advance. Native captions are audio.closedCaptionTracks WebVTT only and are never generated as slide text.' },
		{ kind: 'avatarNarration', primitive: 'betterpptx.slide.add_avatar_narration', status: 'resolved-or-billable-avatar-video', engine: 'governed presenter media service — optional and heavier than narration; not required for spoken audio', rule: 'Use renderPolicy/resolutionPolicy; completed locked handles compile without model-backed rerender. Only when a visible presenter is wanted — for voice alone use kind:"narration".' },
		{ kind: 'customGeometry/custom-geometry', primitive: 'betterpptx.custom_geometry.insert, insert_svg, or slide.add_freeform', status: 'editable-native-custom-geometry' },
		{ kind: 'opaqueNative', primitive: 'preservation handle', status: 'preserve-only-native-payload' },
	],
	deckLevel: [
		{ field: 'presenterIdentity/presenterPolicy', primitive: 'presenter contract', status: 'shared 3D/talking-head/fallback planning', rule: 'Declare one identity and representation policy; the compiler reports per-slide lane selection, shared text clock, missing assets, and duplicate-presence risks.' },
		{ field: 'layouts[]', primitive: 'betterpptx.deck.define_layout', status: 'pre-slide deck operation', rule: 'Aspect is first-class WITHOUT layouts[]: layout:"LAYOUT_VERTICAL" (9:16 Shorts/Reels master) or "LAYOUT_SQUARE" (1:1 social card) — aspect:"9:16"/"1:1" sugar accepted; explicit layouts[] wins for unusual sizes.' },
		{ field: 'masters[]', primitive: 'betterpptx.deck.define_master', status: 'pre-slide deck operation' },
		{ field: 'nativePackagePreservation', primitive: 'preservation handle', status: 'roundtrip-only theme/master/layout scaffold preservation' },
		{ field: 'sections[]', primitive: 'betterpptx.deck.sections', status: 'post-slide section operation' },
		{ field: 'reviewComments[]', primitive: 'betterpptx.slide.add_comment', status: 'semantic native review annotation', rule: 'Attach to an existing slideId or slideIndex; use targetObjectName for a stable object anchor. The engine owns comment relationships and author metadata.' },
		{ field: 'transitionPolicy/transitionsAll/motion.transitionPolicy', primitive: 'betterpptx.deck.set_transitions_all', status: 'post-slide timing operation' },
		{ field: 'motion.sequences[]/slides[].motion.sequences[]/slides[].timeline[]', primitive: 'betterpptx.slide.animate_shapes', status: 'post-slide motion operation' },
		{ field: 'slides[].nativeTimingPreservation', primitive: 'preservation handle', status: 'roundtrip-only native timing preservation' },
		{ field: 'autoplay', primitive: 'betterpptx.deck.autoplay', status: 'post-slide timing operation' },
		{ field: 'showSettings', primitive: 'betterpptx.deck.set_show_settings', status: 'post-slide show-settings operation' },
		{ field: 'slides[].sectionZoom/sectionZooms', primitive: 'betterpptx.slide.add_section_zoom', status: 'post-section zoom-navigation operation', rule: 'targetSection = section title or 1-based index; section must exist (define spec.sections).' },
		{ field: 'summaryZoom', primitive: 'betterpptx.deck.add_summary_zoom', status: 'post-section zoom-navigation operation', rule: 'Builds a summary landing slide that zooms into sections; sections default to all content sections.' },
	],
	specAuthoringContracts: [
		{
			field: 'authoringContract.completeness',
			owner: 'AI declares the business ambition and owns aesthetic decisions; engine compiles and verifies',
			default: 'complete',
			compiledAs: 'Business-complete ambition readback independent of aesthetic selection. Omission/null selects neutral execution; named or bespoke styling is opt-in.',
			rule: 'Complete means audience-appropriate, evidence-led, readable and accessible, not ornament or maximum complexity. No aesthetic quota or automatic motion. Explicit balanced/minimal intent remains supported; validation is not bypassed.',
		},
		{
			field: 'slides[].narration or content kind:"narration"',
			owner: 'AI client',
			timebase: 'milliseconds from narration media start, not cumulative animation delay',
			compiledAs: 'native PowerPoint narration audio, notes, withPrevious cue timing, and validated advTm',
		},
		{
			field: 'slides[].interactions',
			owner: 'AI client authors semantic beats; MCP compiler owns geometry and timing',
			timebase: 'empirical clipTimelines milliseconds from the baked clip start',
			compiledAs: 'native model3d scene plus contact-timed target effect, recorded in _synergyPlan',
			rule: 'Every interaction-heavy slide must have a solved _synergyPlan record; hand-authored multi-playScene choreography is rejected.',
		},
	],
	primitiveOnly: [
		{ capability: 'uploaded-deck structural editing', route: 'open uploaded deck, inspect shapes, then revise/update through public edit primitives' },
		{ capability: 'asset search/import decisions', route: 'use catalog/import tools before putting opaque asset handles in the spec' },
	],
	unsupportedInSpecV1: [
		{ capability: 'raw package markup passthrough', reason: 'not part of public deterministic authoring' },
		{ capability: 'private endpoint diagnostics or local file discovery', reason: 'not exposed through product spec responses' },
	],
})

export function publicSpecCapabilityMatrix() {
	const copy = JSON.parse(JSON.stringify(SPEC_CAPABILITY_MATRIX))
	const { primitiveOnly: _legacyPrimitiveRoutes, ...publicBase } = copy
	const publicRow = row => {
		const { primitive: _privateRoute, ...semantic } = row
		if (row.kind === 'image-feature') {
			semantic.rule = 'Use visualIntent.nativeAnnotations:{placement:"image-aware",labels:[{text,target?}],arrows:[{target?}]} for factual overlays. The engine detects image anchors, places editable labels/arrows, avoids collisions, and returns geometry as readback; do not author x/y/w/h, rect, bbox, units, or coordinateMode. imageOps remain image-relative treatment semantics, not slide placement.'
		}
		const isForbiddenPreservation = row.kind === 'opaqueNative' || row.status === 'preserve-only-native-payload' || row.status?.startsWith('roundtrip-only')
		if (isForbiddenPreservation) {
			return {
				...semantic,
				status: 'forbidden-in-director-spec',
				engineRoute: 'not-available-in-public-spec',
				rule: 'Do not author or request a raw preservation payload; re-author the semantic object and let the engine rebuild it.',
			}
		}
		return { ...semantic, engineRoute: 'betterpptx.deck.generate_from_spec' }
	}
	return {
		...publicBase,
		routePolicy: 'Every supported row is represented in one governed JSON spec and compiled through betterpptx.deck.generate_from_spec; rows are not public tool-invocation instructions.',
		 authoringBoundary: {
			designAuthority: 'ai',
			engineRole: 'catalog-executor-package-verifier',
			nativeFirstPolicy: publicNativeFirstAuthoringPolicy(),
			geometryAuthority: 'ai',
			visualAnnotations: {
				contractVersion: 'authoring-excellence.annotations.v1',
				input: 'content[].visualIntent.nativeAnnotations',
				placement: 'ai-authored',
				semanticFields: ['labels[].text', 'labels[].target', 'arrows[].target'],
				authoredGeometry: ['labels[].x', 'labels[].y', 'labels[].w', 'labels[].h', 'arrows[].x', 'arrows[].y', 'arrows[].w', 'arrows[].h'],
				engineReadback: ['anchors', 'collisionFindings', 'boundsFindings'],
				forbiddenInputs: [],
				rule: 'Semantic targets describe meaning, while the AI authors label and arrow geometry. The engine reports anchor and collision evidence without moving annotations.',
			},
		},
		specNative: copy.specNative.map(publicRow),
		deckLevel: copy.deckLevel.map(publicRow),
		uploadedDeckEditing: [
			{ capability: 'uploaded-deck structural editing', route: 'open uploaded bytes, inspect stable object names, export the semantic spec, then submit governed JSON-spec edits through betterpptx.deck.generate_from_spec' },
			{ capability: 'asset search/import decisions', route: 'use catalog or search tools before placing opaque asset handles in the governed spec' },
		],
	}
}

function dataSourceMap(spec) {
	return new Map((spec.data || []).map(item => [item.name, item]))
}

function assetMap(spec) {
	return new Map((spec.assets || []).map(item => [item.name, item]))
}

function activeLayoutDefinition(spec = {}) {
	const layouts = Array.isArray(spec.layouts) ? spec.layouts : []
	if (!layouts.length) return null
	return layouts.find(item => item?.activate === true || item?.active === true || item?.name === spec.layout) || layouts[0]
}

// Aspect is a first-class canvas dimension: 16:9 deck (default), 9:16 Shorts/Reels
// master, 1:1 social card. The presets make vertical a one-word choice
// (layout: "LAYOUT_VERTICAL" or aspect: "9:16") instead of a custom layouts[]
// declaration. 7.5 stays the short edge so world type scales tuned to the 7.5"
// canvas height carry over unchanged; explicit layouts[] always wins over sugar.
const ASPECT_LAYOUT_PRESETS = Object.freeze({
	LAYOUT_VERTICAL: Object.freeze({ name: 'LAYOUT_VERTICAL', aspect: '9:16', width: 7.5, height: 13.333 }),
	LAYOUT_SQUARE: Object.freeze({ name: 'LAYOUT_SQUARE', aspect: '1:1', width: 7.5, height: 7.5 }),
})
const ASPECT_ALIASES = Object.freeze({
	'9:16': 'LAYOUT_VERTICAL', vertical: 'LAYOUT_VERTICAL', portrait: 'LAYOUT_VERTICAL', shorts: 'LAYOUT_VERTICAL', reels: 'LAYOUT_VERTICAL', tiktok: 'LAYOUT_VERTICAL',
	'1:1': 'LAYOUT_SQUARE', square: 'LAYOUT_SQUARE',
})

export function aspectLayoutPresetForSpec(spec = {}) {
	const byLayout = ASPECT_LAYOUT_PRESETS[String(spec.layout || '').trim().toUpperCase()]
	if (byLayout) return byLayout
	const alias = ASPECT_ALIASES[String(spec.aspect || '').trim().toLowerCase()]
	return alias ? ASPECT_LAYOUT_PRESETS[alias] : null
}

function slideSizeFromSpec(spec = {}) {
	const preset = aspectLayoutPresetForSpec(spec)
	const namedByLayout = preset && String(spec.layout || '').trim().toUpperCase() === preset.name
	const layout = activeLayoutDefinition(spec)
	const width = Number(layout?.width)
	const height = Number(layout?.height)
	const declaredSize = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { w: width, h: height } : null
	// spec.layout NAMING a preset is the author's LATEST word — an edited export_spec
	// still carries the deck's previous layouts[] with activate:true (e.g. an uploaded
	// deck's imported_1333x750), and that stale entry must not silently pin the old
	// aspect. A layouts[] entry that redefines the preset name itself still wins.
	if (namedByLayout && !(layout?.name === preset.name && declaredSize)) return { w: preset.width, h: preset.height }
	if (declaredSize) return declaredSize
	return preset ? { w: preset.width, h: preset.height } : null
}

function placeholderBindingsForSpec(spec = {}) {
	const contract = spec.layoutContract && typeof spec.layoutContract === 'object' ? spec.layoutContract : {}
	const templateContract = spec.template?.layoutContract && typeof spec.template.layoutContract === 'object' ? spec.template.layoutContract : {}
	const bindings = contract.placeholderBindings ?? templateContract.placeholderBindings
	if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)) return {}
	return Object.fromEntries(Object.entries(bindings).map(([key, value]) => [key, normalizePlaceholderBinding(value, `layoutContract.placeholderBindings.${key}`)]))
}

function placeholderOptionsForObject(object = {}, spec = {}) {
	const diagnosticBindings = new Set(['contract-aware', 'contract-aware-or-geometry', 'geometry-matched-fallback'])
	const authoredBlock = (Array.isArray(spec.slides) ? spec.slides : [])
		.find(slide => slide?.id === object.slideId)?.content
		?.find(block => block?.name === object.blockName)
	const source = authoredBlock && typeof authoredBlock === 'object' ? authoredBlock : object
	const ownsCanonicalBinding = Object.prototype.hasOwnProperty.call(source, 'placeholderBinding')
	const canonicalBinding = source.placeholderBinding
	const authoredCanonicalBinding = ownsCanonicalBinding && !(typeof canonicalBinding === 'string' && diagnosticBindings.has(canonicalBinding))
	const ownsCompatibilityBinding = Object.prototype.hasOwnProperty.call(source, 'placeholder')
	const hasExplicitBinding = authoredCanonicalBinding || ownsCompatibilityBinding
	const explicit = authoredCanonicalBinding ? canonicalBinding : source.placeholder
	const role = source.placeholderRole ?? source.role ?? source.region ?? object.placeholderRole ?? object.role ?? object.region
	const binding = hasExplicitBinding ? explicit : (role ? placeholderBindingsForSpec(spec)[role] : undefined)
	if (binding === undefined || binding === null || binding === false) return {}
	return normalizePlaceholderBinding(binding, `${object.objectName || object.primitive || 'object'}.placeholderBinding`)
}

function graphicFramePlaceholderOptionsForObject(object = {}, spec = {}, expectedNativeType) {
	const options = placeholderOptionsForObject(object, spec)
	if (!Object.keys(options).length) return options
	const path = `${object.objectName || object.primitive || 'graphicFrame'}.placeholderBinding`
	if (options.phType !== undefined && options.phType !== expectedNativeType) {
		throw new Error(`${path}.type must be ${expectedNativeType === 'tbl' ? 'table/tbl' : expectedNativeType} for a ${object.primitive} object.`)
	}
	if (options.phType === expectedNativeType && options.phIdx === undefined && options.placeholder === expectedNativeType) {
		throw new Error(`${path} must include idx/phIdx or a distinct layout placeholder name so the populated graphic frame cannot bind ambiguously.`)
	}
	if (options.phType === undefined && (typeof options.placeholder !== 'string' || !options.placeholder.trim())) {
		throw new Error(`${path} must identify a named ${object.primitive} placeholder or supply its canonical type/index tuple.`)
	}
	return options
}

function authoredBlockForPlannedObject(object = {}, spec = {}) {
	const slides = Array.isArray(spec.slides) ? spec.slides : []
	const slide = slides.find(item => item?.id === object.slideId) || slides[object.slideIndex]
	if (!slide || !Array.isArray(slide.content)) return null
	const names = new Set([object.blockName, object.objectName, object.name].filter(Boolean).map(String))
	return slide.content.find(block => names.has(String(block?.name || block?.objectName || ''))) || null
}

function nativePlaceholderInheritanceForObject(object = {}, spec = {}, placeholderOptions = {}) {
	if (!Object.keys(placeholderOptions).length) return false
	const source = authoredBlockForPlannedObject(object, spec)
	if (!source) return false
	const explicitRect = source.bbox || source.rect
	const sources = [source, source.options].filter(value => value && typeof value === 'object' && !Array.isArray(value))
	return !explicitRect && !sources.some(value => ['x', 'y', 'w', 'h'].some(key => Object.prototype.hasOwnProperty.call(value, key)))
}

// Layout and master definitions retain the same first-class placeholder
// component shape.  The engine/library own the final carrier serialization.
function placeholderDefinitionForLayout(item = {}, field = 'layouts[].placeholders') {
	return normalizePlaceholderDefinition(item, field)
}

function placeholderDefinitionsForCarrier(items = [], path = 'layouts[].placeholders') {
	const normalized = items.map((item, index) => placeholderDefinitionForLayout(item, `${path}[${index}]`))
	const names = new Set()
	const tuples = new Set()
	for (const item of normalized) {
		const name = String(item.name || '').toLocaleLowerCase()
		const tuple = `${item.type}:${item.idx ?? 0}`
		if (names.has(name)) throw new Error(`${path} contains duplicate placeholder name ${item.name}.`)
		if (tuples.has(tuple)) throw new Error(`${path} contains duplicate placeholder type/index tuple ${tuple}.`)
		names.add(name)
		tuples.add(tuple)
	}
	return normalized
}

export function compactWarning(warning) {
	const message = warning.message || warning.reason || warning.code || 'Authoring finding.'
	const nextReason = warning.next && typeof warning.next === 'object' ? warning.next.reason : warning.next
	const evidenceKeys = ['suggestions', 'fallbackSpecPatch', 'requiresUpgrade', 'freePolicy', 'field', 'path', 'received', 'region', 'blockName', 'sectionId', 'expected', 'actual']
	const evidence = warning.evidence && typeof warning.evidence === 'object'
		? warning.evidence
		: Object.fromEntries(evidenceKeys.filter(key => warning[key] !== undefined).map(key => [key, warning[key]]))
	const out = {
		code: warning.code,
		severity: warning.severity || 'warning',
		slideId: warning.slideId,
		objectName: warning.objectName,
		message,
		// E2 diagnostic contract: every AI-facing finding has a reason, a concrete
		// fix, and machine evidence. Keep message/next for compatibility with
		// existing clients, but do not make the AI reconstruct actionability from
		// an opaque warning string.
		reason: warning.reason || message,
		fix: warning.fix || nextReason || (Object.keys(evidence).length ? 'Use the supplied evidence and semantic suggestions, then rerun dryRun.' : 'Revise the semantic spec and rerun dryRun.'),
		evidence,
		next: warning.next,
	}
	for (const key of ['suggestions', 'fallbackSpecPatch', 'requiresUpgrade', 'freePolicy', 'owner']) if (warning[key] !== undefined) out[key] = warning[key]
	return out
}

function narrationProfileFindings(spec = {}) {
	const findings = []
	const silent = spec.outputVariant === 'silent-timed-notes' || (spec.selectedOutputVariants || []).includes('silent-timed-notes') || spec.narration?.synthesizeAudio === false
	const director = spec.authoringContract?.workflow === 'authoring-excellence-director-v1'
	if (!silent && narratedProfileRequested(spec)) {
		const voiceId = spec.narration?.voiceId || spec.narration?.voice || (spec.slides || []).map(slide => slide?.narration?.voice || slide?.narration?.voiceId).find(Boolean)
		if (!voiceId && director) {
			findings.push({
				code: 'AI_VOICE_IDENTITY_REQUIRED',
				severity: 'error',
				owner: 'ai-client',
				message: 'Narrated output requires an explicit approved voiceId from betterpptx.narration.voices.',
				reason: 'The engine must not silently substitute a different voice.',
				fix: 'Inspect betterpptx.narration.voices and set narration.voiceId before commit.',
			})
		}
		const overlayField = findNonNativeCaptionOverlayField(spec)
		if (overlayField) findings.push(nonNativeCaptionOverlayIssue(overlayField))
	}
	for (const slide of spec.slides || []) {
		const cues = authoredCuesFromNarration(slide.narration)
			.concat(authoredCuesFromNarration(slide.content?.find(block => block?.kind === 'narration')))
		for (const cue of cues) {
			const prosody = mapCueProsody(cue)
			if (!prosody.partial) continue
			findings.push({
				code: 'TTS_PROSODY_PARTIALLY_SUPPORTED',
				severity: 'warning',
				owner: 'ai-client',
				slideId: slide.id,
				message: `Cue ${cue.cueId || cue.id || cue.text || 'unnamed'} requested prosody the internal voice runtime cannot fully apply.`,
				reason: 'Unsupported voice controls must not disappear silently.',
				fix: 'Revise the script, cue timing, or emphasis animation for the unsupported controls.',
				evidence: { cueId: cue.cueId || cue.id || null, requested: prosody.requested, applied: prosody.applied, unsupported: prosody.unsupported },
			})
		}
	}
	return findings
}

function fillOptions(fill, fallbackColor = 'FFFFFF') {
	if (!fill || typeof fill !== 'object') return { color: fill || fallbackColor, transparency: 0 }
	const next = { ...fill }
	if (next.pattern?.preset) {
		const aliases = { darkupwarddiagonal: 'dkUpDiag', lightupwarddiagonal: 'ltUpDiag', darkdownwarddiagonal: 'dkDnDiag', lightDownwardDiagonal: 'ltDnDiag' }
		const key = String(next.pattern.preset).replace(/[-_\s]/g, '').toLowerCase()
		next.pattern = { ...next.pattern, preset: aliases[key] || next.pattern.preset }
		next.type = next.type || 'pattern'
	}
	if (next.gradient && typeof next.gradient === 'object') {
		next.type = next.type || 'gradient'
		next.gradientDirection = next.gradient.type || next.gradient.direction || next.gradient.path || next.gradientDirection
		next.gradientAngle = next.gradient.angleDeg ?? next.gradientAngle
		next.rotateGradientWithShape = next.gradient.rotateWithShape ?? next.rotateGradientWithShape
		next.gradientFlip = next.gradient.flip ?? next.gradient.gradientFlip ?? next.gradientFlip
		next.fillToRect = next.gradient.fillToRect ?? next.gradient.focusRect ?? next.gradient.fillFocusRect ?? next.fillToRect
		next.tileRect = next.gradient.tileRect ?? next.tileRect
		if (Array.isArray(next.gradient.stops)) {
			next.gradientStops = next.gradient.stops.map(stop => {
				const rawColor = stop?.color
				const colorTransforms = stop?.colorTransforms && typeof stop.colorTransforms === 'object' ? stop.colorTransforms : {}
				const topLevelTransforms = {
					tint: stop?.tint,
					shade: stop?.shade,
					saturation: stop?.saturation,
					luminance: stop?.luminance,
					luminanceOffset: stop?.luminanceOffset,
					opacity: stop?.colorOpacity,
				}
				const hasTransforms = value => value !== undefined && value !== null
				const structuredColor = rawColor && typeof rawColor === 'object'
					? { ...rawColor, ...colorTransforms, ...Object.fromEntries(Object.entries(topLevelTransforms).filter(([, value]) => hasTransforms(value))) }
					: (Object.keys(colorTransforms).length || Object.values(topLevelTransforms).some(hasTransforms))
						? { color: String(rawColor || '').replace(/^#/, ''), ...colorTransforms, ...Object.fromEntries(Object.entries(topLevelTransforms).filter(([, value]) => hasTransforms(value))) }
						: String(rawColor || '').replace(/^#/, '')
				return {
					position: Number(stop.position) <= 1 ? Number(stop.position) * 100 : Number(stop.position),
					color: structuredColor,
					transparency: stop.opacity == null ? stop.transparency : Math.round((1 - Number(stop.opacity)) * 100),
				}
			})
		}
	}
	if (next.type === 'texture' || next.texture) {
		return materializeGeneratedTextureFill({ ...next, type: next.type || 'texture' })
	}
	return next
}

function lineOptions(line, fallbackColor = 'CBD5E1') {
	// `undefined` means use the generated-shape default; an explicit `null` is
	// the authoring reset and must suppress the native line component.  Keeping
	// those states distinct is what lets a JSON spec round-trip a deliberate
	// no-line edit instead of silently restoring the theme/default line.
	if (line === null) return { type: 'none' }
	if (line && typeof line === 'object') {
		line = normalizeStructuralShapeLine(line, 'style.line')
		const width = line.width === undefined && line.pt !== undefined ? line.pt : line.width
		return {
			...line,
			...(width !== undefined ? { width } : {}),
			...(line.dash !== undefined && line.dashType === undefined ? { dashType: line.dash } : {}),
		}
	}
	return { color: line || fallbackColor, transparency: 0, width: 1 }
}

function optionalStyleEffects(style = {}) {
	const withArray = applyEffectsArray(style, style.effects)
	const effects = {}
	if (Object.prototype.hasOwnProperty.call(style, 'effects') && (style.effects == null || (Array.isArray(style.effects) && style.effects.length === 0))) effects.effects = []
	if (Object.prototype.hasOwnProperty.call(withArray, 'shadow')) effects.shadow = normalizeShadow(withArray.shadow)
	if (Object.prototype.hasOwnProperty.call(withArray, 'glow')) effects.glow = normalizeGlow(withArray.glow)
	if (Object.prototype.hasOwnProperty.call(withArray, 'reflection')) effects.reflection = normalizeReflection(withArray.reflection)
	if (Object.prototype.hasOwnProperty.call(withArray, 'softEdges')) effects.softEdges = normalizeSoftEdge(withArray.softEdges)
	if (Object.prototype.hasOwnProperty.call(withArray, 'blur')) effects.blur = normalizeBlur(withArray.blur)
	if (Object.prototype.hasOwnProperty.call(withArray, 'fillOverlay')) effects.fillOverlay = normalizeFillOverlay(withArray.fillOverlay)
	// Preserve the authored combination array alongside its lowered typed
	// components so export_spec can teach a fresh client the same effects[]
	// source form after compilation and patch/reset/re-edit.
	if (Object.prototype.hasOwnProperty.call(style, 'effects')) effects.effects = style.effects == null ? style.effects : style.effects.map(effect => ({ ...effect }))
	// Text-character effects are independent native run components. Preserve
	// explicit nulls for component reset semantics and lower the public slider
	// aliases to the library's canonical fields before execution.
	if (Object.prototype.hasOwnProperty.call(style, 'textShadow')) {
		effects.textShadow = style.textShadow == null ? style.textShadow : normalizeShadow(style.textShadow)
	}
	if (Object.prototype.hasOwnProperty.call(style, 'textReflection')) {
		effects.textReflection = style.textReflection == null ? style.textReflection : normalizeReflection(style.textReflection)
	}
	for (const key of ['text3D', 'wordArt', 'textGlow']) {
		if (Object.prototype.hasOwnProperty.call(style, key)) effects[key] = style[key]
	}
	return effects
}

function animationOptions(object = {}) {
	const animation = object.animation ?? object.animations ?? object.style?.animation ?? object.style?.animations
	return animation ? { animation } : {}
}

function rotationOption(object = {}, style = {}, fallback) {
	const hasObject = Object.prototype.hasOwnProperty.call(object, 'rotate')
	const hasStyle = Object.prototype.hasOwnProperty.call(style || {}, 'rotate')
	const hasFallback = fallback !== undefined
	if (!hasObject && !hasStyle && !hasFallback) return {}
	const raw = hasObject ? object.rotate : (hasStyle ? style.rotate : fallback)
	return { rotate: normalizeObjectRotation(raw, `${object.objectName || 'object'}.rotate`) }
}

function flipOptions(object = {}, style = {}, fallback = {}) {
	const out = {}
	for (const key of ['flipH', 'flipV']) {
		const source = Object.prototype.hasOwnProperty.call(object, key)
			? object
			: (Object.prototype.hasOwnProperty.call(style || {}, key) ? style : (Object.prototype.hasOwnProperty.call(fallback || {}, key) ? fallback : null))
		if (!source) continue
		out[key] = normalizeObjectFlip(source[key], `${object.objectName || 'object'}.${key}`)
	}
	return out
}

function accessibleTextForObject(object) {
	if (object.altText !== undefined && object.altText !== null && object.altText !== '') {
		if (typeof object.altText !== 'string' || !object.altText.trim()) {
			const error = new Error(`${object.objectName || 'object'}.altText must be non-empty text.`)
			error.code = 'ACCESSIBILITY_ALT_TEXT_INVALID'
			throw error
		}
		return object.altText
	}
	const source = object.text
	if (Array.isArray(source)) {
		const runs = source.map(item => typeof item === 'string' ? item : item?.text)
		if (runs.some(item => typeof item !== 'string')) {
			const error = new Error(`${object.objectName || 'object'}.text has a non-text rich run.`)
			error.code = 'ACCESSIBILITY_TEXT_INVALID'
			throw error
		}
		return runs.join('') || object.objectName
	}
	if (source !== undefined && source !== null && source !== '' && typeof source !== 'string') {
		const error = new Error(`${object.objectName || 'object'}.text must be text or rich runs.`)
		error.code = 'ACCESSIBILITY_TEXT_INVALID'
		throw error
	}
	return source || object.objectName
}

function textOptions(object, theme = {}, spec = {}) {
	const style = applyNativeStylePreset(object.style || {}, object.wordArtStylePresetId || object.style?.wordArtStylePresetId).style
	const placeholderOptions = placeholderOptionsForObject(object, spec)
	const nativePlaceholderInheritance = nativePlaceholderInheritanceForObject(object, spec, placeholderOptions)
	const authoredRunStyle = {}
	for (const key of ['fontFace', 'fontFaceComplexScript', 'fontSize', 'color', 'bold', 'italic', 'baseline', 'rtl', 'softBreakBefore', 'field']) {
		if (Object.prototype.hasOwnProperty.call(object, key)) authoredRunStyle[key] = object[key]
		else if (Object.prototype.hasOwnProperty.call(style, key)) authoredRunStyle[key] = style[key]
	}
	if (Object.prototype.hasOwnProperty.call(object, 'hyperlink')) authoredRunStyle.hyperlink = object.hyperlink
	else if (Object.prototype.hasOwnProperty.call(style, 'hyperlink')) authoredRunStyle.hyperlink = style.hyperlink
	const normalizedRunStyle = normalizeRichRunOptions(authoredRunStyle, `${object.objectName || object.name || 'text'}.style`, {
		text: Array.isArray(object.text) ? object.text.map(item => item?.text ?? '').join('') : object.text,
	})
	const wordArt = Object.prototype.hasOwnProperty.call(object, 'wordArt') ? object.wordArt : style.wordArt
	const textEffectComponents = { ...style }
	for (const key of ['text3D', 'textShadow', 'textGlow', 'textReflection', 'effects']) {
		if (Object.prototype.hasOwnProperty.call(object, key)) textEffectComponents[key] = object[key]
	}
	const hasTextFill = Object.prototype.hasOwnProperty.call(object, 'textFill') || Object.prototype.hasOwnProperty.call(style, 'textFill')
	const textFill = hasTextFill ? normalizeTextFill(object.textFill !== undefined ? object.textFill : style.textFill, 'textFill') : undefined
	const hasTextOutline = Object.prototype.hasOwnProperty.call(object, 'textOutline') || Object.prototype.hasOwnProperty.call(style, 'textOutline')
	const textOutline = hasTextOutline ? normalizeTextOutline(object.textOutline !== undefined ? object.textOutline : style.textOutline, 'textOutline') : undefined
	const hasCharSpacing = Object.prototype.hasOwnProperty.call(object, 'charSpacing') || Object.prototype.hasOwnProperty.call(style, 'charSpacing')
	const charSpacing = hasCharSpacing ? normalizeCharSpacing(object.charSpacing !== undefined ? object.charSpacing : style.charSpacing, 'charSpacing') : undefined
	const hasLineSpacing = Object.prototype.hasOwnProperty.call(object, 'lineSpacing') || Object.prototype.hasOwnProperty.call(style, 'lineSpacing')
	const hasLineSpacingMultiple = Object.prototype.hasOwnProperty.call(object, 'lineSpacingMultiple') || Object.prototype.hasOwnProperty.call(style, 'lineSpacingMultiple')
	const lineSpacing = hasLineSpacing ? normalizeLineSpacing(object.lineSpacing !== undefined ? object.lineSpacing : style.lineSpacing, 'lineSpacing') : undefined
	const lineSpacingMultiple = hasLineSpacingMultiple ? normalizeLineSpacingMultiple(object.lineSpacingMultiple !== undefined ? object.lineSpacingMultiple : style.lineSpacingMultiple, 'lineSpacingMultiple') : undefined
	const hasParaSpaceBefore = Object.prototype.hasOwnProperty.call(object, 'paraSpaceBefore') || Object.prototype.hasOwnProperty.call(style, 'paraSpaceBefore')
	const hasParaSpaceAfter = Object.prototype.hasOwnProperty.call(object, 'paraSpaceAfter') || Object.prototype.hasOwnProperty.call(style, 'paraSpaceAfter')
	const paraSpaceBefore = hasParaSpaceBefore ? normalizeParagraphSpacing(object.paraSpaceBefore !== undefined ? object.paraSpaceBefore : style.paraSpaceBefore, 'paraSpaceBefore') : undefined
	const paraSpaceAfter = hasParaSpaceAfter ? normalizeParagraphSpacing(object.paraSpaceAfter !== undefined ? object.paraSpaceAfter : style.paraSpaceAfter, 'paraSpaceAfter') : undefined
	const hasIndent = Object.prototype.hasOwnProperty.call(object, 'indent') || Object.prototype.hasOwnProperty.call(style, 'indent')
	const hasHanging = Object.prototype.hasOwnProperty.call(object, 'hanging') || Object.prototype.hasOwnProperty.call(style, 'hanging')
	const hasIndentLevel = Object.prototype.hasOwnProperty.call(object, 'indentLevel') || Object.prototype.hasOwnProperty.call(style, 'indentLevel')
	const hasBullet = Object.prototype.hasOwnProperty.call(object, 'bullet') || Object.prototype.hasOwnProperty.call(style, 'bullet')
	const hasTabStops = Object.prototype.hasOwnProperty.call(object, 'tabStops') || Object.prototype.hasOwnProperty.call(style, 'tabStops')
	const hasMargin = Object.prototype.hasOwnProperty.call(object, 'margin') || Object.prototype.hasOwnProperty.call(style, 'margin')
	const hasVAlign = Object.prototype.hasOwnProperty.call(object, 'valign') || Object.prototype.hasOwnProperty.call(style, 'valign')
	const hasAlign = Object.prototype.hasOwnProperty.call(object, 'align') || Object.prototype.hasOwnProperty.call(style, 'align')
	const hasRtlMode = Object.prototype.hasOwnProperty.call(object, 'rtlMode') || Object.prototype.hasOwnProperty.call(style, 'rtlMode')
	const hasLang = Object.prototype.hasOwnProperty.call(object, 'lang') || Object.prototype.hasOwnProperty.call(style, 'lang')
	const hasUnderline = Object.prototype.hasOwnProperty.call(object, 'underline') || Object.prototype.hasOwnProperty.call(style, 'underline')
	// Layout planning also attaches a diagnostic `fit` object (size/overflow
	// evidence).  It is not an authored bodyPr mode; only a string or explicit
	// null is a real fit control at this boundary.
	const objectFitIsControl = object.fit === null || typeof object.fit === 'string'
	const styleFitIsControl = style.fit === null || typeof style.fit === 'string'
	const rawFit = objectFitIsControl ? object.fit : (styleFitIsControl ? style.fit : undefined)
	const hasFit = objectFitIsControl || styleFitIsControl
	const hasWrap = Object.prototype.hasOwnProperty.call(object, 'wrap') || Object.prototype.hasOwnProperty.call(style, 'wrap')
	const hasVert = Object.prototype.hasOwnProperty.call(object, 'vert') || Object.prototype.hasOwnProperty.call(style, 'vert')
	const align = hasAlign ? normalizeTextAlignment(object.align !== undefined ? object.align : style.align, 'align') : undefined
	const rtlMode = hasRtlMode ? normalizeTextRtlMode(object.rtlMode !== undefined ? object.rtlMode : style.rtlMode, 'rtlMode') : undefined
	const lang = hasLang ? normalizeTextLanguage(object.lang !== undefined ? object.lang : style.lang, 'lang') : undefined
	const underline = hasUnderline ? normalizeTextUnderline(object.underline !== undefined ? object.underline : style.underline, 'underline') : undefined
	const indent = hasIndent ? normalizeParagraphIndent(object.indent !== undefined ? object.indent : style.indent, 'indent') : undefined
	const hanging = hasHanging ? normalizeParagraphIndent(object.hanging !== undefined ? object.hanging : style.hanging, 'hanging') : undefined
	const indentLevel = hasIndentLevel ? normalizeIndentLevel(object.indentLevel !== undefined ? object.indentLevel : style.indentLevel, 'indentLevel') : undefined
	const bullet = hasBullet ? normalizeBulletOptions(object.bullet !== undefined ? object.bullet : style.bullet, 'bullet') : undefined
	const tabStops = hasTabStops ? normalizeTabStops(object.tabStops !== undefined ? object.tabStops : style.tabStops, 'tabStops') : undefined
	const margin = hasMargin ? normalizeTextBoxMargin(object.margin !== undefined ? object.margin : style.margin, 'margin') : undefined
	const valign = hasVAlign ? normalizeTextVerticalAlign(object.valign !== undefined ? object.valign : style.valign, 'valign') : undefined
	const fit = hasFit ? normalizeTextFit(rawFit, 'fit') : undefined
	if (fit === 'resize' && wordArt && textEffectComponents.text3D) {
		throw new Error('fit="resize" cannot be combined with both WordArt and Text3D because PowerPoint renders that native carrier invisible; use fit="none" or fit="shrink".')
	}
	const wrap = hasWrap ? normalizeTextWrap(object.wrap !== undefined ? object.wrap : style.wrap, 'wrap') : undefined
	const vert = hasVert ? normalizeTextDirection(object.vert !== undefined ? object.vert : style.vert, 'vert') : undefined
	const outline = hasTextOutline && textOutline !== null
		? {
			color: {
				color: textOutline?.color || textFill?.color || style.color || 'FFFFFF',
				...(textOutline?.transparency !== undefined && textOutline?.transparency !== null ? { transparency: textOutline.transparency } : {}),
			},
			...(textOutline?.widthPt !== undefined && textOutline?.widthPt !== null ? { size: textOutline.widthPt } : {}),
		}
		: undefined
	const textEffectPresetIds = object.textEffectPresetIds || object.textEffectPresetId || object.style?.textEffectPresetIds || object.style?.textEffectPresetId
	if (textEffectPresetIds) applyTextEffectPresets({}, textEffectPresetIds)
	const authoredSource = authoredBlockForPlannedObject(object, spec) || {}
	const authoredSourceStyle = authoredSource.style && typeof authoredSource.style === 'object' ? authoredSource.style : {}
	const authoredOptionSource = authoredSource.options && typeof authoredSource.options === 'object' ? authoredSource.options : {}
	const explicitlyOwns = key => [authoredSource, authoredSourceStyle, authoredOptionSource].some(source => Object.prototype.hasOwnProperty.call(source, key))
	const hasExplicitFontFace = ['fontFace', 'fontFaceComplexScript'].some(explicitlyOwns)
	const hasExplicitFontSize = explicitlyOwns('fontSize')
	const hasExplicitColor = explicitlyOwns('color') || explicitlyOwns('textFill')
	const hasExplicitBold = explicitlyOwns('bold')
	const hasExplicitShapeStyle = ['fill', 'line', 'shadow', 'glow', 'reflection', 'softEdges', 'blur', 'fillOverlay', 'shape', 'shapeName']
		.some(explicitlyOwns)
	const hasExplicitShapeGeometry = ['shape', 'shapeName'].some(explicitlyOwns)
	return {
		...(nativePlaceholderInheritance ? {} : object.rect),
		objectName: object.objectName,
		editHandle: object.editHandle,
		// Preserve the semantic role on the native text operation.  The layout
		// planner already uses this role for readability floors and collision
		// policy; dropping it at operation lowering made faithful visual-reference
		// text (metadata, labels, captions) look like body copy during validation.
		...(object.role ? { role: object.role } : {}),
		...placeholderOptions,
		...(nativePlaceholderInheritance ? {
			_nativePlaceholderInheritance: true,
			_nativeMinimal: true,
			_omitTransform: true,
			...(hasExplicitShapeStyle && !hasExplicitShapeGeometry ? { _omitShapePrstGeom: true } : {}),
			...(!hasExplicitShapeStyle ? { _emptySpPr: true } : {}),
		} : {}),
		// Keep accessibility text textual even when the authored value is a rich
		// run array. The run array itself is preserved as the semantic `text`
		// value by export_spec; altText remains a human-readable description.
		altText: accessibleTextForObject(object),
		...(!nativePlaceholderInheritance || hasExplicitFontFace ? { fontFace: normalizedRunStyle.fontFace || theme.fontFace || 'Aptos' } : {}),
		...((!nativePlaceholderInheritance || hasExplicitFontFace) && normalizedRunStyle.fontFaceComplexScript !== undefined ? { fontFaceComplexScript: normalizedRunStyle.fontFaceComplexScript } : {}),
		...(!nativePlaceholderInheritance || hasExplicitFontSize ? { fontSize: normalizedRunStyle.fontSize || 16 } : {}),
		// A recommendation may return a contrast-aware executable text color
		// directly.  Preserve it before falling back to authored style/theme.
		...(hasTextFill && textFill === null ? {} : (!nativePlaceholderInheritance || hasExplicitColor ? { color: normalizedRunStyle.color || textFillCompatibilityOptions(textFill).color || '0B1220' } : {})),
		...(!nativePlaceholderInheritance || hasExplicitBold ? { bold: normalizedRunStyle.bold === true } : {}),
		...(normalizedRunStyle.italic !== undefined ? { italic: normalizedRunStyle.italic } : {}),
		...(normalizedRunStyle.baseline !== undefined ? { baseline: normalizedRunStyle.baseline } : {}),
		...(normalizedRunStyle.rtl !== undefined ? { rtl: normalizedRunStyle.rtl } : {}),
		...(normalizedRunStyle.softBreakBefore !== undefined ? { softBreakBefore: normalizedRunStyle.softBreakBefore } : {}),
		...(normalizedRunStyle.field !== undefined ? { field: normalizedRunStyle.field } : {}),
		...(normalizedRunStyle.hyperlink !== undefined ? { hyperlink: normalizeTextHyperlink(normalizedRunStyle.hyperlink, `${object.objectName || object.name || 'text'}.hyperlink`) } : {}),
		...(hasUnderline ? { underline } : {}),
		...(hasAlign ? { align } : {}),
		...(hasRtlMode ? { rtlMode } : {}),
		...(hasLang ? { lang } : {}),
		...(hasVAlign ? { valign } : {}),
		...(hasTextFill && textFill === null ? {} : (textFill?.transparency !== undefined ? { transparency: textFill.transparency } : (style.transparency !== undefined ? { transparency: style.transparency } : {}))),
		...(hasTextFill ? { textFill } : {}),
		...(hasTextOutline && textOutline === null ? {} : (hasTextOutline ? { textOutline, outline } : {})),
		...(hasCharSpacing ? { charSpacing } : {}),
	...(hasLineSpacing ? { lineSpacing } : {}),
	...(hasLineSpacingMultiple ? { lineSpacingMultiple } : {}),
		...(hasParaSpaceBefore ? { paraSpaceBefore } : {}),
		...(hasParaSpaceAfter ? { paraSpaceAfter } : {}),
		...(hasIndent ? { indent } : {}),
		...(hasHanging ? { hanging } : {}),
		...(hasIndentLevel ? { indentLevel } : {}),
		...(hasBullet ? { bullet } : {}),
		...(hasTabStops ? { tabStops } : {}),
		...(style.strike !== undefined ? { strike: style.strike } : {}),
		...(style.highlight !== undefined ? { highlight: style.highlight } : {}),
		...(style.superscript !== undefined ? { superscript: style.superscript } : {}),
		...(style.subscript !== undefined ? { subscript: style.subscript } : {}),
		...(hasMargin ? { margin } : { margin: 0.08 }),
		wrap: style.wrap ?? true,
		// WordArt's native prstTxWarp carrier is incompatible with an emitted
		// normAutofit bodyPr in PowerPoint SaveAs/reopen. Keep ordinary text on
		// the governed shrink default, but use the Office-safe no-autofit default
		// for WordArt unless the author explicitly chooses a fit mode.
		...(hasFit ? { fit } : { fit: wordArt ? 'none' : 'shrink' }),
		...(hasWrap ? { wrap } : { wrap: true }),
		...(hasVert ? { vert } : {}),
		...(style.fill ? { fill: fillOptions(style.fill) } : {}),
		...(style.line ? { line: lineOptions(style.line) } : {}),
		...(object.wordArtStylePresetId || object.style?.wordArtStylePresetId
			? { wordArtStylePresetId: object.wordArtStylePresetId || object.style.wordArtStylePresetId }
			: {}),
		...(textEffectPresetIds
			? { textEffectPresetIds }
			: {}),
		...optionalStyleEffects(textEffectComponents),
		...(wordArt !== undefined ? { wordArt: wordArt === null ? null : normalizeWordArtOptions(wordArt) } : {}),
		...rotationOption(object, style),
		...flipOptions(object, style),
		...animationOptions(object),
	}
}

function shapeOptions(object, theme = {}) {
	const style = object.style || {}
	const shapeStylePresetId = object.shapeStylePresetId ?? style.shapeStylePresetId
	const shapeEffectPresetIds = object.shapeEffectPresetIds || object.shapeEffectPresetId || object.style?.shapeEffectPresetIds || object.style?.shapeEffectPresetId
	const textEffectPresetIds = object.textEffectPresetIds || object.textEffectPresetId || object.style?.textEffectPresetIds || object.style?.textEffectPresetId
	if (textEffectPresetIds) applyTextEffectPresets({}, textEffectPresetIds)
	const componentSource = { ...style }
	for (const key of ['fill', 'line', 'shadow', 'glow', 'reflection', 'softEdges', 'blur', 'fillOverlay', 'effects', 'effect3D', 'rotate', 'flipH', 'flipV']) {
		if (Object.prototype.hasOwnProperty.call(object, key)) componentSource[key] = object[key]
	}
	const authoredFormatting = {
		...(shapeStylePresetId !== undefined ? { shapeStylePresetId } : {}),
		...(shapeEffectPresetIds !== undefined ? { shapeEffectPresetIds } : {}),
		...(Object.prototype.hasOwnProperty.call(componentSource, 'fill') ? { fill: fillOptions(componentSource.fill) } : {}),
		...(Object.prototype.hasOwnProperty.call(componentSource, 'line') ? { line: lineOptions(componentSource.line) } : {}),
		...optionalStyleEffects(componentSource),
		...(Object.prototype.hasOwnProperty.call(componentSource, 'effect3D') ? { effect3D: componentSource.effect3D } : {}),
		...rotationOption(object, style),
		...flipOptions(object, style),
	}
	if (!shapeStylePresetId && !Object.prototype.hasOwnProperty.call(authoredFormatting, 'fill')) authoredFormatting.fill = fillOptions(undefined, 'FFFFFF')
	if (!shapeStylePresetId && !Object.prototype.hasOwnProperty.call(authoredFormatting, 'line')) authoredFormatting.line = lineOptions(undefined, style.accent || 'CBD5E1')
	const formatting = applyShapeFormattingToOptions(authoredFormatting).options
	return {
		...object.rect,
		objectName: object.objectName,
		editHandle: object.editHandle,
		...(object.role ? { role: object.role } : {}),
		...(object._isPureShape === true ? { _isPureShape: true } : {}),
		altText: accessibleTextForObject(object),
		...formatting,
		color: style.color || '0B1220',
		fontFace: style.fontFace || theme.fontFace || 'Aptos',
		fontSize: style.fontSize || 14,
		bold: style.bold === true,
		...(style.align ? { align: style.align } : {}),
		...(Object.prototype.hasOwnProperty.call(style, 'valign') ? { valign: style.valign } : {}),
		margin: 0.08,
		wrap: true,
		fit: 'shrink',
		...(Object.prototype.hasOwnProperty.call(object, 'hyperlink') || Object.prototype.hasOwnProperty.call(style, 'hyperlink')
			? { hyperlink: normalizeTextHyperlink(object.hyperlink !== undefined ? object.hyperlink : style.hyperlink, `${object.objectName || object.name || 'shape'}.hyperlink`) }
			: {}),
		...(object.wordArtStylePresetId ? { wordArtStylePresetId: object.wordArtStylePresetId } : {}),
		...(textEffectPresetIds
			? { textEffectPresetIds }
			: {}),
		...(style.rectRadius ? { rectRadius: style.rectRadius } : {}),
		...animationOptions(object),
	}
}

function connectorOptions(object, theme = {}) {
	const style = object.style || {}
	const ownsPreset = Object.prototype.hasOwnProperty.call(object, 'connectorStylePresetId') || Object.prototype.hasOwnProperty.call(style, 'connectorStylePresetId')
	const presetId = Object.prototype.hasOwnProperty.call(object, 'connectorStylePresetId')
		? object.connectorStylePresetId
		: style.connectorStylePresetId
	// Layout defaults may still carry the legacy color-string shorthand. Only a
	// public typed object/null is authored connector state; a string remains the
	// generic compatibility fallback and must not be mistaken for an override.
	const ownsObjectLine = Object.prototype.hasOwnProperty.call(object, 'line') && (object.line === null || typeof object.line === 'object')
	const ownsStyleLine = Object.prototype.hasOwnProperty.call(style, 'line') && (style.line === null || typeof style.line === 'object')
	const ownsLine = ownsObjectLine || ownsStyleLine
	const authoredLine = Object.prototype.hasOwnProperty.call(object, 'line') ? object.line : style.line
	const options = {
		...object.rect,
		objectName: object.objectName,
		editHandle: object.editHandle,
		connectorType: object.connectorType || object.connectorShape || 'straightConnector1',
		...(object.routing !== undefined ? { routing: object.routing } : {}),
		...(!ownsPreset && !ownsLine ? { line: lineOptions(undefined, style.accent || '64748B') } : {}),
		...(object.startShapeId !== undefined ? { startShapeId: object.startShapeId } : {}),
		...(object.startConnectionIndex !== undefined ? { startConnectionIndex: object.startConnectionIndex } : {}),
		...(object.endShapeId !== undefined ? { endShapeId: object.endShapeId } : {}),
		...(object.endConnectionIndex !== undefined ? { endConnectionIndex: object.endConnectionIndex } : {}),
		...normalizeConnectorEffects({ ...style, ...Object.fromEntries(CONNECTOR_EFFECT_FIELDS.filter(key => Object.prototype.hasOwnProperty.call(object, key)).map(key => [key, object[key]])) }, `${object.objectName || object.name || 'connector'}.style`),
		...(Object.prototype.hasOwnProperty.call(object, 'hyperlink') || Object.prototype.hasOwnProperty.call(style, 'hyperlink')
			? { hyperlink: normalizeTextHyperlink(object.hyperlink !== undefined ? object.hyperlink : style.hyperlink, `${object.objectName || object.name || 'connector'}.hyperlink`) }
			: {}),
		...rotationOption(object, style),
		...flipOptions(object, style),
		...animationOptions(object),
	}
	if (!ownsPreset && !ownsLine) return options
	const state = resolveConnectorStyleComposition({
		...(ownsPreset ? { connectorStylePresetId: normalizeConnectorStylePresetId(presetId, 'connectorStylePresetId') } : {}),
		...(ownsLine ? { line: normalizeConnectorLineOverrides(authoredLine, 'style.line') } : {}),
	})
	return applyConnectorStyleComposition(options, state).options
}

function groupOptions(object, theme = {}, assets = new Map(), spec = {}) {
	const publicLeafOptions = options => Object.fromEntries(Object.entries(options || {}).filter(([key, value]) => value !== undefined && !key.startsWith('_') && !['x', 'y', 'w', 'h', 'objectName', 'editHandle', 'altText', 'animation', 'animations'].includes(key)))
	const childOptions = (child, index, parentName) => {
		const style = child.style || {}
		const kind = child.kind || 'shape'
		const objectName = child.objectName || child.name || `${parentName || 'group'} child ${index + 1}`
		const base = {
			kind, objectName,
			...(child.name ? { name: child.name } : {}),
			...(child.editHandle ? { editHandle: child.editHandle } : {}),
			...(child.altText !== undefined ? { altText: child.altText } : {}),
			x: child.x, y: child.y, w: child.w, h: child.h,
			...rotationOption(child, style, child.rotation),
			...flipOptions(child, style),
		}
		const plannedChild = { ...child, objectName, blockName: child.name || objectName, slideId: object.slideId, slideIndex: object.slideIndex, rect: { x: child.x, y: child.y, w: child.w, h: child.h } }
		if (['text', 'textBox', 'textShape'].includes(kind)) {
			const text = paragraphize(normalizeAuthoringText(child.text, `${objectName}.text`))
			const options = kind === 'textShape' ? textShapeOptions(plannedChild, theme, spec) : textOptions(plannedChild, theme, spec)
			return { ...base, text, style: publicLeafOptions(options), ...(kind === 'textShape' ? { shape: child.shape || child.shapeName || 'roundRect' } : {}) }
		}
		if (kind === 'image' || kind === 'image-feature') {
			// An assetRef may be a spec asset id or an already-uploaded immutable
			// handle. Preserve that source instead of creating a placeholder image.
			if (child.assetRef && !assets.has(child.assetRef) && !plannedChild.source && !plannedChild.imageOptions?.source) plannedChild.source = { kind: 'asset', ref: child.assetRef }
			const options = publicLeafOptions(imageOptionsForObject(plannedChild, assets, spec))
			if (options.sizing) options.sizing = { type: options.sizing.type }
			return { ...base, ...(child.assetRef ? { assetRef: child.assetRef } : {}), imageOptions: options }
		}
		if (kind === 'group') return {
			...base,
			...(child.chOff ? { chOff: child.chOff } : {}),
			...(child.chExt ? { chExt: child.chExt } : {}),
			children: (child.children || []).map((nested, nestedIndex) => childOptions(nested, nestedIndex, objectName)),
		}
		if (kind === 'connector') {
			const options = connectorOptions(plannedChild, theme)
			const readback = connectorStylePublicReadback(options._connectorStyleState)
			return {
				...base,
				connectorType: options.connectorType,
				...Object.fromEntries(['routing', 'startShapeId', 'startConnectionIndex', 'endShapeId', 'endConnectionIndex'].filter(key => options[key] !== undefined).map(key => [key, options[key]])),
				...(readback ? { connectorStylePresetId: readback.connectorStylePresetId, line: readback.line } : { line: options.line }),
				style: { ...connectorEffectsPublicReadback(options), ...(options.hyperlink !== undefined ? { hyperlink: options.hyperlink } : {}) },
			}
		}
		return {
			...base,
			...(child.shape || child.shapeName ? { shape: child.shape || child.shapeName } : {}),
			...(child.connectorType ? { connectorType: child.connectorType } : {}),
			...(child.routing !== undefined ? { routing: child.routing } : {}),
			...(child.startShapeId !== undefined ? { startShapeId: child.startShapeId } : {}),
			...(child.startConnectionIndex !== undefined ? { startConnectionIndex: child.startConnectionIndex } : {}),
			...(child.endShapeId !== undefined ? { endShapeId: child.endShapeId } : {}),
			...(child.endConnectionIndex !== undefined ? { endConnectionIndex: child.endConnectionIndex } : {}),
			...(child.chOff ? { chOff: child.chOff } : {}),
			...(child.chExt ? { chExt: child.chExt } : {}),
			...(Array.isArray(child.children) ? { children: child.children.map((nested, nestedIndex) => childOptions(nested, nestedIndex, child.objectName || `${parentName || 'group'} child ${index + 1}`)) } : {}),
			...(Array.isArray(child.points) ? { points: child.points } : {}),
			...(Array.isArray(child.paths) ? { paths: child.paths } : {}),
			...(child.booleanOperation !== undefined ? { booleanOperation: child.booleanOperation } : {}),
			...(child.operation !== undefined ? { operation: child.operation } : {}),
			...(Array.isArray(child.operands) ? { operands: child.operands } : {}),
			...(child.handle !== undefined ? { handle: child.handle } : {}),
			...(child.geometryId !== undefined ? { geometryId: child.geometryId } : {}),
			style: publicLeafOptions(shapeOptions(plannedChild, theme)),
			fill: child.fill || fillOptions(style.fill, 'FFFFFF'),
			line: child.line || lineOptions(style.line, style.accent || theme.accent || '64748B'),
		}
	}
	const children = Array.isArray(object.children) ? object.children.map((child, index) => childOptions(child, index, object.objectName || 'group')) : []
	return {
		...object.rect,
		objectName: object.objectName,
		editHandle: object.editHandle,
		...(object.chOff ? { chOff: object.chOff } : {}),
		...(object.chExt ? { chExt: object.chExt } : {}),
		children,
		...rotationOption(object, object.style || {}),
		...flipOptions(object, object.style || {}),
		...animationOptions(object),
	}
}

function resolveConnectorGeometry(object, slideObjects = []) {
	if (object?.primitive !== 'connector' || !object.from || !object.to) return object
	const key = value => String(value || '').trim()
	const sourceKey = key(object.from)
	const targetKey = key(object.to)
	const find = name => slideObjects.find(candidate => key(candidate?.objectName) === name || key(candidate?.blockName) === name || key(candidate?.editHandle) === name)
	const source = find(sourceKey)
	const target = find(targetKey)
	if (!source?.rect || !target?.rect) return object
	const sourceIndex = slideObjects.indexOf(source)
	const targetIndex = slideObjects.indexOf(target)
	const sourceCenterY = Number(source.rect.y) + Number(source.rect.h) / 2
	const targetCenterY = Number(target.rect.y) + Number(target.rect.h) / 2
	const sourceIsLeft = Number(source.rect.x) <= Number(target.rect.x)
	const startX = sourceIsLeft ? Number(source.rect.x) + Number(source.rect.w) : Number(source.rect.x)
	const endX = sourceIsLeft ? Number(target.rect.x) : Number(target.rect.x) + Number(target.rect.w)
	const x = Math.min(startX, endX)
	const y = Math.min(sourceCenterY, targetCenterY)
	return {
		...object,
		rect: { x, y, w: Math.max(0.01, Math.abs(endX - startX)), h: Math.max(0.01, Math.abs(targetCenterY - sourceCenterY)) },
		startShapeId: object.startShapeId ?? (sourceIndex >= 0 ? sourceIndex + 2 : undefined),
		endShapeId: object.endShapeId ?? (targetIndex >= 0 ? targetIndex + 2 : undefined),
		startConnectionIndex: object.startConnectionIndex ?? (sourceIsLeft ? 3 : 1),
		endConnectionIndex: object.endConnectionIndex ?? (sourceIsLeft ? 1 : 3),
		placementSource: 'engine',
		placementIntentSource: 'author-semantic-relation',
	}
}

function textShapeOptions(object, theme = {}, spec = {}) {
	const style = applyNativeStylePreset(object.style || {}, object.wordArtStylePresetId || object.style?.wordArtStylePresetId || object.shapeStylePresetId || object.style?.shapeStylePresetId).style
	const hasTextFill = Object.prototype.hasOwnProperty.call(object, 'textFill') || Object.prototype.hasOwnProperty.call(style, 'textFill')
	const textFill = hasTextFill ? normalizeTextFill(object.textFill !== undefined ? object.textFill : style.textFill, 'textFill') : undefined
	const authoredRunStyle = {}
	for (const key of ['fontFace', 'fontFaceComplexScript', 'fontSize', 'color', 'bold', 'italic', 'baseline', 'rtl', 'softBreakBefore', 'field', 'hyperlink']) {
		if (Object.prototype.hasOwnProperty.call(object, key)) authoredRunStyle[key] = object[key]
		else if (Object.prototype.hasOwnProperty.call(style, key)) authoredRunStyle[key] = style[key]
	}
	const normalizedRunStyle = normalizeRichRunOptions(authoredRunStyle, `${object.objectName || object.name || 'textShape'}.style`, {
		text: Array.isArray(object.text) ? object.text.map(item => item?.text ?? '').join('') : object.text,
	})
	const filled = style.fill != null
	const hasAlign = Object.prototype.hasOwnProperty.call(object, 'align') || Object.prototype.hasOwnProperty.call(style, 'align')
	const hasRtlMode = Object.prototype.hasOwnProperty.call(object, 'rtlMode') || Object.prototype.hasOwnProperty.call(style, 'rtlMode')
	const hasLang = Object.prototype.hasOwnProperty.call(object, 'lang') || Object.prototype.hasOwnProperty.call(style, 'lang')
	const hasUnderline = Object.prototype.hasOwnProperty.call(object, 'underline') || Object.prototype.hasOwnProperty.call(style, 'underline')
	const rawFit = object.fit !== undefined ? object.fit : style.fit
	const hasFit = (Object.prototype.hasOwnProperty.call(object, 'fit') || Object.prototype.hasOwnProperty.call(style, 'fit'))
		&& (rawFit === null || typeof rawFit === 'string')
	const hasWrap = Object.prototype.hasOwnProperty.call(object, 'wrap') || Object.prototype.hasOwnProperty.call(style, 'wrap')
	const hasVert = Object.prototype.hasOwnProperty.call(object, 'vert') || Object.prototype.hasOwnProperty.call(style, 'vert')
	const align = hasAlign ? normalizeTextAlignment(object.align !== undefined ? object.align : style.align, 'align') : undefined
	const rtlMode = hasRtlMode ? normalizeTextRtlMode(object.rtlMode !== undefined ? object.rtlMode : style.rtlMode, 'rtlMode') : undefined
	const lang = hasLang ? normalizeTextLanguage(object.lang !== undefined ? object.lang : style.lang, 'lang') : undefined
	const underline = hasUnderline ? normalizeTextUnderline(object.underline !== undefined ? object.underline : style.underline, 'underline') : undefined
	const fit = hasFit ? normalizeTextFit(rawFit, 'fit') : 'shrink'
	const wrap = hasWrap ? normalizeTextWrap(object.wrap !== undefined ? object.wrap : style.wrap, 'wrap') : true
	const vert = hasVert ? normalizeTextDirection(object.vert !== undefined ? object.vert : style.vert, 'vert') : undefined
	return {
		...shapeOptions(object, theme),
		...placeholderOptionsForObject(object, spec),
		shape: object.shapeName || object.shape || 'roundRect',
		...(Object.prototype.hasOwnProperty.call(style, 'margin') ? { margin: style.margin } : { margin: 0.08 }),
		fit,
		wrap,
		...(hasAlign ? { align } : {}),
		...(hasRtlMode ? { rtlMode } : {}),
		...(hasLang ? { lang } : {}),
		...(hasUnderline ? { underline } : {}),
		...(hasVert ? { vert } : {}),
		fontFace: normalizedRunStyle.fontFace || theme.fontFace || 'Aptos',
		...(normalizedRunStyle.fontFaceComplexScript !== undefined ? { fontFaceComplexScript: normalizedRunStyle.fontFaceComplexScript } : {}),
		fontSize: normalizedRunStyle.fontSize || 14,
		color: normalizedRunStyle.color || '0B1220',
		...(hasTextFill ? { textFill, ...textFillCompatibilityOptions(textFill) } : {}),
		bold: normalizedRunStyle.bold === true,
		...(normalizedRunStyle.italic !== undefined ? { italic: normalizedRunStyle.italic } : {}),
		...(normalizedRunStyle.baseline !== undefined ? { baseline: normalizedRunStyle.baseline } : {}),
		...(normalizedRunStyle.rtl !== undefined ? { rtl: normalizedRunStyle.rtl } : {}),
		...(normalizedRunStyle.softBreakBefore !== undefined ? { softBreakBefore: normalizedRunStyle.softBreakBefore } : {}),
		...(normalizedRunStyle.field !== undefined ? { field: normalizedRunStyle.field } : {}),
		...(normalizedRunStyle.hyperlink !== undefined ? { hyperlink: normalizedRunStyle.hyperlink } : {}),
		...(object.wordArtStylePresetId ? { wordArtStylePresetId: object.wordArtStylePresetId } : {}),
		...(object.shapeStylePresetId ? { shapeStylePresetId: object.shapeStylePresetId } : {}),
		// Card depth by default: a filled text card gets a subtle drop shadow unless
		// the author set one. Geometry-only shapes (rails, underlines) are unaffected.
		...(filled && style.shadow !== null && !style.shadow ? { shadow: { type: 'outer', color: '000000', opacity: 0.16, blur: 6, angle: 90, distance: 2 } } : {}),
	}
}

function chartDataForObject(object, sources) {
	if (Array.isArray(object.data) && object.data.length) return object.data
	if (Array.isArray(object.series) && object.series.length) {
		return object.series.map(series => ({
			name: series.name,
			labels: series.labels || [],
			values: series.values || [],
		}))
	}
	const src = sources.get(object.dataRef)
	if (!src?.series?.length) {
		return [
			{ name: 'Series', labels: ['A', 'B', 'C'], values: [1, 2, 3] },
		]
	}
	return src.series.map(series => ({
		name: series.name,
		labels: series.labels || [],
		values: series.values || [],
	}))
}

function normalizeTableRows(rows, object = {}) {
	const preserveNativeStyle = object.preserveNativeStyle === true
	return rows.map((row, rowIndex) => row.map(value => {
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			return {
				text: Array.isArray(value.text) ? value.text.map(run => ({ ...run, ...(run?.options ? { options: { ...run.options } } : {}) })) : String(value.text ?? value.value ?? ''),
				options: value.options || value.style || {},
			}
		}
		return {
			text: String(value ?? ''),
			options: rowIndex === 0 && object.header !== false && !preserveNativeStyle ? {
				bold: true,
				fill: { color: object.style?.headerFill || '2563EB' },
				// This marker is compiler-private and removed before the operation is
				// emitted. It lets rule-style headers distinguish the default fill from
				// an author-provided per-cell fill while preserving author precedence.
				_engineDefaultHeaderFill: true,
				color: 'FFFFFF',
			} : {},
		}
	}))
}

function tableRowsForObject(object, sources) {
	const explicitRows = Array.isArray(object.rows) && object.rows.length
		? object.rows
		: null
	const src = sources.get(object.dataRef)
	const rows = explicitRows || (Array.isArray(src?.rows) && src.rows.length ? src.rows : [['Item', 'Value'], ['No data', '']])
	const header = Array.isArray(object.header) && object.header.length ? object.header : null
	const scalarText = value => Array.isArray(value) ? value.map(run => String(run?.text ?? '')).join('') : String(value ?? '')
	const cellText = cell => (cell && typeof cell === 'object' && !Array.isArray(cell))
		? scalarText(cell.text ?? cell.value ?? '')
		: String(cell ?? '')
	const headerAlreadyPresent = Boolean(header && Array.isArray(rows[0]) && rows[0].length === header.length && header.every((cell, index) => cellText(cell) === cellText(rows[0][index])))
	const materializedRows = header && !headerAlreadyPresent ? [header, ...rows] : rows
	return normalizeTableRows(materializedRows, {
		...object,
		preserveNativeStyle: (object.tableOptions?.tablePresetId || object.tableOptions?.tableStylePresetId || object.tableOptions?.tableStyleId) ? true : object.preserveNativeStyle,
	})
}

// Relative-luminance pick of black/white text for a given fill — keeps a filled
// header (e.g. brutalist bold-flat) legible whatever the world accent is.
function contrastInk(hex) {
	const h = String(hex || '').replace(/^#/, '')
	if (!/^[0-9a-fA-F]{6}$/.test(h)) return '0B0B0B'
	const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
	const lin = c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
	const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
	return L > 0.5 ? '0B0B0B' : 'FFFFFF'
}

// Premium default header emphasis: the first row reads as a designed header. The
// TREATMENT follows the world's data language (M16):
//   'fill'      subtle fill (clean default — aurora/mist)
//   'grid'      subtle fill, grid borders come from the table level (blueprint)
//   'rule'      no fill, bold, thin rule UNDER the header (editorial/luxe magazine)
//   'bold-flat' solid accent fill + auto-contrast text (brutalist poster)
// Author per-cell options always win.
function styleTableHeader(rows, dark, opts = {}) {
	if (!Array.isArray(rows) || !rows.length) return rows
	if (opts.preserveNativeStyle) {
		return rows.map((row, ri) => (Array.isArray(row) ? row.map(cell => {
			const c = (cell && typeof cell === 'object') ? { ...cell } : { text: String(cell ?? '') }
			if (ri === 0) c.options = { bold: true, ...(c.options || {}) }
			return c
		}) : row))
	}
	const style = opts.style || 'fill'
	const headerColor = dark ? 'F4F9FF' : '0B1220'
	const headerFill = dark ? '1B2742' : 'EEF2F7'
	const ruleColor = opts.ruleColor || (dark ? 'C9D4E5' : '0B1220')
	const accent = opts.accent || (dark ? '2DD4BF' : '2563EB')
	let headerOpts
	if (style === 'bold-flat') headerOpts = { bold: true, color: contrastInk(accent), fill: { color: accent } }
	else if (style === 'rule') headerOpts = { bold: true, color: headerColor, border: [{ type: 'none' }, { type: 'none' }, { pt: 1.25, color: ruleColor }, { type: 'none' }] }
	else headerOpts = { bold: true, color: headerColor, fill: { color: headerFill } } // fill + grid
	return rows.map((row, ri) => (Array.isArray(row) ? row.map(cell => {
		const c = (cell && typeof cell === 'object') ? { ...cell } : { text: String(cell ?? '') }
		if (ri === 0) {
			const existing = c.options || {}
			const engineDefaultFill = existing._engineDefaultHeaderFill === true
			const { _engineDefaultHeaderFill: _ignored, ...authorOptions } = existing
			c.options = { ...headerOpts, ...authorOptions }
			// A rule header is typographic: underline only. The fill that
			// normalizeTableRows seeds for ordinary header strings is not author
			// intent and must not override the World data-language contract.
			if (style === 'rule' && engineDefaultFill) delete c.options.fill
		}
		return c
	}) : row))
}

function validatePictureImageAdjustments(input, path = 'imageAdjustments') {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return
	const source = input.imageAdjustments && typeof input.imageAdjustments === 'object'
		? input.imageAdjustments
		: (input.imageOptions && input.imageOptions.imageAdjustments && typeof input.imageOptions.imageAdjustments === 'object'
			? input.imageOptions.imageAdjustments
		: (input.corrections && typeof input.corrections === 'object' ? input.corrections : input)
		)
	const numeric = (value, field, minimum, maximum, unit = 'normalized', step = null) => {
		if (value === undefined || value === null || value === '') return
		const parsed = Number(value)
		if (!Number.isFinite(parsed)) throw new Error(`${path}.${field} must be a finite number in ${unit}.`)
		if (parsed < minimum || parsed > maximum) throw new Error(`${path}.${field} must be between ${minimum} and ${maximum} ${unit}.`)
		if (step !== null) {
			const quantized = Math.round((parsed - minimum) / step) * step + minimum
			if (Math.abs(parsed - quantized) > 1e-9) throw new Error(`${path}.${field} must use a ${step} ${unit} step.`)
		}
	}
	for (const [field, parameter] of Object.entries(PICTURE_CORRECTION_PARAMETERS)) numeric(source[field], field, parameter.minimum, parameter.maximum, parameter.unit, parameter.step)
	const colorMode = source.colorMode == null
		? (source.recolor ? 'recolor' : source.duotone ? 'duotone' : source.grayscale ? 'grayscale' : 'normal')
		: String(source.colorMode).toLowerCase()
	if (!['normal', 'grayscale', 'duotone', 'recolor'].includes(colorMode)) throw new Error(`${path}.colorMode must be normal, grayscale, duotone, or recolor.`)
	const validateEndpoint = (endpoint, fieldPath) => {
		if (endpoint == null) return
		if (typeof endpoint === 'string') return
		if (typeof endpoint !== 'object' || Array.isArray(endpoint)) throw new Error(`${fieldPath} must be a color string or endpoint object.`)
		if (endpoint.scheme != null && !PICTURE_COLOR_SCHEMES.includes(String(endpoint.scheme))) throw new Error(`${fieldPath}.scheme is not a supported DrawingML theme color.`)
		for (const [field, parameter] of Object.entries(PICTURE_COLOR_ENDPOINT_PARAMETERS)) numeric(endpoint[field] ?? (field === 'saturation' ? endpoint.saturationMultiplier : undefined), field, parameter.minimum, parameter.maximum, parameter.unit, parameter.step)
	}
	for (const family of ['recolor', 'duotone']) {
		const mapping = source[family]
		if (mapping == null) continue
		if (typeof mapping !== 'object' || Array.isArray(mapping)) throw new Error(`${path}.${family} must be an object with dark and light endpoints.`)
		validateEndpoint(mapping.dark, `${path}.${family}.dark`)
		validateEndpoint(mapping.light, `${path}.${family}.light`)
	}
	const artistic = source.artisticEffect
	if (artistic != null) {
		if (typeof artistic === 'string') {
			if (!ARTISTIC_EFFECTS.includes(artistic)) throw new Error(`${path}.artisticEffect must name a supported effect.`)
		} else if (typeof artistic !== 'object' || Array.isArray(artistic)) throw new Error(`${path}.artisticEffect must be a string, object, or null.`)
		else {
			const requested = String(artistic.type || artistic.id || '').trim().toLowerCase().replace(/^artistic[._-]?/, '').replace(/[-_\s]/g, '')
			const type = ARTISTIC_EFFECTS.find(candidate => candidate.toLowerCase().replace(/[-_\s]/g, '') === requested)
			if (!type) throw new Error(`${path}.artisticEffect.type must be one of: ${ARTISTIC_EFFECTS.join(', ')}`)
			const parameters = { ...artistic, ...(artistic.parameters && typeof artistic.parameters === 'object' ? artistic.parameters : {}) }
			for (const parameter of ARTISTIC_EFFECT_PARAMETER_CATALOG[type] || []) {
				const keys = [parameter.id, ...(parameter.aliases || [])]
				const authoredKey = keys.find(key => parameters[key] !== undefined && parameters[key] !== null && parameters[key] !== '')
				if (!authoredKey) continue
				numeric(parameters[authoredKey], `artisticEffect.${parameter.id}`, parameter.minimum, parameter.maximum, parameter.unit, parameter.step)
			}
		}
	}
}

// Shape/connector line controls are a shared native surface, not a gallery
// preset. Validate the typed contract before lowering so invalid JSON specs
// fail with a stable public error instead of being silently rounded by the
// DrawingML serializer. Legacy `pt` and `dash` aliases remain accepted and
// are canonicalized by lineOptions. Arrow width and length are independent
// native headEnd/tailEnd dimensions from PowerPoint's 3x3 size grid.
function validateShapeConnectorLine(line, path = 'style.line', allowGradient = false) {
	if (line === undefined || line === null || typeof line === 'string') return
	if (typeof line !== 'object' || Array.isArray(line)) throw new Error(`${path} must be null, a color string, or a line object.`)
	if (allowGradient && line.type === 'gradient') normalizeStructuralShapeLine(line, path)
	const numeric = (value, field, minimum, maximum, unit, step) => {
		if (value === undefined || value === null || value === '') return
		const parsed = Number(value)
		if (!Number.isFinite(parsed)) throw new Error(`${path}.${field} must be a finite number in ${unit}.`)
		if (parsed < minimum || parsed > maximum) throw new Error(`${path}.${field} must be between ${minimum} and ${maximum} ${unit}.`)
		const quantized = Math.round(parsed / step) * step
		if (Math.abs(parsed - quantized) > 1e-9) throw new Error(`${path}.${field} must use a ${step} ${unit} step.`)
	}
	const type = line.type == null ? undefined : String(line.type)
	if (type !== undefined && !['none', 'solid'].includes(type) && !(allowGradient && type === 'gradient')) throw new Error(`${path}.type must be none or solid${allowGradient ? ', or gradient' : ''}.`)
	const dashType = line.dashType !== undefined ? line.dashType : line.dash
	if (dashType != null && !SHAPE_LINE_DASH_TYPES.includes(String(dashType))) throw new Error(`${path}.dashType must be one of: ${SHAPE_LINE_DASH_TYPES.join(', ')}.`)
	for (const field of ['beginArrowType', 'endArrowType']) {
		if (line[field] != null && !SHAPE_LINE_ARROW_TYPES.includes(String(line[field]))) throw new Error(`${path}.${field} must be one of: ${SHAPE_LINE_ARROW_TYPES.join(', ')}.`)
	}
	for (const field of ['beginArrowWidth', 'beginArrowLength', 'endArrowWidth', 'endArrowLength']) {
		if (line[field] != null && !SHAPE_LINE_ARROW_SIZE_VALUES.includes(String(line[field]))) throw new Error(`${path}.${field} must be one of: ${SHAPE_LINE_ARROW_SIZE_VALUES.join(', ')}.`)
	}
	for (const field of ['beginArrowSize', 'endArrowSize']) {
		if (Object.prototype.hasOwnProperty.call(line, field)) throw new Error(`${path}.${field} is not supported; use independent ${field.replace('Size', 'Width')} and ${field.replace('Size', 'Length')} fields.`)
	}
	numeric(line.width !== undefined ? line.width : line.pt, line.width !== undefined ? 'width' : 'pt', 0, 1584, 'points', 1 / 12700)
	numeric(line.transparency, 'transparency', 0, 100, 'percent', 0.001)
}

// Native 3-D scene controls are continuous authoring parameters, not opaque
// preset-only decoration. Validate the public JSON-spec values during dry-run
// so a client gets the same exact-step contract before commit that the runtime
// serializer enforces when it emits DrawingML fixed angles.
function validateNative3DEffect(value, path = 'style.effect3D') {
	if (value === undefined) return
	normalizeText3DOptions(value, path)
}

// Model 3-D View gallery tiles have a native manual override surface too.
// Validate the friendly JSON forms before the library converts them to native
// fixed-point coordinates, so public dry-runs reject impossible slider values
// instead of silently emitting a misleading view.
export function validateModel3DViewOptions(value, path = 'model3d.view') {
	if (value === undefined || value === null) return
	if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object or null.`)
	const finite = (raw, field, { minimum, maximum, integer = false, step = null } = {}) => {
		if (raw === undefined || raw === null || raw === '') return
		const n = Number(raw)
		if (!Number.isFinite(n)) throw new Error(`${path}.${field} must be a finite number.`)
		if (minimum !== undefined && n < minimum || maximum !== undefined && n > maximum) throw new Error(`${path}.${field} must be between ${minimum} and ${maximum}.`)
		if (integer && !Number.isInteger(n)) throw new Error(`${path}.${field} must be an integer.`)
		if (step && Math.abs(n / step - Math.round(n / step)) > 1e-9) {
			const stepLabel = step === 1 / 60000 ? '1/60000-degree' : `${step}-unit`
			throw new Error(`${path}.${field} must use a ${stepLabel} step.`)
		}
	}
	const camera = value.camera
	if (camera !== undefined && camera !== null) {
		if (typeof camera !== 'object' || Array.isArray(camera)) throw new Error(`${path}.camera must be an object or null.`)
		if (camera.fov !== undefined) {
			const fov = Number(camera.fov)
			if (!Number.isFinite(fov) || fov <= 0 || fov > 21600000) throw new Error(`${path}.camera.fov must be a positive degree value <= 360 or a native fixed angle <= 21600000.`)
			if (fov <= 360) finite(fov, 'camera.fov', { minimum: 0.01, maximum: 360, step: 1 / 60000 })
			else finite(fov, 'camera.fov', { minimum: 60000, maximum: 21600000, integer: true })
		}
		if (camera.pos !== undefined && camera.pos !== null) {
			if (typeof camera.pos !== 'object' || Array.isArray(camera.pos)) throw new Error(`${path}.camera.pos must be an object or null.`)
			for (const axis of ['x', 'y', 'z']) finite(camera.pos[axis], `camera.pos.${axis}`, { minimum: -2147483648, maximum: 2147483647, integer: true })
		}
	}
	const trans = value.trans
	if (trans !== undefined && trans !== null) {
		if (typeof trans !== 'object' || Array.isArray(trans)) throw new Error(`${path}.trans must be an object or null.`)
		if (trans.meterPerModelUnit !== undefined && trans.meterPerModelUnit !== null) {
			if (typeof trans.meterPerModelUnit !== 'object' || Array.isArray(trans.meterPerModelUnit)) throw new Error(`${path}.trans.meterPerModelUnit must be an object or null.`)
			for (const key of ['n', 'd']) finite(trans.meterPerModelUnit[key], `trans.meterPerModelUnit.${key}`, { minimum: 1, maximum: 2147483647, integer: true })
		}
		const scale = trans.scale
		if (scale !== undefined && scale !== null) {
			if (typeof scale !== 'object' || Array.isArray(scale)) throw new Error(`${path}.trans.scale must be an object or null.`)
			for (const [friendly, native] of [['x', 'sx'], ['y', 'sy'], ['z', 'sz']]) {
				const raw = scale[friendly] !== undefined ? scale[friendly] : scale[native]
				if (raw !== undefined && raw !== null && Number(raw) <= 100) finite(raw, `trans.scale.${friendly}`, { minimum: 0, maximum: 100, step: 0.000001 })
				else if (raw !== undefined && raw !== null) finite(raw, `trans.scale.${friendly}`, { minimum: 0, maximum: 100000000, integer: true })
			}
		}
		const rot = trans.rot
		if (rot !== undefined && rot !== null) {
			if (typeof rot !== 'object' || Array.isArray(rot)) throw new Error(`${path}.trans.rot must be an object or null.`)
			for (const [friendly, native] of [['x', 'ax'], ['y', 'ay'], ['z', 'az']]) {
				if (rot[native] !== undefined) finite(rot[native], `trans.rot.${native}`, { minimum: -21600000, maximum: 21600000, integer: true })
				else if (rot[friendly] !== undefined) finite(rot[friendly], `trans.rot.${friendly}`, { minimum: -360, maximum: 360, step: 1 / 60000 })
			}
		}
	}
	finite(value.objViewport, 'objViewport', { minimum: 1, maximum: 2147483647, integer: true })
	const ambient = value.ambientLight
	if (ambient !== undefined && ambient !== null) {
		if (typeof ambient !== 'object' || Array.isArray(ambient)) throw new Error(`${path}.ambientLight must be an object or null.`)
		if (ambient.illuminance !== undefined) finite(ambient.illuminance, 'ambientLight.illuminance', { minimum: 0, maximum: 100 })
		if (ambient.color !== undefined && ambient.color !== null) {
			if (typeof ambient.color !== 'object' || Array.isArray(ambient.color)) throw new Error(`${path}.ambientLight.color must be an object or null.`)
			for (const channel of ['r', 'g', 'b']) finite(ambient.color[channel], `ambientLight.color.${channel}`, { minimum: 0, maximum: 100000 })
		}
	}
	if (value.ptLights !== undefined && value.ptLights !== null) {
		if (!Array.isArray(value.ptLights) || value.ptLights.length > 3) throw new Error(`${path}.ptLights must be an array with at most three point lights.`)
		value.ptLights.forEach((light, index) => {
			if (!light || typeof light !== 'object' || Array.isArray(light)) throw new Error(`${path}.ptLights[${index}] must be an object.`)
			finite(light.intensity, `ptLights[${index}].intensity`, { minimum: 0, maximum: 100 })
			if (light.pos !== undefined && light.pos !== null) {
				for (const axis of ['x', 'y', 'z']) finite(light.pos[axis], `ptLights[${index}].pos.${axis}`, { minimum: -2147483648, maximum: 2147483647, integer: true })
			}
			if (light.color !== undefined && light.color !== null) for (const channel of ['r', 'g', 'b']) finite(light.color[channel], `ptLights[${index}].color.${channel}`, { minimum: 0, maximum: 100000 })
		})
	}
}

function imageOptionsForObject(object, assets, spec = {}) {
	const specSlide = (spec.slides || []).find(slide => slide?.id === object.slideId) || (spec.slides || [])[Number(object.slideIndex)] || {}
	const authoredBlock = (specSlide.content || []).find(block => block && (block.name || block.objectName) === object.blockName) || {}
	const asset = assets.get(object.assetRef || authoredBlock.assetRef)
	const style = object.style || {}
	const accessibilityInput = object.imageAccessibility ?? authoredBlock.imageAccessibility
	const authoredAccessibility = accessibilityInput !== undefined
		? validateImageAccessibilityOptions(accessibilityInput, `slides[${object.slideIndex ?? '?'}].${object.objectName || 'image'}.imageAccessibility`)
		: (Object.prototype.hasOwnProperty.call(authoredBlock, 'altText') ? { altText: validateImageAltText(authoredBlock.altText, `slides[${object.slideIndex ?? '?'}].${object.objectName || 'image'}.altText`) } : null)
	const mergedOptions = {
		...(asset?.options && typeof asset.options === 'object' ? asset.options : {}),
		...(authoredBlock.imageOptions && typeof authoredBlock.imageOptions === 'object' ? authoredBlock.imageOptions : {}),
		...(object.imageOptions && typeof object.imageOptions === 'object' ? object.imageOptions : {}),
	}
	if (Object.prototype.hasOwnProperty.call(authoredBlock, 'source')) mergedOptions.source = authoredBlock.source
	if (Object.prototype.hasOwnProperty.call(object, 'source')) mergedOptions.source = object.source
	if (Object.prototype.hasOwnProperty.call(authoredBlock, 'pictureAdjuncts')) mergedOptions.pictureAdjuncts = authoredBlock.pictureAdjuncts
	if (Object.prototype.hasOwnProperty.call(object, 'pictureAdjuncts')) mergedOptions.pictureAdjuncts = object.pictureAdjuncts
	const semanticSource = Object.prototype.hasOwnProperty.call(mergedOptions, 'source')
		? validateImageAssetSource(mergedOptions.source, `slides[${object.slideIndex ?? '?'}].${object.objectName || 'image'}.source`)
		: null
	if (Object.prototype.hasOwnProperty.call(mergedOptions, 'pictureAdjuncts')) {
		mergedOptions.pictureAdjuncts = validatePictureAdjuncts(mergedOptions.pictureAdjuncts, `slides[${object.slideIndex ?? '?'}].${object.objectName || 'image'}.pictureAdjuncts`)
	}
	if (Object.prototype.hasOwnProperty.call(object, 'sizing')) mergedOptions.sizing = object.sizing
	const rawImageAdjustments = object.imageAdjustments || object.imageOptions || mergedOptions
	validatePictureImageAdjustments(rawImageAdjustments, `image.${object.objectName || 'picture'}.imageAdjustments`)
	const normalizedImageAdjustments = normalizeImageAdjustments(rawImageAdjustments)
	if (Object.prototype.hasOwnProperty.call(object, 'pictureStyle')) mergedOptions.pictureStyle = normalizePictureStyle(object.pictureStyle, `slides[${object.slideIndex ?? '?'}].${object.objectName || 'image'}.pictureStyle`)
	else if (Object.prototype.hasOwnProperty.call(mergedOptions, 'pictureStyle')) mergedOptions.pictureStyle = normalizePictureStyle(mergedOptions.pictureStyle, `slides[${object.slideIndex ?? '?'}].${object.objectName || 'image'}.imageOptions.pictureStyle`)
	if (Object.prototype.hasOwnProperty.call(mergedOptions, 'sizing')) mergedOptions.sizing = normalizeImageSizing(mergedOptions.sizing, `slides[${object.slideIndex ?? '?'}].${object.objectName || 'image'}.sizing`)
	const pictureStylePresetId = object.pictureStylePresetId || mergedOptions.pictureStylePresetId
	if (pictureStylePresetId && !pictureStylePresetById(pictureStylePresetId)) {
		throw new Error(`Unknown picture style preset: ${pictureStylePresetId}`)
	}
	// Image framing is a semantic authoring decision.  The client may request
	// `sizing:{type:'cover'|'contain'|'crop'}`, but it must not supply a second
	// set of coordinates that can drift from the Director layout.  Materialize
	// the target box from the engine-owned object rect immediately before the
	// library call.  This keeps the public contract semantic while preserving
	// the native serializer's deterministic srcRect/stretch output.
	if (mergedOptions.sizing && typeof mergedOptions.sizing === 'object' && mergedOptions.sizing.type && object.rect) {
		const sizing = mergedOptions.sizing
		const hasClientGeometry = ['x', 'y', 'w', 'h'].some(key => Object.prototype.hasOwnProperty.call(sizing, key))
		if (!hasClientGeometry) {
			mergedOptions.sizing = {
				...sizing,
				x: object.rect.x,
				y: object.rect.y,
				w: object.rect.w,
				h: object.rect.h,
			}
			mergedOptions._semanticSizing = true
		}
	}
	// Preserve the source aspect ratio for native cover/contain/crop XML.  This
	// is measured by the engine from an inline raster; clients never author or
	// receive these private dimensions.
	let sourceDimensions = null
	const explicitInlineData = semanticSource?.kind === 'inline' ? semanticSource.data : (object.data || authoredBlock.data || object.image?.data || authoredBlock.image?.data || asset?.data)
	const inlineSource = explicitInlineData || (typeof object.image === 'string' && object.image)
	const isInlineImagePayload = value => typeof value === 'string'
		&& (/^data:image\//i.test(value) || /^image\/[^;,]+;base64,/i.test(value))
	if (isInlineImagePayload(inlineSource)) {
		sourceDimensions = inlineImageDimensions(inlineSource)
	}
	const handle = object.data || authoredBlock.data || object.path || authoredBlock.path || object.url || authoredBlock.url ||
		(object.image && typeof object.image === 'object' ? (object.image.data || object.image.path || object.image.url || object.image.handle) : object.image) ||
		(authoredBlock.image && typeof authoredBlock.image === 'object' ? (authoredBlock.image.data || authoredBlock.image.path || authoredBlock.image.url || authoredBlock.image.handle) : authoredBlock.image) ||
		asset?.data || asset?.path || asset?.url || asset?.filePath || asset?.handle ||
		(semanticSource?.kind === 'inline' ? semanticSource.data : semanticSource?.kind === 'asset' ? semanticSource.ref : semanticSource?.url)
	const visualGeneration = handle ? null : buildVisualGenerationPlan({ spec, slide: specSlide, block: object, rect: object.rect })
	const visualRoute = handle || (!object.visualIntent && !object.generation && object.generate !== true)
		? null
		: routeVisualNeed({ spec, slide: specSlide, block: object })
	const imageSource = {}
	// Preserve source-field semantics. A value authored under `data` is inline
	// media even when it uses PptxGenJS's compact `image/png;base64,...` form
	// instead of a browser-style `data:image/png;base64,...` URI. Reclassifying
	// it from its string shape alone makes the media loader treat base64 as a
	// filesystem path and breaks otherwise portable public JSON specs.
	if (semanticSource) imageSource.source = semanticSource
	else if (typeof explicitInlineData === 'string' && explicitInlineData) imageSource.data = explicitInlineData
	else if (isInlineImagePayload(handle)) imageSource.data = handle
	else if (typeof handle === 'string' && handle) imageSource.path = handle
	return {
		...object.rect,
		objectName: object.objectName,
		editHandle: object.editHandle,
		...placeholderOptionsForObject(object, spec),
		altText: authoredAccessibility?.altText || object.altText || asset?.altText || object.objectName,
		...imageSource,
		...(visualGeneration ? { visualGeneration } : {}),
		...(visualRoute ? { visualRoute } : {}),
		...(!handle && !visualGeneration ? { data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=' } : {}),
		transparency: object.transparency ?? mergedOptions.transparency ?? asset?.transparency ?? normalizedImageAdjustments?.transparency ?? ((handle || visualGeneration) ? 0 : 85),
		// M21 — declarative raster ops (crop/duotone/highlight/deviceFrame/...) applied by
		// the internal engine at execute; percent regions keep replays deterministic.
		...(Array.isArray(object.imageOps) && object.imageOps.length ? { imageOps: object.imageOps } : {}),
		...mergedOptions,
		...(pictureStylePresetId ? { pictureStylePresetId } : {}),
		...(style.line ? { line: lineOptions(style.line) } : {}),
		...optionalStyleEffects(style),
		...(style.effect3D ? { effect3D: style.effect3D } : {}),
		...(sourceDimensions && Number.isFinite(sourceDimensions.width) && Number.isFinite(sourceDimensions.height)
			? { _imageSourceW: sourceDimensions.width, _imageSourceH: sourceDimensions.height }
			: {}),
		...animationOptions(object),
		...(normalizedImageAdjustments
			? { imageAdjustments: normalizedImageAdjustments }
			: {}),
		// Preserve the planned layer role through native materialization. A
		// reference photograph marked as background is not foreground proof.
		...(object.role ? { role: object.role } : {}),
		...rotationOption(object, style, mergedOptions.rotate),
		...flipOptions(object, style, mergedOptions),
	}
}

function smartArtNodesForObject(object) {
	if (Array.isArray(object.nodes) && object.nodes.length) return object.nodes
	if (Array.isArray(object.items) && object.items.length) {
		return object.items.map(item => {
			if (item && typeof item === 'object') {
				return {
					text: item.text || item.label || item.name || '',
					title: item.label || item.name || undefined,
					...(item.role ? { role: item.role } : {}),
					...(item.color ? { color: item.color } : {}),
					...(item.image || item.imageData || item.imageUrl || item.imagePath ? { image: item.image || item.imageData || item.imageUrl || item.imagePath } : {}),
					...(Array.isArray(item.children) ? { children: item.children } : {}),
				}
			}
			return String(item || '')
		})
	}
	return ['Discover', 'Explain', 'Apply']
}

function smartArtOptionsForObject(object, spec) {
	const style = object.style || {}
	const theme = spec.theme || {}
	const resolvedPalette = resolvedPaletteForSpec(spec)
	const mode = object.mode || object.smartArtMode || 'native'
	return {
		...object.rect,
		objectName: object.objectName,
		...(object.altText || object.summary ? { altText: object.altText || object.summary } : {}),
		editHandle: object.editHandle,
		// The slide already owns its visible title through the semantic title
		// block. Do not fall back to the internal objectName: that leaks an
		// implementation handle into the rendered deck as a fake diagram heading.
		title: object.title || object.text || undefined,
		// Preserve exact catalog selections from the semantic spec.  Previously
		// layoutId/layoutName were dropped here, so a picture layout could degrade
		// to the generic process default and bypass its required-image contract.
		layout: object.layout || object.smartArtLayout || object.layoutName || object.layoutId || 'process',
		...(object.layoutId ? { layoutId: object.layoutId } : {}),
		...(object.layoutName ? { layoutName: object.layoutName } : {}),
		...(object.presetFallback ? { presetFallback: object.presetFallback } : {}),
		...(object.rightToLeft !== undefined ? { rightToLeft: object.rightToLeft } : {}),
		mode,
		nodes: smartArtNodesForObject(object),
		// Forward the resolved color/quick style so native SmartArt renders in the
		// deck's single-accent style instead of PowerPoint's rainbow Office default.
		// (layout-engine sets a monochrome accent1_* default; without this passthrough
		// addSmartArt fell back to colorful1 — the long-standing D-SmartArt-palette bug.)
		...(object.colorStyleId ? { colorStyleId: object.colorStyleId } : {}),
		...(object.colorStyleName ? { colorStyleName: object.colorStyleName } : {}),
		...(object.quickStyleId ? { quickStyleId: object.quickStyleId } : {}),
		...(object.quickStyleName ? { quickStyleName: object.quickStyleName } : {}),
		palette: object.palette || style.palette || theme.palette || resolvedPalette.raw,
		...rotationOption(object, style),
		...flipOptions(object, style),
		fill: fillOptions(style.fill, 'FFFFFF'),
		line: lineOptions(style.line, style.accent || 'CBD5E1'),
		fontFace: object.fontFace ?? style.fontFace ?? theme.fontFace ?? 'Aptos',
		fontSize: object.fontSize ?? style.fontSize ?? 12,
		color: object.color ?? style.color ?? resolvedPalette.ink,
		...(Array.isArray(object.textColors) ? { textColors: object.textColors } : {}),
		...(Array.isArray(style.textColors) ? { textColors: style.textColors } : {}),
		...(object.title !== undefined ? { title: object.title } : {}),
		...(object.altText !== undefined || object.summary !== undefined ? { altText: object.altText || object.summary } : {}),
		...(style.shadow ? { shadow: style.shadow } : {}),
		...(mode === 'shape' ? animationOptions(object) : {}),
	}
}

function equationOptionsForObject(object, spec) {
	const style = object.style || {}
	const theme = spec.theme || {}
	const presetId = object.equationGalleryPresetId || object.equationPresetId
	const options = {
		...object.rect,
		objectName: object.objectName,
		editHandle: object.editHandle,
		source: object.source !== undefined ? object.source : (object.equation !== undefined ? object.equation : (object.text !== undefined ? object.text : (presetId ? undefined : ''))),
		sourceFormat: object.sourceFormat || (typeof (object.source || object.equation) === 'object' ? 'template' : 'unicodeMath'),
		display: object.display ?? style.display,
		fontFace: object.fontFace || style.fontFace || theme.fontFace || 'Cambria Math',
		fontSize: object.fontSize || style.fontSize || 22,
		color: object.color || style.color || '0B1220',
		align: object.align || style.align || 'center',
		lang: object.lang || style.lang || 'en-US',
		italic: object.italic ?? style.italic,
		altText: object.altText || `Equation ${object.objectName}`,
		fallback: object.fallback !== undefined ? object.fallback : false,
		...rotationOption(object, style),
		...flipOptions(object, style),
		...animationOptions(object),
	}
	validateEquationBlock({ kind: 'equation', ...object, ...options }, `equation ${object.objectName || ''}`)
	return presetId ? {
		...applyEquationGalleryPreset(options, presetId, object.parameters || object.slots || {}).options,
		equationGalleryPresetId: presetId,
		// The compiler has already applied the caller's semantic parameters. The
		// execution boundary retains the id for governed selection proof but must
		// not reapply the unparameterized gallery template over this source.
		_equationPresetResolved: true,
	} : options
}

// Semantic 3D front-door: fold the author's intent fields into a catalog-selection
// query. Returns null when the block carries no query at all (a pure placeholder).
function model3dSelectionArgs(object = {}) {
	const query = String(object.query || object.context || object.prompt || '').trim()
	const intent = object.intent ? String(object.intent).trim() : ''
	const useCase = object.useCase ? String(object.useCase).trim() : ''
	const aiContext = object.aiContext ? String(object.aiContext).trim() : ''
	if (!query && !intent && !useCase && !aiContext) return null
	const args = {}
	if (query) args.query = query
	if (intent) args.intent = intent
	if (useCase) args.useCase = useCase
	if (aiContext) args.aiContext = aiContext
	if (object.sizePolicy) args.sizePolicy = object.sizePolicy
	if (object.preferNative !== undefined) args.preferNative = object.preferNative
	if (object.maxModelSizeMb !== undefined) args.maxModelSizeMb = object.maxModelSizeMb
	return args
}

function model3DOptionsForObject(object, assets, ctx = {}) {
	const asset = assets.get(object.assetRef)
	const style = object.style || {}
	const modelOptions = object.modelOptions && typeof object.modelOptions === 'object' ? object.modelOptions : {}
	const model3dViewPresetId = object.model3dViewPresetId || object.modelOptions?.model3dViewPresetId || style.model3dViewPresetId
	if (model3dViewPresetId && !model3dViewPresetById(model3dViewPresetId)) throw new Error(`Unknown Model 3D view preset: ${model3dViewPresetId}`)
	let modelAsset = object.modelAsset || object.model3DAsset || object.model || style.modelAsset || asset?.handle || asset?.modelAsset
	let posterAsset = object.posterAsset || object.poster || style.posterAsset || asset?.posterAsset || asset?.posterHandle
	// No explicit handle, but the author expressed INTENT — resolve the best native catalog
	// model at compile time so dryRun shows the real pick and the spec round-trips with a
	// stable handle. The resolver is injected by the engine (the catalog lives upstream of
	// this pure module). When it is absent (e.g. a patch-only compile) the semantic fields
	// are forwarded so the engine resolves them at execution time.
	const selectionArgs = modelAsset ? null : model3dSelectionArgs(object)
	let resolvedSelection = null
	if (selectionArgs && typeof ctx.resolveModel3d === 'function') {
		const picked = ctx.resolveModel3d(selectionArgs)
		if (picked && picked.handle) {
			modelAsset = picked.handle
			if (!posterAsset && picked.posterHandle) posterAsset = picked.posterHandle
			resolvedSelection = { handle: picked.handle, title: picked.title, source: picked.source }
		}
	}
	const forwardSemantic = !modelAsset && selectionArgs ? selectionArgs : null
	const authoredViewOptions = {}
	for (const key of ['camera', 'trans', 'ambientLight', 'ptLights', 'objViewport']) {
		if (object[key] !== undefined) authoredViewOptions[key] = object[key]
		if (modelOptions[key] !== undefined) authoredViewOptions[key] = modelOptions[key]
	}
	validateModel3DViewOptions(authoredViewOptions, `slides[${object.slideIndex ?? '?' }].${object.objectName || 'model3d'}.view`)
	const staticPose = model3dStaticPose(object)
	const scene = normalizeStaticPoseScene(modelOptions.scene ?? object.scene, staticPose)
	const motionFraming = model3dMotionFraming(object)
	if (motionFraming !== undefined) validateModel3dMotionFramingOptions({ ...authoredViewOptions, model3dViewPresetId, scene, motionFraming }, 'model3d')
	if (motionFraming && typeof ctx.validateMotionFraming === 'function') ctx.validateMotionFraming(modelOptions.modelAsset || modelAsset, { ...object.rect, ...modelOptions, scene, staticPose, motionFraming })
	if (staticPose !== undefined) normalizeModel3dOptions({ ...modelOptions, staticPose, ...(scene !== undefined ? { scene } : {}) }, 'model3d.modelOptions')
	if (staticPose || scene?.motionId) {
		if (typeof ctx.validateStaticPose !== 'function') throw staticPoseError('STATIC_POSE_VALIDATION_REQUIRED', 'staticPose requires validation against the original approved presenter asset before compilation.')
		ctx.validateStaticPose(modelOptions.modelAsset || modelAsset, staticPose)
	}
	return {
		...object.rect,
		objectName: object.objectName,
		editHandle: object.editHandle,
		altText: object.altText || asset?.altText || resolvedSelection?.title || object.text || object.objectName,
		...(modelAsset ? { modelAsset } : {}),
		...(posterAsset ? { posterAsset } : {}),
		...(model3dViewPresetId ? { model3dViewPresetId } : {}),
		...(resolvedSelection ? { _model3dSelection: resolvedSelection } : {}),
		...(forwardSemantic || {}),
		nativeOnly: object.nativeOnly !== false,
		// Framing defaults: FIT the whole model (scale 1.0 — a >1 zoom cropped the
		// ends of elongated models like batteries), a comfortable camera distance,
		// a clean 3/4 view (yaw + slight pitch, NO roll), and a soft downward
		// grounding shadow so the model sits on the slide instead of hovering.
		...(object.camera ? { camera: object.camera } : model3dViewPresetId || motionFraming ? {} : { camera: { pos: { x: 0, y: 0, z: 90000000 }, fov: 28 } }),
		...(object.trans ? { trans: object.trans } : model3dViewPresetId || motionFraming ? {} : { trans: { scale: { x: 1, y: 1, z: 1 }, rot: object.rotation || { x: 12, y: -20, z: 0 } } }),
		...(object.ambientLight ? { ambientLight: object.ambientLight } : model3dViewPresetId ? {} : { ambientLight: { color: { r: 180, g: 212, b: 255 }, illuminance: 0.66 } }),
		...(object.ptLights ? { ptLights: object.ptLights } : model3dViewPresetId ? {} : { ptLights: [
			{ color: { r: 130, g: 235, b: 255 }, intensity: 9, pos: { x: 24000000, y: 56000000, z: 30000000 } },
		] }),
		// Native PowerPoint 3D model effects are a compatibility risk: an implicit
		// shadow also serializes a reflection into am3d:spPr, and Office can fall
		// back to the raster poster instead of hydrating the GLB. Keep effects
		// author-opt-in for model3d; the model's own lights provide depth by default.
		shadow: object.shadow,
		...rotationOption(object, style),
		...flipOptions(object, style),
		// Rigged-model "Scene" selection: activate one embedded glTF animation clip.
		...(object.scene && typeof object.scene === 'object' ? { scene: object.scene } : {}),
		// am3d viewport size (EMU) — PowerPoint sizes the model by this, NOT the shape frame. The presenter-
		// director sets it (frame-height-proportional) so a Baker-flattened performer fills its box head-to-toe.
		...(Number.isFinite(object.objViewport) ? { objViewport: object.objViewport } : {}),
		...modelOptions,
		...(staticPose !== undefined ? { staticPose } : {}),
		...(motionFraming !== undefined ? { motionFraming } : {}),
		...(scene !== undefined ? { scene } : {}),
		...animationOptions(object),
	}
}

function mediaOptionsForObject(object, assets, spec = {}) {
	const asset = assets.get(object.assetRef)
	const authoredMediaOptions = object.mediaOptions && typeof object.mediaOptions === 'object'
		? validatePublicMediaFormatOptions(object.mediaOptions, `content[].${object.objectName || 'media'}.mediaOptions`)
		: {}
	const mergedOptions = {
		...(asset?.options && typeof asset.options === 'object' ? asset.options : {}),
		...authoredMediaOptions,
	}
	const lockedMedia = object.lockedMedia && typeof object.lockedMedia === 'object' ? object.lockedMedia : null
	const authoredSource = authoredMediaOptions.source
	const source = lockedMedia?.handle || object.link || object.url || object.path || object.data || authoredSource ||
		(asset?.link || asset?.url || asset?.path || asset?.data || asset?.handle)
	const sourceOptions = {}
	if (lockedMedia?.handle) sourceOptions.path = lockedMedia.handle
	else if (typeof authoredSource === 'string' && authoredSource) sourceOptions.source = authoredSource
	else if (object.link || object.url || asset?.link || asset?.url) sourceOptions.link = object.link || object.url || asset?.link || asset?.url
	else if (object.path || asset?.path || asset?.handle) sourceOptions.path = object.path || asset?.path || asset?.handle
	else if (object.data || asset?.data) sourceOptions.data = object.data || asset?.data
	delete mergedOptions.source
	const result = {
		...object.rect,
		objectName: object.objectName,
		editHandle: object.editHandle,
		...placeholderOptionsForObject(object, spec),
		type: object.mediaType || object.type || asset?.kind || (source && /^https?:/i.test(String(source)) ? 'online' : 'video'),
		...(object.cover || asset?.cover ? { cover: object.cover || asset.cover } : {}),
		...(lockedMedia?.extn || object.extn || asset?.extn ? { extn: lockedMedia?.extn || object.extn || asset.extn } : {}),
		...(lockedMedia?.durationMs || object.durationMs ? { durationMs: lockedMedia?.durationMs || object.durationMs } : {}),
		altText: object.altText || asset?.altText || `Media ${object.objectName}`,
		...sourceOptions,
		...mergedOptions,
		...animationOptions(object),
	}
	const validated = validateMediaFormatOptions(result, `content[].${object.objectName || 'media'}.mediaOptions`)
	return object.mediaCommandTiming !== undefined ? { ...validated, mediaCommandTiming: object.mediaCommandTiming } : validated
}

function visualShapeArgsForObject(object, theme = {}, extra = {}) {
	const style = object.style || {}
	return {
		...object.rect,
		objectName: object.objectName,
		editHandle: object.editHandle,
		fill: fillOptions(style.fill, 'E0F2FE'),
		line: lineOptions(style.line, style.accent || theme.accent || '38BDF8'),
		...(style.shadow ? { shadow: style.shadow } : {}),
		...(style.glow ? { glow: style.glow } : {}),
		...(style.reflection ? { reflection: normalizeReflection(style.reflection) } : {}),
		...(style.softEdges ? { softEdges: style.softEdges } : {}),
		...(style.effect3D ? { effect3D: style.effect3D } : {}),
		...(object.rotate !== undefined ? { rotate: object.rotate } : {}),
		...(object.altText ? { altText: object.altText } : {}),
		...extra,
		...animationOptions(object),
	}
}

function customGeometryOperationForObject(object, spec, assets) {
	const theme = spec.theme || {}
	const asset = assets.get(object.assetRef)
	const handle = object.handle || object.geometryId || asset?.handle
	const svgSource = object.svg || object.svgText || object.markup || asset?.svg || asset?.svgText
	const pathSource = object.pathData || object.d || asset?.pathData || asset?.d
	const baseArgs = visualShapeArgsForObject(object, theme, object.customGeometryOptions || object.options || {})
	if (handle) {
		return {
			tool: 'betterpptx.custom_geometry.insert',
			objectName: object.objectName,
			args: {
				handle,
				...baseArgs,
				...(object.points ? { points: object.points } : {}),
			},
		}
	}
	if (svgSource || pathSource) {
		return {
			tool: 'betterpptx.custom_geometry.insert_svg',
			objectName: object.objectName,
			args: {
				...baseArgs,
				...(svgSource ? { svg: svgSource } : {}),
				...(pathSource ? { pathData: pathSource } : {}),
				...(object.fit ? { fit: object.fit } : {}),
				...(object.precision ? { precision: object.precision } : {}),
			},
		}
	}
	return {
		tool: 'betterpptx.slide.add_freeform',
		objectName: object.objectName,
		args: {
			...baseArgs,
			points: object.points || freeformFallbackPoints(),
		},
	}
}

function durationForPctTiming(object = {}, timing = {}, audio) {
	const candidates = [
		object.lockedAudio?.durationMs,
		audio && typeof audio === 'object' ? audio.durationMs : undefined,
		object.targetDurationMs,
		timing.targetDurationMs,
		object.expectedDurationMs,
		timing.expectedDurationMs,
		timing.durationMs,
		object.durationMs,
	]
	for (const candidate of candidates) {
		const n = Number(candidate)
		if (Number.isFinite(n) && n > 0) return n
	}
	return null
}

function msFromPct(value, durationMs) {
	const pct = Number(value)
	if (!Number.isFinite(pct) || !Number.isFinite(Number(durationMs)) || Number(durationMs) <= 0) return undefined
	return Math.round((pct / 100) * Number(durationMs))
}

function normalizeTimingPctItem(item, durationMs) {
	if (!item || typeof item !== 'object' || !Number.isFinite(Number(durationMs))) return item
	const out = { ...item }
	if (out.atMs === undefined && out.atPct !== undefined) out.atMs = msFromPct(out.atPct, durationMs)
	if (out.endMs === undefined && out.endPct !== undefined) out.endMs = msFromPct(out.endPct, durationMs)
	return out
}

function normalizeCuesWithPct(cues, durationMs) {
	return Array.isArray(cues) && Number.isFinite(Number(durationMs))
		? cues.map(item => normalizeTimingPctItem(item, durationMs))
		: cues
}

export const NARRATION_CUE_ANCHOR_METHOD = 'duration-proportional-script-position'

function narrationCueAnchorError(message, options = {}, code = 'NARRATION_CUE_ANCHOR_UNRESOLVED') {
	const error = new Error(message)
	error.code = code
	if (options.slideId != null) error.slideId = options.slideId
	if (options.motionId != null) error.motionId = options.motionId
	if (options.segmentIndex != null) error.segmentIndex = options.segmentIndex
	if (options.cueIndex != null) error.cueIndex = options.cueIndex
	return error
}

// One canonical cue grammar is shared by ordinary narration, narration segments, and
// presenter-bound narration. Compatibility aliases are accepted at the boundary, then
// removed so every downstream phase sees atPhrase/atWord/target. Phrase timing is not
// speech alignment: it is a deterministic position within the authored script, scaled
// across the measured clip duration, and the public readback names that method directly.
export function canonicalNarrationCue(cue, options = {}) {
	const authoredText = cue && typeof cue === 'object' && !Array.isArray(cue)
		&& Object.prototype.hasOwnProperty.call(cue, 'text')
	const normalized = normalizeAuthoredCue(cue)
	let out
	if (typeof cue === 'string') out = { atPhrase: cue.trim() }
	else if (normalized) out = { ...normalized }
	else throw narrationCueAnchorError('Narration cue must be an object or a spoken phrase string.', options)

	if (out.atPhrase == null && out.phrase != null) out.atPhrase = out.phrase
	if (out.atWord == null && out.word != null) out.atWord = out.word
	if (out.target == null && out.objectName != null) out.target = out.objectName
	delete out.phrase
	delete out.word
	delete out.objectName
	// `normalizeAuthoredCue` derives caption text from the legacy phrase alias.
	// Canonical compilation should not invent a second public field unless text
	// was actually authored (string cues intentionally remain their own text).
	if (typeof cue !== 'string' && !authoredText) delete out.text

	if (out.atMs != null) {
		const atMs = Number(out.atMs)
		if (!Number.isFinite(atMs) || atMs < 0) {
			throw narrationCueAnchorError('Narration cue atMs must be a finite non-negative number.', options, options.invalidCode || 'NARRATION_CUE_ANCHOR_UNRESOLVED')
		}
		out.atMs = atMs
	}
	if (out.delay != null) {
		const delay = Number(out.delay)
		if (!Number.isFinite(delay) || delay < 0) {
			throw narrationCueAnchorError('Narration cue delay must be a finite non-negative number.', options, options.invalidCode || 'NARRATION_CUE_ANCHOR_UNRESOLVED')
		}
		out.delay = delay
	}
	if (out.atMs == null && out.atPct != null) {
		const atMs = msFromPct(out.atPct, options.durationMs)
		if (atMs === undefined) {
			throw narrationCueAnchorError('Narration cue atPct cannot be resolved without a positive authored or locked audio duration.', options)
		}
		out.atMs = atMs
	}

	for (const field of ['atPhrase', 'atWord']) {
		if (out[field] == null) continue
		out[field] = String(out[field]).trim()
		if (!out[field]) throw narrationCueAnchorError(`Narration cue ${field} must name a non-empty spoken phrase or word.`, options)
	}
	const phrase = out.atPhrase || out.atWord
	if (phrase) {
		const scripts = (Array.isArray(options.scripts) ? options.scripts : [options.script])
			.map(value => String(value || ''))
		if (!scripts.some(script => script.toLowerCase().includes(String(phrase).toLowerCase()))) {
			throw narrationCueAnchorError(`Narration cue phrase "${phrase}" is not present in the authored narration.`, options)
		}
		out.anchorMethod = NARRATION_CUE_ANCHOR_METHOD
	}
	if (out.atMs == null && out.delay == null && !out.atPhrase && !out.atWord) {
		throw narrationCueAnchorError('Narration cue must provide atPhrase, atWord, or a finite non-negative atMs value.', options)
	}
	return out
}

function canonicalNarrationCues(cues, options = {}) {
	if (cues == null) return cues
	if (!Array.isArray(cues)) throw narrationCueAnchorError('Narration cues must be an array.', options)
	return cues.map((cue, cueIndex) => canonicalNarrationCue(cue, { ...options, cueIndex }))
}

// A type:"emphasis" cue with no named effect gets the WORLD's emphasis default (restrained
// attention beat) instead of a stray fade — the full palette stays open (author effect wins).
function withEmphasisDefault(cues, emph) {
	if (!Array.isArray(cues) || !emph) return cues
	return cues.map(c => {
		if (!c || typeof c !== 'object') return c
		if (String(c.type || '').toLowerCase() === 'emphasis' && !c.effect) {
			return { ...c, effect: emph.effect, ...(c.duration == null ? { duration: emph.durationMs } : {}) }
		}
		return c
	})
}

function lockedAudioInput(lockedAudio) {
	if (lockedAudio?.handle) {
		return {
			path: lockedAudio.handle,
			durationMs: lockedAudio.durationMs,
			extn: lockedAudio.extn || lockedAudio.extension || 'wav',
		}
	}
	return lockedAudio
}

function audioInputHasSource(audio) {
	if (typeof audio === 'string') return audio.trim().length > 0
	if (!audio || typeof audio !== 'object' || Array.isArray(audio)) return false
	return Boolean(audio.path || audio.handle || audio.url || audio.data || audio.filePath || audio.buffer)
}

function narrationArgsForObject(object, spec = {}, cueContext = {}) {
	// The generated media/image contract offers one closed narration object for
	// synthesize, attach, and retrieve. Validate that shape at the semantic
	// boundary and lower its portable audio reference into the same internal
	// carrier used by locked narration assets. Legacy narration objects remain
	// supported when they do not declare the closed-contract `mode` selector.
	const providerNarration = object?.mode !== undefined ? object : null
	// M19 voice temperament: the world sets HOW it speaks (pace + pause) when narrated;
	// the author's explicit values always win. Voice identity stays the author's choice.
	const _voice = artVoiceForSpec(spec)
	const _emph = artEmphasisForSpec(spec)
	const timing = object.timing || object.timeline || object.narrationTiming || {}
	const lockedAudioAsInput = lockedAudioInput(object.lockedAudio)
	const providerAudio = providerNarration?.audioRef ? { path: providerNarration.audioRef } : undefined
	const authoredAudio = object.audio && typeof object.audio === 'object' && !Array.isArray(object.audio)
		? {
			...object.audio,
			...(object.durationMs !== undefined && object.audio.durationMs === undefined ? { durationMs: object.durationMs } : {}),
			...(timing.durationMs !== undefined && object.audio.durationMs === undefined ? { durationMs: timing.durationMs } : {}),
		}
		: (object.audio ?? providerAudio)
	const audio = audioInputHasSource(authoredAudio) ? authoredAudio : (lockedAudioAsInput ?? authoredAudio)
	const pctDurationMs = durationForPctTiming(object, timing, audio)
	const rawCues = object.cues ?? timing.cues ?? object.timing?.cues
	const silentNotes = object.synthesizeAudio === false
		|| spec.outputVariant === 'silent-timed-notes'
		|| (Array.isArray(spec.selectedOutputVariants) && spec.selectedOutputVariants.includes('silent-timed-notes'))
	// SEGMENTED NARRATION: an ordered timeline of clips + silence gaps for ONE slide. Each
	// segment carries its own spoken text and the pause after it; the engine synthesizes each
	// clip and schedules it at an absolute offset so the gaps become real silence.
	const rawSegments = Array.isArray(object.segments) ? object.segments
		: Array.isArray(object.script) ? object.script
		: (!silentNotes ? cuesToSynthesisSegments(rawCues, { script: object.script || object.text || '' }) : null)
	const cueScripts = rawSegments
		? rawSegments.map(seg => typeof seg === 'string' ? seg : (seg && (seg.script ?? seg.text)) || '')
		: [Array.isArray(object.script) ? '' : (object.script || object.text || '')]
	const segments = rawSegments ? rawSegments.map((seg, segmentIndex) => {
		if (typeof seg === 'string') return { script: seg }
		if (!seg || typeof seg !== 'object') return null
		const segmentAudio = audioInputHasSource(seg.audio) ? seg.audio : (lockedAudioInput(seg.lockedAudio) ?? seg.audio)
		const segDur = durationForPctTiming(seg, {}, segmentAudio)
		const segmentScript = seg.script ?? seg.text ?? ''
		return Object.fromEntries(Object.entries({
			script: segmentScript,
			synthesisText: seg.synthesisText || normalizeNarrationForTts(segmentScript),
			audio: segmentAudio,
			gapBeforeMs: seg.gapBeforeMs ?? seg.pauseBeforeMs,
			gapAfterMs: seg.gapAfterMs ?? seg.pauseAfterMs ?? seg.pauseMs,
			cues: withEmphasisDefault(canonicalNarrationCues(normalizeCuesWithPct(seg.cues, segDur), {
				...cueContext,
				segmentIndex,
				script: segmentScript,
				durationMs: segDur,
			}), _emph),
			voice: seg.voice,
			lengthScale: seg.lengthScale,
			speaker: seg.speaker,
			provider: seg.provider,
			lang: seg.lang,
			gender: seg.gender,
			objectName: seg.objectName,
			closedCaptionTracks: seg.closedCaptionTracks,
			mediaOptions: seg.mediaOptions,
		}).filter(([, v]) => v !== undefined))
	}).filter(Boolean) : undefined
	const args = {
		script: Array.isArray(object.script) ? '' : (object.script || object.text || ''),
		segments,
		segmentGapMs: object.segmentGapMs ?? timing.segmentGapMs,
		audio,
		cues: withEmphasisDefault(canonicalNarrationCues(normalizeCuesWithPct(rawCues, pctDurationMs), {
			...cueContext,
			scripts: cueScripts,
			durationMs: pctDurationMs,
		}), _emph),
		voice: object.voice || object.voiceId || spec.narration?.voiceId || spec.narration?.voice,
		lang: object.lang || object.language || spec.narration?.lang,
		gender: object.gender || spec.narration?.gender,
		provider: object.provider,
		speaker: object.speaker,
		resolutionPolicy: object.resolutionPolicy,
		costPolicy: object.costPolicy,
		timingAuthority: silentNotes ? object.timingAuthority : (object.timingAuthority || 'generated-audio'),
		lengthScale: object.lengthScale ?? _voice.lengthScale,
		noiseScale: object.noiseScale,
		noiseWScale: object.noiseWScale,
		paddingMs: object.paddingMs ?? timing.paddingMs ?? _voice.paddingMs,
		startDelayMs: object.startDelayMs ?? timing.startDelayMs,
		expectedDurationMs: object.expectedDurationMs ?? object.targetDurationMs ?? timing.expectedDurationMs ?? timing.targetDurationMs ?? timing.durationMs ?? object.durationMs,
		timingToleranceMs: object.timingToleranceMs ?? timing.timingToleranceMs ?? object.durationToleranceMs ?? timing.durationToleranceMs ?? timing.toleranceMs,
		allowUnreviewedVoices: object.allowUnreviewedVoices,
		// Narration is prepared and measured before the final quote/commit.  The
		// opaque preparation reference is carried through compilation so the
		// engine can reuse the exact WAV instead of synthesizing again.
		preparedNarration: object.preparedNarration || object.narrationPreparation || object.preparedAudio,
		objectName: object.objectName,
		transparency: object.transparency,
		synthesizeAudio: silentNotes ? false : object.synthesizeAudio !== false,
		synthesisText: normalizeNarrationForTts(Array.isArray(object.script) ? '' : (object.script || object.text || '')),
		preserveInNotes: object.preserveInNotes !== false,
		useAsTimingAuthority: object.useAsTimingAuthority !== false,
		useGeneratedAudioAsTimingAuthority: silentNotes ? false : object.useGeneratedAudioAsTimingAuthority !== false,
		autoplay: object.autoplay,
		closedCaptionTracks: materializeClosedCaptionTracks(object.audio?.closedCaptionTracks || object.closedCaptionTracks || object.mediaOptions?.closedCaptionTracks, {
			cues: object.cues ?? timing.cues,
			script: Array.isArray(object.script) ? '' : (object.script || object.text || ''),
		}),
		cover: object.cover,
		x: object.rect?.x,
		y: object.rect?.y,
		w: object.rect?.w,
		h: object.rect?.h,
	}
	return Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined))
}

function avatarRenderPolicyArgs(object = {}) {
	const policy = object.renderPolicy && typeof object.renderPolicy === 'object' && !Array.isArray(object.renderPolicy)
		? object.renderPolicy
		: {}
	const policyOptions = policy.options && typeof policy.options === 'object' && !Array.isArray(policy.options)
		? policy.options
		: {}
	const avatarOptions = object.avatarOptions && typeof object.avatarOptions === 'object' && !Array.isArray(object.avatarOptions)
		? object.avatarOptions
		: {}
	return {
		renderPolicy: Object.keys(policy).length ? policy : undefined,
		avatarProvider: object.avatarProvider || policy.provider || policy.engine,
		avatarQuality: object.avatarQuality || object.quality || policy.quality,
		renderMode: object.renderMode || policy.renderMode || policy.executionMode,
		avatarOptions: Object.keys(policyOptions).length || Object.keys(avatarOptions).length
			? { ...policyOptions, ...avatarOptions }
			: undefined,
	}
}

function avatarArgsForObject(object) {
	const timing = object.timing || object.timeline || object.narrationTiming || {}
	const authoredRect = contractRect(object.rect || object.bbox || object.options)
	const lockedVideoHandle = object.lockedVideo?.handle || object.avatarAsset
	const lockedPosterHandle = object.lockedPoster?.handle
	const renderPolicyArgs = avatarRenderPolicyArgs(object)
	const lockedAudioAsInput = lockedAudioInput(object.lockedAudio)
	const args = {
		script: object.script || object.text || '',
		audio: audioInputHasSource(object.audio) ? object.audio : lockedAudioAsInput,
		avatar: object.avatar,
		...renderPolicyArgs,
		avatarProvider: object.avatarProvider || object.provider || renderPolicyArgs.avatarProvider,
		avatarQuality: object.avatarQuality || object.quality || renderPolicyArgs.avatarQuality,
		mode: object.avatarMode || object.mode,
		reuseExistingNarration: object.reuseExistingNarration === true,
		replaceExistingNarrationWithVideo: object.replaceExistingNarrationWithVideo === true,
		replaceExistingRecordStudio: object.replaceExistingRecordStudio === true,
		playTrigger: object.playTrigger || object.options?.playTrigger,
		interactivePlayback: object.interactivePlayback ?? object.options?.interactivePlayback,
		showMediaControls: object.showMediaControls ?? object.options?.showMediaControls,
		// Shape/crop mechanics remain deterministic, while the containing frame is
		// authored by the AI and passed through unchanged.
		rounding: true,
		renderMode: lockedVideoHandle ? 'completedAsset' : renderPolicyArgs.renderMode,
		avatarAsset: lockedVideoHandle,
		cover: object.cover || lockedPosterHandle,
		durationMs: object.lockedVideo?.durationMs || object.durationMs,
		cues: object.cues ?? timing.cues,
		resolutionPolicy: object.resolutionPolicy,
		costPolicy: object.costPolicy,
		timing: {
			...timing,
			...(object.timingAuthority ? { timingAuthority: object.timingAuthority } : {}),
			...(object.targetDurationMs !== undefined ? { targetDurationMs: object.targetDurationMs } : {}),
			...(object.durationToleranceMs !== undefined ? { durationToleranceMs: object.durationToleranceMs } : {}),
		},
		startDelayMs: object.startDelayMs ?? timing.startDelayMs,
		paddingMs: object.paddingMs ?? timing.paddingMs,
		expectedDurationMs: object.expectedDurationMs ?? object.targetDurationMs ?? timing.expectedDurationMs ?? timing.targetDurationMs ?? object.durationMs,
		timingToleranceMs: object.timingToleranceMs ?? timing.timingToleranceMs ?? object.durationToleranceMs ?? timing.durationToleranceMs,
		objectName: object.objectName,
		options: {
			...(object.options && typeof object.options === 'object' ? object.options : {}),
			...(authoredRect || {}),
			objectName: object.objectName,
			_picPrstGeom: 'ellipse',
			avatarFrameContract: 'ellipse-centered-cover-v1',
		},
	}
	return Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined))
}

function freeformFallbackPoints() {
	return [
		{ x: 0.5, y: 0, moveTo: true },
		{ x: 0.96, y: 0.34 },
		{ x: 0.72, y: 0.98 },
		{ x: 0.18, y: 0.86 },
		{ x: 0.04, y: 0.32 },
		{ close: true },
	]
}

// Canonical rich-text arrays are native inline runs. Paragraph boundaries are
// authored explicitly with breakLine, while softBreakBefore represents a native
// Shift+Enter break within the paragraph. Keep the legacy primitive-array
// convenience as stacked lines, but never silently turn typed rich runs into
// paragraphs; doing so would make generate_from_spec disagree with add_text.
function paragraphize(text) {
	if (!Array.isArray(text)) return text
	const last = text.length - 1
	return text.map((item, i) => {
		const next = i < last ? text[i + 1] : null
		const nextSoftBreak = Boolean(next && typeof next === 'object' && next.options?.softBreakBefore === true)
		if (item == null) return item
		if (typeof item === 'string' || typeof item === 'number') {
			return i < last && !nextSoftBreak ? { text: String(item), options: { breakLine: true } } : { text: String(item) }
		}
		if (typeof item === 'object') {
			const options = { ...(item.options || {}) }
			if (options.softBreakBefore === true && i === 0) options.standaloneBreakParagraph = true
			return { ...item, options }
		}
		return item
	})
}

function normalizeAuthoringText(text, path = 'text') {
	if (typeof text === 'string') return text.replace(/\\n/g, '\n')
	if (!Array.isArray(text)) return text
	return text.map((item, index) => {
		if (typeof item === 'string') return item.replace(/\\n/g, '\n')
		if (item && typeof item === 'object') {
			const normalized = { ...item }
			if (normalized.options !== undefined) normalized.options = normalizeRichRunOptions(normalized.options, `${path}[${index}].options`, { text: normalized.text })
			if (typeof normalized.text === 'string') normalized.text = normalized.text.replace(/\\n/g, '\n')
			return normalized
		}
		return item
	})
}

function operationForObject(object, spec, sources, assets, ctx = {}) {
	const theme = spec.theme || {}
	// For Morph-by-object pairs the emitted shape name must match across slides so
	// PowerPoint interpolates them. The stable per-slide edit handle is unchanged.
	if (object.morphName) object = { ...object, objectName: object.morphName }
	if (object.primitive === 'shape' || object.primitive === 'connector') {
		const authoredLine = Object.prototype.hasOwnProperty.call(object, 'line') ? object.line : object.style?.line
		validateShapeConnectorLine(authoredLine, `${object.primitive}.${object.objectName || 'unnamed'}.style.line`, object.primitive === 'shape')
	}
	if (object.primitive === 'shape' || object.primitive === 'textShape' || object.primitive === 'text' || object.primitive === 'textBox') {
		validateNative3DEffect(object.style?.effect3D, `${object.primitive}.${object.objectName || 'unnamed'}.style.effect3D`)
		validateNative3DEffect(object.style?.text3D, `${object.primitive}.${object.objectName || 'unnamed'}.style.text3D`)
	}
	if (object.primitive === 'text' || object.primitive === 'textBox') {
		return {
			tool: 'betterpptx.slide.add_text',
			objectName: object.objectName,
			args: {
				text: paragraphize(normalizeAuthoringText(object.text, `${object.objectName || object.name || 'text'}.text`)) || '',
				options: textOptions(object, theme, spec),
			},
		}
	}
	if (object.primitive === 'textShape') {
		return {
			tool: 'betterpptx.slide.add_text',
			objectName: object.objectName,
			args: {
				text: paragraphize(normalizeAuthoringText(object.text, `${object.objectName || object.name || 'textShape'}.text`)) || '',
				options: textShapeOptions(object, theme, spec),
			},
		}
	}
	if (object.primitive === 'shape') {
		return {
			tool: 'betterpptx.slide.add_shape',
			objectName: object.objectName,
			args: {
				shapeName: object.shapeName || 'roundRect',
				options: shapeOptions(object, theme),
			},
		}
	}
	if (object.primitive === 'connector') {
		return {
			tool: 'betterpptx.slide.add_connector',
			objectName: object.objectName,
			args: { options: connectorOptions(object, theme) },
		}
	}
	if (object.primitive === 'group') {
		return {
			tool: 'betterpptx.slide.add_group',
			objectName: object.objectName,
			args: { options: groupOptions(object, theme, assets, spec) },
		}
	}
	if (object.primitive === 'chart') {
		const chartMulti = Array.isArray(object.chartMulti) ? object.chartMulti : null
		const chartData = chartMulti ? null : chartDataForObject(object, sources)
		const dark = specIsDark(spec)
		const seriesCount = chartMulti
			? chartMulti.reduce((count, item) => count + (Array.isArray(item?.data) ? item.data.length : 0), 0)
			: (Array.isArray(chartData) ? chartData.length : 1)
		const axisColor = dark ? 'CBD5E1' : '475569'
		const gridColor = dark ? '243049' : 'E6EBF2'
		// Per-world data language derived from the art-direction AXES (surface + type),
		// so charts adopt the world: blueprint→grid+mono, editorial→no grid+serif, etc.
		// Generalizes to bespoke AI-composed worlds, not just the 6 named ones.
		const ds = artDataStyleForSpec(spec)
		const dataFont = theme.bodyFontFace || theme.fontFace || ds.font || 'Aptos'
		const solidGrid = { color: gridColor, style: 'solid', size: 0.5 }
		const worldGrid = ds.grid === 'grid'
			? { valGridLine: solidGrid, catGridLine: solidGrid }
			: ds.grid === 'none'
				? { valGridLine: { style: 'none' }, catGridLine: { style: 'none' } }
				: { valGridLine: solidGrid, catGridLine: { style: 'none' } }
		// Normalize AI chart options. Accept the standard pptxgenjs names
		// showValAxis:false / showCatAxis:false as aliases for this engine's
		// valAxisHidden / catAxisHidden, so a common AI guess is honored instead
		// of silently ignored.
		const aiChartOpts = (object.chartOptions && typeof object.chartOptions === 'object') ? { ...object.chartOptions } : {}
		const chartPlaceholderOptions = graphicFramePlaceholderOptionsForObject(object, spec, 'chart')
		const nativeChartPlaceholderInheritance = nativePlaceholderInheritanceForObject(object, spec, chartPlaceholderOptions)
		validateChartOptions(aiChartOpts, `slides[${object.slideIndex ?? '?' }].${object.objectName || 'chart'}.chartOptions`)
		if (aiChartOpts.showValAxis === false && aiChartOpts.valAxisHidden === undefined) aiChartOpts.valAxisHidden = true
		if (aiChartOpts.showCatAxis === false && aiChartOpts.catAxisHidden === undefined) aiChartOpts.catAxisHidden = true
		delete aiChartOpts.showValAxis
		delete aiChartOpts.showCatAxis
		const explicitChartOptionKeys = Object.keys(aiChartOpts)
		// Premium "direct-label, no redundant axis" default: when single-series values
		// are data-labeled and the author didn't decide, hide the value axis + its
		// gridlines so the scale doesn't duplicate the printed numbers.
		const directLabeled = aiChartOpts.showValue ?? (seriesCount === 1)
		const hideValAxisByDefault = directLabeled && aiChartOpts.valAxisHidden === undefined
		// Premium chart palette default: a SINGLE-series chart is monochrome in the accent
		// (NOT a rainbow of the full palette applied per bar). Multi-series uses distinct
		// palette colors. Author chartOptions.chartColors still wins (spread later).
		const resolvedPalette = resolvedPaletteForSpec(spec)
		const pal = Array.isArray(object.style?.palette) ? object.style.palette : resolvedPalette.raw
		const monoAccent = (dark ? (pal?.[2] || pal?.[1]) : (pal?.[1] || pal?.[2])) || (dark ? '2DD4BF' : '2563EB')
		// Accent-on-canvas invariant: keep the bars visible even with a low-contrast
		// bespoke palette (nudge luminance toward the canvas-readable direction).
		// Use the corrected World background rather than theme.raw[4] when a dark/light
		// mode correction has replaced a contradictory authored canvas.
		const chartCanvas = resolvedPalette.bg || (pal && pal[4]) || (dark ? '0B1120' : 'F8FAFC')
		const monoSafe = ensureAccentOnCanvas(monoAccent, chartCanvas, 1.7).accent
		const defaultChartColors = seriesCount === 1 ? [monoSafe] : (pal ? pal.slice(1, 5) : undefined)
		return {
			tool: 'betterpptx.slide.add_chart',
			objectName: object.objectName,
			args: {
				...(chartMulti
					? { chartMulti }
					: { chartType: object.chartType || 'line', data: chartData }),
				options: {
					...(nativeChartPlaceholderInheritance ? {} : object.rect),
					objectName: object.objectName,
					// Premium, theme-aware defaults — all overridable by chartOptions.
					showLegend: seriesCount > 1,
					legendPos: 'b',
					legendColor: axisColor,
					titleColor: axisColor,
					titleFontFace: dataFont,
					showValue: seriesCount === 1,
					dataLabelColor: dark ? 'F4F9FF' : '0B1220',
					dataLabelFontSize: 12,
					chartColors: defaultChartColors,
					catAxisLabelColor: axisColor,
					valAxisLabelColor: axisColor,
					catAxisLineColor: gridColor,
					valAxisLineColor: gridColor,
					...worldGrid,
					dataLabelFontFace: dataFont,
					catAxisLabelFontFace: dataFont,
					valAxisLabelFontFace: dataFont,
					chartArea: { fill: { type: 'none' } },
					plotArea: { fill: { type: 'none' } },
					...(hideValAxisByDefault ? { valAxisHidden: true, valGridLine: { style: 'none' } } : {}),
					...aiChartOpts,
					...chartPlaceholderOptions,
					// Private execution provenance: the chart-plan resolver may replace
					// compiler fallbacks, but it must preserve every AI-authored option.
					_authoringExplicitOptionKeys: explicitChartOptionKeys,
					...(object.style?.shadow ? { shadow: object.style.shadow } : {}),
					altText: object.altText || object.summary || `Chart ${object.objectName}`,
					editHandle: object.editHandle,
					...animationOptions(object),
				},
			},
		}
	}
	if (object.primitive === 'table') {
		const tableOptions = object.tableOptions && typeof object.tableOptions === 'object' ? object.tableOptions : {}
		const tablePlaceholderOptions = graphicFramePlaceholderOptionsForObject(object, spec, 'tbl')
		const nativeTablePlaceholderInheritance = nativePlaceholderInheritanceForObject(object, spec, tablePlaceholderOptions)
		if (Object.keys(tablePlaceholderOptions).length && tableOptions.autoPage === true) {
			throw new Error(`${object.objectName || 'table'}.placeholderBinding cannot be combined with tableOptions.autoPage because auto-pagination creates additional unbound graphic frames.`)
		}
		validateTableOptions(tableOptions, `slides[${object.slideIndex ?? '?' }].${object.objectName || 'table'}.tableOptions`)
		const tdark = specIsDark(spec)
		const tInk = tdark ? 'EAF1F8' : '0F172A'
		// Per-world table language derived from the art-direction AXES (M16):
		//   grid → full gridlines (blueprint), bold-flat → heavy hard border (brutalist),
		//   rule/fill → horizontal hairlines (editorial/luxe/clean default).
		const tds = artDataStyleForSpec(spec)
		const tBorder = tds.tableBorder || (tdark ? '27324B' : 'E2E8F0')
		const tFill = tds.tableFill || (tdark ? '0E1A30' : 'FFFFFF')
		const tableFont = theme.bodyFontFace || theme.fontFace || tds.font || 'Aptos'
		const tableAccent = (Array.isArray(object.style?.palette) ? object.style.palette[1] : null) || (tdark ? '2DD4BF' : '2563EB')
		const nativeStyleSelected = Boolean(tableOptions.tablePresetId || tableOptions.tableStylePresetId || tableOptions.tableStyleId)
		const hair = { pt: 0.75, color: tBorder }
		const heavy = { pt: 1.5, color: tdark ? tBorder : '0B0B0B' }
		const worldBorder = tds.tableStyle === 'grid'
			? [hair, hair, hair, hair]
			: tds.tableStyle === 'bold-flat'
				? [heavy, heavy, heavy, heavy]
				: [hair, { type: 'none' }, hair, { type: 'none' }]
		// bold-flat is a poster look — no per-cell fill (header carries the accent block).
		const bodyFill = tds.tableStyle === 'bold-flat' ? undefined : { color: tFill }
		const authoredRows = styleTableHeader(tableRowsForObject(object, sources), tdark, { style: tds.tableStyle, accent: tableAccent, ruleColor: tds.tableRule, preserveNativeStyle: nativeStyleSelected })
		validateTableRows(authoredRows, `slides[${object.slideIndex ?? '?' }].${object.objectName || 'table'}.rows`)
		return {
			tool: 'betterpptx.slide.add_table',
			objectName: object.objectName,
			args: {
				rows: authoredRows,
				options: {
					...(nativeTablePlaceholderInheritance ? {} : object.rect),
					objectName: object.objectName,
					altText: object.altText || object.summary || `Table ${object.objectName}`,
					editHandle: object.editHandle,
					// Premium, dark-aware, world-derived defaults: light text on dark,
					// world-appropriate borders, readable padding. Author tableOptions win.
					...(nativeStyleSelected ? {} : { color: tInk, ...(bodyFill ? { fill: bodyFill } : {}), border: worldBorder }),
					fontFace: tableFont,
					fontSize: 12,
					margin: 0.1,
					valign: 'middle',
					...(object.style?.shadow ? { shadow: normalizeShadow(object.style.shadow) } : {}),
					...tableOptions,
					...tablePlaceholderOptions,
					...animationOptions(object),
				},
			},
		}
	}
	if (object.primitive === 'image') {
		return {
			tool: 'betterpptx.slide.add_image',
			objectName: object.objectName,
			args: {
				options: imageOptionsForObject(object, assets, spec),
			},
		}
	}
	if (object.primitive === 'icon') {
		// Icon front-door: renders as an image; the engine resolves iconSource → themed PNG.
		return {
			tool: 'betterpptx.slide.add_image',
			objectName: object.objectName,
			args: {
				options: {
					...object.rect,
					objectName: object.objectName,
					editHandle: object.editHandle,
					altText: object.altText || object.objectName,
					iconSource: object.iconSource,
					...animationOptions(object),
				},
			},
		}
	}
	if (object.primitive === 'smartart') {
		const smartArtName = `slides[${object.slideIndex ?? '?' }].${object.objectName || 'smartart'}`
		const smartArtOptions = smartArtOptionsForObject(object, spec)
		// A sparse patch intentionally omits the existing SmartArt topology. The
		// patch planner needs only the target and changed fields here; the update
		// handler validates the fully merged native object before mutation.
		if (ctx.patchMode !== true) validateSmartArtBlock({ kind: 'smartart', ...smartArtOptions }, smartArtName)
		return {
			tool: 'betterpptx.slide.add_smartart',
			objectName: object.objectName,
			args: smartArtOptions,
		}
	}
	if (object.primitive === 'equation') {
		return {
			tool: 'betterpptx.slide.add_equation',
			objectName: object.objectName,
			args: equationOptionsForObject(object, spec),
		}
	}
	if (object.primitive === 'model3d') {
		const options = model3DOptionsForObject(object, assets, ctx)
		// A resolvable model exists when there is a handle OR a forwarded semantic query the
		// engine can resolve at execution time. Only a truly empty block becomes a placeholder.
		const hasResolvableModel = options.modelAsset || options.glbFile || options.query || options.intent || options.useCase || options.aiContext
		if (!hasResolvableModel) {
			const error = new Error(`${object.objectName || 'model3d'} requires an authorized modelAsset/glbFile handle or an executable model query; a native 3-D request cannot be lowered to generic text.`)
			error.code = 'MODEL3D_SOURCE_REQUIRED'
			error.details = {
				objectName: object.objectName || null,
				representation: 'native-model3d',
				acceptedSources: ['modelAsset', 'glbFile', 'query', 'intent', 'useCase', 'aiContext'],
				fix: 'Provide an authorized opaque model asset handle or a supported discovery-backed model query, then rerun dryRun.',
			}
			throw error
		}
		return {
			tool: 'betterpptx.slide.add_model3d',
			objectName: object.objectName,
			args: { options },
		}
	}
	if (object.primitive === 'cameo') {
		// Live camera feed (Cameo). Only the CameoProps surface is forwarded — shape/frame,
		// geometry, name, alt text, and optional custom poster. Animation is lifted by the
		// engine handler, so it is safe to pass here.
		return {
			tool: 'betterpptx.slide.add_cameo',
			objectName: object.objectName,
			args: {
				options: {
					...object.rect,
					objectName: object.objectName,
					editHandle: object.editHandle,
					altText: object.altText || object.objectName,
					...(object.shape ? { shape: object.shape } : {}),
					...(object.posterSvgDataUri ? { posterSvgDataUri: object.posterSvgDataUri } : {}),
					...animationOptions(object),
				},
			},
		}
	}
	if (object.primitive === 'slideZoom') {
		const targetSlideIndex = (Array.isArray(spec.slides) ? spec.slides : []).findIndex(slide => String(slide?.id || '') === String(object.targetSlideId || ''))
		if (targetSlideIndex < 0 && object.patchOnly) return { unsupported: true }
		if (targetSlideIndex < 0) throw new Error(`${object.objectName || 'slideZoom'}.targetSlideId must name an existing semantic slide.`)
		return {
			tool: 'betterpptx.slide.add_zoom',
			objectName: object.objectName,
			args: {
				options: {
					...object.rect,
					targetSlide: targetSlideIndex + 1,
					targetSlideId: object.targetSlideId,
					objectName: object.objectName,
					editHandle: object.editHandle,
					altText: object.altText || `Slide Zoom to ${object.targetSlideId}`,
					returnToParent: object.returnToParent === null ? false : Boolean(object.returnToParent),
					transitionDur: object.transitionDur === null || object.transitionDur === undefined ? 1000 : object.transitionDur,
					...(typeof object.thumbnailDataUri === 'string' ? { thumbnailDataUri: object.thumbnailDataUri } : {}),
				},
			},
		}
	}
	if (object.primitive === 'freeform') {
		const style = object.style || {}
		return {
			tool: 'betterpptx.slide.add_freeform',
			objectName: object.objectName,
			args: {
				...object.rect,
				points: object.points || freeformFallbackPoints(),
				fill: fillOptions(style.fill, 'E0F2FE'),
				line: lineOptions(style.line, style.accent || '38BDF8'),
				...(style.shadow ? { shadow: style.shadow } : {}),
				...(style.glow ? { glow: style.glow } : {}),
		...(style.reflection ? { reflection: normalizeReflection(style.reflection) } : {}),
		...(style.softEdges ? { softEdges: style.softEdges } : {}),
		...(style.effect3D ? { effect3D: style.effect3D } : {}),
		...(object.rotate !== undefined ? { rotate: object.rotate } : {}),
				objectName: object.objectName,
				editHandle: object.editHandle,
				...animationOptions(object),
			},
		}
	}
	if (object.primitive === 'media') {
		return {
			tool: 'betterpptx.slide.add_media',
			objectName: object.objectName,
			args: {
				options: mediaOptionsForObject(object, assets, spec),
			},
		}
	}
	if (object.primitive === 'ink') {
		return {
			tool: 'betterpptx.slide.add_ink',
			objectName: object.objectName,
			args: {
				...object.rect,
				objectName: object.objectName,
				...(object.points ? { points: object.points } : {}),
				...(object.strokes ? { strokes: object.strokes } : {}),
				...(object.coordinateMode ? { coordinateMode: object.coordinateMode } : {}),
				inkType: object.inkType || object.tool || 'pen',
				color: object.color || object.style?.color || object.style?.line,
				width: object.width,
				transparency: object.transparency,
				animation: object.animation,
				options: object.inkOptions,
			},
		}
	}
	if (object.primitive === 'laser') {
		const staticAuthoring = optsOutOfNarrationClock(spec)
		return {
			tool: 'betterpptx.slide.add_laser_pointer',
			objectName: object.objectName,
			args: {
				...object.rect,
				objectName: object.objectName,
				...(object.points ? { points: object.points } : {}),
				...(object.coordinateMode ? { coordinateMode: object.coordinateMode } : {}),
				color: object.color || object.style?.color || object.style?.line,
				width: object.width,
				transparency: object.transparency,
				glow: object.glow || object.style?.glow,
				dot: object.dot,
				durationMs: object.durationMs,
				startDelayMs: object.startDelayMs,
				// Preserve the static-atlas contract even if the layout planner has
				// normalized unknown block fields away.  A static semantic contract
				// must never acquire the default wipe animation at lowering time.
				static: staticAuthoring || object.static === true || object.staticDemo === true,
				animation: object.animation,
			},
		}
	}
	if (object.primitive === 'narration') {
		return {
			tool: 'betterpptx.slide.add_narration',
			objectName: object.objectName,
			args: narrationArgsForObject(object, spec),
			late: true,
		}
	}
	if (object.primitive === 'avatar') {
		return {
			tool: 'betterpptx.slide.add_avatar_narration',
			objectName: object.objectName,
			args: avatarArgsForObject(object),
			late: true,
		}
	}
	if (object.primitive === 'opaqueNative') {
		const geometryArgs = object.preserveGeometry === true
			? { preserveGeometry: true }
			: { rect: object.rect || object.bbox }
		return {
			tool: 'betterpptx.slide.preserve_opaque_native',
			objectName: object.objectName,
			args: {
				preservationHandle: object.preservationHandle,
				objectName: object.objectName,
				editHandle: object.editHandle,
				...geometryArgs,
				style: object.style,
				allowedEdits: object.allowedEdits,
				delete: object.delete === true || object.remove === true,
			},
		}
	}
	if (object.primitive === 'customGeometry') {
		return customGeometryOperationForObject(object, spec, assets)
	}
	return {
		tool: 'betterpptx.slide.add_text',
		objectName: object.objectName,
		args: {
			text: normalizeAuthoringText(object.text || object.objectName),
			options: textOptions(object, theme, spec),
		},
	}
}

function addFreemiumWarnings(spec, plan, options = {}) {
	// The rolling publication model does not impose a slide, transition, or
	// creative-feature gate during authoring. Provider-backed preparation and
	// final publication eligibility are enforced atomically by their own stage
	// contracts; the compiler must not rewrite or downgrade the authored plan.
	return []
}

function isMorphByObjectTransition(transition) {
	if (!transition || typeof transition !== 'object') return false
	const type = String(transition.type || transition.transition || '').toLowerCase()
	const option = String(transition.option || transition.morphOption || 'byObject').toLowerCase()
	return type === 'morph' && (option === 'byobject' || option === 'object')
}

function slideTransitionForCompile(slide, options = {}) {
	validateTransitionFormatOptions(slide.transition, `slides[${Number(slide.slideIndex) + 1}].transition`)
	return resolveTransitionPreset(slide.transition) || null
}

function addTransitionWarnings(plan, options = {}) {
	return []
}

const VALIDATION_INTENT_FIELDS = new Set(['validateBeforeSave', 'requireAccessibility', 'previewBeforeSave'])
// These policies already have scoped consumers in layout/HTML compilation and
// committed-deck validation. They are not requests to schedule validators.
const SCOPED_VALIDATION_POLICY_FIELDS = new Set(['readabilityPolicy', 'morphPolicy', 'fontPolicy'])

function validationIntentForSpec(spec = {}) {
	const validation = spec.validation
	if (validation === undefined) return {}
	if (!validation || typeof validation !== 'object' || Array.isArray(validation)) throw new Error('validation must be an object.')
	const intent = {}
	for (const field of VALIDATION_INTENT_FIELDS) {
		if (!Object.prototype.hasOwnProperty.call(validation, field)) continue
		if (typeof validation[field] !== 'boolean') throw new Error(`validation.${field} must be a boolean.`)
		intent[field] = validation[field]
	}
	return intent
}

function validationContractReadback(spec, verificationPolicy, errors, uncompiledWarnings) {
	return {
		contractVersion: 'betterpptx.validation-intent.v1',
		authoredIntent: validationIntentForSpec(spec),
		declarationRole: 'intent-only',
		clientMayDisableRequiredValidation: false,
		uncompiledFields: uncompiledWarnings.filter(issue => issue.field.startsWith('validation.')).map(issue => issue.field),
		scopedPolicyFields: Object.keys(spec.validation || {}).filter(field => SCOPED_VALIDATION_POLICY_FIELDS.has(field)),
		compile: {
			phase: 'semantic-compile',
			status: errors.length ? 'blocked' : 'passed',
			evidenceScope: 'compiled-plan-only',
			blockingFindingCount: errors.length,
			note: 'Compilation checks native arguments, semantic structure, and layout. This evidence does not certify a committed deck, saved package, accessibility result, or PowerPoint rendering.',
		},
		commit: {
			declarationRunsValidation: false,
			note: 'Commit materializes the compiled operations. The validation declaration does not run validators; validateAfterCompile optionally runs package/layout validation only and does not complete the aggregate save gate.',
		},
		beforeSave: {
			status: 'not-evaluated',
			required: true,
			currentVersionRequired: true,
			accessibilityRequired: true,
			tool: 'betterpptx.deck.validate_quality',
			checks: ['package', 'design', 'accessibility', 'narration', 'aggregate-quality'],
			note: 'Public save requires passing aggregate validation evidence for the current deckVersion. A declaration, dryRun, or successful commit alone does not provide that evidence; false declarations do not bypass required gates.',
		},
		preview: {
			status: 'not-evaluated',
			requestedBeforeSave: spec.validation?.previewBeforeSave ?? null,
			requiredForSave: verificationPolicy.rendererRequiredForSave,
			policy: verificationPolicy.policy,
			declarationOverridesPolicy: false,
			note: 'previewBeforeSave records intent without scheduling a preview. The deployment-selected verification policy determines whether a complete PowerPoint preview of the frozen package is required for save.',
		},
	}
}

function knownButUncompiledWarnings(spec = {}) {
	const warnings = []
	const add = ({ field, message, next, severity = 'info', reason, evidence }) => warnings.push({
		code: 'SPEC_FIELD_NOT_COMPILED',
		severity,
		field,
		message,
		reason: reason || 'The field is a valid semantic contract declaration, but this compiler phase does not apply it as a direct operation.',
		fix: next || 'Inspect the returned contract/readback and express the desired behavior through the supported semantic fields before rerunning dryRun.',
		evidence: { field, compilerPhase: 'semantic-compile', appliedBy: 'downstream validation or scoped block contract', ...evidence },
		...(next ? { next } : {}),
	})
	for (const field of Object.keys(spec.validation || {})) {
		if (VALIDATION_INTENT_FIELDS.has(field) || SCOPED_VALIDATION_POLICY_FIELDS.has(field)) continue
		add({
			field: `validation.${field}`,
			message: `validation.${field} has no compiled enforcement contract; declaring it does not change the required validation gates.`,
			reason: 'This requirement is not enforced from spec.validation. Supported intent declarations do not configure additional validator thresholds or custom gates.',
			evidence: { appliedBy: 'not-compiled' },
			next: 'Use the supported validation intent fields and the explicit validator tool arguments for additional requirements.',
		})
	}
	if (spec.costPolicy && typeof spec.costPolicy === 'object' && Object.keys(spec.costPolicy).length) {
		add({
			field: 'costPolicy',
			message: 'root costPolicy is accepted as an authoring contract but is not yet globally enforced by the compiler; billing confirmation is enforced by tool arguments and compiled operations.',
			next: 'Use phase:"dryRun" or phase:"resolve" for estimates, then pass billingConfirmed:true only after user acceptance.',
		})
	}
	if (spec.resolutionPolicy && typeof spec.resolutionPolicy === 'object' && Object.keys(spec.resolutionPolicy).length) {
		add({
			field: 'resolutionPolicy',
			message: 'root resolutionPolicy is accepted as an authoring contract but is not yet applied globally to every unresolved asset.',
			next: 'Put resolutionPolicy on narration/avatar/media blocks that require strict locked-only or resolve-phase behavior.',
		})
	}
	if (spec.premiumPolicy && typeof spec.premiumPolicy === 'object' && Object.keys(spec.premiumPolicy).length) {
		add({
			field: 'premiumPolicy',
			message: 'premiumPolicy is accepted as an authoring contract but public entitlement decisions still come from the active account plan and compiled primitive requirements.',
			next: 'Use the entitlement and billing reports returned by dryRun/resolve as the source of truth.',
		})
	}
	if (spec.fallbackPolicy && typeof spec.fallbackPolicy === 'object' && Object.keys(spec.fallbackPolicy).length) {
		add({
			field: 'fallbackPolicy',
			message: 'fallbackPolicy is applied only to explicitly named HTML residual effects; approved entries remain isolated and are reported as informational fidelity findings.',
			next: 'Use unsupportedAtmosphere.<effect>.decision="approve-minimal-isolated-raster" only when the native base is retained and the residual impact is acceptable; otherwise supply a transparent asset.',
		})
	}
	if (spec.layoutContract?.safeContentAreas?.length && !spec.layoutContract?.placeholders?.length) {
		const aiAuthoredGeometry = isAiAuthoredGeometrySpec(spec)
		add({
			field: 'layoutContract.safeContentAreas',
			message: aiAuthoredGeometry
				? 'layoutContract.safeContentAreas is an advisory validation boundary; explicit AI-authored slide-inch rectangles remain authoritative.'
				: 'layoutContract.safeContentAreas is accepted as a semantic safe-region hint for objects delegated to semantic placement.',
			next: aiAuthoredGeometry
				? 'Review reported boundary intersections and revise authored rect/bbox values only when the composition requires it.'
				: 'Use layoutIntent, region, arrange/split, arrange:{cols:2..4}, or semantic presenter/asset contracts; select ai-authored-geometry-v1 when exact slide-inch rectangles are intended.',
		})
	}
	return warnings
}

function sectionOperations(spec = {}, slideIdToIndex = new Map(), options = {}) {
	const operations = []
	const warnings = []
	if (options.patchMode === true) return { operations, warnings }
	const sections = Array.isArray(spec.sections) ? spec.sections : []
	sections.forEach((section, index) => {
		if (!section || typeof section !== 'object') return
		const title = String(section.title || section.name || section.id || `Section ${index + 1}`).trim()
		if (!title) return
		operations.push({
			tool: 'betterpptx.deck.sections',
			args: { action: 'add', index, id: section.id, title },
		})
		const slideIndexes = []
		for (const slideId of Array.isArray(section.slideIds) ? section.slideIds : []) {
			if (slideIdToIndex.has(slideId)) slideIndexes.push(slideIdToIndex.get(slideId))
			else throw new Error(`sections[${index}].slideIds references missing semantic slide ${slideId}.`)
		}
		if (slideIndexes.length) {
			operations.push({
				tool: 'betterpptx.deck.sections',
				args: { action: 'assign_slide', index, slideIndexes },
			})
		}
	})
	return { operations, warnings }
}

function asArray(value) {
	if (value === undefined || value === null) return []
	return Array.isArray(value) ? value : [value]
}

function numberOrUndefined(value) {
	const n = Number(value)
	return Number.isFinite(n) ? n : undefined
}

function patchSlideIndexForSpecSlide(slideSpec = {}, fallbackIndex = 0) {
	const n = Number(slideSpec.slideIndex ?? slideSpec.index)
	return Number.isInteger(n) && n >= 0 ? n : fallbackIndex
}

function motionStepTargets(step = {}, slideObjects = [], warnings = [], context = {}) {
	const target = step.target && typeof step.target === 'object' && !Array.isArray(step.target) ? step.target : {}
	const source = { ...target, ...step }
	const validateTargets = context.validateTargets !== false
	// Descendants are opt-in by an explicit stable name. Never flatten the
	// implicit kind/role/index selection surface or alter top-level indices.
	const namedObjects = [...slideObjects]
	const addNamedChildren = children => {
		for (const child of children || []) {
			const objectName = child.objectName || child.name
			if (objectName) namedObjects.push({ ...child, objectName, descendant: true })
			if (child.kind === 'group') addNamedChildren(child.children)
		}
	}
	for (const object of slideObjects) if (object.primitive === 'group') addNamedChildren(object.children)
	const names = new Set()
	for (const name of [
		...asArray(source.objectName),
		...asArray(source.name),
		...asArray(source.objectNames),
		...asArray(source.names),
	]) {
		if (name) names.add(String(name))
	}
	const editHandles = [
		...asArray(source.editHandle),
		...asArray(source.editHandles),
	].filter(Boolean).map(String)
	for (const handle of editHandles) {
		const match = slideObjects.find(object => object.editHandle === handle)
		if (match?.objectName) names.add(match.objectName)
		else if (validateTargets) warnings.push({
			code: 'MOTION_TARGET_NOT_FOUND',
			severity: 'warning',
			slideId: context.slideId,
			message: `Motion target editHandle "${handle}" was not found in the compiled slide objects.`,
			reason: 'The motion request targets an edit identity that is not present on the selected slide.',
			fix: 'Use a stable content[].name/objectName returned by dryRun, a matching role/kind, or remove the stale motion step.',
			evidence: { selector: 'editHandle', requested: handle, availableObjectCount: slideObjects.length },
		})
	}
	const roles = [...asArray(source.role), ...asArray(source.roles)].filter(Boolean).map(String)
	for (const role of roles) {
		const matches = slideObjects.filter(object => object.role === role)
		if (!matches.length && validateTargets) warnings.push({
			code: 'MOTION_TARGET_NOT_FOUND',
			severity: 'warning',
			slideId: context.slideId,
			message: `Motion target role "${role}" did not match any compiled slide object.`,
			reason: 'The motion request targets a semantic role that is absent from the compiled slide.',
			fix: 'Use a role present in dry-run object readback, target a stable content name, or remove the stale motion step.',
			evidence: { selector: 'role', requested: role, availableRoles: [...new Set(slideObjects.map(object => object.role).filter(Boolean))] },
		})
		for (const object of matches) names.add(object.objectName)
	}
	// Authors target by the short content "name" (the blockName); compiled objectNames are
	// "<slideId>.<blockName>.<role>[.<item>]". Resolve short names to the compiled object(s)
	// so motion targeting is content-first — the same way morph reuses a shared base name.
	const resolvedNames = new Set()
	for (const name of names) {
		const exactMatches = namedObjects.filter(object => object.objectName === name)
		if (exactMatches.length > 1) throw new Error(`Motion target name "${name}" is ambiguous; give each explicitly targeted object a unique name.`)
		if (exactMatches.length === 1) {
			resolvedNames.add(name)
			continue
		}
		const matches = slideObjects.filter(object => {
			const objectName = String(object.objectName || '')
			return String(object.blockName || '') === name
				|| objectName.startsWith(`${name}.`)
				|| objectName.includes(`.${name}.`)
		})
		if (matches.length) {
			for (const object of matches) resolvedNames.add(object.objectName)
		} else {
			resolvedNames.add(name)
			if (validateTargets) warnings.push({
				code: 'MOTION_TARGET_NOT_FOUND',
				severity: 'warning',
				slideId: context.slideId,
				objectName: name,
				message: `Motion target objectName "${name}" was not found in the compiled slide objects.`,
				reason: 'The motion request names a semantic object that is absent from the compiled slide.',
				fix: 'Use the exact stable content[].name/objectName from dry-run, or remove the stale motion step.',
					evidence: { selector: 'objectName', requested: name, availableObjectNames: namedObjects.map(object => object.objectName) },
			})
		}
	}
	if (source.groupId || source.group) {
		warnings.push({
			code: 'MOTION_SELECTOR_NOT_COMPILED',
			severity: 'warning',
			slideId: context.slideId,
			message: 'Motion group selectors are accepted by the spec but not yet compiled; use objectName, editHandle, role, kind, or indices for now.',
			reason: 'Group-based motion selection has no deterministic compiler lowering in this phase.',
			fix: 'Target stable objectName, editHandle, role, kind, or semantic indices instead, then rerun dryRun.',
			evidence: { selector: 'group', supportedSelectors: ['objectName', 'editHandle', 'role', 'kind', 'indices'] },
		})
	}
	return {
		...(resolvedNames.size ? { names: [...resolvedNames] } : {}),
		...(editHandles.length ? { editHandles } : {}),
		...(roles.length ? { roles } : {}),
		...(asArray(source.kind).concat(asArray(source.kinds)).filter(Boolean).length
			? { kinds: asArray(source.kind).concat(asArray(source.kinds)).filter(Boolean).map(String) }
			: {}),
		...(asArray(source.index).concat(asArray(source.indices)).map(numberOrUndefined).filter(value => value !== undefined).length
			? { indices: asArray(source.index).concat(asArray(source.indices)).map(numberOrUndefined).filter(value => value !== undefined) }
			: {}),
	}
}

function animationForMotionStep(step = {}, sequence = {}, defaults = {}) {
	const animation = {
		...(step.animation && typeof step.animation === 'object' ? step.animation : {}),
	}
	if (!animation.type) animation.type = step.type || sequence.type || 'entrance'
	// An EMPHASIS step with no named effect gets the WORLD's emphasis default (a tasteful attention
	// beat) instead of a stray 'fade'; every other type keeps fade as the neutral default. The full
	// emphasis palette stays open — the author's effect always wins.
	const isEmphasis = String(animation.type).toLowerCase() === 'emphasis'
	const usesWorldEmphasisDefault = isEmphasis && !animation.effect && !step.effect && !sequence.effect && Boolean(defaults.emphasis?.effect)
	if (!animation.effect) {
		animation.effect = step.effect || sequence.effect || (isEmphasis && defaults.emphasis?.effect) || 'fade'
	}
	if (step.trigger !== undefined) animation.trigger = step.trigger
	if (step.delay !== undefined && animation.delay === undefined) animation.delay = step.delay
	if (step.delayMs !== undefined && animation.delay === undefined) animation.delay = step.delayMs
	// A nested millisecond alias has the same precedence as nested duration.
	// Normalize it before considering flat fields or a selected world default.
	if (animation.duration === undefined && animation.durationMs !== undefined) animation.duration = animation.durationMs
	if (step.duration !== undefined && animation.duration === undefined) animation.duration = step.duration
	if (step.durationMs !== undefined && animation.duration === undefined) animation.duration = step.durationMs
	// Named effects keep their native default clock; world timing accompanies
	// only the world effect that the compiler actually selected.
	if (usesWorldEmphasisDefault && animation.duration === undefined && defaults.emphasis?.durationMs !== undefined) animation.duration = defaults.emphasis.durationMs
	if (step.direction !== undefined) animation.direction = step.direction
	if (step.motionPath !== undefined) animation.motionPath = step.motionPath
	if (step.mediaCommand !== undefined) animation.mediaCommand = step.mediaCommand
	// Forward the complete typed animation-parameter union from timeline steps.
	// Keep this allowlisted so a JSON spec can express every published slider
	// without exposing raw timing XML or implementation-specific fields.
	for (const key of ['sequence', 'repeatCount', 'autoReverse', 'motionPathData', 'motionPathCoordinateSpace', 'motionEasing', 'scale', 'scaleX', 'scaleY', 'rotation', 'clockwise', 'color', 'shapeType', 'spokes', 'amount', 'usesVisibility']) {
		if (step[key] !== undefined && animation[key] === undefined) animation[key] = step[key]
	}
	return validateAnimationFormatOptions(animation, 'animation')
}

function sequenceAppliesToSlide(sequence = {}, slideSpec = {}, slidePlan = {}, options = {}) {
	if (!sequence || typeof sequence !== 'object') return false
	const slideIds = asArray(sequence.slideIds).concat(asArray(sequence.slides)).filter(value => typeof value === 'string')
	if (slideIds.length) return slideIds.includes(slidePlan.slideId) || slideIds.includes(slideSpec.id)
	const indexes = asArray(sequence.slideIndex).concat(asArray(sequence.slideIndexes)).map(numberOrUndefined).filter(value => value !== undefined)
	if (indexes.length) {
		const comparableIndex = options.patchMode ? patchSlideIndexForSpecSlide(slideSpec, slidePlan.slideIndex) : slidePlan.slideIndex
		return indexes.includes(comparableIndex)
	}
	return sequence.slideId ? sequence.slideId === slidePlan.slideId || sequence.slideId === slideSpec.id : false
}

function motionOperationsForSlide(spec = {}, slideSpec = {}, slidePlan = {}, options = {}) {
	const operations = []
	const warnings = []
	const motionDefaults = { emphasis: artEmphasisForSpec(spec) }  // world emphasis default for effect-less emphasis steps
	const deckSequences = asArray(spec.motion?.sequences).filter(sequence => sequenceAppliesToSlide(sequence, slideSpec, slidePlan, options))
	// Top-level inline animation is carried by the native add operation. Group
	// descendants need a separate named-target operation because PowerPoint
	// timing addresses the materialized child shape rather than the group JSON.
	// This also lets the Synergy compiler attach a contact-timed effect to an
	// animated-table row or cell without flattening the composite.
	const descendantSequences = []
	const collectDescendantAnimations = children => {
		for (const child of children || []) {
			const name = child?.objectName || child?.name
			for (const animation of asArray(child?.animation)) {
				if (animation && typeof animation === 'object' && name) descendantSequences.push({ objectName: name, animation })
			}
			if (Array.isArray(child?.children)) collectDescendantAnimations(child.children)
		}
	}
	for (const block of Array.isArray(slideSpec.content) ? slideSpec.content : []) if (Array.isArray(block?.children)) collectDescendantAnimations(block.children)
	const slideSequences = [
		...descendantSequences,
		...asArray(slideSpec.motion?.sequences),
		...asArray(slideSpec.timeline),
	]
	const sequences = [...deckSequences, ...slideSequences]
	for (const sequence of sequences) {
		const steps = Array.isArray(sequence.steps) ? sequence.steps : [sequence]
		for (const step of steps) {
			if (!step || typeof step !== 'object') continue
			const targetArgs = motionStepTargets(step, slidePlan.objects || [], warnings, {
				slideId: slidePlan.slideId,
				validateTargets: options.patchMode !== true,
			})
			operations.push({
				tool: 'betterpptx.slide.animate_shapes',
				slideId: slidePlan.slideId,
				slideIndex: slidePlan.slideIndex,
				objectName: step.objectName || step.name,
				args: {
					animation: animationForMotionStep(step, sequence, motionDefaults),
					...targetArgs,
					...(step.staggerMs !== undefined ? { staggerMs: step.staggerMs } : {}),
					...(step.preserveExistingTiming !== undefined ? { preserveExistingTiming: step.preserveExistingTiming } : {}),
					...(step.replaceExistingTiming !== undefined ? { preserveExistingTiming: !step.replaceExistingTiming } : {}),
				},
			})
		}
	}
	return { operations, warnings }
}

function layoutOperations(spec = {}) {
	const operations = (Array.isArray(spec.layouts) ? spec.layouts : [])
		.filter(layout => layout && layout.name && Number.isFinite(Number(layout.width)) && Number.isFinite(Number(layout.height)))
		.map(layout => ({
			tool: 'betterpptx.deck.define_layout',
			args: {
				name: layout.name,
				width: Number(layout.width),
				height: Number(layout.height),
				...(layout.type ? { type: String(layout.type) } : {}),
				...(Object.prototype.hasOwnProperty.call(layout, 'placeholders') ? {
					placeholders: layout.placeholders === null
						? null
						: placeholderDefinitionsForCarrier(layout.placeholders, `layouts.${layout.name}.placeholders`),
				} : {}),
				...(Object.prototype.hasOwnProperty.call(layout, 'objects') ? { objects: layout.objects } : {}),
				...(layout.background !== undefined ? { background: normalizeSlideBackground(layout.background, 'layout.background') } : {}),
				...(layout.margin !== undefined ? { margin: layout.margin } : {}),
				...(Object.prototype.hasOwnProperty.call(layout, 'slideNumber') ? { slideNumber: normalizeSlideNumberField(layout.slideNumber, `layouts.${layout.name}.slideNumber`) } : {}),
				...(Object.prototype.hasOwnProperty.call(layout, 'headerFooter') ? { headerFooter: normalizeHeaderFooterPolicy(layout.headerFooter, `layouts.${layout.name}.headerFooter`) } : {}),
				...(Object.prototype.hasOwnProperty.call(layout, 'colorMapOverride') ? { colorMapOverride: layout.colorMapOverride } : {}),
				...(layout.reset === true ? { reset: true } : {}),
				...(layout.kind ? { kind: layout.kind } : {}),
				...(layout.carrierType ? { carrierType: layout.carrierType } : {}),
				...(Object.prototype.hasOwnProperty.call(layout, 'masterName') ? { masterName: layout.masterName } : {}),
				activate: layout.activate !== false && layout.active !== false,
			},
		}))
	// Aspect preset materializes as a real define_layout op so the package gets the
	// physical slide size. Ordering carries the precedence: when the author NAMED the
	// preset via spec.layout (their latest word — beats stale exported layouts[] with
	// activate:true), it goes LAST so its activation is final; when it came from the
	// aspect sugar, it goes FIRST so an explicit activating layouts[] entry still wins.
	const preset = aspectLayoutPresetForSpec(spec)
	if (preset && !operations.some(op => op.args.name === preset.name)) {
		const namedByLayout = String(spec.layout || '').trim().toUpperCase() === preset.name
		const presetOperation = {
			tool: 'betterpptx.deck.define_layout',
			args: { name: preset.name, width: preset.width, height: preset.height, activate: true },
		}
		if (namedByLayout) operations.push(presetOperation)
		else operations.unshift(presetOperation)
	}
	return operations
}

function layoutThemeStructureOperation(spec = {}) {
	const args = {}
	for (const key of ['theme', 'layouts', 'masters']) {
		if (Object.prototype.hasOwnProperty.call(spec, key)) args[key] = spec[key]
	}
	return Object.keys(args).length ? { tool: 'betterpptx.deck.set_layout_theme_structure', args } : null
}

function masterOperations(spec = {}) {
	return (Array.isArray(spec.masters) ? spec.masters : [])
		.filter(master => master && (master.title || master.name))
		.map((master, masterIndex) => {
			const { placeholders, slideNumber, headerFooter, ...masterWithoutVariants } = master
			return {
				tool: 'betterpptx.deck.define_master',
				args: {
					master: {
						...masterWithoutVariants,
						title: master.title || master.name,
						...(Object.prototype.hasOwnProperty.call(master, 'placeholders') ? {
							placeholders: placeholders === null
								? null
								: placeholderDefinitionsForCarrier(placeholders, `masters[${masterIndex}].placeholders`),
						} : {}),
						...(Object.prototype.hasOwnProperty.call(master, 'slideNumber') ? { slideNumber: normalizeSlideNumberField(slideNumber, `masters[${masterIndex}].slideNumber`) } : {}),
						...(Object.prototype.hasOwnProperty.call(master, 'headerFooter') ? { headerFooter: normalizeHeaderFooterPolicy(headerFooter, `masters[${masterIndex}].headerFooter`) } : {}),
					},
				},
			}
		})
}

function nativePackagePreservationOperation(spec = {}) {
	if (spec.preserveNativePackage === false || spec.nativePackagePreservation === false) return null
	const native = spec.nativePackagePreservation && typeof spec.nativePackagePreservation === 'object'
		? spec.nativePackagePreservation
		: null
	const handle = native?.handle || native?.preservationHandle || spec.nativePackagePreservationHandle || null
	if (typeof handle !== 'string' || !handle.trim()) return null
	return {
		tool: 'betterpptx.deck.preserve_native_package',
		args: {
			preservationHandle: handle,
			delete: spec.deleteNativePackage === true || spec.removeNativePackage === true,
		},
	}
}

function zoomOperations(spec = {}, slideIdToIndex = new Map(), options = {}) {
	const operations = []
	const warnings = []
	const sections = asArray(spec.sections)
	const sectionById = new Map(sections.map((section, index) => [String(section?.id || ''), { section, index }]).filter(([id]) => id))
	const isPatchDirective = value => Boolean(value?.patch || value?.delete === true || value?.remove === true || value?.retain === true || value?.preserve === true || value?.action || value?.reorderToIndex !== undefined || value?.toIndex !== undefined || value?.position !== undefined)
	// Per-slide Section Zoom: slide.sectionZoom (object) or slide.sectionZooms (array).
	for (const slide of asArray(spec.slides)) {
		if (!slide || typeof slide !== 'object') continue
		const slideIndex = slideIdToIndex.get(slide.id)
		if (slideIndex === undefined) continue
		for (const zoom of [...asArray(slide.sectionZoom), ...asArray(slide.sectionZooms)]) {
			if (!zoom || typeof zoom !== 'object') continue
			if (zoom.enabled === false) continue
			if (options.patchMode === true) continue
			if (isPatchDirective(zoom)) continue
			const targetSectionId = String(zoom.targetSectionId || '').trim()
			const resolved = sectionById.get(targetSectionId)
			if (!resolved) {
				if (zoom.enabled === true && !targetSectionId) {
					warnings.push({
						code: 'ZOOM_TARGET_MISSING',
						severity: 'warning',
						slideId: slide.id,
						message: 'Section Zoom needs targetSection (a section title or 1-based section index); skipped.',
						reason: 'The zoom request has no semantic section target, so the engine cannot resolve its destination.',
						fix: 'Set targetSection to an existing semantic section title or 1-based section index, or remove the stale zoom request, then rerun dryRun.',
						evidence: { selector: 'targetSection', received: null, availableSectionCount: sections.length, fallback: 'skipped' },
					})
					continue
				}
				throw new Error(`Section Zoom ${zoom.name || zoom.objectName || ''} references missing semantic section ${targetSectionId || '(empty)'}.`)
			}
			const { enabled: _enabled, targetSection, targetSectionId: _legacyTargetSectionId, name, bbox, rect, title, decorative, hiddenFromAccessibility, ...rest } = zoom
			const geometry = bbox || rect || {}
			operations.push({
				tool: 'betterpptx.slide.add_section_zoom',
				slideId: slide.id,
				slideIndex,
				args: { slideIndex, options: {
					...rest,
					...geometry,
					objectName: zoom.objectName || name,
					targetSection: resolved.index + 1,
					targetSectionId,
					...(title !== undefined ? { accessibilityTitle: title } : {}),
					...(decorative !== undefined || hiddenFromAccessibility !== undefined ? { isDecorative: decorative ?? hiddenFromAccessibility } : {}),
				} },
			})
		}
	}
	// Deck-level Summary Zoom: spec.summaryZoom (object) builds a summary/zoom landing slide.
	const summary = spec.summaryZoom
	if (summary && typeof summary === 'object' && summary.enabled !== false && !isPatchDirective(summary) && options.patchMode !== true) {
		const sectionIds = Array.isArray(summary.sectionIds) && summary.sectionIds.length ? summary.sectionIds : sections.map(section => section.id)
		const resolvedSections = sectionIds.map(id => {
			const resolved = sectionById.get(String(id))
			if (!resolved) throw new Error(`summaryZoom.sectionIds references missing semantic section ${id}.`)
			return resolved
		})
		const { enabled: _enabled, sectionIds: _sectionIds, name, summarySectionId, summarySlideId, title, decorative, hiddenFromAccessibility, ...options } = summary
		operations.push({ tool: 'betterpptx.deck.add_summary_zoom', args: { options } })
		operations[operations.length - 1].args.options = {
			...options,
			objectName: summary.objectName || name || 'summary-zoom',
			sections: resolvedSections.map(({ index }) => index + 1),
			sectionIds: sectionIds.map(String),
			summarySectionId: summarySectionId || `${name || 'summary-zoom'}-section`,
			summarySlideId: summarySlideId || `${name || 'summary-zoom'}-slide`,
			...(title !== undefined ? { accessibilityTitle: title } : {}),
			...(decorative !== undefined || hiddenFromAccessibility !== undefined ? { isDecorative: decorative ?? hiddenFromAccessibility } : {}),
		}
	}
	return { operations, warnings }
}

function transitionPolicyOperation(spec = {}) {
	const policy = spec.transitionsAll || spec.transitionPolicy || spec.motion?.transitionPolicy || spec.motion?.transitionsAll
	// Omission is intentional under AI sovereignty. A world or preset may describe
	// possible motion, but it never authorizes a transition or changes pricing.
	if (!policy || typeof policy !== 'object') {
		return null
	}
	if (policy.enabled === false) return null
	validateTransitionFormatOptions(policy.transition, 'transitionPolicy.transition')
	if (Array.isArray(policy.variants)) policy.variants.forEach((item, index) => validateTransitionFormatOptions(item, `transitionPolicy.variants[${index}]`))
	return {
		tool: 'betterpptx.deck.set_transitions_all',
		args: {
			...(policy.transition ? { transition: policy.transition } : {}),
			...(Array.isArray(policy.variants) ? { variants: policy.variants } : {}),
			// A deck-wide transition POLICY is a default family: it fills slides that
			// did not author their own transition, so an explicit per-slide transition
			// (e.g. Morph on a key slide) wins. Set transitionPolicy.force:true to make
			// the policy overwrite every slide instead.
			fillOnly: policy.force !== true,
		},
	}
}

function autoplayOperation(spec = {}) {
	const autoplay = spec.autoplay || spec.motion?.autoplay
	if (!autoplay || typeof autoplay !== 'object' || autoplay.enabled === false) return null
	validateTransitionFormatOptions(autoplay.defaultTransition, 'autoplay.defaultTransition')
	return {
		tool: 'betterpptx.deck.autoplay',
		args: {
			secondsPerSlide: autoplay.secondsPerSlide ?? autoplay.seconds,
			loop: autoplay.loop,
			mode: autoplay.mode,
			showNarration: spec.deliveryExperience?.mode === 'narrated-autoplay' ? true : autoplay.showNarration,
			preserveTimedSlides: spec.deliveryExperience?.mode === 'narrated-autoplay' || autoplay.preserveTimedSlides === true,
			defaultTransition: autoplay.defaultTransition,
		},
	}
}

function showSettingsOperation(spec = {}) {
	const showSettings = spec.showSettings || spec.motion?.showSettings
	if (!showSettings || typeof showSettings !== 'object') return null
	return {
		tool: 'betterpptx.deck.set_show_settings',
		args: {
			useTimings: showSettings.useTimings,
			showAnimation: showSettings.showAnimation,
			showNarration: showSettings.showNarration,
			loop: showSettings.loop,
			mode: showSettings.mode,
			restartMs: showSettings.restartMs,
			showMediaControls: showSettings.showMediaControls,
		},
	}
}

// ── Autoplay-first, narration-always principle ────────────────────────────────
// Every slide ALWAYS carries a narration SCRIPT at the END of the notes under the
// [BetterPPTX-narration] rubric even when the author never asked for narration. The rubric
// is the ownership splitter: free user notes remain before it, while the text after it is
// BetterPPTX's editable source of truth for the spoken layer.
// Autoplay is the default sync spine: each slide's dwell time is derived from that
// script's spoken duration, so transitions + animations are timed to the narration.
// Freemium: the TEXT + timing are always produced (cheap); the TTS audio + avatar are
// the heavy layers a gate strips — simulated here in maintainer mode.
export const NARRATION_RUBRIC = '[BetterPPTX-narration]'
export const LEGACY_NARRATION_RUBRIC = '[narration]'

function slideNarrationContentBlock(specSlide = {}) {
	if (!Array.isArray(specSlide.content)) return null
	return specSlide.content.find(c => c && (c.kind === 'narration' || c.kind === 'voiceover')) || null
}

// Combine a narration-like object into one spoken script, whether it carries a single
// script/text or an ordered segments[] (or an array-form script[]). Used for the notes
// rubric, the duration estimate, and explicit-narration detection — so segmented narration
// is recognised as explicit (its dwell is owned by the narration op, not auto-timings).
function narrationCombinedScript(src) {
	if (!src || typeof src !== 'object') return ''
	const parts = Array.isArray(src.segments) ? src.segments
		: Array.isArray(src.script) ? src.script
		: null
	if (parts && parts.length) {
		return parts.map(s => typeof s === 'string' ? s : (s && (s.script || s.text)) || '').filter(Boolean).join(' ').trim()
	}
	return String(src.script || src.text || '').trim()
}

function narrationHasSegmentAudio(src) {
	return Boolean(src && Array.isArray(src.segments) && src.segments.some(s => s && s.audio))
}

export function slideHasExplicitNarration(specSlide = {}) {
	const n = specSlide.narration || specSlide.voiceover
	if (n && typeof n === 'object' && n.enabled !== false && (narrationCombinedScript(n) || n.audio || n.audioRef || narrationHasSegmentAudio(n) || n.synthesizeAudio === false)) return true
	const avatar = specSlide.avatarNarration
	if (avatar && typeof avatar === 'object' && avatar.enabled !== false && (narrationCombinedScript(avatar) || avatar.audio || avatar.lockedVideo || avatar.avatarAsset)) return true
	const block = slideNarrationContentBlock(specSlide)
	return Boolean(block && (narrationCombinedScript(block) || block.audio || narrationHasSegmentAudio(block)))
}

function authoredTimingIntentForSpec(spec = {}, specSlide = {}) {
	const candidates = [
		specSlide.motionTime,
		specSlide.motion?.motionTime,
		specSlide.motion?.time,
		spec.motionTime,
		spec.motion?.motionTime,
		spec.motion?.time,
		spec.domainContract?.['motion-time'],
		spec.domainContract?.motionTime,
		spec.authoringDomains?.['motion-time'],
		spec.authoringDomains?.motionTime,
		spec.domains?.['motion-time'],
		spec.domains?.motionTime,
	]
	const source = candidates.find(value => value && typeof value === 'object' && !Array.isArray(value)) || {}
	return {
		...((source.masterClock ?? source.clock) != null ? { masterClock: String(source.masterClock ?? source.clock) } : {}),
		...((source.timingSource ?? source.timeline ?? source.synchronization) != null
			? { timingSource: String(source.timingSource ?? source.timeline ?? source.synchronization) }
			: {}),
		...(source.syncPolicy != null ? { syncPolicy: String(source.syncPolicy) } : {}),
	}
}

function explicitAutoplayTimingMs(spec = {}) {
	const autoplay = spec.autoplay || spec.motion?.autoplay
	if (!autoplay || typeof autoplay !== 'object' || autoplay.enabled === false) return null
	const value = Number(autoplay.secondsPerSlide ?? autoplay.seconds)
	return Number.isFinite(value) && value > 0 ? Math.round(value * 1000) : null
}

function authoredSlideAdvanceMs(specSlide = {}, transition = null) {
	const candidates = [
		specSlide.transition?.advanceAfterTime,
		transition?.advanceAfterTime,
		specSlide.advanceAfterTime,
	]
	for (const value of candidates) {
		const ms = Number(value)
		if (Number.isFinite(ms) && ms > 0) return Math.round(ms)
	}
	return null
}

// A visual-only Authoring Director deck may keep the editable narration rubric
// in notes while deliberately using authored/native slide timing. Centralize
// that distinction so lowering, defaults, and timing readback stay aligned.
function optsOutOfNarrationClock(spec = {}) {
	const motionTime = authoredTimingIntentForSpec(spec)
	const master = String(motionTime.masterClock || '').toLowerCase()
	const source = String(motionTime.timingSource || '').toLowerCase()
	const policy = String(motionTime.syncPolicy || '').toLowerCase()
	if (/narrat|speech|voice|audio/.test(master)) return false
	if (/narrat|speech|voice|audio/.test(policy) && !/no|without|none|off|disable/.test(policy)) return false
	return /static|manual|visual|slide|authored|native|no\s+narration|without\s+narration/.test(`${master} ${source} ${policy}`)
}

// Older Director specs sometimes declared a narration-led policy in prose while
// relying on the fallback message text for the actual script. Keep that behavior
// only as an explicitly identified compatibility path; a spec with no timing
// declaration remains static/manual.
function legacyNarrationClockForSpec(spec = {}, explicitNarration = false) {
	if (explicitNarration || optsOutOfNarrationClock(spec)) return false
	const intent = authoredTimingIntentForSpec(spec)
	const policy = String(intent.syncPolicy || '').toLowerCase()
	return /narrat|speech|voice|audio/.test(policy)
}

// This is the single compiler-side timing authority decision. It intentionally
// returns readback labels as well as booleans so the public result can distinguish
// authored intent, normalized intent, effective clock, and timing evidence.
export function timingAuthorityForSlide(spec = {}, specSlide = {}, {
	explicitNarration = slideHasExplicitNarration(specSlide),
	performanceTiming = null,
	lockedNarrationTiming = null,
	transition = null,
} = {}) {
	const authoredIntent = authoredTimingIntentForSpec(spec, specSlide)
	const explicitAutoplay = spec.autoplay || spec.motion?.autoplay
	const autoplayMs = explicitAutoplayTimingMs(spec)
	const slideAdvanceMs = authoredSlideAdvanceMs(specSlide, transition)
	const explicitAutoSyncOff = spec.motion?.autoSync === false || specSlide.motion?.autoSync === false
	const visualOnlyDeclaration = optsOutOfNarrationClock(spec)
	const narrationDisabled = explicitAutoSyncOff || visualOnlyDeclaration || (explicitAutoplay && explicitAutoplay.enabled === false)
	const legacyCompatibility = legacyNarrationClockForSpec(spec, explicitNarration)
	const narrationActive = (explicitNarration || legacyCompatibility) && !narrationDisabled
	const performanceActive = Boolean(performanceTiming && !explicitNarration)
	const conflicts = []
	if (explicitNarration && visualOnlyDeclaration) conflicts.push('visual-only Motion/Time declaration overrides narration-led synchronization')
	if (explicitNarration && explicitAutoSyncOff) conflicts.push('motion.autoSync:false overrides narration-led synchronization')
	if (narrationActive && autoplayMs != null) conflicts.push('fixed autoplay duration is present while narration is the active clock')
	if (narrationActive && slideAdvanceMs != null) conflicts.push('authored slide advance is present while narration is the active clock')

	if (narrationActive) {
		const measuredNarration = Boolean(lockedNarrationTiming)
		const effectiveNarrationClock = measuredNarration ? 'narration-audio' : 'narration-text'
		return {
			governedBy: measuredNarration ? 'narration (measured audio is master)' : 'narration (text is master)',
			timingSource: measuredNarration ? 'locked-audio' : 'estimate',
			timingEvidence: measuredNarration ? 'measured-audio' : 'estimate',
			// `governedBy` is the human-readable carrier label.  `effectiveClock`
			// is the stable public clock id used by normalized readback.
			effectiveClock: effectiveNarrationClock,
			authorityMode: legacyCompatibility ? 'legacy-narration-compatibility' : performanceTiming ? 'combined-narration-and-performance' : 'narrated',
			secondaryClock: performanceTiming ? 'presenter performance' : null,
			reconciliation: performanceTiming
				? `${effectiveNarrationClock} governs; the presenter performance must end within the ${measuredNarration ? 'measured' : 'measured or estimated'} narration span.`
				: `${effectiveNarrationClock} governs; visual timing and autoplay follow the ${measuredNarration ? 'measured audio' : 'narration text'} evidence.`,
			legacyCompatibility,
			narrationClockActive: true,
			performanceClockActive: false,
			authoredIntent,
			normalizedIntent: { masterClock: effectiveNarrationClock, timingSource: measuredNarration ? 'locked-audio' : 'estimate' },
			conflicts,
		}
	}
	if (performanceActive) {
		return {
			governedBy: 'presenter performance',
			timingSource: 'presenter-performance',
			timingEvidence: 'authored-performance',
			effectiveClock: 'presenter performance',
			authorityMode: 'silent-presenter-performance',
			secondaryClock: null,
			reconciliation: 'presenter performance governs; narration is not active on this silent performance slide.',
			narrationClockActive: false,
			performanceClockActive: true,
			authoredIntent,
			normalizedIntent: { masterClock: 'presenter performance', timingSource: 'presenter-performance' },
			conflicts,
		}
	}
	if (autoplayMs != null || explicitAutoplay) {
		return {
			governedBy: 'authored slide timing',
			timingSource: 'explicit-autoplay',
			timingEvidence: 'authored-autoplay',
			effectiveClock: 'authored slide timing',
			authorityMode: 'silent-authored-autoplay',
			secondaryClock: null,
			reconciliation: 'explicit autoplay governs; no narration clock is active.',
			narrationClockActive: false,
			performanceClockActive: false,
			autoplayMs,
			authoredIntent,
			normalizedIntent: { masterClock: 'authored slide timing', timingSource: 'explicit-autoplay' },
			conflicts,
		}
	}
	if (slideAdvanceMs != null) {
		return {
			governedBy: 'authored slide timing',
			timingSource: 'authored-timeline',
			timingEvidence: 'authored-transition',
			effectiveClock: 'authored slide timing',
			authorityMode: 'silent-authored-timeline',
			secondaryClock: null,
			reconciliation: 'authored slide timing governs; no narration clock is active.',
			narrationClockActive: false,
			performanceClockActive: false,
			slideAdvanceMs,
			authoredIntent,
			normalizedIntent: { masterClock: 'authored slide timing', timingSource: 'authored-timeline' },
			conflicts,
		}
	}
	return {
		governedBy: 'authored slide timing',
		timingSource: 'static-authoring',
		timingEvidence: 'none',
		effectiveClock: 'authored slide timing',
		authorityMode: 'static-manual',
		secondaryClock: null,
		reconciliation: 'manual/authored slide timing governs; notes remain non-timing content.',
		narrationClockActive: false,
		performanceClockActive: false,
		authoredIntent,
		normalizedIntent: { masterClock: 'authored slide timing', timingSource: 'static-authoring' },
		conflicts,
	}
}

export function slideNarrationScript(specSlide = {}) {
	const n = specSlide.narration || specSlide.voiceover
	const avatar = specSlide.avatarNarration
	const block = slideNarrationContentBlock(specSlide)
	const explicit = narrationCombinedScript(n && typeof n === 'object' ? n : null)
		|| narrationCombinedScript(avatar && typeof avatar === 'object' && avatar.enabled !== false ? avatar : null)
		|| narrationCombinedScript(block)
	return String(explicit || specSlide.message || specSlide.title || '').trim()
}

function composeNotesWithNarration(authorNotes, script) {
	// `slide.notes` is the user's free notes field. It is opaque: never sanitize,
	// reinterpret, narrate, or rewrite it. Only append/canonicalize the owned final block.
	const notes = String(authorNotes || '')
	const markerPattern = /(^|\r?\n)[ \t]*\[(betterpptx-)?narration\][ \t]*(?:\r?\n|$)/gi
	const matches = [...notes.matchAll(markerPattern)]
	const marker = matches[matches.length - 1]
	if (marker) {
		// A pre-existing final narration block is already the author's editable
		// source of truth. Preserve its text, canonicalize the marker, and keep all
		// free notes above it byte-for-byte apart from the owned separator.
		const beforeMarker = notes.slice(0, marker.index)
		const userNotes = marker[1] ? beforeMarker.replace(/\r?\n$/, '') : beforeMarker
		const existingNarration = notes.slice(marker.index + marker[0].length).trim()
		const narration = existingNarration || String(script || '').trim()
		return narration
			? `${userNotes ? `${userNotes}\n\n` : ''}${NARRATION_RUBRIC}\n${narration}`
			: userNotes
	}
	const narration = String(script || '').trim()
	if (!narration) return notes
	return `${notes ? `${notes}\n\n` : ''}${NARRATION_RUBRIC}\n${narration}`
}

// The BetterPPTX narration is MULTILINGUAL — the AI may author in any supported voice
// language. Derive the language of a slide's narration from its explicit lang, else the
// locale prefix of its voice id (en_US-ljspeech-high → en), else the deck default, else en.
export function narrationLangFor(specSlide = {}, spec = {}) {
	const n = specSlide.narration || specSlide.voiceover || {}
	const block = slideNarrationContentBlock(specSlide) || {}
	const explicit = n.lang || block.lang || spec.narration?.lang || spec.defaultLang || spec.lang
	if (explicit) return String(explicit).toLowerCase().slice(0, 3).replace(/[^a-z]/g, '')
	const voiceId = n.voice || block.voice || spec.narration?.voice || spec.narrationVoice?.voice || spec.defaultVoice || ''
	const m = String(voiceId).match(/^([a-z]{2,3})[_-]/i)
	return m ? m[1].toLowerCase() : 'en'
}

// Per-language natural speaking rate for the estimate (words/min for space-delimited
// scripts; a chars/min rate is used instead for no-space scripts like CJK/Thai, detected
// from the text). These are approximations for the DRY-RUN estimate only — at commit the
// REAL Piper duration governs, so the estimate never has to be exact, just language-fair.
const NARRATION_WPM = {
	en: 150, de: 135, nl: 140, sv: 145, da: 145, no: 145, fi: 130,
	fr: 145, es: 155, it: 150, pt: 150, ro: 145, ca: 150,
	pl: 140, cs: 140, sk: 140, hu: 135, bg: 140, ru: 135, uk: 135, lv: 135, sq: 140,
	el: 140, fa: 140, ur: 140, ne: 130, ar: 135, he: 140, tr: 145,
}
const NARRATION_CJK_CPM = 340 // chars/min for no-space scripts (CJK/kana)

// Estimate spoken duration (ms) at a natural Piper pace for the narration LANGUAGE, scaled
// by the world VOICE temperament (luxe slower + generous pauses, brutalist terse). Counts
// words for space-delimited scripts and characters for no-space scripts so it never
// collapses to "1 word" on CJK/Thai. Floored so a one-word slide still dwells to read.
export function estimateNarrationMs(script, voice = {}, opts = {}) {
	const text = String(script || '').trim()
	if (!text) return 0
	const lang = String(opts.lang || 'en').toLowerCase()
	const lengthScale = Number(voice.lengthScale) || 1
	const paddingMs = Number.isFinite(Number(voice.paddingMs)) ? Number(voice.paddingMs) : 400
	// no-space scripts: CJK ideographs + Japanese kana + Hangul + Thai
	const cjkChars = (text.match(/[぀-ヿ㐀-鿿가-힯฀-๿豈-﫿]/g) || []).length
	const words = text.split(/\s+/).filter(Boolean).length
	let spokenMs
	if (cjkChars > words) {
		spokenMs = (cjkChars / NARRATION_CJK_CPM) * 60000
	} else {
		const wpm = NARRATION_WPM[lang] || 140
		spokenMs = (words / wpm) * 60000
	}
	return Math.max(2500, Math.round(spokenMs * lengthScale + paddingMs))
}

// ── Visual comfort floor (ADVISORY — text is master) ──────────────────────────
// TEXT is the master of DWELL: the narration's spoken length sets how long a slide
// stays up, and the visual ADAPTS to fit that spoken timeline. This function estimates
// the time the audience would comfortably need to read the slide and watch its build
// finish (transition-in + build cascade + reading minimum). It is used ONLY as an
// advisory: when the narration is shorter than this, the AI is told to lengthen/slow
// the narration or trim the slide — the dwell is NEVER padded up to this floor.
function slideVisibleWordCount(specSlide = {}) {
	if (!Array.isArray(specSlide.content)) return 0
	let words = 0
	const add = t => {
		if (Array.isArray(t)) t.forEach(add)
		else if (t && typeof t === 'object') add(t.text)
		else if (typeof t === 'string') words += t.split(/\s+/).filter(Boolean).length
	}
	for (const c of specSlide.content) {
		if (!c || typeof c !== 'object') continue
		add(c.text); add(c.value); add(c.label)
		if (Array.isArray(c.nodes)) c.nodes.forEach(n => add(n && n.text))
		if (Array.isArray(c.items)) c.items.forEach(n => add(typeof n === 'string' ? n : (n && (n.text ?? n.label))))
	}
	return words
}

// LAYERED-MOTION awareness: when the author placed a granular timeline, its REAL end time
// is the build duration — afterPrevious steps accumulate, withPrevious steps OVERLAP the
// previous step's start, and each step carries its own delayMs/durationMs. A flat
// steps×500ms guess reads a 2.2s motion path as 500ms and five simultaneous layers as
// serial — the too-short-narration advisory would then mis-time exactly the slides where
// timing matters most.
function timelineEndMs(specSlide = {}) {
	const steps = Array.isArray(specSlide.timeline) ? specSlide.timeline : []
	let cursor = 0      // end of the serialized chain so far
	let lastStart = 0   // start of the previous step (withPrevious anchors here)
	for (const step of steps) {
		if (!step || typeof step !== 'object') continue
		const delay = Number(step.delayMs) || 0
		const duration = Number(step.durationMs) || 500
		const withPrev = String(step.trigger || '').toLowerCase() === 'withprevious'
		const start = (withPrev ? lastStart : cursor) + delay
		lastStart = start
		cursor = Math.max(cursor, start + duration)
	}
	return cursor
}

export function computeVisualFloorMs(specSlide = {}, motion = {}) {
	const READ_WPM = 200      // audience skim-reading pace
	const CASCADE_MS = 500    // per animated object in a build cascade
	const words = slideVisibleWordCount(specSlide)
	const readingMs = Math.max(2200, Math.round((words / READ_WPM) * 60000))
	const contentAnimCount = Array.isArray(specSlide.content)
		? specSlide.content.filter(c => c && (c.animation || (c.options && c.options.animation))).length
		: 0
	const buildMs = Math.max(contentAnimCount * CASCADE_MS, timelineEndMs(specSlide))
	const transitionMs = Number(specSlide.transition?.durationMs) || Number(motion?.transition?.durationMs) || 500
	// You read while it builds → the floor is the longer of (build + settle) and (reading),
	// plus the transition-in at the front. Clamped so neither a bare slide nor a text wall is absurd.
	const floor = transitionMs + Math.max(buildMs + 700, readingMs)
	return Math.min(30000, Math.max(2500, Math.round(floor)))
}

function narrationClockMs(value, fallback = 0) {
	const n = Math.round(Number(value ?? fallback) || 0)
	return Math.max(0, n)
}

function narrationCueDurationMs(cue = {}) {
	const n = Math.round(Number(cue.duration ?? cue.animation?.duration ?? 250) || 0)
	return Math.max(1, n)
}

function lockedNarrationAudio(input) {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return false
	const handle = String(input.path || input.handle || '')
	return /^asset:\/\/locked\/audio\//i.test(handle) && narrationClockMs(input.durationMs) > 0
}

function cueOffsetWithinScript(cue = {}, script = '', durationMs = 0) {
	if (cue.atMs != null) return narrationClockMs(cue.atMs)
	if (cue.delay != null) return narrationClockMs(cue.delay)
	const phrase = cue.atPhrase || cue.atWord
	if (!phrase || !(durationMs > 0)) return null
	const text = String(script || '')
	const index = text.toLowerCase().indexOf(String(phrase).toLowerCase())
	if (index < 0) return null
	return Math.max(0, Math.round((index / (text.length || 1)) * durationMs))
}

// A locked narration spec already contains measured clip durations. Reconcile the same
// clip/gap/cue/padding timeline used by resolve and commit so the compiler's timingSpine
// stops reporting the earlier text estimate after the lock has been accepted.
function lockedNarrationTimingForArgs(args = {}, preparedTiming = null) {
	const startDelayMs = narrationClockMs(args.startDelayMs)
	const paddingMs = args.paddingMs === undefined ? 700 : narrationClockMs(args.paddingMs)
	// Public specs carry opaque preparation handles. The MCP engine validates
	// those handles and supplies this server-owned timing view for compilation,
	// so quote/dry-run timing remains tied to the measured WAV rather than a
	// text-length estimate.
	if (preparedTiming && typeof preparedTiming === 'object') {
		const measuredDurationMs = narrationClockMs(preparedTiming.audio?.durationMs ?? preparedTiming.durationMs)
		if (measuredDurationMs > 0) {
			const rawSegments = Array.isArray(args.segments) ? args.segments : []
			const preparedSegments = Array.isArray(preparedTiming.segments) ? preparedTiming.segments : []
			const scheduled = preparedSegments.map((preparedSegment, index) => {
				const authored = rawSegments[index] || {}
				return {
					script: String(authored.script ?? authored.text ?? preparedSegment.text ?? ''),
					startMs: startDelayMs + narrationClockMs(preparedSegment.startMs),
					durationMs: narrationClockMs(preparedSegment.durationMs || preparedSegment.audio?.durationMs),
				}
			})
			let timelineEndMs = startDelayMs + measuredDurationMs
			for (const [index, authored] of rawSegments.entries()) {
				const segment = scheduled[index]
				if (!segment) continue
				for (const cue of Array.isArray(authored?.cues) ? authored.cues : []) {
					const offsetMs = cueOffsetWithinScript(cue, segment.script, segment.durationMs)
					if (offsetMs != null) timelineEndMs = Math.max(timelineEndMs, segment.startMs + offsetMs + narrationCueDurationMs(cue))
				}
			}
			for (const cue of Array.isArray(args.cues) ? args.cues : []) {
				let absoluteMs = cue.atMs != null || cue.delay != null
					? startDelayMs + narrationClockMs(cue.atMs ?? cue.delay)
					: null
				if (absoluteMs == null) {
					for (const segment of scheduled) {
						const offsetMs = cueOffsetWithinScript(cue, segment.script, segment.durationMs)
						if (offsetMs != null) { absoluteMs = segment.startMs + offsetMs; break }
					}
				}
				if (absoluteMs != null) timelineEndMs = Math.max(timelineEndMs, absoluteMs + narrationCueDurationMs(cue))
			}
			return {
				realDurationMs: measuredDurationMs,
				dwellMs: Math.max(1000, Math.round(timelineEndMs + paddingMs)),
			}
		}
	}
	const rawSegments = Array.isArray(args.segments) ? args.segments : []
	if (rawSegments.length) {
		if (!rawSegments.every(segment => lockedNarrationAudio(segment?.audio))) return null
		let cursor = startDelayMs
		let cueEndMs = startDelayMs
		const scheduled = []
		for (let index = 0; index < rawSegments.length; index += 1) {
			const segment = rawSegments[index] || {}
			const durationMs = narrationClockMs(segment.audio?.durationMs)
			const gapBeforeMs = narrationClockMs(segment.gapBeforeMs ?? segment.pauseBeforeMs ?? (index === 0 ? 0 : args.segmentGapMs))
			const startMs = cursor + gapBeforeMs
			const script = String(segment.script ?? segment.text ?? '')
			for (const cue of Array.isArray(segment.cues) ? segment.cues : []) {
				const offsetMs = cueOffsetWithinScript(cue, script, durationMs)
				if (offsetMs != null) cueEndMs = Math.max(cueEndMs, startMs + offsetMs + narrationCueDurationMs(cue))
			}
			scheduled.push({ script, startMs, durationMs })
			cursor = startMs + durationMs + narrationClockMs(segment.gapAfterMs ?? segment.pauseAfterMs)
		}
		for (const cue of Array.isArray(args.cues) ? args.cues : []) {
			let absoluteMs = cue.atMs != null || cue.delay != null ? cueOffsetWithinScript(cue) : null
			if (absoluteMs == null) {
				for (const segment of scheduled) {
					const offsetMs = cueOffsetWithinScript(cue, segment.script, segment.durationMs)
					if (offsetMs != null) { absoluteMs = segment.startMs + offsetMs; break }
				}
			}
			if (absoluteMs != null) cueEndMs = Math.max(cueEndMs, absoluteMs + narrationCueDurationMs(cue))
		}
		const last = scheduled[scheduled.length - 1]
		const realDurationMs = Math.max(0, last.startMs + last.durationMs - startDelayMs)
		const timelineEndMs = Math.max(cursor, cueEndMs)
		return {
			realDurationMs,
			dwellMs: Math.max(1000, Math.round(timelineEndMs + paddingMs)),
		}
	}
	if (!lockedNarrationAudio(args.audio)) return null
	const realDurationMs = narrationClockMs(args.audio.durationMs)
	let timelineEndMs = startDelayMs + realDurationMs
	const script = String(args.script || '')
	for (const cue of Array.isArray(args.cues) ? args.cues : []) {
		const offsetMs = cueOffsetWithinScript(cue, script, realDurationMs)
		if (offsetMs != null) timelineEndMs = Math.max(timelineEndMs, startDelayMs + offsetMs + narrationCueDurationMs(cue))
	}
	return {
		realDurationMs,
		dwellMs: Math.max(1000, Math.round(timelineEndMs + paddingMs)),
	}
}

// ── B: narration-synced build (the visual adapts to the words, automatically) ──
// When a narrated slide has several build objects and the author did NOT hand-place the
// beats, the platform reveals each object as its SENTENCE is spoken — turning a static
// slide into a build that tracks the narration, with zero manual cue authoring. Sentence
// splitting is Unicode-aware (Latin . ! ?, CJK 。！？, Arabic ؟, ellipsis …) so it works in
// every supported language. The generated cues use atPhrase, so they resolve to the REAL
// audio moment at commit — the same proven path as hand-authored beats. Default-ON for
// qualifying narrated slides; opt out with syncBuild:false (slide/narration/spec.motion).
// Split into sentences, Unicode-aware. CJK/full-width enders (。！？) break WITHOUT a trailing
// space (CJK has no inter-word spaces); Latin/Arabic enders (.!?؟…) require following whitespace
// so "3.14" / "U.S." are not split mid-token.
const SENTENCE_SPLIT_RE = /(?<=[。！？])[\s　]*|(?<=[.!?؟…])[\s　]+/u
export function splitNarrationSentences(text) {
	return String(text || '').split(SENTENCE_SPLIT_RE).map(s => s.trim()).filter(Boolean)
}
function firstPhraseOf(sentence, maxWords = 4) {
	const clean = String(sentence || '').trim().replace(/^[\s"“”'‘’(¡¿]+/u, '')
	const parts = clean.split(/\s+/).filter(Boolean)
	const phrase = parts.length <= maxWords ? clean : parts.slice(0, maxWords).join(' ')
	return phrase.replace(/[.!?。！？؟…,;:、，]+$/u, '')
}
const NON_BUILD_KINDS = new Set(['narration', 'voiceover', 'avatarNarration', 'background', 'audio'])
function buildableObjectNames(specSlide = {}) {
	if (!Array.isArray(specSlide.content)) return []
	const names = []
	for (const c of specSlide.content) {
		if (!c || typeof c !== 'object' || NON_BUILD_KINDS.has(c.kind)) continue
		const name = c.name || c.objectName
		if (name) names.push(String(name))
	}
	return names
}
function slideAuthorsOwnBuild(specSlide = {}) {
	// The author owns the build if they placed explicit cues, a timeline/sequence, or any
	// per-object animation — in those cases the platform never auto-syncs the build.
	const n = specSlide.narration || specSlide.voiceover || {}
	const hasCues = (Array.isArray(n.cues) && n.cues.length) || (n.timing && Array.isArray(n.timing.cues) && n.timing.cues.length)
		|| (Array.isArray(n.segments) && n.segments.some(s => s && Array.isArray(s.cues) && s.cues.length))
	if (hasCues) return true
	if (Array.isArray(specSlide.timeline) && specSlide.timeline.length) return true
	if (specSlide.motion && Array.isArray(specSlide.motion.sequences) && specSlide.motion.sequences.length) return true
	if (Array.isArray(specSlide.content) && specSlide.content.some(c => c && (c.animation || (c.options && c.options.animation)))) return true
	return false
}
function autoSyncBuildEnabled(specSlide = {}, spec = {}) {
	const n = specSlide.narration || specSlide.voiceover || {}
	if (n.syncBuild === false || specSlide.syncBuild === false) return false
	if (specSlide.motion && specSlide.motion.syncBuild === false) return false
	if (spec.motion && spec.motion.syncBuild === false) return false
	if (spec.motion?.autoSync === false) return false
	if (n.synthesizeAudio === false && n.syncBuild !== true) return false
	return true
}
export function autoSyncBuildCues(objectNames, script, effect = 'fade', durationMs = 500) {
	const sentences = splitNarrationSentences(script)
	if (sentences.length < 2 || objectNames.length < 2) return []   // nothing to stagger against
	const N = objectNames.length, S = sentences.length
	// A build entrance needs a REAL effect. Restraint worlds (e.g. editorial) carry
	// build:'none' — coerce that to a gentle fade so the synced reveal still animates in
	// cleanly (a fade is the most restrained entrance) instead of emitting an invalid "none".
	const eff = (effect && effect !== 'none') ? effect : 'fade'
	return objectNames.map((name, i) => {
		// Spread objects across ALL sentences so reveals track the WHOLE narration (no
		// front-clump when there are many sentences, no end-dump when there are many objects).
		// The engine's balance layer then enforces the breathing interval on the resolved
		// real-audio times and keeps the world-tempo duration — sync without chaos.
		const si = N <= S
			? Math.min(S - 1, Math.round((i * (S - 1)) / (N - 1)))
			: Math.min(S - 1, Math.floor((i * S) / N))
		return {
			target: name,
			type: 'entrance',
			effect: eff,
			duration: durationMs,
			atPhrase: firstPhraseOf(sentences[si]),
			autoSyncedBuild: true,
		}
	})
}

function narrationFocusTextValues(cue = {}) {
	const values = []
	const add = value => {
		if (value == null) return
		if (Array.isArray(value)) return value.forEach(add)
		const text = String(value).replace(/\s+/g, ' ').trim()
		if (text) values.push(text)
	}
	add(cue.focusText)
	if (!values.length) add(cue.focus)
	return [...new Set(values)]
}

function narrationBlockText(block = {}) {
	const values = []
	const add = value => {
		if (value == null) return
		if (Array.isArray(value)) return value.forEach(add)
		if (typeof value === 'object') return add(value.text)
		const text = String(value).replace(/\s+/g, ' ').trim()
		if (text) values.push(text)
	}
	add(block.text)
	add(block.label)
	add(block.title)
	add(block.options?.text)
	add(block.name)
	return [...new Set(values)]
}

// HTML cue sidecars commonly describe the visual beat with focusText/focus labels,
// while PowerPoint animation requires a stable semantic object name. Resolve that
// bridge only when the lowered slide has a deterministic text match; unresolved
// cues remain untouched so the quality gate still exposes a real authoring gap.
function resolveNarrationCueTargetsForSlide(slide = {}, narration = {}) {
	const blocks = (Array.isArray(slide.content) ? slide.content : [])
		.map(block => ({ block, name: String(block?.name || block?.objectName || '').trim(), labels: narrationBlockText(block) }))
		.filter(item => item.name && item.labels.length)
	if (!blocks.length) return narration
	const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
	const resolve = cue => {
		if (!cue || typeof cue !== 'object' || cue.target != null) return cue
		const terms = narrationFocusTextValues(cue).map(normalize).filter(Boolean)
		if (!terms.length) return cue
		const ranked = []
		for (const item of blocks) {
			let score = 0
			for (const label of item.labels.map(normalize).filter(Boolean)) {
				for (const term of terms) {
					if (label === term) score = Math.max(score, 100)
					else if (label.includes(term)) score = Math.max(score, 80)
					else if (term.includes(label)) score = Math.max(score, 70)
					else {
						const overlap = term.split(' ').filter(token => token.length > 2 && label.split(' ').includes(token)).length
						if (overlap) score = Math.max(score, 40 + overlap)
					}
				}
			}
			if (score) ranked.push({ item, score })
		}
		if (!ranked.length) return cue
		ranked.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
		return { ...cue, target: ranked[0].item.name, targetResolution: 'focus-text' }
	}
	const mapCues = cues => Array.isArray(cues) ? cues.map(resolve) : cues
	const timing = narration.timing && typeof narration.timing === 'object'
		? { ...narration.timing, cues: mapCues(narration.timing.cues) }
		: narration.timing
	return {
		...narration,
		cues: mapCues(narration.cues),
		...(timing ? { timing } : {}),
	}
}

function slideNarrationOperations(spec = {}, slide, slideIndex, ctx = {}) {
	const narration = slide.narration || slide.voiceover
	const presenterCueBlocks = (Array.isArray(slide.content) ? slide.content : []).filter(block =>
		block && typeof block === 'object' && block._presenterMotionId && block._presenterNarrationCue != null)
	if (!narration || typeof narration !== 'object' || narration.enabled === false) {
		if (presenterCueBlocks.length) {
			const error = new Error('An authored presenter motion narration cue requires authored slide narration.')
			error.code = 'MOTION_NARRATION_REQUIRED'
			error.slideId = slide.id
			throw error
		}
		return []
	}
	if (narration.mode !== undefined) validateNarrationProvider(narration, `slides[${slideIndex}].narration`)
	const objectName = narration.objectName || `${slide.id}.narration.audio`
	// B — narration-synced build: reveal each object as its sentence is spoken, unless the
	// author already owns the beats (explicit cues/timeline/animation) or opted out.
	let narrationForArgs = resolveNarrationCueTargetsForSlide(slide, narration)
	let autoSyncApplied = false
	if (autoSyncBuildEnabled(slide, spec) && !slideAuthorsOwnBuild(slide)) {
		const script = narrationCombinedScript(narration) || slideNarrationScript(slide)
		const cues = autoSyncBuildCues(buildableObjectNames(slide), script, ctx.buildEffect || 'fade', ctx.buildDurationMs || 500)
		if (cues.length) { narrationForArgs = { ...narration, cues }; autoSyncApplied = true }
	}
	if (presenterCueBlocks.length) {
		const script = narrationCombinedScript(narration) || slideNarrationScript(slide)
		const authoredCues = narrationForArgs.cues ?? narrationForArgs.timing?.cues ?? narrationForArgs.timeline?.cues ?? []
		const presenterCues = presenterCueBlocks.map(block => {
			const raw = block._presenterNarrationCue
			const anchor = canonicalNarrationCue(raw, {
				slideId: slide.id,
				motionId: block._presenterMotionId,
				script,
				invalidCode: 'MOTION_NARRATION_CUE_INVALID',
			})
			return {
				...anchor,
				target: block.objectName || block.name,
				bindExistingPresenterMotion: true,
				motionId: block._presenterMotionId,
			}
		})
		narrationForArgs = { ...narrationForArgs, cues: [...authoredCues, ...presenterCues] }
	}
	const manualSlideAdvance = spec.autoplay?.enabled === false || spec.showSettings?.useTimings === false
	const narrationArgs = narrationArgsForObject({
		...narrationForArgs,
		objectName,
		rect: narration.rect || narration.bbox,
		script: narration.script || narration.text || slideNarrationScript(slide),
	}, spec, { slideId: slide.id })
	if (manualSlideAdvance && narrationForArgs.useAsTimingAuthority === undefined) narrationArgs.useAsTimingAuthority = false
	return [{
		tool: 'betterpptx.slide.add_narration',
		slideId: slide.id,
		slideIndex,
		objectName,
		late: true,
		args: {
			...narrationArgs,
			// Text is master: the real-TTS advance follows the audio (audioEnd + padding).
			// visualFloorMs is passed as an ADVISORY comfort floor only — the engine uses it to
			// flag NARRATION_TOO_SHORT_FOR_CONTENT, never to pad the dwell past the words.
			...(Number.isFinite(Number(ctx.visualFloorMs)) ? { visualFloorMs: Number(ctx.visualFloorMs) } : {}),
			// The world's minimum breathing interval — the engine balances the auto-synced build
			// beats to it so closely-spoken reveals never fire on top of each other (chaotic).
			...(autoSyncApplied && Number.isFinite(Number(ctx.buildMinIntervalMs)) ? { syncBuildMinIntervalMs: Number(ctx.buildMinIntervalMs) } : {}),
		},
	}]
}

function slideAvatarNarrationOperations(spec = {}, slide, slideIndex, options = {}) {
	const avatarNarration = slide.avatarNarration
	if (!avatarNarration || typeof avatarNarration !== 'object' || avatarNarration.enabled === false) return []
	const objectName = avatarNarration.objectName || `${slide.id}.avatar.video`
	// Patch-mode repair of an uploaded deck reuses an existing native media
	// object.  Lower it as a semantic update operation so the presenter runtime
	// director can prove the talking-head lane without synthesizing a second
	// media relationship or asking the client for geometry.
	if (avatarNarration.reuseExisting === true && options.patchMode === true) return [{
		tool: 'betterpptx.slide.update_media',
		slideId: slide.id,
		slideIndex,
		objectName,
		late: true,
		args: {
			target: { objectName },
			avatarFrameContract: 'ellipse-centered-cover-v1',
			interactivePlayback: avatarNarration.interactivePlayback ?? true,
			showMediaControls: avatarNarration.showMediaControls,
			paddingMs: avatarNarration.paddingMs,
		},
	}]
	return [{
		tool: 'betterpptx.slide.add_avatar_narration',
		slideId: slide.id,
		slideIndex,
		objectName,
		late: true,
		args: avatarArgsForObject({
			...avatarNarration,
			objectName,
			script: avatarNarration.script || avatarNarration.text || slideNarrationScript(slide),
			}),
	}]
}

// AUTHORING-EXCELLENCE DIRECTOR CONTRACT: the talking head owns its frame.
// A poster/cover supplied as a second image at the same rectangle is not a
// harmless fallback — it is a second visible presenter and PowerPoint will
// often paint that rectangular image over the native ellipse.  Catch this at
// compilation time so a showcase spec cannot hide a composition defect that
// only appears in the slideshow preview.
const AVATAR_COLLISION_KINDS = new Set(['image', 'image-feature', 'media', 'cameo', 'model3d', 'freeform', 'customGeometry'])
function contractRect(value, fallback = null) {
	const source = value && typeof value === 'object' ? value : fallback
	if (!source || typeof source !== 'object') return null
	const rect = { x: Number(source.x), y: Number(source.y), w: Number(source.w), h: Number(source.h) }
	return Object.values(rect).every(Number.isFinite) ? rect : null
}
function sameContractRect(a, b, tolerance = 0.002) {
	return Boolean(a && b) && ['x', 'y', 'w', 'h'].every(key => Math.abs(Number(a[key]) - Number(b[key])) <= tolerance)
}
function avatarVisualContractIssues(spec = {}) {
	const issues = []
	for (const [slideIndex, slide] of (Array.isArray(spec.slides) ? spec.slides : []).entries()) {
		const avatar = slide?.avatarNarration
		if (!avatar || typeof avatar !== 'object' || avatar.enabled === false) continue
		const avatarRect = contractRect(avatar.rect || avatar.bbox)
		if (!avatarRect || !(avatarRect.w > 0) || !(avatarRect.h > 0)) {
			issues.push({
				code: 'AVATAR_FRAME_REQUIRED',
				severity: 'error',
				slideIndex,
				message: 'Talking-head media requires an AI-authored finite positive rect or bbox.',
				reason: 'Presenter placement remains AI-owned; BetterPPTX cannot select a default presenter frame.',
				fix: 'Add avatarNarration.rect with finite slide-inch x/y/w/h values. The engine will apply ellipse-centered crop within that authored frame.',
				evidence: { received: avatar.rect || avatar.bbox || null, shape: 'ellipse', crop: 'centered-cover', geometryAuthority: 'ai' },
			})
			continue
		}
		for (const [contentIndex, block] of (Array.isArray(slide.content) ? slide.content : []).entries()) {
			if (!block || typeof block !== 'object' || !AVATAR_COLLISION_KINDS.has(String(block.kind || ''))) continue
			const blockRect = contractRect(block.rect || block.bbox || block.options)
			if (!sameContractRect(avatarRect, blockRect)) continue
			issues.push({
				code: 'AVATAR_FRAME_DUPLICATE_VISUAL',
				severity: 'error',
				slideIndex,
				contentIndex,
				objectName: block.name || block.objectName || null,
				message: `Talking-head frame collides with a second ${String(block.kind)} visual at the same rectangle. Remove the poster/cover image; avatarNarration owns this ellipse window and its centered crop.`,
				reason: 'The slide contains a second visible visual at the canonical presenter frame, creating duplicate identity media and an ambiguous talking-head surface.',
				fix: 'Remove the duplicate poster/cover visual or declare one canonical presenter identity; let avatarNarration own the accepted presenter window.',
				evidence: { presenterRect: avatarRect, contentIndex, objectName: block.name || block.objectName || null, duplicateKind: block.kind },
			})
		}
	}
	return issues
}

function nativeTimingPreservationOperation(slide = {}, slidePlan = {}) {
	const deleteRequested = slide.deleteNativeTiming === true || slide.removeNativeTiming === true
	if (!deleteRequested && (slide.preserveNativeTiming === false || slide.nativeTimingPreservation === false)) return null
	const native = slide.nativeTimingPreservation && typeof slide.nativeTimingPreservation === 'object'
		? slide.nativeTimingPreservation
		: null
	const handle = native?.handle || native?.preservationHandle || slide.timingPreservationHandle || null
	if (!deleteRequested && (typeof handle !== 'string' || !handle.trim())) return null
	return {
		tool: 'betterpptx.slide.preserve_native_timing',
		slideId: slidePlan.slideId || slide.id,
		slideIndex: slidePlan.slideIndex ?? slide.slideIndex,
		late: true,
		args: {
			...(typeof handle === 'string' && handle.trim() ? { preservationHandle: handle } : {}),
			delete: deleteRequested,
		},
	}
}

export function operationResolutionRequirement(op = {}) {
	if (op.tool === 'betterpptx.slide.add_image') {
		const opts = op.args?.options || {}
		if (opts.visualGeneration && !opts.data && !opts.path && !opts.url) {
			return { tool: op.tool, slideId: op.slideId, slideIndex: op.slideIndex, objectName: op.objectName, kind: 'generatedImage', visualPlan: opts.visualGeneration }
		}
	}
	if (op.tool === 'betterpptx.slide.add_narration') {
		if (op.args?.synthesizeAudio === false) return null
		if (op.args?.preparedNarration) {
			const preparedSegments = Array.isArray(op.args?.segments) ? op.args.segments : []
			const preparedIsMaterialized = preparedSegments.length
				? preparedSegments.every(segment => audioInputHasSource(segment?.audio ?? segment?.lockedAudio))
				: audioInputHasSource(op.args?.audio)
			if (!preparedIsMaterialized) return { tool: op.tool, slideId: op.slideId, slideIndex: op.slideIndex, objectName: op.objectName, kind: 'ttsAudio', prepared: true }
		}
		const segments = Array.isArray(op.args?.segments) ? op.args.segments : []
		const unresolvedSegmentScripts = segments.some(seg => {
			if (!seg || typeof seg !== 'object') return false
			const audio = seg.audio ?? seg.lockedAudio
			return !audioInputHasSource(audio) && String(seg.script ?? seg.text ?? '').trim().length > 0
		})
		if (audioInputHasSource(op.args?.audio) && !unresolvedSegmentScripts) return null
		if (segments.length && !unresolvedSegmentScripts) return null
		if (op.args?.script || unresolvedSegmentScripts) return { tool: op.tool, slideId: op.slideId, slideIndex: op.slideIndex, objectName: op.objectName, kind: 'ttsAudio' }
	}
	if (op.tool === 'betterpptx.slide.add_avatar_narration') {
		if (op.args?.avatarAsset || op.args?.jobId) return null
		if (op.args?.script || op.args?.audio) return { tool: op.tool, slideId: op.slideId, slideIndex: op.slideIndex, objectName: op.objectName, kind: 'avatarVideo' }
	}
	if (op.tool === 'betterpptx.slide.add_media') {
		const opts = op.args?.options || {}
		const pathValue = opts.path || opts.handle || opts.mediaHandle || opts.lockedMedia?.handle
		if (typeof pathValue === 'string' && /^asset:\/\/locked\//i.test(pathValue)) return null
		if (opts.link || opts.url || opts.path || opts.data || opts.handle || opts.mediaHandle || opts.lockedMedia?.handle) {
			return { tool: op.tool, slideId: op.slideId, slideIndex: op.slideIndex, objectName: op.objectName, kind: 'mediaAsset' }
		}
	}
	if (op.tool === 'betterpptx.slide.add_model3d') {
		const opts = op.args?.options || {}
		if (opts.path || opts.data || opts.model || opts.modelUrl || opts.handle || opts.modelHandle) return null
		if (opts.assetRef || opts.query || opts.prompt) return { tool: op.tool, slideId: op.slideId, slideIndex: op.slideIndex, objectName: op.objectName, kind: 'model3dAsset' }
	}
	return null
}

function resolutionRequirementsForOperations(operations = []) {
	return operations.map(operationResolutionRequirement).filter(Boolean)
}

function templateResolutionRequirement(spec = {}) {
	const template = spec.template && typeof spec.template === 'object' ? spec.template : null
	if (!template) return null
	const handle = template.handle || template.templateHandle
	if (typeof handle === 'string' && /^asset:\/\/locked\/template\//i.test(handle) && (spec.layoutContract || template.layoutContract || template.contract)) return null
	if (template.path || template.templatePath || template.url || template.link || template.data || handle) {
		return { kind: 'templateAsset', field: 'template' }
	}
	return null
}

// M3 Transparency: report what the engine ASSUMED for any value the author did not set,
// so the AI can see and override every default. Black-box-safe (no paths/internals).
const HOST_SAFE_FONTS = new Set(['segoe ui', 'calibri', 'arial', 'arial black', 'tahoma', 'verdana', 'georgia', 'times new roman', 'consolas', 'cambria', 'segoe ui semibold', 'segoe ui light', 'segoe ui semilight'])

// Public authoring readback is deliberately semantic. The director needs to explain
// the engine's decision (intent, timing, validity and verdicts), not leak the baked
// implementation that happens to realize it (animId, clip, framePos, bboxFrom, etc.).
// Keep the richer records internal for lowering and package generation.
function publicGesturePlan(plan) {
	if (!plan || typeof plan !== 'object') return null
	return {
		persona: plan.persona || null,
		choreography: plan.choreography || null,
		stage: plan.stage || null,
		stageTreatment: plan.stageTreatment && typeof plan.stageTreatment === 'object'
			? {
				id: plan.stageTreatment.id || 'none',
				source: plan.stageTreatment.source || 'default',
				decisionAuthority: 'AI',
				engineRole: 'derive-safe-geometry-and-execute',
			}
			: { id: 'none', source: 'default', decisionAuthority: 'AI', engineRole: 'derive-safe-geometry-and-execute' },
		composedThroughEngine: plan.composedThroughEngine === true,
		travelPath: plan.travelPath || null,
		pairContent: !!plan.pairContent,
		dialect: plan.dialect || null,
		perSlide: Array.isArray(plan.perSlide) ? plan.perSlide.map(g => {
			if (!g || typeof g !== 'object') return g
			if (g.suppressed) return { slide: g.slide, suppressed: g.suppressed, note: g.note }
			return {
				slide: g.slide,
				intent: g.intent,
				from: g.from,
				...(g.motionId ? { motionId: g.motionId } : {}),
				...(g.narrationCue != null ? { narrationCue: g.narrationCue } : {}),
				...(g.biased ? { biased: true } : {}),
				...(g.valid != null ? { valid: !!g.valid } : {}),
				...(Array.isArray(g.violations) && g.violations.length ? { violations: [...g.violations] } : {}),
				...(g.travelIn != null ? { travelIn: g.travelIn } : {}),
				...(g.paired ? { paired: { targetKind: g.paired.targetKind, effect: g.paired.effect, type: g.paired.type, atMs: g.paired.atMs, contactSource: g.paired.contactSource } } : {}),
			}
		}) : [],
	}
}

function publicVerdicts(value) {
	return Array.isArray(value) ? value.map(v => ({
		code: v?.code,
		severity: v?.severity,
		...(v?.reason != null ? { reason: v.reason } : {}),
		...(v?.fix != null ? { fix: v.fix } : {}),
	})).filter(v => v.code || v.reason) : []
}

function publicInteractionBeat(beat = {}, slideIndex = null) {
	if (!beat || typeof beat !== 'object') return beat
	const verdicts = publicVerdicts(beat.verdicts)
	const solved = beat.clip != null && !!beat.framePos && !verdicts.some(v => ['error', 'fatal', 'block'].includes(String(v.severity || '').toLowerCase()))
	return {
		...(beat.slide != null ? { slide: beat.slide } : slideIndex != null ? { slide: slideIndex } : {}),
		...(beat.slideId != null ? { slideId: beat.slideId } : {}),
		actor: beat.actor,
		verb: beat.verb,
		target: beat.target,
		status: solved ? 'solved' : 'review',
		...(beat.startMs != null ? { startMs: beat.startMs } : {}),
		...(beat.contactMs != null ? { contactMs: beat.contactMs } : {}),
		...(beat.grabMs != null ? { grabMs: beat.grabMs } : {}),
		...(beat.dropMs != null ? { dropMs: beat.dropMs } : {}),
		...(beat.residualIn != null ? { residualIn: beat.residualIn } : {}),
		...(verdicts.length ? { verdicts, verdictCodes: verdicts.map(v => v.code).filter(Boolean) } : {}),
	}
}

// E1: the CANONICAL STORYBOARD — one per-slide object unifying what plays (gestures, interactions,
// scene beats), when (narration-master-clock dwell + contact/beat times), why (from narration|role,
// verb+target), and the actionable verdicts. A single surface the authoring AI reads + adjusts,
// instead of correlating presenter.gestures + presenter.interactions + scene beats + narration by
// hand. Pure read of the already-computed plan pieces; safe when no presenter/interactions are set.
function buildStoryboard(spec, timingReadback = null) {
	if (!spec || typeof spec !== 'object' || !Array.isArray(spec.slides) || !spec.slides.length) return null
	const kspec = materializeKineticForSpec(spec)
	const wp = artPresenterForSpec(spec)
	let gestures = null
	try { gestures = planPresenterGestures(kspec, { worldPresenter: wp, avatarClipMap: avatarClipMapForSpec(kspec, wp), avatarContactMap: avatarContactMapForSpec(kspec, wp), avatarClipDurations: avatarClipDurationsForSpec(kspec, wp), avatarViewportMargin: avatarViewportMarginForSpec(kspec, wp) }) } catch {}
	const gestureBySlide = new Map((gestures?.perSlide || []).map(g => [g.slide, g]))
	const interactionsBySlide = new Map()
	for (const b of spec._synergyPlan || []) {
		if (b.slide == null) continue
		if (!interactionsBySlide.has(b.slide)) interactionsBySlide.set(b.slide, [])
		interactionsBySlide.get(b.slide).push(b)
	}
	const active = !!(gestures || (spec._synergyPlan && spec._synergyPlan.length) || spec.slides.some(s => Array.isArray(s.scene) && s.scene.length))
	if (!active) return null
	const timingBySlide = new Map((timingReadback?.slides || []).map(item => [item.slideId, item]))
	const board = spec.slides.map((s, i) => {
		const explicitNarration = slideHasExplicitNarration(s)
		const fallbackTiming = timingAuthorityForSlide(spec, s, { explicitNarration, performanceTiming: s._presenterPerformanceTiming })
		const timing = timingBySlide.get(s.id) || fallbackTiming
		const script = explicitNarration ? slideNarrationScript(s) : ''
		const words = script.split(/\s+/).filter(Boolean).length
		const plays = []
		const g = gestureBySlide.get(i)
		if (g && !g.suppressed) {
			const safe = publicGesturePlan({ perSlide: [g] }).perSlide[0]
			plays.push({ kind: 'gesture', ...safe })
		}
		if (g && g.suppressed) plays.push({ kind: 'gesture', suppressed: g.suppressed, note: g.note })
		for (const b of interactionsBySlide.get(i) || []) {
			plays.push({ kind: 'interaction', ...publicInteractionBeat(b, i) })
		}
		for (const beat of Array.isArray(s.scene) ? s.scene : []) plays.push({ kind: 'scene', actor: beat.actor, intent: beat.intent, at: beat.at })
		const verdicts = (interactionsBySlide.get(i) || []).flatMap(b => publicVerdicts(b.verdicts))
		return {
			slide: i,
			slideId: s.id,
			role: s.role || null,
			narration: {
				words,
				dwellMs: timing.dwellMs ?? null,
				masterClock: timing.effectiveClock || timing.governedBy,
				source: explicitNarration ? 'explicit-narration' : 'fallback-note-only',
				timingEvidence: timing.timingEvidence || 'none',
			},
			plays,
			...(verdicts.length ? { verdicts } : {}),
		}
	})
	return board
}

function presenterExecutionAuthored(spec = {}) {
	const presenter = spec.presenter
	if (presenter && typeof presenter === 'object' && presenter.enabled !== false
		&& ['model', 'avatar', 'glb', 'asset', 'identity', 'id'].some(key => presenter[key] != null && String(presenter[key]).trim() !== '')) return true
	if (Array.isArray(spec.presenters?.cast) && spec.presenters.cast.some(entry => entry && entry.enabled !== false)) return true
	return (Array.isArray(spec.slides) ? spec.slides : []).some(slide =>
		(slide && (slide.presenterMotion || slide.presenterPerformance))
		|| (Array.isArray(slide?.scene) && slide.scene.some(beat => beat && beat.actor))
		|| (Array.isArray(slide?.interactions) && slide.interactions.some(beat => beat && beat.actor)))
}

function buildAppliedDefaults(spec, plan, timingReadback = null) {
	const art = artDirectionInfo(spec)
	const aiAuthoredGeometry = isAiAuthoredGeometrySpec(spec)
	const aiSovereign = isAiSovereignSpec(spec)
	const completeness = authoringCompletenessForSpec(spec)
	const gradientPolicy = gradientPolicyForArtDirection(spec)
	const mode = specIsDark(spec) ? 'dark' : 'light'
	const aestheticSelection = aiWorldSelectionForSpec(spec)
	const headFont = spec.theme?.headFontFace || spec.theme?.fontFace || art?.headFontFace || 'Aptos Display'
	const bodyFont = spec.theme?.bodyFontFace || spec.theme?.fontFace || art?.bodyFontFace || 'Aptos'
	const authorFonts = !!(spec.theme?.headFontFace || spec.theme?.bodyFontFace || spec.theme?.fontFace)
	const fontsExplicit = authorFonts || !!art
	const fallbackRisk = [...new Set([headFont, bodyFont].filter(Boolean))].filter(f => !HOST_SAFE_FONTS.has(String(f).toLowerCase()))
	const hasPalette = Array.isArray(spec.theme?.palette) && spec.theme.palette.length
	const paletteSource = hasPalette ? 'author.theme.palette'
		: (spec.styleIntent?.palette ? 'author.styleIntent.palette'
			: (spec.styleIntent?.preset ? `preset:${spec.styleIntent.preset}`
				: (art ? `artDirection:${art.key}` : 'engine-default')))
	const planSlides = plan.slides || []
	const slides = (spec.slides || []).map((s, i) => {
		const ps = planSlides[i] || {}
		const blocks = Array.isArray(s.content) ? s.content : []
		const isCard = b => b && (b.kind === 'stat' || b.kind === 'kpi' || b.kind === 'metric-grid')
		return {
			slideId: s.id,
			layoutIntent: ps.layoutIntent,
			visualBalance: ps.visualBalance,
			layoutIntentDefaulted: !s.layoutIntent,
			background: { source: s.background ? 'author' : (!ps.background ? 'template-or-preserved' : art ? `artDirection:${art.key}` : 'neutral-default'), kind: ps.background?.gradientStops ? 'gradient' : (ps.background?.color ? 'solid' : 'none') },
			cardsStyledByDefault: blocks.filter(b => isCard(b) && !(b.options?.fill || b.style?.fill)).length,
			chartsStyledByDefault: blocks.filter(b => b?.kind === 'chart-panel' && !(b.chartOptions && b.chartOptions.chartColors)).length,
			tablesStyledByDefault: blocks.filter(b => b?.kind === 'table-panel' && !b.tableOptions).length,
			enginePlacedObjects: (ps.objects || []).filter(o => o?.placementSource === 'engine').length,
		}
	})
	return {
		note: `What BetterPPTX defaulted only where the author omitted a non-geometric value. Geometry remains AI-owned in sovereign and Director-assisted authoring; validation may report spatial findings but does not move, resize, or rearrange authored objects.${aiSovereign ? ' Director assistance is off and creates no creative-planning obligation.' : ' Director assistance may advise but cannot place objects.'}`,
		mode,
		preset: spec.styleIntent?.preset || null,
		artDirection: art ? (art.bespoke ? `bespoke: ${art.label}` : art.key) : null,
		aestheticSelection,
		completeness,
		artDirectionNote: art
			? (art.bespoke
				? `Bespoke world "${art.label}" (AI-composed). Its axes — mode:${art.mode}, card:${art.card}, type:${art.headFontFace}/${art.bodyFontFace}, your palette — drive background, cards, type, corners, theme accents AND chart/table styling. The legibility invariant guarantees readable text.`
				: `World "${art.key}" drives background, card language (${art.card}), type, and corners. Pick a different styleIntent.artDirection to author a globally different look; betterpptx.help.capabilities lists all worlds.`)
			: `${aestheticSelection.selectionStatus === 'neutral-explicit' ? 'Explicit neutral reset' : 'No named World selected'}: authored theme, backgrounds, fonts and per-object styles remain authoritative. Omitted values use plain readable neutral defaults; no Luxe/Aurora fallback, automatic ornament, or named-World certification obligation.`,
		// Legibility INVARIANT status — the guardrail that keeps any world (incl. a
		// bespoke AI-composed palette) readable. corrected:true means the engine had to
		// snap the ink polarity; fix the palette if you want full control.
		legibility: legibilityReport(spec),
		typographicColor: textColorRolesForSpec(spec),
		// Palette HEALTH — accent visibility on the canvas + theme-ramp distinctness.
		paletteHealth: paletteHealth(spec),
		gradientPolicy,
		accentPolicy: accentPolicyForArtDirection(spec),
		depthPolicy: depthPolicyForArtDirection(spec),
		dataStyle: {
			...artDataStyleForSpec(spec),
			note: 'Charts and native tables inherit this World-aware data language; explicit semantic dataStyle and per-cell fills remain author-controlled.',
		},
		// The world's motion vocabulary is latent guidance only. Omitted transitions
		// and animation remain omitted; the consuming AI authors every active beat.
		// voice = how this world speaks WHEN narrated (pace/pause; voice id is yours).
		motion: {
			active: Boolean(spec.transitionsAll || spec.transitionPolicy || spec.motion?.transitionPolicy || spec.motion?.transitionsAll || (spec.slides || []).some(slide => slide?.transition || slide?.timeline?.length)),
			authoredTransitions: (spec.slides || []).filter(slide => slide?.transition).map(slide => ({ slideId: slide.id || null, transition: structuredClone(slide.transition) })),
			worldVocabulary: artMotionForSpec(spec),
			note: 'World motion values are optional vocabulary, not active defaults. Only explicitly authored transitions, timelines, animations, or narration cues are compiled.',
		},
		motionCoverage: (() => {
			const authoredAnimationSlides = (spec.slides || []).filter(s => Array.isArray(s.content) && s.content.some(b => b && (b.animation || (b.options && b.options.animation))) || Array.isArray(s.timeline) && s.timeline.length || Array.isArray(s.narration?.timeline) && s.narration.timeline.length).length
			const authoredAnimationObjects = (spec.slides || []).reduce((n, s) => n + (Array.isArray(s.content) ? s.content.reduce((m, b) => m + (b && (b.animation || (b.options && b.options.animation)) ? (Array.isArray(b.animation) ? b.animation.length : 1) : 0), 0) : 0), 0)
			const explicitNarrationSlides = (spec.slides || []).filter(s => s?.narration && (s.narration.script || s.narration.audio || Array.isArray(s.narration.timeline) && s.narration.timeline.length)).length
			return {
				contractVersion: 'authoring-excellence.motion-coverage.v1',
				authoredAnimationSlides,
				authoredAnimationObjects,
				explicitNarrationSlides,
				readback: ['validate_design.metrics.animatedSlides', 'validate_design.metrics.animatedObjects', 'validate_design.issues[]'],
				recommendation: authoredAnimationSlides || explicitNarrationSlides
					? 'Motion is semantically authored or narration-synced; inspect validate_design and timingSpine for story coverage and timing fit.'
					: 'No semantic motion or explicit narration sync was authored. Static delivery is valid; no motion is added or required by aesthetic completeness. Explicit delivery-experience requirements still apply.',
				rule: 'Motion vocabulary is optional guidance only; semantic cues and narration/text remain the timing authority.'
			}
		})(),
		voice: { ...artVoiceForSpec(spec), note: 'applied only on kind:"narration"; sets pace/pause, not the voice identity. Approved local EN voice: en_US-ljspeech-high.' },
		// M19b — the world's typographic-emphasis (hero-text glow/reflection, restraint:
		// most worlds add nothing) and material/depth (image framing + elevation).
		typeEmphasis: { ...artTypeEmphasisForSpec(spec), note: 'hero/cover heading only; null = the world\'s emphasis is type weight/family, not ornament.' },
		depth: { ...artDepthForSpec(spec), note: 'image framing + elevation derived from the world surface; author line/shadow/rectRadius win.' },
		stage3d: { ...artStageForSpec(spec), note: art ? 'Explicit World framing/light vocabulary; authored camera/trans/lights win. No model or animation is added.' : 'No World framing or lighting selected. Authored camera/trans/lights remain authoritative; no aesthetic staging is injected.' },
		presenter: (() => {
			const wp = artPresenterForSpec(spec)
			const presenterActive = presenterExecutionAuthored(spec)
			const presenterSelection = spec.presenter?.selection
				? {
					mode: spec.presenter.selection.mode,
					reason: spec.presenter.selection.mode === 'auto-fallback'
						? 'legacy execution compatibility fallback; explicit AI identity is required for first-time-right certification'
						: spec.presenter.selection.reason,
				}
				: { mode: 'author' }
			const base = { ...wp, active: presenterActive, ...(spec.presenter?.identity ? { identity: spec.presenter.identity, selection: presenterSelection } : {}), note: presenterActive
				? 'This existing 3D presenter + gesture dialect is active because the spec authored a presenter identity, model, cast, performance, scene, or interaction. The AI must choose an explicit presenter.identity (joe, louise, pete, or the owner-gated Mena research persona) for the editable built-in roster, or an explicitly approved existing model handle for the native 3D presenter. A generated rigged persona is a separate experimental feature and is not assumed here. identity:"auto" remains a legacy execution fallback and is not first-time-right-certification eligible. Identity is independent from choreography, so changing the visible person preserves gesture planning, placement, and Morph continuity. The AI may explicitly choose presenter.stageTreatment from the unranked public vocabulary; the engine only derives safe native geometry.'
				: 'No presenter or presenter interaction is active in this spec. The world presenter defaults are latent guidance only; no presenter is added or treated as a carrier. Add an explicit presenter identity, performance, scene, or interaction when the story genuinely needs one.' }
			// When a presenter is ACTIVE (spec.presenter.model set), surface the per-slide gesture PLAN so the AI
			// can see + adjust exactly what each slide will perform and WHY (from:narration|role|default).
			const kspec = materializeKineticForSpec(spec) // kinetic swap (no-op unless a kinetic presenter is asked)
				const plan = planPresenterGestures(kspec, { worldPresenter: wp, avatarClipMap: avatarClipMapForSpec(kspec, wp), avatarContactMap: avatarContactMapForSpec(kspec, wp), avatarClipDurations: avatarClipDurationsForSpec(kspec, wp), avatarViewportMargin: avatarViewportMarginForSpec(kspec, wp) })
				// SYNERGY interaction plan (slides[].interactions): the SOLVED calculation per beat — clip, window
				// position, contact ms/window, measured push vector, residuals, verdicts — so the authoring AI sees
				// exactly what each interaction will do and why (or why it was skipped). When the expansion already
				// ran (commit path), reuse ITS recorded plan (spec._synergyPlan) — re-solving on the expanded spec
				// would see the injected animations and mis-report every beat as TARGET_AUTHORED.
				const hasInteractions = Array.isArray(kspec.slides) && kspec.slides.some(s => Array.isArray(s.interactions) && s.interactions.length)
				const interactionPlan = spec._synergyPlan || (hasInteractions ? planInteractions(kspec, { castAssets: castAssetsForSpec(kspec, true) }) : null)
			const publicPlan = publicGesturePlan(plan)
			const withPlan = plan && presenterActive
				? { ...base, active: true, choreography: publicPlan.choreography, stage: publicPlan.stage, stageTreatment: publicPlan.stageTreatment, dialect: publicPlan.dialect, gestures: publicPlan.perSlide, gesturesNote: 'Per-slide semantic motion readback. When motionId/from:"author" is present, the AI chose that exact public catalog ID and the engine only validated and packaged it; there is no substitution. Narration/role classification remains the compatibility fallback only when the AI does not provide presenterMotion.' }
				: base
			// C2: PROPOSED interactions (teamwork doctrine) — narration-suggested {verb,target} the AI
			// may COPY into slides[].interactions to accept. Never injected; present when a slide's
			// narration suggests one but the author has not authored an interaction there.
			const proposals = (() => { try { const p = proposeInteractions(spec); return p.length ? p : null } catch { return null } })()
			const withProposals = proposals ? { ...withPlan, interactionProposals: proposals, interactionProposalsNote: 'C2 PROPOSALS (not applied): narration suggested these {verb,target} but you did not author them. Each cites the phrase + a confidence; copy an accepted one into slides[].interactions (see .accept) to make it real. Proposals never auto-inject — the AI confirms.' } : withPlan
			const publicInteractions = Array.isArray(interactionPlan) ? interactionPlan.map(b => publicInteractionBeat(b)) : null
			return publicInteractions
				? { ...withProposals, interactions: publicInteractions, interactionsNote: 'Measured interaction readback: {slide, actor, verb, target, status, contactMs|grabMs/dropMs, residualIn?, verdicts}. BetterPPTX resolves package-safe timing and target bindings; the AI owns authored placement and the decision to accept or revise any reported spatial relation. A beat with status review is not committed until its semantic verdicts are addressed.' }
				: withProposals
		})(),
		storyArc: (() => {
			if (!presenterExecutionAuthored(spec)) return undefined
			const arc = planStoryArc(spec)
			if (!arc) return undefined
			return { arc, note: 'C1 deck-level story arc: per slide {presence: full|recede|off, energy, scale, viewportMargin, stage, reason}. The presenter is FULL at the opener/closer and the climax (an interaction slide), RECEDES on data-dense slides so it never covers the numbers. Apply by setting presenter.scale / .stage per slide (or presenter.onSlides), or let a future compiler pass consume it. Deterministic.' }
		})(),
		motionPolicy: (() => {
			const policy = normalizeMotionPolicy(spec)
			const presenterActive = presenterExecutionAuthored(spec)
			const sole = presenterActive
				? soleCarrierReport(spec)
				: { ok: true, slides: [], applicability: 'not-applicable', reason: 'No presenter or presenter interaction was authored.' }
			const failed = sole.slides.filter(s => !s.ok)
			return {
				policy,
				note: 'D5 presentation policy. full=all motion; reduced=in-place gestures kept, large travel/impact removed; static=presenters render as their poster still, no runtime dependence. Set spec.motionPolicy or spec.accessibility.reducedMotion. The deck must communicate WITHOUT the presenter.',
				...(spec._motionPolicyApplied?.changes?.length ? { applied: spec._motionPolicyApplied.changes } : {}),
				soleCarrier: { ok: sole.ok, active: presenterActive, applicability: sole.applicability || (presenterActive ? 'active' : 'not-applicable'), ...(failed.length ? { violations: failed.map(f => ({ slide: f.slide, slideId: f.slideId, verdict: f.verdict })) } : {}) },
				soleCarrierNote: presenterActive
					? (sole.ok ? 'every slide communicates its message without the authored presenter (no fact depends on the actor).' : 'PRESENTER_SOLE_CARRIER: an authored presenter would be the only carrier for a slide message — add visible content/narration that carries the fact.')
					: 'Not applicable: no presenter or presenter interaction is active in this spec; the title-only minimal compile is not being misdiagnosed as a presenter-only slide.',
			}
		})(),
		...(() => { const sb = buildStoryboard(spec, timingReadback); return sb ? { storyboard: sb, storyboardNote: 'E1 canonical storyboard: per slide {slide, slideId, role, narration:{words,dwellMs,masterClock,source,timingEvidence}, plays:[{kind:gesture|interaction|scene, ...}], verdicts:[{code,severity,reason,fix,evidence}]}. ONE surface unifying every performed beat + its timing + its actionable refusals — read this instead of correlating presenter.gestures/interactions/scene by hand. Narration is the clock only when explicit narration is active; fallback notes remain non-timing content.' } : {} })(),
		icon: { ...artIconForSpec(spec), note: 'default look for kind:"icon" when you set no iconStyle. luxe/aurora/brutalist=chip (accent tile), editorial/blueprint/mist=plain (accent glyph). Author iconStyle/color/chipColor win.' },
		narration: {
			active: (spec.slides || []).some(slide => slideHasExplicitNarration(slide)),
			always: false,
			rubric: NARRATION_RUBRIC,
			note: 'Narration is optional. When explicitly authored, its editable source is stored under [BetterPPTX-narration] (legacy [narration] remains readable) and can drive voice, native Record Studio capture, autoplay timing, and synchronized motion. Silent specifications do not receive narration or narration obligations.',
		},
		autoplay: (() => {
			const explicitAutoplay = spec.autoplay || spec.motion?.autoplay
			const narrationClockOptOut = optsOutOfNarrationClock(spec)
			const explicitNarration = (spec.slides || []).some(slide => slideHasExplicitNarration(slide))
			const presenterPerformance = (spec.slides || []).some(slide => slide?._presenterPerformanceTiming)
			const off = spec.motion?.autoSync === false || narrationClockOptOut || (explicitAutoplay && explicitAutoplay.enabled === false)
			const on = !off && (explicitNarration || presenterPerformance) && !explicitAutoplay
			return {
				autoSync: on,
				note: on
					? 'DEFAULT sync spine — TEXT IS THE MASTER: each slide dwells for its NARRATION duration (the spoken length; floored at 2500ms), and the visual adapts to fit. The visual-comfort floor (transition-in + build cascade + reading minimum) is advisory only — a short narration is NOT padded up to it; instead NARRATION_TOO_SHORT_FOR_CONTENT asks the AI to lengthen/slow the narration or trim the slide. useTimings on; advanceOnClick kept so a presenter can still click. See timingSpine for the per-slide reconciliation. Disable with spec.motion.autoSync:false; an explicit spec.autoplay overrides.'
					: (explicitAutoplay
						? 'explicit spec.autoplay owns the timing.'
						: (narrationClockOptOut
							? 'The declared Motion/Time contract is visual-only; authored/native slide timing governs and narration notes do not create dwell timing.'
							: explicitNarration || presenterPerformance
								? 'auto-sync is available only for explicit narration or an explicit presenter-performance timeline; no fallback note is used as a clock.'
								: 'No explicit narration or presenter-performance timeline is authored; slides remain manual/authored-timing and fallback notes do not create dwell timing.')),
				effectiveClock: timingReadback?.slides?.length
					? [...new Set(timingReadback.slides.map(slide => slide.effectiveClock || slide.governedBy).filter(Boolean))]
					: [],
			}
		})(),
		syncBuild: {
			default: spec.motion?.syncBuild !== false,
			note: 'NARRATION-SYNCED BUILD (the visual adapts to the words automatically): on a slide with EXPLICIT narration and 2+ build objects, if you did not hand-place the beats, each object REVEALS as its sentence is spoken — the platform generates sentence-anchored entrance cues that resolve to the real audio at commit. Sentence splitting is Unicode-aware, so it works in every supported narration language. You keep control: place your own cues/timeline/animation (the author owns the build then), or opt out with syncBuild:false on the slide, narration, or spec.motion.',
		},
		multilingual: {
			note: 'Narration is MULTILINGUAL: author scripts in any supported voice language (betterpptx.narration.voices). Set the language via the voice id locale (e.g. de_DE-thorsten-high) or narration.lang. The dry-run dwell estimate is language-aware; after resolve, measured locked narration audio governs timing and the synced build.',
		},
		// WORLD = STARTING POINT, FULL PALETTE OPEN — the world sets tasteful DEFAULTS, never limits.
		animationPalette: (() => {
			const em = artEmphasisForSpec(spec)
			const mo = artMotionForSpec(spec)
			return {
				openVocabulary: ['entrance', 'emphasis', 'exit', 'motion'],
				// Per-axis: the world DEFAULT (a starting point) — the FULL palette behind each is open.
				worldDefaults: {
					entrance: (typeof mo.build === 'string' ? mo.build : 'fade'),
					emphasis: em.effect,
					exit: 'fade',
					motion: 'author-chosen path (motionPath)',
				},
				note: 'The FULL animation vocabulary is OPEN in every world — worldDefaults above are a STARTING POINT, not a ceiling. type:"entrance" reveals; "emphasis" draws the eye to ONE thing (world default shown; full palette open: pulse, teeter, growShrink, flicker, blast, shimmer, spin, colorWave, boldFlash, lighten/darken, …; aliases like flashOnce→flicker resolve); "exit" CLEARS the stage on a beat (build-OUT); "motion" moves an object along a PATH (motionPath:"arcUp"|"turnRight"|"zigzag"|… — natural aliases like curveDown→arcDown resolve — or custom points). LAYERING IS FREE: timeline steps may target the SAME object repeatedly — combine all four types with per-step trigger/delayMs/durationMs; trigger:"withPrevious" runs steps SIMULTANEOUSLY (a colorWave DURING the motion path); an entrance after an exit makes the element vanish and REAPPEAR (see help.tool_recipe → layered-motion). Compose via content[].animation, slide.timeline steps (objectName,type,effect,motionPath,delayMs,durationMs), or narration cues (a cue can carry type:"emphasis"/"exit"/"motion"; several cues may share a target). Emphasis/exit/motion with no named effect fall back to a tasteful default; unknown effects and paths are validated + coerced VISIBLY (never silently across classes). Recipes: emphasis-beat, exit-beat, motion-path, layered-motion. RESTRAINT: attention, not coverage — layer to serve one story beat at a time.',
			}
		})(),
		// M22 — the world's MEDIA temperaments (same doctrine: a starting point, never a limit).
		imageTreatment: (() => {
			const it = artImageTreatmentForSpec(spec)
			return {
				worldTreatment: it.treatment,
				worldOps: it.worldOps,
				note: 'Set content[].imageTreatment:"world" on an image to OPT IN to the world\'s raster grade (the worldOps above run first; your own content[].imageOps apply on top). The full imageOps vocabulary stays open everywhere: crop, resize, rotate, flip, grayscale, duotone, tint, blurRegion, highlightRegion, dimOutsideRegion, pad, deviceFrame — percent regions, deterministic. splitGrid:{rows,cols,pick} explodes one image into placed cells.',
			}
		})(),
		mediaMotion: (() => {
			const mm = artMediaMotionForSpec(spec)
			return {
				...mm,
				note: 'How this world MOVES media in time — advisory defaults you apply through the open animation vocabulary (entrance on the image/media object; kenBurns hints pair with imageOps crop/zoom regions and per-cue emphasis). Nothing auto-animates without your authoring.',
			}
		})(),
		modes: {
			resolved: mode,
			available: ['light', 'dark'],
			note: 'Every world is a STARTING POINT available in BOTH modes: it has a highest-grade light AND dark variant (tuned palette + canvas, same character — accent hues, type, cards preserved). Flip with styleIntent.mode:"light|dark"; the ink, accents, and canvas retune automatically. The resolved value above is this deck\'s mode (the world\'s canonical one unless you asked otherwise).',
		},
		// Aspect is a FIRST-CLASS canvas dimension (the deck doubles as a video master:
		// the user exports video from PowerPoint, so 9:16 here IS the Shorts master).
		canvas: (() => {
			const preset = aspectLayoutPresetForSpec(spec)
			const custom = slideSizeFromSpec(spec)
			const size = custom || { w: 13.333, h: 7.5 }
			return {
				aspect: preset ? preset.aspect : (Math.abs(size.w / size.h - 16 / 9) < 0.02 ? '16:9' : `${size.w}x${size.h}`),
				size,
				source: preset ? `preset:${preset.name}` : (custom ? 'author.layouts[]' : 'default:LAYOUT_WIDE'),
				note: 'Canvas aspect is one word away: layout:"LAYOUT_VERTICAL" (or aspect:"9:16") = Shorts/Reels/TikTok master, layout:"LAYOUT_SQUARE" (or aspect:"1:1") = social card, default 16:9 deck. Regions, auto-flow, and every world compose on any aspect; explicit layouts[] with width/height still supported for unusual sizes.',
			}
		})(),
		palette: { source: paletteSource },
		fonts: {
			head: headFont,
			body: bodyFont,
			source: authorFonts ? 'author' : (art ? `artDirection:${art.key}` : 'neutral-default (Aptos Display/Aptos)'),
			fallbackRisk: fallbackRisk.length ? fallbackRisk : null,
			fallbackNote: fallbackRisk.length ? 'Not host-safe and not embedded; PowerPoint may substitute. For faithful local render use Segoe UI / Calibri.' : null,
		},
		premiumDefaultsApplied: {
			background: art ? `explicit art-direction "${art.key}" canvas where slide.background is omitted` : 'plain solid neutral canvas where slide.background is omitted; no aesthetic preset selected',
			cards: art ? `explicit art-direction "${art.key}" card language: ${art.card}; authored surface/fill/line/shadow win` : 'flat neutral surface without elevation; authored surface/fill/line/shadow win',
			charts: 'single-series monochrome accent + direct labels + value axis hidden unless chartOptions set',
			tables: 'dark-aware text + header emphasis + horizontal-only hairlines unless tableOptions set',
			statValue: 'hero value font auto-scaled to card height',
			textArrays: 'array text entries stacked as paragraphs (line breaks inferred)',
		},
		// Geometry authority is always the AI for public sovereign and Director-assisted
		// authoring. The compiler reports and serializes authored rectangles; it does not
		// claim creative placement authority.
		layout: {
			geometryAuthority: String(spec?.authoringContract?.geometryAuthority || 'ai'),
			placementPolicy: String(spec?.authoringContract?.placementPolicy || 'ai-authored-geometry-v1'),
			enginePlacedObjects: slides.reduce((n, s) => n + (s.enginePlacedObjects || 0), 0),
			note: 'AI-owned placement: authored rect/bbox values remain authoritative. Inspect slides[].objects[].rect and placementSource at dryRun detail:"full"; enginePlacedObjects must be zero. Spatial findings report issues without creative repositioning.',
		},
		slides,
	}
}

// A compact, stable decision surface for an AI authoring client.  The detailed
// appliedDefaults fields remain available for inspection, but this summary puts
// the five decisions an author must make (world, layout, timing, presenter, and
// quality) in one deterministic, correction-ready object.  It intentionally
// returns semantic levers and finding codes only; rectangles, provider names,
// filesystem paths, and baked realization identifiers stay out of the report.
function buildAuthoringDecisionSummary(spec, plan, { appliedDefaults = {}, warnings = [], errors = [], timingSpine = null } = {}) {
	const planSlides = Array.isArray(plan?.slides) ? plan.slides : []
	const warningList = Array.isArray(warnings) ? warnings : []
	const errorList = Array.isArray(errors) ? errors : []
	const warningCodes = [...new Set(warningList.map(item => item?.code).filter(Boolean).map(String))]
	const errorCodes = [...new Set(errorList.map(item => item?.code).filter(Boolean).map(String))]
	const balanceStatuses = planSlides.map(slide => String(slide?.visualBalance?.status || 'not-applicable'))
	const balanceCounts = balanceStatuses.reduce((out, status) => {
		out[status] = (out[status] || 0) + 1
		return out
	}, {})
	const timingSlides = Array.isArray(timingSpine?.slides) ? timingSpine.slides : []
	const timingReview = timingSlides.filter(slide => slide?.visualFits === false).map(slide => slide.slideId || `slide-${slide.slide}`)
	const timingAuthorities = [...new Set(timingSlides.map(slide => slide?.effectiveClock || slide?.governedBy).filter(Boolean))]
	const timingModes = [...new Set(timingSlides.map(slide => slide?.authorityMode).filter(Boolean))]
	const nextActions = []
	const addAction = (key, owner, inputs, reason) => {
		if (!nextActions.some(action => action.key === key)) nextActions.push({ key, owner, inputs, reason })
	}
	if (errorList.length || errorCodes.length) addAction('resolve-blocking-findings', 'quality', ['warnings[]', 'errors[]'], 'Resolve blocking findings through their semantic fix, then rerun phase:"dryRun".')
	const severeBalance = balanceStatuses.some(status => ['imbalanced', 'underfilled'].includes(status)) || warningCodes.some(code => /LAYOUT_(?:BALANCE|REGION)/.test(code) || /^ARRANGE_(?:STACK|SPLIT|SIDEBAR|COLS)_TOO_DENSE$/.test(code))
	const moderateBalanceReview = balanceStatuses.includes('review')
	if (severeBalance) {
		addAction('rebalance-semantic-layout', 'layout', ['slides[].layoutIntent', 'slides[].arrange', 'slides[].content[].region'], 'Change the semantic layout relationship; never copy engine rectangles into the spec.')
	} else if (moderateBalanceReview) {
		// `review` is a measured, moderate density skew—not a verdict that the
		// composition is wrong.  Proof-led hero splits often give the visual side
		// more occupied area by design.  Let the AI inspect the readback and keep
		// the semantic layout when that dominance serves the story.
		addAction('review-semantic-balance', 'layout', ['slides[].visualBalance', 'slides[].layoutIntent', 'slides[].arrange', 'slides[].content[].region'], 'Inspect the measured visual weight with the story and proof; keep an intentional proof-led split, or revise semantic layout inputs if the dominance is not purposeful.')
	}
	if (timingReview.length || warningCodes.includes('NARRATION_TOO_SHORT_FOR_CONTENT') || warningCodes.includes('NARRATION_LONG_FOR_BUILD')) {
		addAction('repair-narration-fit', 'timing', ['slides[].narration.text', 'slides[].narration.timeline', 'spec.motion.autoSync'], 'Make the narration carry the visual story; text remains the master clock.')
	}
	if (warningCodes.includes('UNVERIFIED_DATA')) addAction('verify-semantic-proof', 'quality', ['content[].verified', 'content[].evidenceSource', 'data[].evidenceSource'], 'Mark factual visual proof as verified with a concise public evidence source.')
	if (!nextActions.length && (warningList.length || errorList.length)) addAction('review-findings', 'quality', ['warnings[]', 'errors[]'], 'Apply each returned semantic fix and rerun the same dry-run phase.')
	const status = errorList.length || errorCodes.length ? 'blocked' : nextActions.length ? 'review' : 'ready'
	return {
		schemaVersion: 'authoring-excellence.decision-summary.v1',
		status,
		world: {
			artDirection: appliedDefaults.artDirection ?? null,
			mode: appliedDefaults.mode ?? null,
			paletteSource: appliedDefaults.palette?.source ?? null,
			legibilityCorrected: appliedDefaults.legibility?.corrected === true,
			completenessTier: appliedDefaults.completeness?.effectiveTier || 'complete',
			completenessSource: appliedDefaults.completeness?.source || 'engine-default',
		},
		layout: {
			engineOwned: false,
			geometryAuthority: 'ai',
			slideCount: planSlides.length,
			enginePlacedObjects: Number(appliedDefaults.layout?.enginePlacedObjects || 0),
			layoutIntentDefaultCount: planSlides.filter(slide => slide?.layoutIntentDefaulted).length,
			balance: balanceCounts,
			correctionLevers: ['slides[].content[].rect', 'slides[].content[].bbox', 'slides[].content[].x/y/w/h'],
		},
		timing: {
			masterClock: timingAuthorities.length === 1 ? timingAuthorities[0] : timingAuthorities.length ? 'per-slide timing authorities' : 'authored slide timing',
			authorityModes: timingModes,
			effectiveClocks: timingAuthorities,
			autoSync: appliedDefaults.autoplay?.autoSync === true,
			visualFitReviewSlides: timingReview,
			correctionLevers: ['slides[].narration.text', 'slides[].narration.timeline', 'spec.motion.autoSync'],
		},
		presenter: {
			active: appliedDefaults.presenter?.active === true,
			identity: appliedDefaults.presenter?.identity ?? null,
			engineOwnsChoreography: false,
			choreographyAuthority: 'consuming-ai',
		},
		quality: {
			blockingFindingCount: errorList.length,
			warningCount: warningList.length,
			warningCodes,
			errorCodes,
		},
		nextActions,
		correctionLoop: {
			read: ['decisionSummary', 'warnings[]', 'errors[]', 'layoutRecommendations', 'timingSpine'],
			edit: ['semantic story', 'authoringContract.completeness', 'styleIntent.artDirection', 'slides[].layoutIntent', 'slides[].content[].rect', 'slides[].content[].bbox', 'slides[].content[].x/y/w/h', 'slides[].narration'],
			repeat: 'betterpptx.deck.generate_from_spec phase:"dryRun"',
			commitWhen: 'status is ready, or the author explicitly accepts advisory review findings',
			forbidden: ['opaque native payloads', 'raw PowerPoint XML'],
		},
	}
}

// M12 brandKit: one convenience input the AI can pass instead of knowing every field. It fans
// out to theme.palette / theme fonts / styleIntent.artDirection WITHOUT overriding anything the
// author set explicitly (explicit theme/styleIntent always win). Accepts brandKit at spec root,
// styleIntent, or theme; palette as an array OR a semantic object {ink, accent, background, ...}.
function normalizeBrandKit(spec = {}) {
	const bk = spec.brandKit || spec.styleIntent?.brandKit || spec.theme?.brandKit
	if (!bk || typeof bk !== 'object') return spec
	const theme = { ...(spec.theme || {}) }
	const styleIntent = { ...(spec.styleIntent || {}) }
	if (!theme.palette && !styleIntent.palette) {
		let pal = null
		if (Array.isArray(bk.palette) && bk.palette.length) pal = bk.palette
		else {
			const o = (bk.palette && typeof bk.palette === 'object') ? bk.palette : bk
			const ink = o.ink || o.text || o.textPrimary
			const accent = o.accent || o.primary
			const bg = o.background || o.bg || o.surface
			if (ink || accent || bg) pal = [ink || '0B1220', accent || '2563EB', o.secondary || o.accent2 || '14B8A6', o.accent3 || o.warn || 'F59E0B', bg || 'F8FAFC']
		}
		if (pal) theme.palette = pal
	}
	const head = bk.headFontFace || bk.headFont || bk.head
	const body = bk.bodyFontFace || bk.bodyFont || bk.body
	if (head && !theme.headFontFace && !theme.fontFace) theme.headFontFace = head
	if (body && !theme.bodyFontFace && !theme.fontFace) theme.bodyFontFace = body
	// brandKit as the SINGLE bespoke front-door (M17): if the AI named a surface/mode
	// (card/mode/surface), assemble a full inline bespoke WORLD from the brand inputs
	// instead of only fanning out colours — so one brandKit input composes a coherent
	// world (canvas + cards + type + accents + data language). A named/object
	// artDirection still wins; explicit styleIntent.artDirection always wins.
	// `surface` is either the legacy string shorthand for a card preset or the
	// continuous surface-knob object. Preserve the object independently so a
	// brand can select a base card (for example `bare`) and still explicitly
	// request a glass/lift surface without losing that author intent.
	const surface = bk.surface && typeof bk.surface === 'object' ? bk.surface : null
	const card = bk.card || (typeof bk.surface === 'string' ? bk.surface : null)
	const mode = bk.mode || bk.tone
	if (!styleIntent.artDirection) {
		if (bk.artDirection) {
			styleIntent.artDirection = bk.artDirection
		} else if (card || mode) {
			styleIntent.artDirection = {
				label: bk.label || bk.brand || bk.name || 'Brand world',
				...(mode ? { mode } : {}),
				...(card ? { card } : {}),
				...(surface ? { surface } : {}),
				...(theme.palette ? { palette: theme.palette } : {}),
				...(head ? { headFontFace: head } : {}),
				...(body ? { bodyFontFace: body } : {}),
			}
		}
	}
	return { ...spec, theme, styleIntent }
}

// ---------------------------------------------------------------------------
// Handshake (M-Handshake): the AI declares its brief + self-set bar; the compiler returns a
// DETERMINISTIC consistency mirror of declared-intent vs compiled-reality. It checks FACTS
// (did you carry every message you committed to? is the deck data-driven if you said so? are
// your proof claims verified?), never TASTE — the AI owns the bar (handshake.bar) and the
// pass/fail call. Advisory for now (surfaced, not gating). This is the static-for-truth half;
// the AI drives the dynamic-for-meaning half.
const HANDSHAKE_TEXT_KINDS = new Set(['textBox', 'title', 'text', 'textShape', 'body', 'quote', 'callout', 'stat', 'kpi', 'metric-grid'])
// DATA = numeric claims that carry "data-driven"/verified-claims. SmartArt/diagrams are
// conceptual (not numeric) so they are NOT data (calibration r1: they caused false verified gaps).
const HANDSHAKE_DATA_KINDS = new Set(['chart-panel', 'table-panel', 'stat', 'kpi', 'metric-grid'])
// EVIDENCE = anything that can SHOW proof: data OR a visual/diagram/media/3D (calibration r1:
// a video teaser is valid proof; proof-present must not insist on a chart/table).
const HANDSHAKE_EVIDENCE_KINDS = new Set(['chart-panel', 'table-panel', 'stat', 'kpi', 'metric-grid', 'smartart', 'diagram', 'media', 'image-feature', 'image', 'model3d', 'freeform'])
const HANDSHAKE_HEAVY_KINDS = new Set(['model3d', 'avatarNarration', 'media'])
const HANDSHAKE_ACTION = /\b(adopt|approve|fund|give|donate|join|start|decide|do them|use it|act|greenlight|lead|buy|sign|commit|invest|switch|migrate|vote|book|hire|launch|pledge|back it|next step)\b/i
function hsText(value) { return String(value ?? '').trim() }

function aiWorldSelectionForSpec(spec = {}) {
	const selection = artDirectionSelectionForSpec(spec)
	const selectedWorld = artDirectionInfo(spec)?.key || null
	return {
		contractVersion: 'authoring-excellence.world-selection.v2',
		selectionAuthority: 'ai',
		selectionStatus: selection.kind === 'named' ? 'ai-selected'
			: selection.kind === 'bespoke' ? 'ai-selected-bespoke'
				: selection.kind === 'neutral' ? 'neutral-explicit'
					: selection.kind === 'unsupported' ? 'unsupported' : 'neutral-omission',
		selectedWorld,
		explicitSelection: selection.explicit,
		certificationEligible: selection.kind !== 'unsupported',
		certificationScope: 'aesthetic-selection-only; not a release certificate or a substitute for current-version validation',
		namedWorldRequired: false,
		customStylingValid: true,
		presetApplied: selection.kind === 'named',
		catalogOrder: 'stable-vocabulary-not-ranking',
		catalogTool: 'betterpptx.authoring.catalog',
		legacyCompatibilityFallback: null,
		rule: 'Omission/null imposes no named aesthetic. Complete explicit custom styling is valid without a World; named and inline bespoke selections execute without ranking. Business completeness, accessibility, package and current-version validation remain independent requirements. Legacy looks require an explicit World selection.',
	}
}

function buildHandshakeReport(spec, plan) {
	const hs = (spec.handshake && typeof spec.handshake === 'object') ? spec.handshake
		: (spec.brief && typeof spec.brief === 'object') ? spec.brief : {}
	const audience = hsText(hs.audience || spec.audience)
	const promise = hsText(hs.promise || hs.thesis || spec.objective)
	const payoff = hsText(hs.payoff || hs.ask)
	const proof = Array.isArray(hs.proof) ? hs.proof.filter(Boolean) : (hsText(hs.proof) ? [hsText(hs.proof)] : [])
	const bar = hsText(hs.bar || hs.excellence || hs.standard)
	const commitments = (Array.isArray(hs.commitments) ? hs.commitments : []).map(c => String(c || '').toLowerCase())
	const slides = Array.isArray(spec.slides) ? spec.slides : []
	const declaredAnything = audience || promise || payoff || proof.length || bar || commitments.length || slides.some(s => hsText(s.message))
	if (!declaredAnything) {
		return {
			note: 'No brief declared. Set spec.handshake {audience, promise, proof, payoff, bar (what "excellent" means for THIS ask), commitments:[...]} and one slide.message per slide. The handshake is a required pre-save factual-consistency checkpoint; it never grades taste and can never certify first-time-right by itself.',
			contractVersion: 'authoring-excellence.handshake.v2',
			scope: 'pre-save-factual-consistency-only',
			status: 'not-declared',
			certifiesFirstTimeRight: false,
			firstTimeRightContractVersion: 'authoring-excellence.first-time-right.v2',
			declared: {}, checks: [], gaps: 1, consistent: false, declaredBrief: false,
		}
	}
	const commitText = `${commitments.join(' ')} ${audience} ${promise}`.toLowerCase()
	const allBlocks = slides.flatMap(s => Array.isArray(s.content) ? s.content : [])
	const dataBlocks = allBlocks.filter(b => b && HANDSHAKE_DATA_KINDS.has(b.kind))
	const hasData = dataBlocks.length > 0
	const checks = []
	const add = (kind, status, detail, slideId) => checks.push(slideId ? { kind, status, slideId, detail } : { kind, status, detail })

	// 1. Message coverage — every slide you committed a message to must have text/stat to carry it.
	for (const s of slides) {
		const msg = hsText(s.message)
		if (!msg) continue
		const blocks = Array.isArray(s.content) ? s.content : []
		const carries = blocks.some(b => b && HANDSHAKE_TEXT_KINDS.has(b.kind))
		add('message-coverage', carries ? 'consistent' : 'gap',
			carries ? `Slide "${s.id}" has text to carry its message.` : `Slide "${s.id}" committed a message but has no text/stat to carry it — add a takeaway line.`, s.id)
	}
	// 2. Message singularity — one headline per slide.
	for (const s of slides) {
		const blocks = Array.isArray(s.content) ? s.content : []
		const heroes = blocks.filter(b => b && ['textBox', 'title', 'text'].includes(b.kind) && Number(b.options?.fontSize || 0) >= 28 && b.options?.bold)
		if (heroes.length > 1) add('message-singularity', 'gap', `Slide "${s.id}" has ${heroes.length} competing headlines — keep one message per slide.`, s.id)
	}
	// 3. Data-driven commitment.
	if (/\bdata|metric|dashboard|chart|number|kpi|quantif/.test(commitText)) {
		add('commitment:data-driven', hasData ? 'consistent' : 'gap',
			hasData ? 'Brief is data-driven and the deck has data objects.' : 'Brief implies data/metrics but no chart/table/stat/metric-grid is present.')
	}
	// 4. Verified claims — if the brief leans on proof/credibility, data objects must be verified.
	if (proof.length || /verif|proof|source|credib|trust|evidence/.test(commitText)) {
		// The public Authoring Excellence contract is verified:true + evidenceSource.
		// Keep dataSource/provenance as compatibility inputs for imported/legacy specs,
		// but never require the private provenance field for an AI-authored proof claim.
		const unverified = dataBlocks.filter(b => !(b.verified === true && (b.evidenceSource || b.dataSource || b.provenance)))
		add('commitment:verified-claims', unverified.length ? 'gap' : 'consistent',
			unverified.length ? `${unverified.length} data object(s) lack verified:true + evidenceSource, but the brief rests on proof/credibility.` : 'Data objects carry verified:true + evidenceSource.')
	}
	// 5. Proof present — only when the brief leans on EVIDENTIARY proof (data/credibility). A narrative
	// proof (e.g. a wedding story, a manifesto) lives in text and needs no chart. Evidence = data OR a
	// visual/diagram/media, not just a chart.
	if (proof.length && /\bdata|metric|number|verif|proof|source|credib|trust|quantif|roi|\bcost\b|revenue|benchmark|evidence/.test(commitText)) {
		const hasEvidence = allBlocks.some(b => b && HANDSHAKE_EVIDENCE_KINDS.has(b.kind))
		if (!hasEvidence) add('proof-present', 'gap', 'Brief leans on evidentiary proof but the deck has no data, chart, diagram, image, media, or 3D object to show it.')
	}
	// 6. Payoff present — a decision-role slide OR a final slide that voices the ask should land it.
	if (payoff) {
		const last = slides[slides.length - 1] || {}
		const lastText = `${last.message || ''} ${(Array.isArray(last.content) ? last.content : []).map(b => (typeof b?.text === 'string' ? b.text : '')).join(' ')}`
		// A comprehension/learning OR emotional payoff ("leave able to explain X" / "leave proud") needs no
		// CTA slide — the deck itself IS the payoff.
		// No trailing \b so inflections match (understand|understanding, consider|considering). Covers
		// comprehension, emotional, and soft-recommendation payoffs — none of which need a CTA slide.
		const learningPayoff = /\b(understand|explain|know|grasp|able to|remember|aware|learn|see why|appreciate|name the|feel|proud|inspired|moved|reassured|welcome|joy|smile|respected|clear-eyed|ready|hopeful|confident|comfortable|excited|motivated|connected|consider|evaluate|weigh|trust|informed|calm|settled|equipped|at ease|clear)/i.test(payoff)
		const hasCloser = learningPayoff || slides.some(s => /decision|cta|close|ask|recommend|next|payoff/i.test(`${s.role || ''} ${s.id || ''}`)) || HANDSHAKE_ACTION.test(lastText)
		add('payoff-present', hasCloser ? 'consistent' : 'gap',
			hasCloser ? 'A closing slide (or a comprehension payoff) lands it.' : 'Brief names an action payoff but no slide voices it — add a closing slide that states the ask.')
	}
	// 7. Restraint commitment.
	if (/restrain|minimal|simple|clean|tight|sparse/.test(commitText)) {
		for (const s of slides) {
			const blocks = Array.isArray(s.content) ? s.content : []
			if (blocks.length > 5 || blocks.some(b => b && HANDSHAKE_HEAVY_KINDS.has(b.kind))) {
				add('commitment:restraint', 'gap', `Slide "${s.id}" looks busy/heavy versus the declared restraint.`, s.id)
			}
		}
	}
	const gaps = checks.filter(c => c.status === 'gap').length
	return {
		note: 'Handshake = your declared brief vs the compiled FACTS — a deterministic pre-save consistency mirror, NOT a taste grade or first-time-right certificate. Resolve factual gaps before the first save. Dry-runs, in-memory compilation/validation, semantic self-correction, and available preview may iterate before save; FTR starts at the first deck.save artifact and additionally requires repair-free PowerPoint open, package/accessibility validation, every full-size slide passing all ten AI visual-review lenses, and no post-save rescue.',
		contractVersion: 'authoring-excellence.handshake.v2',
		scope: 'pre-save-factual-consistency-only',
		status: gaps === 0 ? 'consistent' : 'gaps',
		certifiesFirstTimeRight: false,
		firstTimeRightContractVersion: 'authoring-excellence.first-time-right.v2',
		declared: { audience: audience || null, promise: promise || null, proof: proof.length ? proof : null, payoff: payoff || null, bar: bar || null, commitments: commitments.length ? commitments : null },
		checks,
		gaps,
		consistent: gaps === 0,
		declaredBrief: true,
	}
}

// M21 — splitGrid: one image block expands into rows x cols cell blocks, each carrying a
// PERCENT crop imageOp (resolution-independent, byte-free at compile time — the raster
// engine applies the crop at execute). Cells drop explicit geometry so the layout engine
// flows them like any image set (metric-grid/columns/regions all apply).
function expandImageSplitBlocks(spec) {
	if (!spec || !Array.isArray(spec.slides)) return spec
	if (!spec.slides.some(slide => (slide?.content || []).some(block => block?.splitGrid))) return spec
	return {
		...spec,
		slides: spec.slides.map(slide => {
			const content = Array.isArray(slide?.content) ? slide.content : null
			if (!content || !content.some(block => block?.splitGrid)) return slide
			const expanded = []
			for (const block of content) {
				const grid = block?.splitGrid
				const kind = String(block?.kind || '').toLowerCase()
				if (!grid || typeof grid !== 'object' || !['image', 'image-feature'].includes(kind)) {
					expanded.push(block)
					continue
				}
				const rows = Math.max(1, Math.min(6, Math.round(Number(grid.rows) || 2)))
				const cols = Math.max(1, Math.min(6, Math.round(Number(grid.cols) || 2)))
				const cells = Array.isArray(grid.pick) && grid.pick.length
					? grid.pick.map(cell => [Math.max(1, Math.min(rows, Math.round(cell?.[0]) || 1)), Math.max(1, Math.min(cols, Math.round(cell?.[1]) || 1))])
					: Array.from({ length: rows * cols }, (_, i) => [Math.floor(i / cols) + 1, (i % cols) + 1])
				for (const [row, col] of cells) {
					const { splitGrid: _grid, rect: _rect, bbox: _bbox, x: _x, y: _y, w: _w, h: _h, ...rest } = block
					expanded.push({
						...rest,
						name: `${block.name || 'image'}.r${row}c${col}`,
						imageOps: [
							{ op: 'crop', x: (col - 1) * (100 / cols), y: (row - 1) * (100 / rows), w: 100 / cols, h: 100 / rows },
							...(Array.isArray(block.imageOps) ? block.imageOps : []),
						],
					})
				}
			}
			return { ...slide, content: expanded }
		}),
	}
}

// Annotated illustrations are a hybrid authoring primitive: generated pixels are
// kept text-free, while required labels and arrows are compiled into ordinary
// editable PowerPoint objects. Coordinates are fractions of the image rectangle
// by default (or percentages when units:"percent" is declared).
function expandNativeAnnotationBlocks(spec) {
	if (!spec || !Array.isArray(spec.slides)) return spec
	let changed = false
	// Annotation coordinates are relative to the image frame.  When the client
	// omits a rect (as required by the Director contract), ask the shared layout
	// engine for the same semantic placement used by compilation and use that
	// engine result as the private expansion base.
	let semanticBases = new Map()
	try {
		const layout = planDeckLayout(spec)
		for (const slide of layout.slides || []) {
			for (const object of slide.objects || []) {
				if (object?.blockName && object?.primitive === 'image' && object.rect) {
					semanticBases.set(`${slide.slideId}:${object.blockName}`, object.rect)
				}
			}
		}
	} catch { semanticBases = new Map() }
	const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
	const fraction = (value, units, fallback = 0) => {
		const n = number(value, fallback)
		if (units === 'percent' || units === '%') return n / 100
		return n
	}
	const relativeRect = (item, base, defaults, units) => ({
		x: base.x + fraction(item?.x, units, defaults.x) * base.w,
		y: base.y + fraction(item?.y, units, defaults.y) * base.h,
		w: Math.max(0.05, fraction(item?.w, units, defaults.w) * base.w),
		h: Math.max(0.05, fraction(item?.h, units, defaults.h) * base.h),
	})
	return {
		...spec,
		slides: spec.slides.map(slide => {
			const content = Array.isArray(slide?.content) ? slide.content : null
			if (!content) return slide
			const expanded = []
			let slideChanged = false
			for (const block of content) {
				expanded.push(block)
				const kind = String(block?.kind || '').toLowerCase()
				const intent = block?.visualIntent && typeof block.visualIntent === 'object' ? block.visualIntent : block?.generation
				const annotationSet = intent?.nativeAnnotations || intent?.annotations
				if (!['image', 'image-feature'].includes(kind) || !annotationSet || typeof annotationSet !== 'object') continue
				const baseRaw = block.rect || block.bbox || semanticBases.get(`${slide.id}:${block.name || block.objectName}`)
				if (!baseRaw || !(number(baseRaw.w) > 0) || !(number(baseRaw.h) > 0)) continue
				const base = { x: number(baseRaw.x), y: number(baseRaw.y), w: number(baseRaw.w), h: number(baseRaw.h) }
				const units = annotationSet.units === 'percent' || annotationSet.coordinateMode === 'percent' ? 'percent' : 'fraction'
				const labels = Array.isArray(annotationSet.labels) ? annotationSet.labels : []
				labels.forEach((label, index) => {
					const item = typeof label === 'string' ? { text: label } : label
					const text = String(item?.text || item?.label || '').trim().slice(0, 120)
					if (!text) return
					slideChanged = changed = true
					expanded.push({
						kind: 'textShape',
						name: `${block.name || block.objectName || 'image'}.annotation.label.${index + 1}`,
						text,
						bbox: relativeRect(item, base, { x: 0.05, y: 0.05 + index * 0.1, w: 0.22, h: 0.09 }, units),
						role: 'native-annotation-label',
						shape: item?.shape || 'roundRect',
						style: { fill: item?.fill || { color: 'FFFFFF', transparency: 8 }, line: item?.line || { color: 'CBD5E1', width: 1 }, color: item?.color || '102A43', fontSize: number(item?.fontSize, 12), bold: item?.bold !== false, align: 'center', valign: 'middle', ...(item?.shadow ? { shadow: item.shadow } : {}) },
						altText: `Native annotation label: ${text}`,
					})
				})
				const arrows = Array.isArray(annotationSet.arrows) ? annotationSet.arrows : []
				arrows.forEach((arrow, index) => {
					if (!arrow || typeof arrow !== 'object') return
					slideChanged = changed = true
						expanded.push({
							kind: 'shape',
							name: `${block.name || block.objectName || 'image'}.annotation.arrow.${index + 1}`,
							shape: 'line',
							bbox: relativeRect(arrow, base, { x: 0.15, y: 0.2 + index * 0.1, w: 0.25, h: 0.04 }, units),
							role: 'native-annotation-arrow',
							...(arrow.flipH === true ? { flipH: true } : {}),
							...(arrow.flipV === true ? { flipV: true } : {}),
							style: { fill: { color: 'FFFFFF', transparency: 100 }, line: { color: arrow.color || '102A43', width: number(arrow.width, 2), beginArrowType: arrow.arrowAt === 'start' ? 'triangle' : (arrow.beginArrowType || 'none'), endArrowType: arrow.arrowAt === 'start' ? 'none' : (arrow.endArrowType || 'triangle') } },
						altText: `Native annotation arrow ${index + 1}`,
					})
				})
			}
			return slideChanged ? { ...slide, content: expanded } : slide
		}),
	}
}

// A2a (§2.6 step 4): preliminary-layout target boxes for interaction solving. Runs the layout
// engine on the PRE-expansion spec (no injected presenters yet) and unions each content block's
// placed objects into one bbox keyed by slideId → block name (decorative objects excluded).
// Computed ONLY when some interaction target lacks an authored bbox — zero extra work otherwise.
// Fail-safe: any layout error returns null and the authored-bbox behavior applies unchanged.
function interactionTargetBoxes(spec, options) {
	try {
		const needsBoxes = Array.isArray(spec?.slides) && spec.slides.some(s =>
			[...(s.interactions || []), ...(s.presenterPerformance?.interactions || [])].some(b => {
				const find = nodes => {
					for (const node of nodes || []) {
						if (node && typeof node === 'object' && (node.objectName === b.target || node.name === b.target)) return node
						const nested = find(node?.children)
						if (nested) return nested
					}
					return null
				}
				const t = find(s.content)
				return !(t && t.bbox)
			}))
		if (!needsBoxes) return null
		const plan = planDeckLayout(spec, options)
		const bySlide = {}
		for (const slide of plan.slides || []) {
			const blocks = {}
			const record = (key, r) => {
				if (!key || !r) return
				const prev = blocks[key]
				if (!prev) { blocks[key] = { x: r.x, y: r.y, w: r.w, h: r.h }; return }
				const x = Math.min(prev.x, r.x), y = Math.min(prev.y, r.y)
				blocks[key] = {
					x, y,
					w: Math.max(prev.x + prev.w, r.x + r.w) - x,
					h: Math.max(prev.y + prev.h, r.y + r.h) - y,
				}
			}
			const visit = (obj, absoluteRect = null) => {
				if (!obj || obj.role === 'decorative') return
				const r = absoluteRect || obj.rect
				record(obj.blockName || obj.objectName || obj.name, r)
				if (!r || !Array.isArray(obj.children)) return
				const extent = obj.chExt || { x: 0, y: 0, w: r.w, h: r.h }
				const offset = obj.chOff || { x: 0, y: 0 }
				const sx = r.w / Math.max(0.000001, Number(extent.w) || r.w)
				const sy = r.h / Math.max(0.000001, Number(extent.h) || r.h)
				for (const child of obj.children) {
					const local = child.rect || child
					if (![local.x, local.y, local.w, local.h].every(value => Number.isFinite(Number(value)))) continue
					visit(child, {
						x: r.x + (Number(local.x) - Number(offset.x || 0)) * sx,
						y: r.y + (Number(local.y) - Number(offset.y || 0)) * sy,
						w: Number(local.w) * sx,
						h: Number(local.h) * sy,
					})
				}
			}
			for (const obj of slide.objects || []) visit(obj)
			bySlide[slide.slideId] = blocks
		}
		return bySlide
	} catch { return null }
}

export { lowerHtmlAuthoringSurface, promoteColumnHeadlines, applyPowerpointNiceties } from './html-slide-compiler.mjs'

function validateNative3DFieldsInSpec(spec = {}) {
	for (const slide of Array.isArray(spec.slides) ? spec.slides : []) {
		const walk = (block, path) => {
			if (!block || typeof block !== 'object' || Array.isArray(block)) return
			const candidates = [
				['effect3D', block.effect3D],
				['text3D', block.text3D],
				['style.effect3D', block.style?.effect3D],
				['style.text3D', block.style?.text3D],
				['options.effect3D', block.options?.effect3D],
				['options.text3D', block.options?.text3D],
			]
			for (const [field, value] of candidates) validateNative3DEffect(value, `${path}.${field}`)
			if (Array.isArray(block.children)) block.children.forEach((child, index) => walk(child, `${path}.children[${index}]`))
		}
		for (const [index, block] of (Array.isArray(slide.content) ? slide.content : []).entries()) {
			walk(block, `slides[${slide.id || slide.index || 0}].content[${index}]`)
		}
	}
}

// Never let a stopped-pose request enter a retargeting/materialization lane or
// disappear into a poster/interaction lowering. The final ordinary model is
// validated again by the same sampler in both dryRun and native insertion.
function validateStaticPoseFieldsInSpec(spec = {}) {
	const posedActors = new Set()
	let hasPose = false
	const actorId = String(spec.presenter?.id || 'presenter')
	const record = (holder, field, actor = null) => {
		if (!holder || !Object.prototype.hasOwnProperty.call(holder, 'staticPose')) return
		if (normalizeStaticPose(holder.staticPose, `${field}.staticPose`)) {
			hasPose = true
			if (actor) posedActors.add(actor)
		}
	}
	record(spec.presenter, 'presenter', actorId)
	const cast = Array.isArray(spec.presenters?.cast) ? spec.presenters.cast : []
	cast.forEach((entry, index) => record(entry, `presenters.cast[${index}]`, String(entry?.id || '')))
	for (const [slideIndex, slide] of (spec.slides || []).entries()) {
		if (slide.presenter?.staticPose != null && (!spec.presenter || spec.presenter.enabled === false)) throw staticPoseError('STATIC_POSE_PRESENTER_REQUIRED', 'A slide-level staticPose needs an enabled deck presenter. Otherwise put staticPose on the native model3d object.')
		record(slide.presenter, `slides[${slideIndex}].presenter`, actorId)
		for (const [beatIndex, beat] of (Array.isArray(slide.scene) ? slide.scene : []).entries()) record(beat, `slides[${slideIndex}].scene[${beatIndex}]`, String(beat?.actor || ''))
		const walk = (block, field) => {
			if (!block || typeof block !== 'object') return
			const pose = model3dStaticPose(block, field)
			if (pose !== undefined && block.kind !== 'model3d') throw staticPoseError('STATIC_POSE_TARGET_UNSUPPORTED', `${field}.staticPose belongs only to a native model3d object or presenter.`)
			if (pose) hasPose = true
			for (const [index, child] of (Array.isArray(block.children) ? block.children : []).entries()) walk(child, `${field}.children[${index}]`)
		}
		for (const [index, block] of (slide.content || []).entries()) walk(block, `slides[${slideIndex}].content[${index}]`)
	}
	if (!hasPose) return
	if (spec.presenter?.staticPose != null && spec.presenter.enabled === false) throw staticPoseError('STATIC_POSE_PRESENTER_REQUIRED', 'A disabled presenter cannot display staticPose. Enable it or remove the pose request.')
	if (normalizeMotionPolicy(spec) === 'static') throw staticPoseError('STATIC_POSE_POLICY_UNSUPPORTED', 'staticPose needs a native model. motionPolicy static replaces presenters with poster images; use full or reduced and select playback separately.')
	for (const entry of [spec.presenter, ...cast]) {
		if (!entry || !posedActors.has(String(entry.id || 'presenter'))) continue
		if (entry.kinetic || entry.mode === 'kinetic' || entry.kineticClips) throw staticPoseError('STATIC_POSE_BANK_REBUILD_UNSUPPORTED', 'staticPose cannot be combined with a motion-bank rebuild. Use the unchanged approved ordinary presenter model.')
	}
	for (const directive of authoringMotionSelectionDirectives(spec)) {
		if (posedActors.has(directive.presenterId)) throw staticPoseError('STATIC_POSE_BANK_REBUILD_UNSUPPORTED', 'staticPose cannot be combined with kineticSelection for the same presenter. Use the unchanged approved ordinary model and its existing motion map.')
	}
	for (const slide of spec.slides || []) {
		if ((slide.interactions || []).some(beat => posedActors.has(String(beat?.actor || '')))) throw staticPoseError('STATIC_POSE_INTERACTION_UNSUPPORTED', 'staticPose is not supported on interaction-generated presenter instances. Use an explicitly authored native model3d or presenter scene beat.')
	}
}

function validateMotionFramingFieldsInSpec(spec = {}) {
	const walk = (block, path) => {
		if (!block || typeof block !== 'object') return
		const motionFraming = model3dMotionFraming(block, path)
		if (motionFraming !== undefined) {
			if (block.kind !== 'model3d') throw motionFramingError(`${path}.motionFraming applies only to a native model3d object.`, 'MODEL3D_MOTION_FRAMING_TARGET_UNSUPPORTED')
			const holders = [block, block.model3dOptions, block.modelOptions].filter(Boolean)
			const options = Object.assign({}, ...holders)
			const scene = normalizeStaticPoseScene(options.scene, model3dStaticPose(block))
			for (const holder of holders) validateModel3dMotionFramingOptions({ ...holder, motionFraming, scene }, path)
		}
		for (const [index, child] of (Array.isArray(block.children) ? block.children : []).entries()) walk(child, `${path}.children[${index}]`)
	}
	for (const [slideIndex, slide] of (spec.slides || []).entries()) for (const [index, block] of (slide.content || []).entries()) walk(block, `slides[${slideIndex}].content[${index}]`)
}

function validateTextFillFieldsInSpec(spec = {}) {
	const visit = (value, path, partial = false) => {
		if (Array.isArray(value)) { value.forEach((item, index) => visit(item, `${path}[${index}]`, partial)); return }
		if (!value || typeof value !== 'object') return
		if (Object.prototype.hasOwnProperty.call(value, 'textFill')) normalizeTextFill(value.textFill, `${path}.textFill`, { allowPartial: partial })
		for (const key of ['style', 'options', 'patch']) if (value[key] && typeof value[key] === 'object') visit(value[key], `${path}.${key}`, partial || key === 'patch')
		// New run values are complete fills, even inside a sparse text replacement.
		for (const key of ['text', 'children', 'runs', 'rows']) if (Array.isArray(value[key])) visit(value[key], `${path}.${key}`)
	}
	for (const [index, slide] of (spec.slides || []).entries()) visit(slide.content, `slides[${index}].content`)
}

function validateStructuralFieldsInSpec(spec = {}, options = {}) {
	for (const [slideIndex, slide] of (Array.isArray(spec.slides) ? spec.slides : []).entries()) {
		for (const [blockIndex, block] of (Array.isArray(slide?.content) ? slide.content : []).entries()) {
			if (!block || typeof block !== 'object' || Array.isArray(block)) continue
			// The explicit secondary HTML converter emits bounded internal vector
			// blocks with engine-owned placement flags. They are not public-authored
			// structural payloads and must not be revalidated as client input.
			if (options.trustedHtmlLowering === true && block._engineOwnedGeometry === true) continue
			const normalized = validateStructuralBlock(block, `slides[${slideIndex}].content[${blockIndex}]`)
			if (normalized && typeof normalized === 'object') Object.assign(block, normalized)
		}
	}
}

function validateEquationFieldsInSpec(spec = {}) {
	for (const [slideIndex, slide] of (Array.isArray(spec.slides) ? spec.slides : []).entries()) {
		for (const [blockIndex, block] of (Array.isArray(slide?.content) ? slide.content : []).entries()) {
			if (!block || typeof block !== 'object' || Array.isArray(block)) continue
			const normalized = validateEquationBlock(block, `slides[${slideIndex}].content[${blockIndex}]`)
			if (normalized && typeof normalized === 'object') Object.assign(block, normalized)
		}
	}
}

function normalizeSlideBackgroundForCompile(value) {
	return normalizeSlideBackground(value)
}

// Private shared validation geometry. Both compilation and committed-deck
// checks use the same sampled visible body, while supplying their own current
// content rectangle and animation records. Only absolute, automatic timing can
// prove an object hidden; interactive or relative timing remains conservative.
export function findPresenterPerformanceCollision({ samples, rect, animations = [], minimumOverlap = 0.03 } = {}) {
	if (!Array.isArray(samples) || !rect) return null
	const cues = Array.isArray(animations) ? animations : animations ? [animations] : []
	const absoluteCues = cues.filter(cue => cue && (!cue.trigger || cue.trigger === 'withPrevious')
		&& Number.isFinite(Number(cue.delay ?? cue.delayMs ?? 0))
		&& Number.isFinite(Number(cue.duration ?? cue.durationMs ?? 0)))
	const entrances = absoluteCues.filter(cue => cue.type === 'entrance')
	const hasUncertainEntrance = cues.some(cue => cue?.type === 'entrance' && !absoluteCues.includes(cue))
	const exits = absoluteCues.filter(cue => cue.type === 'exit')
	const visibleAt = atMs => (hasUncertainEntrance || !entrances.length || entrances.some(cue => atMs >= Number(cue.delay ?? cue.delayMs ?? 0)))
		&& !exits.some(cue => atMs >= Number(cue.delay ?? cue.delayMs ?? 0) + Number(cue.duration ?? cue.durationMs ?? 0))
	return samples.find(sample => {
		if (!sample?.rect || !visibleAt(sample.atMs)) return false
		const a = sample.rect, b = rect
		return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > minimumOverlap
			&& Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > minimumOverlap
	}) || null
}

export function buildSpecOperationPlan(spec, options = {}) {
	const verificationPolicy = publicVerificationPolicy()
	validationIntentForSpec(spec)
	// Preserve the exact AI-authored boundary before per-slide lowering can
	// normalize away an unsupported or mistyped cross-slide request.
	let slideContinuities = normalizeSlideContinuities(spec)
	const authoredContinuitySpec = slideContinuities.boundaries.length ? structuredClone(spec) : null
	const visualReferenceAlreadyNormalized = isVisualReferenceReconstruction(spec)
		&& String(spec?.authoringContract?.placementPolicy || '').toLowerCase() === 'visual-reference-pixels-v1'
	if (!visualReferenceAlreadyNormalized) spec = normalizeVisualReferenceReconstruction(spec)
	// Resolve content-kind aliases before any family validator or layout decision.
	// The audit is kept outside the submitted spec and attached only to the
	// readback plan, so the canonical digest remains portable while the caller can
	// still see exactly how a legacy request was represented.
	const contentNormalization = normalizeContentKindsInSpec(spec)
	spec = contentNormalization.spec
	validateNative3DFieldsInSpec(spec)
	validateStaticPoseFieldsInSpec(spec)
	validateMotionFramingFieldsInSpec(spec)
	validateTextFillFieldsInSpec(spec)
	validateStructuralFieldsInSpec(spec, options)
	validateEquationFieldsInSpec(spec)
	spec = normalizeSlideZoomBlocksInSpec(spec)
	spec = normalizeSectionSummaryZoomSpec(spec, { patchMode: options.patchMode === true })
	// Action Settings and custom-show topology are captured before semantic layout
	// lowering so the public object action cannot be mistaken for an engine patch
	// directive and no unknown block field is silently discarded by the planner.
	const customShowsAuthored = Object.prototype.hasOwnProperty.call(spec || {}, 'customShows')
	const normalizedCustomShows = normalizeCustomShows(spec?.customShows, Array.isArray(spec?.slides) ? spec.slides : [], 'customShows')
	const interactiveActions = collectInteractiveActions(spec, normalizedCustomShows)
	// Capture and validate the public vocabulary before layout lowering. Public
	// `title` never enters visible chart/SmartArt title lanes. The historical
	// decorative layout hint remains intact, while its accessibility meaning is
	// lowered independently to the native isDecorative carrier.
	const accessibilityMetadata = collectAccessibilityMetadata(spec)
	spec = stripPublicAccessibilityMetadata(spec)
	spec = stripPublicInteractiveActions(spec)
	spec = applyPowerpointNiceties(promoteColumnHeadlines(spec))
	// The AI resolves design choices before compilation.  Materialization merely
	// binds those exact IDs to their semantic objects, enforces native-first
	// representation, and refuses conflicts instead of silently substituting.
	const selectionMaterialization = materializeAiSelectionManifest(spec)
	// Layout gallery IDs bind to bundled native master/layout resources only after
	// the manifest has been materialized. Keep the pure compiler correct as well
	// as the MCP handler so direct verification cannot observe a weaker contract.
	const resourceResolvedSpec = resolveLayoutThemeMasterSpec(selectionMaterialization.spec)
	spec = normalizeBrandKit(expandNativeAnnotationBlocks(expandImageSplitBlocks(resourceResolvedSpec)))
	// A first-class animated table is an explicit native composite. Lower it
	// before preliminary layout and Synergy solving so every generated row and
	// cell has one stable public identity across motion, interaction, readback,
	// and package serialization.
	spec = expandAnimatedTables(spec)
	// Resolve the product-level 3D/talking-head choice before either lane is
	// expanded. This prevents an implicit duplicate presenter while preserving
	// explicit hybrid authoring.
	spec = applyPresenterRepresentationPolicy(spec)
	// PRESENTER-DIRECTOR: expand a deck-level `presenter` directive (or a world persona) into a same-named
	// 3D-avatar 'presenter' model3d block per slide (role-driven gesture clip + Morph-travel + approach).
	// Runs BEFORE planDeckLayout so the injected presenter flows through the normal model3d/scene/Morph path.
	{
		const wp = artPresenterForSpec(spec)
		spec = preparePresenterPerformances(spec)
		spec = ensureAuthoringMotionPresenterDeclarations(spec)
		slideContinuities = bindSlideContinuitiesToAuthoredActions(slideContinuities, spec)
		slideContinuities = checkSlideContinuitiesAgainstKnownDeckStart(slideContinuities, spec)
		slideContinuities = bindSlideContinuitiesToQualifiedReleases(slideContinuities, spec, qualifiedContinuityReleaseByMotionId)
		validateStaticPoseFieldsInSpec(spec)
		spec = materializeDefaultPresenterForSpec(spec, wp)
		spec = materializeAuthoringMotionForSpec(spec)
		spec = materializeKineticForSpec(spec) // in-process kinetic-clip swap (no-op unless a kinetic presenter/cast is asked)
		// SYNERGY INTERACTIONS (slides[].interactions): lowers {actor, verb, target} beats to solved
		// presenter instances + contact-timed native effects (empirical clip timelines; no-op without beats).
		// A2a ORDER SWAP (§2.6 steps 4-6, 2026-07-14): a PRELIMINARY layout pass supplies target boxes from
		// the ACTUAL slide size, so meaning-only specs need no hand-authored bbox (authored bbox stays an
		// override). The post-expansion planDeckLayout below is the ONE bounded replan that re-lays content
		// with the injected presenters included.
		const interactionSlideSize = options.slideSize || slideSizeFromSpec(spec) || null
		spec = materializePresenterPerformancesForSpec(spec, {
			slideSize: interactionSlideSize,
			targetBoxes: interactionTargetBoxes(spec, { ...options, slideSize: interactionSlideSize || undefined }),
		})
		 spec = expandInteractions(spec, {
			castAssets: castAssetsForSpec(spec, true),
			slideSize: interactionSlideSize, // T24: solver/effect fractions derive from the ACTUAL slide size
			targetBoxes: interactionTargetBoxes(spec, { ...options, slideSize: interactionSlideSize || undefined }),
		})
		// Interaction-heavy slides are a semantic Director contract. Do not allow
		// an unsolved beat to limp through as hand-authored playScene choreography.
		const interactionIssues = interactionPlanIssues(spec)
		if (interactionIssues.length) {
			const error = new Error('Interaction plan is not solved from empirical clip timelines.')
			error.code = interactionIssues[0].code || 'INTERACTION_PLAN_UNSOLVED'
			error.issues = interactionIssues
			throw error
		}
		// A2a §2.6 step 7: SOLVED interaction beats own their (slide, actor) pairs — the default
		// cast/presenter beat on those slides is redundant and suppressed (authored scene beats win).
		const interactionOwned = new Map()
		for (const performance of spec._presenterPerformancePlan?.performances || []) {
			if (!interactionOwned.has(performance.slideId)) interactionOwned.set(performance.slideId, new Set())
			interactionOwned.get(performance.slideId).add(performance.actor)
		}
		for (const b of spec._synergyPlan || []) {
			if (b && b.slideId != null && b.actor != null && (b.clip != null || b.framePos)) {
				if (!interactionOwned.has(b.slideId)) interactionOwned.set(b.slideId, new Set())
				interactionOwned.get(b.slideId).add(String(b.actor))
			}
		}
		// MULTI-PRESENTER CAST (spec.presenters.cast): when present it REPLACES the single-presenter path
		// (expandCastDirective strips spec.presenter). One 3D-scene clip per model INSTANCE, so a slide can stage
		// several actors, each with its own clip + cue (slides[].scene beats).
		spec = expandCastDirective(spec, { castAssets: castAssetsForSpec(spec), suppress: interactionOwned, slideSize: interactionSlideSize })
		// C1: the deck-level story arc drives per-slide presenter presence (recede on data-dense slides).
		// Opt-in via spec.storyDirection (default off) so existing decks are byte-identical.
		const storyArc = spec.storyDirection === true || spec.storyDirection === 'on' ? planStoryArc(spec) : null
		spec = expandPresenterDirective(spec, { worldPresenter: wp, avatarClipMap: avatarClipMapForSpec(spec, wp), avatarContactMap: avatarContactMapForSpec(spec, wp), avatarClipDurations: avatarClipDurationsForSpec(spec, wp), avatarViewportMargin: avatarViewportMarginForSpec(spec, wp), presenterPalette: resolvedPaletteForSpec(spec), suppress: interactionOwned, slideSize: interactionSlideSize, storyArc })
		// D5: apply the full/reduced/static motion policy to the EXPANDED spec — static renders
		// presenters as their poster (no runtime dependence), reduced drops large travel/impact.
		spec = applyMotionPolicy(spec)
	}
	const effectiveOptions = {
		...options,
		slideSize: options.slideSize || slideSizeFromSpec(spec) || options.slideSize,
	}
	// Fresh public pixel authoring has passed visual-reference normalization, not
	// an export-roundtrip contract. Preserve its explicit author rectangles too;
	// a placementPolicy string alone is not an opt-in. This precision-only option
	// does not enable native preservation, implicit-background suppression or the
	// existing roundtrip off-slide policy.
	const preserveVisualSourceGeometry = isVisualReferenceReconstruction(spec)
		&& spec.visualReference?.schemaVersion === VISUAL_REFERENCE_RECONSTRUCTION_VERSION
		&& spec.visualReference?.representationPolicy === 'native-except-media'
		&& spec.authoringContract?.placementPolicy === 'visual-reference-pixels-v1'
	const preserveAiAuthoredGeometry = isAiAuthoredGeometrySpec(spec)
	const plan = planDeckLayout(spec, {
		...effectiveOptions,
		preserveAuthoredPrecision: effectiveOptions.preserveAuthoredPrecision === true || preserveVisualSourceGeometry || preserveAiAuthoredGeometry,
	})
	slideContinuities = bindSlideContinuitiesToPlan(slideContinuities, plan)
	slideContinuities = bindSlideContinuitiesToAuthoredNarration(slideContinuities, spec)
	attachContentRepresentationAudit(plan, contentNormalization.audit)
	assertContentRepresentationIntegrity(plan, contentNormalization.audit)
	const layoutValidation = validateLayoutPlan(plan, {
		allowOffSlide: effectiveOptions.allowOffSlideGeometry === true,
		preserveSourceGeometry: effectiveOptions.preserveSourceGeometry === true,
		aiAuthoredGeometry: preserveAiAuthoredGeometry,
		spatialConflictPolicy: 'report-only',
	})
	// This proof is intentionally excluded from compactSpecPlan/public readback.
	// The runtime binds it to the exact committed deck version before using it.
	const presenterPerformanceValidation = {
		schemaVersion: 'betterpptx.presenter-performance-validation.v1',
		slides: [],
	}
	// A native model window contains generous transparent space so articulated
	// hands and drop entries are not clipped. Validate its sampled visible body,
	// including authored travel and object visibility, rather than treating that
	// transparent rectangle as opaque. Spatial relations remain AI-authoring
	// diagnostics; only structural/runtime contract faults block compilation.
	for (const performance of spec._presenterPerformancePlan?.performances || []) {
		const sourceSlide = spec.slides.find(slide => slide.id === performance.slideId)
		const samples = sourceSlide?._presenterPerformanceVisibleBounds?.samples
		const plannedSlide = plan.slides.find(slide => slide.slideId === performance.slideId)
		if (!samples?.length || !plannedSlide) continue
		const model = plannedSlide.objects.find(object => object.objectName === performance.actor)
		if (!model?.rect) continue
		const authoredEntry = sourceSlide._presenterPerformanceVisibleBounds.entry
		const safeStageFrame = authoredEntry?.stageFrame
		const entry = ['drop', 'fade', 'appear'].includes(authoredEntry?.type)
			&& model.rect.y + model.rect.h < -0.01
			&& ['x', 'y', 'w', 'h'].every(key => Math.abs(model.rect[key] - authoredEntry.initialFrame?.[key]) < 0.001)
			&& safeStageFrame?.x >= 0 && safeStageFrame?.y >= 0
			&& safeStageFrame.x + safeStageFrame.w <= plan.slideSize.w + 0.001
			&& safeStageFrame.y + safeStageFrame.h <= plan.slideSize.h + 0.001
			? { ...authoredEntry, initialFrame: { ...model.rect }, stageFrame: { ...safeStageFrame } } : null
		presenterPerformanceValidation.slides.push({
			slideId: performance.slideId,
			slideIndex: plannedSlide.slideIndex,
			actor: performance.actor,
			frame: { ...model.rect },
			...(entry ? { entry } : {}),
			samples: samples.map(sample => ({ atMs: sample.atMs, rect: { ...sample.rect } })),
			contactTargets: (performance.interactions || []).map(interaction => ({
				actionId: interaction.actionId,
				target: interaction.target,
				objectName: plannedSlide.objects.find(object => object.blockName === interaction.target || object.objectName === interaction.target)?.objectName || null,
				atMs: interaction.atMs,
			})),
		})
		// Only the engine-created, wholly hidden entrance frame is permitted outside
		// the canvas, and only with its explicit on-stage destination/path proof.
		if (entry) layoutValidation.issues = layoutValidation.issues.filter(issue => !(issue.code === 'OFF_SLIDE_OBJECT' && issue.slideId === performance.slideId && issue.objectName === performance.actor))
		layoutValidation.issues = layoutValidation.issues.filter(issue => !(issue.code === 'OBJECT_OVERLAP' && issue.slideId === performance.slideId && issue.objects?.includes(performance.actor)))
		for (const other of plannedSlide.objects) {
			if (other.objectName === performance.actor || ['background', 'decorative'].includes(other.role) || other.bleed || !other.rect) continue
			const source = sourceSlide.content.find(block => block.name === other.blockName || block.objectName === other.objectName) || {}
			const cues = [...(Array.isArray(source.animation) ? source.animation : source.animation ? [source.animation] : []), ...(sourceSlide.timeline || []).flatMap(sequence => sequence.steps || [sequence]).filter(step => [step.name, step.objectName, ...(step.names || [])].some(name => name === other.objectName || name === other.blockName)).map(step => step.animation || step)]
			const collision = findPresenterPerformanceCollision({ samples, rect: other.rect, animations: cues })
			if (!collision) continue
			const contact = performance.interactions.find(item => item.target === other.blockName || item.target === other.objectName)
			layoutValidation.issues.push({ code: contact ? 'PRESENTER_PERFORMANCE_CONTACT_OVERLAP' : 'OBJECT_OVERLAP', severity: contact ? 'info' : 'warning', slideId: performance.slideId, objects: [performance.actor, other.objectName],
				reason: contact ? 'Measured presenter/target spatial contact at the authored cue. The engine does not infer which body part, layer, depth order, or visibility result the AI intended.' : 'Measured presenter/content overlap during the authored performance. The engine does not infer whether the relation is intentional or undesirable.',
				fix: 'AI authoring must choose the spatial policy and timing. The engine exposes the measured relation and compiles the authored choice; it will not move, resize, reorder, hide, or substitute either object.',
				evidence: { sampledAtMs: collision.atMs, visibleBodyRect: collision.rect, contentRect: other.rect, measurementSpace: 'slide-inches', spatialConflictPolicy: 'report-only', authoringAuthority: 'ai', engineAction: 'report-only', ...(contact ? { actionId: contact.actionId, contactAtMs: contact.atMs, intentionalContact: true } : {}) },
			})
		}
	}
	const sources = dataSourceMap(spec)
	const assets = assetMap(spec)
	const slideIdToIndex = new Map(plan.slides.map(slide => [slide.slideId, slide.slideIndex]))
	const compiledWarnings = []
	const avatarContractIssues = avatarVisualContractIssues(spec)
	const operations = [
		...[nativePackagePreservationOperation(spec)].filter(Boolean),
		...[layoutThemeStructureOperation(spec)].filter(Boolean),
		...masterOperations(spec),
		...layoutOperations(spec),
	]
	const lateOperations = []
	// Resolve the world VOICE (pace) once. Timing authority is decided per slide below;
	// fallback narration notes are never allowed to become an implicit clock.
	const voice = artVoiceForSpec(spec)
	const worldMotion = artMotionForSpec(spec)
	const buildTempo = artBuildTempoForSpec(spec)
	const autoSyncMs = []
	// Per-slide timing reconciliation report (the teamwork spine the AI reads back).
	const timingSpine = []
	for (const slide of plan.slides) {
		const transition = slideTransitionForCompile(slide, effectiveOptions)
		const specSlide = (spec.slides || [])[slide.slideIndex] || {}
		if (Object.prototype.hasOwnProperty.call(specSlide, 'showMasterShapes')
			&& Object.prototype.hasOwnProperty.call(specSlide, 'showMasterBackground')
			&& specSlide.showMasterShapes !== specSlide.showMasterBackground) {
			throw new Error(`slides[${slide.slideIndex}].showMasterShapes and showMasterBackground must agree when both are supplied.`)
		}
		const declaredTitle = slide.title || specSlide.title
		// Narration-always: every slide carries a spoken script in its notes under a
		// final [BetterPPTX-narration] rubric (explicit script, else the one spoken message) — the source of
		// truth for Piper TTS → avatar. The dwell time below is derived from it.
		const narrationScript = slideNarrationScript(specSlide)
		const authoredBackground = Object.prototype.hasOwnProperty.call(specSlide, 'background') ? specSlide.background : slide.background
		const slideAddArgs = {
			background: normalizeSlideBackgroundForCompile(authoredBackground),
			notes: composeNotesWithNarration(slide.notes, narrationScript),
			// A native layout preset is an AI-selected resource binding, not a
			// geometric layout hint. Preserve its resolved master-scoped name so
			// slide.add binds the exact imported PowerPoint slideLayout part.
			...(Object.prototype.hasOwnProperty.call(specSlide, 'layoutName') ? { layoutName: specSlide.layoutName } : {}),
			...(Object.prototype.hasOwnProperty.call(specSlide, 'masterName') ? { masterName: specSlide.masterName } : {}),
			...(Object.prototype.hasOwnProperty.call(specSlide, 'colorMapOverride') ? { colorMapOverride: specSlide.colorMapOverride } : {}),
			...(specSlide.layoutPresetId ? { layoutPresetId: specSlide.layoutPresetId } : {}),
			...(spec.template?.templatePresetId ? { templatePresetId: spec.template.templatePresetId } : {}),
			...(specSlide.hidden !== undefined ? { hidden: Boolean(specSlide.hidden) } : {}),
			...(specSlide.slideNumber !== undefined ? { slideNumber: specSlide.slideNumber } : {}),
			// PowerPoint's user-facing "Hide Background Graphics" control is
			// serialized as p:sld@showMasterSp.  Accept the semantic alias while
			// keeping showMasterShapes as the canonical native carrier.
			...(specSlide.showMasterShapes !== undefined
				? { showMasterShapes: specSlide.showMasterShapes }
				: specSlide.showMasterBackground !== undefined
					? { showMasterShapes: specSlide.showMasterBackground }
					: {}),
			...(Object.prototype.hasOwnProperty.call(specSlide, 'showMasterPhAnim') ? { showMasterPhAnim: specSlide.showMasterPhAnim } : {}),
			// Preserve whether the spoken script was explicitly authored in the JSON
			// spec.  The engine still writes the narration rubric for every slide so
			// text remains the timing source, but a derived fallback must not be
			// mistaken for a request to synthesize audio when a canonical spec is
			// rehydrated in another process.
			narrationAuthored: slideHasExplicitNarration(specSlide),
			// Carry the author's declared slide title as accessibility metadata. Display/hero
			// typography (a large centered wordmark, a lower headline) carries the title
			// VISUALLY but isn't a top-anchored "title" object — so the a11y title lives here,
			// letting the deck keep its composition (and morph pairing) and still be titled.
			...(declaredTitle ? { title: String(declaredTitle) } : {}),
			...(transition ? { transition } : {}),
		}
		operations.push({
			tool: 'betterpptx.slide.add',
			slideId: slide.slideId,
			slideIndex: slide.slideIndex,
			args: slideAddArgs,
		})
		for (const object of slide.objects) {
			const resolvedObject = resolveConnectorGeometry(object, slide.objects)
			const generated = applyInteractiveActionsToOperation(applyAccessibilityMetadataToOperation(
				operationForObject(resolvedObject, spec, sources, assets, effectiveOptions),
				resolvedObject,
				slide.slideIndex,
				accessibilityMetadata,
			), resolvedObject, slide.slideIndex, interactiveActions)
			if (generated?.unsupported) {
				if (generated.warning) compiledWarnings.push({
					slideId: slide.slideId,
					...generated.warning,
				})
				continue
			}
			const op = {
				...generated,
				slideId: slide.slideId,
				slideIndex: slide.slideIndex,
			}
			if (op.late) lateOperations.push(op)
			else operations.push(op)
		}
		const nativeTiming = nativeTimingPreservationOperation(specSlide, slide)
		if (nativeTiming) lateOperations.push(nativeTiming)
		const motion = motionOperationsForSlide(spec, specSlide, slide, effectiveOptions)
		lateOperations.push(...motion.operations)
		compiledWarnings.push(...motion.warnings)
		// ── Reconcile the two clocks — TEXT IS THE MASTER ──────────────────────────
		// The NARRATION (its wording AND its pace) governs the slide's DWELL; the visual
		// ADAPTS to fit the spoken timeline. The visual-comfort floor (transition-in +
		// build cascade + reading minimum) is computed only as an ADVISORY: when the words
		// are too few to carry the on-slide content, we tell the AI to lengthen/slow the
		// narration (fix the TEXT) — we never silently pad the slide past the words.
		const visualComfortMs = computeVisualFloorMs(specSlide, worldMotion)
		const narrLang = narrationLangFor(specSlide, spec)
		const narrationEstMs = estimateNarrationMs(narrationScript, voice, { lang: narrLang })
		// An avatarNarration block is itself a measured Record Studio clock. Never
		// emit the text-estimate auto-timing fallback for that slide: the completed
		// synchronized video sets the authoritative dwell after it is attached.
		const explicitAvatarNarration = Boolean(specSlide.avatarNarration
			&& typeof specSlide.avatarNarration === 'object'
			&& specSlide.avatarNarration.enabled !== false)
		const explicitNarr = slideHasExplicitNarration(specSlide) || explicitAvatarNarration
		const performanceTiming = specSlide._presenterPerformanceTiming
		// The comfort floor is passed to the narration op for pacing/advice only (the build
		// cascade distributes across the spoken span); the commit-time advance follows the REAL
		// audio, not the floor.
		const narrationOperations = slideNarrationOperations(spec, specSlide, slide.slideIndex, { visualFloorMs: visualComfortMs, buildEffect: (typeof worldMotion?.build === 'string' ? worldMotion.build : 'fade'), buildDurationMs: buildTempo.durationMs, buildMinIntervalMs: buildTempo.minIntervalMs })
		lateOperations.push(...narrationOperations)
		lateOperations.push(...slideAvatarNarrationOperations(spec, specSlide, slide.slideIndex, effectiveOptions))
		const lockedNarrationTiming = narrationOperations.length
			? lockedNarrationTimingForArgs(narrationOperations[0]?.args || {}, options.preparedNarrationTimingBySlide?.[slide.slideIndex] || null)
			: null
		const authority = timingAuthorityForSlide(spec, specSlide, {
			explicitNarration: explicitNarr,
			performanceTiming,
			lockedNarrationTiming,
			transition,
		})
		// Keep the estimate for the narration/performance compatibility check, but never
		// publish fallback message text as narration timing on a silent/manual slide.
		const narrationTimingMs = authority.narrationClockActive
			? (lockedNarrationTiming?.realDurationMs ?? narrationEstMs)
			: null
		const narratedDurationForConflict = explicitNarr
			? (lockedNarrationTiming?.realDurationMs ?? narrationEstMs)
			: null
		const performanceFits = performanceTiming && authority.narrationClockActive
			? narratedDurationForConflict >= performanceTiming.endMs
			: null
		const dwellMs = authority.performanceClockActive
			? Number(performanceTiming.dwellMs)
			: authority.narrationClockActive
				? (lockedNarrationTiming?.dwellMs ?? null)
				: authority.autoplayMs ?? authority.slideAdvanceMs ?? null
		if (performanceFits === false) throw performanceError('PERFORMANCE_NARRATION_TOO_SHORT', `The narration on ${slide.slideId} ends before the authored presenter performance. Narration remains the effective clock; lengthen the narration or shorten the performance.`, `slides[${slide.slideIndex}].presenterPerformance`)
		if (authority.conflicts.length) {
			compiledWarnings.push({
				slideId: slide.slideId,
				code: 'TIMING_AUTHORITY_CONFLICT',
				severity: 'warning',
				message: `Timing declarations conflict on ${slide.slideId}: ${authority.conflicts.join('; ')}.`,
				reason: 'A slide must have one effective clock. The compiler selected the explicit narration clock only when it was not disabled by a visual-only or auto-sync-off declaration.',
				fix: 'Choose one timing authority in motionTime and remove competing autoplay or presenter timing declarations, then rerun dryRun.',
				evidence: { authorityMode: authority.authorityMode, effectiveClock: authority.effectiveClock, conflicts: authority.conflicts },
			})
		}
		const appliedAutoTiming = authority.performanceClockActive || authority.narrationClockActive ? dwellMs : null
		autoSyncMs[slide.slideIndex] = appliedAutoTiming
		timingSpine.push({
			slideId: slide.slideId,
			narrationMs: narrationTimingMs,
			...(authority.narrationClockActive && !lockedNarrationTiming ? { narrationEstimateMs: narrationEstMs } : {}),
			visualComfortMs,
			dwellMs,
			governedBy: authority.governedBy,
			...(performanceTiming ? { performanceEndMs: performanceTiming.endMs } : {}),
			secondaryClock: authority.secondaryClock,
			reconciliation: authority.reconciliation,
			performanceFits,
			visualFits: authority.narrationClockActive ? narrationTimingMs >= visualComfortMs * 0.85 : null,
			explicitNarration: explicitNarr,
			legacyCompatibility: authority.legacyCompatibility === true,
			timingSource: authority.timingSource,
			effectiveClock: authority.effectiveClock,
			authorityMode: authority.authorityMode,
			timingEvidence: authority.timingEvidence,
			authoredIntent: authority.authoredIntent,
			normalizedIntent: authority.normalizedIntent,
		})
		// Teamwork signal: text is master, so a mismatch is fixed on the TEXT side. When the
		// spoken length can't cover the time the audience needs to read the slide / watch its
		// build, ask the AI to lengthen or slow the narration (or trim the slide). The slide
		// still advances WITH the words — it is never padded into trailing silence.
		if (authority.narrationClockActive && narrationTimingMs > 0 && narrationTimingMs < visualComfortMs * 0.7) {
			compiledWarnings.push({ slideId: slide.slideId, code: 'NARRATION_TOO_SHORT_FOR_CONTENT', severity: 'warning',
				message: `Narration (${authority.timingSource === 'locked-audio' ? '' : '~'}${narrationTimingMs}ms) is shorter than the time needed to read/reveal this slide's content (~${visualComfortMs}ms). Text is the master clock — lengthen or slow the narration (voice.lengthScale), split it into segments with pauses, or reduce on-slide content so the words carry it.`,
				narrationMs: narrationTimingMs, visualComfortMs, timingSource: authority.timingSource,
				reason: 'The narration clock ends before the engine-measured visual comfort/read time, so the slide would feel rushed if the words remain unchanged.',
				fix: 'Lengthen or slow the narration, split it into segments with real pauses, or reduce on-slide content; the engine will not pad silence into the timing.',
				evidence: { narrationMs: narrationTimingMs, visualComfortMs, threshold: 0.7, timingAuthority: 'narration-text', timingSource: authority.timingSource } })
		} else if (authority.narrationClockActive && explicitNarr && narrationTimingMs > visualComfortMs * 2.2) {
			compiledWarnings.push({ slideId: slide.slideId, code: 'NARRATION_LONG_FOR_BUILD', severity: 'info',
				message: `Narration (${authority.timingSource === 'locked-audio' ? '' : '~'}${narrationTimingMs}ms) runs well past the visual build (~${visualComfortMs}ms) — the visual adapts by spacing the build across the narration. Anchor builds to spoken phrases (cues.atPhrase) or use slide.timeline so the reveal tracks the words.`,
				narrationMs: narrationTimingMs, visualComfortMs, timingSource: authority.timingSource,
				reason: 'The narration is substantially longer than the automatic visual build, so an unanchored reveal could finish too early and leave the spoken content unsupported.',
				fix: 'Anchor the reveal to spoken phrases with cues.atPhrase or spread it across slide.timeline so the visual tracks the narration.',
				evidence: { narrationMs: narrationTimingMs, visualComfortMs, threshold: 2.2, timingAuthority: 'narration-text', timingSource: authority.timingSource } })
		}
	}
	// Emit auto timings only for measured narration or an explicit presenter-performance
	// timeline. Silent/manual slides remain click-driven unless the author separately
	// requests deck.autoplay or transition.advanceAfterTime.
	const manualSlideAdvance = spec.autoplay?.enabled === false || spec.showSettings?.useTimings === false
	if (!manualSlideAdvance && spec.deliveryExperience?.mode !== 'narrated-autoplay' && autoSyncMs.some(v => Number.isFinite(v) && v > 0)) {
		// A governed avatar narration is a recorded-media clock. Keep its slide
		// autoplay non-clickable so the presenter/video and narration cannot be
		// split by a user click; ordinary narration-only decks retain the
		// presenter-friendly click-through default.
		const hasAvatarNarration = (Array.isArray(spec.slides) ? spec.slides : []).some(slide => slide?.avatarNarration?.enabled !== false && slide?.avatarNarration)
		lateOperations.push({
			tool: 'betterpptx.deck.apply_auto_timings',
			late: true,
			args: { perSlideMs: autoSyncMs, advanceOnClick: hasAvatarNarration || spec.autoplay?.enabled === true ? false : true },
		})
	}
	const sections = sectionOperations(spec, slideIdToIndex, options)
	operations.push(...sections.operations)
	compiledWarnings.push(...sections.warnings)
	if (customShowsAuthored) {
		operations.push({
			tool: 'betterpptx.deck.set_custom_shows',
			args: {
				customShows: normalizedCustomShows === null ? null : normalizedCustomShows.map(show => ({
					...show,
					slideIndexes: show.slides.map(slideId => slideIdToIndex.get(slideId)),
				})),
			},
		})
	}
	// Review comments are semantic deck annotations, not visible slide blocks. They
	// still travel through the same MCP operation plan so the engine owns package
	// relationships, author records, and safe anchor serialization.
	for (const [index, comment] of (Array.isArray(spec.reviewComments) ? spec.reviewComments : []).entries()) {
		if (!comment || typeof comment !== 'object') continue
		const slideIndex = Number.isInteger(Number(comment.slideIndex))
			? Number(comment.slideIndex)
			: slideIdToIndex.get(comment.slideId)
		if (!Number.isInteger(slideIndex) || slideIndex < 0 || slideIndex >= plan.slides.length) {
			compiledWarnings.push({ code: 'REVIEW_COMMENT_SLIDE_NOT_FOUND', severity: 'warning', field: `reviewComments[${index}]`, message: 'Review comment references no valid slide; it was not compiled.', reason: 'Comments must attach to an existing slide or slide id.', fix: 'Set slideId to an existing slide or provide a zero-based slideIndex.' })
			continue
		}
		const text = String(comment.text ?? comment.message ?? '').trim()
		if (!text) {
			compiledWarnings.push({ code: 'REVIEW_COMMENT_TEXT_EMPTY', severity: 'warning', field: `reviewComments[${index}]`, message: 'Empty review comment was not compiled.', reason: 'PowerPoint comments require text.', fix: 'Provide a non-empty text value.' })
			continue
		}
		operations.push({
			tool: 'betterpptx.slide.add_comment',
			slideId: plan.slides[slideIndex]?.slideId,
			slideIndex,
			args: {
				text,
				...(comment.author ? { author: String(comment.author) } : {}),
				...(comment.authorInitials ? { authorInitials: String(comment.authorInitials) } : {}),
				...(Number.isFinite(Number(comment.x)) ? { x: Number(comment.x) } : {}),
				...(Number.isFinite(Number(comment.y)) ? { y: Number(comment.y) } : {}),
				...(comment.targetObjectName ? { targetObjectName: String(comment.targetObjectName) } : {}),
				...(comment.status === 'resolved' ? { status: 'resolved' } : {}),
			},
		})
	}
	const zooms = zoomOperations(spec, slideIdToIndex, options)
	compiledWarnings.push(...zooms.warnings)
	const timingOps = [transitionPolicyOperation(spec), autoplayOperation(spec), showSettingsOperation(spec)].filter(Boolean)
	operations.push(...timingOps, ...lateOperations, ...zooms.operations)
	validateCompiledNativePrimitiveArguments(operations)
	assertSlideContinuityItemOperations(slideContinuities, operations)
	slideContinuities = bindSlideContinuityItemPayloads(slideContinuities, operations, authoredContinuitySpec)
	const freemiumWarnings = addFreemiumWarnings(spec, plan, effectiveOptions)
	const transitionWarnings = addTransitionWarnings(plan, effectiveOptions)
	const uncompiledWarnings = knownButUncompiledWarnings(spec)
	const specDigest = deterministicPlanDigest({ kind: 'spec', schemaVersion: spec.schemaVersion, spec })
	const estimatedPlanDigest = deterministicPlanDigest({ kind: 'estimated-plan', compilerVersion: SPEC_COMPILER_VERSION, plan, operations })
	const resolutionRequirements = [
		...resolutionRequirementsForOperations(operations),
		...[templateResolutionRequirement(spec)].filter(Boolean),
	]
	const visualDirection = publicVisualDirection(operations
		.filter(op => op.tool === 'betterpptx.slide.add_image' && op.args?.options?.visualGeneration)
		.map(op => ({
			...op.args.options.visualGeneration,
			slideId: op.slideId,
			slideIndex: op.slideIndex,
			objectName: op.objectName,
		})), operations
		.filter(op => op.tool === 'betterpptx.slide.add_image' && op.args?.options?.visualRoute)
		.map(op => ({
			...op.args.options.visualRoute,
			slideId: op.slideId,
			slideIndex: op.slideIndex,
			objectName: op.objectName,
		})))
	const lockedSpecDigest = resolutionRequirements.length ? null : specDigest
	const lockedPlanDigest = resolutionRequirements.length ? null : estimatedPlanDigest
	const presenterContract = presenterContractForSpec(spec)
	const presenterRuntime = lowerPresenterRuntime({ contract: presenterContract, operations })
	const directorWorkflow = spec.authoringContract?.workflow === 'authoring-excellence-director-v1'
	const autoPresenterSelectionIssues = spec.presenter?.selection?.mode === 'auto-fallback' ? [{
		code: 'AI_PRESENTER_IDENTITY_REQUIRED_FOR_CERTIFICATION',
		severity: directorWorkflow ? 'error' : 'warning',
		message: 'The built-in presenter was selected by a legacy compatibility fallback rather than an explicit AI identity choice.',
		reason: 'Presenter identity is a visible creative decision owned by the authoring AI. Deterministic compatibility selection may keep an old spec executable, but cannot certify AI-owned first-time-right authorship.',
		fix: 'Inspect the unranked built-in presenter options and set presenter.identity to "joe", "louise", "pete", or "mena" explicitly, then rerun dryRun.',
		evidence: { selectionMode: 'auto-fallback', selectedIdentity: spec.presenter.identity || null, certificationEligible: false },
		source: 'presenter-selection',
	}] : []
	const presenterContractErrors = (presenterContract.warnings || [])
		.filter(issue => issue?.severity === 'error')
		.map(issue => ({ ...issue, source: 'presenter-contract' }))
	const presenterRuntimeIssues = (presenterRuntime.issues || []).map(issue => ({ ...issue, source: 'presenter-runtime-director' }))
	const worldSelection = aiWorldSelectionForSpec(spec)
	const worldSelectionWarnings = worldSelection.selectionStatus !== 'unsupported' ? [] : [{
		code: 'ART_DIRECTION_UNSUPPORTED',
		severity: 'error',
		message: 'The explicit art-direction selector is unsupported; no aesthetic substitution was applied.',
		reason: 'An explicit unsupported choice cannot silently become a named or neutral preset.',
		fix: 'Use a supported named World, an inline bespoke object, or omission/null with authored styling.',
		evidence: { selectionStatus: worldSelection.selectionStatus, certificationEligible: false },
	}]
	slideContinuities = bindSlideContinuitiesToMeasuredDeckClock(slideContinuities, spec, timingSpine)
	const htmlRepresentationFindings = [
		...htmlCssMotionUnmappedFindings(spec),
		...htmlUnsupportedRepresentationFindings(spec),
		...htmlMorphRequiredPairFindings(spec),
		...htmlFontSubstitutionFindings(spec),
		...narrationProfileFindings(spec),
	]
	const warnings = [
		...(plan.warnings || []).map(compactWarning),
		...layoutValidation.issues.filter(issue => issue.severity !== 'error').map(compactWarning),
		...compiledWarnings,
		...freemiumWarnings,
		...transitionWarnings,
		...uncompiledWarnings,
		...worldSelectionWarnings.filter(issue => issue.severity !== 'error'),
		...htmlRepresentationFindings.filter(issue => issue.severity !== 'error').map(compactWarning),
		...autoPresenterSelectionIssues.filter(issue => issue.severity !== 'error'),
		...presenterRuntimeIssues.filter(issue => issue.severity !== 'error'),
	]
	const errors = [
		...worldSelectionWarnings.filter(issue => issue.severity === 'error'),
		...(plan.warnings || []).filter(issue => issue.severity === 'error').map(issue => ({ ...issue, message: issue.message || issue.code })),
		...(layoutValidation.issues || []).filter(issue => issue.severity === 'error').map(issue => ({ ...issue, message: issue.message || issue.code })),
		...htmlRepresentationFindings.filter(issue => issue.severity === 'error'),
		...autoPresenterSelectionIssues.filter(issue => issue.severity === 'error'),
		...presenterContractErrors,
		...presenterRuntimeIssues,
		...avatarContractIssues,
		...(slideContinuities.boundaries.length ? [slideContinuities.boundaries.some(boundary => boundary.sourceReleaseStatus !== 'QUALIFIED') ? {
			code: 'SLIDE_CONTINUITY_SOURCE_RELEASE_UNQUALIFIED',
			severity: 'error',
			message: 'The authored motion and action IDs resolve, but no qualified immutable source release has been bound to the declared cross-slide source state. No alternate motion will be substituted.',
			field: 'slideContinuities',
		} : {
			code: 'SLIDE_CONTINUITY_NATIVE_BINDING_PENDING',
			severity: 'error',
			message: 'The qualified source is selected, but native actor, item and narration boundary playback is not yet proven. No cross-slide handoff will be silently substituted or dropped.',
			field: 'slideContinuities',
		}] : []),
	]
	const hasNarrationClock = timingSpine.some(item => item.governedBy === 'narration (text is master)')
	const hasPerformanceClock = timingSpine.some(item => item.governedBy === 'presenter performance')
	const effectiveClocks = [...new Set(timingSpine.map(item => item.effectiveClock || item.governedBy).filter(Boolean))]
	const timingEvidence = [...new Set(timingSpine.map(item => item.timingEvidence).filter(Boolean))]
	const reconciliationModes = [...new Set(timingSpine.map(item => item.reconciliation).filter(Boolean))]
	const timingReadback = {
		contractVersion: 'authoring-excellence.timing.v2',
		note: hasNarrationClock
			? 'Per-slide dwell reconciliation — narration-governed slides follow the spoken text, while visualComfortMs remains advisory. timingSource distinguishes a language-aware estimate from measured locked audio; locked dwell includes authored start delay, segment gaps, cue endpoints, and padding. Slides marked authored slide timing do not derive dwell or warnings from fallback narration notes.'
			: hasPerformanceClock ? 'Silent presenter performances govern their slide clock. Dwell includes the authored lead-in, complete action sequence, and a brief final hold. Fallback notes do not shorten this timeline.'
			: 'Per-slide timing readback — no explicit narration clock is active. Authored/native slide timing governs; fallback narration notes do not create dwell timing or narration-fit warnings.',
		effectiveClock: effectiveClocks.length === 1 ? effectiveClocks[0] : effectiveClocks.length ? 'per-slide timing authorities' : 'authored slide timing',
		authorityModes: [...new Set(timingSpine.map(item => item.authorityMode).filter(Boolean))],
		timingEvidence,
		reconciliationModes,
		authoredIntent: spec.motionTime || spec.motion?.motionTime || spec.motion?.time || null,
	slides: timingSpine,
	}
	const appliedDefaults = buildAppliedDefaults(spec, plan, timingReadback)
	appliedDefaults.validation = validationContractReadback(spec, verificationPolicy, errors, uncompiledWarnings)
	appliedDefaults.decisionSummary = buildAuthoringDecisionSummary(spec, plan, { appliedDefaults, warnings, errors, timingSpine: timingReadback })
	const selectionManifest = buildAiSelectionExecutionReadback({
		manifest: spec.selectionManifest,
		source: selectionMaterialization.source,
		plan,
		operations,
	})
	return {
		schemaVersion: spec.schemaVersion,
		compilerVersion: SPEC_COMPILER_VERSION,
		layoutEngineVersion: plan.layoutEngineVersion,
		specDigest,
		estimatedPlanDigest,
		lockedSpecDigest,
		lockedPlanDigest,
		planDigest: estimatedPlanDigest,
		planId: lockedPlanDigest || estimatedPlanDigest,
		narrationCueLedger: buildNarrationCueLedger(spec),
		title: spec.title,
		slideCount: plan.slides.length,
		objectCount: plan.slides.reduce((sum, slide) => sum + slide.objects.length, 0),
		plan,
		operations,
		selectionManifest,
		appliedDefaults,
		timingSpine: timingReadback,
		handshake: buildHandshakeReport(spec, plan),
		presenterContract,
		presenterRuntime,
		presenterPerformanceValidation,
			authoringContracts: {
			slideContinuities,
			presenterPerformance: spec._presenterPerformancePlan || { contractVersion: PRESENTER_PERFORMANCE_CONTRACT.schemaVersion, timelineUnit: 'milliseconds-from-slide-start', performances: [] },
			motionSelection: spec._authoringMotionPlan || {
				contractVersion: 'betterpptx.authoring-motion-selection.v1',
				selectionAuthority: 'AI',
				engineRole: 'expose-validate-and-execute',
				maximumMotionsPerPresenterBundle: 18,
				presenters: [],
			},
			completeness: {
				...authoringCompletenessForSpec(spec),
				semanticOnly: true,
				readback: 'appliedDefaults.completeness',
			},
			avatarFrame: {
				shape: 'ellipse',
				crop: 'centered-cover',
				duplicateVisualPolicy: 'error',
			},
			composition: {
				designAuthority: 'ai',
				creativeAuthority: isAiSovereignSpec(spec) ? 'ai' : 'ai-with-director-assistance',
				directorMode: isAiSovereignSpec(spec) ? 'off' : 'assisted',
				verificationMode: 'complete',
				creativeMutationPolicy: isAiSovereignSpec(spec) ? 'report-only-no-creative-rewrite' : 'director-assistance-enabled',
				creativeAuthorityModes: publicCreativeAuthorityModes(),
				engineRole: 'catalog-executor-package-verifier',
				spatialDecisionAuthority: 'ai',
				spatialConflictPolicy: 'report-only',
				knowledgeAuthority: 'ai-first-rag-when-unknown',
				ragPolicy: 'Use trained AI knowledge first; retrieve current capabilities, workspace evidence, or uncertain contract details through public MCP discovery and readback.',
				designRule: 'AI-authored visual design and exact catalog choices are authoritative. Native editable PowerPoint objects are preferred whenever available; custom construction requires a specific AI-authored reason. The engine exposes, executes, and verifies choices but never acts as the designer.',
				nativeFirstPolicy: publicNativeFirstAuthoringPolicy(),
				selectionManifest: {
					schemaVersion: selectionManifest.schemaVersion,
					enforcement: selectionManifest.enforcement,
					noSilentSubstitution: true,
					packageVerificationAtSave: true,
				},
				geometryAuthority: String(spec?.authoringContract?.geometryAuthority || 'ai'),
				placementPolicy: String(spec?.authoringContract?.placementPolicy || 'ai-authored-geometry-v1'),
				compositionModes: publicCompositionModes(),
				opaqueNativePolicy: isAiSovereignSpec(spec) ? 'forbidden-in-public-spec' : 'forbidden-in-director-spec',
				textVisualOverlap: 'report-only',
				nativeMediaCaptionTracks: NATIVE_MEDIA_CAPTION_CAPABILITY.nativeMediaCaptionTracks,
				nonNativeCaptionOverlays: NATIVE_MEDIA_CAPTION_CAPABILITY.nonNativeCaptionOverlays,
				literalNewlinePolicy: 'normalize',
				worldScope: 'all-art-directions',
				worldSelection,
			},
		},
		capabilityMatrix: publicSpecCapabilityMatrix(),
		visualDirection,
		resolution: {
			required: resolutionRequirements.length > 0,
			requirements: resolutionRequirements,
		},
		warnings,
		errors,
		requiresUpgrade: freemiumWarnings.some(item => item.requiresUpgrade),
		billing: {
			estimate: {
				mode: options.plan === 'premium' ? 'premium' : 'free-safe',
				slideCount: plan.slides.length,
				requiresUpgrade: freemiumWarnings.some(item => item.requiresUpgrade),
				requiresResolution: resolutionRequirements.length > 0,
			},
		},
		next: freemiumWarnings.some(item => item.requiresUpgrade)
			? { recommendedTool: 'betterpptx.billing.portal', reason: 'Activate premium to re-render downgraded premium-boundary features.' }
			: verificationPolicy.rendererRequiredForSave
				? { recommendedTool: 'betterpptx.deck.preview', reason: 'Release-powerpoint policy requires preview of the frozen package before save.' }
				: { recommendedTool: 'betterpptx.deck.save', reason: 'Production-non-rendering policy uses deterministic package, media, timing, accessibility, and selection validation before save; hosted PowerPoint preview is not required.' },
	}
}

export function compactSpecPlan(plan, detail = 'summary') {
	const capabilityMatrix = detail === 'full'
		? plan.capabilityMatrix
		: {
			schemaVersion: plan.capabilityMatrix?.schemaVersion,
			detail: 'summary',
			counts: {
				specNative: plan.capabilityMatrix?.specNative?.length || 0,
				deckLevel: plan.capabilityMatrix?.deckLevel?.length || 0,
				primitiveOnly: plan.capabilityMatrix?.primitiveOnly?.length || 0,
				unsupportedInSpecV1: plan.capabilityMatrix?.unsupportedInSpecV1?.length || 0,
			},
			interactionContract: plan.capabilityMatrix?.interactionContract,
			next: 'Request detail:"full" to include the complete capability matrix.',
		}
	const slides = plan.plan.slides.map(slide => ({
		slideId: slide.slideId,
		slideIndex: slide.slideIndex,
		title: slide.title,
		layoutIntent: slide.layoutIntent,
		placeholderBinding: slide.placeholderBinding,
		visualBalance: slide.visualBalance,
		objects: detail === 'full'
			? slide.objects.map(object => ({
				objectName: object.objectName,
				editHandle: object.editHandle,
				primitive: object.primitive,
				role: object.role,
				...(object.contentRepresentation ? { contentRepresentation: object.contentRepresentation } : {}),
				rect: object.rect,
				placementSource: object.placementSource,
				placementIntentSource: object.placementIntentSource,
			}))
			: slide.objects.map(object => ({ objectName: object.objectName, primitive: object.primitive, role: object.role, ...(object.contentRepresentation ? { contentRepresentation: object.contentRepresentation } : {}), placementSource: object.placementSource, placementIntentSource: object.placementIntentSource })),
	}))
	// The compiler keeps a richer private presenter plan so the execution
	// verifier can reason about native lowering.  The public MCP contract is
	// semantic: do not leak native flags or operation references through a
	// structured response whose schema intentionally excludes them.
	const publicPresenterContract = plan.presenterContract
		? {
			...plan.presenterContract,
			timeline: plan.presenterContract.timeline
				? {
					...plan.presenterContract.timeline,
					entries: plan.presenterContract.timeline.entries || [],
				}
				: plan.presenterContract.timeline,
			executionPlan: plan.presenterContract.executionPlan
				? {
					...plan.presenterContract.executionPlan,
					entries: (plan.presenterContract.executionPlan.entries || []).map(entry => {
						const { powerPointNative: _powerPointNative, native3d: _native3d, ...safe } = entry
						return safe
					}),
				}
				: plan.presenterContract.executionPlan,
			representations: (plan.presenterContract.representations || []).map(({ native3d: _native3d, ...safe }) => safe),
			lanes: plan.presenterContract.lanes
				? (({ native3d: _native3d, ...safe }) => safe)(plan.presenterContract.lanes)
				: plan.presenterContract.lanes,
		}
		: plan.presenterContract
	const publicPresenterRuntime = plan.presenterRuntime
		? {
			...plan.presenterRuntime,
			entries: (plan.presenterRuntime.entries || []).map(({ operationRefs: _operationRefs, ...safe }) => safe),
		}
		: plan.presenterRuntime
	return {
		schemaVersion: TOOL_RESPONSE_VERSION,
		ok: plan.errors.length === 0,
		data: {
			schemaVersion: plan.schemaVersion,
			compilerVersion: plan.compilerVersion,
			layoutEngineVersion: plan.layoutEngineVersion,
			specDigest: plan.specDigest,
			estimatedPlanDigest: plan.estimatedPlanDigest,
			lockedSpecDigest: plan.lockedSpecDigest,
			lockedPlanDigest: plan.lockedPlanDigest,
			planDigest: plan.planDigest,
			planId: plan.lockedPlanDigest || plan.planDigest || plan.estimatedPlanDigest || null,
			narrationCueLedger: plan.narrationCueLedger || null,
			title: plan.title,
			slideCount: plan.slideCount,
			objectCount: plan.objectCount,
			slides,
			operationCount: plan.operations.length,
			resolution: plan.resolution,
			requiresUpgrade: plan.requiresUpgrade,
			billing: plan.billing,
			appliedDefaults: plan.appliedDefaults,
			visualDirection: plan.visualDirection,
			timingSpine: plan.timingSpine,
			handshake: plan.handshake,
			presenterContract: publicPresenterContract,
			presenterRuntime: publicPresenterRuntime,
			selectionManifest: plan.selectionManifest,
			authoringContracts: plan.authoringContracts,
			capabilityMatrix,
		},
		warnings: plan.warnings,
		errors: plan.errors,
		next: plan.next,
	}
}
