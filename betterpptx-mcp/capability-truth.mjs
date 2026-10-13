// Public-safe capability truth for gallery selectors and continuous controls.
// This module deliberately describes semantic ownership only. It never exposes
// private recipes, raw XML, package paths, or implementation technology.

import { PICTURE_STYLE_COMPONENT_OWNERSHIP, PICTURE_STYLE_OVERRIDE_FIELDS, PICTURE_STYLE_RESET_BEHAVIOR } from './picture-style-presets.mjs'
import { SHAPE_FORMATTING_CONTRACT } from './native-formatting-contract.mjs'
import { mediaImageCapabilityContractForEntry } from './media-image-formatting-contract.mjs'
import { wordArtTransformCapabilityContractForEntry } from './wordart-transform-contract.mjs'
import { connectorStyleCapabilityContractForEntry } from './connector-style-contract.mjs'
import { wordArtText3DCapabilityContractForEntry } from './wordart-text3d-contract.mjs'
import { layoutImageEntryCapabilityContractForEntry } from './layout-image-entry-contract.mjs'
import { layoutMediaEntryCapabilityContractForEntry } from './layout-media-entry-contract.mjs'
import { mediaImageFamilyAggregateCapabilityContractForEntry } from './media-image-family-aggregate-contract.mjs'
import { layoutThemeMasterFamilyAggregateCapabilityContractForEntry } from './layout-theme-master-family-aggregate-contract.mjs'
import { foundationCapabilityContractForEntry } from './foundation-capability-contract.mjs'
import { publicOperationCapabilityContractForEntry } from './public-operation-capability-contract.mjs'
import { layoutPresetCapabilityContractForEntry } from './layout-preset-contract.mjs'
import { masterPresetCapabilityContractForEntry } from './master-preset-contract.mjs'
import { themePresetCapabilityContractForEntry } from './theme-preset-contract.mjs'
import {
	HEADER_VISIBILITY_CONTRACT,
	LAYOUT_PLACEHOLDER_VARIANTS_CONTRACT,
	SLIDE_NUMBER_FIELD_CONTRACT,
} from './layout-placeholder-variants-contract.mjs'
import { layoutThemeMasterInheritanceCapabilityContractForEntry } from './layout-theme-master-inheritance-contract.mjs'
import { layoutGraphicPlaceholderVisibilityCapabilityContractForEntry } from './layout-graphic-placeholder-visibility-contract.mjs'
import { textAuthoringEntryCapabilityContractForEntry } from './text-authoring-entry-contract.mjs'
import { interactiveNavigationCapabilityContractForEntry } from './interactive-navigation-entry-contract.mjs'
import { sectionSummaryZoomCapabilityContractForEntry } from './section-summary-zoom-entry-contract.mjs'
import { addSlideEntryCapabilityContractForEntry } from './add-slide-entry-contract.mjs'
import { hyperlinkEntryCapabilityContractForEntry } from './hyperlink-entry-contract.mjs'
import { multipleSlideMastersCapabilityContractForEntry } from './multiple-slide-masters-contract.mjs'
import { chartAuthoringCapabilityContractForEntry } from './chart-authoring-family-contract.mjs'
import { tableAuthoringCapabilityContractForEntry } from './table-authoring-family-contract.mjs'
import { structuralCapabilityContractForEntry } from './structural-authoring-family-contract.mjs'
import { smartArtCapabilityContractForEntry } from './smartart-authoring-family-contract.mjs'
import { equationAuthoringCapabilityContractForEntry } from './equation-authoring-family-contract.mjs'
import { smartArtCatalogCapabilityContractForEntry } from './smartart-catalog-contract.mjs'
import { model3dAuthoringCapabilityContractForEntry } from './model3d-authoring-family-contract.mjs'
import { mediaAvatarPublicOperationCapabilityContractForEntry } from './media-avatar-public-operation-contract.mjs'
import { sampleAssetDiscoveryCapabilityContractForEntry } from './sample-asset-discovery-contract.mjs'
import { model3dPublicOperationCapabilityContractForEntry } from './model3d-public-operation-contract.mjs'
import { motionAuthoringFamilyCapabilityContractForEntry } from './motion-authoring-family-contract.mjs'
import { transitionGalleryCapabilityContractForEntry } from './transition-gallery-contract.mjs'
import { animationAuthoringOperationCapabilityContractForEntry } from './animation-authoring-operation-contract.mjs'
import { transitionAuthoringOperationCapabilityContractForEntry } from './transition-authoring-operation-contract.mjs'
import { artDirectionWorldCapabilityContractForEntry } from './art-direction-world-contract.mjs'
import { presenterMotionSelectionCapabilityContractForEntry } from './presenter-motion-selection-contract.mjs'

export const CAPABILITY_MODES = Object.freeze([
	'discrete',
	'parameterized',
	'preset-plus-parameters',
	'preset-only',
	'preserve-only',
	'missing',
])

export const CAPABILITY_STATUSES = Object.freeze([
	'executable-exact-structured',
	'native-first-class-selector-plus-overrides',
	'structured-partial',
	'preset-only-incomplete',
	'preserve-imported-only',
	'byte-transform-operation',
	'host-command-not-persistent-style',
	'not-live-in-saved-package',
	'not-applicable',
	'missing',
])

const NO_RESET = Object.freeze({ component: 'not-public', full: 'not-public', nullBehavior: 'not-defined' })
const NOT_APPLICABLE_RESET = Object.freeze({ component: 'not-applicable', full: 'not-applicable', nullBehavior: 'not-applicable' })

// Gallery tiles are bases, not authoring ceilings. These public override
// contracts mirror the executable option-registry surfaces and deliberately
// enumerate independent fields plus null/reset precedence for each family.
const SHAPE_STYLE_OVERRIDE_FIELDS = Object.freeze([
	'style.fill', 'style.line', 'style.shadow', 'style.glow', 'style.reflection',
	'style.softEdges', 'style.blur', 'style.fillOverlay', 'style.effects', 'style.effect3D',
])
const SHAPE_STYLE_RESET = Object.freeze({
	component: 'set the named style/effect3D component to null or omit it to restore the selected preset base',
	full: 'set shapeStylePresetId to null and remove explicit style components',
	nullBehavior: 'preset remains the base while the named override is removed',
})
const WORDART_STYLE_OVERRIDE_FIELDS = Object.freeze([
	'style.fill', 'style.line', 'style.textFill', 'style.textOutline', 'style.textShadow',
	'style.textGlow', 'style.textReflection', 'style.effects', 'style.text3D', 'style.wordArt',
])
const WORDART_STYLE_RESET = Object.freeze({
	component: 'set the named style/text3D/WordArt component to null or omit it to restore the selected preset base',
	full: 'set wordArtStylePresetId to null and remove explicit style components',
	nullBehavior: 'preset remains the base while the named override is removed',
})
const EFFECT_PRESET_OVERRIDE_FIELDS = Object.freeze([
	'style.shadow', 'style.glow', 'style.reflection', 'style.softEdges', 'style.blur',
	'style.fillOverlay', 'style.effects', 'style.effect3D',
])
const EFFECT_PRESET_RESET = Object.freeze({
	component: 'set the named effect/3-D component to null or omit it to restore the selected effect base',
	full: 'set shapeEffectPresetIds/textEffectPresetIds to null and remove explicit effect components',
	nullBehavior: 'selected gallery effect remains while the named override is removed',
})

const TEXT_SHADOW_OVERRIDE_FIELDS = Object.freeze([
	'style.textShadow.type', 'style.textShadow.color', 'style.textShadow.opacity',
	'style.textShadow.blurPt', 'style.textShadow.distancePt', 'style.textShadow.angleDeg',
	'style.textShadow.scaleX', 'style.textShadow.scaleY', 'style.textShadow.skewXDeg',
	'style.textShadow.skewYDeg', 'style.textShadow.rotateWithShape',
])
const TEXT_REFLECTION_OVERRIDE_FIELDS = Object.freeze([
	'style.textReflection.blurPt', 'style.textReflection.distancePt',
	'style.textReflection.directionDeg', 'style.textReflection.startOpacity',
	'style.textReflection.endOpacity', 'style.textReflection.startPosition',
	'style.textReflection.endPosition', 'style.textReflection.scaleY',
])
const TEXT_SHADOW_RESET = Object.freeze({
	component: 'set style.textShadow to null or type:none to remove the text-character shadow',
	full: 'set style.textShadow to null to remove the complete text-character shadow override',
	nullBehavior: 'explicit null removes the override; omitted fields retain their native/default values',
})
const TEXT_REFLECTION_RESET = Object.freeze({
	component: 'set style.textReflection to null to remove the text-character reflection',
	full: 'set style.textReflection to null to remove the complete text-character reflection override',
	nullBehavior: 'explicit null removes the override; omitted fields retain their native/default values',
})

const LAYOUT_PLACEHOLDER_OVERRIDE_FIELDS = Object.freeze([
	'layout.placeholderVariants', 'master.placeholderVariants', 'layoutContract.placeholderBindings',
])
const LAYOUT_PLACEHOLDER_RESET = Object.freeze({
	component: 'set the named layout/master placeholder variant or binding to null',
	full: 'set layout.placeholderVariants, master.placeholderVariants, and layoutContract.placeholderBindings to null',
	nullBehavior: 'remove the authored placeholder override and restore inherited/native placeholder behavior',
})
const LAYOUT_RELATIONSHIP_OVERRIDE_FIELDS = Object.freeze([
	'slide.layoutName', 'slide.masterName', 'layout.masterName',
])
const LAYOUT_RELATIONSHIP_RESET = Object.freeze({
	component: 'set the selected slide/layout relationship to null to restore the default relationship',
	full: 'remove authored layout/master relationship selections',
	nullBehavior: 'the native relationship is restored and inherited layout/master content remains addressable',
})
const LAYOUT_SIZE_OVERRIDE_FIELDS = Object.freeze(['layout.width', 'layout.height', 'layout.type'])
const LAYOUT_SIZE_RESET = Object.freeze({
	component: 'set the selected layout size field to null',
	full: 'remove authored layout width/height/type and restore the presentation default canvas',
	nullBehavior: 'the native presentation canvas/default layout size is restored',
})
const FONT_INHERITANCE_OVERRIDE_FIELDS = Object.freeze([
	'theme.fontFace', 'theme.headFontFace', 'theme.bodyFontFace', 'theme.lang',
])
const FONT_INHERITANCE_RESET = Object.freeze({
	component: 'set the selected theme font field to null',
	full: 'remove authored theme font overrides',
	nullBehavior: 'font roles resolve from the native theme/default inheritance chain',
})

function truth(capabilityMode, capabilityStatus, componentOwnership = [], overrideFields = [], resetBehavior = NO_RESET, extra = {}) {
	return Object.freeze({
		capabilityMode,
		capabilityStatus,
		componentOwnership: Object.freeze([...componentOwnership]),
		overrideFields: Object.freeze([...overrideFields]),
		resetBehavior,
		...extra,
	})
}

const GALLERY_RULES = Object.freeze([
	[/shape-style-/i, truth('preset-plus-parameters', 'executable-exact-structured', ['fill', 'line', 'shapeEffects', 'shape3D', 'themeStyle'], SHAPE_STYLE_OVERRIDE_FIELDS, SHAPE_STYLE_RESET)],
	[/wordart-style-/i, truth('preset-plus-parameters', 'executable-exact-structured', ['textFill', 'textOutline', 'textEffects', 'text3D', 'wordArt'], WORDART_STYLE_OVERRIDE_FIELDS, WORDART_STYLE_RESET)],
	[/picture-style-/i, truth('preset-plus-parameters', 'executable-exact-structured', PICTURE_STYLE_COMPONENT_OWNERSHIP, PICTURE_STYLE_OVERRIDE_FIELDS, PICTURE_STYLE_RESET_BEHAVIOR)],
	[/shape-effect-|text-effect-/i, truth('preset-plus-parameters', 'executable-exact-structured', ['effectFamily', 'effectParameters', 'threeD'], EFFECT_PRESET_OVERRIDE_FIELDS, EFFECT_PRESET_RESET)],
	[/model3d-view-/i, truth('preset-plus-parameters', 'executable-exact-structured', ['camera', 'transform', 'lighting', 'viewport'], ['camera', 'trans', 'ambientLight', 'ptLights', 'objViewport'], {
		component: 'set a named camera/trans/light/viewport field to null or omit it to restore the selected tile/default',
		full: 'set model3dViewPresetId to null and remove manual view fields',
		nullBehavior: 'remove the named manual override while preserving the selected gallery tile',
	})],
	[/transition-ribbon-/i, truth('preset-plus-parameters', 'structured-partial', ['transitionEffect'], ['speed', 'duration', 'direction', 'pattern', 'spokes', 'clockwise', 'option', 'advanceOnClick', 'advanceAfterTime'])],
	[/connector-ribbon-/i, truth('preset-plus-parameters', 'structured-partial', ['connectorThemeStyle', 'line', 'arrows'], ['line.type', 'line.color', 'line.widthPt', 'line.transparency', 'line.dash', 'line.beginArrowType', 'line.endArrowType', 'line.beginArrowWidth', 'line.beginArrowLength', 'line.endArrowWidth', 'line.endArrowLength'], { component: 'set the named connector line/arrow field to null or type:none', full: 'remove the connector gallery base and authored line/arrow overrides', nullBehavior: 'restore the selected connector gallery base and inherited connector defaults' })],
	[/equation-/i, truth('discrete', 'executable-exact-structured', ['equationStructure'], ['semanticSlots'], NOT_APPLICABLE_RESET)],
	[/layout-/i, truth('discrete', 'structured-partial', ['layoutSelection', 'placeholderInheritance'])],
	[/theme-|master-/i, truth('preset-only', 'preset-only-incomplete', ['themeOrMasterResource', 'inheritedStyles'])],
])

const FAMILY_RULES = Object.freeze({
	charts: truth('preset-plus-parameters', 'structured-partial', ['chartType', 'chartStyle', 'chartColors', 'chartLayout'], ['chartOptions']),
	smartart: truth('preset-plus-parameters', 'structured-partial', ['layout', 'quickStyle', 'colorStyle'], ['nodes', 'layoutId', 'quickStyleId', 'colorStyleId']),
	tables: truth('preset-plus-parameters', 'structured-partial', ['tableStyle', 'conditionalStyleFlags'], ['headerRow', 'totalRow', 'bandedRows', 'bandedColumns', 'firstColumn', 'lastColumn', 'cellStyle']),
	'wordart-text3d': truth('preset-plus-parameters', 'structured-partial', ['textFill', 'textOutline', 'textEffects', 'text3D']),
	'shapes-gradients': truth(
		SHAPE_FORMATTING_CONTRACT.capabilityMode,
		SHAPE_FORMATTING_CONTRACT.capabilityStatus,
		SHAPE_FORMATTING_CONTRACT.componentOwnership,
		SHAPE_FORMATTING_CONTRACT.overrideFields,
		SHAPE_FORMATTING_CONTRACT.resetBehavior,
		{ precedence: SHAPE_FORMATTING_CONTRACT.precedence, legalCombinations: SHAPE_FORMATTING_CONTRACT.legalCombinations },
	),
	'layouts-themes-masters': truth('preset-only', 'preset-only-incomplete', ['theme', 'master', 'layout', 'inheritance']),
	'media-images-avatar': truth('preset-plus-parameters', 'structured-partial', ['pictureOrMediaAsset', 'framing', 'supportedPictureAdjustments']),
	model3d: truth('preset-plus-parameters', 'structured-partial', ['modelAsset', 'camera', 'transform', 'lighting', 'scene']),
	equations: truth('discrete', 'structured-partial', ['equationStructure'], ['semanticSlots']),
	structural: truth('parameterized', 'structured-partial', ['geometry', 'relationships', 'metadata']),
	'motion-transitions-morph': truth('preset-plus-parameters', 'structured-partial', ['motionOrTransitionEffect', 'timing'], ['duration', 'delay', 'trigger', 'direction', 'effectOptions']),
	'presenter-motion': truth('preset-plus-parameters', 'structured-partial', ['motionSelection', 'timing'], ['selectedMotionIds', 'duration', 'delay']),
	'art-direction': truth('parameterized', 'structured-partial', ['designWorld', 'palette', 'surface', 'cardLanguage', 'depth', 'typeScale', 'spacing'], ['styleIntent.artDirection', 'styleIntent.artDirection.mode', 'styleIntent.artDirection.palette', 'styleIntent.artDirection.surface', 'styleIntent.artDirection.card', 'styleIntent.artDirection.depth', 'styleIntent.artDirection.typeScale', 'styleIntent.artDirection.spacing', 'styleIntent.artDirection.accent', 'styleIntent.artDirection.background'], { component: 'set the named art-direction axis to null', full: 'remove authored art-direction axes and selected world', nullBehavior: 'restore the native/default design world and inherited visual language' }),
	'layout-intents': truth('discrete', 'executable-exact-structured', ['layoutIntent'], [], NOT_APPLICABLE_RESET),
})

function galleryTruth(entry) {
	const label = String(entry.label || '')
	const connectorStyleContract = connectorStyleCapabilityContractForEntry(entry)
	if (connectorStyleContract?.runtimeIntegrationComplete) return truth(connectorStyleContract.capabilityMode, connectorStyleContract.capabilityStatus, connectorStyleContract.componentOwnership, connectorStyleContract.overrideFields, connectorStyleContract.resetBehavior, { precedence: connectorStyleContract.precedence, legalCombinations: connectorStyleContract.legalCombinations })
	const layoutPresetContract = layoutPresetCapabilityContractForEntry(entry)
	if (layoutPresetContract) return truth(layoutPresetContract.capabilityMode, layoutPresetContract.capabilityStatus, layoutPresetContract.componentOwnership, layoutPresetContract.overrideFields, layoutPresetContract.resetBehavior, { precedence: layoutPresetContract.precedence, legalCombinations: layoutPresetContract.legalCombinations })
	const masterPresetContract = masterPresetCapabilityContractForEntry(entry)
	if (masterPresetContract) return truth(masterPresetContract.capabilityMode, masterPresetContract.capabilityStatus, masterPresetContract.componentOwnership, masterPresetContract.overrideFields, masterPresetContract.resetBehavior, { precedence: masterPresetContract.precedence, legalCombinations: masterPresetContract.legalCombinations })
	const themePresetContract = themePresetCapabilityContractForEntry(entry)
	if (themePresetContract) return truth(themePresetContract.capabilityMode, themePresetContract.capabilityStatus, themePresetContract.componentOwnership, themePresetContract.overrideFields, themePresetContract.resetBehavior, { precedence: themePresetContract.precedence, legalCombinations: themePresetContract.legalCombinations })
	if (/->\s*master-/i.test(label)) return truth('preset-plus-parameters', 'structured-partial', ['master', 'layouts', 'layoutToMasterBindings', 'templateCarrier', 'relationshipGraph'], ['masterPresetId', 'template.templatePresetId', 'masters[].background', 'masters[].objects', 'masters[].placeholders', 'patchPlan.templateCarriers'], { component: 'edit one named master through patchPlan.templateCarriers or set masterPresetId to null', full: 'remove the selected master preset and authored carrier edits', nullBehavior: 'restore the exact source master, linked layouts, and relationship graph' })
	if (/->\s*layout-/i.test(label)) return truth('preset-plus-parameters', 'structured-partial', ['layout', 'placeholderInheritance', 'layoutToMasterBinding', 'templateCarrier'], ['slides[].layoutPresetId', 'slides[].layoutName', 'slides[].masterName', 'patchPlan.templateCarriers'], { component: 'set slides[].layoutPresetId or layoutName to null, or reset the named carrier', full: 'remove the selected layout preset and authored layout carrier edits', nullBehavior: 'restore the audited source layout, placeholders, and linked master relationship' })
	for (const [pattern, value] of GALLERY_RULES) if (pattern.test(label)) return value
	return FAMILY_RULES[entry.family] || null
}

export function classifyCatalogEntry(entry = {}) {
	if (entry.sourceKind === 'observed-motion-review') return truth('missing', 'not-applicable', ['sourceReview'], [], NOT_APPLICABLE_RESET)
	if (entry.status === 'planned' || entry.implemented === false) {
		return truth('missing', 'missing', [], [], NOT_APPLICABLE_RESET)
	}
	if (entry.coverageMode === 'preserve-only') {
		return truth('preserve-only', 'preserve-imported-only', ['importedNativePayload'])
	}
	if (entry.coverageMode === 'validate-only' || entry.coverageMode === 'detect-and-reject') {
		return truth('missing', 'not-applicable', ['validationOnly'], [], NOT_APPLICABLE_RESET)
	}
	const model3dAuthoringContract = model3dAuthoringCapabilityContractForEntry(entry)
	if (model3dAuthoringContract) return truth(
		model3dAuthoringContract.capabilityMode,
		model3dAuthoringContract.capabilityStatus,
		model3dAuthoringContract.componentOwnership,
		model3dAuthoringContract.overrideFields,
		model3dAuthoringContract.resetBehavior,
		{
			precedence: model3dAuthoringContract.precedence,
			legalCombinations: model3dAuthoringContract.legalCombinations,
			publicSchema: model3dAuthoringContract.publicSchema,
			applicability: model3dAuthoringContract.applicability,
			limitation: model3dAuthoringContract.limitation,
		},
	)
	const wordArtText3DContract = wordArtText3DCapabilityContractForEntry(entry)
	if (wordArtText3DContract?.runtimeIntegrationComplete) {
		return truth(
			wordArtText3DContract.capabilityMode,
			wordArtText3DContract.capabilityStatus,
			wordArtText3DContract.componentOwnership,
			wordArtText3DContract.overrideFields,
			wordArtText3DContract.resetBehavior,
			{ precedence: wordArtText3DContract.precedence, legalCombinations: wordArtText3DContract.legalCombinations },
		)
	}
	if (entry.sourceKind === 'native-gallery-style') {
		const transitionGalleryContract = transitionGalleryCapabilityContractForEntry(entry)
		if (transitionGalleryContract) return truth(transitionGalleryContract.capabilityMode, transitionGalleryContract.capabilityStatus, transitionGalleryContract.componentOwnership, transitionGalleryContract.overrideFields, transitionGalleryContract.resetBehavior, { precedence: transitionGalleryContract.precedence, legalCombinations: transitionGalleryContract.legalCombinations, applicability: transitionGalleryContract.applicability, limitation: transitionGalleryContract.limitation })
		return galleryTruth(entry)
	}
	if (entry.sourceKind === 'semantic-layout-intent') return FAMILY_RULES['layout-intents']
	if (entry.sourceKind === 'named-world') {
		const artDirectionWorldContract = artDirectionWorldCapabilityContractForEntry(entry)
		if (artDirectionWorldContract) return truth(artDirectionWorldContract.capabilityMode, artDirectionWorldContract.capabilityStatus, artDirectionWorldContract.componentOwnership, artDirectionWorldContract.overrideFields, artDirectionWorldContract.resetBehavior, { precedence: artDirectionWorldContract.precedence, legalCombinations: artDirectionWorldContract.legalCombinations, applicability: artDirectionWorldContract.applicability, limitation: artDirectionWorldContract.limitation, publicSchema: artDirectionWorldContract.publicSchema })
		return FAMILY_RULES['art-direction']
	}
	if (entry.sourceKind === 'semantic-presenter-motion') {
		const presenterMotionSelectionContract = presenterMotionSelectionCapabilityContractForEntry(entry)
		if (presenterMotionSelectionContract) return truth(presenterMotionSelectionContract.capabilityMode, presenterMotionSelectionContract.capabilityStatus, presenterMotionSelectionContract.componentOwnership, presenterMotionSelectionContract.overrideFields, presenterMotionSelectionContract.resetBehavior, { precedence: presenterMotionSelectionContract.precedence, legalCombinations: presenterMotionSelectionContract.legalCombinations, applicability: presenterMotionSelectionContract.applicability, limitation: presenterMotionSelectionContract.limitation, publicSchema: presenterMotionSelectionContract.publicSchema })
		return FAMILY_RULES['presenter-motion']
	}
	if (entry.sourceKind === 'native-composite-technique' && entry.selection?.semanticKind === 'animated-table') {
		return truth(
			'parameterized',
			'executable-exact-structured',
			['editableGroup', 'namedRowGroups', 'editableCellShapes', 'nativeTiming', 'synergyTargets'],
			['header', 'rows', 'rect', 'appearance', 'reveal.by', 'reveal.order', 'reveal.effect', 'reveal.trigger', 'reveal.startMs', 'reveal.staggerMs', 'reveal.durationMs', 'interactions[].target'],
			{ component: 'omit or null the named appearance/reveal control', full: 'replace animated-table with table-panel or remove the content block', nullBehavior: 'omitted appearance uses documented composite defaults; reveal.enabled:false keeps a static editable composite' },
			{ precedence: 'animated-table defaults, then explicit appearance and cell overrides, then native timing and optional Synergy contact timing', legalCombinations: ['row|column|cell reveal', 'named descendant animation', 'qualified presenter interaction'], applicability: 'editable grouped-shape tables that need independent row/cell timing or presenter contact', limitation: 'Not one native p:tbl; merged cells are unsupported in v1.' },
		)
	}
	if (entry.sourceKind === 'public-tool') {
		const model3dPublicOperationContract = model3dPublicOperationCapabilityContractForEntry(entry)
		if (model3dPublicOperationContract) return truth(
			model3dPublicOperationContract.capabilityMode,
			model3dPublicOperationContract.capabilityStatus,
			model3dPublicOperationContract.componentOwnership,
			model3dPublicOperationContract.overrideFields,
			model3dPublicOperationContract.resetBehavior,
			{ precedence: model3dPublicOperationContract.precedence, legalCombinations: model3dPublicOperationContract.legalCombinations, applicability: model3dPublicOperationContract.applicability, limitation: model3dPublicOperationContract.limitation, publicSchema: model3dPublicOperationContract.publicSchema },
		)
		const smartArtCatalogContract = smartArtCatalogCapabilityContractForEntry(entry)
		if (smartArtCatalogContract) return truth(
			smartArtCatalogContract.capabilityMode,
			smartArtCatalogContract.capabilityStatus,
			smartArtCatalogContract.componentOwnership,
			smartArtCatalogContract.overrideFields,
			smartArtCatalogContract.resetBehavior,
			{
				precedence: smartArtCatalogContract.precedence,
				legalCombinations: smartArtCatalogContract.legalCombinations,
				applicability: smartArtCatalogContract.applicability,
				limitation: smartArtCatalogContract.limitation,
			},
		)
		if (entry.family === 'charts' && String(entry.label || '') === 'betterpptx.chart.recommend') {
			return truth('discrete', 'host-command-not-persistent-style', ['publicOperation', 'chartCatalog', 'exactIdValidation'], [], NOT_APPLICABLE_RESET, {
				applicability: ['unranked chart catalog search', 'exact chart preset/style/color/layout/treatment id validation'],
				limitation: 'Compatibility catalog command only; it filters factual chart capabilities and validates opaque IDs but is not serialized as a slide style or chart object.',
				precedence: ['public tool schema', 'stable id-sorted catalog filter', 'exact selector applicability validation'],
				legalCombinations: ['query with chart intent or data-shape tokens', 'exact chart selector validation', 'gallery/style/treatment catalog pagination'],
			})
		}
		if (entry.family === 'equations' && String(entry.label || '') === 'betterpptx.equation.catalog') {
			return truth('discrete', 'host-command-not-persistent-style', ['publicOperation', 'equationCatalog', 'exactIdValidation'], [], NOT_APPLICABLE_RESET, {
				applicability: ['unranked equation source-format and semantic-structure discovery', 'exact equation gallery preset id validation', 'bounded equation catalog pagination'],
				limitation: 'Compatibility catalog command only; it filters factual equation capabilities and validates opaque preset ids but is not serialized as a slide style or equation object.',
				precedence: ['public tool schema', 'stable id-sorted catalog filter', 'exact equation preset id validation'],
				legalCombinations: ['query with equation or semantic-structure tokens', 'exact equation gallery preset validation', 'source-format and template-kind discovery with bounded pagination'],
			})
		}
		if (entry.family === 'tables' && String(entry.label || '') === 'betterpptx.table.recommend') {
			return truth('discrete', 'host-command-not-persistent-style', ['publicOperation', 'tableCatalog', 'exactIdValidation'], [], NOT_APPLICABLE_RESET, {
				applicability: ['unranked table intent and data-shape discovery', 'exact table preset and native Table Design style id validation', 'bounded table catalog pagination'],
				limitation: 'Compatibility catalog command only; it filters factual table capabilities and validates opaque preset/style ids but is not serialized as a slide style or table object.',
				precedence: ['public tool schema', 'stable id-sorted catalog filter', 'exact table preset/style applicability validation'],
				legalCombinations: ['query with table intent or data-shape tokens', 'exact table preset validation', 'native style discovery with bounded pagination and optional theme filters'],
			})
		}
		const mediaAvatarPublicOperationContract = mediaAvatarPublicOperationCapabilityContractForEntry(entry)
		if (mediaAvatarPublicOperationContract) return truth(
			mediaAvatarPublicOperationContract.capabilityMode,
			mediaAvatarPublicOperationContract.capabilityStatus,
			mediaAvatarPublicOperationContract.componentOwnership,
			mediaAvatarPublicOperationContract.overrideFields,
			mediaAvatarPublicOperationContract.resetBehavior,
			{
				precedence: mediaAvatarPublicOperationContract.precedence,
				legalCombinations: mediaAvatarPublicOperationContract.legalCombinations,
				applicability: mediaAvatarPublicOperationContract.applicability,
				limitation: mediaAvatarPublicOperationContract.limitation,
				publicSchema: mediaAvatarPublicOperationContract.publicSchema,
			},
		)
		const publicOperationContract = publicOperationCapabilityContractForEntry(entry)
		if (publicOperationContract) return truth(
			publicOperationContract.capabilityMode,
			publicOperationContract.capabilityStatus,
			publicOperationContract.componentOwnership,
			publicOperationContract.overrideFields,
			publicOperationContract.resetBehavior,
			{
				precedence: publicOperationContract.precedence,
				legalCombinations: publicOperationContract.legalCombinations,
				applicability: publicOperationContract.applicability,
				limitation: publicOperationContract.limitation,
			},
		)
		return truth('parameterized', 'structured-partial', ['publicOperation'], [], NOT_APPLICABLE_RESET)
	}
	if (entry.sourceKind === 'authoring-family') {
		const motionAuthoringFamilyContract = motionAuthoringFamilyCapabilityContractForEntry(entry)
		if (motionAuthoringFamilyContract) return truth(motionAuthoringFamilyContract.capabilityMode, motionAuthoringFamilyContract.capabilityStatus, motionAuthoringFamilyContract.componentOwnership, motionAuthoringFamilyContract.overrideFields, motionAuthoringFamilyContract.resetBehavior, { precedence: motionAuthoringFamilyContract.precedence, legalCombinations: motionAuthoringFamilyContract.legalCombinations, applicability: motionAuthoringFamilyContract.applicability, limitation: motionAuthoringFamilyContract.limitation, publicSchema: motionAuthoringFamilyContract.publicSchema })
		const equationAuthoringContract = equationAuthoringCapabilityContractForEntry(entry)
		if (equationAuthoringContract) return truth(equationAuthoringContract.capabilityMode, equationAuthoringContract.capabilityStatus, equationAuthoringContract.componentOwnership, equationAuthoringContract.overrideFields, equationAuthoringContract.resetBehavior, { precedence: equationAuthoringContract.precedence, legalCombinations: equationAuthoringContract.legalCombinations, publicSchema: equationAuthoringContract.publicSchema, applicability: equationAuthoringContract.applicability })
		const smartArtContract = smartArtCapabilityContractForEntry(entry)
		if (smartArtContract) return truth(smartArtContract.capabilityMode, smartArtContract.capabilityStatus, smartArtContract.componentOwnership, smartArtContract.overrideFields, smartArtContract.resetBehavior, { precedence: smartArtContract.precedence, legalCombinations: smartArtContract.legalCombinations, publicSchema: smartArtContract.publicSchema, applicability: ['native', 'shape', 'hierarchy', 'picture', 'list', 'process', 'cycle', 'matrix', 'pyramid', 'relationship', 'timeline', 'team'] })
		const structuralContract = structuralCapabilityContractForEntry(entry)
		if (structuralContract) return truth(structuralContract.capabilityMode, structuralContract.capabilityStatus, structuralContract.componentOwnership, structuralContract.overrideFields, structuralContract.resetBehavior, { precedence: structuralContract.precedence, legalCombinations: structuralContract.legalCombinations, publicSchema: structuralContract.publicSchema, applicability: ['connector', 'group', 'freeform', 'customGeometry'] })
		const tableAuthoringContract = tableAuthoringCapabilityContractForEntry(entry)
		if (tableAuthoringContract) return truth(tableAuthoringContract.capabilityMode, tableAuthoringContract.capabilityStatus, tableAuthoringContract.componentOwnership, tableAuthoringContract.overrideFields, tableAuthoringContract.resetBehavior, { precedence: tableAuthoringContract.precedence, legalCombinations: tableAuthoringContract.legalCombinations, publicSchema: tableAuthoringContract.publicSchema, applicability: tableAuthoringContract.applicability })
		const chartAuthoringContract = chartAuthoringCapabilityContractForEntry(entry)
		if (chartAuthoringContract) return truth(chartAuthoringContract.capabilityMode, chartAuthoringContract.capabilityStatus, chartAuthoringContract.componentOwnership, chartAuthoringContract.overrideFields, chartAuthoringContract.resetBehavior, { precedence: chartAuthoringContract.precedence, legalCombinations: chartAuthoringContract.legalCombinations, publicSchema: chartAuthoringContract.publicSchema, applicability: chartAuthoringContract.applicability })
		const mediaImageFamilyAggregate = mediaImageFamilyAggregateCapabilityContractForEntry(entry)
		if (mediaImageFamilyAggregate) return truth(mediaImageFamilyAggregate.capabilityMode, mediaImageFamilyAggregate.capabilityStatus, mediaImageFamilyAggregate.componentOwnership, mediaImageFamilyAggregate.overrideFields, mediaImageFamilyAggregate.resetBehavior, { precedence: mediaImageFamilyAggregate.precedence, legalCombinations: mediaImageFamilyAggregate.legalCombinations })
		const layoutThemeMasterFamilyAggregate = layoutThemeMasterFamilyAggregateCapabilityContractForEntry(entry)
		if (layoutThemeMasterFamilyAggregate) return truth(layoutThemeMasterFamilyAggregate.capabilityMode, layoutThemeMasterFamilyAggregate.capabilityStatus, layoutThemeMasterFamilyAggregate.componentOwnership, layoutThemeMasterFamilyAggregate.overrideFields, layoutThemeMasterFamilyAggregate.resetBehavior, { precedence: layoutThemeMasterFamilyAggregate.precedence, legalCombinations: layoutThemeMasterFamilyAggregate.legalCombinations, publicSchema: layoutThemeMasterFamilyAggregate.publicSchema })
		const mediaImageContract = mediaImageCapabilityContractForEntry(entry)
		if (mediaImageContract) return truth(mediaImageContract.capabilityMode, mediaImageContract.capabilityStatus, mediaImageContract.componentOwnership, mediaImageContract.overrideFields, mediaImageContract.resetBehavior, { precedence: mediaImageContract.precedence, legalCombinations: mediaImageContract.legalCombinations })
		return FAMILY_RULES[entry.family] || null
	}
	if (entry.sourceKind === 'capability-row') {
		const label = String(entry.publicName || entry.label || '').trim().toLowerCase()
		const animationAuthoringOperationContract = animationAuthoringOperationCapabilityContractForEntry(entry)
		if (animationAuthoringOperationContract) return truth(animationAuthoringOperationContract.capabilityMode, animationAuthoringOperationContract.capabilityStatus, animationAuthoringOperationContract.componentOwnership, animationAuthoringOperationContract.overrideFields, animationAuthoringOperationContract.resetBehavior, { precedence: animationAuthoringOperationContract.precedence, legalCombinations: animationAuthoringOperationContract.legalCombinations, applicability: animationAuthoringOperationContract.applicability, limitation: animationAuthoringOperationContract.limitation, publicSchema: animationAuthoringOperationContract.publicSchema })
		const transitionAuthoringOperationContract = transitionAuthoringOperationCapabilityContractForEntry(entry)
		if (transitionAuthoringOperationContract) return truth(transitionAuthoringOperationContract.capabilityMode, transitionAuthoringOperationContract.capabilityStatus, transitionAuthoringOperationContract.componentOwnership, transitionAuthoringOperationContract.overrideFields, transitionAuthoringOperationContract.resetBehavior, { precedence: transitionAuthoringOperationContract.precedence, legalCombinations: transitionAuthoringOperationContract.legalCombinations, applicability: transitionAuthoringOperationContract.applicability, limitation: transitionAuthoringOperationContract.limitation, publicSchema: transitionAuthoringOperationContract.publicSchema })
		const motionAuthoringFamilyContract = motionAuthoringFamilyCapabilityContractForEntry(entry)
		if (motionAuthoringFamilyContract) return truth(motionAuthoringFamilyContract.capabilityMode, motionAuthoringFamilyContract.capabilityStatus, motionAuthoringFamilyContract.componentOwnership, motionAuthoringFamilyContract.overrideFields, motionAuthoringFamilyContract.resetBehavior, { precedence: motionAuthoringFamilyContract.precedence, legalCombinations: motionAuthoringFamilyContract.legalCombinations, applicability: motionAuthoringFamilyContract.applicability, limitation: motionAuthoringFamilyContract.limitation, publicSchema: motionAuthoringFamilyContract.publicSchema })
		const sampleAssetDiscoveryContract = sampleAssetDiscoveryCapabilityContractForEntry(entry)
		if (sampleAssetDiscoveryContract) return truth(
			sampleAssetDiscoveryContract.capabilityMode,
			sampleAssetDiscoveryContract.capabilityStatus,
			sampleAssetDiscoveryContract.componentOwnership,
			sampleAssetDiscoveryContract.overrideFields,
			sampleAssetDiscoveryContract.resetBehavior,
			{
				precedence: sampleAssetDiscoveryContract.precedence,
				legalCombinations: sampleAssetDiscoveryContract.legalCombinations,
				applicability: sampleAssetDiscoveryContract.applicability,
				limitation: sampleAssetDiscoveryContract.limitation,
			},
		)
		const equationAuthoringContract = equationAuthoringCapabilityContractForEntry(entry)
		if (equationAuthoringContract) return truth(equationAuthoringContract.capabilityMode, equationAuthoringContract.capabilityStatus, equationAuthoringContract.componentOwnership, equationAuthoringContract.overrideFields, equationAuthoringContract.resetBehavior, { precedence: equationAuthoringContract.precedence, legalCombinations: equationAuthoringContract.legalCombinations, publicSchema: equationAuthoringContract.publicSchema, applicability: equationAuthoringContract.applicability })
		const smartArtContract = smartArtCapabilityContractForEntry(entry)
		if (smartArtContract) return truth(smartArtContract.capabilityMode, smartArtContract.capabilityStatus, smartArtContract.componentOwnership, smartArtContract.overrideFields, smartArtContract.resetBehavior, { precedence: smartArtContract.precedence, legalCombinations: smartArtContract.legalCombinations, publicSchema: smartArtContract.publicSchema, applicability: ['native', 'shape', 'hierarchy', 'picture', 'list', 'process', 'cycle', 'matrix', 'pyramid', 'relationship', 'timeline', 'team'] })
		const structuralContract = structuralCapabilityContractForEntry(entry)
		if (structuralContract) return truth(structuralContract.capabilityMode, structuralContract.capabilityStatus, structuralContract.componentOwnership, structuralContract.overrideFields, structuralContract.resetBehavior, { precedence: structuralContract.precedence, legalCombinations: structuralContract.legalCombinations, publicSchema: structuralContract.publicSchema, applicability: ['connector', 'group', 'freeform', 'customGeometry'] })
		const tableAuthoringContract = tableAuthoringCapabilityContractForEntry(entry)
		if (tableAuthoringContract) return truth(tableAuthoringContract.capabilityMode, tableAuthoringContract.capabilityStatus, tableAuthoringContract.componentOwnership, tableAuthoringContract.overrideFields, tableAuthoringContract.resetBehavior, { precedence: tableAuthoringContract.precedence, legalCombinations: tableAuthoringContract.legalCombinations, publicSchema: tableAuthoringContract.publicSchema, applicability: tableAuthoringContract.applicability })
		const chartAuthoringContract = chartAuthoringCapabilityContractForEntry(entry)
		if (chartAuthoringContract) return truth(chartAuthoringContract.capabilityMode, chartAuthoringContract.capabilityStatus, chartAuthoringContract.componentOwnership, chartAuthoringContract.overrideFields, chartAuthoringContract.resetBehavior, { precedence: chartAuthoringContract.precedence, legalCombinations: chartAuthoringContract.legalCombinations, publicSchema: chartAuthoringContract.publicSchema, applicability: chartAuthoringContract.applicability })
		const multipleSlideMastersContract = multipleSlideMastersCapabilityContractForEntry(entry)
		if (multipleSlideMastersContract?.runtimeReady) return truth(
			multipleSlideMastersContract.capabilityMode,
			multipleSlideMastersContract.capabilityStatus,
			multipleSlideMastersContract.componentOwnership,
			multipleSlideMastersContract.overrideFields,
			multipleSlideMastersContract.resetBehavior,
			{ precedence: multipleSlideMastersContract.precedence, legalCombinations: multipleSlideMastersContract.legalCombinations, publicSchema: multipleSlideMastersContract.publicSchema },
		)
		const addSlideContract = addSlideEntryCapabilityContractForEntry(entry)
		if (addSlideContract?.runtimeReady) return truth(
			addSlideContract.capabilityMode,
			addSlideContract.capabilityStatus,
			addSlideContract.componentOwnership,
			addSlideContract.overrideFields,
			addSlideContract.resetBehavior,
			{ precedence: addSlideContract.precedence, legalCombinations: addSlideContract.legalCombinations, publicSchema: addSlideContract.publicSchema },
		)
		const sectionSummaryZoomContract = sectionSummaryZoomCapabilityContractForEntry(entry)
		if (sectionSummaryZoomContract?.runtimeReady) return truth(
			sectionSummaryZoomContract.capabilityMode,
			sectionSummaryZoomContract.capabilityStatus,
			sectionSummaryZoomContract.componentOwnership,
			sectionSummaryZoomContract.overrideFields,
			sectionSummaryZoomContract.resetBehavior,
			{ precedence: sectionSummaryZoomContract.precedence, legalCombinations: sectionSummaryZoomContract.legalCombinations, publicSchema: sectionSummaryZoomContract.publicSchema },
		)
		const interactiveNavigationContract = interactiveNavigationCapabilityContractForEntry(entry)
		if (interactiveNavigationContract?.runtimeReady) return truth(
			interactiveNavigationContract.capabilityMode,
			interactiveNavigationContract.capabilityStatus,
			interactiveNavigationContract.componentOwnership,
			interactiveNavigationContract.overrideFields,
			interactiveNavigationContract.resetBehavior,
			{ precedence: interactiveNavigationContract.precedence, legalCombinations: interactiveNavigationContract.legalCombinations, publicSchema: interactiveNavigationContract.publicSchema },
		)
		const graphicPlaceholderVisibilityContract = layoutGraphicPlaceholderVisibilityCapabilityContractForEntry(entry)
		if (graphicPlaceholderVisibilityContract?.runtimeReady) return truth(
			graphicPlaceholderVisibilityContract.capabilityMode,
			graphicPlaceholderVisibilityContract.capabilityStatus,
			graphicPlaceholderVisibilityContract.componentOwnership,
			graphicPlaceholderVisibilityContract.overrideFields,
			graphicPlaceholderVisibilityContract.resetBehavior,
			{ precedence: graphicPlaceholderVisibilityContract.precedence, legalCombinations: graphicPlaceholderVisibilityContract.legalCombinations, publicSchema: graphicPlaceholderVisibilityContract.publicSchema },
		)
		const inheritanceContract = layoutThemeMasterInheritanceCapabilityContractForEntry(entry)
		if (inheritanceContract?.runtimeReady) return truth(
			inheritanceContract.capabilityMode,
			inheritanceContract.capabilityStatus,
			inheritanceContract.componentOwnership,
			inheritanceContract.overrideFields,
			inheritanceContract.resetBehavior,
			{ precedence: inheritanceContract.precedence, legalCombinations: inheritanceContract.legalCombinations, publicSchema: inheritanceContract.publicSchema },
		)
		const placeholderContract = LAYOUT_PLACEHOLDER_VARIANTS_CONTRACT.rowIds.includes(entry.id)
			? LAYOUT_PLACEHOLDER_VARIANTS_CONTRACT
			: HEADER_VISIBILITY_CONTRACT.rowIds.includes(entry.id)
				? HEADER_VISIBILITY_CONTRACT
				: SLIDE_NUMBER_FIELD_CONTRACT.rowIds.includes(entry.id)
					? SLIDE_NUMBER_FIELD_CONTRACT
					: null
		if (placeholderContract?.runtimeReady) return truth(
			placeholderContract.capabilityMode,
			placeholderContract.capabilityStatus,
			placeholderContract.componentOwnership || [],
			placeholderContract.overrideFields || [],
			placeholderContract.resetBehavior || NO_RESET,
			{ precedence: placeholderContract.precedence, legalCombinations: placeholderContract.legalCombinations, publicSchema: placeholderContract.publicSchema },
		)
		const foundationContract = foundationCapabilityContractForEntry(entry)
		if (foundationContract) return truth(foundationContract.capabilityMode, foundationContract.capabilityStatus, foundationContract.componentOwnership, foundationContract.overrideFields, foundationContract.resetBehavior, { precedence: foundationContract.precedence, legalCombinations: foundationContract.legalCombinations, publicSchema: foundationContract.publicSchema })
		const textAuthoringEntryContract = textAuthoringEntryCapabilityContractForEntry(entry)
		if (textAuthoringEntryContract?.runtimeReady) return truth(textAuthoringEntryContract.capabilityMode, textAuthoringEntryContract.capabilityStatus, textAuthoringEntryContract.componentOwnership, textAuthoringEntryContract.overrideFields, textAuthoringEntryContract.resetBehavior, { precedence: textAuthoringEntryContract.precedence, legalCombinations: textAuthoringEntryContract.legalCombinations, publicSchema: textAuthoringEntryContract.publicSchema })
		const hyperlinkEntryContract = hyperlinkEntryCapabilityContractForEntry(entry)
		if (hyperlinkEntryContract?.runtimeReady) return truth(hyperlinkEntryContract.capabilityMode, hyperlinkEntryContract.capabilityStatus, hyperlinkEntryContract.componentOwnership, hyperlinkEntryContract.overrideFields, hyperlinkEntryContract.resetBehavior, { precedence: hyperlinkEntryContract.precedence, legalCombinations: hyperlinkEntryContract.legalCombinations, publicSchema: hyperlinkEntryContract.publicSchema })
		const wordArtTransformContract = wordArtTransformCapabilityContractForEntry(entry)
		if (wordArtTransformContract) return truth(wordArtTransformContract.capabilityMode, wordArtTransformContract.capabilityStatus, wordArtTransformContract.componentOwnership, wordArtTransformContract.overrideFields, wordArtTransformContract.resetBehavior, { precedence: wordArtTransformContract.precedence, legalCombinations: wordArtTransformContract.legalCombinations })
		const mediaImageFamilyAggregate = mediaImageFamilyAggregateCapabilityContractForEntry(entry)
		if (mediaImageFamilyAggregate) return truth(mediaImageFamilyAggregate.capabilityMode, mediaImageFamilyAggregate.capabilityStatus, mediaImageFamilyAggregate.componentOwnership, mediaImageFamilyAggregate.overrideFields, mediaImageFamilyAggregate.resetBehavior, { precedence: mediaImageFamilyAggregate.precedence, legalCombinations: mediaImageFamilyAggregate.legalCombinations })
		const mediaImageContract = mediaImageCapabilityContractForEntry(entry)
		if (mediaImageContract) return truth(mediaImageContract.capabilityMode, mediaImageContract.capabilityStatus, mediaImageContract.componentOwnership, mediaImageContract.overrideFields, mediaImageContract.resetBehavior, { precedence: mediaImageContract.precedence, legalCombinations: mediaImageContract.legalCombinations })
		const layoutImageEntryContract = layoutImageEntryCapabilityContractForEntry(entry)
		if (layoutImageEntryContract) return truth(layoutImageEntryContract.capabilityMode, layoutImageEntryContract.capabilityStatus, layoutImageEntryContract.componentOwnership, layoutImageEntryContract.overrideFields, layoutImageEntryContract.resetBehavior, { precedence: layoutImageEntryContract.precedence, legalCombinations: layoutImageEntryContract.legalCombinations })
		const layoutMediaEntryContract = layoutMediaEntryCapabilityContractForEntry(entry)
		if (layoutMediaEntryContract) return truth(layoutMediaEntryContract.capabilityMode, layoutMediaEntryContract.capabilityStatus, layoutMediaEntryContract.componentOwnership, layoutMediaEntryContract.overrideFields, layoutMediaEntryContract.resetBehavior, { precedence: layoutMediaEntryContract.precedence, legalCombinations: layoutMediaEntryContract.legalCombinations })
		// The frozen ledger historically grouped these rows under the
		// layouts/themes/masters family because they are slide-facing entry
		// points. Their actual authoring carriers are typed and already owned by
		// other native surfaces. Keep the family grouping stable, but do not let
		// it collapse executable rows into a meaningless preset-only bucket.
		if (label === 'add 3d model') return truth('parameterized', 'structured-partial', ['modelAsset', 'camera', 'transform', 'lighting', 'scene'], ['model3d', 'camera', 'trans', 'ambientLight', 'ptLights', 'objViewport'], { component: 'set the named 3-D/model field to null', full: 'remove authored model, camera, transform, lighting, and scene overrides', nullBehavior: 'restore the native model defaults and inherited scene state' })
		if (label === 'add animation') return truth('parameterized', 'structured-partial', ['motionOrTransitionEffect', 'timing'], ['animation', 'duration', 'delay', 'trigger', 'direction', 'effectOptions'], { component: 'set the named animation/timing field to null', full: 'remove authored animation and timing overrides', nullBehavior: 'restore the native/default motion timing' })
		if (label === 'add transition' || label === 'betterpptx-mcp.slide.add_with_transition') return truth('parameterized', 'structured-partial', ['transitionEffect', 'timing'], ['transition', 'speed', 'duration', 'direction', 'advanceOnClick', 'advanceAfterTime'], { component: 'set transition or one timing field to null', full: 'remove the authored transition and timing override', nullBehavior: 'restore the native/default slide transition' })
		if (label === 'media' || label === 'title' || label === 'body' || label === 'subtitle' || label === 'date' || label === 'slidenum' || label === 'slide numbers' || label === 'footer' || label === 'header') return truth('parameterized', 'structured-partial', ['layout.placeholder', 'master.placeholder', 'placeholderBinding'], [...LAYOUT_PLACEHOLDER_OVERRIDE_FIELDS, 'placeholder.type', 'placeholder.name', 'placeholder.idx', 'placeholder.text', 'placeholder.options'], LAYOUT_PLACEHOLDER_RESET)
		if (label === 'add notes' || label === 'speaker notes') return truth('parameterized', 'executable-exact-structured', ['slide.notes', 'notesPart'], ['slide.notes'], { component: 'set slide.notes to null', full: 'remove authored speaker notes', nullBehavior: 'restore an empty native notes part' })
		if (label === 'add text' || label === 'add rich text runs') return truth('parameterized', 'structured-partial', ['text', 'textRuns', 'textStyle'], ['text', 'textRuns', 'textOptions', 'paragraphOptions'], { component: 'set text or a run/paragraph field to null', full: 'remove authored text content/style overrides', nullBehavior: 'restore the native/default text body and inherited styles' })
		if (label === 'add passthrough xml' || label === 'set raw timing xml') return truth('preserve-only', 'preserve-imported-only', ['importedNativePayload'], [], NOT_APPLICABLE_RESET)
		if (label === 'hidden slides') return truth('parameterized', 'executable-exact-structured', ['slide.visibility'], ['slide.hidden'], { component: 'set slide.hidden to null', full: 'remove authored hidden-slide policy', nullBehavior: 'restore the native visible-slide default' })
		if (label === 'failure report by slide/object/coverage row') return truth('parameterized', 'executable-exact-structured', ['validationReport', 'coverageDiagnostics'], ['report.slide', 'report.object', 'report.coverageRow', 'report.severity'], NOT_APPLICABLE_RESET)
		if (label === 'text shadow') return truth('parameterized', 'executable-exact-structured', ['textRun.effect.shadow'], TEXT_SHADOW_OVERRIDE_FIELDS, TEXT_SHADOW_RESET)
		if (label === 'text reflection') return truth('parameterized', 'executable-exact-structured', ['textRun.effect.reflection'], TEXT_REFLECTION_OVERRIDE_FIELDS, TEXT_REFLECTION_RESET)
		if (label === 'add placeholder') return truth('parameterized', 'executable-exact-structured', ['layout.placeholder', 'master.placeholder', 'placeholderBinding'], LAYOUT_PLACEHOLDER_OVERRIDE_FIELDS, LAYOUT_PLACEHOLDER_RESET)
		if (label === 'layout relationships' || label === 'layout to slide inheritance' || label === 'master to layout inheritance') return truth('parameterized', 'executable-exact-structured', ['slideLayoutRelationship', 'slideMasterRelationship', 'placeholderInheritance'], LAYOUT_RELATIONSHIP_OVERRIDE_FIELDS, LAYOUT_RELATIONSHIP_RESET)
		if (label === 'custom slide sizes') return truth('parameterized', 'executable-exact-structured', ['presentationCanvas', 'layoutCanvas'], LAYOUT_SIZE_OVERRIDE_FIELDS, LAYOUT_SIZE_RESET)
		if (label === 'font inheritance') return truth('parameterized', 'executable-exact-structured', ['themeFonts', 'fontInheritance'], FONT_INHERITANCE_OVERRIDE_FIELDS, FONT_INHERITANCE_RESET)
		if (label === 'showmasterbackground') return truth('parameterized', 'executable-exact-structured', ['slide.showMasterBackground', 'slide.showMasterShapes'], ['slide.showMasterBackground'], { component: 'set slides[].showMasterBackground to null or true', full: 'remove the authored master-background visibility override', nullBehavior: 'restore the native p:sld@showMasterSp/default master background-graphics visibility' })
		if (label === 'layouts' || label === 'slide masters' || label === 'themes' || label === 'theme inheritance' || label === 'style inheritance' || label === 'geometry inheritance') return truth('parameterized', 'structured-partial', ['theme', 'master', 'layout', 'inheritance'])
		if (entry.coverageMode === 'byte-transform') return truth('parameterized', 'byte-transform-operation', ['assetBytes'], [], NOT_APPLICABLE_RESET)
		if (entry.coverageMode === 'host-command') return truth('discrete', 'host-command-not-persistent-style', ['hostCommand'], [], NOT_APPLICABLE_RESET)
		return FAMILY_RULES[entry.family] || truth('parameterized', 'structured-partial', ['semanticCapability'])
	}
	return null
}

export function applyCatalogTruth(entry) {
	const classification = classifyCatalogEntry(entry)
	if (!classification) throw new Error(`UNCLASSIFIED_PUBLIC_CAPABILITY: ${entry.sourceKind || 'unknown'}:${entry.family || 'unknown'}:${entry.label || entry.id || 'unknown'}`)
	return { ...entry, ...classification }
}

export function validateCapabilityTruth(value, label = 'capability') {
	if (!CAPABILITY_MODES.includes(value?.capabilityMode)) throw new Error(`${label} has invalid capabilityMode`)
	if (!CAPABILITY_STATUSES.includes(value?.capabilityStatus)) throw new Error(`${label} has invalid capabilityStatus`)
	if (!Array.isArray(value.componentOwnership) || !Array.isArray(value.overrideFields)) throw new Error(`${label} lacks ownership/override arrays`)
	if (!value.resetBehavior || typeof value.resetBehavior !== 'object') throw new Error(`${label} lacks resetBehavior`)
	return true
}

export const RESET_BEHAVIOR_NOT_PUBLIC = NO_RESET
export const RESET_BEHAVIOR_NOT_APPLICABLE = NOT_APPLICABLE_RESET
