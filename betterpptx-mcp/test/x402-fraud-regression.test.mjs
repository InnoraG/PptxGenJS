import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

// Remove inherited application configuration by name only, without reading values.
for (const name of Object.keys(process.env)) {
	if (/^(BETTERPPTX_|GOOGLE_|GCLOUD_|FIRESTORE_)/.test(name)) delete process.env[name]
}
const directory = mkdtempSync(path.join(tmpdir(), 'x402-fraud-fixtures-'))
Object.assign(process.env, {
	NODE_ENV: 'test',
	BETTERPPTX_X402_STORE: 'local', BETTERPPTX_BILLING_LEDGER_STORE: 'local',
	BETTERPPTX_X402_RELAYER_LEASE_STORE: 'local', BETTERPPTX_REQUIRE_SHARED_STORES: '0',
	BETTERPPTX_X402_RELAYER_LEASE_DIR: path.join(directory, 'leases'),
	BETTERPPTX_TREASURY_EVM_ADDRESS: '0x4000000000000000000000000000000000000001',
	BETTERPPTX_BASE_SAFE_DEPTH: '2',
})
globalThis.fetch = async () => { throw new Error('Network forbidden in fraud regression tests') }
const { createX402QuoteStore, settleX402Quote, publicX402Quote } = await import('../billing/x402-packs.mjs')
const { signPayment, fakeChain, fakeLedger, hash, payer, domain, blockHashFor } = await import('./fixtures/x402-security-fixtures.mjs')
const { verifyX402PaymentForQuote, normalizeX402PaymentPayload, createBaseSelfSettleChain } = await import('../billing/x402-self-settle.mjs')
let sequence = 0
async function setup(identity = 'fixture-owner') {
	process.env.BETTERPPTX_X402_FILE = path.join(directory, `quotes-${++sequence}.json`)
	const store = createX402QuoteStore()
	const quote = await store.createQuote({ installHash: identity, packId: 'starter_500' })
	return { quote, quoteId: quote.quoteId, store, ledger: fakeLedger(), chain: fakeChain() }
}
const settle = (context, paymentPayload, patch = {}) => settleX402Quote({ ...context, paymentPayload, ...patch })

test('paid quote and settled replay credit once', async () => {
	const context = await setup()
	const result = await settle(context, await signPayment(context.quote))
	assert.equal(result.settled, true)
	assert.equal(result.creditedCredits, 500)
	assert.equal((await settle(context, {})).idempotent, true)
	assert.equal(context.ledger.events.size, 1)
})

test('public authorization cannot be claimed by another identity before its owner', async () => {
	const context = await setup('victim')
	const payment = await signPayment(context.quote)
	context.chain.mine(payment.authorization)
	const attacker = await context.store.createQuote({ installHash: 'attacker', packId: 'starter_500' })
	await assert.rejects(settle(context, payment, { quoteId: attacker.quoteId }), { code: 'X402_PAYMENT_INVALID' })
	assert.equal(context.ledger.calls, 0)
	assert.equal((await settle(context, payment)).settled, true)
})

test('incomplete facilitator success never credits', async () => {
	for (const response of [{ settlementId: 'fake-success' }, { success: null, transaction: hash() }, { success: 'true', transaction: hash() }]) {
		const context = await setup()
		const facilitator = { verify: async () => ({ isValid: true }), settle: async () => response }
		await assert.rejects(settle(context, await signPayment(context.quote), { facilitator }))
		assert.equal(context.ledger.calls, 0)
	}
})

test('pending retry must not broadcast a second transaction', async () => {
	const context = await setup()
	context.chain.state.mined = false
	const payment = await signPayment(context.quote)
	await assert.rejects(settle(context, payment), { code: 'X402_SETTLEMENT_PENDING' })
	await assert.rejects(settle(context, payment), { code: 'X402_SETTLEMENT_PENDING' })
	assert.equal(context.chain.state.submitted.length, 1)
	context.chain.mine(payment.authorization, context.chain.state.submitted[0])
	assert.equal((await settle(context, payment)).settled, true)
	assert.equal(context.ledger.events.size, 1)
})

test('concurrent copies of the same signed authorization only broadcast once', async () => {
	const context = await setup()
	context.chain.state.delay = 25
	const payment = await signPayment(context.quote)
	const results = await Promise.allSettled(Array.from({ length: 6 }, () => settle(context, payment)))
	assert.ok(results.some(result => result.status === 'fulfilled' && result.value.settled))
	assert.equal(context.chain.state.submitted.length, 1)
	assert.equal(context.ledger.events.size, 1)
})

test('binding is opaque and covers quote, beneficiary and credit terms', async () => {
	const context = await setup('private-beneficiary')
	const exposed = publicX402Quote(context.quote)
	assert.equal(exposed.accepts[0].extra.authorizationBinding, 'quote_nonce_v1')
	assert.match(exposed.accepts[0].extra.authorizationNonce, /^0x[a-f0-9]{64}$/)
	assert.ok(!JSON.stringify(exposed).includes('private-beneficiary'))
	const payment = await signPayment(context.quote)
	for (const change of [
		{ quoteId: 'other-quote' }, { installHash: 'other', customerHash: 'other' }, { credits: 100000 },
		{ packId: 'another-pack' }, { packMetadata: { quoteCapCredits: 9999 } }, { nonce: '00'.repeat(16) },
		{ specDigest: 'modified-spec' }, { quoteCapCredits: 9999 },
		{ expiresAt: new Date(Date.parse(context.quote.expiresAt) + 60000).toISOString() },
	]) {
		await assert.rejects(verifyX402PaymentForQuote({ quote: { ...context.quote, ...change }, paymentPayload: payment }), { code: 'X402_PAYMENT_INVALID' })
	}
})

test('nested quote metadata key order does not change the signed nonce', async () => {
	const context = await setup()
	const quote = await context.store.createQuote({ installHash: 'metadata-owner', packOverride: {
		id: 'service', credits: 5, priceUsdc: 1, metadata: { z: 1, a: { zz: 2, aa: 3 } },
	} })
	const reordered = { ...quote, packMetadata: { a: { aa: 3, zz: 2 }, z: 1 } }
	assert.equal(publicX402Quote(quote).accepts[0].extra.authorizationNonce, publicX402Quote(reordered).accepts[0].extra.authorizationNonce)
	await verifyX402PaymentForQuote({ quote: reordered, paymentPayload: await signPayment(quote) })
})

test('legacy unbound quotes fail closed while already-settled history remains readable', async () => {
	const context = await setup()
	const payment = await signPayment(context.quote)
	const data = JSON.parse(readFileSync(context.store.file, 'utf8'))
	delete data.quotes[context.quoteId].authorizationBindingVersion
	writeFileSync(context.store.file, JSON.stringify(data))
	await assert.rejects(settle(context, payment), { code: 'X402_QUOTE_BINDING_REQUIRED' })
	assert.equal(context.chain.state.submitted.length, 0)
	data.quotes[context.quoteId].state = 'settled'
	data.quotes[context.quoteId].settlementTxHash = hash()
	writeFileSync(context.store.file, JSON.stringify(data))
	assert.equal((await settle(context, {})).idempotent, true)
	assert.equal(context.ledger.calls, 0)
})

test('a second quote for the same identity cannot reuse a signed payment', async () => {
	const context = await setup()
	const payment = await signPayment(context.quote)
	const other = await context.store.createQuote({ installHash: context.quote.installHash, packId: 'starter_500' })
	await assert.rejects(settle(context, payment, { quoteId: other.quoteId }), { code: 'X402_PAYMENT_INVALID' })
	assert.equal(context.chain.state.submitted.length, 0)
	assert.equal(context.ledger.calls, 0)
})

test('wrong recipient, amount, signer domain and chain fail before broadcasts', async () => {
	const context = await setup()
	for (const [patch, signingDomain] of [
		[{ to: '0x4000000000000000000000000000000000000002' }, domain],
		[{ value: 1n }, domain], [{}, { ...domain, chainId: 1 }],
		[{}, { ...domain, verifyingContract: '0x4000000000000000000000000000000000000002' }],
	]) await assert.rejects(settle(context, await signPayment(context.quote, patch, signingDomain)), { code: 'X402_PAYMENT_INVALID' })
	context.chain.state.chainId = 1
	await assert.rejects(settle(context, await signPayment(context.quote)), { code: 'X402_SETTLEMENT_FAILED' })
	assert.equal(context.chain.state.submitted.length, 0)
	assert.equal(context.ledger.calls, 0)
})

test('authorization integers must be canonical uint256 values', async () => {
	const context = await setup()
	const payment = await signPayment(context.quote)
	for (const field of ['value', 'validAfter', 'validBefore']) {
		for (const value of [undefined, null, true, '', ' ', '-1', '01', '0x1', '1e6', '1.2', 1.2, Number.MAX_SAFE_INTEGER + 1, (1n << 256n).toString()]) {
			assert.throws(() => normalizeX402PaymentPayload({ ...payment, authorization: { ...payment.authorization, [field]: value } }), { code: 'X402_PAYMENT_INVALID' })
		}
	}
	const malformedSignature = `0x${'a'.repeat(129)}`
	assert.throws(() => normalizeX402PaymentPayload({ ...payment, signature: malformedSignature }), { code: 'X402_PAYMENT_INVALID' })
})

test('authorization validity must fit its quote and the strict ERC-3009 start boundary', async () => {
	const context = await setup()
	const nowMs = Date.now()
	for (const patch of [
		{ validAfter: BigInt(Math.floor(nowMs / 1000)) },
		{ validAfter: 10n, validBefore: 10n },
		{ validBefore: BigInt(Math.floor(Date.parse(context.quote.expiresAt) / 1000)) + 1n },
	]) await assert.rejects(settle(context, await signPayment(context.quote, patch), { nowMs }), { code: 'X402_PAYMENT_INVALID' })
	assert.equal(context.chain.state.submitted.length, 0)
})

test('expired consumed payment reconciles but an expired unused payment never broadcasts', async () => {
	const context = await setup()
	const payment = await signPayment(context.quote)
	const nowMs = Date.parse(context.quote.expiresAt) + 1000
	await assert.rejects(settle(context, payment, { nowMs }), { code: 'X402_QUOTE_EXPIRED' })
	assert.equal(context.chain.state.submitted.length, 0)
	context.chain.mine(payment.authorization)
	assert.equal((await settle(context, payment, { nowMs })).settled, true)
})

test('receipt must contain the exact nonce consumption and matching payment', async () => {
	for (const mutate of [
		receipt => { receipt.logs.splice(0, 1) },
		receipt => { receipt.logs[0].topics[2] = hash() },
		receipt => { receipt.logs[0].address = '0x4000000000000000000000000000000000000002' },
		receipt => { receipt.logs[1].address = '0x4000000000000000000000000000000000000002' },
		receipt => { receipt.logs[1].data = `0x${'0'.repeat(63)}1` },
		receipt => { receipt.logs[1].data = '0x4c4b40' },
		receipt => { receipt.logs[1].removed = true },
		receipt => { receipt.transactionHash = hash() },
		receipt => { receipt.status = 'reverted' },
	]) {
		const context = await setup()
		const payment = await signPayment(context.quote)
		const transaction = context.chain.mine(payment.authorization)
		mutate(context.chain.state.receipts.get(transaction))
		await assert.rejects(settle(context, payment))
		assert.equal(context.ledger.calls, 0)
		assert.equal(context.chain.state.submitted.length, 0)
	}
})

test('both new and reconciled receipts require safe confirmation depth', async () => {
	for (const alreadyUsed of [false, true]) {
		const context = await setup()
		const payment = await signPayment(context.quote)
		if (alreadyUsed) context.chain.mine(payment.authorization, hash(), 1000)
		else {
			const original = context.chain.waitForReceipt
			context.chain.waitForReceipt = async txHash => {
				const receipt = await original(txHash)
				receipt.blockNumber = 1000
				return receipt
			}
		}
		await assert.rejects(settle(context, payment), { code: 'X402_SETTLEMENT_PENDING' })
		assert.equal(context.ledger.calls, 0)
		context.chain.state.latest = 1002
		assert.equal((await settle(context, payment)).settled, true)
	}
})

test('canceled authorization with no transfer cannot mint credits', async () => {
	const context = await setup()
	const payment = await signPayment(context.quote)
	context.chain.state.used.add(`${payment.authorization.from}:${payment.authorization.nonce}`)
	context.chain.state.canceled.push({ txHash: hash(), blockNumber: 990 })
	await assert.rejects(settle(context, payment), { code: 'X402_AUTHORIZATION_CONSUMED_WITHOUT_PAYMENT' })
	assert.equal(context.ledger.calls, 0)
})

test('complete facilitator responses remain supported, including optional payer omission', async () => {
	for (const includePayer of [false, true]) {
		const context = await setup()
		const transaction = hash()
		let calls = 0
		const facilitator = {
			verify: async () => ({ isValid: true }),
			settle: async () => { calls++; return { success: true, transaction, network: 'eip155:8453', ...(includePayer ? { payer: payer.address } : {}) } },
		}
		const result = await settle(context, await signPayment(context.quote), { facilitator })
		assert.equal(result.settlement.transaction, transaction)
		assert.equal(result.settlement.payer, payer.address.toLowerCase())
		assert.equal(context.ledger.events.size, 1)
		assert.equal(calls, 1)
	}
})

test('facilitator inconsistent success, amount, network, asset, recipient or payer never credits', async () => {
	for (const patch of [
		{ network: 'eip155:1' }, { transaction: '' }, { transaction: 'receipt-1' }, { txHash: hash() },
		{ payer: '0x4000000000000000000000000000000000000002' }, { amount: '1' },
		{ asset: '0x4000000000000000000000000000000000000002' }, { payTo: payer.address },
		{ success: false }, { errorReason: 'failed' },
	]) {
		const context = await setup()
		const facilitator = { verify: async () => ({ isValid: true }), settle: async () => ({ success: true, transaction: hash(), network: 'eip155:8453', ...patch }) }
		await assert.rejects(settle(context, await signPayment(context.quote), { facilitator }))
		assert.equal(context.ledger.calls, 0)
	}
})

test('facilitator contradictory verification never reaches settlement', async () => {
	for (const verification of [{ isValid: false, valid: true }, { isValid: null, valid: true }, { isValid: true, valid: false }, { isValid: true, payer: 'incorrect' }]) {
		const context = await setup()
		let calls = 0
		const facilitator = { verify: async () => verification, settle: async () => { calls++; throw new Error('Should never settle') } }
		await assert.rejects(settle(context, await signPayment(context.quote), { facilitator }), { code: 'X402_PAYMENT_INVALID' })
		assert.equal(calls, 0)
		assert.equal(context.ledger.calls, 0)
	}
})

test('an always-successful facilitator cannot authorize forged or differently bound payments', async () => {
	const context = await setup()
	const payment = await signPayment(context.quote)
	let providerCalls = 0
	const facilitator = {
		verify: async () => { providerCalls++; return { isValid: true } },
		settle: async () => { providerCalls++; return { success: true, transaction: hash(), network: 'eip155:8453' } },
	}
	for (const forged of [
		{ ...payment, signature: `0x${'12'.repeat(65)}` },
		{ ...payment, authorization: { ...payment.authorization, nonce: hash() } },
		{ ...payment, authorization: { ...payment.authorization, value: 1n } },
		{ ...payment, authorization: { ...payment.authorization, to: payer.address.toLowerCase() } },
	]) await assert.rejects(settle(context, forged, { facilitator }), { code: 'X402_PAYMENT_INVALID' })
	assert.equal(providerCalls, 0)
	assert.equal(context.ledger.calls, 0)
})

test('concurrent facilitator retries settle once and independently credit only one event', async () => {
	const context = await setup()
	const payment = await signPayment(context.quote)
	let providerCalls = 0
	const facilitator = {
		verify: async () => ({ isValid: true }),
		settle: async () => {
			providerCalls++
			await new Promise(resolve => setTimeout(resolve, 25))
			return { success: true, transaction: hash(), network: 'eip155:8453' }
		},
	}
	const results = await Promise.all(Array.from({ length: 6 }, () => settle(context, payment, { facilitator })))
	assert.ok(results.every(result => result.settled))
	assert.equal(providerCalls, 1)
	assert.equal(context.ledger.events.size, 1)
})

test('reusing a transaction with a different facilitator receipt id is rejected before any second credit', async () => {
	for (const identity of ['fixture-owner', 'different-owner']) {
		const context = await setup()
		const transaction = hash()
		let receiptId = 0
		const facilitator = { verify: async () => ({ valid: true }), settle: async () => ({ success: true, id: `receipt-${++receiptId}`, network: 'eip155:8453', transaction: receiptId > 1 ? `0x${transaction.slice(2).toUpperCase()}` : transaction }) }
		assert.equal((await settle(context, await signPayment(context.quote), { facilitator })).settled, true)
		const second = await context.store.createQuote({ installHash: identity, packId: 'starter_500' })
		await assert.rejects(settle(context, await signPayment(second), { quoteId: second.quoteId, facilitator }), { code: 'X402_SETTLEMENT_REPLAYED' })
		assert.equal(context.ledger.calls, 1)
	}
})

test('failure to reserve a settlement never credits and retries without rebroadcast', async () => {
	const context = await setup()
	const payment = await signPayment(context.quote)
	const original = context.store.claimSettlement
	context.store.claimSettlement = async () => { throw new Error('fixture: reservation write failed') }
	await assert.rejects(settle(context, payment))
	assert.equal(context.ledger.calls, 0)
	context.store.claimSettlement = original
	assert.equal((await settle(context, payment)).settled, true)
	assert.equal(context.chain.state.submitted.length, 1)
})

test('crashes before and after ledger credit resume the identical claimed proof once', async () => {
	for (const phase of ['before-credit', 'after-credit']) {
		const context = await setup()
		const payment = await signPayment(context.quote)
		const originalCredit = context.ledger.creditCustomer
		const originalMark = context.store.markSettled
		if (phase === 'before-credit') context.ledger.creditCustomer = async () => { throw new Error('fixture: ledger unavailable') }
		else context.store.markSettled = async () => { throw new Error('fixture: final quote write unavailable') }
		await assert.rejects(settle(context, payment))
		assert.equal((await context.store.getQuote(context.quoteId)).state, 'settling')
		context.ledger.creditCustomer = originalCredit
		context.store.markSettled = originalMark
		context.store = createX402QuoteStore()
		const recovered = await settle(context, {}, { nowMs: Date.parse(context.quote.expiresAt) + 1000, chain: null })
		assert.equal(recovered.settled, true)
		assert.equal(context.ledger.events.size, 1)
		assert.equal(context.chain.state.submitted.length, 1)
	}
})

test('ambiguous facilitator submission reconciles consumed authorization without resubmitting', async () => {
	const context = await setup()
	const payment = await signPayment(context.quote)
	let calls = 0
	const facilitator = { verify: async () => ({ isValid: true }), settle: async () => {
		calls++
		context.chain.mine(payment.authorization)
		throw new Error('fixture: connection lost after submission')
	} }
	await assert.rejects(settle(context, payment, { facilitator }))
	assert.equal((await settle(context, payment, { facilitator })).settled, true)
	assert.equal(calls, 1)
	assert.equal(context.chain.state.submitted.length, 0)
})

test('corrupt local quote storage is never silently reset or overwritten', async () => {
	const context = await setup()
	const corrupted = '{incomplete'
	writeFileSync(context.store.file, corrupted)
	await assert.rejects(context.store.getQuote(context.quoteId), { code: 'X402_STORE_UNAVAILABLE' })
	await assert.rejects(context.store.createQuote({ installHash: 'attacker', packId: 'starter_500' }), { code: 'X402_STORE_UNAVAILABLE' })
	assert.equal(readFileSync(context.store.file, 'utf8'), corrupted)
})

test('unrepresentable payment amounts do not produce signable quotes', async () => {
	const context = await setup()
	for (const packOverride of [
		{ id: 'fixture', credits: 100, priceUsdc: 0.0000001 },
		{ id: 'fixture', credits: 0.0001, priceUsdc: 1 },
		{ id: 'fixture', credits: 1, priceUsdc: Number.MAX_SAFE_INTEGER },
	]) await assert.rejects(context.store.createQuote({ installHash: 'fixture', packOverride }), { code: 'CRYPTO_PACK_INVALID' })
})

function enableFinalityFixture(chain) {
	chain.state.finalized = { number: 1000n, hash: blockHashFor(1000) }
	chain.getFinalizedBlock = async () => chain.state.finalized
	chain.getBlockByNumber = async number => ({ number: BigInt(number), hash: blockHashFor(number) })
}

async function withProductionFlag(name, value, callback) {
	process.env[name] = value
	try { return await callback() }
	finally { if (name === 'NODE_ENV') process.env.NODE_ENV = 'test'; else delete process.env[name] }
}

test('every production environment indicator requires finalized canonical receipts', async () => {
	for (const [name, value] of [['BETTERPPTX_ENV', 'production'], ['BETTERPPTX_DEPLOYMENT_STAGE', 'prod'], ['NODE_ENV', 'live']]) {
		const context = await setup()
		const payment = await signPayment(context.quote)
		await withProductionFlag(name, value, async () => {
			await assert.rejects(settle(context, payment), { code: 'X402_SETTLEMENT_PENDING' })
			assert.equal(context.ledger.calls, 0)
			enableFinalityFixture(context.chain)
			assert.equal((await settle(context, payment)).settled, true)
			assert.equal(context.chain.state.submitted.length, 1)
		})
	}
})

test('depth-confirmed production payments wait until their block is finalized', async () => {
	const context = await setup()
	const payment = await signPayment(context.quote)
	enableFinalityFixture(context.chain)
	context.chain.state.finalized = { number: 989n, hash: blockHashFor(989) }
	await withProductionFlag('BETTERPPTX_ENV', 'production', async () => {
		await assert.rejects(settle(context, payment), { code: 'X402_SETTLEMENT_PENDING' })
		assert.equal(context.ledger.calls, 0)
		context.chain.state.finalized = { number: 990n, hash: blockHashFor(990) }
		assert.equal((await settle(context, payment)).settled, true)
		assert.equal(context.chain.state.submitted.length, 1)
	})
})

test('production rejects orphaned receipts, inconsistent canonical blocks and unavailable finality', async () => {
	for (const change of [
		(context, transaction) => { context.chain.state.receipts.get(transaction).blockHash = hash() },
		(context, transaction) => { delete context.chain.state.receipts.get(transaction).blockHash },
		context => { context.chain.getBlockByNumber = async () => ({ number: 991n, hash: blockHashFor(990) }) },
		context => { context.chain.getFinalizedBlock = async () => { throw new Error('fixture: finalized tag unsupported') } },
		context => { context.chain.state.finalized = null },
		context => { context.chain.state.finalized = { number: 1000n, hash: 'invalid' } },
		context => { context.chain.state.finalized = { number: 990n, hash: hash() } },
	]) {
		const context = await setup()
		const payment = await signPayment(context.quote)
		enableFinalityFixture(context.chain)
		const transaction = context.chain.mine(payment.authorization)
		change(context, transaction)
		await withProductionFlag('BETTERPPTX_DEPLOYMENT_STAGE', 'production', async () => {
			await assert.rejects(settle(context, payment), { code: 'X402_SETTLEMENT_PENDING' })
			assert.equal(context.ledger.calls, 0)
			assert.equal(context.chain.state.submitted.length, 0)
		})
	}
})

test('production facilitator success needs an independently finalized matching receipt', async () => {
	const context = await setup()
	const payment = await signPayment(context.quote)
	const transaction = hash()
	let calls = 0
	const facilitator = { verify: async () => ({ isValid: true }), settle: async () => { calls++; return { success: true, transaction, network: 'eip155:8453' } } }
	await withProductionFlag('BETTERPPTX_ENV', 'production', async () => {
		await assert.rejects(settle(context, payment, { facilitator }), { code: 'X402_SETTLEMENT_PENDING' })
		assert.equal(context.ledger.calls, 0)
		context.chain.mine(payment.authorization, transaction)
		enableFinalityFixture(context.chain)
		assert.equal((await settle(context, payment, { facilitator })).settled, true)
		assert.equal(calls, 1)
		assert.equal(context.chain.state.submitted.length, 0)
	})
})

test('production rechecks finalized canonical evidence before resuming a stored credit claim', async () => {
	const context = await setup()
	const original = context.ledger.creditCustomer
	context.ledger.creditCustomer = async () => { throw new Error('fixture: credit interrupted') }
	await assert.rejects(settle(context, await signPayment(context.quote)))
	assert.equal((await context.store.getQuote(context.quoteId)).state, 'settling')
	context.ledger.creditCustomer = original
	await withProductionFlag('BETTERPPTX_DEPLOYMENT_STAGE', 'live', async () => {
		await assert.rejects(settle(context, {}), { code: 'X402_SETTLEMENT_PENDING' })
		assert.equal(context.ledger.calls, 0)
		enableFinalityFixture(context.chain)
		assert.equal((await settle(context, {})).settled, true)
		assert.equal(context.ledger.events.size, 1)
	})
})

test('real chain adapter requires finality even without production flags', () => {
	// Client construction is inert. No provider methods are invoked.
	const chain = createBaseSelfSettleChain({ rpcUrl: 'https://rpc.fixture.invalid' })
	assert.equal(chain.requiresFinality, true)
	assert.equal(typeof chain.getFinalizedBlock, 'function')
	assert.equal(typeof chain.getBlockByNumber, 'function')
})
