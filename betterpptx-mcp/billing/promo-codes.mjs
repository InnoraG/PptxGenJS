import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { configuredCryptoPacks } from './crypto-packs.mjs'
import { createBillingLedgerStore, hashPayload, hashStableId } from './ledger-store.mjs'
import { createPaymentIntentStore, paymentIntentContinuation } from './payment-intents.mjs'
import { createPayramPayment, payramReadiness, PayRamClientError, validatePayramPaymentInput, validatePayramPaymentUrl } from './payram-client.mjs'
import { PRODUCT_ID, productCustomerId } from './payment-product-registry.mjs'
import { assertProductionBillingConfiguration, isProductionBillingEnvironment } from './security-policy.mjs'
import {
	meteredFirestoreGet,
	runMeteredFirestoreTransaction,
} from './firestore-meter.mjs'

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on'])
const PROMO_CONFIG_ENV = 'BETTERPPTX_PROMO_CODES_JSON'

export class PromoCodeError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'PromoCodeError'
		this.code = code
		this.details = details
	}
}

function enabled(name, env = process.env) {
	return ENABLED_VALUES.has(String(env[name] || '').trim().toLowerCase())
}

function nowIso() {
	return new Date().toISOString()
}

function clone(value) {
	if (value === undefined || value === null) return value
	return JSON.parse(JSON.stringify(value))
}

function normalizeCode(value) {
	const code = String(value || '').trim().toUpperCase()
	if (!code || code.length > 128 || !/^[A-Z0-9][A-Z0-9._-]{2,127}$/.test(code)) {
		throw new PromoCodeError('PROMO_CODE_INVALID', 'Promo code format is invalid.')
	}
	return code
}

function codeDigest(code) {
	return hashPayload({ kind: 'betterpptx-promo-code-v1', code: normalizeCode(code) })
}

function safeId(value) {
	const text = String(value || '').trim()
	if (!text || !/^[A-Za-z0-9._:-]{1,180}$/.test(text) || ['__proto__', 'constructor', 'prototype', '.', '..'].includes(text)) throw new PromoCodeError('PROMO_REDEMPTION_CONFLICT', 'Promo record identity is invalid.')
	return text
}

function productionScopeRequired(env) {
	return isProductionBillingEnvironment(env) || !['test', 'development'].includes(String(env.NODE_ENV || '').toLowerCase())
		|| requireSharedStores(env) || enabled('BETTERPPTX_PUBLIC_BLACK_BOX', env)
}

function assertIssuanceScope(definition, env) {
	// An installation id and a self-reported email are not verified accounts.
	// Production issuance requires an owner-configured finite audience and cap.
	if (productionScopeRequired(env) && (!definition.customerHashes?.length || definition.maxRedemptions === null)) {
		throw new PromoCodeError('PROMO_ISSUANCE_SCOPE_REQUIRED', 'This promotion requires explicitly scoped issuance before redemption.')
	}
}

function count(value, fallback, minimum = 1) {
	if (value === undefined || value === null) return fallback
	const n = Number(value)
	if (!Number.isSafeInteger(n) || n < minimum) throw new PromoCodeError('PROMO_CONFIG_INVALID', 'Promo limits and credit amounts must be valid whole numbers.')
	return n
}

function configText(env = process.env) {
	return String(env[PROMO_CONFIG_ENV] || '').trim()
}

function parsePromoDefinitions(env = process.env) {
	const raw = configText(env)
	if (!raw) return []
	let parsed
	try {
		parsed = JSON.parse(raw)
	} catch {
		throw new PromoCodeError('PROMO_CONFIG_INVALID', 'The configured promo-code registry is invalid JSON.')
	}
	const rows = Array.isArray(parsed) ? parsed : parsed?.codes
	if (!Array.isArray(rows)) throw new PromoCodeError('PROMO_CONFIG_INVALID', 'The configured promo-code registry must be an array.')
	const definitions = rows.map((row, index) => normalizePromoDefinition(row, index))
	const seenCodes = new Set()
	const seenIds = new Set()
	for (const definition of definitions) {
		if (seenCodes.has(definition.code) || seenIds.has(definition.promoId)) {
			throw new PromoCodeError('PROMO_CONFIG_INVALID', 'Promo codes and ids must be unique.')
		}
		seenCodes.add(definition.code)
		seenIds.add(definition.promoId)
	}
	return definitions
}

function normalizePromoDefinition(row, index) {
	if (!row || typeof row !== 'object' || Array.isArray(row)) {
		throw new PromoCodeError('PROMO_CONFIG_INVALID', `Promo definition ${index + 1} is not an object.`)
	}
	const code = normalizeCode(row.code)
	const promoId = String(row.id || `promo_${code.toLowerCase()}`).trim()
	if (!/^[A-Za-z0-9._-]{1,96}$/.test(promoId)) {
		throw new PromoCodeError('PROMO_CONFIG_INVALID', `Promo definition ${index + 1} has an invalid id.`)
	}
	const packId = row.packId ? String(row.packId).trim() : ''
	const allowedPackIds = Array.isArray(row.packIds)
		? row.packIds.map(value => String(value || '').trim()).filter(Boolean)
		: (packId ? [packId] : configuredCryptoPacks().map(pack => pack.id))
	if (!allowedPackIds.length) throw new PromoCodeError('PROMO_CONFIG_INVALID', `Promo ${promoId} has no eligible credit pack.`)
	const percentOff = row.percentOff ?? row.discountPercent ?? null
	const fixedDiscountUsdc = row.fixedDiscountUsdc ?? row.discountUsdc ?? null
	const freePack = row.free === true || row.freePack === true || Number(percentOff) >= 100
	const parsedPercent = percentOff === null || percentOff === undefined ? null : Number(percentOff)
	const parsedFixed = fixedDiscountUsdc === null || fixedDiscountUsdc === undefined ? null : Number(fixedDiscountUsdc)
	if (!freePack && parsedPercent === null && parsedFixed === null) {
		throw new PromoCodeError('PROMO_CONFIG_INVALID', `Promo ${promoId} must define percentOff, fixedDiscountUsdc, or free:true.`)
	}
	if (parsedPercent !== null && (!Number.isFinite(parsedPercent) || parsedPercent < 0 || parsedPercent > 100)) {
		throw new PromoCodeError('PROMO_CONFIG_INVALID', `Promo ${promoId} has an invalid percentOff.`)
	}
	if (parsedFixed !== null && (!Number.isFinite(parsedFixed) || parsedFixed < 0)) {
		throw new PromoCodeError('PROMO_CONFIG_INVALID', `Promo ${promoId} has an invalid fixedDiscountUsdc.`)
	}
	const maxRedemptions = count(row.maxRedemptions, null)
	const maxPerCustomer = count(row.maxPerCustomer, 1)
	for (const key of ['startsAt', 'expiresAt']) {
		if (row[key] != null && (typeof row[key] !== 'string' || !Number.isFinite(Date.parse(row[key])))) throw new PromoCodeError('PROMO_CONFIG_INVALID', 'Promo dates must be valid timestamps.')
	}
	if (row.startsAt && row.expiresAt && Date.parse(row.startsAt) >= Date.parse(row.expiresAt)) throw new PromoCodeError('PROMO_CONFIG_INVALID', 'Promo date range is invalid.')
	if (row.customerHashes !== undefined && (!Array.isArray(row.customerHashes) || row.customerHashes.some(value => typeof value !== 'string' || !value.trim() || value.length > 180))) throw new PromoCodeError('PROMO_CONFIG_INVALID', 'Promo issuance audience is invalid.')
	return Object.freeze({
		promoId,
		code,
		codeDigest: codeDigest(code),
		allowedPackIds: Object.freeze([...new Set(allowedPackIds)]),
		percentOff: freePack ? 100 : parsedPercent,
		fixedDiscountUsdc: freePack ? null : parsedFixed,
		freePack,
		bonusCredits: count(row.bonusCredits, 0, 0),
		customerHashes: Object.freeze([...new Set((row.customerHashes || []).map(value => value.trim()))]),
		maxRedemptions,
		maxPerCustomer,
		startsAt: row.startsAt ? String(row.startsAt) : null,
		expiresAt: row.expiresAt ? String(row.expiresAt) : null,
		label: String(row.label || row.description || '').trim().slice(0, 200),
	})
}

function definitionForCode(code, env = process.env) {
	const normalized = normalizeCode(code)
	const definitions = parsePromoDefinitions(env)
	const definition = definitions.find(item => item.code === normalized)
	if (!definition) throw new PromoCodeError('PROMO_CODE_NOT_FOUND', 'Promo code was not recognized.')
	const now = Date.now()
	if (definition.startsAt && Number.isFinite(Date.parse(definition.startsAt)) && now < Date.parse(definition.startsAt)) {
		throw new PromoCodeError('PROMO_CODE_NOT_ACTIVE', 'Promo code is not active yet.')
	}
	if (definition.expiresAt && Number.isFinite(Date.parse(definition.expiresAt)) && now >= Date.parse(definition.expiresAt)) {
		throw new PromoCodeError('PROMO_CODE_EXPIRED', 'Promo code has expired.')
	}
	return definition
}

function packForId(packId) {
	const pack = configuredCryptoPacks().find(item => item.id === String(packId || '').trim())
	if (!pack) throw new PromoCodeError('CRYPTO_PACK_NOT_FOUND', 'Credit pack was not found.')
	return pack
}

export function promoReadiness({ env = process.env } = {}) {
	try {
		const definitions = parsePromoDefinitions(env)
		for (const definition of definitions) assertIssuanceScope(definition, env)
		return {
			enabled: definitions.length > 0,
			configured: true,
			configuredCodeCount: definitions.length,
			provider: String(env.BETTERPPTX_BILLING_LEDGER_STORE || 'local').trim().toLowerCase(),
			redemptionState: 'server-side-bound-and-idempotent',
			identityAssurance: 'installation-only',
			issuancePolicy: productionScopeRequired(env) ? 'explicit-customer-scope-and-total-cap' : 'local-fixture-promotions',
			payramHostedCouponField: 'not-assumed',
			missing: [],
		}
	} catch (error) {
		return {
			enabled: false,
			configured: false,
			configuredCodeCount: 0,
			provider: String(env.BETTERPPTX_BILLING_LEDGER_STORE || 'local').trim().toLowerCase(),
			redemptionState: 'unavailable',
			payramHostedCouponField: 'not-assumed',
			missing: ['BETTERPPTX_PROMO_CODES_JSON'],
			error: error?.code || 'PROMO_CONFIG_INVALID',
		}
	}
}

export function evaluatePromoCode({ code, packId, customerHash, idempotencyKey = '', env = process.env } = {}) {
	const definition = definitionForCode(code, env)
	assertIssuanceScope(definition, env)
	const pack = packForId(packId)
	if (!definition.allowedPackIds.includes(pack.id)) {
		throw new PromoCodeError('PROMO_CODE_NOT_ELIGIBLE', 'Promo code is not valid for this credit pack.')
	}
	const customer = String(customerHash || '').trim()
	if (!customer) throw new PromoCodeError('PROMO_CUSTOMER_REQUIRED', 'A device-bound billing identity is required to redeem a promo code.')
	if (definition.customerHashes.length && !definition.customerHashes.includes(customer)) throw new PromoCodeError('PROMO_CODE_NOT_ELIGIBLE', 'Promo code was not issued for this billing identity.')
	let finalAmountUsd = Number(pack.priceUsdc)
	if (definition.freePack) finalAmountUsd = 0
	else if (definition.percentOff !== null) finalAmountUsd = finalAmountUsd * (1 - definition.percentOff / 100)
	else if (definition.fixedDiscountUsdc !== null) finalAmountUsd = finalAmountUsd - definition.fixedDiscountUsdc
	finalAmountUsd = Number(Math.max(0, finalAmountUsd).toFixed(6))
	const discountUsdc = Number(Math.max(0, pack.priceUsdc - finalAmountUsd).toFixed(6))
	const credits = Number(pack.credits) + definition.bonusCredits
	if (!Number.isSafeInteger(credits) || credits <= 0) throw new PromoCodeError('PROMO_CONFIG_INVALID', 'Promo credit amount is invalid.')
	const requestKey = String(idempotencyKey || '').trim()
	return {
		promoId: definition.promoId,
		codeDigest: definition.codeDigest,
		packId: pack.id,
		requestedCredits: credits,
		basePackCredits: pack.credits,
		bonusCredits: definition.bonusCredits,
		originalAmountUsd: Number(pack.priceUsdc),
		discountUsdc,
		finalAmountUsd,
		currency: 'USD',
		paymentRail: finalAmountUsd > 0 ? 'payram' : 'promo_credit_grant',
		maxRedemptions: definition.maxRedemptions,
		maxPerCustomer: definition.maxPerCustomer,
		expiresAt: definition.expiresAt,
		label: definition.label || null,
		// The raw code is deliberately absent from the returned decision.
		...(requestKey ? { requestKeyDigest: hashPayload({ requestKey }) } : {}),
	}
}

function providerName(env = process.env) {
	return String(env.BETTERPPTX_BILLING_LEDGER_STORE || 'local').trim().toLowerCase()
}

function requireSharedStores(env = process.env) {
	return enabled('BETTERPPTX_REQUIRE_SHARED_STORES', env)
}

function defaultPromoStorePath(env = process.env) {
	const explicit = String(env.BETTERPPTX_PROMO_STORE_FILE || '').trim()
	if (explicit) return path.resolve(explicit)
	const ledger = String(env.BETTERPPTX_BILLING_LEDGER_FILE || '').trim()
	if (ledger) return path.join(path.dirname(path.resolve(ledger)), 'betterpptx-promo-redemptions.json')
	const root = String(env.BETTERPPTX_OUT_DIR || env.BETTERPPTX_DOWNLOAD_ROOT || 'outputs').trim()
	return path.resolve(root, 'betterpptx-promo-redemptions.json')
}

function redemptionIdentityMatches(existing, input) {
	return ['promoId', 'customerHash', 'packId', 'codeDigest', 'intentId', 'requestedCredits', 'originalAmountUsd', 'discountUsdc', 'finalAmountUsd', 'requestKeyDigest']
		.every(key => String(existing[key] ?? '') === String(input[key] ?? ''))
}

function completedRecord(existing, patch) {
	if (existing.state === 'released') throw new PromoCodeError('PROMO_REDEMPTION_RELEASED', 'This promo reservation has been released.')
	if ((patch.intentId && existing.intentId && patch.intentId !== existing.intentId)
		|| (patch.creditEventId && existing.creditEventId && patch.creditEventId !== existing.creditEventId)) throw new PromoCodeError('PROMO_REDEMPTION_CONFLICT', 'Promo completion is bound to different purchase details.')
	return { ...existing, intentId: existing.intentId || patch.intentId || null, creditEventId: existing.creditEventId || patch.creditEventId || null, state: 'completed', completedAt: existing.completedAt || nowIso(), updatedAt: nowIso() }
}

function redemptionRecord(input, state = 'reserved') {
	const now = nowIso()
	return {
		redemptionId: String(input.redemptionId),
		promoId: String(input.promoId),
		codeDigest: String(input.codeDigest),
		customerHash: String(input.customerHash),
		packId: String(input.packId),
		requestedCredits: Number(input.requestedCredits || 0),
		originalAmountUsd: Number(input.originalAmountUsd || 0),
		discountUsdc: Number(input.discountUsdc || 0),
		finalAmountUsd: Number(input.finalAmountUsd || 0),
		maxRedemptions: input.maxRedemptions === null || input.maxRedemptions === undefined ? null : Number(input.maxRedemptions),
		maxPerCustomer: Math.max(1, Number(input.maxPerCustomer || 1)),
		requestKeyDigest: input.requestKeyDigest || null,
		intentId: input.intentId || null,
		state,
		createdAt: input.createdAt || now,
		updatedAt: now,
		reservedAt: state === 'reserved' ? now : null,
		completedAt: state === 'completed' ? now : null,
	}
}

function publicPromoRedemption(record = {}) {
	return {
		redemptionId: record.redemptionId || null,
		promoId: record.promoId || null,
		codeDigest: record.codeDigest || null,
		packId: record.packId || null,
		requestedCredits: Number(record.requestedCredits || 0),
		originalAmountUsd: Number(record.originalAmountUsd || 0),
		discountUsdc: Number(record.discountUsdc || 0),
		finalAmountUsd: Number(record.finalAmountUsd || 0),
		paymentRail: Number(record.finalAmountUsd || 0) > 0 ? 'payram' : 'promo_credit_grant',
		state: record.state || 'unknown',
		intentId: record.intentId || null,
		createdAt: record.createdAt || null,
		updatedAt: record.updatedAt || null,
		completedAt: record.completedAt || null,
	}
}

function localStore(env) {
	const file = defaultPromoStorePath(env)
	let lock = Promise.resolve()
	function load() {
		try {
			if (fs.existsSync(file)) {
				const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
				if (!parsed || parsed.version !== 1 || !parsed.redemptions || !parsed.usage || !parsed.customerUsage) throw new Error('Invalid promo store')
				return { version: 1, redemptions: {}, usage: {}, customerUsage: {}, ...parsed }
			}
		} catch { throw new PromoCodeError('PROMO_STORE_CORRUPT', 'Promo redemption storage could not be read safely.') }
		return { version: 1, redemptions: {}, usage: {}, customerUsage: {} }
	}
	function save(value) {
		fs.mkdirSync(path.dirname(file), { recursive: true })
		const temporary = `${file}.${crypto.randomBytes(12).toString('hex')}.tmp`
		fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
		fs.renameSync(temporary, file)
	}
	function withLock(fn) {
		const next = lock.then(() => fn(load()), () => fn(load()))
		lock = next.catch(() => {})
		return next
	}
	return {
		provider: 'local',
		shared: false,
		async reserve(input) {
			safeId(input.redemptionId)
			safeId(input.promoId)
			return withLock(store => {
				const existing = store.redemptions[input.redemptionId]
				if (existing) {
					if (!redemptionIdentityMatches(existing, input)) throw new PromoCodeError('PROMO_REDEMPTION_CONFLICT', 'Promo redemption id is bound to different purchase details.')
					if (existing.state === 'released') throw new PromoCodeError('PROMO_REDEMPTION_RELEASED', 'This promo reservation has been released.')
					return { redemption: clone(existing), idempotent: true }
				}
				const usage = Number(store.usage[input.promoId] || 0)
				if (input.maxRedemptions !== null && usage >= Number(input.maxRedemptions)) throw new PromoCodeError('PROMO_CODE_EXHAUSTED', 'Promo code redemption limit has been reached.')
				const customerKey = `${input.promoId}:${input.customerHash}`
				const customerUsage = Number(store.customerUsage[customerKey] || 0)
				if (customerUsage >= Number(input.maxPerCustomer || 1)) throw new PromoCodeError('PROMO_CODE_ALREADY_REDEEMED', 'Promo code has already been redeemed for this billing identity.')
				const next = redemptionRecord(input)
				store.redemptions[input.redemptionId] = next
				store.usage[input.promoId] = usage + 1
				store.customerUsage[customerKey] = customerUsage + 1
				save(store)
				return { redemption: clone(next), idempotent: false }
			})
		},
		async complete(redemptionId, patch = {}) {
			safeId(redemptionId)
			return withLock(store => {
				const existing = store.redemptions[String(redemptionId)]
				if (!existing) throw new PromoCodeError('PROMO_REDEMPTION_NOT_FOUND', 'Promo redemption was not found.')
				const next = completedRecord(existing, patch)
				if (existing.state === 'completed') return { redemption: clone(existing), idempotent: true }
				store.redemptions[existing.redemptionId] = next
				save(store)
				return { redemption: clone(next), idempotent: false }
			})
		},
		async release(redemptionId, reason = 'payment_failed') {
			safeId(redemptionId)
			return withLock(store => {
				const existing = store.redemptions[String(redemptionId)]
				if (!existing) return { redemption: null, idempotent: true }
				if (existing.state === 'completed' || existing.state === 'released') return { redemption: clone(existing), idempotent: true }
				const next = { ...existing, state: 'released', releaseReason: reason, releasedAt: nowIso(), updatedAt: nowIso() }
				store.redemptions[existing.redemptionId] = next
				store.usage[existing.promoId] = Math.max(0, Number(store.usage[existing.promoId] || 0) - 1)
				const customerKey = `${existing.promoId}:${existing.customerHash}`
				store.customerUsage[customerKey] = Math.max(0, Number(store.customerUsage[customerKey] || 0) - 1)
				save(store)
				return { redemption: clone(next), idempotent: false }
			})
		},
		async get(redemptionId) {
			safeId(redemptionId)
			return load().redemptions[String(redemptionId)] || null
		},
	}
}

let firestorePromise = null
async function firestore(env = process.env) {
	if (!firestorePromise) {
		firestorePromise = import('@google-cloud/firestore').then(({ Firestore }) => new Firestore({
			projectId: env.BETTERPPTX_GCP_PROJECT || env.GOOGLE_CLOUD_PROJECT || undefined,
			databaseId: env.BETTERPPTX_FIRESTORE_DATABASE || undefined,
		}))
	}
	return firestorePromise
}

function collectionPrefix(env = process.env) {
	const prefix = String(env.BETTERPPTX_FIRESTORE_BILLING_COLLECTION_PREFIX || env.BETTERPPTX_FIRESTORE_BILLING_PREFIX || 'betterpptx_billing').trim()
	if (!prefix || prefix.includes('..') || /[\\/]/.test(prefix)) throw new PromoCodeError('PROMO_COLLECTION_PREFIX_INVALID', 'Promo redemption collection prefix is invalid.')
	return prefix
}

function firestoreStore(env = process.env, firestoreDb = null) {
	async function refs() {
		const db = firestoreDb || await firestore(env)
		const prefix = collectionPrefix(env)
		return {
			db,
			redemptions: db.collection(`${prefix}_promo_redemptions`),
			codes: db.collection(`${prefix}_promo_codes`),
			customers: db.collection(`${prefix}_promo_customer_redemptions`),
		}
	}
	return {
		provider: 'firestore',
		shared: true,
		async reserve(input) {
			const r = await refs()
			const redRef = r.redemptions.doc(safeId(input.redemptionId))
			const codeRef = r.codes.doc(safeId(input.promoId))
			const customerRef = r.customers.doc(safeId(`${input.promoId}:${input.customerHash}`))
			return runMeteredFirestoreTransaction(r.db, async tx => {
				const [redSnap, codeSnap, customerSnap] = await Promise.all([tx.get(redRef), tx.get(codeRef), tx.get(customerRef)])
				if (redSnap.exists) {
					const existing = redSnap.data() || {}
					if (!redemptionIdentityMatches(existing, input)) throw new PromoCodeError('PROMO_REDEMPTION_CONFLICT', 'Promo redemption id is bound to different purchase details.')
					if (existing.state === 'released') throw new PromoCodeError('PROMO_REDEMPTION_RELEASED', 'This promo reservation has been released.')
					return { redemption: existing, idempotent: true }
				}
				const usage = Number(codeSnap.exists ? codeSnap.data()?.usageCount : 0)
				if (input.maxRedemptions !== null && usage >= Number(input.maxRedemptions)) throw new PromoCodeError('PROMO_CODE_EXHAUSTED', 'Promo code redemption limit has been reached.')
				const customerUsage = Number(customerSnap.exists ? customerSnap.data()?.usageCount || 0 : 0)
				if (customerUsage >= Number(input.maxPerCustomer || 1)) throw new PromoCodeError('PROMO_CODE_ALREADY_REDEEMED', 'Promo code has already been redeemed for this billing identity.')
				const next = redemptionRecord(input)
				if (redSnap.exists) tx.set(redRef, next, { merge: false })
				else tx.create(redRef, next)
				tx.set(codeRef, { promoId: input.promoId, usageCount: usage + 1, updatedAt: nowIso() }, { merge: true })
				tx.set(customerRef, { promoId: input.promoId, customerHash: input.customerHash, usageCount: customerUsage + 1, updatedAt: nowIso() }, { merge: true })
				return { redemption: next, idempotent: false }
			})
		},
		async complete(redemptionId, patch = {}) {
			const r = await refs()
			const redRef = r.redemptions.doc(safeId(redemptionId))
			return runMeteredFirestoreTransaction(r.db, async tx => {
				const snap = await tx.get(redRef)
				if (!snap.exists) throw new PromoCodeError('PROMO_REDEMPTION_NOT_FOUND', 'Promo redemption was not found.')
				const existing = snap.data() || {}
				const next = completedRecord(existing, patch)
				if (existing.state === 'completed') return { redemption: existing, idempotent: true }
				tx.set(redRef, next, { merge: true })
				return { redemption: next, idempotent: false }
			})
		},
		async release(redemptionId, reason = 'payment_failed') {
			const r = await refs()
			const redRef = r.redemptions.doc(safeId(redemptionId))
			const existingRecord = await meteredFirestoreGet(redRef)
			if (!existingRecord.exists) return { redemption: null, idempotent: true }
			const existing = existingRecord.data() || {}
			if (existing.state === 'completed' || existing.state === 'released') return { redemption: existing, idempotent: true }
			const codeRef = r.codes.doc(safeId(existing.promoId))
			const customerRef = r.customers.doc(safeId(`${existing.promoId}:${existing.customerHash}`))
			return runMeteredFirestoreTransaction(r.db, async tx => {
				const [snap, codeSnap, customerSnap] = await Promise.all([tx.get(redRef), tx.get(codeRef), tx.get(customerRef)])
				if (!snap.exists) return { redemption: null, idempotent: true }
				const current = snap.data() || {}
				if (current.state === 'completed' || current.state === 'released') return { redemption: current, idempotent: true }
				const next = { ...current, state: 'released', releaseReason: reason, releasedAt: nowIso(), updatedAt: nowIso() }
				tx.set(redRef, next, { merge: true })
				const usage = Math.max(0, Number(codeSnap.exists ? codeSnap.data()?.usageCount : 0) - 1)
				const customerUsage = Math.max(0, Number(customerSnap.exists ? customerSnap.data()?.usageCount : 0) - 1)
				tx.set(codeRef, { promoId: current.promoId, usageCount: usage, updatedAt: nowIso() }, { merge: true })
				tx.set(customerRef, { promoId: current.promoId, customerHash: current.customerHash, usageCount: customerUsage, updatedAt: nowIso() }, { merge: true })
				return { redemption: next, idempotent: false }
			})
		},
		async get(redemptionId) {
			const r = await refs()
			const snap = await meteredFirestoreGet(r.redemptions.doc(safeId(redemptionId)))
			return snap.exists ? snap.data() || null : null
		},
	}
}

export function createPromoRedemptionStore({ env = process.env, firestoreDb = null } = {}) {
	const provider = providerName(env)
	if (provider === 'firestore') return firestoreStore(env, firestoreDb)
	if (provider !== 'local') throw new PromoCodeError('PROMO_STORE_UNAVAILABLE', 'Promo redemption storage is not configured for this deployment.')
	if (productionScopeRequired(env)) throw new PromoCodeError('PROMO_STORE_NOT_SHARED', 'Production promo redemption storage must use the shared billing store.')
	return localStore(env)
}

export async function reservePromoCode({ code, packId, customerHash, idempotencyKey = '', intentId = '', env = process.env, store = null } = {}) {
	const decision = evaluatePromoCode({ code, packId, customerHash, env, idempotencyKey })
	const requestDigest = idempotencyKey
		? hashPayload({ customerHash, packId: decision.packId, codeDigest: decision.codeDigest, idempotencyKey: String(idempotencyKey).trim() })
		: hashPayload({ customerHash, packId: decision.packId, codeDigest: decision.codeDigest })
	const redemptionId = `promo_${requestDigest.slice(0, 32)}`
	const redemptionStore = store || createPromoRedemptionStore({ env })
	const result = await redemptionStore.reserve({
		redemptionId,
		promoId: decision.promoId,
		codeDigest: decision.codeDigest,
		customerHash: String(customerHash).trim(),
		packId: decision.packId,
		requestedCredits: decision.requestedCredits,
		originalAmountUsd: decision.originalAmountUsd,
		discountUsdc: decision.discountUsdc,
		finalAmountUsd: decision.finalAmountUsd,
		maxRedemptions: decision.maxRedemptions,
		maxPerCustomer: decision.maxPerCustomer,
		requestKeyDigest: decision.requestKeyDigest || null,
		intentId: intentId || null,
	})
	return {
		decision,
		redemption: result.redemption,
		idempotent: result.idempotent === true,
		store: redemptionStore,
	}
}

export async function completePromoRedemption(redemptionId, patch = {}, { store = null, env = process.env } = {}) {
	const redemptionStore = store || createPromoRedemptionStore({ env })
	return redemptionStore.complete(redemptionId, patch)
}

export async function releasePromoRedemption(redemptionId, reason = 'payment_failed', { store = null, env = process.env } = {}) {
	const redemptionStore = store || createPromoRedemptionStore({ env })
	return redemptionStore.release(redemptionId, reason)
}

export async function getPromoRedemption(redemptionId, { store = null, env = process.env } = {}) {
	const redemptionStore = store || createPromoRedemptionStore({ env })
	return redemptionStore.get(redemptionId)
}

export function publicPromoDecision(decision = {}) {
	return {
		promoId: decision.promoId || null,
		codeDigest: decision.codeDigest || null,
		packId: decision.packId || null,
		requestedCredits: Number(decision.requestedCredits || 0),
		originalAmountUsd: Number(decision.originalAmountUsd || 0),
		discountUsdc: Number(decision.discountUsdc || 0),
		finalAmountUsd: Number(decision.finalAmountUsd || 0),
		paymentRail: decision.paymentRail || null,
		expiresAt: decision.expiresAt || null,
		label: decision.label || null,
	}
}

export { codeDigest, normalizeCode, publicPromoRedemption }

// Shared helper for the MCP and browser/API surfaces. It deliberately keeps
// the raw promo code out of payment-intent metadata, ledger metadata, and
// public responses.
export async function redeemPromoTopup({
	code,
	packId,
	customerHash,
	customerEmail = '',
	idempotencyKey = '',
	intentId = '',
	env = process.env,
	payramFetch = null,
	ledger = null,
	paymentIntents = null,
	promoStore = null,
} = {}) {
	assertProductionBillingConfiguration(env)
	const normalizedCustomerHash = String(customerHash || '').trim()
	const decision = evaluatePromoCode({ code, packId, customerHash: normalizedCustomerHash, idempotencyKey, env })
	const requestDigest = idempotencyKey
		? hashPayload({ customerHash: normalizedCustomerHash, packId: decision.packId, codeDigest: decision.codeDigest, idempotencyKey: String(idempotencyKey).trim() })
		: hashPayload({ customerHash: normalizedCustomerHash, packId: decision.packId, codeDigest: decision.codeDigest })
	// Use the same stable identity for the promo reservation and the PayRam
	// intent. This prevents a retry after a lost response from creating a second
	// provider payment for the same redemption.
	const resolvedIntentId = intentId || `pi_promo_${requestDigest.slice(0, 32)}`
	let checkoutInput = null
	if (decision.finalAmountUsd > 0) {
		checkoutInput = validatePayramPaymentInput({ customerEmail, customerId: productCustomerId(normalizedCustomerHash), amountUsd: decision.finalAmountUsd })
		if (!payramReadiness({ env }).configured) throw new PayRamClientError('PAYRAM_NOT_CONFIGURED', 'PayRam is not configured.')
	}
	const store = promoStore || createPromoRedemptionStore({ env })
	const reservation = await reservePromoCode({ code, packId, customerHash: normalizedCustomerHash, idempotencyKey, intentId: resolvedIntentId, env, store })
	const { redemption } = reservation
	const ledgerStore = ledger || createBillingLedgerStore()
	if (decision.finalAmountUsd <= 0) {
		const creditEventId = `credit_promo_${crypto.createHash('sha256').update(redemption.redemptionId).digest('hex').slice(0, 32)}`
		// Consume the reservation before the ledger write. A racing cancellation
		// must not release quota for a grant that is in flight. Ledger retries use
		// this same immutable event id if the response or completion is lost.
		await completePromoRedemption(redemption.redemptionId, { creditEventId }, { store, env })
		const credited = await ledgerStore.creditCustomer({
			eventId: creditEventId,
			customerHash: String(customerHash).trim(),
			source: 'promo_redemption',
			amountCredits: decision.requestedCredits,
			proofRef: {
				provider: 'betterpptx',
				redemptionId: redemption.redemptionId,
				promoId: decision.promoId,
				codeDigest: decision.codeDigest,
				packId: decision.packId,
			},
		})
		return {
			ok: true,
			state: 'credited',
			idempotent: reservation.idempotent || credited.idempotent === true,
			promo: publicPromoDecision(decision),
			redemption: publicPromoRedemption({ ...redemption, state: 'completed', completedAt: nowIso() }),
			creditedCredits: decision.requestedCredits,
			payment: null,
		}
	}
	const intentStore = paymentIntents || createPaymentIntentStore()
	let providerAttempted = false
	let created = null
	try {
		created = await intentStore.createIntent({
			intentId: resolvedIntentId,
			installHash: String(customerHash).trim(),
			productId: PRODUCT_ID,
			customerHash: String(customerHash).trim(),
			purpose: 'credit_topup',
			provider: 'payram',
			rail: 'payram_card_onramp',
			packId: decision.packId,
			requestedCredits: decision.requestedCredits,
			requestedAmountUsd: decision.finalAmountUsd,
			requestedAmountUsdc: decision.finalAmountUsd,
			minimumCreditableUsd: decision.finalAmountUsd,
			customerEmail,
			state: 'provider_pending',
			metadata: {
				mode: 'promo_discounted_credit_pack',
				promoRedemptionId: redemption.redemptionId,
				promoId: decision.promoId,
				promoCodeDigest: decision.codeDigest,
				originalAmountUsd: decision.originalAmountUsd,
				discountUsdc: decision.discountUsdc,
				finalAmountUsd: decision.finalAmountUsd,
			},
		})
		// Only the transaction which created the intent may contact PayRam.
		// An existing pending intent can represent a request accepted by PayRam
		// whose response was lost; automatically retrying would double-charge.
		if (created.idempotent) {
			const existing = created.intent
			const url = existing.metadata?.payramPaymentUrl
			return {
				ok: true, state: existing.state, idempotent: true,
				promo: publicPromoDecision(decision), redemption: publicPromoRedemption(redemption), payment: existing,
				paymentUrl: url ? validatePayramPaymentUrl(url, existing.providerReferenceId, { env }) : null,
				...paymentIntentContinuation(existing),
			}
		}
		providerAttempted = true
		const payment = await createPayramPayment({
			...checkoutInput,
		}, { env, fetchFn: payramFetch })
		const initialProviderStatus = payment.providerStatus && payment.providerStatus !== 'UNKNOWN' ? payment.providerStatus : 'OPEN'
		const updated = await intentStore.updateIntent(created.intent.intentId, {
			providerReferenceId: payment.referenceId,
			providerStatus: initialProviderStatus,
			state: 'awaiting_customer_completion',
			metadata: {
				...(created.intent.metadata || {}),
				payramPaymentUrl: payment.url,
			},
		})
		return {
			ok: true,
			state: 'awaiting_customer_completion',
			idempotent: created.idempotent === true,
			promo: publicPromoDecision(decision),
			redemption: publicPromoRedemption(redemption),
			payment: updated,
			paymentUrl: payment.url,
			...paymentIntentContinuation(updated),
		}
	} catch (error) {
		if (providerAttempted) {
			await intentStore.updateIntent(created.intent.intentId, { state: 'verification_pending' }).catch(() => {})
		} else if (!reservation.idempotent && !created) {
			await releasePromoRedemption(redemption.redemptionId, 'checkout_binding_failed', { store, env }).catch(() => {})
		}
		throw error
	}
}
