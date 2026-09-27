#!/usr/bin/env node
// Pure configuration proof for the quota production gate. No network, provider,
// credentials, Firestore, or customer data are touched.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
const { avatarWorkerQuotaProductionConfig } = await import('./storage/avatar-worker-quota-state.mjs')
const checks = {}
const check = (name, value) => { checks[name] = Boolean(value); assert.ok(value, name) }
const local = avatarWorkerQuotaProductionConfig({ provider: 'local', limitGpuSeconds: 600, required: true, estimatedGpuSeconds: 120 })
check('required production rejects local quota store', local.ok === false && local.errors.includes('AVATAR_QUOTA_DISTRIBUTED_STORE_REQUIRED'))
const missingBudget = avatarWorkerQuotaProductionConfig({ provider: 'firestore', limitGpuSeconds: 0, required: true, estimatedGpuSeconds: 120 })
check('required production rejects missing owner budget', missingBudget.ok === false && missingBudget.errors.includes('AVATAR_QUOTA_OWNER_BUDGET_REQUIRED'))
const undersized = avatarWorkerQuotaProductionConfig({ provider: 'firestore', limitGpuSeconds: 60, required: true, estimatedGpuSeconds: 120 })
check('required production rejects estimate above budget', undersized.ok === false && undersized.errors.includes('AVATAR_QUOTA_ESTIMATE_EXCEEDS_BUDGET'))
const valid = avatarWorkerQuotaProductionConfig({ provider: 'firestore', limitGpuSeconds: 600, required: true, estimatedGpuSeconds: 120 })
check('valid owner production configuration opens', valid.ok === true && valid.errors.length === 0)
const unbounded = avatarWorkerQuotaProductionConfig({ provider: 'firestore', limitGpuSeconds: 0, quotaMode: 'unbounded-metered', required: true, estimatedGpuSeconds: 120 })
check('explicit unbounded metered production configuration opens', unbounded.ok === true && unbounded.mode === 'production-unbounded-metered' && unbounded.errors.length === 0)
const report = { schemaVersion: 'betterpptx.avatar-worker-quota-production-config.v1', status: 'PASS', scope: 'local-contract / no-network / no-provider-call', checks, summary: { passed: Object.values(checks).filter(Boolean).length, total: Object.keys(checks).length }, rawSecretsPrinted: false, customerData: false }
await fs.writeFile(path.resolve('betterpptx-mcp/outputs/avatar-worker-quota-production-config-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
