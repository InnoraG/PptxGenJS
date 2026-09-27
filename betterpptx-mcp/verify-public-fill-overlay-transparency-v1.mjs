#!/usr/bin/env node
// Fresh Role-A public-client proof for the structured fill-overlay transparency slider.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const endpoint = process.argv.includes('--endpoint') ? process.argv[process.argv.indexOf('--endpoint') + 1] : 'https://betterpptx.tail070c3a.ts.net/mcp'
const evidenceDir = process.argv.includes('--evidence-dir') ? process.argv[process.argv.indexOf('--evidence-dir') + 1] : path.resolve(`outputs/authoring-principle-corpus/global-extended-option-discrete/fill-overlay-transparency-public/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
const values = [0.2, 0.8]
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
function parseResponse(text) { const line = String(text || '').trim().split(/\r?\n/).find(item => item.startsWith('data:')); return JSON.parse(line ? line.slice(5).trim() : text) }
function redact(value) {
	if (typeof value === 'string') return value.replace(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g, '[private-detail-redacted]')
	if (Array.isArray(value)) return value.map(redact)
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]))
	return value
}
const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Public fill-overlay transparency parameter proof',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	contentStory: { audience: 'presentation authors', outcome: 'prove a typed native fill-overlay transparency slider is publicly executable', remember: 'fill transparency is an independent continuous effect parameter' },
	visualDesign: { world: 'blueprint', framing: 'two native fill-overlay transparency proof objects' },
	motionTime: { masterClock: 'authored slide timing', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' },
	styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' },
	validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true },
	slides: values.map((transparency, index) => ({
		id: `fill-overlay-transparency-${index + 1}`, title: 'Fill overlay transparency canary', message: `The same native fill overlay is rendered with normalized transparency ${transparency}.`, layoutIntent: 'title-only',
		content: [{ kind: 'textShape', name: `fill-overlay-transparency-${index + 1}`, text: `fill.transparency = ${transparency}`, shapeName: 'roundRect', options: { fontSize: 26, bold: true, color: '102A43', fill: { color: 'FF6B6B' }, line: { color: '0F4C81', width: 1.5 }, fillOverlay: { blendMode: 'multiply', fill: { type: 'solid', color: '2563EB', transparency } }, margin: 0, align: 'center', valign: 'mid' } }],
		notes: `Static fill overlay transparency checkpoint ${transparency}.`,
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
const roleA = client('betterpptx-public-fill-overlay-transparency-role-a')
await roleA.initialize()
const listed = await roleA.rpc('tools/list')
const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const catalog = await roleA.call('betterpptx.options.catalog', { surface: 'fillOverlay', format: 'full' })
const surfaces = catalog?.data?.data?.surfaces || catalog?.data?.surfaces || []
const overlaySurface = surfaces.find(surface => surface.id === 'fillOverlay')
const transparencyParameter = Array.isArray(overlaySurface?.parameters) ? overlaySurface.parameters.find(parameter => parameter.id === 'fill.transparency') : null
const catalogText = JSON.stringify(catalog)
const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${sourceBytes.toString('base64')}`, fileName: 'fill-overlay-transparency-public.json', idempotencyKey: `fill-overlay-transparency-public-${Date.now()}-${crypto.randomUUID()}` })
const handle = upload?.data?.handle || upload?.handle
const dryRun = handle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: handle, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `fill-overlay-transparency-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false, error: { code: 'UPLOAD_DID_NOT_RETURN_HANDLE' } }
const dryData = dryRun?.data || dryRun || {}
const boundarySpec = JSON.parse(JSON.stringify(spec))
boundarySpec.title = 'Public fill-overlay transparency rejection probe'
boundarySpec.slides[0].content[0].options.fillOverlay.fill.transparency = 'opaque'
const boundarySourceBytes = Buffer.from(JSON.stringify(boundarySpec, null, 2), 'utf8')
const boundaryUpload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${boundarySourceBytes.toString('base64')}`, fileName: 'fill-overlay-transparency-type-probe.json', idempotencyKey: `fill-overlay-transparency-boundary-upload-${Date.now()}-${crypto.randomUUID()}` })
const boundaryHandle = boundaryUpload?.data?.handle || boundaryUpload?.handle
const boundaryDryRun = boundaryHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: boundaryHandle, phase: 'resolve', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `fill-overlay-transparency-boundary-resolve-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false, error: { code: 'BOUNDARY_UPLOAD_DID_NOT_RETURN_HANDLE' } }
const publicResponseText = JSON.stringify({ catalog, upload, dryRun, boundaryUpload, boundaryDryRun })
const privateLeakMatches = publicResponseText.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g) || []
const checks = {
	freshPublicSession: true,
	servedDiscovery: servedNames.includes('betterpptx.options.catalog') && servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec'),
	overlayCatalogPresent: catalog?.ok === true && overlaySurface?.id === 'fillOverlay' && overlaySurface?.capabilityMode === 'parameterized' && overlaySurface?.capabilityStatus === 'executable-exact-structured',
	transparencyParameterContractPresent: transparencyParameter?.type === 'continuous' && transparencyParameter?.valueType === 'number' && transparencyParameter?.minimum === 0 && transparencyParameter?.maximum === 1 && transparencyParameter?.default === 0 && String(transparencyParameter?.unit || '') === 'normalized' && String(transparencyParameter?.serializer || '').includes('alpha'),
	jsonSpecUpload: upload?.ok === true && typeof handle === 'string' && handle.startsWith('asset://locked/uploaded-jsonspec/'),
	dryRunMutationFree: dryRun?.ok === true && dryData.phase === 'dryRun' && dryData.mutationFree === true && !dryData.deckId,
	bothTransparencyValuesReachPublicPlan: dryRun?.ok === true && dryData.slideCount === values.length && dryData.objectCount === values.length,
	invalidTransparencyRejected: boundaryUpload?.ok === true && typeof boundaryHandle === 'string' && boundaryDryRun?.ok === false,
	invalidTransparencyMessage: /transparency|normalized|finite/i.test(boundaryDryRun?.error?.message || ''),
	noPrivateImplementationLeakage: privateLeakMatches.length === 0,
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
if (status !== 'PASS') throw new Error(`Public fill-overlay transparency checks failed: ${JSON.stringify(checks)}; privateLeakMatches=${JSON.stringify(privateLeakMatches)}\n${JSON.stringify(redact({ catalog, upload, dryRun, boundaryUpload, boundaryDryRun }), null, 2).slice(0, 12000)}`)
const evidence = redact({
	schemaVersion: 'betterpptx.public-fill-overlay-transparency-proof.v1', status, generatedAt: new Date().toISOString(), endpoint,
	roleA: { freshSession: true, servedToolCount: servedNames.length, servedToolNamesSha256: sha256(JSON.stringify(servedNames)), catalogSurface: 'fillOverlay', catalogDigest: sha256(catalogText), transparencyParameter, uploadedCanonicalSha256: upload?.data?.canonicalSha256 || upload?.canonicalSha256 || null, specHandleReturned: Boolean(handle) },
	request: { values, sourceSha256: sha256(sourceBytes), sourceBytes: sourceBytes.length, staticContent: true, nativeCarrier: 'effect.fillOverlay.fill', parameter: 'style.fillOverlay.fill.transparency', valueType: 'number', unit: 'normalized', serializer: 'a:solidFill/a:srgbClr/a:alpha = round((1 - transparency) * 100000)' },
	dryRun: { ok: dryRun?.ok === true, phase: dryData.phase, mutationFree: dryData.mutationFree, slideCount: dryData.slideCount, objectCount: dryData.objectCount, specDigest: dryData.specDigest, planDigest: dryData.planDigest, planId: dryData.planId, bothTransparencyValuesReachPublicPlan: checks.bothTransparencyValuesReachPublicPlan },
	boundaryProbe: { requestedValue: 'opaque', uploadOk: boundaryUpload?.ok === true, rejected: checks.invalidTransparencyRejected, errorCode: boundaryDryRun?.error?.code || null, errorMessage: boundaryDryRun?.error?.message || null },
	checks, privateLeakMatches,
	interpretation: 'A fresh public client discovered the continuous fill-overlay fill transparency contract, uploaded normalized 0.2/0.8 static checkpoints, completed a mutation-free public dry-run, verified invalid-value rejection, and showed no private leakage. Native XML, PowerPoint SaveCopyAs/reopen, and visual certification remain covered by the separate local builder proof.',
})
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'fill-overlay-transparency-public-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath))
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
