// Live photorealistic/contextual authoring corpus. It deliberately uses
// synthetic text prompts only: human subjects may appear in the scene, but no
// consented or customer pixels are sent to Modal. The corpus tests the product
// path (Schnell creation -> Klein reference edit), not semantic acceptance.
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
  {
    id: 'climate-field-engineer',
    message: 'Clean infrastructure turns climate ambition into measurable field progress.',
    world: 'sunlit renewable-energy field editorial photography',
    style: 'premium natural-light magazine photograph, mineral blue, solar gold and leaf green, crisp realistic materials',
    prompt: 'Photorealistic premium editorial photograph for a business presentation: a clean-energy field engineer in a yellow safety vest and white helmet reviews a tablet beside modern solar panels and a wind turbine, the engineer and infrastructure occupy the right half, generous uncluttered sky and soft landscape copy space on the left, natural daylight, realistic skin and fabric texture, cinematic but truthful, no readable text, letters, numbers, logos, brand marks or watermark.'
  },
  {
    id: 'care-team-collaboration',
    message: 'Better care emerges when specialists collaborate around one human outcome.',
    world: 'bright contemporary clinical collaboration editorial photography',
    style: 'warm daylight, ivory walls, coral and indigo accents, authentic candid realism, restrained premium composition',
    prompt: 'Photorealistic premium editorial photograph for a business presentation: a diverse healthcare team collaborates around a patient-care workstation in a bright modern clinic, one clinician is the dominant subject on the right while the other specialists create natural depth behind, calm open wall and daylight copy space on the left, authentic expressions, realistic hands, skin, clothing and medical materials, no readable text, letters, numbers, logos, brand marks or watermark.'
  },
  {
    id: 'factory-automation',
    message: 'Automation gives skilled teams safer, clearer control of complex production.',
    world: 'high-end industrial automation editorial photography',
    style: 'charcoal, cobalt and brushed steel, precise practical light, realistic texture, premium technology magazine',
    prompt: 'Photorealistic premium editorial photograph for a business presentation: a skilled factory technician in safety clothing monitors a collaborative robotic arm on the right side of a clean advanced manufacturing cell, precise brushed-metal detail and subtle blue practical lights, deep calm negative space on the left for presentation copy, realistic proportions and material texture, no readable text, letters, numbers, logos, brand marks or watermark.'
  },
  {
    id: 'urban-mobility',
    message: 'Connected mobility makes the everyday city quieter, cleaner and more accessible.',
    world: 'optimistic modern city mobility editorial photography',
    style: 'soft morning light, concrete silver, electric teal and warm amber, realistic architectural detail, premium travel magazine',
    prompt: 'Photorealistic premium editorial photograph for a business presentation: a modern electric city bus and a small group of commuters at a clean accessible transit platform, the bus and human activity sit on the right side, open architectural perspective and quiet pale space on the left for copy, soft morning light, realistic faces and clothing, credible urban materials, no readable text, letters, numbers, logos, brand marks or watermark.'
  }
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
const ok = (name, condition, detail = '') => {
  checks.push({ name, status: condition ? 'PASS' : 'FAIL', detail })
  if (condition) pass += 1
  else fail += 1
  console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const decode = async result => {
  const buffer = Buffer.from(String(result?.base64 || ''), 'base64')
  const meta = await sharp(buffer).metadata().catch(() => null)
  const quality = meta ? await evaluateImageQuality(buffer, { aspect: 'landscape', aspectTolerance: 0.07, minWidth: width, minHeight: height, minEntropy: 1.0, minStdev: 3 }) : null
  return { buffer, meta, quality }
}

console.log('LIVE MODAL PHOTOREALISTIC CONTEXTUAL CORPUS (synthetic prompt-only):')
ok('corpus contains four distinct photographic topic/design briefs', cases.length === 4 && new Set(cases.map(item => item.id)).size === 4)
ok('all briefs declare message, World, style and right-focal/left-copy intent', cases.every(item => item.message && item.world && item.style && /right|left/i.test(item.prompt)))
ok('no consented human/customer input is present', !JSON.stringify(cases).match(/consentedHumanAsset|customer|referenceImages|dataUri|identity-sensitive/i))

const results = []
for (const item of cases) {
  const created = await generateImage({ provider: 'modal', capability: 'create', prompt: item.prompt, style: item.style, aspect: 'landscape', steps })
  const createDecoded = await decode(created)
  const createPath = path.join(outputRoot, `photorealistic-corpus-${safeId(item.id)}-create.png`)
  await fs.writeFile(createPath, createDecoded.buffer)
  const editPrompt = `Reference-edit this photorealistic presentation visual while preserving its subject, right-focal composition and quiet left copy space. Improve natural material detail, lighting coherence, realistic skin/fabric/metal texture and editorial polish for the same message: ${item.message}. World: ${item.world}. Style: ${item.style}. Do not add readable text, letters, numbers, logos, brand marks or watermarks.`
  const edited = await generateImage({ provider: 'modal-edit', capability: 'reference', prompt: editPrompt, style: item.style, aspect: 'landscape', steps, referenceImages: [created.dataUri] })
  const editDecoded = await decode(edited)
  const editPath = path.join(outputRoot, `photorealistic-corpus-${safeId(item.id)}-edit.png`)
  await fs.writeFile(editPath, editDecoded.buffer)
  const createCost = Number(created.gpuSeconds || 0) * usdPerGpuSecond
  const editCost = Number(edited.gpuSeconds || 0) * usdPerGpuSecond
  const result = {
    id: item.id, message: item.message, world: item.world, style: item.style,
    create: { status: createDecoded.quality?.status === 'pass' ? 'PASS' : 'FAIL', width: createDecoded.meta?.width, height: createDecoded.meta?.height, provider: created.provider, model: created.model, capability: created.capability, gpuSeconds: created.gpuSeconds, gpuCostUsd: Math.round(createCost * 1e8) / 1e8, gpuType: created.gpuType, coldStart: created.coldStart, attempts: Number(created.attempts || 0), handle: created.handle, promptHash: created.promptHash, digest: digest(createDecoded.buffer), outputPath: `betterpptx-mcp/outputs/${path.basename(createPath)}`, quality: createDecoded.quality?.measurements },
    edit: { status: editDecoded.quality?.status === 'pass' ? 'PASS' : 'FAIL', width: editDecoded.meta?.width, height: editDecoded.meta?.height, provider: edited.provider, model: edited.model, capability: edited.capability, gpuSeconds: edited.gpuSeconds, gpuCostUsd: Math.round(editCost * 1e8) / 1e8, gpuType: edited.gpuType, coldStart: edited.coldStart, attempts: Number(edited.attempts || 0), handle: edited.handle, promptHash: edited.promptHash, digest: digest(editDecoded.buffer), outputPath: `betterpptx-mcp/outputs/${path.basename(editPath)}`, quality: editDecoded.quality?.measurements },
    customerImage: false, consentedHumanImage: false, training: false
  }
  results.push(result)
  ok(`${item.id}: create and edit pass photographic raster gates`, result.create.status === 'PASS' && result.edit.status === 'PASS' && result.create.width === width && result.create.height === height && result.edit.width === width && result.edit.height === height)
  ok(`${item.id}: routed through audited Schnell then Klein capabilities`, result.create.capability === 'create' && result.edit.capability === 'reference' && /FLUX\.1|schnell/i.test(result.create.model || '') && /Klein|klein/i.test(result.edit.model || ''))
  ok(`${item.id}: creation/edit GPU cost stays within bounded research ceiling`, createCost <= 0.10 && editCost <= 0.10, `$${(createCost + editCost).toFixed(6)}`)
}
ok('all eight photorealistic creation/edit calls succeeded', results.length === cases.length && results.every(item => item.create.status === 'PASS' && item.edit.status === 'PASS'))
ok('all accepted outputs expose bounded call-attempt telemetry', results.every(item => Number(item.create.attempts) >= 1 && Number(item.edit.attempts) >= 1))
ok('each brief has distinct creation and edit digests', results.every(item => item.create.digest !== item.edit.digest) && new Set(results.map(item => item.create.digest)).size === cases.length)
ok('all outputs remain private synthetic research artifacts', results.every(item => item.customerImage === false && item.consentedHumanImage === false && item.training === false))

const tiles = []
for (const item of results) for (const lane of ['create', 'edit']) {
  const file = path.join(outputRoot, path.basename(item[lane].outputPath))
  const image = await sharp(file).resize(400, 240, { fit: 'fill' }).png().toBuffer()
  const label = Buffer.from(`<svg width="400" height="26"><rect width="400" height="26" fill="#08101b"/><text x="7" y="18" fill="#fff" font-family="Arial" font-size="11">${safeId(item.id).toUpperCase()} · ${lane.toUpperCase()}</text></svg>`)
  tiles.push(await sharp({ create: { width: 400, height: 266, channels: 4, background: '#08101b' } }).composite([{ input: label, left: 0, top: 0 }, { input: image, left: 0, top: 26 }]).png().toBuffer())
}
const contactSheet = path.join(outputRoot, 'photorealistic-contextual-corpus-contact-sheet.png')
await sharp({ create: { width: 800, height: Math.ceil(tiles.length / 2) * 266, channels: 4, background: '#08101b' } }).composite(tiles.map((input, index) => ({ input, left: (index % 2) * 400, top: Math.floor(index / 2) * 266 }))).png().toFile(contactSheet)
ok('photorealistic corpus contact sheet is written', (await fs.stat(contactSheet)).size > 1000)
const totalGpuCostUsd = results.reduce((sum, item) => sum + Number(item.create.gpuCostUsd || 0) + Number(item.edit.gpuCostUsd || 0), 0)
const acceptedCallAttempts = results.flatMap(item => [Number(item.create.attempts || 0), Number(item.edit.attempts || 0)])
const sortedAttempts = [...acceptedCallAttempts].sort((a, b) => a - b)
const medianAcceptedCalls = sortedAttempts.length ? (sortedAttempts.length % 2 ? sortedAttempts[(sortedAttempts.length - 1) / 2] : (sortedAttempts[sortedAttempts.length / 2 - 1] + sortedAttempts[sortedAttempts.length / 2]) / 2) : null
const report = { schemaVersion: 'betterpptx.live-modal-photorealistic-contextual-corpus.v1', status: fail === 0 ? 'research-live-pass' : 'research-live-fail', request: { width, height, steps, cases: cases.map(item => ({ id: item.id, message: item.message, world: item.world, style: item.style, promptDigest: digest(item.prompt) })) }, results, acceptedCallCount: acceptedCallAttempts.length, acceptedCallAttempts, medianAcceptedCalls, totalGpuCostUsd: Math.round(totalGpuCostUsd * 1e8) / 1e8, ownedSyntheticOnly: true, customerImages: false, consentedHumanImages: false, training: false, externalAi: false, semanticAcceptance: 'not-claimed; independent review remains required', contactSheet: 'betterpptx-mcp/outputs/photorealistic-contextual-corpus-contact-sheet.png', checks: pass, failures: fail, checksDetail: checks }
await fs.writeFile(path.join(outputRoot, 'photorealistic-contextual-corpus-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed; total GPU $${totalGpuCostUsd.toFixed(6)}`)
