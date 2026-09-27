import assert from 'node:assert/strict'
import test from 'node:test'

import { applyCatalogTruth } from '../capability-truth.mjs'
import {
	LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CHILD_CONTRACTS,
	LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CONTRACT,
	LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_ROW_ID,
	LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_UNIT_ID,
	layoutThemeMasterFamilyAggregateCapabilityContractForEntry,
	validateLayoutThemeMasterFamilyAggregateDescriptor,
} from '../layout-theme-master-family-aggregate-contract.mjs'
import { LAYOUT_THEME_MASTER_INHERITANCE_CONTRACT } from '../layout-theme-master-inheritance-contract.mjs'
import { MULTIPLE_SLIDE_MASTERS_CONTRACT } from '../multiple-slide-masters-contract.mjs'
import { publicBaselineCatalog } from '../public-baseline-catalog.mjs'

function catalogEntries() {
	return publicBaselineCatalog({ family: 'layouts-themes-masters', includePlanned: true, limit: 500 }).entries
}

test('layout/theme/master family aggregate is derived from the exact bounded native inheritance contract', () => {
	assert.equal(LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_UNIT_ID, 'impl-b-26ea0c88fdeb335a')
	assert.equal(LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_ROW_ID, 'cap_d35d4ae0cb2a0a5f78db')
	assert.equal(LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CONTRACT.runtimeReady, true)
	assert.equal(LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CONTRACT.capabilityStatus, 'executable-exact-structured')
	assert.deepEqual(LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CONTRACT.rowIds, [LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_ROW_ID])
	assert.deepEqual(LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CHILD_CONTRACTS, [LAYOUT_THEME_MASTER_INHERITANCE_CONTRACT, MULTIPLE_SLIDE_MASTERS_CONTRACT])
	assert.deepEqual(LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CONTRACT.childContractIds, [LAYOUT_THEME_MASTER_INHERITANCE_CONTRACT.id, MULTIPLE_SLIDE_MASTERS_CONTRACT.id])
	assert.ok(LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CONTRACT.componentOwnership.includes('catalog.familyAggregate'))
	assert.ok(LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CONTRACT.overrideFields.includes('theme.colorScheme.*'))
	assert.ok(LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CONTRACT.overrideFields.includes('layouts[].masterName'))
	assert.ok(LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CONTRACT.overrideFields.includes('slides[].showMasterBackground'))
	assert.ok(LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CONTRACT.overrideFields.includes('template.templatePresetId'))
	assert.ok(LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CONTRACT.overrideFields.includes('patchPlan.templateCarriers'))
	assert.match(LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CONTRACT.scope, /up to thirty-two newly authored physical slide masters/)
})

test('real authoring-family catalog row exposes the exact JSON-spec route including multiple masters', () => {
	const entries = catalogEntries()
	const entry = entries.find(item => item.id === LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_ROW_ID)
	assert.ok(entry)
	assert.equal(entry.sourceKind, 'authoring-family')
	assert.equal(entry.capabilityMode, 'parameterized')
	assert.equal(entry.capabilityStatus, 'executable-exact-structured')
	assert.equal(entry.selection.semanticKind, 'layoutThemeMaster')
	assert.deepEqual(entry.selection.executableValue, { kind: 'familyAggregate', family: 'layouts-themes-masters' })
	assert.equal(entry.selection.semanticPath, 'theme|masters[]|layouts[]|slides[].layoutName|slides[].masterName')
	assert.equal(entry.route.exactSelection, 'betterpptx.deck.generate_from_spec')
	assert.deepEqual(entry.route.composition, ['betterpptx.deck.generate_from_spec'])
	assert.deepEqual(entry.componentOwnership, LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CONTRACT.componentOwnership)
	assert.deepEqual(entry.overrideFields, LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CONTRACT.overrideFields)
	assert.equal(layoutThemeMasterFamilyAggregateCapabilityContractForEntry(entry), LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CONTRACT)
	assert.equal(applyCatalogTruth(entry).capabilityStatus, 'executable-exact-structured')

	const multiple = entries.find(item => String(item.label).trim().toLowerCase() === 'multiple slide masters')
	assert.ok(multiple)
	assert.equal(multiple.capabilityStatus, 'executable-exact-structured')
})

test('aggregate descriptor is closed and delegates reset and composition semantics to its child', () => {
	assert.equal(LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CONTRACT.publicSchema.additionalProperties, false)
	assert.deepEqual(
		validateLayoutThemeMasterFamilyAggregateDescriptor({ kind: 'familyAggregate', family: 'layouts-themes-masters' }),
		{ kind: 'familyAggregate', family: 'layouts-themes-masters' },
	)
	assert.throws(() => validateLayoutThemeMasterFamilyAggregateDescriptor({ kind: 'familyAggregate', family: 'charts' }), /must be layouts-themes-masters/)
	assert.throws(() => validateLayoutThemeMasterFamilyAggregateDescriptor({ kind: 'familyAggregate', family: 'layouts-themes-masters', sourcePart: 'private' }), /not part of the public/)
	assert.match(LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CONTRACT.resetBehavior.component, /child contract reset/)
	assert.ok(LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CONTRACT.precedence.length >= 4)
	assert.ok(LAYOUT_THEME_MASTER_FAMILY_AGGREGATE_CONTRACT.legalCombinations.length >= 4)
})
