#!/usr/bin/env node
// Read-only drift check between the reviewed quota template and the active
// deployed-revision report. It never deploys, mutates, or reads secrets.
import fs from 'node:fs/promises'
import path from 'node:path'
const root = path.resolve('betterpptx-mcp/outputs')
const report = JSON.parse(await fs.readFile(path.join(root, 'avatar-deployed-revision-report.json'), 'utf8'))
const template = JSON.parse(await fs.readFile(path.join(root, 'avatar-serving-image-contract-report.json'), 'utf8'))
const requiredNames = ['BETTERPPTX_AVATAR_QUOTA_STATE_STORE', 'BETTERPPTX_FIRESTORE_AVATAR_WORKER_QUOTA_COLLECTION', 'BETTERPPTX_REQUIRE_AVATAR_QUOTA', 'BETTERPPTX_AVATAR_WORKER_ESTIMATED_GPU_SECONDS', 'BETTERPPTX_AVATAR_WORKER_DAILY_GPU_SECONDS']
const configById = new Map((report.configChecks || []).map(check => [check.id, check]))
const quotaTemplatePass = template.status.startsWith('template-pass') && template.checks.some(check => check.name.includes('distributed avatar quota state') && check.status === 'PASS')
const checks = requiredNames.map(id => ({
	id,
	templatePass: quotaTemplatePass,
	deployedPresent: configById.get(id)?.present === true,
	deployedMatches: configById.get(id)?.matches === true,
	value: id === 'BETTERPPTX_AVATAR_WORKER_DAILY_GPU_SECONDS' || id === 'BETTERPPTX_AVATAR_WORKER_ESTIMATED_GPU_SECONDS'
		? configById.get(id)?.value ?? null
		: undefined,
}))
const estimatedGpuSeconds = configById.get('BETTERPPTX_AVATAR_WORKER_ESTIMATED_GPU_SECONDS')?.value ?? null
const dailyGpuSeconds = configById.get('BETTERPPTX_AVATAR_WORKER_DAILY_GPU_SECONDS')?.value ?? null
const quotaMode = dailyGpuSeconds === 'unlimited' ? 'unbounded-metered' : (dailyGpuSeconds ? 'finite' : null)
const deployedQuotaReady = checks.every(check => check.deployedPresent && check.deployedMatches)
  && Number(estimatedGpuSeconds) === 120
  && (quotaMode === 'unbounded-metered' || (quotaMode === 'finite' && Number(dailyGpuSeconds) >= 120))
const result = {
	schemaVersion: 'betterpptx.avatar-worker-quota-deployed-revision.v1',
	status: deployedQuotaReady ? 'PASS' : 'OPEN_OWNER_MODE_AND_REDEPLOY_REQUIRED',
	failClosed: !deployedQuotaReady,
	templateContract: template.status.startsWith('template-pass') ? 'PASS' : 'OPEN',
	activeRevisionQuotaConfig: deployedQuotaReady ? 'PRESENT' : 'MISSING_OR_UNVERIFIED',
	activeRevision: report.activeRevision || null,
	quotaMode,
	estimatedGpuSecondsPerRequest: Number.isFinite(Number(estimatedGpuSeconds)) ? Number(estimatedGpuSeconds) : null,
	checks,
	ownerAction: deployedQuotaReady ? `Deployed quota mode verified as ${quotaMode} with ${estimatedGpuSeconds} estimated GPU-seconds/request; run the approved canary.` : 'Redeploy the reviewed template with --unbounded-metered (no hard cap, fully metered) or --daily-gpu-seconds N, then rerun the deployed-revision audit.',
	rawSecretsPrinted: false,
	customerData: false,
}
await fs.writeFile(path.join(root, 'avatar-worker-quota-deployed-revision-report.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
if (!deployedQuotaReady) process.exitCode = 1
