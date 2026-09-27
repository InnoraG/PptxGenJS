#!/usr/bin/env node
// Local contract for the private provider metrology ledger. The production
// backend is Firestore; this test proves idempotency, conflict rejection,
// cross-process listing, and expiry without customer media or secrets.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-avatar-metrology-'))
const file = path.join(temp, 'events.json')
process.env.BETTERPPTX_AVATAR_PROVIDER_METROLOGY_STORE = 'local'
process.env.BETTERPPTX_AVATAR_PROVIDER_METROLOGY_STORE_FILE = file
process.env.BETTERPPTX_AVATAR_PROVIDER_METROLOGY_TTL_MS = '3600000'
const { avatarProviderMetrologyReadiness, createAvatarProviderMetrologyStore, recordAvatarProviderMetrology, listAvatarProviderMetrology, purgeAvatarProviderMetrology } = await import('./storage/avatar-provider-metrology-store.mjs?verify=1')
const event = {
	accountId: 'telcomgapp',
	providerExecutionIds: ['fc-01METROLOGYVERIFY'],
	capturedAt: '2026-07-19T00:10:00.000Z',
	pipeline: 'liveportrait-musetalk',
	gpuType: 'A10G',
	gpuSeconds: 12.5,
	renderSeconds: 8.2,
	idempotencyState: 'completed',
	outputDigest: 'a'.repeat(64),
	idempotencyKey: 'private-test-key',
}
const first = await recordAvatarProviderMetrology(event)
const replay = await recordAvatarProviderMetrology(event)
assert.equal(first.idempotent, false)
assert.equal(replay.idempotent, true)
let conflictRejected = false
try { await recordAvatarProviderMetrology({ ...event, gpuSeconds: 13.5 }) } catch (error) { conflictRejected = error?.code === 'AVATAR_METROLOGY_EVENT_CONFLICT' }
assert.equal(conflictRejected, true)
const child = spawnSync(process.execPath, ['--input-type=module', '-e', `const m=await import(${JSON.stringify(pathToFileURL(path.resolve('betterpptx-mcp/storage/avatar-provider-metrology-store.mjs')).href)}); const rows=await m.listAvatarProviderMetrology({start:'2026-07-19T00:00:00.000Z',end:'2026-07-19T01:00:00.000Z',accountId:'telcomgapp'}); console.log(JSON.stringify(rows));`], { cwd: process.cwd(), env: { ...process.env }, encoding: 'utf8', windowsHide: true })
assert.equal(child.status, 0)
assert.equal(JSON.parse(child.stdout).length, 1)
const rows = await listAvatarProviderMetrology({ start: '2026-07-19T00:00:00.000Z', end: '2026-07-19T01:00:00.000Z', accountId: 'telcomgapp' })
assert.equal(rows.length, 1)
const purged = await purgeAvatarProviderMetrology(new Date('2026-07-20T00:00:00.000Z'))
assert.equal(purged.removed, 1)
const afterPurge = await createAvatarProviderMetrologyStore().list({ start: '2026-07-19T00:00:00.000Z', end: '2026-07-19T01:00:00.000Z' })
assert.equal(afterPurge.length, 0)
const report = {
	schemaVersion: 'betterpptx.avatar-provider-metrology-store.v1',
	status: 'PASS',
	provider: avatarProviderMetrologyReadiness(),
	checks: {
		firstWrite: first.idempotent === false,
		idempotentReplay: replay.idempotent === true,
		conflictRejected,
		crossProcessRead: JSON.parse(child.stdout).length === 1,
		intervalFilter: rows.length === 1,
		expiryPurge: purged.removed === 1 && afterPurge.length === 0,
		rawSecretsPrinted: false,
		customerData: false,
	},
}
await fs.mkdir(path.resolve('betterpptx-mcp', 'outputs'), { recursive: true })
await fs.writeFile(path.resolve('betterpptx-mcp', 'outputs', 'avatar-provider-metrology-store-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
await fs.rm(temp, { recursive: true, force: true })
