import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import Ajv from 'ajv'

import {
	STRUCTURAL_BOOLEAN_OPERATIONS,
	STRUCTURAL_CONNECTOR_SCHEMA,
	STRUCTURAL_CONTRACT,
	STRUCTURAL_GEOMETRY_SCHEMA,
	STRUCTURAL_GROUP_SCHEMA,
	STRUCTURAL_POINT_SCHEMA,
	STRUCTURAL_ROW_IDS,
	STRUCTURAL_RUNTIME_INTEGRATION_COMPLETE,
	normalizeStructuralConnector,
	normalizeStructuralGeometry,
	normalizeStructuralGroup,
} from '../structural-authoring-family-contract.mjs'
import { classifyCatalogEntry } from '../capability-truth.mjs'
import { TOOLS } from '../tools.mjs'

const matrix = JSON.parse(fs.readFileSync(new URL('../preset-decomposition-matrix.json', import.meta.url), 'utf8'))
const deckSchema = JSON.parse(fs.readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
const unitRows = matrix.catalogRows.filter(row => STRUCTURAL_ROW_IDS.includes(row.id))

test('structural authoring unit owns the exact 21-row contract', () => {
	assert.equal(STRUCTURAL_RUNTIME_INTEGRATION_COMPLETE, true)
	assert.equal(unitRows.length, 21)
	assert.equal(new Set(unitRows.map(row => row.id)).size, 21)
	assert.equal(STRUCTURAL_CONTRACT.rowIds.length, 21)
	assert.ok(unitRows.every(row => classifyCatalogEntry({ ...row, sourceKind: 'capability-row', coverageMode: 'native-plus-preserve' }).capabilityStatus === 'executable-exact-structured'))
})

test('structural schemas compile and validators reject unsafe/private state', () => {
	const ajv = new Ajv({ allErrors: true, strict: false })
	for (const schema of [STRUCTURAL_CONNECTOR_SCHEMA, STRUCTURAL_GROUP_SCHEMA, STRUCTURAL_GEOMETRY_SCHEMA, STRUCTURAL_POINT_SCHEMA]) assert.doesNotThrow(() => ajv.compile(structuredClone(schema)))
	assert.deepEqual(normalizeStructuralConnector({ connectorType: 'elbowConnector2', routing: 'orthogonal', x: 1, y: 1, w: 2, h: 0, startShapeId: 2, startConnectionIndex: 3, endShapeId: 3, endConnectionIndex: 1 }), { connectorType: 'elbowConnector2', routing: 'orthogonal', x: 1, y: 1, w: 2, h: 0, startShapeId: 2, startConnectionIndex: 3, endShapeId: 3, endConnectionIndex: 1 })
	assert.throws(() => normalizeStructuralConnector({ connectorType: 'line' }), /supported native connector types/)
	assert.throws(() => normalizeStructuralConnector({ startConnectionIndex: 3 }), /requires startShapeId/)
	assert.throws(() => normalizeStructuralConnector({ _rawConnectorLineXml: '<a:ln\/>' }), /private/)
	const nested = normalizeStructuralGroup({ x: 1, y: 1, w: 6, h: 4, chOff: { x: 0, y: 0, w: 2, h: 2 }, chExt: { x: 0, y: 0, w: 4, h: 4 }, children: [{ kind: 'group', x: 0, y: 0, w: 2, h: 2, children: [{ kind: 'connector', connectorType: 'curvedConnector2', x: 0, y: 0, w: 1, h: 1 }] }] })
	assert.equal(nested.children[0].children[0].connectorType, 'curvedConnector2')
	assert.throws(() => normalizeStructuralGroup({ children: [] }), /between 1 and 256/)
	assert.throws(() => normalizeStructuralGeometry({ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], booleanOperation: 'xor' }), /booleanOperation/)
	assert.throws(() => normalizeStructuralGeometry({ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], _rawCustGeomXml: '<a:custGeom\/>' }), /private/)
	for (const operation of STRUCTURAL_BOOLEAN_OPERATIONS) assert.equal(normalizeStructuralGeometry({ points: [{ x: 0, y: 0, moveTo: true }, { x: 1, y: 1 }], booleanOperation: operation }).booleanOperation, operation)
})

test('public tools and deck-spec expose structural fields', () => {
	const connector = TOOLS.find(item => item.name === 'betterpptx.slide.add_connector')
	const group = TOOLS.find(item => item.name === 'betterpptx.slide.add_group')
	const freeform = TOOLS.find(item => item.name === 'betterpptx.slide.add_freeform')
	assert.ok(connector.inputSchema.properties.routing)
	assert.equal(group.inputSchema.properties.options.additionalProperties, false)
	assert.ok(freeform.inputSchema.properties.paths)
	assert.ok(freeform.inputSchema.properties.booleanOperation)
	const content = deckSchema.$defs.contentBlock.properties
	for (const key of ['routing', 'chOff', 'chExt', 'children', 'booleanOperation', 'operation', 'operands']) assert.ok(content[key], `contentBlock.${key}`)
	for (const key of ['structuralConnector', 'structuralGroup', 'structuralGeometry']) assert.ok(deckSchema.$defs[key], `$defs.${key}`)
})

test('structural metadata preserves only explicit boolean decorative values, including nested geometry', () => {
	const ajv = new Ajv({ allErrors: true, strict: false })
	const fixtures = [
		{ schema: STRUCTURAL_CONNECTOR_SCHEMA, normalize: normalizeStructuralConnector, input: { connectorType: 'straightConnector1' } },
		{ schema: STRUCTURAL_GEOMETRY_SCHEMA, normalize: normalizeStructuralGeometry, input: { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } },
		{ schema: STRUCTURAL_GROUP_SCHEMA, normalize: normalizeStructuralGroup, input: { children: [{ kind: 'shape', x: 0, y: 0, w: 1, h: 1 }] } },
	]
	for (const { schema, normalize, input } of fixtures) {
		const validate = ajv.compile(structuredClone(schema))
		for (const decorative of [true, false]) {
			const value = { ...input, decorative }
			assert.equal(validate(value), true, JSON.stringify(validate.errors))
			assert.equal(normalize(value).decorative, decorative)
		}
		assert.equal(Object.hasOwn(normalize(input), 'decorative'), false)
		for (const decorative of ['true', 1, null]) {
			assert.equal(validate({ ...input, decorative }), false)
			assert.throws(() => normalize({ ...input, decorative }), /decorative must be boolean/)
		}
	}
	const group = normalizeStructuralGroup({ children: [
		{ kind: 'connector', role: 'decorative', decorative: true },
		{ kind: 'freeform', decorative: false, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
		{ kind: 'group', decorative: true, children: [{ kind: 'textBox', text: 'Editable', decorative: false }] },
	] })
	assert.equal(group.children[0].decorative, true)
	assert.equal(group.children[1].decorative, false)
	assert.equal(group.children[2].children[0].decorative, false)
	assert.throws(() => normalizeStructuralGroup({ children: [{ kind: 'shape', decorative: 'true' }] }), /decorative must be boolean/)
})
