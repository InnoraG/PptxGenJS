import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generatePersonalizedMeshyAvatar, MeshyAvatarProviderError } from './assets/meshy-avatar-provider.mjs'
import { cacheGeneratedRigged3d } from './assets/model3d-gen-providers.mjs'
import { buildSpecOperationPlan } from './ir/spec-compiler.mjs'
import { TOOLS } from './tools.mjs'
import { estimateBillingForTool } from './billing/estimator.mjs'
import { BILLING_RATE_CARD } from './billing/rate-card.mjs'
import { safeFetchJson } from './net/safe-fetch.mjs'
import { writeJsonReport } from './lib/atomic-report.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.dirname(here)
const sample = readFileSync(path.join(repo, 'Meshy_AI_Casual_Denim_Look_biped', 'Meshy_AI_Casual_Denim_Look_biped_Character_output.glb'))
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X7o5WQAAAABJRU5ErkJggg==', 'base64')
const calls = []
const avatarImages = ['data:image/png;base64,' + png.toString('base64'), 'data:image/png;base64,' + png.toString('base64')]
async function fetchJson(url, options) {
	calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null })
	if (url.endsWith('/multi-image-to-3d') && options.method === 'POST') return { result: 'multi-1' }
	if (url.endsWith('/multi-image-to-3d/multi-1')) return { status: 'SUCCEEDED', consumed_credits: 30, model_urls: { glb: 'https://assets.meshy.ai/model.glb' }, alpha_thumbnail_url: 'https://assets.meshy.ai/poster.png' }
	if (url.endsWith('/rigging') && options.method === 'POST') return { result: 'rig-1' }
	if (url.endsWith('/rigging/rig-1')) return { status: 'SUCCEEDED', consumed_credits: 5, result: { rigged_character_glb_url: 'https://assets.meshy.ai/rigged.glb' } }
	throw new Error(`unexpected mock URL ${url}`)
}
async function fetchBuffer(url) {
	return { ok: true, status: 200, buffer: url.endsWith('.png') ? png : sample }
}
const result = await generatePersonalizedMeshyAvatar({
	images: avatarImages,
	apiKey: 'test-key',
	fetchJson,
	fetchBuffer,
	wait: async () => {},
})
assert.equal(result.rigged, true)
assert.equal(result.performed, true)
assert.equal(result.provider, 'meshy')
assert.equal(result.manifest.source.imageCount, 2)
assert.equal(result.manifest.providerCredits, 35)
assert.equal(result.manifest.jointCount, 65)
assert.equal(result.manifest.clipNames.length, 18)
assert.equal(result.manifest.animCount, 18)
assert.equal(result.manifest.contacts.length, 18)
assert.ok(result.manifest.contacts.every(contact => contact.durationMs > 0 && contact.contactMs <= contact.durationMs))
assert.equal(result.clipMap.clap, 17)
assert.ok(result.glbBytes > 1_000_000)
assert.ok(result.glbBytes <= 24 * 1024 * 1024, 'Meshy provider output must stay under the 24 MB presenter budget')
assert.equal(result.manifest.powerPointSafe?.textureMax, 2048)
assert.ok(result.previewBase64)
const createPayload = calls.find(call => call.url.endsWith('/multi-image-to-3d') && call.method === 'POST').body
assert.deepEqual(createPayload.target_formats, ['glb'])
assert.equal(createPayload.pose_mode, 'a-pose')
assert.equal(createPayload.target_polycount, 220000)
assert.equal(createPayload.image_urls.length, 2)

// Concurrent identical requests must share one bounded provider operation. This prevents
// duplicate Meshy submissions and duplicate provider credits while the first request is active.
const callsBeforeConcurrent = calls.length
const [concurrentA, concurrentB] = await Promise.all([
	generatePersonalizedMeshyAvatar({ images: avatarImages, apiKey: 'test-key', fetchJson, fetchBuffer, wait: async () => {} }),
	generatePersonalizedMeshyAvatar({ images: avatarImages, apiKey: 'test-key', fetchJson, fetchBuffer, wait: async () => {} }),
])
assert.equal(concurrentA.promptHash, concurrentB.promptHash)
assert.equal(calls.length - callsBeforeConcurrent, 4, 'overlapping identical requests must use one Meshy submit/poll sequence')

const abortController = new AbortController()
abortController.abort()
const callsBeforeAbort = calls.length
let abortError = null
try {
	await generatePersonalizedMeshyAvatar({ images: avatarImages, apiKey: 'test-key', fetchJson, fetchBuffer, signal: abortController.signal })
} catch (error) { abortError = error }
assert.equal(abortError?.code, 'MESHY_ABORTED')
assert.equal(calls.length, callsBeforeAbort, 'pre-aborted Meshy requests must not submit or poll a provider task')
let safeFetchAbortError = null
try { await safeFetchJson('https://example.com/should-not-connect', { signal: abortController.signal }) }
catch (error) { safeFetchAbortError = error }
assert.equal(safeFetchAbortError?.code, 'SAFE_FETCH_ABORTED', 'pre-aborted safe fetch must stop before DNS or network work')

let imageCountError = null
try { await generatePersonalizedMeshyAvatar({ images: [], apiKey: 'test-key', fetchJson, fetchBuffer }) }
catch (error) { imageCountError = error }
assert.ok(imageCountError instanceof MeshyAvatarProviderError)
assert.equal(imageCountError.code, 'MESHY_IMAGE_COUNT_INVALID')

// Runtime integration: the existing public provider-neutral tool must resolve the same ordered inputs
// to the pre-cached personalized asset without another provider call or any public provenance leakage.
process.env.BETTERPPTX_PREMIUM ||= '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX ||= '1'
process.env.BETTERPPTX_ASSETS_ROOT = repo
cacheGeneratedRigged3d(result)
const engine = await import('./engine.mjs')
const callsBeforePublicFamilies = calls.length
const publicResult = await engine.callBetterPptxTool('betterpptx.assets.generate_rigged3d', { imageBase64s: avatarImages })
const publicData = publicResult?.data || publicResult
assert.equal(publicResult?.ok, true, JSON.stringify(publicResult))
assert.equal(publicData.cached, true)
assert.equal(publicData.handle, result.handle)
assert.equal(publicData.performed, true)
// The presenter clip map is an engine-private realization detail. Public
// clients receive only the opaque handle and semantic operation status; the
// black-box sanitizer deliberately removes baked animId/clipMap data.
assert.equal(publicData.clipMap, undefined)
assert.equal(publicData.imageCount, 2)
assert.equal(publicData.provider, undefined)
assert.equal(publicData.model, undefined)
assert.equal(publicData.providerCredits, undefined)
assert.equal(publicData._billing, undefined, 'internal billing metadata must not cross the public black-box boundary')

// The public URL family also accepts data URIs. Reuse the same normalized inputs
// so this is a true no-network durable/cache-hit proof, not a second provider job.
const publicUrlResult = await engine.callBetterPptxTool('betterpptx.assets.generate_rigged3d', { imageUrls: avatarImages })
const publicUrlData = publicUrlResult?.data || publicUrlResult
assert.equal(publicUrlResult?.ok, true, JSON.stringify(publicUrlResult))
assert.equal(publicUrlData.cached, true)
assert.equal(publicUrlData.handle, result.handle)
assert.equal(publicUrlData.performed, true)
assert.equal(publicUrlData.imageCount, 2)
assert.equal(publicUrlData.provider, undefined)
assert.equal(publicUrlData.providerCredits, undefined)
assert.equal(publicUrlData._billing, undefined, 'URL-family billing metadata must not cross the public black-box boundary')
const publicFamiliesNoProviderCalls = calls.length === callsBeforePublicFamilies

const idempotentArgs = { imageBase64s: avatarImages, idempotencyKey: 'meshy-personalized-replay-1' }
const idempotentFirst = await engine.callBetterPptxTool('betterpptx.assets.generate_rigged3d', idempotentArgs)
const idempotentReplay = await engine.callBetterPptxTool('betterpptx.assets.generate_rigged3d', idempotentArgs)
const idempotentFirstData = idempotentFirst?.data || idempotentFirst
const idempotentReplayData = idempotentReplay?.data || idempotentReplay
assert.equal(idempotentFirst?.ok, true, JSON.stringify(idempotentFirst))
assert.equal(idempotentReplay?.ok, true, JSON.stringify(idempotentReplay))
assert.equal(idempotentFirstData.handle, result.handle)
assert.equal(idempotentReplayData.handle, idempotentFirstData.handle)
assert.equal(idempotentReplayData.idempotentReplay, true, 'same-session retry must replay the prior personalized result')

const coldBilling = estimateBillingForTool({
	name: 'betterpptx.assets.generate_rigged3d',
	result: { meshResolution: 'premium', _billing: { providerCredits: result.providerCredits, gpuSeconds: 0, bakeSeconds: 0, cached: false } },
	rateCard: BILLING_RATE_CARD,
})
const cachedBilling = estimateBillingForTool({
	name: 'betterpptx.assets.generate_rigged3d',
	result: { cached: true, _billing: { providerCredits: 0, gpuSeconds: 0, bakeSeconds: 0, cached: true } },
	rateCard: BILLING_RATE_CARD,
})
assert.equal(coldBilling.estimatedCredits, 40, 'cold Meshy billing must include base 3D cost plus 35 provider credits')
assert.equal(cachedBilling.estimatedCredits, 0, 'personalized 3D cache hits must remain no-charge')

// Compiler/world integration: manifest discovery must pick canonical clips without an author clipMap.
const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Personalized presenter integration',
	audience: 'verification',
	objective: 'verify personalized presenter compiler wiring',
	styleIntent: { density: 'medium', tone: 'direct', visualSystem: 'native editable PowerPoint' },
	theme: { name: 'Verify', palette: ['0B1220', '2563EB', '14B8A6', 'F59E0B', 'F8FAFC'], fontFace: 'Aptos' },
	presenter: { model: result.handle },
	sections: [{ id: 'main', title: 'Main', slideIds: ['s1', 's2'] }],
	slides: [
		{ id: 's1', title: 'Welcome', role: 'opener', message: 'Welcome', layoutIntent: 'title-body', narration: 'Welcome everyone.', content: [{ kind: 'title', name: 'title', text: 'Welcome' }] },
		{ id: 's2', title: 'Point', role: 'build', message: 'Look here', layoutIntent: 'title-body', narration: 'Look at this result.', content: [{ kind: 'title', name: 'title', text: 'Look here' }] },
	],
}
const plan = buildSpecOperationPlan(spec, { plan: 'premium' })
assert.equal(plan.errors.length, 0)
assert.equal(plan.appliedDefaults.presenter.active, true)
// Public planning readback is semantic by design. Baked animId values are
// private realization details; verify that the compiler still exposes the
// authored gesture intent and validity without leaking those internals.
assert.equal(plan.appliedDefaults.presenter.gestures.length, 2)
assert.equal(typeof plan.appliedDefaults.presenter.gestures[0].intent, 'string')
assert.equal(typeof plan.appliedDefaults.presenter.gestures[1].intent, 'string')
const presenterOps = plan.operations.filter(operation => JSON.stringify(operation).includes(result.handle))
assert.equal(presenterOps.length, 2)
assert.ok(presenterOps.every(operation => JSON.stringify(operation).includes('playScene')))
const tool = TOOLS.find(entry => entry.name === 'betterpptx.assets.generate_rigged3d')
assert.equal(tool.inputSchema.properties.imageBase64s.maxItems, 4)
assert.equal(tool.inputSchema.properties.imageUrls.type, 'array')
assert.equal(tool.inputSchema.properties.imageUrls.maxItems, 4)
assert.match(tool.inputSchema.properties.imageUrls.items.pattern, /^\^https:\/\//i)
assert.equal(tool.inputSchema.properties.targetPolycount.maximum, 300000)
assert.ok(tool.inputSchema.properties.idempotencyKey, 'personalized 3D tool must expose an idempotency key')

const frontDoorEvidencePath = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar', 'visual-artifacts', 'release-gates', 'meshy-provider-front-door-corpus-20260719.json')
const frontDoorEvidence = {
	schemaVersion: 'betterpptx.native-3d-meshy-front-door-corpus.v1',
	status: 'PASS',
	scope: 'native-3d-presenter-only',
	developmentMode: 'premium',
	networkAttempted: false,
	providerCalls: calls.length,
	publicProviderCalls: publicFamiliesNoProviderCalls ? 0 : null,
	providerCredits: result.providerCredits,
	output: { glbBytes: result.glbBytes, sha256: result.manifest.outputSha256 },
	checks: {
		imageBase64sFamily: publicResult?.ok === true && publicData.cached === true,
		imageUrlsDataUriFamily: publicUrlResult?.ok === true && publicUrlData.cached === true,
		sameOpaqueHandle: publicData.handle === result.handle && publicUrlData.handle === result.handle,
		publicBoundaryRedaction: publicData.provider === undefined && publicData.providerCredits === undefined && publicData._billing === undefined && publicUrlData.provider === undefined && publicUrlData.providerCredits === undefined && publicUrlData._billing === undefined,
		noAdditionalProviderCalls: publicFamiliesNoProviderCalls,
		compilerPresenterOperations: presenterOps.length === 2,
		// The public black-box schema intentionally uses a generic description and
		// carries the format contract structurally.  Keep this evidence aligned to
		// the redacted public contract rather than depending on private prose.
		toolSchemaMatchesRuntime: tool.inputSchema.properties.imageUrls.type === 'array' &&
			tool.inputSchema.properties.imageUrls.maxItems === 4 &&
			/\^https:\/\//i.test(String(tool.inputSchema.properties.imageUrls.items?.pattern || '')),
	},
	retryPolicy: 'No automatic retry; this corpus uses one mocked cold provider operation and cache-only public-family replays.',
}
writeJsonReport(frontDoorEvidencePath, frontDoorEvidence)
console.log(JSON.stringify({ ok: true, calls: calls.length, glbBytes: result.glbBytes, sha256: result.manifest.outputSha256, providerCredits: result.providerCredits, publicCacheHit: true, presenterOps: presenterOps.length, frontDoorEvidencePath }, null, 2))
