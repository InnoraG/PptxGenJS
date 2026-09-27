#!/usr/bin/env node
// Static governance check: legacy direct-engine rebuild scripts are retired and
// must not silently become release-safety suites. Historical PPTX evidence is
// quarantined; no retired generator may remain executable in the tree.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const testDir = path.join(here, 'test')
const aggregatePath = path.join(here, 'verify-release-safety-suite.mjs')
const policyPath = path.join(here, 'docs', 'release-safety', 'PRIVATE-MAINTAINER-EVIDENCE-SURFACE.md')
const manifestPath = path.join(here, 'docs', 'release-safety', 'PRIVATE-DIRECT-ENGINE-SCRIPT-MANIFEST.json')
const reportPath = path.join(here, 'outputs', 'private-generation-boundary-report.json')

const checks = []
const check = (id, pass, detail) => checks.push({ id, status: pass ? 'PASS' : 'FAIL', detail })
const aggregate = fs.readFileSync(aggregatePath, 'utf8')
const policy = fs.existsSync(policyPath) ? fs.readFileSync(policyPath, 'utf8') : ''
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null
const retired = [
	'betterpptx-mcp/test/build-commercial-recordstudio-combined.mjs',
	'betterpptx-mcp/test/verify-avatar-recording-structure.mjs',
	'betterpptx-mcp/test/rebuild-current-commercial-round.mjs',
]
for (const relative of retired) {
	const file = path.join(repo, relative)
	check(`retired-absent:${relative}`, !fs.existsSync(file), 'Legacy generator is removed; historical output remains governed by the quarantine manifest.')
	check(`retired-not-aggregate:${relative}`, !aggregate.includes(relative.replaceAll('\\', '/')), 'Retired generator is not a release-safety suite.')
}

const directEngine = []
for (const name of fs.readdirSync(testDir).filter(name => name.endsWith('.mjs'))) {
	const file = path.join(testDir, name)
	const source = fs.readFileSync(file, 'utf8')
	if (/engine\.mjs/.test(source) && /callBetterPptxTool/.test(source) && /betterpptx\.deck\.(?:new|open_existing|open_uploaded)|betterpptx\.(?:slide|avatar)\./.test(source)) directEngine.push(name)
}
const activeDirectEngine = directEngine.filter(name => aggregate.includes(`test/${name}`) || aggregate.includes(`test\\${name}`))
check('direct-engine-scripts-classified', directEngine.length > 0, `${directEngine.length} private direct-engine test scripts identified.`)
check('direct-engine-scripts-not-aggregate', activeDirectEngine.length === 0, activeDirectEngine.length ? activeDirectEngine : 'No private direct-engine test script is registered in the aggregate.')
const manifestPaths = Array.isArray(manifest?.scripts) ? manifest.scripts.map(item => String(item?.path || '')).filter(Boolean).sort() : []
const discoveredPaths = directEngine.map(name => `betterpptx-mcp/test/${name}`).sort()
check('direct-engine-manifest-present', !!manifest && manifest.schemaVersion === 'betterpptx.private-direct-engine-script-manifest.v1' && manifest.productionUse === false && manifest.transport === 'internal-engine-only', 'Private direct-engine manifest is present and explicitly non-production.')
check('direct-engine-manifest-exact', JSON.stringify(manifestPaths) === JSON.stringify(discoveredPaths), JSON.stringify(manifestPaths) === JSON.stringify(discoveredPaths) ? 'Manifest exactly matches every discovered private direct-engine script.' : { manifest: manifestPaths, discovered: discoveredPaths })
check('policy-document-present', /private.*evidence/i.test(policy) && /live MCP/i.test(policy) && /production/i.test(policy) && /PRIVATE-DIRECT-ENGINE-SCRIPT-MANIFEST\.json/i.test(policy), 'Private/live/release surface policy and direct-engine manifest are documented.')
check('production-blackbox-gate-present', fs.existsSync(path.join(here, 'verify-production-deck-blackbox.mjs')), 'PPTX package vocabulary gate remains available.')
check('historical-quarantine-gate-present', fs.existsSync(path.join(here, 'verify-g1-historical-artifact-quarantine.mjs')), 'Historical artifacts remain manifest-quarantined.')

const report = {
	schemaVersion: 'betterpptx.private-generation-boundary.v1',
	status: checks.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL',
	privateDirectEngineScripts: directEngine.sort(),
	activeDirectEngineScripts: activeDirectEngine.sort(),
	directEngineManifest: path.relative(repo, manifestPath).replaceAll('\\', '/'),
	retiredScripts: retired,
	checks,
}
fs.mkdirSync(path.dirname(reportPath), { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(`PRIVATE GENERATION BOUNDARY: ${report.status} checks=${checks.filter(item => item.status === 'PASS').length}/${checks.length}`)
for (const item of checks) console.log(`${item.status} ${item.id}: ${item.detail}`)
if (report.status !== 'PASS') process.exitCode = 1
