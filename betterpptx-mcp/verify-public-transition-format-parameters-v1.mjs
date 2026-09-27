#!/usr/bin/env node
// Fresh Role-A public-client proof for transition controls beyond gallery tiles.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const endpoint = process.argv.includes('--endpoint') ? process.argv[process.argv.indexOf('--endpoint') + 1] : 'https://betterpptx.tail070c3a.ts.net/mcp'
const evidenceDir = process.argv.includes('--evidence-dir') ? process.argv[process.argv.indexOf('--evidence-dir') + 1] : path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/transition-format-parameters-public/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
function parseResponse(text) {
	const lines = String(text || '').split(/\r?\n/).filter(line => line.startsWith('data:') && line.slice(5).trim().startsWith('{'))
	return lines.length ? JSON.parse(lines.at(-1).slice(5).trim()) : (String(text || '').trim() ? JSON.parse(text) : {})
}
function redact(value) {
	if (typeof value === 'string') return value.replace(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g, '[private-detail-redacted]')
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
		async initialize() {
			await this.rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name, version: '1' }, capabilities: {} })
			await this.rpc('notifications/initialized')
		},
	}
}

const transitions = [
	{ transitionPresetId: 'transition-ribbon-004', speed: 'fast', durationMs: 900, advanceOnClick: false, advanceAfterTime: 6000, direction: 'left' },
	{ type: 'morph', option: 'byChar', p14dur: 700, speed: 'slow', advanceOnClick: false, advanceAfterTime: 7000 },
	{ type: 'wheel', spokes: 8, clockwise: false, speed: 'medium', advanceOnClick: false, advanceAfterTime: 8000 },
	{ type: 'curtains', invX: true, invY: true, speed: 'med', advanceOnClick: false, advanceAfterTime: 9000 },
	{ type: 'zoom', zoomFrom: 'out', duration: 900, advanceOnClick: false, advanceAfterTime: 10000 },
]
const sourceSpec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Public transition format parameter proof',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	contentStory: { audience: 'presentation authors', outcome: 'prove public native transition controls', remember: 'transition families and timing remain editable' },
	visualDesign: { world: 'blueprint', framing: 'five native transition checkpoints' }, motionTime: { masterClock: 'static', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' },
	styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' }, validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true },
	slides: transitions.map((transition, index) => ({ id: `transition-format-${index + 1}`, title: 'Native transition control', message: `Transition checkpoint ${index + 1} remains editable.`, layoutIntent: 'title-only', transition, content: [{ kind: 'text', name: `transition-text-${index + 1}`, text: `Editable native transition checkpoint ${index + 1}`, region: 'body' }] })),
}
const roleA = client('betterpptx-public-transition-format-parameters-role-a'); await roleA.initialize()
const listed = await roleA.rpc('tools/list'); const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const catalog = await roleA.call('betterpptx.options.catalog', { surface: 'transitionPreset', format: 'full' })
const surfaces = catalog?.data?.surfaces || catalog?.surfaces || []; const surface = surfaces.find(item => item.id === 'transitionPreset')
const sourceBytes = Buffer.from(JSON.stringify(sourceSpec, null, 2), 'utf8')
const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${sourceBytes.toString('base64')}`, fileName: 'transition-format-parameters-public.json', idempotencyKey: `transition-format-parameters-${Date.now()}-${crypto.randomUUID()}` })
const handle = upload?.data?.handle || upload?.handle
const dryRun = handle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: handle, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `transition-format-parameters-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const dryData = dryRun?.data || dryRun || {}
const commit = dryRun?.ok === true && dryData.planId ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: handle, phase: 'commit', commitMode: 'createNew', plan: 'premium', planId: dryData.planId, lockedPlanId: dryData.planId, planDigest: dryData.planDigest, validateAfterCompile: true, validationMode: 'strict', saveAfterCommit: false, idempotencyKey: `transition-format-parameters-commit-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const commitData = commit?.data || commit || {}; const deckId = commitData.deckId || commit?.deckId; const deckVersion = commitData.deckVersion || commit?.deckVersion
const quality = deckId ? await roleA.call('betterpptx.deck.validate_quality', { deckId, deckVersion, profile: 'modern' }) : { ok: false }
const preview = deckId && quality?.ok === true ? await roleA.call('betterpptx.deck.preview', { deckId, deckVersion, slides: [0, 1, 2, 3, 4] }) : { ok: false }
const save = deckId && preview?.ok === true ? await roleA.call('betterpptx.deck.save', { deckId, deckVersion, fileName: 'transition-format-parameters-public-proof.pptx', outputFormat: 'pptx', idempotencyKey: `transition-format-parameters-save-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const invalidSpec = { ...sourceSpec, title: 'Public transition boundary probe', slides: [{ ...sourceSpec.slides[0], transition: { type: 'fade', duration: 86400001 } }] }
const invalidBytes = Buffer.from(JSON.stringify(invalidSpec), 'utf8')
const invalidUpload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${invalidBytes.toString('base64')}`, fileName: 'transition-format-parameters-invalid-public.json', idempotencyKey: `transition-format-parameters-invalid-upload-${Date.now()}-${crypto.randomUUID()}` })
const invalidHandle = invalidUpload?.data?.handle || invalidUpload?.handle
const invalidDryRun = invalidHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: invalidHandle, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `transition-format-parameters-invalid-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const returned = JSON.stringify({ catalog, upload, dryRun, commit, quality, preview, save, invalidUpload, invalidDryRun })
const privateLeakMatches = returned.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g) || []
const parameterIds = surface?.parameters?.map(item => item.id) || []
const expected = ['type', 'speed', 'duration', 'advanceOnClick', 'advanceAfterTime', 'direction', 'throughBlack', 'splitDirection', 'pattern', 'spokes', 'clockwise', 'zoomFrom', 'option', 'invX', 'invY', 'p14dur']
const checks = {
	freshPublicSession: true,
	servedDiscovery: servedNames.includes('betterpptx.options.catalog') && servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec'),
	transitionCatalogPresent: catalog?.ok === true && surface?.id === 'transitionPreset' && surface?.capabilityMode === 'preset-plus-parameters' && surface?.capabilityStatus === 'executable-exact-structured' && surface?.canonical?.length === 49,
	manualParameterUnionPresent: parameterIds.length >= 16 && expected.every(id => parameterIds.includes(id)),
	jsonSpecUpload: upload?.ok === true && typeof handle === 'string' && handle.startsWith('asset://locked/uploaded-jsonspec/'),
	dryRunMutationFree: dryRun?.ok === true && dryData.phase === 'dryRun' && dryData.mutationFree === true && !dryData.deckId && dryData.slideCount === transitions.length,
	commit: commit?.ok === true && typeof deckId === 'string',
	quality: quality?.ok === true,
	preview: preview?.ok === true,
	savedArtifact: save?.ok === true,
	upperBoundaryRejected: invalidUpload?.ok === true && typeof invalidHandle === 'string' && invalidDryRun?.ok !== true,
	upperBoundaryMessage: /86400001|duration|milliseconds|between/i.test(JSON.stringify(invalidDryRun)),
	noPrivateImplementationLeakage: privateLeakMatches.length === 0,
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
const evidence = redact({ schemaVersion: 'betterpptx.public-transition-format-parameters-proof.v1', status, generatedAt: new Date().toISOString(), endpoint, roleA: { freshSession: true, servedToolCount: servedNames.length, servedToolNamesSha256: sha256(JSON.stringify(servedNames)), catalogSurface: 'transitionPreset', catalogDigest: sha256(JSON.stringify(catalog)), selectorCount: surface?.canonical?.length || 0, parameterCount: parameterIds.length, parameterIds }, source: { sha256: sha256(sourceBytes), bytes: sourceBytes.length, transitionCount: transitions.length, transitionTypes: transitions.map(item => item.type || item.transitionPresetId) }, dryRun: { ok: dryRun?.ok === true, phase: dryData.phase, mutationFree: dryData.mutationFree, slideCount: dryData.slideCount, objectCount: dryData.objectCount, specDigest: dryData.specDigest, planDigest: dryData.planDigest, planId: dryData.planId, error: dryRun?.error || null }, boundaryProbe: { requestedValue: 86400001, uploadOk: invalidUpload?.ok === true, rejected: invalidDryRun?.ok !== true, error: invalidDryRun?.error || invalidDryRun?.data?.error || null }, execution: { commitOk: commit?.ok === true, commitError: commit?.error || null, deckId: deckId || null, deckVersion: deckVersion || null, qualityOk: quality?.ok === true, qualityError: quality?.error || null, previewOk: preview?.ok === true, previewError: preview?.error || null, saveOk: save?.ok === true, saveError: save?.error || null }, checks, privateLeakMatches, interpretation: status === 'PASS' ? 'A fresh public client discovered 49 transition selectors and the complete typed native transition union, uploaded five checkpoints, completed a mutation-free dry-run, committed, passed quality/preview/save, rejected duration 86400001, and showed no private leakage.' : 'Fresh Role-A transition discovery or execution exposed a missing typed transition contract. The failure is preserved for builder correction.' })
fs.mkdirSync(evidenceDir, { recursive: true }); const evidencePath = path.join(evidenceDir, status === 'PASS' ? 'transition-format-parameters-public-proof.json' : 'failed-public-proof.json'); fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'); const evidenceSha256 = sha256(fs.readFileSync(evidencePath)); fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8'); console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2)); if (status !== 'PASS') process.exitCode = 1
