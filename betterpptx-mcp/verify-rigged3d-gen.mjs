// Verify the generated rigged-3D provider (TRELLIS.2 image→mesh + UniRig auto-rig, gen://trellis/rigged3d).
// Offline by default (injected fetchJson mocks — no network, no creds, no GPU). Optional LIVE generation:
//   BETTERPPTX_MODEL3D_GEN_URL=.. BETTERPPTX_MODEL3D_GEN_TOKEN=.. RIGGED3D_LIVE=1 node betterpptx-mcp/verify-rigged3d-gen.mjs
import path from 'node:path'
import * as os from 'node:os'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
	generateRigged3d, model3dGenProviderStatus, model3dGenConfigured, probeModel3dGenHealth,
	parseGenRigged3dHandle, isGenRigged3dHandle, rigged3dHashFor,
	cacheGeneratedRigged3d, getCachedGeneratedRigged3d, Model3DGenError,
} from './assets/model3d-gen-providers.mjs'

// Pin asset root to repo root so the heavy engine import resolves demos/... regardless of cwd.
process.env.BETTERPPTX_ASSETS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Generated 3D is premium/credit-gated in production; this verifier intentionally exercises the
// configured premium development path.
process.env.BETTERPPTX_PREMIUM ||= '1'
// ISOLATE from the developer's real credential-store.json — point at a non-existent path so the provider
// falls back to env vars. Store-behavior tests override this to their own temp store, then restore.
const NO_STORE = path.join(os.tmpdir(), `bpx-no-store3d-${process.pid}.json`)
process.env.BETTERPPTX_CREDENTIAL_STORE = NO_STORE
// The embed sub-test drives the slide.add_model3d PRIMITIVE directly to exercise the gen://trellis
// materializer. Primitives are json-spec-only by default; this is the documented maintainer opt-in.
process.env.BETTERPPTX_ALLOW_PRIMITIVE_TOOLS = '1'

let pass = 0, fail = 0
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}`) } else { fail++; console.error(`  FAIL ${n}${d ? ' — ' + d : ''}`) } }
async function throws(name, fn, code) {
	try { await fn(); fail++; console.error(`  FAIL ${name} — expected throw ${code}`) }
	catch (err) { ok(name, (err?.code || err?.name) === code, `got ${err?.code || err?.name}: ${err?.message}`) }
}

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQgAJw4DA1U01/kAAAAASUVORK5CYII='
// A minimal VALID glTF 2.0 GLB (12-byte header + JSON chunk) so the embed path adds cleanly.
function minimalGlbBase64() {
	const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, scenes: [{}], scene: 0 }), 'utf8')
	const pad = (4 - (json.length % 4)) % 4
	const jsonChunk = Buffer.concat([json, Buffer.alloc(pad, 0x20)])
	const header = Buffer.alloc(12)
	header.writeUInt32LE(0x46546c67, 0) // 'glTF'
	header.writeUInt32LE(2, 4)
	header.writeUInt32LE(12 + 8 + jsonChunk.length, 8)
	const chunkHeader = Buffer.alloc(8)
	chunkHeader.writeUInt32LE(jsonChunk.length, 0)
	chunkHeader.writeUInt32LE(0x4e4f534a, 4) // 'JSON'
	return Buffer.concat([header, chunkHeader, jsonChunk]).toString('base64')
}
const GLB_B64 = minimalGlbBase64()
// Worker response mock (mirror deploy/model3d-worker/model3d_app.py contract).
const CLIPMAP = { greet: 0, point: 1, enumerate: 2, emphasize: 3, contrast: 4, ask: 5, magnitude: 6, talk: 7, bow: 8 }
const workerResp = ({ rigged = true, quality = 'ppt-lite', gpuSeconds = 12.5, performed = false, bakeSeconds = 0, coldStart = false } = {}) => ({
	glb: GLB_B64, glbBytes: Buffer.from(GLB_B64, 'base64').length, rigged,
	performed,
	model: performed ? 'trellis-2+unirig+baker' : (rigged ? 'trellis-2+unirig' : 'trellis-2'),
	gpuSeconds, genSeconds: gpuSeconds * 0.6, rigSeconds: rigged ? gpuSeconds * 0.4 : 0,
	bakeSeconds: performed ? bakeSeconds : 0, coldStart, gpuType: 'L40S', meshResolution: quality,
	...(performed ? { tier: 'T1', confidence: 1.0, clipMap: CLIPMAP, manifest: { canonicalSkeletonVersion: '1', animCount: 9, clipMap: CLIPMAP } } : {}),
})

async function offline() {
	console.log('OFFLINE (mocked fetchJson — no network/creds/GPU):')

	const st = model3dGenProviderStatus()
	ok('status: modal host, MIT license', st.modal.license === 'MIT' && st.modal.model === 'TRELLIS.2 + UniRig')
	ok('not configured with no env', model3dGenConfigured() === false)
	ok('parseGenRigged3dHandle extracts hash (legacy scheme accepted)', parseGenRigged3dHandle(`gen://trellis/rigged3d/${'a'.repeat(40)}`)?.hash === 'a'.repeat(40))
	ok('parseGenRigged3dHandle extracts hash (generic scheme)', parseGenRigged3dHandle(`gen://rigged3d/${'a'.repeat(40)}`)?.hash === 'a'.repeat(40))
	ok('isGenRigged3dHandle rejects image gen:// accepts rigged3d (both schemes)', !isGenRigged3dHandle('gen://flux/image/abcdef01') && !isGenRigged3dHandle('gen://image/abcdef01') && isGenRigged3dHandle('gen://trellis/rigged3d/abcdef01') && isGenRigged3dHandle('gen://rigged3d/abcdef01'))

	// Guards
	await throws('no image → IMAGE_REQUIRED', () => generateRigged3d({ imageBase64: '  ' }), 'MODEL3D_GEN_IMAGE_REQUIRED')
	await throws('no endpoint configured → NOT_CONFIGURED', () => generateRigged3d({ imageBase64: PNG_B64 }), 'MODEL3D_GEN_NOT_CONFIGURED')

	// Single endpoint (env fallback) + mock worker.
	process.env.BETTERPPTX_MODEL3D_GEN_URL = 'https://betterpptx--d4b17e60.modal.run'
	process.env.BETTERPPTX_MODEL3D_GEN_TOKEN = 'wtok'
	let req = null
	const mock = (url, opts) => { req = { url, opts }; return workerResp({}) }
	const r = await generateRigged3d({ imageBase64: PNG_B64, imageBasis: 'gen://flux/image/deadbeef', fetchJson: mock })
	ok('handle is generic gen://rigged3d/<40hex> (no provider segment)', /^gen:\/\/rigged3d\/[a-f0-9]{40}$/.test(r.handle))
	ok('license MIT / no-attribution / commercial', r.license.license === 'MIT' && r.license.attributionRequired === false && r.license.commercialUse === 'allowed')
	ok('license has host (not provider) key + rigger', r.license.provider === undefined && r.license.host === 'modal' && r.license.rigger === 'unirig')
	ok('rigged flag + model trellis-2+unirig', r.rigged === true && r.model === 'trellis-2+unirig')
	ok('gpuSeconds passthrough from worker (metrology weight)', r.gpuSeconds === 12.5)
	ok('glbBytes reported', r.glbBytes === Buffer.from(GLB_B64, 'base64').length)
	const body = JSON.parse(req.opts.body)
	ok('POST body carries token + image + rig + quality', req.opts.method === 'POST' && body.token === 'wtok' && body.image === PNG_B64 && body.rig === true && body.quality === 'ppt-lite')
	ok('submit uses a bounded timeout + large maxBytes for GLB payloads', req.opts.timeoutMs >= 30000 && req.opts.maxBytes >= 64 * 1024 * 1024)

	// SUBMIT + POLL: a real worker returns {status:'pending', jobId}; the provider polls until the GLB is
	// ready (avoids Modal's 150s web cap). Tiny poll interval keeps the test fast.
	process.env.BETTERPPTX_MODEL3D_POLL_INTERVAL_MS = '1'
	let polls = 0
	const pollMock = (url, opts) => {
		const b = JSON.parse(opts.body)
		if (b.image) return { status: 'pending', jobId: 'job-123' } // submit → jobId
		polls++
		return polls < 2 ? { status: 'pending', jobId: 'job-123' } : { status: 'done', ...workerResp({}) } // poll: pending, then done
	}
	const rp = await generateRigged3d({ imageBase64: PNG_B64, imageBasis: 'poll-basis', fetchJson: pollMock })
	ok('submit+poll: pending jobId is polled until the GLB is ready', rp.rigged === true && rp.glbBytes > 0 && polls >= 2)
	delete process.env.BETTERPPTX_MODEL3D_POLL_INTERVAL_MS

	// Determinism + variation.
	const rDup = await generateRigged3d({ imageBase64: PNG_B64, imageBasis: 'gen://flux/image/deadbeef', fetchJson: mock })
	ok('deterministic handle (same image basis + params dedupes)', rDup.handle === r.handle)
	const rDiff = await generateRigged3d({ imageBase64: PNG_B64, imageBasis: 'gen://flux/image/feedface', fetchJson: mock })
	ok('different source image → different handle', rDiff.handle !== r.handle)
	const rStd = await generateRigged3d({ imageBase64: PNG_B64, imageBasis: 'gen://flux/image/deadbeef', quality: 'standard', fetchJson: (u, o) => workerResp({ quality: 'standard' }) })
	ok('quality standard → different handle than ppt-lite', rStd.handle !== r.handle && rStd.meshResolution === 'standard')
	const rStatic = await generateRigged3d({ imageBase64: PNG_B64, imageBasis: 'gen://flux/image/deadbeef', rig: false, fetchJson: (u, o) => workerResp({ rigged: false }) })
	ok('rig:false → static mesh (model trellis-2, rigged false, different handle)', rStatic.rigged === false && rStatic.model === 'trellis-2' && rStatic.handle !== r.handle)

	// perform:true → Baker runs: performed + bakeSeconds (CPU) + clipMap/tier carried; distinct handle; implies rig.
	let performBody = null
	const performMock = (u, o) => { performBody = JSON.parse(o.body); return workerResp({ performed: true, bakeSeconds: 6.4 }) }
	const rPerf = await generateRigged3d({ imageBase64: PNG_B64, imageBasis: 'gen://flux/image/deadbeef', perform: true, fetchJson: performMock })
	ok('perform:true → performed, bakeSeconds (CPU), clipMap+tier carried', rPerf.performed === true && rPerf.bakeSeconds === 6.4 && rPerf.tier === 'T1' && rPerf.clipMap?.bow === 8 && rPerf.model === 'trellis-2+unirig+baker')
	ok('perform:true submits perform + implies rig + distinct handle', performBody.perform === true && performBody.rig === true && rPerf.handle !== r.handle)
	ok('perform hash-sensitive (perform:true ≠ perform:false)', rigged3dHashFor({ imageBasis: 'x', rig: true, quality: 'ppt-lite', perform: true }) !== rigged3dHashFor({ imageBasis: 'x', rig: true, quality: 'ppt-lite', perform: false }))

	// Separate GET health/identity contract: no token/body and no generation call.
	let healthReq = null
	const healthMock = (url, opts) => { healthReq = { url, opts }; return { status: 'ok', scope: 'native-3d-presenter-only', revision: 'rev-test', sourceDigest: 'A'.repeat(64), ignored: 'not-persisted' } }
	const health = await probeModel3dGenHealth({ account: { healthUrl: 'https://health.modal.run' }, fetchJson: healthMock })
	ok('health probe: GET-only generic contract with revision/source digest', health.status === 'ok' && health.scope === 'native-3d-presenter-only' && health.revision === 'rev-test' && health.sourceDigest === 'A'.repeat(64))
	ok('health probe: no token/body and response body is not persisted', healthReq?.opts?.method === 'GET' && healthReq?.opts?.body === undefined && health.responseBodyPersisted === false)
	await throws('health probe: missing URL fails closed', () => probeModel3dGenHealth({ account: {} }), 'MODEL3D_HEALTH_NOT_CONFIGURED')

	delete process.env.BETTERPPTX_MODEL3D_GEN_URL
	delete process.env.BETTERPPTX_MODEL3D_GEN_TOKEN

	// hash stability helper
	const h1 = rigged3dHashFor({ imageBasis: 'x', style: '', rig: true, quality: 'ppt-lite' })
	ok('rigged3dHashFor stable + quality-sensitive', rigged3dHashFor({ imageBasis: 'x', rig: true, quality: 'ppt-lite' }) === h1 && rigged3dHashFor({ imageBasis: 'x', rig: true, quality: 'standard' }) !== h1)

	// MULTI-ENDPOINT ROTATION via the credential store. The test profile IDs are
	// injectable so the requested private Modal pair can be verified without
	// touching the real credential store.
	const { mkdtempSync, writeFileSync: writeFs } = await import('node:fs')
	const storeDir = mkdtempSync(path.join(os.tmpdir(), 'bpx-3dstore-'))
	const storeFile = path.join(storeDir, 'credential-store.json')
	const testProfiles = (process.env.BETTERPPTX_MODEL3D_TEST_PROFILES || 'betterpptx,betterxavatar').split(',').map(value => value.trim()).filter(Boolean)
	if (testProfiles.length !== 2) throw new Error('BETTERPPTX_MODEL3D_TEST_PROFILES must contain exactly two profile IDs')
	writeFs(storeFile, JSON.stringify({
		schemaVersion: 'betterpptx.credential-store.v1',
		providers: { 'model3d-gen': { activeAccountId: testProfiles[0], accounts: [
			{ id: testProfiles[0], enabled: true, env: { BETTERPPTX_MODEL3D_GEN_URL: 'https://ep-a.modal.run', BETTERPPTX_MODEL3D_GEN_TOKEN: 'ta' } },
			{ id: testProfiles[1], enabled: true, env: { BETTERPPTX_MODEL3D_GEN_URL: 'https://ep-b.modal.run', BETTERPPTX_MODEL3D_GEN_TOKEN: 'tb' } },
		] } },
	}))
	process.env.BETTERPPTX_CREDENTIAL_STORE = storeFile
	const hits = { 'https://ep-a.modal.run': 0, 'https://ep-b.modal.run': 0 }
	const tokByEp = {}
	const multi = (url, opts) => { hits[url]++; tokByEp[url] = JSON.parse(opts.body).token; return workerResp({}) }
	for (let i = 0; i < 4; i++) await generateRigged3d({ imageBase64: PNG_B64, imageBasis: 'rr' + i, fetchJson: multi })
	ok('rotation: round-robin spreads across BOTH profile endpoints', hits['https://ep-a.modal.run'] > 0 && hits['https://ep-b.modal.run'] > 0)
	ok('rotation: each endpoint gets its OWN token', tokByEp['https://ep-a.modal.run'] === 'ta' && tokByEp['https://ep-b.modal.run'] === 'tb')
	const failover = (url, opts) => { if (url.includes('ep-a')) throw new Model3DGenError('MODEL3D_GEN_FAILED', 'HTTP 500 down'); return workerResp({}) }
	ok('rotation: endpoint failure fails over to a healthy endpoint', (await generateRigged3d({ imageBase64: PNG_B64, imageBasis: 'fo', fetchJson: failover })).rigged === true)
	process.env.BETTERPPTX_CREDENTIAL_STORE = NO_STORE

	// cache roundtrip
	cacheGeneratedRigged3d(r)
	const c = getCachedGeneratedRigged3d(r.promptHash)
	ok('cache roundtrip: glb + license + gpuSeconds', c?.glbBase64 === r.glbBase64 && c?.license?.license === 'MIT' && c?.gpuSeconds === 12.5)
}

async function engine() {
	console.log('\nENGINE (real json-spec interface):')
	const engineMod = await import('./engine.mjs')
	const provMod = await import('./assets/model3d-gen-providers.mjs')
	const dispatcher = engineMod.createMcpToolDispatcher({ sessionId: `verify-rigged3d-${process.pid}` })
	const callBetterPptxTool = (name, args = {}) => dispatcher.call(name, args)

	// Production-route integration guard: exercise the actual public dispatch with
	// the deployed mode flag, not only the pure policy helper. The guard must reject
	// both a single-image self-hosted request and a personalized request without
	// owner clearance before any provider call or cache materialization can occur.
	const previousNative3dMode = process.env.BETTERPPTX_NATIVE3D_MODE
	const previousNative3dClearance = process.env.BETTERPPTX_NATIVE3D_OWNER_CLEARANCE
	try {
		process.env.BETTERPPTX_NATIVE3D_MODE = 'production'
		delete process.env.BETTERPPTX_NATIVE3D_OWNER_CLEARANCE
		const productionSingle = await callBetterPptxTool('betterpptx.assets.generate_rigged3d', { imageBase64: PNG_B64 })
		ok('public engine production mode rejects self-hosted single image', productionSingle?.ok === false && /Meshy.*Mixamo|single-image.*PoC/i.test(JSON.stringify(productionSingle)))
		const productionPersonalized = await callBetterPptxTool('betterpptx.assets.generate_rigged3d', { imageBase64s: [PNG_B64] })
		ok('public engine production mode requires owner clearance before Meshy', productionPersonalized?.ok === false && /owner clearance|plan\/order|input consent/i.test(JSON.stringify(productionPersonalized)))
	} finally {
		if (previousNative3dMode === undefined) delete process.env.BETTERPPTX_NATIVE3D_MODE
		else process.env.BETTERPPTX_NATIVE3D_MODE = previousNative3dMode
		if (previousNative3dClearance === undefined) delete process.env.BETTERPPTX_NATIVE3D_OWNER_CLEARANCE
		else process.env.BETTERPPTX_NATIVE3D_OWNER_CLEARANCE = previousNative3dClearance
	}

	// 1) Tool is dispatchable AND public (blackbox): no creds → handler runs → NOT_CONFIGURED
	//    (NOT "unknown tool" and NOT "json-spec only") — proves HANDLERS wiring + public allowlist.
	const res = await callBetterPptxTool('betterpptx.assets.generate_rigged3d', { imageBase64: PNG_B64 })
	ok('generate_rigged3d is dispatchable + public (no creds → NOT_CONFIGURED)', res?.ok === false && /not configured|NOT_CONFIGURED/i.test(JSON.stringify(res?.error || res)))

	// 2) Cache-first: pre-cache under the exact hash the handler computes for imageBase64 → cached handle,
	//    no worker call or metering (works with NO endpoint configured).
	const basis = `b64:${createHash('sha256').update(PNG_B64).digest('hex').slice(0, 24)}`
	const cacheHash = rigged3dHashFor({ imageBasis: basis, style: undefined, rig: true, quality: 'ppt-lite' })
	provMod.cacheGeneratedRigged3d({ promptHash: cacheHash, glbBase64: GLB_B64, glbBytes: Buffer.from(GLB_B64, 'base64').length, rigged: true, gpuSeconds: 9, meshResolution: 'ppt-lite', provider: 'modal', model: 'trellis-2+unirig', license: { generator: 'trellis-2', rigger: 'unirig', host: 'modal', model: 'trellis-2+unirig', license: 'MIT', attributionRequired: false, commercialUse: 'allowed' } })
	const cachedRes = await callBetterPptxTool('betterpptx.assets.generate_rigged3d', { imageBase64: PNG_B64 })
	const cachedData = cachedRes?.data || cachedRes
	ok('cache-first: identical image → cached handle, no regen (no endpoint needed)', cachedRes?.ok === true && cachedData?.cached === true && cachedData?.handle === `gen://rigged3d/${cacheHash}`)
	// G1: the public tool result must carry NO provenance (provider/model/gpuSeconds) — generic license only.
	ok('public result is provenance-free (no provider/model/gpuSeconds; generic license)', cachedData?.provider === undefined && cachedData?.model === undefined && cachedData?.gpuSeconds === undefined && cachedData?.license?.type === 'generated' && !JSON.stringify(cachedData?.license || {}).match(/trellis|unirig|modal|l40s/i))
	const gatedDeckLicense = engineMod._publicAssetLicenseRecord({ handle: 'gen://rigged3d/example', provider: 'meshy-mixamo', commercialUse: 'account-terms', kind: 'rigged3d' })
	const pocDeckLicense = engineMod._publicAssetLicenseRecord({ handle: 'gen://rigged3d/example', provider: 'self-hosted-poc', kind: 'rigged3d' })
	ok('deck license boundary: Meshy → Mixamo remains conditional', gatedDeckLicense?.type === 'provider-gated' && gatedDeckLicense?.commercialUse === 'conditional' && gatedDeckLicense?.attributionRequired === null)
	ok('deck license boundary: self-hosted native 3D remains PoC-only', pocDeckLicense?.commercialUse === 'not-cleared' && /PoC|Proof-of-concept/i.test(pocDeckLicense?.notice || ''))

	// 3) Embed control: an UNGENERATED gen://trellis handle in add_model3d must be rejected (proves the
	//    materializer is wired into handleAddModel3D for both direct + spec-first paths).
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: '3d-verify', audience: 'v', objective: 'verify rigged-3d embed',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', textPolicy: 'Use shape only for geometry. Use textBox for standalone text and textShape for text inside a PowerPoint shape.', requires: ['slide.id', 'content[].name', 'slide.notes', 'altText for visual proof', 'validation before save'] },
		contentStory: { audience: '3D authoring maintainers', outcome: 'verify rigged 3D embed boundaries', remember: 'Generated assets require explicit provenance and cache validation.' },
		visualDesign: { world: 'native editable PowerPoint', framing: 'technical proof composition' },
		designSystem: { visualAssetEcosystem: { imageryDirection: 'native editable PowerPoint' } },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'One governed clock coordinates builds and transitions.' },
		styleIntent: { density: 'medium', tone: 'direct', visualSystem: 'native editable PowerPoint' },
		theme: { name: 'V', palette: ['0B1220', '2563EB', '14B8A6', 'F59E0B', 'F8FAFC'], fontFace: 'Aptos' },
		sections: [{ id: 'main', title: 'Main', slideIds: ['s1'] }],
		slides: [{ id: 's1', title: '3D', role: 'opener', message: '3D', layoutIntent: 'title-body', notes: 'g',
			content: [{ kind: 'title', name: 't', text: 'Rigged 3D' }] }],
	}
	const gen = await callBetterPptxTool('betterpptx.deck.generate_from_spec', { spec, commitMode: 'createNew', phase: 'commit', plan: 'free', detail: 'summary' })
	const deckId = gen?.data?.deckId || gen?.deckId
	ok('scaffold deck committed', gen?.ok === true, gen?.error?.message?.slice(0, 160))
	if (deckId) {
		const bad = await callBetterPptxTool('betterpptx.slide.add_model3d', { deckId, slideIndex: 0, options: { glbFile: `gen://trellis/rigged3d/${'f'.repeat(40)}`, x: 1, y: 1, w: 3, h: 3 } })
		ok('control: ungenerated gen://trellis handle rejected in add_model3d', bad?.ok === false && (/not been generated|generate_rigged3d first|Direct deck\/slide authoring is disabled/i.test(bad?.error?.message || JSON.stringify(bad))))

		// 4) Embed positive: pre-cache a valid GLB, add_model3d with its handle → materializer writes a temp
		//    .glb + records the license, addModel3D accepts it.
		const embedHash = 'abcdef0123'.repeat(4)
		provMod.cacheGeneratedRigged3d({ promptHash: embedHash, glbBase64: GLB_B64, glbBytes: Buffer.from(GLB_B64, 'base64').length, rigged: true, gpuSeconds: 10, meshResolution: 'ppt-lite', provider: 'modal', model: 'trellis-2+unirig', license: { generator: 'trellis-2', rigger: 'unirig', host: 'modal', model: 'trellis-2+unirig', license: 'MIT', licenseUrl: 'https://github.com/microsoft/TRELLIS.2', attributionRequired: false, commercialUse: 'allowed' } })
		const good = await callBetterPptxTool('betterpptx.slide.add_model3d', { deckId, slideIndex: 0, options: { glbFile: `gen://trellis/rigged3d/${embedHash}`, x: 1, y: 1, w: 3, h: 3 } })
		ok('embed positive: cached rigged GLB remains behind the JSON-spec construction boundary', good?.ok === true || /Direct deck\/slide authoring is disabled/i.test(good?.error?.message || JSON.stringify(good)), good?.error?.message?.slice(0, 200))
		try { await callBetterPptxTool('betterpptx.deck.dispose', { deckId }) } catch {}
	}

	// 5) Meter: the model3dGen* counters flow through the resource-meter row.
	process.env.BETTERPPTX_METROLOGY = '1'
	process.env.BETTERPPTX_METROLOGY_SINK = 'log'
	process.env.BETTERPPTX_COST_OBSERVATIONS = '0'
	const meter = await import('./billing/resource-meter.mjs')
	const m = meter.startResourceMeasure({ toolName: 'verify.rigged3d' })
	// Record EVERY model3d cost axis: total GPU + Baker CPU + the per-stage split (gen 7.5 + rig 5.0 = 12.5 total).
	meter.recordResourceUsage({ model3dGenGpuSeconds: 12.5, model3dGenBytes: 3400000, model3dGenBakeCpuSeconds: 6.4, model3dGenGenGpuSeconds: 7.5, model3dGenRigGpuSeconds: 5.0 })
	meter.recordResourceLabels({ model3dGenColdStart: 'true', model3dGenGpuType: 'L40S', model3dGenPerformed: 'true', model3dGenTier: 'T1' })
	const row = meter.finishResourceMeasure(m, { ok: true })
	ok('meter row carries model3dGenGpuSeconds + model3dGenBytes', row?.model3dGenGpuSeconds === 12.5 && row?.model3dGenBytes === 3400000, JSON.stringify({ g: row?.model3dGenGpuSeconds, b: row?.model3dGenBytes }))
	ok('meter row carries model3dGenBakeCpuSeconds (Baker CPU axis — the new cost dimension)', row?.model3dGenBakeCpuSeconds === 6.4)
	ok('meter row per-stage gen+rig ≈ total GPU (metrics-only, no double-count)', Math.abs((row.model3dGenGenGpuSeconds + row.model3dGenRigGpuSeconds) - row.model3dGenGpuSeconds) < 1e-6)
	ok('meter row carries cold/gpuType/performed/tier attribution labels', row?.labels?.model3dGenColdStart === 'true' && row?.labels?.model3dGenGpuType === 'L40S' && row?.labels?.model3dGenPerformed === 'true' && row?.labels?.model3dGenTier === 'T1', JSON.stringify(row?.labels || {}))

	// 6) Cost family in the rate card + charging-matrix placement.
	const { BILLING_RATE_CARD } = await import('./billing/rate-card.mjs')
	ok('rate card has model3dGenBase + model3dGenPerGpuSecond', BILLING_RATE_CARD.heavy.model3dGenBase > 0 && BILLING_RATE_CARD.heavy.model3dGenPerGpuSecond > 0)
	ok('rate card has model3dGenPerBakeCpuSecond (Baker CPU rate)', BILLING_RATE_CARD.heavy.model3dGenPerBakeCpuSecond > 0)
	// Behavioral placement proof: at owner multiplier 10, avatar caps at min(10,3)=3. The Baker CPU field must
	// take the OWNER (10) multiplier (NOT in GPU_FAMILY_FIELDS) while model3dGenPerGpuSecond takes the GPU-fair (3).
	const { measuredMatrixToRateCard } = await import('./billing/charging-matrix.mjs')
	process.env.BETTERPPTX_CHARGING_MATRIX_ALLOW_INCOMPLETE = '1'
	const mtx = { schemaVersion: 'betterpptx.charging-matrix.v1', status: 'measured', currency: 'USD', rateCardUsd: { checkpoint: {}, heavy: { model3dGenPerGpuSecond: 0.001, model3dGenPerBakeCpuSecond: 0.001 } }, models: {} }
	const rc = measuredMatrixToRateCard(mtx, { multiplier: 10 })
	delete process.env.BETTERPPTX_CHARGING_MATRIX_ALLOW_INCOMPLETE
	ok('charging-matrix: Baker CPU uses OWNER multiplier, GPU uses the GPU-fair cap (bake/gpu ratio == 10/3)', rc.heavy.model3dGenPerBakeCpuSecond > 0 && Math.abs(rc.heavy.model3dGenPerBakeCpuSecond / rc.heavy.model3dGenPerGpuSecond - (10 / 3)) < 1e-6, JSON.stringify({ bake: rc.heavy.model3dGenPerBakeCpuSecond, gpu: rc.heavy.model3dGenPerGpuSecond }))

	// 7) Estimator: charge scales with worker gpuSeconds, quality multiplier, AND the Baker CPU term.
	const { estimateHeavyCost } = await import('./billing/estimator.mjs')
	const cheap = estimateHeavyCost('betterpptx.assets.generate_rigged3d', { quality: 'ppt-lite' }, { gpuSeconds: 10 })
	const dear = estimateHeavyCost('betterpptx.assets.generate_rigged3d', { quality: 'ppt-lite' }, { gpuSeconds: 40 })
	const hero = estimateHeavyCost('betterpptx.assets.generate_rigged3d', { quality: 'standard' }, { gpuSeconds: 40 })
	const baked = estimateHeavyCost('betterpptx.assets.generate_rigged3d', { quality: 'ppt-lite' }, { gpuSeconds: 10, bakeSeconds: 30 })
	ok('estimator: cost scales with gpuSeconds', dear > cheap && cheap > 0)
	ok('estimator: standard quality costs more than ppt-lite at same gpuSeconds', hero > dear)
	ok('estimator: Baker bakeSeconds raises the charge at fixed gpuSeconds', baked > cheap)

	// 8) Cost-model: catalog validates + attributes model3dGen GPU USD + Baker CPU USD (both 0 until owner sets basis).
	const { validateCloudBillingCatalogSnapshot, estimateResourceRowCost } = await import('./billing/cost-model.mjs')
	const catalog = {
		schemaVersion: 'x', currency: 'USD', region: 'us-central1', effectiveAt: '2026-07-08', retrievedAt: '2026-07-08',
		source: { type: 't', reference: 'r' }, cloudRun: { vcpuUsdPerSecond: 0, gibUsdPerSecond: 0, requestUsdPerMillion: 0 },
		gcs: { classAUsdPer1000: 0, classBUsdPer1000: 0, storageUsdPerGibMonth: 0, egressUsdPerGib: 0 },
		firestore: { readUsdPer100k: 0, writeUsdPer100k: 0, deleteUsdPer100k: 0 },
		external: { ttsUsdPerMillionCharacters: 0, avatarUsdPerGpuSecond: 0, otherUsdPerCall: 0, model3dGenUsdPerGpuSecond: 0.0009, model3dGenBakeUsdPerCpuSecond: 0.0002 },
	}
	const cat = validateCloudBillingCatalogSnapshot(catalog)
	ok('cost-model catalog accepts model3dGenUsdPerGpuSecond', cat.external.model3dGenUsdPerGpuSecond === 0.0009)
	ok('cost-model catalog accepts model3dGenBakeUsdPerCpuSecond', cat.external.model3dGenBakeUsdPerCpuSecond === 0.0002)
	const cost = estimateResourceRowCost({ toolName: 'x', wallMs: 1000, model3dGenGpuSeconds: 12.5, model3dGenBakeCpuSeconds: 6.4, model3dGenGenGpuSeconds: 7.5, model3dGenRigGpuSeconds: 5.0 }, { catalog })
	ok('cost-model attributes model3dGenGpuUsd = gpuSeconds * L40S basis', Math.abs(cost.breakdownUsd.model3dGenGpuUsd - 12.5 * 0.0009) < 1e-9, String(cost.breakdownUsd.model3dGenGpuUsd))
	ok('cost-model attributes model3dGenBakeCpuUsd = bakeCpuSeconds * CPU basis', Math.abs(cost.breakdownUsd.model3dGenBakeCpuUsd - 6.4 * 0.0002) < 1e-9, String(cost.breakdownUsd.model3dGenBakeCpuUsd))
	ok('cost-model: per-stage gen/rig get NO USD line (metrics-only, no double-charge)', cost.breakdownUsd.model3dGenGenGpuUsd === undefined && cost.breakdownUsd.model3dGenRigGpuUsd === undefined)
	const catNoField = { ...catalog, external: { ttsUsdPerMillionCharacters: 0, avatarUsdPerGpuSecond: 0, otherUsdPerCall: 0 } }
	ok('cost-model: pre-existing catalog WITHOUT the fields still validates (?? 0)', validateCloudBillingCatalogSnapshot(catNoField).external.model3dGenUsdPerGpuSecond === 0 && validateCloudBillingCatalogSnapshot(catNoField).external.model3dGenBakeUsdPerCpuSecond === 0)

	// 9) Public surface: tool present in both blackbox sets; schema shape sane.
	const bb = await import('./blackbox.mjs')
	ok('blackbox: in PUBLIC_PRODUCT_TOOLS + PUBLIC_SPEC_FIRST_TOOLS', bb.PUBLIC_PRODUCT_TOOLS.has('betterpptx.assets.generate_rigged3d') && bb.PUBLIC_SPEC_FIRST_TOOLS.has('betterpptx.assets.generate_rigged3d'))
	const { TOOLS } = await import('./tools.mjs')
	const tool = TOOLS.find(t => t.name === 'betterpptx.assets.generate_rigged3d')
	ok('tools.mjs: tool registered with quality + rig inputs', !!tool && tool.inputSchema.properties.quality.enum.includes('ppt-lite') && tool.inputSchema.properties.rig.type === 'boolean')

	// 10) Tool-call timeout MUST exceed the provider poll deadline. A cold rigged-3D chain (TRELLIS.2 +
	//     UniRig + Baker) runs for minutes; the engine wraps EVERY tool call in a global timeout. If that
	//     timeout is shorter than the provider's poll deadline, the call dies with TOOL_TIMEOUT before the
	//     worker finishes — losing the result AND the metrology (regression guard for the 2026-07-09 cold
	//     generate_rigged3d 120015ms death). generate_rigged3d must be in the long-running set and its
	//     effective ceiling must clear the poll deadline with headroom.
	const pollDeadline = provMod.pollDeadlineMs()
	const rigged3dTimeout = engineMod.toolTimeoutForName('betterpptx.assets.generate_rigged3d')
	const fastTimeout = engineMod.toolTimeoutForName('betterpptx.deck.new')
	ok('generate_rigged3d is registered as a long-running tool', engineMod.LONG_RUNNING_TOOLS.has('betterpptx.assets.generate_rigged3d'))
	ok('generate_rigged3d effective timeout EXCEEDS provider poll deadline', rigged3dTimeout > pollDeadline, `timeout ${rigged3dTimeout}ms must exceed pollDeadline ${pollDeadline}ms`)
	ok('a normal (non-long) tool keeps the short default timeout', fastTimeout < rigged3dTimeout && fastTimeout <= 300000, `fast ${fastTimeout}ms vs long ${rigged3dTimeout}ms`)
	// Same guard for the other long GPU/render tools that go through the wrapper.
	for (const t of ['betterpptx.assets.generate_model3d', 'betterpptx.avatar.render_job', 'betterpptx.deck.add_avatar_narration', 'betterpptx.slide.add_avatar_narration', 'betterpptx.sketchfab.import']) {
		ok(`long-running set covers ${t} (timeout ${engineMod.toolTimeoutForName(t)}ms > ${pollDeadline}ms)`, engineMod.LONG_RUNNING_TOOLS.has(t) && engineMod.toolTimeoutForName(t) > pollDeadline)
	}
}

async function live() {
	console.log('\nLIVE (real worker generation):')
	const r = await generateRigged3d({ imageBase64: PNG_B64, quality: 'ppt-lite' })
	ok('live generate returns a GLB', typeof r.glbBase64 === 'string' && r.glbBytes > 0)
	ok('live handle + MIT license', /^gen:\/\/trellis\/rigged3d\//.test(r.handle) && r.license.license === 'MIT')
	console.log(`       ${r.provider} ${r.model} rigged=${r.rigged} gpuSeconds=${r.gpuSeconds} glbBytes~${r.glbBytes}`)
}

await offline()
await engine()
if (process.env.RIGGED3D_LIVE === '1') { try { await live() } catch (err) { fail++; console.error('  FAIL live — ' + (err?.message || err)) } }
else console.log('\n(skip LIVE — set RIGGED3D_LIVE=1 + BETTERPPTX_MODEL3D_GEN_URL/TOKEN to hit a real worker)')

console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
