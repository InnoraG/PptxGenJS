// Shared, secret-free health/quota state for rotating LivePortrait+MuseTalk workers.
// Local is a research/test backend; Firestore is the distributed production backend.
import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

const VERSION = 'betterpptx.avatar-worker-state.v1'
const nowIso = () => new Date().toISOString()
const cooldownMs = () => Math.max(1000, Number(process.env.BETTERPPTX_AVATAR_WORKER_COOLDOWN_MS || 30000))
const hash = value => crypto.createHash('sha256').update(String(value || '')).digest('hex')

export function avatarWorkerStateProviderName() {
	return String(process.env.BETTERPPTX_AVATAR_WORKER_STATE_STORE || 'disabled').trim().toLowerCase()
}

export function avatarWorkerStateReadiness() {
	const provider = avatarWorkerStateProviderName()
	return { provider, configured: ['local', 'firestore'].includes(provider), distributed: provider === 'firestore', publicProductionEligible: provider === 'firestore' }
}

function localFile() {
	const configured = String(process.env.BETTERPPTX_AVATAR_WORKER_STATE_FILE || '').trim()
	if (configured) return path.resolve(configured)
	const root = String(process.env.BETTERPPTX_OUT_DIR || process.env.BETTERPPTX_DOWNLOAD_ROOT || 'outputs').trim()
	return path.resolve(root, 'betterpptx-avatar-worker-state.json')
}

function safeRecord(accountId, patch = {}) {
	return {
		schemaVersion: VERSION,
		accountHash: hash(accountId),
		status: String(patch.status || 'healthy'),
		consecutiveFailures: Math.max(0, Number(patch.consecutiveFailures || 0)),
		cooldownUntil: patch.cooldownUntil || null,
		lastErrorClass: patch.lastErrorClass || null,
		updatedAt: patch.updatedAt || nowIso(),
	}
}

function createLocalStore() {
	const file = localFile()
	let lock = Promise.resolve()
	const load = async () => { try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { return { schemaVersion: VERSION, accounts: {} } } }
	const save = async store => {
		await fs.mkdir(path.dirname(file), { recursive: true })
		const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
		await fs.writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 })
		await fs.rename(tmp, file)
	}
	const withLock = fn => { const next = lock.then(fn, fn); lock = next.catch(() => {}); return next }
	return {
		provider: 'local', distributed: false,
		get: id => load().then(store => store.accounts?.[hash(id)] || safeRecord(id)),
		list: ids => load().then(store => ids.map(id => store.accounts?.[hash(id)] || safeRecord(id))),
		recordSuccess: id => withLock(async () => { const store = await load(); store.accounts[hash(id)] = safeRecord(id); await save(store); return store.accounts[hash(id)] }),
		recordFailure: (id, errorClass = 'transient') => withLock(async () => {
			const store = await load(); const prior = store.accounts[hash(id)] || safeRecord(id)
			const failures = prior.consecutiveFailures + 1
			store.accounts[hash(id)] = safeRecord(id, { status: 'cooldown', consecutiveFailures: failures, cooldownUntil: new Date(Date.now() + cooldownMs()).toISOString(), lastErrorClass: errorClass })
			await save(store); return store.accounts[hash(id)]
		}),
	}
}

let firestorePromise = null
async function firestore() {
	if (!firestorePromise) firestorePromise = import('@google-cloud/firestore').then(({ Firestore }) => new Firestore({ projectId: process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined, databaseId: process.env.BETTERPPTX_FIRESTORE_DATABASE || undefined }))
	return firestorePromise
}

function createFirestoreStore() {
	const collection = String(process.env.BETTERPPTX_FIRESTORE_AVATAR_WORKER_STATE_COLLECTION || 'betterpptx_avatar_worker_state').trim()
	return {
		provider: 'firestore', distributed: true,
		async get(id) { const snapshot = await (await firestore()).collection(collection).doc(hash(id)).get(); return snapshot.exists ? snapshot.data() : safeRecord(id) },
		async list(ids) { return Promise.all(ids.map(id => this.get(id))) },
		async recordSuccess(id) { const record = safeRecord(id); await (await firestore()).collection(collection).doc(hash(id)).set(record, { merge: false }); return record },
		async recordFailure(id, errorClass = 'transient') {
			const db = await firestore(); const ref = db.collection(collection).doc(hash(id)); let record
			await db.runTransaction(async transaction => {
				const snapshot = await transaction.get(ref); const prior = snapshot.exists ? snapshot.data() : safeRecord(id)
				record = safeRecord(id, { status: 'cooldown', consecutiveFailures: Number(prior?.consecutiveFailures || 0) + 1, cooldownUntil: new Date(Date.now() + cooldownMs()).toISOString(), lastErrorClass: errorClass })
				transaction.set(ref, record, { merge: false })
			})
			return record
		},
	}
}

let cachedProvider = '', cachedStore = null
export function createAvatarWorkerStateStore() {
	const provider = avatarWorkerStateProviderName()
	if (cachedStore && cachedProvider === provider) return cachedStore
	if (provider === 'local') cachedStore = createLocalStore()
	else if (provider === 'firestore') cachedStore = createFirestoreStore()
	else cachedStore = { provider: 'disabled', distributed: false, disabled: true, async get(id) { return safeRecord(id) }, async list(ids) { return ids.map(id => safeRecord(id)) }, async recordSuccess(id) { return safeRecord(id) }, async recordFailure(id, errorClass) { return safeRecord(id, { status: 'cooldown', lastErrorClass: errorClass }) } }
	cachedProvider = provider
	return cachedStore
}
