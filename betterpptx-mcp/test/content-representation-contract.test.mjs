import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'

const { buildSpecOperationPlan } = await import('../ir/spec-compiler.mjs')

function baseSpec(content) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Representation contract regression',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'reviewers', outcome: 'Verify native representation.', remember: 'A requested native object stays native.' },
		visualDesign: { world: 'editorial', framing: 'One focused native object.' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide timing', syncPolicy: 'manual' },
		validation: { validateBeforeSave: true },
		slides: [{ id: 'representation-slide', title: 'Native representation', message: 'The requested object remains native.', layoutIntent: 'title-only', content }],
	}
}

function plannedObject(result, name) {
	return result.plan.slides.flatMap(slide => slide.objects).find(object => object.blockName === name)
}

test('legacy chart, table, and SmartArt aliases lower to their native carriers', () => {
	const result = buildSpecOperationPlan(baseSpec([
		{ kind: 'chart', name: 'chart-alias', chartType: 'line', series: [{ name: 'Outcome', labels: ['A', 'B'], values: [1, 2] }], summary: 'Illustrative native chart.' },
		{ kind: 'table', name: 'table-alias', rows: [['A', 'B'], ['1', '2']], summary: 'Editable native table.', tableOptions: { fill: { color: '132633' }, fontSize: 12, margin: 0.08 } },
		{ kind: 'smartArt', name: 'smartart-alias', layoutId: 'urn:microsoft.com/office/officeart/2005/8/layout/cycle2', nodes: [{ id: 'one', text: 'Observe' }, { id: 'two', text: 'Improve' }], summary: 'Editable native cycle.' },
	]), { plan: 'premium', preserveAuthoredPrecision: true })

	assert.deepEqual(result.errors, [])
	assert.equal(plannedObject(result, 'chart-alias')?.primitive, 'chart')
	assert.equal(plannedObject(result, 'chart-alias')?.contentRepresentation?.plannedRepresentation, 'native-chart')
	assert.equal(plannedObject(result, 'table-alias')?.primitive, 'table')
	assert.equal(plannedObject(result, 'table-alias')?.contentRepresentation?.plannedRepresentation, 'native-table')
	assert.equal(plannedObject(result, 'smartart-alias')?.primitive, 'smartart')
	assert.equal(plannedObject(result, 'smartart-alias')?.contentRepresentation?.plannedRepresentation, 'native-smartart')
	assert.equal(plannedObject(result, 'smartart-alias')?.contentRepresentation?.aliasNormalized, true)
})

test('unsupported structured fields fail at the public contract instead of becoming text', () => {
	assert.throws(() => buildSpecOperationPlan(baseSpec([
		{ kind: 'chart', name: 'bad-chart', chartType: 'line', series: [{ name: 'Outcome', labels: ['A', 'B'], values: [1, 2] }], dataSummary: 'Not a public chart field.' },
	]), { plan: 'premium' }), /dataSummary is not part of the public chart contract/)

	assert.throws(() => buildSpecOperationPlan(baseSpec([
		{ kind: 'unknown-native-object', name: 'bad-object', text: 'must not become text' },
	]), { plan: 'premium' }), error => error?.code === 'CONTENT_KIND_UNSUPPORTED' && error?.details?.path === 'slides[0].content[0]')
})
