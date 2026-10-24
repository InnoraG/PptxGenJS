import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createBillingLedgerStore } from '../billing/ledger-store.mjs'
import { preflightBillingReservation, releaseBillingReservation, finalizeBillingReservation, isBillingReservationEnforced } from '../billing/reservations.mjs'
import { productionBillingConfigurationProblems, assertProductionBillingConfiguration } from '../billing/security-policy.mjs'
import { estimateHeavyCost } from '../billing/estimator.mjs'
import { createBillingDeliveryBarrier, withBillingDeliveryBarrier, currentBillingDeliveryBarrier, awaitBillingDelivery } from '../billing/delivery-barrier.mjs'

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-admission-security-'))
process.env.BETTERPPTX_BILLING_PROVIDER = 'crypto_credits'
process.env.BETTERPPTX_BILLING_ENFORCE = '1'
process.env.BETTERPPTX_BILLING_DRY_RUN = '0'
process.env.BETTERPPTX_BILLING_SHADOW_MODE = '0'
process.env.BETTERPPTX_ENV = 'test'
process.env.BETTERPPTX_DEPLOYMENT_STAGE = 'test'
process.env.NODE_ENV = 'test'
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(root, 'ledger.json')
const store = createBillingLedgerStore()
const customerHash = `install_${'a'.repeat(64)}`
const billingEntitlement = { provider: 'crypto_credits', billingCustomerHash: customerHash, billingStatus: 'active' }
const request = id => ({ name: 'betterpptx.narration.get_voice_timing', args: { script: 'A short test.', idempotencyKey: id }, billingEntitlement, context: { installHash: customerHash, sessionId: 'first-session' }, store })

test.after(async () => { await fs.rm(root, { recursive: true, force: true }) })

test('production cannot disable enforcement or grant an unfunded environment plan', () => {
	const env = { BETTERPPTX_ENV: 'production', BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_FORCE_PLAN: 'premium', BETTERPPTX_BILLING_SHADOW_MODE: '1' }
	const problems = productionBillingConfigurationProblems(env)
	assert.equal(problems.length, 5)
	assert.ok(problems.includes('billing-provider-required'))
	assert.ok(problems.includes('billing-model-explicit-required'))
	assert.throws(() => assertProductionBillingConfiguration(env), { code: 'BILLING_SETUP_INCOMPLETE' })
	process.env.BETTERPPTX_ENV = 'production'
	process.env.BETTERPPTX_BILLING_ENFORCE = '0'
	assert.equal(isBillingReservationEnforced(), true)
	process.env.BETTERPPTX_ENV = 'test'
	process.env.BETTERPPTX_BILLING_ENFORCE = '1'
})

test('production accepts explicit x402 pay-per-job and explicit legacy compatibility profiles', () => {
	const env = {
		BETTERPPTX_ENV: 'production',
		BETTERPPTX_BILLING_PROVIDER: 'crypto_credits',
		BETTERPPTX_BILLING_MODEL: 'pay_per_job',
		BETTERPPTX_BILLING_ENFORCE: '1',
		BETTERPPTX_BILLING_DRY_RUN: '0',
		BETTERPPTX_BILLING_SHADOW_MODE: '0',
	}
	assert.deepEqual(productionBillingConfigurationProblems(env), [])
	assert.doesNotThrow(() => assertProductionBillingConfiguration(env))
	assert.deepEqual(productionBillingConfigurationProblems({ ...env, BETTERPPTX_BILLING_MODEL: 'credit_compatibility' }), [])
	assert.ok(productionBillingConfigurationProblems({ ...env, BETTERPPTX_BILLING_PROVIDER: 'payram' }).includes('x402-billing-provider-required'))
	assert.ok(productionBillingConfigurationProblems({ ...env, BETTERPPTX_BILLING_MODEL: '' }).includes('billing-model-explicit-required'))
})

test('enforced heavy work without a billing identity fails before a reservation', async () => {
	await assert.rejects(preflightBillingReservation({ ...request('missing'), billingEntitlement: null }), { code: 'BILLING_SETUP_INCOMPLETE' })
})

test('fake reuse flags do not make synthesis free; segments are priced', () => {
	const base = estimateHeavyCost('betterpptx.narration.get_voice_timing', { script: 'Test' })
	assert.ok(base > 0)
	for (const key of ['preparedNarration', 'narrationPreparation', 'preparedAudio', 'narrationPreparationReuse']) {
		assert.equal(estimateHeavyCost('betterpptx.narration.get_voice_timing', { script: 'Test', [key]: true }), base)
	}
	assert.ok(estimateHeavyCost('betterpptx.narration.get_voice_timing', { segments: [{ script: 'word '.repeat(1000) }] }) > base)
})

test('zero-cost attachment requires execution-layer proof, not just a handle-shaped argument', async () => {
	const input = { ...request('reuse'), name: 'betterpptx.slide.add_narration', args: { preparedNarration: { manifestHandle: 'not-real' } } }
	await assert.rejects(preflightBillingReservation(input), { code: 'BILLING_SETUP_INCOMPLETE' })
	const validated = await preflightBillingReservation({ ...input, verifyNoChargeReuse: async () => true })
	assert.equal(validated.reason, 'verified-no-charge-reuse')
})

test('active, released and committed reservations never authorize fresh execution, including reconnect', async () => {
	await store.creditCustomer({ customerHash, eventId: 'authorized-test-funding', idempotencyKey: 'authorized-test-funding', amountCredits: 100, source: 'owner_goodwill' })
	for (const state of ['reserved', 'released', 'committed']) {
		const input = request(`replay-${state}`)
		const gate = await preflightBillingReservation(input)
		assert.equal(gate.active, true)
		if (state === 'released') await releaseBillingReservation({ gate, reason: 'test-before-work' })
		if (state === 'committed') await finalizeBillingReservation({ gate, name: input.name, args: input.args, result: { durationMs: 500 } })
		await assert.rejects(preflightBillingReservation({ ...input, context: { ...input.context, sessionId: 'reconnected' } }), error => error.code === 'BILLING_TEMPORARILY_UNAVAILABLE' && error.details.reason === 'reservation-already-used')
	}
})

test('a cached result cannot escape before its billing delivery barrier settles', async () => {
	const barrier = createBillingDeliveryBarrier()
	const record = withBillingDeliveryBarrier(barrier, () => ({ deliveryBarrier: currentBillingDeliveryBarrier() }))
	let delivered = false
	const retry = awaitBillingDelivery(record).then(() => { delivered = true })
	await Promise.resolve()
	assert.equal(delivered, false)
	barrier.resolve()
	await retry
	assert.equal(delivered, true)
	const failed = createBillingDeliveryBarrier()
	failed.reject(Object.assign(new Error('Settlement unavailable'), { code: 'SETTLEMENT_UNAVAILABLE' }))
	await assert.rejects(awaitBillingDelivery({ deliveryBarrier: failed }), { code: 'SETTLEMENT_UNAVAILABLE' })
})
