import { createBillingLedgerStore } from './ledger-store.mjs'
import { flushQueuedUsageEvents } from './usage-events.mjs'

export async function runBillingUsageReconciler({ store = createBillingLedgerStore(), limit = 100, settle = undefined, now = new Date() } = {}) {
	return flushQueuedUsageEvents({
		store,
		limit,
		now,
		...(settle ? { settle } : {}),
	})
}
