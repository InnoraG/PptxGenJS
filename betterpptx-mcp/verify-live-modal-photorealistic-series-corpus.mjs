// Same-series photorealistic authoring corpus. Shared anchors are held fixed
// while concept and subject vary; each variant uses Schnell creation followed
// by Klein reference editing.
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
const series = { id: 'clean-infrastructure-progress', world: 'sunlit renewable-energy field editorial photography', style: 'premium natural-light magazine photograph, mineral blue, solar gold and leaf green, realistic materials, restrained contrast', composition: 'right-side focal subject with generous quiet left copy space', message: 'Clean infrastructure turns climate ambition into measurable field progress.' }
const variants = [
  { id: 'field-engineer', concept: 'a clean-energy field engineer reviews a tablet beside solar panels and a wind turbine' },
  { id: 'maintenance-team', concept: 'two clean-energy technicians inspect a solar installation from the right side of the frame' },
  { id: 'grid-control', concept: 'a renewable-grid control room with one operator and a glowing infrastructure map on the right' },
]
const width = 1280
const height = 768
const steps = 2
const usdPerGpuSecond = 0.000542
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const seriesAnchorFingerprint = digest(JSON.stringify(series))
let pass = 0
let fail = 0
const checks = []
const ok = (name, condition, detail = '') => { checks.push({ name, status: condition ? 'PASS' : 'FAIL', detail }); if (condition) pass += 1; else fail += 1; console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`) }
const decode = async result => { const buffer = Buffer.from(String(result?.base64 || ''), 'base64'); const meta = await sharp(buffer).metadata().catch(() => null); const quality = meta ? await evaluateImageQuality(buffer, { aspect: 'landscape', aspectTolerance: 0.07, minWidth: width, minHeight: height, minEntropy: 1, minStdev: 3 }) : null; return { buffer, meta, quality } }
console.log('LIVE MODAL PHOTOREALISTIC SERIES CORPUS (synthetic prompt-only):')
ok('series declares stable World/style/layout/message anchors', Boolean(series.world && series.style && series.composition && series.message))
ok('series has three distinct concepts', variants.length === 3 && new Set(variants.map(item => item.concept)).size === 3)
const results = []
for (const variant of variants) {
  const prompt = `Photorealistic premium editorial photograph for a coherent presentation series. Series message: ${series.message}. World: ${series.world}. Style anchors: ${series.style}. Composition anchor: ${series.composition}. This slide concept: ${variant.concept}. Preserve a calm left copy area, no readable text, letters, numbers, logos, brand marks or watermark.`
  const created = await generateImage({ provider: 'modal', capability: 'create', prompt, style: series.style, aspect: 'landscape', steps })
  const createDecoded = await decode(created)
  const createPath = path.join(outputRoot, `photorealistic-series-${variant.id}-create.png`)
  await fs.writeFile(createPath, createDecoded.buffer)
  const editPrompt = `Reference-edit this image as one member of the same coherent photographic series. Keep the exact series anchors: message ${series.message}; World ${series.world}; style ${series.style}; composition ${series.composition}. Preserve the concept ${variant.concept}, improve realistic material detail and lighting coherence, and do not add readable text, letters, numbers, logos, brand marks or watermark.`
  const edited = await generateImage({ provider: 'modal-edit', capability: 'reference', prompt: editPrompt, style: series.style, aspect: 'landscape', steps, referenceImages: [created.dataUri] })
  const editDecoded = await decode(edited)
  const editPath = path.join(outputRoot, `photorealistic-series-${variant.id}-edit.png`)
  await fs.writeFile(editPath, editDecoded.buffer)
  const createCost = Number(created.gpuSeconds || 0) * usdPerGpuSecond
  const editCost = Number(edited.gpuSeconds || 0) * usdPerGpuSecond
  results.push({ id: variant.id, concept: variant.concept, seriesAnchorFingerprint, create: { status: createDecoded.quality?.status === 'pass' ? 'PASS' : 'FAIL', width: createDecoded.meta?.width, height: createDecoded.meta?.height, provider: created.provider, model: created.model, capability: created.capability, gpuSeconds: created.gpuSeconds, gpuCostUsd: Math.round(createCost * 1e8) / 1e8, gpuType: created.gpuType, digest: digest(createDecoded.buffer), outputPath: `betterpptx-mcp/outputs/${path.basename(createPath)}` }, edit: { status: editDecoded.quality?.status === 'pass' ? 'PASS' : 'FAIL', width: editDecoded.meta?.width, height: editDecoded.meta?.height, provider: edited.provider, model: edited.model, capability: edited.capability, gpuSeconds: edited.gpuSeconds, gpuCostUsd: Math.round(editCost * 1e8) / 1e8, gpuType: edited.gpuType, digest: digest(editDecoded.buffer), outputPath: `betterpptx-mcp/outputs/${path.basename(editPath)}` }, customerImage: false, consentedHumanImage: false, training: false, promptHash: digest(prompt) })
  const latest = results.at(-1)
  ok(`${variant.id}: create/edit pass raster gates`, latest.create.status === 'PASS' && latest.edit.status === 'PASS' && latest.create.width === width && latest.edit.width === width)
  ok(`${variant.id}: Schnell→Klein route is audited`, /create/.test(latest.create.capability) && /reference/.test(latest.edit.capability) && /FLUX\.1|schnell/i.test(latest.create.model || '') && /Klein|klein/i.test(latest.edit.model || ''))
  ok(`${variant.id}: bounded GPU cost`, createCost <= 0.10 && editCost <= 0.10, `$${(createCost + editCost).toFixed(6)}`)
}
ok('all six series creation/edit calls succeeded', results.length === variants.length && results.every(item => item.create.status === 'PASS' && item.edit.status === 'PASS'))
ok('series concepts are distinct while all share one anchor fingerprint', new Set(results.map(item => item.create.digest)).size === variants.length && new Set(results.map(item => item.seriesAnchorFingerprint)).size === 1 && results.every(item => item.seriesAnchorFingerprint === seriesAnchorFingerprint))
ok('series outputs remain private synthetic artifacts', results.every(item => !item.customerImage && !item.consentedHumanImage && !item.training))
const tiles = []
for (const item of results) for (const lane of ['create', 'edit']) { const image = await sharp(path.join(outputRoot, path.basename(item[lane].outputPath))).resize(400, 240, { fit: 'fill' }).png().toBuffer(); const label = Buffer.from(`<svg width="400" height="26"><rect width="400" height="26" fill="#08101b"/><text x="7" y="18" fill="#fff" font-family="Arial" font-size="11">${item.id.toUpperCase()} · ${lane.toUpperCase()}</text></svg>`); tiles.push(await sharp({ create: { width: 400, height: 266, channels: 4, background: '#08101b' } }).composite([{ input: label, left: 0, top: 0 }, { input: image, left: 0, top: 26 }]).png().toBuffer()) }
const contactSheet = path.join(outputRoot, 'photorealistic-series-corpus-contact-sheet.png')
await sharp({ create: { width: 1200, height: Math.ceil(tiles.length / 3) * 266, channels: 4, background: '#08101b' } }).composite(tiles.map((input, index) => ({ input, left: (index % 3) * 400, top: Math.floor(index / 3) * 266 }))).png().toFile(contactSheet)
ok('series contact sheet is written', (await fs.stat(contactSheet)).size > 1000)
const totalGpuCostUsd = results.reduce((sum, item) => sum + item.create.gpuCostUsd + item.edit.gpuCostUsd, 0)
const report = { schemaVersion: 'betterpptx.live-modal.photorealistic-series-corpus.v1', status: fail === 0 ? 'research-live-pass' : 'research-live-fail', series, variants: results, totalGpuCostUsd: Math.round(totalGpuCostUsd * 1e8) / 1e8, ownedSyntheticOnly: true, customerImages: false, consentedHumanImages: false, training: false, externalAi: false, perceptualAcceptance: 'not-claimed; visual review and calibration remain separate', contactSheet: 'betterpptx-mcp/outputs/photorealistic-series-corpus-contact-sheet.png', checks: pass, failures: fail, checksDetail: checks }
await fs.writeFile(path.join(outputRoot, 'photorealistic-series-corpus-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed; total GPU $${totalGpuCostUsd.toFixed(6)}`)
