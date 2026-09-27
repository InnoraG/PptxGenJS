// Canonical public selector contract for the thirty native slide-layout tiles.
// This module deliberately owns only slides[].layoutPresetId. Theme/master
// selectors and editable template-carrier fields have separate contracts.

const OFFICE_LAYOUT_NAMES = Object.freeze([
	'Title Slide',
	'Title and Content',
	'Section Header',
	'Two Content',
	'Comparison',
	'Title Only',
	'Blank',
	'Content with Caption',
	'Picture with Caption',
	'Title and Vertical Text',
	'Vertical Title and Text',
])

const CORPORATE_LAYOUT_NAMES = Object.freeze([
	...OFFICE_LAYOUT_NAMES,
	'CORP_TITLE_HERO_LOCKED',
	'CORP_SECTION_DIVIDER_LOCKED',
	'CORP_TITLE_CONTENT_SAFE',
	'CORP_TWO_COLUMN_COMPARE',
	'CORP_IMAGE_WITH_CAPTION',
	'CORP_DASHBOARD_METRICS',
	'CORP_QUOTE_STATEMENT',
	'CORP_APPENDIX_DENSE',
])

export const LAYOUT_PRESET_RESOURCE_CONTRACTS = Object.freeze({
	'office-baseline-wide': Object.freeze({
		resourceKey: 'office-baseline-wide',
		templatePresetId: 'template-office-baseline-wide-001',
		defaultLayout: 'Title and Content',
		themeId: 'theme-office-001',
		masterId: 'master-office-baseline-wide-001',
	}),
	'corporate-reference-wide': Object.freeze({
		resourceKey: 'corporate-reference-wide',
		templatePresetId: 'template-corporate-reference-wide-001',
		defaultLayout: 'CORP_TITLE_CONTENT_SAFE',
		themeId: 'theme-office-001',
		masterId: 'master-corporate-reference-wide-001',
	}),
})

function rowsFor(resourceKey, names, idPrefix) {
	const resource = LAYOUT_PRESET_RESOURCE_CONTRACTS[resourceKey]
	return names.map((layoutName, index) => Object.freeze({
		id: `${idPrefix}-${String(index + 1).padStart(3, '0')}`,
		layoutName,
		tileIndex: index + 1,
		resourceKey,
		templatePresetId: resource.templatePresetId,
		defaultLayout: resource.defaultLayout,
		themeId: resource.themeId,
		masterId: resource.masterId,
		parameter: 'slides[].layoutPresetId',
	}))
}

export const LAYOUT_PRESET_CONTRACT_ROWS = Object.freeze([
	...rowsFor('office-baseline-wide', OFFICE_LAYOUT_NAMES, 'layout-office-baseline-wide'),
	...rowsFor('corporate-reference-wide', CORPORATE_LAYOUT_NAMES, 'layout-corporate-reference-wide'),
])

const ROW_BY_ID = new Map(LAYOUT_PRESET_CONTRACT_ROWS.map(row => [row.id, row]))

export function layoutPresetContractById(id) {
	return ROW_BY_ID.get(String(id || '')) || null
}

export function layoutPresetResourceContractByTemplatePresetId(id) {
	const value = String(id || '')
	return Object.values(LAYOUT_PRESET_RESOURCE_CONTRACTS).find(resource => resource.templatePresetId === value) || null
}

function layoutPresetIdForCatalogEntry(entry = {}) {
	if (ROW_BY_ID.has(String(entry.id || ''))) return String(entry.id)
	const match = String(entry.label || '').match(/->\s*(layout-[a-z0-9-]+)/i)
	return match && ROW_BY_ID.has(match[1]) ? match[1] : null
}

export function layoutPresetCapabilityContractForEntry(entry = {}) {
	const presetId = layoutPresetIdForCatalogEntry(entry)
	if (!presetId) return null
	return Object.freeze({
		presetId,
		capabilityMode: 'discrete',
		capabilityStatus: 'executable-exact-structured',
		componentOwnership: Object.freeze(['layoutSelection', 'layoutToMasterBinding', 'placeholderInheritance', 'templateCarrier']),
		overrideFields: Object.freeze(['slides[].layoutPresetId']),
		resetBehavior: Object.freeze({
			component: 'set slides[].layoutPresetId to null',
			full: 'set slides[].layoutPresetId to null',
			nullBehavior: 'bind the selected template resource default layout and clear the explicit layout selector',
		}),
		precedence: Object.freeze([
			'layoutPresetId and layoutName must identify the same native layout when both are present',
			'layoutPresetId selects the exact layout relationship and therefore takes precedence over masterName',
		]),
		legalCombinations: Object.freeze([
			'multiple slides may choose different layoutPresetId values from the same template resource',
			'a same-resource layoutPresetId may be re-edited or reset without reloading the template',
			'cross-resource layoutPresetId changes on an existing deck fail closed',
		]),
	})
}
