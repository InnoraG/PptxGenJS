import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

function dataOf(label, result) {
	assert.equal(result?.ok, true, `${label}: ${JSON.stringify(result)}`)
	return result.data || result
}

function metadata(title) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title, layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'authors', outcome: 'prove exact semantic slides', remember: 'identity and native carriers' },
		visualDesign: { world: 'editorial', framing: 'slide lifecycle', tone: 'technical' },
		motionTime: { masterClock: 'static', timingSource: 'authored', syncPolicy: 'single' },
		styleIntent: { artDirection: 'editorial', density: 'sparse', tone: 'technical' },
	}
}

function fullSpec() {
	return {
		...metadata('Add slide lifecycle'),
		masters: [{ title: 'EntryMaster', background: 'F8FAFC' }],
		layouts: [{ name: 'EntryLayout', masterName: 'EntryMaster', width: 13.333333, height: 7.5 }],
		slides: [
			{
				id: 'slide-a', title: 'Slide A', layoutIntent: 'title-only', layoutName: 'EntryLayout', masterName: 'EntryMaster',
				hidden: false, showMasterShapes: false, showMasterBackground: false,
				transition: { type: 'fade', duration: 0, advanceOnClick: false }, notes: 'Notes A — α\n第二行',
				content: [{ kind: 'textBox', name: 'body-a', text: 'A' }],
			},
			{ id: 'slide-b', title: 'Slide B', layoutIntent: 'title-only', layoutName: 'EntryLayout', masterName: 'EntryMaster', content: [{ kind: 'textBox', name: 'body-b', text: 'B' }] },
		],
	}
}

function patchSpec(slides, patchPlan) {
	return { ...metadata('Add slide lifecycle'), slides, ...(patchPlan ? { patchPlan } : {}) }
}

async function commit(mcp, deckId, spec) {
	return dataOf('patch commit', await mcp.call('betterpptx.deck.generate_from_spec', {
		deckId,
		deckVersion: getDeck(deckId).deckVersion,
		commitMode: 'patch',
		phase: 'commit',
		spec,
		plan: 'premium',
		billingConfirmed: true,
		detail: 'full',
	}))
}

test('slide entry survives update, reset, re-edit, duplicate identity, reorder, delete, and export', async () => {
	const mcp = createMcpToolDispatcher({ __skipDurableOperationLedger: true, sessionId: `add-slide-sparse-${Date.now()}`, blackBox: false })
	const created = dataOf('create', await mcp.call('betterpptx.deck.generate_from_spec', {
		spec: fullSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
	}))
	const deckId = created.deckId
	try {
		let entry = getDeck(deckId)
		assert.equal(entry.pptx.slides[0]._betterpptxSemanticId, 'slide-a')
		assert.equal(entry.pptx.slides[0]._showMasterSp, false)
		assert.equal(entry.pptx.slides[0].transition.duration, 0)

		await commit(mcp, deckId, patchSpec([{ id: 'slide-a', slideIndex: 0, title: 'Slide A', layoutIntent: 'title-only', content: [], hidden: true, showMasterShapes: true, showMasterBackground: true, transition: { type: 'push', direction: 'left', advanceOnClick: false, advanceAfterTime: 0 }, notes: 'Updated notes' }]))
		entry = getDeck(deckId)
		assert.equal(entry.pptx.slides[0].hidden, true)
		assert.equal(entry.pptx.slides[0]._showMasterSp, true)
		assert.equal(entry.pptx.slides[0].transition.advanceAfterTime, 0)
		assert.match(entry.pptx.slides[0]._slideObjects.find(item => (item.type || item._type) === 'notes')?.text?.[0]?.text || '', /Updated notes/)

		await commit(mcp, deckId, patchSpec([{ id: 'slide-a', slideIndex: 0, title: 'Slide A', layoutIntent: 'title-only', content: [], hidden: null, showMasterShapes: null, showMasterBackground: null, transition: null, notes: null }]))
		entry = getDeck(deckId)
		assert.equal(entry.pptx.slides[0].hidden, false)
		assert.equal(entry.pptx.slides[0]._showMasterSp, undefined)
		assert.equal(entry.pptx.slides[0].transition, undefined)
		assert.equal(entry.pptx.slides[0]._slideObjects.some(item => (item.type || item._type) === 'notes'), false)

		await commit(mcp, deckId, patchSpec([{ id: 'slide-a', slideIndex: 0, title: 'Slide A', layoutIntent: 'title-only', content: [], hidden: false, showMasterShapes: false, showMasterBackground: false, transition: { type: 'fade', duration: 0, advanceOnClick: false }, notes: 'Re-edited notes' }]))
		await commit(mcp, deckId, patchSpec([{ id: 'slide-a', slideIndex: 0, title: 'Slide A', layoutIntent: 'title-only', content: [] }], { duplicateSlides: [{ slideIndex: 0, id: 'slide-a-copy', title: 'Slide A Copy' }] }))
		entry = getDeck(deckId)
		assert.deepEqual(entry.pptx.slides.map(slide => slide._betterpptxSemanticId), ['slide-a', 'slide-b', 'slide-a-copy'])
		assert.equal(entry.pptx.slides[2]._betterpptxTitle, 'Slide A Copy')
		assert.deepEqual(entry.pptx.slides[2].transition, entry.pptx.slides[0].transition)
		assert.equal(entry.pptx.slides[2]._showMasterSp, false)

		await commit(mcp, deckId, patchSpec([{ id: 'slide-a', slideIndex: 0, title: 'Slide A', layoutIntent: 'title-only', content: [] }], { reorderSlides: { order: [2, 0, 1] } }))
		entry = getDeck(deckId)
		assert.deepEqual(entry.pptx.slides.map(slide => slide._betterpptxSemanticId), ['slide-a-copy', 'slide-a', 'slide-b'])
		await commit(mcp, deckId, patchSpec([{ id: 'slide-a-copy', slideIndex: 0, title: 'Slide A Copy', layoutIntent: 'title-only', content: [] }], { deleteSlides: [2] }))
		entry = getDeck(deckId)
		assert.deepEqual(entry.pptx.slides.map(slide => slide._betterpptxSemanticId), ['slide-a-copy', 'slide-a'])

		const exported = dataOf('export', await mcp.call('betterpptx.deck.export_spec', { deckId, detail: 'full' })).spec
		assert.deepEqual(exported.slides.map(slide => slide.id), ['slide-a-copy', 'slide-a'])
		assert.equal(exported.slides[0].layoutName, 'EntryLayout')
		assert.equal(exported.slides[0].masterName, 'EntryMaster')
		assert.equal(exported.slides[0].showMasterShapes, false)
		assert.equal(exported.slides[0].transition.duration, 0)
		assert.equal(exported.slides[0].notes, 'Re-edited notes')
	} finally {
		await mcp.call('betterpptx.deck.dispose', { deckId })
	}
})

test('invalid duplicate identity and layout binding fail before metadata or slide mutation', async () => {
	const mcp = createMcpToolDispatcher({ __skipDurableOperationLedger: true, sessionId: `add-slide-negative-${Date.now()}`, blackBox: false })
	const created = dataOf('create', await mcp.call('betterpptx.deck.generate_from_spec', {
		spec: fullSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
	}))
	const deckId = created.deckId
	try {
		for (const spec of [
			{ ...patchSpec([{ id: 'slide-a', slideIndex: 0, title: 'Slide A', layoutIntent: 'title-only', content: [] }], { duplicateSlides: [{ slideIndex: 0, id: 'slide-b' }] }), title: 'MUTATED duplicate' },
			{ ...patchSpec([{ id: 'slide-a', slideIndex: 0, title: 'Slide A', layoutIntent: 'title-only', layoutName: 'MissingLayout', content: [] }]), title: 'MUTATED layout' },
		]) {
			const before = getDeck(deckId)
			const snapshot = { title: before.pptx.title, version: before.deckVersion, ids: before.pptx.slides.map(slide => slide._betterpptxSemanticId) }
			const rejected = await mcp.call('betterpptx.deck.generate_from_spec', { deckId, deckVersion: before.deckVersion, commitMode: 'patch', phase: 'commit', spec, plan: 'premium', billingConfirmed: true })
			assert.equal(rejected.ok, false, JSON.stringify(rejected))
			const after = getDeck(deckId)
			assert.deepEqual({ title: after.pptx.title, version: after.deckVersion, ids: after.pptx.slides.map(slide => slide._betterpptxSemanticId) }, snapshot)
		}
	} finally {
		await mcp.call('betterpptx.deck.dispose', { deckId })
	}
})

test('append mode maps compiled content and semantic handles to the newly appended slide', async () => {
	const mcp = createMcpToolDispatcher({ __skipDurableOperationLedger: true, sessionId: `add-slide-append-${Date.now()}`, blackBox: false })
	const created = dataOf('create', await mcp.call('betterpptx.deck.generate_from_spec', {
		spec: fullSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
	}))
	const deckId = created.deckId
	try {
		const appendedSpec = {
			...metadata('Append one semantic slide'),
			slides: [{
				id: 'slide-c', title: 'Slide C', layoutIntent: 'title-only', notes: 'Appended notes',
				content: [{ kind: 'textBox', name: 'body-c', objectName: 'body-c', text: 'APPENDED CONTENT' }],
			}],
		}
		const appended = dataOf('append', await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId, deckVersion: getDeck(deckId).deckVersion, spec: appendedSpec, phase: 'commit', commitMode: 'append', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		const entry = getDeck(deckId)
		assert.equal(entry.pptx.slides.length, 3)
		assert.deepEqual(entry.pptx.slides.map(slide => slide._betterpptxSemanticId), ['slide-a', 'slide-b', 'slide-c'])
		const compiledObjectName = 'slide-c.body-c.textBox'
		assert.equal(entry.pptx.slides[0]._slideObjects.some(object => object.options?.objectName === compiledObjectName), false)
		assert.equal(entry.pptx.slides[2]._slideObjects.some(object => object.options?.objectName === compiledObjectName), true)
		assert.equal(appended.committedObjects.find(object => object.objectName === compiledObjectName)?.slideIndex, 2)
		const handle = Object.values(entry.semanticHandles).find(item => item.objectName === compiledObjectName)
		assert.equal(handle?.slideIndex, 2)
	} finally {
		await mcp.call('betterpptx.deck.dispose', { deckId })
	}
})
