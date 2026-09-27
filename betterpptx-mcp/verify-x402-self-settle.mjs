import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomBytes } from 'node:crypto'

const outputDir = path.resolve('outputs', 'x402-self-settle-verify', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_X402_STORE = 'local'
process.env.BETTERPPTX_X402_FILE = path.join(outputDir, 'quotes.json')
process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(outputDir, 'ledger.json')
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.BETTERPPTX_TREASURY_EVM_ADDRESS = '0x4000000000000000000000000000000000000001'
process.env.BETTERPPTX_PAYMENT_ENVELOPE_SECRET = 'verify-x402-self-settle-envelope-0123456789abcdef'
process.env.BETTERPPTX_INSTALL_HMAC_SECRET = 'verify-x402-self-settle-install-0123456789abcdef'
process.env.BETTERPPTX_BILLING_PROVIDER = 'crypto_credits'
process.env.BETTERPPTX_BASE_SAFE_DEPTH = '2'
delete process.env.BETTERPPTX_X402_SETTLEMENT_MODE

const { encodeAbiParameters, keccak256, stringToHex } = await import('viem')
const { privateKeyToAccount } = await import('viem/accounts')
const { createBillingLedgerStore } = await import('./billing/ledger-store.mjs')
const { createX402QuoteStore, settleX402Quote } = await import('./billing/x402-packs.mjs')
const { BASE_USDC_CONTRACT } = await import('./billing/crypto-orders.mjs')
const { eip3009SettlementId, x402SettlementMode } = await import('./billing/x402-self-settle.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

async function expectCode(code, fn) {
	try {
		await fn()
	} catch (error) {
		if (error?.code === code) return error
		throw error
	}
	throw new Error(`Expected ${code}.`)
}

const treasury = process.env.BETTERPPTX_TREASURY_EVM_ADDRESS.toLowerCase()
const payer = privateKeyToAccount(`0x${'11'.repeat(32)}`)
const payerAddress = payer.address.toLowerCase()

const eip712Domain = {
	name: 'USD Coin',
	version: '2',
	chainId: 8453,
	verifyingContract: BASE_USDC_CONTRACT,
}
const domainSeparator = keccak256(encodeAbiParameters(
	[{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
	[
		keccak256(stringToHex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
		keccak256(stringToHex(eip712Domain.name)),
		keccak256(stringToHex(eip712Domain.version)),
		BigInt(eip712Domain.chainId),
		eip712Domain.verifyingContract,
	],
))
const eip712Types = {
	TransferWithAuthorization: [
		{ name: 'from', type: 'address' },
		{ name: 'to', type: 'address' },
		{ name: 'value', type: 'uint256' },
		{ name: 'validAfter', type: 'uint256' },
		{ name: 'validBefore', type: 'uint256' },
		{ name: 'nonce', type: 'bytes32' },
	],
}

async function signedAuthorization({ value = 5000000n, to = treasury } = {}) {
	const authorization = {
		from: payerAddress,
		to,
		value,
		validAfter: 0n,
		validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600),
		nonce: `0x${randomBytes(32).toString('hex')}`,
	}
	const signature = await payer.signTypedData({
		domain: eip712Domain,
		types: eip712Types,
		primaryType: 'TransferWithAuthorization',
		message: authorization,
	})
	return { authorization, signature }
}

function topicFor(address) {
	return `0x${address.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`
}

const TRANSFER_TOPIC = keccak256(stringToHex('Transfer(address,address,uint256)'))

function transferReceipt({ txHash, blockNumber, from, to, value, status = 'success' }) {
	return {
		status,
		blockNumber,
		transactionHash: txHash,
		logs: status === 'success' ? [{
			address: BASE_USDC_CONTRACT,
			topics: [TRANSFER_TOPIC, topicFor(from), topicFor(to)],
			data: `0x${value.toString(16)}`,
		}] : [],
	}
}

function fakeChain({ chainId = 8453 } = {}) {
	const state = {
		chainId,
		latest: 1000,
		used: new Set(),
		usedLogs: new Map(),
		canceledLogs: new Map(),
		receipts: new Map(),
		submitted: [],
		mineOnSubmit: true,
		receiptOnWait: true,
	}
	const key = (authorizer, nonce) => `${authorizer.toLowerCase()}:${nonce.toLowerCase()}`
	return {
		state,
		async chainId() { return state.chainId },
		async latestBlockNumber() { return state.latest },
		async readDomainSeparator() { return domainSeparator },
		async readAuthorizationState(token, authorizer, nonce) { return state.used.has(key(authorizer, nonce)) },
		async submitTransferWithAuthorization({ authorization }) {
			const id = key(authorization.from, authorization.nonce)
			if (state.used.has(id)) {
				const error = new Error('authorization is used or canceled')
				error.details = { reason: 'simulate-reverted' }
				throw error
			}
			const txHash = `0x${randomBytes(32).toString('hex')}`
			state.submitted.push(txHash)
			if (state.mineOnSubmit) {
				state.used.add(id)
				state.usedLogs.set(id, [{ txHash, blockNumber: state.latest - 5 }])
				state.receipts.set(txHash, transferReceipt({
					txHash,
					blockNumber: state.latest - 5,
					from: authorization.from,
					to: authorization.to,
					value: authorization.value,
				}))
			}
			return txHash
		},
		async waitForReceipt(txHash) { return state.receiptOnWait ? state.receipts.get(txHash) || null : null },
		async getTransactionReceipt(txHash) { return state.receipts.get(txHash) || null },
		async getAuthorizationUsedLogs({ authorizer, nonce }) { return state.usedLogs.get(key(authorizer, nonce)) || [] },
		async getAuthorizationCanceledLogs({ authorizer, nonce }) { return state.canceledLogs.get(key(authorizer, nonce)) || [] },
	}
}

const store = createX402QuoteStore()
const ledger = createBillingLedgerStore()

expect(x402SettlementMode() === 'self_settle', 'Launch default settlement mode must be self_settle.')

// --- 1. Relayer happy path: verify, submit, confirm, credit exactly once.
const install1 = 'install_selfsettle_1'
const quote1 = await store.createQuote({ installHash: install1, packId: 'starter_500', envelopeJti: 'ss_env_1' })
const chain1 = fakeChain()
const pay1 = await signedAuthorization()
const settled1 = await settleX402Quote({
	quoteId: quote1.quoteId,
	paymentPayload: { signature: pay1.signature, authorization: pay1.authorization },
	store,
	ledger,
	chain: chain1,
})
expect(settled1.settled === true && settled1.creditedCredits === 500, 'Self-settle relayer path must credit the pack.', { settled1 })
expect(chain1.state.submitted.length === 1, 'Relayer path must submit exactly one transaction.', { submitted: chain1.state.submitted })
let customer = await ledger.getCustomer(install1)
expect(customer.availableBalanceCredits === 500, 'Self-settle did not credit the ledger.', { customer })
const storedQuote1 = await store.getQuote(quote1.quoteId)
expect(storedQuote1.settlementTxHash === chain1.state.submitted[0], 'Settlement must record the consuming transaction hash.', { storedQuote1 })
expect(storedQuote1.settlementRoute === 'relayer', 'Settlement route must be recorded.', { storedQuote1 })

// Replay of a settled quote is idempotent and does not touch the chain.
const replay = await settleX402Quote({ quoteId: quote1.quoteId, paymentPayload: {}, store, ledger, chain: fakeChain() })
expect(replay.idempotent === true, 'Settled quote replay must be idempotent.', { replay })
customer = await ledger.getCustomer(install1)
expect(customer.availableBalanceCredits === 500, 'Settled replay double-credited.', { customer })

// --- 2. Front-run: authorization consumed by another submitter, exact treasury transfer present.
const install2 = 'install_selfsettle_2'
const quote2 = await store.createQuote({ installHash: install2, packId: 'starter_500', envelopeJti: 'ss_env_2' })
const chain2 = fakeChain()
const pay2 = await signedAuthorization()
const frontRunTx = `0x${randomBytes(32).toString('hex')}`
const frontRunKey = `${pay2.authorization.from}:${pay2.authorization.nonce.toLowerCase()}`
chain2.state.used.add(frontRunKey)
chain2.state.usedLogs.set(frontRunKey, [{ txHash: frontRunTx, blockNumber: chain2.state.latest - 10 }])
chain2.state.receipts.set(frontRunTx, transferReceipt({
	txHash: frontRunTx,
	blockNumber: chain2.state.latest - 10,
	from: pay2.authorization.from,
	to: treasury,
	value: 5000000n,
}))
const settled2 = await settleX402Quote({
	quoteId: quote2.quoteId,
	paymentPayload: { payload: { signature: pay2.signature, authorization: pay2.authorization } },
	store,
	ledger,
	chain: chain2,
})
expect(settled2.settled === true && settled2.creditedCredits === 500, 'Front-run payment must reconcile as success.', { settled2 })
expect(chain2.state.submitted.length === 0, 'Front-run reconcile must not submit a relayer transaction.', { submitted: chain2.state.submitted })
const storedQuote2 = await store.getQuote(quote2.quoteId)
expect(storedQuote2.settlementTxHash === frontRunTx, 'Front-run reconcile must record the actual consuming transaction.', { storedQuote2 })
expect(storedQuote2.settlementRoute === 'reconciled_already_consumed', 'Front-run route must be recorded.', { storedQuote2 })
customer = await ledger.getCustomer(install2)
expect(customer.availableBalanceCredits === 500, 'Front-run reconcile did not credit exactly once.', { customer })

// --- 2b. Expired quote retry: already-consumed exact treasury transfer still reconciles.
const install2b = 'install_selfsettle_2b'
const quote2b = await store.createQuote({ installHash: install2b, packId: 'starter_500', envelopeJti: 'ss_env_2b' })
const chain2b = fakeChain()
const pay2b = await signedAuthorization()
const expiredConsumedTx = `0x${randomBytes(32).toString('hex')}`
const expiredConsumedKey = `${pay2b.authorization.from}:${pay2b.authorization.nonce.toLowerCase()}`
chain2b.state.used.add(expiredConsumedKey)
chain2b.state.usedLogs.set(expiredConsumedKey, [{ txHash: expiredConsumedTx, blockNumber: chain2b.state.latest - 10 }])
chain2b.state.receipts.set(expiredConsumedTx, transferReceipt({
	txHash: expiredConsumedTx,
	blockNumber: chain2b.state.latest - 10,
	from: pay2b.authorization.from,
	to: treasury,
	value: 5000000n,
}))
const settled2b = await settleX402Quote({
	quoteId: quote2b.quoteId,
	paymentPayload: { signature: pay2b.signature, authorization: pay2b.authorization },
	store,
	ledger,
	chain: chain2b,
	nowMs: Date.parse(quote2b.expiresAt) + 1000,
})
expect(settled2b.settled === true && settled2b.creditedCredits === 500, 'Expired consumed quote must reconcile as success.', { settled2b })
expect(chain2b.state.submitted.length === 0, 'Expired consumed reconcile must not broadcast.', { submitted: chain2b.state.submitted })
customer = await ledger.getCustomer(install2b)
expect(customer.availableBalanceCredits === 500, 'Expired consumed reconcile did not credit exactly once.', { customer })

// --- 2c. Expired unconsumed quote: reject without burning relayer gas.
const quote2c = await store.createQuote({ installHash: 'install_selfsettle_2c', packId: 'starter_500', envelopeJti: 'ss_env_2c' })
const chain2c = fakeChain()
const pay2c = await signedAuthorization()
await expectCode('X402_QUOTE_EXPIRED', () => settleX402Quote({
	quoteId: quote2c.quoteId,
	paymentPayload: { signature: pay2c.signature, authorization: pay2c.authorization },
	store,
	ledger,
	chain: chain2c,
	nowMs: Date.parse(quote2c.expiresAt) + 1000,
}))
expect(chain2c.state.submitted.length === 0, 'Expired unconsumed quote must not broadcast.', { submitted: chain2c.state.submitted })
expect((await store.getQuote(quote2c.quoteId)).state !== 'settled', 'Expired unconsumed quote must not settle.')

// --- 3. Cancel abuse: nonce consumed via cancelAuthorization, no treasury transfer. Must not credit.
const install3 = 'install_selfsettle_3'
const quote3 = await store.createQuote({ installHash: install3, packId: 'starter_500', envelopeJti: 'ss_env_3' })
const chain3 = fakeChain()
const pay3 = await signedAuthorization()
const cancelKey = `${pay3.authorization.from}:${pay3.authorization.nonce.toLowerCase()}`
chain3.state.used.add(cancelKey)
chain3.state.canceledLogs.set(cancelKey, [{ txHash: `0x${randomBytes(32).toString('hex')}`, blockNumber: chain3.state.latest - 10 }])
await expectCode('X402_AUTHORIZATION_CONSUMED_WITHOUT_PAYMENT', () => settleX402Quote({
	quoteId: quote3.quoteId,
	paymentPayload: { signature: pay3.signature, authorization: pay3.authorization },
	store,
	ledger,
	chain: chain3,
}))
customer = await ledger.getCustomer(install3)
expect((customer?.availableBalanceCredits || 0) === 0, 'Canceled authorization must not credit.', { customer })
expect((await store.getQuote(quote3.quoteId)).state !== 'settled', 'Canceled authorization must not settle the quote.')

// --- 4. Tampered bindings are rejected before any chain mutation.
const quote4 = await store.createQuote({ installHash: 'install_selfsettle_4', packId: 'starter_500', envelopeJti: 'ss_env_4' })
const chain4 = fakeChain()
const pay4 = await signedAuthorization()
await expectCode('X402_PAYMENT_INVALID', () => settleX402Quote({
	quoteId: quote4.quoteId,
	paymentPayload: { signature: pay4.signature, authorization: { ...pay4.authorization, value: '4000000' } },
	store,
	ledger,
	chain: chain4,
}))
const wrongRecipient = await signedAuthorization({ to: '0x4000000000000000000000000000000000000002' })
await expectCode('X402_PAYMENT_INVALID', () => settleX402Quote({
	quoteId: quote4.quoteId,
	paymentPayload: { signature: wrongRecipient.signature, authorization: wrongRecipient.authorization },
	store,
	ledger,
	chain: chain4,
}))
const foreignSigner = await signedAuthorization()
await expectCode('X402_PAYMENT_INVALID', () => settleX402Quote({
	quoteId: quote4.quoteId,
	paymentPayload: {
		signature: foreignSigner.signature,
		authorization: { ...foreignSigner.authorization, from: '0x4000000000000000000000000000000000000003' },
	},
	store,
	ledger,
	chain: chain4,
}))
expect(chain4.state.submitted.length === 0, 'Invalid payments must never reach the relayer.', { submitted: chain4.state.submitted })

// --- 5. Broadcast timeout then retry: recovers the consuming transaction exactly once.
const install5 = 'install_selfsettle_5'
const quote5 = await store.createQuote({ installHash: install5, packId: 'starter_500', envelopeJti: 'ss_env_5' })
const chain5 = fakeChain()
chain5.state.mineOnSubmit = false
const pay5 = await signedAuthorization()
const payload5 = { signature: pay5.signature, authorization: pay5.authorization }
await expectCode('X402_SETTLEMENT_PENDING', () => settleX402Quote({ quoteId: quote5.quoteId, paymentPayload: payload5, store, ledger, chain: chain5 }))
expect(chain5.state.submitted.length === 1, 'Timeout path must have broadcast once.', { submitted: chain5.state.submitted })
customer = await ledger.getCustomer(install5)
expect((customer?.availableBalanceCredits || 0) === 0, 'Pending settlement must not credit.', { customer })
const minedTx = chain5.state.submitted[0]
const key5 = `${pay5.authorization.from}:${pay5.authorization.nonce.toLowerCase()}`
chain5.state.used.add(key5)
chain5.state.usedLogs.set(key5, [{ txHash: minedTx, blockNumber: chain5.state.latest - 3 }])
chain5.state.receipts.set(minedTx, transferReceipt({
	txHash: minedTx,
	blockNumber: chain5.state.latest - 3,
	from: pay5.authorization.from,
	to: treasury,
	value: 5000000n,
}))
const settled5 = await settleX402Quote({ quoteId: quote5.quoteId, paymentPayload: payload5, store, ledger, chain: chain5 })
expect(settled5.settled === true, 'Retry after timeout must settle.', { settled5 })
expect(chain5.state.submitted.length === 1, 'Retry must not re-broadcast a consumed authorization.', { submitted: chain5.state.submitted })
expect((await store.getQuote(quote5.quoteId)).settlementTxHash === minedTx, 'Retry must record the original consuming transaction.')
customer = await ledger.getCustomer(install5)
expect(customer.availableBalanceCredits === 500, 'Timeout retry must credit exactly once.', { customer })
expect(eip3009SettlementId(pay5.authorization) === (await store.getQuote(quote5.quoteId)).settlementId, 'Settlement id must be deterministic from (authorizer, nonce).')

// --- 6. Confirmation depth: unconfirmed consuming transaction stays pending, then credits after depth.
const install6 = 'install_selfsettle_6'
const quote6 = await store.createQuote({ installHash: install6, packId: 'starter_500', envelopeJti: 'ss_env_6' })
const chain6 = fakeChain()
const pay6 = await signedAuthorization()
const shallowTx = `0x${randomBytes(32).toString('hex')}`
const key6 = `${pay6.authorization.from}:${pay6.authorization.nonce.toLowerCase()}`
chain6.state.used.add(key6)
chain6.state.usedLogs.set(key6, [{ txHash: shallowTx, blockNumber: chain6.state.latest }])
chain6.state.receipts.set(shallowTx, transferReceipt({
	txHash: shallowTx,
	blockNumber: chain6.state.latest,
	from: pay6.authorization.from,
	to: treasury,
	value: 5000000n,
}))
const payload6 = { signature: pay6.signature, authorization: pay6.authorization }
chain6.state.latest = chain6.state.receipts.get(shallowTx).blockNumber // 1 confirmation < depth 2
await expectCode('X402_SETTLEMENT_PENDING', () => settleX402Quote({ quoteId: quote6.quoteId, paymentPayload: payload6, store, ledger, chain: chain6 }))
chain6.state.latest += 5
const settled6 = await settleX402Quote({ quoteId: quote6.quoteId, paymentPayload: payload6, store, ledger, chain: chain6 })
expect(settled6.settled === true, 'Confirmed consuming transaction must settle after depth.', { settled6 })
customer = await ledger.getCustomer(install6)
expect(customer.availableBalanceCredits === 500, 'Depth-gated settlement must credit exactly once.', { customer })

// --- 7. Wrong chain endpoint must never settle.
const quote7 = await store.createQuote({ installHash: 'install_selfsettle_7', packId: 'starter_500', envelopeJti: 'ss_env_7' })
const pay7 = await signedAuthorization()
await expectCode('X402_SETTLEMENT_FAILED', () => settleX402Quote({
	quoteId: quote7.quoteId,
	paymentPayload: { signature: pay7.signature, authorization: pay7.authorization },
	store,
	ledger,
	chain: fakeChain({ chainId: 1 }),
}))

// --- 8. Invalid settlement mode is rejected; explicit facilitator injection still works.
process.env.BETTERPPTX_X402_SETTLEMENT_MODE = 'mystery_mode'
await expectCode('X402_SETTLEMENT_MODE_INVALID', () => settleX402Quote({ quoteId: quote7.quoteId, paymentPayload: {}, store, ledger }))
delete process.env.BETTERPPTX_X402_SETTLEMENT_MODE
const facilitatorSettled = await settleX402Quote({
	quoteId: quote7.quoteId,
	paymentPayload: { any: true },
	store,
	ledger,
	facilitator: {
		verify: async () => ({ isValid: true }),
		settle: async () => ({ settlementId: 'facilitator_compat_1' }),
	},
})
expect(facilitatorSettled.settled === true, 'Injected facilitator path must keep working.', { facilitatorSettled })

console.log('X402 SELF-SETTLE: PASS relayer=1 frontRunReconciled=1 expiredConsumedReconciled=1 expiredUnconsumedRejected=1 cancelRejected=1 tamperRejected=3 timeoutRetryExactlyOnce=1 depthGated=1 wrongChain=1 modeGuard=1')
