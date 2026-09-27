import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import fsMutable from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createBillingLedgerStore, toCreditUnits, fromCreditUnits } from '../billing/ledger-store.mjs'
import { flushQueuedUsageEvents } from '../billing/usage-events.mjs'
import { runBillingUsageReconciler } from '../billing/reconciler.mjs'
import { BillingSecurityFirestore } from './fixtures/billing-security-firestore.mjs'

const runProcess = promisify(execFile)
const childFixture = fileURLToPath(new URL('./fixtures/billing-security-process.mjs', import.meta.url))
const offlinePreload = new URL('./fixtures/billing-security-offline.mjs', import.meta.url).href
const childEnvironment = { SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows' }

async function child(file, action, id) {
	const { stdout } = await runProcess(process.execPath, [childFixture, file, action, ...(id ? [id] : [])], { env: childEnvironment, timeout: 10000, windowsHide: true })
	return JSON.parse(stdout)
}

// No credentials, environment files, remote providers, or network clients are used.
function fixture(t, provider = 'local') {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-ledger-security-'))
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
	process.env.BETTERPPTX_BILLING_LEDGER_STORE = provider
	process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
	process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(dir, 'ledger.json')
	process.env.BETTERPPTX_FIRESTORE_BILLING_COLLECTION_PREFIX = 'billing_security_fixture'
	const db = new BillingSecurityFirestore()
	const store = createBillingLedgerStore({ firestoreClient: db })
	return { store, db, dir }
}

async function fund(store, amountCredits = 10) {
	return store.creditCustomer({ customerHash: 'alice', eventId: 'fund', source: 'x402_settlement', amountCredits, proofRef: { settlementId: 'offline-receipt' } })
}

async function reserve(store, id = 'reservation', amountCredits = 2) {
	return store.createReservation({ customerHash: 'alice', reservationId: id, operationId: `op_${id}`, amountCredits })
}

async function commit(store, id = 'reservation', eventId = 'usage') {
	return store.commitReservation({ reservationId: id, usageEvent: { eventId, operationId: `op_${id}` } })
}

test('credit arithmetic rejects non-finite, unsafe and coercible non-money values', () => {
	for (const value of [NaN, Infinity, -Infinity, -1, Number.MAX_VALUE, null, true, [], {}, '']) {
		assert.throws(() => toCreditUnits(value), { code: 'BILLING_AMOUNT_INVALID' }, String(value))
	}
	for (const units of [NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, -1, 1.1, '9007199254740991.1', '9007199254740990.9', '1e-1000']) {
		assert.throws(() => fromCreditUnits(units), { code: 'BILLING_AMOUNT_INVALID' })
	}
	assert.equal(toCreditUnits('1.005'), 101)
	assert.equal(toCreditUnits('0.29'), 29)
})

for (const provider of ['local', 'firestore']) {
	test(`${provider}: invalid and overflowing amounts cannot poison money or replay history`, async t => {
		const { store } = fixture(t, provider)
		await fund(store)
		for (const amountUnits of [NaN, Infinity, -1, 1.25, Number.MAX_SAFE_INTEGER + 1]) {
			await assert.rejects(store.creditCustomer({ customerHash: 'alice', eventId: 'invalid', source: 'payram_settlement', amountUnits, proofRef: { referenceId: 'offline' } }), { code: 'BILLING_AMOUNT_INVALID' })
		}
		await assert.rejects(store.creditCustomer({ customerHash: 'alice', eventId: 'overflow', source: 'payram_settlement', amountUnits: Number.MAX_SAFE_INTEGER, proofRef: { referenceId: 'offline' } }), { code: 'BILLING_AMOUNT_INVALID' })
		await assert.rejects(store.upsertCustomer('new', { availableBalanceUnits: Infinity }), { code: 'BILLING_AMOUNT_INVALID' })
		await reserve(store)
		await assert.rejects(store.commitReservation({ reservationId: 'reservation', amountUnits: Infinity }), { code: 'BILLING_AMOUNT_INVALID' })
		await assert.rejects(store.commitReservation({ reservationId: 'reservation', amountUnits: 100, amountCredits: 2 }), { code: 'BILLING_AMOUNT_CONFLICT' })
		assert.equal((await store.getReservation('reservation')).state, 'reserved')
		assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 10)
	})

	test(`${provider}: a proof cannot mint twice by changing event id or customer`, async t => {
		const { store } = fixture(t, provider)
		await fund(store)
		const credit = { customerHash: 'alice', eventId: 'renamed', source: 'x402_settlement', amountCredits: 10, proofRef: { settlementId: 'offline-receipt' } }
		assert.equal((await store.creditCustomer(credit)).idempotent, true)
		await assert.rejects(store.creditCustomer({ ...credit, customerHash: 'bob' }), { code: 'BILLING_IDEMPOTENCY_CONFLICT' })
		await assert.rejects(store.creditCustomer({ ...credit, idempotencyKey: 'changed' }), { code: 'BILLING_IDEMPOTENCY_CONFLICT' })
		assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 10)
	})

	test(`${provider}: stale customer snapshots cannot restore settled credit`, async t => {
		const { store } = fixture(t, provider)
		await fund(store)
		const stale = await store.getCustomer('alice')
		await reserve(store)
		await commit(store)
		await flushQueuedUsageEvents({ store })
		await assert.rejects(store.upsertCustomer('alice', stale), { code: 'BILLING_CUSTOMER_BALANCE_PATCH_FORBIDDEN' })
		await store.upsertCustomer('alice', { billingStatus: 'active' })
		assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 8)
	})

	test(`${provider}: concurrent reserve, commit and release conserve credit`, async t => {
		const { store } = fixture(t, provider)
		await fund(store, 5)
		const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => reserve(store, `r${i}`, 1)))
		const accepted = results.filter(row => row.status === 'fulfilled').map(row => row.value.reservation)
		assert.equal(accepted.length, 5)
		assert(results.filter(row => row.status === 'rejected').every(row => row.reason.code === 'INSUFFICIENT_CREDITS'))
		for (const reservation of accepted) {
			const id = reservation.reservationId
			await Promise.allSettled([commit(store, id, `usage_${id}`), store.releaseReservation({ reservationId: id }), store.releaseReservation({ reservationId: id })])
		}
		await Promise.all([flushQueuedUsageEvents({ store }), flushQueuedUsageEvents({ store })])
		const customer = await store.getCustomer('alice')
		const states = await Promise.all(accepted.map(row => store.getReservation(row.reservationId)))
		assert.equal(customer.pendingReservedUnits, 0)
		assert.equal(customer.queuedUsageUnits, 0)
		assert.equal(customer.availableBalanceCredits, 5 - states.filter(row => row.state === 'committed').length)
	})

	test(`${provider}: usage identities and terminal states cannot be patched or forged`, async t => {
		const { store } = fixture(t, provider)
		await fund(store)
		await reserve(store)
		await commit(store)
		for (const patch of [{ amountUnits: 1 }, { customerHash: 'bob' }, { state: 'queued' }, { reservationId: 'other' }]) {
			await assert.rejects(store.markUsageEventIngested('usage', patch), { code: 'BILLING_USAGE_PATCH_FORBIDDEN' })
			await assert.rejects(store.markUsageEventFailed('usage', patch), { code: 'BILLING_USAGE_PATCH_FORBIDDEN' })
		}
		await assert.rejects(store.upsertUsageEvent({ eventId: 'forged', customerHash: 'alice', reservationId: 'reservation', amountCredits: 2 }), { code: 'BILLING_USAGE_BINDING_INVALID' })
		await assert.rejects(store.upsertUsageEvent({ eventId: 'forged', customerHash: 'alice', amountCredits: 2, state: 'ingested' }), { code: 'BILLING_USAGE_STATE_INVALID' })
		await assert.rejects(store.markUsageEventIngested('usage', {}, { settleFromAvailableBalance: false }), { code: 'BILLING_SETTLEMENT_DEBIT_REQUIRED' })
		await flushQueuedUsageEvents({ store })
		assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 8)
	})

	test(`${provider}: permanent event history cannot be given expiry or refund state`, async t => {
		const { store } = fixture(t, provider)
		await fund(store)
		for (const expires of ['expiresAt', 'expireAt', 'ttl', 'deleteAfter']) {
			await assert.rejects(store.creditCustomer({ customerHash: 'alice', source: 'owner_goodwill', amountCredits: 2, idempotencyKey: 'expiring', [expires]: '2099-01-01' }), { code: 'BILLING_EVENT_EXPIRY_FORBIDDEN' })
			await assert.rejects(store.upsertUsageEvent({ customerHash: 'alice', eventId: 'expiring', amountCredits: 2, [expires]: '2099-01-01' }), { code: 'BILLING_EVENT_EXPIRY_FORBIDDEN' })
		}
		await assert.rejects(store.creditCustomer({ customerHash: 'alice', source: 'owner_goodwill', amountCredits: 2, idempotencyKey: 'fake-refund', state: 'refunded' }), { code: 'BILLING_CREDIT_STATE_INVALID' })
		assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 10)
	})

	test(`${provider}: every commit creates a durable usage event even without an event body`, async t => {
		const { store } = fixture(t, provider)
		await fund(store)
		await reserve(store)
		const committed = await store.commitReservation({ reservationId: 'reservation', amountCredits: 1 })
		assert(committed.reservation.usageEventId)
		assert.equal((await store.commitReservation({ reservationId: 'reservation' })).idempotent, true)
		await flushQueuedUsageEvents({ store })
		assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 9)
	})

	test(`${provider}: unknown execution keeps the hold and late markers cannot undo completion`, async t => {
		const { store } = fixture(t, provider)
		await fund(store)
		await reserve(store)
		const uncertain = await store.markReservationUncertain({ reservationId: 'reservation', reason: 'TEST_TIMEOUT' })
		assert.equal(uncertain.reservation.state, 'reserved')
		assert.equal(uncertain.reservation.executionStatus, 'outcome_unknown')
		assert.equal(uncertain.customer.pendingReservedCredits, 2)
		assert.equal((await reserve(store)).idempotent, true)
		await runBillingUsageReconciler({ store, now: new Date('2099-01-01') })
		assert.equal((await store.getCustomer('alice')).pendingReservedCredits, 2)
		await commit(store)
		const late = await store.markReservationUncertain({ reservationId: 'reservation' })
		assert.equal(late.idempotent, true)
		assert.equal(late.reservation.state, 'committed')
		assert.equal(late.reservation.executionStatus, 'completed')
	})

	test(`${provider}: a late failed attempt cannot reopen a settled debit`, async t => {
		const { store } = fixture(t, provider)
		await fund(store)
		await reserve(store)
		await commit(store)
		await flushQueuedUsageEvents({ store })
		await store.markUsageEventFailed('usage', { lastIngestErrorCode: 'LATE_TIMEOUT' })
		await flushQueuedUsageEvents({ store, now: new Date('2099-01-01') })
		assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 8)
		assert.deepEqual(await store.listQueuedUsageEvents(), [])
	})

	test(`${provider}: two reservations cannot consume the same usage event identity`, async t => {
		const { store } = fixture(t, provider)
		await fund(store)
		await reserve(store, 'first')
		await reserve(store, 'second')
		await commit(store, 'first', 'shared')
		await assert.rejects(commit(store, 'second', 'shared'), { code: 'BILLING_IDEMPOTENCY_CONFLICT' })
		assert.equal((await store.getReservation('second')).state, 'reserved')
		assert.equal((await store.getCustomer('alice')).pendingReservedCredits, 2)
	})

	test(`${provider}: conflicting usage cannot leave a rejected commit applied`, async t => {
		const { store } = fixture(t, provider)
		await fund(store)
		await reserve(store, 'first', 1)
		await reserve(store, 'second', 2)
		await commit(store, 'first', 'shared')
		await assert.rejects(commit(store, 'second', 'shared'), { code: 'BILLING_IDEMPOTENCY_CONFLICT' })
		assert.equal((await store.getReservation('second')).state, 'reserved')
		assert.equal((await store.getCustomer('alice')).queuedUsageCredits, 1)
	})

	test(`${provider}: commit replay rejects a different event identity`, async t => {
		const { store } = fixture(t, provider)
		await fund(store)
		await reserve(store)
		await commit(store)
		await assert.rejects(commit(store, 'reservation', 'different'), { code: 'BILLING_IDEMPOTENCY_CONFLICT' })
	})

	test(`${provider}: default settlement debits permanently and is replay safe`, async t => {
		const { store } = fixture(t, provider)
		await fund(store)
		await reserve(store)
		await commit(store)
		await store.markUsageEventIngested('usage')
		await store.markUsageEventIngested('usage')
		assert.equal((await store.getCustomer('alice')).effectiveAvailableCredits, 8)
	})

	test(`${provider}: partial commit refunds only the unused cap, once`, async t => {
		const { store } = fixture(t, provider)
		await fund(store)
		await reserve(store, 'reservation', 5)
		const result = await store.commitReservation({ reservationId: 'reservation', amountCredits: 2, usageEvent: { eventId: 'usage' } })
		assert.equal(result.reservation.releasedAmountCredits, 3)
		await store.commitReservation({ reservationId: 'reservation', amountCredits: 2, usageEvent: { eventId: 'usage' } })
		await store.releaseReservation({ reservationId: 'reservation', reason: 'duplicate-refund' })
		await flushQueuedUsageEvents({ store })
		assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 8)
		assert.equal((await store.getCustomer('alice')).pendingReservedCredits, 0)
	})
}

test('local: malformed storage fails closed without resetting replay history', async t => {
	const { store } = fixture(t)
	await fund(store)
	fs.writeFileSync(store.file, '{truncated')
	await assert.rejects(fund(store), { code: 'BILLING_LEDGER_CORRUPT' })
	assert.equal(fs.readFileSync(store.file, 'utf8'), '{truncated')
})

test('firestore: metadata update retries around a concurrent debit', async t => {
	const { store, db } = fixture(t, 'firestore')
	await fund(store)
	await reserve(store)
	await commit(store)
	db.beforeCommit = () => store.markUsageEventIngested('usage')
	await store.upsertCustomer('alice', { billingStatus: 'active' })
	assert(db.retries > 0)
	assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 8)
})

test('firestore: failure marker retries around a concurrent successful settlement', async t => {
	const { store, db } = fixture(t, 'firestore')
	await fund(store)
	await reserve(store)
	await commit(store)
	db.beforeCommit = () => store.markUsageEventIngested('usage')
	const result = await store.markUsageEventFailed('usage', { lastIngestErrorCode: 'TIMEOUT' })
	assert(db.retries > 0)
	assert.equal(result.usageEvent.state, 'ingested')
	assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 8)
})

test('firestore: late uncertainty marker retries without undoing a concurrent commit', async t => {
	const { store, db } = fixture(t, 'firestore')
	await fund(store)
	await reserve(store)
	db.beforeCommit = () => commit(store)
	const result = await store.markReservationUncertain({ reservationId: 'reservation', reason: 'TIMEOUT' })
	assert(db.retries > 0)
	assert.equal(result.reservation.state, 'committed')
	assert.equal(result.reservation.executionStatus, 'completed')
	assert.equal((await store.getCustomer('alice')).queuedUsageCredits, 2)
})

test('firestore: rejected transaction publishes neither debit nor event state', async t => {
	const { store, db } = fixture(t, 'firestore')
	await fund(store)
	await reserve(store)
	await commit(store)
	db.failCommit = true
	await assert.rejects(store.markUsageEventIngested('usage'), { code: 'UNAVAILABLE' })
	db.failCommit = false
	assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 10)
	assert.equal((await store.listQueuedUsageEvents()).length, 1)
	await flushQueuedUsageEvents({ store })
	assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 8)
})

test('local: failed replacement preserves the last complete ledger and retry state', async t => {
	const { store } = fixture(t)
	await fund(store)
	await reserve(store)
	const before = fs.readFileSync(store.file, 'utf8')
	const original = fsMutable.renameSync
	const mocked = t.mock.method(fsMutable, 'renameSync', (source, target) => {
		if (target === store.file) throw Object.assign(new Error('Injected offline disk failure'), { code: 'EIO' })
		return original(source, target)
	})
	syncBuiltinESMExports()
	try { await assert.rejects(commit(store), { code: 'EIO' }) }
	finally { mocked.mock.restore(); syncBuiltinESMExports() }
	assert.equal(fs.readFileSync(store.file, 'utf8'), before)
	assert.equal((await store.getReservation('reservation')).state, 'reserved')
	await commit(store)
	await flushQueuedUsageEvents({ store })
	assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 8)
})

test('local: deletion, missing history and valid-JSON alteration fail closed', async t => {
	for (const change of [text => '{}', text => text.replace('"amountUnits": 1000', '"amountUnits": 9999'), () => null]) {
		const { store } = fixture(t)
		await fund(store)
		const changed = change(fs.readFileSync(store.file, 'utf8'))
		if (changed === null) fs.unlinkSync(store.file)
		else fs.writeFileSync(store.file, changed)
		await assert.rejects(fund(store), { code: 'BILLING_LEDGER_CORRUPT' })
	}
})

test('local: detached snapshots cannot mutate cached money or overwrite newer debits', async t => {
	const { store } = fixture(t)
	await fund(store)
	const stale = store.load()
	stale.customers.alice.availableBalanceUnits = 999999
	assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 10)
	await assert.rejects(store.save(stale), { code: 'BILLING_LEDGER_DIRECT_WRITE_FORBIDDEN' })
	const earlier = store.load()
	await reserve(store)
	await commit(store)
	await flushQueuedUsageEvents({ store })
	await assert.rejects(store.save(earlier), { code: 'BILLING_LEDGER_STALE_SNAPSHOT' })
})

test('local: separate processes cannot lose reservations or overspend', async t => {
	const { store } = fixture(t)
	await fund(store, 3)
	const results = await Promise.all(Array.from({ length: 8 }, (_, i) => child(store.file, 'reserve', `child_${i}`)))
	assert(results.every(row => row.ok || ['BILLING_LEDGER_LOCKED', 'INSUFFICIENT_CREDITS'].includes(row.code)))
	const successes = results.filter(row => row.ok).length
	assert(successes > 0 && successes <= 3)
	assert.equal((await store.getCustomer('alice')).pendingReservedCredits, successes)
	assert.equal((await store.getCustomer('alice')).effectiveAvailableCredits, 3 - successes)
})

for (const crash of ['crash-before-rename', 'crash-after-rename']) {
	test(`local: ${crash} leaves complete history and never causes a second debit`, async t => {
		const { store } = fixture(t)
		await fund(store)
		await reserve(store)
		await commit(store)
		await assert.rejects(child(store.file, crash), err => err.code === 86)
		const recovered = await child(store.file, 'read')
		assert.equal(recovered.customer.availableBalanceCredits, crash === 'crash-before-rename' ? 10 : 8)
		await assert.rejects(store.markUsageEventIngested('usage'), { code: 'BILLING_LEDGER_LOCKED' })
		// Explicit fixture recovery after inspecting the stopped writer's state.
		fs.unlinkSync(`${store.file}.lock`)
		await store.markUsageEventIngested('usage')
		await store.markUsageEventIngested('usage')
		assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 8)
	})
}

test('local: deleting an initialized ledger stays blocked in a fresh process', async t => {
	const { store } = fixture(t)
	await fund(store)
	fs.unlinkSync(store.file)
	assert.equal((await child(store.file, 'read')).code, 'BILLING_LEDGER_CORRUPT')
})

test('firestore: unavailable or missing permanent records cannot authorize partial settlement', async t => {
	for (const corrupt of ['customer', 'reservation', 'balance', 'queue']) {
		const { store, db } = fixture(t, 'firestore')
		await fund(store)
		await reserve(store)
		await commit(store)
		const customerKey = 'billing_security_fixture_customers/alice'
		const reservationKey = 'billing_security_fixture_reservations/reservation'
		if (corrupt === 'customer') db.rows.delete(customerKey)
		if (corrupt === 'reservation') db.rows.delete(reservationKey)
		if (corrupt === 'balance') db.write(customerKey, { availableBalanceUnits: 1 }, { merge: true })
		if (corrupt === 'queue') db.write(customerKey, { queuedUsageUnits: 1 }, { merge: true })
		await assert.rejects(store.markUsageEventIngested('usage'), err => ['BILLING_CUSTOMER_NOT_FOUND', 'BILLING_USAGE_BINDING_INVALID', 'BILLING_BALANCE_INVARIANT'].includes(err.code))
		assert.equal((await store.listQueuedUsageEvents()).length, 1)
	}
})

test('firestore: legacy credit proof is bound without minting again', async t => {
	const { store, db } = fixture(t, 'firestore')
	await fund(store)
	for (const key of db.rows.keys()) if (key.startsWith('billing_security_fixture_credit_proofs/')) db.rows.delete(key)
	await assert.rejects(store.creditCustomer({ customerHash: 'alice', eventId: 'changed-legacy-key', source: 'x402_settlement', amountCredits: 10, idempotencyKey: 'changed', proofRef: { settlementId: 'offline-receipt' } }), { code: 'BILLING_IDEMPOTENCY_CONFLICT' })
	const result = await store.creditCustomer({ customerHash: 'alice', eventId: 'legacy-replay', source: 'x402_settlement', amountCredits: 10, proofRef: { settlementId: 'offline-receipt' } })
	assert.equal(result.idempotent, true)
	assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 10)
})

test('reconciler: late response loss after settlement cannot requeue or duplicate the charge', async t => {
	const { store } = fixture(t)
	await fund(store)
	await reserve(store)
	await commit(store)
	const result = await flushQueuedUsageEvents({ store, settle: async event => {
		await store.markUsageEventIngested(event.eventId)
		throw new Error('Injected response loss')
	} })
	assert.equal(result.failed, 0)
	assert.equal(result.skipped, 1)
	await flushQueuedUsageEvents({ store })
	assert.equal((await store.getCustomer('alice')).availableBalanceCredits, 8)
})

test('reconciler: a failure to record one failure does not abort the batch or log provider text', async t => {
	const { store } = fixture(t)
	await fund(store)
	await reserve(store, 'first')
	await reserve(store, 'second')
	await commit(store, 'first', 'first')
	await commit(store, 'second', 'second')
	const adapter = {
		listQueuedUsageEvents: args => store.listQueuedUsageEvents(args),
		markUsageEventFailed: async id => { if (id === 'first') throw new Error('Injected offline reporting failure') },
	}
	const result = await flushQueuedUsageEvents({ store: adapter, settle: async event => {
		if (event.eventId === 'first') throw new Error('fixture-private-provider-body')
		return store.markUsageEventIngested(event.eventId)
	} })
	assert.equal(result.failed, 1)
	assert.equal(result.settled, 1)
	assert(!JSON.stringify(result).includes('fixture-private-provider-body'))
	assert.equal((await store.getCustomer('alice')).effectiveAvailableCredits, 6)
})

test('reconciler: invalid retry configuration remains bounded and errors stay redacted', async t => {
	const { store } = fixture(t)
	await fund(store)
	await reserve(store)
	await commit(store)
	process.env.BETTERPPTX_USAGE_RETRY_BASE_MS = 'Infinity'
	process.env.BETTERPPTX_USAGE_RETRY_MAX_MS = 'NaN'
	const now = new Date('2026-09-07T00:00:00.000Z')
	const result = await runBillingUsageReconciler({ store, now, settle: async () => { throw new Error('fixture-private-provider-body') } })
	delete process.env.BETTERPPTX_USAGE_RETRY_BASE_MS
	delete process.env.BETTERPPTX_USAGE_RETRY_MAX_MS
	assert.equal(result.failed, 1)
	const [event] = await store.listQueuedUsageEvents()
	assert(Date.parse(event.nextRetryAt) > now.getTime())
	assert(!JSON.stringify(event).includes('fixture-private-provider-body'))
	assert.equal((await runBillingUsageReconciler({ store, now })).attempted, 0)
	assert.equal((await store.getCustomer('alice')).effectiveAvailableCredits, 8)
})

test('reconciler: an unconfirmed custom settlement cannot report success', async t => {
	const { store } = fixture(t)
	await fund(store)
	await reserve(store)
	await commit(store)
	const result = await flushQueuedUsageEvents({ store, settle: async () => ({ ok: true }) })
	assert.equal(result.failed, 1)
	assert.equal(result.settled, 0)
	assert.equal((await store.getCustomer('alice')).effectiveAvailableCredits, 8)
})

for (const verifier of ['verify-billing-ledger.mjs', 'verify-crypto-credit-ledger.mjs', 'verify-avatar-billing-exactly-once.mjs', 'verify-billing-quote-cap.mjs']) {
	test(`compatibility: ${verifier} passes in an isolated offline working directory`, async t => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-ledger-compatibility-'))
		t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
		const file = fileURLToPath(new URL(`../${verifier}`, import.meta.url))
		const { stdout } = await runProcess(process.execPath, ['--import', offlinePreload, file], {
			cwd: dir, env: { ...childEnvironment, NODE_ENV: 'test', BETTERPPTX_BILLING_LEDGER_STORE: 'local' }, timeout: 15000, windowsHide: true,
		})
		assert.match(stdout, /PASS/)
	})
}
