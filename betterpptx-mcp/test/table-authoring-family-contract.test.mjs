import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import Ajv from 'ajv'

import {
	DIRECT_TABLE_ADD_PUBLIC_SCHEMA,
	DIRECT_TABLE_OPTIONS_PUBLIC_SCHEMA,
	DIRECT_TABLE_UPDATE_PUBLIC_SCHEMA,
	TABLE_AUTHORING_RUNTIME_READY,
	TABLE_CELL_OPTIONS_PUBLIC_SCHEMA,
	TABLE_OPTIONS_PUBLIC_SCHEMA,
	TABLE_PANEL_PUBLIC_SCHEMA,
	TABLE_ROWS_PUBLIC_SCHEMA,
	TABLE_SEMANTIC_PRESET_IDS,
	validateDirectTableAdd,
	validateDirectTableUpdate,
	validateTableOptions,
	validateTableRows,
} from '../table-authoring-family-contract.mjs'
import { classifyCatalogEntry } from '../capability-truth.mjs'
import { TABLE_FORMAT_PARAMETERS } from '../option-registry.mjs'
import { TOOLS } from '../tools.mjs'

const matrix = JSON.parse(fs.readFileSync(new URL('../preset-decomposition-matrix.json', import.meta.url), 'utf8'))
const deckSchema = JSON.parse(fs.readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
// The retired unit is intentionally absent from the live manifest. Its exact
// inventory is the table family minus the standalone recommendation row, which
// remains a separate product entry outside the executable authoring contract.
const unitRows = matrix.catalogRows.filter(row => row.family === 'tables' && row.id !== 'cap_03ebc2ff99f46506a399')

const richRows = [
	[
		{ text: [{ text: 'Open ' }, { text: 'target', options: { bold: true, hyperlink: { url: 'https://example.com', tooltip: 'Target' } } }], options: { colspan: 2, rowspan: 2, fill: { color: 'EAF2FF' }, border: { type: 'solid', color: '2457A7', pt: 0.75 } } },
		{ text: 'Status', options: { align: 'center' } },
	],
	[{ text: 'Ready', options: { color: '0F766E', bold: true } }],
]

test('table authoring unit owns one closed executable 36-row contract', () => {
	assert.equal(TABLE_AUTHORING_RUNTIME_READY, true)
	assert.equal(unitRows.length, 36)
	assert.equal(new Set(unitRows.map(row => row.id)).size, 36)
	assert.ok(unitRows.every(row => classifyCatalogEntry({ ...row, family: 'tables', sourceKind: 'capability-row', coverageMode: 'native-plus-preserve' }).capabilityStatus === 'executable-exact-structured'))
	assert.equal(TABLE_FORMAT_PARAMETERS.length, 38)
	assert.equal(new Set(TABLE_FORMAT_PARAMETERS.map(item => item.id)).size, 38)
	assert.equal(TABLE_SEMANTIC_PRESET_IDS.length, 8)
	assert.equal(new Set(TABLE_SEMANTIC_PRESET_IDS).size, 8)

	const classification = classifyCatalogEntry({ family: 'tables', sourceKind: 'capability-row', coverageMode: 'native-plus-preserve', label: 'rich text cells' })
	assert.equal(classification.capabilityStatus, 'executable-exact-structured')
	assert.equal(classification.capabilityMode, 'parameterized')
})

test('table schemas compile and runtime validators fail closed before mutation', () => {
	const ajv = new Ajv({ allErrors: true, strict: false })
	for (const schema of [TABLE_ROWS_PUBLIC_SCHEMA, TABLE_CELL_OPTIONS_PUBLIC_SCHEMA, TABLE_OPTIONS_PUBLIC_SCHEMA, DIRECT_TABLE_OPTIONS_PUBLIC_SCHEMA, TABLE_PANEL_PUBLIC_SCHEMA, DIRECT_TABLE_ADD_PUBLIC_SCHEMA, DIRECT_TABLE_UPDATE_PUBLIC_SCHEMA]) assert.doesNotThrow(() => ajv.compile(structuredClone(schema)))

	assert.deepEqual(validateTableRows(richRows), richRows)
	assert.doesNotThrow(() => validateTableOptions({ tablePresetId: 'executive-kpi-scorecard', headerRow: true, bandedRows: true, colW: [2, 2, 1.5] }))
	assert.throws(() => validateTableOptions({ _rawTblPrXml: '<private />' }), /private/)
	assert.throws(() => validateTableOptions({ imaginaryTableOption: true }), /public table contract/)
	assert.throws(() => validateTableOptions({ tablePresetId: 'executive-kpi-scorecard', tableStyleId: '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}' }), /only one/)
	assert.throws(() => validateTableOptions({ autoPageRepeatHeader: true }), /requires autoPage/)
	assert.throws(() => validateTableRows([[{ text: 'A', options: { rowspan: 2 } }]]), /beyond the final row/)
	assert.throws(() => validateTableRows([[{ text: 'A', options: { border: { _rawXml: '<private />' } } }]]), /private/)

	assert.doesNotThrow(() => validateDirectTableAdd({ deckId: 'd', slideIndex: 0, rows: richRows, options: { objectName: 'table-proof', tablePresetId: 'feature-comparison-matrix' } }))
	assert.throws(() => validateDirectTableAdd({ deckId: 'd', slideIndex: 0, rows: richRows, secretPath: 'x' }), /public table contract/)
	assert.doesNotThrow(() => validateDirectTableUpdate({ deckId: 'd', slideIndex: 0, target: { objectName: 'table-proof' }, optionsPatch: { totalRow: true }, patchCell: { row: 1, col: 0, text: 'Complete' } }))
	assert.doesNotThrow(() => validateDirectTableUpdate({ deckId: 'd', slideIndex: 0, target: 0, optionsPatch: null }))
	assert.throws(() => validateDirectTableUpdate({ deckId: 'd', slideIndex: 0, target: 0, operations: [{ op: 'patchCell', row: 0, col: 0, patch: { _rawTcPrXml: '<private />' } }] }), /public table contract/)
})

test('direct tools and JSON-spec table surfaces teach the closed table vocabulary', () => {
	const add = TOOLS.find(item => item.name === 'betterpptx.slide.add_table')
	const update = TOOLS.find(item => item.name === 'betterpptx.slide.update_table')
	assert.equal(add.inputSchema.additionalProperties, false)
	assert.equal(update.inputSchema.additionalProperties, false)
	for (const key of Object.keys(DIRECT_TABLE_ADD_PUBLIC_SCHEMA.properties)) assert.ok(add.inputSchema.properties[key], `add_table.${key}`)
	for (const key of Object.keys(DIRECT_TABLE_UPDATE_PUBLIC_SCHEMA.properties)) assert.ok(update.inputSchema.properties[key], `update_table.${key}`)

	const content = deckSchema.$defs.contentBlock.properties
	for (const key of ['header', 'rows', 'tableOptions', 'tablePresetId', 'tableStylePresetId', 'tableStyleId']) assert.ok(content[key], `contentBlock.${key}`)
	assert.equal(deckSchema.$defs.tableOptions.additionalProperties, false)
	assert.equal(deckSchema.$defs.tableCellOptions.additionalProperties, false)
	assert.deepEqual(new Set(Object.keys(deckSchema.$defs.tableOptions.properties)), new Set(Object.keys(TABLE_OPTIONS_PUBLIC_SCHEMA.properties)))
})
