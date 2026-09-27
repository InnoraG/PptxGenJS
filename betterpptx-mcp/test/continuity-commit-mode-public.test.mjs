import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'

const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

function metadata() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Continuity commit mode probe', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches' },
		contentStory: { audience: 'authors', outcome: 'Verify mutation safety', remember: 'One editable carrier remains' },
		visualDesign: { world: 'editorial', framing: 'One native slide', tone: 'technical' },
		motionTime: { masterClock: 'static', timingSource: 'authored', syncPolicy: 'single' },
		styleIntent: { artDirection: 'editorial', density: 'sparse', tone: 'technical' },
	}
}

test('continuity append and patch reject before changing an existing deck', async () => {
	const mcp = createMcpToolDispatcher({ __skipDurableOperationLedger: true, sessionId: `continuity-mode-${Date.now()}`, blackBox: false })
	const created = await mcp.call('betterpptx.deck.generate_from_spec', {
		commitMode: 'createNew', phase: 'commit', plan: 'premium', billingConfirmed: true,
		spec: { ...metadata(), slides: [{ id: 'base', title: 'Base', layoutIntent: 'title-only', content: [{ kind: 'textBox', name: 'label', text: 'Base', rect: { x: 1, y: 1, w: 3, h: 1 } }] }] },
	})
	assert.equal(created.ok, true, JSON.stringify(created))
	const deckId = created.data.deckId
	const entry = getDeck(deckId)
	const before = { version: entry.deckVersion, count: entry.pptx.slides.length, title: entry.pptx.title }
	for (const commitMode of ['append', 'patch']) {
		const result = await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId, deckVersion: before.version, commitMode, phase: 'dryRun',
			spec: { ...metadata(), slides: [{ id: 'departure', content: [] }, { id: 'arrival', content: [] }], slideContinuities: [{ id: 'requested-handoff' }] },
		})
		assert.equal(result.ok, false)
		assert.equal(result.error?.code, 'SPEC_COMPILE_FAILED')
		assert.equal(result.error?.details?.errors?.[0]?.code, 'SLIDE_CONTINUITY_COMMIT_MODE_NONATOMIC')
		assert.deepEqual({ version: entry.deckVersion, count: entry.pptx.slides.length, title: entry.pptx.title }, before)
	}
})
