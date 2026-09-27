#!/usr/bin/env node

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { DOMParser } from '@xmldom/xmldom'
import JSZip from 'jszip'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const run = promisify(execFile)
const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(moduleDir, '..')
const UNIT_ID = 'impl-c-e9cb65d5f0db72c7'
const REL = Object.freeze({
	chart: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart',
	chartEx: 'http://schemas.microsoft.com/office/2014/relationships/chartEx',
	package: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/package',
	style: 'http://schemas.microsoft.com/office/2011/relationships/chartStyle',
	colors: 'http://schemas.microsoft.com/office/2011/relationships/chartColorStyle',
})
const CT = Object.freeze({
	chart: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
	chartEx: 'application/vnd.ms-office.chartex+xml',
	style: 'application/vnd.ms-office.chartstyle+xml',
	colors: 'application/vnd.ms-office.chartcolorstyle+xml',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
})
const INITIAL = Object.freeze([
	{ objectName: 'chart-style-49-v1', family: 'legacy', type: 'bar', styleToken: 'style49', colorToken: 'native-4', gallery: 49, colorId: 4 },
	{ objectName: 'chart-style-48-v1', family: 'legacy', type: 'line', styleToken: 'style48', colorToken: 'native-12', gallery: 48, colorId: 12 },
	{ objectName: 'chart-waterfall-v1', family: 'chartEx', type: 'waterfall', styleToken: 'style', colorToken: 'native-5', colorId: 5 },
])
const EDITED = Object.freeze([
	{ objectName: 'chart-style-49-v1', family: 'legacy', type: 'bar', styleToken: 'style47', colorToken: 'native-11', gallery: 47, colorId: 11 },
	{ objectName: 'chart-style-48-v1', family: 'legacy', type: 'line', styleToken: 'style46', colorToken: 'native-10', gallery: 46, colorId: 10 },
	{ objectName: 'chart-waterfall-v1', family: 'chartEx', type: 'waterfall', styleToken: 'style', colorToken: 'native-6', colorId: 6 },
])
const EDITED_TITLES = Object.freeze(['Style 47 / Color 11', 'Style 46 / Color 10', 'Waterfall / Color 6'])

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const relative = file => path.relative(workspaceRoot, file).replaceAll(path.sep, '/')

function dataOf(label, result) {
	assert.equal(result?.ok, true, `${label}: ${JSON.stringify(result)}`)
	return result.data || result
}

function parseXmlStrict(xml, label) {
	const errors = []
	const document = new DOMParser({ errorHandler: {
		warning: message => errors.push(`warning: ${message}`),
		error: message => errors.push(`error: ${message}`),
		fatalError: message => errors.push(`fatal: ${message}`),
	} }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [], `${label}: XML parser errors`)
	assert.notEqual(document.documentElement?.localName, 'parsererror', `${label}: parsererror root`)
	return document
}

const elements = (node, localName) => Array.from(node?.getElementsByTagName('*') || []).filter(item => !localName || item.localName === localName)
const relRows = document => elements(document, 'Relationship').map(node => ({
	Id: node.getAttribute('Id'), Type: node.getAttribute('Type'), Target: node.getAttribute('Target'), TargetMode: node.getAttribute('TargetMode'),
}))
const relationshipPartFor = part => path.posix.join(path.posix.dirname(part), '_rels', `${path.posix.basename(part)}.rels`)
const sourcePartForRelationships = rel => rel === '_rels/.rels' ? '' : path.posix.join(path.posix.dirname(path.posix.dirname(rel)), path.posix.basename(rel, '.rels'))
const resolveTarget = (source, target) => {
	const normalized = String(target || '').replaceAll('\\', '/')
	return normalized.startsWith('/') ? path.posix.normalize(normalized.slice(1)) : path.posix.normalize(path.posix.join(source ? path.posix.dirname(source) : '', normalized))
}
const numericPartSort = (a, b) => Number(a.match(/(\d+)\.(?:xml|xlsx)$/)?.[1] || 0) - Number(b.match(/(\d+)\.(?:xml|xlsx)$/)?.[1] || 0)

async function packageDocuments(buffer, label) {
	const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
	const names = Object.keys(zip.files).filter(name => !zip.files[name].dir).sort()
	const documents = new Map()
	for (const name of names.filter(item => item.endsWith('.xml') || item.endsWith('.rels'))) {
		documents.set(name, parseXmlStrict(await zip.file(name).async('string'), `${label}/${name}`))
	}
	return { zip, names, nameSet: new Set(names), documents }
}

function contentTypes(documents) {
	const document = documents.get('[Content_Types].xml')
	assert.ok(document, '[Content_Types].xml missing')
	const defaults = elements(document, 'Default').map(node => [node.getAttribute('Extension').toLowerCase(), node.getAttribute('ContentType')])
	const overrides = elements(document, 'Override').map(node => [node.getAttribute('PartName').replace(/^\//, ''), node.getAttribute('ContentType')])
	assert.equal(new Set(defaults.map(([extension]) => extension)).size, defaults.length, 'duplicate content-type default')
	assert.equal(new Set(overrides.map(([part]) => part)).size, overrides.length, 'duplicate content-type override')
	return { defaults: new Map(defaults), overrides: new Map(overrides) }
}

function auditRelationshipClosure({ names, nameSet, documents }, label) {
	for (const relName of names.filter(name => name.endsWith('.rels'))) {
		const source = sourcePartForRelationships(relName)
		const rows = relRows(documents.get(relName))
		assert.equal(new Set(rows.map(item => item.Id)).size, rows.length, `${label}/${relName}: duplicate relationship Id`)
		for (const row of rows.filter(item => String(item.TargetMode).toLowerCase() !== 'external')) {
			const target = resolveTarget(source, row.Target)
			assert.ok(nameSet.has(target), `${label}/${relName}: dangling ${row.Id} -> ${target}`)
		}
	}
}

async function auditWorkbook(buffer, label) {
	const pkg = await packageDocuments(buffer, label)
	auditRelationshipClosure(pkg, label)
	const { defaults, overrides } = contentTypes(pkg.documents)
	assert.ok(pkg.nameSet.has('xl/workbook.xml'), `${label}: workbook missing`)
	assert.ok(pkg.nameSet.has('xl/worksheets/sheet1.xml'), `${label}: worksheet missing`)
	assert.ok(pkg.nameSet.has('xl/sharedStrings.xml'), `${label}: sharedStrings missing`)
	assert.equal(overrides.get('xl/workbook.xml'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml', `${label}: workbook content type`)
	for (const name of pkg.names.filter(item => item !== '[Content_Types].xml')) {
		const extension = name.endsWith('.rels') ? 'rels' : path.posix.extname(name).slice(1).toLowerCase()
		assert.ok(overrides.has(name) || defaults.has(extension), `${label}: ${name} has no content type`)
	}
	return { partCount: pkg.names.length, sha256: sha256(buffer) }
}

function chartTypePresent(document, expected) {
	if (expected === 'bar') return elements(document, 'barChart').length > 0
	if (expected === 'line') return elements(document, 'lineChart').length > 0
	if (expected === 'waterfall') return elements(document, 'series').some(node => node.getAttribute('layoutId') === 'waterfall')
	return false
}

function markerPresent(document, marker) {
	return elements(document, 'cNvPr').some(node => {
		const name = node.getAttribute('name')
		return name === marker || name.includes(`.${marker}.chart`)
	})
}

async function inspectPptx(buffer, label, expected, { officeNormalized = false } = {}) {
	const pkg = await packageDocuments(buffer, label)
	auditRelationshipClosure(pkg, label)
	const { defaults, overrides } = contentTypes(pkg.documents)
	assert.equal(defaults.get('xlsx'), CT.xlsx, `${label}: xlsx default content type`)
	for (const part of overrides.keys()) assert.ok(pkg.nameSet.has(part), `${label}: orphan content-type override ${part}`)
	for (const name of pkg.names.filter(item => item !== '[Content_Types].xml')) {
		const extension = name.endsWith('.rels') ? 'rels' : path.posix.extname(name).slice(1).toLowerCase()
		assert.ok(overrides.has(name) || defaults.has(extension), `${label}: ${name} has no content type`)
	}

	const slideParts = pkg.names.filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort(numericPartSort)
	assert.equal(slideParts.length, expected.length, `${label}: slide count`)
	const reachedCharts = new Set()
	const reachedStyles = new Set()
	const reachedColors = new Set()
	const reachedWorkbooks = new Set()
	const workbookRows = []
	const chartRows = []

	for (let index = 0; index < expected.length; index++) {
		const wanted = expected[index]
		const slidePart = slideParts[index]
		const slideDocument = pkg.documents.get(slidePart)
		assert.ok(markerPresent(slideDocument, wanted.objectName), `${label}: ${slidePart} retains ${wanted.objectName}`)
		const slideRelationships = relRows(pkg.documents.get(relationshipPartFor(slidePart)))
		const chartRelationships = slideRelationships.filter(row => row.Type === REL.chart || row.Type === REL.chartEx)
		assert.equal(chartRelationships.length, 1, `${label}: ${slidePart} has one chart relationship`)
		const chartRelationship = chartRelationships[0]
		const chartPart = resolveTarget(slidePart, chartRelationship.Target)
		reachedCharts.add(chartPart)
		assert.equal(chartRelationship.Type, wanted.family === 'chartEx' ? REL.chartEx : REL.chart, `${label}: ${chartPart} relationship family`)
		assert.equal(overrides.get(chartPart), wanted.family === 'chartEx' ? CT.chartEx : CT.chart, `${label}: ${chartPart} content type`)
		const chartDocument = pkg.documents.get(chartPart)
		assert.ok(chartDocument, `${label}: ${chartPart} XML missing`)
		assert.ok(chartTypePresent(chartDocument, wanted.type), `${label}: ${chartPart} type ${wanted.type}`)

		const relationships = relRows(pkg.documents.get(relationshipPartFor(chartPart)))
		const styles = relationships.filter(row => row.Type === REL.style)
		const colors = relationships.filter(row => row.Type === REL.colors)
		const workbooks = relationships.filter(row => row.Type === REL.package)
		const officeLegacy = officeNormalized && wanted.family === 'legacy'
		assert.equal(styles.length, officeLegacy ? 0 : 1, `${label}: ${chartPart} chartStyle relationship count`)
		assert.equal(colors.length, officeLegacy ? 0 : 1, `${label}: ${chartPart} chartColorStyle relationship count`)
		assert.equal(workbooks.length, wanted.family === 'legacy' ? 1 : 0, `${label}: ${chartPart} workbook relationship count`)
		const stylePart = styles[0] ? resolveTarget(chartPart, styles[0].Target) : null
		const colorsPart = colors[0] ? resolveTarget(chartPart, colors[0].Target) : null
		if (stylePart) {
			reachedStyles.add(stylePart)
			if (!officeNormalized) assert.ok(path.posix.basename(stylePart).toLowerCase().includes(wanted.styleToken.toLowerCase()), `${label}: ${chartPart} selected style target ${stylePart}`)
			assert.equal(overrides.get(stylePart), CT.style, `${label}: ${stylePart} content type`)
			assert.equal(pkg.documents.get(stylePart)?.documentElement?.localName, 'chartStyle', `${label}: ${stylePart} root`)
		}
		if (colorsPart) {
			reachedColors.add(colorsPart)
			if (!officeNormalized) assert.ok(path.posix.basename(colorsPart).toLowerCase().includes(wanted.colorToken.toLowerCase()), `${label}: ${chartPart} selected color target ${colorsPart}`)
			assert.equal(overrides.get(colorsPart), CT.colors, `${label}: ${colorsPart} content type`)
			assert.equal(pkg.documents.get(colorsPart)?.documentElement?.localName, 'colorStyle', `${label}: ${colorsPart} root`)
			assert.equal(Number(pkg.documents.get(colorsPart)?.documentElement?.getAttribute('id')), wanted.colorId, `${label}: ${colorsPart} native color id`)
		}

		if (wanted.family === 'legacy') {
			const workbookPart = resolveTarget(chartPart, workbooks[0].Target)
			reachedWorkbooks.add(workbookPart)
			const workbookBuffer = await pkg.zip.file(workbookPart).async('nodebuffer')
			workbookRows.push({ part: workbookPart, ...(await auditWorkbook(workbookBuffer, `${label}/${workbookPart}`)) })
			const styleNodes = elements(chartDocument, 'style').filter(node => String(node.namespaceURI || '').includes('/chart'))
			const numericStyles = styleNodes.map(node => Number(node.getAttribute('val'))).filter(Number.isFinite)
			if (wanted.gallery >= 1 && wanted.gallery <= 48) assert.ok(numericStyles.includes(wanted.gallery), `${label}: ${chartPart} c:style ${wanted.gallery}`)
			if (wanted.gallery === 49) assert.equal(numericStyles.includes(49), false, `${label}: legacy c:style cannot serialize invalid 49; relationship style resource owns variant 49`)
			const manualLayout = elements(chartDocument, 'manualLayout')[0]
			assert.ok(manualLayout, `${label}: ${chartPart} manual chart layout`)
			for (const key of ['x', 'y', 'w', 'h']) assert.ok(elements(manualLayout, key).length === 1, `${label}: ${chartPart} manual layout ${key}`)
		}

		chartRows.push({ slide: index + 1, objectName: wanted.objectName, family: wanted.family, type: wanted.type, chartPart, stylePart, colorsPart, workbookPart: workbooks[0] ? resolveTarget(chartPart, workbooks[0].Target) : null })
	}

	const actualCharts = pkg.names.filter(name => /^ppt\/charts\/chart(?:Ex)?\d+\.xml$/i.test(name)).sort()
	const actualStyles = pkg.names.filter(name => /^ppt\/charts\/(?:style|mcp-chart-style-).+\.xml$/i.test(name)).sort()
	const actualColors = pkg.names.filter(name => /^ppt\/charts\/(?:colors|mcp-chart-colors-).+\.xml$/i.test(name)).sort()
	const actualWorkbooks = pkg.names.filter(name => /^ppt\/embeddings\/.+\.xlsx$/i.test(name)).sort()
	assert.deepEqual([...reachedCharts].sort(), actualCharts, `${label}: no orphan chart parts`)
	assert.deepEqual([...reachedStyles].sort(), actualStyles, `${label}: no orphan chart style parts`)
	assert.deepEqual([...reachedColors].sort(), actualColors, `${label}: no orphan chart color parts`)
	assert.deepEqual([...reachedWorkbooks].sort(), actualWorkbooks, `${label}: no orphan embedded workbooks`)
	if (!officeNormalized) {
		assert.equal(new Set(chartRows.map(row => row.stylePart)).size, chartRows.length, `${label}: every chart has a distinct style part`)
		assert.equal(new Set(chartRows.map(row => row.colorsPart)).size, chartRows.length, `${label}: every chart has a distinct color part`)
	}
	assert.equal(new Set(chartRows.filter(row => row.workbookPart).map(row => row.workbookPart)).size, workbookRows.length, `${label}: every legacy chart has a distinct workbook`)
	return { label, partCount: pkg.names.length, chartRows, workbookRows }
}

function classifyRow(row) {
	if (/^Chart Design style /.test(row.label)) return 'styles'
	if (new Set(['add chart', 'betterpptx-mcp.chart.add', 'category axis', 'data labels', 'data table', 'fills', 'grid lines', 'legend', 'lines', 'series axis', 'value axis']).has(row.label)) return 'structural'
	if (new Set(['chart color XML', 'chart relationship preservation', 'chart style XML', 'Charts and ChartEx', 'embedded workbook']).has(row.label)) return 'package'
	if (/ using |substitute|KPI dashboard|funnel\/trapezoid|gauge\/progress/.test(row.label)) return 'shapeBuiltOrComposite'
	return 'typesAndPresets'
}

async function inventoryRows() {
	const matrix = JSON.parse(await fs.readFile(path.join(moduleDir, 'preset-decomposition-matrix.json'), 'utf8'))
	// Retired units intentionally disappear from the live implementation-gap
	// manifest. The two chart-family rows outside this completed unit are the
	// already-separate public recommend operation and chart-title capability.
	const rows = matrix.catalogRows
		.filter(row => row.family === 'charts' && !['betterpptx.chart.recommend', 'title'].includes(row.label))
		.map(row => ({ id: row.id, label: row.label, classification: classifyRow(row) }))
	assert.equal(rows.length, 120)
	assert.equal(new Set(rows.map(row => row.id)).size, 120)
	const counts = Object.fromEntries(['styles', 'typesAndPresets', 'structural', 'shapeBuiltOrComposite', 'package'].map(classification => [classification, rows.filter(row => row.classification === classification).length]))
	assert.deepEqual(counts, { styles: 49, typesAndPresets: 45, structural: 11, shapeBuiltOrComposite: 10, package: 5 })
	return { unit: { id: UNIT_ID, family: 'charts', fanOutRows: rows.length }, counts, rows }
}

function metadata(title) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title, layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', objectIdentity: 'stable-names-required' },
		contentStory: { audience: 'presentation authors', outcome: 'prove chart package lifecycle', remember: 'chart resources remain editable and repair-free' },
		visualDesign: { world: 'chart package proof', framing: 'one native chart per slide', tone: 'technical' },
		styleIntent: { artDirection: 'editorial', mode: 'light', density: 'focused' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide', syncPolicy: 'single clock' },
	}
}

const legacyData = multiplier => [
	{ name: 'Actual', labels: ['A', 'B', 'C', 'D'], values: [12, 20, 16, 29].map(value => value * multiplier) },
	{ name: 'Plan', labels: ['A', 'B', 'C', 'D'], values: [15, 18, 23, 26].map(value => value * multiplier) },
]
const waterfallData = multiplier => [{ name: 'Bridge', labels: ['Open', 'Win', 'Loss', 'Close'], values: [40, 15, -8, 47].map(value => value * multiplier) }]

function authoredSpec() {
	return {
		...metadata('Chart package lifecycle proof'),
		slides: [
			{ id: 'style-49', title: 'Legacy gallery style 49', message: 'Captured style and native color resource.', layoutIntent: 'title-only', content: [{ kind: 'chart-panel', name: INITIAL[0].objectName, objectName: INITIAL[0].objectName, chartType: 'bar', data: legacyData(1), chartOptions: { chartStylePresetId: 'office-chart-style-49', chartColorStyleId: 4, layout: { x: 0.12, y: 0.1, w: 0.78, h: 0.72 }, showTitle: true, title: 'Style 49 / Color 4', showLegend: true } }] },
			{ id: 'style-48', title: 'Legacy gallery style 48', message: 'Independent chart-owned style, color, and workbook parts.', layoutIntent: 'title-only', content: [{ kind: 'chart-panel', name: INITIAL[1].objectName, objectName: INITIAL[1].objectName, chartType: 'line', data: legacyData(1.2), chartOptions: { chartGalleryVariant: 48, chartColorStyleId: 12, layout: { x: 0.1, y: 0.08, w: 0.8, h: 0.74 }, showTitle: true, title: 'Style 48 / Color 12', showLegend: true, lineDataSymbol: 'diamond' } }] },
			{ id: 'waterfall', title: 'Native ChartEx waterfall', message: 'ChartEx style/color closure without an embedded workbook edge.', layoutIntent: 'title-only', content: [{ kind: 'chart-panel', name: INITIAL[2].objectName, objectName: INITIAL[2].objectName, chartType: 'waterfall', data: waterfallData(1), chartOptions: { chartColorStyleId: 5, chartColors: ['2563EB', '16A34A', 'DC2626'], showTitle: true, title: 'Waterfall / Color 5', showLegend: false } }] },
		],
	}
}

function reeditSpec() {
	const updates = [
		{ id: 'style-49', data: legacyData(1.5), optionsPatch: { chartStylePresetId: 'office-chart-style-47', chartColorStyleId: 11, layout: { x: 0.08, y: 0.06, w: 0.84, h: 0.78 }, title: 'Style 47 / Color 11' } },
		{ id: 'style-48', data: legacyData(1.7), optionsPatch: { chartGalleryVariant: 46, chartColorStyleId: 10, layout: { x: 0.07, y: 0.07, w: 0.86, h: 0.76 }, lineDataSymbol: 'triangle', title: 'Style 46 / Color 10' } },
		{ id: 'waterfall', data: waterfallData(1.3), optionsPatch: { chartColorStyleId: 6, title: 'Waterfall / Color 6' } },
	]
	return {
		...metadata('Chart package lifecycle proof re-edit'),
		slides: updates.map((update, slideIndex) => ({
			id: update.id,
			slideIndex,
			layoutIntent: 'title-only',
			content: [{
				kind: 'chart-panel',
				name: INITIAL[slideIndex].objectName,
				objectName: INITIAL[slideIndex].objectName,
				patch: { data: update.data, optionsPatch: update.optionsPatch },
			}],
		})),
	}
}

async function pptxBuffer(entry) {
	return Buffer.from(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }))
}

async function writeImmutable(file, value, encoding = undefined) {
	await fs.writeFile(file, value, { ...(encoding ? { encoding } : {}), flag: 'wx' })
}

async function checkpoint(outputDir, entry, name, expected, artifacts, lifecycle) {
	const buffer = await pptxBuffer(entry)
	const file = path.join(outputDir, `chart-package-${name}.pptx`)
	await writeImmutable(file, buffer)
	const inspection = await inspectPptx(buffer, name, expected)
	artifacts[name] = { file: relative(file), bytes: buffer.length, sha256: sha256(buffer) }
	lifecycle.push(inspection)
	return { file, buffer, inspection }
}

function assertExportedSpec(spec) {
	assert.equal(spec.slides?.length, 3, 'export: slides')
	const charts = spec.slides.map(slide => slide.content?.find(item => item.kind === 'chart-panel'))
	assert.ok(charts.every(Boolean), 'export: one chart block per slide')
	assert.deepEqual(charts.map(chart => chart.chartType), EDITED.map(item => item.type), 'export: chart types')
	assert.equal(charts[0].chartOptions.chartStylePresetId, 'office-chart-style-47', 'export: semantic style selector')
	assert.equal(charts[0].chartOptions.chartColorStyleId, 11, 'export: native color selector')
	assert.equal(charts[1].chartOptions.chartGalleryVariant, 46, 'export: gallery selector')
	assert.equal(charts[1].chartOptions.chartColorStyleId, 10, 'export: second color selector')
	assert.equal(charts[2].chartOptions.chartColorStyleId, 6, 'export: ChartEx color selector')
	return charts
}

function portableSpec(exported) {
	const result = structuredClone(exported)
	delete result.nativePackagePreservation
	for (const slide of result.slides || []) {
		delete slide.nativeTimingPreservation
		slide.content = (slide.content || []).filter(item => item.kind !== 'opaqueNative').map(item => {
			const { editHandle, nativePreservation, preservationHandle, ...portable } = item
			return portable
		})
	}
	return result
}

async function runOfficeProof(inputPath, outputPath, reportPath) {
	if (process.platform !== 'win32') return { status: 'dependency-gated', reason: 'Microsoft PowerPoint COM requires Windows.' }
	const generatedRenderDir = outputPath.replace(/\.pptx$/i, '-generated-renders')
	const reopenedRenderDir = outputPath.replace(/\.pptx$/i, '-reopened-renders')
	await run('powershell.exe', [
		'-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(moduleDir, 'verify-chart-package-lifecycle-unit-v1.ps1'),
		'-InputPath', inputPath, '-OutputPath', outputPath, '-ReportPath', reportPath,
		'-SourceRenderDir', generatedRenderDir, '-RoundtripRenderDir', reopenedRenderDir,
	], { cwd: workspaceRoot, timeout: 180000, maxBuffer: 30 * 1024 * 1024, windowsHide: true })
	const report = JSON.parse(await fs.readFile(reportPath, 'utf8'))
	assert.equal(report.status, 'PASS', JSON.stringify(report))
	assert.equal(report.openAndRepair, false)
	assert.equal(report.source.SlideCount, 3)
	assert.deepEqual(report.roundtrip, report.source, 'PowerPoint chart snapshot changed after SaveCopyAs/reopen')
	assert.deepEqual(report.source.Slides.map(slide => slide.ChartCount), [1, 1, 1], 'PowerPoint sees one chart per slide')
	assert.deepEqual(report.source.Slides.map(slide => slide.Charts[0]?.HasTitle), [true, true, true], 'PowerPoint must retain every authored legacy and ChartEx title')
	assert.deepEqual(report.source.Slides.map(slide => slide.Charts[0]?.Title), EDITED_TITLES, 'PowerPoint title readback must match the authored values')
	const renderEvidence = []
	for (let slide = 1; slide <= 3; slide++) {
		const generated = path.join(generatedRenderDir, `slide-${slide}.png`)
		const reopened = path.join(reopenedRenderDir, `slide-${slide}.png`)
		const [a, b] = await Promise.all([fs.readFile(generated), fs.readFile(reopened)])
		assert.equal(sha256(b), sha256(a), `slide-${slide}: PowerPoint render changed after SaveCopyAs/reopen`)
		renderEvidence.push({ slide, generated: { file: relative(generated), bytes: a.length, sha256: sha256(a) }, reopened: { file: relative(reopened), bytes: b.length, sha256: sha256(b) }, exactPngBytesEqual: true })
	}
	return { ...report, renderEvidence }
}

export async function runChartPackageLifecycleProof({ outputDir, office = false } = {}) {
	const inventory = await inventoryRows()
	const resolvedOutput = outputDir ? path.resolve(outputDir) : await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-chart-package-lifecycle-'))
	if (outputDir) await fs.mkdir(resolvedOutput, { recursive: false })
	assert.deepEqual(await fs.readdir(resolvedOutput), [], `Output directory must be new and empty: ${resolvedOutput}`)
	const { createMcpToolDispatcher, getDeck } = await import('./engine.mjs')
	const mcp = createMcpToolDispatcher({ sessionId: `chart-package-${Date.now()}`, clientInfo: { name: 'chart-package-verifier', version: '1' }, blackBox: false, __skipDurableOperationLedger: true, __skipDurableDeckPersistence: true })
	const deckIds = []
	const artifacts = {}
	const lifecycle = []
	let officeCheckpoint = null
	try {
		const created = dataOf('create chart deck', await mcp.call('betterpptx.deck.generate_from_spec', { spec: authoredSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' }))
		deckIds.push(created.deckId)
		const entry = getDeck(created.deckId)
		await checkpoint(resolvedOutput, entry, 'initial', INITIAL, artifacts, lifecycle)

		dataOf('public JSON-spec re-edit', await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: created.deckId,
			deckVersion: entry.deckVersion,
			spec: reeditSpec(),
			phase: 'commit',
			commitMode: 'patch',
			plan: 'premium',
			billingConfirmed: true,
			detail: 'full',
		}))
		const finalCheckpoint = await checkpoint(resolvedOutput, entry, 're-edited', EDITED, artifacts, lifecycle)

		const exported = dataOf('export chart spec', await mcp.call('betterpptx.deck.export_spec', { deckId: created.deckId, mode: 'current', download: false, detail: 'full' })).spec
		assertExportedSpec(exported)
		const exportPath = path.join(resolvedOutput, 'chart-package-exported-spec.json')
		await writeImmutable(exportPath, `${JSON.stringify(exported, null, 2)}\n`, 'utf8')
		artifacts.exportedSpec = { file: relative(exportPath), sha256: sha256(await fs.readFile(exportPath)) }

		const replay = dataOf('portable chart recompile', await mcp.call('betterpptx.deck.generate_from_spec', { spec: portableSpec(exported), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' }))
		deckIds.push(replay.deckId)
		await checkpoint(resolvedOutput, getDeck(replay.deckId), 'recompiled', EDITED, artifacts, lifecycle)
		const replayExport = dataOf('recompiled chart export', await mcp.call('betterpptx.deck.export_spec', { deckId: replay.deckId, mode: 'current', download: false, detail: 'full' })).spec
		assertExportedSpec(replayExport)

		if (office) {
			const outputPath = path.join(resolvedOutput, 'chart-package-office-savecopyas.pptx')
			const reportPath = path.join(resolvedOutput, 'chart-package-office-com.json')
			const report = await runOfficeProof(finalCheckpoint.file, outputPath, reportPath)
			const roundtripBuffer = await fs.readFile(outputPath)
			officeCheckpoint = { reportFile: relative(reportPath), roundtripFile: relative(outputPath), roundtripSha256: sha256(roundtripBuffer), package: await inspectPptx(roundtripBuffer, 'powerpoint-roundtrip', EDITED, { officeNormalized: true }), source: report.source, roundtrip: report.roundtrip, renderEvidence: report.renderEvidence }
			artifacts.officeRoundtrip = { file: relative(outputPath), bytes: roundtripBuffer.length, sha256: sha256(roundtripBuffer) }
		}

		return {
			schemaVersion: 'betterpptx.chart-package-lifecycle-unit-proof.v1', unitId: UNIT_ID,
			status: office ? 'CHART_PACKAGE_LIFECYCLE_AND_OFFICE_VERIFIED' : 'CHART_PACKAGE_LIFECYCLE_VERIFIED_OFFICE_GATED', generatedAt: new Date().toISOString(),
			inventory,
			checks: {
				exact120RowsInventoried: true, legacyChartXmlRelationshipWorkbookClosure: true, chartExStyleColorClosure: true,
				style49ResourceWithoutInvalidLegacyStyleId: true, chartOwnedStyleColorPartsAreDistinct: true,
				selectorReeditReplacesStaleResources: true, exportAndPortableRecompile: true,
				powerPointOpen2007SaveCopyAsReopen: Boolean(officeCheckpoint), postOfficePackageClosure: Boolean(officeCheckpoint),
				generatedAndReopenedRenderEquality: Boolean(officeCheckpoint?.renderEvidence?.every(item => item.exactPngBytesEqual)),
				legacyAndChartExTitleReadback: Boolean(officeCheckpoint?.source?.Slides?.every((slide, index) => slide.Charts?.[0]?.HasTitle === true && slide.Charts[0].Title === EDITED_TITLES[index])),
			},
			lifecycle, office: officeCheckpoint || { status: 'dependency-gated', reason: 'Pass --office or set BETTERPPTX_CHART_PACKAGE_OFFICE=1.' }, artifacts,
			manualVisualInspection: officeCheckpoint ? { status: 'required', evidence: officeCheckpoint.renderEvidence, instruction: 'Inspect all generated and reopened slide PNGs at original size before promotion.' } : { status: 'dependency-gated', reason: 'PowerPoint renders require --office.' },
			blockers: [], proofPath: relative(path.join(resolvedOutput, 'chart-package-lifecycle-unit-proof.json')),
		}
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
}

async function main() {
	const explicitOutput = process.env.BETTERPPTX_CHART_PACKAGE_OUTPUT
	const office = process.argv.includes('--office') || process.env.BETTERPPTX_CHART_PACKAGE_OFFICE === '1'
	let outputDir = explicitOutput
		? path.resolve(explicitOutput)
		: path.join(os.tmpdir(), `betterpptx-chart-package-lifecycle-${crypto.randomUUID()}`)
	try {
		const report = await runChartPackageLifecycleProof({ outputDir, office })
		const proofPath = path.join(outputDir, 'chart-package-lifecycle-unit-proof.json')
		const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
		await writeImmutable(proofPath, bytes)
		process.stdout.write(`${JSON.stringify({ ...report, proofPath: relative(proofPath), proofSha256: sha256(bytes) }, null, 2)}\n`)
	} catch (error) {
		const failureDir = outputDir
		await fs.mkdir(failureDir, { recursive: true })
		const proofPath = path.join(failureDir, 'chart-package-lifecycle-unit-proof.json')
		const report = { schemaVersion: 'betterpptx.chart-package-lifecycle-unit-proof.v1', unitId: UNIT_ID, status: 'CHART_PACKAGE_LIFECYCLE_BLOCKED', generatedAt: new Date().toISOString(), blockers: [{ message: error?.message || String(error), code: error?.code || null, stack: error?.stack || null }], proofPath: relative(proofPath) }
		const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
		await fs.writeFile(proofPath, bytes, { flag: 'wx' }).catch(() => {})
		process.stdout.write(`${JSON.stringify({ ...report, proofSha256: sha256(bytes) }, null, 2)}\n`)
		process.exitCode = 1
	}
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) await main()
