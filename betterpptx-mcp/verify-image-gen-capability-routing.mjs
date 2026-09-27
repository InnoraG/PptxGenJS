// IMG2 — offline proof for capability-routed image generation.
// No network, credentials, model download, or GPU spend. Provider calls use an injected worker mock.
import path from 'node:path'
import * as os from 'node:os'
import { fileURLToPath } from 'node:url'

import {
	generateImage,
	imageGenConfigured,
	imageRequestHashFor,
	normalizeImageCapability,
	cacheGeneratedImage,
	ImageGenError,
} from './assets/image-gen-providers.mjs'
import { buildVisualGenerationPlan } from './ir/visual-director.mjs'
import { TOOLS } from './tools.mjs'

process.env.BETTERPPTX_ASSETS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.env.BETTERPPTX_CREDENTIAL_STORE = path.join(os.tmpdir(), `bpx-img2-no-store-${process.pid}.json`)

let pass = 0
let fail = 0
const ok = (name, condition, detail = '') => {
	if (condition) { pass += 1; console.log(`  ok   ${name}`) }
	else { fail += 1; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}
async function throws(name, fn, code) {
	try { await fn(); ok(name, false, `expected ${code}`) }
	catch (err) { ok(name, err?.code === code, `got ${err?.code}: ${err?.message}`) }
}

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQgAJw4DA1U01/kAAAAASUVORK5CYII='
const REF_A = '1'.repeat(40)
const REF_B = '2'.repeat(40)

console.log('IMG2 PROVIDER ROUTER (offline worker mock):')
const publicTool = TOOLS.find(tool => tool.name === 'betterpptx.assets.generate_image')
ok('public tool schema exposes capabilities but no provider/model selector',
	publicTool?.inputSchema?.properties?.capability
	&& publicTool?.inputSchema?.properties?.provider === undefined
	&& publicTool?.inputSchema?.properties?.model === undefined)
ok('public image tool schema contains no generator, host or legacy-handle vocabulary',
	!/flux|klein|schnell|modal|cloudflare|huggingface|gen:\/\/flux/i.test(JSON.stringify(publicTool)))
ok('auto capability: no refs=create, one=reference, two=multi-reference',
	normalizeImageCapability('auto', 0) === 'create'
	&& normalizeImageCapability('auto', 1) === 'reference'
	&& normalizeImageCapability('auto', 2) === 'multi-reference')

const legacyCreate = imageRequestHashFor({ prompt: 'same', aspect: 'square' })
const explicitCreate = imageRequestHashFor({ prompt: 'same', aspect: 'square', capability: 'create' })
const refAHash = imageRequestHashFor({ prompt: 'same', aspect: 'square', capability: 'reference', referenceDigests: [REF_A] })
const refBHash = imageRequestHashFor({ prompt: 'same', aspect: 'square', capability: 'reference', referenceDigests: [REF_B] })
const editAHash = imageRequestHashFor({ prompt: 'same', aspect: 'square', capability: 'edit', referenceDigests: [REF_A] })
ok('plain creation keeps the historical request identity', legacyCreate === explicitCreate)
ok('reference content participates in cache identity', refAHash !== refBHash)
ok('semantic edit/reference operations cannot alias', refAHash !== editAHash)

await throws('reference capability fails before routing when no reference exists',
	() => generateImage({ prompt: 'revise this', capability: 'reference' }), 'IMAGE_GEN_REFERENCE_REQUIRED')
await throws('multi-reference requires at least two inputs',
	() => generateImage({ prompt: 'combine', capability: 'multi-reference', referenceImages: [PNG_B64] }), 'IMAGE_GEN_MULTIPLE_REFERENCES_REQUIRED')
await throws('edit lane fails closed when its private worker is absent',
	() => generateImage({ prompt: 'revise', capability: 'edit', referenceImages: [PNG_B64] }), 'IMAGE_GEN_CAPABILITY_NOT_CONFIGURED')

process.env.BETTERPPTX_MODAL_IMAGE_EDIT_URL = 'https://opaque--e91c3a70.modal.run'
process.env.BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN = 'private-edit-token'
ok('edit/reference capability reports configured independently of creation', imageGenConfigured('edit') === true && imageGenConfigured('create') === false)

let request = null
const editMock = (url, options) => {
	request = { url, body: JSON.parse(options.body) }
	return { image: PNG_B64, width: 1024, height: 1024, model: 'private-model-id', gpuSeconds: 2.75, coldStart: true, gpuType: 'L40S' }
}
const edited = await generateImage({
	prompt: 'Keep the subject; replace the background with a quiet blue studio.',
	capability: 'reference',
	referenceImages: [PNG_B64],
	referenceDigests: [REF_A],
	style: 'photo',
	fetchJson: editMock,
})
ok('reference request routes only to the dedicated private edit endpoint', edited.provider === 'modal-edit' && request?.url.includes('opaque--e91c3a70'))
ok('worker contract carries capability, token, one in-memory image and no public handle',
	request?.body?.capability === 'reference'
	&& request?.body?.token === 'private-edit-token'
	&& request?.body?.images?.length === 1
	&& !JSON.stringify(request.body).includes('gen://'))
ok('edit result meters actual GPU seconds and stays generic at the handle boundary',
	edited.gpuSeconds === 2.75 && edited.coldStart === true && /^gen:\/\/image\/[a-f0-9]{40}$/.test(edited.handle))
ok('private provenance records only the audited Apache lane',
	edited.license?.license === 'Apache-2.0' && /klein-4B/.test(edited.license?.licenseUrl || ''))
ok('raw reference bytes are not retained in result metadata',
	!JSON.stringify({ ...edited, base64: undefined, dataUri: undefined }).includes(PNG_B64) && edited.referenceDigests?.[0] === REF_A)

let multiBody = null
await generateImage({
	prompt: 'Use the composition of the first image and palette of the second.',
	capability: 'auto',
	referenceImages: [PNG_B64, PNG_B64],
	referenceDigests: [REF_A, REF_B],
	fetchJson: (_url, options) => { multiBody = JSON.parse(options.body); return { image: PNG_B64, gpuSeconds: 1.5 } },
})
ok('auto with two references selects multi-reference and forwards both in order', multiBody?.capability === 'multi-reference' && multiBody?.images?.length === 2)
await throws('reference-aware work never silently downgrades to an explicit edge creation route',
	() => generateImage({ prompt: 'revise', capability: 'edit', provider: 'cloudflare', referenceImages: [PNG_B64] }),
	'IMAGE_GEN_CAPABILITY_UNAVAILABLE_ON_ROUTE')

console.log('\nVISUAL DIRECTOR ROUTING:')
const visualPlan = buildVisualGenerationPlan({
	spec: { title: 'Quarterly review', objective: 'Explain the operating model', audience: 'executives', styleIntent: { preset: 'editorial-light' } },
	slide: { title: 'One operating model', message: 'Teams converge around one system', role: 'opener', layoutIntent: 'copy-left-image-right' },
	block: { kind: 'image', visualIntent: { mode: 'generate', concept: 'a coherent operating system', referenceHandles: [`gen://image/${REF_A}`, `gen://image/${REF_B}`] } },
	rect: { x: 7, y: 1.2, w: 5.5, h: 5.4 },
})
ok('Visual Director infers multi-reference from two durable references', visualPlan?.request?.capability === 'multi-reference' && visualPlan?.request?.referenceHandles?.length === 2)
ok('Visual Director exposes generic capability, not generator or host names', !/flux|klein|schnell|modal|cloudflare/i.test(JSON.stringify(visualPlan?.request || {})))
ok('reference-aware plan carries a higher bounded cost ceiling and explicit QA policy', visualPlan?.cost?.estimatedUpperBoundUsd === 0.09 && visualPlan?.cost?.generationCount === 3 && visualPlan?.qualityPolicy?.referenceAware === true && visualPlan?.qualityPolicy?.boundedRetries === 1)

console.log('\nENGINE TENANT-HANDLE + PUBLIC BLACK-BOX:')
cacheGeneratedImage({
	promptHash: REF_A,
	dataUri: `data:image/png;base64,${PNG_B64}`,
	contentType: 'image/png', width: 1024, height: 1024,
	provider: 'private-create', model: 'private-create-model', capability: 'create', license: { license: 'Apache-2.0' },
})
const cachedPrompt = 'Preserve the subject and use a quiet blue studio.'
const cachedEditHash = imageRequestHashFor({ prompt: cachedPrompt, capability: 'edit', referenceDigests: [REF_A] })
cacheGeneratedImage({
	promptHash: cachedEditHash,
	dataUri: `data:image/png;base64,${PNG_B64}`,
	contentType: 'image/png', width: 1024, height: 1024,
	provider: 'modal-edit', model: 'private-edit-model', capability: 'edit', referenceDigests: [REF_A],
	license: { generator: 'private', host: 'private', model: 'private-edit-model', license: 'Apache-2.0', attributionRequired: false, commercialUse: 'allowed' },
})
const engine = await import('./engine.mjs')
const response = await engine.callBetterPptxTool('betterpptx.assets.generate_image', {
	prompt: cachedPrompt,
	capability: 'edit',
	referenceHandles: [`gen://image/${REF_A}`],
})
const publicData = response?.data || response
ok('public edit resolves tenant-visible reference handle and reuses derived cache', response?.ok === true && publicData?.cached === true && publicData?.handle === `gen://image/${cachedEditHash}`)
ok('public result exposes only generic capability and license facts',
	publicData?.capability === 'edit'
	&& !/flux|klein|schnell|modal|cloudflare|huggingface|private-edit/i.test(JSON.stringify(publicData)))
await throws('unavailable cross-tenant/unknown reference is rejected before any worker call',
	async () => {
		const out = await engine.callBetterPptxTool('betterpptx.assets.generate_image', {
			prompt: 'revise', capability: 'edit', referenceHandles: [`gen://image/${'f'.repeat(40)}`],
		})
		if (out?.ok === false) throw Object.assign(new Error(out.error?.message), { code: out.error?.code })
	}, 'IMAGE_GEN_REFERENCE_UNAVAILABLE')

delete process.env.BETTERPPTX_MODAL_IMAGE_EDIT_URL
delete process.env.BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN

console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
