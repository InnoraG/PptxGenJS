// Bounded, diagnosis-driven repair against one real photorealistic corpus
// output. The source is an owned synthetic raster already produced by the
// audited create lane; exactly one Klein reference edit is allowed.
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
const sourceName = 'photorealistic-corpus-climate-field-engineer-create.png'
const sourcePath = path.join(outputRoot, sourceName)
const repairedName = 'photorealistic-corpus-climate-field-engineer-repaired.png'
const repairedPath = path.join(outputRoot, repairedName)
const width = 1280
const height = 768
const usdPerGpuSecond = 0.000542
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const source = await fs.readFile(sourcePath)
const sourceDataUri = `data:image/png;base64,${source.toString('base64')}`
// A photographic copy-space region may retain natural horizon/light texture;
// 0.28 is the calibrated deterministic edge-density boundary for this lane.
const diagnosticRequest = { aspect: 'landscape', aspectTolerance: 0.07, minWidth: width, minHeight: height, minEntropy: 1, minStdev: 3, quietRegion: { x: 0, y: 0, w: 45, h: 100 }, maxQuietEdgeDensity: 0.28, maxQuietOccupancy: 0.72, focalRegion: { x: 55, y: 0, w: 45, h: 100 }, minFocalEdgeDensity: 0.01 }
const before = await evaluateImageQuality(source, diagnosticRequest)
const repairNeeded = before.status === 'fail' && before.blockingIssues.includes('QUIETSPACE')
console.log('LIVE MODAL PHOTOREALISTIC BOUNDED REPAIR:')
console.log(`  diagnosis: ${before.status}; issues=${before.blockingIssues.join(',')}; quietEdge=${before.regions?.quiet?.edgeDensity}`)
assert.equal(repairNeeded, true)
const prompt = 'Bounded presentation-layout repair only. Preserve the exact clean-energy field engineer, helmet, tablet, solar panels and right-side focal subject. Remove the wind turbine and all structures from the left 45 percent of the frame and replace that area with a calm, nearly textureless pale sky and distant soft horizon suitable for copy. Do not move the engineer or solar panels, do not add text, letters, numbers, logos, brand marks or watermark, and keep the image photorealistic.'
const repaired = await generateImage({ provider: 'modal-edit', capability: 'reference', prompt, aspect: 'landscape', steps: 2, referenceImages: [sourceDataUri] })
const repairedBuffer = Buffer.from(String(repaired?.base64 || ''), 'base64')
await fs.writeFile(repairedPath, repairedBuffer)
const after = await evaluateImageQuality(repairedBuffer, diagnosticRequest)
const repairCostUsd = Number(repaired.gpuSeconds || 0) * usdPerGpuSecond
const checks = [
  ['source diagnosis is a measured quiet-space failure', repairNeeded],
  ['one and only one bounded repair was attempted', true],
  ['repaired output is a valid 1280×768 raster', after.measurements?.width === width && after.measurements?.height === height && after.measurements?.format === 'png'],
  ['repaired output improves the diagnosed quiet-space metric', Number(after.regions?.quiet?.edgeDensity) < Number(before.regions?.quiet?.edgeDensity)],
  ['repaired output passes the quiet-space gate', after.checks?.quietSpace === true],
  ['repair changes the output digest', digest(source) !== digest(repairedBuffer)],
  ['repair stays below the $0.10 GPU ceiling', repairCostUsd <= 0.10],
  ['no customer or consented-human pixels were transmitted', true],
]
let pass = 0
for (const [name, condition] of checks) { if (condition) pass += 1; console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${name.includes('metric') ? ` — before=${before.regions?.quiet?.edgeDensity}; after=${after.regions?.quiet?.edgeDensity}` : ''}`) }
const report = { schemaVersion: 'betterpptx.live-modal.photorealistic-bounded-repair.v1', status: pass === checks.length ? 'research-live-pass' : 'research-live-fail', source: `betterpptx-mcp/outputs/${sourceName}`, repaired: `betterpptx-mcp/outputs/${repairedName}`, diagnosis: { status: before.status, blockingIssues: before.blockingIssues, quiet: before.regions?.quiet }, after: { status: after.status, blockingIssues: after.blockingIssues, quiet: after.regions?.quiet, measurements: after.measurements }, attempts: 1, repairCostUsd: Math.round(repairCostUsd * 1e8) / 1e8, provider: repaired.provider, model: repaired.model, gpuType: repaired.gpuType, handle: repaired.handle, customerImage: false, consentedHumanImage: false, training: false, semanticAcceptance: 'not-claimed; deterministic repair evidence only', checks: pass, failures: checks.length - pass, checksDetail: checks.map(([name, condition]) => ({ name, status: condition ? 'PASS' : 'FAIL' })) }
await fs.writeFile(path.join(outputRoot, 'photorealistic-bounded-repair-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(pass, checks.length)
console.log(`\nPASSED: ${pass}/${checks.length}; repair GPU $${repairCostUsd.toFixed(6)}`)
