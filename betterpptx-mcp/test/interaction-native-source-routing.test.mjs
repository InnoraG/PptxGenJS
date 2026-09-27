import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { authoringMotionById, publicAuthoringMotionCatalog, resolveAuthoringMotionSelection } from '../ir/authoring-motion-catalog.mjs'
import { governedAuthoringMotionSelection } from '../assets/authoring-motion-sources.mjs'
import { ensureDefaultPresenterRegistered } from '../assets/default-presenter-roster.mjs'
import { getCachedGeneratedRigged3d, materializeAuthoringMotionPresenter } from '../assets/model3d-gen-providers.mjs'

const motions = ['motion.interaction.greet-bow', 'motion.interaction.agree-nod', 'motion.interaction.disagree-shake']
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const assets = new URL('../assets/', import.meta.url)

test('Kimodo interaction sources remain preserved but are quarantined from the active Mixamo-only runtime', () => {
	assert.equal(hash(fs.readFileSync(new URL('authoring-interaction-clips-v3-proven.glb', assets))), '116e168a9321f0d51659faaea6fcba00ee7c00c7e0568335be2d9f4355f54840', 'The prior frozen interaction library must remain unchanged.')
	for (const id of motions) {
		const row = authoringMotionById(id)
		assert.equal(row.selectable, false)
		assert.equal(row.privateEvidence.sourceProvider, 'nvidia-kimodo')
		assert.equal(row.privateEvidence.sourceProviderStatus, 'QUARANTINED')
		assert.equal(row.lifecycle.measurementState, 'SOURCE_PROVIDER_QUARANTINED')
		assert.equal(row.lifecycle.productState, 'IMPLEMENTED_NOT_SELECTABLE')
		assert.throws(() => governedAuthoringMotionSelection(id), error => error.code === 'AUTHORING_MOTION_SOURCE_INVALID')
	}
	const rejected = resolveAuthoringMotionSelection(motions)
	assert.equal(rejected.ok, false)
	assert.equal(rejected.errors.length, motions.length)
	assert.ok(rejected.errors.every(error => error.code === 'MOTION_NOT_EXECUTABLE'))

	const publicJson = JSON.stringify(publicAuthoringMotionCatalog({ family: 'motion', includePlanned: true, limit: 500 }))
	for (const token of ['world-delta', 'sourceSlug', 'retarget', 'resolvedSource', 'playbackProof', 'native-bvh', 'nvidia-kimodo']) {
		assert(!publicJson.includes(token), `Private or quarantined source detail leaked: ${token}`)
	}
	for (const id of motions) assert(publicJson.includes(id), `Public semantic ID missing: ${id}`)
})

for (const identity of ['joe', 'louise', 'pete']) test(`active ${identity} materializer refuses quarantined interaction selections without substitution`, () => {
	const registration = ensureDefaultPresenterRegistered(identity)
	const base = getCachedGeneratedRigged3d(registration.hash)
	assert.throws(() => materializeAuthoringMotionPresenter({
		baseGlbBase64: base.glbBase64,
		baseHash: registration.hash,
		retargetRestProfile: base.retargetRestProfile,
		selectedMotionIds: motions,
		staticPoseClipName: '00_idle',
	}), error => error.code === 'MOTION_NOT_EXECUTABLE')
})
