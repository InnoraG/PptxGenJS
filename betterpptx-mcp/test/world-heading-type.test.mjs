import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

function titleOnlySpec(world, mode = 'light') {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: `${world} heading type`,
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		styleIntent: { artDirection: world, mode },
		slides: [{
			id: 'cover',
			title: 'One line',
			layoutIntent: 'title-only',
			content: [{ kind: 'title', name: 'cover-title', text: 'One line' }],
		}],
	}
}

function titleOptions(plan) {
	const operation = (plan.operations || []).find(item => item.tool === 'betterpptx.slide.add_text' && String(item.args?.options?.objectName || '').includes('cover-title'))
		|| (plan.operations || []).find(item => item.tool === 'betterpptx.slide.add_text')
	return operation?.args?.options || {}
}

test('editorial titles use the World heading face, not the body face', () => {
	const options = titleOptions(buildSpecOperationPlan(titleOnlySpec('editorial'), { dryRun: true }))
	assert.equal(options.fontFace, 'Georgia')
	assert.equal(options.align, 'left')
	assert.equal(options.bold, true)
})

test('mono cover titles use light type and World cover alignment', () => {
	const options = titleOptions(buildSpecOperationPlan(titleOnlySpec('mono'), { dryRun: true }))
	assert.equal(options.fontFace, 'Segoe UI Light')
	assert.equal(options.align, 'center')
	assert.equal(options.bold, false)
})

test('storybook titles use handwriting headings', () => {
	const options = titleOptions(buildSpecOperationPlan(titleOnlySpec('storybook'), { dryRun: true }))
	assert.equal(options.fontFace, 'Segoe Print')
})

test('blueprint titles use monospace headings', () => {
	const options = titleOptions(buildSpecOperationPlan(titleOnlySpec('blueprint', 'dark'), { dryRun: true }))
	assert.equal(options.fontFace, 'Consolas')
})
