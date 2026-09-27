import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

// Source mode is isolated to this process and never changes the shipped runtime.
const require = createRequire(import.meta.url)
let PptxGenJS
if (process.env.BETTERPPTX_TEST_NATIVE_SOURCE === '1') {
	const ts = require('typescript')
	const previous = require.extensions['.ts']
	const sourceRoot = new URL('../../src/', import.meta.url).href
	const sourceImports = registerHooks({ resolve(specifier, context, nextResolve) {
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
		sourceImports.deregister()
		if (previous) require.extensions['.ts'] = previous
		else delete require.extensions['.ts']
	}
} else PptxGenJS = require('../../dist/pptxgen.cjs.js')

const openPath = [
	{ x: 0, y: 1, moveTo: true },
	{ x: 1, y: 1 },
	{ x: 1.4, y: 0.6, curve: { type: 'quadratic', x1: 1.4, y1: 1 } },
	{ x: 1.4, y: 0 },
	{ x: 2, y: 0 },
]

async function inspect(pptx) {
	const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer', compression: false }))
	const xml = await zip.file('ppt/slides/slide1.xml').async('string')
	const errors = []
	const doc = new DOMParser({ errorHandler: {
		warning: message => errors.push(message), error: message => errors.push(message), fatalError: message => errors.push(message),
	} }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [])
	return doc
}

function named(doc, name) {
	const identity = Array.from(doc.getElementsByTagName('p:cNvPr')).find(node => node.getAttribute('name') === name)
	assert.ok(identity, `Missing named native object: ${name}`)
	return identity.parentNode.parentNode
}

function line(doc, name) {
	const node = named(doc, name).getElementsByTagName('a:ln')[0]
	assert.ok(node, `Missing line on ${name}`)
	return node
}

test('public pixel-authored freeform caps survive the semantic compiler in standalone and grouped paths', () => {
	const pathContent = { kind: 'freeform', name: 'rounded-path', pixelFrame: { x: 120, y: 240, w: 320, h: 180 }, pixelPoints: [
		{ x: 0, y: 180, moveTo: true }, { x: 160, y: 180 }, { x: 320, y: 0 },
	], style: { fill: { type: 'none' }, line: { color: '9DEBFF', width: 4, cap: 'round' } } }
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native rounded paths', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Presentation authors', outcome: 'Retain deliberately rounded native paths.', remember: 'The native stroke respects authored caps.' },
		visualDesign: { world: 'editorial', framing: 'Two independently editable native paths.' },
		motionTime: { masterClock: 'authored', timingSource: 'native slide timeline' },
		visualReference: { mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1600, height: 900 }, mediaAssets: [] },
		slides: [{ id: 'cap-proof', title: 'Native stroke caps', layoutIntent: 'title-only', content: [pathContent, {
			kind: 'group', name: 'lane-group', pixelFrame: { x: 700, y: 240, w: 480, h: 300 }, children: [{ ...pathContent, name: 'group-rounded-path', pixelFrame: { x: 0, y: 0, w: 320, h: 180 } }],
		}] }],
	}
	const before = structuredClone(spec)
	const plan = buildSpecOperationPlan(spec)
	const standalone = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_freeform')
	const grouped = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_group')
	assert.ok(standalone)
	assert.ok(grouped)
	assert.equal(standalone.args.line.cap, 'round')
	assert.equal(grouped.args.options.children[0].style.line.cap, 'round')
	assert.deepEqual(spec, before)
})

test('native lines and open freeforms preserve the three caps without changing path geometry', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	for (const [index, cap] of ['flat', 'round', 'square', undefined].entries()) {
		slide.addShape('line', { x: 0.5, y: index + 0.2, w: 2, h: 0, objectName: `line-${index}`, line: { color: '00AAFF', width: 8, ...(cap ? { cap } : {}) } })
		slide.addShape('custGeom', { x: 3, y: index + 0.2, w: 2, h: 1, objectName: `path-${index}`, points: openPath, fill: { type: 'none' }, line: { color: '9DEBFF', width: 4, ...(cap ? { cap } : {}) } })
	}
	const doc = await inspect(pptx)
	const expected = ['flat', 'rnd', 'sq', 'flat']
	let referenceGeometry
	for (const [index, cap] of expected.entries()) {
		assert.equal(line(doc, `line-${index}`).getAttribute('cap'), cap)
		assert.equal(line(doc, `path-${index}`).getAttribute('cap'), cap)
		assert.equal(line(doc, `path-${index}`).getAttribute('w'), '50800')
		const geometry = named(doc, `path-${index}`).getElementsByTagName('a:custGeom')[0].toString()
		if (referenceGeometry === undefined) referenceGeometry = geometry
		else assert.equal(geometry, referenceGeometry)
		assert.equal(named(doc, `path-${index}`).getElementsByTagName('a:quadBezTo').length, 1)
		assert.equal(named(doc, `path-${index}`).getElementsByTagName('a:close').length, 0)
	}
})

test('grouped and nested native freeforms retain caps, glow, and local frames', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addGroup({ x: 1, y: 1, w: 6, h: 3, objectName: 'lane', children: [
		{ kind: 'freeform', x: 0.5, y: 0.25, w: 2, h: 1, objectName: 'lane-core', points: openPath, style: { fill: { type: 'none' }, line: { color: '9DEBFF', width: 2.65, cap: 'round' }, glow: { size: 2.3, color: '4BCBFF', opacity: 0.76 } } },
		{ kind: 'group', x: 3, y: 0.5, w: 2, h: 2, objectName: 'nested', children: [
			{ kind: 'freeform', x: 0, y: 0, w: 2, h: 1, objectName: 'nested-lane', points: openPath, style: { fill: { type: 'none' }, line: { color: '00AAFF', width: 3, cap: 'square' } } },
			{ kind: 'connector', x: 0, y: 1.5, w: 2, h: 0, objectName: 'nested-connector', line: { color: '00AAFF', width: 1.2, cap: 'round', dashType: 'sysDot' } },
		] },
	] })
	const doc = await inspect(pptx)
	assert.equal(doc.getElementsByTagName('p:grpSp').length, 2)
	assert.equal(line(doc, 'lane-core').getAttribute('cap'), 'rnd')
	assert.equal(line(doc, 'nested-lane').getAttribute('cap'), 'sq')
	assert.equal(line(doc, 'nested-connector').getAttribute('cap'), 'rnd')
	assert.equal(line(doc, 'nested-connector').getElementsByTagName('a:prstDash')[0].getAttribute('val'), 'sysDot')
	const core = named(doc, 'lane-core')
	assert.equal(core.getElementsByTagName('a:off')[0].getAttribute('x'), '457200')
	assert.equal(core.getElementsByTagName('a:off')[0].getAttribute('y'), '228600')
	assert.equal(core.getElementsByTagName('a:glow')[0].getAttribute('rad'), '29210')
	assert.equal(core.getElementsByTagName('a:glow')[0].getElementsByTagName('a:alpha')[0].getAttribute('val'), '76000')
})

test('cap defaults do not expand sparse theme lines and raw exact lines still win', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addConnector({ x: 1, y: 1, w: 2, h: 0, objectName: 'connector-default', line: { color: '00AAFF', width: 1 } })
	slide.addConnector({ x: 1, y: 2, w: 2, h: 0, objectName: 'connector-typed-sparse', line: {}, _connectorStyleState: { schemaVersion: 'betterpptx.connector-style-state.v1', effectiveLine: { dashType: 'sysDot' } } })
	slide.addConnector({ x: 1, y: 3, w: 2, h: 0, objectName: 'connector-typed-cap', line: {}, _connectorStyleState: { schemaVersion: 'betterpptx.connector-style-state.v1', effectiveLine: { cap: 'round', dashType: 'sysDot' } } })
	slide.addShape('line', { x: 1, y: 4, w: 2, h: 0, objectName: 'raw-exact', line: { color: '00AAFF', width: 1, cap: 'square' }, _rawLineXml: '<a:ln cap="rnd" w="25400"><a:solidFill><a:srgbClr val="00AAFF"/></a:solidFill></a:ln>' })
	const doc = await inspect(pptx)
	assert.equal(line(doc, 'connector-default').getAttribute('cap'), 'flat')
	assert.equal(line(doc, 'connector-typed-sparse').hasAttribute('cap'), false)
	assert.equal(line(doc, 'connector-typed-sparse').hasAttribute('w'), false)
	assert.equal(line(doc, 'connector-typed-cap').getAttribute('cap'), 'rnd')
	assert.equal(line(doc, 'connector-typed-cap').hasAttribute('w'), false)
	assert.equal(line(doc, 'raw-exact').getAttribute('cap'), 'rnd')
	assert.equal(line(doc, 'raw-exact').getAttribute('w'), '25400')
})

test('invalid caps fail before serialization rather than silently flattening or injecting attributes', () => {
	for (const cap of ['rounded', 'rnd', 'round"/><a:bad', 1, {}, []]) {
		for (const kind of ['shape', 'connector', 'group']) {
			const pptx = new PptxGenJS()
			const slide = pptx.addSlide()
			const style = { color: '00AAFF', width: 2, cap }
			const invoke = kind === 'connector'
				? () => slide.addConnector({ x: 1, y: 1, w: 2, h: 0, line: style })
				: kind === 'group'
					? () => slide.addGroup({ x: 1, y: 1, w: 3, h: 2, children: [{ kind: 'freeform', x: 0, y: 0, w: 2, h: 1, points: openPath, style: { line: style } }] })
					: () => slide.addShape('custGeom', { x: 1, y: 1, w: 2, h: 1, points: openPath, line: style })
			assert.throws(invoke, /line\.cap/)
		}
	}
})
