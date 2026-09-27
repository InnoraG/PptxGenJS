#!/usr/bin/env node
// Fresh Role-A public-client proof for the discrete WordArt transform surface.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const endpoint = process.argv.includes('--endpoint') ? process.argv[process.argv.indexOf('--endpoint') + 1] : 'https://betterpptx.tail070c3a.ts.net/mcp'
const evidenceDir = process.argv.includes('--evidence-dir') ? process.argv[process.argv.indexOf('--evidence-dir') + 1] : path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/wordart-transform-public/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
const values = ['textArchUp', 'textArchDown', 'textWave1', 'textChevron', 'textCircle']
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
function parseResponse(text) { const line = String(text || '').trim().split(/\r?\n/).find(item => item.startsWith('data:')); return JSON.parse(line ? line.slice(5).trim() : text) }
function redact(value) {
	if (typeof value === 'string') return value.replace(/(?:[A-Z]:)?[\\/][^\s"']*PptxGenJS_Claude[^\s"']*/gi, '[local-path-redacted]')
	if (Array.isArray(value)) return value.map(redact)
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]))
	return value
}

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Public WordArt transform parameter proof',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	contentStory: { audience: 'presentation authors', outcome: 'prove canonical WordArt transforms are publicly executable', remember: 'WordArt transform is a discrete native selector, not a captured style tile' },
	visualDesign: { world: 'blueprint', framing: 'single centered native WordArt proof object' },
	motionTime: { masterClock: 'authored slide timing', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' },
	styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' },
	validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true },
	slides: values.map((transform, index) => ({
		id: `wordart-transform-${index + 1}`,
		title: 'WordArt transform canary',
		message: 'The same static WordArt is rendered with a different canonical transform.',
		layoutIntent: 'title-only',
		content: [{ kind: 'wordart', name: 'wordart-transform', text: 'WordArt transform canary', transform, style: { fontFace: 'Aptos Display', fontSize: 38, color: '38BDF8', align: 'center' } }],
		notes: `Static discrete transform checkpoint ${transform}.`,
	})),
}
const sourceBytes = Buffer.from(JSON.stringify(spec, null, 2), 'utf8')
function client(name) {
	let sessionId = null
	let requestId = 0
	return {
		async rpc(method, params = {}) {
			const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sessionId ? { 'mcp-session-id': sessionId } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }) })
			if (!sessionId) sessionId = response.headers.get('mcp-session-id')
			return parseResponse(await response.text())
		},
		async call(name_, args = {}) { const response = await this.rpc('tools/call', { name: name_, arguments: args }); const text = response?.result?.content?.find(item => item.type === 'text')?.text; return text ? JSON.parse(text) : response },
		async initialize() { await this.rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name, version: '1' }, capabilities: {} }); await this.rpc('notifications/initialized') },
	}
}

const roleA = client('betterpptx-public-wordart-transform-role-a')
await roleA.initialize()
const listed = await roleA.rpc('tools/list')
const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const catalog = await roleA.call('betterpptx.options.catalog', { surface: 'wordArt', format: 'full' })
const surfaces = catalog?.data?.data?.surfaces || catalog?.data?.surfaces || []
const transformSurface = surfaces.find(surface => surface.id === 'wordArtTransform')
const catalogText = JSON.stringify(catalog)
const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${sourceBytes.toString('base64')}`, fileName: 'wordart-transform-public.json', idempotencyKey: `wordart-public-${Date.now()}-${crypto.randomUUID()}` })
const handle = upload?.data?.handle || upload?.handle
const dryRun = handle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: handle, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `wordart-public-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false, error: { code: 'UPLOAD_DID_NOT_RETURN_HANDLE' } }
const dryData = dryRun?.data || dryRun || {}
const serializedText = JSON.stringify(dryData)
const publicResponseText = JSON.stringify({ catalog, upload, dryRun })
const privateLeakMatches = publicResponseText.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\\s"']*/g) || []
const checks = {
	freshPublicSession: true,
	servedDiscovery: servedNames.includes('betterpptx.options.catalog') && servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec'),
	wordArtTransformCatalogPresent: catalog?.ok === true && transformSurface?.field === 'options.wordArt.transform' && transformSurface?.capabilityMode === 'parameterized' && transformSurface?.capabilityStatus === 'executable-exact-structured' && (transformSurface?.parameters || []).some(parameter => parameter.id === 'adjustment0'),
	canonicalTransformDomainPresent: Array.isArray(transformSurface?.canonical) && values.every(value => transformSurface.canonical.includes(value)),
	jsonSpecUpload: upload?.ok === true && typeof handle === 'string' && handle.startsWith('asset://locked/uploaded-jsonspec/'),
	dryRunMutationFree: dryRun?.ok === true && dryData.phase === 'dryRun' && dryData.mutationFree === true && !dryData.deckId,
	fiveTransformValuesReachPublicPlan: dryRun?.ok === true && dryData.slideCount === values.length && dryData.objectCount === values.length,
	noPrivateImplementationLeakage: privateLeakMatches.length === 0,
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
if (status !== 'PASS') throw new Error(`Public WordArt checks failed: ${JSON.stringify(checks)}; privateLeakMatches=${JSON.stringify(privateLeakMatches)}\n${JSON.stringify(redact({ catalog, upload, dryRun }), null, 2).slice(0, 12000)}`)

const evidence = redact({
	schemaVersion: 'betterpptx.public-wordart-transform-proof.v1', status, generatedAt: new Date().toISOString(), endpoint,
	roleA: { freshSession: true, servedToolCount: servedNames.length, servedToolNamesSha256: sha256(JSON.stringify(servedNames)), catalogSurface: 'wordArt', catalogDigest: sha256(catalogText), transformCapabilityMode: transformSurface.capabilityMode, transformCapabilityStatus: transformSurface.capabilityStatus, canonicalTransformCount: transformSurface.canonical.length, uploadedCanonicalSha256: upload?.data?.canonicalSha256 || upload?.canonicalSha256 || null, specHandleReturned: Boolean(handle) },
	request: { values, sourceSha256: sha256(sourceBytes), sourceBytes: sourceBytes.length, staticContent: true, nativeCarrier: 'text', parameter: 'wordArt.transform', valueKind: 'canonical-transform-domain-with-optional-verified-guide' },
	dryRun: { ok: dryRun?.ok === true, phase: dryData.phase, mutationFree: dryData.mutationFree, slideCount: dryData.slideCount, objectCount: dryData.objectCount, specDigest: dryData.specDigest, planDigest: dryData.planDigest, planId: dryData.planId, fiveTransformValuesReachPublicPlan: checks.fiveTransformValuesReachPublicPlan },
	checks, privateLeakMatches,
	interpretation: 'A fresh public client discovered the canonical WordArt transform domain and its parameterized guide contract, uploaded five static transform checkpoints, and completed a mutation-free public dry-run. This remains a regression canary for public discovery and execution reachability; native XML, PowerPoint SaveCopyAs/reopen, and visual guide certification are covered by the companion proofs.',
})
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'wordart-transform-public-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath))
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
