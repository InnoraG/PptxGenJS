import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

// The source mode stays within this isolated test process; the default proves
// the shipped runtime that the public authoring service loads.
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
	globalThis[Symbol.for('betterpptx.test.motion-path-source-runtime')] = PptxGenJS
	const runtimeEntry = new URL('../../dist/pptxgen.es.js', import.meta.url).href
	registerHooks({ load(url, context, nextLoad) {
		if (url === runtimeEntry) return { format: 'module', source: "export default globalThis[Symbol.for('betterpptx.test.motion-path-source-runtime')]", shortCircuit: true }
		return nextLoad(url, context)
	} })
	process.env.BETTERPPTX_IMPORT_DIST_DIRECT = '1'
} else PptxGenJS = require('../../dist/pptxgen.cjs.js')

// These test-only entitlements never alter a running endpoint.
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_FORCE_PLAN = 'premium'
const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

const customPath = 'M 0 0 C 0.14653110 -0.16471838 0.34389952 -0.15409139 0.45035885 -0.00637620 E'
const legacyPath = 'M 0 0 L 0.1 0.2 E'
const animation = { type: 'motion', effect: 'right', motionPath: 'right', motionPathData: customPath, trigger: 'withPrevious', delay: 1200, duration: 1800, repeatCount: 2, autoReverse: true }

function fixture() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Editable custom motion path', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Presentation authors', outcome: 'Move an editable card along an authored path.', remember: 'The published custom path controls the native animation.' },
		visualDesign: { world: 'editorial', framing: 'One editable native card' },
		motionTime: { masterClock: 'authored', timingSource: 'native slide timeline' },
		visualReference: { mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1600, height: 900 }, mediaAssets: [] },
		slides: [{ id: 'path-proof', title: 'Move the card', layoutIntent: 'title-only', background: { color: '000611' }, content: [
			{ kind: 'group', name: 'card', pixelFrame: { x: 150, y: 300, w: 300, h: 180 }, children: [
				{ kind: 'shape', name: 'card-panel', shape: 'rect', pixelFrame: { x: 0, y: 0, w: 300, h: 180 }, style: { fill: { color: '173452' }, line: { color: '31CFFF', width: 1 } } },
				{ kind: 'text', name: 'card-label', text: 'Move me', pixelFrame: { x: 30, y: 30, w: 240, h: 70 }, style: { color: 'FFFFFF', fontSize: 24 } },
			] },
		], timeline: [{ id: 'card-transfer', objectName: 'card', ...animation, durationMs: animation.duration, delayMs: animation.delay }] }],
	}
}

function dataOf(result) {
	assert.equal(result?.ok, true, JSON.stringify(result?.error || result))
	return result.data || result
}

async function inspect(pptx) {
	const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer', compression: false }))
	const errors = []
	const xml = await zip.file('ppt/slides/slide1.xml').async('string')
	const doc = new DOMParser({ errorHandler: { warning: value => errors.push(value), error: value => errors.push(value), fatalError: value => errors.push(value) } }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [])
	return { doc, xml }
}

function paths(doc) {
	return Array.from(doc.getElementsByTagName('p:animMotion')).map(node => node.getAttribute('path'))
}

test('published motionPathData reaches the semantic native operation without a private alias', () => {
	const spec = fixture()
	const before = structuredClone(spec)
	const plan = buildSpecOperationPlan(spec, { dryRun: true, plan: 'premium' })
	const operation = plan.operations.find(item => item.tool === 'betterpptx.slide.animate_shapes')
	assert.ok(operation)
	assert.equal(operation.args.animation.motionPathData, customPath)
	assert.equal(operation.args.animation.pathData, undefined)
	assert.equal(operation.args.animation.duration, 1800)
	assert.equal(operation.args.animation.delay, 1200)
	assert.deepEqual(spec, before)
})

test('native serializer prefers the published custom path and retains legacy aliases and defaults', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	for (const [index, options] of [
		{ ...animation, pathData: legacyPath, path: 'M 0 0 L 0.9 0 E' },
		{ ...animation, motionPathData: null, pathData: legacyPath },
		{ ...animation, motionPathData: undefined, path: legacyPath },
		{ ...animation, motionPathData: null },
	].entries()) {
		slide.addText(`Card ${index}`, { x: 1 + index * 2, y: 2, w: 1, h: 1 })
		slide.addAnimation(slide._slideObjects.at(-1), options)
	}
	const { doc } = await inspect(pptx)
	const actual = paths(doc)
	assert.equal(actual.length, 4)
	assert.deepEqual(actual.slice(0, 3), [customPath, legacyPath, legacyPath])
	assert.ok(actual[3].startsWith('M '))
	assert.notEqual(actual[3], customPath)
	assert.notEqual(actual[3], legacyPath)
})

test('path attribute encoding cannot create sibling attributes or XML elements', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	const hostile = 'M 0 0 E" test="<tag>&'
	slide.addText('Encoding proof', { x: 1, y: 1, w: 3, h: 1 })
	slide.addAnimation(slide._slideObjects.at(-1), { ...animation, motionPathData: hostile })
	const { doc } = await inspect(pptx)
	const motion = doc.getElementsByTagName('p:animMotion')[0]
	assert.equal(motion.getAttribute('path'), hostile)
	assert.equal(motion.hasAttribute('test'), false)
	assert.equal(doc.getElementsByTagName('tag').length, 0)
})

test('public commit and semantic replay preserve the custom path on a rigid native group', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `native-motion-path-${Date.now()}` })
	dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'dryRun', spec: fixture(), detail: 'full' }))
	const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: fixture(), detail: 'full' }))
	const { doc } = await inspect(getDeck(committed.deckId).pptx)
	assert.deepEqual(paths(doc), [customPath])
	const motion = doc.getElementsByTagName('p:animMotion')[0]
	assert.equal(motion.getAttribute('origin'), 'layout')
	assert.equal(motion.getAttribute('pathEditMode'), 'relative')
	assert.equal(motion.getElementsByTagName('p:cTn')[0].getAttribute('dur'), '1800')
	assert.equal(motion.parentNode.getElementsByTagName('p:cTn')[0]?.getAttribute('dur'), '1800')
	const owner = motion.parentNode.parentNode
	assert.equal(owner.getAttribute('repeatCount'), '2000')
	assert.equal(owner.getAttribute('autoRev'), '1')
	assert.equal(owner.getElementsByTagName('p:cond')[0].getAttribute('delay'), '1200')
	const target = motion.getElementsByTagName('p:spTgt')[0].getAttribute('spid')
	const carrier = Array.from(doc.getElementsByTagName('p:cNvPr')).find(node => node.getAttribute('id') === target)
	assert.equal(carrier.parentNode.parentNode.tagName, 'p:grpSp')
	assert.equal(doc.getElementsByTagName('p:pic').length, 0)
	const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, mode: 'effectivePrecompile', detail: 'full' }))
	assert.ok(JSON.stringify(exported.spec).includes(customPath))
	const replay = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', spec: exported.spec, detail: 'full' }))
	assert.deepEqual(paths((await inspect(getDeck(replay.deckId).pptx)).doc), [customPath])
})
