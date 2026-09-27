#!/usr/bin/env node
// Static deployment-contract gate. It proves that the reviewed image/template
// declare media tooling and rotating credential-bundle wiring; it does not claim
// that a deployed revision has been observed until a live MCP canary is run.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dockerfile = await fs.readFile(path.join(here, 'deploy', 'Dockerfile'), 'utf8')
const cloudRun = await fs.readFile(path.join(here, 'deploy', 'cloud-run-mcp-piper.yaml'), 'utf8')
const checks = []
const ok = (name, condition) => checks.push({ name, status: condition ? 'PASS' : 'FAIL' })

ok('serving image installs ffmpeg', /apt-get install[^\n]*ffmpeg/i.test(dockerfile))
ok('serving image declares ffmpeg path', /BETTERPPTX_FFMPEG_PATH=\/usr\/bin\/ffmpeg/.test(dockerfile))
ok('serving image declares ffprobe path', /BETTERPPTX_FFPROBE_PATH=\/usr\/bin\/ffprobe/.test(dockerfile))
ok('Cloud Run template pins the commercial-only talking-head provider', /BETTERPPTX_AVATAR_PROVIDER[\s\S]{0,80}value:\s*liveportrait-musetalk-commercial/.test(cloudRun))
ok('Cloud Run template fail-closes alternate talking-head lanes', /BETTERPPTX_AVATAR_PRODUCTION_ONLY[\s\S]{0,50}value:\s*["']?1/.test(cloudRun))
ok('Cloud Run template pins the owner-reviewed presenter profile', /BETTERPPTX_AVATAR_PRODUCTION_MOTION_PROFILE[\s\S]{0,50}value:\s*blink/.test(cloudRun) && /BETTERPPTX_AVATAR_PRODUCTION_MOUTH_PROFILE[\s\S]{0,50}value:\s*jaw/.test(cloudRun))
ok('Cloud Run template mounts a dedicated credential bundle', /BETTERPPTX_CREDENTIAL_STORE[\s\S]{0,120}avatar-worker-credentials\.json/.test(cloudRun) && /secretName:\s*betterpptx-avatar-worker-credentials/.test(cloudRun))
ok('Cloud Run template declares durable avatar job metadata', /BETTERPPTX_AVATAR_JOB_STORE[\s\S]{0,60}value:\s*firestore/.test(cloudRun) && /BETTERPPTX_FIRESTORE_AVATAR_JOB_COLLECTION/.test(cloudRun))
ok('Cloud Run template declares distributed worker health state', /BETTERPPTX_AVATAR_WORKER_STATE_STORE[\s\S]{0,60}value:\s*firestore/.test(cloudRun) && /BETTERPPTX_FIRESTORE_AVATAR_WORKER_STATE_COLLECTION/.test(cloudRun))
ok('Cloud Run template declares distributed avatar quota state', /BETTERPPTX_AVATAR_QUOTA_STATE_STORE[\s\S]{0,60}value:\s*firestore/.test(cloudRun) && /BETTERPPTX_FIRESTORE_AVATAR_WORKER_QUOTA_COLLECTION[\s\S]{0,80}betterpptx_avatar_worker_quota/.test(cloudRun) && /BETTERPPTX_REQUIRE_AVATAR_QUOTA[\s\S]{0,50}value:\s*["']?1/.test(cloudRun) && /BETTERPPTX_AVATAR_WORKER_ESTIMATED_GPU_SECONDS/.test(cloudRun))
ok('Cloud Run template requires durable provider metrology', /BETTERPPTX_AVATAR_PROVIDER_METROLOGY_STORE[\s\S]{0,60}value:\s*firestore/.test(cloudRun) && /BETTERPPTX_FIRESTORE_AVATAR_PROVIDER_METROLOGY_COLLECTION/.test(cloudRun) && /BETTERPPTX_REQUIRE_PROVIDER_METROLOGY[\s\S]{0,40}value:\s*["']?1/.test(cloudRun))
ok('Cloud Run template enforces production Meshy → Mixamo native 3D', /BETTERPPTX_NATIVE3D_MODE[\s\S]{0,40}value:\s*production/.test(cloudRun))
ok('Cloud Run template requires explicit native-3D owner clearance', /BETTERPPTX_NATIVE3D_OWNER_CLEARANCE[\s\S]{0,40}value:\s*required/.test(cloudRun))
ok('Cloud Run template declares tenant-scoped GCS avatar artifacts', /BETTERPPTX_GEN_ASSET_STORE[\s\S]{0,40}value:\s*gcs/.test(cloudRun) && /BETTERPPTX_GEN_ASSET_BUCKET/.test(cloudRun) && /BETTERPPTX_GEN_ASSET_GCS_PREFIX/.test(cloudRun))
ok('Cloud Run template selects accountless pay-per-job and shared job stores',
    /BETTERPPTX_BILLING_PROVIDER[\s\S]{0,50}value:\s*crypto_credits/.test(cloudRun)
    && /BETTERPPTX_BILLING_MODEL[\s\S]{0,50}value:\s*pay_per_job/.test(cloudRun)
    && /BETTERPPTX_BILLING_ENFORCE[\s\S]{0,50}value:\s*["']?1/.test(cloudRun)
    && /BETTERPPTX_REQUIRE_SHARED_STORES[\s\S]{0,40}value:\s*["']?1/.test(cloudRun)
    && /BETTERPPTX_X402_STORE[\s\S]{0,40}value:\s*firestore/.test(cloudRun)
    && /BETTERPPTX_X402_RELAYER_LEASE_STORE[\s\S]{0,60}value:\s*firestore/.test(cloudRun)
    && !/BETTERPPTX_BILLING_LEDGER_STORE[\s\S]{0,40}value:\s*firestore/.test(cloudRun)
    && !/BETTERPPTX_CRYPTO_ORDER_STORE[\s\S]{0,40}value:\s*firestore/.test(cloudRun)
    && /BETTERPPTX_ARTIFACT_STORE[\s\S]{0,40}value:\s*gcs/.test(cloudRun))
ok('Cloud Run template declares ffmpeg and ffprobe paths', /BETTERPPTX_FFMPEG_PATH[\s\S]{0,80}\/usr\/bin\/ffmpeg/.test(cloudRun) && /BETTERPPTX_FFPROBE_PATH[\s\S]{0,80}\/usr\/bin\/ffprobe/.test(cloudRun))
ok('Cloud Run timeout is at least 900 seconds', /timeoutSeconds:\s*([0-9]+)/.test(cloudRun) && Number(cloudRun.match(/timeoutSeconds:\s*([0-9]+)/)?.[1]) >= 900)
ok('Cloud Run template does not bind a single raw avatar token', !/BETTERPPTX_AVATAR_WORKER_TOKEN|BETTERPPTX_AVATAR_WORKER_URL/.test(cloudRun))

const failures = checks.filter(check => check.status === 'FAIL')
const report = {
	schemaVersion: 'betterpptx.avatar-serving-image-contract.v1',
	status: failures.length ? 'template-fail' : 'template-pass-deployed-revision-unverified',
	deployedRevisionVerified: false,
	checks,
	productionCanaryRequired: true,
}
await fs.mkdir(path.join(here, 'outputs'), { recursive: true })
await fs.writeFile(path.join(here, 'outputs', 'avatar-serving-image-contract-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
assert.equal(failures.length, 0)
