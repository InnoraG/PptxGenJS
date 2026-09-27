import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { validateTransitionFormatOptions } from '../option-registry.mjs'
import { resolveTransitionPreset } from '../source-api-gallery-presets.mjs'

// Same cases exercise source or shipped runtime, wholly in memory. No build,
// PowerPoint, service, presentation file, source spec or media is written.
const require = createRequire(import.meta.url)
let PptxGenJS
if (process.env.BETTERPPTX_TEST_NATIVE_SOURCE === '1') {
	const ts = require('typescript')
	const previous = require.extensions['.ts']
	const sourceRoot = new URL('../../src/', import.meta.url).href
	const imports = registerHooks({ resolve(specifier, context, nextResolve) {
		if (context.parentURL?.startsWith(sourceRoot) && specifier.startsWith('.') && specifier.endsWith('.js')) {
			const typed = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL)
			if (existsSync(fileURLToPath(typed))) return nextResolve(fileURLToPath(typed), context)
		}
		return nextResolve(specifier, context)
	} })
	require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename)
	try { PptxGenJS = require('../../src/pptxgen.ts').default } finally {
		imports.deregister()
		if (previous) require.extensions['.ts'] = previous
		else delete require.extensions['.ts']
	}
	globalThis[Symbol.for('betterpptx.test.standard-transition-source')] = PptxGenJS
	const runtimeEntry = new URL('../../dist/pptxgen.es.js', import.meta.url).href
	registerHooks({ load(url, context, nextLoad) {
		if (url === runtimeEntry) return { format: 'module', source: "export default globalThis[Symbol.for('betterpptx.test.standard-transition-source')]", shortCircuit: true }
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

const P14 = 'http://schemas.microsoft.com/office/powerpoint/2010/main'
const dataOf = result => { assert.equal(result?.ok, true, JSON.stringify(result)); return result.data || result }
const elements = node => Array.from(node.childNodes || []).filter(child => child.nodeType === 1)
const effect = transition => elements(transition)[0]
const attrs = node => Object.fromEntries(Array.from(node.attributes || []).map(attribute => [attribute.name, attribute.value]))

async function inspect(pptx) {
	const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer', compression: false }), { checkCRC32: true })
	const xml = await zip.file('ppt/slides/slide1.xml').async('string')
	const errors = []
	const doc = new DOMParser({ errorHandler: { warning: message => errors.push(message), error: message => errors.push(message), fatalError: message => errors.push(message) } }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [])
	return { xml, doc, transitions: Array.from(doc.getElementsByTagName('p:transition')) }
}

async function native(transition) {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addText('Native transition timing', { x: 1, y: 1, w: 6, h: 1, fontSize: 24 })
	slide.transition = structuredClone(transition)
	return { ...(await inspect(pptx)), pptx, slide }
}

function assertDuration(result, duration, childName, childAttributes = {}) {
	assert.equal(result.transitions.length, 2)
	const [choice, fallback] = result.transitions
	assert.equal(choice.parentNode.tagName, 'mc:Choice')
	assert.equal(choice.parentNode.getAttribute('Requires'), 'p14')
	assert.equal(choice.lookupNamespaceURI('p14'), P14)
	assert.equal(choice.getAttributeNS(P14, 'dur'), String(duration))
	assert.equal(fallback.parentNode.tagName, 'mc:Fallback')
	assert.equal(fallback.hasAttributeNS(P14, 'dur'), false)
	for (const transition of result.transitions) {
		assert.equal(effect(transition).tagName, childName)
		assert.deepEqual(attrs(effect(transition)), childAttributes)
	}
	const modernAttrs = attrs(choice)
	delete modernAttrs['p14:dur']
	assert.deepEqual(attrs(fallback), modernAttrs, 'fallback must preserve speed, click and auto-advance controls')
}

function spec(transition) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native standard transition duration', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Reviewers', outcome: 'Keep authored transition timing.', remember: 'Milliseconds survive native serialization.' },
		visualDesign: { world: 'editorial', framing: 'One native timing proof.' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide timing', syncPolicy: 'one static clock' },
		motion: { autoSync: false },
		slides: [{ id: 'native-duration', title: 'Native timing', layoutIntent: 'title-only', transition, content: [{ kind: 'text', name: 'body', text: 'The authored duration remains editable.' }] }],
	}
}

test('standard Fade350 reaches a modern native choice with an identical legacy fade fallback', async () => {
	const transition = { type: 'fade', duration: 350, advanceOnClick: false, advanceAfterTime: 6000 }
	const result = await native(transition)
	assertDuration(result, 350, 'p:fade')
	assert.equal(result.transitions[0].hasAttribute('spd'), false, 'do not invent a speed when an exact duration is authored')
	assert.equal(result.transitions[0].getAttribute('advClick'), '0')
	assert.equal(result.transitions[0].getAttribute('advTm'), '6000')
	assert.deepEqual(result.slide.transition, transition)
	assert.equal((await inspect(result.pptx)).xml, result.xml, 'repeat serialization must not rewrite timing')
})

test('standard effect attributes and speed remain identical in the duration fallback', async () => {
	const cases = [
		[{ type: 'fade', throughBlack: true }, 'p:fade', { thruBlk: '1' }],
		[{ type: 'push', direction: 'left' }, 'p:push', { dir: 'l' }],
		[{ type: 'wipe', direction: 'up' }, 'p:wipe', { dir: 'u' }],
		[{ type: 'split', direction: 'vert', splitDirection: 'out' }, 'p:split', { orient: 'vert', dir: 'out' }],
	]
	for (const [transition, child, attributes] of cases) {
		const result = await native({ ...transition, duration: 350, speed: 'medium', advanceOnClick: false, advanceAfterTime: 9100 })
		assertDuration(result, 350, child, attributes)
		assert.equal(result.transitions[0].getAttribute('spd'), 'med')
		assert.equal(result.transitions[0].getAttribute('advTm'), '9100')
	}
})

test('explicit zero, millisecond alias and canonical precedence do not disappear', async () => {
	for (const [options, expected] of [[{ duration: 0 }, 0], [{ durationMs: 0 }, 0], [{ durationMs: 350 }, 350], [{ duration: 350, durationMs: 900 }, 350], [{ duration: 86400000 }, 86400000]]) {
		validateTransitionFormatOptions({ type: 'fade', ...options })
		assertDuration(await native({ type: 'fade', ...options }), expected, 'p:fade')
	}
})

test('omitted and null standard durations preserve the exact legacy transition bytes', async () => {
	const expected = '<p:transition spd="med" advClick="0" advTm="6000"><p:wipe dir="l"/></p:transition>'
	for (const duration of [{}, { duration: undefined }, { duration: null }, { durationMs: null }, { duration: null, durationMs: 350 }]) {
		const result = await native({ type: 'wipe', direction: 'left', speed: 'medium', advanceOnClick: false, advanceAfterTime: 6000, ...duration })
		assert.equal(result.transitions.length, 1)
		assert.equal(result.transitions[0].parentNode.tagName, 'p:sld')
		assert.ok(result.xml.includes(expected))
	}
	assert.equal((await native({ type: 'none', duration: 350 })).transitions.length, 0)
})

test('public durationMs null reset is not coerced into an explicit zero duration', () => {
	const reset = resolveTransitionPreset({ type: 'fade', durationMs: null })
	assert.notEqual(reset.duration, 0)
	assert.ok(reset.duration == null)
	assert.equal(reset.durationMs, undefined)
	assert.deepEqual(resolveTransitionPreset({ type: 'fade', durationMs: 0 }), { type: 'fade', duration: 0 })
	assert.deepEqual(resolveTransitionPreset({ type: 'fade', duration: null, durationMs: 350 }), { type: 'fade', duration: null })
	for (const value of [-1, 0.5, NaN, Infinity, 86400001, '350']) assert.throws(() => validateTransitionFormatOptions({ type: 'fade', duration: value }), /duration/)
})

test('public compile, native serialization, export replay and null reset retain the same duration controls', async () => {
	const transition = { type: 'fade', duration: 350, advanceOnClick: false, advanceAfterTime: 6000 }
	const authored = spec(transition), unchanged = structuredClone(authored)
	const planned = buildSpecOperationPlan(authored, { dryRun: true, plan: 'premium' }).operations.find(operation => operation.tool === 'betterpptx.slide.add')
	assert.deepEqual(planned.args.transition, transition)
	const mcp = createMcpToolDispatcher({ sessionId: `standard-duration-${Date.now()}-${Math.random()}`, blackBox: true })
	const ownedDecks = []
	try {
		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: authored, phase: 'dryRun', detail: 'full' }))
		const initial = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: authored, phase: 'commit', detail: 'full' }))
		ownedDecks.push(initial.deckId)
		assert.deepEqual(getDeck(initial.deckId).pptx.slides[0].transition, transition)
		assertDuration(await inspect(getDeck(initial.deckId).pptx), 350, 'p:fade')
		const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: initial.deckId, detail: 'full' }))
		assert.equal(exported.spec.slides[0].transition.duration, 350)
		const replay = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: exported.spec, phase: 'commit', commitMode: 'createNew', detail: 'full' }))
		ownedDecks.push(replay.deckId)
		assertDuration(await inspect(getDeck(replay.deckId).pptx), 350, 'p:fade')
		const patch = { ...authored, slides: [{ id: 'native-duration', transition: { ...transition, duration: null } }] }
		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { deckId: initial.deckId, deckVersion: getDeck(initial.deckId).deckVersion, spec: patch, phase: 'commit', commitMode: 'patch', detail: 'full' }))
		const reset = await inspect(getDeck(initial.deckId).pptx)
		assert.equal(reset.transitions.length, 1)
		assert.equal(reset.transitions[0].parentNode.tagName, 'p:sld')
		assert.equal(reset.transitions[0].getAttribute('advTm'), '6000')
		assert.equal(reset.transitions[0].hasAttributeNS(P14, 'dur'), false)
		assert.equal(effect(reset.transitions[0]).tagName, 'p:fade')
		const cleared = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: initial.deckId, detail: 'full' }))
		assert.ok(cleared.spec.slides[0].transition.duration == null)
	} finally {
		for (const deckId of ownedDecks) await mcp.call('betterpptx.deck.dispose', { deckId })
	}
	assert.deepEqual(authored, unchanged)
})
