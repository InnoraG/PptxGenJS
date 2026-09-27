import assert from 'node:assert/strict'
import test from 'node:test'

import { createMcpToolDispatcher, getDeck } from '../engine.mjs'

const dataOf = (label, result) => {
	assert.equal(result?.ok, true, `${label}: ${JSON.stringify(result)}`)
	return result.data || result
}

function metadata(title) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title, layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', objectIdentity: 'stable-names-required' },
		contentStory: { audience: 'presentation authors', outcome: 'prove multiple-master lifecycle', remember: 'bindings remain semantic' },
		visualDesign: { world: 'multiple-master lifecycle', framing: 'native inheritance', tone: 'technical' },
		motionTime: { masterClock: 'static', timingSource: 'authored', syncPolicy: 'one' },
	}
}

const master = (title, color) => ({ title, background: color })
const layout = (name, masterName, activate = false) => ({ name, width: 13.333333, height: 7.5, masterName, activate })
const slide = (id, slideIndex, layoutName, masterName) => ({ id, slideIndex, title: id, layoutIntent: 'title-only', layoutName, masterName, content: [] })

function initialSpec() {
	return {
		...metadata('Multiple-master lifecycle'),
		masters: [master('Alpha', '112233'), master('Beta', '445566')],
		layouts: [layout('ALPHA_LAYOUT', 'Alpha', true), layout('BETA_LAYOUT', 'Beta')],
		slides: [slide('alpha-slide', undefined, 'ALPHA_LAYOUT', 'Alpha'), slide('beta-slide', undefined, 'BETA_LAYOUT', 'Beta')],
	}
}

async function patch(mcp, deckId, spec) {
	const entry = getDeck(deckId)
	return dataOf('patch', await mcp.call('betterpptx.deck.generate_from_spec', {
		deckId, deckVersion: entry.deckVersion, spec, phase: 'commit', commitMode: 'patch', plan: 'premium', billingConfirmed: true, detail: 'full',
	}))
}

async function exportCurrent(mcp, deckId) {
	return dataOf('export', await mcp.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' })).spec
}

test('multiple physical masters support reorder, dependent rebind/delete, and full reset', async () => {
	const mcp = createMcpToolDispatcher({ __skipDurableOperationLedger: true, __skipDurableDeckPersistence: true, sessionId: `multiple-master-lifecycle-${Date.now()}`, blackBox: false })
	const created = dataOf('create', await mcp.call('betterpptx.deck.generate_from_spec', {
		spec: initialSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
	}))
	const deckId = created.deckId
	try {
		await patch(mcp, deckId, {
			...metadata('Reorder multiple masters'),
			masters: [master('Beta', '445566'), master('Alpha', '112233')],
			layouts: [layout('BETA_LAYOUT', 'Beta', true), layout('ALPHA_LAYOUT', 'Alpha')],
			slides: [slide('alpha-slide', 0, 'ALPHA_LAYOUT', 'Alpha'), slide('beta-slide', 1, 'BETA_LAYOUT', 'Beta')],
		})
		let exported = await exportCurrent(mcp, deckId)
		assert.deepEqual(exported.masters.map(item => item.title), ['Beta', 'Alpha'])
		assert.deepEqual(exported.layouts.map(item => item.name), ['BETA_LAYOUT', 'ALPHA_LAYOUT'])
		assert.deepEqual(exported.slides.map(item => item.masterName), ['Alpha', 'Beta'])

		await patch(mcp, deckId, {
			...metadata('Delete one master after rebinding its descendants'),
			masters: [master('Alpha', '112233')],
			layouts: [layout('ALPHA_LAYOUT', 'Alpha', true), layout('BETA_LAYOUT', 'Alpha')],
			slides: [slide('alpha-slide', 0, 'ALPHA_LAYOUT', 'Alpha'), slide('beta-slide', 1, 'BETA_LAYOUT', 'Alpha')],
		})
		exported = await exportCurrent(mcp, deckId)
		assert.deepEqual(exported.masters.map(item => item.title), ['Alpha'])
		assert.deepEqual(exported.layouts.map(item => item.masterName), ['Alpha', 'Alpha'])
		assert.deepEqual(exported.slides.map(item => item.masterName), ['Alpha', 'Alpha'])

		await patch(mcp, deckId, {
			...metadata('Reset authored master and layout collections'),
			masters: null, layouts: null,
			slides: [slide('alpha-slide', 0, null, null), slide('beta-slide', 1, null, null)],
		})
		exported = await exportCurrent(mcp, deckId)
		assert.equal(Object.hasOwn(exported, 'masters'), false)
		assert.deepEqual(exported.layouts, [])
		assert.deepEqual(exported.slides.map(item => Object.hasOwn(item, 'masterName')), [false, false])
		assert.deepEqual(exported.slides.map(item => Object.hasOwn(item, 'layoutName')), [false, false])
	} finally {
		await mcp.call('betterpptx.deck.dispose', { deckId })
	}
})
