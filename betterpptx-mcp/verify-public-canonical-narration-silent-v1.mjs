#!/usr/bin/env node
// Fresh Role-A public-client proof for silent timed notes on the canonical
// 25-slide source. This intentionally uses only the served public MCP
// contract; the private engine is not imported by this verifier.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

function arg(name, fallback) {
	const index = process.argv.indexOf(name)
	return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const endpoint = arg('--endpoint', 'https://betterpptx.tail070c3a.ts.net/mcp')
const sourcePath = arg('--source', path.resolve('tmp_autonomous_test/GPT56_BetterPPTX_Canonical_Full_Spec.json'))
const evidenceDir = arg('--evidence-dir', path.resolve(`outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-slide-narration-transition-public/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`))
const sourceBytes = fs.readFileSync(sourcePath)
const source = JSON.parse(sourceBytes.toString('utf8'))
if (source.schemaVersion !== 'betterpptx.deck-spec.v1' || source.slides?.length !== 25) throw new Error('Expected the canonical 25-slide BetterPPTX spec.')

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const countCues = spec => (spec?.slides || []).reduce((sum, slide) => sum + (slide?.narration?.cues?.length || 0), 0)
const countTransitions = spec => (spec?.slides || []).filter(slide => slide?.transition && typeof slide.transition === 'object').length
const unwrap = result => result?.data || result || {}
const assertOk = (result, label) => { if (result?.ok !== true) throw new Error(`${label} failed: ${JSON.stringify(result).slice(0, 2000)}`); return unwrap(result) }

let sessionId = null
let requestId = 0
async function rpc(method, params = {}) {
	const response = await fetch(endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sessionId ? { 'mcp-session-id': sessionId } : {}) },
		body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
	})
	if (!sessionId) sessionId = response.headers.get('mcp-session-id')
	const text = await response.text()
	const line = text.trim().split(/\r?\n/).find(value => value.startsWith('data:'))
	return JSON.parse(line ? line.slice(5).trim() : text)
}
async function call(name, arguments_ = {}) {
	const result = await rpc('tools/call', { name, arguments: arguments_ })
	const text = result?.result?.content?.find(item => item.type === 'text')?.text
	return text ? JSON.parse(text) : result
}

await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'betterpptx-public-canonical-narration-silent-v1', version: '1' }, capabilities: {} })
await rpc('notifications/initialized')
const listed = await rpc('tools/list')
const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const executionSpec = {
	...source,
	outputVariant: 'silent-timed-notes',
	selectedOutputVariants: ['silent-timed-notes'],
	narrationPolicy: { ...(source.narrationPolicy || {}), synthesizeAudio: false, required: false, failurePolicy: 'notes-only' },
	slides: source.slides.map(slide => ({ ...slide, narration: slide.narration && typeof slide.narration === 'object' ? { ...slide.narration, synthesizeAudio: false, useAsTimingAuthority: false } : slide.narration })),
}
const executionBytes = Buffer.from(`${JSON.stringify(executionSpec)}\n`)
const uploaded = assertOk(await call('betterpptx.assets.upload', {
	kind: 'jsonSpec',
	data: `data:application/json;base64,${executionBytes.toString('base64')}`,
	fileName: 'canonical-25-slide-silent-timed-notes.json',
	idempotencyKey: `canonical-public-upload-${Date.now()}-${crypto.randomUUID()}`,
}), 'public jsonSpec upload')
const dry = assertOk(await call('betterpptx.deck.generate_from_spec', {
	specHandle: uploaded.handle,
	phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'summary',
	validateAfterCompile: true, validationMode: 'strict',
	idempotencyKey: `canonical-public-silent-dry-${Date.now()}-${crypto.randomUUID()}`,
}), 'public silent timed-notes dryRun')
const commit = assertOk(await call('betterpptx.deck.generate_from_spec', {
	specHandle: uploaded.handle,
	phase: 'commit', commitMode: 'createNew', plan: 'premium',
	planId: dry.planId, lockedPlanId: dry.planId, planDigest: dry.planDigest,
	detail: 'summary', validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true,
	saveAfterCommit: false,
	idempotencyKey: `canonical-public-silent-commit-${Date.now()}-${crypto.randomUUID()}`,
}), 'public silent timed-notes commit')
const deckId = commit.deckId
const currentExport = assertOk(await call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'summary' }), 'public silent timed-notes readback')
const currentSpec = currentExport.spec || currentExport.effectiveSpec || currentExport
const quality = await call('betterpptx.deck.validate_quality', { deckId, profile: 'modern', detail: 'summary', requireMotion: false, requireVisualProof: false })

const returnedText = JSON.stringify({ listed, uploaded, dry, commit, currentExport, quality })
const leakage = [/D:\\PptxGenJS_Claude/i, /node_modules/i, /engine\.mjs/i, /PptxGenJS/i].filter(pattern => pattern.test(returnedText)).map(String)
const sourceCues = countCues(source)
const currentCues = countCues(currentSpec)
const sourceTransitions = countTransitions(source)
const currentTransitions = countTransitions(currentSpec)
const checks = {
	freshRoleASession: true,
	servedDiscovery: servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec') && servedNames.includes('betterpptx.deck.export_spec'),
	canonical25Slides: source.slides.length === 25 && currentSpec.slides?.length === 25,
	silentExecutionSelected: executionSpec.outputVariant === 'silent-timed-notes' && executionSpec.narrationPolicy.synthesizeAudio === false,
	dryRunMutationFree: dry.mutationFree === true && !dry.deckId,
	committedDeck: typeof deckId === 'string' && commit.slideCount === 25,
	narrationCueReadback: currentCues === sourceCues && currentCues === 156,
	transitionReadback: currentTransitions === sourceTransitions && currentTransitions === 25,
	qualityReturned: quality?.ok === true,
	noPrivateImplementationLeakage: leakage.length === 0,
}
const evidence = {
	schemaVersion: 'betterpptx.public-canonical-narration-silent-proof.v1',
	status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
	generatedAt: new Date().toISOString(),
	endpoint,
	clientProfile: 'fresh-role-a-after-candidate-redeploy',
	source: { file: path.relative(process.cwd(), sourcePath).replaceAll('\\', '/'), rawSha256: sha256(sourceBytes), rawBytes: sourceBytes.length, slides: source.slides.length, narrationCues: sourceCues, transitionIntents: sourceTransitions },
	execution: { variant: executionSpec.outputVariant, sha256: sha256(executionBytes), uploadHandle: uploaded.handle, dryRun: { planDigest: dry.planDigest, slideCount: dry.slideCount, objectCount: dry.objectCount, mutationFree: dry.mutationFree }, commit: { deckId, slideCount: commit.slideCount, objectCount: commit.objectCount } },
	readback: { slides: currentSpec.slides?.length || 0, narrationCues: currentCues, transitionIntents: currentTransitions },
	quality: { ok: quality?.ok === true, warningCount: quality?.warnings?.length || 0, blockingIssueCount: quality?.blockingIssues?.length || 0 },
	checks,
	privacy: { rawXmlIncluded: false, localPathsIncluded: false, privateImplementationIncluded: false, leakage },
	externalBoundary: 'Public preview/save remains an explicit external infrastructure boundary; this fresh-client proof certifies public upload, dryRun, commit, and authored-spec readback for silent timed notes without TTS synthesis.',
}
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'public-canonical-narration-silent-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath))
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
if (evidence.status !== 'PASS') process.exitCode = 1
