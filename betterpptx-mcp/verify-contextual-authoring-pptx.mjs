// Package the live contextual creation/edit corpus into an editable PPTX and
// prove that Microsoft PowerPoint can reopen and render the result. This is a
// research artifact: it contains owned synthetic outputs only and exports no
// 3D assets.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import JSZip from 'jszip'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
const { createMcpToolDispatcher } = await import('./engine.mjs')

const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const corpusReportFile = String(process.env.BETTERPPTX_CONTEXTUAL_CORPUS_REPORT || 'contextual-authoring-corpus-report.json')
const artifactPrefix = String(process.env.BETTERPPTX_CONTEXTUAL_ARTIFACT_PREFIX || 'contextual-authoring-corpus')
const corpusPath = path.join(outputRoot, corpusReportFile)
const corpus = JSON.parse(await fsp.readFile(corpusPath, 'utf8'))
assert.equal(corpus.status, 'research-live-pass')
const corpusItems = Array.isArray(corpus.results) ? corpus.results : corpus.variants
const slides = corpusItems.flatMap(item => ['create', 'edit'].map(lane => ({

  id: `${item.id}-${lane}`,
  title: `${item.message || corpus.series?.message || item.concept || item.id} · ${lane === 'create' ? 'Schnell creation' : 'Klein reference edit'}`,
  file: path.basename(item[lane].outputPath),
  altText: `${item.message || corpus.series?.message || item.concept || item.id} Topic- and design-aligned ${lane === 'create' ? 'created' : 'reference-edited'} visual; ${item.world || corpus.series?.world || ''}; ${item.style || corpus.series?.style || ''}`,
  lane,
  item,
})))
const mcp = createMcpToolDispatcher({
  sessionId: `verify-contextual-authoring-pptx-${Date.now()}`,
  clientInfo: { name: 'contextual-authoring-verifier', version: '2' },
  blackBox: false,
})
let pass = 0
let fail = 0
const checks = []
const ok = (name, condition, detail = '') => { checks.push({ name, status: condition ? 'PASS' : 'FAIL', detail }); if (condition) pass += 1; else fail += 1; console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`) }
const resultData = (label, result) => { if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`); return result.data || result }
const digest = value => crypto.createHash('sha256').update(value).digest('hex')

console.log('CONTEXTUAL AUTHORING PPTX (synthetic topic/design corpus):')
ok('live corpus report is a passing synthetic-only source', corpus.ownedSyntheticOnly === true && corpus.customerImages === false && corpus.training === false)
const files = slides.map(slide => path.join(outputRoot, slide.file))
ok(`${slides.length} contextual creation/edit rasters are available locally`, files.every(file => fs.existsSync(file)))

let deckId = null
let pptxPath = null
try {
  const spec = {
    schemaVersion: 'betterpptx.deck-spec.v1',
    title: 'Contextual visual authoring corpus',
    authoringContract: {
      workflow: 'authoring-excellence-director-v1',
      level: 'deterministic',
      coordinateSystem: 'inches',
      layerModel: 'flat-object-array',
      objectIdentity: 'stable-names-required',
    },
    contentStory: {
      audience: 'presentation quality reviewers',
      outcome: 'Compare contextual visual creation and edit lanes without hand-authored geometry.',
      remember: 'Semantic intent, image-aware placement, and engine defaults govern the deck.',
    },
    visualDesign: {
      world: 'Editorial verification sheet',
      framing: 'Image-led comparison with a caption-safe explanation lane.',
    },
    motionTime: {
      masterClock: 'authored slide timeline',
      timingSource: 'Authoring Excellence Motion/Time plan',
      syncPolicy: 'Single deck clock governs transitions and narration.',
    },
    layout: 'LAYOUT_WIDE',
    theme: { name: 'Contextual corpus', palette: ['0F172A', '2563EB', '14B8A6', 'F8FAFC'], fontFace: 'Aptos' },
    showSettings: { useTimings: true, showAnimation: true, showNarration: true, showMediaControls: true },
    slides: slides.map((slide, index) => ({
      id: slide.id,
      title: slide.title,
      role: 'image-led',
      message: slide.altText,
      layoutIntent: 'image-left-copy-right',
      notes: `Semantic contextual ${slide.lane} proof for ${slide.id}.`,
      transition: index === 1 ? { type: 'morph', option: 'byObject' } : { type: 'fade', duration: 0.35 },
      content: [
        { kind: 'title', name: `contextual-${slide.id}-title`, text: slide.title },
        {
          kind: 'image-feature',
          name: `contextual-${slide.id}-image`,
          image: `data:image/png;base64,${fs.readFileSync(files[index]).toString('base64')}`,
          altText: slide.altText,
          role: 'visual-proof',
          region: 'media',
          visualIntent: { mode: 'source-backed', purpose: 'show contextual corpus result' },
        },
        { kind: 'textBox', name: `contextual-${slide.id}-caption`, text: slide.altText, role: 'explanation', region: 'caption' },
      ],
    })),
    validation: { validateBeforeSave: true, requireAccessibility: true },
  }
  const dryRun = resultData('generate_from_spec dryRun', await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full' }))
  ok('semantic dry-run is mutation-free and returns a governed plan', dryRun.dryRun === true && dryRun.mutationFree === true && !dryRun.deckId && Boolean(dryRun.planDigest || dryRun.plan || dryRun.stages))
  const committed = resultData('generate_from_spec commit', await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', detail: 'full' }))
  deckId = committed.deckId
  const version = committed.deckVersion
  const validation = resultData('deck.validate', await mcp.call('betterpptx.deck.validate', { deckId, deckVersion: version }))
  const accessibility = resultData('deck.validate_accessibility', await mcp.call('betterpptx.deck.validate_accessibility', { deckId, deckVersion: version }))
  const quality = resultData('deck.validate_quality', await mcp.call('betterpptx.deck.validate_quality', { deckId, deckVersion: version, profile: 'modern' }))
  ok('contextual deck validates with accessibility and quality gates', validation.valid === true && validation.issueCount === 0 && accessibility.passed === true && accessibility.score === 100 && quality.ok === true)
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bpx-contextual-authoring-'))
  resultData('deck.save', await mcp.call('betterpptx.deck.save', { deckId, deckVersion: version, fileName: `${artifactPrefix}.pptx`, outputDir: tempDir }))
  pptxPath = path.join(tempDir, `${artifactPrefix}.pptx`)
  fs.copyFileSync(pptxPath, path.join(outputRoot, `${artifactPrefix}.pptx`))
  const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath))
  const names = Object.keys(zip.files)
ok(`saved PPTX has ${slides.length} slide parts and no GLB/FBX export`, names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length === slides.length && !names.some(name => /\.(glb|fbx)$/i.test(name)))
  await fsp.rm(tempDir, { recursive: true, force: true })
} finally {
  if (deckId) { try { await mcp.call('betterpptx.deck.dispose', { deckId }) } catch {} }
}

const comEnv = { ...process.env, BETTERPPTX_PHOTOFIT_ARTIFACT_PREFIX: artifactPrefix, BETTERPPTX_COM_SLIDE_COUNT_EXPECTED: String(slides.length) }
const comScript = path.join(here, 'verify-private-photofit-slide-context-com.ps1')
const run = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', comScript], { encoding: 'utf8', timeout: 240000, env: comEnv })
const output = `${run.stdout || ''}\n${run.stderr || ''}`
const jsonLines = output.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('{') && line.includes(artifactPrefix))
let comReport = null
try { comReport = jsonLines.length ? JSON.parse(jsonLines.at(-1)) : null } catch {}
ok('PowerPoint COM emitted a contextual corpus report', Boolean(comReport), output.slice(-900))
ok(`PowerPoint COM reopened and rendered all ${slides.length} contextual slides`, run.status === 0 && comReport?.failures === 0 && comReport?.slideCount === slides.length)

const renderRoot = path.join(outputRoot, `${artifactPrefix}-com`)
const rendered = slides.map((_, index) => path.join(renderRoot, `slide-${String(index + 1).padStart(2, '0')}.png`))
const measurements = []
for (const [index, file] of rendered.entries()) {
  const buffer = await fsp.readFile(file).catch(() => null)
  if (!buffer) continue
  const meta = await sharp(buffer).metadata()
  measurements.push({ id: slides[index].id, file: path.basename(file), width: meta.width, height: meta.height, digest: digest(buffer), status: meta.width === 1600 && meta.height === 900 ? 'PASS' : 'FAIL' })
}
ok(`${slides.length} PowerPoint-rendered contextual slides pass raster gates`, measurements.length === slides.length && measurements.every(item => item.status === 'PASS'))
ok(`rendered contextual slides remain byte-distinct`, new Set(measurements.map(item => item.digest)).size === slides.length)
const tiles = await Promise.all(measurements.map(item => sharp(path.join(renderRoot, item.file)).resize(400, 225, { fit: 'fill' }).png().toBuffer()))
const pptxContactSheet = path.join(outputRoot, `${artifactPrefix}-pptx-contact-sheet.png`)
await sharp({ create: { width: 1600, height: Math.ceil(tiles.length / 4) * 250, channels: 4, background: '#08101b' } }).composite(tiles.map((input, index) => ({ input, left: (index % 4) * 400, top: Math.floor(index / 4) * 250 }))).png().toFile(pptxContactSheet)
ok('contextual PPTX render contact sheet is written', (await fsp.stat(pptxContactSheet)).size > 1000)

const report = { schemaVersion: 'betterpptx.contextual-authoring-pptx.v1', status: fail === 0 ? 'research-live-pass' : 'research-live-fail', source: `betterpptx-mcp/outputs/${corpusReportFile}`, slides: slides.map(slide => ({ id: slide.id, title: slide.title, file: `betterpptx-mcp/outputs/${slide.file}`, lane: slide.lane })), comReport: `betterpptx-mcp/outputs/${artifactPrefix}-com-report.json`, measurements, checks: pass, failures: fail, pptx: `betterpptx-mcp/outputs/${artifactPrefix}.pptx`, contactSheet: `betterpptx-mcp/outputs/${artifactPrefix}-pptx-contact-sheet.png` }
await fsp.writeFile(path.join(outputRoot, `${artifactPrefix}-pptx-report.json`), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed`)
