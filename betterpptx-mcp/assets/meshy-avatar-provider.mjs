import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { credentialAccounts } from '../config/credential-store.mjs'
import { safeFetchJson, safeFetchToBuffer } from '../net/safe-fetch.mjs'
import { hybridizeMeshyWithProvenMixamo, MESHY_MIXAMO_CONTRACT } from '../ir/meshy-mixamo-hybrid.mjs'

const API_ROOT = 'https://api.meshy.ai/openapi/v1'
const LIBRARY_PATH = fileURLToPath(new URL('./powerpoint-proven-mixamo-library.glb', import.meta.url))
const TERMINAL_FAILURES = new Set(['FAILED', 'CANCELED'])
const DEFAULT_POLL_MS = 5000
const DEFAULT_DEADLINE_MS = 20 * 60 * 1000
const MAX_GLB_BYTES = 128 * 1024 * 1024
const MAX_POSTER_BYTES = 16 * 1024 * 1024
let provenLibrary = null
let timelineProfileCache
const inFlightMeshyAvatars = new Map()

export class MeshyAvatarProviderError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'MeshyAvatarProviderError'
		this.code = code
		this.details = details
	}
}

function fail(code, message, details = {}) { throw new MeshyAvatarProviderError(code, message, details) }
function env(name) { return String(process.env[name] || '').trim() }

function normalizedHash(value) { return String(value || '').replace(/^sha256:/i, '').toLowerCase() }

/**
 * Validate the private PowerPoint oracle contract before it can be attached to
 * a personalized Meshy result. The profile is maintainer metadata only; the
 * public surface never returns it. A profile for another actor, an incomplete
 * clip set, or a malformed series must leave interaction solving disabled.
 */
export function validateEmpiricalClipTimelineProfile(profile, { actorHash = null, expectedClipCount = MESHY_MIXAMO_CONTRACT.maxAnimationCount } = {}) {
	const failures = []
	if (!profile || typeof profile !== 'object' || Array.isArray(profile)) failures.push('profile must be an object')
	if (Number(profile?.schemaVersion) !== 2) failures.push('schemaVersion must be 2')
	if (!profile?.actorHash || !profile?.clipLibraryHash) failures.push('actorHash and clipLibraryHash are required')
	if (actorHash && normalizedHash(profile?.actorHash) !== normalizedHash(actorHash)) failures.push('actorHash does not match the produced GLB')
	if (!String(profile?.executionProfileId || '').trim()) failures.push('executionProfileId is required')
	if (!String(profile?.oracleVersion || '').trim()) failures.push('oracleVersion is required')
	if (!profile?.evidence?.artifactHash || !profile?.evidence?.resultHash) failures.push('evidence artifactHash and resultHash are required')
	const timelines = profile?.timelines
	if (!timelines || typeof timelines !== 'object' || Array.isArray(timelines)) failures.push('timelines must be an object')
	const expectedKeys = Array.from({ length: Number(expectedClipCount) }, (_, index) => String(index))
	const actualKeys = timelines && typeof timelines === 'object' ? Object.keys(timelines).sort((a, b) => Number(a) - Number(b)) : []
	const missing = expectedKeys.filter(key => !Object.prototype.hasOwnProperty.call(timelines || {}, key))
	const extra = actualKeys.filter(key => !expectedKeys.includes(key))
	if (missing.length) failures.push(`missing timeline slots: ${missing.join(', ')}`)
	if (extra.length) failures.push(`unexpected timeline slots: ${extra.join(', ')}`)
	for (const key of expectedKeys) {
		const points = timelines?.[key]
		if (!Array.isArray(points) || points.length < 5) {
			failures.push(`timeline ${key} requires at least five points`)
			continue
		}
		if (points.some(point => !Array.isArray(point) || point.length < 3 || point.slice(0, 3).some(value => typeof value !== 'number' || !Number.isFinite(value)))) {
			failures.push(`timeline ${key} contains a malformed point`)
			continue
		}
		const times = points.map(point => point[0])
		if (times.some((time, index) => index > 0 && time < times[index - 1])) failures.push(`timeline ${key} timestamps are not ordered`)
	}
	return { ok: failures.length === 0, failures, profile: failures.length === 0 ? profile : null }
}

function configuredEmpiricalClipTimelines() {
	if (timelineProfileCache !== undefined) return timelineProfileCache
	timelineProfileCache = null
	try {
		const file = env('BETTERPPTX_MESHY_TIMELINES_FILE')
		if (file && statSync(file).isFile()) timelineProfileCache = JSON.parse(readFileSync(file, 'utf8'))
		else if (env('BETTERPPTX_MESHY_TIMELINES_JSON')) timelineProfileCache = JSON.parse(env('BETTERPPTX_MESHY_TIMELINES_JSON'))
	} catch (error) {
		console.warn('[meshy-avatar] invalid private PowerPoint timeline profile; interaction readiness remains blocked:', error?.message || error)
	}
	return timelineProfileCache
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }
function abortedError() { return new MeshyAvatarProviderError('MESHY_ABORTED', 'Meshy personalized-avatar generation was aborted.') }
function assertNotAborted(signal) { if (signal?.aborted) throw abortedError() }
async function waitWithSignal(ms, wait, signal) {
	assertNotAborted(signal)
	if (!signal) return wait(ms)
	return new Promise((resolve, reject) => {
		let settled = false
		const finish = (fn, value) => {
			if (settled) return
			settled = true
			signal.removeEventListener('abort', onAbort)
			fn(value)
		}
		const onAbort = () => finish(reject, abortedError())
		signal.addEventListener('abort', onAbort, { once: true })
		Promise.resolve().then(() => wait(ms)).then(value => finish(resolve, value), error => finish(reject, error))
	})
}

function meshyAccounts() {
	const stored = credentialAccounts('meshy')
		.map(account => ({ id: String(account.id || ''), apiKey: String(account.env?.BETTERPPTX_MESHY_API_KEY || account.env?.MESHY_API_KEY || '').trim() }))
		.filter(account => account.id && account.apiKey)
	if (stored.length) return stored
	const apiKey = env('BETTERPPTX_MESHY_API_KEY') || env('MESHY_API_KEY')
	return apiKey ? [{ id: 'env', apiKey }] : []
}

export function meshyAvatarProviderStatus() {
	const accounts = meshyAccounts()
	return { configured: accounts.length > 0, accounts: accounts.length, model: 'Meshy 6 multi-image + Meshy humanoid rigging + frozen Mixamo performer' }
}

function normalizeImages(images) {
	if (!Array.isArray(images) || images.length < 1 || images.length > 4) {
		fail('MESHY_IMAGE_COUNT_INVALID', 'Provide 1 to 4 full-body images of the same person from different angles.')
	}
	return images.map((value, index) => {
		const image = String(value || '').trim()
		if (!image) fail('MESHY_IMAGE_REQUIRED', `Image ${index + 1} is empty.`)
		if (/^https:\/\//i.test(image)) return image
		if (/^data:image\/(?:png|jpe?g);base64,/i.test(image)) return image
		if (/^[a-zA-Z0-9+/=\r\n]+$/.test(image)) return `data:image/png;base64,${image.replace(/\s+/g, '')}`
		fail('MESHY_IMAGE_FORMAT_INVALID', `Image ${index + 1} must be an HTTPS URL, PNG/JPEG data URI, or base64 PNG bytes.`)
	})
}

function requestHash(images, options) {
	return createHash('sha256').update(JSON.stringify({ images, ...options, contract: MESHY_MIXAMO_CONTRACT.version })).digest('hex').slice(0, 40)
}

export function meshyAvatarHashFor({ images, heightMeters = 1.7, targetPolycount = 220000, hdTexture = true } = {}) {
	return requestHash(normalizeImages(images), {
		heightMeters: Number(heightMeters),
		targetPolycount: Math.round(Number(targetPolycount)),
		hdTexture: Boolean(hdTexture),
		model: 'meshy-6',
		pose: 'a-pose',
	})
}

export function buildMeshyMultiImageRequest({ imageUrls, targetPolycount = 220000, hdTexture = true } = {}) {
	return {
		image_urls: imageUrls,
		ai_model: 'meshy-6',
		should_texture: true,
		enable_pbr: false,
		hd_texture: Boolean(hdTexture),
		should_remesh: true,
		topology: 'triangle',
		target_polycount: Math.round(Number(targetPolycount)),
		pose_mode: 'a-pose',
		image_enhancement: false,
		// Keep source lighting intact. Background removal is handled as an
		// alpha-only/original-preserving operation before this request; Meshy
		// must not relight or beautify the user's identity input.
		remove_lighting: false,
		moderation: true,
		target_formats: ['glb'],
		auto_size: true,
		origin_at: 'bottom',
		alpha_thumbnail: true,
		multi_view_thumbnails: true,
	}
}

async function requestJson(url, { apiKey, method = 'GET', body = null, fetchJson, signal }) {
	return fetchJson(url, {
		method,
		headers: { Authorization: `Bearer ${apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
		...(body ? { body: JSON.stringify(body) } : {}),
		timeoutMs: 60000,
		maxBytes: 4 * 1024 * 1024,
		signal,
	})
}

async function createTask(kind, body, context) {
	const json = await requestJson(`${API_ROOT}/${kind}`, { ...context, method: 'POST', body })
	const taskId = String(json?.result || '')
	if (!taskId) fail('MESHY_TASK_CREATE_FAILED', `Meshy did not return a ${kind} task id.`)
	return taskId
}

async function pollTask(kind, taskId, { apiKey, fetchJson, deadlineMs, deadlineAt, pollMs, wait, signal }) {
	const deadline = Number.isFinite(Number(deadlineAt))
		? Number(deadlineAt)
		: Date.now() + deadlineMs
	let latest = null
	while (Date.now() <= deadline) {
		assertNotAborted(signal)
		latest = await requestJson(`${API_ROOT}/${kind}/${encodeURIComponent(taskId)}`, { apiKey, fetchJson, signal })
		const status = String(latest?.status || '').toUpperCase()
		if (status === 'SUCCEEDED') return latest
		if (TERMINAL_FAILURES.has(status)) {
			fail('MESHY_TASK_FAILED', `Meshy ${kind} task failed.`, { kind, status, message: String(latest?.task_error?.message || '') })
		}
		await waitWithSignal(pollMs, wait, signal)
	}
	fail('MESHY_TASK_TIMEOUT', `Meshy ${kind} task did not finish before the bounded deadline.`, { kind, status: latest?.status || null })
}

async function download(url, { maxBytes, requireImage = false, fetchBuffer, signal }) {
	if (!/^https:\/\//i.test(String(url || ''))) fail('MESHY_ASSET_URL_MISSING', 'Meshy completed without a usable HTTPS asset URL.')
	assertNotAborted(signal)
	const response = await fetchBuffer(url, { timeoutMs: 60000, maxBytes, requireImage, signal })
	if (!response?.ok || !response?.buffer?.length) fail('MESHY_ASSET_DOWNLOAD_FAILED', 'Could not download a generated Meshy asset.', { status: response?.status || 0 })
	return Buffer.from(response.buffer)
}

function libraryBytes() {
	if (!provenLibrary) provenLibrary = readFileSync(LIBRARY_PATH)
	return provenLibrary
}

/**
 * Premium personalized-avatar pipeline:
 * 1-4 photos -> Meshy 6 textured A-pose -> Meshy skin weights -> frozen Mixamo/PowerPoint container.
 * Meshy's native animations and skeleton container are never shipped.
 */
async function performPersonalizedMeshyAvatar({
	images,
	heightMeters = 1.7,
	targetPolycount = 220000,
	hdTexture = true,
	apiKey = '',
	fetchJson = safeFetchJson,
	fetchBuffer = safeFetchToBuffer,
	deadlineMs = DEFAULT_DEADLINE_MS,
	pollMs = DEFAULT_POLL_MS,
	wait = sleep,
	provenGlb = null,
	signal = null,
} = {}) {
	const imageUrls = normalizeImages(images)
	assertNotAborted(signal)
	const height = Number(heightMeters)
	if (!Number.isFinite(height) || height <= 0) fail('MESHY_HEIGHT_INVALID', 'heightMeters must be a positive number.')
	const polycount = Math.round(Number(targetPolycount))
	if (!Number.isInteger(polycount) || polycount < 100 || polycount > 300000) {
		fail('MESHY_POLYCOUNT_INVALID', 'targetPolycount must be between 100 and 300,000.')
	}
	const key = String(apiKey || meshyAccounts()[0]?.apiKey || '').trim()
	if (!key) fail('MESHY_NOT_CONFIGURED', 'Personalized 3D avatar generation is not configured on this server.')
	const params = { heightMeters: height, targetPolycount: polycount, hdTexture: Boolean(hdTexture), model: 'meshy-6', pose: 'a-pose' }
	const operationDeadlineMs = Number(deadlineMs)
	if (!Number.isFinite(operationDeadlineMs) || operationDeadlineMs <= 0) fail('MESHY_DEADLINE_INVALID', 'deadlineMs must be a positive number.')
	const deadlineAt = Date.now() + operationDeadlineMs
	const hash = requestHash(imageUrls, params)
	const multiTaskId = await createTask('multi-image-to-3d', buildMeshyMultiImageRequest({ imageUrls, targetPolycount: polycount, hdTexture }), { apiKey: key, fetchJson, signal })
	const multi = await pollTask('multi-image-to-3d', multiTaskId, { apiKey: key, fetchJson, deadlineMs, deadlineAt, pollMs, wait, signal })
	if (!multi?.model_urls?.glb) fail('MESHY_MODEL_URL_MISSING', 'Meshy multi-image generation completed without a GLB.')

	if (Date.now() > deadlineAt) fail('MESHY_TASK_TIMEOUT', 'Meshy generation exceeded the bounded end-to-end deadline before rigging.', { kind: 'rigging' })
	const rigTaskId = await createTask('rigging', { input_task_id: multiTaskId, height_meters: height }, { apiKey: key, fetchJson, signal })
	const rig = await pollTask('rigging', rigTaskId, { apiKey: key, fetchJson, deadlineMs, deadlineAt, pollMs, wait, signal })
	const riggedUrl = rig?.result?.rigged_character_glb_url
	const riggedGlb = await download(riggedUrl, { maxBytes: MAX_GLB_BYTES, fetchBuffer, signal })
	assertNotAborted(signal)
	const hybrid = await hybridizeMeshyWithProvenMixamo({ meshyGlb: riggedGlb, provenGlb: provenGlb || libraryBytes() })

	let previewBase64 = null
	const previewUrl = multi?.alpha_thumbnail_url || multi?.thumbnail_url || ''
	if (previewUrl) {
		try { previewBase64 = (await download(previewUrl, { maxBytes: MAX_POSTER_BYTES, requireImage: true, fetchBuffer, signal })).toString('base64') }
		catch { previewBase64 = null }
	}
	const consumedCredits = (Number(multi?.consumed_credits) || 0) + (Number(rig?.consumed_credits) || 0)
	const configuredProfile = configuredEmpiricalClipTimelines()
	const outputActorHash = `sha256:${createHash('sha256').update(hybrid.glb).digest('hex')}`
	const timelineCheck = validateEmpiricalClipTimelineProfile(configuredProfile, { actorHash: outputActorHash })
	const empiricalClipTimelines = timelineCheck.profile
	const manifest = {
		...hybrid.manifest,
		source: { kind: 'multi-image', imageCount: imageUrls.length, model: 'meshy-6', pose: 'a-pose', targetPolycount: polycount, hdTexture: Boolean(hdTexture) },
		clipMap: { ...MESHY_MIXAMO_CONTRACT.clipMap },
		providerCredits: consumedCredits,
		...(empiricalClipTimelines ? {
			clipTimelines: empiricalClipTimelines,
			timelineSource: 'powerpoint-oracle',
			timelineProfileDigest: createHash('sha256').update(JSON.stringify(empiricalClipTimelines)).digest('hex').slice(0, 16),
			interactionReady: true,
		} : {
			interactionReady: false,
			interactionReadinessReason: configuredProfile
				? `Private PowerPoint oracle profile rejected: ${timelineCheck.failures.join('; ')}`
				: 'A final baked-GLB PowerPoint oracle timeline profile is not staged for this production Meshy avatar.',
		}),
	}
	return {
		handle: `gen://rigged3d/${hash}`,
		promptHash: hash,
		glbBase64: hybrid.glb.toString('base64'),
		glbBytes: hybrid.glb.length,
		rigged: true,
		performed: true,
		provider: 'meshy',
		model: 'meshy-6+rigging+mixamo-hybrid',
		meshResolution: 'premium',
		gpuSeconds: 0,
		genSeconds: 0,
		rigSeconds: 0,
		bakeSeconds: 0,
		coldStart: false,
		manifest,
		clipMap: manifest.clipMap,
		tier: 'proven-mixamo',
		confidence: hybrid.manifest.mappingConfidence,
		previewBase64,
		previewBytes: previewBase64 ? Math.floor(previewBase64.length * 0.75) : 0,
		providerCredits: consumedCredits,
		license: { generator: 'meshy-6', rigger: 'meshy', performer: 'mixamo-hybrid', host: 'meshy', attributionRequired: false, commercialUse: 'account-terms' },
	}
}

/**
 * Deduplicate overlapping personalized requests for the same immutable input hash.
 * A completed result is still handled by the caller's normal durable cache; this
 * map only prevents duplicate Meshy submissions while one request is active.
 */
export async function generatePersonalizedMeshyAvatar(options = {}) {
	assertNotAborted(options.signal)
	const hash = meshyAvatarHashFor(options)
	const active = inFlightMeshyAvatars.get(hash)
	if (active) return active
	const promise = performPersonalizedMeshyAvatar(options).finally(() => {
		if (inFlightMeshyAvatars.get(hash) === promise) inFlightMeshyAvatars.delete(hash)
	})
	inFlightMeshyAvatars.set(hash, promise)
	return promise
}
