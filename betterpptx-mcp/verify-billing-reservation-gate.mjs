import * as fs from 'node:fs'
import * as path from 'node:path'

import { createBillingLedgerStore, hashCustomerId } from './billing/ledger-store.mjs'
import {
	effectiveBalanceSnapshot,
	finalizeBillingReservation,
	preflightBillingReservation,
	releaseBillingReservation,
} from './billing/reservations.mjs'

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

function entitlement(providerCustomerId, credits = 30) {
	return {
		provider: 'dodo',
		providerCustomerId,
		creditEntitlementId: 'cde_verify_gate',
		billingCustomerHash: hashCustomerId(providerCustomerId),
		billingStatus: 'active',
		lastKnownCreditBalance: credits,
		lastBalanceSyncedAt: new Date().toISOString(),
	}
}

process.env.BETTERPPTX_BILLING_PROVIDER = 'dodo'
process.env.BETTERPPTX_BILLING_DRY_RUN = '0'
process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
const verifyDir = path.resolve('outputs', 'billing-verify')
fs.mkdirSync(verifyDir, { recursive: true })
process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(verifyDir, 'billing-reservation-gate-ledger.json')
try { fs.rmSync(process.env.BETTERPPTX_BILLING_LEDGER_FILE, { force: true }) } catch {}

const store = createBillingLedgerStore()
const context = { sessionId: 'session_verify_gate' }
const entry = fakeDeck()

const paid = entitlement('cus_verify_gate_success', 30)
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

const replay = await preflightBillingReservation({
	name: 'betterpptx.deck.save',
	args: { deckId: 'deck_verify_gate_success', idempotencyKey: 'save-success' },
	context,
	entry,
	billingEntitlement: paid,
	store,
})
expect(replay.idempotent === true, 'Same idempotency key and args should replay the reservation idempotently.', { replay })
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
expect(balance.queuedUsageCreditsNotYetReflectedByDodo === gate.amountCredits, 'Committed reservation should create queued usage debt.', { balance, gate })
const queued = await store.listQueuedUsageEvents({ limit: 10 })
expect(queued.length === 1 && queued[0].state === 'queued', 'Committed reservation should queue one usage event.', { queued })

const refreshPaid = entitlement('cus_verify_gate_refresh', 1)
let refreshCalls = 0
const refreshedGate = await preflightBillingReservation({
	name: 'betterpptx.deck.save',
	args: { deckId: 'deck_verify_gate_refresh', idempotencyKey: 'save-refresh' },
	context,
	entry,
	billingEntitlement: refreshPaid,
	store,
	refreshBalance: async ({ store: ledger, billingEntitlement }) => {
		refreshCalls += 1
		await ledger.upsertCustomer(billingEntitlement.billingCustomerHash, {
			providerCustomerId: billingEntitlement.providerCustomerId,
			lastKnownDodoAvailableBalanceCredits: 50,
			lastBalanceSyncedAt: new Date().toISOString(),
		})
		return { ok: true, balanceCredits: 50 }
	},
})
expect(refreshedGate.active === true && refreshedGate.balanceRefreshed === true, 'Live balance refresh should allow a recent top-up before blocking.', { refreshedGate })
expect(refreshCalls === 1, 'Balance refresh should run exactly once before retrying reservation.', { refreshCalls })

const stillLow = entitlement('cus_verify_gate_low', 1)
await expectBillingError('INSUFFICIENT_CREDITS', () => preflightBillingReservation({
	name: 'betterpptx.deck.save',
	args: { deckId: 'deck_verify_gate_low', idempotencyKey: 'save-low' },
	context,
	entry,
	billingEntitlement: stillLow,
	store,
	refreshBalance: async ({ store: ledger, billingEntitlement }) => {
		await ledger.upsertCustomer(billingEntitlement.billingCustomerHash, {
			providerCustomerId: billingEntitlement.providerCustomerId,
			lastKnownDodoAvailableBalanceCredits: 2,
			lastBalanceSyncedAt: new Date().toISOString(),
		})
		return { ok: true, balanceCredits: 2 }
	},
}))

const unavailable = entitlement('cus_verify_gate_unavailable', 1)
await expectBillingError('BILLING_TEMPORARILY_UNAVAILABLE', () => preflightBillingReservation({
	name: 'betterpptx.deck.save',
	args: { deckId: 'deck_verify_gate_unavailable', idempotencyKey: 'save-unavailable' },
	context,
	entry,
	billingEntitlement: unavailable,
	store,
	refreshBalance: async () => ({ ok: false, code: 'verify-refresh-down' }),
}))

await expectBillingError('BILLING_SETUP_INCOMPLETE', () => preflightBillingReservation({
	name: 'betterpptx.deck.save',
	args: { deckId: 'deck_verify_gate_missing', idempotencyKey: 'save-missing' },
	context,
	entry,
	billingEntitlement: { provider: 'dodo' },
	store,
}))

const failPaid = entitlement('cus_verify_gate_release', 30)
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

console.log(`BILLING RESERVATION GATE: PASS reserved=${gate.amountCredits} refreshed=${refreshedGate.amountCredits} queued=${queued.length}`)
