import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { createBillingLedgerStore, hashPayload } from '../billing/ledger-store.mjs'
import { BillingSecurityFirestore } from './fixtures/billing-security-firestore.mjs'

const runProcess = promisify(execFile)
const childFixture = fileURLToPath(new URL('./fixtures/billing-security-process.mjs', import.meta.url))

function fixture(t, provider) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-cumulative-security-'))
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
	process.env.BETTERPPTX_BILLING_LEDGER_STORE = provider
	process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
	process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(dir, 'ledger.json')
	process.env.BETTERPPTX_FIRESTORE_BILLING_COLLECTION_PREFIX = 'cumulative_fixture'
	const db = new BillingSecurityFirestore()
	return { store: createBillingLedgerStore({ firestoreClient: db }), db }
}

function request(totalCredits, orderId = 'order-a') {
	return {
		customerHash: 'alice', source: 'chain_transfer', sourceId: `base-usdc-order:${orderId}`, totalCredits,
		proofRef: { orderId, desiredCredits: totalCredits, transferSetHash: hashPayload({ fixture: orderId, totalCredits }), chainId: 8453, tokenContract: 'offline-usdc', finality: { verified: true, safeBlockHash: `offline-${totalCredits}` } },
	}
}

for (const provider of ['local', 'firestore']) {
	test(`${provider}: overlapping 10/20 observations mint 20 total in either order`, async t => {
		for (const totals of [[10, 20], [20, 10], [10, 20, 10, 20]]) {
			const { store } = fixture(t, provider)
			const results = await Promise.all(totals.map(total => store.creditCustomerCumulative(request(total))))
			assert.equal(results.reduce((sum, row) => sum + row.creditedCredits, 0), 20)
			assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 20)
			for (const total of [10, 20, 0]) {
				const replay = await store.creditCustomerCumulative(request(total))
				assert.equal(replay.creditedCredits, 0)
				assert.equal(replay.totalCredits, 20)
				assert.equal(replay.idempotent, true)
			}
		}
	})

	test(`${provider}: source owner and every cumulative proof field are immutable`, async t => {
		const { store } = fixture(t, provider)
		const original = request(10)
		const first = await store.creditCustomerCumulative(original)
		assert.equal(first.claim.proofDigest.length, 64)
		assert.equal(first.claim.claimDigest, hashPayload({ grantId: first.grant.grantId, customerHash: 'alice', totalUnits: 1000, proofDigest: first.claim.proofDigest }))
		const reordered = { ...original, proofRef: Object.fromEntries(Object.entries(original.proofRef).reverse()) }
		assert.equal((await store.creditCustomerCumulative(reordered)).idempotent, true)
		for (const proofRef of [
			{ ...original.proofRef, transferSetHash: 'changed' }, { ...original.proofRef, chainId: 1 },
			{ ...original.proofRef, tokenContract: 'another-token' }, { ...original.proofRef, finality: { verified: false, safeBlockHash: 'changed' } },
		]) await assert.rejects(store.creditCustomerCumulative({ ...original, proofRef }), { code: 'BILLING_IDEMPOTENCY_CONFLICT' })
		await assert.rejects(store.creditCustomerCumulative({ ...original, customerHash: 'bob' }), { code: 'BILLING_IDEMPOTENCY_CONFLICT' })
		await assert.rejects(store.creditCustomerCumulative({ ...request(20), proofRef: original.proofRef }), { code: 'BILLING_IDEMPOTENCY_CONFLICT' })
		assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 10)
	})

	test(`${provider}: the same proof cannot be replayed across orders or the ordinary credit API`, async t => {
		const { store } = fixture(t, provider)
		const original = request(10)
		await store.creditCustomerCumulative(original)
		await assert.rejects(store.creditCustomerCumulative({ ...original, sourceId: 'base-usdc-order:order-b' }), { code: 'BILLING_IDEMPOTENCY_CONFLICT' })
		await assert.rejects(store.creditCustomer({ ...original, amountCredits: 10, eventId: 'renamed-credit' }), { code: 'BILLING_CUMULATIVE_METHOD_REQUIRED' })
		await assert.rejects(store.creditCustomer({ ...request(30), amountCredits: 30, eventId: 'old-delta-caller' }), { code: 'BILLING_CUMULATIVE_METHOD_REQUIRED' })
		assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 10)
	})

	test(`${provider}: separate orders and lost order acknowledgments cannot cause double minting`, async t => {
		const { store } = fixture(t, provider)
		await store.creditCustomerCumulative(request(10, 'order-a'))
		await store.creditCustomerCumulative(request(20, 'order-b'))
		// Both external order acknowledgments were lost after the ledger committed.
		const replays = await Promise.all(['order-b', 'order-a', 'order-b'].map(id => store.creditCustomerCumulative(request(id === 'order-a' ? 10 : 20, id))))
		assert(replays.every(row => row.creditedUnits === 0))
		assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 30)
	})

	test(`${provider}: invalid totals and balance overflow leave no grant or claim`, async t => {
		const { store } = fixture(t, provider)
		for (const totalCredits of [NaN, Infinity, -1, 10.001, Number.MAX_VALUE, true, null, '']) {
			await assert.rejects(store.creditCustomerCumulative({ ...request(10), totalCredits }), { code: 'BILLING_AMOUNT_INVALID' })
		}
		await assert.rejects(store.creditCustomerCumulative({ ...request(10), proofRef: {} }), { code: 'BILLING_CREDIT_PROOF_MISSING' })
		await assert.rejects(store.creditCustomerCumulative({ ...request(10), proofRef: { blockNumber: Infinity } }), { code: 'BILLING_CREDIT_PROOF_INVALID' })
		await store.upsertCustomer('alice', { availableBalanceUnits: 9007199254740900 })
		await assert.rejects(store.creditCustomerCumulative(request(10)), { code: 'BILLING_AMOUNT_INVALID' })
		assert.equal((await store.getCustomer('alice')).availableBalanceUnits, 9007199254740900)
	})

	test(`${provider}: historical watcher deltas freeze before any cumulative migration credit`, async t => {
		const { store } = fixture(t, provider)
		await store.creditCustomer({ customerHash: 'alice', source: 'chain_transfer', amountCredits: 10, eventId: 'legacy-10', proofRef: { orderId: 'order-a', desiredCredits: 10, transferSetHash: 'legacy-receipt-a' } })
		await store.creditCustomer({ customerHash: 'alice', source: 'chain_transfer', amountCredits: 20, eventId: 'legacy-20', proofRef: { orderId: 'order-a', desiredCredits: 20, transferSetHash: 'legacy-receipt-b' } })
		await assert.rejects(store.creditCustomerCumulative(request(20)), { code: 'BILLING_CUMULATIVE_LEGACY_RECONCILIATION_REQUIRED' })
		assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 30)
	})
}

test('firestore: forced overlap retries target, customer, claim and proof together', async t => {
	const { store, db } = fixture(t, 'firestore')
	db.beforeCommit = () => store.creditCustomerCumulative(request(20))
	const delayed = await store.creditCustomerCumulative(request(10))
	assert(db.retries > 0)
	assert.equal(delayed.creditedCredits, 0)
	assert.equal(delayed.totalCredits, 20)
	assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 20)
})

test('firestore: failed cumulative transaction leaves no partial source target', async t => {
	const { store, db } = fixture(t, 'firestore')
	db.failCommit = true
	await assert.rejects(store.creditCustomerCumulative(request(20)), { code: 'UNAVAILABLE' })
	assert.equal(db.rows.size, 0)
	db.failCommit = false
	assert.equal((await store.creditCustomerCumulative(request(20))).creditedCredits, 20)
	assert.equal((await store.creditCustomerCumulative(request(20))).creditedCredits, 0)
})

test('firestore: a new worker with rolled-back local order state honors the shared grant', async t => {
	const { store, db } = fixture(t, 'firestore')
	await store.creditCustomerCumulative(request(200))
	const restartedWorker = createBillingLedgerStore({ firestoreClient: db })
	const staleOrderState = { creditedCredits: 0, desiredCredits: 200 }
	const result = await restartedWorker.creditCustomerCumulative(request(staleOrderState.desiredCredits))
	assert.equal(restartedWorker.shared, true)
	assert.equal(result.creditedCredits, 0)
	assert.equal(result.totalCredits, 200)
	assert.equal((await restartedWorker.getCustomer('alice')).availableBalanceCredits, 200)
})

test('firestore: missing shared grant or permanent event fails closed', async t => {
	for (const remove of ['grant', 'event']) {
		const { store, db } = fixture(t, 'firestore')
		const first = await store.creditCustomerCumulative(request(10))
		db.rows.delete(remove === 'grant' ? `cumulative_fixture_credit_grants/${first.grant.grantId}` : `cumulative_fixture_credit_events/${first.creditEvent.eventId}`)
		await assert.rejects(store.creditCustomerCumulative(request(20)), { code: 'BILLING_CREDIT_HISTORY_MISSING' })
		assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 10)
	}
})

for (const crash of ['cumulative-crash-before-rename', 'cumulative-crash-after-rename']) {
	test(`local: ${crash} cannot double mint either order after a fresh-process replay`, async t => {
		const { store } = fixture(t, 'local')
		await store.creditCustomerCumulative(request(10, 'order-a'))
		await store.creditCustomerCumulative(request(7, 'order-b'))
		const invoke = async (action, input) => {
			const result = await runProcess(process.execPath, [childFixture, store.file, action, JSON.stringify(input)], {
				env: { SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows' }, timeout: 10000, windowsHide: true,
			})
			return JSON.parse(result.stdout)
		}
		await assert.rejects(invoke(crash, request(20, 'order-a')), error => error.code === 86)
		assert.equal((await store.getCustomer('alice')).availableBalanceCredits, crash.endsWith('before-rename') ? 17 : 27)
		await assert.rejects(store.creditCustomerCumulative(request(20)), { code: 'BILLING_LEDGER_LOCKED' })
		// Explicit fixture-only recovery after confirming the writer terminated.
		fs.unlinkSync(`${store.file}.lock`)
		const orderA = await invoke('cumulative-replay', request(20, 'order-a'))
		const orderB = await invoke('cumulative-replay', request(7, 'order-b'))
		assert.equal(orderA.creditedCredits, crash.endsWith('before-rename') ? 10 : 0)
		assert.equal(orderB.creditedCredits, 0)
		assert.equal((await invoke('cumulative-replay', request(20, 'order-a'))).creditedCredits, 0)
		assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 27)
	})
}

test('local: version-one ledger migration preserves unrelated credit history', async t => {
	const { store } = fixture(t, 'local')
	await store.creditCustomer({ customerHash: 'alice', source: 'x402_settlement', amountCredits: 3, proofRef: { settlementId: 'pre-cumulative-fixture' } })
	const old = store.load()
	old.version = 1
	delete old.creditGrants
	delete old.creditGrantClaims
	delete old.integrityHash
	fs.writeFileSync(store.file, JSON.stringify({ ...old, integrityHash: hashPayload(old) }))
	await store.creditCustomerCumulative(request(10))
	assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 13)
	assert.equal(store.load().version, 2)
})
