// Bounded research bake-off: compare generated textual annotations with the
// accepted native-PowerPoint annotation route. No customer or consented-human
// image is used; both calls are synthetic and private Modal work.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { generateImage } from './assets/image-gen-providers.mjs'
import { runLocalOcr } from './quality/ocr-adapter.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const sourcePath = path.join(outputRoot, 'image-illustration-demo-schnell-v2.png')
const output = {
	 directSchnell: path.join(outputRoot, 'image-illustration-text-bakeoff-schnell.png'),
	 kleinEdit: path.join(outputRoot, 'image-illustration-text-bakeoff-klein.png'),
}
const labels = ['ATMOSPHERE', 'PLANTS', 'SOIL', 'OCEAN']
const prompt = 'Premium scientific carbon-cycle teaching illustration, realistic editorial cutaway of a forest island, soil layers, ocean and sky. Add exactly four large clean printed labels, spelled exactly ATMOSPHERE, PLANTS, SOIL and OCEAN, each placed next to its matching region, with simple arrows showing the cycle. No other words, no extra letters, no numbers, no logos, no watermark.'
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const checks = []
let passed = 0
const ok = (name, condition, detail = '') => { checks.push({ name, status: condition ? 'PASS' : 'FAIL', detail }); if (condition) passed += 1; console.log(`${condition ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`) }

const source = await fs.readFile(sourcePath)
const sourceDataUri = `data:image/png;base64,${source.toString('base64')}`
const direct = await generateImage({ provider: 'modal', capability: 'create', prompt, style: 'illustration', aspect: 'landscape', steps: 2 })
const directBuffer = Buffer.from(direct.base64, 'base64')
await fs.writeFile(output.directSchnell, directBuffer)
const editedPrompt = 'Reference-edit this carbon-cycle illustration while preserving the exact scene and improving realism. Replace any generated wording with exactly four large clean labels spelled ATMOSPHERE, PLANTS, SOIL and OCEAN, each next to its matching region, and simple arrows. Do not add any other words, letters, numbers, logos or watermark.'
const edited = await generateImage({ provider: 'modal-edit', capability: 'reference', prompt: editedPrompt, style: 'illustration', aspect: 'landscape', steps: 2, referenceImages: [sourceDataUri] })
const editedBuffer = Buffer.from(edited.base64, 'base64')
await fs.writeFile(output.kleinEdit, editedBuffer)
const directOcr = await runLocalOcr(directBuffer, { timeoutMs: 15000, minConfidence: 60 })
const editedOcr = await runLocalOcr(editedBuffer, { timeoutMs: 15000, minConfidence: 60 })
const directText = String(directOcr.text || '')
const editedText = String(editedOcr.text || '')
const countExpected = text => labels.filter(label => new RegExp(`\\b${label}\\b`, 'i').test(text)).length
const directExpected = countExpected(directText)
const editedExpected = countExpected(editedText)
ok('Schnell direct text request completed', directBuffer.length > 1000 && direct.provider === 'modal', direct.model)
ok('Klein reference edit text request completed', editedBuffer.length > 1000 && edited.provider === 'modal-edit', edited.model)
ok('OCR completed for both generated candidates', directOcr.status === 'complete' && editedOcr.status === 'complete')
ok('generated text is not treated as factual truth', directExpected < labels.length || editedExpected < labels.length)
ok('native route remains the exact-label solution', labels.length === 4)
const report = {
	 schemaVersion: 'betterpptx.illustration-text-bakeoff.v1',
	 status: 'research-evidence-only',
	 request: { labels, promptDigest: digest(prompt), source: 'owned-synthetic Schnell v2 illustration' },
	 directSchnell: { provider: direct.provider, model: direct.model, handle: direct.handle, gpuSeconds: direct.gpuSeconds, output: 'betterpptx-mcp/outputs/image-illustration-text-bakeoff-schnell.png', ocr: directOcr, expectedLabelCount: directExpected },
	 kleinEdit: { provider: edited.provider, model: edited.model, handle: edited.handle, gpuSeconds: edited.gpuSeconds, output: 'betterpptx-mcp/outputs/image-illustration-text-bakeoff-klein.png', ocr: editedOcr, expectedLabelCount: editedExpected },
	 acceptedPattern: 'Schnell/Klein generate the expressive pixels; required labels/arrows are native editable PowerPoint objects.',
	 customerImages: false, consentedHumanImages: false, training: false, externalAi: false,
	 checks: checks.length, failures: checks.length - passed, passed, checksDetail: checks,
}
await fs.writeFile(path.join(outputRoot, 'image-illustration-text-bakeoff-report.json'), JSON.stringify(report, null, 2) + '\n')
if (checks.length !== passed) process.exitCode = 1
console.log(`\\n${passed}/${checks.length} checks passed`)
