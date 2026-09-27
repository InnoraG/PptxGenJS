import assert from 'node:assert/strict'
import test from 'node:test'
import JSZip from 'jszip'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'

const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')
const { buildSpecOperationPlan } = await import('../ir/spec-compiler.mjs')

const SEPARATOR = '\u00A0·\u00A0'

function metricSpec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Metric value and qualifier separator',
		authoringContract: {
			workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches',
			layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', geometryAuthority: 'engine',
			placementPolicy: 'semantic-layout-only', textPolicy: 'Semantic content only; the engine owns geometry, fit, staging, and balance.',
		},
		contentStory: { audience: 'executive reviewers', outcome: 'Read each gate without ambiguity.', remember: 'Every value is visibly separated from its qualifier.' },
		handshake: { audience: 'executive reviewers', promise: 'Keep gate values readable.', proof: ['Four editable metric cards.'], bar: 'No value and qualifier may visually concatenate.' },
		visualDesign: { world: 'Editorial', framing: 'One restrained metric row', tone: 'clear' },
		styleIntent: { artDirection: 'editorial', mode: 'dark' },
		theme: { palette: ['0B1220', 'F8FAFC', '38BDF8', '64748B', 'CBD5E1'], fontFace: 'Aptos' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'semantic slide plan', syncPolicy: 'single deck clock' },
		layout: 'LAYOUT_WIDE',
		slides: [{
			id: 'gates', title: 'All four gates pass', message: 'Each value remains distinct from its evidence qualifier.', role: 'evidence', layoutIntent: 'metric-grid',
			content: [
				{ kind: 'title', name: 'slide-title', text: 'All four gates pass' },
				{
					kind: 'metric-grid', name: 'gates', verified: true, evidenceSource: 'deterministic metric separator fixture',
					items: [
						{ name: 'cost', label: 'YEAR-1 TCO', value: '≤$357k', trend: '  vs $420k  ', text: 'Locked model · Finance certifies' },
						{ name: 'availability', label: 'AVAILABILITY', value: '≥99.95%', trend: '30 days', text: 'Customer SLO · SRE certifies' },
						{ name: 'recovery', label: 'RECOVERY', value: '≤30 min', trend: '2 drills', text: 'Rollback rehearsal · Ops certifies' },
						{ name: 'team', label: 'TEAM LOAD', value: '≤1.0 FTE', trend: '8-week avg', text: '5-person platform team · CTO certifies' },
					],
				},
			],
		}],
		validation: { validateBeforeSave: true, requireAccessibility: true },
	}
}

function dataOf(result) {
	assert.equal(result?.ok, true, JSON.stringify(result))
	return result.data || result
}

function metricOperations() {
	const plan = buildSpecOperationPlan(metricSpec(), { plan: 'premium' })
	assert.equal(plan.errors.length, 0, JSON.stringify(plan.errors))
	return plan.operations.filter(operation => operation.tool === 'betterpptx.slide.add_text' && /\.metric-card\./.test(operation.objectName || ''))
}

test('metric-grid compiler emits an explicit editable separator run without trusting caller whitespace', () => {
	const operations = metricOperations()
	assert.equal(operations.length, 4)
	for (const operation of operations) {
		const runs = operation.args.text
		const separatorIndex = runs.findIndex(run => run.text === SEPARATOR)
		assert.ok(separatorIndex > 0, JSON.stringify(runs))
		assert.equal(runs[separatorIndex].options.breakLine, false)
		assert.equal(runs[separatorIndex - 1].options.breakLine, false)
		assert.equal(runs[separatorIndex].options.fontSize, runs[separatorIndex + 1].options.fontSize)
		assert.equal(runs[separatorIndex].options.color, runs[separatorIndex + 1].options.color)
		assert.equal(runs[separatorIndex + 1].text, runs[separatorIndex + 1].text.trim())
	}
	const cost = operations.find(operation => operation.objectName.endsWith('.cost'))
	assert.deepEqual(cost.args.text.map(run => run.text), ['YEAR-1 TCO', '≤$357k', SEPARATOR, 'vs $420k', 'Locked model · Finance certifies'])
})

test('materialized metric rich runs and slide XML retain the PowerPoint-safe separator', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `metric-separator-${Date.now()}`, clientInfo: { name: 'metric-separator-verifier', version: '1' }, blackBox: true })
	let deckId = null
	try {
		const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: metricSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}))
		deckId = committed.deckId
		const entry = getDeck(deckId)
		const cards = entry.pptx.slides[0]._slideObjects.filter(object => /\.metric-card\./.test(String(object.options?.objectName)))
		assert.equal(cards.length, 4)
		assert.ok(cards.every(card => Array.isArray(card.text) && card.text.some(run => run.text === SEPARATOR)))

		const buffer = await entry.pptx.write({ outputType: 'nodebuffer', compression: false })
		const zip = await JSZip.loadAsync(buffer)
		const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
		assert.equal((slideXml.match(new RegExp(`<a:t>${SEPARATOR}</a:t>`, 'gu')) || []).length, 4)
		assert.equal(slideXml.includes('<a:t> vs $420k</a:t>'), false)
	} finally {
		if (deckId) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
})
