// Durable metadata for avatar jobs. Video bytes remain in the locked/generated
// asset store; this record contains only opaque handles and redacted status.
import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { resourceOwnerOf } from '../auth/resource-authorization.mjs'

function enabled(name) {
	return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase())
}

export function avatarJobStoreProviderName() {
	return String(
		process.env.BETTERPPTX_AVATAR_JOB_STORE
		|| (String(process.env.BETTERPPTX_DURABLE_OPERATION_STORE || '').toLowerCase() === 'firestore' ? 'firestore' : '')
		|| 'disabled',
	).trim().toLowerCase()
}

export function avatarJobStoreReadiness() {
	const provider = avatarJobStoreProviderName()
	return {
		provider,
		configured: ['local', 'firestore'].includes(provider),
		distributed: provider === 'firestore',
		publicProductionEligible: provider === 'firestore',
	}
}

function hash(value) {
	return crypto.createHash('sha256').update(String(value || '')).digest('hex')
}

function localFile() {
	const configured = String(process.env.BETTERPPTX_AVATAR_JOB_STORE_FILE || '').trim()
	if (configured) return path.resolve(configured)
	const root = String(process.env.BETTERPPTX_OUT_DIR || process.env.BETTERPPTX_DOWNLOAD_ROOT || 'outputs').trim()
	return path.resolve(root, 'betterpptx-avatar-jobs.json')
}

function ttlMs() {
	return Math.max(60 * 1000, Number(process.env.BETTERPPTX_AVATAR_JOB_TTL_MS || 86400000))
}

function redactedResult(job = {}) {
	const result = job.result || {}
	const publicVideo = result.publicVideo || result
	return {
		ref: publicVideo?.ref || result.ref || null,
		posterRef: publicVideo?.posterRef || result.posterRef || null,
		durationMs: Number(publicVideo?.durationMs || result.durationMs || 0) || 0,
		extn: 'mp4',
		cacheHit: Boolean(publicVideo?.cacheHit || result.cacheHit),
		warnings: Array.isArray(result.warnings) ? result.warnings.slice(0, 8).map(String) : [],
	}
}

export function durableAvatarJobRecord(job = {}) {
	const anchorMs = Date.parse(job.completedAt || job.createdAt || '')
	const expiresAt = job.expiresAt || new Date((Number.isFinite(anchorMs) ? anchorMs : Date.now()) + ttlMs()).toISOString()
	// This envelope is private server state, never part of redactedResult or a
	// client-authored payload. Preserve it on every queued/running/terminal write.
	const metadata = structuredClone(job.metadata || {})
	if (Object.hasOwn(job, 'resourceOwner') || Object.hasOwn(metadata, 'resourceOwner')) {
		const owner = resourceOwnerOf(job)
		if (!owner) {
			const error = new Error('Avatar job ownership could not be safely saved.')
			error.code = 'AVATAR_JOB_PERSISTENCE_FAILED'
			throw error
		}
		metadata.resourceOwner = owner
	}
	return {
		schemaVersion: 'betterpptx.avatar-job.v1',
		jobId: String(job.id || ''),
		sessionHash: hash(job.sessionId),
		deckHash: job.deckId ? hash(job.deckId) : '',
		status: String(job.status || 'queued'),
		createdAt: job.createdAt || new Date().toISOString(),
		startedAt: job.startedAt || null,
		completedAt: job.completedAt || null,
		updatedAt: job.updatedAt || new Date().toISOString(),
		expiresAt,
		metadata,
		result: (job.status === 'succeeded' && job.result) ? redactedResult(job) : null,
		error: job.error ? { code: String(job.error.code || 'AVATAR_FAILED'), message: 'Avatar job failed.' } : null,
	}
}

function createLocalStore() {
	const file = localFile()
	let lock = Promise.resolve()
	const load = async () => {
		try {
			const store = JSON.parse(await fs.readFile(file, 'utf8'))
			if (!store || typeof store.jobs !== 'object' || !store.jobs || Array.isArray(store.jobs)) throw new Error('Invalid job store.')
			return store
		} catch (cause) {
			if (cause?.code === 'ENOENT') return { version: 1, jobs: {} }
			// An unreadable/corrupt ledger is not an empty ledger: starting again
			// could duplicate an expensive render whose outcome is unknown.
			const error = new Error('Avatar job state is unavailable.')
			error.code = 'AVATAR_JOB_PERSISTENCE_FAILED'
			throw error
		}
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
		createIfAbsent: job => withLock(async () => {
			const store = await load()
			const record = durableAvatarJobRecord(job)
			if (Object.hasOwn(store.jobs, record.jobId)) return { record: store.jobs[record.jobId], created: false }
			store.jobs[record.jobId] = record
			await save(store)
			return { record, created: true }
		}),
		put: job => withLock(async () => { const store = await load(); const record = durableAvatarJobRecord(job); store.jobs[record.jobId] = record; await save(store); return record }),
		get: id => load().then(store => store.jobs[String(id || '')] || null),
		purgeExpired: (now = new Date()) => withLock(async () => {
			const store = await load()
			const cutoff = now instanceof Date ? now.getTime() : Date.parse(String(now))
			let removed = 0
			for (const [id, job] of Object.entries(store.jobs || {})) {
				if (Date.parse(job?.expiresAt || '') <= cutoff) { delete store.jobs[id]; removed++ }
			}
			if (removed) await save(store)
			return { removed }
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
	const collection = String(process.env.BETTERPPTX_FIRESTORE_AVATAR_JOB_COLLECTION || 'betterpptx_avatar_jobs').trim()
	return {
		provider: 'firestore', distributed: true,
		async createIfAbsent(job) {
			const record = durableAvatarJobRecord(job)
			const doc = (await firestore()).collection(collection).doc(record.jobId)
			try {
				await doc.create(record)
				return { record, created: true }
			} catch (error) {
				// Atomic create elects one renderer across replicas. A lost write
				// acknowledgement must never trigger a second render or an overwrite.
				if (error?.code !== 6 && error?.code !== 'ALREADY_EXISTS') throw error
				const snapshot = await doc.get()
				if (!snapshot.exists) throw error
				return { record: snapshot.data(), created: false }
			}
		},
		async put(job) { const record = durableAvatarJobRecord(job); await (await firestore()).collection(collection).doc(record.jobId).set(record, { merge: false }); return record },
		async get(id) { const snapshot = await (await firestore()).collection(collection).doc(String(id || '')).get(); return snapshot.exists ? snapshot.data() : null },
		async purgeExpired(now = new Date()) {
			const db = await firestore()
			const snapshot = await db.collection(collection).where('expiresAt', '<=', now instanceof Date ? now : new Date(String(now))).limit(200).get()
			if (snapshot.empty) return { removed: 0 }
			const batch = db.batch()
			for (const doc of snapshot.docs) batch.delete(doc.ref)
			await batch.commit()
			return { removed: snapshot.size }
		},
	}
}

let cachedProvider = ''
let cachedStore = null
export function createAvatarJobStore() {
	const provider = avatarJobStoreProviderName()
	if (cachedStore && cachedProvider === provider) return cachedStore
	if (provider === 'local') cachedStore = createLocalStore()
	else if (provider === 'firestore') cachedStore = createFirestoreStore()
	else cachedStore = { provider: 'disabled', distributed: false, disabled: true }
	cachedProvider = provider
	return cachedStore
}

export async function persistAvatarJob(job) {
	const store = createAvatarJobStore()
	if (store.disabled) return null
	return store.put(job)
}

export async function createAvatarJobIfAbsent(job) {
	const store = createAvatarJobStore()
	if (store.disabled) return { record: null, created: true }
	return store.createIfAbsent(job)
}

export async function loadAvatarJob(id) {
	const store = createAvatarJobStore()
	if (store.disabled) return null
	return store.get(id)
}

export async function purgeExpiredAvatarJobs(now = new Date()) {
	const store = createAvatarJobStore()
	if (store.disabled || typeof store.purgeExpired !== 'function') return { removed: 0, provider: store.provider }
	const result = await store.purgeExpired(now)
	return { ...result, provider: store.provider }
}

export function avatarSessionHash(value) { return hash(value) }
