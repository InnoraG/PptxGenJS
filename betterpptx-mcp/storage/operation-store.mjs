import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import {
	meteredFirestoreGet,
	runMeteredFirestoreTransaction,
} from '../billing/firestore-meter.mjs'

export class OperationStoreError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'OperationStoreError'
		this.code = code
		this.details = details
	}
}

function enabled(name) {
	return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase())
}

export function operationStoreProviderName() {
	return String(process.env.BETTERPPTX_DURABLE_OPERATION_STORE || process.env.BETTERPPTX_OPERATION_STORE || 'disabled').trim().toLowerCase()
}

export function isDurableOperationStoreConfigured() {
	return ['local', 'firestore'].includes(operationStoreProviderName())
}

export function isDistributedOperationStoreConfigured() {
	return operationStoreProviderName() === 'firestore'
}

function requireSharedStore(provider) {
	if (enabled('BETTERPPTX_REQUIRE_DURABLE_OPERATIONS') && provider !== 'firestore') {
		throw new OperationStoreError(
			'OPERATION_STORE_NOT_DISTRIBUTED',
			'Distributed durable operations are required but not configured.',
			{ provider },
		)
	}
}

function prefix() {
	return String(process.env.BETTERPPTX_FIRESTORE_OPERATION_PREFIX || process.env.BETTERPPTX_FIRESTORE_BILLING_PREFIX || 'betterpptx').trim()
}

function localFile() {
	const configured = String(process.env.BETTERPPTX_OPERATION_STORE_FILE || '').trim()
	if (configured) return path.resolve(configured)
	const root = String(process.env.BETTERPPTX_OUT_DIR || process.env.BETTERPPTX_DOWNLOAD_ROOT || 'outputs').trim()
	return path.resolve(root, 'betterpptx-operation-store.json')
}

function nowIso(nowMs = Date.now()) {
	return new Date(nowMs).toISOString()
}

function clone(value) {
	if (value === undefined || value === null) return value
	try { return structuredClone(value) } catch (_) { return JSON.parse(JSON.stringify(value)) }
}

function stableForHash(value) {
	if (value === undefined) return null
	if (value === null || typeof value !== 'object') return value
	if (Array.isArray(value)) return value.map(stableForHash)
	return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableForHash(value[key])]))
}

export function digestOperationPayload(input = {}) {
	return crypto.createHash('sha256').update(JSON.stringify(stableForHash(input))).digest('hex')
}

function randomOperationId() {
	return `op_${crypto.randomBytes(16).toString('hex')}`
}

function normalizeKey(key = '') {
	const text = String(key || '').trim()
	if (!text) return ''
	if (!/^[A-Za-z0-9._:-]{1,200}$/.test(text)) {
		throw new OperationStoreError(
			'OPERATION_IDEMPOTENCY_KEY_INVALID',
			'Operation idempotency keys may contain only letters, digits, dot, underscore, colon, or dash characters.',
			{ maxLength: 200 },
		)
	}
	return text
}

function idempotencyDocumentId({ installHash = '', toolName = '', idempotencyKey = '' } = {}) {
	const key = normalizeKey(idempotencyKey)
	if (!key) return ''
	return crypto.createHash('sha256').update(JSON.stringify({
		installHash: String(installHash || ''),
		toolName: String(toolName || ''),
		idempotencyKey: key,
	})).digest('hex')
}

function requestDigest(input = {}) {
	return digestOperationPayload({
		installHash: input.installHash || '',
		toolName: input.toolName || '',
		deckId: input.deckId || '',
		deckHash: input.deckHash || '',
		expectedDeckVersion: input.expectedDeckVersion ?? null,
		inputDigest: input.inputDigest || '',
		pricingInputDigest: input.pricingInputDigest || '',
		queueClass: input.queueClass || 'default',
		metadata: input.metadata || {},
	})
}

function publicOperation(input = {}, nowMs = Date.now()) {
	const operationId = String(input.operationId || randomOperationId())
	const createdAt = nowIso(nowMs)
	return {
		operationId,
		installHash: String(input.installHash || ''),
		toolName: String(input.toolName || ''),
		deckId: String(input.deckId || ''),
		deckHash: String(input.deckHash || ''),
		expectedDeckVersion: input.expectedDeckVersion === undefined || input.expectedDeckVersion === null
			? null
			: Number(input.expectedDeckVersion),
		inputDigest: String(input.inputDigest || ''),
		pricingInputDigest: String(input.pricingInputDigest || ''),
		queueClass: String(input.queueClass || 'default'),
		state: String(input.state || 'queued'),
		attempt: Number(input.attempt || 0),
		leaseOwner: '',
		leaseExpiresAt: '',
		fencingToken: Number(input.fencingToken || 0),
		result: null,
		error: null,
		metadata: clone(input.metadata || {}),
		request: input.request ? clone(input.request) : null,
		createdAt,
		updatedAt: createdAt,
	}
}

function emptyLocalStore() {
	return { version: 1, operations: {}, idempotency: {} }
}

function leaseToken(operation) {
	return `${operation.operationId}:${operation.fencingToken}`
}

function assertLease(operation, token) {
	const expected = leaseToken(operation)
	if (String(token || '') !== expected) {
		throw new OperationStoreError(
			'OPERATION_LEASE_STALE',
			'Operation lease is stale or does not match the current fencing token.',
			{
				operationId: operation.operationId,
				state: operation.state,
				fencingToken: operation.fencingToken,
			},
		)
	}
}

function terminal(operation = {}) {
	return operation.state === 'succeeded' || operation.state === 'failed' || operation.state === 'cancelled'
}

function normalizeError(error = {}) {
	if (!error) return null
	return {
		code: String(error.code || error.name || 'OPERATION_FAILED'),
		message: String(error.message || error),
		retryable: Boolean(error.retryable),
		details: clone(error.details || {}),
	}
}

function createLocalOperationStore() {
	requireSharedStore('local')
	const file = localFile()
	let lock = Promise.resolve()

	function load() {
		try {
			if (fs.existsSync(file)) return { ...emptyLocalStore(), ...JSON.parse(fs.readFileSync(file, 'utf8')) }
		} catch {}
		return emptyLocalStore()
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

	async function createOrGetOperation(input = {}) {
		return withLock(() => {
			const store = load()
			const nowMs = input.nowMs || Date.now()
			const idemId = idempotencyDocumentId(input)
			const digest = requestDigest(input)
			if (idemId) {
				const existing = store.idempotency[idemId]
				if (existing) {
					if (existing.requestDigest !== digest) {
						throw new OperationStoreError(
							'OPERATION_IDEMPOTENCY_CONFLICT',
							'Operation idempotency key was already used with different arguments.',
							{
								idempotencyKey: normalizeKey(input.idempotencyKey),
								operationId: existing.operationId,
							},
						)
					}
					const operation = store.operations[existing.operationId]
					if (!operation) {
						throw new OperationStoreError(
							'OPERATION_IDEMPOTENCY_DANGLING',
							'Operation idempotency record points to a missing operation.',
							{ operationId: existing.operationId },
						)
					}
					return { operation: clone(operation), created: false, idempotentReplay: true }
				}
			}
			const operation = publicOperation(input, nowMs)
			store.operations[operation.operationId] = operation
			if (idemId) {
				store.idempotency[idemId] = {
					idempotencyId: idemId,
					idempotencyKey: normalizeKey(input.idempotencyKey),
					operationId: operation.operationId,
					requestDigest: digest,
					createdAt: operation.createdAt,
				}
			}
			save(store)
			return { operation: clone(operation), created: true, idempotentReplay: false }
		})
	}

	async function getOperation(operationId) {
		const operation = load().operations[String(operationId)]
		return operation ? clone(operation) : null
	}

	async function findOperationByIdempotencyKey(input = {}) {
		const id = idempotencyDocumentId(input)
		if (!id) return null
		const store = load()
		const operationId = store.idempotency[id]?.operationId
		return operationId && store.operations[operationId] ? clone(store.operations[operationId]) : null
	}

	async function claimOperation(operationId, { leaseOwner = '', leaseMs = 60000, nowMs = Date.now() } = {}) {
		return withLock(() => {
			const store = load()
			const operation = store.operations[String(operationId)]
			if (!operation) throw new OperationStoreError('OPERATION_NOT_FOUND', 'Operation was not found.', { operationId })
			if (terminal(operation)) {
				return { operation: clone(operation), claimed: false, terminal: true, lease: null }
			}
			const expiresMs = operation.leaseExpiresAt ? Date.parse(operation.leaseExpiresAt) : 0
			if (operation.state === 'running' && Number.isFinite(expiresMs) && expiresMs > nowMs) {
				throw new OperationStoreError(
					'OPERATION_ALREADY_LEASED',
					'Operation is already leased by another worker.',
					{ operationId, leaseOwner: operation.leaseOwner, leaseExpiresAt: operation.leaseExpiresAt },
				)
			}
			operation.state = 'running'
			operation.attempt = Number(operation.attempt || 0) + 1
			operation.fencingToken = Number(operation.fencingToken || 0) + 1
			operation.leaseOwner = String(leaseOwner || `worker-${process.pid}`)
			operation.leaseExpiresAt = nowIso(nowMs + Math.max(1, Number(leaseMs) || 60000))
			operation.updatedAt = nowIso(nowMs)
			save(store)
			return {
				operation: clone(operation),
				claimed: true,
				terminal: false,
				lease: {
					operationId: operation.operationId,
					leaseOwner: operation.leaseOwner,
					leaseExpiresAt: operation.leaseExpiresAt,
					fencingToken: operation.fencingToken,
					leaseToken: leaseToken(operation),
				},
			}
		})
	}

	async function completeOperation(operationId, { leaseToken: token = '', result = {}, nowMs = Date.now() } = {}) {
		return withLock(() => {
			const store = load()
			const operation = store.operations[String(operationId)]
			if (!operation) throw new OperationStoreError('OPERATION_NOT_FOUND', 'Operation was not found.', { operationId })
			assertLease(operation, token)
			if (terminal(operation)) return clone(operation)
			operation.state = 'succeeded'
			operation.result = clone(result || {})
			operation.error = null
			operation.completedAt = nowIso(nowMs)
			operation.leaseExpiresAt = ''
			operation.updatedAt = nowIso(nowMs)
			save(store)
			return clone(operation)
		})
	}

	async function failOperation(operationId, { leaseToken: token = '', error = {}, retryable = false, nowMs = Date.now() } = {}) {
		return withLock(() => {
			const store = load()
			const operation = store.operations[String(operationId)]
			if (!operation) throw new OperationStoreError('OPERATION_NOT_FOUND', 'Operation was not found.', { operationId })
			assertLease(operation, token)
			if (terminal(operation)) return clone(operation)
			operation.state = retryable ? 'retry' : 'failed'
			operation.error = normalizeError({ ...error, retryable })
			operation.result = null
			operation.failedAt = nowIso(nowMs)
			operation.leaseExpiresAt = ''
			operation.updatedAt = nowIso(nowMs)
			save(store)
			return clone(operation)
		})
	}

	async function releaseOperation(operationId, { leaseToken: token = '', nowMs = Date.now() } = {}) {
		return withLock(() => {
			const store = load()
			const operation = store.operations[String(operationId)]
			if (!operation) throw new OperationStoreError('OPERATION_NOT_FOUND', 'Operation was not found.', { operationId })
			assertLease(operation, token)
			if (terminal(operation)) return clone(operation)
			if (operation.state === 'running') operation.state = 'queued'
			operation.leaseOwner = ''
			operation.leaseExpiresAt = ''
			operation.updatedAt = nowIso(nowMs)
			save(store)
			return clone(operation)
		})
	}

	return {
		provider: 'local',
		distributed: false,
		createOrGetOperation,
		getOperation,
		findOperationByIdempotencyKey,
		claimOperation,
		completeOperation,
		failOperation,
		releaseOperation,
	}
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

async function firestoreRefs() {
	const db = await firestore()
	return {
		db,
		operations: db.collection(`${prefix()}_operations`),
		idempotency: db.collection(`${prefix()}_operation_idempotency`),
	}
}

function createFirestoreOperationStore() {
	requireSharedStore('firestore')

	async function createOrGetOperation(input = {}) {
		const refs = await firestoreRefs()
		const nowMs = input.nowMs || Date.now()
		const operation = publicOperation(input, nowMs)
		const idemId = idempotencyDocumentId(input)
		const digest = requestDigest(input)
		const opRef = refs.operations.doc(operation.operationId)
		const idemRef = idemId ? refs.idempotency.doc(idemId) : null
		return runMeteredFirestoreTransaction(refs.db, async tx => {
			if (idemRef) {
				const idemSnap = await tx.get(idemRef)
				if (idemSnap.exists) {
					const existing = idemSnap.data() || {}
					if (existing.requestDigest !== digest) {
						throw new OperationStoreError(
							'OPERATION_IDEMPOTENCY_CONFLICT',
							'Operation idempotency key was already used with different arguments.',
							{
								idempotencyKey: normalizeKey(input.idempotencyKey),
								operationId: existing.operationId,
							},
						)
					}
					const existingSnap = await tx.get(refs.operations.doc(String(existing.operationId)))
					if (!existingSnap.exists) {
						throw new OperationStoreError(
							'OPERATION_IDEMPOTENCY_DANGLING',
							'Operation idempotency record points to a missing operation.',
							{ operationId: existing.operationId },
						)
					}
					return { operation: existingSnap.data(), created: false, idempotentReplay: true }
				}
			}
			tx.create(opRef, operation)
			if (idemRef) tx.create(idemRef, {
				idempotencyId: idemId,
				idempotencyKey: normalizeKey(input.idempotencyKey),
				operationId: operation.operationId,
				requestDigest: digest,
				createdAt: operation.createdAt,
			})
			return { operation, created: true, idempotentReplay: false }
		})
	}

	async function getOperation(operationId) {
		const refs = await firestoreRefs()
		const snap = await meteredFirestoreGet(refs.operations.doc(String(operationId)))
		return snap.exists ? snap.data() || null : null
	}

	async function findOperationByIdempotencyKey(input = {}) {
		const id = idempotencyDocumentId(input)
		if (!id) return null
		const refs = await firestoreRefs()
		const index = await meteredFirestoreGet(refs.idempotency.doc(id))
		if (!index.exists) return null
		const operationId = String(index.data()?.operationId || '')
		return operationId ? getOperation(operationId) : null
	}

	async function claimOperation(operationId, { leaseOwner = '', leaseMs = 60000, nowMs = Date.now() } = {}) {
		const refs = await firestoreRefs()
		const opRef = refs.operations.doc(String(operationId))
		return runMeteredFirestoreTransaction(refs.db, async tx => {
			const snap = await tx.get(opRef)
			if (!snap.exists) throw new OperationStoreError('OPERATION_NOT_FOUND', 'Operation was not found.', { operationId })
			const operation = snap.data() || {}
			if (terminal(operation)) {
				return { operation, claimed: false, terminal: true, lease: null }
			}
			const expiresMs = operation.leaseExpiresAt ? Date.parse(operation.leaseExpiresAt) : 0
			if (operation.state === 'running' && Number.isFinite(expiresMs) && expiresMs > nowMs) {
				throw new OperationStoreError(
					'OPERATION_ALREADY_LEASED',
					'Operation is already leased by another worker.',
					{ operationId, leaseOwner: operation.leaseOwner, leaseExpiresAt: operation.leaseExpiresAt },
				)
			}
			const updated = {
				...operation,
				state: 'running',
				attempt: Number(operation.attempt || 0) + 1,
				fencingToken: Number(operation.fencingToken || 0) + 1,
				leaseOwner: String(leaseOwner || `worker-${process.pid}`),
				leaseExpiresAt: nowIso(nowMs + Math.max(1, Number(leaseMs) || 60000)),
				updatedAt: nowIso(nowMs),
			}
			tx.set(opRef, updated, { merge: false })
			return {
				operation: updated,
				claimed: true,
				terminal: false,
				lease: {
					operationId: updated.operationId,
					leaseOwner: updated.leaseOwner,
					leaseExpiresAt: updated.leaseExpiresAt,
					fencingToken: updated.fencingToken,
					leaseToken: leaseToken(updated),
				},
			}
		})
	}

	async function completeOperation(operationId, { leaseToken: token = '', result = {}, nowMs = Date.now() } = {}) {
		const refs = await firestoreRefs()
		const opRef = refs.operations.doc(String(operationId))
		return runMeteredFirestoreTransaction(refs.db, async tx => {
			const snap = await tx.get(opRef)
			if (!snap.exists) throw new OperationStoreError('OPERATION_NOT_FOUND', 'Operation was not found.', { operationId })
			const operation = snap.data() || {}
			assertLease(operation, token)
			if (terminal(operation)) return operation
			const updated = {
				...operation,
				state: 'succeeded',
				result: clone(result || {}),
				error: null,
				completedAt: nowIso(nowMs),
				leaseExpiresAt: '',
				updatedAt: nowIso(nowMs),
			}
			tx.set(opRef, updated, { merge: false })
			return updated
		})
	}

	async function failOperation(operationId, { leaseToken: token = '', error = {}, retryable = false, nowMs = Date.now() } = {}) {
		const refs = await firestoreRefs()
		const opRef = refs.operations.doc(String(operationId))
		return runMeteredFirestoreTransaction(refs.db, async tx => {
			const snap = await tx.get(opRef)
			if (!snap.exists) throw new OperationStoreError('OPERATION_NOT_FOUND', 'Operation was not found.', { operationId })
			const operation = snap.data() || {}
			assertLease(operation, token)
			if (terminal(operation)) return operation
			const updated = {
				...operation,
				state: retryable ? 'retry' : 'failed',
				error: normalizeError({ ...error, retryable }),
				result: null,
				failedAt: nowIso(nowMs),
				leaseExpiresAt: '',
				updatedAt: nowIso(nowMs),
			}
			tx.set(opRef, updated, { merge: false })
			return updated
		})
	}

	async function releaseOperation(operationId, { leaseToken: token = '', nowMs = Date.now() } = {}) {
		const refs = await firestoreRefs()
		const opRef = refs.operations.doc(String(operationId))
		return runMeteredFirestoreTransaction(refs.db, async tx => {
			const snap = await tx.get(opRef)
			if (!snap.exists) throw new OperationStoreError('OPERATION_NOT_FOUND', 'Operation was not found.', { operationId })
			const operation = snap.data() || {}
			assertLease(operation, token)
			if (terminal(operation)) return operation
			const updated = {
				...operation,
				state: operation.state === 'running' ? 'queued' : operation.state,
				leaseOwner: '',
				leaseExpiresAt: '',
				updatedAt: nowIso(nowMs),
			}
			tx.set(opRef, updated, { merge: false })
			return updated
		})
	}

	return {
		provider: 'firestore',
		distributed: true,
		createOrGetOperation,
		getOperation,
		findOperationByIdempotencyKey,
		claimOperation,
		completeOperation,
		failOperation,
		releaseOperation,
	}
}

export function createOperationStore() {
	const provider = operationStoreProviderName()
	if (provider === 'disabled' || provider === 'off' || provider === 'none') {
		requireSharedStore(provider)
		return { provider: 'disabled', distributed: false, disabled: true }
	}
	if (provider === 'local') return createLocalOperationStore()
	if (provider === 'firestore') return createFirestoreOperationStore()
	throw new OperationStoreError('OPERATION_STORE_UNAVAILABLE', 'Durable operation store provider is unavailable.', { provider })
}

export function operationStoreReadiness() {
	const provider = operationStoreProviderName()
	return {
		provider,
		configured: isDurableOperationStoreConfigured(),
		distributed: isDistributedOperationStoreConfigured(),
		publicProductionEligible: provider === 'firestore',
		requireDurableOperations: enabled('BETTERPPTX_REQUIRE_DURABLE_OPERATIONS'),
	}
}
