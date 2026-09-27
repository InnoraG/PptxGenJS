#!/usr/bin/env node
// Verifies the frozen commercial engineering boundary. This is a product
// policy/provenance check, not a legal opinion and not public enablement.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveNative3dPipeline, publicProductionNative3dLicense } from './ir/native3d-policy.mjs'

const root = path.resolve('betterpptx-mcp/outputs')
const decision = JSON.parse(await fs.readFile(path.resolve('betterpptx-mcp/docs/release-safety/AVATAR-RESALE-SAFE-PIPELINE-DECISION-2026-07-19.json'), 'utf8'))
const license = JSON.parse(await fs.readFile(path.join(root, 'avatar-license-ledger-report.json'), 'utf8'))
const provenance = JSON.parse(await fs.readFile(path.join(root, 'avatar-worker-provenance-pins-report.json'), 'utf8'))
const restoration = JSON.parse(await fs.readFile(path.join(root, 'avatar-restoration-selection-report.json'), 'utf8'))
const meshPolicy = JSON.parse(await fs.readFile(path.join(root, 'meshy-provider-identity-policy-report.json'), 'utf8'))

assert.equal(decision.status, 'FROZEN_RESALE_SAFE_ENGINEERING_BASELINE')
assert.equal(license.status, 'PASS')
assert.equal(license.defaultPresenterCommercial, true)
assert.equal(provenance.status, 'PASS')
assert.equal(provenance.sbom?.reviewed, true)
assert.equal(restoration.deployment?.enabled, false)
assert.equal(restoration.deployment?.frozenWorkerUnchanged, true)
assert.equal(meshPolicy.status, 'PASS')
assert.equal(decision.talkingHeadPipeline.find(stage => stage.stage === 'restoration').component, 'none')
assert.equal(decision.native3dProductionPath.provider, 'Meshy image-to-3D → Mixamo rig/animation → native PowerPoint 3D')
assert.equal(decision.native3dProductionPath.status, 'OPEN_PROVIDER_CLEARANCE')
assert.equal(decision.native3dProductionPath.meshOutputMayFeedLipSync, false)
assert.equal(decision.native3dProofOfConceptPath.status, 'POC_FLOW_TEST_ONLY')
assert.equal(resolveNative3dPipeline({ production: true, personalized: false }).code, 'NATIVE3D_PRODUCTION_REQUIRES_MESHY_MIXAMO')
assert.equal(publicProductionNative3dLicense().commercialUse, 'conditional')
assert.equal(publicProductionNative3dLicense().type, 'provider-gated')

const report = {
  schemaVersion: 'betterpptx.avatar-resale-safe-pipeline-report.v1',
  status: 'PASS',
  baseline: 'frozen-talking-head-plus-gated-meshy-mixamo-native-3d',
  checks: [
    'frozen worker license ledger passes',
    'immutable worker provenance and reviewed SBOM pass',
    'restoration is excluded and fail-closed',
    'Meshy relighting/enhancement policy passes',
    'production native 3D is explicitly Meshy → Mixamo and remains provider-gated',
    'self-hosted TRELLIS.2/UniRig/DRTK is POC/flow-test only',
    'production route guard rejects the self-hosted single-image path',
    'Mesh output is never fed into the talking-head/lipsync branch',
  ],
  interpretation: 'The talking-head baseline is resale-safe by recorded component/provenance policy. The intended Meshy → Mixamo native-3D production lane is explicitly gated and is not cleared by the talking-head decision; public enablement remains fail-closed until its owner/provider gates pass.',
}
await fs.writeFile(path.join(root, 'avatar-resale-safe-pipeline-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
