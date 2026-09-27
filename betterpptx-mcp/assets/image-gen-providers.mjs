// GENERATED IMAGE PROVIDER (M-genA): capability-routed creation + reference-aware editing.
// Sibling to stock-providers.mjs, but a DIFFERENT shape — generators are intent→bytes, not
// search→resolve. Public callers select a capability, never a model or deployment host.
// Handle scheme: gen://image/{requestHash}
//
// LICENSING DOCTRINE: FLUX.1 [schnell] is Apache-2.0 → generated outputs are commercially usable
// with NO attribution and NO upstream rights-holder (arguably the SAFEST embeddable content class).
// The creation and edit/reference models are both PINNED to Apache-2.0 releases. FLUX.1 [dev],
// FLUX [pro], and any non-commercial checkpoint are forbidden. There is deliberately no public
// model selector, so callers cannot violate the resale invariant.
//
// COST: unlike the free stock resolve (bandwidth only), generation is a REAL external USD cost
// (~sub-cent–half-cent/image of GPU) — metered as its own imageGen* family (server/service cost,
// pure USD; content licensing stays free). Hosts are scale-to-zero: self-hosted Modal Flux workers
// (owned L40S, native aspect) and Cloudflare Workers AI (edge, zero-ops); the provider interface
// is host-agnostic.
import { createHash } from 'node:crypto'
import { persistGeneratedAsset, loadGeneratedAsset } from '../storage/gen-asset-store.mjs'
import { safeFetchJson } from '../net/safe-fetch.mjs'
import { credentialAccounts } from '../config/credential-store.mjs'
import {
	imageRouterStateRequired,
	imageRouterStateStatus,
	imageRouterAccountState,
	recordImageRouterUse,
	markImageRouterExhausted,
} from '../storage/image-router-state.mjs'

export class ImageGenError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'ImageGenError'
		this.code = code
		this.details = details
	}
}

// The ONE license every generated image carries. No author, no sourceUrl — generated content has
// no upstream rights-holder; the Apache-2.0 model license makes the output ours to embed & sell.
const FLUX_SCHNELL_LICENSE = { license: 'Apache-2.0', licenseUrl: 'https://huggingface.co/black-forest-labs/FLUX.1-schnell', attributionRequired: false, commercialUse: 'allowed' }
const FLUX_KLEIN_LICENSE = { license: 'Apache-2.0', licenseUrl: 'https://huggingface.co/black-forest-labs/FLUX.2-klein-4B', attributionRequired: false, commercialUse: 'allowed' }
const FLUX_MODEL = {
	cloudflare: '@cf/black-forest-labs/flux-1-schnell',
	modal: 'black-forest-labs/FLUX.1-schnell', // self-hosted (deploy/flux-worker), native width/height
	editReference: 'black-forest-labs/FLUX.2-klein-4B', // private dedicated worker; image edit + multi-reference
}

export const IMAGE_GENERATION_CAPABILITIES = Object.freeze(['auto', 'create', 'edit', 'reference', 'multi-reference'])
const MAX_REFERENCE_IMAGES = 4

function env(name) { return String(process.env[name] || '').trim() }
// Cloudflare supports MULTIPLE accounts (free-tier rotation). The credential store (managed by
// the localhost param-store UI) is the account list of record — active account first, hot-reloaded
// on edit (mtime cache). Plain env vars remain the single-account fallback when no store exists.
const CF_STORE_PROVIDER_ID = 'cloudflare-workers-ai'
function cloudflareAccounts() {
	const fromStore = credentialAccounts(CF_STORE_PROVIDER_ID)
		.map(account => ({
			id: String(account.id || ''),
			label: String(account.label || account.id || ''),
			accountId: String(account.env?.BETTERPPTX_CLOUDFLARE_ACCOUNT_ID || '').trim(),
			token: String(account.env?.BETTERPPTX_CLOUDFLARE_API_TOKEN || '').trim(),
		}))
		.filter(account => account.id && account.accountId && account.token)
	if (fromStore.length) return fromStore
	const accountId = env('BETTERPPTX_CLOUDFLARE_ACCOUNT_ID')
	const token = env('BETTERPPTX_CLOUDFLARE_API_TOKEN')
	return accountId && token ? [{ id: 'env', label: 'env', accountId, token }] : []
}
// Self-hosted Modal Flux workers (deploy/flux-worker) — owned scale-to-zero L40S, native width/
// height. Like Cloudflare, MULTIPLE endpoints are supported (deploy the same worker on several
// Modal accounts → each has its own free monthly credits) and rotate via round-robin + failover.
const MODAL_FLUX_STORE_PROVIDER_ID = 'modal-flux'
function modalFluxAccounts() {
	const fromStore = credentialAccounts(MODAL_FLUX_STORE_PROVIDER_ID)
		.map(account => ({
			id: String(account.id || ''),
			label: String(account.label || account.id || ''),
			url: String(account.env?.BETTERPPTX_MODAL_FLUX_URL || '').trim(),
			token: String(account.env?.BETTERPPTX_MODAL_FLUX_TOKEN || '').trim(),
		}))
		.filter(account => account.id && account.url && account.token)
	if (fromStore.length) return fromStore
	const url = env('BETTERPPTX_MODAL_FLUX_URL')
	const token = env('BETTERPPTX_MODAL_FLUX_TOKEN')
	return url && token ? [{ id: 'env', label: 'env', url, token }] : []
}

// Dedicated edit/reference worker family. It is intentionally separate from the creation worker:
// each family scales to zero independently and a large edit checkpoint cannot increase the cold
// start or residency cost of ordinary text creation. Multiple endpoints rotate exactly like the
// creation lane, but use distinct credentials and an opaque capability-oriented provider id.
const MODAL_IMAGE_EDIT_STORE_PROVIDER_ID = 'modal-image-edit'
function modalImageEditAccounts() {
	const fromStore = credentialAccounts(MODAL_IMAGE_EDIT_STORE_PROVIDER_ID)
		.map(account => ({
			id: String(account.id || ''),
			label: String(account.label || account.id || ''),
			url: String(account.env?.BETTERPPTX_MODAL_IMAGE_EDIT_URL || '').trim(),
			token: String(account.env?.BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN || '').trim(),
		}))
		.filter(account => account.id && account.url && account.token)
	if (fromStore.length) return fromStore
	const url = env('BETTERPPTX_MODAL_IMAGE_EDIT_URL')
	const token = env('BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN')
	return url && token ? [{ id: 'env', label: 'env', url, token }] : []
}

export function imageGenProviderStatus() {
	const routerState = imageRouterStateStatus()
	return {
		modal: { configured: modalFluxAccounts().length > 0, endpoints: modalFluxAccounts().length, model: FLUX_MODEL.modal, license: 'Apache-2.0', host: 'Modal (self-hosted L40S, scale-to-zero, native aspect; round-robin across endpoints)' },
		cloudflare: { configured: cloudflareAccounts().length > 0, accounts: cloudflareAccounts().length, model: FLUX_MODEL.cloudflare, license: 'Apache-2.0', host: 'Cloudflare Workers AI (edge, scale-to-zero)', nativeAspect: 'square only', freeDailyCapPerAccount: cfFreeDailyCap(), freeDailyRemaining: cloudflareFreeDailyRemaining(), availableToday: cloudflareAvailableToday(), durableQuotaState: routerState.durable, quotaState: routerState.mode },
		editReference: { configured: modalImageEditAccounts().length > 0, endpoints: modalImageEditAccounts().length, model: FLUX_MODEL.editReference, license: 'Apache-2.0', host: 'Modal (private edit/reference worker, scale-to-zero, native aspect)' },
	}
}
export function imageGenConfigured(capability = 'create') {
	const normalized = normalizeImageCapability(capability)
	const status = imageGenProviderStatus()
	return normalized === 'create' ? status.modal.configured || status.cloudflare.configured : status.editReference.configured
}

// gen://image/{hash} — hash is a stable digest of the prompt + render params, so the same
// request dedupes to the same handle (and, downstream, the same cached bytes).
// G1 (release safety): the PUBLIC scheme is product-generic (no provider segment). The legacy
// provider-bearing form gen://flux/image/{hash} is still ACCEPTED (decks/specs/caches in the wild
// carry it) but never emitted anymore.
const GEN_HANDLE_RE = /^gen:\/\/(?:(flux)\/)?(image)\/([a-f0-9]{8,64})$/
export function parseGenHandle(handle) {
	const m = String(handle || '').trim().match(GEN_HANDLE_RE)
	return m ? { generator: m[1] || 'image-gen', kind: m[2], hash: m[3] } : null
}
export function isGenHandle(value) { return GEN_HANDLE_RE.test(String(value || '').trim()) }

const ASPECTS = {
	square: { width: 1024, height: 1024 },
	landscape: { width: 1280, height: 768 },
	portrait: { width: 768, height: 1280 },
	wide: { width: 1280, height: 768 },
	tall: { width: 768, height: 1280 },
}
// Positive-prompt steering (schnell has no negative-prompt input on these hosts) — keep outputs
// deck-appropriate and steer away from watermarks / readable text / brand marks.
const STYLE_HINTS = {
	photo: 'professional photograph, high detail, natural lighting',
	illustration: 'premium scientific editorial illustration, polished cutaway composition, rich material detail, crisp edges, coherent natural lighting, no diagram overlays',
	background: 'abstract background texture, soft gradient, minimal, no text',
	'3d': 'soft 3d render, subtle shadows, product visualization',
	diagram: 'minimal schematic, clean lines, plenty of negative space',
}
const SAFETY_SUFFIX = 'safe for work, professional, no watermark, no signature, no readable text, no brand logo'
// Small hard block on clearly out-of-policy requests (defense in depth beyond host moderation).
const BLOCKED_PROMPT_RE = /\b(nsfw|nude|naked|porn|sexual|gore|beheading|child\s*abuse|csam)\b/i

function normalizePrompt(prompt) { return String(prompt || '').trim().replace(/\s+/g, ' ') }
function wrapPrompt(prompt, style) {
	return [normalizePrompt(prompt), STYLE_HINTS[style] || '', SAFETY_SUFFIX].filter(Boolean).join(', ')
}
function clampSteps(steps) { return Math.max(1, Math.min(8, Math.round(Number(steps) || 4))) } // schnell is a 1–8 step model
function resolveAspect(aspect) { return ASPECTS[String(aspect || 'square').toLowerCase()] || ASPECTS.square }

export function normalizeImageCapability(value = 'auto', referenceCount = 0) {
	const raw = String(value || 'auto').trim().toLowerCase().replace(/_/g, '-')
	if (!raw || raw === 'auto') return Number(referenceCount) > 1 ? 'multi-reference' : Number(referenceCount) === 1 ? 'reference' : 'create'
	if (['create', 'generate', 'text-to-image', 'text2image', 't2i'].includes(raw)) return 'create'
	if (['edit', 'revise', 'variation', 'image-to-image', 'image2image', 'img2img', 'i2i'].includes(raw)) return 'edit'
	if (['reference', 'single-reference', 'reference-image'].includes(raw)) return 'reference'
	if (['multi-reference', 'multireference', 'multiple-reference', 'multi-ref'].includes(raw)) return 'multi-reference'
	throw new ImageGenError('IMAGE_GEN_CAPABILITY_INVALID', 'Choose an available image-generation capability.', { capability: raw })
}

export function promptHashFor({ prompt, style = '', aspect = 'square', steps = 4 }) {
	// provider is intentionally excluded so the handle is stable across a CF→Modal fallback. Aspect
	// is NORMALIZED to the resolved dims the render path actually uses, so 'Square'/'SQUARE'/'' and
	// unknown values that all render as the same size dedupe to the same handle (no double-generate).
	const { width, height } = resolveAspect(aspect)
	const basis = JSON.stringify({ p: normalizePrompt(prompt).toLowerCase(), style, w: width, h: height, steps: clampSteps(steps), v: 3 })
	return createHash('sha256').update(basis).digest('hex').slice(0, 40)
}

// Request identity for capability-routed generation. Plain creation deliberately delegates to the
// historical v3 hash so every existing cache and gen:// handle remains valid. Reference-aware work
// uses v4 and includes ordered content digests: changing an input image can never alias an earlier
// edit, while raw customer bytes never appear in a handle or persistent metadata key.
export function imageRequestHashFor({ prompt, style = '', aspect = 'square', steps = 4, capability = 'auto', referenceDigests = [], referenceImages = [] } = {}) {
	const refs = Array.isArray(referenceDigests) && referenceDigests.length
		? referenceDigests.map(value => String(value || '').trim()).filter(Boolean).slice(0, MAX_REFERENCE_IMAGES)
		: (Array.isArray(referenceImages) ? referenceImages : []).slice(0, MAX_REFERENCE_IMAGES).map(value =>
			createHash('sha256').update(String(value || '').replace(/^data:[^,]*,/, '')).digest('hex'))
	const normalized = normalizeImageCapability(capability, refs.length)
	if (normalized === 'create' && refs.length === 0) return promptHashFor({ prompt, style, aspect, steps })
	const { width, height } = resolveAspect(aspect)
	const basis = JSON.stringify({
		p: normalizePrompt(prompt).toLowerCase(), style, w: width, h: height,
		steps: clampSteps(steps), capability: normalized, refs, v: 4,
	})
	return createHash('sha256').update(basis).digest('hex').slice(0, 40)
}

// Premium ensemble identity is separate from the image request identity. The
// tenant-scoped selection record points from the ordinary request hash to the
// accepted winner, allowing a fresh worker to reuse the exact decision without
// regenerating either lane. Only opaque hashes and bounded policy fields enter
// this identity; prompts, image bytes, and credentials never do.
export function imageEnsembleSelectionHashFor({ baseHash, candidatePlan = {}, evaluationPlan = {}, referenceDigests = [] } = {}) {
	const lanes = [...new Set((Array.isArray(candidatePlan.capabilityLanes) ? candidatePlan.capabilityLanes : [])
		.map(value => String(value || '').trim().toLowerCase()).filter(value => value === 'create' || value === 'reference'))].sort()
	const basis = {
		baseHash: String(baseHash || ''),
		candidatePlan: {
			crossModelEnsemble: candidatePlan.crossModelEnsemble === true,
			initialCandidates: Math.max(1, Math.min(4, Math.round(Number(candidatePlan.initialCandidates) || lanes.length || 2))),
			hardGenerationCallCeiling: Math.max(1, Math.min(8, Math.round(Number(candidatePlan.hardGenerationCallCeiling) || lanes.length || 2))),
			capabilityLanes: lanes,
		},
		evaluationPlan: {
			sharpnessFirstResearch: evaluationPlan.sharpnessFirstResearch === true,
			selection: String(evaluationPlan.selection || 'hard-gates-then-owner-sharpness-proxy'),
		},
		referenceDigests: (Array.isArray(referenceDigests) ? referenceDigests : []).map(value => String(value || '').trim()).filter(Boolean).slice(0, MAX_REFERENCE_IMAGES),
		v: 1,
	}
	return createHash('sha256').update(JSON.stringify(basis)).digest('hex').slice(0, 40)
}

// Sniff the real image type from the decoded magic bytes so the embed path gets the right MIME.
function sniffContentType(base64) {
	const head = String(base64 || '').slice(0, 16)
	if (head.startsWith('iVBORw0KGgo')) return 'image/png'
	if (head.startsWith('/9j/')) return 'image/jpeg'
	if (head.startsWith('R0lGOD')) return 'image/gif'
	if (head.startsWith('UklGR')) return 'image/webp'
	return 'image/png'
}

// Cloudflare's basic schnell wrapper only produces 1024² — it is "native" (no crop) ONLY for a
// square request. Non-square would be cover-cropped, so those go to Modal (true native aspect).
function isNativeCloudflareAspect(aspect) {
	const a = String(aspect || 'square').toLowerCase()
	return a === '' || a === 'square'
}
// Cloudflare free-tier daily budget (approximate, configurable). We route square requests to CF
// until this many images/day, then fall to Modal — keeping us inside CF's free neuron allowance
// and off its paid/error path. Durable mode persists the count across local restarts; strict owner
// mode fails closed to Modal when that state cannot be written.
function cfFreeDailyCap() { const n = Number(process.env.BETTERPPTX_CLOUDFLARE_FREE_DAILY_IMAGES); return Number.isFinite(n) && n >= 0 ? n : 40 }
// PER-ACCOUNT daily state (count + exhausted flag), reset at UTC midnight. The cap is an
// ESTIMATE per account; the authoritative signal is Cloudflare's own quota/429 error, which
// marks that ACCOUNT exhausted → the router rotates to the NEXT store account. Process-local
// research mode remains available, while durable owner mode also rehydrates the counter.
let cfDaily = { date: '', accounts: new Map() }
let cfPersistenceFailed = false
function cfDailyState() {
	const d = new Date().toISOString().slice(0, 10)
	if (cfDaily.date !== d) cfDaily = { date: d, accounts: new Map() }
	return cfDaily
}
function cfAccountState(id) {
	const state = cfDailyState()
	if (!state.accounts.has(id)) state.accounts.set(id, { count: 0, exhausted: false })
	const current = state.accounts.get(id)
	const durable = imageRouterAccountState('cloudflare-workers-ai', id)
	if (durable.durable) {
		current.count = Math.max(current.count, durable.count)
		current.exhausted = current.exhausted || durable.exhausted
	}
	return current
}
// First account (active-first order) with budget left today, skipping any already tried this
// request — the one a CF request will use.
function nextCloudflareAccount(tried = null) {
	for (const account of cloudflareAccounts()) {
		if (tried && tried.has(account.id)) continue
		const state = cfAccountState(account.id)
		if (!state.exhausted && state.count < cfFreeDailyCap()) return account
	}
	return null
}
function currentCloudflareAccount() { return nextCloudflareAccount() }
function cloudflareAvailableToday() {
	if (imageRouterStateRequired() && (!imageRouterStateStatus().durable || cfPersistenceFailed)) return false
	return currentCloudflareAccount() !== null
}
function cloudflareFreeDailyRemaining() {
	return cloudflareAccounts().reduce((sum, account) => {
		const state = cfAccountState(account.id)
		return sum + (state.exhausted ? 0 : Math.max(0, cfFreeDailyCap() - state.count))
	}, 0)
}
function noteCloudflareUse(id) {
	cfAccountState(id).count += 1
	if (!recordImageRouterUse('cloudflare-workers-ai', id)) cfPersistenceFailed = true
}
function markCloudflareAccountExhausted(id) {
	cfAccountState(id).exhausted = true
	if (!markImageRouterExhausted('cloudflare-workers-ai', id)) cfPersistenceFailed = true
}
function isCloudflareExhaustionError(err) {
	// safe-fetch throws "HTTP 429" on rate-limit; CF also returns success:false with a neuron/quota
	// message. Match either. Non-exhaustion failures (500/network) fall back for the request but
	// leave CF eligible next time.
	const hay = `${String(err?.message || '')} ${JSON.stringify(err?.details || '')}`.toLowerCase()
	return /\b429\b|too many requests|rate.?limit|quota|neuron|exceed|capacity|limit reached|out of/.test(hay)
}
// Persistent per-account auth failure (revoked/wrong token, wrong account id): 401/403/404. Unlike a
// transient 5xx, retrying the SAME account won't help, so treat it like exhaustion (skip for the day).
function isCloudflareAuthError(err) {
	const hay = `${String(err?.message || '')} ${JSON.stringify(err?.details || '')}`.toLowerCase()
	return /\b40[134]\b|unauthor|forbidden|invalid.*(token|credential|account)|authentication/.test(hay)
}

// ROUTING POLICY (owner 2026-07-06): Cloudflare for NATIVE (square) aspect within its daily free
// tier — instant, sub-cent, zero-ops; Modal for the rest (non-square → CF would crop; or the CF
// free tier is spent) — owned scale-to-zero GPU with native aspect. Graceful fallback by config.
function chooseProvider(requested, aspect = 'square') {
	const status = imageGenProviderStatus()
	if (requested && requested !== 'any') {
		if (!status[requested]?.configured) throw new ImageGenError('IMAGE_GEN_PROVIDER_NOT_CONFIGURED', `The requested image route "${requested}" is not available on this server.`, { requested })
		if (requested === 'cloudflare' && imageRouterStateRequired() && status.cloudflare.durableQuotaState !== true) {
			throw new ImageGenError('IMAGE_GEN_ROUTER_STATE_UNAVAILABLE', 'The requested image route is temporarily unavailable because its quota safety state is unavailable.')
		}
		return requested
	}
	if (isNativeCloudflareAspect(aspect) && status.cloudflare.configured && cloudflareAvailableToday()) return 'cloudflare'
	if (status.modal.configured) return 'modal'
	// Non-square without Modal → CF + crop shim, but ONLY while CF still has budget.
	if (status.cloudflare.configured && cloudflareAvailableToday()) return 'cloudflare'
	// G1: the thrown message/details reach public clients — keep them product-generic; the
	// operator-facing configuration hint (env var names, provider status) goes to the server log only.
	if (process.env.BETTERPPTX_PUBLIC_BLACK_BOX === '1') {
		console.warn('[image-gen] not configured: image generation is unavailable.')
	} else {
		console.warn('[image-gen] not configured: set BETTERPPTX_MODAL_FLUX_URL + BETTERPPTX_MODAL_FLUX_TOKEN, or BETTERPPTX_CLOUDFLARE_ACCOUNT_ID + BETTERPPTX_API_TOKEN', status)
	}
	throw new ImageGenError('IMAGE_GEN_NOT_CONFIGURED',
		'Image generation is not configured on this server. Ask the service operator to enable it.')
}

// Generation is inherently slow (seconds warm; Modal COLD START can be minutes on first weight
// load), so these calls override safe-fetch's 30s default with generous timeouts.
const GEN_TIMEOUT_MS = 120000
const MODAL_TIMEOUT_MS = 300000
const MODAL_SCHEDULING_RETRIES = Math.max(0, Math.min(2, Number(process.env.BETTERPPTX_MODAL_SCHEDULING_RETRIES || 1)))

function isModalSchedulingTransient(err) {
	const code = String(err?.code || '')
	const hay = `${String(err?.message || '')} ${JSON.stringify(err?.details || '')}`.toLowerCase()
	return code === 'SAFE_FETCH_TIMEOUT' || code === 'ECONNRESET' || code === 'ECONNREFUSED' ||
		/\bHTTP\s+(408|425|429|500|502|503|504)\b/i.test(hay) || /not valid json|capacity|temporarily unavailable|upstream/.test(hay)
}

async function modalFetchJsonWithSchedulingRetry(fetchJson, url, options, telemetry = null) {
	let lastError = null
	for (let attempt = 0; attempt <= MODAL_SCHEDULING_RETRIES; attempt += 1) {
		if (telemetry) telemetry.schedulingAttempts = attempt + 1
		try {
			return await fetchJson(url, options)
		} catch (err) {
			lastError = err
			if (!isModalSchedulingTransient(err) || attempt >= MODAL_SCHEDULING_RETRIES) throw err
			// A short bounded backoff lets Modal's scheduler place the request on
			// the configured backup GPU without spinning or duplicating indefinitely.
			await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 2000 : 8000))
		}
	}
	throw lastError
}

async function cloudflareGenerate({ account, wrapped, steps, seed, fetchJson }) {
	const url = `https://api.cloudflare.com/client/v4/accounts/${account.accountId}/ai/run/${FLUX_MODEL.cloudflare}`
	const json = await fetchJson(url, {
		method: 'POST',
		headers: { Authorization: `Bearer ${account.token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ prompt: wrapped, steps, seed }),
		timeoutMs: GEN_TIMEOUT_MS,
	})
	// Cloudflare wraps model output: { result: { image: '<base64>' }, success, errors }
	// G1: thrown messages/details are client-visible — keep generic; log host detail server-side.
	if (json && json.success === false) {
		console.warn('[image-gen] cloudflare error', json.errors)
		throw new ImageGenError('IMAGE_GEN_FAILED', 'The image service returned an error.')
	}
	const base64 = json?.result?.image
	if (!base64) throw new ImageGenError('IMAGE_GEN_FAILED', 'The image service returned no image.')
	// Cloudflare Workers AI is serverless edge (billed per-neuron, tracked via the imageGenImages count) — we
	// pay NO per-second GPU here, so gpuSeconds is 0 (distinct from the self-hosted Modal L40S below).
	return { base64, model: FLUX_MODEL.cloudflare, gpuSeconds: 0, coldStart: false, gpuType: 'cloudflare-edge' }
}

// ACCOUNT ROTATION: walk the store's account list (active first). A quota/429 marks the current
// account exhausted for today and moves on to the next; any other failure propagates (transient
// errors shouldn't burn accounts). Throws the last error once every account is spent.
async function cloudflareGenerateRotating({ wrapped, steps, seed, fetchJson }) {
	const tried = new Set()
	let lastErr = null
	for (;;) {
		const account = nextCloudflareAccount(tried)
		if (!account) break
		tried.add(account.id) // never re-try the same account within one request (bounds the loop)
		try {
			const out = await cloudflareGenerate({ account, wrapped, steps, seed, fetchJson })
			noteCloudflareUse(account.id)
			return out
		} catch (err) {
			lastErr = err
			// Quota/rate-limit OR persistent auth failure → this account is done for the day, skip it
			// going forward. Transient (5xx/network) → try the next account THIS request but keep this
			// one eligible next time. Either way, ROTATE — never abort on one bad account.
			if (isCloudflareExhaustionError(err) || isCloudflareAuthError(err)) markCloudflareAccountExhausted(account.id)
			continue
		}
	}
	throw lastErr || new ImageGenError('IMAGE_GEN_FAILED', 'Image generation capacity is exhausted for today. Try again later.')
}

async function modalGenerate({ account, wrapped, steps, seed, width, height, fetchJson, telemetry = null }) {
	// Self-hosted worker (deploy/flux-worker/flux_app.py). Honors width/height natively → the
	// aspect-normalize step in generateImage is a no-op. Shared-token auth in the JSON body.
	const requestTelemetry = telemetry || {}
	const json = await modalFetchJsonWithSchedulingRetry(fetchJson, account.url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ token: account.token, prompt: wrapped, width, height, steps, seed }),
		timeoutMs: MODAL_TIMEOUT_MS,
	}, requestTelemetry)
	const base64 = json?.image
	if (!base64) throw new ImageGenError('IMAGE_GEN_FAILED', 'The image service returned no image.')
	// Self-hosted Modal L40S: capture the REAL per-request GPU cost the worker reports (inference + cold
	// model-load) so image generation is metered like its rigged-3D sibling, not just by image count.
	return {
		base64, model: json?.model || FLUX_MODEL.modal,
		gpuSeconds: Number(json?.gpuSeconds) || 0,
		coldStart: Boolean(json?.coldStart),
		gpuType: String(json?.gpuType || 'L40S'),
		attempts: Number(requestTelemetry.schedulingAttempts || 1),
	}
}

async function modalImageEditGenerate({ account, capability, referenceImages, wrapped, steps, seed, width, height, fetchJson, telemetry = null }) {
	const images = referenceImages.map(value => String(value || '').replace(/^data:[^,]*,/, '').trim())
	const requestTelemetry = telemetry || {}
	const json = await modalFetchJsonWithSchedulingRetry(fetchJson, account.url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ token: account.token, capability, prompt: wrapped, images, width, height, steps, seed }),
		timeoutMs: MODAL_TIMEOUT_MS,
	}, requestTelemetry)
	const base64 = json?.image
	if (!base64) throw new ImageGenError('IMAGE_GEN_FAILED', 'The image service returned no image.')
	return {
		base64, model: json?.model || FLUX_MODEL.editReference,
		gpuSeconds: Number(json?.gpuSeconds) || 0,
		coldStart: Boolean(json?.coldStart),
		gpuType: String(json?.gpuType || 'L40S'),
		attempts: Number(requestTelemetry.schedulingAttempts || 1),
	}
}

// ROUND-ROBIN + FAILOVER across Modal endpoints. Unlike Cloudflare there is no daily free-tier
// signal, so we spread load across endpoints (round-robin advances each success → uses every
// account's free credits) and, on any endpoint error, put that endpoint in a short cooldown and
// fail over to the next. Throws the last error only when every endpoint failed this request.
const MODAL_UNHEALTHY_COOLDOWN_MS = 120000
let modalRoundRobin = 0
const modalUnhealthyUntil = new Map() // endpoint id -> timestamp until which it's skipped
async function modalGenerateRotating({ wrapped, steps, seed, width, height, fetchJson }) {
	const all = modalFluxAccounts()
	if (!all.length) throw new ImageGenError('IMAGE_GEN_NOT_CONFIGURED', 'Image generation is not configured on this server. Ask the service operator to enable it.')
	const now = Date.now()
	const healthy = all.filter(a => { const until = modalUnhealthyUntil.get(a.id); return !until || until <= now })
	const pool = healthy.length ? healthy : all // if all are cooling down, try them anyway
	const start = ((modalRoundRobin % pool.length) + pool.length) % pool.length
	let lastErr = null
	let attempts = 0
	for (let i = 0; i < pool.length; i++) {
		const account = pool[(start + i) % pool.length]
		const telemetry = {}
		try {
			const out = await modalGenerate({ account, wrapped, steps, seed, width, height, fetchJson, telemetry })
			attempts += Number(telemetry.schedulingAttempts || out.attempts || 1)
			modalRoundRobin = start + i + 1 // next request starts at the following endpoint (load spread)
			modalUnhealthyUntil.delete(account.id)
			return { ...out, attempts }
		} catch (err) {
			attempts += Number(telemetry.schedulingAttempts || 1)
			lastErr = err
			modalUnhealthyUntil.set(account.id, Date.now() + MODAL_UNHEALTHY_COOLDOWN_MS)
			continue
		}
	}
	throw lastErr || new ImageGenError('IMAGE_GEN_FAILED', 'Image generation is temporarily unavailable. Try again shortly.')
}

let modalImageEditRoundRobin = 0
const modalImageEditUnhealthyUntil = new Map()
async function modalImageEditGenerateRotating({ capability, referenceImages, wrapped, steps, seed, width, height, fetchJson }) {
	const all = modalImageEditAccounts()
	if (!all.length) throw new ImageGenError('IMAGE_GEN_CAPABILITY_NOT_CONFIGURED', 'The requested image capability is not enabled on this server. Ask the service operator to enable it.')
	const now = Date.now()
	const healthy = all.filter(account => { const until = modalImageEditUnhealthyUntil.get(account.id); return !until || until <= now })
	const pool = healthy.length ? healthy : all
	const start = ((modalImageEditRoundRobin % pool.length) + pool.length) % pool.length
	let lastErr = null
	let attempts = 0
	for (let i = 0; i < pool.length; i += 1) {
		const account = pool[(start + i) % pool.length]
		const telemetry = {}
		try {
			const out = await modalImageEditGenerate({ account, capability, referenceImages, wrapped, steps, seed, width, height, fetchJson, telemetry })
			attempts += Number(telemetry.schedulingAttempts || out.attempts || 1)
			modalImageEditRoundRobin = start + i + 1
			modalImageEditUnhealthyUntil.delete(account.id)
			return { ...out, attempts }
		} catch (err) {
			attempts += Number(telemetry.schedulingAttempts || 1)
			lastErr = err
			modalImageEditUnhealthyUntil.set(account.id, Date.now() + MODAL_UNHEALTHY_COOLDOWN_MS)
		}
	}
	throw lastErr || new ImageGenError('IMAGE_GEN_FAILED', 'Image generation is temporarily unavailable. Try again shortly.')
}

// Generate ONE image. Returns { handle, base64, contentType, dataUri, width, height, provider,
// model, promptHash, license }. fetchJson is injectable for tests. NO public model selector.
export async function generateImage({ prompt, provider = 'any', aspect = 'square', style = '', steps = 4, capability = 'auto', referenceImages = [], referenceDigests = [], fetchJson = safeFetchJson } = {}) {
	const clean = normalizePrompt(prompt)
	if (!clean) throw new ImageGenError('IMAGE_GEN_PROMPT_REQUIRED', 'Provide a prompt describing the image.')
	if (BLOCKED_PROMPT_RE.test(clean)) throw new ImageGenError('IMAGE_GEN_UNSAFE_PROMPT', 'This prompt is not allowed for generation.')
	const refs = (Array.isArray(referenceImages) ? referenceImages : []).map(value => String(value || '').trim()).filter(Boolean)
	if (refs.length > MAX_REFERENCE_IMAGES) throw new ImageGenError('IMAGE_GEN_TOO_MANY_REFERENCES', `Use at most ${MAX_REFERENCE_IMAGES} reference images.`)
	const normalizedCapability = normalizeImageCapability(capability, refs.length)
	if (normalizedCapability !== 'create' && refs.length === 0) throw new ImageGenError('IMAGE_GEN_REFERENCE_REQUIRED', 'This image capability requires at least one reference image.')
	if (normalizedCapability === 'create' && refs.length > 0) throw new ImageGenError('IMAGE_GEN_CAPABILITY_INVALID', 'Use a reference-aware capability when reference images are supplied.')
	if (normalizedCapability === 'multi-reference' && refs.length < 2) throw new ImageGenError('IMAGE_GEN_MULTIPLE_REFERENCES_REQUIRED', 'Multi-reference generation requires at least two reference images.')
	const requestedAny = !provider || provider === 'any'
	let chosen = normalizedCapability === 'create' ? chooseProvider(provider, aspect) : 'modal-edit'
	if (normalizedCapability !== 'create') {
		if (provider && !['any', 'modal', 'modal-edit'].includes(provider)) throw new ImageGenError('IMAGE_GEN_CAPABILITY_UNAVAILABLE_ON_ROUTE', 'The requested route does not support this image capability.')
		if (!imageGenConfigured(normalizedCapability)) throw new ImageGenError('IMAGE_GEN_CAPABILITY_NOT_CONFIGURED', 'The requested image capability is not enabled on this server. Ask the service operator to enable it.')
	}
	const { width, height } = resolveAspect(aspect)
	const stepCount = clampSteps(steps)
	// provider is intentionally NOT in the hash → the handle identifies the REQUEST, so it stays
	// stable if the router falls back CF→Modal for the same prompt. Seed derives from it (repro + dedup).
	const hash = imageRequestHashFor({ prompt: clean, style, aspect, steps: stepCount, capability: normalizedCapability, referenceDigests, referenceImages: refs })
	const seed = parseInt(hash.slice(0, 8), 16)
	const wrapped = wrapPrompt(clean, style)
	const runHost = host => host === 'modal-edit'
		? modalImageEditGenerateRotating({ capability: normalizedCapability, referenceImages: refs, wrapped, steps: stepCount, seed, width, height, fetchJson })
		: host === 'modal'
		? modalGenerateRotating({ wrapped, steps: stepCount, seed, width, height, fetchJson })
		: cloudflareGenerateRotating({ wrapped, steps: stepCount, seed, fetchJson })
	let out
	try {
		out = await runHost(chosen)
	} catch (err) {
		// Resilience — react to the REAL free-tier state. Quota/429 rotation across CF accounts
		// already happened inside cloudflareGenerateRotating (each exhausted account is flagged for
		// the day). Whatever escapes here means CF is fully spent or hit a transient failure: on an
		// AUTO-routed request, fall back to Modal for THIS request. Explicit provider requests
		// (not 'any') surface their own error instead of silently rerouting.
		if (normalizedCapability === 'create' && requestedAny && chosen === 'cloudflare') {
			const status = imageGenProviderStatus()
			if (status.modal.configured) { chosen = 'modal'; out = await runHost('modal') }
			else throw err
		} else {
			throw err
		}
	}
	// Normalize to the requested aspect. Hosts differ: Cloudflare's basic schnell wrapper IGNORES
	// width/height and always returns 1024² square; the self-hosted Modal worker passes width/height
	// to the FluxPipeline and honors it natively. So decode, and ONLY when the host got the aspect
	// wrong do we cover-crop to the exact target — otherwise the original bytes pass through with
	// their TRUE dimensions. Guarantees `aspect` is always honored and reported dims are real.
	let base64 = out.base64
	let contentType = sniffContentType(base64)
	let finalWidth = width
	let finalHeight = height
	try {
		const sharp = (await import('sharp')).default
		const meta = await sharp(Buffer.from(base64, 'base64')).metadata()
		const actualW = meta.width || width
		const actualH = meta.height || height
		const aspectMismatch = Math.abs((actualW / actualH) - (width / height)) > 0.02
		if (aspectMismatch) {
			const cropped = await sharp(Buffer.from(base64, 'base64'))
				.resize(width, height, { fit: 'cover', position: 'centre' })
				.jpeg({ quality: 88 })
				.toBuffer()
			base64 = cropped.toString('base64')
			contentType = 'image/jpeg'
		} else {
			finalWidth = actualW // host honored aspect (Modal self-host) — report true dims
			finalHeight = actualH
		}
	} catch { /* sharp unavailable → best-effort: raw bytes + requested dims */ }
	return {
		handle: `gen://image/${hash}`,
		promptHash: hash,
		base64,
		contentType,
		dataUri: `data:${contentType};base64,${base64}`,
		width: finalWidth,
		height: finalHeight,
		provider: chosen,
		model: out.model,
		capability: normalizedCapability,
		referenceDigests: normalizedCapability === 'create' ? [] : (Array.isArray(referenceDigests) && referenceDigests.length
			? referenceDigests.map(value => String(value || '')).slice(0, MAX_REFERENCE_IMAGES)
			: refs.map(value => createHash('sha256').update(value.replace(/^data:[^,]*,/, '')).digest('hex'))),
		// Real per-request GPU cost (Modal L40S) + cold/which-GPU — carried so the engine meters it for CEO
		// cost attribution (0 for the Cloudflare edge host, which bills per-neuron via the image count).
		gpuSeconds: Number(out.gpuSeconds) || 0,
		coldStart: Boolean(out.coldStart),
		gpuType: String(out.gpuType || (chosen.startsWith('modal') ? 'L40S' : 'cloudflare-edge')),
		attempts: Math.max(1, Number(out.attempts) || 1),
		// No `provider` key here — the deck manifest tags provider:'flux'; host records the runner.
		license: { generator: normalizedCapability === 'create' ? 'flux-schnell' : 'flux-klein-4b', host: chosen, model: out.model, ...(normalizedCapability === 'create' ? FLUX_SCHNELL_LICENSE : FLUX_KLEIN_LICENSE) },
	}
}

// In-process cache: gen:// handles carry only a hash, so the bytes (and deterministic license)
// are cached at generate time and read back at embed time. Tenant-scoped durable persistence
// below hydrates this cache across instances and restarts when a shared/local store is enabled.
const genCache = new Map()
export function cacheGeneratedImage(result) {
	if (result?.promptHash) {
		genCache.set(result.promptHash, {
			dataUri: result.dataUri, contentType: result.contentType,
			width: result.width, height: result.height,
			// Carry GPU cost + cold/gpuType so a CACHE HIT can replay a $0-but-visible metered row.
			gpuSeconds: result.gpuSeconds, coldStart: result.coldStart, gpuType: result.gpuType,
			provider: result.provider, model: result.model, capability: result.capability || 'create', referenceDigests: result.referenceDigests || [], license: result.license,
			attempts: Math.max(1, Number(result.attempts) || 1),
			...(result.ocr ? { ocr: result.ocr } : {}),
			...(result.ensembleSelection ? { ensembleSelection: result.ensembleSelection } : {}),
		})
	}
	return result
}
export function getCachedGeneratedImage(hash) { return genCache.get(String(hash || '')) || null }

const ENSEMBLE_SELECTION_SCHEMA = 'betterpptx.gen-image-ensemble-selection.v1'

// Persist only the accepted winner's opaque hash and deterministic audit facts.
// The index is separate from the image blob record so a missing/corrupt winner
// remains a safe miss instead of silently returning a partial result.
export async function persistGeneratedImageEnsembleSelection({ selectionHash, tenantId = 'default', baseHash, finalHash, selectedLane, selection, candidateHashes = [], referenceDigests = [] } = {}) {
	const key = String(selectionHash || '')
	if (!/^[a-f0-9]{8,64}$/i.test(key) || !/^[a-f0-9]{8,64}$/i.test(String(finalHash || ''))) return { ok: false, reason: 'invalid-selection-index' }
	return persistGeneratedAsset({
		tenantId,
		hash: key,
		record: {
			kind: 'image-ensemble-selection', schemaVersion: ENSEMBLE_SELECTION_SCHEMA, hash: key,
			baseHash: String(baseHash || ''), finalHash: String(finalHash), selectedLane: String(selectedLane || ''),
			selection: selection && typeof selection === 'object' ? {
				status: String(selection.status || ''), reason: String(selection.reason || ''), policy: String(selection.policy || ''),
				ranked: Array.isArray(selection.ranked) ? selection.ranked.slice(0, 4).map(item => ({ lane: item?.lane || null, sharpness: Number(item?.sharpness) })) : [],
			} : null,
			candidateHashes: (Array.isArray(candidateHashes) ? candidateHashes : []).slice(0, 4).map(item => ({ lane: String(item?.lane || ''), hash: String(item?.hash || '') })),
			referenceDigests: (Array.isArray(referenceDigests) ? referenceDigests : []).slice(0, MAX_REFERENCE_IMAGES).map(value => String(value || '')),
		},
	})
}

export async function loadGeneratedImageEnsembleSelection(selectionHash, tenantId = 'default') {
	const key = String(selectionHash || '')
	if (!/^[a-f0-9]{8,64}$/i.test(key)) return null
	const loaded = await loadGeneratedAsset({ tenantId, hash: key })
	const record = loaded?.record
	if (record?.kind !== 'image-ensemble-selection' || record.schemaVersion !== ENSEMBLE_SELECTION_SCHEMA) return null
	if (!/^[a-f0-9]{8,64}$/i.test(String(record.finalHash || ''))) return null
	return record
}

// Durable tenant-scoped persistence mirrors the rigged-3D generated-asset contract. The process
// cache remains the synchronous read path used by the compiler/materializer; async entry points
// hydrate it before compile/embedding. Full provider provenance stays in the private record.
export async function persistGeneratedImage(hash, tenantId = 'default') {
	try {
		const key = String(hash || '')
		const entry = genCache.get(key)
		if (!entry?.dataUri) return { ok: false, reason: 'not-in-cache' }
		const match = String(entry.dataUri).match(/^data:([^;,]+);base64,(.+)$/s)
		if (!match) return { ok: false, reason: 'invalid-data-uri' }
		const contentType = entry.contentType || match[1] || 'image/png'
		const ext = contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/webp' ? 'webp' : 'png'
		const { dataUri: _dataUri, ...meta } = entry
		return await persistGeneratedAsset({
			tenantId,
			hash: key,
			record: { kind: 'image', hash: key, contentType, meta },
			blobs: { image: { base64: match[2], ext } },
		})
	} catch (err) {
		console.warn(`[gen-asset-store] persist image ${hash} failed: ${err?.message || err}`)
		return { ok: false, reason: err?.message || String(err) }
	}
}

export async function hydrateGeneratedImage(hash, tenantId = 'default') {
	const key = String(hash || '')
	const hit = genCache.get(key)
	if (hit) return hit
	try {
		const loaded = await loadGeneratedAsset({ tenantId, hash: key })
		if (!loaded || loaded.record?.kind !== 'image' || !loaded.blobs.image) return null
		const contentType = loaded.record.contentType || loaded.record.meta?.contentType || 'image/png'
		const entry = {
			...loaded.record.meta,
			contentType,
			dataUri: `data:${contentType};base64,${loaded.blobs.image.toString('base64')}`,
		}
		genCache.set(key, entry)
		return entry
	} catch (err) {
		console.warn(`[gen-asset-store] hydrate image ${hash} failed: ${err?.message || err}`)
		return null
	}
}
