import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import JSZip from 'jszip'
import Ajv from 'ajv'
import { DOMParser } from '@xmldom/xmldom'
import { normalizeTextFill, patchTextFill, TEXT_FILL_PUBLIC_SCHEMA } from '../text-fill-contract.mjs'
import { normalizeRichRunOptions, listOptionCatalog } from '../option-registry.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { STRUCTURAL_GROUP_CHILD_SCHEMA } from '../structural-authoring-family-contract.mjs'
import { TOOLS } from '../tools.mjs'
import { GENERIC_OPTIONS_SCHEMA, TEXT_RUN_OPTIONS_SCHEMA, publicToolList } from '../blackbox.mjs'
import { applyNativeStylePreset, WORDART_STYLE_PRESETS } from '../native-style-presets.mjs'
import deckSchema from '../ir/deck-spec.v1.json' with { type: 'json' }

// Source proof compiles only in this test process. It never builds dist,
// creates an artifact, invokes Office, or changes the running public service.
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
	require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename)
	try { PptxGenJS = require('../../src/pptxgen.ts').default } finally {
		hook.deregister()
		if (previous) require.extensions['.ts'] = previous
		else delete require.extensions['.ts']
	}
	globalThis[Symbol.for('betterpptx.test.text-fill-source-runtime')] = PptxGenJS
	const runtimeEntry = new URL('../../dist/pptxgen.es.js', import.meta.url).href
	registerHooks({ load(url, context, nextLoad) {
		if (url === runtimeEntry) return { format: 'module', source: "export default globalThis[Symbol.for('betterpptx.test.text-fill-source-runtime')]", shortCircuit: true }
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
	type: 'gradient', gradientDirection: 'linear', gradientAngle: 90.125,
	gradientStops: [{ position: 0, color: 'F5FCFF' }, { position: 43.125, color: 'E5F9FF', transparency: 12.375 }, { position: 100, color: '63CFFF', transparency: 100 }],
	rotateGradientWithShape: false, gradientFlip: 'xy', tileRect: { l: 1.125, t: 2.5, r: 3.75, b: 4 },
}
const pathGradient = { type: 'gradient', gradientDirection: 'circle', gradientStops: [{ position: 0, color: 'accent1' }, { position: 100, color: 'FFFFFF' }], fillToRect: { l: 50, t: 50, r: 50, b: 50 } }
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key)
const children = node => Array.from(node.childNodes).filter(child => child.nodeType === 1)
const fillTags = new Set(['a:solidFill', 'a:gradFill', 'a:noFill', 'a:blipFill', 'a:grpFill', 'a:pattFill'])
const runFills = node => Array.from(node.getElementsByTagName('a:rPr')).map(run => children(run).filter(child => fillTags.has(child.tagName)))
const signature = node => runFills(node).map(fills => fills.map(fill => fill.toString()))
const dataOf = result => { assert.equal(result?.ok, true, JSON.stringify(result?.error || result)); return result.data || result }

function carrier(doc, name) {
	const props = Array.from(doc.getElementsByTagName('p:cNvPr')).find(node => node.getAttribute('name') === name || node.getAttribute('name').endsWith(`.${name}`))
	assert.ok(props, `Missing native text carrier ${name}`)
	return props.parentNode.parentNode
}
async function inspect(pptx) {
	const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer', compression: false }))
	const xml = await zip.file('ppt/slides/slide1.xml').async('string')
	const errors = []
	const doc = new DOMParser({ errorHandler: { warning: msg => errors.push(msg), error: msg => errors.push(msg), fatalError: msg => errors.push(msg) } }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [])
	return { doc, xml, zip }
}
function withoutDescriptions(value) {
	if (Array.isArray(value)) return value.map(withoutDescriptions)
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'description').map(([key, child]) => [key, withoutDescriptions(child)]))
	return value
}
function semanticNode(node) {
	if (node.nodeType !== 1) return node.nodeType === 3 && node.nodeValue.trim() ? node.nodeValue : null
	return { name: node.localName, ns: node.namespaceURI, attributes: Object.fromEntries(Array.from(node.attributes).filter(attr => !attr.name.startsWith('xmlns')).map(attr => [attr.name, attr.value]).sort()), children: Array.from(node.childNodes).map(semanticNode).filter(value => value !== null) }
}
function nonFillRunSignature(node) {
	return Array.from(node.getElementsByTagName('a:rPr')).map(run => children(run).filter(child => !fillTags.has(child.tagName)).map(semanticNode))
}
function fixture() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Editable glyph fills', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Reviewers', outcome: 'Preserve editable typography.', remember: 'Glyph fill is not panel fill.' },
		visualDesign: { world: 'editorial', framing: 'Exact native glyph treatments' },
		motionTime: { masterClock: 'authored', timingSource: 'native slide timeline' },
		visualReference: { mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1600, height: 900 }, mediaAssets: [] },
		slides: [{ id: 'glyph-fill-proof', title: 'Editable glyph fills', layoutIntent: 'title-only', background: { color: '000611' }, content: [
			{ kind: 'textBox', name: 'headline', objectName: 'headline', text: 'RECOVERY LANE', pixelFrame: { x: 100, y: 70, w: 1100, h: 85 }, style: { fontSize: 34, color: 'E7F7FF', textFill: structuredClone(gradient), fit: 'none', textGlow: { color: '17B5EF', size: 3, opacity: 0.2 } } },
			{ kind: 'textShape', name: 'card', objectName: 'card', shape: 'roundRect', text: 'NATIVE TEXT SHAPE', pixelFrame: { x: 100, y: 200, w: 900, h: 100 }, style: { fontSize: 28, color: 'E7F7FF', textFill: structuredClone(pathGradient), fill: { color: '112244' }, line: { color: '005577', width: 1 }, fit: 'none' } },
			{ kind: 'textBox', name: 'rich', objectName: 'rich', pixelFrame: { x: 100, y: 350, w: 1300, h: 90 }, style: { fontSize: 26, textFill: structuredClone(gradient), fit: 'none' }, text: [
				{ text: 'PARENT ' }, { text: 'SOLID ', options: { textFill: { color: 'FF6600', transparency: 30 } } },
				{ text: 'RESET ', options: { textFill: null } }, { text: 'PATH', options: { textFill: structuredClone(pathGradient) } },
			] },
			{ kind: 'group', name: 'typography-group', pixelFrame: { x: 100, y: 530, w: 1100, h: 280 }, children: [
				{ kind: 'textBox', name: 'group-headline', text: 'GROUP GLYPHS', pixelFrame: { x: 20, y: 20, w: 750, h: 75 }, style: { fontSize: 28, textFill: structuredClone(gradient), fit: 'none' } },
				{ kind: 'group', name: 'nested', pixelFrame: { x: 20, y: 140, w: 750, h: 110 }, children: [
					{ kind: 'textShape', name: 'nested-card', text: 'NESTED GLYPHS', shape: 'rect', pixelFrame: { x: 15, y: 10, w: 600, h: 80 }, style: { fontSize: 24, textFill: structuredClone(pathGradient), fill: { color: '112244' }, fit: 'none' } },
				] },
			] },
		] }],
	}
}

test('closed glyph fill validates colors, stops, units, modes and immutable sparse patches', () => {
	const before = structuredClone(gradient)
	assert.deepEqual(normalizeTextFill(gradient), gradient)
	assert.deepEqual(gradient, before)
	assert.deepEqual(normalizeTextFill({ color: '#38bdf8', transparency: 37.125 }), { color: '38BDF8', transparency: 37.125 })
	assert.equal(normalizeTextFill(null), null)
	assert.deepEqual(normalizeTextFill({ type: 'none' }), { type: 'none' })
	assert.deepEqual(normalizeRichRunOptions({ textFill: gradient }).textFill, gradient)
	const angle = patchTextFill(gradient, { gradientAngle: 42 })
	assert.deepEqual(angle.gradientStops, gradient.gradientStops)
	assert.equal(angle.gradientAngle, 42)
	assert.deepEqual(patchTextFill(gradient, { type: 'solid', color: 'ABCDEF' }), { type: 'solid', color: 'ABCDEF' })
	assert.deepEqual(patchTextFill(gradient, { type: 'none' }), { type: 'none' })
	assert.equal(patchTextFill(gradient, null), null)
	assert.deepEqual(patchTextFill({ color: '123456', transparency: 30 }, { transparency: null }), { color: '123456', transparency: null })
	assert.deepEqual(patchTextFill(pathGradient, { fillToRect: { l: null } }).fillToRect, { l: null, t: 50, r: 50, b: 50 })
	assert.equal(own(patchTextFill(pathGradient, { gradientDirection: 'linear' }), 'fillToRect'), false)
	assert.equal(own(patchTextFill(gradient, { gradientDirection: 'circle' }), 'gradientAngle'), false)
	for (const invalid of [
		{ type: 'picture', source: 'asset:private' }, { _rawRprXml: '<a:solidFill/>' }, { color: 'not-a-color' },
		{ type: 'gradient' }, { gradientStops: gradient.gradientStops }, { type: 'none', color: 'FFFFFF' },
		{ ...gradient, transparency: 50 }, { ...gradient, color: 'FFFFFF' }, { ...gradient, gradientAngle: 360 },
		{ ...gradient, gradientAngle: 0.0001 }, { ...gradient, fillToRect: { l: 10 } }, { ...pathGradient, gradientAngle: 45 },
		{ ...gradient, gradientStops: [{ position: 0, color: 'FFFFFF' }] },
		{ ...gradient, gradientStops: [{ position: 80, color: 'FFFFFF' }, { position: 10, color: '000000' }] },
		{ ...gradient, gradientStops: [{ position: 0, color: 'FFFFFF', raw: 'x' }, { position: 100, color: '000000' }] },
		{ ...gradient, gradientStops: [{ position: null, color: 'FFFFFF' }, { position: 100, color: '000000' }] },
		{ ...pathGradient, fillToRect: { sourcePath: 'private' } }, { ...gradient, tileRect: { l: -1 } },
		{ ...gradient, rotateGradientWithShape: 1 }, { transparency: '25' }, { transparency: 10.0001 },
	]) assert.throws(() => normalizeTextFill(invalid), /textFill|text-fill/)
})

test('public catalog, deck schema and text/group entry schemas share the closed fill contract', () => {
	assert.deepEqual(withoutDescriptions(deckSchema.$defs.textFill), withoutDescriptions(TEXT_FILL_PUBLIC_SCHEMA))
	assert.equal(deckSchema.$defs.richTextRunOptions.properties.textFill.$ref, '#/$defs/textFill')
	assert.equal(deckSchema.$defs.contentBlock.properties.style.properties.textFill.$ref, '#/$defs/textFill')
	assert.deepEqual(STRUCTURAL_GROUP_CHILD_SCHEMA.properties.style.properties.textFill, TEXT_FILL_PUBLIC_SCHEMA)
	const generate = TOOLS.find(tool => tool.name === 'betterpptx.deck.generate_from_spec')
	const block = generate.inputSchema.properties.spec.properties.slides.items.properties.content.items.properties
	assert.deepEqual(block.textFill, TEXT_FILL_PUBLIC_SCHEMA)
	assert.deepEqual(block.style.properties.textFill, TEXT_FILL_PUBLIC_SCHEMA)
	assert.deepEqual(block.text.oneOf[1].items.properties.options.properties.textFill, TEXT_FILL_PUBLIC_SCHEMA)
	assert.deepEqual(GENERIC_OPTIONS_SCHEMA.properties.textFill, TEXT_FILL_PUBLIC_SCHEMA)
	assert.deepEqual(TEXT_RUN_OPTIONS_SCHEMA.properties.textFill, TEXT_FILL_PUBLIC_SCHEMA)
	const served = publicToolList(TOOLS).find(tool => tool.name === 'betterpptx.deck.generate_from_spec')
	const servedFill = served.inputSchema.properties.spec.properties.slides.items.properties.content.items.properties.style.properties.textFill
	const validate = new Ajv({ allErrors: true, multipleOfPrecision: 10 }).compile(servedFill)
	for (const value of [gradient, pathGradient, { color: 'accent1', transparency: 37.125 }, { type: 'none' }, null]) assert.equal(validate(value), true, JSON.stringify(validate.errors))
	for (const value of [{ type: 'gradient' }, { color: 'FFFFFF', sourcePath: 'private' }, { ...gradient, fillToRect: { l: 50 } }, { ...pathGradient, gradientAngle: 45 }, { type: 'picture', data: 'private' }]) assert.equal(validate(value), false, JSON.stringify(value))
	assert.doesNotMatch(JSON.stringify(servedFill), /\.mjs|sourcePath|_raw|node_modules/)
	const catalog = listOptionCatalog({ surface: 'textFill', format: 'full' })
	const surface = (catalog.surfaces || catalog.options || catalog).find?.(item => item.id === 'textFill')
	assert.ok(surface, JSON.stringify(catalog).slice(0, 1000))
	assert.deepEqual(withoutDescriptions(surface.schema), withoutDescriptions(TEXT_FILL_PUBLIC_SCHEMA))
	assert.ok(surface.overrideFields.includes('gradientStops'))
})

test('native glyph gradients emit one exact fill choice, stop alpha and path controls without panel/raster substitution', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addText('GLYPH', { x: 0.4, y: 0.4, w: 6, h: 1, objectName: 'linear', color: 'E7F7FF', textFill: structuredClone(gradient), fill: { color: '112244' }, fontSize: 36, textGlow: { color: '17B5EF', size: 3, opacity: 0.2 } })
	for (const [index, direction] of ['circle', 'rect', 'shape'].entries()) slide.addText(direction, { x: 0.4, y: 1.5 + index, w: 6, h: 0.8, objectName: direction, textFill: { ...pathGradient, gradientDirection: direction }, wordArt: { transform: 'textArchUp' }, fontSize: 30 })
	slide.addText('NONE', { x: 7, y: 1, w: 2, h: 1, objectName: 'no-fill', textFill: { type: 'none' }, outline: { color: 'FFFFFF', size: 0.5 } })
	slide.addText('RESET', { x: 7, y: 3, w: 2, h: 1, objectName: 'reset', color: 'FF0000', textFill: null })
	const { doc, xml, zip } = await inspect(pptx)
	const linear = carrier(doc, 'linear')
	const fills = runFills(linear)
	assert.equal(fills.length, 1)
	assert.equal(fills[0].length, 1)
	const fill = fills[0][0]
	assert.equal(fill.tagName, 'a:gradFill')
	assert.equal(fill.getAttribute('rotWithShape'), '0')
	assert.equal(fill.getAttribute('flip'), 'xy')
	assert.equal(fill.getElementsByTagName('a:lin')[0].getAttribute('ang'), '5407500')
	assert.deepEqual(Array.from(fill.getElementsByTagName('a:gs')).map(stop => stop.getAttribute('pos')), ['0', '43125', '100000'])
	assert.deepEqual(Array.from(fill.getElementsByTagName('a:alpha')).map(alpha => alpha.getAttribute('val')), ['87625', '0'])
	assert.equal(fill.getElementsByTagName('a:tileRect')[0].getAttribute('l'), '1125')
	const spPr = linear.getElementsByTagName('p:spPr')[0]
	assert.equal(spPr.getElementsByTagName('a:srgbClr')[0].getAttribute('val'), '112244')
	assert.equal(spPr.getElementsByTagName('a:gradFill').length, 0)
	for (const direction of ['circle', 'rect', 'shape']) {
		const glyph = runFills(carrier(doc, direction))[0][0]
		assert.equal(glyph.getElementsByTagName('a:path')[0].getAttribute('path'), direction)
		assert.equal(glyph.getElementsByTagName('a:lin').length, 0)
		assert.equal(glyph.getElementsByTagName('a:fillToRect')[0].getAttribute('l'), '50000')
		assert.equal(glyph.getElementsByTagName('a:schemeClr')[0].getAttribute('val'), 'accent1')
	}
	assert.deepEqual(runFills(carrier(doc, 'no-fill')).map(row => row.map(fill => fill.tagName)), [['a:noFill']])
	assert.deepEqual(runFills(carrier(doc, 'reset')), [[]])
	assert.equal(doc.getElementsByTagName('p:pic').length, 0)
	assert.equal(Object.keys(zip.files).filter(name => name.startsWith('ppt/media/') && !zip.files[name].dir).length, 0)
	assert.equal((await inspect(pptx)).xml, xml, 'Repeated serialization must not scale gradient units a second time')
})

test('compiler carries glyph fill on text, textShape, rich runs and nested pixel groups', () => {
	const spec = fixture()
	const before = structuredClone(spec)
	const plan = buildSpecOperationPlan(spec)
	const textOps = plan.operations.filter(op => op.tool === 'betterpptx.slide.add_text')
	assert.deepEqual(textOps.find(op => op.args.options.objectName.endsWith('headline')).args.options.textFill, gradient)
	assert.deepEqual(textOps.find(op => op.args.options.objectName.endsWith('card')).args.options.textFill, pathGradient)
	const group = plan.operations.find(op => op.tool === 'betterpptx.slide.add_group').args.options
	assert.deepEqual(group.children[0].style.textFill, gradient)
	assert.deepEqual(group.children[1].children[0].style.textFill, pathGradient)
	assert.ok(Math.abs(group.children[1].children[0].x - 0.125) < 1e-6)
	assert.deepEqual(spec, before)
})

test('all captured WordArt styles keep non-fill children when a native glyph fill overrides the exact style', async () => {
	const baseline = new PptxGenJS()
	const edited = new PptxGenJS()
	const baseSlide = baseline.addSlide()
	const editedSlide = edited.addSlide()
	for (const [index, preset] of WORDART_STYLE_PRESETS.entries()) {
		const options = applyNativeStylePreset({ x: 0.2, y: index * 0.25, w: 5, h: 0.2, fontSize: 12, objectName: preset.id }, preset.id).style
		baseSlide.addText('GLYPHS', options)
		editedSlide.addText('GLYPHS', { ...options, textFill: structuredClone(gradient) })
	}
	const originalDoc = (await inspect(baseline)).doc
	const editedDoc = (await inspect(edited)).doc
	for (const preset of WORDART_STYLE_PRESETS) {
		assert.deepEqual(nonFillRunSignature(carrier(editedDoc, preset.id)), nonFillRunSignature(carrier(originalDoc, preset.id)), preset.id)
		assert.deepEqual(runFills(carrier(editedDoc, preset.id)).map(row => row.map(fill => fill.tagName)), [['a:gradFill']], preset.id)
	}
})

test('public WordArt gallery fill overrides, null resets and replay preserve outline and effects', async () => {
	const spec = fixture()
	spec.slides[0].content = [{ ...spec.slides[0].content[0], name: 'gallery', objectName: 'gallery', wordArtStylePresetId: 'wordart-style-011', style: { fontSize: 32, textFill: structuredClone(gradient), fit: 'none', wordArt: { transform: 'textArchUp' } } }]
	const mcp = createMcpToolDispatcher({ sessionId: `glyph-gallery-${Date.now()}`, __skipDurableOperationLedger: true })
	const created = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec, detail: 'full' }))
	const deckId = created.deckId
	const initial = carrier((await inspect(getDeck(deckId).pptx)).doc, 'gallery')
	const nonFill = nonFillRunSignature(initial)
	const initialRun = initial.getElementsByTagName('a:rPr')[0]
	assert.equal(initialRun.getElementsByTagName('a:ln').length, 1)
	assert.equal(initialRun.getElementsByTagName('a:outerShdw').length, 1)
	for (const fill of [{ type: 'solid', color: 'accent1', transparency: 25 }, null, gradient]) {
		const patchSpec = { ...spec, slides: [{ ...spec.slides[0], content: [{ kind: 'textBox', name: 'gallery', objectName: 'gallery', patch: { textFill: fill } }] }] }
		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { deckId, deckVersion: getDeck(deckId).deckVersion, phase: 'commit', commitMode: 'patch', spec: patchSpec, detail: 'full' }))
		const current = carrier((await inspect(getDeck(deckId).pptx)).doc, 'gallery')
		assert.deepEqual(nonFillRunSignature(current), nonFill)
		assert.deepEqual(runFills(current).map(row => row.map(fill => fill.tagName)), fill === null ? [[]] : [[fill.type === 'solid' ? 'a:solidFill' : 'a:gradFill']])
		const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId, detail: 'full' }))
		const replay = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: exported.spec, detail: 'full' }))
		const replayNode = carrier((await inspect(getDeck(replay.deckId).pptx)).doc, 'gallery')
		assert.deepEqual(signature(replayNode), signature(current))
		assert.deepEqual(nonFillRunSignature(replayNode), nonFill)
	}
})

test('public dryRun/commit/export/replay preserve native glyph fills, run resets, group carriers and panel independence', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `glyph-fill-${Date.now()}`, __skipDurableOperationLedger: true })
	const publicCatalog = dataOf(await mcp.call('betterpptx.options.catalog', { surface: 'textFill', format: 'full' }))
	assert.ok(publicCatalog.surfaces[0].schema.oneOf.some(branch => branch.properties?.type?.const === 'gradient'))
	dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'dryRun', spec: fixture(), detail: 'full' }))
	const initial = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: fixture(), detail: 'full' }))
	const { doc } = await inspect(getDeck(initial.deckId).pptx)
	const names = ['headline', 'card', 'rich', 'group-headline', 'nested-card']
	for (const name of names) assert.equal(carrier(doc, name).tagName, 'p:sp')
	assert.equal(carrier(doc, 'group-headline').parentNode.tagName, 'p:grpSp')
	assert.equal(carrier(doc, 'nested-card').parentNode.tagName, 'p:grpSp')
	assert.deepEqual(runFills(carrier(doc, 'rich')).map(row => row.map(fill => fill.tagName)), [['a:gradFill'], ['a:solidFill'], [], ['a:gradFill']])
	assert.equal(doc.getElementsByTagName('p:pic').length, 0)
	const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: initial.deckId, detail: 'full' }))
	const headline = exported.spec.slides[0].content.find(block => block.name.endsWith('headline'))
	assert.deepEqual(headline.style.textFill, gradient)
	const rich = exported.spec.slides[0].content.find(block => block.name.endsWith('rich'))
	assert.equal(rich.text[2].options.textFill, null)
	assert.doesNotMatch(JSON.stringify(exported), /_rawRpr|_nativeObject|sourcePath|<a:gradFill|\.mjs|node_modules/)
	const replay = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: exported.spec, detail: 'full' }))
	const replayed = (await inspect(getDeck(replay.deckId).pptx)).doc
	for (const name of names) assert.deepEqual(signature(carrier(replayed, name)), signature(carrier(doc, name)), name)
})

test('public sparse fill patch, stop replacement, type switch, reset and re-edit retain exact replay', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `glyph-patches-${Date.now()}`, __skipDurableOperationLedger: true })
	const initial = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: fixture(), detail: 'full' }))
	const deckId = initial.deckId
	const native = () => getDeck(deckId).pptx.slides[0]._slideObjects.find(obj => obj.options?.objectName?.endsWith('headline'))
	const patch = async value => {
		const spec = fixture()
		spec.slides[0].content = [{ kind: 'textBox', name: 'headline', objectName: native().options.objectName, patch: { textFill: value } }]
		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { deckId, deckVersion: getDeck(deckId).deckVersion, phase: 'dryRun', commitMode: 'patch', spec, detail: 'full' }))
		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { deckId, deckVersion: getDeck(deckId).deckVersion, phase: 'commit', commitMode: 'patch', spec, detail: 'full' }))
	}
	const verifyReplay = async () => {
		const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId, detail: 'full' }))
		const block = exported.spec.slides[0].content.find(item => item.name.endsWith('headline'))
		assert.deepEqual(block.style.textFill, native().options.textFill)
		const replay = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: exported.spec, detail: 'full' }))
		assert.deepEqual(signature(carrier((await inspect(getDeck(replay.deckId).pptx)).doc, 'headline')), signature(carrier((await inspect(getDeck(deckId).pptx)).doc, 'headline')))
	}
	const geometry = Object.fromEntries(['x', 'y', 'w', 'h', 'fontSize'].map(key => [key, native().options[key]]))
	await patch({ gradientAngle: 37.5 })
	assert.equal(native().options.textFill.gradientAngle, 37.5)
	assert.deepEqual(native().options.textFill.gradientStops, gradient.gradientStops)
	await patch({ gradientStops: [{ position: 0, color: 'FFFFFF' }, { position: 100, color: '00FFFF', transparency: 25 }] })
	assert.equal(native().options.textFill.gradientStops.length, 2)
	await verifyReplay()
	await patch({ type: 'solid', color: 'ABCDEF', transparency: 30.125 })
	assert.deepEqual(native().options.textFill, { type: 'solid', color: 'ABCDEF', transparency: 30.125 })
	assert.equal(runFills(carrier((await inspect(getDeck(deckId).pptx)).doc, 'headline'))[0][0].tagName, 'a:solidFill')
	await patch({ transparency: null })
	assert.equal(native().options.textFill.color, 'ABCDEF')
	assert.equal(carrier((await inspect(getDeck(deckId).pptx)).doc, 'headline').getElementsByTagName('a:solidFill')[0].getElementsByTagName('a:alpha').length, 0)
	await verifyReplay()
	await patch({ type: 'none' })
	assert.deepEqual(native().options.textFill, { type: 'none' })
	await verifyReplay()
	await patch(null)
	assert.equal(native().options.textFill, null)
	assert.deepEqual(runFills(carrier((await inspect(getDeck(deckId).pptx)).doc, 'headline')), [[]])
	await verifyReplay()
	await patch(pathGradient)
	assert.deepEqual(native().options.textFill, pathGradient)
	await verifyReplay()
	assert.deepEqual(Object.fromEntries(Object.keys(geometry).map(key => [key, native().options[key]])), geometry)
})

test('solid legacy aliases and independent rich-run colors survive transparency-only patches and reset', async () => {
	const spec = fixture()
	spec.slides[0].content = [{ ...spec.slides[0].content[0], name: 'solid-runs', objectName: 'solid-runs', text: [{ text: 'FIRST ', options: { color: 'FF0000' } }, { text: 'SECOND', options: { color: '00FF00' } }], style: { fontSize: 28, color: '0000FF', fit: 'none' } }]
	const mcp = createMcpToolDispatcher({ sessionId: `solid-fill-${Date.now()}`, __skipDurableOperationLedger: true })
	const created = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec, detail: 'full' }))
	const deckId = created.deckId
	const obj = getDeck(deckId).pptx.slides[0]._slideObjects.find(item => item.options?.objectName?.endsWith('solid-runs'))
	for (const transparency of [37.125, null]) {
		const patchSpec = { ...spec, slides: [{ ...spec.slides[0], content: [{ kind: 'textBox', name: 'solid-runs', objectName: obj.options.objectName, patch: { textFill: { transparency } } }] }] }
		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { deckId, deckVersion: getDeck(deckId).deckVersion, phase: 'commit', commitMode: 'patch', spec: patchSpec, detail: 'full' }))
		const fills = runFills(carrier((await inspect(getDeck(deckId).pptx)).doc, 'solid-runs')).flat()
		assert.deepEqual(fills.map(fill => fill.getElementsByTagName('a:srgbClr')[0].getAttribute('val')), ['FF0000', '00FF00'])
		assert.deepEqual(fills.map(fill => fill.getElementsByTagName('a:alpha')[0]?.getAttribute('val') || null), transparency === null ? [null, null] : ['62875', '62875'])
	}
})

test('public multi-object transformation uses the same atomic glyph reset and type-change contract', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `glyph-transform-${Date.now()}`, __skipDurableOperationLedger: true })
	const created = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: fixture(), detail: 'full' }))
	const deckId = created.deckId
	const native = () => getDeck(deckId).pptx.slides[0]._slideObjects.find(obj => obj.options?.objectName?.endsWith('headline'))
	for (const fill of [{ type: 'solid', color: '234567' }, null, gradient]) {
		const spec = fixture()
		spec.slides[0].content = []
		spec.edits = { transformShapes: { filter: { objectNames: [native().options.objectName] }, patch: { textFill: fill } } }
		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { deckId, deckVersion: getDeck(deckId).deckVersion, phase: 'dryRun', commitMode: 'patch', spec, detail: 'full' }))
		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { deckId, deckVersion: getDeck(deckId).deckVersion, phase: 'commit', commitMode: 'patch', spec, detail: 'full' }))
		assert.deepEqual(native().options.textFill, fill)
		const current = carrier((await inspect(getDeck(deckId).pptx)).doc, 'headline')
		assert.deepEqual(runFills(current).map(row => row.map(fill => fill.tagName)), fill === null ? [[]] : [[fill.type === 'solid' ? 'a:solidFill' : 'a:gradFill']])
	}
	const invalid = fixture()
	invalid.slides[0].content = []
	invalid.edits = { transformShapes: { filter: { objectNames: [native().options.objectName] }, patch: { textFill: { transparency: 30 } } } }
	const before = structuredClone(native().options.textFill)
	const rejected = await mcp.call('betterpptx.deck.generate_from_spec', { deckId, phase: 'dryRun', commitMode: 'patch', spec: invalid, detail: 'full' })
	assert.equal(rejected.ok, false)
	assert.deepEqual(native().options.textFill, before)
})

test('public dryRun rejects private/unsupported glyph fills and impossible sparse target changes before mutation', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `glyph-reject-${Date.now()}`, __skipDurableOperationLedger: true })
	for (const location of ['style', 'run', 'group']) {
		const spec = fixture()
		const invalid = { type: 'gradient', gradientStops: gradient.gradientStops, _rawRprXml: '<a:gradFill/>' }
		if (location === 'style') spec.slides[0].content[0].style.textFill = invalid
		if (location === 'run') spec.slides[0].content[2].text[1].options.textFill = invalid
		if (location === 'group') spec.slides[0].content[3].children[1].children[0].style.textFill = invalid
		const result = await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'dryRun', spec, detail: 'full' })
		assert.equal(result.ok, false, location)
	}
	const created = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: fixture(), detail: 'full' }))
	const deckId = created.deckId
	const before = (await inspect(getDeck(deckId).pptx)).xml
	const version = getDeck(deckId).deckVersion
	const spec = fixture()
	spec.slides[0].content = [{ kind: 'textBox', name: 'headline', objectName: 'headline', patch: { textFill: { transparency: 50 } } }]
	const rejected = await mcp.call('betterpptx.deck.generate_from_spec', { deckId, deckVersion: version, phase: 'dryRun', commitMode: 'patch', spec, detail: 'full' })
	assert.equal(rejected.ok, false, 'Gradient transparency must be authored per stop, not silently ignored')
	assert.match(JSON.stringify(rejected.error), /textFill|text-fill|stop/)
	assert.equal(getDeck(deckId).deckVersion, version)
	assert.equal((await inspect(getDeck(deckId).pptx)).xml, before)
})
