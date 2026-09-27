import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomBytes } from 'node:crypto'

const outputDir = path.resolve('outputs', 'x402-relayer-concurrency-verify', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_X402_STORE = 'local'
process.env.BETTERPPTX_X402_RELAYER_LEASE_STORE = 'local'
process.env.BETTERPPTX_X402_FILE = path.join(outputDir, 'quotes.json')
process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(outputDir, 'ledger.json')
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.BETTERPPTX_TREASURY_EVM_ADDRESS = '0x4000000000000000000000000000000000000001'
process.env.BETTERPPTX_BILLING_PROVIDER = 'crypto_credits'
process.env.BETTERPPTX_BASE_SAFE_DEPTH = '1'
delete process.env.BETTERPPTX_X402_SETTLEMENT_MODE

const { encodeAbiParameters, keccak256, stringToHex } = await import('viem')
const { privateKeyToAccount } = await import('viem/accounts')
const { withRelayerBroadcastLease } = await import('./billing/relayer-lease.mjs')
const { createBillingLedgerStore } = await import('./billing/ledger-store.mjs')
const { createX402QuoteStore, settleX402Quote } = await import('./billing/x402-packs.mjs')
const { BASE_USDC_CONTRACT } = await import('./billing/crypto-orders.mjs')

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

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

let active = 0
let maxActive = 0
const leaseTokens = await Promise.all(Array.from({ length: 6 }, (_, index) => withRelayerBroadcastLease({ keyId: 'same-key' }, async lease => {
	active += 1
	maxActive = Math.max(maxActive, active)
	await sleep(20)
	active -= 1
	return `${index}:${lease.fencingToken}`
})))
expect(maxActive === 1, 'Same relayer key must serialize broadcast leases.', { maxActive, leaseTokens })
expect(new Set(leaseTokens.map(item => item.split(':')[1])).size === leaseTokens.length, 'Each lease must carry a fresh fencing token.', { leaseTokens })

let globalActive = 0
let globalMax = 0
await Promise.all(['key-a', 'key-b'].map(keyId => withRelayerBroadcastLease({ keyId }, async () => {
	globalActive += 1
	globalMax = Math.max(globalMax, globalActive)
	await sleep(40)
	globalActive -= 1
})))
expect(globalMax >= 2, 'Different relayer keys should not block each other in the local lease backend.', { globalMax })

process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '1'
await expectCode('RELAYER_LEASE_NOT_SHARED', () => withRelayerBroadcastLease({ keyId: 'same-key' }, async () => true))
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'

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

async function signedAuthorization() {
	const authorization = {
		from: payerAddress,
		to: treasury,
		value: 5000000n,
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

function fakeChain() {
	const state = {
		latest: 1000,
		used: new Set(),
		usedLogs: new Map(),
		receipts: new Map(),
		submitActive: 0,
		submitMaxActive: 0,
		submitted: [],
	}
	const key = (authorizer, nonce) => `${authorizer.toLowerCase()}:${nonce.toLowerCase()}`
	function transferReceipt({ txHash, authorization }) {
		return {
			status: 'success',
			blockNumber: state.latest - 5,
			transactionHash: txHash,
			logs: [{
				address: BASE_USDC_CONTRACT,
				topics: [TRANSFER_TOPIC, topicFor(authorization.from), topicFor(authorization.to)],
				data: `0x${authorization.value.toString(16)}`,
			}],
		}
	}
	return {
		state,
		async chainId() { return 8453 },
		async latestBlockNumber() { return state.latest },
		async readDomainSeparator() { return domainSeparator },
		async readAuthorizationState(_token, authorizer, nonce) { return state.used.has(key(authorizer, nonce)) },
		async submitTransferWithAuthorization({ authorization }) {
			state.submitActive += 1
			state.submitMaxActive = Math.max(state.submitMaxActive, state.submitActive)
			await sleep(35)
			const txHash = `0x${randomBytes(32).toString('hex')}`
			const id = key(authorization.from, authorization.nonce)
			state.used.add(id)
			state.usedLogs.set(id, [{ txHash, blockNumber: state.latest - 5 }])
			state.receipts.set(txHash, transferReceipt({ txHash, authorization }))
			state.submitted.push(txHash)
			state.submitActive -= 1
			return txHash
		},
		async waitForReceipt(txHash) { return state.receipts.get(txHash) || null },
		async getTransactionReceipt(txHash) { return state.receipts.get(txHash) || null },
		async getAuthorizationUsedLogs({ authorizer, nonce }) { return state.usedLogs.get(key(authorizer, nonce)) || [] },
		async getAuthorizationCanceledLogs() { return [] },
	}
}

const store = createX402QuoteStore()
const ledger = createBillingLedgerStore()
const chain = fakeChain()
const quoteA = await store.createQuote({ installHash: 'install_relayer_concurrency_a', packId: 'starter_500', envelopeJti: 'relayer_env_a' })
const quoteB = await store.createQuote({ installHash: 'install_relayer_concurrency_b', packId: 'starter_500', envelopeJti: 'relayer_env_b' })
const payA = await signedAuthorization()
const payB = await signedAuthorization()

const [settledA, settledB] = await Promise.all([
	settleX402Quote({ quoteId: quoteA.quoteId, paymentPayload: { signature: payA.signature, authorization: payA.authorization }, store, ledger, chain }),
	settleX402Quote({ quoteId: quoteB.quoteId, paymentPayload: { signature: payB.signature, authorization: payB.authorization }, store, ledger, chain }),
])
expect(settledA.settled === true && settledB.settled === true, 'Concurrent settlement calls should both settle.', { settledA, settledB })
expect(chain.state.submitted.length === 2, 'Both concurrent settlement calls should broadcast exactly once.', { submitted: chain.state.submitted })
expect(chain.state.submitMaxActive === 1, 'settleX402Quote must serialize same-key relayer broadcasts.', { maxActive: chain.state.submitMaxActive })
expect((await ledger.getCustomer('install_relayer_concurrency_a')).availableBalanceCredits === 500, 'First concurrent settlement did not credit.')
expect((await ledger.getCustomer('install_relayer_concurrency_b')).availableBalanceCredits === 500, 'Second concurrent settlement did not credit.')

console.log('X402 RELAYER CONCURRENCY: PASS sameKeySerialized=1 differentKeysParallel=1 sharedStoreGuard=1 settlePathSerialized=1')
