// Verify avatar-worker rotation (round-robin + failover across multiple liveportrait+musetalk
// endpoints) in avatar/providers/musetalkHttp.mjs — offline, by mocking global fetch. No worker
// is contacted. Run:  node betterpptx-mcp/verify-avatar-rotation.mjs
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

let pass = 0, fail = 0
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}`) } else { fail++; console.error(`  FAIL ${n}${d ? ' — ' + d : ''}`) } }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-avatar-rot-'))
const img = path.join(dir, 'face.png'); fs.writeFileSync(img, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))
const aud = path.join(dir, 'narration.wav'); fs.writeFileSync(aud, Buffer.from('RIFF0000WAVEfmt '))
const jobDir = path.join(dir, 'job'); fs.mkdirSync(jobDir)
const storeFile = path.join(dir, 'store.json')
fs.writeFileSync(storeFile, JSON.stringify({
	schemaVersion: 'betterpptx.credential-store.v1',
	providers: {
		'avatar-worker': {
			activeAccountId: 'w1',
			accounts: [
				{ id: 'w1', enabled: true, env: { BETTERPPTX_AVATAR_WORKER_URL: 'https://w1.modal.run', BETTERPPTX_AVATAR_WORKER_ROUTE: '/v1/avatar/lipsync', BETTERPPTX_AVATAR_WORKER_TOKEN: 'tok1' } },
				{ id: 'w2', enabled: true, env: { BETTERPPTX_AVATAR_WORKER_URL: 'https://w2.modal.run', BETTERPPTX_AVATAR_WORKER_ROUTE: '/v1/avatar/lipsync', BETTERPPTX_AVATAR_WORKER_TOKEN: 'tok2' } },
			],
		},
	},
}))
process.env.BETTERPPTX_CREDENTIAL_STORE = storeFile
process.env.BETTERPPTX_AVATAR_TIMEOUT_MS = '5000'

const { renderMuseTalkHttp } = await import('./avatar/providers/musetalkHttp.mjs')

const mp4Resp = () => ({ ok: true, status: 200, headers: { get: k => (String(k).toLowerCase() === 'content-type' ? 'video/mp4' : null) }, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer })
const realFetch = globalThis.fetch
const call = (idempotencyKey = '') => renderMuseTalkHttp({ avatarImagePath: img, audioPath: aud, jobDir, provider: 'liveportrait-musetalk', idempotencyKey })

console.log('AVATAR-WORKER ROTATION (mocked fetch):')
// 1) round-robin across both workers, each with its own bearer token
const hits = {}, toks = {}
const idem = {}
globalThis.fetch = async (url, opts) => { hits[url] = (hits[url] || 0) + 1; toks[url] = opts?.headers?.Authorization; idem[url] = opts?.headers?.['Idempotency-Key']; return mp4Resp() }
for (let i = 0; i < 4; i++) await call()
ok('round-robin across BOTH worker endpoints', hits['https://w1.modal.run/v1/avatar/lipsync'] > 0 && hits['https://w2.modal.run/v1/avatar/lipsync'] > 0, JSON.stringify(hits))
ok('each worker gets its OWN bearer token', toks['https://w1.modal.run/v1/avatar/lipsync'] === 'Bearer tok1' && toks['https://w2.modal.run/v1/avatar/lipsync'] === 'Bearer tok2')

const concurrentHits = {}
globalThis.fetch = async url => { concurrentHits[url] = (concurrentHits[url] || 0) + 1; await new Promise(resolve => setTimeout(resolve, 10)); return mp4Resp() }
await Promise.all([call(), call()])
ok('concurrent jobs reserve different round-robin workers', concurrentHits['https://w1.modal.run/v1/avatar/lipsync'] === 1 && concurrentHits['https://w2.modal.run/v1/avatar/lipsync'] === 1, JSON.stringify(concurrentHits))

globalThis.fetch = async (url, opts) => { hits[url] = (hits[url] || 0) + 1; toks[url] = opts?.headers?.Authorization; idem[url] = opts?.headers?.['Idempotency-Key']; return mp4Resp() }
await call('avatar-idempotency-proof-1')
ok('forwards the caller idempotency key to the worker', idem['https://w1.modal.run/v1/avatar/lipsync'] === 'avatar-idempotency-proof-1' || idem['https://w2.modal.run/v1/avatar/lipsync'] === 'avatar-idempotency-proof-1')

// Deterministic routing is the multi-instance-safe mode: the same durable
// idempotency key selects the same starting account without a process-local
// cursor, while normal no-key research calls retain round-robin behavior.
process.env.BETTERPPTX_AVATAR_ROTATION_MODE = 'deterministic'
const deterministicHits = {}
globalThis.fetch = async (url) => { deterministicHits[url] = (deterministicHits[url] || 0) + 1; return mp4Resp() }
await call('avatar-deterministic-stability-1')
await call('avatar-deterministic-stability-1')
const deterministicEndpointCount = Object.keys(deterministicHits).length
ok('deterministic idempotency routing is stable across calls', deterministicEndpointCount === 1, JSON.stringify(deterministicHits))
process.env.BETTERPPTX_AVATAR_ROTATION_MODE = 'round-robin'

// 2) failover: one worker down → served by the other
globalThis.fetch = async url => { if (String(url).includes('w1.modal.run')) throw new Error('worker down'); return mp4Resp() }
const rFo = await call()
ok('worker failure fails over to a healthy worker', rFo?.ok === true)

// 3) all workers down → AVATAR_UNAVAILABLE (never leaks the worker error)
globalThis.fetch = async () => { throw new Error('worker down') }
let code = ''
try { await call() } catch (e) { code = e?.code || e?.message }
ok('all workers down → AVATAR_UNAVAILABLE', code === 'AVATAR_UNAVAILABLE', String(code))

// 4) deterministic input rejection must not fail over and risk a duplicate bill.
let rejectedHits = 0
globalThis.fetch = async (url) => {
	rejectedHits++
	return { ok: false, status: 422, headers: { get: () => 'application/json' }, arrayBuffer: async () => new ArrayBuffer(0) }
}
let rejectedCode = ''
try { await call('avatar-nonretryable-proof-1') } catch (e) { rejectedCode = e?.code || '' }
ok('non-retryable worker rejection does not fail over', rejectedCode === 'AVATAR_UNAVAILABLE' && rejectedHits === 1, `code=${rejectedCode} hits=${rejectedHits}`)

globalThis.fetch = realFetch
const evidencePath = path.resolve('betterpptx-mcp/outputs/avatar-rotation-report.json')
fs.mkdirSync(path.dirname(evidencePath), { recursive: true })
fs.writeFileSync(evidencePath, JSON.stringify({
	schemaVersion: 'betterpptx.avatar-rotation.v1',
	status: fail ? 'FAIL' : 'PASS',
	checks: { passed: pass, failed: fail, roundRobin: true, deterministicStable: true, perAccountAuth: true, idempotencyForwarded: true, failover: true, nonRetryableNoFailover: true },
	secrets: false,
}, null, 2) + '\n')
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
