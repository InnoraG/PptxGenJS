#!/usr/bin/env node
// Read-only deployment evidence check for the PowerPoint-native narration lane.
// It intentionally reports only redacted revision/configuration facts. It does
// not print URLs, secret values, filesystem paths, or provider internals.
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const service = process.env.BETTERPPTX_AVATAR_CLOUD_RUN_SERVICE || 'betterpptx-mcp-staging'
const region = process.env.BETTERPPTX_AVATAR_CLOUD_RUN_REGION || 'us-central1'
const project = process.env.BETTERPPTX_AVATAR_CLOUD_RUN_PROJECT || ''
const args = ['--quiet', 'run', 'services', 'describe', service, '--region', region, '--format=json']
if (project) args.push('--project', project)

const gcloudCommand = 'gcloud'
// The values are deployment identifiers, not arbitrary command text. Keep the
// verifier fail-closed if a caller supplies anything outside the identifier
// grammar before using the Windows command shim.
if (![service, region, project].every(value => !value || /^[A-Za-z0-9._-]+$/.test(value))) {
	throw new Error('invalid Cloud Run identifier')
}
const spawnArgs = process.platform === 'win32'
	? ['/d', '/s', '/c', [gcloudCommand, ...args].join(' ')]
	: args
const result = process.platform === 'win32'
	? spawnSync('cmd.exe', spawnArgs, { encoding: 'utf8', windowsHide: true, timeout: 120000 })
	: spawnSync(gcloudCommand, spawnArgs, { encoding: 'utf8', windowsHide: true, timeout: 120000 })
const output = String(result.stdout || '').trim()
const stderr = String(result.stderr || '').trim()
let serviceDoc = null
try { serviceDoc = JSON.parse(output) } catch {}

function readRevision(revisionName) {
	if (!revisionName || !/^[A-Za-z0-9._-]+$/.test(revisionName)) return null
	const revisionArgs = ['--quiet', 'run', 'revisions', 'describe', revisionName, '--region', region, '--format=json']
	if (project) revisionArgs.push('--project', project)
	const revisionSpawnArgs = process.platform === 'win32'
		? ['/d', '/s', '/c', [gcloudCommand, ...revisionArgs].join(' ')]
		: revisionArgs
	const revisionResult = process.platform === 'win32'
		? spawnSync('cmd.exe', revisionSpawnArgs, { encoding: 'utf8', windowsHide: true, timeout: 120000 })
		: spawnSync(gcloudCommand, revisionSpawnArgs, { encoding: 'utf8', windowsHide: true, timeout: 120000 })
	try { return JSON.parse(String(revisionResult.stdout || '').trim()) } catch { return null }
}

const envEntries = serviceDoc?.spec?.template?.spec?.containers?.flatMap(container => container.env || []) || []
const envMap = new Map(envEntries.map(entry => [entry.name, entry]))
const volumes = serviceDoc?.spec?.template?.spec?.volumes || []
const volumeNames = new Set(volumes.map(volume => volume.name))
const credentialVolume = volumes.find(volume => volume.name === 'avatar-worker-credentials')
const traffic = Array.isArray(serviceDoc?.status?.traffic) ? serviceDoc.status.traffic : []
const activeTraffic = traffic.find(entry => Number(entry.percent) === 100)
const revisionDoc = readRevision(activeTraffic?.revisionName)

const required = [
	// The owner-frozen commercial line is the only production talking-head
	// route. Alternate/local workers remain development fixtures only.
	['BETTERPPTX_AVATAR_PROVIDER', 'liveportrait-musetalk-commercial'],
	['BETTERPPTX_AVATAR_PRODUCTION_ONLY', '1'],
	['BETTERPPTX_AVATAR_PRODUCTION_MOTION_PROFILE', 'blink'],
	['BETTERPPTX_AVATAR_PRODUCTION_MOUTH_PROFILE', 'jaw'],
	['BETTERPPTX_FFMPEG_PATH', '/usr/bin/ffmpeg'],
	['BETTERPPTX_FFPROBE_PATH', '/usr/bin/ffprobe'],
	['BETTERPPTX_CREDENTIAL_STORE', null],
	['BETTERPPTX_AVATAR_JOB_STORE', 'firestore'],
	['BETTERPPTX_FIRESTORE_AVATAR_JOB_COLLECTION', 'betterpptx_avatar_jobs'],
	['BETTERPPTX_AVATAR_WORKER_STATE_STORE', 'firestore'],
	['BETTERPPTX_FIRESTORE_AVATAR_WORKER_STATE_COLLECTION', 'betterpptx_avatar_worker_state'],
	['BETTERPPTX_AVATAR_QUOTA_STATE_STORE', 'firestore'],
	['BETTERPPTX_FIRESTORE_AVATAR_WORKER_QUOTA_COLLECTION', 'betterpptx_avatar_worker_quota'],
	['BETTERPPTX_REQUIRE_AVATAR_QUOTA', '1'],
	['BETTERPPTX_AVATAR_WORKER_ESTIMATED_GPU_SECONDS', '120'],
	['BETTERPPTX_AVATAR_WORKER_DAILY_GPU_SECONDS', new Set(['unlimited'])],
	['BETTERPPTX_AVATAR_PROVIDER_METROLOGY_STORE', 'firestore'],
	['BETTERPPTX_FIRESTORE_AVATAR_PROVIDER_METROLOGY_COLLECTION', 'betterpptx_avatar_provider_metrology'],
	['BETTERPPTX_REQUIRE_PROVIDER_METROLOGY', '1'],
	['BETTERPPTX_GEN_ASSET_STORE', 'gcs'],
	['BETTERPPTX_GEN_ASSET_BUCKET', null],
	['BETTERPPTX_GEN_ASSET_GCS_PREFIX', 'betterpptx-avatar-artifacts'],
	['BETTERPPTX_NATIVE3D_MODE', 'production'],
	['BETTERPPTX_NATIVE3D_OWNER_CLEARANCE', 'required'],
]
const configChecks = required.map(([name, expected]) => {
	const entry = envMap.get(name)
	const present = Boolean(entry)
	const secretBacked = Boolean(entry?.valueFrom?.secretKeyRef)
	const value = entry?.value
	const matches = expected === null
		? present
		: expected instanceof Set
			? expected.has(value)
			: value === expected
	const safeObserved = new Set([
		'BETTERPPTX_AVATAR_WORKER_ESTIMATED_GPU_SECONDS',
		'BETTERPPTX_AVATAR_WORKER_DAILY_GPU_SECONDS',
	])
	return {
		id: name,
		present,
		matches,
		secretBacked,
		...(safeObserved.has(name) ? { value: value ?? null } : {}),
	}
})
const image = revisionDoc?.spec?.containers?.[0]?.image || serviceDoc?.spec?.template?.spec?.containers?.[0]?.image || ''
const imageDigest = image.match(/@sha256:([a-f0-9]{64})$/i)?.[1] || null
const checks = [
	{ id: 'gcloud-read', status: serviceDoc && result.status === 0 ? 'PASS' : 'BLOCKED' },
	{ id: 'active-100-percent-revision', status: activeTraffic?.revisionName ? 'PASS' : 'BLOCKED' },
	{ id: 'immutable-image-digest', status: /@sha256:[a-f0-9]{64}$/i.test(image) ? 'PASS' : 'BLOCKED' },
	{ id: 'avatar-runtime-config', status: configChecks.every(check => check.present && check.matches) ? 'PASS' : 'BLOCKED' },
	{ id: 'credential-store-secret-reference', status: credentialVolume?.secret?.secretName === 'betterpptx-avatar-worker-credentials' ? 'PASS' : 'BLOCKED' },
	{ id: 'avatar-worker-volume', status: volumeNames.has('avatar-worker-credentials') ? 'PASS' : 'BLOCKED' },
]
const blockers = checks.filter(check => check.status !== 'PASS').map(check => check.id)
const report = {
	schemaVersion: 'betterpptx.avatar-deployed-revision.v1',
	status: blockers.length ? 'BLOCKED' : 'PASS',
	serviceNamePresent: Boolean(serviceDoc?.metadata?.name),
	region,
	activeRevision: activeTraffic?.revisionName || null,
	imageDigest: imageDigest ? `sha256:${imageDigest}` : null,
	activeRevisionPresent: Boolean(activeTraffic?.revisionName),
	productionTalkingHeadOnlyRequired: true,
	productionTalkingHeadOnlyVerified: configChecks
		.filter(check => ['BETTERPPTX_AVATAR_PROVIDER', 'BETTERPPTX_AVATAR_PRODUCTION_ONLY', 'BETTERPPTX_AVATAR_PRODUCTION_MOTION_PROFILE', 'BETTERPPTX_AVATAR_PRODUCTION_MOUTH_PROFILE'].includes(check.id))
		.every(check => check.present && check.matches),
	configChecks,
	checks,
	blockers,
	stderrPresent: Boolean(stderr),
}
const outputPath = path.resolve('betterpptx-mcp/outputs/avatar-deployed-revision-report.json')
await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (blockers.length) process.exitCode = 2
