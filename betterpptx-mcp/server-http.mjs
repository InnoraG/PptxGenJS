// betterpptx — HTTP transport for remote MCP hosts.
//
// Dual protocol:
//   • MCP 2026-07-28 (stateless core): every POST is self-contained via `_meta`,
//     `server/discover` replaces initialize, and no mcp-session-id is required.
//     This is the hosting-balancing path — any replica can answer.
import { NodeStreamableHTTPServerTransport } from "@modelcontextprotocol/node";

//   • Legacy Streamable HTTP (2024-11-05 / 2025-03-26 / 2025-06-18): initialize
//     plus optional sessions, kept so ChatGPT / Claude connectors keep working.
//
// Auth model:
//   Hosted public product: public /mcp connector, free tier needs no endpoint key,
//   premium features are gated by betterpptx.auth.activate_key, MCP 2.0 elicitation,
//   and optional OAuth 2.1 protected-resource metadata.
//   Private/self-host deployments: optional Bearer token or URL-path secret.
//
// Public production can also run legacy-stateless mode. When
// BETTERPPTX_HTTP_STATELESS_MCP=1, every legacy POST /mcp creates a fresh transport and
// MCP server, and correctness is reconstructed from the anonymous install
// header plus durable deck/spec state. Stateful mode remains available for
// local/private compatibility with older hosts.

import { randomUUID, randomBytes } from 'node:crypto'
import * as http from 'node:http'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import express from 'express'
import { createBetterPptxMcpServer } from './server.mjs'
import { setDownloadConfig, getEngineStats, runDurableOperationById } from './engine.mjs'
import { TOOLS, normalizeToolNameProfile } from './tools.mjs'
import { BETTERPPTX_BRAND, BETTERPPTX_PRODUCT, BETTERPPTX_SERVER_NAME } from './branding.mjs'
import { createTraceId, getLoggerInfo, logEvent } from './logger.mjs'
import { traceArtifactDelivery, traceAuthDecision, traceMcpHttp, withDiagnosticRequest } from './diagnostic-trace.mjs'
import { recordResourceUnitEvent } from './billing/resource-meter.mjs'
import { isPublicBlackBoxMode, publicToolList } from './blackbox.mjs'
import { publicRuntimeManifest } from './public-manifest.mjs'
import { artifactTtlMs, isPermittedBrowserGrantQuery, verifyLocalArtifactBrowserGrant, verifyLocalArtifactOwner } from './storage/artifact-store.mjs'
import { credentialAccounts } from './config/credential-store.mjs'
import { handleMcpV2Post, mcpV2HandshakePayload } from './mcp-v2/handler.mjs'
import { isMcpV2Request, publicMcpProtocolManifest } from './mcp-v2/protocol.mjs'
import { oauthAuthorizationServerCompatibilityPaths, oauthAuthorizationServerMetadata, oauthProtectedResourceMetadata, wwwAuthenticateHeader } from './mcp-v2/oauth.mjs'
import {
	acquireAvatarWorkerIdempotency,
	cancelAvatarWorkerIdempotency,
	completeAvatarWorkerIdempotency,
	readAvatarWorkerIdempotencyResult,
} from './storage/avatar-worker-idempotency-store.mjs'
import { recordDownloadTelemetry, recordForwarderSweeperTelemetry } from './telemetry.mjs'
import { InstallIdentityError, connectorIdentityFromHeaders, installIdentityFromHeaders } from './auth/install-identity.mjs'
import { createVerifiedIdentityVerifier } from './auth/verified-identity.mjs'
import { anonymousMcpRequestAllowed, publicIdentityPolicy } from './auth/public-identity-policy.mjs'
import { createIdentityProxy } from './auth/identity-proxy.mjs'
import { httpClientRateLimitKey, httpRateLimitConfig, developmentLogViewerAllowed } from './auth/http-admission.mjs'
import { isProductionBillingEnvironment, assertProductionBillingConfiguration } from './billing/security-policy.mjs'
import { configuredCryptoPacks } from './billing/crypto-packs.mjs'
import { createCryptoOrderStore } from './billing/crypto-orders.mjs'
import { tryMintPaymentEnvelope, verifyPaymentEnvelope, quoteKeyForPaymentEnvelope } from './billing/payment-envelope.mjs'
import { lazyRescanOrder, scanBaseUsdcHotWindow } from './billing/base-usdc-watcher.mjs'
import { sweepForwarderHotWindow } from './billing/deposit-forwarder-sweeper.mjs'
import {
	createX402QuoteStore,
	publicX402Quote,
	settleX402Quote,
} from './billing/x402-packs.mjs'
import { assertProductionSharedStores } from './billing/shared-store-probe.mjs'
import { buildPaymentHealth } from './billing/payment-health.mjs'
import {
	grantOwnerGoodwillCredits,
	OwnerGoodwillError,
	ownerOperatorFingerprint,
} from './billing/owner-goodwill.mjs'
import {
	renderOrderPage,
	renderPackSelection,
	renderPaymentError,
	renderWalletFundingPage,
} from './public/pay-order-page.mjs'
import { paymentSurfaceReadiness } from './billing/payment-surfaces.mjs'
import { configuredBaseNetwork } from './billing/base-network.mjs'
import {
	normalizeFundingAddress,
	normalizeRequiredAtomic,
	readBaseWalletFundingStatus,
} from './billing/base-wallet-funding.mjs'
import { registerPayRamRoutes } from './billing/payram-routes.mjs'
import { buildMissionControlSnapshot, missionControlAccess, missionControlAdminAccess, renderMissionControlPage, sendMissionControlDenied } from './mission-control.mjs'
import {
	getMissionControlSecretsSnapshot,
	MissionControlSecretError,
	revealMissionControlSecret,
	rotateMissionControlSecret,
	testMissionControlSecret,
	updateMissionControlSecret,
} from './mission-control-secrets.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Minimal MIME map for the download route (covers what deck.save / io.write_file emit).
const MIME_BY_EXT = {
	pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	potx: 'application/vnd.openxmlformats-officedocument.presentationml.template',
	thmx: 'application/vnd.openxmlformats-officedocument.theme',
	pptm: 'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
	pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
	gif: 'image/gif', svg: 'image/svg+xml', mp4: 'video/mp4', json: 'application/json',
}
function mimeFor(name) { return MIME_BY_EXT[(name.split('.').pop() || '').toLowerCase()] || 'application/octet-stream' }

function escapeHtml(s) {
	return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

function encodeBase64Json(value) {
	return Buffer.from(JSON.stringify(value), 'utf8').toString('base64')
}

function decodePaymentHeader(value) {
	const text = String(value || '').trim()
	if (!text) return null
	try {
		return JSON.parse(text)
	} catch {}
	try {
		return JSON.parse(Buffer.from(text, 'base64').toString('utf8'))
	} catch {
		return null
	}
}

// Human-facing landing page served on GET / when a browser opens the endpoint.
// Programmatic/MCP clients still get JSON. It stays product-facing only: what
// this is, the exact connector URL, and how to add it to common MCP clients.
function renderLandingPage({ connectorUrl, toolCount, authMode }) {
	const url = escapeHtml(connectorUrl)
	const tools = Number.isFinite(toolCount) ? toolCount : ''
	const authHint = authMode === 'oauth'
		? 'Sign in to your BetterPPTX account to create presentations and use your allowance. Capability discovery remains available before sign-in.'
		: authMode === 'none'
		? 'No endpoint key is needed for the free connector. Premium features are activated inside the AI chat with <code>betterpptx.auth.activate_key</code> when the user provides a license key.'
		: authMode === 'path'
			? 'This private/self-host connector uses a URL-path secret. Keep the full URL private and rotate the secret if it leaks.'
			: 'This private/self-host connector expects a Bearer token in an <code>Authorization</code> header. Use it with header-capable desktop, CLI, or SDK clients.'
	const authStep = authMode === 'oauth'
		? 'Paste the URL, choose <b>OAuth</b>, and complete the BetterPPTX sign-in when prompted.'
		: authMode === 'bearer'
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

function envFlag(name, defaultValue = false) {
	const raw = process.env[name]
	if (raw === undefined || raw === null || String(raw).trim() === '') return defaultValue
	return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase())
}

function requireScannerToken(req, res) {
	const configured = String(process.env.BETTERPPTX_SCANNER_TOKEN || '').trim()
	const authorization = String(req.headers.authorization || '')
	const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
	const supplied = String(req.headers['x-betterpptx-scanner-token'] || bearer || '').trim()
	if (!configured || !supplied || supplied !== configured) {
		res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' } })
		return false
	}
	return true
}

function requireAvatarWorkerBrokerToken(req, res) {
	const authorization = String(req.headers.authorization || '')
	const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
	const supplied = String(req.headers['x-betterpptx-avatar-worker-token'] || bearer || '').trim()
	const configured = credentialAccounts('avatar-worker')
		.map(account => String(account?.env?.BETTERPPTX_AVATAR_WORKER_TOKEN || '').trim())
		.filter(Boolean)
	if (!supplied || !configured.length || !configured.includes(supplied)) {
		res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' } })
		return false
	}
	return true
}

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
	res.setHeader('Access-Control-Allow-Origin', '*')
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, DPoP, mcp-session-id, mcp-protocol-version, MCP-Protocol-Version, x-betterpptx-device, x-betterpptx-mission-control-token, x-betterpptx-mission-control-admin-token, PAYMENT-SIGNATURE, X-PAYMENT')
	res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, MCP-Protocol-Version, WWW-Authenticate, DPoP-Nonce, PAYMENT-REQUIRED, PAYMENT-RESPONSE')
	res.setHeader('Access-Control-Max-Age', '86400')
}

function sendMissionControlSecretError(res, { action = 'unknown', id = '' } = {}, err) {
	const isMcError = err instanceof MissionControlSecretError
	const status = isMcError ? err.statusCode : 500
	const code = isMcError ? err.code : 'MC_SECRET_ERROR'
	const message = isMcError ? err.message : 'Mission Control secret action failed.'
	logEvent('mission_control.secret_action', { action, id, status: 'error', code })
	res.setHeader('Cache-Control', 'no-store')
	return res.status(status).json({
		error: {
			code,
			message,
			recoverable: status >= 500,
			retry_safe: action === 'list' || action === 'test',
		},
	})
}

function sendOwnerGoodwillError(res, err) {
	const isOwnerError = err instanceof OwnerGoodwillError
	const status = isOwnerError ? err.statusCode : Number(err?.statusCode || 500)
	const code = isOwnerError ? err.code : String(err?.code || 'OWNER_GOODWILL_ERROR')
	const message = isOwnerError ? err.message : 'Owner goodwill credit action failed.'
	logEvent('mission_control.owner_goodwill', { status: 'error', code })
	res.setHeader('Cache-Control', 'no-store')
	return res.status(status >= 400 && status <= 599 ? status : 500).json({
		error: {
			code,
			message,
			recoverable: status >= 500,
			retry_safe: code !== 'BILLING_IDEMPOTENCY_CONFLICT',
		},
	})
}

function configuredClientIdentity(req) {
	return httpClientRateLimitKey(req)
}

function rateLimitConfig() {
	return httpRateLimitConfig()
}

function rateLimitMiddleware(req, res, next) {
	if (req.method === 'OPTIONS') return next()
	const cfg = rateLimitConfig()
	if (!cfg.enabled) return next()
	const now = Date.now()
	const key = configuredClientIdentity(req)
	const globalKey = '__server_admission_budget__'
	const global = rateBuckets.get(globalKey) || { tokens: cfg.globalCapacity, updatedAt: now }
	global.tokens = Math.min(cfg.globalCapacity, global.tokens + Math.max(0, now - global.updatedAt) * cfg.globalRefillPerMinute / 60000)
	global.updatedAt = now
	rateBuckets.set(globalKey, global)
	if (global.tokens < 1 || (!rateBuckets.has(key) && rateBuckets.size >= 20000)) {
		res.setHeader('Retry-After', '60')
		return res.status(429).json(publicErrorPayload('RATE_LIMITED', 'Service request capacity is temporarily exhausted. Retry later.'))
	}
	global.tokens -= 1
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

function toolNameProfileFromRequest(req) {
	return normalizeToolNameProfile(
		req.query?.toolNames ||
		req.query?.toolNameProfile ||
		req.headers['x-betterpptx-tool-name-profile'] ||
		process.env.BETTERPPTX_TOOL_NAME_PROFILE
	)
}

function isLoopbackHost(req) {
	const host = String(req.headers.host || '').split(':')[0].toLowerCase()
	return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
}

function localLogViewerOnly(req, res, next) {
	if (!developmentLogViewerAllowed(req)) return res.status(404).json({ error: { code: -32004, message: 'not found' } })
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
		process.env.BETTERPPTX_PUBLIC_BLACK_BOX = process.env.BETTERPPTX_LOCAL_MAINTAINER === '1' ? '0' : '1'
	}
	const host = options.host ?? DEFAULT_HOST
	const port = options.port ?? DEFAULT_PORT

	// ---- Auth mode resolution ------------------------------------------------
	//  • 'oauth'   : mandatory on public endpoints; no trust in identity headers.
	//  • 'none'    : explicitly private/local development only.
	//  • 'path'    : private/self-host URL-path secret (/s/<secret>/mcp).
	//  • 'bearer'  : private/self-host Authorization: Bearer <token>.
	const explicitToken = options.token || TOKEN
	const urlSecret = options.urlSecret || process.env.BETTERPPTX_URL_SECRET || ''
	const wantOpen = options.open === true || process.env.BETTERPPTX_AUTH === 'none'
	let authMode, token
	const verifiedIdentityRequired = isPublicBlackBoxMode() || process.env.BETTERPPTX_AUTH === 'oauth'
	const identityVerifier = verifiedIdentityRequired ? createVerifiedIdentityVerifier({ keyResolver: options.identityKeyResolver }) : null
	const verifiedRequests = new WeakMap()
	if (verifiedIdentityRequired) { authMode = 'oauth'; token = '' }
	else if (wantOpen) { authMode = 'none'; token = '' }
	else if (urlSecret) { authMode = 'path'; token = '' }
	else { authMode = 'bearer'; token = explicitToken || randomBytes(24).toString('base64url') }
	const tokenWasGenerated = authMode === 'bearer' && !explicitToken
	const mcpPath = authMode === 'path' ? `/s/${urlSecret}/mcp` : '/mcp'
	const configuredTransportMode = String(process.env.BETTERPPTX_MCP_TRANSPORT_MODE || '').trim().toLowerCase()
	const statelessMcp = envFlag('BETTERPPTX_HTTP_STATELESS_MCP') || configuredTransportMode === 'stateless'
	const statelessRequiresInstallIdentity = statelessMcp && !envFlag('BETTERPPTX_HTTP_STATELESS_ALLOW_MISSING_INSTALL')

	// ---- File downloads. Remote web clients cannot reach a
	// file saved on the server's disk; so we serve published files over the same
	// HTTPS endpoint and the engine returns a public downloadUrl on every save.
	const downloadRoot = options.downloadRoot || process.env.BETTERPPTX_DOWNLOAD_ROOT || path.resolve(process.cwd(), 'outputs', 'public_files')
	const publicBase = (options.publicBase || process.env.BETTERPPTX_PUBLIC_BASE || '').replace(/\/+$/, '')
	try { fs.mkdirSync(downloadRoot, { recursive: true }) } catch (_) {}
	setDownloadConfig({ root: downloadRoot, base: publicBase })

	const app = express()
	app.disable('x-powered-by')
	const payPerJobBilling = String(process.env.BETTERPPTX_BILLING_MODEL || '').trim().toLowerCase() === 'pay_per_job'
	const legacyCreditRouteDisabled = res => res.status(410).json({
		error: {
			code: 'PAY_PER_JOB_ROUTE_ONLY',
			message: 'This deployment accepts one exact x402 payment per bounded job; reusable credit-pack payment routes are unavailable.',
		},
	})
	// Warm the immutable public capability manifest before binding the socket.
	// This keeps the first Role-A /health or tools/list request inside normal
	// connector preflight time even when catalog construction is cold.
	if (isPublicBlackBoxMode()) publicRuntimeManifest()
	// PAYRAM-EXCLUSIVE: payment webhooks/settlements are the PayRam routes (registerPayRamRoutes
	// below); the old dodo webhook rail is gone for good.
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
	if (process.env.BETTERPPTX_SELF_HOSTED_IDENTITY === '1') {
		app.use('/identity', createIdentityProxy({ publicBase, port: Number(process.env.BETTERPPTX_IDENTITY_PORT || 8180) }))
	}
	const jsonLimit = process.env.BETTERPPTX_JSON_LIMIT || '40mb'
	app.use(express.json({
		limit: jsonLimit,
		verify: (req, _res, buf) => { req.rawBody = buf?.length ? buf.toString('utf8') : '' },
	}))
	app.use(express.urlencoded({
		limit: '64kb',
		extended: false,
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
		req.betterpptxDiagnosticRequestId = requestId
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
			if (String(req.path || '').endsWith('/mcp')) traceMcpHttp({ requestId, method: req.method, statusCode: res.statusCode, responseBytes, durationMs, authOutcome: req.betterpptxDiagnosticAuthOutcome })
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
		withDiagnosticRequest(requestId, next)
	})

	// ---- CORS for browser-based AI clients
	app.use((req, res, next) => {
		applyCorsHeaders(req, res)
		if (req.method === 'OPTIONS') return res.sendStatus(204)
		next()
	})
	// Account-bearing HTTP routes use the same principal as MCP. No device or
	// connector header is allowed to create a customer on these routes.
	app.use(['/pay', '/payments', '/fund-wallet'], async (req, res, next) => {
		if (!verifiedIdentityRequired) return next()
		return requireVerifiedIdentity(req, res, next)
	})

	// Private worker broker. Modal workers use the same bearer token they already
	// present for lipsync, but this route is never advertised through the public
	// MCP surface. Firestore provides the cross-account key/fingerprint transaction;
	// GCS stores terminal MP4 bytes for replay without putting media in Firestore.
	app.post('/internal/avatar/idempotency/acquire', async (req, res) => {
		if (!requireAvatarWorkerBrokerToken(req, res)) return
		try {
			const result = await acquireAvatarWorkerIdempotency({ key: req.body?.key, fingerprint: req.body?.fingerprint, accountId: req.body?.accountId })
			if (result.state === 'conflict') return res.status(409).set('X-Idempotency-State', 'conflict').json(result)
			if (result.state === 'running') return res.status(409).set('X-Idempotency-State', 'running').json(result)
			if (result.state === 'completed') return res.status(200).set('X-Idempotency-State', 'completed').json(result)
			if (result.state === 'cancelled') return res.status(410).set('X-Idempotency-State', 'cancelled').json(result)
			return res.status(201).set('X-Idempotency-State', 'acquired').json(result)
		} catch (error) {
			const code = String(error?.code || 'AVATAR_IDEMPOTENCY_STORE_UNAVAILABLE')
			const status = /INVALID$/.test(code) ? 400 : code === 'AVATAR_IDEMPOTENCY_CONFLICT' ? 409 : 503
			return res.status(status).json({ error: { code, message: error?.message || 'Avatar idempotency store unavailable.' } })
		}
	})

	app.put('/internal/avatar/idempotency/result', express.raw({ type: ['video/mp4', 'application/octet-stream'], limit: '256mb' }), async (req, res) => {
		if (!requireAvatarWorkerBrokerToken(req, res)) return
		try {
			const result = await completeAvatarWorkerIdempotency({
				key: req.headers['x-idempotency-key'],
				fingerprint: req.headers['x-avatar-request-fingerprint'],
				bytes: req.body,
				contentType: req.headers['content-type'] || 'video/mp4',
			})
			if (result.state === 'cancelled') return res.status(410).set('X-Idempotency-State', 'cancelled').json(result)
			return res.status(200).set('X-Idempotency-State', result.state).json(result)
		} catch (error) {
			const code = String(error?.code || 'AVATAR_IDEMPOTENCY_STORE_UNAVAILABLE')
			const status = /INVALID$/.test(code) ? 400 : code === 'AVATAR_IDEMPOTENCY_CONFLICT' ? 409 : 503
			return res.status(status).json({ error: { code, message: error?.message || 'Avatar idempotency result could not be stored.' } })
		}
	})

	app.get('/internal/avatar/idempotency/result', async (req, res) => {
		if (!requireAvatarWorkerBrokerToken(req, res)) return
		try {
			const result = await readAvatarWorkerIdempotencyResult({ key: req.headers['x-idempotency-key'], fingerprint: req.headers['x-avatar-request-fingerprint'] })
			res.set('Cache-Control', 'no-store')
			res.set('X-Idempotency-State', 'completed')
			res.type(result.contentType)
			return res.send(result.bytes)
		} catch (error) {
			const code = String(error?.code || 'AVATAR_IDEMPOTENCY_STORE_UNAVAILABLE')
			const status = code === 'AVATAR_IDEMPOTENCY_NOT_FOUND' ? 404 : code === 'AVATAR_IDEMPOTENCY_RESULT_NOT_READY' ? 409 : code === 'AVATAR_IDEMPOTENCY_CONFLICT' ? 409 : 503
			return res.status(status).json({ error: { code, message: error?.message || 'Avatar idempotency result unavailable.' } })
		}
	})

	app.post('/internal/avatar/idempotency/cancel', async (req, res) => {
		if (!requireAvatarWorkerBrokerToken(req, res)) return
		try {
			const result = await cancelAvatarWorkerIdempotency({ key: req.body?.key, fingerprint: req.body?.fingerprint, reason: req.body?.reason })
			if (result.state === 'conflict') return res.status(409).set('X-Idempotency-State', 'conflict').json(result)
			if (result.state === 'not_found') return res.status(404).json(result)
			return res.status(200).set('X-Idempotency-State', result.state).json(result)
		} catch (error) {
			const code = String(error?.code || 'AVATAR_IDEMPOTENCY_STORE_UNAVAILABLE')
			const status = /INVALID$/.test(code) ? 400 : code === 'AVATAR_IDEMPOTENCY_CONFLICT' ? 409 : 503
			return res.status(status).json({ error: { code, message: error?.message || 'Avatar cancellation unavailable.' } })
		}
	})

	const cryptoOrderStore = payPerJobBilling ? null : createCryptoOrderStore()
	const x402QuoteStore = createX402QuoteStore()
	const walletBalanceReader = options.walletBalanceReader || readBaseWalletFundingStatus
	const orderStatusScans = new Map()

	function paymentPageHeaders(res, nonce = '') {
		res.setHeader('Cache-Control', 'no-store')
		res.setHeader('Referrer-Policy', 'no-referrer')
		res.setHeader('X-Content-Type-Options', 'nosniff')
		res.setHeader('Content-Security-Policy', [
			"default-src 'none'",
			"img-src data:",
			"style-src 'unsafe-inline'",
			nonce ? `script-src 'nonce-${nonce}'` : "script-src 'none'",
			"connect-src 'self'",
			"base-uri 'none'",
			"frame-ancestors 'none'",
			"form-action 'self'",
		].join('; '))
	}

	app.get('/payments/wallet-balance/:address', async (req, res) => {
		res.setHeader('Cache-Control', 'no-store')
		try {
			const status = await walletBalanceReader({
				address: normalizeFundingAddress(req.params.address),
				requiredAtomic: normalizeRequiredAtomic(req.query.requiredAtomic).toString(),
			})
			return res.json(status)
		} catch (error) {
			const invalid = error?.code === 'FUNDING_ADDRESS_INVALID' || error?.code === 'FUNDING_AMOUNT_INVALID'
			return res.status(invalid ? 400 : 503).json({
				error: {
					code: invalid ? error.code : 'WALLET_BALANCE_UNAVAILABLE',
					message: invalid ? error.message : 'Base USDC balance is temporarily unavailable.',
				},
			})
		}
	})

	app.get('/fund-wallet', async (req, res) => {
		const nonce = randomBytes(16).toString('base64url')
		paymentPageHeaders(res, nonce)
		try {
			const paymentNetwork = configuredBaseNetwork()
			const address = normalizeFundingAddress(req.query.address)
			const requiredAtomic = normalizeRequiredAtomic(req.query.requiredAtomic)
			const requiredUsdc = `${requiredAtomic / 1_000_000n}.${(requiredAtomic % 1_000_000n).toString().padStart(6, '0')}`
				.replace(/\.?0+$/, '')
			const statusUrl = `/payments/wallet-balance/${encodeURIComponent(address)}?requiredAtomic=${encodeURIComponent(requiredAtomic.toString())}`
			return res.type('html').send(await renderWalletFundingPage({
				address,
				requiredUsdc,
				networkName: paymentNetwork.displayName,
				chainId: paymentNetwork.chainId,
				statusUrl,
				nonce,
			}))
		} catch {
			return res.status(400).type('html').send(renderPaymentError('The wallet funding request is invalid.'))
		}
	})

	app.get('/pay/orders/new', async (req, res) => {
		if (payPerJobBilling) return legacyCreditRouteDisabled(res)
		paymentPageHeaders(res)
		let envelope
		try {
			envelope = verifyPaymentEnvelope(req.query.token, { purpose: 'topup' })
		} catch {
			return res.status(400).type('html').send(renderPaymentError())
		}
		const packId = envelope.packId || String(req.query.pack || '')
		if (!packId) {
			const paymentReadiness = paymentSurfaceReadiness({ publicBase })
			return res.type('html').send(renderPackSelection({
				token: String(req.query.token),
				packs: configuredCryptoPacks(),
				cardOnramp: paymentReadiness.surfaces.web.cardOnramp,
			}))
		}
		try {
			await cryptoOrderStore.ensureAddressInventory()
			const order = await cryptoOrderStore.createOrder({
				installHash: envelope.installHash,
				customerHash: envelope.installHash,
				envelopeJti: envelope.jti,
				packId,
			})
			return res.redirect(303, `/pay/orders/${encodeURIComponent(order.orderId)}`)
		} catch (error) {
			const status = error?.code === 'PAYMENT_ENVELOPE_REPLAYED' ? 409 : 503
			return res.status(status).type('html').send(renderPaymentError(
				status === 409 ? 'This payment link was already used.' : 'Payment order creation is temporarily unavailable.',
			))
		}
	})

	app.get('/pay/orders/:orderId', async (req, res) => {
		if (payPerJobBilling) return legacyCreditRouteDisabled(res)
		const order = await cryptoOrderStore.getOrder(req.params.orderId)
		if (!order) {
			paymentPageHeaders(res)
			return res.status(404).type('html').send(renderPaymentError('Payment order was not found.'))
		}
		const nonce = randomBytes(16).toString('base64url')
		paymentPageHeaders(res, nonce)
		const gaslessToken = process.env.BETTERPPTX_TREASURY_EVM_ADDRESS
			? tryMintPaymentEnvelope({
				purpose: 'topup',
				installHash: order.installHash,
				packId: order.packId,
				metadata: { gaslessOrderId: order.orderId },
			})
			: null
		return res.type('html').send(await renderOrderPage(cryptoOrderStore.publicOrder(order), {
			nonce,
			gasless: gaslessToken ? {
				token: gaslessToken,
				endpoint: `/pay/x402/credit-packs/${encodeURIComponent(order.packId)}`,
			} : null,
		}))
	})

	app.get('/pay/orders/:orderId/status', async (req, res) => {
		if (payPerJobBilling) return legacyCreditRouteDisabled(res)
		let order = await cryptoOrderStore.getOrder(req.params.orderId)
		if (!order) return res.status(404).json({ error: { code: 'CRYPTO_ORDER_NOT_FOUND', message: 'Payment order was not found.' } })
		const scanIntervalMs = Math.max(5000, Number(process.env.BETTERPPTX_PAYMENT_STATUS_SCAN_INTERVAL_MS || 15000))
		const lastScanAt = Number(orderStatusScans.get(order.orderId) || 0)
		const shouldScan = order.status !== 'credited'
			&& Boolean(process.env.BETTERPPTX_BASE_RPC_URL)
			&& Date.now() - lastScanAt >= scanIntervalMs
		if (shouldScan) {
			orderStatusScans.set(order.orderId, Date.now())
			try {
				await lazyRescanOrder(order.orderId, { store: cryptoOrderStore })
				order = await cryptoOrderStore.getOrder(order.orderId)
			} catch {}
		}
		if (orderStatusScans.size > 10000) {
			const cutoff = Date.now() - 86400000
			for (const [orderId, scannedAt] of orderStatusScans) {
				if (scannedAt < cutoff) orderStatusScans.delete(orderId)
			}
		}
		res.setHeader('Cache-Control', 'no-store')
		return res.json(cryptoOrderStore.publicOrder(order))
	})

	app.post('/internal/payments/base/scan', async (req, res) => {
		if (payPerJobBilling) return legacyCreditRouteDisabled(res)
		if (!requireScannerToken(req, res)) return
		try {
			const summary = await scanBaseUsdcHotWindow({ store: cryptoOrderStore })
			return res.json({ ok: true, summary })
		} catch (error) {
			return res.status(503).json({ error: { code: error?.code || 'PAYMENT_SCAN_FAILED', message: 'Payment scan failed.' } })
		}
	})

	app.post('/internal/payments/forwarders/sweep', async (req, res) => {
		if (payPerJobBilling) return legacyCreditRouteDisabled(res)
		res.setHeader('Cache-Control', 'no-store')
		if (!requireScannerToken(req, res)) return
		try {
			const summary = await sweepForwarderHotWindow({
				store: cryptoOrderStore,
				dryRun: req.body?.dryRun === true,
				limit: req.body?.limit,
			})
			recordForwarderSweeperTelemetry({ ok: true, summary })
			return res.json({ ok: true, summary })
		} catch (error) {
			recordForwarderSweeperTelemetry({ ok: false })
			const code = String(error?.code || 'FORWARDER_SWEEP_FAILED')
			const status = code === 'FORWARDER_NOT_ENABLED' ? 409
				: code === 'FORWARDER_SWEEP_RPC_NOT_CONFIGURED' || code === 'FORWARDER_SWEEPER_KEY_NOT_CONFIGURED' ? 503
					: 503
			return res.status(status).json({ error: { code, message: 'Forwarder sweep failed.' } })
		}
	})

	app.post('/internal/operations/:operationId/run', async (req, res) => {
		const configured = String(process.env.BETTERPPTX_OPERATION_WORKER_TOKEN || '')
		const supplied = String(req.headers['x-betterpptx-worker-token'] || '')
		const authorization = String(req.headers.authorization || '')
		const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
		if (configured) {
			if (supplied !== configured && bearer !== configured) {
				return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' } })
			}
		} else if (isProductionBillingEnvironment() || process.env.BETTERPPTX_OPERATION_WORKER_ALLOW_UNAUTHENTICATED !== '1') {
			return res.status(401).json({ error: { code: 'OPERATION_WORKER_TOKEN_REQUIRED', message: 'Operation worker token is required.' } })
		}
		const operationId = String(req.params.operationId || req.body?.operationId || '').trim()
		if (!operationId || (req.body?.operationId && String(req.body.operationId) !== operationId)) {
			return res.status(400).json({ error: { code: 'OPERATION_ID_INVALID', message: 'Operation id is invalid.' } })
		}
		try {
			const status = await runDurableOperationById(operationId, {
				leaseOwner: `http-worker:${process.pid}`,
			})
			return res.json({ ok: true, operation: status })
		} catch (error) {
			const code = String(error?.code || 'OPERATION_WORKER_FAILED')
			const status = code === 'OPERATION_NOT_FOUND' ? 404
				: code === 'OPERATION_REQUEST_MISSING' || code === 'OPERATION_ID_INVALID' ? 400
					: code === 'OPERATION_ALREADY_LEASED' ? 202
						: 500
			return res.status(status).json({ error: { code, message: error?.message || 'Operation worker failed.' } })
		}
	})

	app.post('/pay/x402/credit-packs/:packId', async (req, res) => {
		if (payPerJobBilling) return legacyCreditRouteDisabled(res)
		try { assertProductionBillingConfiguration() } catch (error) {
			return res.status(503).json({ error: { code: error.code, message: 'Payment execution is not enabled for this deployment.' } })
		}
		let installBinding = null
		try {
			const headerIdentity = requestInstallIdentity(req)
			const envelopeToken = String(req.body?.token || req.query?.token || '').trim()
			const envelope = envelopeToken ? verifyPaymentEnvelope(envelopeToken, { purpose: 'topup' }) : null
			if (headerIdentity && envelope && headerIdentity.installHash !== envelope.installHash) {
				return res.status(401).json({ error: { code: 'INSTALL_IDENTITY_MISMATCH', message: 'Payment identity mismatch.' } })
			}
			if (envelope?.packId && envelope.packId !== String(req.params.packId)) {
				return res.status(400).json({ error: { code: 'X402_QUOTE_BINDING_INVALID', message: 'Payment pack mismatch.' } })
			}
			installBinding = envelope
				? { installHash: envelope.installHash, envelopeJti: quoteKeyForPaymentEnvelope(envelope) }
				: headerIdentity
					? { installHash: headerIdentity.installHash, envelopeJti: '' }
					: null
		} catch {
			return res.status(400).json({ error: { code: 'X402_INSTALL_BINDING_INVALID', message: 'Payment identity is invalid.' } })
		}
		if (!installBinding) {
			return res.status(400).json({ error: { code: 'X402_INSTALL_BINDING_MISSING', message: 'A device identity is required before payment can be requested.' } })
		}

		const paymentPayload = req.body?.paymentPayload
			|| req.headers['payment-signature']
			|| req.headers['x-payment']
			|| null
		if (!paymentPayload) {
			try {
				const quote = await x402QuoteStore.createQuote({
					installHash: installBinding.installHash,
					envelopeJti: installBinding.envelopeJti,
					packId: req.params.packId,
				})
				res.setHeader('Cache-Control', 'no-store')
				const paymentRequired = publicX402Quote(quote)
				res.setHeader('PAYMENT-REQUIRED', encodeBase64Json(paymentRequired))
				return res.status(402).json(paymentRequired)
			} catch (error) {
				if (error?.code === 'PAYMENT_ENVELOPE_REPLAYED' && installBinding.envelopeJti &&
					typeof x402QuoteStore.getQuoteByEnvelopeJti === 'function') {
					const existing = await x402QuoteStore.getQuoteByEnvelopeJti(installBinding.envelopeJti)
					if (existing && existing.installHash === installBinding.installHash && existing.packId === String(req.params.packId)) {
						res.setHeader('Cache-Control', 'no-store')
						const paymentRequired = publicX402Quote(existing)
						res.setHeader('PAYMENT-REQUIRED', encodeBase64Json(paymentRequired))
						return res.status(402).json(paymentRequired)
					}
				}
				const status = error?.code === 'PAYMENT_ENVELOPE_REPLAYED' ? 409 : error?.code === 'CRYPTO_PACK_NOT_FOUND' ? 404 : 503
				return res.status(status).json({ error: { code: error?.code || 'X402_QUOTE_FAILED', message: 'Unable to create payment quote.' } })
			}
		}

		const decodedPayment = decodePaymentHeader(paymentPayload)
		const quoteId = String(
			req.body?.quoteId
			|| decodedPayment?.accepted?.extra?.quoteId
			|| decodedPayment?.paymentRequirements?.extra?.quoteId
			|| decodedPayment?.payload?.quoteId
			|| '',
		).trim()
		if (!quoteId) return res.status(400).json({ error: { code: 'X402_QUOTE_ID_MISSING', message: 'x402 quote id is required.' } })
		try {
			const quote = await x402QuoteStore.getQuote(quoteId)
			if (!quote || quote.installHash !== installBinding.installHash || quote.packId !== String(req.params.packId)
				|| (installBinding.envelopeJti && quote.envelopeJti !== installBinding.envelopeJti)) {
				return res.status(400).json({ error: { code: 'X402_QUOTE_BINDING_INVALID', message: 'x402 quote binding is invalid.' } })
			}
			const settled = await settleX402Quote({
				quoteId,
				paymentPayload,
				store: x402QuoteStore,
			})
			res.setHeader('Cache-Control', 'no-store')
			if (settled.settlement) res.setHeader('PAYMENT-RESPONSE', encodeBase64Json(settled.settlement))
			return res.json({
				ok: true,
				settled: true,
				idempotent: settled.idempotent,
				packId: settled.quote.packId,
				creditedCredits: settled.creditedCredits,
			})
		} catch (error) {
			const code = String(error?.code || 'X402_SETTLEMENT_FAILED')
			const status = code === 'X402_PAYMENT_INVALID' || code === 'X402_AUTHORIZATION_CONSUMED_WITHOUT_PAYMENT' ? 402
				: code === 'X402_QUOTE_EXPIRED' ? 410
					: code === 'X402_SETTLEMENT_PENDING' || code === 'X402_RELAYER_NOT_CONFIGURED' ? 503
						: 400
			if (code === 'X402_SETTLEMENT_PENDING') res.setHeader('Retry-After', '5')
			return res.status(status).json({ error: { code, message: 'x402 payment could not be settled.' } })
		}
	})

	// ---- Health + info (no auth)
	app.get('/', (req, res) => {
		const blackBox = isPublicBlackBoxMode()
		const toolNameProfile = toolNameProfileFromRequest(req)
		const visibleTools = publicToolList(TOOLS, { toolNameProfile })
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
		const manifest = publicRuntimeManifest({ toolNameProfile })
		res.setHeader('Cache-Control', 'no-store')
		res.json({
			service: BETTERPPTX_BRAND,
			product: BETTERPPTX_PRODUCT,
			endpoint: mcpPath,
			connectorUrl,
			semanticVersion: manifest.semanticVersion,
			toolSchemaVersion: manifest.toolSchemaVersion,
			buildIdentity: manifest.buildIdentity,
			sourceIdentity: manifest.sourceIdentity,
			capabilityContentDigest: manifest.capabilityContentDigest,
			capabilityControlDigest: manifest.capabilityControlDigest,
			authRequired: authMode === 'bearer' || verifiedIdentityRequired,
			webConnectorReady: verifiedIdentityRequired ? identityVerifier.configured : authMode !== 'bearer',
			...(verifiedIdentityRequired ? { identityPolicy: publicIdentityPolicy(identityVerifier) } : {}),
			mcpProtocol: publicMcpProtocolManifest(),
			...(blackBox ? {} : {
				version: manifest.semanticVersion,
				transport: 'streamable-http',
				selfContained: true,
				blackBox,
				authMode,
				externalPptxLibrariesRequired: false,
				logger: getLoggerInfo(),
				docs: 'https://modelcontextprotocol.io/specification/2026-07-28/basic',
			}),
		})
	})
	app.get('/health', (req, res) => {
		const stats = getEngineStats()
		const manifest = publicRuntimeManifest({ toolNameProfile: toolNameProfileFromRequest(req) })
		res.setHeader('Cache-Control', 'no-store')
		res.json(isPublicBlackBoxMode()
			? {
				status: 'ok',
				service: BETTERPPTX_BRAND,
				identityPolicy: publicIdentityPolicy(identityVerifier || {}),
				semanticVersion: manifest.semanticVersion,
				toolSchemaVersion: manifest.toolSchemaVersion,
				buildIdentity: manifest.buildIdentity,
				sourceIdentity: manifest.sourceIdentity,
				schemaChange: manifest.schemaChange,
				capabilityContentDigest: manifest.capabilityContentDigest,
				capabilityControlDigest: manifest.capabilityControlDigest,
				controlRegistryVersion: manifest.controlRegistryVersion,
				authoringLessonCount: manifest.authoringLessonCount,
				capabilityContentDigestCoverage: manifest.capabilityContentDigestCoverage,
				advertisedToolSchemaDigest: manifest.advertisedToolSchemaDigest,
				advertisedToolSchemaDigestCoverage: manifest.advertisedToolSchemaDigestCoverage,
				observedAt: manifest.observedAt,
				advertisedToolCount: manifest.capabilityDiscovery?.inventory?.serverAdvertisedToolCount ?? null,
				capabilityFamilyCount: manifest.capabilityDiscovery?.inventory?.registeredFamilyCount ?? null,
				mcpProtocol: manifest.mcpProtocol,
			}
			: { status: 'ok', service: BETTERPPTX_BRAND, sessions: sessions.size, mcpTransportMode: statelessMcp ? 'stateless' : 'stateful', engine: stats, logger: getLoggerInfo(), mcpProtocol: manifest.mcpProtocol })
	})
	function wellKnownOrigin(req) {
		return publicBase || `${req.protocol}://${req.get('host') || `${host}:${port}`}`
	}
	function sendProtectedResourceMetadata(req, res) {
		res.setHeader('Cache-Control', 'no-store')
		res.json(oauthProtectedResourceMetadata({
			publicBase,
			mcpPath,
			authMode,
			requestOrigin: wellKnownOrigin(req),
		}))
	}
	app.get('/.well-known/oauth-protected-resource', sendProtectedResourceMetadata)
	app.get('/.well-known/oauth-protected-resource/mcp', sendProtectedResourceMetadata)
	if (authMode === 'path') {
		app.get(`/.well-known/oauth-protected-resource/s/${urlSecret}/mcp`, sendProtectedResourceMetadata)
	}
	function sendAuthorizationServerMetadata(req, res) {
		const metadata = oauthAuthorizationServerMetadata()
		if (!metadata) return res.status(404).json({ error: { code: 'OAUTH_AUTHORIZATION_SERVER_NOT_CONFIGURED', message: 'No authorization server is configured for this deployment.' } })
		res.setHeader('Cache-Control', 'no-store')
		return res.json(metadata)
	}
	for (const metadataPath of oauthAuthorizationServerCompatibilityPaths()) {
		app.get(metadataPath, sendAuthorizationServerMetadata)
	}
	app.get('/payments/capabilities', (req, res) => {
		let installHash = ''
		try {
			installHash = requestInstallIdentity(req)?.installHash || ''
		} catch (error) {
			return sendInstallIdentityError(res, error)
		}
		res.setHeader('Cache-Control', 'no-store')
		return res.json(paymentSurfaceReadiness({ installHash, publicBase }))
	})
	app.get('/tools', (req, res) => {
		const toolNameProfile = toolNameProfileFromRequest(req)
		const visibleTools = publicToolList(TOOLS, { toolNameProfile })
		const manifest = publicRuntimeManifest({ toolNameProfile })
		res.setHeader('Cache-Control', 'no-store')
		res.json({
			count: visibleTools.length,
			semanticVersion: manifest.semanticVersion,
			toolSchemaVersion: manifest.toolSchemaVersion,
			buildIdentity: manifest.buildIdentity,
			sourceIdentity: manifest.sourceIdentity,
			capabilityContentDigest: manifest.capabilityContentDigest,
			capabilityControlDigest: manifest.capabilityControlDigest,
			controlRegistryVersion: manifest.controlRegistryVersion,
			authoringLessonCount: manifest.authoringLessonCount,
			capabilityContentDigestCoverage: manifest.capabilityContentDigestCoverage,
			advertisedToolSchemaDigest: manifest.advertisedToolSchemaDigest,
			advertisedToolSchemaDigestCoverage: manifest.advertisedToolSchemaDigestCoverage,
			observedAt: manifest.observedAt,
			tools: visibleTools.map(t => ({ name: t.name, title: t.title, description: t.description })),
		})
	})
	app.get('/ops/mission-control', (req, res) => {
		const access = missionControlAccess(req)
		if (!access.allowed) return sendMissionControlDenied(res, access)
		res.setHeader('Cache-Control', 'no-store')
		res.type('html').send(renderMissionControlPage())
	})
	app.get('/ops/mission-control/data', (req, res) => {
		const access = missionControlAccess(req)
		if (!access.allowed) return sendMissionControlDenied(res, access)
		res.setHeader('Cache-Control', 'no-store')
		res.json(buildMissionControlSnapshot({
			sessions,
			visibleTools: publicToolList(TOOLS, { toolNameProfile: toolNameProfileFromRequest(req) }),
			authMode,
			mcpPath,
			accessMode: access.mode,
		}))
	})
	// Owner-private live payment/relayer health (plan 24A.11 / 31.4). Never public:
	// gated by Mission Control access; performs an on-demand relayer balance + lease
	// probe rather than burdening the polled snapshot. Returns redacted detail only.
	app.get('/ops/mission-control/payment-health', async (req, res) => {
		const access = missionControlAccess(req)
		if (!access.allowed) return sendMissionControlDenied(res, access)
		res.setHeader('Cache-Control', 'no-store')
		try {
			res.json(await buildPaymentHealth({}))
		} catch (error) {
			logEvent('http.mission_control.payment_health_failed', { reason: error?.code || 'probe-failed' })
			res.status(503).json({ error: { code: 'PAYMENT_HEALTH_UNAVAILABLE', message: 'Payment health probe failed.' } })
		}
	})
	app.get('/ops/mission-control/secrets', async (req, res) => {
		const access = missionControlAccess(req)
		if (!access.allowed) return sendMissionControlDenied(res, access)
		try {
			res.setHeader('Cache-Control', 'no-store')
			res.json(await getMissionControlSecretsSnapshot())
		} catch (err) {
			return sendMissionControlSecretError(res, { action: 'list' }, err)
		}
	})
	app.post('/ops/mission-control/secrets/:id/reveal', async (req, res) => {
		const access = missionControlAdminAccess(req)
		if (!access.allowed) return sendMissionControlDenied(res, access)
		const id = String(req.params.id || '')
		try {
			res.setHeader('Cache-Control', 'no-store')
			res.json(await revealMissionControlSecret(id, { confirm: req.body?.confirm }))
		} catch (err) {
			return sendMissionControlSecretError(res, { action: 'reveal', id }, err)
		}
	})
	app.post('/ops/mission-control/secrets/:id/update', async (req, res) => {
		const access = missionControlAdminAccess(req)
		if (!access.allowed) return sendMissionControlDenied(res, access)
		const id = String(req.params.id || '')
		try {
			res.setHeader('Cache-Control', 'no-store')
			res.json(await updateMissionControlSecret(id, { value: req.body?.value, confirm: req.body?.confirm }))
		} catch (err) {
			return sendMissionControlSecretError(res, { action: 'update', id }, err)
		}
	})
	app.post('/ops/mission-control/secrets/:id/rotate', async (req, res) => {
		const access = missionControlAdminAccess(req)
		if (!access.allowed) return sendMissionControlDenied(res, access)
		const id = String(req.params.id || '')
		try {
			res.setHeader('Cache-Control', 'no-store')
			res.json(await rotateMissionControlSecret(id, { confirm: req.body?.confirm }))
		} catch (err) {
			return sendMissionControlSecretError(res, { action: 'rotate', id }, err)
		}
	})
	app.post('/ops/mission-control/secrets/:id/test', async (req, res) => {
		const access = missionControlAdminAccess(req)
		if (!access.allowed) return sendMissionControlDenied(res, access)
		const id = String(req.params.id || '')
		try {
			res.setHeader('Cache-Control', 'no-store')
			res.json(await testMissionControlSecret(id))
		} catch (err) {
			return sendMissionControlSecretError(res, { action: 'test', id }, err)
		}
	})
	app.post('/ops/mission-control/billing/goodwill-credit', async (req, res) => {
		const access = missionControlAdminAccess(req)
		if (!access.allowed) return sendMissionControlDenied(res, access)
		try {
			const operatorFingerprint = ownerOperatorFingerprint(req.headers['x-betterpptx-mission-control-admin-token'])
			res.setHeader('Cache-Control', 'no-store')
			res.json(await grantOwnerGoodwillCredits(req.body || {}, { operatorFingerprint }))
		} catch (err) {
			return sendOwnerGoodwillError(res, err)
		}
	})

	// Browser links carry a short-lived, owner-issued capability proof. The bare
	// file URL still requires the verified account and artifact ownership.
	app.get('/files/:token/:name', async (req, res, next) => {
		const routePath = `/files/${req.params.token}/${encodeURIComponent(req.params.name)}`
		traceArtifactDelivery({ phase: 'requested', routePath })
		res.on('finish', () => traceArtifactDelivery({ phase: 'finished', routePath, statusCode: res.statusCode, bytes: res.locals.betterpptxDownloadBytes, completed: true }))
		res.on('close', () => {
			if (!res.writableFinished) traceArtifactDelivery({ phase: 'aborted', routePath, statusCode: res.statusCode, bytes: res.locals.betterpptxDownloadBytes, completed: false })
		})
		if (Object.hasOwn(req.query || {}, 'permit')) {
			// ChatGPT decorates outbound Markdown links with utm_source. It is
			// non-authorizing metadata; ignore only this exact bounded form while
			// continuing to verify the original signed permit and file identity.
			if (!isPermittedBrowserGrantQuery(req.query)
				|| !verifyLocalArtifactBrowserGrant({ root: downloadRoot, token: req.params.token,
					name: req.params.name, permit: req.query.permit })) {
				return res.status(404).json({ error: { code: 'ARTIFACT_NOT_FOUND', message: 'The artifact is unavailable.' } })
			}
			req.betterpptxBrowserDownloadGrant = true
			return next()
		}
		if (!verifiedIdentityRequired) return next()
		return requireVerifiedIdentity(req, res, next)
	}, async (req, res) => {
		const token = String(req.params.token || '')
		const name = String(req.params.name || '')         // express already URL-decodes route params
		if (!/^[A-Za-z0-9_-]{6,}$/.test(token) || !/^[A-Za-z0-9._() -]+$/.test(name) || name.includes('..') || name.startsWith('.')) {
			recordDownloadTelemetry({ ok: false })
			return res.status(400).json({ error: { code: -32602, message: 'bad download request' } })
		}
		if (verifiedIdentityRequired && !req.betterpptxBrowserDownloadGrant
			&& !await verifyLocalArtifactOwner({ root: downloadRoot, token, name, context: verifiedRequests.get(req) })) {
			return res.status(404).json({ error: { code: 'ARTIFACT_NOT_FOUND', message: 'The artifact is unavailable.' } })
		}
		const resolved = path.resolve(downloadRoot, token, name)
		if (resolved !== path.join(path.resolve(downloadRoot), token, name) || !fs.existsSync(resolved)) {
			recordDownloadTelemetry({ ok: false })
			return res.status(404).json({ error: { code: -32004, message: 'file not found' } })
		}
		const stat = fs.statSync(resolved)
		res.locals.betterpptxDownloadBytes = stat.size
		res.setHeader('Content-Type', mimeFor(name))
		res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/"/g, '')}"`)
		res.setHeader('Cache-Control', 'private, no-store')
		res.setHeader('Referrer-Policy', 'no-referrer')
		res.setHeader('X-Content-Type-Options', 'nosniff')
		recordDownloadTelemetry({ ok: true, bytes: stat.size })
		recordResourceUnitEvent({
			eventType: 'artifact_download',
			usage: { egressBytes: stat.size, gcsClassBOps: 0 },
			metadata: { delivery: 'local-http' },
		})
		logEvent('http.download', { bytes: stat.size })
		fs.createReadStream(resolved).on('error', () => {
			recordDownloadTelemetry({ ok: false })
			if (!res.headersSent) res.status(500).end()
		}).pipe(res)
	})

	// Public protected requests require a verified account regardless of legacy
	// URL/token options. Anonymous access is restricted to explicit discovery.
	function sendMcpAuthenticationChallenge(req, res, { status = 401 } = {}) {
		const message = req.body
		if (req.method !== 'POST' || !message || typeof message !== 'object' || Array.isArray(message)
			|| message.method !== 'tools/call' || !Object.hasOwn(message, 'id')) return false
		const suppliedToken = /^Bearer\s+\S+/i.test(String(req.headers.authorization || ''))
		const oauthError = suppliedToken ? 'invalid_token' : status === 403 ? 'insufficient_scope' : 'insufficient_scope'
		const errorDescription = suppliedToken
			? 'The BetterPPTX access token is invalid, expired, or not valid for this resource. Sign in again.'
			: 'Sign in to BetterPPTX to use this protected presentation capability.'
		const challenge = wwwAuthenticateHeader({
			publicBase,
			scope: 'betterpptx',
			error: oauthError,
			errorDescription,
		})
		res.setHeader('WWW-Authenticate', challenge)
		res.setHeader('Cache-Control', 'no-store')
		res.status(200).json({
			jsonrpc: '2.0',
			id: message.id,
			result: {
				content: [{ type: 'text', text: errorDescription }],
				isError: true,
				_meta: { 'mcp/www_authenticate': [challenge] },
			},
		})
		return true
	}

	async function requireVerifiedIdentity(req, res, next) {
		try {
			const principal = await identityVerifier.verifyRequest(req)
			verifiedRequests.set(req, principal)
			req.betterpptxDiagnosticAuthOutcome = 'accepted'
			traceAuthDecision({ requestId: req.betterpptxDiagnosticRequestId, outcome: 'accepted' })
			return next()
		} catch (error) {
			const status = [401, 403, 503].includes(error?.status) ? error.status : 401
			req.betterpptxDiagnosticAuthOutcome = 'rejected'
			traceAuthDecision({ requestId: req.betterpptxDiagnosticRequestId, outcome: 'rejected', code: error?.code || 'AUTHENTICATION_REQUIRED' })
			logEvent('http.verified_identity.rejected', {
				status,
				code: error?.code || 'AUTHENTICATION_REQUIRED',
				diagnostic: error?.diagnostic || null,
			})
			res.setHeader('Cache-Control', 'no-store')
			if (status !== 503 && sendMcpAuthenticationChallenge(req, res, { status })) return
			res.setHeader('WWW-Authenticate', wwwAuthenticateHeader({
				publicBase,
				scope: 'betterpptx',
				error: status === 403 ? 'insufficient_scope' : 'invalid_token',
				errorDescription: status === 503
					? 'Verified sign-in is temporarily unavailable.'
					: 'A valid BetterPPTX account access token is required.',
			}))
			return res.status(status).json({ error: {
				code: status === 503 ? 'IDENTITY_PROVIDER_UNAVAILABLE' : status === 403 ? 'INSUFFICIENT_AUTHENTICATION' : 'AUTHENTICATION_REQUIRED',
				message: status === 503 ? 'Verified sign-in is not available. Protected operations are disabled until the owner configures the identity provider.' : 'A valid account access token for BetterPPTX is required.',
			} })
		}
	}
	async function authGuard(req, res, next) {
		if (verifiedIdentityRequired) {
			if (req.method === 'POST' && !req.headers.authorization && anonymousMcpRequestAllowed(req.body)) {
				req.betterpptxDiagnosticAuthOutcome = 'anonymous'
				traceAuthDecision({ requestId: req.betterpptxDiagnosticRequestId, outcome: 'anonymous' })
				return next()
			}
			return requireVerifiedIdentity(req, res, next)
		}
		if (authMode !== 'bearer') {
			req.betterpptxDiagnosticAuthOutcome = 'anonymous'
			traceAuthDecision({ requestId: req.betterpptxDiagnosticRequestId, outcome: 'anonymous' })
			return next()
		}
		const auth = req.headers.authorization || ''
		const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
		if (!bearer || bearer !== token) {
			req.betterpptxDiagnosticAuthOutcome = 'rejected'
			traceAuthDecision({ requestId: req.betterpptxDiagnosticRequestId, outcome: 'rejected', code: 'INVALID_BEARER' })
			res.setHeader('WWW-Authenticate', wwwAuthenticateHeader({
				publicBase,
				requestOrigin: `${req.protocol}://${req.get('host') || `${host}:${port}`}`,
			}))
			return res.status(401).json({
				error: { code: -32001, message: 'Unauthorized: missing or invalid Bearer token' },
			})
		}
		req.betterpptxDiagnosticAuthOutcome = 'accepted'
		traceAuthDecision({ requestId: req.betterpptxDiagnosticRequestId, outcome: 'accepted' })
		next()
	}

	function requestInstallIdentity(req) {
		if (verifiedIdentityRequired) return verifiedRequests.get(req) || null
		try {
			return installIdentityFromHeaders(req.headers)
		} catch (error) {
			if (error instanceof InstallIdentityError) throw error
			throw new InstallIdentityError('INSTALL_IDENTITY_INVALID', 'The device identity header is invalid.')
		}
	}

	function requestResourceIdentity(req, { requireInstall = false } = {}) {
		if (verifiedIdentityRequired) return verifiedRequests.get(req) || {}
		const explicit = requireInstall ? requestStatelessInstallIdentity(req) : requestInstallIdentity(req)
		// The OpenAI web connector uses MCP v2's stateless request shape and does
		// not send x-betterpptx-device. Its gateway does provide a stable,
		// server-derived continuity pair. Bind public opaque resources to that
		// continuity identity so a follow-up call can reuse audio/deck/operation
		// handles without turning those headers into an authentication mechanism.
		const connector = !explicit?.installHash && authMode === 'none' && isPublicBlackBoxMode()
			? connectorIdentityFromHeaders(req.headers, { scope: publicBase })
			: null
		return {
			...(explicit || {}),
			...(connector || {}),
		}
	}

	function sendInstallIdentityError(res, error, status = 400) {
		const code = error instanceof InstallIdentityError ? error.code : 'INSTALL_IDENTITY_INVALID'
		logEvent('http.install_identity.rejected', { code, status })
		return res.status(status).json({
			error: {
				code,
				message: status === 401 ? 'The device identity does not match this MCP session.' : 'The device identity header is invalid.',
			},
		})
	}

	registerPayRamRoutes(app, {
		requestInstallIdentity,
		fetchFn: options.payramFetch || null,
	})

	function assertSessionInstallIdentity(req, entry) {
		const requestIdentity = requestInstallIdentity(req)
		const expected = String(entry?.installHash || '')
		const received = String(requestIdentity?.installHash || '')
		if (expected !== received) {
			throw new InstallIdentityError('INSTALL_IDENTITY_MISMATCH', 'The device identity does not match this MCP session.')
		}
		return requestIdentity
	}

	function requestStatelessInstallIdentity(req) {
		const identity = requestInstallIdentity(req)
		if (!identity?.installHash && statelessRequiresInstallIdentity) {
			throw new InstallIdentityError('INSTALL_IDENTITY_REQUIRED', 'A device identity header is required for stateless MCP requests.')
		}
		return identity
	}

	// ---- Stateful session registry
	const sessions = new Map()  // sessionId -> { transport, server, installHash, lastSeenAt, activeRequests }
	function touchSession(entry) {
		entry.lastSeenAt = Date.now()
	}
	async function handleSessionRequest(entry, req, res, body) {
		entry.activeRequests = Math.max(0, Number(entry.activeRequests || 0)) + 1
		touchSession(entry)
		try {
			await entry.transport.handleRequest(req, res, body)
		} finally {
			entry.activeRequests = Math.max(0, Number(entry.activeRequests || 0) - 1)
			touchSession(entry)
		}
	}

	async function handleStatelessMcpPost(req, res) {
		let resourceIdentity
		try {
			resourceIdentity = requestResourceIdentity(req, { requireInstall: true })
		} catch (error) {
			return sendInstallIdentityError(res, error, error?.code === 'INSTALL_IDENTITY_REQUIRED' ? 401 : 400)
		}
		const requestId = createTraceId('mcpstateless')
		const clientInfo = initializeClientInfo(req.body)
		const toolNameProfile = toolNameProfileFromRequest(req)
		const transport = new NodeStreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
		})
		const mcpServer = createBetterPptxMcpServer({
			...resourceIdentity,
			sessionId: resourceIdentity.resourceIdentityHash || requestId,
			clientInfo,
			toolNameProfile,
			installHash: resourceIdentity.installHash || null,
			resourceIdentityHash: resourceIdentity.resourceIdentityHash || null,
			quotaIdentityHash: resourceIdentity.quotaIdentityHash || null,
			installState: {},
		})
		let closed = false
		const closeOnce = async () => {
			if (closed) return
			closed = true
			try { await transport.close() } catch (_) {}
			try { await mcpServer.close?.() } catch (_) {}
		}
		res.on('close', () => { closeOnce() })
		try {
			await mcpServer.connect(transport)
			logEvent('http.stateless_mcp.request', {
				requestId,
				method: req.body?.method || (Array.isArray(req.body) ? 'batch' : ''),
				clientInfo,
				toolNameProfile,
				installBound: Boolean(resourceIdentity.installHash),
				resourceBound: Boolean(resourceIdentity.resourceIdentityHash),
			})
			await transport.handleRequest(req, res, req.body)
		} catch (error) {
			await closeOnce()
			process.stderr.write(`[betterpptx:http] stateless POST /mcp error: ${error?.stack || error}\n`)
			logEvent('http.stateless_mcp.error', { requestId, error: { message: String(error?.message || error), stack: error?.stack } })
			if (!res.headersSent) {
				res.status(500).json({
					jsonrpc: '2.0',
					error: { code: -32603, message: String(error?.message || error) },
					id: req.body?.id ?? null,
				})
			}
		}
	}

	// Idle session sweep (30 min)
	const IDLE_TTL_MS = 30 * 60 * 1000
	const sweepHandle = setInterval(() => {
		const now = Date.now()
		for (const [sid, s] of sessions) {
			if (Number(s.activeRequests || 0) > 0) continue
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
		if (isMcpV2Request(req, req.body)) {
			let resourceIdentity
			try {
				resourceIdentity = requestResourceIdentity(req, { requireInstall: statelessMcp })
			} catch (error) {
				return sendInstallIdentityError(res, error, error?.code === 'INSTALL_IDENTITY_REQUIRED' ? 401 : 400)
			}
			const requestId = req.betterpptxDiagnosticRequestId || createTraceId('mcpv2')
			logEvent('http.mcp_v2.request', {
				requestId,
				method: req.body?.method || (Array.isArray(req.body) ? 'batch' : ''),
				installBound: Boolean(resourceIdentity.installHash),
				resourceBound: Boolean(resourceIdentity.resourceIdentityHash),
			})
			return handleMcpV2Post(req, res, {
				...resourceIdentity,
				requestId,
				sessionId: resourceIdentity.resourceIdentityHash || requestId,
				toolNameProfile: toolNameProfileFromRequest(req),
				installHash: resourceIdentity.installHash || null,
				resourceIdentityHash: resourceIdentity.resourceIdentityHash || null,
				quotaIdentityHash: resourceIdentity.quotaIdentityHash || null,
				installState: {},
				blackBox: isPublicBlackBoxMode(),
			})
		}
		if (statelessMcp) return handleStatelessMcpPost(req, res)
		try {
			const sid = req.headers['mcp-session-id']
			let entry
			if (sid && sessions.has(sid)) {
				entry = sessions.get(sid)
				try {
					assertSessionInstallIdentity(req, entry)
				} catch (error) {
					return sendInstallIdentityError(res, error, 401)
				}
				touchSession(entry)
			} else if (!sid && isInitializeRequest(req.body)) {
				let resourceIdentity
				try {
					resourceIdentity = requestResourceIdentity(req)
				} catch (error) {
					return sendInstallIdentityError(res, error)
				}
				const newSid = randomUUID()
				const clientInfo = initializeClientInfo(req.body)
				const toolNameProfile = toolNameProfileFromRequest(req)
				const transport = new NodeStreamableHTTPServerTransport({
					sessionIdGenerator: () => newSid,
				})
				const installState = {}
				const mcpServer = createBetterPptxMcpServer({
					...resourceIdentity,
					sessionId: resourceIdentity.resourceIdentityHash || newSid,
					clientInfo,
					toolNameProfile,
					installHash: resourceIdentity.installHash || null,
					resourceIdentityHash: resourceIdentity.resourceIdentityHash || null,
					quotaIdentityHash: resourceIdentity.quotaIdentityHash || null,
					installState,
				})
				await mcpServer.connect(transport)
				entry = {
					transport,
					server: mcpServer,
					installHash: resourceIdentity.installHash || null,
					resourceIdentityHash: resourceIdentity.resourceIdentityHash || null,
					quotaIdentityHash: resourceIdentity.quotaIdentityHash || null,
					installState,
					lastSeenAt: Date.now(),
					activeRequests: 0,
					clientInfo,
				}
				sessions.set(newSid, entry)
				transport.onclose = () => sessions.delete(newSid)
				process.stderr.write(`[betterpptx:http] session opened ${newSid}\n`)
				logEvent('http.session.opened', { sessionId: newSid, authMode, clientInfo, toolNameProfile, installBound: Boolean(entry.installHash), resourceBound: Boolean(entry.resourceIdentityHash) })
			} else {
				return res.status(400).json({
					jsonrpc: '2.0',
					error: { code: -32000, message: 'Bad Request: no valid session ID and not an initialize request' },
					id: req.body?.id ?? null,
				})
			}
			await handleSessionRequest(entry, req, res, req.body)
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
		if (statelessMcp) {
			if (String(req.headers.accept || '').includes('text/html')) return res.redirect(302, '/')
			return res.status(405).json({
				jsonrpc: '2.0',
				error: { code: -32000, message: 'Method not allowed for stateless MCP transport.' },
				id: null,
			})
		}
		const sid = req.headers['mcp-session-id']
		// A human pasting the full /mcp link into a browser has no MCP session; send
		// them to the landing page with client setup instructions instead of a
		// bare 404. Real SSE clients send mcp-session-id + Accept: text/event-stream.
		if (!sid && String(req.headers.accept || '').includes('text/html')) return res.redirect(302, '/')
		if (!sid || !sessions.has(sid)) {
			const accept = String(req.headers.accept || '')
			if (!accept.includes('text/event-stream')) {
				res.setHeader('Allow', 'GET, POST, DELETE, OPTIONS')
				res.setHeader('Cache-Control', 'no-store')
				return res.status(200).json({
					status: 'ok',
					service: BETTERPPTX_BRAND,
					...mcpV2HandshakePayload({ mcpPath }),
					docs: 'https://modelcontextprotocol.io/specification/2026-07-28/basic',
				})
			}
			return res.status(404).json({ error: { code: -32004, message: 'Session not found' } })
		}
		const entry = sessions.get(sid)
		try {
			assertSessionInstallIdentity(req, entry)
		} catch (error) {
			return sendInstallIdentityError(res, error, 401)
		}
		touchSession(entry)
		try {
			await handleSessionRequest(entry, req, res)
		} catch (e) {
			process.stderr.write(`[betterpptx:http] GET /mcp error: ${e?.stack || e}\n`)
			logEvent('http.get_mcp.error', { sessionId: sid, error: { message: String(e?.message || e), stack: e?.stack } })
		}
	})

	// ---- DELETE /mcp — explicit session close
	app.delete(mcpPath, authGuard, async (req, res) => {
		if (statelessMcp) {
			return res.status(405).json({
				jsonrpc: '2.0',
				error: { code: -32000, message: 'Method not allowed for stateless MCP transport.' },
				id: null,
			})
		}
		const sid = req.headers['mcp-session-id']
		if (!sid || !sessions.has(sid)) {
			return res.status(404).json({ error: { code: -32004, message: 'Session not found' } })
		}
		const entry = sessions.get(sid)
		try {
			assertSessionInstallIdentity(req, entry)
		} catch (error) {
			return sendInstallIdentityError(res, error, 401)
		}
		try { await handleSessionRequest(entry, req, res) } catch (_) {}
		try { entry.transport.close() } catch (_) {}
		sessions.delete(sid)
		logEvent('http.session.deleted', { sessionId: sid })
	})

	// Production shared-store boot gate (section 24A.12 / 31.4): in public
	// black-box mode with shared stores required, refuse to start unless the
	// quote/ledger/relayer stores are truly shared and the quote store is
	// reachable (a real read, not an environment-string check).
	if (isPublicBlackBoxMode() && process.env.BETTERPPTX_REQUIRE_SHARED_STORES === '1') {
		const probeTimeoutMs = Math.max(1000, Number(process.env.BETTERPPTX_BOOT_PROBE_TIMEOUT_MS || 8000) || 8000)
		try {
			await assertProductionSharedStores({ x402QuoteStore, probeTimeoutMs })
			logEvent('http.boot.shared_store_probe_ok', {})
		} catch (error) {
			logEvent('http.boot.shared_store_probe_failed', { reason: error?.code || 'probe-failed' })
			throw new Error(`Shared-store boot probe failed (${error?.code || 'probe-failed'}); refusing to start in production black-box mode.`)
		}
	}

	// Start
	const httpServer = http.createServer(app)
	const requestTimeoutMs = Math.max(300000, Number(process.env.BETTERPPTX_HTTP_REQUEST_TIMEOUT_MS || 60 * 60 * 1000) || 60 * 60 * 1000)
	const keepAliveTimeoutMs = Math.max(65000, Number(process.env.BETTERPPTX_HTTP_KEEPALIVE_TIMEOUT_MS || 120000) || 120000)
	const headersTimeoutMs = Math.max(keepAliveTimeoutMs + 1000, Math.min(requestTimeoutMs, Number(process.env.BETTERPPTX_HTTP_HEADERS_TIMEOUT_MS || keepAliveTimeoutMs + 1000) || keepAliveTimeoutMs + 1000))
	httpServer.requestTimeout = requestTimeoutMs
	httpServer.keepAliveTimeout = keepAliveTimeoutMs
	httpServer.headersTimeout = headersTimeoutMs
	httpServer.timeout = Math.max(0, Number(process.env.BETTERPPTX_HTTP_SOCKET_TIMEOUT_MS || 0) || 0)
	logEvent('http.server.timeouts', { requestTimeoutMs, headersTimeoutMs, keepAliveTimeoutMs, socketTimeoutMs: httpServer.timeout })
	await new Promise(resolve => httpServer.listen(port, host, resolve))
	const boundAddress = httpServer.address()
	const actualPort = boundAddress && typeof boundAddress === 'object' ? boundAddress.port : port

	const authLine =
		authMode === 'oauth' ? 'Verified account required for protected operations; discovery is public'
		: authMode === 'bearer' ? 'Bearer token (header-capable desktop / CLI / SDK clients)'
		: authMode === 'path' ? 'URL-path secret (web-connector friendly)'
		: 'OPEN — no auth (web-connector friendly; use only behind a trusted tunnel)'
	const visibleToolCount = publicToolList(TOOLS).length
	const banner = [
		'',
		'==========================================================',
		'  betterpptx HTTP server (Streamable HTTP / MCP)',
		'==========================================================',
		`  local URL : http://${host}:${actualPort}${mcpPath}`,
		`  health    : http://${host}:${actualPort}/health`,
		`  info      : http://${host}:${actualPort}/`,
		`  tools     : ${visibleToolCount} advertised (product surface)`,
		`  transport : ${statelessMcp ? 'stateless per request' : 'stateful sessions'}`,
		`  auth mode : ${authMode}  — ${authLine}`,
		...(statelessMcp ? [
			`  install identity: ${statelessRequiresInstallIdentity ? 'required per request' : 'optional per request'}`,
		] : []),
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
		authMode === 'oauth' ? '  Connect with OAuth sign-in. Public discovery never grants private-resource or publication access.' : authMode === 'bearer'
			? '  Web connector UIs usually cannot send a Bearer header — run with'
			: statelessRequiresInstallIdentity
				? '  Use a BetterPPTX connector/installer so x-betterpptx-device is sent,'
				: '  Paste the PUBLIC https URL of this endpoint into a compatible AI client',
		authMode === 'oauth' ? '  Account access tokens protect authoring and bare file URLs; owner-issued browser download links expire after ten minutes.' : authMode === 'bearer'
			? '  BETTERPPTX_URL_SECRET=<secret> (path mode) or BETTERPPTX_AUTH=none (open).'
			: statelessRequiresInstallIdentity
				? '  then add the endpoint as a custom connector / remote MCP server.'
				: '  → Add custom connector / remote MCP server. No header needed.',
		'==========================================================',
		'',
	].join('\n')
	process.stderr.write(banner)
	const logger = getLoggerInfo()
	if (logger.enabled) process.stderr.write(`[betterpptx:http] traffic log: ${logger.file}\n`)
	logEvent('server.http.ready', {
		host,
		port: actualPort,
		authMode,
		mcpPath,
		downloadRoot,
		publicBase,
		toolCount: visibleToolCount,
		mcpTransportMode: statelessMcp ? 'stateless' : 'stateful',
		statelessRequiresInstallIdentity,
		logger,
	})

	return { httpServer, token, host, port, authMode, mcpPath, urlSecret, downloadRoot, publicBase, mcpTransportMode: statelessMcp ? 'stateless' : 'stateful' }
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
