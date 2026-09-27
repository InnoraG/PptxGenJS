import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import Ajv from 'ajv'

import {
	STRUCTURAL_GROUP_CHILD_SCHEMA,
	STRUCTURAL_LINE_CARRIER_SCHEMA,
	STRUCTURAL_SHAPE_LINE_CAPS,
	STRUCTURAL_SHAPE_LINE_KINDS,
	STRUCTURAL_SHAPE_LINE_SCHEMA,
	normalizeStructuralConnector,
	normalizeStructuralGroup,
} from '../structural-authoring-family-contract.mjs'
import { CONNECTOR_STYLE_LINE_SCHEMA } from '../connector-style-contract.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { TOOLS } from '../tools.mjs'

// No engine dispatcher, presentation package, media resolution or network use.
const schema = JSON.parse(fs.readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
const schemaCopy = structuredClone(schema)
delete schemaCopy.$schema
const ajv = new Ajv({ allErrors: true, jsonPointers: true, unknownFormats: 'ignore', multipleOfPrecision: 8 })
const validateDeck = ajv.compile(schemaCopy)
const validateStructuralChild = new Ajv({ allErrors: true, multipleOfPrecision: 8 }).compile(structuredClone(STRUCTURAL_GROUP_CHILD_SCHEMA))
const generate = TOOLS.find(tool => tool.name === 'betterpptx.deck.generate_from_spec')
const publicContentSchema = generate.inputSchema.properties.spec.properties.slides.items.properties.content.items
const validatePublicContent = new Ajv({ allErrors: true, multipleOfPrecision: 8 }).compile(structuredClone(publicContentSchema))
const pathPoints = [
	{ x: 0, y: 160, moveTo: true }, { x: 120, y: 160 },
	{ x: 160, y: 120, curve: { type: 'quadratic', x1: 160, y1: 160 } },
	{ x: 160, y: 0 }, { x: 240, y: 0 },
]

function object(kind, cap = 'round', name = `${kind}-stroke`) {
	return {
		kind, name, pixelFrame: { x: 24, y: 24, w: 240, h: 160 },
		...(kind === 'shape' ? { shapeName: 'line' } : { pixelPoints: structuredClone(pathPoints) }),
		style: { fill: { type: 'none' }, line: { color: '66DFFF', width: 2.65, ...(cap === undefined ? {} : { cap }) } },
	}
}
function specFor(content) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native cap contract', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Native presentation authors', outcome: 'Keep deliberate stroke caps.', remember: 'Vector paths remain native.' },
		visualDesign: { world: 'editorial', framing: 'Exact parent-local native geometry' },
		motionTime: { masterClock: 'authored', timingSource: 'native slide timeline' },
		visualReference: { mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1600, height: 900 }, mediaAssets: [] },
		slides: [{ id: 'native-caps', title: 'Native caps', layoutIntent: 'title-only', content }],
	}
}
function nested(child) {
	return { kind: 'group', name: 'outer', pixelFrame: { x: 100, y: 100, w: 480, h: 360 }, children: [
		{ kind: 'group', name: 'inner', pixelFrame: { x: 24, y: 24, w: 360, h: 240 }, children: [child] },
	] }
}

test('ordinary-shape line cap is a closed superset, separate from connector line', () => {
	assert.deepEqual(STRUCTURAL_SHAPE_LINE_CAPS, ['flat', 'round', 'square'])
	assert.deepEqual(schema.$defs.nativeLineCarrier.if.properties.kind.enum, STRUCTURAL_SHAPE_LINE_KINDS)
	assert.equal(schema.$defs.nativeShapeLine.oneOf[1].additionalProperties, false)
	assert.equal(STRUCTURAL_SHAPE_LINE_SCHEMA.oneOf[1].additionalProperties, false)
	assert.deepEqual(schema.$defs.nativeShapeLine.oneOf[1].properties.cap.enum, STRUCTURAL_SHAPE_LINE_CAPS)
	assert.deepEqual(STRUCTURAL_SHAPE_LINE_SCHEMA.oneOf[1].properties.cap.enum, STRUCTURAL_SHAPE_LINE_CAPS)
	assert.equal(schema.$defs.connectorLine.oneOf[1].additionalProperties, false)
	assert.equal(schema.$defs.connectorLine.oneOf[1].properties.cap, undefined)
	assert.equal(CONNECTOR_STYLE_LINE_SCHEMA.oneOf[1].properties.cap, undefined)
	for (const [key, value] of Object.entries(CONNECTOR_STYLE_LINE_SCHEMA.oneOf[1].properties)) {
		if (key === 'type') {
			assert.deepEqual(STRUCTURAL_SHAPE_LINE_SCHEMA.oneOf[1].properties.type.enum, ['none', 'solid', 'gradient'])
			assert.deepEqual(schema.$defs.nativeShapeLine.oneOf[1].properties.type.enum, ['none', 'solid', 'gradient'])
			assert.deepEqual(value.enum, ['none', 'solid'])
			continue
		}
		assert.deepEqual(STRUCTURAL_SHAPE_LINE_SCHEMA.oneOf[1].properties[key], value, `Do not change existing line field ${key}`)
		assert.equal(schema.$defs.nativeShapeLine.oneOf[1].properties[key].$ref, `#/$defs/connectorLine/oneOf/1/properties/${key}`)
	}
	assert.doesNotMatch(JSON.stringify(STRUCTURAL_LINE_CARRIER_SCHEMA), /sourcePath|filePath|_raw|<a:|<p:|processId|node_modules/)
})

test('all three caps validate on top-level and deeply nested ordinary/freeform shapes', () => {
	for (const kind of ['shape', 'freeform', 'customGeometry', 'custom-geometry']) {
		for (const cap of STRUCTURAL_SHAPE_LINE_CAPS) {
			for (const content of [[object(kind, cap)], [nested(object(kind, cap))]]) {
				assert.equal(validateDeck(specFor(content)), true, `${kind}/${cap}: ${JSON.stringify(validateDeck.errors)}`)
			}
			assert.equal(validatePublicContent(object(kind, cap)), true, JSON.stringify(validatePublicContent.errors))
			const grouped = { kind: 'group', name: 'public-group', pixelFrame: { x: 100, y: 100, w: 400, h: 300 }, children: [object(kind, cap)] }
			assert.equal(validatePublicContent(grouped), true, JSON.stringify(validatePublicContent.errors))
			const line = { color: '66DFFF', width: 2.65, cap }
			assert.equal(validateStructuralChild({ kind, name: `${kind}-${cap}`, x: 0, y: 0, w: 2, h: 1, line }), true, JSON.stringify(validateStructuralChild.errors))
			assert.equal(validateStructuralChild({ kind, name: `${kind}-${cap}`, x: 0, y: 0, w: 2, h: 1, style: { line } }), true, JSON.stringify(validateStructuralChild.errors))
		}
	}
})

test('unknown cap values, aliases, nulls and private line payloads fail closed', () => {
	for (const cap of ['rnd', 'sq', 'ROUND', '', null, 1, true, {}, 'round"/><a:ln>']) {
		const value = object('freeform', cap)
		assert.equal(validateDeck(specFor([nested(value)])), false, `Accepted cap ${JSON.stringify(cap)}`)
		assert.equal(validatePublicContent(value), false)
		assert.throws(() => normalizeStructuralGroup({ children: [{ kind: 'shape', style: { line: { cap } } }] }), /cap must be flat, round, or square/)
		assert.throws(() => buildSpecOperationPlan(specFor([nested(value)])), /cap must be flat, round, or square/)
	}
	for (const extra of [{ xml: '<a:ln/>' }, { sourcePath: 'private' }, { _rawLine: '<a:ln/>' }, { unknownStrokeOption: true }]) {
		const value = object('shape')
		Object.assign(value.style.line, extra)
		assert.equal(validateDeck(specFor([value])), false)
		assert.equal(validatePublicContent(value), false)
	}
})

test('native path caps survive the pure compiler without moving parent-local controls', () => {
	for (const cap of STRUCTURAL_SHAPE_LINE_CAPS) {
		const spec = specFor([nested(object('freeform', cap))])
		const before = structuredClone(spec)
		const compiled = buildSpecOperationPlan(spec)
		const group = compiled.operations.find(operation => operation.tool === 'betterpptx.slide.add_group')
		const path = group.args.options.children[0].children[0]
		assert.equal(path.style.line.cap, cap)
		assert.equal(path.style.line.width, 2.65)
		assert.equal(path.kind, 'freeform')
		assert.ok(Math.abs(path.x - 0.2) < 1e-7)
		assert.ok(Math.abs(path.y - 0.2) < 1e-7)
		assert.ok(Math.abs(path.points[2].curve.x1 - 160 / 120) < 1e-7)
		assert.ok(Math.abs(path.points[2].curve.y1 - 160 / 120) < 1e-7)
		assert.deepEqual(spec, before)
	}
})

test('connector cap remains outside its public contract at root and group-child levels', () => {
	for (const cap of STRUCTURAL_SHAPE_LINE_CAPS) {
		const connector = { kind: 'connector', name: 'connector', connectorType: 'straightConnector1', pixelFrame: { x: 24, y: 24, w: 240, h: 0 }, style: { line: { color: '66DFFF', width: 2, cap } } }
		assert.equal(validateDeck(specFor([connector])), false)
		assert.equal(validateDeck(specFor([nested(connector)])), false)
		assert.equal(validatePublicContent(connector), false)
		assert.equal(validatePublicContent({ kind: 'group', name: 'g', pixelFrame: { x: 0, y: 0, w: 400, h: 300 }, children: [connector] }), false)
		assert.equal(validateStructuralChild({ kind: 'connector', line: { cap } }), false)
		assert.equal(validateStructuralChild({ kind: 'connector', style: { line: { cap } } }), false)
		assert.throws(() => normalizeStructuralConnector({ line: { cap } }), /not part of the public connector/)
		assert.throws(() => normalizeStructuralGroup({ children: [{ kind: 'connector', style: { line: { cap } } }] }), /only on ordinary or freeform/)
	}
})

test('omitted and whole-line reset behavior and existing connector formatting remain unchanged', () => {
	for (const line of [undefined, null, { type: 'none' }, { color: '66DFFF', width: 2, dashType: 'sysDot', endArrowType: 'triangle', endArrowWidth: 'lg', endArrowLength: 'sm' }]) {
		const shape = object('shape')
		if (line === undefined) delete shape.style.line
		else shape.style.line = structuredClone(line)
		assert.equal(validateDeck(specFor([nested(shape)])), true, JSON.stringify(validateDeck.errors))
		const connector = { kind: 'connector', name: 'connector', connectorType: 'straightConnector1', pixelFrame: { x: 24, y: 24, w: 240, h: 0 }, style: line === undefined ? {} : { line } }
		assert.equal(validateDeck(specFor([connector])), true, JSON.stringify(validateDeck.errors))
		assert.equal(validatePublicContent(connector), true, JSON.stringify(validatePublicContent.errors))
		const normalized = normalizeStructuralGroup({ children: [{ kind: 'shape', style: line === undefined ? {} : { line } }] })
		assert.equal(Object.hasOwn(normalized.children[0].style.line || {}, 'cap'), false)
	}
})
