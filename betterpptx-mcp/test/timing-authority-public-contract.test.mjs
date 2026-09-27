import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
process.env.BETTERPPTX_NARRATION_DISABLED = '1'

const { publicToolList } = await import('../blackbox.mjs')
const { createMcpToolDispatcher } = await import('../engine.mjs')
const { TOOLS } = await import('../tools.mjs')
const { publicCapabilityOverview } = await import('../authoring-capability-registry.mjs')
const { timingAuthorityForSlide } = await import('../ir/spec-compiler.mjs')

const dispatcher = createMcpToolDispatcher({ sessionId: 'timing-authority-public-contract' })
const publicTools = publicToolList(TOOLS)

function dataOf(result, label) {
	assert.equal(result?.ok, true, `${label}: ${JSON.stringify(result?.error || result)}`)
	return result.data || result
}

test('the canonical advertised dry-run preserves authored domains and has no phantom presenter finding', async () => {
	const overview = publicCapabilityOverview({ detail: 'summary', includeReadiness: false })
	const advertised = overview.nextCalls.find(call => call.tool === 'betterpptx.deck.generate_from_spec')
	assert.ok(advertised, 'capability discovery must publish the canonical compilation call')

	const result = await dispatcher.call(advertised.tool, advertised.request)
	const data = dataOf(result, 'canonical dry-run')
	assert.equal(data.dryRun, true)
	assert.equal(data.mutationFree, true)
	assert.deepEqual(data.errors, [])

	const domains = data.semanticRoundtrip?.domainContract
	assert.equal(domains?.contentStory?.audience, 'Leaders')
	assert.equal(domains?.contentStory?.outcome, 'Understand the decision.')
	assert.equal(domains?.contentStory?.remember, 'Choose with evidence.')
	assert.equal(domains?.visualDesign?.world, 'Clear')
	assert.equal(domains?.visualDesign?.worldRole, 'descriptive-intent')
	assert.equal(domains?.visualDesign?.selectedWorld, 'editorial')
	assert.equal(domains?.visualDesign?.effectiveWorld, 'editorial')
	assert.equal(domains?.visualDesign?.selectionSource, 'styleIntent.artDirection')
	assert.equal(domains?.motionTime?.masterClock, 'static')
	assert.equal(domains?.motionTime?.timingSource, 'authored slide timing')
	assert.equal(domains?.motionTime?.effectiveClock, 'authored slide timing')
	assert.equal(domains?.motionTime?.timingEvidence, 'none')

	const timing = data.timingSpine
	assert.equal(timing?.effectiveClock, 'authored slide timing')
	assert.deepEqual(timing?.authorityModes, ['static-manual'])
	assert.deepEqual(timing?.timingEvidence, ['none'])
	assert.equal(timing?.slides?.[0]?.narrationMs, null)
	assert.equal(timing?.slides?.[0]?.dwellMs, null)
	assert.equal(timing?.slides?.[0]?.effectiveClock, 'authored slide timing')
	assert.equal(timing?.slides?.[0]?.authorityMode, 'static-manual')
	assert.equal(timing?.slides?.[0]?.performanceFits, null)
	assert.match(timing?.slides?.[0]?.reconciliation, /notes remain non-timing/i)
	assert.equal(data.appliedDefaults?.autoplay?.autoSync, false)
	assert.equal(data.appliedDefaults?.presenter?.active, false)
	assert.equal(data.appliedDefaults?.motionPolicy?.soleCarrier?.active, false)
	assert.equal(data.appliedDefaults?.motionPolicy?.soleCarrier?.applicability, 'not-applicable')
	assert.doesNotMatch(JSON.stringify(data), /PRESENTER_SOLE_CARRIER/)
	assert.deepEqual(data.presenterContract?.clock, { source: 'none', master: 'authored slide timing', shared: false })
	assert.equal(data.presenterContract?.ready, true)
	assert.deepEqual(data.presenterContract?.warnings, [])
	assert.equal(data.presenterContract?.timeline?.entries?.[0]?.timingAuthority, 'none')
	assert.equal(data.presenterContract?.executionPlan?.entries?.[0]?.timingAuthority, 'none')
	assert.equal(data.presenterRuntime?.entries?.[0]?.timingAuthority, 'none')
	assert.doesNotMatch(JSON.stringify(data.errors), /compatibility substitution/i)
})

test('timing authority modes are explicit, bounded, and consistent for combined narration/performance', () => {
	const authored = { motionTime: { masterClock: 'static', timingSource: 'authored slide timing', syncPolicy: 'one static visual clock' } }
	const manual = timingAuthorityForSlide(authored, {})
	assert.deepEqual(
		{ mode: manual.authorityMode, clock: manual.effectiveClock, evidence: manual.timingEvidence, narration: manual.narrationClockActive },
		{ mode: 'static-manual', clock: 'authored slide timing', evidence: 'none', narration: false },
	)

	const timeline = timingAuthorityForSlide(authored, { transition: { advanceAfterTime: 3200 } }, { transition: { advanceAfterTime: 3200 } })
	assert.equal(timeline.authorityMode, 'silent-authored-timeline')
	assert.equal(timeline.slideAdvanceMs, 3200)
	assert.equal(timeline.effectiveClock, 'authored slide timing')

	const autoplay = timingAuthorityForSlide({ autoplay: { enabled: true, secondsPerSlide: 5 } }, {})
	assert.equal(autoplay.authorityMode, 'silent-authored-autoplay')
	assert.equal(autoplay.autoplayMs, 5000)
	assert.equal(autoplay.timingEvidence, 'authored-autoplay')

	const narrated = timingAuthorityForSlide({}, { narration: { script: 'Speak this message.' } }, { explicitNarration: true })
	assert.equal(narrated.authorityMode, 'narrated')
	assert.equal(narrated.effectiveClock, 'narration-text')
	assert.equal(narrated.timingEvidence, 'estimate')
	assert.equal(narrated.secondaryClock, null)

	const performance = timingAuthorityForSlide(authored, {}, { performanceTiming: { endMs: 1800, dwellMs: 2300 } })
	assert.equal(performance.authorityMode, 'silent-presenter-performance')
	assert.equal(performance.effectiveClock, 'presenter performance')
	assert.equal(performance.timingEvidence, 'authored-performance')

	const combined = timingAuthorityForSlide({}, { narration: { script: 'Speak while the presenter moves.' } }, {
		explicitNarration: true,
		performanceTiming: { endMs: 1800, dwellMs: 2300 },
	})
	assert.equal(combined.authorityMode, 'combined-narration-and-performance')
	assert.equal(combined.effectiveClock, 'narration-text')
	assert.equal(combined.secondaryClock, 'presenter performance')
	assert.match(combined.reconciliation, /narration-text governs/i)
	assert.match(combined.reconciliation, /must end within/i)
	assert.ok(combined.conflicts.length === 0)

	const competing = timingAuthorityForSlide({}, { narration: { script: 'Speak this message.' }, transition: { advanceAfterTime: 4000 } }, {
		explicitNarration: true,
		transition: { advanceAfterTime: 4000 },
	})
	assert.ok(competing.conflicts.some(message => /authored slide advance/i.test(message)))
})

test('public schemas and permitted calls agree on the corrected discovery arguments', async () => {
	const byName = new Map(publicTools.map(tool => [tool.name, tool]))
	assert.ok(byName.get('betterpptx.authoring.catalog')?.inputSchema?.properties?.query)
	assert.ok(byName.get('betterpptx.narration.voices')?.inputSchema?.properties?.language)
	assert.ok(byName.get('betterpptx.deck.generate_from_spec')?.inputSchema?.properties?.specHandle)
	assert.ok(byName.get('betterpptx.deck.generate_from_spec')?.inputSchema?.anyOf?.some(row => row.required?.includes('specHandle')))
	assert.ok(byName.get('betterpptx.deck.export_spec')?.inputSchema?.properties?.download)

	const catalog = dataOf(await dispatcher.call('betterpptx.authoring.catalog', { query: 'bevel', limit: 3 }), 'catalog query')
	assert.ok(Array.isArray(catalog.entries))
	const voices = dataOf(await dispatcher.call('betterpptx.narration.voices', { language: 'en-US' }), 'voice language filter')
	assert.equal(voices.filter.language, 'en_us')
})

test('committed deck export accepts the returned deckVersion for immutable spec stages', async () => {
	const overview = publicCapabilityOverview({ detail: 'summary', includeReadiness: false })
	const advertised = overview.nextCalls.find(call => call.tool === 'betterpptx.deck.generate_from_spec')
	const committed = dataOf(await dispatcher.call(advertised.tool, {
		...advertised.request,
		phase: 'commit',
		dryRun: false,
		commitMode: 'createNew',
		plan: 'free',
	}), 'canonical commit')
	try {
		const exported = dataOf(await dispatcher.call('betterpptx.deck.export_spec', {
			deckId: committed.deckId,
			deckVersion: committed.deckVersion,
			mode: 'authoredInput',
			download: false,
		}), 'versioned authored export')
		assert.equal(exported.specArtifact.deckVersion, committed.deckVersion)
		assert.equal(exported.spec.title, advertised.request.spec.title)
	} finally {
		await dispatcher.call('betterpptx.deck.dispose', { deckId: committed.deckId, deckVersion: committed.deckVersion })
	}
})

test('narration runtime failure stays localized while discovery remains complete', async () => {
	const voices = dataOf(await dispatcher.call('betterpptx.narration.voices', { language: 'en-US' }), 'narration readiness')
	assert.equal(voices.catalogAvailable, true)
	assert.equal(voices.synthesisRuntimeAvailable, false)
	assert.equal(voices.productionReady, false)
	const recipe = dataOf(await dispatcher.call('betterpptx.help.tool_recipe', { surface: 'narration', detail: 'full' }), 'narration recipe')
	assert.equal(recipe.detail, 'full')
	assert.ok(recipe.recipes?.[0]?.narrationContract?.stages?.length >= 7)
	const shapes = dataOf(await dispatcher.call('betterpptx.authoring.catalog', { family: 'shapes-gradients', query: 'gradient', limit: 5 }), 'shapes after narration failure')
	assert.ok(shapes.entries.length > 0)
})
