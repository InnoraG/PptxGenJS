#!/usr/bin/env node
// Fresh Role-A public-client proof for the structured shape shadow angle control.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const endpoint = process.argv.includes('--endpoint') ? process.argv[process.argv.indexOf('--endpoint') + 1] : 'https://betterpptx.tail070c3a.ts.net/mcp'
const evidenceDir = process.argv.includes('--evidence-dir') ? process.argv[process.argv.indexOf('--evidence-dir') + 1] : path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/shape-shadow-angle-public/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
const values = [0, 90, 180, 270, 359]
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
function parseResponse(text) { const line = String(text || '').trim().split(/\r?\n/).find(item => item.startsWith('data:')); return JSON.parse(line ? line.slice(5).trim() : text) }
function redact(value) {
	if (typeof value === 'string') return value.replace(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g, '[private-detail-redacted]')
	if (Array.isArray(value)) return value.map(redact)
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]))
	return value
}
const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Public shape shadow angle parameter proof',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	contentStory: { audience: 'presentation authors', outcome: 'prove a typed native shape shadow angle parameter is publicly executable', remember: 'shadow angle is a continuous degree value, not a captured style preset' },
	visualDesign: { world: 'blueprint', framing: 'single centered native shape shadow proof object' },
	motionTime: { masterClock: 'authored slide timing', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' },
	styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' },
	validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true },
	slides: values.map((angleDeg, index) => ({
		id: `shape-shadow-angle-${index + 1}`, title: 'Shape shadow angle canary', message: 'The same native shape is rendered with a different typed shadow angle value.', layoutIntent: 'title-only',
		content: [{ kind: 'textShape', name: 'shape-shadow-angle', text: 'Shape shadow angle canary', shapeName: 'roundRect', options: { fontSize: 26, bold: true, color: '102A43', fill: { color: '38BDF8' }, line: { color: '0F4C81', width: 1.5 }, shadow: { type: 'outer', color: '000000', opacity: 0.72, blurPt: 12, distancePt: 12, angleDeg }, margin: 0, align: 'center', valign: 'mid' } }],
		notes: `Static shape shadow angle checkpoint ${angleDeg} degrees.`,
	})),
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
const roleA = client('betterpptx-public-shape-shadow-angle-role-a')
await roleA.initialize()
const listed = await roleA.rpc('tools/list')
const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const catalog = await roleA.call('betterpptx.options.catalog', { surface: 'shadow', format: 'full' })
const surfaces = catalog?.data?.data?.surfaces || catalog?.data?.surfaces || []
const shadowSurface = surfaces.find(surface => surface.id === 'shadow')
const angleParameter = Array.isArray(shadowSurface?.parameters) ? shadowSurface.parameters.find(parameter => parameter.id === 'angleDeg') : null
const catalogText = JSON.stringify(catalog)
const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${sourceBytes.toString('base64')}`, fileName: 'shape-shadow-angle-public.json', idempotencyKey: `shape-shadow-angle-public-${Date.now()}-${crypto.randomUUID()}` })
const handle = upload?.data?.handle || upload?.handle
const dryRun = handle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: handle, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `shape-shadow-angle-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false, error: { code: 'UPLOAD_DID_NOT_RETURN_HANDLE' } }
const dryData = dryRun?.data || dryRun || {}
const boundarySpec = JSON.parse(JSON.stringify(spec))
boundarySpec.title = 'Public shape shadow angle upper-bound rejection probe'
boundarySpec.slides[0].content[0].options.shadow.angleDeg = 359.0001
const boundarySourceBytes = Buffer.from(JSON.stringify(boundarySpec, null, 2), 'utf8')
const boundaryUpload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${boundarySourceBytes.toString('base64')}`, fileName: 'shape-shadow-angle-upper-bound-probe.json', idempotencyKey: `shape-shadow-angle-boundary-upload-${Date.now()}-${crypto.randomUUID()}` })
const boundaryHandle = boundaryUpload?.data?.handle || boundaryUpload?.handle
const boundaryDryRun = boundaryHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: boundaryHandle, phase: 'resolve', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `shape-shadow-angle-boundary-resolve-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false, error: { code: 'BOUNDARY_UPLOAD_DID_NOT_RETURN_HANDLE' } }
const publicResponseText = JSON.stringify({ catalog, upload, dryRun, boundaryUpload, boundaryDryRun })
const privateLeakMatches = publicResponseText.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g) || []
const checks = {
	freshPublicSession: true,
	servedDiscovery: servedNames.includes('betterpptx.options.catalog') && servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec'),
	shadowCatalogPresent: catalog?.ok === true && shadowSurface?.id === 'shadow' && shadowSurface?.capabilityMode === 'parameterized' && shadowSurface?.capabilityStatus === 'executable-exact-structured',
	angleParameterContractPresent: angleParameter?.type === 'continuous' && angleParameter?.valueType === 'number' && angleParameter?.minimum === 0 && angleParameter?.maximum === 359 && angleParameter?.default === 45 && angleParameter?.unit === 'degrees' && typeof angleParameter?.step === 'number' && String(angleParameter?.reset || '').includes('reset'),
	jsonSpecUpload: upload?.ok === true && typeof handle === 'string' && handle.startsWith('asset://locked/uploaded-jsonspec/'),
	dryRunMutationFree: dryRun?.ok === true && dryData.phase === 'dryRun' && dryData.mutationFree === true && !dryData.deckId,
	fiveAngleValuesReachPublicPlan: dryRun?.ok === true && dryData.slideCount === values.length && dryData.objectCount === values.length,
	angleUpperBoundRejected: boundaryUpload?.ok === true && typeof boundaryHandle === 'string' && boundaryDryRun?.ok === false,
	angleUpperBoundMessageUnit: /degrees/i.test(boundaryDryRun?.error?.message || ''),
	noPrivateImplementationLeakage: privateLeakMatches.length === 0,
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
if (status !== 'PASS') throw new Error(`Public shape shadow angle checks failed: ${JSON.stringify(checks)}; privateLeakMatches=${JSON.stringify(privateLeakMatches)}\n${JSON.stringify(redact({ catalog, upload, dryRun, boundaryUpload, boundaryDryRun }), null, 2).slice(0, 12000)}`)
const evidence = redact({
	schemaVersion: 'betterpptx.public-shape-shadow-angle-proof.v1', status, generatedAt: new Date().toISOString(), endpoint,
	roleA: { freshSession: true, servedToolCount: servedNames.length, servedToolNamesSha256: sha256(JSON.stringify(servedNames)), catalogSurface: 'shadow', catalogDigest: sha256(catalogText), angleParameter, uploadedCanonicalSha256: upload?.data?.canonicalSha256 || upload?.canonicalSha256 || null, specHandleReturned: Boolean(handle) },
	request: { values, sourceSha256: sha256(sourceBytes), sourceBytes: sourceBytes.length, staticContent: true, nativeCarrier: 'shape.shadow', parameter: 'style.shadow.angleDeg', unit: 'degrees', domain: '0..359', serializerStep: 1 / 60000 },
	dryRun: { ok: dryRun?.ok === true, phase: dryData.phase, mutationFree: dryData.mutationFree, slideCount: dryData.slideCount, objectCount: dryData.objectCount, specDigest: dryData.specDigest, planDigest: dryData.planDigest, planId: dryData.planId, fiveAngleValuesReachPublicPlan: checks.fiveAngleValuesReachPublicPlan },
	boundaryProbe: { requestedDeg: 359.0001, uploadOk: boundaryUpload?.ok === true, rejected: checks.angleUpperBoundRejected, errorCode: boundaryDryRun?.error?.code || null, errorMessage: boundaryDryRun?.error?.message || null },
	checks, privateLeakMatches,
	interpretation: 'A fresh public client discovered the structured shape shadow angle contract, uploaded five static angle checkpoints, completed a mutation-free public dry-run, and verified an upper-bound rejection. Native XML, PowerPoint SaveCopyAs/reopen, and visual certification remain covered by the separate local builder proof.',
})
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'shape-shadow-angle-public-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath))
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
