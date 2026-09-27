import assert from 'node:assert/strict'
import test from 'node:test'

import {
	SAMPLE_ASSET_DISCOVERY_CONTRACT,
	SAMPLE_ASSET_DISCOVERY_ROW_IDS,
	sampleAssetDiscoveryCapabilityContractForEntry,
} from '../sample-asset-discovery-contract.mjs'
import { applyCatalogTruth, classifyCatalogEntry } from '../capability-truth.mjs'

test('bundled sample image and audio rows use the discrete discovery contract', () => {
	assert.deepEqual([...SAMPLE_ASSET_DISCOVERY_ROW_IDS].sort(), [
		'cap_8fde26929b89a17dec2d',
		'cap_96b33f7237875a4a33c9',
	].sort())
	for (const [id, label] of [
		['cap_8fde26929b89a17dec2d', 'bundled sample image'],
		['cap_96b33f7237875a4a33c9', 'bundled sample audio'],
	]) {
		const entry = { id, sourceKind: 'capability-row', source: 'capability-catalog', family: 'media-images-avatar', publicName: label }
		assert.equal(sampleAssetDiscoveryCapabilityContractForEntry(entry), SAMPLE_ASSET_DISCOVERY_CONTRACT)
		const truth = applyCatalogTruth(entry)
		assert.equal(truth.capabilityMode, 'discrete')
		assert.equal(truth.capabilityStatus, 'not-live-in-saved-package')
		assert.deepEqual(truth.componentOwnership, ['public.sampleAssetDiscovery'])
		assert.deepEqual(truth.overrideFields, [])
		assert.deepEqual(truth.resetBehavior, { component: 'not-applicable', full: 'not-applicable', nullBehavior: 'not-applicable' })
	}
})

test('sample discovery stays scoped to the source ledger category', () => {
	assert.equal(sampleAssetDiscoveryCapabilityContractForEntry({
		id: 'cap_8fde26929b89a17dec2d', sourceKind: 'capability-row', family: 'media-images-avatar', label: 'bundled sample image',
	}), null)
	assert.equal(classifyCatalogEntry({
		id: 'cap_8fde26929b89a17dec2d', sourceKind: 'capability-row', family: 'media-images-avatar', label: 'bundled sample image',
	}).capabilityStatus, 'missing')
})
