import assert from 'node:assert'

import {
	assertProductionSharedStores,
	SHARED_STORE_BOOT_PROBE_QUOTE_ID,
	SharedStoreProbeError,
} from './billing/shared-store-probe.mjs'

let lastProbeId = null
const sharedQuoteStore = { shared: true, async getQuote(id) { lastProbeId = id; return null } }
const sharedLedger = { shared: true }

async function expectFail(code, options) {
	try {
		await assertProductionSharedStores(options)
		assert.fail(`expected SharedStoreProbeError ${code} but probe passed`)
	} catch (error) {
		assert.ok(error instanceof SharedStoreProbeError, `expected SharedStoreProbeError, got ${error?.name}`)
		assert.ok(String(error.code).startsWith(code), `expected code ${code}, got ${error.code}`)
	}
}

// Happy path: shared quote + shared ledger + shared (firestore) relayer lease under self-settle.
process.env.BETTERPPTX_X402_SETTLEMENT_MODE = 'self_settle'
process.env.BETTERPPTX_X402_RELAYER_LEASE_STORE = 'firestore'
const ok = await assertProductionSharedStores({ x402QuoteStore: sharedQuoteStore, ledgerStore: sharedLedger })
assert.deepEqual(ok, { ok: true }, 'all-shared + reachable passes')
assert.equal(lastProbeId, SHARED_STORE_BOOT_PROBE_QUOTE_ID, 'boot probe uses exported id')
assert.ok(!/^__.*__$/.test(SHARED_STORE_BOOT_PROBE_QUOTE_ID), 'boot probe id must not use Firestore reserved __...__ pattern')

// Fail: quote store not shared.
await expectFail('x402-quote-store-not-shared', { x402QuoteStore: { shared: false, async getQuote() { return null } }, ledgerStore: sharedLedger })

// Fail: ledger not shared.
await expectFail('billing-ledger-not-shared', { x402QuoteStore: sharedQuoteStore, ledgerStore: { shared: false } })

// Fail: relayer lease local under self-settle.
process.env.BETTERPPTX_X402_RELAYER_LEASE_STORE = 'local'
await expectFail('relayer-lease-not-shared', { x402QuoteStore: sharedQuoteStore, ledgerStore: sharedLedger })
process.env.BETTERPPTX_X402_RELAYER_LEASE_STORE = 'firestore'

// Pass: facilitator mode does not require a shared relayer lease.
process.env.BETTERPPTX_X402_SETTLEMENT_MODE = 'cdp_facilitator'
process.env.BETTERPPTX_X402_RELAYER_LEASE_STORE = 'local'
const facilitatorOk = await assertProductionSharedStores({ x402QuoteStore: sharedQuoteStore, ledgerStore: sharedLedger })
assert.deepEqual(facilitatorOk, { ok: true }, 'facilitator mode does not require shared relayer lease')
process.env.BETTERPPTX_X402_SETTLEMENT_MODE = 'self_settle'
process.env.BETTERPPTX_X402_RELAYER_LEASE_STORE = 'firestore'

// Fail: store unreachable (getQuote rejects).
await expectFail('store-unreachable', {
	x402QuoteStore: { shared: true, async getQuote() { throw new Error('ECONNREFUSED') } },
	ledgerStore: sharedLedger,
})

// Fail: store hangs -> timeout (bounded by a small probe timeout).
await expectFail('store-unreachable:timeout', {
	x402QuoteStore: { shared: true, getQuote() { return new Promise(() => {}) } },
	ledgerStore: sharedLedger,
	probeTimeoutMs: 50,
})

console.log('SHARED STORE PROBE: PASS happy=1 quoteUnshared=1 ledgerUnshared=1 leaseUnshared=1 facilitatorOk=1 unreachable=1 timeout=1')
