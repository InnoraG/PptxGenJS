import assert from 'node:assert/strict'
import test from 'node:test'
import { listOptionCatalog } from '../option-registry.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { expandAtmosphereBlock, expandAtmosphereSpec } from '../ir/atmosphere-compositor.mjs'
import { applyEffectsArray, matchNativeVisualSurface, normalizeReflection, normalizeShadow, NATIVE_PLACEHOLDER_TYPES, NATIVE_PLACEHOLDER_ORIENTATIONS } from '../ir/native-visual-primitives.mjs'
import { PLANNED_CAPABILITIES, IMPLEMENTED_VISUAL_CAPABILITIES, NOT_PURSUED_CAPABILITIES } from '../public-manifest.mjs'
import { listVoices } from '../narration/licenseGate.mjs'

const REQUIRED_SURFACES = [
	'shadow', 'textShadow', 'glow', 'reflection', 'textReflection', 'softEdge', 'blur', 'effectDag',
	'duotone', 'artisticEffect', 'corrections', 'recolor', 'pattern', 'texture', 'background',
	'line', 'themeColorScheme',
	'layoutsThemesMasters',
]

test('options.catalog exposes parameterized native visual primitives', () => {
	for (const id of REQUIRED_SURFACES) {
		const result = listOptionCatalog({ surface: id, format: 'full' })
		assert.ok(result.count >= 1, `missing catalog surface for ${id}`)
		assert.equal(result.surfaces[0].id, id)
		assert.ok(result.surfaces[0].examples)
		assert.ok(result.surfaces[0].status)
	}
})

test('custom outer shadow aliases normalize to DrawingML fields', () => {
	const shadow = normalizeShadow({
		type: 'outerShadow',
		color: '101828',
		opacity: 0.42,
		blurPt: 18,
		distancePt: 7,
		angleDeg: 135,
		scaleX: 1,
		scaleY: 0.8,
		skewYDeg: 4,
		rotateWithShape: false,
	})
	assert.equal(shadow.type, 'outer')
	assert.equal(shadow.blur, 18)
	assert.equal(shadow.offset, 7)
	assert.equal(shadow.angle, 135)
	assert.equal(shadow.scaleY, 0.8)
	assert.equal(shadow.skewY, 4)
})

test('reflection normalizer accepts semantic fractions and legacy percentages without drift', () => {
	assert.deepEqual(
		{ fadeStart: normalizeReflection({ startPosition: 0.2 }).fadeStart, fadeEnd: normalizeReflection({ endPosition: 0.55 }).fadeEnd },
		{ fadeStart: 20, fadeEnd: 55 },
	)
	assert.deepEqual(
		{ fadeStart: normalizeReflection({ fadeStart: 20 }).fadeStart, fadeEnd: normalizeReflection({ fadeEnd: 55 }).fadeEnd },
		{ fadeStart: 20, fadeEnd: 55 },
	)
	assert.equal(normalizeReflection({ scaleY: -72 }).scaleY, -72)
})

test('atmosphere compositor lowers semantic layers to native shapes', () => {
	const result = expandAtmosphereBlock({
		kind: 'atmosphere',
		objectName: 'hero-atmosphere',
		layers: [
			{ kind: 'gradientField', intensity: 0.8 },
			{ kind: 'radialLight', color: '38BDF8', softness: 0.82 },
			{ kind: 'grain', amount: 0.08 },
			{ kind: 'vignette', strength: 0.36 },
		],
	})
	assert.equal(result.content.length, 4)
	assert.equal(result.content[0].style.fill.type, 'gradient')
	assert.ok(result.content[1].style.blur.radiusPt > 0)
	assert.equal(result.content[2].style.fill.type, 'texture')
	assert.equal(result.content[2].style.fill.texture.source.kind, 'generated')
	assert.equal(result.atmosphereReadback.wholeSlideRasterized, false)
	assert.ok(result.atmosphereReadback.exactNativeNodes + result.atmosphereReadback.nativeApproximationNodes >= 3)
})

test('JSON spec atmosphere kind expands before layout', () => {
	const spec = expandAtmosphereSpec({
		slides: [{
			id: 's1',
			content: [{ kind: 'atmosphere', objectName: 'field', layers: [{ kind: 'mist', density: 0.2 }] }],
		}],
	})
	assert.equal(spec.slides[0].content[0].kind, 'shape')
	assert.equal(spec.slides[0].content[0].style.fill.type, 'solid')
})

test('planned capabilities replace auto-rasterize remainder', () => {
	assert.ok(!PLANNED_CAPABILITIES.includes('auto-rasterize-unsupported-html-remainder'))
	assert.ok(!PLANNED_CAPABILITIES.includes('native-effect-graph'))
	assert.ok(NOT_PURSUED_CAPABILITIES.includes('native-effect-graph-authoring'))
	assert.ok(PLANNED_CAPABILITIES.includes('minimal-unsupported-effect-asset-synthesis'))
	assert.ok(PLANNED_CAPABILITIES.includes('powerpoint-timing-tree-reopen'))
	assert.ok(IMPLEMENTED_VISUAL_CAPABILITIES.includes('parameterized-native-visual-primitives'))
	assert.ok(IMPLEMENTED_VISUAL_CAPABILITIES.includes('native-atmosphere-decomposition'))
	assert.ok(IMPLEMENTED_VISUAL_CAPABILITIES.includes('picture-adjustments-brightness-contrast-grayscale-duotone'))
	assert.ok(IMPLEMENTED_VISUAL_CAPABILITIES.includes('picture-saturation-temperature-recolor-real-sharpness'))
	assert.ok(IMPLEMENTED_VISUAL_CAPABILITIES.includes('picture-artistic-effects-all-persistent-sliders-parameterized'))
	assert.ok(IMPLEMENTED_VISUAL_CAPABILITIES.includes('native-preset-texture-fills'))
})

test('production-approved voice count excludes lineage-review voices', () => {
	const listed = listVoices({ allowUnreviewedVoices: true })
	assert.equal(listed.productionApprovedCount, listed.voices.filter(v => v.reviewStatus === 'approved' && !v.lineageReview && (v.commercialUse === 'allowed' || v.commercialUse === 'attribution')).length)
	assert.ok(listed.count >= listed.productionApprovedCount)
})

test('visual surface matcher finds effect list product surface and picture corrections', () => {
	assert.equal(matchNativeVisualSurface('effects')[0].status, 'executable')
	assert.equal(matchNativeVisualSurface('effectDag')[0].status, 'not-pursued')
	assert.equal(matchNativeVisualSurface('artisticEffect')[0].status, 'executable')
	assert.equal(matchNativeVisualSurface('corrections')[0].status, 'executable')
	assert.equal(matchNativeVisualSurface('texture')[0].status, 'executable')
	assert.equal(matchNativeVisualSurface('themeColorScheme')[0].status, 'executable')
})

test('text-character shadow and reflection expose complete independent slider contracts', () => {
	const shadow = listOptionCatalog({ surface: 'textShadow', format: 'full' }).surfaces[0]
	assert.equal(shadow.capabilityStatus, 'executable-exact-structured')
	assert.deepEqual(shadow.applicability, ['text', 'wordArt'])
	for (const id of ['type', 'color', 'opacity', 'blurPt', 'distancePt', 'angleDeg', 'scaleX', 'scaleY', 'skewXDeg', 'skewYDeg', 'rotateWithShape']) {
		assert.ok(shadow.parameters.some(parameter => parameter.id === id), `missing text shadow parameter ${id}`)
	}
	assert.equal(shadow.parameters.find(parameter => parameter.id === 'blurPt').maximum, 100)
	assert.equal(shadow.parameters.find(parameter => parameter.id === 'distancePt').maximum, 200)
	assert.ok(shadow.parameters.every(parameter => String(parameter.reset || '').includes('null')))

	const reflection = listOptionCatalog({ surface: 'textReflection', format: 'full' }).surfaces[0]
	assert.equal(reflection.capabilityStatus, 'executable-exact-structured')
	assert.deepEqual(reflection.applicability, ['text', 'wordArt'])
	for (const id of ['blurPt', 'distancePt', 'directionDeg', 'startOpacity', 'endOpacity', 'startPosition', 'endPosition', 'scaleY']) {
		assert.ok(reflection.parameters.some(parameter => parameter.id === id), `missing text reflection parameter ${id}`)
	}
	assert.equal(reflection.parameters.find(parameter => parameter.id === 'directionDeg').maximum, 359)
	assert.equal(reflection.parameters.find(parameter => parameter.id === 'scaleY').minimum, -1000)
	assert.ok(reflection.parameters.every(parameter => String(parameter.reset || '').includes('null')))
})

test('text-effect semantic aliases survive compiler lowering on initial authoring', () => {
	const plan = buildSpecOperationPlan({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'text effect carrier',
		motionTime: { masterClock: 'static', timingSource: 'authored', syncPolicy: 'one' },
		slides: [{ id: 's1', title: 'Text effects', layoutIntent: 'title-only', content: [{
			kind: 'textBox', name: 'effects', text: 'Native', style: {
				textShadow: { type: 'outer', blurPt: 6, distancePt: 5, angleDeg: 135, scaleX: 1.1, scaleY: 0.9, skewXDeg: 2, skewYDeg: -3, rotateWithShape: false },
				textReflection: { blurPt: 3, distancePt: 8, directionDeg: 270, startOpacity: 0.7, endOpacity: 0.12, startPosition: 0.08, endPosition: 0.72, scaleY: -72 },
			},
		}] }],
	}, { dryRun: true, plan: 'premium' })
	const options = plan.operations.find(item => item.tool === 'betterpptx.slide.add_text')?.args?.options
	assert.deepEqual(options.textShadow, { type: 'outer', blur: 6, offset: 5, angle: 135, scaleX: 1.1, scaleY: 0.9, skewX: 2, skewY: -3, rotateWithShape: false })
	assert.deepEqual(options.textReflection, { blur: 3, offset: 8, angle: 270, opacity: 0.7, endOpacity: 0.12, fadeStart: 8, fadeEnd: 72, scaleY: -72 })
})

test('text reflection remains on an actual WordArt carrier', () => {
	const plan = buildSpecOperationPlan({
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'wordart text effect',
		motionTime: { masterClock: 'static', timingSource: 'authored', syncPolicy: 'one' },
		slides: [{ id: 's1', title: 'WordArt', layoutIntent: 'title-only', content: [{
			kind: 'wordart', name: 'wordart', text: 'Reflect', wordArt: { transform: 'textArchUp' },
			style: { textReflection: { blurPt: 3, distancePt: 8, directionDeg: 90, startOpacity: 0.7, endOpacity: 0.12, startPosition: 0.08, endPosition: 0.72, scaleY: -88 } },
		}] }],
	}, { dryRun: true, plan: 'premium' })
	const operation = plan.operations.find(item => item.tool === 'betterpptx.slide.add_text')
	assert.equal(operation?.args?.options?.wordArt?.transform, 'textArchUp')
	assert.equal(operation?.args?.options?.textReflection?.offset, 8)
})

test('placeholder variants preserve the complete PresentationML attribute set', () => {
	assert.ok(NATIVE_PLACEHOLDER_TYPES.includes('clipArt'))
	assert.ok(NATIVE_PLACEHOLDER_TYPES.includes('dgm'))
	assert.deepEqual(NATIVE_PLACEHOLDER_ORIENTATIONS, ['horz', 'vert'])
	const plan = buildSpecOperationPlan({
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'placeholder variant carrier',
		motionTime: { masterClock: 'static', timingSource: 'authored', syncPolicy: 'one' },
		layouts: [{ name: 'VerticalGallery', width: 13.333, height: 7.5, placeholders: [{ name: 'diagramSlot', type: 'dgm', idx: 7, size: 'half', orient: 'vert', hasCustomPrompt: true, x: 1, y: 1, w: 5, h: 4 }] }],
		slides: [{ id: 's1', title: 'Placeholder', layoutName: 'VerticalGallery', content: [] }],
	}, { dryRun: true, plan: 'premium' })
	const operation = plan.operations.find(item => item.tool === 'betterpptx.deck.define_layout')
	assert.deepEqual(operation?.args?.placeholders?.[0], { name: 'diagramSlot', type: 'dgm', idx: 7, size: 'half', orient: 'vert', hasCustomPrompt: true, x: 1, y: 1, w: 5, h: 4 })
})

test('theme color scheme exposes all twelve independently resettable OOXML slots', () => {
	const surface = listOptionCatalog({ surface: 'themeColorScheme', format: 'full' }).surfaces.find(item => item.id === 'themeColorScheme')
	assert.ok(surface)
	assert.equal(surface.capabilityStatus, 'executable-exact-structured')
	assert.deepEqual(surface.parameters.map(item => item.id), ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'])
	assert.ok(surface.parameters.every(item => item.type === 'color' && item.reset.includes('null')))
})

test('slide background exposes typed solid carrier controls beyond gallery presets', () => {
	const surface = listOptionCatalog({ surface: 'background', format: 'full' }).surfaces.find(item => item.id === 'background')
	assert.ok(surface)
	assert.equal(surface.capabilityMode, 'parameterized')
	assert.equal(surface.capabilityStatus, 'structured-partial')
	for (const id of ['fillType', 'fillColor', 'fillTransparency']) {
		assert.ok(surface.parameters.some(parameter => parameter.id === id), `missing background parameter ${id}`)
	}
	const transparency = surface.parameters.find(parameter => parameter.id === 'fillTransparency')
	assert.equal(transparency.minimum, 0)
	assert.equal(transparency.maximum, 100)
	assert.equal(transparency.step, 0.001)
	assert.equal(transparency.semanticPath, 'slides[].background.transparency')
})

test('slide background keeps gradient, pattern, and texture leaves typed alongside solid controls', () => {
	const surface = listOptionCatalog({ surface: 'background', format: 'full' }).surfaces.find(item => item.id === 'background')
	assert.ok(surface)
	for (const id of ['gradientStopPosition', 'gradientStopColor', 'gradientStopColor.tint', 'gradientStopColor.shade', 'gradientStopColor.saturation', 'gradientStopColor.luminance', 'gradientStopColor.luminanceOffset', 'gradientStopColor.opacity', 'gradientStopTransparency', 'gradientDirection', 'gradientAngle', 'gradientFlip', 'rotateGradientWithShape', 'fillToRect.l', 'tileRect.b', 'patternPreset', 'patternForeground', 'patternBackground', 'textureMode', 'textureScaleX', 'textureScaleY', 'textureOffsetX', 'textureOffsetY', 'textureAlignment', 'textureFlip', 'textureRotateWithShape', 'textureTransparency']) {
		assert.ok(surface.parameters.some(parameter => parameter.id === id), `missing background extended parameter ${id}`)
	}
	assert.equal(surface.parameters.find(parameter => parameter.id === 'gradientAngle').maximum, 360)
	assert.equal(surface.parameters.find(parameter => parameter.id === 'textureScaleX').step, 0.00001)
	assert.equal(surface.parameters.find(parameter => parameter.id === 'textureOffsetX').minimum, -100)
})

test('gradient stop colour transforms survive generic spec lowering', () => {
	const plan = buildSpecOperationPlan({
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'gradient colour transforms',
		motionTime: { masterClock: 'static', timingSource: 'authored', syncPolicy: 'one' },
		slides: [{ id: 's1', title: 'Gradient transforms', layoutIntent: 'title-only', content: [{
			kind: 'shape', name: 'gradient', shapeName: 'rect', style: { fill: {
				type: 'gradient', gradientStops: [
					{ position: 0, color: { scheme: 'accent1', tint: 0.18, shade: 0.04, saturation: 1.25, luminance: 1.1, luminanceOffset: -0.08, opacity: 0.86 } },
					{ position: 100, color: { preset: 'white', opacity: 0.72 } },
				],
			} },
		}] }],
	}, { dryRun: true, plan: 'premium' })
	const operation = plan.operations.find(item => item.tool === 'betterpptx.slide.add_shape')
	const stops = operation?.args?.options?.fill?.gradientStops
	assert.equal(stops?.[0]?.color?.scheme, 'accent1')
	assert.equal(stops?.[0]?.color?.tint, 0.18)
	assert.equal(stops?.[0]?.color?.luminanceOffset, -0.08)
	assert.equal(stops?.[1]?.color?.preset, 'white')
})

test('theme, master, layout, and inheritance controls expose one typed resettable contract', () => {
	const surface = listOptionCatalog({ surface: 'layouts-themes-masters', format: 'full' }).surfaces.find(item => item.id === 'layoutsThemesMasters')
	assert.ok(surface)
	assert.equal(surface.capabilityMode, 'parameterized')
	assert.equal(surface.capabilityStatus, 'structured-partial')
	for (const id of ['theme.fontFace', 'theme.headFontFace', 'theme.bodyFontFace', 'theme.lang', 'layout.name', 'layout.width', 'layout.height', 'layout.type', 'layout.activate', 'layout.placeholders', 'layout.objects', 'layout.background', 'layout.margin', 'layout.slideNumber', 'slide.layoutName', 'slide.masterName', 'master.title', 'master.background', 'master.margin', 'master.slideNumber', 'master.objects', 'layoutContract.allowedLayouts', 'layoutContract.defaultLayout', 'layoutContract.strictLayout', 'layoutContract.placeholderBindings', 'layoutContract.safeContentAreas']) {
		assert.ok(surface.parameters.some(parameter => parameter.id === id), `missing inheritance parameter ${id}`)
	}
	assert.match(surface.schema.layout, /placeholders/)
	assert.equal(surface.parameters.find(parameter => parameter.id === 'layout.width').step, 0.000001)
	assert.equal(surface.parameters.find(parameter => parameter.id === 'layout.height').maximum, 56)
	assert.ok(surface.parameters.every(parameter => String(parameter.reset || '').includes('null') || String(parameter.reset || '').includes('omit')))
})

test('shape3D top bevel width and height expose exact structured status', () => {
	const surface = listOptionCatalog({ surface: 'shape3D', format: 'full' }).surfaces.find(item => item.id === 'shape3D')
	assert.ok(surface)
	assert.equal(surface.parameters.find(item => item.id === 'bevelTopWidthPt')?.capabilityStatus, 'executable-exact-structured')
	assert.equal(surface.parameters.find(item => item.id === 'bevelTopHeightPt')?.capabilityStatus, 'executable-exact-structured')
	assert.equal(surface.parameters.find(item => item.id === 'bevelTopWidthPt')?.minimum, 0)
	assert.equal(surface.parameters.find(item => item.id === 'bevelTopHeightPt')?.maximum, 1000)
	const textSurface = listOptionCatalog({ surface: 'text3DShape', format: 'full' }).surfaces.find(item => item.id === 'text3DShape')
	assert.equal(textSurface?.parameters.find(item => item.id === 'bevelTopWidthPt')?.capabilityStatus, 'executable-exact-structured')
	assert.equal(textSurface?.parameters.find(item => item.id === 'bevelTopHeightPt')?.capabilityStatus, 'executable-exact-structured')
})

test('effect list exposes the complete typed combination schema and lowers to native components', () => {
	const surface = listOptionCatalog({ surface: 'effects', format: 'full' }).surfaces[0]
	assert.equal(surface.id, 'effects')
	assert.equal(surface.parameters.length, 28)
	assert.ok(surface.parameters.some(parameter => parameter.id === 'reflection.scaleY' && parameter.minimum === -1000))
	assert.ok(surface.parameters.some(parameter => parameter.id === 'shadow.skewXDeg' && parameter.minimumExclusive === true))
	assert.ok(surface.parameters.some(parameter => parameter.id === 'fillOverlay.transparency' && parameter.step === 0.00001))
	const lowered = applyEffectsArray({}, [
		{ type: 'blur', radiusPt: 12, growBounds: false },
		{ type: 'outerShadow', color: '102030', opacity: 0.42, blurPt: 18, distancePt: 7, angleDeg: 135 },
		{ type: 'reflection', directionDeg: 90, startPosition: 0.1, endPosition: 0.7 },
		{ type: 'fillOverlay', blendMode: 'screen', transparency: 0.25, color: '38BDF8' },
	])
	assert.equal(lowered.blur.radiusPt, 12)
	assert.equal(lowered.blur.grow, false)
	assert.equal(lowered.shadow.blur, 18)
	assert.equal(lowered.shadow.offset, 7)
	assert.equal(lowered.reflection.fadeStart, 10)
	assert.equal(lowered.reflection.fadeEnd, 70)
	assert.equal(lowered.fillOverlay.blend, 'screen')
})

test('effect-list duplicate types are deterministic last-wins and arbitrary DAG ordering stays outside the structured contract', () => {
	const duplicate = applyEffectsArray({}, [
		{ type: 'glow', radiusPt: 2, opacity: 0.2 },
		{ type: 'glow', radiusPt: 9, opacity: 0.8 },
	])
	assert.equal(duplicate.glow.size, 9)
	assert.equal(duplicate.glow.opacity, 0.8)
	const reordered = applyEffectsArray({}, [
		{ type: 'glow', radiusPt: 9, opacity: 0.8 },
		{ type: 'glow', radiusPt: 2, opacity: 0.2 },
	])
	assert.equal(reordered.glow.size, 2)
	assert.equal(reordered.glow.opacity, 0.2)
	assert.notDeepEqual(duplicate.glow, reordered.glow)
})

test('shape and connector line contract validates typed ranges, enums, and reset', () => {
	const base = (line) => buildSpecOperationPlan({
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'line contract', layout: 'LAYOUT_WIDE',
		slides: [{ id: 's1', title: 'Line contract', message: 'Native line proof', layoutIntent: 'title-body', content: [
			{ kind: 'shape', name: 'shape-line', shape: 'rect', rect: { x: 1, y: 1, w: 2, h: 1 }, style: { fill: { color: 'FFFFFF' }, line } },
			{ kind: 'connector', name: 'connector-line', rect: { x: 1, y: 2.5, w: 2, h: 0 }, style: { line } },
		] }],
	}, { plan: 'premium', dryRun: true })
	const plan = base({ type: 'solid', color: '38BDF8', transparency: 18.25, width: 2.5, dashType: 'lgDash', beginArrowType: 'none', beginArrowWidth: 'sm', beginArrowLength: 'lg', endArrowType: 'triangle', endArrowWidth: 'lg', endArrowLength: 'sm' })
	const shape = plan.operations.find(item => item.tool === 'betterpptx.slide.add_shape' && item.objectName?.endsWith('.shape-line.shape'))
	const connector = plan.operations.find(item => item.tool === 'betterpptx.slide.add_connector' && item.objectName?.endsWith('.connector-line.connector'))
	assert.equal(shape.args.options.line.width, 2.5)
	assert.equal(shape.args.options.line.dashType, 'lgDash')
	assert.equal(connector.args.options.line.endArrowType, 'triangle')
	assert.equal(shape.args.options.line.beginArrowWidth, 'sm')
	assert.equal(shape.args.options.line.beginArrowLength, 'lg')
	assert.equal(connector.args.options.line.endArrowWidth, 'lg')
	assert.equal(connector.args.options.line.endArrowLength, 'sm')
	const reset = base(null)
	assert.equal(reset.operations.find(item => item.tool === 'betterpptx.slide.add_shape' && item.objectName?.endsWith('.shape-line.shape')).args.options.line.type, 'none')
	assert.throws(() => base({ width: 1584 + 1 }), /between 0 and 1584/)
	assert.throws(() => base({ width: 1.00001 }), /step/)
	assert.throws(() => base({ transparency: 0.0005 }), /step/)
	assert.throws(() => base({ dashType: 'dot' }), /dashType/)
	assert.throws(() => base({ endArrowType: 'block' }), /endArrowType/)
	assert.throws(() => base({ endArrowType: 'triangle', endArrowWidth: 'xl' }), /endArrowWidth/)
	assert.throws(() => base({ endArrowType: 'triangle', endArrowSize: 'lg' }), /beginArrowWidth and beginArrowLength|endArrowWidth and endArrowLength/)
})
