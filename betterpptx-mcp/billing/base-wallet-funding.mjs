import { createPublicClient, formatUnits, http, parseAbi } from 'viem'

import { recordResourceUsage } from './resource-meter.mjs'
import { configuredBaseNetwork, viemBaseChain } from './base-network.mjs'

export const BASE_MAINNET_CHAIN_ID = 8453
export const BASE_MAINNET_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'

const ERC20_BALANCE_ABI = parseAbi([
	'function balanceOf(address account) view returns (uint256)',
])

export class BaseWalletFundingError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'BaseWalletFundingError'
		this.code = code
		this.details = details
	}
}

export function normalizeFundingAddress(value) {
	const address = String(value || '').trim().toLowerCase()
	if (!/^0x[0-9a-f]{40}$/.test(address)) {
		throw new BaseWalletFundingError('FUNDING_ADDRESS_INVALID', 'The wallet funding address is invalid.')
	}
	return address
}

export function normalizeRequiredAtomic(value) {
	const text = String(value ?? '0').trim()
	if (!/^\d+$/.test(text)) {
		throw new BaseWalletFundingError('FUNDING_AMOUNT_INVALID', 'The required USDC amount is invalid.')
	}
	const amount = BigInt(text)
	if (amount < 0n || amount > 10_000_000_000n) {
		throw new BaseWalletFundingError('FUNDING_AMOUNT_INVALID', 'The required USDC amount is outside the supported range.')
	}
	return amount
}

export async function readBaseWalletFundingStatus({
	address,
	requiredAtomic = '0',
	rpcUrl = '',
	env = process.env,
} = {}) {
	const paymentNetwork = configuredBaseNetwork(env)
	const walletAddress = normalizeFundingAddress(address)
	const required = normalizeRequiredAtomic(requiredAtomic)
	const url = String(rpcUrl || process.env.BETTERPPTX_BASE_RPC_URL || '').trim()
	if (!/^https:\/\//i.test(url) && process.env.BETTERPPTX_ALLOW_INSECURE_BASE_RPC !== '1') {
		throw new BaseWalletFundingError('BASE_RPC_NOT_CONFIGURED', 'Base wallet balance lookup is unavailable.')
	}
	const client = createPublicClient({ chain: viemBaseChain(paymentNetwork, url), transport: http(url) })
	recordResourceUsage({ externalCalls: 1 })
	const chainId = await client.getChainId()
	if (chainId !== paymentNetwork.chainId) {
		throw new BaseWalletFundingError('BASE_RPC_WRONG_CHAIN', 'Configured chain endpoint does not match the selected payment network.', { chainId, expectedChainId: paymentNetwork.chainId, network: paymentNetwork.network })
	}
	recordResourceUsage({ externalCalls: 1 })
	const balance = await client.readContract({
		address: paymentNetwork.tokenContract,
		abi: ERC20_BALANCE_ABI,
		functionName: 'balanceOf',
		args: [walletAddress],
	})
	return {
		address: walletAddress,
		network: paymentNetwork.displayName,
		chainId: paymentNetwork.chainId,
		asset: 'USDC',
		tokenContract: paymentNetwork.tokenContract,
		decimals: 6,
		balanceAtomic: balance.toString(),
		balanceUsdc: formatUnits(balance, 6),
		requiredAtomic: required.toString(),
		requiredUsdc: formatUnits(required, 6),
		shortfallAtomic: balance >= required ? '0' : (required - balance).toString(),
		shortfallUsdc: balance >= required ? '0' : formatUnits(required - balance, 6),
		funded: balance >= required,
		checkedAt: new Date().toISOString(),
	}
}
