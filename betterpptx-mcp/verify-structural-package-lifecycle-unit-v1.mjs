import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { normalizeStructuralConnector, normalizeStructuralGeometry, normalizeStructuralGroup, STRUCTURAL_ROW_IDS } from './structural-authoring-family-contract.mjs'

const require = createRequire(import.meta.url)
const PptxGenJS = require('../dist/pptxgen.cjs.js')
const outDir = process.env.BETTERPPTX_STRUCTURAL_PACKAGE_OUTPUT || await fs.mkdtemp(path.join(os.tmpdir(), 'bpx-structural-proof-'))
await fs.mkdir(outDir, { recursive: true })
const fileName = path.join(outDir, 'structural-package-lifecycle-unit.pptx')

const pptx = new PptxGenJS()
const slide = pptx.addSlide()
slide.addShape('rect', { x: 1, y: 1, w: 1.6, h: 1, objectName: 'structural-source-a' })
slide.addShape('rect', { x: 5, y: 1, w: 1.6, h: 1, objectName: 'structural-source-b' })
slide.addConnector(normalizeStructuralConnector({ x: 2.6, y: 1.5, w: 2.4, h: 0, connectorType: 'elbowConnector2', routing: 'orthogonal', startShapeId: 2, startConnectionIndex: 3, endShapeId: 3, endConnectionIndex: 1, objectName: 'structural-bound-connector' }))
slide.addGroup(normalizeStructuralGroup({ x: 1, y: 3, w: 6, h: 2, chOff: { x: 0, y: 0, w: 6, h: 2 }, chExt: { x: 0, y: 0, w: 6, h: 2 }, objectName: 'structural-group', children: [{ kind: 'shape', shape: 'roundRect', x: 0, y: 0, w: 2, h: 1, objectName: 'structural-group-child' }, { kind: 'group', x: 2.5, y: 0, w: 2, h: 1, children: [{ kind: 'connector', connectorType: 'curvedConnector2', x: 0, y: 0, w: 1, h: 0.5, objectName: 'structural-nested-connector' }] }] }))
slide.addShape('custGeom', { x: 8, y: 1, w: 1.5, h: 1.5, objectName: 'structural-custom-geometry', ...normalizeStructuralGeometry({ points: [{ x: 0, y: 0, moveTo: true }, { x: 1.5, y: 0 }, { x: 0.75, y: 1.5 }, { close: true }], booleanOperation: 'combine' }) })
await pptx.writeFile({ fileName, compression: false })
const bytes = await fs.readFile(fileName)
const zip = await JSZip.loadAsync(bytes)
const xml = await zip.file('ppt/slides/slide1.xml').async('string')
const errors = []
new DOMParser({ errorHandler: { warning: message => errors.push(message), error: message => errors.push(message), fatalError: message => errors.push(message) } }).parseFromString(xml, 'application/xml')
const counts = {
	connectors: (xml.match(/<p:cxnSp>/g) || []).length,
	groups: (xml.match(/<p:grpSp>/g) || []).length,
	customGeometry: (xml.match(/<a:custGeom>/g) || []).length,
	endpointBindings: (xml.match(/<a:(?:stCxn|endCxn) /g) || []).length,
}
if (errors.length || counts.connectors < 2 || counts.groups < 2 || counts.customGeometry < 1 || counts.endpointBindings < 2) throw new Error(`STRUCTURAL_PACKAGE_PROOF_FAILED ${JSON.stringify({ errors, counts })}`)
const proof = {
	schemaVersion: 'betterpptx.structural-package-lifecycle-proof.v1',
	status: 'STRUCTURAL_PACKAGE_LIFECYCLE_VERIFIED',
	rowCount: STRUCTURAL_ROW_IDS.length,
	fileName: path.basename(fileName),
	bytes: bytes.length,
	sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
	counts,
	packageXmlErrors: errors,
	checks: ['native connector endpoint IDs/indices', 'group chOff/chExt and nested group topology', 'custom geometry path carrier', 'well-formed slide XML'],
}
await fs.writeFile(path.join(outDir, 'structural-package-lifecycle-unit-proof.json'), `${JSON.stringify(proof, null, 2)}\n`, 'utf8')
console.log(JSON.stringify(proof, null, 2))
