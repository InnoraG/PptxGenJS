// Redacted local readiness check for the approved two-account direct pairwise lane.
// No network call and no secret/URL value is emitted.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const store = JSON.parse(fs.readFileSync(path.join(here, 'config', 'credential-store.json'), 'utf8'))
const accounts = Array.isArray(store.providers?.['semantic-judge-worker']?.accounts)
  ? store.providers['semantic-judge-worker'].accounts.filter(item => item && item.enabled !== false)
  : []
const rows = accounts.map(item => ({
	id: String(item.id || ''),
	primaryConfigured: Boolean(item.env?.BETTERPPTX_SEMANTIC_JUDGE_URL && item.env?.BETTERPPTX_SEMANTIC_JUDGE_TOKEN),
	pairConfigured: Boolean(item.env?.BETTERPPTX_SEMANTIC_JUDGE_PAIR_URL && item.env?.BETTERPPTX_SEMANTIC_JUDGE_TOKEN),
}))
const report = {
	schemaVersion: 'betterpptx.semantic-judge-pair-endpoint-readiness.v1',
	status: rows.length >= 2 && rows.every(row => row.primaryConfigured && row.pairConfigured) ? 'ready' : 'blocked-registration',
	accountCount: rows.length,
	accounts: rows,
	allPrimaryConfigured: rows.length > 0 && rows.every(row => row.primaryConfigured),
	allPairConfigured: rows.length > 0 && rows.every(row => row.pairConfigured),
	network: false,
	secretsRedacted: true,
	customerImages: false,
	externalAi: false,
	note: 'Pair-specific endpoint registration is required before the direct side-by-side judge benchmark can produce calibration evidence.',
}
const outputPath = path.join(here, 'outputs', 'semantic-judge-pair-endpoint-readiness-report.json')
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n')
for (const row of rows) console.log(`  ${row.primaryConfigured ? 'ok  ' : 'OPEN'} ${row.id || '<unnamed>'} primary credential; ${row.pairConfigured ? 'ok  ' : 'OPEN'} pair endpoint`)
console.log(`\n${report.status === 'ready' ? 'READY' : 'BLOCKED'}: ${outputPath}`)
process.exit(report.status === 'ready' ? 0 : 1)
