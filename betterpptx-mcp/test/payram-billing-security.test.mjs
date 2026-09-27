import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { MemoryFirestore } from './payram-billing-security-fixtures.mjs'

// Discard inherited configuration before importing billing code. No real keys,
// provider, shared database, server, or deployment is used by this suite.
const temporaryRoot = path.resolve(os.tmpdir())
const testContext = process.env.NODE_TEST_CONTEXT
process.env = {
	...(testContext ? { NODE_TEST_CONTEXT: testContext } : {}),
	NODE_ENV: 'test',
	BETTERPPTX_BILLING_MODEL: 'credit_compatibility',
	BETTERPPTX_BILLING_HASH_SALT: 'security-fixture-hash-salt',
	BETTERPPTX_PAYMENT_ENVELOPE_SECRET: 'security-fixture-envelope-0000000000000000',
	BETTERPPTX_PAYRAM_ENABLED: '1',
	BETTERPPTX_PAYRAM_BASE_URL: 'https://payram.example.test',
	BETTERPPTX_PAYRAM_API_KEY: 'security-fixture-api-0000000000000000',
	BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN: 'security-fixture-hook-0000000000000000',
	BETTERPPTX_PAYMENT_INTENT_STORE: 'local',
	BETTERPPTX_BILLING_LEDGER_STORE: 'local',
	BETTERPPTX_REQUIRE_SHARED_STORES: '0',
}
globalThis.fetch = async () => { throw new Error('External network is forbidden in this suite') }

const { registerPayRamRoutes } = await import('../billing/payram-routes.mjs')
const { createPaymentIntentStore } = await import('../billing/payment-intents.mjs')
const { createBillingLedgerStore } = await import('../billing/ledger-store.mjs')
const { createPayramPayment, getPayramPaymentStatus } = await import('../billing/payram-client.mjs')
const { redeemPromoTopup, evaluatePromoCode, createPromoRedemptionStore, reservePromoCode, promoReadiness } = await import('../billing/promo-codes.mjs')
const { mintPaymentEnvelope } = await import('../billing/payment-envelope.mjs')

const json = data => ({ ok: true, status: 200, text: async () => JSON.stringify(data) })
const input = (intentId, extra = {}) => ({
	intentId, customerHash: 'buyer', productId: 'betterpptx', purpose: 'credit_topup',
	provider: 'payram', rail: 'payram_card_onramp', packId: 'starter_500',
	requestedCredits: 500, requestedAmountUsd: 5, requestedAmountUsdc: 5, minimumCreditableUsd: 5,
	...extra,
})
const paid = (ref, extra = {}) => ({ referenceID: ref, customerID: 'betterpptx:buyer', amountInUSD: '5', paymentState: 'FILLED', ...extra })
const payment = ref => ({ reference_id: ref, url: `https://payram.example.test/payments?reference_id=${ref}` })

function fixture(t, fetchFn = async () => { throw new Error('Unexpected provider request') }) {
	const root = fs.mkdtempSync(path.join(temporaryRoot, 'payram-security-'))
	process.env.BETTERPPTX_PAYMENT_INTENT_FILE = path.join(root, 'intents.json')
	process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(root, 'ledger.json')
	process.env.BETTERPPTX_PROMO_STORE_FILE = path.join(root, 'promos.json')
	process.env.BETTERPPTX_PROMO_CODES_JSON = JSON.stringify([
		{ code: 'FREE500', free: true, packId: 'starter_500', maxRedemptions: 2 },
		{ code: 'HALF500', percentOff: 50, packId: 'starter_500', maxRedemptions: 5 },
	])
	t.after(() => {
		assert.equal(path.dirname(root), temporaryRoot)
		assert.ok(path.basename(root).startsWith('payram-security-'))
		fs.rmSync(root, { recursive: true, force: true })
	})
	const store = createPaymentIntentStore()
	const ledger = createBillingLedgerStore()
	const handlers = new Map()
	const app = Object.fromEntries(['get', 'post'].map(method => [method, (route, fn) => handlers.set(`${method}:${route}`, fn)]))
	registerPayRamRoutes(app, { store, ledger, fetchFn, requestInstallIdentity: req => {
		if (!req.headers['x-fixture-owner']) throw Object.assign(new Error('Identity required'), { code: 'INSTALL_IDENTITY_MISSING' })
		return { installHash: req.headers['x-fixture-owner'] }
	} })
	async function request(method, route, { owner = 'buyer', headers = {}, body = {}, query = {}, intentId = '' } = {}) {
		const res = {
			statusCode: 200, headers: {},
			setHeader(k, v) { this.headers[k] = v },
			status(n) { this.statusCode = n; return this },
			json(value) { this.body = value; return this },
			type(value) { this.contentType = value; return this },
			send(value) { this.body = value; return this },
			redirect(n, value) { this.statusCode = n; this.location = value; return this },
		}
		await handlers.get(`${method}:${route}`)({ method: method.toUpperCase(), headers: { ...(owner ? { 'x-fixture-owner': owner } : {}), ...headers }, body, query, params: { intentId } }, res)
		return res
	}
	return { root, store, ledger, request }
}

function sharedIntents(db) {
	process.env.BETTERPPTX_PAYMENT_INTENT_STORE = 'firestore'
	try { return createPaymentIntentStore({ firestoreDb: db }) }
	finally { process.env.BETTERPPTX_PAYMENT_INTENT_STORE = 'local' }
}

test('start, status and return require the owning customer before revealing or refreshing an intent', async t => {
	let calls = 0
	const f = fixture(t, async () => { calls++; return json(paid('ref-owner')) })
	await f.store.createIntent(input('pi_owner', { providerReferenceId: 'ref-owner', metadata: { payramPaymentUrl: payment('ref-owner').url } }))
	for (const [route, query] of [
		['/pay/payram/intents/:intentId/start', {}],
		['/pay/payram/intents/:intentId/status', {}],
		['/pay/payram/return', { reference_id: 'ref-owner' }],
	]) {
		const result = await f.request('get', route, { owner: 'attacker', intentId: 'pi_owner', query })
		assert.equal(result.statusCode, 404, route)
		assert.equal(result.body?.intent, undefined)
	}
	assert.equal(calls, 0)
})

test('payment envelope pack and intent scope cannot be widened by body or return query', async t => {
	const f = fixture(t, async () => json(payment('ref-scope')))
	const token = mintPaymentEnvelope({ installHash: 'buyer', packId: 'starter_500' })
	const result = await f.request('post', '/pay/payram/intents', { body: { token, packId: 'studio_5000', customerEmail: 'buyer@example.test' } })
	assert.equal(result.statusCode, 403)
	await f.store.createIntent(input('pi_scope', { providerReferenceId: 'ref-scope' }))
	const returned = await f.request('get', '/pay/payram/return', { query: { intentId: 'pi_scope', reference_id: 'other-ref' } })
	assert.equal(returned.statusCode, 404)
})

test('provider status rejects mismatched, missing and malformed evidence', async () => {
	for (const body of [
		paid('other-ref'), paid('ref', { customerID: 'betterxlsx:buyer' }),
		paid('ref', { customerID: 'betterpptx:other' }), paid('ref', { amountInUSD: 0.01 }),
		paid('ref', { customerID: undefined }), paid('ref', { amountInUSD: undefined }),
		paid('ref', { filled_amount_in_usd: 0.01 }), paid('ref', { amountInUSD: true }), paid('ref', { amountInUSD: '0x5' }),
		paid('ref', { reference_id: 'conflicting-ref' }), null, [],
	]) {
		await assert.rejects(getPayramPaymentStatus('ref', {
			expectedCustomerId: 'betterpptx:buyer', expectedAmountUsd: 5, fetchFn: async () => json(body),
		}), { name: 'PayRamClientError' })
	}
	const valid = await getPayramPaymentStatus('ref', { expectedCustomerId: 'betterpptx:buyer', expectedAmountUsd: 5, fetchFn: async () => json(paid('ref', { fee_in_usd: 1, net_amount_in_usd: 4 })) })
	assert.equal(valid.creditable, true, 'provider fees do not reduce the purchased fixed credit pack')
})

test('provider checkout URLs and credential-bearing HTTP redirects are validated', async () => {
	for (const url of ['javascript:alert(1)', 'https://attacker.example.test/pay', 'https://user:pass@payram.example.test/pay', 'https://payram.example.test/payments?reference_id=other']) {
		await assert.rejects(createPayramPayment({ customerEmail: 'buyer@example.test', customerId: 'betterpptx:buyer', amountUsd: 5 }, { fetchFn: async () => json({ ...payment('ref'), url }) }), { name: 'PayRamClientError' })
	}
	await createPayramPayment({ customerEmail: 'buyer@example.test', customerId: 'betterpptx:buyer', amountUsd: 5 }, { fetchFn: async (_url, options) => {
		assert.equal(options.redirect, 'error')
		return json(payment('ref'))
	} })
})

test('intent reuse binds product, reference, customer and economics; reference updates cannot steal ownership', async t => {
	const { store } = fixture(t)
	await store.createIntent(input('pi_a', { providerReferenceId: 'ref-a' }))
	await assert.rejects(store.createIntent(input('pi_a', { providerReferenceId: 'ref-a', productId: 'betterxlsx' })))
	await assert.rejects(store.createIntent(input('pi_b', { providerReferenceId: 'ref-a', customerHash: 'attacker' })))
	await store.createIntent(input('pi_b', { customerHash: 'attacker' }))
	await assert.rejects(store.updateIntent('pi_b', { providerReferenceId: 'ref-a' }))
	await assert.rejects(store.updateIntent('pi_a', { requestedCredits: 50000 }))
	assert.equal((await store.getIntentByProviderReference('payram', 'ref-a')).intentId, 'pi_a')
})

test('concurrent standard checkout creates a single provider payment', async t => {
	let creates = 0
	const f = fixture(t, async () => {
		creates++
		await new Promise(resolve => setImmediate(resolve))
		return json(payment(`ref-${creates}`))
	})
	const results = await Promise.all(Array.from({ length: 12 }, () => f.request('post', '/pay/payram/intents', { body: { packId: 'starter_500', customerEmail: 'buyer@example.test' } })))
	assert.equal(creates, 1)
	assert.ok(results.every(result => result.statusCode >= 200 && result.statusCode < 300))
	assert.equal(new Set(results.map(result => result.body.intent.intentId)).size, 1)
})

test('promo checkout reuse cannot disclose a foreign customer intent', async t => {
	const f = fixture(t)
	await f.store.createIntent(input('pi_victim', { customerHash: 'victim', providerReferenceId: 'victim-ref', metadata: { payramPaymentUrl: payment('victim-ref').url } }))
	await assert.rejects(redeemPromoTopup({ code: 'HALF500', packId: 'starter_500', customerHash: 'attacker', customerEmail: 'attacker@example.test', intentId: 'pi_victim', ledger: f.ledger, paymentIntents: f.store }))
})

test('concurrent discounted promo creates one checkout and an ambiguous provider failure retains its reservation', async t => {
	let calls = 0
	const f = fixture(t)
	const options = { code: 'HALF500', packId: 'starter_500', customerHash: 'buyer', customerEmail: 'buyer@example.test', ledger: f.ledger, paymentIntents: f.store, payramFetch: async () => {
		calls++
		await new Promise(resolve => setImmediate(resolve))
		return json(payment(`promo-ref-${calls}`))
	} }
	await Promise.all(Array.from({ length: 10 }, () => redeemPromoTopup(options)))
	assert.equal(calls, 1)
	await assert.rejects(redeemPromoTopup({ ...options, customerHash: 'other', payramFetch: async () => { throw new Error('Connection lost after provider accepted request') } }))
	const data = JSON.parse(fs.readFileSync(path.join(f.root, 'promos.json'), 'utf8'))
	assert.equal(Object.values(data.redemptions).find(row => row.customerHash === 'other').state, 'reserved')
})

test('production blocks anonymous promo farming and supports explicit bounded issuance', async t => {
	fixture(t)
	const env = { ...process.env, NODE_ENV: 'production' }
	assert.throws(() => evaluatePromoCode({ code: 'FREE500', packId: 'starter_500', customerHash: 'fresh-install', env }), { code: 'PROMO_ISSUANCE_SCOPE_REQUIRED' })
	env.BETTERPPTX_PROMO_CODES_JSON = JSON.stringify([{ code: 'ISSUED500', free: true, packId: 'starter_500', customerHashes: ['issued-install'], maxRedemptions: 1 }])
	assert.equal(evaluatePromoCode({ code: 'ISSUED500', packId: 'starter_500', customerHash: 'issued-install', env }).requestedCredits, 500)
	assert.throws(() => evaluatePromoCode({ code: 'ISSUED500', packId: 'starter_500', customerHash: 'fresh-install', env }), { code: 'PROMO_CODE_NOT_ELIGIBLE' })
})

test('webhook authentication and authentic status recheck prevent claimed-paid credit; changing observations remain idempotent', async t => {
	let status = paid('ref-hook', { paymentState: 'OPEN' })
	const f = fixture(t, async () => json(status))
	await f.store.createIntent(input('pi_hook', { providerReferenceId: 'ref-hook' }))
	const route = '/internal/payments/payram/webhook'
	const body = { reference_id: 'ref-hook', paymentState: 'FILLED' }
	assert.equal((await f.request('post', route, { body })).statusCode, 401)
	const headers = { 'api-key': 'security-fixture-api-0000000000000000' }
	assert.equal((await f.request('post', route, { body, headers })).body.credited, false)
	status = paid('ref-hook')
	assert.equal((await f.request('post', route, { body, headers })).body.credited, true)
	status = paid('ref-hook', { paymentState: 'OVER_FILLED', filled_amount_in_usd: 6, updatedAt: 'later-observation' })
	const replay = await f.request('post', route, { body, headers })
	assert.equal(replay.statusCode, 200)
	assert.equal(replay.body.intent.state, 'credited')
	assert.equal((await f.ledger.getCustomer('buyer')).availableBalanceCredits, 500)
})

test('corrupt local stores fail closed instead of discarding replay and quota history', async t => {
	const f = fixture(t)
	fs.writeFileSync(path.join(f.root, 'intents.json'), '{invalid')
	await assert.rejects(f.store.createIntent(input('pi_corrupt')))
	fs.writeFileSync(path.join(f.root, 'promos.json'), '{invalid')
	await assert.rejects(createPromoRedemptionStore().get('promo_any'))
})

test('shared transactions serialize checkout and reference ownership across independent store instances and retries', async t => {
	fixture(t)
	const db = new MemoryFirestore()
	db.retryCallbacks = true
	const stores = [sharedIntents(db), sharedIntents(db)]
	const result = await Promise.all(Array.from({ length: 20 }, (_, i) => stores[i % 2].createIntent(input(undefined, { reuseOpenKey: 'same-purchase', state: 'provider_pending' }))))
	assert.equal(result.filter(row => !row.idempotent).length, 1)
	assert.equal(new Set(result.map(row => row.intent.intentId)).size, 1)
	await stores[0].createIntent(input('pi_other', { customerHash: 'other' }))
	const races = await Promise.allSettled([
		stores[0].updateIntent(result[0].intent.intentId, { providerReferenceId: 'ref-shared' }),
		stores[1].updateIntent('pi_other', { providerReferenceId: 'ref-shared' }),
	])
	assert.equal(races.filter(row => row.status === 'fulfilled').length, 1)
	assert.equal((await stores[0].getIntentByProviderReference('payram', 'ref-shared')).intentId, result[0].intent.intentId)
	await stores[0].createIntent(input('pi_slash', { providerReferenceId: 'ref/a' }))
	await stores[0].createIntent(input('pi_underscore', { providerReferenceId: 'ref_a' }))
	assert.equal((await stores[0].getIntentByProviderReference('payram', 'ref/a')).intentId, 'pi_slash')
	assert.equal((await stores[0].getIntentByProviderReference('payram', 'ref_a')).intentId, 'pi_underscore')
})

test('shared promo quotas count above one correctly under concurrent distinct requests and transaction retries', async t => {
	fixture(t)
	const db = new MemoryFirestore()
	db.retryCallbacks = true
	const env = { ...process.env, NODE_ENV: 'production', BETTERPPTX_BILLING_LEDGER_STORE: 'firestore', BETTERPPTX_REQUIRE_SHARED_STORES: '1',
		BETTERPPTX_PROMO_CODES_JSON: JSON.stringify([{ code: 'THREE500', free: true, maxPerCustomer: 3, maxRedemptions: 4, customerHashes: ['buyer', 'other'] }]) }
	const stores = [createPromoRedemptionStore({ env, firestoreDb: db }), createPromoRedemptionStore({ env, firestoreDb: db })]
	const attempts = await Promise.allSettled(Array.from({ length: 16 }, (_, i) => reservePromoCode({ code: 'THREE500', packId: 'starter_500', customerHash: 'buyer', idempotencyKey: `try-${i}`, env, store: stores[i % 2] })))
	assert.equal(attempts.filter(row => row.status === 'fulfilled').length, 3)
	assert.ok(attempts.filter(row => row.status === 'rejected').every(row => row.reason.code === 'PROMO_CODE_ALREADY_REDEEMED'))
	const other = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => reservePromoCode({ code: 'THREE500', packId: 'starter_500', customerHash: 'other', idempotencyKey: `try-${i}`, env, store: stores[i % 2] })))
	assert.equal(other.filter(row => row.status === 'fulfilled').length, 1)
})

test('local and shared stores reject foreign provider events, credit replay with new ids and terminal state regression', async t => {
	const f = fixture(t)
	for (const store of [f.store, sharedIntents(new MemoryFirestore())]) {
		await store.createIntent(input('pi_credit', { providerReferenceId: 'ref-credit' }))
		await assert.rejects(store.recordProviderEvent({ intentId: 'pi_credit', eventId: 'event-foreign', provider: 'x402', state: 'paid' }))
		await assert.rejects(store.recordProviderEvent({ intentId: 'pi_credit', eventId: 'event-foreign-ref', providerReferenceId: 'other-ref', state: 'paid' }))
		const credit = { intentId: 'pi_credit', creditEventId: 'credit-one', amountCredits: 500, proofRef: { provider: 'payram', referenceId: 'ref-credit' } }
		await assert.rejects(store.creditIntent({ ...credit, customerHash: 'other' }))
		await store.creditIntent(credit)
		await assert.rejects(store.creditIntent({ ...credit, creditEventId: 'credit-two' }), { code: 'PAYMENT_INTENT_OVERCREDIT' })
		await store.recordProviderEvent({ intentId: 'pi_credit', eventId: 'event-delayed', providerStatus: 'OPEN', state: 'open' })
		await store.updateIntent('pi_credit', { state: 'verification_pending' })
		assert.equal((await store.getIntent('pi_credit')).state, 'credited')
	}
})

test('free promo replays and competing keys grant once, and changed promo economics cannot reuse a reservation', async t => {
	const f = fixture(t)
	const options = { code: 'FREE500', packId: 'starter_500', customerHash: 'buyer', ledger: f.ledger }
	await Promise.all(Array.from({ length: 16 }, () => redeemPromoTopup(options)))
	assert.equal((await f.ledger.getCustomer('buyer')).availableBalanceCredits, 500)
	await assert.rejects(redeemPromoTopup({ ...options, idempotencyKey: 'new-key' }), { code: 'PROMO_CODE_ALREADY_REDEEMED' })
	process.env.BETTERPPTX_PROMO_CODES_JSON = JSON.stringify([{ code: 'FREE500', free: true, bonusCredits: 100, packId: 'starter_500', maxRedemptions: 2 }])
	await assert.rejects(redeemPromoTopup(options), { code: 'PROMO_REDEMPTION_CONFLICT' })
	assert.equal((await f.ledger.getCustomer('buyer')).availableBalanceCredits, 500)
})

test('promo completion and release races never free consumed quota or revive a released checkout', async t => {
	fixture(t)
	const db = new MemoryFirestore()
	const stores = [createPromoRedemptionStore(), createPromoRedemptionStore({ env: { ...process.env, BETTERPPTX_BILLING_LEDGER_STORE: 'firestore' }, firestoreDb: db })]
	for (const store of stores) {
		const reservation = await reservePromoCode({ code: 'HALF500', packId: 'starter_500', customerHash: 'buyer', intentId: 'pi_reserved', store })
		const id = reservation.redemption.redemptionId
		await store.complete(id, { intentId: 'pi_reserved', creditEventId: 'credit-reserved' })
		await store.release(id)
		assert.equal((await store.get(id)).state, 'completed')
		await assert.rejects(store.complete(id, { intentId: 'pi_foreign' }), { code: 'PROMO_REDEMPTION_CONFLICT' })
		const released = await reservePromoCode({ code: 'HALF500', packId: 'starter_500', customerHash: 'other', intentId: 'pi_released', store })
		await store.release(released.redemption.redemptionId)
		await assert.rejects(store.complete(released.redemption.redemptionId, { intentId: 'pi_released' }), { code: 'PROMO_REDEMPTION_RELEASED' })
		await assert.rejects(reservePromoCode({ code: 'HALF500', packId: 'starter_500', customerHash: 'other', intentId: 'pi_released', store }), { code: 'PROMO_REDEMPTION_RELEASED' })
	}
})

for (const failure of ['before-ledger', 'after-ledger', 'before-intent-credit']) {
	test(`settlement recovers ${failure} failure with exactly one durable grant`, async t => {
		const f = fixture(t, async () => json(paid('ref-recover')))
		await f.store.createIntent(input('pi_recover', { providerReferenceId: 'ref-recover' }))
		const originalLedgerCredit = f.ledger.creditCustomer
		const originalIntentCredit = f.store.creditIntent
		let failed = false
		f.ledger.creditCustomer = async data => {
			if (!failed && failure === 'before-ledger') { failed = true; throw new Error('injected ledger failure') }
			const result = await originalLedgerCredit(data)
			if (!failed && failure === 'after-ledger') { failed = true; throw new Error('injected lost ledger response') }
			return result
		}
		f.store.creditIntent = async data => {
			if (!failed && failure === 'before-intent-credit') { failed = true; throw new Error('injected intent failure') }
			return originalIntentCredit(data)
		}
		const options = { intentId: 'pi_recover' }
		assert.equal((await f.request('get', '/pay/payram/intents/:intentId/status', options)).statusCode, 500)
		assert.notEqual((await f.store.getIntent('pi_recover')).state, 'credited')
		const retry = await f.request('get', '/pay/payram/intents/:intentId/status', options)
		assert.equal(retry.statusCode, 200)
		assert.equal(retry.body.intent.state, 'credited')
		assert.equal((await f.ledger.getCustomer('buyer')).availableBalanceCredits, 500)
	})
}

test('historical credit proof is reused to recover a prior intent-first ledger failure', async t => {
	const f = fixture(t, async () => json(paid('ref-legacy', { paymentState: 'OVER_FILLED' })))
	await f.store.createIntent(input('pi_legacy', { providerReferenceId: 'ref-legacy' }))
	const creditEventId = `credit_payram_${crypto.createHash('sha256').update('ref-legacy').digest('hex').slice(0, 32)}`
	const proofRef = { provider: 'payram', referenceId: 'ref-legacy', providerStatus: 'FILLED', rawStatusHash: 'legacy-observation' }
	await f.store.creditIntent({ intentId: 'pi_legacy', creditEventId, amountCredits: 500, proofRef })
	const result = await f.request('get', '/pay/payram/intents/:intentId/status', { intentId: 'pi_legacy' })
	assert.equal(result.statusCode, 200)
	assert.equal((await f.ledger.getCustomer('buyer')).availableBalanceCredits, 500)
	assert.deepEqual((await f.store.getCreditEvent(creditEventId)).proofRef, proofRef)
})

test('authorized checkout links work without device headers and cannot open a different intent', async t => {
	const f = fixture(t, async () => json(payment('ref-browser')))
	const created = await f.request('post', '/pay/payram/intents', { body: { packId: 'starter_500', customerEmail: 'buyer@example.test' } })
	const query = Object.fromEntries(new URL(created.body.startUrl, 'https://example.test').searchParams)
	const options = { owner: '', query, intentId: created.body.intent.intentId }
	const start = await f.request('get', '/pay/payram/intents/:intentId/start', options)
	assert.equal(start.statusCode, 303)
	assert.equal(start.headers['Referrer-Policy'], 'no-referrer')
	await f.store.createIntent(input('pi_other_browser', { providerReferenceId: 'other-browser-ref' }))
	assert.equal((await f.request('get', '/pay/payram/intents/:intentId/status', { ...options, intentId: 'pi_other_browser' })).statusCode, 404)
	const expired = mintPaymentEnvelope({ installHash: 'buyer', packId: 'starter_500', nowMs: Date.now() - 3600000 })
	assert.equal((await f.request('get', '/pay/payram/intents/:intentId/start', { ...options, query: { token: expired } })).statusCode, 401)
})

test('production promo rejection happens before provider or ledger side effects and readiness reports it', async t => {
	const f = fixture(t)
	const env = { ...process.env, NODE_ENV: 'production', BETTERPPTX_BILLING_PROVIDER: 'payram', BETTERPPTX_BILLING_MODEL: 'credit_compatibility', BETTERPPTX_BILLING_ENFORCE: '1' }
	assert.equal(promoReadiness({ env }).configured, false)
	await assert.rejects(redeemPromoTopup({ code: 'FREE500', packId: 'starter_500', customerHash: 'new-install', env, ledger: f.ledger, paymentIntents: f.store }), { code: 'PROMO_ISSUANCE_SCOPE_REQUIRED' })
	assert.equal(fs.existsSync(path.join(f.root, 'ledger.json')), false)
	assert.equal(fs.existsSync(path.join(f.root, 'promos.json')), false)
})

for (const productionFlag of ['NODE_ENV', 'BETTERPPTX_ENV', 'BETTERPPTX_DEPLOYMENT_STAGE']) {
	test(`${productionFlag} blocks unsafe checkout creation and start but preserves authenticated paid reconciliation`, async t => {
		let creates = 0
		let reads = 0
		const f = fixture(t, async (url, options) => {
			if (options.method === 'POST') { creates++; return json(payment('ref-config')) }
			reads++
			return json(paid(url.endsWith('ref-reconcile') ? 'ref-reconcile' : 'ref-config'))
		})
		const created = await f.request('post', '/pay/payram/intents', { body: { packId: 'starter_500', customerEmail: 'buyer@example.test' } })
		assert.equal(created.statusCode, 201)
		const intentId = created.body.intent.intentId
		const continuation = Object.fromEntries(new URL(created.body.startUrl, 'https://example.test').searchParams)
		await f.store.createIntent(input('pi_reconcile', { providerReferenceId: 'ref-reconcile', state: 'awaiting_customer_completion' }))
		const oldEnv = { ...process.env }
		t.after(() => { process.env = oldEnv })
		process.env[productionFlag] = 'production'
		const good = { ...process.env, BETTERPPTX_BILLING_PROVIDER: 'crypto_credits', BETTERPPTX_BILLING_MODEL: 'pay_per_job', BETTERPPTX_BILLING_ENFORCE: '1' }
		for (const bad of [
			{ BETTERPPTX_BILLING_PROVIDER: '' }, { BETTERPPTX_BILLING_ENFORCE: '0' },
			{ BETTERPPTX_BILLING_DRY_RUN: '1' }, { BETTERPPTX_BILLING_SHADOW_MODE: '1' },
			{ BETTERPPTX_FORCE_PLAN: 'premium' }, { BETTERPPTX_PREMIUM: '1' },
		]) {
			process.env = { ...good, ...bad }
			for (const promoCode of ['', 'FREE500', 'HALF500']) {
				const denied = await f.request('post', '/pay/payram/intents', { body: { packId: 'starter_500', customerEmail: 'buyer@example.test', promoCode } })
				assert.equal(denied.statusCode, 503)
				assert.equal(denied.body.error.code, 'BILLING_SETUP_INCOMPLETE')
			}
			const start = await f.request('get', '/pay/payram/intents/:intentId/start', { owner: '', intentId, query: continuation })
			assert.equal(start.statusCode, 503)
			assert.equal(start.location, undefined)
		}
		assert.equal(creates, 1)
		assert.equal(reads, 0)
		assert.equal(fs.existsSync(path.join(f.root, 'promos.json')), false)
		assert.equal((await f.request('get', '/pay/payram/intents/:intentId/status', { owner: 'attacker', intentId })).statusCode, 404)
		assert.equal((await f.request('get', '/pay/payram/return', { owner: 'attacker', query: { intentId } })).statusCode, 404)
		assert.equal((await f.request('post', '/internal/payments/payram/reconcile', { headers: { 'api-key': 'security-fixture-api-0000000000000000' } })).statusCode, 401)
		const returned = await f.request('get', '/pay/payram/return', { owner: '', query: { intentId, ...continuation } })
		assert.equal(returned.statusCode, 200)
		const status = await f.request('get', '/pay/payram/intents/:intentId/status', { owner: '', intentId, query: continuation })
		assert.equal(status.statusCode, 200)
		assert.equal(status.body.intent.state, 'credited')
		const reconciled = await f.request('post', '/internal/payments/payram/reconcile', { headers: { 'x-betterpptx-payram-token': 'security-fixture-hook-0000000000000000' } })
		assert.equal(reconciled.statusCode, 200)
		assert.equal(reconciled.body.summary.credited, 1)
		assert.equal((await f.ledger.getCustomer('buyer')).availableBalanceCredits, 1000)
		process.env = good
		assert.equal((await f.request('get', '/pay/payram/intents/:intentId/start', { intentId })).statusCode, 303)
	})
}

test('direct promo redemption cannot bypass unsafe production billing configuration', async t => {
	const f = fixture(t)
	for (const code of ['FREE500', 'HALF500']) {
		await assert.rejects(redeemPromoTopup({ code, packId: 'starter_500', customerHash: 'buyer', customerEmail: 'buyer@example.test', env: { ...process.env, BETTERPPTX_ENV: 'live' }, ledger: f.ledger, paymentIntents: f.store }), { code: 'BILLING_SETUP_INCOMPLETE' })
	}
	assert.equal(fs.existsSync(path.join(f.root, 'ledger.json')), false)
	assert.equal(fs.existsSync(path.join(f.root, 'promos.json')), false)
})

test('client errors never echo fake provider secrets, private responses, or exception details', async () => {
	const secret = 'arbitrary-fixture-credential-not-from-process-env'
	const env = { ...process.env, BETTERPPTX_PAYRAM_API_KEY: secret }
	for (const fetchFn of [
		async () => { throw new Error(`private route ${secret} repeated ${secret}`) },
		async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: `private service ${secret} ${secret}` }) }),
	]) {
		await assert.rejects(getPayramPaymentStatus('ref', { env, fetchFn }), error => {
			assert.ok(!JSON.stringify(error).includes(secret))
			assert.ok(!JSON.stringify(error).includes('private service'))
			return true
		})
	}
})

test('explicit checkout retry keys stay bound after settlement and conflicting pending keys are rejected', async t => {
	let creates = 0
	const f = fixture(t, async (_url, options) => {
		if (options.method === 'POST') { creates++; return json(payment('ref-stable-key')) }
		return json(paid('ref-stable-key'))
	})
	const body = { packId: 'starter_500', customerEmail: 'buyer@example.test', idempotencyKey: 'purchase-a' }
	const created = await f.request('post', '/pay/payram/intents', { body })
	assert.equal((await f.request('post', '/pay/payram/intents', { body: { ...body, idempotencyKey: 'purchase-b' } })).statusCode, 409)
	await f.request('get', '/pay/payram/intents/:intentId/status', { intentId: created.body.intent.intentId })
	assert.equal((await f.request('post', '/pay/payram/intents', { body })).body.intent.state, 'credited')
	assert.equal(creates, 1)
})

test('provider-negative status cannot grant through the real route even with an authenticated webhook', async t => {
	let evidence = paid('ref-target', { customerID: 'betterxlsx:buyer' })
	const f = fixture(t, async () => json(evidence))
	await f.store.createIntent(input('pi_target', { providerReferenceId: 'ref-target' }))
	for (const change of [
		{ customerID: 'betterxlsx:buyer' }, { customerID: 'betterpptx:other' },
		{ referenceID: 'foreign-ref' }, { amountInUSD: 0.01 },
	]) {
		evidence = paid('ref-target', change)
		const result = await f.request('post', '/internal/payments/payram/webhook', { headers: { 'api-key': 'security-fixture-api-0000000000000000' }, body: { reference_id: 'ref-target', paymentState: 'FILLED' } })
		assert.equal(result.statusCode, 502)
	}
	assert.equal(fs.existsSync(path.join(f.root, 'ledger.json')), false)
	assert.equal((await f.store.getIntent('pi_target')).creditedCredits, 0)
})

test('an ambiguous standard create is retained and retries do not submit another provider request', async t => {
	let creates = 0
	const f = fixture(t, async () => { creates++; throw new Error('lost provider response') })
	const body = { packId: 'starter_500', customerEmail: 'buyer@example.test' }
	assert.equal((await f.request('post', '/pay/payram/intents', { body })).statusCode, 503)
	const replay = await f.request('post', '/pay/payram/intents', { body })
	assert.equal(replay.statusCode, 202)
	assert.equal(replay.body.intent.state, 'verification_pending')
	assert.equal(creates, 1)
})

test('existing client and payment-intent compatibility verifiers pass in isolated fixture processes', async t => {
	const f = fixture(t)
	for (const name of ['verify-payram-client.mjs', 'verify-payment-intents.mjs']) {
		const script = fileURLToPath(new URL(`../${name}`, import.meta.url))
		const result = await new Promise(resolve => execFile(process.execPath, [script], {
			cwd: f.root, env: { ...process.env, SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows' }, timeout: 10000, windowsHide: true,
		}, error => resolve({ ok: !error })))
		assert.equal(result.ok, true, name)
	}
})
