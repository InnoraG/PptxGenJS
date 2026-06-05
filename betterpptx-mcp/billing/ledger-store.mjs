import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

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
	const n = Number(value)
	if (!Number.isFinite(n)) return 0
	return Math.max(0, Math.round(n * CREDIT_SCALE))
}

export function fromCreditUnits(units) {
	const n = Math.max(0, Number(units) || 0)
	return Number((n / CREDIT_SCALE).toFixed(2))
}

function creditPatchFrom(value, unitsField, creditsField) {
	if (value?.[unitsField] !== undefined) return Math.max(0, Math.round(Number(value[unitsField]) || 0))
	if (Object.prototype.hasOwnProperty.call(value || {}, creditsField)) return toCreditUnits(value[creditsField])
	return null
}

const CREDIT_UNIT_FIELDS = [
	['lastKnownDodoAvailableBalanceUnits', 'lastKnownDodoAvailableBalanceCredits'],
	['pendingReservedUnits', 'pendingReservedCredits'],
	['durableQueuedUsageUnitsNotYetReflectedByDodo', 'durableQueuedUsageCreditsNotYetReflectedByDodo'],
	['committedUsageUnits', 'committedUsageCredits'],
]

function mergedCustomerRecord(customerHash, existing = {}, patch = {}, createdAt = nowIso()) {
	const cleanPatch = sanitizeRecord(patch)
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
	const out = {}
	for (const key of Object.keys(value).sort()) out[key] = stableForHash(value[key])
	return out
}

function sanitizeRecord(value) {
	if (!value || typeof value !== 'object') return value
	if (Array.isArray(value)) return value.map(sanitizeRecord)
	const out = {}
	for (const [key, item] of Object.entries(value)) {
		if (SECRETISH_FIELDS.has(String(key).toLowerCase())) continue
		out[key] = sanitizeRecord(item)
	}
	return out
}

function emptyStore() {
	return {
		version: 1,
		customers: {},
		sessions: {},
		decks: {},
		operations: {},
		reservations: {},
		usageEvents: {},
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
	const lastKnownUnits = creditPatchFrom(input, 'lastKnownDodoAvailableBalanceUnits', 'lastKnownDodoAvailableBalanceCredits')
	const pendingUnits = creditPatchFrom(input, 'pendingReservedUnits', 'pendingReservedCredits')
	const queuedUnits = creditPatchFrom(input, 'durableQueuedUsageUnitsNotYetReflectedByDodo', 'durableQueuedUsageCreditsNotYetReflectedByDodo')
	const committedUnits = creditPatchFrom(input, 'committedUsageUnits', 'committedUsageCredits')
	const next = {
		...sanitizeRecord(input),
		customerHash,
		lastKnownDodoAvailableBalanceUnits: lastKnownUnits ?? Math.max(0, Math.round(Number(input.lastKnownDodoAvailableBalanceUnits) || 0)),
		pendingReservedUnits: pendingUnits ?? Math.max(0, Math.round(Number(input.pendingReservedUnits) || 0)),
		durableQueuedUsageUnitsNotYetReflectedByDodo: queuedUnits ?? Math.max(0, Math.round(Number(input.durableQueuedUsageUnitsNotYetReflectedByDodo) || 0)),
		committedUsageUnits: committedUnits ?? Math.max(0, Math.round(Number(input.committedUsageUnits) || 0)),
	}
	next.lastKnownDodoAvailableBalanceCredits = fromCreditUnits(next.lastKnownDodoAvailableBalanceUnits)
	next.pendingReservedCredits = fromCreditUnits(next.pendingReservedUnits)
	next.durableQueuedUsageCreditsNotYetReflectedByDodo = fromCreditUnits(next.durableQueuedUsageUnitsNotYetReflectedByDodo)
	next.committedUsageCredits = fromCreditUnits(next.committedUsageUnits)
	next.effectiveAvailableUnits = Math.max(0, next.lastKnownDodoAvailableBalanceUnits - next.pendingReservedUnits - next.durableQueuedUsageUnitsNotYetReflectedByDodo)
	next.effectiveAvailableCredits = fromCreditUnits(next.effectiveAvailableUnits)
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
	const amountUnits = toCreditUnits(input.amountCredits ?? input.amount)
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
		Number(existing.amountUnits || 0) === amountUnits &&
		String(existing.operationId || '') === String(input.operationId || '')
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

function createFirestoreBillingLedgerStore() {
	const provider = 'firestore'
	const prefix = collectionPrefix()

	async function refs() {
		const db = await getFirestoreClient()
		return {
			db,
			customers: db.collection(`${prefix}_customers`),
			sessions: db.collection(`${prefix}_sessions`),
			decks: db.collection(`${prefix}_decks`),
			operations: db.collection(`${prefix}_operations`),
			reservations: db.collection(`${prefix}_reservations`),
			usageEvents: db.collection(`${prefix}_usage_events`),
			webhookEvents: db.collection(`${prefix}_webhook_events`),
			rateCards: db.collection(`${prefix}_rate_cards`),
		}
	}

	async function getCustomer(customerHash) {
		const r = await refs()
		const snap = await r.customers.doc(String(customerHash)).get()
		return snap.exists ? normalizeCustomer(snap.data() || {}) : null
	}

	async function upsertCustomer(customerHash, patch = {}) {
		const r = await refs()
		const ref = r.customers.doc(String(customerHash))
		const snap = await ref.get()
		const existing = snap.exists ? snap.data() || {} : {}
		const createdAt = existing.createdAt || nowIso()
		const next = normalizeCustomer(mergedCustomerRecord(customerHash, existing, patch, createdAt))
		await ref.set(next, { merge: true })
		return next
	}

	async function recordSession(sessionHash, patch = {}) {
		const r = await refs()
		const ref = r.sessions.doc(String(sessionHash))
		const now = nowIso()
		const next = { ...sanitizeRecord(patch), sessionHash: String(sessionHash), updatedAt: now }
		await ref.set({ createdAt: now, ...next }, { merge: true })
		return next
	}

	async function recordDeck(deckHash, patch = {}) {
		const r = await refs()
		const ref = r.decks.doc(String(deckHash))
		const now = nowIso()
		const next = { ...sanitizeRecord(patch), deckHash: String(deckHash), updatedAt: now }
		await ref.set({ createdAt: now, ...next }, { merge: true })
		return next
	}

	async function recordOperation(operationId, patch = {}) {
		const r = await refs()
		const ref = r.operations.doc(String(operationId))
		const now = nowIso()
		const next = { ...sanitizeRecord(patch), operationId: String(operationId), updatedAt: now }
		await ref.set({ createdAt: now, ...next }, { merge: true })
		return next
	}

	async function createReservation(input = {}) {
		const { reservationId, customerHash, amountUnits } = validateReservationInput(input)
		const r = await refs()
		return r.db.runTransaction(async tx => {
			const cRef = r.customers.doc(customerHash)
			const reservationRef = r.reservations.doc(reservationId)
			const [customerSnap, reservationSnap] = await Promise.all([tx.get(cRef), tx.get(reservationRef)])
			if (reservationSnap.exists) {
				const existing = reservationSnap.data() || {}
				if (!sameReservation(existing, { ...input, customerHash }, amountUnits)) throw idempotencyConflict('reservation', reservationId)
				return { reservation: existing, customer: normalizeCustomer(customerSnap.exists ? customerSnap.data() || {} : defaultCustomer(customerHash)), idempotent: true }
			}
			const customer = normalizeCustomer(customerSnap.exists ? customerSnap.data() || {} : defaultCustomer(customerHash, input.customerPatch || {}))
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
				pendingReservedUnits: customer.pendingReservedUnits + amountUnits,
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
		return r.db.runTransaction(async tx => {
			const reservationRef = r.reservations.doc(reservationId)
			const reservationSnap = await tx.get(reservationRef)
			if (!reservationSnap.exists) throw new BillingLedgerError('BILLING_RESERVATION_NOT_FOUND', 'Billing reservation was not found.', { reservationId })
			const reservation = reservationSnap.data() || {}
			const cRef = r.customers.doc(String(reservation.customerHash))
			const customerSnap = await tx.get(cRef)
			const customer = normalizeCustomer(customerSnap.exists ? customerSnap.data() || {} : defaultCustomer(reservation.customerHash))
			if (reservation.state === 'committed') return { reservation, customer, idempotent: true }
			if (reservation.state !== 'reserved') throw new BillingLedgerError('BILLING_RESERVATION_NOT_RESERVED', 'Only reserved billing reservations can be committed.', { reservationId, state: reservation.state })
			const amountUnits = Math.max(0, Math.round(Number(reservation.amountUnits) || 0))
			const now = nowIso()
			const nextCustomer = normalizeCustomer({
				...customer,
				pendingReservedUnits: Math.max(0, customer.pendingReservedUnits - amountUnits),
				durableQueuedUsageUnitsNotYetReflectedByDodo: customer.durableQueuedUsageUnitsNotYetReflectedByDodo + amountUnits,
				committedUsageUnits: customer.committedUsageUnits + amountUnits,
				updatedAt: now,
			})
			const nextReservation = {
				...reservation,
				state: 'committed',
				usageEventId: input.usageEventId || input.usageEvent?.eventId || reservation.usageEventId || null,
				committedAt: now,
				updatedAt: now,
			}
			tx.set(cRef, nextCustomer, { merge: true })
			tx.set(reservationRef, nextReservation, { merge: true })
			if (input.usageEvent) {
				const event = normalizeUsageEvent({ ...input.usageEvent, reservationId, customerHash: reservation.customerHash, amountUnits })
				tx.set(r.usageEvents.doc(event.eventId), event, { merge: true })
			}
			return { reservation: nextReservation, customer: nextCustomer, idempotent: false }
		})
	}

	async function releaseReservation(input = {}) {
		const reservationId = String(input.reservationId || '').trim()
		if (!reservationId) throw new BillingLedgerError('BILLING_RESERVATION_ID_MISSING', 'Missing billing reservation id.', {})
		const r = await refs()
		return r.db.runTransaction(async tx => {
			const reservationRef = r.reservations.doc(reservationId)
			const reservationSnap = await tx.get(reservationRef)
			if (!reservationSnap.exists) return { reservation: null, customer: null, idempotent: true }
			const reservation = reservationSnap.data() || {}
			const cRef = r.customers.doc(String(reservation.customerHash))
			const customerSnap = await tx.get(cRef)
			const customer = normalizeCustomer(customerSnap.exists ? customerSnap.data() || {} : defaultCustomer(reservation.customerHash))
			if (reservation.state !== 'reserved') return { reservation, customer, idempotent: true }
			const amountUnits = Math.max(0, Math.round(Number(reservation.amountUnits) || 0))
			const now = nowIso()
			const nextCustomer = normalizeCustomer({
				...customer,
				pendingReservedUnits: Math.max(0, customer.pendingReservedUnits - amountUnits),
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
		const snap = await r.reservations.doc(String(reservationId)).get()
		return snap.exists ? snap.data() || null : null
	}

	async function upsertUsageEvent(event = {}) {
		const r = await refs()
		const normalized = normalizeUsageEvent(event)
		const ref = r.usageEvents.doc(normalized.eventId)
		return r.db.runTransaction(async tx => {
			const snap = await tx.get(ref)
			if (snap.exists) {
				const existing = snap.data() || {}
				if (Number(existing.amountUnits || 0) !== normalized.amountUnits || String(existing.customerHash || '') !== normalized.customerHash) throw idempotencyConflict('usage event', normalized.eventId)
				return { usageEvent: existing, idempotent: true }
			}
			tx.set(ref, normalized)
			return { usageEvent: normalized, idempotent: false }
		})
	}

	async function markUsageEventIngested(eventId, patch = {}) {
		const r = await refs()
		return r.db.runTransaction(async tx => {
			const eventRef = r.usageEvents.doc(String(eventId))
			const eventSnap = await tx.get(eventRef)
			if (!eventSnap.exists) throw new BillingLedgerError('BILLING_USAGE_EVENT_NOT_FOUND', 'Usage event was not found.', { eventId })
			const event = eventSnap.data() || {}
			if (event.state === 'ingested') return { usageEvent: event, idempotent: true }
			const cRef = r.customers.doc(String(event.customerHash))
			const customerSnap = await tx.get(cRef)
			const customer = normalizeCustomer(customerSnap.exists ? customerSnap.data() || {} : defaultCustomer(event.customerHash))
			const amountUnits = Math.max(0, Math.round(Number(event.amountUnits) || 0))
			const now = nowIso()
			const nextCustomer = normalizeCustomer({
				...customer,
				durableQueuedUsageUnitsNotYetReflectedByDodo: Math.max(0, customer.durableQueuedUsageUnitsNotYetReflectedByDodo - amountUnits),
				updatedAt: now,
			})
			const nextEvent = { ...event, ...sanitizeRecord(patch), state: 'ingested', ingestedAt: now, updatedAt: now }
			tx.set(cRef, nextCustomer, { merge: true })
			tx.set(eventRef, nextEvent, { merge: true })
			return { usageEvent: nextEvent, customer: nextCustomer, idempotent: false }
		})
	}

	async function markUsageEventFailed(eventId, patch = {}) {
		const r = await refs()
		const eventRef = r.usageEvents.doc(String(eventId))
		const snap = await eventRef.get()
		if (!snap.exists) throw new BillingLedgerError('BILLING_USAGE_EVENT_NOT_FOUND', 'Usage event was not found.', { eventId })
		const existing = snap.data() || {}
		const now = nowIso()
		const next = {
			...existing,
			...sanitizeRecord(patch),
			state: 'queued',
			ingestAttemptCount: Math.max(0, Number(existing.ingestAttemptCount) || 0) + 1,
			lastIngestAttemptAt: now,
			updatedAt: now,
		}
		await eventRef.set(next, { merge: true })
		return { usageEvent: next, idempotent: false }
	}

	async function listQueuedUsageEvents({ limit = 100 } = {}) {
		const r = await refs()
		const snap = await r.usageEvents.where('state', '==', 'queued').orderBy('createdAt').limit(Math.max(1, Math.min(1000, Number(limit) || 100))).get()
		return snap.docs.map(doc => doc.data())
	}

	async function recordWebhookEvent(event = {}) {
		const webhookId = String(event.webhookId || '').trim()
		if (!webhookId) throw new BillingLedgerError('BILLING_WEBHOOK_ID_MISSING', 'Missing webhook id.', {})
		const r = await refs()
		const ref = r.webhookEvents.doc(webhookId)
		return r.db.runTransaction(async tx => {
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
		return r.db.runTransaction(async tx => {
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
		recordSession,
		recordDeck,
		recordOperation,
		createReservation,
		commitReservation,
		releaseReservation,
		getReservation,
		upsertUsageEvent,
		markUsageEventIngested,
		markUsageEventFailed,
		listQueuedUsageEvents,
		recordWebhookEvent,
		markWebhookEventProcessed,
	}
}

function normalizeUsageEvent(event = {}) {
	const eventId = String(event.eventId || event.event_id || '').trim()
	const customerHash = String(event.customerHash || '').trim()
	const amountUnits = event.amountUnits !== undefined ? Math.max(0, Math.round(Number(event.amountUnits) || 0)) : toCreditUnits(event.amountCredits ?? event.amount)
	if (!eventId) throw new BillingLedgerError('BILLING_USAGE_EVENT_ID_MISSING', 'Missing billing usage event id.', {})
	if (!customerHash) throw new BillingLedgerError('BILLING_CUSTOMER_HASH_MISSING', 'Missing billing customer hash.', {})
	if (amountUnits <= 0) throw new BillingLedgerError('BILLING_USAGE_EVENT_AMOUNT_INVALID', 'Usage event amount must be positive.', { eventId })
	const now = nowIso()
	return {
		...sanitizeRecord(event),
		eventId,
		customerHash,
		reservationId: event.reservationId || null,
		operationId: event.operationId || null,
		sessionHash: event.sessionHash || null,
		deckHash: event.deckHash || null,
		eventName: event.eventName || process.env.BETTERPPTX_DODO_USAGE_EVENT_NAME || 'betterpptx.usage',
		state: event.state || 'queued',
		amountUnits,
		amountCredits: fromCreditUnits(amountUnits),
		metadata: sanitizeRecord(event.metadata || {}),
		createdAt: event.createdAt || now,
		updatedAt: now,
	}
}

function createLocalBillingLedgerStore() {
	const provider = 'local'
	const file = defaultStorePath()
	let cached = null
	let lock = Promise.resolve()

	function load() {
		if (cached) return cached
		try {
			if (fs.existsSync(file)) {
				const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
				cached = { ...emptyStore(), ...parsed }
				return cached
			}
		} catch {}
		cached = emptyStore()
		return cached
	}

	function save(store = load()) {
		fs.mkdirSync(path.dirname(file), { recursive: true })
		fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 })
	}

	async function withLock(fn) {
		const previous = lock
		let release
		lock = new Promise(resolve => { release = resolve })
		await previous
		try { return await fn(load()) }
		finally { release() }
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
				pendingReservedUnits: customer.pendingReservedUnits + amountUnits,
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
			const customer = customerOrDefault(store, reservation.customerHash)
			if (reservation.state === 'committed') return { reservation: clone(reservation), customer: clone(customer), idempotent: true }
			if (reservation.state !== 'reserved') throw new BillingLedgerError('BILLING_RESERVATION_NOT_RESERVED', 'Only reserved billing reservations can be committed.', { reservationId, state: reservation.state })
			const amountUnits = Math.max(0, Math.round(Number(reservation.amountUnits) || 0))
			const now = nowIso()
			const nextCustomer = normalizeCustomer({
				...customer,
				pendingReservedUnits: Math.max(0, customer.pendingReservedUnits - amountUnits),
				durableQueuedUsageUnitsNotYetReflectedByDodo: customer.durableQueuedUsageUnitsNotYetReflectedByDodo + amountUnits,
				committedUsageUnits: customer.committedUsageUnits + amountUnits,
				updatedAt: now,
			})
			const nextReservation = {
				...reservation,
				state: 'committed',
				usageEventId: input.usageEventId || input.usageEvent?.eventId || reservation.usageEventId || null,
				committedAt: now,
				updatedAt: now,
			}
			store.customers[reservation.customerHash] = nextCustomer
			store.reservations[reservationId] = nextReservation
			if (input.usageEvent) {
				const event = normalizeUsageEvent({ ...input.usageEvent, reservationId, customerHash: reservation.customerHash, amountUnits })
				const existingEvent = store.usageEvents[event.eventId]
				if (existingEvent && (Number(existingEvent.amountUnits || 0) !== event.amountUnits || String(existingEvent.customerHash || '') !== event.customerHash)) throw idempotencyConflict('usage event', event.eventId)
				store.usageEvents[event.eventId] = existingEvent || event
			}
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
			const customer = customerOrDefault(store, reservation.customerHash)
			if (reservation.state !== 'reserved') return { reservation: clone(reservation), customer: clone(customer), idempotent: true }
			const amountUnits = Math.max(0, Math.round(Number(reservation.amountUnits) || 0))
			const now = nowIso()
			const nextCustomer = normalizeCustomer({
				...customer,
				pendingReservedUnits: Math.max(0, customer.pendingReservedUnits - amountUnits),
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

	async function upsertUsageEvent(event = {}) {
		const normalized = normalizeUsageEvent(event)
		return withLock(store => {
			const existing = store.usageEvents[normalized.eventId]
			if (existing) {
				if (Number(existing.amountUnits || 0) !== normalized.amountUnits || String(existing.customerHash || '') !== normalized.customerHash) throw idempotencyConflict('usage event', normalized.eventId)
				return { usageEvent: clone(existing), idempotent: true }
			}
			store.usageEvents[normalized.eventId] = normalized
			save(store)
			return { usageEvent: clone(normalized), idempotent: false }
		})
	}

	async function markUsageEventIngested(eventId, patch = {}) {
		return withLock(store => {
			const event = store.usageEvents[String(eventId)]
			if (!event) throw new BillingLedgerError('BILLING_USAGE_EVENT_NOT_FOUND', 'Usage event was not found.', { eventId })
			if (event.state === 'ingested') return { usageEvent: clone(event), idempotent: true }
			const customer = customerOrDefault(store, event.customerHash)
			const amountUnits = Math.max(0, Math.round(Number(event.amountUnits) || 0))
			const now = nowIso()
			const nextCustomer = normalizeCustomer({
				...customer,
				durableQueuedUsageUnitsNotYetReflectedByDodo: Math.max(0, customer.durableQueuedUsageUnitsNotYetReflectedByDodo - amountUnits),
				updatedAt: now,
			})
			const nextEvent = { ...event, ...sanitizeRecord(patch), state: 'ingested', ingestedAt: now, updatedAt: now }
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
			const now = nowIso()
			const next = {
				...event,
				...sanitizeRecord(patch),
				state: 'queued',
				ingestAttemptCount: Math.max(0, Number(event.ingestAttemptCount) || 0) + 1,
				lastIngestAttemptAt: now,
				updatedAt: now,
			}
			store.usageEvents[String(eventId)] = next
			save(store)
			return { usageEvent: clone(next), idempotent: false }
		})
	}

	async function listQueuedUsageEvents({ limit = 100 } = {}) {
		const max = Math.max(1, Math.min(1000, Number(limit) || 100))
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

	return {
		provider,
		shared: false,
		file,
		describe() {
			return { provider, shared: false, file }
		},
		load,
		save,
		getCustomer,
		upsertCustomer,
		recordSession,
		recordDeck,
		recordOperation,
		createReservation,
		commitReservation,
		releaseReservation,
		getReservation,
		upsertUsageEvent,
		markUsageEventIngested,
		markUsageEventFailed,
		listQueuedUsageEvents,
		recordWebhookEvent,
		markWebhookEventProcessed,
	}
}

export function createBillingLedgerStore() {
	const provider = providerName()
	assertSupportedProvider(provider)
	if (provider === 'firestore') return createFirestoreBillingLedgerStore()
	if (requireSharedStores()) {
		throw new BillingLedgerConfigError(
			'BILLING_LEDGER_NOT_SHARED',
			'Local billing ledger storage is not allowed when BETTERPPTX_REQUIRE_SHARED_STORES=1. Configure BETTERPPTX_BILLING_LEDGER_STORE=firestore before running multiple production instances.',
			{ provider },
		)
	}
	return createLocalBillingLedgerStore()
}
