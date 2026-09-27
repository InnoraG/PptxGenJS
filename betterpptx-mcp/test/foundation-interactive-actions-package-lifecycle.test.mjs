import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { DOMParser } from '@xmldom/xmldom'
import JSZip from 'jszip'
import { ACTION_BUTTON_SHAPE_NAMES } from '../interactive-actions-contract.mjs'
import {
	FOUNDATION_INTERACTIVE_ACTIONS_ROWS,
	FOUNDATION_INTERACTIVE_ACTIONS_UNIT_ID,
	probeFoundationInteractiveActionsRuntime,
	runFoundationInteractiveActionsUnitProof,
} from '../verify-foundation-interactive-actions-unit-v1.mjs'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')

test('interactive-action unit identity and canonical rows are frozen', () => {
	assert.equal(FOUNDATION_INTERACTIVE_ACTIONS_UNIT_ID, 'impl-b-5dc2c48339529baf')
	assert.equal(FOUNDATION_INTERACTIVE_ACTIONS_ROWS.length, 8)
	assert.equal(new Set(FOUNDATION_INTERACTIVE_ACTIONS_ROWS.map(([id]) => id)).size, 8)
})

test('interactive-action runtime probe is explicit before and after production support lands', async () => {
	const runtime = await probeFoundationInteractiveActionsRuntime()
	for (const key of ['objectClick', 'objectHover', 'actionSound', 'runHover', 'ready']) assert.equal(typeof runtime[key], 'boolean', key)
	assert.equal(runtime.ready, runtime.objectClick && runtime.objectHover && runtime.actionSound)
})

test('all twelve native action-button geometries retain an independent click action in package XML', async () => {
	const pptx = new PptxGenJS()
	pptx.layout = 'LAYOUT_WIDE'
	const slide = pptx.addSlide()
	for (const [index, shapeName] of ACTION_BUTTON_SHAPE_NAMES.entries()) {
		slide.addShape(shapeName, {
			x: 0.25 + (index % 6) * 2.1,
			y: 0.5 + Math.floor(index / 6) * 1.25,
			w: 0.8,
			h: 0.8,
			objectName: `proof-${shapeName}`,
			interactiveActions: { click: { type: 'jump', jump: 'firstSlide', tooltip: shapeName } },
		})
	}
	const buffer = await pptx.write({ outputType: 'nodebuffer', compression: false })
	const zip = await JSZip.loadAsync(buffer, { checkCRC32: true })
	const xml = await zip.file('ppt/slides/slide1.xml').async('string')
	const doc = new DOMParser().parseFromString(xml, 'application/xml')
	const shapeByName = new Map(Array.from(doc.getElementsByTagName('p:sp')).map(shape => {
		const cNvPr = shape.getElementsByTagName('p:cNvPr')[0]
		return [cNvPr?.getAttribute('name'), shape]
	}))
	for (const shapeName of ACTION_BUTTON_SHAPE_NAMES) {
		const shape = shapeByName.get(`proof-${shapeName}`)
		assert.ok(shape, shapeName)
		assert.equal(shape.getElementsByTagName('a:prstGeom')[0]?.getAttribute('prst'), shapeName, shapeName)
		assert.equal(shape.getElementsByTagName('a:hlinkClick')[0]?.getAttribute('action'), 'ppaction://hlinkshowjump?jump=firstslide', shapeName)
	}
})

test('strict package lifecycle runs when the native runtime is ready', async t => {
	const runtime = await probeFoundationInteractiveActionsRuntime()
	if (!runtime.ready) {
		t.skip(`native Action Settings runtime dependency gate: ${JSON.stringify(runtime)}`)
		return
	}
	const result = await runFoundationInteractiveActionsUnitProof({ office: false })
	assert.equal(result.status, 'FOUNDATION_INTERACTIVE_ACTIONS_PACKAGE_VERIFIED_OFFICE_GATED')
	assert.equal(result.lifecycle.length, 6)
	assert.equal(result.checks.currentSpecExportRecompileAndPrivateLeakage, true)
})
