#!/usr/bin/env node
// Fresh Role-A public-client proof for the expanded Model 3D View contract.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const endpoint = process.argv.includes('--endpoint') ? process.argv[process.argv.indexOf('--endpoint') + 1] : 'https://betterpptx.tail070c3a.ts.net/mcp'
const evidenceDir = process.argv.includes('--evidence-dir') ? process.argv[process.argv.indexOf('--evidence-dir') + 1] : path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/model3d-view-parameters-public/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
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
		async call(tool, args = {}) {
			const response = await this.rpc('tools/call', { name: tool, arguments: args })
			const text = response?.result?.content?.find(item => item.type === 'text')?.text
			return text ? JSON.parse(text) : response
		},
		async initialize() { await this.rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name, version: '1' }, capabilities: {} }); await this.rpc('notifications/initialized') },
	}
}
const values = [
	{ preset: 'model3d-view-001', camera: { fov: 34 }, trans: { rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } },
	{ preset: 'model3d-view-011', camera: { fov: 48, pos: { x: 1200000, y: -800000, z: 88000000 } }, trans: { rot: { x: 12.5, y: -24.25, z: 7.75 }, scale: { x: 1.2, y: 0.9, z: 1.05 } } },
	{ preset: 'model3d-view-003', camera: { fov: 32 }, objViewport: 3100000 },
	{ preset: 'model3d-view-007', ambientLight: { color: { r: 96, g: 144, b: 255 }, illuminance: 0.72 }, ptLights: [{ intensity: 11, pos: { x: 21000000, y: 51000000, z: 26000000 } }, { intensity: 4.5, color: { r: 160, g: 190, b: 255 }, pos: { x: -30000000, y: 22000000, z: 42000000 } }, { intensity: 2, color: { r: 255, g: 180, b: 120 }, pos: { x: 36000000, y: -18000000, z: 18000000 } }] },
	{ preset: 'model3d-view-011', camera: null, trans: { rot: null, scale: null }, ambientLight: null, ptLights: null, objViewport: null },
]
const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Public Model 3-D View parameter proof',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', geometryAuthority: 'engine', placementPolicy: 'semantic-layout-only', textPolicy: 'Semantic content only; the engine owns geometry, fit, and balance.' },
	contentStory: { audience: 'presentation authors', outcome: 'prove public Model 3-D View manual controls', remember: 'the selected native tile remains the base and manual controls stay editable' },
	visualDesign: { world: 'blueprint', framing: 'five native model 3-D view checkpoints' },
	motionTime: { masterClock: 'static', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' },
	styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' },
	validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true },
	slides: values.map((value, index) => ({ id: `model3d-view-${index + 1}`, title: 'Native Model 3-D View control', message: `The selected tile and manual view checkpoint ${index + 1} remain editable.`, layoutIntent: 'title-only', content: [{ kind: 'model3d', name: `model3d-view-${index + 1}`, region: 'hero', model: 'model3d://microsoft-stock/55f4d622ae5b86d3/headphones', altText: `Editable native Model 3-D View checkpoint ${index + 1}`, model3dViewPresetId: value.preset, ...(value.camera !== undefined ? { camera: value.camera } : {}), ...(value.trans !== undefined ? { trans: value.trans } : {}), ...(value.ambientLight !== undefined ? { ambientLight: value.ambientLight } : {}), ...(value.ptLights !== undefined ? { ptLights: value.ptLights } : {}), ...(value.objViewport !== undefined ? { objViewport: value.objViewport } : {}) }] })),
}
const roleA = client('betterpptx-public-model3d-view-parameters-role-a')
await roleA.initialize()
const listed = await roleA.rpc('tools/list')
const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const catalog = await roleA.call('betterpptx.options.catalog', { surface: 'model3dViewPreset', format: 'full' })
const surfaces = catalog?.data?.data?.surfaces || catalog?.data?.surfaces || []
const surface = surfaces.find(item => item.id === 'model3dViewPreset')
const sourceBytes = Buffer.from(JSON.stringify(spec, null, 2), 'utf8')
const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${sourceBytes.toString('base64')}`, fileName: 'model3d-view-parameters-public.json', idempotencyKey: `model3d-view-parameters-${Date.now()}-${crypto.randomUUID()}` })
const handle = upload?.data?.handle || upload?.handle
const dryRun = handle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: handle, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `model3d-view-parameters-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false, error: { code: 'UPLOAD_DID_NOT_RETURN_HANDLE' } }
const dryData = dryRun?.data || dryRun || {}
const boundarySpec = JSON.parse(JSON.stringify(spec)); boundarySpec.title = 'Public Model 3-D View upper-boundary probe'; boundarySpec.slides[0].content[0].camera = { fov: 360.1 }
const boundaryBytes = Buffer.from(JSON.stringify(boundarySpec, null, 2), 'utf8')
const boundaryUpload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${boundaryBytes.toString('base64')}`, fileName: 'model3d-view-parameters-boundary.json', idempotencyKey: `model3d-view-parameters-boundary-upload-${Date.now()}-${crypto.randomUUID()}` })
const boundaryHandle = boundaryUpload?.data?.handle || boundaryUpload?.handle
const boundaryDryRun = boundaryHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: boundaryHandle, phase: 'resolve', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `model3d-view-parameters-boundary-resolve-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false, error: { code: 'BOUNDARY_UPLOAD_DID_NOT_RETURN_HANDLE' } }
const lightBoundarySpec = JSON.parse(JSON.stringify(spec)); lightBoundarySpec.title = 'Public Model 3-D View point-light boundary probe'; lightBoundarySpec.slides[0].content[0].ptLights = [{}, {}, {}, {}]
const lightBoundaryBytes = Buffer.from(JSON.stringify(lightBoundarySpec, null, 2), 'utf8')
const lightBoundaryUpload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${lightBoundaryBytes.toString('base64')}`, fileName: 'model3d-view-point-light-boundary.json', idempotencyKey: `model3d-view-point-light-boundary-upload-${Date.now()}-${crypto.randomUUID()}` })
const lightBoundaryHandle = lightBoundaryUpload?.data?.handle || lightBoundaryUpload?.handle
const lightBoundaryDryRun = lightBoundaryHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: lightBoundaryHandle, phase: 'resolve', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `model3d-view-point-light-boundary-resolve-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false, error: { code: 'LIGHT_BOUNDARY_UPLOAD_DID_NOT_RETURN_HANDLE' } }
const publicResponseText = JSON.stringify({ catalog, upload, dryRun, boundaryUpload, boundaryDryRun, lightBoundaryUpload, lightBoundaryDryRun })
const privateLeakMatches = publicResponseText.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g) || []
const parameterIds = surface?.parameters?.map(item => item.id) || []
const checks = {
	freshPublicSession: true,
	servedDiscovery: servedNames.includes('betterpptx.options.catalog') && servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec'),
	model3dViewCatalogPresent: catalog?.ok === true && surface?.id === 'model3dViewPreset' && surface?.capabilityMode === 'preset-plus-parameters' && surface?.canonical?.length === 18,
	manualParameterUnionPresent: parameterIds.length === 14 && ['cameraFovDeg', 'cameraPositionXEmu', 'cameraPositionYEmu', 'cameraPositionZEmu', 'rotationXDeg', 'rotationYDeg', 'rotationZDeg', 'scaleX', 'scaleY', 'scaleZ', 'viewportSizeEmu', 'ambientIlluminance', 'ambientColor', 'pointLights'].every(id => parameterIds.includes(id)),
	pointLightsExactStructured: surface?.parameters?.find(item => item.id === 'pointLights')?.capabilityStatus === 'executable-exact-structured' && values[3].ptLights.length === 3,
	jsonSpecUpload: upload?.ok === true && typeof handle === 'string' && handle.startsWith('asset://locked/uploaded-jsonspec/'),
	dryRunMutationFree: dryRun?.ok === true && dryData.phase === 'dryRun' && dryData.mutationFree === true && !dryData.deckId,
	fiveCheckpointsReachPublicPlan: dryRun?.ok === true && dryData.slideCount === values.length && Number(dryData.objectCount) >= values.length,
	upperBoundaryRejected: boundaryUpload?.ok === true && typeof boundaryHandle === 'string' && boundaryDryRun?.ok === false,
	upperBoundaryMessage: /360|camera|fov|degree/i.test(boundaryDryRun?.error?.message || ''),
	pointLightUpperBoundaryRejected: lightBoundaryUpload?.ok === true && typeof lightBoundaryHandle === 'string' && lightBoundaryDryRun?.ok === false && /three|point.?light/i.test(lightBoundaryDryRun?.error?.message || ''),
	noPrivateImplementationLeakage: privateLeakMatches.length === 0,
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
const evidence = redact({ schemaVersion: 'betterpptx.public-model3d-view-parameters-proof.v1', status, generatedAt: new Date().toISOString(), endpoint, roleA: { freshSession: true, servedToolCount: servedNames.length, servedToolNamesSha256: sha256(JSON.stringify(servedNames)), catalogSurface: 'model3dViewPreset', catalogDigest: sha256(JSON.stringify(catalog)), presetCount: surface?.canonical?.length || 0, parameterIds }, request: { values, sourceSha256: sha256(sourceBytes), sourceBytes: sourceBytes.length, nativeCarrier: 'am3d:model3d', resetSemantics: 'null manual fields restore the selected tile component while preserving the selected preset' }, dryRun: { ok: dryRun?.ok === true, phase: dryData.phase, mutationFree: dryData.mutationFree, slideCount: dryData.slideCount, objectCount: dryData.objectCount, specDigest: dryData.specDigest, planDigest: dryData.planDigest, planId: dryData.planId, fiveCheckpointsReachPublicPlan: checks.fiveCheckpointsReachPublicPlan }, boundaryProbe: { requestedValue: 360.1, uploadOk: boundaryUpload?.ok === true, rejected: checks.upperBoundaryRejected, errorCode: boundaryDryRun?.error?.code || null, errorMessage: boundaryDryRun?.error?.message || null }, pointLightBoundaryProbe: { requestedCount: 4, uploadOk: lightBoundaryUpload?.ok === true, rejected: checks.pointLightUpperBoundaryRejected, errorCode: lightBoundaryDryRun?.error?.code || null, errorMessage: lightBoundaryDryRun?.error?.message || null }, checks, privateLeakMatches, interpretation: status === 'PASS' ? 'A fresh public client discovered all 18 exact Model 3-D View tiles plus the expanded 14-leaf manual camera/transform/viewport/lighting contract, including three independently typed point lights with a four-light rejection boundary, uploaded five static checkpoints, completed a mutation-free dry-run, rejected fov 360.1, and showed no private leakage.' : 'Fresh Role-A public discovery or execution exposed a missing Model 3-D View parameter contract. The failure is preserved for the builder correction.' })
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, status === 'PASS' ? 'model3d-view-parameters-public-proof.json' : 'failed-public-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath)); fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
if (status !== 'PASS') process.exitCode = 1
