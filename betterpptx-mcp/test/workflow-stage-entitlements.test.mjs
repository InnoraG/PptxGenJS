import assert from 'node:assert/strict'
import test from 'node:test'

process.env.BETTERPPTX_ENV = 'test'
process.env.BETTERPPTX_DEPLOYMENT_STAGE = 'test'
process.env.NODE_ENV = 'test'
process.env.BETTERPPTX_BILLING_MODEL = 'pay_per_job'
process.env.BETTERPPTX_FORCE_PLAN = 'free'
process.env.BETTERPPTX_PREMIUM = '0'

const { createMcpToolDispatcher } = await import('../engine.mjs')

test('auth and billing expose the same explicit workflow-stage boundary', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `stage-boundary-${Date.now()}`, blackBox: true })
	const auth = await mcp.call('betterpptx.auth.status', {})
	const plan = await mcp.call('betterpptx.billing.explain_plan', {})
	assert.equal(auth.ok, true, JSON.stringify(auth.error || auth))
	assert.equal(plan.ok, true, JSON.stringify(plan.error || plan))
	assert.deepEqual(auth.data.workflowStages, plan.data.workflowStages)
	assert.match(auth.data.workflowStages.freePreviewMeaning, /3 genuinely downloadable PPTX publications per rolling 30-day/i)
	const save = auth.data.workflowStages.stages.find(stage => stage.id === 'final-save')
	assert.equal(save.chargeable, 'conditional')
	assert.equal(save.authorization, 'rolling-free-publication-or-fresh-paid-entitlement')
	assert.equal(auth.data.workflowStages.principles.confirmationRequiredIsPermission, false)
})

test('a settled bounded job covers only its final delivery stage', async () => {
	const mcp = createMcpToolDispatcher({
		sessionId: `stage-covered-${Date.now()}`,
		blackBox: true,
		__paidJobAuthorization: { paymentModel: 'one_payment_per_job', settled: true, jobId: 'job_test', quoteId: 'quote_test' },
	})
	const auth = await mcp.call('betterpptx.auth.status', {})
	assert.equal(auth.ok, true, JSON.stringify(auth.error || auth))
	assert.equal(auth.data.workflowStages.currentAuthorization.scope, 'one-settled-job')
	assert.equal(auth.data.workflowStages.stages.find(stage => stage.id === 'final-save').authorization, 'covered-by-current-authorization')
})

test('an environment premium flag is capability coverage, not payment authorization', async () => {
	const previousPlan = process.env.BETTERPPTX_FORCE_PLAN
	const previousModel = process.env.BETTERPPTX_BILLING_MODEL
	process.env.BETTERPPTX_FORCE_PLAN = 'premium'
	process.env.BETTERPPTX_BILLING_MODEL = 'credit_compatibility'
	try {
		const mcp = createMcpToolDispatcher({ sessionId: `stage-env-premium-${Date.now()}`, blackBox: true })
		const auth = await mcp.call('betterpptx.auth.status', {})
		assert.equal(auth.ok, true, JSON.stringify(auth.error || auth))
		assert.equal(auth.data.source, 'environment')
		assert.equal(auth.data.workflowStages.currentAuthorization.status, 'not-covered')
		assert.equal(auth.data.workflowStages.stages.find(stage => stage.id === 'final-save').authorization, 'rolling-free-publication-or-fresh-paid-entitlement')
	} finally {
		process.env.BETTERPPTX_FORCE_PLAN = previousPlan
		process.env.BETTERPPTX_BILLING_MODEL = previousModel
	}
})
