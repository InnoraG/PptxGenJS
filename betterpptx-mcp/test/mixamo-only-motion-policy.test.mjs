import assert from 'node:assert/strict'
import test from 'node:test'

import {
	authoringMotionCatalog,
	publicAuthoringMotionCatalog,
	resolveAuthoringMotionSelection,
} from '../ir/authoring-motion-catalog.mjs'
import {
	ACTIVE_MOTION_SOURCE_PROVIDERS,
	QUARANTINED_MOTION_SOURCE_PROVIDERS,
	MOTION_SOURCE_PROVIDER_POLICY_VERSION,
	isMotionSourceProviderActive,
	motionSourceProviderPolicy,
} from '../assets/authoring-motion-sources.mjs'

test('the active animation provider policy is Mixamo-only and fail-closed', () => {
	assert.deepEqual([...ACTIVE_MOTION_SOURCE_PROVIDERS], ['mixamo'])
	assert.deepEqual([...QUARANTINED_MOTION_SOURCE_PROVIDERS], ['nvidia-kimodo'])
	assert.equal(MOTION_SOURCE_PROVIDER_POLICY_VERSION, 'mixamo-only-v1')
	assert.equal(isMotionSourceProviderActive('mixamo'), true)
	assert.equal(isMotionSourceProviderActive('nvidia-kimodo'), false)
	assert.deepEqual(motionSourceProviderPolicy(), {
		version: 'mixamo-only-v1',
		activeProviders: ['mixamo'],
		quarantinedProviders: ['nvidia-kimodo'],
		mode: 'mixamo-only',
	})
})

test('catalog preserves all 96 rows while exposing only the 56 active Mixamo rows', () => {
	const privateCatalog = authoringMotionCatalog({ refresh: true })
	assert.deepEqual(privateCatalog.runtimeMotionPolicy, motionSourceProviderPolicy())
	assert.equal(privateCatalog.inventory.total, 96)
	assert.equal(privateCatalog.inventory.selectable, 56)
	assert.equal(privateCatalog.inventory.notSelectable, 40)
	const quarantined = privateCatalog.records.filter(row => row.privateEvidence?.sourceProvider === 'nvidia-kimodo')
	assert.equal(quarantined.length, 40)
	assert.ok(quarantined.every(row => row.selectable === false && row.privateEvidence.sourceProviderStatus === 'QUARANTINED'))
	assert.ok(privateCatalog.records.filter(row => row.selectable).every(row => row.privateEvidence?.sourceProvider !== 'nvidia-kimodo'))

	const publicCatalog = publicAuthoringMotionCatalog({ family: 'motion', includePlanned: true, limit: 200 })
	assert.deepEqual(publicCatalog.catalog.runtimeMotionPolicy, { mode: 'mixamo-only', version: 'mixamo-only-v1', activeProviders: ['mixamo'] })
	assert.equal(publicCatalog.motions.length, 96)
	assert.equal(publicCatalog.motions.filter(row => row.selectable !== false).length, 56)
	assert.equal(publicCatalog.motions.filter(row => row.selectable === false).length, 40)
	const publicJson = JSON.stringify(publicCatalog)
	assert.equal(publicJson.includes('nvidia-kimodo'), false)
	assert.equal(publicJson.includes('authoring-interaction-clips-v3-proven.glb'), false)
})

test('direct quarantined IDs cannot select or substitute a different motion', () => {
	const selected = ['motion.interaction.greet-bow', 'motion.kinetic.walking']
	const rejected = resolveAuthoringMotionSelection(selected)
	assert.equal(rejected.ok, false)
	assert.deepEqual(rejected.selectedMotionIds, selected)
	assert.deepEqual(rejected.errors.map(error => error.code), ['MOTION_NOT_EXECUTABLE', 'MOTION_NOT_EXECUTABLE'])
})
