import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSpecOperationPlan, validateCompiledNativePrimitiveArguments } from '../ir/spec-compiler.mjs'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

function specFor(explicitAltText = false) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'K56 rich text native accessibility', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
		contentStory: { audience: 'maintainers', outcome: 'Inspect native rich text.', remember: 'Semantic text must remain editable.' },
		visualDesign: { world: 'neutral', framing: 'Two contrasting native text shapes.' },
		motionTime: { masterClock: 'authored', timingSource: 'native slide timeline' },
		slides: [{ id: 'proof', title: 'Native text', content: [{
			kind: 'textShape', name: 'rich-heading', rect: { x: 1, y: 1, w: 3, h: 0.8 },
			text: [{ text: 'Same ', options: { color: '112233' } }, { text: 'payload', options: { bold: true } }],
			...(explicitAltText ? { altText: 'Explicit accessible heading' } : {}),
			style: { fontFace: 'Aptos', fontSize: 18 },
		}] }],
	}
}

test('compiled rich-run textShape uses textual fallback while preserving explicit alt text', () => {
	for (const explicit of [false, true]) {
		const operation = buildSpecOperationPlan(specFor(explicit)).operations.find(item => item.tool === 'betterpptx.slide.add_text' && item.objectName?.includes('rich-heading'))
		assert.ok(operation)
		assert.equal(operation.args.options.altText, explicit ? 'Explicit accessible heading' : 'Same payload')
		assert.deepEqual(operation.args.text.map(run => run.text), ['Same ', 'payload'])
	}
	const invalid = specFor()
	invalid.slides[0].content[0].altText = [{ text: 'Not an accessibility string' }]
	assert.throws(() => buildSpecOperationPlan(invalid), /altText must be a non-empty string/)
	assert.throws(() => validateCompiledNativePrimitiveArguments([{ tool: 'betterpptx.slide.add_text', args: { text: [{ text: 'Valid' }], options: { objectName: 'injected', altText: [{ text: 'Invalid' }] } } }]), /operations\[0\]\.args\.options\.altText must be a non-empty string/)
	assert.throws(() => validateCompiledNativePrimitiveArguments([{ tool: 'betterpptx.slide.add_group', args: { options: { objectName: 'group', children: [{ kind: 'textShape', text: 'Valid', altText: ['Invalid'] }] } } }]), /children\[0\]\.altText must be a non-empty string/)
})

test('rich-run textShape commits as one editable native text carrier', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `k56-rich-text-alt-${Date.now()}` })
	for (const explicit of [false, true]) {
		const response = await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: specFor(explicit), detail: 'full' })
		assert.equal(response.ok, true, JSON.stringify(response.error || response))
		const deckId = response.data?.deckId || response.deckId
		const carriers = getDeck(deckId).pptx.slides[0]._slideObjects.filter(item => item.options?.objectName?.includes('rich-heading'))
		assert.equal(carriers.length, 1)
		assert.equal(carriers[0]._type, 'text')
		assert.equal(carriers[0].options.altText, explicit ? 'Explicit accessible heading' : 'Same payload')
		assert.deepEqual(carriers[0].text.map(run => run.text), ['Same ', 'payload'])
	}
})
