import * as crypto from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { avatarSessionHash, loadAvatarJob, persistAvatarJob, createAvatarJobIfAbsent, createAvatarJobStore } from '../storage/avatar-job-store.mjs'
import {
	assertResourceAccess, bindNewResourceOwner, canAccessResource, currentResourceOwner,
	resourceAuthorizationActive, resourceOwnerForContext, resourceOwnerOf, withResourceAuthorization,
} from '../auth/resource-authorization.mjs'

const jobs = new Map()
const admissions = new Map()
const executions = new WeakMap()
const MAX_CONCURRENCY = Math.max(1, Number(process.env.BETTERPPTX_AVATAR_MAX_CONCURRENCY || 1))
const queue = []
let active = 0

function nextJobId(executionKey = '') {
	// The execution key is a private, server-issued reservation/operation identity,
	// never an unchecked client idempotency key. Its digest includes the owner.
	if (executionKey) {
		const owner = currentResourceOwner()
		return `avatar_job_${crypto.createHash('sha256').update(JSON.stringify([
			'betterpptx.avatar-execution.v1', owner.kind, owner.id, executionKey,
		])).digest('base64url')}`
	}
	return `avatar_job_${crypto.randomBytes(9).toString('base64url')}`
}

function jobError(code, message) {
	const error = new Error(message)
	error.code = code
	return error
}

function unavailable() {
	return jobError('AVATAR_JOB_NOT_FOUND', 'The avatar job is unavailable.')
}

function sameOwner(left, right) {
	return Boolean(left && right && left.schemaVersion === right.schemaVersion && left.kind === right.kind && left.id === right.id)
}

function hasOwnerBinding(job) {
	return Object.hasOwn(job, 'resourceOwner') || Boolean(job.metadata && Object.hasOwn(job.metadata, 'resourceOwner'))
}

function assertPersistedOwner(record, job) {
	if (record?.jobId !== job.id || (hasOwnerBinding(job) && !sameOwner(resourceOwnerOf(record), resourceOwnerOf(job)))) {
		throw jobError('AVATAR_JOB_PERSISTENCE_FAILED', 'Avatar job state could not be safely saved.')
	}
}

async function persistJob(job) {
	if (createAvatarJobStore().disabled) return
	const record = await persistAvatarJob(job)
	assertPersistedOwner(record, job)
}

async function executeJob(job) {
	let phase = 'starting'
	try {
		job.status = 'running'
		job.startedAt = new Date().toISOString()
		job.updatedAt = job.startedAt
		await persistJob(job)
		phase = 'rendering'
		const result = await job.task()
		phase = 'settling'
		// Billing owns this callback. Until it completes, every lookup and durable
		// record remains running with no result, including on a provider cache hit.
		await job.onSuccess?.(result, job)
		phase = 'publishing'
		const completedAt = new Date().toISOString()
		const completed = {
			...job, status: 'succeeded', result, completedAt, updatedAt: completedAt,
			metadata: { ...job.metadata, deliveryState: 'settled' },
		}
		await persistJob(completed)
		Object.assign(job, {
			status: completed.status, result, completedAt, updatedAt: completedAt, metadata: completed.metadata,
		})
	} catch (err) {
		job.status = 'failed'
		job.completedAt = new Date().toISOString()
		job.updatedAt = job.completedAt
		job.result = null
		job.metadata = { ...job.metadata, deliveryState: 'withheld', failurePhase: phase }
		job.error = {
			code: err?.code || 'AVATAR_FAILED',
			message: err?.message || String(err),
			...(err?.details && typeof err.details === 'object' ? {
				details: {
					status: Number(err.details.status || 0) || null,
					retryable: err.details.retryable === undefined ? undefined : Boolean(err.details.retryable),
					idempotencyState: err.details.idempotencyState ? String(err.details.idempotencyState) : null,
					workerCode: err.details.workerCode ? String(err.details.workerCode).slice(0, 120) : null,
					attempts: Array.isArray(err.details.attempts) ? err.details.attempts.map(attempt => ({
						accountHash: String(attempt?.accountHash || '').slice(0, 64),
						status: Number(attempt?.status || 0) || null,
						idempotencyState: String(attempt?.idempotencyState || '').slice(0, 32) || null,
						phase: String(attempt?.phase || '').slice(0, 32) || null,
						errorName: String(attempt?.errorName || '').slice(0, 64) || null,
						errorCode: String(attempt?.errorCode || '').slice(0, 80) || null,
						errorMessage: String(attempt?.errorMessage || '').slice(0, 160) || null,
					})) : undefined,
				},
			} : {}),
		}
		await persistJob(job).catch(() => {})
		// A render or settlement may already have consumed funds. Do not call a
		// release callback for an uncertain paid outcome or after settlement.
		const noCost = phase === 'starting' || (phase === 'rendering' && err?.billingNoCostConfirmed === true)
		const callback = !job.billing?.active || noCost ? job.onFailure : job.onUncertain
		try { await callback?.(err, job) }
		catch {
			job.metadata = { ...job.metadata, failureCallbackFailed: true }
			await persistJob(job).catch(() => {})
		}
	}
}

function runNext() {
	sweepJobs()
	while (active < MAX_CONCURRENCY && queue.length > 0) {
		const job = queue.shift()
		active++
		// A global queue can be drained by a different request. Restore the exact
		// creation scope (including nested authorization and billing scopes).
		Promise.resolve().then(() => executions.get(job)(() => executeJob(job))).finally(() => {
			executions.delete(job)
			active = Math.max(0, active - 1)
			runNext()
		})
	}
}

function sweepJobs() {
	const ttlMs = Math.max(60 * 1000, Number(process.env.BETTERPPTX_AVATAR_JOB_TTL_MS || 86400000))
	const maxJobs = Math.max(10, Number(process.env.BETTERPPTX_AVATAR_MAX_JOBS || 200))
	const now = Date.now()
	const completed = []
	for (const [id, job] of jobs) {
		const terminal = job.status === 'succeeded' || job.status === 'failed'
		const completedAt = Date.parse(job.completedAt || '')
		if (terminal && Number.isFinite(completedAt) && now - completedAt > ttlMs) jobs.delete(id)
		else if (terminal) completed.push(job)
	}
	if (jobs.size <= maxJobs) return
	for (const job of completed.sort((a, b) => Date.parse(a.completedAt || 0) - Date.parse(b.completedAt || 0))) {
		if (jobs.size <= maxJobs) break
		jobs.delete(job.id)
	}
}

export async function createAvatarJob({ task, sessionId = '', deckId = '', billing = null, executionKey = '', onSuccess, onFailure, onUncertain } = {}) {
	// Direct local callers may supply a server-issued session. Public dispatch
	// must already be scoped; supplied session fields never override that owner.
	if (!resourceAuthorizationActive() && sessionId) {
		return withResourceAuthorization({ sessionId }, () => createAvatarJob({
			task, sessionId, deckId, billing, executionKey, onSuccess, onFailure, onUncertain,
		}))
	}
	if (typeof task !== 'function' || (billing?.active && typeof onSuccess !== 'function')) {
		const error = jobError('AVATAR_JOB_INVALID', 'Avatar job execution and settlement must be configured.')
		error.billingNoCostConfirmed = true
		throw error
	}
	if (typeof executionKey !== 'string' || executionKey.length > 512) {
		throw jobError('AVATAR_JOB_INVALID', 'Avatar job execution identity is invalid.')
	}
	if (billing?.active) currentResourceOwner()
	sweepJobs()
	const id = nextJobId(executionKey)
	if (jobs.has(id)) return publicAvatarJob(assertAvatarJobAccess(jobs.get(id)))
	if (admissions.has(id)) return publicAvatarJob(assertAvatarJobAccess(await admissions.get(id)))
	const now = new Date().toISOString()
	const job = {
		id,
		status: 'queued',
		createdAt: now,
		updatedAt: now,
		sessionId: String(sessionId || ''),
		deckId: String(deckId || ''),
		billing: billing ? { ...billing } : null,
		metadata: { deliveryState: 'pending' },
		task,
		onSuccess,
		onFailure,
		onUncertain,
		result: null,
		error: null,
	}
	if (resourceAuthorizationActive()) {
		bindNewResourceOwner(job)
		job.metadata.resourceOwner = job.resourceOwner
	}
	executions.set(job, AsyncLocalStorage.snapshot())
	const admission = (async () => {
		const saved = await createAvatarJobIfAbsent(job)
		if (saved.record) {
			if (!saved.created) {
				// Existing records are never re-enqueued, including an interrupted
				// render after a restart. Unknown outcomes require reconciliation.
				return hydrateJob(saved.record)
			}
			assertPersistedOwner(saved.record, job)
		}
		jobs.set(id, job)
		queue.push(job)
		runNext()
		return job
	})()
	admissions.set(id, admission)
	try { return publicAvatarJob(await admission) }
	finally {
		if (admissions.get(id) === admission) admissions.delete(id)
		if (!jobs.has(id)) executions.delete(job)
	}
}

function validJobId(id) {
	return typeof id === 'string' && /^avatar_job_[A-Za-z0-9_-]{1,128}$/.test(id)
}

function authorizeLookup(job, context) {
	if (resourceAuthorizationActive() || hasOwnerBinding(job) || context) return assertAvatarJobAccess(job, context)
	return job // Trusted, unscoped local exports only; public dispatch must scope.
}

export function getAvatarJob(id, context) {
	sweepJobs()
	const job = validJobId(id) ? jobs.get(id) : null
	return job ? authorizeLookup(job, context) : null
}

function hydrateJob(durable, context) {
	authorizeLookup(durable, context)
	if (!validJobId(durable.jobId) || (durable.expiresAt && !(Date.parse(durable.expiresAt) > Date.now()))) throw unavailable()
	const job = {
		id: durable.jobId, status: durable.status, createdAt: durable.createdAt,
		startedAt: durable.startedAt, completedAt: durable.completedAt, updatedAt: durable.updatedAt,
		expiresAt: durable.expiresAt,
		sessionId: '', _sessionHash: durable.sessionHash, deckId: '',
		metadata: structuredClone(durable.metadata || {}),
		result: durable.status === 'succeeded' ? durable.result : null, error: durable.error,
	}
	if (Object.hasOwn(durable, 'resourceOwner')) job.resourceOwner = durable.resourceOwner
	return job
}

export async function getAvatarJobAsync(id, context) {
	const inMemory = getAvatarJob(id, context)
	if (inMemory) return inMemory
	if (!validJobId(id)) return null
	const durable = await loadAvatarJob(id)
	if (!durable) return null
	if (durable.jobId !== id) throw unavailable()
	return hydrateJob(durable, context)
}

// Durable-operation workers use this bounded wait so the operation ledger is
// not marked succeeded merely because a process-local job was enqueued. The
// ordinary public render_job path remains asynchronous and returns immediately.
export async function waitForAvatarJob(id, { timeoutMs = 900000, pollMs = 250, context } = {}) {
	const started = Date.now()
	for (;;) {
		const job = await getAvatarJobAsync(id, context)
		if (!job) {
			const err = new Error('Avatar job disappeared before completion.')
			err.code = 'AVATAR_JOB_NOT_FOUND'
			throw err
		}
		if (job.status === 'succeeded' || job.status === 'failed') return job
		if (Date.now() - started >= Math.max(1000, Number(timeoutMs) || 900000)) {
			const err = new Error('Avatar job exceeded the durable worker wait window.')
			err.code = 'AVATAR_JOB_TIMEOUT'
			throw err
		}
		await new Promise(resolve => setTimeout(resolve, Math.max(25, Number(pollMs) || 250)))
	}
}

export function assertAvatarJobAccess(job, context = {}) {
	if (!job) throw unavailable()
	if (resourceAuthorizationActive() && canAccessResource(job)) return job
	if (hasOwnerBinding(job)) {
		// Missing, malformed or foreign new ownership must never downgrade to a
		// matching legacy session. Active request identity always takes precedence.
		if (resourceAuthorizationActive()) return assertResourceAccess(job, { kind: 'job' })
		try { return withResourceAuthorization(context, () => assertResourceAccess(job, { kind: 'job' })) }
		catch { throw unavailable() }
	}
	try {
		let sessionId = context.sessionId
		if (resourceAuthorizationActive()) {
			const owner = currentResourceOwner()
			if (sessionId) {
				if (!sameOwner(resourceOwnerForContext(context), owner)) throw unavailable()
			} else if (job.sessionId && sameOwner(resourceOwnerForContext({ sessionId: job.sessionId }), owner)) {
				sessionId = job.sessionId
			} else throw unavailable()
		}
		// This context is private server input, never a client-provided session
		// header/argument. Reject empty, shared-default and malformed sessions.
		resourceOwnerForContext({ sessionId })
		const sessionHash = job._sessionHash || job.sessionHash
		if ((!job.sessionId && !sessionHash) || (job.sessionId && job.sessionId !== sessionId)
			|| (sessionHash && sessionHash !== avatarSessionHash(sessionId))) throw unavailable()
		return job
	} catch { throw unavailable() }
}

// Public error for a failed job: known codes say why and what to do next;
// anything else stays generic so private failure details never leak.
const AVATAR_JOB_FAILURES = {
	AVATAR_UNAVAILABLE: ['Talking-head rendering is not available in this environment.', 'Use voice-only narration (slides[].narration) or a native 3D presenter instead.'],
	AVATAR_LICENSE_REVIEW_REQUIRED: ['Talking-head rendering is not enabled in this deployment.', 'Use voice-only narration (slides[].narration) or a native 3D presenter instead; retrying will not help.'],
	AVATAR_SHARED_STORE_REQUIRED: ['Talking-head rendering is temporarily unavailable.', 'Retry later, or continue with voice-only narration (slides[].narration).'],
	AVATAR_SELFIE_REQUIRED: ['Talking-head generation requires a face image uploaded in the render request.', 'Start a new render_job with avatar.image and avatar.consentAffirmed:true.'],
	AVATAR_CONSENT_REQUIRED: ['Uploaded presenter images require explicit consent confirmation.', 'Start a new render_job with avatar.consentAffirmed:true after the user confirms permission to use the face.'],
	MEDIA_UNSUPPORTED_INPUT: ['The source media is not supported.', 'Upload the face as a PNG or JPEG image and start a new render_job.'],
	MEDIA_PROBE_FAILED: ['The rendered media could not be verified.', 'Start a new render_job with a different source image or audio.'],
	MEDIA_NORMALIZE_FAILED: ['The rendered media could not be normalized for PowerPoint.', 'Start a new render_job with a different source image or audio.'],
}

export function publicAvatarJobError(code) {
	const value = String(code || 'AVATAR_FAILED')
	const known = AVATAR_JOB_FAILURES[value]
	return known ? { code: value, message: `Avatar job failed: ${known[0]}`, fix: known[1] } : { code: value, message: 'Avatar job failed.' }
}

export function publicAvatarJob(job, context) {
	if (!job) throw unavailable()
	if (resourceAuthorizationActive() || hasOwnerBinding(job) || context) assertAvatarJobAccess(job, context)
	const video = job.status === 'succeeded' ? (job.result?.publicVideo || (job.result?.ref ? job.result : null)) : null
	const result = {
		jobId: job.id,
		status: job.status,
		createdAt: job.createdAt,
		startedAt: job.startedAt || null,
		completedAt: job.completedAt || null,
		video: video ? Object.fromEntries(['ref', 'posterRef', 'durationMs', 'extn', 'cacheHit']
			.filter(key => Object.hasOwn(video, key)).map(key => [key, video[key]])) : null,
		error: job.error ? publicAvatarJobError(job.error.code) : null,
	}
	if (process.env.BETTERPPTX_PRIVATE_METROLOGY === '1' && Array.isArray(job.result?.providerExecutionIds)) {
		result.providerExecutionIds = job.result.providerExecutionIds
	}
	if (process.env.BETTERPPTX_PRIVATE_METROLOGY === '1' && job.error?.details) {
		// Maintainer-only, secret-free failure classification. Public deployments do
		// not enable this flag; URLs, account ids, tokens, and raw worker payloads are
		// deliberately excluded even in local diagnostics.
		result.diagnostics = {
			status: Number(job.error.details.status || 0) || null,
			retryable: job.error.details.retryable === undefined ? null : Boolean(job.error.details.retryable),
			idempotencyState: String(job.error.details.idempotencyState || '').slice(0, 32) || null,
			workerCode: String(job.error.details.workerCode || '').slice(0, 120) || null,
			attempts: Array.isArray(job.error.details.attempts) ? job.error.details.attempts.map(attempt => ({
				accountHash: String(attempt?.accountHash || '').slice(0, 64),
				status: Number(attempt?.status || 0) || null,
				idempotencyState: String(attempt?.idempotencyState || '').slice(0, 32) || null,
				phase: String(attempt?.phase || '').slice(0, 32) || null,
				errorCode: String(attempt?.errorCode || '').slice(0, 80) || null,
				errorMessage: String(attempt?.errorMessage || '').slice(0, 160) || null,
			})) : [],
		}
	}
	return result
}
