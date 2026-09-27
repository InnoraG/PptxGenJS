#!/usr/bin/env node
// Fresh Role-A public-client proof for chart formatting beyond chart-type presets.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const endpoint = process.argv.includes('--endpoint') ? process.argv[process.argv.indexOf('--endpoint') + 1] : 'https://betterpptx.tail070c3a.ts.net/mcp'
const evidenceDir = process.argv.includes('--evidence-dir') ? process.argv[process.argv.indexOf('--evidence-dir') + 1] : path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/chart-format-parameters-public/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
function parseResponse(text) { const index = String(text || '').indexOf('data:'); return JSON.parse((index >= 0 ? String(text).slice(index + 5) : String(text)).trim()) }
function redact(value) {
	if (typeof value === 'string') return value.replace(/(?:[A-Z]:)?[\\/][^\s"']*PptxGenJS_Claude[^\s"']*/gi, '[local-path-redacted]').replace(/node_modules|engine\.mjs/gi, '[private-detail-redacted]')
	if (Array.isArray(value)) return value.map(redact)
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]))
	return value
}
function client(name) {
	let sessionId = null; let requestId = 0
	return {
		async rpc(method, params = {}) {
			const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sessionId ? { 'mcp-session-id': sessionId } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }) })
			if (!sessionId) sessionId = response.headers.get('mcp-session-id')
			return parseResponse(await response.text())
		},
		async call(tool, args = {}) { const response = await this.rpc('tools/call', { name: tool, arguments: args }); const text = response?.result?.content?.find(item => item.type === 'text')?.text; return text ? JSON.parse(text) : response },
		async initialize() { await this.rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name, version: '1' }, capabilities: {} }); await this.rpc('notifications/initialized') },
	}
}
const values = [
	{ chartType: 'bar', chartOptions: { showLegend: true, legendPos: 'b', chartColorsOpacity: 72, showValue: true, valAxisMinVal: 0, valAxisMaxVal: 40, valAxisMajorUnit: 10, catAxisLabelRotate: -35 } },
	{ chartType: 'line', chartOptions: { showLegend: true, lineSize: 3, lineDataSymbol: 'diamond', lineDataSymbolSize: 9, lineSmooth: true, chartArea: { fill: { color: 'FFFFFF' }, border: { color: 'CBD5E1', pt: 1.1 }, roundedCorners: false }, plotArea: { fill: { color: 'F8FAFC' } } } },
	{ chartType: 'doughnut', chartOptions: { showLegend: true, showPercent: true, showLeaderLines: true, firstSliceAng: 270, holeSize: 62, dataLabelPosition: 'bestFit' } },
	{ chartType: 'bar3D', chartOptions: { v3DRotX: 18, v3DRotY: 42, v3DPerspective: 24, barGapWidthPct: 80, barGapDepthPct: 70, barOverlapPct: 15 } },
	{ chartType: 'bar', chartOptions: { showLegend: null, chartColorsOpacity: null, valAxisMajorUnit: null, chartArea: null, plotArea: null } },
]
const chartData = [{ name: 'Signal', labels: ['A', 'B', 'C', 'D'], values: [12, 24, 18, 31] }, { name: 'Target', labels: ['A', 'B', 'C', 'D'], values: [15, 21, 26, 28] }]
const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Public chart format parameter proof',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', geometryAuthority: 'engine', placementPolicy: 'semantic-layout-only', textPolicy: 'Semantic content only; the engine owns geometry, fit, and balance.' },
	contentStory: { audience: 'presentation authors', outcome: 'prove public native chart format controls', remember: 'chart type remains selectable and manual sliders remain editable' },
	visualDesign: { world: 'blueprint', framing: 'five native chart format checkpoints' }, motionTime: { masterClock: 'static', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' }, styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' }, validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true },
	slides: values.map((value, index) => ({ id: `chart-format-${index + 1}`, title: 'Native chart format control', message: `The chart format checkpoint ${index + 1} remains editable.`, layoutIntent: 'title-only', content: [{ kind: 'chart-panel', name: `chart-format-${index + 1}`, region: 'body', chartType: value.chartType, data: chartData, verified: true, evidenceSource: 'public-chart-format-proof-v1', altText: `Editable native chart format checkpoint ${index + 1}`, chartOptions: value.chartOptions }] })),
}
const roleA = client('betterpptx-public-chart-format-parameters-role-a'); await roleA.initialize()
const listed = await roleA.rpc('tools/list'); const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const catalog = await roleA.call('betterpptx.options.catalog', { surface: 'chartPreset', format: 'full' }); const surfaces = catalog?.data?.data?.surfaces || catalog?.data?.surfaces || []; const surface = surfaces.find(item => item.id === 'chartPreset')
const sourceBytes = Buffer.from(JSON.stringify(spec, null, 2), 'utf8')
const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${sourceBytes.toString('base64')}`, fileName: 'chart-format-parameters-public.json', idempotencyKey: `chart-format-parameters-${Date.now()}-${crypto.randomUUID()}` }); const handle = upload?.data?.handle || upload?.handle
const dryRun = handle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: handle, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `chart-format-parameters-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false, error: { code: 'UPLOAD_DID_NOT_RETURN_HANDLE' } }
const dryData = dryRun?.data || dryRun || {}
const commit = dryRun?.ok === true && dryData.planId ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: handle, phase: 'commit', commitMode: 'createNew', plan: 'premium', planId: dryData.planId, lockedPlanId: dryData.planId, planDigest: dryData.planDigest, validateAfterCompile: true, validationMode: 'strict', saveAfterCommit: false, idempotencyKey: `chart-format-parameters-commit-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const commitData = commit?.data || commit || {}
const deckId = commitData.deckId || commit?.deckId
const deckVersion = commitData.deckVersion || commit?.deckVersion
const quality = deckId ? await roleA.call('betterpptx.deck.validate_quality', { deckId, deckVersion, profile: 'modern' }) : { ok: false }
const preview = deckId && quality?.ok === true ? await roleA.call('betterpptx.deck.preview', { deckId, deckVersion, slides: [0, 1, 2, 3, 4] }) : { ok: false }
const save = deckId && preview?.ok === true ? await roleA.call('betterpptx.deck.save', { deckId, deckVersion, fileName: 'chart-format-parameters-public-proof.pptx', outputFormat: 'pptx', idempotencyKey: `chart-format-parameters-save-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const boundarySpec = JSON.parse(JSON.stringify(spec)); boundarySpec.title = 'Public chart format upper-boundary probe'; boundarySpec.slides[0].content[0].chartOptions.chartColorsOpacity = 100.1
const boundaryBytes = Buffer.from(JSON.stringify(boundarySpec, null, 2), 'utf8')
const boundaryUpload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${boundaryBytes.toString('base64')}`, fileName: 'chart-format-parameters-boundary.json', idempotencyKey: `chart-format-parameters-boundary-upload-${Date.now()}-${crypto.randomUUID()}` }); const boundaryHandle = boundaryUpload?.data?.handle || boundaryUpload?.handle
const boundaryDryRun = boundaryHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: boundaryHandle, phase: 'resolve', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `chart-format-parameters-boundary-resolve-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false, error: { code: 'BOUNDARY_UPLOAD_DID_NOT_RETURN_HANDLE' } }
const publicResponseText = JSON.stringify({ catalog, upload, dryRun, commit, quality, preview, save, boundaryUpload, boundaryDryRun }); const privateLeakMatches = publicResponseText.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g) || []; const parameterIds = surface?.parameters?.map(item => item.id) || []
const expected = ['chartColorsOpacity', 'showLegend', 'legendPos', 'valAxisMajorUnit', 'lineSize', 'lineDataSymbolSize', 'firstSliceAng', 'holeSize', 'v3DRotX', 'chartArea', 'plotArea', 'catAxes', 'valAxes']
const checks = { freshPublicSession: true, servedDiscovery: servedNames.includes('betterpptx.options.catalog') && servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec'), chartCatalogPresent: catalog?.ok === true && surface?.id === 'chartPreset' && surface?.capabilityMode === 'preset-plus-parameters' && surface?.canonical?.length === 9, manualParameterUnionPresent: parameterIds.length >= 40 && expected.every(id => parameterIds.includes(id)), jsonSpecUpload: upload?.ok === true && typeof handle === 'string' && handle.startsWith('asset://locked/uploaded-jsonspec/'), dryRunMutationFree: dryRun?.ok === true && dryData.phase === 'dryRun' && dryData.mutationFree === true && !dryData.deckId, fiveCheckpointsReachPublicPlan: dryRun?.ok === true && dryData.slideCount === values.length && Number(dryData.objectCount) >= values.length, commit: commit?.ok === true, quality: quality?.ok === true, preview: preview?.ok === true, savedArtifact: save?.ok === true, upperBoundaryRejected: boundaryUpload?.ok === true && typeof boundaryHandle === 'string' && boundaryDryRun?.ok === false, upperBoundaryMessage: /100\.1|chartColorsOpacity|percent|between/i.test(boundaryDryRun?.error?.message || ''), noPrivateImplementationLeakage: privateLeakMatches.length === 0 }
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
const evidence = redact({ schemaVersion: 'betterpptx.public-chart-format-parameters-proof.v1', status, generatedAt: new Date().toISOString(), endpoint, roleA: { freshSession: true, servedToolCount: servedNames.length, servedToolNamesSha256: sha256(JSON.stringify(servedNames)), catalogSurface: 'chartPreset', catalogDigest: sha256(JSON.stringify(catalog)), chartFamilyCount: surface?.canonical?.length || 0, parameterCount: parameterIds.length, parameterIds }, request: { values, sourceSha256: sha256(sourceBytes), sourceBytes: sourceBytes.length, resetSemantics: 'null manual fields are removed before selected chart-type defaults are applied' }, dryRun: { ok: dryRun?.ok === true, phase: dryData.phase, mutationFree: dryData.mutationFree, slideCount: dryData.slideCount, objectCount: dryData.objectCount, specDigest: dryData.specDigest, planDigest: dryData.planDigest, planId: dryData.planId, fiveCheckpointsReachPublicPlan: checks.fiveCheckpointsReachPublicPlan }, execution: { commitOk: commit?.ok === true, commitError: commit?.error || null, deckId: deckId || null, deckVersion: deckVersion || null, qualityOk: quality?.ok === true, qualityError: quality?.error || null, previewOk: preview?.ok === true, previewError: preview?.error || null, saveOk: save?.ok === true, saveError: save?.error || null }, boundaryProbe: { requestedValue: 100.1, uploadOk: boundaryUpload?.ok === true, rejected: checks.upperBoundaryRejected, errorCode: boundaryDryRun?.error?.code || null, errorMessage: boundaryDryRun?.error?.message || null }, checks, privateLeakMatches, interpretation: status === 'PASS' ? 'A fresh public client discovered the chart-type catalog plus the expanded native chart-format union, uploaded five checkpoints, completed a mutation-free dry-run, committed, passed quality/preview/save, rejected chartColorsOpacity 100.1, and showed no private leakage.' : 'Fresh Role-A public discovery or execution exposed a missing chart-format parameter contract. The failure is preserved for the builder correction.' })
fs.mkdirSync(evidenceDir, { recursive: true }); const evidencePath = path.join(evidenceDir, status === 'PASS' ? 'chart-format-parameters-public-proof.json' : 'failed-public-proof.json'); fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'); const evidenceSha256 = sha256(fs.readFileSync(evidencePath)); fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8'); console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2)); if (status !== 'PASS') process.exitCode = 1
