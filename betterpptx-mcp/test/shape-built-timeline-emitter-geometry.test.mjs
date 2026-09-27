import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')

const EPSILON = 1e-8

function timelineDiagram(host, objectName) {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addSmartArt({
		...host,
		layout: 'timeline',
		objectName,
		fontSize: 16,
		nodes: [
			{ text: 'J1 · 1ST AVE' },
			{ text: 'J2 · 4TH AVE' },
			{ text: 'J3 · 7TH AVE' },
			{ text: 'J4 · RIVER RD' },
		],
	})
	return slide._slideObjects
}

function box(object) {
	const x = Number(object.options?.x)
	const y = Number(object.options?.y)
	const w = Number(object.options?.w)
	const h = Number(object.options?.h)
	return { x, y, w, h, right: x + w, bottom: y + h }
}

function assertInside(inner, outer, objectName) {
	for (const value of [inner.x, inner.y, inner.w, inner.h, inner.right, inner.bottom]) assert.ok(Number.isFinite(value), objectName)
	assert.ok(inner.x >= outer.x - EPSILON, `${objectName} starts left of its host`)
	assert.ok(inner.y >= outer.y - EPSILON, `${objectName} starts above its host`)
	assert.ok(inner.right <= outer.x + outer.w + EPSILON, `${objectName} ends right of its host`)
	assert.ok(inner.bottom <= outer.y + outer.h + EPSILON, `${objectName} ends below its host`)
}

test('four-node wide timeline emits responsive 2.2 by 0.9 inch nodes and roomy label frames', () => {
	const host = { x: 0.86, y: 1.42, w: 11.613, h: 3.305 }
	const objectName = 'wide-timeline'
	const objects = timelineDiagram(host, objectName)
	for (let index = 1; index <= 4; index++) {
		const node = objects.find(object => object.options?.objectName === `${objectName}-node-${index}`)
		const label = objects.find(object => object.options?.objectName === `${objectName}-label-${index}`)
		assert.ok(node)
		assert.ok(label)
		const nodeBox = box(node)
		const labelBox = box(label)
		assert.ok(Math.abs(nodeBox.w - 2.2) <= EPSILON)
		assert.ok(Math.abs(nodeBox.h - 0.9) <= EPSILON)
		assert.ok(Math.abs(labelBox.w - 2.04) <= EPSILON)
		assert.ok(Math.abs(labelBox.h - 0.576) <= EPSILON)
		assertInside(nodeBox, host, node.options?.objectName)
		assertInside(labelBox, nodeBox, label.options?.objectName)
	}
})

test('timeline vertical capacity keeps alternating nodes inside a short host', () => {
	const host = { x: 1.1, y: 1.25, w: 3.2, h: 0.8 }
	const objectName = 'short-timeline'
	const objects = timelineDiagram(host, objectName)
	for (let index = 1; index <= 4; index++) {
		const node = objects.find(object => object.options?.objectName === `${objectName}-node-${index}`)
		const label = objects.find(object => object.options?.objectName === `${objectName}-label-${index}`)
		assert.ok(node)
		assert.ok(label)
		const nodeBox = box(node)
		const labelBox = box(label)
		assert.ok(Math.abs(nodeBox.h - 0.18) <= EPSILON)
		assertInside(nodeBox, host, node.options?.objectName)
		assertInside(labelBox, nodeBox, label.options?.objectName)
	}
})
