// Cross-account idempotency state for the private LivePortrait + MuseTalk workers.
// The store contains only hashed request keys/fingerprints and opaque result objects;
// raw customer media never enters Firestore. Result bytes are retained in the same
// tenant-scoped GCS bucket used by the avatar artifact store.
import * as crypto from 'node:crypto'

const VERSION = 'betterpptx.avatar-worker-idempotency.v1'
const collectionName = () => String(process.env.BETTERPPTX_FIRESTORE_AVATAR_WORKER_IDEMPOTENCY_COLLECTION || 'betterpptx_avatar_worker_idempotency').trim()
const bucketName = () => String(process.env.BETTERPPTX_GEN_ASSET_BUCKET || '').trim()
const resultPrefix = () => String(process.env.BETTERPPTX_AVATAR_WORKER_IDEMPOTENCY_GCS_PREFIX || 'betterpptx-avatar-artifacts/worker-idempotency').replace(/^\/+|\/+$/g, '')
const leaseMs = () => Math.max(60_000, Number(process.env.BETTERPPTX_AVATAR_WORKER_IDEMPOTENCY_LEASE_MS || 1_800_000))
const nowIso = () => new Date().toISOString()
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const keyHash = key => sha256(Buffer.from(String(key || ''), 'utf8'))

function normalizedKey(value) {
	const key = String(value || '').trim()
	if (!key || key.length > 256) throw Object.assign(new Error('Idempotency key is invalid.'), { code: 'AVATAR_IDEMPOTENCY_KEY_INVALID' })
	return key
}

function normalizedFingerprint(value) {
	const fingerprint = String(value || '').trim().toLowerCase()
	if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw Object.assign(new Error('Request fingerprint is invalid.'), { code: 'AVATAR_IDEMPOTENCY_FINGERPRINT_INVALID' })
	return fingerprint
}

let firestorePromise = null
async function firestore() {
	if (!firestorePromise) firestorePromise = import('@google-cloud/firestore').then(({ Firestore }) => new Firestore({
		projectId: process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined,
		databaseId: process.env.BETTERPPTX_FIRESTORE_DATABASE || undefined,
	}))
	return firestorePromise
}

let storagePromise = null
async function storage() {
	if (!storagePromise) storagePromise = import('@google-cloud/storage').then(({ Storage }) => new Storage({ projectId: process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined }))
	return storagePromise
}

function assertConfigured() {
	if (!bucketName()) throw Object.assign(new Error('Avatar worker idempotency result bucket is not configured.'), { code: 'AVATAR_IDEMPOTENCY_STORE_UNAVAILABLE' })
}

function refFor(db, key) {
	return db.collection(collectionName()).doc(keyHash(key))
}

function publicRecord(data) {
	return {
		state: String(data?.state || 'unknown'),
		keyHash: String(data?.keyHash || ''),
		fingerprint: String(data?.fingerprint || ''),
		leaseUntil: data?.leaseUntil || null,
		result: data?.result ? {
			sha256: String(data.result.sha256 || ''),
			bytes: Number(data.result.bytes || 0),
			contentType: String(data.result.contentType || 'video/mp4'),
		} : null,
		updatedAt: data?.updatedAt || null,
	}
}

export function avatarWorkerIdempotencyReadiness() {
	return { provider: 'firestore-gcs', configured: Boolean(bucketName()), distributed: true, publicProductionEligible: Boolean(bucketName()) }
}

export async function acquireAvatarWorkerIdempotency({ key, fingerprint, accountId = '' } = {}) {
	assertConfigured()
	const normalized = normalizedKey(key)
	const fp = normalizedFingerprint(fingerprint)
	const db = await firestore()
	const ref = refFor(db, normalized)
	const now = Date.now()
	let result
	await db.runTransaction(async transaction => {
		const snapshot = await transaction.get(ref)
		if (snapshot.exists) {
			const prior = snapshot.data() || {}
			if (String(prior.fingerprint || '') !== fp) {
				result = { state: 'conflict', record: publicRecord(prior) }
				return
			}
			if (prior.state === 'completed' || prior.state === 'cancelled') {
				result = { state: prior.state, record: publicRecord(prior) }
				return
			}
			const until = Date.parse(String(prior.leaseUntil || ''))
			if (Number.isFinite(until) && until > now) {
				result = { state: 'running', record: publicRecord(prior) }
				return
			}
			const renewed = { ...prior, state: 'running', accountId: String(accountId || ''), leaseUntil: new Date(now + leaseMs()).toISOString(), updatedAt: nowIso(), schemaVersion: VERSION }
			transaction.set(ref, renewed, { merge: false })
			result = { state: 'acquired', record: publicRecord(renewed) }
			return
		}
		const created = {
			schemaVersion: VERSION,
			keyHash: keyHash(normalized),
			fingerprint: fp,
			state: 'running',
			accountId: String(accountId || ''),
			createdAt: nowIso(),
			updatedAt: nowIso(),
			leaseUntil: new Date(now + leaseMs()).toISOString(),
			result: null,
		}
		transaction.create(ref, created)
		result = { state: 'acquired', record: publicRecord(created) }
	})
	return result
}

export async function completeAvatarWorkerIdempotency({ key, fingerprint, bytes, contentType = 'video/mp4' } = {}) {
	assertConfigured()
	const normalized = normalizedKey(key)
	const fp = normalizedFingerprint(fingerprint)
	const payload = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || '')
	if (!payload.length) throw Object.assign(new Error('Idempotency result is empty.'), { code: 'AVATAR_IDEMPOTENCY_RESULT_INVALID' })
	const objectName = `${resultPrefix()}/${keyHash(normalized)}.mp4`
	const digest = sha256(payload)
	const object = (await storage()).bucket(bucketName()).file(objectName)
	await object.save(payload, { resumable: false, contentType: String(contentType || 'video/mp4'), metadata: { metadata: { schemaVersion: VERSION, fingerprint: fp } } })
	const db = await firestore()
	const ref = refFor(db, normalized)
	let result
	try {
		await db.runTransaction(async transaction => {
			const snapshot = await transaction.get(ref)
			if (!snapshot.exists) throw Object.assign(new Error('Idempotency key was not acquired.'), { code: 'AVATAR_IDEMPOTENCY_NOT_FOUND' })
			const prior = snapshot.data() || {}
			if (String(prior.fingerprint || '') !== fp) throw Object.assign(new Error('Idempotency fingerprint conflict.'), { code: 'AVATAR_IDEMPOTENCY_CONFLICT' })
			if (prior.state === 'cancelled') { result = { state: 'cancelled', record: publicRecord(prior) }; return }
			if (prior.state === 'completed') { result = { state: 'completed', record: publicRecord(prior) }; return }
			const completed = { ...prior, state: 'completed', updatedAt: nowIso(), leaseUntil: null, result: { objectName, sha256: digest, bytes: payload.length, contentType: String(contentType || 'video/mp4') } }
			transaction.set(ref, completed, { merge: false })
			result = { state: 'completed', record: publicRecord(completed) }
		})
	} catch (error) {
		try { await object.delete({ ignoreNotFound: true }) } catch {}
		throw error
	}
	return result
}

export async function readAvatarWorkerIdempotencyResult({ key, fingerprint } = {}) {
	assertConfigured()
	const normalized = normalizedKey(key)
	const fp = normalizedFingerprint(fingerprint)
	const db = await firestore()
	const snapshot = await refFor(db, normalized).get()
	if (!snapshot.exists) throw Object.assign(new Error('Idempotency key was not found.'), { code: 'AVATAR_IDEMPOTENCY_NOT_FOUND' })
	const record = snapshot.data() || {}
	if (String(record.fingerprint || '') !== fp) throw Object.assign(new Error('Idempotency fingerprint conflict.'), { code: 'AVATAR_IDEMPOTENCY_CONFLICT' })
	if (record.state !== 'completed' || !record.result?.objectName) throw Object.assign(new Error('Idempotency result is not terminal.'), { code: 'AVATAR_IDEMPOTENCY_RESULT_NOT_READY' })
	const payload = await (await storage()).bucket(bucketName()).file(String(record.result.objectName)).download()
	const bytes = payload?.[0] || Buffer.alloc(0)
	if (sha256(bytes) !== String(record.result.sha256 || '')) throw Object.assign(new Error('Idempotency result digest mismatch.'), { code: 'AVATAR_IDEMPOTENCY_RESULT_CORRUPT' })
	return { bytes, contentType: String(record.result.contentType || 'video/mp4'), record: publicRecord(record) }
}

export async function cancelAvatarWorkerIdempotency({ key, fingerprint, reason = 'client-aborted' } = {}) {
	const normalized = normalizedKey(key)
	const fp = normalizedFingerprint(fingerprint)
	const db = await firestore()
	const ref = refFor(db, normalized)
	let result
	await db.runTransaction(async transaction => {
		const snapshot = await transaction.get(ref)
		if (!snapshot.exists) { result = { state: 'not_found' }; return }
		const prior = snapshot.data() || {}
		if (String(prior.fingerprint || '') !== fp) { result = { state: 'conflict', record: publicRecord(prior) }; return }
		if (prior.state === 'completed' || prior.state === 'cancelled') { result = { state: prior.state, record: publicRecord(prior) }; return }
		const cancelled = { ...prior, state: 'cancelled', cancelReason: String(reason || 'client-aborted').slice(0, 160), leaseUntil: null, updatedAt: nowIso() }
		transaction.set(ref, cancelled, { merge: false })
		result = { state: 'cancelled', record: publicRecord(cancelled) }
	})
	return result
}
