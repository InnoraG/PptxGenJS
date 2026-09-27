import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import Ajv from 'ajv'

import {
	ADD_SLIDE_ENTRY_CONTRACT,
	ADD_SLIDE_ENTRY_ROW_ID,
	ADD_SLIDE_ENTRY_SCHEMA,
	ADD_SLIDE_ENTRY_UNIT_ID,
	addSlideEntryCapabilityContractForEntry,
} from '../add-slide-entry-contract.mjs'
import { applyCatalogTruth } from '../capability-truth.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { publicBaselineCatalog } from '../public-baseline-catalog.mjs'

const deckSchema = JSON.parse(fs.readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
delete deckSchema.$schema
const ajv = new Ajv({ allErrors: true, jsonPointers: true, unknownFormats: 'ignore' })
const validateDeck = ajv.compile(deckSchema)
const validateEntry = new Ajv({ allErrors: true, jsonPointers: true }).compile(structuredClone(ADD_SLIDE_ENTRY_SCHEMA))

function baseSlide(overrides = {}) {
	return {
		id: 'semantic-slide-a',
		title: 'Semantic slide A',
		layoutIntent: 'title-only',
		content: [],
		...overrides,
	}
}

function baseSpec(slide = baseSlide()) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Exact add-slide entry',
		layout: 'LAYOUT_WIDE',
		motionTime: { masterClock: 'static', timingSource: 'authored', syncPolicy: 'single' },
		slides: [slide],
	}
}

test('add-slide row exposes one exact public JSON-spec contract', () => {
	assert.equal(ADD_SLIDE_ENTRY_UNIT_ID, 'impl-b-7291f4091e2c2f56')
	assert.equal(ADD_SLIDE_ENTRY_ROW_ID, 'cap_d3e8dd4cef35a9b5dc30')
	assert.equal(ADD_SLIDE_ENTRY_CONTRACT.runtimeReady, true)
	assert.equal(ADD_SLIDE_ENTRY_CONTRACT.capabilityStatus, 'executable-exact-structured')
	assert.equal(ADD_SLIDE_ENTRY_CONTRACT.publicSchema.additionalProperties, false)
	assert.deepEqual(ADD_SLIDE_ENTRY_CONTRACT.overrideFields, [
		'slide.layoutName',
		'slide.masterName',
		'slide.hidden',
		'slide.showMasterShapes',
		'slide.showMasterBackground',
		'slide.transition',
		'slide.notes',
	])
	assert.equal(addSlideEntryCapabilityContractForEntry({ id: ADD_SLIDE_ENTRY_ROW_ID }), ADD_SLIDE_ENTRY_CONTRACT)
	assert.equal(addSlideEntryCapabilityContractForEntry({ id: 'other' }), null)

	const entry = publicBaselineCatalog({ family: 'layouts-themes-masters', includePlanned: true, limit: 500 }).entries.find(item => item.id === ADD_SLIDE_ENTRY_ROW_ID)
	assert.ok(entry)
	assert.equal(entry.selection.semanticKind, 'slide')
	assert.equal(entry.selection.executableValue, 'slide')
	assert.equal(entry.selection.semanticPath, 'slides[]')
	assert.equal(entry.route.semanticKind, 'slide')
	assert.equal(entry.route.exactSelection, 'betterpptx.deck.generate_from_spec')
	assert.deepEqual(entry.route.composition, ['betterpptx.deck.generate_from_spec'])
	assert.equal(applyCatalogTruth(entry).capabilityStatus, 'executable-exact-structured')
})

test('entry and deck schemas preserve false, zero, Unicode notes, and nullable reset semantics', () => {
	const authored = baseSlide({
		layoutName: 'ExactLayout',
		masterName: 'ExactMaster',
		hidden: false,
		showMasterShapes: false,
		showMasterBackground: false,
		transition: { type: 'fade', duration: 0, advanceOnClick: false },
		notes: 'Speaker notes — line one\n第二行',
	})
	assert.equal(validateEntry(authored), true, JSON.stringify(validateEntry.errors))
	assert.equal(validateDeck(baseSpec(authored)), true, JSON.stringify(validateDeck.errors))
	const reset = baseSlide({ layoutName: null, masterName: null, hidden: null, showMasterShapes: null, showMasterBackground: null, transition: null, notes: null })
	assert.equal(validateEntry(reset), true, JSON.stringify(validateEntry.errors))
	assert.equal(validateDeck(baseSpec(reset)), true, JSON.stringify(validateDeck.errors))
	assert.equal(validateEntry({ ...authored, packagePath: 'ppt/slides/slide1.xml' }), false)
	assert.equal(validateDeck(baseSpec(baseSlide({ hidden: 'false' }))), false)
	assert.equal(validateDeck(baseSpec(baseSlide({ notes: 12 }))), false)
})

test('compiler lowers the slide carrier without losing false or zero-valued controls', () => {
	const plan = buildSpecOperationPlan(baseSpec(baseSlide({
		hidden: false,
		showMasterShapes: false,
		showMasterBackground: false,
		transition: { type: 'fade', duration: 0, advanceOnClick: false },
		notes: 'Exact notes',
	})), { plan: 'premium' })
	const operation = plan.operations.find(item => item.tool === 'betterpptx.slide.add')
	assert.ok(operation)
	assert.equal(operation.slideId, 'semantic-slide-a')
	assert.equal(operation.args.hidden, false)
	assert.equal(operation.args.showMasterShapes, false)
	assert.equal(operation.args.transition.type, 'fade')
	assert.equal(operation.args.transition.duration, 0)
	assert.equal(operation.args.transition.advanceOnClick, false)
	assert.match(operation.args.notes, /Exact notes/)
	assert.throws(
		() => buildSpecOperationPlan(baseSpec(baseSlide({ showMasterShapes: false, showMasterBackground: true })), { plan: 'premium' }),
		/showMasterShapes and showMasterBackground must agree/,
	)
})
