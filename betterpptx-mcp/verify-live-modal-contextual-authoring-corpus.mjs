// Live contextual image-authoring corpus: topic/design-aligned creation followed by bounded
// reference editing. It uses the public capability router, owned synthetic input only, and stays
// outside the deterministic release suite because it performs real Modal GPU work.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { generateImage } from './assets/image-gen-providers.mjs'
import { evaluateImageQuality } from './quality/image-quality-gates.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const cases = [
  { id: 'workflow-convergence', message: 'Fragmented workflows converge into one controlled operating core.', world: 'dark editorial technology studio', style: 'deep navy, cyan and warm amber, tactile paper, restrained geometric forms', prompt: 'A premium conceptual presentation visual about fragmented workflows converging into one controlled operating core. Use one dominant connected circular system on the right, generous calm copy space on the left, deep navy and warm amber, tactile paper texture, subtle cyan accents, clean editorial hierarchy, no readable text, letters, numbers, logos or watermark.' },
  { id: 'energy-transition', message: 'Legacy energy pathways become a resilient clean network.', world: 'optimistic daylight infrastructure editorial', style: 'mineral blue, solar gold and leaf green, matte paper, soft atmospheric depth', prompt: 'A premium conceptual presentation visual about legacy energy pathways becoming a resilient clean network. Place a luminous connected energy structure on the right, leave the left third quiet for copy, mineral blue, solar gold and leaf green, matte paper texture, optimistic daylight, no readable text, letters, numbers, logos or watermark.' },
  { id: 'trust-by-design', message: 'Trust is designed into every data exchange.', world: 'quiet security editorial', style: 'charcoal, cobalt and muted silver, fine grain, precise light, restrained contrast', prompt: 'A premium conceptual presentation visual about trust designed into every data exchange. Use a precise protected data network focal form on the right and quiet charcoal space on the left for copy, cobalt and muted silver, fine grain, controlled studio light, no readable text, letters, numbers, logos or watermark.' },
  { id: 'human-learning', message: 'Learning becomes a connected, human-centered journey.', world: 'warm contemporary education editorial', style: 'ivory, coral, indigo and soft ochre, tactile cut-paper depth, gentle light', prompt: 'A premium conceptual presentation visual about learning becoming a connected human-centered journey. Use a warm abstract constellation of paths and nodes on the right, preserve open ivory space on the left for copy, coral, indigo and soft ochre, tactile cut-paper depth, gentle light, no readable text, letters, numbers, logos or watermark.' },
]
const width = 1280
const height = 768
const steps = 2
const usdPerGpuSecond = 0.000542
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const safeId = value => String(value).replace(/[^a-z0-9_-]/gi, '_')
let pass = 0
let fail = 0
const checks = []
const ok = (name, condition, detail = '') => { checks.push({ name, status: condition ? 'PASS' : 'FAIL', detail }); if (condition) pass += 1; else fail += 1; console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`) }
const decode = async result => {
  const buffer = Buffer.from(String(result?.base64 || ''), 'base64')
  const meta = await sharp(buffer).metadata().catch(() => null)
  // The hosted workers return the requested 1280×768 canvas (5:3), while the
  // generic landscape gate models a 16:9 target. Keep the exact pixel check
  // below and allow this documented 6.25% aspect deviation at the quality
  // gate boundary.
  const quality = meta ? await evaluateImageQuality(buffer, { aspect: 'landscape', aspectTolerance: 0.07, minWidth: width, minHeight: height, minEntropy: 1.0, minStdev: 3 }) : null
  return { buffer, meta, quality }
}

console.log('LIVE MODAL CONTEXTUAL AUTHORING CORPUS (synthetic-only):')
ok('corpus contains four distinct topic/design briefs', cases.length === 4 && new Set(cases.map(item => item.id)).size === 4)
ok('all briefs declare message, World, style and copy-safe composition intent', cases.every(item => item.message && item.world && item.style && /left/.test(item.prompt)))
ok('no human/customer or identity-sensitive input is present', !JSON.stringify(cases).match(/consentedHumanAsset|customer|face|identity|person/i))

const results = []
for (const item of cases) {
  const created = await generateImage({ provider: 'modal', capability: 'create', prompt: item.prompt, style: item.style, aspect: 'landscape', steps })
  const createDecoded = await decode(created)
  const createPath = path.join(outputRoot, `contextual-corpus-${safeId(item.id)}-create.png`)
  await fs.writeFile(createPath, createDecoded.buffer)
  const editPrompt = `Preserve the composition and focal-side layout of this presentation visual while improving material realism, edge quality and lighting coherence for the same brief: ${item.message}. World: ${item.world}. Style: ${item.style}. Keep the right focal area, quiet left copy space and no readable text, letters, numbers, logos or watermark.`
  const edited = await generateImage({ provider: 'modal-edit', capability: 'reference', prompt: editPrompt, style: item.style, aspect: 'landscape', steps, referenceImages: [created.dataUri] })
  const editDecoded = await decode(edited)
  const editPath = path.join(outputRoot, `contextual-corpus-${safeId(item.id)}-edit.png`)
  await fs.writeFile(editPath, editDecoded.buffer)
  const createCost = Number(created.gpuSeconds || 0) * usdPerGpuSecond
  const editCost = Number(edited.gpuSeconds || 0) * usdPerGpuSecond
  const result = { id: item.id, message: item.message, world: item.world, style: item.style, create: { status: createDecoded.quality?.status === 'pass' ? 'PASS' : 'FAIL', width: createDecoded.meta?.width, height: createDecoded.meta?.height, provider: created.provider, model: created.model, capability: created.capability, gpuSeconds: created.gpuSeconds, gpuCostUsd: Math.round(createCost * 1e8) / 1e8, gpuType: created.gpuType, coldStart: created.coldStart, attempts: Number(created.attempts || 0), handle: created.handle, promptHash: created.promptHash, digest: digest(createDecoded.buffer), outputPath: `betterpptx-mcp/outputs/${path.basename(createPath)}`, quality: createDecoded.quality?.measurements }, edit: { status: editDecoded.quality?.status === 'pass' ? 'PASS' : 'FAIL', width: editDecoded.meta?.width, height: editDecoded.meta?.height, provider: edited.provider, model: edited.model, capability: edited.capability, gpuSeconds: edited.gpuSeconds, gpuCostUsd: Math.round(editCost * 1e8) / 1e8, gpuType: edited.gpuType, coldStart: edited.coldStart, attempts: Number(edited.attempts || 0), handle: edited.handle, promptHash: edited.promptHash, digest: digest(editDecoded.buffer), outputPath: `betterpptx-mcp/outputs/${path.basename(editPath)}`, quality: editDecoded.quality?.measurements }, customerImage: false, consentedHumanImage: false, training: false }
  results.push(result)
  ok(`${item.id}: create and edit are valid ${width}×${height} photographs`, result.create.status === 'PASS' && result.edit.status === 'PASS' && result.create.width === width && result.edit.width === width)
  ok(`${item.id}: routed through audited Schnell then Klein capabilities`, result.create.capability === 'create' && result.edit.capability === 'reference' && /FLUX\.1|schnell/i.test(result.create.model || '') && /Klein|klein/i.test(result.edit.model || ''))
  ok(`${item.id}: creation/edit GPU cost stays within bounded research ceiling`, createCost <= 0.10 && editCost <= 0.10, `$${(createCost + editCost).toFixed(6)}`)
}
ok('all eight contextual creation/edit calls succeeded', results.length === cases.length && results.every(item => item.create.status === 'PASS' && item.edit.status === 'PASS'))
ok('all accepted outputs expose bounded call-attempt telemetry', results.every(item => Number(item.create.attempts) >= 1 && Number(item.edit.attempts) >= 1))
ok('each topic has distinct creation and edit digests', results.every(item => item.create.digest !== item.edit.digest) && new Set(results.map(item => item.create.digest)).size === cases.length)
ok('all outputs remain private synthetic research artifacts', results.every(item => item.customerImage === false && item.consentedHumanImage === false && item.training === false))

const tiles = []
for (const item of results) for (const lane of ['create', 'edit']) {
  const file = path.join(outputRoot, path.basename(results.find(result => result.id === item.id)[lane].outputPath))
  const image = await sharp(file).resize(400, 240, { fit: 'fill' }).png().toBuffer()
  const label = Buffer.from(`<svg width="400" height="26"><rect width="400" height="26" fill="#08101b"/><text x="7" y="18" fill="#fff" font-family="Arial" font-size="11">${safeId(item.id).toUpperCase()} · ${lane.toUpperCase()}</text></svg>`)
  tiles.push(await sharp({ create: { width: 400, height: 266, channels: 4, background: '#08101b' } }).composite([{ input: label, left: 0, top: 0 }, { input: image, left: 0, top: 26 }]).png().toBuffer())
}
await sharp({ create: { width: 800, height: Math.ceil(tiles.length / 2) * 266, channels: 4, background: '#08101b' } }).composite(tiles.map((input, index) => ({ input, left: (index % 2) * 400, top: Math.floor(index / 2) * 266 }))).png().toFile(path.join(outputRoot, 'contextual-authoring-corpus-contact-sheet.png'))
ok('contextual corpus contact sheet is written', (await fs.stat(path.join(outputRoot, 'contextual-authoring-corpus-contact-sheet.png'))).size > 1000)

const totalGpuCostUsd = results.reduce((sum, item) => sum + Number(item.create.gpuCostUsd || 0) + Number(item.edit.gpuCostUsd || 0), 0)
const acceptedCallAttempts = results.flatMap(item => [Number(item.create.attempts || 0), Number(item.edit.attempts || 0)])
const sortedAttempts = [...acceptedCallAttempts].sort((a, b) => a - b)
const medianAcceptedCalls = sortedAttempts.length ? (sortedAttempts.length % 2 ? sortedAttempts[(sortedAttempts.length - 1) / 2] : (sortedAttempts[sortedAttempts.length / 2 - 1] + sortedAttempts[sortedAttempts.length / 2]) / 2) : null
const report = { schemaVersion: 'betterpptx.live-modal-contextual-authoring-corpus.v1', status: fail === 0 ? 'research-live-pass' : 'research-live-fail', request: { width, height, steps, cases: cases.map(item => ({ id: item.id, message: item.message, world: item.world, style: item.style, promptDigest: digest(item.prompt) })) }, results, acceptedCallCount: acceptedCallAttempts.length, acceptedCallAttempts, medianAcceptedCalls, totalGpuCostUsd: Math.round(totalGpuCostUsd * 1e8) / 1e8, ownedSyntheticOnly: true, customerImages: false, consentedHumanImages: false, training: false, externalAi: false, semanticAcceptance: 'not-claimed; Qwen remains abstain-only', checks: pass, failures: fail, checksDetail: checks, contactSheet: 'betterpptx-mcp/outputs/contextual-authoring-corpus-contact-sheet.png' }
await fs.writeFile(path.join(outputRoot, 'contextual-authoring-corpus-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed; total GPU $${totalGpuCostUsd.toFixed(6)}`)
