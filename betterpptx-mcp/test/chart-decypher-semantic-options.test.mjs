import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'

import JSZip from 'jszip'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')

async function firstNamedFile(root, fileName) {
	for (const entry of await fs.readdir(root, { withFileTypes: true })) {
		const entryPath = path.join(root, entry.name)
		if (entry.isFile() && entry.name === fileName) return entryPath
		if (entry.isDirectory()) {
			const nested = await firstNamedFile(entryPath, fileName)
			if (nested) return nested
		}
	}
	return undefined
}

function categoricalData() {
	return [{ name: 'Revenue', labels: ['Q1', 'Q2', 'Q3'], values: [10, 14, 12] }]
}

function dataFor(type) {
	if (type === 'scatter') return [{ name: 'X Axis', values: [1, 2, 3] }, { name: 'Revenue', values: [10, 14, 12] }]
	if (type === 'bubble' || type === 'bubble3D') return [{ name: 'X Axis', values: [1, 2, 3] }, { name: 'Revenue', values: [10, 14, 12], sizes: [4, 7, 5] }]
	return categoricalData()
}

async function chartFixture(fileName) {
	const pptx = new PptxGenJS()
	pptx.layout = 'LAYOUT_WIDE'
	const primary = pptx.addSlide()
	primary.addChart(pptx.ChartType.bar, categoricalData(), {
		x: 0.7, y: 0.7, w: 11.9, h: 6.0,
		objectName: 'proof-bar',
		chartStyleId: 48,
		chartStyleModernId: 148,
		chartColorStyleId: 3,
		showTitle: true,
		title: 'Quarterly Revenue',
		showLegend: true,
		legendPos: 'b',
		showValue: true,
		showLabel: true,
		showSerName: true,
		showPercent: false,
		showLeaderLines: true,
		dataLabelFormatCode: '0.0',
		dataLabelPosition: 'inEnd',
		layout: { x: 0.1, y: 0.2, w: 0.7, h: 0.6 },
		showDataTable: true,
		showDataTableHorzBorder: false,
		showDataTableVertBorder: true,
		showDataTableOutline: false,
		showDataTableKeys: true,
		catAxisHidden: false,
		valAxisHidden: true,
		catAxisLabelFontSize: 11,
		catAxisLabelColor: '123456',
		catAxisLabelFontFace: 'Aptos',
		catAxisLabelFontBold: true,
		catAxisLabelPos: 'low',
		catAxisMajorUnit: 2,
		catAxisMinorUnit: 1,
		catAxisMinVal: 0,
		catAxisMaxVal: 5,
		valAxisLabelFontSize: 10,
		valAxisLabelColor: '654321',
		valAxisLabelFontFace: 'Aptos Display',
		valAxisLabelFontItalic: true,
		valAxisLabelFormatCode: '$0.0',
		valAxisLabelPos: 'high',
		valAxisMajorUnit: 5,
		valAxisMinorUnit: 1,
		valAxisMinVal: 0,
		valAxisMaxVal: 20,
		showCatAxisTitle: true,
		catAxisTitle: 'Quarter',
		showValAxisTitle: true,
		valAxisTitle: 'Revenue',
		catGridLine: { style: 'none' },
		valGridLine: { color: 'ABCDEF', style: 'solid', size: 1 },
		displayBlanksAs: 'gap',
	})
	for (const type of ['bar3D', 'bubble', 'bubble3D', 'doughnut', 'line', 'pie', 'radar', 'scatter', 'area']) {
		const slide = pptx.addSlide()
		slide.addChart(pptx.ChartType[type], dataFor(type), {
			x: 0.7, y: 0.7, w: 11.9, h: 6.0,
			objectName: `proof-${type}`,
			showLegend: false,
		})
	}
	await pptx.writeFile({ fileName, compression: false })
}

async function chartParts(fileName) {
	const zip = await JSZip.loadAsync(await fs.readFile(fileName))
	const names = Object.keys(zip.files).filter(name => /^ppt\/charts\/(?:_rels\/)?[^/]+\.xml(?:\.rels)?$/.test(name)).sort()
	return Object.fromEntries(await Promise.all(names.map(async name => [name, await zip.file(name).async('text')])))
}

test('main decypher reads native chart families and semantic chart options while raw parts remain replay-authoritative', async t => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-chart-decypher-'))
	await fs.mkdir(path.resolve('decyphered'), { recursive: true })
	const outputRoot = await fs.mkdtemp(path.join(path.resolve('decyphered'), '.chart-decypher-'))
	t.after(() => Promise.all([fs.rm(tempRoot, { recursive: true, force: true }), fs.rm(outputRoot, { recursive: true, force: true })]))
	const sourcePath = path.join(tempRoot, 'chart-options.pptx')
	const modelPath = path.join(tempRoot, 'model.json')
	await chartFixture(sourcePath)
	const extract = spawnSync(process.execPath, [path.resolve('PPTX_ULTIMATE_DECYPHER_TOOL.mjs'), sourcePath, '--output', outputRoot, '--no-regenerate', '--json-model', modelPath], {
		cwd: path.resolve('.'), encoding: 'utf8', timeout: 120000,
	})
	assert.equal(extract.status, 0, `${extract.stdout}\n${extract.stderr}`)
	const model = JSON.parse(await fs.readFile(modelPath, 'utf8')).model
	const charts = model.slides.flatMap(slide => slide.shapes).filter(shape => shape.type === 'chart')
	assert.deepEqual(charts.map(chart => chart.options.chartType), ['bar', 'bar3D', 'bubble', 'bubble3D', 'doughnut', 'line', 'pie', 'radar', 'scatter', 'area'])
	const options = charts[0].options
	assert.equal(options.chartStyleId, 48)
	assert.equal(options.chartStyleModernId, 148)
	assert.equal(options.chartColorStyleId, 3)
	assert.equal(options.showTitle, true)
	assert.equal(options.title, 'Quarterly Revenue')
	assert.equal(options.showLegend, true)
	assert.equal(options.legendPos, 'b')
	assert.equal(options.showValue, true)
	assert.equal(options.showLabel, false)
	assert.equal(options.showSerName, true)
	assert.equal(options.showPercent, false)
	assert.equal(options.showLeaderLines, true)
	assert.equal(options.dataLabelFormatCode, '0.0')
	assert.equal(options.dataLabelPosition, 'inEnd')
	assert.deepEqual(options.layout, { x: 0.1, y: 0.2, w: 0.7, h: 0.6 })
	assert.equal(options.showDataTable, true)
	assert.equal(options.showDataTableHorzBorder, false)
	assert.equal(options.showDataTableVertBorder, true)
	assert.equal(options.showDataTableOutline, false)
	assert.equal(options.showDataTableKeys, true)
	assert.equal(options.catAxisHidden, false)
	assert.equal(options.valAxisHidden, true)
	assert.equal(options.catAxisLabelFontSize, 11)
	assert.equal(options.catAxisLabelColor, '123456')
	assert.equal(options.catAxisLabelFontFace, 'Aptos')
	assert.equal(options.catAxisLabelFontBold, true)
	assert.equal(options.catAxisLabelPos, 'low')
	assert.equal(options.valAxisLabelFontSize, 10)
	assert.equal(options.valAxisLabelColor, '654321')
	assert.equal(options.valAxisLabelFontFace, 'Aptos Display')
	assert.equal(options.valAxisLabelFontItalic, true)
	assert.equal(options.valAxisLabelFormatCode, '$0.0')
	assert.equal(options.valAxisLabelPos, 'high')
	assert.equal(options.valAxisMajorUnit, 5)
	assert.equal(options.valAxisMinVal, 0)
	assert.equal(options.valAxisMaxVal, 20)
	assert.equal(options.showCatAxisTitle, true)
	assert.equal(options.catAxisTitle, 'Quarter')
	assert.equal(options.showValAxisTitle, true)
	assert.equal(options.valAxisTitle, 'Revenue')
	assert.deepEqual(options.catGridLine, { style: 'none' })
	assert.deepEqual(options.valGridLine, { style: 'solid' })
	assert.equal(options.displayBlanksAs, 'gap')
	for (const field of ['_rawChartXml', '_rawChartRelsXml', '_rawChartWorkbookBase64', '_rawChartColorsXml']) assert.equal(typeof options[field], 'string', field)

	const generatorPath = await firstNamedFile(outputRoot, 'generator.mjs')
	assert.ok(generatorPath)
	const generatorSource = await fs.readFile(generatorPath, 'utf8')
	assert.match(generatorSource, /'chartColorStyleId'/)
	assert.match(generatorSource, /'showDataTableHorzBorder'/)
	assert.match(generatorSource, /bar3D: pptx\.ChartType\.bar3D/)
	assert.match(generatorSource, /bubble3D: pptx\.ChartType\.bubble3D/)
	const replay = spawnSync(process.execPath, [generatorPath], { cwd: path.dirname(generatorPath), encoding: 'utf8', timeout: 120000 })
	assert.equal(replay.status, 0, `${replay.stdout}\n${replay.stderr}`)
	const regeneratedPath = path.join(path.dirname(generatorPath), 'output', 'regenerated.pptx')
	assert.deepEqual(await chartParts(regeneratedPath), await chartParts(sourcePath))
})
