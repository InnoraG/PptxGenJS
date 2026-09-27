import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import Ajv from 'ajv'

import {
	LAYOUT_GRAPHIC_PLACEHOLDER_ROWS,
	nativePlaceholderType,
	normalizePlaceholderBinding,
	publicPlaceholderBindingFromNative,
	semanticPlaceholderType,
} from '../layout-placeholder-variants-contract.mjs'
import {
	GRAPHIC_FRAME_PLACEHOLDER_CONTRACT,
	LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_ROW_IDS,
	LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_UNIT_ID,
	LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_UNIT_PARTITION,
	SHOW_MASTER_SHAPES_CONTRACT,
	SHOW_MASTER_SHAPES_ROW_ID,
	layoutGraphicPlaceholderVisibilityCapabilityContractForEntry,
} from '../layout-graphic-placeholder-visibility-contract.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

const schema = JSON.parse(fs.readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
const ajvSchema = structuredClone(schema)
delete ajvSchema.$schema
const validateDeck = new Ajv({ allErrors: true, jsonPointers: true, unknownFormats: 'ignore' }).compile(ajvSchema)

function baseSpec(overrides = {}) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Graphic placeholder visibility contract',
		layout: 'LAYOUT_WIDE',
		motionTime: { masterClock: 'static', timingSource: 'authored', syncPolicy: 'one' },
		layouts: [{
			name: 'GRAPHIC_LAYOUT', width: 13.333, height: 7.5, activate: true,
			placeholders: [
				{ name: 'chart-slot', type: 'chart', idx: 4, x: 0.8, y: 1.2, w: 5.6, h: 4.8 },
				{ name: 'table-slot', type: 'table', idx: 5, x: 6.8, y: 1.2, w: 5.6, h: 4.8 },
			],
		}],
		slides: [{
			id: 's1', title: 'Bound graphics', layoutIntent: 'title-only', layoutName: 'GRAPHIC_LAYOUT', showMasterShapes: false,
			content: [
				{ kind: 'chart-panel', name: 'chart', chartType: 'bar', data: [{ name: 'Series', labels: ['A'], values: [1] }], placeholderBinding: { type: 'chart', idx: 4 } },
				{ kind: 'table-panel', name: 'table', header: ['Metric', 'Value'], rows: [['A', '1']], placeholderBinding: { type: 'table', idx: 5 } },
			],
		}],
		...overrides,
	}
}

test('unit freezes two graphic-frame placeholder rows and one master-shape visibility row', () => {
	assert.equal(LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_UNIT_ID, 'impl-b-bd9036f7a7458201')
	assert.deepEqual(LAYOUT_GRAPHIC_PLACEHOLDER_ROWS.map(row => row.id), ['cap_adb7f3edf5645381f0f6', 'cap_d8cf7ea86a8ff0992e12'])
	assert.deepEqual(LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_ROW_IDS, ['cap_adb7f3edf5645381f0f6', 'cap_d8cf7ea86a8ff0992e12', 'cap_ba389c82d344c0610bab'])
	assert.deepEqual(LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_UNIT_PARTITION, {
		unitId: LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_UNIT_ID, rows: 3, graphicFramePlaceholderRows: 2, masterShapeVisibilityRows: 1,
		rowIds: LAYOUT_GRAPHIC_PLACEHOLDER_VISIBILITY_ROW_IDS,
	})
	for (const contract of [GRAPHIC_FRAME_PLACEHOLDER_CONTRACT, SHOW_MASTER_SHAPES_CONTRACT]) {
		assert.equal(contract.runtimeReady, true)
		assert.equal(contract.capabilityStatus, 'executable-exact-structured')
		assert.ok(contract.componentOwnership.length > 0)
		assert.ok(contract.overrideFields.length > 0)
		assert.ok(contract.precedence.length > 0)
		assert.ok(contract.legalCombinations.length > 0)
	}
	for (const row of LAYOUT_GRAPHIC_PLACEHOLDER_ROWS) assert.equal(layoutGraphicPlaceholderVisibilityCapabilityContractForEntry(row), GRAPHIC_FRAME_PLACEHOLDER_CONTRACT)
	assert.equal(layoutGraphicPlaceholderVisibilityCapabilityContractForEntry({ id: SHOW_MASTER_SHAPES_ROW_ID }), SHOW_MASTER_SHAPES_CONTRACT)
})

test('table is the public semantic alias for native tbl and graphic bindings preserve exact native identity', () => {
	assert.equal(nativePlaceholderType('chart'), 'chart')
	assert.equal(nativePlaceholderType('table'), 'tbl')
	assert.equal(semanticPlaceholderType('tbl'), 'table')
	assert.deepEqual(normalizePlaceholderBinding({ type: 'table', phType: 'tbl', idx: 0, phIdx: 0, hasCustomPrompt: false }), {
		placeholder: 'tbl', phType: 'tbl', phIdx: 0, hasCustomPrompt: false,
	})
	assert.deepEqual(publicPlaceholderBindingFromNative({ phType: 'tbl', phIdx: '0', phHasCustomPrompt: '0' }), {
		type: 'table', idx: 0, hasCustomPrompt: false,
	})
	assert.throws(() => normalizePlaceholderBinding({ type: 'table', phType: 'chart', idx: 5 }), /aliases type, phType must agree/)
})

test('deck schema and compiler lower populated chart/table bindings without materializing inherited geometry', () => {
	const spec = baseSpec()
	assert.equal(validateDeck(spec), true, JSON.stringify(validateDeck.errors))
	const plan = buildSpecOperationPlan(spec, { plan: 'premium', dryRun: true })
	const layout = plan.operations.find(operation => operation.tool === 'betterpptx.deck.define_layout')
	assert.deepEqual(layout.args.placeholders.map(item => [item.type, item.idx]), [['chart', 4], ['tbl', 5]])
	const chart = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_chart')
	const table = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_table')
	assert.equal(chart.args.options.phType, 'chart')
	assert.equal(chart.args.options.phIdx, 4)
	assert.equal(table.args.options.phType, 'tbl')
	assert.equal(table.args.options.phIdx, 5)
	for (const operation of [chart, table]) for (const key of ['x', 'y', 'w', 'h']) assert.equal(Object.hasOwn(operation.args.options, key), false, `${operation.tool} must inherit ${key}`)
	const addSlide = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add')
	assert.equal(addSlide.args.showMasterShapes, false)
	assert.equal(Object.hasOwn(addSlide.args, 'showMasterBackground'), false)
})

test('graphic-frame binding mismatches, ambiguity, auto-page, and visibility alias conflicts fail closed', () => {
	const mutateBlock = (index, patch) => {
		const spec = baseSpec()
		spec.slides[0].content[index] = { ...spec.slides[0].content[index], ...patch }
		return spec
	}
	assert.throws(() => buildSpecOperationPlan(mutateBlock(0, { placeholderBinding: { type: 'table', idx: 5 } }), { plan: 'premium' }), /must be chart for a chart object/)
	assert.throws(() => buildSpecOperationPlan(mutateBlock(1, { placeholderBinding: { type: 'chart', idx: 4 } }), { plan: 'premium' }), /must be table\/tbl for a table object/)
	assert.throws(() => buildSpecOperationPlan(mutateBlock(0, { placeholderBinding: 'chart' }), { plan: 'premium' }), /must include idx\/phIdx or a distinct layout placeholder name/)
	assert.throws(() => buildSpecOperationPlan(mutateBlock(1, { tableOptions: { autoPage: true } }), { plan: 'premium' }), /cannot be combined with tableOptions\.autoPage/)
	const duplicateTuple = baseSpec()
	duplicateTuple.layouts[0].placeholders.push({ name: 'duplicate-chart-slot', type: 'chart', idx: 4, x: 1, y: 1, w: 2, h: 2 })
	assert.throws(() => buildSpecOperationPlan(duplicateTuple, { plan: 'premium' }), /duplicate placeholder type\/index tuple chart:4/)
	const aliasConflict = baseSpec()
	aliasConflict.slides[0].showMasterBackground = true
	assert.throws(() => buildSpecOperationPlan(aliasConflict, { plan: 'premium' }), /showMasterShapes and showMasterBackground must agree/)
})

test('public catalog exposes exact selections and semantic kinds for all three rows', async () => {
	const { publicBaselineCatalog } = await import('../public-baseline-catalog.mjs')
	const entries = publicBaselineCatalog({ family: 'layouts-themes-masters', includePlanned: true, limit: 500 }).entries
	const byId = new Map(entries.map(entry => [entry.id, entry]))
	for (const row of LAYOUT_GRAPHIC_PLACEHOLDER_ROWS) {
		const entry = byId.get(row.id)
		assert.ok(entry)
		assert.equal(entry.capabilityStatus, 'executable-exact-structured')
		assert.equal(entry.selection.executableValue, row.semanticType)
		assert.equal(entry.selection.semanticPath, 'content[].placeholderBinding.type')
		assert.equal(entry.route.semanticKind, 'layoutPlaceholder')
	}
	const visibility = byId.get(SHOW_MASTER_SHAPES_ROW_ID)
	assert.ok(visibility)
	assert.equal(visibility.capabilityStatus, 'executable-exact-structured')
	assert.equal(visibility.selection.executableValue, true)
	assert.equal(visibility.selection.semanticPath, 'slides[].showMasterShapes')
	assert.equal(visibility.route.semanticKind, 'slidePolicy')
})
