// Verify that a public BetterPPTX endpoint behaves as a product black box.
import * as fs from 'node:fs'

function readEnvFile(file) {
	if (!fs.existsSync(file)) return {}
	const env = {}
	for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
		const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*?)\s*$/)
		if (m) env[m[1]] = m[2]
	}
	return env
}

function resolveMcpUrl() {
	const explicit = process.argv[2]?.trim()
	if (explicit) return explicit
	const env = readEnvFile('deploy/production.env')
	if (process.env.BETTERPPTX_PUBLIC_MCP_URL) return process.env.BETTERPPTX_PUBLIC_MCP_URL
	if (env.BETTERPPTX_PUBLIC_MCP_URL) return env.BETTERPPTX_PUBLIC_MCP_URL
	const base = (env.BETTERPPTX_PUBLIC_BASE || '').replace(/\/+$/, '')
	const secret = env.BETTERPPTX_URL_SECRET
	const auth = env.BETTERPPTX_AUTH
	if (base && auth === 'none') return `${base}/mcp`
	if (base && secret) return `${base}/s/${secret}/mcp`
	console.error('Usage: node betterpptx/verify-blackbox-public.mjs <public-mcp-url>')
	process.exit(2)
}

function baseUrl(mcpUrl) {
	return String(mcpUrl).replace(/\/s\/[^/]+\/mcp$|\/mcp$/, '')
}

function redactUrl(url) {
	return String(url).replace(/\/s\/[^/]+\/mcp/g, '/s/<redacted>/mcp')
}

const MCP = resolveMcpUrl()
const BASE = baseUrl(MCP)
const H = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }
const OLD_PUBLIC_PREFIX = ['claude', 'pptx'].join('')
const OLD_PACKAGE_NAME = ['claude', 'pptx', 'mcp'].join('')
const BANNED = [
	new RegExp(`\\b${OLD_PUBLIC_PREFIX}`, 'i'),
	new RegExp(`\\b${OLD_PACKAGE_NAME}`, 'i'),
	/\bPptxGenJS\b/i,
	/\bnode\.js\b/i,
	/\bexpress\b/i,
	/\bdependency\b/i,
	/\bdependencies\b/i,
	/\bsource code\b/i,
	/\bcwd\b/i,
	/\bpid\b/i,
	/\bexecPath\b/i,
	/\bargv\b/i,
	/\blocal filesystem\b/i,
	/\bfilesystem path\b/i,
	/\bserver filesystem\b/i,
	/\bprocess metadata\b/i,
]
const BANNED_SCHEMA_KEYS = new Set([
	'pptxPath',
	'outputDir',
	'saveToPath',
	'sourcePath',
	'templatePath',
	'filePath',
])

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

function schemaKeyIssues(schema, trail = '') {
	const issues = []
	if (!schema || typeof schema !== 'object') return issues
	if (Array.isArray(schema)) {
		schema.forEach((item, i) => issues.push(...schemaKeyIssues(item, `${trail}[${i}]`)))
		return issues
	}
	for (const [key, value] of Object.entries(schema)) {
		if (BANNED_SCHEMA_KEYS.has(key)) issues.push(`${trail}.${key}`)
		issues.push(...schemaKeyIssues(value, trail ? `${trail}.${key}` : key))
	}
	return issues
}

function textIssues(value, context) {
	const text = typeof value === 'string' ? value : JSON.stringify(value)
	return BANNED.filter(rx => rx.test(text)).map(rx => `${context}: ${rx}`)
}

function fail(message, payload) {
	console.error('BLACKBOX VERIFY: FAIL -', message)
	if (payload) console.error(JSON.stringify(payload, null, 2))
	process.exit(1)
}

async function main() {
	console.log('MCP:', redactUrl(MCP))
	const healthRes = await fetch(`${BASE}/health`)
	const health = await body(healthRes)
	if (healthRes.status !== 200 || health?.status !== 'ok') fail('health did not return generic ok', health)
	if (textIssues(health, 'health').length) fail('health leaked banned terms', health)

	const toolsRes = await fetch(`${BASE}/tools`)
	const toolsPayload = await body(toolsRes)
	if (toolsRes.status !== 200 || !Array.isArray(toolsPayload?.tools)) fail('/tools failed', toolsPayload)
	const toolTextIssues = textIssues(toolsPayload, 'tools')
	if (toolTextIssues.length) fail('/tools leaked banned terms', toolTextIssues)
	if ((toolsPayload.tools || []).some(t => !String(t.name || '').startsWith('betterpptx.'))) fail('/tools contains non-betterpptx tool', toolsPayload.tools)

	const init = await rpc('initialize', {
		protocolVersion: '2024-11-05',
		clientInfo: { name: 'blackbox-verify', version: '1' },
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
	if (!listed.length) fail('tools/list returned no tools', list)
	if (listed.some(t => t.name === 'betterpptx.http.fetch')) fail('tools/list exposed generic http.fetch in public mode', listed.map(t => t.name))
	const listedTextIssues = textIssues(listed, 'tools/list')
	if (listedTextIssues.length) fail('tools/list leaked banned terms', listedTextIssues)
	const schemaIssues = listed.flatMap(t => schemaKeyIssues(t.inputSchema, t.name))
	if (schemaIssues.length) fail('tools/list exposed banned schema keys', schemaIssues.slice(0, 20))

	const status = await tool('betterpptx.status', {})
	if (!status.ok) fail('status failed', status)
	if (textIssues(status, 'status').length) fail('status leaked banned terms', status)

	const deck = await tool('betterpptx.deck.new', { title: 'Blackbox path guard' })
	if (!deck.ok) fail('deck.new failed', deck)
	const deckId = deck.data.deckId
	await tool('betterpptx.slide.add', { deckId, background: { color: 'FFFFFF' } })
	const blocked = await tool('betterpptx.slide.add_image', {
		deckId,
		slideIndex: 0,
		options: { path: 'C:\\private\\image.png', x: 1, y: 1, w: 2, h: 2 },
	})
	if (blocked.ok !== false || blocked.error?.code !== 'BLACK_BOX' || blocked.error?.recoverable !== true) {
		fail('local path request was not blocked with structured BLACK_BOX error', blocked)
	}

	const genericFetch = await tool('betterpptx.http.fetch', { url: 'http://169.254.169.254/latest/meta-data/' })
	if (genericFetch.ok !== false || genericFetch.error?.code !== 'BLACK_BOX') {
		fail('generic http.fetch was not blocked in public mode', genericFetch)
	}

	const metadataImage = await tool('betterpptx.slide.add_image', {
		deckId,
		slideIndex: 0,
		options: { path: 'http://169.254.169.254/latest/meta-data/', x: 1, y: 1, w: 2, h: 2 },
	})
	if (metadataImage.ok !== false || metadataImage.error?.code !== 'SAFE_FETCH_REFUSED' || metadataImage.error?.recoverable !== true) {
		fail('metadata-host image URL was not refused by safe fetch', metadataImage)
	}

	const privateImage = await tool('betterpptx.slide.add_image', {
		deckId,
		slideIndex: 0,
		options: { path: 'http://127.0.0.1/private.png', x: 1, y: 1, w: 2, h: 2 },
	})
	if (privateImage.ok !== false || privateImage.error?.code !== 'SAFE_FETCH_REFUSED' || privateImage.error?.recoverable !== true) {
		fail('private-IP image URL was not refused by safe fetch', privateImage)
	}

	console.log('BLACKBOX VERIFY: PASS')
}

main().catch(err => fail(err.message || String(err)))
