import * as fs from 'node:fs'
import * as path from 'node:path'

import { createBillingLedgerStore, hashCustomerId } from './billing/ledger-store.mjs'
import {
	effectiveBalanceSnapshot,
	finalizeBillingReservation,
	preflightBillingReservation,
	refreshProviderBalanceForCustomer,
	releaseBillingReservation,
} from './billing/reservations.mjs'
import { flushQueuedUsageEvents } from './billing/usage-events.mjs'

function fail(message, details = {}) {
	const err = new Error(message)
	err.details = details
	throw err
}

function expect(condition, message, details = {}) {
	if (!condition) fail(message, details)
}

async function expectBillingError(code, fn) {
	try {
		await fn()
	} catch (err) {
		if (err?.code === code) return err
		throw err
	}
	fail(`Expected billing error ${code}.`)
}

function fakeObject(type = 'shape') {
	return { type, options: { x: 1, y: 1, w: 1, h: 1 } }
}

function fakeDeck({ slides = 3, plainObjects = 12, richObjects = 2 } = {}) {
	const out = []
	for (let i = 0; i < slides; i++) {
		const objects = []
		const plainThisSlide = Math.floor(plainObjects / slides) + (i < plainObjects % slides ? 1 : 0)
		const richThisSlide = Math.floor(richObjects / slides) + (i < richObjects % slides ? 1 : 0)
		for (let j = 0; j < plainThisSlide; j++) objects.push(fakeObject('shape'))
		for (let j = 0; j < richThisSlide; j++) objects.push(fakeObject('image'))
		out.push({ _slideObjects: objects })
	}
	return { pptx: { slides: out } }
}

function entitlement(customerId) {
	return {
		provider: 'payram',
		creditEntitlementId: 'cde_verify_gate',
		billingCustomerHash: hashCustomerId(customerId),
		billingStatus: 'active',
	}
}

async function seedCredits(customerHash, credits, grantId) {
	await store.creditCustomer({
		customerHash,
		eventId: grantId,
		amountCredits: credits,
		source: 'payram_settlement',
		idempotencyKey: grantId,
	})
}

process.env.BETTERPPTX_BILLING_PROVIDER = 'payram'
process.env.BETTERPPTX_BILLING_DRY_RUN = '0'
process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
const verifyDir = path.resolve('outputs', 'billing-verify', `reservation-gate-${Date.now()}-${process.pid}`)
fs.mkdirSync(verifyDir, { recursive: true })
process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(verifyDir, 'billing-reservation-gate-ledger.json')

const store = createBillingLedgerStore()
const context = { sessionId: 'session_verify_gate' }
const entry = fakeDeck()

await expectBillingError('BILLING_SETUP_INCOMPLETE', () => preflightBillingReservation({
	name: 'betterpptx.deck.save',
	args: { deckId: 'deck_verify_gate_free', idempotencyKey: 'save-free' },
	context: { sessionId: 'session_verify_gate_free' },
	entry,
	billingEntitlement: null,
	store,
}))

const paid = entitlement('cus_verify_gate_success')
await seedCredits(paid.billingCustomerHash, 30, 'grant_verify_gate_success')
const gate = await preflightBillingReservation({
	name: 'betterpptx.deck.save',
	args: { deckId: 'deck_verify_gate_success', idempotencyKey: 'save-success' },
	context,
	entry,
	billingEntitlement: paid,
	store,
})
expect(gate.active === true, 'Reservation gate should reserve for checkpoint save.', { gate })
expect(gate.amountCredits > 0, 'Reservation should have a positive estimate.', { gate })
let customer = await store.getCustomer(paid.billingCustomerHash)
let balance = effectiveBalanceSnapshot(customer)
expect(balance.pendingReservedCredits === gate.amountCredits, 'Pending reservation should reduce effective balance.', { balance, gate })

const replay = await expectBillingError('BILLING_TEMPORARILY_UNAVAILABLE', () => preflightBillingReservation({
	name: 'betterpptx.deck.save',
	args: { deckId: 'deck_verify_gate_success', idempotencyKey: 'save-success' },
	context,
	entry,
	billingEntitlement: paid,
	store,
}))
expect(replay.details.reason === 'reservation-already-used', 'Reservation idempotency does not authorize executing the value-producing operation again.', { replay })
customer = await store.getCustomer(paid.billingCustomerHash)
balance = effectiveBalanceSnapshot(customer)
expect(balance.pendingReservedCredits === gate.amountCredits, 'Idempotent reservation replay should not double reserve.', { balance, gate })

const finalized = await finalizeBillingReservation({
	gate,
	name: 'betterpptx.deck.save',
	args: { deckId: 'deck_verify_gate_success', idempotencyKey: 'save-success' },
	result: { bytes: 512 * 1024, slideCount: 3, artifact: { state: 'saved' } },
	store,
})
expect(finalized.reservation.state === 'committed', 'Successful save should commit the reservation.', { finalized })
customer = await store.getCustomer(paid.billingCustomerHash)
balance = effectiveBalanceSnapshot(customer)
expect(balance.pendingReservedCredits === 0, 'Committed reservation should clear pending credits.', { balance })
expect(balance.queuedUsageCreditsNotYetSettledByProvider === finalized.reservation.committedAmountCredits, 'Committed reservation should queue the actual charge, not the accepted cap.', { balance, gate, finalized })
expect(finalized.reservation.committedAmountCredits <= gate.amountCredits, 'Committed reservation must not exceed the accepted cap.', { gate, finalized })
const queued = await store.listQueuedUsageEvents({ limit: 10 })
expect(queued.length === 1 && queued[0].state === 'queued', 'Committed reservation should queue one usage event.', { queued })

// PayRam settlement is ledger-internal: the queued charge becomes a durable debit,
// and the customer's effective spendable balance is unchanged by settlement itself.
const effectiveBeforeSettle = balance.effectiveAvailableCredits
const availableBeforeSettle = balance.availableBalanceCredits
const settled = await flushQueuedUsageEvents({ store, limit: 10 })
expect(settled.ok === true && settled.settled === 1 && settled.provider === 'ledger_internal', 'Queued usage should settle internally against the ledger.', { settled })
customer = await store.getCustomer(paid.billingCustomerHash)
balance = effectiveBalanceSnapshot(customer)
expect(balance.queuedUsageCreditsNotYetSettledByProvider === 0, 'Settlement should clear queued usage.', { balance })
expect(balance.availableBalanceCredits === Number((availableBeforeSettle - finalized.reservation.committedAmountCredits).toFixed(2)), 'Settlement should durably debit the available balance by the committed charge.', { balance, finalized })
expect(balance.effectiveAvailableCredits === effectiveBeforeSettle, 'Settlement must not change the effective spendable balance.', { balance, effectiveBeforeSettle })

// Crypto balances are ledger-authoritative: insufficiency is immediate, no provider pull-refresh.
const broke = entitlement('cus_verify_gate_broke')
let refreshCalls = 0
const insufficientErr = await expectBillingError('INSUFFICIENT_CREDITS', () => preflightBillingReservation({
	name: 'betterpptx.deck.save',
	args: { deckId: 'deck_verify_gate_broke', idempotencyKey: 'save-broke' },
	context,
	entry,
	billingEntitlement: broke,
	store,
	refreshBalance: async () => {
		refreshCalls += 1
		return { ok: true, balanceCredits: 999 }
	},
}))
expect(refreshCalls === 0, 'Crypto-credit insufficiency must not attempt a provider balance refresh.', { refreshCalls })
expect(insufficientErr?.details?.balanceRefreshed === false, 'Insufficiency error should report that no refresh happened.', { insufficientErr })

const pullRefresh = await refreshProviderBalanceForCustomer()
expect(pullRefresh.ok === false && pullRefresh.code === 'PROVIDER_PULL_REFRESH_UNSUPPORTED', 'PayRam must not offer a pull-based balance refresh.', { pullRefresh })

await expectBillingError('BILLING_SETUP_INCOMPLETE', () => preflightBillingReservation({
	name: 'betterpptx.deck.save',
	args: { deckId: 'deck_verify_gate_missing', idempotencyKey: 'save-missing' },
	context,
	entry,
	billingEntitlement: { provider: 'payram' },
	store,
}))

const failPaid = entitlement('cus_verify_gate_release')
await seedCredits(failPaid.billingCustomerHash, 30, 'grant_verify_gate_release')
const failGate = await preflightBillingReservation({
	name: 'betterpptx.narration.synthesize',
	args: { text: 'Narration '.repeat(500), idempotencyKey: 'tts-release' },
	context,
	billingEntitlement: failPaid,
	store,
})
expect(failGate.active === true, 'Heavy operation should reserve before execution.', { failGate })
const released = await releaseBillingReservation({ gate: failGate, reason: 'verify-failed-before-value', store })
expect(released.reservation.state === 'released', 'Failed pre-value operation should release reservation.', { released })
customer = await store.getCustomer(failPaid.billingCustomerHash)
balance = effectiveBalanceSnapshot(customer)
expect(balance.pendingReservedCredits === 0, 'Released reservation should restore pending balance.', { balance })

console.log(`BILLING RESERVATION GATE: PASS reserved=${gate.amountCredits} settled=${settled.settled} queued=${queued.length}`)
