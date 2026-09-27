#!/usr/bin/env node
// Real-world MCP smoke: drive a public Streamable HTTP endpoint exactly as a
// remote AI client would, using only the semantic Authoring Excellence route.

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import JSZip from 'jszip'

const URL = (process.argv[2] || process.env.BETTERPPTX_LIVE_MCP_URL || '').trim()
if (!URL) {
	console.error('Usage: node betterpptx-mcp/smoke-live-narration.mjs <mcp-url>')
	process.exit(2)
}

const token = (process.env.BETTERPPTX_LIVE_TOKEN || '').trim()
const plan = process.env.BETTERPPTX_LIVE_PLAN || 'premium'
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
	const res = await fetch(URL, {
		method: 'POST',
		headers: sid ? { ...H, 'mcp-session-id': sid } : H,
		body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
	})
	const parsed = await body(res)
	if (!res.ok || parsed?.error) throw new Error(`${method}: HTTP ${res.status} ${JSON.stringify(parsed?.error || parsed)}`)
	return { parsed, sid: res.headers.get('mcp-session-id') || sid }
}

async function tool(name, args, sid, id) {
	const { parsed } = await rpc('tools/call', { name, arguments: args }, sid, id)
	const structured = parsed?.result?.structuredContent
	const content = parsed?.result?.content?.find(item => item.type === 'text')?.text
	const payload = structured || (content ? JSON.parse(content) : parsed?.result)
	if (!payload?.ok) throw new Error(`${name}: ${payload?.error?.message || JSON.stringify(payload)}`)
	return payload.data
}

const init = await rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name: 'narration-showcase-smoke', version: '3' }, capabilities: {} }, null, 1)
const sid = init.sid
await fetch(URL, { method: 'POST', headers: { ...H, 'mcp-session-id': sid }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) })

let id = 10
const capabilities = await tool('betterpptx.help.capabilities', { intent: 'a narrated product-quality showcase', deckType: 'new', detail: 'full' }, sid, id++)
const workflow = await tool('betterpptx.help.workflow', { intent: 'a narrated product-quality showcase', deckType: 'new', detail: 'full' }, sid, id++)
if (capabilities.authoringApi?.contractVersion !== 'authoring-excellence.api.v1' || workflow.authoringSurface !== 'mcp-generate-from-spec-only') {
	throw new Error('Public endpoint did not expose the semantic Authoring Excellence contract.')
}

const voice = process.env.BETTERPPTX_LIVE_VOICE || undefined
const narration = (script, cues = [], caption) => ({
	script,
	...(voice ? { voice } : {}),
	timingAuthority: 'narration-text',
	...(cues.length ? { cues } : {}),
	...(caption ? { captions: { enabled: true, items: [{ text: caption, atMs: 250, endMs: 4200 }] } } : {}),
})
const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Narrated MCP Product Showcase',
	authoringContract: {
		workflow: 'authoring-excellence-director-v1',
		level: 'deterministic',
		coordinateSystem: 'inches',
		layerModel: 'flat-object-array',
		objectIdentity: 'stable-names-required',
	},
	contentStory: {
		audience: 'presentation-system reviewers',
		outcome: 'Show that story, visual intent, narration, and validation form one governed workflow.',
		remember: 'The MCP turns semantic intent into a balanced, timed, package-safe PowerPoint.',
	},
	visualDesign: {
		world: 'Aurora verification surface',
		framing: 'Quiet, balanced product-proof composition.',
		contrast: 'high',
	},
	motionTime: {
		masterClock: 'narration-text',
		timingSource: 'measured narration media',
		syncPolicy: 'Text-led narration, autoplay, captions, and semantic cue timing.',
	},
	layout: 'LAYOUT_WIDE',
	slides: [
		{
			id: 'live-narration-s1', title: 'Narrated decks that move like product films', role: 'opener',
			message: 'Voice, timing, captions, and visual reveals are authored as one presentation system.', layoutIntent: 'title-body',
			content: [
				{ kind: 'title', name: 'hero-title', text: 'Narrated decks that move like product films' },
				{ kind: 'textBox', name: 'hero-copy', text: 'Voice, timing, captions, and visual reveals are authored as one presentation system through the MCP.', region: 'body' },
			],
			narration: narration('This narrated showcase is generated through the public MCP endpoint. It pairs real text to speech with a designed slide, timed captions, and package validation so the result feels like a product film instead of a plain test file.', [], 'A narrated deck should feel designed, timed, and intentional.'),
		},
		{
			id: 'live-narration-s2', title: 'From story text to synchronized show', role: 'content',
			message: 'The engine converts story text into audio and aligns semantic visual beats to the measured clock.', layoutIntent: 'two-column',
			content: [
				{ kind: 'callout', name: 'step-story', text: 'Story → voice', region: 'left' },
				{ kind: 'callout', name: 'step-proof', text: 'Media → timing → captions', region: 'right' },
			],
			narration: narration('The workflow is not simply attaching a sound file. The engine converts story text to voice, embeds the audio, aligns semantic visual beats to the measured clock, and verifies the resulting PowerPoint package.', [
				{ atMs: 650, target: 'step-story', type: 'emphasis', effect: 'pulse' },
				{ atMs: 1650, target: 'step-proof', type: 'emphasis', effect: 'pulse' },
			], 'Narration, visual intent, and validation are one workflow.'),
		},
		{
			id: 'live-narration-s3', title: 'Quality gates turn demos into product moments', role: 'proof',
			message: 'A generated narration deck carries story, design, motion, and hard validation evidence.', layoutIntent: 'metric-grid',
			content: [
				{ kind: 'callout', name: 'metric-story', text: 'Story: one message', region: 'metric-grid' },
				{ kind: 'callout', name: 'metric-design', text: 'Design: one system', region: 'metric-grid' },
				{ kind: 'callout', name: 'metric-proof', text: 'Proof: PowerPoint + XML', region: 'metric-grid' },
			],
			narration: narration('The quality bar is explicit. A generated narration deck should have a story, a visual system, cue-timed motion, and hard validation evidence. That is the difference between a working feature and a convincing customer demo.', [
				{ atMs: 500, target: 'metric-story', type: 'emphasis', effect: 'pulse' },
				{ atMs: 1150, target: 'metric-design', type: 'emphasis', effect: 'pulse' },
				{ atMs: 1800, target: 'metric-proof', type: 'emphasis', effect: 'pulse' },
			], 'The design gate makes every narration test customer-demo ready.'),
		},
		{
			id: 'live-narration-s4', title: 'Real endpoint. Real voice. Governed output.', role: 'closer',
			message: 'The same semantic contract drives narration, validation, and the saved PPTX artifact.', layoutIntent: 'title-body',
			content: [
				{ kind: 'title', name: 'final-title', text: 'Real endpoint. Real voice. Governed output.' },
				{ kind: 'textBox', name: 'final-copy', text: 'The public MCP endpoint synthesizes narration, measures timing, validates the package, and saves a downloadable PowerPoint.', region: 'body' },
			],
			narration: narration('This is the bar for future narration demos. The endpoint should prove speech, timing, captions, visual quality, package health, and PowerPoint compatibility in one coherent deck.', [], 'Future tests should prove value, not just plumbing.'),
		},
	],
}

const request = { spec, phase: 'dryRun', commitMode: 'createNew', detail: 'full', plan }
const dryRun = await tool('betterpptx.deck.generate_from_spec', request, sid, id++)
const deck = await tool('betterpptx.deck.generate_from_spec', { ...request, phase: 'commit' }, sid, id++)
const deckId = deck.deckId
const validation = await tool('betterpptx.deck.validate_narration', { deckId }, sid, id++)
const packageValidation = await tool('betterpptx.deck.validate', { deckId }, sid, id++)
const designValidation = await tool('betterpptx.deck.validate_design', { deckId }, sid, id++)
const accessibilityValidation = await tool('betterpptx.deck.validate_accessibility', { deckId }, sid, id++)
await tool('betterpptx.deck.validate_quality', { deckId }, sid, id++)
const saved = await tool('betterpptx.deck.save', { deckId, fileName: 'live-narration-smoke.pptx' }, sid, id++)

let buffer = null
if (saved.downloadUrl) {
	const dl = await fetch(saved.downloadUrl)
	if (!dl.ok) throw new Error(`download failed HTTP ${dl.status}`)
	buffer = Buffer.from(await dl.arrayBuffer())
}
if (!buffer) throw new Error('Public save did not return a download artifact.')
const outDir = path.resolve('outputs', 'live-narration-smoke')
await fs.mkdir(outDir, { recursive: true })
const localFile = path.join(outDir, 'live-narration-smoke.pptx')
await fs.writeFile(localFile, buffer)
const zip = await JSZip.loadAsync(buffer)
const names = Object.keys(zip.files)
const media = names.filter(n => /^ppt\/media\/.+\.(wav|mp3|m4a)$/i.test(n))
const presProps = await zip.file('ppt/presProps.xml')?.async('string') || ''
const ok = media.length >= 4 && /showNarration="1"/.test(presProps) && /useTimings="1"/.test(presProps)
console.log(JSON.stringify({ ok, route: 'betterpptx.deck.generate_from_spec', deckId, dryRunDigest: dryRun.planDigest, capabilitiesContract: capabilities.authoringApi.contractVersion, workflowSurface: workflow.authoringSurface, validation, packageValidation, designValidation, accessibilityValidation, saved: { downloadName: saved.downloadName, bytes: saved.bytes, slideCount: saved.slideCount }, localFile, media }, null, 2))
process.exit(ok ? 0 : 1)
