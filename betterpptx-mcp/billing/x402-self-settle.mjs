import * as crypto from 'node:crypto'
import {
	concatHex,
	createPublicClient,
	createWalletClient,
	encodeAbiParameters,
	fallback,
	http,
	keccak256,
	parseAbi,
	parseAbiItem,
	parseSignature,
	recoverAddress,
	stringToHex,
} from 'viem'

import { recordResourceUsage } from './resource-meter.mjs'
import { withX402BroadcastOnce } from './relayer-lease.mjs'
import { configuredBaseNetwork, viemBaseChain } from './base-network.mjs'
import { isProductionBillingEnvironment } from './security-policy.mjs'

const TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(stringToHex(
	'TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)',
))
const AUTHORIZATION_USED_TOPIC = keccak256(stringToHex('AuthorizationUsed(address,bytes32)'))
const AUTHORIZATION_CANCELED_TOPIC = keccak256(stringToHex('AuthorizationCanceled(address,bytes32)'))
const TRANSFER_TOPIC = keccak256(stringToHex('Transfer(address,address,uint256)'))

const TOKEN_ABI = parseAbi([
	'function DOMAIN_SEPARATOR() view returns (bytes32)',
	'function authorizationState(address authorizer, bytes32 nonce) view returns (bool)',
	'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)',
])
const AUTHORIZATION_USED_EVENT = parseAbiItem('event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)')
const AUTHORIZATION_CANCELED_EVENT = parseAbiItem('event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce)')

export class X402SelfSettleError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'X402SelfSettleError'
		this.code = code
		this.details = details
	}
}

export function x402SettlementMode() {
	const mode = String(process.env.BETTERPPTX_X402_SETTLEMENT_MODE || 'self_settle').trim().toLowerCase()
	if (mode !== 'self_settle' && mode !== 'cdp_facilitator') {
		throw new X402SelfSettleError('X402_SETTLEMENT_MODE_INVALID', 'x402 payment is not configured for this deployment.')
	}
	return mode
}

function safeDepth() {
	const value = Number(process.env.BETTERPPTX_BASE_SAFE_DEPTH)
	return Number.isSafeInteger(value) && value >= 1 ? value : 2
}

function minRemainingValiditySeconds() {
	const value = Number(process.env.BETTERPPTX_X402_MIN_AUTH_VALIDITY_SECONDS)
	return Number.isFinite(value) && value >= 0 ? Math.round(value) : 15
}

function invalidPayment(reason) {
	return new X402SelfSettleError('X402_PAYMENT_INVALID', 'x402 payment verification failed.', { reason })
}

function configuredPaymentNetwork() {
	try {
		return configuredBaseNetwork()
	} catch {
		throw invalidPayment('network-config')
	}
}

function lowerAddress(value, reason) {
	const address = String(value || '').trim().toLowerCase()
	if (!/^0x[a-f0-9]{40}$/.test(address) || /^0x0{40}$/.test(address)) throw invalidPayment(reason)
	return address
}

function bytes32(value, reason) {
	const text = String(value || '').trim().toLowerCase()
	if (!/^0x[a-f0-9]{64}$/.test(text)) throw invalidPayment(reason)
	return text
}

function unsigned(value, reason) {
	try {
		if (!['string', 'number', 'bigint'].includes(typeof value)) throw new Error('type')
		if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('precision')
		const text = String(value)
		if (!/^(0|[1-9][0-9]*)$/.test(text)) throw new Error('format')
		const parsed = BigInt(text)
		if (parsed > (1n << 256n) - 1n) throw new Error('overflow')
		return parsed
	} catch {
		throw invalidPayment(reason)
	}
}

function topicForAddress(address) {
	return `0x${String(address).toLowerCase().replace(/^0x/, '').padStart(64, '0')}`
}

function addressFromTopic(topic) {
	const text = String(topic || '').toLowerCase()
	return /^0x0{24}[a-f0-9]{40}$/.test(text) ? `0x${text.slice(-40)}` : ''
}

export function x402QuoteAuthorizationNonce(quote = {}) {
	const identityBound = Boolean(quote.installHash && quote.customerHash && quote.customerHash === quote.installHash)
	const jobBindingDigest = String(quote.jobPayment?.binding?.bindingDigest || quote.jobBindingDigest || '').trim()
	const jobBound = Boolean(quote.jobId && jobBindingDigest)
	if (quote.authorizationBindingVersion !== 1 || !/^[a-f0-9]{32}$/i.test(quote.nonce || '')
		|| !quote.quoteId || (!identityBound && !jobBound)) {
		throw new X402SelfSettleError('X402_QUOTE_BINDING_REQUIRED', 'Request a new payment quote before signing.')
	}
	// The random, private quote salt keeps the beneficiary opaque. Changing ANY
	// identity or immutable job terms changes a field covered by the signature.
	return `0x${crypto.createHash('sha256').update(JSON.stringify([
		'betterpptx:x402:quote_nonce_v1', quote.quoteId, quote.nonce, quote.installHash, quote.customerHash,
		quote.jobId || '', jobBindingDigest, quote.paymentModel || '', quote.settlementMode || '',
		quote.packId, quote.credits, quote.amountAtomic, quote.network, quote.chainId,
		String(quote.tokenContract).toLowerCase(), String(quote.payTo).toLowerCase(),
		quote.createdAt, quote.expiresAt, quote.eip712Name || 'USD Coin', quote.eip712Version || '2',
		quote.envelopeJti || '', quote.priceUsdc, quote.packMetadata || null,
		quote.quoteSchemaVersion, quote.pricingModel, quote.pricingInputDigest, quote.specDigest,
		quote.estimatedPlanDigest, quote.planDigest, quote.rateCardVersion, quote.quoteCapCredits, quote.projectedOutputBytes,
	], (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
		? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value)).digest('hex')}`
}

function quoteDomainSeparator(quote) {
	return keccak256(encodeAbiParameters(
		[{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
		[keccak256(stringToHex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
			keccak256(stringToHex(quote.eip712Name || 'USD Coin')), keccak256(stringToHex(quote.eip712Version || '2')),
			BigInt(quote.chainId), quote.tokenContract],
	))
}

export function normalizeX402PaymentPayload(paymentPayload) {
	let payload = paymentPayload
	if (typeof payload === 'string') {
		const text = payload.trim()
		try {
			payload = JSON.parse(text)
		} catch {
			try {
				payload = JSON.parse(Buffer.from(text, 'base64').toString('utf8'))
			} catch {
				throw invalidPayment('payload-encoding')
			}
		}
	}
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw invalidPayment('payload-shape')
	if (payload.payload && typeof payload.payload === 'object') payload = payload.payload
	const authorization = payload.authorization && typeof payload.authorization === 'object' ? payload.authorization : null
	const signature = String(payload.signature || '').trim().toLowerCase()
	if (!authorization) throw invalidPayment('authorization-missing')
	if (!/^0x(?:[a-f0-9]{128}|[a-f0-9]{130})$/.test(signature)) throw invalidPayment('signature-shape')
	return {
		signature,
		authorization: {
			from: lowerAddress(authorization.from, 'authorizer-address'),
			to: lowerAddress(authorization.to, 'recipient-address'),
			value: unsigned(authorization.value, 'amount'),
			validAfter: unsigned(authorization.validAfter, 'valid-after'),
			validBefore: unsigned(authorization.validBefore, 'valid-before'),
			nonce: bytes32(authorization.nonce, 'nonce'),
		},
	}
}

export function eip3009SettlementId(authorization) {
	return `eip3009_${keccak256(stringToHex(`${lowerAddress(authorization.from, 'authorizer-address')}:${bytes32(authorization.nonce, 'nonce')}`)).slice(2, 34)}`
}

export function eip3009Digest({ domainSeparator, authorization }) {
	const structHash = keccak256(encodeAbiParameters(
		[
			{ type: 'bytes32' },
			{ type: 'address' },
			{ type: 'address' },
			{ type: 'uint256' },
			{ type: 'uint256' },
			{ type: 'uint256' },
			{ type: 'bytes32' },
		],
		[
			TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
			authorization.from,
			authorization.to,
			authorization.value,
			authorization.validAfter,
			authorization.validBefore,
			authorization.nonce,
		],
	))
	return keccak256(concatHex(['0x1901', bytes32(domainSeparator, 'domain-separator'), structHash]))
}

function verifyAuthorizationTime({ authorization, nowMs }) {
	if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw invalidPayment('clock')
	const nowSeconds = BigInt(Math.floor(nowMs / 1000))
	if (authorization.validAfter >= nowSeconds) throw invalidPayment('authorization-not-yet-valid')
	if (authorization.validBefore <= nowSeconds + BigInt(minRemainingValiditySeconds())) throw invalidPayment('authorization-expiring')
}

export async function verifyX402PaymentForQuote({ quote, paymentPayload, chain = null, nowMs = Date.now(), checkTime = true }) {
	const payment = normalizeX402PaymentPayload(paymentPayload)
	const { authorization, signature } = payment
	const paymentNetwork = configuredPaymentNetwork()
	if (Number(quote.chainId) !== paymentNetwork.chainId || quote.network !== paymentNetwork.network
		|| lowerAddress(quote.tokenContract, 'asset') !== paymentNetwork.tokenContract || quote.asset !== paymentNetwork.tokenSymbol) throw invalidPayment('chain-asset-binding')
	if (authorization.to !== lowerAddress(quote.payTo, 'recipient')) throw invalidPayment('recipient-binding')
	if (authorization.value === 0n || authorization.value !== unsigned(quote.amountAtomic, 'quote-amount')) throw invalidPayment('amount-binding')
	if (!Number.isFinite(quote.credits) || quote.credits <= 0) throw invalidPayment('quote-credits')
	if (authorization.nonce !== x402QuoteAuthorizationNonce(quote)) throw invalidPayment('quote-beneficiary-binding')
	const expires = Date.parse(quote.expiresAt)
	const created = Date.parse(quote.createdAt)
	if (!Number.isFinite(expires) || !Number.isFinite(created) || expires <= created) throw invalidPayment('quote-validity')
	if (authorization.validAfter >= authorization.validBefore
		|| authorization.validBefore > BigInt(Math.floor(expires / 1000))
		|| authorization.validBefore <= BigInt(Math.floor(created / 1000))) throw invalidPayment('authorization-validity-binding')
	if (checkTime) verifyAuthorizationTime({ authorization, nowMs })
	const domainSeparator = quoteDomainSeparator(quote)
	if (chain && bytes32(await chain.readDomainSeparator(quote.tokenContract), 'domain-separator') !== domainSeparator) throw invalidPayment('domain-binding')
	const digest = eip3009Digest({ domainSeparator, authorization })
	let recovered
	try {
		recovered = await recoverAddress({ hash: digest, signature })
	} catch {
		throw invalidPayment('signature-recovery')
	}
	if (String(recovered).toLowerCase() !== authorization.from) throw invalidPayment('signer-mismatch')
	return payment
}

function matchingTransferInReceipt(receipt, { token, from, to, value }) {
	for (const log of receipt?.logs || []) {
		if (log.removed) continue
		if (String(log.address || '').toLowerCase() !== token) continue
		const topics = Array.isArray(log.topics) ? log.topics.map(topic => String(topic).toLowerCase()) : []
		if (topics.length !== 3 || topics[0] !== TRANSFER_TOPIC) continue
		if (addressFromTopic(topics[1]) !== from) continue
		if (addressFromTopic(topics[2]) !== to) continue
		let amount
		try {
			if (!/^0x[a-f0-9]{64}$/i.test(log.data || '')) continue
			amount = BigInt(log.data)
		} catch {
			continue
		}
		if (amount === value) return true
	}
	return false
}

async function receiptConfirmed(chain, receipt) {
	if (!receipt || String(receipt.status) !== 'success') return false
	const latest = await chain.latestBlockNumber()
	let block
	try {
		const head = unsigned(latest, 'head-block')
		block = unsigned(receipt.blockNumber, 'receipt-block')
		if (head < block || head - block + 1n < BigInt(safeDepth())) return false
	} catch { return false }
	if (!isProductionBillingEnvironment() && chain.requiresFinality !== true) return true
	// Confirmation depth is not finality. Production credit also needs the RPC's
	// finalized boundary and the canonical hash of this exact receipt block.
	try {
		if (typeof chain.getFinalizedBlock !== 'function' || typeof chain.getBlockByNumber !== 'function') throw new Error('Finality unavailable')
		const finalized = await chain.getFinalizedBlock()
		const finalizedHeight = unsigned(finalized?.number, 'finalized-block')
		const finalizedHash = bytes32(finalized?.hash, 'finalized-hash')
		if (finalizedHeight < block) return false
		const canonical = await chain.getBlockByNumber(block)
		if (unsigned(canonical?.number, 'canonical-block') !== block) return false
		const canonicalHash = bytes32(canonical?.hash, 'canonical-hash')
		if (bytes32(receipt.blockHash, 'receipt-hash') !== canonicalHash) return false
		if (block === finalizedHeight && canonicalHash !== finalizedHash) return false
		return true
	} catch {
		throw new X402SelfSettleError('X402_SETTLEMENT_PENDING', 'x402 payment finality is awaiting confirmation.', { reason: 'finality-unavailable' })
	}
}

function matchingAuthorizationInReceipt(receipt, token, authorization, txHash) {
	if (!/^0x[a-f0-9]{64}$/i.test(txHash || '') || String(receipt?.transactionHash).toLowerCase() !== txHash.toLowerCase()) return false
	return (receipt.logs || []).some(log => !log.removed && String(log.address).toLowerCase() === token
		&& log.topics?.length === 3 && String(log.topics[0]).toLowerCase() === AUTHORIZATION_USED_TOPIC
		&& addressFromTopic(log.topics[1]) === authorization.from
		&& String(log.topics[2]).toLowerCase() === authorization.nonce)
}

// Revalidate a persisted, already-verified settlement before production credit,
// including facilitator attestations and recovery of older depth-only claims.
// This path has no broadcast capability and never loads a relayer private key.
export async function verifyX402SettlementReceipt({ quote, settlement, chain = null } = {}) {
	const resolvedChain = chain || createBaseSelfSettleChain()
	const paymentNetwork = configuredPaymentNetwork()
	if (Number(await resolvedChain.chainId()) !== paymentNetwork.chainId || Number(quote.chainId) !== paymentNetwork.chainId
		|| quote.network !== paymentNetwork.network || String(quote.tokenContract).toLowerCase() !== paymentNetwork.tokenContract) throw invalidPayment('chain-asset-binding')
	const authorization = { from: lowerAddress(settlement.payer, 'payer'), to: lowerAddress(quote.payTo, 'recipient'),
		value: unsigned(quote.amountAtomic, 'amount'), nonce: x402QuoteAuthorizationNonce(quote) }
	const receipt = await resolvedChain.getTransactionReceipt(settlement.txHash)
	if (!matchingAuthorizationInReceipt(receipt, paymentNetwork.tokenContract, authorization, settlement.txHash)
		|| !matchingTransferInReceipt(receipt, { token: paymentNetwork.tokenContract, ...authorization })
		|| !(await receiptConfirmed(resolvedChain, receipt))) {
		throw new X402SelfSettleError('X402_SETTLEMENT_PENDING', 'x402 payment finality is awaiting confirmation.')
	}
	return { blockNumber: String(receipt.blockNumber), blockHash: String(receipt.blockHash).toLowerCase() }
}

async function reconcileConsumedAuthorization({ quote, payment, chain, settlementId }) {
	const { authorization } = payment
	const token = String(quote.tokenContract).toLowerCase()
	const usedLogs = await chain.getAuthorizationUsedLogs({
		token,
		authorizer: authorization.from,
		nonce: authorization.nonce,
	})
	for (const log of usedLogs) {
		const receipt = await chain.getTransactionReceipt(log.txHash)
		if (!receipt || String(receipt.status) !== 'success') continue
		if (!matchingAuthorizationInReceipt(receipt, token, authorization, log.txHash)) continue
		if (!(await receiptConfirmed(chain, receipt))) {
			throw new X402SelfSettleError('X402_SETTLEMENT_PENDING', 'x402 payment is awaiting confirmation. Retry shortly.')
		}
		if (matchingTransferInReceipt(receipt, {
			token,
			from: authorization.from,
			to: authorization.to,
			value: authorization.value,
		})) {
			return {
				settlementId,
				txHash: String(log.txHash).toLowerCase(),
				route: 'reconciled_already_consumed',
				network: quote.network,
				payer: authorization.from,
			}
		}
	}
	const canceledLogs = await chain.getAuthorizationCanceledLogs({
		token,
		authorizer: authorization.from,
		nonce: authorization.nonce,
	})
	if (canceledLogs.length || usedLogs.length) {
		throw new X402SelfSettleError(
			'X402_AUTHORIZATION_CONSUMED_WITHOUT_PAYMENT',
			'x402 authorization was consumed without the expected payment.',
		)
	}
	throw new X402SelfSettleError('X402_SETTLEMENT_PENDING', 'x402 payment is awaiting confirmation. Retry shortly.')
}

export async function settleX402PaymentSelf({
	quote,
	paymentPayload,
	chain = null,
	nowMs = Date.now(),
	allowExpiredReconciliation = false,
	leaseOptions = {},
} = {}) {
	const started = Date.now()
	const payment = await verifyX402PaymentForQuote({ quote, paymentPayload, nowMs, checkTime: false })
	const resolvedChain = chain || createBaseSelfSettleChain()
	const chainId = await resolvedChain.chainId()
	if (Number(chainId) !== Number(quote.chainId)) {
		throw new X402SelfSettleError('X402_SETTLEMENT_FAILED', 'x402 payment could not be settled.', { reason: 'wrong-chain' })
	}
	if (bytes32(await resolvedChain.readDomainSeparator(quote.tokenContract), 'domain-separator') !== quoteDomainSeparator(quote)) throw invalidPayment('domain-binding')
	const settlementId = eip3009SettlementId(payment.authorization)
	const token = String(quote.tokenContract).toLowerCase()
	const alreadyUsed = await resolvedChain.readAuthorizationState(token, payment.authorization.from, payment.authorization.nonce)
	if (alreadyUsed === true) return reconcileConsumedAuthorization({ quote, payment, chain: resolvedChain, settlementId })
	if (alreadyUsed !== false) throw invalidPayment('authorization-state')
	if (allowExpiredReconciliation || Date.parse(quote.expiresAt) <= nowMs) {
		throw new X402SelfSettleError('X402_QUOTE_EXPIRED', 'x402 quote has expired.')
	}
	verifyAuthorizationTime({ authorization: payment.authorization, nowMs })
	if (!alreadyUsed) {
		let txHash = null
		try {
			const broadcast = await withX402BroadcastOnce({
				...leaseOptions,
				keyId: quote.relayerKeyId || process.env.BETTERPPTX_X402_RELAYER_KEY_ID || 'default',
				authorizationId: `${quote.network}:${token}:${settlementId}`,
				quoteId: quote.quoteId,
			}, async lease => {
				// State checked again after entering the lane, not just before waiting.
				const used = await resolvedChain.readAuthorizationState(token, payment.authorization.from, payment.authorization.nonce)
				if (used === true) return null
				if (used !== false) throw invalidPayment('authorization-state')
				const currentTime = nowMs + (Date.now() - started)
				if (Date.parse(quote.expiresAt) <= currentTime) throw new X402SelfSettleError('X402_QUOTE_EXPIRED', 'x402 quote has expired.')
				verifyAuthorizationTime({ authorization: payment.authorization, nowMs: currentTime })
				const assertLeaseHeld = async () => {
					await lease.assertHeld()
					const checkedAt = nowMs + (Date.now() - started)
					if (Date.parse(quote.expiresAt) <= checkedAt) throw new X402SelfSettleError('X402_QUOTE_EXPIRED', 'x402 quote has expired.')
					verifyAuthorizationTime({ authorization: payment.authorization, nowMs: checkedAt })
				}
				await assertLeaseHeld()
				return resolvedChain.submitTransferWithAuthorization({ token, authorization: payment.authorization,
					signature: payment.signature, assertLeaseHeld })
			})
			txHash = broadcast.txHash || null
		} catch (error) {
			if (error instanceof X402SelfSettleError && error.code !== 'X402_SETTLEMENT_FAILED') throw error
			const usedNow = await resolvedChain.readAuthorizationState(token, payment.authorization.from, payment.authorization.nonce)
			if (usedNow !== true) {
				throw new X402SelfSettleError('X402_SETTLEMENT_FAILED', 'x402 payment could not be settled.', {
					reason: error?.details?.reason || 'submit-failed',
				})
			}
		}
		if (txHash) {
			const receipt = await resolvedChain.waitForReceipt(txHash, { confirmations: safeDepth() })
			if (await receiptConfirmed(resolvedChain, receipt)
				&& matchingAuthorizationInReceipt(receipt, token, payment.authorization, txHash)
				&& matchingTransferInReceipt(receipt, {
				token,
				from: payment.authorization.from,
				to: payment.authorization.to,
				value: payment.authorization.value,
			})) {
				return { settlementId, txHash: String(txHash).toLowerCase(), route: 'relayer', network: quote.network, payer: payment.authorization.from }
			}
			if (!receipt) {
				throw new X402SelfSettleError('X402_SETTLEMENT_PENDING', 'x402 payment is awaiting confirmation. Retry shortly.')
			}
		}
	}
	return reconcileConsumedAuthorization({ quote, payment, chain: resolvedChain, settlementId })
}

export function createBaseSelfSettleChain({ rpcUrl = '', relayerPrivateKey = '' } = {}) {
	// Reads may fan out across a ranked fallback list (BETTERPPTX_BASE_RPC_URLS,
	// comma-separated, primary first). Writes always use the single explicit
	// primary endpoint (`url`) so an ambiguous broadcast is never silently
	// retried against a different node (section 24A.11 / 31.4).
	const explicitReadUrls = String(process.env.BETTERPPTX_BASE_RPC_URLS || '')
		.split(',')
		.map(value => value.trim())
		.filter(Boolean)
	const url = String(rpcUrl || explicitReadUrls[0] || process.env.BETTERPPTX_BASE_RPC_URL || '').trim()
	const paymentNetwork = configuredBaseNetwork()
	const readUrls = rpcUrl ? [url] : (explicitReadUrls.length ? explicitReadUrls : [url])
	const insecureRpcAllowed = process.env.BETTERPPTX_ALLOW_INSECURE_BASE_RPC === '1'
	for (const candidate of readUrls) {
		if (!/^https:\/\//i.test(candidate) && !insecureRpcAllowed) {
			throw new X402SelfSettleError('X402_SETTLEMENT_FAILED', 'x402 payment could not be settled.', { reason: 'rpc-not-configured' })
		}
	}
	const lookbackBlocks = (() => {
		const value = Number(process.env.BETTERPPTX_X402_RECONCILE_LOOKBACK_BLOCKS)
		return Number.isFinite(value) && value > 0 ? Math.round(value) : 200000
	})()
	const receiptTimeoutMs = (() => {
		const value = Number(process.env.BETTERPPTX_X402_SETTLE_TIMEOUT_MS)
		return Number.isFinite(value) && value >= 1000 ? Math.round(value) : 60000
	})()
	const readTransport = readUrls.length > 1
		? fallback(readUrls.map(candidate => http(candidate)))
		: http(url)
	const chainConfig = viemBaseChain(paymentNetwork, url)
	const publicClient = createPublicClient({ chain: chainConfig, transport: readTransport })
	const primaryClient = createPublicClient({ chain: chainConfig, transport: http(url, { retryCount: 0 }) })
	const domainSeparators = new Map()
	let walletClientPromise = null

	async function walletClient() {
		if (!walletClientPromise) {
			walletClientPromise = (async () => {
				const key = String(relayerPrivateKey || process.env.BETTERPPTX_X402_RELAYER_PRIVATE_KEY || '').trim()
				if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
					throw new X402SelfSettleError('X402_RELAYER_NOT_CONFIGURED', 'x402 payment is not configured for this deployment.')
				}
				const { privateKeyToAccount } = await import('viem/accounts')
				const account = privateKeyToAccount(key)
				return { account, client: createWalletClient({ account, chain: chainConfig, transport: http(url, { retryCount: 0 }) }) }
			})()
			walletClientPromise.catch(() => { walletClientPromise = null })
		}
		return walletClientPromise
	}

	async function lookbackRange() {
		recordResourceUsage({ externalCalls: 1 })
		const latest = await publicClient.getBlockNumber()
		const fromBlock = latest > BigInt(lookbackBlocks) ? latest - BigInt(lookbackBlocks) : 0n
		return { fromBlock, toBlock: latest }
	}

	async function eventLogs(event, { token, authorizer, nonce }) {
		const { fromBlock, toBlock } = await lookbackRange()
		recordResourceUsage({ externalCalls: 1 })
		const logs = await publicClient.getLogs({
			address: token,
			event,
			args: { authorizer, nonce },
			fromBlock,
			toBlock,
		})
		return logs.map(log => ({
			txHash: String(log.transactionHash).toLowerCase(),
			blockNumber: Number(log.blockNumber),
		}))
	}

	return {
		requiresFinality: true,
		async getFinalizedBlock() {
			recordResourceUsage({ externalCalls: 1 })
			const block = await publicClient.getBlock({ blockTag: 'finalized' })
			return { number: block.number, hash: block.hash }
		},
		async getBlockByNumber(blockNumber) {
			recordResourceUsage({ externalCalls: 1 })
			const block = await publicClient.getBlock({ blockNumber: BigInt(blockNumber) })
			return { number: block.number, hash: block.hash }
		},
		async chainId() {
			recordResourceUsage({ externalCalls: 1 })
			return publicClient.getChainId()
		},
		async latestBlockNumber() {
			recordResourceUsage({ externalCalls: 1 })
			return Number(await publicClient.getBlockNumber())
		},
		async readDomainSeparator(token) {
			const key = String(token).toLowerCase()
			if (!domainSeparators.has(key)) {
				recordResourceUsage({ externalCalls: 1 })
				domainSeparators.set(key, await publicClient.readContract({
					address: key,
					abi: TOKEN_ABI,
					functionName: 'DOMAIN_SEPARATOR',
				}))
			}
			return domainSeparators.get(key)
		},
		async readAuthorizationState(token, authorizer, nonce) {
			recordResourceUsage({ externalCalls: 1 })
			return publicClient.readContract({
				address: token,
				abi: TOKEN_ABI,
				functionName: 'authorizationState',
				args: [authorizer, nonce],
			})
		},
		async submitTransferWithAuthorization({ token, authorization, signature, assertLeaseHeld = async () => {} }) {
			const { account, client } = await walletClient()
			recordResourceUsage({ externalCalls: 1 })
			if (await primaryClient.getChainId() !== paymentNetwork.chainId || token.toLowerCase() !== paymentNetwork.tokenContract) throw invalidPayment('broadcast-chain-asset')
			const parsed = parseSignature(signature)
			const v = parsed.v != null ? Number(parsed.v) : Number(parsed.yParity) + 27
			const args = [
				authorization.from,
				authorization.to,
				authorization.value,
				authorization.validAfter,
				authorization.validBefore,
				authorization.nonce,
				v,
				parsed.r,
				parsed.s,
			]
			recordResourceUsage({ externalCalls: 1 })
			const { request } = await primaryClient.simulateContract({
				account,
				address: token,
				abi: TOKEN_ABI,
				functionName: 'transferWithAuthorization',
				args,
			}).catch(error => {
				throw new X402SelfSettleError('X402_SETTLEMENT_FAILED', 'x402 payment could not be settled.', {
					reason: error?.shortMessage ? 'simulate-reverted' : 'simulate-failed',
				})
			})
			await assertLeaseHeld()
			recordResourceUsage({ externalCalls: 1 })
			return client.writeContract(request)
		},
		async waitForReceipt(txHash, { confirmations = safeDepth() } = {}) {
			recordResourceUsage({ externalCalls: 1 })
			try {
				return await publicClient.waitForTransactionReceipt({
					hash: txHash,
					confirmations,
					timeout: receiptTimeoutMs,
				})
			} catch {
				return null
			}
		},
		async getTransactionReceipt(txHash) {
			recordResourceUsage({ externalCalls: 1 })
			try {
				return await publicClient.getTransactionReceipt({ hash: txHash })
			} catch {
				return null
			}
		},
		getAuthorizationUsedLogs(input) {
			return eventLogs(AUTHORIZATION_USED_EVENT, input)
		},
		getAuthorizationCanceledLogs(input) {
			return eventLogs(AUTHORIZATION_CANCELED_EVENT, input)
		},
		async relayerStatus() {
			const { account } = await walletClient()
			recordResourceUsage({ externalCalls: 1 })
			const balanceWei = await publicClient.getBalance({ address: account.address })
			return { relayerAddress: account.address, balanceWei: balanceWei.toString() }
		},
	}
}

export const X402_AUTHORIZATION_USED_TOPIC = AUTHORIZATION_USED_TOPIC
export const X402_AUTHORIZATION_CANCELED_TOPIC = AUTHORIZATION_CANCELED_TOPIC
export const X402_TRANSFER_TOPIC = TRANSFER_TOPIC
export const X402_TRANSFER_WITH_AUTHORIZATION_TYPEHASH = TRANSFER_WITH_AUTHORIZATION_TYPEHASH
