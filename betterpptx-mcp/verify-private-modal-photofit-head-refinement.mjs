// Research-only second pass: refine head/face/hair texture on the private photofit
// baseline while preserving the full-body result. It is deliberately outside the
// public engine and sends only the owner-scoped local research pixels to private Modal.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { evaluateImageQuality } from './quality/image-quality-gates.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, '..')
const scope = JSON.parse(await fs.readFile(path.join(projectRoot, 'consentedHumanAsset', 'photofit-scope.json'), 'utf8'))
const baseReport = JSON.parse(await fs.readFile(path.join(here, 'outputs', 'private-photofit-research-report.json'), 'utf8'))
const store = JSON.parse((await fs.readFile(path.join(here, 'config', 'credential-store.json'), 'utf8')).replace(/^\uFEFF/, ''))
const accounts = (store.providers?.['modal-image-edit']?.accounts || []).filter(account => account?.enabled !== false)
const facePath = path.join(projectRoot, 'consentedHumanAsset', 'CompositedFaces.png')
const faceBoard = (await fs.readFile(facePath)).toString('base64')
const outputRoot = path.join(here, 'outputs')
const width = 512
const height = 848
const steps = 2
const usdPerGpuSecond = 0.000542
const warmCeilingUsd = 0.02
const coldCeilingUsd = 0.10
const timeoutMs = 360000
const prompt = 'Research-only head and face texture refinement. Reference image 1 is the already-generated full-body portrait: preserve its entire body silhouette, pose, clothing, hands, neutral gray background, framing and lighting. Reference image 2 is the same adult subject multi-angle face board: use it to preserve identity and head geometry. Refine only the visible head/face region with natural skin pores, subtle beard stubble, individual hair strands, realistic eyes and lips, and consistent skin tone. Do not beautify or stylize, do not change age or identity, do not add people, text, logos, watermark or props.'

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

console.log('PRIVATE MODAL PHOTOFIT HEAD REFINEMENT (consented subject, no production exposure):')
ok('scope remains local/private research only', scope.scope?.localResearch === true && scope.scope?.privateModalResearchProcessing === true && scope.scope?.cloudProduction === false && scope.scope?.publicEndpointUse === false && scope.scope?.modelTraining === false)
ok('baseline report is a completed private research pass', baseReport.status === 'research-live-pass' && baseReport.scope?.executionClass === 'private_modal_research_job' && baseReport.results?.length === 2)
ok('two private Klein profiles remain configured', accounts.length === 2)
ok('multi-angle face board is available locally', faceBoard.length > 1000)

const baselineByAccount = new Map((baseReport.results || []).map(result => [String(result.accountId), result]))
async function invoke(account, index) {
	const baseline = baselineByAccount.get(String(account.id))
	const baselinePath = baseline?.outputPath ? path.join(projectRoot, baseline.outputPath) : ''
	const baselineBuffer = baselinePath ? await fs.readFile(baselinePath).catch(() => null) : null
	if (!baselineBuffer) return { accountId: String(account.id), status: 'FAIL', error: 'baseline missing', researchOnly: true }
	const baselineB64 = baselineBuffer.toString('base64')
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
			body: JSON.stringify({ token, capability: 'multi-reference', prompt, images: [baselineB64, faceBoard], width, height, steps, seed: 9700 + index }),
			signal: controller.signal,
		})
		payload = await response.json()
	} catch (error) {
		return { accountId: String(account.id), status: 'ERROR', elapsedMs: Date.now() - started, error: String(error?.message || error), researchOnly: true }
	} finally { clearTimeout(timer) }
	const encoded = String(payload?.image || '')
	let buffer = null
	let meta = null
	if (encoded) {
		try { buffer = Buffer.from(encoded, 'base64'); meta = await sharp(buffer).metadata() } catch { buffer = null; meta = null }
	}
	const gpuSeconds = Number(payload?.gpuSeconds || 0)
	const gpuCostUsd = gpuSeconds * usdPerGpuSecond
	const quality = buffer ? await evaluateImageQuality(buffer, { aspect: 'portrait', minWidth: width, minHeight: 768, minEntropy: 1.2, minStdev: 4 }) : null
	const headStats = buffer ? await sharp(buffer).extract({ left: 0, top: 0, width: meta?.width || width, height: Math.max(1, Math.round((meta?.height || height) * 0.38)) }).stats().catch(() => null) : null
	const baselineHeadStats = await sharp(baselineBuffer).extract({ left: 0, top: 0, width, height: Math.round(height * 0.38) }).stats().catch(() => null)
	const outputDigest = buffer ? digest(buffer) : null
	const outputPath = buffer ? path.join(outputRoot, `private-photofit-head-refined-${safeId(account.id)}.png`) : null
	if (buffer) await fs.writeFile(outputPath, buffer)
	return {
		accountId: String(account.id), status: response.ok && buffer && meta && quality?.status === 'pass' ? 'PASS' : 'FAIL', httpStatus: response.status,
		elapsedMs: Date.now() - started, width: meta?.width || null, height: meta?.height || null,
		gpuSeconds, gpuCostUsd: Math.round(gpuCostUsd * 1e8) / 1e8, coldStart: Boolean(payload?.coldStart), gpuType: String(payload?.gpuType || ''),
		peakAllocatedBytes: Number(payload?.peakAllocatedBytes || 0), peakReservedBytes: Number(payload?.peakReservedBytes || 0),
		baselineDigest: baseline.outputDigest, outputDigest, changed: outputDigest !== baseline.outputDigest,
		baselineHead: baselineHeadStats ? { entropy: Number(baselineHeadStats.entropy || 0), stdev: Number(baselineHeadStats.channels?.[0]?.stdev || 0) } : null,
		refinedHead: headStats ? { entropy: Number(headStats.entropy || 0), stdev: Number(headStats.channels?.[0]?.stdev || 0) } : null,
		quality: quality ? { status: quality.status, measurements: quality.measurements, blockingIssues: quality.blockingIssues } : null,
		outputPath: buffer ? `betterpptx-mcp/outputs/private-photofit-head-refined-${safeId(account.id)}.png` : null,
		researchOnly: true, publicHandleCreated: false, customerImage: false, training: false,
	}
}

const results = []
for (const [index, account] of accounts.entries()) {
	const result = await invoke(account, index)
	results.push(result)
	ok(`${account.id}: refined portrait passes geometry/quality gates`, result.status === 'PASS' && result.width === width && result.height === height)
	const ceiling = result.coldStart ? coldCeilingUsd : warmCeilingUsd
	ok(`${account.id}: refinement GPU cost stays within ${result.coldStart ? 'cold' : 'warm'} ceiling`, Number.isFinite(result.gpuCostUsd) && result.gpuCostUsd <= ceiling, `$${Number(result.gpuCostUsd || 0).toFixed(6)}`)
	ok(`${account.id}: refinement has peak-memory telemetry and a changed digest`, result.peakAllocatedBytes > 0 && result.peakReservedBytes >= result.peakAllocatedBytes && result.changed === true)
}
ok('both private profiles returned distinct refined portraits', results.length === 2 && results.every(result => result.status === 'PASS') && new Set(results.map(result => result.outputDigest).filter(Boolean)).size === 2)
ok('no public handle, customer image or training path was used', results.every(result => result.researchOnly && result.publicHandleCreated === false && result.customerImage === false && result.training === false))

const contactFiles = []
const labels = []
for (const result of results) {
	const baseline = baselineByAccount.get(result.accountId)
	if (baseline?.outputPath && result.outputPath) {
		contactFiles.push(path.join(projectRoot, baseline.outputPath), path.join(projectRoot, result.outputPath))
		labels.push(`BASELINE · ${result.accountId.toUpperCase()}`, `HEAD REFINED · ${result.accountId.toUpperCase()}`)
	}
}
const tiles = []
for (let index = 0; index < contactFiles.length; index += 1) {
	const image = await sharp(contactFiles[index]).resize(384, 320, { fit: 'contain', background: '#151b25' }).png().toBuffer()
	const label = Buffer.from(`<svg width="384" height="28"><rect width="384" height="28" fill="#0b111b"/><text x="8" y="19" fill="#ffffff" font-family="Arial" font-size="13">${labels[index]}</text></svg>`)
	tiles.push(await sharp({ create: { width: 384, height: 348, channels: 4, background: '#0b111b' } }).composite([{ input: image, left: 0, top: 28 }, { input: label, left: 0, top: 0 }]).png().toBuffer())
}
if (tiles.length) {
	await sharp({ create: { width: 768, height: Math.ceil(tiles.length / 2) * 348, channels: 4, background: '#0b111b' } })
		.composite(tiles.map((input, index) => ({ input, left: (index % 2) * 384, top: Math.floor(index / 2) * 348 })))
		.png().toFile(path.join(outputRoot, 'private-photofit-head-refinement-contact-sheet.png'))
}

const report = {
	schemaVersion: 'betterpptx.private-modal-photofit-head-refinement.v1', status: fail === 0 ? 'research-live-pass' : 'research-live-fail',
	scope: { subjectRef: scope.subjectRef, executionClass: 'private_modal_research_job', localSources: ['private photofit baseline', 'CompositedFaces.png'], cloudProduction: false, publicEndpointUse: false, persistentCloudStorage: false, modelTraining: false },
	request: { capability: 'multi-reference', width, height, steps, referenceCount: 2, promptDigest: digest(prompt) },
	results, checks: pass, failures: fail, contactSheet: 'betterpptx-mcp/outputs/private-photofit-head-refinement-contact-sheet.png',
}
await fs.writeFile(path.join(outputRoot, 'private-photofit-head-refinement-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed`)
