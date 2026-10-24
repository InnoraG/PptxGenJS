import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import Ajv from 'ajv'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import {
	STRUCTURAL_SHAPE_LINE_SCHEMA, normalizeStructuralShapeLine,
	normalizeStructuralConnector, normalizeStructuralGroup,
} from '../structural-authoring-family-contract.mjs'
import { CONNECTOR_STYLE_LINE_SCHEMA } from '../connector-style-contract.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { TOOLS } from '../tools.mjs'
import { publicToolList } from '../blackbox.mjs'
import { resolveShapeFormatting, SHAPE_STYLE_PRESET_IDS } from '../native-formatting-contract.mjs'
import deckSchema from '../ir/deck-spec.v1.json' with { type: 'json' }

// In-memory product proof only. Source mode neither rebuilds the shipped
// runtime nor creates a user deck, invokes Office, or uses a public service.
const require = createRequire(import.meta.url)
let PptxGenJS
if (process.env.BETTERPPTX_TEST_NATIVE_SOURCE === '1') {
	const ts = require('typescript')
	const previous = require.extensions['.ts']
	const sourceRoot = new URL('../../src/', import.meta.url).href
	const hook = registerHooks({ resolve(specifier, context, nextResolve) {
		if (context.parentURL?.startsWith(sourceRoot) && specifier.startsWith('.') && specifier.endsWith('.js')) {
			const typed = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL)
			if (existsSync(fileURLToPath(typed))) return nextResolve(fileURLToPath(typed), context)
		}
		return nextResolve(specifier, context)
	} })
	require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
		fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
	}).outputText, filename)
	try { PptxGenJS = require('../../src/pptxgen.ts').default } finally {
		hook.deregister()
		if (previous) require.extensions['.ts'] = previous
		else delete require.extensions['.ts']
	}
	globalThis[Symbol.for('betterpptx.test.gradient-stroke-source-runtime')] = PptxGenJS
	const runtimeEntry = new URL('../../dist/pptxgen.es.js', import.meta.url).href
	registerHooks({ load(url, context, nextLoad) {
		if (url === runtimeEntry) return { format: 'module', source: "export default globalThis[Symbol.for('betterpptx.test.gradient-stroke-source-runtime')]", shortCircuit: true }
		return nextLoad(url, context)
	} })
	process.env.BETTERPPTX_IMPORT_DIST_DIRECT = '1'
} else PptxGenJS = require('../../dist/pptxgen.cjs.js')
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_FORCE_PLAN = 'premium'
const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

const gradient = {
	type: 'gradient', gradientDirection: 'linear', gradientAngle: 0.125,
	gradientStops: [{ position: 0, color: '004466', transparency: 100 }, { position: 40.125, color: '99DDFF', transparency: 12.375 }, { position: 100, color: 'FFFFFF' }],
	rotateGradientWithShape: false, width: 1.25, cap: 'round', dashType: 'solid',
	endArrowType: 'triangle', endArrowWidth: 'sm', endArrowLength: 'lg',
}
const points = [
	{ x: 0, y: 0, moveTo: true },
	{ x: 1.2, y: 0.5, curve: { type: 'cubic', x1: 0.25, y1: 0.05, x2: 0.75, y2: 0.2 } },
	{ x: 2, y: 1, curve: { type: 'cubic', x1: 1.5, y1: 0.65, x2: 1.75, y2: 0.8 } },
]
const pixelPoints = points.map(point => ({ ...point, x: point.x * 120, y: point.y * 120, ...(point.curve ? {
	curve: Object.fromEntries(Object.entries(point.curve).map(([key, value]) => [key, key === 'type' ? value : value * 120])),
} : {}) }))
const dataOf = result => { assert.equal(result?.ok, true, JSON.stringify(result?.error || result)); return result.data || result }
const elementChildren = node => Array.from(node.childNodes).filter(child => child.nodeType === 1)

function object(kind, name, frame, line = gradient) {
	return {
		kind, name, objectName: name, pixelFrame: frame,
		...(kind === 'shape' ? { shapeName: 'rect' } : kind === 'textShape' ? { shape: 'rect', text: 'NATIVE' } : { pixelPoints: structuredClone(pixelPoints) }),
		style: { fill: { type: 'none' }, line: structuredClone(line), ...(kind === 'textShape' ? { fontSize: 18, color: 'FFFFFF', fit: 'none' } : {}), shadow: { type: 'outer', color: '17B5EF', opacity: 0.4, blurPt: 6, distancePt: 0, angleDeg: 90 } },
	}
}
function fixture() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native gradient strokes', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Reviewers', outcome: 'Preserve editable strokes.', remember: 'One path retains its native gradient.' },
		visualDesign: { world: 'editorial', framing: 'Exact parent-local native geometry' },
		motionTime: { masterClock: 'authored', timingSource: 'native slide timeline' },
		visualReference: { mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1600, height: 900 }, mediaAssets: [] },
		slides: [{ id: 'native-gradients', title: 'Native gradient strokes', layoutIntent: 'title-only', background: { color: '000611' }, content: [
			object('shape', 'panel', { x: 100, y: 80, w: 300, h: 140 }),
			object('freeform', 'path', { x: 100, y: 320, w: 240, h: 120 }),
			object('textShape', 'text-border', { x: 100, y: 550, w: 300, h: 80 }),
			{ kind: 'group', name: 'outer', pixelFrame: { x: 700, y: 80, w: 640, h: 650 }, children: [
				object('freeform', 'group-path', { x: 24, y: 24, w: 240, h: 120 }),
				{ kind: 'group', name: 'inner', pixelFrame: { x: 24, y: 280, w: 360, h: 250 }, children: [object('freeform', 'nested-path', { x: 36, y: 48, w: 240, h: 120 })] },
			] },
		] }],
	}
}
function named(doc, name) {
	const identity = Array.from(doc.getElementsByTagName('p:cNvPr')).find(node => node.getAttribute('name') === name || node.getAttribute('name').endsWith(`.${name}`))
	assert.ok(identity, `Missing native object ${name}`)
	return identity.parentNode.parentNode
}
function lineOf(doc, name) {
	const spPr = named(doc, name).getElementsByTagName('p:spPr')[0]
	const line = elementChildren(spPr).find(child => child.tagName === 'a:ln')
	assert.ok(line, `Missing native line ${name}`)
	return line
}
function geometryOf(doc, name) { return named(doc, name).getElementsByTagName('a:custGeom')[0].toString() }
function roundedPoints(value) {
	if (typeof value === 'number') return Math.round(value * 1e6) / 1e6
	if (Array.isArray(value)) return value.map(roundedPoints)
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, roundedPoints(item)]))
	return value
}
async function inspect(pptx) {
	const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer', compression: false }))
	const xml = await zip.file('ppt/slides/slide1.xml').async('string')
	const errors = []
	const doc = new DOMParser({ errorHandler: { warning: message => errors.push(message), error: message => errors.push(message), fatalError: message => errors.push(message) } }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [])
	return { zip, xml, doc }
}
function assertGradient(line) {
	assert.equal(line.getAttribute('cap'), 'rnd')
	assert.equal(line.getAttribute('w'), '15875')
	const fill = line.getElementsByTagName('a:gradFill')[0]
	assert.ok(fill, `Missing gradient fill in ${line.toString()}`)
	assert.equal(line.getElementsByTagName('a:solidFill').length, 0)
	assert.equal(fill.getAttribute('rotWithShape'), '0')
	assert.equal(fill.getElementsByTagName('a:lin')[0].getAttribute('ang'), '7500')
	assert.deepEqual(Array.from(fill.getElementsByTagName('a:gs')).map(stop => stop.getAttribute('pos')), ['0', '40125', '100000'])
	assert.deepEqual(Array.from(fill.getElementsByTagName('a:alpha')).map(alpha => alpha.getAttribute('val')), ['0', '87625'])
	assert.equal(line.getElementsByTagName('a:tailEnd')[0].getAttribute('type'), 'triangle')
}

test('nativeShapeLine exposes a closed linear stop contract without expanding connectorLine', () => {
	const validateLine = new Ajv({ allErrors: true, multipleOfPrecision: 8 }).compile(STRUCTURAL_SHAPE_LINE_SCHEMA)
	const schema = structuredClone(deckSchema)
	delete schema.$schema
	const validateDeck = new Ajv({ allErrors: true, jsonPointers: true, unknownFormats: 'ignore', multipleOfPrecision: 8 }).compile(schema)
	const generate = publicToolList(TOOLS, { fullSchemas: true }).find(tool => tool.name === 'betterpptx.deck.generate_from_spec')
	const publicBlock = generate.inputSchema.properties.spec.properties.slides.items.properties.content.items
	const validatePublic = new Ajv({ allErrors: true, multipleOfPrecision: 8 }).compile(publicBlock)
	assert.deepEqual(CONNECTOR_STYLE_LINE_SCHEMA.oneOf[1].properties.type.enum, ['none', 'solid'])
	assert.equal(CONNECTOR_STYLE_LINE_SCHEMA.oneOf[1].properties.gradientStops, undefined)
	assert.equal(validateLine(gradient), true, JSON.stringify(validateLine.errors))
	assert.equal(validateDeck(fixture()), true, JSON.stringify(validateDeck.errors))
	for (const block of fixture().slides[0].content) assert.equal(validatePublic(block), true, JSON.stringify(validatePublic.errors))
	assert.doesNotMatch(JSON.stringify(STRUCTURAL_SHAPE_LINE_SCHEMA), /sourcePath|filePath|_raw|<a:|<p:|processId|node_modules|\.mjs/)
	assert.deepEqual(normalizeStructuralShapeLine(gradient), gradient)
	const normalized = normalizeStructuralShapeLine({ type: 'gradient', gradientStops: [{ position: 0, color: '#aabbcc' }, { position: 100, color: 'accent1' }] })
	assert.equal(normalized.gradientStops[0].color, 'AABBCC')
	for (const line of [null, { type: 'none' }, { color: '123456', width: 2, dashType: 'sysDot' }]) assert.deepEqual(normalizeStructuralShapeLine(line), line)
	const invalid = [
		{ type: 'gradient' }, { ...gradient, color: 'FFFFFF' }, { ...gradient, transparency: 50 },
		{ ...gradient, gradientAngle: 360 }, { ...gradient, gradientAngle: 0.0001 }, { ...gradient, gradientAngle: null },
		{ ...gradient, gradientDirection: 'circle' }, { ...gradient, gradientDirection: null }, { ...gradient, rotateGradientWithShape: null },
		{ ...gradient, fillToRect: { l: 50 } }, { ...gradient, gradientFlip: 'x' }, { ...gradient, _rawLineXml: '<a:ln/>' },
		{ ...gradient, gradientStops: [{ position: 0, color: 'FFFFFF', sourcePath: 'private' }, { position: 100, color: '000000' }] },
		{ ...gradient, gradientStops: [{ position: null, color: 'FFFFFF' }, { position: 100, color: '000000' }] },
		{ ...gradient, gradientStops: [{ position: 0, color: 'not-a-color' }, { position: 100, color: '000000' }] },
		{ ...gradient, gradientStops: [{ position: 0, color: 'FFFFFF', transparency: 100.001 }, { position: 100, color: '000000' }] },
		{ ...gradient, gradientStops: Array.from({ length: 33 }, (_, i) => ({ position: i * 3, color: 'FFFFFF' })) },
		{ type: 'solid', gradientStops: gradient.gradientStops }, { gradientStops: gradient.gradientStops },
	]
	for (const line of invalid) {
		assert.equal(validateLine(line), false, JSON.stringify(line))
		assert.throws(() => normalizeStructuralShapeLine(line), /line/)
		const spec = fixture()
		spec.slides[0].content[3].children[1].children[0].style.line = line
		assert.equal(validateDeck(spec), false, JSON.stringify(line))
		assert.throws(() => buildSpecOperationPlan(spec), /line|gradient/i)
	}
	// Cross-item ordering is checked by the shared runtime validator; standard
	// JSON Schema constrains each stop but cannot compare adjacent positions.
	const descending = { ...gradient, gradientStops: [{ position: 80, color: 'FFFFFF' }, { position: 10, color: '000000' }] }
	assert.throws(() => normalizeStructuralShapeLine(descending), /line/)
	const descendingSpec = fixture()
	descendingSpec.slides[0].content[3].children[1].children[0].style.line = descending
	assert.throws(() => buildSpecOperationPlan(descendingSpec), /line|gradient/i)
	assert.throws(() => normalizeStructuralConnector({ line: gradient }), /connector|line/)
	assert.throws(() => normalizeStructuralGroup({ children: [{ kind: 'connector', line: gradient }] }), /connector|line/)
})

test('pixel compiler preserves native gradient strokes and unchanged parent-local cubic controls', () => {
	const spec = fixture()
	const before = structuredClone(spec)
	const plan = buildSpecOperationPlan(spec)
	const standalone = plan.operations.find(op => op.tool === 'betterpptx.slide.add_freeform')
	assert.deepEqual(standalone.args.line, gradient)
	assert.deepEqual(roundedPoints(standalone.args.points), points)
	const outer = plan.operations.find(op => op.tool === 'betterpptx.slide.add_group').args.options
	const innerPath = outer.children[1].children[0]
	assert.deepEqual(innerPath.style.line, gradient)
	assert.deepEqual(roundedPoints(innerPath.points), points)
	assert.ok(Math.abs(innerPath.x - 0.3) < 1e-6)
	assert.ok(Math.abs(innerPath.y - 0.4) < 1e-6)
	assert.deepEqual(spec, before)
})

test('native shape and nested freeform strokes retain gradient alpha, geometry and independent soft bloom', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	const common = { fill: { type: 'none' }, line: gradient, shadow: { type: 'outer', color: '17B5EF', opacity: 0.4, blur: 6, offset: 0, angle: 90 } }
	slide.addShape('rect', { ...common, x: 0.5, y: 0.5, w: 2, h: 1, objectName: 'panel' })
	slide.addShape('custGeom', { ...common, x: 3, y: 0.5, w: 2, h: 1, objectName: 'path', points })
	slide.addGroup({ x: 1, y: 2, w: 6, h: 3, objectName: 'outer', children: [
		{ kind: 'freeform', x: 0.25, y: 0.25, w: 2, h: 1, objectName: 'group-path', points, style: common },
		{ kind: 'group', x: 3, y: 0.5, w: 2.5, h: 2, objectName: 'inner', children: [
			{ kind: 'freeform', x: 0.3, y: 0.4, w: 2, h: 1, objectName: 'nested-path', points, style: common },
		] },
	] })
	const before = structuredClone(gradient)
	const { doc, xml, zip } = await inspect(pptx)
	for (const name of ['panel', 'path', 'group-path', 'nested-path']) {
		assert.equal(named(doc, name).tagName, 'p:sp')
		assertGradient(lineOf(doc, name))
		const shadow = named(doc, name).getElementsByTagName('a:outerShdw')[0]
		assert.equal(shadow.getAttribute('dist'), '0')
		assert.equal(shadow.getAttribute('blurRad'), '76200')
	}
	assert.equal(doc.getElementsByTagName('p:grpSp').length, 2)
	assert.equal(named(doc, 'nested-path').parentNode.tagName, 'p:grpSp')
	for (const name of ['path', 'group-path', 'nested-path']) {
		assert.equal(named(doc, name).getElementsByTagName('a:path').length, 1)
		assert.equal(named(doc, name).getElementsByTagName('a:cubicBezTo').length, 2)
		assert.equal(geometryOf(doc, name), geometryOf(doc, 'path'))
	}
	assert.equal(named(doc, 'nested-path').getElementsByTagName('a:off')[0].getAttribute('x'), '274320')
	assert.equal(named(doc, 'nested-path').getElementsByTagName('a:off')[0].getAttribute('y'), '365760')
	assert.equal(doc.getElementsByTagName('p:pic').length, 0)
	assert.equal(Object.keys(zip.files).filter(name => name.startsWith('ppt/media/') && !zip.files[name].dir).length, 0)
	assert.equal((await inspect(pptx)).xml, xml)
	assert.deepEqual(gradient, before)
})

test('core gradient validation fails before serialization and native connectors stay solid-only', () => {
	for (const line of [
		{ type: 'gradient' }, { ...gradient, gradientDirection: 'circle' }, { ...gradient, color: 'FFFFFF' },
		{ ...gradient, gradientStops: [{ position: 80, color: 'FFFFFF' }, { position: 10, color: '000000' }] },
		{ ...gradient, gradientStops: [{ position: 0, color: 'bad"/><a:bad' }, { position: 100, color: '000000' }] },
		{ ...gradient, gradientStops: [{ position: 0, color: 'FFFFFF', raw: '<a:bad/>' }, { position: 100, color: '000000' }] },
	]) {
		const slide = new PptxGenJS().addSlide()
		assert.throws(() => slide.addShape('custGeom', { x: 0, y: 0, w: 2, h: 1, points, line }), /line|gradient/)
	}
	assert.throws(() => new PptxGenJS().addSlide().addConnector({ x: 0, y: 0, w: 2, h: 1, line: gradient }), /line.type/)
})

test('gradient line fill owns its native choice across gallery inheritance and sparse type changes', () => {
	const gallery = resolveShapeFormatting({ shapeStylePresetId: SHAPE_STYLE_PRESET_IDS[0], line: gradient })
	assert.deepEqual(gallery.effectiveOptions.line.gradientStops, gradient.gradientStops)
	assert.equal(Object.hasOwn(gallery.effectiveOptions.line, 'color'), false)
	assert.equal(Object.hasOwn(gallery.effectiveOptions.line, 'transparency'), false)
	const width = resolveShapeFormatting({ line: { width: 3 } }, gallery.state, { mode: 'patch' })
	assert.equal(width.effectiveOptions.line.width, 3)
	assert.deepEqual(width.effectiveOptions.line.gradientStops, gradient.gradientStops)
	const solid = resolveShapeFormatting({ line: { type: 'solid', color: 'AABBCC' } }, width.state, { mode: 'patch' })
	assert.equal(solid.effectiveOptions.line.type, 'solid')
	assert.equal(solid.effectiveOptions.line.width, 3)
	for (const key of ['gradientDirection', 'gradientAngle', 'gradientStops', 'rotateGradientWithShape']) assert.equal(Object.hasOwn(solid.state.authoredOverrides.line, key), false)
	assert.throws(() => resolveShapeFormatting({ line: { color: 'FFFFFF' } }, width.state, { mode: 'patch' }), /gradient stroke/)
	assert.throws(() => resolveShapeFormatting({ line: { gradientStops: [{ position: 90, color: 'FFFFFF' }, { position: 10, color: '000000' }] } }, width.state, { mode: 'patch' }), /line/)
})

test('public dryRun, native commit, export and replay retain ordinary/grouped gradient strokes without private payloads', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `native-stroke-${Date.now()}`, __skipDurableOperationLedger: true })
	const owned = []
	try {
		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'dryRun', spec: fixture(), detail: 'full' }))
		const created = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: fixture(), detail: 'full' }))
		owned.push(created.deckId)
		const initial = await inspect(getDeck(created.deckId).pptx)
		const names = ['panel', 'path', 'text-border', 'group-path', 'nested-path']
		for (const name of names) assertGradient(lineOf(initial.doc, name))
		const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: created.deckId, detail: 'full' }))
		assert.doesNotMatch(JSON.stringify(exported), /_rawLine|_nativeObject|sourcePath|<a:gradFill|\.mjs|node_modules/)
		const replay = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: exported.spec, detail: 'full' }))
		owned.push(replay.deckId)
		const next = await inspect(getDeck(replay.deckId).pptx)
		for (const name of names) assert.equal(lineOf(next.doc, name).toString(), lineOf(initial.doc, name).toString(), name)
		for (const name of ['path', 'group-path', 'nested-path']) assert.equal(geometryOf(next.doc, name), geometryOf(initial.doc, name), name)
	} finally { for (const deckId of owned) dataOf(await mcp.call('betterpptx.deck.dispose', { deckId })) }
})

test('public whole-line replacement/reset/re-edit preserve geometry and do not retain stale gradient stops', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `native-stroke-reset-${Date.now()}`, __skipDurableOperationLedger: true })
	const owned = []
	try {
		const spec = fixture()
		spec.slides[0].content = [spec.slides[0].content[1]]
		const created = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec, detail: 'full' }))
		owned.push(created.deckId)
		const sourceGeometry = geometryOf((await inspect(getDeck(created.deckId).pptx)).doc, 'path')
		for (const line of [{ type: 'solid', color: 'AABBCC', width: 2 }, gradient, null, gradient]) {
			const patchSpec = structuredClone(spec)
			patchSpec.slides[0].content = [{ ...patchSpec.slides[0].content[0], patch: { line } }]
			dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { deckId: created.deckId, deckVersion: getDeck(created.deckId).deckVersion, phase: 'dryRun', commitMode: 'patch', spec: patchSpec, detail: 'full' }))
			dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { deckId: created.deckId, deckVersion: getDeck(created.deckId).deckVersion, phase: 'commit', commitMode: 'patch', spec: patchSpec, detail: 'full' }))
			const current = await inspect(getDeck(created.deckId).pptx)
			const nativeLine = named(current.doc, 'path').getElementsByTagName('a:ln')[0]
			assert.equal(nativeLine?.getElementsByTagName('a:gradFill').length || 0, line?.type === 'gradient' ? 1 : 0)
			if (line !== null) assert.equal(nativeLine.getElementsByTagName('a:noFill').length, 0)
			assert.equal(geometryOf(current.doc, 'path'), sourceGeometry)
			const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: created.deckId, detail: 'full' }))
			const replay = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: exported.spec, detail: 'full' }))
			owned.push(replay.deckId)
			const replayLine = named((await inspect(getDeck(replay.deckId).pptx)).doc, 'path').getElementsByTagName('a:ln')[0]
			assert.equal(replayLine?.toString() || null, nativeLine?.toString() || null)
		}
	} finally { for (const deckId of owned) dataOf(await mcp.call('betterpptx.deck.dispose', { deckId })) }
})

test('public invalid gradient patches fail dryRun without mutating the source object or version', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `native-stroke-patch-reject-${Date.now()}`, __skipDurableOperationLedger: true })
	const spec = fixture()
	spec.slides[0].content = [spec.slides[0].content[0]]
	const created = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec, detail: 'full' }))
	try {
		const version = getDeck(created.deckId).deckVersion
		const before = (await inspect(getDeck(created.deckId).pptx)).xml
		for (const line of [{ color: 'FFFFFF' }, { ...gradient, _rawLineXml: '<a:ln/>' }, { gradientStops: [{ position: 90, color: 'FFFFFF' }, { position: 10, color: '000000' }] }]) {
			const patchSpec = structuredClone(spec)
			patchSpec.slides[0].content = [{ kind: 'shape', name: 'panel', objectName: 'panel', patch: { line } }]
			const result = await mcp.call('betterpptx.deck.generate_from_spec', { deckId: created.deckId, deckVersion: version, phase: 'dryRun', commitMode: 'patch', spec: patchSpec, detail: 'full' })
			assert.equal(result.ok, false, JSON.stringify(line))
			assert.equal(getDeck(created.deckId).deckVersion, version)
			assert.equal((await inspect(getDeck(created.deckId).pptx)).xml, before)
		}
	} finally { dataOf(await mcp.call('betterpptx.deck.dispose', { deckId: created.deckId })) }
})

test('public dryRun rejects malformed gradient strokes, forbidden connector gradients and private payloads', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `native-stroke-reject-${Date.now()}`, __skipDurableOperationLedger: true })
	for (const location of ['shape', 'group', 'connector']) {
		const spec = fixture()
		if (location === 'shape') spec.slides[0].content[0].style.line = { ...gradient, _rawLineXml: '<a:ln/>' }
		if (location === 'group') spec.slides[0].content[3].children[1].children[0].style.line = { ...gradient, gradientStops: [{ position: 90, color: 'FFFFFF' }, { position: 10, color: '000000' }] }
		if (location === 'connector') spec.slides[0].content = [{ kind: 'connector', name: 'connector', pixelFrame: { x: 20, y: 20, w: 240, h: 120 }, style: { line: gradient } }]
		const result = await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'dryRun', spec, detail: 'full' })
		assert.equal(result.ok, false, location)
	}
})
