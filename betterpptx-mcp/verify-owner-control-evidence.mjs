// Persist a machine-readable owner-control evidence result from the two
// existing Mission Control verifiers. No production billing is enabled.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const run = file => spawnSync(process.execPath, [path.join(here, file)], { encoding: 'utf8', timeout: 180000, env: process.env })
const secret = run('verify-mission-control-secrets.mjs')
const routes = run('verify-mission-control-secret-routes.mjs')
const result = {
  schemaVersion: 'betterpptx.owner-control-evidence.v1',
  status: secret.status === 0 && routes.status === 0 ? 'research-owner-control-pass' : 'research-owner-control-fail',
  productionBilling: 'deferred',
  rawSecretsExposed: false,
  externalAi: false,
  customerImages: false,
  verifiers: [
    { id: 'mission-control-secrets', status: secret.status === 0 ? 'PASS' : 'FAIL', marker: String(secret.stdout || '').includes('MC2 SECRET VERIFY: PASS') },
    { id: 'mission-control-secret-routes', status: routes.status === 0 ? 'PASS' : 'FAIL', marker: String(routes.stdout || '').includes('MC2 SECRET ROUTES VERIFY: PASS') },
  ],
  note: 'Owner-only redacted secret controls are proven; this does not activate live billing or waive owner/legal production approval.',
}
const outputPath = path.join(here, 'outputs', 'owner-control-evidence-report.json')
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result))
process.exit(result.status.endsWith('pass') ? 0 : 1)
