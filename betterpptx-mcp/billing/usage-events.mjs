import { createBillingLedgerStore } from './ledger-store.mjs'
import { ingestDodoUsageEvents } from './dodo-client.mjs'

const MAX_DODO_BATCH = 1000

function usageEventName() {
	return process.env.BETTERPPTX_DODO_USAGE_EVENT_NAME || 'betterpptx.usage'
}

function stringValue(value) {
	if (value === undefined || value === null) return null
	if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null
	if (typeof value === 'boolean') return value ? 'true' : 'false'
	const text = String(value)
	return text.length > 500 ? text.slice(0, 500) : text
}

function metadataFrom(event = {}) {
	const creditCost = Number(Number(event.amountCredits || event.amount || 0).toFixed(2))
	const base = {
		credit_cost: Number.isFinite(creditCost) ? creditCost : 0,
		billing_mode: event.metadata?.billing_mode || event.metadata?.billingMode || 'checkpoint',
		rate_card_version: event.metadata?.rate_card_version || event.metadata?.rateCardVersion || 'unknown',
		session_hash: event.sessionHash,
		deck_hash: event.deckHash,
		operation_group: event.metadata?.operation_group || event.metadata?.operationGroup || 'operation',
		tool_count: event.metadata?.tool_count,
		slide_count: event.metadata?.slide_count || event.metadata?.slideCount,
		final_object_count: event.metadata?.final_object_count || event.metadata?.finalObjectCount,
		output_mb: event.metadata?.output_mb || event.metadata?.outputMb,
		status: event.metadata?.status || 'success',
		occurred_at: event.createdAt || event.committedAt || event.updatedAt,
	}
	const out = {}
	for (const [key, value] of Object.entries(base)) {
		if (key === 'credit_cost') {
			out[key] = value
			continue
		}
		const v = stringValue(value)
		if (v !== null && key.length <= 100) out[key] = v
	}
	return out
}

function safeTimestamp(event = {}, now = new Date()) {
	const raw = Date.parse(event.createdAt || event.committedAt || event.updatedAt || '')
	if (!Number.isFinite(raw)) return now.toISOString()
	const ageMs = now.getTime() - raw
	if (ageMs < -4 * 60 * 1000 || ageMs > 55 * 60 * 1000) return now.toISOString()
	return new Date(raw).toISOString()
}

export function formatDodoUsageEvent(event = {}, customer = {}, { now = new Date() } = {}) {
	if (!event.eventId) throw new Error('Usage event is missing eventId.')
	if (!customer.providerCustomerId) throw new Error('Billing customer is missing Dodo customer id.')
	return {
		event_id: event.eventId,
		customer_id: customer.providerCustomerId,
		event_name: usageEventName(),
		timestamp: safeTimestamp(event, now),
		metadata: metadataFrom(event),
	}
}

function retryDelayMs(attemptCount) {
	const base = Math.max(1000, Number(process.env.BETTERPPTX_DODO_USAGE_RETRY_BASE_MS || 30000))
	const max = Math.max(base, Number(process.env.BETTERPPTX_DODO_USAGE_RETRY_MAX_MS || 30 * 60 * 1000))
	const exp = base * (2 ** Math.min(8, Math.max(0, Number(attemptCount) || 0)))
	return Math.min(max, exp)
}

function dueForRetry(event = {}, nowMs = Date.now()) {
	if (!event.nextRetryAt) return true
	const due = Date.parse(event.nextRetryAt)
	return !Number.isFinite(due) || due <= nowMs
}

async function markBatchFailed(store, events, err) {
	const now = Date.now()
	const out = []
	for (const event of events) {
		const attempts = Math.max(0, Number(event.ingestAttemptCount) || 0) + 1
		const nextRetryAt = new Date(now + retryDelayMs(attempts)).toISOString()
		out.push(await store.markUsageEventFailed(event.eventId, {
			lastIngestErrorCode: err?.code || 'DODO_USAGE_INGEST_FAILED',
			lastIngestErrorMessage: String(err?.message || err).slice(0, 500),
			nextRetryAt,
		}))
	}
	return out
}

export async function flushQueuedUsageEvents({ store = createBillingLedgerStore(), limit = 100, ingest = ingestDodoUsageEvents, now = new Date() } = {}) {
	const max = Math.max(1, Math.min(MAX_DODO_BATCH, Number(limit) || 100))
	const queued = (await store.listQueuedUsageEvents({ limit: max * 2 })).filter(event => dueForRetry(event, now.getTime())).slice(0, max)
	if (!queued.length) return { ok: true, attempted: 0, ingested: 0, skipped: 0, failed: 0 }
	const formatted = []
	const sourceEvents = []
	const skipped = []
	for (const event of queued) {
		const customer = event.customerHash ? await store.getCustomer(event.customerHash) : null
		if (!customer?.providerCustomerId) {
			skipped.push(await store.markUsageEventFailed(event.eventId, {
				lastIngestErrorCode: 'DODO_CUSTOMER_ID_MISSING',
				lastIngestErrorMessage: 'Queued usage event has no linked Dodo customer id.',
				nextRetryAt: new Date(now.getTime() + retryDelayMs(event.ingestAttemptCount || 0)).toISOString(),
			}))
			continue
		}
		formatted.push(formatDodoUsageEvent(event, customer, { now }))
		sourceEvents.push(event)
	}
	if (!formatted.length) {
		return { ok: false, attempted: queued.length, ingested: 0, skipped: skipped.length, failed: queued.length, skippedEvents: skipped }
	}
	try {
		const response = await ingest(formatted)
		const marked = []
		for (const event of sourceEvents) {
			marked.push(await store.markUsageEventIngested(event.eventId, {
				providerIngestedAt: new Date().toISOString(),
				providerIngestedCount: response.ingestedCount,
			}))
		}
		return { ok: true, attempted: queued.length, ingested: marked.length, skipped: skipped.length, failed: 0, response, marked, skippedEvents: skipped }
	} catch (err) {
		const failed = await markBatchFailed(store, sourceEvents, err)
		return { ok: false, attempted: queued.length, ingested: 0, skipped: skipped.length, failed: failed.length, errorCode: err?.code || 'DODO_USAGE_INGEST_FAILED', failedEvents: failed, skippedEvents: skipped }
	}
}
