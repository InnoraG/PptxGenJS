import { HDKey } from '@scure/bip32'
import { secp256k1 } from '@noble/curves/secp256k1'
import { keccak_256 } from '@noble/hashes/sha3'
import { bytesToHex } from '@noble/hashes/utils'
import { configuredBaseNetwork, normalizeBaseNetwork } from './base-network.mjs'

const FORBIDDEN_KEY = /private|secret|mnemonic|seed|xprv|keystore/i
const XPUB_PATTERN = /^xpub[1-9A-HJ-NP-Za-km-z]+$/

export class DepositXpubError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'DepositXpubError'
		this.code = code
		this.details = details
	}
}

function assertNoSigningMaterial(value, key = '') {
	if (key && FORBIDDEN_KEY.test(key)) {
		throw new DepositXpubError(
			'DEPOSIT_XPUB_SIGNING_MATERIAL_FORBIDDEN',
			'Deposit xpub configuration must contain public derivation material only.',
		)
	}
	if (!value || typeof value !== 'object') return
	if (Array.isArray(value)) {
		for (const item of value) assertNoSigningMaterial(item)
		return
	}
	for (const [childKey, child] of Object.entries(value)) assertNoSigningMaterial(child, childKey)
}

function parseXpubConfig(input) {
	if (!input) return null
	if (typeof input === 'string') {
		const text = input.trim()
		if (!text) return null
		if (text.startsWith('{')) return JSON.parse(text)
		return { xpub: text }
	}
	return input
}

export function normalizeDepositXpubConfig(input = null, { env = process.env } = {}) {
	const parsed = parseXpubConfig(input)
	if (!parsed) return null
	let paymentNetwork
	try {
		paymentNetwork = configuredBaseNetwork(env)
	} catch (error) {
		throw new DepositXpubError(error.code || 'DEPOSIT_XPUB_NETWORK_INVALID', 'Deposit xpub cannot be configured until the payment network is valid.')
	}
	assertNoSigningMaterial(parsed)
	if (typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new DepositXpubError('DEPOSIT_XPUB_INVALID', 'Deposit xpub configuration must be a JSON object or xpub string.')
	}
	const xpub = String(parsed.xpub || '').trim()
	if (!XPUB_PATTERN.test(xpub)) {
		throw new DepositXpubError('DEPOSIT_XPUB_INVALID', 'Deposit xpub configuration contains an invalid xpub.')
	}
	let hd
	try {
		hd = HDKey.fromExtendedKey(xpub)
	} catch {
		throw new DepositXpubError('DEPOSIT_XPUB_INVALID', 'Deposit xpub could not be parsed.')
	}
	if (hd.privateKey) {
		throw new DepositXpubError('DEPOSIT_XPUB_SIGNING_MATERIAL_FORBIDDEN', 'Deposit xpub must not contain private key material.')
	}
	const networkId = String(parsed.network || paymentNetwork.id).trim()
	let normalizedNetwork
	try { normalizedNetwork = normalizeBaseNetwork(networkId) } catch {
		throw new DepositXpubError('DEPOSIT_XPUB_NETWORK_INVALID', 'Deposit xpub network does not identify a supported Base environment.')
	}
	const chainId = Math.max(0, Math.round(Number(parsed.chainId ?? normalizedNetwork.chainId) || normalizedNetwork.chainId))
	if (normalizedNetwork.id !== paymentNetwork.id || chainId !== paymentNetwork.chainId) {
		throw new DepositXpubError('DEPOSIT_XPUB_NETWORK_MISMATCH', 'Deposit xpub network must match the configured payment network.')
	}
	return {
		schema: String(parsed.schema || 'betterpptx.deposit-xpub.v1'),
		xpub,
		pathPrefix: String(parsed.pathPrefix || "m/44'/60'/0'/0"),
		startIndex: Math.max(0, Math.round(Number(parsed.startIndex ?? 0) || 0)),
		labelPrefix: String(parsed.labelPrefix || 'deposit').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'deposit',
		network: normalizedNetwork.id,
		chainId,
		fingerprint: String(parsed.fingerprint || '').slice(0, 64) || null,
	}
}

export function configuredDepositXpub() {
	const json = String(process.env.BETTERPPTX_DEPOSIT_XPUB_JSON || '').trim()
	const plain = String(process.env.BETTERPPTX_DEPOSIT_XPUB || '').trim()
	return normalizeDepositXpubConfig(json || plain || null)
}

export function depositXpubConfigured() {
	try {
		return Boolean(configuredDepositXpub())
	} catch {
		return false
	}
}

export function deriveDepositAddress(config, index) {
	const normalized = normalizeDepositXpubConfig(config)
	if (!normalized) throw new DepositXpubError('DEPOSIT_XPUB_MISSING', 'Deposit xpub is not configured.')
	const childIndex = Math.max(0, Math.round(Number(index) || 0))
	const child = HDKey.fromExtendedKey(normalized.xpub).deriveChild(childIndex)
	if (!child.publicKey) throw new DepositXpubError('DEPOSIT_XPUB_DERIVATION_FAILED', 'Deposit xpub derivation failed.')
	const uncompressed = secp256k1.ProjectivePoint.fromHex(child.publicKey).toRawBytes(false)
	const hashed = keccak_256(uncompressed.slice(1))
	const address = `0x${bytesToHex(hashed.slice(-20))}`.toLowerCase()
	return {
		address,
		index: childIndex,
		label: `${normalized.labelPrefix}-${String(childIndex).padStart(10, '0')}`,
		path: `${normalized.pathPrefix}/${childIndex}`,
		source: 'xpub',
		xpubFingerprint: normalized.fingerprint,
	}
}
