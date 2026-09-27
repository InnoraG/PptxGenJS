#!/usr/bin/env node
// Fresh Role-A public-client proof for the typed Picture 3-D camera perspective control.
// The client uses only the public MCP contract; builder/private paths are never consulted.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const endpoint = process.argv.includes('--endpoint') ? process.argv[process.argv.indexOf('--endpoint') + 1] : 'https://betterpptx.tail070c3a.ts.net/mcp'
const evidenceDir = process.argv.includes('--evidence-dir') ? process.argv[process.argv.indexOf('--evidence-dir') + 1] : path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/picture3d-perspective-public/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
const values = [0, 45, 60, 90, 120, 67.5]
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
function parseResponse(text) { const line = String(text || '').trim().split(/\r?\n/).find(item => item.startsWith('data:')); return JSON.parse(line ? line.slice(5).trim() : text) }
function redact(value) {
	if (typeof value === 'string') return value.replace(/(?:[A-Z]:)?[\\/][^\s"']*PptxGenJS_Claude[^\s"']*/gi, '[local-path-redacted]').replace(/node_modules|engine\.mjs/gi, '[private-detail-redacted]')
	if (Array.isArray(value)) return value.map(redact)
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]))
	return value
}
const ONE_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8x8AAwMCAO+/p9sAAAAASUVORK5CYII='
const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Public Picture 3-D camera perspective parameter proof',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	contentStory: { audience: 'presentation authors', outcome: 'prove a typed native Picture 3-D camera perspective slider is publicly executable', remember: 'perspectiveDeg is an independent camera value, not a gallery preset' },
	visualDesign: { world: 'blueprint', framing: 'six native picture 3-D perspective proof objects' },
	motionTime: { masterClock: 'authored slide timing', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' },
	styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' },
	validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true },
	slides: values.map((perspectiveDeg, index) => ({
		id: `picture3d-perspective-${index + 1}`, title: 'Picture 3-D camera perspective canary', message: `The same native picture 3-D camera is rendered with perspective ${perspectiveDeg} degrees.`, layoutIntent: 'title-only',
		content: [{ kind: 'image', name: `picture3d-perspective-${index + 1}`, data: ONE_PIXEL_PNG, altText: `Picture 3-D perspective ${perspectiveDeg} degrees`, region: 'hero', pictureStyle: { threeD: { camera: { preset: 'perspectiveFront', perspectiveDeg } }, line: { type: 'solid', widthPt: 1, color: { color: '38BDF8' } } } }],
		notes: `Static Picture 3-D camera perspective checkpoint ${perspectiveDeg} degrees.`,
	})),
}
function client(name) {
	let sessionId = null; let requestId = 0
	return {
		async rpc(method, params = {}) { const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sessionId ? { 'mcp-session-id': sessionId } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }) }); if (!sessionId) sessionId = response.headers.get('mcp-session-id'); return parseResponse(await response.text()) },
		async call(name_, args = {}) { const response = await this.rpc('tools/call', { name: name_, arguments: args }); const text = response?.result?.content?.find(item => item.type === 'text')?.text; return text ? JSON.parse(text) : response },
		async initialize() { await this.rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name, version: '1' }, capabilities: {} }); await this.rpc('notifications/initialized') },
	}
}
const roleA = client('betterpptx-public-picture3d-perspective-role-a')
await roleA.initialize()
const listed = await roleA.rpc('tools/list')
const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const catalog = await roleA.call('betterpptx.options.catalog', { surface: 'picture3D', format: 'full' })
const surfaces = catalog?.data?.data?.surfaces || catalog?.data?.surfaces || []
const picture3DSurface = surfaces.find(surface => surface.id === 'picture3D')
const perspectiveParameter = Array.isArray(picture3DSurface?.parameters) ? picture3DSurface.parameters.find(parameter => parameter.id === 'perspectiveDeg') : null
const catalogText = JSON.stringify(catalog)
const sourceBytes = Buffer.from(JSON.stringify(spec, null, 2), 'utf8')
const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${sourceBytes.toString('base64')}`, fileName: 'picture3d-perspective-public.json', idempotencyKey: `picture3d-perspective-public-${Date.now()}-${crypto.randomUUID()}` })
const handle = upload?.data?.handle || upload?.handle
const dryRun = handle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: handle, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `picture3d-perspective-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false, error: { code: 'UPLOAD_DID_NOT_RETURN_HANDLE' } }
const dryData = dryRun?.data || dryRun || {}
const boundarySpec = JSON.parse(JSON.stringify(spec)); boundarySpec.title = 'Public Picture 3-D perspective boundary probe'; boundarySpec.slides[0].content[0].pictureStyle.threeD.camera.perspectiveDeg = 120.1
const boundaryBytes = Buffer.from(JSON.stringify(boundarySpec, null, 2), 'utf8')
const boundaryUpload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${boundaryBytes.toString('base64')}`, fileName: 'picture3d-perspective-boundary.json', idempotencyKey: `picture3d-perspective-boundary-upload-${Date.now()}-${crypto.randomUUID()}` })
const boundaryHandle = boundaryUpload?.data?.handle || boundaryUpload?.handle
const boundaryDryRun = boundaryHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: boundaryHandle, phase: 'resolve', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `picture3d-perspective-boundary-resolve-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false, error: { code: 'BOUNDARY_UPLOAD_DID_NOT_RETURN_HANDLE' } }
const publicResponseText = JSON.stringify({ catalog, upload, dryRun, boundaryUpload, boundaryDryRun })
const privateLeakMatches = publicResponseText.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g) || []
const checks = {
	freshPublicSession: true,
	servedDiscovery: servedNames.includes('betterpptx.options.catalog') && servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec'),
	picture3DCatalogPresent: catalog?.ok === true && picture3DSurface?.id === 'picture3D' && picture3DSurface?.capabilityMode === 'parameterized',
	perspectiveParameterContractPresent: perspectiveParameter?.type === 'continuous' && perspectiveParameter?.valueType === 'number' && perspectiveParameter?.minimum === 0 && perspectiveParameter?.maximum === 120 && perspectiveParameter?.default === 45 && String(perspectiveParameter?.unit || '') === 'degrees',
	jsonSpecUpload: upload?.ok === true && typeof handle === 'string' && handle.startsWith('asset://locked/uploaded-jsonspec/'),
	dryRunMutationFree: dryRun?.ok === true && dryData.phase === 'dryRun' && dryData.mutationFree === true && !dryData.deckId,
	sixPerspectiveValuesReachPublicPlan: dryRun?.ok === true && dryData.slideCount === values.length && Number(dryData.objectCount) >= values.length,
	upperBoundaryRejected: boundaryUpload?.ok === true && typeof boundaryHandle === 'string' && boundaryDryRun?.ok === false,
	upperBoundaryMessage: /120|perspective|degrees|camera/i.test(boundaryDryRun?.error?.message || ''),
	noPrivateImplementationLeakage: privateLeakMatches.length === 0,
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
const evidence = redact({ schemaVersion: 'betterpptx.public-picture3d-perspective-proof.v1', status, generatedAt: new Date().toISOString(), endpoint, roleA: { freshSession: true, servedToolCount: servedNames.length, servedToolNamesSha256: sha256(JSON.stringify(servedNames)), catalogSurface: 'picture3D', catalogDigest: sha256(catalogText), perspectiveParameter, uploadedCanonicalSha256: upload?.data?.canonicalSha256 || upload?.canonicalSha256 || null, specHandleReturned: Boolean(handle) }, request: { values, sourceSha256: sha256(sourceBytes), sourceBytes: sourceBytes.length, staticContent: true, nativeCarrier: 'pictureStyle.threeD.camera', parameter: 'picture-3d.camera.perspectiveDeg', valueType: 'number', unit: 'degrees', serializer: 'a:camera/@fov = round(perspectiveDeg * 60000)' }, dryRun: { ok: dryRun?.ok === true, phase: dryData.phase, mutationFree: dryData.mutationFree, slideCount: dryData.slideCount, objectCount: dryData.objectCount, specDigest: dryData.specDigest, planDigest: dryData.planDigest, planId: dryData.planId, sixPerspectiveValuesReachPublicPlan: checks.sixPerspectiveValuesReachPublicPlan }, boundaryProbe: { requestedValue: 120.1, uploadOk: boundaryUpload?.ok === true, rejected: checks.upperBoundaryRejected, errorCode: boundaryDryRun?.error?.code || null, errorMessage: boundaryDryRun?.error?.message || null }, checks, privateLeakMatches, interpretation: status === 'PASS' ? 'A fresh public client discovered the continuous Picture 3-D camera perspective contract, uploaded six static checkpoints, completed a mutation-free public dry-run, rejected 120.1, and showed no private leakage. Native XML, PowerPoint SaveCopyAs/reopen, and visual certification remain covered by the immutable local builder proof.' : 'Fresh Role-A public discovery/execution exposed a missing or incomplete public Picture 3-D perspective contract. This failure is preserved for the builder correction; no capability is certified from schema acceptance alone.' })
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, status === 'PASS' ? 'picture3d-perspective-public-proof.json' : 'failed-public-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath)); fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
if (status !== 'PASS') process.exitCode = 1
