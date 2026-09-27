import * as crypto from 'node:crypto'
import { getContractAddress, isAddress } from 'viem'
import { configuredBaseNetwork } from './base-network.mjs'

const BASE_USDC_CONTRACT = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'

export class DepositForwarderError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'DepositForwarderError'
		this.code = code
		this.details = details
	}
}

function normalizeAddress(value, field) {
	const text = String(value || '').trim()
	if (!isAddress(text)) {
		throw new DepositForwarderError('FORWARDER_ADDRESS_INVALID', `Invalid ${field} address.`, { field })
	}
	return text.toLowerCase()
}

function normalizeBytes32(value, field) {
	const text = String(value || '').trim().toLowerCase()
	if (!/^0x[0-9a-f]{64}$/.test(text)) {
		throw new DepositForwarderError('FORWARDER_BYTES32_INVALID', `Invalid ${field} bytes32 value.`, { field })
	}
	return text
}

function stableJson(value) {
	if (value === null || value === undefined) return 'null'
	if (typeof value !== 'object') return JSON.stringify(value)
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
	return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`
}

export function deriveForwarderSalt(input = {}, secret = process.env.BETTERPPTX_FORWARDER_SALT_SECRET) {
	const key = String(secret || '').trim()
	if (Buffer.byteLength(key, 'utf8') < 32) {
		throw new DepositForwarderError('FORWARDER_SALT_SECRET_MISSING', 'Forwarder salt secret is missing or too short.')
	}
	const material = stableJson({
		schema: 'betterpptx.forwarder-salt.v1',
		orderId: input.orderId || null,
		intentId: input.intentId || null,
		customerHash: input.customerHash || null,
		packId: input.packId || null,
		createdAt: input.createdAt || null,
		nonce: input.nonce || null,
	})
	return `0x${crypto.createHmac('sha256', key).update(material, 'utf8').digest('hex')}`
}

export function predictForwarderAddress({ factoryAddress, salt, initCodeHash }) {
	return getContractAddress({
		from: normalizeAddress(factoryAddress, 'factory'),
		opcode: 'CREATE2',
		salt: normalizeBytes32(salt, 'salt'),
		bytecodeHash: normalizeBytes32(initCodeHash, 'initCodeHash'),
	}).toLowerCase()
}

export function configuredForwarderConfig(env = process.env) {
	const rail = String(env.BETTERPPTX_RAW_SEND_RAIL || '').trim().toLowerCase()
	if (rail !== 'forwarder') return null
	let paymentNetwork
	try { paymentNetwork = configuredBaseNetwork(env) } catch (error) {
		throw new DepositForwarderError(error.code || 'FORWARDER_NETWORK_INVALID', 'Forwarder raw-send cannot be configured until the payment network is valid.')
	}
	if (paymentNetwork.alias !== 'mainnet') {
		throw new DepositForwarderError('FORWARDER_NETWORK_UNSUPPORTED', 'The CREATE2 forwarder rail is qualified for Base mainnet only.')
	}
	return {
		rail,
		factoryAddress: normalizeAddress(env.BETTERPPTX_FORWARDER_FACTORY_ADDRESS, 'factory'),
		initCodeHash: normalizeBytes32(env.BETTERPPTX_FORWARDER_CODEHASH, 'forwarderCodehash'),
		collectorAddress: normalizeAddress(env.BETTERPPTX_SETTLEMENT_COLLECTOR_EVM_ADDRESS, 'settlementCollector'),
		tokenAddress: normalizeAddress(env.BETTERPPTX_FORWARDER_TOKEN_ADDRESS || BASE_USDC_CONTRACT, 'token'),
		batchSize: Math.max(1, Math.min(100, Math.floor(Number(env.BETTERPPTX_FORWARDER_BATCH_SIZE || 25) || 25))),
		canaryMaxUsdc: Math.max(0, Number(env.BETTERPPTX_FORWARDER_CANARY_MAX_USDC || 0) || 0),
		saltSecretConfigured: Buffer.byteLength(String(env.BETTERPPTX_FORWARDER_SALT_SECRET || ''), 'utf8') >= 32,
		sweeperKeyConfigured: /^0x[0-9a-fA-F]{64}$/.test(String(env.BETTERPPTX_FORWARDER_SWEEPER_KEY || '').trim()),
	}
}

export function forwarderReadiness(env = process.env) {
	try {
		const config = configuredForwarderConfig(env)
		if (!config) return { enabled: false, configured: false, missing: ['BETTERPPTX_RAW_SEND_RAIL=forwarder'] }
		const missing = []
		if (!config.saltSecretConfigured) missing.push('BETTERPPTX_FORWARDER_SALT_SECRET')
		if (!config.sweeperKeyConfigured) missing.push('BETTERPPTX_FORWARDER_SWEEPER_KEY')
		return { enabled: true, configured: missing.length === 0, missing, config: { ...config, saltSecretConfigured: undefined, sweeperKeyConfigured: undefined } }
	} catch (error) {
		return { enabled: true, configured: false, missing: [error?.details?.field || error?.code || 'forwarder-config'], error: error?.code || 'FORWARDER_CONFIG_INVALID' }
	}
}
