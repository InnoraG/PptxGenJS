// Batch proof: import a native chart/table/SmartArt deck, mutate each object,
// reset the authored values, and verify package/Office retention in one boundary.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { createMcpToolDispatcher } from './engine.mjs'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const root = path.resolve('.')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/imported-native-family-mutation/${stamp}`)
const baseline = path.join(outDir, 'imported-native-family-baseline.pptx')
const edited = path.join(outDir, 'imported-native-family-edited.pptx')
const reset = path.join(outDir, 'imported-native-family-reset.pptx')
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const mcp = createMcpToolDispatcher({ sessionId: `verify-imported-native-family-${Date.now()}` })
const dataOf = result => { if (!result?.ok) throw new Error(JSON.stringify(result)); return result.data || result }

await fs.mkdir(outDir, { recursive: true })
const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'BetterPPTX imported-family proof'; pptx.title = 'Imported native family mutation'; pptx.company = 'BetterPPTX'; pptx.lang = 'en-US'
let slide = pptx.addSlide(); slide.background = { color: 'F8FAFC' }; slide.addTable([['Metric', 'Value'], ['Pipeline', '72']], { x: 0.8, y: 1.1, w: 5.2, h: 1.8, objectName: 'import-table', fill: { color: 'FFFFFF' }, border: { color: 'CBD5E1', pt: 1 }, fontSize: 13 }); slide.addChart('bar', [{ name: 'Baseline', labels: ['FY23', 'FY24'], values: [40, 64] }], { x: 6.2, y: 1.1, w: 6.2, h: 3.7, objectName: 'import-chart', showLegend: true, chartColors: ['2563EB'], title: 'Baseline', showTitle: true })
slide = pptx.addSlide(); slide.background = { color: 'FFFFFF' }; slide.addSmartArt({ x: 0.8, y: 1.1, w: 8.5, h: 2.4, objectName: 'import-smartart', mode: 'native', layout: 'Basic Process', nodes: ['Plan', 'Build', 'Ship'] })
await pptx.writeFile({ fileName: baseline, compression: false })

const opened = dataOf(await mcp.call('betterpptx.deck.open_uploaded', { data: (await fs.readFile(baseline)).toString('base64'), fileName: 'imported-native-family-baseline.pptx', preserveTiming: true }))
let activeDeckId = opened.deckId
const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: activeDeckId, mode: 'current', detail: 'full' }))
let sourceSpec = exported.spec || exported.data?.spec
const kinds = sourceSpec.slides.flatMap(slide => (slide.content || []).map(shape => ({ objectName: shape.objectName, kind: shape.kind, relationshipKinds: shape.relationshipKinds || null })))
const patchSlides = (tableBlock, chartBlock, smartArtBlock) => ({ ...sourceSpec, contentStory: sourceSpec.contentStory || { audience: 'presentation authors', outcome: 'mutate imported native data objects', remember: 'native edits remain editable and resettable' }, visualDesign: sourceSpec.visualDesign || { world: 'blueprint', framing: 'imported family mutation proof' }, motionTime: sourceSpec.motionTime || { masterClock: 'static', timingSource: 'static visual clock', syncPolicy: 'one static visual clock' }, slides: sourceSpec.slides.map((item, index) => { const blocks = index === 0 ? [tableBlock, chartBlock].filter(Boolean) : index === 1 ? [smartArtBlock].filter(Boolean) : []; return index === 0 && tableBlock || index === 0 && chartBlock || index === 1 && smartArtBlock ? { ...item, ...(index === 1 ? { transition: { type: 'morph', option: 'byObject' } } : {}), content: blocks } : item }) })
const runSpecPatch = async (spec, key) => {
  const dry = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { deckId: activeDeckId, spec, phase: 'dryRun', commitMode: 'patch', plan: 'premium', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `${key}-dry` }))
  return dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { deckId: activeDeckId, spec, phase: 'commit', commitMode: 'patch', plan: 'premium', planId: dry.planId, lockedPlanId: dry.planId, planDigest: dry.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: key }))
}
const editTableBlock = { kind: 'table-panel', objectName: 'import-table', patch: { operations: [{ op: 'setCell', row: 1, col: 0, text: 'Northstar', options: { bold: true } }, { op: 'setCell', row: 1, col: 1, text: '120', options: { color: '047857' } }] } }
const editChartBlock = { kind: 'chart-panel', objectName: 'import-chart', patch: { data: [{ name: 'FY26', labels: ['Plan', 'Actual', 'Stretch'], values: [80, 120, 140] }], optionsPatch: { chartColors: ['0F766E'], showLegend: false, showValue: true, title: 'FY26 Progress', showTitle: true } } }
const editSmartArtBlock = { kind: 'smartart', objectName: 'import-smartart', patch: { nodes: ['Launch', 'Learn', 'Scale'], quickStyleId: 'urn:microsoft.com/office/officeart/2005/8/quickstyle/3d1', colorStyleId: 'urn:microsoft.com/office/officeart/2005/8/colors/accent1_2' } }
const tableUpdate = await runSpecPatch(patchSlides(editTableBlock, null, null), 'import-family-edit-table')
sourceSpec = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: activeDeckId, mode: 'current', detail: 'full' })).spec
const chartUpdate = await runSpecPatch(patchSlides(null, editChartBlock, null), 'import-family-edit-chart')
sourceSpec = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: activeDeckId, mode: 'current', detail: 'full' })).spec
const smartArtUpdate = await runSpecPatch(patchSlides(null, null, editSmartArtBlock), 'import-family-edit-smartart')
const editedReadback = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: activeDeckId, mode: 'current', detail: 'full' })).spec
const editedQuality = dataOf(await mcp.call('betterpptx.deck.validate_quality', { deckId: opened.deckId, detail: 'full' }))
const editedSave = dataOf(await mcp.call('betterpptx.deck.save', { deckId: opened.deckId, outputDir: outDir, fileName: path.basename(edited), idempotencyKey: 'import-family-save-edited' }))
await mcp.call('betterpptx.deck.dispose', { deckId: activeDeckId })
const resetOpened = dataOf(await mcp.call('betterpptx.deck.open_uploaded', { data: (await fs.readFile(edited)).toString('base64'), fileName: 'imported-native-family-edited.pptx', preserveTiming: true }))
activeDeckId = resetOpened.deckId
sourceSpec = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: activeDeckId, mode: 'current', detail: 'full' })).spec
const resetTableBlock = { kind: 'table-panel', objectName: 'import-table', patch: { operations: [{ op: 'setCell', row: 1, col: 0, text: 'Pipeline' }, { op: 'setCell', row: 1, col: 1, text: '72' }] } }
const resetChartBlock = { kind: 'chart-panel', objectName: 'import-chart', patch: { data: [{ name: 'Baseline', labels: ['FY23', 'FY24'], values: [40, 64] }], optionsPatch: { chartColors: ['2563EB'], showLegend: true, showValue: null, title: 'Baseline', showTitle: true } } }
const resetSmartArtBlock = { kind: 'smartart', objectName: 'import-smartart', patch: { nodes: ['Plan', 'Build', 'Ship'], quickStyleId: null, colorStyleId: null } }
const resetTable = await runSpecPatch(patchSlides(resetTableBlock, null, null), 'import-family-reset-table')
sourceSpec = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: activeDeckId, mode: 'current', detail: 'full' })).spec
const resetChart = await runSpecPatch(patchSlides(null, resetChartBlock, null), 'import-family-reset-chart')
sourceSpec = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: activeDeckId, mode: 'current', detail: 'full' })).spec
const resetSmartArt = await runSpecPatch(patchSlides(null, null, resetSmartArtBlock), 'import-family-reset-smartart')
const resetQuality = dataOf(await mcp.call('betterpptx.deck.validate_quality', { deckId: activeDeckId, detail: 'full' }))
const resetSave = dataOf(await mcp.call('betterpptx.deck.save', { deckId: activeDeckId, outputDir: outDir, fileName: path.basename(reset), idempotencyKey: 'import-family-save-reset' }))
await mcp.call('betterpptx.deck.dispose', { deckId: activeDeckId })

async function packageAudit(filePath) {
  const zip = await JSZip.loadAsync(await fs.readFile(filePath), { checkCRC32: true })
  const names = Object.keys(zip.files).filter(name => !zip.files[name].dir)
  const read = async name => zip.file(name)?.async('string') || ''
  const slideXml = (await Promise.all(names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).map(read))).join('\n')
  const chartXml = (await Promise.all(names.filter(name => /^ppt\/charts\/chart\d+\.xml$/.test(name)).map(read))).join('\n')
  const diagramXml = (await Promise.all(names.filter(name => /^ppt\/diagrams\/(?:data|drawing)\d+\.xml$/.test(name)).map(read))).join('\n')
  return { bytes: (await fs.stat(filePath)).size, sha256: sha256(await fs.readFile(filePath)), slideCount: names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length, chartCount: names.filter(name => /^ppt\/charts\/chart\d+\.xml$/.test(name)).length, diagramCount: names.filter(name => /^ppt\/diagrams\/data\d+\.xml$/.test(name)).length, tableEdited: slideXml.includes('Northstar'), chartEdited: chartXml.includes('FY26') && chartXml.includes('120'), smartArtEdited: diagramXml.includes('Launch') && diagramXml.includes('Scale'), resetTable: slideXml.includes('Pipeline') && slideXml.includes('72'), resetChart: chartXml.includes('FY23') && chartXml.includes('64'), resetSmartArt: diagramXml.includes('Plan') && diagramXml.includes('Ship') }
}
const editedAudit = await packageAudit(edited); const resetAudit = await packageAudit(reset)
const readbackObject = objectName => editedReadback.slides.flatMap(slide => slide.content || []).find(item => item.objectName === objectName) || null
const report = { schemaVersion: 'betterpptx.imported-native-family-mutation.v1', status: editedAudit.tableEdited && editedAudit.chartEdited && editedAudit.smartArtEdited && resetAudit.resetTable && resetAudit.resetChart && resetAudit.resetSmartArt ? 'PASS' : 'FAIL', source: path.relative(root, baseline).replaceAll('\\', '/'), imported: { slideCount: opened.slideCount, shapeCount: opened.shapeCount, kinds }, mutations: { tableUpdate, chartUpdate, smartArtUpdate, editedReadback: { table: readbackObject('import-table'), chart: readbackObject('import-chart'), smartArt: readbackObject('import-smartart') } }, resets: { resetTable, resetChart, resetSmartArt }, quality: { edited: editedQuality, reset: resetQuality }, edited: { file: path.relative(root, edited).replaceAll('\\', '/'), ...editedAudit }, reset: { file: path.relative(root, reset).replaceAll('\\', '/'), ...resetAudit }, failures: [] }
const reportPath = path.join(outDir, 'imported-native-family-mutation-proof.json'); const reportBytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`); await fs.writeFile(reportPath, reportBytes); await fs.writeFile(`${reportPath}.sha256`, `${sha256(reportBytes)}  ${path.basename(reportPath)}\n`)
console.log(JSON.stringify({ status: report.status, reportPath, reportSha256: sha256(reportBytes), editedSha256: editedAudit.sha256, resetSha256: resetAudit.sha256, failures: report.failures, imported: report.imported }, null, 2))
if (report.status !== 'PASS') process.exitCode = 1
