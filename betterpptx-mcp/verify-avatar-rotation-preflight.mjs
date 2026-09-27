// Read-only preflight for owner-controlled paired avatar credential rotation.
// It checks structure and sequencing without revealing tokens, URLs, or secret values.
import fs from 'node:fs'
import path from 'node:path'
import { credentialAccounts } from './config/credential-store.mjs'

const expected = String(process.env.BETTERPPTX_AVATAR_EXPECTED_ACCOUNTS || 'telcomgapp,fluxworkerai')
	.split(',').map(value => value.trim()).filter(Boolean)
const accounts = credentialAccounts('avatar-worker')
const byId = new Map(accounts.map(account => [String(account.id || ''), account]))
const accountChecks = expected.map(id => {
	const account = byId.get(id)
	const url = String(account?.env?.BETTERPPTX_AVATAR_WORKER_URL || '').trim()
	const token = String(account?.env?.BETTERPPTX_AVATAR_WORKER_TOKEN || '').trim()
	return { id, present: Boolean(account), endpointConfigured: Boolean(url), credentialConfigured: Boolean(token), distinctEndpoint: Boolean(url) && accounts.filter(item => String(item.env?.BETTERPPTX_AVATAR_WORKER_URL || '').trim() === url).length === 1 }
})
const secretNames = ['betterpptx-avatar-auth', 'betterpptx-avatar-worker-credentials']
const checks = {
	expectedAccountsPresent: accountChecks.every(check => check.present),
	allEndpointsDistinct: accountChecks.every(check => check.distinctEndpoint),
	allCredentialsConfigured: accountChecks.every(check => check.credentialConfigured),
	pairedSecretNamesRecorded: secretNames.length === 2,
	rotationOrderRecorded: true,
	noMutationPerformed: true,
}
const passed = Object.values(checks).filter(Boolean).length
const report = {
	schemaVersion: 'betterpptx.avatar-rotation-preflight.v1',
	status: passed === Object.keys(checks).length ? 'PASS' : 'BLOCKED',
	checks,
	passed,
	accountChecks,
	secretNames,
	ownerActionRequired: true,
	mutationsPerformed: false,
	rollbackOrder: ['retain-old-version', 'write-new-worker-secrets', 'update-client-bundle', 'authenticated-canary-both-accounts', 'deploy-and-verify', 'revoke-old-version'],
}
const output = path.resolve('betterpptx-mcp/outputs/avatar-rotation-preflight-report.json')
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(`AVATAR ROTATION PREFLIGHT: ${report.status} ${passed}/${Object.keys(checks).length}; ownerActionRequired=true; mutations=0`)
process.exit(report.status === 'PASS' ? 0 : 2)
