import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { validateTableRows, validateTableOptions } from '../table-authoring-family-contract.mjs'

// Source and shipped proofs use the same cases. Source compilation is in memory;
// these tests do not rebuild dist, call a service, or write presentation artifacts.
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
} else PptxGenJS = require('../../dist/pptxgen.cjs.js')

const INSETS = [0, 0.248, 0, 0.248]
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X1ZzWQAAAABJRU5ErkJggg=='

function tableFixture(margin = INSETS) {
	const pptx = new PptxGenJS()
	pptx.layout = 'LAYOUT_WIDE'
	const slide = pptx.addSlide()
	const rows = Array.from({ length: 4 }, (_, row) => Array.from({ length: 4 }, (_, column) => ({ text: `${row + 1}:${column + 1}`, options: { margin: structuredClone(margin) } })))
	slide.addTable(rows, { x: 1, y: 1, w: 8, h: 2, colW: [2, 2, 2, 2], rowH: [0.5, 0.5, 0.5, 0.5], margin: structuredClone(margin), objectName: 'owners-table' })
	return { pptx, slide, table: slide._slideObjects.find(object => object._type === 'table'), rows }
}

function parse(xml) {
	const errors = []
	const doc = new DOMParser({ errorHandler: { warning: message => errors.push(message), error: message => errors.push(message), fatalError: message => errors.push(message) } }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [])
	return doc
}

async function inspect(pptx) {
	const zip = await JSZip.loadAsync(await pptx.write({ outputType: 'nodebuffer', compression: false }), { checkCRC32: true })
	const xml = await zip.file('ppt/slides/slide1.xml').async('string')
	return { zip, xml, doc: parse(xml) }
}

function marginIssues(pptx) { return pptx.validate({ checks: ['repair'] }).issues.filter(issue => issue.code === 'INVALID_MARGIN') }

test('fractional-inch table and all 16 cell margins pass the public and repair contracts unchanged', async () => {
	const { pptx, table, rows } = tableFixture()
	assert.doesNotThrow(() => validateTableRows(rows, 'rows'))
	assert.doesNotThrow(() => validateTableOptions({ margin: INSETS }, 'options'))
	assert.deepEqual(marginIssues(pptx), [])
	assert.deepEqual(table.options.margin, INSETS)
	for (const row of table.arrTabRows) for (const cell of row) assert.deepEqual(cell.options.margin, INSETS)
	const { doc } = await inspect(pptx)
	const cells = Array.from(doc.getElementsByTagName('a:tcPr'))
	assert.equal(cells.length, 16)
	for (const cell of cells) {
		assert.equal(cell.getAttribute('marL'), '226771', '0.248 inches must not become 0.248 points')
		assert.equal(cell.getAttribute('marR'), '226771')
		assert.equal(cell.getAttribute('marT'), '0')
		assert.equal(cell.getAttribute('marB'), '0')
	}
	assert.deepEqual(table.options.margin, INSETS, 'serialization must not round authoring state')
})

test('table margin validation honors scalar, precise tuple, reset, and legacy point inputs', async () => {
	for (const margin of [0, 0.248, [0.01234, 0.248, 0.01234, 0.248], [3.5, 7.125, 3.5, 7.125]]) {
		const { pptx } = tableFixture(margin)
		assert.deepEqual(marginIssues(pptx), [], JSON.stringify(margin))
		const { doc } = await inspect(pptx)
		const value = Array.isArray(margin) ? margin : [margin, margin, margin, margin]
		const multiplier = value[0] >= 1 ? 12700 : 914400
		const tc = doc.getElementsByTagName('a:tcPr')[0]
		assert.equal(Number(tc.getAttribute('marL')), Math.round(value[3] * multiplier))
	}
	for (const margin of [null, undefined]) {
		const { pptx, table } = tableFixture()
		table.options.margin = margin
		for (const row of table.arrTabRows) for (const cell of row) cell.options.margin = margin
		assert.deepEqual(marginIssues(pptx), [])
	}
})

test('bad table tuples, signs, types, infinities and excessive values remain repair blockers', () => {
	for (const margin of [-0.001, NaN, Infinity, 56.001, '0.248', {}, [0, 0.248], [0, 0.248, 0, 'bad'], [0, 0.248, 0, -1]]) {
		const { pptx, table } = tableFixture()
		table.options.margin = margin
		table.arrTabRows[0][0].options.margin = margin
		const issues = marginIssues(pptx)
		assert.equal(issues.length, 2, String(margin))
		assert.ok(issues.every(issue => issue.severity === 'error' && /table-cell insets/.test(issue.message)))
		assert.ok(issues.some(issue => issue.context.path.includes('table[0][0]')))
	}
})

test('text-box and text-run margins still require their point contract, with no table flag bypass', () => {
	const { pptx, slide } = tableFixture()
	slide.addText([{ text: 'Text uses points', options: { margin: 0.248 } }], { x: 1, y: 4, w: 5, h: 1, objectName: 'point-text', margin: 0.248 })
	const text = slide._slideObjects.find(object => object.options?.objectName === 'point-text')
	text.options.marginContext = 'table'
	text.options.marginUnits = 'inches'
	const issues = marginIssues(pptx)
	assert.ok(issues.length >= 1)
	assert.ok(issues.every(issue => issue.shapeName === 'point-text' && /0.01-point/.test(issue.message)))
	text.options.margin = [0, 17.86, 0, 17.86]
	for (const run of text.text) if (run.options) run.options.margin = 0.25
	assert.deepEqual(marginIssues(pptx), [])
})

function wav(durationMs = 1000) {
	const sampleRate = 8000
	const bytes = Buffer.alloc(44 + Math.round(sampleRate * 2 * durationMs / 1000))
	bytes.write('RIFF', 0)
	bytes.writeUInt32LE(bytes.length - 8, 4)
	bytes.write('WAVE', 8)
	bytes.write('fmt ', 12)
	bytes.writeUInt32LE(16, 16)
	bytes.writeUInt16LE(1, 20)
	bytes.writeUInt16LE(1, 22)
	bytes.writeUInt32LE(sampleRate, 24)
	bytes.writeUInt32LE(sampleRate * 2, 28)
	bytes.writeUInt16LE(2, 32)
	bytes.writeUInt16LE(16, 34)
	bytes.write('data', 36)
	bytes.writeUInt32LE(bytes.length - 44, 40)
	return bytes
}

function addAudio(slide, name, { delay = 0, durationMs = 1000, trigger = 'afterPrevious', isNarration = true, command = true } = {}) {
	const bytes = wav(durationMs)
	slide.addMedia({ type: 'audio', data: `data:audio/wav;base64,${bytes.toString('base64')}`, extn: 'wav', cover: PNG, x: 0, y: 0, w: 0.1, h: 0.1, objectName: name, isNarration, interactivePlayback: false, showWhenStopped: false })
	if (command) slide.addAnimation(name, { type: 'media', effect: 'mediaplay', mediaCommand: 'playFrom(0.0)', trigger, delay, duration: 1 })
	return bytes
}

const children = (node, name) => Array.from(node.childNodes || []).filter(child => child.nodeType === 1 && (!name || child.tagName === name))
const all = (node, name) => Array.from(node.getElementsByTagName(name))

function timingEntries(doc) {
	const names = new Map(all(doc, 'p:cNvPr').map(node => [node.getAttribute('id'), node.getAttribute('name')]))
	return all(doc, 'p:cTn').filter(node => node.hasAttribute('presetClass')).map(effect => {
		let startMs = 0, clickGated = false
		for (let cursor = effect; cursor; cursor = cursor.parentNode) {
			if (cursor.tagName !== 'p:cTn') continue
			for (const list of children(cursor, 'p:stCondLst')) {
				const conditions = children(list, 'p:cond')
				const hasAutoStart = conditions.some(condition => condition.getAttribute('evt') === 'onBegin')
				for (const condition of conditions) {
					if (condition.hasAttribute('evt')) continue
					const delay = condition.getAttribute('delay')
					if (delay === 'indefinite') { if (!hasAutoStart) clickGated = true }
					else startMs += Number(delay || 0)
				}
			}
		}
		const spid = all(effect, 'p:spTgt')[0]?.getAttribute('spid')
		return { effect, name: names.get(spid), spid, presetClass: effect.getAttribute('presetClass'), startMs, clickGated }
	})
}

function assertTargets(doc) {
	const ids = new Set(all(doc, 'p:cNvPr').map(node => node.getAttribute('id')))
	for (const target of [...all(doc, 'p:spTgt'), ...all(doc, 'p:bldP')]) assert.ok(ids.has(target.getAttribute('spid')), `Dangling target ${target.toString()}`)
	const timeIds = all(doc, 'p:cTn').map(node => node.getAttribute('id'))
	assert.equal(new Set(timeIds).size, timeIds.length, 'Timing node IDs must remain unique')
}

test('narration retains 450ms delay beside simultaneous native playScene, motion and exit', async () => {
	const pptx = new PptxGenJS()
	pptx.layout = 'LAYOUT_WIDE'
	pptx.showSettings = { useTimings: true, showAnimation: true, showNarration: true }
	const slide = pptx.addSlide()
	slide.transition = { type: 'fade', duration: 350, advanceOnClick: false, advanceAfterTime: 18672 }
	const modelPath = fileURLToPath(new URL('../assets/default-presenter-louise.glb', import.meta.url))
	const original = readFileSync(modelPath)
	slide.addModel3D({ glbFile: modelPath, x: 10.4, y: 2.1, w: 2.7, h: 4.4, objectName: 'presenter', scene: { animId: 16, length: 1042, loop: true }, nativeOnly: true })
	slide.addAnimation('presenter', { type: 'emphasis', effect: 'playScene', animId: 16, duration: 1042, delay: 450, trigger: 'withPrevious', repeatCount: 'indefinite' })
	slide.addAnimation('presenter', { type: 'motion', effect: 'right', motionPath: 'right', motionPathData: 'M 0 0 L 0.22966507 0 E', duration: 2084, delay: 450, trigger: 'withPrevious', sequence: 'asOneObject' })
	slide.addAnimation('presenter', { type: 'exit', effect: 'fade', duration: 120, delay: 2534, trigger: 'withPrevious', sequence: 'asOneObject' })
	const audioBytes = addAudio(slide, 'narration', { delay: 450, durationMs: 17322 })
	const before = slide._animations.map(item => structuredClone(item.animation))
	const { doc, zip } = await inspect(pptx)
	const entries = timingEntries(doc)
	assert.deepEqual(entries.map(({ name, presetClass, startMs, clickGated }) => ({ name, presetClass, startMs, clickGated })), [
		{ name: 'narration', presetClass: 'mediacall', startMs: 450, clickGated: false },
		{ name: 'presenter', presetClass: 'emph', startMs: 450, clickGated: false },
		{ name: 'presenter', presetClass: 'path', startMs: 450, clickGated: false },
		{ name: 'presenter', presetClass: 'exit', startMs: 2534, clickGated: false },
	])
	const scene = entries[1].effect
	assert.equal(scene.getAttribute('repeatCount'), 'indefinite')
	assert.deepEqual(all(scene, 'p:attrName').map(node => node.textContent), ['embedded17'])
	assert.equal(all(scene, 'p:cTn')[0].getAttribute('dur'), '1042')
	assert.equal(all(doc, 'p:animMotion')[0].getAttribute('path'), 'M 0 0 L 0.22966507 0 E')
	for (const transition of all(doc, 'p:transition')) {
		assert.equal(transition.getAttribute('advTm'), '18672')
		assert.equal(transition.getAttribute('advClick'), '0')
	}
	assert.equal(all(doc, 'am3d:model3d').length, 1)
	assertTargets(doc)
	assert.deepEqual(slide._animations.map(item => item.animation), before, 'Serialization must not mutate public animation timing')
	const glb = Object.values(zip.files).find(file => file.name.endsWith('.glb'))
	assert.deepEqual(await glb.async('nodebuffer'), original, 'Approved model bytes remain untouched')
	assert.deepEqual(readFileSync(modelPath), original)
	const audio = Object.values(zip.files).find(file => file.name.endsWith('.wav'))
	assert.deepEqual(await audio.async('nodebuffer'), audioBytes, 'Delay is native timing, not rewritten audio')
})

test('segmented narration keeps absolute starts and real gaps instead of chaining rewritten media calls', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addText('The state remains', { x: 1, y: 1, w: 5, h: 1, objectName: 'state' })
	slide.addAnimation('state', { type: 'emphasis', effect: 'pulse', trigger: 'withPrevious', delay: 650, duration: 100 })
	addAudio(slide, 'segment-one', { delay: 450, durationMs: 800 })
	addAudio(slide, 'segment-two', { delay: 1800, durationMs: 700, trigger: 'withPrevious' })
	slide.addAnimation('state', { type: 'emphasis', effect: 'pulse', trigger: 'withPrevious', delay: 1950, duration: 100 })
	const before = slide._animations.map(item => structuredClone(item.animation))
	const { doc } = await inspect(pptx)
	const entries = timingEntries(doc)
	assert.deepEqual(entries.map(entry => [entry.name, entry.startMs]), [['segment-one', 450], ['segment-two', 1800], ['state', 650], ['state', 1950]])
	assert.ok(entries.every(entry => !entry.clickGated))
	assert.equal(entries[1].startMs - (entries[0].startMs + 800), 550)
	assertTargets(doc)
	assert.deepEqual(slide._animations.map(item => item.animation), before)
})

test('zero-delay and implicit native narration stay automatic while authored non-narration clicks remain clicks', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	addAudio(slide, 'implicit', { command: false })
	addAudio(slide, 'later', { delay: 1200 })
	addAudio(slide, 'manual-media', { delay: 650, trigger: 'onClick', isNarration: false })
	const { doc } = await inspect(pptx)
	const entries = timingEntries(doc)
	assert.deepEqual(entries.map(entry => [entry.name, entry.startMs, entry.clickGated]), [['implicit', 0, false], ['later', 1200, false], ['manual-media', 650, true]])
	assertTargets(doc)
})

test('multiple absolute withPrevious interactions target the editable group, not its child IDs', async () => {
	const pptx = new PptxGenJS()
	const slide = pptx.addSlide()
	slide.addGroup({ x: 1, y: 1, w: 3, h: 2, objectName: 'permit', children: [
		{ kind: 'shape', shape: 'rect', x: 0, y: 0, w: 3, h: 2, objectName: 'card', style: { fill: { color: '071425' } } },
		{ kind: 'textBox', text: 'PERMIT 7B', x: 0.2, y: 0.3, w: 2.6, h: 0.5, objectName: 'label', style: { margin: 0, fontSize: 18 } },
	] })
	slide.addAnimation('permit', { type: 'motion', effect: 'right', motionPath: 'right', motionPathData: 'M 0 0 L 0.2 0 E', duration: 1800, delay: 5196, trigger: 'withPrevious', sequence: 'asOneObject' })
	slide.addAnimation('permit', { type: 'exit', effect: 'fade', duration: 180, delay: 6996, trigger: 'withPrevious', sequence: 'asOneObject' })
	addAudio(slide, 'narration', { delay: 450 })
	const { doc } = await inspect(pptx)
	const group = all(doc, 'p:grpSp')[0]
	const groupId = all(group, 'p:cNvPr')[0].getAttribute('id')
	const entries = timingEntries(doc)
	assert.deepEqual(entries.filter(entry => entry.name === 'permit').map(entry => [entry.spid, entry.startMs, entry.clickGated]), [[groupId, 5196, false], [groupId, 6996, false]])
	assert.equal(all(group, 'p:sp').length, 2)
	assertTargets(doc)
})
