// Canonical public selector contract for the frozen semantic Office Theme.
// The semantic ID is shared by the bundled Office-baseline and corporate
// resources; the selected template/master/layout resource owns the concrete
// native theme carrier and therefore the reset baseline.

import { LAYOUT_PRESET_RESOURCE_CONTRACTS } from './layout-preset-contract.mjs'

export const THEME_PRESET_UNIT_ID = 'impl-b-b0d8124a1c74c333'
export const THEME_PRESET_ROW_ID = 'cap_8d27ff2bc65e268f7bc4'
export const OFFICE_THEME_PRESET_ID = 'theme-office-001'

const resources = Object.values(LAYOUT_PRESET_RESOURCE_CONTRACTS)
	.filter(resource => resource.themeId === OFFICE_THEME_PRESET_ID)
	.map(resource => Object.freeze({
		resourceKey: resource.resourceKey,
		templatePresetId: resource.templatePresetId,
		masterPresetId: resource.masterId,
		defaultLayout: resource.defaultLayout,
	}))

export const THEME_PRESET_CONTRACT_ROW = Object.freeze({
	id: OFFICE_THEME_PRESET_ID,
	rowId: THEME_PRESET_ROW_ID,
	label: 'Office Theme',
	parameter: 'themePresetId',
	defaultTemplatePresetId: LAYOUT_PRESET_RESOURCE_CONTRACTS['office-baseline-wide'].templatePresetId,
	resources: Object.freeze(resources),
})

export function themePresetContractById(id) {
	return String(id || '') === OFFICE_THEME_PRESET_ID ? THEME_PRESET_CONTRACT_ROW : null
}

export function themePresetIdForCatalogEntry(entry = {}) {
	if (String(entry.id || '') === THEME_PRESET_ROW_ID) return OFFICE_THEME_PRESET_ID
	const match = String(entry.label || '').match(/->\s*(theme-[a-z0-9-]+)/i)
	return match && themePresetContractById(match[1]) ? match[1] : null
}

export function themePresetCapabilityContractForEntry(entry = {}) {
	const presetId = themePresetIdForCatalogEntry(entry)
	if (!presetId) return null
	return Object.freeze({
		presetId,
		capabilityMode: 'discrete',
		capabilityStatus: 'executable-exact-structured',
		componentOwnership: Object.freeze(['themeSelection', 'templateCarrier', 'inheritedStyles', 'relationshipGraph']),
		overrideFields: Object.freeze(['themePresetId']),
		resetBehavior: Object.freeze({
			component: 'set theme fields or color-scheme slots to null through their independently typed controls',
			full: 'set theme to null to restore the selected resource theme; use createNew or replaceDeck to remove the selector',
			nullBehavior: 'themePresetId null is rejected because patch mode cannot detach a native template carrier',
		}),
		precedence: Object.freeze([
			'explicit template, master, or layout selectors choose the compatible resource carrier; theme-only selection uses the Office-baseline resource',
			'explicit theme font, language, and color fields override the selected resource theme',
			'theme null restores the current selected resource baseline without changing themePresetId or template.templatePresetId',
		]),
		legalCombinations: Object.freeze([
			'theme-office-001 may be combined with either bundled resource because both advertise that semantic theme ID',
			'same-selector patch, export, and replay preserve both semantic theme identity and concrete template resource identity',
			'unknown, null, wrong-kind, incompatible-resource, and unscoped imported-deck patch selections fail closed',
		]),
	})
}
