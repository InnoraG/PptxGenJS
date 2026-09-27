import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import JSZip from 'jszip'

import { planDeckLayout } from '../ir/layout-engine.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { auditPptxAccessibilityMetadata, verifyPptxAccessibilityMetadataReport } from '../../tools/verify-pptx-accessibility-metadata.mjs'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')
const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

const EXPLICIT_ALT_TEXT = 'Representative cohorts retain 92%, 79%, and 61% — risk & opportunity stay visible.'
const IMPORTED_ALT_TEXT = 'Imported cohort evidence: weak adoption falls below 61% & needs intervention.'
const IMPORTED_SMALL_LABEL_ALT_TEXT = 'Imported control chart with deliberately undersized data labels.'
const EXPLICIT_TABLE_ALT_TEXT = 'Renewal risk is highest where adoption remains weak.'
const IMPORTED_TABLE_ALT_TEXT = 'Imported renewal table: weak adoption carries the highest risk.'
const EXPLICIT_SMARTART_ALT_TEXT = 'A four-step retention loop moves from detection through measured learning.'
const IMPORTED_SMARTART_ALT_TEXT = 'Imported four-step retention loop: "detect & learn".'

function dataOf(result) {
	assert.equal(result?.ok, true, JSON.stringify(result))
	return result.data || result
}

function semanticSmartArtSpec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'SmartArt accessibility compilation',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: {
			audience: 'retention operating reviewers',
			outcome: 'Understand the closed-loop operating response.',
			remember: 'Detection only matters when it closes into measured learning.',
		},
		handshake: {
			audience: 'retention operating reviewers',
			promise: 'Explain an accessible four-step native loop.',
			proof: ['The editable native diagram carries a concise semantic description.'],
			bar: 'The exact AI-authored description survives public export and package serialization.',
		},
		visualDesign: { world: 'Evidence-led retention operations', framing: 'One native operating loop with clear sequential hierarchy.', tone: 'clear' },
		styleIntent: { artDirection: 'observatory', mode: 'light' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'semantic slide plan', syncPolicy: 'single deck clock' },
		validation: { validateBeforeSave: true, requireAccessibility: true },
		slides: [{
			id: 'operating-loop',
			title: 'Retention loop',
			message: 'Turn evidence into action and learning.',
			layoutIntent: 'process-flow',
			content: [{
				kind: 'smartart',
				name: 'retention-loop',
				mode: 'native',
				layout: 'process',
				nodes: [
					{ text: 'DETECT', textColorRole: 'onDark' },
					{ text: 'DIAGNOSE', textColorRole: 'onDark' },
					{ text: 'INTERVENE', textColorRole: 'onDark' },
					{ text: 'LEARN', textColorRole: 'onDark' },
				],
				style: { textColorRole: 'onDark' },
				altText: EXPLICIT_SMARTART_ALT_TEXT,
				verified: true,
				evidenceSource: 'Synthetic accessibility regression fixture.',
			}],
		}],
	}
}

test('complete raw chart replay does not invent authoring-preset appearance fields', () => {
	const pptx = new PptxGenJS()
	const rawSlide = pptx.addSlide()
	rawSlide.addChart(pptx.ChartType.bar, [{ name: 'Retention', labels: ['A'], values: [92] }], {
		x: 0.8, y: 1.2, w: 5.0, h: 3.0,
		showValue: true,
		_rawChartXml: '<?xml version="1.0"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:barChart/></c:plotArea></c:chart></c:chartSpace>',
		_rawChartRelsXml: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
	})
	const rawChart = rawSlide._slideObjects.find(item => item?._type === 'chart')
	assert.ok(rawChart)
	assert.equal(rawChart.options.dataLabelFontSize, undefined)
	assert.equal(rawChart.options.dataLabelFontBold, undefined)
	assert.equal(rawChart.options.dataLabelColor, undefined)

	const authoredSlide = pptx.addSlide()
	authoredSlide.addChart(pptx.ChartType.bar, [{ name: 'Retention', labels: ['A'], values: [92] }], {
		x: 0.8, y: 1.2, w: 5.0, h: 3.0,
		showValue: true,
	})
	const authoredChart = authoredSlide._slideObjects.find(item => item?._type === 'chart')
	assert.equal(authoredChart.options.dataLabelFontSize, 9)
	assert.equal(authoredChart.options.dataLabelFontBold, true)
})

test('semantic chart compilation preserves the AI-authored alt text', () => {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Chart accessibility compilation',
		styleIntent: { artDirection: 'observatory', mode: 'light' },
		slides: [{
			id: 'cohort-proof',
			title: 'Cohort proof',
			message: 'A deliberately different fallback summary.',
			layoutIntent: 'title-body',
			content: [{
				kind: 'chart-panel',
				name: 'cohort-chart',
				chartType: 'bar',
				data: [{ name: 'Retention', labels: ['Strong', 'Mixed', 'Weak'], values: [92, 79, 61] }],
				altText: EXPLICIT_ALT_TEXT,
			}],
		}],
	}
	const plan = planDeckLayout(spec)
	const chart = plan.slides[0].objects.find(object => object.primitive === 'chart')
	assert.ok(chart, JSON.stringify(plan.slides[0]))
	assert.equal(chart.altText, EXPLICIT_ALT_TEXT)
	const compiled = buildSpecOperationPlan(spec)
	const operation = compiled.operations.find(item => item.tool === 'betterpptx.slide.add_chart')
	assert.ok(operation, JSON.stringify(compiled.errors || []))
	assert.equal(operation.args.options.altText, EXPLICIT_ALT_TEXT)
})

test('semantic table compilation preserves the AI-authored alt text', () => {
	const plan = planDeckLayout({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Table accessibility compilation',
		styleIntent: { artDirection: 'observatory', mode: 'light' },
		slides: [{
			id: 'risk-proof',
			title: 'Renewal risk',
			message: 'A deliberately different fallback summary.',
			layoutIntent: 'title-body',
			content: [{
				kind: 'table-panel',
				name: 'renewal-table',
				header: ['Cohort', 'Risk'],
				rows: [['Strong', 'Low'], ['Weak', 'High']],
				altText: EXPLICIT_TABLE_ALT_TEXT,
			}],
		}],
	})
	const table = plan.slides[0].objects.find(object => object.primitive === 'table')
	assert.ok(table, JSON.stringify(plan.slides[0]))
	assert.equal(table.altText, EXPLICIT_TABLE_ALT_TEXT)
})

test('semantic SmartArt compilation preserves the AI-authored alt text', () => {
	const spec = semanticSmartArtSpec()
	const plan = planDeckLayout(spec)
	const diagram = plan.slides[0].objects.find(object => object.primitive === 'smartart')
	assert.ok(diagram, JSON.stringify(plan.slides[0]))
	assert.equal(diagram.altText, EXPLICIT_SMARTART_ALT_TEXT)
	const compiled = buildSpecOperationPlan(spec)
	const operation = compiled.operations.find(item => item.tool === 'betterpptx.slide.add_smartart')
	assert.ok(operation, JSON.stringify(compiled.errors || []))
	assert.equal(operation.args.altText, EXPLICIT_SMARTART_ALT_TEXT)
})

test('public semantic SmartArt commit exports exact alt text and accessibility fails closed when it is absent', async () => {
	const mcp = createMcpToolDispatcher({
		sessionId: `smartart-alt-text-public-${Date.now()}`,
		clientInfo: { name: 'smartart-alt-text-public-test', version: '1' },
		blackBox: true,
	})
	let deckId = null
	try {
		const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: semanticSmartArtSpec(),
			phase: 'commit',
			commitMode: 'createNew',
			plan: 'premium',
			detail: 'full',
		}))
		deckId = committed.deckId
		const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId, detail: 'full' }))
		const smartArt = exported.spec.slides.flatMap(item => item.content || []).find(item => item.kind === 'smartart')
		assert.ok(smartArt, JSON.stringify(exported.spec))
		assert.equal(smartArt.altText, EXPLICIT_SMARTART_ALT_TEXT)
		const accessible = dataOf(await mcp.call('betterpptx.deck.validate_accessibility', { deckId }))
		assert.equal(accessible.passed, true, JSON.stringify(accessible))

		const entry = getDeck(deckId)
		const nativeSmartArt = entry.pptx.slides[0]._slideObjects.find(item => item?._type === 'smartart')
		assert.ok(nativeSmartArt, 'committed deck has no native SmartArt object')
		delete nativeSmartArt.options.altText
		const rejected = dataOf(await mcp.call('betterpptx.deck.validate_accessibility', { deckId }))
		assert.equal(rejected.passed, false, JSON.stringify(rejected))
		assert.equal((rejected.findings || []).some(item => item.code === 'MISSING_ALT_TEXT' && item.objectHandle === nativeSmartArt.options.objectName), true, JSON.stringify(rejected))
	} finally {
		if (deckId) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
})

test('public uploaded chart/table/SmartArt export and accessibility validation retain cNvPr descriptions', async () => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-chart-alt-'))
	const fixturePath = path.join(tempRoot, 'chart-alt-text.pptx')
	const pptx = new PptxGenJS()
	pptx.layout = 'LAYOUT_WIDE'
	const slide = pptx.addSlide()
	slide.addText('Imported chart accessibility', { x: 0.7, y: 0.45, w: 7.2, h: 0.6, fontSize: 30, bold: true, objectName: 'chart-title' })
	slide.addChart(pptx.ChartType.bar, [{ name: 'Retention', labels: ['Strong', 'Mixed', 'Weak'], values: [92, 79, 61] }], {
		x: 0.8, y: 1.35, w: 7.0, h: 4.8,
		objectName: 'cohort-chart',
		altText: IMPORTED_ALT_TEXT,
		showLegend: false,
		showValue: true,
		dataLabelFontSize: 12,
		dataLabelColor: '123456',
		dataLabelFontFace: 'Aptos',
		dataLabelFontBold: false,
	})
	slide.addTable([
		['Cohort', 'Renewal risk'],
		['Strong', 'Low'],
		['Mixed', 'Medium'],
		['Weak', 'High'],
	], {
		x: 8.35, y: 1.35, w: 4.1, h: 2.8,
		objectName: 'renewal-table',
		altText: IMPORTED_TABLE_ALT_TEXT,
		fontSize: 14,
	})
	slide.addSmartArt({
		mode: 'native',
		layout: 'process',
		nodes: [
			{ text: 'DETECT', color: '17324D' },
			{ text: 'DIAGNOSE', color: '17324D' },
			{ text: 'INTERVENE', color: '17324D' },
			{ text: 'LEARN', color: '17324D' },
		],
		x: 8.35, y: 4.45, w: 4.1, h: 1.7,
		objectName: 'retention-loop',
		altText: IMPORTED_SMARTART_ALT_TEXT,
		color: 'FFFFFF',
	})
	const smallLabelSlide = pptx.addSlide()
	smallLabelSlide.addText('Imported chart readability control', { x: 0.7, y: 0.45, w: 7.2, h: 0.6, fontSize: 30, bold: true, objectName: 'small-chart-title' })
	smallLabelSlide.addChart(pptx.ChartType.bar, [{ name: 'Retention', labels: ['Strong', 'Mixed', 'Weak'], values: [92, 79, 61] }], {
		x: 0.8, y: 1.35, w: 7.0, h: 4.8,
		objectName: 'small-cohort-chart',
		altText: IMPORTED_SMALL_LABEL_ALT_TEXT,
		showLegend: false,
		showValue: true,
		dataLabelFontSize: 9,
		dataLabelColor: '123456',
		dataLabelFontFace: 'Aptos',
		dataLabelFontBold: false,
	})
	await pptx.writeFile({ fileName: fixturePath })
	const fixtureZip = await JSZip.loadAsync(await fs.readFile(fixturePath))
	const chartNames = Object.keys(fixtureZip.files)
		.filter(name => /^ppt\/charts\/chart\d+\.xml$/.test(name))
		.sort((left, right) => Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0]))
	assert.equal(chartNames.length, 2, JSON.stringify(chartNames))
	const chart1Xml = await fixtureZip.file(chartNames[0]).async('string')
	const chart2Xml = await fixtureZip.file(chartNames[1]).async('string')
	assert.match(chart1Xml, /<a:defRPr[^>]*sz="1200"/)
	assert.match(chart2Xml, /<a:defRPr[^>]*sz="900"/)

	const mcp = createMcpToolDispatcher({
		sessionId: `chart-alt-text-roundtrip-${Date.now()}`,
		clientInfo: { name: 'chart-alt-text-roundtrip-test', version: '1' },
		blackBox: true,
	})
	let deckId = null
	try {
		const bytes = await fs.readFile(fixturePath)
		const opened = dataOf(await mcp.call('betterpptx.deck.open_uploaded', {
			data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${bytes.toString('base64')}`,
			fileName: 'chart-alt-text.pptx',
			preserveTiming: true,
		}))
		deckId = opened.deckId
		const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId, detail: 'full' }))
		const chart = exported.spec.slides.flatMap(item => item.content || []).find(item => item.objectName === 'cohort-chart')
		assert.ok(chart, JSON.stringify(exported.spec))
		assert.equal(chart.kind, 'chart-panel')
		assert.equal(chart.altText, IMPORTED_ALT_TEXT)
		assert.equal(chart.chartOptions.dataLabelFontSize, 12)
		assert.equal(chart.chartOptions.dataLabelColor, '123456')
		assert.equal(chart.chartOptions.dataLabelFontFace, 'Aptos')
		assert.equal(chart.chartOptions.dataLabelFontBold, false)
		assert.deepEqual(chart.data[0].labels.flat(Infinity), ['Strong', 'Mixed', 'Weak'])
		const smallLabelChart = exported.spec.slides.flatMap(item => item.content || []).find(item => item.objectName === 'small-cohort-chart')
		assert.ok(smallLabelChart, JSON.stringify(exported.spec))
		assert.equal(smallLabelChart.chartOptions.dataLabelFontSize, 9)
		const table = exported.spec.slides.flatMap(item => item.content || []).find(item => item.objectName === 'renewal-table')
		assert.ok(table, JSON.stringify(exported.spec))
		assert.equal(table.kind, 'table-panel')
		assert.equal(table.altText, IMPORTED_TABLE_ALT_TEXT)
		const smartArt = exported.spec.slides.flatMap(item => item.content || []).find(item => item.objectName === 'retention-loop')
		assert.ok(smartArt, JSON.stringify(exported.spec))
		assert.equal(smartArt.kind, 'smartart')
		assert.equal(smartArt.altText, IMPORTED_SMARTART_ALT_TEXT)

		const accessibility = dataOf(await mcp.call('betterpptx.deck.validate_accessibility', { deckId }))
		assert.equal(accessibility.passed, true, JSON.stringify(accessibility))
		assert.equal((accessibility.findings || []).some(item => item.code === 'MISSING_DATA_SUMMARY'), false, JSON.stringify(accessibility))
		assert.equal((accessibility.findings || []).some(item => item.code === 'MISSING_ALT_TEXT'), false, JSON.stringify(accessibility))
		const design = dataOf(await mcp.call('betterpptx.deck.validate_design', { deckId }))
		const smallText = design.readability?.findings?.smallText || []
		assert.equal(smallText.some(item => item.objectName === 'cohort-chart' && item.field === 'dataLabelFontSize'), false, JSON.stringify(design))
		assert.equal(smallText.some(item => item.objectName === 'small-cohort-chart' && item.field === 'dataLabelFontSize' && item.actualPt === 9), true, JSON.stringify(design))

		const expectedExportPath = path.join(tempRoot, 'pre-save-export-spec.json')
		await fs.writeFile(expectedExportPath, `${JSON.stringify(exported, null, 2)}\n`, 'utf8')
		const packageAccessibility = await auditPptxAccessibilityMetadata({ pptxPath: fixturePath, expectedExportPath })
		assert.equal(packageAccessibility.status, 'PASS', JSON.stringify(packageAccessibility))
		assert.equal(packageAccessibility.expectedObjectCount, 4)
		assert.equal(packageAccessibility.actualObjectCount, 4)
		const packageAccessibilityPath = path.join(tempRoot, 'post-save-accessibility.json')
		await fs.writeFile(packageAccessibilityPath, `${JSON.stringify(packageAccessibility, null, 2)}\n`, 'utf8')
		await verifyPptxAccessibilityMetadataReport({ pptxPath: fixturePath, expectedExportPath, reportPath: packageAccessibilityPath })

		const mismatched = structuredClone(exported)
		const mismatchedTable = mismatched.spec.slides.flatMap(item => item.content || []).find(item => item.objectName === 'renewal-table')
		mismatchedTable.altText = 'A deliberately different expected table description.'
		const mismatchedExportPath = path.join(tempRoot, 'mismatched-export-spec.json')
		await fs.writeFile(mismatchedExportPath, `${JSON.stringify(mismatched, null, 2)}\n`, 'utf8')
		const rejected = await auditPptxAccessibilityMetadata({ pptxPath: fixturePath, expectedExportPath: mismatchedExportPath })
		assert.equal(rejected.status, 'FAIL')
		assert.equal(rejected.exactMismatchCount, 1)
		assert.equal(rejected.findings.some(item => item.code === 'PACKAGE_ACCESSIBILITY_DESCRIPTION_MISMATCH'), true)
	} finally {
		if (deckId) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
		await fs.rm(tempRoot, { recursive: true, force: true })
	}
})
