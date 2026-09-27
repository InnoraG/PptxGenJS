import * as fs from 'node:fs'
import * as path from 'node:path'

import {
	BillingLedgerError,
	createBillingLedgerStore,
	hashCustomerId,
	hashDeckId,
	hashSessionId,
} from './billing/ledger-store.mjs'
import {
	buildBillingUsageEventId,
	commitCredits,
	effectiveBalanceSnapshot,
	releaseCredits,
	reserveCredits,
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
		if (err instanceof BillingLedgerError || err?.code) {
			if (err.code === code) return err
		}
		throw err
	}
	fail(`Expected billing error ${code}.`)
}

const wantFirestore = process.argv.includes('--firestore') || process.env.BETTERPPTX_BILLING_LEDGER_STORE === 'firestore'
if (!wantFirestore) {
	process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
	process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
	const verifyDir = path.resolve('outputs', 'billing-verify')
	fs.mkdirSync(verifyDir, { recursive: true })
	process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(verifyDir, 'billing-ledger.json')
	try { fs.rmSync(process.env.BETTERPPTX_BILLING_LEDGER_FILE, { force: true }) } catch {}
}

const store = createBillingLedgerStore()
const runId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
const customerHash = hashCustomerId(`cus_verify_${runId}`)
const sessionHash = hashSessionId(`session_verify_${runId}`)
const deckHash = hashDeckId(`deck_verify_${runId}`)

await store.upsertCustomer(customerHash, {
	providerCustomerId: `cus_verify_private_${runId}`,
	activationKey: 'never-store-this-activation-key',
	billingStatus: 'active',
	lastKnownProviderAvailableBalanceCredits: 5.00,
	lastBalanceSyncedAt: new Date().toISOString(),
})
await store.recordSession(sessionHash, { customerHash, source: 'verify-billing-ledger' })
await store.recordDeck(deckHash, { customerHash, sessionHash, source: 'verify-billing-ledger' })

const attempts = await Promise.all(Array.from({ length: 8 }, async (_item, index) => {
	try {
		const result = await reserveCredits({
			store,
			customerHash,
			sessionHash,
			deckHash,
			operationId: `verify_op_${runId}_${index}`,
			mode: 'checkpoint',
			amountCredits: 1.00,
			metadata: { index },
		})
		return { ok: true, result }
	} catch (err) {
		return { ok: false, code: err?.code, message: err?.message }
	}
}))

const successes = attempts.filter(item => item.ok)
const insufficient = attempts.filter(item => !item.ok && item.code === 'INSUFFICIENT_CREDITS')
expect(successes.length === 5, 'Concurrent reservation test did not reserve exactly the available credits.', { attempts })
expect(insufficient.length === 3, 'Concurrent reservation test did not block overspend attempts.', { attempts })

let customer = await store.getCustomer(customerHash)
let balance = effectiveBalanceSnapshot(customer)
expect(balance.pendingReservedCredits === 5, 'Pending reserved credits should equal the five successful reservations.', { balance })
expect(balance.effectiveAvailableCredits === 0, 'Effective balance should be zero after all available credits are reserved.', { balance })

const firstReservation = successes[0].result.reservation
const replay = await reserveCredits({
	store,
	customerHash,
	sessionHash,
	deckHash,
	operationId: firstReservation.operationId,
	reservationId: firstReservation.reservationId,
	mode: 'checkpoint',
	amountCredits: 1.00,
})
expect(replay.idempotent === true, 'Reservation replay should be idempotent.', { replay })

await expectBillingError('BILLING_IDEMPOTENCY_CONFLICT', () => reserveCredits({
	store,
	customerHash,
	sessionHash,
	deckHash,
	operationId: `${firstReservation.operationId}_changed`,
	reservationId: firstReservation.reservationId,
	mode: 'checkpoint',
	amountCredits: 1.00,
}))

const usageEventId = buildBillingUsageEventId({
	customerHash,
	sessionHash,
	deckHash,
	artifactHash: `artifact_verify_${runId}`,
	checkpointId: 'save_1',
	operationGroup: 'deck.save',
})
const committed = await commitCredits({
	store,
	reservationId: firstReservation.reservationId,
	usageEvent: {
		eventId: usageEventId,
		customerHash,
		sessionHash,
		deckHash,
		operationId: firstReservation.operationId,
		amountCredits: 1.00,
		metadata: { operation_group: 'deck.save', rate_card_version: 'verify-only' },
	},
})
expect(committed.reservation.state === 'committed', 'Committed reservation should move to committed state.', { committed })

const secondReservation = successes[1].result.reservation
const released = await releaseCredits({ store, reservationId: secondReservation.reservationId, reason: 'verify-release' })
expect(released.reservation.state === 'released', 'Released reservation should move to released state.', { released })

customer = await store.getCustomer(customerHash)
balance = effectiveBalanceSnapshot(customer)
expect(balance.pendingReservedCredits === 3, 'Pending reserved credits should drop after commit plus release.', { balance })
expect(balance.queuedUsageCreditsNotYetSettledByProvider === 1, 'Committed usage should remain queued until ledger settlement.', { balance })
expect(balance.effectiveAvailableCredits === 1, 'Effective balance should account for pending reservations plus queued usage.', { balance })

const queued = await store.listQueuedUsageEvents({ limit: 10 })
expect(queued.some(event => event.eventId === usageEventId), 'Queued usage event was not stored durably.', { queued })

const settled = await flushQueuedUsageEvents({ store, limit: 10 })
expect(settled.ok === true && settled.settled === 1 && settled.provider === 'ledger_internal', 'Queued usage should settle internally against the ledger.', { settled })
expect(settled.marked[0]?.usageEvent?.state === 'ingested', 'Usage event should move to ingested/settled state.', { settled })

customer = await store.getCustomer(customerHash)
balance = effectiveBalanceSnapshot(customer)
expect(balance.queuedUsageCreditsNotYetSettledByProvider === 0, 'Queued usage should clear after settlement.', { balance })
expect(balance.availableBalanceCredits === 4, 'Settlement should durably debit the available balance.', { balance })
expect(balance.effectiveAvailableCredits === 1, 'Settlement must not change the effective spendable balance.', { balance })

const webhookFirst = await store.recordWebhookEvent({
	webhookId: `wh_verify_${runId}`,
	eventType: 'credit.added',
	payload: { customerHash, credits: 500 },
})
const webhookReplay = await store.recordWebhookEvent({
	webhookId: `wh_verify_${runId}`,
	eventType: 'credit.added',
	payload: { customerHash, credits: 500 },
})
expect(webhookFirst.firstSeen === true, 'First webhook delivery should be processed once.', { webhookFirst })
expect(webhookReplay.firstSeen === false, 'Webhook replay should be recognized idempotently.', { webhookReplay })

// Ledger records written before the PayRam rename (dodo-suffixed field names) must
// still read correctly and migrate forward to the provider-neutral names on write.
const legacyHash = hashCustomerId(`cus_verify_legacy_${runId}`)
await store.upsertCustomer(legacyHash, {
	lastKnownDodoAvailableBalanceUnits: 500,
	durableQueuedUsageUnitsNotYetReflectedByDodo: 100,
})
const legacy = await store.getCustomer(legacyHash)
expect(legacy.availableBalanceCredits === 5 && legacy.queuedUsageCredits === 1, 'Legacy dodo-named ledger fields should normalize into the neutral balance fields.', { legacy })
expect(legacy.lastKnownDodoAvailableBalanceUnits === undefined && legacy.durableQueuedUsageUnitsNotYetReflectedByDodo === undefined, 'Legacy dodo-named fields should be migrated off the stored record.', { legacy })

if (!wantFirestore) {
	const text = fs.readFileSync(process.env.BETTERPPTX_BILLING_LEDGER_FILE, 'utf8')
	expect(!text.includes('never-store-this-activation-key'), 'Billing ledger persisted a raw activation key.', {})
}

console.log(`BILLING LEDGER: PASS provider=${store.provider} reservations=${successes.length} blocked=${insufficient.length} customer=${customerHash}`)
