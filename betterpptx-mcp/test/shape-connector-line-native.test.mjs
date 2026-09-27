import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { resolveConnectorStyleComposition } from '../connector-style-contract.mjs'
import { applyConnectorStyleComposition } from '../source-api-gallery-presets.mjs'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')

test('native shape and connector lines serialize width, transparency, dash, arrows, and no-line reset', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addShape('roundRect', { x: 1, y: 1, w: 3, h: 1.2, objectName: 'line-shape', fill: { color: '16324F' }, line: { color: '38BDF8', transparency: 18.25, width: 2.5, dashType: 'lgDash', endArrowType: 'triangle', endArrowWidth: 'lg', endArrowLength: 'sm' } })
	slide.addShape('rect', { x: 1, y: 3, w: 3, h: 1, objectName: 'line-reset-shape', fill: { color: 'FFFFFF' }, line: { type: 'none' } })
	slide.addShape('rect', { x: 1, y: 4.5, w: 3, h: 1, objectName: 'themed-line-reset-shape', fill: { color: 'FFFFFF' }, line: { type: 'none' }, _rawShapeStyleXml: '<p:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef><a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef><a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef></p:style>' })
	slide.addConnector({ x: 4.2, y: 1.5, w: 2.1, h: 0.1, objectName: 'line-connector', line: { color: 'F97316', transparency: 7.5, width: 1.25, dashType: 'dashDot', beginArrowType: 'diamond', beginArrowWidth: 'sm', beginArrowLength: 'med', endArrowType: 'stealth', endArrowWidth: 'med', endArrowLength: 'lg' } })
	slide.addConnector({ x: 4.2, y: 3.5, w: 2.1, h: 0.1, objectName: 'line-reset-connector', line: { type: 'none' } })
	const typedOverride = applyConnectorStyleComposition({ x: 7, y: 1.5, w: 2.1, h: 0.1, objectName: 'typed-gallery-override' }, resolveConnectorStyleComposition({
		connectorStylePresetId: 'connector-ribbon-036',
		line: { width: 2, dashType: 'sysDot', endArrowType: 'oval', endArrowWidth: 'lg', endArrowLength: 'sm' },
	})).options
	slide.addConnector(typedOverride)
	const typedSparseDash = applyConnectorStyleComposition({ x: 7, y: 3, w: 2.1, h: 0.1, objectName: 'typed-gallery-dash' }, resolveConnectorStyleComposition({ connectorStylePresetId: 'connector-ribbon-023' })).options
	slide.addConnector(typedSparseDash)
	const typedThemeOnly = applyConnectorStyleComposition({ x: 7, y: 4.5, w: 2.1, h: 0.1, objectName: 'typed-gallery-theme-only' }, resolveConnectorStyleComposition({ connectorStylePresetId: 'connector-ribbon-001' })).options
	slide.addConnector(typedThemeOnly)
	const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bpx-shape-connector-line-'))
	const fileName = path.join(outDir, 'shape-connector-line-native.pptx')
	await pptx.writeFile({ fileName, compression: false })
	const zip = await JSZip.loadAsync(await fs.readFile(fileName))
	const xml = await zip.file('ppt/slides/slide1.xml').async('string')
	const named = name => {
		const start = xml.indexOf(`name="${name}"`)
		const ends = ['</p:sp>', '</p:cxnSp>'].map(token => xml.indexOf(token, start)).filter(index => index >= 0)
		return xml.slice(start, ends.length ? Math.min(...ends) : start + 2400)
	}
	const shape = named('line-shape')
	const resetShape = named('line-reset-shape')
	const themedResetShape = named('themed-line-reset-shape')
	const connector = named('line-connector')
	const resetConnector = named('line-reset-connector')
	const typedConnector = named('typed-gallery-override')
	const typedDash = named('typed-gallery-dash')
	const typedThemeOnlyConnector = named('typed-gallery-theme-only')
	assert.match(shape, /<a:ln w="31750"[^>]*>/)
	assert.match(shape, /<a:alpha val="81750"\/>/)
	assert.match(shape, /<a:prstDash val="lgDash"\/>/)
	assert.match(shape, /<a:tailEnd type="triangle" w="lg" len="sm"\/>/)
	assert.match(resetShape, /<a:ln><a:noFill\/><\/a:ln>/)
	assert.match(themedResetShape, /<a:ln><a:noFill\/><\/a:ln>/)
	assert.ok(themedResetShape.indexOf('<a:ln><a:noFill/></a:ln>') < themedResetShape.indexOf('<p:style>'))
	assert.match(connector, /<a:ln w="15875"[^>]*>/)
	assert.match(connector, /<a:alpha val="92500"\/>/)
	assert.match(connector, /<a:prstDash val="dashDot"\/>/)
	assert.match(connector, /<a:headEnd type="diamond" w="sm" len="med"\/>/)
	assert.match(connector, /<a:tailEnd type="stealth" w="med" len="lg"\/>/)
	assert.match(resetConnector, /<a:ln [^>]*><a:noFill\/>/)
	assert.match(typedConnector, /<a:ln w="25400"><a:prstDash val="sysDot"\/><a:headEnd type="triangle"\/><a:tailEnd type="oval" w="lg" len="sm"\/><\/a:ln>/)
	assert.doesNotMatch(typedConnector, /<a:tailEnd type="triangle"/)
	assert.match(typedConnector, /<p:style><a:lnRef idx="2"><a:schemeClr val="dk1"\/>/)
	assert.match(typedDash, /<a:ln><a:prstDash val="dash"\/><\/a:ln>/)
	assert.doesNotMatch(typedDash, /<a:ln w=|cap="flat"|cmpd="sng"|algn="ctr"/)
	assert.doesNotMatch(typedThemeOnlyConnector, /<a:ln(?:\s|>)/)
	assert.match(typedThemeOnlyConnector, /<p:style><a:lnRef idx="2"><a:schemeClr val="dk1"\/>/)
	const errors = []
	new DOMParser({ errorHandler: { warning: message => errors.push(message), error: message => errors.push(message), fatalError: message => errors.push(message) } }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [], `slide XML must remain well formed: ${errors.join('; ')}`)
	assert.ok(connector.indexOf('<a:solidFill>') < connector.indexOf('<a:prstDash'))
	assert.ok(connector.indexOf('<a:prstDash') < connector.indexOf('<a:headEnd'))
	assert.ok(connector.indexOf('<a:headEnd') < connector.indexOf('<a:tailEnd'))
})

test('shape and connector lines reject values that would create invalid DrawingML', () => {
	const cases = [
		line => ({ kind: 'connector', line }),
		line => ({ kind: 'shape', line }),
	]
	for (const make of cases) {
		for (const line of [
			{ width: Number.NaN }, { width: -1 }, { width: 1585 },
			{ transparency: Number.POSITIVE_INFINITY }, { transparency: -0.1 }, { transparency: 100.1 },
			{ type: 'gradient' }, { dashType: 'dash\"/><a:bad' },
			{ beginArrowType: 'triangle\"/><a:bad' }, { endArrowWidth: 'xl' }, { endArrowLength: 'tiny' },
		]) {
			const pptx = new PptxGenJS()
			const slide = pptx.addSlide()
			const input = make(line)
			const invoke = () => input.kind === 'connector'
				? slide.addConnector({ x: 1, y: 1, w: 2, h: 1, line: input.line })
				: slide.addShape('rect', { x: 1, y: 1, w: 2, h: 1, line: input.line })
			assert.throws(invoke, /line\.(?:width|transparency|type|dashType|beginArrowType|endArrowWidth|endArrowLength)/)
		}
	}
})
