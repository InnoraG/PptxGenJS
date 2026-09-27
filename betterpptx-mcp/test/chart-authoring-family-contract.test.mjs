import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import Ajv from 'ajv'

import {
	CHART_AUTHORING_RUNTIME_READY,
	CHART_DATA_PUBLIC_SCHEMA,
	CHART_OPTIONS_PUBLIC_SCHEMA,
	CHART_PANEL_PUBLIC_SCHEMA,
	validateChartData,
	validateChartOptions,
	validateDirectChartAdd,
	validateDirectChartUpdate,
} from '../chart-authoring-family-contract.mjs'
import { classifyCatalogEntry } from '../capability-truth.mjs'
import { CHART_FORMAT_PARAMETERS } from '../option-registry.mjs'
import { TOOLS } from '../tools.mjs'

const matrix = JSON.parse(fs.readFileSync(new URL('../preset-decomposition-matrix.json', import.meta.url), 'utf8'))
const deckSchema = JSON.parse(fs.readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
const unitRows = matrix.catalogRows.filter(row => row.family === 'charts' && !['betterpptx.chart.recommend', 'title'].includes(row.label))

const data = [{ name: 'Series 1', labels: ['A', 'B'], values: [1, 2] }]

test('chart authoring unit owns one closed executable 120-row contract', () => {
	assert.equal(CHART_AUTHORING_RUNTIME_READY, true)
	assert.equal(unitRows.length, 120)
	assert.equal(new Set(unitRows.map(row => row.id)).size, 120)
	assert.ok(unitRows.every(row => row.capabilityStatus === 'executable-exact-structured'))
	assert.equal(CHART_FORMAT_PARAMETERS.length, 158)
	assert.equal(new Set(CHART_FORMAT_PARAMETERS.map(item => item.id)).size, 158)
	assert.deepEqual(Object.keys(CHART_OPTIONS_PUBLIC_SCHEMA.properties).filter(key => CHART_FORMAT_PARAMETERS.some(item => item.id === key)).sort(), CHART_FORMAT_PARAMETERS.map(item => item.id).sort())

	const classification = classifyCatalogEntry({ family: 'charts', sourceKind: 'capability-row', coverageMode: 'native-plus-preserve', label: 'waterfall' })
	assert.equal(classification.capabilityStatus, 'executable-exact-structured')
	assert.equal(classification.capabilityMode, 'parameterized')
})

test('chart schemas and runtime validators fail closed before mutation', () => {
	const ajv = new Ajv({ allErrors: true, jsonPointers: true, unknownFormats: 'ignore' })
	for (const schema of [CHART_OPTIONS_PUBLIC_SCHEMA, CHART_DATA_PUBLIC_SCHEMA, CHART_PANEL_PUBLIC_SCHEMA]) assert.doesNotThrow(() => ajv.compile(structuredClone(schema)))

	assert.deepEqual(validateChartData([{ labels: [['A', 'B'], ['Q1', 'Q2']], values: [1, 2] }]), [{ labels: [['A', 'B'], ['Q1', 'Q2']], values: [1, 2] }])
	assert.doesNotThrow(() => validateChartOptions({ showTitle: true, title: 'Quarterly results', chartStyleId: 47, chartColorStyleId: 11 }))
	assert.throws(() => validateChartOptions({ _rawChartXml: '<private />' }), /private/)
	assert.throws(() => validateChartOptions({ imaginaryChartOption: true }), /public chart contract/)
	assert.throws(() => validateChartOptions({ chartGalleryTilePresetId: 'tile', chartStylePresetId: 'style' }), /cannot be combined/)
	assert.throws(() => validateChartOptions({ chartStyleId: 49 }), /1 through 48/)
	assert.throws(() => validateChartData([{ labels: ['A'], values: [1, 2] }]), /equal lengths/)

	assert.doesNotThrow(() => validateDirectChartAdd({ deckId: 'd', slideIndex: 0, chartType: 'bar', data, options: { showLegend: true } }))
	assert.throws(() => validateDirectChartAdd({ deckId: 'd', slideIndex: 0, chartType: 'bar', data, secretPath: 'x' }), /public chart contract/)
	assert.doesNotThrow(() => validateDirectChartUpdate({ deckId: 'd', slideIndex: 0, target: { objectName: 'chart' }, optionsPatch: { title: null } }))
	assert.throws(() => validateDirectChartUpdate({ deckId: 'd', slideIndex: 0, target: 0, chartType: 'bar', chartMulti: [{ type: 'bar', data }, { type: 'line', data }] }), /chartType or chartMulti/)
})

test('direct tool and JSON-spec chart surfaces teach closed selectors and option names', () => {
	for (const name of ['betterpptx.slide.add_chart', 'betterpptx.slide.update_chart']) {
		const tool = TOOLS.find(item => item.name === name)
		assert.ok(tool, name)
		assert.equal(tool.inputSchema.additionalProperties, false)
	}
	const content = deckSchema.$defs.contentBlock.properties
	for (const key of ['chartType', 'chartMulti', 'chartOptions', 'chartStylePresetId', 'chartColorStyleId']) assert.ok(content[key], `contentBlock.${key}`)
	assert.equal(content.chartOptions.propertyNames.enum.length, Object.keys(CHART_OPTIONS_PUBLIC_SCHEMA.properties).length)
	assert.deepEqual(new Set(content.chartOptions.propertyNames.enum), new Set(Object.keys(CHART_OPTIONS_PUBLIC_SCHEMA.properties)))
})
