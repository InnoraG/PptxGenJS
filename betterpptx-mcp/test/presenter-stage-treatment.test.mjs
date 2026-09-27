import assert from 'node:assert/strict'
import test from 'node:test'
import JSZip from 'jszip'

import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { applyMotionPolicy } from '../ir/motion-policy.mjs'
import { expandPresenterDirective, normalizePresenterStageTreatment, PRESENTER_STAGE_TREATMENTS } from '../ir/presenter-director.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'

const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

function directSpec(stageTreatment = undefined, slideCount = 1) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Presenter stage treatment',
		styleIntent: { artDirection: 'luxe', mode: 'dark' },
		authoringContract: { workflow: 'authoring-excellence-director-v1', creativeAuthority: 'ai', directorMode: 'assisted', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches' },
		presenter: {
			model: 'model3d://premium/presenter-stage-test',
			rect: { x: 9.2, y: 0.8, w: 3.1, h: 5.9 },
			stage: 'right',
			onSlides: 'all',
			...(stageTreatment === undefined ? {} : { stageTreatment }),
		},
		slides: Array.from({ length: slideCount }, (_, index) => ({
			id: `stage-slide-${index + 1}`,
			role: index === 0 ? 'opener' : 'closer',
			title: `Stage ${index + 1}`,
			message: 'The presenter supports the message without carrying it.',
			layoutIntent: 'title-body',
			content: [{ kind: 'title', name: `title-${index + 1}`, text: `Stage ${index + 1}`, rect: { x: 0.8, y: 0.7, w: 7.5, h: 0.8 } }],
		})),
	}
}

function publicCommitSpec() {
	const spec = directSpec('floor-ellipse')
	delete spec.presenter.model
	spec.presenter.identity = 'joe'
	spec.presenter.choreography = 'subtle'
	spec.authoringContract = {
		workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches',
		layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', geometryAuthority: 'ai',
		placementPolicy: 'ai-authored-geometry-v1', textPolicy: 'Use exact AI-authored frames; the engine validates and serializes them.',
	}
	spec.contentStory = { audience: 'keynote viewers', outcome: 'See a grounded editable presenter.', remember: 'The presenter supports the message.' }
	spec.handshake = { audience: 'keynote viewers', promise: 'Ground the presenter without raster decoration.', proof: ['One editable stage ellipse and one native presenter.'], bar: 'Both remain independently editable.' }
	spec.visualDesign = { world: 'Luxe', framing: 'Restrained native 3-D presenter stage.' }
	spec.motionTime = { masterClock: 'authored slide timeline', timingSource: 'semantic slide plan', syncPolicy: 'single deck clock' }
	spec.validation = { validateBeforeSave: true, requireAccessibility: true }
	return spec
}

function dataOf(result) {
	assert.equal(result?.ok, true, JSON.stringify(result))
	return result.data || result
}

test('stage treatment vocabulary is explicit, unranked, and fail-closed', () => {
	assert.deepEqual(PRESENTER_STAGE_TREATMENTS.map(item => item.id), ['none', 'floor-ellipse'])
	assert.deepEqual(normalizePresenterStageTreatment(undefined), {
		id: 'none', source: 'default', decisionAuthority: 'AI', engineRole: 'derive-safe-geometry-and-execute',
	})
	assert.deepEqual(normalizePresenterStageTreatment('floor-ellipse'), {
		id: 'floor-ellipse', source: 'author', decisionAuthority: 'AI', engineRole: 'derive-safe-geometry-and-execute',
	})
	assert.throws(
		() => normalizePresenterStageTreatment('auto-beautify'),
		error => error?.code === 'PRESENTER_STAGE_TREATMENT_INVALID'
			&& error.requested === 'auto-beautify'
			&& error.supported.join('|') === 'none|floor-ellipse',
	)
})

test('omission and World metadata never auto-select decorative presenter staging', () => {
	const expanded = expandPresenterDirective(directSpec(undefined), {
		worldPresenter: { persona: 'keynote-host', stageTreatment: 'floor-ellipse' },
		presenterPalette: { accent: 'D6A94A' },
	})
	assert.equal(expanded.slides[0].content.filter(item => item._presenterStageTreatment).length, 0)
	assert.equal(expanded.slides[0].content.at(-1).name, 'presenter')
})

test('floor ellipse is one slide-scoped editable native sibling immediately before each presenter', () => {
	const expanded = expandPresenterDirective(directSpec('floor-ellipse', 2), {
		presenterPalette: { accent: 'D6A94A' },
	})
	for (const [index, slide] of expanded.slides.entries()) {
		const presenterIndex = slide.content.findIndex(item => item.name === 'presenter')
		const floor = slide.content[presenterIndex - 1]
		const presenter = slide.content[presenterIndex]
		assert.ok(presenterIndex > 0)
		assert.equal(floor.kind, 'shape')
		assert.equal(floor.shapeName, 'ellipse')
		assert.equal(floor.objectName, `stage-slide-${index + 1}.presenter-stage-floor`)
		assert.equal(floor.role, 'decorative')
		assert.equal(floor.decorative, true)
		assert.equal(floor._engineOwnedGeometry, false)
		assert.equal(floor._geometryProvenance, 'ai-selected-component-derived-from-authored-presenter-frame')
		assert.equal(floor.animation, undefined)
		assert.equal(floor.morphName, undefined)
		assert.deepEqual(floor.style, { fill: { color: 'D6A94A', transparency: 70 }, line: { type: 'none' } })
		assert.equal(Math.round((floor.bbox.w / presenter.bbox.w) * 100), 40)
		assert.ok(floor.bbox.h >= 0.12 && floor.bbox.h <= 0.32)
		assert.ok(Math.abs((floor.bbox.x + floor.bbox.w / 2) - (presenter.bbox.x + presenter.bbox.w / 2)) < 0.02)
		assert.ok(floor.bbox.y >= presenter.bbox.y + presenter.bbox.h * 0.68)
		assert.ok(floor.bbox.y + floor.bbox.h <= 7.45)
	}
	assert.notEqual(expanded.slides[0].content.at(-2).objectName, expanded.slides[1].content.at(-2).objectName)
})

test('compiled operation order and public readback preserve the exact AI treatment and author geometry ownership', () => {
	const plan = buildSpecOperationPlan(directSpec('floor-ellipse'), { plan: 'premium' })
	assert.deepEqual(plan.errors, [])
	const floorIndex = plan.operations.findIndex(op => op.tool === 'betterpptx.slide.add_shape' && op.objectName?.endsWith('.presenter-stage-floor'))
	const presenterIndex = plan.operations.findIndex(op => op.tool === 'betterpptx.slide.add_model3d' && op.objectName === 'presenter')
	assert.equal(floorIndex + 1, presenterIndex)
	assert.deepEqual(plan.operations[floorIndex].args.options.line, { type: 'none' })
	assert.equal(plan.operations[floorIndex].args.options.fill.transparency, 70)
	assert.equal(plan.operations[floorIndex].args.options.animation, undefined)
	assert.equal(plan.appliedDefaults.presenter.stage, 'right')
	assert.deepEqual(plan.appliedDefaults.presenter.stageTreatment, {
		id: 'floor-ellipse', source: 'author', decisionAuthority: 'AI', engineRole: 'derive-safe-geometry-and-execute',
	})
	const floorReadback = plan.plan.slides[0].objects.find(object => object.objectName.endsWith('.presenter-stage-floor'))
	const presenterReadback = plan.plan.slides[0].objects.find(object => object.objectName === 'presenter')
	assert.equal(floorReadback.placementSource, 'author')
	assert.equal(floorReadback.placementIntentSource, 'author-geometry')
	assert.equal(presenterReadback.placementSource, 'author')
	assert.equal(presenterReadback.placementIntentSource, 'author-geometry')
})

test('static policy retains the stage and poster while removing presenter runtime motion', () => {
	const source = { ...directSpec('floor-ellipse'), motionPolicy: 'static' }
	const expanded = expandPresenterDirective(source, { presenterPalette: { accent: 'D6A94A' } })
	const governed = applyMotionPolicy(expanded)
	const floor = governed.slides[0].content.find(item => item._presenterStageTreatment === 'floor-ellipse')
	const presenter = governed.slides[0].content.find(item => item.name === 'presenter')
	assert.ok(floor)
	assert.equal(floor.animation, undefined)
	assert.equal(presenter._staticPoster, true)
	assert.equal(presenter.nativeOnly, false)
	assert.equal(presenter.animation, undefined)
	assert.equal(presenter._presenterMotionId, undefined)
	assert.equal(presenter._presenterNarrationCue, undefined)
})

test('materialized package keeps the native ellipse behind both presenter branches and targets motion only at the model', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `presenter-stage-${Date.now()}`, clientInfo: { name: 'presenter-stage-verifier', version: '1' }, blackBox: true })
	let deckId = null
	try {
		const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: publicCommitSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		deckId = committed.deckId
		const entry = getDeck(deckId)
		const objects = entry.pptx.slides[0]._slideObjects || []
		const floorIndex = objects.findIndex(object => object.options?.objectName === 'stage-slide-1.presenter-stage-floor')
		const presenterIndex = objects.findIndex(object => object.options?.objectName === 'presenter')
		assert.equal(floorIndex + 1, presenterIndex)
		assert.equal(objects[floorIndex]?._type, 'shape')
		assert.equal(objects[presenterIndex]?._type, 'model3d')

		const buffer = await entry.pptx.write({ outputType: 'nodebuffer', compression: false })
		const zip = await JSZip.loadAsync(buffer)
		const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
		const floorMatch = slideXml.match(/<p:cNvPr id="(\d+)" name="stage-slide-1\.presenter-stage-floor"/u)
		const presenterMatches = [...slideXml.matchAll(/<p:cNvPr id="(\d+)" name="presenter"/gu)]
		assert.ok(floorMatch)
		assert.ok(presenterMatches.length >= 2, 'native Choice and poster Fallback must both retain presenter identity')
		const floorId = floorMatch[1]
		const presenterIds = new Set(presenterMatches.map(match => match[1]))
		assert.equal(presenterIds.size, 1)
		const presenterId = [...presenterIds][0]
		assert.ok(slideXml.indexOf(`name="stage-slide-1.presenter-stage-floor"`) < slideXml.indexOf('<mc:AlternateContent>'))
		assert.ok(slideXml.includes('<am3d:raster'))
		assert.ok(slideXml.includes(`spid="${presenterId}"`))
		assert.equal(slideXml.includes(`spid="${floorId}"`), false)
	} finally {
		if (deckId) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
})
