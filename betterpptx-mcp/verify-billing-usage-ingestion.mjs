import * as fs from 'node:fs'
import * as path from 'node:path'

import { DodoClientError } from './billing/dodo-client.mjs'
import { createBillingLedgerStore, hashCustomerId } from './billing/ledger-store.mjs'
import {
	effectiveBalanceSnapshot,
	finalizeBillingReservation,
	preflightBillingReservation,
} from './billing/reservations.mjs'
import { flushQueuedUsageEvents, formatDodoUsageEvent } from './billing/usage-events.mjs'

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

function fakeDeck() {
	return {
		pptx: {
			slides: [
				{ _slideObjects: [{ type: 'shape' }, { type: 'image' }, { type: 'chart' }] },
				{ _slideObjects: [{ type: 'shape' }, { type: 'table' }] },
			],
		},
	}
}

function entitlement(providerCustomerId, credits = 100) {
	return {
		provider: 'dodo',
		providerCustomerId,
		creditEntitlementId: 'cde_verify_usage',
		billingCustomerHash: hashCustomerId(providerCustomerId),
		billingStatus: 'active',
		lastKnownCreditBalance: credits,
		lastBalanceSyncedAt: new Date().toISOString(),
	}
}

async function queueUsage({ store, context, billingEntitlement, deckId, saveKey }) {
	const gate = await preflightBillingReservation({
		name: 'betterpptx.deck.save',
		args: { deckId, idempotencyKey: saveKey },
		context,
		entry: fakeDeck(),
		billingEntitlement,
		store,
	})
	await finalizeBillingReservation({
		gate,
		name: 'betterpptx.deck.save',
		args: { deckId, idempotencyKey: saveKey },
		result: { bytes: 750 * 1024, slideCount: 2, artifact: { state: 'saved' } },
		store,
	})
	const queued = await store.listQueuedUsageEvents({ limit: 20 })
	return queued.find(event => event.operationId === gate.operationId)
}

process.env.BETTERPPTX_BILLING_PROVIDER = 'dodo'
process.env.BETTERPPTX_BILLING_DRY_RUN = '0'
process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.BETTERPPTX_DODO_USAGE_EVENT_NAME = 'betterpptx.usage'
process.env.BETTERPPTX_BILLING_MAX_QUEUED_USAGE_CREDITS = '50'
const verifyDir = path.resolve('outputs', 'billing-verify')
fs.mkdirSync(verifyDir, { recursive: true })
process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(verifyDir, 'billing-usage-ingestion-ledger.json')
try { fs.rmSync(process.env.BETTERPPTX_BILLING_LEDGER_FILE, { force: true }) } catch {}

const store = createBillingLedgerStore()
const context = { sessionId: 'session_verify_usage' }
const paid = entitlement('cus_verify_usage_success', 100)
const queued = await queueUsage({ store, context, billingEntitlement: paid, deckId: 'deck_verify_usage_success', saveKey: 'save-usage-1' })
expect(queued?.state === 'queued', 'Successful reservation finalization should create queued usage.', { queued })

const customer = await store.getCustomer(paid.billingCustomerHash)
const formatted = formatDodoUsageEvent(queued, customer)
expect(formatted.event_id === queued.eventId, 'Dodo event id should use durable queued event id.', { formatted, queued })
expect(formatted.customer_id === paid.providerCustomerId, 'Dodo event should include provider customer id.', { formatted })
expect(formatted.event_name === 'betterpptx.usage', 'Dodo event should use configured usage event name.', { formatted })
expect(formatted.metadata.credit_cost === queued.amountCredits, 'Dodo metadata should include numeric credit_cost.', { formatted, queued })
expect(formatted.metadata.rate_card_version, 'Rate-card version should be metadata, not part of the event id.', { formatted })
expect(!formatted.event_id.includes(formatted.metadata.rate_card_version), 'Usage event id must be rate-card independent.', { formatted })

let sent = []
const success = await flushQueuedUsageEvents({
	store,
	ingest: async events => {
		sent.push(...events)
		return { ok: true, ingestedCount: events.length, data: { ingested_count: events.length } }
	},
})
expect(success.ok === true && success.ingested === 1, 'Queued usage should ingest successfully.', { success })
expect(sent.length === 1 && sent[0].event_id === queued.eventId, 'Dodo ingest should receive exactly the queued event once.', { sent, queued })
let after = await store.getCustomer(paid.billingCustomerHash)
let balance = effectiveBalanceSnapshot(after)
expect(balance.queuedUsageCreditsNotYetReflectedByDodo === 0, 'Queued usage debt should clear after ingest.', { balance })

const outagePaid = entitlement('cus_verify_usage_outage', 100)
const outageQueued = await queueUsage({ store, context, billingEntitlement: outagePaid, deckId: 'deck_verify_usage_outage', saveKey: 'save-usage-outage' })
let failedSendCount = 0
const outage = await flushQueuedUsageEvents({
	store,
	ingest: async events => {
		failedSendCount += events.length
		throw new DodoClientError('VERIFY_DODO_DOWN', 'Synthetic Dodo outage.')
	},
})
expect(outage.ok === false && outage.failed === 1, 'Dodo outage should leave usage queued with failure metadata.', { outage })
expect(failedSendCount === 1, 'Outage ingest should attempt the queued event once.', { failedSendCount })
let failedEvent = (await store.listQueuedUsageEvents({ limit: 20 })).find(event => event.eventId === outageQueued.eventId)
expect(failedEvent?.state === 'queued', 'Failed usage event should remain queued.', { failedEvent })
expect(failedEvent.ingestAttemptCount === 1, 'Failed usage event should increment attempt count.', { failedEvent })
expect(Boolean(failedEvent.nextRetryAt), 'Failed usage event should get nextRetryAt.', { failedEvent })

const skippedRetry = await flushQueuedUsageEvents({
	store,
	ingest: async events => {
		throw new Error(`Should not retry before nextRetryAt; got ${events.length}`)
	},
})
expect(skippedRetry.attempted === 0, 'Reconciler should skip events before nextRetryAt.', { skippedRetry })

sent = []
const retry = await flushQueuedUsageEvents({
	store,
	now: new Date(Date.parse(failedEvent.nextRetryAt) + 1000),
	ingest: async events => {
		sent.push(...events)
		return { ok: true, ingestedCount: events.length, data: { ingested_count: events.length } }
	},
})
expect(retry.ok === true && retry.ingested === 1, 'Queued event should later flush exactly once after retry delay.', { retry })
expect(sent.length === 1 && sent[0].event_id === outageQueued.eventId, 'Retry should send the same deterministic event id.', { sent, outageQueued })

const missingCustomerHash = hashCustomerId('cus_verify_usage_missing_provider')
await store.upsertCustomer(missingCustomerHash, { billingStatus: 'active', lastKnownDodoAvailableBalanceCredits: 100 })
await store.upsertUsageEvent({
	eventId: 'bpptx_usage_missing_provider',
	customerHash: missingCustomerHash,
	amountCredits: 1,
	metadata: { operation_group: 'verify' },
})
const missing = await flushQueuedUsageEvents({
	store,
	now: new Date(Date.now() + 60 * 60 * 1000),
	ingest: async events => {
		throw new Error(`Missing provider customer should not call Dodo; got ${events.length}`)
	},
})
expect(missing.ok === false && missing.skipped === 1, 'Missing provider customer id should be skipped and left queued.', { missing })

const capped = entitlement('cus_verify_usage_cap', 500)
await store.upsertCustomer(capped.billingCustomerHash, {
	providerCustomerId: capped.providerCustomerId,
	lastKnownDodoAvailableBalanceCredits: 500,
	durableQueuedUsageCreditsNotYetReflectedByDodo: 51,
})
await expectBillingError('BILLING_TEMPORARILY_UNAVAILABLE', () => preflightBillingReservation({
	name: 'betterpptx.deck.save',
	args: { deckId: 'deck_verify_usage_cap', idempotencyKey: 'save-cap' },
	context,
	entry: fakeDeck(),
	billingEntitlement: capped,
	store,
}))

console.log(`BILLING USAGE INGESTION: PASS sent=${success.ingested + retry.ingested} outageAttempts=${failedSendCount}`)
