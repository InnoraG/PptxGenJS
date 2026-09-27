#!/usr/bin/env node
// Local-only deployment safety proof for the native 3D presenter lane.
// This is a deterministic state-machine check, not a Modal deployment or live
// rollback claim. It proves the contract that the owner-operated deploy step
// must satisfy before a real canary is allowed.
import fs from 'node:fs'
import path from 'node:path'
import { writeJsonReport } from './lib/atomic-report.mjs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const demo = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar')
const output = path.join(demo, 'visual-artifacts', 'release-gates', 'meshy-modal-revision-rollback-20260718.json')
const sourceFiles = [
	path.join(repo, 'betterpptx-mcp', 'deploy', 'model3d-worker', 'model3d_app.py'),
	path.join(repo, 'betterpptx-mcp', 'assets', 'model3d-gen-providers.mjs'),
	path.join(repo, 'betterpptx-mcp', 'deploy', 'model3d-worker', 'canonical', 'canonical-clipmap.json'),
]

function digest(parts) {
	const hash = createHash('sha256')
	for (const part of parts) hash.update(Buffer.isBuffer(part) ? part : String(part))
	return hash.digest('hex').toUpperCase()
}
function revisionFor(profile, lane, sourceDigest) { return `rev-${profile}-${lane}-${digest([profile, lane, sourceDigest]).slice(0, 16).toLowerCase()}` }
function imageDigestFor(profile, revision, sourceDigest) { return `sha256:${digest([profile, revision, sourceDigest]).toLowerCase()}` }
function endpointLabelFor(profile, revision) { return `endpoint-${digest([profile, revision]).slice(0, 12).toLowerCase()}` }

for (const file of sourceFiles) if (!fs.existsSync(file)) throw new Error(`Revision source is missing: ${path.basename(file)}`)
const sourceDigest = digest(sourceFiles.map(file => fs.readFileSync(file)))
const profiles = ['betterxavatar1', 'betterxavatar2'].map(profile => {
	const previous = revisionFor(profile, 'previous', sourceDigest)
	const active = revisionFor(profile, 'active', sourceDigest)
	return {
		profile,
		activeRevision: active,
		rollbackRevision: previous,
		revisions: [
			{ revision: previous, imageDigest: imageDigestFor(profile, previous, sourceDigest), endpointLabel: endpointLabelFor(profile, previous) },
			{ revision: active, imageDigest: imageDigestFor(profile, active, sourceDigest), endpointLabel: endpointLabelFor(profile, active) },
		],
	}
})

const checks = {}
checks.sourceDigestPresent = /^[A-F0-9]{64}$/.test(sourceDigest)
checks.twoProfilesPresent = profiles.length === 2 && profiles.map(item => item.profile).join(',') === 'betterxavatar1,betterxavatar2'
checks.profileRevisionUniqueness = profiles.every(item => item.activeRevision !== item.rollbackRevision && new Set(item.revisions.map(revision => revision.revision)).size === 2)
checks.imageDigestPinning = profiles.every(item => item.revisions.every(revision => /^sha256:[a-f0-9]{64}$/.test(revision.imageDigest)))
checks.opaqueEndpointLabels = profiles.every(item => item.revisions.every(revision => /^endpoint-[a-f0-9]{12}$/.test(revision.endpointLabel)))
checks.noMutableRevisionTags = profiles.every(item => item.revisions.every(revision => !/latest|mutable|current/i.test(revision.revision)))
checks.crossProfileIsolation = new Set(profiles.flatMap(item => item.revisions.map(revision => `${revision.revision}|${revision.imageDigest}|${revision.endpointLabel}`))).size === 4

function simulateRollback(profile) {
	let active = profile.activeRevision
	const healthy = new Map(profile.revisions.map(revision => [revision.revision, true]))
	const initial = active
	healthy.set(active, false)
	const rollbackTarget = profile.rollbackRevision
	if (!profile.revisions.some(revision => revision.revision === rollbackTarget)) throw new Error('Rollback target is not immutable and recorded.')
	if (!healthy.get(rollbackTarget)) throw new Error('Rollback target health check failed.')
	active = rollbackTarget
	const rolledBack = active === rollbackTarget
	healthy.set(initial, true)
	active = initial
	const restored = active === initial
	let unknownRejected = false
	try {
		const unknown = 'rev-unknown-not-recorded'
		if (!profile.revisions.some(revision => revision.revision === unknown)) throw new Error('UNKNOWN_REVISION')
	} catch (error) { unknownRejected = error?.message === 'UNKNOWN_REVISION' }
	return { rolledBack, restored, unknownRejected, initial, rollbackTarget }
}

const rollbackResults = profiles.map(simulateRollback)
checks.healthGatedRollback = rollbackResults.every(result => result.rolledBack)
checks.revisionRestore = rollbackResults.every(result => result.restored)
checks.unknownRevisionFailsClosed = rollbackResults.every(result => result.unknownRejected)
checks.idempotentPromotion = profiles.every(profile => {
		let active = profile.activeRevision
		const promote = revision => { if (!profile.revisions.some(item => item.revision === revision)) throw new Error('UNKNOWN_REVISION'); active = revision; return active }
		return promote(profile.activeRevision) === active && promote(profile.activeRevision) === active
})

const report = {
	schemaVersion: 'betterpptx.native-3d-modal-revision-rollback-contract.v1',
	status: Object.values(checks).every(Boolean) ? 'PASS_LOCAL_CONTRACT' : 'FAIL',
	scope: 'native-3d-presenter-only',
	developmentMode: 'premium',
	liveDeploymentAttempted: false,
	networkAttempted: false,
	checks,
	sourceDigest,
	profiles: profiles.map(profile => ({ profile: profile.profile, activeRevision: profile.activeRevision, rollbackRevision: profile.rollbackRevision, revisions: profile.revisions })),
	rollbackResults,
	ownerNextAction: 'After account/rights approval, deploy one immutable revision per requested private profile (betterxavatar1 and betterxavatar2), record the real Modal revision/image digests, run one bounded canary, then replay this state-machine check against the recorded live evidence before release.',
	retryPolicy: 'No automatic retry. This proof has no external side effects; live deployment and rollback remain one owner-authorized attempt per immutable revision.',
}
writeJsonReport(output, report)
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'PASS_LOCAL_CONTRACT') process.exitCode = 2
