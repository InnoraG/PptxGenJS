import assert from 'node:assert/strict'
import test from 'node:test'

const { publicControlRegistry } = await import('../authoring-control-registry.mjs')
const { publicBaselineCatalog } = await import('../public-baseline-catalog.mjs')

test('material intent ranks atomic material controls ahead of unrelated themes', () => {
	const result = publicControlRegistry({ intent: 'material', limit: 10 })
	assert.ok(result.controls.length > 0)
	assert.ok(['text3DShape.material', 'shape3D.material'].includes(result.controls[0].id))
	assert.ok(result.controls[0].matchReasons.some(reason => reason.matchedTerm === 'material'))
	assert.equal(result.controls.some(control => control.family === 'art-direction'), false)
})

test('exact JSON paths and ordinary terms are searchable with transparent reasons', () => {
	for (const query of ['options.text3D.material', 'text3D material']) {
		const result = publicControlRegistry({ query, limit: 10 })
		const material = result.controls.find(control => control.id === 'text3DShape.material')
		assert.ok(material, query)
		assert.ok(material.jsonPaths.includes('options.text3D.material'))
		assert.ok(material.matchReasons.some(reason => reason.matchedBy === 'semanticPath'))
	}
})

test('catalog without intent, query, or family remains unfiltered and neutrally ordered', () => {
	const page = publicBaselineCatalog({ offset: 0, limit: 20 })
	assert.equal(page.pagination.query, null)
	assert.ok(page.pagination.total > page.entries.length)
	assert.equal(page.entries.every(entry => !entry.matchReasons), true)
})

test('query stays literal while intent performs semantic routing and offers recovery', () => {
	const literal = publicControlRegistry({ query: 'editable typography only', limit: 10 })
	assert.equal(literal.controls.length, 0)
	assert.equal(literal.recovery.nextCall.request.intent, 'editable typography only')
	assert.equal(literal.routing.query, 'literal-control-search')
	assert.equal(literal.routing.intent, 'semantic-family-and-exclusion-routing')
	const semantic = publicControlRegistry({ intent: 'editable typography only', limit: 10 })
	assert.ok(semantic.controls.length > 0)
	assert.ok(semantic.controls.every(control => control.family === 'wordart-text3d'))
})

test('stop words never create match evidence and matching respects token boundaries', () => {
	const result = publicControlRegistry({ intent: 'No presenter, narration or tables. Native shapes only.', limit: 50 })
	const reasons = result.controls.flatMap(control => control.matchReasons || [])
	assert.equal(reasons.some(reason => ['a', 'and', 'no', 'only', 'or', 'the'].includes(reason.matchedTerm)), false)
	const noQuery = publicBaselineCatalog({ query: 'no', limit: 50 })
	assert.equal(noQuery.entries.some(entry => /minor/i.test(entry.id) || /minor/i.test(entry.label)), false)
})

test('excluded families never appear in matches or lessons', () => {
	const result = publicControlRegistry({ intent: 'Premium polish, but no animation or presenter.', limit: 50 })
	assert.equal(result.controls.some(control => ['motion-transitions-morph', 'presenter-motion'].includes(control.family)), false)
	assert.equal(result.lessons.some(lesson => ['motion-transitions-morph', 'presenter-motion'].includes(lesson.family)), false)
})

test('excluding narration retains picture controls but removes narration controls', () => {
	const intent = 'Premium product reveal with one picture, gradients, shadows and motion. No narration or 3D.'
	const result = publicControlRegistry({ intent, limit: 50 })
	assert.ok(result.interpretation.exclusions.includes('narration'))
	assert.ok(result.controls.some(control => control.family === 'media-images-avatar' && control.selection?.semanticKind !== 'narration'))
	assert.equal(result.controls.some(control => control.selection?.semanticKind === 'narration'), false)
	assert.equal(publicBaselineCatalog({ excludeFamilies: ['narration'], query: 'narration-audio-embedding' }).entries.length, 0)
})

test('a plain premium storytelling brief exposes contrasting optional techniques', () => {
	const result = publicControlRegistry({ intent: 'Create an original premium deck with distinctive visual storytelling and purposeful motion.', limit: 20 })
	const lessons = new Set(result.lessons.map(lesson => lesson.id))
	for (const id of ['dimensional-typography', 'picture-treatment', 'layered-motion', 'chart-emphasis', 'custom-process', 'restrained-flat']) {
		assert.ok(lessons.has(id), `missing optional teaching choice: ${id}`)
	}
	const excluded = publicControlRegistry({ intent: 'Create an original premium deck with purposeful motion. No narration or identity media.', limit: 20 })
	assert.ok(excluded.interpretation.exclusions.includes('narration'))
	assert.ok(excluded.interpretation.exclusions.includes('identity-media'))
	assert.ok(excluded.lessons.some(lesson => lesson.id === 'picture-treatment'), 'excluding identity media must retain ordinary picture teaching')
})
