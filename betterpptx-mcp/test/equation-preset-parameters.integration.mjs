import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

test('semantic equation preset parameters remain authoritative through compiler and execution', async () => {
	const mcp = createMcpToolDispatcher({
		__skipDurableOperationLedger: true,
		sessionId: `equation-parameters-${Date.now()}`,
		clientInfo: { name: 'equation-parameter-proof', version: '1' },
	})
	const context = { __skipDurableOperationLedger: true, clientInfo: { name: 'equation-parameter-proof' } }
	const source = { lower: 't=1', upper: 'n', body: 'CFₜ/(1+r)ᵗ' }
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Equation parameter proof',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
		contentStory: { audience: 'reviewers', outcome: 'Prove equation parameters survive.', remember: 'The AI-authored expression remains authoritative.' },
		visualDesign: { world: 'Luxe investment committee', framing: 'one native equation' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide transition', syncPolicy: 'single slide clock' },
		layout: 'LAYOUT_WIDE',
		slides: [{
			id: 'proof', title: 'Equation parameters survive', role: 'proof', message: 'The discounted cash-flow expression remains native and editable.', layoutIntent: 'title-body',
			content: [
				{ kind: 'title', name: 'title', text: 'Equation parameters survive' },
				{ kind: 'equation', name: 'formula', equationGalleryPresetId: 'equation-large-operator-ribbon-003', parameters: source, altText: 'Discounted cash flow summation' },
			],
		}],
	}
	const generated = await mcp.call('betterpptx.deck.generate_from_spec', { mode: 'expressive', outputName: 'equation-parameter-proof.pptx', spec }, context)
	assert.equal(generated?.ok, true, JSON.stringify(generated))
	const entry = getDeck(generated.data.deckId)
	const equation = (entry.pptx.slides[0]._slideObjects || []).find(object => object?._type === 'equation')
	assert.ok(equation, 'native equation object was not created')
	assert.equal(equation.equation?.source?.kind, 'nary')
	assert.equal(equation.equation?.source?.lower, source.lower)
	assert.equal(equation.equation?.source?.upper, source.upper)
	assert.equal(equation.equation?.source?.body, source.body)
	assert.equal(equation.equation?._equationPresetResolved, undefined, 'private compiler marker leaked into the library object')
})
