import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { inspectMotionLibraryEvidence } from '../motion-library-evidence.mjs'

const file = name => fileURLToPath(new URL(name, import.meta.url))
const options = {
	assetId: 'authoring-interaction-18',
	libraryPath: file('../assets/authoring-interaction-clips-v3-proven.glb'),
	proofPath: file('../assets/authoring-interaction-clips-v3-proof.json'),
	releaseManifestPath: file('../docs/release-safety/G5-PRODUCT-ASSET-RELEASE-MANIFEST.json'),
}
const proof = JSON.parse(fs.readFileSync(options.proofPath))
options.expectedClipNames = proof.clipNames

test('dedicated source readiness requires exact approved bytes and native playback evidence', () => {
	const evidence = inspectMotionLibraryEvidence(options)
	assert.equal(evidence.status, 'PASS', JSON.stringify(evidence.issues))
	assert.equal(evidence.clipNames.length, 18)
	assert.equal(evidence.productionPromotionAuthorized, false, 'source readiness does not authorize deployment')
})

for (const [label, target, mutate, code] of [
	['revoked source approval', 'releaseManifestPath', value => { value.assets.find(asset => asset.id === options.assetId).approvalStatus = 'REVOKED' }, 'MOTION_LIBRARY_APPROVAL_MISMATCH'],
	['mismatched source proof hash', 'proofPath', value => { value.output.sha256 = '0'.repeat(64) }, 'MOTION_LIBRARY_PROOF_HASH_MISMATCH'],
	['unclosed source gate', 'proofPath', value => { value.pendingGates = ['native-playback-review'] }, 'MOTION_LIBRARY_PROOF_NOT_PASSED'],
	['failed native playback', 'proofPath', value => { value.powerpointEvidence.status = 'FAIL' }, 'MOTION_LIBRARY_PLAYBACK_NOT_PASSED'],
	['wrong semantic clip order', 'proofPath', value => { value.clipNames = [...value.clipNames].reverse() }, 'MOTION_LIBRARY_CLIP_ORDER_MISMATCH'],
]) test(`source audit rejects a controlled ${label} fixture`, () => {
	const replacement = JSON.parse(fs.readFileSync(options[target]))
	mutate(replacement)
	const evidence = inspectMotionLibraryEvidence({ ...options, readFile: path => path === options[target] ? Buffer.from(JSON.stringify(replacement)) : fs.readFileSync(path) })
	assert.equal(evidence.status, 'NOT_READY')
	assert.ok(evidence.issues.includes(code), JSON.stringify(evidence.issues))
})
