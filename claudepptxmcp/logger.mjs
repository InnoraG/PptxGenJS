// betterpptx structured development logger.
//
// Logging is opt-in because MCP traffic can contain user data and large assets.
// Enable with BETTERPPTX_LOG=debug or BETTERPPTX_LOG=full. Full mode records
// complete JSON payloads unless BETTERPPTX_LOG_MAX_CHARS is set.

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { inspect } from 'node:util'

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'debug', 'trace', 'full', 'all'])
const FULL_VALUES = new Set(['trace', 'full', 'all'])
const SECRET_KEY = /^(key|licenseKey|activationKey|apiKey|accessKey|privateKey|secret|token|password|passwd|authorization|cookie|set-cookie)$/i
const SECRET_KEY_FRAGMENT = /authorization|cookie|set-cookie|token|secret|password|passwd|api[-_]?key|access[-_]?key|private[-_]?key|license[-_]?key|activation[-_]?key/i
const PAYLOAD_KEY = /^(content|data|pptxData|pptxBase64|body|rawBody|audio|imageData|fileData|base64|script|text|notes|prompt|html|xml|rows|source)$/i
const PATH_KEY = /^(path|filePath|sourcePath|templatePath|pptxPath|outputDir|workDir|downloadRoot|uploadDir|fileName|filename|saveToPath)$/i

let state = null
let seq = 0

function envFlag(name) {
	return String(process.env[name] || '').toLowerCase()
}

export function isLoggingEnabled() {
	return TRUE_VALUES.has(envFlag('BETTERPPTX_LOG')) || TRUE_VALUES.has(envFlag('BETTERPPTX_TRACE'))
}

export function isFullLogging() {
	return FULL_VALUES.has(envFlag('BETTERPPTX_LOG')) || FULL_VALUES.has(envFlag('BETTERPPTX_TRACE'))
}

function includeSecrets() {
	return process.env.BETTERPPTX_LOG_SECRETS === '1'
}

function includePayloads() {
	return process.env.BETTERPPTX_LOG_PAYLOADS === '1'
}

function includePrivatePaths() {
	return process.env.BETTERPPTX_LOG_PATHS === '1'
}

function maxChars() {
	const raw = process.env.BETTERPPTX_LOG_MAX_CHARS
	if (raw !== undefined && raw !== '') return Math.max(0, Number(raw) || 0)
	return isFullLogging() ? 0 : 200000
}

function getState() {
	if (!isLoggingEnabled()) return null
	if (state) return state
	const stamp = new Date().toISOString().replace(/[:.]/g, '-')
	const dir = path.resolve(process.env.BETTERPPTX_LOG_DIR || path.join(process.cwd(), 'logs', 'betterpptx'))
	const file = path.resolve(process.env.BETTERPPTX_LOG_FILE || path.join(dir, `mcp-${stamp}-${process.pid}.ndjson`))
	fs.mkdirSync(path.dirname(file), { recursive: true })
	state = { dir: path.dirname(file), file, pid: process.pid, startedAt: new Date().toISOString() }
	return state
}

export function getLoggerInfo() {
	const s = getState()
	return {
		enabled: Boolean(s),
		full: isFullLogging(),
		file: s?.file || null,
		secretsIncluded: includeSecrets(),
		maxChars: maxChars(),
	}
}

export function createTraceId(prefix = 'evt') {
	return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`
}

function serializeScalar(value) {
	if (typeof value === 'bigint') return value.toString()
	if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`
	if (typeof value === 'symbol') return value.toString()
	return value
}

function redactUrlSecret(value) {
	return String(value).replace(/\/s\/[^/]+\/mcp\b/g, '/s/[REDACTED]/mcp')
}

function shouldRedactKey(key) {
	return key !== 'secretsIncluded' && (SECRET_KEY.test(key) || SECRET_KEY_FRAGMENT.test(key))
}

function hashPreview(value) {
	let text
	try { text = typeof value === 'string' ? value : JSON.stringify(value) }
	catch (_) { text = inspect(value, { depth: 4, breakLength: Infinity }) }
	return {
		redacted: true,
		chars: text.length,
		sha256: crypto.createHash('sha256').update(text).digest('hex').slice(0, 16),
	}
}

function summarizePath(value) {
	const text = String(value || '')
	return {
		redacted: true,
		kind: 'path',
		baseName: path.basename(text).replace(/[^A-Za-z0-9._() -]/g, '_'),
	}
}

function redact(value, key = '', seen = new WeakSet()) {
	if (!includeSecrets() && key && shouldRedactKey(key)) return '[REDACTED]'
	if (value === null || value === undefined) return value
	const t = typeof value
	if (!includePayloads() && key && PAYLOAD_KEY.test(key)) return hashPreview(value)
	if (!includePrivatePaths() && key && PATH_KEY.test(key)) return summarizePath(value)
	if (!includeSecrets() && t === 'string' && key === 'rawBody') {
		try { return redact(JSON.parse(value), key, seen) } catch (_) { return redactUrlSecret(value) }
	}
	if (!includeSecrets() && t === 'string') return redactUrlSecret(value)
	if (t !== 'object') return serializeScalar(value)
	if (Buffer.isBuffer(value)) {
		return isFullLogging()
			? { type: 'Buffer', bytes: value.length, base64: value.toString('base64') }
			: { type: 'Buffer', bytes: value.length, sha256: crypto.createHash('sha256').update(value).digest('hex') }
	}
	if (seen.has(value)) return '[Circular]'
	seen.add(value)
	if (Array.isArray(value)) return value.map((v, i) => redact(v, String(i), seen))
	const out = {}
	for (const [k, v] of Object.entries(value)) out[k] = redact(v, k, seen)
	return out
}

function jsonLine(record) {
	let line
	try {
		line = JSON.stringify(record)
	} catch (_) {
		line = JSON.stringify({
			ts: record.ts,
			seq: record.seq,
			type: 'logger.serialization_error',
			originalType: record.type,
			data: inspect(record.data, { depth: 8, breakLength: Infinity }),
		})
	}
	const cap = maxChars()
	if (cap > 0 && line.length > cap) {
		const originalChars = line.length
		const budget = Math.max(200, cap - 500)
		const fallback = {
			ts: record.ts,
			seq: record.seq,
			pid: record.pid,
			type: record.type,
			truncated: true,
			originalChars,
			dataPreview: inspect(record.data, { depth: 10, breakLength: Infinity }).slice(0, budget),
		}
		return `${JSON.stringify(fallback)}\n`
	}
	return `${line}\n`
}

export function logEvent(type, data = {}) {
	const s = getState()
	if (!s) return null
	const record = {
		ts: new Date().toISOString(),
		seq: ++seq,
		pid: process.pid,
		type,
		data: redact(data),
	}
	try {
		fs.appendFileSync(s.file, jsonLine(record), 'utf8')
	} catch (err) {
		process.stderr.write(`[betterpptx:logger] write failed: ${err?.message || err}\n`)
	}
	return record.seq
}

export function logToolStart(name, args, meta = {}) {
	const callId = createTraceId('tool')
	logEvent('tool.call.start', { callId, name, args, meta })
	return { callId, startedAt: process.hrtime.bigint(), name }
}

export function logToolEnd(trace, result) {
	if (!trace) return
	const durationMs = Number(process.hrtime.bigint() - trace.startedAt) / 1e6
	logEvent('tool.call.end', { callId: trace.callId, name: trace.name, durationMs, result })
}

export function logToolThrow(trace, error) {
	if (!trace) return
	const durationMs = Number(process.hrtime.bigint() - trace.startedAt) / 1e6
	logEvent('tool.call.throw', {
		callId: trace.callId,
		name: trace.name,
		durationMs,
		error: { message: String(error?.message || error), stack: error?.stack },
	})
}
