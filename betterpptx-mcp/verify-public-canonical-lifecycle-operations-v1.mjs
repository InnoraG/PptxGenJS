#!/usr/bin/env node
// Fresh Role-A public-client proof for the minimum durable authoring lifecycle.
// This verifier intentionally talks only to the served MCP endpoint.  It uses
// a compact valid spec so the lifecycle boundary is fast and independent of
// the canonical 25-slide visual proof.

import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'

function arg(name, fallback) {
	const index = process.argv.indexOf(name)
	return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const endpoint = arg('--endpoint', 'https://betterpptx.tail070c3a.ts.net/mcp')
const evidenceDir = arg('--evidence-dir', path.resolve(`outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-lifecycle-operations/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`))
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const unwrap = result => result?.data || result || {}
const redact = value => {
	if (typeof value === 'string') return value.replace(/[A-Za-z]:[\\/][^\s"']*/g, '[local-path-redacted]')
	if (Array.isArray(value)) return value.map(redact)
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]))
	return value
}

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Lifecycle operation proof',
	layout: 'LAYOUT_WIDE',
	handshake: {
		audience: 'lifecycle verifier',
		promise: 'Prove the durable public authoring lifecycle.',
		proof: 'One native title/body slide with public readback.',
		payoff: 'A client can import, compile, inspect, export, and continue a spec.',
		bar: 'Repair-free, editable, durable public artifact.',
		commitments: ['Native PowerPoint objects', 'Durable source readback', 'No whole-slide rasterization'],
	},
	authoringContract: { workflow: 'authoring-excellence-director-v1' },
	contentStory: { audience: 'lifecycle verifier', outcome: 'prove lifecycle operations', remember: 'durable readback' },
	visualDesign: { world: 'neutral', framing: 'one native title/body' },
	representationPolicy: { priority: 'maximize-native', forbidWholeSlideRasterization: true, forbidSemanticTextRasterization: true, preferNativeComposite: true, preferEditableCustomGeometry: true, preferPreservedVector: true, allowIsolatedEffectFallback: true, fallbackScope: 'smallest-effect-subtree', requireFallbackLedger: true },
	motionTime: { masterClock: 'authored', timingSource: 'static' },
	motion: { autoSync: false, policy: 'none', inferFromHtml: false, preserveAuthoredDelays: false, cueFocusedEmphasis: false, supportLayersInheritOwnerMotion: false },
	narrationPolicy: { required: false, synthesizeAudio: false, preserveInNotes: false, captionPolicy: 'none', failurePolicy: 'notes-only' },
	validation: { validateBeforeSave: true, previewBeforeSave: false, readabilityPolicy: 'faithful-html', requireAccessibility: false, requireNativeEditability: true, requireNarration: false, requireMotion: false, forbidWholeSlideRasterization: true, requireFallbackLedger: true },
	slides: [{
		id: 'lifecycle-1', title: 'Lifecycle operation proof', layoutIntent: 'title-body',
		content: [
			{ kind: 'title', name: 'title', text: 'Lifecycle operation proof' },
			{ kind: 'textBox', name: 'body', region: 'body', text: 'Create import validate get export resolve compile' },
		],
	}],
}
const sourceBytes = Buffer.from(`${JSON.stringify(spec, null, 2)}\n`, 'utf8')

function makeClient(name) {
	let sessionId = null
	let requestId = 0
	async function rpc(method, params = {}) {
		const requestBody = JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params })
		const parsed = new URL(endpoint)
		const client = parsed.protocol === 'https:' ? https : http
		const response = await new Promise((resolve, reject) => {
			const req = client.request(parsed, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'Content-Length': Buffer.byteLength(requestBody), ...(sessionId ? { 'mcp-session-id': sessionId } : {}) },
			})
			req.setTimeout(0)
			req.once('error', reject)
			req.once('response', res => {
				const chunks = []
				res.on('data', chunk => chunks.push(Buffer.from(chunk)))
				res.once('error', reject)
				res.once('end', () => resolve({ headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }))
			})
			req.end(requestBody)
		})
		if (!sessionId) sessionId = response.headers['mcp-session-id'] || response.headers['Mcp-Session-Id'] || null
		const text = response.text.trim()
		const line = text.split(/\r?\n/).find(value => value.startsWith('data:'))
		return JSON.parse(line ? line.slice(5).trim() : text)
	}
	return {
		async initialize() {
			await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name, version: '1' }, capabilities: {} })
			await rpc('notifications/initialized')
		},
		rpc,
		async call(tool, arguments_ = {}) {
			const response = await rpc('tools/call', { name: tool, arguments: arguments_ })
			const text = response?.result?.content?.find(item => item.type === 'text')?.text
			return text ? JSON.parse(text) : response
		},
	}
}

function callId(label) { return `lifecycle-operations-${label}-${Date.now()}-${crypto.randomUUID()}` }
function errorOf(result) { return result?.error ? { code: result.error.code || null, message: result.error.message || null, details: result.error.details || null } : null }

const roleA = makeClient('betterpptx-public-canonical-lifecycle-operations-role-a')
await roleA.initialize()
const listed = await roleA.rpc('tools/list')
const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()

const uploadedResult = await roleA.call('betterpptx.assets.upload', {
	kind: 'jsonSpec', data: `data:application/json;base64,${sourceBytes.toString('base64')}`,
	fileName: 'lifecycle-operation-proof.json', idempotencyKey: callId('upload'),
})
const uploaded = unwrap(uploadedResult)
const specHandle = uploaded.handle

const dryResult = specHandle ? await roleA.call('betterpptx.deck.generate_from_spec', {
	specHandle, phase: 'dryRun', commitMode: 'createNew', plan: 'free', detail: 'full',
	validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('dry-run'),
}) : { ok: false, error: { code: 'UPLOAD_DID_NOT_RETURN_HANDLE', message: 'Upload returned no spec handle' } }
const dry = unwrap(dryResult)

// Resolve is the public sealing step.  It must return a plan identity that a
// client can carry into lockedDryRun and commit without private knowledge.
const resolveResult = specHandle ? await roleA.call('betterpptx.deck.generate_from_spec', {
	specHandle, phase: 'resolve', commitMode: 'createNew', plan: 'free', detail: 'full',
	validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('resolve'),
}) : { ok: false, error: { code: 'NO_SPEC_HANDLE' } }
const resolved = unwrap(resolveResult)
const sealedPlanId = resolved.lockedPlanId || resolved.planId || resolved.lockId || null
const sealedPlanDigest = resolved.planDigest || resolved.lockedPlanDigest || resolved.plan?.digest || null

const lockedDryResult = specHandle && sealedPlanId ? await roleA.call('betterpptx.deck.generate_from_spec', {
	specHandle, phase: 'lockedDryRun', commitMode: 'createNew', plan: 'free', planId: sealedPlanId,
	lockedPlanId: sealedPlanId, planDigest: sealedPlanDigest, detail: 'full', validateAfterCompile: true,
	validationMode: 'strict', idempotencyKey: callId('locked-dry-run'),
}) : { ok: false, error: { code: 'RESOLVE_DID_NOT_RETURN_PLAN_ID' } }
const lockedDry = unwrap(lockedDryResult)

const commitResult = dryResult?.ok === true && dry.planId ? await roleA.call('betterpptx.deck.generate_from_spec', {
	specHandle, phase: 'commit', commitMode: 'createNew', plan: 'free', planId: dry.planId,
	lockedPlanId: dry.planId, planDigest: dry.planDigest, detail: 'summary', validateAfterCompile: true,
	validationMode: 'strict', billingConfirmed: true, saveAfterCommit: false, idempotencyKey: callId('commit'),
}) : { ok: false, error: { code: 'DRY_RUN_DID_NOT_RETURN_PLAN' } }
const committed = unwrap(commitResult)
const deckId = committed.deckId || commitResult.deckId || null
const deckVersion = committed.deckVersion || commitResult.deckVersion || undefined

const validateResult = deckId ? await roleA.call('betterpptx.deck.validate', { deckId, deckVersion, mode: 'strict', detail: 'full' }) : { ok: false, error: { code: 'NO_DECK_ID' } }
const summaryResult = deckId ? await roleA.call('betterpptx.deck.summary', { deckId, deckVersion, detail: 'full' }) : { ok: false, error: { code: 'NO_DECK_ID' } }
const exportResult = deckId ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'authoredInput', download: false, detail: 'full' }) : { ok: false, error: { code: 'NO_DECK_ID' } }
const bundleResult = deckId ? await roleA.call('betterpptx.spec.export_bundle', { deckId, mode: 'authoredInput', download: false, detail: 'full' }) : { ok: false, error: { code: 'NO_DECK_ID' } }
const qualityResult = deckId ? await roleA.call('betterpptx.deck.validate_quality', { deckId, deckVersion, profile: 'static', requireMotion: false, requireVisualProof: false }) : { ok: false, error: { code: 'NO_DECK_ID' } }

const responseText = JSON.stringify({ listed, uploadedResult, dryResult, resolveResult, lockedDryResult, commitResult, validateResult, summaryResult, exportResult, bundleResult, qualityResult })
const leakagePatterns = [/D:\\PptxGenJS_Claude/i, /node_modules/i, /engine\.mjs/i, /PptxGenJS/i]
const leakage = leakagePatterns.filter(pattern => pattern.test(responseText)).map(String)
const exported = unwrap(exportResult)
const exportedSpec = exported.spec || exported.effectiveSpec || exported
const summary = unwrap(summaryResult)
const checks = {
	freshRoleASession: true,
	servedDiscovery: ['betterpptx.assets.upload', 'betterpptx.deck.generate_from_spec', 'betterpptx.deck.validate', 'betterpptx.deck.summary', 'betterpptx.deck.export_spec', 'betterpptx.spec.export_bundle'].every(name => servedNames.includes(name)),
	import: uploadedResult?.ok === true && /^asset:\/\/locked\/uploaded-jsonspec\//.test(String(specHandle || '')) && /^[a-f0-9]{64}$/.test(String(uploaded.canonicalSha256 || '')),
	create: commitResult?.ok === true && typeof deckId === 'string',
	validate: validateResult?.ok === true,
	get: summaryResult?.ok === true && (summary.slideCount === 1 || summary.slides?.length === 1 || summary.deckId === deckId),
	export: exportResult?.ok === true && (exportedSpec?.schemaVersion === spec.schemaVersion || exported.specArtifact?.schemaVersion === spec.schemaVersion || Boolean(exported.artifact || exported.specArtifact)),
	resolveSealLock: resolveResult?.ok === true && typeof sealedPlanId === 'string' && typeof sealedPlanDigest === 'string',
	lockedDryRun: lockedDryResult?.ok === true && lockedDry.phase === 'lockedDryRun' && lockedDry.mutationFree === true,
	compile: commitResult?.ok === true && committed.slideCount === 1,
	bundleExport: bundleResult?.ok === true,
	quality: qualityResult?.ok === true,
	noPrivateImplementationLeakage: leakage.length === 0,
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
const evidence = redact({
	schemaVersion: 'betterpptx.public-canonical-lifecycle-operations-proof.v1', status, generatedAt: new Date().toISOString(), endpoint,
	clientProfile: 'fresh-role-a-public-endpoint-only', source: { schemaVersion: spec.schemaVersion, rawSha256: sha256(sourceBytes), rawBytes: sourceBytes.length, slideCount: spec.slides.length },
	servedContract: { toolCount: servedNames.length, toolNamesSha256: sha256(JSON.stringify(servedNames)), requiredToolsPresent: checks.servedDiscovery },
	operations: {
		import: { ok: uploadedResult?.ok === true, handle: specHandle, canonicalSha256: uploaded.canonicalSha256, rawSha256: uploaded.rawSha256 },
		create: { ok: commitResult?.ok === true, deckId, deckVersion },
		validate: { ok: validateResult?.ok === true, error: errorOf(validateResult) },
		get: { ok: summaryResult?.ok === true, summary: { deckId: summary.deckId || null, slideCount: summary.slideCount || summary.slides?.length || null } },
		export: { ok: exportResult?.ok === true, schemaVersion: exportedSpec?.schemaVersion || exported.specArtifact?.schemaVersion || null, artifact: Boolean(exported.artifact || exported.specArtifact) },
		resolveSealLock: { ok: resolveResult?.ok === true, phase: resolved.phase || null, planId: sealedPlanId, planDigest: sealedPlanDigest, error: errorOf(resolveResult) },
		lockedDryRun: { ok: lockedDryResult?.ok === true, phase: lockedDry.phase || null, mutationFree: lockedDry.mutationFree, planDigest: lockedDry.planDigest || null, error: errorOf(lockedDryResult) },
		compile: { ok: commitResult?.ok === true, phase: committed.phase || null, slideCount: committed.slideCount || null, objectCount: committed.objectCount || null },
		bundleExport: { ok: bundleResult?.ok === true, bundleSha256: unwrap(bundleResult).bundleSha256 || null, sourceDigest: unwrap(bundleResult).sourceDigest || null },
		quality: { ok: qualityResult?.ok === true, warnings: unwrap(qualityResult).warnings?.length || 0, blockingIssues: unwrap(qualityResult).blockingIssues?.length || 0 },
	},
	checks,
	privacy: { leakage },
	externalBoundaries: ['authoritative preview/save is not invoked; this proof covers lifecycle operations through durable public readback', 'narrated TTS is not invoked'],
	publicErrors: { resolve: errorOf(resolveResult), lockedDryRun: errorOf(lockedDryResult) },
})
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'canonical-25-lifecycle-operations-public-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath))
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
if (status !== 'PASS') process.exitCode = 1
