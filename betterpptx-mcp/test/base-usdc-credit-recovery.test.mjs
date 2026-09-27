import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { MemoryFirestore } from './payram-billing-security-fixtures.mjs'
import { BillingSecurityFirestore } from './fixtures/billing-security-firestore.mjs'

const temporaryRoot = path.resolve(os.tmpdir())
const testContext = process.env.NODE_TEST_CONTEXT
process.env = { ...(testContext ? { NODE_TEST_CONTEXT: testContext } : {}), NODE_ENV: 'test', BETTERPPTX_REQUIRE_SHARED_STORES: '0', BETTERPPTX_CRYPTO_ORDER_STORE: 'local', BETTERPPTX_BILLING_LEDGER_STORE: 'local', BETTERPPTX_BILLING_HASH_SALT: 'watcher-fixture-salt' }
globalThis.fetch = async () => { throw new Error('External network is forbidden') }
const { createCryptoOrderStore, desiredCryptoOrderCredits, BASE_USDC_CONTRACT } = await import('../billing/crypto-orders.mjs')
const { processBaseUsdcLogs, scanBaseUsdcHotWindow, lazyRescanOrder, createBaseUsdcFinalityChain, BASE_USDC_TRANSFER_TOPIC } = await import('../billing/base-usdc-watcher.mjs')
const { createBillingLedgerStore } = await import('../billing/ledger-store.mjs')

const address = `0x${'11'.repeat(20)}`
const hash = index => `0x${String(index).padStart(64, '0')}`
const transfer = (index, extra = {}) => ({ txHash: hash(index), logIndex: 0, blockNumber: 100, amountUsdcMicros: 1e6, confirmations: 6, to: address, tokenContract: BASE_USDC_CONTRACT, ...extra })
const log = (index, extra = {}) => ({ address: BASE_USDC_CONTRACT, transactionHash: hash(index), logIndex: '0x0', blockNumber: '0x64', data: '0xf4240', topics: [BASE_USDC_TRANSFER_TOPIC, `0x${'0'.repeat(64)}`, `0x${'0'.repeat(24)}${address.slice(2)}`], ...extra })

function fixture(t, shared = false, sharedLedger = false) {
	const dir = fs.mkdtempSync(path.join(temporaryRoot, 'base-usdc-security-'))
	t.after(() => {
		assert.equal(path.dirname(dir), temporaryRoot)
		assert.ok(path.basename(dir).startsWith('base-usdc-security-'))
		fs.rmSync(dir, { recursive: true, force: true })
	})
	const order = { orderId: 'order_fixture', customerHash: 'buyer', installHash: 'buyer', envelopeJti: 'fixture', packId: 'starter_500', expectedCredits: 500, expectedUsdc: 5, chainId: 8453, tokenContract: BASE_USDC_CONTRACT, depositAddress: address, status: 'pending', confirmedUsdcMicros: 0, creditedCredits: 0, transfers: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
	process.env.BETTERPPTX_CRYPTO_ORDER_FILE = path.join(dir, 'orders.json')
	process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(dir, 'ledger.json')
	let store
	if (shared) {
		const db = new MemoryFirestore()
		db.retryCallbacks = true
		db.rows.set('betterpptx_billing_crypto_orders/order_fixture', structuredClone(order))
		process.env.BETTERPPTX_CRYPTO_ORDER_STORE = 'firestore'
		try { store = createCryptoOrderStore({ firestoreDb: db }) }
		finally { process.env.BETTERPPTX_CRYPTO_ORDER_STORE = 'local' }
	} else {
		fs.writeFileSync(path.join(dir, 'orders.json'), JSON.stringify({ version: 1, orders: { order_fixture: order }, addresses: {}, envelopes: {}, allocators: {} }))
		store = createCryptoOrderStore()
	}
	let ledger
	let ledgerDb
	if (sharedLedger) {
		ledgerDb = new BillingSecurityFirestore()
		process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'firestore'
		try { ledger = createBillingLedgerStore({ firestoreClient: ledgerDb }) }
		finally { process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local' }
	} else ledger = createBillingLedgerStore()
	return { dir, order, store, ledger, ledgerDb }
}

for (const shared of [false, true]) {
	test(`${shared ? 'shared' : 'local'} duplicate transfer preserves credit recovery and stronger confirmations advance eligibility`, async t => {
		const { store } = fixture(t, shared)
		const pending = transfer(1, { amountUsdcMicros: 20e6, confirmations: 3 })
		assert.equal((await store.recordTransfer('order_fixture', pending)).desiredCredits, 0)
		const confirmed = await store.recordTransfer('order_fixture', { ...pending, confirmations: 6 })
		assert.equal(confirmed.desiredCredits, 2000)
		const replay = await store.recordTransfer('order_fixture', { ...pending, confirmations: 6 })
		assert.equal(replay.idempotent, true)
		assert.equal(replay.desiredCredits, 2000)
		assert.equal(desiredCryptoOrderCredits(replay.order), 2000)
		await assert.rejects(store.recordTransfer('order_fixture', { ...pending, amountUsdcMicros: 30e6, confirmations: 6 }), { code: 'CHAIN_TRANSFER_CONFLICT' })
		await assert.rejects(store.recordTransfer('order_fixture', transfer(2, { to: `0x${'22'.repeat(20)}` })), { code: 'CHAIN_TRANSFER_BINDING_INVALID' })
	})

	test(`${shared ? 'shared' : 'local'} stale credit checkpoint cannot hide an order with a newer unpaid total`, async t => {
		const { store } = fixture(t, shared)
		await store.recordTransfer('order_fixture', transfer(1, { amountUsdcMicros: 5e6 }))
		await store.recordTransfer('order_fixture', transfer(2, { amountUsdcMicros: 5e6 }))
		const checkpoint = await store.markCredited('order_fixture', 500)
		assert.equal(checkpoint.status, 'partial')
		assert.equal(checkpoint.confirmationState, 'ready_to_credit')
		await assert.rejects(store.markCredited('order_fixture', 1100), { code: 'CRYPTO_ORDER_CREDIT_INVALID' })
		await store.markCredited('order_fixture', 1000)
		assert.equal((await store.markCredited('order_fixture', 500)).creditedCredits, 1000)
	})
}

for (const shared of [false, true]) {
test(`${shared ? 'shared' : 'local'} overlapping transfer workers grant the cumulative entitlement only once`, async t => {
	const { store, ledger, order } = fixture(t, shared, shared)
	let entered = 0
	let release
	let firstEntered
	const barrier = new Promise(resolve => { release = resolve })
	const firstCall = new Promise(resolve => { firstEntered = resolve })
	const wrapped = Object.create(ledger)
	for (const method of ['creditCustomer', 'creditCustomerCumulative']) {
		if (typeof ledger[method] !== 'function') continue
		wrapped[method] = async input => {
			entered++
			if (entered === 1) firstEntered()
			if (entered === 2) release()
			await barrier
			return ledger[method](input)
		}
	}
	const run = index => processBaseUsdcLogs({ logs: [log(index)], latestBlock: 105, safeDepth: 2, store, ledger: wrapped, orders: [order] })
	// Hold the first worker's 100-credit observation at the ledger before the
	// second transfer makes 200 due. Starting both together can mask the race.
	const first = run(1)
	await firstCall
	const results = await Promise.all([first, run(2)])
	assert.equal((await ledger.getCustomer('buyer')).availableBalanceCredits, 200)
	assert.equal((await store.getOrder(order.orderId)).creditedCredits, 200)
	assert.equal(results.reduce((sum, result) => sum + result.credited, 0), 200)
})
}

test('replayed logs recover a grant failure after transfer recording', async t => {
	const { store, ledger, order } = fixture(t)
	let failed = false
	const wrapped = Object.create(ledger)
	for (const method of ['creditCustomer', 'creditCustomerCumulative']) {
		if (typeof ledger[method] !== 'function') continue
		wrapped[method] = async input => {
			if (!failed) { failed = true; throw new Error('injected grant failure') }
			return ledger[method](input)
		}
	}
	const args = { logs: [log(1)], latestBlock: 105, safeDepth: 2, store, ledger: wrapped, orders: [order] }
	await assert.rejects(processBaseUsdcLogs(args))
	await processBaseUsdcLogs(args)
	assert.equal((await ledger.getCustomer('buyer')).availableBalanceCredits, 100)
	assert.equal((await store.getOrder(order.orderId)).creditedCredits, 100)
})

for (const shared of [false, true]) {
	for (const fault of ['after-ledger', 'before-checkpoint', 'after-checkpoint']) {
		test(`${shared ? 'shared' : 'local'} ${fault} recovery with aged-out logs never remints`, async t => {
			const { store, ledger, order } = fixture(t, shared, shared)
			const wrappedStore = Object.create(store)
			const wrappedLedger = Object.create(ledger)
			let failed = false
			if (fault === 'after-ledger') {
				wrappedLedger.creditCustomerCumulative = async input => {
					const result = await ledger.creditCustomerCumulative(input)
					if (!failed) { failed = true; throw new Error('injected lost ledger acknowledgment') }
					return result
				}
			} else {
				wrappedStore.markCredited = async (...args) => {
					if (fault === 'after-checkpoint') await store.markCredited(...args)
					if (!failed) { failed = true; throw new Error('injected checkpoint failure') }
					return store.markCredited(...args)
				}
			}
			const args = { latestBlock: 105, store: wrappedStore, ledger: wrappedLedger, orders: [order] }
			await assert.rejects(processBaseUsdcLogs({ ...args, logs: [log(1)] }))
			assert.equal((await ledger.getCustomer('buyer')).availableBalanceCredits, 100)
			assert.equal((await processBaseUsdcLogs({ ...args, logs: [] })).credited, 0)
			assert.equal((await store.getOrder(order.orderId)).creditedCredits, 100)
			assert.equal((await processBaseUsdcLogs({ ...args, logs: [log(2, { data: '0x1' })] })).credited, 0, 'dust cannot change the immutable entitlement identity')
			assert.equal((await processBaseUsdcLogs({ ...args, logs: [log(3)] })).credited, 100)
			assert.equal((await ledger.getCustomer('buyer')).availableBalanceCredits, 200)
		})
	}

	test(`${shared ? 'shared' : 'local'} historical delta credits stop for reconciliation, not automatic reminting`, async t => {
		const { store, ledger, order } = fixture(t, shared, shared)
		await store.recordTransfer(order.orderId, transfer(1))
		await ledger.creditCustomer({ customerHash: 'buyer', source: 'chain_transfer', amountCredits: 100, eventId: 'old-delta', proofRef: { orderId: order.orderId, desiredCredits: 100, transferSetHash: 'fixture-legacy-proof' } })
		await assert.rejects(processBaseUsdcLogs({ logs: [log(2)], latestBlock: 105, store, ledger, orders: [order] }), { code: 'BILLING_CUMULATIVE_LEGACY_RECONCILIATION_REQUIRED' })
		assert.equal((await ledger.getCustomer('buyer')).availableBalanceCredits, 100)
		assert.equal((await store.getOrder(order.orderId)).creditedCredits, 0)
	})
}

function finalityFixture({ logs = [log(1, { blockHash: hash(100) })], finalized = { number: '0x65', hash: hash(101) }, receiptPatch = {}, blockPatch = {}, methods = {} } = {}) {
	const calls = []
	const chain = {
		getFinalizedBlock: async () => { calls.push('finalized'); return structuredClone(finalized) },
		getBlockByNumber: async number => { calls.push(`block:${number}`); return { number, hash: hash(number), ...blockPatch } },
		getTransactionReceipt: async txHash => {
			calls.push(`receipt:${txHash}`)
			const item = logs.find(item => item.transactionHash === txHash)
			return item ? { status: '0x1', transactionHash: txHash, blockNumber: item.blockNumber, blockHash: item.blockHash, logs: [item], ...receiptPatch } : null
		},
		...methods,
	}
	return { chain, logs, calls }
}

for (const production of [
	{ NODE_ENV: 'production' }, { NODE_ENV: 'test', BETTERPPTX_ENV: 'prod' },
	{ NODE_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: ' LIVE ' },
]) {
	test(`${Object.keys(production).at(-1)} requires finalized canonical receipt evidence`, async t => {
		const { store, ledger, order } = fixture(t)
		const f = finalityFixture({ finalized: { number: 100n, hash: hash(100) } })
		const args = { latestBlock: 105, store, ledger, orders: [order], env: production, ...f }
		const result = await processBaseUsdcLogs(args)
		assert.equal(result.credited, 100)
		assert.equal(result.verificationMode, 'finalized-canonical-receipt')
		assert.equal(f.calls.filter(value => value.startsWith('receipt:')).length, 1, 'receipt fetched once per observation batch')
		assert.equal((await store.getOrder(order.orderId)).finalityRequired, true)
		assert.equal((await processBaseUsdcLogs(args)).credited, 0)
		assert.equal((await ledger.getCustomer('buyer')).availableBalanceCredits, 100)
	})
}

const finalityFailures = [
	['missing chain API', { methods: { getFinalizedBlock: undefined } }, 'BASE_FINALITY_UNAVAILABLE'],
	['unsupported finalized RPC', { methods: { getFinalizedBlock: async () => { throw new Error('fixture unsupported') } } }, 'BASE_FINALITY_UNAVAILABLE'],
	['missing finalized block', { finalized: null }, 'BASE_FINALITY_UNAVAILABLE'],
	['malformed finalized number', { finalized: { number: '0x64junk', hash: hash(100) } }, 'BASE_FINALITY_UNAVAILABLE'],
	['malformed finalized hash', { finalized: { number: 100, hash: '0x1' } }, 'BASE_FINALITY_UNAVAILABLE'],
	['finalized ahead of latest', { finalized: { number: 200, hash: hash(200) } }, 'BASE_FINALITY_UNAVAILABLE'],
	['missing receipt', { methods: { getTransactionReceipt: async () => null } }, 'BASE_FINALITY_UNAVAILABLE'],
	['failed receipt RPC', { methods: { getTransactionReceipt: async () => { throw new Error('fixture timeout') } } }, 'BASE_FINALITY_UNAVAILABLE'],
	['reverted receipt', { receiptPatch: { status: '0x0' } }, 'BASE_TRANSFER_EVIDENCE_INVALID'],
	['foreign receipt transaction', { receiptPatch: { transactionHash: hash(2) } }, 'BASE_TRANSFER_EVIDENCE_INVALID'],
	['foreign receipt block height', { receiptPatch: { blockNumber: '0x63' } }, 'BASE_TRANSFER_EVIDENCE_INVALID'],
	['foreign receipt block hash', { receiptPatch: { blockHash: hash(999) } }, 'BASE_TRANSFER_EVIDENCE_INVALID'],
	['missing receipt block hash', { receiptPatch: { blockHash: undefined } }, 'BASE_TRANSFER_EVIDENCE_INVALID'],
	['reorganized canonical block', { blockPatch: { hash: hash(999) } }, 'BASE_TRANSFER_EVIDENCE_INVALID'],
	['foreign canonical block height', { blockPatch: { number: 99 } }, 'BASE_TRANSFER_EVIDENCE_INVALID'],
	['finalized header hash disagreement', { finalized: { number: 100, hash: hash(999) } }, 'BASE_TRANSFER_EVIDENCE_INVALID'],
	['missing canonical block', { methods: { getBlockByNumber: async () => null } }, 'BASE_FINALITY_UNAVAILABLE'],
	['failed canonical block RPC', { methods: { getBlockByNumber: async () => { throw new Error('fixture timeout') } } }, 'BASE_FINALITY_UNAVAILABLE'],
	['missing included transfer', { receiptPatch: { logs: [] } }, 'BASE_TRANSFER_EVIDENCE_INVALID'],
	['wrong included amount', { receiptPatch: { logs: [log(1, { blockHash: hash(100), data: '0x1' })] } }, 'BASE_TRANSFER_EVIDENCE_INVALID'],
	['wrong included log index', { receiptPatch: { logs: [log(1, { blockHash: hash(100), logIndex: '0x1' })] } }, 'BASE_TRANSFER_EVIDENCE_INVALID'],
	['wrong included recipient', { receiptPatch: { logs: [log(1, { blockHash: hash(100), topics: [BASE_USDC_TRANSFER_TOPIC, `0x${'0'.repeat(64)}`, `0x${'2'.repeat(64)}`] })] } }, 'BASE_TRANSFER_EVIDENCE_INVALID'],
	['removed included transfer', { receiptPatch: { logs: [log(1, { blockHash: hash(100), removed: true })] } }, 'BASE_TRANSFER_EVIDENCE_INVALID'],
	['missing observed block hash', { logs: [log(1)] }, 'BASE_TRANSFER_EVIDENCE_INVALID'],
]
for (const [name, options, code] of finalityFailures) {
	test(`production rejects ${name} before any credit`, async t => {
		const { store, ledger, order, dir } = fixture(t)
		const f = finalityFixture(options)
		await assert.rejects(processBaseUsdcLogs({ ...f, latestBlock: 105, store, ledger, orders: [order], env: { NODE_ENV: 'production' } }), { code })
		assert.equal((await store.getOrder(order.orderId)).creditedCredits, 0)
		assert.equal(fs.existsSync(path.join(dir, 'ledger.json')), false)
	})
}

test('depth alone never credits an unfinalized production transfer', async t => {
	const { store, ledger, order } = fixture(t)
	const f = finalityFixture({ finalized: { number: 98, hash: hash(98) } })
	const result = await processBaseUsdcLogs({ ...f, latestBlock: 105, safeDepth: 0, store, ledger, orders: [order], env: { NODE_ENV: 'production' } })
	assert.equal(result.credited, 0)
	assert.equal(result.ignoredUnfinalized, 1)
	assert.equal(Object.keys((await store.getOrder(order.orderId)).transfers).length, 0)
})

for (const valid of [false, true]) {
	test(`persisted depth-only transfer with aged-out raw logs ${valid ? 'recovers after fresh finality verification' : 'cannot bypass finality'}`, async t => {
		const { store, ledger, order } = fixture(t)
		await store.recordTransfer(order.orderId, transfer(1))
		const f = finalityFixture(valid ? {} : { receiptPatch: { blockHash: hash(999) } })
		const args = { ...f, logs: [], latestBlock: 105, store, ledger, orders: [order], env: { NODE_ENV: 'production' } }
		if (!valid) await assert.rejects(processBaseUsdcLogs(args), { code: 'BASE_TRANSFER_EVIDENCE_INVALID' })
		else {
			assert.equal((await processBaseUsdcLogs(args)).credited, 100)
			assert.equal((await store.getOrder(order.orderId)).transfers[`${hash(1)}:0`].blockHash, hash(100))
		}
	})
}

test('persisted finality markers are not trusted after a canonical mismatch or backward finality head', async t => {
	const { store, ledger, order } = fixture(t)
	await store.recordTransfer(order.orderId, transfer(1, { blockHash: hash(100), finalizedBlockNumber: 101 }))
	for (const [options, code] of [[{ blockPatch: { hash: hash(999) } }, 'BASE_TRANSFER_EVIDENCE_INVALID'], [{ finalized: { number: 98, hash: hash(98) } }, 'BASE_FINALITY_UNAVAILABLE']]) {
		const f = finalityFixture(options)
		await assert.rejects(processBaseUsdcLogs({ ...f, logs: [], latestBlock: 105, store, ledger, orders: [order], env: { NODE_ENV: 'production' } }), { code })
	}
	assert.equal((await store.getOrder(order.orderId)).creditedCredits, 0)
})

test('production grant targets exclude persisted depth-only transfers above the finalized head', async t => {
	const { store, ledger, order } = fixture(t)
	await store.recordTransfer(order.orderId, transfer(1))
	await store.recordTransfer(order.orderId, transfer(2, { blockNumber: 104, confirmations: 20 }))
	const f = finalityFixture()
	assert.equal((await processBaseUsdcLogs({ ...f, logs: [], latestBlock: 105, store, ledger, orders: [order], env: { NODE_ENV: 'production' } })).credited, 100)
	assert.equal((await ledger.getCustomer('buyer')).availableBalanceCredits, 100)
})

test('concurrent stored evidence cannot widen a production grant beyond this scan verified receipts', async t => {
	const { store, ledger, order } = fixture(t, true, true)
	await store.recordTransfer(order.orderId, transfer(1))
	const wrapped = Object.create(store)
	let injected = false
	wrapped.recordTransfer = async (...args) => {
		const result = await store.recordTransfer(...args)
		if (!injected) {
			injected = true
			await store.recordTransfer(order.orderId, transfer(2, { blockNumber: 102, blockHash: hash(102), finalizedBlockNumber: 103 }))
		}
		return result
	}
	const f = finalityFixture()
	const result = await processBaseUsdcLogs({ ...f, logs: [], latestBlock: 105, store: wrapped, ledger, orders: [order], env: { NODE_ENV: 'production' } })
	assert.equal(result.credited, 100)
	assert.equal((await ledger.getCustomer('buyer')).availableBalanceCredits, 100)
	assert.equal((await store.getOrder(order.orderId)).confirmationState, 'ready_to_credit')
})

test('overlapping production scans share the cumulative ledger after independently finalized verification', async t => {
	const { store, ledger, order } = fixture(t, true, true)
	const f = finalityFixture({ logs: [log(1, { blockHash: hash(100) }), log(2, { blockHash: hash(100) })] })
	const wrapped = Object.create(ledger)
	let firstEntered
	let releaseFirst
	const entered = new Promise(resolve => { firstEntered = resolve })
	const secondCommitted = new Promise(resolve => { releaseFirst = resolve })
	wrapped.creditCustomerCumulative = async input => {
		if (input.totalCredits === 100) { firstEntered(); await secondCommitted }
		const result = await ledger.creditCustomerCumulative(input)
		if (input.totalCredits === 200) releaseFirst()
		return result
	}
	const run = index => processBaseUsdcLogs({ ...f, logs: [f.logs[index]], latestBlock: 105, store, ledger: wrapped, orders: [order], env: { NODE_ENV: 'production' } })
	const first = run(0)
	await entered
	const result = await Promise.all([first, run(1)])
	assert.equal(result[0].credited, 0, 'the stale worker cannot grant after the larger target commits')
	assert.equal(result[1].credited, 200)
	assert.equal((await ledger.getCustomer('buyer')).availableBalanceCredits, 200)
	assert.equal((await store.getOrder(order.orderId)).creditedCredits, 200)
})

test('the real RPC adapter requires finality even with a nonproduction environment, using only a fake transport', async t => {
	const { store, ledger, order } = fixture(t)
	process.env.BETTERPPTX_BASE_RPC_URL = 'https://rpc.example.test'
	const previousFetch = globalThis.fetch
	t.after(() => { globalThis.fetch = previousFetch; delete process.env.BETTERPPTX_BASE_RPC_URL })
	const methods = []
	let finalizedAvailable = false
	globalThis.fetch = async (url, options) => {
		assert.equal(url, 'https://rpc.example.test')
		const { method, params } = JSON.parse(options.body)
		methods.push(method)
		const result = method === 'eth_chainId' ? '0x2105'
			: method === 'eth_blockNumber' ? '0x69'
			: method === 'eth_getLogs' ? [log(1, { blockHash: hash(100) })]
			: method === 'eth_getBlockByNumber' && params[0] === 'finalized' ? (finalizedAvailable ? { number: '0x65', hash: hash(101) } : null)
			: method === 'eth_getBlockByNumber' && params[0] === '0x64' ? { number: '0x64', hash: hash(100) }
			: method === 'eth_getTransactionReceipt' && params[0] === hash(1) ? { transactionHash: hash(1), blockNumber: '0x64', blockHash: hash(100), status: '0x1', logs: [log(1, { blockHash: hash(100) })] } : undefined
		assert.notEqual(result, undefined, 'unexpected fixture RPC call')
		return { ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result }) }
	}
	assert.equal(createBaseUsdcFinalityChain().requiresFinality, true)
	await assert.rejects(scanBaseUsdcHotWindow({ store, ledger, env: { NODE_ENV: 'test' } }), { code: 'BASE_FINALITY_UNAVAILABLE' })
	await assert.rejects(lazyRescanOrder(order.orderId, { store, ledger, env: { NODE_ENV: 'test' } }), { code: 'BASE_FINALITY_UNAVAILABLE' })
	assert.ok(methods.includes('eth_getBlockByNumber'))
	assert.equal((await store.getOrder(order.orderId)).creditedCredits, 0)
	finalizedAvailable = true
	assert.equal((await scanBaseUsdcHotWindow({ store, ledger, env: { NODE_ENV: 'test' } })).credited, 100)
	assert.equal((await lazyRescanOrder(order.orderId, { store, ledger, env: { NODE_ENV: 'test' } })).credited, 0)
	assert.equal((await ledger.getCustomer('buyer')).availableBalanceCredits, 100)
})

test('existing chain watcher compatibility verifier passes in an isolated fixture process', async t => {
	const { dir } = fixture(t)
	const script = fileURLToPath(new URL('../verify-chain-watcher.mjs', import.meta.url))
	const result = await new Promise(resolve => execFile(process.execPath, [script], {
		cwd: dir, env: { ...process.env, SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows' }, timeout: 10000, windowsHide: true,
	}, error => resolve({ ok: !error })))
	assert.equal(result.ok, true)
})
