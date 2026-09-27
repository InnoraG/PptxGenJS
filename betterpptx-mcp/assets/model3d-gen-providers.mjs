// GENERATED RIGGED-3D PROVIDER (M-gen3D): image→rigged GLB via TRELLIS.2 (image→mesh) + DRTK
// permissive texture export + UniRig (auto-rig), self-hosted on Modal L40S
// (deploy/model3d-worker/model3d_app.py). Sibling of
// image-gen-providers.mjs — same shape (prompt/image→bytes, not search→resolve), same rotation.
// Handle scheme: gen://trellis/rigged3d/{hash}
//
// PRODUCT ROUTE DOCTRINE: TRELLIS.2 + DRTK + UniRig are retained as a permissive, self-hosted
// PoC/flow-test route only. Their upstream licenses are recorded in the worker ledger, but this
// route is NOT the production personalized-presenter route and must not be represented as resale-cleared.
// Production personalized native 3D is exclusively ordered multi-view Meshy → Mixamo and is enforced
// by ir/native3d-policy.mjs. Both PoC models are pinned; no Hunyuan/RigNet paths exist.
//
// COST: generation is a REAL external USD cost (GPU-seconds on L40S: TRELLIS.2 inference + UniRig
// rigging + cold model-load), metered as its own model3dGen* family (server/service cost, pure USD;
// content licensing stays free). Host is scale-to-zero: owned Modal workers deployed across MULTIPLE
// accounts (betterxavatar1, betterxavatar2) that rotate round-robin + failover for free-tier spread.
import { createHash } from 'node:crypto'
import { persistGeneratedAsset, loadGeneratedAsset } from '../storage/gen-asset-store.mjs'
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { safeFetchJson } from '../net/safe-fetch.mjs'
import { credentialAccounts } from '../config/credential-store.mjs'
import { transplantKinetic, transplantMotionSet, computeContacts, deriveIntentClipMap } from '../ir/kinetic-transplant.mjs'
import { resolveAuthoringMotionSelection } from '../ir/authoring-motion-catalog.mjs'
import { governedAuthoringMotionSelection, governedMotionRestProfileSha256, isMotionSourceProviderActive } from './authoring-motion-sources.mjs'
import { matchMixamoMotionBoneNames } from './mixamo-motion-bone-names.mjs'
import { meshyAvatarProviderStatus } from './meshy-avatar-provider.mjs'
import { applyStaticPoseFromSource, assertPowerPointSafeStaticPose } from './glb-static-pose-profile.mjs'
import { constrainPresenterArmArticulations, DEFAULT_CONSTRAINTS } from './glb-joint-rotation-constraints.mjs'
import { smoothRotationAnimations } from './glb-motion-smoothing.mjs'
import { composePresenterPerformance, validatedPresenterPerformanceRecipe } from '../ir/presenter-performance-composer.mjs'

const PERFORMANCE_COMPOSER_FINGERPRINT = createHash('sha256').update(readFileSync(new URL('../ir/presenter-performance-composer.mjs', import.meta.url))).digest('hex')

export class Model3DGenError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'Model3DGenError'
		this.code = code
		this.details = details
	}
}

// The ONE license every generated rigged model carries. No author, no sourceUrl — generated content
// has no upstream rights-holder; the MIT model licenses make the output ours to embed & sell.
const TRELLIS_UNIRIG_LICENSE = { license: 'MIT', licenseUrl: 'https://github.com/microsoft/TRELLIS.2', attributionRequired: false, commercialUse: 'allowed' }
const MODEL3D_GEN_MODEL = { generator: 'trellis-2', rigger: 'unirig' }

function env(name) { return String(process.env[name] || '').trim() }

// Self-hosted Modal rigged-3D workers (deploy/model3d-worker) — owned scale-to-zero L40S. Like the
// Flux workers, MULTIPLE endpoints are supported (the same worker deployed on the betterxavatar1 and
// betterxavatar2 Modal profiles → each has its own free monthly credits) and rotate via round-robin +
// failover. The credential store (localhost param-store UI) is the account list of record — active
// account first, hot-reloaded on edit (mtime cache). Plain env vars remain the single-endpoint fallback.
const MODEL3D_GEN_STORE_PROVIDER_ID = 'model3d-gen'
function model3dGenAccounts() {
	const fromStore = credentialAccounts(MODEL3D_GEN_STORE_PROVIDER_ID)
		.map(account => ({
			id: String(account.id || ''),
			label: String(account.label || account.id || ''),
			url: String(account.env?.BETTERPPTX_MODEL3D_GEN_URL || '').trim(),
			token: String(account.env?.BETTERPPTX_MODEL3D_GEN_TOKEN || '').trim(),
			healthUrl: String(account.env?.BETTERPPTX_MODEL3D_GEN_HEALTH_URL || '').trim(),
		}))
		.filter(account => account.id && account.url && account.token)
	if (fromStore.length) return fromStore
	const url = env('BETTERPPTX_MODEL3D_GEN_URL')
	const token = env('BETTERPPTX_MODEL3D_GEN_TOKEN')
	const healthUrl = env('BETTERPPTX_MODEL3D_GEN_HEALTH_URL')
	return url && token ? [{ id: 'env', label: 'env', url, token, healthUrl }] : []
}

export function model3dGenProviderStatus() {
	const endpoints = model3dGenAccounts().length
	return {
		modal: {
			configured: endpoints > 0,
			endpoints,
			model: 'TRELLIS.2 + UniRig',
			license: 'MIT',
			host: 'Modal (self-hosted L40S, scale-to-zero, memory-snapshot cold start; round-robin across requested private profiles)',
		},
		meshy: meshyAvatarProviderStatus(),
	}
}
export function model3dGenConfigured() { return model3dGenAccounts().length > 0 }

// Read-only health/identity probe. The worker's health URL is optional while
// legacy deployments are being replaced; when present, validate only the
// generic contract and never return/persist the raw response body.
export async function probeModel3dGenHealth({ account, fetchJson = safeFetchJson, timeoutMs = 8000 } = {}) {
	const healthUrl = String(account?.healthUrl || '').trim()
	if (!healthUrl) throw new Model3DGenError('MODEL3D_HEALTH_NOT_CONFIGURED', '3D worker health is not configured for this profile.')
	let json
	try {
		json = await fetchJson(healthUrl, { method: 'GET', timeoutMs, maxBytes: 64 * 1024 })
	} catch (error) {
		throw new Model3DGenError('MODEL3D_HEALTH_UNAVAILABLE', '3D worker health is temporarily unavailable.', { causeCode: error?.code })
	}
	if (json?.status !== 'ok' || json?.scope !== 'native-3d-presenter-only') {
		throw new Model3DGenError('MODEL3D_HEALTH_CONTRACT_INVALID', '3D worker health returned an invalid readiness contract.')
	}
	return {
		status: 'ok',
		scope: 'native-3d-presenter-only',
		revision: typeof json.revision === 'string' ? json.revision : null,
		sourceDigest: typeof json.sourceDigest === 'string' ? json.sourceDigest : null,
		responseBodyPersisted: false,
	}
}

// gen://rigged3d/{hash} — hash is a stable digest of the image basis + render params, so the
// same request dedupes to the same handle (and, downstream, the same cached bytes).
// G1 (release safety): the PUBLIC scheme is product-generic (no provider segment). The legacy
// provider-bearing form gen://trellis/rigged3d/{hash} is still ACCEPTED (decks/specs/caches in
// the wild carry it) but never emitted anymore.
const GEN_HANDLE_RE = /^gen:\/\/(?:(trellis)\/)?(rigged3d)\/([a-f0-9]{8,64})$/
export function parseGenRigged3dHandle(handle) {
	const m = String(handle || '').trim().match(GEN_HANDLE_RE)
	return m ? { generator: m[1] || 'model3d-gen', kind: m[2], hash: m[3] } : null
}
export function isGenRigged3dHandle(value) { return GEN_HANDLE_RE.test(String(value || '').trim()) }

const QUALITIES = new Set(['ppt-lite', 'standard'])
function normalizeQuality(quality) {
	const q = String(quality || 'ppt-lite').toLowerCase()
	return QUALITIES.has(q) ? q : 'ppt-lite'
}

// imageBasis identifies the SOURCE image (a gen://flux handle, a URL, or a sha of raw bytes) so the same
// picture + params dedupes. Provider is intentionally excluded → the handle is stable across a rotation/
// failover between endpoints. rig/quality change the output, so they enter the hash. `style` is NOT hashed:
// it only steers the (prompt-path) SOURCE image, whose identity is already captured by imageBasis (the
// style-sensitive Flux handle) — hashing it too would needlessly cache-miss identical image+rig+quality.
// `perform` (bake presenter gesture clips) + `canonicalSkeletonVersion` enter the hash: turning baking on/off
// yields a different asset, and a canonical clip-library rebuild (skeleton-version bump) must invalidate cached
// performers so avatars re-bake against the new clip order.
export function rigged3dHashFor({ imageBasis, rig = true, quality = 'ppt-lite', perform = false, canonicalSkeletonVersion = '2' }) {
	const basis = JSON.stringify({
		img: String(imageBasis || ''), rig: Boolean(rig), q: normalizeQuality(quality),
		perform: Boolean(perform), csv: perform ? String(canonicalSkeletonVersion || '1') : '', v: 2,
	})
	return createHash('sha256').update(basis).digest('hex').slice(0, 40)
}

// SUBMIT + POLL client. A rigged-3D job runs for minutes, but a Modal web endpoint hard-caps one HTTP
// response at ~150s (past that it 303-redirects, which safe-fetch caps at 5 hops → long jobs would die).
// So the worker is spawn/poll: submit returns a jobId fast; we poll until the GLB is ready. Every call is
// short. maxBytes is raised well above safe-fetch's 25MB default because the poll body carries the GLB
// (base64-inflated) — a 'standard' asset can exceed 25MB.
const SUBMIT_TIMEOUT_MS = 60000
const POLL_TIMEOUT_MS = 60000
const MAX_GLB_BYTES = 128 * 1024 * 1024
function pollIntervalMs() { const n = Number(process.env.BETTERPPTX_MODEL3D_POLL_INTERVAL_MS); return Number.isFinite(n) && n >= 0 ? n : 5000 }
export function pollDeadlineMs() { const n = Number(process.env.BETTERPPTX_MODEL3D_POLL_DEADLINE_MS); return Number.isFinite(n) && n > 0 ? n : 1200000 }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// Operator-only oracle injection. The AI/public spec never supplies this
// payload; production deploys stage a reviewed PowerPoint measurement through
// the private credential/config store. Without it, the worker rejects perform
// requests rather than producing an interaction-unsafe avatar.
let configuredTimelineProfileCache
function configuredEmpiricalClipTimelines() {
	if (configuredTimelineProfileCache !== undefined) return configuredTimelineProfileCache
	configuredTimelineProfileCache = null
	try {
		const file = String(process.env.BETTERPPTX_MODEL3D_TIMELINES_FILE || '').trim()
		if (file && statSync(file).isFile()) configuredTimelineProfileCache = JSON.parse(readFileSync(file, 'utf8'))
		else if (process.env.BETTERPPTX_MODEL3D_TIMELINES_JSON) configuredTimelineProfileCache = JSON.parse(process.env.BETTERPPTX_MODEL3D_TIMELINES_JSON)
	} catch (error) {
		console.warn('[model3d-gen] invalid private timeline profile; performed generation will fail closed:', error?.message || error)
	}
	return configuredTimelineProfileCache
}
function configuredInteractionClipset() {
	const value = String(process.env.BETTERPPTX_MODEL3D_INTERACTION_CLIPSET || '').trim().toLowerCase()
	return value || 'canonical'
}

async function model3dGenerate({ account, imageBase64, rig, quality, seed, perform, empiricalClipTimelines, interactionClipset, fetchJson }) {
	const post = (payload, timeoutMs) => fetchJson(account.url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ token: account.token, ...payload }),
		timeoutMs,
		maxBytes: MAX_GLB_BYTES,
	})
	// SUBMIT. A real worker returns { status:'pending', jobId }; a synchronous mock may return the GLB inline.
	let json = await post({ image: imageBase64, rig, quality, seed, perform, ...(perform && empiricalClipTimelines ? { empirical_clip_timelines: empiricalClipTimelines } : {}), ...(perform ? { interaction_clipset: interactionClipset || 'canonical' } : {}) }, SUBMIT_TIMEOUT_MS)
	if (!json?.glb && json?.jobId) {
		const jobId = json.jobId
		const deadline = Date.now() + pollDeadlineMs()
		while (Date.now() < deadline) {
			await sleep(pollIntervalMs())
			json = await post({ jobId }, POLL_TIMEOUT_MS)
			if (json?.glb) break
		}
	}
	const glbBase64 = json?.glb
	if (!glbBase64) {
		throw new Model3DGenError('MODEL3D_GEN_TIMEOUT', 'The 3D model job did not finish before the deadline. Try again.', { status: json?.status })
	}
	// gpuSeconds is the billing weight — if the worker omitted it, fall back to gen+rig seconds so a real
	// L40S generation is never costed at $0 (only the base minimum).
	const gpuSeconds = Number(json?.gpuSeconds) || (Number(json?.genSeconds) || 0) + (Number(json?.rigSeconds) || 0)
	const performed = Boolean(json?.performed)
	return {
		glbBase64,
		glbBytes: Number(json?.glbBytes) || Math.floor(String(glbBase64).length * 0.75),
		rigged: Boolean(json?.rigged),
		performed,
		model: String(json?.model || (rig ? 'trellis-2+unirig' : 'trellis-2')),
		gpuSeconds,
		// Per-STAGE GPU breakdown (Generator vs Rigger) — metrics-only for CEO attribution; their sum is the
		// already-priced gpuSeconds, so they never get their own USD line (would double-charge).
		genSeconds: Number(json?.genSeconds) || 0,
		rigSeconds: Number(json?.rigSeconds) || 0,
		// Baker is CPU — its seconds are reported apart from gpuSeconds so the GPU cost multiplier isn't skewed.
		bakeSeconds: Number(json?.bakeSeconds) || 0,
		coldStart: Boolean(json?.coldStart),
		gpuType: String(json?.gpuType || ''),  // which GPU served (L40S|A100...) — a cost-attribution label
		meshResolution: String(json?.meshResolution || quality),
		// The presenter contract: manifest.clipMap (intent→animId) seeds presenter-director.mjs when performed.
		manifest: performed && json?.manifest ? json.manifest : null,
		clipMap: performed ? (json?.clipMap || json?.manifest?.clipMap || null) : null,
		tier: performed ? (json?.tier ?? null) : null,
		confidence: performed ? (json?.confidence ?? null) : null,
	}
}

// ROUND-ROBIN + FAILOVER across Modal endpoints (identical topology to image-gen-providers). No daily
// free-tier signal, so we spread load across endpoints (round-robin advances each success → uses every
// account's free credits) and, on any endpoint error, put that endpoint in a short cooldown and fail
// over to the next. Throws the last error only when every endpoint failed this request.
// Failed-endpoint park time — CLIENT-SIDE FAILOVER ONLY, not a keep-warm/cost timer. When an endpoint
// errors we skip it for this long, then retry; nothing stays warm, so this costs nothing (it just picks
// which already-scale-to-zero endpoint to call). Mirrors the image-gen sibling. The ONLY money lever is
// the worker keep-warm (deploy/model3d-worker MODEL3D_DEV_MODE) — this timer is deliberately NOT tied to it.
const MODAL_UNHEALTHY_COOLDOWN_MS = 120000
let modalRoundRobin = 0
const modalUnhealthyUntil = new Map() // endpoint id -> timestamp until which it's skipped
async function model3dGenerateRotating({ imageBase64, rig, quality, seed, perform, empiricalClipTimelines, interactionClipset, fetchJson }) {
	const all = model3dGenAccounts()
	if (!all.length) {
		// G1: the thrown message reaches public clients — keep it product-generic; the operator-facing
		// configuration hint (env var names) goes to the server log only.
		console.warn('[model3d-gen] not configured: set BETTERPPTX_MODEL3D_GEN_URL + BETTERPPTX_MODEL3D_GEN_TOKEN, or add the model3d-gen provider in the param-store')
		throw new Model3DGenError('MODEL3D_GEN_NOT_CONFIGURED',
			'3D model generation is not configured on this server. Ask the service operator to enable it.')
	}
	const now = Date.now()
	const healthy = all.filter(a => { const until = modalUnhealthyUntil.get(a.id); return !until || until <= now })
	const pool = healthy.length ? healthy : all // if all are cooling down, try them anyway
	const start = ((modalRoundRobin % pool.length) + pool.length) % pool.length
	let lastErr = null
	for (let i = 0; i < pool.length; i++) {
		const account = pool[(start + i) % pool.length]
		try {
			const out = await model3dGenerate({ account, imageBase64, rig, quality, seed, perform, empiricalClipTimelines, interactionClipset, fetchJson })
			modalRoundRobin = start + i + 1 // next request starts at the following endpoint (load spread)
			modalUnhealthyUntil.delete(account.id)
			return out
		} catch (err) {
			lastErr = err
			modalUnhealthyUntil.set(account.id, Date.now() + MODAL_UNHEALTHY_COOLDOWN_MS)
			continue
		}
	}
	throw lastErr || new Model3DGenError('MODEL3D_GEN_FAILED', '3D model generation is temporarily unavailable. Try again shortly.')
}

// Generate ONE rigged GLB from a source IMAGE (already-resolved base64). Returns { handle, glbBase64,
// glbBytes, rigged, model, provider, gpuSeconds, promptHash, license }. fetchJson is injectable for tests.
export async function generateRigged3d({ imageBase64, imageBasis, style = '', rig = true, quality = 'ppt-lite', perform = false, seed, fetchJson = safeFetchJson } = {}) {
	const clean = String(imageBase64 || '').trim()
	if (!clean) throw new Model3DGenError('MODEL3D_GEN_IMAGE_REQUIRED', 'Provide a source image (base64) to generate a rigged 3D model.')
	const q = normalizeQuality(quality)
	const doPerform = Boolean(perform)
	const doRig = doPerform || Boolean(rig)  // baking presenter clips requires a rigged skeleton → implies rig
	const hash = rigged3dHashFor({ imageBasis: imageBasis || createHash('sha256').update(clean).digest('hex').slice(0, 24), style, rig: doRig, quality: q, perform: doPerform })
	const derivedSeed = Number.isFinite(Number(seed)) ? Number(seed) : parseInt(hash.slice(0, 8), 16)
	const out = await model3dGenerateRotating({ imageBase64: clean, rig: doRig, quality: q, seed: derivedSeed, perform: doPerform, empiricalClipTimelines: configuredEmpiricalClipTimelines(), interactionClipset: configuredInteractionClipset(), fetchJson })
	return {
		handle: `gen://rigged3d/${hash}`,
		promptHash: hash,
		glbBase64: out.glbBase64,
		glbBytes: out.glbBytes,
		rigged: out.rigged,
		performed: out.performed,
		gpuSeconds: out.gpuSeconds,
		bakeSeconds: out.bakeSeconds,
		// Per-stage + cold + which-GPU — carried so the engine can meter them for CEO cost attribution.
		genSeconds: out.genSeconds,
		rigSeconds: out.rigSeconds,
		coldStart: out.coldStart,
		gpuType: out.gpuType,
		meshResolution: out.meshResolution,
		provider: 'modal',
		model: out.model,
		// Presenter clip contract (present only when performed): manifest.clipMap → presenter-director.mjs.
		manifest: out.manifest,
		clipMap: out.clipMap,
		tier: out.tier,
		confidence: out.confidence,
		// No `provider` key inside license — the deck manifest tags provider:'trellis'; host records the runner.
		license: { generator: 'trellis-2', rigger: doRig ? 'unirig' : null, performer: out.performed ? 'baker' : null, host: 'modal', model: out.model, ...TRELLIS_UNIRIG_LICENSE },
	}
}

// In-process cache: gen:// handles carry only a hash, so the bytes (and deterministic license) are
// cached at generate time and read back at embed time. Survives across tool calls in the same MCP
// server process (the generate_rigged3d → add_model3d/generate_from_spec flow). Durable cross-restart
// caching (disk / locked-asset store) is a documented follow-up — GLBs are a few MB at ppt-lite.
const genCache = new Map()
export function cacheGeneratedRigged3d(result) {
	if (result?.promptHash) {
		genCache.set(result.promptHash, {
			glbBase64: result.glbBase64, glbBytes: result.glbBytes, rigged: result.rigged,
			// Compact private construction/rest profile used only while retargeting.
			// The authoring T-pose GLB itself is never cached as an embeddable asset.
			retargetRestProfile: result.retargetRestProfile || null,
			performed: result.performed, gpuSeconds: result.gpuSeconds, bakeSeconds: result.bakeSeconds,
			// Per-stage + cold + gpuType carried so a CACHE HIT can still replay a full (0-cost) meter row.
			genSeconds: result.genSeconds, rigSeconds: result.rigSeconds, coldStart: result.coldStart, gpuType: result.gpuType,
			meshResolution: result.meshResolution, provider: result.provider, model: result.model,
			providerCredits: result.providerCredits || 0,
			// Carry the presenter clip contract so add_model3d / the director can read it at embed time.
			manifest: result.manifest, clipMap: result.clipMap, contacts: result.contacts || (result.manifest && result.manifest.contacts) || null,
			// EMPIRICAL clip-timeline manifest (rendered truth per video ms; Synergy interaction director).
			// Produced today by the calibration probe, at bake time by the Baker going forward.
			clipTimelines: result.clipTimelines || (result.manifest && result.manifest.clipTimelines) || null,
			tier: result.tier, confidence: result.confidence,
			// POSTER: an am3d model renders EMPTY in PowerPoint without a raster anchor. The Baker ships a
			// TRANSPARENT front preview (film_transparent) so the presenter stands on the slide; the embed-time
			// resolver auto-attaches it as posterAsset. Falls back to manifest.posterBase64 if provided there.
			previewBase64: result.previewBase64 || (result.manifest && result.manifest.posterBase64) || null,
			previewBytes: result.previewBytes || (result.manifest && result.manifest.posterBytes) || null,
			license: result.license,
		})
	}
	return result
}
export function getCachedGeneratedRigged3d(hash) { return genCache.get(String(hash || '')) || null }

const performanceSourceFingerprints = new WeakMap()
function presenterPerformanceSourceFingerprint(source) {
	const glbBase64 = source.glbBase64
	const clipMapJson = JSON.stringify(source.clipMap || source.manifest?.clipMap || {})
	const previous = performanceSourceFingerprints.get(source)
	// Strings are immutable; compare the actual current payload and serialized
	// mapping, not only an opaque handle. In-place map edits and byte replacement
	// therefore invalidate this memo, as does a replaced/hydrated cache entry.
	if (previous?.glbBase64 === glbBase64 && previous.clipMapJson === clipMapJson) return previous.fingerprint
	const fingerprint = createHash('sha256').update(glbBase64).update(clipMapJson).digest('hex')
	performanceSourceFingerprints.set(source, { glbBase64, clipMapJson, fingerprint })
	return fingerprint
}

// A performance is an asset-level composition, not a stack of competing native
// scene effects. Cache its authored motion recipe with its source identity so
// dry-run and commit resolve exactly the same continuous scene for any actor.
export function materializePresenterPerformance({ model, performance }) {
	const parsed = parseGenRigged3dHandle(model)
	const source = parsed && getCachedGeneratedRigged3d(parsed.hash)
	if (!source?.glbBase64) throw new Model3DGenError('PERFORMANCE_PRESENTER_UNAVAILABLE', 'The performance presenter needs a resolved rigged model.')
	const fps = 30
	const recipe = validatedPresenterPerformanceRecipe(performance, fps)
	const sourceFingerprint = presenterPerformanceSourceFingerprint(source)
	const basisKey = `presenter-performance-v2:${PERFORMANCE_COMPOSER_FINGERPRINT}:${sourceFingerprint}:${JSON.stringify(recipe)}`
	const hash = createHash('sha256').update('local:' + basisKey).digest('hex').slice(0, 40)
	const cached = getCachedGeneratedRigged3d(hash)
	if (cached?.manifest?.performanceReport) return { handle: `gen://rigged3d/${hash}`, durationMs: cached.manifest.performanceReport.durationMs, report: cached.manifest.performanceReport, previewBase64: cached.previewBase64, cached: true }
	const composed = composePresenterPerformance({ glbBytes: Buffer.from(source.glbBase64, 'base64'), clipMap: source.clipMap || source.manifest?.clipMap, performance, fps })
	const report = { ...composed.report, durationMs: composed.durationMs }
	const registered = registerLocalRigged3d({
		glbBase64: Buffer.from(composed.glbBytes).toString('base64'), glbBytes: composed.glbBytes.length,
		previewBase64: source.previewBase64, license: source.license, basisKey,
		clipMap: { performance: 0 }, contacts: [{ animId: 0, durationMs: composed.durationMs }],
		manifest: { clipMap: { performance: 0 }, contacts: [{ animId: 0, durationMs: composed.durationMs }], performanceReport: report },
	})
	return { ...registered, durationMs: composed.durationMs, report, previewBase64: source.previewBase64, cached: false }
}

// ── G3: durable tenant-scoped persistence over the process-local cache ──────────────────────
// persist: cache entry → store record (metadata + manifests + FULL server-side license/provenance)
// with the heavy bytes (GLB, poster) as digest-verified blobs. hydrate: store → cache, so every
// SYNC consumer (spec compiler, director, materializers) keeps its existing API; the ASYNC entry
// points call hydrate before the sync compile paths run. Both are fail-safe: a store outage
// degrades to the old process-local behavior, loudly (console.warn), never a broken tool call.
export async function persistGeneratedRigged3d(hash, tenantId = 'default') {
	try {
		const entry = genCache.get(String(hash || ''))
		if (!entry || !entry.glbBase64) return { ok: false, reason: 'not-in-cache' }
		const { glbBase64, previewBase64, ...meta } = entry
		return await persistGeneratedAsset({
			tenantId, hash,
			record: { kind: 'rigged3d', hash, meta },
			blobs: {
				glb: { base64: glbBase64, ext: 'glb' },
				...(previewBase64 ? { poster: { base64: previewBase64, ext: 'png' } } : {}),
			},
		})
	} catch (err) {
		console.warn(`[gen-asset-store] persist ${hash} failed: ${err?.message || err}`)
		return { ok: false, reason: err?.message || String(err) }
	}
}

export async function hydrateGeneratedRigged3d(hash, tenantId = 'default') {
	const key = String(hash || '')
	const hit = genCache.get(key)
	if (hit) return hit
	try {
		const loaded = await loadGeneratedAsset({ tenantId, hash: key })
		if (!loaded || loaded.record?.kind !== 'rigged3d') return null
		const entry = {
			...loaded.record.meta,
			glbBase64: loaded.blobs.glb ? loaded.blobs.glb.toString('base64') : null,
			previewBase64: loaded.blobs.poster ? loaded.blobs.poster.toString('base64') : null,
		}
		if (!entry.glbBase64) return null
		genCache.set(key, entry)
		return entry
	} catch (err) {
		console.warn(`[gen-asset-store] hydrate ${hash} failed: ${err?.message || err}`)
		return null
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// IN-PROCESS KINETIC TRANSPLANT (no GPU, no Blender, no Modal)
// ─────────────────────────────────────────────────────────────────────────────
// The base rigged avatar is prebuilt (mesh + skin + skeleton, already matte + slim, and it already carries a
// poster). A per-deck "kinetic" presenter just INTERCHANGES its animation clips: copy a custom N-of-31 kinetic
// set from the shipped kinetic library onto the base by bone name. That is a pure glTF buffer edit (see
// ir/kinetic-transplant.mjs) — milliseconds, in this process, at deck-compile time. Modal is only ever used for
// the ONE-TIME GPU/Blender steps: rigging the base avatar and baking the kinetic library itself.
const KINETIC_LIBRARY_PATH = fileURLToPath(new URL('./kinetic-clips.glb', import.meta.url))
const KINETIC_EXTENSION_LIBRARY_PATH = fileURLToPath(new URL('./kinetic-clips-extension.glb', import.meta.url))
const ORDINARY_MOTION_LIBRARY_PATH = fileURLToPath(new URL('./powerpoint-proven-mixamo-library.glb', import.meta.url))
const INTERACTION_MOTION_LIBRARY_PATH = fileURLToPath(new URL('./authoring-interaction-clips-v3-proven.glb', import.meta.url))
let _kineticLibBytes = null
let _kineticExtensionLibBytes = null
let _ordinaryMotionLibBytes = null
let _interactionMotionLibBytes = null
function kineticLibraryBytes() {
	if (!_kineticLibBytes) _kineticLibBytes = readFileSync(KINETIC_LIBRARY_PATH)
	return _kineticLibBytes
}
function kineticExtensionLibraryBytes() {
	if (!_kineticExtensionLibBytes) _kineticExtensionLibBytes = readFileSync(KINETIC_EXTENSION_LIBRARY_PATH)
	return _kineticExtensionLibBytes
}
function ordinaryMotionLibraryBytes() {
	if (!_ordinaryMotionLibBytes) _ordinaryMotionLibBytes = readFileSync(ORDINARY_MOTION_LIBRARY_PATH)
	return _ordinaryMotionLibBytes
}
function interactionMotionLibraryBytes() {
	if (!_interactionMotionLibBytes) _interactionMotionLibBytes = readFileSync(INTERACTION_MOTION_LIBRARY_PATH)
	return _interactionMotionLibBytes
}
export function kineticLibraryAvailable() {
	try { return statSync(KINETIC_LIBRARY_PATH).size > 0 } catch { return false }
}

// Register an already-built rigged GLB (bytes) as a gen:// asset so the compiler/director can resolve it by
// handle. Used to seed a base avatar into the in-process cache (e.g. a previously generated performer, or a
// demo character) without re-running the worker. previewBase64 is the transparent poster (am3d raster anchor).
export function registerLocalRigged3d({ glbBase64, glbBytes, retargetRestProfile = null, previewBase64 = null, clipMap = null, contacts = null, clipTimelines = null, manifest = null, license = null, basisKey = '' }) {
	const clean = String(glbBase64 || '').trim()
	if (!clean) throw new Model3DGenError('MODEL3D_GEN_IMAGE_REQUIRED', 'registerLocalRigged3d needs glbBase64.')
	const hash = createHash('sha256').update('local:' + (basisKey || createHash('sha256').update(clean).digest('hex').slice(0, 24))).digest('hex').slice(0, 40)
	const fullManifest = manifest || ((clipMap || contacts || clipTimelines) ? { clipMap, contacts, clipTimelines } : null)
	const resolvedClipMap = clipMap || fullManifest?.clipMap || null
	const resolvedContacts = contacts || fullManifest?.contacts || null
	const resolvedTimelines = clipTimelines || fullManifest?.clipTimelines || null
	cacheGeneratedRigged3d({
		promptHash: hash, glbBase64: clean, glbBytes: Number(glbBytes) || Math.floor(clean.length * 0.75),
		retargetRestProfile,
		rigged: true, performed: Boolean(resolvedClipMap), clipMap: resolvedClipMap, contacts: resolvedContacts, clipTimelines: resolvedTimelines,
		manifest: fullManifest,
		previewBase64, provider: 'local', model: 'rigged-glb',
		license: license || { generator: 'local', rigger: 'local', host: 'local' },
	})
	return { handle: `gen://rigged3d/${hash}`, hash }
}

// Build (and cache) a custom-N kinetic presenter from a base avatar's GLB bytes, IN-PROCESS. Returns a gen://
// handle whose cached asset carries: the kinetic GLB, the intent→animId clipMap (derived from the chosen slug
// order), the animId→contactMs contact map (measured from the transplanted clips), and the base's reused poster.
// Idempotent: the same base + slug set dedupes to the same handle and skips the transplant on a cache hit.
export function materializeKineticPresenter({ baseGlbBase64, retargetRestProfile = null, baseHash = '', slugs, intentMap, previewBase64 = null, license = null, staticPoseClipName = null }) {
	if (!Array.isArray(slugs) || !slugs.length) throw new Model3DGenError('MODEL3D_GEN_IMAGE_REQUIRED', 'materializeKineticPresenter needs a non-empty slugs list.')
	const displayBase = Buffer.from(String(baseGlbBase64 || ''), 'base64')
	const basis = baseHash || createHash('sha256').update(String(baseGlbBase64 || '')).digest('hex').slice(0, 24)
	const retargetBasis = createHash('sha256').update(JSON.stringify(retargetRestProfile || null)).digest('hex').slice(0, 16)
	const hash = createHash('sha256').update(JSON.stringify({ base: basis, retargetBase: retargetBasis, slugs, im: intentMap || null, kin: 5, retargetSpace: 'global', powerPointStaticPose: 'normalized-arm-drop-v1', staticPoseClipName: staticPoseClipName || null })).digest('hex').slice(0, 40)
	const handle = `gen://rigged3d/${hash}`
	const hit = genCache.get(hash)
	if (hit && hit.glbBase64) {
		assertPowerPointSafeStaticPose(Buffer.from(hit.glbBase64, 'base64'), { label: 'cached kinetic presenter' })
		return { handle, hash, clipMap: hit.clipMap, contacts: hit.contacts, cached: true }
	}
	const { glb: transplantedGlb, slugToAnimId, report, retargetValidation } = transplantKinetic(displayBase, kineticLibraryBytes(), slugs, { targetRestProfile: retargetRestProfile, rotationRetargetSpace: 'global' })
	const staticPose = staticPoseClipName
		? applyStaticPoseFromSource(transplantedGlb, displayBase, { clipName: staticPoseClipName })
		: null
	const glb = staticPose?.buffer || transplantedGlb
	const powerPointStaticPose = assertPowerPointSafeStaticPose(glb, { label: 'materialized kinetic presenter' })
	const contactsBySlug = computeContacts(glb)
	const clipMap = deriveIntentClipMap(slugs, intentMap)
	// contacts as the array shape the compiler reads (avatarContactMapForSpec): [{animId, contactMs}]
	const contacts = slugs.map((s, i) => ({ animId: i, slug: s, contactMs: (contactsBySlug[s] || {}).contactMs ?? 0, durationMs: (contactsBySlug[s] || {}).durationMs ?? 0 }))
	const glbBase64 = glb.toString('base64')
	cacheGeneratedRigged3d({
		promptHash: hash, glbBase64, glbBytes: glb.length, rigged: true, performed: true,
		clipMap, contacts, manifest: { clipMap, contacts, kinetic: true, slugs, transplant: report, retargetValidation, powerPointStaticPose },
		previewBase64, provider: 'kinetic-transplant', model: 'kinetic',
		license: license || { performer: 'kinetic-transplant', host: 'local' },
	})
	return { handle, hash, clipMap, contacts, slugToAnimId, report, retargetValidation, glbBytes: glb.length, cached: false }
}

// Authoring-v3 semantic presenter materialization.  The AI chooses exact public
// motion IDs; this executor validates them, packs the ordered set into private
// animId slots 0..17, and caches the resulting editable native-3D performer.
// No intent ranking, automatic substitution, or aesthetic choice happens here.
export function materializeAuthoringMotionPresenter({ baseGlbBase64, retargetRestProfile = null, baseHash = '', selectedMotionIds, previewBase64 = null, license = null, staticPoseClipName = null, staticPoseProfileVersion = null }) {
	const resolved = resolveAuthoringMotionSelection(selectedMotionIds)
	if (!resolved.ok) {
		const first = resolved.errors[0] || { code: 'MOTION_SELECTION_INVALID', reason: 'The motion selection is invalid.' }
		throw new Model3DGenError(first.code, first.reason, { errors: resolved.errors, budget: resolved.budget })
	}
	if (!resolved.selected.length) throw new Model3DGenError('MOTION_SELECTION_REQUIRED', 'Choose at least one motion ID for the presenter bundle.')
	const cleanBase = String(baseGlbBase64 || '').trim()
	if (!cleanBase) throw new Model3DGenError('MODEL3D_GEN_IMAGE_REQUIRED', 'A rigged presenter base is required to build the selected motion bundle.')
	const baseBuffer = Buffer.from(cleanBase, 'base64')
	const actualBaseSha256 = createHash('sha256').update(baseBuffer).digest('hex')
	// Integrity/proof/target checks precede even an in-memory cache hit. A
	// caller's opaque base handle cannot stand in for the tested input bytes.
	const governedSelections = resolved.selected.map(row => governedAuthoringMotionSelection(row.motionId, {
		targetGlbBuffer: baseBuffer, retargetRestProfile, expectedSourceFingerprint: resolved.sourceResolutionFingerprint,
	}))
	if (governedSelections.some(selection => selection?.sourceProvider && !isMotionSourceProviderActive(selection.sourceProvider))) {
		throw new Model3DGenError('AUTHORING_MOTION_SOURCE_INVALID', 'The selected presenter motion provider is not active for this runtime.')
	}
	const basis = baseHash || createHash('sha256').update(cleanBase).digest('hex').slice(0, 24)
	const retargetBasis = governedMotionRestProfileSha256(retargetRestProfile)
	const hash = createHash('sha256').update(JSON.stringify({
		base: basis,
		actualBaseSha256,
		retargetBase: retargetBasis,
		selectedMotionIds: resolved.selectedMotionIds,
		catalogFingerprint: resolved.catalogFingerprint,
		sourceResolutionFingerprint: resolved.sourceResolutionFingerprint,
		authoringMotionBundle: 2,
		...(staticPoseClipName ? { staticPoseClipName, staticPoseProfileVersion: String(staticPoseProfileVersion || '') } : {}),
	})).digest('hex').slice(0, 40)
	const handle = `gen://rigged3d/${hash}`
	const hit = genCache.get(hash)
	if (hit?.glbBase64) {
		return {
			handle,
			hash,
			clipMap: hit.clipMap,
			contacts: hit.contacts,
			selectedMotionIds: [...resolved.selectedMotionIds],
			motionIdToAnimId: { ...(hit.manifest?.motionIdToAnimId || {}) },
			glbBytes: hit.glbBytes,
			cached: true,
		}
	}
	const libraries = {
		kinetic: kineticLibraryBytes,
		'kinetic-extension': kineticExtensionLibraryBytes,
		'ordinary-gesture': ordinaryMotionLibraryBytes,
		interaction: interactionMotionLibraryBytes,
	}
	const selections = resolved.selected.map((row, index) => {
		let governed = governedSelections[index]
		if (governed?.boneNamePolicy === 'mixamo-suffix') {
			try { governed = { ...governed, library: matchMixamoMotionBoneNames(governed.library, baseBuffer).buffer } }
			catch { throw new Model3DGenError('AUTHORING_MOTION_SOURCE_INVALID', 'The selected presenter motion cannot be matched safely to this presenter.') }
		}
		const libraryKey = row.privateEvidence.sourceLibrary || row.family
		return {
			motionId: row.motionId,
			outputSlug: row.motionId,
			...(governed || { sourceSlug: row.privateEvidence.sourceSlug, library: libraries[libraryKey](), libraryKey, rotationRetargetSpace: row.family === 'ordinary-gesture' ? 'local' : 'global' }),
		}
	})
	const { glb: bakedGlb, motionIdToAnimId, report, retargetValidation } = transplantMotionSet(baseBuffer, selections, { targetRestProfile: retargetRestProfile })
	const constrainedMotionIds = resolved.selected
		.filter((row, index) => {
			// A native proof binds this exact source, retarget policy and target
			// profile. Legacy provider-wide clamps/smoothing would alter the
			// already-verified motion after that gate and invalidate its evidence.
			if (governedSelections[index]?.playbackProofSha256) return false
			// Active Mixamo sources are already covered by their governed proof or
			// the curated ordinary pool.  No provider-wide clamp or smoothing may
			// run after that source gate; it would invalidate the baked bytes.
			return false
		})
		.map(row => row.motionId)
	const constrainedAnimationNames = constrainedMotionIds.map(motionId => `${String(motionIdToAnimId[motionId]).padStart(2, '0')}_${motionId}`)
	const articulationConstraints = constrainedMotionIds.length
		? Object.fromEntries(Object.entries(DEFAULT_CONSTRAINTS).map(([joint, constraint]) => [
			joint,
			constraint.twistMaxDegrees ? { ...constraint, twistAnimationNames: constrainedAnimationNames } : constraint,
		]))
		: null
	const articulation = constrainedMotionIds.length
		? constrainPresenterArmArticulations(bakedGlb, { animationNames: constrainedAnimationNames, constraints: articulationConstraints })
		: null
	const stabilization = constrainedMotionIds.length
		? smoothRotationAnimations(articulation?.buffer || bakedGlb, { passes: 2, animationNames: constrainedAnimationNames, maxStepDegrees: 18, preserveFirstKey: true })
		: null
	const anatomicallySafeGlb = stabilization?.buffer || articulation?.buffer || bakedGlb
	const staticPose = staticPoseClipName
		? applyStaticPoseFromSource(anatomicallySafeGlb, baseBuffer, { clipName: staticPoseClipName })
		: null
	const glb = staticPose?.buffer || anatomicallySafeGlb
	const powerPointStaticPose = assertPowerPointSafeStaticPose(glb, { label: 'materialized authoring presenter' })
	const measured = computeContacts(glb)
	const clipMap = {}
	const contacts = resolved.selected.map((row, animId) => {
		if (governedSelections[animId]?.durationMs !== undefined && measured[row.motionId]?.durationMs !== governedSelections[animId].durationMs) throw new Model3DGenError('AUTHORING_MOTION_SOURCE_INVALID', 'The selected presenter motion did not retain its verified timing.')
		clipMap[row.motionId] = animId
		// Ordinary semantic names retain compatibility with narration-driven
		// gesture classification; kinetic rows remain exact-ID only.
		if (row.family === 'ordinary-gesture') clipMap[row.slug] = animId
		return {
			animId,
			motionId: row.motionId,
			contactMs: measured[row.motionId]?.contactMs ?? 0,
			durationMs: measured[row.motionId]?.durationMs ?? 0,
		}
	})
	const manifest = {
		contract: 'betterpptx.authoring-motion-bundle.v1',
		catalogVersion: resolved.catalogVersion,
		catalogFingerprint: resolved.catalogFingerprint,
		sourceResolutionFingerprint: resolved.sourceResolutionFingerprint,
		selectedMotionIds: [...resolved.selectedMotionIds],
		maximumMotionsPerPresenterBundle: resolved.budget.maximum,
		clipMap,
		contacts,
		motionIdToAnimId,
		transplant: report,
		retargetValidation,
		...(articulation ? { articulationConstraints: articulation.report } : {}),
		...(stabilization ? { motionStabilization: stabilization.report } : {}),
		powerPointStaticPose,
		...(staticPose ? {
			staticPoseProfile: 'post-bake-source-animation-frame',
			staticPoseProfileVersion: String(staticPoseProfileVersion || ''),
			staticPoseClipName: staticPose.clipName,
			staticPoseClipIndex: staticPose.clipIndex,
			staticPoseSampleTimeMs: staticPose.sampleTimeMs,
			staticPoseChangedNodeChannels: staticPose.changedNodeChannels,
		} : {}),
	}
	cacheGeneratedRigged3d({
		promptHash: hash,
		glbBase64: glb.toString('base64'),
		glbBytes: glb.length,
		rigged: true,
		performed: true,
		clipMap,
		contacts,
		manifest,
		previewBase64,
		provider: 'authoring-motion-bundle',
		model: 'semantic-motion-bundle',
		license: license || { performer: 'approved-project-motion', commercialUse: 'in-project' },
	})
	return { handle, hash, clipMap, contacts, selectedMotionIds: [...resolved.selectedMotionIds], motionIdToAnimId, report, glbBytes: glb.length, cached: false }
}
