import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ensureDefaultPresenterRegistered } from '../assets/default-presenter-roster.mjs'
import { inspectMaterialProfile } from '../assets/glb-material-profile.mjs'
import { getCachedGeneratedRigged3d, materializeAuthoringMotionPresenter } from '../assets/model3d-gen-providers.mjs'
import { authoringMotionCatalog, publicAuthoringMotionCatalog, resolveAuthoringMotionSelection } from '../ir/authoring-motion-catalog.mjs'
import { parseGlb } from '../ir/kinetic-transplant.mjs'

test('Mixamo-only runtime quarantines inactive providers and materializes active aliases exactly', () => {
	const selectedMotionIds = [
		'motion.ordinary.talk',
		'motion.kinetic.sprint',
		'motion.kinetic.ground-smash',
	]
	const catalog = authoringMotionCatalog({ refresh: true })
	const byId = new Map(catalog.records.map(row => [row.motionId, row]))
	assert.equal(byId.get('motion.interaction.reach-touch-high-right').privateEvidence.sourceProvider, 'nvidia-kimodo')
	assert.equal(byId.get('motion.interaction.reach-touch-high-right').privateEvidence.sourceProviderStatus, 'QUARANTINED')
	assert.equal(byId.get('motion.interaction.reach-touch-high-right').selectable, false)
	assert.equal(byId.get('motion.kinetic.walking').privateEvidence.sourceProvider, 'nvidia-kimodo')
	assert.equal(byId.get('motion.kinetic.walking').selectable, false)
	assert.equal(byId.get('motion.kinetic.ground-smash').privateEvidence.sourceProvider, 'mixamo')
	assert.equal(byId.get('motion.kinetic.ground-smash').privateEvidence.declaredAliasOf, 'ground-pound')

	const publicRows = publicAuthoringMotionCatalog({ family: 'motion', includePlanned: true, limit: 200 }).motions
	for (const motionId of ['motion.interaction.reach-touch-high-right', 'motion.kinetic.walking']) {
		const row = publicRows.find(item => item.id === motionId)
		assert.equal(row.selectable, false)
		assert.match(row.limitation, /provider remains under independent runtime validation/)
		assert.equal(Object.hasOwn(row, 'privateEvidence'), false)
		assert.equal(Object.hasOwn(row, 'sourceLibrary'), false)
	}
	const rejected = resolveAuthoringMotionSelection(['motion.interaction.reach-touch-high-right'])
	assert.equal(rejected.ok, false)
	assert.equal(rejected.errors[0].code, 'MOTION_NOT_EXECUTABLE')

	const registered = ensureDefaultPresenterRegistered('louise')
	const base = getCachedGeneratedRigged3d(registered.hash)
	const built = materializeAuthoringMotionPresenter({
		baseGlbBase64: base.glbBase64,
		baseHash: `${registered.hash}-mixamo-only-routing`,
		retargetRestProfile: base.retargetRestProfile,
		selectedMotionIds,
		previewBase64: base.previewBase64,
		license: base.license,
	})
	const asset = getCachedGeneratedRigged3d(built.hash)
	const glb = Buffer.from(asset.glbBase64, 'base64')
	const parsed = parseGlb(glb)
	assert.deepEqual(parsed.json.animations.map(animation => animation.name), selectedMotionIds.map((motionId, index) => `${String(index).padStart(2, '0')}_${motionId}`))
	assert.deepEqual(asset.manifest.selectedMotionIds, selectedMotionIds)
	assert.deepEqual(asset.manifest.motionIdToAnimId, Object.fromEntries(selectedMotionIds.map((motionId, index) => [motionId, index])))
	assert.equal(asset.manifest.transplant.length, selectedMotionIds.length)
	assert.equal(asset.manifest.articulationConstraints, undefined)
	assert.equal(asset.manifest.motionStabilization, undefined)

	for (const animation of parsed.json.animations) {
		const targets = animation.channels.reduce((counts, channel) => {
			counts[channel.target.path] = (counts[channel.target.path] || 0) + 1
			return counts
		}, {})
		assert.ok(targets.rotation > 0)
		assert.ok(Object.keys(targets).every(path => path === 'rotation' || path === 'translation'))
	}
	const materialProfile = inspectMaterialProfile(glb)
	assert.ok(materialProfile.length > 0)
	assert.ok(materialProfile.every(material => material.metallicFactor === 0 && material.roughnessFactor === 1 && !material.hasMetallicRoughnessTexture && !material.hasSpecularExtension))
})
