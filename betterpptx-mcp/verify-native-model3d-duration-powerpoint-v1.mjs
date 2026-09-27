#!/usr/bin/env node
// Maintainer oracle: independently compare authored clocks with native package,
// PowerPoint SaveCopyAs/readback, and actual video pixels. Never a public tool.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const nodes = (node, tag) => Array.from(node.getElementsByTagName(tag))
const children = (node, tag) => Array.from(node?.childNodes || []).filter(child => child.nodeType === 1 && (!tag || child.tagName === tag))
const inFallback = node => { for (let parent = node.parentNode; parent; parent = parent.parentNode) if (parent.tagName === 'mc:Fallback') return true; return false }
const numberAttr = (node, name, fallback = 0) => node.hasAttribute(name) ? Number(node.getAttribute(name)) : fallback
const MODEL_FRAME = { x: 5.2, y: 1.45, w: 4.8, h: 4.8 }
const ACTOR_ROI = { x: 4.1, y: 1.15, w: 7, h: 5.8 }
const MARKER_FRAME = { x: 0.7, y: 5.65, w: 2.35, h: 0.5 }
const ORIGIN_FRAME = { x: 0.7, y: 4.9, w: 2.35, h: 0.35 }
const TAG_FRAME = { x: 0.10, y: 0.10, w: 0.32, h: 0.32 }
// Independently read from the frozen native 21-slide reference: slides 1/4/7/16/19.
const EFFECTS = [
	{ effect: 'arrive', type: 'entrance', presetId: '60', presetClass: 'entr', nativeDefaultMs: 1000 },
	{ effect: 'turntable', type: 'emphasis', presetId: '37', presetClass: 'emph', nativeDefaultMs: 2000 },
	{ effect: 'swing', type: 'emphasis', presetId: '38', presetClass: 'emph', nativeDefaultMs: 1000 },
	{ effect: 'jumpandturn', type: 'emphasis', presetId: '39', presetClass: 'emph', nativeDefaultMs: 1000 },
	{ effect: 'leave', type: 'exit', presetId: '60', presetClass: 'exit', nativeDefaultMs: 1000 },
]

export function native3dDurationCases({ boundary = false } = {}) {
	const variants = boundary ? [{ mode: 'zero', duration: 0 }, { mode: 'one', duration: 1 }]
		: [{ mode: 'short', duration: 650 }, { mode: 'long', duration: 5000 }, { mode: 'default' }, { mode: 'null-reset', duration: null }]
	return EFFECTS.flatMap(effect => variants.map(variant => ({ ...effect, ...variant,
		id: `${effect.effect}-${variant.mode}`, modelName: `model-${effect.effect}-${variant.mode}`,
		markerName: `after-${effect.effect}-${variant.mode}`, expectedDurationMs: variant.duration ?? effect.nativeDefaultMs,
		startMs: 300, markerGapMs: 100, boundary,
	}))).map((item, index) => ({ ...item, slideIndex: index + 1,
		dwellMs: item.startMs + Math.max(1, item.expectedDurationMs) + item.markerGapMs + 1000,
		tagColor: [40 + (index % 5) * 50, 40 + Math.floor(index / 5) * 50, 215],
	}))
}

export function nativeAbsoluteStart(node) {
	let total = 0
	for (let ancestor = node; ancestor; ancestor = ancestor.parentNode) {
		if (ancestor.tagName !== 'p:cTn') continue
		const conditions = children(ancestor, 'p:stCondLst').flatMap(list => children(list, 'p:cond'))
		const numeric = conditions.filter(condition => condition.hasAttribute('delay') && Number.isFinite(Number(condition.getAttribute('delay'))))
		assert.ok(numeric.length <= 1, 'a timing node must have one unambiguous numeric start')
		if (numeric.length) total += Number(numeric[0].getAttribute('delay'))
	}
	return total
}

export function inspectNative3dDurationXml(xml, expected) {
	const errors = []
	const doc = new DOMParser({ errorHandler: { warning: text => errors.push(text), error: text => errors.push(text), fatalError: text => errors.push(text) } }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [], 'the serialized slide must parse without XML warnings')
	// A model and its compatibility picture intentionally share the same shape ID;
	// only the native Choice participates in PowerPoint's active shape tree.
	const activeShapeNodes = nodes(doc, 'p:cNvPr').filter(node => !inFallback(node))
	const names = new Map(activeShapeNodes.map(node => [node.getAttribute('id'), node.getAttribute('name')]))
	assert.equal(new Set(names.keys()).size, activeShapeNodes.length, 'active native shape IDs must be unique')
	for (const target of nodes(doc, 'p:spTgt')) assert.ok(names.has(target.getAttribute('spid')), 'all native timing targets must resolve')
	const owners = nodes(doc, 'p:cTn').filter(node => node.hasAttribute('presetID'))
	const targets = owner => [...new Set(nodes(owner, 'p:spTgt').map(node => names.get(node.getAttribute('spid'))))]
	const model = owners.filter(node => targets(node).includes(expected.modelName))
	const marker = owners.filter(node => targets(node).includes(expected.markerName))
	assert.equal(model.length, 1, `${expected.id}: one native model effect`)
	assert.equal(marker.length, 1, `${expected.id}: one afterPrevious marker`)
	assert.equal(model[0].getAttribute('presetID'), expected.presetId)
	assert.equal(model[0].getAttribute('presetClass'), expected.presetClass)
	const modelStartMs = nativeAbsoluteStart(model[0])
	const behaviors = nodes(model[0], 'p:cBhvr').map(behavior => {
		const timing = children(behavior, 'p:cTn')[0]
		assert.ok(timing, 'each behavior needs timing')
		const durationMs = numberAttr(timing, 'dur')
		assert.ok(Number.isInteger(durationMs) && durationMs >= 0, 'leaf duration must be nonnegative integer milliseconds')
		const kind = behavior.parentNode.tagName
		const speed = numberAttr(timing, 'spd', 100000) / 100000
		const repeated = numberAttr(timing, 'repeatCount', 1000) / 1000
		const startMs = nativeAbsoluteStart(timing) - modelStartMs
		return { kind, attribute: nodes(behavior, 'p:attrName')[0]?.textContent || null,
			durationMs, startMs, endMs: startMs + durationMs * (timing.getAttribute('autoRev') === '1' ? 2 : 1) * repeated / speed,
			visibility: nodes(behavior.parentNode, 'p:strVal')[0]?.getAttribute('val') || null }
	})
	const movement = behaviors.filter(behavior => behavior.kind !== 'p:set')
	assert.ok(movement.length, 'native movement/fade behaviors must exist')
	const movementSpanMs = Math.max(...movement.map(behavior => behavior.endMs))
	const markerStartMs = nativeAbsoluteStart(marker[0])
	const hidden = behaviors.find(behavior => behavior.kind === 'p:set' && behavior.visibility === 'hidden')
	const expectedMarker = expected.startMs + expected.expectedDurationMs + expected.markerGapMs
	const boundarySlack = expected.expectedDurationMs === 0 ? 1 : 0
	const checks = {
		startMatchesAuthoredClock: modelStartMs === expected.startMs,
		movementMatchesAuthoredClock: movementSpanMs === expected.expectedDurationMs,
		afterPreviousMatchesActualEnd: markerStartMs >= expectedMarker && markerStartMs <= expectedMarker + boundarySlack,
		hideMatchesAuthoredEnd: expected.effect !== 'leave' || hidden?.startMs === Math.max(0, expected.expectedDurationMs - 1),
		oneNativeModel: nodes(doc, 'am3d:model3d').length === 1,
		noNegativeNativeTiming: nodes(doc, 'p:cTn').every(node => !node.hasAttribute('dur') || node.getAttribute('dur') === 'indefinite' || Number(node.getAttribute('dur')) >= 0),
	}
	return { id: expected.id, modelStartMs, movementSpanMs, markerStartMs, hiddenAtMs: hidden?.startMs ?? null, behaviors, checks }
}

function run(executable, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(executable, args, { cwd: root, windowsHide: true, ...options })
		let stdout = '', stderr = ''
		child.stdout?.on('data', chunk => { stdout += chunk })
		child.stderr?.on('data', chunk => { stderr += chunk })
		child.on('error', reject)
		child.on('close', code => code === 0 ? resolve({ stdout, stderr }) : reject(Object.assign(new Error(`${path.basename(executable)} exited ${code}: ${stderr || stdout}`), { stdout, stderr, exitCode: code })))
	})
}

async function inspectPackage(file, cases) {
	const bytes = await fs.readFile(file), zip = await JSZip.loadAsync(bytes, { checkCRC32: true })
	const rows = []
	for (const item of cases) rows.push(inspectNative3dDurationXml(await zip.file(`ppt/slides/slide${item.slideIndex}.xml`).async('string'), item))
	const audit = await run(process.execPath, [path.join(root, 'tools/audit-pptx-package-integrity.mjs'), file])
	const packageAudit = JSON.parse(audit.stdout)
	const nativePayloads = []
	for (const name of Object.keys(zip.files).filter(name => name.toLowerCase().endsWith('.glb'))) {
		const payload = await zip.file(name).async('nodebuffer')
		nativePayloads.push({ part: name, bytes: payload.length, sha256: sha256(payload) })
	}
	return { file, sha256: sha256(bytes), bytes: bytes.length, rows, nativePayloads, packageAudit,
		status: packageAudit.status === 'PASS' && nativePayloads.length > 0 && rows.every(row => Object.values(row.checks).every(Boolean)) ? 'PASS' : 'FAIL' }
}

async function buildDeck(file, cases) {
	// This is a regression fixture for the explicitly requested engine under test,
	// not a general-purpose presentation authored through a substitute library.
	const require = createRequire(import.meta.url), PptxGenJS = require('../dist/pptxgen.cjs.js')
	const pptx = new PptxGenJS()
	pptx.layout = 'LAYOUT_WIDE'; pptx.author = 'Native timing verification'; pptx.title = 'Native 3D duration proof'
	pptx.subject = 'Requested duration, actual model playback, and afterPrevious share one clock.'
	for (const item of cases) {
		const slide = pptx.addSlide(); slide.background = { color: 'E8EFF5' }
		const color = item.tagColor.map(value => value.toString(16).padStart(2, '0')).join('')
		slide.addShape(pptx.ShapeType.rect, { ...TAG_FRAME, objectName: `video-tag-${item.slideIndex}`, fill: { color }, line: { transparency: 100 } })
		slide.addText(item.effect === 'jumpandturn' ? 'Jump & Turn' : item.effect[0].toUpperCase() + item.effect.slice(1), { x: 0.7, y: 0.6, w: 11.7, h: 0.65, fontSize: 35, bold: true, color: '102235', margin: 0 })
		slide.addText(`${item.mode}\n${item.expectedDurationMs} ms`, { x: 0.7, y: 1.7, w: 3.2, h: 1.5, fontSize: 32, color: '102235', margin: 0, breakLine: false })
		slide.addText('The green signal follows the complete native effect.', { x: 0.7, y: 3.55, w: 3.2, h: 1.05, fontSize: 20, color: '334155', margin: 0 })
		slide.addShape(pptx.ShapeType.rect, { ...ORIGIN_FRAME, objectName: `origin-${item.id}`, fill: { color: '00FFFF' }, line: { transparency: 100 } })
		slide.addShape(pptx.ShapeType.rect, { ...MARKER_FRAME, objectName: item.markerName, fill: { color: '00FF00' }, line: { transparency: 100 } })
		slide.addModel3D({ glbFile: path.join(here, 'assets/default-presenter-louise.glb'), rasterFile: path.join(here, 'assets/default-presenter-louise.png'),
			...MODEL_FRAME, objectName: item.modelName, altText: `Native editable ${item.effect} timing specimen`,
			objViewport: Math.round(MODEL_FRAME.h * 1454545 / 1.18),
			camera: { pos: { x: 0, y: 0, z: 72274889 }, fov: 45 },
			trans: { rot: { ay: 0 }, scale: { sx: 1000000, sy: 1000000, sz: 1000000 } },
			ambientLight: { color: { r: 100000, g: 100000, b: 100000 }, illuminance: 0.75 },
			ptLights: [{ color: { r: 100000, g: 100000, b: 100000 }, intensity: 5.5, pos: { x: 24000000, y: 56000000, z: 36000000 } }, { color: { r: 85000, g: 90000, b: 100000 }, intensity: 3.25, pos: { x: -34000000, y: 42000000, z: 48000000 } }],
		})
		slide.addAnimation(`origin-${item.id}`, { type: 'entrance', effect: 'appear', duration: 1, delay: 0, trigger: 'withPrevious' })
		slide.addAnimation(item.modelName, { type: item.type, effect: item.effect, trigger: 'withPrevious', delay: item.startMs,
			...(Object.hasOwn(item, 'duration') ? { duration: item.duration } : {}) })
		slide.addAnimation(item.markerName, { type: 'entrance', effect: 'appear', duration: 1, delay: item.markerGapMs, trigger: 'afterPrevious' })
		slide.transition = { type: 'cut', duration: 0, advanceOnClick: false, advanceAfterTime: item.dwellMs }
		slide.addNotes(`Maintainer timing fixture ${item.id}. The model begins at ${item.startMs} ms, moves for ${item.expectedDurationMs} ms and is followed after ${item.markerGapMs} ms. Cyan is the video-clock origin.\n[Sources]\nLocal governed presenter: betterpptx-mcp/assets/default-presenter-louise.glb. Existing in-project source; no external research.\n[/Sources]`)
	}
	await pptx.writeFile({ fileName: file, compression: true })
}

function regionPixels(frame, region, width = 320, height = 180) {
	const x0 = Math.round(region.x / (40 / 3) * width), y0 = Math.round(region.y / 7.5 * height)
	const w = Math.max(1, Math.round(region.w / (40 / 3) * width)), h = Math.max(1, Math.round(region.h / 7.5 * height))
	const pixels = Buffer.alloc(w * h * 3)
	for (let y = 0; y < h; y++) frame.copy(pixels, y * w * 3, ((y0 + y) * width + x0) * 3, ((y0 + y) * width + x0 + w) * 3)
	return pixels
}
const meanRgb = pixels => { const sum = [0, 0, 0]; for (let i = 0; i < pixels.length; i++) sum[i % 3] += pixels[i]; return sum.map(value => value / (pixels.length / 3)) }
const delta = (left, right) => { let sum = 0; for (let i = 0; i < left.length; i++) sum += Math.abs(left[i] - right[i]); return sum / left.length }
const colorDistance = (a, b) => Math.sqrt(a.reduce((sum, value, index) => sum + (value - b[index]) ** 2, 0))
const average = values => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)

async function analyzeVideo(video, cases, outputDir, ffmpeg, ffprobe) {
	const metadata = JSON.parse((await run(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', video])).stdout)
	const stream = metadata.streams.find(item => item.codec_type === 'video')
	const fps = 30, frameBytes = 320 * 180 * 3, perCase = new Map(cases.map(item => [item.id, []]))
	let frameIndex = 0, carry = Buffer.alloc(0), stderr = ''
	await new Promise((resolve, reject) => {
		const child = spawn(ffmpeg, ['-v', 'error', '-i', video, '-an', '-vf', 'fps=30,scale=320:180', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true })
		child.stderr.on('data', chunk => { stderr += chunk })
		child.stdout.on('data', chunk => {
			carry = Buffer.concat([carry, chunk])
			while (carry.length >= frameBytes) {
				const frame = carry.subarray(0, frameBytes); carry = carry.subarray(frameBytes)
				const tag = meanRgb(regionPixels(frame, { x: .17, y: .17, w: .17, h: .17 }))
				const nearest = cases.map(item => ({ item, distance: colorDistance(tag, item.tagColor) })).sort((a, b) => a.distance - b.distance)[0]
				if (nearest.distance < 28) {
					const actor = regionPixels(frame, ACTOR_ROI), marker = meanRgb(regionPixels(frame, { x: MARKER_FRAME.x + .2, y: MARKER_FRAME.y + .1, w: 1.7, h: .25 })), origin = meanRgb(regionPixels(frame, { x: ORIGIN_FRAME.x + .2, y: ORIGIN_FRAME.y + .08, w: 1.7, h: .18 }))
					perCase.get(nearest.item.id).push({ frameIndex, actor, marker: marker[0] < 70 && marker[1] > 170 && marker[2] < 90, origin: origin[0] < 70 && origin[1] > 170 && origin[2] > 170 })
				}
				frameIndex++
			}
		})
		child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(`video decode failed: ${stderr}`)))
	})
	const sampleRecords = [], rows = []
	for (const item of cases) {
		const frames = perCase.get(item.id), firstOrigin = frames.find(frame => frame.origin)
		assert.ok(frames.length && firstOrigin, `${item.id}: video contains its slide and cyan clock origin`)
		const originIndex = firstOrigin.frameIndex, firstMarker = frames.find(frame => frame.marker)
		for (let index = 0; index < frames.length; index++) { frames[index].atMs = (frames[index].frameIndex - originIndex) * 1000 / fps; frames[index].change = index ? delta(frames[index].actor, frames[index - 1].actor) : 0 }
		const expectedEnd = item.startMs + item.expectedDurationMs, expectedMarker = expectedEnd + item.markerGapMs
		const active = frames.filter(frame => frame.atMs >= item.startMs + 80 && frame.atMs < expectedEnd - 50)
		const late = frames.filter(frame => frame.atMs > item.startMs + item.expectedDurationMs * .55 && frame.atMs < expectedEnd - 100)
		const settled = frames.filter(frame => frame.atMs > expectedEnd + 200 && frame.atMs < item.dwellMs - 150)
		const markerAtMs = firstMarker ? (firstMarker.frameIndex - originIndex) * 1000 / fps : null
		const activePeak = Math.max(0, ...active.map(frame => frame.change)), latePeak = Math.max(0, ...late.map(frame => frame.change)), settledMean = average(settled.map(frame => frame.change))
		const checks = { markerOnAuthoredClock: markerAtMs !== null && Math.abs(markerAtMs - expectedMarker) <= 100,
			visibleNativeMovement: activePeak > .08, longMotionNotTruncatedAtOldDefault: item.mode !== 'long' || latePeak > .08,
			movementSettlesAfterAuthoredEnd: settled.length >= 3 && settledMean < .6 }
		const sampleTimes = [Math.max(0, item.startMs - 100), item.startMs + item.expectedDurationMs * .25, item.startMs + item.expectedDurationMs * .65, item.startMs + item.expectedDurationMs * .90, expectedEnd + 200, expectedEnd + 650]
		for (const [index, atMs] of sampleTimes.entries()) {
			const picked = frames.reduce((best, frame) => Math.abs(frame.atMs - atMs) < Math.abs(best.atMs - atMs) ? frame : best, frames[0])
			sampleRecords.push({ id: item.id, sample: index + 1, atMs: picked.atMs, frameIndex: picked.frameIndex })
		}
		rows.push({ id: item.id, observedFrames: frames.length, observedSlideMs: frames.length * 1000 / fps, clockOriginFrame: originIndex, markerAtMs, expectedMarkerMs: expectedMarker,
			activePeakMeanAbsoluteRgbChange: activePeak, latePeakMeanAbsoluteRgbChange: latePeak, settledMeanAbsoluteRgbChange: settledMean, checks })
	}
	const frameDir = path.join(outputDir, 'playback-frames'); await fs.mkdir(frameDir, { recursive: true })
	const uniqueIndexes = [...new Set(sampleRecords.map(sample => sample.frameIndex))].sort((a, b) => a - b)
	await run(ffmpeg, ['-v', 'error', '-y', '-i', video, '-an', '-vf', `fps=30,select='${uniqueIndexes.map(index => `eq(n,${index})`).join('+')}'`, '-vsync', '0', path.join(frameDir, 'sample-%04d.png')])
	for (const sample of sampleRecords) sample.file = path.join(frameDir, `sample-${String(uniqueIndexes.indexOf(sample.frameIndex) + 1).padStart(4, '0')}.png`)
	return { status: rows.every(row => Object.values(row.checks).every(Boolean)) ? 'PASS' : 'FAIL', video, videoSha256: sha256(await fs.readFile(video)), frameRate: fps, sourceDimensions: { width: stream.width, height: stream.height }, durationSeconds: Number(metadata.format.duration), thresholds: { markerToleranceMs: 100, visibleMovementMeanAbsoluteRgbChange: .08, settledMeanAbsoluteRgbChange: .6 }, rows, samples: sampleRecords }
}

async function createReviewSheets(report) {
	const require = createRequire(process.env.RUNTIME_NODE_MODULES ? path.join(process.env.RUNTIME_NODE_MODULES, 'package.json') : import.meta.url)
	const sharp = require('sharp'), reviewDir = path.join(report.outputDir, 'review-sheets')
	await fs.mkdir(reviewDir, { recursive: true })
	const sheets = []
	for (const effect of EFFECTS) {
		const cases = native3dDurationCases().filter(item => item.effect === effect.effect)
		const width = 1536, rowHeight = 196, height = 32 + cases.length * rowHeight, layers = [], labels = []
		labels.push(`<text x="8" y="23" font-size="22">${effect.effect}: native PowerPoint playback</text>`)
		for (const [rowIndex, item] of cases.entries()) {
			const top = 32 + rowIndex * rowHeight
			labels.push(`<text x="8" y="${top + 20}" font-size="18">${item.id} / requested ${item.expectedDurationMs} ms</text>`)
			for (const [column, sample] of report.playback.samples.filter(sample => sample.id === item.id).entries()) {
				layers.push({ input: await sharp(sample.file).resize(256, 144).png().toBuffer(), left: column * 256, top: top + 27 })
				labels.push(`<text x="${column * 256 + 8}" y="${top + 190}" font-size="15">t = ${Math.round(sample.atMs)} ms</text>`)
			}
		}
		layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g fill="#102235" font-family="Arial">${labels.join('')}</g></svg>`), left: 0, top: 0 })
		const file = path.join(reviewDir, `${effect.effect}-playback.png`)
		await sharp({ create: { width, height, channels: 3, background: '#ffffff' } }).composite(layers).png().toFile(file)
		sheets.push({ kind: 'playback', effect: effect.effect, file, sha256: sha256(await fs.readFile(file)), cases: cases.map(item => item.id) })
	}
	for (const deck of report.office.decks) {
		const slides = deck.roundtripReadback.slides, width = 1600, height = Math.ceil(slides.length / 5) * 208, layers = [], labels = []
		for (const [index, slide] of slides.entries()) {
			const left = index % 5 * 320, top = Math.floor(index / 5) * 208
			layers.push({ input: await sharp(slide.staticImage).resize(320, 180).png().toBuffer(), left, top })
			labels.push(`<text x="${left + 8}" y="${top + 201}" font-size="15">${slide.id}</text>`)
		}
		layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g fill="#102235" font-family="Arial">${labels.join('')}</g></svg>`), left: 0, top: 0 })
		const file = path.join(reviewDir, `${deck.id}-static.png`)
		await sharp({ create: { width, height, channels: 3, background: '#ffffff' } }).composite(layers).png().toFile(file)
		sheets.push({ kind: 'static', file, sha256: sha256(await fs.readFile(file)), cases: slides.map(item => item.id) })
	}
	return sheets
}

async function main() {
	const arg = (name, fallback) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : fallback }
	const outputDir = path.resolve(arg('--output-dir', path.join(root, 'outputs/kinetics-closure-20260903/native-model3d-duration', new Date().toISOString().replace(/[:.]/g, '-'))))
	const reportPath = path.join(outputDir, 'native-model3d-duration-proof.json')
	if (process.argv.includes('--review-sheets-only')) {
		const report = JSON.parse(await fs.readFile(reportPath, 'utf8'))
		report.visualReview.contactSheets = await createReviewSheets(report)
		await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
		console.log(JSON.stringify(report.visualReview, null, 2)); return
	}
	const reviewFile = arg('--record-visual-review', null)
	if (reviewFile) {
		const report = JSON.parse(await fs.readFile(reportPath, 'utf8')), review = JSON.parse(await fs.readFile(path.resolve(reviewFile), 'utf8'))
		assert.equal(review.status, 'PASS'); assert.equal(review.videoSha256, report.playback.videoSha256)
		assert.deepEqual([...review.cases.map(item => item.id)].sort(), [...report.playback.rows.map(item => item.id)].sort())
		assert.ok(review.cases.every(item => item.status === 'PASS'))
		for (const sheet of report.visualReview.contactSheets || []) assert.equal(sha256(await fs.readFile(sheet.file)), sheet.sha256, 'review sheet must remain bound to its inspected bytes')
		report.visualReview = { ...report.visualReview, ...review, reviewFile: path.resolve(reviewFile), reviewSha256: sha256(await fs.readFile(path.resolve(reviewFile))) }
		await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
		console.log(JSON.stringify({ status: report.status, visualReview: report.visualReview.status, report: reportPath }, null, 2)); return
	}
	const analyzeOnly = process.argv.includes('--analyze-only'), buildOnly = process.argv.includes('--build-only')
	await fs.mkdir(outputDir, { recursive: true })
	const cases = native3dDurationCases(), boundaries = native3dDurationCases({ boundary: true })
	const mainFile = path.join(outputDir, 'native-model3d-duration.pptx'), boundaryFile = path.join(outputDir, 'native-model3d-duration-boundaries.pptx')
	const manifestPath = path.join(outputDir, 'proof-manifest.json')
	const report = { schemaVersion: 'betterpptx.native-model3d-duration-oracle.v1', status: 'RUNNING', generatedAt: new Date().toISOString(), outputDir,
		purpose: 'Independent five-effect native duration, afterPrevious, PowerPoint roundtrip and actual playback proof.',
		engineBuildSha256: sha256(await fs.readFile(path.join(root, 'dist/pptxgen.cjs.js'))),
		modelSha256: sha256(await fs.readFile(path.join(here, 'assets/default-presenter-louise.glb'))), generated: [], officeRoundtrip: [] }
	if (!analyzeOnly) {
		for (const file of [mainFile, boundaryFile]) assert.ok(!existsSync(file), `refusing to overwrite proof input ${file}`)
		await buildDeck(mainFile, cases); await buildDeck(boundaryFile, boundaries)
		await fs.writeFile(manifestPath, `${JSON.stringify({ outputDir, decks: [{ id: 'duration', source: mainFile, roundtrip: path.join(outputDir, 'native-model3d-duration-office.pptx'), video: path.join(outputDir, 'native-model3d-duration.mp4'), cases }, { id: 'boundary', source: boundaryFile, roundtrip: path.join(outputDir, 'native-model3d-duration-boundaries-office.pptx'), cases: boundaries }] }, null, 2)}\n`)
	}
	const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
	for (const deck of manifest.decks) report.generated.push(await inspectPackage(deck.source, deck.cases))
	await fs.writeFile(path.join(outputDir, 'generated-package-proof.json'), `${JSON.stringify(report.generated, null, 2)}\n`)
	assert.ok(report.generated.every(item => item.status === 'PASS'), 'generated native timing must match before PowerPoint is opened')
	if (buildOnly) { console.log(JSON.stringify({ status: 'PASS_BUILD_ONLY', outputDir }, null, 2)); return }
	if (!analyzeOnly) {
		console.log(`PowerPoint oracle starting: ${outputDir}`)
		await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'verify-native-model3d-duration-powerpoint-session.ps1'), '-ManifestPath', manifestPath])
	}
	report.office = JSON.parse((await fs.readFile(path.join(outputDir, 'powerpoint-session-proof.json'), 'utf8')).replace(/^\uFEFF/, ''))
	assert.equal(report.office.status, 'PASS', 'PowerPoint open/save/reopen/session preservation must pass')
	for (const deck of manifest.decks) report.officeRoundtrip.push(await inspectPackage(deck.roundtrip, deck.cases))
	report.nativePayloadPreservation = report.generated.map((generated, index) => ({ file: generated.file,
		unchanged: JSON.stringify([...new Set(generated.nativePayloads.map(item => item.sha256))].sort()) === JSON.stringify([...new Set(report.officeRoundtrip[index].nativePayloads.map(item => item.sha256))].sort()) }))
	const ffmpeg = process.env.BETTERPPTX_FFMPEG_PATH || path.join(here, 'node_modules/ffmpeg-static/ffmpeg.exe')
	const ffprobe = process.env.BETTERPPTX_FFPROBE_PATH || path.join(here, 'node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe')
	assert.ok(existsSync(ffmpeg) && existsSync(ffprobe), 'installed video verification tools must be available')
	report.playback = await analyzeVideo(manifest.decks[0].video, cases, outputDir, ffmpeg, ffprobe)
	report.status = report.officeRoundtrip.every(item => item.status === 'PASS') && report.nativePayloadPreservation.every(item => item.unchanged) && report.playback.status === 'PASS' ? 'PASS' : 'FAIL'
	report.boundaryPolicy = 'Zero/one millisecond movement is verified in source, PowerPoint readback and reopened XML; the required 1 ms visibility setter may extend a zero-duration boundary by at most 1 ms. 30 fps playback is not claimed as millisecond boundary metrology.'
	report.visualReview = { status: 'REQUIRES_MAINTAINER_REVIEW', frameDirectory: path.join(outputDir, 'playback-frames'), scope: 'Review every short/long/default/reset slide frame sequence. Pixel checks alone do not establish cosmetic quality.' }
	await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`)
	console.log(JSON.stringify({ status: report.status, outputDir, generatedSlides: cases.length + boundaries.length, videoSeconds: report.playback.durationSeconds, videoChecks: report.playback.rows.map(row => ({ id: row.id, checks: row.checks })), visualReview: report.visualReview }, null, 2))
	if (report.status !== 'PASS') process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.stack || error); process.exitCode = 1 })
