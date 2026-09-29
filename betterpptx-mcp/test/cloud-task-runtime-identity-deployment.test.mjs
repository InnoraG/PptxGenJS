import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const read = relative => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8')

test('task creator can act only as the selected worker identity and release checks that binding', () => {
 const provision = read('betterpptx-mcp/deploy/gcp/provision-cloud-run-free-beta.ps1')
 const workflow = read('.github/workflows/betterpptx-mcp-cloudrun-free-beta.yml')
 const wif = read('deploy/gcp/configure-github-actions-free-beta-wif.ps1')
 assert.match(provision, /service-accounts', 'add-iam-policy-binding', \$runtimeEmail.*member=serviceAccount:\$runtimeEmail.*roles\/iam.serviceAccountUser/)
 assert.doesNotMatch(provision, /projects', 'add-iam-policy-binding'.*runtimeEmail.*roles\/iam.serviceAccountUser/)
 assert.match(workflow, /service-accounts get-iam-policy "\$GCP_RUNTIME_SERVICE_ACCOUNT"/)
 assert.match(workflow, /select\(\.role == "roles\/iam.serviceAccountUser" and \(\.condition == null\)\)/)
 assert.match(wif, /\$runtimePolicyPermissions = 'iam.serviceAccounts.getIamPolicy'/)
 assert.match(wif, /service-accounts', 'add-iam-policy-binding', \$runtimeEmail.*RuntimePolicyRoleId/)
 assert.doesNotMatch(wif, /projects', 'add-iam-policy-binding'.*RuntimePolicyRoleId/)
 assert.match(provision, /--permissions=iam.serviceAccounts.signBlob/)
 assert.match(provision, /service-accounts', 'add-iam-policy-binding', \$runtimeEmail.*member=serviceAccount:\$runtimeEmail.*signerRoleId/)
 assert.match(workflow, /--arg signer "projects\/\$GCP_PROJECT_ID\/roles\/betterpptxArtifactSigner"/)
})
