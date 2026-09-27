import { createBillingLedgerStore } from './ledger-store.mjs'
import { createCryptoOrderStore, desiredCryptoOrderCredits } from './crypto-orders.mjs'
import { configuredBaseNetwork } from './base-network.mjs'
import { isProductionBillingEnvironment } from './security-policy.mjs'
import { recordPaymentScannerTelemetry } from '../telemetry.mjs'
import { recordResourceUsage } from './resource-meter.mjs'

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export class BaseUsdcWatcherError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'BaseUsdcWatcherError'
		this.code = code
		this.details = details
	}
}

function hexNumber(value) {
	if (!['string', 'number', 'bigint'].includes(typeof value)) return NaN
	const text = String(value)
	if (!/^(?:0x[0-9a-f]+|[0-9]+)$/i.test(text)) return NaN
	const number = Number(text)
	return Number.isSafeInteger(number) && number >= 0 ? number : NaN
}

function hexBlock(value) {
	return `0x${Math.max(0, Math.round(Number(value) || 0)).toString(16)}`
}

function topicAddress(address) {
	return `0x${String(address || '').toLowerCase().replace(/^0x/, '').padStart(64, '0')}`
}

function addressFromTopic(topic) {
	const text = String(topic || '').toLowerCase().replace(/^0x/, '')
	return /^0{24}[a-f0-9]{40}$/.test(text) ? `0x${text.slice(24)}` : ''
}

async function rpcFetch(method, params = []) {
	const url = String(process.env.BETTERPPTX_BASE_RPC_URL || '').trim()
	if (!/^https:\/\//i.test(url) && process.env.BETTERPPTX_ALLOW_INSECURE_BASE_RPC !== '1') {
		throw new BaseUsdcWatcherError('BASE_RPC_NOT_CONFIGURED', 'Base RPC is not configured.')
	}
	recordResourceUsage({ externalCalls: 1 })
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
	})
	if (!response.ok) throw new BaseUsdcWatcherError('BASE_RPC_HTTP_ERROR', 'Base RPC request failed.', { status: response.status })
	const body = await response.json()
	if (body?.error) throw new BaseUsdcWatcherError('BASE_RPC_ERROR', 'Base RPC request failed.', { code: body.error.code })
	return body?.result
}

function normalizedLog(log = {}, latestBlock = 0) {
	const tokenContract = String(log.address || '').toLowerCase()
	const topics = Array.isArray(log.topics) ? log.topics.map(value => String(value).toLowerCase()) : []
	const blockNumber = hexNumber(log.blockNumber)
	const amountUsdcMicros = hexNumber(log.data)
	return {
		tokenContract,
		transferTopic: topics[0] || '',
		topicCount: topics.length,
		from: addressFromTopic(topics[1]),
		to: addressFromTopic(topics[2]),
		txHash: String(log.transactionHash || '').toLowerCase(),
		logIndex: hexNumber(log.logIndex),
		blockNumber,
		blockHash: typeof log.blockHash === 'string' ? log.blockHash.toLowerCase() : null,
		amountUsdcMicros,
		confirmations: Math.max(0, latestBlock - blockNumber + 1),
		removed: Boolean(log.removed),
	}
}

export function createBaseUsdcFinalityChain({ rpc = rpcFetch } = {}) {
	return {
		requiresFinality: rpc === rpcFetch,
		getFinalizedBlock: () => rpc('eth_getBlockByNumber', ['finalized', false]),
		getBlockByNumber: number => rpc('eth_getBlockByNumber', [hexBlock(number), false]),
		getTransactionReceipt: txHash => rpc('eth_getTransactionReceipt', [txHash]),
	}
}

function finalityUnavailable() {
	return new BaseUsdcWatcherError('BASE_FINALITY_UNAVAILABLE', 'Payment finality verification is temporarily unavailable.')
}

function invalidEvidence() {
	return new BaseUsdcWatcherError('BASE_TRANSFER_EVIDENCE_INVALID', 'Payment transfer evidence does not match the canonical finalized chain.')
}

function validHash(value) {
	return typeof value === 'string' && /^0x[a-f0-9]{64}$/i.test(value)
}

async function finalityContext(chain, latest, paymentNetwork) {
	if (!paymentNetwork?.tokenContract) throw invalidEvidence()
	if (!chain || ['getFinalizedBlock', 'getBlockByNumber', 'getTransactionReceipt'].some(method => typeof chain[method] !== 'function')) throw finalityUnavailable()
	let finalized
	try { finalized = await chain.getFinalizedBlock() } catch { throw finalityUnavailable() }
	const head = hexNumber(finalized?.number)
	if (!Number.isSafeInteger(head) || head > latest || !validHash(finalized?.hash)) throw finalityUnavailable()
	const blocks = new Map()
	const receipts = new Map()
	async function cached(map, key, get) {
		if (!map.has(key)) map.set(key, Promise.resolve().then(get))
		try { return await map.get(key) } catch { throw finalityUnavailable() }
	}
	return {
		head,
		async validate(transfer, { legacy = false } = {}) {
			if (!Number.isSafeInteger(transfer.blockNumber) || transfer.blockNumber < 0 || !validHash(transfer.txHash)) throw invalidEvidence()
			if (transfer.blockNumber > head) {
				if (transfer.finalizedBlockNumber != null) throw finalityUnavailable()
				return null
			}
			const receipt = await cached(receipts, transfer.txHash, () => chain.getTransactionReceipt(transfer.txHash))
			if (!receipt) throw finalityUnavailable()
			const blockHash = transfer.blockHash || (legacy ? receipt.blockHash : null)
			if (!validHash(blockHash) || !['0x1', 'success'].includes(receipt.status)
				|| String(receipt.transactionHash || '').toLowerCase() !== transfer.txHash
				|| hexNumber(receipt.blockNumber) !== transfer.blockNumber
				|| String(receipt.blockHash || '').toLowerCase() !== blockHash.toLowerCase()) throw invalidEvidence()
			const block = await cached(blocks, transfer.blockNumber, () => chain.getBlockByNumber(transfer.blockNumber))
			if (!block) throw finalityUnavailable()
			if (hexNumber(block.number) !== transfer.blockNumber || !validHash(block.hash) || block.hash.toLowerCase() !== blockHash.toLowerCase()) throw invalidEvidence()
			if (transfer.blockNumber === head && block.hash.toLowerCase() !== finalized.hash.toLowerCase()) throw invalidEvidence()
			const included = Array.isArray(receipt.logs) && receipt.logs.some(log => {
				const item = normalizedLog(log, latest)
				return !item.removed && item.tokenContract === paymentNetwork.tokenContract && item.transferTopic === TRANSFER_TOPIC
					&& item.topicCount === 3 && item.from && item.to === transfer.to
					&& item.txHash === transfer.txHash && item.logIndex === transfer.logIndex
					&& item.amountUsdcMicros === transfer.amountUsdcMicros && item.blockNumber === transfer.blockNumber
					&& item.blockHash === blockHash.toLowerCase()
			})
			if (!included) throw invalidEvidence()
			return { ...transfer, blockHash: blockHash.toLowerCase(), finalizedBlockNumber: head }
		},
	}
}

export async function processBaseUsdcLogs({
	logs = [],
	latestBlock,
	safeDepth = Number(process.env.BETTERPPTX_BASE_SAFE_DEPTH || 2),
	store = createCryptoOrderStore(),
	ledger = createBillingLedgerStore(),
	orders = null,
	chain = null,
	env = process.env,
} = {}) {
	const latest = hexNumber(latestBlock)
	if (!Number.isSafeInteger(latest) || !Array.isArray(logs)) throw invalidEvidence()
	const paymentNetwork = configuredBaseNetwork(env)
	const requiresFinality = isProductionBillingEnvironment(env) || chain?.requiresFinality === true
	const finality = requiresFinality ? await finalityContext(chain, latest, paymentNetwork) : null
	const safeHead = finality ? finality.head : Math.max(0, latest - Math.max(0, Math.round(Number(safeDepth) || 0)))
	const watchOrders = orders || await store.listWatchOrders({
		hotWindowDays: Number(process.env.BETTERPPTX_PAYMENT_HOT_WINDOW_DAYS || 30),
	})
	const byAddress = new Map(watchOrders.map(order => [String(order.depositAddress || '').toLowerCase(), order]))
	const summary = {
		latestBlock: latest,
		safeHead,
		seen: logs.length,
		accepted: 0,
		credited: 0,
		ignoredWrongToken: 0,
		ignoredUnknownAddress: 0,
		ignoredUnsafeHead: 0,
		ignoredRemoved: 0,
		ignoredUnfinalized: 0,
		verificationMode: requiresFinality ? 'finalized-canonical-receipt' : 'fixture-confirmation-depth',
		replayed: 0,
	}

	for (const rawLog of logs) {
		let transfer = normalizedLog(rawLog, latest)
		if (transfer.tokenContract !== paymentNetwork.tokenContract || transfer.transferTopic !== TRANSFER_TOPIC) {
			summary.ignoredWrongToken += 1
			continue
		}
		if (transfer.removed) {
			summary.ignoredRemoved += 1
			continue
		}
		if (transfer.blockNumber > safeHead) {
			if (finality) summary.ignoredUnfinalized += 1
			else summary.ignoredUnsafeHead += 1
			continue
		}
		const order = byAddress.get(transfer.to)
		if (!order) {
			summary.ignoredUnknownAddress += 1
			continue
		}
		if (transfer.topicCount !== 3 || !transfer.from || !Number.isSafeInteger(transfer.logIndex) || !Number.isSafeInteger(transfer.amountUsdcMicros)) throw invalidEvidence()
		if (finality) transfer = await finality.validate(transfer)
		const recorded = await store.recordTransfer(order.orderId, transfer)
		if (recorded.idempotent) {
			summary.replayed += 1
		} else {
			summary.accepted += 1
		}
		byAddress.set(order.depositAddress, recorded.order)
	}

	for (const order of byAddress.values()) {
		let current = await store.getOrder(order.orderId)
		if (!current || current.customerHash !== order.customerHash || current.depositAddress !== order.depositAddress
			|| current.chainId !== paymentNetwork.chainId || current.tokenContract !== paymentNetwork.tokenContract) throw invalidEvidence()
		if (finality) {
			// Revalidate persisted evidence, including depth-only legacy records.
			// Recovery cannot trust an old confirmed amount or caller snapshot.
			const verifiedTransfers = {}
			for (const transfer of Object.values(current.transfers || {})) {
				if (transfer.removed) continue
				const verified = await finality.validate({ ...transfer, to: current.depositAddress, tokenContract: current.tokenContract }, { legacy: true })
				if (verified) {
					await store.recordTransfer(current.orderId, verified)
					verifiedTransfers[transfer.transferId] = verified
				}
			}
			// A concurrent worker may have recorded newer evidence. Only this
			// scan's independently verified snapshot can increase its grant target.
			current = { ...current, transfers: verifiedTransfers }
		}
		// A recorded log is not proof that its ledger grant completed. Replayed
		// evidence must continue through the idempotent credit recovery path.
		const desiredCredits = desiredCryptoOrderCredits(current, { finalizedOnly: requiresFinality })
		if (desiredCredits <= 0) continue
		if (typeof ledger.creditCustomerCumulative !== 'function') throw new BaseUsdcWatcherError('BASE_CUMULATIVE_LEDGER_REQUIRED', 'Atomic payment credit accounting is unavailable.')
		const grant = await ledger.creditCustomerCumulative({
			customerHash: order.customerHash,
			sourceId: `base-usdc-order:${order.orderId}`,
			source: 'chain_transfer',
			totalCredits: desiredCredits,
			// Entitlement identity stays stable as confirmations advance or dust
			// arrives without changing the credit total. Canonical receipt/log
			// evidence lives on the order and was reverified above, not trusted
			// from this reference or from the separate order credit checkpoint.
			proofRef: {
				orderId: order.orderId,
				desiredCredits,
				chainId: paymentNetwork.chainId,
				tokenContract: paymentNetwork.tokenContract,
				depositAddress: current.depositAddress,
			},
		})
		if (!Number.isSafeInteger(grant?.totalCredits) || grant.totalCredits < desiredCredits
			|| !Number.isSafeInteger(grant.creditedCredits) || grant.creditedCredits < 0 || grant.creditedCredits > desiredCredits) throw new BaseUsdcWatcherError('BASE_CUMULATIVE_LEDGER_INVALID', 'Payment credit accounting returned an invalid result.')
		const credited = await store.markCredited(order.orderId, grant.totalCredits)
		byAddress.set(order.depositAddress, credited)
		summary.credited += grant.creditedCredits
	}
	return summary
}

export async function scanBaseUsdcHotWindow({
	store = createCryptoOrderStore(),
	ledger = createBillingLedgerStore(),
	rpc = rpcFetch,
	env = process.env,
} = {}) {
	try {
		const paymentNetwork = configuredBaseNetwork(env)
		const chainId = hexNumber(await rpc('eth_chainId', []))
		if (chainId !== paymentNetwork.chainId) {
			throw new BaseUsdcWatcherError('BASE_RPC_WRONG_CHAIN', 'Configured chain endpoint does not match the selected payment network.', { chainId, expectedChainId: paymentNetwork.chainId, network: paymentNetwork.network })
		}
		const latestBlock = hexNumber(await rpc('eth_blockNumber', []))
		const chain = createBaseUsdcFinalityChain({ rpc })
		const safeDepth = Math.max(0, Math.round(Number(process.env.BETTERPPTX_BASE_SAFE_DEPTH || 2) || 0))
		const safeHead = Math.max(0, latestBlock - safeDepth)
		const orders = await store.listWatchOrders({
			hotWindowDays: Number(process.env.BETTERPPTX_PAYMENT_HOT_WINDOW_DAYS || 30),
		})
		let summary
		if (!orders.length) {
			summary = await processBaseUsdcLogs({ logs: [], latestBlock, safeDepth, store, ledger, orders, chain, env })
		} else {
			const blockWindow = Math.max(100, Math.round(Number(process.env.BETTERPPTX_BASE_SCAN_BLOCK_WINDOW || 5000) || 5000))
			const logs = await rpc('eth_getLogs', [{
				address: paymentNetwork.tokenContract,
				fromBlock: hexBlock(Math.max(0, safeHead - blockWindow + 1)),
				toBlock: hexBlock(safeHead),
				topics: [
					TRANSFER_TOPIC,
					null,
					orders.map(order => topicAddress(order.depositAddress)),
				],
			}])
			summary = await processBaseUsdcLogs({ logs, latestBlock, safeDepth, store, ledger, orders, chain, env })
		}
		recordPaymentScannerTelemetry({
			ok: true,
			unmatchedPayments: summary.ignoredUnknownAddress,
			creditedCredits: summary.credited,
		})
		return summary
	} catch (err) {
		recordPaymentScannerTelemetry({ ok: false })
		throw err
	}
}

export async function lazyRescanOrder(orderId, {
	store = createCryptoOrderStore(),
	ledger = createBillingLedgerStore(),
	rpc = rpcFetch,
	env = process.env,
} = {}) {
	const order = await store.getOrder(orderId)
	if (!order) throw new BaseUsdcWatcherError('CRYPTO_ORDER_NOT_FOUND', 'Payment order was not found.')
	const paymentNetwork = configuredBaseNetwork(env)
	const chainId = hexNumber(await rpc('eth_chainId', []))
	if (chainId !== paymentNetwork.chainId) throw new BaseUsdcWatcherError('BASE_RPC_WRONG_CHAIN', 'Configured chain endpoint does not match the selected payment network.', { chainId, expectedChainId: paymentNetwork.chainId, network: paymentNetwork.network })
	const latestBlock = hexNumber(await rpc('eth_blockNumber', []))
	const safeDepth = Math.max(0, Math.round(Number(process.env.BETTERPPTX_BASE_SAFE_DEPTH || 2) || 0))
	const blockWindow = Math.max(100, Math.round(Number(process.env.BETTERPPTX_BASE_LAZY_SCAN_BLOCK_WINDOW || process.env.BETTERPPTX_BASE_SCAN_BLOCK_WINDOW || 5000) || 5000))
	const safeHead = Math.max(0, latestBlock - safeDepth)
	const logs = await rpc('eth_getLogs', [{
		address: paymentNetwork.tokenContract,
		fromBlock: hexBlock(Math.max(0, safeHead - blockWindow + 1)),
		toBlock: hexBlock(safeHead),
		topics: [TRANSFER_TOPIC, null, topicAddress(order.depositAddress)],
	}])
	return processBaseUsdcLogs({ logs, latestBlock, safeDepth, store, ledger, orders: [order], chain: createBaseUsdcFinalityChain({ rpc }), env })
}

export const BASE_USDC_TRANSFER_TOPIC = TRANSFER_TOPIC
