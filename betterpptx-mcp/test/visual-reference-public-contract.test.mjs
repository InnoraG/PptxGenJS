import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import Ajv from 'ajv'

import { TOOLS } from '../tools.mjs'
import { publicToolList } from '../blackbox.mjs'
import { STRUCTURAL_POINT_SCHEMA, normalizeStructuralGeometry } from '../structural-authoring-family-contract.mjs'
import { normalizeVisualReferenceReconstruction } from '../ir/visual-reference-reconstruction.mjs'

// Schema/guide checks only: no deck creation, asset registration, deployment,
// model transformation, or application automation.
const deckSchema = JSON.parse(fs.readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
delete deckSchema.$schema
const toolSchema = TOOLS.find(tool => tool.name === 'betterpptx.deck.generate_from_spec').inputSchema
const specToolSchema = toolSchema.properties.spec
const contentToolSchema = specToolSchema.properties.slides.items.properties.content.items
const guide = fs.readFileSync(new URL('../skills/betterpptx/references/visual-reference-reconstruction.md', import.meta.url), 'utf8')
const examples = [...guide.matchAll(/```json\s*([\s\S]*?)```/g)].map(match => JSON.parse(match[1]))
const makeValidator = schema => new Ajv({ allErrors: true, jsonPointers: true, unknownFormats: 'ignore' }).compile(schema)
const validateDeck = makeValidator(deckSchema)
const validateTool = makeValidator(toolSchema)
const validatePixelPoint = makeValidator({ ...deckSchema.$defs.pixelPoint, $defs: deckSchema.$defs })
const validateToolPoint = makeValidator(contentToolSchema.properties.pixelPoints.items)

function spec(content = []) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native pixel contract', layout: 'LAYOUT_WIDE',
		visualReference: {
			mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media',
			viewport: { width: 1600, height: 900 },
		},
		presenter: { id: 'host', identity: 'louise', pixelFrame: { x: 1180, y: 150, w: 350, h: 650 } },
		slides: [{ id: 's1', title: 'Native pixel contract', layoutIntent: 'title-only', content }],
	}
}

function assertSpecValidity(value, expected) {
	assert.equal(validateDeck(value), expected, `deck schema: ${JSON.stringify(validateDeck.errors)}`)
	assert.equal(validateTool({ spec: value, phase: 'dryRun' }), expected, `tool schema: ${JSON.stringify(validateTool.errors)}`)
}

function assertPointValidity(point, expected) {
	assert.equal(validatePixelPoint(point), expected, `deck pixel point: ${JSON.stringify(validatePixelPoint.errors)}`)
	assert.equal(validateToolPoint(point), expected, `tool pixel point: ${JSON.stringify(validateToolPoint.errors)}`)
}

test('both public schemas expose deck and per-slide exact presenter source-pixel frames', () => {
	assert.ok(specToolSchema.properties.presenter.properties.pixelFrame)
	assert.ok(specToolSchema.properties.slides.items.properties.presenter.properties.pixelFrame)
	assert.ok(deckSchema.properties.presenter.properties.pixelFrame)
	assert.ok(deckSchema.$defs.slide.properties.presenter.properties.pixelFrame)
	const value = spec()
	value.slides[0].pixelViewport = { width: 3200, height: 1800 }
	value.slides[0].presenter = { pixelFrame: { x: 2311.12345, y: 310.125, w: 761.2345, h: 1257.1234 } }
	assertSpecValidity(value, true)
})

test('presenter pixel frames require the explicit visualReference mode at both scopes', () => {
	for (const scope of ['deck', 'slide']) {
		for (const change of [
			value => { delete value.visualReference },
			value => { value.visualReference.mode = 'html-conversion' },
			value => { value.visualReference.coordinateMode = 'inches' },
		]) {
			const value = spec()
			if (scope === 'slide') {
				value.slides[0].presenter = { pixelFrame: value.presenter.pixelFrame }
				delete value.presenter.pixelFrame
			}
			change(value)
			assertSpecValidity(value, false)
		}
	}
	const semantic = spec()
	delete semantic.visualReference
	delete semantic.presenter.pixelFrame
	assertSpecValidity(semantic, true)
})

test('presenter frames require positive numeric dimensions without slide-inch ceilings', () => {
	for (const scope of ['deck', 'slide']) {
		for (const patch of [{ w: 0 }, { h: 0 }, { w: -1 }, { x: '1180' }, { h: '50%' }]) {
			const value = spec()
			const frame = { ...value.presenter.pixelFrame, ...patch }
			if (scope === 'deck') value.presenter.pixelFrame = frame
			else value.slides[0].presenter = { pixelFrame: frame }
			assertSpecValidity(value, false)
		}
	}
	const largeSource = spec()
	largeSource.visualReference.viewport = { width: 8000, height: 4500 }
	largeSource.presenter.pixelFrame = { x: 5900, y: 750, w: 1750, h: 3250 }
	assertSpecValidity(largeSource, true)
})

test('pixel-frame metadata never inherits the generic inches descriptions', () => {
	const pixelSchemas = [
		contentToolSchema.properties.pixelFrame,
		specToolSchema.properties.presenter.properties.pixelFrame,
		specToolSchema.properties.slides.items.properties.presenter.properties.pixelFrame,
		contentToolSchema.properties.children.items.properties.pixelFrame,
		contentToolSchema.properties.pixelPoints,
		contentToolSchema.properties.pixelPaths,
	]
	for (const schema of pixelSchemas) {
		const text = JSON.stringify(schema)
		assert.match(text, /source pixels|source-pixel/)
		assert.doesNotMatch(text, /inches|NN%/i)
		assert.doesNotMatch(text, /_visualReferenceFrame/)
	}
	assert.doesNotMatch(guide, /_visualReferenceFrame/)
})

test('public black-box schema keeps typed pixel authoring without exposing the internal frame', () => {
	const previous = process.env.BETTERPPTX_PUBLIC_BLACK_BOX
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
	try {
		const publicTool = publicToolList(TOOLS, { toolNameProfile: 'canonical' }).find(tool => tool.name === 'betterpptx.deck.generate_from_spec')
		assert.ok(publicTool)
		const publicSpec = publicTool.inputSchema.properties.spec
		assert.ok(publicSpec.properties.presenter.properties.pixelFrame)
		assert.ok(publicSpec.properties.slides.items.properties.presenter.properties.pixelFrame)
		const pixelPoints = publicSpec.properties.slides.items.properties.content.items.properties.pixelPoints
		assert.deepEqual(pixelPoints.items.properties.curve.properties.type.enum, ['cubic', 'quadratic'])
		assert.equal(pixelPoints.items.additionalProperties, false)
		assert.doesNotMatch(JSON.stringify(publicTool.inputSchema), /_visualReferenceFrame/)
		const validatePublic = makeValidator(publicTool.inputSchema)
		assert.equal(validatePublic({ spec: spec(), phase: 'dryRun' }), true, JSON.stringify(validatePublic.errors))
		const outsideMode = spec(); delete outsideMode.visualReference
		assert.equal(validatePublic({ spec: outsideMode, phase: 'dryRun' }), false)
	} finally {
		if (previous === undefined) delete process.env.BETTERPPTX_PUBLIC_BLACK_BOX
		else process.env.BETTERPPTX_PUBLIC_BLACK_BOX = previous
	}
})

test('closed structural point vocabulary is reused without changing its generic units or curves', () => {
	assert.deepEqual(deckSchema.$defs.structuralPoint, STRUCTURAL_POINT_SCHEMA)
	assert.equal(contentToolSchema.properties.pixelPoints.items.additionalProperties, false)
	assert.equal(contentToolSchema.properties.pixelPoints.items.properties.curve.additionalProperties, false)
	assert.deepEqual(STRUCTURAL_POINT_SCHEMA.properties.curve.properties.type.enum, ['arc', 'cubic', 'quadratic'])
})

test('both schemas type local move, line, close, cubic and quadratic native commands', () => {
	for (const point of [
		{ x: 0, y: 0, moveTo: true }, { x: 360, y: 180 }, { close: true },
		{ x: 80, y: 0, curve: { type: 'cubic', x1: 0, y1: 35, x2: 35, y2: 0 } },
		{ x: 360, y: 80, curve: { type: 'quadratic', x1: 360, y1: 0 } },
	]) assertPointValidity(point, true)
})

test('malformed or unsupported pixel commands are not advertised as valid native inputs', () => {
	for (const point of [
		{}, { close: false }, { x: 5 }, { x: '50%', y: 5 }, { x: 5, y: 5, moveTo: 'true' },
		{ x: 5, y: 5, command: 'M' }, { x: 5, y: 5, privateData: '<path/>' },
		{ x: 5, y: 5, curve: { type: 'cubic', x1: 1, y1: 1 } },
		{ x: 5, y: 5, curve: { type: 'quadratic', x1: 1 } },
		{ x: 5, y: 5, curve: { type: 'quadratic', x1: 1, y1: 1, x2: 2, y2: 2 } },
		{ x: 5, y: 5, curve: { type: 'arc', wR: 5, hR: 5, stAng: 0, swAng: 90 } },
	]) assertPointValidity(point, false)
})

test('native group children expose the same source-pixel frame and path vocabulary', () => {
	const child = contentToolSchema.properties.children.items.properties
	assert.deepEqual(child.pixelFrame, contentToolSchema.properties.pixelFrame)
	assert.deepEqual(child.pixelPoints, contentToolSchema.properties.pixelPoints)
	assert.deepEqual(child.pixelPaths, contentToolSchema.properties.pixelPaths)
	for (const key of ['pixelFrame', 'pixelPoints', 'pixelPaths']) assert.ok(deckSchema.$defs.nativeGroupChild.properties[key])
	assertSpecValidity(spec([{
		kind: 'group', name: 'parent', pixelFrame: { x: 100, y: 100, w: 600, h: 300 },
		children: [{ kind: 'freeform', name: 'child', pixelFrame: { x: 10, y: 20, w: 300, h: 200 }, pixelPoints: [{ x: 0, y: 0, moveTo: true }, { x: 300, y: 200 }] }],
	}]), true)
})

test('path collection limits match the bounded native structural contract', () => {
	for (const content of [
		{ kind: 'freeform', name: 'empty', pixelFrame: { x: 0, y: 0, w: 10, h: 10 }, pixelPoints: [] },
		{ kind: 'freeform', name: 'empty-paths', pixelFrame: { x: 0, y: 0, w: 10, h: 10 }, pixelPaths: [[]] },
		{ kind: 'freeform', name: 'too-many-paths', pixelFrame: { x: 0, y: 0, w: 10, h: 10 }, pixelPaths: Array.from({ length: 257 }, () => [{ x: 0, y: 0 }]) },
		{ kind: 'freeform', name: 'too-many-points', pixelFrame: { x: 0, y: 0, w: 10, h: 10 }, pixelPoints: Array.from({ length: 10001 }, () => ({ x: 0, y: 0 })) },
	]) assertSpecValidity(spec([content]), false)
})

test('local pixel paths require their own frame at top level and inside groups', () => {
	for (const pathField of ['pixelPoints', 'pixelPaths']) {
		const commands = [{ x: 0, y: 0, moveTo: true }, { x: 10, y: 10 }]
		const unframed = { kind: 'freeform', name: 'no-frame', [pathField]: pathField === 'pixelPoints' ? commands : [commands] }
		assertSpecValidity(spec([unframed]), false)
		assertSpecValidity(spec([{ kind: 'group', name: 'parent', pixelFrame: { x: 100, y: 100, w: 400, h: 300 }, children: [unframed] }]), false)
	}
})

test('published guide examples validate and preserve local Bézier controls through conversion', () => {
	const pathExamples = examples.filter(example => example.kind === 'freeform')
	assert.equal(pathExamples.length, 2)
	for (const example of pathExamples) assertSpecValidity(spec([example]), true)
	const source = spec(pathExamples)
	const before = structuredClone(source)
	const normalized = normalizeVisualReferenceReconstruction(source)
	const curve = normalized.slides[0].content[0]
	assert.deepEqual(source, before)
	assert.equal(curve.points[0].moveTo, true)
	assert.equal(curve.points[0].x, 0, 'source slide X must not leak into local path X')
	assert.ok(Math.abs(curve.points[1].curve.y1 - 35 / 900 * 7.5) < 1e-12)
	assert.ok(Math.abs(curve.points[1].curve.x2 - 35 / 1600 * 13.333333) < 1e-12)
	assert.ok(Math.abs(curve.points[3].curve.x1 - curve.bbox.w) < 1e-12)
	assert.equal(curve.points[3].curve.type, 'quadratic')
	assert.deepEqual(curve.points.at(-1), { close: true })
	for (const block of normalized.slides[0].content) assert.doesNotThrow(() => normalizeStructuralGeometry(block))
})

test('guide presenter example teaches viewport inheritance without claiming a new pose', () => {
	const example = examples.find(item => item.presenter)
	assert.ok(example)
	const value = { ...spec(), ...example, slides: example.slides.map(slide => ({ title: 'Placement example', layoutIntent: 'title-only', ...slide })) }
	assertSpecValidity(value, true)
	assert.match(guide, /not the visible body silhouette/)
	assert.match(guide, /safe idle opening pose remains unchanged/)
	assert.match(guide, /no animation time-offset control/)
	assert.match(guide, /Static previews cannot prove animation quality/)
})
