// Fresh public-client proof for imported chart/table/SmartArt mutation and reset.
// The client sees only uploaded bytes, opaque deck handles, and exported semantic specs.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.argv.includes('--endpoint') ? process.argv[process.argv.indexOf('--endpoint') + 1] : 'https://betterpptx.tail070c3a.ts.net/mcp'
const baseline = path.resolve(process.argv.includes('--baseline') ? process.argv[process.argv.indexOf('--baseline') + 1] : 'outputs/authoring-principle-corpus/global-extended-option-five-point/imported-native-family-mutation/20260826T020343Z/imported-native-family-baseline.pptx')
const evidenceDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/imported-native-family-public/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
let sessionId = null
let rpcId = 0

function parseRpc(text) {
	const data = String(text).trim().split(/\r?\n/).find(line => line.startsWith('data:'))
	return JSON.parse(data ? data.slice(5).trim() : text)
}
async function rpc(method, params = {}) {
	const response = await fetch(endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sessionId ? { 'mcp-session-id': sessionId } : {}) },
		body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
	})
	if (!sessionId) sessionId = response.headers.get('mcp-session-id')
	return parseRpc(await response.text())
}
async function callTool(name, arguments_) {
	const result = await rpc('tools/call', { name, arguments: arguments_ })
	const text = result?.result?.content?.find(item => item.type === 'text')?.text
	const parsed = text ? JSON.parse(text) : result
	if (!parsed?.ok) throw new Error(`${name}: ${JSON.stringify(parsed)}`)
	return parsed.data || parsed
}
async function safeCallTool(name, arguments_) {
	try { return { ok: true, data: await callTool(name, arguments_) } } catch (error) { return { ok: false, error: String(error?.message || error) } }
}
function findObject(spec, objectName) {
	return (spec?.slides || []).flatMap(slide => slide.content || []).find(item => item.objectName === objectName) || null
}
function patchSlides(sourceSpec, block) {
	return {
		...sourceSpec,
		contentStory: sourceSpec.contentStory || { audience: 'presentation authors', outcome: 'mutate imported native data objects', remember: 'native edits remain editable and resettable' },
		visualDesign: sourceSpec.visualDesign || { world: 'blueprint', framing: 'public imported family mutation proof' },
		motionTime: sourceSpec.motionTime || { masterClock: 'static', timingSource: 'static visual clock', syncPolicy: 'one static visual clock' },
		slides: sourceSpec.slides.map((slide, index) => index === 0 && (block.kind === 'table-panel' || block.kind === 'chart-panel') || index === 1 && block.kind === 'smartart'
			? { ...slide, content: [block] }
			: slide),
	}
}
async function patchDeck(deckId, sourceSpec, block, key) {
	const spec = patchSlides(sourceSpec, block)
	const dry = await callTool('betterpptx.deck.generate_from_spec', { deckId, spec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `${key}-dry` })
	return await callTool('betterpptx.deck.generate_from_spec', { deckId, spec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: dry.planId, lockedPlanId: dry.planId, planDigest: dry.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: key })
}

await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'betterpptx-public-imported-family-v1', version: '1' }, capabilities: {} })
await rpc('notifications/initialized')
const uploaded = await callTool('betterpptx.deck.open_uploaded', { data: (await fs.readFile(baseline)).toString('base64'), fileName: 'imported-native-family-baseline.pptx', preserveTiming: true })
const deckId = uploaded.deckId
let sourceSpec = (await callTool('betterpptx.deck.export_spec', { deckId, mode: 'current', detail: 'full' })).spec
const sourceSummary = {
	slideCount: sourceSpec.slides?.length || 0,
	objects: ['import-table', 'import-chart', 'import-smartart'].map(objectName => ({ objectName, kind: findObject(sourceSpec, objectName)?.kind || null })),
}
const editBlocks = {
	table: { kind: 'table-panel', objectName: 'import-table', patch: { operations: [{ op: 'setCell', row: 1, col: 0, text: 'Northstar', options: { bold: true } }, { op: 'setCell', row: 1, col: 1, text: '120', options: { color: '047857' } }] } },
	chart: { kind: 'chart-panel', objectName: 'import-chart', patch: { data: [{ name: 'FY26', labels: ['Plan', 'Actual', 'Stretch'], values: [80, 120, 140] }], optionsPatch: { chartColors: ['0F766E'], showLegend: false, showValue: true, title: 'FY26 Progress', showTitle: true } } },
	smartart: { kind: 'smartart', objectName: 'import-smartart', patch: { nodes: ['Launch', 'Learn', 'Scale'], quickStyleId: 'urn:microsoft.com/office/officeart/2005/8/quickstyle/3d1', colorStyleId: 'urn:microsoft.com/office/officeart/2005/8/colors/accent1_2' } },
}
const editResults = {}
for (const [kind, block] of Object.entries(editBlocks)) {
	editResults[kind] = await patchDeck(deckId, sourceSpec, block, `public-import-family-edit-${kind}`)
	sourceSpec = (await callTool('betterpptx.deck.export_spec', { deckId, mode: 'current', detail: 'full' })).spec
}
const editedSpec = sourceSpec
const editedReadback = {
	table: findObject(editedSpec, 'import-table'),
	chart: findObject(editedSpec, 'import-chart'),
	smartart: findObject(editedSpec, 'import-smartart'),
}
const resetBlocks = {
	table: { kind: 'table-panel', objectName: 'import-table', patch: { operations: [{ op: 'setCell', row: 1, col: 0, text: 'Pipeline' }, { op: 'setCell', row: 1, col: 1, text: '72' }] } },
	chart: { kind: 'chart-panel', objectName: 'import-chart', patch: { data: [{ name: 'Baseline', labels: ['FY23', 'FY24'], values: [40, 64] }], optionsPatch: { chartColors: ['2563EB'], showLegend: true, showValue: null, title: 'Baseline', showTitle: true } } },
	smartart: { kind: 'smartart', objectName: 'import-smartart', patch: { nodes: ['Plan', 'Build', 'Ship'], quickStyleId: null, colorStyleId: null } },
}
const resetResults = {}
for (const [kind, block] of Object.entries(resetBlocks)) {
	resetResults[kind] = await patchDeck(deckId, sourceSpec, block, `public-import-family-reset-${kind}`)
	sourceSpec = (await callTool('betterpptx.deck.export_spec', { deckId, mode: 'current', detail: 'full' })).spec
}
const resetReadback = {
	table: findObject(sourceSpec, 'import-table'),
	chart: findObject(sourceSpec, 'import-chart'),
	smartart: findObject(sourceSpec, 'import-smartart'),
}
const deckVersion = Object.values(resetResults).map(result => result?.deckVersion).filter(Number.isFinite).at(-1) || undefined
const quality = await safeCallTool('betterpptx.deck.validate_quality', { deckId, deckVersion, profile: 'static', requireMotion: false, requireVisualProof: false })
const preview = quality.ok ? await safeCallTool('betterpptx.deck.preview', { deckId, deckVersion }) : { ok: false, error: 'quality gate did not pass' }
const save = preview.ok ? await safeCallTool('betterpptx.deck.save', { deckId, deckVersion, fileName: 'imported-native-family-public-proof.pptx', outputFormat: 'pptx', idempotencyKey: `public-import-family-save-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false, error: 'preview gate did not pass' }
const publicText = JSON.stringify({ uploaded, editResults, resetResults, editedReadback, resetReadback })
const checks = {
	sourceOpened: sourceSummary.slideCount === 2 && sourceSummary.objects.every(item => item.kind),
	tableEdited: JSON.stringify(editedReadback.table).includes('Northstar') && JSON.stringify(editedReadback.table).includes('120'),
	chartEdited: JSON.stringify(editedReadback.chart).includes('FY26') && JSON.stringify(editedReadback.chart).includes('FY26 Progress'),
	smartArtEdited: JSON.stringify(editedReadback.smartart).includes('Launch') && JSON.stringify(editedReadback.smartart).includes('Scale'),
	tableReset: JSON.stringify(resetReadback.table).includes('Pipeline') && JSON.stringify(resetReadback.table).includes('72'),
	chartReset: JSON.stringify(resetReadback.chart).includes('FY23') && JSON.stringify(resetReadback.chart).includes('Baseline'),
	smartArtReset: JSON.stringify(resetReadback.smartart).includes('Plan') && JSON.stringify(resetReadback.smartart).includes('Ship'),
	qualityGate: quality.ok,
	previewGate: preview.ok,
	saveGate: save.ok,
	publicLeakage: ![/D:\\PptxGenJS_Claude/i, /node_modules/i, /engine\.mjs/i, /PptxGenJS/i].some(pattern => pattern.test(publicText)),
}
const mutationChecks = ['sourceOpened', 'tableEdited', 'chartEdited', 'smartArtEdited', 'tableReset', 'chartReset', 'smartArtReset', 'publicLeakage']
const report = { schemaVersion: 'betterpptx.public-imported-native-family-mutation.v1', status: mutationChecks.every(key => checks[key]) ? 'PASS' : 'FAIL', generatedAt: new Date().toISOString(), endpoint, source: { file: path.basename(baseline), sha256: sha256(await fs.readFile(baseline)) }, deck: { deckId, deckVersion, sourceSummary }, checks, quality, preview, save, editResults, resetResults, editedReadback, resetReadback }
await fs.mkdir(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'public-imported-native-family-mutation-proof.json')
const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
await fs.writeFile(evidencePath, bytes)
await fs.writeFile(`${evidencePath}.sha256`, `${sha256(bytes)}  ${path.basename(evidencePath)}\n`)
console.log(JSON.stringify({ status: report.status, evidencePath, evidenceSha256: sha256(bytes), checks, sourceSummary }, null, 2))
if (report.status !== 'PASS') process.exitCode = 1
