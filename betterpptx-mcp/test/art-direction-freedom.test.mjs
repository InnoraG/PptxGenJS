import assert from 'node:assert/strict'
import test from 'node:test'
import {
	artDirectionInfo, artDirectionSelectionForSpec, artMotionForSpec, artStageForSpec,
	artDepthForSpec, authoringCompletenessForSpec, gradientPolicyForArtDirection,
	accentPolicyForArtDirection, depthPolicyForArtDirection, listArtDirections,
	planDeckLayout, resolvedPaletteForSpec,
} from '../ir/layout-engine.mjs'
import { buildSpecOperationPlan as compileSpec } from '../ir/spec-compiler.mjs'

function buildSpecOperationPlan(spec) {
	const compiled = compileSpec(spec)
	return { ...compiled, slides: compiled.plan.slides }
}

function specFor(workflow = 'ai-sovereign-v1') {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Business decision', layout: 'LAYOUT_WIDE',
		authoringContract: {
			workflow, creativeAuthority: workflow === 'ai-sovereign-v1' ? 'ai' : 'ai-with-director-assistance',
			directorMode: workflow === 'ai-sovereign-v1' ? 'off' : 'assisted', verificationMode: 'complete',
			geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches',
		},
		slides: [{ id: 'decision', content: [
			{ kind: 'textBox', name: 'headline', role: 'heading', text: 'Choose a supported direction', rect: { x: 0.65, y: 0.45, w: 11.93, h: 1.1 }, style: { fontSize: 38 } },
			{ kind: 'stat', name: 'proof', value: '42%', label: 'Verified improvement', verified: true, rect: { x: 0.65, y: 2.0, w: 5.1, h: 2.0 } },
			{ kind: 'textBox', name: 'reason', text: 'Evidence supports the decision.', rect: { x: 6.15, y: 2.0, w: 6.43, h: 2.0 }, style: { fontSize: 22 } },
		] }],
	}
}

function assertStatic(plan) {
	assert.ok(plan.slides.every(slide => !slide.transition))
	assert.ok(plan.slides.flatMap(slide => slide.objects).every(object => !object.animation))
	assert.ok(!plan.operations.some(operation => /animation|transition/.test(operation.tool || operation.op || '')))
}

for (const workflow of ['ai-sovereign-v1', 'authoring-excellence-director-v1']) {
	test(`${workflow}: omission is neutral, business-complete, and not a World certification failure`, () => {
		const spec = specFor(workflow)
		const plan = buildSpecOperationPlan(spec)
		assert.equal(artDirectionInfo(spec), null)
		assert.equal(plan.appliedDefaults.artDirection, null)
		assert.equal(plan.appliedDefaults.mode, 'light')
		assert.deepEqual(resolvedPaletteForSpec(spec).raw, ['172033', '475569', '475569', '475569', 'FFFFFF'])
		assert.equal(plan.appliedDefaults.aestheticSelection.selectionStatus, 'neutral-omission')
		assert.equal(plan.authoringContracts.composition.worldSelection.certificationEligible, true)
		assert.equal(plan.authoringContracts.composition.worldSelection.namedWorldRequired, false)
		assert.equal(plan.appliedDefaults.completeness.effectiveTier, 'complete')
		assert.equal(plan.appliedDefaults.completeness.contractVersion, 'authoring-excellence.completeness.v2')
		for (const completeness of [plan.appliedDefaults.completeness, plan.authoringContracts.completeness]) {
			assert.equal(completeness.defaultWorld, null)
			assert.equal(completeness.lastResortWorld, null)
		}
		assert.equal(plan.appliedDefaults.layout.enginePlacedObjects, 0)
		assert.ok(!plan.warnings.some(issue => issue.code === 'AI_ART_DIRECTION_REQUIRED_FOR_CERTIFICATION'))
		assert.doesNotMatch(plan.appliedDefaults.artDirectionNote, /uses.*Luxe fallback|richest story-fit/i)
		assert.equal(plan.slides[0].background.gradientStops, undefined)
		for (const object of plan.slides[0].objects) {
			assert.ok(!object.style?.shadow && !object.style?.textGlow && !object.style?.reflection)
			assert.ok(!object.style?.fill?.gradientStops)
		}
		for (const block of spec.slides[0].content) {
			const object = plan.slides[0].objects.find(object => object.blockName === block.name)
			assert.deepEqual(object.rect, block.rect)
			assert.equal(object.placementSource, 'author')
		}
		assertStatic(plan)
	})
}

test('explicit null is a neutral reset, not omission or resurrection of a theme World', () => {
	const spec = specFor()
	spec.styleIntent = { artDirection: null }
	spec.theme = { artDirection: 'luxe' }
	const plan = buildSpecOperationPlan(spec)
	assert.equal(artDirectionInfo(spec), null)
	assert.equal(artDirectionSelectionForSpec(spec).kind, 'neutral')
	assert.equal(plan.appliedDefaults.aestheticSelection.selectionStatus, 'neutral-explicit')
	assert.equal(plan.appliedDefaults.aestheticSelection.explicitSelection, true)
	assert.equal(plan.appliedDefaults.aestheticSelection.selectedWorld, null)
	assert.equal(plan.slides[0].background.gradientStops, undefined)
	assertStatic(plan)
})

test('complete custom styling needs no World; exact backgrounds, fonts, object styling and geometry win', () => {
	const spec = specFor()
	spec.theme = { fontFace: 'Arial', headFontFace: 'Trebuchet MS', bodyFontFace: 'Arial', palette: ['172033', '127C70', '127C70', '127C70', 'FFF9F0'] }
	spec.slides[0].background = { color: 'FFF9F0' }
	const authored = { fontFace: 'Georgia', fontSize: 38, color: '593C22', bold: false, fill: { color: 'EEDFCB' }, line: { color: '593C22', width: 0.75 }, shadow: null, reflection: null }
	spec.slides[0].content[0].style = authored
	const plan = buildSpecOperationPlan(spec)
	assert.equal(plan.appliedDefaults.aestheticSelection.customStylingValid, true)
	assert.equal(plan.appliedDefaults.aestheticSelection.certificationEligible, true)
	assert.match(plan.appliedDefaults.aestheticSelection.certificationScope, /not a release certificate/)
	assert.deepEqual(plan.slides[0].background, spec.slides[0].background)
	assert.equal(plan.appliedDefaults.slides[0].background.source, 'author')
	assert.deepEqual(plan.appliedDefaults.fonts.head, 'Trebuchet MS')
	assert.deepEqual(plan.appliedDefaults.fonts.body, 'Arial')
	const headline = plan.slides[0].objects.find(object => object.blockName === 'headline')
	for (const [key, value] of Object.entries(authored)) assert.deepEqual(headline.style[key], value, key)
	assert.deepEqual(headline.rect, spec.slides[0].content[0].rect)
	assertStatic(plan)
})

test('named Worlds retain both-mode canvas/type identity and remain optional, unranked presets', () => {
	assert.equal(listArtDirections().length, 18)
	for (const world of listArtDirections()) {
		for (const mode of ['light', 'dark']) {
			const spec = specFor()
			spec.styleIntent = { artDirection: world.key, mode }
			const plan = buildSpecOperationPlan(spec)
			assert.equal(plan.appliedDefaults.artDirection, world.key)
			assert.equal(plan.appliedDefaults.mode, mode)
			assert.equal(plan.appliedDefaults.aestheticSelection.selectionStatus, 'ai-selected')
			assert.equal(plan.appliedDefaults.aestheticSelection.presetApplied, true)
			assert.equal(plan.appliedDefaults.aestheticSelection.rankedCandidates, undefined)
			assert.equal(plan.appliedDefaults.fonts.head, artDirectionInfo(spec).headFontFace)
			assertStatic(plan)
		}
	}
	const luxe = planDeckLayout({ ...specFor(), styleIntent: { artDirection: 'luxe' } })
	assert.ok(luxe.slides[0].background.gradientStops)
	assert.equal(artDirectionInfo({ styleIntent: { artDirection: 'luxe' } }).headFontFace, 'Georgia')
})

test('named World overrides retain authored fonts, background, surfaces and effects without motion injection', () => {
	const spec = specFor()
	spec.styleIntent = { artDirection: 'luxe', mode: 'light', depth: { imageFrame: null, imageRadius: 0, shadow: 'none' } }
	spec.theme = { fontFace: 'Arial', card: 'neutral', surface: { corner: 0, fill: 'flat', border: 'none', elevation: 'none' } }
	spec.slides[0].background = { color: 'FFFFFF' }
	const plan = buildSpecOperationPlan(spec)
	assert.equal(plan.appliedDefaults.fonts.head, 'Arial')
	assert.equal(plan.appliedDefaults.fonts.body, 'Arial')
	assert.equal(plan.appliedDefaults.dataStyle.font, 'Arial')
	assert.deepEqual(plan.slides[0].background, { color: 'FFFFFF' })
	assert.ok(plan.slides[0].objects.every(object => !object.style?.shadow))
	assert.equal(plan.slides[0].objects.find(object => object.blockName === 'reason').style.fontFace, 'Arial')
	assertStatic(plan)
})

test('inline bespoke axes remain authored, including custom flat surfaces and explicit expressive overrides', () => {
	const spec = specFor()
	spec.styleIntent = { artDirection: {
		label: 'AI-authored warm analytical design', mode: 'light',
		palette: ['25201B', '95622B', '95622B', '95622B', 'FAF4EA'],
		headFontFace: 'Georgia', bodyFontFace: 'Arial', card: 'bare',
		surface: { fill: 'flat', border: 'none', elevation: 'none', corner: 0 },
		depth: { imageFrame: null, imageRadius: 0, shadow: 'none' },
		emphasis: { heroGlow: null, heroReflection: false },
	} }
	const plan = buildSpecOperationPlan(spec)
	assert.equal(artDirectionInfo(spec).key, 'bespoke')
	assert.equal(plan.appliedDefaults.aestheticSelection.selectionStatus, 'ai-selected-bespoke')
	assert.equal(plan.appliedDefaults.aestheticSelection.presetApplied, false)
	assert.deepEqual(plan.slides[0].background, { color: 'FAF4EA' })
	assert.equal(plan.appliedDefaults.fonts.head, 'Georgia')
	assert.equal(plan.appliedDefaults.fonts.body, 'Arial')
	assertStatic(plan)
	const sparse = { styleIntent: { artDirection: { mode: 'light', palette: ['172033', '127C70'] } } }
	assert.equal(artDirectionInfo(sparse).card, 'neutral')
	assert.equal(artDepthForSpec(sparse).shadow, 'none')
	assert.equal(artMotionForSpec(sparse).model3d, null)
	const explicitCanvas = { styleIntent: { artDirection: { bg: 'EFE2D0', headFontFace: 'Georgia', bodyFontFace: 'Arial' } } }
	assert.equal(resolvedPaletteForSpec(explicitCanvas).bg, 'EFE2D0')
	assert.equal(artDirectionInfo(explicitCanvas).mode, 'light')
})

test('aesthetic policy readback imposes no gradient, accent or depth quotas, including named Worlds', () => {
	for (const selector of [undefined, null, 'luxe', 'aurora', 'editorial', { mode: 'light', card: 'bare' }]) {
		const spec = { styleIntent: { artDirection: selector } }
		assert.equal(gradientPolicyForArtDirection(spec).expected, false)
		assert.equal(accentPolicyForArtDirection(spec).minimumDistinctAccents, 0)
		assert.equal(depthPolicyForArtDirection(spec).minimumDepthObjectsPerSlide, 0)
	}
	const complete = authoringCompletenessForSpec({})
	assert.equal(complete.defaultWorld, null)
	assert.equal(complete.lastResortWorld, null)
	for (const artDirection of ['luxe', 'aurora', { mode: 'light', card: 'bare' }]) {
		const selected = authoringCompletenessForSpec({ styleIntent: { artDirection } })
		assert.equal(selected.defaultWorld, null)
		assert.equal(selected.lastResortWorld, null)
	}
	assert.doesNotMatch(complete.preferenceOrder.join(' '), /gradient|3d|motion|emphasis/)
	assert.match(complete.selectionRule, /business ambition/i)
	for (const tier of ['balanced', 'minimal']) assert.equal(authoringCompletenessForSpec({ complexityPolicy: tier }).effectiveTier, tier)
})

test('dark custom palette is preserved without a hidden light-mode correction or aesthetic staging', () => {
	const spec = specFor()
	spec.theme = { palette: ['FFFFFF', 'FFFFFF', 'FFFFFF', 'FFFFFF', '181818'] }
	const plan = buildSpecOperationPlan(spec)
	assert.equal(resolvedPaletteForSpec(spec).bg, '181818')
	assert.equal(plan.appliedDefaults.mode, 'dark')
	assert.deepEqual(plan.slides[0].background, { color: '181818' })
	assert.equal(artStageForSpec(spec), null)
	assert.deepEqual(artMotionForSpec(spec), { transition: null, build: 'none', emphasis: 'none', model3d: null })
	assertStatic(plan)
})

test('unsupported explicit selector remains blocking and is not substituted', () => {
	const spec = specFor()
	spec.styleIntent = { artDirection: 'unregistered-style' }
	const plan = buildSpecOperationPlan(spec)
	assert.ok(plan.errors.some(issue => issue.code === 'ART_DIRECTION_UNSUPPORTED'))
	assert.equal(plan.appliedDefaults.aestheticSelection.certificationEligible, false)
	assert.equal(plan.appliedDefaults.artDirection, null)
})

test('legacy omission no longer receives an unrequested named aesthetic; explicit legacy selection retains it', () => {
	assert.equal(artDirectionInfo({}), null)
	assert.equal(artDirectionInfo({ styleIntent: { artDirection: 'luxe' } }).key, 'luxe')
	assert.equal(authoringCompletenessForSpec({}).contractVersion, 'authoring-excellence.completeness.v2')
})

test('models and images receive no implicit animation, World framing or ornamental effects on the neutral path', () => {
	const spec = specFor()
	spec.slides[0].content = [
		{ kind: 'model3d', name: 'model', modelAsset: 'asset_business_model', rect: { x: 1, y: 1, w: 4, h: 4 } },
		{ kind: 'image-feature', name: 'evidence', image: 'asset_business_image', rect: { x: 7, y: 1, w: 4, h: 4 } },
	]
	for (const selector of [undefined, null, 'luxe', 'aurora']) {
		spec.styleIntent = { artDirection: selector }
		const plan = planDeckLayout(spec)
		const model = plan.slides[0].objects.find(object => object.primitive === 'model3d')
		assert.ok(model)
		assert.ok(!model.animation)
		if (selector == null) {
			assert.ok(!model.camera && !model.trans && !model.ambientLight && !model.ptLights)
			assert.equal(plan.slides[0].objects.length, 2)
			assert.ok(plan.slides[0].objects.every(object => !object.style?.shadow))
		}
	}
})

test('authored motion and expressive object effects remain intact rather than being stripped by neutral ambition', () => {
	const spec = specFor()
	spec.slides[0].transition = { type: 'fade', durationMs: 350 }
	spec.slides[0].content[0].animation = { type: 'entrance', effect: 'fade', duration: 400, trigger: 'onClick' }
	spec.slides[0].content[0].style.textGlow = { color: '127C70', size: 5, opacity: 0.3 }
	const plan = buildSpecOperationPlan(spec)
	const headline = plan.slides[0].objects.find(object => object.blockName === 'headline')
	assert.deepEqual(plan.slides[0].transition, spec.slides[0].transition)
	assert.deepEqual(headline.animation, spec.slides[0].content[0].animation)
	assert.deepEqual(headline.style.textGlow, spec.slides[0].content[0].style.textGlow)
})

test('public sovereign dryRun accepts omission and explicit null without a named-World readiness blocker', async () => {
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
	process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
	process.env.BETTERPPTX_BILLING_ENFORCE = '0'
	const { createMcpToolDispatcher } = await import('../engine.mjs')
	for (const selector of [undefined, null]) {
		const spec = specFor()
		if (selector === null) spec.styleIntent = { artDirection: null }
		const result = await createMcpToolDispatcher({ sessionId: `art-freedom-${Date.now()}-${Math.random()}`, blackBox: true }).call('betterpptx.deck.generate_from_spec', {
			spec, phase: 'dryRun', commitMode: 'createNew', detail: 'full',
		})
		assert.equal(result.ok, true, JSON.stringify(result.error || result.errors))
		const data = result.data || result
		assert.equal(data.appliedDefaults.artDirection, null)
		assert.equal(data.appliedDefaults.completeness.defaultWorld, null)
		assert.equal(data.appliedDefaults.completeness.lastResortWorld, null)
		assert.equal(data.authoringContracts.completeness.defaultWorld, null)
		assert.equal(data.authoringContracts.completeness.lastResortWorld, null)
		assert.equal(data.appliedDefaults.aestheticSelection.selectionStatus, selector === null ? 'neutral-explicit' : 'neutral-omission')
		const findings = [...(result.warnings || []), ...(result.errors || []), ...(data.warnings || []), ...(data.errors || [])]
		assert.ok(!findings.some(issue => /AI_ART_DIRECTION_REQUIRED_FOR_CERTIFICATION|WORLD.*(?:REQUIRED|NOT_READY)/.test(issue.code || '')))
	}
})
