// Private deployed staging stress harness for the Cloud Run MCP service.
// It exercises the public black-box surface through Cloud Run IAM, then runs
// concurrent create/edit/save/download sessions without printing secrets or
// signed artifact URLs.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const DEFAULT_SESSIONS = 3
const DEFAULT_ITERATIONS = 2

function parseArgs(argv) {
	const opts = {
		mcpUrl: '',
		sessions: DEFAULT_SESSIONS,
		iterations: DEFAULT_ITERATIONS,
		requireMissionControl: false,
		requireActivation: false,
		envFile: '',
		useGcloudAuth: false,
		authorization: '',
	}
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (!arg.startsWith('--') && !opts.mcpUrl) {
			opts.mcpUrl = arg
			continue
		}
		if (arg === '--sessions' && argv[i + 1]) { opts.sessions = Math.max(1, Number(argv[++i]) || DEFAULT_SESSIONS); continue }
		if (arg === '--iterations' && argv[i + 1]) { opts.iterations = Math.max(1, Number(argv[++i]) || DEFAULT_ITERATIONS); continue }
		if (arg === '--require-mission-control') { opts.requireMissionControl = true; continue }
		if (arg === '--require-activation') { opts.requireActivation = true; continue }
		if (arg === '--env-file' && argv[i + 1]) { opts.envFile = argv[++i]; continue }
		if (arg === '--use-gcloud-auth' || arg === '--identity-token') { opts.useGcloudAuth = true; continue }
		if ((arg === '--authorization' || arg === '--auth-header') && argv[i + 1]) { opts.authorization = argv[++i]; continue }
		if (arg === '--help' || arg === '-h') {
			console.log('Usage: node betterpptx-mcp/verify-deployed-staging-stress.mjs <mcp-or-base-url> [--use-gcloud-auth] [--sessions 3] [--iterations 2] [--require-mission-control] [--env-file <path>] [--require-activation]')
			process.exit(0)
		}
		throw new Error(`Unknown argument: ${arg}`)
	}
	return opts
}

function loadEnvFile(filePath) {
	if (!filePath) return
	const resolved = String(filePath)
	if (!fs.existsSync(resolved)) throw new Error(`Env file not found: ${resolved}`)
	const text = fs.readFileSync(resolved, 'utf8')
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim()
		if (!line || line.startsWith('#')) continue
		const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
		if (!match) continue
		const key = match[1]
		let value = match[2].trim()
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
		if (!process.env[key]) process.env[key] = value
	}
}

function normalizeMcpUrl(value) {
	let url = String(value || process.env.BETTERPPTX_STAGING_MCP_URL || process.env.BETTERPPTX_PUBLIC_MCP_URL || '').trim()
	if (!url) throw new Error('Missing MCP URL. Pass <mcp-or-base-url> or set BETTERPPTX_STAGING_MCP_URL.')
	url = url.replace(/\/+$/, '')
	if (!/\/mcp$/i.test(url)) url += '/mcp'
	return url
}

function baseUrl(mcpUrl) {
	return String(mcpUrl).replace(/\/s\/[^/]+\/mcp$|\/mcp$/i, '')
}

function redactUrl(url) {
	return String(url)
		.replace(/\/s\/[^/]+\/mcp/gi, '/s/<redacted>/mcp')
		.replace(/([?&](?:X-Goog-Signature|X-Goog-Credential|X-Goog-Security-Token|Signature|Expires|GoogleAccessId)=)[^&\s"']+/gi, '$1<redacted>')
}

function authValue(opts) {
	const explicit = opts.authorization ||
		process.env.BETTERPPTX_HTTP_AUTHORIZATION ||
		process.env.BETTERPPTX_PROXY_AUTH ||
		process.env.BETTERPPTX_CLOUD_RUN_AUTHORIZATION ||
		(process.env.BETTERPPTX_IDENTITY_TOKEN ? `Bearer ${process.env.BETTERPPTX_IDENTITY_TOKEN}` : '')
	if (explicit) return explicit.startsWith('Bearer ') ? explicit : `Bearer ${explicit}`
	if (!opts.useGcloudAuth) return ''
	const command = process.platform === 'win32' ? 'cmd.exe' : 'gcloud'
	const args = process.platform === 'win32' ? ['/c', 'gcloud', 'auth', 'print-identity-token'] : ['auth', 'print-identity-token']
	const token = execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
	if (!token) throw new Error('gcloud did not return an identity token')
	return `Bearer ${token}`
}

function redacted(value) {
	return JSON.stringify(value, null, 2).replace(/https?:\/\/[^\s"']+/g, match => redactUrl(match))
}

function fail(message, payload) {
	console.error('DEPLOYED STAGING STRESS: FAIL -', message)
	if (payload !== undefined) console.error(redacted(payload))
	process.exit(1)
}

function sse(text) {
	for (const line of String(text).split('\n')) {
		const m = line.match(/^data:\s*(.+)$/)
		if (m) return JSON.parse(m[1])
	}
	return null
}

async function responseBody(res) {
	const ct = res.headers.get('content-type') || ''
	const raw = await res.text()
	if (!raw) return null
	if (ct.includes('event-stream')) return sse(raw)
	if (ct.includes('json')) return JSON.parse(raw)
	try { return JSON.parse(raw) } catch { return { raw: raw.slice(0, 500) } }
}

function fetchHeaders(auth, extra = {}) {
	return {
		...(auth ? { Authorization: auth } : {}),
		...extra,
	}
}

async function fetchJson(url, auth, options = {}) {
	const res = await fetch(url, {
		...options,
		headers: fetchHeaders(auth, options.headers || {}),
	})
	const data = await responseBody(res)
	return { res, data }
}

function sameOriginHeaders(url, base, auth) {
	try {
		return new URL(url).origin === new URL(base).origin ? fetchHeaders(auth) : {}
	} catch {
		return {}
	}
}

async function createRpc(mcpUrl, auth, name) {
	let sid = null
	async function rpc(method, params = {}) {
		const res = await fetch(mcpUrl, {
			method: 'POST',
			headers: fetchHeaders(auth, {
				'Content-Type': 'application/json',
				Accept: 'application/json, text/event-stream',
				...(sid ? { 'mcp-session-id': sid } : {}),
			}),
			body: JSON.stringify({ jsonrpc: '2.0', id: `${Date.now()}-${Math.random()}`, method, params }),
		})
		if (!sid) sid = res.headers.get('mcp-session-id')
		const data = await responseBody(res)
		if (!res.ok) throw new Error(`${method} HTTP ${res.status}: ${JSON.stringify(data)?.slice(0, 300)}`)
		if (data?.error) throw new Error(`${method} RPC ${data.error.code}: ${data.error.message}`)
		return data
	}
	const init = await rpc('initialize', {
		protocolVersion: '2024-11-05',
		clientInfo: { name, version: '1' },
		capabilities: {},
	})
	if (!sid) throw new Error('initialize did not return mcp-session-id')
	await fetch(mcpUrl, {
		method: 'POST',
		headers: fetchHeaders(auth, {
			'Content-Type': 'application/json',
			Accept: 'application/json, text/event-stream',
			'mcp-session-id': sid,
		}),
		body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }),
	})
	async function tool(toolName, args = {}) {
		const response = await rpc('tools/call', { name: toolName, arguments: args })
		return JSON.parse(response?.result?.content?.[0]?.text || '{}')
	}
	return { rpc, tool, sid, serverName: init?.result?.serverInfo?.name || 'unknown' }
}

function requireOk(label, payload) {
	if (!payload?.ok) fail(`${label} failed`, payload)
	return payload.data || {}
}

function requireError(label, payload, code) {
	if (payload?.ok !== false || payload?.error?.code !== code) fail(`${label} did not return ${code}`, payload)
	return payload.error
}

const BANNED_TEXT = [
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

function textIssues(value, context) {
	const text = typeof value === 'string' ? value : JSON.stringify(value)
	return BANNED_TEXT.filter(rx => rx.test(text)).map(rx => `${context}: ${rx}`)
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

async function verifyBlackBoxSurface({ mcpUrl, base, auth }) {
	const health = await fetchJson(`${base}/health`, auth)
	if (health.res.status !== 200 || health.data?.status !== 'ok') fail('/health did not return generic ok', { status: health.res.status, body: health.data })
	const healthIssues = textIssues(health.data, 'health')
	if (healthIssues.length) fail('/health leaked black-box-banned terms', healthIssues)

	const tools = await fetchJson(`${base}/tools`, auth)
	if (tools.res.status !== 200 || !Array.isArray(tools.data?.tools)) fail('/tools failed', { status: tools.res.status, body: tools.data })
	const toolIssues = textIssues(tools.data, 'tools')
	if (toolIssues.length) fail('/tools leaked black-box-banned terms', toolIssues)
	if (tools.data.tools.some(t => !String(t.name || '').startsWith('betterpptx.'))) fail('/tools contains a non-BetterPPTX tool', tools.data.tools)

	const client = await createRpc(mcpUrl, auth, 'deployed-staging-blackbox')
	const list = await client.rpc('tools/list', {})
	const listed = list?.result?.tools || []
	if (!listed.length) fail('tools/list returned no tools', list)
	if (listed.some(t => t.name === 'betterpptx.http.fetch')) fail('tools/list exposed generic http.fetch', listed.map(t => t.name))
	const listedIssues = textIssues(listed, 'tools/list')
	if (listedIssues.length) fail('tools/list leaked black-box-banned terms', listedIssues)
	const schemaIssues = listed.flatMap(t => schemaKeyIssues(t.inputSchema, t.name))
	if (schemaIssues.length) fail('tools/list exposed banned schema keys', schemaIssues.slice(0, 20))

	const status = await client.tool('betterpptx.status', {})
	requireOk('betterpptx.status', status)
	if (textIssues(status, 'status').length) fail('betterpptx.status leaked black-box-banned terms', status)

	const deck = requireOk('deck.new for black-box guards', await client.tool('betterpptx.deck.new', { title: 'Black-box guard' }))
	requireOk('slide.add for black-box guards', await client.tool('betterpptx.slide.add', { deckId: deck.deckId, background: { color: 'FFFFFF' } }))
	requireError('local image path guard', await client.tool('betterpptx.slide.add_image', {
		deckId: deck.deckId,
		slideIndex: 0,
		options: { path: 'C:\\private\\image.png', x: 1, y: 1, w: 2, h: 2 },
	}), 'BLACK_BOX')
	requireError('generic fetch guard', await client.tool('betterpptx.http.fetch', {
		url: 'http://169.254.169.254/latest/meta-data/',
	}), 'BLACK_BOX')
	requireError('private-IP media fetch guard', await client.tool('betterpptx.slide.add_image', {
		deckId: deck.deckId,
		slideIndex: 0,
		options: { path: 'http://127.0.0.1/private.png', x: 1, y: 1, w: 2, h: 2 },
	}), 'SAFE_FETCH_REFUSED')
	return { toolCount: listed.length, serverName: client.serverName }
}

async function maybeActivate(tool, sessionIndex, { requireActivation = false } = {}) {
	let key = String(process.env.BETTERPPTX_VERIFY_ACTIVATION_KEY || '').trim()
	if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) key = key.slice(1, -1)
	if (!key && requireActivation) {
		fail('Activation key is required for deployed billing stress. Set BETTERPPTX_VERIFY_ACTIVATION_KEY or pass --env-file with the private staging billing env.', { requireActivation })
	}
	if (!key) return null
	return requireOk('auth.activate_key', await tool('betterpptx.auth.activate_key', {
		key,
		provider: process.env.BETTERPPTX_VERIFY_ACTIVATION_PROVIDER || 'auto',
		idempotencyKey: `deployed-stress-${sessionIndex}-activate`,
	}))
}

async function verifyDownload(downloadUrl, base, auth, expectedBytes) {
	const res = await fetch(downloadUrl, {
		headers: sameOriginHeaders(downloadUrl, base, auth),
	})
	const bytes = Buffer.from(await res.arrayBuffer())
	if (res.status !== 200 || bytes.length < 1000 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
		fail('download did not return a PPTX zip', { status: res.status, bytes: bytes.length, url: redactUrl(downloadUrl) })
	}
	if (expectedBytes && Math.abs(bytes.length - expectedBytes) > 8) {
		fail('download byte count differed from deck.save metadata', { expectedBytes, actualBytes: bytes.length })
	}
	return bytes.length
}

async function runWorkSession({ mcpUrl, base, auth, sessionIndex, iterations, requireActivation }) {
	const client = await createRpc(mcpUrl, auth, `deployed-staging-stress-${sessionIndex}`)
	await maybeActivate(client.tool, sessionIndex, { requireActivation })
	let savedDecks = 0
	let downloadedBytes = 0
	for (let i = 0; i < iterations; i++) {
		const prefix = `ds${sessionIndex}-i${i}`
		requireOk('auth.status', await client.tool('betterpptx.auth.status', {}))
		const deckArgs = { title: `Deployed staging stress ${prefix}`, layout: 'LAYOUT_WIDE', idempotencyKey: `${prefix}-deck` }
		const deck = requireOk('deck.new', await client.tool('betterpptx.deck.new', deckArgs))
		const deckReplay = requireOk('deck.new replay', await client.tool('betterpptx.deck.new', deckArgs))
		if (deck.deckId !== deckReplay.deckId || deckReplay.idempotentReplay !== true) fail('deck.new replay mismatch', { deck, deckReplay })
		const deckId = deck.deckId

		const slide1 = requireOk('slide.add 1', await client.tool('betterpptx.slide.add', {
			deckId,
			notes: `Operator stress slide ${prefix}`,
			background: { color: '0B1020' },
			idempotencyKey: `${prefix}-slide-1`,
		}))
		const slide1Replay = requireOk('slide.add 1 replay', await client.tool('betterpptx.slide.add', {
			deckId,
			notes: `Operator stress slide ${prefix}`,
			background: { color: '0B1020' },
			idempotencyKey: `${prefix}-slide-1`,
		}))
		if (slide1Replay.idempotentReplay !== true) fail('slide.add replay marker missing', slide1Replay)

		requireOk('slide.add_text title', await client.tool('betterpptx.slide.add_text', {
			deckId,
			slideIndex: slide1.slideIndex,
			text: `Staging stress ${prefix}`,
			options: { x: 0.7, y: 0.5, w: 7.4, h: 0.6, fontSize: 28, bold: true, color: 'FFFFFF', objectName: `${prefix}-title` },
			idempotencyKey: `${prefix}-title`,
		}))
		const titleReplay = requireOk('slide.add_text title replay', await client.tool('betterpptx.slide.add_text', {
			deckId,
			slideIndex: slide1.slideIndex,
			text: `Staging stress ${prefix}`,
			options: { x: 0.7, y: 0.5, w: 7.4, h: 0.6, fontSize: 28, bold: true, color: 'FFFFFF', objectName: `${prefix}-title` },
			idempotencyKey: `${prefix}-title`,
		}))
		if (titleReplay.idempotentReplay !== true) fail('slide.add_text replay marker missing', titleReplay)

		requireOk('slide.add_shape', await client.tool('betterpptx.slide.add_shape', {
			deckId,
			slideIndex: slide1.slideIndex,
			shapeName: 'roundRect',
			text: 'private staging',
			options: { x: 0.8, y: 1.6, w: 3.0, h: 0.8, fill: { color: '22D3EE' }, line: { color: '0E7490', width: 1 }, objectName: `${prefix}-badge` },
			textOptions: { fontSize: 16, bold: true, color: '08111F', align: 'center', valign: 'mid' },
			idempotencyKey: `${prefix}-shape`,
		}))
		requireOk('slide.add_chart', await client.tool('betterpptx.slide.add_chart', {
			deckId,
			slideIndex: slide1.slideIndex,
			chartType: 'bar',
			data: [{ name: 'Runs', labels: ['start', 'edit', 'save'], values: [2, 5, 8] }],
			options: { x: 6.4, y: 1.2, w: 5.6, h: 2.7, showTitle: true, title: 'Stress path', chartColors: ['22D3EE'] },
			idempotencyKey: `${prefix}-chart`,
		}))

		const slide2 = requireOk('slide.add 2', await client.tool('betterpptx.slide.add', {
			deckId,
			background: { color: '111827' },
			transition: { type: 'morph', option: 'byObject', duration: 700 },
			idempotencyKey: `${prefix}-slide-2`,
		}))
		requireOk('slide.add_table', await client.tool('betterpptx.slide.add_table', {
			deckId,
			slideIndex: slide2.slideIndex,
			rows: [
				[{ text: 'Check' }, { text: 'Result' }],
				[{ text: 'black-box' }, { text: 'ok' }],
				[{ text: 'download' }, { text: 'ok' }],
			],
			options: { x: 1.0, y: 1.0, w: 6.4, h: 1.7, colW: [2.4, 2.8], border: { color: '334155', width: 1 }, fill: { color: 'F8FAFC' }, fontSize: 12 },
			idempotencyKey: `${prefix}-table`,
		}))
		requireOk('slide.add_notes', await client.tool('betterpptx.slide.add_notes', {
			deckId,
			slideIndex: slide2.slideIndex,
			notes: `Stress notes ${prefix}`,
			idempotencyKey: `${prefix}-notes`,
		}))

		const summary = requireOk('deck.summary', await client.tool('betterpptx.deck.summary', { deckId }))
		if (summary.slideCount !== 2) fail('unexpected slide count before save', summary)
		const inspected = requireOk('slide.inspect', await client.tool('betterpptx.slide.inspect', { deckId, slideIndex: slide1.slideIndex }))
		if (inspected.objectCount < 3) fail('unexpected object count before save', inspected)

		const saveArgs = { deckId, fileName: `deployed-staging-stress-${prefix}.pptx`, idempotencyKey: `${prefix}-save` }
		const saved = requireOk('deck.save', await client.tool('betterpptx.deck.save', saveArgs))
		const savedReplay = requireOk('deck.save replay', await client.tool('betterpptx.deck.save', saveArgs))
		if (!saved.downloadUrl || saved.downloadUrl !== savedReplay.downloadUrl || savedReplay.idempotentReplay !== true) {
			fail('deck.save replay mismatch', { saved, savedReplay })
		}
		downloadedBytes += await verifyDownload(saved.downloadUrl, base, auth, saved.bytes)
		savedDecks += 1
	}
	return { sessionIndex, savedDecks, downloadedBytes }
}

async function verifyMissionControl({ base, auth, required }) {
	const result = await fetchJson(`${base}/ops/mission-control/data`, auth)
	if (result.res.status === 404 && !required) return { enabled: false, status: 404 }
	if (result.res.status !== 200) fail('Mission Control data endpoint failed', { status: result.res.status, body: result.data })
	const allowedModes = new Set(['MC1_READ_ONLY', 'MC2_OWNER_SECRET_CONTROLS'])
	if (!allowedModes.has(result.data?.mode) || !Array.isArray(result.data?.gates)) fail('Mission Control payload was not recognized dashboard data', result.data)
	const editStateGate = result.data.gates.find(gate => gate?.id === 'cross-instance-state')
	if (!editStateGate || editStateGate.status !== 'ok') fail('Mission Control edit-state guard is not green', editStateGate || result.data.gates)
	const issues = textIssues(result.data, 'mission-control')
	if (issues.length) fail('Mission Control leaked black-box-banned terms', issues)
	return {
		enabled: true,
		status: 200,
		toolCalls: result.data.metrics?.toolCalls || 0,
		downloads: result.data.metrics?.downloads || 0,
		gates: result.data.gates.length,
	}
}

async function main() {
	const opts = parseArgs(process.argv.slice(2))
	loadEnvFile(opts.envFile)
	const mcpUrl = normalizeMcpUrl(opts.mcpUrl)
	const base = baseUrl(mcpUrl)
	const auth = authValue(opts)
	console.log(`DEPLOYED STAGING STRESS: target=${redactUrl(mcpUrl)} sessions=${opts.sessions} iterations=${opts.iterations} auth=${auth ? 'yes' : 'no'}`)
	const blackBox = await verifyBlackBoxSurface({ mcpUrl, base, auth })
	console.log(`black-box -> PASS tools=${blackBox.toolCount} server=${blackBox.serverName}`)
	const work = await Promise.all(Array.from({ length: opts.sessions }, (_, i) => runWorkSession({
		mcpUrl,
		base,
		auth,
		sessionIndex: i + 1,
		iterations: opts.iterations,
		requireActivation: opts.requireActivation,
	})))
	const mc = await verifyMissionControl({ base, auth, required: opts.requireMissionControl })
	console.log(`mission-control -> ${mc.enabled ? `PASS toolCalls=${mc.toolCalls} downloads=${mc.downloads} gates=${mc.gates}` : 'SKIP disabled'}`)
	const saved = work.reduce((sum, item) => sum + item.savedDecks, 0)
	const bytes = work.reduce((sum, item) => sum + item.downloadedBytes, 0)
	console.log(`DEPLOYED STAGING STRESS: PASS sessions=${opts.sessions} iterations=${opts.iterations} savedDecks=${saved} downloadedBytes=${bytes}`)
}

main().catch(err => fail(err.message || String(err)))
