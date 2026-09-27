import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')
const width = 13.376
const height = 7.528

function fixture() {
	const pptx = new PptxGenJS()
	pptx.defineLayout({ name: 'EXACT_PIXEL_CANVAS', width, height })
	pptx.layout = 'EXACT_PIXEL_CANVAS'
	return { pptx, slide: pptx.addSlide() }
}

test('horizontal and vertical connectors, including border rules, retain native zero-axis extents', () => {
	const { pptx, slide } = fixture()
	for (const [name, x, y, w, h] of [
		['middle-horizontal', 1, 2, 3, 0], ['middle-vertical', 2, 1, 0, 3],
		['top', 0, 0, width, 0], ['bottom', 0, height, width, 0],
		['left', 0, 0, 0, height], ['right', width, 0, 0, height],
	]) slide.addConnector({ objectName: name, x, y, w, h })
	const result = pptx.validate({ mode: 'strict', checks: ['bounds', 'dimensions'] })
	assert.equal(result.valid, true, JSON.stringify(result.issues))
	assert.equal(slide._slideObjects[0].options.h, 0)
	assert.equal(slide._slideObjects[1].options.w, 0)
})

test('rounding tolerance does not excuse actual off-slide or zero-area geometry', () => {
	const { pptx, slide } = fixture()
	slide.addConnector({ objectName: 'outside', x: 1, y: 2, w: width - 1 + 0.001, h: 0 })
	slide.addConnector({ objectName: 'point', x: 2, y: 3, w: 0, h: 0 })
	slide.addShape('rect', { objectName: 'rectangle', x: 1, y: 1, w: 1, h: 1 })
	// Native records can also originate from an imported package. Check the
	// validator directly instead of allowing an authoring default to mask zero.
	slide._slideObjects.at(-1).options.w = 0
	const result = pptx.validate({ mode: 'strict', checks: ['bounds', 'dimensions'] })
	assert.equal(result.valid, false)
	assert.ok(result.issues.some(item => item.shapeName === 'outside' && item.code === 'ELEMENT_PARTIALLY_OFF_SLIDE'))
	assert.ok(result.issues.some(item => item.shapeName === 'point' && item.code === 'ZERO_WIDTH'))
	assert.ok(result.issues.some(item => item.shapeName === 'point' && item.code === 'ZERO_HEIGHT'))
	assert.ok(result.issues.some(item => item.shapeName === 'rectangle' && item.code === 'ZERO_WIDTH'))
})
