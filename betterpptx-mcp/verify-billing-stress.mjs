import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { publicToolList } from './blackbox.mjs'
import { TOOLS } from './tools.mjs'
import { processDodoWebhook } from './billing/webhooks.mjs'
import { createBillingLedgerStore, hashCustomerId } from './billing/ledger-store.mjs'
import {
	effectiveBalanceSnapshot,
	finalizeBillingReservation,
	preflightBillingReservation,
	releaseBillingReservation,
} from './billing/reservations.mjs'
import { estimateBillingForTool } from './billing/estimator.mjs'
import { flushQueuedUsageEvents } from './billing/usage-events.mjs'

function fail(message, details = {}) {
	const err = new Error(message)
	err.details = details
	throw err
}

function expect(condition, message, details = {}) {
	if (!condition) fail(message, details)
}

function signWebhook(body, webhookId, secret = process.env.DODO_PAYMENTS_WEBHOOK_SECRET) {
	const timestamp = String(Math.floor(Date.now() / 1000))
	const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('base64')
	return {
		'webhook-id': webhookId,
		'webhook-timestamp': timestamp,
		'webhook-signature': `v1,${signature}`,
	}
}

function fakeObject(type = 'shape') {
	return { type, options: { x: 1, y: 1, w: 1, h: 1 } }
}

function fakeDeck({ slides = 3, plainObjects = 12, richObjects = 2, bytes = 1024 * 1024 } = {}) {
	const out = []
	for (let i = 0; i < slides; i++) {
		const objects = []
		const plainThisSlide = Math.floor(plainObjects / slides) + (i < plainObjects % slides ? 1 : 0)
		const richThisSlide = Math.floor(richObjects / slides) + (i < richObjects % slides ? 1 : 0)
		for (let j = 0; j < plainThisSlide; j++) objects.push(fakeObject('shape'))
		for (let j = 0; j < richThisSlide; j++) objects.push(fakeObject(j % 2 ? 'chart' : 'image'))
		out.push({ _slideObjects: objects, _animations: i % 2 ? [{ effect: 'fade' }] : [] })
	}
	return { pptx: { slides: out }, bytes }
}

function entitlement(providerCustomerId, credits = 100) {
	return {
		provider: 'dodo',
		providerCustomerId,
		creditEntitlementId: 'cde_verify_stress',
		billingCustomerHash: hashCustomerId(providerCustomerId),
		billingStatus: 'active',
		lastKnownCreditBalance: credits,
		lastBalanceSyncedAt: new Date().toISOString(),
	}
}

async function reserveAndFinalize({ store, context, billingEntitlement, name = 'betterpptx.deck.save', args, entry, result }) {
	const gate = await preflightBillingReservation({
		name,
		args,
		context,
		entry,
		billingEntitlement,
		store,
		refreshBalance: async () => ({ ok: true, balanceCredits: 0 }),
	})
	await finalizeBillingReservation({
		gate,
		name,
		args,
		result,
		store,
	})
	return gate
}

process.env.BETTERPPTX_BILLING_PROVIDER = 'dodo'
process.env.BETTERPPTX_BILLING_DRY_RUN = '0'
process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.BETTERPPTX_BILLING_MAX_QUEUED_USAGE_CREDITS = '500'
process.env.DODO_PAYMENTS_WEBHOOK_SECRET = 'whsec_verify_stress'
const verifyDir = path.resolve('outputs', 'billing-verify')
fs.mkdirSync(verifyDir, { recursive: true })
process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(verifyDir, 'billing-stress-ledger.json')
try { fs.rmSync(process.env.BETTERPPTX_BILLING_LEDGER_FILE, { force: true }) } catch {}

const store = createBillingLedgerStore()
const context = { sessionId: 'session_verify_stress' }
const simpleDeck = fakeDeck({ slides: 2, plainObjects: 6, richObjects: 0, bytes: 300 * 1024 })
const mediumDeck = fakeDeck({ slides: 7, plainObjects: 35, richObjects: 8, bytes: 3 * 1024 * 1024 })
const heavyDeck = fakeDeck({ slides: 14, plainObjects: 120, richObjects: 40, bytes: 18 * 1024 * 1024 })

const simpleEstimate = estimateBillingForTool({ name: 'betterpptx.deck.save', entry: simpleDeck, result: { bytes: simpleDeck.bytes, slideCount: 2 } })
const mediumEstimate = estimateBillingForTool({ name: 'betterpptx.deck.save', entry: mediumDeck, result: { bytes: mediumDeck.bytes, slideCount: 7 } })
const heavyEstimate = estimateBillingForTool({ name: 'betterpptx.deck.save', entry: heavyDeck, result: { bytes: heavyDeck.bytes, slideCount: 14 } })
expect(simpleEstimate.estimatedCredits < mediumEstimate.estimatedCredits && mediumEstimate.estimatedCredits < heavyEstimate.estimatedCredits, 'Stress estimates should order simple < medium < heavy.', { simpleEstimate, mediumEstimate, heavyEstimate })

const concurrent = entitlement('cus_verify_stress_concurrent', 30)
const attempts = await Promise.all(Array.from({ length: 8 }, async (_item, index) => {
	try {
		const gate = await preflightBillingReservation({
			name: 'betterpptx.deck.save',
			args: { deckId: 'deck_verify_stress_concurrent', idempotencyKey: `save-${index}` },
			context,
			entry: mediumDeck,
			billingEntitlement: concurrent,
			store,
			refreshBalance: async () => ({ ok: true, balanceCredits: 0 }),
		})
		return { ok: true, gate }
	} catch (err) {
		return { ok: false, code: err?.code, details: err?.details }
	}
}))
const reserved = attempts.filter(item => item.ok)
const blocked = attempts.filter(item => !item.ok)
expect(reserved.length > 0, 'Concurrent saves should reserve at least one operation.', { attempts })
expect(blocked.some(item => item.code === 'INSUFFICIENT_CREDITS'), 'Concurrent saves should block overspend attempts.', { attempts })
let customer = await store.getCustomer(concurrent.billingCustomerHash)
let balance = effectiveBalanceSnapshot(customer)
expect(balance.pendingReservedCredits <= 30, 'Concurrent reservations must not overspend customer balance.', { balance })
for (const item of reserved) {
	await finalizeBillingReservation({
		gate: item.gate,
		name: 'betterpptx.deck.save',
		args: { deckId: 'deck_verify_stress_concurrent', idempotencyKey: item.gate.reservation.operationId },
		result: { bytes: mediumDeck.bytes, slideCount: 7, artifact: { state: 'saved' } },
		store,
	})
}

const heavyCustomer = entitlement('cus_verify_stress_heavy', 12)
const heavyAttempts = await Promise.all(Array.from({ length: 6 }, async (_item, index) => {
	try {
		return {
			ok: true,
			gate: await preflightBillingReservation({
				name: 'betterpptx.narration.get_voice_timing',
				args: { text: 'Narration '.repeat(500), idempotencyKey: `heavy-${index}` },
				context,
				billingEntitlement: heavyCustomer,
				store,
				refreshBalance: async () => ({ ok: true, balanceCredits: 0 }),
			}),
		}
	} catch (err) {
		return { ok: false, code: err?.code }
	}
}))
expect(heavyAttempts.some(item => item.ok) && heavyAttempts.some(item => item.code === 'INSUFFICIENT_CREDITS'), 'Concurrent heavy operations should reserve some and block overspend.', { heavyAttempts })

const idemCustomer = entitlement('cus_verify_stress_idem', 100)
const idemArgs = { deckId: 'deck_verify_stress_idem', idempotencyKey: 'same-save-key' }
const firstIdem = await preflightBillingReservation({ name: 'betterpptx.deck.save', args: idemArgs, context, entry: simpleDeck, billingEntitlement: idemCustomer, store })
const secondIdem = await preflightBillingReservation({ name: 'betterpptx.deck.save', args: idemArgs, context, entry: simpleDeck, billingEntitlement: idemCustomer, store })
expect(secondIdem.idempotent === true && firstIdem.reservation.reservationId === secondIdem.reservation.reservationId, 'Idempotent retry should not create a second reservation.', { firstIdem, secondIdem })

const noIdemCustomer = entitlement('cus_verify_stress_no_idem', 100)
const noIdemArgs = { deckId: 'deck_verify_stress_no_idem' }
const noIdemFirst = await preflightBillingReservation({ name: 'betterpptx.deck.save', args: noIdemArgs, context, entry: simpleDeck, billingEntitlement: noIdemCustomer, store })
const noIdemRetry = await preflightBillingReservation({ name: 'betterpptx.deck.save', args: noIdemArgs, context, entry: simpleDeck, billingEntitlement: noIdemCustomer, store })
expect(noIdemRetry.idempotent === true && noIdemFirst.reservation.reservationId === noIdemRetry.reservation.reservationId, 'Server-side deterministic operation id should protect identical retry without client idempotency key.', { noIdemFirst, noIdemRetry })

const failCustomer = entitlement('cus_verify_stress_release', 100)
const failGate = await preflightBillingReservation({ name: 'betterpptx.narration.get_voice_timing', args: { text: 'fail before value', idempotencyKey: 'release' }, context, billingEntitlement: failCustomer, store })
await releaseBillingReservation({ gate: failGate, reason: 'stress-pre-value-failure', store })
customer = await store.getCustomer(failCustomer.billingCustomerHash)
balance = effectiveBalanceSnapshot(customer)
expect(balance.pendingReservedCredits === 0, 'Failed operation should release pending reservation.', { balance })

const outageCustomer = entitlement('cus_verify_stress_outage', 100)
await reserveAndFinalize({
	store,
	context,
	billingEntitlement: outageCustomer,
	args: { deckId: 'deck_verify_stress_outage', idempotencyKey: 'outage-save' },
	entry: simpleDeck,
	result: { bytes: simpleDeck.bytes, slideCount: 2, artifact: { state: 'saved' } },
})
const outage = await flushQueuedUsageEvents({
	store,
	ingest: async () => { throw new Error('stress outage') },
})
expect(outage.ok === false && outage.failed >= 1, 'Dodo outage should keep usage queued.', { outage })
const retryBase = (await store.listQueuedUsageEvents({ limit: 50 })).filter(event => event.lastIngestErrorCode)
const retryAt = retryBase.map(event => Date.parse(event.nextRetryAt)).filter(Number.isFinite).sort((a, b) => a - b)[0]
let retriedEvents = []
const recovered = await flushQueuedUsageEvents({
	store,
	now: new Date(retryAt + 1000),
	ingest: async events => {
		retriedEvents.push(...events)
		return { ok: true, ingestedCount: events.length, data: { ingested_count: events.length } }
	},
})
expect(recovered.ok === true && retriedEvents.length === recovered.ingested, 'Dodo recovery should flush queued events exactly once.', { recovered, retriedEvents })

const zero = entitlement('cus_verify_stress_zero', 0)
const zeroBlock = await preflightBillingReservation({
	name: 'betterpptx.deck.save',
	args: { deckId: 'deck_verify_stress_zero', idempotencyKey: 'zero' },
	context,
	entry: simpleDeck,
	billingEntitlement: zero,
	store,
	refreshBalance: async () => ({ ok: true, balanceCredits: 0 }),
}).then(() => null, err => err)
expect(zeroBlock?.code === 'INSUFFICIENT_CREDITS', 'Zero balance should block checkpoint work.', { zeroBlock })

const topupBody = JSON.stringify({
	type: 'credit.added',
	data: {
		customer_id: 'cus_verify_stress_zero',
		credit_entitlement_id: 'cde_verify_stress',
		amount: 500,
		balance_after: 500,
	},
})
await processDodoWebhook({
	rawBody: topupBody,
	headers: signWebhook(topupBody, 'evt_verify_stress_topup'),
	store,
})
const topupGate = await preflightBillingReservation({
	name: 'betterpptx.deck.save',
	args: { deckId: 'deck_verify_stress_zero', idempotencyKey: 'after-topup' },
	context,
	entry: simpleDeck,
	billingEntitlement: zero,
	store,
	refreshBalance: async () => ({ ok: true, balanceCredits: 500 }),
})
expect(topupGate.active === true, 'Credit-added webhook should allow a formerly zero-balance customer to reserve.', { topupGate })

const publicTools = publicToolList(TOOLS)
const publicText = JSON.stringify(publicTools)
expect(!/node_modules|C:\\|betterpptx_billing_|DODO_PAYMENTS_API_KEY|providerCustomerId|webhook-id/i.test(publicText), 'Public tool schemas should not leak internals or provider ids.', {})

console.log(`BILLING STRESS: PASS concurrent_reserved=${reserved.length} blocked=${blocked.length} recovered=${recovered.ingested}`)
