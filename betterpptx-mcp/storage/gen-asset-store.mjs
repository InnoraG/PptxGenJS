import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import { recordResourceUsage } from '../billing/resource-meter.mjs'

// DURABLE GENERATED-ASSET STORE (G3). The gen:// caches (rigged 3D, generated images) are
// process-local Maps — authoritative only until a restart or on one instance. This store is
// their durable, TENANT-SCOPED backend on the locked-asset-store pattern (same provider envs,
// so a deployment configured for durable deck state gets durable gen assets for free):
//
//   <prefix>/tenants/<tenant>/records/<hash>.json      — the asset RECORD (metadata, manifests,
//                                                        FULL server-side license/provenance,
//                                                        blob references with digests)
//   <prefix>/tenants/<tenant>/blobs/<digest>[.<ext>]   — content-addressed bytes (GLB, poster)
//
// Contracts (G3 gate): tenant isolation is STRUCTURAL (a lookup can only name its own tenant's
// prefix); every blob read verifies its sha256 (a partial/corrupt write is a MISS, never a
// corrupt package); record writes are atomic (temp+rename locally; GCS object writes are atomic);
// re-persisting an identical asset is a no-op (idempotent, no double storage); expiry is an
// explicit sweep, never a silent delete.

export class GenAssetStoreError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'GenAssetStoreError'
		this.code = code
		this.details = details
	}
}

function enabled(name) {
	return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase())
}

function inferredProvider() {
	const deckStateProvider = String(process.env.BETTERPPTX_DURABLE_DECK_STATE_STORE || process.env.BETTERPPTX_DECK_STATE_STORE || '').trim().toLowerCase()
	if (deckStateProvider === 'firestore-gcs') return 'gcs'
	if (deckStateProvider === 'local') return 'local'
	return 'disabled'
}

export function genAssetStoreProviderName() {
	return String(
		process.env.BETTERPPTX_GEN_ASSET_STORE
		|| process.env.BETTERPPTX_LOCKED_ASSET_STORE
		|| process.env.BETTERPPTX_DECK_SNAPSHOT_STORE
		|| inferredProvider(),
	).trim().toLowerCase()
}

export function isGenAssetStoreConfigured() {
	return ['local', 'gcs'].includes(genAssetStoreProviderName())
}

export function isDistributedGenAssetStoreConfigured() {
	return genAssetStoreProviderName() === 'gcs'
}

const TENANT_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
export function normalizeTenantId(value) {
	const raw = String(value || 'default').trim().toLowerCase()
	if (TENANT_RE.test(raw)) return raw
	// non-conforming identities (session ids, license ids) become a stable opaque slug
	return 't-' + crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24)
}

// IMG10 identity bridge. Account/license identity is preferred when available;
// session identity remains the research/dev fallback. The returned tenantId is
// always the normalized opaque path key, never a raw credential or path.
export function resolveGenAssetTenantIdentity({ accountId, licenseId, tenantId, sessionId } = {}) {
	const candidates = [
		['account', accountId],
		['license', licenseId],
		['tenant', tenantId],
		['session', sessionId],
	]
	const selected = candidates.find(([, value]) => String(value || '').trim()) || ['default', 'default']
	const opaque = selected[0] === 'account' || selected[0] === 'license'
	return {
		tenantId: opaque ? 't-' + crypto.createHash('sha256').update(String(selected[1]).trim()).digest('hex').slice(0, 24) : normalizeTenantId(selected[1]),
		source: selected[0],
		accountScoped: selected[0] === 'account',
		explicit: !['default', 'session'].includes(selected[0]),
	}
}

const HASH_RE = /^[a-f0-9]{8,64}$/
function assertHash(hash) {
	if (!HASH_RE.test(String(hash || ''))) throw new GenAssetStoreError('GEN_ASSET_HASH_INVALID', 'A valid gen-asset hash is required.', { hash })
	return String(hash)
}

function digestOf(bytes) {
	return crypto.createHash('sha256').update(bytes).digest('hex')
}

function normalizePrefix(value) {
	return String(value || 'betterpptx-gen-assets')
		.replace(/\\/g, '/')
		.replace(/^\/+|\/+$/g, '')
		.replace(/[^A-Za-z0-9._/-]/g, '_') || 'betterpptx-gen-assets'
}

function recordRelPath(tenant, hash) { return `tenants/${tenant}/records/${hash}.json` }
function blobRelPath(tenant, digest, ext) { return `tenants/${tenant}/blobs/${digest}${ext ? `.${ext}` : ''}` }

function localRoot() {
	const configured = String(process.env.BETTERPPTX_GEN_ASSET_DIR || process.env.BETTERPPTX_LOCKED_ASSET_SHARED_DIR || '').trim()
	if (configured) return path.resolve(configured, 'betterpptx-gen-assets')
	const root = String(process.env.BETTERPPTX_OUT_DIR || process.env.BETTERPPTX_DOWNLOAD_ROOT || 'outputs').trim()
	return path.resolve(root, 'betterpptx-gen-assets')
}

// ── local backend (atomic temp+rename; the dev default and the cross-process test backend) ──
function createLocalGenAssetStore() {
	const root = localRoot()
	const abs = rel => path.join(root, rel)

	async function atomicWrite(target, buffer) {
		await fs.mkdir(path.dirname(target), { recursive: true })
		const tmp = `${target}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
		await fs.writeFile(tmp, buffer, { mode: 0o600 })
		await fs.rename(tmp, target) // atomic on the same volume — a reader never sees a partial file
	}

	return {
		provider: 'local',
		distributed: false,
		root,
		async putRecord(tenant, hash, record) {
			await atomicWrite(abs(recordRelPath(tenant, assertHash(hash))), Buffer.from(JSON.stringify(record)))
		},
		async getRecord(tenant, hash) {
			try { return JSON.parse(await fs.readFile(abs(recordRelPath(tenant, assertHash(hash))), 'utf8')) }
			catch { return null }
		},
		async deleteRecord(tenant, hash) {
			try { await fs.unlink(abs(recordRelPath(tenant, assertHash(hash)))) } catch {}
		},
		async putBlob(tenant, digest, bytes, ext = '') {
			const target = abs(blobRelPath(tenant, digest, ext))
			try { await fs.access(target); return { skipped: true } } catch {}
			await atomicWrite(target, bytes)
			return { skipped: false }
		},
		async getBlob(tenant, digest, ext = '') {
			try { return await fs.readFile(abs(blobRelPath(tenant, digest, ext))) } catch { return null }
		},
		async deleteBlob(tenant, digest, ext = '') {
			try { await fs.unlink(abs(blobRelPath(tenant, digest, ext))) } catch {}
		},
		async listRecords(tenant) {
			try {
				const dir = abs(`tenants/${tenant}/records`)
				return (await fs.readdir(dir)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5))
			} catch { return [] }
		},
	}
}

// ── GCS backend (deployed; metered like the locked-asset store) ─────────────
let storageClientPromise = null
async function getStorageClient() {
	if (!storageClientPromise) {
		storageClientPromise = import('@google-cloud/storage')
			.then(({ Storage }) => new Storage({ projectId: process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined }))
			.catch(err => {
				throw new GenAssetStoreError('GEN_ASSET_GCS_CLIENT_UNAVAILABLE', 'Google Cloud Storage adapter requires @google-cloud/storage and credentials.', { reason: err?.message || String(err) })
			})
	}
	return storageClientPromise
}

function createGcsGenAssetStore() {
	const bucketName = String(process.env.BETTERPPTX_GEN_ASSET_BUCKET || process.env.BETTERPPTX_LOCKED_ASSET_BUCKET || process.env.BETTERPPTX_GCS_BUCKET || process.env.BETTERPPTX_ARTIFACT_BUCKET || '').trim()
	if (!bucketName) throw new GenAssetStoreError('GEN_ASSET_GCS_BUCKET_MISSING', 'GCS gen-asset storage requires BETTERPPTX_GEN_ASSET_BUCKET or BETTERPPTX_GCS_BUCKET.', { provider: 'gcs' })
	const prefix = normalizePrefix(process.env.BETTERPPTX_GEN_ASSET_GCS_PREFIX)
	const objectName = rel => `${prefix}/${rel}`

	async function save(rel, buffer, contentType) {
		const storage = await getStorageClient()
		await storage.bucket(bucketName).file(objectName(rel)).save(buffer, {
			resumable: false,
			contentType,
			metadata: { cacheControl: 'private, max-age=0, no-store', metadata: { product: 'BetterPPTX', artifact: 'gen-asset' } },
		})
		recordResourceUsage({ storageWriteBytes: buffer.length, gcsClassAOps: 1, externalCalls: 1 })
	}
	async function load(rel) {
		const storage = await getStorageClient()
		try {
			const [bytes] = await storage.bucket(bucketName).file(objectName(rel)).download()
			recordResourceUsage({ storageReadBytes: bytes.length, gcsClassBOps: 1, externalCalls: 1 })
			return bytes
		} catch { return null }
	}
	async function remove(rel) {
		const storage = await getStorageClient()
		try { await storage.bucket(bucketName).file(objectName(rel)).delete(); recordResourceUsage({ gcsClassAOps: 1, externalCalls: 1 }) } catch {}
	}

	return {
		provider: 'gcs',
		distributed: true,
		bucketName,
		async putRecord(tenant, hash, record) { await save(recordRelPath(tenant, assertHash(hash)), Buffer.from(JSON.stringify(record)), 'application/json') },
		async getRecord(tenant, hash) {
			const bytes = await load(recordRelPath(tenant, assertHash(hash)))
			if (!bytes) return null
			try { return JSON.parse(bytes.toString('utf8')) } catch { return null }
		},
		async deleteRecord(tenant, hash) { await remove(recordRelPath(tenant, assertHash(hash))) },
		async putBlob(tenant, digest, bytes, ext = '') {
			const storage = await getStorageClient()
			const file = storage.bucket(bucketName).file(objectName(blobRelPath(tenant, digest, ext)))
			const [exists] = await file.exists()
			if (exists) return { skipped: true }
			const contentType = ext === 'png' ? 'image/png'
				: (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg'
				: ext === 'webp' ? 'image/webp'
				: ext === 'glb' ? 'model/gltf-binary'
				: 'application/octet-stream'
			await save(blobRelPath(tenant, digest, ext), bytes, contentType)
			return { skipped: false }
		},
		async getBlob(tenant, digest, ext = '') { return load(blobRelPath(tenant, digest, ext)) },
		async deleteBlob(tenant, digest, ext = '') { await remove(blobRelPath(tenant, digest, ext)) },
		async listRecords(tenant) {
			const storage = await getStorageClient()
			const [files] = await storage.bucket(bucketName).getFiles({ prefix: objectName(`tenants/${tenant}/records/`) })
			recordResourceUsage({ gcsClassBOps: 1, externalCalls: 1 })
			return files.map(f => path.basename(f.name)).filter(n => n.endsWith('.json')).map(n => n.slice(0, -5))
		},
	}
}

let cachedStore = null
let cachedProvider = null
export function createGenAssetStore() {
	const provider = genAssetStoreProviderName()
	if (cachedStore && cachedProvider === provider) return cachedStore
	if (provider === 'disabled' || provider === 'off' || provider === 'none' || provider === '') {
		cachedStore = { provider: 'disabled', distributed: false, disabled: true }
	} else if (provider === 'local') cachedStore = createLocalGenAssetStore()
	else if (provider === 'gcs') cachedStore = createGcsGenAssetStore()
	else throw new GenAssetStoreError('GEN_ASSET_STORE_UNAVAILABLE', 'Gen-asset store provider is unavailable.', { provider })
	cachedProvider = provider
	return cachedStore
}

// ── the high-level persist/load contract the providers use ──────────────────
// record: arbitrary JSON metadata; blobs: { name: { bytes|base64, ext } }. Blob digests ride in
// the stored record under _blobs so load can verify every byte read (partial write ⇒ MISS).
export async function persistGeneratedAsset({ tenantId, hash, record, blobs = {} }) {
	const store = createGenAssetStore()
	if (store.disabled) return { ok: false, reason: 'store-disabled' }
	const tenant = normalizeTenantId(tenantId)
	assertHash(hash)
	const existing = await store.getRecord(tenant, hash)
	const blobRefs = {}
	for (const [name, spec] of Object.entries(blobs)) {
		if (!spec) continue
		const bytes = spec.bytes || (spec.base64 ? Buffer.from(spec.base64, 'base64') : null)
		if (!bytes || !bytes.length) continue
		blobRefs[name] = { digest: digestOf(bytes), ext: spec.ext || '', bytes: bytes.length }
	}
	const full = { ...record, _blobs: blobRefs, _schema: 'betterpptx.gen-asset.v1', _persistedAt: new Date().toISOString() }
	if (existing && existing._schema === full._schema && JSON.stringify(existing._blobs || {}) === JSON.stringify(blobRefs)) {
		return { ok: true, provider: store.provider, tenant, skipped: true } // idempotent re-persist
	}
	for (const [name, spec] of Object.entries(blobs)) {
		const ref = blobRefs[name]
		if (!ref) continue
		const bytes = spec.bytes || Buffer.from(spec.base64, 'base64')
		await store.putBlob(tenant, ref.digest, bytes, ref.ext)
	}
	await store.putRecord(tenant, hash, full) // record LAST — a crash mid-persist leaves no dangling record
	return { ok: true, provider: store.provider, tenant, skipped: false }
}

export async function loadGeneratedAsset({ tenantId, hash }) {
	const store = createGenAssetStore()
	if (store.disabled) return null
	const tenant = normalizeTenantId(tenantId)
	const record = await store.getRecord(tenant, assertHash(hash))
	if (!record || record._schema !== 'betterpptx.gen-asset.v1') return null
	const blobs = {}
	for (const [name, ref] of Object.entries(record._blobs || {})) {
		const bytes = await store.getBlob(tenant, ref.digest, ref.ext)
		if (!bytes || digestOf(bytes) !== ref.digest) {
			// corrupt/partial/absent blob: the WHOLE asset is a miss — never a corrupt package.
			console.warn(`[gen-asset-store] blob ${name} for ${hash} (tenant ${tenant}) missing or digest-mismatched — treating asset as absent`)
			return null
		}
		blobs[name] = bytes
	}
	return { record, blobs, tenant, provider: store.provider }
}

export async function deleteGeneratedAsset({ tenantId, hash }) {
	const store = createGenAssetStore()
	if (store.disabled) return { ok: false, reason: 'store-disabled' }
	const tenant = normalizeTenantId(tenantId)
	const record = await store.getRecord(tenant, assertHash(hash))
	await store.deleteRecord(tenant, hash)
	for (const ref of Object.values(record?._blobs || {})) await store.deleteBlob(tenant, ref.digest, ref.ext)
	return { ok: true }
}

// Retention: explicit sweep, owner-invoked (or a scheduled job) — never a silent side effect.
export async function sweepExpiredGenAssets({ tenantId, ttlMs }) {
	const store = createGenAssetStore()
	if (store.disabled) return { ok: false, reason: 'store-disabled', removed: 0 }
	const tenant = normalizeTenantId(tenantId)
	const now = Date.now()
	let removed = 0
	for (const hash of await store.listRecords(tenant)) {
		const record = await store.getRecord(tenant, hash)
		const at = Date.parse(record?._persistedAt || 0)
		if (!Number.isFinite(at) || now - at >= ttlMs) {
			await deleteGeneratedAsset({ tenantId: tenant, hash })
			removed++
		}
	}
	return { ok: true, removed }
}

export function genAssetStoreReadiness() {
	const provider = genAssetStoreProviderName()
	return {
		provider,
		configured: isGenAssetStoreConfigured(),
		distributed: isDistributedGenAssetStoreConfigured(),
		publicProductionEligible: provider === 'gcs',
	}
}
