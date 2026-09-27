// Regression coverage for semantic table headers.  A table-panel may declare
// header:[...] separately from rows:[...]; the compiler must materialize that
// header row exactly once before the native table operation is emitted.
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSpecOperationPlan, publicSpecCapabilityMatrix } from '../ir/spec-compiler.mjs'
import { artDataStyleForSpec } from '../ir/layout-engine.mjs'

const baseSpec = (content, artDirection) => ({
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Semantic table header',
	authoringContract: { workflow: 'authoring-excellence-director-v1' },
	contentStory: { audience: 'reviewers', outcome: 'read a table', remember: 'headers stay visible' },
	visualDesign: { world: 'observatory' },
	motionTime: { masterClock: 'narration-text' },
	...(artDirection ? { styleIntent: { artDirection } } : {}),
	slides: [{ id: 'table-slide', title: 'Table', layoutIntent: 'dense-appendix', content: [
		{ kind: 'title', name: 'title', text: 'Table' },
		content,
	] }],
})

function tableOperation(spec) {
	const plan = buildSpecOperationPlan(spec, { plan: 'premium' })
	assert.equal(plan.errors.length, 0, JSON.stringify(plan.errors))
	return plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_table')
}

test('table-panel prepends and styles an explicit header row', () => {
	const operation = tableOperation(baseSpec({
		kind: 'table-panel',
		name: 'table',
		header: ['Signal', 'Treatment'],
		rows: [['Participants', '120'], ['Events', '2']],
		verified: true,
		evidenceSource: 'synthetic test fixture',
	}))
	assert.deepEqual(operation.args.rows.map(row => row.map(cell => cell.text)), [
		['Signal', 'Treatment'],
		['Participants', '120'],
		['Events', '2'],
	])
	assert.equal(operation.args.rows[0][0].options.bold, true)
	assert.equal(operation.args.rows[1][0].options.bold, undefined)
})

test('table-panel does not duplicate a header already present in rows', () => {
	const operation = tableOperation(baseSpec({
		kind: 'table-panel',
		name: 'table',
		header: [{ text: 'Signal' }, { text: 'Treatment' }],
		rows: [['Signal', 'Treatment'], ['Participants', '120']],
		verified: true,
		evidenceSource: 'synthetic test fixture',
	}))
	assert.deepEqual(operation.args.rows.map(row => row.map(cell => cell.text)), [
		['Signal', 'Treatment'],
		['Participants', '120'],
	])
})

test('public capability matrix teaches the semantic header contract', () => {
	const row = publicSpecCapabilityMatrix().specNative.find(item => item.kind === 'table-panel')
	assert.match(row.rule, /header.*rows/i)
})

test('table bodies inherit the selected World panel instead of a generic navy fill', () => {
	const luxeSpec = baseSpec({
		kind: 'table-panel',
		name: 'luxe-table',
		header: ['Signal', 'Readout'],
		rows: [['Warmth', 'Espresso'], ['Accent', 'Gold']],
		verified: true,
		evidenceSource: 'synthetic test fixture',
	}, 'luxe')
	const operation = tableOperation(luxeSpec)
	const worldData = artDataStyleForSpec(luxeSpec)
	assert.equal(operation.args.options.fill.color, worldData.tableFill)
	assert.notEqual(operation.args.options.fill.color, '0E1A30')
	assert.equal(operation.args.options.border[0].color, worldData.tableBorder)
	assert.equal(operation.args.rows[0][0].options.border[2].color, worldData.tableRule)
	assert.equal(operation.args.rows[0][0].options.fill, undefined)

	const explicitFillSpec = baseSpec({
		kind: 'table-panel',
		name: 'explicit-rule-table',
		header: [{ text: 'Signal', options: { fill: { color: '123456' } } }, 'Readout'],
		rows: [['Warmth', 'Espresso']],
		verified: true,
		evidenceSource: 'synthetic test fixture',
	}, 'luxe')
	const explicitFillOperation = tableOperation(explicitFillSpec)
	assert.equal(explicitFillOperation.args.rows[0][0].options.fill.color, '123456')

	const flatSpec = baseSpec({
		kind: 'table-panel',
		name: 'editorial-table',
		header: ['Signal', 'Readout'],
		rows: [['Form', 'Rule'], ['Space', 'Airy']],
		verified: true,
		evidenceSource: 'synthetic test fixture',
	}, 'editorial')
	const flatOperation = tableOperation(flatSpec)
	const flatData = artDataStyleForSpec(flatSpec)
	assert.equal(flatOperation.args.options.fill.color, flatData.tableFill)
	assert.equal(flatOperation.args.rows[0][0].options.border[2].color, flatData.tableRule)

	const posterSpec = baseSpec({
		kind: 'table-panel',
		name: 'poster-table',
		header: ['Signal', 'Readout'],
		rows: [['Force', 'Accent'], ['Edge', 'Hard']],
		verified: true,
		evidenceSource: 'synthetic test fixture',
	}, 'brutalist')
	const posterOperation = tableOperation(posterSpec)
	const posterData = artDataStyleForSpec(posterSpec)
	assert.equal(posterOperation.args.options.border[0].color, posterData.tableBorder)
	assert.equal(posterOperation.args.options.border[0].color, 'FACC15')
})
