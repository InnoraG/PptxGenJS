#!/usr/bin/env node
// Real-world MCP smoke: drive a public Streamable HTTP endpoint exactly as a
// remote client would, then download and inspect the generated narrated deck.

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import JSZip from 'jszip'

const URL = (process.argv[2] || process.env.BETTERPPTX_LIVE_MCP_URL || '').trim()
if (!URL) {
	console.error('Usage: node betterpptx-mcp/smoke-live-narration.mjs <mcp-url>')
	process.exit(2)
}

const token = (process.env.BETTERPPTX_LIVE_TOKEN || '').trim()
const H = {
	'Content-Type': 'application/json',
	Accept: 'application/json, text/event-stream',
	...(token ? { Authorization: `Bearer ${token}` } : {}),
}
function sse(text) {
	for (const line of String(text).split(/\r?\n/)) {
		const m = line.match(/^data:\s*(.+)$/)
		if (m) return JSON.parse(m[1])
	}
	return null
}
async function body(res) {
	const ct = res.headers.get('content-type') || ''
	const raw = await res.text()
	return ct.includes('event-stream') ? sse(raw) : (raw ? JSON.parse(raw) : null)
}
async function rpc(method, params, sid, id) {
	const res = await fetch(URL, { method: 'POST', headers: sid ? { ...H, 'mcp-session-id': sid } : H, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) })
	const parsed = await body(res)
	if (!res.ok || parsed?.error) throw new Error(`${method}: HTTP ${res.status} ${JSON.stringify(parsed?.error || parsed)}`)
	return { parsed, sid: res.headers.get('mcp-session-id') || sid }
}
async function tool(name, args, sid, id) {
	const { parsed } = await rpc('tools/call', { name, arguments: args }, sid, id)
	const content = parsed?.result?.content?.[0]?.text
	const payload = content ? JSON.parse(content) : parsed?.result
	if (!payload?.ok) throw new Error(`${name}: ${payload?.error?.message || JSON.stringify(payload)}`)
	return payload.data
}

const init = await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'narration-showcase-smoke', version: '2' }, capabilities: {} }, null, 1)
const sid = init.sid
await fetch(URL, { method: 'POST', headers: { ...H, 'mcp-session-id': sid }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) })
const list = await rpc('tools/list', {}, sid, 2)
const toolNames = (list.parsed?.result?.tools || []).map(t => t.name)
for (const required of ['betterpptx.narration.voices', 'betterpptx.slide.add_narration', 'betterpptx.deck.validate_narration', 'betterpptx.slide.animate_shapes']) {
	if (!toolNames.includes(required)) throw new Error(`Live endpoint missing tool ${required}`)
}

let id = 10
const deck = await tool('betterpptx.deck.new', { layout: 'LAYOUT_WIDE', title: 'Narrated MCP Product Showcase' }, sid, id++)
const deckId = deck.deckId
const provider = process.env.BETTERPPTX_LIVE_TTS_PROVIDER || undefined
const allowUnreviewedVoices = process.env.BETTERPPTX_LIVE_ALLOW_UNREVIEWED === '1'
const saveOutputDir = process.env.BETTERPPTX_LIVE_SAVE_OUTPUT_DIR || undefined
const voices = await tool('betterpptx.narration.voices', { includeCandidates: allowUnreviewedVoices, allowUnreviewedVoices }, sid, id++)
const voice = process.env.BETTERPPTX_LIVE_VOICE || voices.voices?.[0]?.id

const C = {
	ink: '111827',
	cream: 'F7F3EA',
	paper: 'FFFFFF',
	teal: '0F766E',
	mint: 'DDF7EF',
	coral: 'F9735B',
	gold: 'F2B84B',
	violet: '6D5BD0',
	blue: '2563EB',
	slate: '2F3A4A',
}
const W = 13.333
const HGT = 7.5
const bg = (stops, angle = 0) => ({ type: 'gradient', gradientAngle: angle, gradientStops: stops.map(([pos, color, transparency = 0]) => ({ pos, color, transparency })) })
const commonText = { fontFace: 'Aptos', margin: 0.02, breakLine: false, fit: 'shrink' }
async function addSlide(background, transition = { type: 'fade', speed: 'medium' }) {
	return await tool('betterpptx.slide.add', { deckId, background, transition }, sid, id++)
}
async function text(slideIndex, value, options) {
	return await tool('betterpptx.slide.add_text', { deckId, slideIndex, text: value, options: { ...commonText, ...options } }, sid, id++)
}
async function shape(slideIndex, shapeName, options, value = undefined) {
	return await tool('betterpptx.slide.add_shape', { deckId, slideIndex, shapeName, options, ...(value ? { text: value } : {}) }, sid, id++)
}
async function animate(slideIndex, names, animation, staggerMs = 0) {
	return await tool('betterpptx.slide.animate_shapes', { deckId, slideIndex, names, animation, staggerMs }, sid, id++)
}
async function narrate(slideIndex, script, cues, captionText) {
	return await tool('betterpptx.slide.add_narration', {
		deckId,
		slideIndex,
		script,
		voice,
		provider,
		allowUnreviewedVoices,
		x: 12.92,
		y: 7.18,
		w: 0.06,
		h: 0.06,
		cues,
		captions: {
			enabled: true,
			x: 1.0,
			y: 6.52,
			w: 11.35,
			h: 0.38,
			fontSize: 12.5,
			color: 'FFFFFF',
			fill: { color: C.ink, transparency: 8 },
			items: [{ text: captionText, atMs: 250, endMs: 4200 }],
		},
	}, sid, id++)
}

const s1 = await addSlide({ color: C.cream }, { type: 'fade', speed: 'medium' })
await shape(s1.slideIndex, 'rect', { x: 0, y: 0, w: 4.85, h: HGT, fill: { color: C.ink }, line: { color: C.ink }, objectName: 'hero-rail' })
await shape(s1.slideIndex, 'ellipse', { x: 8.7, y: 0.08, w: 4.25, h: 4.25, fill: { color: C.teal, transparency: 12 }, line: { color: C.teal, transparency: 100 }, objectName: 'hero-orbit-a' })
await shape(s1.slideIndex, 'ellipse', { x: 6.9, y: 3.62, w: 3.42, h: 3.42, fill: { color: C.gold, transparency: 18 }, line: { color: C.gold, transparency: 100 }, objectName: 'hero-orbit-b' })
await text(s1.slideIndex, 'betterpptx-mcp', { x: 0.6, y: 0.55, w: 2.8, h: 0.28, fontSize: 13, bold: true, color: C.gold, charSpacing: 1.2, objectName: 'hero-brand' })
await text(s1.slideIndex, 'Narrated decks that move like product films', { x: 0.6, y: 1.5, w: 3.65, h: 1.35, fontSize: 29, bold: true, color: 'FFFFFF', objectName: 'hero-title' })
await text(s1.slideIndex, 'Voice, timing, captions, and visual reveals are authored as one presentation system through the public MCP endpoint.', { x: 0.62, y: 3.1, w: 3.55, h: 0.9, fontSize: 14.5, color: 'E5E7EB', breakLine: true, objectName: 'hero-copy' })
const chips = [
	['chip-tts', 'Real TTS', C.teal, 5.6, 1.15],
	['chip-motion', 'Timed motion', C.coral, 8.08, 2.38],
	['chip-valid', 'Validated PPTX', C.violet, 6.14, 4.12],
]
for (const [name, label, color, x, y] of chips) {
	await shape(s1.slideIndex, 'roundRect', { x, y, w: 2.1, h: 0.72, rectRadius: 0.08, fill: { color }, line: { color, transparency: 100 }, shadow: { type: 'outer', color: '000000', opacity: 0.18, blur: 3, angle: 45, distance: 1 }, objectName: name })
	await text(s1.slideIndex, label, { x: x + 0.22, y: y + 0.24, w: 1.55, h: 0.2, fontSize: 12.8, bold: true, color: 'FFFFFF', align: 'center', objectName: `${name}-label` })
}
await animate(s1.slideIndex, ['hero-title', 'hero-copy'], { type: 'entrance', effect: 'fade', duration: 450, trigger: 'afterPrevious', delay: 150 }, 120)
await narrate(s1.slideIndex, 'This narrated showcase is generated through the public MCP endpoint. It pairs real text to speech with designed slides, timed motion, captions, and package validation, so the result feels like a product film instead of a plain test file.', [
	{ atMs: 700, target: 'chip-tts', effect: 'zoom', duration: 420, text: 'Real TTS' },
	{ atMs: 1650, target: 'chip-motion', effect: 'zoom', duration: 420, text: 'Timed motion' },
	{ atMs: 2550, target: 'chip-valid', effect: 'zoom', duration: 420, text: 'Validated PPTX' },
], 'A narrated deck should feel designed, timed, and intentional.')

const s2 = await addSlide({ color: C.paper }, { type: 'push', direction: 'left', speed: 'medium' })
await text(s2.slideIndex, 'From slide notes to a synchronized show', { x: 0.7, y: 0.48, w: 7.8, h: 0.45, fontSize: 24, bold: true, color: C.ink, objectName: 'system-title' })
await text(s2.slideIndex, 'The MCP turns story text into audio, embeds it, and aligns visuals to cue timestamps.', { x: 0.72, y: 0.98, w: 7.4, h: 0.32, fontSize: 12.5, color: C.slate, objectName: 'system-subtitle' })
const steps = [
	['step-notes', 'Notes', 'speaker script', C.teal],
	['step-tts', 'TTS', 'Piper voice', C.blue],
	['step-media', 'Media', 'embedded WAV', C.coral],
	['step-timing', 'Timing', 'auto advance', C.violet],
	['step-captions', 'Captions', 'lower third', C.gold],
]
for (let i = 0; i < steps.length; i++) {
	const [name, title, sub, color] = steps[i]
	const x = 0.72 + i * 2.45
	await shape(s2.slideIndex, 'roundRect', { x, y: 2.25, w: 2.05, h: 1.28, rectRadius: 0.08, fill: { color }, line: { color, transparency: 100 }, shadow: { type: 'outer', color: '000000', opacity: 0.16, blur: 2, angle: 45, distance: 1 }, objectName: name })
	await text(s2.slideIndex, title, { x: x + 0.18, y: 2.5, w: 1.65, h: 0.25, fontSize: 15, bold: true, color: 'FFFFFF', align: 'center', objectName: `${name}-title` })
	await text(s2.slideIndex, sub, { x: x + 0.18, y: 2.88, w: 1.65, h: 0.22, fontSize: 9.5, color: 'FFFFFF', align: 'center', objectName: `${name}-sub` })
	if (i < steps.length - 1) {
		await shape(s2.slideIndex, 'triangle', { x: x + 2.12, y: 2.74, w: 0.26, h: 0.26, rotate: 90, fill: { color: '94A3B8' }, line: { color: '94A3B8', transparency: 100 }, objectName: `${name}-arrow` })
	}
}
await shape(s2.slideIndex, 'roundRect', { x: 1.1, y: 4.55, w: 11.1, h: 1.05, rectRadius: 0.08, fill: { color: C.mint }, line: { color: C.teal, transparency: 65 }, objectName: 'system-proof' })
await text(s2.slideIndex, 'Validation gate: audio relationships, p:audio timing nodes, media play commands, notes, showNarration, and slide advance timings are inspected before the deck is handed off.', { x: 1.35, y: 4.82, w: 10.45, h: 0.45, fontSize: 14, color: C.ink, breakLine: true, objectName: 'system-proof-text' })
await narrate(s2.slideIndex, 'The workflow is not simply attaching a sound file. The server converts speaker notes to voice, embeds the wave files, adds media play commands, aligns slide advance timing, and verifies the resulting PowerPoint package.', steps.map((step, i) => ({ atMs: 450 + i * 650, target: step[0], effect: 'fade', duration: 360, text: step[1] })), 'Narration, animation, and validation are one workflow.')

const s3 = await addSlide({ color: '10141B' }, { type: 'fade', speed: 'medium' })
await text(s3.slideIndex, 'Quality gates turn demos into product moments', { x: 0.7, y: 0.48, w: 8.4, h: 0.44, fontSize: 23, bold: true, color: 'FFFFFF', objectName: 'quality-title' })
await text(s3.slideIndex, 'Every generated narration test now carries design expectations, not just package checks.', { x: 0.72, y: 0.98, w: 7.6, h: 0.32, fontSize: 12.5, color: 'CBD5E1', objectName: 'quality-subtitle' })
const cards = [
	['metric-story', 'Story', '1 message per slide', C.gold],
	['metric-design', 'Design', 'visual system', C.teal],
	['metric-motion', 'Motion', 'cue-timed reveals', C.coral],
	['metric-proof', 'Proof', 'PowerPoint + XML', C.violet],
]
for (let i = 0; i < cards.length; i++) {
	const [name, head, body, color] = cards[i]
	const x = 0.8 + i * 3.08
	await shape(s3.slideIndex, 'roundRect', { x, y: 2.0, w: 2.55, h: 2.35, rectRadius: 0.08, fill: { color: '1F2937' }, line: { color, transparency: 30 }, shadow: { type: 'outer', color: '000000', opacity: 0.28, blur: 3, angle: 45, distance: 1 }, objectName: name })
	await shape(s3.slideIndex, 'rect', { x: x, y: 2.0, w: 2.55, h: 0.12, fill: { color }, line: { color, transparency: 100 }, objectName: `${name}-bar` })
	await text(s3.slideIndex, head, { x: x + 0.22, y: 2.32, w: 1.9, h: 0.32, fontSize: 17, bold: true, color: 'FFFFFF', objectName: `${name}-head` })
	await text(s3.slideIndex, body, { x: x + 0.22, y: 2.88, w: 1.95, h: 0.48, fontSize: 11.2, color: 'CBD5E1', breakLine: true, objectName: `${name}-body` })
	await shape(s3.slideIndex, 'rect', { x: x + 0.22, y: 3.68, w: 1.98, h: 0.11 + i * 0.1, fill: { color }, line: { color, transparency: 100 }, objectName: `${name}-signal` })
}
await shape(s3.slideIndex, 'rect', { x: 1.0, y: 5.42, w: 11.2, h: 0.025, fill: { color: '94A3B8', transparency: 40 }, line: { color: '94A3B8', transparency: 100 }, objectName: 'quality-timeline' })
await text(s3.slideIndex, 'Direct MCP test -> designed deck -> narration validation -> PowerPoint open -> server-log evidence', { x: 1.15, y: 5.72, w: 10.9, h: 0.32, fontSize: 13, color: 'E5E7EB', align: 'center', objectName: 'quality-chain' })
await narrate(s3.slideIndex, 'The quality bar is explicit. A generated narration deck should have a story, a visual system, cue timed motion, and hard validation evidence. That is the difference between a working feature and a convincing customer demo.', cards.map((card, i) => ({ atMs: 500 + i * 650, target: card[0], effect: 'zoom', duration: 450, text: card[1] })), 'The design gate makes every narration test customer-demo ready.')

const s4 = await addSlide({ color: C.cream }, { type: 'push', direction: 'left', speed: 'medium' })
await shape(s4.slideIndex, 'roundRect', { x: 0.65, y: 0.55, w: 12.0, h: 5.75, rectRadius: 0.08, fill: { color: 'FFFFFF' }, line: { color: 'E5E7EB' }, shadow: { type: 'outer', color: '000000', opacity: 0.18, blur: 4, angle: 45, distance: 1 }, objectName: 'final-panel' })
await text(s4.slideIndex, 'Real endpoint. Real voice. Presentation-grade output.', { x: 1.15, y: 1.12, w: 8.4, h: 0.62, fontSize: 28, bold: true, color: C.ink, objectName: 'final-title' })
await text(s4.slideIndex, 'This deck was generated through the public Streamable HTTP MCP endpoint, synthesized with an approved Piper voice, validated as a narrated PowerPoint package, and saved as a downloadable PPTX.', { x: 1.18, y: 1.95, w: 6.7, h: 0.88, fontSize: 13.8, color: C.slate, breakLine: true, objectName: 'final-copy' })
const checks = [
	['check-endpoint', 'MCP endpoint', 'public URL path mode', C.blue],
	['check-voice', 'Narration', 'approved Piper TTS', C.teal],
	['check-package', 'Package', 'media + timing verified', C.coral],
]
for (let i = 0; i < checks.length; i++) {
	const [name, head, body, color] = checks[i]
	const y = 3.25 + i * 0.78
	await shape(s4.slideIndex, 'ellipse', { x: 1.22, y, w: 0.34, h: 0.34, fill: { color }, line: { color, transparency: 100 }, objectName: `${name}-dot` })
	await text(s4.slideIndex, head, { x: 1.75, y: y - 0.02, w: 2.2, h: 0.22, fontSize: 12.6, bold: true, color: C.ink, objectName: `${name}-head` })
	await text(s4.slideIndex, body, { x: 4.05, y: y - 0.02, w: 3.4, h: 0.22, fontSize: 11.2, color: C.slate, objectName: `${name}-body` })
}
await shape(s4.slideIndex, 'hexagon', { x: 9.2, y: 1.42, w: 2.55, h: 2.55, fill: { color: C.violet, transparency: 6 }, line: { color: C.violet, transparency: 100 }, rotate: 18, objectName: 'final-badge' })
await text(s4.slideIndex, 'SHOWCASE\nREADY', { x: 9.55, y: 2.1, w: 1.85, h: 0.6, fontSize: 20, bold: true, color: 'FFFFFF', align: 'center', breakLine: true, objectName: 'final-badge-text' })
await narrate(s4.slideIndex, 'This is the bar for future narration demos. The endpoint should prove speech, timing, captions, animation, visual quality, package health, and PowerPoint compatibility in one coherent deck.', checks.map((check, i) => ({ atMs: 650 + i * 600, target: `${check[0]}-dot`, effect: 'zoom', duration: 320, text: check[1] })).concat([{ atMs: 2850, target: 'final-badge', effect: 'zoom', duration: 550, text: 'Showcase ready' }]), 'Future tests should prove value, not just plumbing.')

let deckValidation = null
if (toolNames.includes('betterpptx.deck.validate')) {
	deckValidation = await tool('betterpptx.deck.validate', { deckId }, sid, id++)
	const ignoredValidationCodes = new Set(['EMPTY_TEXT_BOX'])
	const issues = deckValidation.issues || []
	const blockingIssues = issues.filter(issue => {
		if (ignoredValidationCodes.has(issue.code)) return false
		if (/^Shape \d+$/.test(String(issue.shapeName || '')) && /^(ELEMENT_OFF_SLIDE_|ZERO_WIDTH|ZERO_HEIGHT)/.test(String(issue.code || ''))) return false
		return issue.severity === 'error'
	})
	deckValidation = {
		valid: deckValidation.valid,
		issueCount: deckValidation.issueCount,
		errorCount: deckValidation.errorCount,
		warningCount: deckValidation.warningCount,
		blockingIssueCount: blockingIssues.length,
		blockingIssues,
	}
}
const validation = await tool('betterpptx.deck.validate_narration', { deckId }, sid, id++)
if (!validation.ok) throw new Error(`validate_narration failed: ${validation.issues.join('; ')}`)
const saved = await tool('betterpptx.deck.save', { deckId, fileName: 'live-narration-smoke.pptx', ...(saveOutputDir ? { outputDir: saveOutputDir } : {}) }, sid, id++)
let buffer
if (saved.downloadUrl) {
	const dl = await fetch(saved.downloadUrl)
	if (!dl.ok) throw new Error(`download failed HTTP ${dl.status}`)
	buffer = Buffer.from(await dl.arrayBuffer())
} else if (saved.filePath) {
	const containerOutDir = process.env.BETTERPPTX_LIVE_CONTAINER_OUT_DIR || '/out'
	const hostOutDir = process.env.BETTERPPTX_LIVE_HOST_OUT_DIR || path.resolve('out')
	const normalized = saved.filePath.replaceAll('\\', '/')
	const localPath = normalized === containerOutDir
		? hostOutDir
		: normalized.startsWith(`${containerOutDir}/`)
			? path.join(hostOutDir, normalized.slice(containerOutDir.length + 1))
			: saved.filePath
	buffer = await fs.readFile(localPath)
} else {
	throw new Error(`save did not return downloadUrl or filePath: ${JSON.stringify(saved)}`)
}
const outDir = path.resolve('outputs', 'live-narration-smoke')
await fs.mkdir(outDir, { recursive: true })
const localFile = path.join(outDir, 'live-narration-smoke.pptx')
await fs.writeFile(localFile, buffer)
const zip = await JSZip.loadAsync(buffer)
const names = Object.keys(zip.files)
const media = names.filter(n => /^ppt\/media\/.+\.(wav|mp3|m4a)$/i.test(n))
const presProps = await zip.file('ppt/presProps.xml')?.async('string') || ''
const ok = media.length >= 4 && /showNarration="1"/.test(presProps) && /useTimings="1"/.test(presProps)
console.log(JSON.stringify({ ok, deckId, tools: toolNames.length, voices: voices.count, voice, provider: provider || 'default', deckValidation, validation, saved, localFile, media }, null, 2))
process.exit(ok ? 0 : 1)
