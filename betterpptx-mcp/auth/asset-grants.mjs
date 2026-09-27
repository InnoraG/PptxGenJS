import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomBytes } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { currentResourceOwner, resourceOwnerOf } from './resource-authorization.mjs'
import { isProductionBillingEnvironment } from '../billing/security-policy.mjs'
import { meteredFirestoreGet, runMeteredFirestoreTransaction } from '../billing/firestore-meter.mjs'

// Private server API. Never expose this manager, its production callback or its
// operation argument through an MCP tool. A handle, reimported spec/sidecar or
// cache hit is not evidence of production. Catalog membership is checked by the
// existing catalog resolver; there is deliberately no grantShared operation.
export const ASSET_GRANT_SCHEMA_VERSION = 'betterpptx.asset-grant.v1'
export const MAX_ASSET_GRANTS_PER_PRODUCTION = 128
const MAX_PREFLIGHT_HANDLES = 4096
const PRODUCTION_SOURCES = new Set(['upload', 'generation', 'owned-derivation'])
const HASH = /^[a-f0-9]{64}$/

/** @typedef {{schemaVersion: string, resourceOwner: object, assetKey: string,
 * sha256: string, bytes: number, source: string, operationKey: string, createdAt: string}} AssetGrant */

export class AssetGrantError extends Error {
	constructor(code, message) {
		super(message)
		this.name = 'AssetGrantError'
		this.code = code
	}
}

const unavailable = () => new AssetGrantError('ASSET_NOT_FOUND', 'The asset handle is unavailable.')
const storeUnavailable = () => new AssetGrantError('ASSET_GRANT_STORE_UNAVAILABLE', 'Asset authorization is temporarily unavailable.')
const productionDenied = () => new AssetGrantError('ASSET_PRODUCTION_NOT_AUTHORIZED', 'Asset production could not be authorized.')
const conflict = () => new AssetGrantError('ASSET_CONTENT_CONFLICT', 'The asset content does not match its authorized version.')
const digest = value => createHash('sha256').update(value).digest('hex')
const sameOwner = (a, b) => Boolean(a && b && a.schemaVersion === b.schemaVersion && a.kind === b.kind && a.id === b.id)

// Normalize only known semantic aliases. Public output handles are not rewritten.
// Unknown asset/gen schemes and ambiguous encoded/path segments deny instead of
// escaping the grant guard. Non-private/catalog references remain another resolver's job.
function parseReference(value) {
	if (typeof value !== 'string') throw unavailable()
	const handle = value.trim()
	if (!/^(?:asset|gen|model3d):/i.test(handle)) return null
	if (handle.length > 2048) throw unavailable()
	if (/^(?:asset:\/\/catalog\/|model3d:\/\/)/i.test(handle)) return null
	let match = /^gen:\/\/(?:flux\/)?image\/([a-f0-9]{8,64})$/.exec(handle)
	if (match) return { canonical: `gen://image/${match[1]}`, contentDigest: null }
	match = /^gen:\/\/(?:trellis\/)?rigged3d\/([a-f0-9]{8,64})$/.exec(handle)
	if (match) return { canonical: `gen://rigged3d/${match[1]}`, contentDigest: null }
	match = /^asset:\/\/locked\/([A-Za-z0-9_.-]+)\/([a-f0-9]{64})(?:\.([a-z0-9]+))?$/i.exec(handle)
	if (match && match[1] !== '.' && match[1] !== '..') {
		return {
			canonical: `asset://locked/${match[1].toLowerCase()}/${match[2].toLowerCase()}${match[3] ? `.${match[3].toLowerCase()}` : ''}`,
			contentDigest: match[2].toLowerCase(),
		}
	}
	match = /^asset:\/\/(generated|uploaded)\/([A-Za-z0-9_./-]+)$/.exec(handle)
	if (match && match[2].split('/').every(segment => segment && segment !== '.' && segment !== '..')) {
		return { canonical: handle, contentDigest: null }
	}
	if (/^(?:asset|gen|model3d):/i.test(handle)) throw unavailable()
	return null
}

export function requiresAssetGrant(handle) {
	return parseReference(handle) !== null
}

function privateReference(handle) {
	const parsed = parseReference(handle)
	if (!parsed) throw unavailable()
	return { ...parsed, assetKey: digest(parsed.canonical) }
}

function bytesEvidence(bytes) {
	if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw productionDenied()
	return { sha256: digest(bytes), bytes: bytes.byteLength }
}

// For a generated handle whose result includes several blobs (e.g. GLB + poster),
// capture and verify the same deterministic digest bundle before using any part.
// No raw bytes, paths or client identity enter the serialized bundle.
export function assetGrantBundleBytes(parts) {
	if (!parts || typeof parts !== 'object' || Array.isArray(parts)) throw productionDenied()
	const names = Object.keys(parts).sort()
	if (!names.length || names.length > MAX_ASSET_GRANTS_PER_PRODUCTION) throw productionDenied()
	const evidence = names.map(name => {
		if (!/^[A-Za-z0-9_.-]{1,80}$/.test(name)) throw productionDenied()
		const descriptor = Object.getOwnPropertyDescriptor(parts, name)
		if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw productionDenied()
		return [name, bytesEvidence(descriptor.value)]
	})
	return Buffer.from(JSON.stringify({ schemaVersion: 'betterpptx.asset-content-bundle.v1', parts: evidence }))
}

function documentId(owner, assetKey) {
	return digest(JSON.stringify([ASSET_GRANT_SCHEMA_VERSION, owner.kind, owner.id, assetKey]))
}

function validGrant(record, owner, assetKey, contentDigest = null) {
	return Boolean(record && record.schemaVersion === ASSET_GRANT_SCHEMA_VERSION
		&& sameOwner(resourceOwnerOf(record), owner) && record.assetKey === assetKey
		&& typeof record.sha256 === 'string' && HASH.test(record.sha256)
		&& (!contentDigest || contentDigest === record.sha256)
		&& Number.isSafeInteger(record.bytes) && record.bytes > 0
		&& PRODUCTION_SOURCES.has(record.source) && typeof record.operationKey === 'string' && HASH.test(record.operationKey)
		&& typeof record.createdAt === 'string' && Number.isFinite(Date.parse(record.createdAt)))
}

function existingOrNew(existing, proposed) {
	if (existing === undefined) return proposed
	if (!validGrant(existing, proposed.resourceOwner, proposed.assetKey)) throw unavailable()
	if (existing.sha256 !== proposed.sha256 || existing.bytes !== proposed.bytes) throw conflict()
	return existing
}

// One immutable file/document per (owner, canonical handle). No shared owner
// array or read/modify/write index can lose a second owner's independent grant.
function localBackend(directory) {
	const target = id => path.join(directory, id.slice(0, 2), `${id}.json`)
	async function read(id) {
		try {
			const bytes = await fs.readFile(target(id))
			if (bytes.length > 16384) throw unavailable()
			return JSON.parse(bytes.toString('utf8'))
		} catch (error) {
			if (error?.code === 'ENOENT') return undefined
			throw error
		}
	}
	async function put(record) {
		const id = documentId(record.resourceOwner, record.assetKey)
		const existing = await read(id)
		if (existing !== undefined) return existingOrNew(existing, record)
		const destination = target(id)
		await fs.mkdir(path.dirname(destination), { recursive: true })
		const temporary = `${destination}.tmp-${randomBytes(12).toString('hex')}`
		let file
		try {
			file = await fs.open(temporary, 'wx', 0o600)
			await file.writeFile(JSON.stringify(record))
			await file.sync()
			await file.close()
			file = null
			// A same-volume hard link publishes a fully written immutable file and
			// refuses overwrite even with competing processes. No rename-overwrite.
			try { await fs.link(temporary, destination) }
			catch (error) {
				if (error?.code !== 'EEXIST') throw error
				const raced = await read(id)
				if (raced === undefined) throw storeUnavailable()
				return existingOrNew(raced, record)
			}
			return record
		} finally {
			if (file) await file.close().catch(() => {})
			await fs.unlink(temporary).catch(() => {})
		}
	}
	return {
		shared: false, read,
		async putMany(records) {
			await Promise.all(records.map(async record => existingOrNew(await read(documentId(record.resourceOwner, record.assetKey)), record)))
			return Promise.all(records.map(put))
		},
	}
}

function firestoreBackend(env, suppliedClient) {
	const collectionName = env.BETTERPPTX_FIRESTORE_ASSET_GRANTS_COLLECTION || 'betterpptx_asset_grants'
	if (typeof collectionName !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(collectionName)) return null
	let clientPromise
	const client = () => {
		if (!clientPromise) clientPromise = suppliedClient ? Promise.resolve(suppliedClient)
			: import('@google-cloud/firestore').then(({ Firestore }) => new Firestore({
				projectId: env.BETTERPPTX_GCP_PROJECT || env.GOOGLE_CLOUD_PROJECT || undefined,
				databaseId: env.BETTERPPTX_FIRESTORE_DATABASE || undefined,
			}))
		return clientPromise
	}
	return {
		shared: true,
		async read(id) {
			const snapshot = await meteredFirestoreGet((await client()).collection(collectionName).doc(id))
			return snapshot.exists ? snapshot.data() : undefined
		},
		async putMany(records) {
			const db = await client()
			const refs = records.map(record => db.collection(collectionName).doc(documentId(record.resourceOwner, record.assetKey)))
			return runMeteredFirestoreTransaction(db, async transaction => {
				const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)))
				const result = records.map((record, i) => existingOrNew(snapshots[i].exists ? snapshots[i].data() : undefined, record))
				for (let i = 0; i < records.length; i++) if (!snapshots[i].exists) transaction.set(refs[i], records[i], { merge: false })
				return result
			})
		},
	}
}

/**
 * Server configuration only. Defaults disabled. Local requires an explicit
 * absolute BETTERPPTX_ASSET_GRANT_DIR; production/shared deployments require
 * BETTERPPTX_ASSET_GRANT_STORE=firestore. Injected env/client are offline test seams.
 */
export function createAssetGrantManager({ env = process.env, firestoreClient = null } = {}) {
	const provider = String(env.BETTERPPTX_ASSET_GRANT_STORE || 'disabled').trim().toLowerCase()
	const directory = env.BETTERPPTX_ASSET_GRANT_DIR
	const backend = provider === 'firestore' ? firestoreBackend(env, firestoreClient)
		: provider === 'local' && typeof directory === 'string' && path.isAbsolute(directory) ? localBackend(path.resolve(directory)) : null
	const access = new AsyncLocalStorage()
	const productions = new AsyncLocalStorage()
	function assertReady() {
		const sharedRequired = isProductionBillingEnvironment(env) || env.BETTERPPTX_REQUIRE_SHARED_STORES === '1' || Boolean(env.K_SERVICE)
		if (!backend || (sharedRequired && !backend.shared)) throw storeUnavailable()
	}
	async function storageCall(callback) {
		assertReady()
		try { return await callback() }
		catch (error) { throw error instanceof AssetGrantError ? error : storeUnavailable() }
	}
	async function checkReady() {
		// Read-only reachability check before paid work. No grants are minted by
		// readiness, and failure cannot fall back to a local/cache-only authority.
		await storageCall(() => backend.read(documentId(currentResourceOwner(), digest('readiness'))))
	}
	function scopeForOwner(owner) {
		const scope = access.getStore()
		return scope && sameOwner(scope.owner, owner) ? scope : null
	}
	function remember(owner, canonical, grant) {
		const scope = scopeForOwner(owner)
		if (scope) scope.grants.set(canonical, Object.freeze({ ...grant, resourceOwner: Object.freeze({ ...grant.resourceOwner }) }))
	}
	function withAccess(callback) {
		return access.run({ owner: currentResourceOwner(), grants: new Map() }, callback)
	}
	function staged(owner, canonical) {
		const production = productions.getStore()
		return production?.active && sameOwner(production.owner, owner) ? production.records.get(canonical) : null
	}
	async function assertAccess(handle) {
		const owner = currentResourceOwner()
		const reference = privateReference(handle)
		assertReady()
		const pending = staged(owner, reference.canonical)
		if (pending) return handle
		const grant = await storageCall(() => backend.read(documentId(owner, reference.assetKey)))
		if (!validGrant(grant, owner, reference.assetKey, reference.contentDigest)) throw unavailable()
		remember(owner, reference.canonical, grant)
		return handle
	}
	function checkedGrant(handle) {
		const owner = currentResourceOwner()
		const reference = privateReference(handle)
		assertReady()
		const grant = staged(owner, reference.canonical) || scopeForOwner(owner)?.grants.get(reference.canonical)
		if (!validGrant(grant, owner, reference.assetKey, reference.contentDigest)) throw unavailable()
		return grant
	}
	function assertAccessSync(handle) {
		checkedGrant(handle)
		return handle
	}
	function assertBytesSync(handle, bytes) {
		const grant = checkedGrant(handle)
		const evidence = bytesEvidence(bytes)
		if (grant.sha256 !== evidence.sha256 || grant.bytes !== evidence.bytes) throw conflict()
		return bytes
	}
	async function authorize(handles) {
		if (!Array.isArray(handles) || handles.length > MAX_PREFLIGHT_HANDLES) throw unavailable()
		const unique = [...new Set(handles.filter(requiresAssetGrant))]
		for (let i = 0; i < unique.length; i += 16) await Promise.all(unique.slice(i, i + 16).map(assertAccess))
	}

	/**
	 * Call ONLY around actual successful uploads, generators, or derivations from
	 * already-owned bytes/resources. operation is a private server record in running
	 * state, never parsed request/result JSON. The callback captures actual approved
	 * output bytes, not incoming handles or a global cache hit. No public mint API.
	 */
	async function produce({ operation, source, requireReady = true } = {}, callback) {
		const owner = currentResourceOwner()
		if (!sameOwner(resourceOwnerOf(operation), owner) || operation?.state !== 'running'
			|| typeof operation.operationId !== 'string' || !operation.operationId || operation.operationId.length > 256
			|| !PRODUCTION_SOURCES.has(source) || typeof callback !== 'function') throw productionDenied()
		// Non-producing engine calls may share the execution scope. They opt out
		// only of the eager check; capture still requires a configured store, and
		// the engine must check readiness before starting any paid asset work.
		if (requireReady) assertReady()
		const production = { owner, records: new Map(), active: true, invalid: false }
		const operationKey = digest(operation.operationId)
		const capture = (handle, bytes) => {
			try {
				assertReady()
				if (!production.active || !sameOwner(currentResourceOwner(), owner)) throw productionDenied()
				const reference = privateReference(handle)
				const evidence = bytesEvidence(bytes)
				if (reference.contentDigest && reference.contentDigest !== evidence.sha256) throw conflict()
				const record = {
					schemaVersion: ASSET_GRANT_SCHEMA_VERSION, resourceOwner: owner, assetKey: reference.assetKey,
					...evidence, source, operationKey, createdAt: new Date().toISOString(),
				}
				const existing = production.records.get(reference.canonical)
				if (!existing && production.records.size >= MAX_ASSET_GRANTS_PER_PRODUCTION) throw productionDenied()
				production.records.set(reference.canonical, existingOrNew(existing, record))
				return handle
			} catch (error) { production.invalid = true; throw error }
		}
		return productions.run(production, async () => {
			try {
				const result = await callback(Object.freeze({ capture }))
				const unfinished = ['failed', 'cancelled', 'canceled', 'queued', 'pending', 'running', 'retry', 'processing']
			// The engine uses this receipt scope around ordinary read-only calls as
			// well as asset-producing operations. A validation result may therefore
			// legitimately be { ok:false } without being an asset-production
			// failure. Only reject a failed/unfinished result when this operation
			// actually captured output that would otherwise become a grant; a
			// capture-time error remains fatal through production.invalid.
			const capturedOutputs = production.records.size > 0
			if (production.invalid || (capturedOutputs && (result?.ok === false || result?.error
				|| unfinished.includes(result?.state) || unfinished.includes(result?.status)))) throw productionDenied()
				production.active = false
				const proposed = [...production.records.values()]
				if (proposed.length) {
					const saved = await storageCall(() => backend.putMany(proposed))
					const canonical = [...production.records.keys()]
					for (let i = 0; i < saved.length; i++) remember(owner, canonical[i], saved[i])
				}
				return result
			} finally { production.active = false }
		})
	}

	return Object.freeze({ withAccess, assertReady, checkReady, produce, authorize, assertAccess, assertAccessSync, assertBytesSync })
}
