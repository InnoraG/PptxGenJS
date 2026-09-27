#!/usr/bin/env node
// Policy-only guard for a future Real-ESRGAN core experiment. It intentionally
// does not download weights, import GFPGAN, or mutate the frozen worker.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const report = JSON.parse(await fs.readFile(path.resolve('betterpptx-mcp/outputs/avatar-restoration-selection-report.json'), 'utf8'))
const candidate = report.candidates.find(item => item.id === 'realesrgan-core')

assert.ok(candidate, 'Real-ESRGAN core candidate is recorded')
assert.equal(candidate.repositoryLicense, 'BSD-3-Clause')
assert.equal(candidate.faceEnhanceFlag, false)
assert.equal(candidate.gfpganDependency, 'MUST_NOT_BE_IMPORTED_OR_DOWNLOADED')
assert.equal(report.deployment.enabled, false)
assert.equal(report.deployment.frozenWorkerUnchanged, true)
assert.equal(report.policy.mustBeMouthMasked, true)
assert.equal(report.policy.mustBeTemporallyStable, true)
assert.equal(report.policy.mustPreserveOriginal, true)
assert.equal(candidate.weightLicenseEvidence, 'NOT_RECORDED')

const output = {
  schemaVersion: 'betterpptx.restoration-core-only-policy.v1',
  status: 'PASS_POLICY_ONLY',
  candidate: candidate.id,
  checks: [
    'BSD-3-Clause repository license recorded',
    'face enhancement flag disabled',
    'GFPGAN import/download prohibited',
    'deployment remains disabled',
    'weight provenance remains explicitly open',
    'mouth-mask, temporal-stability, and source-preservation gates remain required',
  ],
  interpretation: 'This proves only the core-only policy; it is not evidence that any Real-ESRGAN checkpoint is cleared for resale or that restoration quality is production-ready.',
}
await fs.writeFile(path.resolve('betterpptx-mcp/outputs/restoration-core-only-policy-report.json'), JSON.stringify(output, null, 2) + '\n')
console.log(JSON.stringify(output, null, 2))
