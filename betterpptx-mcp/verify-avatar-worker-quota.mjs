#!/usr/bin/env node
// Local no-network proof for the opt-in avatar worker quota ledger.
// It never contacts Firestore/provider accounts and writes no customer data.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-avatar-quota-'))
process.env.BETTERPPTX_AVATAR_QUOTA_STATE_STORE = 'local'
process.env.BETTERPPTX_AVATAR_QUOTA_STATE_FILE = path.join(temp, 'quota.json')
process.env.BETTERPPTX_AVATAR_WORKER_DAILY_GPU_SECONDS = '100'
const { createAvatarWorkerQuotaStore, avatarWorkerQuotaReadiness } = await import('./storage/avatar-worker-quota-state.mjs')
const store = createAvatarWorkerQuotaStore()
const checks = {}
const check = (name, value) => { checks[name] = Boolean(value); assert.ok(value, name) }

const readiness = avatarWorkerQuotaReadiness()
check('local quota provider is configured but not distributed', readiness.configured === true && readiness.distributed === false && readiness.limitGpuSeconds === 100)
const first = await store.reserve('telcomgapp', 'request-1', 60)
check('first reservation succeeds', first.ok === true && first.availableGpuSeconds === 40)
const replay = await store.reserve('telcomgapp', 'request-1', 60)
check('same reservation is idempotent', replay.ok === true && replay.reservedGpuSeconds === 60)
const over = await store.reserve('telcomgapp', 'request-2', 50)
check('reservation over limit fails closed', over.ok === false && over.code === 'AVATAR_WORKER_QUOTA_EXCEEDED')
const settled = await store.settle('telcomgapp', 'request-1', 40)
check('settlement releases estimate and records actual spend', settled.ok === true && settled.reservedGpuSeconds === 0 && settled.settledGpuSeconds === 40 && settled.availableGpuSeconds === 60)
const second = await store.reserve('telcomgapp', 'request-2', 60)
check('released budget can be reserved again', second.ok === true && second.availableGpuSeconds === 0)
const final = await store.settle('telcomgapp', 'request-2', 60)
check('second settlement exhausts daily budget', final.ok === true && final.settledGpuSeconds === 100 && final.availableGpuSeconds === 0)
const other = await store.get('fluxworkerai')
check('accounts are isolated', other.settledGpuSeconds === 0 && other.availableGpuSeconds === 100)
const raw = JSON.parse(await fs.readFile(process.env.BETTERPPTX_AVATAR_QUOTA_STATE_FILE, 'utf8'))
check('state stores hashes and no raw account ids', !JSON.stringify(raw).includes('telcomgapp') && !JSON.stringify(raw).includes('fluxworkerai') && Object.keys(raw.accounts || {}).length === 1)

const report = {
	 schemaVersion: 'betterpptx.avatar-worker-quota.v1',
	 status: 'PASS',
	 scope: 'local-contract / no-network / no-provider-call',
	 checks,
	 summary: { passed: Object.values(checks).filter(Boolean).length, total: Object.keys(checks).length },
	 distributedProductionBackend: readiness.distributed,
	 rawSecretsPrinted: false,
	 customerData: false,
}
await fs.writeFile(path.resolve('betterpptx-mcp/outputs/avatar-worker-quota-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
await fs.rm(temp, { recursive: true, force: true })
