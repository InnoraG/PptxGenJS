import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-free-value-'))
process.env.BETTERPPTX_INSTALL_USAGE_STORE = 'local'
process.env.BETTERPPTX_INSTALL_USAGE_FILE = path.join(tempRoot, 'usage.json')
process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(tempRoot, 'billing-ledger.json')
process.env.BETTERPPTX_INSTALL_HMAC_SECRET = 'test-install-secret-with-at-least-thirty-two-characters'
process.env.BETTERPPTX_CONNECTOR_CONTINUITY_SECRET = 'test-connector-secret-with-at-least-thirty-two-characters'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_ENV = 'test'
process.env.BETTERPPTX_DEPLOYMENT_STAGE = 'test'
process.env.NODE_ENV = 'test'
process.env.BETTERPPTX_FORCE_PLAN = 'free'
process.env.BETTERPPTX_PREMIUM = '0'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'

const identity = await import('../auth/install-identity.mjs')
const entitlements = await import('../auth/entitlements.mjs')
const { createMcpToolDispatcher } = await import('../engine.mjs')

test.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }))

test('unsigned connector continuity never grants a quota identity even with an HMAC secret', () => {
	const one = identity.connectorIdentityFromHeaders({ 'x-openai-subject': 'subject-a', 'x-openai-session': 'session-1' }, { scope: 'https://betterpptx.example/mcp' })
	const two = identity.connectorIdentityFromHeaders({ 'x-openai-subject': 'subject-a', 'x-openai-session': 'session-2' }, { scope: 'https://betterpptx.example/mcp' })
	assert.ok(one.resourceIdentityHash)
	assert.notEqual(one.resourceIdentityHash, two.resourceIdentityHash)
	assert.equal(one.quotaIdentityHash, undefined)
	assert.equal(two.quotaIdentityHash, undefined)
	const sessionOnly = identity.connectorIdentityFromHeaders({ 'x-openai-session': 'session-only' }, { scope: 'https://betterpptx.example/mcp' })
	assert.equal(sessionOnly.quotaIdentityHash, undefined)
})

test('rolling publication reservations are atomic, replay-safe, and release failed work', async () => {
	const store = identity.createInstallUsageStore()
	const common = { category: 'deck-publication', limit: 3, windowMs: 30 * 86400000, leaseMs: 60000 }
	const results = await Promise.all([1, 2, 3, 4].map(index => store.reserveRollingUsage('install-test', { ...common, reservationId: `save-${index}` })))
	assert.equal(results.filter(result => result.ok).length, 3)
	assert.equal(results.filter(result => !result.ok && result.code === 'ROLLING_QUOTA_EXHAUSTED').length, 1)
	const first = await store.commitRollingUsage('install-test', { ...common, reservationId: 'save-1' })
	const replay = await store.commitRollingUsage('install-test', { ...common, reservationId: 'save-1' })
	assert.equal(first.used, 1)
	assert.equal(replay.used, 1)
	await store.releaseRollingUsage('install-test', { ...common, reservationId: 'save-2' })
	const replacement = await store.reserveRollingUsage('install-test', { ...common, reservationId: 'save-5' })
	assert.equal(replacement.ok, true)
})

test('free authoring is complete while scarce identity media uses a bounded route', async () => {
	assert.equal(entitlements.requireEntitlement('betterpptx.slide.animate_shapes', { slideIndex: 12 }, { sessionId: 'free' }), null)
	assert.equal(entitlements.requireEntitlement('betterpptx.slide.set_transition', { slideIndex: 1, transition: { type: 'fade' } }, { sessionId: 'free' }), null)
	const singleView = entitlements.requireEntitlement('betterpptx.assets.generate_rigged3d', { experimentalConfirmed: true, imageHandles: ['asset://one'] }, { sessionId: 'free' })
	assert.equal(singleView.error.code, 'REQUIRES_PAID_ENTITLEMENT')
	assert.equal(entitlements.requireEntitlement('betterpptx.assets.generate_rigged3d', { experimentalConfirmed: true, imageHandles: ['asset://front', 'asset://side'] }, { sessionId: 'free' }), null)
})

test('free publication, narration, and identity-media categories do not consume one another', async () => {
	const context = { installHash: 'install-policy-test', sessionId: 'policy-test' }
	const save = await entitlements.reserveFreeValue('betterpptx.deck.save', { idempotencyKey: 'deck-a' }, context)
	const narration = await entitlements.reserveFreeValue('betterpptx.narration.synthesize', { idempotencyKey: 'narration-a', segments: [{ script: 'Measured narration.' }] }, context)
	const avatar = await entitlements.reserveFreeValue('betterpptx.avatar.render_job', { idempotencyKey: 'avatar-a' }, context)
	const persona = await entitlements.reserveFreeValue('betterpptx.assets.generate_rigged3d', { idempotencyKey: 'persona-a', imageHandles: ['asset://front', 'asset://side'] }, context)
	assert.equal(save.request.category, 'deck-publication')
	assert.equal(narration.request.category, 'narration-preparation')
	assert.equal(avatar.request.category, 'talking-head-generation')
	assert.equal(persona.request.category, 'rigged3d-persona-generation')
	await Promise.all([
		entitlements.releaseFreeValue(save),
		entitlements.releaseFreeValue(narration),
		entitlements.releaseFreeValue(avatar),
		entitlements.releaseFreeValue(persona),
	])
})

test('secured free narration estimate is zero-charge and does not reserve an allowance', async () => {
	const installHash = `install_${'b'.repeat(64)}`
	const mcp = createMcpToolDispatcher({ installHash, resourceIdentityHash: installHash, authenticated: true, authenticationBasis: 'oauth-access-token', sessionId: 'sponsored-narration-estimate', blackBox: true })
	const before = await mcp.call('betterpptx.auth.status', {})
	const estimate = await mcp.call('betterpptx.billing.estimate', {
		toolName: 'betterpptx.narration.synthesize',
		toolArgs: {
			voice: 'en_US-ljspeech-high',
			segments: [{ script: 'A bounded sponsored narration preparation.' }],
			idempotencyKey: 'narration-estimate-only',
		},
	})
	const after = await mcp.call('betterpptx.auth.status', {})
	assert.equal(before.ok, true, JSON.stringify(before.error || before))
	assert.equal(estimate.ok, true, JSON.stringify(estimate.error || estimate))
	assert.equal(after.ok, true, JSON.stringify(after.error || after))
	assert.equal(before.data.authenticated, true)
	assert.equal(before.data.source, 'verified-account-free')
	assert.equal(estimate.data.freeAllowance.eligible, true)
	assert.equal(estimate.data.freeAllowance.category, 'narration-preparation')
	assert.equal(estimate.data.estimatedCredits, 0)
	assert.equal(estimate.data.priceUsdc, 0)
	assert.equal(estimate.data.billingRequired, false)
	assert.equal(estimate.data.customerChargeClassification, 'sponsored-narration-preparation')
	assert.ok(Number(estimate.data.unsubsidizedEstimate.estimatedCredits) > 0)
	assert.equal(after.data.freeAllowances.narrationPreparations.used, before.data.freeAllowances.narrationPreparations.used)
	assert.equal(after.data.freeAllowances.narrationPreparations.reserved, before.data.freeAllowances.narrationPreparations.reserved)
	assert.equal(after.data.freeAllowances.narrationPreparations.remaining, before.data.freeAllowances.narrationPreparations.remaining)
})

test('spec publication estimates share the save allowance without becoming an execution reservation route', async () => {
	const context = { installHash: 'install-spec-estimate-policy', sessionId: 'spec-estimate-policy' }
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Sponsored estimate classification',
		authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete' },
		slides: [{
			id: 'opening',
			title: 'Opening',
			content: [{ kind: 'textBox', name: 'headline', text: 'Exact authored geometry', rect: { x: 1, y: 1, w: 6, h: 1 } }],
		}],
	}
	const saveStatus = await entitlements.getFreeValueStatus('betterpptx.deck.save', {}, context)
	const estimateStatus = await entitlements.getFreeValueStatus('betterpptx.deck.generate_from_spec', { spec }, context, { purpose: 'estimate' })
	assert.equal(saveStatus.eligible, true)
	assert.equal(estimateStatus.eligible, true)
	assert.equal(estimateStatus.category, 'deck-publication')
	assert.equal(estimateStatus.remaining, saveStatus.remaining)
	assert.deepEqual(estimateStatus.route, {
		workflowStage: 'final-save',
		accountingTool: 'betterpptx.deck.save',
		reservationTiming: 'on-successful-save',
		classificationBasis: 'compiled-spec-plus-final-save-quote',
	})
	const executionStatus = await entitlements.getFreeValueStatus('betterpptx.deck.generate_from_spec', { spec }, context)
	assert.equal(executionStatus.eligible, false)
	assert.equal(executionStatus.reason, 'not-a-sponsored-value-route')
})

test('billing estimate reports the same sponsored publication allowance as auth without consuming it', async () => {
	const installHash = `install_${'a'.repeat(64)}`
	const mcp = createMcpToolDispatcher({ installHash, authenticated: true, authenticationBasis: 'oauth-access-token', sessionId: 'sponsored-estimate-regression', blackBox: true })
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Eligible minimal deck',
		authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete' },
		slides: [{
			id: 'opening',
			title: 'Opening',
			content: [{ kind: 'textBox', name: 'headline', text: 'Eligible minimal deck', rect: { x: 1, y: 1, w: 6, h: 1 } }],
		}],
	}
	const before = await mcp.call('betterpptx.auth.status', {})
	const estimate = await mcp.call('betterpptx.billing.estimate', {
		toolName: 'betterpptx.deck.generate_from_spec',
		toolArgs: { spec, plan: 'premium' },
	})
	const after = await mcp.call('betterpptx.auth.status', {})
	assert.equal(before.ok, true, JSON.stringify(before.error || before))
	assert.equal(estimate.ok, true, JSON.stringify(estimate.error || estimate))
	assert.equal(after.ok, true, JSON.stringify(after.error || after))
	assert.equal(estimate.data.freeAllowance.eligible, true)
	assert.equal(estimate.data.freeAllowance.reason, 'bounded-free-allowance-available')
	assert.equal(estimate.data.freeAllowance.category, 'deck-publication')
	assert.equal(estimate.data.freeAllowance.route.accountingTool, 'betterpptx.deck.save')
	assert.equal(estimate.data.estimatedCredits, 0)
	assert.equal(estimate.data.quoteCapCredits, 0)
	assert.equal(estimate.data.priceUsdc, 0)
	assert.equal(estimate.data.amountAtomic, '0')
	assert.equal(estimate.data.finalSaveEstimatedCredits, 0)
	assert.equal(estimate.data.metrics.finalSaveEstimatedCredits, 0)
	assert.equal(estimate.data.metrics.specEstimatedCredits, 0)
	assert.equal(estimate.data.estimate.estimatedCredits, 0)
	assert.equal(estimate.data.estimate.quoteCapCredits, 0)
	assert.equal(estimate.data.estimate.priceUsdc, 0)
	assert.equal(estimate.data.estimate.amountAtomic, '0')
	assert.equal(estimate.data.estimate.metrics.finalSaveEstimatedCredits, 0)
	assert.equal(estimate.data.estimate.metrics.specEstimatedCredits, 0)
	assert.equal(estimate.data.customerChargeClassification, 'sponsored-publication')
	assert.ok(Number(estimate.data.unsubsidizedEstimate.estimatedCredits) > 0)
	assert.ok(Number(estimate.data.unsubsidizedEstimate.priceUsdc) > 0)
	assert.equal(estimate.data.billingRequired, false)
	assert.ok(estimate.data.quoteBinding, 'the exact spec/plan integrity binding remains available on a sponsored quote')
	assert.equal(before.data.identityAssurance.secured, true)
	assert.equal(before.data.identityAssurance.freeValueQuotaEligible, true)
	assert.equal(before.data.identityAssurance.opaque, true)
	assert.equal(after.data.freeAllowances.deckPublications.used, before.data.freeAllowances.deckPublications.used)
	assert.equal(after.data.freeAllowances.deckPublications.reserved, before.data.freeAllowances.deckPublications.reserved)
	assert.equal(after.data.freeAllowances.deckPublications.remaining, before.data.freeAllowances.deckPublications.remaining)
})
