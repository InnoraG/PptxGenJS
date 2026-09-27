import * as crypto from 'node:crypto'

import {
	createPublicClient,
	createWalletClient,
	fallback,
	http,
	parseAbi,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'

import { BASE_CHAIN_ID } from './crypto-orders.mjs'
import {
	configuredForwarderConfig,
	deriveForwarderSalt,
	predictForwarderAddress,
} from './deposit-forwarders.mjs'
import { recordResourceUsage } from './resource-meter.mjs'
import { withRelayerBroadcastLease } from './relayer-lease.mjs'

const ERC20_BALANCE_ABI = parseAbi(['function balanceOf(address account) view returns (uint256)'])
const FACTORY_SWEEP_ABI = parseAbi(['function sweepMany(bytes32[] salts)'])

export class DepositForwarderSweepError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'DepositForwarderSweepError'
		this.code = code
		this.details = details
	}
}

function fingerprint(value) {
	return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex').slice(0, 16)
}

function rpcUrls(explicit = '') {
	const primary = String(explicit || process.env.BETTERPPTX_BASE_RPC_URL || '').trim()
	const configured = String(process.env.BETTERPPTX_BASE_RPC_URLS || '')
		.split(',')
		.map(value => value.trim())
		.filter(Boolean)
	const urls = configured.length ? configured : (primary ? [primary] : [])
	const insecureAllowed = process.env.BETTERPPTX_ALLOW_INSECURE_BASE_RPC === '1'
	for (const url of urls) {
		if (!/^https:\/\//i.test(url) && !insecureAllowed) {
			throw new DepositForwarderSweepError('FORWARDER_SWEEP_RPC_NOT_CONFIGURED', 'Base RPC is not configured for forwarder sweeping.')
		}
	}
	if (!urls.length) {
		throw new DepositForwarderSweepError('FORWARDER_SWEEP_RPC_NOT_CONFIGURED', 'Base RPC is not configured for forwarder sweeping.')
	}
	return urls
}

function sweeperPrivateKey(value = '') {
	const key = String(value || process.env.BETTERPPTX_FORWARDER_SWEEPER_KEY || '').trim()
	if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
		throw new DepositForwarderSweepError('FORWARDER_SWEEPER_KEY_NOT_CONFIGURED', 'Forwarder sweeper key is not configured.')
	}
	return key
}

function maxSweepOrders() {
	const value = Number(process.env.BETTERPPTX_FORWARDER_SWEEP_MAX_ORDERS)
	return Number.isFinite(value) && value > 0 ? Math.min(5000, Math.round(value)) : 500
}

function hotWindowDays() {
	const value = Number(process.env.BETTERPPTX_FORWARDER_SWEEP_HOT_WINDOW_DAYS || process.env.BETTERPPTX_PAYMENT_HOT_WINDOW_DAYS)
	return Number.isFinite(value) && value > 0 ? Math.round(value) : 30
}

function canaryCapAtoms(config) {
	const cap = Number(config?.canaryMaxUsdc || 0)
	if (!Number.isFinite(cap) || cap <= 0) return 0n
	return BigInt(Math.round(cap * 1e6))
}

function orderSalt(order = {}) {
	return deriveForwarderSalt({
		orderId: order.orderId,
		customerHash: order.customerHash || order.installHash || '',
		packId: order.packId,
		nonce: order.envelopeJti,
	})
}

function normalizeBalance(value) {
	try {
		const parsed = typeof value === 'bigint' ? value : BigInt(String(value ?? '0'))
		return parsed > 0n ? parsed : 0n
	} catch {
		return 0n
	}
}

export function createBaseForwarderSweepChain({
	config = configuredForwarderConfig(),
	rpcUrl = '',
	sweeperKey = '',
} = {}) {
	if (!config) throw new DepositForwarderSweepError('FORWARDER_NOT_ENABLED', 'Forwarder raw-send rail is not enabled.')
	const urls = rpcUrls(rpcUrl)
	const primaryUrl = String(rpcUrl || urls[0]).trim()
	const readTransport = urls.length > 1 ? fallback(urls.map(url => http(url))) : http(primaryUrl)
	const publicClient = createPublicClient({ chain: base, transport: readTransport })
	let sweeperAccount = null
	let walletClientPromise = null

	function account() {
		if (!sweeperAccount) sweeperAccount = privateKeyToAccount(sweeperPrivateKey(sweeperKey))
		return sweeperAccount
	}

	async function walletClient() {
		if (!walletClientPromise) {
			walletClientPromise = (async () => {
				const resolvedAccount = account()
				return { account: resolvedAccount, client: createWalletClient({ account: resolvedAccount, chain: base, transport: http(primaryUrl) }) }
			})()
			walletClientPromise.catch(() => { walletClientPromise = null })
		}
		return walletClientPromise
	}

	return {
		async chainId() {
			recordResourceUsage({ externalCalls: 1 })
			return publicClient.getChainId()
		},
		async balanceOf(address) {
			recordResourceUsage({ externalCalls: 1 })
			return publicClient.readContract({
				address: config.tokenAddress,
				abi: ERC20_BALANCE_ABI,
				functionName: 'balanceOf',
				args: [address],
			})
		},
		async forwarderSweeperStatus() {
			const resolvedAccount = account()
			recordResourceUsage({ externalCalls: 2 })
			const [chainId, balanceWei] = await Promise.all([
				publicClient.getChainId(),
				publicClient.getBalance({ address: resolvedAccount.address }),
			])
			return {
				chainId,
				sweeperAddress: resolvedAccount.address,
				balanceWei: balanceWei.toString(),
			}
		},
		async sweepMany(salts) {
			const { account, client } = await walletClient()
			recordResourceUsage({ externalCalls: 1 })
			const { request } = await publicClient.simulateContract({
				account,
				address: config.factoryAddress,
				abi: FACTORY_SWEEP_ABI,
				functionName: 'sweepMany',
				args: [salts],
			}).catch(error => {
				throw new DepositForwarderSweepError('FORWARDER_SWEEP_SIMULATION_FAILED', 'Forwarder sweep simulation failed.', {
					reason: error?.shortMessage ? 'simulate-reverted' : 'simulate-failed',
				})
			})
			recordResourceUsage({ externalCalls: 1 })
			return client.writeContract(request)
		},
	}
}

async function candidateOrders(store, limit) {
	if (typeof store.listForwarderSweepOrders === 'function') {
		return store.listForwarderSweepOrders({ hotWindowDays: hotWindowDays(), limit })
	}
	const orders = await store.listWatchOrders({ hotWindowDays: hotWindowDays() })
	return orders.filter(order => order.depositAddressSource === 'forwarder').slice(0, limit)
}

export async function sweepForwarderHotWindow({
	store,
	chain = null,
	config = configuredForwarderConfig(),
	dryRun = false,
	limit = maxSweepOrders(),
} = {}) {
	if (!config) throw new DepositForwarderSweepError('FORWARDER_NOT_ENABLED', 'Forwarder raw-send rail is not enabled.')
	if (!store) throw new DepositForwarderSweepError('FORWARDER_SWEEP_STORE_MISSING', 'Forwarder sweep requires a crypto order store.')
	if (typeof store.listForwarderSweepOrders !== 'function' && typeof store.listWatchOrders !== 'function') {
		throw new DepositForwarderSweepError('FORWARDER_SWEEP_STORE_UNSUPPORTED', 'Crypto order store cannot list forwarder sweep candidates.')
	}
	const resolvedChain = chain || createBaseForwarderSweepChain({ config })
	const chainId = Number(await resolvedChain.chainId())
	if (chainId !== BASE_CHAIN_ID) {
		throw new DepositForwarderSweepError('FORWARDER_SWEEP_WRONG_CHAIN', 'Forwarder sweep endpoint is not Base mainnet.', { chainId })
	}
	const orders = await candidateOrders(store, Math.max(1, Math.min(5000, Math.round(Number(limit) || 500))))
	const capAtoms = canaryCapAtoms(config)
	const batchSize = Math.max(1, Math.min(100, Number(config.batchSize || 25) || 25))
	const eligible = []
	const summary = {
		enabled: true,
		dryRun: Boolean(dryRun),
		scanned: 0,
		eligible: 0,
		skippedAddressMismatch: 0,
		skippedSaltMismatch: 0,
		skippedEmpty: 0,
		skippedCanaryCap: 0,
		batches: 0,
		submitted: 0,
		failed: 0,
		tokenAtomsQueued: '0',
		txHashes: [],
	}
	let tokenAtomsQueued = 0n
	for (const order of orders) {
		summary.scanned += 1
		const salt = orderSalt(order)
		if (order.depositForwarderSaltFingerprint && order.depositForwarderSaltFingerprint !== fingerprint(salt)) {
			summary.skippedSaltMismatch += 1
			continue
		}
		const predicted = predictForwarderAddress({
			factoryAddress: config.factoryAddress,
			salt,
			initCodeHash: config.initCodeHash,
		})
		if (predicted !== String(order.depositAddress || '').toLowerCase()) {
			summary.skippedAddressMismatch += 1
			continue
		}
		const balance = normalizeBalance(await resolvedChain.balanceOf(predicted))
		if (balance <= 0n) {
			summary.skippedEmpty += 1
			continue
		}
		if (capAtoms > 0n && balance > capAtoms) {
			summary.skippedCanaryCap += 1
			continue
		}
		eligible.push({ salt, balance })
		tokenAtomsQueued += balance
	}
	summary.eligible = eligible.length
	summary.tokenAtomsQueued = tokenAtomsQueued.toString()
	if (dryRun || eligible.length === 0) return summary
	for (let i = 0; i < eligible.length; i += batchSize) {
		const salts = eligible.slice(i, i + batchSize).map(item => item.salt)
		summary.batches += 1
		try {
			const txHash = await withRelayerBroadcastLease({
				keyId: `forwarder-sweeper:${config.factoryAddress}`,
			}, () => resolvedChain.sweepMany(salts))
			if (txHash) {
				summary.submitted += 1
				summary.txHashes.push(String(txHash).toLowerCase())
			}
		} catch (error) {
			summary.failed += 1
		}
	}
	return summary
}
