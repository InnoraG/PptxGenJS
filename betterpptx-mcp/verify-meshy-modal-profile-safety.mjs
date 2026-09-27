// Native 3D only: preserve the offline two-profile Modal routing/failover proof
// used by the rigged-3D worker. This is not a live deployment or rollback proof.
import fs from 'node:fs'
import path from 'node:path'
import { writeJsonReport } from './lib/atomic-report.mjs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const demo = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar')
const output = path.join(demo, 'visual-artifacts', 'release-gates', 'meshy-modal-profile-safety-20260718.json')
const targetProfiles = ['betterxavatar1', 'betterxavatar2']
const result = spawnSync(process.execPath, [path.join(here, 'verify-rigged3d-gen.mjs')], {
	cwd: repo,
	encoding: 'utf8',
	timeout: 120000,
	env: { ...process.env, RIGGED3D_LIVE: '0', BETTERPPTX_PREMIUM: '1', BETTERPPTX_MODEL3D_TEST_PROFILES: targetProfiles.join(',') },
})
const outputText = `${String(result.stdout || '')}\n${String(result.stderr || '')}`
const offlinePassCount = Number(outputText.match(/PASSED:\s*(\d+) passed,\s*0 failed/)?.[1] || 0)
const checks = {
	offlineVerifierPassed: result.status === 0 && offlinePassCount >= 60,
	twoProfileRoundRobin: outputText.includes('rotation: round-robin spreads across BOTH profile endpoints'),
	profileTokenIsolation: outputText.includes('rotation: each endpoint gets its OWN token'),
	healthyEndpointFailover: outputText.includes('rotation: endpoint failure fails over to a healthy endpoint'),
	boundedPollAndTimeout: outputText.includes('generate_rigged3d effective timeout EXCEEDS provider poll deadline'),
}
const report = {
	schemaVersion: 'betterpptx.meshy-modal-profile-safety.v1',
	status: Object.values(checks).every(Boolean) ? 'PASS_LOCAL_CONTRACT' : 'BLOCKED',
	scope: 'native-3d-presenter-only',
	developmentMode: 'premium',
	profiles: targetProfiles,
	checks,
	offlinePassCount,
	liveDeploymentAttempted: false,
	rollbackProof: 'OWNER_DEPLOYMENT_REQUIRED',
	ownerNextAction: 'Deploy one immutable private worker revision under each requested profile, record revision/image digests, run one bounded canary, then prove rollback to the prior digest.',
}
writeJsonReport(output, report)
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'PASS_LOCAL_CONTRACT') process.exitCode = 1
