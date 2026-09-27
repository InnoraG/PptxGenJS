#!/usr/bin/env node
// Fresh Role-A public-client proof for shared Text3D/shape 3-D bevel and contour controls.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const endpoint = process.argv.includes('--endpoint') ? process.argv[process.argv.indexOf('--endpoint') + 1] : 'https://betterpptx.tail070c3a.ts.net/mcp'
const evidenceDir = process.argv.includes('--evidence-dir') ? process.argv[process.argv.indexOf('--evidence-dir') + 1] : path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/text3d-bevel-contour-public/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
const values = [0, 4, 8, 16, 32]
const controls = [
	{ id: 'bevelBottomWidthPt', field: 'bevelBottom.width', semanticPath: 'options.text3D.bevelBottom.width' },
	{ id: 'bevelBottomHeightPt', field: 'bevelBottom.height', semanticPath: 'options.text3D.bevelBottom.height' },
	{ id: 'contourWidthPt', field: 'contourWidth', semanticPath: 'options.text3D.contourWidth' },
]
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
function parseResponse(text) { const line = String(text || '').trim().split(/\r?\n/).find(item => item.startsWith('data:')); return JSON.parse(line ? line.slice(5).trim() : text) }
function redact(value) {
	if (typeof value === 'string') return value.replace(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g, '[private-detail-redacted]')
	if (Array.isArray(value)) return value.map(redact)
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]))
	return value
}
const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Public Text3D bevel and contour parameter proof',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	contentStory: { audience: 'presentation authors', outcome: 'prove independent native bottom bevel and contour controls', remember: '3-D gallery presets are not the control ceiling' },
	visualDesign: { world: 'blueprint', framing: 'static native Text3D proof objects' },
	motionTime: { masterClock: 'authored slide timing', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' },
	styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' },
	validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true },
	slides: controls.flatMap(control => values.map((value, index) => ({
		id: `text3d-${control.id}-${index + 1}`, title: 'Text3D 3-D parameter canary', message: `The same native Text3D is rendered with a different ${control.field} value.`, layoutIntent: 'title-only',
		content: [{ kind: 'text3d', name: 'text3d-3d-parameter', text: 'Text3D 3-D parameter canary', text3D: { bevel: { type: 'circle', width: 4, height: 4 }, bevelBottom: { type: 'circle', width: control.field === 'bevelBottom.width' ? value : 8, height: control.field === 'bevelBottom.height' ? value : 8 }, extrusion: 24, extrusionColor: '38BDF8', contourWidth: control.field === 'contourWidth' ? value : 0, contourColor: 'F97316', material: 'matte', lightRig: 'threePt', rotationX: 18, rotationY: 22 } }],
		notes: `Static Text3D ${control.field} checkpoint ${value} points.`,
	}))),
}
const sourceBytes = Buffer.from(JSON.stringify(spec, null, 2), 'utf8')
function client(name) {
	let sessionId = null; let requestId = 0
	return {
		async rpc(method, params = {}) { const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sessionId ? { 'mcp-session-id': sessionId } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }) }); if (!sessionId) sessionId = response.headers.get('mcp-session-id'); return parseResponse(await response.text()) },
		async call(name_, args = {}) { const response = await this.rpc('tools/call', { name: name_, arguments: args }); const text = response?.result?.content?.find(item => item.type === 'text')?.text; return text ? JSON.parse(text) : response },
		async initialize() { await this.rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name, version: '1' }, capabilities: {} }); await this.rpc('notifications/initialized') },
	}
}
const roleA = client('betterpptx-public-text3d-bevel-contour-role-a')
await roleA.initialize()
const listed = await roleA.rpc('tools/list')
const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const catalog = await roleA.call('betterpptx.options.catalog', { surface: 'text3D', format: 'full' })
const surfaces = catalog?.data?.data?.surfaces || catalog?.data?.surfaces || []
const shapeSurface = surfaces.find(surface => surface.id === 'text3DShape')
const parameters = Array.isArray(shapeSurface?.parameters) ? shapeSurface.parameters : []
const parameterRows = Object.fromEntries(controls.map(control => [control.id, parameters.find(parameter => parameter.id === control.id)]))
const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${sourceBytes.toString('base64')}`, fileName: 'text3d-bevel-contour-public.json', idempotencyKey: `text3d-bevel-contour-public-${Date.now()}-${crypto.randomUUID()}` })
const handle = upload?.data?.handle || upload?.handle
const dryRun = handle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: handle, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `text3d-bevel-contour-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false, error: { code: 'UPLOAD_DID_NOT_RETURN_HANDLE' } }
const dryData = dryRun?.data || dryRun || {}
const boundarySpec = JSON.parse(JSON.stringify(spec)); boundarySpec.title = 'Public Text3D 3-D upper-bound rejection probe'; boundarySpec.slides[0].content[0].text3D.bevelBottom.width = 1000.1; boundarySpec.slides[1].content[0].text3D.contourWidth = 1000.1
const boundaryBytes = Buffer.from(JSON.stringify(boundarySpec, null, 2), 'utf8')
const boundaryUpload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${boundaryBytes.toString('base64')}`, fileName: 'text3d-bevel-contour-upper-bound-probe.json', idempotencyKey: `text3d-bevel-contour-boundary-upload-${Date.now()}-${crypto.randomUUID()}` })
const boundaryHandle = boundaryUpload?.data?.handle || boundaryUpload?.handle
const boundaryDryRun = boundaryHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: boundaryHandle, phase: 'resolve', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `text3d-bevel-contour-boundary-resolve-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false, error: { code: 'BOUNDARY_UPLOAD_DID_NOT_RETURN_HANDLE' } }
const publicResponseText = JSON.stringify({ catalog, upload, dryRun, boundaryUpload, boundaryDryRun })
const privateLeakMatches = publicResponseText.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g) || []
const checks = {
	freshPublicSession: true,
	servedDiscovery: servedNames.includes('betterpptx.options.catalog') && servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec'),
	shapeCatalogPresent: catalog?.ok === true && shapeSurface?.id === 'text3DShape' && shapeSurface?.capabilityMode === 'parameterized',
	bevelBottomWidthContract: parameterRows.bevelBottomWidthPt?.minimum === 0 && parameterRows.bevelBottomWidthPt?.maximum === 1000 && parameterRows.bevelBottomWidthPt?.default === 6 && parameterRows.bevelBottomWidthPt?.unit === 'points' && parameterRows.bevelBottomWidthPt?.semanticPath === controls[0].semanticPath,
	bevelBottomHeightContract: parameterRows.bevelBottomHeightPt?.minimum === 0 && parameterRows.bevelBottomHeightPt?.maximum === 1000 && parameterRows.bevelBottomHeightPt?.default === 6 && parameterRows.bevelBottomHeightPt?.unit === 'points' && parameterRows.bevelBottomHeightPt?.semanticPath === controls[1].semanticPath,
	contourWidthContract: parameterRows.contourWidthPt?.minimum === 0 && parameterRows.contourWidthPt?.maximum === 1000 && parameterRows.contourWidthPt?.default === 0 && parameterRows.contourWidthPt?.unit === 'points' && parameterRows.contourWidthPt?.semanticPath === controls[2].semanticPath,
	jsonSpecUpload: upload?.ok === true && typeof handle === 'string' && handle.startsWith('asset://locked/uploaded-jsonspec/'),
	dryRunMutationFree: dryRun?.ok === true && dryData.phase === 'dryRun' && dryData.mutationFree === true && !dryData.deckId,
	fifteenValuesReachPublicPlan: dryRun?.ok === true && dryData.slideCount === 15 && dryData.objectCount >= 15,
	upperBoundRejected: boundaryUpload?.ok === true && typeof boundaryHandle === 'string' && boundaryDryRun?.ok === false && /1000\.1|bevelBottom|contourWidth|between/i.test(boundaryDryRun?.error?.message || ''),
	noPrivateImplementationLeakage: privateLeakMatches.length === 0,
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
if (status !== 'PASS') throw new Error(`Public Text3D bevel/contour checks failed: ${JSON.stringify(checks)}; privateLeakMatches=${JSON.stringify(privateLeakMatches)}\n${JSON.stringify(redact({ catalog, upload, dryRun, boundaryUpload, boundaryDryRun }), null, 2).slice(0, 12000)}`)
const evidence = redact({
	schemaVersion: 'betterpptx.public-text3d-bevel-contour-proof.v1', status, generatedAt: new Date().toISOString(), endpoint,
	roleA: { freshSession: true, servedToolCount: servedNames.length, servedToolNamesSha256: sha256(JSON.stringify(servedNames)), catalogSurface: 'text3D', catalogDigest: sha256(JSON.stringify(catalog)), shapeSurfaceCapabilityMode: shapeSurface.capabilityMode, shapeSurfaceCapabilityStatus: shapeSurface.capabilityStatus, parameters: parameterRows, uploadedCanonicalSha256: upload?.data?.canonicalSha256 || upload?.canonicalSha256 || null, specHandleReturned: Boolean(handle) },
	request: { values, controls, sourceSha256: sha256(sourceBytes), sourceBytes: sourceBytes.length, staticContent: true, nativeCarriers: ['text3d', 'shape'], parameterizedFields: controls.map(control => control.semanticPath) },
	dryRun: { ok: dryRun?.ok === true, phase: dryData.phase, mutationFree: dryData.mutationFree, slideCount: dryData.slideCount, objectCount: dryData.objectCount, specDigest: dryData.specDigest, planDigest: dryData.planDigest, fifteenValuesReachPublicPlan: checks.fifteenValuesReachPublicPlan },
	boundaryProbe: { requestedPt: 1000.1, uploadOk: boundaryUpload?.ok === true, rejected: checks.upperBoundRejected, errorCode: boundaryDryRun?.error?.code || null, errorMessage: boundaryDryRun?.error?.message || null },
	checks, privateLeakMatches,
	interpretation: 'A fresh public client discovered and dry-ran independent bottom-bevel and contour parameters through the durable JSON-spec front door. Native XML, PowerPoint SaveCopyAs/reopen, and visual certification are covered by the separate local builder proof.',
})
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'text3d-bevel-contour-public-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath))
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
