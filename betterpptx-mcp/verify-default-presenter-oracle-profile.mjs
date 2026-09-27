// Maintainer-only A1 attachment proof.
//
// Usage:
//   node betterpptx-mcp/verify-default-presenter-oracle-profile.mjs \
//     outputs/render-oracle/current-default-joe-20260801/105594811c8b/timelines.json
//
// The profile is intentionally supplied by an explicit private path. This
// verifier proves that the default Joe asset attaches the complete, hash-bound
// schema-v2 profile and that a mismatched profile fails closed.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const profileFile = path.resolve(process.argv[2] || path.join(repo, 'outputs', 'render-oracle', 'current-default-joe-20260801', '105594811c8b', 'timelines.json'))
assert.equal(fs.existsSync(profileFile), true, `missing A1 profile: ${profileFile}`)
const profile = JSON.parse(fs.readFileSync(profileFile, 'utf8'))
process.env.BETTERPPTX_DEFAULT_PRESENTER_TIMELINES_FILE = profileFile
process.env.BETTERPPTX_GEN_ASSET_STORE = 'local'
const durableRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-oracle-profile-'))
process.env.BETTERPPTX_GEN_ASSET_DIR = durableRoot

const roster = await import('./assets/default-presenter-roster.mjs')
const providers = await import('./assets/model3d-gen-providers.mjs')
const store = await import('./storage/gen-asset-store.mjs')
const joeGlb = path.join(here, 'assets', 'default-presenter-joe.glb')
const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(joeGlb)).digest('hex')
const attached = roster.ensureDefaultPresenterRegistered('joe')
const cached = providers.getCachedGeneratedRigged3d(attached.hash)

assert.equal(profile.schemaVersion, 2)
assert.equal(String(profile.actorHash).replace(/^sha256:/i, ''), sourceHash)
assert.equal(attached.oracleProfile?.source, 'private-a1-profile')
assert.equal(attached.oracleProfile?.executionProfileId, profile.executionProfileId)
assert.equal(attached.oracleProfile?.oracleVersion, profile.oracleVersion)
assert.equal(attached.oracleProfile?.timelineCount, 18)
assert.deepEqual(cached?.manifest?.clipTimelines, profile)
assert.equal(cached?.manifest?.timelineProfileDigest, attached.oracleProfile.digest)

const durable = await roster.persistDefaultPresenterRegistration('joe', 'oracle-profile-owner')
assert.equal(durable.persisted?.ok, true)
const durableLoaded = await store.loadGeneratedAsset({ tenantId: 'oracle-profile-owner', hash: durable.hash })
assert.deepEqual(durableLoaded?.record?.meta?.manifest?.clipTimelines, profile)
assert.equal(durableLoaded?.record?.meta?.manifest?.timelineProfileDigest, attached.oracleProfile.digest)

// A configured but invalid profile must not leave the previous profile attached
// under a new registration key. This is the fail-closed boundary used by a
// packaged/public install with no valid worker-bake oracle record.
const invalidFile = path.join(repo, 'outputs', 'render-oracle', 'current-default-joe-20260801', 'invalid-profile-fixture.json')
const invalid = { ...profile, actorHash: 'sha256:not-the-default-joe' }
fs.writeFileSync(invalidFile, `${JSON.stringify(invalid)}\n`)
process.env.BETTERPPTX_DEFAULT_PRESENTER_TIMELINES_FILE = invalidFile
const invalidAttached = roster.ensureDefaultPresenterRegistered('joe')
const invalidCached = providers.getCachedGeneratedRigged3d(invalidAttached.hash)
assert.equal(invalidAttached.oracleProfile?.source, invalidFile)
assert.equal(invalidCached?.manifest?.clipTimelines ?? null, null)
fs.rmSync(invalidFile, { force: true })
fs.rmSync(durableRoot, { recursive: true, force: true })

const report = {
	 schemaVersion: 'betterpptx.default-presenter-oracle-profile.v1',
	 status: 'PASS',
	 identity: 'joe',
	 profile: {
		 schemaVersion: profile.schemaVersion,
		 executionProfileId: profile.executionProfileId,
		 oracleVersion: profile.oracleVersion,
		 actorHash: profile.actorHash,
		 timelineCount: Object.keys(profile.timelines || {}).length,
		 digest: attached.oracleProfile.digest,
	 },
	 attachedHandle: attached.handle,
	 durableRecord: { ok: durable.persisted.ok, provider: durable.persisted.provider, tenant: durable.persisted.tenant },
	 failClosedOnMismatch: true,
	 publicEnablementAllowed: false,
	 profilePath: profileFile,
}
console.log(JSON.stringify(report, null, 2))
