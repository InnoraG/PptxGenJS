// PPTX/PowerPoint proof for the bounded photorealistic repair pair.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import JSZip from 'jszip'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_ALLOW_PRIMITIVE_TOOLS = '1'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
const { callBetterPptxTool } = await import('./engine.mjs')
const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const artifactPrefix = 'photorealistic-bounded-repair'
const slides = [
  { id: 'baseline', title: 'Climate field engineer · diagnosed copy-space failure', file: 'photorealistic-corpus-climate-field-engineer-create.png', altText: 'Synthetic photorealistic clean-energy field engineer with the diagnosed busy left copy-space region' },
  { id: 'repaired', title: 'Climate field engineer · one bounded copy-space repair', file: 'photorealistic-corpus-climate-field-engineer-repaired.png', altText: 'Synthetic photorealistic clean-energy field engineer after one bounded repair that clears the left copy-space gate' },
]
const context = { sessionId: `verify-${artifactPrefix}-${Date.now()}` }
const resultData = (label, result) => { if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`); return result.data || result }
let pass = 0
let fail = 0
const checks = []
const ok = (name, condition, detail = '') => { checks.push({ name, status: condition ? 'PASS' : 'FAIL', detail }); if (condition) pass += 1; else fail += 1; console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`) }
console.log('PHOTOREALISTIC BOUNDED REPAIR PPTX:')
ok('before/after repair rasters are available', slides.every(slide => fs.existsSync(path.join(outputRoot, slide.file))))
let deckId = null
try {
  const deck = resultData('deck.new', await callBetterPptxTool('betterpptx.deck.new', { title: 'Photorealistic bounded repair evidence' }, context))
  deckId = deck.deckId
  let version = deck.deckVersion
  for (const [index, slide] of slides.entries()) {
    const added = resultData(`slide.add ${slide.id}`, await callBetterPptxTool('betterpptx.slide.add', { deckId, deckVersion: version, ...(index === 1 ? { transition: { type: 'morph', option: 'byObject' } } : {}) }, context))
    version = added.deckVersion
    const title = resultData(`slide.add_text ${slide.id}`, await callBetterPptxTool('betterpptx.slide.add_text', { deckId, slideIndex: index, deckVersion: version, text: slide.title, options: { x: 0.45, y: 0.22, w: 12.2, h: 0.38, fontSize: 14, bold: true, objectName: `repair-${slide.id}-title` } }, context))
    version = title.deckVersion
    const file = path.join(outputRoot, slide.file)
    const meta = await sharp(file).metadata()
    const target = { x: 0.45, y: 0.78, w: 12.43, h: 6.45 }
    const ratio = Number(meta.width || 1) / Number(meta.height || 1)
    const fitted = { w: target.h * ratio, h: target.h, x: target.x + (target.w - target.h * ratio) / 2, y: target.y }
    const image = resultData(`slide.add_image ${slide.id}`, await callBetterPptxTool('betterpptx.slide.add_image', { deckId, slideIndex: index, deckVersion: version, options: { data: `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`, x: fitted.x, y: fitted.y, w: fitted.w, h: fitted.h, sizing: { type: 'contain', ...target }, altText: slide.altText, objectName: 'repair-image' } }, context))
    version = image.deckVersion
  }
  const validation = resultData('deck.validate', await callBetterPptxTool('betterpptx.deck.validate', { deckId }, context))
  const accessibility = resultData('deck.validate_accessibility', await callBetterPptxTool('betterpptx.deck.validate_accessibility', { deckId }, context))
  ok('repair deck validates with accessibility score 100', validation.valid === true && validation.issueCount === 0 && accessibility.passed === true && accessibility.score === 100)
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bpx-photorealistic-repair-'))
  resultData('deck.save', await callBetterPptxTool('betterpptx.deck.save', { deckId, fileName: `${artifactPrefix}.pptx`, outputDir: tempDir }, context))
  const pptxPath = path.join(tempDir, `${artifactPrefix}.pptx`)
  fs.copyFileSync(pptxPath, path.join(outputRoot, `${artifactPrefix}.pptx`))
  const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath))
  const names = Object.keys(zip.files)
  ok('saved repair PPTX has two slide parts and no GLB/FBX export', names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length === slides.length && !names.some(name => /\.(glb|fbx)$/i.test(name)))
  await fsp.rm(tempDir, { recursive: true, force: true })
} finally { if (deckId) { try { await callBetterPptxTool('betterpptx.deck.dispose', { deckId }, context) } catch {} } }

const comEnv = { ...process.env, BETTERPPTX_PHOTOFIT_ARTIFACT_PREFIX: artifactPrefix, BETTERPPTX_COM_SLIDE_COUNT_EXPECTED: '2' }
const comScript = path.join(here, 'verify-private-photofit-slide-context-com.ps1')
const run = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', comScript], { encoding: 'utf8', timeout: 180000, env: comEnv })
const output = `${run.stdout || ''}\n${run.stderr || ''}`
const jsonLines = output.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('{') && line.includes(artifactPrefix))
let comReport = null
try { comReport = jsonLines.length ? JSON.parse(jsonLines.at(-1)) : null } catch {}
ok('PowerPoint COM emitted a repair report', Boolean(comReport), output.slice(-800))
ok('PowerPoint COM reopened and rendered both repair slides', run.status === 0 && comReport?.failures === 0 && comReport?.slideCount === 2)
const renderRoot = path.join(outputRoot, `${artifactPrefix}-com`)
const rendered = slides.map((_, index) => path.join(renderRoot, `slide-${String(index + 1).padStart(2, '0')}.png`))
const tiles = []
for (const file of rendered) { const buffer = await fsp.readFile(file).catch(() => null); if (buffer) tiles.push(await sharp(buffer).resize(800, 450, { fit: 'fill' }).png().toBuffer()) }
ok('both PowerPoint-rendered repair slides are present', tiles.length === 2)
const contactSheet = path.join(outputRoot, `${artifactPrefix}-contact-sheet.png`)
if (tiles.length === 2) await sharp({ create: { width: 1600, height: 450, channels: 4, background: '#08101b' } }).composite(tiles.map((input, index) => ({ input, left: index * 800, top: 0 }))).png().toFile(contactSheet)
ok('repair PPTX contact sheet is written', tiles.length === 2 && (await fsp.stat(contactSheet)).size > 1000)
const report = { schemaVersion: 'betterpptx.photorealistic-bounded-repair-pptx.v1', status: fail === 0 ? 'research-live-pass' : 'research-live-fail', source: 'betterpptx-mcp/outputs/photorealistic-bounded-repair-report.json', pptx: `betterpptx-mcp/outputs/${artifactPrefix}.pptx`, comReport: `betterpptx-mcp/outputs/${artifactPrefix}-com-report.json`, contactSheet: `betterpptx-mcp/outputs/${artifactPrefix}-contact-sheet.png`, checks: pass, failures: fail, checksDetail: checks }
await fsp.writeFile(path.join(outputRoot, `${artifactPrefix}-report.json`), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed`)
