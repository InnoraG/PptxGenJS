import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { configuredAddressInventory, normalizeAddressInventory, normalizeEvmAddress } from './address-inventory.mjs'
import { configuredCryptoPacks, creditsPerUsdc, minimumPaymentUsdc } from './crypto-packs.mjs'
import { configuredDepositXpub, deriveDepositAddress } from './deposit-xpub.mjs'
import { configuredForwarderConfig, deriveForwarderSalt, predictForwarderAddress } from './deposit-forwarders.mjs'
import {
	meteredFirestoreGet,
	meteredFirestoreQueryGet,
	runMeteredFirestoreTransaction,
} from './firestore-meter.mjs'
import { configuredBaseNetwork, BASE_MAINNET_NETWORK } from './base-network.mjs'

export const BASE_CHAIN_ID = 8453
export const BASE_USDC_CONTRACT = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'

export class CryptoOrderError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'CryptoOrderError'
		this.code = code
		this.details = details
	}
}

function providerName() {
	return String(process.env.BETTERPPTX_CRYPTO_ORDER_STORE || process.env.BETTERPPTX_BILLING_LEDGER_STORE || 'local').trim().toLowerCase()
}

function orderFile() {
	const configured = String(process.env.BETTERPPTX_CRYPTO_ORDER_FILE || '').trim()
	if (configured) return path.resolve(configured)
	const root = String(process.env.BETTERPPTX_OUT_DIR || process.env.BETTERPPTX_DOWNLOAD_ROOT || 'outputs').trim()
	return path.resolve(root, 'betterpptx-crypto-orders.json')
}

function collectionPrefix() {
	return String(process.env.BETTERPPTX_FIRESTORE_BILLING_PREFIX || 'betterpptx_billing').trim()
}

function nowIso() {
	return new Date().toISOString()
}

function clone(value) {
	return value == null ? value : JSON.parse(JSON.stringify(value))
}

function newOrderId() {
	return `order_${crypto.randomBytes(16).toString('hex')}`
}

function fingerprint(value) {
	return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex').slice(0, 16)
}

function packById(packId) {
	const pack = configuredCryptoPacks().find(item => item.id === String(packId))
	if (!pack) throw new CryptoOrderError('CRYPTO_PACK_NOT_FOUND', 'The requested credit pack is unavailable.')
	return pack
}

function forwarderAllocation(input = {}) {
	let config
	try {
		const paymentNetwork = configuredBaseNetwork()
		if (paymentNetwork.alias !== 'mainnet') {
			throw new CryptoOrderError('FORWARDER_NETWORK_UNSUPPORTED', 'The CREATE2 forwarder rail is qualified for Base mainnet only; use the configured testnet xpub or x402 route.')
		}
		config = configuredForwarderConfig()
		if (!config) return null
		if (config.tokenAddress !== BASE_USDC_CONTRACT) {
			throw new CryptoOrderError('FORWARDER_TOKEN_UNSUPPORTED', 'Forwarder raw-send rail must use canonical Base USDC.')
		}
		const pack = packById(input.packId)
		if (config.canaryMaxUsdc > 0 && Number(pack.priceUsdc || 0) > config.canaryMaxUsdc) {
			throw new CryptoOrderError('FORWARDER_CANARY_CAP_EXCEEDED', 'Forwarder raw-send canary cap blocks this credit pack.')
		}
		const preparedInput = { ...input, orderId: input.orderId || newOrderId() }
		const salt = deriveForwarderSalt({
			orderId: preparedInput.orderId,
			customerHash: preparedInput.customerHash || preparedInput.installHash || '',
			packId: preparedInput.packId,
			nonce: preparedInput.envelopeJti,
		})
		const address = predictForwarderAddress({
			factoryAddress: config.factoryAddress,
			salt,
			initCodeHash: config.initCodeHash,
		})
		return {
			input: preparedInput,
			address,
			meta: {
				source: 'forwarder',
				forwarderFactoryAddress: config.factoryAddress,
				forwarderCodehash: config.initCodeHash,
				settlementCollectorAddress: config.collectorAddress,
				forwarderSaltFingerprint: fingerprint(salt),
				forwarderBatchSize: config.batchSize,
				forwarderCanaryMaxUsdc: config.canaryMaxUsdc,
			},
		}
	} catch (error) {
		if (error instanceof CryptoOrderError) throw error
		throw new CryptoOrderError(error?.code || 'FORWARDER_CONFIG_INVALID', error?.message || 'Forwarder raw-send rail is not configured.', error?.details || {})
	}
}

function newOrder(input, address, addressMeta = {}) {
	const pack = packById(input.packId)
	const paymentNetwork = configuredBaseNetwork()
	const now = nowIso()
	const orderId = String(input.orderId || newOrderId())
	return {
		orderId,
		installHash: String(input.installHash || ''),
		customerHash: String(input.customerHash || input.installHash || ''),
		envelopeJti: String(input.envelopeJti || ''),
		packId: pack.id,
		expectedCredits: pack.credits,
		expectedUsdc: pack.priceUsdc,
		displayUsdc: pack.priceUsdc,
		network: paymentNetwork.network,
		networkName: paymentNetwork.displayName,
		chainId: paymentNetwork.chainId,
		tokenContract: paymentNetwork.tokenContract,
		depositAddress: normalizeEvmAddress(address),
		depositAddressSource: addressMeta.source || 'inventory',
		depositAddressIndex: Number.isFinite(Number(addressMeta.index)) ? Math.max(0, Math.round(Number(addressMeta.index))) : null,
		depositAddressPath: addressMeta.path || null,
		depositXpubFingerprint: addressMeta.xpubFingerprint || null,
		depositForwarderFactoryAddress: addressMeta.forwarderFactoryAddress || null,
		depositForwarderCodehash: addressMeta.forwarderCodehash || null,
		settlementCollectorAddress: addressMeta.settlementCollectorAddress || null,
		depositForwarderSaltFingerprint: addressMeta.forwarderSaltFingerprint || null,
		depositForwarderBatchSize: Number.isFinite(Number(addressMeta.forwarderBatchSize)) ? Math.max(1, Math.round(Number(addressMeta.forwarderBatchSize))) : null,
		depositForwarderCanaryMaxUsdc: Number.isFinite(Number(addressMeta.forwarderCanaryMaxUsdc)) ? Math.max(0, Number(addressMeta.forwarderCanaryMaxUsdc)) : null,
		status: 'pending',
		confirmedUsdcMicros: 0,
		creditedCredits: 0,
		confirmationState: 'waiting',
		transfers: {},
		createdAt: now,
		updatedAt: now,
	}
}

function publicOrder(order = {}) {
	const networkName = order.networkName
		|| (Number(order.chainId) === BASE_MAINNET_NETWORK.chainId ? BASE_MAINNET_NETWORK.displayName : `Base chain ${Number(order.chainId) || 'unknown'}`)
	return {
		orderId: order.orderId,
		packId: order.packId,
		expectedCredits: order.expectedCredits,
		expectedUsdc: order.expectedUsdc,
		displayUsdc: order.displayUsdc,
		network: networkName,
		chainId: order.chainId,
		tokenSymbol: 'USDC',
		tokenContract: order.tokenContract,
		depositAddress: order.depositAddress,
		status: order.status,
		confirmedUsdc: Number((Number(order.confirmedUsdcMicros || 0) / 1e6).toFixed(6)),
		creditedCredits: Number(order.creditedCredits || 0),
		confirmationState: order.confirmationState,
		createdAt: order.createdAt,
		updatedAt: order.updatedAt,
	}
}

function emptyStore() {
	return { version: 1, orders: {}, addresses: {}, envelopes: {}, allocators: {} }
}

function normalizeStore(store = {}) {
	return {
		...emptyStore(),
		...store,
		orders: store.orders && typeof store.orders === 'object' ? store.orders : {},
		addresses: store.addresses && typeof store.addresses === 'object' ? store.addresses : {},
		envelopes: store.envelopes && typeof store.envelopes === 'object' ? store.envelopes : {},
		allocators: store.allocators && typeof store.allocators === 'object' ? store.allocators : {},
	}
}

function activeSinceIso(days = 30) {
	return new Date(Date.now() - Math.max(1, Number(days) || 30) * 86400000).toISOString()
}

function transferId(transfer = {}) {
	return `${String(transfer.txHash || '').toLowerCase()}:${Math.max(0, Number(transfer.logIndex) || 0)}`
}

function normalizeTransfer(transfer = {}) {
	const txHash = String(transfer.txHash || '').toLowerCase()
	if (!/^0x[a-f0-9]{64}$/.test(txHash)) throw new CryptoOrderError('CHAIN_TRANSFER_INVALID', 'Chain transfer proof is invalid.')
	const amountUsdcMicros = Number(transfer.amountUsdcMicros)
	if (!Number.isSafeInteger(amountUsdcMicros) || amountUsdcMicros <= 0) throw new CryptoOrderError('CHAIN_TRANSFER_AMOUNT_INVALID', 'Chain transfer amount is invalid.')
	for (const key of ['logIndex', 'blockNumber', 'confirmations']) {
		if (!Number.isSafeInteger(Number(transfer[key])) || Number(transfer[key]) < 0) throw new CryptoOrderError('CHAIN_TRANSFER_INVALID', 'Chain transfer proof is invalid.')
	}
	const blockHash = transfer.blockHash ? String(transfer.blockHash).toLowerCase() : null
	if (blockHash && !/^0x[a-f0-9]{64}$/.test(blockHash)) throw new CryptoOrderError('CHAIN_TRANSFER_INVALID', 'Chain transfer block evidence is invalid.')
	const finalizedBlockNumber = transfer.finalizedBlockNumber == null ? null : Number(transfer.finalizedBlockNumber)
	if (finalizedBlockNumber !== null && (!blockHash || !Number.isSafeInteger(finalizedBlockNumber) || finalizedBlockNumber < Number(transfer.blockNumber))) throw new CryptoOrderError('CHAIN_TRANSFER_INVALID', 'Chain transfer finality evidence is invalid.')
	return {
		transferId: transferId(transfer),
		txHash,
		logIndex: Math.max(0, Math.round(Number(transfer.logIndex) || 0)),
		blockNumber: Math.max(0, Math.round(Number(transfer.blockNumber) || 0)),
		blockHash,
		finalizedBlockNumber,
		amountUsdcMicros,
		confirmations: Math.max(0, Math.round(Number(transfer.confirmations) || 0)),
		removed: Boolean(transfer.removed),
		detectedAt: transfer.detectedAt || nowIso(),
	}
}

function finalizedTransfer(transfer) {
	return !transfer.removed && /^0x[a-f0-9]{64}$/.test(transfer.blockHash || '')
		&& Number.isSafeInteger(transfer.finalizedBlockNumber) && transfer.finalizedBlockNumber >= transfer.blockNumber
}

export function desiredCryptoOrderCredits(order = {}, { finalizedOnly = false } = {}) {
	const confirmed = finalizedOnly
		? Object.values(order.transfers || {}).filter(finalizedTransfer).reduce((sum, transfer) => sum + Number(transfer.amountUsdcMicros), 0)
		: Number(order.confirmedUsdcMicros || 0)
	if (!Number.isSafeInteger(confirmed) || confirmed < 0) throw new CryptoOrderError('CHAIN_TRANSFER_AMOUNT_INVALID', 'Confirmed payment total is invalid.')
	const minimumMicros = Math.round(minimumPaymentUsdc() * 1e6)
	const credits = confirmed >= minimumMicros ? Math.floor((confirmed * creditsPerUsdc()) / 1e6) : 0
	if (!Number.isSafeInteger(credits) || credits < 0) throw new CryptoOrderError('CHAIN_TRANSFER_AMOUNT_INVALID', 'Confirmed credit total is invalid.')
	return credits
}

function creditedOrder(order, creditedCredits) {
	const requested = Number(creditedCredits)
	const desired = desiredCryptoOrderCredits(order)
	if (!Number.isSafeInteger(requested) || requested < 0 || requested > desired) throw new CryptoOrderError('CRYPTO_ORDER_CREDIT_INVALID', 'Credit checkpoint exceeds the confirmed payment total.')
	const credits = Math.max(Number(order.creditedCredits || 0), requested)
	const pending = desired > credits
	return {
		...order,
		creditedCredits: credits,
		status: !pending && credits >= Number(order.expectedCredits || 0) ? 'credited' : 'partial',
		confirmationState: pending ? 'ready_to_credit' : 'credited',
		creditedAt: nowIso(), updatedAt: nowIso(),
	}
}

function applyTransfer(order, transfer) {
	if ((transfer.to && transfer.to.toLowerCase() !== order.depositAddress.toLowerCase())
		|| (transfer.tokenContract && transfer.tokenContract.toLowerCase() !== order.tokenContract.toLowerCase())) throw new CryptoOrderError('CHAIN_TRANSFER_BINDING_INVALID', 'Chain transfer does not belong to this payment order.')
	const normalized = normalizeTransfer(transfer)
	const existing = order.transfers?.[normalized.transferId]
	if (existing) {
		if (existing.txHash !== normalized.txHash || existing.logIndex !== normalized.logIndex || existing.amountUsdcMicros !== normalized.amountUsdcMicros || existing.blockNumber !== normalized.blockNumber || existing.removed !== normalized.removed
			|| (existing.blockHash && normalized.blockHash && existing.blockHash !== normalized.blockHash)) throw new CryptoOrderError('CHAIN_TRANSFER_CONFLICT', 'Chain transfer id was already recorded with different evidence.')
		const upgradingFinality = !finalizedTransfer(existing) && finalizedTransfer(normalized)
		if (existing.confirmations >= normalized.confirmations && !upgradingFinality) return { order, transfer: existing, desiredCredits: desiredCryptoOrderCredits(order), idempotent: true }
		normalized.blockHash ||= existing.blockHash || null
		normalized.finalizedBlockNumber ??= existing.finalizedBlockNumber ?? null
		normalized.confirmations = Math.max(existing.confirmations, normalized.confirmations)
		normalized.detectedAt = existing.detectedAt
	}
	const transfers = { ...(order.transfers || {}), [normalized.transferId]: normalized }
	const finalityRequired = order.finalityRequired === true || finalizedTransfer(normalized)
	const confirmedUsdcMicros = Object.values(transfers)
		.filter(item => finalityRequired ? finalizedTransfer(item) : !item.removed && item.confirmations >= (item.amountUsdcMicros <= 15e6 ? 2 : 5))
		.reduce((sum, item) => sum + Number(item.amountUsdcMicros || 0), 0)
	const desiredCredits = desiredCryptoOrderCredits({ confirmedUsdcMicros })
	const status = desiredCredits <= Number(order.creditedCredits || 0) && Number(order.creditedCredits || 0) > 0
		? (Number(order.creditedCredits) >= Number(order.expectedCredits || 0) ? 'credited' : 'partial')
		: desiredCredits <= 0
		? (confirmedUsdcMicros > 0 ? 'unmatched' : 'detected')
		: desiredCredits < Number(order.expectedCredits || 0) ? 'partial' : 'detected'
	const next = {
		...order,
		transfers,
		finalityRequired,
		confirmedUsdcMicros,
		status,
		confirmationState: desiredCredits > Number(order.creditedCredits || 0) ? 'ready_to_credit' : Number(order.creditedCredits || 0) > 0 ? 'credited' : 'waiting',
		updatedAt: nowIso(),
	}
	return { order: next, transfer: normalized, desiredCredits, idempotent: false }
}

function createLocalStore() {
	if (process.env.BETTERPPTX_REQUIRE_SHARED_STORES === '1') {
		throw new CryptoOrderError('CRYPTO_ORDER_STORE_NOT_SHARED', 'Crypto order storage is not configured for this deployment.')
	}
	const file = orderFile()
	let lock = Promise.resolve()

	function load() {
		try {
			if (fs.existsSync(file)) {
				const data = JSON.parse(fs.readFileSync(file, 'utf8'))
				if (!data || data.version !== 1 || !data.orders || !data.addresses || !data.envelopes) throw new Error('Invalid order store')
				return normalizeStore(data)
			}
		} catch { throw new CryptoOrderError('CRYPTO_ORDER_STORE_CORRUPT', 'Payment order storage could not be read safely.') }
		return emptyStore()
	}

	function save(store) {
		fs.mkdirSync(path.dirname(file), { recursive: true })
		const temporary = `${file}.${crypto.randomBytes(12).toString('hex')}.tmp`
		fs.writeFileSync(temporary, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
		fs.renameSync(temporary, file)
	}

	function withLock(fn) {
		const next = lock.then(() => fn(), () => fn())
		lock = next.catch(() => {})
		return next
	}

	async function ensureAddressInventory(addresses = configuredAddressInventory()) {
		return withLock(() => {
			const store = load()
			for (const item of normalizeAddressInventory(addresses)) {
				store.addresses[item.address] ||= { ...item, state: 'available', createdAt: nowIso(), updatedAt: nowIso() }
			}
			save(store)
			return { count: Object.keys(store.addresses).length }
		})
	}

	async function createOrder(input = {}) {
		if (!input.installHash || !input.envelopeJti) throw new CryptoOrderError('CRYPTO_ORDER_BINDING_MISSING', 'Payment order identity is missing.')
		return withLock(() => {
			const store = load()
			if (store.envelopes[input.envelopeJti]) throw new CryptoOrderError('PAYMENT_ENVELOPE_REPLAYED', 'Payment link was already used.')
			const forwarder = forwarderAllocation(input)
			if (forwarder) {
				if (store.addresses[forwarder.address]) throw new CryptoOrderError('DEPOSIT_FORWARDER_ADDRESS_COLLISION', 'Predicted forwarder payment address already exists.')
				const order = newOrder(forwarder.input, forwarder.address, forwarder.meta)
				store.orders[order.orderId] = order
				store.envelopes[input.envelopeJti] = { envelopeJti: input.envelopeJti, orderId: order.orderId, usedAt: nowIso() }
				store.addresses[forwarder.address] = {
					address: forwarder.address,
					source: 'forwarder',
					state: 'assigned',
					orderId: order.orderId,
					forwarderFactoryAddress: forwarder.meta.forwarderFactoryAddress,
					forwarderCodehash: forwarder.meta.forwarderCodehash,
					settlementCollectorAddress: forwarder.meta.settlementCollectorAddress,
					forwarderSaltFingerprint: forwarder.meta.forwarderSaltFingerprint,
					assignedAt: nowIso(),
					updatedAt: nowIso(),
				}
				save(store)
				return publicOrder(order)
			}
			const xpub = configuredDepositXpub()
			if (xpub) {
				const allocator = store.allocators.depositXpub || { nextIndex: xpub.startIndex, createdAt: nowIso() }
				const index = Math.max(Number(xpub.startIndex || 0), Math.round(Number(allocator.nextIndex ?? xpub.startIndex) || 0))
				const derived = deriveDepositAddress(xpub, index)
				if (store.addresses[derived.address]) throw new CryptoOrderError('DEPOSIT_XPUB_ADDRESS_COLLISION', 'Derived payment address already exists.')
				const order = newOrder(input, derived.address, derived)
				store.orders[order.orderId] = order
				store.envelopes[input.envelopeJti] = { envelopeJti: input.envelopeJti, orderId: order.orderId, usedAt: nowIso() }
				store.addresses[derived.address] = { ...derived, state: 'assigned', orderId: order.orderId, assignedAt: nowIso(), updatedAt: nowIso() }
				store.allocators.depositXpub = { ...allocator, nextIndex: index + 1, updatedAt: nowIso(), xpubFingerprint: xpub.fingerprint || null }
				save(store)
				return publicOrder(order)
			}
			const address = Object.values(store.addresses)
				.filter(item => item.state === 'available')
				.sort((a, b) => Number(a.index) - Number(b.index))[0]
			if (!address) throw new CryptoOrderError('DEPOSIT_ADDRESS_INVENTORY_EXHAUSTED', 'No payment address is currently available.')
			const order = newOrder(input, address.address)
			store.orders[order.orderId] = order
			store.envelopes[input.envelopeJti] = { envelopeJti: input.envelopeJti, orderId: order.orderId, usedAt: nowIso() }
			store.addresses[address.address] = { ...address, state: 'assigned', orderId: order.orderId, assignedAt: nowIso(), updatedAt: nowIso() }
			save(store)
			return publicOrder(order)
		})
	}

	async function getOrder(orderId) {
		return clone(load().orders[String(orderId)] || null)
	}

	async function getOrderByAddress(address) {
		const target = normalizeEvmAddress(address)
		return clone(Object.values(load().orders).find(order => order.depositAddress === target) || null)
	}

	async function listWatchOrders({ hotWindowDays = 30 } = {}) {
		const cutoff = activeSinceIso(hotWindowDays)
		return Object.values(load().orders)
			.filter(order => order.createdAt >= cutoff && !['credited'].includes(order.status))
			.map(clone)
	}

	async function listForwarderSweepOrders({ hotWindowDays = 30, limit = 500 } = {}) {
		const cutoff = activeSinceIso(hotWindowDays)
		const max = Math.max(1, Math.min(5000, Math.round(Number(limit) || 500)))
		return Object.values(load().orders)
			.filter(order => order.depositAddressSource === 'forwarder' && order.createdAt >= cutoff)
			.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
			.slice(0, max)
			.map(clone)
	}

	async function recordTransfer(orderId, transfer) {
		return withLock(() => {
			const store = load()
			const order = store.orders[String(orderId)]
			if (!order) throw new CryptoOrderError('CRYPTO_ORDER_NOT_FOUND', 'Payment order was not found.')
			const applied = applyTransfer(order, transfer)
			if (!applied.idempotent) {
				store.orders[String(orderId)] = applied.order
				save(store)
			}
			return { ...applied, order: clone(applied.order) }
		})
	}

	async function markCredited(orderId, creditedCredits) {
		return withLock(() => {
			const store = load()
			const order = store.orders[String(orderId)]
			if (!order) throw new CryptoOrderError('CRYPTO_ORDER_NOT_FOUND', 'Payment order was not found.')
			const next = creditedOrder(order, creditedCredits)
			store.orders[String(orderId)] = next
			save(store)
			return clone(next)
		})
	}

	return {
		provider: 'local',
		shared: false,
		file,
		ensureAddressInventory,
		createOrder,
		getOrder,
		getOrderByAddress,
		listWatchOrders,
		listForwarderSweepOrders,
		recordTransfer,
		markCredited,
		publicOrder,
	}
}

let firestorePromise = null
async function firestore() {
	if (!firestorePromise) {
		firestorePromise = import('@google-cloud/firestore').then(({ Firestore }) => new Firestore({
			projectId: process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined,
			databaseId: process.env.BETTERPPTX_FIRESTORE_DATABASE || undefined,
		}))
	}
	return firestorePromise
}

function createFirestoreStore({ firestoreDb = null } = {}) {
	const prefix = collectionPrefix()

	async function refs() {
		const db = firestoreDb || await firestore()
		return {
			db,
			orders: db.collection(`${prefix}_crypto_orders`),
			addresses: db.collection(`${prefix}_deposit_addresses`),
			envelopes: db.collection(`${prefix}_payment_envelopes`),
			allocators: db.collection(`${prefix}_deposit_allocators`),
		}
	}

	async function ensureAddressInventory(addresses = configuredAddressInventory()) {
		const r = await refs()
		let count = 0
		for (const item of normalizeAddressInventory(addresses)) {
			const ref = r.addresses.doc(item.address)
			await runMeteredFirestoreTransaction(r.db, async tx => {
				const snap = await tx.get(ref)
				if (!snap.exists) tx.create(ref, { ...item, state: 'available', createdAt: nowIso(), updatedAt: nowIso() })
			})
			count += 1
		}
		return { count }
	}

	async function createOrder(input = {}) {
		if (!input.installHash || !input.envelopeJti) throw new CryptoOrderError('CRYPTO_ORDER_BINDING_MISSING', 'Payment order identity is missing.')
		const r = await refs()
		const forwarder = forwarderAllocation(input)
		if (forwarder) {
			return runMeteredFirestoreTransaction(r.db, async tx => {
				const envelopeRef = r.envelopes.doc(String(input.envelopeJti))
				const addressRef = r.addresses.doc(forwarder.address)
				const [envelopeSnap, addressSnap] = await Promise.all([tx.get(envelopeRef), tx.get(addressRef)])
				if (envelopeSnap.exists) throw new CryptoOrderError('PAYMENT_ENVELOPE_REPLAYED', 'Payment link was already used.')
				if (addressSnap.exists) throw new CryptoOrderError('DEPOSIT_FORWARDER_ADDRESS_COLLISION', 'Predicted forwarder payment address already exists.')
				const order = newOrder(forwarder.input, forwarder.address, forwarder.meta)
				tx.create(r.orders.doc(order.orderId), order)
				tx.create(envelopeRef, { envelopeJti: input.envelopeJti, orderId: order.orderId, usedAt: nowIso() })
				tx.create(addressRef, {
					address: forwarder.address,
					source: 'forwarder',
					state: 'assigned',
					orderId: order.orderId,
					forwarderFactoryAddress: forwarder.meta.forwarderFactoryAddress,
					forwarderCodehash: forwarder.meta.forwarderCodehash,
					settlementCollectorAddress: forwarder.meta.settlementCollectorAddress,
					forwarderSaltFingerprint: forwarder.meta.forwarderSaltFingerprint,
					assignedAt: nowIso(),
					updatedAt: nowIso(),
				})
				return publicOrder(order)
			})
		}
		const xpub = configuredDepositXpub()
		if (xpub) {
			return runMeteredFirestoreTransaction(r.db, async tx => {
				const envelopeRef = r.envelopes.doc(String(input.envelopeJti))
				const allocatorRef = r.allocators.doc('default_xpub')
				const [envelopeSnap, allocatorSnap] = await Promise.all([tx.get(envelopeRef), tx.get(allocatorRef)])
				if (envelopeSnap.exists) throw new CryptoOrderError('PAYMENT_ENVELOPE_REPLAYED', 'Payment link was already used.')
				const allocator = allocatorSnap.exists ? allocatorSnap.data() || {} : {}
				const index = Math.max(Number(xpub.startIndex || 0), Math.round(Number(allocator.nextIndex ?? xpub.startIndex) || 0))
				const derived = deriveDepositAddress(xpub, index)
				const addressRef = r.addresses.doc(derived.address)
				const addressSnap = await tx.get(addressRef)
				if (addressSnap.exists) throw new CryptoOrderError('DEPOSIT_XPUB_ADDRESS_COLLISION', 'Derived payment address already exists.')
				const order = newOrder(input, derived.address, derived)
				tx.create(r.orders.doc(order.orderId), order)
				tx.create(envelopeRef, { envelopeJti: input.envelopeJti, orderId: order.orderId, usedAt: nowIso() })
				tx.create(addressRef, { ...derived, state: 'assigned', orderId: order.orderId, assignedAt: nowIso(), updatedAt: nowIso() })
				tx.set(allocatorRef, {
					nextIndex: index + 1,
					startIndex: xpub.startIndex,
					pathPrefix: xpub.pathPrefix,
					source: 'xpub',
					xpubFingerprint: xpub.fingerprint || null,
					createdAt: allocator.createdAt || nowIso(),
					updatedAt: nowIso(),
				}, { merge: true })
				return publicOrder(order)
			})
		}
		for (let attempt = 0; attempt < 5; attempt += 1) {
			const available = await meteredFirestoreQueryGet(r.addresses.where('state', '==', 'available').orderBy('index').limit(1))
			if (available.empty) throw new CryptoOrderError('DEPOSIT_ADDRESS_INVENTORY_EXHAUSTED', 'No payment address is currently available.')
			const addressRef = available.docs[0].ref
			try {
				return await runMeteredFirestoreTransaction(r.db, async tx => {
					const envelopeRef = r.envelopes.doc(String(input.envelopeJti))
					const [addressSnap, envelopeSnap] = await Promise.all([tx.get(addressRef), tx.get(envelopeRef)])
					if (envelopeSnap.exists) throw new CryptoOrderError('PAYMENT_ENVELOPE_REPLAYED', 'Payment link was already used.')
					if (!addressSnap.exists || addressSnap.data()?.state !== 'available') throw new CryptoOrderError('DEPOSIT_ADDRESS_RACE', 'Payment address allocation raced.')
					const order = newOrder(input, addressRef.id)
					tx.create(r.orders.doc(order.orderId), order)
					tx.create(envelopeRef, { envelopeJti: input.envelopeJti, orderId: order.orderId, usedAt: nowIso() })
					tx.update(addressRef, { state: 'assigned', orderId: order.orderId, assignedAt: nowIso(), updatedAt: nowIso() })
					return publicOrder(order)
				})
			} catch (error) {
				if (error?.code !== 'DEPOSIT_ADDRESS_RACE' || attempt === 4) throw error
			}
		}
		throw new CryptoOrderError('DEPOSIT_ADDRESS_INVENTORY_EXHAUSTED', 'No payment address is currently available.')
	}

	async function getOrder(orderId) {
		const snap = await meteredFirestoreGet((await refs()).orders.doc(String(orderId)))
		return snap.exists ? snap.data() || null : null
	}

	async function getOrderByAddress(address) {
		const snap = await meteredFirestoreQueryGet((await refs()).orders.where('depositAddress', '==', normalizeEvmAddress(address)).limit(1))
		return snap.empty ? null : snap.docs[0].data() || null
	}

	async function listWatchOrders({ hotWindowDays = 30 } = {}) {
		const snap = await meteredFirestoreQueryGet((await refs()).orders.where('createdAt', '>=', activeSinceIso(hotWindowDays)))
		return snap.docs.map(doc => doc.data() || {}).filter(order => order.status !== 'credited')
	}

	async function listForwarderSweepOrders({ hotWindowDays = 30, limit = 500 } = {}) {
		const cutoff = activeSinceIso(hotWindowDays)
		const max = Math.max(1, Math.min(5000, Math.round(Number(limit) || 500)))
		const snap = await meteredFirestoreQueryGet((await refs()).orders.where('depositAddressSource', '==', 'forwarder').limit(max))
		return snap.docs
			.map(doc => doc.data() || {})
			.filter(order => String(order.createdAt || '') >= cutoff)
			.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
			.map(clone)
	}

	async function recordTransfer(orderId, transfer) {
		const r = await refs()
		const ref = r.orders.doc(String(orderId))
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const snap = await tx.get(ref)
			if (!snap.exists) throw new CryptoOrderError('CRYPTO_ORDER_NOT_FOUND', 'Payment order was not found.')
			const applied = applyTransfer(snap.data() || {}, transfer)
			if (!applied.idempotent) tx.set(ref, applied.order, { merge: true })
			return applied
		})
	}

	async function markCredited(orderId, creditedCredits) {
		const r = await refs()
		const ref = r.orders.doc(String(orderId))
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const snap = await tx.get(ref)
			if (!snap.exists) throw new CryptoOrderError('CRYPTO_ORDER_NOT_FOUND', 'Payment order was not found.')
			const order = snap.data() || {}
			const next = creditedOrder(order, creditedCredits)
			tx.set(ref, next, { merge: true })
			return next
		})
	}

	return {
		provider: 'firestore',
		shared: true,
		ensureAddressInventory,
		createOrder,
		getOrder,
		getOrderByAddress,
		listWatchOrders,
		listForwarderSweepOrders,
		recordTransfer,
		markCredited,
		publicOrder,
	}
}

export function createCryptoOrderStore(options = {}) {
	const provider = providerName()
	if (provider === 'firestore') return createFirestoreStore(options)
	if (provider === 'local') return createLocalStore()
	throw new CryptoOrderError('CRYPTO_ORDER_STORE_UNAVAILABLE', 'Crypto order storage is not configured for this deployment.')
}
