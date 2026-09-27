import { BillingLedgerError, createBillingLedgerStore } from './ledger-store.mjs'

// x402 settlement and the PayRam onramp fund LEDGER-authoritative credits.
// Payment settlements only ever post credits INTO the ledger;
// there is no external usage-ingestion API to push events to. Queued usage events
// are settled internally: the customer's durable available balance is debited by the
// event amount and the event is marked settled in one store transaction, so the
// debit that effectiveBalanceSnapshot was already anticipating (queued units are
// subtracted from spendable balance) becomes permanent.

const MAX_SETTLEMENT_BATCH = 1000

function retryDelayMs(attemptCount) {
	const boundedDelay = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Math.min(86400000, Number(value)) : fallback
	const base = Math.max(1000, boundedDelay(process.env.BETTERPPTX_USAGE_RETRY_BASE_MS, 30000))
	const max = Math.max(base, boundedDelay(process.env.BETTERPPTX_USAGE_RETRY_MAX_MS, 30 * 60 * 1000))
	const exp = base * (2 ** Math.min(8, Math.max(0, Number(attemptCount) || 0)))
	return Math.min(max, exp)
}

function dueForRetry(event = {}, nowMs = Date.now()) {
	if (!event.nextRetryAt) return true
	const due = Date.parse(event.nextRetryAt)
	return !Number.isFinite(due) || due <= nowMs
}

export async function flushQueuedUsageEvents({ store = createBillingLedgerStore(), limit = 100, settle = undefined, now = new Date() } = {}) {
	if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new BillingLedgerError('BILLING_RECONCILER_TIME_INVALID', 'Reconciliation requires a valid time.')
	const max = Math.max(1, Math.min(MAX_SETTLEMENT_BATCH, Math.floor(Number(limit) || 100)))
	const queued = (await store.listQueuedUsageEvents({ limit: max * 2 })).filter(event => dueForRetry(event, now.getTime())).slice(0, max)
	if (!queued.length) return { ok: true, provider: 'ledger_internal', attempted: 0, ingested: 0, settled: 0, skipped: 0, failed: 0 }
	const marked = []
	const failed = []
	let skipped = 0
	for (const event of queued) {
		try {
			const result = settle
				? await settle(event, store)
				: await store.markUsageEventIngested(event.eventId, {
					settledBy: 'ledger_internal',
					settledAt: new Date().toISOString(),
				}, { settleFromAvailableBalance: true })
			if (result?.usageEvent?.eventId !== event.eventId || result?.usageEvent?.state !== 'ingested') {
				throw new BillingLedgerError('BILLING_SETTLEMENT_UNCONFIRMED', 'Settlement did not return a durable settled usage event.')
			}
			if (result.idempotent) skipped++
			else marked.push(result)
		} catch (err) {
			const attempts = Math.max(0, Number(event.ingestAttemptCount) || 0) + 1
			try {
				const failure = await store.markUsageEventFailed(event.eventId, {
					lastIngestErrorCode: /^[A-Z0-9_]{1,80}$/.test(String(err?.code || '')) ? err.code : 'LEDGER_USAGE_SETTLEMENT_FAILED',
					// Provider exceptions can contain credentials or response bodies.
					lastIngestErrorMessage: 'Usage settlement failed; the balance remains held pending reconciliation.',
					nextRetryAt: new Date(Math.min(8640000000000000, now.getTime() + retryDelayMs(attempts))).toISOString(),
				})
				if (failure?.usageEvent?.state === 'ingested') skipped++
				else failed.push(failure)
			} catch {
				// Failure reporting is not allowed to abort the remaining bounded batch.
				failed.push({ eventId: event.eventId, errorCode: 'LEDGER_USAGE_FAILURE_RECORDING_FAILED' })
			}
		}
	}
	return {
		ok: failed.length === 0,
		provider: 'ledger_internal',
		attempted: queued.length,
		ingested: marked.length,
		settled: marked.length,
		skipped,
		failed: failed.length,
		...(failed.length ? { errorCode: 'LEDGER_USAGE_SETTLEMENT_FAILED' } : {}),
		marked,
		failedEvents: failed,
	}
}
