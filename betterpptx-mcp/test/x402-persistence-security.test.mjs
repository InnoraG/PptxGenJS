import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { test } from 'node:test'

for (const name of Object.keys(process.env)) if (/^(BETTERPPTX_|GOOGLE_|GCLOUD_|FIRESTORE_)/.test(name)) delete process.env[name]
const root = mkdtempSync(path.join(tmpdir(), 'x402-persistence-fixtures-'))
Object.assign(process.env, {
	NODE_ENV: 'test',
	BETTERPPTX_X402_STORE: 'firestore', BETTERPPTX_X402_RELAYER_LEASE_STORE: 'firestore',
	BETTERPPTX_REQUIRE_SHARED_STORES: '1', BETTERPPTX_BASE_SAFE_DEPTH: '2',
	BETTERPPTX_TREASURY_EVM_ADDRESS: '0x4000000000000000000000000000000000000001',
	BETTERPPTX_X402_RELAYER_LEASE_DIR: path.join(root, 'leases'),
})
globalThis.fetch = async () => { throw new Error('Network forbidden in persistence regression tests') }
const { fakeFirestore } = await import('./fixtures/x402-fake-firestore.mjs')
const { fakeChain, fakeLedger, signPayment, hash } = await import('./fixtures/x402-security-fixtures.mjs')
const { createX402QuoteStore, settleX402Quote } = await import('../billing/x402-packs.mjs')
const { withRelayerBroadcastLease, withX402BroadcastOnce } = await import('../billing/relayer-lease.mjs')

async function contextFor(db = fakeFirestore()) {
	const store = createX402QuoteStore({ firestoreDb: db })
	const quote = await store.createQuote({ installHash: 'fixture-owner', packId: 'starter_500' })
	return { store, quote, quoteId: quote.quoteId, ledger: fakeLedger(), chain: fakeChain(), leaseOptions: { db } }
}

test('shared quote and settlement claims serialize duplicate payments', async () => {
	const context = await contextFor()
	const paymentPayload = await signPayment(context.quote)
	context.chain.state.delay = 30
	const results = await Promise.allSettled(Array.from({ length: 6 }, () => settleX402Quote({ ...context, paymentPayload })))
	assert.ok(results.some(result => result.status === 'fulfilled'))
	assert.equal(context.chain.state.submitted.length, 1)
	assert.equal(context.ledger.events.size, 1)
	assert.equal((await context.store.getQuote(context.quoteId)).state, 'settled')
})

test('shared transaction replay is rejected before credit across quote stores', async () => {
	const db = fakeFirestore()
	const first = await contextFor(db)
	const second = await contextFor(db)
	const transaction = hash()
	const facilitator = { verify: async () => ({ isValid: true }), settle: async () => ({ success: true, transaction, network: 'eip155:8453' }) }
	await settleX402Quote({ ...first, paymentPayload: await signPayment(first.quote), facilitator })
	await assert.rejects(settleX402Quote({ ...second, paymentPayload: await signPayment(second.quote), facilitator }), { code: 'X402_SETTLEMENT_REPLAYED' })
	assert.equal(second.ledger.calls, 0)
})

test('shared settlement survives ledger success followed by quote-finalization failure', async () => {
	const context = await contextFor()
	const original = context.store.markSettled
	context.store.markSettled = async () => { throw new Error('fixture: write interrupted') }
	await assert.rejects(settleX402Quote({ ...context, paymentPayload: await signPayment(context.quote) }))
	assert.equal(context.ledger.events.size, 1)
	context.store.markSettled = original
	assert.equal((await settleX402Quote({ ...context, paymentPayload: {} })).settled, true)
	assert.equal(context.ledger.events.size, 1)
})

test('expired held shared lease cannot be stolen from a slow broadcaster', async () => {
	const db = fakeFirestore()
	let entered
	const ready = new Promise(resolve => { entered = resolve })
	let release
	const blocked = new Promise(resolve => { release = resolve })
	const running = withRelayerBroadcastLease({ db, keyId: 'slow-key', ttlMs: 1, waitMs: 0 }, async () => { entered(); await blocked })
	await ready
	await new Promise(resolve => setTimeout(resolve, 5))
	try {
		await assert.rejects(withRelayerBroadcastLease({ db, keyId: 'slow-key', ttlMs: 1, waitMs: 0 }, () => assert.fail('Expired holder was overlapped')), { code: 'RELAYER_LEASE_BUSY' })
	} finally { release(); await running }
	assert.equal(await withRelayerBroadcastLease({ db, keyId: 'slow-key', waitMs: 0 }, () => 'released'), 'released')
})

test('legacy expired held shared lease requires reconciliation rather than automatic takeover', async () => {
	const db = fakeFirestore()
	db.documents.set('betterpptx_billing_x402_relayer_leases/legacy', { state: 'held', fencingToken: 'old-holder', leaseExpiresAt: '2000-01-01T00:00:00.000Z' })
	await assert.rejects(withRelayerBroadcastLease({ db, keyId: 'legacy', waitMs: 0 }, () => assert.fail('Stale lease was stolen')), { code: 'RELAYER_LEASE_BUSY' })
})

test('a stale fencing token cannot broadcast or release another holder', async () => {
	const db = fakeFirestore()
	await assert.rejects(withRelayerBroadcastLease({ db, keyId: 'fenced', waitMs: 0 }, async lease => {
		const id = 'betterpptx_billing_x402_relayer_leases/fenced'
		db.documents.set(id, { ...db.documents.get(id), fencingToken: 'different-holder' })
		await lease.assertHeld()
	}), { code: 'RELAYER_LEASE_LOST' })
	assert.equal(db.documents.get('betterpptx_billing_x402_relayer_leases/fenced').state, 'held')
})

test('shared ambiguous broadcast never retries its provider callback', async () => {
	const db = fakeFirestore()
	const options = { db, keyId: 'uncertain', authorizationId: 'same-authorization', quoteId: 'same-quote' }
	let calls = 0
	await assert.rejects(withX402BroadcastOnce(options, () => { calls++; throw new Error('fixture: disconnected') }))
	const result = await withX402BroadcastOnce(options, () => { calls++; return hash() })
	assert.equal(result.state, 'submitting')
	assert.equal(calls, 1)
})

test('same authorization cannot be reassigned even if a different relayer key is selected', async () => {
	const db = fakeFirestore()
	await withX402BroadcastOnce({ db, authorizationId: 'same-auth', quoteId: 'quote-1', keyId: 'key-1' }, () => hash())
	await assert.rejects(withX402BroadcastOnce({ db, authorizationId: 'same-auth', quoteId: 'quote-2', keyId: 'key-2' }, () => assert.fail('Reassigned authorization broadcast')), { code: 'X402_AUTHORIZATION_REPLAYED' })
})

test('shared-store requirement remains fail-closed for local relayer storage', async () => {
	process.env.BETTERPPTX_X402_RELAYER_LEASE_STORE = 'local'
	try { await assert.rejects(withRelayerBroadcastLease({}, () => assert.fail('Local production lease admitted')), { code: 'RELAYER_LEASE_NOT_SHARED' }) }
	finally { process.env.BETTERPPTX_X402_RELAYER_LEASE_STORE = 'firestore' }
})

const worker = fileURLToPath(new URL('./fixtures/x402-security-process-worker.mjs', import.meta.url))
function child(mode, directory, keyId = 'same-relayer') {
	return new Promise((resolve, reject) => {
		const proc = spawn(process.execPath, [worker, mode, directory, keyId], {
			windowsHide: true, timeout: 25000,
			env: { SystemRoot: process.env.SystemRoot || 'C:\\Windows', TEMP: tmpdir(), TMP: tmpdir() },
			stdio: ['ignore', 'pipe', 'pipe'],
		})
		let stdout = '', stderr = ''
		proc.stdout.on('data', chunk => { stdout += chunk })
		proc.stderr.on('data', chunk => { stderr += chunk })
		proc.on('error', reject)
		proc.on('exit', code => {
			if (code !== 0) return reject(new Error(`Fixture process exited ${code}: ${stderr.slice(0, 1000)}`))
			try { resolve(stdout ? JSON.parse(stdout) : {}) } catch (error) { reject(error) }
		})
	})
}
const newDirectory = () => mkdtempSync(path.join(root, 'process-'))
const broadcasts = directory => readFileSync(path.join(directory, 'broadcasts.txt'), 'utf8').trim().split('\n').length

test('independent processes with different lane keys persist one broadcast per authorization', { timeout: 40000 }, async () => {
	const directory = newDirectory()
	const results = await Promise.all(['a', 'b', 'c', 'd'].map(keyId => child('broadcast', directory, keyId)))
	assert.equal(broadcasts(directory), 1)
	assert.ok(results.some(result => result.state === 'submitted'))
	assert.equal((await child('broadcast', directory, 'fresh-process')).state, 'submitted')
	assert.equal(broadcasts(directory), 1)
})

test('provider disconnect plus process restart retains ambiguous intent without a second write', { timeout: 40000 }, async () => {
	const directory = newDirectory()
	assert.equal((await child('ambiguous', directory)).error, 'FIXTURE_AMBIGUOUS')
	assert.equal((await child('broadcast', directory)).state, 'submitting')
	assert.equal(broadcasts(directory), 1)
})

test('process death during broadcast leaves durable intent and no automatic rebroadcast', { timeout: 40000 }, async () => {
	const directory = newDirectory()
	await child('crash', directory, 'crashed-holder')
	assert.equal((await child('broadcast', directory, 'different-holder')).state, 'submitting')
	assert.equal(broadcasts(directory), 1)
	assert.equal((await child('broadcast', directory, 'crashed-holder')).error, 'RELAYER_LEASE_BUSY')
})

test('independent local quote writers preserve every quote and consume an envelope once', { timeout: 40000 }, async () => {
	const directory = newDirectory()
	const results = await Promise.all(['a', 'b', 'c'].map(key => child('quotes', directory, key)))
	const data = JSON.parse(readFileSync(path.join(directory, 'quotes.json'), 'utf8'))
	assert.equal(Object.keys(data.quotes).length, 16)
	assert.equal(results.flatMap(result => result.results).filter(value => value === 'envelope-created').length, 1)
	assert.equal(Object.keys(data.envelopes).length, 1)
})
