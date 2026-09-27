import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import {
	meteredFirestoreGet,
	meteredFirestoreQueryGet,
	meteredFirestoreSet,
	runMeteredFirestoreTransaction,
} from './firestore-meter.mjs'

export const CREDIT_SCALE = 100

export class BillingLedgerConfigError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'BillingLedgerConfigError'
		this.code = code
		this.details = details
	}
}

export class BillingLedgerError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'BillingLedgerError'
		this.code = code
		this.details = details
	}
}

const SECRETISH_FIELDS = new Set([
	'key',
	'licensekey',
	'activationkey',
	'apikey',
	'rawkey',
	'rawtoken',
	'devicetoken',
	'installtoken',
	'secret',
	'token',
	'authorization',
])

function nowIso() {
	return new Date().toISOString()
}

function clone(value) {
	if (value === undefined || value === null) return value
	return JSON.parse(JSON.stringify(value))
}

export function toCreditUnits(value) {
	const n = moneyNumber(value)
	// Round decimal credits, including decimal strings, before converting to a
	// Number. Binary floating point must not turn 1.005 credits into 100 units.
	const [coefficient, exponent = '0'] = String(value).trim().toLowerCase().split('e')
	const [whole, fraction = ''] = coefficient.replace(/^\+/, '').split('.')
	const digits = BigInt(`${whole || '0'}${fraction}`)
	const shift = Number(exponent) - fraction.length + 2
	if (n === 0) return 0
	if (shift > 20) throw invalidAmount()
	let units
	if (shift >= 0) units = digits * (10n ** BigInt(shift))
	else if (-shift > String(digits).length + 1) units = 0n
	else {
		const divisor = 10n ** BigInt(-shift)
		units = (digits + divisor / 2n) / divisor
	}
	if (units > BigInt(Number.MAX_SAFE_INTEGER)) throw invalidAmount()
	return Number(units)
}

export function fromCreditUnits(units) {
	const n = creditUnits(units)
	const credits = Number((n / CREDIT_SCALE).toFixed(2))
	if (toCreditUnits(credits) !== n) throw invalidAmount()
	return credits
}

function invalidAmount() {
	return new BillingLedgerError('BILLING_AMOUNT_INVALID', 'Billing amounts must be finite, non-negative and within the safe integer credit-unit range.')
}

function moneyNumber(value) {
	if (typeof value !== 'number' && typeof value !== 'string') throw invalidAmount()
	if (typeof value === 'string' && (value.length > 400 || !/^\+?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()))) throw invalidAmount()
	const n = Number(value)
	if (!Number.isFinite(n) || n < 0) throw invalidAmount()
	return n
}

function creditUnits(value) {
	const n = moneyNumber(value)
	if (!Number.isSafeInteger(n)) throw invalidAmount()
	if (typeof value === 'string') {
		const [coefficient, exponent = '0'] = value.trim().toLowerCase().split('e')
		const [whole, fraction = ''] = coefficient.replace(/^\+/, '').split('.')
		const digits = BigInt(`${whole || '0'}${fraction}`)
		const shift = Number(exponent) - fraction.length
		if (digits !== 0n) {
			if (shift > 16 || -shift > String(digits).length) throw invalidAmount()
			const divisor = shift < 0 ? 10n ** BigInt(-shift) : 1n
			const exact = shift < 0 ? digits / divisor : digits * (10n ** BigInt(shift))
			if (digits % divisor !== 0n || exact !== BigInt(n)) throw invalidAmount()
		}
	}
	return n
}

function addUnits(a, b) {
	return creditUnits(creditUnits(a) + creditUnits(b))
}

function subtractUnits(a, b) {
	if (creditUnits(a) < creditUnits(b)) {
		throw new BillingLedgerError('BILLING_BALANCE_INVARIANT', 'Billing balance does not cover its recorded obligation.')
	}
	return a - b
}

function creditPatchFrom(value, unitsField, creditsField) {
	if (value?.[unitsField] !== undefined) return creditUnits(value[unitsField])
	if (Object.prototype.hasOwnProperty.call(value || {}, creditsField)) return toCreditUnits(value[creditsField])
	return null
}

function assertAmountAliases(input, amountUnits) {
	for (const field of ['amountUnits', 'amountCredits', 'amount']) {
		if (input[field] === undefined) continue
		const units = field === 'amountUnits' ? creditUnits(input[field]) : toCreditUnits(input[field])
		if (units !== amountUnits) throw new BillingLedgerError('BILLING_AMOUNT_CONFLICT', 'Billing amount fields must agree in credit units.')
	}
}

const CREDIT_UNIT_FIELDS = [
	['availableBalanceUnits', 'availableBalanceCredits'],
	['lastKnownProviderAvailableBalanceUnits', 'lastKnownProviderAvailableBalanceCredits'],
	['pendingReservedUnits', 'pendingReservedCredits'],
	['queuedUsageUnits', 'queuedUsageCredits'],
	['durableQueuedUsageUnitsNotYetSettled', 'durableQueuedUsageCreditsNotYetSettled'],
	['committedUsageUnits', 'committedUsageCredits'],
]

// Trailing entries are legacy (pre-PayRam) field names: read-only fallbacks so
// ledger records written before the provider-neutral rename still normalize.
const AVAILABLE_BALANCE_FIELDS = [
	['availableBalanceUnits', 'availableBalanceCredits'],
	['lastKnownProviderAvailableBalanceUnits', 'lastKnownProviderAvailableBalanceCredits'],
	['lastKnownDodoAvailableBalanceUnits', 'lastKnownDodoAvailableBalanceCredits'],
]

const QUEUED_USAGE_FIELDS = [
	['queuedUsageUnits', 'queuedUsageCredits'],
	['durableQueuedUsageUnitsNotYetSettled', 'durableQueuedUsageCreditsNotYetSettled'],
	['durableQueuedUsageUnitsNotYetReflectedByDodo', 'durableQueuedUsageCreditsNotYetReflectedByDodo'],
]

const LEGACY_CREDIT_FIELDS = [
	'lastKnownDodoAvailableBalanceUnits',
	'lastKnownDodoAvailableBalanceCredits',
	'durableQueuedUsageUnitsNotYetReflectedByDodo',
	'durableQueuedUsageCreditsNotYetReflectedByDodo',
]

const LEGAL_CREDIT_SOURCES = new Set([
	'x402_settlement',
	'chain_transfer',
	'payram_settlement',
	'promo_redemption',
	'owner_goodwill',
])

function firstCreditPatchFrom(value, fields, fallback = 0) {
	for (const [unitsField, creditsField] of fields) {
		const patched = creditPatchFrom(value, unitsField, creditsField)
		if (patched !== null) return patched
	}
	return creditUnits(fallback)
}

function mergedCustomerRecord(customerHash, existing = {}, patch = {}, createdAt = nowIso()) {
	const cleanPatch = sanitizeRecord(patch)
	for (const fields of [AVAILABLE_BALANCE_FIELDS, QUEUED_USAGE_FIELDS, [['pendingReservedUnits', 'pendingReservedCredits']], [['committedUsageUnits', 'committedUsageCredits']]]) {
		const amounts = fields.flatMap(([units, credits]) => [
			...(cleanPatch[units] === undefined ? [] : [creditUnits(cleanPatch[units])]),
			...(cleanPatch[credits] === undefined ? [] : [toCreditUnits(cleanPatch[credits])]),
		])
		if (amounts.some(amount => amount !== amounts[0])) throw new BillingLedgerError('BILLING_AMOUNT_CONFLICT', 'Customer balance aliases must agree in credit units.')
	}
	// Metadata refreshes cannot import a stale balance snapshot over ledger money.
	// Initial seeding remains supported for local fixtures and legacy migration.
	if (existing.customerHash) {
		const current = normalizeCustomer(existing)
		for (const [unitsField, creditsField] of [...CREDIT_UNIT_FIELDS, ...AVAILABLE_BALANCE_FIELDS, ...QUEUED_USAGE_FIELDS]) {
			const amount = creditPatchFrom(cleanPatch, unitsField, creditsField)
			const canonical = AVAILABLE_BALANCE_FIELDS.some(pair => pair[0] === unitsField) ? 'availableBalanceUnits'
				: QUEUED_USAGE_FIELDS.some(pair => pair[0] === unitsField) ? 'queuedUsageUnits' : unitsField
			if (amount !== null && amount !== current[canonical]) {
				throw new BillingLedgerError('BILLING_CUSTOMER_BALANCE_PATCH_FORBIDDEN', 'Existing balances can only change through ledger transactions.')
			}
		}
	}
	const merged = {
		customerHash,
		billingStatus: 'unknown',
		createdAt,
		...existing,
		...cleanPatch,
		customerHash,
		createdAt,
		updatedAt: nowIso(),
	}
	for (const fields of [AVAILABLE_BALANCE_FIELDS, QUEUED_USAGE_FIELDS]) {
		const touched = fields.some(([unitsField, creditsField]) =>
			Object.prototype.hasOwnProperty.call(cleanPatch, unitsField) ||
			Object.prototype.hasOwnProperty.call(cleanPatch, creditsField))
		if (!touched) continue
		for (const [unitsField, creditsField] of fields) {
			if (!Object.prototype.hasOwnProperty.call(cleanPatch, unitsField)) delete merged[unitsField]
			if (!Object.prototype.hasOwnProperty.call(cleanPatch, creditsField)) delete merged[creditsField]
		}
	}
	for (const [unitsField, creditsField] of CREDIT_UNIT_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(cleanPatch, creditsField) && !Object.prototype.hasOwnProperty.call(cleanPatch, unitsField)) {
			delete merged[unitsField]
		}
	}
	return merged
}

export function hashStableId(kind, value) {
	const raw = String(value || '').trim()
	if (!raw) throw new BillingLedgerError('BILLING_HASH_INPUT_MISSING', `Missing ${kind} id for billing hash.`, { kind })
	const salt = String(process.env.BETTERPPTX_BILLING_HASH_SALT || 'betterpptx-billing-v1')
	const digest = crypto.createHash('sha256').update(`${salt}\0${kind}\0${raw}`).digest('hex').slice(0, 32)
	return `${kind}_${digest}`
}

export function hashCustomerId(value) {
	return hashStableId('customer', value)
}

export function hashSessionId(value) {
	return hashStableId('session', value)
}

export function hashDeckId(value) {
	return hashStableId('deck', value)
}

export function hashOperationId(value) {
	return hashStableId('operation', value)
}

export function hashPayload(value) {
	const stable = JSON.stringify(stableForHash(value))
	return crypto.createHash('sha256').update(stable).digest('hex')
}

function stableForHash(value) {
	if (value === undefined) return null
	if (value === null || typeof value !== 'object') return value
	if (Array.isArray(value)) return value.map(stableForHash)
	const out = Object.create(null)
	for (const key of Object.keys(value).sort()) out[key] = stableForHash(value[key])
	return out
}

function sanitizeRecord(value) {
	if (!value || typeof value !== 'object') return value
	if (Array.isArray(value)) return value.map(item => item === undefined ? null : sanitizeRecord(item))
	const out = Object.create(null)
	for (const [key, item] of Object.entries(value)) {
		if (SECRETISH_FIELDS.has(String(key).toLowerCase())) continue
		if (item === undefined) continue
		out[key] = sanitizeRecord(item)
	}
	return out
}

function emptyStore() {
	return {
		version: 2,
		customers: {},
		sessions: {},
		decks: {},
		operations: {},
		reservations: {},
		usageEvents: {},
		creditEvents: {},
		creditGrants: {},
		creditGrantClaims: {},
		webhookEvents: {},
		rateCards: {},
	}
}

function providerName() {
	return String(process.env.BETTERPPTX_BILLING_LEDGER_STORE || 'local').trim().toLowerCase()
}

function requireSharedStores() {
	return process.env.BETTERPPTX_REQUIRE_SHARED_STORES === '1'
}

function defaultStorePath() {
	const configured = String(process.env.BETTERPPTX_BILLING_LEDGER_FILE || '').trim()
	if (configured) return path.resolve(configured)
	const root = String(process.env.BETTERPPTX_OUT_DIR || process.env.BETTERPPTX_DOWNLOAD_ROOT || 'outputs').trim()
	return path.resolve(root, 'betterpptx-billing-ledger.json')
}

function collectionPrefix() {
	const prefix = String(process.env.BETTERPPTX_FIRESTORE_BILLING_COLLECTION_PREFIX || 'betterpptx_billing').trim()
	if (!prefix || prefix.includes('..') || /[\\/]/.test(prefix)) {
		throw new BillingLedgerConfigError('BILLING_COLLECTION_PREFIX_INVALID', 'Invalid Firestore billing collection prefix.', { prefix })
	}
	return prefix
}

function assertSupportedProvider(provider) {
	if (provider === 'local' || provider === 'firestore') return
	throw new BillingLedgerConfigError(
		'BILLING_LEDGER_PROVIDER_UNAVAILABLE',
		`Billing ledger provider "${provider}" is not available. Configure BETTERPPTX_BILLING_LEDGER_STORE=local for local dev or firestore for staging/production.`,
		{ provider },
	)
}

function normalizeCustomer(input = {}) {
	const customerHash = String(input.customerHash || input.id || '').trim()
	if (!customerHash) throw new BillingLedgerError('BILLING_CUSTOMER_HASH_MISSING', 'Missing billing customer hash.', {})
	const availableUnits = firstCreditPatchFrom(
		input,
		AVAILABLE_BALANCE_FIELDS,
		input.availableBalanceUnits ?? input.lastKnownProviderAvailableBalanceUnits,
	)
	const pendingUnits = creditPatchFrom(input, 'pendingReservedUnits', 'pendingReservedCredits')
	const queuedUnits = firstCreditPatchFrom(
		input,
		QUEUED_USAGE_FIELDS,
		input.queuedUsageUnits ?? input.durableQueuedUsageUnitsNotYetSettled,
	)
	const committedUnits = creditPatchFrom(input, 'committedUsageUnits', 'committedUsageCredits')
	const next = {
		...sanitizeRecord(input),
		customerHash,
		availableBalanceUnits: availableUnits,
		lastKnownProviderAvailableBalanceUnits: availableUnits,
		pendingReservedUnits: pendingUnits ?? 0,
		queuedUsageUnits: queuedUnits,
		durableQueuedUsageUnitsNotYetSettled: queuedUnits,
		committedUsageUnits: committedUnits ?? 0,
	}
	next.availableBalanceCredits = fromCreditUnits(next.availableBalanceUnits)
	next.lastKnownProviderAvailableBalanceCredits = fromCreditUnits(next.lastKnownProviderAvailableBalanceUnits)
	next.pendingReservedCredits = fromCreditUnits(next.pendingReservedUnits)
	next.queuedUsageCredits = fromCreditUnits(next.queuedUsageUnits)
	next.durableQueuedUsageCreditsNotYetSettled = fromCreditUnits(next.durableQueuedUsageUnitsNotYetSettled)
	next.committedUsageCredits = fromCreditUnits(next.committedUsageUnits)
	next.effectiveAvailableUnits = subtractUnits(next.availableBalanceUnits, addUnits(next.pendingReservedUnits, next.queuedUsageUnits))
	next.effectiveAvailableCredits = fromCreditUnits(next.effectiveAvailableUnits)
	for (const legacyField of LEGACY_CREDIT_FIELDS) delete next[legacyField]
	return next
}

function defaultCustomer(customerHash, patch = {}) {
	const now = nowIso()
	return normalizeCustomer({
		customerHash,
		billingStatus: 'unknown',
		createdAt: now,
		updatedAt: now,
		...patch,
	})
}

function validateReservationInput(input = {}) {
	const reservationId = String(input.reservationId || '').trim()
	const customerHash = String(input.customerHash || '').trim()
	const amountUnits = input.amountUnits === undefined ? toCreditUnits(input.amountCredits ?? input.amount) : creditUnits(input.amountUnits)
	assertAmountAliases(input, amountUnits)
	if (!reservationId) throw new BillingLedgerError('BILLING_RESERVATION_ID_MISSING', 'Missing billing reservation id.', {})
	if (!customerHash) throw new BillingLedgerError('BILLING_CUSTOMER_HASH_MISSING', 'Missing billing customer hash.', {})
	if (amountUnits <= 0) throw new BillingLedgerError('BILLING_RESERVATION_AMOUNT_INVALID', 'Reservation amount must be positive.', { amountCredits: input.amountCredits })
	return { reservationId, customerHash, amountUnits }
}

function idempotencyConflict(kind, id) {
	return new BillingLedgerError('BILLING_IDEMPOTENCY_CONFLICT', `Billing ${kind} id was already used with different data.`, { id })
}

function sameReservation(existing, input, amountUnits) {
	return existing.customerHash === input.customerHash &&
		creditUnits(existing.amountUnits) === amountUnits &&
		String(existing.operationId || '') === String(input.operationId || '') &&
		String(existing.sessionHash || '') === String(input.sessionHash || '') &&
		String(existing.deckHash || '') === String(input.deckHash || '') &&
		String(existing.mode || 'checkpoint') === String(input.mode || 'checkpoint')
}

function requestedCommitUnits(input = {}, reservedUnits = 0) {
	const explicit = input.amountUnits !== undefined || input.amountCredits !== undefined || input.amount !== undefined
	const amountUnits = input.amountUnits !== undefined
		? creditUnits(input.amountUnits)
		: explicit
			? toCreditUnits(input.amountCredits ?? input.amount)
			: reservedUnits
	assertAmountAliases(input, amountUnits)
	if (amountUnits <= 0) {
		throw new BillingLedgerError('BILLING_COMMIT_AMOUNT_INVALID', 'Committed billing amount must be positive.', {
			reservedCredits: fromCreditUnits(reservedUnits),
		})
	}
	if (amountUnits > reservedUnits) {
		throw new BillingLedgerError('BILLING_COMMIT_EXCEEDS_RESERVATION', 'Committed billing amount cannot exceed the accepted reservation cap.', {
			reservedCredits: fromCreditUnits(reservedUnits),
			requestedCredits: fromCreditUnits(amountUnits),
		})
	}
	return { amountUnits, explicit }
}

function normalizeCreditEvent(input = {}) {
	assertPermanentEvent(input)
	const customerHash = String(input.customerHash || '').trim()
	const source = String(input.source || '').trim()
	const amountUnits = input.amountUnits !== undefined ? creditUnits(input.amountUnits) : toCreditUnits(input.amountCredits ?? input.amount)
	assertAmountAliases(input, amountUnits)
	const proofRef = sanitizeRecord(input.proofRef || {})
	const proofHash = hashPayload({
		source,
		proofRef,
		idempotencyKey: input.idempotencyKey || input.idempotency_key || null,
	})
	const eventId = String(input.eventId || `credit_${proofHash.slice(0, 32)}`).trim()
	if (!eventId) throw new BillingLedgerError('BILLING_CREDIT_EVENT_ID_MISSING', 'Missing credit event id.', {})
	if (!customerHash) throw new BillingLedgerError('BILLING_CUSTOMER_HASH_MISSING', 'Missing billing customer hash.', {})
	if (!LEGAL_CREDIT_SOURCES.has(source)) {
		throw new BillingLedgerError('BILLING_CREDIT_SOURCE_FORBIDDEN', 'Credit source is not allowed to mint BetterPPTX credits.', {
			source,
			allowedSources: Array.from(LEGAL_CREDIT_SOURCES),
		})
	}
	if (amountUnits <= 0) throw new BillingLedgerError('BILLING_CREDIT_AMOUNT_INVALID', 'Credit amount must be positive.', { eventId })
	if (!Object.keys(proofRef).length && !String(input.idempotencyKey || input.idempotency_key || '').trim()) {
		throw new BillingLedgerError('BILLING_CREDIT_PROOF_MISSING', 'Credit minting requires a proof reference or idempotency key.', { eventId, source })
	}
	if (input.state !== undefined && input.state !== 'credited') throw new BillingLedgerError('BILLING_CREDIT_STATE_INVALID', 'New credits must have a permanent credited event.')
	const now = nowIso()
	return {
		...sanitizeRecord(input),
		eventId,
		customerHash,
		source,
		proofRef,
		proofHash,
		proofIdentityHash: creditProofIdentity({ source, proofRef, idempotencyKey: input.idempotencyKey || input.idempotency_key }),
		amountUnits,
		amountCredits: fromCreditUnits(amountUnits),
		state: 'credited',
		metadata: sanitizeRecord(input.metadata || {}),
		createdAt: input.createdAt || now,
		updatedAt: now,
	}
}

function sameCreditEvent(existing = {}, normalized = {}) {
	return existing.state === 'credited' && String(existing.customerHash || '') === String(normalized.customerHash || '') &&
		String(existing.source || '') === String(normalized.source || '') &&
		String(existing.proofHash || '') === String(normalized.proofHash || '') &&
		creditUnits(existing.amountUnits) === creditUnits(normalized.amountUnits)
}

function creditProofIdentity(event) {
	const proofRef = sanitizeRecord(event.proofRef || {})
	return hashPayload({ source: event.source, ...(Object.keys(proofRef).length ? { proofRef } : { idempotencyKey: event.idempotencyKey || event.idempotency_key }) })
}

function assertPermanentEvent(event) {
	for (const field of ['expiresAt', 'expireAt', 'ttl', 'deleteAfter']) {
		if (event[field] !== undefined) throw new BillingLedgerError('BILLING_EVENT_EXPIRY_FORBIDDEN', 'Billing events are permanent replay and accounting records.')
	}
}

/**
 * Server-only cumulative grant contract. sourceId is the stable verified funding
 * identity, never a client-selected idempotency key. totalCredits is the verified
 * cumulative entitlement, never a delta or a balance read from another store.
 * proofRef contains the verified evidence for that cumulative observation.
 * The caller owns evidence verification and source identity normalization.
 */
function normalizeCumulativeCredit({ customerHash, sourceId, totalCredits, source, proofRef } = {}) {
	for (const value of [customerHash, sourceId, source]) {
		if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 1024) throw new BillingLedgerError('BILLING_CUMULATIVE_ID_INVALID', 'Cumulative credit requires canonical server-owned source and customer identities.')
	}
	if (!LEGAL_CREDIT_SOURCES.has(source)) throw new BillingLedgerError('BILLING_CREDIT_SOURCE_FORBIDDEN', 'Credit source is not allowed to mint BetterPPTX credits.')
	const totalUnits = toCreditUnits(totalCredits)
	if (fromCreditUnits(totalUnits) !== moneyNumber(totalCredits)) throw invalidAmount()
	if (!proofRef || typeof proofRef !== 'object' || Array.isArray(proofRef) || !Object.keys(proofRef).length) throw new BillingLedgerError('BILLING_CREDIT_PROOF_MISSING', 'Cumulative credit requires verified proof evidence.')
	const cleanProof = sanitizeRecord(proofRef)
	if (!Object.keys(cleanProof).length) throw new BillingLedgerError('BILLING_CREDIT_PROOF_MISSING', 'Cumulative credit requires verified proof evidence.')
	const assertJsonEvidence = value => {
		if (value === null || typeof value === 'string' || typeof value === 'boolean') return
		if (typeof value === 'number' && Number.isFinite(value)) return
		if (Array.isArray(value)) { value.forEach(assertJsonEvidence); return }
		if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
			Object.values(value).forEach(assertJsonEvidence)
			return
		}
		throw new BillingLedgerError('BILLING_CREDIT_PROOF_INVALID', 'Cumulative evidence must be stable JSON data.')
	}
	assertJsonEvidence(cleanProof)
	const jsonProof = clone(cleanProof)
	if (hashPayload(jsonProof) !== hashPayload(cleanProof)) throw new BillingLedgerError('BILLING_CREDIT_PROOF_INVALID', 'Cumulative evidence must be stable JSON data.')
	const grantId = `grant_${hashPayload({ source, sourceId })}`
	const claimId = `grant_claim_${hashPayload({ grantId, totalUnits })}`
	const proofDigest = creditProofIdentity({ source, proofRef: jsonProof })
	const claimDigest = hashPayload({ grantId, customerHash, totalUnits, proofDigest })
	return { customerHash, sourceId, source, totalUnits, totalCredits: fromCreditUnits(totalUnits), grantId, claimId, proofRef: jsonProof, proofDigest, claimDigest }
}

function cumulativeHistoryMissing() {
	return new BillingLedgerError('BILLING_CREDIT_HISTORY_MISSING', 'Permanent cumulative grant history is missing or inconsistent; reconciliation is required.')
}

function legacyCumulativeOrderId(request) {
	// Compatibility with the historical watcher proof contract. Old delta events
	// cannot establish a trustworthy cumulative target after the old race.
	return request.source === 'chain_transfer' && request.sourceId.startsWith('base-usdc-order:')
		? request.sourceId.slice('base-usdc-order:'.length) : null
}

function cumulativeGrantForLegacyCredit(event) {
	const orderId = event.source === 'chain_transfer' ? event.proofRef?.orderId : null
	return typeof orderId === 'string' && orderId ? `grant_${hashPayload({ source: event.source, sourceId: `base-usdc-order:${orderId}` })}` : null
}

function legacyCumulativeReconciliationRequired() {
	return new BillingLedgerError('BILLING_CUMULATIVE_LEGACY_RECONCILIATION_REQUIRED', 'Historical credits for this source require verified ledger reconciliation before cumulative minting.')
}

function assertCumulativeClaim(claim, grant, event) {
	if (!claim || claim.state !== 'recorded' || claim.grantId !== grant.grantId || claim.customerHash !== grant.customerHash ||
		claim.source !== grant.source || claim.sourceId !== grant.sourceId) throw cumulativeHistoryMissing()
	const normalized = normalizeCumulativeCredit({ ...claim, totalCredits: fromCreditUnits(claim.totalUnits) })
	if (claim.claimId !== normalized.claimId || claim.proofDigest !== normalized.proofDigest || claim.claimDigest !== normalized.claimDigest ||
		creditUnits(claim.totalUnits) > creditUnits(grant.totalUnits) || creditUnits(claim.grantedUnits) > claim.totalUnits) throw cumulativeHistoryMissing()
	if (claim.grantedUnits > 0) {
		if (!event || event.state !== 'credited' || event.eventId !== claim.eventId || event.cumulativeGrantId !== grant.grantId ||
			event.grantClaimId !== claim.claimId || event.customerHash !== claim.customerHash || event.source !== claim.source ||
			creditUnits(event.amountUnits) !== claim.grantedUnits || creditProofIdentity(event) !== claim.proofDigest) throw cumulativeHistoryMissing()
	} else if (claim.eventId !== null) throw cumulativeHistoryMissing()
}

function cumulativeCreditChange(request, { grant, claim, proof, customer, headClaim, headEvent, claimEvent, eventCollision }) {
	if (proof && (proof.grantClaimId !== request.claimId || proof.grantId !== request.grantId || proof.claimDigest !== request.claimDigest)) throw idempotencyConflict('credit proof', request.claimId)
	if (grant) {
		if (grant.grantId !== request.grantId || grant.sourceId !== request.sourceId || grant.source !== request.source || grant.customerHash !== request.customerHash) throw idempotencyConflict('cumulative grant', request.grantId)
		if (grant.state !== 'active' || !headClaim || headClaim.claimId !== grant.headClaimId || headClaim.totalUnits !== grant.totalUnits || headClaim.claimDigest !== grant.headClaimDigest) throw cumulativeHistoryMissing()
		assertCumulativeClaim(headClaim, grant, headEvent)
		requireCustomer(customer, request.customerHash)
	} else if (claim || proof || headClaim) throw cumulativeHistoryMissing()
	if (claim && claim.claimDigest !== request.claimDigest) throw idempotencyConflict('cumulative claim', request.claimId)
	if (claim) {
		assertCumulativeClaim(claim, grant, claimEvent)
		if (!proof) throw cumulativeHistoryMissing()
		return { result: { grant, claim, creditEvent: claimEvent || null, customer: requireCustomer(customer, request.customerHash), creditedUnits: 0, creditedCredits: 0, totalUnits: grant.totalUnits, totalCredits: fromCreditUnits(grant.totalUnits), idempotent: true } }
	}
	if (proof || eventCollision) throw cumulativeHistoryMissing()
	const previousUnits = grant ? creditUnits(grant.totalUnits) : 0
	const nextTotalUnits = Math.max(previousUnits, request.totalUnits)
	const creditedUnits = subtractUnits(nextTotalUnits, previousUnits)
	const currentCustomer = customer ? requireCustomer(customer, request.customerHash) : defaultCustomer(request.customerHash, { provider: 'crypto_credits', billingStatus: 'active' })
	const nextCustomer = normalizeCustomer({
		...currentCustomer, provider: currentCustomer.provider || 'crypto_credits', billingStatus: currentCustomer.billingStatus === 'unknown' ? 'active' : currentCustomer.billingStatus,
		availableBalanceUnits: addUnits(currentCustomer.availableBalanceUnits, creditedUnits), updatedAt: nowIso(),
	})
	const now = nowIso()
	const eventId = creditedUnits ? `credit_${request.claimId}` : null
	const nextClaim = { ...request, state: 'recorded', grantedUnits: creditedUnits, eventId, createdAt: now }
	const creditEvent = creditedUnits ? normalizeCreditEvent({
		eventId, customerHash: request.customerHash, source: request.source, amountUnits: creditedUnits, proofRef: request.proofRef,
		cumulativeGrantId: request.grantId, grantClaimId: request.claimId, cumulativeTotalUnits: request.totalUnits, claimDigest: request.claimDigest,
	}) : null
	const nextGrant = !grant || creditedUnits > 0 ? {
		grantId: request.grantId, source: request.source, sourceId: request.sourceId, customerHash: request.customerHash,
		state: 'active', totalUnits: nextTotalUnits, totalCredits: fromCreditUnits(nextTotalUnits), headClaimId: request.claimId,
		headClaimDigest: request.claimDigest, createdAt: grant?.createdAt || now, updatedAt: now,
	} : grant
	const nextProof = { grantClaimId: request.claimId, grantId: request.grantId, claimDigest: request.claimDigest }
	return {
		writes: { grant: nextGrant, claim: nextClaim, proof: nextProof, customer: nextCustomer, creditEvent },
		result: { grant: nextGrant, claim: nextClaim, creditEvent, customer: nextCustomer, creditedUnits, creditedCredits: fromCreditUnits(creditedUnits), totalUnits: nextTotalUnits, totalCredits: fromCreditUnits(nextTotalUnits), idempotent: creditedUnits === 0 },
	}
}

function requireCustomer(customer, customerHash) {
	if (!customer || customer.customerHash !== customerHash) {
		throw new BillingLedgerError('BILLING_CUSTOMER_NOT_FOUND', 'The customer for this ledger obligation is missing.')
	}
	return normalizeCustomer(customer)
}

function usageEventForCommit(input, reservation, amountUnits) {
	const supplied = input.usageEvent || {}
	const eventId = input.usageEventId || supplied.eventId || supplied.event_id || reservation.usageEventId || `usage_${hashPayload({ reservationId: reservation.reservationId }).slice(0, 32)}`
	if (input.usageEventId && (supplied.eventId || supplied.event_id) && input.usageEventId !== (supplied.eventId || supplied.event_id)) throw idempotencyConflict('usage event', eventId)
	if (reservation.usageEventId && reservation.usageEventId !== eventId) throw idempotencyConflict('reservation commit', reservation.reservationId)
	for (const field of ['customerHash', 'reservationId', 'operationId', 'sessionHash', 'deckHash']) {
		if (supplied[field] !== undefined && String(supplied[field] || '') !== String(reservation[field] || '')) throw idempotencyConflict('usage event', eventId)
	}
	if (supplied.amountUnits !== undefined && creditUnits(supplied.amountUnits) !== amountUnits) throw idempotencyConflict('usage event', eventId)
	if ((supplied.amountCredits !== undefined || supplied.amount !== undefined) && toCreditUnits(supplied.amountCredits ?? supplied.amount) !== amountUnits) throw idempotencyConflict('usage event', eventId)
	return normalizeUsageEvent({
		...supplied,
		eventId,
		reservationId: reservation.reservationId,
		customerHash: reservation.customerHash,
		operationId: reservation.operationId,
		sessionHash: reservation.sessionHash,
		deckHash: reservation.deckHash,
		amountUnits,
	})
}

function sameUsageEvent(existing, event) {
	return ['eventId', 'customerHash', 'reservationId', 'operationId', 'sessionHash', 'deckHash', 'eventName']
		.every(field => String(existing[field] || '') === String(event[field] || '')) &&
		creditUnits(existing.amountUnits) === event.amountUnits &&
		hashPayload(existing.metadata || {}) === hashPayload(event.metadata || {})
}

function assertUsageBinding(event, reservation) {
	if (!reservation || reservation.state !== 'committed' || reservation.customerHash !== event.customerHash ||
		reservation.usageEventId !== event.eventId || reservation.reservationId !== event.reservationId ||
		creditUnits(reservation.committedAmountUnits ?? reservation.amountUnits) !== creditUnits(event.amountUnits) ||
		creditUnits(event.amountUnits) > creditUnits(reservation.amountUnits) ||
		['operationId', 'sessionHash', 'deckHash'].some(field => event[field] && event[field] !== reservation[field])) {
		throw new BillingLedgerError('BILLING_USAGE_BINDING_INVALID', 'Usage must belong to its committed reservation and amount.')
	}
}

function usagePatch(patch, allowed) {
	const clean = sanitizeRecord(patch)
	for (const key of Object.keys(clean)) {
		if (!allowed.includes(key)) throw new BillingLedgerError('BILLING_USAGE_PATCH_FORBIDDEN', 'Usage identity, amount and state cannot be patched.')
	}
	return clean
}

function failedUsageEvent(event, patch) {
	const clean = usagePatch(patch, ['lastIngestErrorCode', 'lastIngestErrorMessage', 'nextRetryAt'])
	if (event.state === 'ingested') return null
	if (event.state !== 'queued') throw new BillingLedgerError('BILLING_USAGE_STATE_INVALID', 'Only queued usage can be retried.')
	const now = nowIso()
	return { ...event, ...clean, ingestAttemptCount: addUnits(event.ingestAttemptCount ?? 0, 1), lastIngestAttemptAt: now, updatedAt: now }
}

function settledUsage(event, customer, patch) {
	const clean = usagePatch(patch, ['settledBy', 'settledAt', 'providerResponse', 'providerEventId'])
	if (event.state !== 'queued') throw new BillingLedgerError('BILLING_USAGE_STATE_INVALID', 'Only queued usage can be settled.')
	const amountUnits = creditUnits(event.amountUnits)
	const now = nowIso()
	const nextCustomer = normalizeCustomer({
		...customer,
		availableBalanceUnits: subtractUnits(customer.availableBalanceUnits, amountUnits),
		queuedUsageUnits: subtractUnits(customer.queuedUsageUnits, amountUnits),
		updatedAt: now,
	})
	return { customer: nextCustomer, usageEvent: { ...event, ...clean, state: 'ingested', ingestedAt: now, updatedAt: now } }
}

let firestoreClientPromise = null
async function getFirestoreClient() {
	if (!firestoreClientPromise) {
		firestoreClientPromise = import('@google-cloud/firestore')
			.then(({ Firestore }) => new Firestore({
				projectId: process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined,
				databaseId: process.env.BETTERPPTX_FIRESTORE_DATABASE || undefined,
			}))
			.catch(err => {
				throw new BillingLedgerConfigError(
					'FIRESTORE_CLIENT_UNAVAILABLE',
					'Firestore billing ledger requires @google-cloud/firestore and application-default/workload-identity credentials.',
					{ reason: err?.message || String(err) },
				)
			})
	}
	return firestoreClientPromise
}

function createFirestoreBillingLedgerStore({ firestoreClient } = {}) {
	const provider = 'firestore'
	const prefix = collectionPrefix()

	async function refs() {
		const db = firestoreClient || await getFirestoreClient()
		return {
			db,
			customers: db.collection(`${prefix}_customers`),
			sessions: db.collection(`${prefix}_sessions`),
			decks: db.collection(`${prefix}_decks`),
			operations: db.collection(`${prefix}_operations`),
			reservations: db.collection(`${prefix}_reservations`),
			usageEvents: db.collection(`${prefix}_usage_events`),
			creditEvents: db.collection(`${prefix}_credit_events`),
			creditProofs: db.collection(`${prefix}_credit_proofs`),
			creditGrants: db.collection(`${prefix}_credit_grants`),
			creditGrantClaims: db.collection(`${prefix}_credit_grant_claims`),
			webhookEvents: db.collection(`${prefix}_webhook_events`),
			rateCards: db.collection(`${prefix}_rate_cards`),
		}
	}

	async function getCustomer(customerHash) {
		const r = await refs()
		const snap = await meteredFirestoreGet(r.customers.doc(String(customerHash)))
		return snap.exists ? requireCustomer(snap.data(), String(customerHash)) : null
	}

	async function upsertCustomer(customerHash, patch = {}) {
		const r = await refs()
		const ref = r.customers.doc(String(customerHash))
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const snap = await tx.get(ref)
			const existing = snap.exists ? snap.data() || {} : {}
			const next = normalizeCustomer(mergedCustomerRecord(customerHash, existing, patch, existing.createdAt || nowIso()))
			tx.set(ref, next)
			return next
		})
	}

	async function creditCustomer(input = {}) {
		if (input.cumulativeGrantId !== undefined || input.grantClaimId !== undefined) throw new BillingLedgerError('BILLING_CUMULATIVE_METHOD_REQUIRED', 'Cumulative grants require the cumulative ledger transaction.')
		const creditEvent = normalizeCreditEvent(input)
		const r = await refs()
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const customerRef = r.customers.doc(creditEvent.customerHash)
			const eventRef = r.creditEvents.doc(creditEvent.eventId)
			const proofRef = r.creditProofs.doc(creditEvent.proofIdentityHash)
			const [customerSnap, eventSnap, proofSnap] = await Promise.all([tx.get(customerRef), tx.get(eventRef), tx.get(proofRef)])
			const cumulativeGrantId = cumulativeGrantForLegacyCredit(creditEvent)
			if (cumulativeGrantId && (await tx.get(r.creditGrants.doc(cumulativeGrantId))).exists) throw new BillingLedgerError('BILLING_CUMULATIVE_METHOD_REQUIRED', 'This funding source uses cumulative ledger accounting.')
			if (proofSnap.exists && proofSnap.data().grantClaimId) throw idempotencyConflict('credit proof', creditEvent.eventId)
			let existingEvent = eventSnap.exists ? eventSnap.data() || {} : null
			if (existingEvent && !sameCreditEvent(existingEvent, creditEvent)) throw idempotencyConflict('credit event', creditEvent.eventId)
			if (proofSnap.exists && !eventSnap.exists && proofSnap.data().eventId === creditEvent.eventId) throw new BillingLedgerError('BILLING_CREDIT_HISTORY_MISSING', 'Permanent credit history is missing.')
			if (proofSnap.exists && proofSnap.data().eventId !== creditEvent.eventId) {
				const prior = await tx.get(r.creditEvents.doc(proofSnap.data().eventId))
				if (!prior.exists) throw new BillingLedgerError('BILLING_CREDIT_HISTORY_MISSING', 'Permanent credit history is missing.')
				existingEvent = prior.data()
			}
			if (!existingEvent && !proofSnap.exists) {
				// Lazily bind legacy proofs too, without rewriting credited history.
				const legacyQuery = Object.keys(creditEvent.proofRef).length
					? r.creditEvents.where('source', '==', creditEvent.source).where('proofRef', '==', creditEvent.proofRef)
					: r.creditEvents.where('proofHash', '==', creditEvent.proofHash)
				const prior = await tx.get(legacyQuery.limit(2))
				if (prior.docs.length > 1) throw idempotencyConflict('credit proof', creditEvent.eventId)
				if (prior.docs.length) existingEvent = prior.docs[0].data()
			}
			const customer = customerSnap.exists ? requireCustomer(customerSnap.data(), creditEvent.customerHash) : defaultCustomer(creditEvent.customerHash, {
				provider: 'crypto_credits',
				billingStatus: 'active',
			})
			if (existingEvent) {
				if (!sameCreditEvent(existingEvent, creditEvent)) throw idempotencyConflict('credit event', creditEvent.eventId)
				requireCustomer(customerSnap.exists ? customerSnap.data() : null, creditEvent.customerHash)
				if (!proofSnap.exists) tx.set(proofRef, { eventId: existingEvent.eventId })
				return { creditEvent: existingEvent, customer, idempotent: true }
			}
			const nextCustomer = normalizeCustomer({
				...customer,
				provider: customer.provider || 'crypto_credits',
				billingStatus: customer.billingStatus === 'unknown' ? 'active' : customer.billingStatus,
				availableBalanceUnits: addUnits(customer.availableBalanceUnits, creditEvent.amountUnits),
				lastKnownProviderAvailableBalanceUnits: addUnits(customer.availableBalanceUnits, creditEvent.amountUnits),
				updatedAt: nowIso(),
			})
			tx.set(customerRef, nextCustomer, { merge: true })
			tx.set(eventRef, creditEvent)
			tx.set(proofRef, { eventId: creditEvent.eventId })
			return { creditEvent, customer: nextCustomer, idempotent: false }
		})
	}

	async function creditCustomerCumulative(input = {}) {
		const request = normalizeCumulativeCredit(input)
		const r = await refs()
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const customerRef = r.customers.doc(request.customerHash)
			const grantRef = r.creditGrants.doc(request.grantId)
			const claimRef = r.creditGrantClaims.doc(request.claimId)
			const proofRef = r.creditProofs.doc(request.proofDigest)
			const [customerSnap, grantSnap, claimSnap, proofSnap] = await Promise.all([tx.get(customerRef), tx.get(grantRef), tx.get(claimRef), tx.get(proofRef)])
			const grant = grantSnap.exists ? grantSnap.data() : null
			const claim = claimSnap.exists ? claimSnap.data() : null
			if (!grant) {
				const history = await tx.get(r.creditGrantClaims.where('grantId', '==', request.grantId).limit(1))
				if (history.docs.length) throw cumulativeHistoryMissing()
				const orderId = legacyCumulativeOrderId(request)
				if (orderId !== null) {
					const legacy = await tx.get(r.creditEvents.where('source', '==', request.source).where('proofRef.orderId', '==', orderId).limit(1))
					if (legacy.docs.length) throw legacyCumulativeReconciliationRequired()
				}
			}
			if (!claim && !proofSnap.exists) {
				const legacyProof = await tx.get(r.creditEvents.where('source', '==', request.source).where('proofRef', '==', request.proofRef).limit(1))
				if (legacyProof.docs.length) throw legacyCumulativeReconciliationRequired()
			}
			const readRecord = async ref => { const snap = await tx.get(ref); return snap.exists ? snap.data() : null }
			const headClaim = grant ? (grant.headClaimId === claim?.claimId ? claim : await readRecord(r.creditGrantClaims.doc(grant.headClaimId))) : null
			const headEvent = headClaim?.eventId ? await readRecord(r.creditEvents.doc(headClaim.eventId)) : null
			const claimEvent = claim?.eventId ? (claim.eventId === headEvent?.eventId ? headEvent : await readRecord(r.creditEvents.doc(claim.eventId))) : null
			const eventCollision = !claim ? await readRecord(r.creditEvents.doc(`credit_${request.claimId}`)) : null
			const change = cumulativeCreditChange(request, {
				grant, claim, proof: proofSnap.exists ? proofSnap.data() : null, customer: customerSnap.exists ? customerSnap.data() : null,
				headClaim, headEvent, claimEvent, eventCollision,
			})
			if (change.writes) {
				tx.set(customerRef, change.writes.customer)
				tx.set(grantRef, change.writes.grant)
				tx.set(claimRef, change.writes.claim)
				tx.set(proofRef, change.writes.proof)
				if (change.writes.creditEvent) tx.set(r.creditEvents.doc(change.writes.creditEvent.eventId), change.writes.creditEvent)
			}
			return change.result
		})
	}

	async function recordSession(sessionHash, patch = {}) {
		const r = await refs()
		const ref = r.sessions.doc(String(sessionHash))
		const now = nowIso()
		const next = { ...sanitizeRecord(patch), sessionHash: String(sessionHash), updatedAt: now }
		await meteredFirestoreSet(ref, { createdAt: now, ...next }, { merge: true })
		return next
	}

	async function recordDeck(deckHash, patch = {}) {
		const r = await refs()
		const ref = r.decks.doc(String(deckHash))
		const now = nowIso()
		const next = { ...sanitizeRecord(patch), deckHash: String(deckHash), updatedAt: now }
		await meteredFirestoreSet(ref, { createdAt: now, ...next }, { merge: true })
		return next
	}

	async function recordOperation(operationId, patch = {}) {
		const r = await refs()
		const ref = r.operations.doc(String(operationId))
		const now = nowIso()
		const next = { ...sanitizeRecord(patch), operationId: String(operationId), updatedAt: now }
		await meteredFirestoreSet(ref, { createdAt: now, ...next }, { merge: true })
		return next
	}

	async function createReservation(input = {}) {
		const { reservationId, customerHash, amountUnits } = validateReservationInput(input)
		const r = await refs()
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const cRef = r.customers.doc(customerHash)
			const reservationRef = r.reservations.doc(reservationId)
			const [customerSnap, reservationSnap] = await Promise.all([tx.get(cRef), tx.get(reservationRef)])
			if (reservationSnap.exists) {
				const existing = reservationSnap.data() || {}
				if (!sameReservation(existing, { ...input, customerHash }, amountUnits)) throw idempotencyConflict('reservation', reservationId)
				return { reservation: existing, customer: requireCustomer(customerSnap.exists ? customerSnap.data() : null, customerHash), idempotent: true }
			}
			const customer = customerSnap.exists ? requireCustomer(customerSnap.data(), customerHash) : defaultCustomer(customerHash, input.customerPatch || {})
			if (customer.effectiveAvailableUnits < amountUnits) {
				throw new BillingLedgerError('INSUFFICIENT_CREDITS', 'Insufficient BetterPPTX credits for this reservation.', {
					requiredCredits: fromCreditUnits(amountUnits),
					availableCredits: customer.effectiveAvailableCredits,
					pendingCredits: customer.pendingReservedCredits,
				})
			}
			const now = nowIso()
			const nextCustomer = normalizeCustomer({
				...customer,
				pendingReservedUnits: addUnits(customer.pendingReservedUnits, amountUnits),
				updatedAt: now,
			})
			const reservation = {
				reservationId,
				customerHash,
				operationId: input.operationId || null,
				sessionHash: input.sessionHash || null,
				deckHash: input.deckHash || null,
				mode: input.mode || 'checkpoint',
				state: 'reserved',
				amountUnits,
				amountCredits: fromCreditUnits(amountUnits),
				metadata: sanitizeRecord(input.metadata || {}),
				createdAt: now,
				updatedAt: now,
			}
			tx.set(cRef, nextCustomer, { merge: true })
			tx.set(reservationRef, reservation)
			if (input.operationId) tx.set(r.operations.doc(String(input.operationId)), { operationId: String(input.operationId), customerHash, reservationId, updatedAt: now, createdAt: now }, { merge: true })
			return { reservation, customer: nextCustomer, idempotent: false }
		})
	}

	async function commitReservation(input = {}) {
		const reservationId = String(input.reservationId || '').trim()
		if (!reservationId) throw new BillingLedgerError('BILLING_RESERVATION_ID_MISSING', 'Missing billing reservation id.', {})
		const r = await refs()
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const reservationRef = r.reservations.doc(reservationId)
			const reservationSnap = await tx.get(reservationRef)
			if (!reservationSnap.exists) throw new BillingLedgerError('BILLING_RESERVATION_NOT_FOUND', 'Billing reservation was not found.', { reservationId })
			const reservation = reservationSnap.data() || {}
			const cRef = r.customers.doc(String(reservation.customerHash))
			const customerSnap = await tx.get(cRef)
			const customer = requireCustomer(customerSnap.exists ? customerSnap.data() : null, reservation.customerHash)
			const reservedUnits = creditUnits(reservation.amountUnits)
			const commit = requestedCommitUnits(input, reservedUnits)
			const amountUnits = reservation.state === 'committed' && !commit.explicit ? creditUnits(reservation.committedAmountUnits ?? reservedUnits) : commit.amountUnits
			const event = usageEventForCommit(input, reservation, amountUnits)
			const eventRef = r.usageEvents.doc(event.eventId)
			const eventSnap = await tx.get(eventRef)
			const existingEvent = eventSnap.exists ? eventSnap.data() : null
			if (existingEvent && (input.usageEvent || reservation.state !== 'committed') && !sameUsageEvent(existingEvent, event)) throw idempotencyConflict('usage event', event.eventId)
			if (reservation.state === 'committed') {
				if (commit.explicit && creditUnits(reservation.committedAmountUnits ?? reservation.amountUnits) !== commit.amountUnits) {
					throw idempotencyConflict('reservation commit', reservationId)
				}
				if (!existingEvent) throw new BillingLedgerError('BILLING_USAGE_EVENT_NOT_FOUND', 'Committed usage history is missing.')
				assertUsageBinding(existingEvent, reservation)
				return { reservation, customer, idempotent: true }
			}
			if (reservation.state !== 'reserved') throw new BillingLedgerError('BILLING_RESERVATION_NOT_RESERVED', 'Only reserved billing reservations can be committed.', { reservationId, state: reservation.state })
			const now = nowIso()
			const nextCustomer = normalizeCustomer({
				...customer,
				pendingReservedUnits: subtractUnits(customer.pendingReservedUnits, reservedUnits),
				queuedUsageUnits: addUnits(customer.queuedUsageUnits, amountUnits),
				committedUsageUnits: addUnits(customer.committedUsageUnits, amountUnits),
				updatedAt: now,
			})
			const nextReservation = {
				...reservation,
				state: 'committed',
				executionStatus: 'completed',
				committedAmountUnits: amountUnits,
				committedAmountCredits: fromCreditUnits(amountUnits),
				releasedAmountUnits: Math.max(0, reservedUnits - amountUnits),
				releasedAmountCredits: fromCreditUnits(Math.max(0, reservedUnits - amountUnits)),
				usageEventId: event.eventId,
				commitMetadata: sanitizeRecord(input.metadata || {}),
				committedAt: now,
				updatedAt: now,
			}
			tx.set(cRef, nextCustomer, { merge: true })
			tx.set(reservationRef, nextReservation, { merge: true })
			tx.set(eventRef, existingEvent || event)
			return { reservation: nextReservation, customer: nextCustomer, idempotent: false }
		})
	}

	async function releaseReservation(input = {}) {
		const reservationId = String(input.reservationId || '').trim()
		if (!reservationId) throw new BillingLedgerError('BILLING_RESERVATION_ID_MISSING', 'Missing billing reservation id.', {})
		const r = await refs()
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const reservationRef = r.reservations.doc(reservationId)
			const reservationSnap = await tx.get(reservationRef)
			if (!reservationSnap.exists) return { reservation: null, customer: null, idempotent: true }
			const reservation = reservationSnap.data() || {}
			const cRef = r.customers.doc(String(reservation.customerHash))
			const customerSnap = await tx.get(cRef)
			const customer = requireCustomer(customerSnap.exists ? customerSnap.data() : null, reservation.customerHash)
			if (reservation.state !== 'reserved') return { reservation, customer, idempotent: true }
			const amountUnits = creditUnits(reservation.amountUnits)
			const now = nowIso()
			const nextCustomer = normalizeCustomer({
				...customer,
				pendingReservedUnits: subtractUnits(customer.pendingReservedUnits, amountUnits),
				updatedAt: now,
			})
			const nextReservation = { ...reservation, state: 'released', releaseReason: input.reason || 'released', releasedAt: now, updatedAt: now }
			tx.set(cRef, nextCustomer, { merge: true })
			tx.set(reservationRef, nextReservation, { merge: true })
			return { reservation: nextReservation, customer: nextCustomer, idempotent: false }
		})
	}

	async function getReservation(reservationId) {
		const r = await refs()
		const snap = await meteredFirestoreGet(r.reservations.doc(String(reservationId)))
		return snap.exists ? snap.data() || null : null
	}

	async function markReservationUncertain({ reservationId, reason = 'outcome_unknown' } = {}) {
		if (!String(reservationId || '').trim()) throw new BillingLedgerError('BILLING_RESERVATION_ID_MISSING', 'Missing billing reservation id.')
		const r = await refs()
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const ref = r.reservations.doc(String(reservationId))
			const snap = await tx.get(ref)
			if (!snap.exists) throw new BillingLedgerError('BILLING_RESERVATION_NOT_FOUND', 'Billing reservation was not found.')
			const reservation = snap.data()
			const customerSnap = await tx.get(r.customers.doc(reservation.customerHash))
			const customer = requireCustomer(customerSnap.exists ? customerSnap.data() : null, reservation.customerHash)
			if (reservation.state !== 'reserved' || reservation.executionStatus === 'outcome_unknown') return { reservation, customer, idempotent: true }
			const now = nowIso()
			const next = { ...reservation, executionStatus: 'outcome_unknown', reconciliationReason: String(reason).slice(0, 200), uncertainAt: now, updatedAt: now }
			tx.set(ref, next)
			return { reservation: next, customer, idempotent: false }
		})
	}

	async function upsertUsageEvent(event = {}) {
		const r = await refs()
		const normalized = normalizeUsageEvent(event)
		const ref = r.usageEvents.doc(normalized.eventId)
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const snap = await tx.get(ref)
			if (snap.exists) {
				const existing = snap.data() || {}
				if (!sameUsageEvent(existing, normalized)) throw idempotencyConflict('usage event', normalized.eventId)
				return { usageEvent: existing, idempotent: true }
			}
			if (!normalized.reservationId) throw new BillingLedgerError('BILLING_USAGE_BINDING_INVALID', 'Usage requires a committed reservation.')
			const reservationSnap = await tx.get(r.reservations.doc(normalized.reservationId))
			assertUsageBinding(normalized, reservationSnap.exists ? reservationSnap.data() : null)
			tx.set(ref, normalized)
			return { usageEvent: normalized, idempotent: false }
		})
	}

	async function markUsageEventIngested(eventId, patch = {}, { settleFromAvailableBalance = true } = {}) {
		if (settleFromAvailableBalance !== true) throw new BillingLedgerError('BILLING_SETTLEMENT_DEBIT_REQUIRED', 'Ledger-authoritative usage must debit the available balance.')
		usagePatch(patch, ['settledBy', 'settledAt', 'providerResponse', 'providerEventId'])
		const r = await refs()
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const eventRef = r.usageEvents.doc(String(eventId))
			const eventSnap = await tx.get(eventRef)
			if (!eventSnap.exists) throw new BillingLedgerError('BILLING_USAGE_EVENT_NOT_FOUND', 'Usage event was not found.', { eventId })
			const event = eventSnap.data() || {}
			if (event.state === 'ingested') return { usageEvent: event, idempotent: true }
			const cRef = r.customers.doc(String(event.customerHash))
			const customerSnap = await tx.get(cRef)
			const customer = requireCustomer(customerSnap.exists ? customerSnap.data() : null, event.customerHash)
			if (!event.reservationId) throw new BillingLedgerError('BILLING_USAGE_BINDING_INVALID', 'Usage requires a committed reservation.')
			const reservationSnap = await tx.get(r.reservations.doc(event.reservationId))
			assertUsageBinding(event, reservationSnap.exists ? reservationSnap.data() : null)
			const { customer: nextCustomer, usageEvent: nextEvent } = settledUsage(event, customer, patch)
			tx.set(cRef, nextCustomer, { merge: true })
			tx.set(eventRef, nextEvent, { merge: true })
			return { usageEvent: nextEvent, customer: nextCustomer, idempotent: false }
		})
	}

	async function markUsageEventFailed(eventId, patch = {}) {
		const r = await refs()
		const eventRef = r.usageEvents.doc(String(eventId))
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const snap = await tx.get(eventRef)
			if (!snap.exists) throw new BillingLedgerError('BILLING_USAGE_EVENT_NOT_FOUND', 'Usage event was not found.', { eventId })
			const existing = snap.data() || {}
			const next = failedUsageEvent(existing, patch)
			if (!next) return { usageEvent: existing, idempotent: true }
			tx.set(eventRef, next)
			return { usageEvent: next, idempotent: false }
		})
	}

	async function listQueuedUsageEvents({ limit = 100 } = {}) {
		const r = await refs()
		const snap = await meteredFirestoreQueryGet(
			r.usageEvents.where('state', '==', 'queued').orderBy('createdAt').limit(Math.max(1, Math.min(1000, Math.floor(Number(limit) || 100)))),
		)
		return snap.docs.map(doc => doc.data())
	}

	async function recordWebhookEvent(event = {}) {
		const webhookId = String(event.webhookId || '').trim()
		if (!webhookId) throw new BillingLedgerError('BILLING_WEBHOOK_ID_MISSING', 'Missing webhook id.', {})
		const r = await refs()
		const ref = r.webhookEvents.doc(webhookId)
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const snap = await tx.get(ref)
			if (snap.exists) return { webhookEvent: snap.data() || {}, firstSeen: false }
			const now = nowIso()
			const record = { ...sanitizeRecord(event), webhookId, payloadHash: event.payloadHash || hashPayload(event.payload || {}), processed: false, createdAt: now, updatedAt: now }
			tx.set(ref, record)
			return { webhookEvent: record, firstSeen: true }
		})
	}

	async function markWebhookEventProcessed(webhookId, patch = {}) {
		const id = String(webhookId || '').trim()
		if (!id) throw new BillingLedgerError('BILLING_WEBHOOK_ID_MISSING', 'Missing webhook id.', {})
		const r = await refs()
		const ref = r.webhookEvents.doc(id)
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const snap = await tx.get(ref)
			if (!snap.exists) throw new BillingLedgerError('BILLING_WEBHOOK_EVENT_NOT_FOUND', 'Webhook event was not found.', { webhookId: id })
			const existing = snap.data() || {}
			const next = { ...existing, ...sanitizeRecord(patch), webhookId: id, processed: true, processedAt: existing.processedAt || nowIso(), updatedAt: nowIso() }
			tx.set(ref, next, { merge: true })
			return next
		})
	}

	return {
		provider,
		shared: true,
		describe() {
			return { provider, shared: true, collectionPrefix: prefix }
		},
		getCustomer,
		upsertCustomer,
		creditCustomer,
		creditCustomerCumulative,
		recordSession,
		recordDeck,
		recordOperation,
		createReservation,
		commitReservation,
		releaseReservation,
		getReservation,
		markReservationUncertain,
		upsertUsageEvent,
		markUsageEventIngested,
		markUsageEventFailed,
		listQueuedUsageEvents,
		recordWebhookEvent,
		markWebhookEventProcessed,
	}
}

function normalizeUsageEvent(event = {}) {
	assertPermanentEvent(event)
	const eventId = String(event.eventId || event.event_id || '').trim()
	const customerHash = String(event.customerHash || '').trim()
	const amountUnits = event.amountUnits !== undefined ? creditUnits(event.amountUnits) : toCreditUnits(event.amountCredits ?? event.amount)
	assertAmountAliases(event, amountUnits)
	if (!eventId) throw new BillingLedgerError('BILLING_USAGE_EVENT_ID_MISSING', 'Missing billing usage event id.', {})
	if (!customerHash) throw new BillingLedgerError('BILLING_CUSTOMER_HASH_MISSING', 'Missing billing customer hash.', {})
	if (amountUnits <= 0) throw new BillingLedgerError('BILLING_USAGE_EVENT_AMOUNT_INVALID', 'Usage event amount must be positive.', { eventId })
	if (event.state !== undefined && event.state !== 'queued') throw new BillingLedgerError('BILLING_USAGE_STATE_INVALID', 'New usage must start queued.')
	const now = nowIso()
	return {
		...sanitizeRecord(event),
		eventId,
		customerHash,
		reservationId: event.reservationId || null,
		operationId: event.operationId || null,
		sessionHash: event.sessionHash || null,
		deckHash: event.deckHash || null,
		eventName: event.eventName || process.env.BETTERPPTX_USAGE_EVENT_NAME || 'betterpptx.usage',
		state: 'queued',
		amountUnits,
		amountCredits: fromCreditUnits(amountUnits),
		metadata: sanitizeRecord(event.metadata || {}),
		createdAt: event.createdAt || now,
		updatedAt: now,
	}
}

function localCorruption() {
	return new BillingLedgerError('BILLING_LEDGER_CORRUPT', 'Local billing history is missing, unreadable or inconsistent; explicit recovery is required.')
}

function validateLocalStore(store) {
	if (!store || Array.isArray(store)) throw localCorruption()
	if (store.version === 1) {
		if (store.creditGrants !== undefined || store.creditGrantClaims !== undefined) throw localCorruption()
		store.version = 2
		store.creditGrants = {}
		store.creditGrantClaims = {}
	}
	if (store.version !== 2) throw localCorruption()
	for (const name of Object.keys(emptyStore()).filter(key => key !== 'version')) {
		const table = store[name]
		if (!table || typeof table !== 'object' || Array.isArray(table)) throw localCorruption()
		for (const [id, row] of Object.entries(table)) {
			if (['__proto__', 'constructor', 'prototype'].includes(id) || !row || typeof row !== 'object' || Array.isArray(row)) throw localCorruption()
		}
		// Records are dictionaries, never JavaScript prototype lookups.
		Object.setPrototypeOf(table, null)
	}
	const obligations = new Map()
	for (const [id, customer] of Object.entries(store.customers)) {
		requireCustomer(customer, id)
		obligations.set(id, { pending: 0, queued: 0, committed: 0 })
	}
	for (const [id, event] of Object.entries(store.creditEvents)) {
		if (event.eventId !== id || !store.customers[event.customerHash] || creditUnits(event.amountUnits) <= 0 || event.state !== 'credited') throw localCorruption()
		if (event.cumulativeGrantId && !store.creditGrantClaims[event.grantClaimId]) throw localCorruption()
	}
	const grantTotals = new Map()
	for (const [id, grant] of Object.entries(store.creditGrants)) {
		if (id !== grant.grantId || id !== `grant_${hashPayload({ source: grant.source, sourceId: grant.sourceId })}` || !store.customers[grant.customerHash] || grant.state !== 'active') throw localCorruption()
		const head = store.creditGrantClaims[grant.headClaimId]
		if (!head || head.totalUnits !== grant.totalUnits || head.claimDigest !== grant.headClaimDigest) throw localCorruption()
		grantTotals.set(id, 0)
	}
	for (const [id, claim] of Object.entries(store.creditGrantClaims)) {
		const grant = store.creditGrants[claim.grantId]
		if (!grant || claim.claimId !== id) throw localCorruption()
		assertCumulativeClaim(claim, grant, claim.eventId ? store.creditEvents[claim.eventId] : null)
		grantTotals.set(claim.grantId, addUnits(grantTotals.get(claim.grantId), claim.grantedUnits))
	}
	for (const [id, total] of grantTotals) if (total !== store.creditGrants[id].totalUnits) throw localCorruption()
	for (const [id, reservation] of Object.entries(store.reservations)) {
		if (reservation.reservationId !== id || !store.customers[reservation.customerHash] || creditUnits(reservation.amountUnits) <= 0 ||
			!['reserved', 'committed', 'released'].includes(reservation.state)) throw localCorruption()
		const totals = obligations.get(reservation.customerHash)
		if (reservation.state === 'reserved') totals.pending = addUnits(totals.pending, reservation.amountUnits)
		if (reservation.state === 'committed') {
			const event = store.usageEvents[reservation.usageEventId]
			if (!event) throw localCorruption()
			assertUsageBinding(event, reservation)
			totals.committed = addUnits(totals.committed, event.amountUnits)
		}
	}
	for (const [id, event] of Object.entries(store.usageEvents)) {
		if (event.eventId !== id || !store.customers[event.customerHash] || creditUnits(event.amountUnits) <= 0 || !['queued', 'ingested'].includes(event.state)) throw localCorruption()
		assertUsageBinding(event, store.reservations[event.reservationId])
		if (event.state === 'queued') {
			const totals = obligations.get(event.customerHash)
			totals.queued = addUnits(totals.queued, event.amountUnits)
		}
	}
	for (const [id, totals] of obligations) {
		const customer = normalizeCustomer(store.customers[id])
		if (customer.pendingReservedUnits < totals.pending || customer.queuedUsageUnits < totals.queued || customer.committedUsageUnits < totals.committed) throw localCorruption()
	}
	return store
}

// Serialize in-process writers; an exclusive file lock also prevents two local
// processes from losing writes. A crash leaves the lock for explicit recovery.
const localStoreInstances = new Map()

function createLocalBillingLedgerStore() {
	const provider = 'local'
	const file = defaultStorePath()
	const instanceKey = process.platform === 'win32' ? file.toLowerCase() : file
	const existing = localStoreInstances.get(instanceKey)
	if (existing) return existing
	const markerFile = `${file}.initialized`
	const lockFile = `${file}.lock`
	let seenPersisted = false
	let lock = Promise.resolve()

	function load() {
		let contents
		try {
			contents = fs.readFileSync(file, 'utf8')
			seenPersisted = true
		} catch (err) {
			if (err.code === 'ENOENT' && !seenPersisted && !fs.existsSync(markerFile)) return validateLocalStore(emptyStore())
			throw localCorruption()
		}
		try {
			const parsed = JSON.parse(contents)
			const { integrityHash, ...payload } = parsed
			if (integrityHash !== undefined && integrityHash !== hashPayload(payload)) throw localCorruption()
			return validateLocalStore(parsed)
		} catch { throw localCorruption() }
	}

	function save(store = load()) {
		validateLocalStore(store)
		fs.mkdirSync(path.dirname(file), { recursive: true })
		const { integrityHash: previousIntegrity, ...payload } = clone(store)
		const persisted = { ...payload, integrityHash: hashPayload(payload) }
		const temporaryFile = `${file}.${crypto.randomUUID()}.tmp`
		let fd
		try {
			fd = fs.openSync(temporaryFile, 'wx', 0o600)
			fs.writeFileSync(fd, `${JSON.stringify(persisted, null, 2)}\n`)
			fs.fsyncSync(fd)
			fs.closeSync(fd)
			fd = undefined
			try {
				const marker = fs.openSync(markerFile, 'wx', 0o600)
				try { fs.writeFileSync(marker, 'billing-ledger-initialized-v1\n'); fs.fsyncSync(marker) }
				finally { fs.closeSync(marker) }
			} catch (err) { if (err.code !== 'EEXIST') throw err }
			fs.renameSync(temporaryFile, file)
			seenPersisted = true
			if (process.platform !== 'win32') {
				const directory = fs.openSync(path.dirname(file), 'r')
				try { fs.fsyncSync(directory) } finally { fs.closeSync(directory) }
			}
		} finally {
			if (fd !== undefined) fs.closeSync(fd)
			try { fs.unlinkSync(temporaryFile) } catch (err) { if (err.code !== 'ENOENT') throw err }
		}
	}

	async function withLock(fn) {
		const previous = lock
		let release
		lock = new Promise(resolve => { release = resolve })
		await previous
		let lockFd
		try {
			fs.mkdirSync(path.dirname(file), { recursive: true })
			try { lockFd = fs.openSync(lockFile, 'wx', 0o600) }
			catch (err) {
				if (err.code === 'EEXIST') throw new BillingLedgerError('BILLING_LEDGER_LOCKED', 'Local billing ledger is locked; retry or recover an interrupted writer.')
				throw err
			}
			return await fn(load())
		} finally {
			try { if (lockFd !== undefined) { fs.closeSync(lockFd); fs.unlinkSync(lockFile) } }
			finally { release() }
		}
	}

	function customerOrDefault(store, customerHash, patch = {}) {
		const existing = store.customers[customerHash]
		return normalizeCustomer(existing || defaultCustomer(customerHash, patch))
	}

	async function getCustomer(customerHash) {
		const store = load()
		const customer = store.customers[String(customerHash)]
		return customer ? normalizeCustomer(customer) : null
	}

	async function upsertCustomer(customerHash, patch = {}) {
		return withLock(store => {
			const existing = store.customers[String(customerHash)] || {}
			const createdAt = existing.createdAt || nowIso()
			const next = normalizeCustomer(mergedCustomerRecord(String(customerHash), existing, patch, createdAt))
			store.customers[String(customerHash)] = next
			save(store)
			return clone(next)
		})
	}

	async function creditCustomer(input = {}) {
		if (input.cumulativeGrantId !== undefined || input.grantClaimId !== undefined) throw new BillingLedgerError('BILLING_CUMULATIVE_METHOD_REQUIRED', 'Cumulative grants require the cumulative ledger transaction.')
		const creditEvent = normalizeCreditEvent(input)
		return withLock(store => {
			const cumulativeGrantId = cumulativeGrantForLegacyCredit(creditEvent)
			if (cumulativeGrantId && store.creditGrants[cumulativeGrantId]) throw new BillingLedgerError('BILLING_CUMULATIVE_METHOD_REQUIRED', 'This funding source uses cumulative ledger accounting.')
			if (Object.values(store.creditGrantClaims).some(claim => claim.proofDigest === creditEvent.proofIdentityHash)) throw idempotencyConflict('credit proof', creditEvent.eventId)
			const existingEvent = store.creditEvents[creditEvent.eventId] || Object.values(store.creditEvents).find(event => creditProofIdentity(event) === creditEvent.proofIdentityHash)
			const customer = customerOrDefault(store, creditEvent.customerHash, {
				provider: 'crypto_credits',
				billingStatus: 'active',
			})
			if (existingEvent) {
				if (!sameCreditEvent(existingEvent, creditEvent)) throw idempotencyConflict('credit event', creditEvent.eventId)
				requireCustomer(store.customers[creditEvent.customerHash], creditEvent.customerHash)
				return { creditEvent: clone(existingEvent), customer: clone(customer), idempotent: true }
			}
			const nextCustomer = normalizeCustomer({
				...customer,
				provider: customer.provider || 'crypto_credits',
				billingStatus: customer.billingStatus === 'unknown' ? 'active' : customer.billingStatus,
				availableBalanceUnits: addUnits(customer.availableBalanceUnits, creditEvent.amountUnits),
				lastKnownProviderAvailableBalanceUnits: addUnits(customer.availableBalanceUnits, creditEvent.amountUnits),
				updatedAt: nowIso(),
			})
			store.customers[creditEvent.customerHash] = nextCustomer
			store.creditEvents[creditEvent.eventId] = creditEvent
			save(store)
			return { creditEvent: clone(creditEvent), customer: clone(nextCustomer), idempotent: false }
		})
	}

	async function creditCustomerCumulative(input = {}) {
		const request = normalizeCumulativeCredit(input)
		return withLock(store => {
			const grant = store.creditGrants[request.grantId] || null
			const claim = store.creditGrantClaims[request.claimId] || null
			const proofClaim = Object.values(store.creditGrantClaims).find(row => row.proofDigest === request.proofDigest)
			const orderId = legacyCumulativeOrderId(request)
			if (!grant && orderId !== null && Object.values(store.creditEvents).some(event => event.source === request.source && event.proofRef?.orderId === orderId)) throw legacyCumulativeReconciliationRequired()
			if (!claim && !proofClaim && Object.values(store.creditEvents).some(event => creditProofIdentity(event) === request.proofDigest)) throw legacyCumulativeReconciliationRequired()
			const headClaim = grant ? store.creditGrantClaims[grant.headClaimId] : null
			const change = cumulativeCreditChange(request, {
				grant, claim, proof: proofClaim ? { grantClaimId: proofClaim.claimId, grantId: proofClaim.grantId, claimDigest: proofClaim.claimDigest } : null,
				customer: store.customers[request.customerHash], headClaim, headEvent: headClaim?.eventId ? store.creditEvents[headClaim.eventId] : null,
				claimEvent: claim?.eventId ? store.creditEvents[claim.eventId] : null, eventCollision: !claim ? store.creditEvents[`credit_${request.claimId}`] : null,
			})
			if (change.writes) {
				store.customers[request.customerHash] = change.writes.customer
				store.creditGrants[request.grantId] = change.writes.grant
				store.creditGrantClaims[request.claimId] = change.writes.claim
				if (change.writes.creditEvent) store.creditEvents[change.writes.creditEvent.eventId] = change.writes.creditEvent
				save(store)
			}
			return clone(change.result)
		})
	}

	async function recordSession(sessionHash, patch = {}) {
		return withLock(store => {
			const id = String(sessionHash)
			const existing = store.sessions[id] || {}
			const next = { ...existing, ...sanitizeRecord(patch), sessionHash: id, createdAt: existing.createdAt || nowIso(), updatedAt: nowIso() }
			store.sessions[id] = next
			save(store)
			return clone(next)
		})
	}

	async function recordDeck(deckHash, patch = {}) {
		return withLock(store => {
			const id = String(deckHash)
			const existing = store.decks[id] || {}
			const next = { ...existing, ...sanitizeRecord(patch), deckHash: id, createdAt: existing.createdAt || nowIso(), updatedAt: nowIso() }
			store.decks[id] = next
			save(store)
			return clone(next)
		})
	}

	async function recordOperation(operationId, patch = {}) {
		return withLock(store => {
			const id = String(operationId)
			const existing = store.operations[id] || {}
			const next = { ...existing, ...sanitizeRecord(patch), operationId: id, createdAt: existing.createdAt || nowIso(), updatedAt: nowIso() }
			store.operations[id] = next
			save(store)
			return clone(next)
		})
	}

	async function createReservation(input = {}) {
		const { reservationId, customerHash, amountUnits } = validateReservationInput(input)
		return withLock(store => {
			const existing = store.reservations[reservationId]
			if (existing) {
				if (!sameReservation(existing, { ...input, customerHash }, amountUnits)) throw idempotencyConflict('reservation', reservationId)
				return { reservation: clone(existing), customer: clone(customerOrDefault(store, customerHash)), idempotent: true }
			}
			const customer = customerOrDefault(store, customerHash, input.customerPatch || {})
			if (customer.effectiveAvailableUnits < amountUnits) {
				throw new BillingLedgerError('INSUFFICIENT_CREDITS', 'Insufficient BetterPPTX credits for this reservation.', {
					requiredCredits: fromCreditUnits(amountUnits),
					availableCredits: customer.effectiveAvailableCredits,
					pendingCredits: customer.pendingReservedCredits,
				})
			}
			const now = nowIso()
			const nextCustomer = normalizeCustomer({
				...customer,
				pendingReservedUnits: addUnits(customer.pendingReservedUnits, amountUnits),
				updatedAt: now,
			})
			const reservation = {
				reservationId,
				customerHash,
				operationId: input.operationId || null,
				sessionHash: input.sessionHash || null,
				deckHash: input.deckHash || null,
				mode: input.mode || 'checkpoint',
				state: 'reserved',
				amountUnits,
				amountCredits: fromCreditUnits(amountUnits),
				metadata: sanitizeRecord(input.metadata || {}),
				createdAt: now,
				updatedAt: now,
			}
			store.customers[customerHash] = nextCustomer
			store.reservations[reservationId] = reservation
			if (input.operationId) {
				const op = store.operations[String(input.operationId)] || {}
				store.operations[String(input.operationId)] = { ...op, operationId: String(input.operationId), customerHash, reservationId, createdAt: op.createdAt || now, updatedAt: now }
			}
			save(store)
			return { reservation: clone(reservation), customer: clone(nextCustomer), idempotent: false }
		})
	}

	async function commitReservation(input = {}) {
		const reservationId = String(input.reservationId || '').trim()
		if (!reservationId) throw new BillingLedgerError('BILLING_RESERVATION_ID_MISSING', 'Missing billing reservation id.', {})
		return withLock(store => {
			const reservation = store.reservations[reservationId]
			if (!reservation) throw new BillingLedgerError('BILLING_RESERVATION_NOT_FOUND', 'Billing reservation was not found.', { reservationId })
			const customer = requireCustomer(store.customers[reservation.customerHash], reservation.customerHash)
			const reservedUnits = creditUnits(reservation.amountUnits)
			const commit = requestedCommitUnits(input, reservedUnits)
			const amountUnits = reservation.state === 'committed' && !commit.explicit ? creditUnits(reservation.committedAmountUnits ?? reservedUnits) : commit.amountUnits
			const event = usageEventForCommit(input, reservation, amountUnits)
			const existingEvent = store.usageEvents[event.eventId]
			if (existingEvent && (input.usageEvent || reservation.state !== 'committed') && !sameUsageEvent(existingEvent, event)) throw idempotencyConflict('usage event', event.eventId)
			if (reservation.state === 'committed') {
				if (commit.explicit && creditUnits(reservation.committedAmountUnits ?? reservation.amountUnits) !== commit.amountUnits) {
					throw idempotencyConflict('reservation commit', reservationId)
				}
				if (!existingEvent) throw new BillingLedgerError('BILLING_USAGE_EVENT_NOT_FOUND', 'Committed usage history is missing.')
				assertUsageBinding(existingEvent, reservation)
				return { reservation: clone(reservation), customer: clone(customer), idempotent: true }
			}
			if (reservation.state !== 'reserved') throw new BillingLedgerError('BILLING_RESERVATION_NOT_RESERVED', 'Only reserved billing reservations can be committed.', { reservationId, state: reservation.state })
			const now = nowIso()
			const nextCustomer = normalizeCustomer({
				...customer,
				pendingReservedUnits: subtractUnits(customer.pendingReservedUnits, reservedUnits),
				queuedUsageUnits: addUnits(customer.queuedUsageUnits, amountUnits),
				committedUsageUnits: addUnits(customer.committedUsageUnits, amountUnits),
				updatedAt: now,
			})
			const nextReservation = {
				...reservation,
				state: 'committed',
				executionStatus: 'completed',
				committedAmountUnits: amountUnits,
				committedAmountCredits: fromCreditUnits(amountUnits),
				releasedAmountUnits: Math.max(0, reservedUnits - amountUnits),
				releasedAmountCredits: fromCreditUnits(Math.max(0, reservedUnits - amountUnits)),
				usageEventId: event.eventId,
				commitMetadata: sanitizeRecord(input.metadata || {}),
				committedAt: now,
				updatedAt: now,
			}
			store.customers[reservation.customerHash] = nextCustomer
			store.reservations[reservationId] = nextReservation
			store.usageEvents[event.eventId] = existingEvent || event
			save(store)
			return { reservation: clone(nextReservation), customer: clone(nextCustomer), idempotent: false }
		})
	}

	async function releaseReservation(input = {}) {
		const reservationId = String(input.reservationId || '').trim()
		if (!reservationId) throw new BillingLedgerError('BILLING_RESERVATION_ID_MISSING', 'Missing billing reservation id.', {})
		return withLock(store => {
			const reservation = store.reservations[reservationId]
			if (!reservation) return { reservation: null, customer: null, idempotent: true }
			const customer = requireCustomer(store.customers[reservation.customerHash], reservation.customerHash)
			if (reservation.state !== 'reserved') return { reservation: clone(reservation), customer: clone(customer), idempotent: true }
			const amountUnits = creditUnits(reservation.amountUnits)
			const now = nowIso()
			const nextCustomer = normalizeCustomer({
				...customer,
				pendingReservedUnits: subtractUnits(customer.pendingReservedUnits, amountUnits),
				updatedAt: now,
			})
			const nextReservation = { ...reservation, state: 'released', releaseReason: input.reason || 'released', releasedAt: now, updatedAt: now }
			store.customers[reservation.customerHash] = nextCustomer
			store.reservations[reservationId] = nextReservation
			save(store)
			return { reservation: clone(nextReservation), customer: clone(nextCustomer), idempotent: false }
		})
	}

	async function getReservation(reservationId) {
		return clone(load().reservations[String(reservationId)] || null)
	}

	async function markReservationUncertain({ reservationId, reason = 'outcome_unknown' } = {}) {
		if (!String(reservationId || '').trim()) throw new BillingLedgerError('BILLING_RESERVATION_ID_MISSING', 'Missing billing reservation id.')
		return withLock(store => {
			const reservation = store.reservations[String(reservationId)]
			if (!reservation) throw new BillingLedgerError('BILLING_RESERVATION_NOT_FOUND', 'Billing reservation was not found.')
			const customer = requireCustomer(store.customers[reservation.customerHash], reservation.customerHash)
			if (reservation.state !== 'reserved' || reservation.executionStatus === 'outcome_unknown') return { reservation: clone(reservation), customer, idempotent: true }
			const now = nowIso()
			const next = { ...reservation, executionStatus: 'outcome_unknown', reconciliationReason: String(reason).slice(0, 200), uncertainAt: now, updatedAt: now }
			store.reservations[String(reservationId)] = next
			save(store)
			return { reservation: clone(next), customer, idempotent: false }
		})
	}

	async function upsertUsageEvent(event = {}) {
		const normalized = normalizeUsageEvent(event)
		return withLock(store => {
			const existing = store.usageEvents[normalized.eventId]
			if (existing) {
				if (!sameUsageEvent(existing, normalized)) throw idempotencyConflict('usage event', normalized.eventId)
				return { usageEvent: clone(existing), idempotent: true }
			}
			assertUsageBinding(normalized, store.reservations[normalized.reservationId])
			store.usageEvents[normalized.eventId] = normalized
			save(store)
			return { usageEvent: clone(normalized), idempotent: false }
		})
	}

	async function markUsageEventIngested(eventId, patch = {}, { settleFromAvailableBalance = true } = {}) {
		if (settleFromAvailableBalance !== true) throw new BillingLedgerError('BILLING_SETTLEMENT_DEBIT_REQUIRED', 'Ledger-authoritative usage must debit the available balance.')
		usagePatch(patch, ['settledBy', 'settledAt', 'providerResponse', 'providerEventId'])
		return withLock(store => {
			const event = store.usageEvents[String(eventId)]
			if (!event) throw new BillingLedgerError('BILLING_USAGE_EVENT_NOT_FOUND', 'Usage event was not found.', { eventId })
			if (event.state === 'ingested') return { usageEvent: clone(event), idempotent: true }
			const customer = requireCustomer(store.customers[event.customerHash], event.customerHash)
			assertUsageBinding(event, store.reservations[event.reservationId])
			const { customer: nextCustomer, usageEvent: nextEvent } = settledUsage(event, customer, patch)
			store.customers[event.customerHash] = nextCustomer
			store.usageEvents[String(eventId)] = nextEvent
			save(store)
			return { usageEvent: clone(nextEvent), customer: clone(nextCustomer), idempotent: false }
		})
	}

	async function markUsageEventFailed(eventId, patch = {}) {
		return withLock(store => {
			const event = store.usageEvents[String(eventId)]
			if (!event) throw new BillingLedgerError('BILLING_USAGE_EVENT_NOT_FOUND', 'Usage event was not found.', { eventId })
			const next = failedUsageEvent(event, patch)
			if (!next) return { usageEvent: clone(event), idempotent: true }
			store.usageEvents[String(eventId)] = next
			save(store)
			return { usageEvent: clone(next), idempotent: false }
		})
	}

	async function listQueuedUsageEvents({ limit = 100 } = {}) {
		const max = Math.max(1, Math.min(1000, Math.floor(Number(limit) || 100)))
		return Object.values(load().usageEvents)
			.filter(event => event.state === 'queued')
			.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
			.slice(0, max)
			.map(clone)
	}

	async function recordWebhookEvent(event = {}) {
		const webhookId = String(event.webhookId || '').trim()
		if (!webhookId) throw new BillingLedgerError('BILLING_WEBHOOK_ID_MISSING', 'Missing webhook id.', {})
		return withLock(store => {
			const existing = store.webhookEvents[webhookId]
			if (existing) return { webhookEvent: clone(existing), firstSeen: false }
			const now = nowIso()
			const record = { ...sanitizeRecord(event), webhookId, payloadHash: event.payloadHash || hashPayload(event.payload || {}), processed: false, createdAt: now, updatedAt: now }
			store.webhookEvents[webhookId] = record
			save(store)
			return { webhookEvent: clone(record), firstSeen: true }
		})
	}

	async function markWebhookEventProcessed(webhookId, patch = {}) {
		const id = String(webhookId || '').trim()
		if (!id) throw new BillingLedgerError('BILLING_WEBHOOK_ID_MISSING', 'Missing webhook id.', {})
		return withLock(store => {
			const existing = store.webhookEvents[id]
			if (!existing) throw new BillingLedgerError('BILLING_WEBHOOK_EVENT_NOT_FOUND', 'Webhook event was not found.', { webhookId: id })
			const next = { ...existing, ...sanitizeRecord(patch), webhookId: id, processed: true, processedAt: existing.processedAt || nowIso(), updatedAt: nowIso() }
			store.webhookEvents[id] = next
			save(store)
			return clone(next)
		})
	}

	const instance = {
		provider,
		shared: false,
		file,
		describe() {
			return { provider, shared: false, file }
		},
		load,
		async save(snapshot) {
			return withLock(current => {
				if (!snapshot || snapshot.integrityHash !== current.integrityHash) throw new BillingLedgerError('BILLING_LEDGER_STALE_SNAPSHOT', 'A stale local snapshot cannot overwrite ledger transactions.')
				for (const table of ['customers', 'reservations', 'creditEvents', 'usageEvents', 'creditGrants', 'creditGrantClaims']) {
					if (hashPayload(snapshot[table]) !== hashPayload(current[table])) throw new BillingLedgerError('BILLING_LEDGER_DIRECT_WRITE_FORBIDDEN', 'Money and permanent billing history require ledger transactions.')
				}
				save(snapshot)
			})
		},
		getCustomer,
		upsertCustomer,
		creditCustomer,
		creditCustomerCumulative,
		recordSession,
		recordDeck,
		recordOperation,
		createReservation,
		commitReservation,
		releaseReservation,
		getReservation,
		markReservationUncertain,
		upsertUsageEvent,
		markUsageEventIngested,
		markUsageEventFailed,
		listQueuedUsageEvents,
		recordWebhookEvent,
		markWebhookEventProcessed,
	}
	localStoreInstances.set(instanceKey, instance)
	return instance
}

export function createBillingLedgerStore(options = {}) {
	const provider = providerName()
	assertSupportedProvider(provider)
	if (provider === 'firestore') return createFirestoreBillingLedgerStore(options)
	if (requireSharedStores()) {
		throw new BillingLedgerConfigError(
			'BILLING_LEDGER_NOT_SHARED',
			'Local billing ledger storage is not allowed when BETTERPPTX_REQUIRE_SHARED_STORES=1. Configure BETTERPPTX_BILLING_LEDGER_STORE=firestore before running multiple production instances.',
			{ provider },
		)
	}
	return createLocalBillingLedgerStore()
}
