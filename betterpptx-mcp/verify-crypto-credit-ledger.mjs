import * as fs from 'node:fs'
import * as path from 'node:path'

import {
	BillingLedgerError,
	createBillingLedgerStore,
	hashCustomerId,
} from './billing/ledger-store.mjs'
import {
	effectiveBalanceSnapshot,
	finalizeBillingReservation,
	preflightBillingReservation,
	reserveCredits,
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
	process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(verifyDir, 'crypto-credit-ledger.json')
	try { fs.rmSync(process.env.BETTERPPTX_BILLING_LEDGER_FILE, { force: true }) } catch {}
}
process.env.BETTERPPTX_BILLING_PROVIDER = 'crypto_credits'
process.env.BETTERPPTX_BILLING_DRY_RUN = '0'
process.env.BETTERPPTX_BILLING_ENFORCE = '1'

const store = createBillingLedgerStore()
const runId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
const customerHash = hashCustomerId(`install_verify_${runId}`)

const credited = await store.creditCustomer({
	customerHash,
	source: 'x402_settlement',
	amountCredits: 25,
	proofRef: {
		settlementId: `settle_${runId}`,
		chainId: 8453,
		token: 'USDC',
	},
	metadata: {
		rawToken: 'never-store-this-device-token',
		route: 'verify-crypto-credit-ledger',
	},
})
expect(credited.idempotent === false, 'First crypto credit should mint once.', { credited })

let customer = await store.getCustomer(customerHash)
let balance = effectiveBalanceSnapshot(customer)
expect(balance.availableBalanceCredits === 25, 'Provider-neutral balance should reflect minted credits.', { balance, customer })
expect(balance.lastKnownProviderAvailableCredits === 25, 'Provider balance alias should stay synchronized.', { balance, customer })
expect(balance.effectiveAvailableCredits === 25, 'Effective balance should equal minted credits before reservations.', { balance })

const replay = await store.creditCustomer({
	customerHash,
	source: 'x402_settlement',
	amountCredits: 25,
	proofRef: {
		settlementId: `settle_${runId}`,
		chainId: 8453,
		token: 'USDC',
	},
})
expect(replay.idempotent === true, 'Same settlement proof should replay idempotently.', { replay })
customer = await store.getCustomer(customerHash)
balance = effectiveBalanceSnapshot(customer)
expect(balance.availableBalanceCredits === 25, 'Idempotent credit replay must not double-credit.', { balance })

await expectBillingError('BILLING_IDEMPOTENCY_CONFLICT', () => store.creditCustomer({
	customerHash,
	source: 'x402_settlement',
	amountCredits: 26,
	proofRef: {
		settlementId: `settle_${runId}`,
		chainId: 8453,
		token: 'USDC',
	},
}))

await expectBillingError('BILLING_CREDIT_SOURCE_FORBIDDEN', () => store.creditCustomer({
	customerHash,
	source: 'free_grant',
	amountCredits: 5,
	proofRef: { reason: 'verify-forbidden-source' },
}))

const reserved = await reserveCredits({
	store,
	customerHash,
	sessionHash: `session_${runId}`,
	deckHash: `deck_${runId}`,
	operationId: `op_direct_${runId}`,
	mode: 'checkpoint',
	amountCredits: 5,
	metadata: { source: 'verify-direct-reserve' },
})
expect(reserved.active !== false && reserved.reservation.state === 'reserved', 'Direct crypto-funded reservation should reserve.', { reserved })

customer = await store.getCustomer(customerHash)
balance = effectiveBalanceSnapshot(customer)
expect(balance.pendingReservedCredits === 5, 'Pending reserved credits should reflect direct reservation.', { balance })
expect(balance.effectiveAvailableCredits === 20, 'Effective balance should subtract pending reservation.', { balance })

const fakeDeckEntry = {
	pptx: {
		slides: [
			{ _slideObjects: [{ type: 'text' }, { type: 'shape' }] },
		],
	},
}
const gate = await preflightBillingReservation({
	name: 'betterpptx.deck.save',
	args: { deckId: `deck_gate_${runId}`, idempotencyKey: `save_${runId}` },
	context: { sessionId: `session_gate_${runId}` },
	entry: fakeDeckEntry,
	billingEntitlement: {
		provider: 'crypto_credits',
		billingCustomerHash: customerHash,
		billingStatus: 'active',
	},
	store,
})
expect(gate.active === true && gate.amountCredits > 0, 'crypto_credits provider should enforce reservation without a provider customer id.', { gate })

const finalized = await finalizeBillingReservation({
	gate,
	name: 'betterpptx.deck.save',
	args: { deckId: `deck_gate_${runId}`, idempotencyKey: `save_${runId}` },
	result: { bytes: 32 * 1024, slideCount: 1, downloadName: 'verify.pptx', artifact: { state: 'saved' } },
	store,
})
expect(finalized.reservation.state === 'committed', 'Finalized crypto reservation should commit.', { finalized })

await expectBillingError('INSUFFICIENT_CREDITS', () => reserveCredits({
	store,
	customerHash,
	sessionHash: `session_${runId}`,
	deckHash: `deck_${runId}`,
	operationId: `op_too_large_${runId}`,
	mode: 'checkpoint',
	amountCredits: 1000,
}))

if (!wantFirestore) {
	const text = fs.readFileSync(process.env.BETTERPPTX_BILLING_LEDGER_FILE, 'utf8')
	expect(!text.includes('never-store-this-device-token'), 'Credit ledger persisted a raw token-like field.', {})
}

console.log(`CRYPTO CREDIT LEDGER: PASS provider=${store.provider} customer=${customerHash} balance=${(await store.getCustomer(customerHash)).effectiveAvailableCredits}`)
