#!/usr/bin/env node
// No-network integration proof: quota reservations gate the avatar worker before
// fetch, replay does not consume a second budget, and settlement records actual GPU seconds.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-avatar-quota-integration-'))
process.env.BETTERPPTX_AVATAR_QUOTA_STATE_STORE = 'local'
process.env.BETTERPPTX_AVATAR_QUOTA_STATE_FILE = path.join(temp, 'quota.json')
process.env.BETTERPPTX_AVATAR_WORKER_DAILY_GPU_SECONDS = '100'
process.env.BETTERPPTX_AVATAR_WORKER_ESTIMATED_GPU_SECONDS = '60'
process.env.BETTERPPTX_AVATAR_ROTATION_MODE = 'deterministic'
process.env.BETTERPPTX_REQUIRE_PROVIDER_METROLOGY = ''
const { renderMuseTalkHttp } = await import('./avatar/providers/musetalkHttp.mjs')
const { credentialAccounts } = await import('./config/credential-store.mjs')
const { avatarWorkerStartIndex } = await import('./avatar/providers/musetalkHttp.mjs')

await fs.writeFile(path.join(temp, 'face.png'), Buffer.from('face-fixture'))
await fs.writeFile(path.join(temp, 'voice.wav'), Buffer.from('voice-fixture'))
const responses = [
	{ gpu: '40', state: 'completed', pipeline: 'liveportrait-musetalk', ids: 'fc-QUOTA-1' },
	{ gpu: '0', state: 'completed', pipeline: 'replay', ids: '' },
	{ gpu: '60', state: 'completed', pipeline: 'liveportrait-musetalk', ids: 'fc-QUOTA-2' },
	{ gpu: '40', state: 'completed', pipeline: 'liveportrait-musetalk', ids: 'fc-QUOTA-3' },
	{ gpu: '60', state: 'completed', pipeline: 'liveportrait-musetalk', ids: 'fc-QUOTA-4' },
]
let fetchCount = 0
globalThis.fetch = async () => {
	const item = responses[fetchCount++] || responses.at(-1)
	return new Response(Buffer.from('mp4-fixture'), { status: 200, headers: {
		'content-type': 'video/mp4',
		'x-gpu-seconds': item.gpu,
		'x-render-seconds': item.gpu,
		'x-idempotency-state': item.state,
		'x-pipeline': item.pipeline,
		'x-gpu-type': 'A10G',
		'x-provider-execution-ids': item.ids,
	} })
}

const render = key => renderMuseTalkHttp({ avatarImagePath: path.join(temp, 'face.png'), audioPath: path.join(temp, 'voice.wav'), durationMs: 1000, jobDir: temp, idempotencyKey: key })
const configuredIds = credentialAccounts('avatar-worker').map(account => ({ id: String(account.id || '') })).filter(account => account.id)
const keyForIndex = (prefix, targetIndex) => { for (let i = 0; i < 10000; i++) { const key = `${prefix}-${i}`; if (avatarWorkerStartIndex(configuredIds, key) === targetIndex) return key } throw new Error('could not find deterministic account key') }
const firstKey = keyForIndex('quota-job-1', 0)
const secondKey = keyForIndex('quota-job-2', 0)
const otherFirstKey = keyForIndex('quota-job-other-1', 1)
const otherSecondKey = keyForIndex('quota-job-other-2', 1)
const first = await render(firstKey)
assert.equal(first.ok, true)
const replay = await render(firstKey)
assert.equal(replay.ok, true)
const second = await render(secondKey)
assert.equal(second.ok, true)
const otherFirst = await render(otherFirstKey)
assert.equal(otherFirst.ok, true)
const otherSecond = await render(otherSecondKey)
assert.equal(otherSecond.ok, true)
await assert.rejects(() => render(keyForIndex('quota-job-3', 0)), error => error?.code === 'AVATAR_QUOTA_EXCEEDED')
await assert.rejects(() => render(keyForIndex('quota-job-4', 1)), error => error?.code === 'AVATAR_QUOTA_EXCEEDED')
assert.equal(fetchCount, 5, 'quota rejection must happen before provider fetch')

const raw = JSON.parse(await fs.readFile(process.env.BETTERPPTX_AVATAR_QUOTA_STATE_FILE, 'utf8'))
const records = Object.values(raw.accounts || {})
assert.equal(records.length, configuredIds.length)
assert.ok(records.every(record => record.settledGpuSeconds === 100 && record.reservedGpuSeconds === 0))
assert.equal(JSON.stringify(raw).includes('quota-job-1'), false)
const report = {
	schemaVersion: 'betterpptx.avatar-worker-quota-integration.v1',
	status: 'PASS',
	scope: 'local-contract / mocked fetch / no-provider-call',
	checks: { firstComputeSettled: true, replayNoSecondBudget: true, secondComputeSettled: true, quotaRejectsBeforeFetch: true, hashedStateOnly: true },
	summary: { passed: 5, total: 5 },
	fetchCalls: fetchCount,
	rawSecretsPrinted: false,
	customerData: false,
}
await fs.writeFile(path.resolve('betterpptx-mcp/outputs/avatar-worker-quota-integration-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
await fs.rm(temp, { recursive: true, force: true })
