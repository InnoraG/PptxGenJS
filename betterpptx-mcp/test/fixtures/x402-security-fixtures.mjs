import { randomBytes } from 'node:crypto'
import { encodeAbiParameters, keccak256, stringToHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { publicX402Quote } from '../../billing/x402-packs.mjs'
import { BASE_USDC_CONTRACT } from '../../billing/crypto-orders.mjs'

// Public, disposable test identity. Never load a wallet, dotenv file, or provider.
export const payer = privateKeyToAccount(`0x${'11'.repeat(32)}`)
export const treasury = '0x4000000000000000000000000000000000000001'
export const token = BASE_USDC_CONTRACT
export const domain = { name: 'USD Coin', version: '2', chainId: 8453, verifyingContract: token }
export const domainSeparator = keccak256(encodeAbiParameters(
	[{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
	[keccak256(stringToHex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
		keccak256(stringToHex(domain.name)), keccak256(stringToHex(domain.version)), 8453n, token],
))
export const types = { TransferWithAuthorization: [
	{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
	{ name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
] }
export const hash = () => `0x${randomBytes(32).toString('hex')}`
export const topic = address => `0x${address.slice(2).toLowerCase().padStart(64, '0')}`
export const transferTopic = keccak256(stringToHex('Transfer(address,address,uint256)'))
export const usedTopic = keccak256(stringToHex('AuthorizationUsed(address,bytes32)'))
export const blockHashFor = number => `0x${BigInt(number).toString(16).padStart(64, '0')}`

export async function signPayment(quote, patch = {}, signingDomain = domain, account = payer) {
	const authorization = {
		from: account.address.toLowerCase(), to: quote.payTo, value: BigInt(quote.amountAtomic), validAfter: 0n,
		validBefore: BigInt(Math.floor(Date.parse(quote.expiresAt) / 1000) - 1),
		nonce: publicX402Quote(quote).accepts[0].extra.authorizationNonce || hash(), ...patch,
	}
	return { authorization, signature: await account.signTypedData({ domain: signingDomain, types, primaryType: 'TransferWithAuthorization', message: authorization }) }
}

export function receiptFor(authorization, txHash = hash(), blockNumber = 990) {
	return { status: 'success', transactionHash: txHash, blockNumber, blockHash: blockHashFor(blockNumber), logs: [
		{ address: token, topics: [usedTopic, topic(authorization.from), authorization.nonce], data: '0x' },
		{ address: token, topics: [transferTopic, topic(authorization.from), topic(authorization.to)], data: `0x${BigInt(authorization.value).toString(16).padStart(64, '0')}` },
	] }
}

export function fakeChain() {
	const state = { latest: 1000, chainId: 8453, mined: true, submitted: [], used: new Set(), usedLogs: new Map(), receipts: new Map(), canceled: [], delay: 0 }
	const key = auth => `${auth.from}:${auth.nonce}`.toLowerCase()
	function mine(authorization, txHash = hash(), blockNumber = 990) {
		state.used.add(key(authorization))
		state.usedLogs.set(key(authorization), [{ txHash, blockNumber }])
		state.receipts.set(txHash, receiptFor(authorization, txHash, blockNumber))
		return txHash
	}
	return {
		state, mine,
		async chainId() { return state.chainId },
		async latestBlockNumber() { return state.latest },
		async readDomainSeparator() { return domainSeparator },
		async readAuthorizationState(_token, from, nonce) { return state.used.has(key({ from, nonce })) },
		async submitTransferWithAuthorization({ authorization }) {
			if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay))
			const txHash = hash()
			state.submitted.push(txHash)
			if (state.mined) mine(authorization, txHash)
			return txHash
		},
		async waitForReceipt(txHash) { return state.receipts.get(txHash) || null },
		async getTransactionReceipt(txHash) { return state.receipts.get(txHash) || null },
		async getAuthorizationUsedLogs({ authorizer, nonce }) { return state.usedLogs.get(key({ from: authorizer, nonce })) || [] },
		async getAuthorizationCanceledLogs() { return state.canceled },
	}
}

export function fakeLedger() {
	const events = new Map()
	let calls = 0
	return {
		events,
		get calls() { return calls },
		async creditCustomer(event) {
			calls++
			const old = events.get(event.eventId)
			if (old && JSON.stringify(old) !== JSON.stringify(event)) throw Object.assign(new Error('Conflicting credit'), { code: 'BILLING_IDEMPOTENCY_CONFLICT' })
			events.set(event.eventId, event)
			return { idempotent: Boolean(old) }
		},
	}
}
