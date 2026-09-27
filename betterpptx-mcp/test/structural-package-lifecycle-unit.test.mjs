import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../../dist/pptxgen.cjs.js')

test('structural native package carries connector endpoints, group coordinate spaces, and custGeom paths', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addShape('rect', { x: 1, y: 1, w: 1.5, h: 1, objectName: 'source-a', fill: { color: 'E2E8F0' } })
	slide.addShape('rect', { x: 5, y: 1, w: 1.5, h: 1, objectName: 'source-b', fill: { color: 'E2E8F0' } })
	slide.addConnector({ x: 2.5, y: 1.5, w: 2.5, h: 0, connectorType: 'elbowConnector2', routing: 'orthogonal', startShapeId: 2, startConnectionIndex: 3, endShapeId: 3, endConnectionIndex: 1, objectName: 'bound-connector', line: { color: '2563EB', width: 1.5 } })
	slide.addGroup({ x: 1, y: 3, w: 6, h: 3, chOff: { x: 0, y: 0, w: 3, h: 2 }, chExt: { x: 0, y: 0, w: 6, h: 3 }, objectName: 'outer-group', children: [
		{ kind: 'shape', shape: 'roundRect', x: 0, y: 0, w: 1.5, h: 0.8, objectName: 'group-node' },
		{ kind: 'group', x: 1.7, y: 0.2, w: 1, h: 1, objectName: 'inner-group', children: [{ kind: 'connector', connectorType: 'curvedConnector2', x: 0, y: 0, w: 0.8, h: 0.5, objectName: 'inner-connector' }] },
	] })
	slide.addShape('custGeom', { x: 8, y: 1, w: 2, h: 1.5, objectName: 'freeform-proof', points: [{ x: 0, y: 0, moveTo: true }, { x: 2, y: 0 }, { x: 1, y: 1.5 }, { close: true }], booleanOperation: 'combine', fill: { color: 'F97316' } })
	const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bpx-structural-'))
	const fileName = path.join(outDir, 'structural.pptx')
	await pptx.writeFile({ fileName, compression: false })
	const zip = await JSZip.loadAsync(await fs.readFile(fileName))
	const xml = await zip.file('ppt/slides/slide1.xml').async('string')
	assert.match(xml, /<p:cxnSp>[\s\S]*name="bound-connector"[\s\S]*<a:stCxn id="2" idx="3"\/><a:endCxn id="3" idx="1"\/>/)
	assert.match(xml, /<p:grpSp>[\s\S]*name="outer-group"[\s\S]*<a:chOff x="0" y="0"\/><a:chExt cx="5486400" cy="2743200"\/>/)
	assert.match(xml, /<p:grpSp>[\s\S]*name="inner-group"/)
	assert.match(xml, /name="inner-connector"[\s\S]*<a:cxnSpLocks\/><\/p:cNvCxnSpPr>/)
	assert.match(xml, /<p:sp>[\s\S]*name="freeform-proof"[\s\S]*<a:custGeom>/)
	const errors = []
	new DOMParser({ errorHandler: { warning: message => errors.push(message), error: message => errors.push(message), fatalError: message => errors.push(message) } }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [])
})
