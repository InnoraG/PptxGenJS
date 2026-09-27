import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateSeriesCoherence } from '../quality/series-coherence.mjs'

test('series coherence reports not-applicable instead of a perfect score with no samples', () => {
	const result = evaluateSeriesCoherence([])
	assert.equal(result.status, 'not-applicable')
	assert.equal(result.score, null)
	assert.equal(result.applicable, false)
	assert.equal(result.denominator, 0)
})

test('series coherence scores an applicable deterministic plan group', () => {
	const result = evaluateSeriesCoherence([
		{ id: 'visual-a', consistencyGroup: 'series', world: { key: 'vela' }, palette: ['101820'], request: { style: 'editorial' }, concept: 'signal' },
		{ id: 'visual-b', consistencyGroup: 'series', world: { key: 'vela' }, palette: ['101820'], request: { style: 'editorial' }, concept: 'evidence' },
	])
	assert.equal(result.status, 'pass')
	assert.equal(result.score, 1)
	assert.equal(result.applicable, true)
	assert.equal(result.denominator, 1)
})
