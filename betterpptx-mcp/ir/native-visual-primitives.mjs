/**
 * Public parameterized native visual primitives.
 * Gallery presets remain available; this is the continuous schema the AI can author.
 * Continuation status: docs/NATIVE-VISUAL-AND-CAPTION-HANDOFF.md
 */

import { TEXT_FILL_FIELDS, TEXT_FILL_PUBLIC_SCHEMA } from '../text-fill-contract.mjs'

export const NATIVE_VISUAL_EDITABILITY = Object.freeze(['ui-editable', 'native-preserved', 'raster-fallback'])

export const PATTERN_PRESETS = Object.freeze([
	'pct5', 'pct10', 'pct20', 'pct25', 'pct30', 'pct40', 'pct50', 'pct60', 'pct70', 'pct75', 'pct80', 'pct90',
	'dkUpDiag', 'ltUpDiag', 'dkDnDiag', 'ltDnDiag', 'dkHorz', 'ltHorz', 'dkVert', 'ltVert',
	'dkCross', 'ltCross', 'dkDiagCross', 'ltDiagCross', 'smCheck', 'lgCheck', 'dotGrid', 'dotDmnd',
])

export const FILL_OVERLAY_BLENDS = Object.freeze(['over', 'multiply', 'screen', 'darken', 'lighten'])

// OOXML theme colour scheme slots. These are not a gallery preset: each slot
// is an independently authorable semantic colour role, and null/omission
// restores the generated World/default value for that role.
export const THEME_COLOR_SCHEME_SLOTS = Object.freeze([
	'dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink',
])

export const THEME_COLOR_SCHEME_PARAMETERS = Object.freeze(THEME_COLOR_SCHEME_SLOTS.map(slot => Object.freeze({
	id: slot,
	type: 'color',
	valueType: 'hex',
	semanticPath: `theme.colorScheme.${slot}`,
	serializer: `ppt/theme/theme1.xml a:clrScheme/a:${slot}`,
	reset: `set theme.colorScheme.${slot} to null or omit it to restore the resolved World/default slot`,
	capabilityMode: 'parameterized',
	capabilityStatus: 'executable-exact-structured',
})))

// Native placeholder variants are small semantic records rather than opaque
// gallery selectors.  A binding may name a master placeholder (`name`) and
// independently carry the Office placeholder type/index/size/orientation and
// custom-prompt flag used when the slide object is materialized.  The compiler
// accepts the short string form as a convenience and normalizes it to the same
// native carrier.  The list mirrors PresentationML ST_PlaceholderType rather
// than the smaller historical PptxGenJS PlaceholderProps union.
export const NATIVE_PLACEHOLDER_TYPES = Object.freeze([
	'title', 'body', 'ctrTitle', 'subTitle', 'obj', 'pic', 'chart', 'tbl', 'clipArt', 'dgm', 'media', 'dt', 'ftr', 'sldNum', 'hdr', 'sldImg',
])
export const MAX_NATIVE_PLACEHOLDER_INDEX = 4294967295
export const NATIVE_PLACEHOLDER_SIZES = Object.freeze(['full', 'half', 'quarter'])
export const NATIVE_PLACEHOLDER_ORIENTATIONS = Object.freeze(['horz', 'vert'])
export const NATIVE_PLACEHOLDER_VARIANT_PARAMETERS = Object.freeze([
	{ id: 'layout.placeholderVariants', type: 'structured', valueType: 'placeholder-definition-array(type,idx,size,orient,hasCustomPrompt,bounds,margin,text)', semanticPath: 'layouts[].placeholders[]', serializer: 'native ppt/slideLayouts/slideLayoutN.xml p:ph carrier', reset: 'set layouts[].placeholders to null or [] to restore the native/template placeholder set', capabilityMode: 'parameterized', capabilityStatus: 'structured-partial' },
	{ id: 'master.placeholderVariants', type: 'structured', valueType: 'placeholder-definition-array(type,idx,size,orient,hasCustomPrompt,bounds,margin,text)', semanticPath: 'masters[].placeholders[]', serializer: 'native slide-master p:ph contract', reset: 'set masters[].placeholders to null or [] to remove authored master placeholders', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'layoutContract.placeholderBindings', type: 'structured', valueType: 'placeholder-binding-map(type,idx,size,orient,hasCustomPrompt)', semanticPath: 'layoutContract.placeholderBindings', serializer: 'native semantic-role placeholder binding policy', reset: 'set placeholderBindings to null or omit it to restore native placeholder matching', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
])

// Theme, master, layout, and placeholder inheritance is a second authoring
// surface beside the visual fill/effect families.  Keep the native selectors
// and the independently resettable leaves visible so a client can reproduce
// a template contract without treating a gallery/layout name as a black box.
export const THEME_LAYOUT_INHERITANCE_PARAMETERS = Object.freeze([
	{ id: 'theme.fontFace', type: 'structured', valueType: 'font-family', semanticPath: 'theme.fontFace', serializer: 'native ppt/theme/theme1.xml majorFont/minorFont', reset: 'set theme.fontFace to null or omit it to restore the default theme font', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'theme.headFontFace', type: 'structured', valueType: 'font-family', semanticPath: 'theme.headFontFace', serializer: 'native ppt/theme/theme1.xml majorFont', reset: 'set theme.headFontFace to null or omit it to inherit theme.fontFace/default', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'theme.bodyFontFace', type: 'structured', valueType: 'font-family', semanticPath: 'theme.bodyFontFace', serializer: 'native ppt/theme/theme1.xml minorFont', reset: 'set theme.bodyFontFace to null or omit it to inherit theme.fontFace/default', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'theme.lang', type: 'structured', valueType: 'BCP-47', semanticPath: 'theme.lang', serializer: 'native theme language metadata', reset: 'set theme.lang to null or omit it to restore the host/default language', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'layout.name', type: 'discrete', valueType: 'string', semanticPath: 'layouts[].name', serializer: 'native presentation layout registry', reset: 'omit the custom layout or select a standard layout', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'layout.width', type: 'continuous', valueType: 'number', minimum: 0.001, maximum: 56, default: 13.333, step: 0.000001, unit: 'inches', semanticPath: 'layouts[].width', serializer: 'native presentation slide size', reset: 'omit width or remove the custom layout to restore the selected standard size', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'layout.height', type: 'continuous', valueType: 'number', minimum: 0.001, maximum: 56, default: 7.5, step: 0.000001, unit: 'inches', semanticPath: 'layouts[].height', serializer: 'native presentation slide size', reset: 'omit height or remove the custom layout to restore the selected standard size', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'layout.type', type: 'discrete', valueType: 'string', semanticPath: 'layouts[].type', serializer: 'native presentation layout type metadata', reset: 'set layout.type to null or omit it to restore native/default type metadata', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'layout.activate', type: 'discrete', valueType: 'boolean', default: true, semanticPath: 'layouts[].activate', serializer: 'native active presentation layout selection', reset: 'set activate:false or omit the entry to leave the current layout active', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'layout.placeholders', type: 'structured', valueType: 'placeholder-definition-array', semanticPath: 'layouts[].placeholders[]', serializer: 'native ppt/slideLayouts/slideLayoutN.xml placeholder carrier', reset: 'set layouts[].placeholders to null or [] to remove authored layout placeholders', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'layout.objects', type: 'structured', valueType: 'native-object-array', semanticPath: 'layouts[].objects[]', serializer: 'native editable objects owned by the slideLayout part', reset: 'set layouts[].objects to null or [] to remove authored layout objects', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'layout.background', type: 'structured', valueType: 'fill', semanticPath: 'layouts[].background', serializer: 'native slideLayout background fill', reset: 'set layouts[].background to null to restore master/theme background inheritance', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'layout.margin', type: 'structured', valueType: 'number|array|object', semanticPath: 'layouts[].margin', serializer: 'native slideLayout content margin contract', reset: 'set layouts[].margin to null or omit it to restore the default margin', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'layout.slideNumber', type: 'structured', valueType: 'object', semanticPath: 'layouts[].slideNumber', serializer: 'native slideLayout slide-number field', reset: 'set layouts[].slideNumber to null or omit it to remove the authored number field', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'layout.headerFooter', type: 'structured', valueType: 'object(date,header,footer,slideNumber)', semanticPath: 'layouts[].headerFooter', serializer: 'native slideLayout p:hf visibility policy', reset: 'set layouts[].headerFooter to null or omit it to restore inherited master visibility', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'slide.layoutName', type: 'discrete', valueType: 'string', semanticPath: 'slides[].layoutName', serializer: 'native p:sldLayout relationship', reset: 'set slides[].layoutName to null or omit it to use the deck/default layout', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'slide.masterName', type: 'discrete', valueType: 'string', semanticPath: 'slides[].masterName', serializer: 'native slide-master binding', reset: 'set slides[].masterName to null or omit it to use the selected layout master', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'slide.hidden', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'slides[].hidden', serializer: 'native p:sld@show', reset: 'set slides[].hidden to null or false to show the slide', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'slide.slideNumber', type: 'structured', valueType: 'object', semanticPath: 'slides[].slideNumber', serializer: 'native slide-number field', reset: 'set slides[].slideNumber to null or omit it to remove the authored number field', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'slide.showMasterShapes', type: 'discrete', valueType: 'boolean', default: true, semanticPath: 'slides[].showMasterShapes', serializer: 'native p:sld@showMasterSp', reset: 'set slides[].showMasterShapes to null or true to restore master shapes', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'slide.showMasterBackground', type: 'discrete', valueType: 'boolean', default: true, semanticPath: 'slides[].showMasterBackground', serializer: 'native p:sld@showMasterSp (PowerPoint Hide Background Graphics alias)', reset: 'set slides[].showMasterBackground to null or true to restore master background graphics', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'slide.showMasterPhAnim', type: 'discrete', valueType: 'boolean', default: true, semanticPath: 'slides[].showMasterPhAnim', serializer: 'native p:sld@showMasterPhAnim', reset: 'set slides[].showMasterPhAnim to null or true to restore master placeholder animation visibility', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'master.title', type: 'structured', valueType: 'string', semanticPath: 'masters[].title', serializer: 'native p:sldMaster/p:cSld/@name', reset: 'remove the master definition or omit its title', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'master.background', type: 'structured', valueType: 'fill', semanticPath: 'masters[].background', serializer: 'native master background fill', reset: 'set masters[].background to null to restore theme/background inheritance', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'master.margin', type: 'structured', valueType: 'number|array|object', semanticPath: 'masters[].margin', serializer: 'native master content margin contract', reset: 'set masters[].margin to null or omit it to restore the default margin', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'master.slideNumber', type: 'structured', valueType: 'object', semanticPath: 'masters[].slideNumber', serializer: 'native master slide-number field', reset: 'set masters[].slideNumber to null or omit it to remove the authored number field', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'master.headerFooter', type: 'structured', valueType: 'object(date,header,footer,slideNumber)', semanticPath: 'masters[].headerFooter', serializer: 'native slideMaster p:hf visibility policy', reset: 'set masters[].headerFooter to null or omit it to restore host/default visibility', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'master.objects', type: 'structured', valueType: 'native-object-array', semanticPath: 'masters[].objects[]', serializer: 'native master-owned editable objects', reset: 'set masters[].objects to [] or null to remove authored master objects', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'layoutContract.allowedLayouts', type: 'structured', valueType: 'string-array', semanticPath: 'layoutContract.allowedLayouts', serializer: 'native layout policy validator', reset: 'set allowedLayouts to null or omit it to allow the native/default layout set', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'layoutContract.defaultLayout', type: 'discrete', valueType: 'string', semanticPath: 'layoutContract.defaultLayout', serializer: 'native layout policy default', reset: 'set defaultLayout to null or omit it to restore the first/native layout', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'layoutContract.strictLayout', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'layoutContract.strictLayout', serializer: 'native layout policy enforcement', reset: 'set strictLayout to null or false to restore permissive layout selection', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	...NATIVE_PLACEHOLDER_VARIANT_PARAMETERS,
	{ id: 'layoutContract.safeContentAreas', type: 'structured', valueType: 'bbox-array', semanticPath: 'layoutContract.safeContentAreas[]', serializer: 'native safe-area policy/readback', reset: 'set safeContentAreas to null or omit it to restore the engine safe-area defaults', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
])

// The public shape/connector line vocabulary is deliberately the union of
// fields the native object model can serialize today. Arrow size is not
// included until the library owns the full headEnd/tailEnd size contract.
export const SHAPE_LINE_DASH_TYPES = Object.freeze(['solid', 'dash', 'dashDot', 'lgDash', 'lgDashDot', 'lgDashDotDot', 'sysDash', 'sysDot'])
export const SHAPE_LINE_ARROW_TYPES = Object.freeze(['none', 'arrow', 'diamond', 'oval', 'stealth', 'triangle'])
export const SHAPE_LINE_ARROW_SIZE_VALUES = Object.freeze(['sm', 'med', 'lg'])

export const ARTISTIC_EFFECTS = Object.freeze([
	'blur', 'brightnessContrast', 'cement', 'chalkSketch', 'crisscrossEtching',
	'cutout', 'filmGrain', 'glass', 'glowDiffused', 'glowEdges', 'lightScreen', 'lineDrawing',
	'marker', 'mosaicBubbles', 'paintBrush', 'paintStrokes', 'pastelsSmooth', 'pencilGrayscale',
	'pencilSketch', 'photocopy', 'plasticWrap', 'texturizer',
	'watercolorSponge',
])

const artisticParameter = (id, minimum, maximum, defaultValue, unit, ooxmlAttribute, aliases = []) => Object.freeze({
	id, type: 'continuous', valueType: 'number', minimum, maximum, default: defaultValue,
	step: unit === 'normalized' ? 0.00001 : 1, unit,
	ooxmlAttribute, aliases, capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured',
})
const artisticTransparency = defaultValue => artisticParameter('transparency', 0, 1, defaultValue, 'normalized', 'trans', ['trans'])

export const ARTISTIC_EFFECT_PARAMETER_CATALOG = Object.freeze({
	blur: Object.freeze([artisticParameter('radius', 0, 100, 10, 'points', 'radius', ['radiusPt'])]),
	brightnessContrast: Object.freeze([
		artisticParameter('brightness', -1, 1, 0, 'normalized', 'bright', ['bright']),
		artisticParameter('contrast', -1, 1, 0, 'normalized', 'contrast'),
	]),
	cement: Object.freeze([artisticTransparency(0), artisticParameter('crackSpacing', 0, 100, 24, 'integer', 'crackSpacing')]),
	chalkSketch: Object.freeze([artisticTransparency(0), artisticParameter('pressure', 0, 4, 0, 'integer', 'pressure')]),
	crisscrossEtching: Object.freeze([artisticTransparency(0.75), artisticParameter('pressure', 0, 100, 30, 'integer', 'pressure')]),
	cutout: Object.freeze([artisticTransparency(0), artisticParameter('numberOfShades', 0, 6, 2, 'integer', 'numberOfShades', ['shades'])]),
	filmGrain: Object.freeze([artisticTransparency(0), artisticParameter('grainSize', 0, 100, 40, 'integer', 'grainSize')]),
	glass: Object.freeze([artisticTransparency(0), artisticParameter('scaling', 0, 100, 34, 'integer', 'scaling')]),
	glowDiffused: Object.freeze([artisticTransparency(0), artisticParameter('intensity', 0, 10, 5, 'integer', 'intensity')]),
	glowEdges: Object.freeze([artisticTransparency(0.15), artisticParameter('smoothness', 0, 10, 3, 'integer', 'smoothness')]),
	lightScreen: Object.freeze([artisticTransparency(0), artisticParameter('gridSize', 0, 10, 4, 'integer', 'gridSize')]),
	lineDrawing: Object.freeze([artisticTransparency(0.25), artisticParameter('pencilSize', 0, 100, 0, 'integer', 'pencilSize')]),
	marker: Object.freeze([artisticTransparency(0), artisticParameter('size', 0, 100, 97, 'integer', 'size')]),
	mosaicBubbles: Object.freeze([artisticTransparency(0), artisticParameter('pressure', 0, 100, 14, 'integer', 'pressure')]),
	paintBrush: Object.freeze([artisticTransparency(0), artisticParameter('brushSize', 0, 10, 2, 'integer', 'brushSize')]),
	paintStrokes: Object.freeze([artisticTransparency(0), artisticParameter('intensity', 0, 10, 5, 'integer', 'intensity')]),
	pastelsSmooth: Object.freeze([artisticTransparency(0), artisticParameter('scaling', 0, 100, 34, 'integer', 'scaling')]),
	pencilGrayscale: Object.freeze([artisticTransparency(0), artisticParameter('pencilSize', 0, 100, 27, 'integer', 'pencilSize')]),
	pencilSketch: Object.freeze([artisticTransparency(0), artisticParameter('pressure', 0, 100, 22, 'integer', 'pressure')]),
	photocopy: Object.freeze([artisticTransparency(0.3), artisticParameter('detail', 0, 10, 3, 'integer', 'detail')]),
	plasticWrap: Object.freeze([artisticTransparency(0), artisticParameter('smoothness', 0, 10, 5, 'integer', 'smoothness')]),
	texturizer: Object.freeze([artisticTransparency(0), artisticParameter('scaling', 0, 100, 34, 'integer', 'scaling')]),
	watercolorSponge: Object.freeze([artisticTransparency(0), artisticParameter('brushSize', 0, 10, 2, 'integer', 'brushSize')]),
})

const RESET_NOT_PUBLIC = Object.freeze({ component: 'not-public', full: 'not-public', nullBehavior: 'not-defined' })
const RESET_NOT_APPLICABLE = Object.freeze({ component: 'not-applicable', full: 'not-applicable', nullBehavior: 'not-applicable' })
const RESET_EFFECT_COMPONENT = Object.freeze({ component: 'set the named structured effect field to null', full: 'set effects to [] or null', nullBehavior: 'remove the structured component' })
const RESET_EFFECT_LIST = Object.freeze({ component: 'set one structured effect field to null', full: 'set effects to [] or null', nullBehavior: 'remove the selected component or complete structured list' })

// `effects[]` is the public combination surface for native effectLst. Keep
// every leaf visible in the catalog even though the compiler lowers the array
// to the same typed fields used by the individual shadow/glow/reflection/etc.
// surfaces. Duplicate effect types intentionally collapse to one component;
// arbitrary graph/order semantics belong to the preserve-only effectDag lane.
const EFFECT_LIST_PARAMETERS = Object.freeze([
	{ id: 'shadow.type', type: 'discrete', valueType: 'enum', values: ['outer', 'inner', 'none'], semanticPath: 'style.effects[].type', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'shadow.color', type: 'color', valueType: 'hex', semanticPath: 'style.effects[].color', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'shadow.opacity', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0.4, step: 0.00001, unit: 'normalized', semanticPath: 'style.effects[].opacity', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'shadow.blurPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 4, step: 1 / 12700, unit: 'points', semanticPath: 'style.effects[].blurPt', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'shadow.distancePt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 200, default: 3, step: 1 / 12700, unit: 'points', semanticPath: 'style.effects[].distancePt', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'shadow.angleDeg', type: 'continuous', valueType: 'number', minimum: 0, maximum: 359, default: 45, step: 1 / 60000, unit: 'degrees', semanticPath: 'style.effects[].angleDeg', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'shadow.scaleX', type: 'continuous', valueType: 'number', minimum: 0, maximum: 2, default: 1, step: 0.00001, unit: 'multiplier', semanticPath: 'style.effects[].scaleX', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'shadow.scaleY', type: 'continuous', valueType: 'number', minimum: 0, maximum: 2, default: 1, step: 0.00001, unit: 'multiplier', semanticPath: 'style.effects[].scaleY', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'shadow.skewXDeg', type: 'continuous', valueType: 'number', minimum: -90, maximum: 90, minimumExclusive: true, maximumExclusive: true, default: 0, step: 1 / 60000, unit: 'degrees', semanticPath: 'style.effects[].skewXDeg', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'shadow.skewYDeg', type: 'continuous', valueType: 'number', minimum: -90, maximum: 90, minimumExclusive: true, maximumExclusive: true, default: 0, step: 1 / 60000, unit: 'degrees', semanticPath: 'style.effects[].skewYDeg', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'shadow.rotateWithShape', type: 'discrete', valueType: 'boolean', values: [false, true], default: false, semanticPath: 'style.effects[].rotateWithShape', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'glow.color', type: 'color', valueType: 'hex', semanticPath: 'style.effects[].color', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'glow.opacity', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0.75, step: 0.00001, unit: 'normalized', semanticPath: 'style.effects[].opacity', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'glow.radiusPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 8, step: 1 / 12700, unit: 'points', semanticPath: 'style.effects[].radiusPt', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'reflection.blurPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 0, step: 1 / 12700, unit: 'points', semanticPath: 'style.effects[].blurPt', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'reflection.distancePt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 200, default: 0, step: 1 / 12700, unit: 'points', semanticPath: 'style.effects[].distancePt', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'reflection.directionDeg', type: 'continuous', valueType: 'number', minimum: 0, maximum: 359, default: 90, step: 1 / 60000, unit: 'degrees', semanticPath: 'style.effects[].directionDeg', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'reflection.startOpacity', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0.5, step: 0.00001, unit: 'normalized', semanticPath: 'style.effects[].startOpacity', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'reflection.endOpacity', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0, step: 0.00001, unit: 'normalized', semanticPath: 'style.effects[].endOpacity', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'reflection.startPosition', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0, step: 0.01, unit: 'normalized', semanticPath: 'style.effects[].startPosition', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'reflection.endPosition', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0.55, step: 0.01, unit: 'normalized', semanticPath: 'style.effects[].endPosition', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'reflection.scaleY', type: 'continuous', valueType: 'number', minimum: -1000, maximum: 1000, default: -100, step: 0.1, unit: 'percent', semanticPath: 'style.effects[].scaleY', serializer: 'generated XML a:reflection/@sy = round(scaleY * 1000)', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'softEdge.radiusPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 8, step: 1 / 12700, unit: 'points', semanticPath: 'style.effects[].radiusPt', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'blur.radiusPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 8, step: 1 / 12700, unit: 'points', semanticPath: 'style.effects[].radiusPt', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'blur.growBounds', type: 'discrete', valueType: 'boolean', values: [false, true], default: true, semanticPath: 'style.effects[].growBounds', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'fillOverlay.blendMode', type: 'discrete', valueType: 'enum', values: [...FILL_OVERLAY_BLENDS], default: 'multiply', semanticPath: 'style.effects[].blendMode', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'fillOverlay.color', type: 'color', valueType: 'hex', semanticPath: 'style.effects[].fill.color', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'fillOverlay.transparency', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0, step: 0.00001, unit: 'normalized', semanticPath: 'style.effects[].fill.transparency', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
])
const RESET_PICTURE_COLOR = Object.freeze({ component: 'set recolor or duotone to null, or set colorMode to normal', full: 'set imageAdjustments to null', nullBehavior: 'remove the structured picture-color mapping' })
const RESET_IMAGE_ADJUSTMENTS = Object.freeze({ component: 'set the named imageAdjustments field to null', full: 'set imageAdjustments to null', nullBehavior: 'remove that structured picture adjustment or the complete adjustment surface' })
// Exact editable native precision for the Picture Format correction leaves.
// These are serializer steps (not a claim about the number of mouse pixels in
// a particular Office UI build): DrawingML stores lum/sat at 1e-5, colorTemp
// as an integer Kelvin value, and transparency as 0.001 percentage points.
export const PICTURE_CORRECTION_PARAMETERS = Object.freeze({
	brightness: Object.freeze({ minimum: -1, maximum: 1, default: 0, step: 0.00001, unit: 'normalized' }),
	contrast: Object.freeze({ minimum: -1, maximum: 1, default: 0, step: 0.00001, unit: 'normalized' }),
	sharpness: Object.freeze({ minimum: -1, maximum: 1, default: 0, step: 0.00001, unit: 'normalized' }),
	saturation: Object.freeze({ minimum: 0, maximum: 4, default: 1, step: 0.00001, unit: 'multiplier' }),
	temperature: Object.freeze({ minimum: 1500, maximum: 11500, default: 6500, step: 1, unit: 'kelvin' }),
	transparency: Object.freeze({ minimum: 0, maximum: 100, default: 0, step: 0.001, unit: 'percent' }),
})
export const PICTURE_COLOR_SCHEMES = Object.freeze([
	'tx1', 'tx2', 'bg1', 'bg2', 'dk1', 'lt1', 'dk2', 'lt2',
	'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6',
	'hlink', 'folHlink', 'phClr',
])
// DrawingML color transforms are serialized at 1e-5 precision. Keeping the
// endpoint leaves typed here prevents a recolor preset from hiding its actual
// tint, shade, saturation, or opacity controls.
export const PICTURE_COLOR_ENDPOINT_PARAMETERS = Object.freeze({
	tint: Object.freeze({ minimum: 0, maximum: 1, default: 0, step: 0.00001, unit: 'normalized' }),
	shade: Object.freeze({ minimum: 0, maximum: 1, default: 0, step: 0.00001, unit: 'normalized' }),
	saturation: Object.freeze({ minimum: 0, maximum: 4, default: 1, step: 0.00001, unit: 'multiplier' }),
	opacity: Object.freeze({ minimum: 0, maximum: 1, default: 1, step: 0.00001, unit: 'normalized' }),
})
export const RESET_3D_COMPONENT = Object.freeze({ component: 'set the named text3D/effect3D component to null', full: 'set text3D or effect3D to null', nullBehavior: 'remove the structured 3-D component and restore the PowerPoint default' })
export const RESET_FILL_COMPONENT = Object.freeze({ component: 'set style.fill or slides[].background to null, or replace the selected fill component', full: 'set the complete fill/background to null or type:none', nullBehavior: 'remove the authored fill and restore the native/theme default; a gradient stop array is replaced atomically when edited' })
const RESET_TEXT_FILL_COMPONENT = Object.freeze({ component: 'set options.textFill or style.textFill to null, or set its named leaf to null', full: 'set the complete textFill component to null', nullBehavior: 'remove the authored text-run fill and restore the theme/default text color' })
const RESET_TEXT_OUTLINE_COMPONENT = Object.freeze({ component: 'set options.textOutline or style.textOutline to null, or set its named leaf to null', full: 'set the complete textOutline component to null', nullBehavior: 'remove the authored text-run outline and restore the native/default glyph stroke' })
const RESET_TEXT_CHARACTER_SPACING_COMPONENT = Object.freeze({ component: 'set options.charSpacing or style.charSpacing to null', full: 'set charSpacing to null or omit it', nullBehavior: 'remove the authored a:rPr/@spc character-spacing override and restore native/default tracking' })
const RESET_TEXT_LINE_SPACING_COMPONENT = Object.freeze({ component: 'set options.lineSpacing and options.lineSpacingMultiple to null', full: 'set both line-spacing fields to null or omit them', nullBehavior: 'remove authored a:lnSpc and restore native/default paragraph leading' })
const RESET_TEXT_PARAGRAPH_SPACING_COMPONENT = Object.freeze({ component: 'set options.paraSpaceBefore or options.paraSpaceAfter to null', full: 'set both paragraph-spacing fields to null or omit them', nullBehavior: 'remove the authored a:spcBef/a:spcAft leaf and restore native/default paragraph spacing' })
const RESET_TEXT_PARAGRAPH_INDENT_COMPONENT = Object.freeze({ component: 'set options.indent, options.hanging, options.indentLevel, or options.bullet to null', full: 'set the paragraph geometry fields to null or omit them', nullBehavior: 'remove the authored paragraph margins/level/bullet and restore the native/default paragraph geometry' })
const RESET_TEXT_TABS_RICH_RUN_COMPONENT = Object.freeze({ component: 'set options.tabStops or a run option to null', full: 'set tabStops to null and run strike/highlight/superscript/subscript to null or omit them', nullBehavior: 'remove the authored tab list or run-level formatting and restore native/default text formatting' })

const FILL_GRADIENT_STOP_PARAMETERS = Object.freeze([
	{ id: 'gradientStopPosition', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 'index-derived: first stop 0%, last stop 100%, evenly spaced when omitted', step: 0.001, unit: 'percent', semanticPath: 'style.fill.gradientStops[].position', serializer: 'generated XML a:gradFill/a:gsLst/a:gs/@pos = round(position * 1000)', reset: 'replace the gradientStops array; omitted position is derived from array order only when the native serializer receives an incomplete stop', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'gradientStopColor', type: 'color', valueType: 'hex|scheme|preset', semanticPath: 'style.fill.gradientStops[].color', serializer: 'generated XML a:gradFill/a:gsLst/a:gs/a:srgbClr|a:schemeClr|a:prstClr', reset: 'replace the addressed gradient stop or replace the gradientStops array', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'gradientStopColor.tint', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0, step: 0.00001, unit: 'normalized', semanticPath: 'style.fill.gradientStops[].color.tint', serializer: 'generated XML gradient-stop color/a:tint/@val = round(tint * 100000)', reset: 'set the addressed stop colour tint to null or replace the gradientStops array', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'gradientStopColor.shade', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0, step: 0.00001, unit: 'normalized', semanticPath: 'style.fill.gradientStops[].color.shade', serializer: 'generated XML gradient-stop color/a:shade/@val = round(shade * 100000)', reset: 'set the addressed stop colour shade to null or replace the gradientStops array', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'gradientStopColor.saturation', type: 'continuous', valueType: 'number', minimum: 0, maximum: 4, default: 1, step: 0.00001, unit: 'multiplier', semanticPath: 'style.fill.gradientStops[].color.saturation', serializer: 'generated XML gradient-stop color/a:satMod/@val = round(saturation * 100000)', reset: 'set the addressed stop colour saturation to null or replace the gradientStops array', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'gradientStopColor.luminance', type: 'continuous', valueType: 'number', minimum: 0, maximum: 4, default: 1, step: 0.00001, unit: 'multiplier', semanticPath: 'style.fill.gradientStops[].color.luminance', serializer: 'generated XML gradient-stop color/a:lumMod/@val = round(luminance * 100000)', reset: 'set the addressed stop colour luminance to null or replace the gradientStops array', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'gradientStopColor.luminanceOffset', type: 'continuous', valueType: 'number', minimum: -1, maximum: 1, default: 0, step: 0.00001, unit: 'normalized', semanticPath: 'style.fill.gradientStops[].color.luminanceOffset', serializer: 'generated XML gradient-stop color/a:lumOff/@val = round(luminanceOffset * 100000)', reset: 'set the addressed stop colour luminance offset to null or replace the gradientStops array', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'gradientStopColor.opacity', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 1, step: 0.00001, unit: 'normalized', semanticPath: 'style.fill.gradientStops[].color.opacity', serializer: 'generated XML gradient-stop color/a:alpha/@val = round(opacity * 100000)', reset: 'set the addressed stop colour opacity to null or replace the gradientStops array', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'gradientStopTransparency', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 0, step: 0.001, unit: 'percent', semanticPath: 'style.fill.gradientStops[].transparency', serializer: 'generated XML a:gradFill/a:gsLst/a:gs/*/a:alpha/@val = round((100 - transparency) * 1000)', reset: 'set the stop transparency to 0 or replace the addressed stop; null removes the authored alpha child', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
])

// A slide background is not limited to a gallery gradient/pattern selector.
// The Format Background pane also exposes the fill carrier itself: the
// solid/none choice, its colour, and its transparency. Keep those leaves in
// the same typed contract as the gradient geometry so a preset cannot hide
// the basic background controls from a public client.
const FILL_CORE_PARAMETERS = Object.freeze([
	{ id: 'fillType', type: 'discrete', valueType: 'enum', canonical: ['none', 'solid', 'gradient', 'pattern', 'texture', 'picture'], default: 'solid', semanticPath: 'style.fill.type', serializer: 'generated XML a:noFill|a:solidFill|a:gradFill|a:pattFill|a:blipFill', reset: 'set fill.type to null or remove the fill component to restore the native/theme default', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'fillColor', type: 'color', valueType: 'hex', semanticPath: 'style.fill.color', serializer: 'generated XML a:solidFill/* color carrier', reset: 'set fill.color to null or remove the solid fill component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'fillTransparency', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 0, step: 0.001, unit: 'percent', semanticPath: 'style.fill.transparency', serializer: 'generated XML a:solidFill/*/a:alpha/@val = round((100 - transparency) * 1000)', reset: 'set fill.transparency to null or remove the alpha child; null restores opaque/native default', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
])

const FILL_GRADIENT_GEOMETRY_PARAMETERS = Object.freeze([
	{ id: 'gradientDirection', type: 'discrete', valueType: 'enum', canonical: ['linear', 'circle', 'rect', 'shape'], aliases: { radial: 'circle' }, default: 'linear', semanticPath: 'style.fill.gradientDirection', serializer: 'generated XML a:lin for linear or a:path/@path for circle|rect|shape', reset: 'set gradientDirection to null or replace the fill component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'gradientAngle', type: 'continuous', valueType: 'number', minimum: 0, maximum: 360, default: 0, step: 0.001, unit: 'degrees', semanticPath: 'style.fill.gradientAngle', applicability: ['linear'], serializer: 'generated XML a:gradFill/a:lin/@ang = round(angle * 60000)', reset: 'set gradientAngle to null or replace the fill component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'gradientFlip', type: 'discrete', valueType: 'enum', canonical: ['none', 'x', 'y', 'xy'], default: 'none', semanticPath: 'style.fill.gradientFlip', serializer: 'generated XML a:gradFill/@flip', reset: 'set gradientFlip to null or replace the fill component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'rotateGradientWithShape', type: 'discrete', valueType: 'boolean', default: true, semanticPath: 'style.fill.rotateGradientWithShape', serializer: 'generated XML a:gradFill/@rotWithShape = 1|0', reset: 'set rotateGradientWithShape to null to restore the native default true or replace the fill component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	...['fillToRect', 'tileRect'].flatMap(rectName => ['l', 't', 'r', 'b'].map(leaf => ({
		id: `${rectName}.${leaf}`,
		type: 'continuous',
		valueType: 'number',
		minimum: 0,
		maximum: 100,
		default: 0,
		step: 0.001,
		unit: 'percent',
		semanticPath: `style.fill.${rectName}.${leaf}`,
		applicability: rectName === 'fillToRect' ? ['circle', 'rect', 'shape'] : ['linear', 'circle', 'rect', 'shape'],
		serializer: `generated XML a:gradFill/${rectName === 'fillToRect' ? 'a:path/a:fillToRect' : 'a:tileRect'} @${leaf} = round(value * 1000)`,
		reset: `set ${rectName}.${leaf} to null or replace the ${rectName} object`,
		capabilityMode: 'parameterized',
		capabilityStatus: 'executable-exact-structured',
	}))),
])

const PATTERN_PARAMETERS = Object.freeze([
	{ id: 'patternPreset', type: 'discrete', valueType: 'enum', canonical: [...PATTERN_PRESETS], default: 'pct20', semanticPath: 'style.fill.pattern.preset', serializer: 'generated XML a:pattFill/@prst', reset: 'set pattern to null or replace the fill component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'patternForeground', type: 'color', valueType: 'hex', default: 'FFFFFF', semanticPath: 'style.fill.pattern.foreground', serializer: 'generated XML a:pattFill/a:fgClr', reset: 'set foreground to null or replace the pattern component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'patternBackground', type: 'color', valueType: 'hex', default: '000000', semanticPath: 'style.fill.pattern.background', serializer: 'generated XML a:pattFill/a:bgClr', reset: 'set background to null or replace the pattern component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
])

const TEXTURE_PARAMETERS = Object.freeze([
	{ id: 'textureMode', type: 'discrete', valueType: 'enum', canonical: ['tile', 'stretch'], default: 'tile', semanticPath: 'style.fill.texture.placement.mode', serializer: 'generated XML a:tile versus a:stretch', reset: 'set mode to null or replace the placement component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'textureScaleX', type: 'continuous', valueType: 'number', minimum: 0, maximum: 2, default: 1, step: 0.00001, unit: 'multiplier', semanticPath: 'style.fill.texture.placement.scaleX', serializer: 'generated XML a:tile/@sx = round(scaleX * 100000)', reset: 'set scaleX to null or replace the placement component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'textureScaleY', type: 'continuous', valueType: 'number', minimum: 0, maximum: 2, default: 1, step: 0.00001, unit: 'multiplier', semanticPath: 'style.fill.texture.placement.scaleY', serializer: 'generated XML a:tile/@sy = round(scaleY * 100000)', reset: 'set scaleY to null or replace the placement component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'textureOffsetX', type: 'continuous', valueType: 'number', minimum: -100, maximum: 100, default: 0, step: 0.0001, unit: 'inches', semanticPath: 'style.fill.texture.placement.offsetX', serializer: 'generated XML a:tile/@tx = inches * 914400', reset: 'set offsetX to null or replace the placement component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'textureOffsetY', type: 'continuous', valueType: 'number', minimum: -100, maximum: 100, default: 0, step: 0.0001, unit: 'inches', semanticPath: 'style.fill.texture.placement.offsetY', serializer: 'generated XML a:tile/@ty = inches * 914400', reset: 'set offsetY to null or replace the placement component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'textureAlignment', type: 'discrete', valueType: 'enum', canonical: ['tl', 't', 'tr', 'l', 'ctr', 'r', 'bl', 'b', 'br'], default: 'ctr', semanticPath: 'style.fill.texture.placement.alignment', serializer: 'generated XML a:tile/@algn', reset: 'set alignment to null or replace the placement component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'textureFlip', type: 'discrete', valueType: 'enum', canonical: ['none', 'x', 'y', 'xy'], default: 'none', semanticPath: 'style.fill.texture.placement.flip', serializer: 'generated XML a:tile/@flip', reset: 'set flip to null or replace the placement component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'textureRotateWithShape', type: 'discrete', valueType: 'boolean', default: true, semanticPath: 'style.fill.texture.placement.rotateWithShape', serializer: 'generated XML a:blipFill/@rotWithShape = 1|0', reset: 'set rotateWithShape to null to restore native default true or replace the placement component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
	{ id: 'textureTransparency', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 0, step: 0.001, unit: 'percent', semanticPath: 'style.fill.texture.transparency', serializer: 'generated XML a:blip/a:alpha/@val = round((100 - transparency) * 1000)', reset: 'set transparency to 0 or replace the texture component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
])

const VISUAL_TRUTH = Object.freeze({
	shadow: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['effect.shadow'], overrideFields: ['color', 'opacity', 'blurPt', 'distancePt', 'angleDeg', 'scaleX', 'scaleY', 'skewXDeg', 'skewYDeg', 'rotateWithShape'], resetBehavior: RESET_EFFECT_COMPONENT },
	glow: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['effect.glow'], overrideFields: ['color', 'opacity', 'radiusPt'], applicability: ['shape', 'text', 'picture'], resetBehavior: RESET_EFFECT_COMPONENT },
	reflection: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['effect.reflection'], overrideFields: ['blurPt', 'distancePt', 'directionDeg', 'startOpacity', 'endOpacity', 'startPosition', 'endPosition', 'scaleY'], applicability: ['shape', 'text', 'picture'], resetBehavior: RESET_EFFECT_COMPONENT },
	softEdge: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['effect.softEdge'], overrideFields: ['radiusPt'], applicability: ['shape', 'text', 'picture'], resetBehavior: RESET_EFFECT_COMPONENT },
	blur: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['effect.blur'], overrideFields: ['radiusPt', 'growBounds'], applicability: ['shape', 'picture'], resetBehavior: RESET_EFFECT_COMPONENT },
	fillOverlay: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['effect.fillOverlay'], overrideFields: ['blendMode', 'fill'], applicability: ['shape', 'picture'], resetBehavior: RESET_EFFECT_COMPONENT },
	textFill: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['textRun.fill'], overrideFields: [...TEXT_FILL_FIELDS], applicability: ['text', 'textShape', 'wordArt', 'richTextRun', 'groupText'], resetBehavior: RESET_TEXT_FILL_COMPONENT },
	textShadow: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['textRun.effect.shadow'], overrideFields: ['type', 'color', 'opacity', 'blurPt', 'distancePt', 'angleDeg', 'scaleX', 'scaleY', 'skewXDeg', 'skewYDeg', 'rotateWithShape'], applicability: ['text', 'wordArt'], resetBehavior: RESET_EFFECT_COMPONENT },
	textOutline: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['textRun.outline'], overrideFields: ['color', 'transparency', 'widthPt'], applicability: ['text', 'wordArt'], resetBehavior: RESET_TEXT_OUTLINE_COMPONENT },
	textCharacterSpacing: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['textRun.characterSpacing'], overrideFields: ['charSpacing'], applicability: ['text', 'wordArt'], resetBehavior: RESET_TEXT_CHARACTER_SPACING_COMPONENT },
	textLineSpacing: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['textParagraph.lineSpacing'], overrideFields: ['lineSpacing', 'lineSpacingMultiple'], applicability: ['text', 'wordArt'], resetBehavior: RESET_TEXT_LINE_SPACING_COMPONENT, limitation: 'When both controls are supplied, absolute lineSpacing points takes precedence over lineSpacingMultiple, matching the native serializer.' },
	textParagraphSpacing: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['textParagraph.paragraphSpacing'], overrideFields: ['paraSpaceBefore', 'paraSpaceAfter'], applicability: ['text', 'wordArt'], resetBehavior: RESET_TEXT_PARAGRAPH_SPACING_COMPONENT },
	textParagraphIndent: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['textParagraph.margins', 'textParagraph.level', 'textParagraph.bullet'], overrideFields: ['indent', 'hanging', 'indentLevel', 'bullet'], applicability: ['text', 'wordArt'], resetBehavior: RESET_TEXT_PARAGRAPH_INDENT_COMPONENT, limitation: 'When bullet.indent is supplied it defines the bullet-to-text hanging geometry unless an explicit hanging value is supplied.' },
	textTabsRichRuns: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['textParagraph.tabStops', 'textRun.strike', 'textRun.highlight', 'textRun.baseline'], overrideFields: ['tabStops', 'strike', 'highlight', 'superscript', 'subscript'], applicability: ['text', 'wordArt'], resetBehavior: RESET_TEXT_TABS_RICH_RUN_COMPONENT },
	textBoxMargins: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['textBody.bodyPr.insets', 'textBody.bodyPr.anchor'], overrideFields: ['margin', 'valign'], applicability: ['text', 'wordArt'], resetBehavior: Object.freeze({ component: 'set options.margin or options.valign to null', full: 'set both margin and valign to null or omit them', nullBehavior: 'remove authored bodyPr inset and anchor overrides and restore native/default text-box geometry' }) },
	textBoxFitWrapDirection: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['textBody.bodyPr.autofit', 'textBody.bodyPr.wrap', 'textBody.bodyPr.vert'], overrideFields: ['fit', 'wrap', 'vert'], applicability: ['text', 'wordArt'], resetBehavior: Object.freeze({ component: 'set options.fit, options.wrap, or options.vert to null', full: 'set all three to null or omit them', nullBehavior: 'remove authored autofit child and bodyPr wrap/vert overrides and restore native/default text-box behavior' }) },
	textParagraphAlignmentDirectionLanguage: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['textParagraph.algn', 'textParagraph.rtl', 'textRun.lang'], overrideFields: ['align', 'rtlMode', 'lang'], applicability: ['text', 'wordArt'], resetBehavior: Object.freeze({ component: 'set options.align, options.rtlMode, or options.lang to null', full: 'set all three to null or omit them', nullBehavior: 'remove authored paragraph alignment/direction and run-language overrides' }) },
	textUnderline: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['textRun.underline', 'textRun.underlineColor'], overrideFields: ['underline.style', 'underline.color'], applicability: ['text', 'wordArt'], resetBehavior: Object.freeze({ component: 'set options.underline to null or false', full: 'set options.underline to null or omit it', nullBehavior: 'remove authored a:rPr underline and a:uFill overrides' }) },
	textReflection: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['textRun.effect.reflection'], overrideFields: ['blurPt', 'distancePt', 'directionDeg', 'startOpacity', 'endOpacity', 'startPosition', 'endPosition', 'scaleY'], applicability: ['text', 'wordArt'], resetBehavior: RESET_EFFECT_COMPONENT },
	objectRotation: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['shape.transform.rotation'], overrideFields: ['rotate'], applicability: ['shape', 'text', 'wordArt', 'picture', 'model3d', 'customGeometry', 'equation'], resetBehavior: Object.freeze({ component: 'set rotate to null or omit it', full: 'set rotate to null or omit it', nullBehavior: 'remove the authored a:xfrm/@rot and restore the native 0-degree orientation' }) },
	objectFlip: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['shape.transform.flipH', 'shape.transform.flipV'], overrideFields: ['flipH', 'flipV'], applicability: ['shape', 'text', 'wordArt', 'picture', 'model3d', 'customGeometry', 'equation'], resetBehavior: Object.freeze({ component: 'set flipH or flipV to null or omit that leaf', full: 'set both flipH and flipV to null or omit them', nullBehavior: 'remove the authored a:xfrm flipH/flipV attributes and restore the native false defaults' }) },
	line: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['shape.line', 'connector.line'], overrideFields: ['type', 'color', 'transparency', 'width', 'dashType', 'beginArrowType', 'endArrowType', 'beginArrowWidth', 'beginArrowLength', 'endArrowWidth', 'endArrowLength'], applicability: ['shape', 'connector'], resetBehavior: Object.freeze({ component: 'set one line or arrow-size leaf to null, or set type:none to remove the authored line component', full: 'set style.line to null or omit it', nullBehavior: 'remove the authored a:ln and restore the native/theme line behavior' }) },
	imageFraming: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['picture.blipFill.srcRect', 'picture.blipFill.stretch'], overrideFields: ['sizing.type'], applicability: ['picture', 'media'], resetBehavior: Object.freeze({ component: 'set sizing to null or omit it', full: 'set sizing to null or omit it', nullBehavior: 'remove the authored srcRect/stretch framing override and restore native fill behaviour' }) },
	effects: { capabilityMode: 'parameterized', capabilityStatus: 'structured-partial', componentOwnership: ['effectList'], overrideFields: ['shadow', 'glow', 'reflection', 'softEdge', 'blur', 'fillOverlay'], applicability: ['shape', 'text', 'picture'], limitation: 'Duplicate effect types are normalized to one component; arbitrary duplicate/order semantics remain preserve-only. Editing an imported undecomposed raw effect list promotes the list to structured ownership.', resetBehavior: RESET_EFFECT_LIST },
	effectDag: { capabilityMode: 'preserve-only', capabilityStatus: 'preserve-imported-only', componentOwnership: ['importedEffectGraph'], overrideFields: [], resetBehavior: RESET_NOT_APPLICABLE },
	fill: { capabilityMode: 'parameterized', capabilityStatus: 'structured-partial', componentOwnership: ['fill'], overrideFields: ['type', 'color', 'transparency', 'gradientDirection', 'gradientStops', 'gradientAngle', 'gradientFlip', 'rotateGradientWithShape', 'fillToRect', 'tileRect', 'pattern', 'texture'], resetBehavior: RESET_FILL_COMPONENT },
	background: { capabilityMode: 'parameterized', capabilityStatus: 'structured-partial', componentOwnership: ['slideBackground'], overrideFields: ['type', 'color', 'transparency', 'gradientDirection', 'gradientStops', 'gradientAngle', 'gradientFlip', 'rotateGradientWithShape', 'fillToRect', 'tileRect', 'pattern', 'texture'], resetBehavior: RESET_FILL_COMPONENT },
	pattern: { capabilityMode: 'preset-plus-parameters', capabilityStatus: 'executable-exact-structured', componentOwnership: ['patternPreset', 'foreground', 'background'], overrideFields: ['preset', 'foreground', 'background'], resetBehavior: RESET_FILL_COMPONENT },
	texture: { capabilityMode: 'parameterized', capabilityStatus: 'structured-partial', componentOwnership: ['textureAsset', 'texturePlacement'], overrideFields: ['source', 'placement', 'transparency', 'scaleX', 'scaleY', 'offsetX', 'offsetY', 'alignment', 'flip', 'rotateWithShape'], resetBehavior: RESET_FILL_COMPONENT },
	duotone: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['pictureColor.duotone'], overrideFields: ['dark', 'light'], applicability: ['picture'] },
	corrections: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['pictureCorrections'], overrideFields: ['brightness', 'contrast', 'sharpness', 'saturation', 'temperature', 'transparency'], applicability: ['picture'] },
	recolor: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['pictureColor'], overrideFields: ['colorMode', 'duotone', 'recolor', 'dark', 'light', 'scheme', 'tint', 'shade', 'saturation', 'opacity'], applicability: ['picture'], resetBehavior: RESET_PICTURE_COLOR },
	artisticEffect: { capabilityMode: 'preset-plus-parameters', capabilityStatus: 'executable-exact-structured', componentOwnership: ['artisticEffectType', 'artisticEffectParameters'], overrideFields: ['type', ...Object.entries(ARTISTIC_EFFECT_PARAMETER_CATALOG).flatMap(([type, parameters]) => parameters.map(parameter => `${type}.${parameter.id}`))], applicability: ['picture'], resetBehavior: RESET_EFFECT_COMPONENT },
	imageAdjustments: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['pictureCorrections', 'pictureColor', 'pictureTransparency', 'artisticEffect'], overrideFields: ['brightness', 'contrast', 'sharpness', 'saturation', 'temperature', 'transparency', 'colorMode', 'duotone', 'recolor', 'artisticEffect'], applicability: ['picture'], resetBehavior: RESET_IMAGE_ADJUSTMENTS },
	shape3D: { capabilityMode: 'parameterized', capabilityStatus: 'structured-partial', componentOwnership: ['bevel', 'bevelBottom', 'extrusion', 'extrusionColor', 'contour', 'material', 'lighting', 'lightDirection', 'rotation'], overrideFields: ['bevel', 'bevelBottom', 'extrusion', 'extrusionColor', 'contourWidth', 'contourColor', 'material', 'lightRig', 'lightDirection', 'rotationX', 'rotationY', 'rotationZ'], applicability: ['shape', 'text', 'picture'], resetBehavior: RESET_3D_COMPONENT },
	picture3D: { capabilityMode: 'parameterized', capabilityStatus: 'structured-partial', componentOwnership: ['picture3D.camera'], overrideFields: ['camera.perspectiveDeg', 'camera.rotation.xDeg', 'camera.rotation.yDeg', 'camera.rotation.zDeg'], applicability: ['picture'], limitation: 'camera.perspectiveDeg and camera.rotation.zDeg are exact structured native/Office; camera.rotation.xDeg and camera.rotation.yDeg are accepted and serialized but their independently authored Office references canonicalize most non-zero lat/lon values on retained XML, so they remain explicit Office roundtrip boundaries.' },
	atmosphere: { capabilityMode: 'parameterized', capabilityStatus: 'structured-partial', componentOwnership: ['semanticAtmosphereLayers'], overrideFields: ['layers', 'intensity', 'color', 'purpose'] },
	themeColorScheme: { capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', componentOwnership: ['theme.colorScheme'], overrideFields: THEME_COLOR_SCHEME_SLOTS.map(slot => `theme.colorScheme.${slot}`), resetBehavior: { component: 'set one theme.colorScheme slot to null or omit it', full: 'set theme.colorScheme to null or remove authored slots', nullBehavior: 'restore the resolved World/default theme slot' } },
	layoutsThemesMasters: { capabilityMode: 'parameterized', capabilityStatus: 'structured-partial', componentOwnership: ['theme', 'layouts', 'masters', 'layoutContract', 'slide.layoutName', 'slide.masterName'], overrideFields: THEME_LAYOUT_INHERITANCE_PARAMETERS.map(parameter => parameter.id), resetBehavior: { component: 'set the named theme/layout/master/policy field to null or omit it', full: 'remove the authored theme/layout/master contract', nullBehavior: 'restore native/default or inherited theme/master/layout behavior' }, limitation: 'Typed semantic controls are executable for the public spec and native deck operations. Exhaustive Office gallery/theme/master inventory and every template-specific placeholder rendering variant remain open and must be proven against the target template.' },
})

function surface(entry) {
	const truth = VISUAL_TRUTH[entry.id]
	if (!truth) throw new Error(`UNCLASSIFIED_NATIVE_VISUAL_SURFACE: ${entry.id}`)
	// Every advertised leaf must carry an explicit reset contract.  A few
	// union surfaces (effect lists, picture adjustments, 3-D controls) used to
	// rely only on their parent component reset, which made a client unable to
	// discover the null behavior of an individual slider.  Fill that omission
	// once, generically, while preserving authored per-leaf wording.
	const resetParameter = parameter => parameter?.reset
		? parameter
		: { ...parameter, reset: `set ${entry.id}.${parameter.id} to null or omit it to restore the native/default value` }
	const parameters = Array.isArray(entry.parameters)
		? entry.parameters.map(resetParameter)
		: entry.parameters && typeof entry.parameters === 'object'
			? Object.fromEntries(Object.entries(entry.parameters).map(([key, value]) => [
				key,
				Array.isArray(value) ? value.map(resetParameter) : value,
			]))
			: entry.parameters
	return Object.freeze({ resetBehavior: RESET_NOT_PUBLIC, ...truth, ...entry, ...(parameters ? { parameters } : {}) })
}

export const NATIVE_VISUAL_SURFACES = Object.freeze([
	surface({
		id: 'textFill',
		field: 'style.textFill / options.textFill / text run fill',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Text Options > Text Fill. Native editable solid, no-fill, and gradient glyph fills, independent of the text-box panel. Gradients require type:gradient and 2–32 ordered stops. No picture/raster text. The same contract applies to rich runs, WordArt, text shapes, and text inside groups.',
		schema: TEXT_FILL_PUBLIC_SCHEMA,
		parameters: [
			{ id: 'textFillType', type: 'discrete', valueType: 'enum', values: ['solid', 'none', 'gradient'], default: 'solid', semanticPath: 'options.textFill.type', reset: 'set textFill to null to restore inherited text fill; type:none explicitly hides the fill' },
			{ id: 'textFillTransparency', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 0, step: 0.001, unit: 'percent', semanticPath: 'options.textFill.transparency', serializer: 'generated XML a:rPr/a:solidFill/*/a:alpha/@val = round((100 - transparency) * 1000)', reset: 'set textFill.transparency to null or set textFill to null', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'textFillGradientStops', type: 'compound', valueType: 'array', minItems: 2, maxItems: 32, semanticPath: 'options.textFill.gradientStops', parameters: [{ id: 'position', type: 'continuous', minimum: 0, maximum: 100, step: 0.001, unit: 'percent' }, { id: 'color', type: 'color', valueType: 'hex-or-theme' }, { id: 'transparency', type: 'continuous', minimum: 0, maximum: 100, step: 0.001, unit: 'percent' }], reset: 'replace the ordered stop array, or reset textFill to null' },
			{ id: 'textFillGradientDirection', type: 'discrete', valueType: 'enum', values: ['linear', 'circle', 'rect', 'shape'], default: 'linear', semanticPath: 'options.textFill.gradientDirection' },
			{ id: 'textFillGradientAngle', type: 'continuous', valueType: 'number', minimum: 0, maximum: 360, maximumExclusive: true, step: 0.001, unit: 'degrees', applicability: ['linear'], semanticPath: 'options.textFill.gradientAngle' },
			{ id: 'textFillGradientFlip', type: 'discrete', valueType: 'enum', values: ['none', 'x', 'y', 'xy'], semanticPath: 'options.textFill.gradientFlip' },
			{ id: 'textFillRotateWithShape', type: 'discrete', valueType: 'boolean', default: true, semanticPath: 'options.textFill.rotateGradientWithShape' },
			{ id: 'textFillFocusRectangle', type: 'compound', leaves: ['l', 't', 'r', 'b'], minimum: 0, maximum: 100, step: 0.001, unit: 'percent', applicability: ['circle', 'rect', 'shape'], semanticPath: 'options.textFill.fillToRect' },
			{ id: 'textFillTileRectangle', type: 'compound', leaves: ['l', 't', 'r', 'b'], minimum: 0, maximum: 100, step: 0.001, unit: 'percent', semanticPath: 'options.textFill.tileRect' },
		],
		examples: [{ color: '38BDF8', transparency: 35.5 }, { type: 'gradient', gradientDirection: 'linear', gradientAngle: 90, gradientStops: [{ position: 0, color: 'F5FCFF' }, { position: 100, color: '63CFFF' }] }, { type: 'none' }],
	}),
	surface({
		id: 'textShadow',
		field: 'style.textShadow / options.textShadow / text run effect shadow',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Text Options > Text Effects > Shadow. Expose the complete native character-shadow controls independently from the containing shape shadow and without relying on a gallery preset.',
		schema: { type: 'outer|inner|none', color: 'hex', opacity: '0-1', blurPt: '0-100 points', distancePt: '0-200 points', angleDeg: '0-359 degrees', scaleX: '0-2', scaleY: '0-2', skewXDeg: '-90 to 90 degrees', skewYDeg: '-90 to 90 degrees', rotateWithShape: 'boolean' },
		parameters: [
			{ id: 'type', type: 'discrete', valueType: 'enum', values: ['outer', 'inner', 'none'], default: 'outer', semanticPath: 'options.textShadow.type', serializer: 'generated XML a:outerShdw/a:innerShdw', reset: 'set textShadow to null or type:none to remove the text-character shadow', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'color', type: 'color', valueType: 'hex-or-theme', semanticPath: 'options.textShadow.color', serializer: 'generated XML a:outerShdw/a:innerShdw color selection', reset: 'set textShadow.color to null or reset the complete textShadow component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'opacity', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0.5, step: 0.00001, unit: 'normalized', semanticPath: 'options.textShadow.opacity', serializer: 'generated XML shadow color alpha', reset: 'set textShadow.opacity to null or reset the complete textShadow component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'blurPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 4, step: 1 / 12700, unit: 'points', semanticPath: 'options.textShadow.blurPt', serializer: 'generated XML shadow blurRad', reset: 'set textShadow.blurPt to null or reset the complete textShadow component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'distancePt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 200, default: 3, step: 1 / 12700, unit: 'points', semanticPath: 'options.textShadow.distancePt', serializer: 'generated XML shadow dist', reset: 'set textShadow.distancePt to null or reset the complete textShadow component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'angleDeg', type: 'continuous', valueType: 'number', minimum: 0, maximum: 359, default: 45, step: 1 / 60000, unit: 'degrees', semanticPath: 'options.textShadow.angleDeg', serializer: 'generated XML shadow dir', reset: 'set textShadow.angleDeg to null or reset the complete textShadow component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'scaleX', type: 'continuous', valueType: 'number', minimum: 0, maximum: 2, default: 1, step: 0.00001, unit: 'multiplier', semanticPath: 'options.textShadow.scaleX', serializer: 'generated XML shadow sx', reset: 'set textShadow.scaleX to null or reset the complete textShadow component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'scaleY', type: 'continuous', valueType: 'number', minimum: 0, maximum: 2, default: 1, step: 0.00001, unit: 'multiplier', semanticPath: 'options.textShadow.scaleY', serializer: 'generated XML shadow sy', reset: 'set textShadow.scaleY to null or reset the complete textShadow component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'skewXDeg', type: 'continuous', valueType: 'number', minimum: -90, maximum: 90, minimumExclusive: true, maximumExclusive: true, default: 0, step: 1 / 60000, unit: 'degrees', semanticPath: 'options.textShadow.skewXDeg', serializer: 'generated XML shadow kx', reset: 'set textShadow.skewXDeg to null or reset the complete textShadow component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'skewYDeg', type: 'continuous', valueType: 'number', minimum: -90, maximum: 90, minimumExclusive: true, maximumExclusive: true, default: 0, step: 1 / 60000, unit: 'degrees', semanticPath: 'options.textShadow.skewYDeg', serializer: 'generated XML shadow ky', reset: 'set textShadow.skewYDeg to null or reset the complete textShadow component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'rotateWithShape', type: 'discrete', valueType: 'boolean', values: [false, true], default: false, semanticPath: 'options.textShadow.rotateWithShape', serializer: 'generated XML shadow rotWithShape', reset: 'set textShadow.rotateWithShape to null or reset the complete textShadow component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{ type: 'outer', color: '101828', opacity: 0.42, blurPt: 18, distancePt: 7, angleDeg: 135, scaleX: 1, scaleY: 0.8, skewXDeg: 0, skewYDeg: 4, rotateWithShape: false }, { type: 'none' }],
	}),
	surface({
		id: 'textBoxFitWrapDirection',
		field: 'style.fit / options.fit / bodyPr autofit children plus style.wrap / options.wrap / bodyPr@wrap and style.vert / options.vert / bodyPr@vert',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Text Options > Text Box. Control native autofit, wrapping, and vertical text direction without relying on a preset.',
		schema: { fit: 'none|shrink|resize', wrap: 'boolean', vert: 'eaVert|horz|mongolianVert|vert|vert270|wordArtVert|wordArtVertRtl' },
		parameters: [
			{ id: 'fit', type: 'discrete', valueType: 'enum', values: ['none', 'shrink', 'resize'], default: 'shrink', semanticPath: 'options.fit', serializer: 'generated XML a:noAutofit|a:normAutofit|a:spAutoFit', reset: 'set fit to null or omit it to restore the carrier default', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'wrap', type: 'discrete', valueType: 'boolean', values: [false, true], default: true, semanticPath: 'options.wrap', serializer: 'generated XML a:bodyPr@wrap = none|square', reset: 'set wrap to null or omit it to restore the native/default wrap', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'vert', type: 'discrete', valueType: 'enum', values: ['eaVert', 'horz', 'mongolianVert', 'vert', 'vert270', 'wordArtVert', 'wordArtVertRtl'], default: 'horz', semanticPath: 'options.vert', serializer: 'generated XML a:bodyPr@vert', reset: 'set vert to null or omit it to restore horizontal text', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{ fit: 'shrink', wrap: true, vert: 'horz' }, { fit: 'resize', wrap: false, vert: 'vert' }, { fit: null, wrap: null, vert: null }],
	}),
	surface({
		id: 'textParagraphAlignmentDirectionLanguage',
		field: 'style.align / options.align / paragraph pPr@algn plus options.rtlMode / pPr@rtl and run lang / rPr@lang',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Text Options > Paragraph and Language. Control paragraph alignment, right-to-left direction, and the editable run language without relying on a preset.',
		schema: { align: 'left|center|right|justify', rtlMode: 'boolean', lang: 'BCP-47 language tag' },
		parameters: [
			{ id: 'align', type: 'discrete', valueType: 'enum', values: ['left', 'center', 'right', 'justify'], default: 'left', semanticPath: 'options.align', serializer: 'generated XML a:pPr@algn = l|ctr|r|just', reset: 'set align to null or omit it to remove the authored paragraph alignment', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'rtlMode', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'options.rtlMode', serializer: 'generated XML a:pPr@rtl = 1|0', reset: 'set rtlMode to null or omit it to remove the authored paragraph direction', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'lang', type: 'discrete', valueType: 'string', default: 'en-US', semanticPath: 'options.lang', serializer: 'generated XML a:rPr/@lang', reset: 'set lang to null or omit it to remove the authored run-language override', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{ align: 'center', rtlMode: false, lang: 'en-US' }, { align: 'right', rtlMode: true, lang: 'ar-SA' }, { align: null, rtlMode: null, lang: null }],
	}),
	surface({
		id: 'textUnderline',
		field: 'style.underline / options.underline / text run rPr@u plus rPr/uFill',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Font > Underline Style and Underline Color. Expose every native underline selector as a typed run-level control for ordinary text and WordArt.',
		schema: { style: 'dash|dashHeavy|dashLong|dashLongHeavy|dbl|dotDash|dotDashHeavy|dotDotDash|dotDotDashHeavy|dotted|dottedHeavy|heavy|none|sng|wavy|wavyDbl|wavyHeavy', color: 'hex or theme color string' },
		parameters: [
			{ id: 'underlineStyle', type: 'discrete', valueType: 'enum', values: ['dash', 'dashHeavy', 'dashLong', 'dashLongHeavy', 'dbl', 'dotDash', 'dotDashHeavy', 'dotDotDash', 'dotDotDashHeavy', 'dotted', 'dottedHeavy', 'heavy', 'none', 'sng', 'wavy', 'wavyDbl', 'wavyHeavy'], default: 'none', semanticPath: 'options.underline.style', serializer: 'generated XML a:rPr@u', reset: 'set options.underline to null, false, or omit it to restore the native/default underline', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'underlineColor', type: 'color', valueType: 'hex-or-theme', semanticPath: 'options.underline.color', serializer: 'generated XML a:rPr/a:uFill/*', reset: 'set options.underline.color to null or set options.underline to null', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{ underline: { style: 'sng', color: '38BDF8' } }, { underline: { style: 'wavyDbl', color: 'F97316' } }, { underline: null }],
		limitation: 'PowerPoint uses dotDashHeavy. The historical library typo dotDashHeave is accepted only as an input alias and normalized before serialization.',
	}),
	surface({
		id: 'objectRotation',
		field: 'rotate / options.rotate / a:xfrm/@rot',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Format Shape/Picture > Size and Properties > Rotation. Expose the signed 2-D object rotation as a typed continuous control instead of a preset-only transform.',
		schema: { rotate: '-360 to 360 degrees; native serializer step 1/60000 degree; null removes the authored rotation' },
		parameters: [
			{ id: 'rotationDegrees', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 1 / 60000, unit: 'degrees', semanticPath: 'options.rotate', serializer: 'generated XML a:xfrm/@rot = round(degrees * 60000)', reset: 'set rotate to null or omit it to restore the native 0-degree orientation', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{ rotate: -90 }, { rotate: 0 }, { rotate: 45.12345 }, { rotate: null }],
		limitation: 'This is the 2-D frame rotation control. Text3D/scene3d camera axes and model transform rotations are separate native surfaces with their own domains and Office canonicalization rules.',
	}),
	surface({
		id: 'objectFlip',
		field: 'flipH / flipV / options.flipH / options.flipV / a:xfrm@flipH|flipV',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Format Shape/Picture > Rotate > Flip. Expose independent horizontal and vertical object-frame reflection controls with typed reset and composition semantics.',
		schema: { flipH: 'boolean or null', flipV: 'boolean or null' },
		parameters: [
			{ id: 'flipH', type: 'discrete', valueType: 'boolean', values: [false, true], default: false, semanticPath: 'options.flipH', serializer: 'generated XML a:xfrm/@flipH = 1 when true', reset: 'set flipH to null or omit it to restore the native false default', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'flipV', type: 'discrete', valueType: 'boolean', values: [false, true], default: false, semanticPath: 'options.flipV', serializer: 'generated XML a:xfrm/@flipV = 1 when true', reset: 'set flipV to null or omit it to restore the native false default', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{ flipH: true, flipV: false }, { flipH: false, flipV: true }, { flipH: true, flipV: true }, { flipH: null, flipV: null }],
		limitation: 'Flip is a 2-D object-frame transform and composes independently with rotate. Text3D/scene3d camera axes and model pose are separate native surfaces.',
	}),
	surface({
		id: 'line',
		field: 'style.line / options.line / shape and connector line',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Shape Format > Line and connector line controls. Author the native line component independently from shape or connector geometry, including width, transparency, dash, and arrow-end types.',
		schema: {
			type: 'none|solid',
			color: 'hex or theme color',
			transparency: '0-100 percent',
			width: '0-1584 points',
			dashType: SHAPE_LINE_DASH_TYPES.join('|'),
			beginArrowType: SHAPE_LINE_ARROW_TYPES.join('|'),
			endArrowType: SHAPE_LINE_ARROW_TYPES.join('|'),
			beginArrowWidth: SHAPE_LINE_ARROW_SIZE_VALUES.join('|'),
			beginArrowLength: SHAPE_LINE_ARROW_SIZE_VALUES.join('|'),
			endArrowWidth: SHAPE_LINE_ARROW_SIZE_VALUES.join('|'),
			endArrowLength: SHAPE_LINE_ARROW_SIZE_VALUES.join('|'),
		},
		parameters: [
			{ id: 'lineType', type: 'discrete', valueType: 'enum', values: ['none', 'solid'], default: 'solid', semanticPath: 'style.line.type', serializer: 'generated XML a:ln/a:noFill or a:ln with solid fill', reset: 'set style.line to null or type:none to remove the authored line component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'lineColor', type: 'color', valueType: 'hex-or-theme', semanticPath: 'style.line.color', serializer: 'generated XML a:ln/a:solidFill color selection', reset: 'set style.line.color to null or reset the complete line component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'lineTransparency', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 0, step: 0.001, unit: 'percent', semanticPath: 'style.line.transparency', serializer: 'generated XML a:ln/a:solidFill/*/a:alpha/@val = round((100 - transparency) * 1000)', reset: 'set style.line.transparency to null or reset the complete line component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'lineWidth', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1584, default: 1, step: 1 / 12700, unit: 'points', semanticPath: 'style.line.width', serializer: 'generated XML a:ln/@w = round(width * 12700)', reset: 'set style.line.width to null or reset the complete line component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'lineDashType', type: 'discrete', valueType: 'enum', values: [...SHAPE_LINE_DASH_TYPES], default: 'solid', semanticPath: 'style.line.dashType', serializer: 'generated XML a:ln/a:prstDash/@val', reset: 'set style.line.dashType to null or reset the complete line component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'lineBeginArrowType', type: 'discrete', valueType: 'enum', values: [...SHAPE_LINE_ARROW_TYPES], default: 'none', semanticPath: 'style.line.beginArrowType', serializer: 'generated XML a:ln/a:headEnd/@type', reset: 'set style.line.beginArrowType to null or none', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'lineEndArrowType', type: 'discrete', valueType: 'enum', values: [...SHAPE_LINE_ARROW_TYPES], default: 'none', semanticPath: 'style.line.endArrowType', serializer: 'generated XML a:ln/a:tailEnd/@type', reset: 'set style.line.endArrowType to null or none', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'lineBeginArrowWidth', type: 'discrete', valueType: 'enum', values: [...SHAPE_LINE_ARROW_SIZE_VALUES], default: 'med', semanticPath: 'style.line.beginArrowWidth', serializer: 'generated XML a:ln/a:headEnd/@w', reset: 'set style.line.beginArrowWidth to null to restore the native medium width', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'lineBeginArrowLength', type: 'discrete', valueType: 'enum', values: [...SHAPE_LINE_ARROW_SIZE_VALUES], default: 'med', semanticPath: 'style.line.beginArrowLength', serializer: 'generated XML a:ln/a:headEnd/@len', reset: 'set style.line.beginArrowLength to null to restore the native medium length', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'lineEndArrowWidth', type: 'discrete', valueType: 'enum', values: [...SHAPE_LINE_ARROW_SIZE_VALUES], default: 'med', semanticPath: 'style.line.endArrowWidth', serializer: 'generated XML a:ln/a:tailEnd/@w', reset: 'set style.line.endArrowWidth to null to restore the native medium width', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'lineEndArrowLength', type: 'discrete', valueType: 'enum', values: [...SHAPE_LINE_ARROW_SIZE_VALUES], default: 'med', semanticPath: 'style.line.endArrowLength', serializer: 'generated XML a:ln/a:tailEnd/@len', reset: 'set style.line.endArrowLength to null to restore the native medium length', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [
			{ type: 'solid', color: '38BDF8', transparency: 18.25, width: 2.5, dashType: 'lgDash', beginArrowType: 'none', endArrowType: 'triangle' },
			{ type: 'none' },
			{ line: null },
		],
		limitation: 'Arrow type, width, and length are independent typed controls on both shape and connector line ends. PowerPoint may normalize a size value when the corresponding arrow type is none; the native/public proof reports that applicability boundary explicitly.',
	}),
	surface({
		id: 'imageFraming',
		field: 'sizing.type / imageOptions.sizing.type / a:srcRect + a:stretch',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Picture and media framing. The AI chooses contain, cover, or explicit crop as a typed semantic fit mode; the Director owns the target box and the native serializer emits the resulting srcRect/stretch.',
		schema: { type: 'contain|cover|crop', reset: 'null or omission restores native fill behaviour' },
		parameters: [
			{ id: 'framingMode', type: 'discrete', valueType: 'enum', values: ['contain', 'cover', 'crop'], default: 'cover', semanticPath: 'options.sizing.type', serializer: 'generated XML a:srcRect plus a:stretch/a:fillRect from engine-owned target and measured source dimensions', reset: 'set sizing to null or omit it to restore native fill behaviour', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{ sizing: { type: 'cover' } }, { sizing: { type: 'contain' } }, { sizing: { type: 'crop' } }, { sizing: null }],
		limitation: 'The public client authors only the fit mode. Target x/y/w/h and source dimensions remain engine-owned to prevent a second coordinate system; explicit source-relative crop leaves are a separate future contract.',
	}),
	surface({
		id: 'textOutline',
		field: 'style.textOutline / options.textOutline / text run outline',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Text Options > Text Fill & Outline > Text Outline. Edit glyph stroke color, transparency, and width independently from the text box panel line.',
		schema: { color: 'hex or theme color', transparency: '0-100 percent', widthPt: '0-100 points' },
		parameters: [
			{ id: 'textOutlineTransparency', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 0, step: 0.001, unit: 'percent', semanticPath: 'options.textOutline.transparency', serializer: 'generated XML a:rPr/a:ln/a:solidFill/*/a:alpha/@val = round((100 - transparency) * 1000)', reset: 'set textOutline.transparency to null or set textOutline to null', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'textOutlineWidth', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 0.75, step: 0.001, unit: 'points', semanticPath: 'options.textOutline.widthPt', serializer: 'generated XML a:rPr/a:ln/@w = round(widthPt * 12700)', reset: 'set textOutline.widthPt to null or set textOutline to null', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{ color: '0EA5E9', transparency: 18.25, widthPt: 1.5 }, { color: 'FFFFFF', transparency: 0, widthPt: 0.75 }],
	}),
	surface({
		id: 'textReflection',
		field: 'style.textReflection / options.textReflection / text run effect reflection',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Text Options > Text Effects > Reflection. Expose the complete native character-reflection controls independently from a shape or picture reflection preset, including vertical size/flip.',
		schema: { blurPt: '0-100 points', distancePt: '0-200 points', directionDeg: '0-359 degrees', startOpacity: '0-1', endOpacity: '0-1', startPosition: '0-1', endPosition: '0-1', scaleY: '-1000 to 1000 percent; negative values flip vertically' },
		parameters: [
			{ id: 'blurPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 0, step: 1 / 12700, unit: 'points', semanticPath: 'options.textReflection.blurPt', serializer: 'generated XML text-run reflection blurRad', reset: 'set textReflection.blurPt to null or remove textReflection', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'distancePt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 200, default: 0, step: 1 / 12700, unit: 'points', semanticPath: 'options.textReflection.distancePt', serializer: 'generated XML text-run reflection dist', reset: 'set textReflection.distancePt to null or remove textReflection', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'directionDeg', type: 'continuous', valueType: 'number', minimum: 0, maximum: 359, default: 90, step: 1 / 60000, unit: 'degrees', semanticPath: 'options.textReflection.directionDeg', serializer: 'generated XML text-run reflection dir', reset: 'set textReflection.directionDeg to null or remove textReflection', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'startOpacity', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0.5, step: 0.00001, unit: 'normalized', semanticPath: 'options.textReflection.startOpacity', serializer: 'generated XML text-run reflection stA', reset: 'set textReflection.startOpacity to null or remove textReflection', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'endOpacity', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0, step: 0.00001, unit: 'normalized', semanticPath: 'options.textReflection.endOpacity', serializer: 'generated XML text-run reflection endA', reset: 'set textReflection.endOpacity to null or remove textReflection', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'startPosition', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0, step: 0.01, unit: 'normalized', semanticPath: 'options.textReflection.startPosition', serializer: 'generated XML text-run reflection stPos', reset: 'set textReflection.startPosition to null or remove textReflection', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'endPosition', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0.55, step: 0.01, unit: 'normalized', semanticPath: 'options.textReflection.endPosition', serializer: 'generated XML text-run reflection endPos', reset: 'set textReflection.endPosition to null or remove textReflection', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'scaleY', type: 'continuous', valueType: 'number', minimum: -1000, maximum: 1000, default: -100, step: 0.1, unit: 'percent', semanticPath: 'options.textReflection.scaleY', serializer: 'generated XML text-run reflection sy = round(scaleY * 1000)', reset: 'set textReflection.scaleY to null or remove textReflection', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{ blurPt: 3, distancePt: 2, directionDeg: 90, startOpacity: 0.28, endOpacity: 0, startPosition: 0, endPosition: 0.55, scaleY: -100 }, { blurPt: 0, distancePt: 0, startOpacity: 0, endOpacity: 0, scaleY: -70 }],
	}),
	surface({
		id: 'textCharacterSpacing',
		field: 'style.charSpacing / options.charSpacing / text run spacing',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Text Options > Character Spacing. Edit glyph tracking independently for ordinary text and WordArt; values are points added between adjacent characters.',
		schema: { charSpacing: '-100 to 100 points' },
		parameters: [
			{ id: 'charSpacing', type: 'continuous', valueType: 'number', minimum: -100, maximum: 100, default: 0, step: 0.01, unit: 'points', semanticPath: 'options.charSpacing', serializer: 'generated XML a:rPr/@spc = round(charSpacing * 100)', reset: 'set charSpacing to null or omit it', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{ charSpacing: -2.5 }, { charSpacing: 0 }, { charSpacing: 6.25 }],
	}),
	surface({
		id: 'textLineSpacing',
		field: 'style.lineSpacing / style.lineSpacingMultiple / paragraph leading',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Text Options > Paragraph > Line Spacing. Edit absolute point leading or a relative multiple; absolute points take precedence when both are present.',
		schema: { lineSpacing: '0-400 points', lineSpacingMultiple: '0-9.99 multiple' },
		parameters: [
			{ id: 'lineSpacing', type: 'continuous', valueType: 'number', minimum: 0, maximum: 400, default: null, step: 0.01, unit: 'points', semanticPath: 'options.lineSpacing', serializer: 'generated XML a:pPr/a:lnSpc/a:spcPts/@val = round(lineSpacing * 100)', reset: 'set lineSpacing to null and omit lineSpacingMultiple to restore native leading', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'lineSpacingMultiple', type: 'continuous', valueType: 'number', minimum: 0, maximum: 9.99, default: null, step: 0.00001, unit: 'multiple', semanticPath: 'options.lineSpacingMultiple', serializer: 'generated XML a:pPr/a:lnSpc/a:spcPct/@val = round(lineSpacingMultiple * 100000)', reset: 'set lineSpacingMultiple to null or replace the line-spacing component', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{ lineSpacing: 18.25 }, { lineSpacingMultiple: 1.35 }, { lineSpacing: 24, lineSpacingMultiple: 1.5 }],
		limitation: 'If both fields are authored, lineSpacing points wins deterministically; use one mode when round-tripping an Office-authored paragraph.',
	}),
	surface({
		id: 'textParagraphSpacing',
		field: 'style.paraSpaceBefore / style.paraSpaceAfter / paragraph spacing',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Text Options > Paragraph > Spacing. Edit the independent before and after paragraph offsets in points for ordinary text and WordArt.',
		schema: { paraSpaceBefore: '0-400 points', paraSpaceAfter: '0-400 points' },
		parameters: [
			{ id: 'paraSpaceBefore', type: 'continuous', valueType: 'number', minimum: 0, maximum: 400, default: null, step: 0.01, unit: 'points', semanticPath: 'options.paraSpaceBefore', serializer: 'generated XML a:pPr/a:spcBef/a:spcPts/@val = round(paraSpaceBefore * 100)', reset: 'set paraSpaceBefore to null or omit it', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'paraSpaceAfter', type: 'continuous', valueType: 'number', minimum: 0, maximum: 400, default: null, step: 0.01, unit: 'points', semanticPath: 'options.paraSpaceAfter', serializer: 'generated XML a:pPr/a:spcAft/a:spcPts/@val = round(paraSpaceAfter * 100)', reset: 'set paraSpaceAfter to null or omit it', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{ paraSpaceBefore: 8.25 }, { paraSpaceAfter: 14.5 }, { paraSpaceBefore: 6.75, paraSpaceAfter: 18.25 }],
	}),
	surface({
		id: 'textParagraphIndent',
		field: 'style.indent / style.hanging / style.indentLevel / style.bullet / paragraph geometry',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Text Options > Paragraph > Indents and Bullets. Edit left indentation, hanging indentation, native level, and bullet geometry for ordinary text and WordArt.',
		schema: { indent: '0-400 points', hanging: '0-400 points', indentLevel: '0-8 integer', bullet: 'boolean or structured bullet' },
		parameters: [
			{ id: 'indent', type: 'continuous', valueType: 'number', minimum: 0, maximum: 400, default: null, step: 0.01, unit: 'points', semanticPath: 'options.indent', serializer: 'generated XML a:pPr/@marL = round(indent * 12700)', reset: 'set indent to null or omit it', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'hanging', type: 'continuous', valueType: 'number', minimum: 0, maximum: 400, default: null, step: 0.01, unit: 'points', semanticPath: 'options.hanging', serializer: 'generated XML a:pPr/@indent = -round(hanging * 12700)', reset: 'set hanging to null or omit it', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'indentLevel', type: 'discrete', valueType: 'integer', minimum: 0, maximum: 8, default: 0, step: 1, unit: 'level', semanticPath: 'options.indentLevel', serializer: 'generated XML a:pPr/@lvl', reset: 'set indentLevel to null or omit it', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'bulletIndent', type: 'continuous', valueType: 'number', minimum: 0, maximum: 400, default: 27, step: 0.01, unit: 'points', semanticPath: 'options.bullet.indent', serializer: 'generated XML a:pPr/@marL and @indent for bullet geometry', reset: 'set bullet.indent to null or set bullet to null/false', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'bulletFontSize', type: 'continuous', valueType: 'number', minimum: 0, maximum: 400, default: null, step: 0.01, unit: 'points', semanticPath: 'options.bullet.fontSize', serializer: 'generated XML a:buSzPts/@val = round(fontSize * 100)', reset: 'set bullet.fontSize to null or replace bullet', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{ indent: 18.25, hanging: 9.5 }, { indentLevel: 2, bullet: { characterCode: '2022', indent: 27, fontSize: 18 } }, { bullet: { type: 'number', numberStartAt: 3, indent: 32.5 } }],
		limitation: 'An explicit hanging value takes precedence over bullet.indent for the paragraph margin; bullet.indent remains the bullet-to-text spacing contract when hanging is omitted.',
	}),
	surface({
		id: 'textTabsRichRuns',
		field: 'style.tabStops / text[].options.strike / highlight / superscript / subscript',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Text Options > Paragraph tab stops and Font run formatting. Author exact paragraph tab positions and rich run strike, highlight, superscript, and subscript for ordinary text and WordArt.',
		schema: { tabStops: 'array of {position:0-100 inches, alignment:l|r|ctr|dec}', strike: 'boolean|sngStrike|dblStrike', highlight: 'hex color', superscript: 'boolean', subscript: 'boolean' },
		parameters: [
			{ id: 'tabStops', type: 'structured', valueType: 'array', maximumItems: 32, itemSchema: { position: '0-100 inches, 0.01 step', alignment: ['l', 'r', 'ctr', 'dec'] }, semanticPath: 'options.tabStops', serializer: 'generated XML a:pPr/a:tabLst/a:tab/@pos = round(position * 914400), @algn', reset: 'set tabStops to null or omit it', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'strike', type: 'discrete', valueType: 'enum-or-boolean', values: [false, true, 'sngStrike', 'dblStrike'], default: false, semanticPath: 'text[].options.strike', serializer: 'generated XML a:rPr/@strike = sngStrike|dblStrike|noStrike', reset: 'set strike to null or omit it', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'highlight', type: 'color', valueType: 'hex', semanticPath: 'text[].options.highlight', serializer: 'generated XML a:rPr/a:highlight/a:srgbClr', reset: 'set highlight to null or omit it', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'superscript', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'text[].options.superscript', serializer: 'generated XML a:rPr/@baseline = 30000', reset: 'set superscript to null or false', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'subscript', type: 'discrete', valueType: 'boolean', default: false, semanticPath: 'text[].options.subscript', serializer: 'generated XML a:rPr/@baseline = -40000', reset: 'set subscript to null or false', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{ tabStops: [{ position: 1.25, alignment: 'l' }, { position: 4.5, alignment: 'r' }] }, { text: [{ text: 'deprecated', options: { strike: 'dblStrike' } }, { text: 'current', options: { highlight: 'FDE047', superscript: true } }] }],
	}),
	surface({
		id: 'textBoxMargins',
		field: 'style.margin / options.margin / bodyPr insets plus style.valign / options.valign',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Text Options > Text Box. Edit the four native bodyPr insets and vertical anchoring independently for ordinary text and WordArt.',
		schema: { margin: 'number 0-100 points or [top,right,bottom,left] at 0.01-point step', valign: 'top|middle|bottom' },
		parameters: [
			{ id: 'margin', type: 'continuous-or-tuple', valueType: 'number|array', minimum: 0, maximum: 100, default: 0.08, step: 0.01, unit: 'points', semanticPath: 'options.margin', serializer: 'generated XML a:bodyPr/@tIns,rIns,bIns,lIns = round(value * 12700)', reset: 'set margin to null or replace the margin tuple', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'marginTop', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 0.08, step: 0.01, unit: 'points', semanticPath: 'options.margin[0]', serializer: 'generated XML a:bodyPr/@tIns = round(value * 12700)', reset: 'set margin to null or replace the margin tuple', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'marginRight', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 0.08, step: 0.01, unit: 'points', semanticPath: 'options.margin[1]', serializer: 'generated XML a:bodyPr/@rIns = round(value * 12700)', reset: 'set margin to null or replace the margin tuple', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'marginBottom', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 0.08, step: 0.01, unit: 'points', semanticPath: 'options.margin[2]', serializer: 'generated XML a:bodyPr/@bIns = round(value * 12700)', reset: 'set margin to null or replace the margin tuple', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'marginLeft', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 0.08, step: 0.01, unit: 'points', semanticPath: 'options.margin[3]', serializer: 'generated XML a:bodyPr/@lIns = round(value * 12700)', reset: 'set margin to null or replace the margin tuple', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'valign', type: 'discrete', valueType: 'enum', values: ['top', 'middle', 'bottom'], default: 'middle', semanticPath: 'options.valign', serializer: 'generated XML a:bodyPr/@anchor = t|ctr|b', reset: 'set valign to null or omit it to restore the native/default anchor', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{ margin: [4.25, 8.5, 4.25, 8.5], valign: 'middle' }, { margin: 0, valign: 'top' }, { margin: null, valign: null }],
	}),
	surface({
		id: 'shadow',
		field: 'style.shadow / options.shadow / effects[] type:outerShadow|innerShadow',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Parameterized native DrawingML shadow. Gallery presets remain optional; this schema is the continuous control surface.',
		aliases: ['outerShadow', 'innerShadow', 'drop-shadow'],
		schema: {
			type: 'outer | inner | none',
			color: 'hex',
			opacity: '0-1',
			blurPt: '0-100',
			distancePt: '0-200',
			angleDeg: '0-359',
			scaleX: '0-2',
			scaleY: '0-2',
			skewXDeg: '-90-90',
			skewYDeg: '-90-90',
			rotateWithShape: 'boolean',
		},
		ranges: { opacity: [0, 1], blurPt: [0, 100], distancePt: [0, 200], angleDeg: [0, 359], scaleX: [0, 2], scaleY: [0, 2], skewXDeg: [-90, 90], skewYDeg: [-90, 90] },
		parameters: [
			{ id: 'blurPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 4, step: 1 / 12700, unit: 'points', semanticPath: 'style.shadow.blurPt', serializer: 'generated XML a:outerShdw/@blurRad = round(blurPt * 12700)', reset: 'set style.shadow.blurPt to null or remove the shadow component; Office may canonicalize blurPt=0 to removal on SaveCopyAs', capabilityStatus: 'executable-exact-structured' },
			{ id: 'distancePt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 200, default: 3, step: 1 / 12700, unit: 'points', semanticPath: 'style.shadow.distancePt', serializer: 'generated XML a:outerShdw/@dist = round(distancePt * 12700)', reset: 'set style.shadow.distancePt to null or remove the shadow component; Office may canonicalize distancePt=0 to removal on SaveCopyAs', capabilityStatus: 'executable-exact-structured' },
			{ id: 'angleDeg', type: 'continuous', valueType: 'number', minimum: 0, maximum: 359, default: 45, step: 1 / 60000, unit: 'degrees', semanticPath: 'style.shadow.angleDeg', serializer: 'generated XML a:outerShdw/@dir = round(angleDeg * 60000)', reset: 'set style.shadow.angleDeg to null or remove the shadow component; Office may canonicalize the neutral direction on reset', capabilityStatus: 'executable-exact-structured' },
			{ id: 'scaleX', type: 'continuous', valueType: 'number', minimum: 0, maximum: 2, default: 1, step: 1 / 100000, unit: 'multiplier', semanticPath: 'style.shadow.scaleX', serializer: 'generated XML a:outerShdw/@sx = round(scaleX * 100000)', reset: 'set style.shadow.scaleX to null or remove the shadow component; Office may omit neutral sx=100000 at the default multiplier on SaveCopyAs', capabilityStatus: 'executable-exact-structured' },
			{ id: 'scaleY', type: 'continuous', valueType: 'number', minimum: 0, maximum: 2, default: 1, step: 1 / 100000, unit: 'multiplier', semanticPath: 'style.shadow.scaleY', serializer: 'generated XML a:outerShdw/@sy = round(scaleY * 100000)', reset: 'set style.shadow.scaleY to null or remove the shadow component; Office may omit neutral sy=100000 at the default multiplier on SaveCopyAs', capabilityStatus: 'executable-exact-structured' },
			{ id: 'skewXDeg', type: 'continuous', valueType: 'number', minimum: -90, maximum: 90, minimumExclusive: true, maximumExclusive: true, default: 0, step: 1 / 60000, unit: 'degrees', semanticPath: 'style.shadow.skewXDeg', serializer: 'generated XML a:outerShdw/@kx = round(skewXDeg * 60000)', reset: 'set style.shadow.skewXDeg to null or remove the shadow component; Office may omit neutral kx=0 at the default degree; endpoints are exclusive per ST_FixedAngle', capabilityStatus: 'executable-exact-structured' },
			{ id: 'skewYDeg', type: 'continuous', valueType: 'number', minimum: -90, maximum: 90, minimumExclusive: true, maximumExclusive: true, default: 0, step: 1 / 60000, unit: 'degrees', semanticPath: 'style.shadow.skewYDeg', serializer: 'generated XML a:outerShdw/@ky = round(skewYDeg * 60000)', reset: 'set style.shadow.skewYDeg to null or remove the shadow component; Office may omit neutral ky=0 at the default degree; endpoints are exclusive per ST_FixedAngle', capabilityStatus: 'executable-exact-structured' },
			{ id: 'rotateWithShape', type: 'discrete', valueType: 'boolean', values: [false, true], default: false, semanticPath: 'style.shadow.rotateWithShape', serializer: 'generated XML a:outerShdw/@rotWithShape = 0|1', reset: 'set style.shadow.rotateWithShape to null or remove the shadow component; Office may omit rotWithShape=1 because true is the OOXML default on SaveCopyAs', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{
			type: 'outerShadow',
			color: '101828',
			opacity: 0.42,
			blurPt: 18,
			distancePt: 7,
			angleDeg: 135,
			scaleX: 1,
			scaleY: 0.8,
			skewXDeg: 0,
			skewYDeg: 4,
			rotateWithShape: false,
		}],
	}),
	surface({
		id: 'glow',
		field: 'style.glow / options.glow / effects[] type:glow',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Native glow with color, opacity, and radius in points.',
		aliases: ['outerGlow'],
		schema: { color: 'hex', opacity: '0-1', radiusPt: '0-100' },
		parameters: [
			{ id: 'radiusPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 8, step: 1 / 12700, unit: 'points', semanticPath: 'style.glow.radiusPt', serializer: 'generated XML a:glow/@rad = round(radiusPt * 12700)', reset: 'set style.glow.radiusPt to null or remove the glow component; Office may canonicalize zero to removal', capabilityStatus: 'executable-exact-structured' },
			{ id: 'opacity', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0.75, step: 1 / 100000, unit: 'normalized', semanticPath: 'style.glow.opacity', serializer: 'generated XML a:glow/a:srgbClr/a:alpha = round(opacity * 100000)', reset: 'set style.glow.opacity to null or remove the glow component; default is 0.75', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{ type: 'glow', color: '38BDF8', opacity: 0.42, radiusPt: 16 }],
	}),
	surface({
		id: 'reflection',
		field: 'style.reflection / options.reflection / effects[] type:reflection',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Native reflection with blur, distance, direction, and fade opacities.',
		schema: { blurPt: '0-100', distancePt: '0-200', directionDeg: '0-359', startOpacity: '0-1', endOpacity: '0-1', startPosition: '0-1', endPosition: '0-1' },
		parameters: [
			{ id: 'blurPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 0, step: 1 / 12700, unit: 'points', semanticPath: 'style.reflection.blurPt', serializer: 'generated XML a:reflection/@blurRad = round(blurPt * 12700)', reset: 'set style.reflection.blurPt to null or remove the reflection component; Office may canonicalize zero', capabilityStatus: 'executable-exact-structured' },
			{ id: 'distancePt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 200, default: 0, step: 1 / 12700, unit: 'points', semanticPath: 'style.reflection.distancePt', serializer: 'generated XML a:reflection/@dist = round(distancePt * 12700)', reset: 'set style.reflection.distancePt to null or remove the reflection component', capabilityStatus: 'executable-exact-structured' },
			{ id: 'directionDeg', type: 'continuous', valueType: 'number', minimum: 0, maximum: 359, default: 90, step: 1 / 60000, unit: 'degrees', semanticPath: 'style.reflection.directionDeg', serializer: 'generated XML a:reflection/@dir = round(directionDeg * 60000)', reset: 'set style.reflection.directionDeg to null or remove the reflection component; Office may omit the neutral direction', capabilityStatus: 'executable-exact-structured' },
			{ id: 'startOpacity', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0.5, step: 1 / 100000, unit: 'normalized', semanticPath: 'style.reflection.startOpacity', serializer: 'generated XML a:reflection/@stA = round(startOpacity * 100000)', reset: 'set style.reflection.startOpacity to null or remove the reflection component', capabilityStatus: 'executable-exact-structured' },
			{ id: 'endOpacity', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0, step: 1 / 100000, unit: 'normalized', semanticPath: 'style.reflection.endOpacity', serializer: 'generated XML a:reflection/@endA = round(endOpacity * 100000)', reset: 'set style.reflection.endOpacity to null or remove the reflection component', capabilityStatus: 'executable-exact-structured' },
			{ id: 'startPosition', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0, step: 0.01, unit: 'normalized', semanticPath: 'style.reflection.startPosition', serializer: 'generated XML a:reflection/@stPos = round(startPosition * 100000)', reset: 'set style.reflection.startPosition to null or remove the reflection component', capabilityStatus: 'executable-exact-structured' },
			{ id: 'endPosition', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0.55, step: 0.01, unit: 'normalized', semanticPath: 'style.reflection.endPosition', serializer: 'generated XML a:reflection/@endPos = round(endPosition * 100000)', reset: 'set style.reflection.endPosition to null or remove the reflection component', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{ type: 'reflection', blurPt: 3, distancePt: 2, directionDeg: 90, startOpacity: 0.28, endOpacity: 0, startPosition: 0, endPosition: 0.55 }],
	}),
	surface({
		id: 'softEdge',
		field: 'style.softEdges / options.softEdges / effects[] type:softEdge',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Native soft-edge radius in points.',
		aliases: ['softEdges', 'feather'],
		schema: { radiusPt: '0-100' },
		parameters: [
			{ id: 'radiusPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 8, step: 1 / 12700, unit: 'points', semanticPath: 'style.softEdges.radiusPt', serializer: 'generated XML a:softEdge/@rad = round(radiusPt * 12700)', reset: 'set style.softEdges.radiusPt to null or remove the soft-edge component; Office may canonicalize zero to removal', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{ type: 'softEdge', radiusPt: 10 }],
	}),
	surface({
		id: 'blur',
		field: 'style.blur / options.blur / effects[] type:blur',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Native DrawingML blur on a shape or picture effect list. This is not a browser backdrop-filter.',
		schema: { radiusPt: '0-100', growBounds: 'boolean' },
		parameters: [
			{ id: 'radiusPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 100, default: 8, step: 1 / 12700, unit: 'points', semanticPath: 'style.blur.radiusPt', serializer: 'generated XML a:blur/@rad = round(radiusPt * 12700)', reset: 'set style.blur.radiusPt to null or remove the blur component; Office may canonicalize zero to removal', capabilityStatus: 'executable-exact-structured' },
			{ id: 'growBounds', type: 'discrete', valueType: 'boolean', values: [false, true], default: true, semanticPath: 'style.blur.growBounds', serializer: 'generated XML a:blur/@grow = 0 for false; omission is true/default', reset: 'set style.blur.growBounds to null or remove the blur component; Office may omit grow=1 because true is the markup default', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{ type: 'blur', radiusPt: 14, growBounds: true }],
	}),
	surface({
		id: 'fillOverlay',
		field: 'style.fillOverlay / effects[] type:fillOverlay',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Native fill overlay blend inside the effect list. Use for multiply/screen atmospheres without flattening.',
		aliases: ['blend', 'multiply'],
		schema: { blendMode: FILL_OVERLAY_BLENDS.join(' | '), fill: { type: 'solid', color: 'hex', transparency: '0-1' } },
		parameters: [
			{ id: 'blendMode', type: 'discrete', valueType: 'enum', values: [...FILL_OVERLAY_BLENDS], default: 'multiply', semanticPath: 'style.fillOverlay.blendMode', serializer: 'generated XML a:fillOverlay/@blend; multiply normalizes to OOXML mult', reset: 'set style.fillOverlay.blendMode to null or remove the fillOverlay component; default is multiply', capabilityStatus: 'executable-exact-structured' },
			{ id: 'fill.transparency', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1, default: 0, step: 1 / 100000, unit: 'normalized', semanticPath: 'style.fillOverlay.fill.transparency', serializer: 'generated XML a:solidFill/a:srgbClr/a:alpha = round((1 - transparency) * 100000)', reset: 'set style.fillOverlay.fill.transparency to null or remove the fillOverlay component; compatibility percentage inputs above 1 are normalized by the serializer', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{ type: 'fillOverlay', blendMode: 'multiply', fill: { type: 'solid', color: '102A43', transparency: 0.3 } }],
	}),
	surface({
		id: 'effects',
		field: 'style.effects / options.effects',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Compose native effectLst primitives in one array. This is the public combination surface for shadow, glow, reflection, softEdge, blur, and fillOverlay. Desktop PowerPoint writes the same list. Order is serialization order.',
		parameters: EFFECT_LIST_PARAMETERS,
		limitation: 'Each effect family exposes its complete typed slider set through this union. Duplicate effect types normalize to one component and arbitrary effect ordering/graph semantics are not authored; imported effectDag remains preserve-only.',
		examples: [[{ type: 'blur', radiusPt: 8 }, { type: 'outerShadow', color: '000000', opacity: 0.38, blurPt: 20, distancePt: 6, angleDeg: 135 }]],
	}),
	surface({
		id: 'effectDag',
		field: 'style.effectDag / options.effectDag',
		status: 'not-pursued',
		editability: 'native-preserved',
		description: 'Not a public authoring surface. Format pane combinations (including many-effect samples) serialize as effectLst, not effectDag. Do not invent a DAG from shadow/glow/reflection/softEdge. Imported packages that already contain a:effectDag may be preserved; use style.effects for new work.',
		aliases: ['effectGraph'],
		examples: [{ useInstead: 'style.effects / options.effects', reason: 'PowerPoint writes effectLst for Format pane combinations' }],
	}),
	surface({
		id: 'fill',
		field: 'style.fill / options.fill / slides[].background',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Solid, gradient, and pattern fills are executable. Texture and picture fills are executable when an opaque asset handle is supplied; tiled texture scale/offset is parameterized. Gradient stops accept hex, theme, or preset colours plus independent tint, shade, saturation, luminance, luminance-offset, opacity, and transparency controls.',
		schema: { type: 'solid | gradient | pattern | texture | picture', color: 'hex | scheme | preset | { color, scheme, preset, tint, shade, saturation, luminance, luminanceOffset, opacity }', transparency: '0-1 or 0-100', gradientStops: '[{ position, color, transparency }]' },
	parameters: [...FILL_CORE_PARAMETERS, ...FILL_GRADIENT_STOP_PARAMETERS, ...FILL_GRADIENT_GEOMETRY_PARAMETERS, ...PATTERN_PARAMETERS, ...TEXTURE_PARAMETERS],
		examples: [{ type: 'solid', color: '081426', transparency: 0 }, { type: 'gradient', gradientStops: [{ position: 0, color: { scheme: 'accent1', tint: 0.18, luminance: 1.1 } }, { position: 100, color: { color: 'F97316', shade: 0.22, saturation: 1.35, luminanceOffset: -0.08, opacity: 0.82 } }] }],
	}),
	surface({
		id: 'themeColorScheme',
		field: 'theme.colorScheme',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Full native OOXML theme colour scheme. Each neutral, accent, and hyperlink slot is independently authorable and participates in inherited SmartArt, chart, placeholder, and text colour resolution.',
		schema: { slots: THEME_COLOR_SCHEME_SLOTS.reduce((out, slot) => ({ ...out, [slot]: 'hex or null' }), {}) },
		parameters: THEME_COLOR_SCHEME_PARAMETERS,
		examples: [{ colorScheme: { dk1: '0B1220', lt1: 'F8FAFC', dk2: '1E293B', lt2: 'E2E8F0', accent1: '38BDF8', accent2: 'A78BFA', accent3: '34D399', accent4: 'F59E0B', accent5: 'FB7185', accent6: '22D3EE', hlink: '0284C7', folHlink: '7C3AED' } }],
	}),
	surface({
		id: 'layoutsThemesMasters',
		field: 'theme / layouts[] / masters[] / layoutContract / slides[].layoutName / slides[].masterName / slides[].hidden / slides[].slideNumber / slides[].showMasterShapes / slides[].showMasterBackground / slides[].showMasterPhAnim',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Typed theme, custom canvas, slide-master binding, placeholder-policy, and inheritance controls. These are semantic native bindings and policies, not a single gallery tile; omitted or null fields restore the selected native/default inheritance.',
		schema: { theme: 'fonts, language, and color scheme', layout: 'name,width,height,type,activate,placeholders,headerFooter (audit/template contract)', master: 'title,background,margin,slideNumber,headerFooter,objects,placeholders (native variants)', slideBinding: 'layoutName,masterName', slidePolicy: 'hidden,slideNumber,showMasterShapes,showMasterBackground,showMasterPhAnim', layoutContract: 'allowedLayouts,defaultLayout,strictLayout,placeholderBindings,safeContentAreas' },
		parameters: THEME_LAYOUT_INHERITANCE_PARAMETERS,
		examples: [
			{ theme: { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' }, layouts: [{ name: 'EditorialWide', width: 13.333333, height: 7.5, activate: true }], layoutContract: { defaultLayout: 'EditorialWide', strictLayout: true } },
			{ masters: [{ title: 'Editorial Master', background: null, margin: 0.42, slideNumber: { enabled: true } }], slides: [{ layoutName: 'EditorialWide', masterName: 'Editorial Master' }] },
			{ layoutContract: { placeholderBindings: { title: 'title', body: 'content' }, safeContentAreas: [{ x: 0.55, y: 0.45, w: 12.23, h: 6.6 }] } },
		],
		capabilityMode: 'parameterized',
		capabilityStatus: 'structured-partial',
		componentOwnership: ['theme', 'layouts', 'masters', 'layoutContract', 'slide.layoutName', 'slide.masterName', 'slide.hidden', 'slide.slideNumber', 'slide.showMasterShapes', 'slide.showMasterBackground', 'slide.showMasterPhAnim'],
		overrideFields: THEME_LAYOUT_INHERITANCE_PARAMETERS.map(parameter => parameter.id),
		resetBehavior: { component: 'set the named theme/layout/master/policy field to null or omit it', full: 'remove the authored theme/layout/master contract', nullBehavior: 'restore native/default or inherited theme/master/layout behavior' },
		 limitation: 'Typed layout and master placeholder variants, layout-owned native objects, semantic role bindings, and custom slide-layout relationships are executable and Office-roundtrip proven. Exhaustive Office gallery/theme/master inventory and every template-specific visual comparison remain open.',
	}),
	surface({
		id: 'background',
		field: 'slides[].background',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Slide background fill. Same fill primitives as shapes. A full-canvas effect-only texture is allowed; a screenshot of the slide is forbidden.',
		examples: [{ type: 'gradient', gradientDirection: 'circle', gradientStops: [{ position: 0, color: '081426' }, { position: 100, color: '3B82F6', transparency: 65 }] }],
		parameters: [...FILL_CORE_PARAMETERS, ...FILL_GRADIENT_STOP_PARAMETERS, ...FILL_GRADIENT_GEOMETRY_PARAMETERS, ...PATTERN_PARAMETERS, ...TEXTURE_PARAMETERS].map(parameter => ({ ...parameter, semanticPath: parameter.semanticPath.replace(/^style\.fill/, 'slides[].background') })),
	}),
	surface({
		id: 'pattern',
		field: 'style.fill.pattern / fill.type:pattern',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Native preset pattern fill with foreground and background colors.',
		canonical: [...PATTERN_PRESETS],
		parameters: PATTERN_PARAMETERS,
		examples: [{ type: 'pattern', pattern: { preset: 'dkUpDiag', foreground: 'FFFFFF', background: '07111F' } }],
	}),
	surface({
		id: 'texture',
		field: 'style.fill.texture / fill.type:texture',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Native picture/texture fill. Asset-backed, generated recipes, and harvested native PowerPoint preset textures (24 COM PresetTextured JPEGs) serialize as tiled DrawingML blipFill. Generation recipes survive export_spec; PowerPoint can retile/replace pixels, not edit the algorithm.',
		schema: {
			source: { kind: 'asset | generated | nativePreset' },
			placement: { mode: 'tile | stretch', scaleX: '0-2', scaleY: '0-2', offsetX: 'inches', offsetY: 'inches', alignment: 'tl|t|tr|l|ctr|r|bl|b|br', flip: 'none|x|y|xy', rotateWithShape: 'boolean' },
			editability: { powerPointFillParameters: 'ui-editable', embeddedTexturePixels: 'asset-editable', generationRecipe: 'mcp-regenerable' },
		},
		canonical: ['grain', 'filmGrain', 'paperFibre', 'speckle', 'halftone', 'scanlines', 'dotGrid', 'weave', 'clouds', 'starField', 'bokeh', 'metallicNoise', 'blueprintGrid'],
		parameters: TEXTURE_PARAMETERS,
		examples: [
			{ type: 'texture', texture: { source: { kind: 'asset', asset: 'asset://...' }, placement: { mode: 'tile', scaleX: 0.35, scaleY: 0.35 }, transparency: 0.72 } },
			{ type: 'texture', texture: { source: { kind: 'nativePreset', presetId: 'texture.canvas' }, placement: { mode: 'tile' } } },
		],
	}),
	surface({
		id: 'duotone',
		field: 'imageAdjustments.duotone / imageOptions.duotone',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Native picture duotone with dark and light colors.',
		parameters: [
			{ id: 'colorMode', type: 'discrete', valueType: 'enum', canonical: ['normal', 'duotone'], default: 'normal', semanticPath: 'imageAdjustments.colorMode', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'dark', type: 'composite', valueType: 'object', semanticPath: 'imageAdjustments.duotone.dark', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'light', type: 'composite', valueType: 'object', semanticPath: 'imageAdjustments.duotone.light', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			...Object.entries(PICTURE_COLOR_ENDPOINT_PARAMETERS).map(([id, parameter]) => ({ id: `endpoint.${id}`, type: 'continuous', valueType: 'number', ...parameter, semanticPath: `imageAdjustments.duotone.{dark|light}.${id}`, capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' })),
		],
		examples: [{ colorMode: 'duotone', duotone: { dark: '07111F', light: '38BDF8' } }],
	}),
	surface({
		id: 'corrections',
		field: 'imageAdjustments / imageOptions.corrections',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Native Picture Format corrections. Brightness, contrast, sharpen/soften, saturation, temperature, and transparency serialize as editable native controls.',
		aliases: ['brightness', 'contrast', 'sharpness', 'saturation', 'temperature', 'transparency'],
		parameters: [
			...Object.entries(PICTURE_CORRECTION_PARAMETERS).map(([id, parameter]) => ({ id, type: 'continuous', valueType: 'number', ...parameter, semanticPath: `imageAdjustments.${id}`, capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' })),
		],
		examples: [{ brightness: 0.06, contrast: 0.12 }],
	}),
	surface({
		id: 'recolor',
		field: 'imageAdjustments.colorMode / imageOptions.recolor',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Native Picture Format recolor as a two-endpoint color mapping. Endpoints accept hex, the complete DrawingML theme-color domain, or preset colors plus continuous tint, shade, saturation, and opacity transforms.',
		valueDomains: {
			scheme: ['tx1', 'tx2', 'bg1', 'bg2', 'dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink', 'phClr'],
		},
		parameters: [
			{ id: 'colorMode', type: 'discrete', valueType: 'enum', canonical: ['normal', 'grayscale', 'recolor'], default: 'normal', semanticPath: 'imageAdjustments.colorMode', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'dark', type: 'composite', valueType: 'object', semanticPath: 'imageAdjustments.recolor.dark', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'light', type: 'composite', valueType: 'object', semanticPath: 'imageAdjustments.recolor.light', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			...Object.entries(PICTURE_COLOR_ENDPOINT_PARAMETERS).map(([id, parameter]) => ({ id: `endpoint.${id}`, type: 'continuous', valueType: 'number', ...parameter, semanticPath: `imageAdjustments.recolor.{dark|light}.${id}`, capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' })),
		],
		aliases: ['grayscale', 'colour'],
		examples: [{ colorMode: 'grayscale' }, { colorMode: 'recolor', recolor: { dark: 'black', light: { scheme: 'accent4', tint: 0.45, saturation: 4 } } }],
	}),
	surface({
		id: 'artisticEffect',
		field: 'imageAdjustments.artisticEffect',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Native Picture Format artistic effects with every persistent desktop PowerPoint slider exposed as a typed, clamped parameter. Omitted attributes use the PowerPoint-authored default for that effect. Background removal is not a live effect in the saved package.',
		canonical: [...ARTISTIC_EFFECTS],
		parameters: ARTISTIC_EFFECT_PARAMETER_CATALOG,
		examples: [{ type: 'blur', radius: 18 }, { type: 'cement', transparency: 0.42, crackSpacing: 31 }, { type: 'paintBrush', transparency: 0.2, brushSize: 4 }, { type: 'paintStrokes', transparency: 0.05, intensity: 9 }],
	}),
	surface({
		id: 'imageAdjustments',
		field: 'imageAdjustments / imageOptions',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Picture Format adjustment surface with native brightness, contrast, sharpen/soften, saturation, temperature, grayscale, theme-aware recolor/duotone, nested or top-level transparency, and fully parameterized persistent artistic-effect sliders.',
		parameters: [
			...Object.entries(PICTURE_CORRECTION_PARAMETERS).map(([id, parameter]) => ({ id, type: 'continuous', valueType: 'number', ...parameter, semanticPath: `imageAdjustments.${id}`, capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', ...(id === 'transparency' ? { aliasOf: 'content[].transparency' } : {}) })),
			{ id: 'colorMode', type: 'discrete', valueType: 'enum', canonical: ['normal', 'grayscale', 'duotone', 'recolor'], default: 'normal', semanticPath: 'imageAdjustments.colorMode', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'duotone', type: 'composite', valueType: 'object', semanticPath: 'imageAdjustments.duotone', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'recolor', type: 'composite', valueType: 'object', semanticPath: 'imageAdjustments.recolor', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
			{ id: 'artisticEffect', type: 'composite', valueType: 'object', semanticPath: 'imageAdjustments.artisticEffect', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured' },
		],
		examples: [{ brightness: 0.06, contrast: 0.12, sharpness: 0.35, saturation: 1.25, temperature: 5400 }],
	}),
	surface({
		id: 'shape3D',
		field: 'options.effect3D / options.text3D',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Shape and text 3-D: independently editable top/bottom bevel, extrusion, contour, material, lighting, and X/Y/Z rotation controls. Camera FOV and Z position remain explicit boundaries where the carrier does not expose them.',
		parameters: [
			{ id: 'bevelTopWidthPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1000, default: 6, step: 0.01, unit: 'points', semanticPath: 'options.effect3D.bevel.width', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/a:bevelT/@w = round(bevel.width * 12700)', limitation: 'PowerPoint may omit the neutral default bevel node while retaining the default value; this is an explicit canonical serialization boundary.' },
			{ id: 'bevelTopHeightPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1000, default: 6, step: 0.01, unit: 'points', semanticPath: 'options.effect3D.bevel.height', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/a:bevelT/@h = round(bevel.height * 12700)', limitation: 'PowerPoint may omit the neutral default bevel node while retaining the default value; this is an explicit canonical serialization boundary.' },
			{ id: 'bevelTopPreset', type: 'discrete', valueType: 'string', values: ['angle', 'artDeco', 'circle', 'convex', 'coolSlant', 'cross', 'divot', 'hardEdge', 'relaxedInset', 'riblet', 'slope', 'softRound'], semanticPath: 'options.effect3D.bevel.type', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/a:bevelT/@prst' },
			{ id: 'bevelBottomWidthPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1000, default: 6, step: 0.01, unit: 'points', semanticPath: 'options.effect3D.bevelBottom.width', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/a:bevelB/@w = round(bevelBottom.width * 12700)' },
			{ id: 'bevelBottomHeightPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1000, default: 6, step: 0.01, unit: 'points', semanticPath: 'options.effect3D.bevelBottom.height', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/a:bevelB/@h = round(bevelBottom.height * 12700)' },
			{ id: 'bevelBottomPreset', type: 'discrete', valueType: 'string', values: ['angle', 'artDeco', 'circle', 'convex', 'coolSlant', 'cross', 'divot', 'hardEdge', 'relaxedInset', 'riblet', 'slope', 'softRound'], semanticPath: 'options.effect3D.bevelBottom.type', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/a:bevelB/@prst' },
			{ id: 'extrusionPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 5000, default: 0, step: 1 / 12700, unit: 'points', semanticPath: 'options.effect3D.extrusion', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/@extrusionH = round(extrusion * 12700)' },
			{ id: 'extrusionColor', type: 'color', valueType: 'hex', semanticPath: 'options.effect3D.extrusionColor', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/a:extrusionClr' },
			{ id: 'material', type: 'discrete', valueType: 'string', values: ['legacyMatte', 'legacyPlastic', 'legacyMetal', 'legacyWireframe', 'matte', 'plastic', 'metal', 'warmMatte', 'translucentPowder', 'powder', 'dkEdge', 'softEdge', 'clear', 'flat', 'softmetal'], semanticPath: 'options.effect3D.material', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/@prstMaterial' },
			{ id: 'lightRig', type: 'discrete', valueType: 'string', values: ['balanced', 'brightRoom', 'chilly', 'contrasting', 'flat', 'flood', 'freezing', 'glow', 'harsh', 'legacyFlat1', 'legacyFlat2', 'legacyFlat3', 'legacyFlat4', 'legacyHarsh1', 'legacyHarsh2', 'legacyHarsh3', 'legacyHarsh4', 'legacyNormal1', 'legacyNormal2', 'legacyNormal3', 'legacyNormal4', 'morning', 'soft', 'sunrise', 'sunset', 'threePt', 'twoPt'], semanticPath: 'options.effect3D.lightRig', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:scene3d/a:lightRig/@rig' },
			{ id: 'lightDirectionDeg', type: 'continuous', valueType: 'number', minimum: 0, maximum: 359, default: 0, step: 0.01, unit: 'degrees', semanticPath: 'options.effect3D.lightDirection', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:scene3d/a:lightRig/a:rot/@rev = round(lightDirection * 60000)' },
			{ id: 'rotationX', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 1 / 60000, unit: 'degrees', semanticPath: 'options.effect3D.rotationX', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:scene3d/a:camera/a:rot/@lat = normalize(rotationX * 60000)' },
			{ id: 'rotationY', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 1 / 60000, unit: 'degrees', semanticPath: 'options.effect3D.rotationY', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:scene3d/a:camera/a:rot/@lon = normalize(rotationY * 60000)' },
			{ id: 'rotationZ', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 1 / 60000, unit: 'degrees', semanticPath: 'options.effect3D.rotationZ', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:scene3d/a:camera/a:rot/@rev = normalize(rotationZ * 60000)' },
			{ id: 'contourWidthPt', type: 'continuous', valueType: 'number', minimum: 0, maximum: 1000, default: 0, step: 0.01, unit: 'points', semanticPath: 'options.effect3D.contourWidth', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/@contourW = round(contourWidth * 12700)' },
			{ id: 'contourColor', type: 'color', valueType: 'hex', semanticPath: 'options.effect3D.contourColor', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:sp3d/a:contourClr' },
		],
		examples: [{ bevel: { type: 'circle', width: 4, height: 4 }, extrusion: 8, extrusionColor: '6D28D9', material: 'warmMatte', lightRig: 'threePt', rotationX: 12, rotationY: 8, rotationZ: 0 }],
	}),
	surface({
		id: 'picture3D',
		field: 'pictureStyle.threeD',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Native Picture Format 3-D camera controls. The independent perspectiveDeg field is serialized as the retained camera field of view; camera presets, rotation, light rig, material, extrusion, contour, and bevel remain separately discoverable controls.',
		parameters: [
			{ id: 'perspectiveDeg', type: 'continuous', valueType: 'number', minimum: 0, maximum: 120, default: 45, step: 0.1, unit: 'degrees', semanticPath: 'pictureStyle.threeD.camera.perspectiveDeg', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:camera/@fov = round(perspectiveDeg * 60000)' },
			{ id: 'rotationX', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 0.1, unit: 'degrees', semanticPath: 'pictureStyle.threeD.camera.rotation.xDeg', capabilityMode: 'parameterized', capabilityStatus: 'structured-partial', serializer: 'a:camera/a:rot/@lat = fixed-angle(rotationX)', limitation: 'PowerPoint SaveAs/reopen does not retain most non-zero camera latitude values; use the explicit Office roundtrip boundary proof rather than assuming exact retained readback.' },
			{ id: 'rotationY', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 0.1, unit: 'degrees', semanticPath: 'pictureStyle.threeD.camera.rotation.yDeg', capabilityMode: 'parameterized', capabilityStatus: 'structured-partial', serializer: 'a:camera/a:rot/@lon = fixed-angle(rotationY)', limitation: 'PowerPoint SaveAs/reopen retention for camera longitude is a separate measured boundary; do not infer exact retained readback from serializer acceptance.' },
			{ id: 'rotationZ', type: 'continuous', valueType: 'number', minimum: -360, maximum: 360, default: 0, step: 0.1, unit: 'degrees', semanticPath: 'pictureStyle.threeD.camera.rotation.zDeg', capabilityMode: 'parameterized', capabilityStatus: 'executable-exact-structured', serializer: 'a:camera/a:rot/@rev = fixed-angle(-rotationZ) to match PowerPoint camera-roll direction', limitation: 'PowerPoint retains the camera roll endpoint through SaveAs/reopen; ±180 degrees are equivalent canonical endpoints.' },
		],
		examples: [{ threeD: { camera: { preset: 'perspectiveFront', perspectiveDeg: 67.5 } } }, { threeD: { camera: { preset: 'perspectiveFront', rotation: { xDeg: 25.5 } } } }],
	}),
	surface({
		id: 'atmosphere',
		field: 'content[].kind:atmosphere',
		status: 'executable',
		editability: 'ui-editable',
		description: 'Semantic atmosphere compositor. The AI chooses layers, color, intensity, and purpose. The engine lowers them to native fills, shapes, effect lists, and only the smallest unsupported remainder as an owner-linked effect-only asset.',
		examples: [{
			kind: 'atmosphere',
			objectName: 'hero-atmosphere',
			representationPolicy: 'maximize-native',
			layers: [
				{ kind: 'gradientField', intent: 'deep-blue-violet-luminous-field', intensity: 0.8 },
				{ kind: 'radialLight', anchor: 'upper-right', color: '38BDF8', spread: 0.45, softness: 0.82 },
				{ kind: 'grain', amount: 0.08, representationPreference: ['native-texture-fill', 'generated-tile-texture'] },
				{ kind: 'vignette', strength: 0.36 },
			],
		}],
	}),
])

export function matchNativeVisualSurface(needle = '') {
	const token = String(needle || '').trim().toLowerCase().replace(/[-_\s]/g, '')
	if (!token) return [...NATIVE_VISUAL_SURFACES]
	const exact = NATIVE_VISUAL_SURFACES.filter(item => String(item.id).toLowerCase().replace(/[-_\s]/g, '') === token)
	if (exact.length) return exact
	const exactParameter = NATIVE_VISUAL_SURFACES.filter(item => {
		const parameterRows = Array.isArray(item.parameters)
			? item.parameters
			: Object.values(item.parameters || {}).flat()
		return parameterRows.some(parameter => String(parameter.id || '').toLowerCase().replace(/[-_\s]/g, '') === token)
	})
	if (exactParameter.length) return exactParameter
	return NATIVE_VISUAL_SURFACES.filter(item => {
		const parameterRows = Array.isArray(item.parameters)
			? item.parameters
			: Object.values(item.parameters || {}).flat()
		const hay = [item.id, item.field, ...(item.aliases || []), ...parameterRows.flatMap(parameter => [parameter.id, parameter.semanticPath])].join(' ').toLowerCase().replace(/[-_\s]/g, '')
		return hay.includes(token) || token.includes(String(item.id).toLowerCase())
	})
}

export function normalizeShadow(input) {
	if (!input || typeof input !== 'object') return input
	const typeRaw = String(input.type || 'outer').replace(/shadow$/i, '')
	const type = /inner/i.test(typeRaw) ? 'inner' : /none/i.test(typeRaw) ? 'none' : 'outer'
	const blur = num(input.blurPt ?? input.blur ?? input.size, undefined)
	const offset = num(input.distancePt ?? input.offset ?? input.distance, undefined)
	const angle = num(input.angleDeg ?? input.angle, undefined)
	return {
		type,
		...(input.color ? { color: String(input.color).replace(/^#/, '') } : {}),
		...(input.opacity != null ? { opacity: clamp(num(input.opacity, 0.4), 0, 1) } : {}),
		...(blur != null ? { blur } : {}),
		...(offset != null ? { offset } : {}),
		...(angle != null ? { angle } : {}),
		...(input.scaleX != null ? { scaleX: clamp(num(input.scaleX, 1), 0, 2) } : {}),
		...(input.scaleY != null ? { scaleY: clamp(num(input.scaleY, 1), 0, 2) } : {}),
		...(input.skewXDeg != null || input.skewX != null ? { skewX: num(input.skewXDeg ?? input.skewX, 0) } : {}),
		...(input.skewYDeg != null || input.skewY != null ? { skewY: num(input.skewYDeg ?? input.skewY, 0) } : {}),
		rotateWithShape: input.rotateWithShape === true,
	}
}

export function normalizeGlow(input) {
	if (!input || typeof input !== 'object') return input
	return {
		color: String(input.color || '00FFFF').replace(/^#/, ''),
		opacity: clamp(num(input.opacity, 0.75), 0, 1),
		size: num(input.radiusPt ?? input.size ?? input.rad, 8),
	}
}

export function normalizeSoftEdge(input) {
	if (input == null) return input
	if (typeof input === 'number') return { size: input }
	return { size: num(input.radiusPt ?? input.size, 8) }
}

export function normalizeReflection(input) {
	if (!input || typeof input !== 'object') return input
	const fadeStart = input.startPosition != null
		? Math.round(clamp(num(input.startPosition, 0), 0, 1) * 100)
		: Math.round(clamp(num(input.fadeStart, 0), 0, 100))
	const fadeEnd = input.endPosition != null
		? Math.round(clamp(num(input.endPosition, 0.55), 0, 1) * 100)
		: Math.round(clamp(num(input.fadeEnd, 55), 0, 100))
	return {
		blur: num(input.blurPt ?? input.blur, 0),
		offset: num(input.distancePt ?? input.offset, 0),
		angle: num(input.directionDeg ?? input.angle, 90),
		opacity: clamp(num(input.startOpacity ?? input.opacity, 0.5), 0, 1),
		endOpacity: clamp(num(input.endOpacity, 0), 0, 1),
		fadeStart,
		fadeEnd,
		scaleY: clamp(num(input.scaleY, -100), -1000, 1000),
	}
}

export function normalizeBlur(input) {
	if (input == null) return input
	if (typeof input === 'number') return { radiusPt: input, grow: true }
	return {
		radiusPt: num(input.radiusPt ?? input.radius ?? input.size, 8),
		grow: input.growBounds !== false && input.grow !== false,
	}
}

export function normalizeFillOverlay(input) {
	if (!input || typeof input !== 'object') return input
	const blend = String(input.blendMode || input.blend || 'multiply').toLowerCase()
	const allowed = new Set([...FILL_OVERLAY_BLENDS, 'mult'])
	if (!allowed.has(blend)) throw new Error(`fillOverlay blend must be one of: ${FILL_OVERLAY_BLENDS.join(', ')}`)
	const mapped = blend === 'multiply' ? 'mult' : blend
	const fill = input.fill && typeof input.fill === 'object' ? input.fill : { type: 'solid', color: input.color || '102A43', transparency: input.transparency ?? 0.3 }
	return { blend: mapped, fill }
}

export function applyEffectsArray(target = {}, effects = []) {
	const next = { ...target }
	for (const effect of Array.isArray(effects) ? effects : []) {
		if (!effect || typeof effect !== 'object') continue
		const type = String(effect.type || '').toLowerCase()
		if (type === 'outershadow' || type === 'innershadow' || type === 'shadow') next.shadow = normalizeShadow({ ...effect, type })
		else if (type === 'glow') next.glow = normalizeGlow(effect)
		else if (type === 'softedge' || type === 'softedges') next.softEdges = normalizeSoftEdge(effect)
		else if (type === 'reflection') next.reflection = normalizeReflection(effect)
		else if (type === 'blur') next.blur = normalizeBlur(effect)
		else if (type === 'filloverlay' || type === 'overlay') next.fillOverlay = normalizeFillOverlay(effect)
	}
	return next
}

export function normalizeImageAdjustments(input = {}) {
	if (!input || typeof input !== 'object') return null
	const src = input.imageAdjustments || input.corrections || input
	const recolor = src.recolor && typeof src.recolor === 'object' ? src.recolor : null
	const duotone = src.duotone && typeof src.duotone === 'object' ? src.duotone : null
	const colorMode = String(src.colorMode || (recolor ? 'recolor' : duotone ? 'duotone' : src.grayscale ? 'grayscale' : 'normal')).toLowerCase()
	return {
		...(src.brightness != null ? { brightness: clamp(num(src.brightness, 0), -1, 1) } : {}),
		...(src.contrast != null ? { contrast: clamp(num(src.contrast, 0), -1, 1) } : {}),
		...(src.sharpness != null ? { sharpness: clamp(num(src.sharpness, 0), -1, 1) } : {}),
		...(src.saturation != null ? { saturation: clamp(num(src.saturation, 1), 0, 4) } : {}),
		...(src.temperature != null ? { temperature: clamp(num(src.temperature, 6500), 1500, 11500) } : {}),
		...(src.transparency != null ? { transparency: clamp(num(src.transparency, 0), 0, 100) } : {}),
		colorMode,
		...(duotone ? { duotone: { dark: normalizePictureColorEndpoint(duotone.dark), light: normalizePictureColorEndpoint(duotone.light) } } : {}),
		...(recolor ? { recolor: { dark: normalizePictureColorEndpoint(recolor.dark), light: normalizePictureColorEndpoint(recolor.light) } } : {}),
		...(src.artisticEffect ? { artisticEffect: normalizeArtisticEffect(src.artisticEffect) } : {}),
	}
}

export function normalizeArtisticEffect(input) {
	if (!input) return null
	const authored = typeof input === 'string' ? { type: input } : input
	if (!authored || typeof authored !== 'object') throw new Error('artisticEffect must be a string or object')
	const requested = String(authored.type || authored.id || '').trim()
	const token = requested.toLowerCase().replace(/^artistic[._-]?/, '').replace(/[-_\s]/g, '')
	const type = ARTISTIC_EFFECTS.find(candidate => candidate.toLowerCase().replace(/[-_\s]/g, '') === token)
	if (!type) throw new Error(`artisticEffect.type must be one of: ${ARTISTIC_EFFECTS.join(', ')}`)
	const source = { ...authored, ...(authored.parameters && typeof authored.parameters === 'object' ? authored.parameters : {}) }
	const normalized = { type }
	for (const parameter of ARTISTIC_EFFECT_PARAMETER_CATALOG[type] || []) {
		let value
		let sourceKey
		for (const key of [parameter.id, ...(parameter.aliases || [])]) {
			if (Object.prototype.hasOwnProperty.call(source, key) && source[key] != null && source[key] !== '') {
				value = num(source[key], parameter.default)
				sourceKey = key
				break
			}
		}
		if (value == null) continue
		if (sourceKey === 'trans' && Math.abs(value) > 1) value /= 100000
		else if (sourceKey === 'bright' && Math.abs(value) > 1) value /= 100000
		const clamped = clamp(value, parameter.minimum, parameter.maximum)
		normalized[parameter.id] = parameter.unit === 'integer' || parameter.unit === 'points' || parameter.unit === 'kelvin'
			? Math.round(clamped)
			: clamped
	}
	return normalized
}

function normalizePictureColorEndpoint(input) {
	if (typeof input === 'string') return input.replace(/^#/, '')
	if (!input || typeof input !== 'object') return input
	return {
		...(input.color ? { color: String(input.color).replace(/^#/, '') } : {}),
		...(input.scheme ? { scheme: String(input.scheme) } : {}),
		...(input.preset ? { preset: String(input.preset) } : {}),
		...(input.tint != null ? { tint: clamp(num(input.tint, 0), 0, 1) } : {}),
		...(input.shade != null ? { shade: clamp(num(input.shade, 0), 0, 1) } : {}),
		...(input.saturation != null || input.saturationMultiplier != null ? { saturation: clamp(num(input.saturation ?? input.saturationMultiplier, 1), 0, 4) } : {}),
		...(input.opacity != null ? { opacity: clamp(num(input.opacity, 1), 0, 1) } : {}),
	}
}

export function atmosphereReadback(nodes = []) {
	const counts = {
		sourceNodes: nodes.length,
		exactNativeNodes: 0,
		nativeApproximationNodes: 0,
		nativePreservedNodes: 0,
		minimalFallbackNodes: 0,
		unresolvedNodes: 0,
		semanticContentRasterized: 0,
		wholeSlideRasterized: false,
		uiEditableObjects: 0,
		nativePreservedObjects: 0,
		rasterEffectObjects: 0,
	}
	for (const node of nodes) {
		const status = String(node?.status || '')
		if (status === 'exact-native') { counts.exactNativeNodes += 1; counts.uiEditableObjects += 1 }
		else if (status === 'native-approximation') { counts.nativeApproximationNodes += 1; counts.uiEditableObjects += 1 }
		else if (status === 'native-preserved') { counts.nativePreservedNodes += 1; counts.nativePreservedObjects += 1 }
		else if (status === 'minimal-fallback') { counts.minimalFallbackNodes += 1; counts.rasterEffectObjects += 1 }
		else counts.unresolvedNodes += 1
		if (node?.wholeSlideRasterized) counts.wholeSlideRasterized = true
	}
	const native = counts.exactNativeNodes + counts.nativeApproximationNodes + counts.nativePreservedNodes
	counts.structuralNativeCoverage = nodes.length ? Number((native / nodes.length).toFixed(2)) : null
	counts.editabilityCoverage = nodes.length ? Number((counts.uiEditableObjects / nodes.length).toFixed(2)) : null
	counts.coverageStatus = nodes.length ? 'measured-structurally' : 'not-applicable'
	counts.perceptualVerification = { status: 'not-performed', renderPerformed: false }
	return counts
}

function num(value, fallback) {
	const n = Number(value)
	return Number.isFinite(n) ? n : fallback
}

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value))
}
