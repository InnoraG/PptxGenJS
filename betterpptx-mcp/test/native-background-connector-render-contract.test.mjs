import assert from 'node:assert/strict'
import test from 'node:test'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { createRequire } from 'node:module'
import { normalizeSlideBackground } from '../slide-background-contract.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

// Only this isolated process uses fixture entitlements; never a live endpoint.
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_FORCE_PLAN = 'premium'
const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')
const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')

const background = { fillType: 'gradient', gradientDirection: 'linear', gradientAngle: 90, gradientStops: [{ position: 0, color: '000611' }, { position: 50, color: '000A17' }, { position: 100, color: '000713' }] }

function fixture() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native background and direction', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Reviewers', outcome: 'Retain native fill and direction.', remember: 'A native rising line must rise.' },
		visualDesign: { world: 'editorial', framing: 'An exactly positioned vector connector.' },
		motionTime: { masterClock: 'authored', timingSource: 'native slide timeline' },
		visualReference: { mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1600, height: 900 }, mediaAssets: [] },
		slides: [{ id: 'native-direction', title: 'Native direction', layoutIntent: 'title-only', background,
			content: [{ kind: 'connector', name: 'rising', decorative: true, pixelFrame: { x: 120, y: 300, w: 360, h: 240 }, flipV: true, style: { line: { color: '00AAFF', width: 1.25 } } }],
		}],
	}
}

async function slideXml(pptx) {
	const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer', compression: false }))
	return new DOMParser().parseFromString(await zip.file('ppt/slides/slide1.xml').async('string'), 'application/xml')
}

test('documented background aliases normalize once, retaining all gradient fields and caller input', () => {
	const before = structuredClone(background)
	assert.deepEqual(normalizeSlideBackground(background), { type: 'gradient', gradientDirection: 'linear', gradientAngle: 90, gradientStops: before.gradientStops })
	assert.deepEqual(background, before)
	assert.deepEqual(normalizeSlideBackground({ fillColor: '123456', fillTransparency: 12.345 }), { color: '123456', transparency: 12.345 })
	assert.deepEqual(normalizeSlideBackground('#123456'), { color: '123456' })
	assert.equal(normalizeSlideBackground(null), null)
	assert.deepEqual(normalizeSlideBackground({ fillColor: null, fillType: null, fillTransparency: null }), {})
	assert.throws(() => normalizeSlideBackground({ type: 'solid', fillType: 'gradient' }), /must agree/)
	assert.throws(() => normalizeSlideBackground({ fillType: 'made-up' }), /supported native fill/)
	assert.throws(() => normalizeSlideBackground({ fillTransparency: 100.001 }), /percentage/)
	assert.throws(() => normalizeSlideBackground({ fillTransparency: 0.0001 }), /precision/)
})

test('public spec compile and commit retain native dark background and rising connector transform', async () => {
	const spec = fixture()
	const compiled = buildSpecOperationPlan(structuredClone(spec))
	assert.equal(compiled.operations.find(op => op.tool === 'betterpptx.slide.add').args.background.type, 'gradient')
	const mcp = createMcpToolDispatcher({ sessionId: `background-direction-${Date.now()}` })
	const committed = await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec, detail: 'full' })
	assert.equal(committed.ok, true, JSON.stringify(committed.error || committed))
	const pptx = getDeck(committed.data.deckId).pptx
	const doc = await slideXml(pptx)
	const bg = doc.getElementsByTagName('p:bg')[0]
	assert.ok(bg, 'native p:bg must exist; a successful compile is not enough')
	assert.equal(bg.getElementsByTagName('a:gradFill').length, 1)
	assert.deepEqual(Array.from(bg.getElementsByTagName('a:srgbClr')).map(node => node.getAttribute('val')), ['000611', '000A17', '000713'])
	const connector = Array.from(doc.getElementsByTagName('p:cxnSp')).find(node => node.getElementsByTagName('p:cNvPr')[0].getAttribute('name').includes('rising'))
	assert.ok(connector)
	assert.equal(connector.getElementsByTagName('a:xfrm')[0].getAttribute('flipV'), '1')
	assert.equal(doc.getElementsByTagName('p:pic').length, 0)
	const exported = await mcp.call('betterpptx.deck.export_spec', { deckId: committed.data.deckId, detail: 'full' })
	assert.equal(exported.ok, true)
	assert.equal(exported.data.spec.slides[0].background.type, 'gradient')
	assert.equal(exported.data.spec.slides[0].background.fillType, undefined)
})

test('top-level and group connectors keep flips, rotation, zero extents and native connector structure', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addConnector({ x: 1, y: 1, w: 2, h: 0, objectName: 'outside-group', connectorType: 'elbowConnector2', rotate: 35, flipH: true, flipV: true })
	slide.addGroup({ x: 4, y: 1, w: 3, h: 3, children: [
		{ kind: 'connector', x: 0, y: 0, w: 2, h: 0, objectName: 'inside-group', rotate: 15, flipV: true },
	] })
	const doc = await slideXml(pptx)
	const connectors = Array.from(doc.getElementsByTagName('p:cxnSp'))
	assert.equal(connectors.length, 2)
	for (const [index, connector] of connectors.entries()) {
		const transform = connector.getElementsByTagName('a:xfrm')[0]
		assert.equal(transform.getAttribute('flipV'), '1')
		assert.equal(transform.getAttribute('rot'), String((index === 0 ? 35 : 15) * 60000))
		assert.equal(transform.getElementsByTagName('a:ext')[0].getAttribute('cy'), '0')
	}
	assert.equal(connectors[0].getElementsByTagName('a:xfrm')[0].getAttribute('flipH'), '1')
	assert.equal(connectors[0].getElementsByTagName('a:prstGeom')[0].getAttribute('prst'), 'bentConnector2')
	assert.equal(connectors[1].parentNode.tagName, 'p:grpSp')
})

test('explicit no-fill background differs from omitted inherited background', async () => {
	const pptx = new PptxGenJS()
	pptx.addSlide().background = { type: 'none' }
	const doc = await slideXml(pptx)
	assert.equal(doc.getElementsByTagName('p:bg')[0].getElementsByTagName('a:noFill').length, 1)
})
