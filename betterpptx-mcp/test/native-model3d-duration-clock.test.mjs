import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import JSZip from 'jszip'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

// Run against the shipped runtime by default, or the current source without
// rebuilding. Every PPTX stays in memory; the tracked fixture is read-only.
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
} else PptxGenJS = require('../../dist/pptxgen.cjs.js')

const modelFile = fileURLToPath(new URL('../../demos/ultimate-showcase/assets/lab-pyramid.glb', import.meta.url))
const presets = [
	{ effect: 'arrive', type: 'entrance', duration: 1000, behaviorCount: 6 },
	{ effect: 'turntable', type: 'emphasis', duration: 2000, behaviorCount: 1 },
	{ effect: 'swing', type: 'emphasis', duration: 1000, behaviorCount: 1 },
	{ effect: 'jumpAndTurn', type: 'emphasis', duration: 1000, behaviorCount: 5 },
	{ effect: 'leave', type: 'exit', duration: 1000, behaviorCount: 6 },
]
const nodes = (root, tag) => Array.from(root.getElementsByTagName(tag))
const serialize = node => new XMLSerializer().serializeToString(node)

function addCase(slide, name, preset, options = {}, followingTrigger = 'afterPrevious') {
	slide.addModel3D({ glbFile: modelFile, nativeOnly: true, objectName: name, x: 1, y: 1, w: 2, h: 2 })
	slide.addAnimation(name, { type: preset.type, effect: preset.effect, trigger: 'onClick', delay: 43, ...options })
	if (followingTrigger) {
		slide.addText('Following effect', { objectName: `${name}-next`, x: 4, y: 1, w: 3, h: 1 })
		slide.addAnimation(`${name}-next`, { type: 'entrance', effect: 'fade', trigger: followingTrigger, delay: 37, duration: 100 })
	}
}

async function inspect(pptx) {
	const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer', compression: false }), { checkCRC32: true })
	const xml = await zip.file('ppt/slides/slide1.xml').async('string'), errors = []
	const doc = new DOMParser({ errorHandler: { warning: value => errors.push(value), error: value => errors.push(value), fatalError: value => errors.push(value) } }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [])
	const ids = nodes(doc, 'p:cNvPr').map(node => node.getAttribute('id'))
	assert.equal(new Set(ids).size, ids.length)
	const names = new Map(nodes(doc, 'p:cNvPr').map(node => [node.getAttribute('id'), node.getAttribute('name')]))
	for (const target of nodes(doc, 'p:spTgt')) assert.ok(names.has(target.getAttribute('spid')), 'every timing target exists')
	const owners = new Map(nodes(doc, 'p:cTn').filter(node => node.hasAttribute('presetID')).map(owner => {
		const target = nodes(owner, 'p:spTgt')[0]
		return [names.get(target.getAttribute('spid')), owner]
	}))
	for (const timing of nodes(doc, 'p:cTn')) assert.notEqual(timing.getAttribute('dur'), 'Infinity')
	for (const condition of nodes(doc, 'p:cond')) assert.notEqual(condition.getAttribute('delay'), 'Infinity')
	return { zip, doc, owners }
}

function nativeStartDelay(node) {
	let total = 0
	for (let ancestor = node; ancestor; ancestor = ancestor.parentNode) {
		if (ancestor.tagName !== 'p:cTn') continue
		const conditions = Array.from(ancestor.childNodes).find(child => child.tagName === 'p:stCondLst')
		if (!conditions) continue
		const numeric = nodes(conditions, 'p:cond').filter(condition => condition.hasAttribute('delay') && Number.isFinite(Number(condition.getAttribute('delay'))))
		assert.ok(numeric.length <= 1)
		if (numeric.length) total += Number(numeric[0].getAttribute('delay'))
	}
	return total
}

function assertClock(owner, preset, duration) {
	assert.ok(owner, preset.effect)
	assert.equal(owner.hasAttribute('dur'), false, 'child clocks, not a second owner clock, own the preset span')
	assert.equal(owner.hasAttribute('spd'), false)
	assert.equal(owner.hasAttribute('grpId'), false)
	const behaviors = nodes(owner, 'p:cBhvr')
	assert.equal(behaviors.length, preset.behaviorCount)
	let span = 0
	for (const behavior of behaviors) {
		const timing = nodes(behavior, 'p:cTn')[0]
		const visibility = behavior.parentNode.tagName === 'p:set'
		assert.equal(Number(timing.getAttribute('dur')), visibility ? 1 : duration)
		const conditions = nodes(timing, 'p:cond')
		const delay = conditions.length ? Number(conditions[0].getAttribute('delay')) : 0
		if (visibility) {
			assert.equal(delay, preset.effect === 'leave' ? Math.max(0, duration - 1) : 0)
			assert.equal(nodes(behavior.parentNode, 'p:strVal')[0].getAttribute('val'), preset.effect === 'leave' ? 'hidden' : 'visible')
		}
		span = Math.max(span, delay + Number(timing.getAttribute('dur')))
	}
	return span
}

// Strip only variable identity and clock attributes; variant curves, keyframe
// positions, timing-node shape, additive mode and preset metadata remain exact.
function curveSignature(owner) {
	const clone = owner.cloneNode(true)
	for (const timing of [clone, ...nodes(clone, 'p:cTn')]) { timing.removeAttribute('id'); timing.removeAttribute('dur') }
	for (const target of nodes(clone, 'p:spTgt')) target.removeAttribute('spid')
	for (const condition of nodes(clone, 'p:cond')) condition.removeAttribute('delay')
	return serialize(clone)
}

test('all five native preset clocks and afterPrevious agree for 650/5000/0/1/null/omission', async () => {
	const durations = [650, 5000, 0, 1, null, undefined, 650.4]
	const pptx = new PptxGenJS(), slide = pptx.addSlide(), rows = []
	for (const preset of presets) for (const [index, duration] of durations.entries()) {
		const name = `${preset.effect}-${index}`, options = duration === undefined ? {} : { duration }
		addCase(slide, name, preset, options)
		rows.push({ name, preset, duration: duration === null || duration === undefined ? preset.duration : Math.round(duration) })
	}
	const { owners } = await inspect(pptx)
	for (const row of rows) {
		const owner = owners.get(row.name), span = assertClock(owner, row.preset, row.duration)
		assert.equal(nativeStartDelay(owner), 43)
		assert.equal(nativeStartDelay(owners.get(`${row.name}-next`)), 43 + span + 37, row.name)
	}
})

test('omitted and null durations preserve the default timing XML byte-for-byte', async () => {
	for (const preset of presets) {
		const timing = []
		for (const options of [{}, { duration: null }, { duration: preset.duration }]) {
			const pptx = new PptxGenJS()
			addCase(pptx.addSlide(), 'model', preset, options, null)
			timing.push(serialize(nodes((await inspect(pptx)).doc, 'p:timing')[0]))
		}
		assert.equal(timing[1], timing[0], preset.effect)
		assert.equal(timing[2], timing[0], preset.effect)
	}
})

test('duration aliases preserve canonical zero/null precedence', async () => {
	const cases = [[{ durationMs: 650 }, 650], [{ durationMs: 5000, duration: 1 }, 1], [{ durationMs: 5000, duration: 0 }, 0], [{ durationMs: 5000, duration: null }, null]]
	const pptx = new PptxGenJS(), slide = pptx.addSlide()
	for (const preset of presets) for (const [index, [options]] of cases.entries()) addCase(slide, `${preset.effect}-${index}`, preset, options)
	const { owners } = await inspect(pptx)
	for (const preset of presets) for (const [index, [, duration]] of cases.entries()) {
		const name = `${preset.effect}-${index}`, span = assertClock(owners.get(name), preset, duration ?? preset.duration)
		assert.equal(nativeStartDelay(owners.get(`${name}-next`)), 43 + span + 37)
	}
})

test('all 252 captured option combinations retain their curves at 650ms and 5000ms', async () => {
	const variants = []
	for (const preset of presets) for (const [rotationAxis, directions] of Object.entries({ object: ['right', 'left', 'front', 'back', 'clockwise', 'counterclockwise'], view: ['right', 'left', 'up', 'down', 'clockwise', 'counterclockwise'] })) {
		for (const modelDirection of directions) {
			const intensities = preset.effect === 'turntable' ? [undefined] : ['subtle', 'moderate', 'strong']
			const amounts = preset.effect === 'turntable' ? ['half', 'full', 'continuous'] : preset.effect === 'swing' ? ['once', 'twice', 'continuous'] : [undefined]
			for (const intensity of intensities) for (const amount of amounts) variants.push({ preset, options: { rotationAxis, modelDirection, intensity, amount } })
		}
	}
	assert.equal(variants.length, 252)
	const signatures = []
	for (const duration of [undefined, 650, 5000]) {
		const pptx = new PptxGenJS(), slide = pptx.addSlide()
		for (const [index, row] of variants.entries()) addCase(slide, `variant-${index}`, row.preset, { ...row.options, ...(duration === undefined ? {} : { duration }) }, null)
		const { owners } = await inspect(pptx)
		for (const [index, row] of variants.entries()) {
			const owner = owners.get(`variant-${index}`)
			assertClock(owner, row.preset, duration ?? row.preset.duration)
			if (duration === undefined) signatures[index] = curveSignature(owner)
			else assert.equal(curveSignature(owner), signatures[index], `${row.preset.effect}/${JSON.stringify(row.options)}/${duration}`)
		}
	}
})

test('afterPrevious uses finite repeats and outer autoReverse exactly once, including defaults and zero', async () => {
	const options = [
		{ duration: 650, repeatCount: 3 }, { duration: 5000, autoReverse: true },
		{ duration: 650, repeatCount: 2, autoReverse: true }, { duration: 1, repeatCount: 2, autoReverse: true },
		{ duration: 0, repeatCount: 3, autoReverse: true }, { repeatCount: 2 },
		{ duration: null, autoReverse: true }, { repeatCount: null, autoReverse: false },
	]
	const pptx = new PptxGenJS(), slide = pptx.addSlide()
	for (const preset of presets) for (const [index, value] of options.entries()) addCase(slide, `${preset.effect}-${index}`, preset, value)
	const { owners } = await inspect(pptx)
	for (const preset of presets) for (const [index, value] of options.entries()) {
		const name = `${preset.effect}-${index}`, owner = owners.get(name)
		const simple = assertClock(owner, preset, value.duration ?? preset.duration)
		const count = value.repeatCount ?? 1, reverse = value.autoReverse ? 2 : 1
		assert.equal(owner.getAttribute('repeatCount'), value.repeatCount == null ? '' : String(count * 1000))
		assert.equal(owner.getAttribute('autoRev'), value.autoReverse ? '1' : '')
		assert.equal(nativeStartDelay(owners.get(`${name}-next`)), 43 + simple * count * reverse + 37, name)
	}
})

test('Swing twice/continuous, nested legacy options, and explicit repeat precedence share one clock', async () => {
	const preset = presets.find(row => row.effect === 'swing')
	const cases = [
		[{ amount: 'twice' }, 2], [{ amount: 'twice', autoReverse: true }, 4],
		[{ effectOptions: { amount: 'twice' } }, 2], [{ effectOptions: { repeatCount: 3 } }, 3],
		[{ amount: 'continuous', repeatCount: 2 }, 2], [{ amount: 'twice', repeatCount: 1 }, 1],
	]
	const pptx = new PptxGenJS(), slide = pptx.addSlide()
	for (const [index, [options]] of cases.entries()) addCase(slide, `repeat-${index}`, preset, { duration: 650, ...options })
	const { owners } = await inspect(pptx)
	for (const [index, [, factor]] of cases.entries()) assert.equal(nativeStartDelay(owners.get(`repeat-${index}-next`)), 43 + 650 * factor + 37)
})

test('indefinite presets reject unreachable afterPrevious but allow concurrent work and later clicks', async () => {
	const cases = presets.map(preset => [preset, { repeatCount: 'indefinite' }])
	cases.push([presets[1], { amount: 'continuous' }], [presets[2], { effectOptions: { amount: 'continuous' } }])
	for (const [preset, options] of cases) {
		const rejected = new PptxGenJS()
		addCase(rejected.addSlide(), 'unbounded', preset, { duration: 650, ...options })
		await assert.rejects(() => rejected.write({ outputType: 'nodebuffer' }), /afterPrevious cannot follow an indefinitely repeating native 3D preset/)
		for (const trigger of ['withPrevious', 'onClick']) {
			const pptx = new PptxGenJS(), slide = pptx.addSlide()
			addCase(slide, 'unbounded', preset, { duration: 650, ...options }, trigger)
			addCase(slide, 'later-click', presets[0], { duration: 5000 })
			const { owners } = await inspect(pptx)
			assert.equal(owners.get('unbounded').getAttribute('repeatCount'), 'indefinite')
			assert.equal(nativeStartDelay(owners.get('unbounded-next')), 37)
			assert.equal(nativeStartDelay(owners.get('later-click-next')), 43 + 5000 + 37)
		}
	}
})

test('invalid native preset durations fail instead of emitting invalid clocks', async () => {
	for (const preset of presets) for (const duration of [-1, NaN, Infinity, '650']) {
		const pptx = new PptxGenJS()
		addCase(pptx.addSlide(), 'invalid', preset, { duration }, null)
		await assert.rejects(() => pptx.write({ outputType: 'nodebuffer' }), /duration.*(?:finite|nonnegative)/)
	}
})

test('embedded scene duration, clip channel and default loop remain unchanged', async () => {
	const pptx = new PptxGenJS(), slide = pptx.addSlide()
	addCase(slide, 'clip', { type: 'emphasis', effect: 'playScene' }, { duration: 5000, animId: 0, loop: false })
	addCase(slide, 'loop', { type: 'emphasis', effect: 'playScene' }, { duration: 650, animId: 0 }, null)
	const { owners } = await inspect(pptx)
	assert.equal(nodes(owners.get('clip'), 'p:cBhvr')[0].getElementsByTagName('p:cTn')[0].getAttribute('dur'), '5000')
	assert.equal(nodes(owners.get('clip'), 'p:attrName')[0].textContent, 'embedded1')
	assert.equal(owners.get('clip').hasAttribute('repeatCount'), false)
	assert.equal(nativeStartDelay(owners.get('clip-next')), 43 + 5000 + 37)
	assert.equal(nodes(owners.get('loop'), 'p:cBhvr')[0].getElementsByTagName('p:cTn')[0].getAttribute('dur'), '650')
	assert.equal(owners.get('loop').getAttribute('repeatCount'), 'indefinite')
})
