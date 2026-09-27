import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

const dataOf = result => {
	assert.equal(result?.ok, true, JSON.stringify(result))
	return result.data || result
}

function metadata() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Sparse Section and Summary Zoom proof',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
		contentStory: { audience: 'presentation authors', outcome: 'Prove sparse native Zoom lifecycle.', remember: 'Semantic section targets remain durable.' },
		visualDesign: { world: 'section navigation proof', framing: 'native interactive carriers', tone: 'technical' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide', syncPolicy: 'single deck clock' },
	}
}

function fullSpec() {
	return {
		...metadata(),
		layout: 'LAYOUT_WIDE',
		sections: [
			{ id: 'navigation', title: 'Navigation', slideIds: ['host'] },
			{ id: 'overview', title: 'Overview', slideIds: ['overview-1'] },
			{ id: 'details', title: 'Details', slideIds: ['details-1'] },
		],
		slides: [
			{ id: 'host', title: 'Host', layoutIntent: 'title-only', content: [], sectionZoom: { name: 'section-zoom', targetSectionId: 'details', transitionDur: 1500 } },
			{ id: 'overview-1', title: 'Overview', layoutIntent: 'title-only', content: [] },
			{ id: 'details-1', title: 'Details', layoutIntent: 'title-only', content: [] },
		],
		summaryZoom: { name: 'summary-zoom', sectionIds: ['overview', 'details'], transitionDur: 1700 },
	}
}

function patchSpec(sectionZoom, summaryZoom) {
	return {
		...metadata(),
		slides: [{ id: 'host', slideIndex: 0, title: 'Host', layoutIntent: 'title-only', content: [], sectionZoom }],
		summaryZoom,
	}
}

async function commit(mcp, args) {
	return dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { ...args, phase: 'commit', plan: 'premium', billingConfirmed: true, detail: 'full' }))
}

test('sparse Section/Summary Zoom update, reset, re-add, and invalid-target no-mutation are exact', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `section-summary-sparse-${Date.now()}`, clientInfo: { name: 'section-summary-sparse-test', version: '1' }, blackBox: false })
	const created = await commit(mcp, { spec: fullSpec(), commitMode: 'createNew' })
	const deckId = created.deckId
	try {
		let entry = getDeck(deckId)
		await commit(mcp, {
			deckId,
			deckVersion: entry.deckVersion,
			commitMode: 'patch',
			spec: patchSpec(
				{ name: 'section-zoom', patch: { targetSectionId: 'overview', transitionDur: null } },
				{ name: 'summary-zoom', patch: { sectionIds: ['details'], transitionDur: null } },
			),
		})
		let exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId, detail: 'full' })).spec
		assert.equal(exported.slides.find(slide => slide.id === 'host').sectionZoom.targetSectionId, 'overview')
		assert.equal(exported.slides.find(slide => slide.id === 'host').sectionZoom.transitionDur, 1000)
		assert.deepEqual(exported.summaryZoom.sectionIds, ['details'])
		assert.equal(exported.summaryZoom.transitionDur, 1000)

		entry = getDeck(deckId)
		await commit(mcp, { deckId, deckVersion: entry.deckVersion, commitMode: 'patch', spec: patchSpec(null, null) })
		exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId, detail: 'full' })).spec
		assert.equal(exported.slides.find(slide => slide.id === 'host').sectionZoom, undefined)
		assert.equal(exported.summaryZoom, undefined)
		assert.equal(exported.slides.length, 3)
		assert.equal(exported.sections.length, 3)

		entry = getDeck(deckId)
		await commit(mcp, {
			deckId,
			deckVersion: entry.deckVersion,
			commitMode: 'patch',
			spec: patchSpec(
				{ name: 'section-zoom', targetSectionId: 'details', transitionDur: 0 },
				{ name: 'summary-zoom', sectionIds: ['details', 'overview'], transitionDur: 0 },
			),
		})
		exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId, detail: 'full' })).spec
		assert.equal(exported.slides.find(slide => slide.id === 'host').sectionZoom.transitionDur, 0)
		assert.deepEqual(exported.summaryZoom.sectionIds, ['details', 'overview'])
		assert.equal(exported.summaryZoom.transitionDur, 0)

		entry = getDeck(deckId)
		await commit(mcp, {
			deckId,
			deckVersion: entry.deckVersion,
			commitMode: 'patch',
			spec: {
				...metadata(),
				sections: [
					{ id: 'details', title: 'Details renamed', slideIds: ['details-1'] },
					{ id: 'navigation', title: 'Navigation', slideIds: ['host'] },
					{ id: 'overview', title: 'Overview renamed', slideIds: ['overview-1'] },
				],
				slides: [{ id: 'host', slideIndex: 0, title: 'Host', layoutIntent: 'title-only', content: [] }],
			},
		})
		exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId, detail: 'full' })).spec
		assert.deepEqual(exported.sections.map(section => section.id), ['details', 'navigation', 'overview'])
		assert.equal(exported.sections[0].title, 'Details renamed')
		assert.equal(exported.slides.find(slide => slide.id === 'host').sectionZoom.targetSectionId, 'details')
		assert.deepEqual(exported.summaryZoom.sectionIds, ['details', 'overview'])

		entry = getDeck(deckId)
		const beforeDeleteVersion = entry.deckVersion
		const rejectedDelete = await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId,
			deckVersion: beforeDeleteVersion,
			commitMode: 'patch',
			phase: 'commit',
			plan: 'premium',
			billingConfirmed: true,
			spec: {
				...metadata(),
				sections: [
					{ id: 'navigation', title: 'Navigation', slideIds: ['host'] },
					{ id: 'overview', title: 'Overview renamed', slideIds: ['overview-1'] },
				],
				slides: [{ id: 'host', slideIndex: 0, title: 'Host', layoutIntent: 'title-only', content: [] }],
			},
		})
		assert.equal(rejectedDelete.ok, false)
		assert.equal(getDeck(deckId).deckVersion, beforeDeleteVersion)

		entry = getDeck(deckId)
		const beforeVersion = entry.deckVersion
		const beforeExport = JSON.stringify(exported)
		const rejected = await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId,
			deckVersion: beforeVersion,
			commitMode: 'patch',
			phase: 'commit',
			plan: 'premium',
			billingConfirmed: true,
			spec: patchSpec({ name: 'section-zoom', patch: { targetSectionId: 'missing' } }, { name: 'summary-zoom', retain: true }),
		})
		assert.equal(rejected.ok, false)
		assert.equal(getDeck(deckId).deckVersion, beforeVersion)
		assert.equal(JSON.stringify(dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId, detail: 'full' })).spec), beforeExport)
	} finally {
		await mcp.call('betterpptx.deck.dispose', { deckId })
	}
})
