// Secret-free, account-scoped MONTHLY USD budget for the rotated Modal avatar
// workers. Owner hard rule: never spend more than $30 per Modal account per
// calendar month (practical cap $29.50). An account whose effective spend plus
// the next render's estimate would cross (cap - reserve) drops out of rotation.
//
// Effective spend = the account's REAL billed spend for the month (written by
// the scheduled Modal billing sync, deploy/avatar-budget-sync) + this
// runtime's own render ledger entries that the billing report may not include
// yet (newer than billedAt - lag) + open reservations. A stale or missing
// billing figure fails CLOSED for that account. Only hashed account ids,
// UTC-month windows, USD amounts and opaque reservation hashes are stored.
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as crypto from 'node:crypto'

const VERSION = 'betterpptx.avatar-worker-budget.v1'
const hash = value => crypto.createHash('sha256').update(String(value || '')).digest('hex')
const month = (now = Date.now()) => new Date(now).toISOString().slice(0, 7)
const number = (value, fallback) => {
	const parsed = Number(value)
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}
const roundUsd = value => Math.round(Number(value || 0) * 1e6) / 1e6

export function avatarWorkerBudgetConfig(env = process.env) {
	const capUsd = number(env.BETTERPPTX_AVATAR_WORKER_MONTHLY_CAP_USD, 29.5)
	const reserveUsd = number(env.BETTERPPTX_AVATAR_WORKER_BUDGET_RESERVE_USD, 1.5)
	return {
		provider: String(env.BETTERPPTX_AVATAR_BUDGET_STORE || 'disabled').trim().toLowerCase(),
		required: String(env.BETTERPPTX_REQUIRE_AVATAR_BUDGET || '').trim() === '1',
		capUsd,
		reserveUsd,
		limitUsd: Math.max(0, capUsd - reserveUsd),
		estimatedRenderUsd: number(env.BETTERPPTX_AVATAR_WORKER_ESTIMATED_RENDER_USD, 0.5),
		usdPerGpuSecond: number(env.BETTERPPTX_AVATAR_WORKER_USD_PER_GPU_SECOND, 0.0011),
		coldStartUsd: number(env.BETTERPPTX_AVATAR_WORKER_COLD_START_USD, 0.1),
		billingMaxAgeMs: number(env.BETTERPPTX_AVATAR_WORKER_BILLING_MAX_AGE_MS, 6 * 3600000),
		billingLagMs: number(env.BETTERPPTX_AVATAR_WORKER_BILLING_LAG_MS, 6 * 3600000),
	}
}

export function avatarWorkerBudgetProductionConfig(config = avatarWorkerBudgetConfig()) {
	const errors = []
	if (config.required && config.provider !== 'firestore') errors.push('AVATAR_BUDGET_DISTRIBUTED_STORE_REQUIRED')
	if (config.required && config.limitUsd <= 0) errors.push('AVATAR_BUDGET_CAP_REQUIRED')
	if (config.required && config.estimatedRenderUsd <= 0) errors.push('AVATAR_BUDGET_ESTIMATE_REQUIRED')
	return { ok: errors.length === 0, errors, ...config }
}

// Conservative settled cost for one provider execution: GPU seconds at a
// rate at or above the dearest GPU the worker may land on, plus a cold-start
// and idle-window allowance (Modal bills the whole container life).
export function avatarWorkerRenderCostUsd(gpuSeconds, config = avatarWorkerBudgetConfig()) {
	return roundUsd(Math.max(0, Number(gpuSeconds) || 0) * config.usdPerGpuSecond + config.coldStartUsd)
}

function emptyRecord(accountId, now) {
	return { schemaVersion: VERSION, month: month(now), accountHash: hash(accountId), billedUsd: null, billedAt: null, entries: {}, updatedAt: new Date(now).toISOString() }
}

function normalizeRecord(accountId, value, now) {
	if (!value || typeof value !== 'object' || value.month !== month(now)) return emptyRecord(accountId, now)
	const entries = {}
	for (const [id, item] of Object.entries(value.entries || {})) {
		if (!/^[a-f0-9]{64}$/.test(id) || !item || typeof item !== 'object') continue
		if (!['reserved', 'settled', 'released'].includes(item.status)) continue
		entries[id] = { usd: Math.max(0, Number(item.usd) || 0), status: item.status, createdAt: String(item.createdAt || '') }
	}
	const billed = value.billedUsd == null ? null : Number(value.billedUsd)
	return {
		schemaVersion: VERSION,
		month: month(now),
		accountHash: hash(accountId),
		billedUsd: Number.isFinite(billed) && billed >= 0 ? billed : null,
		billedAt: value.billedAt ? String(value.billedAt) : null,
		entries,
		updatedAt: new Date(now).toISOString(),
	}
}

function summarize(record, config, now) {
	const billedAtMs = record.billedAt ? Date.parse(record.billedAt) : NaN
	const fresh = record.billedUsd != null && Number.isFinite(billedAtMs) && now - billedAtMs <= config.billingMaxAgeMs
	let unbilledUsd = 0
	for (const entry of Object.values(record.entries)) {
		if (entry.status === 'released') continue
		const created = Date.parse(entry.createdAt)
		// Reservations always count; settled renders count until the billing
		// report has had `lag` to include them, so they are never dropped early.
		if (entry.status === 'reserved' || !Number.isFinite(billedAtMs) || !Number.isFinite(created) || created >= billedAtMs - config.billingLagMs) unbilledUsd += entry.usd
	}
	const spentUsd = roundUsd((record.billedUsd || 0) + unbilledUsd)
	return { accountHash: record.accountHash, month: record.month, billedUsd: record.billedUsd, billedAt: record.billedAt, billingFresh: fresh, unbilledUsd: roundUsd(unbilledUsd), spentUsd, limitUsd: config.limitUsd, capUsd: config.capUsd, availableUsd: roundUsd(Math.max(0, config.limitUsd - spentUsd)) }
}

function reserveRecord(record, id, estimateUsd, config, now) {
	const key = hash(id)
	const existing = record.entries[key]
	const before = summarize(record, config, now)
	if (existing && existing.status !== 'released') return { ok: true, ...before, reservationId: key }
	if (!before.billingFresh) return { ok: false, code: 'AVATAR_WORKER_BILLING_STALE', ...before }
	if (before.spentUsd + estimateUsd > config.limitUsd) return { ok: false, code: 'AVATAR_WORKER_BUDGET_EXHAUSTED', ...before }
	record.entries[key] = { usd: roundUsd(estimateUsd), status: 'reserved', createdAt: new Date(now).toISOString() }
	return { ok: true, ...summarize(record, config, now), reservationId: key }
}

function settleRecord(record, id, actualUsd, config, now) {
	const key = hash(id)
	const existing = record.entries[key]
	if (!existing) return { ok: false, code: 'AVATAR_WORKER_BUDGET_RESERVATION_MISSING', ...summarize(record, config, now) }
	if (existing.status === 'reserved') Object.assign(existing, { usd: roundUsd(Math.max(0, actualUsd)), status: 'settled' })
	return { ok: existing.status === 'settled', ...summarize(record, config, now), reservationId: key }
}

function releaseRecord(record, id, config, now) {
	const existing = record.entries[hash(id)]
	if (existing?.status === 'reserved') existing.status = 'released'
	return { ok: true, ...summarize(record, config, now) }
}

function recordBilledRecord(record, billedUsd, billedAt, config, now) {
	record.billedUsd = roundUsd(Math.max(0, Number(billedUsd) || 0))
	record.billedAt = new Date(billedAt || now).toISOString()
	// Drop entries the billing report has certainly absorbed, so the document stays small.
	const cutoff = Date.parse(record.billedAt) - config.billingLagMs
	for (const [key, entry] of Object.entries(record.entries)) {
		if (entry.status === 'released' || (entry.status === 'settled' && Date.parse(entry.createdAt) < cutoff)) delete record.entries[key]
	}
	return { ok: true, ...summarize(record, config, now) }
}

function operations(mutate, read) {
	return {
		get: accountId => read(accountId),
		reserve: (accountId, id, estimateUsd) => mutate(accountId, (record, config, now) => reserveRecord(record, id, estimateUsd, config, now)),
		settle: (accountId, id, actualUsd) => mutate(accountId, (record, config, now) => settleRecord(record, id, actualUsd, config, now)),
		release: (accountId, id) => mutate(accountId, (record, config, now) => releaseRecord(record, id, config, now)),
		recordBilled: (accountId, billedUsd, billedAt) => mutate(accountId, (record, config, now) => recordBilledRecord(record, billedUsd, billedAt, config, now)),
	}
}

function createLocalStore() {
	const file = path.resolve(String(process.env.BETTERPPTX_AVATAR_BUDGET_STATE_FILE || '').trim() || path.join(String(process.env.BETTERPPTX_OUT_DIR || 'outputs'), 'betterpptx-avatar-worker-budget.json'))
	let lock = Promise.resolve()
	const load = async () => { try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { return { schemaVersion: VERSION, accounts: {} } } }
	const withLock = fn => { const next = lock.then(fn, fn); lock = next.catch(() => {}); return next }
	const mutate = (accountId, operation) => withLock(async () => {
		const store = await load(); const now = Date.now(); const config = avatarWorkerBudgetConfig()
		store.accounts = store.accounts || {}
		const record = normalizeRecord(accountId, store.accounts[hash(accountId)], now)
		const value = operation(record, config, now)
		store.accounts[hash(accountId)] = record
		await fs.mkdir(path.dirname(file), { recursive: true })
		const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
		await fs.writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 })
		await fs.rename(tmp, file)
		return value
	})
	const read = async accountId => { const store = await load(); const now = Date.now(); return summarize(normalizeRecord(accountId, store.accounts?.[hash(accountId)], now), avatarWorkerBudgetConfig(), now) }
	return { provider: 'local', distributed: false, ...operations(mutate, read) }
}

let firestorePromise = null
async function firestore() {
	if (!firestorePromise) firestorePromise = import('@google-cloud/firestore').then(({ Firestore }) => new Firestore({ projectId: process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined, databaseId: process.env.BETTERPPTX_FIRESTORE_DATABASE || undefined }))
	return firestorePromise
}

export function avatarWorkerBudgetCollection(env = process.env) {
	return String(env.BETTERPPTX_FIRESTORE_AVATAR_WORKER_BUDGET_COLLECTION || 'betterpptx_avatar_worker_budget').trim()
}

function createFirestoreStore() {
	const collection = avatarWorkerBudgetCollection()
	const mutate = async (accountId, operation) => {
		const db = await firestore(); const ref = db.collection(collection).doc(hash(accountId)); let value
		await db.runTransaction(async transaction => {
			const snapshot = await transaction.get(ref); const now = Date.now()
			const record = normalizeRecord(accountId, snapshot.exists ? snapshot.data() : null, now)
			value = operation(record, avatarWorkerBudgetConfig(), now)
			transaction.set(ref, record, { merge: false })
		})
		return value
	}
	const read = async accountId => { const snap = await (await firestore()).collection(collection).doc(hash(accountId)).get(); const now = Date.now(); return summarize(normalizeRecord(accountId, snap.exists ? snap.data() : null, now), avatarWorkerBudgetConfig(), now) }
	return { provider: 'firestore', distributed: true, ...operations(mutate, read) }
}

let cachedProvider = ''; let cachedStore = null
export function createAvatarWorkerBudgetStore() {
	const { provider } = avatarWorkerBudgetConfig()
	if (cachedStore && cachedProvider === provider) return cachedStore
	if (provider === 'local') cachedStore = createLocalStore()
	else if (provider === 'firestore') cachedStore = createFirestoreStore()
	else cachedStore = null
	cachedProvider = provider
	return cachedStore
}

export { VERSION as AVATAR_WORKER_BUDGET_SCHEMA_VERSION }
