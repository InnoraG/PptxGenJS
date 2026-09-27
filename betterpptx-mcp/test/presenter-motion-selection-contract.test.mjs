import assert from 'node:assert/strict'
import test from 'node:test'

import { applyCatalogTruth } from '../capability-truth.mjs'
import { authoringMotionCatalog, publicAuthoringMotionCatalog, resolveAuthoringMotionSelection, resolveAuthoringMotionSelectionForCatalog } from '../ir/authoring-motion-catalog.mjs'
import { listAuthoringCapabilities } from '../authoring-capability-registry.mjs'
import { unavailableMotionCatalogFixture } from './fixtures/unavailable-motion-catalog.mjs'
import {
	PRESENTER_MOTION_SELECTION_EXACT_CONTRACT,
	PRESENTER_MOTION_SELECTION_HELD_CONTRACT,
	presenterMotionSelectionCapabilityContractForEntry,
	validatePresenterMotionSelection,
} from '../presenter-motion-selection-contract.mjs'

test('the 96-row catalog exposes only currently executable Mixamo motions', () => {
	const catalog = publicAuthoringMotionCatalog({ family: 'motion', includePlanned: true, limit: 200 })
	const entries = catalog.motions.filter(entry => entry.availability !== 'PLANNED_NOT_SELECTABLE')
	assert.equal(entries.length, 96)
	const exact = entries.filter(entry => entry.selectable !== false).map(entry => ({ ...entry, sourceKind: 'semantic-presenter-motion', family: 'presenter-motion' }))
	const held = entries.filter(entry => entry.selectable === false).map(entry => ({ ...entry, sourceKind: 'semantic-presenter-motion', family: 'presenter-motion' }))
	assert.equal(exact.length, 56)
	assert.equal(held.length, 40)
	for (const entry of exact) {
		assert.equal(presenterMotionSelectionCapabilityContractForEntry(entry), PRESENTER_MOTION_SELECTION_EXACT_CONTRACT)
		assert.equal(applyCatalogTruth(entry).capabilityStatus, 'executable-exact-structured')
	}
	for (const entry of held) {
		assert.equal(presenterMotionSelectionCapabilityContractForEntry(entry), PRESENTER_MOTION_SELECTION_HELD_CONTRACT)
		assert.equal(applyCatalogTruth(entry).capabilityStatus, 'not-applicable')
	}
})

test('controlled unavailable and playback-held rows still fail the runtime selection gate', () => {
	const catalog = authoringMotionCatalog()
	const motionId = 'motion.ordinary.enumerate'
	const current = resolveAuthoringMotionSelection([motionId])
	assert.equal(current.ok, true, 'the current separately proven replacement is selectable')
	assert.deepEqual(current, resolveAuthoringMotionSelectionForCatalog(catalog, [motionId]), 'the runtime delegates to the tested pure selection gate')
	for (const state of ['PLANNED_NOT_SELECTABLE', 'IMPLEMENTED_NOT_SELECTABLE']) {
		const fixture = unavailableMotionCatalogFixture(catalog, motionId, state)
		const rejected = resolveAuthoringMotionSelectionForCatalog(fixture, [motionId])
		assert.equal(rejected.ok, false)
		assert.equal(rejected.errors[0]?.code, 'MOTION_NOT_EXECUTABLE')
		assert.deepEqual(rejected.selectedMotionIds, [motionId], 'the rejected selection is not silently substituted')
		const held = { id: motionId, sourceKind: 'semantic-presenter-motion', family: 'presenter-motion', selectable: false, availability: state }
		assert.equal(presenterMotionSelectionCapabilityContractForEntry(held), PRESENTER_MOTION_SELECTION_HELD_CONTRACT)
		assert.equal(applyCatalogTruth(held).capabilityStatus, 'not-applicable')
	}
	assert.equal(authoringMotionCatalog().inventory.selectable, 56, 'negative fixtures do not change the live catalog')
})

test('capability discovery derives motion availability from the current governed catalog', () => {
	const capability = listAuthoringCapabilities({ family: 'presenter-motion' })[0]
	assert.equal(capability.evidence.trackedMotionRows, 96)
	assert.equal(capability.evidence.executableMotionRows, 56)
	assert.equal(capability.evidence.unavailableMotionRows, 40)
	assert.equal(capability.evidence.dedicatedInteractionStatus, 'NOT_EXECUTABLE')
	assert.ok(capability.issues.some(issue => /40 catalog motion rows are unavailable/.test(issue)))
})

test('presenter selection validates bounded semantic IDs and keeps private realization out', () => {
	const selected = validatePresenterMotionSelection({ presenterId: 'host', selectedMotionIds: ['motion.ordinary.talk', 'motion.kinetic.sprint'], motionId: 'motion.kinetic.sprint', duration: 2200, delay: null })
	assert.deepEqual(selected.selectedMotionIds, ['motion.ordinary.talk', 'motion.kinetic.sprint'])
	assert.equal(selected.delay, null)
	assert.ok(PRESENTER_MOTION_SELECTION_EXACT_CONTRACT.resetBehavior.component.includes('null'))
	assert.throws(() => validatePresenterMotionSelection({ selectedMotionIds: ['motion.ordinary.talk', 'motion.ordinary.talk'] }), /unique semantic/)
	assert.throws(() => validatePresenterMotionSelection({ selectedMotionIds: ['motion.ordinary.talk', 'C:\\secret.glb'] }), /semantic motion/)
	assert.throws(() => validatePresenterMotionSelection({ selectedMotionIds: Array.from({ length: 19 }, (_, i) => `motion.kinetic.clip-${i}`) }), /1 to 18/)
})
