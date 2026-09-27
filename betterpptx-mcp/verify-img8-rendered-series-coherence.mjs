// IMG8 rendered series/coherence corpus: build a real PPTX from owned-synthetic
// candidates, reopen/render it through PowerPoint COM, and measure deterministic
// cross-slide anchor consistency plus selective invalidation. No provider or AI call.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import sharp from 'sharp'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { evaluateImageQuality, hamming } from './quality/image-quality-gates.mjs'
import { evaluateSeriesCoherence, planWholeDeckVisualRevision, visualRevisionDigest } from './quality/series-coherence.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_ALLOW_PRIMITIVE_TOOLS = '1'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
const { createMcpToolDispatcher } = await import('./engine.mjs')

const here = path.dirname(fileURLToPath(import.meta.url))
const outputRoot = path.join(here, 'outputs')
const assetRoot = path.join(outputRoot, 'img11-blind-review')
const corpus = [
	{ id: 'dark-1', file: 'c01.png', group: 'dark-series', world: 'midnight-aurora', palette: ['0e2348', '58b8d0', 'e4aa52'], concept: 'fragmented paths', style: 'illustration' },
	{ id: 'dark-2', file: 'c03.png', group: 'dark-series', world: 'midnight-aurora', palette: ['0e2348', '58b8d0', 'e4aa52'], concept: 'governed core', style: 'illustration' },
	{ id: 'dark-3', file: 'c05.png', group: 'dark-series', world: 'midnight-aurora', palette: ['0e2348', '58b8d0', 'e4aa52'], concept: 'measured result', style: 'illustration' },
	{ id: 'light-1', file: 'c02.png', group: 'light-series', world: 'paper-amber', palette: ['f4eddf', '174b3d', 'e66c58'], concept: 'fragmented paths', style: 'illustration' },
	{ id: 'light-2', file: 'c04.png', group: 'light-series', world: 'paper-amber', palette: ['f4eddf', '174b3d', 'e66c58'], concept: 'governed core', style: 'illustration' },
	{ id: 'light-3', file: 'c06.png', group: 'light-series', world: 'paper-amber', palette: ['f4eddf', '174b3d', 'e66c58'], concept: 'measured result', style: 'illustration' },
]
const plans = corpus.map(item => ({
	id: item.id,
	consistencyGroup: item.group,
	concept: item.concept,
	world: { key: item.world },
	palette: item.palette,
	layout: { aspect: 'wide', subjectPlacement: 'right', negativeSpace: 'left' },
	request: { style: item.style },
}))
const context = { sessionId: `verify-img8-rendered-series-${Date.now()}` }
const dispatcher = createMcpToolDispatcher(context)
const callBetterPptxTool = (name, args = {}) => dispatcher.call(name, args)
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
const resultData = (label, result) => {
	if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`)
	return result.data || result
}
const digest = value => crypto.createHash('sha256').update(value).digest('hex')

console.log('IMG8 RENDERED SERIES/COHERENCE CORPUS (owned synthetic, PowerPoint COM):')
const assetPaths = corpus.map(item => path.join(assetRoot, item.file))
ok('six owned-synthetic series rasters exist', assetPaths.every(file => fs.existsSync(file)))
ok('corpus has two anchor groups with three variation slots each', new Set(corpus.map(item => item.group)).size === 2 && corpus.every(item => corpus.filter(other => other.group === item.group).length === 3))
const planned = evaluateSeriesCoherence(plans)
ok('deterministic planner accepts shared anchors and varied concepts', planned.status === 'pass' && planned.score === 1 && planned.groups.length === 2)
const revision = planWholeDeckVisualRevision(plans, 'dark-2')
ok('revision digest is stable and opaque', visualRevisionDigest(plans) === visualRevisionDigest(plans) && /^revision:\/\/[a-f0-9]{24}$/.test(revision.revisionDigest))
ok('changing one dark slide invalidates only its two dark siblings', revision.invalidatedPlanIds.length === 2 && revision.invalidatedPlanIds.every(id => id.startsWith('dark-')) && revision.retainedPlanIds.every(id => id.startsWith('light-') || id === 'dark-2'))
ok('only the changed plan is marked for asset regeneration', revision.assetInvalidatedPlanIds?.length === 1 && revision.assetInvalidatedPlanIds[0] === 'dark-2')
ok('unaffected accepted bytes remain retainable while sibling checks are revisited', revision.retainedAssetPlanIds?.length === 5 && revision.retainedAssetPlanIds.includes('dark-1') && revision.retainedAssetPlanIds.includes('dark-3'))
ok('dependent series checks are separated from asset invalidation', revision.dependentSeriesCheckPlanIds?.length === 2 && revision.dependentSeriesCheckPlanIds.every(id => id.startsWith('dark-')))

let deckId = null
let pptxPath = null
try {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'IMG8 rendered series coherence corpus', audience: 'research maintainer', objective: 'measure deterministic cross-slide visual coherence',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', textPolicy: 'Use textBox for standalone text and textShape for text inside a PowerPoint shape.', requires: ['slide.id', 'content[].name', 'slide.notes', 'altText for visual proof', 'validation before save'] },
		contentStory: { audience: 'research maintainer', outcome: 'measure deterministic cross-slide visual coherence', remember: 'shared series anchors remain stable while concepts vary' },
		visualDesign: { world: 'Owned synthetic coherence corpus', framing: 'consistent wide image plates with native labels' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'One governed clock coordinates builds and transitions.' },
		theme: { name: 'IMG8', palette: ['0B1220', '2563EB', '14B8A6', 'F59E0B', 'F8FAFC'], fontFace: 'Aptos' },
		sections: [{ id: 'series', title: 'Series', slideIds: corpus.map(item => item.id) }],
		slides: corpus.map((item, index) => ({
			id: item.id, title: `${item.group} · ${item.concept}`, role: 'evidence', message: `${item.group} coherence candidate: ${item.concept}`, layoutIntent: 'title-body', notes: `Owned synthetic ${item.group} coherence candidate: ${item.concept}`,
			...(index === 1 ? { transition: { type: 'morph', option: 'byObject' } } : {}),
			content: [
				{ kind: 'title', name: `img8-${item.id}-title`, text: `${item.group} · ${item.concept}`, altText: `${item.group} ${item.concept}` },
				{ kind: 'image', name: `img8-${item.id}-image`, image: `data:image/png;base64,${fs.readFileSync(assetPaths[index]).toString('base64')}`, altText: `Owned synthetic ${item.group} coherence candidate: ${item.concept}` },
			],
		})),
	}
	const generated = resultData('generate_from_spec', await dispatcher.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'free', detail: 'summary' }))
	deckId = generated.deckId
	const validation = resultData('deck.validate', await callBetterPptxTool('betterpptx.deck.validate', { deckId }, context))
	const accessibility = resultData('deck.validate_accessibility', await callBetterPptxTool('betterpptx.deck.validate_accessibility', { deckId }, context))
	const quality = resultData('deck.validate_quality', await callBetterPptxTool('betterpptx.deck.validate_quality', { deckId }, context))
	ok('six-slide deck validates and has no accessibility issues', validation.valid === true && validation.issueCount === 0 && accessibility.passed === true && accessibility.score === 100 && quality.blockingIssues?.length === 0)
	const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'bpx-img8-series-'))
	const saved = resultData('deck.save', await callBetterPptxTool('betterpptx.deck.save', { deckId, fileName: 'img8-rendered-series-coherence.pptx', outputDir: tempDir }, context))
	pptxPath = path.join(tempDir, 'img8-rendered-series-coherence.pptx')
	fs.copyFileSync(pptxPath, path.join(outputRoot, 'img8-rendered-series-coherence.pptx'))
	const zip = await JSZip.loadAsync(fs.readFileSync(pptxPath))
	const names = Object.keys(zip.files)
	ok('saved deck has six slide XML parts and no raw GLB/FBX export', names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length === 6 && !names.some(name => /\.(glb|fbx)$/i.test(name)))
	await fsp.rm(tempDir, { recursive: true, force: true })
} finally {
	if (deckId) { try { await callBetterPptxTool('betterpptx.deck.dispose', { deckId }, context) } catch {} }
}

const comScript = path.join(here, 'verify-img8-rendered-series-coherence-com.ps1')
const run = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', comScript], { encoding: 'utf8', timeout: 180000 })
const output = `${run.stdout || ''}\n${run.stderr || ''}`
const jsonLines = output.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('{') && line.includes('img8-rendered-series-powerpoint-com'))
let comReport = null
try { comReport = jsonLines.length ? JSON.parse(jsonLines.at(-1)) : null } catch {}
ok('PowerPoint COM script emitted a report', Boolean(comReport), output.slice(-800))
ok('PowerPoint COM reopened and rendered all six series slides', run.status === 0 && comReport?.failures === 0 && comReport?.slideCount === 6)

const renderRoot = path.join(outputRoot, 'img8-rendered-series-com')
const rendered = corpus.map((_, index) => path.join(renderRoot, `slide-${String(index + 1).padStart(2, '0')}.png`))
const measurements = []
for (const [index, file] of rendered.entries()) {
	const buffer = await fsp.readFile(file).catch(() => null)
	if (!buffer) continue
	const quality = await evaluateImageQuality(buffer, { aspect: 'wide', minWidth: 1024, minHeight: 576, minEntropy: 0.3, minStdev: 2 })
	const meta = await sharp(buffer).metadata()
	const stats = await sharp(buffer).stats()
	const means = stats.channels.slice(0, 3).map(channel => Number(channel.mean || 0))
	measurements.push({ index, id: corpus[index].id, group: corpus[index].group, file: path.basename(file), width: meta.width, height: meta.height, digest: digest(buffer), averageHash: quality.measurements?.averageHash, quality: quality.measurements, status: quality.status, meanRgb: means })
}
ok('six rendered series PNGs exist', measurements.length === 6)
ok('all rendered series slides pass deterministic raster gates', measurements.length === 6 && measurements.every(item => item.status === 'pass' && item.width === 1600 && item.height === 900))
const groupDistances = {}
for (const group of [...new Set(corpus.map(item => item.group))]) {
	const rows = measurements.filter(item => item.group === group)
	const distances = rows.slice(1).map(row => hamming(rows[0]?.averageHash, row.averageHash))
	groupDistances[group] = distances
}
ok('dark series retains a close rendered composition fingerprint', groupDistances['dark-series']?.every(distance => distance <= 24))
ok('light series retains a close rendered composition fingerprint', groupDistances['light-series']?.every(distance => distance <= 24))
ok('rendered series has six byte-distinct candidates', new Set(measurements.map(item => item.digest)).size === 6)
const tiles = await Promise.all(measurements.map(item => sharp(path.join(renderRoot, item.file)).resize(400, 225, { fit: 'fill' }).png().toBuffer()))
await sharp({ create: { width: 1200, height: 450, channels: 4, background: '#0b111b' } })
	.composite(tiles.map((input, index) => ({ input, left: (index % 3) * 400, top: Math.floor(index / 3) * 225 })))
	.png().toFile(path.join(outputRoot, 'img8-rendered-series-coherence-contact-sheet.png'))
ok('rendered six-slide coherence contact sheet is written', (await fsp.stat(path.join(outputRoot, 'img8-rendered-series-coherence-contact-sheet.png'))).size > 1000)

const report = { schemaVersion: 'betterpptx.img8-rendered-series-coherence.v1', ownedSyntheticOnly: true, customerImages: false, externalAi: false, slideCount: 6, planner: planned, revision, comReport: 'betterpptx-mcp/outputs/img8-rendered-series-com-report.json', groupDistances, measurements, checks: pass, failures: fail }
await fsp.writeFile(path.join(outputRoot, 'img8-rendered-series-coherence-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\nPASSED: ${pass} passed, ${fail} failed`)
