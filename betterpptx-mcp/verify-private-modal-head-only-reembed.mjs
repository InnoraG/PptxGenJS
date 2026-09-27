// Research-only head-detail -> full-body re-embed experiment. It directly tests the
// photofit requirement: make a dedicated high-detail head candidate from the face board,
// then apply that candidate back to the corrected full-body portrait. Private Modal only;
// no public handle, production/customer path, persistent cloud storage, or training.
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
const faceBoard = (await fs.readFile(path.join(projectRoot, 'consentedHumanAsset', 'CompositedFaces.png'))).toString('base64')
const outputRoot = path.join(here, 'outputs')
const headWidth = 640
const headHeight = 640
const bodyWidth = 512
const bodyHeight = 848
const steps = 2
const usdPerGpuSecond = 0.000542
const warmCeilingUsd = 0.02
const coldCeilingUsd = 0.10
const timeoutMs = 360000
const headPrompt = 'Research-only high-detail head and shoulders portrait of the same adult subject. Use the multi-angle face board as identity and geometry reference. Preserve the real facial proportions, hairline, hairstyle, skin tone, eye shape, nose, lips and subtle beard stubble. Photorealistic camera detail: natural skin pores, individual hair strands, realistic eyes and soft studio light. Neutral gray background, no stylization, no text, no logos, no watermark, no extra people.'
const reembedPrompt = 'Research-only full-body re-embedding. Reference image 1 is the corrected full-body portrait: preserve its body proportions, A-pose, clothing, hands, shoes, neutral gray background, framing and lighting. Reference image 2 is the dedicated high-detail head candidate of the same person: transfer its facial geometry, hairline, skin pores, eyes, lips and beard texture onto the body while keeping the head naturally connected to the neck. Produce a photorealistic head-to-toe studio portrait. No stylization, no text, no logos, no watermark, no extra people or props.'

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

console.log('PRIVATE MODAL HEAD-ONLY -> FULL-BODY RE-EMBED (consented subject, no production exposure):')
ok('scope is private research-only and forbids training/public production', scope.scope?.privateModalResearchProcessing === true && scope.scope?.cloudProduction === false && scope.scope?.publicEndpointUse === false && scope.scope?.persistentCloudStorage === false && scope.scope?.modelTraining === false)
ok('corrected 512×848 baseline report is complete', baseReport.status === 'research-live-pass' && baseReport.request?.width === bodyWidth && baseReport.request?.height === bodyHeight && baseReport.results?.length === 2)
ok('two private Klein profiles and local face board are available', accounts.length === 2 && faceBoard.length > 1000)

const baselineByAccount = new Map((baseReport.results || []).map(result => [String(result.accountId), result]))
async function post(account, body) {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	try {
		const response = await fetch(String(account.env.BETTERPPTX_MODAL_IMAGE_EDIT_URL), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: String(account.env.BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN), ...body }), signal: controller.signal })
		return { response, payload: await response.json() }
	} finally { clearTimeout(timer) }
}
async function decodeResult(payload, requestedAspect, minHeight) {
	const encoded = String(payload?.image || '')
	if (!encoded) return { buffer: null, meta: null, quality: null }
	let buffer = null
	try { buffer = Buffer.from(encoded, 'base64') } catch { return { buffer: null, meta: null, quality: null } }
	const meta = await sharp(buffer).metadata().catch(() => null)
	const quality = meta ? await evaluateImageQuality(buffer, { aspect: requestedAspect, minWidth: 512, minHeight: minHeight || 512, minEntropy: 1.2, minStdev: 4 }) : null
	return { buffer, meta, quality }
}

const results = []
for (const [index, account] of accounts.entries()) {
	const accountId = String(account.id)
	const baseline = baselineByAccount.get(accountId)
	const baselinePath = baseline?.outputPath ? path.join(projectRoot, baseline.outputPath) : ''
	const baselineBuffer = baselinePath ? await fs.readFile(baselinePath).catch(() => null) : null
	if (!baselineBuffer) {
		results.push({ accountId, status: 'FAIL', error: 'baseline missing', researchOnly: true })
		continue
	}
	const started = Date.now()
	let headResponse = null
	let headPayload = null
	let headDecoded = null
	try {
		const head = await post(account, { capability: 'multi-reference', prompt: headPrompt, images: [faceBoard, baselineBuffer.toString('base64')], width: headWidth, height: headHeight, steps, seed: 10600 + index })
		headResponse = head.response
		headPayload = head.payload
		headDecoded = await decodeResult(headPayload, 'square', headHeight)
	} catch (error) {
		results.push({ accountId, status: 'ERROR', elapsedMs: Date.now() - started, error: String(error?.message || error), researchOnly: true })
		continue
	}
	let reembedResponse = null
	let reembedPayload = null
	let reembedDecoded = null
	try {
		const reembed = await post(account, { capability: 'multi-reference', prompt: reembedPrompt, images: [baselineBuffer.toString('base64'), String(headPayload?.image || '')], width: bodyWidth, height: bodyHeight, steps, seed: 10700 + index })
		reembedResponse = reembed.response
		reembedPayload = reembed.payload
		reembedDecoded = await decodeResult(reembedPayload, 'portrait', bodyHeight)
	} catch (error) {
		results.push({ accountId, status: 'ERROR', elapsedMs: Date.now() - started, error: String(error?.message || error), researchOnly: true })
		continue
	}
	const headBuffer = headDecoded.buffer
	const reembedBuffer = reembedDecoded.buffer
	const headPath = headBuffer ? path.join(outputRoot, `private-head-only-${safeId(accountId)}.png`) : null
	const reembedPath = reembedBuffer ? path.join(outputRoot, `private-head-reembedded-${safeId(accountId)}.png`) : null
	if (headBuffer) await fs.writeFile(headPath, headBuffer)
	if (reembedBuffer) await fs.writeFile(reembedPath, reembedBuffer)
	const gpuSeconds = Number(headPayload?.gpuSeconds || 0) + Number(reembedPayload?.gpuSeconds || 0)
	const gpuCostUsd = gpuSeconds * usdPerGpuSecond
	const reembedDigest = reembedBuffer ? digest(reembedBuffer) : null
	const headDigest = headBuffer ? digest(headBuffer) : null
	results.push({
		accountId, status: headResponse?.ok && reembedResponse?.ok && headDecoded.quality?.status === 'pass' && reembedDecoded.quality?.status === 'pass' ? 'PASS' : 'FAIL',
		elapsedMs: Date.now() - started, headHttpStatus: headResponse?.status, reembedHttpStatus: reembedResponse?.status,
		headWidth: headDecoded.meta?.width || null, headHeight: headDecoded.meta?.height || null, width: reembedDecoded.meta?.width || null, height: reembedDecoded.meta?.height || null,
		gpuSeconds, gpuCostUsd: Math.round(gpuCostUsd * 1e8) / 1e8, coldStart: Boolean(headPayload?.coldStart || reembedPayload?.coldStart),
		gpuType: String(reembedPayload?.gpuType || headPayload?.gpuType || ''), peakAllocatedBytes: Math.max(Number(headPayload?.peakAllocatedBytes || 0), Number(reembedPayload?.peakAllocatedBytes || 0)),
		peakReservedBytes: Math.max(Number(headPayload?.peakReservedBytes || 0), Number(reembedPayload?.peakReservedBytes || 0)), baselineDigest: baseline.outputDigest, headDigest, reembedDigest,
		changed: reembedDigest !== baseline.outputDigest, headQuality: headDecoded.quality ? { status: headDecoded.quality.status, measurements: headDecoded.quality.measurements, blockingIssues: headDecoded.quality.blockingIssues } : null,
		reembedQuality: reembedDecoded.quality ? { status: reembedDecoded.quality.status, measurements: reembedDecoded.quality.measurements, blockingIssues: reembedDecoded.quality.blockingIssues } : null,
		headPath: headBuffer ? `betterpptx-mcp/outputs/private-head-only-${safeId(accountId)}.png` : null,
		reembedPath: reembedBuffer ? `betterpptx-mcp/outputs/private-head-reembedded-${safeId(accountId)}.png` : null,
		researchOnly: true, publicHandleCreated: false, customerImage: false, training: false,
	})
	console.log(`  ${accountId}: head ${headDecoded.meta?.width || 0}×${headDecoded.meta?.height || 0}, re-embed ${reembedDecoded.meta?.width || 0}×${reembedDecoded.meta?.height || 0}`)
}

for (const result of results) {
	const ceiling = result.coldStart ? coldCeilingUsd : warmCeilingUsd
	ok(`${result.accountId}: head-only and re-embedded outputs pass quality geometry`, result.status === 'PASS' && result.headWidth === headWidth && result.headHeight === headHeight && result.width === bodyWidth && result.height === bodyHeight)
	ok(`${result.accountId}: two-stage research GPU cost stays within ceiling`, Number.isFinite(result.gpuCostUsd) && result.gpuCostUsd <= ceiling, `$${Number(result.gpuCostUsd || 0).toFixed(6)}`)
	ok(`${result.accountId}: output changed and peak telemetry is present`, result.changed === true && result.peakAllocatedBytes > 0 && result.peakReservedBytes >= result.peakAllocatedBytes)
}
ok('both private profiles completed the two-stage head-only -> re-embed experiment', results.length === 2 && results.every(result => result.status === 'PASS') && new Set(results.map(result => result.reembedDigest).filter(Boolean)).size === 2)
ok('no public handle, customer image or training path was used', results.every(result => result.researchOnly && result.publicHandleCreated === false && result.customerImage === false && result.training === false))

const files = []
const labels = []
for (const result of results) {
	const baseline = baselineByAccount.get(result.accountId)
	if (baseline?.outputPath && result.headPath && result.reembedPath) {
		files.push(path.join(projectRoot, baseline.outputPath), path.join(projectRoot, result.headPath), path.join(projectRoot, result.reembedPath))
		labels.push(`BASE · ${result.accountId.toUpperCase()}`, `HEAD ONLY · ${result.accountId.toUpperCase()}`, `RE-EMBED · ${result.accountId.toUpperCase()}`)
	}
}
const tiles = []
for (let index = 0; index < files.length; index += 1) {
	const image = await sharp(files[index]).resize(320, 320, { fit: 'contain', background: '#151b25' }).png().toBuffer()
	const label = Buffer.from(`<svg width="320" height="26"><rect width="320" height="26" fill="#0b111b"/><text x="7" y="18" fill="#ffffff" font-family="Arial" font-size="12">${labels[index]}</text></svg>`)
	tiles.push(await sharp({ create: { width: 320, height: 346, channels: 4, background: '#0b111b' } }).composite([{ input: image, left: 0, top: 26 }, { input: label, left: 0, top: 0 }]).png().toBuffer())
}
if (tiles.length) {
	await sharp({ create: { width: 960, height: Math.ceil(tiles.length / 3) * 346, channels: 4, background: '#0b111b' } })
		.composite(tiles.map((input, index) => ({ input, left: (index % 3) * 320, top: Math.floor(index / 3) * 346 })))
		.png().toFile(path.join(outputRoot, 'private-head-only-reembed-contact-sheet.png'))
}

const report = { schemaVersion: 'betterpptx.private-modal-head-only-reembed.v1', status: fail === 0 ? 'research-live-pass' : 'research-live-fail', scope: { subjectRef: scope.subjectRef, executionClass: 'private_modal_research_job', cloudProduction: false, publicEndpointUse: false, persistentCloudStorage: false, modelTraining: false }, request: { head: { capability: 'multi-reference', width: headWidth, height: headHeight, steps }, reembed: { capability: 'multi-reference', width: bodyWidth, height: bodyHeight, steps }, promptDigests: { head: digest(headPrompt), reembed: digest(reembedPrompt) } }, results, checks: pass, failures: fail, contactSheet: 'betterpptx-mcp/outputs/private-head-only-reembed-contact-sheet.png' }
await fs.writeFile(path.join(outputRoot, 'private-head-only-reembed-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed`)
