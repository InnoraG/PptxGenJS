import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')

const EPSILON = 1e-8

function relationshipDiagram(peerCount, host, objectName) {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addSmartArt({
		...host,
		layout: 'relationship',
		objectName,
		title: 'BOUND',
		fontSize: 16,
		nodes: [
			{ text: 'ROOT' },
			...Array.from({ length: peerCount }, (_, index) => ({ text: `PEER ${index + 1}` })),
		],
	})
	return slide._slideObjects
}

function geometry(object) {
	const x = Number(object.options?.x)
	const y = Number(object.options?.y)
	const w = Number(object.options?.w)
	const h = Number(object.options?.h)
	return { x, y, w, h, right: x + w, bottom: y + h }
}

function center(object) {
	const box = geometry(object)
	return { x: box.x + box.w / 2, y: box.y + box.h / 2 }
}

function directedEndpoints(connector) {
	const box = geometry(connector)
	return {
		start: {
			x: connector.options?.flipH ? box.right : box.x,
			y: connector.options?.flipV ? box.bottom : box.y,
		},
		end: {
			x: connector.options?.flipH ? box.x : box.right,
			y: connector.options?.flipV ? box.y : box.bottom,
		},
	}
}

function assertFiniteInHost(connectors, host) {
	for (const connector of connectors) {
		const box = geometry(connector)
		for (const value of [box.x, box.y, box.w, box.h, box.right, box.bottom]) assert.ok(Number.isFinite(value), connector.options?.objectName)
		assert.ok(box.x >= host.x - EPSILON, `${connector.options?.objectName} starts left of its host`)
		assert.ok(box.y >= host.y - EPSILON, `${connector.options?.objectName} starts above its host`)
		assert.ok(box.right <= host.x + host.w + EPSILON, `${connector.options?.objectName} ends right of its host`)
		assert.ok(box.bottom <= host.y + host.h + EPSILON, `${connector.options?.objectName} ends below its host`)
	}
}

function assertConnectorsBehindNodes(objects, connectors) {
	const firstNodeOrLabel = objects.findIndex(object => /-(node|label)-/.test(String(object.options?.objectName)))
	const lastConnector = Math.max(...connectors.map(connector => objects.indexOf(connector)))
	assert.ok(firstNodeOrLabel >= 0)
	assert.ok(lastConnector < firstNodeOrLabel, 'relationship connectors must be emitted before every node and label')
}

function assertDirectionsMatchPeers(objects, objectName, peerCount) {
	const root = objects.find(object => object.options?.objectName === `${objectName}-node-1`)
	assert.ok(root)
	const rootCenter = center(root)
	const directions = []
	for (let peerIndex = 1; peerIndex <= peerCount; peerIndex++) {
		const suffix = peerIndex + 1
		const peer = objects.find(object => object.options?.objectName === `${objectName}-node-${suffix}`)
		const connector = objects.find(object => object.options?.objectName === `${objectName}-connector-${suffix}`)
		assert.ok(peer)
		assert.ok(connector)
		const peerCenter = center(peer)
		const expected = { x: peerCenter.x - rootCenter.x, y: peerCenter.y - rootCenter.y }
		const endpoints = directedEndpoints(connector)
		const actual = { x: endpoints.end.x - endpoints.start.x, y: endpoints.end.y - endpoints.start.y }
		assert.ok(expected.x * actual.x + expected.y * actual.y >= -EPSILON, `${connector.options?.objectName} reversed direction`)
		if (Math.abs(expected.x) > EPSILON) assert.equal(Math.sign(actual.x), Math.sign(expected.x), `${connector.options?.objectName} lost its horizontal slope`)
		if (Math.abs(expected.y) > EPSILON) assert.equal(Math.sign(actual.y), Math.sign(expected.y), `${connector.options?.objectName} lost its vertical slope`)
		directions.push(expected)
	}
	return directions
}

test('root plus three peers keeps the lower-left relationship connector in-host and behind nodes', () => {
	const host = { x: 8.85, y: 1.42, w: 3.25, h: 4.7 }
	const objectName = 'three-peer-relationship'
	const objects = relationshipDiagram(3, host, objectName)
	const connectors = objects.filter(object => String(object.options?.objectName).startsWith(`${objectName}-connector-`))
	assert.equal(connectors.length, 3)
	assertFiniteInHost(connectors, host)
	assertConnectorsBehindNodes(objects, connectors)
	const directions = assertDirectionsMatchPeers(objects, objectName, 3)
	assert.ok(directions.some(direction => direction.x < -EPSILON && direction.y > EPSILON), 'fixture must exercise a lower-left connector')
})

test('root plus four peers stays finite and contained in a narrow one-third-slide host', () => {
	const host = { x: 8.92, y: 1.38, w: 3.1, h: 4.82 }
	const objectName = 'narrow-four-peer-relationship'
	const objects = relationshipDiagram(4, host, objectName)
	const connectors = objects.filter(object => String(object.options?.objectName).startsWith(`${objectName}-connector-`))
	assert.equal(connectors.length, 4)
	assertFiniteInHost(connectors, host)
	assertConnectorsBehindNodes(objects, connectors)
	assertDirectionsMatchPeers(objects, objectName, 4)
})

test('relationship connectors preserve upper-left and lower-left slopes across all quadrants', () => {
	const host = { x: 1.15, y: 1.3, w: 3.4, h: 4.9 }
	const objectName = 'all-quadrant-relationship'
	const objects = relationshipDiagram(5, host, objectName)
	const connectors = objects.filter(object => String(object.options?.objectName).startsWith(`${objectName}-connector-`))
	assertFiniteInHost(connectors, host)
	assertConnectorsBehindNodes(objects, connectors)
	const directions = assertDirectionsMatchPeers(objects, objectName, 5)
	assert.ok(directions.some(direction => direction.x < -EPSILON && direction.y < -EPSILON), 'fixture must exercise an upper-left connector')
	assert.ok(directions.some(direction => direction.x < -EPSILON && direction.y > EPSILON), 'fixture must exercise a lower-left connector')
	assert.ok(directions.some(direction => direction.x > EPSILON && direction.y < -EPSILON), 'fixture must exercise an upper-right connector')
	assert.ok(directions.some(direction => direction.x > EPSILON && direction.y > EPSILON), 'fixture must exercise a lower-right connector')
})
