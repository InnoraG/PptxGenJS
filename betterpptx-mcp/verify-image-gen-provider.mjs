// Verify the generated-image provider (Flux text→image, gen:// scheme).
// Offline by default (injected fetchJson mocks — no network, no creds). Optional LIVE generation
// with:  BETTERPPTX_CLOUDFLARE_ACCOUNT_ID=.. BETTERPPTX_CLOUDFLARE_API_TOKEN=.. IMAGEGEN_LIVE=1 node betterpptx-mcp/verify-image-gen-provider.mjs
import path from 'node:path'
import * as os from 'node:os'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import {
	generateImage, imageGenProviderStatus, imageGenConfigured,
	parseGenHandle, isGenHandle, cacheGeneratedImage, getCachedGeneratedImage, ImageGenError, promptHashFor,
} from './assets/image-gen-providers.mjs'

// Pin asset root to repo root so the heavy engine import resolves demos/... regardless of cwd.
process.env.BETTERPPTX_ASSETS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// ISOLATE from the developer's real credential-store.json — point at a non-existent path so the
// provider falls back to env vars. Store-behavior tests override this to their own temp store, then
// restore to NO_STORE (NOT delete — deleting would re-expose the real default store).
const NO_STORE = path.join(os.tmpdir(), `bpx-no-store-${process.pid}.json`)
process.env.BETTERPPTX_CREDENTIAL_STORE = NO_STORE

let pass = 0, fail = 0
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}`) } else { fail++; console.error(`  FAIL ${n}${d ? ' — ' + d : ''}`) } }
async function throws(name, fn, code) {
	try { await fn(); fail++; console.error(`  FAIL ${name} — expected throw ${code}`) }
	catch (err) { ok(name, (err?.code || err?.name) === code, `got ${err?.code || err?.name}: ${err?.message}`) }
}

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQgAJw4DA1U01/kAAAAASUVORK5CYII='
const decodeDims = async b64 => { const s = (await import('sharp')).default; const m = await s(Buffer.from(b64, 'base64')).metadata(); return { width: m.width, height: m.height, format: m.format } }
const makePngB64 = async (w, h) => { const s = (await import('sharp')).default; return (await s({ create: { width: w, height: h, channels: 3, background: { r: 20, g: 40, b: 80 } } }).png().toBuffer()).toString('base64') }

async function offline() {
	console.log('OFFLINE (mocked fetchJson — no network/creds):')

	const st = imageGenProviderStatus()
	ok('status: modal + cloudflare, both Apache-2.0', st.modal.license === 'Apache-2.0' && st.cloudflare.license === 'Apache-2.0')
	ok('not configured with no env', imageGenConfigured() === false)
	ok('parseGenHandle extracts hash (legacy scheme accepted)', parseGenHandle(`gen://flux/image/${'a'.repeat(40)}`)?.hash === 'a'.repeat(40))
	ok('parseGenHandle extracts hash (generic scheme)', parseGenHandle(`gen://image/${'a'.repeat(40)}`)?.hash === 'a'.repeat(40))
	ok('isGenHandle rejects stock:// accepts gen:// (both schemes)', !isGenHandle('stock://pexels/photo/1') && isGenHandle('gen://flux/image/abcdef01') && isGenHandle('gen://image/abcdef01'))

	// Guards (all BEFORE any host call)
	await throws('empty prompt → PROMPT_REQUIRED', () => generateImage({ prompt: '   ' }), 'IMAGE_GEN_PROMPT_REQUIRED')
	await throws('unsafe prompt → UNSAFE_PROMPT', () => generateImage({ prompt: 'nsfw explicit content' }), 'IMAGE_GEN_UNSAFE_PROMPT')
	await throws('no host configured → NOT_CONFIGURED', () => generateImage({ prompt: 'a calm blue background' }), 'IMAGE_GEN_NOT_CONFIGURED')

	// Cloudflare host (mock)
	process.env.BETTERPPTX_CLOUDFLARE_ACCOUNT_ID = 'acct'
	process.env.BETTERPPTX_CLOUDFLARE_API_TOKEN = 'tok'
	const squarePng = await makePngB64(64, 64) // a REAL decodable square (the 2px fixture isn't resize-safe), mimics Cloudflare's 1024² output
	let cfReq = null
	const cfMock = (url, opts) => { cfReq = { url, opts }; return { success: true, result: { image: squarePng } } }
	const r = await generateImage({ prompt: 'blue gradient background', style: 'background', aspect: 'landscape', fetchJson: cfMock })
	ok('cf: handle is generic gen://image/<40hex> (no provider segment)', /^gen:\/\/image\/[a-f0-9]{40}$/.test(r.handle))
	ok('cf: model PINNED to flux-1-schnell', r.model === '@cf/black-forest-labs/flux-1-schnell')
	ok('cf: license Apache-2.0 / no-attribution / commercial', r.license.license === 'Apache-2.0' && r.license.attributionRequired === false && r.license.commercialUse === 'allowed')
	ok('cf: license has host (not provider) key', r.license.provider === undefined && r.license.host === 'cloudflare')
	ok('cf: host ignored aspect → cover-cropped + re-encoded jpeg', r.contentType === 'image/jpeg' && r.dataUri.startsWith('data:image/jpeg;base64,'))
	ok('cf: reported dims = requested landscape 1280x768', r.width === 1280 && r.height === 768)
	const cfDims = await decodeDims(r.base64)
	ok('cf: ACTUAL output pixels are 1280x768 (aspect truly honored)', cfDims.width === 1280 && cfDims.height === 768, `${cfDims.width}x${cfDims.height}`)
	const cfBody = JSON.parse(cfReq.opts.body)
	ok('cf: POST to flux-1-schnell run endpoint w/ Bearer', cfReq.opts.method === 'POST' && cfReq.url.includes('/ai/run/@cf/black-forest-labs/flux-1-schnell') && cfReq.opts.headers.Authorization === 'Bearer tok')
	ok('cf: prompt wrapped w/ style + safety suffix', /no watermark/.test(cfBody.prompt) && /background/.test(cfBody.prompt))
	ok('cf: steps clamped to 1..8', cfBody.steps >= 1 && cfBody.steps <= 8)

	const rDup = await generateImage({ prompt: 'blue gradient background', style: 'background', aspect: 'landscape', fetchJson: cfMock })
	ok('deterministic handle (same prompt+params dedupes)', rDup.handle === r.handle)
	const rDiff = await generateImage({ prompt: 'a red desert at sunset', fetchJson: cfMock })
	ok('different prompt → different handle', rDiff.handle !== r.handle)

	// contentType sniff: a JPEG magic prefix must be detected as image/jpeg
	const jpgMock = () => ({ success: true, result: { image: '/9j/4AAQSkZJRgABAQAAAQ' } })
	const rj = await generateImage({ prompt: 'jpeg sniff test', fetchJson: jpgMock })
	ok('sniff: /9j/ prefix → image/jpeg', rj.contentType === 'image/jpeg' && rj.dataUri.startsWith('data:image/jpeg;base64,'))

	delete process.env.BETTERPPTX_CLOUDFLARE_ACCOUNT_ID
	delete process.env.BETTERPPTX_CLOUDFLARE_API_TOKEN

	// Modal self-hosted host (mock): preferred when configured; honors aspect natively (no re-crop).
	process.env.BETTERPPTX_MODAL_FLUX_URL = 'https://innorag--betterpptx-flux.modal.run'
	process.env.BETTERPPTX_MODAL_FLUX_TOKEN = 'mtok'
	let mReq = null
	const landscapeM = await makePngB64(160, 96)
	const mMock = (url, opts) => { mReq = { url, opts }; return { image: landscapeM, width: 1280, height: 768, model: 'black-forest-labs/FLUX.1-schnell', gpuSeconds: 3.2, coldStart: true, gpuType: 'L40S' } }
	const rm = await generateImage({ prompt: 'owned gpu render', provider: 'modal', aspect: 'landscape', fetchJson: mMock })
	const mBody = JSON.parse(mReq.opts.body)
	ok('modal: POST to worker URL w/ token + width/height in body', mReq.url === 'https://innorag--betterpptx-flux.modal.run' && mBody.token === 'mtok' && mBody.width === 1280 && mBody.height === 768)
	ok('modal: model schnell + Apache-2.0 (host=modal)', rm.model === 'black-forest-labs/FLUX.1-schnell' && rm.license.license === 'Apache-2.0' && rm.license.host === 'modal')
	ok('modal: native aspect → no re-crop (png passthrough, true dims)', rm.contentType === 'image/png' && rm.width === 160 && rm.height === 96, `${rm.contentType} ${rm.width}x${rm.height}`)
	ok('modal: captures worker gpuSeconds + coldStart + gpuType (real L40S per-request cost)', rm.gpuSeconds === 3.2 && rm.coldStart === true && rm.gpuType === 'L40S')
	ok('modal: exposes bounded accepted-call attempt count', rm.attempts === 1)
	const rany = await generateImage({ prompt: 'non-square any', aspect: 'landscape', fetchJson: mMock })
	ok('provider:any non-square → modal (native aspect)', rany.provider === 'modal')

	// ROUTING POLICY: Cloudflare for NATIVE (square) aspect within its daily free tier; Modal for
	// the rest (non-square, or CF free tier spent). Both hosts configured here.
	process.env.BETTERPPTX_CLOUDFLARE_ACCOUNT_ID = 'acct'
	process.env.BETTERPPTX_CLOUDFLARE_API_TOKEN = 'tok'
	const squareCF = await makePngB64(64, 64)
	const bothMock = url => url.includes('cloudflare') ? { success: true, result: { image: squareCF } } : { image: landscapeM, width: 1280, height: 768, model: 'black-forest-labs/FLUX.1-schnell' }
	process.env.BETTERPPTX_CLOUDFLARE_FREE_DAILY_IMAGES = '40'
	ok('routing: square + within free tier → cloudflare', (await generateImage({ prompt: 'square a', aspect: 'square', fetchJson: bothMock })).provider === 'cloudflare')
	ok('routing: non-square → modal (native aspect)', (await generateImage({ prompt: 'ls a', aspect: 'landscape', fetchJson: bothMock })).provider === 'modal')
	process.env.BETTERPPTX_CLOUDFLARE_FREE_DAILY_IMAGES = '0'
	ok('routing: square + free tier spent (local count) → modal', (await generateImage({ prompt: 'square b', aspect: 'square', fetchJson: bothMock })).provider === 'modal')

	// REACT ON REAL CF FAILURE (beyond the local counter): a mock where the CF branch throws.
	process.env.BETTERPPTX_CLOUDFLARE_FREE_DAILY_IMAGES = '40'
	const modalSquare = { image: squareCF, width: 1024, height: 1024, model: 'black-forest-labs/FLUX.1-schnell' }
	const cfThrows = msg => url => { if (url.includes('cloudflare')) throw new ImageGenError('IMAGE_GEN_FAILED', msg); return modalSquare }
	ok('fallback: CF 500 (transient) → modal for this request', (await generateImage({ prompt: 'f1', aspect: 'square', fetchJson: cfThrows('HTTP 500 internal error') })).provider === 'modal')
	ok('fallback: transient failure keeps CF eligible (square still → CF)', (await generateImage({ prompt: 'f2', aspect: 'square', fetchJson: bothMock })).provider === 'cloudflare')
	ok('fallback: CF 429 (exhaustion) → modal for this request', (await generateImage({ prompt: 'f3', aspect: 'square', fetchJson: cfThrows('HTTP 429 Too Many Requests') })).provider === 'modal')
	let cfCalledAfterExhaust = false
	const skipCfMock = url => { if (url.includes('cloudflare')) { cfCalledAfterExhaust = true; throw new ImageGenError('IMAGE_GEN_FAILED', 'should be skipped') } return modalSquare }
	const rAfter = await generateImage({ prompt: 'f4', aspect: 'square', fetchJson: skipCfMock })
	ok('fallback: exhaustion flag SKIPS CF upfront (square → modal, CF not called)', rAfter.provider === 'modal' && cfCalledAfterExhaust === false)
	ok('fallback: explicit provider:"cloudflare" surfaces its error (no silent reroute)', await (async () => { try { await generateImage({ prompt: 'f5', provider: 'cloudflare', aspect: 'square', fetchJson: cfThrows('HTTP 429') }); return false } catch { return true } })())
	delete process.env.BETTERPPTX_CLOUDFLARE_FREE_DAILY_IMAGES

	// MULTI-ACCOUNT ROTATION via the credential store: two CF accounts; A quota-exhausts → the
	// SAME request rotates to B and succeeds on Cloudflare (no Modal fallback needed).
	const { mkdtempSync, writeFileSync: writeFs } = await import('node:fs')
	const { tmpdir } = await import('node:os')
	const storeDir = mkdtempSync(path.join(tmpdir(), 'bpx-credstore-'))
	const storeFile = path.join(storeDir, 'credential-store.json')
	writeFs(storeFile, JSON.stringify({
		schemaVersion: 'betterpptx.credential-store.v1',
		providers: {
			'cloudflare-workers-ai': {
				label: 'Cloudflare Workers AI', envKeys: ['BETTERPPTX_CLOUDFLARE_ACCOUNT_ID', 'BETTERPPTX_CLOUDFLARE_API_TOKEN'],
				activeAccountId: 'acc-a',
				accounts: [
					{ id: 'acc-a', label: 'A', enabled: true, env: { BETTERPPTX_CLOUDFLARE_ACCOUNT_ID: 'cf-acct-a', BETTERPPTX_CLOUDFLARE_API_TOKEN: 'tok-a' } },
					{ id: 'acc-b', label: 'B', enabled: true, env: { BETTERPPTX_CLOUDFLARE_ACCOUNT_ID: 'cf-acct-b', BETTERPPTX_CLOUDFLARE_API_TOKEN: 'tok-b' } },
				],
			},
		},
	}))
	process.env.BETTERPPTX_CREDENTIAL_STORE = storeFile
	const rotMock = url => {
		if (url.includes('/accounts/cf-acct-a/')) throw new ImageGenError('IMAGE_GEN_FAILED', 'HTTP 429 Too Many Requests')
		if (url.includes('/accounts/cf-acct-b/')) return { success: true, result: { image: squareCF } }
		return modalSquare
	}
	const rRot = await generateImage({ prompt: 'rotate me', aspect: 'square', fetchJson: rotMock })
	ok('rotation: account A exhausted → SAME request served by account B on CF', rRot.provider === 'cloudflare')
	let aCalledAgain = false
	const rotMock2 = url => { if (url.includes('cf-acct-a')) { aCalledAgain = true; throw new ImageGenError('IMAGE_GEN_FAILED', 'HTTP 429') } if (url.includes('cf-acct-b')) return { success: true, result: { image: squareCF } }; return modalSquare }
	const rRot2 = await generateImage({ prompt: 'rotate me 2', aspect: 'square', fetchJson: rotMock2 })
	ok('rotation: exhausted account A is SKIPPED on the next request', rRot2.provider === 'cloudflare' && aCalledAgain === false)
	const rotAll429 = url => { if (url.includes('/accounts/cf-')) throw new ImageGenError('IMAGE_GEN_FAILED', 'HTTP 429'); return modalSquare }
	const rRot3 = await generateImage({ prompt: 'rotate me 3', aspect: 'square', fetchJson: rotAll429 })
	ok('rotation: ALL accounts exhausted → modal fallback', rRot3.provider === 'modal')

	// Persistent NON-quota per-account failure (revoked token = 403) must ROTATE to a healthy
	// account, not abort. Fresh account ids (cf-acct-c/d) so daily state is clean.
	const storeFile2 = path.join(storeDir, 'store2.json')
	writeFs(storeFile2, JSON.stringify({
		schemaVersion: 'betterpptx.credential-store.v1',
		providers: { 'cloudflare-workers-ai': { activeAccountId: 'acc-c', accounts: [
			{ id: 'acc-c', enabled: true, env: { BETTERPPTX_CLOUDFLARE_ACCOUNT_ID: 'cf-acct-c', BETTERPPTX_CLOUDFLARE_API_TOKEN: 'tok-c' } },
			{ id: 'acc-d', enabled: true, env: { BETTERPPTX_CLOUDFLARE_ACCOUNT_ID: 'cf-acct-d', BETTERPPTX_CLOUDFLARE_API_TOKEN: 'tok-d' } },
		] } },
	}))
	process.env.BETTERPPTX_CREDENTIAL_STORE = storeFile2
	const auth403 = url => { if (url.includes('cf-acct-c')) throw new ImageGenError('IMAGE_GEN_FAILED', 'HTTP 403 Forbidden'); if (url.includes('cf-acct-d')) return { success: true, result: { image: squareCF } }; return modalSquare }
	const rAuth = await generateImage({ prompt: 'auth rotate', aspect: 'square', fetchJson: auth403 })
	ok('rotation: revoked-token (403) on A → rotates to healthy B (not abort)', rAuth.provider === 'cloudflare')
	process.env.BETTERPPTX_CREDENTIAL_STORE = NO_STORE
	delete process.env.BETTERPPTX_CLOUDFLARE_ACCOUNT_ID
	delete process.env.BETTERPPTX_CLOUDFLARE_API_TOKEN
	delete process.env.BETTERPPTX_MODAL_FLUX_URL
	delete process.env.BETTERPPTX_MODAL_FLUX_TOKEN

	// promptHashFor normalizes aspect → casing/typo variants that render identically dedupe.
	const hSquare = promptHashFor({ prompt: 'x', aspect: 'square' })
	ok('hash: aspect normalized (Square == square == "")', promptHashFor({ prompt: 'x', aspect: 'Square' }) === hSquare && promptHashFor({ prompt: 'x', aspect: '' }) === hSquare)
	ok('hash: distinct aspects still differ (landscape != square)', promptHashFor({ prompt: 'x', aspect: 'landscape' }) !== hSquare)

	// MULTI-ENDPOINT MODAL: two Flux endpoints in the store → round-robin spreads load; a failing
	// endpoint fails over to a healthy one.
	const modalStoreFile = path.join(storeDir, 'modal-store.json')
	writeFs(modalStoreFile, JSON.stringify({
		schemaVersion: 'betterpptx.credential-store.v1',
		providers: { 'modal-flux': { activeAccountId: 'm1', accounts: [
			{ id: 'm1', enabled: true, env: { BETTERPPTX_MODAL_FLUX_URL: 'https://ep1.modal.run', BETTERPPTX_MODAL_FLUX_TOKEN: 't1' } },
			{ id: 'm2', enabled: true, env: { BETTERPPTX_MODAL_FLUX_URL: 'https://ep2.modal.run', BETTERPPTX_MODAL_FLUX_TOKEN: 't2' } },
		] } },
	}))
	process.env.BETTERPPTX_CREDENTIAL_STORE = modalStoreFile
	const modalHits = { 'https://ep1.modal.run': 0, 'https://ep2.modal.run': 0 }
	const modalTokByEp = {}
	const modalMulti = (url, opts) => { modalHits[url]++; modalTokByEp[url] = JSON.parse(opts.body).token; return { image: squareCF, width: 1024, height: 1024, model: 'black-forest-labs/FLUX.1-schnell' } }
	for (let i = 0; i < 4; i++) await generateImage({ prompt: 'rr' + i, provider: 'modal', aspect: 'square', fetchJson: modalMulti })
	ok('modal: round-robin spreads across BOTH endpoints', modalHits['https://ep1.modal.run'] > 0 && modalHits['https://ep2.modal.run'] > 0)
	ok('modal: each endpoint gets its OWN token', modalTokByEp['https://ep1.modal.run'] === 't1' && modalTokByEp['https://ep2.modal.run'] === 't2')
	const modalFailover = url => { if (url.includes('ep1')) throw new ImageGenError('IMAGE_GEN_FAILED', 'HTTP 500 down'); return { image: squareCF, width: 1024, height: 1024, model: 'x' } }
	ok('modal: endpoint failure fails over to a healthy endpoint', (await generateImage({ prompt: 'fo', provider: 'modal', aspect: 'square', fetchJson: modalFailover })).provider === 'modal')
	// A provider-side 4xx is a request/configuration defect, not scheduler pressure: it must
	// fail over to another endpoint (if available) without retrying the same endpoint. This
	// guards the live image-authoring path from multiplying a long cold-start wait on HTTP 400.
	const modal400StoreFile = path.join(storeDir, 'modal-400-store.json')
	writeFs(modal400StoreFile, JSON.stringify({
		schemaVersion: 'betterpptx.credential-store.v1',
		providers: { 'modal-flux': { activeAccountId: 'm400', accounts: [
			{ id: 'm400', enabled: true, env: { BETTERPPTX_MODAL_FLUX_URL: 'https://ep400.modal.run', BETTERPPTX_MODAL_FLUX_TOKEN: 't400' } },
		] } },
	}))
	process.env.BETTERPPTX_CREDENTIAL_STORE = modal400StoreFile
	let badRequestCalls = 0
	const modal400 = () => { badRequestCalls += 1; throw new ImageGenError('IMAGE_GEN_FAILED', 'HTTP 400 Bad Request') }
	await throws('modal: HTTP 400 is fail-fast (no same-endpoint scheduler retry)', () => generateImage({ prompt: 'bad request no retry', provider: 'modal', aspect: 'square', fetchJson: modal400 }), 'IMAGE_GEN_FAILED')
	ok('modal: HTTP 400 calls the endpoint exactly once', badRequestCalls === 1)
	process.env.BETTERPPTX_CREDENTIAL_STORE = NO_STORE

	// cache roundtrip
	cacheGeneratedImage(r)
	const c = getCachedGeneratedImage(r.promptHash)
	ok('cache roundtrip: dataUri + license', c?.dataUri === r.dataUri && c?.license?.license === 'Apache-2.0')
}

async function engine() {
	console.log('\nENGINE (real json-spec interface):')
	const engineMod = await import('./engine.mjs')
	const { cacheGeneratedImage: cacheGen } = await import('./assets/image-gen-providers.mjs')
	const dispatcher = engineMod.createMcpToolDispatcher({ sessionId: `verify-image-gen-${process.pid}` })

	// 1) Tool is dispatchable AND public (blackbox): no creds → handler runs → NOT_CONFIGURED
	//    (NOT "unknown tool" and NOT "json-spec only") — proves wiring + allowlist.
	const res = await engineMod.callBetterPptxTool('betterpptx.assets.generate_image', { prompt: 'a calm abstract background' })
	ok('generate_image is dispatchable + public (no creds → NOT_CONFIGURED)', res?.ok === false && /not configured|NOT_CONFIGURED/i.test(JSON.stringify(res?.error || res)))

	// Cache-first: an identical prior request returns the cached handle with NO host call or metering
	// — proven here by the tool succeeding (cached:true) despite NO provider being configured (a fresh
	// generate would throw NOT_CONFIGURED). Guards against retry-loops draining the free tier.
	const cachePrompt = 'a specific cached prompt for dedupe'
	const cacheHash = promptHashFor({ prompt: cachePrompt, aspect: 'square' })
	cacheGen({ promptHash: cacheHash, dataUri: `data:image/png;base64,${PNG_B64}`, contentType: 'image/png', width: 1024, height: 1024, provider: 'cloudflare', model: 'm', license: { host: 'cloudflare', license: 'Apache-2.0', attributionRequired: false, commercialUse: 'allowed' } })
	const cachedRes = await engineMod.callBetterPptxTool('betterpptx.assets.generate_image', { prompt: cachePrompt, aspect: 'square' })
	const cachedData = cachedRes?.data || cachedRes
	ok('cache-first: identical prompt → cached handle, no regen (works with no provider configured)', cachedRes?.ok === true && cachedData?.cached === true && cachedData?.handle === `gen://image/${cacheHash}`)
	// G1: the public tool result must carry NO provenance (provider/model) — generic license only.
	ok('public result is provenance-free (no provider/model; generic license)', cachedData?.provider === undefined && cachedData?.model === undefined && cachedData?.license?.type === 'generated' && !JSON.stringify(cachedData?.license || {}).match(/flux|schnell|huggingface|cloudflare|modal/i))

	// 2) Embed E2E: pre-cache a generated result, reference its gen:// handle in a spec, commit.
	//    Success proves compiler pass-through + materializeGeneratedImageOptions + license record.
	const hash = 'abcdef0123'.repeat(4) // 40 hex
	cacheGen({
		promptHash: hash, dataUri: `data:image/png;base64,${PNG_B64}`, contentType: 'image/png', width: 1024, height: 1024,
		provider: 'cloudflare', model: '@cf/black-forest-labs/flux-1-schnell',
		license: { generator: 'flux-schnell', host: 'cloudflare', model: '@cf/black-forest-labs/flux-1-schnell', license: 'Apache-2.0', licenseUrl: 'https://huggingface.co/black-forest-labs/FLUX.1-schnell', attributionRequired: false, commercialUse: 'allowed' },
	})
	const handle = `gen://flux/image/${hash}`
	const mkSpec = img => ({
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'gen-verify', audience: 'v', objective: 'verify generated image embed',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', textPolicy: 'Use textBox for standalone text and textShape for text inside a PowerPoint shape.', requires: ['slide.id', 'content[].name', 'slide.notes', 'validation before save'] },
		contentStory: { audience: 'v', outcome: 'verify generated image embed', remember: 'a cached opaque handle remains editable in the deck' },
		visualDesign: { world: 'Quiet verification canvas', framing: 'clear title and image hierarchy' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'One governed clock coordinates builds and transitions.' },
		styleIntent: { density: 'medium', tone: 'direct', visualSystem: 'native editable PowerPoint' },
		theme: { name: 'V', palette: ['0B1220', '2563EB', '14B8A6', 'F59E0B', 'F8FAFC'], fontFace: 'Aptos' },
		sections: [{ id: 'main', title: 'Main', slideIds: ['s1'] }],
		slides: [{ id: 's1', title: 'Gen', role: 'opener', message: 'Gen', layoutIntent: 'title-body', notes: 'g',
		content: [{ kind: 'title', name: 't', text: 'Generated' }, { kind: 'image', name: 'hero', image: img, imageOptions: { sizing: { type: 'cover' } } }] }],
	})
	const gen = await dispatcher.call('betterpptx.deck.generate_from_spec', { spec: mkSpec(handle), phase: 'commit', plan: 'free', detail: 'summary' })
	const deckId = gen?.data?.deckId || gen?.deckId
	ok('embed E2E: cached gen:// handle resolves + commits', gen?.ok === true, gen?.error?.message?.slice(0, 160))
	if (deckId) {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-image-framing-'))
		try {
			await dispatcher.call('betterpptx.deck.validate_quality', { deckId })
			const saved = await dispatcher.call('betterpptx.deck.save', { deckId, fileName: 'generated-framing.pptx', outputDir: tempDir })
			const pptxPath = path.join(tempDir, 'generated-framing.pptx')
			const zip = saved?.ok === true && fs.existsSync(pptxPath) ? await JSZip.loadAsync(fs.readFileSync(pptxPath)) : null
			const slideXml = zip ? await zip.file('ppt/slides/slide1.xml')?.async('string') : ''
			const srcRect = slideXml?.match(/<a:srcRect[^>]+\/>/)?.[0] || ''
			const cropMatch = srcRect.match(/l="(-?\d+)" r="(-?\d+)" t="(-?\d+)" b="(-?\d+)"/)
			const cropValues = cropMatch ? cropMatch.slice(1).map(Number) : []
			ok('generated handle retains source aspect for semantic cover', cropValues.length === 4 && cropValues[0] === 0 && cropValues[1] === 0 && cropValues[2] > 0 && cropValues[3] === cropValues[2], srcRect || 'missing srcRect')
		} finally { fs.rmSync(tempDir, { recursive: true, force: true }) }
		try { await dispatcher.call('betterpptx.deck.dispose', { deckId }) } catch {}
	}

	// control: an un-generated gen:// handle must be rejected (not silently blank)
	const gen2 = await dispatcher.call('betterpptx.deck.generate_from_spec', { spec: mkSpec(`gen://flux/image/${'f'.repeat(40)}`), phase: 'commit', plan: 'free', detail: 'summary' })
	ok('control: ungenerated gen:// handle rejected', gen2?.ok === false && /not been generated|generate_image first/i.test(gen2?.error?.message || ''))

	// 3) Meter: the imageGen* counters flow through the resource meter row.
	process.env.BETTERPPTX_METROLOGY = '1'
	process.env.BETTERPPTX_METROLOGY_SINK = 'log'
	process.env.BETTERPPTX_COST_OBSERVATIONS = '0'
	const meter = await import('./billing/resource-meter.mjs')
	const m = meter.startResourceMeasure({ toolName: 'verify.imagegen' })
	meter.recordResourceUsage({ imageGenOps: 1, imageGenImages: 2, imageGenGpuSeconds: 3.2 })
	meter.recordResourceLabels({ imageGenColdStart: 'true', imageGenGpuType: 'L40S' })
	const row = meter.finishResourceMeasure(m, { ok: true })
	ok('meter row carries imageGenOps + imageGenImages', row?.imageGenOps === 1 && row?.imageGenImages === 2, JSON.stringify({ ops: row?.imageGenOps, imgs: row?.imageGenImages }))
	ok('meter row carries imageGenGpuSeconds (real L40S per-request GPU cost)', row?.imageGenGpuSeconds === 3.2)
	ok('meter row carries cold/gpuType attribution labels', row?.labels?.imageGenColdStart === 'true' && row?.labels?.imageGenGpuType === 'L40S', JSON.stringify(row?.labels || {}))
	const semanticMeasure = meter.startResourceMeasure({ toolName: 'verify.semantic-judge' })
	meter.recordResourceUsage({ semanticJudgeOps: 2, semanticJudgeGpuSeconds: 4.5 })
	meter.recordResourceLabels({ semanticJudgeColdStart: 'true', semanticJudgeGpuType: 'L40S' })
	const semanticRow = meter.finishResourceMeasure(semanticMeasure, { ok: true })
	ok('meter row carries private semantic-judge operation/GPU counters', semanticRow?.semanticJudgeOps === 2 && semanticRow?.semanticJudgeGpuSeconds === 4.5)
	ok('meter row carries private semantic-judge attribution labels', semanticRow?.labels?.semanticJudgeColdStart === 'true' && semanticRow?.labels?.semanticJudgeGpuType === 'L40S')

	// 4) Cost family exists in the rate card + charging matrix; GPU seconds priced as a GPU-fair family.
	const { BILLING_RATE_CARD } = await import('./billing/rate-card.mjs')
	ok('rate card has imageGenBase + imageGenPerImage', BILLING_RATE_CARD.heavy.imageGenBase > 0 && BILLING_RATE_CARD.heavy.imageGenPerImage > 0)
	ok('rate card has imageGenPerGpuSecond (Flux L40S GPU rate)', BILLING_RATE_CARD.heavy.imageGenPerGpuSecond > 0)
	ok('rate card has a separate semanticJudgePerGpuSecond family', BILLING_RATE_CARD.heavy.semanticJudgePerGpuSecond > 0)
	// GPU-fair placement: at owner mult 10, avatar caps at 3. imageGenPerGpuSecond is a GPU family → x3, while a
	// CPU family (Baker) → x10; assert imageGen uses the GPU-fair cap (matches model3dGen/avatar, NOT the CPU margin).
	const { measuredMatrixToRateCard } = await import('./billing/charging-matrix.mjs')
	process.env.BETTERPPTX_CHARGING_MATRIX_ALLOW_INCOMPLETE = '1'
	const rc = measuredMatrixToRateCard({ schemaVersion: 'betterpptx.charging-matrix.v1', status: 'measured', currency: 'USD', rateCardUsd: { checkpoint: {}, heavy: { imageGenPerGpuSecond: 0.001, model3dGenPerBakeCpuSecond: 0.001 } }, models: {} }, { multiplier: 10 })
	ok('charging-matrix: imageGen GPU uses the GPU-fair cap (imageGen/bakeCPU ratio == 3/10)', Math.abs(rc.heavy.imageGenPerGpuSecond / rc.heavy.model3dGenPerBakeCpuSecond - (3 / 10)) < 1e-6, JSON.stringify({ gpu: rc.heavy.imageGenPerGpuSecond, cpu: rc.heavy.model3dGenPerBakeCpuSecond }))
	const rcSemantic = measuredMatrixToRateCard({ schemaVersion: 'betterpptx.charging-matrix.v1', status: 'measured', currency: 'USD', rateCardUsd: { checkpoint: {}, heavy: { semanticJudgePerGpuSecond: 0.001, model3dGenPerBakeCpuSecond: 0.001 } }, models: {} }, { multiplier: 10 })
	delete process.env.BETTERPPTX_CHARGING_MATRIX_ALLOW_INCOMPLETE
	ok('charging-matrix: semantic judge GPU uses the GPU-fair cap', Math.abs(rcSemantic.heavy.semanticJudgePerGpuSecond / rcSemantic.heavy.model3dGenPerBakeCpuSecond - (3 / 10)) < 1e-6)

	// 5) Cost-model: catalog validates + attributes imageGenGpuUsd (0 until owner sets basis; back-compat ?? 0).
	const { validateCloudBillingCatalogSnapshot, estimateResourceRowCost } = await import('./billing/cost-model.mjs')
	const catalog = {
		schemaVersion: 'x', currency: 'USD', region: 'us-central1', effectiveAt: '2026-07-09', retrievedAt: '2026-07-09',
		source: { type: 't', reference: 'r' }, cloudRun: { vcpuUsdPerSecond: 0, gibUsdPerSecond: 0, requestUsdPerMillion: 0 },
		gcs: { classAUsdPer1000: 0, classBUsdPer1000: 0, storageUsdPerGibMonth: 0, egressUsdPerGib: 0 },
		firestore: { readUsdPer100k: 0, writeUsdPer100k: 0, deleteUsdPer100k: 0 },
		external: { ttsUsdPerMillionCharacters: 0, avatarUsdPerGpuSecond: 0, otherUsdPerCall: 0, imageGenUsdPerGpuSecond: 0.0009 },
	}
	const cat = validateCloudBillingCatalogSnapshot(catalog)
	ok('cost-model catalog accepts imageGenUsdPerGpuSecond', cat.external.imageGenUsdPerGpuSecond === 0.0009)
	const cost = estimateResourceRowCost({ toolName: 'x', wallMs: 1000, imageGenGpuSeconds: 3.2 }, { catalog })
	ok('cost-model attributes imageGenGpuUsd = gpuSeconds * L40S basis', Math.abs(cost.breakdownUsd.imageGenGpuUsd - 3.2 * 0.0009) < 1e-9, String(cost.breakdownUsd.imageGenGpuUsd))
	const semanticCost = estimateResourceRowCost({ toolName: 'x', wallMs: 1000, semanticJudgeOps: 1, semanticJudgeGpuSeconds: 4.5 }, { catalog })
	ok('cost-model attributes private semanticJudgeGpuUsd separately', Math.abs(semanticCost.breakdownUsd.semanticJudgeGpuUsd - 4.5 * 0.0009) < 1e-9, String(semanticCost.breakdownUsd.semanticJudgeGpuUsd))
	const catNoField = { ...catalog, external: { ttsUsdPerMillionCharacters: 0, avatarUsdPerGpuSecond: 0, otherUsdPerCall: 0 } }
	ok('cost-model: pre-existing catalog WITHOUT imageGenUsdPerGpuSecond still validates (?? 0)', validateCloudBillingCatalogSnapshot(catNoField).external.imageGenUsdPerGpuSecond === 0)
	ok('cost-model: semantic judge field falls back to image-gen basis for old catalogs', validateCloudBillingCatalogSnapshot(catalog).external.semanticJudgeUsdPerGpuSecond === 0.0009)
}

async function live() {
	console.log('\nLIVE (real host generation):')
	const r = await generateImage({ prompt: 'abstract minimal gradient background, deep blue to teal', style: 'background', aspect: 'landscape' })
	ok('live generate returns a data URI image', /^data:image\/(png|jpeg);base64,/.test(r.dataUri || ''), r.dataUri?.slice(0, 40))
	ok('live handle + Apache-2.0 license', /^gen:\/\/image\//.test(r.handle) && r.license.license === 'Apache-2.0')
	console.log(`       ${r.provider} ${r.model} ${r.width}x${r.height} bytes~${Math.round((r.base64?.length || 0) * 0.75)}`)
}

await offline()
await engine()
if (process.env.IMAGEGEN_LIVE === '1') { try { await live() } catch (err) { fail++; console.error('  FAIL live — ' + (err?.message || err)) } }
else console.log('\n(skip LIVE — set IMAGEGEN_LIVE=1 + host creds to hit a real host)')

console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
