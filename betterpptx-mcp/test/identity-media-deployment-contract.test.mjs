import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const workflow = fs.readFileSync(path.join(root, '.github/workflows/betterpptx-mcp-cloudrun-free-beta.yml'), 'utf8')
const deployLine = service => workflow.split(/\r?\n/).find(line => line.includes(`gcloud run deploy "$${service}"`)) || ''

test('the queued worker gets the same identity-media secrets and env as the gateway', () => {
	for (const service of ['CLOUD_RUN_WORKER', 'CLOUD_RUN_GATEWAY']) {
		assert.match(deployLine(service), /--set-secrets="[^"]*\$\{IDENTITY_MEDIA_SECRETS\}/, service)
	}
	assert.equal((workflow.match(/\$\{NARRATION_ENV\}\$\{IDENTITY_MEDIA_ENV\}"/g) || []).length, 2)
	assert.match(workflow, /identity_secrets="BETTERPPTX_MESHY_API_KEY=\$\{MESHY_SECRET_NAME\}:latest"/)
	assert.match(workflow, /identity_env=",BETTERPPTX_NATIVE3D_MODE=production,BETTERPPTX_NATIVE3D_OWNER_CLEARANCE=approved,/)
	assert.match(workflow, /BETTERPPTX_COMMERCIAL_AVATAR_WORKER_POOL=\$\{AVATAR_CREDENTIALS_SECRET_NAME\}:latest/)
})

test('talking heads ship only with the monthly Modal budget gate and its billing sync', () => {
	assert.match(workflow, /BETTERPPTX_AVATAR_BUDGET_STORE=firestore,[^"]*BETTERPPTX_REQUIRE_AVATAR_BUDGET=1,BETTERPPTX_AVATAR_WORKER_MONTHLY_CAP_USD=29\.50/)
	assert.match(workflow, /BETTERPPTX_REQUIRE_AVATAR_QUOTA=1/)
	assert.match(workflow, /gcloud run jobs deploy "\$CLOUD_RUN_AVATAR_BUDGET_SYNC"/)
	assert.match(workflow, /--set-secrets="BETTERPPTX_MODAL_BILLING_TOKENS=\$\{MODAL_BILLING_TOKENS_SECRET_NAME\}:latest"/)
	assert.match(workflow, /--schedule="5 \* \* \* \*"/)
	assert.ok(fs.existsSync(path.join(root, 'betterpptx-mcp/deploy/avatar-budget-sync/sync_modal_budget.py')))
})

test('Mission Control keeps talking heads disabled and receives no identity-media secrets', () => {
	assert.match(workflow, /mission_control_env="[^"]*BETTERPPTX_AVATAR_PROVIDER=disabled"/)
	assert.doesNotMatch(deployLine('CLOUD_RUN_MISSION_CONTROL'), /IDENTITY_MEDIA|MESHY|AVATAR_WORKER_POOL/)
})
