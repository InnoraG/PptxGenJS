import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'

import JSZip from 'jszip'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const STYLE_ID = '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}'

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

async function tableFixture(fileName) {
	const pptx = new PptxGenJS()
	pptx.layout = 'LAYOUT_WIDE'
	const slide = pptx.addSlide()
	const border = [
		{ color: '102030', pt: 1, transparency: 10 },
		{ color: '203040', pt: 1.25, transparency: 20 },
		{ color: '304050', pt: 1.5, transparency: 30 },
		{ color: '405060', pt: 1.75, transparency: 40 },
	]
	slide.addTable([
		[
			{
				text: [{ text: 'Revenue', options: { bold: true, color: '112233' } }, { text: ' / Margin', options: { italic: true, color: '445566' } }],
				options: { colspan: 2, fill: { color: 'DDEEFF', transparency: 20 }, border, margin: [0.05, 0.06, 0.07, 0.08], valign: 'middle' },
			},
			{ text: 'Status', options: { fill: { color: 'CCDDEE' }, bold: true } },
		],
		[
			{ text: 'North', options: { rowspan: 2, fill: { color: 'EEF2FF' } } },
			{ text: 'Q1', options: { fill: { color: 'F8FAFC' } } },
			{ text: 'On plan', options: { fill: { color: 'ECFDF5' } } },
		],
		[
			{ text: 'Q2', options: { fill: { color: 'F8FAFC' } } },
			{ text: 'At risk', options: { fill: { color: 'FEF2F2' } } },
		],
	], {
		x: 0.8, y: 1.0, w: 8.0, h: 2.5,
		objectName: 'semantic-table-proof',
		tableStyleId: STYLE_ID,
		headerRow: true,
		totalRow: true,
		firstColumn: true,
		lastColumn: false,
		bandedRows: true,
		bandedColumns: false,
		colW: [2.1, 2.7, 3.2],
		rowH: [0.7, 0.8, 1.0],
		fontSize: 12,
		color: '111827',
	})
	await pptx.writeFile({ fileName, compression: false })
}

async function tableXml(fileName) {
	const zip = await JSZip.loadAsync(await fs.readFile(fileName))
	const slideXml = await zip.file('ppt/slides/slide1.xml').async('text')
	const document = new DOMParser().parseFromString(slideXml, 'application/xml')
	const table = document.getElementsByTagNameNS(DRAWING_NS, 'tbl').item(0)
	assert.ok(table, 'slide has no native table')
	return new XMLSerializer().serializeToString(table)
}

test('main decypher exposes Table Design state and exact native cell/grid semantics', async t => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-table-decypher-'))
	await fs.mkdir(path.resolve('decyphered'), { recursive: true })
	const outputRoot = await fs.mkdtemp(path.join(path.resolve('decyphered'), '.table-decypher-'))
	t.after(() => Promise.all([fs.rm(tempRoot, { recursive: true, force: true }), fs.rm(outputRoot, { recursive: true, force: true })]))
	const sourcePath = path.join(tempRoot, 'table-options.pptx')
	const modelPath = path.join(tempRoot, 'model.json')
	await tableFixture(sourcePath)
	const extract = spawnSync(process.execPath, [path.resolve('PPTX_ULTIMATE_DECYPHER_TOOL.mjs'), sourcePath, '--output', outputRoot, '--no-regenerate', '--json-model', modelPath], {
		cwd: path.resolve('.'), encoding: 'utf8', timeout: 120000,
	})
	assert.equal(extract.status, 0, `${extract.stdout}\n${extract.stderr}`)
	const exported = JSON.parse(await fs.readFile(modelPath, 'utf8'))
	assert.equal(exported.stats.passthroughCount, 0)
	const model = exported.model
	const table = model.slides[0].shapes.find(shape => shape.type === 'table')
	assert.ok(table, JSON.stringify(model.slides[0].shapes.map(shape => ({ type: shape.type, name: shape.name, note: shape.__NOTE__ }))))
	assert.equal(table.options.tableStyleId, STYLE_ID)
	assert.equal(table.options.headerRow, true)
	assert.equal(table.options.totalRow, true)
	assert.equal(table.options.firstColumn, true)
	assert.equal(table.options.lastColumn, false)
	assert.equal(table.options.bandedRows, true)
	assert.equal(table.options.bandedColumns, false)
	assert.equal(Object.hasOwn(table.options, '_rawTblPrXml'), false, 'modeled tblPr should not use broad raw replay')
	assert.deepEqual(table.options.colW, [2.1, 2.7, 3.2])
	assert.deepEqual(table.options.rowH, [0.7, 0.8, 1])
	const mergedHeader = table.tableData[0][0]
	assert.equal(mergedHeader.text, 'Revenue / Margin')
	assert.equal(mergedHeader.options.colspan, 2)
	assert.deepEqual(mergedHeader.options.fill, { color: 'DDEEFF', transparency: 20 })
	assert.deepEqual(mergedHeader.options.margin, [0.05, 0.06, 0.07, 0.08])
	assert.equal(mergedHeader.options.valign, 'middle')
	assert.equal(Array.isArray(mergedHeader.options.border), true)
	assert.equal(mergedHeader.options.border[0].transparency, 10)
	assert.match(mergedHeader.options._rawTxBodyXml, /Revenue/)
	assert.match(mergedHeader.options._rawTxBodyXml, /Margin/)
	assert.equal(table.tableData[1][0].options.rowspan, 2)

	const generatorPath = await firstNamedFile(outputRoot, 'generator.mjs')
	assert.ok(generatorPath)
	const generatorSource = await fs.readFile(generatorPath, 'utf8')
	assert.match(generatorSource, /'tableStyleId'/)
	assert.match(generatorSource, /'bandedColumns'/)
	const replay = spawnSync(process.execPath, [generatorPath], { cwd: path.dirname(generatorPath), encoding: 'utf8', timeout: 120000 })
	assert.equal(replay.status, 0, `${replay.stdout}\n${replay.stderr}`)
	const regeneratedPath = path.join(path.dirname(generatorPath), 'output', 'regenerated.pptx')
	assert.equal(await tableXml(regeneratedPath), await tableXml(sourcePath))
})
