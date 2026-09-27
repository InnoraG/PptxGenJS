import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
const { createMcpToolDispatcher } = await import('../engine.mjs')
const dispatcher = createMcpToolDispatcher({ sessionId: 'quote-stage-learning' })

test('fresh-agent workflow teaches exact commit-stage quotation', async () => {
	const result = await dispatcher.call('betterpptx.help.workflow', { detail: 'summary' })
	assert.equal(result.ok, true)
	const phase = result.data.phases.find(row => row.key === 'spec-compilation')
	assert.ok(phase.tools.includes('betterpptx.billing.estimate'))
	assert.match(phase.exitCriteria.join(' '), /toolArgs\.phase:"commit"/)
	assert.match(phase.exitCriteria.join(' '), /dryRun.*does not authorize commit/)
})

test('spec recipe marks the incomplete estimate as a template and preserves binding', async () => {
	const result = await dispatcher.call('betterpptx.help.tool_recipe', { surface: 'spec', detail: 'summary' })
	assert.equal(result.ok, true)
	const steps = result.data.recipes[0].sequence
	const quote = steps.find(step => step.tool === 'betterpptx.billing.estimate')
	assert.equal(quote.type, 'template')
	assert.equal(quote.request.toolArgs.phase, 'commit')
	assert.ok(quote.missingInputs.some(value => value.includes('spec or specHandle')))
	assert.match(steps.at(-1).when, /full issued quoteBinding/)
})
