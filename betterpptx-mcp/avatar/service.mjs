import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { hashText } from '../narration/audio.mjs'
import { logEvent } from '../logger.mjs'
import { makeAvatarJobDir, resolveAvatarImage, fileSha256 } from './artifacts.mjs'
import { avatarCacheKey, lookupAvatarCache, storeAvatarCache } from './cache.mjs'
import { coverDataUriFromPng, extractPosterPng, normalizePowerPointMp4 } from './ffmpeg.mjs'
import { assertAvatarConsent, avatarConsentAudit } from './consent.mjs'
import { renderWithAvatarProvider, resolveAvatarProvider, resolveAvatarProviderOptions, normalizeAvatarMotionProfile, normalizeAvatarMouthProfile, PRODUCTION_TALKING_HEAD_CONTRACT_VERSION } from './providers/index.mjs'
import { recordResourceUsage } from '../billing/resource-meter.mjs'
import { avatarArtifactStoreReadiness, avatarArtifactTenant, loadAvatarArtifact, persistAvatarArtifact } from '../storage/avatar-artifact-store.mjs'
import { avatarError } from './errors.mjs'

export function publicAvatarVideo(result = {}) {
	return {
		ref: result.ref || null,
		posterRef: result.posterRef || null,
		durationMs: result.durationMs,
		extn: 'mp4',
		cacheHit: !!result.cacheHit,
	}
}

export function normalizeAvatarMode(value) {
	return value === 'mutedVideoPlusNativeAudio' ? 'mutedVideoPlusNativeAudio' : 'videoWithAudio'
}

export function avatarScriptHash(script, fallback = null) {
	const text = String(script || '').replace(/\s+/g, ' ').trim()
	return text ? hashText(text) : fallback
}

function publicBlackBoxEnabled() {
	return ['1', 'true', 'yes', 'on'].includes(String(process.env.BETTERPPTX_PUBLIC_BLACK_BOX || '').trim().toLowerCase())
}

function sharedStoresRequired() {
	return String(process.env.BETTERPPTX_REQUIRE_SHARED_STORES || '').trim() === '1'
}

export function avatarLicenseApprovalReadiness() {
	return {
		publicBlackBox: publicBlackBoxEnabled(),
		approved: String(process.env.BETTERPPTX_AVATAR_LICENSE_APPROVED || '').trim() === '1',
		failClosed: true,
	}
}

function assertAvatarLicenseApproved(provider) {
	const modelBacked = provider === 'musetalk' || provider === 'liveportrait-musetalk' || provider === 'liveportrait-musetalk-commercial' || provider === 'sadtalker'
	if (modelBacked && publicBlackBoxEnabled() && String(process.env.BETTERPPTX_AVATAR_LICENSE_APPROVED || '').trim() !== '1') {
		throw avatarError('AVATAR_LICENSE_REVIEW_REQUIRED', 'Avatar model licensing has not been approved for public production.')
	}
}

export async function renderAvatarNarrationVideo({
	avatar = { source: 'default' },
	audioPath,
	audioHash,
	durationMs,
	scriptHash,
	provider,
	quality = 'default',
	mode = 'videoWithAudio',
	options = {},
	sessionId = '',
	deckId = '',
	idempotencyKey = '',
} = {}) {
	assertAvatarConsent(avatar)
	const maxSeconds = Math.max(1, Number(process.env.BETTERPPTX_AVATAR_MAX_SECONDS || 120))
	const durationSeconds = Number(durationMs || 0) / 1000
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('Avatar narration requires positive audio duration.')
	if (durationSeconds > maxSeconds) {
		const err = new Error('Avatar narration exceeds the configured duration limit.')
		err.code = 'AVATAR_DURATION_LIMIT'
		err.details = { maxSeconds }
		throw err
	}
	const resolvedProvider = resolveAvatarProvider(provider || options.provider || process.env.BETTERPPTX_AVATAR_PROVIDER, { fallback: 'test-static' })
	const resolvedOptions = resolveAvatarProviderOptions(resolvedProvider, options)
	const motionProfile = normalizeAvatarMotionProfile(resolvedOptions?.motionProfile)
	const mouthProfile = normalizeAvatarMouthProfile(resolvedOptions?.mouthProfile)
	if (resolvedProvider === 'musetalk' && !['default', 'static'].includes(motionProfile)) {
		throw avatarError('AVATAR_MOTION_PROFILE_INVALID', 'Motion profiles require the LivePortrait presenter pipeline.')
	}
	assertAvatarLicenseApproved(resolvedProvider)
	const avatarImage = await resolveAvatarImage(avatar)
	const resolvedAudioHash = audioHash || await fileSha256(audioPath)
	const consent = avatarConsentAudit({ avatar, sessionId, deckId, imageHash: avatarImage.hash })
	if (consent) {
		logEvent('avatar.consent.affirmed', {
			sessionId,
			deckId,
			fingerprint: consent.fingerprint,
		})
	}
	const key = avatarCacheKey({
		audioHash: resolvedAudioHash,
		avatarHash: avatarImage.hash,
		scriptHash,
		provider: resolvedProvider,
		quality,
		motionProfile,
		mouthProfile,
		mode: normalizeAvatarMode(mode),
		profile: 'h264-yuv420p-aac-faststart-v1',
		productionContract: resolvedProvider === 'liveportrait-musetalk-commercial'
			? PRODUCTION_TALKING_HEAD_CONTRACT_VERSION
			: null,
	})
	const artifactReadiness = avatarArtifactStoreReadiness()
	if (sharedStoresRequired() && !artifactReadiness.distributed) {
		throw avatarError('AVATAR_SHARED_STORE_REQUIRED', 'Avatar shared artifact storage is not configured for this production environment.')
	}
	const artifactTenant = avatarArtifactTenant({
		accountId: resolvedOptions.accountId,
		licenseId: resolvedOptions.licenseId,
		tenantId: resolvedOptions.tenantId,
		sessionId,
	})
	// A configured durable store is authoritative and tenant-scoped. Do not fall back to
	// the process/global cache in that mode, because its key predates tenant identity.
	if (artifactReadiness.configured) {
		const materializeDir = await makeAvatarJobDir('avatar-durable-cache')
		const durable = await loadAvatarArtifact({ tenantId: artifactTenant.tenantId, cacheKey: key, materializeDir })
		if (durable) {
			return {
				...durable,
				coverDataUri: await coverDataUriFromPng({ posterPath: durable.posterPath }),
				provider: resolvedProvider,
				consent,
				warnings: ['cache-hit', 'durable-artifact-cache'],
			}
		}
	} else {
		const cached = await lookupAvatarCache(key)
		if (cached) return { ...cached, provider: resolvedProvider, consent, warnings: ['cache-hit'] }
	}

	const jobDir = await makeAvatarJobDir('avatar-render')
	const providerStartedAt = process.hrtime.bigint()
	const providerResult = await renderWithAvatarProvider(resolvedProvider, {
		avatarImagePath: avatarImage.filePath,
		audioPath,
		durationMs,
		jobDir,
		quality,
		options: resolvedOptions,
		idempotencyKey,
	})
	const providerWallSeconds = Number(process.hrtime.bigint() - providerStartedAt) / 1e9
	const normalizedVideoPath = path.join(jobDir, 'avatar-powerpoint.mp4')
	await normalizePowerPointMp4({
		inputPath: providerResult.rawVideoPath,
		outputPath: normalizedVideoPath,
		maxSeconds,
		stripAudio: normalizeAvatarMode(mode) === 'mutedVideoPlusNativeAudio',
	})
	const posterPath = path.join(jobDir, 'poster.png')
	await extractPosterPng({ inputPath: normalizedVideoPath, outputPath: posterPath })
	const coverDataUri = await coverDataUriFromPng({ posterPath })
	const stat = await fs.stat(normalizedVideoPath)
	recordResourceUsage({
		avatarVideoSeconds: durationSeconds,
		gpuSeconds: resolvedProvider === 'musetalk' || resolvedProvider === 'liveportrait-musetalk' || resolvedProvider === 'liveportrait-musetalk-commercial'
			? providerWallSeconds
			: 0,
		artifactBytes: stat.size,
	})
	const result = {
		ok: true,
		rawVideoPath: providerResult.rawVideoPath,
		normalizedVideoPath,
		posterPath,
		coverDataUri,
		durationMs,
		sizeBytes: stat.size,
		provider: resolvedProvider,
		quality,
		motionProfile,
		mouthProfile,
		mode: normalizeAvatarMode(mode),
		cacheKey: key,
		cacheHit: false,
		consent,
		warnings: providerResult.warnings || [],
		...(process.env.BETTERPPTX_PRIVATE_METROLOGY === '1' && Array.isArray(providerResult.providerExecutionIds)
			? { providerExecutionIds: providerResult.providerExecutionIds }
			: {}),
	}
	if (artifactReadiness.configured) {
		await persistAvatarArtifact({
			tenantId: artifactTenant.tenantId,
			cacheKey: key,
			normalizedVideoPath,
			posterPath,
			durationMs,
			mode: normalizeAvatarMode(mode),
			provider: resolvedProvider,
			profileContract: resolvedProvider === 'liveportrait-musetalk-commercial'
				? PRODUCTION_TALKING_HEAD_CONTRACT_VERSION
				: null,
		})
		return { ...result, provider: resolvedProvider, quality, mode: normalizeAvatarMode(mode), warnings: result.warnings, durableArtifact: true }
	}
	const stored = await storeAvatarCache(key, result)
	return { ...result, ...stored, provider: resolvedProvider, quality, mode: normalizeAvatarMode(mode), warnings: result.warnings }
}
