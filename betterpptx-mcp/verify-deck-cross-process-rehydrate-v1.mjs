#!/usr/bin/env node
// Cross-process durable deck-state proof (§34.6 / §34.7 long pole).
//
// Proves the canonical-json-spec persistence + recompile-to-rehydrate path works
// across SEPARATE Node processes with NO shared memory:
//   process A: create a deck (generate_from_spec commit) -> persists canonical
//              spec blob + advances the durable head with its digest.
//   process B (cold): summary(deckId) succeeds ONLY by rehydrating from durable
//              state (the deck does not exist in B's empty in-memory map), then
//              mutates via replaceDeck -> re-persists at a new version.
//   process C (cold): summary+export_spec sees the MUTATED state -> proves the
//              mutation persisted across processes.
//
// All three are fresh child processes sharing only the on-disk local stores, so
// success is impossible unless durable spec persistence + rehydrate are real.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const enginePath = path.resolve(repoRoot, 'betterpptx-mcp', 'engine.mjs')
if (!fs.existsSync(enginePath)) {
	console.error('CROSS-PROCESS REHYDRATE: FAIL (run from D:\\PptxGenJS_Claude root; engine.mjs not found)')
	process.exit(2)
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-xproc-rehydrate-'))
const stateFile = path.join(tempDir, 'deck-state.json')
const snapshotDir = path.join(tempDir, 'specs')
const outDir = path.join(tempDir, 'out')
fs.mkdirSync(snapshotDir, { recursive: true })
fs.mkdirSync(outDir, { recursive: true })

const childEnv = {
	...process.env,
	BETTERPPTX_DURABLE_DECK_STATE_STORE: 'local',
	BETTERPPTX_DECK_STATE_FILE: stateFile,
	BETTERPPTX_DECK_SNAPSHOT_STORE: 'local',
	BETTERPPTX_DECK_SNAPSHOT_DIR: snapshotDir,
	BETTERPPTX_REQUIRE_DURABLE_DECK_STATE: '0',
	BETTERPPTX_OUT_DIR: outDir,
	BETTERPPTX_FORCE_PLAN: 'premium',
	BETTERPPTX_BILLING_ENFORCE: '0',
	BETTERPPTX_PUBLIC_BLACK_BOX: '1',
	BETTERPPTX_LOCAL_MAINTAINER: '0',
	BETTERPPTX_ALLOW_PRIMITIVE_TOOLS: '1',
	BETTERPPTX_PUBLIC_SESSION_ID: 'cross-process-rehydrate-fixture',
	BETTERPPTX_ASSET_GRANT_STORE: 'local',
	BETTERPPTX_ASSET_GRANT_DIR: path.join(tempDir, 'asset-grants'),
	BETTERPPTX_LOCKED_ASSET_STORE: 'local',
	BETTERPPTX_LOCKED_ASSET_ROOT: path.join(tempDir, 'locked-assets'),
	BETTERPPTX_LOCKED_ASSET_SHARED_DIR: path.join(tempDir, 'shared-locked-assets'),
}

const workerPath = path.join(tempDir, 'xproc-worker.mjs')
const serverPath = path.resolve(repoRoot, 'betterpptx-mcp', 'server.mjs')
const serverPathJson = JSON.stringify(serverPath)
const mcpClientUrl = JSON.stringify(import.meta.resolve('@modelcontextprotocol/client'))
const mcpStdioUrl = JSON.stringify(import.meta.resolve('@modelcontextprotocol/client/stdio'))
fs.writeFileSync(workerPath, `
import { Client } from ${mcpClientUrl}
import { StdioClientTransport } from ${mcpStdioUrl}
const step = process.argv[2]
const deckId = process.argv[3] || ''
const out = o => process.stdout.write('RESULT ' + JSON.stringify(o) + '\\n')
const transport = new StdioClientTransport({ command: process.execPath, args: [${serverPathJson}], cwd: ${JSON.stringify(repoRoot)}, stderr: 'pipe', env: process.env })
const client = new Client({ name: 'cross-process-semantic-client', version: '1' }, { capabilities: {} })
let serverStderr = ''
transport.stderr?.on('data', chunk => { serverStderr += chunk.toString() })
const call = async (name, args) => {
	const response = await client.callTool({ name, arguments: args })
	const envelope = response?.structuredContent || JSON.parse(response?.content?.find(item => item.type === 'text')?.text || '{}')
	if (!envelope?.ok) throw new Error(JSON.stringify(envelope?.error || envelope))
	return envelope.data || envelope
}
const wav = Buffer.alloc(44 + 16000)
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8)
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34)
wav.write('data', 36); wav.writeUInt32LE(16000, 40)
const audioData = 'data:audio/wav;base64,' + wav.toString('base64')
const titleSpec = (title, outcome = 'prove semantic persistence') => ({
	schemaVersion: 'betterpptx.deck-spec.v1',
	title,
	layout: 'LAYOUT_WIDE',
	authoringContract: { workflow: 'authoring-excellence-director-v1', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches' },
	domainContract: {
		contentStory: { audience: 'cross-process audience', outcome, remember: 'authorial intent survives a cold restart' },
		visualDesign: { world: 'aurora', mode: 'dark', framing: 'balanced proof frame' },
		motionTime: { masterClock: 'narration-text', timingSource: 'measured-media', syncPolicy: 'one shared clock', kineticSelection: 'restrained' },
	},
	slides: Array.from({ length: 15 }, (_, index) => ({ id: 's' + String(index + 1).padStart(2, '0'), title: 'Slide ' + (index + 1), layoutIntent: 'title-body', narration: { segments: [{ script: 'One spoken beat.', audio: { data: audioData, durationMs: 1000, extn: 'wav' } }] }, content: [
		{ kind: 'title', name: 'title-' + index, text: title, rect: { x: 0.8, y: 0.8, w: 9.5, h: 0.8 } },
		...([7, 8].includes(index) ? [{ kind: 'shape', name: 'surface', shapeName: 'rect', rect: { x: 1, y: 2, w: 4, h: 2 }, style: { fill: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 25, gradientStops: [{ position: 0, color: 'E1ECE3' }, { position: 100, color: 'CFE4DD' }] }, line: { color: '101F29', width: 0 }, shadow: { type: 'outer', color: '000000', opacity: 0.16, blur: 8, distance: 3, angle: 70 } } }] : []),
	] })),
})
const shadowAudit = async deckId => {
	const audit = await call('betterpptx.deck.validate_native_visuals', { deckId })
	const shape = audit.packageAudit?.objectEvidence?.find(item => item.objectName?.startsWith('surface.') || item.objectName?.includes('.surface.'))
	return { ok: audit.packageAudit?.ok === true, effects: shape?.effects || [], failures: audit.packageAudit?.selectedEffectFailures || [], relevantCarriers: audit.packageAudit?.objectEvidence?.filter(item => item.slideIndex === 7 || item.slideIndex === 8).map(item => ({ name: item.objectName, effects: item.effects })) }
}
let stage = 'connect'
try {
	await client.connect(transport)
	if (step === 'create') {
		stage = 'create'
		const r = await call('betterpptx.deck.generate_from_spec', { spec: titleSpec('XPROC Source A'), phase: 'commit', detail: 'summary' })
		const before = await shadowAudit(r.deckId)
		await call('betterpptx.deck.export_spec', { deckId: r.deckId, mode: 'current', download: false })
		out({ ok: true, deckId: r.deckId, deckVersion: r.deckVersion ?? r.version ?? null, slideCount: r.slideCount ?? null, semanticDigest: r.semanticRoundtrip?.semanticDigest || null, shadowBeforeExport: before })
	} else if (step === 'rehydrate-mutate') {
		stage = 'rehydrate-summary'
		const s = await call('betterpptx.deck.summary', { deckId })
		const v = s.deckVersion ?? s.version
		stage = 'rehydrate-export'
		const before = await call('betterpptx.deck.export_spec', { deckId, detail: 'summary' })
		const shadowAfterRestart = await shadowAudit(deckId)
		stage = 'replace-compile'
		const m = await call('betterpptx.deck.generate_from_spec', { deckId, deckVersion: v, commitMode: 'replaceDeck', spec: titleSpec('XPROC Mutated B', 'prove semantic mutation'), phase: 'commit', detail: 'summary' })
		out({ ok: true, rehydratedVersion: v, rehydratedSlides: s.slideCount ?? null, rehydratedSemanticDigest: before.spec?.semanticRoundtrip?.semanticDigest || null, rehydratedAudience: before.spec?.domainContract?.contentStory?.audience || null, mutatedVersion: m.deckVersion ?? m.version ?? null, mutatedSemanticDigest: m.semanticRoundtrip?.semanticDigest || null, shadowAfterRestart })
	} else if (step === 'verify') {
		stage = 'verify-summary'
		const s = await call('betterpptx.deck.summary', { deckId })
		stage = 'verify-export'
		const e = await call('betterpptx.deck.export_spec', { deckId, detail: 'summary' })
		const shadowAfterMutationRestart = await shadowAudit(deckId)
		out({ ok: true, deckVersion: s.deckVersion ?? s.version ?? null, slideCount: s.slideCount ?? null, title: e.spec?.title ?? null, semanticDigest: e.spec?.semanticRoundtrip?.semanticDigest || null, audience: e.spec?.domainContract?.contentStory?.audience || null, outcome: e.spec?.domainContract?.contentStory?.outcome || null, shadowAfterMutationRestart })
	} else {
		throw new Error('unknown step ' + step)
	}
} catch (err) {
	out({ ok: false, error: (typeof stage !== 'undefined' ? stage + ': ' : '') + String(err?.message || err), serverStderr: serverStderr.slice(-3000) })
	process.exit(1)
} finally {
	await client.close().catch(() => {})
	await transport.close().catch(() => {})
}
`, 'utf8')

function runStep(step, deckId = '') {
	return new Promise(resolve => {
		const child = spawn(process.execPath, [workerPath, step, deckId], { cwd: repoRoot, env: { ...childEnv, BETTERPPTX_FORCE_PLAN: step === 'create' ? 'premium' : 'free' } })
		let stdout = ''
		let stderr = ''
		child.stdout.on('data', d => { stdout += d })
		child.stderr.on('data', d => { stderr += d })
		child.on('close', code => {
			let result = null
			const line = stdout.split(/\r?\n/).find(l => l.startsWith('RESULT '))
			if (line) { try { result = JSON.parse(line.slice('RESULT '.length)) } catch {} }
			resolve({ step, code, pid: child.pid, result, stderrTail: stderr.slice(-600) })
		})
	})
}

function fail(message, detail) {
	console.error('CROSS-PROCESS REHYDRATE: FAIL')
	console.error(message)
	if (detail) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

const create = await runStep('create')
if (!create.result?.ok || !create.result.deckId) fail('process A (create) failed', create)
if (!create.result.shadowBeforeExport?.ok || !create.result.shadowBeforeExport.effects.includes('outerShdw')) fail('process A did not serialize the authored shadow before export', create)
const deckId = create.result.deckId

const rm = await runStep('rehydrate-mutate', deckId)
if (!rm.result?.ok) fail('process B (cold rehydrate + mutate) failed — durable rehydrate did not work', rm)
if (!rm.result.shadowAfterRestart?.ok || !rm.result.shadowAfterRestart.effects.includes('outerShdw')) fail('read-only source export replaced or corrupted the durable shadow source across restart', rm)
if (rm.pid === create.pid) fail('process B reused process A — not a real cross-process test', { create, rm })
if (rm.result.rehydratedVersion !== create.result.deckVersion) fail('cold process B saw a different deck version than A persisted', { create, rm })
if (create.result.slideCount != null && rm.result.rehydratedSlides !== create.result.slideCount) fail('cold rehydrate produced a different slide count', { create, rm })
if (!create.result.semanticDigest || rm.result.rehydratedSemanticDigest !== create.result.semanticDigest || rm.result.rehydratedAudience !== 'cross-process audience') fail('cold process B did not preserve the semantic round-trip contract', { create, rm })
if (!(Number(rm.result.mutatedVersion) > Number(rm.result.rehydratedVersion))) fail('mutation did not advance the deck version', { rm })
if (rm.result.mutatedSemanticDigest === create.result.semanticDigest) fail('a normal semantic edit reused the prior semantic digest', { create, rm })

const verify = await runStep('verify', deckId)
if (!verify.result?.ok) fail('process C (cold verify) failed', verify)
if (!verify.result.shadowAfterMutationRestart?.ok || !verify.result.shadowAfterMutationRestart.effects.includes('outerShdw')) fail('mutated shadow did not survive second cold restart', verify)
if (verify.pid === rm.pid || verify.pid === create.pid) fail('process C reused an earlier process', { create, rm, verify })
if (verify.result.deckVersion !== rm.result.mutatedVersion) fail('cold process C did not see the persisted mutated version', { rm, verify })
if (verify.result.title !== 'XPROC Mutated B') fail('cold process C did not see the persisted mutation content', { verify })
if (!rm.result.mutatedSemanticDigest || verify.result.semanticDigest !== rm.result.mutatedSemanticDigest || verify.result.audience !== 'cross-process audience' || verify.result.outcome !== 'prove semantic mutation') fail('cold process C did not preserve the mutated semantic contract', { rm, verify })

try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}

console.log(`CROSS-PROCESS REHYDRATE: PASS create(pid=${create.pid},v=${create.result.deckVersion}) -> coldRehydrate(pid=${rm.pid},v=${rm.result.rehydratedVersion}) -> coldMutate(v=${rm.result.mutatedVersion}) -> coldVerify(pid=${verify.pid},v=${verify.result.deckVersion},title="${verify.result.title}")`)
