#!/usr/bin/env node
// Fresh Role-A public-client proof for SmartArt controls beyond category/style tiles.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const endpoint = process.argv.includes('--endpoint') ? process.argv[process.argv.indexOf('--endpoint') + 1] : 'https://betterpptx.tail070c3a.ts.net/mcp'
const evidenceDir = process.argv.includes('--evidence-dir') ? process.argv[process.argv.indexOf('--evidence-dir') + 1] : path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/smartart-format-parameters-public/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
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
const processLayoutId = 'urn:microsoft.com/office/officeart/2005/8/layout/process1'
const hierarchyLayoutId = 'urn:microsoft.com/office/officeart/2005/8/layout/orgChart1'
const pictureLayoutId = 'urn:microsoft.com/office/officeart/2005/8/layout/pList1'
const quickStyleId = 'urn:microsoft.com/office/officeart/2005/8/quickstyle/3d1'
const colorStyleId = 'urn:microsoft.com/office/officeart/2005/8/colors/accent1_2'
const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const values = [
	{ layoutId: processLayoutId, quickStyleId, colorStyleId, nodes: ['Discover', 'Explain', 'Apply'], style: { fontSize: 18, fontFace: 'Aptos Display', color: 'F8FAFC' } },
	{ layoutId: processLayoutId, quickStyleId, colorStyleId, rightToLeft: true, textColors: ['FFFFFF', 'FDE68A', 'BAE6FD'], nodes: ['One', 'Two', 'Three'], style: { fontSize: 16, color: 'FFFFFF' } },
	{ layoutId: hierarchyLayoutId, quickStyleId, colorStyleId, nodes: [{ text: 'CEO', role: 'root', children: [{ text: 'Product', role: 'manager', children: ['Design'] }, { text: 'Sales', role: 'manager' }] }], style: { fontSize: 15, color: '0F172A' } },
	{ layoutId: pictureLayoutId, quickStyleId, colorStyleId, nodes: [{ text: 'North', role: 'image', image: pixel }, { text: 'South', role: 'image', image: pixel }], style: { fontSize: 14, fontFace: 'Aptos', color: 'FFFFFF' } },
	{ layoutId: null, quickStyleId: null, colorStyleId: null, rightToLeft: null, textColors: null, nodes: ['Reset', 'Re-edit'], style: { fontSize: null, color: null } },
]
const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Public SmartArt format parameter proof',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', geometryAuthority: 'engine', placementPolicy: 'semantic-layout-only', textPolicy: 'Semantic content only; the engine owns geometry, fit, and balance.' },
	contentStory: { audience: 'presentation authors', outcome: 'prove public native SmartArt controls', remember: 'diagram selectors and topology remain editable' },
	visualDesign: { world: 'blueprint', framing: 'five native SmartArt format checkpoints' }, motionTime: { masterClock: 'static', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' }, styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' }, validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true },
	slides: values.map((value, index) => ({ id: `smartart-format-${index + 1}`, title: 'Native SmartArt format control', message: `The SmartArt checkpoint ${index + 1} remains editable.`, layoutIntent: 'title-only', content: [{ kind: 'smartart', name: `smartart-format-${index + 1}`, region: 'primary-visual', mode: 'native', altText: `Editable native SmartArt checkpoint ${index + 1}`, ...value }] })),
}
const roleA = client('betterpptx-public-smartart-format-parameters-role-a'); await roleA.initialize()
const listed = await roleA.rpc('tools/list'); const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const catalog = await roleA.call('betterpptx.options.catalog', { surface: 'smartArtLayout', format: 'full' }); const surfaces = catalog?.data?.data?.surfaces || catalog?.data?.surfaces || []; const surface = surfaces.find(item => item.id === 'smartArtLayout')
const sourceBytes = Buffer.from(JSON.stringify(spec, null, 2), 'utf8')
const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${sourceBytes.toString('base64')}`, fileName: 'smartart-format-parameters-public.json', idempotencyKey: `smartart-format-parameters-${Date.now()}-${crypto.randomUUID()}` }); const handle = upload?.data?.handle || upload?.handle
const dryRun = handle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: handle, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `smartart-format-parameters-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false, error: { code: 'UPLOAD_DID_NOT_RETURN_HANDLE' } }
const dryData = dryRun?.data || dryRun || {}
const boundarySpec = JSON.parse(JSON.stringify(spec)); boundarySpec.title = 'Public SmartArt format boundary probe'; boundarySpec.slides[0].content[0].style.fontSize = 400.1
const boundaryBytes = Buffer.from(JSON.stringify(boundarySpec, null, 2), 'utf8')
const boundaryUpload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${boundaryBytes.toString('base64')}`, fileName: 'smartart-format-parameters-boundary.json', idempotencyKey: `smartart-format-parameters-boundary-upload-${Date.now()}-${crypto.randomUUID()}` }); const boundaryHandle = boundaryUpload?.data?.handle || boundaryUpload?.handle
const boundaryDryRun = boundaryHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: boundaryHandle, phase: 'resolve', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `smartart-format-parameters-boundary-resolve-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false, error: { code: 'BOUNDARY_UPLOAD_DID_NOT_RETURN_HANDLE' } }
const publicResponseText = JSON.stringify({ catalog, upload, dryRun, boundaryUpload, boundaryDryRun }); const privateLeakMatches = publicResponseText.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g) || []; const parameterIds = surface?.parameters?.map(item => item.id) || []
const expected = ['layoutId', 'quickStyleId', 'colorStyleId', 'presetFallback', 'rightToLeft', 'fontSize', 'fontFace', 'color', 'textColors', 'palette', 'nodes', 'title', 'altText']
const checks = { freshPublicSession: true, servedDiscovery: servedNames.includes('betterpptx.options.catalog') && servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec'), smartArtCatalogPresent: catalog?.ok === true && surface?.id === 'smartArtLayout' && surface?.capabilityMode === 'preset-plus-parameters', manualParameterUnionPresent: parameterIds.length >= 13 && expected.every(id => parameterIds.includes(id)), jsonSpecUpload: upload?.ok === true && typeof handle === 'string' && handle.startsWith('asset://locked/uploaded-jsonspec/'), dryRunMutationFree: dryRun?.ok === true && dryData.phase === 'dryRun' && dryData.mutationFree === true && !dryData.deckId, fiveCheckpointsReachPublicPlan: dryRun?.ok === true && dryData.slideCount === values.length && Number(dryData.objectCount) >= values.length, upperBoundaryRejected: boundaryUpload?.ok === true && typeof boundaryHandle === 'string' && boundaryDryRun?.ok === false, upperBoundaryMessage: /400\.1|fontSize|points|between/i.test(boundaryDryRun?.error?.message || ''), noPrivateImplementationLeakage: privateLeakMatches.length === 0 }
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
const evidence = redact({ schemaVersion: 'betterpptx.public-smartart-format-parameters-proof.v1', status, generatedAt: new Date().toISOString(), endpoint, roleA: { freshSession: true, servedToolCount: servedNames.length, servedToolNamesSha256: sha256(JSON.stringify(servedNames)), catalogSurface: 'smartArtLayout', catalogDigest: sha256(JSON.stringify(catalog)), parameterCount: parameterIds.length, parameterIds }, request: { values, sourceSha256: sha256(sourceBytes), sourceBytes: sourceBytes.length, resetSemantics: 'null manual fields are removed before selected SmartArt defaults are applied' }, dryRun: { ok: dryRun?.ok === true, phase: dryData.phase, mutationFree: dryData.mutationFree, slideCount: dryData.slideCount, objectCount: dryData.objectCount, specDigest: dryData.specDigest, planDigest: dryData.planDigest, planId: dryData.planId, errorCode: dryRun?.error?.code || null, errorMessage: dryRun?.error?.message || null, fiveCheckpointsReachPublicPlan: checks.fiveCheckpointsReachPublicPlan }, boundaryProbe: { requestedValue: 400.1, uploadOk: boundaryUpload?.ok === true, rejected: checks.upperBoundaryRejected, errorCode: boundaryDryRun?.error?.code || null, errorMessage: boundaryDryRun?.error?.message || null }, checks, privateLeakMatches, interpretation: status === 'PASS' ? 'A fresh public client discovered the SmartArt gallery plus the expanded native layout/style/topology/text union, uploaded five checkpoints, completed a mutation-free dry-run, rejected fontSize 400.1, and showed no private leakage.' : 'Fresh Role-A public discovery or execution exposed a missing SmartArt parameter contract. The failure is preserved for the builder correction.' })
fs.mkdirSync(evidenceDir, { recursive: true }); const evidencePath = path.join(evidenceDir, status === 'PASS' ? 'smartart-format-parameters-public-proof.json' : 'failed-public-proof.json'); fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'); const evidenceSha256 = sha256(fs.readFileSync(evidencePath)); fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8'); console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2)); if (status !== 'PASS') process.exitCode = 1
