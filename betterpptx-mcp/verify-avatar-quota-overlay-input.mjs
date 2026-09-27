#!/usr/bin/env node
// Static, no-network contract check for the owner-budget Cloud Run overlay.
// It never invokes gcloud or mutates deployment state.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const sourcePath = 'betterpptx-mcp/deploy/deploy-avatar-cloud-run-overlay.py'
const source = await fs.readFile(sourcePath, 'utf8')
const checks = [
	['owner budget flag is explicit', source.includes('"--daily-gpu-seconds"')],
	['budget defaults to omitted fail-closed state', source.includes('default=None')],
	['non-positive budgets reject', source.includes('args.daily_gpu_seconds <= 0')],
	['budget below reviewed estimate rejects', source.includes('args.daily_gpu_seconds < 120')],
	['explicit unbounded-metered mode is supported', source.includes('"--unbounded-metered"') && source.includes('avatar_env["BETTERPPTX_AVATAR_WORKER_DAILY_GPU_SECONDS"] = "unlimited"')],
	['finite and unbounded modes are mutually exclusive', source.includes('choose exactly one of --unbounded-metered or --daily-gpu-seconds')],
	['budget env is conditional', source.includes('if args.daily_gpu_seconds is not None:') && source.includes('BETTERPPTX_AVATAR_WORKER_DAILY_GPU_SECONDS')],
	['deployment output reports budget presence', source.includes('quotaBudgetConfigured')],
	['quota provider remains Firestore', source.includes('BETTERPPTX_AVATAR_QUOTA_STATE_STORE') && source.includes('"firestore"')],
]
assert.equal(checks.filter(([, pass]) => !pass).length, 0, checks.filter(([, pass]) => !pass).map(([id]) => id).join(', '))
const report = {
	schemaVersion: 'betterpptx.avatar-quota-overlay-input.v1',
	status: 'PASS',
	scope: 'local-contract / no-network / no-deployment',
	checks: Object.fromEntries(checks.map(([id, pass]) => [id, pass])),
	ownerQuotaModeRequiredToOpen: true,
	approvedNoCapMode: 'unbounded-metered',
	failClosedWhenOmitted: true,
	providerCalls: 0,
}
await fs.writeFile('betterpptx-mcp/outputs/avatar-quota-overlay-input-report.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
