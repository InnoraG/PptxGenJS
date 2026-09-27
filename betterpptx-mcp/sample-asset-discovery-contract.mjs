// Public-safe contract for the two bundled media fixtures that are exposed by
// the asset catalog.  A fixture is a discovery resource, not a persisted
// PowerPoint style or authoring field; the owning image/media operation keeps
// the actual source and package lifecycle semantics.

const ROW_RECORDS = Object.freeze([
	Object.freeze({ id: 'cap_8fde26929b89a17dec2d', label: 'bundled sample image' }),
	Object.freeze({ id: 'cap_96b33f7237875a4a33c9', label: 'bundled sample audio' }),
])

const ROW_IDS = Object.freeze(ROW_RECORDS.map(row => row.id))
const ROW_ID_SET = new Set(ROW_IDS)
const LABEL_SET = new Set(ROW_RECORDS.map(row => row.label))

const NOT_APPLICABLE_RESET = Object.freeze({
	component: 'not-applicable',
	full: 'not-applicable',
	nullBehavior: 'not-applicable',
})

export const SAMPLE_ASSET_DISCOVERY_CONTRACT = Object.freeze({
	id: 'sampleAssetDiscovery',
	schemaVersion: 'betterpptx.sample-asset-discovery-contract.v1',
	capabilityMode: 'discrete',
	capabilityStatus: 'not-live-in-saved-package',
	runtimeReady: false,
	componentOwnership: Object.freeze(['public.sampleAssetDiscovery']),
	overrideFields: Object.freeze([]),
	resetBehavior: NOT_APPLICABLE_RESET,
	precedence: Object.freeze(['asset discovery', 'owning image/media authoring contract']),
	legalCombinations: Object.freeze(['sample discovery followed by semantic image or media authoring']),
	applicability: Object.freeze(['bundled image fixture', 'bundled audio fixture', 'catalog discovery before semantic authoring']),
	limitation: 'The bundled fixture is an opaque catalog choice only; it is not serialized as a standalone saved-package capability and has no independent reset or style state.',
	rowIds: ROW_IDS,
})

export const SAMPLE_ASSET_DISCOVERY_ROW_IDS = ROW_IDS

export function sampleAssetDiscoveryCapabilityContractForEntry(entry = {}) {
	if (entry.sourceKind !== 'capability-row') return null
	// public-baseline-catalog intentionally projects category away from its
	// public entries, so accept its stable capability-catalog source marker as
	// the second half of the scope guard.  The exact opaque IDs remain required.
	if (entry.category !== 'Sample Object Library' && entry.source !== 'capability-catalog') return null
	const label = String(entry.publicName || entry.label || '').trim()
	return ROW_ID_SET.has(String(entry.id || '')) || LABEL_SET.has(label)
		? SAMPLE_ASSET_DISCOVERY_CONTRACT
		: null
}
