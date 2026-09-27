// Durable tenant-scoped avatar media artifacts. This delegates bytes to the existing
// content-addressed local/GCS store and keeps only opaque job/cache metadata in records.
import * as crypto from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createGenAssetStore, genAssetStoreReadiness, loadGeneratedAsset, persistGeneratedAsset, deleteGeneratedAsset, sweepExpiredGenAssets, resolveGenAssetTenantIdentity } from './gen-asset-store.mjs'

const VERSION = 'betterpptx.avatar-artifact.v1'
const digest = value => crypto.createHash('sha256').update(String(value || '')).digest('hex')

export function avatarArtifactStoreReadiness() {
	const readiness = genAssetStoreReadiness()
	return { provider: readiness.provider, configured: readiness.configured, distributed: readiness.distributed, publicProductionEligible: readiness.publicProductionEligible }
}

export function avatarArtifactTenant({ accountId, licenseId, tenantId, sessionId } = {}) {
	return resolveGenAssetTenantIdentity({ accountId, licenseId, tenantId, sessionId })
}

function assertConfigured() {
	const store = createGenAssetStore()
	if (store.disabled) return false
	return true
}

export async function persistAvatarArtifact({ tenantId, cacheKey, normalizedVideoPath, posterPath, durationMs, mode = 'videoWithAudio', provider = 'private', profileContract = null, expiresAt = null } = {}) {
	if (!assertConfigured()) return { ok: false, reason: 'store-disabled' }
	const key = digest(cacheKey)
	const video = await fs.readFile(path.resolve(normalizedVideoPath))
	const poster = await fs.readFile(path.resolve(posterPath))
	const record = {
		schemaVersion: VERSION,
		cacheKey: key,
		durationMs: Number(durationMs || 0) || 0,
		mode: String(mode || 'videoWithAudio'),
		provider: String(provider || 'private'),
		profileContract: profileContract ? String(profileContract) : null,
		createdAt: new Date().toISOString(),
		expiresAt: expiresAt || new Date(Date.now() + Math.max(60000, Number(process.env.BETTERPPTX_AVATAR_JOB_TTL_MS || 86400000))).toISOString(),
	}
	return persistGeneratedAsset({ tenantId, hash: key, record, blobs: { video: { bytes: video, ext: 'mp4' }, poster: { bytes: poster, ext: 'png' } } })
}

export async function loadAvatarArtifact({ tenantId, cacheKey, materializeDir } = {}) {
	if (!assertConfigured()) return null
	const key = digest(cacheKey)
	const loaded = await loadGeneratedAsset({ tenantId, hash: key })
	if (!loaded?.blobs?.video || !loaded?.blobs?.poster) return null
	const dir = path.resolve(materializeDir)
	await fs.mkdir(dir, { recursive: true })
	const videoPath = path.join(dir, 'avatar-powerpoint.mp4')
	const posterPath = path.join(dir, 'poster.png')
	await fs.writeFile(videoPath, loaded.blobs.video, { mode: 0o600 })
	await fs.writeFile(posterPath, loaded.blobs.poster, { mode: 0o600 })
	return { ...loaded.record, normalizedVideoPath: videoPath, posterPath, cacheHit: true }
}

export async function deleteAvatarArtifact({ tenantId, cacheKey } = {}) {
	if (!assertConfigured()) return { ok: false, reason: 'store-disabled' }
	return deleteGeneratedAsset({ tenantId, hash: digest(cacheKey) })
}

export async function sweepExpiredAvatarArtifacts({ tenantId, ttlMs = 86400000 } = {}) {
	if (!assertConfigured()) return { ok: false, reason: 'store-disabled', removed: 0 }
	return sweepExpiredGenAssets({ tenantId, ttlMs: Math.max(60000, Number(ttlMs) || 86400000) })
}
