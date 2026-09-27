import assert from 'node:assert/strict'
import test from 'node:test'

import { applyPresenterRepresentationPolicy } from '../ir/presenter-contract.mjs'
import { expandPresenterDirective } from '../ir/presenter-director.mjs'

function spec(onSlides, slideCount = 4) {
	return {
		presenter: { id: 'host', model: 'gen://rigged3d/example', ...(onSlides === undefined ? {} : { onSlides }) },
		slides: Array.from({ length: slideCount }, (_, index) => ({ id: `slide-${index + 1}`, content: [] })),
	}
}

test('semantic opener and closer presenter scope stays bounded', () => {
	for (const token of ['opener+closer', 'ends']) {
		const result = applyPresenterRepresentationPolicy(spec(token))
		assert.deepEqual(result.presenter.onSlides, [0, 3])
	}
})

test('explicit presenter indexes are normalized without expanding scope', () => {
	const result = applyPresenterRepresentationPolicy(spec([3, 1, 3, -1, 8]))
	assert.deepEqual(result.presenter.onSlides, [1, 3])
})

test('none disables the deck-level presenter and omitted scope still means all slides', () => {
	assert.equal(applyPresenterRepresentationPolicy(spec('none')).presenter.enabled, false)
	assert.deepEqual(applyPresenterRepresentationPolicy(spec(undefined, 3)).presenter.onSlides, [0, 1, 2])
})

test('non-adjacent presenter appearances do not synthesize an unpaired Morph', () => {
	const source = spec('opener+closer')
	source.slides = source.slides.map((slide, index) => ({ ...slide, title: `Slide ${index + 1}`, role: index === 0 ? 'opener' : index === 3 ? 'closer' : 'content' }))
	const governed = applyPresenterRepresentationPolicy(source)
	const result = expandPresenterDirective(governed)
	assert.equal(result.slides[0].content.some(block => block.name === 'presenter'), true)
	assert.equal(result.slides[1].content.some(block => block.name === 'presenter'), false)
	assert.equal(result.slides[2].content.some(block => block.name === 'presenter'), false)
	assert.equal(result.slides[3].content.some(block => block.name === 'presenter'), true)
	assert.equal(result.slides[3].transition, undefined)
})

test('adjacent presenter appearances retain the intentional Morph thread', () => {
	const result = expandPresenterDirective(applyPresenterRepresentationPolicy(spec(undefined, 2)))
	assert.deepEqual(result.slides[1].transition, { type: 'morph', option: 'byObject' })
})
