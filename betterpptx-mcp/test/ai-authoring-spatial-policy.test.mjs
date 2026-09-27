import assert from 'node:assert/strict'
import test from 'node:test'

import { validateLayoutPlan } from '../ir/layout-engine.mjs'

function overlapPlan() {
	return {
		slideSize: { w: 13.333, h: 7.5 },
		slides: [{
			slideId: 'spatial-policy',
			objects: [
				{ objectName: 'presenter', primitive: 'model3d', rect: { x: 4, y: 1, w: 4, h: 5 } },
				{ objectName: 'table', primitive: 'table', rect: { x: 5, y: 3, w: 5, h: 2 } },
			],
		}],
	}
}

test('ordinary spatial overlap is an AI-authoring diagnostic, never an engine blocker', () => {
	const result = validateLayoutPlan(overlapPlan())
	const overlap = result.issues.find(issue => issue.code === 'OBJECT_OVERLAP')
	assert.equal(result.ok, true)
	assert.equal(result.spatialConflictPolicy, 'report-only')
	assert.ok(overlap)
	assert.equal(overlap.severity, 'warning')
	assert.equal(overlap.evidence.authoringAuthority, 'ai')
	assert.equal(overlap.evidence.engineAction, 'report-only')
	assert.equal(overlap.evidence.spatialConflictPolicy, 'report-only')
	assert.equal(typeof overlap.evidence.overlapArea, 'number')
	assert.equal(typeof overlap.evidence.overlapFractionOfSmaller, 'number')
	assert.match(overlap.fix, /AI authoring must choose/i)
})

test('structural identity faults remain hard errors and are not confused with spatial policy', () => {
	const plan = overlapPlan()
	plan.slides[0].objects.push({ objectName: 'presenter', primitive: 'text', rect: { x: 0, y: 0, w: 1, h: 1 } })
	const result = validateLayoutPlan(plan)
	assert.equal(result.ok, false)
	assert.ok(result.issues.some(issue => issue.code === 'DUPLICATE_OBJECT_NAME' && issue.severity === 'error'))
	assert.ok(result.issues.some(issue => issue.code === 'OBJECT_OVERLAP' && issue.severity === 'warning'))
})
