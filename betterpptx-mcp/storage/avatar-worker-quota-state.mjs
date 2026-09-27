// Secret-free, account-scoped quota reservation state for LivePortrait/MuseTalk.
// Local is for research/tests; Firestore is the distributed production backend.
// The ledger stores only hashed account ids, UTC-day windows, GPU-second budgets,
// and opaque reservation hashes. It never stores tokens, media, prompts, or URLs.
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as crypto from 'node:crypto'

const VERSION = 'betterpptx.avatar-worker-quota.v1'
const hash = value => crypto.createHash('sha256').update(String(value || '')).digest('hex')
const accountHash = value => hash(value)
const reservationHash = value => hash(value)
const day = () => new Date().toISOString().slice(0, 10)
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0

export function avatarWorkerQuotaProviderName() {
	return String(process.env.BETTERPPTX_AVATAR_QUOTA_STATE_STORE || (process.env.BETTERPPTX_AVATAR_QUOTA_DURABLE === '1' ? 'local' : '') || 'disabled').trim().toLowerCase()
}

export function avatarWorkerQuotaLimitGpuSeconds() {
	return positive(process.env.BETTERPPTX_AVATAR_WORKER_DAILY_GPU_SECONDS)
}

// An explicit unlimited value means no hard daily rejection, while the
// Firestore/local ledger continues to record every reservation and settlement.
// Missing/blank remains distinct from unlimited and therefore still fails
// closed when production quota is required.
export function avatarWorkerQuotaMode() {
	const raw = String(process.env.BETTERPPTX_AVATAR_WORKER_DAILY_GPU_SECONDS || '').trim().toLowerCase()
	return ['unlimited', 'unbounded', 'metered-unbounded'].includes(raw) ? 'unbounded-metered' : 'finite'
}

export function avatarWorkerQuotaIsUnbounded() {
	return avatarWorkerQuotaMode() === 'unbounded-metered'
}

export function avatarWorkerQuotaReadiness() {
	const provider = avatarWorkerQuotaProviderName()
	const limitGpuSeconds = avatarWorkerQuotaLimitGpuSeconds()
	const quotaMode = avatarWorkerQuotaMode()
	return {
		provider,
		configured: ['local', 'firestore'].includes(provider),
		distributed: provider === 'firestore',
		limitGpuSeconds,
		quotaMode,
		required: String(process.env.BETTERPPTX_REQUIRE_AVATAR_QUOTA || '').trim() === '1',
		publicProductionEligible: provider === 'firestore' && (limitGpuSeconds > 0 || quotaMode === 'unbounded-metered'),
	}
}

export function avatarWorkerQuotaProductionConfig({ provider = avatarWorkerQuotaProviderName(), limitGpuSeconds = avatarWorkerQuotaLimitGpuSeconds(), quotaMode = avatarWorkerQuotaMode(), required = String(process.env.BETTERPPTX_REQUIRE_AVATAR_QUOTA || '').trim() === '1', estimatedGpuSeconds = positive(process.env.BETTERPPTX_AVATAR_WORKER_ESTIMATED_GPU_SECONDS || 120) || 120 } = {}) {
	const errors = []
	if (required && provider !== 'firestore') errors.push('AVATAR_QUOTA_DISTRIBUTED_STORE_REQUIRED')
	if (required && limitGpuSeconds <= 0 && quotaMode !== 'unbounded-metered') errors.push('AVATAR_QUOTA_OWNER_BUDGET_REQUIRED')
	if (required && quotaMode !== 'unbounded-metered' && estimatedGpuSeconds > limitGpuSeconds && limitGpuSeconds > 0) errors.push('AVATAR_QUOTA_ESTIMATE_EXCEEDS_BUDGET')
	return {
		ok: errors.length === 0,
		required,
		provider,
		limitGpuSeconds,
		estimatedGpuSeconds,
		quotaMode,
		errors,
		mode: required ? (quotaMode === 'unbounded-metered' ? 'production-unbounded-metered' : 'production-required') : 'optional',
	}
}

function localFile() {
	const configured = String(process.env.BETTERPPTX_AVATAR_QUOTA_STATE_FILE || '').trim()
	if (configured) return path.resolve(configured)
	const root = String(process.env.BETTERPPTX_OUT_DIR || process.env.BETTERPPTX_DOWNLOAD_ROOT || 'outputs').trim()
	return path.resolve(root, 'betterpptx-avatar-worker-quota.json')
}

function emptyRecord(accountId, limitGpuSeconds) {
	return {
		schemaVersion: VERSION,
		date: day(),
		accountHash: accountHash(accountId),
		limitGpuSeconds: avatarWorkerQuotaIsUnbounded() ? null : limitGpuSeconds,
		quotaMode: avatarWorkerQuotaMode(),
		reservedGpuSeconds: 0,
		settledGpuSeconds: 0,
		reservations: {},
		updatedAt: new Date().toISOString(),
	}
}

function normalizeRecord(accountId, value, limitGpuSeconds) {
	const source = value && typeof value === 'object' && value.date === day() ? value : emptyRecord(accountId, limitGpuSeconds)
	const reservations = {}
	for (const [id, item] of Object.entries(source.reservations || {})) {
		if (!/^[a-f0-9]{64}$/.test(id) || !item || typeof item !== 'object') continue
		const estimated = Math.max(0, Number(item.estimatedGpuSeconds) || 0)
		const actual = item.actualGpuSeconds == null ? null : Math.max(0, Number(item.actualGpuSeconds) || 0)
		reservations[id] = { estimatedGpuSeconds: estimated, actualGpuSeconds: actual, status: ['reserved', 'settled', 'released'].includes(item.status) ? item.status : 'reserved', createdAt: String(item.createdAt || '') }
	}
	return {
		schemaVersion: VERSION,
		date: day(),
		accountHash: accountHash(accountId),
		limitGpuSeconds: avatarWorkerQuotaIsUnbounded() ? null : limitGpuSeconds,
		quotaMode: avatarWorkerQuotaMode(),
		reservedGpuSeconds: Math.max(0, Number(source.reservedGpuSeconds) || 0),
		settledGpuSeconds: Math.max(0, Number(source.settledGpuSeconds) || 0),
		reservations,
		updatedAt: new Date().toISOString(),
	}
}

function available(record) {
	if (record.quotaMode === 'unbounded-metered' || record.limitGpuSeconds == null) return null
	return Math.max(0, Number(record.limitGpuSeconds) - Number(record.reservedGpuSeconds) - Number(record.settledGpuSeconds))
}

function result(record, reservationId = '') {
	return {
		ok: true,
		accountHash: record.accountHash,
		date: record.date,
		limitGpuSeconds: record.limitGpuSeconds,
		reservedGpuSeconds: record.reservedGpuSeconds,
		settledGpuSeconds: record.settledGpuSeconds,
		availableGpuSeconds: available(record),
		quotaMode: record.quotaMode || 'finite',
		reservationId: reservationId ? reservationHash(reservationId) : null,
	}
}

function reserveRecord(record, id, estimatedGpuSeconds) {
	const key = reservationHash(id)
	const existing = record.reservations[key]
	if (existing && existing.status !== 'released') return result(record, id)
	if (record.quotaMode !== 'unbounded-metered' && estimatedGpuSeconds > available(record)) return { ...result(record, id), ok: false, code: 'AVATAR_WORKER_QUOTA_EXCEEDED' }
	record.reservations[key] = { estimatedGpuSeconds, actualGpuSeconds: null, status: 'reserved', createdAt: new Date().toISOString() }
	record.reservedGpuSeconds += estimatedGpuSeconds
	return result(record, id)
}

function settleRecord(record, id, actualGpuSeconds) {
	const key = reservationHash(id)
	const existing = record.reservations[key]
	if (!existing) return { ...result(record, id), ok: false, code: 'AVATAR_WORKER_QUOTA_RESERVATION_MISSING' }
	if (existing.status === 'settled') return result(record, id)
	if (existing.status === 'released') return { ...result(record, id), ok: false, code: 'AVATAR_WORKER_QUOTA_RESERVATION_RELEASED' }
	record.reservedGpuSeconds = Math.max(0, record.reservedGpuSeconds - existing.estimatedGpuSeconds)
	record.settledGpuSeconds += Math.max(0, actualGpuSeconds)
	existing.actualGpuSeconds = Math.max(0, actualGpuSeconds)
	existing.status = 'settled'
	return result(record, id)
}

function releaseRecord(record, id) {
	const key = reservationHash(id)
	const existing = record.reservations[key]
	if (!existing || existing.status === 'released') return result(record, id)
	if (existing.status === 'settled') return result(record, id)
	record.reservedGpuSeconds = Math.max(0, record.reservedGpuSeconds - existing.estimatedGpuSeconds)
	existing.status = 'released'
	return result(record, id)
}

function createLocalStore() {
	const file = localFile()
	let lock = Promise.resolve()
	const load = async () => { try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { return { schemaVersion: VERSION, date: day(), accounts: {} } } }
	const save = async store => {
		await fs.mkdir(path.dirname(file), { recursive: true })
		const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
		await fs.writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 })
		await fs.rename(tmp, file)
	}
	const withLock = fn => { const next = lock.then(fn, fn); lock = next.catch(() => {}); return next }
	const mutate = (accountId, operation) => withLock(async () => {
		const store = await load()
		if (store.date !== day()) { store.date = day(); store.accounts = {} }
		const key = accountHash(accountId)
		const record = normalizeRecord(accountId, store.accounts?.[key], avatarWorkerQuotaLimitGpuSeconds())
		const value = operation(record)
		store.schemaVersion = VERSION; store.date = day(); store.accounts = store.accounts || {}; store.accounts[key] = record
		await save(store)
		return value
	})
	return {
		provider: 'local', distributed: false,
		get: async accountId => { const store = await load(); return result(normalizeRecord(accountId, store.accounts?.[accountHash(accountId)], avatarWorkerQuotaLimitGpuSeconds())) },
		reserve: (accountId, id, estimate) => mutate(accountId, record => reserveRecord(record, id, estimate)),
		settle: (accountId, id, actual) => mutate(accountId, record => settleRecord(record, id, actual)),
		release: (accountId, id) => mutate(accountId, record => releaseRecord(record, id)),
	}
}

let firestorePromise = null
async function firestore() {
	if (!firestorePromise) firestorePromise = import('@google-cloud/firestore').then(({ Firestore }) => new Firestore({ projectId: process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined, databaseId: process.env.BETTERPPTX_FIRESTORE_DATABASE || undefined }))
	return firestorePromise
}

function createFirestoreStore() {
	const collection = String(process.env.BETTERPPTX_FIRESTORE_AVATAR_WORKER_QUOTA_COLLECTION || 'betterpptx_avatar_worker_quota').trim()
	const mutate = async (accountId, operation) => {
		const db = await firestore(); const ref = db.collection(collection).doc(accountHash(accountId)); let value
		await db.runTransaction(async transaction => {
			const snapshot = await transaction.get(ref)
			const record = normalizeRecord(accountId, snapshot.exists ? snapshot.data() : null, avatarWorkerQuotaLimitGpuSeconds())
			value = operation(record)
			transaction.set(ref, record, { merge: false })
		})
		return value
	}
	return {
		provider: 'firestore', distributed: true,
		async get(accountId) { const snap = await (await firestore()).collection(collection).doc(accountHash(accountId)).get(); return result(normalizeRecord(accountId, snap.exists ? snap.data() : null, avatarWorkerQuotaLimitGpuSeconds())) },
		reserve: (accountId, id, estimate) => mutate(accountId, record => reserveRecord(record, id, estimate)),
		settle: (accountId, id, actual) => mutate(accountId, record => settleRecord(record, id, actual)),
		release: (accountId, id) => mutate(accountId, record => releaseRecord(record, id)),
	}
}

let cachedProvider = ''; let cachedStore = null
export function createAvatarWorkerQuotaStore() {
	const provider = avatarWorkerQuotaProviderName()
	if (cachedStore && cachedProvider === provider) return cachedStore
	if (provider === 'local') cachedStore = createLocalStore()
	else if (provider === 'firestore') cachedStore = createFirestoreStore()
	else cachedStore = { provider: 'disabled', distributed: false, disabled: true, async get(accountId) { return { ok: true, accountHash: accountHash(accountId), availableGpuSeconds: 0, limitGpuSeconds: 0, disabled: true } }, async reserve(accountId, id) { return { ok: true, disabled: true, accountHash: accountHash(accountId), reservationId: reservationHash(id) } }, async settle() { return { ok: true, disabled: true } }, async release() { return { ok: true, disabled: true } } }
	cachedProvider = provider
	return cachedStore
}

export { VERSION as AVATAR_WORKER_QUOTA_SCHEMA_VERSION }
