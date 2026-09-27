import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire, registerHooks } from 'node:module'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test, { after } from 'node:test'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { ANIMATION_FORMAT_PARAMETERS, validateAnimationFormatOptions } from '../animation-format-catalog.mjs'

// Source/shipped-runtime proof only. Packages remain in memory; there is no
// public endpoint, Office automation, paid synthesis or user artifact.
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
	globalThis[Symbol.for('betterpptx.test.pulse-duration-runtime')] = PptxGenJS
	const runtimeEntry = new URL('../../dist/pptxgen.es.js', import.meta.url).href
	registerHooks({ load(url, context, nextLoad) {
		if (url === runtimeEntry) return { format: 'module', source: "export default globalThis[Symbol.for('betterpptx.test.pulse-duration-runtime')]", shortCircuit: true }
		return nextLoad(url, context)
	} })
	process.env.BETTERPPTX_IMPORT_DIST_DIRECT = '1'
} else PptxGenJS = require('../../dist/pptxgen.cjs.js')
Object.assign(process.env, { BETTERPPTX_PUBLIC_BLACK_BOX: '1', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1', BETTERPPTX_LOCAL_MAINTAINER: '0', BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_PREMIUM: '1', BETTERPPTX_FORCE_PLAN: 'premium', BETTERPPTX_FREE_PREVIEW_SLIDES: '99' })
// Asset-root ownership is captured when the engine loads, not per request.
const ownedAudioRoot = await mkdtemp(path.join(os.tmpdir(), 'betterpptx-pulse-clock-'))
const audioRootEnvironment = new Map(['BETTERPPTX_LOCKED_ASSET_ROOT', 'BETTERPPTX_ALLOWED_AUDIO_DIRS'].map(key => [key, process.env[key]]))
for (const key of audioRootEnvironment.keys()) process.env[key] = ownedAudioRoot
after(async () => {
	for (const [key, value] of audioRootEnvironment) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
	assert.equal(path.dirname(ownedAudioRoot), path.resolve(os.tmpdir()))
	await rm(ownedAudioRoot, { recursive: true, force: true })
})
const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

const nodes = (root, tag) => Array.from(root.getElementsByTagName(tag))
const dataOf = result => { assert.equal(result?.ok, true, JSON.stringify(result)); return result.data || result }
async function inspect(pptx) {
	const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer', compression: false }), { checkCRC32: true })
	const xml = await zip.file('ppt/slides/slide1.xml').async('string'), errors = []
	const doc = new DOMParser({ errorHandler: { warning: message => errors.push(message), error: message => errors.push(message), fatalError: message => errors.push(message) } }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [])
	const ids = nodes(doc, 'p:cNvPr').map(node => node.getAttribute('id'))
	assert.equal(new Set(ids).size, ids.length)
	for (const target of nodes(doc, 'p:spTgt')) assert.ok(ids.includes(target.getAttribute('spid')))
	for (const node of nodes(doc, 'p:cTn')) if (node.hasAttribute('dur') && node.getAttribute('dur') !== 'indefinite') {
		assert.ok(Number.isInteger(Number(node.getAttribute('dur'))), 'native durations use integer milliseconds')
	}
	return { zip, xml, doc }
}
function nativeStartDelay(node) {
	let total = 0
	for (let ancestor = node; ancestor; ancestor = ancestor.parentNode) {
		if (ancestor.tagName !== 'p:cTn') continue
		const list = Array.from(ancestor.childNodes).find(child => child.tagName === 'p:stCondLst')
		if (!list) continue
		const numeric = nodes(list, 'p:cond').filter(condition => condition.hasAttribute('delay') && Number.isFinite(Number(condition.getAttribute('delay'))))
		assert.ok(numeric.length <= 1)
		if (numeric.length) total += Number(numeric[0].getAttribute('delay'))
	}
	return total
}
function pulses(doc) {
	const names = new Map(nodes(doc, 'p:cNvPr').map(node => [node.getAttribute('id'), node.getAttribute('name')]))
	return nodes(doc, 'p:cTn').filter(node => node.getAttribute('presetID') === '26' && node.getAttribute('presetClass') === 'emph').map(owner => {
		const effect = nodes(owner, 'p:animEffect')[0], scale = nodes(owner, 'p:animScale')[0]
		const effectTiming = nodes(effect, 'p:cTn')[0], scaleTiming = nodes(scale, 'p:cTn')[0]
		const target = nodes(effect, 'p:spTgt')[0]
		const scaleDuration = Number(scaleTiming.getAttribute('dur'))
		const scaleSpeed = scaleTiming.hasAttribute('spd') ? Number(scaleTiming.getAttribute('spd')) / 100000 : 1
		return {
			target: names.get(target.getAttribute('spid')),
			kind: nodes(target, 'p:pRg').length ? 'paragraph' : nodes(target, 'p:bg').length ? 'background' : 'whole',
			start: nativeStartDelay(effect), duration: Number(effectTiming.getAttribute('dur')),
			scaleDuration, scaleSpeed, scaleCompleteDuration: scaleDuration * (scaleTiming.getAttribute('autoRev') === '1' ? 2 : 1) / scaleSpeed,
			filter: effectTiming.getAttribute('tmFilter'), growth: nodes(scale, 'p:by')[0].getAttribute('x'),
		}
	})
}
function baseSpec(timeline = []) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Measured native pulse timing', layout: 'LAYOUT_WIDE',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: { audience: 'Timing reviewers', outcome: 'Use measured audio and exact native beat duration.', remember: 'The complete pulse ends when its published clock says it does.' },
		visualDesign: { world: 'editorial', framing: 'Two readable native labels' },
		motionTime: { masterClock: 'authored', timingSource: 'native slide timeline' }, motion: { autoSync: false },
		visualReference: { mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media', viewport: { width: 1600, height: 900 }, mediaAssets: [] },
		slides: [{ id: 'timing-proof', title: 'One measured clock', layoutIntent: 'title-only', background: { color: '000611' }, content: [
			{ kind: 'textBox', name: 'beat', text: 'Measured beat', pixelFrame: { x: 120, y: 180, w: 520, h: 100 }, style: { fontFace: 'Arial', fontSize: 24, color: 'FFFFFF', margin: 0 } },
			{ kind: 'textBox', name: 'following', text: 'Following beat', pixelFrame: { x: 850, y: 180, w: 520, h: 100 }, style: { fontFace: 'Arial', fontSize: 24, color: 'FFFFFF', margin: 0 } },
		], timeline }],
	}
}

test('pulse duration accepts the existing integer-millisecond contract including zero and null reset', () => {
	const duration = ANIMATION_FORMAT_PARAMETERS.find(parameter => parameter.id === 'duration')
	assert.equal(duration.minimum, 0); assert.equal(duration.step, 1)
	for (const value of [0, 1, 650, 651, 86400000, null]) assert.equal(validateAnimationFormatOptions({ type: 'emphasis', effect: 'pulse', duration: value }).duration, value)
	for (const value of [-1, 0.5, 86400001, NaN, Infinity, '650']) assert.throws(() => validateAnimationFormatOptions({ type: 'emphasis', effect: 'pulse', duration: value }), /duration/)
})

test('native pulse honors explicit complete-cycle duration for whole objects and paragraph targets', async () => {
	for (const sequence of ['asOneObject', 'allAtOnce']) for (const duration of [0, 1, 125, 650, 651, 2000, 86400000]) {
		const pptx = new PptxGenJS(), slide = pptx.addSlide()
		slide.addText('First line\nSecond line', { objectName: 'pulse', x: 1, y: 1, w: 4, h: 2 })
		slide.addAnimation('pulse', { type: 'emphasis', effect: 'pulse', sequence, duration, delay: 200, trigger: 'withPrevious' })
		const rows = pulses((await inspect(pptx)).doc)
		assert.equal(rows.length, sequence === 'asOneObject' ? 1 : 3)
		for (const row of rows) {
			assert.equal(row.duration, duration, `${sequence}/${duration}/${row.kind} full pulse`)
			assert.equal(row.scaleCompleteDuration, duration, 'grow and return complete on the same millisecond as the pulse')
			assert.equal(row.start, 200); assert.equal(row.filter, '0, 0; .2, .5; .8, .5; 1, 0'); assert.equal(row.growth, '105000')
		}
	}
})

test('omitted and null pulse durations preserve the historical target-specific native defaults', async () => {
	for (const duration of [undefined, null]) {
		const pptx = new PptxGenJS(), slide = pptx.addSlide()
		slide.addText('First line\nSecond line', { objectName: 'pulse', x: 1, y: 1, w: 4, h: 2 })
		slide.addAnimation('pulse', { type: 'emphasis', effect: 'pulse', sequence: 'allAtOnce', duration, trigger: 'withPrevious' })
		const rows = pulses((await inspect(pptx)).doc)
		assert.deepEqual(rows.map(row => [row.kind, row.duration, row.scaleDuration, row.scaleSpeed]), [['background', 1000, 500, 1], ['paragraph', 500, 250, 1], ['paragraph', 500, 250, 1]])
	}
})

test('afterPrevious uses the completed pulse span including zero and default text-sequence spans', async () => {
	for (const sequence of ['asOneObject', 'allAtOnce']) for (const duration of [0, 650, 651, null, undefined]) {
		const pptx = new PptxGenJS(), slide = pptx.addSlide()
		slide.addText('First line\nSecond line', { objectName: 'pulse', x: 1, y: 1, w: 4, h: 2 })
		slide.addText('Next', { objectName: 'following', x: 6, y: 1, w: 2, h: 1 })
		slide.addAnimation('pulse', { type: 'emphasis', effect: 'pulse', sequence, duration, delay: 200, trigger: 'withPrevious' })
		slide.addAnimation('following', { type: 'emphasis', effect: 'spin', rotation: 9, duration: 175, delay: 50, trigger: 'afterPrevious' })
		const { doc } = await inspect(pptx), pulseEnd = Math.max(...pulses(doc).map(row => row.start + row.duration))
		assert.equal(nativeStartDelay(nodes(doc, 'p:animRot')[0]), pulseEnd + 50, `${sequence}/${duration} next effect must follow the actual pulse end`)
	}
})

test('pulse duration repair leaves the other color-emphasis family serialization unchanged', async () => {
	for (const effect of ['complementarycolor', 'darken', 'desaturate']) {
		const pptx = new PptxGenJS(), slide = pptx.addSlide()
		slide.addText('First line\nSecond line', { objectName: 'control', x: 1, y: 1, w: 4, h: 2 })
		slide.addAnimation('control', { type: 'emphasis', effect, duration: 650, sequence: 'allAtOnce', trigger: 'withPrevious' })
		const { doc } = await inspect(pptx)
		const owners = nodes(doc, 'p:cTn').filter(node => node.hasAttribute('presetID'))
		assert.deepEqual(owners.map(owner => [...new Set(nodes(owner, 'p:cTn').filter(node => node.hasAttribute('dur')).map(node => node.getAttribute('dur')))]), [['1000'], ['650'], ['650']])
		assert.equal(nodes(doc, 'p:animScale').length, 0)
	}
})

test('public pulse aliases, resets and afterPrevious timing survive authored/effective replay', async () => {
	const mcp = createMcpToolDispatcher({ sessionId: `native-pulse-replay-${Date.now()}` }), owned = []
	try {
		for (const [timing, expectedDuration] of [[{ durationMs: 650 }, 650], [{ duration: 651 }, 651], [{ duration: 0 }, 0], [{ duration: null, durationMs: 650 }, 1000]]) {
			const source = baseSpec([
				{ objectName: 'beat', type: 'emphasis', effect: 'pulse', trigger: 'withPrevious', delayMs: 200, ...timing },
				{ objectName: 'following', type: 'emphasis', effect: 'spin', rotation: 9, trigger: 'afterPrevious', delayMs: 50, durationMs: 175 },
			]), before = structuredClone(source)
			const plan = buildSpecOperationPlan(source, { dryRun: true, plan: 'premium' })
			assert.equal(plan.operations.find(operation => operation.tool === 'betterpptx.slide.animate_shapes').args.animation.duration, timing.duration === undefined ? timing.durationMs : timing.duration)
			dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: source, phase: 'dryRun', detail: 'full' }))
			const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: source, phase: 'commit', commitMode: 'createNew', detail: 'full' })); owned.push(committed.deckId)
			const { doc } = await inspect(getDeck(committed.deckId).pptx), expected = pulses(doc)
			assert.equal(expected[0].duration, expectedDuration)
			assert.equal(nativeStartDelay(nodes(doc, 'p:animRot')[0]), 200 + expectedDuration + 50)
			for (const mode of ['authoredInput', 'effectivePrecompile']) {
				const exported = dataOf(await mcp.call('betterpptx.deck.export_spec', { deckId: committed.deckId, mode, detail: 'full' }))
				assert.doesNotMatch(JSON.stringify(exported.spec), /_rawTimingXml|_nativeObject|targetSpid/)
				const replay = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: exported.spec, phase: 'commit', commitMode: 'createNew', detail: 'full' })); owned.push(replay.deckId)
				assert.deepEqual(pulses((await inspect(getDeck(replay.deckId).pptx)).doc), expected)
			}
			assert.deepEqual(source, before)
		}
	} finally { for (const deckId of owned) await mcp.call('betterpptx.deck.dispose', { deckId }) }
})

function wav500ms() {
	const dataBytes = 22050, bytes = Buffer.alloc(44 + dataBytes)
	bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + dataBytes, 4); bytes.write('WAVE', 8); bytes.write('fmt ', 12)
	bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(22050, 24)
	bytes.writeUInt32LE(44100, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
	bytes.write('data', 36); bytes.writeUInt32LE(dataBytes, 40)
	return bytes
}

test('measured public narration clock and proportional cue provenance match actual native pulse endpoints', async () => {
	const keys = ['BETTERPPTX_TTS_PROVIDER', 'BETTERPPTX_TTS_URL']
	const previous = new Map(keys.map(key => [key, process.env[key]]))
	const mcp = createMcpToolDispatcher({ sessionId: `native-pulse-clock-${Date.now()}` }), owned = []
	const bytes = wav500ms(), source = baseSpec()
	// The only HTTP server here is this owned, deterministic fixture. It cannot
	// synthesize speech or contact a real provider; it returns the exact 500ms WAV.
	const server = http.createServer((request, response) => {
		response.writeHead(200, { 'content-type': request.method === 'POST' ? 'audio/wav' : 'application/json' })
		response.end(request.method === 'POST' ? bytes : '[]')
	})
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	process.env.BETTERPPTX_TTS_PROVIDER = 'piper-http'
	process.env.BETTERPPTX_TTS_URL = `http://127.0.0.1:${server.address().port}`
	source.slides[0].narration = {
		script: 'Start the measured beat. Then settle.', voiceId: 'en_US-ljspeech-high', startDelayMs: 100, paddingMs: 400, syncBuild: false,
		cues: [
			{ atPhrase: 'measured beat', target: 'beat', type: 'emphasis', effect: 'pulse', duration: 651 },
			{ atMs: 700, target: 'following', type: 'emphasis', effect: 'pulse', duration: 650 },
		],
	}
	try {
		const resolved = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: source, phase: 'resolve', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' }))
		const locked = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: resolved.lockedSpec, phase: 'lockedDryRun', commitMode: 'createNew', plan: 'premium', detail: 'full' }))
		const committed = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', { spec: resolved.lockedSpec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full' })); owned.push(committed.deckId)
		const clocks = [resolved, locked, committed].map(result => result.narrationTimeline.slides[0])
		for (const [index, clock] of clocks.entries()) {
			assert.equal(clock.realDurationMs, 500, 'media duration is measured/trusted locked audio, not words')
			assert.equal(clock.startDelayMs, 100); assert.equal(clock.paddingMs, 400); assert.equal(clock.dwellMs, 1850)
			assert.equal(clock.beats.length, 2)
			assert.equal(clock.beats[0].anchorMethod, 'duration-proportional-script-position')
			assert.equal(clock.beats[1].anchorMethod, undefined, 'an explicit millisecond cue is not a phrase estimate')
			assert.match([resolved, locked, committed][index].narrationTimeline.note, /not word-level audio alignment/)
			assert.equal([resolved, locked, committed][index].timingSpine.slides[0].timingSource, 'locked-audio')
		}
		assert.deepEqual(clocks[1].beats, clocks[0].beats); assert.deepEqual(clocks[2].beats, clocks[0].beats)
		const { zip, doc } = await inspect(getDeck(committed.deckId).pptx), native = pulses(doc)
		for (const beat of clocks[2].beats) {
			// Public block names compile to slideId.blockName.role native names.
			const matches = native.filter(candidate => candidate.target === beat.target || candidate.target.split('.').includes(beat.target))
			assert.equal(matches.length, 1, JSON.stringify({ beat, native }))
			const row = matches[0]
			assert.equal(row.start, beat.atMs); assert.equal(row.start + row.duration, beat.endMs)
			assert.equal(row.scaleCompleteDuration, row.duration)
		}
		assert.ok(nodes(doc, 'p:transition').every(node => node.getAttribute('advTm') === '1850'))
		const wavFiles = Object.keys(zip.files).filter(name => name.startsWith('ppt/media/') && name.endsWith('.wav'))
		assert.equal(wavFiles.length, 1); assert.deepEqual(await zip.file(wavFiles[0]).async('nodebuffer'), bytes)
	} finally {
		for (const deckId of owned) await mcp.call('betterpptx.deck.dispose', { deckId })
		await new Promise(resolve => server.close(resolve))
		for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
	}
})
