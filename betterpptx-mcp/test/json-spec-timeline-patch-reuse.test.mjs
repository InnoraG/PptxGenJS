import assert from 'node:assert/strict'
import test from 'node:test'

Object.assign(process.env, {
	BETTERPPTX_PUBLIC_BLACK_BOX: '1',
	BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
	BETTERPPTX_LOCAL_MAINTAINER: '0',
	BETTERPPTX_BILLING_ENFORCE: '0',
	BETTERPPTX_PREMIUM: '1',
	BETTERPPTX_FORCE_PLAN: 'premium',
	BETTERPPTX_FREE_PREVIEW_SLIDES: '99',
})

const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

const dataOf = result => {
	assert.equal(result?.ok, true, JSON.stringify(result))
	return result.data || result
}

function fixture() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Durable timeline reuse',
		layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Reviewers', outcome: 'Retain unchanged motion while revising one label.', remember: 'Timing is reusable state.' },
		visualDesign: { world: 'editorial', framing: 'One native group and one headline' },
		motionTime: { masterClock: 'authored', timingSource: 'native slide timeline', syncPolicy: 'one clock' },
		visualReference: { mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1600, height: 900 }, mediaAssets: [] },
		slides: [{
			id: 'durable-motion', title: 'Durable motion', layoutIntent: 'title-only', background: { color: '07111F' },
			content: [
				{ kind: 'group', name: 'card', pixelFrame: { x: 120, y: 220, w: 500, h: 260 }, children: [
					{ kind: 'shape', name: 'card-panel', shape: 'roundRect', pixelFrame: { x: 0, y: 0, w: 500, h: 260 }, style: { fill: { color: '173452' }, line: { color: '31CFFF', width: 1 } } },
					{ kind: 'textBox', name: 'card-label', text: 'Native motion', pixelFrame: { x: 40, y: 80, w: 420, h: 70 }, style: { fontFace: 'Arial', fontSize: 24, margin: 0, color: 'FFFFFF' } },
				] },
				{ kind: 'textBox', name: 'headline', text: 'Retain this timeline', pixelFrame: { x: 760, y: 250, w: 560, h: 90 }, style: { fontFace: 'Arial', fontSize: 30, margin: 0, color: 'FFFFFF' } },
			],
			timeline: [
				{ id: 'card-in', objectName: 'card', type: 'entrance', effect: 'fade', trigger: 'withPrevious', delayMs: 120, durationMs: 650 },
				{ id: 'headline-emphasis', objectName: 'headline', type: 'emphasis', effect: 'spin', rotation: 6, trigger: 'afterPrevious', delayMs: 80, durationMs: 500 },
			],
		}],
	}
}

test('unchanged exported timeline is retained during a sparse patch after rehydrate-style replay', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `json-spec-timeline-reuse-${Date.now()}` })
	const owned = []
	try {
		const source = fixture()
		const created = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: source, phase: 'commit', commitMode: 'createNew', detail: 'full' }))
		owned.push(created.deckId)
		const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: created.deckId, mode: 'authoredInput', detail: 'full' }))
		const replayed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: exported.spec, phase: 'commit', commitMode: 'createNew', detail: 'full' }))
		owned.push(replayed.deckId)
		const before = getDeck(replayed.deckId)
		const patch = structuredClone(exported.spec)
		patch.title = 'Durable timeline reuse · patch'
		patch.slides = [{
			id: 'durable-motion', slideIndex: 0, title: 'Durable motion · patch',
			content: [{ kind: 'textBox', name: 'headline', text: 'Only this label changed' }],
			timeline: structuredClone(patch.slides[0].timeline),
		}]
		const dry = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { deckId: replayed.deckId, deckVersion: before.deckVersion, spec: patch, phase: 'dryRun', commitMode: 'patch', includePatchPlan: true, detail: 'full' }))
		assert.equal(dry.patchOperations.filter(item => item.tool === 'betterpptx.slide.animate_shapes').length, 0, JSON.stringify(dry.patchOperations))
		assert.equal(dry.patchOperations.length, 1, JSON.stringify(dry.patchOperations))
		const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { deckId: replayed.deckId, deckVersion: before.deckVersion, spec: patch, phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full' }))
		assert.equal(committed.patchResults.length, 1, JSON.stringify(committed.patchResults))
		assert.equal(committed.patchResults[0].patchedKeys.includes('text'), true)
		assert.equal(committed.slideCount, 1)
		assert.equal(getDeck(replayed.deckId).pptx.slides[0]._animations.length, 2)
	} finally {
		for (const deckId of owned) await mcp.call('betterpptx.deck.dispose', { deckId })
	}
})
