// Pure contract gate for the private Meshy→Mixamo oracle attachment.
// No network, provider credentials, customer images, or GPU work are used.
import assert from 'node:assert/strict'
import { validateEmpiricalClipTimelineProfile } from './assets/meshy-avatar-provider.mjs'
import { MESHY_MIXAMO_CONTRACT } from './ir/meshy-mixamo-hybrid.mjs'

const actorHash = 'sha256:actor-for-contract-fixture'
const profile = {
	schemaVersion: 2,
	actorHash,
	clipLibraryHash: 'sha256:clip-library-for-contract-fixture',
	executionProfileId: 'windows-contract-fixture',
	oracleVersion: 'oracle-contract-fixture',
	evidence: { artifactHash: 'sha256:artifact', resultHash: 'sha256:result' },
	timelines: Object.fromEntries(Array.from({ length: MESHY_MIXAMO_CONTRACT.maxAnimationCount }, (_, index) => [String(index), [[0, 0, 0], [100, 0.1, 0.1], [200, 0.2, 0.2], [300, 0.2, 0.2], [400, 0.2, 0.2]]])),
}

const accepted = validateEmpiricalClipTimelineProfile(profile, { actorHash })
assert.equal(accepted.ok, true, accepted.failures.join('; '))
assert.equal(accepted.profile, profile)

const wrongActor = validateEmpiricalClipTimelineProfile(profile, { actorHash: 'sha256:another-actor' })
assert.equal(wrongActor.ok, false)
assert.ok(wrongActor.failures.some(reason => /actorHash/.test(reason)))

const missingSlot = structuredClone(profile)
delete missingSlot.timelines['17']
const incomplete = validateEmpiricalClipTimelineProfile(missingSlot, { actorHash })
assert.equal(incomplete.ok, false)
assert.ok(incomplete.failures.some(reason => /missing timeline slots/.test(reason)))

const malformed = structuredClone(profile)
malformed.timelines['3'][2] = [250, 'not-a-number', 0]
const invalid = validateEmpiricalClipTimelineProfile(malformed, { actorHash })
assert.equal(invalid.ok, false)
assert.ok(invalid.failures.some(reason => /malformed point/.test(reason)))

console.log(JSON.stringify({
	schemaVersion: 'betterpptx.meshy-timeline-profile-contract.v1',
	status: 'PASS',
	clipCount: MESHY_MIXAMO_CONTRACT.maxAnimationCount,
	acceptedCompleteProfile: true,
	rejectedWrongActor: true,
	rejectedMissingSlot: true,
	rejectedMalformedPoint: true,
	publicEnablementAllowed: false,
}, null, 2))
