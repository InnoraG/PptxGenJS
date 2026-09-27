import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'

const { createMcpToolDispatcher } = await import('../engine.mjs')
const { TOOLS } = await import('../tools.mjs')
const { buildSpecOperationPlan } = await import('../ir/spec-compiler.mjs')

function sovereignSpec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'AI-sovereign authoring proof',
		layout: 'LAYOUT_WIDE',
		authoringContract: {
			workflow: 'ai-sovereign-v1',
			creativeAuthority: 'ai',
			directorMode: 'off',
			verificationMode: 'complete',
			geometryAuthority: 'ai',
			placementPolicy: 'ai-authored-geometry-v1',
			coordinateSystem: 'inches',
		},
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		slides: [{
			id: 'sovereign-proof',
			title: 'AI creative authority',
			content: [
				{ kind: 'title', name: 'headline', text: 'AI creative authority', rect: { x: 0.63, y: 0.48, w: 6.17, h: 0.72 }, style: { fontSize: 34, color: '172033' } },
				{ kind: 'textBox', name: 'body', text: 'The engine validates this composition without rewriting it.', rect: { x: 6.92, y: 2.11, w: 5.42, h: 1.24 }, style: { fontSize: 20, color: '172033' } },
			],
		}],
	}
}

function dispatcher(label) {
	return createMcpToolDispatcher({ sessionId: `${label}-${Date.now()}-${Math.random()}`, blackBox: true })
}

test('public discovery recommends AI-sovereign and keeps Director assistance optional', async () => {
	const result = await dispatcher('ai-sovereign-help').call('betterpptx.help.capabilities', { detail: 'summary', intent: 'full AI creative control' })
	assert.equal(result.ok, true)
	const data = result.data || result
	assert.equal(data.authoringPrinciples?.recommendedWorkflow, 'ai-sovereign-v1')
	const modes = data.authoringPrinciples?.creativeAuthorityModes || []
	assert.ok(modes.some(mode => mode.id === 'ai-sovereign-v1' && mode.creativeAuthority === 'ai' && mode.directorMode === 'off' && mode.verificationMode === 'complete'))
	assert.ok(modes.some(mode => mode.id === 'authoring-excellence-director-v1' && mode.directorMode === 'assisted'))
	assert.equal(data.authoringApi?.compose?.workflow, 'ai-sovereign-v1')
})

test('AI-sovereign dry-run needs no Director domains and preserves exact geometry', async () => {
	const result = await dispatcher('ai-sovereign-dryrun').call('betterpptx.deck.generate_from_spec', {
		spec: sovereignSpec(),
		phase: 'dryRun',
		commitMode: 'createNew',
		detail: 'full',
	})
	assert.equal(result.ok, true)
	const data = result.data || result
	assert.equal(data.authoringContract?.workflow, 'ai-sovereign-v1')
	assert.equal(data.authoringContract?.creativeAuthority, 'ai')
	assert.equal(data.authoringContract?.directorMode, 'off')
	assert.equal(data.authoringContract?.verificationMode, 'complete')
	assert.equal(data.authoringContract?.creativeMutationPolicy, 'report-only-no-creative-rewrite')
	assert.ok(!(data.errors || []).some(issue => issue.code === 'DIRECTOR_DOMAIN_REQUIRED'))
	assert.equal(data.appliedDefaults?.layout?.geometryAuthority, 'ai')
	assert.equal(data.appliedDefaults?.layout?.placementPolicy, 'ai-authored-geometry-v1')
	assert.equal(data.appliedDefaults?.layout?.enginePlacedObjects, 0)
	assert.match(data.appliedDefaults?.note || '', /geometry remains AI-owned/i)
	assert.match(data.appliedDefaults?.note || '', /Director assistance is off/i)
	assert.doesNotMatch(data.appliedDefaults?.note || '', /geometry is engine-owned|never as bbox|never copy coordinates/i)
	assert.match(data.appliedDefaults?.layout?.note || '', /AI-owned placement/i)
	assert.doesNotMatch(data.appliedDefaults?.layout?.note || '', /engine owns the rectangle|never copy coordinates/i)
	const objects = data.slides?.[0]?.objects || []
	assert.deepEqual(objects.find(object => object.objectName === 'sovereign-proof.headline.title')?.rect, { x: 0.63, y: 0.48, w: 6.17, h: 0.72 })
	assert.deepEqual(objects.find(object => object.objectName === 'sovereign-proof.body.textBox')?.rect, { x: 6.92, y: 2.11, w: 5.42, h: 1.24 })
	assert.ok(objects.every(object => object.placementSource === 'author'))
})

test('declared narrated autoplay rejects missing speech, auto-advance, and object beats together before any charge', async () => {
	const spec = sovereignSpec()
	spec.deliveryExperience = { mode: 'narrated-autoplay', requireMotion: true }
	const result = await dispatcher('narrated-autoplay-requirement').call('betterpptx.deck.generate_from_spec', {
		spec, phase: 'dryRun', commitMode: 'createNew', detail: 'full',
	})
	assert.equal(result.ok, false)
	const codes = new Set((result.error?.details?.errors || result.data?.errors || []).map(issue => issue.code))
	for (const code of ['AUTOPLAY_REQUIRED', 'NATIVE_NARRATION_REQUIRED', 'OBJECT_MOTION_REQUIRED']) assert.ok(codes.has(code), code)
})

test('declared narrated autoplay rejects an explicit native-narration playback exclusion', async () => {
	const spec = sovereignSpec()
	spec.deliveryExperience = { mode: 'narrated-autoplay' }
	spec.autoplay = { enabled: true }
	spec.showSettings = { showNarration: false }
	spec.slides[0].narration = { script: 'This slide speaks.' }
	const result = await dispatcher('narrated-autoplay-conflict').call('betterpptx.deck.generate_from_spec', {
		spec, phase: 'dryRun', commitMode: 'createNew', detail: 'full',
	})
	assert.equal(result.ok, false)
	assert.ok((result.error?.details?.errors || []).some(issue => issue.code === 'NATIVE_NARRATION_SHOW_SETTINGS_CONFLICT'))
})

test('narrated autoplay plan preserves measured per-slide timing instead of replacing it with a deck-wide fallback', () => {
	const spec = sovereignSpec()
	spec.deliveryExperience = { mode: 'narrated-autoplay', requireMotion: true }
	spec.autoplay = { enabled: true, loop: false, mode: 'present', secondsPerSlide: 9 }
	spec.slides[0].narration = { text: 'This is the spoken explanation.', voiceId: 'fixture-voice' }
	spec.slides[0].timeline = [{ objectName: 'body', type: 'entrance', effect: 'wipe', trigger: 'withPrevious', durationMs: 900 }]
	const plan = buildSpecOperationPlan(spec)
	const autoplay = plan.operations.find(operation => operation.tool === 'betterpptx.deck.autoplay')
	assert.equal(autoplay.args.preserveTimedSlides, true)
	assert.equal(autoplay.args.showNarration, true)
	assert.equal(autoplay.args.loop, false)
})

test('public schemas describe sovereign status and renderer-free production truthfully', () => {
	const statusTool = TOOLS.find(tool => tool.name === 'betterpptx.deck.director_status')
	assert.ok(statusTool)
	assert.match(statusTool.description, /ai-sovereign mode Director assistance is off/i)
	assert.match(statusTool.description, /technical verification remains active/i)
	assert.doesNotMatch(statusTool.description, /required planning stages/i)
	const statusProperties = statusTool.outputSchema?.properties?.data?.properties || {}
	assert.ok(statusProperties.mode?.enum?.includes('ai-sovereign'))
	assert.ok(statusProperties.mode?.enum?.includes('director-strict'))
	assert.match(statusProperties.missingStages?.description || '', /Empty when Director assistance is off/i)
	assert.match(statusProperties.verificationRequired?.description || '', /independently of Director assistance/i)

	const nativeVisuals = TOOLS.find(tool => tool.name === 'betterpptx.deck.validate_native_visuals')
	assert.ok(nativeVisuals)
	assert.match(nativeVisuals.description, /Renderer-free production validation/i)
	assert.match(nativeVisuals.description, /optional application\/release qualification/i)
	assert.doesNotMatch(nativeVisuals.description, /remains a production gate/i)
	const inputs = nativeVisuals.inputSchema?.properties || {}
	assert.match(inputs.requireAuthoritativeReopen?.description || '', /Optional release\/application qualification gate/i)
	assert.match(inputs.requireAuthoritativeReopen?.description || '', /production validation remains renderer-free/i)
	assert.doesNotMatch(inputs.requireAuthoritativeReopen?.description || '', /required production gate/i)
})

test('AI-sovereign contract fails closed when verification or Director-off fields are missing', async () => {
	const spec = sovereignSpec()
	delete spec.authoringContract.verificationMode
	const result = await dispatcher('ai-sovereign-invalid').call('betterpptx.deck.generate_from_spec', {
		spec,
		phase: 'dryRun',
		commitMode: 'createNew',
	})
	assert.equal(result.ok, false)
	assert.equal(result.error?.details?.issues?.[0]?.code, 'AI_SOVEREIGN_CONTRACT_INVALID')
})

test('committed AI-sovereign decks skip creative planning stages but retain verification gate', async () => {
	const mcp = dispatcher('ai-sovereign-commit')
	const committed = await mcp.call('betterpptx.deck.generate_from_spec', {
		spec: sovereignSpec(),
		phase: 'commit',
		commitMode: 'createNew',
		detail: 'summary',
	})
	assert.equal(committed.ok, true)
	const deckId = (committed.data || committed).deckId
	assert.ok(deckId)
	const statusResult = await mcp.call('betterpptx.deck.director_status', { deckId })
	assert.equal(statusResult.ok, true)
	const status = statusResult.data || statusResult
	assert.equal(status.mode, 'ai-sovereign')
	assert.equal(status.directorMode, 'off')
	assert.equal(status.directorActive, false)
	assert.equal(status.verificationRequired, true)
	assert.equal(status.requiredBeforeAuthoring, false)
	assert.deepEqual(status.missingStages || [], [])
	assert.equal(status.readyForSave, false)
	assert.equal(status.next?.recommendedTool, 'betterpptx.deck.validate_quality')
	const saveResult = await mcp.call('betterpptx.deck.save', { deckId, idempotencyKey: 'ai-sovereign-validation-gate' })
	assert.equal(saveResult.ok, false)
	assert.equal(saveResult.error?.code, 'CURRENT_VERSION_VALIDATION_REQUIRED')
})

test('Director-assisted workflow remains backward compatible and still requires its domains', async () => {
	const spec = sovereignSpec()
	spec.authoringContract = { workflow: 'authoring-excellence-director-v1', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches' }
	delete spec.styleIntent
	const result = await dispatcher('director-assisted').call('betterpptx.deck.generate_from_spec', {
		spec,
		phase: 'dryRun',
		commitMode: 'createNew',
	})
	assert.equal(result.ok, false)
	assert.equal(result.error?.details?.issues?.[0]?.code, 'DIRECTOR_DOMAIN_REQUIRED')
})

test('Director assistance preserves AI geometry and produces zero engine-placed objects', async () => {
	const spec = sovereignSpec()
	spec.authoringContract = { workflow: 'authoring-excellence-director-v1', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches' }
	spec.contentStory = { audience: 'reviewers', outcome: 'confirm authority', remember: 'Director never places objects' }
	spec.visualDesign = { world: 'Editorial proof', framing: 'authored exact rectangles' }
	spec.motionTime = { masterClock: 'static', timingSource: 'authored', syncPolicy: 'single clock' }
	const result = await dispatcher('director-exact-geometry').call('betterpptx.deck.generate_from_spec', {
		spec,
		phase: 'dryRun',
		commitMode: 'createNew',
		detail: 'full',
	})
	assert.equal(result.ok, true, JSON.stringify(result.error || result))
	const data = result.data || result
	assert.equal(data.authoringContract?.geometryAuthority, 'ai')
	assert.equal(data.authoringContract?.placementPolicy, 'ai-authored-geometry-v1')
	assert.equal(data.appliedDefaults?.layout?.enginePlacedObjects, 0)
	assert.ok((data.slides?.[0]?.objects || []).every(object => object.placementSource === 'author'))
})

test('free authoring preserves explicit transitions without a hidden Morph or world default', async () => {
	const spec = sovereignSpec()
	spec.slides.push({
		id: 'evidence',
		title: 'Evidence',
		transition: { type: 'fade', duration: 700, advanceOnClick: true },
		content: [{ kind: 'textBox', name: 'evidence-title', text: 'Evidence', rect: { x: 0.9, y: 0.8, w: 11.5, h: 0.8 } }],
	})
	const result = await dispatcher('sovereign-explicit-transition').call('betterpptx.deck.generate_from_spec', {
		spec,
		phase: 'dryRun',
		commitMode: 'createNew',
		detail: 'full',
	})
	assert.equal(result.ok, true, JSON.stringify(result.error || result))
	const data = result.data || result
	// Public operation readback intentionally collapses implementation primitives
	// to generate_from_spec. A hidden deck-wide transition would still appear as
	// an extra operation without slide identity; the explicit slide transition is
	// carried by the authored slide operation.
	assert.equal((data.operations || []).length, 5)
	assert.equal((data.operations || []).some(operation => operation.slideId === undefined), false)
	assert.equal(data.appliedDefaults?.motion?.active, true)
	assert.match(data.appliedDefaults?.motion?.note || '', /Only explicitly authored transitions/i)
	assert.equal((data.warnings || []).some(warning => /PREVIEW_MORPH|PREMIUM_TRANSITION/.test(warning.code || '')), false)
})
