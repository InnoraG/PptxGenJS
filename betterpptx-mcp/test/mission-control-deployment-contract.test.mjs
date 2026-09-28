import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')

test('deployment keeps Mission Control private, scale-to-zero, and isolated from the MCP runtime', () => {
	const workflow = read('.github/workflows/betterpptx-mcp-cloudrun-free-beta.yml')
	const provision = read('betterpptx-mcp/deploy/gcp/provision-cloud-run-free-beta.ps1')
	const server = read('betterpptx-mcp/server-http.mjs')

	assert.match(workflow, /CLOUD_RUN_MISSION_CONTROL: betterpptx-mission-control/)
	assert.match(workflow, /GCP_MISSION_CONTROL_SERVICE_ACCOUNT: betterpptx-mission-control-runtime@/)
	assert.match(workflow, /--min=0 --max=1 --timeout=300s --no-allow-unauthenticated --set-env-vars="\$mission_control_env"/)
	assert.match(workflow, /gcloud projects get-iam-policy "\$GCP_PROJECT_ID"/)
	assert.match(workflow, /roles\/secretmanager\./)
	assert.match(workflow, /BETTERPPTX_MISSION_CONTROL_ONLY=1/)
	assert.match(workflow, /BETTERPPTX_MISSION_CONTROL_TRUST_CLOUD_RUN_IAM=1/)
	assert.match(workflow, /user:\$GCP_MISSION_CONTROL_OWNER_EMAIL/)
	assert.match(workflow, /unique == \[\$owner\]/)
	assert.match(workflow, /select\(\. == "allUsers" or \. == "allAuthenticatedUsers"\).*length == 0/)
	assert.match(workflow, /gcloud secrets versions access latest --secret=betterpptx-cloudflare-worker-deploy-token/)
	assert.doesNotMatch(workflow, /secrets\.CLOUDFLARE_API_TOKEN/)

	assert.match(provision, /betterpptx-mission-control-runtime/)
	assert.match(provision, /DeployerServiceAccount = 'github-free-beta-deployer'/)
	assert.match(provision, /roles\/secretmanager\.viewer/)
	assert.match(provision, /roles\/secretmanager\.secretAccessor/)
	assert.match(provision, /roles\/secretmanager\.secretVersionAdder/)
	assert.match(provision, /remove-iam-policy-binding.*\$runtimeEmail/)
	assert.doesNotMatch(provision, /add-iam-policy-binding.*\$cloudflareDeploySecret.*\$runtimeEmail/)

	assert.match(server, /if \(envFlag\('BETTERPPTX_MISSION_CONTROL_ONLY'\)\)/)
	assert.match(server, /missionControlOnlyPathAllowed\(req\.path, req\.method\)/)
})
