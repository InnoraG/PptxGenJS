import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import {
	meteredFirestoreGet,
	meteredFirestoreQueryGet,
	runMeteredFirestoreTransaction,
} from './firestore-meter.mjs'
import { hashPayload, hashStableId } from './ledger-store.mjs'
import { PRODUCT_ID } from './payment-product-registry.mjs'
import { tryMintPaymentEnvelope } from './payment-envelope.mjs'

export class PaymentIntentError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'PaymentIntentError'
		this.code = code
		this.details = details
	}
}

export const PAYMENT_INTENT_STATES = new Set([
	'created',
	'provider_pending',
	'awaiting_customer_completion',
	'open',
	'detected',
	'partial',
	'paid',
	'credited',
	'cancelled',
	'expired',
	'failed',
	'verification_pending',
])

export const PAYMENT_INTENT_PROVIDERS = new Set([
	'x402',
	'direct_usdc',
	'gasless_eip3009',
	'payram',
])

const SECRETISH_KEY_RE = /(?:^|_|-)(?:key|secret|token|authorization|password|passphrase|private|mnemonic|seed|signature|credential)(?:$|_|-)/i
const EMAIL_KEY_RE = /(?:^|_|-)(?:email|customeremail|useremail)(?:$|_|-)/i
const RAW_PROVIDER_PAYLOAD_KEYS = new Set(['raw', 'rawpayload', 'providerpayload', 'payloadraw'])
const SECRETISH_NORMALIZED_PARTS = ['apikey', 'secret', 'token', 'authorization', 'password', 'passphrase', 'privatekey', 'mnemonic', 'seed', 'signature', 'credential']
const OPEN_STATES = new Set(['created', 'provider_pending', 'awaiting_customer_completion', 'open', 'detected', 'partial', 'paid', 'verification_pending'])
const IDENTITY_FIELDS = ['productId', 'customerHash', 'purpose', 'provider', 'rail', 'quoteId', 'packId', 'requestedCredits', 'requestedAmountUsd', 'requestedAmountUsdc', 'minimumCreditableUsd']
const PURCHASE_METADATA = ['mode', 'promoRedemptionId', 'promoId', 'promoCodeDigest', 'originalAmountUsd', 'discountUsdc', 'finalAmountUsd']

function recordId(value) {
	if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{1,180}$/.test(value) || ['__proto__', 'prototype', 'constructor', '.', '..'].includes(value)) {
		throw new PaymentIntentError('PAYMENT_INTENT_ID_INVALID', 'Payment record id is invalid.')
	}
	return value
}

export function paymentIntentContinuation(intent) {
	const token = tryMintPaymentEnvelope({ installHash: intent.customerHash, packId: intent.packId, metadata: { intentId: intent.intentId } })
	const suffix = token ? `?token=${encodeURIComponent(token)}` : ''
	return {
		startUrl: `/pay/payram/intents/${encodeURIComponent(intent.intentId)}/start${suffix}`,
		statusUrl: `/pay/payram/intents/${encodeURIComponent(intent.intentId)}/status${suffix}`,
	}
}

function nowIso() {
	return new Date().toISOString()
}

function clone(value) {
	return value == null ? value : JSON.parse(JSON.stringify(value))
}

function enabled(name) {
	return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase())
}

function providerName() {
	return String(process.env.BETTERPPTX_PAYMENT_INTENT_STORE || process.env.BETTERPPTX_BILLING_LEDGER_STORE || 'local').trim().toLowerCase()
}

function requireSharedStores() {
	return enabled('BETTERPPTX_REQUIRE_SHARED_STORES')
}

function defaultIntentFile() {
	const configured = String(process.env.BETTERPPTX_PAYMENT_INTENT_FILE || '').trim()
	if (configured) return path.resolve(configured)
	const root = String(process.env.BETTERPPTX_OUT_DIR || process.env.BETTERPPTX_DOWNLOAD_ROOT || 'outputs').trim()
	return path.resolve(root, 'betterpptx-payment-intents.json')
}

function collectionPrefix() {
	const prefix = String(process.env.BETTERPPTX_FIRESTORE_BILLING_COLLECTION_PREFIX || process.env.BETTERPPTX_FIRESTORE_BILLING_PREFIX || 'betterpptx_billing').trim()
	if (!prefix || prefix.includes('..') || /[\\/]/.test(prefix)) {
		throw new PaymentIntentError('PAYMENT_INTENT_COLLECTION_PREFIX_INVALID', 'Invalid Firestore billing collection prefix.', { prefix })
	}
	return prefix
}

function stableSecretHash(value) {
	return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16)
}

export function hashPaymentEmail(value) {
	const email = String(value || '').trim().toLowerCase()
	if (!email) return null
	return hashStableId('email', email)
}

function sanitizeRecord(value) {
	if (value === undefined || value === null) return value
	if (Array.isArray(value)) return value.map(sanitizeRecord)
	if (typeof value !== 'object') return value
	const out = {}
	for (const [key, item] of Object.entries(value)) {
		const normalizedKey = String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase()
		if (EMAIL_KEY_RE.test(key) || normalizedKey === 'email' || normalizedKey === 'customeremail') {
			const hashed = hashPaymentEmail(item)
			if (hashed) out[`${key}Hash`] = hashed
			continue
		}
		if (SECRETISH_KEY_RE.test(key) || SECRETISH_NORMALIZED_PARTS.some(part => normalizedKey.includes(part)) || RAW_PROVIDER_PAYLOAD_KEYS.has(normalizedKey)) {
			if (item !== undefined && item !== null && String(item).trim()) out[`${key}Fingerprint`] = stableSecretHash(item)
			continue
		}
		out[key] = sanitizeRecord(item)
	}
	return out
}

function nonNegativeNumber(value, fallback = 0) {
	const n = Number(value)
	if (!Number.isFinite(n)) return fallback
	return Math.max(0, n)
}

function nonNegativeInt(value, fallback = 0) {
	return Math.floor(nonNegativeNumber(value, fallback))
}

function normalizeState(value, fallback = 'created') {
	const state = String(value || fallback).trim().toLowerCase()
	if (!PAYMENT_INTENT_STATES.has(state)) {
		throw new PaymentIntentError('PAYMENT_INTENT_STATE_INVALID', 'Payment intent state is not supported.', { state })
	}
	return state
}

function normalizeProvider(value) {
	const provider = String(value || '').trim().toLowerCase()
	if (!PAYMENT_INTENT_PROVIDERS.has(provider)) {
		throw new PaymentIntentError('PAYMENT_INTENT_PROVIDER_INVALID', 'Payment intent provider is not supported.', {
			provider,
			allowedProviders: Array.from(PAYMENT_INTENT_PROVIDERS),
		})
	}
	return provider
}

function normalizePurpose(value) {
	const purpose = String(value || '').trim().toLowerCase()
	if (purpose === 'credit_topup' || purpose === 'premium_quote') return purpose
	throw new PaymentIntentError('PAYMENT_INTENT_PURPOSE_INVALID', 'Payment intent purpose is not supported.', { purpose })
}

function emailHashFrom(input = {}) {
	return String(input.emailHash || '').trim()
		|| hashPaymentEmail(input.customerEmail || input.email || input.userEmail)
		|| null
}

function publicMetadata(input = {}) {
	const metadata = sanitizeRecord(input.metadata || {})
	const out = {}
	for (const [key, value] of Object.entries(metadata || {})) {
		if (value !== undefined) out[key] = value
	}
	return out
}

function normalizeIntent(input = {}, existing = null) {
	const now = nowIso()
	const intentId = recordId(input.intentId || existing?.intentId || `pi_${crypto.randomBytes(16).toString('hex')}`)
	if (!intentId) throw new PaymentIntentError('PAYMENT_INTENT_ID_MISSING', 'Missing payment intent id.', {})
	const provider = normalizeProvider(input.provider ?? existing?.provider)
	const purpose = normalizePurpose(input.purpose ?? existing?.purpose)
	const createdAt = existing?.createdAt || input.createdAt || now
	const state = existing?.state === 'credited' ? 'credited' : normalizeState(input.state || input.status || existing?.state || 'created')
	const requestedCredits = nonNegativeInt(input.requestedCredits ?? existing?.requestedCredits)
	const requestedAmountUsd = nonNegativeNumber(input.requestedAmountUsd ?? input.amountUsd ?? existing?.requestedAmountUsd)
	const requestedAmountUsdc = nonNegativeNumber(input.requestedAmountUsdc ?? input.amountUsdc ?? existing?.requestedAmountUsdc ?? requestedAmountUsd)
	const minimumCreditableUsd = nonNegativeNumber(input.minimumCreditableUsd ?? existing?.minimumCreditableUsd ?? requestedAmountUsd)
	const providerReferenceId = String(input.providerReferenceId ?? existing?.providerReferenceId ?? '').trim() || null
	const emailHash = emailHashFrom(input) || existing?.emailHash || null
	const installHash = String(input.installHash ?? existing?.installHash ?? '').trim()
	const customerHash = String(input.customerHash ?? existing?.customerHash ?? installHash ?? '').trim()
	if (!customerHash) throw new PaymentIntentError('PAYMENT_INTENT_CUSTOMER_MISSING', 'Payment intent customer hash is required.', { intentId })
	return {
		intentId,
		productId: String(input.productId ?? existing?.productId ?? PRODUCT_ID).trim() || PRODUCT_ID,
		installHash: installHash || null,
		customerHash,
		purpose,
		provider,
		rail: String(input.rail ?? existing?.rail ?? provider).trim() || provider,
		quoteId: String(input.quoteId ?? existing?.quoteId ?? '').trim() || null,
		packId: String(input.packId ?? existing?.packId ?? '').trim() || null,
		requestedCredits,
		requestedAmountUsd,
		requestedAmountUsdc,
		minimumCreditableUsd,
		providerReferenceId,
		providerStatus: String(input.providerStatus ?? existing?.providerStatus ?? '').trim() || null,
		providerFilledAmountUsd: nonNegativeNumber(input.providerFilledAmountUsd ?? existing?.providerFilledAmountUsd),
		providerNetReceivedUsd: nonNegativeNumber(input.providerNetReceivedUsd ?? existing?.providerNetReceivedUsd),
		providerFeeUsd: nonNegativeNumber(input.providerFeeUsd ?? existing?.providerFeeUsd),
		creditedCredits: nonNegativeInt(input.creditedCredits ?? existing?.creditedCredits),
		emailHash,
		state,
		status: state,
		metadata: publicMetadata({ metadata: { ...(existing?.metadata || {}), ...(input.metadata || {}) } }),
		createdAt,
		updatedAt: now,
	}
}

function sameIntentIdentity(existing = {}, normalized = {}) {
	return IDENTITY_FIELDS.every(field => String(existing[field] ?? (field === 'productId' ? PRODUCT_ID : '')) === String(normalized[field] ?? ''))
		&& PURCHASE_METADATA.every(field => String(existing.metadata?.[field] ?? '') === String(normalized.metadata?.[field] ?? ''))
}

function assertCreateIdentity(existing, normalized) {
	if (!sameIntentIdentity(existing, { ...normalized, metadata: { ...existing.metadata, ...normalized.metadata } })
		|| (normalized.providerReferenceId && existing.providerReferenceId !== normalized.providerReferenceId)) throw idempotencyConflict('intent', normalized.intentId)
}

function normalizeUpdate(existing, patch) {
	const normalized = normalizeIntent({ ...existing, ...sanitizeRecord(patch), intentId: existing.intentId }, existing)
	if (!sameIntentIdentity(existing, normalized)
		|| (existing.providerReferenceId && normalized.providerReferenceId !== existing.providerReferenceId)
		|| normalized.creditedCredits !== existing.creditedCredits) throw idempotencyConflict('intent', existing.intentId)
	return normalized
}

function openKey(input, normalized) {
	return input.reuseOpenKey ? hashPayload({ productId: normalized.productId, key: String(input.reuseOpenKey) }) : null
}

function idempotencyConflict(kind, id) {
	return new PaymentIntentError('PAYMENT_INTENT_IDEMPOTENCY_CONFLICT', `Payment ${kind} id was already used with different data.`, { id })
}

function normalizeProviderEvent(input = {}, intent = null) {
	const eventId = recordId(input.eventId || input.providerEventId || '')
	if (!eventId) throw new PaymentIntentError('PAYMENT_PROVIDER_EVENT_ID_MISSING', 'Missing payment provider event id.', {})
	const intentId = String(input.intentId || intent?.intentId || '').trim()
	if (!intentId) throw new PaymentIntentError('PAYMENT_PROVIDER_EVENT_INTENT_MISSING', 'Missing payment provider event intent id.', { eventId })
	const provider = normalizeProvider(input.provider || intent?.provider)
	const providerReferenceId = String(input.providerReferenceId || intent?.providerReferenceId || '').trim() || null
	if (intent && (provider !== intent.provider || providerReferenceId !== intent.providerReferenceId || intentId !== intent.intentId)) throw idempotencyConflict('provider event', eventId)
	const eventType = String(input.eventType || input.type || 'provider_event').trim().toLowerCase()
	const providerStatus = String(input.providerStatus || input.status || '').trim() || null
	const sanitizedPayload = sanitizeRecord(input.payload || input.providerPayload || {})
	const payloadHash = hashPayload(sanitizedPayload || {})
	const now = nowIso()
	return {
		eventId,
		intentId,
		provider,
		providerReferenceId,
		eventType,
		providerStatus,
		payloadHash,
		payload: sanitizedPayload && Object.keys(sanitizedPayload).length ? sanitizedPayload : {},
		receivedAt: input.receivedAt || now,
		updatedAt: now,
	}
}

function sameProviderEvent(existing = {}, normalized = {}) {
	return String(existing.intentId || '') === String(normalized.intentId || '') &&
		String(existing.provider || '') === String(normalized.provider || '') &&
		String(existing.providerReferenceId || '') === String(normalized.providerReferenceId || '') &&
		String(existing.eventType || '') === String(normalized.eventType || '') &&
		String(existing.providerStatus || '') === String(normalized.providerStatus || '') &&
		String(existing.payloadHash || '') === String(normalized.payloadHash || '')
}

function normalizeCreditEvent(input = {}, intent = null) {
	const intentId = String(input.intentId || intent?.intentId || '').trim()
	if (!intentId) throw new PaymentIntentError('PAYMENT_INTENT_ID_MISSING', 'Missing payment intent id.', {})
	const amountCredits = nonNegativeInt(input.amountCredits ?? input.credits ?? input.creditedCredits)
	if (amountCredits <= 0) throw new PaymentIntentError('PAYMENT_INTENT_CREDIT_AMOUNT_INVALID', 'Payment intent credit amount must be positive.', { intentId })
	if (!Number.isSafeInteger(Number(input.amountCredits ?? input.credits ?? input.creditedCredits))) throw new PaymentIntentError('PAYMENT_INTENT_CREDIT_AMOUNT_INVALID', 'Payment intent credits must be a positive integer.')
	const proof = sanitizeRecord(input.proofRef || {
		provider: input.provider || intent?.provider || null,
		providerReferenceId: input.providerReferenceId || intent?.providerReferenceId || null,
		providerEventId: input.providerEventId || input.eventId || null,
	})
	const eventId = recordId(input.creditEventId || `pi_credit_${hashPayload({ intentId, amountCredits, proof }).slice(0, 32)}`)
	if (intent && ((input.customerHash && input.customerHash !== intent.customerHash)
		|| (proof.provider && proof.provider !== intent.provider)
		|| ((proof.referenceId || proof.providerReferenceId) && (proof.referenceId || proof.providerReferenceId) !== intent.providerReferenceId))) throw idempotencyConflict('credit event', eventId)
	const now = nowIso()
	return {
		eventId,
		intentId,
		customerHash: String(input.customerHash || intent?.customerHash || '').trim() || null,
		amountCredits,
		proofRef: proof,
		proofHash: hashPayload(proof),
		createdAt: input.createdAt || now,
		updatedAt: now,
	}
}

function sameCreditEvent(existing = {}, normalized = {}) {
	return String(existing.intentId || '') === String(normalized.intentId || '') &&
		String(existing.customerHash || '') === String(normalized.customerHash || '') &&
		String(existing.proofHash || '') === String(normalized.proofHash || '') &&
		Number(existing.amountCredits || 0) === Number(normalized.amountCredits || 0)
}

function emptyStore() {
	return {
		version: 1,
		intents: {},
		providerEvents: {},
		creditEvents: {},
		providerRefs: {},
		openKeys: {},
	}
}

function normalizeStore(store = {}) {
	return {
		...emptyStore(),
		...store,
		intents: store.intents && typeof store.intents === 'object' ? store.intents : {},
		providerEvents: store.providerEvents && typeof store.providerEvents === 'object' ? store.providerEvents : {},
		creditEvents: store.creditEvents && typeof store.creditEvents === 'object' ? store.creditEvents : {},
		providerRefs: store.providerRefs && typeof store.providerRefs === 'object' ? store.providerRefs : {},
		openKeys: store.openKeys && typeof store.openKeys === 'object' ? store.openKeys : {},
	}
}

function providerRefKey(provider, providerReferenceId) {
	const ref = String(providerReferenceId || '').trim()
	if (!ref) return null
	return `${String(provider || '').trim().toLowerCase()}:${encodeURIComponent(ref)}`
}

function publicIntent(intent = {}) {
	if (!intent) return null
	return {
		intentId: intent.intentId,
		productId: intent.productId || PRODUCT_ID,
		customerHash: intent.customerHash,
		purpose: intent.purpose,
		provider: intent.provider,
		rail: intent.rail,
		quoteId: intent.quoteId || null,
		packId: intent.packId || null,
		requestedCredits: Number(intent.requestedCredits || 0),
		requestedAmountUsd: Number(intent.requestedAmountUsd || 0),
		requestedAmountUsdc: Number(intent.requestedAmountUsdc || 0),
		minimumCreditableUsd: Number(intent.minimumCreditableUsd || 0),
		providerReferenceId: intent.providerReferenceId || null,
		providerStatus: intent.providerStatus || null,
		providerFilledAmountUsd: Number(intent.providerFilledAmountUsd || 0),
		providerNetReceivedUsd: Number(intent.providerNetReceivedUsd || 0),
		providerFeeUsd: Number(intent.providerFeeUsd || 0),
		creditedCredits: Number(intent.creditedCredits || 0),
		emailHash: intent.emailHash || null,
		state: intent.state,
		status: intent.status || intent.state,
		metadata: sanitizeRecord(intent.metadata || {}),
		createdAt: intent.createdAt,
		updatedAt: intent.updatedAt,
	}
}

function createLocalPaymentIntentStore() {
	if (requireSharedStores()) {
		throw new PaymentIntentError('PAYMENT_INTENT_STORE_NOT_SHARED', 'Payment intent storage is not configured for this deployment.')
	}
	const file = defaultIntentFile()
	let lock = Promise.resolve()

	function load() {
		try {
			if (fs.existsSync(file)) {
				const data = JSON.parse(fs.readFileSync(file, 'utf8'))
				if (!data || data.version !== 1 || !data.intents || !data.providerRefs || !data.creditEvents || !data.providerEvents) throw new Error('Invalid store')
				return normalizeStore(data)
			}
		} catch { throw new PaymentIntentError('PAYMENT_INTENT_STORE_CORRUPT', 'Payment intent storage could not be read safely.') }
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

	async function createIntent(input = {}) {
		return withLock(() => {
			const store = load()
			const normalized = normalizeIntent(input)
			const existing = store.intents[normalized.intentId]
			if (existing) {
				assertCreateIdentity(existing, normalized)
				return { intent: publicIntent(existing), idempotent: true }
			}
			const refKey = providerRefKey(normalized.provider, normalized.providerReferenceId)
			if (refKey && store.providerRefs[refKey]) {
				const byRef = store.intents[store.providerRefs[refKey].intentId]
				if (byRef) throw idempotencyConflict('provider reference', normalized.intentId)
			}
			const key = openKey(input, normalized)
			const active = key ? store.intents[store.openKeys[key]?.intentId] : null
			if (active && OPEN_STATES.has(active.state)) {
				assertCreateIdentity(active, normalized)
				// A different explicit request id must not be silently treated as
				// bound to this checkout, then create a new one on a later replay.
				if (input.intentId && active.intentId !== normalized.intentId) throw idempotencyConflict('open checkout', normalized.intentId)
				return { intent: publicIntent(active), idempotent: true }
			}
			store.intents[normalized.intentId] = normalized
			if (key) store.openKeys[key] = { intentId: normalized.intentId }
			if (refKey) store.providerRefs[refKey] = { provider: normalized.provider, providerReferenceId: normalized.providerReferenceId, intentId: normalized.intentId, createdAt: nowIso() }
			save(store)
			return { intent: publicIntent(normalized), idempotent: false }
		})
	}

	async function getIntent(intentId) {
		return publicIntent(load().intents[recordId(intentId)] || null)
	}

	async function getIntentByProviderReference(provider, providerReferenceId) {
		const store = load()
		const ref = store.providerRefs[providerRefKey(provider, providerReferenceId)]
		return ref ? publicIntent(store.intents[ref.intentId] || null) : null
	}

	async function updateIntent(intentId, patch = {}) {
		return withLock(() => {
			const store = load()
			const existing = store.intents[recordId(intentId)]
			if (!existing) throw new PaymentIntentError('PAYMENT_INTENT_NOT_FOUND', 'Payment intent was not found.', { intentId })
			const normalized = normalizeUpdate(existing, patch)
			const oldRefKey = providerRefKey(existing.provider, existing.providerReferenceId)
			const newRefKey = providerRefKey(normalized.provider, normalized.providerReferenceId)
			if (newRefKey && store.providerRefs[newRefKey] && store.providerRefs[newRefKey].intentId !== existing.intentId) throw idempotencyConflict('provider reference', existing.intentId)
			store.intents[normalized.intentId] = normalized
			if (oldRefKey && oldRefKey !== newRefKey) delete store.providerRefs[oldRefKey]
			if (newRefKey) store.providerRefs[newRefKey] = { provider: normalized.provider, providerReferenceId: normalized.providerReferenceId, intentId: normalized.intentId, createdAt: store.providerRefs[newRefKey]?.createdAt || nowIso(), updatedAt: nowIso() }
			save(store)
			return publicIntent(normalized)
		})
	}

	async function recordProviderEvent(input = {}) {
		return withLock(() => {
			const store = load()
			const intent = store.intents[String(input.intentId || '')]
			if (!intent) throw new PaymentIntentError('PAYMENT_INTENT_NOT_FOUND', 'Payment intent was not found.', { intentId: input.intentId })
			const event = normalizeProviderEvent(input, intent)
			const existing = store.providerEvents[event.eventId]
			if (existing) {
				if (!sameProviderEvent(existing, event)) throw idempotencyConflict('provider event', event.eventId)
				return { event: clone(existing), intent: publicIntent(intent), idempotent: true }
			}
			store.providerEvents[event.eventId] = event
			let nextIntent = intent
			if (event.providerStatus || input.state || input.status) {
				nextIntent = normalizeIntent({
					...intent,
					providerStatus: event.providerStatus || intent.providerStatus,
					state: input.state || input.intentState || intent.state,
				}, intent)
				store.intents[intent.intentId] = nextIntent
			}
			save(store)
			return { event: clone(event), intent: publicIntent(nextIntent), idempotent: false }
		})
	}

	async function creditIntent(input = {}) {
		return withLock(() => {
			const store = load()
			const intent = store.intents[String(input.intentId || '')]
			if (!intent) throw new PaymentIntentError('PAYMENT_INTENT_NOT_FOUND', 'Payment intent was not found.', { intentId: input.intentId })
			const creditEvent = normalizeCreditEvent(input, intent)
			const existing = store.creditEvents[creditEvent.eventId]
			if (existing) {
				if (!sameCreditEvent(existing, creditEvent)) throw idempotencyConflict('credit event', creditEvent.eventId)
				return { creditEvent: clone(existing), intent: publicIntent(intent), idempotent: true }
			}
			const creditedCredits = Number(intent.creditedCredits || 0) + creditEvent.amountCredits
			if (creditedCredits > intent.requestedCredits) throw new PaymentIntentError('PAYMENT_INTENT_OVERCREDIT', 'Payment intent credit limit would be exceeded.')
			const state = creditedCredits >= Number(intent.requestedCredits || 0) && Number(intent.requestedCredits || 0) > 0 ? 'credited' : 'partial'
			const nextIntent = normalizeIntent({
				...intent,
				creditedCredits,
				state,
			}, intent)
			store.creditEvents[creditEvent.eventId] = creditEvent
			store.intents[intent.intentId] = nextIntent
			save(store)
			return { creditEvent: clone(creditEvent), intent: publicIntent(nextIntent), idempotent: false }
		})
	}

	async function listOpenIntents({ limit = 50 } = {}) {
		const openStates = new Set(['created', 'provider_pending', 'awaiting_customer_completion', 'open', 'detected', 'partial', 'paid', 'verification_pending'])
		return Object.values(load().intents)
			.filter(intent => openStates.has(intent.state))
			.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
			.slice(0, Math.max(1, Math.min(500, Number(limit) || 50)))
			.map(publicIntent)
	}

	return {
		provider: 'local',
		shared: false,
		createIntent,
		getIntent,
		getIntentByProviderReference,
		getCreditEvent: async eventId => clone(load().creditEvents[recordId(eventId)] || null),
		updateIntent,
		recordProviderEvent,
		creditIntent,
		listOpenIntents,
		publicIntent,
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

function createFirestorePaymentIntentStore({ firestoreDb = null } = {}) {
	const prefix = collectionPrefix()

	async function refs() {
		const db = firestoreDb || await firestore()
		return {
			db,
			intents: db.collection(`${prefix}_payment_intents`),
			providerEvents: db.collection(`${prefix}_payment_intent_events`),
			creditEvents: db.collection(`${prefix}_payment_intent_credit_events`),
			providerRefs: db.collection(`${prefix}_payment_intent_provider_refs`),
			openKeys: db.collection(`${prefix}_payment_intent_open_keys`),
		}
	}

	async function createIntent(input = {}) {
		const normalized = normalizeIntent(input)
		const r = await refs()
		const intentRef = r.intents.doc(normalized.intentId)
		const refKey = providerRefKey(normalized.provider, normalized.providerReferenceId)
		const key = openKey(input, normalized)
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const reads = [tx.get(intentRef)]
			const providerRef = refKey ? r.providerRefs.doc(refKey) : null
			const activeRef = key ? r.openKeys.doc(key) : null
			reads.push(providerRef ? tx.get(providerRef) : null, activeRef ? tx.get(activeRef) : null)
			const [intentSnap, providerRefSnap, activeSnap] = await Promise.all(reads)
			if (intentSnap.exists) {
				const existing = intentSnap.data() || {}
				assertCreateIdentity(existing, normalized)
				return { intent: publicIntent(existing), idempotent: true }
			}
			if (providerRef && providerRefSnap?.exists) {
				throw idempotencyConflict('provider reference', normalized.intentId)
			}
			if (activeSnap?.exists) {
				const active = await tx.get(r.intents.doc(recordId(activeSnap.data().intentId)))
				if (active.exists && OPEN_STATES.has(active.data().state)) {
					assertCreateIdentity(active.data(), normalized)
					if (input.intentId && active.data().intentId !== normalized.intentId) throw idempotencyConflict('open checkout', normalized.intentId)
					return { intent: publicIntent(active.data()), idempotent: true }
				}
			}
			tx.create(intentRef, normalized)
			if (activeRef) tx.set(activeRef, { intentId: normalized.intentId })
			if (providerRef) tx.create(providerRef, { provider: normalized.provider, providerReferenceId: normalized.providerReferenceId, intentId: normalized.intentId, createdAt: nowIso() })
			return { intent: publicIntent(normalized), idempotent: false }
		})
	}

	async function getIntent(intentId) {
		const snap = await meteredFirestoreGet((await refs()).intents.doc(recordId(intentId)))
		return snap.exists ? publicIntent(snap.data() || {}) : null
	}

	async function getIntentByProviderReference(provider, providerReferenceId) {
		const key = providerRefKey(provider, providerReferenceId)
		if (!key) return null
		const r = await refs()
		const refSnap = await meteredFirestoreGet(r.providerRefs.doc(key))
		if (!refSnap.exists) return null
		return getIntent(refSnap.data()?.intentId)
	}

	async function updateIntent(intentId, patch = {}) {
		const r = await refs()
		const ref = r.intents.doc(recordId(intentId))
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const snap = await tx.get(ref)
			if (!snap.exists) throw new PaymentIntentError('PAYMENT_INTENT_NOT_FOUND', 'Payment intent was not found.', { intentId })
			const existing = snap.data() || {}
			const normalized = normalizeUpdate(existing, patch)
			const oldRefKey = providerRefKey(existing.provider, existing.providerReferenceId)
			const newRefKey = providerRefKey(normalized.provider, normalized.providerReferenceId)
			const newRef = newRefKey ? r.providerRefs.doc(newRefKey) : null
			const binding = newRef ? await tx.get(newRef) : null
			if (binding?.exists && binding.data().intentId !== existing.intentId) throw idempotencyConflict('provider reference', existing.intentId)
			tx.set(ref, normalized, { merge: true })
			if (oldRefKey && oldRefKey !== newRefKey) tx.delete(r.providerRefs.doc(oldRefKey))
			if (newRef) tx.set(newRef, { provider: normalized.provider, providerReferenceId: normalized.providerReferenceId, intentId: normalized.intentId, updatedAt: nowIso(), createdAt: binding?.data()?.createdAt || nowIso() }, { merge: true })
			return publicIntent(normalized)
		})
	}

	async function recordProviderEvent(input = {}) {
		const r = await refs()
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const intentRef = r.intents.doc(recordId(input.intentId || ''))
			const [intentSnap, eventSnap] = await Promise.all([tx.get(intentRef), tx.get(r.providerEvents.doc(recordId(input.eventId || input.providerEventId || '')))])
			if (!intentSnap.exists) throw new PaymentIntentError('PAYMENT_INTENT_NOT_FOUND', 'Payment intent was not found.', { intentId: input.intentId })
			const intent = intentSnap.data() || {}
			const event = normalizeProviderEvent(input, intent)
			if (eventSnap.exists) {
				const existing = eventSnap.data() || {}
				if (!sameProviderEvent(existing, event)) throw idempotencyConflict('provider event', event.eventId)
				return { event: existing, intent: publicIntent(intent), idempotent: true }
			}
			tx.create(r.providerEvents.doc(event.eventId), event)
			let nextIntent = intent
			if (event.providerStatus || input.state || input.status) {
				nextIntent = normalizeIntent({ ...intent, providerStatus: event.providerStatus || intent.providerStatus, state: input.state || input.intentState || intent.state }, intent)
				tx.set(intentRef, nextIntent, { merge: true })
			}
			return { event, intent: publicIntent(nextIntent), idempotent: false }
		})
	}

	async function creditIntent(input = {}) {
		const r = await refs()
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const intentRef = r.intents.doc(recordId(input.intentId || ''))
			const intentSnap = await tx.get(intentRef)
			if (!intentSnap.exists) throw new PaymentIntentError('PAYMENT_INTENT_NOT_FOUND', 'Payment intent was not found.', { intentId: input.intentId })
			const intent = intentSnap.data() || {}
			const creditEvent = normalizeCreditEvent(input, intent)
			const eventRef = r.creditEvents.doc(creditEvent.eventId)
			const eventSnap = await tx.get(eventRef)
			if (eventSnap.exists) {
				const existing = eventSnap.data() || {}
				if (!sameCreditEvent(existing, creditEvent)) throw idempotencyConflict('credit event', creditEvent.eventId)
				return { creditEvent: existing, intent: publicIntent(intent), idempotent: true }
			}
			const creditedCredits = Number(intent.creditedCredits || 0) + creditEvent.amountCredits
			if (creditedCredits > intent.requestedCredits) throw new PaymentIntentError('PAYMENT_INTENT_OVERCREDIT', 'Payment intent credit limit would be exceeded.')
			const state = creditedCredits >= Number(intent.requestedCredits || 0) && Number(intent.requestedCredits || 0) > 0 ? 'credited' : 'partial'
			const nextIntent = normalizeIntent({ ...intent, creditedCredits, state }, intent)
			tx.create(eventRef, creditEvent)
			tx.set(intentRef, nextIntent, { merge: true })
			return { creditEvent, intent: publicIntent(nextIntent), idempotent: false }
		})
	}

	async function listOpenIntents({ limit = 50 } = {}) {
		const openStates = ['created', 'provider_pending', 'awaiting_customer_completion', 'open', 'detected', 'partial', 'paid', 'verification_pending']
		const snap = await meteredFirestoreQueryGet((await refs()).intents.where('state', 'in', openStates.slice(0, 10)).limit(Math.max(1, Math.min(500, Number(limit) || 50))))
		return snap.docs.map(doc => publicIntent(doc.data() || {}))
	}

	return {
		provider: 'firestore',
		shared: true,
		createIntent,
		getIntent,
		getIntentByProviderReference,
		getCreditEvent: async eventId => {
			const snap = await meteredFirestoreGet((await refs()).creditEvents.doc(recordId(eventId)))
			return snap.exists ? snap.data() : null
		},
		updateIntent,
		recordProviderEvent,
		creditIntent,
		listOpenIntents,
		publicIntent,
	}
}

export function createPaymentIntentStore(options = {}) {
	const provider = providerName()
	if (provider === 'local') return createLocalPaymentIntentStore()
	if (provider === 'firestore') return createFirestorePaymentIntentStore(options)
	throw new PaymentIntentError('PAYMENT_INTENT_STORE_UNAVAILABLE', 'Payment intent storage is not configured for this deployment.', { provider })
}
