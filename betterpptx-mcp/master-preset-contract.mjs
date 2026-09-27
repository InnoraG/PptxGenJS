// Canonical public selector contract for the two frozen native slide-master
// resources. These rows select an immutable bundled master and its native
// layout relationship graph; they do not imply arbitrary master editing.

import { LAYOUT_PRESET_RESOURCE_CONTRACTS } from './layout-preset-contract.mjs'

export const MASTER_PRESET_CONTRACT_ROWS = Object.freeze(
	Object.values(LAYOUT_PRESET_RESOURCE_CONTRACTS).map((resource, index) => Object.freeze({
		id: resource.masterId,
		tileIndex: index + 1,
		resourceKey: resource.resourceKey,
		templatePresetId: resource.templatePresetId,
		themeId: resource.themeId,
		defaultLayout: resource.defaultLayout,
		parameter: 'masterPresetId',
	})),
)

const ROW_BY_ID = new Map(MASTER_PRESET_CONTRACT_ROWS.map(row => [row.id, row]))

export function masterPresetContractById(id) {
	return ROW_BY_ID.get(String(id || '')) || null
}

export function masterPresetIdForCatalogEntry(entry = {}) {
	if (ROW_BY_ID.has(String(entry.id || ''))) return String(entry.id)
	const match = String(entry.label || '').match(/->\s*(master-[a-z0-9-]+)/i)
	return match && ROW_BY_ID.has(match[1]) ? match[1] : null
}

export function masterPresetCapabilityContractForEntry(entry = {}) {
	const presetId = masterPresetIdForCatalogEntry(entry)
	if (!presetId) return null
	return Object.freeze({
		presetId,
		capabilityMode: 'discrete',
		capabilityStatus: 'executable-exact-structured',
		componentOwnership: Object.freeze(['masterSelection', 'layoutCollection', 'layoutToMasterBindings', 'templateCarrier', 'relationshipGraph']),
		overrideFields: Object.freeze(['masterPresetId']),
		resetBehavior: Object.freeze({
			component: 'not applicable: the master resource is immutable for an existing deck',
			full: 'createNew or replaceDeck without this selector, or select the replacement master there',
			nullBehavior: 'null is rejected; an existing native master relationship graph is never detached in place',
		}),
		precedence: Object.freeze([
			'masterPresetId and template.templatePresetId must resolve to the same bundled resource when both are supplied',
			'every slides[].layoutPresetId must belong to the selected master resource',
		]),
		legalCombinations: Object.freeze([
			'the selected master may be combined with any number of same-resource layoutPresetId values',
			'the same masterPresetId may be replayed, exported, and recompiled without changing resource identity',
			'null, unknown, conflicting, mixed-resource, and cross-resource patch selections fail closed',
		]),
	})
}
