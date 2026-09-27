// Exact catalog truth for the media-images-avatar family aggregate. This row
// owns no OOXML payload of its own: it is executable only when the canonical
// add-image, add-media, and narration operations beneath it are all exact.

import { ADD_IMAGE_OPERATION_CONTRACT } from './layout-image-entry-contract.mjs'
import { ADD_MEDIA_OPERATION_CONTRACT } from './layout-media-entry-contract.mjs'
import { MEDIA_IMAGE_EXACT_CONTRACT_BUCKETS } from './media-image-formatting-contract.mjs'

export const MEDIA_IMAGE_FAMILY_AGGREGATE_ROW_ID = 'cap_7db8092e40c3e870d0a3'

export const MEDIA_IMAGE_FAMILY_AGGREGATE_SCHEMA = Object.freeze({
	type: 'object',
	required: ['kind', 'family'],
	additionalProperties: false,
	properties: Object.freeze({
		kind: { const: 'familyAggregate' },
		family: { const: 'media-images-avatar' },
	}),
})

const NARRATION_OPERATION_CONTRACT = MEDIA_IMAGE_EXACT_CONTRACT_BUCKETS.narrationProvider

export const MEDIA_IMAGE_FAMILY_AGGREGATE_CHILD_CONTRACTS = Object.freeze([
	ADD_IMAGE_OPERATION_CONTRACT,
	ADD_MEDIA_OPERATION_CONTRACT,
	NARRATION_OPERATION_CONTRACT,
])

const runtimeReady = MEDIA_IMAGE_FAMILY_AGGREGATE_CHILD_CONTRACTS.every(contract =>
	contract.capabilityStatus === 'executable-exact-structured' && contract.runtimeReady !== false,
)

const qualifiedNarrationFields = NARRATION_OPERATION_CONTRACT.overrideFields.map(field => `content[kind:narration].${field}`)

export const MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT = Object.freeze({
	id: 'mediaImageFamilyAggregate',
	schemaVersion: 'betterpptx.media-image-family-aggregate.v1',
	capabilityMode: 'preset-plus-parameters',
	capabilityStatus: runtimeReady ? 'executable-exact-structured' : 'structured-partial',
	targetCapabilityStatus: 'executable-exact-structured',
	runtimeReady,
	componentOwnership: Object.freeze([...new Set([
		'catalog.familyAggregate',
		...MEDIA_IMAGE_FAMILY_AGGREGATE_CHILD_CONTRACTS.flatMap(contract => contract.componentOwnership || []),
	])]),
	overrideFields: Object.freeze([...new Set([
		...ADD_IMAGE_OPERATION_CONTRACT.overrideFields,
		...ADD_MEDIA_OPERATION_CONTRACT.overrideFields,
		...qualifiedNarrationFields,
	])]),
	resetBehavior: Object.freeze({
		component: 'apply the selected add-image, add-media, or narration child contract reset',
		full: 'remove the selected native picture/media object or owned narration state with its child operation',
		nullBehavior: 'null is interpreted only by the selected child contract; omission preserves sibling family components',
	}),
	precedence: Object.freeze([
		'authorized source and detected payload signature',
		'selected add-image, add-media, or narration operation contract',
		'engine-owned framing, timing, and package relationships',
		'authored compatible picture/playback/timing/accessibility overrides',
		'sparse child-component reset',
	]),
	legalCombinations: Object.freeze([
		'PNG, JPEG, or SVG picture with contain, cover, or crop framing plus Picture Style, supported adjustments, effects, and accessibility',
		'audio, embedded video, or online media with poster, playback, captions, accessibility, and owned media commands',
		'voice narration synchronized to the same slide timing while retaining native package ownership',
		'pictures, media, and narration together without source, relationship, framing, or timing ownership collisions',
	]),
	rowIds: Object.freeze([MEDIA_IMAGE_FAMILY_AGGREGATE_ROW_ID]),
	publicSchema: MEDIA_IMAGE_FAMILY_AGGREGATE_SCHEMA,
	childContractIds: Object.freeze(MEDIA_IMAGE_FAMILY_AGGREGATE_CHILD_CONTRACTS.map(contract => contract.id)),
})

export function mediaImageFamilyAggregateCapabilityContractForEntry(entry = {}) {
	if (entry.id !== MEDIA_IMAGE_FAMILY_AGGREGATE_ROW_ID || entry.family !== 'media-images-avatar') return null
	return MEDIA_IMAGE_FAMILY_AGGREGATE_CONTRACT
}

export function validateMediaImageFamilyAggregateDescriptor(value, path = 'mediaImageFamilyAggregate') {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
	for (const key of Object.keys(value)) if (!['kind', 'family'].includes(key)) throw new Error(`${path}.${key} is not part of the public media/image family aggregate contract.`)
	if (value.kind !== 'familyAggregate') throw new Error(`${path}.kind must be familyAggregate.`)
	if (value.family !== 'media-images-avatar') throw new Error(`${path}.family must be media-images-avatar.`)
	return { ...value }
}
