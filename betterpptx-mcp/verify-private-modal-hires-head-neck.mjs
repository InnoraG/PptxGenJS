// Research-only higher-resolution head/neck comparison. The existing 512×848
// experiment proved the two-stage direction but left too few pixels around the
// face in a full-body slide. This verifier repeats the path at 768×1280 with a
// dedicated 768² head pass, then measures/render-packages the result. Consent
// scope is enforced; no public handle, production/customer path, persistence or
// training is allowed.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { evaluateImageQuality } from './quality/image-quality-gates.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, '..')
const outputRoot = path.join(here, 'outputs')
const scope = JSON.parse(await fs.readFile(path.join(projectRoot, 'consentedHumanAsset', 'photofit-scope.json'), 'utf8'))
const store = JSON.parse((await fs.readFile(path.join(here, 'config', 'credential-store.json'), 'utf8')).replace(/^\uFEFF/, ''))
const requestedAccountId = String(process.env.BETTERPPTX_HIRES_ACCOUNT_ID || '').trim()
const accounts = (store.providers?.['modal-image-edit']?.accounts || []).filter(account => account?.enabled !== false && (!requestedAccountId || String(account.id) === requestedAccountId))
const faceBoard = (await fs.readFile(path.join(projectRoot, 'consentedHumanAsset', 'CompositedFaces.png'))).toString('base64')
const bodySource = (await fs.readFile(path.join(projectRoot, 'consentedHumanAsset', 'FullBodyApose.png'))).toString('base64')
// 640×1024 is the next safe ladder rung above the 512×848 canary. The worker
// supports 1536 edges, but the first 768×1280/4-step probe exceeded the private
// request timeout on both rotating profiles; keep that failure as evidence of a
// capacity boundary rather than silently retrying an unbounded job.
const width = Number(process.env.BETTERPPTX_HIRES_WIDTH || 640)
const height = Number(process.env.BETTERPPTX_HIRES_HEIGHT || 1024)
const headWidth = Number(process.env.BETTERPPTX_HIRES_HEAD_WIDTH || width)
const headHeight = Number(process.env.BETTERPPTX_HIRES_HEAD_HEIGHT || headWidth)
const steps = Number(process.env.BETTERPPTX_HIRES_STEPS || 2)
const usdPerGpuSecond = 0.000542
const perStageColdCeilingUsd = 0.10
const totalCeilingUsd = 0.60
const timeoutMs = 420000
const outputPrefix = String(process.env.BETTERPPTX_HIRES_OUTPUT_PREFIX || `private-hires-head-neck${requestedAccountId ? `-${requestedAccountId.replace(/[^a-z0-9_-]/gi, '_')}` : ''}`)

const baselinePrompt = 'Research-only ONE SINGLE photorealistic full-body studio photograph of the same adult subject. Reference image 1 is the consented full-body A-pose: preserve body proportions, clothing, hands, shoes, pose, neutral gray background and framing. Reference image 2 is the same subject multi-angle face board and is identity reference only. Produce one person, one body and one face in one continuous photograph; never reproduce the face board, side-profile thumbnails, ghost overlays, reference panels, contact sheets, collage tiles, multiple views or duplicate faces. Use natural camera optics, realistic skin pores, fine hair strands, fabric weave and physically consistent soft studio lighting. Head-to-toe visible, anatomically natural, no stylization, no illustration, no CGI, no text, no numbers, no logos, no watermark, no extra people or props.'
const headPrompt = 'Research-only ONE SINGLE centered head-and-shoulders photograph of the same adult subject. Use the multi-angle face board only as the identity and geometry reference and the full-body reference only for clothing/lighting continuity. Output one person and one face in one continuous image, not a contact sheet, not a collage, not a grid, not multiple views, not repeated heads, not a full-body scene. Preserve real facial proportions, hairline, hairstyle, skin tone, eye shape, nose, lips, ears and subtle beard stubble. Maximize photographic texture: natural pores, fine hair strands, realistic eyes and lips, coherent skin micro-contrast and soft studio light. Neutral gray background, no beautification, no stylization, no illustration, no CGI, no text, no numbers, no logos, no watermark, no extra people.'
const reembedPrompt = 'Research-only ONE SINGLE photorealistic high-resolution full-body re-embedding. Reference image 1 is the same subject full-body portrait: preserve the entire body silhouette, A-pose, clothing, hands, shoes, neutral gray background, camera framing and lighting. Reference image 2 is a dedicated high-detail head portrait of the same person: transfer its facial geometry, hairline, pores, eyes, lips, ears and beard texture to the visible head. Keep the head anatomically connected to the original neck and shoulders with a natural jaw-to-neck transition, matching skin tone, shadow direction, scale and perspective. Produce one person and one continuous photograph only; never reproduce either reference as a panel, thumbnail, ghost overlay, contact sheet, collage, grid, multiple view or duplicate face. Preserve identity; do not average or invent a different face. No stylization, illustration, CGI, text, numbers, logos, watermark, extra people or props.'

let pass = 0
let fail = 0
const checks = []
const ok = (name, condition, detail = '') => {
  if (condition) pass += 1
  else fail += 1
  checks.push({ name, status: condition ? 'PASS' : 'FAIL', detail })
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const safeId = value => String(value).replace(/[^a-z0-9_-]/gi, '_')
const decode = async (payload, aspect, minWidth, minHeight) => {
  const encoded = String(payload?.image || '')
  if (!encoded) return { buffer: null, meta: null, quality: null }
  const buffer = Buffer.from(encoded, 'base64')
  const meta = await sharp(buffer).metadata().catch(() => null)
  const quality = meta ? await evaluateImageQuality(buffer, { aspect, minWidth, minHeight, minEntropy: 1.2, minStdev: 4 }) : null
  return { buffer, meta, quality }
}
async function post(account, body) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(String(account.env.BETTERPPTX_MODAL_IMAGE_EDIT_URL), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: String(account.env.BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN), ...body }), signal: controller.signal,
    })
    return { response, payload: await response.json() }
  } finally { clearTimeout(timer) }
}

console.log('PRIVATE MODAL HI-RES HEAD/NECK COMPARISON (consented subject, no production exposure):')
ok('scope forbids public/customer/production/training use', scope.scope?.privateModalResearchProcessing === true && scope.scope?.cloudProduction === false && scope.scope?.publicEndpointUse === false && scope.scope?.persistentCloudStorage === false && scope.scope?.modelTraining === false)
ok('requested private profile(s) and both local references are available', accounts.length >= 1 && (!requestedAccountId || accounts.length === 1) && faceBoard.length > 1000 && bodySource.length > 1000)
ok('hi-res request stays inside worker limits', width <= 1536 && height <= 1536 && headWidth <= 1536 && headHeight <= 1536 && width % 16 === 0 && height % 16 === 0)

const results = []
for (const [index, account] of accounts.entries()) {
  const accountId = String(account.id)
  const started = Date.now()
  let baselinePayload = null
  let headPayload = null
  let reembedPayload = null
  let baselineResponse = null
  let headResponse = null
  let reembedResponse = null
  try {
    const baseline = await post(account, { capability: 'multi-reference', prompt: baselinePrompt, images: [bodySource, faceBoard], width, height, steps, seed: 11800 + index })
    baselineResponse = baseline.response
    baselinePayload = baseline.payload
    const baselineDecoded = await decode(baselinePayload, 'portrait', width, height)
    if (baselineDecoded.quality?.status !== 'pass') throw new Error(`hi-res baseline quality ${baselineDecoded.quality?.status || 'missing'}`)
    const head = await post(account, { capability: 'multi-reference', prompt: headPrompt, images: [faceBoard, String(baselinePayload?.image || '')], width: headWidth, height: headHeight, steps, seed: 11900 + index })
    headResponse = head.response
    headPayload = head.payload
    const headDecoded = await decode(headPayload, 'square', headWidth, headHeight)
    if (headDecoded.quality?.status !== 'pass') throw new Error(`hi-res head quality ${headDecoded.quality?.status || 'missing'}`)
    const reembed = await post(account, { capability: 'multi-reference', prompt: reembedPrompt, images: [String(baselinePayload?.image || ''), String(headPayload?.image || '')], width, height, steps, seed: 12000 + index })
    reembedResponse = reembed.response
    reembedPayload = reembed.payload
    const reembedDecoded = await decode(reembedPayload, 'portrait', width, height)
    if (reembedDecoded.quality?.status !== 'pass') throw new Error(`hi-res re-embed quality ${reembedDecoded.quality?.status || 'missing'}`)
    const baselinePath = path.join(outputRoot, `${outputPrefix}-baseline-${safeId(accountId)}.png`)
    const headPath = path.join(outputRoot, `${outputPrefix}-head-${safeId(accountId)}.png`)
    const reembedPath = path.join(outputRoot, `${outputPrefix}-reembed-${safeId(accountId)}.png`)
    await fs.writeFile(baselinePath, baselineDecoded.buffer)
    await fs.writeFile(headPath, headDecoded.buffer)
    await fs.writeFile(reembedPath, reembedDecoded.buffer)
    const stages = [baselinePayload, headPayload, reembedPayload]
    const gpuSeconds = stages.reduce((sum, item) => sum + Number(item?.gpuSeconds || 0), 0)
    const gpuCostUsd = Math.round(gpuSeconds * usdPerGpuSecond * 1e8) / 1e8
    const peakAllocatedBytes = Math.max(...stages.map(item => Number(item?.peakAllocatedBytes || 0)))
    const peakReservedBytes = Math.max(...stages.map(item => Number(item?.peakReservedBytes || 0)))
    results.push({ accountId, status: 'PASS', elapsedMs: Date.now() - started, stageHttpStatuses: [baselineResponse?.status, headResponse?.status, reembedResponse?.status], dimensions: { baseline: [width, height], head: [headWidth, headHeight], reembed: [width, height] }, gpuSeconds, gpuCostUsd, peakAllocatedBytes, peakReservedBytes, coldStart: stages.some(item => Boolean(item?.coldStart)), baselineDigest: digest(baselineDecoded.buffer), headDigest: digest(headDecoded.buffer), reembedDigest: digest(reembedDecoded.buffer), outputPaths: { baseline: `betterpptx-mcp/outputs/${path.basename(baselinePath)}`, head: `betterpptx-mcp/outputs/${path.basename(headPath)}`, reembed: `betterpptx-mcp/outputs/${path.basename(reembedPath)}` }, qualities: { baseline: baselineDecoded.quality.measurements, head: headDecoded.quality.measurements, reembed: reembedDecoded.quality.measurements }, researchOnly: true, customerImage: false, publicHandleCreated: false, training: false })
    console.log(`  ${accountId}: 3 stages ${width}×${height}/${headWidth}², $${gpuCostUsd.toFixed(6)}`)
  } catch (error) {
    results.push({ accountId, status: 'ERROR', elapsedMs: Date.now() - started, error: String(error?.message || error), stageHttpStatuses: [baselineResponse?.status, headResponse?.status, reembedResponse?.status], researchOnly: true })
    console.error(`  ${accountId}: ${error?.message || error}`)
  }
}

for (const result of results) {
  const costOk = Number.isFinite(result.gpuCostUsd) && result.gpuCostUsd <= totalCeilingUsd && (!result.coldStart || result.gpuCostUsd <= totalCeilingUsd)
  ok(`${result.accountId}: all three hi-res stages pass dimensions/quality`, result.status === 'PASS' && result.dimensions?.baseline?.[0] === width && result.dimensions?.baseline?.[1] === height && result.dimensions?.head?.[0] === headWidth && result.dimensions?.head?.[1] === headHeight && result.dimensions?.reembed?.[0] === width && result.dimensions?.reembed?.[1] === height)
  ok(`${result.accountId}: hi-res three-stage GPU cost stays bounded`, costOk, `$${Number(result.gpuCostUsd || 0).toFixed(6)}`)
  ok(`${result.accountId}: hi-res peak telemetry is present`, result.peakAllocatedBytes > 0 && result.peakReservedBytes >= result.peakAllocatedBytes)
  ok(`${result.accountId}: every stage is private and no training path exists`, result.researchOnly === true && result.customerImage === false && result.publicHandleCreated === false && result.training === false)
}
const totalGpuCost = results.reduce((sum, result) => sum + Number(result.gpuCostUsd || 0), 0)
ok(`${accounts.length} requested private profile(s) completed the hi-res head/neck path`, results.length === accounts.length && results.every(result => result.status === 'PASS'))
ok('total hi-res research spend stays within the explicit ceiling', totalGpuCost <= totalCeilingUsd, `$${totalGpuCost.toFixed(6)}`)

const tileWidth = 360
const tileHeight = 540
const tiles = []
for (const result of results) {
  for (const kind of ['baseline', 'head', 'reembed']) {
    if (!result.outputPaths?.[kind]) continue
    const file = path.join(projectRoot, result.outputPaths[kind])
    const image = await sharp(file).resize(tileWidth, tileHeight, { fit: 'contain', background: '#151b25' }).png().toBuffer()
    const label = Buffer.from(`<svg width="${tileWidth}" height="28"><rect width="${tileWidth}" height="28" fill="#0b111b"/><text x="8" y="19" fill="#ffffff" font-family="Arial" font-size="12">${safeId(result.accountId).toUpperCase()} · ${kind.toUpperCase()}</text></svg>`)
    tiles.push(await sharp({ create: { width: tileWidth, height: tileHeight + 28, channels: 4, background: '#0b111b' } }).composite([{ input: label, left: 0, top: 0 }, { input: image, left: 0, top: 28 }]).png().toBuffer())
  }
}
if (tiles.length) await sharp({ create: { width: tileWidth * 3, height: Math.ceil(tiles.length / 3) * (tileHeight + 28), channels: 4, background: '#0b111b' } }).composite(tiles.map((input, index) => ({ input, left: (index % 3) * tileWidth, top: Math.floor(index / 3) * (tileHeight + 28) }))).png().toFile(path.join(outputRoot, `${outputPrefix}-contact-sheet.png`))

const report = { schemaVersion: 'betterpptx.private-modal-hires-head-neck.v1', status: fail === 0 ? 'research-live-pass' : 'research-live-fail', scope: { subjectRef: scope.subjectRef, executionClass: 'private_modal_research_job', cloudProduction: false, publicEndpointUse: false, persistentCloudStorage: false, modelTraining: false }, request: { requestedAccountId: requestedAccountId || null, baseline: { capability: 'multi-reference', width, height, steps, promptDigest: digest(baselinePrompt) }, head: { capability: 'multi-reference', width: headWidth, height: headHeight, steps, promptDigest: digest(headPrompt) }, reembed: { capability: 'multi-reference', width, height, steps, promptDigest: digest(reembedPrompt) }, profiles: accounts.map(account => account.id), totalCeilingUsd }, results, totalGpuCostUsd: totalGpuCost, checks: pass, failures: fail, contactSheet: `betterpptx-mcp/outputs/${outputPrefix}-contact-sheet.png` }
await fs.writeFile(path.join(outputRoot, `${outputPrefix}-report.json`), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed`)
