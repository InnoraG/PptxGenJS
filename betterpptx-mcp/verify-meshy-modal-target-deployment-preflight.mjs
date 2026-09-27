#!/usr/bin/env node
// Non-mutating deployment preflight for the requested native-3D Modal profiles.
// It computes stable opaque labels and source evidence, but never deploys,
// creates/rotates Modal secrets, calls a worker, or edits the credential store.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { writeJsonReport } from './lib/atomic-report.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const demo = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar')
const output = path.join(demo, 'visual-artifacts', 'release-gates', 'meshy-modal-target-deployment-preflight-20260718.json')
const inventoryPath = path.join(demo, 'visual-artifacts', 'release-gates', 'meshy-modal-profile-inventory-20260718.json')
const workerRoot = path.join(repo, 'betterpptx-mcp', 'deploy', 'model3d-worker')
const requiredSourcePaths = [
	path.join(repo, 'betterpptx-mcp', 'deploy', 'model3d-worker', 'model3d_app.py'),
	path.join(repo, 'betterpptx-mcp', 'assets', 'model3d-gen-providers.mjs'),
]
const embeddedWorkerRoots = ['nvdiffrast_stub', 'nvdiffrast_drtk', 'canonical', 'bake', 'mocap'].map(name => path.join(workerRoot, name))
const targetProfiles = ['betterxavatar1', 'betterxavatar2']

function digest(parts) {
	const hash = createHash('sha256')
	for (const part of parts) hash.update(Buffer.isBuffer(part) ? part : String(part))
	return hash.digest('hex').toUpperCase()
}
function opaqueLabel(profile, sourceDigest) { return `endpoint-${digest([profile, sourceDigest]).slice(0, 12).toLowerCase()}` }
function healthLabel(profile, sourceDigest) { return `endpoint-${digest([profile, sourceDigest, 'health']).slice(0, 12).toLowerCase()}` }
function revisionTag(profile, sourceDigest) { return `rev-${profile}-${digest([profile, sourceDigest]).slice(0, 16).toLowerCase()}` }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }
function collectFiles(root) {
	if (!fs.existsSync(root)) return []
	const entries = fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
	return entries.flatMap(entry => {
		if (entry.name === '__pycache__' || entry.name.endsWith('.pyc') || entry.name.endsWith('.pyo')) return []
		const full = path.join(root, entry.name)
		if (entry.isDirectory()) return collectFiles(full)
		return entry.isFile() ? [full] : []
	})
}

const filesPresent = [...requiredSourcePaths, ...embeddedWorkerRoots].every(file => fs.existsSync(file))
if (!filesPresent) throw new Error('DEPLOYMENT_SOURCE_MISSING')
const sourceFiles = [...new Set([
	...requiredSourcePaths,
	...embeddedWorkerRoots.flatMap(collectFiles),
])].sort((a, b) => a.localeCompare(b))
const workerSource = fs.readFileSync(path.join(workerRoot, 'model3d_app.py'), 'utf8')
const sourceHash = createHash('sha256')
for (const file of sourceFiles) {
	sourceHash.update(path.relative(repo, file).replaceAll('\\', '/'))
	sourceHash.update('\0')
	sourceHash.update(fs.readFileSync(file))
	sourceHash.update('\0')
}
const sourceDigest = sourceHash.digest('hex').toUpperCase()
const inventory = fs.existsSync(inventoryPath) ? readJson(inventoryPath) : null
const inventoryProfiles = inventory?.profiles || []
const targetInventory = targetProfiles.map(profile => inventoryProfiles.find(item => item.profile === profile) || null)
function extractPinnedRef(name) {
	const match = workerSource.match(new RegExp(`^${name} = _pinned_(?:git_ref|hf_revision)\\([^,]+, \\"([a-f0-9]{40})\\"\\)`, 'm'))
	return match?.[1] || null
}
const upstreamRefs = {
	DRTK_GIT_REF: extractPinnedRef('DRTK_GIT_REF'),
	TRELLIS_GIT_REF: extractPinnedRef('TRELLIS_GIT_REF'),
	UNIRIG_GIT_REF: extractPinnedRef('UNIRIG_GIT_REF'),
}
const hfModelRevisions = {
	TRELLIS_MODEL_REVISION: extractPinnedRef('TRELLIS_MODEL_REVISION'),
	TRELLIS_SS_DECODER_REVISION: extractPinnedRef('TRELLIS_SS_DECODER_REVISION'),
	DINOV3_MODEL_REVISION: extractPinnedRef('DINOV3_MODEL_REVISION'),
	BIREFNET_MODEL_REVISION: extractPinnedRef('BIREFNET_MODEL_REVISION'),
	UNIRIG_MODEL_REVISION: extractPinnedRef('UNIRIG_MODEL_REVISION'),
}
const plans = targetProfiles.map(profile => ({
	profile,
	endpointLabel: opaqueLabel(profile, sourceDigest),
	healthEndpointLabel: healthLabel(profile, sourceDigest),
	deploymentRevision: revisionTag(profile, sourceDigest),
	sourceDigest,
	upstreamRefs,
	hfModelRevisions,
	command: `$env:MODAL_PROFILE='${profile}'; $env:DRTK_GIT_REF='${upstreamRefs.DRTK_GIT_REF}'; $env:TRELLIS_GIT_REF='${upstreamRefs.TRELLIS_GIT_REF}'; $env:UNIRIG_GIT_REF='${upstreamRefs.UNIRIG_GIT_REF}'; $env:TRELLIS_MODEL_REVISION='${hfModelRevisions.TRELLIS_MODEL_REVISION}'; $env:TRELLIS_SS_DECODER_REVISION='${hfModelRevisions.TRELLIS_SS_DECODER_REVISION}'; $env:DINOV3_MODEL_REVISION='${hfModelRevisions.DINOV3_MODEL_REVISION}'; $env:BIREFNET_MODEL_REVISION='${hfModelRevisions.BIREFNET_MODEL_REVISION}'; $env:UNIRIG_MODEL_REVISION='${hfModelRevisions.UNIRIG_MODEL_REVISION}'; $env:MODEL3D_ENDPOINT_LABEL='${opaqueLabel(profile, sourceDigest)}'; $env:MODEL3D_HEALTH_ENDPOINT_LABEL='${healthLabel(profile, sourceDigest)}'; $env:MODEL3D_DEPLOYMENT_REVISION='${revisionTag(profile, sourceDigest)}'; $env:MODEL3D_SOURCE_DIGEST='${sourceDigest}'; python -m modal deploy betterpptx-mcp/deploy/model3d-worker/model3d_app.py`,
	secretPrerequisite: 'betterpptx-model3d-token is present in this profile; owner must confirm/rotate it before deployment',
}))
const checks = {
	sourceFilesPresent: filesPresent,
	sourceDigestPinned: /^[A-F0-9]{64}$/.test(sourceDigest),
	targetProfileInventoryAvailable: inventory?.checks?.requestedProfilesExistAndAreQueried === true,
	targetProfilesHaveNoExistingWorker: targetInventory.length === 2 && targetInventory.every(item => item?.model3dAppCount === 0),
	targetProfilesHaveWorkerToken: inventory?.checks?.requestedProfilesHaveWorkerToken === true,
	stableOpaqueLabels: new Set(plans.flatMap(item => [item.endpointLabel, item.healthEndpointLabel])).size === 4 && plans.every(item => /^endpoint-[a-f0-9]{12}$/.test(item.endpointLabel) && /^endpoint-[a-f0-9]{12}$/.test(item.healthEndpointLabel)),
	healthEndpointContractPresent: workerSource.includes('MODEL3D_HEALTH_ENDPOINT_LABEL') && workerSource.includes('@modal.fastapi_endpoint(method="GET", label=MODEL3D_HEALTH_ENDPOINT_LABEL)') && workerSource.includes('def health():') && workerSource.includes('"sourceDigest": MODEL3D_SOURCE_DIGEST or None'),
	healthEndpointDoesNotSubmitJobs: workerSource.includes('def health():') && !workerSource.slice(workerSource.indexOf('def health():')).includes('run_pipeline.spawn'),
	upstreamRefsPinned: Object.values(upstreamRefs).every(value => /^[a-f0-9]{40}$/.test(value || '')),
	hfModelRevisionsPinned: Object.values(hfModelRevisions).every(value => /^[a-f0-9]{40}$/.test(value || '')),
	revisionOverridesFailClosed: workerSource.includes('if len(ref) != 40') && workerSource.includes('must be an exact 40-character commit SHA') && workerSource.includes('raise RuntimeError'),
	embeddedPayloadDigestComplete: embeddedWorkerRoots.every(root => sourceFiles.some(file => file.startsWith(root + path.sep))) && workerSource.includes('_GENERATED_FILE_IGNORE') && workerSource.includes('ignore=_GENERATED_FILE_IGNORE'),
	noCredentialStoreMutation: true,
	noDeploymentAttempted: true,
	noGenerationAttempted: true,
	boundedTwoProfileSequence: plans.length === 2,
}
const report = {
	schemaVersion: 'betterpptx.native-3d-modal-target-deployment-preflight.v1',
	status: Object.values(checks).every(Boolean) ? 'READY_FOR_OWNER_DEPLOYMENT' : 'BLOCKED_LOCAL_PREFLIGHT',
	scope: 'native-3d-presenter-only',
	developmentMode: 'premium',
	targetProfiles,
	sourceFiles: sourceFiles.map(file => ({ file: path.relative(repo, file).replaceAll('\\', '/'), bytes: fs.statSync(file).size })),
	sourceDigest,
	checks,
	plans,
	ownerSequence: [
		'Owner confirms Meshy account, image consent, Mixamo rights, Joe/Louise fallback rights, and deployment budget.',
		'Owner creates/rotates betterpptx-model3d-token separately in betterxavatar1 and betterxavatar2.',
		'Run exactly one immutable deployment per target profile using the recorded opaque label and source digest; do not loop or retry automatically.',
		'Record real Modal app/revision/image digests and verify the separate opaque GET health/identity endpoint returns generic readiness plus the supplied revision/source digest without GPU work.',
		'Run one bounded live canary and downstream GLB → PPTX → repair/open → PNG → motion acceptance per approved sequence.',
		'Only after both profiles pass, register their opaque endpoint URLs/tokens in Mission Control/credential store and replay rollback evidence.',
	],
	ownerNextAction: 'Perform the two owner-authorized immutable deployments under betterxavatar1 and betterxavatar2, then record live revision/image digests before any route switch.',
}
writeJsonReport(output, report)
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'READY_FOR_OWNER_DEPLOYMENT') process.exitCode = 1
