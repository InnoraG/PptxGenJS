#!/usr/bin/env node
// Fresh Role-A/Role-B public proof for portable .betterpptx regeneration.
// Role B receives only the downloaded bundle bytes and regenerates a silent
// native deck; no Role-A session handle or private implementation is reused.

import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'

const endpoint = 'https://betterpptx.tail070c3a.ts.net/mcp'
const sourcePath = path.resolve('tmp_autonomous_test/GPT56_BetterPPTX_Canonical_Full_Spec.json')
const evidenceDir = path.resolve(`outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-portable-regeneration/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const unwrap = result => result?.data || result || {}
const callId = label => `portable-regeneration-${label}-${Date.now()}-${crypto.randomUUID()}`

function redact(value) {
	if (typeof value === 'string') return value.replace(/[A-Za-z]:[\\/][^\s"']*/g, '[local-path-redacted]')
	if (Array.isArray(value)) return value.map(redact)
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]))
	return value
}

function client(name) {
	let sessionId = null
	let requestId = 0
	async function rpc(method, params = {}) {
		const body = JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params })
		const parsed = new URL(endpoint)
		const transport = parsed.protocol === 'https:' ? https : http
		const response = await new Promise((resolve, reject) => {
			const req = transport.request(parsed, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'Content-Length': Buffer.byteLength(body), ...(sessionId ? { 'mcp-session-id': sessionId } : {}) } })
			req.setTimeout(0)
			req.once('error', reject)
			req.once('response', res => { const chunks = []; res.on('data', chunk => chunks.push(Buffer.from(chunk))); res.once('error', reject); res.once('end', () => resolve({ headers: res.headers, text: Buffer.concat(chunks).toString('utf8') })) })
			req.end(body)
		})
		if (!sessionId) sessionId = response.headers['mcp-session-id'] || response.headers['Mcp-Session-Id'] || null
		const text = response.text.trim()
		const line = text.split(/\r?\n/).find(value => value.startsWith('data:'))
		return JSON.parse(line ? line.slice(5).trim() : text)
	}
	return {
		async initialize() { await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name, version: '1' }, capabilities: {} }); await rpc('notifications/initialized') },
		rpc,
		async call(tool, arguments_ = {}) { const response = await rpc('tools/call', { name: tool, arguments: arguments_ }); const text = response?.result?.content?.find(item => item.type === 'text')?.text; return text ? JSON.parse(text) : response },
	}
}

if (!fs.existsSync(sourcePath)) throw new Error(`Missing canonical source: ${sourcePath}`)
const sourceBytes = fs.readFileSync(sourcePath)
const source = JSON.parse(sourceBytes.toString('utf8'))
if (source.schemaVersion !== 'betterpptx.deck-spec.v1' || source.slides?.length !== 25) throw new Error('Expected the canonical 25-slide source.')
const executionSpec = { ...source, outputVariant: 'silent-timed-notes', selectedOutputVariants: ['silent-timed-notes'], narrationPolicy: { ...(source.narrationPolicy || {}), synthesizeAudio: false, required: false, failurePolicy: 'notes-only' }, slides: source.slides.map(slide => ({ ...slide, narration: slide.narration && typeof slide.narration === 'object' ? { ...slide.narration, synthesizeAudio: false, useAsTimingAuthority: false } : slide.narration })) }
const executionBytes = Buffer.from(`${JSON.stringify(executionSpec)}\n`, 'utf8')

const roleA = client('betterpptx-public-portable-regeneration-role-a')
await roleA.initialize()
const toolsA = await roleA.rpc('tools/list')
const servedNamesA = (toolsA?.result?.tools || []).map(tool => tool.name).sort()
const uploadAResult = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${executionBytes.toString('base64')}`, fileName: 'canonical-25-portable-regeneration.json', idempotencyKey: callId('role-a-upload') })
const uploadA = unwrap(uploadAResult)
const bundleResult = uploadA.handle ? await roleA.call('betterpptx.spec.export_bundle', { specHandle: uploadA.handle, mode: 'authoredInput', download: true, fileName: 'canonical-25-portable-regeneration' }) : { ok: false, error: { code: 'UPLOAD_DID_NOT_RETURN_HANDLE' } }
const bundle = unwrap(bundleResult)
let bundleBytes = null
if (bundle.artifact?.downloadUrl) bundleBytes = Buffer.from(await (await fetch(bundle.artifact.downloadUrl)).arrayBuffer())
const bundleData = bundleBytes ? `data:application/zip;base64,${bundleBytes.toString('base64')}` : null

const roleB = client('betterpptx-public-portable-regeneration-role-b')
await roleB.initialize()
const toolsB = await roleB.rpc('tools/list')
const servedNamesB = (toolsB?.result?.tools || []).map(tool => tool.name).sort()
const inspectResult = bundleData ? await roleB.call('betterpptx.bundle.inspect', { data: bundleData }) : { ok: false, error: { code: 'BUNDLE_DOWNLOAD_DID_NOT_RETURN_BYTES' } }
const importResult = bundleData ? await roleB.call('betterpptx.bundle.import', { data: bundleData }) : { ok: false, error: { code: 'BUNDLE_DOWNLOAD_DID_NOT_RETURN_BYTES' } }
const imported = unwrap(importResult)
const dryResult = imported.specHandle ? await roleB.call('betterpptx.deck.generate_from_spec', { specHandle: imported.specHandle, phase: 'dryRun', commitMode: 'createNew', plan: 'free', detail: 'summary', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('role-b-dry') }) : { ok: false, error: { code: 'IMPORT_DID_NOT_RETURN_HANDLE' } }
const dry = unwrap(dryResult)
const commitResult = dryResult?.ok === true && dry.planId ? await roleB.call('betterpptx.deck.generate_from_spec', { specHandle: imported.specHandle, phase: 'commit', commitMode: 'createNew', plan: 'free', planId: dry.planId, lockedPlanId: dry.planId, planDigest: dry.planDigest, detail: 'summary', validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, saveAfterCommit: false, idempotencyKey: callId('role-b-commit') }) : { ok: false, error: { code: 'DRY_RUN_DID_NOT_RETURN_PLAN' } }
const committed = unwrap(commitResult)
const deckId = committed.deckId || commitResult.deckId || null
const exportResult = deckId ? await roleB.call('betterpptx.deck.export_spec', { deckId, mode: 'authoredInput', download: false, detail: 'summary' }) : { ok: false, error: { code: 'NO_DECK_ID' } }
const exported = unwrap(exportResult)
const readbackSpec = exported.spec || exported.effectiveSpec || exported
const qualityResult = deckId ? await roleB.call('betterpptx.deck.validate_quality', { deckId, profile: 'static', requireMotion: false, requireVisualProof: false }) : { ok: false, error: { code: 'NO_DECK_ID' } }

const returned = JSON.stringify({ toolsA, toolsB, uploadAResult, bundleResult, inspectResult, importResult, dryResult, commitResult, exportResult, qualityResult })
const leakage = [/D:\\PptxGenJS_Claude/i, /node_modules/i, /engine\.mjs/i, /PptxGenJS/i].filter(pattern => pattern.test(returned)).map(String)
const inspectData = unwrap(inspectResult)
const checks = {
	freshRoleAandRoleB: true,
	servedDiscovery: ['betterpptx.assets.upload', 'betterpptx.spec.export_bundle', 'betterpptx.bundle.inspect', 'betterpptx.bundle.import', 'betterpptx.deck.generate_from_spec', 'betterpptx.deck.export_spec'].every(name => servedNamesA.includes(name) && servedNamesB.includes(name)),
	sourceCanonical25: source.slides.length === 25,
	roleAUpload: uploadAResult?.ok === true && typeof uploadA.handle === 'string',
	bundleExported: bundleResult?.ok === true && Boolean(bundle.artifact?.downloadUrl) && bundleBytes?.length > 0,
	bundleInspected: inspectResult?.ok === true && inspectData.memberCount >= 4,
	bundleImportedFresh: importResult?.ok === true && typeof imported.specHandle === 'string' && imported.specHandle !== uploadA.handle,
	sourceIdentityRetained: Boolean(bundle.sourceDigest) && bundle.sourceDigest === inspectData.sourceDigest && imported.sourceDigest === inspectData.sourceDigest,
	roleBDryRunMutationFree: dryResult?.ok === true && dry.mutationFree === true && dry.slideCount === 25 && !dry.deckId,
	roleBRegenerated: commitResult?.ok === true && typeof deckId === 'string' && committed.slideCount === 25,
	roleBReadback: exportResult?.ok === true && readbackSpec.slides?.length === 25 && readbackSpec.outputVariant === 'silent-timed-notes',
	quality: qualityResult?.ok === true,
	noPrivateImplementationLeakage: leakage.length === 0,
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
const evidence = redact({ schemaVersion: 'betterpptx.public-canonical-portable-regeneration-proof.v1', status, generatedAt: new Date().toISOString(), endpoint, source: { file: path.relative(process.cwd(), sourcePath).replaceAll('\\', '/'), rawSha256: sha256(sourceBytes), rawBytes: sourceBytes.length, executionSha256: sha256(executionBytes), slideCount: source.slides.length }, roleA: { servedToolCount: servedNamesA.length, servedToolNamesSha256: sha256(JSON.stringify(servedNamesA)), upload: { ok: uploadAResult?.ok === true, handle: uploadA.handle || null, sourceDigest: uploadA.canonicalSha256 || null }, bundle: { ok: bundleResult?.ok === true, sourceDigest: bundle.sourceDigest || null, bundleSha256: bundle.bundleSha256 || null, bytes: bundleBytes?.length || 0, memberCount: bundle.memberCount || null } }, roleB: { servedToolCount: servedNamesB.length, servedToolNamesSha256: sha256(JSON.stringify(servedNamesB)), inspect: { ok: inspectResult?.ok === true, sourceDigest: inspectData.sourceDigest || null, memberCount: inspectData.memberCount || null, boundAssetCount: inspectData.boundAssetCount || null }, import: { ok: importResult?.ok === true, specHandleReturned: Boolean(imported.specHandle), importedSourceDigest: imported.sourceDigest || null }, dryRun: { ok: dryResult?.ok === true, mutationFree: dry.mutationFree, slideCount: dry.slideCount || null, objectCount: dry.objectCount || null, planDigest: dry.planDigest || null }, commit: { ok: commitResult?.ok === true, deckId, slideCount: committed.slideCount || null, objectCount: committed.objectCount || null }, readback: { ok: exportResult?.ok === true, slideCount: readbackSpec.slides?.length || 0, outputVariant: readbackSpec.outputVariant || null }, quality: { ok: qualityResult?.ok === true, warnings: unwrap(qualityResult).warnings?.length || 0, blockingIssues: unwrap(qualityResult).blockingIssues?.length || 0 } }, checks, privacy: { leakage }, externalBoundaries: ['authoritative preview/save is not invoked; this proof certifies portable bundle export/inspect/import/regeneration and authored readback', 'narrated TTS is not invoked; silent-timed-notes is the deterministic regeneration profile'], interpretation: status === 'PASS' ? 'A fresh Role A exported a durable .betterpptx bundle and a fresh Role B inspected, imported, regenerated, compiled, quality-validated, and exported the 25-slide silent native deck while retaining the source identity and avoiding private implementation leakage.' : 'Portable regeneration exposed a public bundle or regeneration gap; the complete response is preserved for builder correction.' })
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'canonical-25-portable-regeneration-public-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath))
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
if (status !== 'PASS') process.exitCode = 1
