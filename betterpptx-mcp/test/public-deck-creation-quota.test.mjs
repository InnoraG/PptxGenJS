import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'
// Exercise the real public default, not an increased verification allowance.
process.env.BETTERPPTX_SESSION_DECKS_PER_HOUR = '20'

const { createMcpToolDispatcher } = await import('../engine.mjs')
const GENERATE = 'betterpptx.deck.generate_from_spec'
const LIMIT = 20

function fixture(suffix = 'initial') {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: `Public creation quota ${suffix}`,
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Reviewers', outcome: 'Inspect before committing.', remember: 'Planning does not create a deck.' },
		visualDesign: { world: 'editorial', framing: 'One native statement.' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide timing', syncPolicy: 'one static clock' },
		motion: { autoSync: false },
		slides: [{
			id: `quota-${suffix}`,
			title: 'Inspect before committing',
			layoutIntent: 'title-only',
			content: [{ kind: 'text', name: 'statement', text: 'Planning preserves the deck creation allowance.' }],
		}],
	}
}

function dataOf(result) {
	assert.equal(result?.ok, true, JSON.stringify(result?.error || { ok: result?.ok }))
	return result.data || result
}

function assertMutationFree(result, phase) {
	const data = dataOf(result)
	assert.equal(data.phase, phase)
	assert.equal(data.mutationFree, true)
	assert.ok(!data.deckId)
}

function assertSpecError(result, code) {
	assert.equal(result?.ok, false, JSON.stringify(result))
	assert.equal(result.error?.code, 'SPEC_COMPILE_FAILED', JSON.stringify(result))
	assert.ok(result.error?.details?.errors?.some(error => error.code === code), JSON.stringify(result))
	assert.ok(!result.data?.deckId)
}

test('public planning beyond the hourly cap preserves all real creation slots and existing-deck editing', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `public-quota-${Date.now()}`, blackBox: true })
	const ownedDecks = []
	const call = args => mcp.call(GENERATE, { spec: fixture(), detail: 'summary', ...args })
	try {
		// Each modern planning phase exceeds the actual hourly creation limit, with
		// both valid and invalid specs. Neither outcome allocates a deck.
		for (let attempt = 0; attempt <= LIMIT; attempt += 1) {
			for (const phase of ['dryRun', 'resolve', 'lockedDryRun']) {
				assertMutationFree(await call({ phase }), phase)
				assertSpecError(await call({ phase, spec: null }), 'SPEC_REQUIRED')
			}
		}
		for (const [args, phase] of [
			[{ dryRun: true }, 'dryRun'],
			[{ phase: 'dry-run' }, 'dryRun'],
			[{ phase: 'estimate' }, 'dryRun'],
			[{ phase: 'plan' }, 'dryRun'],
			[{ phase: 'lock' }, 'resolve'],
			[{ phase: 'lock_media' }, 'resolve'],
			[{ phase: 'locked-plan' }, 'lockedDryRun'],
		]) assertMutationFree(await call(args), phase)

		// Invalid phases and legacy-flag conflicts must fail closed rather than
		// accidentally executing an unmetered create through a non-commit branch.
		const invalidPhases = [
			[{ phase: 'preview' }, 'SPEC_PHASE_INVALID'],
			[{ phase: 'preview', dryRun: true }, 'SPEC_PHASE_INVALID'],
			[{ phase: 'commit', dryRun: true }, 'SPEC_PHASE_CONFLICT'],
			[{ phase: 'dryRun', dryRun: false }, 'SPEC_PHASE_CONFLICT'],
			[{ phase: 'resolve', dryRun: true }, 'SPEC_PHASE_CONFLICT'],
		]
		for (const [args, code] of invalidPhases) assertSpecError(await call(args), code)

		const creationForms = [{ phase: 'commit' }, {}, { dryRun: false }, { phase: 'generate' }, { phase: 'apply' }, { phase: 'commit', dryRun: false }]
		for (let index = 0; index < LIMIT; index += 1) {
			const created = dataOf(await call({ ...creationForms[index % creationForms.length], spec: fixture(`create-${index}`) }))
			assert.equal(created.phase, 'commit')
			assert.ok(created.deckId)
			assert.ok(!ownedDecks.includes(created.deckId))
			ownedDecks.push(created.deckId)
		}
		for (const args of creationForms) {
			const limited = await call(args)
			assert.equal(limited.ok, false)
			assert.equal(limited.error?.code, 'RATE_LIMITED', JSON.stringify(limited))
			assert.equal(limited.error?.details?.limit, LIMIT)
		}
		for (const phase of ['dryRun', 'resolve', 'lockedDryRun']) assertMutationFree(await call({ phase }), phase)
		for (const [args, code] of invalidPhases) assertSpecError(await call(args), code)

		const deckId = ownedDecks[0]
		const beforeEdit = dataOf(await mcp.call('betterpptx.deck.summary', { deckId }))
		const edited = dataOf(await call({ deckId, phase: 'commit', commitMode: 'replaceDeck', spec: fixture('edited') }))
		assert.equal(edited.deckId, deckId, 'an existing-deck edit remains available at the creation cap')
		assert.equal(edited.phase, 'commit')
		assert.equal(edited.deckVersion, beforeEdit.deckVersion + 1, 'replaceDeck advances exactly one finalized revision')
		assert.equal(edited.deckSession.deckVersion, edited.deckVersion)
		assert.equal(edited.specProvenance.submitted.deckVersion, edited.deckVersion)
		assert.equal(edited.specProvenance.effectivePrecompile.deckVersion, edited.deckVersion)
		const afterEdit = dataOf(await mcp.call('betterpptx.deck.summary', { deckId }))
		assert.equal(afterEdit.deckVersion, edited.deckVersion, 'readback uses the returned replacement revision')
		const conflictingCreate = await call({ deckId, phase: 'commit', commitMode: 'createNew' })
		assertSpecError(conflictingCreate, 'SPEC_COMMIT_MODE_CONFLICT')
		const stillLimited = await call({ phase: 'commit' })
		assert.equal(stillLimited.error?.code, 'RATE_LIMITED', 'editing cannot reset the creation counter')
	} finally {
		for (const deckId of ownedDecks) await mcp.call('betterpptx.deck.dispose', { deckId })
	}
})
