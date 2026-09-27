import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import JSZip from 'jszip'

import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { AI_SELECTION_MANIFEST_VERSION, materializeAiSelectionManifest, publicSelectionManifestContract } from '../ir/ai-selection-manifest.mjs'
import { verifySelectionManifestInPackage } from '../quality/selection-package-verifier.mjs'

function baseSpec(content, selections = [], enforcement = 'required') {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'AI native selection contract',
		layout: 'LAYOUT_WIDE',
		slides: [{ id: 's1', title: 'Proof', message: 'Show the selected native capability.', layoutIntent: 'title-body', content }],
		selectionManifest: {
			schemaVersion: AI_SELECTION_MANIFEST_VERSION,
			enforcement,
			selections,
		},
	}
}

const reason = 'This exact editable native treatment supports the story, audience, theme, and reading density.'

test('chart selector IDs survive semantic layout and reach the executable operation exactly', () => {
	const plan = buildSpecOperationPlan(baseSpec([
		{ kind: 'chart-panel', name: 'revenue', chartType: 'bar', data: [{ name: 'Revenue', labels: ['A', 'B'], values: [1, 2] }] },
	], [{ slideId: 's1', target: 'revenue', capability: 'chart', representation: 'native', coherenceReason: reason, selectors: { chartStylePresetId: 'office-chart-style-01' } }]), { plan: 'premium' })
	assert.equal(plan.selectionManifest.status, 'AI_SELECTIONS_COMPILED')
	assert.equal(plan.selectionManifest.compiledCount, 1)
	const operation = plan.operations.find(item => item.tool === 'betterpptx.slide.add_chart')
	assert.equal(operation.args.options.chartStylePresetId, 'office-chart-style-01')
})

test('shape selector IDs on a native text-shape reach the text-with-shape operation exactly', () => {
	const plan = buildSpecOperationPlan(baseSpec([
		{ kind: 'textShape', name: 'signal', shapeName: 'roundRect', text: 'Introduce → prove → resolve' },
	], [{
		slideId: 's1', target: 'signal', capability: 'shape', representation: 'native', coherenceReason: reason,
		selectors: { shapeStylePresetId: 'shape-style-075', shapeEffectPresetIds: ['shape-effect-shadow-002', 'shape-effect-bevel-007'] },
	}]), { plan: 'premium' })
	assert.equal(plan.selectionManifest.status, 'AI_SELECTIONS_COMPILED')
	assert.equal(plan.selectionManifest.compiledCount, 1)
	const operation = plan.operations.find(item => item.tool === 'betterpptx.slide.add_text' && item.objectName?.includes('signal'))
	assert.equal(operation.args.options.shapeStylePresetId, 'shape-style-075')
	assert.deepEqual(operation.args.options.shapeEffectPresetIds, ['shape-effect-shadow-002', 'shape-effect-bevel-007'])
})

test('diagram and SmartArt are native-first and preserve exact layout/style/color choices', () => {
	const selectors = {
		layoutId: 'urn:microsoft.com/office/officeart/2005/8/layout/process1',
		quickStyleId: 'urn:microsoft.com/office/officeart/2005/8/quickstyle/simple1',
		colorStyleId: 'urn:microsoft.com/office/officeart/2005/8/colors/accent1_2',
	}
	const plan = buildSpecOperationPlan(baseSpec([
		{ kind: 'diagram', name: 'process', style: { textColorRole: 'onDark' }, nodes: [{ text: 'Frame' }, { text: 'Choose' }, { text: 'Verify' }] },
	], [{ slideId: 's1', target: 'process', capability: 'smartart', representation: 'native', coherenceReason: reason, selectors }]), { plan: 'premium' })
	const object = plan.plan.slides[0].objects.find(item => item.blockName === 'process')
	const operation = plan.operations.find(item => item.tool === 'betterpptx.slide.add_smartart')
	assert.equal(object.mode, 'native')
	assert.equal(operation.args.mode, 'native')
	assert.equal(operation.args.layoutId, selectors.layoutId)
	assert.equal(operation.args.quickStyleId, selectors.quickStyleId)
	assert.equal(operation.args.colorStyleId, selectors.colorStyleId)
	assert.match(operation.args.color, /^[0-9A-F]{6}$/i)
	assert.equal(plan.errors.some(item => item.code === 'SMARTART_TEXT_POLARITY_UNRESOLVED'), false)
})

test('slide layout and transition preset IDs resolve before operation planning', () => {
	const selected = baseSpec([
		{ kind: 'textBox', name: 'copy', text: 'Native slide resources remain editable.' },
	], [
		{ slideId: 's1', capability: 'layout', representation: 'native', coherenceReason: reason, selectors: { layoutPresetId: 'layout-office-baseline-wide-004' } },
		{ slideId: 's1', capability: 'transition', representation: 'native', coherenceReason: reason, selectors: { transitionPresetId: 'transition-ribbon-003' } },
	])
	const plan = buildSpecOperationPlan(selected, { plan: 'premium' })
	const operation = plan.operations.find(item => item.tool === 'betterpptx.slide.add')
	assert.equal(operation.args.layoutName, 'Two Content')
	assert.equal(operation.args.transition.type, 'fade')
	assert.equal(plan.selectionManifest.compiledCount, 2)
})

test('a custom SmartArt construction requires a specific AI-authored reason', () => {
	assert.throws(() => materializeAiSelectionManifest({
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Invalid custom',
		slides: [{ id: 's1', content: [{ kind: 'diagram', name: 'process', mode: 'shape', nodes: [{ text: 'A' }] }] }],
	}), error => error.code === 'AI_CUSTOM_REASON_REQUIRED')

	const result = materializeAiSelectionManifest(baseSpec([
		{ kind: 'diagram', name: 'process', nodes: [{ text: 'A' }] },
	], [{
		slideId: 's1', target: 'process', capability: 'smartart', representation: 'custom',
		coherenceReason: reason,
		customReason: 'The requested free-form topology cannot be represented by any native SmartArt layout without changing meaning.',
		selectors: {},
	}]))
	assert.equal(result.spec.slides[0].content[0].mode, 'shape')
})

test('chartType is a content field and is rejected as a selectionManifest selector', () => {
	assert.throws(() => materializeAiSelectionManifest(baseSpec([
		{ kind: 'chart-panel', name: 'revenue', chartType: 'bar', data: [{ name: 'Revenue', labels: ['A'], values: [1] }] },
	], [{
		slideId: 's1', target: 'revenue', capability: 'chart', representation: 'native', coherenceReason: reason,
		selectors: { chartType: 'bar', chartPresetId: 'bar-clustered' },
	}])), error => error.code === 'AI_SELECTION_SELECTOR_INVALID')
})

test('the public selection-manifest contract lists executable keys and excludes semantic chartType', () => {
	const contract = publicSelectionManifestContract('chart')
	assert.equal(contract.capability, 'chart')
	assert.ok(contract.selectorKeys.includes('chartPresetId'))
	assert.equal(contract.selectorKeys.includes('chartType'), false)
	assert.ok(contract.contentFieldsNotSelectors.includes('chartType'))
})

test('the manifest never silently overwrites a conflicting object selector', () => {
	assert.throws(() => buildSpecOperationPlan(baseSpec([
		{ kind: 'chart-panel', name: 'revenue', chartType: 'bar', chartOptions: { chartStylePresetId: 'office-chart-style-02' }, data: [{ name: 'Revenue', labels: ['A'], values: [1] }] },
	], [{ slideId: 's1', target: 'revenue', capability: 'chart', representation: 'native', coherenceReason: reason, selectors: { chartStylePresetId: 'office-chart-style-01' } }])), error => error.code === 'AI_SELECTION_CONFLICT')
})

test('native table style selection is verified against the saved package', async () => {
	const zip = new JSZip()
	zip.file('ppt/slides/slide1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
		<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
			<p:cSld><p:spTree><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="2" name="s1.table.table"/></p:nvGraphicFramePr>
				<a:graphic><a:graphicData><a:tbl><a:tblPr><a:tableStyleId>{2D5ABB26-0587-4C30-8999-92F81FD0307C}</a:tableStyleId></a:tblPr></a:tbl></a:graphicData></a:graphic>
			</p:graphicFrame></p:spTree></p:cSld></p:sld>`)
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-selection-'))
	const file = path.join(dir, 'selection-proof.pptx')
	try {
		await fs.writeFile(file, await zip.generateAsync({ type: 'nodebuffer' }))
		const verification = await verifySelectionManifestInPackage(file, {
			enforcement: 'required',
			selections: [{
				slideId: 's1', slideIndex: 0, target: 'table', resolvedObjectName: 's1.table.table',
				capability: 'table', representation: 'native', requestedSelectors: { tableStylePresetId: 'table-style-001' }, nativeFeatures: [],
			}],
		}, { rootDir: path.resolve('.') })
		assert.equal(verification.ok, true)
		assert.equal(verification.status, 'SELECTIONS_VERIFIED_IN_PACKAGE')
		assert.equal(verification.verifiedCount, 1)
	} finally {
		await fs.rm(dir, { recursive: true, force: true })
	}
})

test('native clustered-bar chartPresetId is verified against the saved chart part', async () => {
	const zip = new JSZip()
	zip.file('ppt/slides/slide1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
		<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
			<p:cSld><p:spTree><p:graphicFrame>
				<p:nvGraphicFramePr><p:cNvPr id="2" name="s1.revenue.chart"/></p:nvGraphicFramePr>
				<a:graphic><a:graphicData><c:chart r:id="rId2"/></a:graphicData></a:graphic>
			</p:graphicFrame></p:spTree></p:cSld></p:sld>`)
	zip.file('ppt/slides/_rels/slide1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
		<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
			<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>
		</Relationships>`)
	zip.file('ppt/charts/chart1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
		<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
			<c:chart><c:plotArea><c:barChart>
				<c:barDir val="bar"/><c:grouping val="clustered"/>
			</c:barChart></c:plotArea></c:chart>
		</c:chartSpace>`)
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-selection-chart-'))
	const file = path.join(dir, 'selection-chart-proof.pptx')
	try {
		await fs.writeFile(file, await zip.generateAsync({ type: 'nodebuffer' }))
		const verification = await verifySelectionManifestInPackage(file, {
			enforcement: 'required',
			selections: [{
				slideId: 's1', slideIndex: 0, target: 'revenue', resolvedObjectName: 's1.revenue.chart',
				capability: 'chart', representation: 'native', chartType: 'bar',
				requestedSelectors: { chartPresetId: 'bar-clustered' }, nativeFeatures: [],
			}],
		}, { rootDir: path.resolve('.') })
		assert.equal(verification.ok, true)
		assert.equal(verification.status, 'SELECTIONS_VERIFIED_IN_PACKAGE')
		assert.equal(verification.verifiedCount, 1)
	} finally {
		await fs.rm(dir, { recursive: true, force: true })
	}
})

test('slide layout and transition selections are verified in the saved package', async () => {
	const zip = new JSZip()
	zip.file('ppt/slides/slide1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
		<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree/></p:cSld><p:transition><p:fade/></p:transition></p:sld>`)
	zip.file('ppt/slides/_rels/slide1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
		<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`)
	zip.file('ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
		<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="Two Content"><p:spTree/></p:cSld></p:sldLayout>`)
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-selection-slide-'))
	const file = path.join(dir, 'selection-slide-proof.pptx')
	try {
		await fs.writeFile(file, await zip.generateAsync({ type: 'nodebuffer' }))
		const verification = await verifySelectionManifestInPackage(file, {
			enforcement: 'required',
			selections: [
				{ slideId: 's1', slideIndex: 0, capability: 'layout', representation: 'native', requestedSelectors: { layoutPresetId: 'layout-office-baseline-wide-004' }, nativeFeatures: [] },
				{ slideId: 's1', slideIndex: 0, capability: 'transition', representation: 'native', requestedSelectors: { transitionPresetId: 'transition-ribbon-003' }, nativeFeatures: [] },
			],
		}, { rootDir: path.resolve('.') })
		assert.equal(verification.ok, true)
		assert.equal(verification.verifiedCount, 2)
	} finally {
		await fs.rm(dir, { recursive: true, force: true })
	}
})

test('an explicit custom exception still proves its authored object reached the package', async () => {
	const zip = new JSZip()
	zip.file('ppt/slides/slide1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
		<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
			<p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="s1.process.smartart-node-1"/></p:nvSpPr><p:spPr><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom></p:spPr></p:sp></p:spTree></p:cSld>
		</p:sld>`)
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-selection-custom-'))
	const file = path.join(dir, 'selection-custom-proof.pptx')
	try {
		await fs.writeFile(file, await zip.generateAsync({ type: 'nodebuffer' }))
		const verification = await verifySelectionManifestInPackage(file, {
			enforcement: 'required',
			selections: [{
				slideId: 's1', slideIndex: 0, target: 'process', resolvedObjectName: 's1.process.smartart',
				capability: 'smartart', representation: 'custom',
				customReason: 'Native SmartArt cannot express the required asymmetric feedback topology without changing meaning.',
				requestedSelectors: {}, nativeFeatures: [],
			}],
		}, { rootDir: path.resolve('.') })
		assert.equal(verification.ok, true)
		assert.equal(verification.verifiedCount, 1)
		assert.equal(verification.results[0].customObjectPresent, true)
	} finally {
		await fs.rm(dir, { recursive: true, force: true })
	}
})
