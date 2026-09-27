// Verify secret-free account health/cooldown state used by rotating avatar workers.
// Local backend only; Firestore remains the production distributed gate.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-avatar-state-'))
process.env.BETTERPPTX_AVATAR_WORKER_STATE_STORE = 'local'
process.env.BETTERPPTX_AVATAR_WORKER_STATE_FILE = path.join(dir, 'state.json')
process.env.BETTERPPTX_AVATAR_WORKER_COOLDOWN_MS = '60000'
const { createAvatarWorkerStateStore, avatarWorkerStateReadiness } = await import('./storage/avatar-worker-state-store.mjs')
const store = createAvatarWorkerStateStore()
const initial = await store.get('worker-a')
await store.recordFailure('worker-a', 'quota')
const cooled = await store.get('worker-a')
const listed = await store.list(['worker-a', 'worker-b'])
await store.recordSuccess('worker-a')
const recovered = await store.get('worker-a')
const raw = fs.readFileSync(process.env.BETTERPPTX_AVATAR_WORKER_STATE_FILE, 'utf8')
const checks = {
	initialHealthy: initial.status === 'healthy',
	quotaCooldown: cooled.status === 'cooldown' && cooled.lastErrorClass === 'quota' && cooled.cooldownUntil,
	allAccountsListed: listed.length === 2,
	successClearsCooldown: recovered.status === 'healthy' && recovered.cooldownUntil === null,
	secretFreeState: !raw.includes('token') && !raw.includes('modal.run') && !raw.includes('worker-a'),
}
const passed = Object.values(checks).filter(Boolean).length
const report = { schemaVersion: 'betterpptx.avatar-worker-state.v1', status: passed === Object.keys(checks).length ? 'PASS' : 'FAIL', checks, passed, distributedProductionBackend: avatarWorkerStateReadiness().distributed }
const out = path.resolve('betterpptx-mcp/outputs/avatar-worker-state-report.json')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n')
console.log(`AVATAR WORKER STATE: ${report.status} ${passed}/${Object.keys(checks).length} local checks; distributed=${report.distributedProductionBackend}`)
process.exit(report.status === 'PASS' ? 0 : 1)
