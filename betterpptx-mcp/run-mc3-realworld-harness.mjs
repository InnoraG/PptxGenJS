#!/usr/bin/env node
// Private maintainer harness for the MC3 100-deck / 500-slide evidence run.
// It drives the private deployed MCP endpoint, downloads PPTX artifacts, and
// writes JSONL metrics for later cost, billing, quality, and repair analysis.

import { execFileSync, spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

const DEFAULT_MCP_URL = 'https://betterpptx-mcp-staging-yqkbambcna-uc.a.run.app/mcp'
const DEFAULT_OUTPUT_ROOT = path.resolve(process.cwd(), 'outputs', 'mc3-500-slide-run')
const TINY_PNG_DATA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
const here = path.dirname(fileURLToPath(import.meta.url))
let runtimeToolRetries = 6
let runtimeRetryBaseMs = 2500
let runtimeToolSpacingMs = 350

const BATCHES = [
	['B01', 'executive-business-decks', 'Executive business decks'],
	['B02', 'saas-product-demos', 'SaaS product demos'],
	['B03', 'operations-dashboards', 'Operations dashboards'],
	['B04', 'data-storytelling', 'Data storytelling'],
	['B05', 'operational-report-tables', 'Operational report tables'],
	['B06', 'brand-theme-systems', 'Brand/theme systems'],
	['B07', 'image-media-composition', 'Image/media composition'],
	['B08', 'icon-vector-freeform-decks', 'Icon/vector/freeform decks'],
	['B09', 'advanced-typography', 'Advanced typography'],
	['B10', 'shape-effect-showcase', 'Shape/effect showcase'],
	['B11', 'smartart-diagrams', 'SmartArt/diagrams'],
	['B12', 'equations-technical-decks', 'Equations/technical decks'],
	['B13', 'animation-basics', 'Animation basics'],
	['B14', 'motion-transition-flows', 'Motion/transition flows'],
	['B15', 'narrated-decks', 'Narrated decks'],
	['B16', 'three-d-model-decks', '3D/model decks'],
	['B17', 'existing-deck-editing', 'Existing deck editing'],
	['B18', 'correction-edit-loops', 'Correction/edit loops'],
	['B19', 'boundary-failure-cases', 'Boundary and failure cases'],
	['B20', 'mixed-realworld-finals', 'Mixed real-world finals'],
]

function usage() {
	console.log(`Usage:
node betterpptx-mcp/run-mc3-realworld-harness.mjs [mcp-url] --use-gcloud-auth --env-file <private-env> --require-activation [options]

Options:
  --max-decks <n>        Limit deck count for pilot/smoke runs. Default: 5.
  --start-index <n>      1-based scenario index to start from. Default: 1.
  --full-run            Run all 100 decks and enable heavy optional coverage.
  --concurrency <n>     Concurrent deck sessions. Default: 1.
  --output-root <dir>   Output root. Default: outputs/mc3-500-slide-run.
  --run-id <id>         Stable run id. Default: timestamped.
  --include-heavy       Try narration and 3D/model heavy paths.
  --strict-autoshowcase Treat missing feature/design/narration proof as a failed deck. Enabled by --full-run.
  --no-strict-autoshowcase
                        Disable strict autoshowcase gates for exploratory full runs.
  --skip-static         Skip local static package checks.
  --skip-gcp-snapshot   Skip gcloud-based baseline/postrun snapshots.
  --deep-gcp-snapshot   Include slower inventory fields in GCP snapshots.
  --tool-retries <n>    Retry transient tool 429/network failures. Default: 6.
  --retry-base-ms <n>   Base retry delay in ms. Default: 2500.
  --tool-spacing-ms <n> Delay after every tool call in ms. Default: 350.
  --gcp-project <id>    GCP project for cost/load snapshots. Default: betterpptx-mcp-staging.
  --gcp-region <id>     GCP region for cost/load snapshots. Default: us-central1.
  --gcs-bucket <name>   Artifact bucket for storage snapshots.
  --require-activation  Fail if BETTERPPTX_VERIFY_ACTIVATION_KEY is missing.
  --use-gcloud-auth     Use gcloud auth print-identity-token for Cloud Run IAM.
  --authorization <v>   Explicit bearer token or Authorization header.
  --env-file <path>     Load private env values before running.
`)
}

function parseArgs(argv) {
	const opts = {
		mcpUrl: '',
		maxDecks: 5,
		startIndex: 1,
		fullRun: false,
		concurrency: 1,
		outputRoot: DEFAULT_OUTPUT_ROOT,
		runId: '',
		includeHeavy: false,
		strictAutoshowcase: false,
		skipStatic: false,
		skipGcpSnapshot: false,
		gcpProject: 'betterpptx-mcp-staging',
		gcpRegion: 'us-central1',
		gcsBucket: 'betterpptx-mcp-staging-artifacts-860007156914',
		deepGcpSnapshot: false,
		toolRetries: 6,
		retryBaseMs: 2500,
		toolSpacingMs: 350,
		requireActivation: false,
		useGcloudAuth: false,
		authorization: '',
		envFile: '',
	}
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (!arg.startsWith('--') && !opts.mcpUrl) {
			opts.mcpUrl = arg
			continue
		}
		if (arg === '--max-decks' && argv[i + 1]) { opts.maxDecks = Math.max(1, Number(argv[++i]) || 5); continue }
		if (arg === '--start-index' && argv[i + 1]) { opts.startIndex = Math.max(1, Number(argv[++i]) || 1); continue }
		if (arg === '--full-run') { opts.fullRun = true; opts.maxDecks = 100; opts.includeHeavy = true; opts.strictAutoshowcase = true; continue }
		if (arg === '--concurrency' && argv[i + 1]) { opts.concurrency = Math.max(1, Number(argv[++i]) || 1); continue }
		if (arg === '--output-root' && argv[i + 1]) { opts.outputRoot = path.resolve(argv[++i]); continue }
		if (arg === '--run-id' && argv[i + 1]) { opts.runId = String(argv[++i]).trim(); continue }
		if (arg === '--include-heavy') { opts.includeHeavy = true; continue }
		if (arg === '--strict-autoshowcase') { opts.strictAutoshowcase = true; opts.includeHeavy = true; continue }
		if (arg === '--no-strict-autoshowcase') { opts.strictAutoshowcase = false; continue }
		if (arg === '--skip-static') { opts.skipStatic = true; continue }
		if (arg === '--skip-gcp-snapshot') { opts.skipGcpSnapshot = true; continue }
		if (arg === '--deep-gcp-snapshot') { opts.deepGcpSnapshot = true; continue }
		if (arg === '--tool-retries' && argv[i + 1]) { opts.toolRetries = Math.max(0, Number(argv[++i]) || 0); continue }
		if (arg === '--retry-base-ms' && argv[i + 1]) { opts.retryBaseMs = Math.max(0, Number(argv[++i]) || 0); continue }
		if (arg === '--tool-spacing-ms' && argv[i + 1]) { opts.toolSpacingMs = Math.max(0, Number(argv[++i]) || 0); continue }
		if (arg === '--gcp-project' && argv[i + 1]) { opts.gcpProject = argv[++i]; continue }
		if (arg === '--gcp-region' && argv[i + 1]) { opts.gcpRegion = argv[++i]; continue }
		if (arg === '--gcs-bucket' && argv[i + 1]) { opts.gcsBucket = argv[++i]; continue }
		if (arg === '--require-activation') { opts.requireActivation = true; continue }
		if (arg === '--use-gcloud-auth' || arg === '--identity-token') { opts.useGcloudAuth = true; continue }
		if ((arg === '--authorization' || arg === '--auth-header') && argv[i + 1]) { opts.authorization = argv[++i]; continue }
		if (arg === '--env-file' && argv[i + 1]) { opts.envFile = argv[++i]; continue }
		if (arg === '--help' || arg === '-h') { usage(); process.exit(0) }
		throw new Error(`Unknown argument: ${arg}`)
	}
	if (!opts.mcpUrl) opts.mcpUrl = DEFAULT_MCP_URL
	if (!opts.runId) opts.runId = `mc3-${new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').replace('Z', 'z')}`
	return opts
}

function loadEnvFile(filePath) {
	if (!filePath) return
	if (!fs.existsSync(filePath)) throw new Error(`Env file not found: ${filePath}`)
	const text = fs.readFileSync(filePath, 'utf8')
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim()
		if (!line || line.startsWith('#')) continue
		const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
		if (!match) continue
		let value = match[2].trim()
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
		if (!process.env[match[1]]) process.env[match[1]] = value
	}
}

function normalizeMcpUrl(value) {
	let url = String(value || DEFAULT_MCP_URL).trim().replace(/\/+$/, '')
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

function runText(command, timeoutMs = 120000) {
	try {
		const shell = process.platform === 'win32' ? 'cmd.exe' : 'sh'
		const args = process.platform === 'win32' ? ['/c', command] : ['-lc', command]
		return {
			ok: true,
			command,
			stdout: execFileSync(shell, args, { encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] }).trim(),
		}
	} catch (err) {
		return {
			ok: false,
			command,
			error: String(err?.message || err).slice(0, 500),
			stdout: String(err?.stdout || '').slice(0, 5000),
			stderr: String(err?.stderr || '').slice(0, 5000),
		}
	}
}

function killProcessTree(pid) {
	if (!pid) return
	try {
		if (process.platform === 'win32') {
			execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
		} else {
			process.kill(-pid, 'SIGKILL')
		}
	} catch {
		// Best effort only; the caller still records the timeout.
	}
}

function runTextManaged(command, timeoutMs = 90000) {
	return new Promise(resolve => {
		const shell = process.platform === 'win32' ? 'cmd.exe' : 'sh'
		const args = process.platform === 'win32' ? ['/c', command] : ['-lc', command]
		const child = spawn(shell, args, {
			detached: process.platform !== 'win32',
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		})
		let stdout = ''
		let stderr = ''
		let settled = false
		const finish = result => {
			if (settled) return
			settled = true
			clearTimeout(timer)
			resolve(result)
		}
		const timer = setTimeout(() => {
			killProcessTree(child.pid)
			resolve({
				ok: false,
				command,
				error: `command timed out after ${timeoutMs}ms`,
				stdout: stdout.slice(0, 5000),
				stderr: stderr.slice(0, 5000),
			})
		}, timeoutMs)
		child.stdout?.on('data', chunk => {
			stdout += chunk.toString()
			if (stdout.length > 20 * 1024 * 1024) stdout = stdout.slice(-20 * 1024 * 1024)
		})
		child.stderr?.on('data', chunk => {
			stderr += chunk.toString()
			if (stderr.length > 1024 * 1024) stderr = stderr.slice(-1024 * 1024)
		})
		child.on('error', err => finish({
			ok: false,
			command,
			error: String(err?.message || err).slice(0, 500),
			stdout: stdout.slice(0, 5000),
			stderr: stderr.slice(0, 5000),
		}))
		child.on('close', code => {
			if (code === 0) {
				finish({ ok: true, command, stdout: stdout.trim() })
				return
			}
			finish({
				ok: false,
				command,
				error: `command exited ${code}`,
				stdout: stdout.slice(0, 5000),
				stderr: stderr.slice(0, 5000),
			})
		})
	})
}

function parseJsonText(result) {
	if (!result?.ok || !result.stdout) return null
	try { return JSON.parse(result.stdout) } catch { return null }
}

function fetchHeaders(auth, extra = {}) {
	return { ...(auth ? { Authorization: auth } : {}), ...extra }
}

function sameOriginHeaders(url, base, auth) {
	try {
		return new URL(url).origin === new URL(base).origin ? fetchHeaders(auth) : {}
	} catch {
		return {}
	}
}

function sse(text) {
	for (const line of String(text).split('\n')) {
		const match = line.match(/^data:\s*(.+)$/)
		if (match) return JSON.parse(match[1])
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

async function fetchJson(url, auth, options = {}) {
	const res = await fetch(url, {
		...options,
		headers: fetchHeaders(auth, options.headers || {}),
	})
	const data = await responseBody(res)
	return { res, data }
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
		if (!res.ok) {
			const err = new Error(`${method} HTTP ${res.status}: ${JSON.stringify(data)?.slice(0, 300)}`)
			err.status = res.status
			err.retryAfterMs = Math.max(0, Number(res.headers.get('retry-after') || 0) * 1000)
			err.rpcData = data
			throw err
		}
		if (data?.error) {
			const err = new Error(`${method} RPC ${data.error.code}: ${data.error.message}`)
			err.rpcCode = data.error.code
			err.rpcData = data
			throw err
		}
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
	async function close() {
		if (!sid) return
		const currentSid = sid
		sid = null
		try {
			await fetch(mcpUrl, {
				method: 'DELETE',
				headers: fetchHeaders(auth, {
					Accept: 'application/json',
					'mcp-session-id': currentSid,
				}),
			})
		} catch {
			// Session cleanup is best-effort; scenario validation already recorded its outcome.
		}
	}
	return { rpc, tool, close, sid, serverName: init?.result?.serverInfo?.name || 'unknown' }
}

function mkdirp(dir) {
	fs.mkdirSync(dir, { recursive: true })
}

function appendJsonl(file, value) {
	fs.appendFileSync(file, `${JSON.stringify(value)}\n`, 'utf8')
}

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

function hashJson(value) {
	return crypto.createHash('sha256').update(JSON.stringify(value || {})).digest('hex').slice(0, 16)
}

function cleanName(value) {
	return String(value || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

function buildScenarios(maxDecks, startIndex = 1) {
	const scenarios = []
	for (let b = 0; b < BATCHES.length; b++) {
		const [batch, slug, family] = BATCHES[b]
		for (let v = 1; v <= 5; v++) {
			const variant = `V${String(v).padStart(2, '0')}`
			scenarios.push({
				index: scenarios.length + 1,
				scenarioId: `MC3-${batch}-${variant}`,
				batch,
				batchNumber: b + 1,
				variant: v,
				slug,
				family,
				fileName: `mc3-${batch.toLowerCase()}-v${String(v).padStart(2, '0')}-${slug}.pptx`,
				seed: `mc3-${batch}-${variant}-20260605`,
			})
		}
	}
	const start = Math.max(0, Math.min(scenarios.length, Number(startIndex || 1) - 1))
	return scenarios.slice(start, Math.min(start + maxDecks, scenarios.length))
}

function colorFor(s, offset = 0) {
	const colors = ['0F172A', '1D4ED8', '047857', 'B45309', 'BE123C', '6D28D9', '0E7490', '334155']
	return colors[(s.index + offset) % colors.length]
}

function accentFor(s, offset = 0) {
	const colors = ['22D3EE', '60A5FA', '34D399', 'F59E0B', 'FB7185', 'A78BFA', '2DD4BF', '94A3B8']
	return colors[(s.index + offset) % colors.length]
}

function dataSeries(s, slideNo) {
	const base = s.index + slideNo
	return [
		{ name: 'Actual', labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [base + 2, base + 5, base + 3, base + 8] },
		{ name: 'Target', labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [base + 4, base + 4, base + 6, base + 7] },
	]
}

class HarnessRecorder {
	constructor({ runId, runDir }) {
		this.runId = runId
		this.runDir = runDir
		this.toolFile = path.join(runDir, 'per-tool-results.jsonl')
		this.deckFile = path.join(runDir, 'per-deck-results.jsonl')
		this.billingFile = path.join(runDir, 'billing-results.jsonl')
	}
	tool(row) { appendJsonl(this.toolFile, row) }
	deck(row) { appendJsonl(this.deckFile, row) }
	billing(row) { appendJsonl(this.billingFile, row) }
}

function compactError(payload) {
	const details = payload?.error?.details && typeof payload.error.details === 'object' ? payload.error.details : null
	return {
		code: payload?.error?.code || '',
		message: String(payload?.error?.message || '').slice(0, 300),
		recoverable: payload?.error?.recoverable,
		retrySafe: payload?.error?.retrySafe,
		...(details ? {
			details: {
				status: details.status,
				artifactStatus: details.artifactStatus,
				qualityGate: details.qualityGate,
				reasons: details.reasons,
				metrics: details.metrics,
				recommendation: details.recommendation,
				received: details.received,
				requiredTransition: details.requiredTransition,
				targetSlide: details.targetSlide,
			},
		} : {}),
	}
}

function compactThrownError(err) {
	const message = String(err?.message || err || '').slice(0, 300)
	return {
		code: err?.status ? `HTTP_${err.status}` : (err?.rpcCode || 'THROWN'),
		message,
		recoverable: err?.status === 429 || /RATE_LIMITED|HTTP 429|fetch failed/i.test(message),
		retrySafe: err?.status === 429 || /RATE_LIMITED|HTTP 429|fetch failed/i.test(message),
	}
}

function isRetryableThrown(err) {
	const message = String(err?.message || err || '')
	return err?.status === 429 || /RATE_LIMITED|HTTP 429|fetch failed|ECONNRESET|ETIMEDOUT/i.test(message)
}

function retryDelayMs(err, attempt) {
	if (err?.retryAfterMs) return err.retryAfterMs
	return runtimeRetryBaseMs * Math.max(1, attempt) + Math.floor(Math.random() * 250)
}

function summarizeData(data) {
	const out = {}
	for (const key of ['deckId', 'slideIndex', 'slideCount', 'objectCount', 'bytes', 'downloadUrl', 'idempotentReplay', 'estimatedCredits', 'creditCost']) {
		if (data?.[key] !== undefined) out[key] = key === 'downloadUrl' ? '<redacted>' : data[key]
	}
	if (data?.billing) out.billing = data.billing
	if (data?.plan) out.plan = data.plan
	if (data?.credits !== undefined) out.credits = data.credits
	return out
}

async function callTool({ client, recorder, scenario, toolName, args = {}, required = true, expectedError = false }) {
	const started = Date.now()
	let payload = null
	let thrown = null
	let attempts = 0
	for (let attempt = 0; attempt <= runtimeToolRetries; attempt++) {
		attempts = attempt + 1
		payload = null
		thrown = null
		try {
			payload = await client.tool(toolName, args)
		} catch (err) {
			thrown = err
		}
		const retryable = thrown && isRetryableThrown(thrown)
		if (!retryable || attempt >= runtimeToolRetries) break
		await delay(retryDelayMs(thrown, attempt + 1))
	}
	const ended = Date.now()
	const ok = !thrown && payload?.ok !== false
	const row = {
		runId: recorder.runId,
		scenarioId: scenario.scenarioId,
		batch: scenario.batch,
		variant: scenario.variant,
		toolName,
		startedAt: new Date(started).toISOString(),
		endedAt: new Date(ended).toISOString(),
		latencyMs: ended - started,
		ok,
		expectedError,
		argsHash: hashJson(args),
		idempotencyKeyPresent: !!args.idempotencyKey,
		attempts,
		retryCount: Math.max(0, attempts - 1),
		error: thrown ? compactThrownError(thrown) : compactError(payload),
		data: ok ? summarizeData(payload.data || {}) : {},
	}
	recorder.tool(row)
	if (runtimeToolSpacingMs > 0) await delay(runtimeToolSpacingMs)
	if (expectedError) {
		if (ok && required) throw new Error(`${toolName} unexpectedly succeeded for ${scenario.scenarioId}`)
		return payload || { ok: false, error: row.error }
	}
	if (!ok && required) throw new Error(`${toolName} failed for ${scenario.scenarioId}: ${row.error.code || row.error.message}`)
	return payload
}

function requireData(label, payload) {
	if (!payload?.ok) throw new Error(`${label} returned non-ok payload`)
	return payload.data || {}
}

async function maybeActivate(client, recorder, scenario, requireActivation) {
	let key = String(process.env.BETTERPPTX_VERIFY_ACTIVATION_KEY || '').trim()
	if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) key = key.slice(1, -1)
	if (!key && requireActivation) throw new Error('Missing BETTERPPTX_VERIFY_ACTIVATION_KEY for MC3 run')
	if (!key) return null
	const payload = await callTool({
		client,
		recorder,
		scenario,
		toolName: 'betterpptx.auth.activate_key',
		args: {
			key,
			provider: process.env.BETTERPPTX_VERIFY_ACTIVATION_PROVIDER || 'auto',
			idempotencyKey: `${scenario.scenarioId}-activate`,
		},
	})
	return requireData('auth.activate_key', payload)
}

async function addSlideWithBase({ client, recorder, scenario, deckId, slideNo }) {
	const background = slideNo % 2
		? { color: 'F8FAFC' }
		: { color: 'FFFFFF' }
	const slidePayload = await callTool({
		client,
		recorder,
		scenario,
		toolName: 'betterpptx.slide.add',
		args: {
			deckId,
			background,
			transition: { type: slideNo === 1 ? 'morph' : 'fade', option: slideNo === 1 ? 'byObject' : undefined, duration: 500 + slideNo * 50 },
			notes: `${scenario.scenarioId} slide ${slideNo + 1} private MC3 evidence.`,
			idempotencyKey: `${scenario.scenarioId}-slide-${slideNo}`,
		},
	})
	const slide = requireData('slide.add', slidePayload)
	await callTool({
		client,
		recorder,
		scenario,
		toolName: 'betterpptx.slide.add_text',
		args: {
			deckId,
			slideIndex: slide.slideIndex,
			text: `${scenario.family} ${slideNo + 1}`,
			options: {
				x: 0.55,
				y: 0.35,
				w: 8.6,
				h: 0.42,
				fontFace: 'Aptos Display',
				fontSize: 19,
				bold: true,
				color: colorFor(scenario),
				objectName: `${scenario.scenarioId}-s${slideNo}-title`,
			},
			idempotencyKey: `${scenario.scenarioId}-s${slideNo}-title`,
		},
	})
	await callTool({
		client,
		recorder,
		scenario,
		toolName: 'betterpptx.slide.add_text',
		args: {
			deckId,
			slideIndex: slide.slideIndex,
			text: [
				{ text: `Scenario ${scenario.scenarioId}: `, options: { bold: true } },
				{ text: 'deterministic scenario data for quality, speed, billing, and stability.' },
			],
			options: {
				x: 0.6,
				y: 5.9,
				w: 11.2,
				h: 0.35,
				fontFace: 'Aptos',
				fontSize: 9,
				color: '475569',
				objectName: `${scenario.scenarioId}-s${slideNo}-footer`,
			},
			idempotencyKey: `${scenario.scenarioId}-s${slideNo}-footer`,
		},
	})
	return slide.slideIndex
}

async function addKpiCards(ctx, slideIndex) {
	const { client, recorder, scenario, deckId } = ctx
	for (let i = 0; i < 3; i++) {
		await callTool({
			client, recorder, scenario, toolName: 'betterpptx.slide.add_shape',
			args: {
				deckId,
				slideIndex,
				shapeName: 'roundRect',
				text: `${['Speed', 'Quality', 'Cost'][i]}\n${80 + scenario.variant * 2 + i}%`,
				options: {
					x: 0.75 + i * 3.25,
					y: 1.25,
					w: 2.55,
					h: 1.05,
					fill: { color: i === 0 ? accentFor(scenario) : 'FFFFFF' },
					line: { color: accentFor(scenario), width: 1 },
					shadow: { type: 'outer', color: 'CBD5E1', opacity: 0.28, blur: 1, angle: 45, distance: 1 },
					objectName: `${scenario.scenarioId}-kpi-${slideIndex}-${i}`,
				},
				textOptions: { fontSize: 13, bold: true, color: colorFor(scenario), align: 'center', valign: 'mid' },
				idempotencyKey: `${scenario.scenarioId}-kpi-${slideIndex}-${i}`,
			},
		})
	}
}

async function addSingleCallout(ctx, slideIndex) {
	const { client, recorder, scenario, deckId } = ctx
	await callTool({
		client, recorder, scenario, toolName: 'betterpptx.slide.add_shape',
		args: {
			deckId,
			slideIndex,
			shapeName: 'roundRect',
			text: `${scenario.family}\nvariant ${scenario.variant}`,
			options: {
				x: 0.85,
				y: 1.35,
				w: 4.2,
				h: 1.15,
				fill: { color: 'FFFFFF' },
				line: { color: accentFor(scenario), width: 1 },
				shadow: { type: 'outer', color: 'CBD5E1', opacity: 0.22, blur: 1, angle: 45, distance: 1 },
				objectName: `${scenario.scenarioId}-callout-${slideIndex}`,
			},
			textOptions: { fontSize: 14, bold: true, color: colorFor(scenario), align: 'center', valign: 'mid' },
			idempotencyKey: `${scenario.scenarioId}-callout-${slideIndex}`,
		},
	})
}

async function addChart(ctx, slideIndex, chartType = 'bar') {
	const { client, recorder, scenario, deckId } = ctx
	await callTool({
		client, recorder, scenario, toolName: 'betterpptx.slide.add_chart',
		args: {
			deckId,
			slideIndex,
			chartType,
			data: dataSeries(scenario, slideIndex),
			options: {
				x: 0.85,
				y: 1.25,
				w: 5.2,
				h: 3.2,
				showTitle: true,
				title: `${chartType} comparison`,
				chartColors: [accentFor(scenario), colorFor(scenario, 2)],
				showLegend: true,
				dataLabelPosition: 'bestFit',
				objectName: `${scenario.scenarioId}-chart-${slideIndex}-${chartType}`,
			},
			idempotencyKey: `${scenario.scenarioId}-chart-${slideIndex}-${chartType}`,
		},
	})
}

async function addTable(ctx, slideIndex) {
	const { client, recorder, scenario, deckId } = ctx
	await callTool({
		client, recorder, scenario, toolName: 'betterpptx.slide.add_table',
		args: {
			deckId,
			slideIndex,
			rows: [
				[{ text: 'Metric', options: { bold: true } }, { text: 'Value', options: { bold: true } }],
				[{ text: 'Quality' }, { text: `${85 + scenario.variant}%` }],
			],
			options: {
				x: 0.85,
				y: 1.25,
				w: 4.4,
				h: 0.95,
				colW: [2.3, 1.6],
				border: { color: 'CBD5E1', width: 1 },
				fill: { color: 'F8FAFC' },
				fontSize: 10,
				headerRow: true,
				bandedRows: true,
				objectName: `${scenario.scenarioId}-table-${slideIndex}`,
			},
			idempotencyKey: `${scenario.scenarioId}-table-${slideIndex}`,
		},
	})
}

async function addImage(ctx, slideIndex) {
	const { client, recorder, scenario, deckId } = ctx
	await callTool({
		client, recorder, scenario, toolName: 'betterpptx.slide.add_image',
		args: {
			deckId,
			slideIndex,
			options: {
				data: TINY_PNG_DATA,
				x: 8.05,
				y: 1.25,
				w: 1.6,
				h: 1.6,
				rounding: true,
				shadow: { type: 'outer', color: '94A3B8', opacity: 0.28, blur: 1, angle: 45, distance: 1 },
				altText: `${scenario.scenarioId} deterministic embedded image`,
			},
			idempotencyKey: `${scenario.scenarioId}-image-${slideIndex}`,
		},
	})
}

async function addWordArt(ctx, slideIndex) {
	const { client, recorder, scenario, deckId } = ctx
	await callTool({
		client, recorder, scenario, toolName: 'betterpptx.slide.add_text',
		args: {
			deckId,
			slideIndex,
			text: `MC3 ${scenario.batch} WordArt`,
			options: {
				x: 1.0,
				y: 1.4,
				w: 6.6,
				h: 0.8,
				fontSize: 28,
				bold: true,
				color: accentFor(scenario),
				wordArt: { transform: scenario.variant % 2 ? 'textArchUp' : 'textWave4' },
				text3D: {
					bevel: { type: 'circle', w: 2, h: 2 },
					extrusion: { depth: 8, color: colorFor(scenario) },
					material: 'matte',
					lightRig: 'balanced',
					rotationX: 8,
					rotationY: 18,
					rotationZ: 0,
				},
				glow: { color: accentFor(scenario), size: 3, opacity: 0.45 },
				reflection: { type: 'tight' },
				objectName: `${scenario.scenarioId}-wordart-${slideIndex}`,
			},
			idempotencyKey: `${scenario.scenarioId}-wordart-${slideIndex}`,
		},
	})
}

async function addEffects(ctx, slideIndex) {
	const { client, recorder, scenario, deckId } = ctx
	const shapes = ['star5', 'hexagon', 'chevron']
	for (let i = 0; i < shapes.length; i++) {
		await callTool({
			client, recorder, scenario, toolName: 'betterpptx.slide.add_shape',
			args: {
				deckId,
				slideIndex,
				shapeName: shapes[i],
				text: shapes[i],
				options: {
					x: 0.9 + i * 2.15,
					y: 1.35,
					w: 1.35,
					h: 1.1,
					fill: {
						type: 'gradient',
						gradientStops: [
							{ color: accentFor(scenario, i), position: 0 },
							{ color: 'FFFFFF', position: 100 },
						],
						gradientAngle: 35 + i * 20,
					},
					line: { color: colorFor(scenario, i), width: 1 },
					glow: { color: accentFor(scenario, i), size: 3, opacity: 0.35 },
					softEdges: { size: 1 },
					rotate: i * 8,
					objectName: `${scenario.scenarioId}-effect-${slideIndex}-${i}`,
				},
				textOptions: { fontSize: 9, color: colorFor(scenario), align: 'center', valign: 'mid' },
				idempotencyKey: `${scenario.scenarioId}-effect-${slideIndex}-${i}`,
			},
		})
	}
}

async function addSmartArt(ctx, slideIndex) {
	const { client, recorder, scenario, deckId, strictAutoshowcase } = ctx
	await callTool({
		client, recorder, scenario, toolName: 'betterpptx.slide.add_smartart',
		required: Boolean(strictAutoshowcase),
		args: {
			deckId,
			slideIndex,
			mode: 'native',
			layout: scenario.variant % 2 ? 'Basic Process' : 'Organization Chart',
			nodes: ['Plan', 'Generate', 'Validate', 'Bill'],
			x: 0.85,
			y: 1.2,
			w: 6.6,
			h: 2.1,
			title: `${scenario.scenarioId} flow`,
			objectName: `${scenario.scenarioId}-smartart-${slideIndex}`,
			idempotencyKey: `${scenario.scenarioId}-smartart-${slideIndex}`,
		},
	})
}

async function addEquation(ctx, slideIndex) {
	const { client, recorder, scenario, deckId, strictAutoshowcase } = ctx
	await callTool({
		client, recorder, scenario, toolName: 'betterpptx.slide.add_equation',
		required: Boolean(strictAutoshowcase),
		args: {
			deckId,
			slideIndex,
			sourceFormat: 'unicodeMath',
			source: `cost/slide = total_cost / ${5 + scenario.variant}`,
			x: 0.95,
			y: 1.35,
			w: 5.8,
			h: 0.7,
			fontSize: 20,
			color: colorFor(scenario),
			objectName: `${scenario.scenarioId}-equation-${slideIndex}`,
			idempotencyKey: `${scenario.scenarioId}-equation-${slideIndex}`,
		},
	})
}

async function addFreeform(ctx, slideIndex) {
	const { client, recorder, scenario, deckId, strictAutoshowcase } = ctx
	await callTool({
		client, recorder, scenario, toolName: 'betterpptx.slide.add_freeform',
		required: Boolean(strictAutoshowcase),
		args: {
			deckId,
			slideIndex,
			x: 0.95,
			y: 1.3,
			w: 2.3,
			h: 1.4,
			points: [
				{ x: 0.1, y: 0.7, moveTo: true },
				{ x: 0.75, y: 0.1 },
				{ x: 1.5, y: 0.65 },
				{ x: 2.1, y: 0.2 },
				{ x: 2.0, y: 1.25 },
				{ x: 0.2, y: 1.2 },
				{ close: true },
			],
			fill: { color: accentFor(scenario) },
			line: { color: colorFor(scenario), width: 1 },
			shadow: { type: 'outer', color: '94A3B8', opacity: 0.25, blur: 1, angle: 45, distance: 1 },
			objectName: `${scenario.scenarioId}-freeform-${slideIndex}`,
			idempotencyKey: `${scenario.scenarioId}-freeform-${slideIndex}`,
		},
	})
}

async function addAnimations(ctx, slideIndex) {
	const { client, recorder, scenario, deckId, strictAutoshowcase } = ctx
	await callTool({
		client, recorder, scenario, toolName: 'betterpptx.slide.animate_shapes',
		required: Boolean(strictAutoshowcase),
		args: {
			deckId,
			slideIndex,
			kinds: ['text', 'shape'],
			animation: { type: 'entrance', effect: scenario.variant % 2 ? 'fade' : 'fly', direction: 'fromLeft', trigger: 'afterPrevious', duration: 450 },
			staggerMs: 90,
			idempotencyKey: `${scenario.scenarioId}-animate-${slideIndex}`,
		},
	})
}

async function addNarration(ctx, slideIndex) {
	const { client, recorder, scenario, deckId, includeHeavy, strictAutoshowcase } = ctx
	if (!includeHeavy) {
		if (strictAutoshowcase) throw new Error(`${scenario.scenarioId} strict autoshowcase requires real narration, not notes placeholders.`)
		await callTool({
			client, recorder, scenario, toolName: 'betterpptx.slide.add_notes',
			args: {
				deckId,
				slideIndex,
				notes: `${scenario.scenarioId} narration placeholder. Heavy TTS disabled for this pilot run.`,
				idempotencyKey: `${scenario.scenarioId}-narration-placeholder-${slideIndex}`,
			},
		})
		return
	}
	await callTool({
		client, recorder, scenario, toolName: 'betterpptx.slide.add_narration',
		required: Boolean(strictAutoshowcase),
		args: {
			deckId,
			slideIndex,
			script: `${scenario.family} ${scenario.variant} demonstrates a finished BetterPPTX autoshowcase slide with synchronized speech, timing, package stability, and billing telemetry.`,
			lang: 'en_US',
			captions: { enabled: true, stackStatic: true },
			paddingMs: 700,
			idempotencyKey: `${scenario.scenarioId}-narration-${slideIndex}`,
		},
	})
}

async function addModelAttempt(ctx, slideIndex) {
	const { client, recorder, scenario, deckId, includeHeavy, strictAutoshowcase } = ctx
	if (!includeHeavy) {
		if (strictAutoshowcase) throw new Error(`${scenario.scenarioId} strict autoshowcase requires a real 3D/model attempt.`)
		await addEffects(ctx, slideIndex)
		return
	}
	const catalog = await callTool({
		client, recorder, scenario, toolName: 'betterpptx.assets.catalog',
		required: Boolean(strictAutoshowcase),
		args: { kind: 'model3d', query: 'business device', maxResults: 1, sizePolicy: 'compact' },
	})
	const asset = catalog?.data?.assets?.[0] || catalog?.data?.results?.[0] || null
	const opts = asset?.addModel3DOptions || (asset?.modelAsset ? { modelAsset: asset.modelAsset } : null)
	if (!opts) {
		if (strictAutoshowcase) throw new Error(`${scenario.scenarioId} strict autoshowcase found no usable 3D asset.`)
		await addEffects(ctx, slideIndex)
		return
	}
	await callTool({
		client, recorder, scenario, toolName: 'betterpptx.slide.add_model3d',
		required: Boolean(strictAutoshowcase),
		args: {
			deckId,
			slideIndex,
			options: { ...opts, x: 0.9, y: 1.25, w: 2.6, h: 2.1, objectName: `${scenario.scenarioId}-model-${slideIndex}` },
			idempotencyKey: `${scenario.scenarioId}-model-${slideIndex}`,
		},
	})
}

async function addBoundaryCase(ctx, slideIndex) {
	const { client, recorder, scenario, deckId, strictAutoshowcase } = ctx
	await callTool({
		client, recorder, scenario, toolName: 'betterpptx.slide.add_image',
		required: Boolean(strictAutoshowcase),
		expectedError: true,
		args: {
			deckId,
			slideIndex,
			options: { url: 'http://127.0.0.1/private.png', x: 0.5, y: 0.5, w: 1, h: 1 },
			idempotencyKey: `${scenario.scenarioId}-expected-fetch-denial-${slideIndex}`,
		},
	})
	await addKpiCards(ctx, slideIndex)
}

async function addFamilyContent(ctx, slideIndex, slideNo) {
	const batchNo = ctx.scenario.batchNumber
	if ([1, 2, 3].includes(batchNo)) return slideNo % 2 ? addChart(ctx, slideIndex, 'bar') : addKpiCards(ctx, slideIndex)
	if (batchNo === 4) return [0, 2].includes(slideNo) ? addChart(ctx, slideIndex, ['line', 'doughnut'][slideNo / 2]) : addKpiCards(ctx, slideIndex)
	if (batchNo === 5) return [0, 3].includes(slideNo) ? addTable(ctx, slideIndex) : (slideNo === 1 ? addChart(ctx, slideIndex, 'bar') : addKpiCards(ctx, slideIndex))
	if (batchNo === 6) return slideNo % 2 ? addWordArt(ctx, slideIndex) : addEffects(ctx, slideIndex)
	if (batchNo === 7) return addImage(ctx, slideIndex)
	if (batchNo === 8) return addFreeform(ctx, slideIndex)
	if (batchNo === 9) { await addWordArt(ctx, slideIndex); return addSingleCallout(ctx, slideIndex) }
	if (batchNo === 10) return addEffects(ctx, slideIndex)
	if (batchNo === 11) { await addSmartArt(ctx, slideIndex); return addSingleCallout(ctx, slideIndex) }
	if (batchNo === 12) { await addEquation(ctx, slideIndex); return addSingleCallout(ctx, slideIndex) }
	if (batchNo === 13) { await addEffects(ctx, slideIndex); return addAnimations(ctx, slideIndex) }
	if (batchNo === 14) { await addKpiCards(ctx, slideIndex); return addAnimations(ctx, slideIndex) }
	if (batchNo === 15) return addNarration(ctx, slideIndex)
	if (batchNo === 16) return addModelAttempt(ctx, slideIndex)
	if (batchNo === 17) return slideNo === 0 ? addChart(ctx, slideIndex, 'bar') : (slideNo === 1 ? addTable(ctx, slideIndex) : addKpiCards(ctx, slideIndex))
	if (batchNo === 18) return slideNo === 0 ? addEffects(ctx, slideIndex) : addKpiCards(ctx, slideIndex)
	if (batchNo === 19) return slideNo === 0 ? addBoundaryCase(ctx, slideIndex) : addKpiCards(ctx, slideIndex)
	if (slideNo === 0) return addKpiCards(ctx, slideIndex)
	if (slideNo === 1) return addTable(ctx, slideIndex)
	if (slideNo === 2) return addAnimations(ctx, slideIndex)
	return addImage(ctx, slideIndex)
}

async function runPostBuildEditing(ctx) {
	const { client, recorder, scenario, deckId } = ctx
	if (scenario.batchNumber === 14) {
		await callTool({
			client, recorder, scenario, toolName: 'betterpptx.deck.set_transitions_all',
			required: Boolean(ctx.strictAutoshowcase),
			args: {
				deckId,
				variants: [
					{ type: 'fade', duration: 450 },
					{ type: 'morph', option: 'byObject', duration: 650 },
					{ type: 'push', direction: 'left', duration: 450 },
				],
				idempotencyKey: `${scenario.scenarioId}-transitions-all`,
			},
		})
	}
	if (scenario.batchNumber === 17 || scenario.batchNumber === 18) {
		await callTool({
			client, recorder, scenario, toolName: 'betterpptx.slide.update_shape',
			args: {
				deckId,
				slideIndex: 0,
				target: { objectName: `${scenario.scenarioId}-s0-title` },
				patch: { color: accentFor(scenario), fontSize: 21 },
				idempotencyKey: `${scenario.scenarioId}-update-title`,
			},
		})
		await callTool({
			client, recorder, scenario, toolName: 'betterpptx.slide.update_shape',
			args: {
				deckId,
				slideIndex: 2,
				target: { objectName: `${scenario.scenarioId}-kpi-2-0` },
				patch: { text: `Edited\n${90 + scenario.variant}%`, fill: { color: 'FFFFFF' }, line: { color: colorFor(scenario), width: 1.25 } },
				idempotencyKey: `${scenario.scenarioId}-update-kpi`,
			},
		})
		if (scenario.batchNumber === 17 && process.env.BETTERPPTX_MC3_ENABLE_REPAIR_RISKY_CHART_TABLE_EDITS === '1') {
			await callTool({
				client, recorder, scenario, toolName: 'betterpptx.slide.update_chart',
				args: {
					deckId,
					slideIndex: 0,
					target: { objectName: `${scenario.scenarioId}-chart-0-bar` },
					data: dataSeries(scenario, 6),
					optionsPatch: { showLegend: true, title: `${scenario.scenarioId} edited chart` },
					idempotencyKey: `${scenario.scenarioId}-update-chart`,
				},
			})
			await callTool({
				client, recorder, scenario, toolName: 'betterpptx.slide.update_table',
				args: {
					deckId,
					slideIndex: 1,
					target: { objectName: `${scenario.scenarioId}-table-1` },
					operations: [
						{ op: 'setCell', row: 1, col: 1, text: `${91 + scenario.variant}%` },
						{ op: 'addRow', cells: ['Review', 'Passed'] },
					],
					idempotencyKey: `${scenario.scenarioId}-update-table`,
				},
			})
		}
		await callTool({
			client, recorder, scenario, toolName: 'betterpptx.slide.duplicate',
			args: {
				deckId,
				slideIndex: 2,
				transition: { type: 'morph', option: 'byObject', duration: 550 },
				idempotencyKey: `${scenario.scenarioId}-duplicate-slide`,
			},
		})
		await callTool({
			client, recorder, scenario, toolName: 'betterpptx.slide.reorder',
			args: {
				deckId,
				fromIndex: 5,
				toIndex: 3,
				idempotencyKey: `${scenario.scenarioId}-reorder-slide`,
			},
		})
		await callTool({
			client, recorder, scenario, toolName: 'betterpptx.slide.delete',
			args: {
				deckId,
				slideIndex: 5,
				idempotencyKey: `${scenario.scenarioId}-delete-slide`,
			},
		})
	}
}

function makeParser(errors) {
	return new DOMParser({
		errorHandler: {
			warning: msg => errors.push(String(msg)),
			error: msg => errors.push(String(msg)),
			fatalError: msg => errors.push(String(msg)),
		},
	})
}

async function verifyStaticPackage(buffer) {
	const zip = await JSZip.loadAsync(buffer)
	const names = Object.keys(zip.files)
	const issues = []
	const errors = []
	const parser = makeParser(errors)
	let slideCount = 0
	let danglingRels = 0
	let tableCount = 0
	let customGeometryCount = 0
	let equationCount = 0
	let transitionCount = 0
	let animationTimingCount = 0
	let gradientFillCount = 0
	let shadowCount = 0
	let textWarpCount = 0
	let text3DCount = 0
	const chartCount = names.filter(n => /^ppt\/charts\/chart\d+\.xml$/i.test(n)).length
	const imageMediaCount = names.filter(n => /^ppt\/media\/.+\.(png|jpe?g|gif|webp|svg)$/i.test(n)).length
	const audioMediaCount = names.filter(n => /^ppt\/media\/.+\.(wav|mp3|m4a|aac)$/i.test(n)).length
	const modelMediaCount = names.filter(n => /^ppt\/media\/.+\.(glb|gltf|obj|stl|3mf)$/i.test(n) || /^ppt\/embeddings\/.+\.(glb|gltf|obj|stl|3mf)$/i.test(n)).length
	const notesSlideCount = names.filter(n => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(n)).length
	const presPropsXml = zip.file('ppt/presProps.xml') ? await zip.file('ppt/presProps.xml').async('string') : ''
	const showNarration = /\bshowNarration="1"/.test(presPropsXml)
	const useTimings = /\buseTimings="1"/.test(presPropsXml)
	if (!zip.file('[Content_Types].xml')) issues.push('missing [Content_Types].xml')
	if (!zip.file('ppt/presentation.xml')) issues.push('missing ppt/presentation.xml')
	for (const name of names) {
		const file = zip.file(name)
		if (!file || file.dir) continue
		if (/\.(xml|rels)$/i.test(name)) {
			const xml = await file.async('string')
			parser.parseFromString(xml, 'text/xml')
			if (/ppt\/slides\/slide\d+\.xml$/i.test(name)) {
				slideCount += 1
				tableCount += (xml.match(/<a:tbl\b/g) || []).length
				customGeometryCount += (xml.match(/<a:custGeom\b/g) || []).length
				equationCount += (xml.match(/<m:oMath\b|<m:oMathPara\b/g) || []).length
				transitionCount += (xml.match(/<p:transition\b/g) || []).length
				animationTimingCount += (xml.match(/<p:timing\b/g) || []).length
				gradientFillCount += (xml.match(/<a:gradFill\b/g) || []).length
				shadowCount += (xml.match(/<a:(?:outerShdw|innerShdw)\b/g) || []).length
				textWarpCount += (xml.match(/<a:prstTxWarp\b/g) || []).length
				text3DCount += (xml.match(/<a:scene3d\b|<a:sp3d\b/g) || []).length
			}
		}
	}
	for (const name of names) {
		const match = name.match(/^ppt\/slides\/(slide\d+)\.xml$/i)
		if (!match) continue
		const xml = await zip.file(name).async('string')
		const relsName = `ppt/slides/_rels/${match[1]}.xml.rels`
		const relsXml = zip.file(relsName) ? await zip.file(relsName).async('string') : ''
		const declaredIds = new Set([...relsXml.matchAll(/Id="([^"]+)"/g)].map(x => x[1]))
		for (const ref of xml.matchAll(/r:(?:embed|id|link)="([^"]+)"/g)) {
			if (!declaredIds.has(ref[1])) danglingRels += 1
		}
	}
	if (slideCount !== 5) issues.push(`expected 5 slides, found ${slideCount}`)
	if (errors.length) issues.push(`xml parse issues: ${errors.length}`)
	if (danglingRels) issues.push(`dangling slide relationships: ${danglingRels}`)
	return {
		ok: issues.length === 0,
		slideCount,
		xmlIssues: errors.length,
		danglingRels,
		chartCount,
		tableCount,
		imageMediaCount,
		audioMediaCount,
		modelMediaCount,
		notesSlideCount,
		customGeometryCount,
		equationCount,
		transitionCount,
		animationTimingCount,
		gradientFillCount,
		shadowCount,
		textWarpCount,
		text3DCount,
		showNarration,
		useTimings,
		issues,
	}
}

function designMetric(designData, key) {
	return Number(designData?.metrics?.[key] ?? 0) || 0
}

function shortIssues(issues, limit = 5) {
	if (!Array.isArray(issues) || !issues.length) return ''
	return issues.slice(0, limit).map(issue => {
		if (typeof issue === 'string') return issue
		return issue.code || issue.label || issue.message || JSON.stringify(issue).slice(0, 120)
	}).join('; ')
}

function assertResultOk(label, data) {
	if (data && data.ok === false) throw new Error(`${label} failed: ${shortIssues(data.issues) || 'ok=false'}`)
}

function strictFeatureCoverageIssues(scenario, stat, designData, narrationData) {
	const issues = []
	const batchNo = scenario.batchNumber
	const visualProofObjects = designMetric(designData, 'visualProofObjects')
	const diagramSlides = designMetric(designData, 'diagramSlides')
	const animatedSlides = designMetric(designData, 'animatedSlides')
	const model3DObjects = designMetric(designData, 'model3DObjects')
	const narratedSlides = designMetric(designData, 'narratedSlides')
	const captionSlides = designMetric(designData, 'captionSlides')

	if (designData?.ok === false) issues.push(`design gate failed score=${designData.score}/${designData.minScore}: ${shortIssues(designData.issues)}`)
	if ([1, 2, 3, 4].includes(batchNo) && visualProofObjects < 5) issues.push(`expected executive/product/dashboard/data visual proof across 5 slides, found ${visualProofObjects}`)
	if (batchNo === 4 && stat.chartCount < 2) issues.push(`expected at least 2 chart parts for data storytelling, found ${stat.chartCount}`)
	if (batchNo === 5 && stat.tableCount < 2) issues.push(`expected at least 2 table objects, found ${stat.tableCount}`)
	if (batchNo === 7 && stat.imageMediaCount < 1) issues.push(`expected embedded image media, found ${stat.imageMediaCount}`)
	if (batchNo === 8 && stat.customGeometryCount < 1) issues.push(`expected custom/freeform geometry, found ${stat.customGeometryCount}`)
	if (batchNo === 9 && (stat.textWarpCount < 1 && stat.text3DCount < 1)) issues.push('expected WordArt/text effect XML, found none')
	if (batchNo === 10 && (stat.gradientFillCount < 3 || stat.shadowCount < 1)) issues.push(`expected shape/effect XML with gradients/shadows, found gradients=${stat.gradientFillCount} shadows=${stat.shadowCount}`)
	if (batchNo === 11 && diagramSlides < 1) issues.push(`expected diagram/process visual proof, found diagramSlides=${diagramSlides}`)
	if (batchNo === 12 && stat.equationCount < 1) issues.push(`expected equation XML, found ${stat.equationCount}`)
	if (batchNo === 13 && (animatedSlides < 3 && stat.animationTimingCount < 3)) issues.push(`expected animation coverage, found animatedSlides=${animatedSlides} timingParts=${stat.animationTimingCount}`)
	if (batchNo === 14 && stat.transitionCount < 5) issues.push(`expected transitions on all 5 slides, found ${stat.transitionCount}`)
	if (batchNo === 15) {
		if (narrationData?.ok === false) issues.push(`narration validator failed: ${shortIssues(narrationData.issues)}`)
		if (stat.audioMediaCount < 5) issues.push(`expected one audio media part per narrated slide, found ${stat.audioMediaCount}`)
		if (!stat.showNarration) issues.push('ppt/presProps.xml missing showNarration=1')
		if (!stat.useTimings) issues.push('ppt/presProps.xml missing useTimings=1')
		if (narratedSlides < 5) issues.push(`expected 5 narrated slides in design metrics, found ${narratedSlides}`)
		if (captionSlides < 5) issues.push(`expected 5 captioned slides in design metrics, found ${captionSlides}`)
	}
	if (batchNo === 16 && (model3DObjects < 1 && stat.modelMediaCount < 1)) issues.push(`expected 3D/model proof, found model3DObjects=${model3DObjects} modelMedia=${stat.modelMediaCount}`)
	return issues
}

async function downloadDeck({ downloadUrl, base, auth, outPath, expectedBytes }) {
	const res = await fetch(downloadUrl, { headers: sameOriginHeaders(downloadUrl, base, auth) })
	const buffer = Buffer.from(await res.arrayBuffer())
	if (res.status !== 200 || buffer.length < 1000 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
		throw new Error(`download failed status=${res.status} bytes=${buffer.length}`)
	}
	if (expectedBytes && Math.abs(buffer.length - expectedBytes) > 8) {
		throw new Error(`download byte count differed expected=${expectedBytes} actual=${buffer.length}`)
	}
	fs.writeFileSync(outPath, buffer)
	return buffer
}

function extractCredits(payload) {
	const data = payload?.data || {}
	return Number(data.estimatedCredits ?? data.credits ?? data.creditCost ?? data.billing?.estimatedCredits ?? 0) || 0
}

async function runDeckScenario({ scenario, opts, mcpUrl, base, auth, recorder, dirs }) {
	const started = Date.now()
	let client = null
	const row = {
		runId: recorder.runId,
		scenarioId: scenario.scenarioId,
		batch: scenario.batch,
		variant: scenario.variant,
		family: scenario.family,
		seed: scenario.seed,
		fileName: scenario.fileName,
		startedAt: new Date(started).toISOString(),
		endedAt: '',
		status: 'started',
		slideCount: 0,
		savedBytes: 0,
		downloadedBytes: 0,
		staticOk: false,
		staticIssues: [],
		featureGateOk: false,
		featureGateIssues: [],
		designScore: null,
		designOk: null,
		narrationOk: null,
		billingEstimatedCredits: 0,
		downloadPath: '',
		error: '',
	}
	try {
		client = await createRpc(mcpUrl, auth, `mc3-${scenario.scenarioId}`)
		await maybeActivate(client, recorder, scenario, opts.requireActivation)
		await callTool({ client, recorder, scenario, toolName: 'betterpptx.auth.status', args: {}, required: false })
		const deckPayload = await callTool({
			client,
			recorder,
			scenario,
			toolName: 'betterpptx.deck.new',
			args: { title: `${scenario.scenarioId} ${scenario.family}`, layout: 'LAYOUT_WIDE', idempotencyKey: `${scenario.scenarioId}-deck` },
		})
		const deck = requireData('deck.new', deckPayload)
		const deckId = deck.deckId
		const ctx = { client, recorder, scenario, deckId, includeHeavy: opts.includeHeavy, strictAutoshowcase: opts.strictAutoshowcase }
		for (let slideNo = 0; slideNo < 5; slideNo++) {
			const slideIndex = await addSlideWithBase({ client, recorder, scenario, deckId, slideNo })
			await addFamilyContent(ctx, slideIndex, slideNo)
			await callTool({
				client, recorder, scenario, toolName: 'betterpptx.slide.add_notes',
				args: {
					deckId,
					slideIndex,
					notes: `MC3 evidence notes for ${scenario.scenarioId}, ${scenario.family}, slide ${slideNo + 1}.`,
					idempotencyKey: `${scenario.scenarioId}-notes-${slideNo}`,
				},
			})
		}
		await runPostBuildEditing(ctx)
		const summary = requireData('deck.summary', await callTool({ client, recorder, scenario, toolName: 'betterpptx.deck.summary', args: { deckId }, required: false }))
		row.slideCount = Number(summary.slideCount || 0)
		const packageValidation = requireData('deck.validate', await callTool({
			client,
			recorder,
			scenario,
			toolName: 'betterpptx.deck.validate',
			args: { deckId, mode: 'normal' },
			required: opts.strictAutoshowcase,
		}))
		if (opts.strictAutoshowcase) assertResultOk('deck.validate', packageValidation)
		const designValidation = requireData('deck.validate_design', await callTool({
			client,
			recorder,
			scenario,
			toolName: 'betterpptx.deck.validate_design',
			args: {
				deckId,
				profile: scenario.batchNumber === 15 ? 'narrated-showcase' : 'modern',
				minScore: scenario.batchNumber === 15 ? 80 : 70,
				requireNarration: scenario.batchNumber === 15,
				requireMotion: [13, 14, 15, 16].includes(scenario.batchNumber),
				requireVisualProof: true,
				requireExpressive3D: scenario.batchNumber === 16,
			},
			required: opts.strictAutoshowcase,
		}))
		row.designScore = Number(designValidation.score ?? 0)
		row.designOk = Boolean(designValidation.ok)
		if (opts.strictAutoshowcase) assertResultOk('deck.validate_design', designValidation)
		let narrationValidation = null
		if (scenario.batchNumber === 15) {
			narrationValidation = requireData('deck.validate_narration', await callTool({
				client,
				recorder,
				scenario,
				toolName: 'betterpptx.deck.validate_narration',
				args: { deckId },
				required: opts.strictAutoshowcase,
			}))
			row.narrationOk = Boolean(narrationValidation.ok)
			if (opts.strictAutoshowcase) assertResultOk('deck.validate_narration', narrationValidation)
		}
		const estimatePayload = await callTool({
			client, recorder, scenario, toolName: 'betterpptx.billing.estimate',
			args: { toolName: 'betterpptx.deck.save', deckId },
			required: false,
		})
		row.billingEstimatedCredits = extractCredits(estimatePayload)
		recorder.billing({
			runId: recorder.runId,
			scenarioId: scenario.scenarioId,
			event: 'pre-save-estimate',
			estimatedCredits: row.billingEstimatedCredits,
			at: new Date().toISOString(),
		})
		const saveArgs = { deckId, fileName: scenario.fileName, idempotencyKey: `${scenario.scenarioId}-save` }
		const saved = requireData('deck.save', await callTool({ client, recorder, scenario, toolName: 'betterpptx.deck.save', args: saveArgs }))
		const replay = requireData('deck.save replay', await callTool({ client, recorder, scenario, toolName: 'betterpptx.deck.save', args: saveArgs }))
		if (!saved.downloadUrl || saved.downloadUrl !== replay.downloadUrl || replay.idempotentReplay !== true) {
			throw new Error('deck.save idempotent replay mismatch')
		}
		row.savedBytes = Number(saved.bytes || 0)
		const outPath = path.join(dirs.decks, scenario.fileName)
		const buffer = await downloadDeck({ downloadUrl: saved.downloadUrl, base, auth, outPath, expectedBytes: saved.bytes })
		row.downloadedBytes = buffer.length
		row.downloadPath = outPath
		if (!opts.skipStatic) {
			const stat = await verifyStaticPackage(buffer)
			row.staticOk = stat.ok
			row.staticIssues = stat.issues
			row.packageSlideCount = stat.slideCount
			row.packageXmlIssues = stat.xmlIssues
			row.danglingRels = stat.danglingRels
			row.packageFeatureCounts = {
				charts: stat.chartCount,
				tables: stat.tableCount,
				images: stat.imageMediaCount,
				audio: stat.audioMediaCount,
				models: stat.modelMediaCount,
				notes: stat.notesSlideCount,
				customGeometry: stat.customGeometryCount,
				equations: stat.equationCount,
				transitions: stat.transitionCount,
				animationTiming: stat.animationTimingCount,
				gradients: stat.gradientFillCount,
				shadows: stat.shadowCount,
				textWarp: stat.textWarpCount,
				text3D: stat.text3DCount,
				showNarration: stat.showNarration,
				useTimings: stat.useTimings,
			}
			if (!stat.ok) throw new Error(`static package check failed: ${stat.issues.join('; ')}`)
			if (opts.strictAutoshowcase) {
				const featureIssues = strictFeatureCoverageIssues(scenario, stat, designValidation, narrationValidation)
				row.featureGateIssues = featureIssues
				row.featureGateOk = featureIssues.length === 0
				if (featureIssues.length) throw new Error(`strict autoshowcase feature gate failed: ${featureIssues.join('; ')}`)
			} else {
				row.featureGateOk = true
			}
		}
		await callTool({ client, recorder, scenario, toolName: 'betterpptx.billing.usage_summary', args: {}, required: false })
		row.status = 'passed'
	} catch (err) {
		row.status = 'failed'
		row.error = String(err?.message || err).slice(0, 500)
	} finally {
		if (client?.close) await client.close()
		row.endedAt = new Date().toISOString()
		row.totalMs = Date.now() - started
		recorder.deck(row)
	}
	return row
}

async function mapLimit(items, limit, fn) {
	const results = []
	let next = 0
	async function worker() {
		while (next < items.length) {
			const index = next++
			results[index] = await fn(items[index], index)
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
	return results
}

function snapshotTimeoutMs(key) {
	if (key === 'gcsDu') return 180000
	if (key === 'artifactImages') return 120000
	return 120000
}

async function collectGcpSnapshot(opts) {
	if (opts.skipGcpSnapshot) return { skipped: true }
	const project = opts.gcpProject
	const region = opts.gcpRegion
	const bucket = opts.gcsBucket
	const commands = {
		mcpService: `gcloud run services describe betterpptx-mcp-staging --region ${region} --project ${project} --format=json`,
		webhookService: `gcloud run services describe betterpptx-dodo-webhook-staging --region ${region} --project ${project} --format=json`,
		recentBuilds: `gcloud builds list --region ${region} --project ${project} --limit=10 --format=json`,
		gcsDu: `gcloud storage du -s gs://${bucket}`,
	}
	if (opts.deepGcpSnapshot) {
		commands.mcpRevisions = `gcloud run revisions list --service betterpptx-mcp-staging --region ${region} --project ${project} --format=json`
		commands.webhookRevisions = `gcloud run revisions list --service betterpptx-dodo-webhook-staging --region ${region} --project ${project} --format=json`
		commands.artifactImages = `gcloud artifacts docker images list ${region}-docker.pkg.dev/${project}/betterpptx-mcp --include-tags --format=json`
		commands.secretList = `gcloud secrets list --project ${project} --format=json`
	}
	const raw = {}
	for (const [key, command] of Object.entries(commands)) raw[key] = await runTextManaged(command, snapshotTimeoutMs(key))
	return {
		skipped: false,
		depth: opts.deepGcpSnapshot ? 'deep' : 'minimal',
		project,
		region,
		bucket,
		mcpService: parseJsonText(raw.mcpService),
		webhookService: parseJsonText(raw.webhookService),
		mcpRevisions: parseJsonText(raw.mcpRevisions),
		webhookRevisions: parseJsonText(raw.webhookRevisions),
		artifactImages: parseJsonText(raw.artifactImages),
		recentBuilds: parseJsonText(raw.recentBuilds),
		secretList: parseJsonText(raw.secretList),
		gcsDuText: raw.gcsDu.stdout || '',
		rawCommandStatus: Object.fromEntries(Object.entries(raw).map(([key, result]) => [key, { ok: result.ok, error: result.error || '' }])),
	}
}

async function fetchJsonSafe(url, auth) {
	try {
		return await fetchJson(url, auth)
	} catch (err) {
		return {
			res: { status: 0 },
			data: { ok: false, error: String(err?.message || err).slice(0, 500) },
		}
	}
}

async function writeSnapshot({ label, base, auth, recorder, dirs, opts, scenarios }) {
	const [health, mc, gcp] = await Promise.all([
		fetchJsonSafe(`${base}/health`, auth),
		fetchJsonSafe(`${base}/ops/mission-control/data`, auth),
		collectGcpSnapshot(opts),
	])
	const snapshot = {
		runId: recorder.runId,
		label,
		at: new Date().toISOString(),
		mcpUrl: redactUrl(opts.mcpUrl),
		maxDecks: opts.maxDecks,
		startIndex: opts.startIndex,
		concurrency: opts.concurrency,
		includeHeavy: opts.includeHeavy,
		scenarioCount: scenarios.length,
		healthStatus: health.res.status,
		health: health.data,
		missionControlStatus: mc.res.status,
		missionControl: mc.data ? {
			mode: mc.data.mode,
			gates: Array.isArray(mc.data.gates) ? mc.data.gates.map(g => ({ id: g.id, status: g.status })) : [],
			metrics: mc.data.metrics || {},
		} : null,
		gcp,
	}
	fs.writeFileSync(path.join(dirs.snapshots, `${label}.json`), JSON.stringify(snapshot, null, 2))
}

async function main() {
	const opts = parseArgs(process.argv.slice(2))
	loadEnvFile(opts.envFile)
	runtimeToolRetries = opts.toolRetries
	runtimeRetryBaseMs = opts.retryBaseMs
	runtimeToolSpacingMs = opts.toolSpacingMs
	opts.mcpUrl = normalizeMcpUrl(opts.mcpUrl)
	if (opts.strictAutoshowcase && opts.skipStatic) throw new Error('--strict-autoshowcase requires static package validation; remove --skip-static.')
	const base = baseUrl(opts.mcpUrl)
	const baselineAuth = authValue(opts)
	const runDir = path.join(opts.outputRoot, opts.runId)
	const dirs = {
		run: runDir,
		decks: path.join(runDir, 'decks'),
		repair: path.join(runDir, 'repair'),
		report: path.join(runDir, 'report'),
		snapshots: path.join(runDir, 'cost-snapshots'),
	}
	Object.values(dirs).forEach(mkdirp)
	const recorder = new HarnessRecorder({ runId: opts.runId, runDir })
	const scenarios = buildScenarios(opts.maxDecks, opts.startIndex)
	fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify({
		runId: opts.runId,
		createdAt: new Date().toISOString(),
		harness: path.relative(process.cwd(), fileURLToPath(import.meta.url)),
		plan: 'plans/betterpptx-mc3-500-slide-realworld-test-plan.md',
		mcpUrl: redactUrl(opts.mcpUrl),
		outputRoot: opts.outputRoot,
		maxDecks: opts.maxDecks,
		startIndex: opts.startIndex,
		fullRun: opts.fullRun,
		concurrency: opts.concurrency,
		includeHeavy: opts.includeHeavy,
		strictAutoshowcase: opts.strictAutoshowcase,
		requireActivation: opts.requireActivation,
		staticValidation: !opts.skipStatic,
		scenarios,
	}, null, 2))
	await writeSnapshot({ label: 'baseline', base, auth: baselineAuth, recorder, dirs, opts, scenarios })
	const workAuth = authValue(opts)
	console.log(`MC3 HARNESS: run=${opts.runId} target=${redactUrl(opts.mcpUrl)} decks=${scenarios.length} concurrency=${opts.concurrency} auth=${workAuth ? 'yes' : 'no'}`)
	const rows = await mapLimit(scenarios, opts.concurrency, scenario => runDeckScenario({ scenario, opts, mcpUrl: opts.mcpUrl, base, auth: workAuth, recorder, dirs }))
	const postrunAuth = authValue(opts)
	await writeSnapshot({ label: 'postrun', base, auth: postrunAuth, recorder, dirs, opts, scenarios })
	const passed = rows.filter(r => r.status === 'passed').length
	const failed = rows.length - passed
	const slides = rows.filter(r => r.status === 'passed').reduce((sum, r) => sum + (Number(r.packageSlideCount || r.slideCount) || 0), 0)
	const bytes = rows.filter(r => r.status === 'passed').reduce((sum, r) => sum + (Number(r.downloadedBytes) || 0), 0)
	const summary = {
		runId: opts.runId,
		endedAt: new Date().toISOString(),
		decksAttempted: rows.length,
		decksPassed: passed,
		decksFailed: failed,
		slidesPassed: slides,
		downloadedBytes: bytes,
		outputDir: runDir,
		repairCommand: `node ${path.relative(process.cwd(), path.join(here, 'verify-public-gallery-repair.mjs'))} --deck-dir ${path.join(runDir, 'decks')} --decypher-index C:\\MyDoc\\PptxGenJS_Claude\\dist\\node\\pptx-decypher\\index.js --require-com`,
	}
	fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2))
	console.log(`MC3 HARNESS: ${failed ? 'FAIL' : 'PASS'} decks=${passed}/${rows.length} slides=${slides} bytes=${bytes}`)
	console.log(`MC3 HARNESS: output=${runDir}`)
	console.log(`MC3 HARNESS: repair next -> ${summary.repairCommand}`)
	if (failed) process.exit(1)
}

main().catch(err => {
	console.error(`MC3 HARNESS: FAIL ${err.message || err}`)
	process.exit(1)
})
