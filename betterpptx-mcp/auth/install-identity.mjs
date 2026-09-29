import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { jsonPersistenceValue } from '../storage/json-persistence.mjs'

import {
	meteredFirestoreGet,
	runMeteredFirestoreTransaction,
} from '../billing/firestore-meter.mjs'

const TOKEN_PREFIX = 'bpptx_device_'
const TOKEN_PATTERN = /^bpptx_device_[A-Za-z0-9_-]{43}$/
const CONNECTOR_HASH_PREFIX = 'connector_'
const CONNECTOR_HASH_PATTERN = /^connector_[a-f0-9]{64}$/

export class InstallIdentityError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'InstallIdentityError'
		this.code = code
		this.details = details
	}
}

function installHmacSecret() {
	const secret = String(process.env.BETTERPPTX_INSTALL_HMAC_SECRET || '').trim()
	if (secret.length < 32) {
		throw new InstallIdentityError(
			'INSTALL_IDENTITY_SECRET_MISSING',
			'Install identity is not configured for this deployment.',
		)
	}
	return secret
}

export function generateInstallToken() {
	return `${TOKEN_PREFIX}${crypto.randomBytes(32).toString('base64url')}`
}

export function validateInstallToken(rawToken) {
	const token = String(rawToken || '').trim()
	if (!TOKEN_PATTERN.test(token)) {
		throw new InstallIdentityError(
			'INSTALL_IDENTITY_INVALID',
			'The device identity header is invalid.',
		)
	}
	return token
}

export function hashInstallToken(rawToken) {
	const token = validateInstallToken(rawToken)
	const digest = crypto.createHmac('sha256', installHmacSecret()).update(token).digest('hex')
	return `install_${digest}`
}

export function installIdentityFromHeaders(headers = {}) {
	const raw = headers['x-betterpptx-device'] ?? headers['X-BetterPptx-Device']
	if (Array.isArray(raw) && raw.length > 1) {
		throw new InstallIdentityError('INSTALL_IDENTITY_INVALID', 'The device identity header is invalid.')
	}
	if (raw === undefined || raw === null || String(raw).trim() === '') return null
	return { installHash: hashInstallToken(Array.isArray(raw) ? raw[0] : raw) }
}

function safeContinuityHeader(headers, name) {
	const raw = headers?.[name] ?? headers?.[name.toLowerCase()] ?? headers?.[name.toUpperCase()]
	if (Array.isArray(raw)) {
		if (raw.length !== 1) return ''
		return safeContinuityHeader({ value: raw[0] }, 'value')
	}
	const value = String(raw ?? '').trim()
	if (!value || value.length > 4096 || /[\x00-\x1f\x7f]/.test(value)) return ''
	return value
}

function connectorContinuitySecret() {
	return String(
		process.env.BETTERPPTX_CONNECTOR_CONTINUITY_SECRET
		|| process.env.BETTERPPTX_INSTALL_HMAC_SECRET
		|| process.env.BETTERPPTX_MCP_V2_STATE_SECRET
		|| process.env.BETTERPPTX_URL_SECRET
		|| '',
	).trim()
}

/**
 * Derive a server-owned continuity binding for the OpenAI web connector.
 *
 * These headers are a continuity hint, not an authentication credential. They
 * are intentionally never returned or logged. Explicit x-betterpptx-device
 * identity remains the authoritative install/quota identity when supplied.
 * The public no-auth connector uses this binding so each v2 round-trip can
 * reuse its own opaque assets, decks, and operations instead of becoming a
 * fresh anonymous owner on every request.
 */
export function connectorIdentityFromHeaders(headers = {}, { scope = '' } = {}) {
	const session = safeContinuityHeader(headers, 'x-openai-session')
	const subject = safeContinuityHeader(headers, 'x-openai-subject')
	if (!session && !subject) return null
	const material = JSON.stringify([
		'betterpptx.public-connector-continuity.v1',
		String(scope || ''),
		session,
		subject,
	])
	const secret = connectorContinuitySecret()
	const secured = secret.length >= 20
	const digest = secured
		? crypto.createHmac('sha256', secret).update(material).digest('hex')
		: crypto.createHash('sha256').update(material).digest('hex')
	return {
		resourceIdentityHash: `${CONNECTOR_HASH_PREFIX}${digest}`,
		// HMAC does not authenticate caller-controlled headers. Legacy continuity
		// remains available only for private integrations; it never grants quota.
	}
}

export function isConnectorIdentityHash(value) {
	return CONNECTOR_HASH_PATTERN.test(String(value || ''))
}

function usageProvider() {
	return String(
		process.env.BETTERPPTX_INSTALL_USAGE_STORE
		|| process.env.BETTERPPTX_ENTITLEMENT_STORE
		|| 'local',
	).trim().toLowerCase()
}

function usageFile() {
	const configured = String(process.env.BETTERPPTX_INSTALL_USAGE_FILE || '').trim()
	if (configured) return path.resolve(configured)
	const root = String(process.env.BETTERPPTX_OUT_DIR || process.env.BETTERPPTX_DOWNLOAD_ROOT || 'outputs').trim()
	return path.resolve(root, 'betterpptx-install-usage.json')
}

function usageDocumentId(installHash, date) {
	return `${String(date)}_${String(installHash)}`
}

function normalizedUsage(input = {}, installHash = '', date = '') {
	return {
		installHash: String(installHash || input.installHash || ''),
		date: String(date || input.date || ''),
		savedDecks: Math.max(0, Math.round(Number(input.savedDecks) || 0)),
		createdAt: input.createdAt || new Date().toISOString(),
		updatedAt: input.updatedAt || new Date().toISOString(),
	}
}

function rollingDocumentId(identityHash, category) {
	return `rolling_${crypto.createHash('sha256').update(`${String(category)}\0${String(identityHash)}`).digest('hex')}`
}

function reservationFingerprint(reservationId) {
	return crypto.createHash('sha256').update(String(reservationId || '')).digest('hex')
}

// Rolling allowance records use the same JSON representation in both stores.
// Optional object fields disappear; array slots stay null. Normalize the whole
// document at each write so legacy events without metadata remain writable too.
// Do not alter owner/reservation fingerprints or global provider settings.
function rollingPersistenceValue(value) {
	return jsonPersistenceValue(value, () => new InstallIdentityError('INSTALL_USAGE_PAYLOAD_INVALID', 'The allowance metadata must be JSON-compatible.'))
}

function normalizedRollingUsage(input = {}, identityHash = '', category = '', options = {}) {
	const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now()
	const windowMs = Math.max(1, Number(options.windowMs) || 30 * 24 * 60 * 60 * 1000)
	const cutoff = nowMs - windowMs
	const events = Array.isArray(input.events) ? input.events
		.filter(event => event && Number(event.committedAtMs) > cutoff)
		.map(event => ({
			reservationHash: String(event.reservationHash || ''),
			committedAtMs: Number(event.committedAtMs),
			committedAt: event.committedAt || new Date(Number(event.committedAtMs)).toISOString(),
			metadata: event.metadata && typeof event.metadata === 'object' ? event.metadata : undefined,
		})) : []
	const reservations = Array.isArray(input.reservations) ? input.reservations
		.filter(item => item && Number(item.expiresAtMs) > nowMs)
		.map(item => ({
			reservationHash: String(item.reservationHash || ''),
			reservedAtMs: Number(item.reservedAtMs),
			expiresAtMs: Number(item.expiresAtMs),
		})) : []
	return {
		identityHash: String(identityHash || input.identityHash || ''),
		category: String(category || input.category || ''),
		events,
		reservations,
		createdAt: input.createdAt || new Date(nowMs).toISOString(),
		updatedAt: new Date(nowMs).toISOString(),
	}
}

function rollingSnapshot(state, { limit, windowMs, nowMs }) {
	const used = state.events.length
	const reserved = state.reservations.length
	const oldest = state.events.reduce((min, event) => Math.min(min, event.committedAtMs), Infinity)
	return {
		category: state.category,
		limit,
		windowDays: windowMs / (24 * 60 * 60 * 1000),
		used,
		reserved,
		remaining: Math.max(0, limit - used - reserved),
		resetsAt: Number.isFinite(oldest) ? new Date(oldest + windowMs).toISOString() : null,
		asOf: new Date(nowMs).toISOString(),
	}
}

function mutateRollingUsage(input, identityHash, request = {}) {
	const nowMs = Number.isFinite(Number(request.nowMs)) ? Number(request.nowMs) : Date.now()
	const windowMs = Math.max(1, Number(request.windowMs) || 30 * 24 * 60 * 60 * 1000)
	const leaseMs = Math.max(60_000, Number(request.leaseMs) || 30 * 60 * 1000)
	const limit = Math.max(0, Math.floor(Number(request.limit) || 0))
	const category = String(request.category || '')
	const reservationHash = reservationFingerprint(request.reservationId)
	const state = normalizedRollingUsage(input, identityHash, category, { nowMs, windowMs })
	const committed = state.events.find(item => item.reservationHash === reservationHash)
	const existing = state.reservations.find(item => item.reservationHash === reservationHash)
	if (request.action === 'reserve') {
		if (!committed && !existing && state.events.length + state.reservations.length >= limit) {
			return { state, result: { ok: false, code: 'ROLLING_QUOTA_EXHAUSTED', ...rollingSnapshot(state, { limit, windowMs, nowMs }) } }
		}
		if (!committed && !existing) state.reservations.push({ reservationHash, reservedAtMs: nowMs, expiresAtMs: nowMs + leaseMs })
		return { state, result: { ok: true, status: committed ? 'committed' : existing ? 'reserved' : 'reserved', reservationHash, ...rollingSnapshot(state, { limit, windowMs, nowMs }) } }
	}
	if (request.action === 'commit') {
		if (!committed) {
			if (!existing) return { state, result: { ok: false, code: 'ROLLING_RESERVATION_NOT_FOUND', ...rollingSnapshot(state, { limit, windowMs, nowMs }) } }
			state.reservations = state.reservations.filter(item => item.reservationHash !== reservationHash)
			state.events.push({ reservationHash, committedAtMs: nowMs, committedAt: new Date(nowMs).toISOString(), metadata: request.metadata })
		}
		return { state, result: { ok: true, status: 'committed', reservationHash, ...rollingSnapshot(state, { limit, windowMs, nowMs }) } }
	}
	if (request.action === 'release') {
		state.reservations = state.reservations.filter(item => item.reservationHash !== reservationHash)
		return { state, result: { ok: true, status: committed ? 'committed' : 'released', reservationHash, ...rollingSnapshot(state, { limit, windowMs, nowMs }) } }
	}
	return { state, result: { ok: true, status: 'snapshot', ...rollingSnapshot(state, { limit, windowMs, nowMs }) } }
}

let firestoreClientPromise = null
async function firestoreClient() {
	if (!firestoreClientPromise) {
		firestoreClientPromise = import('@google-cloud/firestore')
			.then(({ Firestore }) => new Firestore({
				projectId: process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined,
				databaseId: process.env.BETTERPPTX_FIRESTORE_DATABASE || undefined,
			}))
	}
	return firestoreClientPromise
}

function createFirestoreUsageStore() {
	const collectionName = String(process.env.BETTERPPTX_FIRESTORE_INSTALL_USAGE_COLLECTION || 'betterpptx_install_daily_usage').trim()

	async function collection() {
		return (await firestoreClient()).collection(collectionName)
	}

	async function getDailyUsage(installHash, date) {
		const snap = await meteredFirestoreGet((await collection()).doc(usageDocumentId(installHash, date)))
		return normalizedUsage(snap.exists ? snap.data() || {} : {}, installHash, date)
	}

	async function incrementDailyUsage(installHash, date, amount = 1) {
		const db = await firestoreClient()
		const ref = db.collection(collectionName).doc(usageDocumentId(installHash, date))
		return runMeteredFirestoreTransaction(db, async tx => {
			const snap = await tx.get(ref)
			const current = normalizedUsage(snap.exists ? snap.data() || {} : {}, installHash, date)
			const next = normalizedUsage({
				...current,
				savedDecks: current.savedDecks + Math.max(0, Math.round(Number(amount) || 0)),
				updatedAt: new Date().toISOString(),
			}, installHash, date)
			tx.set(ref, next, { merge: true })
			return next
		})
	}

	async function mutateRolling(identityHash, request) {
		const db = await firestoreClient()
		const ref = db.collection(collectionName).doc(rollingDocumentId(identityHash, request.category))
		return runMeteredFirestoreTransaction(db, async tx => {
			const snap = await tx.get(ref)
			const mutation = mutateRollingUsage(snap.exists ? snap.data() || {} : {}, identityHash, request)
			tx.set(ref, rollingPersistenceValue(mutation.state), { merge: false })
			return mutation.result
		})
	}

	return {
		provider: 'firestore',
		shared: true,
		getDailyUsage,
		incrementDailyUsage,
		getRollingUsage: (identityHash, request) => mutateRolling(identityHash, { ...request, action: 'snapshot' }),
		reserveRollingUsage: (identityHash, request) => mutateRolling(identityHash, { ...request, action: 'reserve' }),
		commitRollingUsage: (identityHash, request) => mutateRolling(identityHash, { ...request, action: 'commit' }),
		releaseRollingUsage: (identityHash, request) => mutateRolling(identityHash, { ...request, action: 'release' }),
		describe: () => ({ provider: 'firestore', shared: true, collectionName }),
	}
}

function createLocalUsageStore() {
	if (process.env.BETTERPPTX_REQUIRE_SHARED_STORES === '1') {
		throw new InstallIdentityError(
			'INSTALL_USAGE_STORE_NOT_SHARED',
			'Install quota storage is not configured for this deployment.',
		)
	}
	const file = usageFile()
	let lock = Promise.resolve()

	function load() {
		try {
			if (fs.existsSync(file)) {
				const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
				if (parsed && typeof parsed === 'object' && parsed.usage && typeof parsed.usage === 'object') return parsed
			}
		} catch {}
		return { version: 1, usage: {} }
	}

	function save(store) {
		fs.mkdirSync(path.dirname(file), { recursive: true })
		fs.writeFileSync(file, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 })
	}

	function withLock(fn) {
		const next = lock.then(() => fn(), () => fn())
		lock = next.catch(() => {})
		return next
	}

	async function getDailyUsage(installHash, date) {
		const current = load().usage[usageDocumentId(installHash, date)]
		return normalizedUsage(current || {}, installHash, date)
	}

	async function incrementDailyUsage(installHash, date, amount = 1) {
		return withLock(() => {
			const store = load()
			const id = usageDocumentId(installHash, date)
			const current = normalizedUsage(store.usage[id] || {}, installHash, date)
			const next = normalizedUsage({
				...current,
				savedDecks: current.savedDecks + Math.max(0, Math.round(Number(amount) || 0)),
				updatedAt: new Date().toISOString(),
			}, installHash, date)
			store.usage[id] = next
			save(store)
			return next
		})
	}

	async function mutateRolling(identityHash, request) {
		return withLock(() => {
			const store = load()
			if (!store.rolling || typeof store.rolling !== 'object') store.rolling = {}
			const id = rollingDocumentId(identityHash, request.category)
			const mutation = mutateRollingUsage(store.rolling[id] || {}, identityHash, request)
			store.rolling[id] = rollingPersistenceValue(mutation.state)
			save(store)
			return mutation.result
		})
	}

	return {
		provider: 'local',
		shared: false,
		file,
		getDailyUsage,
		incrementDailyUsage,
		getRollingUsage: (identityHash, request) => mutateRolling(identityHash, { ...request, action: 'snapshot' }),
		reserveRollingUsage: (identityHash, request) => mutateRolling(identityHash, { ...request, action: 'reserve' }),
		commitRollingUsage: (identityHash, request) => mutateRolling(identityHash, { ...request, action: 'commit' }),
		releaseRollingUsage: (identityHash, request) => mutateRolling(identityHash, { ...request, action: 'release' }),
		describe: () => ({ provider: 'local', shared: false, file }),
	}
}

export function createInstallUsageStore() {
	const provider = usageProvider()
	if (provider === 'firestore') return createFirestoreUsageStore()
	if (provider === 'local') return createLocalUsageStore()
	throw new InstallIdentityError('INSTALL_USAGE_STORE_UNAVAILABLE', 'Install quota storage is not configured for this deployment.')
}
