#!/usr/bin/env node

// Verify the public HTTP MCP boundary for the spec-first speed/privacy profile:
// tools/list hides direct primitives, tools/call blocks them, and compact spec
// dry-runs are materially smaller than full call-plan dry-runs.

function resolveMcpUrl() {
	const explicit = process.argv[2]?.trim()
	if (explicit) return explicit
	console.error('Usage: node betterpptx-mcp/verify-spec-speed-privacy-http-v1.mjs <public-mcp-url>')
	process.exit(2)
}

function redactUrl(url) {
	return String(url).replace(/\/s\/[^/]+\/mcp/g, '/s/<redacted>/mcp')
}

const MCP = resolveMcpUrl()
const AUTHORIZATION = process.env.BETTERPPTX_AUTHORIZATION || (process.env.BETTERPPTX_TOKEN ? `Bearer ${process.env.BETTERPPTX_TOKEN}` : '')
const H = {
	'Content-Type': 'application/json',
	Accept: 'application/json, text/event-stream',
	...(AUTHORIZATION ? { Authorization: AUTHORIZATION } : {}),
}

const sse = text => {
	for (const line of String(text).split('\n')) {
		const m = line.match(/^data:\s*(.+)$/)
		if (m) return JSON.parse(m[1])
	}
	return null
}

const body = async res => {
	const ct = res.headers.get('content-type') || ''
	const raw = await res.text()
	return ct.includes('event-stream') ? sse(raw) : (raw ? JSON.parse(raw) : null)
}

let SID = null
async function rpc(method, params) {
	const res = await fetch(MCP, {
		method: 'POST',
		headers: { ...H, ...(SID ? { 'mcp-session-id': SID } : {}) },
		body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
	})
	if (!SID) SID = res.headers.get('mcp-session-id')
	return body(res)
}

async function tool(name, args) {
	const response = await rpc('tools/call', { name, arguments: args })
	return JSON.parse(response?.result?.content?.[0]?.text || '{}')
}

function fail(message, payload) {
	console.error('SPEC SPEED PRIVACY HTTP VERIFY: FAIL -', message)
	if (payload) console.error(JSON.stringify(payload, null, 2))
	process.exit(1)
}

function byteLen(value) {
	return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

function collectStrings(value, out = []) {
	if (typeof value === 'string') out.push(value)
	else if (Array.isArray(value)) value.forEach(item => collectStrings(item, out))
	else if (value && typeof value === 'object') Object.values(value).forEach(item => collectStrings(item, out))
	return out
}

function textLeaks(value) {
	const strings = collectStrings(value)
	const patterns = [
		/(^|[^A-Za-z0-9_])[A-Za-z]:[\\/](?![\\/])/,
		/\/Users\//,
		/\/tmp\//,
		/\bnode_modules\b/i,
		/\bengine\.mjs\b/i,
		/\bspec-compiler\.mjs\b/i,
		/\bPptxGenJS\b/i,
		/<(?:p|a|r|pkg):/i,
	]
	return patterns.filter(rx => strings.some(text => rx.test(text))).map(String)
}

function okResult(label, result) {
	if (!result?.ok) fail(`${label} failed`, result)
	return result.data
}

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'HTTP Spec Speed Privacy Verification',
	authoringContract: {
		level: 'deterministic',
		coordinateSystem: 'inches',
		layerModel: 'flat-object-array',
		textPolicy: 'shape is geometry-only; use textBox or textShape for text',
	},
	sections: [],
	assets: [],
	data: [],
	validation: { profile: 'standard' },
	slides: [{
		id: 'privacy-http-1',
		title: 'Compact Public Spec',
		layoutIntent: 'title-body',
		content: [
			{ kind: 'title', name: 'title', text: 'Compact public spec' },
			{ kind: 'textBox', name: 'body', text: 'The public HTTP path exposes a single JSON spec, compact summaries, and opaque handles.' },
		],
	}],
}

async function main() {
	console.log('MCP:', redactUrl(MCP))
	const init = await rpc('initialize', {
		protocolVersion: '2024-11-05',
		clientInfo: { name: 'spec-speed-privacy-http-verify', version: '1' },
		capabilities: {},
	})
	console.log('initialize ->', init?.result?.serverInfo?.name, 'session', SID ? 'yes' : 'no')
	await fetch(MCP, {
		method: 'POST',
		headers: { ...H, 'mcp-session-id': SID },
		body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
	})

	const list = await rpc('tools/list', {})
	const listed = list?.result?.tools || []
	const publicNames = listed.map(tool => tool.name)
	for (const required of [
		'betterpptx.deck.generate_from_spec',
		'betterpptx.deck.export_spec',
		'betterpptx.deck.validate',
		'betterpptx.deck.save',
	]) {
		if (!publicNames.includes(required)) fail('spec-first tools/list is missing required tool', { required, publicNames })
	}
	const visiblePrimitives = [
		'betterpptx.slide.add_text',
		'betterpptx.slide.add_shape',
		'betterpptx.slide.add_media',
		'betterpptx.slide.add_avatar_narration',
		'betterpptx.slide.passthrough_xml',
	].filter(name => publicNames.includes(name))
	if (visiblePrimitives.length) fail('spec-first tools/list exposed direct generation primitives', { visiblePrimitives })
	const listLeaks = textLeaks(listed)
	if (listLeaks.length) fail('tools/list leaked private implementation details', { leaks: listLeaks })

	const summary = okResult('summary dryRun', await tool('betterpptx.deck.generate_from_spec', {
		spec,
		phase: 'dryRun',
		detail: 'summary',
	}))
	const full = okResult('full dryRun', await tool('betterpptx.deck.generate_from_spec', {
		spec,
		phase: 'dryRun',
		detail: 'full',
		includeCallPlan: true,
	}))
	if (summary.capabilityMatrix?.detail !== 'summary' || !summary.capabilityMatrix?.counts) {
		fail('summary dryRun did not return compact capability matrix', summary.capabilityMatrix)
	}
	if (!Array.isArray(full.capabilityMatrix?.specNative) || !full.operations?.length) {
		fail('full dryRun did not return full capability matrix and call plan', full)
	}
	const summaryBytes = byteLen(summary)
	const fullBytes = byteLen(full)
	if (!(summaryBytes < fullBytes)) fail('summary response is not smaller than full response', { summaryBytes, fullBytes })
	const resultLeaks = [...textLeaks(summary), ...textLeaks(full)]
	if (resultLeaks.length) fail('public spec dry-run leaked private implementation details', { leaks: resultLeaks })

	const blockedPrimitive = await tool('betterpptx.slide.add_text', {
		deckId: 'deck_private_surface_probe',
		slideIndex: 0,
		text: 'should be blocked',
		options: { x: 0.5, y: 0.5, w: 2, h: 0.4 },
	})
	if (blockedPrimitive.ok !== false || blockedPrimitive.error?.code !== 'BLACK_BOX') {
		fail('spec-first public mode did not block direct primitive call', blockedPrimitive)
	}

	console.log('SPEC SPEED PRIVACY HTTP VERIFY: PASS')
	console.log(JSON.stringify({
		publicToolCount: publicNames.length,
		summaryBytes,
		fullBytes,
		reductionPct: Math.round((1 - summaryBytes / fullBytes) * 1000) / 10,
	}, null, 2))
}

main().catch(err => fail(err.message || String(err)))
