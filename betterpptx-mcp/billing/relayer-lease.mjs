import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { meteredFirestoreGet, runMeteredFirestoreTransaction } from './firestore-meter.mjs'

export class RelayerLeaseError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'RelayerLeaseError'
		this.code = code
		this.details = details
	}
}

const localLanes = new Map()

function windowsSharingViolation(error) {
	return process.platform === 'win32' && ['EACCES', 'EPERM', 'EBUSY'].includes(error?.code)
}

function localLeaseDirectory() {
	return path.resolve(process.env.BETTERPPTX_X402_RELAYER_LEASE_DIR
		|| path.join(path.dirname(path.resolve(process.env.BETTERPPTX_X402_FILE
			|| path.join(process.env.BETTERPPTX_OUT_DIR || process.env.BETTERPPTX_DOWNLOAD_ROOT || 'outputs', 'betterpptx-x402-quotes.json'))), 'x402-relayer-state'))
}

// An expired lock is NOT permission to broadcast: an old holder may still be
// inside an RPC write. Abandoned locks require private, reconciled recovery.
export async function withLocalBillingFileLock(file, fn, { waitMs = leaseWaitMs() } = {}) {
	if (!Number.isSafeInteger(waitMs) || waitMs < 0 || waitMs > 300000) {
		throw new RelayerLeaseError('RELAYER_LEASE_OPTIONS_INVALID', 'Payment coordination settings are invalid.')
	}
	const lockFile = `${path.resolve(file)}.lock`
	fs.mkdirSync(path.dirname(lockFile), { recursive: true })
	const started = Date.now()
	let descriptor
	for (;;) {
		try {
			descriptor = fs.openSync(lockFile, 'wx', 0o600)
			break
		} catch (error) {
			// Windows may report sharing/delete-pending contention as access denied
			// while another process closes/removes the lock. Retry ONLY exclusive
			// creation within the same deadline; never remove or take over a lock.
			if (error.code !== 'EEXIST' && !windowsSharingViolation(error)) throw new RelayerLeaseError('RELAYER_LEASE_STORE_UNAVAILABLE', 'Payment coordination storage is unavailable.')
			if (Date.now() - started >= waitMs) {
				throw error.code === 'EEXIST'
					? new RelayerLeaseError('RELAYER_LEASE_BUSY', 'Payment processing is busy. Retry shortly.')
					: new RelayerLeaseError('RELAYER_LEASE_STORE_UNAVAILABLE', 'Payment coordination storage is unavailable.')
			}
			await sleep(Math.min(25, Math.max(1, waitMs - (Date.now() - started))))
		}
	}
	try {
		return await fn()
	} finally {
		fs.closeSync(descriptor)
		const releaseStarted = Date.now()
		for (;;) {
			try { fs.unlinkSync(lockFile); break }
			catch (error) {
				if (!windowsSharingViolation(error) || Date.now() - releaseStarted >= 250) throw new RelayerLeaseError('RELAYER_LEASE_STORE_UNAVAILABLE', 'Payment coordination storage requires recovery.')
				await sleep(10)
			}
		}
	}
}

export function writeBillingJsonAtomically(file, value) {
	fs.mkdirSync(path.dirname(file), { recursive: true })
	const temporary = `${file}.${crypto.randomBytes(12).toString('hex')}.tmp`
	const descriptor = fs.openSync(temporary, 'wx', 0o600)
	try {
		fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`)
		fs.fsyncSync(descriptor)
	} finally {
		fs.closeSync(descriptor)
	}
	fs.renameSync(temporary, file)
}

function enabled(name) {
	return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase())
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

function prefix() {
	return String(process.env.BETTERPPTX_FIRESTORE_BILLING_PREFIX || 'betterpptx_billing').trim()
}

function sanitizeKeyId(value) {
	const text = String(value || process.env.BETTERPPTX_X402_RELAYER_KEY_ID || 'default').trim().toLowerCase()
	const safe = text.replace(/[^a-z0-9_.:-]/g, '_').slice(0, 96)
	return safe || 'default'
}

function leaseTtlMs() {
	const value = Number(process.env.BETTERPPTX_X402_RELAYER_LEASE_TTL_MS)
	return Number.isFinite(value) && value >= 1000 ? Math.round(value) : 15_000
}

function leaseWaitMs() {
	const value = Number(process.env.BETTERPPTX_X402_RELAYER_LEASE_WAIT_MS)
	return Number.isFinite(value) && value >= 0 ? Math.round(value) : 10_000
}

export function relayerLeaseProviderName() {
	return String(
		process.env.BETTERPPTX_X402_RELAYER_LEASE_STORE
		|| process.env.BETTERPPTX_X402_STORE
		|| process.env.BETTERPPTX_BILLING_LEDGER_STORE
		|| 'local',
	).trim().toLowerCase()
}

function requireSharedStore(provider) {
	if (enabled('BETTERPPTX_REQUIRE_SHARED_STORES') && provider !== 'firestore') {
		throw new RelayerLeaseError(
			'RELAYER_LEASE_NOT_SHARED',
			'x402 relayer lease storage is not configured for shared production settlement.',
		)
	}
}

function newFencingToken() {
	return `rl_${Date.now().toString(36)}_${crypto.randomBytes(12).toString('hex')}`
}

async function withLocalRelayerLease({ keyId = 'default', waitMs = leaseWaitMs() } = {}, fn) {
	const key = sanitizeKeyId(keyId)
	requireSharedStore('local')
	const lease = {
		provider: 'local',
		keyId: key,
		fencingToken: newFencingToken(),
		acquiredAt: new Date().toISOString(),
	}
	const file = path.join(localLeaseDirectory(), `lane-${crypto.createHash('sha256').update(key).digest('hex')}`)
	return withLocalBillingFileLock(file, async () => {
		localLanes.set(key, lease.fencingToken)
		try { return await fn({ ...lease, assertHeld: async () => true }) }
		finally { localLanes.delete(key) }
	}, { waitMs })
}

let firestorePromise = null
async function firestore() {
	if (!firestorePromise) {
		firestorePromise = import('@google-cloud/firestore').then(({ Firestore }) => new Firestore({
			projectId: process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined,
			databaseId: process.env.BETTERPPTX_FIRESTORE_DATABASE || undefined,
		}))
	}
	return firestorePromise
}

async function relayerLeaseRef(keyId, suppliedDb = null) {
	const db = suppliedDb || await firestore()
	return {
		db,
		ref: db.collection(`${prefix()}_x402_relayer_leases`).doc(sanitizeKeyId(keyId)),
	}
}

async function acquireFirestoreLease({ keyId = 'default', ttlMs = leaseTtlMs(), waitMs = leaseWaitMs(), db: suppliedDb = null } = {}) {
	requireSharedStore('firestore')
	const key = sanitizeKeyId(keyId)
	const started = Date.now()
	let lastBusy = null
	do {
		const token = newFencingToken()
		const { db, ref } = await relayerLeaseRef(key, suppliedDb)
		try {
			return await runMeteredFirestoreTransaction(db, async tx => {
				const snap = await tx.get(ref)
				const data = snap.exists ? snap.data() || {} : {}
				const nowMs = Date.now()
				const currentExpiry = Date.parse(data.leaseExpiresAt || 0)
				if (data.state === 'held' || (data.fencingToken && data.state !== 'released') || currentExpiry > nowMs) {
					throw new RelayerLeaseError('RELAYER_LEASE_BUSY', 'x402 relayer is busy. Retry shortly.', {
						keyId: key,
						leaseExpiresAt: data.leaseExpiresAt || null,
					})
				}
				const lease = {
					provider: 'firestore',
					keyId: key,
					fencingToken: token,
					holder: String(process.env.K_REVISION || process.pid || 'local'),
					acquiredAt: new Date(nowMs).toISOString(),
					leaseExpiresAt: new Date(nowMs + ttlMs).toISOString(),
				}
				tx.set(ref, {
					...lease,
					state: 'held',
					updatedAt: lease.acquiredAt,
				}, { merge: true })
				return lease
			})
		} catch (error) {
			if (error?.code !== 'RELAYER_LEASE_BUSY') throw error
			lastBusy = error
			if (Date.now() - started < waitMs) await sleep(Math.min(50, waitMs - (Date.now() - started)))
		}
	} while (Date.now() - started < waitMs)
	throw lastBusy || new RelayerLeaseError('RELAYER_LEASE_BUSY', 'x402 relayer is busy. Retry shortly.', { keyId: key })
}

async function releaseFirestoreLease(lease, suppliedDb = null) {
	const { db, ref } = await relayerLeaseRef(lease.keyId, suppliedDb)
	await runMeteredFirestoreTransaction(db, async tx => {
		const snap = await tx.get(ref)
		if (!snap.exists) return
		const data = snap.data() || {}
		if (data.fencingToken !== lease.fencingToken) return
		const now = new Date().toISOString()
		tx.set(ref, {
			state: 'released',
			releasedAt: now,
			leaseExpiresAt: now,
			updatedAt: now,
		}, { merge: true })
	})
}

async function withFirestoreRelayerLease(options = {}, fn) {
	const lease = await acquireFirestoreLease(options)
	try {
		return await fn({ ...lease, async assertHeld() {
			const { ref } = await relayerLeaseRef(lease.keyId, options.db)
			const snap = await meteredFirestoreGet(ref)
			if (!snap.exists || snap.data()?.fencingToken !== lease.fencingToken || snap.data()?.state !== 'held') {
				throw new RelayerLeaseError('RELAYER_LEASE_LOST', 'Payment coordination was interrupted. Retry after reconciliation.')
			}
			return true
		} })
	} finally {
		await releaseFirestoreLease(lease, options.db).catch(() => {})
	}
}

export async function withRelayerBroadcastLease(options = {}, fn) {
	if (typeof fn !== 'function') {
		throw new RelayerLeaseError('RELAYER_LEASE_CALLBACK_MISSING', 'Relayer lease callback is required.')
	}
	for (const [key, fallback] of [['waitMs', leaseWaitMs()], ['ttlMs', leaseTtlMs()]]) {
		const value = options[key] ?? fallback
		if (!Number.isSafeInteger(value) || value < (key === 'ttlMs' ? 1 : 0) || value > 300000) {
			throw new RelayerLeaseError('RELAYER_LEASE_OPTIONS_INVALID', 'Payment coordination settings are invalid.')
		}
	}
	const provider = relayerLeaseProviderName()
	if (provider === 'local') return withLocalRelayerLease(options, fn)
	if (provider === 'firestore') return withFirestoreRelayerLease(options, fn)
	throw new RelayerLeaseError('RELAYER_LEASE_STORE_UNAVAILABLE', 'x402 relayer lease storage is not configured.')
}

// Persist intent BEFORE any provider write. A timeout, process death, or missing
// transaction hash can only enter reconciliation; it never authorizes a resend.
export async function withX402BroadcastOnce(options = {}, fn) {
	const { authorizationId, quoteId } = options
	if (!authorizationId || !quoteId) throw new RelayerLeaseError('X402_BROADCAST_BINDING_MISSING', 'Payment binding is required.')
	const digest = crypto.createHash('sha256').update(String(authorizationId)).digest('hex')
	return withRelayerBroadcastLease(options, async lease => {
		const pending = { authorizationId, quoteId, state: 'submitting', createdAt: new Date().toISOString() }
		const check = record => {
			if (!record || !['submitting', 'submitted'].includes(record.state)
				|| (record.state === 'submitted' && !/^0x[a-f0-9]{64}$/.test(record.txHash || ''))) {
				throw new RelayerLeaseError('X402_BROADCAST_STATE_UNAVAILABLE', 'Payment reconciliation is required.')
			}
			if (record.authorizationId !== authorizationId || record.quoteId !== quoteId) {
				throw new RelayerLeaseError('X402_AUTHORIZATION_REPLAYED', 'Payment authorization was already assigned.')
			}
			return record
		}
		let saveHash
		let existing
		if (lease.provider === 'firestore') {
			const db = options.db || await firestore()
			const ref = db.collection(`${prefix()}_x402_broadcasts`).doc(digest)
			existing = await runMeteredFirestoreTransaction(db, async tx => {
				const snap = await tx.get(ref)
				if (snap.exists) return check(snap.data())
				tx.create(ref, pending)
				return null
			})
			saveHash = txHash => runMeteredFirestoreTransaction(db, async tx => {
				const snap = await tx.get(ref)
				if (!snap.exists) throw new RelayerLeaseError('X402_BROADCAST_STATE_LOST', 'Payment reconciliation is required.')
				check(snap.data())
				tx.set(ref, { ...pending, state: 'submitted', txHash })
			})
		} else {
			const file = path.join(localLeaseDirectory(), `authorization-${digest}.json`)
			existing = await withLocalBillingFileLock(file, () => {
				try {
					return check(JSON.parse(fs.readFileSync(file, 'utf8')))
				} catch (error) {
					if (error.code !== 'ENOENT') throw new RelayerLeaseError('X402_BROADCAST_STATE_UNAVAILABLE', 'Payment reconciliation is required.')
				}
				writeBillingJsonAtomically(file, pending)
				return null
			})
			saveHash = txHash => withLocalBillingFileLock(file, () => {
				check(JSON.parse(fs.readFileSync(file, 'utf8')))
				writeBillingJsonAtomically(file, { ...pending, state: 'submitted', txHash })
			})
		}
		if (existing) return existing
		await lease.assertHeld()
		const txHash = await fn(lease)
		if (txHash == null) return pending
		if (!/^0x[\da-f]{64}$/i.test(txHash)) throw new RelayerLeaseError('X402_BROADCAST_RESULT_INVALID', 'Payment reconciliation is required.')
		await saveHash(txHash.toLowerCase())
		return { ...pending, state: 'submitted', txHash: txHash.toLowerCase() }
	})
}

export async function readRelayerLeaseStatus({ keyId = 'default' } = {}) {
	const provider = relayerLeaseProviderName()
	if (provider === 'local') {
		const key = sanitizeKeyId(keyId)
		const file = path.join(localLeaseDirectory(), `lane-${crypto.createHash('sha256').update(key).digest('hex')}.lock`)
		return { provider, shared: false, keyId: key, active: localLanes.has(key) || fs.existsSync(file) }
	}
	if (provider === 'firestore') {
		const { ref } = await relayerLeaseRef(keyId)
		const snap = await meteredFirestoreGet(ref)
		return {
			provider,
			shared: true,
			keyId: sanitizeKeyId(keyId),
			...(snap.exists ? snap.data() : { state: 'missing' }),
		}
	}
	return { provider, shared: false, keyId: sanitizeKeyId(keyId), state: 'unavailable' }
}
