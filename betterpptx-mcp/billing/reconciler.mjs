import { createBillingLedgerStore } from './ledger-store.mjs'
import { flushQueuedUsageEvents } from './usage-events.mjs'

export async function runBillingUsageReconciler({ store = createBillingLedgerStore(), limit = 100, ingest = undefined } = {}) {
	return flushQueuedUsageEvents({
		store,
		limit,
		...(ingest ? { ingest } : {}),
	})
}

