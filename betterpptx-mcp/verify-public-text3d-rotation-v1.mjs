#!/usr/bin/env node
// Fresh Role-A public-client proof for the parameterized Text3D rotation surface.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const endpoint = process.argv.includes('--endpoint') ? process.argv[process.argv.indexOf('--endpoint') + 1] : 'https://betterpptx.tail070c3a.ts.net/mcp'
const evidenceDir = process.argv.includes('--evidence-dir') ? process.argv[process.argv.indexOf('--evidence-dir') + 1] : path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/text3d-rotation-public/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
const values = [0, 90, 180, 270, 359]
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
function parseResponse(text) { const line = String(text || '').trim().split(/\r?\n/).find(item => item.startsWith('data:')); return JSON.parse(line ? line.slice(5).trim() : text) }
function redact(value) {
	if (typeof value === 'string') return value.replace(/(?:[A-Z]:)?[\\/][^\s"']*PptxGenJS_Claude[^\s"']*/gi, '[local-path-redacted]')
	if (Array.isArray(value)) return value.map(redact)
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]))
	return value
}

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Public Text3D rotationX parameter proof',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	contentStory: { audience: 'presentation authors', outcome: 'prove a typed Text3D rotation parameter is publicly executable', remember: 'rotationX is a continuous degree value, not a captured 3-D preset' },
	visualDesign: { world: 'blueprint', framing: 'single centered native Text3D proof object' },
	motionTime: { masterClock: 'authored slide timing', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' },
	styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' },
	validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true },
	slides: values.map((rotationX, index) => ({
		id: `text3d-rotation-${index + 1}`, title: 'Text3D rotation canary', message: 'The same static Text3D is rendered with a different typed rotationX value.', layoutIntent: 'title-only',
		content: [{ kind: 'text3d', name: 'text3d-rotation', text: 'Text3D rotation canary', text3D: { bevel: { type: 'circle', width: 4, height: 4 }, extrusion: 8, extrusionColor: '38BDF8', material: 'matte', lightRig: 'threePt', rotationX } }],
		notes: `Static Text3D rotationX checkpoint ${rotationX} degrees.`,
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

const roleA = client('betterpptx-public-text3d-rotation-role-a')
await roleA.initialize()
const listed = await roleA.rpc('tools/list')
const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const catalog = await roleA.call('betterpptx.options.catalog', { surface: 'text3D', format: 'full' })
const surfaces = catalog?.data?.data?.surfaces || catalog?.data?.surfaces || []
const rotationSurface = surfaces.find(surface => surface.id === 'text3DRotation')
const shapeSurface = surfaces.find(surface => surface.id === 'shape3D')
const catalogText = JSON.stringify(catalog)
const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${sourceBytes.toString('base64')}`, fileName: 'text3d-rotation-public.json', idempotencyKey: `text3d-public-${Date.now()}-${crypto.randomUUID()}` })
const handle = upload?.data?.handle || upload?.handle
const dryRun = handle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: handle, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `text3d-public-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false, error: { code: 'UPLOAD_DID_NOT_RETURN_HANDLE' } }
const dryData = dryRun?.data || dryRun || {}
const publicResponseText = JSON.stringify({ catalog, upload, dryRun })
const privateLeakMatches = publicResponseText.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\\s"']*/g) || []
const checks = {
	freshPublicSession: true,
	servedDiscovery: servedNames.includes('betterpptx.options.catalog') && servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec'),
	text3dRotationCatalogPresent: catalog?.ok === true && rotationSurface?.field === 'options.text3D.rotationX/Y/Z' && rotationSurface?.capabilityMode === 'parameterized' && rotationSurface?.capabilityStatus === 'structured-partial',
	text3dShapeCatalogPresent: shapeSurface?.capabilityMode === 'parameterized' && shapeSurface?.overrideFields?.includes('rotationX'),
	rotationDomainPresent: rotationSurface?.canonical?.includes('number: 0 <= degrees < 360') && rotationSurface?.examples?.includes(348),
	jsonSpecUpload: upload?.ok === true && typeof handle === 'string' && handle.startsWith('asset://locked/uploaded-jsonspec/'),
	dryRunMutationFree: dryRun?.ok === true && dryData.phase === 'dryRun' && dryData.mutationFree === true && !dryData.deckId,
	fiveRotationValuesReachPublicPlan: dryRun?.ok === true && dryData.slideCount === values.length && dryData.objectCount === values.length,
	noPrivateImplementationLeakage: privateLeakMatches.length === 0,
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
if (status !== 'PASS') throw new Error(`Public Text3D checks failed: ${JSON.stringify(checks)}; privateLeakMatches=${JSON.stringify(privateLeakMatches)}\n${JSON.stringify(redact({ catalog, upload, dryRun }), null, 2).slice(0, 12000)}`)

const evidence = redact({
	schemaVersion: 'betterpptx.public-text3d-rotation-proof.v1', status, generatedAt: new Date().toISOString(), endpoint,
	roleA: { freshSession: true, servedToolCount: servedNames.length, servedToolNamesSha256: sha256(JSON.stringify(servedNames)), catalogSurface: 'text3D', catalogDigest: sha256(catalogText), rotationCapabilityMode: rotationSurface.capabilityMode, rotationCapabilityStatus: rotationSurface.capabilityStatus, rotationCanonical: rotationSurface.canonical, uploadedCanonicalSha256: upload?.data?.canonicalSha256 || upload?.canonicalSha256 || null, specHandleReturned: Boolean(handle) },
	request: { values, sourceSha256: sha256(sourceBytes), sourceBytes: sourceBytes.length, staticContent: true, nativeCarrier: 'text3d', parameter: 'text3D.rotationX', unit: 'degrees', normalizedDomain: '0 <= degrees < 360' },
	dryRun: { ok: dryRun?.ok === true, phase: dryData.phase, mutationFree: dryData.mutationFree, slideCount: dryData.slideCount, objectCount: dryData.objectCount, specDigest: dryData.specDigest, planDigest: dryData.planDigest, planId: dryData.planId, fiveRotationValuesReachPublicPlan: checks.fiveRotationValuesReachPublicPlan },
	checks, privateLeakMatches,
	interpretation: 'A fresh public client discovered the typed Text3D rotation domain, uploaded five static rotationX checkpoints, and completed a mutation-free public dry-run. This proves public discovery and fresh execution reachability; native XML, PowerPoint SaveCopyAs/reopen, and visual certification remain covered by the separate local builder proof.',
})
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'text3d-rotation-public-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath))
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
