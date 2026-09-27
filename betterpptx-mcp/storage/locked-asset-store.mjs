import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

import { recordResourceUsage } from '../billing/resource-meter.mjs'

// Shared content-addressed locked-asset store (plan §29.6). The engine already
// content-addresses opaqueNative/locked assets by sha256 with handles of the form
//   asset://locked/{kind}/{digest}[.{ext}]
// but backs them with per-instance local disk (LOCKED_ASSET_ROOT). For
// cross-instance rehydrate, the bytes must live in a SHARED backend so a deck
// recompiled on another instance can resolve its preserved binaries. This store
// is the shared backend (local dir for dev, GCS for production); the engine mirrors
// to it at persist time and prefetches from it at rehydrate time. The local
// LOCKED_ASSET_ROOT stays as the per-instance read cache the sync compile path uses.

export class LockedAssetStoreError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'LockedAssetStoreError'
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

export function lockedAssetStoreProviderName() {
	return String(
		process.env.BETTERPPTX_LOCKED_ASSET_STORE
		|| process.env.BETTERPPTX_DECK_SNAPSHOT_STORE
		|| inferredProvider(),
	).trim().toLowerCase()
}

export function isLockedAssetStoreConfigured() {
	return ['local', 'gcs'].includes(lockedAssetStoreProviderName())
}

export function isDistributedLockedAssetStoreConfigured() {
	return lockedAssetStoreProviderName() === 'gcs'
}

function requireDistributed(provider) {
	if (enabled('BETTERPPTX_REQUIRE_DURABLE_DECK_STATE') && provider !== 'gcs') {
		throw new LockedAssetStoreError(
			'LOCKED_ASSET_STORE_NOT_DISTRIBUTED',
			'Distributed shared locked-asset storage is required but not configured.',
			{ provider },
		)
	}
}

const HANDLE_RE = /^asset:\/\/locked\/([A-Za-z0-9_.-]+)\/([a-f0-9]{64})(?:\.([a-z0-9]+))?$/i

export function parseLockedAssetHandle(handle) {
	const match = HANDLE_RE.exec(String(handle || ''))
	if (!match) {
		throw new LockedAssetStoreError('LOCKED_ASSET_HANDLE_INVALID', 'A valid asset://locked/{kind}/{digest} handle is required.', { handle })
	}
	return { kind: match[1], digest: match[2].toLowerCase(), ext: (match[3] || '').toLowerCase() }
}

export function isLockedAssetHandle(value) {
	return HANDLE_RE.test(String(value || ''))
}

function normalizePrefix(value) {
	return String(value || 'betterpptx-locked-assets')
		.replace(/\\/g, '/')
		.replace(/^\/+|\/+$/g, '')
		.replace(/[^A-Za-z0-9._/-]/g, '_') || 'betterpptx-locked-assets'
}

function digestOf(bytes) {
	return crypto.createHash('sha256').update(bytes).digest('hex')
}

function objectRelPath({ kind, digest, ext }) {
	const fileName = `${digest}${ext ? `.${ext}` : ''}`
	return `${kind}/${digest.slice(0, 2)}/${fileName}`
}

function publicRecord({ provider, handle, digest, bytes, objectName = '', localPath = '' }) {
	return { provider, handle, digest, bytes: Number(bytes) || 0, objectName, localPath, writtenAt: new Date().toISOString() }
}

function verifyDigest(bytes, expectedDigest, handle) {
	const actual = digestOf(bytes)
	if (actual !== expectedDigest) {
		throw new LockedAssetStoreError('LOCKED_ASSET_DIGEST_MISMATCH', 'Locked-asset content-address digest mismatch.', { handle, expectedDigest, actualDigest: actual })
	}
}

function localRoot() {
	const configured = String(process.env.BETTERPPTX_LOCKED_ASSET_SHARED_DIR || process.env.BETTERPPTX_DECK_SPEC_DIR || '').trim()
	if (configured) return path.resolve(configured)
	const root = String(process.env.BETTERPPTX_OUT_DIR || process.env.BETTERPPTX_DOWNLOAD_ROOT || 'outputs').trim()
	return path.resolve(root, 'betterpptx-locked-assets-shared')
}

function createLocalLockedAssetStore() {
	requireDistributed('local')
	const root = localRoot()

	function targetForHandle(handle) {
		return path.join(root, objectRelPath(parseLockedAssetHandle(handle)))
	}

	async function putLockedAsset(handle, bytes) {
		const { digest } = parseLockedAssetHandle(handle)
		const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || '')
		verifyDigest(buffer, digest, handle)
		const target = targetForHandle(handle)
		await fs.mkdir(path.dirname(target), { recursive: true })
		try {
			await fs.writeFile(target, buffer, { flag: 'wx', mode: 0o600 })
		} catch (err) {
			if (err?.code !== 'EEXIST') throw err
		}
		return publicRecord({ provider: 'local', handle, digest, bytes: buffer.length, localPath: target })
	}

	async function getLockedAsset(handle) {
		const { digest } = parseLockedAssetHandle(handle)
		const bytes = await fs.readFile(targetForHandle(handle))
		verifyDigest(bytes, digest, handle)
		return { handle, digest, bytes, provider: 'local', localPath: targetForHandle(handle) }
	}

	async function hasLockedAsset(handle) {
		try { await fs.access(targetForHandle(handle)); return true } catch { return false }
	}

	return { provider: 'local', distributed: false, putLockedAsset, getLockedAsset, hasLockedAsset }
}

let storageClientPromise = null
async function getStorageClient() {
	if (!storageClientPromise) {
		storageClientPromise = import('@google-cloud/storage')
			.then(({ Storage }) => new Storage({ projectId: process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined }))
			.catch(err => {
				throw new LockedAssetStoreError('LOCKED_ASSET_GCS_CLIENT_UNAVAILABLE', 'Google Cloud Storage adapter requires @google-cloud/storage and credentials.', { reason: err?.message || String(err) })
			})
	}
	return storageClientPromise
}

function createGcsLockedAssetStore() {
	requireDistributed('gcs')
	const bucketName = String(process.env.BETTERPPTX_LOCKED_ASSET_BUCKET || process.env.BETTERPPTX_DECK_SNAPSHOT_BUCKET || process.env.BETTERPPTX_GCS_BUCKET || process.env.BETTERPPTX_ARTIFACT_BUCKET || '').trim()
	if (!bucketName) {
		throw new LockedAssetStoreError('LOCKED_ASSET_GCS_BUCKET_MISSING', 'GCS shared locked-asset storage requires BETTERPPTX_LOCKED_ASSET_BUCKET or BETTERPPTX_GCS_BUCKET.', { provider: 'gcs' })
	}
	const prefix = normalizePrefix(process.env.BETTERPPTX_LOCKED_ASSET_GCS_PREFIX)

	function objectNameForHandle(handle) {
		return `${prefix}/${objectRelPath(parseLockedAssetHandle(handle))}`
	}

	async function putLockedAsset(handle, bytes) {
		const { digest } = parseLockedAssetHandle(handle)
		const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes || '')
		verifyDigest(buffer, digest, handle)
		const objectName = objectNameForHandle(handle)
		const storage = await getStorageClient()
		const file = storage.bucket(bucketName).file(objectName)
		const [exists] = await file.exists()
		if (!exists) {
			await file.save(buffer, {
				resumable: false,
				metadata: { cacheControl: 'private, max-age=0, no-store', metadata: { product: 'BetterPPTX', artifact: 'locked-asset', digest } },
			})
			recordResourceUsage({ storageWriteBytes: buffer.length, gcsClassAOps: 1, externalCalls: 1 })
		}
		return publicRecord({ provider: 'gcs', handle, digest, bytes: buffer.length, objectName })
	}

	async function getLockedAsset(handle) {
		const { digest } = parseLockedAssetHandle(handle)
		const objectName = objectNameForHandle(handle)
		const storage = await getStorageClient()
		const [bytes] = await storage.bucket(bucketName).file(objectName).download()
		verifyDigest(bytes, digest, handle)
		recordResourceUsage({ storageReadBytes: bytes.length, gcsClassBOps: 1, externalCalls: 1 })
		return { handle, digest, bytes, provider: 'gcs', objectName }
	}

	async function hasLockedAsset(handle) {
		const storage = await getStorageClient()
		const [exists] = await storage.bucket(bucketName).file(objectNameForHandle(handle)).exists()
		return !!exists
	}

	return { provider: 'gcs', distributed: true, putLockedAsset, getLockedAsset, hasLockedAsset }
}

export function createLockedAssetStore() {
	const provider = lockedAssetStoreProviderName()
	if (provider === 'disabled' || provider === 'off' || provider === 'none') {
		if (enabled('BETTERPPTX_REQUIRE_DURABLE_DECK_STATE')) {
			throw new LockedAssetStoreError('LOCKED_ASSET_STORE_REQUIRED', 'Durable deck state requires a shared locked-asset store.', { provider })
		}
		return { provider: 'disabled', distributed: false, disabled: true }
	}
	if (provider === 'local') return createLocalLockedAssetStore()
	if (provider === 'gcs') return createGcsLockedAssetStore()
	throw new LockedAssetStoreError('LOCKED_ASSET_STORE_UNAVAILABLE', 'Shared locked-asset store provider is unavailable.', { provider })
}

export function lockedAssetStoreReadiness() {
	const provider = lockedAssetStoreProviderName()
	return {
		provider,
		configured: isLockedAssetStoreConfigured(),
		distributed: isDistributedLockedAssetStoreConfigured(),
		publicProductionEligible: provider === 'gcs',
		requireDurableDeckState: enabled('BETTERPPTX_REQUIRE_DURABLE_DECK_STATE'),
	}
}
