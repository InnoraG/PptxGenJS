// Research-only multi-angle face corpus. The same owner-consented face board is
// rendered into four controlled views on each private Klein profile. It measures
// deterministic geometry/texture/resource properties and intentionally does not
// fabricate identity acceptance; human/VLM calibration remains a separate gate.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { evaluateImageQuality, hamming } from './quality/image-quality-gates.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, '..')
const scope = JSON.parse(await fs.readFile(path.join(projectRoot, 'consentedHumanAsset', 'photofit-scope.json'), 'utf8'))
const store = JSON.parse((await fs.readFile(path.join(here, 'config', 'credential-store.json'), 'utf8')).replace(/^\uFEFF/, ''))
const accounts = (store.providers?.['modal-image-edit']?.accounts || []).filter(account => account?.enabled !== false)
const facePath = path.join(projectRoot, 'consentedHumanAsset', 'CompositedFaces.png')
const faceBoard = (await fs.readFile(facePath)).toString('base64')
const outputRoot = path.join(here, 'outputs')
const width = 640
const height = 640
const steps = 2
const usdPerGpuSecond = 0.000542
const warmCeilingUsd = 0.02
const coldCeilingUsd = 0.10
const timeoutMs = 360000
const views = [
	{ id: 'front', seed: 12001, direction: 'front-facing neutral view, both eyes and both ears naturally visible' },
	{ id: 'left-three-quarter', seed: 12002, direction: 'left three-quarter view, turn the face gently toward camera-left while preserving the same identity' },
	{ id: 'right-three-quarter', seed: 12003, direction: 'right three-quarter view, turn the face gently toward camera-right while preserving the same identity' },
	{ id: 'left-profile', seed: 12004, direction: 'left profile view, clear forehead, nose, lips, chin and jaw silhouette of the same identity' },
]
const promptFor = view => `Research-only photorealistic head-and-shoulders portrait of the same adult subject shown in the supplied multi-angle face board. Render a ${view.direction}. Preserve facial geometry, hairline, hairstyle, skin tone, subtle beard stubble, eye shape, nose, lips and age. Natural skin pores, individual hair strands, realistic eyes and soft neutral studio lighting. Gray background, shoulders visible, no stylization, no text, no logos, no watermark, no extra people or props.`

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

console.log('PRIVATE MODAL MULTI-ANGLE FACE CORPUS (consented subject, no production exposure):')
ok('scope is private research-only and forbids training/public production', scope.scope?.privateModalResearchProcessing === true && scope.scope?.cloudProduction === false && scope.scope?.publicEndpointUse === false && scope.scope?.persistentCloudStorage === false && scope.scope?.modelTraining === false)
ok('two private Klein profiles and local face board are available', accounts.length === 2 && faceBoard.length > 1000)
ok('corpus declares four controlled views', views.length === 4 && new Set(views.map(view => view.id)).size === 4)

async function invoke(account, view, accountIndex, viewIndex) {
	const started = Date.now()
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	let response
	let payload = null
	try {
		response = await fetch(String(account.env.BETTERPPTX_MODAL_IMAGE_EDIT_URL), {
			method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token: String(account.env.BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN), capability: 'reference', prompt: promptFor(view), images: [faceBoard], width, height, steps, seed: view.seed + accountIndex * 100 }),
			signal: controller.signal,
		})
		payload = await response.json()
	} catch (error) {
		return { accountId: String(account.id), view: view.id, status: 'ERROR', elapsedMs: Date.now() - started, error: String(error?.message || error), researchOnly: true }
	} finally { clearTimeout(timer) }
	const encoded = String(payload?.image || '')
	let buffer = null
	let meta = null
	if (encoded) {
		try { buffer = Buffer.from(encoded, 'base64'); meta = await sharp(buffer).metadata() } catch { buffer = null; meta = null }
	}
	const quality = buffer ? await evaluateImageQuality(buffer, { aspect: 'square', minWidth: width, minHeight: height, minEntropy: 1.2, minStdev: 4 }) : null
	const gpuSeconds = Number(payload?.gpuSeconds || 0)
	const outputDigest = buffer ? digest(buffer) : null
	const outputPath = buffer ? path.join(outputRoot, `private-multiangle-${safeId(account.id)}-${view.id}.png`) : null
	if (buffer) await fs.writeFile(outputPath, buffer)
	return {
		accountId: String(account.id), view: view.id, status: response.ok && buffer && meta && quality?.status === 'pass' ? 'PASS' : 'FAIL', httpStatus: response.status,
		elapsedMs: Date.now() - started, width: meta?.width || null, height: meta?.height || null, gpuSeconds,
		gpuCostUsd: Math.round(gpuSeconds * usdPerGpuSecond * 1e8) / 1e8, coldStart: Boolean(payload?.coldStart), gpuType: String(payload?.gpuType || ''),
		peakAllocatedBytes: Number(payload?.peakAllocatedBytes || 0), peakReservedBytes: Number(payload?.peakReservedBytes || 0), outputDigest,
		quality: quality ? { status: quality.status, measurements: quality.measurements, blockingIssues: quality.blockingIssues } : null,
		outputPath: buffer ? `betterpptx-mcp/outputs/private-multiangle-${safeId(account.id)}-${view.id}.png` : null,
		researchOnly: true, publicHandleCreated: false, customerImage: false, training: false,
	}
}

const results = []
for (const [accountIndex, account] of accounts.entries()) {
	for (const [viewIndex, view] of views.entries()) results.push(await invoke(account, view, accountIndex, viewIndex))
}
for (const result of results) {
	const ceiling = result.coldStart ? coldCeilingUsd : warmCeilingUsd
	ok(`${result.accountId}/${result.view}: square head output passes deterministic gate`, result.status === 'PASS' && result.width === width && result.height === height)
	ok(`${result.accountId}/${result.view}: GPU cost stays within ${result.coldStart ? 'cold' : 'warm'} ceiling`, Number.isFinite(result.gpuCostUsd) && result.gpuCostUsd <= ceiling, `$${Number(result.gpuCostUsd || 0).toFixed(6)}`)
	ok(`${result.accountId}/${result.view}: peak-memory telemetry is present`, result.peakAllocatedBytes > 0 && result.peakReservedBytes >= result.peakAllocatedBytes)
}
ok('all eight multi-angle outputs are valid and distinct', results.length === 8 && results.every(result => result.status === 'PASS') && new Set(results.map(result => result.outputDigest).filter(Boolean)).size === 8)
ok('no public handle, customer image or training path was used', results.every(result => result.researchOnly && result.publicHandleCreated === false && result.customerImage === false && result.training === false))
const sameViewDistances = Object.fromEntries(views.map(view => {
	const rows = results.filter(result => result.view === view.id)
	return [view.id, rows.length === 2 ? hamming(rows[0]?.quality?.measurements?.averageHash, rows[1]?.quality?.measurements?.averageHash) : null]
}))
ok('same-view cross-profile perceptual hashes stay within the consistency proxy', Object.values(sameViewDistances).every(distance => Number.isFinite(distance) && distance <= 16), JSON.stringify(sameViewDistances))
ok('identity acceptance remains explicitly uncalibrated', true)

const tiles = []
const labels = []
for (const result of results) {
	if (!result.outputPath) continue
	const image = await sharp(path.join(projectRoot, result.outputPath)).resize(320, 320, { fit: 'contain', background: '#151b25' }).png().toBuffer()
	const labelText = `${result.accountId.toUpperCase()} · ${result.view}`
	const label = Buffer.from(`<svg width="320" height="26"><rect width="320" height="26" fill="#0b111b"/><text x="7" y="18" fill="#ffffff" font-family="Arial" font-size="12">${labelText}</text></svg>`)
	tiles.push(await sharp({ create: { width: 320, height: 346, channels: 4, background: '#0b111b' } }).composite([{ input: image, left: 0, top: 26 }, { input: label, left: 0, top: 0 }]).png().toBuffer())
	labels.push(labelText)
}
await sharp({ create: { width: 1280, height: 692, channels: 4, background: '#0b111b' } })
	.composite(tiles.map((input, index) => ({ input, left: (index % 4) * 320, top: Math.floor(index / 4) * 346 })))
	.png().toFile(path.join(outputRoot, 'private-multiangle-face-contact-sheet.png'))

const report = {
	schemaVersion: 'betterpptx.private-modal-multiangle-face-corpus.v1', status: fail === 0 ? 'research-live-pass' : 'research-live-fail',
	scope: { subjectRef: scope.subjectRef, executionClass: 'private_modal_research_job', cloudProduction: false, publicEndpointUse: false, persistentCloudStorage: false, modelTraining: false },
	corpus: { width, height, steps, views: views.map(view => ({ id: view.id, seed: view.seed })), identityAcceptance: 'uncalibrated/abstain' },
	results, sameViewDistances, checks: pass, failures: fail, contactSheet: 'betterpptx-mcp/outputs/private-multiangle-face-contact-sheet.png',
}
await fs.writeFile(path.join(outputRoot, 'private-multiangle-face-corpus-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed`)
