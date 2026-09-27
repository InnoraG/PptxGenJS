// Private Modal worker-response adapter for IMG5. No Claude/GPT or other external
// AI API client is permitted in this boundary.
// It validates the opaque worker payload, removes runtime provenance, and delegates
// calibrated acceptance to semantic-judge.mjs. This module is never a public provider API.
import { evaluateSemanticJudge, sanitizeJudgeResult } from './semantic-judge.mjs'
import { credentialAccounts } from '../config/credential-store.mjs'
import { safeFetchJson } from '../net/safe-fetch.mjs'

const MAX_RESPONSE_BYTES = 64 * 1024
const FORBIDDEN_PUBLIC_KEYS = new Set(['model', 'modelRevision', 'provider', 'endpoint', 'runtime', 'container', 'path', 'weights'])

export function sanitizeSemanticJudgeWorkerResponse(raw) {
	let value = raw
	if (Buffer.isBuffer(value)) {
		if (value.length > MAX_RESPONSE_BYTES) return { status: 'abstain', reason: 'JUDGE_RESPONSE_TOO_LARGE' }
		try { value = JSON.parse(value.toString('utf8')) } catch { return { status: 'abstain', reason: 'JUDGE_RESPONSE_INVALID_JSON' } }
	}
	if (!value || typeof value !== 'object') return { status: 'abstain', reason: 'JUDGE_RESPONSE_INVALID' }
	const leaked = [...FORBIDDEN_PUBLIC_KEYS].filter(key => Object.prototype.hasOwnProperty.call(value, key))
	if (leaked.length) return { status: 'abstain', reason: 'JUDGE_RESPONSE_PROVENANCE_PRESENT' }
	const scorecard = sanitizeJudgeResult(value.scorecard || value)
	if (!scorecard) return { status: 'abstain', reason: 'JUDGE_RESPONSE_SCORECARD_INVALID' }
	return { status: 'complete', scorecard }
}

export function sanitizeSemanticJudgePairwiseResponse(raw) {
	let value = raw
	if (Buffer.isBuffer(value)) {
		if (value.length > MAX_RESPONSE_BYTES) return { status: 'abstain', reason: 'JUDGE_RESPONSE_TOO_LARGE' }
		try { value = JSON.parse(value.toString('utf8')) } catch { return { status: 'abstain', reason: 'JUDGE_RESPONSE_INVALID_JSON' } }
	}
	if (!value || typeof value !== 'object') return { status: 'abstain', reason: 'JUDGE_RESPONSE_INVALID' }
	const leaked = [...FORBIDDEN_PUBLIC_KEYS].filter(key => Object.prototype.hasOwnProperty.call(value, key))
	if (leaked.length) return { status: 'abstain', reason: 'JUDGE_RESPONSE_PROVENANCE_PRESENT' }
	const pairwise = value.pairwise
	if (!pairwise || typeof pairwise !== 'object' || !['left', 'right', 'tie'].includes(pairwise.choice)) {
		return { status: 'abstain', reason: 'JUDGE_RESPONSE_PAIRWISE_INVALID' }
	}
	const confidence = Number(pairwise.confidence)
	if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return { status: 'abstain', reason: 'JUDGE_RESPONSE_PAIRWISE_INVALID' }
	const issues = Array.isArray(pairwise.issues) ? pairwise.issues.slice(0, 4).map(value => String(value).slice(0, 160)) : []
	return { status: 'complete', pairwise: { choice: pairwise.choice, confidence, issues } }
}

// Worker metrology is kept on the private side of the adapter. It is deliberately
// limited to bounded numeric/operational facts; model, endpoint, account, token and
// runtime provenance can never cross this boundary.
export function sanitizeSemanticJudgeWorkerMetering(raw) {
	if (!raw || typeof raw !== 'object') return null
	const gpuSeconds = Number(raw.gpuSeconds)
	if (!Number.isFinite(gpuSeconds) || gpuSeconds < 0 || gpuSeconds > 86400) return null
	const gpuType = String(raw.gpuType || '').trim().slice(0, 40)
	return {
		gpuSeconds,
		coldStart: Boolean(raw.coldStart),
		...(gpuType ? { gpuType } : {}),
	}
}

export function evaluateWorkerJudgeResponse(raw, options = {}) {
	const sanitized = sanitizeSemanticJudgeWorkerResponse(raw)
	if (sanitized.status !== 'complete') return { status: 'abstain', scope: 'semantic-image-judge', reason: sanitized.reason }
	return evaluateSemanticJudge(sanitized.scorecard, options)
}

// Private runtime adapter. It is deliberately separate from the public provider surface:
// callers receive only an opaque scorecard or a generic abstention, never the endpoint,
// account, model, runtime or error details. The credential store remains hot-reloadable and
// the two-profile rotation baseline is enforced by the inventory gate.
const SEMANTIC_JUDGE_PROVIDER_ID = 'semantic-judge-worker'
const SEMANTIC_JUDGE_TIMEOUT_MS = 600000
const SEMANTIC_JUDGE_COOLDOWN_MS = 120000
let semanticJudgeRoundRobin = 0
const semanticJudgeUnhealthyUntil = new Map()

function semanticJudgeAccounts() {
	const fromStore = credentialAccounts(SEMANTIC_JUDGE_PROVIDER_ID)
		.map(account => ({
			id: String(account.id || ''),
			url: String(account.env?.BETTERPPTX_SEMANTIC_JUDGE_URL || '').trim(),
			pairUrl: String(account.env?.BETTERPPTX_SEMANTIC_JUDGE_PAIR_URL || '').trim(),
			token: String(account.env?.BETTERPPTX_SEMANTIC_JUDGE_TOKEN || '').trim(),
		}))
		.filter(account => account.id && account.url && account.token)
	if (fromStore.length) return fromStore
	const url = String(process.env.BETTERPPTX_SEMANTIC_JUDGE_URL || '').trim()
	const pairUrl = String(process.env.BETTERPPTX_SEMANTIC_JUDGE_PAIR_URL || '').trim()
	const token = String(process.env.BETTERPPTX_SEMANTIC_JUDGE_TOKEN || '').trim()
	return url && token ? [{ id: 'env', url, pairUrl, token }] : []
}

const BRIEF_COMPOSITION_KEYS = ['focalSide', 'quietSpace', 'noText', 'aspect', 'qualityCriterion', 'subjectPlacement', 'negativeSpace', 'palette', 'layoutIntent', 'slideRole', 'style']
const BRIEF_SERIES_KEYS = ['id', 'name', 'consistencyGroup', 'medium', 'lighting', 'palette', 'layout', 'variationSlots', 'anchor']
const briefText = (value, max) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max)
const copyBriefFields = (value, keys) => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
	const out = {}
	for (const key of keys) {
		if (!Object.prototype.hasOwnProperty.call(value, key)) continue
		const item = value[key]
		if (typeof item === 'string') out[key] = item.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 240)
		else if (typeof item === 'boolean' || typeof item === 'number') out[key] = item
		else if (Array.isArray(item)) out[key] = item.slice(0, 12).map(entry => typeof entry === 'string' ? entry.slice(0, 120) : entry).filter(entry => entry !== undefined)
		else if (item && typeof item === 'object') out[key] = Object.fromEntries(Object.entries(item).slice(0, 12).filter(([, entry]) => ['string', 'number', 'boolean'].includes(typeof entry)).map(([name, entry]) => [String(name).slice(0, 80), typeof entry === 'string' ? entry.slice(0, 160) : entry]))
	}
	return Object.keys(out).length ? out : undefined
}

function semanticJudgeBrief(request = {}) {
	const source = request.semanticBrief && typeof request.semanticBrief === 'object' ? request.semanticBrief : {}
	const composition = copyBriefFields(source.composition, BRIEF_COMPOSITION_KEYS) || {
		focalSide: String(request.focalSide || '').slice(0, 40),
		quietSpace: String(request.quietSpace || '').slice(0, 40),
		noText: request.noText === true,
		aspect: String(request.aspect || 'square').slice(0, 24),
	}
	const requestedCriterion = String(
		composition.qualityCriterion
		|| source.qualityCriterion
		|| request.imageQualityCriterion
		|| request.qualityCriterion
		|| (request.evaluationPlan?.sharpnessFirstResearch === true ? 'sharpness-first' : ''),
	).trim().slice(0, 40)
	if (requestedCriterion) composition.qualityCriterion = requestedCriterion
	return {
		message: briefText(source.message || request.slideMessage || request.prompt || '', 1200),
		purpose: briefText(source.purpose || request.visualPurpose || request.purpose || '', 240),
		world: briefText(source.world || request.world || '', 600),
		composition,
		series: copyBriefFields(source.series, BRIEF_SERIES_KEYS),
	}
}

function imageBase64(value) {
	const raw = String(value || '').trim()
	return raw.replace(/^data:[^,]*,/, '').replace(/\s+/g, '')
}

export async function invokeSemanticJudgeWorker({ image, dataUri, request = {}, fetchJson = safeFetchJson, timeoutMs = SEMANTIC_JUDGE_TIMEOUT_MS } = {}) {
	const encoded = imageBase64(image || dataUri)
	if (!encoded) return { status: 'abstain', scope: 'semantic-image-judge', reason: 'SEMANTIC_JUDGE_IMAGE_UNAVAILABLE' }
	const all = semanticJudgeAccounts()
	if (!all.length) return { status: 'abstain', scope: 'semantic-image-judge', reason: 'SEMANTIC_JUDGE_WORKER_UNAVAILABLE' }
	const now = Date.now()
	const healthy = all.filter(account => {
		const until = semanticJudgeUnhealthyUntil.get(account.id)
		return !until || until <= now
	})
	const pool = healthy.length ? healthy : all
	const start = ((semanticJudgeRoundRobin % pool.length) + pool.length) % pool.length
	let lastError = null
	let attempts = 0
	for (let index = 0; index < pool.length; index += 1) {
		const account = pool[(start + index) % pool.length]
		try {
			attempts += 1
			const json = await fetchJson(account.url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token: account.token, image: encoded, brief: semanticJudgeBrief(request) }),
				timeoutMs,
			})
			const sanitized = sanitizeSemanticJudgeWorkerResponse({ scorecard: json?.scorecard })
			if (sanitized.status !== 'complete') throw new Error('invalid private scorecard')
			const metering = sanitizeSemanticJudgeWorkerMetering(json)
			semanticJudgeRoundRobin = start + index + 1
			semanticJudgeUnhealthyUntil.delete(account.id)
			return { status: 'complete', scorecard: json.scorecard, attempts, ...(metering ? { metering } : {}) }
		} catch (error) {
			if (attempts === 0) attempts = 1
			lastError = error
			semanticJudgeUnhealthyUntil.set(account.id, Date.now() + SEMANTIC_JUDGE_COOLDOWN_MS)
		}
	}
	return { status: 'abstain', scope: 'semantic-image-judge', reason: 'SEMANTIC_JUDGE_WORKER_UNAVAILABLE', attempts }
}

export async function invokeSemanticJudgePairWorker({ leftImage, leftDataUri, rightImage, rightDataUri, request = {}, fetchJson = safeFetchJson, timeoutMs = SEMANTIC_JUDGE_TIMEOUT_MS } = {}) {
	const left = imageBase64(leftImage || leftDataUri)
	const right = imageBase64(rightImage || rightDataUri)
	if (!left || !right) return { status: 'abstain', scope: 'semantic-image-judge-pair', reason: 'SEMANTIC_JUDGE_IMAGE_UNAVAILABLE' }
	const all = semanticJudgeAccounts()
	if (!all.length) return { status: 'abstain', scope: 'semantic-image-judge-pair', reason: 'SEMANTIC_JUDGE_WORKER_UNAVAILABLE' }
	const now = Date.now()
	const healthy = all.filter(account => {
		const until = semanticJudgeUnhealthyUntil.get(account.id)
		return !until || until <= now
	})
	const pool = healthy.length ? healthy : all
	const start = ((semanticJudgeRoundRobin % pool.length) + pool.length) % pool.length
	let attempts = 0
	for (let index = 0; index < pool.length; index += 1) {
		const account = pool[(start + index) % pool.length]
		try {
			attempts += 1
			const json = await fetchJson(account.pairUrl || account.url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token: account.token, leftImage: left, rightImage: right, brief: semanticJudgeBrief(request) }),
				timeoutMs,
			})
            // The private worker response intentionally carries metering/provenance for
            // maintainer-side accounting. Strip that envelope before invoking the public-safe
            // pairwise sanitizer; those fields must never cross this adapter boundary, but they
            // must not make a valid private choice abstain either.
            const sanitized = sanitizeSemanticJudgePairwiseResponse({ pairwise: json?.pairwise })
			if (sanitized.status !== 'complete') throw new Error('invalid private pairwise choice')
			const metering = sanitizeSemanticJudgeWorkerMetering(json)
			semanticJudgeRoundRobin = start + index + 1
			semanticJudgeUnhealthyUntil.delete(account.id)
			return { status: 'complete', pairwise: json.pairwise, attempts, ...(metering ? { metering } : {}) }
		} catch {
			semanticJudgeUnhealthyUntil.set(account.id, Date.now() + SEMANTIC_JUDGE_COOLDOWN_MS)
		}
	}
	return { status: 'abstain', scope: 'semantic-image-judge-pair', reason: 'SEMANTIC_JUDGE_WORKER_UNAVAILABLE', attempts }
}

export { MAX_RESPONSE_BYTES, SEMANTIC_JUDGE_PROVIDER_ID }
