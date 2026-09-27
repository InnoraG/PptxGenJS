#!/usr/bin/env node
// Cross-process shared locked-asset proof (§29.6 wiring).
//
// Proves a content-addressed locked asset (here: locked media bytes from a
// black-box deck) created in process A is mirrored to the SHARED locked-asset
// store at persist time, and prefetched into a DIFFERENT, EMPTY per-instance
// LOCKED_ASSET_ROOT by process B at rehydrate time — i.e. the asset crosses
// A -> shared store -> B without a shared local cache and without shared memory.
//
// Key assertion: process B's LOCKED_ASSET_ROOT is empty before rehydrate and
// non-empty after, and the bytes came from the shared store (A never wrote there).

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const enginePath = path.resolve(repoRoot, 'betterpptx-mcp', 'engine.mjs')
if (!fs.existsSync(enginePath)) {
	console.error('CROSS-PROCESS LOCKED-ASSET: FAIL (run from D:\\PptxGenJS_Claude root)')
	process.exit(2)
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-xproc-asset-'))
const stateFile = path.join(tempDir, 'deck-state.json')
const snapshotDir = path.join(tempDir, 'specs')
const sharedAssetDir = path.join(tempDir, 'shared-assets')
const rootA = path.join(tempDir, 'locked-root-A')
const rootB = path.join(tempDir, 'locked-root-B')
for (const d of [snapshotDir, sharedAssetDir, rootA, rootB, path.join(tempDir, 'out')]) fs.mkdirSync(d, { recursive: true })

function baseEnv(lockedRoot) {
	return {
		...process.env,
		BETTERPPTX_PUBLIC_BLACK_BOX: '1',
		BETTERPPTX_DURABLE_DECK_STATE_STORE: 'local',
		BETTERPPTX_DECK_STATE_FILE: stateFile,
		BETTERPPTX_DECK_SNAPSHOT_STORE: 'local',
		BETTERPPTX_DECK_SNAPSHOT_DIR: snapshotDir,
		BETTERPPTX_LOCKED_ASSET_STORE: 'local',
		BETTERPPTX_LOCKED_ASSET_SHARED_DIR: sharedAssetDir,
		BETTERPPTX_LOCKED_ASSET_ROOT: lockedRoot,
		BETTERPPTX_REQUIRE_DURABLE_DECK_STATE: '0',
		BETTERPPTX_OUT_DIR: path.join(tempDir, 'out'),
		BETTERPPTX_FORCE_PLAN: 'premium',
		BETTERPPTX_BILLING_ENFORCE: '0',
		BETTERPPTX_LOCAL_MAINTAINER: '0',
	}
}

const workerPath = path.join(tempDir, 'asset-worker.mjs')
const serverPath = path.resolve(repoRoot, 'betterpptx-mcp', 'server.mjs')
const serverPathJson = JSON.stringify(serverPath)
const mcpClientUrl = JSON.stringify(import.meta.resolve('@modelcontextprotocol/client'))
const mcpStdioUrl = JSON.stringify(import.meta.resolve('@modelcontextprotocol/client/stdio'))
fs.writeFileSync(workerPath, `
import fs from 'node:fs'
import { Client } from ${mcpClientUrl}
import { StdioClientTransport } from ${mcpStdioUrl}
const step = process.argv[2]
const deckId = process.argv[3] || ''
const lockedRoot = process.env.BETTERPPTX_LOCKED_ASSET_ROOT
const out = o => process.stdout.write('RESULT ' + JSON.stringify(o) + '\\n')
const transport = new StdioClientTransport({ command: process.execPath, args: [${serverPathJson}], cwd: ${JSON.stringify(repoRoot)}, stderr: 'pipe', env: process.env })
const client = new Client({ name: 'cross-process-locked-asset-client', version: '1' }, { capabilities: {} })
let serverStderr = ''
transport.stderr?.on('data', chunk => { serverStderr += chunk.toString() })
const call = async (name, args) => {
  const response = await client.callTool({ name, arguments: args })
  const envelope = response?.structuredContent || JSON.parse(response?.content?.find(item => item.type === 'text')?.text || '{}')
  if (!envelope?.ok) throw new Error(JSON.stringify(envelope?.error || envelope))
  return envelope.data || envelope
}
function countFiles(dir) {
	let n = 0
	const stack = [dir]
	while (stack.length) {
		const d = stack.pop()
		let entries = []
		try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { continue }
		for (const e of entries) {
			const p = d + '/' + e.name
			if (e.isDirectory()) stack.push(p)
			else n++
		}
	}
	return n
}
function wavSilence(ms = 400, rate = 8000) {
	const samples = Math.max(1, Math.round(rate * ms / 1000)), dataBytes = samples * 2
	const b = Buffer.alloc(44 + dataBytes)
	b.write('RIFF', 0); b.writeUInt32LE(36 + dataBytes, 4); b.write('WAVE', 8); b.write('fmt ', 12)
	b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24)
	b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(dataBytes, 40)
	return b
}
const mediaSpec = () => ({
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'XProc Locked Asset', layout: 'LAYOUT_WIDE',
	authoringContract: { workflow: 'authoring-excellence-director-v1' },
	domainContract: {
		contentStory: { audience: 'cross-process audience', outcome: 'prove locked media survives a cold restart', remember: 'the asset remains available across processes' },
		visualDesign: { world: 'aurora', mode: 'dark', framing: 'balanced proof frame' },
		motionTime: { masterClock: 'narration-text', timingSource: 'measured-media', syncPolicy: 'one shared clock', kineticSelection: 'restrained' },
	},
	slides: [{ id: 's1', title: 'One', message: 'A locked media asset survives a cold process restart.', layoutIntent: 'title-body', content: [
		{ kind: 'title', name: 'title', text: 'Deck with a locked media asset' },
		{ kind: 'media', name: 'clip', mediaType: 'audio', data: 'data:audio/wav;base64,' + wavSilence().toString('base64'), extn: 'wav', mediaOptions: { type: 'audio' } },
	] }],
})
let serverConnected = false
try {
	await client.connect(transport)
	serverConnected = true
	if (step === 'create') {
		const r = await call('betterpptx.deck.generate_from_spec', { spec: mediaSpec(), phase: 'commit', detail: 'summary', validateAfterCompile: true })
		out({ ok: true, deckId: r.deckId, deckVersion: r.deckVersion ?? r.version ?? null, rootFiles: countFiles(lockedRoot), sharedFiles: countFiles(process.env.BETTERPPTX_LOCKED_ASSET_SHARED_DIR) })
	} else if (step === 'rehydrate') {
		const before = countFiles(lockedRoot)
		const s = await call('betterpptx.deck.summary', { deckId })
		const after = countFiles(lockedRoot)
		out({ ok: true, deckVersion: s.deckVersion ?? s.version ?? null, slideCount: s.slideCount ?? null, rootFilesBefore: before, rootFilesAfter: after })
	} else { throw new Error('unknown step ' + step) }
} catch (err) { out({ ok: false, error: String(err?.message || err), serverStderr: serverStderr.slice(-3000) }); process.exit(1) }
finally { if (serverConnected) await client.close().catch(() => {}); await transport.close().catch(() => {}) }
`, 'utf8')

function runStep(step, lockedRoot, deckId = '') {
	return new Promise(resolve => {
		const child = spawn(process.execPath, [workerPath, step, deckId], { cwd: repoRoot, env: baseEnv(lockedRoot) })
		let stdout = '', stderr = ''
		child.stdout.on('data', d => { stdout += d })
		child.stderr.on('data', d => { stderr += d })
		child.on('close', code => {
			let result = null
			const line = stdout.split(/\r?\n/).find(l => l.startsWith('RESULT '))
			if (line) { try { result = JSON.parse(line.slice('RESULT '.length)) } catch {} }
			resolve({ step, code, pid: child.pid, result, stderrTail: stderr.slice(-700) })
		})
	})
}

function countFiles(dir) {
	let n = 0
	const stack = [dir]
	while (stack.length) {
		const d = stack.pop()
		let entries = []
		try { entries = fs.readdirSync(d, { withFileTypes: true }) } catch { continue }
		for (const e of entries) {
			const p = path.join(d, e.name)
			if (e.isDirectory()) stack.push(p)
			else n++
		}
	}
	return n
}

function fail(message, detail) {
	console.error('CROSS-PROCESS LOCKED-ASSET: FAIL')
	console.error(message)
	if (detail) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

const create = await runStep('create', rootA)
if (!create.result?.ok || !create.result.deckId) fail('process A (create with media) failed', create)
const deckId = create.result.deckId
if (!(create.result.sharedFiles >= 1)) fail('process A did not mirror any locked asset to the shared store', create)
if (!(countFiles(rootB) === 0)) fail('process B locked-asset root was not empty before rehydrate', { rootB })

const rehydrate = await runStep('rehydrate', rootB, deckId)
if (!rehydrate.result?.ok) fail('process B (cold rehydrate) failed', rehydrate)
if (rehydrate.pid === create.pid) fail('process B reused process A — not cross-process', { create, rehydrate })
if (rehydrate.result.deckVersion !== create.result.deckVersion) fail('cold process saw a different deck version', { create, rehydrate })
if (rehydrate.result.rootFilesBefore !== 0) fail('process B root was not empty at start (shared local cache leak?)', rehydrate)
if (!(rehydrate.result.rootFilesAfter >= 1)) fail('rehydrate did not prefetch the locked asset into process B root from the shared store', rehydrate)
if (countFiles(sharedAssetDir) < 1) fail('shared asset store unexpectedly empty', { sharedAssetDir })

try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}

console.log(`CROSS-PROCESS LOCKED-ASSET: PASS create(pid=${create.pid},rootA=${create.result.rootFiles},shared=${create.result.sharedFiles}) -> coldRehydrate(pid=${rehydrate.pid},rootB:${rehydrate.result.rootFilesBefore}->${rehydrate.result.rootFilesAfter}) [asset crossed A->shared->B]`)
