import { defineChain } from 'viem'

// The public payment contract supports exactly two Base environments.  Keep
// the values in one module so a quote, validator, RPC client, watcher, and
// readiness response cannot silently disagree about the chain or USDC token.
const NETWORKS = Object.freeze({
	mainnet: Object.freeze({
		id: 'base-mainnet',
		alias: 'mainnet',
		chainId: 8453,
		network: 'eip155:8453',
		name: 'Base',
		displayName: 'Base',
			tokenSymbol: 'USDC',
			tokenContract: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
			tokenDecimals: 6,
			paymentMethod: 'USDC_BASE_MAINNET',
			payramEnvironment: 'mainnet',
	}),
	testnet: Object.freeze({
		id: 'base-sepolia',
		alias: 'testnet',
		chainId: 84532,
		network: 'eip155:84532',
		name: 'Base Sepolia',
		displayName: 'Base Sepolia testnet',
			tokenSymbol: 'USDC',
			tokenContract: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
			tokenDecimals: 6,
			paymentMethod: 'USDC_BASE_SEPOLIA',
			payramEnvironment: 'testnet',
	}),
})

const NETWORK_ALIASES = new Map([
	['base-mainnet', 'mainnet'],
	['base', 'mainnet'],
	['base-l1', 'mainnet'],
	['mainnet', 'mainnet'],
	['live', 'mainnet'],
	['production', 'mainnet'],
	['base-sepolia', 'testnet'],
	['sepolia', 'testnet'],
	['base-testnet', 'testnet'],
	['testnet', 'testnet'],
	['test', 'testnet'],
	['sandbox', 'testnet'],
])

const PAYRAM_ALIASES = new Map([
	['mainnet', 'mainnet'],
	['live', 'mainnet'],
	['production', 'mainnet'],
	['testnet', 'testnet'],
	['test', 'testnet'],
	['sandbox', 'testnet'],
	['development', 'testnet'],
])

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

export class BaseNetworkConfigError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'BaseNetworkConfigError'
		this.code = code
		this.details = details
	}
}

function text(value) {
	return String(value ?? '').trim().toLowerCase()
}

function isTrue(value) {
	return TRUE_VALUES.has(text(value))
}

function selectorFromEnv(env) {
	for (const name of ['BETTERPPTX_PAYMENT_NETWORK', 'BETTERPPTX_BASE_NETWORK']) {
		const value = text(env?.[name])
		if (value) return { name, value }
	}
	return { name: null, value: '' }
}

function requiresExplicitSelection(env, options = {}) {
	if (options.requireExplicit !== undefined) return Boolean(options.requireExplicit)
	return isTrue(env?.BETTERPPTX_REQUIRE_EXPLICIT_PAYMENT_NETWORK)
		|| text(env?.BETTERPPTX_DEPLOYMENT_STAGE) === 'testnet'
}

export function normalizeBaseNetwork(value) {
	const alias = NETWORK_ALIASES.get(text(value))
	if (!alias) {
		throw new BaseNetworkConfigError('BASE_NETWORK_INVALID', 'The payment network must be Base mainnet or Base Sepolia testnet.', {
			value: String(value ?? ''),
		})
	}
	return NETWORKS[alias]
}

export function normalizePayramEnvironment(value) {
	const normalized = PAYRAM_ALIASES.get(text(value))
	if (!normalized) {
		throw new BaseNetworkConfigError('PAYRAM_NETWORK_INVALID', 'PayRam must be explicitly configured for mainnet or testnet.', {
			value: String(value ?? ''),
		})
	}
	return normalized
}

export function configuredBaseNetwork(env = process.env, options = {}) {
	const selector = selectorFromEnv(env)
	if (!selector.value) {
		if (requiresExplicitSelection(env, options)) {
			throw new BaseNetworkConfigError('BASE_NETWORK_EXPLICIT_REQUIRED', 'This deployment requires an explicit payment network selection.', {
				variable: 'BETTERPPTX_PAYMENT_NETWORK',
			})
		}
		return NETWORKS.mainnet
	}
	return normalizeBaseNetwork(selector.value)
}

export function configuredPayramEnvironment(env = process.env, { requireExplicit = false } = {}) {
	const value = text(env?.BETTERPPTX_PAYRAM_NETWORK)
	if (!value) {
		if (requireExplicit) {
			throw new BaseNetworkConfigError('PAYRAM_NETWORK_EXPLICIT_REQUIRED', 'PayRam requires an explicit mainnet or testnet environment selection.', {
				variable: 'BETTERPPTX_PAYRAM_NETWORK',
			})
		}
		return null
	}
	return normalizePayramEnvironment(value)
}

export function paymentNetworkReadiness({ env = process.env, payramEnabled = isTrue(env?.BETTERPPTX_PAYRAM_ENABLED) } = {}) {
	const missing = []
	const errors = []
	let network = null
	let selector = selectorFromEnv(env)
	try {
		network = configuredBaseNetwork(env)
	} catch (error) {
		errors.push(error.code || 'BASE_NETWORK_INVALID')
	}
	if (requiresExplicitSelection(env, {}) && !selector.value) missing.push('BETTERPPTX_PAYMENT_NETWORK')

	let payram = null
	if (payramEnabled) {
		try {
			payram = configuredPayramEnvironment(env, { requireExplicit: true })
		} catch (error) {
			errors.push(error.code || 'PAYRAM_NETWORK_INVALID')
			if (!text(env?.BETTERPPTX_PAYRAM_NETWORK)) missing.push('BETTERPPTX_PAYRAM_NETWORK')
		}
		if (network && payram && payram !== network.payramEnvironment) {
			errors.push('PAYMENT_NETWORK_MISMATCH')
		}
	}

	return {
		ready: Boolean(network && !missing.length && !errors.length),
		selected: network ? {
			id: network.id,
			alias: network.alias,
			chainId: network.chainId,
			network: network.network,
			name: network.name,
			displayName: network.displayName,
			tokenSymbol: network.tokenSymbol,
			tokenContract: network.tokenContract,
			tokenDecimals: network.tokenDecimals,
			paymentMethod: network.paymentMethod,
			payramEnvironment: network.payramEnvironment,
		} : null,
		selector: selector.name,
		explicit: Boolean(selector.value),
		payramEnvironment: payram,
		payramExplicit: Boolean(text(env?.BETTERPPTX_PAYRAM_NETWORK)),
		missing: [...new Set(missing)],
		errors: [...new Set(errors)],
	}
}

export function viemBaseChain(network = configuredBaseNetwork(), rpcUrl = '') {
	const url = String(rpcUrl || '').trim()
	const httpUrls = url ? [url] : []
	return defineChain({
		id: network.chainId,
		name: network.name,
		nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
		rpcUrls: {
			default: { http: httpUrls },
			public: { http: httpUrls },
		},
	})
}

export const BASE_MAINNET_NETWORK = NETWORKS.mainnet
export const BASE_SEPOLIA_NETWORK = NETWORKS.testnet
