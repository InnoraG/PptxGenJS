// Research-only photofit evidence. This is deliberately separate from the public
// image-generation engine: it may use the owner-consented local subject only through
// the two private Modal Klein endpoints, writes derived pixels locally, and never
// creates a durable/public asset handle. No training or external AI is involved.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { evaluateImageQuality } from './quality/image-quality-gates.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, '..')
const scopePath = path.join(projectRoot, 'consentedHumanAsset', 'photofit-scope.json')
const scope = JSON.parse(await fs.readFile(scopePath, 'utf8'))
const store = JSON.parse((await fs.readFile(path.join(here, 'config', 'credential-store.json'), 'utf8')).replace(/^\uFEFF/, ''))
const accounts = (store.providers?.['modal-image-edit']?.accounts || []).filter(account => account?.enabled !== false)
const bodyPath = path.join(projectRoot, 'consentedHumanAsset', 'FullBodyApose.png')
const facePath = path.join(projectRoot, 'consentedHumanAsset', 'CompositedFaces.png')
const body = (await fs.readFile(bodyPath)).toString('base64')
const faceBoard = (await fs.readFile(facePath)).toString('base64')
const outputRoot = path.join(here, 'outputs')
const width = 512
const height = 848
const steps = 2
const usdPerGpuSecond = 0.000542
const warmCeilingUsd = 0.02
const coldCeilingUsd = 0.10
const timeoutMs = 360000
const prompt = 'Research-only photorealistic full-body refinement. Use reference image 1 as the same adult subject body, clothing and A-pose; use reference image 2 as the same subject multi-angle face and head identity reference. Preserve the person, facial geometry, hairline, skin tone, body proportions, clothing, hands and pose. Improve realistic skin pores, hair strands, natural facial texture, fabric weave and consistent neutral studio lighting. Produce one natural full-body studio photograph on a plain gray background, head to toe visible. No stylization, no text, no logos, no watermark, no extra people, no props.'

let pass = 0
let fail = 0
const checks = []
const ok = (name, condition, detail = '') => {
	const status = condition ? 'PASS' : 'FAIL'
	if (condition) pass += 1
	else fail += 1
	checks.push({ name, status, detail })
	console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const safeId = value => String(value).replace(/[^a-z0-9_-]/gi, '_')

console.log('PRIVATE MODAL PHOTOFIT RESEARCH (consented subject, no production exposure):')
ok('scope attestation identifies local research/demo subject', scope.subjectRef === 'local-research-demo-subject-001' && scope.scope?.localResearch === true && scope.scope?.productionUse === false)
ok('scope permits only private Modal research and local execution', scope.scope?.privateModalResearchProcessing === true && scope.scope?.cloudProduction === false && scope.scope?.publicEndpointUse === false && scope.enforcement?.failClosedOnUnknownExecutionTarget === true)
ok('scope forbids training, persistent cloud storage and other cloud providers', scope.scope?.modelTraining === false && scope.scope?.aiEvaluationImprovement === false && scope.scope?.persistentCloudStorage === false && scope.enforcement?.deniedProviders?.includes('gcp'))
ok('two private Klein profiles are configured', accounts.length === 2 && accounts.every(account => account.env?.BETTERPPTX_MODAL_IMAGE_EDIT_URL && account.env?.BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN))
ok('local full-body and multi-angle face references are available', body.length > 1000 && faceBoard.length > 1000)

async function invoke(account, index) {
	const url = String(account.env.BETTERPPTX_MODAL_IMAGE_EDIT_URL)
	const token = String(account.env.BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN)
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	const started = Date.now()
	let response
	let payload = null
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token, capability: 'multi-reference', prompt, images: [body, faceBoard], width, height, steps, seed: 8600 + index }),
			signal: controller.signal,
		})
		payload = await response.json()
	} catch (error) {
		return { accountId: String(account.id), status: 'ERROR', elapsedMs: Date.now() - started, error: String(error?.message || error) }
	} finally { clearTimeout(timer) }
	const encoded = String(payload?.image || '')
	let buffer = null
	let meta = null
	if (encoded) {
		try { buffer = Buffer.from(encoded, 'base64'); meta = await sharp(buffer).metadata() } catch { buffer = null; meta = null }
	}
	const gpuSeconds = Number(payload?.gpuSeconds || 0)
	const gpuCostUsd = gpuSeconds * usdPerGpuSecond
	const quality = buffer ? await evaluateImageQuality(buffer, { aspect: 'portrait', minWidth: 512, minHeight: 768, minEntropy: 1.2, minStdev: 4 }) : null
	const outputDigest = buffer ? digest(buffer) : null
	const outputPath = buffer ? path.join(outputRoot, `private-photofit-klein-${safeId(account.id)}.png`) : null
	if (buffer) await fs.writeFile(outputPath, buffer)
	return {
		accountId: String(account.id), status: response.ok && buffer && meta && quality?.status === 'pass' ? 'PASS' : 'FAIL', httpStatus: response.status,
		elapsedMs: Date.now() - started, width: meta?.width || null, height: meta?.height || null,
		gpuSeconds, gpuCostUsd: Math.round(gpuCostUsd * 1e8) / 1e8, coldStart: Boolean(payload?.coldStart),
		gpuType: String(payload?.gpuType || ''), peakAllocatedBytes: Number(payload?.peakAllocatedBytes || 0),
		peakReservedBytes: Number(payload?.peakReservedBytes || 0), outputDigest,
		quality: quality ? { status: quality.status, measurements: quality.measurements, blockingIssues: quality.blockingIssues } : null,
		outputPath: buffer ? `betterpptx-mcp/outputs/private-photofit-klein-${safeId(account.id)}.png` : null,
		researchOnly: true, publicHandleCreated: false, customerImage: false, training: false,
	}
}

const results = []
for (const [index, account] of accounts.entries()) {
	const result = await invoke(account, index)
	results.push(result)
	ok(`${account.id}: private multi-reference photofit request returned a valid portrait`, result.status === 'PASS' && result.width === width && result.height === height)
	const ceiling = result.coldStart ? coldCeilingUsd : warmCeilingUsd
	ok(`${account.id}: research GPU cost stays within ${result.coldStart ? 'cold' : 'warm'} ceiling`, Number.isFinite(result.gpuCostUsd) && result.gpuCostUsd <= ceiling, `$${Number(result.gpuCostUsd || 0).toFixed(6)}`)
	ok(`${account.id}: peak GPU memory telemetry is present`, result.peakAllocatedBytes > 0 && result.peakReservedBytes >= result.peakAllocatedBytes)
}
ok('both private profiles returned distinct photofit research outputs', results.length === 2 && results.every(result => result.status === 'PASS') && new Set(results.map(result => result.outputDigest).filter(Boolean)).size === 2)
ok('no public handle, customer image or training path was used', results.every(result => result.researchOnly && result.publicHandleCreated === false && result.customerImage === false && result.training === false))

const contactFiles = [bodyPath, facePath, ...results.map(result => result.outputPath ? path.join(projectRoot, result.outputPath) : null)].filter(Boolean)
const labels = ['FULL BODY SOURCE', 'MULTI-ANGLE FACE SOURCE', ...results.map(result => `KLEIN RESULT · ${result.accountId.toUpperCase()}`)]
const tiles = []
for (let index = 0; index < contactFiles.length; index += 1) {
	const image = await sharp(contactFiles[index]).resize(384, 320, { fit: 'contain', background: '#151b25' }).png().toBuffer()
	const label = Buffer.from(`<svg width="384" height="28"><rect width="384" height="28" fill="#0b111b"/><text x="8" y="19" fill="#ffffff" font-family="Arial" font-size="13">${labels[index]}</text></svg>`)
	tiles.push(await sharp({ create: { width: 384, height: 348, channels: 4, background: '#0b111b' } }).composite([{ input: image, left: 0, top: 28 }, { input: label, left: 0, top: 0 }]).png().toBuffer())
}
await sharp({ create: { width: 768, height: 696, channels: 4, background: '#0b111b' } })
	.composite(tiles.map((input, index) => ({ input, left: (index % 2) * 384, top: Math.floor(index / 2) * 348 })))
	.png().toFile(path.join(outputRoot, 'private-photofit-research-contact-sheet.png'))

const report = {
	schemaVersion: 'betterpptx.private-modal-photofit-research.v1',
	status: fail === 0 ? 'research-live-pass' : 'research-live-fail',
	scope: { subjectRef: scope.subjectRef, executionClass: 'private_modal_research_job', localSources: ['FullBodyApose.png', 'CompositedFaces.png'], cloudProduction: false, publicEndpointUse: false, persistentCloudStorage: false, modelTraining: false },
	request: { capability: 'multi-reference', width, height, steps, referenceCount: 2, promptDigest: digest(prompt) },
	results, checks: pass, failures: fail, contactSheet: 'betterpptx-mcp/outputs/private-photofit-research-contact-sheet.png',
}
await fs.writeFile(path.join(outputRoot, 'private-photofit-research-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed`)
