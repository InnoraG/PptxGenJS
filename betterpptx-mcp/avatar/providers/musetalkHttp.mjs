import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { parseDataUri } from '../../narration/audio.mjs'
import { recordResourceLabels, recordResourceUsage } from '../../billing/resource-meter.mjs'
import { credentialAccounts } from '../../config/credential-store.mjs'
import { safeFetchToBuffer } from '../../net/safe-fetch.mjs'
import { avatarError } from '../errors.mjs'
import { createAvatarWorkerStateStore } from '../../storage/avatar-worker-state-store.mjs'
import { avatarProviderMetrologyReadiness, recordAvatarProviderMetrology } from '../../storage/avatar-provider-metrology-store.mjs'
import { avatarWorkerQuotaProductionConfig, avatarWorkerQuotaReadiness, createAvatarWorkerQuotaStore } from '../../storage/avatar-worker-quota-state.mjs'
import { avatarWorkerBudgetProductionConfig, avatarWorkerRenderCostUsd, createAvatarWorkerBudgetStore } from '../../storage/avatar-worker-budget-store.mjs'
import { assertProductionTalkingHeadAttestation, resolveProductionTalkingHeadOptions } from '../production-profile.mjs'

// Avatar workers (liveportrait+musetalk) support MULTIPLE endpoints for round-robin load spread +
// failover — deploy the worker on several accounts and list them in the credential store under
// provider "avatar-worker". Plain env vars remain the single-worker fallback when no store exists.
const AVATAR_STORE_PROVIDER_ID = 'avatar-worker'
const COMMERCIAL_AVATAR_STORE_PROVIDER_ID = 'avatar-worker-commercial'

// The pool is either a bare [{ id, url, route, token, weight }] array or a whole
// credential-store document (the Secret Manager bundle) bound as one secret env value.
function avatarWorkerEnvironmentPool(prefix, storeProviderId) {
	const raw = String(process.env[`${prefix}POOL`] || '').trim()
	if (!raw) return []
	let parsed
	try { parsed = JSON.parse(raw.replace(/^\uFEFF/, '')) } catch { return [] }
	if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') {
		const accounts = parsed.providers?.[storeProviderId]?.accounts
		if (!Array.isArray(accounts)) return []
		parsed = accounts
			.filter(account => account && account.enabled !== false && account.env && typeof account.env === 'object')
			.map(account => ({ id: account.id, url: account.env[`${prefix}URL`], route: account.env[`${prefix}ROUTE`], token: account.env[`${prefix}TOKEN`], weight: account.env[`${prefix}WEIGHT`] }))
	}
	if (!Array.isArray(parsed)) return []
	return parsed
		.map((account, index) => ({
			id: String(account?.id || `env-${index + 1}`).trim(),
			url: String(account?.url || '').trim().replace(/\/+$/, ''),
			route: String(account?.route || '').trim(),
			token: String(account?.token || '').trim(),
			weight: account?.weight,
		}))
		.filter(account => account.id && account.url)
}

export function avatarWorkerAccounts(provider = 'liveportrait-musetalk') {
	const commercial = provider === 'liveportrait-musetalk-commercial'
	const storeProviderId = commercial ? COMMERCIAL_AVATAR_STORE_PROVIDER_ID : AVATAR_STORE_PROVIDER_ID
	const prefix = commercial ? 'BETTERPPTX_COMMERCIAL_AVATAR_WORKER_' : 'BETTERPPTX_AVATAR_WORKER_'
	const fromStore = credentialAccounts(storeProviderId)
		.map(account => ({
			id: String(account.id || ''),
			url: String(account.env?.[`${prefix}URL`] || '').trim().replace(/\/+$/, ''),
			route: String(account.env?.[`${prefix}ROUTE`] || '').trim(),
			token: String(account.env?.[`${prefix}TOKEN`] || '').trim(),
			// Selection metadata is non-secret and may be owner-managed in the credential UI.
			// It is deliberately separate from provider credentials and never appears in public results.
			weight: account.env?.[`${prefix}WEIGHT`],
		}))
		.filter(account => account.id && account.url)
	if (fromStore.length) return fromStore
	// A deployment may inject a bounded account pool as one secret environment
	// value. This keeps rotation/failover available without writing a transient
	// credential file or falling back across provider namespaces. The commercial
	// pool is still read only from the commercial prefix.
	const fromEnvironmentPool = avatarWorkerEnvironmentPool(prefix, storeProviderId)
	if (fromEnvironmentPool.length) return fromEnvironmentPool
	const url = String(process.env[`${prefix}URL`] || '').trim().replace(/\/+$/, '')
	if (!url) return []
	return [{ id: 'env', url, route: String(process.env[`${prefix}ROUTE`] || '').trim(), token: String(process.env[`${prefix}TOKEN`] || '').trim(), weight: process.env[`${prefix}WEIGHT`] }]
}
function accountEndpoint(account) {
	const route = account.route || '/v1/avatar/lipsync'
	return `${account.url}${route.startsWith('/') ? '' : '/'}${route}`
}
let avatarRoundRobin = 0

// Worker response metrology is the billing hand-off.  A terminal broker replay
// intentionally has no GPU headers, so it contributes no second provider spend.
export function avatarProviderUsageFromHeaders(headers) {
	const value = name => String(headers?.get?.(name) || '').trim()
	const number = name => {
		const parsed = Number(value(name))
		return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
	}
	const state = value('x-idempotency-state').toLowerCase()
	const pipeline = value('x-pipeline')
	const enhancement = value('x-enhancement')
	const motionProfile = value('x-motion-profile') || 'default'
	const mouthProfile = value('x-mouth-profile') || 'default'
	const gpuType = value('x-gpu-type')
	const gpuSeconds = number('x-gpu-seconds')
	const renderSeconds = number('x-render-seconds')
	const restorationSeconds = number('x-restoreformer-seconds')
	const providerExecutionIds = value('x-provider-execution-ids')
		.split(/[,|\s]+/)
		.map(item => item.trim())
		.filter(Boolean)
	return {
		gpuSeconds,
		renderSeconds,
		restorationSeconds,
		pipeline,
		enhancement,
		motionProfile,
		mouthProfile,
		gpuType,
		idempotencyState: state,
		isProviderCompute: gpuSeconds > 0 && state !== 'replay',
		isTerminalReplay: state === 'completed' && value('x-pipeline').toLowerCase() === 'replay',
		providerExecutionIds,
	}
}

export function avatarWorkerSelectionWeight(account) {
	const parsed = Number(account?.weight)
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export function avatarWorkerStartIndex(accounts, idempotencyKey = '') {
	const mode = String(process.env.BETTERPPTX_AVATAR_ROTATION_MODE || 'round-robin').trim().toLowerCase()
	const key = String(idempotencyKey || '').trim()
	if (mode === 'deterministic' && key) {
		const digest = crypto.createHash('sha256').update(key).digest()
		return digest.readUInt32BE(0) % accounts.length
	}
	if (mode === 'weighted' && accounts.length > 1) {
		const weights = accounts.map(avatarWorkerSelectionWeight)
		const total = weights.reduce((sum, weight) => sum + weight, 0)
		if (total > 0) {
			// Idempotency keys use a stable draw; keyless research calls use the
			// process cursor only to seed a draw and remain non-durable by design.
			const drawKey = key || `weighted:${avatarRoundRobin++}`
			const digest = crypto.createHash('sha256').update(drawKey).digest()
			const draw = (digest.readUInt32BE(0) / 0x100000000) * total
			let cursor = 0
			for (let index = 0; index < weights.length; index++) {
				cursor += weights[index]
				if (draw < cursor) return index
			}
			return weights.length - 1
		}
	}
	// Reserve the round-robin slot when work starts, not after it succeeds.
	// Avatar jobs may run concurrently; advancing only on completion lets two
	// simultaneous jobs observe the same cursor and overload the same worker.
	const index = ((avatarRoundRobin % accounts.length) + accounts.length) % accounts.length
	avatarRoundRobin++
	return index
}

function timeoutMs() {
	return Math.max(1000, Number(process.env.BETTERPPTX_AVATAR_TIMEOUT_MS || 600000))
}

function avatarQuotaEstimateGpuSeconds() {
	const value = Number(process.env.BETTERPPTX_AVATAR_WORKER_ESTIMATED_GPU_SECONDS || 120)
	return Number.isFinite(value) && value > 0 ? value : 120
}

function avatarRequestFingerprint(imageBuffer, audioBuffer, quality, provider, durationMs, motionProfile = 'default') {
	const digest = crypto.createHash('sha256')
	const updateSized = (value, sizeBytes) => {
		const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value ?? ''), 'utf8')
		const size = Buffer.alloc(sizeBytes)
		if (sizeBytes === 8) size.writeBigUInt64BE(BigInt(buffer.length))
		else size.writeUInt32BE(buffer.length)
		digest.update(size)
		digest.update(buffer)
	}
	updateSized(imageBuffer, 8)
	updateSized(audioBuffer, 8)
	for (const value of [quality || 'default', provider || 'musetalk', durationMs ? String(durationMs) : '', motionProfile || 'default']) updateSized(value, 4)
	return digest.digest('hex')
}

// Product-level motion controls. LivePortrait CLI names stay private to the
// worker; only these allowlisted profiles may cross the authenticated boundary.
export function normalizeAvatarMotionProfile(value) {
	const profile = String(value || 'default').trim().toLowerCase().replaceAll('_', '-')
	if (!profile || profile === 'default' || profile === 'normal') return 'default'
	if (profile === 'low' || profile === 'low-motion' || profile === 'subtle') return 'low'
	if (profile === 'natural' || profile === 'natural-blink' || profile === 'narration') return 'natural'
	if (profile === 'blink') return 'blink'
	if (profile === 'blink-soft' || profile === 'soft-blink' || profile === 'reduced-eyes') return 'blink-soft'
	if (profile === 'blink-closed-soft-gaze' || profile === 'closed-blink-soft-gaze') return 'blink-closed-soft-gaze'
	if (profile === 'mouth-only' || profile === 'lip-only' || profile === 'lip') return 'mouth-only'
	if (profile === 'balanced' || profile === 'medium' || profile === 'full-no-mouth' || profile === 'full-with-musetalk-mouth') return 'balanced'
	if (profile === 'static' || profile === 'still' || profile === 'off') return 'static'
	throw avatarError('AVATAR_MOTION_PROFILE_INVALID', 'Unsupported avatar motion profile.')
}

export function normalizeAvatarMouthProfile(value) {
	const profile = String(value || 'default').trim().toLowerCase().replaceAll('_', '-')
	if (!profile || profile === 'default') return 'default'
	if (profile === 'jaw') return 'jaw'
	if (profile === 'raw' || profile === 'tight' || profile === 'tight-mouth') return 'raw'
	if (profile === 'jaw-strong' || profile === 'strong' || profile === 'enhanced') return 'jaw-strong'
	if (profile === 'inner') return 'inner'
	if (profile === 'raw-sharp' || profile === 'sharp') return 'raw-sharp'
	if (profile === 'lower' || profile === 'lower-lip' || profile === 'lower-mouth') return 'lower'
	if (profile === 'aligned' || profile === 'aligned-raw' || profile === 'warp-mask') return 'aligned'
	if (profile === 'warp' || profile === 'warped' || profile === 'full-lip' || profile === 'full-upper-lip') return 'warp'
	if (profile === 'warp-upper' || profile === 'upper' || profile === 'upper-lip') return 'warp-upper'
	if (profile === 'warp-upper-teeth-clean' || profile === 'upper-teeth-clean' || profile === 'teeth-band-clean') return 'warp-upper-teeth-clean'
	if (profile === 'warp-upper-teeth' || profile === 'upper-teeth' || profile === 'teeth-band') return 'warp-upper-teeth'
	throw avatarError('AVATAR_MOUTH_PROFILE_INVALID', 'Unsupported avatar mouth profile.')
}

async function cancelAvatarWorkerRequest(account, idempotencyKey, fingerprint) {
	if (!idempotencyKey || !fingerprint) return
	const endpoint = accountEndpoint(account).replace(/\/v1\/avatar\/lipsync\/?$/, '/v1/avatar/lipsync/cancel')
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), 10000)
	try {
		const headers = { 'Content-Type': 'application/json', 'Idempotency-Key': String(idempotencyKey), 'X-Avatar-Request-Fingerprint': fingerprint, Accept: 'application/json' }
		if (account.token) headers.Authorization = `Bearer ${account.token}`
		await fetch(endpoint, { method: 'POST', headers, body: '{}', signal: controller.signal })
	} catch {}
	finally { clearTimeout(timer) }
}

function mimeFor(filePath, fallback) {
	const ext = path.extname(filePath).toLowerCase()
	if (ext === '.png') return 'image/png'
	if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
	if (ext === '.wav') return 'audio/wav'
	if (ext === '.m4a') return 'audio/mp4'
	if (ext === '.mp3') return 'audio/mpeg'
	return fallback
}

async function writeResponseVideo(response, outputPath, { workerHost = '' } = {}) {
	const contentType = response.headers.get('content-type') || ''
	if (contentType.includes('application/json')) {
		const data = await response.json()
		const base64 = data?.videoBase64 || data?.mp4Base64 || data?.video?.base64 || ''
		const dataUri = data?.videoDataUri || data?.video?.dataUri || ''
		if (base64) {
			await fs.writeFile(outputPath, Buffer.from(String(base64), 'base64'))
			return outputPath
		}
		if (dataUri) {
			const parsed = parseDataUri(dataUri)
			if (!parsed || !String(parsed.mime || '').toLowerCase().includes('mp4')) {
				throw avatarError('AVATAR_UNAVAILABLE', 'Avatar worker returned unsupported media.')
			}
			await fs.writeFile(outputPath, parsed.buffer)
			return outputPath
		}
		const resultUrl = data?.downloadUrl || data?.videoUrl || data?.video?.url || ''
		if (resultUrl && process.env.BETTERPPTX_AVATAR_WORKER_ALLOW_RESULT_URLS === '1') {
			let resultHost = ''
			try { resultHost = new URL(String(resultUrl)).hostname.toLowerCase() } catch { throw avatarError('AVATAR_UNAVAILABLE', 'Avatar worker returned an invalid result URL.') }
			const configuredHosts = String(process.env.BETTERPPTX_AVATAR_RESULT_URL_HOSTS || '')
				.split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
			const allowedHosts = configuredHosts.length ? configuredHosts : (workerHost ? [workerHost.toLowerCase()] : [])
			if (!allowedHosts.includes(resultHost)) throw avatarError('AVATAR_UNAVAILABLE', 'Avatar worker result URL is not allowlisted.')
			recordResourceUsage({ externalCalls: 1 })
			const follow = await safeFetchToBuffer(resultUrl, {
				timeoutMs: Math.max(1000, Number(process.env.BETTERPPTX_AVATAR_RESULT_URL_TIMEOUT_MS || 30000)),
				maxBytes: Math.max(1, Number(process.env.BETTERPPTX_AVATAR_RESULT_URL_MAX_MB || 256)) * 1048576,
				headers: { Accept: 'video/mp4, application/octet-stream' },
			})
			if (!follow.ok) throw avatarError('AVATAR_UNAVAILABLE', 'Avatar worker result could not be fetched.')
			await fs.writeFile(outputPath, follow.buffer)
			return outputPath
		}
		throw avatarError('AVATAR_UNAVAILABLE', 'Avatar worker did not return video.')
	}
	await fs.writeFile(outputPath, Buffer.from(await response.arrayBuffer()))
	return outputPath
}

export async function renderMuseTalkHttp({ avatarImagePath, audioPath, durationMs, jobDir, quality = 'default', provider = 'musetalk', idempotencyKey = '', options = {} } = {}) {
	const resolvedOptions = resolveProductionTalkingHeadOptions(provider, options, {
		normalizeMotionProfile: normalizeAvatarMotionProfile,
		normalizeMouthProfile: normalizeAvatarMouthProfile,
	})
	const motionProfile = normalizeAvatarMotionProfile(resolvedOptions?.motionProfile)
	const mouthProfile = normalizeAvatarMouthProfile(resolvedOptions?.mouthProfile)
	if (provider === 'musetalk' && !['default', 'static'].includes(motionProfile)) {
		throw avatarError('AVATAR_MOTION_PROFILE_INVALID', 'Motion profiles require the LivePortrait presenter pipeline.')
	}
	const accounts = avatarWorkerAccounts(provider)
	if (!accounts.length) throw avatarError('AVATAR_UNAVAILABLE', 'Avatar worker is not configured.')
	const quotaReadiness = avatarWorkerQuotaReadiness()
	const quotaConfig = avatarWorkerQuotaProductionConfig()
	if (!quotaConfig.ok) {
		throw avatarError('AVATAR_QUOTA_UNAVAILABLE', 'Avatar worker quota state is not configured for distributed production use.', { retryable: false, reasons: quotaConfig.errors })
	}
	const quotaStore = quotaReadiness.configured && quotaReadiness.limitGpuSeconds > 0 ? createAvatarWorkerQuotaStore() : null
	// Monthly per-account USD cap (owner hard rule: $29.50 per Modal account). An account
	// that cannot fit the next render drops out of rotation; a required gate fails closed.
	const budgetConfig = avatarWorkerBudgetProductionConfig()
	if (!budgetConfig.ok) {
		throw avatarError('AVATAR_BUDGET_UNAVAILABLE', 'Avatar worker budget state is not configured for production use.', { retryable: false, reasons: budgetConfig.errors })
	}
	const budgetStore = createAvatarWorkerBudgetStore()
	if (budgetConfig.required && !budgetStore) throw avatarError('AVATAR_BUDGET_UNAVAILABLE', 'Avatar worker budget state is unavailable.', { retryable: false })
	const quotaEstimate = avatarQuotaEstimateGpuSeconds()
	const stateStore = createAvatarWorkerStateStore()
	let states = []
	try { states = await stateStore.list(accounts.map(account => account.id)) } catch { states = [] }
	const now = Date.now()
	const healthy = accounts.filter(account => {
		const state = states.find(item => item?.accountHash === crypto.createHash('sha256').update(account.id).digest('hex'))
		return !state?.cooldownUntil || Date.parse(state.cooldownUntil) <= now
	})
	// If every endpoint is cooling down, probe the full set once rather than failing closed
	// forever; the shared state is a circuit-breaker hint, not a permanent account disable.
	const eligibleAccounts = healthy.length ? healthy : accounts
	const outputPath = path.join(jobDir, 'avatar-worker-raw.mp4')
	const imageBuffer = await fs.readFile(avatarImagePath)
	const audioBuffer = await fs.readFile(audioPath)
	const imageMime = mimeFor(avatarImagePath, 'image/png')
	const audioMime = mimeFor(audioPath, 'audio/wav')
	const fingerprint = idempotencyKey ? avatarRequestFingerprint(imageBuffer, audioBuffer, quality, provider, durationMs, `${motionProfile}:${mouthProfile}`) : ''

	// ROUND-ROBIN + FAILOVER across configured avatar workers (round-robin spreads load / GPU
	// credits; on failure fail over to the next). `provider` is forwarded as the worker `mode`
	// (e.g. liveportrait-musetalk), so the pipeline choice is unchanged.
	const start = avatarWorkerStartIndex(eligibleAccounts, idempotencyKey)
	let lastErr = null
	// Accounts skipped before any provider call (daily quota, monthly budget, stale billing).
	// They never replace a real worker error; if every account was skipped, the caller gets
	// one actionable capacity error instead of whichever skip happened to come last.
	const capacitySkips = []
	const attemptTrace = []
	for (let i = 0; i < eligibleAccounts.length; i++) {
		const account = eligibleAccounts[(start + i) % eligibleAccounts.length]
		const accountHash = crypto.createHash('sha256').update(account.id).digest('hex')
		const quotaReservationId = `${idempotencyKey || crypto.randomUUID()}:${account.id}`
		let quotaReserved = false
		let quotaSettled = false
		let quotaKeepReservation = false
		let budgetReserved = false
		let budgetSettled = false
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), timeoutMs())
		try {
			if (quotaStore) {
				let reservation
				try { reservation = await quotaStore.reserve(account.id, quotaReservationId, quotaEstimate) }
				catch (error) {
					if (quotaReadiness.required) throw avatarError('AVATAR_QUOTA_UNAVAILABLE', 'Avatar worker quota state is unavailable.', { retryable: false, cause: String(error?.message || '').slice(0, 120) })
					throw error
				}
				if (!reservation?.ok) {
					attemptTrace.push({ accountHash, phase: 'quota', code: String(reservation?.code || 'AVATAR_WORKER_QUOTA_EXCEEDED') })
					capacitySkips.push('daily-quota')
					continue
				}
				quotaReserved = true
			}
			if (budgetStore) {
				let budget
				try { budget = await budgetStore.reserve(account.id, quotaReservationId, budgetConfig.estimatedRenderUsd) }
				catch (error) {
					if (budgetConfig.required) throw avatarError('AVATAR_BUDGET_UNAVAILABLE', 'Avatar worker budget state is unavailable.', { retryable: false, cause: String(error?.message || '').slice(0, 120) })
					throw error
				}
				if (!budget?.ok) {
					attemptTrace.push({ accountHash, phase: 'budget', code: String(budget?.code || 'AVATAR_WORKER_BUDGET_EXHAUSTED') })
					if (quotaStore && quotaReserved) { try { await quotaStore.release(account.id, quotaReservationId) } catch {} quotaSettled = true }
					capacitySkips.push(budget?.code === 'AVATAR_WORKER_BILLING_STALE' ? 'billing-stale' : 'monthly-budget')
					continue
				}
				budgetReserved = true
			}
			const body = new FormData()
			body.append('image', new Blob([imageBuffer], { type: imageMime }), 'avatar.png')
			body.append('audio', new Blob([audioBuffer], { type: audioMime }), 'narration.wav')
			body.append('quality', String(quality || 'default'))
			// The commercial endpoint runs the upstream InsightFace + BiSeNet lane but
			// keeps the public worker mode opaque and compatible with the existing
			// authenticated multipart contract.
			body.append('mode', provider === 'liveportrait-musetalk-commercial' ? 'liveportrait-musetalk' : String(provider || 'musetalk'))
			if (durationMs) body.append('durationMs', String(Math.round(Number(durationMs))))
			if (motionProfile !== 'default') body.append('motionProfile', motionProfile)
			if (mouthProfile !== 'default') body.append('mouthProfile', mouthProfile)
			const headers = { Accept: 'video/mp4, application/json' }
			if (account.token) headers.Authorization = `Bearer ${account.token}`
			if (idempotencyKey) {
				headers['Idempotency-Key'] = String(idempotencyKey)
				headers['X-Avatar-Request-Fingerprint'] = fingerprint
			}
			recordResourceUsage({ externalCalls: 1 })
			const response = await fetch(accountEndpoint(account), { method: 'POST', headers, body, signal: controller.signal })
			if (!response.ok) {
				const status = Number(response.status)
				const idempotencyState = String(response.headers.get('x-idempotency-state') || '').toLowerCase()
				attemptTrace.push({ accountHash, status, idempotencyState, phase: 'http' })
				const retryable = !['running', 'conflict', 'cancelled'].includes(idempotencyState) && (status >= 500 || [401, 403, 408, 409, 425, 429].includes(status))
				let workerCode = ''
				try { const payload = await response.clone().json(); workerCode = String(payload?.detail || payload?.error?.code || '').slice(0, 120) } catch {}
				throw avatarError('AVATAR_UNAVAILABLE', 'Avatar worker failed to produce video.', { status, retryable, idempotencyState, workerCode })
			}
			const providerUsage = avatarProviderUsageFromHeaders(response.headers)
			assertProductionTalkingHeadAttestation(provider, providerUsage)
			if (quotaStore && quotaReserved) {
				if (providerUsage.isProviderCompute) {
					const settled = await quotaStore.settle(account.id, quotaReservationId, providerUsage.gpuSeconds)
					if (!settled?.ok && quotaReadiness.required) { quotaKeepReservation = true; throw avatarError('AVATAR_QUOTA_UNAVAILABLE', 'Avatar worker quota settlement failed.', { retryable: false }) }
					quotaSettled = Boolean(settled?.ok)
				} else {
					await quotaStore.release(account.id, quotaReservationId)
					quotaSettled = true
				}
			}
			if (budgetStore && budgetReserved) {
				// A failed settlement keeps the full estimate reserved: spend is never under-counted.
				try {
					if (providerUsage.isProviderCompute) await budgetStore.settle(account.id, quotaReservationId, avatarWorkerRenderCostUsd(providerUsage.gpuSeconds, budgetConfig))
					else await budgetStore.release(account.id, quotaReservationId)
				} catch {}
				budgetSettled = true
			}
			// Only the first provider execution reports X-Gpu-Seconds.  A broker replay
			// is terminal media retrieval and must not create a second billable usage row.
			if (providerUsage.isProviderCompute) {
				recordResourceUsage({ gpuSeconds: providerUsage.gpuSeconds, avatarVideoSeconds: providerUsage.renderSeconds })
			}
			if (providerUsage.pipeline || providerUsage.gpuType || providerUsage.idempotencyState) {
					recordResourceLabels({
					avatarPipeline: providerUsage.pipeline || 'unknown',
					avatarMotionProfile: providerUsage.motionProfile || motionProfile,
					avatarMouthProfile: providerUsage.mouthProfile || mouthProfile,
					avatarGpuType: providerUsage.gpuType || 'unknown',
					avatarIdempotencyState: providerUsage.idempotencyState || 'disabled',
					avatarProviderExecutionCount: String(providerUsage.providerExecutionIds.length),
				})
			}
			await writeResponseVideo(response, outputPath, { workerHost: new URL(account.url).hostname })
			if (providerUsage.isProviderCompute) {
				const metrologyReadiness = avatarProviderMetrologyReadiness()
				if (metrologyReadiness.required && !providerUsage.providerExecutionIds.length) {
					throw avatarError('AVATAR_METROLOGY_UNAVAILABLE', 'Avatar provider metrology is unavailable.')
				}
				if (providerUsage.providerExecutionIds.length) {
					try {
						const outputDigest = crypto.createHash('sha256').update(await fs.readFile(outputPath)).digest('hex')
						const recorded = await recordAvatarProviderMetrology({
							accountId: account.id,
							providerExecutionIds: providerUsage.providerExecutionIds,
							capturedAt: new Date().toISOString(),
							pipeline: providerUsage.pipeline,
							gpuType: providerUsage.gpuType,
							gpuSeconds: providerUsage.gpuSeconds,
							renderSeconds: providerUsage.renderSeconds,
							idempotencyState: providerUsage.idempotencyState,
							outputDigest,
							idempotencyKey,
						})
						if (metrologyReadiness.required && !recorded) throw new Error('AVATAR_METROLOGY_STORE_DISABLED')
					} catch (error) {
						if (metrologyReadiness.required) throw avatarError('AVATAR_METROLOGY_UNAVAILABLE', 'Avatar provider metrology could not be recorded.')
					}
				}
			}
			try { await stateStore.recordSuccess(account.id) } catch {}
			return {
				ok: true,
				rawVideoPath: outputPath,
				warnings: i > 0 ? [`avatar-worker: failed over to endpoint ${i + 1}/${eligibleAccounts.length}`] : [],
				...(process.env.BETTERPPTX_PRIVATE_METROLOGY === '1' ? { providerExecutionIds: providerUsage.providerExecutionIds } : {}),
			}
		} catch (err) {
			if (quotaStore && quotaReserved && !quotaSettled && !quotaKeepReservation) {
				try { await quotaStore.release(account.id, quotaReservationId) } catch {}
			}
			// The worker may have used GPU time before failing, so a failed attempt that reached
			// the provider settles at the cold-start allowance instead of being released.
			if (budgetStore && budgetReserved && !budgetSettled) {
				try { await budgetStore.settle(account.id, quotaReservationId, avatarWorkerRenderCostUsd(0, budgetConfig)) } catch {}
			}
			attemptTrace.push({ accountHash, status: Number(err?.details?.status || 0) || null, idempotencyState: String(err?.details?.idempotencyState || ''), phase: err?.name === 'AbortError' ? 'timeout' : 'error', errorName: String(err?.name || 'Error'), errorCode: String(err?.code || '').slice(0, 80), errorMessage: String(err?.message || '').slice(0, 160) })
			if (err?.name === 'AbortError') {
				await cancelAvatarWorkerRequest(account, idempotencyKey, fingerprint)
				lastErr = avatarError('AVATAR_UNAVAILABLE', 'Avatar worker timed out.', { retryable: Boolean(!idempotencyKey) })
			}
			else if (err?.code) {
				lastErr = err
				if (!lastErr.details) lastErr.details = { retryable: true, workerCode: String(err?.message || '').slice(0, 120) }
			}
			else lastErr = avatarError('AVATAR_UNAVAILABLE', 'Avatar worker failed to produce video.', { retryable: true, workerCode: String(err?.message || '').slice(0, 120) })
			if (err?.details?.retryable !== false) {
				const status = Number(err?.details?.status || 0)
				try { await stateStore.recordFailure(account.id, status === 429 ? 'quota' : (status >= 500 || !status ? 'transient' : 'auth')) } catch {}
			}
			if (err?.details?.retryable === false) break
			continue // fail over to the next worker
		} finally {
			clearTimeout(timer)
		}
	}
	if (!lastErr && capacitySkips.length) {
		const reasons = [...new Set(capacitySkips)].sort()
		lastErr = avatarError('AVATAR_CAPACITY_EXHAUSTED', 'Talking-head rendering capacity is temporarily exhausted. No video was rendered and no talking-head allowance was used. Retry later, or continue with voice-only narration.', { retryable: true, reasons, skippedAccounts: capacitySkips.length })
	}
	if (lastErr?.details) lastErr.details = { ...lastErr.details, attempts: attemptTrace }
	throw lastErr || avatarError('AVATAR_UNAVAILABLE', 'All avatar workers failed.')
}
