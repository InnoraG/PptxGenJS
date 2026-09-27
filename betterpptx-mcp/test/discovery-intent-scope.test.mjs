import assert from 'node:assert/strict'
import test from 'node:test'

const { interpretCapabilityIntent, publicControlRegistry } = await import('../authoring-control-registry.mjs')

test('clause-aware intent does not combine separately negated tables and presenter clauses', () => {
	const interpretation = interpretCapabilityIntent('Editable typography only. No tables. No presenter. No animation.')
	assert.deepEqual(interpretation.matchedIntents, ['editable-typography'])
	assert.deepEqual(interpretation.relevantFamilies, ['wordart-text3d'])
	assert.equal(interpretation.matchedIntents.includes('animated-table'), false)
	assert.deepEqual(interpretation.exclusions.sort(), ['motion-transitions-morph', 'presenter-motion', 'tables'])
	assert.equal(interpretation.clauses.length, 4)
	assert.deepEqual(interpretation.clauses[0].requested, ['editable-typography'])
})

test('scoped exclusions distinguish narration and paid media from unrelated native authoring', () => {
	const interpretation = interpretCapabilityIntent('No narration, but animate a process. No paid media; native shapes are fine.')
	assert.ok(interpretation.matchedIntents.includes('process-motion'))
	assert.ok(interpretation.relevantFamilies.includes('motion-transitions-morph'))
	assert.ok(interpretation.relevantFamilies.includes('structural'))
	assert.ok(interpretation.exclusions.includes('narration'))
	assert.ok(interpretation.exclusions.includes('paid-media'))
})

test('intent filters returned controls while preserving an explicit unfiltered route', () => {
	const result = publicControlRegistry({ intent: 'Editable typography only. No tables. No presenter. No animation.', limit: 20 })
	assert.ok(result.controls.length > 0)
	assert.ok(result.controls.every(control => control.family === 'wordart-text3d'))
	assert.equal(result.controls.some(control => control.family === 'tables'), false)
	assert.deepEqual(result.unfiltered.request, { view: 'controls', offset: 0, limit: 12 })
})

test('coordinated negation carries across comma and or lists', () => {
	const interpretation = interpretCapabilityIntent('Native shapes only. No presenter, narration or tables.')
	assert.deepEqual(interpretation.relevantFamilies.sort(), ['shapes-gradients', 'structural'])
	assert.deepEqual(interpretation.onlyFamilies.sort(), ['shapes-gradients', 'structural'])
	assert.deepEqual(interpretation.exclusions.sort(), ['narration', 'presenter-motion', 'tables'])
	const result = publicControlRegistry({ intent: 'Native shapes only. No presenter, narration or tables.', limit: 50 })
	assert.ok(result.controls.length > 0)
	assert.ok(result.controls.every(control => ['shapes-gradients', 'structural'].includes(control.family)))
	assert.equal(result.lessons.some(lesson => ['tables', 'presenter-motion'].includes(lesson.family)), false)
})

test('negated feature names do not create positive semantic matches', () => {
	const interpretation = interpretCapabilityIntent('No presenter, narration or tables.')
	assert.deepEqual(interpretation.matchedIntents, [])
	assert.deepEqual(interpretation.relevantFamilies, [])
	assert.deepEqual(interpretation.exclusions.sort(), ['narration', 'presenter-motion', 'tables'])
})
