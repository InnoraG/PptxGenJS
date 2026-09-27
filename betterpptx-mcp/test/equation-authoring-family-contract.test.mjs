import test from 'node:test'
import assert from 'node:assert/strict'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'

const {
	EQUATION_AUTHORING_UNIT_ID,
	EQUATION_AUTHORING_FAMILY_CONTRACT,
	normalizeEquationOptions,
	validateDirectEquationAdd,
	validateDirectEquationUpdate,
} = await import('../equation-authoring-family-contract.mjs')
const { classifyCatalogEntry } = await import('../capability-truth.mjs')
const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

test('equation authoring contract closes semantic, exact, and reset boundaries', () => {
	assert.equal(EQUATION_AUTHORING_FAMILY_CONTRACT.id, EQUATION_AUTHORING_UNIT_ID)
	assert.equal(EQUATION_AUTHORING_FAMILY_CONTRACT.capabilityStatus, 'executable-exact-structured')
	assert.ok(EQUATION_AUTHORING_FAMILY_CONTRACT.componentOwnership.includes('equationFallback'))
	assert.deepEqual(normalizeEquationOptions({ source: { kind: 'fraction', numerator: 'a', denominator: 'b' }, sourceFormat: 'template' }).source, { kind: 'fraction', numerator: 'a', denominator: 'b' })
	assert.deepEqual(normalizeEquationOptions({ equationGalleryPresetId: 'equation-semantic-004', parameters: { numerator: 'a', denominator: 'b' } }).parameters, { numerator: 'a', denominator: 'b' })
	assert.throws(() => normalizeEquationOptions({ source: null }), /cannot be null/)
	assert.throws(() => normalizeEquationOptions({ source: '<m:oMath/>', sourceFormat: 'omml' }), /namespace/)
	assert.throws(() => normalizeEquationOptions({ source: 'x', _rawXml: '<x/>' }), /private/)
	assert.doesNotThrow(() => validateDirectEquationAdd({ deckId: 'd', slideIndex: 0, source: 'x', sourceFormat: 'unicodeMath', display: 'linear' }))
	assert.doesNotThrow(() => validateDirectEquationUpdate({ deckId: 'd', slideIndex: 0, target: { objectName: 'eq' }, patch: { fallback: null } }))
	const truth = classifyCatalogEntry({ id: 'cap_8ec418fc3148da5197bf', sourceKind: 'capability-row', family: 'equations', label: 'Equations and math' })
	assert.equal(truth.capabilityStatus, 'executable-exact-structured')
})

test('equation fallback replacement and null reset rebuild native object atomically', async () => {
	const mcp = createMcpToolDispatcher({ __skipDurableOperationLedger: true, sessionId: `equation-family-${Date.now()}`, clientInfo: { name: 'equation-family-contract', version: '1' } })
	const context = { __skipDurableOperationLedger: true, clientInfo: { name: 'equation-family-contract' } }
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Equation lifecycle', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
		contentStory: { audience: 'reviewers', outcome: 'Equation lifecycle', remember: 'Native math' }, visualDesign: { world: 'Clean technical', framing: 'equation' }, motionTime: { masterClock: 'static', timingSource: 'authored slide transition', syncPolicy: 'single slide clock' },
		slides: [{ id: 's1', title: 'Formula', content: [{ kind: 'equation', name: 'eq', source: { kind: 'fraction', numerator: 'a', denominator: 'b' }, sourceFormat: 'template', display: 'professional', fallback: { data: tinyPng, rendered: true }, altText: 'a over b' }] }],
	}
	const created = await mcp.call('betterpptx.deck.generate_from_spec', { mode: 'expressive', outputName: 'equation-family-contract.pptx', spec }, context)
	assert.equal(created?.ok, true, JSON.stringify(created))
	const deckId = created.data.deckId
	const deck = getDeck(deckId)
	let obj = deck.pptx.slides[0]._slideObjects.find(item => item?._type === 'equation')
	assert.ok(obj && obj.fallbackRid)
	assert.equal(obj.equation.display, 'professional')
	const oldRid = obj.fallbackRid
	const replaced = await mcp.call('betterpptx.deck.generate_from_spec', {
		deckId, deckVersion: getDeck(deckId).deckVersion, commitMode: 'patch', phase: 'commit', plan: 'premium', billingConfirmed: true,
		spec: { ...spec, slides: [{ id: 's1', title: 'Formula', content: [{ kind: 'equation', name: 'eq', source: 'x^2', sourceFormat: 'unicodeMath', fallback: null, altText: 'x squared' }] }] },
	}, context)
	assert.equal(replaced?.ok, true, JSON.stringify(replaced))
	obj = getDeck(deckId).pptx.slides[0]._slideObjects.find(item => item?._type === 'equation')
	assert.ok(obj)
	assert.equal(obj.fallbackRid, undefined)
	assert.equal((getDeck(deckId).pptx.slides[0]._relsMedia || []).some(rel => Number(rel.rId) === Number(oldRid)), false)
	const rejected = await mcp.call('betterpptx.deck.generate_from_spec', {
		deckId, deckVersion: getDeck(deckId).deckVersion, commitMode: 'patch', phase: 'commit', plan: 'premium', billingConfirmed: true,
		spec: { ...spec, slides: [{ id: 's1', title: 'Formula', content: [{ kind: 'equation', name: 'eq', source: null }] }] },
	}, context)
	assert.equal(rejected?.ok, false)
	assert.match(String(rejected?.error?.message || ''), /cannot be null/)
})
