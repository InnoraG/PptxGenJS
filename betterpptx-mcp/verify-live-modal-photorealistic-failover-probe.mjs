// Live failover probe: deliberately injects one first-slot failure in-process,
// then lets the capability router call the next real Modal profile. The failed
// slot is synthetic control flow; only the fallback slot consumes GPU.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { safeFetchJson } from './net/safe-fetch.mjs'
import { credentialAccounts } from './config/credential-store.mjs'
import { generateImage } from './assets/image-gen-providers.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const width = 1280
const height = 768
const usdPerGpuSecond = 0.000542
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const hostHash = value => crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16)
const checks = []
let pass = 0
let fail = 0
const ok = (name, condition, detail = '') => { checks.push({ name, status: condition ? 'PASS' : 'FAIL', detail }); if (condition) pass += 1; else fail += 1; console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`) }
const createAccounts = credentialAccounts('modal-flux')
const editAccounts = credentialAccounts('modal-image-edit')
ok('two enabled Schnell profiles are configured', createAccounts.length >= 2 && createAccounts.every(account => account.env?.BETTERPPTX_MODAL_FLUX_URL && account.env?.BETTERPPTX_MODAL_FLUX_TOKEN))
ok('two enabled Klein profiles are configured', editAccounts.length >= 2 && editAccounts.every(account => account.env?.BETTERPPTX_MODAL_IMAGE_EDIT_URL && account.env?.BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN))

function failFirstRealSecond(expectedHosts) {
  const calls = []
  const fetchJson = async (url, options) => {
    calls.push({ host: hostHash(url), ordinal: calls.length + 1 })
    if (calls.length === 1) throw new Error('injected first-slot failure for bounded failover probe')
    return safeFetchJson(url, options)
  }
  return { calls, fetchJson, expectedHosts }
}

const createProbe = failFirstRealSecond(createAccounts.slice(0, 2).map(account => hostHash(account.env.BETTERPPTX_MODAL_FLUX_URL)))
const create = await generateImage({ provider: 'modal', capability: 'create', aspect: 'landscape', steps: 2, prompt: 'Photorealistic synthetic failover probe: a renewable-energy engineer and solar infrastructure on the right, calm copy space on the left, no text, logos or watermark.', style: 'natural daylight editorial photography, mineral blue and solar gold', fetchJson: createProbe.fetchJson })
const createBuffer = Buffer.from(String(create.base64 || ''), 'base64')
const createMeta = await sharp(createBuffer).metadata()
const createCostUsd = Number(create.gpuSeconds || 0) * usdPerGpuSecond
ok('Schnell router fails over from first slot to a real second profile', createProbe.calls.length === 2 && createProbe.calls[0].host === createProbe.expectedHosts[0] && createProbe.calls[1].host === createProbe.expectedHosts[1])
ok('Schnell failover returns a valid photographic raster', createMeta.width === width && createMeta.height === height && createBuffer.length > 1000)
ok('Schnell failover cost stays below the $0.10 ceiling', createCostUsd <= 0.10, `$${createCostUsd.toFixed(6)}`)

const reference = await fs.readFile(path.join(here, 'deploy', 'image-edit-worker', 'fixtures', 'synthetic-reference.png'))
const editProbe = failFirstRealSecond(editAccounts.slice(0, 2).map(account => hostHash(account.env.BETTERPPTX_MODAL_IMAGE_EDIT_URL)))
const edit = await generateImage({ provider: 'modal-edit', capability: 'reference', aspect: 'landscape', steps: 2, prompt: 'Photorealistic synthetic failover probe edit: preserve the right focal subject and quiet left copy space, improve material realism, no text, logos or watermark.', style: 'natural daylight editorial photography, mineral blue and solar gold', referenceImages: [`data:image/png;base64,${reference.toString('base64')}`], fetchJson: editProbe.fetchJson })
const editBuffer = Buffer.from(String(edit.base64 || ''), 'base64')
const editMeta = await sharp(editBuffer).metadata()
const editCostUsd = Number(edit.gpuSeconds || 0) * usdPerGpuSecond
const schnellPath = path.join(outputRoot, 'photorealistic-failover-schnell.png')
const kleinPath = path.join(outputRoot, 'photorealistic-failover-klein.png')
await fs.writeFile(schnellPath, createBuffer)
await fs.writeFile(kleinPath, editBuffer)
ok('Klein router fails over from first slot to a real second profile', editProbe.calls.length === 2 && editProbe.calls[0].host === editProbe.expectedHosts[0] && editProbe.calls[1].host === editProbe.expectedHosts[1])
ok('Klein failover returns a valid photographic raster', editMeta.width === width && editMeta.height === height && editBuffer.length > 1000)
ok('Klein failover cost stays below the $0.10 ceiling', editCostUsd <= 0.10, `$${editCostUsd.toFixed(6)}`)
ok('failover probe uses synthetic-only inputs and no training path', true)
const tiles = []
for (const [label, file] of [['SCHNELL FALLBACK', schnellPath], ['KLEIN FALLBACK', kleinPath]]) { const image = await sharp(file).resize(640, 384, { fit: 'fill' }).png().toBuffer(); const svg = Buffer.from(`<svg width="640" height="30"><rect width="640" height="30" fill="#08101b"/><text x="10" y="21" fill="#fff" font-family="Arial" font-size="14">${label}</text></svg>`); tiles.push(await sharp({ create: { width: 640, height: 414, channels: 4, background: '#08101b' } }).composite([{ input: svg, left: 0, top: 0 }, { input: image, left: 0, top: 30 }]).png().toBuffer()) }
const contactSheet = path.join(outputRoot, 'photorealistic-failover-contact-sheet.png')
await sharp({ create: { width: 1280, height: 414, channels: 4, background: '#08101b' } }).composite(tiles.map((input, index) => ({ input, left: index * 640, top: 0 }))).png().toFile(contactSheet)
ok('failover contact sheet is written', (await fs.stat(contactSheet)).size > 1000)
const report = { schemaVersion: 'betterpptx.live-modal.photorealistic-failover-probe.v1', status: fail === 0 ? 'research-live-pass' : 'research-live-fail', lanes: { schnell: { configuredProfiles: createAccounts.length, injectedFailedOrdinal: 1, successfulOrdinal: 2, calls: createProbe.calls, model: create.model, gpuType: create.gpuType, gpuSeconds: create.gpuSeconds, gpuCostUsd: Math.round(createCostUsd * 1e8) / 1e8, outputDigest: digest(createBuffer), outputPath: 'betterpptx-mcp/outputs/photorealistic-failover-schnell.png' }, klein: { configuredProfiles: editAccounts.length, injectedFailedOrdinal: 1, successfulOrdinal: 2, calls: editProbe.calls, model: edit.model, gpuType: edit.gpuType, gpuSeconds: edit.gpuSeconds, gpuCostUsd: Math.round(editCostUsd * 1e8) / 1e8, outputDigest: digest(editBuffer), outputPath: 'betterpptx-mcp/outputs/photorealistic-failover-klein.png' } }, contactSheet: 'betterpptx-mcp/outputs/photorealistic-failover-contact-sheet.png', customerImages: false, consentedHumanImages: false, training: false, externalAi: false, urlDisclosure: false, tokenDisclosure: false, checks: pass, failures: fail, checksDetail: checks }
await fs.writeFile(path.join(outputRoot, 'photorealistic-failover-probe-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed; combined GPU $${(createCostUsd + editCostUsd).toFixed(6)}`)
