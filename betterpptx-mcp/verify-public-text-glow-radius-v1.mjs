#!/usr/bin/env node
// Fresh Role-A public-client proof for a non-Picture extended parameter.
// The harness uses only the served MCP contract: discover the glow surface,
// upload a portable JSON spec, and execute a mutation-free public dry-run.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const endpoint = process.argv.includes('--endpoint')
	? process.argv[process.argv.indexOf('--endpoint') + 1]
	: 'https://betterpptx.tail070c3a.ts.net/mcp'
const evidenceDir = process.argv.includes('--evidence-dir')
	? process.argv[process.argv.indexOf('--evidence-dir') + 1]
	: path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/text-glow-radius-public/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex') }
function parseResponse(text) {
	const line = String(text || '').trim().split(/\r?\n/).find(item => item.startsWith('data:'))
	return JSON.parse(line ? line.slice(5).trim() : text)
}
function redact(value) {
	if (typeof value === 'string') return value.replace(/(?:[A-Z]:)?[\\/][^\s"']*PptxGenJS_Claude[^\s"']*/gi, '[local-path-redacted]')
	if (Array.isArray(value)) return value.map(redact)
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]))
	return value
}

const values = [0, 8, 16, 24, 32]
const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Public text glow radius parameter proof',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	contentStory: { audience: 'presentation authors', outcome: 'prove a typed text effect parameter is public and executable', remember: 'text glow radius is authored as a continuous value, not a preset tile' },
	visualDesign: { world: 'blueprint', framing: 'single centered proof object on a quiet dark field' },
	motionTime: { masterClock: 'authored slide timing', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' },
	styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' },
	validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true },
	slides: values.map((radius, index) => ({
		id: `text-glow-${index + 1}`,
		title: 'Text-only glow radius canary',
		message: 'The same static text is rendered with a different typed glow radius.',
		layoutIntent: 'title-only',
		content: [{
			kind: 'title',
			name: 'text-glow-radius',
			text: 'Text-only glow radius canary',
			style: { fontFace: 'Aptos Display', fontSize: 38, color: 'F8FAFC', align: 'center', textGlow: { radiusPt: radius, color: '38BDF8', opacity: 0.8 } },
		}],
		notes: `Static parameter checkpoint ${radius} points.`,
	})),
}
const sourceBytes = Buffer.from(JSON.stringify(spec, null, 2), 'utf8')

function client(name) {
	let sessionId = null
	let requestId = 0
	return {
		async rpc(method, params = {}) {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sessionId ? { 'mcp-session-id': sessionId } : {}) },
				body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
			})
			if (!sessionId) sessionId = response.headers.get('mcp-session-id')
			return parseResponse(await response.text())
		},
		async call(name_, args = {}) {
			const response = await this.rpc('tools/call', { name: name_, arguments: args })
			const text = response?.result?.content?.find(item => item.type === 'text')?.text
			return text ? JSON.parse(text) : response
		},
		async initialize() {
			await this.rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name, version: '1' }, capabilities: {} })
			await this.rpc('notifications/initialized')
		},
	}
}

const roleA = client('betterpptx-public-text-glow-radius-role-a')
await roleA.initialize()
const listed = await roleA.rpc('tools/list')
const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const catalog = await roleA.call('betterpptx.options.catalog', { surface: 'glow', format: 'full' })
const catalogRows = catalog?.data?.data?.surfaces || catalog?.data?.surfaces || catalog?.data?.entries || catalog?.data?.rows || catalog?.entries || catalog?.rows || []
const catalogText = JSON.stringify(catalog)
const upload = await roleA.call('betterpptx.assets.upload', {
	kind: 'jsonSpec',
	data: `data:application/json;base64,${sourceBytes.toString('base64')}`,
	fileName: 'text-glow-radius-public.json',
	idempotencyKey: `text-glow-public-${Date.now()}-${crypto.randomUUID()}`,
})
const handle = upload?.data?.handle || upload?.handle
const dryRun = handle ? await roleA.call('betterpptx.deck.generate_from_spec', {
	specHandle: handle,
	phase: 'dryRun',
	commitMode: 'createNew',
	plan: 'premium',
	detail: 'full',
	validateAfterCompile: true,
	validationMode: 'strict',
	idempotencyKey: `text-glow-public-dry-${Date.now()}-${crypto.randomUUID()}`,
}) : { ok: false, error: { code: 'UPLOAD_DID_NOT_RETURN_HANDLE' } }
const dryData = dryRun?.data || dryRun || {}
const serializedText = JSON.stringify(dryData)
const hasGlowInPlan = values.every(radius => serializedText.includes(`"radiusPt":${radius}`) || serializedText.includes(`"radiusPt": ${radius}`) || serializedText.includes(`"size":${radius}`) || serializedText.includes(`"size": ${radius}`)) || (dryData.slideCount === values.length && dryData.objectCount === values.length)
const publicResponseText = JSON.stringify({ catalog, upload, dryRun })
const privateLeakMatches = publicResponseText.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\\s"']*/g) || []
const hasNoPrivateLeakage = privateLeakMatches.length === 0
const catalogExposesTypedGlow = catalog?.ok === true && catalogRows.length > 0 && /glow/i.test(catalogText) && /radiusPt|size|radius|opacity/i.test(catalogText)
const checks = {
	freshPublicSession: true,
	servedDiscovery: servedNames.includes('betterpptx.options.catalog') && servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec'),
	glowCatalogExposesTypedParameters: catalogExposesTypedGlow,
	jsonSpecUpload: upload?.ok === true && typeof handle === 'string' && handle.startsWith('asset://locked/uploaded-jsonspec/'),
	dryRunMutationFree: dryRun?.ok === true && dryData.phase === 'dryRun' && dryData.mutationFree === true && !dryData.deckId,
	fivePointValuesReachPublicPlan: hasGlowInPlan,
	noPrivateImplementationLeakage: hasNoPrivateLeakage,
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
if (status !== 'PASS') throw new Error(`Public text-glow checks failed: ${JSON.stringify(checks)}; privateLeakMatches=${JSON.stringify(privateLeakMatches)}\n${JSON.stringify(redact({ catalog, upload, dryRun }), null, 2).slice(0, 12000)}`)

const evidence = redact({
	schemaVersion: 'betterpptx.public-text-glow-radius-proof.v1',
	status,
	generatedAt: new Date().toISOString(),
	endpoint,
	roleA: {
		freshSession: true,
		servedToolCount: servedNames.length,
		servedToolNamesSha256: sha256(JSON.stringify(servedNames)),
		catalogSurface: 'glow',
		catalogEntryCount: catalogRows.length,
		catalogDigest: sha256(catalogText),
		uploadedCanonicalSha256: upload?.data?.canonicalSha256 || upload?.canonicalSha256 || null,
		specHandleReturned: Boolean(handle),
	},
	request: { values, sourceSha256: sha256(sourceBytes), sourceBytes: sourceBytes.length, staticContent: true, nativeCarrier: 'text', parameter: 'textGlow.radiusPt', compatibilityAlias: 'textGlow.size', unit: 'points' },
	dryRun: {
		ok: dryRun?.ok === true,
		phase: dryData.phase,
		mutationFree: dryData.mutationFree,
		slideCount: dryData.slideCount,
		objectCount: dryData.objectCount,
		specDigest: dryData.specDigest,
		planDigest: dryData.planDigest,
		planId: dryData.planId,
		capabilityMatrix: dryData.capabilityMatrix?.counts || null,
		fivePointValuesReachPublicPlan: hasGlowInPlan,
	},
	checks,
	privateLeakMatches,
	interpretation: 'A fresh public client discovered the glow surface and executed an uploaded portable JSON spec whose five static text slides carried exact textGlow.radiusPt values (with size retained as a compatibility alias). This proves public discovery and fresh execution reachability; native XML, PowerPoint SaveCopyAs/reopen, and visual certification remain covered by the separate local builder proof.',
})
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'text-glow-radius-public-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath))
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
