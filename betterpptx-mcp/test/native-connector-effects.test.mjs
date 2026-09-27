import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { CONNECTOR_EFFECT_COMPONENTS, CONNECTOR_EFFECT_FIELDS, CONNECTOR_EFFECT_PROPERTIES, connectorEffectsPublicReadback, normalizeConnectorEffects, patchConnectorEffects } from '../connector-effects-contract.mjs'
import { normalizeStructuralConnector, normalizeStructuralGroup, STRUCTURAL_CONNECTOR_SCHEMA } from '../structural-authoring-family-contract.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { TOOLS } from '../tools.mjs'
import deckSpecSchema from '../ir/deck-spec.v1.json' with { type: 'json' }

// Optional source proof compiles in memory only. It neither rebuilds dist nor
// changes the running service. The default run tests the shipped runtime.
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
	require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename)
	try { PptxGenJS = require('../../src/pptxgen.ts').default } finally {
		sourceImports.deregister()
		if (previous) require.extensions['.ts'] = previous
		else delete require.extensions['.ts']
	}
	globalThis[Symbol.for('betterpptx.test.connector-source-runtime')] = PptxGenJS
	const runtimeEntry = new URL('../../dist/pptxgen.es.js', import.meta.url).href
	registerHooks({ load(url, context, nextLoad) {
		if (url === runtimeEntry) return { format: 'module', source: "export default globalThis[Symbol.for('betterpptx.test.connector-source-runtime')]", shortCircuit: true }
		return nextLoad(url, context)
	} })
	process.env.BETTERPPTX_IMPORT_DIST_DIRECT = '1'
} else PptxGenJS = require('../../dist/pptxgen.cjs.js')

// Entitlements are isolated to this fixture process, never a live endpoint.
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_FORCE_PLAN = 'premium'
const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

const glow = { color: '17B5EF', radiusPt: 10, opacity: 0.25 }
const shadow = { type: 'outer', color: '102030', blurPt: 5, distancePt: 2, angleDeg: 45, opacity: 0.3, scaleX: 1.2, scaleY: 0.8, skewXDeg: 4, skewYDeg: -3, rotateWithShape: true }
const reflection = { blurPt: 1, distancePt: 2, directionDeg: 90, startOpacity: 0.4, endOpacity: 0.1, startPosition: 0.1, endPosition: 0.65, scaleY: -80 }
const softEdges = { radiusPt: 1.5 }
const combined = { glow, shadow, reflection, softEdges }
const canonical = normalizeConnectorEffects(combined)
const combinationArray = [{ type: 'glow', ...glow }, { ...shadow, type: 'outerShadow' }, { type: 'reflection', ...reflection }, { type: 'softEdges', ...softEdges }]

function dataOf(result) {
	assert.equal(result?.ok, true, JSON.stringify(result?.error || result))
	return result.data || result
}

function fixture() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native connector effects', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Reviewers', outcome: 'Retain editable light and shadow.', remember: 'Connector effects remain independent from endpoints.' },
		visualDesign: { world: 'editorial', framing: 'Native connectors in parent-local pixel frames' },
		motionTime: { masterClock: 'authored', timingSource: 'native slide timeline' },
		visualReference: { mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1600, height: 900 }, mediaAssets: [] },
		slides: [{ id: 'effects-proof', title: 'Editable effects', layoutIntent: 'title-only', background: { color: '000611' }, content: [
			{ kind: 'connector', name: 'signal', objectName: 'signal', connectorStylePresetId: 'connector-ribbon-036', decorative: true, pixelFrame: { x: 100, y: 100, w: 500, h: 200 }, flipV: true, style: { line: { color: '31CFFF', width: 1.25 }, effects: combinationArray } },
			{ kind: 'group', name: 'signal-group', pixelFrame: { x: 120, y: 500, w: 800, h: 220 }, children: [
				{ kind: 'connector', name: 'group-signal', connectorStylePresetId: 'connector-ribbon-028', pixelFrame: { x: 24, y: 24, w: 220, h: 100 }, style: { line: { color: '31CFFF', width: 1.25 }, ...combined } },
				{ kind: 'group', name: 'inner-signals', pixelFrame: { x: 360, y: 20, w: 360, h: 170 }, children: [
					{ kind: 'connector', name: 'inner-signal', pixelFrame: { x: 12, y: 18, w: 240, h: 90 }, flipV: true, style: { line: { color: '31CFFF', width: 1.25 }, effects: combinationArray } },
				] },
			] },
		] }],
	}
}

function parse(xml) {
	const errors = []
	const doc = new DOMParser({ errorHandler: { warning: message => errors.push(message), error: message => errors.push(message), fatalError: message => errors.push(message) } }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [])
	return doc
}

async function inspect(pptx) {
	const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer', compression: false }))
	const xml = await zip.file('ppt/slides/slide1.xml').async('string')
	const doc = parse(xml)
	return { zip, doc, xml }
}

function carrier(doc, name) {
	const props = Array.from(doc.getElementsByTagName('p:cNvPr')).find(node => node.getAttribute('name') === name || node.getAttribute('name').endsWith(`.${name}`))
	assert.ok(props, `Missing native connector ${name}`)
	return props.parentNode.parentNode
}

function directChildren(node) { return Array.from(node.childNodes).filter(child => child.nodeType === 1) }

function withoutDescriptions(value) {
	if (Array.isArray(value)) return value.map(withoutDescriptions)
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'description').map(([key, item]) => [key, withoutDescriptions(item)]))
	return value
}

function effectSignature(node) {
	const effects = node.getElementsByTagName('a:effectLst')[0]
	return effects?.toString() || ''
}

function assertCombined(node) {
	assert.equal(node.tagName, 'p:cxnSp')
	const spPr = node.getElementsByTagName('p:spPr')[0]
	const effects = spPr.getElementsByTagName('a:effectLst')[0]
	assert.ok(effects, 'Native connector spPr must contain an effect list')
	assert.equal(effects.parentNode, spPr)
	assert.deepEqual(directChildren(effects).map(child => child.tagName), ['a:glow', 'a:outerShdw', 'a:reflection', 'a:softEdge'])
	assert.equal(effects.getElementsByTagName('a:glow')[0].getAttribute('rad'), '127000')
	assert.equal(effects.getElementsByTagName('a:glow')[0].getElementsByTagName('a:alpha')[0].getAttribute('val'), '25000')
	const outer = effects.getElementsByTagName('a:outerShdw')[0]
	for (const [key, expected] of Object.entries({ blurRad: '63500', dist: '25400', dir: '2700000', sx: '120000', sy: '80000', kx: '240000', ky: '-180000', rotWithShape: '1' })) assert.equal(outer.getAttribute(key), expected, key)
	const mirrored = effects.getElementsByTagName('a:reflection')[0]
	for (const [key, expected] of Object.entries({ blurRad: '12700', dist: '25400', dir: '5400000', stA: '40000', endA: '10000', stPos: '10000', endPos: '65000', sy: '-80000' })) assert.equal(mirrored.getAttribute(key), expected, key)
	assert.equal(effects.getElementsByTagName('a:softEdge')[0].getAttribute('rad'), '19050')
}

test('closed connector effects preserve units, explicit nulls, precedence and immutable input', () => {
	const before = structuredClone(combined)
	assert.deepEqual(canonical.glow, { color: '17B5EF', size: 10, opacity: 0.25 })
	assert.equal(canonical.shadow.blur, 5)
	assert.equal(canonical.reflection.fadeEnd, 65)
	assert.deepEqual(canonical.softEdges, { size: 1.5 })
	assert.deepEqual(normalizeConnectorEffects(canonical), canonical)
	assert.deepEqual(combined, before)
	for (const reset of [null, []]) assert.deepEqual(normalizeConnectorEffects({ ...combined, effects: reset }), { glow: null, shadow: null, reflection: null, softEdges: null, effects: reset })
	assert.equal(normalizeConnectorEffects({ shadow: { angleDeg: 360 } }).shadow.angle, 0)
	assert.equal(normalizeConnectorEffects({ reflection: { directionDeg: 360 } }).reflection.angle, 0)
	const array = normalizeConnectorEffects({ glow: { radiusPt: 1 }, effects: combinationArray })
	assert.deepEqual(connectorEffectsPublicReadback(array), { ...canonical, effects: combinationArray })
	const normalized = normalizeStructuralConnector({ style: combined, glow: null })
	assert.equal(normalized.glow, null)
	assert.equal(normalized.style.glow, null)
	assert.deepEqual(normalized.style.reflection, canonical.reflection)
})

test('public connector effect schemas match and reject malformed or private payloads', () => {
	const options = TOOLS.find(tool => tool.name === 'betterpptx.slide.add_connector').inputSchema.properties.options.properties
	for (const field of CONNECTOR_EFFECT_FIELDS) {
		assert.deepEqual(withoutDescriptions(options[field]), withoutDescriptions(CONNECTOR_EFFECT_PROPERTIES[field]))
		assert.deepEqual(STRUCTURAL_CONNECTOR_SCHEMA.properties[field], CONNECTOR_EFFECT_PROPERTIES[field])
		assert.deepEqual(deckSpecSchema.$defs.connectorEffects.properties[field], CONNECTOR_EFFECT_PROPERTIES[field])
	}
	for (const invalid of [
		{ glow: { opacity: 1.1 } }, { glow: { radiusPt: -1 } }, { glow: { color: '<a:srgbClr/>' } },
		{ shadow: { type: 'invented' } }, { reflection: { endPosition: 2 } }, { softEdges: 3 },
		{ effects: [{ type: 'blur', radiusPt: 4 }] }, { effects: new Array(17).fill({ type: 'glow' }) },
		{ effects: [{ type: 'glow', _rawEffectXml: '<a:glow/>' }] }, { glow: { payload: 'private' } },
	]) assert.throws(() => normalizeConnectorEffects(invalid), /must|public|supported/)
	assert.throws(() => normalizeStructuralConnector({ style: { glow: { _rawEffectXml: '<a:glow/>' } } }), /private/)
	assert.throws(() => normalizeStructuralConnector({ patch: { glow: { radiusPt: -1 } } }), /finite number/)
	assert.throws(() => normalizeStructuralGroup({ children: [{ kind: 'connector', style: { shadow: { sourcePath: 'secret' } } }] }), /private/)
	for (const value of [2, 'glow', [], true]) assert.throws(() => patchConnectorEffects(canonical, { glow: value }), /typed effect object/)
})

test('component reset and re-edit cannot resurrect a superseded combination item', () => {
	const current = normalizeConnectorEffects({ effects: combinationArray })
	const reset = patchConnectorEffects(current, { glow: null })
	assert.equal(reset.glow, null)
	assert.equal(reset.effects.length, 3)
	assert.deepEqual(normalizeConnectorEffects(reset), reset)
	assert.deepEqual(reset.shadow, canonical.shadow)
	const reedit = patchConnectorEffects(reset, { glow: { size: 3, opacity: 0.2 } })
	assert.equal(reedit.glow.size, 3)
	assert.equal(reedit.glow.opacity, 0.2)
	assert.deepEqual(normalizeConnectorEffects(reedit), reedit)
	const aliasPatch = patchConnectorEffects(current, { shadow: { blurPt: 8 }, reflection: { endPosition: 0.3 } })
	assert.equal(aliasPatch.shadow.blur, 8)
	assert.equal(aliasPatch.reflection.fadeEnd, 30)
	for (const resetValue of [null, []]) {
		const allReset = patchConnectorEffects(current, { effects: resetValue })
		for (const kind of CONNECTOR_EFFECT_COMPONENTS) assert.equal(allReset[kind], null)
		const afterReset = patchConnectorEffects(allReset, { glow: { radiusPt: 2 } })
		assert.equal(normalizeConnectorEffects(afterReset).glow.size, 2)
		assert.equal(afterReset.effects, undefined)
	}
})

test('compiler carries effects and sparse line state through nested parent-local pixel groups', () => {
	const spec = fixture()
	const before = structuredClone(spec)
	const plan = buildSpecOperationPlan(spec)
	const connector = plan.operations.find(op => op.tool === 'betterpptx.slide.add_connector').args.options
	assert.deepEqual(connector.glow, canonical.glow)
	assert.deepEqual(connector.effects, combinationArray)
	assert.deepEqual(connector._connectorStyleState.authoredLineOverrides, { color: '31CFFF', width: 1.25 })
	const group = plan.operations.find(op => op.tool === 'betterpptx.slide.add_group').args.options
	assert.equal(group.children[0].connectorStylePresetId, 'connector-ribbon-028')
	assert.deepEqual(group.children[0].line, { color: '31CFFF', width: 1.25 })
	assert.deepEqual(group.children[0].style.glow, canonical.glow)
	assert.ok(Math.abs(group.children[1].children[0].x - 0.1) < 1e-6)
	assert.equal(group.children[1].children[0].y, 0.15)
	assert.deepEqual(spec, before)
	assert.doesNotMatch(JSON.stringify(group), /_rawConnector|_connectorStyleState|_nativeObject/)
})

test('native standalone and prepared/fallback grouped connectors serialize exact ordered effects and unique IDs', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addShape('rect', { x: 0, y: 0, w: 1, h: 1, objectName: 'start' })
	slide.addShape('rect', { x: 4, y: 0, w: 1, h: 1, objectName: 'end' })
	slide.addConnector({ x: 1, y: 0.5, w: 3, h: 0, objectName: 'standalone', connectorType: 'elbowConnector2', startShapeId: 2, startConnectionIndex: 3, endShapeId: 3, endConnectionIndex: 1, flipV: true, rotate: 12, line: { width: 1.25, color: '31CFFF', endArrowType: 'triangle' }, ...canonical })
	slide.addGroup({ x: 1, y: 2, w: 5, h: 2, objectName: 'outer', children: [
		{ kind: 'connector', objectName: 'prepared', x: 0.1, y: 0.2, w: 2, h: 0.5, ...canonical },
		{ kind: 'group', objectName: 'inner', x: 2.5, y: 0.1, w: 2, h: 1.5, children: [
			{ kind: 'connector', objectName: 'fallback', x: 0.1, y: 0.15, w: 1, h: 0.5, style: canonical },
		] },
	] })
	delete slide._slideObjects[3].group.children[1].children[0]._nativeObject
	const before = JSON.stringify(slide._slideObjects.slice(2))
	const { doc, xml, zip } = await inspect(pptx)
	for (const name of ['standalone', 'prepared', 'fallback']) assertCombined(carrier(doc, name))
	assert.equal(carrier(doc, 'prepared').parentNode.tagName, 'p:grpSp')
	assert.equal(carrier(doc, 'fallback').parentNode.tagName, 'p:grpSp')
	const connector = carrier(doc, 'standalone')
	assert.equal(connector.getElementsByTagName('a:stCxn')[0].getAttribute('id'), '2')
	assert.equal(connector.getElementsByTagName('a:endCxn')[0].getAttribute('id'), '3')
	assert.equal(connector.getElementsByTagName('a:xfrm')[0].getAttribute('flipV'), '1')
	assert.equal(connector.getElementsByTagName('a:xfrm')[0].getAttribute('rot'), '720000')
	assert.equal(connector.getElementsByTagName('a:ext')[0].getAttribute('cy'), '0')
	const ids = Array.from(doc.getElementsByTagName('p:cNvPr')).map(node => node.getAttribute('id'))
	assert.equal(new Set(ids).size, ids.length)
	assert.equal(doc.getElementsByTagName('p:pic').length, 0)
	assert.equal(Object.keys(zip.files).filter(name => name.startsWith('ppt/media/') && !zip.files[name].dir).length, 0)
	assert.equal((await inspect(pptx)).xml, xml, 'Second serialization must not multiply units or mutate effects')
	assert.equal(JSON.stringify(slide._slideObjects.slice(2)), before)
})

test('native empty resets omit effect lists and inner shadows carry only schema-defined attributes', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addConnector({ objectName: 'none', ...normalizeConnectorEffects({ glow: { size: 0 }, shadow: null, reflection: null, softEdges: { size: 0 } }) })
	slide.addConnector({ objectName: 'inner-shadow', ...normalizeConnectorEffects({ shadow: { type: 'inner', blurPt: 3, distancePt: 2, angleDeg: 180, color: '000000', opacity: 0.3, rotateWithShape: true } }) })
	const { doc } = await inspect(pptx)
	assert.equal(carrier(doc, 'none').getElementsByTagName('a:effectLst').length, 0)
	const inner = carrier(doc, 'inner-shadow').getElementsByTagName('a:innerShdw')[0]
	assert.deepEqual(Array.from(inner.attributes).map(attribute => attribute.name).sort(), ['blurRad', 'dir', 'dist'])
	assert.equal(inner.getAttribute('blurRad'), '38100')
})

test('public dryRun, commit and semantic replay retain editable connector effects in mixed groups', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `connector-effects-${Date.now()}` })
	dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'dryRun', spec: fixture(), detail: 'full' }))
	const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: fixture(), detail: 'full' }))
	const { doc } = await inspect(getDeck(committed.deckId).pptx)
	for (const name of ['signal', 'group-signal', 'inner-signal']) assertCombined(carrier(doc, name))
	const group = getDeck(committed.deckId).pptx.slides[0]._slideObjects.find(object => object._type === 'group')
	assert.equal(group.group.children[0]._nativeObject._type, 'connector')
	assert.equal(getDeck(committed.deckId).pptx.slides[0]._slideObjects.filter(object => object._type === 'connector').length, 1)
	const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, detail: 'full' }))
	const block = exported.spec.slides[0].content.find(item => item.kind === 'connector')
	assert.deepEqual(block.style.glow, canonical.glow)
	assert.deepEqual(block.style.line, { color: '31CFFF', width: 1.25 })
	assert.equal(block.connectorStylePresetId, 'connector-ribbon-036')
	const groupBlock = exported.spec.slides[0].content.find(item => item.kind === 'group')
	assert.equal(groupBlock.children[0].connectorStylePresetId, 'connector-ribbon-028')
	assert.deepEqual(groupBlock.children[0].style.glow, canonical.glow)
	assert.deepEqual(groupBlock.children[0].style.line, { color: '31CFFF', width: 1.25 })
	assert.doesNotMatch(JSON.stringify(exported), /_nativeObject|_connectorStyleState|_rawConnector|sourcePath|effectLst|<a:/)
	const replayed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: exported.spec, detail: 'full' }))
	const replayDoc = (await inspect(getDeck(replayed.deckId).pptx)).doc
	for (const name of ['signal', 'group-signal', 'inner-signal']) assert.equal(effectSignature(carrier(replayDoc, name)), effectSignature(carrier(doc, name)))
	for (const invalid of [{ glow: { _rawEffectXml: '<a:glow/>' } }, { effects: [{ type: 'blur', radiusPt: 8 }] }]) {
		const bad = fixture()
		bad.slides[0].content[0].style = { line: { color: '31CFFF' }, ...invalid }
		const result = await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'dryRun', spec: bad, detail: 'full' })
		assert.equal(result.ok, false)
	}
	const invalidPatch = fixture()
	invalidPatch.slides[0].content = [{ kind: 'connector', name: 'signal', objectName: 'signal', patch: { glow: { radiusPt: -1 } } }]
	const rejectedPatch = await mcp.call('betterpptx.deck.generate_from_spec', { deckId: committed.deckId, deckVersion: getDeck(committed.deckId).deckVersion, phase: 'dryRun', commitMode: 'patch', spec: invalidPatch, detail: 'full' })
	assert.equal(rejectedPatch.ok, false)
	assert.match(JSON.stringify(rejectedPatch.error || rejectedPatch), /radiusPt|finite number/)
})

test('public sparse effect reset and re-edit preserve line, endpoints and exact replay', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `connector-effect-reset-${Date.now()}` })
	const created = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: fixture(), detail: 'full' }))
	const deckId = created.deckId
	const native = () => getDeck(deckId).pptx.slides[0]._slideObjects.find(object => object._type === 'connector')
	const patch = async value => {
		const spec = fixture()
		spec.slides[0].content = [{ kind: 'connector', name: 'signal', objectName: native().options.objectName, patch: value }]
		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { deckId, deckVersion: getDeck(deckId).deckVersion, phase: 'commit', commitMode: 'patch', spec, detail: 'full' }))
	}
	const originalLine = structuredClone(native().options.line)
	const originalFrame = Object.fromEntries(['x', 'y', 'w', 'h', 'flipV'].map(key => [key, native().options[key]]))
	await patch({ glow: null })
	assert.equal(native().options.glow, null)
	assert.deepEqual(native().options.line, originalLine)
	assert.equal(native().options.effects.length, 3)
	let exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId, detail: 'full' }))
	assert.equal(exported.spec.slides[0].content.find(item => item.kind === 'connector').style.glow, null)
	const replay = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: exported.spec, detail: 'full' }))
	assert.equal(carrier((await inspect(getDeck(replay.deckId).pptx)).doc, 'signal').getElementsByTagName('a:glow').length, 0)
	await patch({ effects: [] })
	for (const kind of CONNECTOR_EFFECT_COMPONENTS) assert.equal(native().options[kind], null)
	assert.equal(carrier((await inspect(getDeck(deckId).pptx)).doc, 'signal').getElementsByTagName('a:effectLst').length, 0)
	await patch({ glow: { color: '31CFFF', radiusPt: 2, opacity: 0.5 } })
	assert.equal(native().options.glow.size, 2)
	assert.equal(native().options.effects, undefined)
	assert.deepEqual(native().options.line, originalLine)
	assert.deepEqual(Object.fromEntries(['x', 'y', 'w', 'h', 'flipV'].map(key => [key, native().options[key]])), originalFrame)
	exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId, detail: 'full' }))
	const after = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: exported.spec, detail: 'full' }))
	assert.equal(effectSignature(carrier((await inspect(getDeck(after.deckId).pptx)).doc, 'signal')), effectSignature(carrier((await inspect(getDeck(deckId).pptx)).doc, 'signal')))
})
