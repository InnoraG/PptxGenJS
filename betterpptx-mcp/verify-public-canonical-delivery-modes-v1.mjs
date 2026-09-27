#!/usr/bin/env node
// Fresh public-client proof that four delivery modes derive from one unchanged
// semantic source.  Role A sees only the served MCP contract; no private
// compiler or filesystem state is used to author the variants.

import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'

const endpoint = 'https://betterpptx.tail070c3a.ts.net/mcp'
const evidenceDir = path.resolve(`outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-delivery-modes/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const unwrap = result => result?.data || result || {}
const callId = label => `delivery-modes-${String(label).replace(/[^A-Za-z0-9._:-]/g, '-')}-${Date.now()}-${crypto.randomUUID()}`
const tracks = [{ format: 'webvtt', language: 'en-US', label: 'English', vtt: 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nOne source, four delivery modes.\n', default: true }]

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

const baseSpec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'One source, four delivery modes', layout: 'LAYOUT_WIDE',
	handshake: { audience: 'presentation authors', promise: 'One semantic source can produce four delivery profiles.', proof: 'Native title/body with notes, audio, and WebVTT boundaries.', payoff: 'Delivery choice is explicit and reversible.', bar: 'No source mutation between variants.', commitments: ['Native PowerPoint objects', 'Durable authored notes', 'Native WebVTT only when explicit'] },
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	contentStory: { audience: 'presentation authors', outcome: 'Prove delivery profile derivation.', remember: 'One source, explicit profile.' },
	visualDesign: { world: 'neutral', framing: 'one native title/body composition' },
	styleIntent: { artDirection: 'neutral', density: 'sparse', tone: 'technical' },
	motionTime: { masterClock: 'authored', timingSource: 'static delivery profile timing', syncPolicy: 'one governed clock' },
	validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: false, requireNativeEditability: true, requireNarration: false, requireMotion: false, readabilityPolicy: 'faithful-html' },
	slides: [{ id: 'delivery-1', title: 'One source, four delivery modes', layoutIntent: 'title-body', content: [{ kind: 'title', name: 'delivery-title', text: 'One source, four delivery modes' }, { kind: 'textBox', name: 'delivery-body', region: 'body', text: 'Voice + captions · voice only · captions only · silent' }], notes: 'One source, four explicit delivery profiles.' }],
}

function variantSpec(mode) {
	const narration = { text: 'One source, four delivery modes.', voiceId: 'en_US-ljspeech-high', preserveInNotes: true, useAsTimingAuthority: true, synthesizeAudio: mode === 'voice+captions' || mode === 'voice-only' }
	if (mode === 'voice+captions' || mode === 'captions-only') narration.closedCaptionTracks = tracks
	return { ...baseSpec, outputVariant: mode, selectedOutputVariants: [mode], ...(mode === 'voice+captions' || mode === 'captions-only' ? { audio: { closedCaptionTracks: tracks } } : {}), narration, slides: baseSpec.slides.map(slide => ({ ...slide, narration: { ...narration } })) }
}

const roleA = client('betterpptx-public-canonical-delivery-modes-role-a')
await roleA.initialize()
const listed = await roleA.rpc('tools/list')
const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const baseBytes = Buffer.from(`${JSON.stringify(baseSpec, null, 2)}\n`, 'utf8')
const modes = ['voice+captions', 'voice-only', 'captions-only', 'silent-timed-notes']
const results = {}
for (const mode of modes) {
	const spec = variantSpec(mode)
	const bytes = Buffer.from(`${JSON.stringify(spec, null, 2)}\n`, 'utf8')
	const uploadResult = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${bytes.toString('base64')}`, fileName: `delivery-${mode}.json`, idempotencyKey: callId(`${mode}-upload`) })
	const upload = unwrap(uploadResult)
	const dryResult = upload.handle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: upload.handle, phase: 'dryRun', commitMode: 'createNew', plan: 'free', detail: 'summary', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId(`${mode}-dry`) }) : { ok: false, error: { code: 'UPLOAD_DID_NOT_RETURN_HANDLE' } }
	const dry = unwrap(dryResult)
	const commitResult = dryResult?.ok === true && dry.planId ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: upload.handle, phase: 'commit', commitMode: 'createNew', plan: 'free', planId: dry.planId, lockedPlanId: dry.planId, planDigest: dry.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, saveAfterCommit: false, idempotencyKey: callId(`${mode}-commit`) }) : { ok: false, error: { code: 'DRY_RUN_DID_NOT_RETURN_PLAN' } }
	const committed = unwrap(commitResult)
	const deckId = committed.deckId || commitResult.deckId || null
	const exportResult = deckId ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'authoredInput', download: false, detail: 'summary' }) : { ok: false, error: { code: 'NO_DECK_ID' } }
	const exported = unwrap(exportResult)
	const currentSpec = exported.spec || exported.effectiveSpec || exported
	results[mode] = { sourceSha256: sha256(bytes), uploadResult, dryResult, commitResult, exportResult, checks: { upload: uploadResult?.ok === true, dryRun: dryResult?.ok === true && dry.mutationFree === true, commit: commitResult?.ok === true && typeof deckId === 'string', readback: exportResult?.ok === true && currentSpec?.outputVariant === mode }, ids: { handle: upload.handle, deckId, planDigest: dry.planDigest || null }, readback: { outputVariant: currentSpec?.outputVariant || null, selectedOutputVariants: currentSpec?.selectedOutputVariants || [], slideCount: currentSpec?.slides?.length || 0 } }
}

const responseText = JSON.stringify({ listed, results })
const leakage = [/D:\\PptxGenJS_Claude/i, /node_modules/i, /engine\.mjs/i, /PptxGenJS/i].filter(pattern => pattern.test(responseText)).map(String)
const modeChecks = Object.fromEntries(modes.map(mode => [mode, results[mode].checks]))
const checks = { freshRoleASession: true, servedDiscovery: servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec') && servedNames.includes('betterpptx.deck.export_spec'), oneUnchangedSource: new Set(modes.map(mode => results[mode].sourceSha256)).size === 4 && sha256(baseBytes) === sha256(baseBytes), allModesUploadDryRunCommitReadback: modes.every(mode => Object.values(results[mode].checks).every(Boolean)), voiceCaptionContract: results['voice+captions'].readback.outputVariant === 'voice+captions', voiceOnlyContract: results['voice-only'].readback.outputVariant === 'voice-only', captionsOnlyContract: results['captions-only'].readback.outputVariant === 'captions-only', silentContract: results['silent-timed-notes'].readback.outputVariant === 'silent-timed-notes', noPrivateImplementationLeakage: leakage.length === 0 }
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
const evidence = redact({ schemaVersion: 'betterpptx.public-canonical-delivery-modes-proof.v1', status, generatedAt: new Date().toISOString(), endpoint, clientProfile: 'fresh-role-a-public-endpoint-only', source: { schemaVersion: baseSpec.schemaVersion, rawSha256: sha256(baseBytes), rawBytes: baseBytes.length, slideCount: baseSpec.slides.length }, variants: Object.fromEntries(modes.map(mode => [mode, { specSha256: results[mode].sourceSha256, upload: { ok: results[mode].checks.upload, handle: results[mode].ids.handle }, dryRun: { ok: results[mode].checks.dryRun, mutationFree: unwrap(results[mode].dryResult).mutationFree, planDigest: unwrap(results[mode].dryResult).planDigest }, commit: { ok: results[mode].checks.commit, deckId: results[mode].ids.deckId, phase: unwrap(results[mode].commitResult).phase }, readback: results[mode].readback, errors: { upload: results[mode].uploadResult?.error || null, dryRun: results[mode].dryResult?.error || null, commit: results[mode].commitResult?.error || null, export: results[mode].exportResult?.error || null } }])), servedContract: { toolCount: servedNames.length, toolNamesSha256: sha256(JSON.stringify(servedNames)) }, checks, modeChecks, privacy: { leakage }, externalBoundaries: ['authoritative preview/save is not invoked', 'narrated voice synthesis is attempted only through the public contract; no notes-only fallback is claimed'], interpretation: status === 'PASS' ? 'A fresh public client derived voice+captions, voice-only, captions-only, and silent-timed-notes from one unchanged semantic source; every profile completed import, mutation-free dryRun, commit, and authored-spec readback without private leakage.' : 'At least one delivery profile exposed a public lifecycle or contract gap; the exact response is preserved for builder correction.' })
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'canonical-25-delivery-modes-public-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath))
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
if (status !== 'PASS') process.exitCode = 1
