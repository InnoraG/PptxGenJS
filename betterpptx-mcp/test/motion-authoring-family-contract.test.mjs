import assert from 'node:assert/strict'
import test from 'node:test'

import { applyCatalogTruth, classifyCatalogEntry } from '../capability-truth.mjs'
import { MOTION_AUTHORING_FAMILY_CONTRACT, motionAuthoringFamilyCapabilityContractForEntry } from '../motion-authoring-family-contract.mjs'

test('concrete animation, motion-path, Morph, and motion-family rows use one exact contract', () => {
	for (const category of ['Transitions', 'Morph Semantics', 'Animations entrance', 'Animations exit', 'Animations emphasis', 'Animations media', 'Animations motion', 'Motion Paths', 'Animation Semantics']) {
		const entry = { id: `test-${category}`, sourceKind: 'capability-row', family: 'motion-transitions-morph', category, publicName: category === 'Transitions' ? 'fade' : category }
		assert.equal(motionAuthoringFamilyCapabilityContractForEntry(entry), MOTION_AUTHORING_FAMILY_CONTRACT)
		assert.equal(applyCatalogTruth(entry).capabilityStatus, 'executable-exact-structured')
	}
	for (const [category, label] of [['MCP Product Surface', 'betterpptx-mcp.object.apply_animation'], ['MCP Product Surface', 'betterpptx-mcp.object.apply_motion_path'], ['Slide Authoring', 'add animation group']]) {
		assert.equal(classifyCatalogEntry({ id: `test-${label}`, sourceKind: 'capability-row', family: 'motion-transitions-morph', category, publicName: label }).capabilityStatus, 'executable-exact-structured')
	}
})

test('the authoring-family aggregate exposes typed timing, reset, and combination metadata', () => {
	assert.equal(MOTION_AUTHORING_FAMILY_CONTRACT.capabilityMode, 'preset-plus-parameters')
	assert.equal(MOTION_AUTHORING_FAMILY_CONTRACT.capabilityStatus, 'executable-exact-structured')
	assert.equal(MOTION_AUTHORING_FAMILY_CONTRACT.publicSchema.additionalProperties, false)
	assert.ok(MOTION_AUTHORING_FAMILY_CONTRACT.overrideFields.includes('duration'))
	assert.ok(MOTION_AUTHORING_FAMILY_CONTRACT.resetBehavior.component.includes('null'))
	assert.ok(MOTION_AUTHORING_FAMILY_CONTRACT.legalCombinations.length >= 3)
})

test('transition ribbon gallery rows stay in their narrower residual unit', () => {
	const entry = { id: 'ribbon', sourceKind: 'native-gallery-style', family: 'motion-transitions-morph', label: 'Fade -> transition-ribbon-001' }
	assert.equal(motionAuthoringFamilyCapabilityContractForEntry(entry), null)
})

