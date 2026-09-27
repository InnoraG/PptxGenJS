import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { ANIMATION_FORMAT_PARAMETERS, validateAnimationFormatOptions } from '../animation-format-catalog.mjs'
import { validateAnimationAuthoringOperationArgs } from '../animation-authoring-operation-contract.mjs'

// Isolated source/shipped-runtime proof. No endpoint, Office, build or user
// artifact is created; packages remain in memory and owned fixture decks close.
const require = createRequire(import.meta.url)
let PptxGenJS
if (process.env.BETTERPPTX_TEST_NATIVE_SOURCE === '1') {
	const ts = require('typescript'), previous = require.extensions['.ts']
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
	globalThis[Symbol.for('betterpptx.test.group-animation-runtime')] = PptxGenJS
	const runtimeEntry = new URL('../../dist/pptxgen.es.js', import.meta.url).href
	registerHooks({ load(url, context, nextLoad) {
		if (url === runtimeEntry) return { format: 'module', source: "export default globalThis[Symbol.for('betterpptx.test.group-animation-runtime')]", shortCircuit: true }
		return nextLoad(url, context)
	} })
	process.env.BETTERPPTX_IMPORT_DIST_DIRECT = '1'
} else PptxGenJS = require('../../dist/pptxgen.cjs.js')
Object.assign(process.env, { BETTERPPTX_PUBLIC_BLACK_BOX: '1', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1', BETTERPPTX_LOCAL_MAINTAINER: '0', BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_PREMIUM: '1', BETTERPPTX_FORCE_PLAN: 'premium', BETTERPPTX_FREE_PREVIEW_SLIDES: '99' })
const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

const dataOf = result => { assert.equal(result?.ok, true, JSON.stringify(result)); return result.data || result }
const nodes = (root, tag) => Array.from(root.getElementsByTagName(tag))
const props = (doc, name) => { const found = nodes(doc, 'p:cNvPr').find(node => node.getAttribute('name') === name); assert.ok(found, name); return found }
const attributes = node => Object.fromEntries(Array.from(node.attributes).map(attr => [attr.name, attr.value]))
async function inspect(pptx) {
	const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer', compression: false }), { checkCRC32: true })
	const xml = await zip.file('ppt/slides/slide1.xml').async('string'), errors = []
	const doc = new DOMParser({ errorHandler: { warning: value => errors.push(value), error: value => errors.push(value), fatalError: value => errors.push(value) } }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [])
	const ids = nodes(doc, 'p:cNvPr').map(node => node.getAttribute('id'))
	assert.equal(new Set(ids).size, ids.length)
	for (const target of nodes(doc, 'p:spTgt')) assert.ok(ids.includes(target.getAttribute('spid')), 'every native timing target exists')
	return { zip, xml, doc }
}
function transformed(doc) {
	const names = new Map(nodes(doc, 'p:cNvPr').map(node => [node.getAttribute('id'), node.getAttribute('name')]))
	return [...nodes(doc, 'p:animScale'), ...nodes(doc, 'p:animRot'), ...nodes(doc, 'p:animMotion')].map(node => ({
		kind: node.tagName,
		target: names.get(nodes(node, 'p:spTgt')[0].getAttribute('spid')),
		attributes: attributes(node),
		by: nodes(node, 'p:by').map(attributes),
		duration: nodes(node, 'p:cTn')[0].getAttribute('dur'),
		startDelayMs: nativeStartDelay(node),
	}))
}
function nativeStartDelay(node) {
	let total = 0
	for (let ancestor = node; ancestor; ancestor = ancestor.parentNode) {
		if (ancestor.tagName !== 'p:cTn') continue
		const conditions = Array.from(ancestor.childNodes).find(child => child.tagName === 'p:stCondLst')
		if (!conditions) continue
		const numeric = nodes(conditions, 'p:cond').filter(condition => condition.hasAttribute('delay') && Number.isFinite(Number(condition.getAttribute('delay'))))
		assert.ok(numeric.length <= 1, 'these focused probes have one numeric start condition per timing owner')
		if (numeric.length) total += Number(numeric[0].getAttribute('delay'))
	}
	return total
}
function nativeGroup(slide, name = 'card') {
	slide.addGroup({ objectName: name, x: 1, y: 1, w: 3, h: 2, children: [
		{ kind: 'shape', shape: 'rect', objectName: `${name}-panel`, x: 0, y: 0, w: 3, h: 2, style: { fill: { color: '173452' }, line: { color: '31CFFF', width: 1 } } },
		{ kind: 'group', objectName: `${name}-details`, x: 0.2, y: 0.2, w: 2.6, h: 1.6, children: [
			{ kind: 'text', objectName: `${name}-label`, text: 'Native lettering', x: 0.1, y: 0.1, w: 2.3, h: 0.5, style: { fontSize: 18, margin: 0, color: 'FFFFFF', rotate: 5 } },
		] },
	] })
}
function fixture(timeline) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Native grouped motion controls', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Reviewers', outcome: 'Move geometry and text independently.', remember: 'Named descendants remain native and editable.' },
		visualDesign: { world: 'editorial', framing: 'One editable group and one ordinary shape' },
		motionTime: { masterClock: 'authored', timingSource: 'native slide timeline' }, motion: { autoSync: false },
		visualReference: { mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1600, height: 900 }, mediaAssets: [] },
		slides: [{ id: 'group-motion', title: 'Native group motion', layoutIntent: 'title-only', background: { color: '000611' }, content: [
			{ kind: 'group', name: 'card', pixelFrame: { x: 120, y: 180, w: 500, h: 260 }, children: [
				{ kind: 'shape', name: 'card-panel', shape: 'rect', pixelFrame: { x: 0, y: 0, w: 500, h: 260 }, style: { fill: { color: '173452' }, line: { color: '31CFFF', width: 1 } } },
				{ kind: 'group', name: 'card-details', pixelFrame: { x: 20, y: 20, w: 460, h: 220 }, children: [
					{ kind: 'textBox', name: 'card-label', text: 'Native lettering', pixelFrame: { x: 10, y: 10, w: 420, h: 70 }, style: { fontFace: 'Arial', fontSize: 24, margin: 0, color: 'FFFFFF', wrap: false } },
				] },
			] },
			{ kind: 'shape', name: 'standalone', shape: 'rect', pixelFrame: { x: 900, y: 180, w: 120, h: 120 }, style: { fill: { color: 'E1B848' }, line: { type: 'none' } } },
		], timeline: timeline || [
			{ id: 'travel', objectName: 'card', type: 'motion', effect: 'right', motionPath: 'right', motionPathData: 'M 0 0 C 0.1 -0.1 0.2 -0.1 0.3 0 E', trigger: 'withPrevious', delayMs: 100, durationMs: 1200 },
			{ id: 'panel-fit', objectName: 'card-panel', type: 'emphasis', effect: 'growshrink', scaleX: 0.81234, scaleY: 0.91, trigger: 'withPrevious', delayMs: 100, durationMs: 1200 },
			{ id: 'label-turn', objectName: 'card-label', type: 'emphasis', effect: 'spin', rotation: 9, trigger: 'withPrevious', delayMs: 100, durationMs: 1200 },
		] }],
	}
}

test('typed transform catalog, schemas and normalization expose explicit axis factors and resets', () => {
	for (const id of ['scaleX', 'scaleY']) {
		const parameter = ANIMATION_FORMAT_PARAMETERS.find(item => item.id === id)
		assert.equal(parameter.unit, 'multiplier'); assert.equal(parameter.maximum, 1000); assert.equal(parameter.step, 0.00001)
	}
	const schema = JSON.parse(readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8'))
	assert.equal(schema.$defs.motionStep.properties.scaleX.multipleOf, 0.00001)
	for (const field of ['scaleX', 'scaleY']) for (const value of [-0.1, 1000.00001, 0.000001, NaN, Infinity, '0.9', {}]) {
		assert.throws(() => validateAnimationFormatOptions({ type: 'emphasis', effect: 'growshrink', [field]: value }), new RegExp(field))
	}
	for (const value of [-36000.001, 36000.001, 0.0001, '9', NaN, Infinity]) assert.throws(() => validateAnimationFormatOptions({ type: 'emphasis', effect: 'spin', rotation: value }), /rotation/)
	assert.throws(() => validateAnimationFormatOptions({ type: 'entrance', effect: 'fade', scaleX: 0.8 }), /only.*growshrink/)
	const reset = validateAnimationAuthoringOperationArgs({ names: ['card-label'], animation: { type: 'emphasis', effect: 'growshrink', scale: 0.8, scaleX: null, scaleY: 0, durationMs: 500 } })
	assert.equal(reset.animation.scaleX, null); assert.equal(reset.animation.scaleY, 0); assert.equal(reset.animation.duration, 500)
})

test('native spin uses canonical rotation, explicit zero, null reset and legacy degrees in the right order', async () => {
	const cases = [[{}, 360], [{ rotation: 9 }, 9], [{ rotation: 0 }, 0], [{ degrees: 45 }, 45], [{ degrees: 0 }, 0], [{ rotation: 9, degrees: 180 }, 9], [{ rotation: null, degrees: 180 }, 360], [{ rotation: 9, clockwise: false }, -9], [{ direction: 'quarter counterclockwise' }, -90], [{ rotation: null, direction: 'half clockwise' }, 180]]
	const pptx = new PptxGenJS(), slide = pptx.addSlide()
	for (const [index, [options]] of cases.entries()) {
		slide.addText('Native', { objectName: `spin-${index}`, x: 1, y: 1, w: 2, h: 1 })
		slide.addAnimation(`spin-${index}`, { type: 'emphasis', effect: 'spin', trigger: 'withPrevious', duration: 600, ...options })
	}
	const rows = transformed((await inspect(pptx)).doc)
	assert.deepEqual(rows.map(row => Number(row.attributes.by)), cases.map(([, degrees]) => degrees * 60000))
})

test('native grow/shrink keeps legacy scalar behavior and emits independent typed axes without rounding loss', async () => {
	const cases = [[{}, [150000, 150000]], [{ scale: 0.75 }, [75000, 75000]], [{ scale: 0 }, [0, 0]], [{ scaleX: 0.81234, scaleY: 0.91 }, [81234, 91000]], [{ scale: 0.8, scaleX: null, scaleY: 1 }, [80000, 100000]], [{ scale: null, scaleX: 0, scaleY: null }, [0, 150000]], [{ direction: 'horizontal tiny' }, [25000, 100000]], [{ scaleX: null, direction: 'vertical smaller' }, [100000, 50000]]]
	const pptx = new PptxGenJS(), slide = pptx.addSlide()
	for (const [index, [options]] of cases.entries()) {
		slide.addShape('rect', { objectName: `scale-${index}`, x: 1, y: 1, w: 2, h: 1 })
		slide.addAnimation(`scale-${index}`, { type: 'emphasis', effect: 'growshrink', trigger: 'withPrevious', duration: 600, ...options })
	}
	const rows = transformed((await inspect(pptx)).doc)
	assert.deepEqual(rows.map(row => [Number(row.by[0].x), Number(row.by[0].y)]), cases.map(([, values]) => values))
})

test('native spin and grow/shrink preserve zero duration and restore their native defaults for null', async () => {
	const cases = [[0, '0'], [null, '1000'], [undefined, '1000'], [175, '175']]
	const pptx = new PptxGenJS(), slide = pptx.addSlide()
	for (const effect of ['spin', 'growshrink']) for (const [index, [duration]] of cases.entries()) {
		const name = `${effect}-duration-${index}`
		slide.addText('Native duration', { objectName: name, x: 1, y: 1, w: 3, h: 1 })
		slide.addAnimation(name, { type: 'emphasis', effect, trigger: 'withPrevious', sequence: 'asOneObject', duration, rotation: 9, ...(effect === 'growshrink' ? { scaleX: 0.8, scaleY: 1.1 } : {}) })
	}
	const rows = transformed((await inspect(pptx)).doc)
	for (const effect of ['spin', 'growshrink']) {
		assert.deepEqual(rows.filter(row => row.target.startsWith(`${effect}-duration-`)).map(row => row.duration), cases.map(([, expected]) => expected))
	}
})

test('afterPrevious follows actual spin/scale duration for whole objects and native text sequences', async () => {
	for (const effect of ['spin', 'growshrink']) for (const sequence of ['asOneObject', 'allAtOnce']) for (const duration of [0, null, undefined]) {
		const pptx = new PptxGenJS(), slide = pptx.addSlide()
		slide.addText('First line\nSecond line', { objectName: 'preceding-transform', x: 1, y: 1, w: 3, h: 2 })
		slide.addText('Following transform', { objectName: 'following-transform', x: 5, y: 1, w: 3, h: 1 })
		slide.addAnimation('preceding-transform', { type: 'emphasis', effect, sequence, duration, delay: 200, trigger: 'withPrevious', ...(effect === 'spin' ? { rotation: 9 } : { scaleX: 0.8, scaleY: 1.1 }) })
		slide.addAnimation('following-transform', { type: 'emphasis', effect: 'spin', rotation: -9, duration: 175, delay: 50, trigger: 'afterPrevious' })
		const rows = transformed((await inspect(pptx)).doc)
		const preceding = rows.filter(row => row.target === 'preceding-transform'), following = rows.find(row => row.target === 'following-transform')
		assert.equal(preceding.length, sequence === 'asOneObject' ? 1 : 3)
		assert.ok(preceding.every(row => row.startDelayMs === 200))
		if (duration === 0) assert.ok(preceding.every(row => row.duration === '0'))
		else assert.deepEqual(preceding.map(row => row.duration), sequence === 'asOneObject' ? ['1000'] : ['1000', '2000', '2000'])
		assert.equal(following.startDelayMs, Math.max(...preceding.map(row => row.startDelayMs + Number(row.duration))) + 50, `${effect}/${sequence}/${duration} relative start`)
	}
})

test('transform metadata correction does not change other effect families', async () => {
	const pptx = new PptxGenJS(), slide = pptx.addSlide()
	slide.addShape('rect', { objectName: 'ordinary-fade', x: 1, y: 1, w: 2, h: 1 })
	slide.addText('Following transform', { objectName: 'after-fade', x: 5, y: 1, w: 3, h: 1 })
	slide.addAnimation('ordinary-fade', { type: 'entrance', effect: 'fade', duration: null, delay: 200, trigger: 'withPrevious' })
	slide.addAnimation('after-fade', { type: 'emphasis', effect: 'spin', rotation: 9, duration: 175, delay: 50, trigger: 'afterPrevious' })
	assert.equal(transformed((await inspect(pptx)).doc).find(row => row.target === 'after-fade').startDelayMs, 750, 'unrelated fade retains its existing 500ms timing-metadata default')
})

test('nested named targets survive later top-level and group appends and repeated serialization', async () => {
	const pptx = new PptxGenJS(), slide = pptx.addSlide()
	nativeGroup(slide)
	slide.addAnimation('card-panel', { type: 'emphasis', effect: 'growshrink', scaleX: 0.8, scaleY: 0.9, duration: 900, trigger: 'withPrevious' })
	slide.addAnimation('card-label', { type: 'emphasis', effect: 'spin', rotation: 9, duration: 900, trigger: 'withPrevious' })
	slide.addAnimation('card-details', { type: 'emphasis', effect: 'spin', rotation: 0, duration: 900, trigger: 'withPrevious' })
	const first = await inspect(pptx), labelIdBefore = props(first.doc, 'card-label').getAttribute('id')
	slide.addShape('rect', { objectName: 'later-shape', x: 5, y: 1, w: 1, h: 1 })
	nativeGroup(slide, 'second')
	slide.addAnimation('second-label', { type: 'emphasis', effect: 'spin', rotation: -7, duration: 900, trigger: 'withPrevious' })
	const second = await inspect(pptx)
	assert.notEqual(props(second.doc, 'card-label').getAttribute('id'), labelIdBefore, 'later top-level appends must change descendant allocation')
	assert.deepEqual(transformed(second.doc).map(row => row.target).sort(), ['card-panel', 'card-label', 'card-details', 'second-label'].sort())
	assert.equal(props(second.doc, 'card').getAttribute('id'), '2')
	assert.equal(props(second.doc, 'later-shape').getAttribute('id'), '3')
	assert.equal(props(second.doc, 'second').getAttribute('id'), '4')
	assert.equal(props(second.doc, 'card-label').parentNode.parentNode.tagName, 'p:sp')
	assert.equal(props(second.doc, 'card-label').parentNode.parentNode.parentNode, props(second.doc, 'card-details').parentNode.parentNode)
	assert.equal(nodes(second.doc, 'p:grpSp').length, 4)
	assert.equal(nodes(second.doc, 'p:pic').length, 0, 'motion must not flatten native groups or lettering')
	assert.equal(nodes(props(second.doc, 'card-label').parentNode.parentNode, 'a:t')[0].textContent, 'Native lettering')
	assert.deepEqual(transformed((await inspect(pptx)).doc), transformed(second.doc), 'repeat serialization keeps the same native targets and transform values')
	assert.equal(slide._slideObjects.length, 3, 'no temporary top-level child duplicates')
})

test('ambiguous named descendants and opaque imported trees fail before adding animation records', () => {
	const pptx = new PptxGenJS(), slide = pptx.addSlide()
	nativeGroup(slide); nativeGroup(slide, 'second')
	const duplicate = slide._slideObjects[1].group.children[1].children[0]
	duplicate.objectName = 'card-label'; duplicate._nativeObject.options.objectName = 'card-label'
	const before = [...(slide._animations || [])]
	assert.throws(() => slide.addAnimation('card-label', { type: 'emphasis', effect: 'spin', rotation: 9 }), /ambiguous/)
	assert.deepEqual(slide._animations || [], before)
	duplicate.objectName = 'second-label'; duplicate._nativeObject.options.objectName = 'second-label'
	slide._slideObjects.push({ _type: 'passthrough', passthrough: { xml: '<p:grpSp/>' }, options: { objectName: 'imported' } })
	assert.throws(() => slide.addAnimation('card-label', { type: 'emphasis', effect: 'spin', rotation: 9 }), /opaque imported/)
	assert.deepEqual(slide._animations || [], before)
})

test('removing a child after authoring its motion cannot redirect its stale record to another child', async () => {
	const pptx = new PptxGenJS(), slide = pptx.addSlide()
	nativeGroup(slide); nativeGroup(slide, 'second')
	slide.addAnimation('card-label', { type: 'emphasis', effect: 'spin', rotation: 9, duration: 900, trigger: 'withPrevious' })
	slide.addAnimation('second-label', { type: 'emphasis', effect: 'spin', rotation: 17, duration: 900, trigger: 'withPrevious' })
	slide._slideObjects[0].group.children.splice(1, 1)
	const actual = transformed((await inspect(pptx)).doc)
	assert.deepEqual(actual.map(row => row.target), ['second-label'])
	assert.equal(actual[0].attributes.by, '1020000')
})

test('native image children retain their real picture carrier and relationship while text remains text', async () => {
	const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
	const pptx = new PptxGenJS(), slide = pptx.addSlide()
	slide.addGroup({ objectName: 'media-card', x: 1, y: 1, w: 4, h: 3, children: [
		{ kind: 'image', objectName: 'photo', data: `data:image/png;base64,${png.toString('base64')}`, x: 0, y: 0, w: 2, h: 2 },
		{ kind: 'text', objectName: 'photo-caption', text: 'Editable caption', x: 0, y: 2, w: 4, h: 1 },
	] })
	slide.addAnimation('photo', { type: 'emphasis', effect: 'growshrink', scaleX: 0.8, scaleY: 0.9, duration: 900, trigger: 'withPrevious' })
	const { zip, doc } = await inspect(pptx)
	assert.equal(nodes(doc, 'p:pic').length, 1)
	assert.equal(props(doc, 'photo-caption').parentNode.parentNode.tagName, 'p:sp')
	assert.equal(transformed(doc)[0].target, 'photo')
	const imageFiles = Object.keys(zip.files).filter(name => name.startsWith('ppt/media/') && !zip.files[name].dir)
	assert.equal(imageFiles.length, 1); assert.deepEqual(await zip.file(imageFiles[0]).async('nodebuffer'), png)
	assert.equal(slide._slideObjects.length, 1)
})

test('public compiler resolves named descendants only when explicitly selected and forwards every transform control', () => {
	const source = fixture(), before = structuredClone(source)
	const plan = buildSpecOperationPlan(source, { dryRun: true, plan: 'premium' })
	assert.ok(!plan.warnings?.some(warning => warning.code === 'MOTION_TARGET_NOT_FOUND'))
	const motions = plan.operations.filter(operation => operation.tool === 'betterpptx.slide.animate_shapes')
	assert.deepEqual(motions[1].args.names, ['card-panel']); assert.deepEqual(motions[2].args.names, ['card-label'])
	assert.equal(motions[1].args.animation.scaleX, 0.81234); assert.equal(motions[1].args.animation.scaleY, 0.91)
	assert.equal(motions[2].args.animation.rotation, 9)
	assert.equal(motions[2].args.animation.duration, 1200); assert.equal(motions[2].args.animation.delay, 100)
	const ambiguous = structuredClone(source)
	ambiguous.slides[0].content[0].children.push({ ...ambiguous.slides[0].content[0].children[0], name: 'card-label' })
	assert.throws(() => buildSpecOperationPlan(ambiguous, { dryRun: true, plan: 'premium' }), /ambiguous/)
	assert.deepEqual(source, before)
})

test('public authored/effective replay and component reset preserve child targets, timing and native text', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `native-group-transform-${Date.now()}-${Math.random()}` }), owned = []
	const source = fixture(), before = structuredClone(source)
	try {
		dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: source, phase: 'dryRun', detail: 'full' }))
		const initial = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: source, phase: 'commit', commitMode: 'createNew', detail: 'full' })); owned.push(initial.deckId)
		const first = await inspect(getDeck(initial.deckId).pptx), expected = transformed(first.doc)
		assert.equal(expected.find(row => row.kind === 'p:animRot').attributes.by, '540000')
		assert.equal(expected.find(row => row.kind === 'p:animScale').by[0].x, '81234')
		assert.equal(nodes(first.doc, 'p:pic').length, 0)
		for (const mode of ['authoredInput', 'effectivePrecompile']) {
			const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: initial.deckId, mode, detail: 'full' }))
			assert.doesNotMatch(JSON.stringify(exported.spec), /_nativeObject|_rawTimingXml|targetSpid|degrees/)
			assert.equal(exported.spec.slides[0].timeline[1].scaleX, 0.81234)
			const replay = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: exported.spec, phase: 'commit', commitMode: 'createNew', detail: 'full' })); owned.push(replay.deckId)
			assert.deepEqual(transformed((await inspect(getDeck(replay.deckId).pptx)).doc), expected)
		}
		const reset = structuredClone(source)
		Object.assign(reset.slides[0].timeline[1], { scale: 0.8, scaleX: null, scaleY: 1 })
		reset.slides[0].timeline[2].rotation = null
		const resetDeck = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: reset, phase: 'commit', commitMode: 'createNew', detail: 'full' })); owned.push(resetDeck.deckId)
		const resetRows = transformed((await inspect(getDeck(resetDeck.deckId).pptx)).doc)
		assert.deepEqual(resetRows.find(row => row.kind === 'p:animScale').by, [{ x: '80000', y: '100000' }])
		assert.equal(resetRows.find(row => row.kind === 'p:animRot').attributes.by, '21600000')
		assert.equal(resetRows.find(row => row.kind === 'p:animMotion').attributes.path, expected.find(row => row.kind === 'p:animMotion').attributes.path)
		const bad = structuredClone(source); bad.slides[0].timeline[1].scaleX = -1
		const failed = await mcp.call('betterpptx.deck.generate_from_spec', { spec: bad, phase: 'dryRun', detail: 'full' })
		assert.equal(failed.ok, false)
		const privatePayload = structuredClone(source)
		privatePayload.slides[0].content[0].children[1].children[0]._nativeObject = { options: { spid: 999 } }
		assert.equal((await mcp.call('betterpptx.deck.generate_from_spec', { spec: privatePayload, phase: 'dryRun', detail: 'full' })).ok, false)
		const ambiguous = structuredClone(source); ambiguous.slides[0].content[0].children.push({ ...ambiguous.slides[0].content[0].children[0], name: 'card-label' })
		const entry = getDeck(initial.deckId), version = entry.deckVersion, records = entry.pptx.slides[0]._animations.slice()
		const rejected = await mcp.call('betterpptx.deck.generate_from_spec', { deckId: initial.deckId, spec: ambiguous, phase: 'commit', commitMode: 'patch', detail: 'full' })
		assert.equal(rejected.ok, false); assert.equal(getDeck(initial.deckId).deckVersion, version); assert.deepEqual(getDeck(initial.deckId).pptx.slides[0]._animations, records)
	} finally { for (const deckId of owned) await mcp.call('betterpptx.deck.dispose', { deckId }) }
	assert.deepEqual(source, before)
})

test('public transform durations preserve canonical and alias zero or null through compile and replay', async () => {
	const cases = [
		[{ duration: 0 }, '0'], [{ durationMs: 0 }, '0'],
		[{ duration: null }, '1000'], [{ durationMs: null }, '1000'],
		[{ duration: 0, durationMs: 99 }, '0'], [{ duration: null, durationMs: 99 }, '1000'],
		[{ animation: { duration: 0 } }, '0'], [{ animation: { duration: null } }, '1000'],
	]
	const timeline = cases.flatMap(([duration], index) => [
		{ id: `duration-scale-${index}`, objectName: 'card-panel', type: 'emphasis', effect: 'growshrink', scaleX: 0.8, scaleY: 1.1, trigger: 'withPrevious', delayMs: index * 100, ...duration },
		{ id: `duration-spin-${index}`, objectName: 'card-label', type: 'emphasis', effect: 'spin', rotation: -9, trigger: 'withPrevious', delayMs: index * 100, ...duration },
	])
	const source = fixture(timeline), before = structuredClone(source)
	const plan = buildSpecOperationPlan(source, { dryRun: true, plan: 'premium' })
	const authoredDurations = plan.operations.filter(operation => operation.tool === 'betterpptx.slide.animate_shapes').map(operation => operation.args.animation.duration)
	assert.deepEqual(authoredDurations, cases.flatMap(([, expected]) => expected === '0' ? [0, 0] : [null, null]))
	const mcp = createMcpToolDispatcher({ sessionId: `native-transform-duration-${Date.now()}` }), owned = []
	try {
		const initial = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: source, phase: 'commit', commitMode: 'createNew', detail: 'full' })); owned.push(initial.deckId)
		const expected = transformed((await inspect(getDeck(initial.deckId).pptx)).doc)
		for (const kind of ['p:animScale', 'p:animRot']) assert.deepEqual(expected.filter(row => row.kind === kind).map(row => row.duration), cases.map(([, duration]) => duration))
		for (const mode of ['authoredInput', 'effectivePrecompile']) {
			const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: initial.deckId, mode, detail: 'full' }))
			const replay = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: exported.spec, phase: 'commit', commitMode: 'createNew', detail: 'full' })); owned.push(replay.deckId)
			assert.deepEqual(transformed((await inspect(getDeck(replay.deckId).pptx)).doc), expected)
		}
	} finally { for (const deckId of owned) await mcp.call('betterpptx.deck.dispose', { deckId }) }
	assert.deepEqual(source, before)
})

test('implicit kind, index and all-object animation selectors stay at the top level', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `native-group-legacy-selection-${Date.now()}` }), owned = []
	try {
		for (const selector of [{ kinds: ['group'] }, { indices: [0] }, {}]) {
			const source = fixture([{ ...selector, type: 'emphasis', effect: 'spin', rotation: 0, durationMs: 400, trigger: 'withPrevious' }])
			const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: source, phase: 'commit', commitMode: 'createNew', detail: 'full' })); owned.push(committed.deckId)
			const slide = getDeck(committed.deckId).pptx.slides[0]
			assert.ok(slide._animations.length > 0)
			assert.ok(slide._animations.every(record => slide._slideObjects.includes(record.target)))
			if (selector.kinds) assert.equal(slide._animations.length, 1, 'nested group is not included by kind')
			if (selector.indices) assert.equal(slide._animations.length, 1)
			assert.equal(nodes((await inspect(getDeck(committed.deckId).pptx)).doc, 'p:pic').length, 0)
		}
	} finally { for (const deckId of owned) await mcp.call('betterpptx.deck.dispose', { deckId }) }
})

test('animation validation retains sparse live top-level identities and legacy numeric/media rules', async () => {
	const pptx = new PptxGenJS(), slide = pptx.addSlide()
	slide.addShape('rect', { objectName: 'sparse-top-level', x: 5, y: 1, w: 1, h: 1 })
	slide._slideObjects[0].options.spid = 200
	nativeGroup(slide)
	slide.addAnimation('sparse-top-level', { type: 'emphasis', effect: 'spin', rotation: 0, trigger: 'withPrevious', duration: 300 })
	slide.addAnimation('card-label', { type: 'emphasis', effect: 'spin', rotation: 9, trigger: 'withPrevious', duration: 300 })
	const validate = () => pptx.validate({ checks: ['animations'], mode: 'strict' })
	assert.equal(validate().valid, true)
	const { doc } = await inspect(pptx)
	assert.equal(props(doc, 'sparse-top-level').getAttribute('id'), '200')
	assert.ok(Number(props(doc, 'card-label').getAttribute('id')) > 200)
	assert.deepEqual(transformed(doc).map(row => row.target), ['sparse-top-level', 'card-label'])
	assert.equal(nodes(doc, 'p:pic').length, 0)
	// Legacy records without an object reference keep their existing positional
	// rule. This check intentionally does not serialize these diagnostic records.
	const numeric = { ...slide._animations[0], target: undefined, shapeId: Number(props(doc, 'card').getAttribute('id')) }
	slide._animations.push(numeric)
	assert.equal(validate().valid, true)
	numeric.shapeId = 200
	assert.equal(validate().issues.filter(issue => issue.code === 'ANIMATION_ON_MISSING_SHAPE').length, 1)
	// The existing imported-media target exception remains unchanged; it is not
	// a new permission for detached ordinary shapes or numeric child identities.
	numeric.target = { _type: 'media' }; numeric.shapeId = 999
	assert.equal(validate().valid, true)
	slide._animations.pop()
})

test('dispatcher strict quality recognizes live child identities before and after late appends', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `native-group-quality-${Date.now()}` }), owned = []
	const source = fixture()
	source.styleIntent = { artDirection: 'editorial', mode: 'dark' }
	source.motionTime.masterClock = 'visual-only'
	try {
		const initial = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: source, phase: 'commit', commitMode: 'createNew', detail: 'full' })); owned.push(initial.deckId)
		const entry = getDeck(initial.deckId), slide = entry.pptx.slides[0]
		const qualityBeforeWrite = dataOf(await mcp.call('betterpptx.deck.validate_quality', { deckId: initial.deckId, profile: 'static', mode: 'strict', strictness: 'strict', detail: 'full' }))
		const first = await inspect(entry.pptx), nativeTargets = transformed(first.doc)
		assert.deepEqual(nativeTargets.map(row => row.target).sort(), ['card-panel', 'card-label', 'group-motion.card.group'].sort())
		assert.equal(props(first.doc, 'card-label').parentNode.parentNode.tagName, 'p:sp')
		assert.equal(nodes(first.doc, 'p:pic').length, 0)
		assert.equal(qualityBeforeWrite.ok, true, JSON.stringify({ blockingIssues: qualityBeforeWrite.blockingIssues, nativeTargets, topLevelCount: slide._slideObjects.length }))
		const oldId = props(first.doc, 'card-label').getAttribute('id')
		slide.addShape('rect', { objectName: 'later-quality-shape', x: 8, y: 5, w: 0.5, h: 0.5, fill: { color: 'E1B848' } })
		nativeGroup(slide, 'later-quality-group')
		Object.assign(slide._slideObjects.at(-1).options, { x: 8, y: 3 })
		const recordIds = slide._animations.map(record => record.shapeId)
		const afterAppend = dataOf(await mcp.call('betterpptx.deck.validate_quality', { deckId: initial.deckId, profile: 'static', mode: 'strict', strictness: 'strict', detail: 'full' }))
		assert.equal(afterAppend.ok, true, JSON.stringify(afterAppend.blockingIssues))
		assert.deepEqual(slide._animations.map(record => record.shapeId), recordIds, 'validation does not mutate provisional animation identities')
		const second = await inspect(entry.pptx)
		assert.notEqual(props(second.doc, 'card-label').getAttribute('id'), oldId)
		assert.deepEqual(transformed(second.doc), nativeTargets, 'final native IDs still resolve to the original intended objects')
		const ambiguous = structuredClone(source)
		ambiguous.slides[0].content[0].children.push({ ...ambiguous.slides[0].content[0].children[0], name: 'card-label' })
		const beforeVersion = entry.deckVersion, beforeRecords = slide._animations.slice()
		assert.equal((await mcp.call('betterpptx.deck.generate_from_spec', { deckId: initial.deckId, spec: ambiguous, phase: 'commit', commitMode: 'patch', detail: 'full' })).ok, false)
		assert.equal(entry.deckVersion, beforeVersion); assert.deepEqual(slide._animations, beforeRecords)
		assert.equal(dataOf(await mcp.call('betterpptx.deck.validate_quality', { deckId: initial.deckId, profile: 'static', mode: 'strict', strictness: 'strict', detail: 'full' })).ok, true)
	} finally { for (const deckId of owned) await mcp.call('betterpptx.deck.dispose', { deckId }) }
})

test('dispatcher quality rejects detached, missing, ambiguous and opaque child targets without borrowing IDs', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `native-group-invalid-quality-${Date.now()}` }), owned = []
	const source = fixture()
	source.styleIntent = { artDirection: 'editorial', mode: 'dark' }
	source.motionTime.masterClock = 'visual-only'
	const validate = async deckId => dataOf(await mcp.call('betterpptx.deck.validate_quality', { deckId, profile: 'static', mode: 'strict', strictness: 'strict', detail: 'full' }))
	try {
		const initial = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: source, phase: 'commit', commitMode: 'createNew', detail: 'full' })); owned.push(initial.deckId)
		const entry = getDeck(initial.deckId), slide = entry.pptx.slides[0]
		assert.equal((await validate(initial.deckId)).ok, true)
		const group = slide._slideObjects.find(object => object._type === 'group').group
		const nested = group.children.find(child => child.kind === 'group')
		const label = nested.children[0], record = slide._animations.find(animation => animation.target === label._nativeObject)
		const panelRecord = slide._animations.find(animation => animation.target === group.children[0]._nativeObject)
		const originalId = record.shapeId
		// Remove the descriptor while deliberately reusing an existing native
		// child number. Object identity, not numerical membership, must win.
		nested.children.splice(0, 1)
		record.shapeId = panelRecord.shapeId
		const stale = await validate(initial.deckId)
		assert.equal(stale.ok, false)
		assert.equal(stale.packageValidation.issues.filter(issue => issue.code === 'ANIMATION_ON_MISSING_SHAPE').length, 1)
		assert.deepEqual(transformed((await inspect(entry.pptx)).doc).map(row => row.target).sort(), ['card-panel', 'group-motion.card.group'].sort(), 'serialization does not redirect the detached child')
		// A top-level numerical collision must not legitimise the same stale
		// descendant either, even though the old positional check accepts it.
		const topObject = slide._slideObjects.find(object => object._type === 'group')
		record.shapeId = Number(topObject.options?.spid ?? slide._slideObjects.indexOf(topObject) + 2)
		assert.equal((await validate(initial.deckId)).packageValidation.issues.filter(issue => issue.code === 'ANIMATION_ON_MISSING_SHAPE').length, 1)
		// Restore the real descriptor, then test a numeric-only invalid record.
		nested.children.push(label); record.shapeId = originalId
		const target = record.target
		delete record.target
		for (const invalidId of [-1, panelRecord.shapeId, 999]) {
			record.shapeId = invalidId
			assert.equal((await validate(initial.deckId)).packageValidation.issues.filter(issue => issue.code === 'ANIMATION_ON_MISSING_SHAPE').length, 1)
		}
		record.target = target; record.shapeId = originalId
		assert.equal((await validate(initial.deckId)).ok, true)
		// One object instance must not stand for two serialized descendants.
		nested.children.push({ ...label, objectName: 'second-label-carrier' })
		const ambiguous = await validate(initial.deckId)
		assert.equal(ambiguous.ok, false)
		assert.ok(ambiguous.packageValidation.issues.some(issue => issue.code === 'INVALID_ANIMATION_TARGET'))
		nested.children.pop()
		slide._slideObjects.push({ _type: 'passthrough', passthrough: { xml: '<p:grpSp/>' }, options: { objectName: 'opaque-native-group' } })
		const opaque = await validate(initial.deckId)
		assert.equal(opaque.ok, false)
		assert.ok(opaque.packageValidation.issues.some(issue => issue.code === 'INVALID_ANIMATION_TARGET'))
		slide._slideObjects.pop()
		assert.equal((await validate(initial.deckId)).ok, true)
	} finally { for (const deckId of owned) await mcp.call('betterpptx.deck.dispose', { deckId }) }
})
