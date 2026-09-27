import { createBillingLedgerStore } from './ledger-store.mjs'
import { relayerLeaseProviderName } from './relayer-lease.mjs'

// Production shared-store boot gate (plan 24A.12 / 31.4). Run before the HTTP
// server listens in public black-box mode with shared stores required. Asserts
// the quote/relayer-lease stores are truly shared and that the quote store is
// actually reachable (a real read, not an environment-string check). The
// legacy credit ledger is checked only in compatibility mode; accountless
// pay-per-job mode must not require or instantiate a customer-balance store.

export class SharedStoreProbeError extends Error {
	constructor(code, message) {
		super(message)
		this.name = 'SharedStoreProbeError'
		this.code = code
	}
}

export const SHARED_STORE_BOOT_PROBE_QUOTE_ID = 'betterpptx_boot_probe'

function withTimeout(value, ms, label) {
	return Promise.race([
		Promise.resolve().then(() => value),
		new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout:${label}`)), ms)),
	])
}

export async function assertProductionSharedStores({
	x402QuoteStore,
	ledgerStore = null,
	probeTimeoutMs = 8000,
} = {}) {
	if (x402QuoteStore?.shared !== true) {
		throw new SharedStoreProbeError('x402-quote-store-not-shared', 'x402 quote store is not shared.')
	}
	const payPerJob = String(process.env.BETTERPPTX_BILLING_MODEL || '').trim().toLowerCase() === 'pay_per_job'
	if (!payPerJob) {
		const ledger = ledgerStore || createBillingLedgerStore()
		if (ledger?.shared !== true) {
			throw new SharedStoreProbeError('billing-ledger-not-shared', 'Billing ledger store is not shared.')
		}
	}
	const selfSettle = String(process.env.BETTERPPTX_X402_SETTLEMENT_MODE || 'self_settle').trim().toLowerCase() === 'self_settle'
	if (selfSettle && relayerLeaseProviderName() !== 'firestore') {
		throw new SharedStoreProbeError('relayer-lease-not-shared', 'Relayer broadcast lease is not shared.')
	}
	try {
		await withTimeout(x402QuoteStore.getQuote(SHARED_STORE_BOOT_PROBE_QUOTE_ID), probeTimeoutMs, 'x402-quote-read')
	} catch (error) {
		throw new SharedStoreProbeError(`store-unreachable:${error?.message || 'unknown'}`, 'Shared store is not reachable.')
	}
	return { ok: true }
}
