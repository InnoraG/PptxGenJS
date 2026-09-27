// Private, idempotent metrology ledger for first LivePortrait/MuseTalk executions.
// It stores no tokens, URLs, customer media, or public handles. Local is for tests;
// Firestore is the distributed production backend used by the shared-App billing policy.
import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

const VERSION = 'betterpptx.avatar-provider-metrology.v1'
const nowIso = () => new Date().toISOString()
const hash = value => crypto.createHash('sha256').update(String(value || '')).digest('hex')
const enabled = value => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase())

export function avatarProviderMetrologyStoreProviderName() {
	return String(
		process.env.BETTERPPTX_AVATAR_PROVIDER_METROLOGY_STORE
		|| (String(process.env.BETTERPPTX_DURABLE_OPERATION_STORE || '').toLowerCase() === 'firestore' ? 'firestore' : '')
		|| 'disabled',
	).trim().toLowerCase()
}

export function avatarProviderMetrologyReadiness() {
	const provider = avatarProviderMetrologyStoreProviderName()
	return {
		provider,
		configured: ['local', 'firestore'].includes(provider),
		distributed: provider === 'firestore',
		publicProductionEligible: provider === 'firestore',
		required: enabled(process.env.BETTERPPTX_REQUIRE_PROVIDER_METROLOGY),
	}
}

function localFile() {
	const configured = String(process.env.BETTERPPTX_AVATAR_PROVIDER_METROLOGY_STORE_FILE || '').trim()
	if (configured) return path.resolve(configured)
	const root = String(process.env.BETTERPPTX_OUT_DIR || process.env.BETTERPPTX_DOWNLOAD_ROOT || 'outputs').trim()
	return path.resolve(root, 'betterpptx-avatar-provider-metrology.json')
}

function ttlMs() {
	return Math.max(60 * 60 * 1000, Number(process.env.BETTERPPTX_AVATAR_PROVIDER_METROLOGY_TTL_MS || 90 * 86400000))
}

function hourBounds(capturedAt) {
	const parsed = new Date(String(capturedAt || nowIso()))
	const start = new Date(parsed)
	start.setUTCMinutes(0, 0, 0)
	return { start: start.toISOString(), end: new Date(start.getTime() + 3600000).toISOString() }
}

function safeId(value, fallback = '') {
	const text = String(value || fallback).trim()
	return text.slice(0, 160)
}

function normalizedEvent(input = {}) {
	const ids = Array.isArray(input.providerExecutionIds)
		? input.providerExecutionIds.map(value => safeId(value)).filter(value => /^fc-[A-Za-z0-9_-]+$/.test(value))
		: []
	if (!ids.length) throw new Error('AVATAR_METROLOGY_PROVIDER_ID_MISSING')
	const capturedAt = new Date(String(input.capturedAt || nowIso()))
	if (!Number.isFinite(capturedAt.getTime())) throw new Error('AVATAR_METROLOGY_TIMESTAMP_INVALID')
	const capturedIso = capturedAt.toISOString()
	const bounds = hourBounds(capturedIso)
	const accountId = safeId(input.accountId)
	const eventId = safeId(input.eventId, hash(`${accountId}|${ids.join('|')}`))
	const record = {
		schemaVersion: VERSION,
		eventId,
		accountId,
		accountHash: hash(accountId),
		providerExecutionIds: ids,
		capturedAt: capturedIso,
		intervalStart: bounds.start,
		intervalEnd: bounds.end,
		pipeline: safeId(input.pipeline, 'liveportrait-musetalk'),
		gpuType: safeId(input.gpuType, 'unknown'),
		gpuSeconds: Math.max(0, Number(input.gpuSeconds || 0) || 0),
		renderSeconds: Math.max(0, Number(input.renderSeconds || 0) || 0),
		idempotencyState: safeId(input.idempotencyState, 'completed'),
		outputDigest: /^[0-9a-f]{64}$/i.test(String(input.outputDigest || '')) ? String(input.outputDigest).toLowerCase() : null,
		requestKeyHash: input.idempotencyKey ? hash(input.idempotencyKey) : null,
		createdAt: nowIso(),
		expiresAt: new Date(capturedAt.getTime() + ttlMs()).toISOString(),
	}
	if (!record.accountId || record.pipeline !== 'liveportrait-musetalk' || record.gpuSeconds <= 0) throw new Error('AVATAR_METROLOGY_RECORD_INVALID')
	return record
}

function immutableFingerprint(record) {
	return hash(JSON.stringify({
		accountId: record.accountId,
		providerExecutionIds: record.providerExecutionIds,
		capturedAt: record.capturedAt,
		gpuSeconds: record.gpuSeconds,
		renderSeconds: record.renderSeconds,
		outputDigest: record.outputDigest,
	}))
}

function conflict(existing, next) {
	const error = new Error('AVATAR_METROLOGY_EVENT_CONFLICT')
	error.code = 'AVATAR_METROLOGY_EVENT_CONFLICT'
	error.details = { eventId: next.eventId, existingFingerprint: immutableFingerprint(existing), nextFingerprint: immutableFingerprint(next) }
	return error
}

function createLocalStore() {
	const file = localFile()
	let lock = Promise.resolve()
	const load = async () => {
		try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { return { schemaVersion: VERSION, events: {} } }
	}
	const save = async store => {
		await fs.mkdir(path.dirname(file), { recursive: true })
		const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
		await fs.writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 })
		await fs.rename(tmp, file)
	}
	const withLock = fn => { const next = lock.then(fn, fn); lock = next.catch(() => {}); return next }
	return {
		provider: 'local', distributed: false,
		put: event => withLock(async () => {
			const store = await load(); const existing = store.events?.[event.eventId]
			if (existing) { if (immutableFingerprint(existing) !== immutableFingerprint(event)) throw conflict(existing, event); return { event: existing, idempotent: true } }
			store.events = store.events || {}; store.events[event.eventId] = event; await save(store); return { event, idempotent: false }
		}),
		list: ({ start = '', end = '', accountId = '' } = {}) => load().then(store => Object.values(store.events || {}).filter(event => (!start || event.capturedAt >= start) && (!end || event.capturedAt < end) && (!accountId || event.accountId === accountId))),
		purgeExpired: (now = new Date()) => withLock(async () => {
			const store = await load(); const cutoff = now instanceof Date ? now.getTime() : Date.parse(String(now)); let removed = 0
			for (const [id, event] of Object.entries(store.events || {})) if (Date.parse(event?.expiresAt || '') <= cutoff) { delete store.events[id]; removed++ }
			if (removed) await save(store); return { removed }
		}),
	}
}

let firestorePromise = null
async function firestore() {
	if (!firestorePromise) firestorePromise = import('@google-cloud/firestore').then(({ Firestore }) => new Firestore({
		projectId: process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined,
		databaseId: process.env.BETTERPPTX_FIRESTORE_DATABASE || undefined,
	}))
	return firestorePromise
}

function createFirestoreStore() {
	const collection = String(process.env.BETTERPPTX_FIRESTORE_AVATAR_PROVIDER_METROLOGY_COLLECTION || 'betterpptx_avatar_provider_metrology').trim()
	return {
		provider: 'firestore', distributed: true,
		async put(event) {
			const ref = (await firestore()).collection(collection).doc(hash(event.eventId)); let result = event; let idempotent = false
			const db = await firestore()
			await db.runTransaction(async transaction => {
				const snapshot = await transaction.get(ref)
				if (snapshot.exists) { const existing = snapshot.data(); if (immutableFingerprint(existing) !== immutableFingerprint(event)) throw conflict(existing, event); result = existing; idempotent = true; return }
				transaction.create(ref, event)
			})
			return { event: result, idempotent }
		},
		async list({ start = '', end = '', accountId = '' } = {}) {
			const snapshot = await (await firestore()).collection(collection).limit(5000).get()
			return snapshot.docs.map(doc => doc.data()).filter(event => (!start || event.capturedAt >= start) && (!end || event.capturedAt < end) && (!accountId || event.accountId === accountId))
		},
		async purgeExpired(now = new Date()) {
			const snapshot = await (await firestore()).collection(collection).where('expiresAt', '<=', now instanceof Date ? now.toISOString() : String(now)).limit(200).get()
			if (snapshot.empty) return { removed: 0 }; const batch = (await firestore()).batch(); snapshot.docs.forEach(doc => batch.delete(doc.ref)); await batch.commit(); return { removed: snapshot.size }
		},
	}
}

let cachedProvider = ''; let cachedStore = null
export function createAvatarProviderMetrologyStore() {
	const provider = avatarProviderMetrologyStoreProviderName()
	if (cachedStore && cachedProvider === provider) return cachedStore
	if (provider === 'local') cachedStore = createLocalStore()
	else if (provider === 'firestore') cachedStore = createFirestoreStore()
	else cachedStore = { provider: 'disabled', distributed: false, disabled: true, async put() { return null }, async list() { return [] }, async purgeExpired() { return { removed: 0 } } }
	cachedProvider = provider
	return cachedStore
}

export async function recordAvatarProviderMetrology(input = {}) {
	const store = createAvatarProviderMetrologyStore()
	if (store.disabled) return null
	return store.put(normalizedEvent(input))
}

export async function listAvatarProviderMetrology(query = {}) {
	const store = createAvatarProviderMetrologyStore()
	return store.list(query)
}

export async function purgeAvatarProviderMetrology(now = new Date()) {
	const store = createAvatarProviderMetrologyStore()
	return store.purgeExpired(now)
}

export { immutableFingerprint }
