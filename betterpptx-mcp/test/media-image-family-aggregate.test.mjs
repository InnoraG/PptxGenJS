import assert from 'node:assert/strict'
import test from 'node:test'

import { applyCatalogTruth } from '../capability-truth.mjs'
import {
	MEDIA_IMAGE_FAMILY_AGGREGATE_CHILD_CONTRACTS,
	MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT,
	MEDIA_IMAGE_FAMILY_AGGREGATE_ROW_ID,
	mediaImageFamilyAggregateCapabilityContractForEntry,
	validateMediaImageFamilyAggregateDescriptor,
} from '../media-image-family-aggregate-contract.mjs'
import { ADD_IMAGE_OPERATION_CONTRACT } from '../layout-image-entry-contract.mjs'
import { ADD_MEDIA_OPERATION_CONTRACT } from '../layout-media-entry-contract.mjs'
import { publicBaselineCatalog } from '../public-baseline-catalog.mjs'

function catalogEntry() {
	return publicBaselineCatalog({ family: 'media-images-avatar', includePlanned: true, limit: 500 })
		.entries.find(entry => entry.id === MEDIA_IMAGE_FAMILY_AGGREGATE_ROW_ID)
}

test('media/image family aggregate is derived from canonical exact authoring operations', () => {
	assert.equal(MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.runtimeReady, true)
	assert.equal(MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.capabilityStatus, 'executable-exact-structured')
	assert.deepEqual(MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.rowIds, [MEDIA_IMAGE_FAMILY_AGGREGATE_ROW_ID])
	assert.equal(MEDIA_IMAGE_FAMILY_AGGREGATE_CHILD_CONTRACTS.length, 3)
	assert.ok(MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.childContractIds.includes(ADD_IMAGE_OPERATION_CONTRACT.id))
	assert.ok(MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.childContractIds.includes(ADD_MEDIA_OPERATION_CONTRACT.id))
	assert.ok(MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.childContractIds.includes('narrationAndVoiceArtifact'))
	assert.ok(MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.componentOwnership.includes('picture.assetSource'))
	assert.ok(MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.componentOwnership.includes('media.packageRelationships'))
	assert.ok(MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.overrideFields.includes('content[].imageOptions.imageAdjustments'))
	assert.ok(MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.overrideFields.includes('content[].mediaOptions.closedCaptionTracks'))
	assert.ok(MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.overrideFields.includes('content[kind:narration].text'))
	assert.equal(MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.overrideFields.includes('source'), false)
	assert.equal(MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.overrideFields.includes('transparency'), false)
})

test('real authoring-family catalog row resolves through the aggregate instead of the partial family fallback', () => {
	const entry = catalogEntry()
	assert.ok(entry)
	assert.equal(entry.sourceKind, 'authoring-family')
	assert.equal(entry.status, 'external-gates-pending')
	assert.equal(entry.capabilityMode, 'preset-plus-parameters')
	assert.equal(entry.capabilityStatus, 'executable-exact-structured')
	assert.deepEqual(entry.componentOwnership, MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.componentOwnership)
	assert.deepEqual(entry.overrideFields, MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.overrideFields)
	assert.equal(entry.route.exactSelection, 'betterpptx.deck.generate_from_spec')
	assert.deepEqual(entry.route.composition, ['betterpptx.deck.generate_from_spec'])
	assert.ok(entry.route.discovery.includes('betterpptx.assets.upload'))
	assert.ok(entry.route.discovery.includes('betterpptx.assets.search_stock'))
	assert.equal(entry.route.discovery.includes('betterpptx.assets.generate_image'), false)
	assert.ok(entry.route.discovery.includes('betterpptx.narration.voices'))
	const direct = mediaImageFamilyAggregateCapabilityContractForEntry(entry)
	assert.equal(direct.id, MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.id)
	assert.deepEqual(direct.childContractIds, MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.childContractIds)
	assert.equal(applyCatalogTruth(entry).capabilityStatus, 'executable-exact-structured')
})

test('aggregate descriptor is closed and delegates authoring/reset semantics to typed children', () => {
	assert.equal(MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.publicSchema.additionalProperties, false)
	assert.equal(MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.publicSchema.properties.kind.const, 'familyAggregate')
	assert.equal(MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.publicSchema.properties.family.const, 'media-images-avatar')
	assert.deepEqual(
		validateMediaImageFamilyAggregateDescriptor({ kind: 'familyAggregate', family: 'media-images-avatar' }),
		{ kind: 'familyAggregate', family: 'media-images-avatar' },
	)
	assert.throws(() => validateMediaImageFamilyAggregateDescriptor({ kind: 'familyAggregate', family: 'charts' }), /must be media-images-avatar/)
	assert.throws(() => validateMediaImageFamilyAggregateDescriptor({ kind: 'familyAggregate', family: 'media-images-avatar', rawPackagePath: 'private' }), /not part of the public/)
	assert.match(MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.resetBehavior.component, /child contract reset/)
	assert.ok(MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT.legalCombinations.some(value => /pictures, media, and narration/i.test(value)))
})
