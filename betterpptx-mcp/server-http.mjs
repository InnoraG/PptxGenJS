// betterpptx — HTTP / Streamable-HTTP transport for remote MCP hosts.
//
// This lets remote MCP clients connect to the same server you'd run locally
// over stdio. It implements the MCP Streamable HTTP
// transport spec: POST /mcp for client→server requests, GET /mcp for server→
// client SSE streams, DELETE /mcp to close a session.
//
// Auth model:
//   Hosted public product: public /mcp connector, free tier needs no endpoint key,
//   premium features are gated by betterpptx.auth.activate_key.
//   Private/self-host deployments: optional Bearer token or URL-path secret.
//
// Sessions: STATEFUL. Each MCP session gets its own transport. All sessions
// share the same underlying engine, but deck IDs are random UUIDs so cross-
// session leakage is effectively impossible.

import { randomUUID, randomBytes } from 'node:crypto'
import * as http from 'node:http'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import express from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

import { createBetterPptxMcpServer } from './server.mjs'
import { setDownloadConfig, getEngineStats } from './engine.mjs'
import { TOOLS } from './tools.mjs'
import { BETTERPPTX_BRAND, BETTERPPTX_PRODUCT, BETTERPPTX_SERVER_NAME } from './branding.mjs'
import { createTraceId, getLoggerInfo, logEvent } from './logger.mjs'
import { isPublicBlackBoxMode, publicToolList } from './blackbox.mjs'
import { artifactTtlMs } from './storage/artifact-store.mjs'
import { recordDownloadTelemetry } from './telemetry.mjs'
import { handleDodoWebhookHttp } from './billing/webhooks.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Minimal MIME map for the download route (covers what deck.save / io.write_file emit).
const MIME_BY_EXT = {
	pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	pptm: 'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
	pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
	gif: 'image/gif', svg: 'image/svg+xml', mp4: 'video/mp4', json: 'application/json',
}
function mimeFor(name) { return MIME_BY_EXT[(name.split('.').pop() || '').toLowerCase()] || 'application/octet-stream' }

function escapeHtml(s) {
	return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// Human-facing landing page served on GET / when a browser opens the endpoint.
// Programmatic/MCP clients still get JSON. It stays product-facing only: what
// this is, the exact connector URL, and how to add it to common MCP clients.
function renderLandingPage({ connectorUrl, toolCount, authMode }) {
	const url = escapeHtml(connectorUrl)
	const tools = Number.isFinite(toolCount) ? toolCount : ''
	const authHint = authMode === 'none'
		? 'No endpoint key is needed for the free connector. Premium features are activated inside the AI chat with <code>betterpptx.auth.activate_key</code> when the user provides a license key.'
		: authMode === 'path'
			? 'This private/self-host connector uses a URL-path secret. Keep the full URL private and rotate the secret if it leaks.'
			: 'This private/self-host connector expects a Bearer token in an <code>Authorization</code> header. Use it with header-capable desktop, CLI, or SDK clients.'
	const authStep = authMode === 'bearer'
		? 'Paste the URL, pick <b>Bearer</b> authentication, and enter your token.'
		: 'Paste the URL above. If the client asks for authentication, choose <b>None</b> or <b>No authentication</b>.'
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(BETTERPPTX_BRAND)} — presentation connector</title>
<style>
:root{--bg:#0a0f1f;--card:#131a30;--ink:#eef2ff;--muted:#9aa8cf;--accent:#22d3ee;--accent2:#8b5cf6;--line:#283357;--ok:#34d399}
*{box-sizing:border-box}html,body{margin:0}
body{font:16px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg);background-image:radial-gradient(900px 500px at 85% -10%,rgba(139,92,246,.25),transparent),radial-gradient(800px 500px at -10% 0%,rgba(34,211,238,.18),transparent);min-height:100vh}
.wrap{max-width:760px;margin:0 auto;padding:48px 22px 64px}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.brand{font-weight:800;font-size:20px;background:linear-gradient(90deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}
.status{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:6px 12px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 3px rgba(52,211,153,.18)}
h1{font-size:30px;line-height:1.2;margin:26px 0 8px}
.lede{color:var(--muted);font-size:17px;margin:0 0 24px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin:16px 0}
label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin-bottom:8px}
.row{display:flex;gap:10px}
input{flex:1;min-width:0;background:#0b1226;border:1px solid var(--line);border-radius:10px;color:var(--ink);padding:12px 14px;font:14px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
button{border:0;border-radius:10px;padding:0 18px;font-weight:700;color:#04121a;background:linear-gradient(90deg,var(--accent),#38bdf8);cursor:pointer;font-size:14px}
button:active{transform:translateY(1px)}
.hint{color:var(--muted);font-size:14px;margin:12px 0 0}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted);margin:0 0 12px}
ol{margin:0;padding-left:20px}li{margin:7px 0}
a{color:var(--accent)}
blockquote{margin:0;padding:14px 16px;border-left:3px solid var(--accent2);background:#0b1226;border-radius:0 10px 10px 0;color:#dbe4ff}
code{background:#0b1226;border:1px solid var(--line);border-radius:6px;padding:1px 6px;font-size:13px}
details{margin:14px 0 0}summary{cursor:pointer;color:var(--muted);font-size:14px}
pre{overflow:auto;background:#0b1226;border:1px solid var(--line);border-radius:10px;padding:12px;font-size:13px;margin:10px 0 0}
footer{margin-top:30px;color:var(--muted);font-size:13px;text-align:center}
.toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:var(--ok);color:#04121a;font-weight:700;padding:10px 16px;border-radius:10px;opacity:0;transition:opacity .2s;pointer-events:none}
.toast.show{opacity:1}
</style>
</head>
<body>
<main class="wrap">
  <div class="top">
    <div class="brand">${escapeHtml(BETTERPPTX_BRAND)}</div>
    <div class="status"><span class="dot"></span> Online${tools ? ' · ' + tools + ' tools' : ''}</div>
  </div>
  <h1>Connect BetterPPTX to an AI client</h1>
  <p class="lede">This is the human setup page for the remote MCP connector. Copy the URL below into a web, desktop, CLI, or SDK client, then ask it to create, edit, narrate, animate, validate, and export PowerPoint presentations.</p>

  <div class="card">
    <label>Your connector URL</label>
    <div class="row">
      <input id="url" readonly value="${url}">
      <button id="copy" type="button">Copy</button>
    </div>
    <p class="hint">${authHint}</p>
  </div>

  <div class="card">
    <h2>Web AI Clients</h2>
    <ol>
      <li>Open your AI client’s connector, tools, or integrations settings.</li>
      <li>Add a <b>custom connector</b>, <b>remote MCP server</b>, or equivalent remote tool endpoint.</li>
      <li>${authStep}</li>
      <li>Enable the connector in a chat. The client will discover the BetterPPTX tools and can return downloadable <code>.pptx</code> files.</li>
    </ol>
    <p class="hint">Examples include ChatGPT connectors, Claude connectors, and other web clients that support remote MCP tools.</p>
  </div>

  <div class="card">
    <h2>Then try asking</h2>
    <blockquote>“Create a 3-slide deck about renewable energy — a title slide with a gradient background, a bar chart of solar vs. wind growth on slide 2, and a summary slide. Then save it and give me the download link.”</blockquote>
  </div>

  <details>
    <summary>Desktop, CLI, and SDK clients</summary>
    <div class="card">
      <p>Use the same connector URL with any compatible remote MCP client. If your client has native remote MCP support, paste the URL directly. If it expects a local stdio server, bridge it with <code>mcp-remote</code>.</p>
      <pre>[connectors.${escapeHtml(BETTERPPTX_SERVER_NAME)}]
command = "npx"
args = ["-y", "mcp-remote", "${url}"]</pre>
    </div>
  </details>

  <footer>${escapeHtml(BETTERPPTX_BRAND)} · <a href="/health">service status</a></footer>
</main>
<div id="toast" class="toast">Copied to clipboard</div>
<script>
(function(){
  var b=document.getElementById('copy'),i=document.getElementById('url'),t=document.getElementById('toast');
  function show(){t.classList.add('show');setTimeout(function(){t.classList.remove('show');},1400);}
  if(b){b.addEventListener('click',function(){
    i.focus();i.select();
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(i.value).then(show,show);}
    else{try{document.execCommand('copy');show();}catch(e){}}
  });}
})();
</script>
</body>
</html>`
}

const DEFAULT_PORT = Number(process.env.PORT || process.env.BETTERPPTX_PORT || 3344)
const DEFAULT_HOST = process.env.BETTERPPTX_HOST || '127.0.0.1'
const TOKEN = process.env.BETTERPPTX_TOKEN || ''
const rateBuckets = new Map()

function parseBytes(value, fallbackBytes) {
	const text = String(value || '').trim().toLowerCase()
	const m = text.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/)
	if (!m) return fallbackBytes
	const n = Number(m[1])
	const unit = m[2] || 'b'
	const mult = unit === 'gb' ? 1024 ** 3 : unit === 'mb' ? 1024 ** 2 : unit === 'kb' ? 1024 : 1
	return Math.max(1, Math.floor(n * mult))
}

function publicErrorPayload(code, message, extra = {}) {
	return {
		error: {
			code,
			message,
			recoverable: extra.recoverable ?? true,
			next_actions: extra.next_actions || [{ type: 'retry_later', description: 'Retry after the current protection window resets.' }],
			retry_safe: extra.retry_safe ?? true,
			artifact_state: extra.artifact_state || 'unchanged_or_unknown',
			...(extra.details ? { details: extra.details } : {}),
		},
	}
}

function applyCorsHeaders(req, res) {
	const origin = req.headers.origin
	if (origin && originAllowed(origin)) {
		res.setHeader('Access-Control-Allow-Origin', origin)
	} else if (!origin) {
		res.setHeader('Access-Control-Allow-Origin', '*')
	}
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id, mcp-protocol-version')
	res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id')
	res.setHeader('Access-Control-Max-Age', '86400')
}

function configuredClientIdentity(req) {
	const remote = req.socket?.remoteAddress || req.ip || 'unknown'
	if (process.env.BETTERPPTX_TRUST_PROXY_HEADERS !== '1') return remote
	const header = String(process.env.BETTERPPTX_CLIENT_IP_HEADER || 'x-forwarded-for').toLowerCase()
	const raw = req.headers[header]
	const value = Array.isArray(raw) ? raw[0] : raw
	if (!value) return remote
	return String(value).split(',')[0].trim() || remote
}

function rateLimitConfig() {
	const publicDefault = process.env.BETTERPPTX_AUTH === 'none' || process.env.BETTERPPTX_PUBLIC_BLACK_BOX === '1'
	return {
		enabled: process.env.BETTERPPTX_RATE_LIMIT_DISABLED !== '1',
		capacity: Math.max(1, Number(process.env.BETTERPPTX_RATE_LIMIT_BURST || (publicDefault ? 120 : 600))),
		refillPerMinute: Math.max(0, Number(process.env.BETTERPPTX_RATE_LIMIT_REFILL_PER_MIN || (publicDefault ? 120 : 600))),
	}
}

function rateLimitMiddleware(req, res, next) {
	if (req.method === 'OPTIONS') return next()
	const cfg = rateLimitConfig()
	if (!cfg.enabled) return next()
	const now = Date.now()
	const key = configuredClientIdentity(req)
	const refillPerMs = cfg.refillPerMinute / 60000
	let bucket = rateBuckets.get(key)
	if (!bucket) bucket = { tokens: cfg.capacity, updatedAt: now }
	const elapsed = Math.max(0, now - bucket.updatedAt)
	bucket.tokens = Math.min(cfg.capacity, bucket.tokens + elapsed * refillPerMs)
	bucket.updatedAt = now
	if (bucket.tokens < 1) {
		rateBuckets.set(key, bucket)
		applyCorsHeaders(req, res)
		res.setHeader('Retry-After', '60')
		return res.status(429).json(publicErrorPayload('RATE_LIMITED', 'Too many requests. Retry after a short delay.', {
			details: { limit: cfg.capacity, refillPerMinute: cfg.refillPerMinute },
		}))
	}
	bucket.tokens -= 1
	rateBuckets.set(key, bucket)
	if (rateBuckets.size > 20000) {
		for (const [id, item] of rateBuckets) {
			if (now - item.updatedAt > 10 * 60 * 1000) rateBuckets.delete(id)
			if (rateBuckets.size <= 10000) break
		}
	}
	next()
}

// Known browser-based MCP hosts plus loopback developer clients. Server-side
// clients usually send no Origin header and are accepted below.
const AI_CLIENT_ORIGINS = [
	/^https:\/\/claude\.ai$/,
	/^https:\/\/[a-z0-9-]+\.claude\.ai$/,
	/^https:\/\/[a-z0-9-]+\.anthropic\.com$/,
	/^https:\/\/chatgpt\.com$/,
	/^https:\/\/[a-z0-9-]+\.chatgpt\.com$/,
	/^https:\/\/chat\.openai\.com$/,
	/^https:\/\/[a-z0-9-]+\.openai\.com$/,
	/^http:\/\/localhost(?::\d+)?$/,
	/^http:\/\/127\.0\.0\.1(?::\d+)?$/,
	/^http:\/\/\[::1\](?::\d+)?$/,
]

function originAllowed(origin) {
	if (!origin) return true  // server-to-server (cloudflared / curl) — no origin header
	return AI_CLIENT_ORIGINS.some(rx => rx.test(origin))
}

function isInitializeRequest(body) {
	if (!body) return false
	if (Array.isArray(body)) return body.some(isInitializeRequest)
	return body && typeof body === 'object' && body.method === 'initialize'
}

function findInitializeRequest(body) {
	if (!body) return null
	if (Array.isArray(body)) return body.map(findInitializeRequest).find(Boolean) || null
	return body && typeof body === 'object' && body.method === 'initialize' ? body : null
}

function initializeClientInfo(body) {
	const req = findInitializeRequest(body)
	const info = req?.params?.clientInfo
	if (!info || typeof info !== 'object') return null
	return {
		name: String(info.name || 'unknown'),
		version: info.version ? String(info.version) : undefined,
	}
}

function isLoopbackHost(req) {
	const host = String(req.headers.host || '').split(':')[0].toLowerCase()
	return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
}

function localLogViewerOnly(req, res, next) {
	if (!isLoopbackHost(req)) return res.status(404).json({ error: { code: -32004, message: 'not found' } })
	res.setHeader('Cache-Control', 'no-store')
	next()
}

function readFileRange(file, start, end) {
	const length = Math.max(0, end - start)
	if (!length) return ''
	const fd = fs.openSync(file, 'r')
	try {
		const buffer = Buffer.alloc(length)
		fs.readSync(fd, buffer, 0, length, start)
		return buffer.toString('utf8')
	} finally {
		fs.closeSync(fd)
	}
}

function readLogTail(file, maxBytes, maxLines) {
	const stat = fs.statSync(file)
	const start = Math.max(0, stat.size - maxBytes)
	let text = readFileRange(file, start, stat.size)
	if (start > 0) text = text.replace(/^[^\n]*(\r?\n)?/, '')
	let lines = text.split(/\r?\n/).filter(Boolean)
	if (lines.length > maxLines) lines = lines.slice(-maxLines)
	return { lines, offset: stat.size, size: stat.size, truncatedBytes: start }
}

export async function startBetterPptxHttp(options = {}) {
	if (process.env.BETTERPPTX_PUBLIC_BLACK_BOX === undefined && process.env.BETTERPPTX_BLACK_BOX === undefined) {
		process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
	}
	const host = options.host || DEFAULT_HOST
	const port = options.port || DEFAULT_PORT

	// ---- Auth mode resolution ------------------------------------------------
	//  • 'none'    : hosted public product default. The connector URL is public;
	//                free use needs no endpoint key, and premium access is
	//                activated through betterpptx.auth.activate_key.
	//  • 'path'    : private/self-host URL-path secret (/s/<secret>/mcp).
	//  • 'bearer'  : private/self-host Authorization: Bearer <token>.
	const explicitToken = options.token || TOKEN
	const urlSecret = options.urlSecret || process.env.BETTERPPTX_URL_SECRET || ''
	const wantOpen = options.open === true || process.env.BETTERPPTX_AUTH === 'none'
	let authMode, token
	if (wantOpen) { authMode = 'none'; token = '' }
	else if (urlSecret) { authMode = 'path'; token = '' }
	else { authMode = 'bearer'; token = explicitToken || randomBytes(24).toString('base64url') }
	const tokenWasGenerated = authMode === 'bearer' && !explicitToken
	const mcpPath = authMode === 'path' ? `/s/${urlSecret}/mcp` : '/mcp'

	// ---- File downloads. Remote web clients cannot reach a
	// file saved on the server's disk; so we serve published files over the same
	// HTTPS endpoint and the engine returns a public downloadUrl on every save.
	const downloadRoot = options.downloadRoot || process.env.BETTERPPTX_DOWNLOAD_ROOT || path.resolve(process.cwd(), 'outputs', 'public_files')
	const publicBase = (options.publicBase || process.env.BETTERPPTX_PUBLIC_BASE || '').replace(/\/+$/, '')
	try { fs.mkdirSync(downloadRoot, { recursive: true }) } catch (_) {}
	setDownloadConfig({ root: downloadRoot, base: publicBase })

	const app = express()
	app.disable('x-powered-by')
	app.post('/webhooks/dodo', express.raw({
		type: 'application/json',
		limit: process.env.BETTERPPTX_WEBHOOK_JSON_LIMIT || '2mb',
	}), handleDodoWebhookHttp)
	app.use('/log-viewer', localLogViewerOnly)
	app.get('/log-viewer/api/current', (req, res) => {
		const logger = getLoggerInfo()
		if (!logger.file || !fs.existsSync(logger.file)) {
			return res.json({ ok: true, logger, lines: [], offset: 0, size: 0, truncatedBytes: 0 })
		}
		const maxBytes = Math.min(50 * 1024 * 1024, Math.max(64 * 1024, Number(req.query.maxBytes) || 5 * 1024 * 1024))
		const maxLines = Math.min(50000, Math.max(100, Number(req.query.maxLines) || 5000))
		try {
			res.json({ ok: true, logger, ...readLogTail(logger.file, maxBytes, maxLines) })
		} catch (error) {
			res.status(500).json({ ok: false, logger, error: String(error?.message || error) })
		}
	})
	app.get('/log-viewer/api/stream', (req, res) => {
		res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
		res.setHeader('Connection', 'keep-alive')
		res.setHeader('X-Accel-Buffering', 'no')
		res.flushHeaders?.()

		let logger = getLoggerInfo()
		let file = logger.file || ''
		let offset = Math.max(0, Number(req.query.offset) || 0)
		let partial = ''

		const send = (event, data) => {
			res.write(`event: ${event}\n`)
			res.write(`data: ${JSON.stringify(data)}\n\n`)
		}

		send('ready', { logger, offset, now: new Date().toISOString() })
		const timer = setInterval(() => {
			try {
				logger = getLoggerInfo()
				const nextFile = logger.file || ''
				if (!nextFile || !fs.existsSync(nextFile)) {
					send('heartbeat', { logger, offset, now: new Date().toISOString() })
					return
				}
				if (nextFile !== file) {
					file = nextFile
					offset = 0
					partial = ''
					send('rotate', { logger, offset, now: new Date().toISOString() })
				}
				const stat = fs.statSync(file)
				if (offset > stat.size) {
					offset = 0
					partial = ''
					send('truncate', { logger, offset, size: stat.size, now: new Date().toISOString() })
				}
				if (stat.size > offset) {
					const text = partial + readFileRange(file, offset, stat.size)
					offset = stat.size
					const lines = text.split(/\r?\n/)
					partial = lines.pop() || ''
					const complete = lines.filter(Boolean)
					if (complete.length) send('append', { logger, lines: complete, offset, size: stat.size })
				} else {
					send('heartbeat', { logger, offset, size: stat.size, now: new Date().toISOString() })
				}
			} catch (error) {
				send('stream_error', { error: String(error?.message || error), offset, now: new Date().toISOString() })
			}
		}, 1000)
		req.on('close', () => clearInterval(timer))
	})
	app.use('/log-viewer', express.static(path.join(__dirname, 'log-viewer'), {
		extensions: ['html'],
		index: 'index.html',
	}))
	app.use(rateLimitMiddleware)
	const jsonLimit = process.env.BETTERPPTX_JSON_LIMIT || '40mb'
	app.use(express.json({
		limit: jsonLimit,
		verify: (req, _res, buf) => { req.rawBody = buf?.length ? buf.toString('utf8') : '' },
	}))
	app.use((err, req, res, next) => {
		if (!err) return next()
		if (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413) {
			applyCorsHeaders(req, res)
			return res.status(413).json(publicErrorPayload('PAYLOAD_TOO_LARGE', 'The request body is larger than the allowed upload limit.', {
				recoverable: true,
				retry_safe: false,
				artifact_state: 'not_imported',
				details: { maxBytes: parseBytes(jsonLimit, 40 * 1024 * 1024) },
				next_actions: [{ type: 'reduce_upload', description: 'Upload a smaller deck or reduce embedded media before retrying.' }],
			}))
		}
		if (err instanceof SyntaxError) {
			applyCorsHeaders(req, res)
			return res.status(400).json(publicErrorPayload('BAD_JSON', 'The request body was not valid JSON.', {
				recoverable: true,
				retry_safe: true,
			}))
		}
		next(err)
	})

	// ---- Development traffic logger. The logger itself is opt-in and writes
	// NDJSON to disk, so this middleware is cheap when BETTERPPTX_LOG is unset.
	app.use((req, res, next) => {
		const requestId = createTraceId('http')
		const startedAt = process.hrtime.bigint()
		const responseChunks = []
		let responseBytes = 0
		const shouldCaptureBody = !String(req.path || '').startsWith('/files/')
		const capture = (chunk, encoding) => {
			if (!chunk) return
			const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof encoding === 'string' ? encoding : undefined)
			responseBytes += buf.length
			if (shouldCaptureBody) responseChunks.push(buf)
		}
		const origWrite = res.write
		const origEnd = res.end
		res.write = function (chunk, encoding, callback) {
			capture(chunk, encoding)
			return origWrite.apply(this, arguments)
		}
		res.end = function (chunk, encoding, callback) {
			capture(chunk, encoding)
			const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6
			const headers = res.getHeaders()
			const ctype = String(headers['content-type'] || '')
			const bodyIsText = shouldCaptureBody && (
				ctype.includes('json') ||
				ctype.includes('text') ||
				ctype.includes('event-stream') ||
				String(req.path || '').endsWith('/mcp')
			)
			logEvent('http.response', {
				requestId,
				method: req.method,
				url: req.originalUrl || req.url,
				statusCode: res.statusCode,
				headers,
				durationMs,
				bytes: responseBytes,
				body: bodyIsText ? Buffer.concat(responseChunks).toString('utf8') : undefined,
			})
			return origEnd.apply(this, arguments)
		}
		logEvent('http.request', {
			requestId,
			method: req.method,
			url: req.originalUrl || req.url,
			path: req.path,
			query: req.query,
			ip: req.ip,
			headers: req.headers,
			body: req.body,
			rawBody: req.rawBody,
		})
		next()
	})

	// ---- CORS for browser-based AI clients
	app.use((req, res, next) => {
		applyCorsHeaders(req, res)
		if (req.method === 'OPTIONS') return res.sendStatus(204)
		next()
	})

	// ---- Health + info (no auth)
	app.get('/', (req, res) => {
		const blackBox = isPublicBlackBoxMode()
		const visibleTools = publicToolList(TOOLS)
		// Browsers get a human landing page that explains how to add this URL to
		// compatible AI clients; programmatic/MCP clients get JSON.
		if (String(req.headers.accept || '').includes('text/html')) {
			const base = (publicBase || `${req.protocol}://${req.get('host') || `${host}:${port}`}`).replace(/\/+$/, '')
			const connectorUrl = (process.env.BETTERPPTX_PUBLIC_MCP_URL || '').trim() || (base + mcpPath)
			res.type('html').send(renderLandingPage({ connectorUrl, toolCount: visibleTools.length, authMode }))
			return
		}
		const base = (publicBase || `${req.protocol}://${req.get('host') || `${host}:${port}`}`).replace(/\/+$/, '')
		const connectorUrl = (process.env.BETTERPPTX_PUBLIC_MCP_URL || '').trim() || (base + mcpPath)
		res.json({
			service: BETTERPPTX_BRAND,
			product: BETTERPPTX_PRODUCT,
			endpoint: mcpPath,
			connectorUrl,
			toolCount: visibleTools.length,
			authRequired: authMode === 'bearer',
			webConnectorReady: authMode !== 'bearer', // web connector clients can add by URL
			...(blackBox ? {} : {
				version: '1.0.0',
				transport: 'streamable-http',
				selfContained: true,
				blackBox,
				authMode,
				externalPptxLibrariesRequired: false,
				logger: getLoggerInfo(),
				docs: 'https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http',
			}),
		})
	})
	app.get('/health', (req, res) => {
		const stats = getEngineStats()
		res.json(isPublicBlackBoxMode()
			? { status: 'ok', service: BETTERPPTX_BRAND }
			: { status: 'ok', service: BETTERPPTX_BRAND, sessions: sessions.size, engine: stats, logger: getLoggerInfo() })
	})
	app.get('/tools', (req, res) => {
		const visibleTools = publicToolList(TOOLS)
		res.json({ count: visibleTools.length, tools: visibleTools.map(t => ({ name: t.name, title: t.title, description: t.description })) })
	})

	// ---- File download (no auth: gated by the unguessable per-file token in the
	// path). deck.save publishes a copy here and returns the matching downloadUrl,
	// so a remote web client can actually fetch the generated .pptx.
	app.get('/files/:token/:name', (req, res) => {
		const token = String(req.params.token || '')
		const name = String(req.params.name || '')         // express already URL-decodes route params
		if (!/^[A-Za-z0-9_-]{6,}$/.test(token) || !/^[A-Za-z0-9._() -]+$/.test(name) || name.includes('..')) {
			recordDownloadTelemetry({ ok: false })
			return res.status(400).json({ error: { code: -32602, message: 'bad download request' } })
		}
		const resolved = path.resolve(downloadRoot, token, name)
		if (resolved !== path.join(path.resolve(downloadRoot), token, name) || !fs.existsSync(resolved)) {
			recordDownloadTelemetry({ ok: false })
			return res.status(404).json({ error: { code: -32004, message: 'file not found' } })
		}
		const stat = fs.statSync(resolved)
		res.setHeader('Content-Type', mimeFor(name))
		res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`)
		res.setHeader('Cache-Control', 'private, max-age=3600')
		recordDownloadTelemetry({ ok: true, bytes: stat.size })
		logEvent('http.download', { token, name, filePath: resolved, bytes: stat.size })
		fs.createReadStream(resolved).on('error', () => {
			recordDownloadTelemetry({ ok: false })
			if (!res.headersSent) res.status(500).end()
		}).pipe(res)
	})

	// ---- Auth guard on the MCP endpoint only.
	// Bearer mode enforces the token; path/none modes are gated by the URL itself
	// (unguessable path) or open — they pass through, which is what lets the
	// web connector dialogs that accept only a URL connect directly.
	function authGuard(req, res, next) {
		if (authMode !== 'bearer') return next()
		const auth = req.headers.authorization || ''
		const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
		if (!bearer || bearer !== token) {
			return res.status(401).json({
				error: { code: -32001, message: 'Unauthorized: missing or invalid Bearer token' },
			})
		}
		next()
	}

	// ---- Stateful session registry
	const sessions = new Map()  // sessionId -> { transport, server, lastSeenAt }

	// Idle session sweep (30 min)
	const IDLE_TTL_MS = 30 * 60 * 1000
	const sweepHandle = setInterval(() => {
		const now = Date.now()
		for (const [sid, s] of sessions) {
			if (now - s.lastSeenAt > IDLE_TTL_MS) {
				try { s.transport.close() } catch (_) {}
				sessions.delete(sid)
				process.stderr.write(`[betterpptx:http] swept idle session ${sid}\n`)
				logEvent('http.session.swept', { sessionId: sid })
			}
		}
	}, 5 * 60 * 1000)
	sweepHandle.unref?.()

	// Published-download sweep: delete token dirs after the artifact TTL so disk stays bounded.
	const DL_TTL_MS = artifactTtlMs()
	const dlSweep = setInterval(() => {
		try {
			for (const dir of fs.readdirSync(downloadRoot, { withFileTypes: true })) {
				if (!dir.isDirectory()) continue
				const p = path.join(downloadRoot, dir.name)
				try { if (Date.now() - fs.statSync(p).mtimeMs > DL_TTL_MS) fs.rmSync(p, { recursive: true, force: true }) } catch (_) {}
			}
		} catch (_) {}
	}, 60 * 60 * 1000)
	dlSweep.unref?.()

	// ---- POST /mcp — client → server JSON-RPC + initiates SSE if requested
	app.post(mcpPath, authGuard, async (req, res) => {
		try {
			const sid = req.headers['mcp-session-id']
			let entry
			if (sid && sessions.has(sid)) {
				entry = sessions.get(sid)
				entry.lastSeenAt = Date.now()
			} else if (!sid && isInitializeRequest(req.body)) {
				const newSid = randomUUID()
				const clientInfo = initializeClientInfo(req.body)
				const transport = new StreamableHTTPServerTransport({
					sessionIdGenerator: () => newSid,
				})
				const mcpServer = createBetterPptxMcpServer({ sessionId: newSid, clientInfo })
				await mcpServer.connect(transport)
				entry = { transport, server: mcpServer, lastSeenAt: Date.now(), clientInfo }
				sessions.set(newSid, entry)
				transport.onclose = () => sessions.delete(newSid)
				process.stderr.write(`[betterpptx:http] session opened ${newSid}\n`)
				logEvent('http.session.opened', { sessionId: newSid, authMode, clientInfo })
			} else {
				return res.status(400).json({
					jsonrpc: '2.0',
					error: { code: -32000, message: 'Bad Request: no valid session ID and not an initialize request' },
					id: req.body?.id ?? null,
				})
			}
			await entry.transport.handleRequest(req, res, req.body)
		} catch (e) {
			process.stderr.write(`[betterpptx:http] POST /mcp error: ${e?.stack || e}\n`)
			logEvent('http.post_mcp.error', { error: { message: String(e?.message || e), stack: e?.stack }, body: req.body })
			if (!res.headersSent) {
				res.status(500).json({
					jsonrpc: '2.0',
					error: { code: -32603, message: String(e?.message || e) },
					id: req.body?.id ?? null,
				})
			}
		}
	})

	// ---- GET /mcp — server → client SSE stream for the active session
	app.get(mcpPath, authGuard, async (req, res) => {
		const sid = req.headers['mcp-session-id']
		// A human pasting the full /mcp link into a browser has no MCP session; send
		// them to the landing page with client setup instructions instead of a
		// bare 404. Real SSE clients send mcp-session-id + Accept: text/event-stream.
		if (!sid && String(req.headers.accept || '').includes('text/html')) return res.redirect(302, '/')
		if (!sid || !sessions.has(sid)) {
			return res.status(404).json({ error: { code: -32004, message: 'Session not found' } })
		}
		const entry = sessions.get(sid)
		entry.lastSeenAt = Date.now()
		try {
			await entry.transport.handleRequest(req, res)
		} catch (e) {
			process.stderr.write(`[betterpptx:http] GET /mcp error: ${e?.stack || e}\n`)
			logEvent('http.get_mcp.error', { sessionId: sid, error: { message: String(e?.message || e), stack: e?.stack } })
		}
	})

	// ---- DELETE /mcp — explicit session close
	app.delete(mcpPath, authGuard, async (req, res) => {
		const sid = req.headers['mcp-session-id']
		if (!sid || !sessions.has(sid)) {
			return res.status(404).json({ error: { code: -32004, message: 'Session not found' } })
		}
		const entry = sessions.get(sid)
		try { await entry.transport.handleRequest(req, res) } catch (_) {}
		try { entry.transport.close() } catch (_) {}
		sessions.delete(sid)
		logEvent('http.session.deleted', { sessionId: sid })
	})

	// Start
	const httpServer = http.createServer(app)
	await new Promise(resolve => httpServer.listen(port, host, resolve))

	const authLine =
		authMode === 'bearer' ? 'Bearer token (header-capable desktop / CLI / SDK clients)'
		: authMode === 'path' ? 'URL-path secret (web-connector friendly)'
		: 'OPEN — no auth (web-connector friendly; use only behind a trusted tunnel)'
	const banner = [
		'',
		'==========================================================',
		'  betterpptx HTTP server (Streamable HTTP / MCP)',
		'==========================================================',
		`  local URL : http://${host}:${port}${mcpPath}`,
		`  health    : http://${host}:${port}/health`,
		`  info      : http://${host}:${port}/`,
		`  tools     : ${TOOLS.length} advertised`,
		`  auth mode : ${authMode}  — ${authLine}`,
		...(authMode === 'bearer' ? [
			'',
			'  Bearer token :',
			`    ${token}`,
			tokenWasGenerated
				? '  (generated for this run — set BETTERPPTX_TOKEN to keep it stable)'
				: '  (from BETTERPPTX_TOKEN env / --token option)',
		] : []),
		...(authMode === 'path' ? [
			'',
			`  URL secret : ${urlSecret}   (the path IS the credential — keep it secret)`,
		] : []),
		'',
		authMode === 'bearer'
			? '  Web connector UIs usually cannot send a Bearer header — run with'
			: '  Paste the PUBLIC https URL of this endpoint into a compatible AI client',
		authMode === 'bearer'
			? '  BETTERPPTX_URL_SECRET=<secret> (path mode) or BETTERPPTX_AUTH=none (open).'
			: '  → Add custom connector / remote MCP server. No header needed.',
		'==========================================================',
		'',
	].join('\n')
	process.stderr.write(banner)
	const logger = getLoggerInfo()
	if (logger.enabled) process.stderr.write(`[betterpptx:http] traffic log: ${logger.file}\n`)
	logEvent('server.http.ready', { host, port, authMode, mcpPath, downloadRoot, publicBase, toolCount: TOOLS.length, logger })

	return { httpServer, token, host, port, authMode, mcpPath, urlSecret, downloadRoot, publicBase }
}

// CLI entry: `node betterpptx/server-http.mjs` or via the bin shim.
// Self-start only when run directly as `node server-http.mjs`. http-cli.mjs and
// process managers import startBetterPptxHttp and call it explicitly instead, so
// importing this module never double-starts a server.
const isMain = process.argv[1] && process.argv[1].endsWith('server-http.mjs')
if (isMain) {
	const argv = process.argv.slice(2)
	const opt = {}
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--port' && argv[i + 1]) { opt.port = Number(argv[++i]); continue }
		if (argv[i] === '--host' && argv[i + 1]) { opt.host = argv[++i]; continue }
		if (argv[i] === '--token' && argv[i + 1]) { opt.token = argv[++i]; continue }
		if (argv[i] === '--url-secret' && argv[i + 1]) { opt.urlSecret = argv[++i]; continue }
		if (argv[i] === '--open') { opt.open = true; continue }
		if (argv[i] === '--log') { process.env.BETTERPPTX_LOG ||= 'debug'; continue }
		if (argv[i] === '--log-full') { process.env.BETTERPPTX_LOG = 'full'; continue }
		if (argv[i] === '--log-dir' && argv[i + 1]) { process.env.BETTERPPTX_LOG_DIR = argv[++i]; continue }
		if (argv[i] === '--log-file' && argv[i + 1]) { process.env.BETTERPPTX_LOG_FILE = argv[++i]; continue }
		if (argv[i] === '--log-secrets') { process.env.BETTERPPTX_LOG_SECRETS = '1'; continue }
		if (argv[i] === '--help' || argv[i] === '-h') {
			console.log('Usage: betterpptx-http [--port 3344] [--host 0.0.0.0] [auth]')
			console.log('  auth (pick one):')
			console.log('    --token SECRET        Bearer header (desktop / CLI / SDK clients)')
			console.log('    --url-secret SECRET   secret in URL path /s/<secret>/mcp (web UIs)')
			console.log('    --open                no auth at all (web UIs; trusted tunnel only)')
			console.log('  env: BETTERPPTX_PORT, BETTERPPTX_HOST, BETTERPPTX_TOKEN,')
			console.log('       BETTERPPTX_URL_SECRET, BETTERPPTX_AUTH=none')
			console.log('  logging:')
			console.log('    --log                enable NDJSON traffic logging (redacted)')
			console.log('    --log-full           log complete JSON payloads')
			console.log('    --log-dir DIR        write logs under DIR')
			console.log('    --log-file FILE      write to an exact NDJSON file')
			console.log('    --log-secrets        include auth/cookie/token values (local debug only)')
			process.exit(0)
		}
	}
	startBetterPptxHttp(opt).catch(err => {
		process.stderr.write(`[betterpptx:http] fatal: ${err?.stack || err}\n`)
		process.exit(1)
	})
}
