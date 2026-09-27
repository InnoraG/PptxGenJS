// Exact public truth for the layouts/themes/masters authoring-family entry.
// The aggregate owns no package payload of its own. It becomes executable only
// when the bounded native inheritance and ordered physical-master collection
// contracts beneath it are exact; broader preset galleries and imported raw
// carrier editing remain independently classified rows.

import { LAYOUT_THEME_MASTER_INHERITANCE_CONTRACT } from './layout-theme-master-inheritance-contract.mjs'
import { MULTIPLE_SLIDE_MASTERS_CONTRACT } from './multiple-slide-masters-contract.mjs'

export const LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_UNIT_ID = 'impl-b-26ea0c88fdeb335a'
export const LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_ROW_ID = 'cap_d35d4ae0cb2a0a5f78db'

export const LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_SCHEMA = Object.freeze({
	type: 'object',
	required: Object.freeze(['kind', 'family']),
	additionalProperties: false,
	properties: Object.freeze({
		kind: Object.freeze({ const: 'familyAggregate' }),
		family: Object.freeze({ const: 'layouts-themes-masters' }),
	}),
})

export const LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CHILD_CONTRACTS = Object.freeze([
	LAYOUT_THEME_MASTER_INHERITANCE_CONTRACT,
	MULTIPLE_SLIDE_MASTERS_CONTRACT,
])

const runtimeReady = LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CHILD_CONTRACTS.every(contract =>
	contract.capabilityStatus === 'executable-exact-structured' && contract.runtimeReady !== false,
)

export const LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CONTRACT = Object.freeze({
	id: 'layoutThemeMasterFamilyAggregate',
	schemaVersion: 'betterpptx.layout-theme-master-family-aggregate.v1',
	unitId: LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_UNIT_ID,
	rowIds: Object.freeze([LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_ROW_ID]),
	capabilityMode: 'parameterized',
	capabilityStatus: runtimeReady ? 'executable-exact-structured' : 'structured-partial',
	targetCapabilityStatus: 'executable-exact-structured',
	runtimeReady,
	scope: 'an ordered collection of up to thirty-two newly authored physical slide masters with any number of explicitly bound layouts, one semantic deck theme, native inheritance, semantic slide bindings, an exact bundled template selector, and sparse edits or resets of existing named imported carriers; gallery enumeration remains independently classified',
	componentOwnership: Object.freeze([...new Set([
		'catalog.familyAggregate',
		'template.templatePresetId owns bundled template resource selection without exposing package identity',
		'patchPlan.templateCarriers owns sparse edits and source-baseline reset of existing named imported layout/master carriers',
		...LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CHILD_CONTRACTS.flatMap(contract => contract.componentOwnership || []),
	])]),
	overrideFields: Object.freeze([...new Set(
		[
			'template.templatePresetId',
			'patchPlan.templateCarriers',
			...LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CHILD_CONTRACTS.flatMap(contract => contract.overrideFields || []),
		],
	)]),
	resetBehavior: Object.freeze({
		component: 'apply the native inheritance child contract reset for the selected field, or reset an existing named imported template carrier to its captured source baseline',
		full: 'set theme, layouts, and masters to null to restore imported/default structure, or use empty authored collections where the child contract permits them',
		nullBehavior: 'null is interpreted by the selected child field; omission preserves current state and sibling inheritance components',
	}),
	precedence: Object.freeze([
		'bundled template.templatePresetId resolves the native source graph before authored theme/master/layout overrides are applied',
		...LAYOUT_THEME_MASTER_INHERITANCE_CONTRACT.precedence,
		...MULTIPLE_SLIDE_MASTERS_CONTRACT.precedence,
		'patchPlan.templateCarriers targets only an existing named imported carrier; unknown names fail before deck mutation and reset restores its captured source baseline',
	]),
	legalCombinations: Object.freeze([
		...LAYOUT_THEME_MASTER_INHERITANCE_CONTRACT.legalCombinations,
		...MULTIPLE_SLIDE_MASTERS_CONTRACT.legalCombinations,
		'a bundled template selector may provide the source graph while same-resource semantic layout/master bindings remain explicit',
		'an existing imported layout or master carrier may receive a sparse native edit or source-baseline reset independently of authored physical-master collection changes',
	]),
	publicSchema: LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_SCHEMA,
	childContractIds: Object.freeze(LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CHILD_CONTRACTS.map(contract => contract.id)),
})

export function layoutThemeMasterFamilyAggregateCapabilityContractForEntry(entry = {}) {
	if (entry.id !== LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_ROW_ID || entry.family !== 'layouts-themes-masters') return null
	return LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CONTRACT
}

export function validateLayoutThemeMasterFamilyAggregateDescriptor(value, path = 'layoutThemeMasterFamilyAggregate') {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`)
	for (const key of Object.keys(value)) if (!['kind', 'family'].includes(key)) throw new Error(`${path}.${key} is not part of the public layout/theme/master family aggregate contract.`)
	if (value.kind !== 'familyAggregate') throw new Error(`${path}.kind must be familyAggregate.`)
	if (value.family !== 'layouts-themes-masters') throw new Error(`${path}.family must be layouts-themes-masters.`)
	return { ...value }
}
