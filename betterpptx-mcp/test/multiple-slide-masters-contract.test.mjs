import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import Ajv from 'ajv'

import {
	MULTIPLE_SLIDE_MASTERS_CONTRACT,
	MULTIPLE_SLIDE_MASTERS_PUBLIC_SCHEMA,
	MULTIPLE_SLIDE_MASTERS_ROW_ID,
	MULTIPLE_SLIDE_MASTERS_UNIT_ID,
	multipleSlideMastersCapabilityContractForEntry,
} from '../multiple-slide-masters-contract.mjs'
import { applyCatalogTruth } from '../capability-truth.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { publicBaselineCatalog } from '../public-baseline-catalog.mjs'

const deckSchema = JSON.parse(fs.readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
delete deckSchema.$schema
const validateDeck = new Ajv({ allErrors: true, jsonPointers: true, unknownFormats: 'ignore' }).compile(deckSchema)
const validateContract = new Ajv({ allErrors: true, jsonPointers: true, unknownFormats: 'ignore' }).compile(structuredClone(MULTIPLE_SLIDE_MASTERS_PUBLIC_SCHEMA))

function spec(overrides = {}) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Two physical masters', layout: 'LAYOUT_WIDE',
		motionTime: { masterClock: 'static', timingSource: 'authored', syncPolicy: 'one' },
		theme: { name: 'Shared authored theme', headFontFace: 'Aptos Display', bodyFontFace: 'Aptos' },
		masters: [
			{ title: 'Alpha', background: '112233' },
			{ title: 'Beta', background: '445566' },
		],
		layouts: [
			{ name: 'ALPHA_LAYOUT', width: 13.333333, height: 7.5, masterName: 'Alpha', activate: true },
			{ name: 'BETA_LAYOUT', width: 13.333333, height: 7.5, masterName: 'Beta', activate: false },
		],
		slides: [
			{ id: 'alpha-slide', title: 'Alpha slide', layoutIntent: 'title-only', layoutName: 'ALPHA_LAYOUT', masterName: 'Alpha', content: [] },
			{ id: 'beta-slide', title: 'Beta slide', layoutIntent: 'title-only', layoutName: 'BETA_LAYOUT', masterName: 'Beta', content: [] },
		],
		...overrides,
	}
}

test('multiple-slide-masters row exposes one exact public collection contract', () => {
	assert.equal(MULTIPLE_SLIDE_MASTERS_UNIT_ID, 'impl-b-e691a66447bfe6e0')
	assert.equal(MULTIPLE_SLIDE_MASTERS_ROW_ID, 'cap_fa5b7e33364aea2a6543')
	assert.equal(MULTIPLE_SLIDE_MASTERS_CONTRACT.runtimeReady, true)
	assert.equal(MULTIPLE_SLIDE_MASTERS_CONTRACT.capabilityStatus, 'executable-exact-structured')
	assert.equal(MULTIPLE_SLIDE_MASTERS_PUBLIC_SCHEMA.properties.masters.maxItems, 32)
	assert.equal(multipleSlideMastersCapabilityContractForEntry({ id: MULTIPLE_SLIDE_MASTERS_ROW_ID }), MULTIPLE_SLIDE_MASTERS_CONTRACT)
	assert.equal(multipleSlideMastersCapabilityContractForEntry({ id: 'other' }), null)

	const entry = publicBaselineCatalog({ family: 'layouts-themes-masters', includePlanned: true, limit: 500 }).entries.find(item => item.id === MULTIPLE_SLIDE_MASTERS_ROW_ID)
	assert.ok(entry)
	assert.equal(entry.selection.semanticKind, 'slideMasterCollection')
	assert.equal(entry.selection.executableValue, 'multiple-slide-masters')
	assert.equal(entry.selection.semanticPath, 'masters[]|layouts[].masterName|slides[].masterName')
	assert.equal(entry.route.semanticKind, 'slideMasterCollection')
	assert.equal(entry.route.exactSelection, 'betterpptx.deck.generate_from_spec')
	assert.equal(applyCatalogTruth(entry).capabilityStatus, 'executable-exact-structured')
})

test('deck and public schemas accept ordered multi-master authoring and reject private fields or overflow', () => {
	const valid = spec()
	assert.equal(validateDeck(valid), true, JSON.stringify(validateDeck.errors))
	assert.equal(validateContract({ theme: valid.theme, masters: valid.masters, layouts: valid.layouts }), true, JSON.stringify(validateContract.errors))
	assert.equal(validateDeck(spec({ masters: Array.from({ length: 33 }, (_, index) => ({ title: `M${index}` })) })), false)
	assert.equal(validateContract({ masters: [{ title: 'Alpha', sourcePart: 'ppt/slideMasters/slideMaster1.xml' }] }), false)
})

test('compiler preserves ordered master definitions and explicit layout/slide lineages', () => {
	const plan = buildSpecOperationPlan(spec(), { plan: 'premium' })
	const structure = plan.operations.find(operation => operation.tool === 'betterpptx.deck.set_layout_theme_structure')
	assert.deepEqual(structure.args.masters.map(master => master.title), ['Alpha', 'Beta'])
	assert.deepEqual(structure.args.layouts.map(layout => layout.masterName), ['Alpha', 'Beta'])
	assert.deepEqual(plan.operations.filter(operation => operation.tool === 'betterpptx.deck.define_master').map(operation => operation.args.master.title), ['Alpha', 'Beta'])
	assert.deepEqual(plan.operations.filter(operation => operation.tool === 'betterpptx.deck.define_layout').map(operation => operation.args.masterName), ['Alpha', 'Beta'])
	assert.deepEqual(plan.operations.filter(operation => operation.tool === 'betterpptx.slide.add').map(operation => [operation.args.layoutName, operation.args.masterName]), [
		['ALPHA_LAYOUT', 'Alpha'], ['BETA_LAYOUT', 'Beta'],
	])
})
