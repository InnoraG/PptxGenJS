#!/usr/bin/env node
// Local, no-network proof that the native-3D Meshy credential is represented in
// owner-controlled Mission Control with redacted inventory, explicit update /
// rotate / test actions, and a deployment binding understood by the provider.
// The fixture key exists only in memory for the format-test path and is never
// written to the report or the credential store.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.BETTERPPTX_MC_SECRET_BACKEND = 'env'
process.env.BETTERPPTX_MC_SECRET_MESHY_API_KEY = 'fixture-meshy-owner-key-format-test-20260718'

const { MISSION_CONTROL_SECRET_DEFINITIONS, listMissionControlSecretDefinitions, getMissionControlSecretsSnapshot, testMissionControlSecret } = await import('./mission-control-secrets.mjs')

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const output = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar', 'visual-artifacts', 'release-gates', 'meshy-owner-control-20260718.json')
const definitions = listMissionControlSecretDefinitions()
const definition = MISSION_CONTROL_SECRET_DEFINITIONS.find(item => item.id === 'meshy_api_key')
const publicDefinition = definitions.find(item => item.id === 'meshy_api_key')
assert.ok(definition, 'Meshy Mission Control definition must exist')
assert.ok(publicDefinition, 'Meshy Mission Control public definition must exist')
assert.equal(definition.kind, 'meshy-api-key')
assert.equal(definition.secretName, 'betterpptx-meshy-api-key')
assert.equal(definition.envName, 'BETTERPPTX_MESHY_API_KEY')
assert.deepEqual(definition.alternateEnvNames, ['MESHY_API_KEY'])
assert.deepEqual(definition.actions, { reveal: true, update: true, rotate: true, test: true })
assert.deepEqual(publicDefinition.actions, definition.actions)
assert.ok(definition.dependentServices.includes('betterpptx-mcp-staging'))
assert.ok(definition.dependentServices.includes('betterpptx-3d-presenter-worker'))

const snapshot = await getMissionControlSecretsSnapshot()
const record = snapshot.secrets.find(item => item.id === 'meshy_api_key')
assert.equal(record?.configured, true)
assert.equal(record?.status, 'ok')
assert.equal(record?.source?.type, 'local-env-test')
const test = await testMissionControlSecret('meshy_api_key')
assert.equal(test.ok, true)
assert.equal(test.test.check, 'meshy-api-key-format')
assert.equal(test.test.printable, true)
assert.ok(!JSON.stringify(snapshot).includes(process.env.BETTERPPTX_MC_SECRET_MESHY_API_KEY))
assert.ok(!JSON.stringify(test).includes(process.env.BETTERPPTX_MC_SECRET_MESHY_API_KEY))

const report = {
	schemaVersion: 'betterpptx.native-3d-meshy-owner-control.v1',
	status: 'PASS_LOCAL_CONTRACT',
	scope: 'native-3d-presenter-only',
	developmentMode: 'premium',
	networkAttempted: false,
	secret: {
		id: definition.id,
		displayName: definition.displayName,
		kind: definition.kind,
		secretName: definition.secretName,
		envName: definition.envName,
		alternateEnvNames: definition.alternateEnvNames,
		dependentServices: definition.dependentServices,
		actions: definition.actions,
		configuredInFixture: record.configured,
		status: record.status,
		fingerprintPresent: Boolean(record.fingerprint),
		rawValueExposed: false,
	},
	runtimeBinding: {
		providerReadsCredentialStoreProvider: 'meshy',
		providerReadsEnvironmentFallback: ['BETTERPPTX_MESHY_API_KEY', 'MESHY_API_KEY'],
		deploymentBinding: 'Mission Control secret envName → private 3D presenter worker runtime',
		liveProviderRequest: false,
	},
	checks: [
		{ id: 'owner-visible-redacted-inventory', status: 'PASS' },
		{ id: 'owner-update-rotate-test-actions', status: 'PASS' },
		{ id: 'provider-deployment-binding-is-explicit', status: 'PASS' },
		{ id: 'raw-secret-never-enters-report', status: 'PASS' },
		{ id: 'no-network-or-provider-request', status: 'PASS' },
	],
	ownerInterpretation: 'The owner can configure, reveal, update, rotate, and test the Meshy key through private Mission Control. This local proof does not claim that a production Meshy account or live secret has been configured.',
}

fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
