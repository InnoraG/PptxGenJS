#!/usr/bin/env node
import assert from 'node:assert/strict'
import { snapshotMatchesServingRevision, snapshotsMatchServingRevision } from '../billing/revision-binding.mjs'

const revision = 'betterpptx-mcp-staging-00085-7nm'
assert.equal(snapshotMatchesServingRevision({ servingRevision: revision }, revision), true)
assert.equal(snapshotMatchesServingRevision({ revision }, revision), true)
assert.equal(snapshotMatchesServingRevision({ servingRevision: 'old-revision' }, revision), false)
assert.equal(snapshotMatchesServingRevision({}, revision), false)
assert.equal(snapshotMatchesServingRevision({ servingRevision: revision }, ''), false)
assert.equal(snapshotsMatchServingRevision([{ servingRevision: revision }, { revision }], revision, 2), true)
assert.equal(snapshotsMatchServingRevision([{ servingRevision: revision }], revision, 2), false)
assert.equal(snapshotsMatchServingRevision([{ servingRevision: revision }, {}], revision, 2), false)

console.log(JSON.stringify({ status: 'PASS', checks: ['servingRevision match', 'legacy revision match', 'mismatch rejection', 'missing revision rejection', 'all-profile count binding'] }, null, 2))
