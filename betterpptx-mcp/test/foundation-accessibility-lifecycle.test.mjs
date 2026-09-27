import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import Ajv from 'ajv'
import JSZip from 'jszip'

import { GENERIC_OPTIONS_SCHEMA } from '../blackbox.mjs'
import {
	normalizeAccessibilityMetadata,
	normalizeInternalAccessibilityMetadata,
} from '../accessibility-metadata-contract.mjs'
import { planDeckLayout } from '../ir/layout-engine.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const schema = JSON.parse(fs.readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
const ajvSchema = structuredClone(schema)
delete ajvSchema.$schema
const validateDeck = new Ajv({ allErrors: true, jsonPointers: true, unknownFormats: 'ignore' }).compile(ajvSchema)

const { createMcpToolDispatcher, getDeck, handleDeleteShapesForTest } = await import('../engine.mjs')

const XML_TITLE = 'Revenue "A&B" <Q1> — 東京'
const XML_ALT = 'Explains 42% & the <threshold> without losing "quoted" text.'

function dataOf(result, label = 'tool') {
	assert.equal(result?.ok, true, `${label}: ${JSON.stringify(result)}`)
	return result.data || result
}

function baseSpec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Foundation accessibility lifecycle',
		layout: 'LAYOUT_WIDE',
		authoringContract: {
			workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches',
			layerModel: 'flat-object-array', objectIdentity: 'stable-names-required', geometryAuthority: 'engine',
			placementPolicy: 'semantic-layout-only', textPolicy: 'Semantic content only; the engine owns geometry.',
		},
		contentStory: { audience: 'presentation authors', outcome: 'Prove exact accessibility metadata lifecycle.', remember: 'Object meaning and order remain editable.' },
		handshake: { audience: 'presentation authors', promise: 'Preserve native accessibility metadata.', proof: ['Three editable native shapes.'], bar: 'Create, import, export, reset, and reorder retain exact state.' },
		visualDesign: { world: 'Editorial accessibility proof', framing: 'Three native objects', tone: 'clear' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide', syncPolicy: 'single clock' },
		slides: [{
			id: 'proof',
			title: 'Accessibility proof',
			message: 'Metadata and object order remain editable.',
			layoutIntent: 'title-body',
			content: [
				{ kind: 'shape', name: 'alpha', shapeName: 'rect', title: XML_TITLE, altText: XML_ALT, decorative: false },
				{ kind: 'shape', name: 'beta', shapeName: 'ellipse', decorative: true },
				{ kind: 'shape', name: 'gamma', shapeName: 'roundRect', title: 'Explicitly included', hiddenFromAccessibility: false },
			],
		}],
	}
}

function patchSpec(objectName, fields = {}) {
	const { slides: _slides, ...root } = baseSpec()
	return {
		...root,
		title: 'Foundation accessibility patch',
		slides: [{
			id: 'proof',
			slideIndex: 0,
			content: [{ kind: 'shape', name: objectName, objectName, ...fields }],
		}],
	}
}

function exportedBlock(spec, token) {
	return spec.slides[0].content.find(block => String(block.objectName || block.name || '').includes(token))
}

test('schema and direct tools expose typed, collision-free accessibility vocabulary', () => {
	const spec = baseSpec()
	assert.equal(validateDeck(spec), true, JSON.stringify(validateDeck.errors))
	assert.equal(schema.$defs.contentBlock.properties.title.$ref, '#/$defs/imageAltText')
	assert.equal(schema.$defs.imageAltText.oneOf[1].maxLength, 4096)
	for (const field of ['title', 'altText', 'decorative', 'hiddenFromAccessibility', 'reorderToIndex']) {
		assert.ok(schema.$defs.contentBlock.properties[field], `missing content[].${field}`)
	}
	assert.ok(GENERIC_OPTIONS_SCHEMA.properties.accessibilityTitle)
	assert.ok(GENERIC_OPTIONS_SCHEMA.properties.isDecorative)
	assert.equal(GENERIC_OPTIONS_SCHEMA.properties.title, undefined, 'generic title must remain available to visible chart semantics, not be redefined as accessibility')
	assert.equal(GENERIC_OPTIONS_SCHEMA.properties.decorative, undefined)
	assert.equal(GENERIC_OPTIONS_SCHEMA.properties.hiddenFromAccessibility, undefined)

	const max = structuredClone(spec)
	max.slides[0].content[0].title = 'x'.repeat(4096)
	assert.equal(validateDeck(max), true, JSON.stringify(validateDeck.errors))
	max.slides[0].content[0].title += 'x'
	assert.equal(validateDeck(max), false)
	const badOrder = structuredClone(spec)
	badOrder.slides[0].content[0].reorderToIndex = 0.5
	assert.equal(validateDeck(badOrder), false)
})

test('normalization preserves false/null and rejects aliases or decorative metadata conflicts', () => {
	assert.deepEqual(normalizeAccessibilityMetadata({ title: 'T', altText: 'D', decorative: false }), {
		accessibilityTitle: 'T', altText: 'D', isDecorative: false,
	})
	assert.deepEqual(normalizeAccessibilityMetadata({ title: null, altText: null, hiddenFromAccessibility: null }), {
		accessibilityTitle: null, altText: null, isDecorative: null,
	})
	assert.deepEqual(normalizeInternalAccessibilityMetadata({ accessibilityTitle: 'T', altText: 'D', isDecorative: false }), {
		accessibilityTitle: 'T', altText: 'D', isDecorative: false,
	})
	assert.throws(() => normalizeAccessibilityMetadata({ decorative: false, hiddenFromAccessibility: true }), /must agree/)
	assert.throws(() => normalizeAccessibilityMetadata({ decorative: null, hiddenFromAccessibility: false }), /must agree/)
	assert.throws(() => normalizeAccessibilityMetadata({ title: 'Meaningful', decorative: true }), /cannot combine/)
	assert.throws(() => normalizeAccessibilityMetadata({ altText: 'Meaningful', hiddenFromAccessibility: true }), /cannot combine/)
	assert.throws(() => normalizeInternalAccessibilityMetadata({ accessibilityTitle: 'Meaningful', isDecorative: true }), /cannot combine/)
	assert.throws(() => normalizeAccessibilityMetadata({ altText: '' }), /non-empty/)
})

test('compiler uses the correct option carrier without stealing visible titles or decorative layout intent', () => {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Carrier proof', layout: 'LAYOUT_WIDE',
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		slides: [{ id: 'proof', title: 'Carrier proof', message: 'One carrier per family.', layoutIntent: 'title-body', content: [
			{ kind: 'chart-panel', name: 'chart', title: 'Accessible chart title', altText: 'Accessible chart description', decorative: false, chartType: 'bar', data: [{ name: 'Series', labels: ['A'], values: [1] }], chartOptions: { title: 'Visible chart title' }, bbox: { x: 0.5, y: 1, w: 3, h: 2 } },
			{ kind: 'smartart', name: 'smart', title: 'Accessible diagram title', altText: 'Accessible diagram description', decorative: false, layout: 'process', nodes: [{ text: 'A' }, { text: 'B' }], bbox: { x: 3.8, y: 1, w: 3, h: 2 } },
			{ kind: 'equation', name: 'equation', title: null, altText: null, decorative: null, source: 'x=1', bbox: { x: 0.5, y: 4, w: 2, h: 1 } },
			{ kind: 'freeform', name: 'freeform', title: 'Accessible vector title', altText: 'Accessible vector description', decorative: false, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], bbox: { x: 3.5, y: 4, w: 2, h: 1 } },
			{ kind: 'shape', name: 'decor', shapeName: 'ellipse', decorative: true, bbox: { x: 7, y: 4, w: 1, h: 1 } },
		] }],
	}
	const layout = planDeckLayout(spec)
	assert.equal(layout.slides[0].objects.find(object => object.blockName === 'decor').bleed, true, 'decorative must retain its historical layout hint')
	const compiled = buildSpecOperationPlan(spec, { plan: 'premium' })
	const operation = token => compiled.operations.find(item => String(item.objectName || '').includes(token))
	const chart = operation('chart')
	assert.equal(chart.args.options.title, 'Visible chart title')
	assert.equal(chart.args.options.accessibilityTitle, 'Accessible chart title')
	assert.equal(chart.args.options.altText, 'Accessible chart description')
	assert.equal(chart.args.options.isDecorative, false)
	const smart = operation('smart')
	assert.equal(smart.args.title, undefined)
	assert.equal(smart.args.accessibilityTitle, 'Accessible diagram title')
	assert.equal(smart.args.altText, 'Accessible diagram description')
	assert.equal(smart.args.isDecorative, false)
	const equation = operation('equation')
	assert.equal(equation.args.accessibilityTitle, null)
	assert.equal(equation.args.altText, null)
	assert.equal(equation.args.isDecorative, null)
	const freeform = operation('freeform')
	assert.equal(freeform.args.accessibilityTitle, 'Accessible vector title')
	assert.equal(freeform.args.altText, 'Accessible vector description')
	assert.equal(freeform.args.isDecorative, false)
	const decor = operation('decor')
	assert.equal(decor.args.options.isDecorative, true)
	assert.equal(decor.args.options.accessibilityTitle, undefined)
	assert.equal(decor.args.options.altText, undefined, 'compiler fallback text must not label a decorative object')
})

test('current-spec chart export removes recursive private series bookkeeping', async () => {
	const mcp = createMcpToolDispatcher({ __skipDurableOperationLedger: true, sessionId: `foundation-a11y-chart-${Date.now()}`, blackBox: false })
	let deckId = null
	try {
		const spec = baseSpec()
		spec.slides[0].content = [{
			kind: 'chart-panel', name: 'chart', chartType: 'bar',
			data: [{ name: 'Series', labels: ['A'], values: [1] }],
			title: 'Accessible chart', altText: 'One public data series.', decorative: false,
		}]
		const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}), 'create chart')
		deckId = committed.deckId
		const rel = getDeck(deckId).pptx.slides[0]._relsChart[0]
		rel.data[0]._dataIndex = 0
		rel.data[0].options = { ...(rel.data[0].options || {}), _dataIndex: 1, publicMarker: 'kept' }
		const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId, detail: 'full' }), 'export chart').spec
		const block = exportedBlock(exported, 'chart')
		assert.ok(block)
		assert.doesNotMatch(JSON.stringify(block.data), /_dataIndex/)
		assert.equal(block.data[0].options.publicMarker, 'kept')

		const slide = getDeck(deckId).pptx.slides[0]
		const chart = slide._slideObjects.find(object => object?._type === 'chart')
		chart.options._rawChartFallbackImageRid = 'rId999'
		slide._relsMedia.push({ rId: 999, type: 'image', data: 'fallback' })
		dataOf(await handleDeleteShapesForTest({ deckId, slideIndex: 0, target: { objectName: chart.options.objectName } }), 'delete chart')
		assert.equal(slide._relsChart.some(item => Number(item.rId) === Number(chart.chartRid)), false)
		assert.equal(slide._relsMedia.some(item => Number(item.rId) === 999), false)
	} finally {
		if (deckId) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
})

test('engine create/export/recompile/import/reset/re-edit/reorder lifecycle is exact', async () => {
	const mcp = createMcpToolDispatcher({ __skipDurableOperationLedger: true, sessionId: `foundation-a11y-${Date.now()}`, blackBox: false })
	const deckIds = []
	try {
		const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: baseSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}), 'create')
		deckIds.push(committed.deckId)
		let entry = getDeck(committed.deckId)
		let alpha = entry.pptx.slides[0]._slideObjects.find(object => String(object.options?.objectName || '').includes('alpha'))
		let beta = entry.pptx.slides[0]._slideObjects.find(object => String(object.options?.objectName || '').includes('beta'))
		let gamma = entry.pptx.slides[0]._slideObjects.find(object => String(object.options?.objectName || '').includes('gamma'))
		assert.equal(alpha.options.accessibilityTitle, XML_TITLE)
		assert.equal(alpha.options.altText, XML_ALT)
		assert.equal(alpha.options.isDecorative, false)
		assert.equal(beta.options.isDecorative, true)
		assert.equal(beta.options.altText, undefined)
		assert.equal(gamma.options.accessibilityTitle, 'Explicitly included')
		assert.equal(gamma.options.isDecorative, false)

		const bytes = await entry.pptx.write({ outputType: 'nodebuffer', compression: false })
		const zip = await JSZip.loadAsync(bytes, { checkCRC32: true })
		const slideXml = await zip.file('ppt/slides/slide1.xml').async('string')
		assert.match(slideXml, /title="Revenue &quot;A&amp;B&quot; &lt;Q1&gt; — 東京"/)
		assert.match(slideXml, /descr="Explains 42% &amp; the &lt;threshold&gt; without losing &quot;quoted&quot; text\."/)
		assert.match(slideXml, /<adec:decorative[^>]*val="0"/)
		assert.match(slideXml, /<adec:decorative[^>]*val="1"/)

		let exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' }), 'export').spec
		assert.doesNotMatch(JSON.stringify(exported), /accessibilityTitle|isDecorative|hiddenFromAccessibility/)
		let alphaBlock = exportedBlock(exported, 'alpha')
		let betaBlock = exportedBlock(exported, 'beta')
		let gammaBlock = exportedBlock(exported, 'gamma')
		assert.deepEqual({ title: alphaBlock.title, altText: alphaBlock.altText, decorative: alphaBlock.decorative }, { title: XML_TITLE, altText: XML_ALT, decorative: false })
		assert.equal(betaBlock.decorative, true)
		assert.equal(betaBlock.title, undefined)
		assert.equal(betaBlock.altText, undefined)
		assert.equal(gammaBlock.decorative, false)
		assert.equal(gammaBlock.hiddenFromAccessibility, undefined)

		const replayPlan = buildSpecOperationPlan(exported, { plan: 'premium' })
		const replayAlpha = replayPlan.operations.find(operation => String(operation.objectName || '').includes('alpha'))
		assert.equal(replayAlpha.args.options.accessibilityTitle, XML_TITLE)
		assert.equal(replayAlpha.args.options.altText, XML_ALT)
		assert.equal(replayAlpha.args.options.isDecorative, false)

		const replay = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: exported, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
		}), 'recompile')
		deckIds.push(replay.deckId)
		const replayAlphaObject = getDeck(replay.deckId).pptx.slides[0]._slideObjects.find(object => String(object.options?.objectName || '').includes('alpha'))
		assert.equal(replayAlphaObject.options.accessibilityTitle, XML_TITLE)
		assert.equal(replayAlphaObject.options.altText, XML_ALT)
		assert.equal(replayAlphaObject.options.isDecorative, false)

		const opened = dataOf(await mcp.call('betterpptx.deck.open_uploaded', {
			data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${bytes.toString('base64')}`,
			fileName: 'foundation-accessibility.pptx',
		}), 'open uploaded')
		deckIds.push(opened.deckId)
		const imported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: opened.deckId, detail: 'full' }), 'export imported').spec
		const importedAlpha = exportedBlock(imported, 'alpha')
		const importedBeta = exportedBlock(imported, 'beta')
		assert.equal(importedAlpha.title, XML_TITLE)
		assert.equal(importedAlpha.altText, XML_ALT)
		assert.equal(importedAlpha.decorative, false)
		assert.equal(importedBeta.decorative, true)

		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: committed.deckId,
			deckVersion: entry.deckVersion,
			commitMode: 'patch', phase: 'commit', plan: 'premium', billingConfirmed: true, detail: 'full',
			spec: patchSpec(alpha.options.objectName, { title: null, altText: null, decorative: null }),
		}), 'reset')
		entry = getDeck(committed.deckId)
		alpha = entry.pptx.slides[0]._slideObjects.find(object => object.options?.objectName === alpha.options.objectName)
		assert.equal(Object.hasOwn(alpha.options, 'accessibilityTitle'), false)
		assert.equal(Object.hasOwn(alpha.options, 'altText'), false)
		assert.equal(Object.hasOwn(alpha.options, 'isDecorative'), false)

		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId: committed.deckId,
			deckVersion: entry.deckVersion,
			commitMode: 'patch', phase: 'commit', plan: 'premium', billingConfirmed: true, detail: 'full',
			spec: patchSpec(beta.options.objectName, { title: 'Re-edited object', altText: 'Now meaningful.', decorative: false, reorderToIndex: 0 }),
		}), 're-edit/reorder')
		entry = getDeck(committed.deckId)
		beta = entry.pptx.slides[0]._slideObjects.find(object => object.options?.objectName === beta.options.objectName)
		assert.equal(beta.options.accessibilityTitle, 'Re-edited object')
		assert.equal(beta.options.altText, 'Now meaningful.')
		assert.equal(beta.options.isDecorative, false)
		exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' }), 'export final').spec
		assert.ok(String(exported.slides[0].content[0].objectName || '').includes('beta'), JSON.stringify(exported.slides[0].content.map(block => block.objectName)))
		betaBlock = exportedBlock(exported, 'beta')
		assert.deepEqual({ title: betaBlock.title, altText: betaBlock.altText, decorative: betaBlock.decorative }, { title: 'Re-edited object', altText: 'Now meaningful.', decorative: false })
	} finally {
		for (const deckId of deckIds) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
})
