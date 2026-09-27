import assert from 'node:assert/strict'
import test from 'node:test'

import { applyCatalogTruth, classifyCatalogEntry } from '../capability-truth.mjs'
import { TRANSITION_GALLERY_CONTRACT, transitionGalleryCapabilityContractForEntry } from '../transition-gallery-contract.mjs'

test('captured Transition Ribbon tiles are exact selector bases', () => {
	for (const label of ['Fade -> transition-ribbon-001', 'Wheel -> transition-ribbon-004', 'Morph -> transition-ribbon-049']) {
		const entry = { sourceKind: 'native-gallery-style', family: 'motion-transitions-morph', label }
		assert.equal(transitionGalleryCapabilityContractForEntry(entry), TRANSITION_GALLERY_CONTRACT)
		assert.equal(applyCatalogTruth(entry).capabilityStatus, 'executable-exact-structured')
	}
})

test('Transition Ribbon contract keeps typed overrides and null reset semantics', () => {
	assert.equal(TRANSITION_GALLERY_CONTRACT.capabilityMode, 'preset-plus-parameters')
	assert.equal(TRANSITION_GALLERY_CONTRACT.overrideFields.length, 9)
	assert.ok(TRANSITION_GALLERY_CONTRACT.overrideFields.includes('spokes'))
	assert.ok(TRANSITION_GALLERY_CONTRACT.resetBehavior.full.includes('transitionPresetId'))
	assert.ok(TRANSITION_GALLERY_CONTRACT.precedence.length >= 3)
})

test('non-Ribbon gallery rows remain on their owning gallery contract', () => {
	assert.equal(transitionGalleryCapabilityContractForEntry({ sourceKind: 'native-gallery-style', family: 'motion-transitions-morph', label: 'Fade -> shape-style-001' }), null)
	const truth = classifyCatalogEntry({ sourceKind: 'native-gallery-style', family: 'motion-transitions-morph', label: 'Fade -> shape-style-001' })
	assert.equal(truth.capabilityStatus, 'executable-exact-structured')
	assert.ok(!truth.componentOwnership.includes('transitionEffect'))
})
