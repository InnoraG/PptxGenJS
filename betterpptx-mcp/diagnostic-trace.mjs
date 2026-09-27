// Private, opt-in development evidence. This is deliberately independent of
// BETTERPPTX_LOG=full and never accepts request/response bodies or credentials.
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createHash } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'

const MAX_FILE_BYTES = 8 * 1024 * 1024
const MAX_ROTATIONS = 3
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000
let filePath = null
let sequence = 0
const requestContext = new AsyncLocalStorage()

export function withDiagnosticRequest(requestId, fn) {
	return diagnosticTraceEnabled() ? requestContext.run({ requestId: safeId(requestId) }, fn) : fn()
}

export function diagnosticRequestId(fallback) {
	return requestContext.getStore()?.requestId || fallback
}

export function diagnosticTraceEnabled() {
	return process.env.BETTERPPTX_DIAGNOSTIC_TRACE === '1'
}

function traceFile() {
	if (!diagnosticTraceEnabled()) return null
	if (filePath) return filePath
	const dir = path.resolve(process.env.BETTERPPTX_DIAGNOSTIC_TRACE_DIR || path.join(process.cwd(), 'logs', 'betterpptx-mcp', 'diagnostic'))
	fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
	try {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (!entry.isFile() || !/^trace-\d+\.ndjson(?:\.[1-3])?$/.test(entry.name)) continue
			const candidate = path.join(dir, entry.name)
			if (Date.now() - fs.statSync(candidate).mtimeMs > RETENTION_MS) fs.unlinkSync(candidate)
		}
	} catch { /* Cleanup failure must not affect the service. */ }
	filePath = path.join(dir, `trace-${process.pid}.ndjson`)
	return filePath
}

function digest(value) {
	return createHash('sha256').update(value).digest('hex')
}

function safeName(value) {
	const name = String(value || '')
	return /^[a-zA-Z0-9_.-]{1,120}$/.test(name) ? name : 'invalid-name'
}

function safeId(value) {
	const id = String(value || '')
	return /^[a-zA-Z0-9_-]{1,100}$/.test(id) ? id : null
}

function rotate(file) {
	try {
		if (!fs.existsSync(file) || fs.statSync(file).size < MAX_FILE_BYTES) return
		const oldest = `${file}.${MAX_ROTATIONS}`
		if (fs.existsSync(oldest)) fs.unlinkSync(oldest)
		for (let n = MAX_ROTATIONS; n >= 1; n--) {
			const older = n === 1 ? file : `${file}.${n - 1}`
			const newer = `${file}.${n}`
			if (fs.existsSync(older)) fs.renameSync(older, newer)
		}
	} catch {
		// Observability must never break the public authoring path.
	}
}

function emit(type, fields) {
	try {
		const file = traceFile()
		if (!file) return
		rotate(file)
		fs.appendFileSync(file, `${JSON.stringify({ version: 1, at: new Date().toISOString(), sequence: ++sequence, type, ...fields })}\n`, { encoding: 'utf8', mode: 0o600 })
	} catch {
		// Fail closed for diagnostics, not for customer requests.
	}
}

export function traceToolList({ requestId, transport, tools, manifest, profile }) {
	if (!diagnosticTraceEnabled()) return
	try {
		const entries = tools.map(tool => {
			const schema = JSON.stringify(tool.inputSchema || {})
			return { name: safeName(tool.name), readOnly: tool.annotations?.readOnlyHint === true, inputBytes: Buffer.byteLength(schema), inputSha256: digest(schema) }
		})
		emit('tools.list', {
			requestId: safeId(requestId), transport: safeName(transport), profile: safeName(profile || 'canonical'),
			toolCount: entries.length, readOnlyCount: entries.filter(item => item.readOnly).length,
			writeCapableCount: entries.filter(item => !item.readOnly).length,
			schemaVersion: safeName(manifest?.toolSchemaVersion),
			buildIdentity: safeName(manifest?.buildIdentity), advertisedDigest: safeName(manifest?.advertisedToolSchemaDigest),
			tools: entries,
		})
	} catch { /* Diagnostics are nonessential. */ }
}

export function traceToolCall({ requestId, transport, name, outcome, errorCode, durationMs }) {
	if (!diagnosticTraceEnabled()) return
	emit('tools.call', {
		requestId: safeId(requestId), transport: safeName(transport), name: safeName(name),
		outcome: ['ok', 'rejected', 'failed'].includes(outcome) ? outcome : 'unknown',
		errorCode: errorCode ? safeName(errorCode) : null,
		durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : null,
	})
}

export function traceInternalOperation({ requestId, callId, name, phase, errorCode, durationMs }) {
	if (!diagnosticTraceEnabled()) return
	emit('engine.operation', {
		requestId: safeId(requestId), callId: safeId(callId), name: safeName(name),
		phase: ['start', 'end', 'throw'].includes(phase) ? phase : 'unknown',
		errorCode: errorCode ? safeName(errorCode) : null,
		durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : null,
	})
}

export function traceMcpHttp({ requestId, method, statusCode, responseBytes, durationMs, authOutcome }) {
	if (!diagnosticTraceEnabled()) return
	emit('mcp.http', {
		requestId: safeId(requestId), method: safeName(method),
		statusCode: Number.isInteger(statusCode) ? statusCode : null,
		responseBytes: Number.isSafeInteger(responseBytes) ? responseBytes : null,
		durationMs: Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : null,
		authOutcome: ['accepted', 'rejected', 'anonymous', 'not-checked'].includes(authOutcome) ? authOutcome : 'not-checked',
	})
}

export function traceAuthDecision({ requestId, outcome, code }) {
	if (!diagnosticTraceEnabled()) return
	emit('auth.decision', {
		requestId: safeId(requestId),
		outcome: ['accepted', 'rejected', 'anonymous'].includes(outcome) ? outcome : 'rejected',
		code: code ? safeName(code) : null,
	})
}

// Private development trace for the offer -> fetch handoff. Never record the
// signed URL, permit, filename, user agent, IP address, or response body.
export function traceArtifactDelivery({ phase, routePath, statusCode = null, bytes = null, completed = null }) {
	if (!diagnosticTraceEnabled()) return
	const pathOnly = String(routePath || '')
	if (!/^\/files\/[A-Za-z0-9_-]{24}\/[A-Za-z0-9._()% -]+$/.test(pathOnly)) return
	emit('artifact.delivery', {
		requestId: safeId(diagnosticRequestId(null)),
		phase: ['offered', 'requested', 'finished', 'aborted'].includes(phase) ? phase : 'unknown',
		artifactKey: digest(pathOnly).slice(0, 20),
		statusCode: Number.isInteger(statusCode) ? statusCode : null,
		bytes: Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null,
		completed: typeof completed === 'boolean' ? completed : null,
	})
}
