// betterpptx engine
// In-memory deck registry + tool implementations.
// Calls into the bundled self-contained PPTX runtime.

import * as path from 'node:path'
import * as fsNode from 'node:fs'
import * as fs from 'node:fs/promises'
import * as crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as zlib from 'node:zlib'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { BETTERPPTX_BRAND } from './branding.mjs'
import { logEvent, logToolEnd, logToolStart, logToolThrow } from './logger.mjs'
import { secondsToMs, clampAdvanceMs, assertLikelyMilliseconds } from './narration/timing.mjs'
import { getVoices, synthesizeNarration, resolveNarrationAudio, makeNarrationObjectName } from './narration/service.mjs'
import { hashText } from './narration/audio.mjs'
import { assertNoPublicLocalPathArgs, assertPublicToolAllowed, isPublicBlackBoxMode, sanitizePublicResult } from './blackbox.mjs'
import { isValidWordArtTransform, listOptionCatalog } from './option-registry.mjs'
import { SafeFetchError, safeFetchJson, safeFetchToBuffer } from './net/safe-fetch.mjs'
import { createArtifactStore } from './storage/artifact-store.mjs'
import { getBillingTelemetrySummary, getTelemetrySnapshot, recordToolTelemetry } from './telemetry.mjs'
import { publicBillingDryRunSummary, recordBillingDryRunOperation } from './billing/estimator.mjs'
import {
	publicBillingEstimate,
	publicBillingStatus,
	publicBillingUrls,
	publicPlanModel,
	publicUsageSummary,
} from './billing/checkout.mjs'
import {
	finalizeBillingReservation,
	preflightBillingReservation,
	releaseBillingReservation,
} from './billing/reservations.mjs'
import { runBillingUsageReconciler } from './billing/reconciler.mjs'
import {
	FREE_TIER_POLICY,
	activateKey,
	explainPlan,
	getAuthState,
	getBillingEntitlement,
	recordSuccessfulUse,
	requireEntitlement,
} from './auth/entitlements.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENGINE_STARTED_AT = new Date().toISOString()
const DIST_RUNTIME_SOURCE = path.resolve(__dirname, '..', 'dist', 'pptxgen.es.js')
function resolvePptxRuntimeEntry() {
	const source = DIST_RUNTIME_SOURCE
	if (process.env.BETTERPPTX_IMPORT_DIST_DIRECT === '1') return source
	const runtimeDir = path.resolve(process.env.BETTERPPTX_RUNTIME_DIR || path.join(process.cwd(), '.betterpptx-runtime'))
	try {
		const st = fsNode.statSync(source)
		fsNode.mkdirSync(runtimeDir, { recursive: true })
		const runtime = path.join(runtimeDir, `pptxgen.${process.pid}.${Math.round(st.mtimeMs)}.${st.size}.mjs`)
		if (!fsNode.existsSync(runtime)) fsNode.copyFileSync(source, runtime)
		for (const entry of fsNode.readdirSync(runtimeDir)) {
			if (entry.startsWith('pptxgen.') && entry.endsWith('.mjs') && entry !== path.basename(runtime)) {
				try { fsNode.rmSync(path.join(runtimeDir, entry), { force: true }) } catch (_) {}
			}
		}
		return runtime
	} catch (err) {
		process.stderr.write(`[betterpptx] runtime bundle shadow-copy failed; importing dist directly: ${err?.message || err}\n`)
		return source
	}
}
const PPTX_RUNTIME_FILE = resolvePptxRuntimeEntry()
const PPTX_ENTRY = pathToFileURL(PPTX_RUNTIME_FILE).href
const PptxGenJSPromise = import(PPTX_ENTRY).then(m => m.default || m.PptxGenJS || m)

const decks = new Map()
const TRANSPARENT_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
const generatedAssetHandles = new Map()
const TOOL_TIMEOUT_MS = Math.max(1000, Number(process.env.BETTERPPTX_TOOL_TIMEOUT_MS || 120000))
const SESSION_DECKS_PER_HOUR = Math.max(1, Number(process.env.BETTERPPTX_SESSION_DECKS_PER_HOUR || 20))
const sessionDeckWindows = new Map()
const sessionIdempotencyRecords = new Map()
const SESSION_IDEMPOTENCY_TTL_MS = Math.max(60 * 1000, Number(process.env.BETTERPPTX_SESSION_IDEMPOTENCY_TTL_MS || 60 * 60 * 1000))
const SESSION_IDEMPOTENCY_MAX_RECORDS = Math.max(10, Number(process.env.BETTERPPTX_SESSION_IDEMPOTENCY_MAX_RECORDS || 500))

function registerGeneratedAsset(filePath, kind = 'asset') {
	if (!isPublicBlackBoxMode()) return filePath
	const handle = `asset://generated/${kind}/${crypto.randomBytes(10).toString('base64url')}`
	generatedAssetHandles.set(handle, path.resolve(filePath))
	return handle
}

function resolveCatalogAssetRef(value) {
	const ref = String(value || '')
	if (!/^model3d:\/\//i.test(ref)) return value
	const asset = loadUnifiedAssetCatalog().find(item => item.handle === ref)
	if (!asset) throw new Error('Unknown catalog asset handle.')
	if (asset.kind !== 'model3d') throw new Error('Catalog handle is not a 3D model asset.')
	return asset.modelAsset || asset.path
}

function resolveGeneratedAssetRefs(value) {
	if (typeof value === 'string' && /^asset:\/\/generated\//i.test(value)) {
		const resolved = generatedAssetHandles.get(value)
		if (!resolved) throw new Error('Unknown or expired generated asset reference.')
		return resolved
	}
	if (typeof value === 'string' && /^model3d:\/\//i.test(value)) return resolveCatalogAssetRef(value)
	if (!value || typeof value !== 'object') return value
	if (Array.isArray(value)) return value.map(resolveGeneratedAssetRefs)
	const out = {}
	for (const [k, v] of Object.entries(value)) out[k] = resolveGeneratedAssetRefs(v)
	return out
}

function publicNarrationVoice(voice) {
	if (!voice || typeof voice !== 'object') return null
	return {
		status: 'selected',
		lang: voice.lang || voice.language || null,
	}
}

function publicNarrationWarnings(warnings) {
	if (!Array.isArray(warnings) || warnings.length === 0) return []
	return [`Narration completed with ${warnings.length} non-blocking notice${warnings.length === 1 ? '' : 's'}.`]
}

function publicNarrationManifest(manifest) {
	if (!manifest || typeof manifest !== 'object') return null
	return {
		schemaVersion: manifest.schemaVersion,
		slides: (manifest.slides || []).map(({ audioPath, provider, voiceId, license, ...slide }) => ({
			...slide,
			voice: voiceId ? { status: 'selected' } : undefined,
		})),
	}
}

function cleanMetadataValue(value, fallback) {
	const text = String(value || '').trim()
	return !text || /pptxgenjs|betterpptx/i.test(text) ? fallback : text
}

function ensureBetterPptxMetadata(pptx) {
	pptx.author = cleanMetadataValue(pptx.author, BETTERPPTX_BRAND)
	pptx.company = cleanMetadataValue(pptx.company, BETTERPPTX_BRAND)
	pptx.subject = cleanMetadataValue(pptx.subject, `${BETTERPPTX_BRAND} presentation`)
	pptx.title = cleanMetadataValue(pptx.title, `${BETTERPPTX_BRAND} presentation`)
}

// ---- Registry bounds (memory safety under load) -----------------------------
// Live decks hold the full pptxgenjs object graph (+ raw package parts for
// imported decks) in memory. Web clients rarely call deck.dispose, so without
// bounds the registry grows until the process OOMs. We cap the count (LRU evict)
// and release decks idle past a TTL — both tunable via env.
const MAX_DECKS = Number(process.env.BETTERPPTX_MAX_DECKS || 60)
const DECK_TTL_MS = Number(process.env.BETTERPPTX_DECK_TTL_MS || 30 * 60 * 1000)
let _decksEvicted = 0

function nowId() {
	return 'deck_' + crypto.randomBytes(6).toString('hex')
}

function evictDecksIfNeeded() {
	while (decks.size > MAX_DECKS) {
		let oldestId = null, oldestT = Infinity
		for (const [id, e] of decks) { const t = e.lastAccess || 0; if (t < oldestT) { oldestT = t; oldestId = id } }
		if (oldestId == null) break
		decks.delete(oldestId); _decksEvicted++
	}
}

// Register a freshly-built deck, returning its id. Enforces the LRU cap.
function registerDeck(entry) {
	const id = nowId()
	entry.lastAccess = Date.now()
	decks.set(id, entry)
	evictDecksIfNeeded()
	return id
}

function sweepIdleDecks() {
	const now = Date.now()
	for (const [id, e] of decks) { if (now - (e.lastAccess || 0) > DECK_TTL_MS) { decks.delete(id); _decksEvicted++ } }
}
const _deckSweepHandle = setInterval(sweepIdleDecks, 5 * 60 * 1000)
_deckSweepHandle.unref?.()

function getDeck(deckId) {
	const entry = decks.get(deckId)
	if (!entry) {
		const err = new Error(`Unknown deckId: ${deckId} (the deck handle may have expired or been released; recreate or reopen it).`)
		err.code = 'DECK_EXPIRED_OR_UNKNOWN'
		err.details = {
			status: 'deck_handle_unavailable',
			recommendation: 'Reopen the uploaded deck or recreate the deck, then continue from the latest valid state.',
		}
		throw err
	}
	entry.lastAccess = Date.now()
	return entry
}

function cloneForResult(value) {
	if (value === undefined || value === null) return value
	try { return structuredClone(value) } catch (_) { return JSON.parse(JSON.stringify(value)) }
}

function stableForHash(value) {
	if (value === undefined) return null
	if (value === null || typeof value !== 'object') return value
	if (Array.isArray(value)) return value.map(stableForHash)
	const out = {}
	for (const key of Object.keys(value).sort()) {
		if (key === 'idempotencyKey' || key === 'idempotency_key') continue
		out[key] = stableForHash(value[key])
	}
	return out
}

function idempotencyArgsHash(args) {
	return crypto.createHash('sha256').update(JSON.stringify(stableForHash(args || {}))).digest('hex')
}

function getIdempotencyKey(args = {}) {
	const key = String(args.idempotencyKey || args.idempotency_key || '').trim()
	if (!key) return ''
	if (!/^[A-Za-z0-9._:-]{1,160}$/.test(key)) {
		const err = new Error('Invalid idempotencyKey. Use 1-160 letters, digits, dot, underscore, colon, or dash characters.')
		err.code = 'INVALID_IDEMPOTENCY_KEY'
		throw err
	}
	return key
}

async function runDeckIdempotent(entry, toolName, args, operation) {
	const key = getIdempotencyKey(args)
	if (!key) return operation()
	const hash = idempotencyArgsHash(args)
	if (!entry.idempotencyRecords) entry.idempotencyRecords = new Map()
	const recordKey = `${toolName}:${key}`
	const existing = entry.idempotencyRecords.get(recordKey)
	if (existing) {
		if (existing.hash !== hash) {
			const err = new Error(`Idempotency key "${key}" was already used with different ${toolName} arguments.`)
			err.code = 'IDEMPOTENCY_CONFLICT'
			err.details = {
				status: 'conflict',
				artifactStatus: 'unchanged_or_unknown',
				tool: toolName,
			}
			throw err
		}
		if (existing.status === 'pending') {
			const result = await existing.promise
			return { ...cloneForResult(result), idempotentReplay: true }
		}
		return { ...cloneForResult(existing.result), idempotentReplay: true }
	}
	const record = { hash, status: 'pending', promise: null, result: null }
	record.promise = Promise.resolve()
		.then(operation)
		.then(result => {
			record.status = 'done'
			record.result = cloneForResult(result)
			return result
		}, err => {
			entry.idempotencyRecords.delete(recordKey)
			throw err
		})
	entry.idempotencyRecords.set(recordKey, record)
	return record.promise
}

async function replayDeckIdempotentIfPresent(entry, toolName, args) {
	const key = getIdempotencyKey(args)
	if (!key || !entry?.idempotencyRecords) return null
	const hash = idempotencyArgsHash(args)
	const recordKey = `${toolName}:${key}`
	const existing = entry.idempotencyRecords.get(recordKey)
	if (!existing) return null
	if (existing.hash !== hash) {
		const err = new Error(`Idempotency key "${key}" was already used with different ${toolName} arguments.`)
		err.code = 'IDEMPOTENCY_CONFLICT'
		err.details = {
			status: 'conflict',
			artifactStatus: 'unchanged_or_unknown',
			tool: toolName,
		}
		throw err
	}
	const result = existing.status === 'pending' ? await existing.promise : existing.result
	return { ...cloneForResult(result), idempotentReplay: true }
}

function sessionId(context = {}) {
	return String(context.sessionId || 'stdio-default')
}

function getSessionIdempotencyMap(context = {}) {
	const key = sessionId(context)
	const now = Date.now()
	let map = sessionIdempotencyRecords.get(key)
	if (!map) {
		map = new Map()
		sessionIdempotencyRecords.set(key, map)
	}
	for (const [recordKey, record] of map) {
		if (now - (record.createdAt || now) > SESSION_IDEMPOTENCY_TTL_MS) map.delete(recordKey)
	}
	while (map.size > SESSION_IDEMPOTENCY_MAX_RECORDS) {
		const first = map.keys().next().value
		if (first === undefined) break
		map.delete(first)
	}
	return map
}

async function runSessionIdempotent(context, toolName, args, operation) {
	const key = getIdempotencyKey(args)
	if (!key) return operation()
	const hash = idempotencyArgsHash(args)
	const records = getSessionIdempotencyMap(context)
	const recordKey = `${toolName}:${key}`
	const existing = records.get(recordKey)
	if (existing) {
		if (existing.hash !== hash) {
			const err = new Error(`Idempotency key "${key}" was already used with different ${toolName} arguments.`)
			err.code = 'IDEMPOTENCY_CONFLICT'
			err.details = {
				status: 'conflict',
				artifactStatus: 'unchanged_or_unknown',
				tool: toolName,
			}
			throw err
		}
		const result = existing.status === 'pending' ? await existing.promise : existing.result
		return { ...cloneForResult(result), idempotentReplay: true }
	}
	const record = { hash, status: 'pending', createdAt: Date.now(), promise: null, result: null }
	record.promise = Promise.resolve()
		.then(operation)
		.then(result => {
			record.status = 'done'
			record.result = cloneForResult(result)
			return result
		}, err => {
			records.delete(recordKey)
			throw err
		})
	records.set(recordKey, record)
	return record.promise
}

async function replaySessionIdempotentIfPresent(context, toolName, args) {
	const key = getIdempotencyKey(args)
	if (!key) return null
	const hash = idempotencyArgsHash(args)
	const records = getSessionIdempotencyMap(context)
	const recordKey = `${toolName}:${key}`
	const existing = records.get(recordKey)
	if (!existing) return null
	if (existing.hash !== hash) {
		const err = new Error(`Idempotency key "${key}" was already used with different ${toolName} arguments.`)
		err.code = 'IDEMPOTENCY_CONFLICT'
		err.details = {
			status: 'conflict',
			artifactStatus: 'unchanged_or_unknown',
			tool: toolName,
		}
		throw err
	}
	const result = existing.status === 'pending' ? await existing.promise : existing.result
	return { ...cloneForResult(result), idempotentReplay: true }
}

// Live engine stats for /health and capacity planning.
export function getEngineStats() {
	const mem = process.memoryUsage()
	return {
		decks: decks.size, maxDecks: MAX_DECKS, decksEvicted: _decksEvicted,
		rssMB: Math.round(mem.rss / 1048576), heapUsedMB: Math.round(mem.heapUsed / 1048576),
		concurrency: { active: _heavyActive, queued: _heavyQueue.length, max: MAX_CONCURRENCY },
		idempotency: {
			sessions: sessionIdempotencyRecords.size,
			sessionTtlMs: SESSION_IDEMPOTENCY_TTL_MS,
			sessionMaxRecords: SESSION_IDEMPOTENCY_MAX_RECORDS,
		},
		telemetry: getTelemetrySnapshot(),
	}
}

const MODEL_BYTES_PER_MIB = 1048576

function modelSizeTier(bytes) {
	const mib = Number(bytes || 0) / MODEL_BYTES_PER_MIB
	if (mib <= 1) return 'tiny'
	if (mib <= 5) return 'small'
	if (mib <= 10) return 'standard'
	if (mib <= 15) return 'balanced'
	if (mib <= 25) return 'large'
	return 'oversized'
}

function modelSizeSummary(bytes) {
	return {
		sizeMiB: Math.round((Number(bytes || 0) / MODEL_BYTES_PER_MIB) * 100) / 100,
		sizeTier: modelSizeTier(bytes),
	}
}

function statSummary(file) {
	try {
		const st = fsNode.statSync(file)
		const summary = {
			path: file,
			exists: true,
			bytes: st.size,
			mtimeMs: Math.round(st.mtimeMs),
			mtime: st.mtime.toISOString(),
		}
		if (/\.glb$/i.test(String(file || ''))) Object.assign(summary, modelSizeSummary(st.size))
		return summary
	} catch (err) {
		return { path: file, exists: false, error: String(err?.message || err) }
	}
}

function hashSecret(value) {
	const text = String(value || '')
	if (!text) return null
	return crypto.createHash('sha256').update(text).digest('hex').slice(0, 12)
}

function safeExecGit(args) {
	try {
		return {
			ok: true,
			value: execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8', timeout: 2000, windowsHide: true }).trim(),
		}
	} catch (err) {
		return {
			ok: false,
			error: String(err?.message || err),
			status: err?.status ?? null,
		}
	}
}

function serverMode() {
	const argvText = process.argv.join(' ')
	if (/http-cli\.mjs|server-http\.mjs/i.test(argvText)) return 'http'
	if (/run-betterpptx\.mjs|server\.mjs/i.test(argvText)) return 'stdio'
	if (process.env.BETTERPPTX_PORT || process.env.BETTERPPTX_PUBLIC_BASE || process.env.BETTERPPTX_URL_SECRET) return 'http'
	return 'unknown'
}

function selectedEnvironment() {
	const env = process.env
	return {
		BETTERPPTX_HOST: env.BETTERPPTX_HOST || null,
		BETTERPPTX_PORT: env.BETTERPPTX_PORT || null,
		BETTERPPTX_PUBLIC_BASE: env.BETTERPPTX_PUBLIC_BASE || null,
		BETTERPPTX_AUTH: env.BETTERPPTX_AUTH || null,
		BETTERPPTX_URL_SECRET_present: Boolean(env.BETTERPPTX_URL_SECRET),
		BETTERPPTX_URL_SECRET_sha256_12: hashSecret(env.BETTERPPTX_URL_SECRET),
		BETTERPPTX_DOWNLOAD_ROOT: env.BETTERPPTX_DOWNLOAD_ROOT || null,
		BETTERPPTX_RUNTIME_DIR: env.BETTERPPTX_RUNTIME_DIR || null,
		BETTERPPTX_IMPORT_DIST_DIRECT: env.BETTERPPTX_IMPORT_DIST_DIRECT || null,
		BETTERPPTX_TTS_PROVIDER: env.BETTERPPTX_TTS_PROVIDER || null,
		BETTERPPTX_TTS_URL: env.BETTERPPTX_TTS_URL || null,
		BETTERPPTX_TTS_TIMEOUT_MS: env.BETTERPPTX_TTS_TIMEOUT_MS || null,
		BETTERPPTX_NARRATION_MODE: env.BETTERPPTX_NARRATION_MODE || null,
		BETTERPPTX_VOICES_MANIFEST: env.BETTERPPTX_VOICES_MANIFEST || null,
		BETTERPPTX_MAX_DECKS: env.BETTERPPTX_MAX_DECKS || null,
		BETTERPPTX_DECK_TTL_MS: env.BETTERPPTX_DECK_TTL_MS || null,
		BETTERPPTX_MAX_CONCURRENCY: env.BETTERPPTX_MAX_CONCURRENCY || null,
		BETTERPPTX_MAX_QUEUE: env.BETTERPPTX_MAX_QUEUE || null,
	}
}

function gitStatus(includeGitStatus) {
	if (includeGitStatus === false) return { skipped: true }
	const head = safeExecGit(['rev-parse', '--short=12', 'HEAD'])
	const branch = safeExecGit(['branch', '--show-current'])
	const trackedRuntimeFiles = [
		'betterpptx/engine.mjs',
		'betterpptx/tools.mjs',
		'betterpptx/server.mjs',
		'src/core-interfaces.ts',
		'src/gen-utils.ts',
		'dist/pptxgen.es.js',
	]
	const diff = safeExecGit(['diff', '--quiet', '--', ...trackedRuntimeFiles])
	return {
		head: head.ok ? head.value : null,
		branch: branch.ok ? branch.value : null,
		trackedRuntimeFiles,
		trackedRuntimeDirty: diff.ok ? false : diff.status === 1 ? true : null,
		errors: [head, branch, diff].filter(x => !x.ok && x.status !== 1).map(x => x.error),
	}
}

async function handleStatus(args = {}) {
	if (isPublicBlackBoxMode()) {
		return {
			product: BETTERPPTX_BRAND,
			status: 'ok',
			version: process.env.BETTERPPTX_PUBLIC_VERSION || 'current',
			publicBuild: process.env.BETTERPPTX_PUBLIC_BUILD || process.env.BETTERPPTX_PUBLIC_VERSION || 'current',
			policy: {
				premiumPreviewSlides: FREE_TIER_POLICY.premiumPreviewSlides,
				gateStartsAfterSlide: FREE_TIER_POLICY.gateStartsAfterSlide,
			},
			tools: {
				statusTool: 'betterpptx.status',
				authStatusTool: 'betterpptx.auth.status',
				capabilitiesTool: 'betterpptx.help.capabilities',
			},
		}
	}
	const includeEnvironment = args.includeEnvironment !== false
	const mode = serverMode()
	return {
		product: 'betterpptx',
		server: 'betterpptx',
		mode,
		version: '1.0.0',
		pid: process.pid,
		ppid: process.ppid,
		startedAt: ENGINE_STARTED_AT,
		uptimeSeconds: Math.round(process.uptime()),
		cwd: process.cwd(),
		execPath: process.execPath,
		argv: process.argv,
		node: {
			version: process.version,
			platform: process.platform,
			arch: process.arch,
		},
		tools: {
			handlerCount: Object.keys(HANDLERS).length,
			aliases: ['betterpptx.version', 'betterpptx.status'],
		},
		runtime: {
			source: statSummary(DIST_RUNTIME_SOURCE),
			loaded: statSummary(PPTX_RUNTIME_FILE),
			importUrl: PPTX_ENTRY,
			shadowCopy: path.resolve(PPTX_RUNTIME_FILE) !== path.resolve(DIST_RUNTIME_SOURCE),
			shadowCopyFresh: (() => {
				const src = statSummary(DIST_RUNTIME_SOURCE)
				const loaded = statSummary(PPTX_RUNTIME_FILE)
				const expectedSuffix = src.exists ? `.${src.mtimeMs}.${src.bytes}.mjs` : ''
				return Boolean(src.exists && loaded.exists && src.bytes === loaded.bytes && (
					path.resolve(PPTX_RUNTIME_FILE) === path.resolve(DIST_RUNTIME_SOURCE) ||
					path.basename(PPTX_RUNTIME_FILE).endsWith(expectedSuffix)
				))
			})(),
		},
		files: {
			server: statSummary(path.join(__dirname, 'server.mjs')),
			httpCli: statSummary(path.join(__dirname, 'http-cli.mjs')),
			engine: statSummary(path.join(__dirname, 'engine.mjs')),
			tools: statSummary(path.join(__dirname, 'tools.mjs')),
		},
		engine: getEngineStats(),
		git: gitStatus(args.includeGitStatus !== false),
		environment: includeEnvironment ? selectedEnvironment() : { skipped: true },
	}
}

function getSlide(deckId, slideIndex) {
	const { pptx } = getDeck(deckId)
	if (typeof slideIndex !== 'number' || slideIndex < 0 || slideIndex >= pptx.slides.length) {
		throw new Error(`Bad slideIndex ${slideIndex} (deck has ${pptx.slides.length} slides).`)
	}
	return pptx.slides[slideIndex]
}

async function newPptx() {
	const PptxGenJS = await PptxGenJSPromise
	return new PptxGenJS()
}

let ChartPresetModulePromise = null
function loadChartPresetModule() {
	if (ChartPresetModulePromise) return ChartPresetModulePromise
	const candidates = [
		path.resolve(__dirname, '..', 'dist', 'node', 'pptx-mcp', 'chart-presets.js'),
		path.resolve(__dirname, '..', 'out', 'pptx-mcp', 'chart-presets.js'),
	]
	const found = candidates.find(file => fsNode.existsSync(file))
	if (!found) throw new Error('Chart preset catalog is not built. Run gulp ship before using betterpptx.chart.recommend.')
	ChartPresetModulePromise = import(pathToFileURL(found).href)
	return ChartPresetModulePromise
}

let TablePresetModulePromise = null
function loadTablePresetModule() {
	if (TablePresetModulePromise) return TablePresetModulePromise
	const candidates = [
		path.resolve(__dirname, '..', 'dist', 'node', 'pptx-mcp', 'table-presets.js'),
		path.resolve(__dirname, '..', 'out', 'pptx-mcp', 'table-presets.js'),
	]
	const found = candidates.find(file => fsNode.existsSync(file))
	if (!found) throw new Error('Table preset catalog is not built. Run gulp ship before using betterpptx.table.recommend.')
	TablePresetModulePromise = import(pathToFileURL(found).href)
	return TablePresetModulePromise
}

function chartFeatureBudget(args = {}) {
	return {
		visualQuality: args.visualQuality || 'premium',
		featureDepth: args.featureDepth || 'advanced',
		chartRichness: args.chartRichness || 'hybrid',
		requireFeatures: Array.isArray(args.requireFeatures) ? args.requireFeatures : [],
	}
}

function publicChartPreset(preset, full = false) {
	const base = {
		id: preset.id,
		title: preset.title,
		powerPointCategory: preset.powerPointCategory,
		powerPointPreset: preset.powerPointPreset,
		authoringMode: preset.authoringMode,
		chartType: preset.chartType,
		chartTypes: preset.chartTypes,
		shapeBuiltVisual: preset.shapeBuiltVisual,
		dataShape: preset.dataShape,
		requiredFields: preset.requiredFields,
		useWhen: preset.useWhen,
		avoidWhen: preset.avoidWhen,
		optionDefaults: preset.optionDefaults,
		fidelityNote: preset.fidelityNote,
	}
	return full ? { ...base, tags: preset.tags, sampleData: preset.sampleData } : base
}

function publicTablePreset(preset, full = false) {
	const base = {
		id: preset.id,
		title: preset.title,
		powerPointCategory: preset.powerPointCategory,
		powerPointPreset: preset.powerPointPreset,
		authoringMode: preset.authoringMode,
		tableIntent: preset.tableIntent,
		dataShape: preset.dataShape,
		requiredStructure: preset.requiredStructure,
		useWhen: preset.useWhen,
		avoidWhen: preset.avoidWhen,
		tableStyleOptions: preset.tableStyleOptions,
		optionDefaults: preset.optionDefaults,
		cellStyleRecipe: preset.cellStyleRecipe,
		layoutGuardrails: preset.layoutGuardrails,
		fidelityNote: preset.fidelityNote,
	}
	return full ? { ...base, tags: preset.tags, sampleRows: preset.sampleRows } : base
}

function publicCapabilityPlan(args = {}) {
	const intent = String(args.intent || '').trim()
	const detail = String(args.detail || 'summary').toLowerCase()
	const requestedType = String(args.deckType || 'auto').toLowerCase()
	const text = intent.toLowerCase()
	const deckType = requestedType !== 'auto'
		? requestedType
		: /(upload|uploaded|existing|original|edit|improve|revise|retest)/.test(text)
			? 'uploaded'
			: 'new'
	const animated = /(animat|motion|transition|morph|cinematic|show)/.test(text)
	const narrated = /(narrat|voice|tts|caption|autoplay|talk track)/.test(text)
	const history = /\b(history|timeline|evolution|era|chronolog)/.test(text)
	const base = deckType === 'uploaded'
		? [
			'betterpptx.auth.status',
			'betterpptx.deck.open_uploaded',
			'betterpptx.slide.list_shapes',
			'preserve existing layout and improve readability',
			'betterpptx.deck.validate',
			'betterpptx.deck.validate_design',
			'betterpptx.deck.save',
		]
		: [
			'betterpptx.auth.status',
			'betterpptx.deck.new',
			'betterpptx.slide.add per slide',
			'add text, shapes, images, charts, and tables as needed',
			'betterpptx.deck.validate',
			'betterpptx.deck.validate_design',
			'betterpptx.deck.save',
		]
	if (animated) {
		base.splice(Math.max(3, base.length - 3), 0, 'betterpptx.slide.animate_shapes for meaningful objects')
		base.splice(Math.max(4, base.length - 3), 0, 'betterpptx.slide.set_transition or betterpptx.deck.set_transitions_all')
	}
	if (narrated) {
		base.splice(Math.max(3, base.length - 3), 0, 'betterpptx.slide.add_narration or betterpptx.deck.add_narration')
		base.splice(Math.max(4, base.length - 3), 0, 'betterpptx.deck.validate_narration')
	}
	const guidance = [
		'Use slides 1 and 2 as the premium preview; slide 3+ premium features may return REQUIRES_UPGRADE in free mode.',
		'If REQUIRES_UPGRADE occurs, preserve valid work, offer betterpptx.auth.activate_key, or continue with the best free fallback.',
		'Validate before save and return the downloadUrl.',
	]
	if (deckType === 'uploaded') guidance.unshift('Use existing objects first; do not add feature-coverage decorations.')
	if (history) guidance.unshift('For history/timeline decks, organize slides by eras, breakthroughs, and consequences; keep one clear message per slide.')
	return {
		intent: intent || null,
		deckType,
		detail,
		recommendedFirstCalls: ['betterpptx.auth.status', 'betterpptx.help.capabilities'],
		recommendedWorkflow: base,
		guidance,
	}
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleCapabilities(args = {}) {
	if (isPublicBlackBoxMode()) {
		const plan = publicCapabilityPlan(args)
		const detail = String(args.detail || 'summary').toLowerCase()
		return {
			product: BETTERPPTX_BRAND,
			intent: plan.intent,
			recommendedFirstCalls: plan.recommendedFirstCalls,
			recommendedWorkflow: plan.recommendedWorkflow,
			guidance: plan.guidance,
			capabilities: [
				'freemium presentation creation and editing',
				'two-slide premium preview with gradients, depth, typography hierarchy, motion, narration, 3D, and visual proof',
				'contextual chart and table preset recommendation plus charts, tables, images, equations, diagrams, 3D model assets, and custom vector shapes',
				'animation, transitions, morph workflows, narration, captions, and autoplay',
				'presentation, narration, and design-quality validation',
			],
			auth: {
				statusTool: 'betterpptx.auth.status',
				activationTool: 'betterpptx.auth.activate_key',
				billingTools: ['betterpptx.billing.explain_plan', 'betterpptx.billing.portal'],
				freeTier: 'Free tier includes slides 1-2 as a premium preview with full design/motion/narration/3D features. The upgrade gate starts at slide 3.',
				premiumTransitionPattern: 'The preview should use slide 1 as the base state and slide 2 as an organized Morph-by-object transition.',
			},
			...(detail === 'full' ? {
				workflow: [
					'Create or open a deck.',
					'Add designed slides and visual assets.',
					'Add useful motion and narration when requested.',
					'Validate presentation, narration, and design quality.',
					'Save and use the returned download link.',
				],
			} : {}),
		}
	}
	// Inventory the assets directory the server ships with — purely descriptive.
	// The AI client doesn't NEED this (it can fs.find on its own) — this is a
	// fast hint so common workflows don't have to discover from scratch.
	const fsSync = await import('node:fs')
	function countFiles(dir, exts) {
		if (!fsSync.existsSync(dir)) return 0
		let n = 0
		function walk(d) {
			let entries; try { entries = fsSync.readdirSync(d, { withFileTypes: true }) } catch (_) { return }
			for (const e of entries) {
				if (e.isDirectory()) walk(path.join(d, e.name))
				else if (!exts || exts.some(x => e.name.toLowerCase().endsWith(x))) n++
			}
		}
		walk(dir); return n
	}
	const cwd = process.cwd()
	const localAssets = {
		maps_geojson: {
			note: 'Local GeoJSON boundary assets available to read and project into slide geometry.',
			dir: 'demos/betterpptx-online-assets/maps/natural-earth',
			files: (() => {
				try {
					const d = path.resolve(cwd, 'demos/betterpptx-online-assets/maps/natural-earth')
					if (!fsSync.existsSync(d)) return []
					return fsSync.readdirSync(d).filter(n => n.endsWith('.geojson'))
				} catch (_) { return [] }
			})(),
		},
		models_glb: [
			{ dir: 'demos/betterpptx-online-assets/models/khronos', count: countFiles(path.resolve(cwd, 'demos/betterpptx-online-assets/models/khronos'), ['.glb']) },
			{ dir: 'demos/betterpptx-online-assets/models/open-source-3d-quality', count: countFiles(path.resolve(cwd, 'demos/betterpptx-online-assets/models/open-source-3d-quality'), ['.glb']) },
			{ dir: 'demos/betterpptx-online-assets/models/open-source-3d', count: countFiles(path.resolve(cwd, 'demos/betterpptx-online-assets/models/open-source-3d'), ['.glb']) },
			{ dir: 'demos/betterpptx-premium-assets/models', count: countFiles(path.resolve(cwd, 'demos/betterpptx-premium-assets/models'), ['.glb']) },
		],
		icons_svg: { dir: 'demos/betterpptx-online-assets/icons/lucide', count: countFiles(path.resolve(cwd, 'demos/betterpptx-online-assets/icons/lucide'), ['.svg']) },
		shape_scenes: {
			note: 'Local custom-geometry specimens available as JSON. Each object can be inspected and adapted through the generic shape/freeform tools.',
			dir: 'demos/betterpptx-reference-assets/3d-gradient-style-agency/shape-scenes',
			count: countFiles(path.resolve(cwd, 'demos/betterpptx-reference-assets/3d-gradient-style-agency/shape-scenes'), ['.json']),
		},
	}
	return {
		brand: BETTERPPTX_BRAND,
		engine: 'self-contained PPTX generation, editing, inspection, and package serialization',
		selfContained: true,
		externalPptxLibrariesRequired: false,
		assetSources: {
			local: {
				note: 'Use fs.find / io.list_dir / io.read_file to discover and consume. These are paths inside the MCP server\'s workspace.',
				...localAssets,
			},
			uploaded: {
				note: 'For AI-client uploads (e.g. a file dropped into claude.ai chat): the client reads the bytes and forwards them to the MCP via io.write_file with encoding:"base64". From then on the file is a normal local path.',
			},
			online: {
				note: 'For images, public AI clients should choose a direct image URL and pass it to slide.add_image; the MCP fetches, validates, and embeds it. Maintainer-local clients can use http.fetch for explicit preflight or custom headers before passing the saved file to slide.add_image / slide.add_model3d / etc.',
				examples: [
					'https://example.com/path/to/image.jpg',
					'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Avocado/glTF-Binary/Avocado.glb',
					'https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/110m/cultural/ne_110m_admin_0_countries.json',
					'https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/<name>.svg',
				],
			},
		},
		layouts: ['LAYOUT_4x3', 'LAYOUT_16x9', 'LAYOUT_16x10', 'LAYOUT_WIDE'],
		shapes: 'all SHAPE_TYPE presets (rect, ellipse, roundRect, star5..16, hexagon, octagon, chevron, ribbon, cloud, sun, moon, heart, lightningBolt, smileyFace, cube, can, callouts, ...)',
		fills: ['solid', 'gradient (linear/circle/rect/shape with stops, angle, presets)', 'image background'],
		lineFeatures: ['width', 'dashType (dash, dashDot, lgDashDot, ...)', 'beginArrowType', 'endArrowType', 'gradient line'],
		shapeEffects: ['shadow (outer/inner)', 'reflection', 'softEdges', 'glow'],
		textFeatures: [
			'rich runs', 'paragraphs', 'bullets (custom/numbered)', 'hyperlinks',
			'glow', 'reflection',
			'WordArt transforms: textArchUp, textArchDown, textCircle, textButton, textWave1/2/4, textInflate, textDeflate, textChevron, textCascadeUp, textRingInside, textTriangle, textCanUp/Down, textStop, textCirclePour, textCurveUp/Down, textCascadeDown, etc.',
			'Text3D: bevel preset, extrusion+color, contour, material (metal/matte/plastic/...), lightRig (threePt/sunrise/glow/...), rotationX/Y/Z',
			'theme/scheme colors (tx1, accent1..6)', 'rtlMode',
		],
		animations: [
			'entrance/exit/emphasis/motion/media',
			'effects: appear, fly, fade, zoom, spin, swivel, wipe, split, peek, crawl, wheel, blast, bounce, glitter, lightSpeed, riseUp, fadedZoom, etc.',
			'sequence modes: asOneObject, allAtOnce, byParagraph (PowerPoint-native iterate engine optional)',
			'duration, delay, trigger, direction, scale, rotation, motionPath, mediaCommand, spid override, groupId, order',
		],
		transitions: 'All 145+ PowerPoint transitions with direction, speed, throughBlack, splitDirection, spokes, clockwise, p14dur, advanceOnClick, advanceAfterTime',
		charts: 'All native chart types (bar, bar3D, line, area, pie, doughnut, scatter, bubble, radar) with gradient series, dual axes, multi-type combo',
		tables: 'Per-cell text/options, gradient cell fills, autoPage, header repetition, Table Design flags, native tableStyleId, contextual premium presets',
		smartArt: 'Native PowerPoint SmartArt authoring for the 164-layout PowerPoint catalog with layout/style/color presets, editable SmartArt-style shape fallback helpers, and preservation of existing imported native SmartArt diagram packages.',
		media: 'audio, video (file), online (YouTube)',
		model3D: 'GLB + raster fallback, camera, transform, ambient/point lights, shadow',
		validation: 'built-in package validation (lenient/normal/strict + autoFix), narration package validation, and design-quality validation',
		passthrough: 'raw OOXML insert for advanced cases',
		optionRegistry: 'Use betterpptx.options.catalog for canonical option values, safe aliases, and concise correction hints.',
	}
}

function handleOptionsCatalog(args = {}) {
	return listOptionCatalog(args)
}

async function handleAuthStatus(_args = {}, context = {}) {
	const state = getAuthState(context)
	return {
		...state,
		billingDryRun: publicBillingDryRunSummary(getBillingTelemetrySummary()),
		billing: await publicBillingStatus(context),
	}
}

async function handleActivateKey(args = {}, context = {}) {
	const result = await activateKey(args, context)
	if (result?.ok === false) {
		const err = new Error(result.error?.message || 'Activation failed.')
		err.code = result.error?.code || 'INVALID_ACTIVATION_KEY'
		err.details = result.error?.details
		throw err
	}
	return result
}

function handleBillingExplainPlan() {
	const plan = explainPlan()
	return {
		...plan,
		dodo: publicPlanModel(),
		...publicBillingUrls({ hasBillingCustomer: false }),
	}
}

async function handleBillingPortal(args = {}, context = {}) {
	const state = getAuthState(context)
	const plan = explainPlan()
	const billing = await publicBillingStatus(context)
	const urls = publicBillingUrls({ feature: args.feature, hasBillingCustomer: billing.hasBillingCustomer })
	return {
		authenticated: state.authenticated,
		currentPlan: state.plan,
		provider: billing.provider,
		pricingUrl: urls.pricingUrl || plan.pricingUrl,
		upgradeUrl: urls.checkoutUrl || plan.upgradeUrl,
		checkoutUrl: urls.checkoutUrl,
		starterCheckoutUrl: urls.starterCheckoutUrl,
		topUpCheckoutUrl: urls.topUpCheckoutUrl,
		portalUrl: urls.portalUrl,
		portalAvailable: urls.portalAvailable,
		activationTool: 'betterpptx.auth.activate_key',
		balance: billing.balance,
		message: state.authenticated
			? (urls.portalAvailable ? 'Open the customer portal to manage the current BetterPPTX plan, or use top-up checkout to add credits.' : 'Use top-up checkout to add credits. Customer portal URL is not configured for this session yet.')
			: 'Open checkout or pricing, then paste the Polar or Dodo activation key in chat so the AI can call betterpptx.auth.activate_key.',
	}
}

function handleBillingEstimate(args = {}) {
	const toolName = args.toolName || args.tool || 'betterpptx.deck.save'
	const toolArgs = args.toolArgs || {}
	const deckId = toolArgs.deckId || args.deckId
	return publicBillingEstimate({
		toolName,
		args: { ...toolArgs, ...(deckId ? { deckId } : {}) },
		entry: deckId ? decks.get(deckId) : null,
	})
}

async function handleBillingUsageSummary(_args = {}, context = {}) {
	return publicUsageSummary(context)
}

async function handleDeckNew(args) {
	const pptx = await newPptx()
	if (args.layout) pptx.layout = args.layout
	pptx.title = cleanMetadataValue(args.title, `${BETTERPPTX_BRAND} presentation`)
	pptx.subject = cleanMetadataValue(args.subject, `${BETTERPPTX_BRAND} presentation`)
	pptx.author = cleanMetadataValue(args.author, BETTERPPTX_BRAND)
	pptx.company = cleanMetadataValue(args.company, BETTERPPTX_BRAND)
	if (typeof args.rtlMode === 'boolean') pptx.rtlMode = args.rtlMode
	if (args.theme) pptx.theme = args.theme
	if (args.enableIterateEngine === true) {
		const PptxGenJS = await PptxGenJSPromise
		if (typeof PptxGenJS.enableIterateEngine === 'function') PptxGenJS.enableIterateEngine()
	}
	const id = registerDeck({ pptx, createdAt: new Date().toISOString() })
	return {
		deckId: id,
		layout: pptx.layout,
		title: pptx.title,
		version: pptx.version,
	}
}

async function handleSetShowSettings(args) {
	const { pptx } = getDeck(args.deckId)
	const s = {}
	for (const k of ['useTimings', 'showAnimation', 'showNarration', 'loop', 'mode', 'restartMs', 'showMediaControls']) {
		if (args[k] !== undefined) s[k] = args[k]
	}
	pptx.showSettings = s
	return { ok: true, showSettings: pptx.showSettings }
}

function normalizeSlideMasterDefinition(master = {}) {
	const normalized = { ...master }
	if (Array.isArray(master.objects)) {
		normalized.objects = master.objects.map((item, index) => {
			if (typeof item !== 'string') return item
			const text = item.trim()
			if (!text) return item
			try { return JSON.parse(text) }
			catch (err) {
				throw new Error(`deck.define_master: master.objects[${index}] is a string but not valid JSON. Pass an object entry such as { "rect": { ... } }.`)
			}
		})
	}
	return normalized
}

async function handleDefineMaster(args) {
	const { pptx } = getDeck(args.deckId)
	const master = normalizeSlideMasterDefinition(args.master)
	pptx.defineSlideMaster(master)
	return { ok: true, masterTitle: master.title, objectCount: Array.isArray(master.objects) ? master.objects.length : 0 }
}

async function handleDefineLayout(args) {
	const { pptx } = getDeck(args.deckId)
	pptx.defineLayout({ name: args.name, width: args.width, height: args.height })
	if (args.activate !== false) pptx.layout = args.name
	return { ok: true, layout: pptx.layout, width: args.width, height: args.height }
}

function _xmlLocalName(node) {
	return String(node?.nodeName || '').split(':').pop()
}

function _xmlElementChildren(node) {
	const out = []
	for (let child = node?.firstChild; child; child = child.nextSibling) {
		if (child.nodeType === 1) out.push(child)
	}
	return out
}

function _xmlAttr(node, name) {
	if (!node || typeof node.getAttribute !== 'function') return null
	return node.getAttribute(name) ?? node.getAttribute(`p:${name}`) ?? node.getAttribute(`a:${name}`) ?? node.getAttribute(`r:${name}`)
}

function _xmlDescendants(node, localName = null) {
	const out = []
	function walk(current) {
		for (const child of _xmlElementChildren(current)) {
			if (!localName || _xmlLocalName(child) === localName) out.push(child)
			walk(child)
		}
	}
	walk(node)
	return out
}

function _xmlFirstDescendant(node, localName) {
	for (const child of _xmlElementChildren(node)) {
		if (_xmlLocalName(child) === localName) return child
		const found = _xmlFirstDescendant(child, localName)
		if (found) return found
	}
	return null
}

function _xmlDirectChild(node, localName) {
	return _xmlElementChildren(node).find(child => _xmlLocalName(child) === localName) || null
}

function _xmlTextContent(node) {
	return _xmlDescendants(node, 't')
		.map(t => String(t.textContent || '').trim())
		.filter(Boolean)
		.join(' ')
}

function _xmlShapeName(node) {
	const cNvPr = _xmlFirstDescendant(node, 'cNvPr')
	return _xmlAttr(cNvPr, 'name') || _xmlLocalName(node)
}

function _emuToInches(value) {
	const n = Number(value)
	return Number.isFinite(n) ? Number((n / 914400).toFixed(3)) : null
}

function _xmlShapeBBox(node) {
	const xfrm = _xmlFirstDescendant(node, 'xfrm')
	if (!xfrm) return null
	const off = _xmlDirectChild(xfrm, 'off') || _xmlFirstDescendant(xfrm, 'off')
	const ext = _xmlDirectChild(xfrm, 'ext') || _xmlFirstDescendant(xfrm, 'ext')
	if (!off || !ext) return null
	const x = _emuToInches(_xmlAttr(off, 'x'))
	const y = _emuToInches(_xmlAttr(off, 'y'))
	const w = _emuToInches(_xmlAttr(ext, 'cx'))
	const h = _emuToInches(_xmlAttr(ext, 'cy'))
	if ([x, y, w, h].some(v => v == null)) return null
	return { x, y, w, h, right: Number((x + w).toFixed(3)), bottom: Number((y + h).toFixed(3)) }
}

function _slideLayoutNumberFromPart(partPath) {
	const base = path.posix.basename(normalizeZipPartPath(partPath), '.xml')
	if (!base.startsWith('slideLayout')) return null
	const n = Number(base.substring('slideLayout'.length))
	return Number.isInteger(n) && n > 0 ? n : null
}

function _sanitizeLayoutToken(value) {
	return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function _layoutAuditKeyValues(layout) {
	const values = [
		layout?.name,
		layout?.type,
		layout?.number != null ? String(layout.number) : null,
		layout?.number != null ? `slideLayout${layout.number}` : null,
		layout?.type && layout?.name ? `${layout.type}:${layout.name}` : null,
	]
	return [...new Set(values.map(_sanitizeLayoutToken).filter(Boolean))]
}

function _shapeHasPlaceholder(node) {
	return !!_xmlFirstDescendant(node, 'ph')
}

function _topLevelLayoutShapes(layoutDoc) {
	const cSld = _xmlFirstDescendant(layoutDoc, 'cSld')
	const spTree = cSld ? _xmlFirstDescendant(cSld, 'spTree') : null
	if (!spTree) return []
	return _xmlElementChildren(spTree).filter(child => {
		const kind = _xmlLocalName(child)
		return ['sp', 'pic', 'graphicFrame', 'grpSp', 'cxnSp'].includes(kind)
	})
}

function _classifyLayoutObject({ name, text, bbox }, slideSize) {
	const hay = `${name || ''} ${text || ''}`.toLowerCase()
	const y = bbox?.y ?? 0
	const bottom = bbox?.bottom ?? 0
	const x = bbox?.x ?? 0
	const w = bbox?.w ?? 0
	const h = bbox?.h ?? 0
	const slideW = Number(slideSize?.widthInches || 13.333)
	const slideH = Number(slideSize?.heightInches || 7.5)
	if (hay.includes('logo') || (w > 0 && w <= slideW * 0.18 && h > 0 && h <= slideH * 0.18 && (y < slideH * 0.18 || bottom > slideH * 0.82))) return 'logo'
	if (hay.includes('footer') || hay.includes('slide number') || hay.includes('slidenumber') || bottom > slideH * 0.88) return 'footer'
	if (hay.includes('header') || hay.includes('date') || y < slideH * 0.12) return 'header'
	return 'fixed'
}

function _extractPlaceholders(layoutDoc) {
	const out = []
	for (const ph of _xmlDescendants(layoutDoc, 'ph')) {
		let shape = ph.parentNode
		while (shape && !['sp', 'pic', 'graphicFrame', 'grpSp', 'cxnSp'].includes(_xmlLocalName(shape))) shape = shape.parentNode
		const bbox = _xmlShapeBBox(shape)
		out.push({
			type: _xmlAttr(ph, 'type') || 'body',
			idx: _xmlAttr(ph, 'idx'),
			size: _xmlAttr(ph, 'sz'),
			orient: _xmlAttr(ph, 'orient'),
			name: _xmlShapeName(shape),
			bbox,
		})
	}
	return out
}

function _safeAreaFromLayout(layout, slideSize) {
	const slideW = Number(slideSize?.widthInches || 13.333)
	const slideH = Number(slideSize?.heightInches || 7.5)
	let left = 0.65
	let right = slideW - 0.65
	let top = 0.55
	let bottom = slideH - 0.55
	for (const obj of layout.fixedObjects || []) {
		const b = obj.bbox
		if (!b) continue
		if (obj.role === 'header') top = Math.max(top, b.bottom + 0.12)
		if (obj.role === 'footer') bottom = Math.min(bottom, b.y - 0.12)
		if (obj.role === 'logo' && b.y < slideH * 0.25) {
			if (b.x < slideW / 2) left = Math.max(left, b.right + 0.15)
			else right = Math.min(right, b.x - 0.15)
			top = Math.max(top, b.bottom + 0.08)
		}
	}
	const bodyBoxes = (layout.placeholders || [])
		.filter(ph => ['body', 'obj', 'pic', 'content', 'chart', 'tbl'].includes(String(ph.type || '').toLowerCase()) && ph.bbox)
		.map(ph => ph.bbox)
	if (bodyBoxes.length) {
		left = Math.min(...bodyBoxes.map(b => b.x))
		right = Math.max(...bodyBoxes.map(b => b.right))
		top = Math.min(...bodyBoxes.map(b => b.y))
		bottom = Math.max(...bodyBoxes.map(b => b.bottom))
	}
	return {
		x: Number(Math.max(0, left).toFixed(3)),
		y: Number(Math.max(0, top).toFixed(3)),
		w: Number(Math.max(0.5, right - left).toFixed(3)),
		h: Number(Math.max(0.5, bottom - top).toFixed(3)),
	}
}

function _recommendedUseForLayout(layout) {
	const type = String(layout.type || '').toLowerCase()
	const phTypes = new Set((layout.placeholders || []).map(ph => String(ph.type || '').toLowerCase()))
	const bodyCount = (layout.placeholders || []).filter(ph => ['body', 'obj', 'content', 'pic', 'chart', 'tbl'].includes(String(ph.type || '').toLowerCase())).length
	if (type.includes('title') || phTypes.has('ctrtitle') || phTypes.has('subTitle'.toLowerCase())) return 'opening/title slide'
	if (type.includes('section') || (phTypes.has('title') && bodyCount === 0)) return 'section divider'
	if (type.includes('two') || bodyCount >= 2) return 'two-column comparison/content'
	if (type.includes('picture') || phTypes.has('pic')) return 'image-led content'
	if (type.includes('blank') && !(layout.fixedObjects || []).length) return 'blank unrestricted slide'
	if (bodyCount === 0) return 'branded divider or statement'
	return 'standard governed content'
}

async function auditPptxLayoutsFromZip(zip) {
	const presXml = await zipText(zip, 'ppt/presentation.xml')
	const presDoc = presXml ? new DOMParser().parseFromString(presXml, 'application/xml') : null
	const slideSizeNode = presDoc ? _xmlFirstDescendant(presDoc, 'sldSz') : null
	const slideSize = slideSizeNode ? {
		widthInches: _emuToInches(_xmlAttr(slideSizeNode, 'cx')),
		heightInches: _emuToInches(_xmlAttr(slideSizeNode, 'cy')),
		type: _xmlAttr(slideSizeNode, 'type'),
	} : null

	const themeXml = await zipText(zip, 'ppt/theme/theme1.xml')
	const themeDoc = themeXml ? new DOMParser().parseFromString(themeXml, 'application/xml') : null
	const palette = {}
	const fonts = {}
	if (themeDoc) {
		for (const slot of ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6']) {
			const slotNode = _xmlDescendants(themeDoc, slot)[0]
			const srgb = slotNode ? _xmlFirstDescendant(slotNode, 'srgbClr') : null
			const sys = slotNode ? _xmlFirstDescendant(slotNode, 'sysClr') : null
			const color = _xmlAttr(srgb, 'val') || _xmlAttr(sys, 'lastClr')
			if (color) palette[slot] = String(color).toUpperCase()
		}
		const majorLatin = _xmlFirstDescendant(_xmlFirstDescendant(themeDoc, 'majorFont'), 'latin')
		const minorLatin = _xmlFirstDescendant(_xmlFirstDescendant(themeDoc, 'minorFont'), 'latin')
		fonts.headFontFace = _xmlAttr(majorLatin, 'typeface') || undefined
		fonts.bodyFontFace = _xmlAttr(minorLatin, 'typeface') || undefined
	}

	const masterRels = new Map()
	const masterParts = Object.keys(zip.files).filter(p => /^ppt\/slideMasters\/slideMaster\d+\.xml$/i.test(p)).sort()
	for (const masterPart of masterParts) {
		const rels = parseRelationshipEntries(await zipText(zip, relsPathForPart(masterPart)))
		const layoutParts = rels
			.filter(rel => rel.type.endsWith('/slideLayout'))
			.map(rel => resolvePackageTarget(masterPart, rel.target))
			.filter(Boolean)
		for (const layoutPart of layoutParts) masterRels.set(normalizeZipPartPath(layoutPart), normalizeZipPartPath(masterPart))
	}

	const masters = []
	for (const masterPart of masterParts) {
		const xml = await zipText(zip, masterPart)
		const doc = xml ? new DOMParser().parseFromString(xml, 'application/xml') : null
		const cSld = doc ? _xmlFirstDescendant(doc, 'cSld') : null
		masters.push({
			number: Number(path.posix.basename(masterPart, '.xml').substring('slideMaster'.length)),
			name: _xmlAttr(cSld, 'name') || path.posix.basename(masterPart, '.xml'),
			layoutCount: [...masterRels.values()].filter(v => v === normalizeZipPartPath(masterPart)).length,
		})
	}

	const layouts = []
	const layoutParts = Object.keys(zip.files).filter(p => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/i.test(p)).sort((a, b) => (_slideLayoutNumberFromPart(a) || 0) - (_slideLayoutNumberFromPart(b) || 0))
	for (const layoutPart of layoutParts) {
		const xml = await zipText(zip, layoutPart)
		const doc = xml ? new DOMParser().parseFromString(xml, 'application/xml') : null
		const root = doc ? _xmlFirstDescendant(doc, 'sldLayout') || doc.documentElement : null
		const cSld = doc ? _xmlFirstDescendant(doc, 'cSld') : null
		const fixedObjects = []
		for (const shape of _topLevelLayoutShapes(doc)) {
			if (_shapeHasPlaceholder(shape)) continue
			const bbox = _xmlShapeBBox(shape)
			const text = _xmlTextContent(shape)
			const name = _xmlShapeName(shape)
			const fixed = {
				kind: _xmlLocalName(shape),
				name,
				text: text ? text.slice(0, 120) : undefined,
				bbox,
			}
			fixed.role = _classifyLayoutObject(fixed, slideSize)
			fixedObjects.push(fixed)
		}
		const masterPart = masterRels.get(normalizeZipPartPath(layoutPart))
		const layout = {
			number: _slideLayoutNumberFromPart(layoutPart),
			name: _xmlAttr(cSld, 'name') || path.posix.basename(layoutPart, '.xml'),
			type: _xmlAttr(root, 'type') || 'custom',
			masterNumber: masterPart ? Number(path.posix.basename(masterPart, '.xml').substring('slideMaster'.length)) : null,
			placeholders: _extractPlaceholders(doc),
			fixedObjects,
		}
		layout.hasHeader = fixedObjects.some(o => o.role === 'header') || layout.placeholders.some(ph => String(ph.type || '').toLowerCase() === 'dt')
		layout.hasFooter = fixedObjects.some(o => o.role === 'footer') || layout.placeholders.some(ph => ['ftr', 'sldnum'].includes(String(ph.type || '').toLowerCase()))
		layout.hasLogo = fixedObjects.some(o => o.role === 'logo')
		layout.safeArea = _safeAreaFromLayout(layout, slideSize)
		layout.recommendedUse = _recommendedUseForLayout(layout)
		layout.allowedForNewSlides = true
		layouts.push(layout)
	}

	const layoutByPart = new Map(layoutParts.map(part => [normalizeZipPartPath(part), _slideLayoutNumberFromPart(part)]))
	const slideBindings = []
	const slideParts = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/i.test(p)).sort((a, b) => {
		const an = Number(path.posix.basename(a, '.xml').substring('slide'.length))
		const bn = Number(path.posix.basename(b, '.xml').substring('slide'.length))
		return an - bn
	})
	for (const slidePart of slideParts) {
		const slideNo = Number(path.posix.basename(slidePart, '.xml').substring('slide'.length))
		const rels = parseRelationshipEntries(await zipText(zip, relsPathForPart(slidePart)))
		const rel = rels.find(r => r.type.endsWith('/slideLayout'))
		const targetPart = rel ? resolvePackageTarget(slidePart, rel.target) : null
		const layoutNumber = targetPart ? layoutByPart.get(normalizeZipPartPath(targetPart)) : null
		const layout = layouts.find(l => l.number === layoutNumber)
		slideBindings.push({ slideNumber: slideNo, layoutNumber, layoutName: layout?.name, layoutType: layout?.type })
	}

	return {
		slideSize,
		theme: { fonts, palette },
		masters,
		layouts,
		slideBindings,
		policySuggestion: {
			enforcement: 'strict',
			defaultLayout: layouts.find(l => ['titleAndContent', 'titleOnly'].includes(l.type))?.name || layouts[0]?.name || null,
			allowedLayouts: layouts.map(l => l.name),
		},
	}
}

function normalizeLayoutPolicy(args, audit) {
	const allowedInput = Array.isArray(args.allowedLayouts) ? args.allowedLayouts : []
	const allowed = allowedInput.length ? allowedInput : (args.enforceLayoutPolicy ? (audit?.policySuggestion?.allowedLayouts || []) : [])
	const defaultLayout = args.defaultLayout || audit?.policySuggestion?.defaultLayout || null
	if (!allowed.length && !defaultLayout && !args.enforceLayoutPolicy && !args.strictLayout) return null
	const keys = new Set()
	for (const value of allowed) keys.add(_sanitizeLayoutToken(value))
	return {
		strict: args.strictLayout !== false && (args.enforceLayoutPolicy === true || allowed.length > 0),
		allowedLayouts: [...allowed],
		allowedKeys: [...keys],
		defaultLayout,
	}
}

function _findAuditedLayout(entry, value) {
	if (!entry?.layoutAudit || value == null) return null
	const key = _sanitizeLayoutToken(value)
	for (const layout of entry.layoutAudit.layouts || []) {
		if (_layoutAuditKeyValues(layout).includes(key)) return layout
	}
	return null
}

function _nativeLayoutNames(pptx) {
	return (pptx.slideLayouts || []).map(layout => layout?._name).filter(Boolean)
}

function _resolveSlideLayoutRequest(entry, args) {
	const requested = args.layoutName ?? args.slideLayout ?? args.layout ?? args.masterName
	const policy = entry.layoutPolicy
	const effective = requested ?? policy?.defaultLayout ?? null
	if (!effective) return { requested, effective: null, kind: 'native-default' }

	const audited = _findAuditedLayout(entry, effective)
	const nativeNames = _nativeLayoutNames(entry.pptx)
	const native = nativeNames.find(name => _sanitizeLayoutToken(name) === _sanitizeLayoutToken(effective))
	const allowed = !policy?.strict || policy.allowedKeys.length === 0 || (audited && _layoutAuditKeyValues(audited).some(key => policy.allowedKeys.includes(key))) || policy.allowedKeys.includes(_sanitizeLayoutToken(effective))
	if (!allowed) {
		throw new Error(`slide.add: layout "${effective}" is not allowed by the deck layout policy. Allowed layouts: ${(policy.allowedLayouts || []).join(', ') || '(none)'}`)
	}
	if (audited?.number) return { requested, effective, kind: 'raw-template', layout: audited }
	if (native) return { requested, effective: native, kind: 'native-master', masterName: native }
	if (policy?.strict) {
		throw new Error(`slide.add: layout "${effective}" is not present in the loaded template/native masters.`)
	}
	return { requested, effective, kind: 'native-master', masterName: args.masterName }
}

// =============================================================================
//  THEME FROM IMAGE — sample dominant colours from a PNG/JPG and return a 10-slot palette
// =============================================================================

function hexFromRgb(r, g, b) {
	return [(r), (g), (b)].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0').toUpperCase()).join('')
}

function rgbToHsl(r, g, b) {
	r /= 255; g /= 255; b /= 255
	const max = Math.max(r, g, b), min = Math.min(r, g, b)
	let h = 0, s = 0
	const l = (max + min) / 2
	if (max !== min) {
		const d = max - min
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
		switch (max) {
			case r: h = (g - b) / d + (g < b ? 6 : 0); break
			case g: h = (b - r) / d + 2; break
			default: h = (r - g) / d + 4
		}
		h *= 60
	}
	return [h, s, l]
}

function hslToHex(h, s, l) {
	s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l))
	if (s === 0) {
		const v = Math.round(l * 255)
		return hexFromRgb(v, v, v)
	}
	const hue2rgb = (p, q, t) => {
		if (t < 0) t += 1
		if (t > 1) t -= 1
		if (t < 1 / 6) return p + (q - p) * 6 * t
		if (t < 1 / 2) return q
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
		return p
	}
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s
	const p = 2 * l - q
	h = ((h % 360) + 360) % 360 / 360
	const r = hue2rgb(p, q, h + 1 / 3)
	const g = hue2rgb(p, q, h)
	const b = hue2rgb(p, q, h - 1 / 3)
	return hexFromRgb(r * 255, g * 255, b * 255)
}

// Tiny PNG/JPG decoder using image-size for dimensions, then pure-JS PNG decoder
// for the actual pixels. We only need ~64×64 thumbnail-quality sampling.
async function loadImagePixelsThumb(imagePath, targetDim = 64) {
	const fsSync = await import('node:fs')
	const buf = fsSync.readFileSync(imagePath)
	// PNG path: use built-in zlib + read IHDR + IDAT decompress + filter
	if (buf[0] === 0x89 && buf[1] === 0x50) {
		return decodePngThumb(buf, targetDim)
	}
	// JPEG: use platform jimp-style decoder if available; otherwise basic histogram from raw bytes
	if (buf[0] === 0xFF && buf[1] === 0xD8) {
		// Fall back to raw byte histogram for JPEGs (works surprisingly well for palette dominance)
		return rawByteSampleAsRgbHistogram(buf)
	}
	throw new Error(`Unsupported image format for ${imagePath} (first bytes ${buf.slice(0, 4).toString('hex')})`)
}

async function decodePngThumb(buf, targetDim) {
	const zlib = await import('node:zlib')
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
	let offset = 8  // skip PNG signature
	let width = 0, height = 0, bitDepth = 0, colorType = 0
	const idatChunks = []
	while (offset < buf.length) {
		const len = view.getUint32(offset); offset += 4
		const type = buf.slice(offset, offset + 4).toString('ascii'); offset += 4
		const data = buf.slice(offset, offset + len); offset += len
		offset += 4  // CRC
		if (type === 'IHDR') {
			width = data.readUInt32BE(0)
			height = data.readUInt32BE(4)
			bitDepth = data[8]; colorType = data[9]
		} else if (type === 'IDAT') {
			idatChunks.push(data)
		} else if (type === 'IEND') break
	}
	const idat = Buffer.concat(idatChunks)
	const raw = zlib.inflateSync(idat)
	const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1
	if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
		// Indexed or grayscale: fall back to histogram
		return rawByteSampleAsRgbHistogram(buf)
	}
	const stride = width * channels + 1
	// Apply PNG filters (sub/up/avg/paeth) — minimal subset
	const out = Buffer.alloc(width * height * channels)
	for (let y = 0; y < height; y++) {
		const filter = raw[y * stride]
		for (let x = 0; x < width * channels; x++) {
			const srcIdx = y * stride + 1 + x
			const left = x >= channels ? out[y * width * channels + x - channels] : 0
			const up = y > 0 ? out[(y - 1) * width * channels + x] : 0
			const upLeft = (x >= channels && y > 0) ? out[(y - 1) * width * channels + x - channels] : 0
			let v
			switch (filter) {
				case 0: v = raw[srcIdx]; break
				case 1: v = (raw[srcIdx] + left) & 0xFF; break
				case 2: v = (raw[srcIdx] + up) & 0xFF; break
				case 3: v = (raw[srcIdx] + ((left + up) >> 1)) & 0xFF; break
				case 4: {
					const p = left + up - upLeft
					const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft)
					const pred = (pa <= pb && pa <= pc) ? left : (pb <= pc) ? up : upLeft
					v = (raw[srcIdx] + pred) & 0xFF
					break
				}
				default: v = raw[srcIdx]
			}
			out[y * width * channels + x] = v
		}
	}
	// Sample down to targetDim × targetDim grid; collect ONLY pixels with alpha >= 200 (skip transparent)
	const pixels = []
	const sx = Math.max(1, Math.floor(width / targetDim))
	const sy = Math.max(1, Math.floor(height / targetDim))
	for (let y = 0; y < height; y += sy) {
		for (let x = 0; x < width; x += sx) {
			const i = (y * width + x) * channels
			const a = channels === 4 ? out[i + 3] : 255
			if (a < 200) continue
			pixels.push([out[i], out[i + 1], out[i + 2]])
		}
	}
	return { width, height, pixels }
}

function rawByteSampleAsRgbHistogram(buf) {
	// Crude fallback: read bytes in triplets, skipping likely-header regions
	const pixels = []
	for (let i = 1024; i < buf.length - 3; i += 64) {
		pixels.push([buf[i], buf[i + 1], buf[i + 2]])
	}
	return { width: 0, height: 0, pixels }
}

// k-means-ish color quantisation
function quantizeColors(pixels, k = 8) {
	if (pixels.length === 0) return []
	// Initialise centroids with random samples
	const centroids = []
	const step = Math.max(1, Math.floor(pixels.length / k))
	for (let i = 0; i < k; i++) centroids.push([...pixels[Math.min(i * step, pixels.length - 1)]])
	for (let iter = 0; iter < 8; iter++) {
		const buckets = Array.from({ length: k }, () => [])
		for (const p of pixels) {
			let bi = 0, bd = Infinity
			for (let i = 0; i < k; i++) {
				const c = centroids[i]
				const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2
				if (d < bd) { bd = d; bi = i }
			}
			buckets[bi].push(p)
		}
		for (let i = 0; i < k; i++) {
			const b = buckets[i]
			if (b.length === 0) continue
			centroids[i] = [
				b.reduce((s, p) => s + p[0], 0) / b.length,
				b.reduce((s, p) => s + p[1], 0) / b.length,
				b.reduce((s, p) => s + p[2], 0) / b.length,
			]
		}
	}
	// Count members of final clusters
	const buckets = Array.from({ length: k }, () => 0)
	for (const p of pixels) {
		let bi = 0, bd = Infinity
		for (let i = 0; i < k; i++) {
			const c = centroids[i]
			const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2
			if (d < bd) { bd = d; bi = i }
		}
		buckets[bi]++
	}
	const result = centroids.map((c, i) => ({ r: c[0], g: c[1], b: c[2], count: buckets[i] }))
	result.sort((a, b) => b.count - a.count)
	return result
}

// Generic image colour-quantisation. Returns the dominant clusters; the CALLER
// decides how to map them to slots in their own colour model. No prescribed
// "primary/accent/paper/muted" naming — that would be theme-domain knowledge.
async function handleSamplePalette(args) {
	const imagePath = path.isAbsolute(args.imagePath) ? args.imagePath : path.resolve(process.cwd(), args.imagePath)
	const { pixels: allPixels } = await loadImagePixelsThumb(imagePath, args.sampleDim || 96)
	let samplePixels = allPixels
	if (args.filterBackground !== false) {
		const branded = allPixels.filter(p => {
			const max = Math.max(p[0], p[1], p[2]), min = Math.min(p[0], p[1], p[2])
			const sat = max === 0 ? 0 : (max - min) / max
			const light = (max + min) / 510
			return sat > 0.15 && light > 0.12 && light < 0.92
		})
		if (branded.length > 50) samplePixels = branded
	}
	const k = args.k || 8
	const branded = quantizeColors(samplePixels, k)
	const all = quantizeColors(allPixels, k)
	function describe(c) {
		const [h, s, l] = rgbToHsl(c.r, c.g, c.b)
		return { hex: hexFromRgb(c.r, c.g, c.b), count: c.count, hue: Number(h.toFixed(1)), saturation: Number(s.toFixed(3)), lightness: Number(l.toFixed(3)) }
	}
	const totalAll = allPixels.length || 1
	const totalBranded = samplePixels.length || 1
	return {
		imagePath,
		samplePixelCount: allPixels.length,
		brandedPixelCount: samplePixels.length,
		// Branded clusters = sample-filtered; sorted by saturation*frequency
		brandedClusters: branded
			.filter(c => c.count > 0)
			.map(describe)
			.map(c => ({ ...c, share: Number((c.count / totalBranded).toFixed(3)) }))
			.sort((a, b) => (b.saturation * b.share) - (a.saturation * a.share)),
		// All clusters = whole image; sorted by frequency
		allClusters: all
			.filter(c => c.count > 0)
			.map(describe)
			.map(c => ({ ...c, share: Number((c.count / totalAll).toFixed(3)) }))
			.sort((a, b) => b.share - a.share),
	}
}

async function handleLoadTemplate(args) {
	const entry = getDeck(args.deckId)
	const { pptx } = entry
	const tplPath = path.isAbsolute(args.templatePath) ? args.templatePath : path.resolve(process.cwd(), args.templatePath)
	const buf = await fs.readFile(tplPath)
	const zip = await JSZip.loadAsync(buf)
	const audit = await auditPptxLayoutsFromZip(zip)
	const fonts = audit.theme?.fonts || {}
	const palette = audit.theme?.palette || {}
	if (args.applyFonts !== false && (fonts.headFontFace || fonts.bodyFontFace)) {
		pptx.theme = {
			headFontFace: fonts.headFontFace || 'Calibri Light',
			bodyFontFace: fonts.bodyFontFace || 'Calibri',
		}
	}

	const layout = audit.slideSize || null
	if (layout?.widthInches && layout?.heightInches) {
		const layoutName = args.layoutName || `template_${Math.round(layout.widthInches * 100)}x${Math.round(layout.heightInches * 100)}`
		pptx.defineLayout({ name: layoutName, width: layout.widthInches, height: layout.heightInches })
		pptx.layout = layoutName
	}

	let visualScaffolding = null
	if (args.preserveLayouts !== false) {
		const packageImportState = await createPackageImportState(tplPath, pptx)
		visualScaffolding = await importSourceVisualScaffolding(packageImportState)
	}
	entry.layoutAudit = audit
	entry.layoutPolicy = normalizeLayoutPolicy(args, audit)
	return {
		ok: true,
		templatePath: tplPath,
		bytes: buf.length,
		fonts,
		palette,
		layout,
		layoutAudit: audit,
		layoutPolicy: entry.layoutPolicy ? {
			strict: entry.layoutPolicy.strict,
			allowedLayouts: entry.layoutPolicy.allowedLayouts,
			defaultLayout: entry.layoutPolicy.defaultLayout,
		} : null,
		visualScaffolding,
	}
}

async function handleAuditLayouts(args) {
	let audit = null
	let entry = null
	if (args.deckId) {
		entry = getDeck(args.deckId)
		audit = entry.layoutAudit || null
	}
	if (args.templatePath) {
		const tplPath = path.isAbsolute(args.templatePath) ? args.templatePath : path.resolve(process.cwd(), args.templatePath)
		const zip = await JSZip.loadAsync(await fs.readFile(tplPath))
		audit = await auditPptxLayoutsFromZip(zip)
	}
	if (!audit && entry) {
		const { pptx } = entry
		audit = {
			slideSize: pptx.presLayout ? { widthInches: pptx.presLayout.width, heightInches: pptx.presLayout.height } : null,
			theme: { fonts: pptx.theme || {}, palette: {} },
			masters: [{ number: 1, name: pptx.masterSlide?._name || 'master', layoutCount: (pptx.slideLayouts || []).length }],
			layouts: (pptx.slideLayouts || []).map((layout, index) => ({
				number: index + 1,
				name: layout?._name || `layout ${index + 1}`,
				type: 'native',
				masterNumber: 1,
				placeholders: [],
				fixedObjects: [],
				hasHeader: false,
				hasFooter: false,
				hasLogo: false,
				safeArea: null,
				recommendedUse: 'native defined layout',
				allowedForNewSlides: true,
			})),
			slideBindings: (pptx.slides || []).map((slide, index) => ({ index, layoutName: slide._slideLayout?._name, rawLayoutNumber: slide._rawSlideLayoutNumber || null })),
			policySuggestion: {
				enforcement: 'strict',
				defaultLayout: (pptx.slideLayouts || [])[0]?._name || null,
				allowedLayouts: (pptx.slideLayouts || []).map(layout => layout?._name).filter(Boolean),
			},
		}
	}
	if (!audit) throw new Error('deck.audit_layouts: pass deckId for a loaded deck or templatePath for a .pptx template.')
	if (entry && args.setPolicy) {
		entry.layoutAudit = audit
		entry.layoutPolicy = normalizeLayoutPolicy({
			...args,
			enforceLayoutPolicy: args.enforceLayoutPolicy !== false,
		}, audit)
	}
	return {
		ok: true,
		audit,
		layoutPolicy: entry?.layoutPolicy ? {
			strict: entry.layoutPolicy.strict,
			allowedLayouts: entry.layoutPolicy.allowedLayouts,
			defaultLayout: entry.layoutPolicy.defaultLayout,
		} : null,
	}
}

// =============================================================================
//  GENERIC GEOMETRY PRIMITIVES
//  No domain knowledge — caller passes polygon rings as arrays of numeric pairs.
//  Optional projection (equirectangular) is provided so geo data (lon,lat) can
//  be projected without the AI having to write the math itself.
// =============================================================================

// Reduce a ring to <= maxPoints by uniform decimation. Pure geometry — no semantics.
function decimateRing(ring, maxPoints) {
	if (ring.length <= maxPoints) return ring
	const step = ring.length / maxPoints
	const out = []
	for (let i = 0; i < maxPoints; i++) out.push(ring[Math.floor(i * step)])
	return out
}

async function handlePolygonToCustGeom(args) {
	// Multi-polygon mode: caller passes `polygons: [ [ring1, ring2, ...], [ring1], ... ]`
	// Each top-level entry becomes its OWN custGeom shape with its own bbox.
	// This is the right shape for MultiPolygon geo features (Indonesia, UK, Greece)
	// where each landmass needs to be a separate shape, not one bbox spanning ocean.
	if (Array.isArray(args.polygons)) {
		const shapes = []
		for (let i = 0; i < args.polygons.length; i++) {
			const polyRings = args.polygons[i]
			if (!Array.isArray(polyRings) || polyRings.length === 0) continue
			const subArgs = { ...args, rings: polyRings, polygons: undefined }
			const r = await handlePolygonToCustGeom(subArgs)
			shapes.push({
				shapeBBox: r.shapeBBox,
				points: r.points,
				pointCount: r.pointCount,
				sourceBBox: r.sourceBBox,
				mode: r.mode,
				smoothing: r.smoothing,
			})
		}
		return { mode: 'multiPolygon', shapeCount: shapes.length, shapes }
	}
	const inputRings = args.rings
	if (!Array.isArray(inputRings) || inputRings.length === 0) {
		throw new Error('polygon_to_custgeom: `rings` (or `polygons`) must be a non-empty array.')
	}
	const projection = args.projection || 'none'
	const maxPointsPerRing = args.maxPointsPerRing || 80
	const fit = args.fit || 'preserve-aspect'
	const flipY = args.flipY !== false
	const projectInto = args.projectInto || null  // generic shared-coordinate-system mode

	// Compute source bbox across all rings (in input coordinate space)
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
	for (const ring of inputRings) for (const [x, y] of ring) {
		if (x < minX) minX = x
		if (y < minY) minY = y
		if (x > maxX) maxX = x
		if (y > maxY) maxY = y
	}
	const gw = maxX - minX, gh = maxY - minY
	if (gw <= 0 || gh <= 0) {
		return { points: [], pointCount: 0, sourceBBox: { minX, maxX, minY, maxY } }
	}

	// Catmull-Rom → cubic Bezier conversion. Given a ring of points, this emits
	// a sequence of pptxgenjs custGeom commands where each segment is a smooth
	// cubic Bezier curve through the source points. Tension is fixed at 1/6 (the
	// standard "uniform Catmull-Rom" that the reference deck uses).
	function ringToBezierCommands(projectedRing, shapeBBoxX, shapeBBoxY, closeRing) {
		// projectedRing is already in absolute slide coords; subtract bbox origin
		const n = projectedRing.length
		if (n < 2) return []
		const localized = projectedRing.map(([x, y]) => [x - shapeBBoxX, y - shapeBBoxY])
		const cmds = []
		cmds.push({ x: localized[0][0], y: localized[0][1], moveTo: true })
		const lastIdx = closeRing ? n : n - 1
		const wrap = i => closeRing ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))
		for (let i = 0; i < lastIdx; i++) {
			const p0 = localized[wrap(i - 1)]
			const p1 = localized[wrap(i)]
			const p2 = localized[wrap(i + 1)]
			const p3 = localized[wrap(i + 2)]
			const c1x = p1[0] + (p2[0] - p0[0]) / 6
			const c1y = p1[1] + (p2[1] - p0[1]) / 6
			const c2x = p2[0] - (p3[0] - p1[0]) / 6
			const c2y = p2[1] - (p3[1] - p1[1]) / 6
			cmds.push({ x: p2[0], y: p2[1], curve: { type: 'cubic', x1: c1x, y1: c1y, x2: c2x, y2: c2y } })
		}
		if (closeRing) cmds.push({ close: true })
		return cmds
	}

	// =====================================================================
	//  Mode A — projectInto: shared-coordinate-system projection.
	//  The caller provides a single source domain (e.g. -180..180 lon, -90..90 lat)
	//  and a single target box on the slide (e.g. world map area in inches).
	//  Every polygon projected with the same projectInto lands in the SAME
	//  slide coordinate system, so adjacent shapes align with no gaps.
	//  Returns shapeBBox = the polygon's actual extent within targetBox, plus
	//  points in coords LOCAL to that shapeBBox (ready for slide.add_freeform).
	// =====================================================================
	if (projectInto) {
		const sb = projectInto.sourceBounds
		const tb = projectInto.targetBox
		if (!sb || !tb) throw new Error('projectInto requires { sourceBounds, targetBox }')
		const { minX: sMinX, maxX: sMaxX, minY: sMinY, maxY: sMaxY } = sb
		const { x: tX, y: tY, w: tW, h: tH } = tb
		if (!Number.isFinite(sMinX) || !Number.isFinite(sMaxX) || !Number.isFinite(sMinY) || !Number.isFinite(sMaxY)
			|| !Number.isFinite(tX) || !Number.isFinite(tY) || !Number.isFinite(tW) || !Number.isFinite(tH))
			throw new Error('projectInto: sourceBounds {minX,maxX,minY,maxY} and targetBox {x,y,w,h} must be finite numbers')
		const projectAbs = ([x, y]) => [
			tX + ((x - sMinX) / (sMaxX - sMinX)) * tW,
			tY + (flipY ? ((sMaxY - y) / (sMaxY - sMinY)) : ((y - sMinY) / (sMaxY - sMinY))) * tH,
		]
		// Decimate + project all rings
		const projectedRings = []
		let absMinX = Infinity, absMinY = Infinity, absMaxX = -Infinity, absMaxY = -Infinity
		for (const ring of inputRings) {
			if (!Array.isArray(ring) || ring.length < 2) continue
			const decimated = decimateRing(ring, maxPointsPerRing)
			const projected = decimated.map(projectAbs)
			for (const [px, py] of projected) {
				if (px < absMinX) absMinX = px
				if (py < absMinY) absMinY = py
				if (px > absMaxX) absMaxX = px
				if (py > absMaxY) absMaxY = py
			}
			projectedRings.push(projected)
		}
		const shapeBBox = { x: absMinX, y: absMinY, w: absMaxX - absMinX, h: absMaxY - absMinY }
		const smoothing = args.smoothing || 'none'
		const points = []
		for (const ring of projectedRings) {
			if (smoothing === 'catmull-rom' && ring.length >= 3) {
				const beziers = ringToBezierCommands(ring, shapeBBox.x, shapeBBox.y, true)
				for (const c of beziers) points.push(c)
			} else {
				for (let i = 0; i < ring.length; i++) {
					const [px, py] = ring[i]
					const localX = px - shapeBBox.x
					const localY = py - shapeBBox.y
					if (i === 0) points.push({ x: localX, y: localY, moveTo: true })
					else points.push({ x: localX, y: localY })
				}
				points.push({ close: true })
			}
		}
		return {
			mode: 'projectInto',
			smoothing,
			points,
			pointCount: points.length,
			shapeBBox,
			sourceBBox: { minX, maxX, minY, maxY },
			sourceBounds: sb,
			targetBox: tb,
			projection,
		}
	}

	// =====================================================================
	//  Mode B — legacy w/h fit into a [0..w, 0..h] local box.
	//  Used when the caller doesn't need to place multiple shapes in a
	//  shared coordinate system.
	// =====================================================================
	const w = args.w, h = args.h
	if (typeof w !== 'number' || typeof h !== 'number' || w <= 0 || h <= 0) {
		throw new Error('polygon_to_custgeom: `w` and `h` must be positive numbers (or pass `projectInto`).')
	}
	let sx, sy
	if (fit === 'stretch') { sx = w / gw; sy = h / gh }
	else { sx = sy = Math.min(w / gw, h / gh) }
	const offsetX = (w - gw * sx) / 2
	const offsetY = (h - gh * sy) / 2

	const proj = ([x, y]) => [
		offsetX + (x - minX) * sx,
		offsetY + (flipY ? (maxY - y) : (y - minY)) * sy,
	]
	const smoothing = args.smoothing || 'none'
	const allPoints = []
	for (const ring of inputRings) {
		if (!Array.isArray(ring) || ring.length < 2) continue
		const decimated = decimateRing(ring, maxPointsPerRing)
		const projected = decimated.map(proj)
		if (smoothing === 'catmull-rom' && projected.length >= 3) {
			const beziers = ringToBezierCommands(projected, 0, 0, true)
			for (const c of beziers) allPoints.push(c)
		} else {
			for (let i = 0; i < projected.length; i++) {
				const [px, py] = projected[i]
				if (i === 0) allPoints.push({ x: px, y: py, moveTo: true })
				else allPoints.push({ x: px, y: py })
			}
			allPoints.push({ close: true })
		}
	}
	return {
		mode: 'fitToBox',
		smoothing,
		points: allPoints,
		pointCount: allPoints.length,
		sourceBBox: { minX, maxX, minY, maxY },
		projection,
		fit,
	}
}

// =============================================================================
//  LIBRARY — reuse high-quality vector groups from ANY pptx slide.
//  Generic: doesn't know about reference decks, world maps, or countries.
//  The AI client points the primitive at a slide.xml; the primitive parses
//  the OOXML and returns the catalog. Then the AI picks a named group and
//  drops it into the target slide.
// =============================================================================

function _findTopLevelGroups(slideXml) {
	const treeMatch = slideXml.match(/<p:spTree>([\s\S]*)<\/p:spTree>/)
	if (!treeMatch) return { tree: '', groups: [] }
	const tree = treeMatch[1]
	const groups = []
	const re = /<p:grpSp>|<\/p:grpSp>/g
	let m, depth = 0, start = -1
	while ((m = re.exec(tree)) !== null) {
		if (m[0] === '<p:grpSp>') {
			if (depth === 0) start = m.index
			depth++
		} else {
			depth--
			if (depth === 0 && start >= 0) {
				groups.push({ xml: tree.substring(start, m.index + m[0].length), startIndex: start })
				start = -1
			}
		}
	}
	return { tree, groups }
}

function _summariseGroup(groupXml) {
	const nameMatch = groupXml.match(/<p:cNvPr id="\d+" name="([^"]+)"/)
	const xfrm = groupXml.match(/<p:grpSpPr><a:xfrm><a:off x="(-?\d+)" y="(-?\d+)"\s*\/><a:ext cx="(\d+)" cy="(\d+)"/)
	const name = nameMatch ? nameMatch[1] : null
	const entry = {
		name,
		bytes: groupXml.length,
		shapeCount: (groupXml.match(/<p:sp>/g) || []).length,
		subGroupCount: Math.max(0, (groupXml.match(/<p:grpSp>/g) || []).length - 1),
		cubicBezTo: (groupXml.match(/<a:cubicBezTo>/g) || []).length,
		moveTo: (groupXml.match(/<a:moveTo>/g) || []).length,
		hasImages: (groupXml.match(/<a:blip /g) || []).length > 0,
		hasRelationships: /r:(embed|link|id)="rId/.test(groupXml),
	}
	if (xfrm) {
		entry.x = +xfrm[1] / 914400
		entry.y = +xfrm[2] / 914400
		entry.w = +xfrm[3] / 914400
		entry.h = +xfrm[4] / 914400
	}
	return entry
}

async function handleLibraryListXmlGroups(args) {
	const p = path.isAbsolute(args.sourcePath) ? args.sourcePath : path.resolve(process.cwd(), args.sourcePath)
	const fsSync = await import('node:fs')
	if (!fsSync.existsSync(p)) throw new Error(`library.list_xml_groups: not found: ${p}`)
	const xml = fsSync.readFileSync(p, 'utf-8')
	const { groups } = _findTopLevelGroups(xml)
	const out = groups.map(g => _summariseGroup(g.xml))
	return {
		sourcePath: p,
		bytes: xml.length,
		groupCount: out.length,
		groups: out,
	}
}

async function handleLibraryImportXmlGroup(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const p = path.isAbsolute(args.sourcePath) ? args.sourcePath : path.resolve(process.cwd(), args.sourcePath)
	const fsSync = await import('node:fs')
	if (!fsSync.existsSync(p)) throw new Error(`library.import_xml_group: not found: ${p}`)
	const xml = fsSync.readFileSync(p, 'utf-8')
	const { groups } = _findTopLevelGroups(xml)

	// Find the requested group
	const idxByName = args.groupName != null
		? groups.findIndex(g => {
			const m = g.xml.match(/<p:cNvPr id="\d+" name="([^"]+)"/)
			return m && m[1] === args.groupName
		})
		: -1
	const groupIndex = args.groupIndex != null ? args.groupIndex : idxByName
	if (groupIndex < 0 || groupIndex >= groups.length) {
		const sample = groups.slice(0, 6).map(g => _summariseGroup(g.xml).name).join(', ')
		throw new Error(`library.import_xml_group: group not found. Use list_xml_groups first. Available samples: ${sample}`)
	}
	let groupXml = groups[groupIndex].xml

	// Check for image refs — those would require also copying rels + media
	const summary = _summariseGroup(groupXml)
	if (summary.hasRelationships && !args.allowRelationships) {
		throw new Error(`library.import_xml_group: group "${summary.name}" contains rId references (images/links) that would not resolve in the target deck. Pick a vector-only group, or pass allowRelationships:true to import anyway.`)
	}

	// Optional: rewrite the outer <a:xfrm> to land at a target box on the destination slide.
	// By default we PRESERVE THE SOURCE ASPECT RATIO so the artwork is not distorted
	// (letterboxed inside targetBox). Pass `fit: 'stretch'` to force-fill the whole box.
	let actualTargetBox = null
	if (args.targetBox) {
		const srcXfrm = groupXml.match(/<p:grpSpPr>\s*<a:xfrm>\s*<a:off x="(-?\d+)" y="(-?\d+)"\s*\/>\s*<a:ext cx="(\d+)" cy="(\d+)"/)
		const srcCx = srcXfrm ? +srcXfrm[3] : 0
		const srcCy = srcXfrm ? +srcXfrm[4] : 0
		const srcAspect = (srcCx > 0 && srcCy > 0) ? srcCx / srcCy : null
		const fit = args.fit || 'preserve-aspect'
		let { x, y, w, h } = args.targetBox
		let fitW = w, fitH = h, offsetX = 0, offsetY = 0
		if (fit === 'preserve-aspect' && srcAspect) {
			const boxAspect = w / h
			if (boxAspect > srcAspect) {
				// box is wider than source → letterbox horizontally
				fitW = h * srcAspect
				offsetX = (w - fitW) / 2
			} else if (boxAspect < srcAspect) {
				// box is taller than source → letterbox vertically
				fitH = w / srcAspect
				offsetY = (h - fitH) / 2
			}
		}
		const tx = Math.round((x + offsetX) * 914400)
		const ty = Math.round((y + offsetY) * 914400)
		const tw = Math.round(fitW * 914400)
		const th = Math.round(fitH * 914400)
		actualTargetBox = { x: x + offsetX, y: y + offsetY, w: fitW, h: fitH, fit, sourceAspect: srcAspect }
		groupXml = groupXml.replace(
			/(<p:grpSpPr>\s*<a:xfrm>\s*<a:off )x="-?\d+" y="-?\d+"(\s*\/>\s*<a:ext )cx="\d+" cy="\d+"/,
			`$1x="${tx}" y="${ty}"$2cx="${tw}" cy="${th}"`
		)
	}

	// Renumber all p:cNvPr ids inside the group to a fresh range to avoid collision
	const idBase = 100000 + Math.floor(Math.random() * 800000)
	let nextId = idBase
	groupXml = groupXml.replace(/<p:cNvPr id="\d+"/g, () => `<p:cNvPr id="${nextId++}"`)

	slide.addPassthroughXml(groupXml)
	return {
		ok: true,
		slideIndex: args.slideIndex,
		importedGroup: summary.name,
		shapesImported: summary.shapeCount,
		cubicBezTo: summary.cubicBezTo,
		lineTo: (groupXml.match(/<a:lnTo>/g) || []).length,
		bytes: groupXml.length,
		actualTargetBox,
	}
}

async function handleSimplifyPath(args) {
	const pts = args.points
	if (!Array.isArray(pts)) throw new Error('simplify_path: `points` must be an array')
	const maxPoints = args.maxPoints
	if (typeof maxPoints !== 'number' || maxPoints < 2) throw new Error('simplify_path: `maxPoints` must be >= 2')
	return { points: decimateRing(pts, maxPoints), originalCount: pts.length, newCount: Math.min(pts.length, maxPoints) }
}

// =============================================================================
//  GENERIC IO PRIMITIVES — read/write/list files, parse JSON.
// =============================================================================

async function handleIoReadFile(args) {
	const p = path.isAbsolute(args.path) ? args.path : path.resolve(process.cwd(), args.path)
	const encoding = args.encoding || 'utf-8'
	const fsSync = await import('node:fs')
	if (!fsSync.existsSync(p)) throw new Error(`io.read_file: not found: ${p}`)
	const stat = fsSync.statSync(p)
	if (stat.isDirectory()) throw new Error(`io.read_file: is a directory: ${p}`)
	const buf = fsSync.readFileSync(p)
	const slice = args.maxBytes ? buf.subarray(0, args.maxBytes) : buf
	const content = encoding === 'base64' ? slice.toString('base64') : slice.toString('utf-8')
	return { path: p, encoding, bytes: stat.size, truncated: !!args.maxBytes && stat.size > args.maxBytes, content }
}

async function handleIoWriteFile(args) {
	const p = path.isAbsolute(args.path) ? args.path : path.resolve(process.cwd(), args.path)
	await fs.mkdir(path.dirname(p), { recursive: true })
	const encoding = args.encoding || 'utf-8'
	const buf = encoding === 'base64' ? Buffer.from(args.content, 'base64') : Buffer.from(args.content, 'utf-8')
	await fs.writeFile(p, buf)
	return { path: p, encoding, bytes: buf.length }
}

async function handleIoListDir(args) {
	const p = path.isAbsolute(args.path) ? args.path : path.resolve(process.cwd(), args.path)
	const fsSync = await import('node:fs')
	if (!fsSync.existsSync(p)) throw new Error(`io.list_dir: not found: ${p}`)
	const stat = fsSync.statSync(p)
	if (!stat.isDirectory()) throw new Error(`io.list_dir: not a directory: ${p}`)
	const names = fsSync.readdirSync(p)
	function globToRegex(g) {
		const esc = g.replace(/[.+^${}()|\[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
		return new RegExp('^' + esc + '$', 'i')
	}
	const filter = args.pattern ? globToRegex(args.pattern) : null
	const entries = []
	for (const n of names) {
		if (filter && !filter.test(n)) continue
		const full = path.join(p, n)
		const s = fsSync.statSync(full)
		entries.push({ name: n, path: full, isDirectory: s.isDirectory(), bytes: s.size })
	}
	return { path: p, count: entries.length, entries }
}

async function handleFsFind(args) {
	const fsSync = await import('node:fs')
	const root = path.isAbsolute(args.root) ? args.root : path.resolve(process.cwd(), args.root)
	if (!fsSync.existsSync(root)) throw new Error(`fs.find: root not found: ${root}`)
	const maxResults = args.maxResults || 500
	const includeStats = !!args.includeStats
	function globToRegex(g) {
		// Supports **, *, ? — minimal but enough for asset discovery
		// ** = match any path segment (incl. /); * = match within a segment; ? = single char
		const SENTINEL_DOUBLESTAR = ' DOUBLESTAR '
		const SENTINEL_STAR = ' STAR '
		const SENTINEL_Q = ' Q '
		const tokenised = g
			.replace(/\*\*/g, SENTINEL_DOUBLESTAR)
			.replace(/\*/g, SENTINEL_STAR)
			.replace(/\?/g, SENTINEL_Q)
		const esc = tokenised.replace(/[.+^${}()|\[\]\\]/g, '\\$&')
		const re = esc
			.replace(new RegExp(SENTINEL_DOUBLESTAR, 'g'), '.*')
			.replace(new RegExp(SENTINEL_STAR, 'g'), '[^/]*')
			.replace(new RegExp(SENTINEL_Q, 'g'), '[^/]')
		return new RegExp('^' + re + '$', 'i')
	}
	const pattern = args.pattern || '**'
	const re = globToRegex(pattern)
	const results = []
	function walk(dir) {
		if (results.length >= maxResults) return
		let entries
		try { entries = fsSync.readdirSync(dir, { withFileTypes: true }) } catch (_) { return }
		for (const e of entries) {
			if (results.length >= maxResults) return
			const full = path.join(dir, e.name)
			const rel = path.relative(root, full).replace(/\\/g, '/')
			if (e.isDirectory()) {
				walk(full)
			} else {
				if (re.test(rel) || re.test(e.name)) {
					const entry = { path: full, rel }
					if (includeStats) {
						try { const s = fsSync.statSync(full); entry.bytes = s.size; entry.mtime = s.mtime.toISOString() }
						catch (_) {}
					}
					results.push(entry)
				}
			}
		}
	}
	walk(root)
	return { root, pattern, count: results.length, truncated: results.length >= maxResults, results }
}

const ASSET_CATALOG = [
	{ kind: 'model3d', role: 'Khronos sample GLB models', source: 'khronos', sourceLabel: 'Khronos sample models', sourcePriority: 12, root: 'demos/betterpptx-online-assets/models/khronos', pattern: /\.glb$/i },
	{ kind: 'model3d', role: 'Premium local GLB models', source: 'premium', sourceLabel: 'Maintained premium local models', sourcePriority: 86, root: 'demos/betterpptx-premium-assets/models', pattern: /\.glb$/i },
	{ kind: 'model3d', role: 'Reference deck GLB models', source: 'reference', sourceLabel: 'Reference deck models', sourcePriority: 22, root: 'demos/betterpptx-reference-assets/3d-gradient-style-agency/models', pattern: /\.glb$/i },
	{ kind: 'icon', role: 'Lucide SVG icon library', source: 'lucide', sourceLabel: 'Lucide SVG icons', sourcePriority: 42, root: 'demos/betterpptx-online-assets/icons/lucide', pattern: /\.svg$/i },
	{ kind: 'shapeScene', role: 'Reference custom-shape scenes', source: 'reference', sourceLabel: 'Reference custom-shape scenes', sourcePriority: 22, root: 'demos/betterpptx-reference-assets/3d-gradient-style-agency/shape-scenes', pattern: /\.json$/i },
]

const MICROSOFT_STOCK3D_SOURCE = 'microsoft-powerpoint-stock-3d'
const ICONSCOUT_SOURCE = 'iconscout-private'
const TOXSAM_SOURCE = 'toxsam-open-source-3d'
const TOXSAM_QUALITY_SOURCE = 'toxsam-open-source-3d-quality'
const SKETCHFAB_SOURCE = 'sketchfab-live'
const CATALOG_GENERIC_SEARCH_TERMS = new Set(['3d', 'glb', 'model', 'models', 'microsoft', 'powerpoint', 'office', 'stock', 'native', 'private', 'local', 'asset', 'assets'])
const MODEL_SIZE_POLICY_LIMITS_MB = {
	compact: 5,
	standard: 10,
	balanced: 15,
	'large-ok': 25,
	unrestricted: Number.POSITIVE_INFINITY,
}

function normalizeAssetKind(kind) {
	if (!kind) return null
	const s = String(kind).trim()
	const aliases = {
		customshape: 'shapeScene',
		customshapes: 'shapeScene',
		customgeometry: 'shapeScene',
		customgeom: 'shapeScene',
		shape: 'shapeScene',
		shapes: 'shapeScene',
		shapejson: 'shapeScene',
		model: 'model3d',
		model3d: 'model3d',
		models: 'model3d',
		glb: 'model3d',
	}
	return aliases[s.toLowerCase()] || s
}

function assetQueryTerms(query) {
	return [...new Set(String(query || '')
		.toLowerCase()
		.split(/[^a-z0-9]+/i)
		.map(s => s.trim())
		.filter(s => s.length >= 2))]
}

function uniqueAssetStrings(values) {
	return [...new Set((values || [])
		.flatMap(value => Array.isArray(value) ? value : [value])
		.map(value => String(value || '').trim())
		.filter(Boolean))]
}

function titleFromAssetPath(value, fallback = 'asset') {
	const base = path.basename(String(value || fallback), path.extname(String(value || fallback)))
	const cleaned = base
		.replace(/-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i, '')
		.replace(/[_-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
	return cleaned || fallback
}

function safeAssetHandlePart(value, fallback = 'asset') {
	const slug = String(value || fallback)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
	return slug || fallback
}

function normalizeCatalogSource(value) {
	const s = String(value || '').trim().toLowerCase()
	if (!s) return null
	if (['microsoft', 'ms', 'office', 'powerpoint', 'stock', 'stock3d', 'microsoft-stock', 'microsoft-powerpoint-stock-3d'].includes(s)) return MICROSOFT_STOCK3D_SOURCE
	if (['iconscout', 'iconscout-private', 'private-iconscout'].includes(s)) return ICONSCOUT_SOURCE
	if (['toxsam', 'open-source', 'opensource', 'open3d', 'cc0', 'open-source-3d', 'toxsam-open-source-3d'].includes(s)) return TOXSAM_SOURCE
	if (['toxsam-quality', 'open-source-quality', 'open3d-quality', 'toxsam-open-source-3d-quality'].includes(s)) return TOXSAM_QUALITY_SOURCE
	if (['sketchfab', 'sketchfab-live', 'sketchfab-imported', 'live-sketchfab'].includes(s)) return SKETCHFAB_SOURCE
	return s
}

function catalogSourceMatches(item, source) {
	if (!source) return true
	if (item.source === source || item.sourceKey === source) return true
	if (source === TOXSAM_SOURCE && item.sourceFamily === TOXSAM_SOURCE) return true
	return false
}

function normalizeModelSizePolicy(value) {
	const s = String(value || 'standard').trim().toLowerCase()
	if (['small', 'low', 'light', 'compact'].includes(s)) return 'compact'
	if (['normal', 'default', 'standard'].includes(s)) return 'standard'
	if (['medium', 'balanced'].includes(s)) return 'balanced'
	if (['large', 'large-ok', 'high'].includes(s)) return 'large-ok'
	if (['all', 'any', 'unrestricted', 'none'].includes(s)) return 'unrestricted'
	return 'standard'
}

function assetModelSizeMiB(item) {
	const direct = Number(item?.sizeMiB)
	if (Number.isFinite(direct) && direct > 0) return direct
	const bytes = Number(item?.bytes || 0)
	return Number.isFinite(bytes) && bytes > 0 ? bytes / MODEL_BYTES_PER_MIB : 0
}

function modelSizeRankAdjustment(item) {
	if (item?.kind !== 'model3d') return 0
	const mib = assetModelSizeMiB(item)
	if (!mib) return 0
	if (mib <= 1) return 6
	if (mib <= 5) return 4
	if (mib <= 10) return 2
	if (mib <= 15) return -2
	if (mib <= 25) return -6
	return -14
}

const SKETCHFAB_API_ROOT = 'https://api.sketchfab.com/v3'
const SKETCHFAB_ALLOWED_LICENSES = new Set(['cc0', 'by'])
const SKETCHFAB_SHAREALIKE_LICENSES = new Set(['by-sa'])
const SKETCHFAB_STANDARD_LICENSES = new Set(['free-st'])
const SKETCHFAB_RESTRICTED_LICENSES = new Set(['by-nc', 'by-nc-sa', 'by-nc-nd', 'ed'])
const SKETCHFAB_NO_DERIVATIVE_LICENSES = new Set(['by-nd'])
const SKETCHFAB_LICENSE_DETAILS = {
	cc0: { slug: 'cc0', label: 'CC0 Public Domain', commercialUse: true, attributionRequired: false, url: 'http://creativecommons.org/publicdomain/zero/1.0/' },
	by: { slug: 'by', label: 'CC Attribution', commercialUse: true, attributionRequired: true, url: 'http://creativecommons.org/licenses/by/4.0/' },
	'by-sa': { slug: 'by-sa', label: 'CC Attribution-ShareAlike', commercialUse: true, attributionRequired: true, shareAlike: true, url: 'http://creativecommons.org/licenses/by-sa/4.0/' },
	'free-st': { slug: 'free-st', label: 'Free Standard', commercialUse: true, attributionRequired: false, standardTerms: true, url: 'https://sketchfab.com/licenses' },
}

function sketchfabCacheRoot() {
	if (process.env.BETTERPPTX_SKETCHFAB_CACHE_DIR) return path.resolve(process.env.BETTERPPTX_SKETCHFAB_CACHE_DIR)
	if (process.env.K_SERVICE || process.env.BETTERPPTX_REQUIRE_SHARED_STORES === '1') {
		return path.resolve('/tmp', 'betterpptx-sketchfab-assets')
	}
	return path.resolve(process.cwd(), 'outputs', 'sketchfab-assets')
}

function sketchfabManifestPath() {
	return path.join(sketchfabCacheRoot(), 'manifest.json')
}

function sketchfabAuthFromEnv() {
	const apiKey = process.env.SKETCHFAB_API_KEY || process.env.SKETCHFAB_API_TOKEN || process.env.SKETCHFAB_TOKEN
	if (apiKey) return { type: 'service-api-key', header: `Token ${apiKey}` }
	return null
}

function sketchfabLicenseSlug(license) {
	const text = String(license?.slug || license?.label || license?.fullName || '').trim().toLowerCase()
	if (!text) return ''
	if (text === 'cc0 public domain' || text === 'public domain') return 'cc0'
	if (text === 'cc attribution' || text === 'creative commons attribution') return 'by'
	if (text.includes('noncommercial') || text.includes('non-commercial')) {
		if (text.includes('noderivs') || text.includes('no derivatives')) return 'by-nc-nd'
		if (text.includes('sharealike') || text.includes('share alike')) return 'by-nc-sa'
		return 'by-nc'
	}
	if (text.includes('noderivs') || text.includes('no derivatives')) return 'by-nd'
	if (text.includes('sharealike') || text.includes('share alike')) return 'by-sa'
	if (text.includes('free standard')) return 'free-st'
	if (text === 'standard') return 'st'
	if (text === 'editorial') return 'ed'
	return text
}

function sketchfabLicensePolicy(args = {}) {
	const policy = String(args.licensePolicy || args.rightsPolicy || 'commercial-safe').trim().toLowerCase()
	const requested = args.allowedLicenseSlugs || args.licenses || args.licenseSlugs
	if (requested) {
		const slugs = uniqueAssetStrings([Array.isArray(requested) ? requested : String(requested).split(/[,\s]+/)])
			.map(item => item.toLowerCase())
			.filter(Boolean)
		return { policy: 'custom', slugs }
	}
	if (policy === 'cc0' || policy === 'cc0-only' || policy === 'public-domain') return { policy: 'cc0-only', slugs: ['cc0'] }
	if (policy === 'commercial-with-sharealike' || policy === 'commercial-sa') return { policy: 'commercial-with-sharealike', slugs: ['cc0', 'by', 'by-sa'] }
	if (policy === 'commercial-broad' || policy === 'free-commercial-broad') return { policy: 'commercial-broad', slugs: ['cc0', 'by', 'by-sa', 'free-st'] }
	if (policy === 'any-downloadable' || policy === 'any') return { policy: 'any-downloadable', slugs: [] }
	return { policy: 'commercial-safe', slugs: ['cc0', 'by'] }
}

function sketchfabLicenseAllowed(model, args = {}) {
	const slug = sketchfabLicenseSlug(model?.license)
	if (!slug) return false
	const { slugs } = sketchfabLicensePolicy(args)
	if (slugs.length && !slugs.includes(slug)) return false
	if (SKETCHFAB_RESTRICTED_LICENSES.has(slug)) return false
	if (SKETCHFAB_NO_DERIVATIVE_LICENSES.has(slug) && args.allowNoDerivatives !== true) return false
	if (SKETCHFAB_SHAREALIKE_LICENSES.has(slug) && args.allowShareAlike !== true && !slugs.includes(slug)) return false
	if (SKETCHFAB_STANDARD_LICENSES.has(slug) && args.allowStandardLicense !== true && !slugs.includes(slug)) return false
	return SKETCHFAB_ALLOWED_LICENSES.has(slug)
		|| (args.allowShareAlike === true && SKETCHFAB_SHAREALIKE_LICENSES.has(slug))
		|| (args.allowStandardLicense === true && SKETCHFAB_STANDARD_LICENSES.has(slug))
		|| slugs.includes(slug)
}

function sketchfabModelArchive(model, preferred = 'auto') {
	const archives = model?.archives || {}
	const order = preferred && preferred !== 'auto' ? [preferred] : ['glb', 'gltf']
	for (const key of order) {
		if (archives?.[key]) return { format: key, ...archives[key] }
	}
	return null
}

function sketchfabModelSizeMiB(model, preferred = 'auto') {
	const archive = sketchfabModelArchive(model, preferred)
	return archive?.size ? Math.round((Number(archive.size) / MODEL_BYTES_PER_MIB) * 100) / 100 : null
}

function sketchfabUidFromInput(args = {}) {
	const raw = String(args.uid || args.modelUid || args.modelId || args.id || args.url || args.viewerUrl || args.sketchfabUrl || args.handle || args.sketchfabHandle || args.model || '').trim()
	if (!raw) return ''
	if (/^[a-f0-9]{32}$/i.test(raw)) return raw.toLowerCase()
	let fromHandle = raw.match(/^sketchfab:\/\/models?\/([a-f0-9]{32})(?:[/?#]|$)/i)
		|| raw.match(/^model3d:\/\/sketchfab\/([a-f0-9]{32})(?:[/?#]|$)/i)
	if (fromHandle) return fromHandle[1].toLowerCase()
	try {
		const url = new URL(raw)
		if (!/(^|\.)sketchfab\.com$/i.test(url.hostname)) return ''
		const match = url.pathname.match(/\/3d-models\/[^/?#]*-([a-f0-9]{32})(?:[/?#]|$)/i)
			|| url.pathname.match(/\/models\/([a-f0-9]{32})(?:[/?#]|$)/i)
		return match ? match[1].toLowerCase() : ''
	} catch {
		return ''
	}
}

function sketchfabTitleSlug(value, fallback = 'sketchfab-model') {
	return safeAssetHandlePart(String(value || fallback).slice(0, 80))
}

function sketchfabHandleForModel(model) {
	const uid = String(model?.uid || '').toLowerCase()
	return `model3d://sketchfab/${uid}/${sketchfabTitleSlug(model?.name)}`
}

function sketchfabCandidateHandle(uid) {
	return `sketchfab://models/${String(uid || '').toLowerCase()}`
}

function sketchfabBestThumbnail(model, preferredWidth = 720) {
	const images = Array.isArray(model?.thumbnails?.images) ? model.thumbnails.images : []
	if (!images.length) return null
	return [...images].sort((a, b) => Math.abs(Number(a.width || 0) - preferredWidth) - Math.abs(Number(b.width || 0) - preferredWidth))[0] || null
}

function sketchfabRights(model) {
	const slug = sketchfabLicenseSlug(model?.license)
	const detail = SKETCHFAB_LICENSE_DETAILS[slug] || { slug, label: model?.license?.label || slug || 'Unknown', commercialUse: sketchfabLicenseAllowed(model, { licensePolicy: 'any-downloadable', allowShareAlike: true, allowStandardLicense: true, allowNoDerivatives: true }) }
	return {
		slug,
		label: model?.license?.label || detail.label,
		fullName: model?.license?.fullName || detail.fullName,
		url: model?.license?.url || model?.license?.uri || detail.url,
		commercialAllowed: !!detail.commercialUse,
		creditRequired: detail.attributionRequired !== false,
		shareAlike: !!detail.shareAlike,
		standardTerms: !!detail.standardTerms,
	}
}

function sketchfabAttribution(model) {
	const author = model?.user?.displayName || model?.user?.username || 'Sketchfab creator'
	const title = model?.name || 'Sketchfab model'
	const url = model?.viewerUrl || `https://sketchfab.com/3d-models/${model?.uid || ''}`
	const rights = sketchfabRights(model)
	return `${title} by ${author} on Sketchfab (${rights.label || rights.slug || 'license'}): ${url}`
}

function publicSketchfabModel(model, { includeDescription = false } = {}) {
	const archive = sketchfabModelArchive(model)
	const thumbnail = sketchfabBestThumbnail(model)
	return {
		uid: model?.uid,
		id: model?.uid,
		handle: sketchfabCandidateHandle(model?.uid),
		name: model?.name,
		title: model?.name,
		viewerUrl: model?.viewerUrl,
		sketchfabUrl: model?.viewerUrl,
		embedUrl: model?.embedUrl,
		isDownloadable: !!model?.isDownloadable,
		publishedAt: model?.publishedAt,
		stats: {
			viewCount: model?.viewCount,
			likeCount: model?.likeCount,
			commentCount: model?.commentCount,
			animationCount: model?.animationCount,
			faceCount: model?.faceCount,
			vertexCount: model?.vertexCount,
		},
		user: model?.user ? {
			uid: model.user.uid,
			username: model.user.username,
			displayName: model.user.displayName,
			profileUrl: model.user.profileUrl || model.user.uri,
		} : undefined,
		rights: sketchfabRights(model),
		attribution: sketchfabAttribution(model),
		categories: Array.isArray(model?.categories) ? model.categories.map(item => item?.name || item?.slug).filter(Boolean) : [],
		keywords: Array.isArray(model?.tags) ? model.tags.map(item => item?.name || item?.slug || item).filter(Boolean).slice(0, 24) : [],
		thumbnail: thumbnail ? { url: thumbnail.url, width: thumbnail.width, height: thumbnail.height, bytes: thumbnail.size } : undefined,
		archives: model?.archives ? Object.fromEntries(Object.entries(model.archives).map(([format, item]) => [format, {
			format,
			sizeMiB: item?.size ? Math.round((Number(item.size) / MODEL_BYTES_PER_MIB) * 100) / 100 : undefined,
			textureCount: item?.textureCount,
			textureMaxResolution: item?.textureMaxResolution,
			faceCount: item?.faceCount,
			vertexCount: item?.vertexCount,
		}])) : undefined,
		preferredArchive: archive ? {
			format: archive.format,
			sizeMiB: archive.size ? Math.round((Number(archive.size) / MODEL_BYTES_PER_MIB) * 100) / 100 : undefined,
			sizeTier: archive.size ? modelSizeTier(Number(archive.size)) : undefined,
		} : undefined,
		...(includeDescription && model?.description ? { description: String(model.description).slice(0, 2000) } : {}),
	}
}

async function sketchfabFetchJson(url, auth = null, { timeoutMs = 30000, maxBytes = 2 * 1024 * 1024 } = {}) {
	const res = await safeFetchToBuffer(url, {
		timeoutMs,
		maxBytes,
		headers: {
			Accept: 'application/json',
			...(auth?.header ? { Authorization: auth.header } : {}),
		},
	})
	let body
	try { body = JSON.parse(res.buffer.toString('utf8')) }
	catch { body = { raw: res.buffer.toString('utf8').slice(0, 1000) } }
	return { ok: res.ok, status: res.status, statusText: res.statusText, body }
}

function sketchfabMaxModelMiB(args = {}) {
	const explicit = Number(args.maxModelSizeMb ?? args.maxArchiveSizeMb ?? args.maxSizeMb)
	if (Number.isFinite(explicit) && explicit > 0) return explicit
	return MODEL_SIZE_POLICY_LIMITS_MB[normalizeModelSizePolicy(args.sizePolicy)] || MODEL_SIZE_POLICY_LIMITS_MB.standard
}

function sketchfabSearchUrl(args = {}, count = 24) {
	const q = String(args.q || args.query || args.search || args.name || '').trim()
	const url = new URL(`${SKETCHFAB_API_ROOT}/search`)
	url.searchParams.set('type', 'models')
	if (q) url.searchParams.set('q', q)
	url.searchParams.set('downloadable', args.downloadable === false ? 'false' : 'true')
	url.searchParams.set('count', String(Math.max(1, Math.min(100, count))))
	const cursor = args.cursor || args.pageCursor
	if (cursor) url.searchParams.set('cursor', String(cursor))
	const { slugs } = sketchfabLicensePolicy(args)
	if (slugs.length) url.searchParams.set('licenses', slugs.join(','))
	if (args.categories) url.searchParams.set('categories', Array.isArray(args.categories) ? args.categories.join(',') : String(args.categories))
	const tags = args.tags ?? args.keywords
	if (tags) url.searchParams.set('tags', Array.isArray(tags) ? tags.join(',') : String(tags))
	if (args.animated !== undefined) url.searchParams.set('animated', args.animated ? 'true' : 'false')
	if (args.staffpicked !== undefined) url.searchParams.set('staffpicked', args.staffpicked ? 'true' : 'false')
	if (args.sortBy || args.sort_by) url.searchParams.set('sort_by', String(args.sortBy || args.sort_by))
	return url.href
}

function filterSketchfabModels(models, args = {}) {
	const maxMiB = sketchfabMaxModelMiB(args)
	const maxBytes = Number.isFinite(maxMiB) ? maxMiB * MODEL_BYTES_PER_MIB : Number.POSITIVE_INFINITY
	const preferredFormat = String(args.format || 'auto').toLowerCase()
	const commercialUseOnly = args.commercialUseOnly !== false
	let excludedByLicense = 0
	let excludedBySize = 0
	let excludedByDownloadable = 0
	let excludedByAge = 0
	const results = []
	for (const model of models || []) {
		if (args.downloadable !== false && model?.isDownloadable !== true) {
			excludedByDownloadable += 1
			continue
		}
		if (args.excludeAgeRestricted !== false && model?.isAgeRestricted === true) {
			excludedByAge += 1
			continue
		}
		if (commercialUseOnly && !sketchfabLicenseAllowed(model, args)) {
			excludedByLicense += 1
			continue
		}
		const archive = sketchfabModelArchive(model, preferredFormat)
		if (archive?.size && Number(archive.size) > maxBytes) {
			excludedBySize += 1
			continue
		}
		results.push(model)
	}
	return { results, excludedByLicense, excludedBySize, excludedByDownloadable, excludedByAge, maxModelSizeMb: Number.isFinite(maxMiB) ? maxMiB : null }
}

async function findSketchfabModelFromArgs(args = {}) {
	const uid = sketchfabUidFromInput(args)
	if (uid) {
		const modelResult = await sketchfabFetchJson(`${SKETCHFAB_API_ROOT}/models/${uid}`, sketchfabAuthFromEnv(), { timeoutMs: Number(args.timeoutMs || 30000) })
		if (!modelResult.ok) {
			const err = new Error(`Sketchfab model lookup failed with HTTP ${modelResult.status}.`)
			err.code = 'SKETCHFAB_MODEL_LOOKUP_FAILED'
			err.details = { status: modelResult.status, message: modelResult.body?.detail || modelResult.body?.error }
			throw err
		}
		return modelResult.body
	}
	const query = String(args.query || args.q || args.name || '').trim()
	if (!query) {
		const err = new Error('Provide a Sketchfab uid, model URL, sketchfab:// handle, or query/name.')
		err.code = 'SKETCHFAB_MODEL_REQUIRED'
		throw err
	}
	const searchResult = await runSketchfabSearch({ ...args, query, maxResults: Math.max(1, Number(args.searchLimit || 12)) })
	if (!searchResult.results.length) {
		const err = new Error('No matching Sketchfab model passed the current license and size policy.')
		err.code = 'SKETCHFAB_NO_MATCH'
		err.details = { query, sizePolicy: searchResult.sizePolicy, licensePolicy: searchResult.licensePolicy }
		throw err
	}
	const requestedName = String(args.name || '').trim().toLowerCase()
	if (requestedName) {
		return searchResult._models.find(item => String(item.name || '').trim().toLowerCase() === requestedName) || searchResult._models[0]
	}
	return searchResult._models[0]
}

async function sha256Path(filePath) {
	const buffer = await fs.readFile(filePath)
	return crypto.createHash('sha256').update(buffer).digest('hex')
}

function safeSketchfabFileStem(model) {
	return `${sketchfabTitleSlug(model?.name)}-${String(model?.uid || '').toLowerCase()}`
}

async function writeBufferFile(filePath, buffer) {
	await fs.mkdir(path.dirname(filePath), { recursive: true })
	await fs.writeFile(filePath, buffer)
	return filePath
}

async function extractSketchfabZip(zipPath, outDir) {
	const zip = await JSZip.loadAsync(await fs.readFile(zipPath))
	const entries = []
	await fs.mkdir(outDir, { recursive: true })
	for (const [name, entry] of Object.entries(zip.files)) {
		const normalized = String(name || '').replace(/\\/g, '/').replace(/^\/+/, '')
		if (!normalized || normalized.includes('\0')) continue
		const target = path.resolve(outDir, normalized)
		const relative = path.relative(outDir, target)
		if (relative.startsWith('..') || path.isAbsolute(relative)) {
			throw new Error(`Refusing unsafe Sketchfab archive entry: ${name}`)
		}
		if (entry.dir) {
			await fs.mkdir(target, { recursive: true })
			continue
		}
		await fs.mkdir(path.dirname(target), { recursive: true })
		await fs.writeFile(target, await entry.async('nodebuffer'))
		entries.push(normalized)
	}
	return entries
}

async function findFirstModelFile(rootDir) {
	const files = []
	async function walk(dir) {
		const entries = await fs.readdir(dir, { withFileTypes: true })
		for (const entry of entries) {
			const full = path.join(dir, entry.name)
			if (entry.isDirectory()) await walk(full)
			else if (/\.(glb|gltf)$/i.test(entry.name)) files.push(full)
		}
	}
	await walk(rootDir)
	files.sort((a, b) => {
		const ae = path.extname(a).toLowerCase()
		const be = path.extname(b).toLowerCase()
		if (ae !== be) return ae === '.glb' ? -1 : 1
		const as = path.basename(a).toLowerCase() === 'scene.gltf' ? 0 : 1
		const bs = path.basename(b).toLowerCase() === 'scene.gltf' ? 0 : 1
		return as - bs || a.localeCompare(b)
	})
	return files[0] || null
}

async function convertSketchfabGltfToGlb(gltfPath, glbPath) {
	const [{ NodeIO }, { ALL_EXTENSIONS }] = await Promise.all([
		import('@gltf-transform/core'),
		import('@gltf-transform/extensions'),
	])
	const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
	const document = await io.read(gltfPath)
	await fs.mkdir(path.dirname(glbPath), { recursive: true })
	await io.write(glbPath, document)
	return glbPath
}

async function maybeDownloadSketchfabThumbnail(model, outDir, timeoutMs = 30000) {
	const thumbnail = sketchfabBestThumbnail(model)
	if (!thumbnail?.url) return null
	try {
		const fetched = await safeFetchToBuffer(thumbnail.url, { maxBytes: 3 * 1024 * 1024, timeoutMs, requireImage: true })
		if (!fetched.ok) return null
		const ext = String(fetched.headers?.['content-type'] || '').toLowerCase().includes('png') ? 'png' : 'jpg'
		const filePath = path.join(outDir, `poster.${ext}`)
		await writeBufferFile(filePath, fetched.buffer)
		return filePath
	} catch {
		return null
	}
}

function readSketchfabManifest() {
	return readJsonFileSync(sketchfabManifestPath(), { source: SKETCHFAB_SOURCE, assets: [] })
}

async function writeSketchfabManifest(manifest) {
	const filePath = sketchfabManifestPath()
	await fs.mkdir(path.dirname(filePath), { recursive: true })
	await fs.writeFile(filePath, `${JSON.stringify({ ...manifest, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
}

async function upsertSketchfabManifestAsset(asset) {
	const manifest = readSketchfabManifest()
	const assets = Array.isArray(manifest.assets) ? manifest.assets : []
	const index = assets.findIndex(item => item.uid === asset.uid || item.handle === asset.handle)
	if (index >= 0) assets[index] = { ...assets[index], ...asset }
	else assets.push(asset)
	await writeSketchfabManifest({
		...manifest,
		source: SKETCHFAB_SOURCE,
		provider: 'Sketchfab',
		generatedAt: manifest.generatedAt || new Date().toISOString(),
		assets,
	})
}

function publicSketchfabImportedAsset(asset, full = false) {
	const base = {
		handle: asset.handle,
		modelAsset: asset.handle,
		addModel3DOptions: { modelAsset: asset.handle, nativeOnly: true },
		uid: asset.uid,
		id: asset.uid,
		name: asset.title || asset.name,
		title: asset.title || asset.name,
		source: SKETCHFAB_SOURCE,
		sourceLabel: 'Sketchfab',
		sourceUrl: asset.sourceUrl,
		viewerUrl: asset.sourceUrl,
		rights: asset.rights,
		attribution: asset.attribution,
		sizeMiB: asset.sizeMiB,
		sizeTier: asset.sizeTier,
		sha256: full ? asset.sha256 : undefined,
		importedAt: asset.importedAt,
	}
	return Object.fromEntries(Object.entries(base).filter(([, value]) => value !== undefined && value !== null))
}

function buildSketchfabImportedAssets() {
	const cacheRoot = sketchfabCacheRoot()
	const manifest = readSketchfabManifest()
	if (!Array.isArray(manifest.assets)) return []
	return manifest.assets.map(asset => {
		let filePath
		try { filePath = resolveSketchfabCachePath(cacheRoot, asset.file) }
		catch { return null }
		if (!asset?.handle || !fsNode.existsSync(filePath)) return null
		let previewPath
		try { previewPath = asset.preview ? resolveSketchfabCachePath(cacheRoot, asset.preview) : undefined }
		catch { previewPath = undefined }
		const tags = uniqueAssetStrings([
			'3d', 'model', 'glb', 'sketchfab', 'live-import',
			asset.title,
			asset.uid,
			asset.rights?.slug,
			asset.categories,
			asset.keywords,
		]).map(tag => tag.toLowerCase().replace(/\s+/g, '-'))
		const item = {
			kind: 'model3d',
			source: SKETCHFAB_SOURCE,
			sourceKey: SKETCHFAB_SOURCE,
			sourceLabel: 'Sketchfab imported models',
			sourcePriority: 34,
			role: 'Imported Sketchfab model selected through live search and official Download API',
			handle: asset.handle,
			title: asset.title || asset.name,
			name: path.basename(filePath),
			sourceCategory: 'Sketchfab',
			tags,
			usage: 'Use when the locally curated catalog does not contain a semantically strong small model. Preserve the returned attribution with the generated presentation.',
			path: filePath,
			modelAsset: filePath,
			rel: relFromCwd(filePath),
			preview: previewPath && fsNode.existsSync(previewPath) ? previewPath : undefined,
			posterAsset: previewPath && fsNode.existsSync(previewPath) ? previewPath : undefined,
			addModel3DOptions: { modelAsset: filePath, nativeOnly: true },
			sourceUrl: asset.sourceUrl,
			rights: asset.rights,
			attribution: asset.attribution,
			uid: asset.uid,
			sha256: asset.sha256,
			catalog: {
				provider: 'Sketchfab',
				importedAt: asset.importedAt,
			},
			...statSummary(filePath),
		}
		item.searchText = makeCatalogSearchText(item)
		return item
	}).filter(Boolean)
}

function resolveSketchfabCachePath(root, relativePath) {
	const base = path.resolve(root)
	const target = path.resolve(base, String(relativePath || ''))
	const relative = path.relative(base, target)
	if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
		throw new Error('Sketchfab cache manifest contains an unsafe asset reference.')
	}
	return target
}

function sketchfabRelativePath(cacheRoot, filePath) {
	return path.relative(cacheRoot, filePath).replace(/\\/g, '/')
}

function sketchfabFormatSizeMiB(item) {
	const size = Number(item?.size || item?.bytes || item?.contentLength || 0)
	return Number.isFinite(size) && size > 0 ? Math.round((size / MODEL_BYTES_PER_MIB) * 100) / 100 : undefined
}

function summarizeSketchfabDownloadFormats(payload = {}) {
	return Object.fromEntries(Object.entries(payload || {}).map(([format, item]) => [format, {
		format,
		available: !!item?.url,
		sizeMiB: sketchfabFormatSizeMiB(item),
		expiresAt: item?.expires || item?.expiresAt,
	}]))
}

function selectSketchfabDownloadFormat(payload = {}, requestedFormat = 'auto', maxBytes = Number.POSITIVE_INFINITY) {
	const requested = String(requestedFormat || 'auto').trim().toLowerCase()
	const order = requested === 'auto' ? ['glb', 'gltf'] : [requested]
	const supported = new Set(['glb', 'gltf'])
	const candidates = []
	for (const format of order) {
		const item = payload?.[format]
		if (!item?.url) continue
		const size = Number(item.size || item.bytes || item.contentLength || 0)
		candidates.push({ format, item, size: Number.isFinite(size) ? size : 0 })
	}
	if (!candidates.length && requested === 'auto') {
		for (const [format, item] of Object.entries(payload || {})) {
			if (!supported.has(String(format).toLowerCase()) || !item?.url) continue
			const size = Number(item.size || item.bytes || item.contentLength || 0)
			candidates.push({ format, item, size: Number.isFinite(size) ? size : 0 })
		}
	}
	if (requested !== 'auto' && !supported.has(requested)) {
		return { ok: false, code: 'unsupported-format', message: 'PowerPoint import currently supports Sketchfab GLB and glTF download formats.' }
	}
	if (!candidates.length) {
		return { ok: false, code: 'no-supported-format', message: 'No GLB or glTF Sketchfab download format is available for this model.' }
	}
	const oversized = []
	for (const candidate of candidates) {
		if (candidate.size > 0 && candidate.size > maxBytes) {
			oversized.push(candidate)
			continue
		}
		return { ok: true, ...candidate }
	}
	const smallest = oversized.sort((a, b) => a.size - b.size)[0]
	return {
		ok: false,
		code: 'too-large',
		message: 'Available Sketchfab download formats exceed the configured model size ceiling.',
		format: smallest?.format,
		sizeMiB: smallest?.size ? Math.round((smallest.size / MODEL_BYTES_PER_MIB) * 100) / 100 : undefined,
	}
}

function sketchfabRuntimeConfig(auth = sketchfabAuthFromEnv()) {
	return {
		authConfigured: !!auth,
		authMode: auth?.type || 'none',
		authentication: auth ? 'configured Sketchfab service API key' : 'missing Sketchfab service API key',
		cacheMode: process.env.BETTERPPTX_SKETCHFAB_CACHE_DIR ? 'configured' : (process.env.K_SERVICE ? 'cloud-run-ephemeral-default' : 'local-default'),
	}
}

async function runSketchfabSearch(args = {}) {
	const requestedLimit = Math.max(1, Math.min(50, Number(args.maxResults || args.limit || 12) || 12))
	const fetchCount = Math.max(requestedLimit, Math.min(100, requestedLimit * 4))
	const auth = sketchfabAuthFromEnv()
	const response = await sketchfabFetchJson(sketchfabSearchUrl(args, fetchCount), auth, {
		timeoutMs: Number(args.timeoutMs || 30000),
		maxBytes: 4 * 1024 * 1024,
	})
	if (!response.ok) {
		const err = new Error(`Sketchfab search failed with HTTP ${response.status}.`)
		err.code = 'SKETCHFAB_SEARCH_FAILED'
		err.details = { status: response.status, message: response.body?.detail || response.body?.error }
		throw err
	}
	const rawModels = Array.isArray(response.body?.results) ? response.body.results : []
	const filtered = filterSketchfabModels(rawModels, args)
	const models = filtered.results.slice(0, requestedLimit)
	const { policy, slugs } = sketchfabLicensePolicy(args)
	const sizePolicy = normalizeModelSizePolicy(args.sizePolicy)
	return {
		provider: 'Sketchfab',
		query: String(args.query || args.q || args.search || args.name || '').trim() || null,
		count: models.length,
		truncated: filtered.results.length > models.length || !!response.body?.next,
		next: response.body?.next || null,
		cursor: response.body?.cursors || null,
		licensePolicy: {
			policy,
			allowedLicenseSlugs: slugs.length ? slugs : null,
			commercialUseOnly: args.commercialUseOnly !== false,
		},
		sizePolicy: {
			policy: sizePolicy,
			maxModelSizeMb: filtered.maxModelSizeMb,
			excludedBySize: filtered.excludedBySize,
		},
		excluded: {
			byLicense: filtered.excludedByLicense,
			bySize: filtered.excludedBySize,
			byDownloadable: filtered.excludedByDownloadable,
			byAge: filtered.excludedByAge,
		},
		results: models.map(model => publicSketchfabModel(model, { includeDescription: args.full === true || args.format === 'full' })),
		_models: models,
	}
}

async function handleSketchfabSearch(args = {}) {
	const result = await runSketchfabSearch(args)
	const { _models, ...publicResult } = result
	return {
		...publicResult,
		usage: 'Inspect a sketchfab:// candidate when you need more details, then import it to receive a model3d:// handle for betterpptx.slide.add_model3d.',
	}
}

async function handleSketchfabInspect(args = {}) {
	const model = await findSketchfabModelFromArgs(args)
	const result = {
		provider: 'Sketchfab',
		model: publicSketchfabModel(model, { includeDescription: args.includeDescription !== false }),
		runtime: sketchfabRuntimeConfig(),
	}
	if (args.inspectDownload === true || args.includeDownload === true || args.download === true) {
		const auth = sketchfabAuthFromEnv()
		if (!auth) {
			result.download = {
				status: 'auth-required',
				message: 'Sketchfab download inspection requires the installed Sketchfab service API key.',
			}
		} else {
			const download = await sketchfabFetchJson(`${SKETCHFAB_API_ROOT}/models/${model.uid}/download`, auth, {
				timeoutMs: Number(args.timeoutMs || 30000),
				maxBytes: 1024 * 1024,
			})
			result.download = download.ok
				? { status: 'available', formats: summarizeSketchfabDownloadFormats(download.body) }
				: { status: 'unavailable', httpStatus: download.status, message: download.body?.detail || download.body?.error || download.statusText }
		}
	}
	return result
}

async function handleSketchfabImport(args = {}) {
	const model = await findSketchfabModelFromArgs(args)
	const maxMiB = sketchfabMaxModelMiB(args)
	const maxBytes = Number.isFinite(maxMiB) ? Math.floor(maxMiB * MODEL_BYTES_PER_MIB) : Number.POSITIVE_INFINITY
	const publicModel = publicSketchfabModel(model, { includeDescription: args.includeDescription === true })
	const cacheRoot = sketchfabCacheRoot()
	const manifest = readSketchfabManifest()
	const existing = (Array.isArray(manifest.assets) ? manifest.assets : []).find(asset => asset.uid === model.uid || asset.handle === sketchfabHandleForModel(model))
	if (existing && args.refresh !== true) {
		try {
			const existingPath = resolveSketchfabCachePath(cacheRoot, existing.file)
			if (fsNode.existsSync(existingPath)) {
				return {
					status: 'available',
					provider: 'Sketchfab',
					model: publicModel,
					asset: publicSketchfabImportedAsset(existing, true),
					runtime: sketchfabRuntimeConfig(),
					message: 'Model was already imported; returning the existing model3d handle.',
				}
			}
		} catch (_) {}
	}
	if (model?.isDownloadable !== true) {
		return {
			status: 'not-downloadable',
			provider: 'Sketchfab',
			model: publicModel,
			message: 'This Sketchfab model is not marked downloadable by Sketchfab.',
		}
	}
	if (args.commercialUseOnly !== false && !sketchfabLicenseAllowed(model, args)) {
		return {
			status: 'blocked-by-rights',
			provider: 'Sketchfab',
			model: publicModel,
			licensePolicy: sketchfabLicensePolicy(args),
			message: 'This model does not match the requested commercial-use license policy.',
		}
	}
	const archive = sketchfabModelArchive(model, args.format || args.downloadFormat || 'auto')
	if (archive?.size && Number(archive.size) > maxBytes) {
		return {
			status: 'too-large',
			provider: 'Sketchfab',
			model: publicModel,
			sizePolicy: { policy: normalizeModelSizePolicy(args.sizePolicy), maxModelSizeMb: maxMiB },
			message: 'This model exceeds the configured model size ceiling before download.',
		}
	}
	const auth = sketchfabAuthFromEnv()
	if (!auth) {
		return {
			status: 'auth-required',
			provider: 'Sketchfab',
			model: publicModel,
			runtime: sketchfabRuntimeConfig(auth),
			cloudRun: {
				authentication: 'Configure the Sketchfab API key once as a Cloud Run secret.',
				note: 'Search and metadata inspection work without the key; imports use the installed service API key.',
			},
		}
	}
	const download = await sketchfabFetchJson(`${SKETCHFAB_API_ROOT}/models/${model.uid}/download`, auth, {
		timeoutMs: Number(args.timeoutMs || 30000),
		maxBytes: 1024 * 1024,
	})
	if (!download.ok) {
		return {
			status: 'download-request-failed',
			provider: 'Sketchfab',
			model: publicModel,
			httpStatus: download.status,
			message: download.body?.detail || download.body?.error || download.statusText,
		}
	}
	const selected = selectSketchfabDownloadFormat(download.body, args.downloadFormat || args.format || 'auto', maxBytes)
	if (!selected.ok) {
		return {
			status: selected.code,
			provider: 'Sketchfab',
			model: publicModel,
			download: { formats: summarizeSketchfabDownloadFormats(download.body) },
			sizePolicy: { policy: normalizeModelSizePolicy(args.sizePolicy), maxModelSizeMb: maxMiB },
			message: selected.message,
		}
	}
	const assetDir = path.join(cacheRoot, 'models', String(model.uid || '').toLowerCase())
	const downloadsDir = path.join(assetDir, 'downloads')
	const extractedDir = path.join(assetDir, 'extracted')
	const stem = safeSketchfabFileStem(model)
	const finalGlbPath = path.join(assetDir, `${stem}.glb`)
	await fs.mkdir(assetDir, { recursive: true })
	const fetched = await safeFetchToBuffer(selected.item.url, {
		timeoutMs: Number(args.downloadTimeoutMs || args.timeoutMs || 120000),
		maxBytes,
	})
	if (!fetched.ok) {
		return {
			status: 'download-failed',
			provider: 'Sketchfab',
			model: publicModel,
			httpStatus: fetched.status,
			message: fetched.statusText || 'Sketchfab temporary download URL did not return successfully.',
		}
	}
	if (selected.format === 'glb') {
		await writeBufferFile(finalGlbPath, fetched.buffer)
	} else {
		const zipPath = path.join(downloadsDir, `${stem}-gltf.zip`)
		await writeBufferFile(zipPath, fetched.buffer)
		await fs.rm(extractedDir, { recursive: true, force: true })
		await extractSketchfabZip(zipPath, extractedDir)
		const modelFile = await findFirstModelFile(extractedDir)
		if (!modelFile) {
			return {
				status: 'unsupported-format',
				provider: 'Sketchfab',
				model: publicModel,
				message: 'Downloaded glTF archive did not contain a .glb or .gltf model file.',
			}
		}
		if (/\.glb$/i.test(modelFile)) await fs.copyFile(modelFile, finalGlbPath)
		else {
			if (args.convertGltf === false) {
				return {
					status: 'conversion-required',
					provider: 'Sketchfab',
					model: publicModel,
					message: 'Downloaded asset is glTF; allow conversion to GLB or request format="glb".',
				}
			}
			await convertSketchfabGltfToGlb(modelFile, finalGlbPath)
		}
	}
	const stat = await fs.stat(finalGlbPath)
	if (Number.isFinite(maxBytes) && stat.size > maxBytes) {
		return {
			status: 'too-large-after-conversion',
			provider: 'Sketchfab',
			model: publicModel,
			sizePolicy: { policy: normalizeModelSizePolicy(args.sizePolicy), maxModelSizeMb: maxMiB },
			message: 'The imported GLB exceeds the configured model size ceiling after conversion.',
		}
	}
	const posterPath = args.downloadThumbnail === false ? null : await maybeDownloadSketchfabThumbnail(model, assetDir, Number(args.timeoutMs || 30000))
	const sha256 = await sha256Path(finalGlbPath)
	const importedAt = new Date().toISOString()
	const asset = {
		uid: String(model.uid || '').toLowerCase(),
		handle: sketchfabHandleForModel(model),
		title: model.name || 'Sketchfab model',
		name: model.name || 'Sketchfab model',
		file: sketchfabRelativePath(cacheRoot, finalGlbPath),
		preview: posterPath ? sketchfabRelativePath(cacheRoot, posterPath) : undefined,
		sourceUrl: model.viewerUrl || `https://sketchfab.com/3d-models/${model.uid}`,
		rights: sketchfabRights(model),
		attribution: sketchfabAttribution(model),
		categories: Array.isArray(model.categories) ? model.categories.map(item => item?.name || item?.slug).filter(Boolean) : [],
		keywords: Array.isArray(model.tags) ? model.tags.map(item => item?.name || item?.slug || item).filter(Boolean).slice(0, 48) : [],
		importedAt,
		selectedFormat: {
			format: selected.format,
			sizeMiB: selected.size ? Math.round((selected.size / MODEL_BYTES_PER_MIB) * 100) / 100 : undefined,
		},
		bytes: stat.size,
		sizeMiB: Math.round((stat.size / MODEL_BYTES_PER_MIB) * 100) / 100,
		sizeTier: modelSizeTier(stat.size),
		sha256,
	}
	await upsertSketchfabManifestAsset(asset)
	return {
		status: 'imported',
		provider: 'Sketchfab',
		model: publicModel,
		asset: publicSketchfabImportedAsset(asset, true),
		selectedFormat: asset.selectedFormat,
		runtime: sketchfabRuntimeConfig(auth),
		usage: 'Use asset.addModel3DOptions with betterpptx.slide.add_model3d. Keep the returned attribution in deck notes or source credits when the rights require credit.',
	}
}

function readJsonFileSync(filePath, fallback = null) {
	try { return JSON.parse(fsNode.readFileSync(filePath, 'utf8')) }
	catch { return fallback }
}

function relFromCwd(filePath) {
	return path.relative(process.cwd(), filePath).replace(/\\/g, '/')
}

function compactGlbMetadata(metadata) {
	if (!metadata || typeof metadata !== 'object') return undefined
	const out = {
		generator: metadata.asset?.generator,
		version: metadata.asset?.version,
		nodes: metadata.nodes_count,
		meshes: metadata.meshes_count,
		materials: metadata.materials_count,
		textures: metadata.textures_count,
		animations: metadata.animations_count,
		scenes: metadata.scenes_count,
		validGlbHeader: metadata.valid_glb_header,
	}
	return Object.fromEntries(Object.entries(out).filter(([, value]) => value !== undefined && value !== null))
}

function makeCatalogSearchText(item) {
	return [
		item.title,
		item.name,
		item.role,
		item.source,
		item.sourceLabel,
		item.sourceCategory,
		item.usage,
		item.license,
		item.provenance,
		item.attribution,
		item.handle,
		...(item.tags || []),
		...(item.aliases || []),
		...(item.categories || []),
	].filter(Boolean).join(' ').toLowerCase()
}

function scoreCatalogAsset(item, terms, queryPhrase) {
	if (!terms.length) {
		const titleQuality = /[a-z0-9]{2,}/i.test(String(item.title || item.name || '')) ? 6 : -20
		return { matchScore: 1, score: Number(item.sourcePriority || 0) + titleQuality }
	}
	const semanticTerms = terms.filter(term => !CATALOG_GENERIC_SEARCH_TERMS.has(term))
	const scoringTerms = semanticTerms.length ? semanticTerms : terms
	const title = String(item.title || item.name || '').toLowerCase()
	const category = String(item.sourceCategory || '').toLowerCase()
	const tags = (item.tags || []).map(tag => String(tag).toLowerCase())
	const aliases = (item.aliases || []).map(alias => String(alias).toLowerCase())
	const haystack = item.searchText || makeCatalogSearchText(item)
	let matchScore = 0
	if (queryPhrase && title.includes(queryPhrase)) matchScore += 120
	if (queryPhrase && aliases.some(alias => alias.includes(queryPhrase))) matchScore += 90
	if (queryPhrase && tags.some(tag => tag.includes(queryPhrase))) matchScore += 70
	for (const term of scoringTerms) {
		if (title === term) matchScore += 100
		else if (title.split(/\s+/).includes(term)) matchScore += 70
		else if (title.includes(term)) matchScore += 45
		if (category.includes(term)) matchScore += 34
		if (aliases.some(alias => alias.includes(term))) matchScore += 30
		if (tags.some(tag => tag === term)) matchScore += 28
		else if (tags.some(tag => tag.includes(term))) matchScore += 18
		if (haystack.includes(term)) matchScore += 8
	}
	return { matchScore, score: matchScore * 100 + Number(item.sourcePriority || 0) }
}

function buildMicrosoftStock3DAssets() {
	const recordsDir = path.resolve(process.cwd(), 'outputs', 'microsoft_stock3d_library', 'records')
	if (!fsNode.existsSync(recordsDir)) return []
	const bySha = new Map()
	const recordFiles = fsNode.readdirSync(recordsDir)
		.filter(file => file.toLowerCase().endsWith('.json'))
		.sort((a, b) => a.localeCompare(b))
	for (const file of recordFiles) {
		const rows = readJsonFileSync(path.join(recordsDir, file), [])
		if (!Array.isArray(rows)) continue
		for (const record of rows) {
			const glbPath = path.resolve(String(record?.glb || ''))
			if (!record?.title || !fsNode.existsSync(glbPath)) continue
			const sha = String(record.sha256 || '').trim()
			const key = sha || glbPath.toLowerCase()
			const tags = uniqueAssetStrings([
				'3d', 'model', 'glb', 'microsoft', 'powerpoint', 'office', 'stock', 'native-powerpoint', 'flagship',
				record?.category,
				record?.category_slug,
				record?.title,
				record?.tags?.tokens,
				record?.tags?.navigation_tags,
				record?.tags?.colors,
				record?.tags?.animated ? ['animated', 'motion'] : ['static'],
				record?.glb_metadata?.nodes_names,
			]).map(tag => tag.toLowerCase().replace(/\s+/g, '-'))
			const current = bySha.get(key)
			const category = String(record.category || record.category_slug || 'Microsoft Stock 3D')
			const title = String(record.title)
			if (current) {
				current.categories = uniqueAssetStrings([current.categories, category])
				current.aliases = uniqueAssetStrings([current.aliases, title])
				current.tags = uniqueAssetStrings([current.tags, tags])
				current.duplicateCount += 1
				current.rawRecordCount += 1
				current.alsoAppearsIn = current.categories.filter(item => item !== current.sourceCategory)
				current.searchText = makeCatalogSearchText(current)
				continue
			}
			const titleSlug = safeAssetHandlePart(record.title_slug || title)
			const shaPart = sha ? sha.slice(0, 16) : safeAssetHandlePart(path.basename(glbPath, '.glb'))
			const item = {
				kind: 'model3d',
				source: MICROSOFT_STOCK3D_SOURCE,
				sourceKey: MICROSOFT_STOCK3D_SOURCE,
				sourceLabel: 'Microsoft PowerPoint Stock 3D',
				sourcePriority: 100,
				role: 'Flagship native Microsoft PowerPoint Stock 3D model',
				handle: `model3d://microsoft-stock/${shaPart}/${titleSlug}`,
				title,
				name: `${title}.glb`,
				sourceCategory: category,
				categories: [category],
				aliases: [title],
				tags,
				usage: `Primary choice for native PowerPoint 3D: use for ${category.toLowerCase()} scenes, quick visual embellishment, and presentation-native model3d objects when the topic matches "${title}".`,
				license: String(record.license_scope_note || 'Cached for reuse inside Microsoft 365/PowerPoint files.'),
				provenance: String(record.provenance || 'Inserted via PowerPoint Microsoft Stock 3D Models picker, then extracted from PPTX package.'),
				nativePowerPointStock: true,
				officeUseOnly: record.office_use_only !== false,
				animated: !!record?.tags?.animated || Number(record?.glb_metadata?.animations_count || 0) > 0,
				path: glbPath,
				modelAsset: glbPath,
				rel: relFromCwd(glbPath),
				addModel3DOptions: { modelAsset: glbPath, nativeOnly: true },
				sha256: sha || undefined,
				dedupeKey: key,
				duplicateCount: 1,
				rawRecordCount: 1,
				bytes: Number(record.bytes || statSummary(glbPath).bytes || 0),
				glb: compactGlbMetadata(record.glb_metadata),
				catalog: {
					resultIndex: record.catalog_result_index,
					visibleResultCount: record.visible_result_count,
					app: record.catalog_context?.app,
					build: record.catalog_context?.build,
					market: record.catalog_context?.mkt,
				},
				...statSummary(glbPath),
			}
			item.searchText = makeCatalogSearchText(item)
			bySha.set(key, item)
		}
	}
	return [...bySha.values()]
}

function buildIconScoutAssets() {
	const root = path.resolve(process.cwd(), 'demos', 'betterpptx-private-assets', 'iconscout')
	const manifest = readJsonFileSync(path.join(root, 'manifest.json'), null)
	if (!Array.isArray(manifest?.assets)) return []
	const vendor = manifest.vendor || 'iconscout'
	return manifest.assets.map(asset => {
		const filePath = path.resolve(root, String(asset.file || ''))
		if (!asset?.handle || !fsNode.existsSync(filePath)) return null
		const isModel = asset.category === 'models3d' || String(asset.format || '').toLowerCase() === 'glb'
		const title = String(asset.title || asset.name || titleFromAssetPath(asset.file || asset.handle, 'IconScout asset'))
		const previewPath = asset.preview ? path.resolve(root, String(asset.preview)) : undefined
		const tags = uniqueAssetStrings([
			isModel ? ['3d', 'model', 'glb'] : ['icon', 'image', 'png'],
			'iconscout',
			'private',
			asset.asset,
			asset.format,
			asset.tags,
			title,
		]).map(tag => tag.toLowerCase().replace(/\s+/g, '-'))
		const item = {
			kind: isModel ? 'model3d' : 'icon',
			source: ICONSCOUT_SOURCE,
			sourceKey: ICONSCOUT_SOURCE,
			sourceLabel: 'Private IconScout cache',
			sourcePriority: isModel ? 82 : 78,
			role: isModel ? 'Private IconScout quick-embellishment 3D model' : 'Private IconScout navigation and embellishment icon',
			handle: String(asset.handle),
			title,
			name: path.basename(filePath),
			sourceCategory: isModel ? 'IconScout 3D' : 'IconScout icons',
			tags,
			usage: String(asset.usage || 'Use for quick navigation, UI metaphor, and visual embellishment when the semantic tags match the slide content. Verify item-level rights before redistribution.'),
			license: String(asset.license || 'IconScout asset license. Verify item-level rights before redistribution.'),
			provenance: `${vendor} local private cache`,
			sourceUrl: asset.sourceUrl || undefined,
			privateAsset: true,
			path: filePath,
			rel: relFromCwd(filePath),
			preview: previewPath && fsNode.existsSync(previewPath) ? previewPath : undefined,
			...(isModel ? {
				modelAsset: filePath,
				addModel3DOptions: { modelAsset: filePath, nativeOnly: true },
			} : {
				imageAsset: filePath,
				addImageOptions: { path: filePath },
			}),
			...statSummary(filePath),
		}
		item.searchText = makeCatalogSearchText(item)
		return item
	}).filter(Boolean)
}

function buildToxSamAssets() {
	const root = path.resolve(process.cwd(), 'demos', 'betterpptx-online-assets')
	const manifest = readJsonFileSync(path.join(root, 'manifest.json'), null)
	if (!Array.isArray(manifest?.assets)) return []
	return manifest.assets.map(asset => {
		const sourceKey = String(asset.sourceKey || '')
		if (![OPEN_SOURCE_3D_SOURCE_KEY, OPEN_SOURCE_3D_QUALITY_SOURCE_KEY].includes(sourceKey)) return null
		if (asset.category !== 'models3d' || !asset.file) return null
		const filePath = path.resolve(root, String(asset.file))
		if (!fsNode.existsSync(filePath)) return null
		const previewPath = asset.preview ? path.resolve(root, String(asset.preview)) : undefined
		const isQuality = sourceKey === OPEN_SOURCE_3D_QUALITY_SOURCE_KEY
		const title = String(asset.upstreamAssetName || asset.title || asset.altText || titleFromAssetPath(asset.file, 'ToxSam open-source model'))
		const source = isQuality ? TOXSAM_QUALITY_SOURCE : TOXSAM_SOURCE
		const tags = uniqueAssetStrings([
			'3d', 'model', 'glb', 'cc0', 'open-source', 'toxsam', 'polygonal-mind',
			isQuality ? ['presentation-optimized', 'quality'] : [],
			asset.projectName,
			asset.projectId,
			asset.tags,
			title,
		]).map(tag => tag.toLowerCase().replace(/\s+/g, '-'))
		const item = {
			kind: 'model3d',
			source,
			sourceFamily: TOXSAM_SOURCE,
			sourceKey: source,
			sourceLabel: isQuality ? 'ToxSam open-source 3D quality derivative' : 'ToxSam open-source 3D assets',
			sourcePriority: isQuality ? 58 : 46,
			role: isQuality ? 'Presentation-optimized CC0 contextual 3D model' : 'Relevant CC0 contextual 3D model',
			handle: String(asset.handle || `model3d://open-3d/${safeAssetHandlePart(asset.projectId || 'project')}/${safeAssetHandlePart(title)}`),
			title,
			name: path.basename(filePath),
			sourceCategory: String(asset.projectName || asset.projectId || 'ToxSam open-source 3D'),
			tags,
			usage: String(asset.usage || 'Use when Microsoft Stock 3D and IconScout do not provide a relevant object, or when a CC0 contextual/environment model is useful.'),
			license: String(asset.license || 'CC0'),
			provenance: 'Mirrored from toxsam/open-source-3D-assets and related CC0 repositories.',
			sourceUrl: asset.sourceUrl || undefined,
			attribution: asset.attribution || 'Polygonal Mind',
			cc0: String(asset.license || '').toUpperCase() === 'CC0',
			path: filePath,
			modelAsset: filePath,
			rel: relFromCwd(filePath),
			preview: previewPath && fsNode.existsSync(previewPath) ? previewPath : undefined,
			posterAsset: previewPath && fsNode.existsSync(previewPath) ? previewPath : undefined,
			addModel3DOptions: {
				modelAsset: filePath,
				...(previewPath && fsNode.existsSync(previewPath) ? { posterAsset: previewPath } : { nativeOnly: true }),
			},
			project: {
				id: asset.projectId || undefined,
				name: asset.projectName || undefined,
			},
			...statSummary(filePath),
		}
		item.searchText = makeCatalogSearchText(item)
		return item
	}).filter(Boolean)
}

function buildDirectoryAssetItems(source) {
	const absRoot = path.resolve(process.cwd(), source.root)
	const items = []
	function walk(dir) {
		let entries
		try { entries = fsNode.readdirSync(dir, { withFileTypes: true }) } catch { return }
		for (const entry of entries) {
			const full = path.join(dir, entry.name)
			if (entry.isDirectory()) {
				walk(full)
				continue
			}
			if (!source.pattern.test(entry.name)) continue
			const title = titleFromAssetPath(entry.name)
			const rel = relFromCwd(full)
			const item = {
				kind: source.kind,
				role: source.role,
				source: source.source,
				sourceKey: source.source,
				sourceLabel: source.sourceLabel,
				sourcePriority: source.sourcePriority,
				handle: source.kind === 'model3d' ? `model3d://${source.source}/${safeAssetHandlePart(path.basename(entry.name, path.extname(entry.name)))}` : undefined,
				title,
				name: entry.name,
				sourceCategory: source.sourceLabel,
				tags: uniqueAssetStrings([source.source, source.kind, source.role, title, path.dirname(rel).split(/[\\/]/)]).map(tag => tag.toLowerCase().replace(/\s+/g, '-')),
				usage: source.kind === 'model3d' ? 'Use as a maintained local model when it matches the requested narrative or for test/reference scenes.' : 'Use as a local design support asset when the query matches.',
				path: full,
				rel,
				...(source.kind === 'model3d' ? { modelAsset: full, addModel3DOptions: { modelAsset: full, nativeOnly: true } } : {}),
				...statSummary(full),
			}
			item.searchText = makeCatalogSearchText(item)
			items.push(item)
		}
	}
	walk(absRoot)
	return items
}

function loadUnifiedAssetCatalog() {
	return [
		...buildMicrosoftStock3DAssets(),
		...buildIconScoutAssets(),
		...buildToxSamAssets(),
		...buildSketchfabImportedAssets(),
		...ASSET_CATALOG.flatMap(buildDirectoryAssetItems),
	]
}

function listAssetFiles({ kind, query, useCase, source, maxResults = 60, includeDuplicates = false, preferNative = true, sizePolicy = 'standard', maxModelSizeMb, maxGlbSizeMb, maxSizeMb } = {}) {
	const normalizedKind = normalizeAssetKind(kind)
	const q = String(query || '').trim().toLowerCase()
	const contextText = [query, useCase].filter(Boolean).join(' ')
	const terms = assetQueryTerms(contextText)
	const sourceFilter = normalizeCatalogSource(source)
	const limit = Math.max(1, Math.min(500, Number(maxResults) || 60))
	const normalizedSizePolicy = normalizeModelSizePolicy(sizePolicy)
	const explicitMax = Number(maxModelSizeMb ?? maxGlbSizeMb ?? maxSizeMb)
	const maxModelSize = Number.isFinite(explicitMax) && explicitMax > 0
		? explicitMax
		: MODEL_SIZE_POLICY_LIMITS_MB[normalizedSizePolicy]
	const groups = {}
	const scored = []
	const fallback = []
	let excludedBySize = 0
	for (const item of loadUnifiedAssetCatalog()) {
		if (normalizedKind && item.kind !== normalizedKind) continue
		if (!catalogSourceMatches(item, sourceFilter)) continue
		if (!includeDuplicates && item.duplicateOf) continue
		if (item.kind === 'model3d' && Number.isFinite(maxModelSize)) {
			const mib = assetModelSizeMiB(item)
			if (mib && mib > maxModelSize) {
				excludedBySize += 1
				continue
			}
		}
		const groupKey = item.source || item.sourceKey || 'local'
		if (!groups[groupKey]) groups[groupKey] = { source: groupKey, label: item.sourceLabel || groupKey, count: 0, matches: 0, priority: item.sourcePriority || 0 }
		groups[groupKey].count += 1
		const scoredItem = { ...item }
		if (preferNative !== false && scoredItem.source === MICROSOFT_STOCK3D_SOURCE) scoredItem.sourcePriority = Math.max(Number(scoredItem.sourcePriority || 0), 100)
		const score = scoreCatalogAsset(scoredItem, terms, q)
		scoredItem.matchScore = score.matchScore
		scoredItem.score = score.score + modelSizeRankAdjustment(scoredItem)
		fallback.push(scoredItem)
		if (terms.length && score.matchScore <= 0) continue
		groups[groupKey].matches += 1
		scored.push(scoredItem)
	}
	const pool = terms.length && scored.length === 0 ? fallback : scored
	const fallbackUsed = !!(terms.length && scored.length === 0 && fallback.length)
	const sortedPool = pool
		.sort((a, b) => (b.score || 0) - (a.score || 0) || String(a.title || a.name || '').localeCompare(String(b.title || b.name || '')))
	const dedupedPool = includeDuplicates ? sortedPool : []
	if (!includeDuplicates) {
		const seen = new Map()
		for (const item of sortedPool) {
			const semanticKey = item.dedupeKey || `${item.source || 'local'}|${item.kind}|${safeAssetHandlePart(item.title || item.name)}`
			const existing = seen.get(semanticKey)
			if (existing) {
				existing.semanticDuplicateCount = Number(existing.semanticDuplicateCount || 1) + 1
				continue
			}
			item.semanticDuplicateCount = 1
			seen.set(semanticKey, item)
			dedupedPool.push(item)
		}
	}
	const finalPool = includeDuplicates ? sortedPool : dedupedPool
	const finalResults = finalPool.slice(0, limit)
	return {
		query: q || null,
		useCase: useCase || null,
		kind: normalizedKind || null,
		source: sourceFilter || null,
		count: finalResults.length,
		truncated: finalPool.length > finalResults.length,
		fallbackUsed,
		sourcePolicy: {
			primary: MICROSOFT_STOCK3D_SOURCE,
			secondary: ICONSCOUT_SOURCE,
			contextualFallback: TOXSAM_SOURCE,
			rationale: 'Prefer Microsoft PowerPoint Stock 3D when semantically relevant because it is native to PowerPoint. Use IconScout for quick navigation and embellishment. Use ToxSam/CC0 contextual models when the content match is stronger or licensing needs CC0.',
		},
		sizePolicy: {
			policy: normalizedSizePolicy,
			maxModelSizeMb: Number.isFinite(maxModelSize) ? maxModelSize : null,
			excludedBySize,
			rationale: 'Default model3d catalog results use low-size GLBs so embedded PowerPoint files stay portable. Use sizePolicy="large-ok" or "unrestricted" only when detail matters more than file size.',
		},
		groups,
		results: finalResults,
		assets: finalResults,
		recommendation: 'Choose the highest-scoring semantically relevant low-size result. For model3d results, pass addModel3DOptions or modelAsset to slide.add_model3d. Microsoft Stock 3D entries are de-duplicated by SHA-256 and keep their category aliases for search.',
	}
}

function publicCatalogEntry(item) {
	const entry = {
		kind: item.kind,
		handle: item.handle,
		title: item.title || item.name,
		category: item.sourceCategory || item.kind,
		usage: item.usage,
	}
	if (item.kind === 'model3d') {
		const sizeMiB = assetModelSizeMiB(item)
		entry.model3d = {
			handle: item.handle,
			posterAvailable: !!(item.posterAsset || item.preview),
			animated: !!item.animated,
			sizeMiB: sizeMiB ? Math.round(sizeMiB * 100) / 100 : undefined,
			sizeTier: item.sizeTier || (item.bytes ? modelSizeTier(item.bytes) : undefined),
		}
		entry.addModel3DOptions = {
			modelAsset: item.handle,
			nativeOnly: true,
		}
	}
	return entry
}

function publicAssetCatalogResult(result) {
	return {
		query: result.query,
		useCase: result.useCase,
		kind: result.kind,
		count: result.count,
		truncated: result.truncated,
		fallbackUsed: result.fallbackUsed,
		sizePolicy: result.sizePolicy,
		assets: (result.assets || []).map(publicCatalogEntry),
		results: (result.results || []).map(publicCatalogEntry),
		recommendation: 'Choose a semantically relevant low-size handle. For 3D, pass addModel3DOptions to betterpptx.slide.add_model3d or set options.modelAsset to the model3d:// handle. Use sizePolicy="large-ok" or "unrestricted" only when detail matters more than PPTX size.',
	}
}

async function handleAssetCatalog(args = {}) {
	const result = listAssetFiles(args)
	return isPublicBlackBoxMode() ? publicAssetCatalogResult(result) : result
}

function cleanHex(value, fallback) {
	const s = String(value || '').replace(/^#/, '').trim()
	return /^[0-9a-f]{6}$/i.test(s) ? s.toUpperCase() : fallback
}

function rgbFactor(hex, alpha = 1) {
	const h = cleanHex(hex, 'FFFFFF')
	return [
		parseInt(h.slice(0, 2), 16) / 255,
		parseInt(h.slice(2, 4), 16) / 255,
		parseInt(h.slice(4, 6), 16) / 255,
		Math.max(0, Math.min(1, Number(alpha) || 1)),
	]
}

function safeStem(text, fallback = 'contextual-model') {
	const s = String(text || fallback).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
	return s || fallback
}

function inferIconKind(context, requested) {
	if (requested && requested !== 'auto') return requested
	const text = String(context || '').toLowerCase()
	if (/(arrow|navigation|navigate|next|previous|back|forward|route|direction|wayfind|wayfinding|flow|path|redirect|morph)/.test(text)) return 'arrow'
	if (/(interface|ui|ux|screen|window|browser|dashboard|app|button|form|cursor|click|mobile|web)/.test(text)) return 'interface'
	if (/(team|group|collaborat|workshop|meeting|audience|people)/.test(text)) return 'team'
	if (/(person|human|presenter|expert|advisor|operator|employee|leader|customer|stakeholder)/.test(text)) return 'person'
	if (/(profile|avatar|user|account|identity)/.test(text)) return 'user'
	if (/(robot|agent|assistant|automation|ai worker|copilot)/.test(text)) return 'robot'
	if (/(device|laptop|tablet|phone|terminal|console|hardware|machine)/.test(text)) return 'device'
	if (/(package|parcel|box|shipment|delivery|container|cube object|product box)/.test(text)) return 'package'
	if (/(product|artifact|object|prop|tool|module|component|item)/.test(text)) return 'product'
	if (/(building|office|factory|city|environment|scene|landscape|room|space|world)/.test(text)) return 'scene'
	if (/(vehicle|car|truck|train|mobility|transport|fleet)/.test(text)) return 'vehicle'
	if (/(award|trophy|winner|goal|achievement|success|milestone)/.test(text)) return 'trophy'
	if (/(bell|notification|alert|alarm|reminder)/.test(text)) return 'bell'
	if (/(toggle|switch|on\/off|setting|control|preference)/.test(text)) return 'toggle'
	if (/(cloud|upload|download|sync|backup|deploy)/.test(text)) return 'cloud'
	if (/(security|secure|trust|risk|compliance|guard|protect|privacy|auth)/.test(text)) return 'shield'
	if (/(data|database|warehouse|layer|stack|platform|pipeline|storage)/.test(text)) return 'stack'
	if (/(signal|launch|beacon|radar|broadcast|growth|momentum|attention)/.test(text)) return 'beacon'
	if (/(idea|creative|spark|innovation|magic|wow|epoustoufl|extraordinary)/.test(text)) return 'spark'
	if (/(strategy|architecture|system|decision|transformation|design|model)/.test(text)) return 'prism'
	return 'prism'
}

function iconKindReason(kind) {
	return {
		arrow: 'navigation/direction or reusable flow state',
		interface: 'user interface/screen interaction',
		user: 'profile/identity or audience',
		person: 'a human role in the story',
		team: 'multiple people or collaboration',
		robot: 'AI agent or automation worker',
		device: 'a physical/digital device object',
		package: 'delivery, container, or packaged offering',
		product: 'a generic reusable product/object prop',
		scene: 'environment, place, or physical context',
		vehicle: 'movement, transport, or operational fleet',
		trophy: 'achievement, milestone, or goal',
		toggle: 'controls/settings state',
		bell: 'notifications or alerting',
		cloud: 'cloud transfer/synchronization',
		shield: 'trust/protection',
		stack: 'data/layers',
		beacon: 'signal/momentum',
		spark: 'innovation/impact',
		prism: 'strategy/architecture',
	}[kind] || 'the requested narrative motif'
}

const PREMIUM_MODEL3D_PAIRS = {
	arrow: { stem: 'growth-arrow', profile: 'reusable navigation object' },
	interface: { stem: 'curved-cylinder', profile: 'interface/control object' },
	user: { stem: 'blue-presenter', profile: 'human role object' },
	person: { stem: 'blue-presenter', profile: 'human role object' },
	team: { stem: 'gold-presenter', profile: 'collaboration/leadership object' },
	robot: { stem: 'blue-presenter', profile: 'agent/assistant object' },
	device: { stem: 'curved-cylinder', profile: 'device/control object' },
	product: { stem: 'orange-dome', profile: 'product/display object' },
	scene: { stem: 'ribbon-wave', profile: 'environment/context object' },
	trophy: { stem: 'gold-presenter', profile: 'milestone/achievement object' },
	toggle: { stem: 'magenta-cylinder', profile: 'state/control object' },
	bell: { stem: 'orange-dome', profile: 'attention/signal object' },
	cloud: { stem: 'ribbon-wave', profile: 'transfer/flow object' },
	shield: { stem: 'orbit-torus', profile: 'trust/protection object' },
	stack: { stem: 'magenta-cylinder', profile: 'data/layer object' },
	beacon: { stem: 'orange-dome', profile: 'signal/momentum object' },
	spark: { stem: 'ribbon-wave', profile: 'innovation/impact object' },
	prism: { stem: 'orbit-torus', profile: 'strategy/architecture object' },
}

const ONLINE_MODEL3D_PAIRS = {
	vehicle: { stem: 'ToyCar', profile: 'vehicle/transport object', posterExt: '.jpg' },
}

const OPEN_SOURCE_3D_REGISTRY_BASE = 'https://raw.githubusercontent.com/ToxSam/open-source-3D-assets/main/data/'
const OPEN_SOURCE_3D_SOURCE_KEY = 'open-source-3d-assets'
const OPEN_SOURCE_3D_QUALITY_SOURCE_KEY = 'open-source-3d-quality'
let openSource3DAssetCache = null

function wordsFromText(text) {
	return String(text || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.split(/\s+/)
		.filter(w => w.length > 2)
}

function openSourceKindTerms(kind) {
	return {
		arrow: ['arrow', 'sign', 'direction', 'route', 'marker', 'pointer'],
		interface: ['computer', 'screen', 'monitor', 'panel', 'terminal', 'keyboard', 'console', 'ui'],
		user: ['person', 'avatar', 'character', 'creature', 'presenter'],
		person: ['person', 'avatar', 'character', 'creature', 'presenter'],
		team: ['avatar', 'character', 'creature', 'group', 'people'],
		robot: ['robot', 'computer', 'terminal', 'console', 'machine'],
		device: ['computer', 'screen', 'monitor', 'terminal', 'console', 'device', 'machine'],
		package: ['box', 'crate', 'barrel', 'chest', 'container', 'package'],
		product: ['object', 'prop', 'display', 'booth', 'stand', 'furniture'],
		scene: ['building', 'environment', 'station', 'landscape', 'architecture', 'ruin', 'booth', 'shop'],
		vehicle: ['vehicle', 'transport', 'airship', 'train', 'ship', 'car', 'cart', 'wagon'],
		trophy: ['statue', 'monument', 'artifact', 'display', 'award'],
		toggle: ['switch', 'button', 'panel', 'control', 'console'],
		bell: ['lamp', 'signal', 'light', 'beacon', 'sign'],
		cloud: ['airship', 'aerial', 'floating', 'sky', 'transport'],
		shield: ['shield', 'guard', 'gate', 'door', 'security'],
		stack: ['stack', 'crate', 'box', 'building', 'tower', 'layer'],
		beacon: ['beacon', 'lamp', 'signal', 'light', 'tower'],
		spark: ['crystal', 'light', 'neon', 'magic', 'artifact'],
		prism: ['crystal', 'artifact', 'architecture', 'monument', 'tower'],
	}[kind] || [kind]
}

async function fetchJsonWithTimeout(url, timeoutMs = 12000) {
	return safeFetchJson(url, { timeoutMs, maxBytes: 2 * 1024 * 1024 })
}

async function fetchBufferWithLimit(url, { maxBytes = 8 * 1024 * 1024, timeoutMs = 30000, requireImage = false } = {}) {
	const res = await safeFetchToBuffer(url, { maxBytes, timeoutMs, requireImage })
	if (!res.ok) throw new Error(`HTTP ${res.status}`)
	return {
		buffer: res.buffer,
		contentType: res.headers['content-type'] || '',
		url: res.url,
	}
}

function fileExtFromUrl(url, contentType, fallback = '.bin') {
	const m = String(url || '').toLowerCase().match(/\.(glb|gltf|png|jpg|jpeg|webp)(?:[?#]|$)/)
	if (m) return m[1] === 'jpeg' ? '.jpg' : `.${m[1]}`
	if (/png/i.test(contentType)) return '.png'
	if (/jpe?g/i.test(contentType)) return '.jpg'
	if (/webp/i.test(contentType)) return '.webp'
	if (/gltf|glb/i.test(contentType)) return '.glb'
	return fallback
}

function assetAttributeText(asset) {
	const attrs = asset?.metadata?.attributes || []
	const attrText = attrs.map(a => `${a?.trait_type || ''} ${a?.value || ''}`).join(' ')
	const manifestText = [
		asset?.projectName,
		asset?.upstreamAssetName,
		asset?.altText,
		asset?.usage,
		...(Array.isArray(asset?.tags) ? asset.tags : []),
	].filter(Boolean).join(' ')
	return `${attrText} ${manifestText}`.trim()
}

function loadLocalOpenSource3DAssets() {
	const manifestPath = path.resolve(process.cwd(), 'demos', 'betterpptx-online-assets', 'manifest.json')
	let manifest = null
	try { manifest = JSON.parse(fsNode.readFileSync(manifestPath, 'utf8')) } catch { return [] }
	const root = path.dirname(manifestPath)
	if (!Array.isArray(manifest?.assets)) return []
	const allowedSourceKeys = new Set([OPEN_SOURCE_3D_QUALITY_SOURCE_KEY, OPEN_SOURCE_3D_SOURCE_KEY])
	return manifest.assets
		.filter(asset => allowedSourceKeys.has(asset?.sourceKey) && asset?.category === 'models3d' && asset?.file && asset?.preview)
		.map(asset => {
			const isQualityDerivative = asset.sourceKey === OPEN_SOURCE_3D_QUALITY_SOURCE_KEY
			const isVerifiedQualityDerivative = isQualityDerivative && asset?.derivative?.multiAngleVerified === true
			if (isQualityDerivative && !isVerifiedQualityDerivative) return null
			const modelPath = path.resolve(root, String(asset.file))
			const posterPath = path.resolve(root, String(asset.preview))
			if (!fsNode.existsSync(modelPath) || !fsNode.existsSync(posterPath)) return null
			const posterPaths = {}
			if (asset.previews && typeof asset.previews === 'object') {
				for (const [pose, rel] of Object.entries(asset.previews)) {
					const candidate = path.resolve(root, String(rel))
					if (fsNode.existsSync(candidate)) posterPaths[pose] = candidate
				}
			}
			return {
				...asset,
				is_public: true,
				format: 'GLB',
				name: asset.upstreamAssetName || asset.altText || asset.handle,
				project_id: asset.projectId || '',
				description: asset.usage || asset.altText || '',
				modelPath,
				posterPath,
				posterPaths,
				qualityVerified: isVerifiedQualityDerivative,
				qualityBoost: isVerifiedQualityDerivative ? 28 : 0,
				metadata: {
					file_size: Number(asset.bytes || fsNode.statSync(modelPath).size || 0),
					attributes: Array.isArray(asset.tags) ? asset.tags.map(tag => ({ trait_type: 'Tag', value: tag })) : [],
				},
			}
		})
		.filter(Boolean)
}

async function loadRemoteOpenSource3DAssets() {
	const loaded = []
	const projects = await fetchJsonWithTimeout(`${OPEN_SOURCE_3D_REGISTRY_BASE}projects.json`)
	for (const project of Array.isArray(projects) ? projects : []) {
		if (!project?.is_public || String(project.license || '').toUpperCase() !== 'CC0') continue
		const file = project.asset_data_file || `assets/${project.id}.json`
		try {
			const projectAssets = await fetchJsonWithTimeout(`${OPEN_SOURCE_3D_REGISTRY_BASE}${file}`)
			if (Array.isArray(projectAssets)) {
				for (const asset of projectAssets) loaded.push({
					...asset,
					projectName: project.name,
					attribution: project.creator_id,
				})
			}
		} catch (_) {
			// The registry is an optional quality source. Network failures should fall back cleanly.
		}
	}
	return loaded
}

async function loadOpenSource3DAssets({ preferLocal = true } = {}) {
	if (openSource3DAssetCache) return openSource3DAssetCache
	const local = preferLocal ? loadLocalOpenSource3DAssets() : []
	const loaded = local.length ? local : await loadRemoteOpenSource3DAssets()
	openSource3DAssetCache = loaded.filter(asset => asset?.is_public && /glb/i.test(asset?.format || '') && asset?.model_file_url)
	if (!openSource3DAssetCache.length && local.length) {
		openSource3DAssetCache = local
	} else if (local.length) {
		openSource3DAssetCache = local
	}
	return openSource3DAssetCache
}

function scoreOpenSourceAsset(asset, kind, context) {
	const contextWords = new Set(wordsFromText(context))
	const kindTerms = new Set(openSourceKindTerms(kind).flatMap(wordsFromText))
	const haystack = wordsFromText(`${asset.name || ''} ${asset.description || ''} ${asset.project_id || ''} ${assetAttributeText(asset)}`)
	let score = 0
	for (const word of haystack) {
		if (contextWords.has(word)) score += 3
		if (kindTerms.has(word)) score += 5
	}
	for (const attr of asset?.metadata?.attributes || []) {
		const t = String(attr?.trait_type || '').toLowerCase()
		const v = String(attr?.value || '').toLowerCase()
		if (t === 'category' && kindTerms.has(v)) score += 12
		if ((t === 'type' || t === 'function' || t === 'theme') && [...kindTerms].some(term => v.includes(term))) score += 7
	}
	if (/thumbnail|preview|poster/i.test(asset.thumbnail_url || asset.posterPath || asset.preview || '')) score += 2
	score += Number(asset.qualityBoost || 0)
	return score
}

async function resolveOpenSourceModel3DAsset(kind, args = {}) {
	const source = String(args.assetSource || args.source || 'auto').toLowerCase()
	const autoCanUseLibrary = source === 'auto' && !PREMIUM_MODEL3D_PAIRS[kind] && !ONLINE_MODEL3D_PAIRS[kind]
	if (!autoCanUseLibrary && !['open-source', 'opensource', 'external', 'cc0'].includes(source)) return null
	const maxAssetBytes = Math.max(128 * 1024, Math.min(12 * 1024 * 1024, Number(args.maxAssetBytes || (args.qualityTarget === 'hero' ? 8 * 1024 * 1024 : 3 * 1024 * 1024))))
	const candidates = await loadOpenSource3DAssets()
	const context = args.context || args.prompt || args.narration || ''
	let best = null
	let bestScore = -Infinity
	for (const asset of candidates) {
		const size = Number(asset?.metadata?.file_size || 0)
		if (size && size > maxAssetBytes) continue
		if (!asset.thumbnail_url && !asset.posterPath && !asset.preview) continue
		const score = scoreOpenSourceAsset(asset, kind, context)
		if (score > bestScore) { best = asset; bestScore = score }
	}
	if (!best || bestScore <= 0) return null
	return {
		asset: best,
		score: bestScore,
		maxAssetBytes,
		profile: `${kind} open-source contextual object`,
		tier: best.sourceKey === OPEN_SOURCE_3D_QUALITY_SOURCE_KEY && best.qualityVerified ? 'presentation-optimized-paired' : 'open-source-paired',
		modelPath: best.modelPath || null,
		posterPath: best.posterPaths?.[normalizeModelPose(args.pose || args.view || args.posterView)] || best.posterPath || null,
	}
}

function resolvePremiumModel3DAsset(kind, args = {}) {
	const requestedSource = String(args.assetSource || args.source || '').toLowerCase()
	if (['procedural', 'open-source', 'opensource', 'external', 'cc0'].includes(requestedSource)) return null
	const mode = String(args.generationMode || args.engine || 'auto').toLowerCase()
	const quality = String(args.qualityTarget || args.quality || '').toLowerCase()
	const wantsHighFidelity = mode === 'auto' || mode === 'high-fidelity' || quality === 'premium' || quality === 'hero'
	if (!wantsHighFidelity) return null
	const premium = PREMIUM_MODEL3D_PAIRS[kind]
	if (premium) {
		const modelPath = path.resolve(process.cwd(), 'demos', 'betterpptx-premium-assets', 'models', `${premium.stem}.glb`)
		const posterPath = path.resolve(process.cwd(), 'demos', 'betterpptx-premium-assets', 'posters', `${premium.stem}.png`)
		if (fsNode.existsSync(modelPath) && fsNode.existsSync(posterPath)) return { ...premium, modelPath, posterPath, tier: 'high-fidelity-paired' }
	}
	const online = ONLINE_MODEL3D_PAIRS[kind]
	if (online) {
		const posterExt = online.posterExt || '.png'
		const modelPath = path.resolve(process.cwd(), 'demos', 'betterpptx-online-assets', 'models', 'khronos', `${online.stem}.glb`)
		const posterPath = path.resolve(process.cwd(), 'demos', 'betterpptx-online-assets', 'models', 'khronos', 'previews', `${online.stem}${posterExt}`)
		if (fsNode.existsSync(modelPath) && fsNode.existsSync(posterPath)) return { ...online, modelPath, posterPath, tier: 'high-fidelity-library' }
	}
	return null
}

function modelDetailProfile(detail = 'medium', optimizeFor = 'slides') {
	const normalized = ['low', 'medium', 'high'].includes(String(detail).toLowerCase()) ? String(detail).toLowerCase() : 'medium'
	const slideBias = optimizeFor === 'slides' || optimizeFor === 'navigation'
	if (normalized === 'high' && !slideBias) return { detail: normalized, cylinder: 56, corner: 32, sphereRings: 18, sphereSegments: 36, posterSize: 768 }
	if (normalized === 'high') return { detail: normalized, cylinder: 40, corner: 26, sphereRings: 14, sphereSegments: 28, posterSize: 640 }
	if (normalized === 'low') return { detail: normalized, cylinder: 18, corner: 12, sphereRings: 8, sphereSegments: 16, posterSize: 384 }
	return { detail: normalized, cylinder: 28, corner: 18, sphereRings: 12, sphereSegments: 24, posterSize: 512 }
}

function nativeOnlyModel3DRequested(args = {}) {
	const policy = String(args.posterPolicy || args.fallbackPolicy || 'native-only').toLowerCase()
	return args.nativeOnly !== false && args.withPoster !== true && !['fallback', 'poster', 'raster'].includes(policy)
}

function model3DReferenceFields(publicBlackBox, modelRef, posterRef, nativeOnly) {
	const out = publicBlackBox ? { modelAsset: modelRef } : { glbFile: modelRef }
	if (!nativeOnly && posterRef) {
		if (publicBlackBox) out.posterAsset = posterRef
		else out.rasterFile = posterRef
	}
	return out
}

function model3DOptionReferenceFields(publicBlackBox, modelRef, posterRef, nativeOnly) {
	return {
		...model3DReferenceFields(publicBlackBox, modelRef, posterRef, nativeOnly),
		...(nativeOnly ? { nativeOnly: true } : {}),
	}
}

function model3DByteSummary(publicBlackBox, modelBytes, posterBytes, nativeOnly) {
	const out = publicBlackBox ? { model3d: modelBytes } : { glb: modelBytes }
	if (!nativeOnly && posterBytes != null) {
		if (publicBlackBox) out.poster = posterBytes
		else out.raster = posterBytes
	}
	return out
}

function material(name, color, metallic = 0.28, roughness = 0.38, alpha = 1, emissive = 0) {
	const rgb = rgbFactor(color, alpha)
	return {
		name,
		pbrMetallicRoughness: {
			baseColorFactor: rgb,
			metallicFactor: metallic,
			roughnessFactor: roughness,
		},
		...(emissive > 0 ? { emissiveFactor: rgb.slice(0, 3).map(v => Math.max(0, Math.min(1, v * emissive))) } : {}),
		...(alpha < 1 ? { alphaMode: 'BLEND', doubleSided: true } : {}),
	}
}

function pushPrimitive(primitives, positions, normals, indices, materialIndex) {
	primitives.push({ positions, normals, indices, materialIndex })
}

function addCuboid(primitives, cx, cy, cz, sx, sy, sz, materialIndex) {
	const x0 = cx - sx / 2, x1 = cx + sx / 2
	const y0 = cy - sy / 2, y1 = cy + sy / 2
	const z0 = cz - sz / 2, z1 = cz + sz / 2
	const faces = [
		[[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]],
		[[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0]],
		[[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]],
		[[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0]],
		[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
		[[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
	]
	const positions = [], normals = [], indices = []
	for (const face of faces) {
		const base = positions.length / 3
		for (let i = 0; i < 4; i++) {
			positions.push(...face[i])
			normals.push(...face[4])
		}
		indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
	}
	pushPrimitive(primitives, positions, normals, indices, materialIndex)
}

function addCylinder(primitives, cx, cy, cz, radius, height, segments, materialIndex) {
	const positions = [], normals = [], indices = []
	const y0 = cy - height / 2, y1 = cy + height / 2
	for (let i = 0; i <= segments; i++) {
		const a = (i / segments) * Math.PI * 2
		const x = Math.cos(a) * radius, z = Math.sin(a) * radius
		positions.push(cx + x, y0, cz + z, cx + x, y1, cz + z)
		normals.push(x / radius, 0, z / radius, x / radius, 0, z / radius)
	}
	for (let i = 0; i < segments; i++) {
		const base = i * 2
		indices.push(base, base + 1, base + 3, base, base + 3, base + 2)
	}
	const bottomCenter = positions.length / 3
	positions.push(cx, y0, cz); normals.push(0, -1, 0)
	const topCenter = positions.length / 3
	positions.push(cx, y1, cz); normals.push(0, 1, 0)
	for (let i = 0; i < segments; i++) {
		const a0 = (i / segments) * Math.PI * 2
		const a1 = ((i + 1) / segments) * Math.PI * 2
		const b0 = positions.length / 3
		positions.push(cx + Math.cos(a0) * radius, y0, cz + Math.sin(a0) * radius, cx + Math.cos(a1) * radius, y0, cz + Math.sin(a1) * radius)
		normals.push(0, -1, 0, 0, -1, 0)
		indices.push(bottomCenter, b0 + 1, b0)
		const t0 = positions.length / 3
		positions.push(cx + Math.cos(a0) * radius, y1, cz + Math.sin(a0) * radius, cx + Math.cos(a1) * radius, y1, cz + Math.sin(a1) * radius)
		normals.push(0, 1, 0, 0, 1, 0)
		indices.push(topCenter, t0, t0 + 1)
	}
	pushPrimitive(primitives, positions, normals, indices, materialIndex)
}

function addCylinderZ(primitives, cx, cy, cz, radius, depth, segments, materialIndex) {
	const positions = [], normals = [], indices = []
	const z0 = cz - depth / 2, z1 = cz + depth / 2
	for (let i = 0; i <= segments; i++) {
		const a = (i / segments) * Math.PI * 2
		const x = Math.cos(a) * radius, y = Math.sin(a) * radius
		positions.push(cx + x, cy + y, z0, cx + x, cy + y, z1)
		normals.push(x / radius, y / radius, 0, x / radius, y / radius, 0)
	}
	for (let i = 0; i < segments; i++) {
		const base = i * 2
		indices.push(base, base + 1, base + 3, base, base + 3, base + 2)
	}
	const backCenter = positions.length / 3
	positions.push(cx, cy, z0); normals.push(0, 0, -1)
	const frontCenter = positions.length / 3
	positions.push(cx, cy, z1); normals.push(0, 0, 1)
	for (let i = 0; i < segments; i++) {
		const a0 = (i / segments) * Math.PI * 2
		const a1 = ((i + 1) / segments) * Math.PI * 2
		const b0 = positions.length / 3
		positions.push(cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius, z0, cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius, z0)
		normals.push(0, 0, -1, 0, 0, -1)
		indices.push(backCenter, b0, b0 + 1)
		const f0 = positions.length / 3
		positions.push(cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius, z1, cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius, z1)
		normals.push(0, 0, 1, 0, 0, 1)
		indices.push(frontCenter, f0 + 1, f0)
	}
	pushPrimitive(primitives, positions, normals, indices, materialIndex)
}

function addCylinderX(primitives, cx, cy, cz, radius, length, segments, materialIndex) {
	const positions = [], normals = [], indices = []
	const x0 = cx - length / 2, x1 = cx + length / 2
	for (let i = 0; i <= segments; i++) {
		const a = (i / segments) * Math.PI * 2
		const y = Math.cos(a) * radius, z = Math.sin(a) * radius
		positions.push(x0, cy + y, cz + z, x1, cy + y, cz + z)
		normals.push(0, y / radius, z / radius, 0, y / radius, z / radius)
	}
	for (let i = 0; i < segments; i++) {
		const base = i * 2
		indices.push(base, base + 1, base + 3, base, base + 3, base + 2)
	}
	const leftCenter = positions.length / 3
	positions.push(x0, cy, cz); normals.push(-1, 0, 0)
	const rightCenter = positions.length / 3
	positions.push(x1, cy, cz); normals.push(1, 0, 0)
	for (let i = 0; i < segments; i++) {
		const a0 = (i / segments) * Math.PI * 2
		const a1 = ((i + 1) / segments) * Math.PI * 2
		const l0 = positions.length / 3
		positions.push(x0, cy + Math.cos(a0) * radius, cz + Math.sin(a0) * radius, x0, cy + Math.cos(a1) * radius, cz + Math.sin(a1) * radius)
		normals.push(-1, 0, 0, -1, 0, 0)
		indices.push(leftCenter, l0 + 1, l0)
		const r0 = positions.length / 3
		positions.push(x1, cy + Math.cos(a0) * radius, cz + Math.sin(a0) * radius, x1, cy + Math.cos(a1) * radius, cz + Math.sin(a1) * radius)
		normals.push(1, 0, 0, 1, 0, 0)
		indices.push(rightCenter, r0, r0 + 1)
	}
	pushPrimitive(primitives, positions, normals, indices, materialIndex)
}

function addConeX(primitives, cx, cy, cz, radius, length, segments, materialIndex) {
	const positions = [], normals = [], indices = []
	const x0 = cx - length / 2, tip = [cx + length / 2, cy, cz]
	const center = positions.length / 3
	positions.push(x0, cy, cz); normals.push(-1, 0, 0)
	const ring = []
	for (let i = 0; i < segments; i++) {
		const a = (i / segments) * Math.PI * 2
		ring.push([x0, cy + Math.cos(a) * radius, cz + Math.sin(a) * radius])
	}
	for (let i = 0; i < segments; i++) {
		const p0 = ring[i], p1 = ring[(i + 1) % segments]
		const base = positions.length / 3
		positions.push(...p0, ...p1)
		normals.push(-1, 0, 0, -1, 0, 0)
		indices.push(center, base, base + 1)
		const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2]
		const vx = tip[0] - p0[0], vy = tip[1] - p0[1], vz = tip[2] - p0[2]
		let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
		const len = Math.hypot(nx, ny, nz) || 1
		nx /= len; ny /= len; nz /= len
		const side = positions.length / 3
		positions.push(...p0, ...p1, ...tip)
		normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz)
		indices.push(side, side + 1, side + 2)
	}
	pushPrimitive(primitives, positions, normals, indices, materialIndex)
}

function addRoundedPanel(primitives, cx, cy, cz, w, h, depth, radius, materialIndex) {
	const r = Math.min(radius, w / 2, h / 2)
	addCuboid(primitives, cx, cy, cz, Math.max(0.01, w - 2 * r), h, depth, materialIndex)
	addCuboid(primitives, cx, cy, cz, w, Math.max(0.01, h - 2 * r), depth, materialIndex)
	for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
		addCylinderZ(primitives, cx + sx * (w / 2 - r), cy + sy * (h / 2 - r), cz, r, depth, 28, materialIndex)
	}
}

function addSphere(primitives, cx, cy, cz, radius, rings, segments, materialIndex) {
	const positions = [], normals = [], indices = []
	for (let r = 0; r <= rings; r++) {
		const v = r / rings
		const theta = v * Math.PI
		const sinTheta = Math.sin(theta)
		const cosTheta = Math.cos(theta)
		for (let s = 0; s <= segments; s++) {
			const u = s / segments
			const phi = u * Math.PI * 2
			const nx = Math.cos(phi) * sinTheta
			const ny = cosTheta
			const nz = Math.sin(phi) * sinTheta
			positions.push(cx + nx * radius, cy + ny * radius, cz + nz * radius)
			normals.push(nx, ny, nz)
		}
	}
	for (let r = 0; r < rings; r++) {
		for (let s = 0; s < segments; s++) {
			const a = r * (segments + 1) + s
			const b = a + segments + 1
			indices.push(a, b, a + 1, b, b + 1, a + 1)
		}
	}
	pushPrimitive(primitives, positions, normals, indices, materialIndex)
}

function addPyramid(primitives, cx, cy, cz, radius, height, segments, materialIndex) {
	const positions = [], normals = [], indices = []
	const apex = [cx, cy + height / 2, cz]
	const yBase = cy - height / 2
	const ring = []
	for (let i = 0; i < segments; i++) {
		const a = (i / segments) * Math.PI * 2 + Math.PI / 4
		ring.push([cx + Math.cos(a) * radius, yBase, cz + Math.sin(a) * radius])
	}
	for (let i = 0; i < segments; i++) {
		const p0 = ring[i], p1 = ring[(i + 1) % segments]
		const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2]
		const vx = apex[0] - p0[0], vy = apex[1] - p0[1], vz = apex[2] - p0[2]
		const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
		const len = Math.hypot(nx, ny, nz) || 1
		const base = positions.length / 3
		positions.push(...p0, ...p1, ...apex)
		normals.push(nx / len, ny / len, nz / len, nx / len, ny / len, nz / len, nx / len, ny / len, nz / len)
		indices.push(base, base + 1, base + 2)
	}
	const center = positions.length / 3
	positions.push(cx, yBase, cz); normals.push(0, -1, 0)
	for (let i = 0; i < segments; i++) {
		const base = positions.length / 3
		positions.push(...ring[(i + 1) % segments], ...ring[i])
		normals.push(0, -1, 0, 0, -1, 0)
		indices.push(center, base, base + 1)
	}
	pushPrimitive(primitives, positions, normals, indices, materialIndex)
}

function addExtrudedPolygon(primitives, points, depth, materialIndex, tx = 0, ty = 0, tz = 0, scale = 1) {
	const positions = [], normals = [], indices = []
	const z0 = tz - depth / 2, z1 = tz + depth / 2
	const frontStart = 0
	for (const [x, y] of points) { positions.push(tx + x * scale, ty + y * scale, z1); normals.push(0, 0, 1) }
	const backStart = positions.length / 3
	for (const [x, y] of points) { positions.push(tx + x * scale, ty + y * scale, z0); normals.push(0, 0, -1) }
	for (let i = 1; i < points.length - 1; i++) indices.push(frontStart, frontStart + i, frontStart + i + 1)
	for (let i = 1; i < points.length - 1; i++) indices.push(backStart, backStart + i + 1, backStart + i)
	for (let i = 0; i < points.length; i++) {
		const next = (i + 1) % points.length
		const [px0, py0] = points[i], [px1, py1] = points[next]
		const x0 = tx + px0 * scale, y0 = ty + py0 * scale, x1 = tx + px1 * scale, y1 = ty + py1 * scale
		const nx0 = y1 - y0, ny0 = -(x1 - x0)
		const len = Math.hypot(nx0, ny0) || 1
		const nx = nx0 / len, ny = ny0 / len
		const base = positions.length / 3
		positions.push(x0, y0, z0, x1, y1, z0, x1, y1, z1, x0, y0, z1)
		normals.push(nx, ny, 0, nx, ny, 0, nx, ny, 0, nx, ny, 0)
		indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
	}
	pushPrimitive(primitives, positions, normals, indices, materialIndex)
}

function createIconGeometry(kind, colors, profile = modelDetailProfile()) {
	const primitives = []
	const materials = [
		material('primary-glass-metal', colors.primary, 0.35, 0.28),
		material('accent-emissive', colors.accent, 0.18, 0.22, 1, 0.35),
		material('deep-shadow', colors.dark, 0.2, 0.5),
		material('highlight', colors.highlight, 0.05, 0.2, 0.82),
	]
	if (kind === 'arrow') {
		addCylinderX(primitives, -0.15, 0, 0, 0.16, 0.95, profile.cylinder, 0)
		addConeX(primitives, 0.55, 0, 0, 0.34, 0.62, profile.cylinder, 1)
		addSphere(primitives, -0.72, 0, 0, 0.19, profile.sphereRings, profile.sphereSegments, 3)
		addCylinderX(primitives, -0.14, 0.28, 0.1, 0.035, 0.78, Math.max(12, Math.round(profile.cylinder * 0.65)), 3)
		addSphere(primitives, 0.32, 0.22, 0.18, 0.085, profile.sphereRings, profile.sphereSegments, 3)
	} else if (kind === 'interface') {
		addRoundedPanel(primitives, 0, 0, 0, 1.72, 1.22, 0.24, 0.2, 0)
		addRoundedPanel(primitives, 0, 0.43, 0.18, 1.34, 0.22, 0.14, 0.08, 1)
		for (const [x, mat] of [[-0.54, 3], [-0.4, 3], [-0.26, 3]]) addSphere(primitives, x, 0.43, 0.31, 0.045, 8, 16, mat)
		addRoundedPanel(primitives, -0.42, 0.08, 0.22, 0.52, 0.2, 0.12, 0.06, 3)
		addRoundedPanel(primitives, 0.35, 0.08, 0.22, 0.56, 0.2, 0.12, 0.06, 1)
		addRoundedPanel(primitives, -0.2, -0.26, 0.22, 0.94, 0.18, 0.12, 0.06, 3)
		const cursor = [[-0.2, 0.36], [0.46, -0.06], [0.14, -0.13], [0.31, -0.46], [0.16, -0.53], [-0.03, -0.21], [-0.22, 0.02]]
		addExtrudedPolygon(primitives, cursor, 0.14, 3, 0.28, -0.18, 0.36, 0.55)
		addSphere(primitives, 0.72, -0.42, 0.26, 0.12, 10, 20, 1)
	} else if (kind === 'user') {
		addCylinderZ(primitives, 0, 0, 0, 0.88, 0.22, 56, 0)
		addCylinderZ(primitives, 0, 0, 0.13, 0.66, 0.16, 56, 1)
		addSphere(primitives, 0, 0.24, 0.36, 0.26, 16, 32, 3)
		addRoundedPanel(primitives, 0, -0.36, 0.34, 0.92, 0.42, 0.16, 0.21, 3)
		addSphere(primitives, 0.52, -0.44, 0.42, 0.17, 12, 24, 1)
		addCuboid(primitives, 0.52, -0.44, 0.58, 0.24, 0.055, 0.06, 3)
		addCuboid(primitives, 0.52, -0.44, 0.59, 0.055, 0.24, 0.06, 3)
	} else if (kind === 'person') {
		addCylinder(primitives, 0, -0.64, 0, 0.46, 0.16, profile.cylinder, 2)
		addRoundedPanel(primitives, 0, -0.15, 0.08, 0.62, 0.74, 0.28, 0.18, 0)
		addSphere(primitives, 0, 0.46, 0.12, 0.26, profile.sphereRings, profile.sphereSegments, 3)
		addCylinderX(primitives, 0, 0.02, 0.08, 0.075, 1.02, Math.max(14, profile.cylinder), 1)
		addCylinder(primitives, -0.18, -0.82, 0.06, 0.08, 0.48, Math.max(14, profile.cylinder), 3)
		addCylinder(primitives, 0.18, -0.82, 0.06, 0.08, 0.48, Math.max(14, profile.cylinder), 3)
		addSphere(primitives, -0.55, 0.02, 0.09, 0.1, 8, 16, 1)
		addSphere(primitives, 0.55, 0.02, 0.09, 0.1, 8, 16, 1)
	} else if (kind === 'team') {
		for (const [x, scale, mat] of [[-0.48, 0.78, 1], [0, 1, 0], [0.5, 0.78, 1]]) {
			addRoundedPanel(primitives, x, -0.28, 0.08, 0.5 * scale, 0.56 * scale, 0.2, 0.14, mat)
			addSphere(primitives, x, 0.28 * scale, 0.14, 0.2 * scale, profile.sphereRings, profile.sphereSegments, 3)
			addCylinder(primitives, x, -0.76 * scale, 0.04, 0.34 * scale, 0.12, profile.cylinder, 2)
		}
		addCylinderX(primitives, 0, -0.1, 0.04, 0.04, 1.18, Math.max(12, profile.cylinder), 3)
	} else if (kind === 'robot') {
		addRoundedPanel(primitives, 0, 0.2, 0.05, 0.78, 0.55, 0.28, 0.12, 0)
		addRoundedPanel(primitives, 0, -0.42, 0.04, 0.92, 0.72, 0.32, 0.16, 2)
		addCylinder(primitives, 0, -0.02, 0.03, 0.08, 0.36, 18, 1)
		addCylinderX(primitives, -0.62, -0.34, 0.06, 0.07, 0.42, 18, 1)
		addCylinderX(primitives, 0.62, -0.34, 0.06, 0.07, 0.42, 18, 1)
		addSphere(primitives, -0.2, 0.24, 0.23, 0.075, 8, 16, 3)
		addSphere(primitives, 0.2, 0.24, 0.23, 0.075, 8, 16, 3)
		addCylinder(primitives, -0.2, 0.66, 0.04, 0.035, 0.28, 12, 1)
		addCylinder(primitives, 0.2, 0.66, 0.04, 0.035, 0.28, 12, 1)
		addSphere(primitives, -0.2, 0.83, 0.05, 0.06, 8, 16, 1)
		addSphere(primitives, 0.2, 0.83, 0.05, 0.06, 8, 16, 1)
	} else if (kind === 'device') {
		addRoundedPanel(primitives, 0, 0.1, 0, 1.46, 0.92, 0.18, 0.12, 0)
		addRoundedPanel(primitives, 0, 0.1, 0.14, 1.18, 0.64, 0.08, 0.08, 2)
		addRoundedPanel(primitives, 0, -0.58, 0.12, 1.62, 0.34, 0.16, 0.08, 1)
		addRoundedPanel(primitives, 0, -0.58, 0.24, 0.34, 0.08, 0.06, 0.03, 3)
		addSphere(primitives, -0.48, 0.35, 0.23, 0.045, 8, 16, 3)
		addSphere(primitives, -0.32, 0.35, 0.23, 0.045, 8, 16, 3)
	} else if (kind === 'package') {
		addCuboid(primitives, 0, -0.08, 0, 1.06, 0.92, 0.82, 0)
		addCuboid(primitives, 0, -0.08, 0.44, 0.18, 0.96, 0.08, 1)
		addCuboid(primitives, 0, 0.38, 0.44, 1.12, 0.16, 0.08, 1)
		addPyramid(primitives, -0.31, 0.58, 0.05, 0.26, 0.34, 4, 3)
		addPyramid(primitives, 0.31, 0.58, 0.05, 0.26, 0.34, 4, 3)
	} else if (kind === 'product') {
		addCylinder(primitives, 0, -0.55, 0, 0.62, 0.14, profile.cylinder, 2)
		addRoundedPanel(primitives, 0, -0.05, 0.04, 0.88, 0.94, 0.52, 0.2, 0)
		addSphere(primitives, 0.42, 0.44, 0.34, 0.15, 10, 20, 1)
		addRoundedPanel(primitives, -0.1, -0.02, 0.35, 0.46, 0.18, 0.08, 0.06, 3)
		addCylinderZ(primitives, 0, -0.05, 0.45, 0.22, 0.08, profile.cylinder, 1)
	} else if (kind === 'scene') {
		addCylinder(primitives, 0, -0.78, 0, 0.94, 0.12, profile.cylinder, 2)
		addCuboid(primitives, -0.46, -0.22, 0, 0.32, 0.96, 0.38, 0)
		addCuboid(primitives, -0.05, -0.05, 0.04, 0.34, 1.32, 0.42, 1)
		addCuboid(primitives, 0.38, -0.34, 0, 0.36, 0.72, 0.36, 0)
		for (const x of [-0.52, -0.04, 0.36]) {
			addCuboid(primitives, x, -0.12, 0.24, 0.1, 0.12, 0.05, 3)
			addCuboid(primitives, x, 0.18, 0.24, 0.1, 0.12, 0.05, 3)
		}
		addCylinder(primitives, 0.78, -0.56, 0.06, 0.05, 0.38, 12, 2)
		addSphere(primitives, 0.78, -0.22, 0.08, 0.22, 10, 20, 1)
	} else if (kind === 'vehicle') {
		addRoundedPanel(primitives, 0, -0.06, 0.08, 1.28, 0.42, 0.46, 0.13, 0)
		addRoundedPanel(primitives, -0.04, 0.18, 0.22, 0.72, 0.34, 0.32, 0.1, 1)
		addCylinderZ(primitives, -0.43, -0.36, 0.34, 0.16, 0.1, profile.cylinder, 2)
		addCylinderZ(primitives, 0.43, -0.36, 0.34, 0.16, 0.1, profile.cylinder, 2)
		addSphere(primitives, -0.58, -0.02, 0.34, 0.055, 8, 16, 3)
		addSphere(primitives, 0.58, -0.02, 0.34, 0.055, 8, 16, 3)
	} else if (kind === 'trophy') {
		addCylinder(primitives, 0, -0.78, 0, 0.46, 0.12, profile.cylinder, 2)
		addCylinder(primitives, 0, -0.52, 0, 0.18, 0.42, profile.cylinder, 1)
		addSphere(primitives, 0, 0.0, 0, 0.48, profile.sphereRings, profile.sphereSegments, 0)
		addCylinder(primitives, 0, 0.36, 0, 0.42, 0.12, profile.cylinder, 1)
		addCylinderX(primitives, -0.48, 0.06, 0, 0.055, 0.34, 16, 3)
		addCylinderX(primitives, 0.48, 0.06, 0, 0.055, 0.34, 16, 3)
		addSphere(primitives, -0.66, 0.06, 0, 0.08, 8, 16, 3)
		addSphere(primitives, 0.66, 0.06, 0, 0.08, 8, 16, 3)
	} else if (kind === 'toggle') {
		addRoundedPanel(primitives, 0, 0, 0, 1.74, 0.72, 0.28, 0.36, 0)
		addRoundedPanel(primitives, -0.28, 0, 0.2, 0.9, 0.42, 0.16, 0.21, 1)
		addSphere(primitives, 0.48, 0, 0.34, 0.31, 18, 36, 3)
		addSphere(primitives, 0.6, 0.16, 0.54, 0.08, 8, 16, 3)
		addCuboid(primitives, -0.48, 0, 0.34, 0.32, 0.07, 0.08, 3)
	} else if (kind === 'bell') {
		addSphere(primitives, 0, 0.14, 0, 0.58, 18, 36, 0)
		addCylinder(primitives, 0, -0.32, 0, 0.58, 0.16, 48, 1)
		addCylinder(primitives, 0, -0.48, 0, 0.36, 0.1, 48, 2)
		addSphere(primitives, 0, -0.6, 0.02, 0.16, 12, 24, 3)
		addSphere(primitives, 0, 0.74, 0, 0.14, 12, 24, 1)
		addCuboid(primitives, 0, 0.56, 0, 0.18, 0.26, 0.14, 1)
		addSphere(primitives, 0.38, 0.26, 0.34, 0.08, 8, 16, 3)
	} else if (kind === 'cloud') {
		addSphere(primitives, -0.36, 0, 0, 0.36, 14, 28, 0)
		addSphere(primitives, 0.02, 0.16, 0, 0.46, 16, 32, 0)
		addSphere(primitives, 0.44, 0, 0, 0.34, 14, 28, 0)
		addRoundedPanel(primitives, 0.05, -0.23, 0, 1.22, 0.38, 0.3, 0.19, 0)
		addCylinder(primitives, 0, -0.52, 0.24, 0.13, 0.54, 24, 1)
		addPyramid(primitives, 0, -0.16, 0.24, 0.28, 0.38, 4, 1)
		addCylinderZ(primitives, 0.54, 0.5, 0.22, 0.12, 0.12, 24, 3)
	} else if (kind === 'shield') {
		addExtrudedPolygon(primitives, [[0, 0.92], [0.72, 0.58], [0.58, -0.35], [0, -0.92], [-0.58, -0.35], [-0.72, 0.58]], 0.32, 0)
		addExtrudedPolygon(primitives, [[0, 0.62], [0.42, 0.38], [0.32, -0.22], [0, -0.56], [-0.32, -0.22], [-0.42, 0.38]], 0.38, 1)
		addCuboid(primitives, 0, 0.0, 0.26, 0.14, 0.72, 0.08, 3)
		addCuboid(primitives, 0, 0.0, 0.27, 0.54, 0.12, 0.08, 3)
	} else if (kind === 'stack') {
		addCylinder(primitives, 0, -0.45, 0, 0.72, 0.18, 48, 2)
		addCylinder(primitives, 0, -0.08, 0, 0.68, 0.2, 48, 0)
		addCylinder(primitives, 0, 0.31, 0, 0.62, 0.22, 48, 1)
		addSphere(primitives, 0.42, 0.72, 0.12, 0.18, 10, 20, 3)
	} else if (kind === 'beacon') {
		addCylinder(primitives, 0, -0.72, 0, 0.66, 0.18, 48, 2)
		addCylinder(primitives, 0, -0.18, 0, 0.18, 0.92, 32, 0)
		addSphere(primitives, 0, 0.45, 0, 0.28, 12, 24, 1)
		addCylinder(primitives, 0, 0.76, 0, 0.46, 0.08, 48, 3)
		addCylinder(primitives, 0, 0.96, 0, 0.68, 0.06, 48, 3)
	} else if (kind === 'spark') {
		const star = []
		for (let i = 0; i < 10; i++) {
			const a = -Math.PI / 2 + i * Math.PI / 5
			const r = i % 2 === 0 ? 0.82 : 0.34
			star.push([Math.cos(a) * r, Math.sin(a) * r])
		}
		addExtrudedPolygon(primitives, star, 0.34, 1)
		addSphere(primitives, 0.05, 0.05, 0.25, 0.26, 12, 24, 3)
		addCuboid(primitives, 0, -0.88, 0, 0.5, 0.16, 0.3, 2)
	} else {
		addPyramid(primitives, 0, 0.18, 0, 0.9, 1.45, 4, 0)
		addPyramid(primitives, 0.06, 0.32, 0.08, 0.52, 0.92, 4, 1)
		addCylinder(primitives, 0, -0.72, 0, 0.68, 0.14, 48, 2)
		addSphere(primitives, 0.46, 0.78, 0.25, 0.14, 8, 16, 3)
	}
	return { primitives, materials }
}

function ensureNodeFileReaderForThreeExporter() {
	if (globalThis.FileReader) return
	globalThis.FileReader = class {
		readAsArrayBuffer(blob) {
			blob.arrayBuffer()
				.then(buffer => {
					this.result = buffer
					if (typeof this.onloadend === 'function') this.onloadend()
				})
				.catch(err => {
					this.error = err
					if (typeof this.onerror === 'function') this.onerror(err)
				})
		}
	}
}

function hexToNumber(hex, fallback = 'FFFFFF') {
	return parseInt(cleanHex(hex, fallback), 16)
}

function countPrimitiveStatsFromGltfDocument(document) {
	const root = document.getRoot()
	let vertexCount = 0
	let triangleCount = 0
	let primitiveCount = 0
	for (const mesh of root.listMeshes()) {
		for (const primitive of mesh.listPrimitives()) {
			primitiveCount++
			const position = primitive.getAttribute('POSITION')
			const indices = primitive.getIndices()
			vertexCount += position?.getCount() || 0
			if ((primitive.getMode?.() ?? 4) === 4) {
				triangleCount += Math.floor((indices?.getCount() || position?.getCount() || 0) / 3)
			}
		}
	}
	return {
		vertexCount,
		triangleCount,
		primitiveCount,
		materialCount: root.listMaterials().length,
	}
}

async function countPrimitiveStatsFromGlbFile(filePath) {
	try {
		const { NodeIO } = await import('@gltf-transform/core')
		const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions')
		const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
		const document = await io.read(filePath)
		return countPrimitiveStatsFromGltfDocument(document)
	} catch (_) {
		return null
	}
}

async function optimizeGlbWithGltfTransform(glb, { quantizeModel = true } = {}) {
	const warnings = []
	try {
		const { NodeIO } = await import('@gltf-transform/core')
		const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions')
		const { dedup, prune, weld, quantize } = await import('@gltf-transform/functions')
		const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
		const document = await io.readBinary(new Uint8Array(glb))
		document.getRoot().getAsset().generator = 'presentation 3D asset generator'
		const beforeStats = countPrimitiveStatsFromGltfDocument(document)
		await document.transform(
			dedup(),
			prune(),
			weld(),
			...(quantizeModel ? [quantize()] : []),
		)
		const optimized = Buffer.from(await io.writeBinary(document))
		const optimizerSteps = ['dedup', 'prune', 'weld', ...(quantizeModel ? ['quantize'] : [])].join(' + ')
		return {
			glb: optimized,
			beforeBytes: glb.length,
			afterBytes: optimized.length,
			beforeStats,
			afterStats: countPrimitiveStatsFromGltfDocument(document),
			warnings,
			optimizer: `gltf-transform: ${optimizerSteps}`,
		}
	} catch (err) {
		warnings.push(err?.message || String(err))
		return {
			glb,
			beforeBytes: glb.length,
			afterBytes: glb.length,
			beforeStats: null,
			afterStats: null,
			warnings,
			optimizer: 'gltf-transform unavailable; kept authored GLB',
		}
	}
}

async function createThreeArrowGlb({ colors, profile, name, optimizeFor }) {
	ensureNodeFileReaderForThreeExporter()
	const THREE = await import('three')
	const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
	const scene = new THREE.Scene()
	scene.name = `${name}-three-scene`
	const group = new THREE.Group()
	group.name = 'reusable-navigation-arrow'
	scene.add(group)
	const segments = Math.max(12, profile.cylinder)
	const primary = new THREE.MeshStandardMaterial({
		name: 'primary-glossy-body',
		color: hexToNumber(colors.primary, '22D3EE'),
		metalness: 0.32,
		roughness: 0.24,
	})
	const accent = new THREE.MeshStandardMaterial({
		name: 'accent-glossy-head',
		color: hexToNumber(colors.accent, 'A78BFA'),
		metalness: 0.22,
		roughness: 0.2,
		emissive: hexToNumber(colors.accent, 'A78BFA'),
		emissiveIntensity: 0.18,
	})
	const highlight = new THREE.MeshStandardMaterial({
		name: 'soft-white-highlight',
		color: hexToNumber(colors.highlight, 'F8FAFC'),
		metalness: 0.08,
		roughness: 0.18,
		transparent: true,
		opacity: 0.86,
	})
	const dark = new THREE.MeshStandardMaterial({
		name: 'deep-blue-contact-shadow',
		color: hexToNumber(colors.dark, '0F172A'),
		metalness: 0.18,
		roughness: 0.48,
	})
	const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.02, segments, 1, false), primary)
	shaft.name = 'arrow-shaft'
	shaft.rotation.z = -Math.PI / 2
	shaft.position.x = -0.18
	group.add(shaft)
	const head = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.64, segments, 1, false), accent)
	head.name = 'arrow-head'
	head.rotation.z = -Math.PI / 2
	head.position.x = 0.48
	group.add(head)
	const tail = new THREE.Mesh(new THREE.SphereGeometry(0.19, profile.sphereSegments, profile.sphereRings), highlight)
	tail.name = 'arrow-tail-cap'
	tail.position.x = -0.78
	group.add(tail)
	const glint = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.72, Math.max(10, Math.round(segments * 0.6)), 1, false), highlight)
	glint.name = 'arrow-top-glint'
	glint.rotation.z = -Math.PI / 2
	glint.position.set(-0.11, 0.24, 0.12)
	group.add(glint)
	const bead = new THREE.Mesh(new THREE.SphereGeometry(0.08, Math.max(12, profile.sphereSegments), Math.max(6, profile.sphereRings)), highlight)
	bead.name = 'arrow-context-bead'
	bead.position.set(0.28, 0.23, 0.19)
	group.add(bead)
	const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.07, segments, 1, false), dark)
	foot.name = 'subtle-rotation-foot'
	foot.scale.set(1.7, 0.55, 1)
	foot.position.set(-0.12, -0.28, -0.22)
	group.add(foot)
	for (const object of group.children) object.geometry?.computeVertexNormals?.()
	group.userData.navigationReuseHint = {
		reuseAsset: true,
		optimizeFor,
		rotatableMeanings: ['forward', 'back', 'up', 'down', 'branch'],
	}
	const exporter = new GLTFExporter()
	const authored = Buffer.from(await new Promise((resolve, reject) => {
		exporter.parse(scene, result => resolve(result), reject, {
			binary: true,
			onlyVisible: true,
			trs: false,
		})
	}))
	const optimized = await optimizeGlbWithGltfTransform(authored, { quantizeModel: false })
	return {
		glb: optimized.glb,
		stats: optimized.afterStats || optimized.beforeStats,
		pipeline: {
			authoring: 'three.js scene graph + GLTFExporter',
			optimizer: optimized.optimizer,
			format: 'glTF 2.0 binary GLB',
			fallbackUsed: false,
			beforeBytes: optimized.beforeBytes,
			afterBytes: optimized.afterBytes,
			warnings: optimized.warnings,
		},
	}
}

async function createThreeCloudGlb({ colors, profile, name, optimizeFor }) {
	ensureNodeFileReaderForThreeExporter()
	const THREE = await import('three')
	const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
	const scene = new THREE.Scene()
	scene.name = `${name}-three-scene`
	const group = new THREE.Group()
	group.name = 'premium-native-cloud-upload'
	scene.add(group)
	const sphereSegments = Math.max(24, profile.sphereSegments)
	const sphereRings = Math.max(12, profile.sphereRings)
	const cylinderSegments = Math.max(32, profile.cylinder)
	const cloud = new THREE.MeshStandardMaterial({
		name: 'cloud-soft-gloss-body',
		color: hexToNumber(colors.highlight, 'F8FAFC'),
		metalness: 0.05,
		roughness: 0.2,
		emissive: hexToNumber(colors.primary, '22D3EE'),
		emissiveIntensity: 0.035,
	})
	const cloudTint = new THREE.MeshStandardMaterial({
		name: 'cloud-cyan-lobe',
		color: hexToNumber(colors.primary, '22D3EE'),
		metalness: 0.08,
		roughness: 0.24,
		emissive: hexToNumber(colors.primary, '22D3EE'),
		emissiveIntensity: 0.06,
	})
	const accent = new THREE.MeshStandardMaterial({
		name: 'upload-accent-metal',
		color: hexToNumber(colors.accent, 'A78BFA'),
		metalness: 0.34,
		roughness: 0.18,
		emissive: hexToNumber(colors.accent, 'A78BFA'),
		emissiveIntensity: 0.12,
	})
	const highlight = new THREE.MeshStandardMaterial({
		name: 'specular-white-glints',
		color: 0xffffff,
		metalness: 0.04,
		roughness: 0.12,
		transparent: true,
		opacity: 0.9,
	})
	const dark = new THREE.MeshStandardMaterial({
		name: 'deep-contact-shadow',
		color: hexToNumber(colors.dark, '0F172A'),
		metalness: 0.12,
		roughness: 0.5,
	})
	const addLobe = (meshName, x, y, z, sx, sy, sz, mat = cloud) => {
		const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, sphereSegments, sphereRings), mat)
		mesh.name = meshName
		mesh.position.set(x, y, z)
		mesh.scale.set(sx, sy, sz)
		group.add(mesh)
		return mesh
	}
	addLobe('left-rounded-cloud-lobe', -0.43, 0.02, -0.02, 0.44, 0.31, 0.28)
	addLobe('hero-top-cloud-lobe', -0.06, 0.2, 0.02, 0.53, 0.42, 0.34)
	addLobe('right-rounded-cloud-lobe', 0.42, 0.03, 0.01, 0.43, 0.31, 0.28)
	addLobe('front-cyan-depth-lobe', 0.08, -0.07, 0.18, 0.46, 0.29, 0.24, cloudTint)
	addLobe('rear-soft-depth-lobe', -0.16, 0.02, -0.21, 0.44, 0.28, 0.2)
	const base = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.8, 0.18, cylinderSegments, 1, false), cloud)
	base.name = 'continuous-cloud-base'
	base.position.set(0.02, -0.22, -0.01)
	base.scale.set(1.08, 0.8, 0.42)
	group.add(base)
	const arrowShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.78, cylinderSegments, 1, false), accent)
	arrowShaft.name = 'native-upload-arrow-shaft'
	arrowShaft.position.set(0, -0.23, 0.44)
	group.add(arrowShaft)
	const arrowHead = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.34, cylinderSegments, 1, false), accent)
	arrowHead.name = 'native-upload-arrow-head'
	arrowHead.position.set(0, 0.34, 0.44)
	group.add(arrowHead)
	const arrowFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.24, 0.075, cylinderSegments, 1, false), accent)
	arrowFoot.name = 'upload-arrow-foot'
	arrowFoot.position.set(0, -0.65, 0.44)
	arrowFoot.scale.set(1.6, 0.75, 0.45)
	group.add(arrowFoot)
	const orbit = new THREE.Mesh(new THREE.TorusGeometry(0.79, 0.017, 12, Math.max(72, cylinderSegments * 2)), highlight)
	orbit.name = 'data-orbit-ring'
	orbit.rotation.set(THREE.MathUtils.degToRad(68), THREE.MathUtils.degToRad(-16), THREE.MathUtils.degToRad(10))
	orbit.position.set(0.02, -0.05, 0.02)
	group.add(orbit)
	const nodePositions = [
		[-0.63, 0.19, 0.28, 0.066, accent],
		[0.62, 0.05, -0.18, 0.055, cloudTint],
		[0.22, -0.54, 0.24, 0.052, highlight],
	]
	for (const [x, y, z, radius, mat] of nodePositions) {
		const node = new THREE.Mesh(new THREE.SphereGeometry(radius, Math.max(12, sphereSegments / 2), Math.max(6, sphereRings / 2)), mat)
		node.name = 'data-node'
		node.position.set(x, y, z)
		group.add(node)
	}
	for (const [x, y, z, radius] of [[-0.22, 0.44, 0.27, 0.055], [0.31, 0.27, 0.29, 0.04], [-0.55, -0.06, 0.2, 0.036]]) {
		const glint = new THREE.Mesh(new THREE.SphereGeometry(radius, Math.max(12, sphereSegments / 2), Math.max(6, sphereRings / 2)), highlight)
		glint.name = 'surface-glint'
		glint.position.set(x, y, z)
		group.add(glint)
	}
	const contact = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.055, cylinderSegments, 1, false), dark)
	contact.name = 'subtle-ground-contact'
	contact.position.set(0.02, -0.72, -0.18)
	contact.scale.set(1.34, 0.5, 0.48)
	group.add(contact)
	for (const object of group.children) object.geometry?.computeVertexNormals?.()
	group.userData.nativeOnlyHint = {
		posterFallback: false,
		optimizeFor,
		qualityTarget: 'premium procedural',
	}
	const exporter = new GLTFExporter()
	const authored = Buffer.from(await new Promise((resolve, reject) => {
		exporter.parse(scene, result => resolve(result), reject, {
			binary: true,
			onlyVisible: true,
			trs: false,
		})
	}))
	const optimized = await optimizeGlbWithGltfTransform(authored, { quantizeModel: false })
	return {
		glb: optimized.glb,
		stats: optimized.afterStats || optimized.beforeStats,
		pipeline: {
			authoring: 'three.js scene graph + GLTFExporter',
			optimizer: optimized.optimizer,
			format: 'glTF 2.0 binary GLB',
			fallbackUsed: false,
			beforeBytes: optimized.beforeBytes,
			afterBytes: optimized.afterBytes,
			warnings: optimized.warnings,
		},
	}
}

function bufferFromFloat32(values) {
	const buf = Buffer.alloc(values.length * 4)
	values.forEach((v, i) => buf.writeFloatLE(Number(v) || 0, i * 4))
	return buf
}

function bufferFromUint16(values) {
	const buf = Buffer.alloc(values.length * 2)
	values.forEach((v, i) => buf.writeUInt16LE(v, i * 2))
	return buf
}

function bounds3(values) {
	const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
	for (let i = 0; i < values.length; i += 3) {
		for (let a = 0; a < 3; a++) {
			const v = values[i + a]
			if (v < min[a]) min[a] = v
			if (v > max[a]) max[a] = v
		}
	}
	return { min, max }
}

function pad4(buffer, padByte = 0) {
	const pad = (4 - (buffer.length % 4)) % 4
	return pad ? Buffer.concat([buffer, Buffer.alloc(pad, padByte)]) : buffer
}

function createGlbBuffer({ primitives, materials, name }) {
	const buffers = []
	const bufferViews = []
	const accessors = []
	const glPrimitives = []
	let byteOffset = 0
	function addView(buf, target) {
		const paddedBefore = pad4(Buffer.concat(buffers))
		if (paddedBefore.length !== byteOffset) {
			buffers.length = 0
			buffers.push(paddedBefore)
			byteOffset = paddedBefore.length
		}
		const view = { buffer: 0, byteOffset, byteLength: buf.length, target }
		bufferViews.push(view)
		buffers.push(buf)
		byteOffset += buf.length
		return bufferViews.length - 1
	}
	function addAccessor(buf, componentType, type, count, target, minMax = null) {
		const view = addView(buf, target)
		const accessor = { bufferView: view, byteOffset: 0, componentType, count, type }
		if (minMax) Object.assign(accessor, minMax)
		accessors.push(accessor)
		return accessors.length - 1
	}
	for (const p of primitives) {
		const positionAccessor = addAccessor(bufferFromFloat32(p.positions), 5126, 'VEC3', p.positions.length / 3, 34962, bounds3(p.positions))
		const normalAccessor = addAccessor(bufferFromFloat32(p.normals), 5126, 'VEC3', p.normals.length / 3, 34962)
		const indexAccessor = addAccessor(bufferFromUint16(p.indices), 5123, 'SCALAR', p.indices.length, 34963)
		glPrimitives.push({ attributes: { POSITION: positionAccessor, NORMAL: normalAccessor }, indices: indexAccessor, material: p.materialIndex })
	}
	const bin = pad4(Buffer.concat(buffers))
	const gltf = {
		asset: { version: '2.0', generator: 'presentation 3D asset generator' },
		scene: 0,
		scenes: [{ nodes: [0] }],
		nodes: [{ name, mesh: 0 }],
		meshes: [{ name, primitives: glPrimitives }],
		materials,
		buffers: [{ byteLength: bin.length }],
		bufferViews,
		accessors,
	}
	const json = pad4(Buffer.from(JSON.stringify(gltf)), 0x20)
	const header = Buffer.alloc(12)
	header.writeUInt32LE(0x46546c67, 0)
	header.writeUInt32LE(2, 4)
	header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8)
	const jsonHeader = Buffer.alloc(8)
	jsonHeader.writeUInt32LE(json.length, 0)
	jsonHeader.writeUInt32LE(0x4e4f534a, 4)
	const binHeader = Buffer.alloc(8)
	binHeader.writeUInt32LE(bin.length, 0)
	binHeader.writeUInt32LE(0x004e4942, 4)
	return Buffer.concat([header, jsonHeader, json, binHeader, bin])
}

function crc32(buffer) {
	let c = ~0
	for (let i = 0; i < buffer.length; i++) {
		c ^= buffer[i]
		for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
	}
	return ~c >>> 0
}

function pngChunk(type, data) {
	const typeBuf = Buffer.from(type, 'ascii')
	const len = Buffer.alloc(4)
	len.writeUInt32BE(data.length, 0)
	const crc = Buffer.alloc(4)
	crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
	return Buffer.concat([len, typeBuf, data, crc])
}

function rgbaToPng(width, height, rgba) {
	const raw = Buffer.alloc((width * 4 + 1) * height)
	for (let y = 0; y < height; y++) {
		const src = y * width * 4
		const dst = y * (width * 4 + 1)
		raw[dst] = 0
		rgba.copy(raw, dst + 1, src, src + width * 4)
	}
	const ihdr = Buffer.alloc(13)
	ihdr.writeUInt32BE(width, 0)
	ihdr.writeUInt32BE(height, 4)
	ihdr[8] = 8
	ihdr[9] = 6
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		pngChunk('IHDR', ihdr),
		pngChunk('IDAT', zlib.deflateSync(raw)),
		pngChunk('IEND', Buffer.alloc(0)),
	])
}

function normalizeModelPose(value) {
	const pose = String(value || 'heroTilt').trim()
	return ['front', 'threeQuarterRight', 'threeQuarterLeft', 'sideRight', 'sideLeft', 'topDown', 'heroTilt', 'dramatic'].includes(pose) ? pose : 'heroTilt'
}

function poseToModelRotation(pose) {
	return {
		front: { x: -4, y: 0, z: 0 },
		threeQuarterRight: { x: -14, y: 38, z: -3 },
		threeQuarterLeft: { x: -14, y: -38, z: 3 },
		sideRight: { x: -10, y: 68, z: -4 },
		sideLeft: { x: -10, y: -68, z: 4 },
		topDown: { x: -48, y: 22, z: 0 },
		heroTilt: { x: -18, y: 34, z: -6 },
		dramatic: { x: -26, y: -46, z: 18 },
	}[pose] || { x: -18, y: 34, z: -6 }
}

function rotationMatrixFromDegrees(rot) {
	const rx = ((rot?.x || 0) * Math.PI) / 180
	const ry = ((rot?.y || 0) * Math.PI) / 180
	const rz = ((rot?.z || 0) * Math.PI) / 180
	const sx = Math.sin(rx), cx = Math.cos(rx)
	const sy = Math.sin(ry), cy = Math.cos(ry)
	const sz = Math.sin(rz), cz = Math.cos(rz)
	return [
		[cy * cz, -cy * sz, sy],
		[cx * sz + cz * sx * sy, cx * cz - sx * sy * sz, -cy * sx],
		[sx * sz - cx * cz * sy, cz * sx + cx * sy * sz, cx * cy],
	]
}

function rotatePoint3(point, matrix) {
	const [x, y, z] = point
	return [
		matrix[0][0] * x + matrix[0][1] * y + matrix[0][2] * z,
		matrix[1][0] * x + matrix[1][1] * y + matrix[1][2] * z,
		matrix[2][0] * x + matrix[2][1] * y + matrix[2][2] * z,
	]
}

function normalize3(v) {
	const len = Math.hypot(v[0], v[1], v[2]) || 1
	return [v[0] / len, v[1] / len, v[2] / len]
}

function materialColorFactor(mat) {
	const factor = mat?.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1]
	return {
		r: Math.max(0, Math.min(255, Math.round((factor[0] ?? 1) * 255))),
		g: Math.max(0, Math.min(255, Math.round((factor[1] ?? 1) * 255))),
		b: Math.max(0, Math.min(255, Math.round((factor[2] ?? 1) * 255))),
		a: Math.max(0, Math.min(1, factor[3] ?? 1)),
		metallic: mat?.pbrMetallicRoughness?.metallicFactor ?? 0.2,
		roughness: mat?.pbrMetallicRoughness?.roughnessFactor ?? 0.35,
	}
}

function renderGeometryPosterPng({ geometry, size = 512, pose = 'heroTilt' }) {
	const matrix = rotationMatrixFromDegrees(poseToModelRotation(normalizeModelPose(pose)))
	const transformed = []
	for (const primitive of geometry.primitives) {
		const verts = []
		for (let i = 0; i < primitive.positions.length; i += 3) {
			verts.push(rotatePoint3([primitive.positions[i], primitive.positions[i + 1], primitive.positions[i + 2]], matrix))
		}
		transformed.push({ primitive, verts })
	}
	const all = transformed.flatMap(p => p.verts)
	const min = [Infinity, Infinity, Infinity]
	const max = [-Infinity, -Infinity, -Infinity]
	for (const p of all) for (let i = 0; i < 3; i++) {
		if (p[i] < min[i]) min[i] = p[i]
		if (p[i] > max[i]) max[i] = p[i]
	}
	const w = Math.max(0.01, max[0] - min[0])
	const h = Math.max(0.01, max[1] - min[1])
	const scale = size * 0.68 / Math.max(w, h)
	const cx = (min[0] + max[0]) / 2
	const cy = (min[1] + max[1]) / 2
	const rgba = Buffer.alloc(size * size * 4)
	const zbuf = new Float32Array(size * size)
	zbuf.fill(-Infinity)
	const overPixel = (x, y, r, g, b, a) => {
		const idx = (y * size + x) * 4
		const da = rgba[idx + 3] / 255
		const oa = a + da * (1 - a)
		if (oa <= 0) return
		rgba[idx] = Math.round((r * a + rgba[idx] * da * (1 - a)) / oa)
		rgba[idx + 1] = Math.round((g * a + rgba[idx + 1] * da * (1 - a)) / oa)
		rgba[idx + 2] = Math.round((b * a + rgba[idx + 2] * da * (1 - a)) / oa)
		rgba[idx + 3] = Math.round(oa * 255)
	}
	const shadowCx = size / 2
	const shadowCy = size * 0.72
	const shadowRx = size * 0.28
	const shadowRy = size * 0.07
	for (let y = Math.max(0, Math.floor(shadowCy - shadowRy * 2)); y < Math.min(size, Math.ceil(shadowCy + shadowRy * 2)); y++) {
		for (let x = Math.max(0, Math.floor(shadowCx - shadowRx * 2)); x < Math.min(size, Math.ceil(shadowCx + shadowRx * 2)); x++) {
			const d = ((x - shadowCx) / shadowRx) ** 2 + ((y - shadowCy) / shadowRy) ** 2
			if (d < 1.8) overPixel(x, y, 0, 0, 0, Math.max(0, (1 - d / 1.8) * 0.22))
		}
	}
	const project = p => [size / 2 + (p[0] - cx) * scale, size / 2 - (p[1] - cy) * scale, p[2]]
	const light = normalize3([-0.45, 0.72, 0.8])
	const view = [0, 0, 1]
	for (const { primitive, verts } of transformed) {
		const mat = materialColorFactor(geometry.materials[primitive.materialIndex])
		for (let i = 0; i < primitive.indices.length; i += 3) {
			const a = project(verts[primitive.indices[i]])
			const b = project(verts[primitive.indices[i + 1]])
			const c = project(verts[primitive.indices[i + 2]])
			const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
			const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
			let normal = normalize3([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx])
			if (normal[2] < 0) normal = [-normal[0], -normal[1], -normal[2]]
			const diffuse = Math.max(0.08, Math.abs(normal[0] * light[0] + normal[1] * light[1] + normal[2] * light[2]))
			const rim = Math.max(0, 1 - Math.abs(normal[0] * view[0] + normal[1] * view[1] + normal[2] * view[2]))
			const sheen = Math.pow(Math.max(0, diffuse), Math.max(5, 18 * (1 - mat.roughness))) * (0.14 + mat.metallic * 0.16)
			const shade = Math.min(1.22, 0.52 + diffuse * 0.55 + rim * 0.18 + sheen)
			const r = Math.min(255, Math.round(mat.r * shade + 255 * sheen * 0.18))
			const g = Math.min(255, Math.round(mat.g * shade + 255 * sheen * 0.18))
			const bcol = Math.min(255, Math.round(mat.b * shade + 255 * sheen * 0.18))
			const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]) - 1))
			const maxX = Math.min(size - 1, Math.ceil(Math.max(a[0], b[0], c[0]) + 1))
			const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]) - 1))
			const maxY = Math.min(size - 1, Math.ceil(Math.max(a[1], b[1], c[1]) + 1))
			const denom = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
			if (Math.abs(denom) < 1e-6) continue
			for (let py = minY; py <= maxY; py++) {
				for (let px = minX; px <= maxX; px++) {
					const sx = px + 0.5, sy = py + 0.5
					const w1 = ((b[1] - c[1]) * (sx - c[0]) + (c[0] - b[0]) * (sy - c[1])) / denom
					const w2 = ((c[1] - a[1]) * (sx - c[0]) + (a[0] - c[0]) * (sy - c[1])) / denom
					const w3 = 1 - w1 - w2
					if (w1 < -0.002 || w2 < -0.002 || w3 < -0.002) continue
					const z = w1 * a[2] + w2 * b[2] + w3 * c[2]
					const idx = py * size + px
					if (z <= zbuf[idx]) continue
					zbuf[idx] = z
					overPixel(px, py, r, g, bcol, mat.a)
				}
			}
		}
	}
	return rgbaToPng(size, size, rgba)
}

function posterPoseSample(pose, x, y) {
	switch (pose) {
		case 'threeQuarterRight': return { x: x * 1.16 - y * 0.14 + 0.06, y: y * 0.92 + x * 0.04 }
		case 'threeQuarterLeft': return { x: x * 1.16 + y * 0.14 - 0.06, y: y * 0.92 - x * 0.04 }
		case 'sideRight': return { x: x * 1.46 - y * 0.26 + 0.16, y: y * 0.88 + x * 0.04 }
		case 'sideLeft': return { x: x * 1.46 + y * 0.26 - 0.16, y: y * 0.88 - x * 0.04 }
		case 'topDown': return { x: x * 1.02 - y * 0.08, y: y * 1.34 + 0.04 }
		case 'dramatic': return { x: x * 1.18 + y * 0.24 - 0.08, y: y * 0.82 - x * 0.12 + 0.03 }
		case 'heroTilt': return { x: x * 1.12 - y * 0.10 + 0.03, y: y * 0.92 + x * 0.06 }
		default: return { x, y }
	}
}

function createPosterPng({ kind, colors, size = 512, pose = 'heroTilt' }) {
	const normalizedPose = normalizeModelPose(pose)
	const primary = rgbFactor(colors.primary).slice(0, 3).map(v => Math.round(v * 255))
	const accent = rgbFactor(colors.accent).slice(0, 3).map(v => Math.round(v * 255))
	const dark = rgbFactor(colors.dark).slice(0, 3).map(v => Math.round(v * 255))
	const highlight = rgbFactor(colors.highlight).slice(0, 3).map(v => Math.round(v * 255))
	const clamp = v => Math.max(0, Math.min(255, Math.round(v)))
	const lerp = (a, b, t) => a + (b - a) * t
	const mixRgb = (a, b, t) => a.map((v, i) => clamp(lerp(v, b[i], t)))
	const smooth = (edge0, edge1, x) => {
		const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
		return t * t * (3 - 2 * t)
	}
	const sdRoundRect = (px, py, cx, cy, w, h, r) => {
		const qx = Math.abs(px - cx) - w / 2 + r
		const qy = Math.abs(py - cy) - h / 2 + r
		return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
	}
	const pointInPoly = (px, py, pts) => {
		let inside = false
		for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
			const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1]
			if (((yi > py) !== (yj > py)) && px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-6) + xi) inside = !inside
		}
		return inside
	}
	const raw = Buffer.alloc((size * 4 + 1) * size)
	for (let y = 0; y < size; y++) {
		const row = y * (size * 4 + 1)
		raw[row] = 0
		for (let x = 0; x < size; x++) {
			const rawPx = ((x + 0.5) / size) * 2 - 1
			const rawPy = ((y + 0.5) / size) * 2 - 1
			const sample = posterPoseSample(normalizedPose, rawPx, rawPy)
			const px = sample.x
			const py = sample.y
			let out = [0, 0, 0, 0]
			const over = (rgb, alpha) => {
				const a = Math.max(0, Math.min(1, alpha))
				if (a <= 0) return
				const da = out[3]
				const oa = a + da * (1 - a)
				out = [
					(rgb[0] * a + out[0] * da * (1 - a)) / oa,
					(rgb[1] * a + out[1] * da * (1 - a)) / oa,
					(rgb[2] * a + out[2] * da * (1 - a)) / oa,
					oa,
				]
			}
			const drawRound = (cx, cy, w, h, r, c0, c1, opacity = 1, softness = 0.012) => {
				const d = sdRoundRect(px, py, cx, cy, w, h, r)
				const a = (1 - smooth(-softness, softness, d)) * opacity
				if (a <= 0) return false
				const shade = Math.max(0, Math.min(1, (px - cx + 0.75) * 0.45 + (py - cy + 0.6) * 0.25))
				const lit = mixRgb(c0, c1, shade)
				const sheen = Math.max(0, 1 - Math.hypot(px - cx + w * 0.26, py - cy + h * 0.32) / 0.58)
				over(mixRgb(lit, highlight, sheen * 0.2), a)
				return d < 0
			}
			const drawCircle = (cx, cy, radius, c0, c1, opacity = 1) => {
				const d = Math.hypot(px - cx, py - cy) - radius
				const a = (1 - smooth(-0.01, 0.012, d)) * opacity
				if (a <= 0) return false
				const shade = Math.max(0, Math.min(1, (px - cx) * 0.6 + (py - cy) * 0.3 + 0.45))
				over(mixRgb(c0, c1, shade), a)
				return d < 0
			}
			const drawPoly = (pts, rgb, opacity = 1) => {
				if (pointInPoly(px, py, pts)) over(rgb, opacity)
			}
			const halo = Math.max(0, 1 - Math.hypot(px + 0.05, py + 0.02) / 0.95)
			over(primary, halo * 0.12)
			const shadow = 1 - smooth(-0.05, 0.24, sdRoundRect(px, py, 0.12, 0.14, 1.26, 0.96, 0.2))
			over([0, 0, 0], shadow * 0.32)
			drawRound(0.09, 0.1, 1.26, 0.96, 0.18, mixRgb(dark, primary, 0.28), mixRgb(dark, accent, 0.28), 0.95)
			drawRound(-0.03, -0.06, 1.3, 0.98, 0.18, primary, accent, 1)
			if (kind === 'arrow') {
				drawRound(-0.2, 0.02, 0.82, 0.22, 0.11, mixRgb(highlight, primary, 0.18), mixRgb(highlight, accent, 0.2), 0.98)
				drawPoly([[0.16, -0.33], [0.62, 0.02], [0.16, 0.37]], highlight, 0.96)
				drawCircle(-0.58, 0.02, 0.16, highlight, mixRgb(highlight, primary, 0.2), 0.96)
				drawRound(-0.06, -0.28, 0.68, 0.055, 0.025, highlight, [255, 255, 255], 0.52)
			} else if (kind === 'interface') {
				drawRound(-0.03, -0.42, 0.98, 0.14, 0.05, mixRgb(highlight, primary, 0.3), mixRgb(highlight, accent, 0.25), 0.96)
				drawCircle(-0.45, -0.42, 0.032, highlight, highlight, 0.98)
				drawCircle(-0.34, -0.42, 0.032, highlight, highlight, 0.72)
				drawCircle(-0.23, -0.42, 0.032, highlight, highlight, 0.52)
				drawRound(-0.34, -0.07, 0.34, 0.16, 0.045, highlight, mixRgb(highlight, primary, 0.28), 0.86)
				drawRound(0.24, -0.08, 0.42, 0.16, 0.045, accent, mixRgb(accent, highlight, 0.2), 0.9)
				drawRound(-0.1, 0.24, 0.78, 0.13, 0.045, mixRgb(highlight, primary, 0.18), highlight, 0.78)
				drawPoly([[0.12, -0.1], [0.58, 0.22], [0.34, 0.25], [0.47, 0.52], [0.31, 0.58], [0.18, 0.31], [0.02, 0.43]], [255, 255, 255], 0.96)
				drawCircle(0.5, 0.48, 0.09, accent, highlight, 0.95)
			} else if (kind === 'user') {
				drawCircle(0, -0.13, 0.21, highlight, mixRgb(highlight, primary, 0.25), 1)
				drawRound(0, 0.27, 0.72, 0.34, 0.17, highlight, mixRgb(highlight, accent, 0.25), 1)
			} else if (kind === 'person') {
				drawCircle(0, -0.42, 0.17, highlight, mixRgb(highlight, primary, 0.2), 1)
				drawRound(0, -0.06, 0.48, 0.56, 0.14, highlight, mixRgb(highlight, primary, 0.35), 1)
				drawRound(-0.35, -0.03, 0.22, 0.12, 0.06, accent, highlight, 0.9)
				drawRound(0.35, -0.03, 0.22, 0.12, 0.06, accent, highlight, 0.9)
				drawRound(-0.12, 0.48, 0.13, 0.34, 0.06, highlight, accent, 0.9)
				drawRound(0.12, 0.48, 0.13, 0.34, 0.06, highlight, accent, 0.9)
			} else if (kind === 'team') {
				for (const [cx, r] of [[-0.38, 0.14], [0, 0.18], [0.38, 0.14]]) {
					drawCircle(cx, -0.28, r, highlight, mixRgb(highlight, primary, 0.25), 1)
					drawRound(cx, 0.16, r * 3.1, 0.36, r * 0.95, cx === 0 ? highlight : accent, mixRgb(highlight, primary, 0.35), 0.94)
				}
			} else if (kind === 'robot') {
				drawRound(0, -0.22, 0.72, 0.44, 0.1, highlight, primary, 0.96)
				drawRound(0, 0.26, 0.82, 0.48, 0.12, mixRgb(dark, primary, 0.4), accent, 0.96)
				drawCircle(-0.18, -0.23, 0.055, [255,255,255], highlight, 1)
				drawCircle(0.18, -0.23, 0.055, [255,255,255], highlight, 1)
				drawRound(-0.55, 0.22, 0.28, 0.12, 0.06, accent, highlight, 0.88)
				drawRound(0.55, 0.22, 0.28, 0.12, 0.06, accent, highlight, 0.88)
			} else if (kind === 'device') {
				drawRound(0, -0.12, 0.9, 0.58, 0.08, mixRgb(dark, primary, 0.42), primary, 1)
				drawRound(0, -0.12, 0.66, 0.36, 0.04, accent, mixRgb(accent, highlight, 0.18), 0.94)
				drawRound(0, 0.44, 1.08, 0.2, 0.06, highlight, primary, 0.96)
				drawRound(0, 0.44, 0.24, 0.045, 0.02, dark, primary, 0.55)
			} else if (kind === 'package') {
				drawRound(0, 0.05, 0.78, 0.72, 0.05, primary, accent, 1)
				drawRound(0, 0.05, 0.12, 0.74, 0.03, highlight, [255,255,255], 0.72)
				drawRound(0, -0.24, 0.82, 0.12, 0.03, highlight, [255,255,255], 0.72)
				drawPoly([[-0.2,-0.5],[0,-0.25],[-0.05,-0.02],[-0.34,-0.32]], accent, 0.96)
				drawPoly([[0.2,-0.5],[0,-0.25],[0.05,-0.02],[0.34,-0.32]], accent, 0.96)
			} else if (kind === 'product') {
				drawRound(0, 0.02, 0.62, 0.78, 0.16, highlight, primary, 1)
				drawCircle(0.28, -0.35, 0.12, accent, highlight, 0.95)
				drawRound(-0.08, 0.0, 0.36, 0.13, 0.04, accent, highlight, 0.9)
			} else if (kind === 'scene') {
				drawRound(0, 0.52, 1.0, 0.18, 0.09, mixRgb(dark, primary, 0.35), primary, 0.9)
				drawRound(-0.36, 0.08, 0.24, 0.72, 0.03, primary, accent, 0.96)
				drawRound(-0.02, -0.04, 0.25, 0.92, 0.03, accent, highlight, 0.9)
				drawRound(0.32, 0.18, 0.26, 0.52, 0.03, primary, highlight, 0.88)
				drawCircle(0.62, 0.02, 0.15, accent, highlight, 0.9)
			} else if (kind === 'vehicle') {
				drawRound(0, 0.05, 0.98, 0.34, 0.12, primary, accent, 1)
				drawRound(-0.02, -0.18, 0.54, 0.25, 0.08, accent, highlight, 0.9)
				drawCircle(-0.34, 0.31, 0.13, dark, highlight, 0.95)
				drawCircle(0.34, 0.31, 0.13, dark, highlight, 0.95)
			} else if (kind === 'trophy') {
				drawRound(0, 0.5, 0.72, 0.12, 0.06, accent, highlight, 0.9)
				drawRound(0, 0.12, 0.22, 0.56, 0.09, accent, highlight, 0.96)
				drawCircle(0, -0.2, 0.34, highlight, accent, 1)
				drawRound(-0.42, -0.08, 0.3, 0.09, 0.04, highlight, accent, 0.88)
				drawRound(0.42, -0.08, 0.3, 0.09, 0.04, highlight, accent, 0.88)
			} else if (kind === 'toggle') {
				drawRound(-0.05, 0.02, 0.98, 0.34, 0.17, accent, mixRgb(accent, highlight, 0.25), 0.95)
				drawCircle(0.33, 0.02, 0.23, highlight, [255, 255, 255], 1)
			} else if (kind === 'cloud') {
				drawCircle(-0.26, 0.02, 0.2, highlight, primary, 0.98)
				drawCircle(0.02, -0.13, 0.27, highlight, primary, 0.98)
				drawCircle(0.32, 0.03, 0.2, highlight, primary, 0.98)
				drawRound(0.02, 0.16, 0.82, 0.24, 0.12, highlight, primary, 0.98)
				drawPoly([[-0.08, 0.46], [0.08, 0.46], [0.08, 0.16], [0.22, 0.16], [0, -0.08], [-0.22, 0.16], [-0.08, 0.16]], accent, 0.95)
			} else {
				const inMark = kind === 'shield'
					? Math.abs(px) < (0.28 - Math.max(0, py) * 0.1) && py > -0.28 && py < 0.32
					: kind === 'bell'
						? Math.abs(px) < (0.2 + Math.max(0, py) * 0.13) && py > -0.26 && py < 0.33
						: kind === 'stack'
							? Math.abs(px) < 0.34 && Math.abs((py + 0.48) % 0.25) < 0.07
							: kind === 'spark'
								? Math.abs(px) + Math.abs(py) < 0.38 || Math.abs(px - py) < 0.05
								: Math.abs(px) + Math.abs(py * 0.7) < 0.38
				if (inMark) over(highlight, 0.9)
			}
			const idx = row + 1 + x * 4
			raw[idx] = clamp(out[0])
			raw[idx + 1] = clamp(out[1])
			raw[idx + 2] = clamp(out[2])
			raw[idx + 3] = clamp(out[3] * 255)
		}
	}
	const ihdr = Buffer.alloc(13)
	ihdr.writeUInt32BE(size, 0)
	ihdr.writeUInt32BE(size, 4)
	ihdr[8] = 8
	ihdr[9] = 6
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		pngChunk('IHDR', ihdr),
		pngChunk('IDAT', zlib.deflateSync(raw)),
		pngChunk('IEND', Buffer.alloc(0)),
	])
}

async function handleGenerateModel3DIcon(args = {}) {
	const context = args.context || args.prompt || args.narration || ''
	const kind = inferIconKind(context, args.kind || 'auto')
	const optimizeFor = args.optimizeFor || (kind === 'arrow' ? 'navigation' : 'slides')
	const generationMode = String(args.generationMode || args.engine || 'auto').toLowerCase()
	const qualityTarget = String(args.qualityTarget || args.quality || '').toLowerCase()
	const inferredDetail = generationMode === 'compact'
		? 'low'
		: generationMode === 'high-fidelity' || qualityTarget === 'premium' || qualityTarget === 'hero'
			? 'high'
			: (optimizeFor === 'navigation' ? 'low' : 'medium')
	const profile = modelDetailProfile(args.detail || inferredDetail, qualityTarget === 'premium' || qualityTarget === 'hero' ? 'quality' : optimizeFor)
	const nativeOnly = nativeOnlyModel3DRequested(args)
	const colors = {
		primary: cleanHex(args.primaryColor || args.color || '22D3EE', '22D3EE'),
		accent: cleanHex(args.accentColor || 'A78BFA', 'A78BFA'),
		highlight: cleanHex(args.highlightColor || 'F8FAFC', 'F8FAFC'),
		dark: cleanHex(args.darkColor || '0F172A', '0F172A'),
	}
	const pose = normalizeModelPose(args.pose || args.view || args.posterView)
	const modelRotation = poseToModelRotation(pose)
	const name = safeStem(args.name || context || `${kind}-asset`)
	const outputDir = path.resolve(isPublicBlackBoxMode() ? path.join(process.cwd(), 'outputs', 'generated-model3d-assets') : (args.outputDir || path.join(process.cwd(), 'outputs', 'generated-model3d-assets')))
	await fs.mkdir(outputDir, { recursive: true })
	const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`
	const glbFile = path.join(outputDir, `${name}-${kind}-${suffix}.glb`)
	const rasterFile = path.join(outputDir, `${name}-${kind}-${suffix}.png`)
	const suggestedAnimations = {
		reveal: { type: 'entrance', effect: 'arrive', direction: 'right', intensity: 'moderate', duration: 650 },
		turntable: { type: 'emphasis', effect: 'turntable', direction: 'clockwise', intensity: 'moderate', duration: 3600, rotationAxis: 'object' },
		settle: { type: 'emphasis', effect: 'swing', direction: 'view', intensity: 'subtle', duration: 900 },
	}
	const openSourceAsset = await resolveOpenSourceModel3DAsset(kind, { ...args, context })
	if (openSourceAsset) {
		const publicBlackBox = isPublicBlackBoxMode()
		let externalModelFile = openSourceAsset.modelPath
		let externalPosterFile = openSourceAsset.posterPath
		let modelBytes = externalModelFile ? fsNode.statSync(externalModelFile).size : 0
		let posterBytes = !nativeOnly && externalPosterFile ? fsNode.statSync(externalPosterFile).size : null
		if (!externalModelFile || (!nativeOnly && !externalPosterFile)) {
			const modelUrl = openSourceAsset.asset.model_file_url
			if (!externalModelFile) {
				const modelFetch = await fetchBufferWithLimit(modelUrl, { maxBytes: openSourceAsset.maxAssetBytes })
				const modelExt = fileExtFromUrl(modelUrl, modelFetch.contentType, '.glb')
				externalModelFile = path.join(outputDir, `${name}-${kind}-${suffix}${modelExt}`)
				await fs.writeFile(externalModelFile, modelFetch.buffer)
				modelBytes = modelFetch.buffer.length
			}
			if (!nativeOnly && !externalPosterFile) {
				const posterUrl = openSourceAsset.asset.thumbnail_url
				const posterFetch = await fetchBufferWithLimit(posterUrl, { maxBytes: 2 * 1024 * 1024 })
				const posterExt = fileExtFromUrl(posterUrl, posterFetch.contentType, '.png')
				externalPosterFile = path.join(outputDir, `${name}-${kind}-${suffix}${posterExt}`)
				await fs.writeFile(externalPosterFile, posterFetch.buffer)
				posterBytes = posterFetch.buffer.length
			}
		}
		const publicGlbRef = registerGeneratedAsset(externalModelFile, 'model3d')
		const publicRasterRef = nativeOnly || !externalPosterFile ? null : registerGeneratedAsset(externalPosterFile, 'poster')
		const stats = await countPrimitiveStatsFromGlbFile(externalModelFile)
		const suggestedModel3DOptions = {
			...model3DOptionReferenceFields(publicBlackBox, publicGlbRef, publicRasterRef, nativeOnly),
			w: args.w ?? 2.25,
			h: args.h ?? 2.25,
			camera: { pos: { x: 0, y: 0, z: 72000000 }, fov: 34 },
			trans: {
				scale: { x: 1.04, y: 1.04, z: 1.04 },
				rot: modelRotation,
			},
			ambientLight: { color: { r: 180, g: 200, b: 255 }, illuminance: 0.64 },
			ptLights: [
				{ color: { r: 120, g: 230, b: 255 }, intensity: 9.5, pos: { x: 24000000, y: 56000000, z: 30000000 } },
				{ color: { r: 210, g: 160, b: 255 }, intensity: 5.2, pos: { x: -38000000, y: 26000000, z: 45000000 } },
			],
			shadow: { type: 'outer', color: '000000', opacity: 0.28, blur: 4, angle: 45, distance: 1.4 },
		}
		const withRotation = (z, label) => ({
			meaning: label,
			modelOptionsPatch: { trans: { ...(suggestedModel3DOptions.trans || {}), rot: { ...(suggestedModel3DOptions.trans?.rot || {}), z } } },
			shapePatch: { rotate: z },
		})
		const reuseVariants = kind === 'arrow' ? {
			forward: withRotation(0, 'next, continue, forward, route right'),
			back: withRotation(180, 'previous, return, route left'),
			up: withRotation(270, 'promote, go up, scroll up'),
			down: withRotation(90, 'download, descend, drill down'),
			branch: withRotation(35, 'branch, redirect, explore alternate path'),
		} : null
		return {
			ok: true,
			kind,
			context: context || null,
			palette: colors,
			...model3DReferenceFields(publicBlackBox, publicGlbRef, publicRasterRef, nativeOnly),
			bytes: model3DByteSummary(publicBlackBox, modelBytes, posterBytes, nativeOnly),
			geometry: {
				vertexCount: stats?.vertexCount ?? null,
				triangleCount: stats?.triangleCount ?? null,
				primitiveCount: stats?.primitiveCount ?? null,
				materialCount: stats?.materialCount ?? null,
				bounds: null,
				view360Ready: true,
				style: openSourceAsset.profile,
				pose,
				fallback: nativeOnly ? 'none' : 'paired',
			},
			generation: publicBlackBox ? {
				mode: generationMode,
				assetProfile: openSourceAsset.profile,
				quality: openSourceAsset.tier === 'presentation-optimized-paired' ? 'presentation-optimized' : 'open-source-high-fidelity',
				format: nativeOnly ? 'presentation-ready native 3D model' : 'presentation-ready 3D model with matched poster fallback',
				pose,
			} : {
				mode: generationMode,
				quality: openSourceAsset.tier === 'presentation-optimized-paired' ? 'presentation-optimized' : 'open-source-high-fidelity',
				assetTier: openSourceAsset.tier,
				score: openSourceAsset.score,
			},
			optimization: {
				optimizeFor,
				detail: profile.detail,
				posterSize: nativeOnly ? null : Math.max(128, Math.min(1024, Math.round(Number(args.posterSize || profile.posterSize)))),
				slideOptimized: modelBytes <= openSourceAsset.maxAssetBytes,
				reuseAsset: kind === 'arrow',
				assetBytesBeforeOptimization: modelBytes,
				assetBytesAfterOptimization: modelBytes,
				pose,
				target: optimizeFor === 'navigation' ? 'small reusable asset for repeated navigation states and morph transitions' : (nativeOnly ? 'native 3D asset for polished slide use' : 'balanced asset/poster for polished slide use'),
				fallback: nativeOnly ? 'disabled' : 'paired',
			},
			suggestedModel3DOptions,
			suggestedAnimation: suggestedAnimations.reveal,
			suggestedAnimations,
			...(reuseVariants ? { reuseVariants } : {}),
			rationale: `Selected a ${kind} 3D model because the context suggested ${iconKindReason(kind)}.`,
		}
	}
	const curatedAsset = resolvePremiumModel3DAsset(kind, args)
	if (curatedAsset) {
		const publicBlackBox = isPublicBlackBoxMode()
		const publicGlbRef = registerGeneratedAsset(curatedAsset.modelPath, 'model3d')
		const publicRasterRef = nativeOnly ? null : registerGeneratedAsset(curatedAsset.posterPath, 'poster')
		const modelBytes = fsNode.statSync(curatedAsset.modelPath).size
		const posterBytes = nativeOnly ? null : fsNode.statSync(curatedAsset.posterPath).size
		const stats = await countPrimitiveStatsFromGlbFile(curatedAsset.modelPath)
		const suggestedModel3DOptions = {
			...model3DOptionReferenceFields(publicBlackBox, publicGlbRef, publicRasterRef, nativeOnly),
			w: args.w ?? 2.2,
			h: args.h ?? 2.2,
			camera: { pos: { x: 0, y: 0, z: 72000000 }, fov: 34 },
			trans: {
				scale: { x: 1.04, y: 1.04, z: 1.04 },
				rot: modelRotation,
			},
			ambientLight: { color: { r: 170, g: 190, b: 255 }, illuminance: 0.62 },
			ptLights: [
				{ color: { r: 120, g: 230, b: 255 }, intensity: 9.5, pos: { x: 24000000, y: 56000000, z: 30000000 } },
				{ color: { r: 210, g: 160, b: 255 }, intensity: 5.2, pos: { x: -38000000, y: 26000000, z: 45000000 } },
			],
			shadow: { type: 'outer', color: '000000', opacity: 0.28, blur: 4, angle: 45, distance: 1.4 },
		}
		const withRotation = (z, label) => ({
			meaning: label,
			modelOptionsPatch: { trans: { ...(suggestedModel3DOptions.trans || {}), rot: { ...(suggestedModel3DOptions.trans?.rot || {}), z } } },
			shapePatch: { rotate: z },
		})
		const reuseVariants = kind === 'arrow' ? {
			forward: withRotation(0, 'next, continue, forward, route right'),
			back: withRotation(180, 'previous, return, route left'),
			up: withRotation(270, 'promote, go up, scroll up'),
			down: withRotation(90, 'download, descend, drill down'),
			branch: withRotation(35, 'branch, redirect, explore alternate path'),
		} : null
		return {
			ok: true,
			kind,
			context: context || null,
			palette: colors,
			...model3DReferenceFields(publicBlackBox, publicGlbRef, publicRasterRef, nativeOnly),
			bytes: model3DByteSummary(publicBlackBox, modelBytes, posterBytes, nativeOnly),
			geometry: {
				vertexCount: stats?.vertexCount ?? null,
				triangleCount: stats?.triangleCount ?? null,
				primitiveCount: stats?.primitiveCount ?? null,
				materialCount: stats?.materialCount ?? null,
				bounds: null,
				view360Ready: true,
				style: curatedAsset.profile,
				pose,
				fallback: nativeOnly ? 'none' : 'paired',
			},
			generation: publicBlackBox ? {
				mode: generationMode,
				assetProfile: curatedAsset.profile,
				quality: 'high-fidelity',
				format: nativeOnly ? 'presentation-ready native 3D model' : 'presentation-ready 3D model with matched poster fallback',
				pose,
			} : {
				mode: generationMode,
				quality: 'high-fidelity',
				assetTier: curatedAsset.tier,
			},
			optimization: {
				optimizeFor,
				detail: profile.detail,
				posterSize: nativeOnly ? null : Math.max(128, Math.min(1024, Math.round(Number(args.posterSize || profile.posterSize)))),
				slideOptimized: optimizeFor === 'slides' || optimizeFor === 'navigation',
				reuseAsset: kind === 'arrow',
				assetBytesBeforeOptimization: modelBytes,
				assetBytesAfterOptimization: modelBytes,
				pose,
				target: optimizeFor === 'navigation' ? 'small reusable asset for repeated navigation states and morph transitions' : (nativeOnly ? 'native 3D asset for polished slide use' : 'balanced asset/poster for polished slide use'),
				fallback: nativeOnly ? 'disabled' : 'paired',
			},
			suggestedModel3DOptions,
			suggestedAnimation: suggestedAnimations.reveal,
			suggestedAnimations,
			...(reuseVariants ? { reuseVariants } : {}),
			rationale: `Selected a ${kind} 3D model because the context suggested ${iconKindReason(kind)}.`,
		}
	}
	const geometry = createIconGeometry(kind, colors, profile)
	const allPositions = geometry.primitives.flatMap(p => p.positions)
	const vertexCount = geometry.primitives.reduce((sum, p) => sum + p.positions.length / 3, 0)
	const triangleCount = geometry.primitives.reduce((sum, p) => sum + p.indices.length / 3, 0)
	const requestedEngine = ({ legacy: 'procedural', compact: 'auto', balanced: 'auto', 'high-fidelity': 'auto' }[generationMode] || generationMode || 'auto')
	let pipeline = {
		authoring: 'native procedural glTF writer',
		optimizer: 'none',
		format: 'glTF 2.0 binary GLB',
		fallbackUsed: requestedEngine !== 'procedural',
		beforeBytes: null,
		afterBytes: null,
		warnings: [],
	}
	let glb
	let authoredStats = null
	const threeGenerators = {
		arrow: createThreeArrowGlb,
		cloud: createThreeCloudGlb,
	}
	const threeGenerator = threeGenerators[kind]
	if ((requestedEngine === 'auto' || requestedEngine === 'three-gltf-transform') && threeGenerator) {
		try {
			const authored = await threeGenerator({ colors, profile, name: `${kind}-contextual-icon`, optimizeFor })
			glb = authored.glb
			authoredStats = authored.stats
			pipeline = authored.pipeline
		} catch (err) {
			if (requestedEngine === 'three-gltf-transform') throw err
			pipeline.warnings.push(err?.message || String(err))
		}
	}
	if (!glb) {
		glb = createGlbBuffer({ ...geometry, name: `${kind}-contextual-icon` })
		pipeline.beforeBytes = glb.length
		pipeline.afterBytes = glb.length
	}
	const posterSize = nativeOnly ? null : Math.max(128, Math.min(1024, Math.round(Number(args.posterSize || profile.posterSize))))
	let poster = null
	if (!nativeOnly) poster = renderGeometryPosterPng({ geometry, size: posterSize, pose })
	await fs.writeFile(glbFile, glb)
	if (poster) await fs.writeFile(rasterFile, poster)
	const publicGlbRef = registerGeneratedAsset(glbFile, 'model3d')
	const publicRasterRef = nativeOnly ? null : registerGeneratedAsset(rasterFile, 'poster')
	const publicBlackBox = isPublicBlackBoxMode()
	const premiumCloud = kind === 'cloud' && threeGenerator
	const modelFov = premiumCloud ? 32 : 34
	const modelScale = premiumCloud ? 1.16 : 1.04
	const suggestedModel3DOptions = {
		...model3DOptionReferenceFields(publicBlackBox, publicGlbRef, publicRasterRef, nativeOnly),
		w: args.w ?? 2.2,
		h: args.h ?? 2.2,
		camera: { pos: { x: 0, y: 0, z: 72000000 }, fov: modelFov },
		trans: {
			scale: { x: modelScale, y: modelScale, z: modelScale },
			rot: modelRotation,
		},
		...(premiumCloud ? { objViewport: 3300000 } : {}),
		ambientLight: { color: { r: 170, g: 190, b: 255 }, illuminance: premiumCloud ? 0.7 : 0.58 },
		ptLights: [
			{ color: { r: 120, g: 230, b: 255 }, intensity: premiumCloud ? 10.2 : 9.5, pos: { x: 24000000, y: 56000000, z: 30000000 } },
			{ color: premiumCloud ? { r: 255, g: 202, b: 120 } : { r: 210, g: 160, b: 255 }, intensity: premiumCloud ? 6.4 : 5.2, pos: { x: -38000000, y: 26000000, z: 45000000 } },
		],
		shadow: { type: 'outer', color: '000000', opacity: 0.28, blur: 4, angle: 45, distance: 1.4 },
	}
	const withRotation = (z, label) => ({
		meaning: label,
		modelOptionsPatch: { trans: { ...(suggestedModel3DOptions.trans || {}), rot: { ...(suggestedModel3DOptions.trans?.rot || {}), z } } },
		shapePatch: { rotate: z },
	})
	const reuseVariants = kind === 'arrow' ? {
		forward: withRotation(0, 'next, continue, forward, route right'),
		back: withRotation(180, 'previous, return, route left'),
		up: withRotation(270, 'promote, go up, scroll up'),
		down: withRotation(90, 'download, descend, drill down'),
		branch: withRotation(35, 'branch, redirect, explore alternate path'),
	} : null
	const technology = publicBlackBox ? undefined : {
		...pipeline,
		currentDefault: threeGenerator ? 'three.js authoring with glTF-Transform optimization; native procedural fallback' : 'native procedural glTF writer; Three.js path reserved for complex/reusable assets',
		recommendation: 'Use Three.js for context-aware shape construction and glTF-Transform for optimization, validation, dedupe, and size budgets.',
		}
	const byteSummary = model3DByteSummary(publicBlackBox, glb.length, poster?.length, nativeOnly)
	const optimizationSummary = publicBlackBox ? {
		optimizeFor,
		detail: profile.detail,
		posterSize,
		slideOptimized: optimizeFor === 'slides' || optimizeFor === 'navigation',
			reuseAsset: kind === 'arrow',
			assetBytesBeforeOptimization: pipeline.beforeBytes,
			assetBytesAfterOptimization: pipeline.afterBytes,
			pose,
			target: optimizeFor === 'navigation' ? 'small reusable asset for repeated navigation states and morph transitions' : (nativeOnly ? 'native 3D asset for polished slide use' : 'balanced asset/poster for polished slide use'),
			fallback: nativeOnly ? 'disabled' : 'mesh-rendered',
	} : {
		optimizeFor,
		detail: profile.detail,
		posterSize,
		slideOptimized: optimizeFor === 'slides' || optimizeFor === 'navigation',
		reuseAsset: kind === 'arrow',
		glbBytesBeforeOptimization: pipeline.beforeBytes,
		glbBytesAfterOptimization: pipeline.afterBytes,
		pose,
		target: optimizeFor === 'navigation' ? 'small reusable GLB for repeated navigation states and morph transitions' : (nativeOnly ? 'native GLB for polished slide use' : 'balanced GLB/poster for polished slide use'),
		fallback: nativeOnly ? 'disabled' : 'mesh-rendered',
	}
	return {
		ok: true,
		kind,
		context: context || null,
		palette: colors,
		...model3DReferenceFields(publicBlackBox, publicGlbRef, publicRasterRef, nativeOnly),
		bytes: byteSummary,
		geometry: {
			vertexCount: authoredStats?.vertexCount ?? vertexCount,
			triangleCount: authoredStats?.triangleCount ?? triangleCount,
			primitiveCount: authoredStats?.primitiveCount ?? geometry.primitives.length,
			materialCount: authoredStats?.materialCount ?? geometry.materials.length,
			bounds: allPositions.length ? bounds3(allPositions) : null,
			view360Ready: true,
			style: kind === 'arrow' ? 'glossy-reusable-navigation' : (kind === 'cloud' && threeGenerator ? 'premium-native-cloud-upload' : 'contextual-glossy-3d-object'),
			pose,
			fallback: nativeOnly ? 'none' : 'mesh-rendered',
		},
		...(technology ? { technology } : {}),
		generation: publicBlackBox ? {
			mode: generationMode,
			assetProfile: kind === 'arrow' ? 'reusable navigation object' : 'contextual presentation object',
			optimized: pipeline.afterBytes != null && pipeline.beforeBytes != null ? pipeline.afterBytes <= pipeline.beforeBytes : true,
			format: nativeOnly ? 'presentation-ready native 3D model' : 'presentation-ready 3D model with poster fallback',
			pose,
			quality: kind === 'cloud' && threeGenerator ? 'premium-procedural' : 'procedural',
		} : { mode: generationMode },
		optimization: optimizationSummary,
		suggestedModel3DOptions,
		suggestedAnimation: suggestedAnimations.reveal,
		suggestedAnimations,
		...(reuseVariants ? { reuseVariants } : {}),
		rationale: `Generated a ${kind} 3D model because the context suggested ${iconKindReason(kind)}.`,
	}
}

// =============================================================================
//  HTTP FETCH — generic primitive for fetching any online asset.
//  Lets the AI client compose "search → fetch → embed" pipelines in one session.
// =============================================================================
async function handleHttpFetch(args) {
	if (process.env.BETTERPPTX_ENABLE_GENERIC_HTTP_FETCH !== '1') {
		throw new SafeFetchError(
			'SAFE_FETCH_REFUSED',
			'Generic server-side URL fetching is disabled. Use presentation media/image tools with direct public media URLs instead.'
		)
	}
	const url = String(args.url || '').trim()
	if (!url) throw new Error('http.fetch: `url` is required')
	const method = (args.method || 'GET').toUpperCase()
	const headers = args.headers || {}
	const responseType = args.responseType || 'auto'  // auto | text | json | base64 | raw
	const maxBytes = args.maxBytes || 50 * 1024 * 1024  // 50 MB cap
	const timeoutMs = args.timeoutMs || 30000

	try {
		const fetched = await safeFetchToBuffer(url, {
			method,
			headers,
			body: args.body !== undefined ? args.body : undefined,
			timeoutMs,
			maxBytes,
		})
		const buf = fetched.buffer
		const respHeaders = fetched.headers
		const contentType = respHeaders['content-type'] || 'application/octet-stream'

		let kind = responseType
		if (kind === 'auto') {
			if (/json/.test(contentType)) kind = 'json'
			else if (/text|xml|html|svg|csv|geo\+json/.test(contentType)) kind = 'text'
			else kind = 'base64'
		}

		let savedTo = null
		if (args.saveToPath) {
			const out = path.isAbsolute(args.saveToPath) ? args.saveToPath : path.resolve(process.cwd(), args.saveToPath)
			await fs.mkdir(path.dirname(out), { recursive: true })
			await fs.writeFile(out, buf)
			savedTo = out
		}

		const result = {
			url: fetched.url || url,
			status: fetched.status,
			statusText: fetched.statusText,
			ok: fetched.ok,
			contentType,
			bytes: buf.length,
			headers: respHeaders,
			responseType: kind,
			savedTo,
		}
		if (savedTo && !args.alsoReturnBody) {
			// Save-only mode — don't ship the bytes back over MCP unless explicitly asked
			return result
		}
		if (kind === 'json') {
			try { result.content = JSON.parse(buf.toString('utf-8')) }
			catch (e) { result.content = buf.toString('utf-8'); result.parseError = e.message }
		} else if (kind === 'text') {
			result.content = buf.toString('utf-8')
		} else {
			result.content = buf.toString('base64')
		}
		return result
	} catch (e) {
		if (e instanceof SafeFetchError) throw e
		throw new Error(`http.fetch: ${e.message || e}`)
	}
}

const REMOTE_IMAGE_MAX_BYTES = Number(process.env.BETTERPPTX_REMOTE_IMAGE_MAX_BYTES || 25 * 1024 * 1024)
const REMOTE_IMAGE_FETCH_HEADERS = {
	'User-Agent': process.env.BETTERPPTX_FETCH_USER_AGENT || 'betterpptx-image-fetch/1.0',
	'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
}

function isRemoteUrl(value) {
	return typeof value === 'string' && /^https?:\/\//i.test(value)
}

function urlImageExtension(url) {
	try {
		const ext = path.extname(new URL(url).pathname).replace(/^\./, '').toLowerCase()
		return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tif', 'tiff'].includes(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : null
	} catch (_) {
		return null
	}
}

function inferImageExtension(contentType, buf, url) {
	const ct = String(contentType || '').split(';')[0].trim().toLowerCase()
	if (ct === 'image/jpeg' || ct === 'image/jpg') return 'jpg'
	if (ct === 'image/png') return 'png'
	if (ct === 'image/gif') return 'gif'
	if (ct === 'image/webp') return 'webp'
	if (ct === 'image/svg+xml') return 'svg'
	if (ct === 'image/bmp') return 'bmp'
	if (ct === 'image/tiff') return 'tiff'
	if (buf?.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
	if (buf?.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png'
	if (buf?.length >= 6 && Buffer.from(buf.subarray(0, 3)).toString('ascii') === 'GIF') return 'gif'
	if (buf?.length >= 12 && Buffer.from(buf.subarray(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(buf.subarray(8, 12)).toString('ascii') === 'WEBP') return 'webp'
	const head = buf?.subarray(0, Math.min(buf.length, 512)).toString('utf8').trimStart() || ''
	if (/^<\?xml[\s\S]*<svg\b/i.test(head) || /^<svg\b/i.test(head)) return 'svg'
	return urlImageExtension(url)
}

async function materializeRemoteImageOptions(options) {
	if (!options || typeof options !== 'object' || Array.isArray(options) || !isRemoteUrl(options.path)) return options

	const fetched = await safeFetchToBuffer(options.path, {
		headers: REMOTE_IMAGE_FETCH_HEADERS,
		maxBytes: REMOTE_IMAGE_MAX_BYTES,
		timeoutMs: 30000,
		requireImage: true,
	})
	const buf = fetched.buffer
	if (!fetched.ok) {
		throw new Error(`slide.add_image: remote image fetch failed (${fetched.status} ${fetched.statusText})`)
	}
	if (buf.length > REMOTE_IMAGE_MAX_BYTES) {
		throw new Error(`slide.add_image: remote image is too large (${buf.length} bytes; max ${REMOTE_IMAGE_MAX_BYTES})`)
	}
	const contentType = fetched.headers['content-type'] || ''
	const ext = inferImageExtension(contentType, buf, options.path)
	if (!ext || (!String(contentType).toLowerCase().startsWith('image/') && !['jpg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff'].includes(ext))) {
		throw new Error(`slide.add_image: remote URL did not return an image (content-type: ${contentType || 'unknown'})`)
	}

	const cacheDir = path.resolve(process.env.BETTERPPTX_REMOTE_ASSET_CACHE || path.join(process.cwd(), 'outputs', 'remote-assets'))
	await fs.mkdir(cacheDir, { recursive: true })
	const filePath = path.join(cacheDir, `remote-image-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.${ext}`)
	await fs.writeFile(filePath, buf)
	return { ...options, path: filePath }
}

async function handleIoReadJson(args) {
	const r = await handleIoReadFile({ path: args.path, encoding: 'utf-8' })
	let data
	try { data = JSON.parse(r.content) }
	catch (e) { throw new Error(`io.read_json: parse error in ${r.path}: ${e.message}`) }
	return { path: r.path, bytes: r.bytes, data }
}

// =============================================================================
//  OPEN EXISTING PPTX — decypher + replay into a fresh pptxgenjs instance
// =============================================================================

const EMU_PER_INCH = 914400

function emuToIn(emu) { return (typeof emu === 'number' && isFinite(emu)) ? emu / EMU_PER_INCH : emu }

// Convert a decyphered text.paragraphs structure to pptxgenjs TextProps[]
function paragraphsToTextProps(paragraphs) {
	if (!Array.isArray(paragraphs)) return ''
	const out = []
	for (let i = 0; i < paragraphs.length; i++) {
		const p = paragraphs[i] || {}
		const props = p.properties || {}
		const runs = Array.isArray(p.runs) ? p.runs : []
		const lastRun = runs.length - 1
		for (let j = 0; j < runs.length; j++) {
			const r = runs[j] || {}
			const text = r.text != null ? String(r.text) : ''
			const options = { ...(r.properties || {}) }
			if (props.align) options.align = props.align
			if (props.level !== undefined) options.indentLevel = props.level
			// Break line at the end of every paragraph except the last (final paragraph closes the textbox)
			if (j === lastRun && i < paragraphs.length - 1) options.breakLine = true
			out.push({ text, options })
		}
	}
	return out.length > 0 ? out : ''
}

function decodeXmlEntities(value) {
	return String(value ?? '')
		.replace(/&#x([0-9A-Fa-f]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
		.replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&')
}

function openTagAttributes(xml, tagName) {
	const match = String(xml || '').match(new RegExp(`<${tagName}\\b([^>]*?)(?:/?>)`))
	return match ? parseXmlAttributes(match[1]) : {}
}

function mapAlign(value) {
	switch (value) {
		case 'l': return 'left'
		case 'r': return 'right'
		case 'ctr': return 'center'
		case 'just': return 'justify'
		default: return undefined
	}
}

function rawAttrsExcept(attrs, excluded) {
	const out = []
	for (const [key, value] of Object.entries(attrs || {})) {
		if (excluded.has(key)) continue
		out.push(`${key}="${escapeXmlAttr(value)}"`)
	}
	return out.join(' ')
}

function xmlCharToCode(value) {
	const decoded = decodeXmlEntities(value)
	const cp = decoded.codePointAt(0)
	return cp === undefined ? undefined : cp.toString(16).toUpperCase().padStart(4, '0')
}

function parseBulletOptions(pPrXml) {
	const pPr = String(pPrXml || '')
	if (!pPr) return undefined
	if (/<a:buNone\s*\/>/.test(pPr)) return { none: true }

	const buFont = firstXmlElement(pPr, 'a:buFont')
	const buFontAttrs = openTagAttributes(buFont || '', 'a:buFont')
	const bulletFont = buFontAttrs.typeface
	const buFontRawAttrs = rawAttrsExcept(buFontAttrs, new Set(['typeface']))
	const buClr = firstXmlElement(pPr, 'a:buClr')
	const buSzPct = firstXmlElement(pPr, 'a:buSzPct')
	const buSzPts = firstXmlElement(pPr, 'a:buSzPts')
	const bulletBase = {}
	if (bulletFont) bulletBase.font = bulletFont
	if (buFontRawAttrs) bulletBase._buFontAttrs = buFontRawAttrs
	if (buClr) bulletBase._rawBuClrXml = buClr
	if (buSzPct) bulletBase._rawBuSzPctXml = buSzPct
	if (buSzPts) {
		const attrs = openTagAttributes(buSzPts, 'a:buSzPts')
		if (attrs.val) bulletBase.fontSize = Number(attrs.val) / 100
	}

	const buAutoNum = firstXmlElement(pPr, 'a:buAutoNum')
	if (buAutoNum) {
		const attrs = openTagAttributes(buAutoNum, 'a:buAutoNum')
		return {
			...bulletBase,
			type: 'number',
			style: attrs.type || 'arabicPeriod',
			...(attrs.startAt ? { startAt: attrs.startAt } : {}),
		}
	}

	const buChar = firstXmlElement(pPr, 'a:buChar')
	if (buChar) {
		const attrs = openTagAttributes(buChar, 'a:buChar')
		const characterCode = xmlCharToCode(attrs.char || '')
		return characterCode ? { ...bulletBase, characterCode } : bulletBase
	}

	return undefined
}

function parseParagraphOptionsFromXml(pPrXml) {
	const pPr = String(pPrXml || '')
	const options = {}
	if (!pPr) return options
	const attrs = openTagAttributes(pPr, 'a:pPr')
	const align = mapAlign(attrs.algn)
	if (align) options.align = align
	if (attrs.lvl !== undefined) options.indentLevel = Number(attrs.lvl)
	if (attrs.marL !== undefined) options._pPrMarL = attrs.marL
	if (attrs.indent !== undefined) options._pPrIndent = attrs.indent
	const rawAttrs = rawAttrsExcept(attrs, new Set(['algn', 'lvl', 'marL', 'indent']))
	if (rawAttrs) options._rawPPrAttrs = rawAttrs

	const lnSpc = firstXmlElement(pPr, 'a:lnSpc')
	if (lnSpc) {
		const spcPct = firstXmlElement(lnSpc, 'a:spcPct')
		const spcPts = firstXmlElement(lnSpc, 'a:spcPts')
		if (spcPct) {
			const attrsPct = openTagAttributes(spcPct, 'a:spcPct')
			if (attrsPct.val !== undefined) options.lineSpacingMultiple = Number(attrsPct.val) / 100000
		} else if (spcPts) {
			const attrsPts = openTagAttributes(spcPts, 'a:spcPts')
			if (attrsPts.val !== undefined) options.lineSpacing = Number(attrsPts.val) / 100
		}
	}

	const spcBef = firstXmlElement(pPr, 'a:spcBef')
	if (spcBef) {
		const pct = firstXmlElement(spcBef, 'a:spcPct')
		const pts = firstXmlElement(spcBef, 'a:spcPts')
		if (pct) options.paraSpaceBeforeMultiple = Number(openTagAttributes(pct, 'a:spcPct').val) / 100000
		else if (pts) options.paraSpaceBefore = Number(openTagAttributes(pts, 'a:spcPts').val) / 100
	}
	const spcAft = firstXmlElement(pPr, 'a:spcAft')
	if (spcAft) {
		const pct = firstXmlElement(spcAft, 'a:spcPct')
		const pts = firstXmlElement(spcAft, 'a:spcPts')
		if (pct) options.paraSpaceAfterMultiple = Number(openTagAttributes(pct, 'a:spcPct').val) / 100000
		else if (pts) options.paraSpaceAfter = Number(openTagAttributes(pts, 'a:spcPts').val) / 100
	}

	const bullet = parseBulletOptions(pPr)
	if (bullet) options.bullet = bullet

	const preservedChildren = []
	for (const tagName of ['a:tabLst', 'a:defRPr', 'a:buSzTx', 'a:uFillTx', 'a:uLnTx']) {
		const child = firstXmlElement(pPr, tagName)
		if (child) preservedChildren.push(child)
	}
	if (preservedChildren.length > 0) options._rawPPrChildXml = preservedChildren.join('')
	return options
}

function parseColorFromXml(xml) {
	const srgb = String(xml || '').match(/<a:srgbClr\b[^>]*\bval="([0-9A-Fa-f]{6})"/)
	return srgb ? srgb[1].toUpperCase() : undefined
}

function parseRunOptionsFromXml(runXml) {
	const rPr = firstXmlElement(runXml, 'a:rPr')
	const options = {}
	if (!rPr) return options
	const attrs = openTagAttributes(rPr, 'a:rPr')
	if (attrs.lang) options.lang = attrs.lang
	if (attrs.dirty !== undefined) options._rPrDirty = attrs.dirty
	if (attrs.err !== undefined) options._rPrErr = attrs.err
	if (attrs.b !== undefined) options.bold = attrs.b !== '0'
	if (attrs.i !== undefined) options.italic = attrs.i !== '0'
	if (attrs.u !== undefined && attrs.u !== 'none') options.underline = true
	if (attrs.strike && attrs.strike !== 'noStrike') options.strike = true
	if (attrs.sz !== undefined) options.fontSize = Number(attrs.sz) / 100

	const color = parseColorFromXml(rPr)
	if (color && color !== '000000') options.color = color
	const latin = firstXmlElement(rPr, 'a:latin')
	if (latin) {
		const latinAttrs = openTagAttributes(latin, 'a:latin')
		if (latinAttrs.typeface && !latinAttrs.typeface.startsWith('+')) options.fontFace = latinAttrs.typeface
	}

	const preservedChildren = []
	for (const tagName of ['a:effectLst', 'a:cs', 'a:sym']) {
		const child = firstXmlElement(rPr, tagName)
		if (child) preservedChildren.push(child)
	}
	if (preservedChildren.length > 0) options._rawRprChildXmlExact = preservedChildren.join('')
	return options
}

function sourceTextPropsFromShapeXml(shapeXml) {
	const txBody = firstXmlElement(shapeXml, 'p:txBody')
	if (!txBody) return null
	const paragraphs = collectElementsByTag(txBody, 'a:p')
	if (paragraphs.length === 0) return ''
	const out = []
	for (let pi = 0; pi < paragraphs.length; pi++) {
		const pXml = paragraphs[pi]
		const pPr = firstXmlElement(pXml, 'a:pPr')
		const paragraphOptions = parseParagraphOptionsFromXml(pPr)
		const runMatches = Array.from(pXml.matchAll(/<a:(r|fld)\b[\s\S]*?<\/a:\1>|<a:br\b[\s\S]*?(?:\/>|<\/a:br>)/g))
		if (runMatches.length === 0) {
			const endPara = firstXmlElement(pXml, 'a:endParaRPr')
			out.push({ text: '', options: { ...paragraphOptions, ...(endPara ? parseRunOptionsFromXml(`<a:r>${endPara.replace(/endParaRPr/g, 'rPr')}</a:r>`) : {}) } })
		} else {
			let firstRunInParagraph = true
			for (const match of runMatches) {
				const runXml = match[0]
				if (runXml.startsWith('<a:br')) {
					out.push({ text: '\n', options: { ...(firstRunInParagraph ? paragraphOptions : {}), breakLine: true } })
					firstRunInParagraph = false
					continue
				}
				const t = firstXmlElement(runXml, 'a:t')
				const text = t ? decodeXmlEntities(t.replace(/^<a:t[^>]*>/, '').replace(/<\/a:t>$/, '')) : ''
				out.push({ text, options: { ...(firstRunInParagraph ? paragraphOptions : {}), ...parseRunOptionsFromXml(runXml) } })
				firstRunInParagraph = false
			}
		}
		if (pi < paragraphs.length - 1) out.push({ text: '', options: { breakLine: true } })
	}
	return out.length > 0 ? out : ''
}

function resolvePassthroughXmlPath(baseFolder, sourceXmlPath) {
	if (!sourceXmlPath) return null
	return path.isAbsolute(sourceXmlPath) ? sourceXmlPath : path.resolve(baseFolder, sourceXmlPath)
}

async function loadPassthroughXml(baseFolder, sh) {
	if (typeof sh.xml === 'string' && sh.xml.trim()) {
		return { xml: sh.xml, sourcePath: null }
	}
	const sourcePath = resolvePassthroughXmlPath(baseFolder, sh.passthrough?.sourceXmlPath)
	if (!sourcePath) return { xml: null, sourcePath: null }
	try {
		return { xml: await fs.readFile(sourcePath, 'utf-8'), sourcePath }
	} catch (_) {
		return { xml: null, sourcePath }
	}
}

function passthroughNeedsRelationships(xml) {
	return /\s(?:r:id|r:embed|r:link|r:dm|r:lo|r:qs|r:cs)=["'][^"']+["']/.test(xml)
}

function escapeXmlAttr(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
}

function parseXmlAttributes(attrText) {
	const out = {}
	for (const match of String(attrText || '').matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*(["'])(.*?)\2/g)) {
		out[match[1]] = match[3]
	}
	return out
}

function parseRelationshipEntries(xml) {
	const entries = []
	for (const match of String(xml || '').matchAll(/<Relationship\s+([^>]*?)\/>/g)) {
		const attrs = parseXmlAttributes(match[1])
		if (attrs.Id && attrs.Type && attrs.Target) {
			entries.push({
				id: attrs.Id,
				type: attrs.Type,
				target: attrs.Target,
				targetMode: attrs.TargetMode,
			})
		}
	}
	return entries
}

function parseContentTypes(xml) {
	const defaults = new Map()
	const overrides = new Map()
	for (const match of String(xml || '').matchAll(/<Default\s+([^>]*?)\/>/g)) {
		const attrs = parseXmlAttributes(match[1])
		if (attrs.Extension && attrs.ContentType) defaults.set(attrs.Extension.toLowerCase(), attrs.ContentType)
	}
	for (const match of String(xml || '').matchAll(/<Override\s+([^>]*?)\/>/g)) {
		const attrs = parseXmlAttributes(match[1])
		if (attrs.PartName && attrs.ContentType) {
			let partName = attrs.PartName.replace(/\\/g, '/')
			while (partName.startsWith('/')) partName = partName.substring(1)
			overrides.set(partName, attrs.ContentType)
		}
	}
	return { defaults, overrides }
}

function normalizeZipPartPath(partPath) {
	const raw = String(partPath || '').replace(/\\/g, '/')
	const parts = []
	for (const part of raw.split('/')) {
		if (!part || part === '.') continue
		if (part === '..') parts.pop()
		else parts.push(part)
	}
	return parts.join('/')
}

function relsPathForPart(partPath) {
	const normalized = normalizeZipPartPath(partPath)
	const dir = path.posix.dirname(normalized)
	const base = path.posix.basename(normalized)
	return `${dir === '.' ? '' : `${dir}/`}_rels/${base}.rels`
}

function isExternalTarget(target) {
	return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(String(target || ''))
}

function resolvePackageTarget(ownerPartPath, target) {
	if (!target || isExternalTarget(target)) return null
	const ownerDir = path.posix.dirname(normalizeZipPartPath(ownerPartPath))
	return normalizeZipPartPath(path.posix.join(ownerDir === '.' ? '' : ownerDir, target))
}

function relativePackageTarget(ownerPartPath, targetPartPath) {
	const ownerDir = path.posix.dirname(normalizeZipPartPath(ownerPartPath))
	const rel = path.posix.relative(ownerDir === '.' ? '' : ownerDir, normalizeZipPartPath(targetPartPath))
	return rel || path.posix.basename(targetPartPath)
}

function contentTypeForPart(contentTypes, partPath) {
	const normalized = normalizeZipPartPath(partPath)
	if (contentTypes.overrides.has(normalized)) return contentTypes.overrides.get(normalized)
	const ext = path.posix.extname(normalized).replace(/^\./, '').toLowerCase()
	return ext ? contentTypes.defaults.get(ext) : undefined
}

function serializeRelationships(entries) {
	let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
	xml += '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
	for (const rel of entries) {
		xml += `<Relationship Id="${escapeXmlAttr(rel.id)}" Type="${escapeXmlAttr(rel.type)}" Target="${escapeXmlAttr(rel.target)}"${rel.targetMode ? ` TargetMode="${escapeXmlAttr(rel.targetMode)}"` : ''}/>`
	}
	xml += '</Relationships>'
	return xml
}

function collectRelationshipIds(xml) {
	const ids = new Set()
	for (const match of String(xml || '').matchAll(/\b(?:r:id|r:embed|r:link|r:dm|r:lo|r:qs|r:cs|o:relid|o:relId)\s*=\s*["']([^"']+)["']/g)) {
		ids.add(match[1])
	}
	return Array.from(ids)
}

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function rewriteRelationshipIds(xml, idMap) {
	let out = String(xml || '')
	for (const [oldId, newId] of idMap.entries()) {
		const re = new RegExp(`\\b(r:id|r:embed|r:link|r:dm|r:lo|r:qs|r:cs|o:relid|o:relId)(\\s*=\\s*["'])${escapeRegExp(oldId)}(["'])`, 'g')
		out = out.replace(re, `$1$2${newId}$3`)
	}
	return out
}

function nextRawRelationshipId(slide) {
	let maxRid = 0
	const scanRid = rid => {
		const text = String(rid || '')
		const n = text.startsWith('rId') ? Number(text.substring(3)) : Number(text)
		if (Number.isFinite(n)) maxRid = Math.max(maxRid, n)
	}
	;(slide._rawRels || []).forEach(rel => scanRid(rel.id))
	;(slide._rels || []).forEach(rel => scanRid(rel.rId))
	;(slide._relsChart || []).forEach(rel => scanRid(rel.rId))
	;(slide._relsMedia || []).forEach(rel => scanRid(rel.rId))
	return `rId${maxRid + 1}`
}

function parseNamespaceDeclarations(xml) {
	const namespaces = new Map()
	for (const match of String(xml || '').matchAll(/\sxmlns:([A-Za-z_][\w.-]*)\s*=\s*(["'])(.*?)\2/g)) {
		namespaces.set(match[1], match[3])
	}
	return namespaces
}

async function sourceSlideNamespaces(state, slideIndex) {
	if (!state.slideNamespaces) state.slideNamespaces = new Map()
	if (state.slideNamespaces.has(slideIndex)) return state.slideNamespaces.get(slideIndex)
	const slideXml = await zipText(state.sourceZip, `ppt/slides/slide${slideIndex + 1}.xml`)
	const namespaces = parseNamespaceDeclarations(slideXml)
	state.slideNamespaces.set(slideIndex, namespaces)
	return namespaces
}

function addMissingNamespaceDeclarations(xml, namespaces, options = {}) {
	let out = String(xml || '')
	if (!out.trim() || !namespaces || namespaces.size === 0) return out
	const rootDeclaredPrefixes = options.rootDeclaredPrefixes || new Set()
	const declared = new Set()
	for (const match of out.matchAll(/\sxmlns:([A-Za-z_][\w.-]*)\s*=/g)) declared.add(match[1])
	const used = new Set()
	for (const match of out.matchAll(/(?:<|<\/|\s)([A-Za-z_][\w.-]*):[A-Za-z_][\w.-]*/g)) used.add(match[1])
	const additions = []
	for (const prefix of used) {
		if (prefix === 'xml' || declared.has(prefix) || rootDeclaredPrefixes.has(prefix) || !namespaces.has(prefix)) continue
		additions.push(` xmlns:${prefix}="${escapeXmlAttr(namespaces.get(prefix))}"`)
	}
	if (additions.length === 0) return out
	return out.replace(/<([A-Za-z_][\w:.-]*)(\s|>)/, `<$1${additions.join('')}$2`)
}

const GENERATED_SLIDE_ROOT_NS_PREFIXES = new Set(['a', 'r', 'p', 'mc', 'p14', 'p159', 'am3d', 'a16'])

function xmlTagBoundary(ch) {
	return ch === undefined || ch === '' || /[\s>/]/.test(ch)
}

function firstXmlElement(xml, tagName) {
	const text = String(xml || '')
	const openTag = `<${tagName}`
	const closeTag = `</${tagName}>`
	let start = text.indexOf(openTag)
	while (start >= 0 && !xmlTagBoundary(text[start + openTag.length])) {
		start = text.indexOf(openTag, start + openTag.length)
	}
	if (start < 0) return null
	const openEnd = text.indexOf('>', start)
	if (openEnd >= 0 && text[openEnd - 1] === '/') {
		return text.substring(start, openEnd + 1)
	}
	let depth = 0
	for (let i = start; i < text.length; i++) {
		if (text.substring(i, i + openTag.length) === openTag && xmlTagBoundary(text[i + openTag.length])) {
			depth++
		} else if (text.substring(i, i + closeTag.length) === closeTag) {
			depth--
			if (depth === 0) return text.substring(start, i + closeTag.length)
		}
	}
	return null
}

function collectElementsByTag(xml, tagName) {
	const text = String(xml || '')
	const openTag = `<${tagName}`
	const elements = []
	let searchPos = 0
	while (searchPos < text.length) {
		let start = text.indexOf(openTag, searchPos)
		while (start >= 0 && !xmlTagBoundary(text[start + openTag.length])) {
			start = text.indexOf(openTag, start + openTag.length)
		}
		if (start < 0) break
		const element = firstXmlElement(text.substring(start), tagName)
		if (!element) {
			searchPos = start + openTag.length
			continue
		}
		elements.push(element)
		searchPos = start + element.length
	}
	return elements
}

function sourceShapeIdFromXml(xml) {
	const match = String(xml || '').match(/<p:cNvPr\b[^>]*\bid="(\d+)"/)
	return match ? Number(match[1]) : null
}

async function sourceShapeXmlById(state, sourceSlideIndex) {
	if (!state.sourceShapeXmlById) state.sourceShapeXmlById = new Map()
	if (state.sourceShapeXmlById.has(sourceSlideIndex)) return state.sourceShapeXmlById.get(sourceSlideIndex)
	const slideXml = await zipText(state.sourceZip, `ppt/slides/slide${sourceSlideIndex + 1}.xml`)
	const byId = new Map()
	for (const tagName of ['p:sp', 'p:pic', 'p:graphicFrame']) {
		for (const element of collectElementsByTag(slideXml, tagName)) {
			const id = sourceShapeIdFromXml(element)
			if (id !== null && !byId.has(id)) byId.set(id, element)
		}
	}
	state.sourceShapeXmlById.set(sourceSlideIndex, byId)
	return byId
}

async function sourceShapeXml(state, sourceSlideIndex, shapeId) {
	const byId = await sourceShapeXmlById(state, sourceSlideIndex)
	return byId.get(Number(shapeId)) || null
}

async function sourceSlideTimingXml(state, sourceSlideIndex) {
	if (!state.sourceSlideTimingXml) state.sourceSlideTimingXml = new Map()
	if (state.sourceSlideTimingXml.has(sourceSlideIndex)) return state.sourceSlideTimingXml.get(sourceSlideIndex)
	const slideXml = await zipText(state.sourceZip, `ppt/slides/slide${sourceSlideIndex + 1}.xml`)
	let timingXml = firstXmlElement(slideXml, 'p:timing')
	if (timingXml) {
		timingXml = addMissingNamespaceDeclarations(timingXml, await sourceSlideNamespaces(state, sourceSlideIndex), {
			rootDeclaredPrefixes: GENERATED_SLIDE_ROOT_NS_PREFIXES,
		})
	}
	state.sourceSlideTimingXml.set(sourceSlideIndex, timingXml || null)
	return timingXml || null
}

function collectSpidsFromTimingXml(xml) {
	const spids = new Set()
	for (const match of String(xml || '').matchAll(/\bspid\s*=\s*(["'])(\d+)\1/g)) {
		spids.add(match[2])
	}
	return spids
}

function collectShapeIdsFromXml(xml) {
	const ids = new Set()
	for (const match of String(xml || '').matchAll(/<p:cNvPr\b[^>]*\bid\s*=\s*(["'])(\d+)\1/g)) {
		ids.add(match[2])
	}
	return ids
}

function collectSlideObjectSpids(slide) {
	const spids = new Set()
	for (const obj of (slide?._slideObjects || [])) {
		const opts = obj.options || {}
		if (opts.spid !== undefined && opts.spid !== null) spids.add(String(opts.spid))
		if (opts.id !== undefined && opts.id !== null) spids.add(String(opts.id))
		if (obj.passthrough?.xml) {
			for (const id of collectShapeIdsFromXml(obj.passthrough.xml)) spids.add(id)
		}
	}
	return spids
}

function findSpidReference(xml, spid, from = 0) {
	const patterns = [`spid="${spid}"`, `spid='${spid}'`]
	let best = -1
	for (const pattern of patterns) {
		const idx = xml.indexOf(pattern, from)
		if (idx >= 0 && (best < 0 || idx < best)) best = idx
	}
	return best
}

function findEnclosingXmlElementRange(xml, targetPos, tagName) {
	const text = String(xml || '')
	const openTag = `<${tagName}`
	const closeTag = `</${tagName}>`
	let start = -1
	let lookBack = targetPos
	while (lookBack > 0) {
		const openIdx = text.lastIndexOf(openTag, lookBack - 1)
		const closeIdx = text.lastIndexOf(closeTag, lookBack - 1)
		if (openIdx < 0) break
		if (!xmlTagBoundary(text[openIdx + openTag.length])) {
			lookBack = openIdx
			continue
		}
		if (closeIdx < 0 || openIdx > closeIdx) {
			start = openIdx
			break
		}
		lookBack = openIdx
	}
	if (start < 0) return null

	let depth = 0
	let scanPos = start
	while (scanPos < text.length) {
		let openIdx = text.indexOf(openTag, scanPos)
		while (openIdx >= 0 && !xmlTagBoundary(text[openIdx + openTag.length])) {
			openIdx = text.indexOf(openTag, openIdx + openTag.length)
		}
		const closeIdx = text.indexOf(closeTag, scanPos)
		if (closeIdx < 0) break
		if (openIdx >= 0 && openIdx < closeIdx) {
			depth++
			scanPos = openIdx + openTag.length
		} else {
			depth--
			if (depth === 0) return { start, end: closeIdx + closeTag.length }
			scanPos = closeIdx + closeTag.length
		}
	}
	return null
}

function findXmlElementRangeAtOrAround(xml, targetPos, tagName) {
	const text = String(xml || '')
	const openTag = `<${tagName}`
	let start = text.lastIndexOf(openTag, targetPos)
	while (start >= 0 && !xmlTagBoundary(text[start + openTag.length])) {
		start = text.lastIndexOf(openTag, start - 1)
	}
	if (start < 0) return null
	const openEnd = text.indexOf('>', start)
	if (openEnd < 0 || openEnd < targetPos) return null
	if (text[openEnd - 1] === '/') return { start, end: openEnd + 1 }
	return findEnclosingXmlElementRange(text, targetPos, tagName)
}

function sanitizeTimingXmlForSlide(timingXml, existingSpids) {
	let xml = String(timingXml || '')
	const sourceSpids = collectSpidsFromTimingXml(xml)
	const missingSpids = new Set([...sourceSpids].filter(spid => !existingSpids.has(spid)))
	let removedBlocks = 0

	for (const missingSpid of missingSpids) {
		let searchPos = 0
		while (true) {
			const targetPos = findSpidReference(xml, missingSpid, searchPos)
			if (targetPos < 0) break
			const range = findXmlElementRangeAtOrAround(xml, targetPos, 'p:bldP') ||
				findEnclosingXmlElementRange(xml, targetPos, 'p:par')
			if (!range) {
				searchPos = targetPos + 1
				continue
			}
			xml = xml.substring(0, range.start) + xml.substring(range.end)
			removedBlocks++
			searchPos = range.start
		}
	}

	const remainingSpids = collectSpidsFromTimingXml(xml)
	const hasRemainingTarget = [...remainingSpids].some(spid => existingSpids.has(spid))
	return {
		xml: hasRemainingTarget ? xml : null,
		sourceTargetCount: sourceSpids.size,
		preservedTargetCount: [...remainingSpids].filter(spid => existingSpids.has(spid)).length,
		missingSpids: [...missingSpids],
		removedBlocks,
	}
}

function nativeTextShapeHintsFromXml(xml, options = {}) {
	const hints = { _nativeMinimal: true, margin: [null, null, null, null] }
	const cNvSpPr = firstXmlElement(xml, 'p:cNvSpPr')
	if (cNvSpPr) {
		const spLocksMatch = cNvSpPr.match(/<a:spLocks\b([^>]*?)(?:\/>|>)/)
		if (spLocksMatch) hints._spLocks = spLocksMatch[1].trim()
	}
	const nvPr = firstXmlElement(xml, 'p:nvPr')
	if (nvPr) {
		const phMatch = nvPr.match(/<p:ph\b([^>]*?)(?:\/>|>)/)
		if (phMatch) {
			const phAttrs = parseXmlAttributes(phMatch[1])
			if (phAttrs.type) {
				hints.phType = phAttrs.type
				hints.placeholder = phAttrs.type
			}
			if (phAttrs.idx !== undefined) hints.phIdx = phAttrs.idx
			if (phAttrs.sz) hints.phSz = phAttrs.sz
		}
	}
	const spPr = firstXmlElement(xml, 'p:spPr')
	if (spPr) {
		const effectLst = firstXmlElement(spPr, 'a:effectLst')
		if (effectLst) hints._rawEffectLstXml = effectLst
		const scene3d = firstXmlElement(spPr, 'a:scene3d')
		if (scene3d) hints._rawSpPrScene3dXml = scene3d
		const style = firstXmlElement(xml, 'p:style')
		if (style) hints._rawShapeStyleXml = style
	}
	const txBody = firstXmlElement(xml, 'p:txBody')
	if (options.preserveRawTextBody && txBody) hints._rawTxBodyXml = txBody
	const bodyPrMatch = txBody ? txBody.match(/<a:bodyPr\b([^>]*?)(?:\/>|>)/) : null
	if (bodyPrMatch) {
		const bodyPrAttrs = parseXmlAttributes(bodyPrMatch[1])
		if (bodyPrAttrs.anchor === 'ctr') hints.valign = 'middle'
		else if (bodyPrAttrs.anchor === 'b') hints.valign = 'bottom'
		else if (bodyPrAttrs.anchor === 't') hints.valign = 'top'
	}
	return hints
}

function makeRawPartPath(sourcePartPath, state, prefix) {
	const source = normalizeZipPartPath(sourcePartPath)
	if (!state.usedPaths.has(source)) {
		state.usedPaths.add(source)
		return source
	}
	const dir = path.posix.dirname(source)
	const ext = path.posix.extname(source)
	const base = (path.posix.basename(source, ext) || 'part').replace(/[^A-Za-z0-9_.-]+/g, '_')
	const safePrefix = String(prefix || 'passthrough').replace(/[^A-Za-z0-9_.-]+/g, '_')
	let suffix = 0
	let candidate
	do {
		const tail = suffix ? `_${suffix}` : ''
		candidate = normalizeZipPartPath(path.posix.join(dir === '.' ? '' : dir, `${safePrefix}_${base}${tail}${ext}`))
		suffix++
	} while (state.usedPaths.has(candidate))
	state.usedPaths.add(candidate)
	return candidate
}

async function zipText(zip, partPath) {
	const file = zip.file(normalizeZipPartPath(partPath))
	return file ? await file.async('string') : ''
}

async function createPackageImportState(pptxPath, pptx) {
	const sourceZip = await JSZip.loadAsync(await fs.readFile(pptxPath))
	const contentTypesXml = await zipText(sourceZip, '[Content_Types].xml')
	return {
		sourceZip,
		contentTypes: parseContentTypes(contentTypesXml),
		copiedParts: new Map(),
		usedPaths: new Set(),
		pptx,
		partsCopied: 0,
		relsCopied: 0,
	}
}

async function copyPackagePartGraph(state, sourcePartPath, prefix) {
	const source = normalizeZipPartPath(sourcePartPath)
	if (state.copiedParts.has(source)) return state.copiedParts.get(source)
	const file = state.sourceZip.file(source)
	if (!file) throw new Error(`missing referenced package part: ${source}`)

	const dest = makeRawPartPath(source, state, prefix)
	state.copiedParts.set(source, dest)

	const data = await file.async('base64')
	state.pptx._rawPackageParts = state.pptx._rawPackageParts || []
	const contentType = contentTypeForPart(state.contentTypes, source)
	const rawPart = {
		path: dest,
		data,
		encoding: 'base64',
	}
	if (contentType) {
		if (dest.endsWith('.xml')) rawPart.contentType = contentType
		else rawPart.defaultContentType = contentType
	}
	state.pptx._rawPackageParts.push(rawPart)
	state.partsCopied++

	const sourceRelsPath = relsPathForPart(source)
	const relsXml = await zipText(state.sourceZip, sourceRelsPath)
	if (relsXml) {
		const remappedRels = []
		for (const rel of parseRelationshipEntries(relsXml)) {
			let target = rel.target
			if (rel.targetMode !== 'External' && !isExternalTarget(rel.target)) {
				const childSource = resolvePackageTarget(source, rel.target)
				if (childSource) {
					const childDest = await copyPackagePartGraph(state, childSource, prefix)
					target = relativePackageTarget(dest, childDest)
				}
			}
			remappedRels.push({ ...rel, target })
		}
		state.pptx._rawPackageParts.push({
			path: relsPathForPart(dest),
			data: serializeRelationships(remappedRels),
		})
		state.relsCopied++
	}

	return dest
}

async function copyRawPackagePartExact(state, sourcePartPath) {
	const source = normalizeZipPartPath(sourcePartPath)
	if (state.copiedParts.has(source)) return state.copiedParts.get(source)
	const file = state.sourceZip.file(source)
	if (!file || file.dir) throw new Error(`missing raw package part: ${source}`)

	const data = await file.async('base64')
	const rawPart = {
		path: source,
		data,
		encoding: 'base64',
	}
	const contentType = contentTypeForPart(state.contentTypes, source)
	if (contentType) {
		if (source.endsWith('.xml')) rawPart.contentType = contentType
		else rawPart.defaultContentType = contentType
	}

	state.pptx._rawPackageParts = state.pptx._rawPackageParts || []
	state.pptx._rawPackageParts.push(rawPart)
	state.copiedParts.set(source, source)
	state.usedPaths.add(source)
	state.partsCopied++
	return source
}

function isSourceVisualScaffoldPart(partPath) {
	const p = normalizeZipPartPath(partPath)
	if (!p || p === '[Content_Types].xml') return false
	// Video/audio binaries are slide-level media; they are re-added on import via
	// the library's addMedia (which rebuilds their relationships). Copying them
	// here as "scaffold" too would leave an unreferenced duplicate binary, so skip.
	if (p.startsWith('ppt/media/') && /\.(mp4|mov|avi|wmv|m4v|mpg|mpeg|mkv|webm|mp3|wav|m4a|aac|wma|ogg|flac)$/i.test(p)) return false
	return (
		p.startsWith('ppt/media/') ||
		p.startsWith('ppt/diagrams/') ||
		p.startsWith('ppt/slideLayouts/') ||
		p.startsWith('ppt/slideMasters/') ||
		p.startsWith('ppt/theme/')
	)
}

async function sourcePresentationSlideMasters(state) {
	const presentationXml = await zipText(state.sourceZip, 'ppt/presentation.xml')
	const presentationRelsXml = await zipText(state.sourceZip, 'ppt/_rels/presentation.xml.rels')
	const relsById = new Map(parseRelationshipEntries(presentationRelsXml).map(rel => [rel.id, rel]))
	const masters = []
	for (const match of String(presentationXml || '').matchAll(/<p:sldMasterId\b([^>]*?)(?:\/>|>)/g)) {
		const attrs = parseXmlAttributes(match[1])
		const rel = relsById.get(attrs['r:id'])
		if (!rel || !rel.type.endsWith('/slideMaster')) continue
		const targetPart = resolvePackageTarget('ppt/presentation.xml', rel.target)
		if (!targetPart) continue
		masters.push({
			id: attrs.id,
			target: relativePackageTarget('ppt/presentation.xml', targetPart),
		})
	}
	if (masters.length > 0) return masters
	return Array.from(relsById.values())
		.filter(rel => rel.type.endsWith('/slideMaster'))
		.map((rel, idx) => {
			const targetPart = resolvePackageTarget('ppt/presentation.xml', rel.target)
			return targetPart ? {
				id: String(2147483648 + idx),
				target: relativePackageTarget('ppt/presentation.xml', targetPart),
			} : null
		})
		.filter(Boolean)
}

async function importSourceVisualScaffolding(state) {
	const before = state.partsCopied
	const masters = await sourcePresentationSlideMasters(state)
	if (masters.length > 0) state.pptx._rawSlideMasters = masters

	const partPaths = Object.keys(state.sourceZip.files)
		.filter(partPath => {
			const file = state.sourceZip.files[partPath]
			return file && !file.dir && isSourceVisualScaffoldPart(partPath)
		})
		.sort()
	for (const partPath of partPaths) {
		await copyRawPackagePartExact(state, partPath)
	}
	return {
		rawSlideMasters: masters.length,
		scaffoldingPartsCopied: state.partsCopied - before,
	}
}

async function sourceSlideLayoutNumber(state, sourceSlideIndex) {
	if (!state.sourceSlideLayoutNumbers) state.sourceSlideLayoutNumbers = new Map()
	if (state.sourceSlideLayoutNumbers.has(sourceSlideIndex)) return state.sourceSlideLayoutNumbers.get(sourceSlideIndex)

	const sourceSlidePart = `ppt/slides/slide${sourceSlideIndex + 1}.xml`
	const relsXml = await zipText(state.sourceZip, relsPathForPart(sourceSlidePart))
	let layoutNumber = null
	for (const rel of parseRelationshipEntries(relsXml)) {
		if (!rel.type.endsWith('/slideLayout')) continue
		const targetPart = resolvePackageTarget(sourceSlidePart, rel.target)
		const baseName = targetPart ? path.posix.basename(targetPart, '.xml') : ''
		if (baseName.startsWith('slideLayout')) {
			const n = Number(baseName.substring('slideLayout'.length))
			if (Number.isInteger(n) && n > 0) {
				layoutNumber = n
				break
			}
		}
	}
	state.sourceSlideLayoutNumbers.set(sourceSlideIndex, layoutNumber)
	return layoutNumber
}

async function importPassthroughRelationships({ state, slide, xml, slideIndex, shapeIndex, sourceSlideIndex = slideIndex }) {
	const relationshipIds = collectRelationshipIds(xml)
	if (relationshipIds.length === 0) return { xml, relsAdded: 0 }

	const sourceSlidePart = `ppt/slides/slide${sourceSlideIndex + 1}.xml`
	const destSlidePart = `ppt/slides/slide${slideIndex + 1}.xml`
	const sourceSlideRelsXml = await zipText(state.sourceZip, relsPathForPart(sourceSlidePart))
	const sourceRelsById = new Map(parseRelationshipEntries(sourceSlideRelsXml).map(rel => [rel.id, rel]))
	const idMap = new Map()
	const prefix = `passthrough_s${sourceSlideIndex + 1}_${shapeIndex + 1}`
	slide._rawRels = slide._rawRels || []

	for (const oldId of relationshipIds) {
		const rel = sourceRelsById.get(oldId)
		if (!rel) throw new Error(`missing source slide relationship ${oldId}`)
		const newId = nextRawRelationshipId(slide)
		let target = rel.target
		if (rel.targetMode !== 'External' && !isExternalTarget(rel.target)) {
			const childSource = resolvePackageTarget(sourceSlidePart, rel.target)
			if (childSource) {
				const childDest = await copyPackagePartGraph(state, childSource, prefix)
				target = relativePackageTarget(destSlidePart, childDest)
			}
		}
		slide._rawRels.push({
			id: newId,
			type: rel.type,
			target,
			...(rel.targetMode ? { targetMode: rel.targetMode } : {}),
		})
		idMap.set(oldId, newId)
	}

	return {
		xml: rewriteRelationshipIds(xml, idMap),
		relsAdded: idMap.size,
	}
}

async function handleOpenExisting(args) {
	const pptxPath = path.isAbsolute(args.pptxPath) ? args.pptxPath : path.resolve(process.cwd(), args.pptxPath)
	const decypher = await import('../dist/node/pptx-decypher/index.js')
	const outputDir = args.workDir || path.join(process.cwd(), '.betterpptx-cache')
	const result = await decypher.decypherToModel({ pptxPath, outputDir })
	if (!result.success || !result.model) {
		throw new Error(`decypherToModel failed: ${(result.errors || []).join('; ')}`)
	}
	const model = result.model
	const passthroughBaseFolder = path.resolve(outputDir, result.signature)

	const fsSync = await import('node:fs')
	// Asset lookup: media[].id -> absolute path
	const sourceDir = path.dirname(pptxPath)
	const mediaMap = {}
	const mediaInfo = {}  // id -> { type, path, mimeType } for re-adding video/audio shapes
	for (const m of (model.media || [])) {
		const p = m.extractedPath ? (path.isAbsolute(m.extractedPath) ? m.extractedPath : path.resolve(process.cwd(), m.extractedPath)) : null
		if (p) mediaMap[m.id] = p
		mediaInfo[m.id] = { type: m.type, path: p, mimeType: m.mimeType }
	}
	// Best-effort video poster: first image-type media entry, encoded as a base64
	// data-URI cover (the library's addMedia requires cover as base64, not a path).
	let mediaPosterCover = null
	try {
		const posterEntry = (model.media || []).find(m => m.type === 'image' && m.extractedPath)
		if (posterEntry) {
			const pp = path.isAbsolute(posterEntry.extractedPath) ? posterEntry.extractedPath : path.resolve(process.cwd(), posterEntry.extractedPath)
			if (fsSync.existsSync(pp)) {
				const ext = (path.extname(pp).slice(1) || 'png').toLowerCase()
				mediaPosterCover = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,` + fsSync.readFileSync(pp).toString('base64')
			}
		}
	} catch (_) {}

	// Build new pptxgenjs deck
	const pptx = await newPptx()
	const packageImportState = await createPackageImportState(pptxPath, pptx)
	const visualScaffolding = await importSourceVisualScaffolding(packageImportState)
	const layout = model.metadata && model.metadata.layout
	if (layout && layout.width && layout.height) {
		const layoutName = `imported_${Math.round(layout.width * 100)}x${Math.round(layout.height * 100)}`
		pptx.defineLayout({ name: layoutName, width: layout.width, height: layout.height })
		pptx.layout = layoutName
	} else {
		pptx.layout = 'LAYOUT_WIDE'
	}
	pptx.title = (model.metadata && model.metadata.title) || path.basename(pptxPath, path.extname(pptxPath))

	const slideShapeIndex = []  // [{ slideIndex, shapes: [{ name, type }] }]
	const slideWarnings = []
	const timingStats = {
		sourceSlidesWithTiming: 0,
		preservedSlides: 0,
		skippedSlides: 0,
		removedBlocks: 0,
		missingTargetCount: 0,
	}

	const selectedSlides = Array.isArray(args.slideNumbers) && args.slideNumbers.length
		? args.slideNumbers
			.map(n => Number(n))
			.filter(n => Number.isInteger(n) && n >= 1 && n <= model.slides.length)
			.map(n => ({ sourceIndex: n - 1, slide: model.slides[n - 1] }))
		: model.slides.map((slide, sourceIndex) => ({ sourceIndex, slide }))

	for (let si = 0; si < selectedSlides.length; si++) {
		const { sourceIndex, slide: ms } = selectedSlides[si]
		const slide = pptx.addSlide()
		const rawSlideLayoutNumber = await sourceSlideLayoutNumber(packageImportState, sourceIndex)
		if (rawSlideLayoutNumber) slide._rawSlideLayoutNumber = rawSlideLayoutNumber
		if (ms.background && ms.background.color) {
			slide.background = { color: ms.background.color }
		}
		if (ms.transition) {
			slide.transition = ms.transition
		}
		if (ms.notes) slide.addNotes(String(ms.notes))

		const shapeList = []
		const passthroughXmlByIndex = new Map()
		const groupedPassthroughChildIds = new Set()
		for (let scan = 0; scan < ms.shapes.length; scan++) {
			const candidate = ms.shapes[scan]
			if (candidate.type !== '__passthrough__') continue
			const loaded = await loadPassthroughXml(passthroughBaseFolder, candidate)
			passthroughXmlByIndex.set(scan, loaded)
			if (
				loaded.xml &&
				!passthroughNeedsRelationships(loaded.xml) &&
				candidate.passthrough?.originalType === 'group'
			) {
				const idMatches = loaded.xml.matchAll(/<p:cNvPr\s+id="(\d+)"/g)
				for (const idMatch of idMatches) {
					const childId = Number(idMatch[1])
					if (childId !== candidate.id) groupedPassthroughChildIds.add(childId)
				}
			}
		}
		for (let shi = 0; shi < ms.shapes.length; shi++) {
			const sh = ms.shapes[shi]
			if (groupedPassthroughChildIds.has(sh.id)) {
				continue
			}
			const baseOpts = {
				x: emuToIn(sh.x), y: emuToIn(sh.y), w: emuToIn(sh.w), h: emuToIn(sh.h),
				objectName: sh.name || `Shape_${si + 1}_${shi + 1}`,
				spid: sh.id,
				...(sh.options || {}),
			}
			const decypherEditHandle = _importedShapeEditHandle(sh, {
				slideIndex: si,
				sourceSlideIndex: sourceIndex,
				shapeIndex: shi,
				objectName: baseOpts.objectName,
			})
			baseOpts._decypherEditHandle = decypherEditHandle
			baseOpts._decypherEditability = decypherEditHandle.editability
			if (sh.rotation) baseOpts.rotate = sh.rotation
			try {
				if (sh.type === 'image' && sh.imagePath && mediaMap[sh.imagePath]) {
					slide.addImage({ ...baseOpts, path: mediaMap[sh.imagePath] })
					shapeList.push({ index: shi, name: baseOpts.objectName, type: 'image', editability: decypherEditHandle.editability })
				} else if (sh.type === 'text' && sh.text) {
					const sourceXml = await sourceShapeXml(packageImportState, sourceIndex, sh.id) || ''
					const text = sourceTextPropsFromShapeXml(sourceXml) || paragraphsToTextProps(sh.text.paragraphs)
					const nativeHints = nativeTextShapeHintsFromXml(sourceXml, {
						preserveRawTextBody: args.preserveRawTextBody === true,
					})
					const textOpts = { ...baseOpts, ...nativeHints }
					if (sh.text.bodyProperties) {
						const bp = sh.text.bodyProperties
						if (bp.anchor) textOpts.valign = bp.anchor === 'middle' ? 'middle' : bp.anchor === 'bottom' ? 'bottom' : 'top'
						if (bp.autoFit) textOpts.autoFit = true
					}
					slide.addText(text || ' ', textOpts)
					shapeList.push({ index: shi, name: baseOpts.objectName, type: 'text', editability: decypherEditHandle.editability })
				} else if (sh.type === 'shape') {
					// Vector / preset shape (rect, roundRect, ellipse, custGeom, etc.)
					const shapeName = (sh.options && sh.options.shapeType) || (sh.options && sh.options._shapeType) || 'rect'
					const shapeOpts = { ...baseOpts }
					// Strip shapeType from options before forwarding (it's a positional arg)
					delete shapeOpts.shapeType
					delete shapeOpts._shapeType
					slide.addShape(shapeName, shapeOpts)
					shapeList.push({ index: shi, name: baseOpts.objectName, type: 'shape', shapeName, editability: decypherEditHandle.editability })
				} else if (sh.type === 'media') {
					// Video / audio shape. Re-add through the library's addMedia so the
					// output gets BOTH required relationships (relationships/video +
					// 2007 relationships/media) and a valid poster — otherwise the media
					// is dropped on import and PowerPoint cannot open the deck.
					const info = mediaInfo[sh.mediaPath] || {}
					const mpath = info.path
					const mtype = (sh.mediaType === 'audio' || info.type === 'audio') ? 'audio' : 'video'
					if (mpath && fsSync.existsSync(mpath)) {
						const mediaOpts = { ...baseOpts, type: mtype, path: mpath }
						delete mediaOpts.shapeType
						delete mediaOpts._shapeType
						if (mtype === 'video' && mediaPosterCover) mediaOpts.cover = mediaPosterCover
						slide.addMedia(mediaOpts)
						shapeList.push({ index: shi, name: baseOpts.objectName, type: 'media', mediaType: mtype, editability: decypherEditHandle.editability })
					} else {
						slideWarnings.push(`slide ${si + 1} shape ${shi + 1} (media): media file not found for ${sh.mediaPath}`)
					}
				} else if (sh.type === '__passthrough__') {
					const { xml, sourcePath } = passthroughXmlByIndex.get(shi) || await loadPassthroughXml(passthroughBaseFolder, sh)
					if (!xml) {
						slideWarnings.push(`slide ${si + 1} shape ${shi + 1} (${sh.type}): passthrough XML not found${sourcePath ? ` at ${sourcePath}` : ''}`)
					} else {
						const namespacedXml = addMissingNamespaceDeclarations(xml, await sourceSlideNamespaces(packageImportState, sourceIndex))
						const imported = passthroughNeedsRelationships(namespacedXml)
							? await importPassthroughRelationships({ state: packageImportState, slide, xml: namespacedXml, slideIndex: si, shapeIndex: shi, sourceSlideIndex: sourceIndex })
							: { xml: namespacedXml, relsAdded: 0 }
						slide.addPassthroughXml(imported.xml)
						const ptObj = slide._slideObjects?.[slide._slideObjects.length - 1]
						const passthroughOriginalType = inferPassthroughOriginalType(namespacedXml, sh.passthrough?.originalType)
						const isChartExPassthrough = passthroughOriginalType === 'chartEx'
						const passthroughMetadata = sh.passthrough?.metadata || {}
						if (ptObj) {
							ptObj.options = {
								...(ptObj.options || {}),
								objectName: baseOpts.objectName,
								spid: sh.id,
								x: baseOpts.x, y: baseOpts.y, w: baseOpts.w, h: baseOpts.h,
								_decypherEditHandle: decypherEditHandle,
								_decypherEditability: decypherEditHandle.editability,
								_passthroughOriginalType: passthroughOriginalType,
								_passthroughRelsAdded: imported.relsAdded,
								_passthroughSemanticKind: passthroughMetadata.semanticKind || (isChartExPassthrough ? 'chart' : undefined),
								_passthroughSourceFormat: passthroughMetadata.sourceFormat || (isChartExPassthrough ? 'chartEx' : undefined),
								_passthroughPreservation: passthroughMetadata.preservation || 'passthrough',
							}
						}
						shapeList.push({
							index: shi,
							name: baseOpts.objectName,
							type: 'passthrough',
							originalType: passthroughOriginalType,
							relsAdded: imported.relsAdded,
							editability: decypherEditHandle.editability,
							...(isChartExPassthrough ? { semanticKind: 'chart', sourceFormat: 'chartEx', preservation: 'passthrough' } : passthroughMetadata),
						})
					}
				} else {
					// Unknown shape kind — skip but record warning
					slideWarnings.push(`slide ${si + 1} shape ${shi + 1} (${sh.type}): skipped`)
				}
			} catch (e) {
				slideWarnings.push(`slide ${si + 1} shape ${shi + 1} (${sh.type}): ${e.message}`)
			}
		}
		let slideTiming = null
		if (args.preserveTiming !== false) {
			const timingXml = await sourceSlideTimingXml(packageImportState, sourceIndex)
			if (timingXml) {
				timingStats.sourceSlidesWithTiming++
				const timing = sanitizeTimingXmlForSlide(timingXml, collectSlideObjectSpids(slide))
				timingStats.removedBlocks += timing.removedBlocks
				timingStats.missingTargetCount += timing.missingSpids.length
				if (timing.xml) {
					if (typeof slide.setRawTimingXml === 'function') slide.setRawTimingXml(timing.xml)
					else slide._rawTimingXml = timing.xml
					timingStats.preservedSlides++
					slideTiming = {
						preserved: true,
						sourceTargetCount: timing.sourceTargetCount,
						preservedTargetCount: timing.preservedTargetCount,
						removedBlocks: timing.removedBlocks,
						missingTargetCount: timing.missingSpids.length,
					}
				} else {
					timingStats.skippedSlides++
					slideTiming = {
						preserved: false,
						reason: 'no remaining timing targets after missing-spid guard',
						sourceTargetCount: timing.sourceTargetCount,
						removedBlocks: timing.removedBlocks,
						missingTargetCount: timing.missingSpids.length,
					}
				}
			}
		}
		slideShapeIndex.push({ slideIndex: si, sourceSlideNumber: sourceIndex + 1, shapes: shapeList, ...(slideTiming ? { timing: slideTiming } : {}) })
	}

	const id = registerDeck({ pptx, createdAt: new Date().toISOString(), source: { pptxPath, model: { slideCount: selectedSlides.length, sourceSlideCount: model.slides.length, stats: model.stats } } })

	return {
		deckId: id,
		sourcePath: pptxPath,
		slideCount: selectedSlides.length,
		sourceSlideCount: model.slides.length,
		shapeCount: slideShapeIndex.reduce((s, x) => s + x.shapes.length, 0),
		layout: pptx.layout,
		slides: slideShapeIndex,
		warnings: slideWarnings.slice(0, 20),
		warningsTotal: slideWarnings.length,
		packagePassthrough: {
			partsCopied: packageImportState.partsCopied,
			relsCopied: packageImportState.relsCopied,
			scaffoldingPartsCopied: visualScaffolding.scaffoldingPartsCopied,
			rawSlideMasters: visualScaffolding.rawSlideMasters,
		},
		timingPassthrough: timingStats,
	}
}

function _sanitizeUploadedPptxName(value) {
	const base = path.basename(String(value || 'uploaded.pptx')).replace(/[^A-Za-z0-9_. -]+/g, '_').trim() || 'uploaded.pptx'
	return /\.pptx$/i.test(base) ? base : `${base}.pptx`
}

function _decodeUploadedPptxData(args = {}) {
	const raw = args.data ?? args.pptxData ?? args.pptxBase64
	if (typeof raw !== 'string' || !raw.trim()) throw new Error('deck.open_uploaded: provide PPTX bytes as data, pptxData, or pptxBase64.')
	let text = raw.trim()
	const comma = text.indexOf(',')
	if (/^data:/i.test(text)) {
		if (!/^data:application\/(?:vnd\.openxmlformats-officedocument\.presentationml\.presentation|octet-stream);base64,/i.test(text)) {
			throw new Error('deck.open_uploaded: data URL must be a base64 PowerPoint .pptx payload.')
		}
		text = text.slice(comma + 1)
	}
	text = text.replace(/\s+/g, '')
	const bytes = Buffer.from(text, 'base64')
	if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
		throw new Error('deck.open_uploaded: uploaded bytes are not a valid .pptx ZIP package.')
	}
	const maxBytes = Math.max(1, Number(process.env.BETTERPPTX_MAX_UPLOAD_BYTES || 25 * 1024 * 1024))
	if (bytes.length > maxBytes) {
		const err = new Error(`Uploaded PPTX is too large (${bytes.length} bytes, max ${maxBytes}).`)
		err.code = 'UPLOAD_TOO_LARGE'
		err.details = { maxBytes, receivedBytes: bytes.length }
		throw err
	}
	return bytes
}

async function handleOpenUploaded(args) {
	const bytes = _decodeUploadedPptxData(args)
	const uploadDir = path.resolve(process.env.BETTERPPTX_UPLOAD_CACHE || path.join(process.cwd(), '.betterpptx-cache', 'uploads'))
	await fs.mkdir(uploadDir, { recursive: true })
	const fileName = _sanitizeUploadedPptxName(args.fileName || args.filename || 'uploaded.pptx')
	const storedName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${fileName}`
	const pptxPath = path.join(uploadDir, storedName)
	await fs.writeFile(pptxPath, bytes)
	const imported = await handleOpenExisting({
		pptxPath,
		slideNumbers: args.slideNumbers,
		preserveTiming: args.preserveTiming,
		workDir: path.join(process.cwd(), '.betterpptx-cache'),
	})
	const { sourcePath, packagePassthrough, timingPassthrough, ...publicSafe } = imported
	if (isPublicBlackBoxMode() && Array.isArray(publicSafe.warnings)) {
		publicSafe.warnings = publicSafe.warnings.map(w => String(w).replace(/\s+at\s+[A-Za-z]:[\\/].*$/i, '').replace(/\s+at\s+(?:\\\\|\/).*$/i, ''))
	}
	return {
		...publicSafe,
		upload: {
			fileName,
			bytes: bytes.length,
			mode: 'uploaded-pptx',
		},
		note: isPublicBlackBoxMode()
			? 'Uploaded deck is open for editing. Use slide.list_shapes and objectName selectors for black-box-safe targeting.'
			: 'Uploaded deck is open in the MCP registry. Use deck.editability_report and slide.inspect_shapes before semantic edits.',
	}
}

function inferPassthroughOriginalType(xml, originalType) {
	const current = originalType || 'unknown'
	if (current !== 'unknown') return current
	const text = String(xml || '')
	if (
		text.includes('drawing/2014/chartex') ||
		text.includes('drawing/2015/9/8/chartex') ||
		text.includes('relationships/chartEx') ||
		text.includes('<cx:chart')
	) {
		return 'chartEx'
	}
	return current
}

function _importedPassthroughEditability(sh = {}) {
	const originalType = sh.passthrough?.originalType || 'unknown'
	const metadata = sh.passthrough?.metadata || {}
	const sourceFormat = metadata.sourceFormat || originalType
	const lifecycle = ['betterpptx.slide.delete_shapes', 'betterpptx.slide.reorder_shape']
	if (originalType === 'chartEx' || sourceFormat === 'chartEx') {
		return {
			tier: 'promotable',
			semantic: true,
			tools: ['betterpptx.slide.update_chart', 'betterpptx.slide.update_shape', ...lifecycle],
			operations: ['chart-data', 'chart-type', 'style', 'geometry', 'animation-target'],
			note: 'Preserved ChartEx passthrough promotes to native editable ChartEx on first update_chart call.',
			limitations: ['Exact raw ChartEx payload is replaced once promoted. Validate before saving.'],
			recreateWith: 'betterpptx.slide.add_chart',
		}
	}
	const recreateByType = {
		chart: 'betterpptx.slide.add_chart',
		table: 'betterpptx.slide.add_table',
		smartart: 'betterpptx.slide.add_smartart',
		diagram: 'betterpptx.slide.add_smartart',
		group: 'shape-built primitives',
		graphicFrame: 'structured slide primitive matching the intended graphic',
	}
	return {
		tier: ['oleObj', 'control'].includes(originalType) ? 'preserve-only' : 'wrapper-editable',
		semantic: false,
		tools: ['betterpptx.slide.update_shape', ...lifecycle],
		operations: ['wrapper-style', 'wrapper-metadata', 'z-order', 'delete'],
		note: 'Raw OOXML is preserved for repair safety. Use wrapper edits only, or recreate/promote as a structured object for semantic edits.',
		limitations: ['Direct semantic edits to the raw payload are intentionally blocked unless a typed promotion path exists.'],
		recreateWith: recreateByType[originalType] || 'matching betterpptx.slide.add_* primitive',
	}
}

function _importedSemanticEditability(sh = {}) {
	const lifecycle = ['betterpptx.slide.delete_shapes', 'betterpptx.slide.reorder_shape']
	const byType = {
		text: {
			tier: 'semantic',
			semantic: true,
			tools: ['betterpptx.slide.update_shape', ...lifecycle],
			operations: ['text', 'style', 'geometry', 'animation-target'],
			note: 'Imported text was decoded into a structured object and can be edited directly.',
		},
		shape: {
			tier: 'semantic',
			semantic: true,
			tools: ['betterpptx.slide.update_shape', ...lifecycle],
			operations: ['style', 'geometry', 'shape-type', 'animation-target'],
			note: 'Imported shape was decoded into a structured object and can be edited directly.',
		},
		image: {
			tier: 'semantic',
			semantic: true,
			tools: ['betterpptx.slide.update_shape', ...lifecycle],
			operations: ['image-frame', 'style', 'geometry', 'animation-target'],
			note: 'Imported image frame was decoded into a structured object and can be edited directly.',
			recreateWith: 'betterpptx.slide.add_image',
		},
		media: {
			tier: 'semantic',
			semantic: true,
			tools: ['betterpptx.slide.update_media', 'betterpptx.slide.update_shape', ...lifecycle],
			operations: ['media-playback', 'style', 'geometry', 'animation-target'],
			note: 'Imported media was decoded into a structured audio/video object.',
		},
	}
	return byType[sh.type] || {
		tier: 'semantic',
		semantic: true,
		tools: ['betterpptx.slide.update_shape', ...lifecycle],
		operations: ['style', 'geometry', 'animation-target'],
		note: 'Imported object was decoded into a structured presentation object.',
	}
}

function _normalizeEditabilityForImportedShape(sh = {}) {
	if (sh.edit?.editability && typeof sh.edit.editability === 'object') return _deepCloneData(sh.edit.editability)
	if (sh.type === '__passthrough__') return _importedPassthroughEditability(sh)
	return _importedSemanticEditability(sh)
}

function _importedShapeEditHandle(sh = {}, ctx = {}) {
	const objectName = ctx.objectName || sh.name || `Shape_${(ctx.slideIndex || 0) + 1}_${(ctx.shapeIndex || 0) + 1}`
	const sourceSlideNumber = (ctx.sourceSlideIndex ?? ctx.slideIndex ?? 0) + 1
	const existing = sh.edit && typeof sh.edit === 'object' ? _deepCloneData(sh.edit) : null
	const editability = _normalizeEditabilityForImportedShape(sh)
	return {
		id: existing?.id || `slide${sourceSlideNumber}:shape${sh.id ?? ctx.shapeIndex}`,
		source: {
			kind: 'decypher',
			slideNumber: existing?.source?.slideNumber || sourceSlideNumber,
			shapeIndex: existing?.source?.shapeIndex ?? ctx.shapeIndex ?? 0,
			shapeId: existing?.source?.shapeId ?? sh.id ?? null,
			objectName,
			ooxmlType: existing?.source?.ooxmlType || sh.passthrough?.originalType || sh.type || 'unknown',
		},
		stableSelectors: Array.from(new Set([
			...(Array.isArray(existing?.stableSelectors) ? existing.stableSelectors : []),
			`objectName:${objectName}`,
			sh.id != null ? `spid:${sh.id}` : null,
			`source:slide${sourceSlideNumber}:shape${sh.id ?? ctx.shapeIndex}`,
		].filter(Boolean))),
		editability,
	}
}

async function handleListShapes(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const out = []
	const editable = _editableSlideObjects(slide)
	for (let i = 0; i < editable.length; i++) {
		const { obj, rawIndex } = editable[i]
		const opts = obj.options || {}
		out.push({
			index: i,
			rawIndex,
			objectName: opts.objectName,
			kind: obj.type || obj._type,
			editableAs: _isChartExPassthrough(obj) ? 'chart' : undefined,
			semanticKind: opts._passthroughSemanticKind,
			sourceFormat: opts._passthroughSourceFormat,
			preservation: opts._passthroughPreservation,
			passthroughOriginalType: opts._passthroughOriginalType,
			editHandle: _shapeEditHandle(obj, { index: i, rawIndex }),
			editability: _shapeEditability(obj, { index: i, rawIndex }),
			x: opts.x, y: opts.y, w: opts.w, h: opts.h,
		})
	}
	return { slideIndex: args.slideIndex, count: out.length, shapes: out }
}

// =============================================================================
//  INSPECT + UPDATE — generic read/write primitives for edit recipes
//  (dark↔light, recolor palette, refont, resize, retext, etc.).
//  Both operate on whatever the deck registry holds — works equally well on
//  decks created via deck.new and decks loaded via deck.open_existing.
// =============================================================================

// Safe-stringify: drop pptxgenjs internal fields and large blobs so the AI
// gets a useful overview without dumping megabytes of base64.
function _sanitizeOpts(opts) {
	if (!opts || typeof opts !== 'object') return opts
	const out = {}
	for (const k of Object.keys(opts)) {
		if (k.startsWith('_')) continue
		const v = opts[k]
		if (typeof v === 'string' && v.length > 256 && /^data:|^[A-Za-z0-9+/=]{300,}$/.test(v)) {
			out[k] = `<${v.length}-byte data omitted>`
		} else if (Array.isArray(v)) {
			out[k] = v.map(x => (x && typeof x === 'object') ? _sanitizeOpts(x) : x)
		} else if (v && typeof v === 'object') {
			out[k] = _sanitizeOpts(v)
		} else {
			out[k] = v
		}
	}
	return out
}

function _isEditableSlideObject(obj) {
	const kind = obj?.type || obj?._type
	return kind && kind !== 'notes'
}

function _editableSlideObjects(slide) {
	const objects = slide?._slideObjects || []
	const out = []
	for (let rawIndex = 0; rawIndex < objects.length; rawIndex++) {
		const obj = objects[rawIndex]
		if (_isEditableSlideObject(obj)) out.push({ obj, rawIndex })
	}
	return out
}

function _collectXmlColorsFromString(value, acc) {
	const text = String(value || '')
	for (const match of text.matchAll(/<[A-Za-z_][\w.-]*:srgbClr\b[^>]*\bval\s*=\s*["']([0-9A-Fa-f]{6})["']/g)) {
		acc.add(match[1].toUpperCase())
	}
	for (const match of text.matchAll(/\blastClr\s*=\s*["']([0-9A-Fa-f]{6})["']/g)) {
		acc.add(match[1].toUpperCase())
	}
	for (const match of text.matchAll(/\b(?:color|fillcolor|strokecolor)\s*=\s*["']#?([0-9A-Fa-f]{6})["']/g)) {
		acc.add(match[1].toUpperCase())
	}
	return acc
}

function _isLikelyColorKey(key) {
	const k = String(key || '').toLowerCase()
	return k.includes('color') || k.includes('clr') || k.includes('fill') || k.includes('background')
}

// Extract every hex colour referenced anywhere in a shape's options.
// Used so a recolor recipe can ask "show me every colour on this slide".
function _collectColors(opts, acc = new Set()) {
	if (typeof opts === 'string') {
		if (/^#?[0-9A-F]{6}$/i.test(opts)) acc.add(opts.replace(/^#/, '').toUpperCase())
		return acc
	}
	if (!opts || typeof opts !== 'object') return acc
	for (const k of Object.keys(opts)) {
		const v = opts[k]
		if (typeof v === 'string') {
			if (/^#?[0-9A-F]{6}$/i.test(v) && _isLikelyColorKey(k)) acc.add(v.replace(/^#/, '').toUpperCase())
		} else if (v && typeof v === 'object') {
			_collectColors(v, acc)
		}
	}
	return acc
}

async function handleInspectShapes(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const objects = _editableSlideObjects(slide)
	const shapes = []
	for (let i = 0; i < objects.length; i++) {
		const { obj, rawIndex } = objects[i]
		const opts = obj.options || {}
		const colors = Array.from(_collectColors(opts))
		_collectColors(obj.text, new Set(colors)).forEach(c => {
			if (!colors.includes(c)) colors.push(c)
		})
		if (obj.passthrough?.xml) {
			_collectXmlColorsFromString(obj.passthrough.xml, new Set(colors)).forEach(c => {
				if (!colors.includes(c)) colors.push(c)
			})
		}
		const entry = {
			index: i,
			rawIndex,
			objectName: opts.objectName,
			kind: obj.type || obj._type,
			shapeName: obj.shape,
			x: opts.x, y: opts.y, w: opts.w, h: opts.h,
			rotate: opts.rotate,
			fill: opts.fill,
			line: opts.line,
			color: opts.color,
			fontSize: opts.fontSize,
			fontFace: opts.fontFace,
			bold: opts.bold,
			italic: opts.italic,
			align: opts.align,
			valign: opts.valign,
			shadow: opts.shadow,
			glow: opts.glow,
			reflection: opts.reflection,
			softEdges: opts.softEdges,
			text3D: opts.text3D,
			wordArt: opts.wordArt,
			colors,
			editHandle: _shapeEditHandle(obj, { index: i, rawIndex }),
			editability: _shapeEditability(obj, { index: i, rawIndex }),
		}
		if (obj.passthrough?.xml) {
			entry.passthrough = {
				originalType: opts._passthroughOriginalType,
				relsAdded: opts._passthroughRelsAdded,
				semanticKind: opts._passthroughSemanticKind,
				sourceFormat: opts._passthroughSourceFormat,
				preservation: opts._passthroughPreservation,
				rawXmlBytes: obj.passthrough.xml.length,
			}
		}
		if (_isChartExPassthrough(obj)) {
			entry.chart = {
				editable: true,
				family: 'chartEx',
				editBehavior: 'slide.update_chart converts this preserved ChartEx passthrough to a native editable ChartEx chart on first edit.',
				metadata: opts._chartEx,
			}
		}
		if (obj.equation) {
			entry.equation = _sanitizeOpts(obj.equation)
		}
		if (args.includeText !== false) {
			if (typeof obj.text === 'string') entry.text = obj.text
			else if (Array.isArray(obj.text)) entry.text = obj.text
			else if (typeof opts.text === 'string') entry.text = opts.text
			else if (Array.isArray(opts.text)) entry.text = opts.text
		}
		if (args.full === true) entry.optionsRaw = _sanitizeOpts(opts)
		shapes.push(entry)
	}
	return { slideIndex: args.slideIndex, count: shapes.length, shapes }
}

async function handleEditabilityReport(args) {
	const { pptx } = getDeck(args.deckId)
	const byTier = {}
	const byKind = {}
	const slides = []
	for (let si = 0; si < pptx.slides.length; si++) {
		const objects = []
		const editable = _editableSlideObjects(pptx.slides[si])
		for (let index = 0; index < editable.length; index++) {
			const { obj, rawIndex } = editable[index]
			const kind = _shapeKind(obj) || 'unknown'
			const editability = _shapeEditability(obj)
			byKind[kind] = (byKind[kind] || 0) + 1
			byTier[editability.tier] = (byTier[editability.tier] || 0) + 1
			objects.push({
				index,
				rawIndex,
				objectName: obj.options?.objectName,
				kind,
				editHandle: _shapeEditHandle(obj, { index, rawIndex }),
				editability,
			})
		}
		slides.push({
			index: si,
			slideNumber: si + 1,
			objectCount: objects.length,
			objects,
		})
	}
	const wrapperEditable = Number(byTier['wrapper-editable'] || 0)
	const preserveOnly = Number(byTier['preserve-only'] || 0)
	return {
		ok: true,
		deckId: args.deckId,
		slideCount: pptx.slides.length,
		objectCount: slides.reduce((sum, slide) => sum + slide.objectCount, 0),
		byTier,
		byKind,
		slides: args.compact === true ? slides.map(slide => ({
			index: slide.index,
			slideNumber: slide.slideNumber,
			objectCount: slide.objectCount,
			tiers: slide.objects.reduce((acc, obj) => {
				acc[obj.editability.tier] = (acc[obj.editability.tier] || 0) + 1
				return acc
			}, {}),
		})) : slides,
		recommendation: wrapperEditable || preserveOnly
			? 'Some imported objects are wrapper-editable or preserve-only. Use inspect_shapes for exact targets, update_shape/delete_shapes/reorder_shape for wrapper edits, and recreate or promote objects when semantic mutation is required.'
			: 'All discovered editable objects have semantic mutation paths.',
	}
}

// Deep merge `patch` into `target` (mutates target). Arrays in the patch
// REPLACE the corresponding arrays in target (no element-wise merge), because
// that's almost always what the AI client wants when editing.
function _deepMerge(target, patch) {
	if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch
	if (!target || typeof target !== 'object') target = {}
	for (const k of Object.keys(patch)) {
		const v = patch[k]
		if (v === null) {
			delete target[k]
		} else if (Array.isArray(v)) {
			target[k] = v
		} else if (v && typeof v === 'object') {
			target[k] = _deepMerge(target[k] || {}, v)
		} else {
			target[k] = v
		}
	}
	return target
}

// Resolve the target shape — by index, objectName, or kind+nth filter
function _resolveShape(slide, target) {
	const editable = _editableSlideObjects(slide)
	if (target == null) throw new Error('update_shape: `target` is required')
	if (typeof target === 'number') return { obj: editable[target]?.obj, index: target, rawIndex: editable[target]?.rawIndex }
	if (typeof target === 'object') {
		if (typeof target.rawIndex === 'number') return { obj: (slide._slideObjects || [])[target.rawIndex], index: editable.findIndex(x => x.rawIndex === target.rawIndex), rawIndex: target.rawIndex }
		if (typeof target.index === 'number') return { obj: editable[target.index]?.obj, index: target.index, rawIndex: editable[target.index]?.rawIndex }
		if (target.objectName) {
			for (let i = 0; i < editable.length; i++) {
				if (editable[i].obj.options?.objectName === target.objectName) return { obj: editable[i].obj, index: i, rawIndex: editable[i].rawIndex }
			}
		}
	}
	return { obj: null, index: -1, rawIndex: -1 }
}

function _shapeKind(obj) {
	return obj?.type || obj?._type || null
}

function _mergeEditability(base, imported) {
	if (!imported || typeof imported !== 'object') return base
	const tools = Array.from(new Set([...(imported.tools || []), ...(base.tools || [])]))
	const operations = Array.from(new Set([...(imported.operations || []), ...(base.operations || [])]))
	return {
		...base,
		...imported,
		tools,
		operations,
		limitations: imported.limitations || base.limitations,
		recreateWith: imported.recreateWith || base.recreateWith,
	}
}

function _shapeEditHandle(obj = {}, context = {}) {
	const opts = obj.options || {}
	const existing = opts._decypherEditHandle
	const objectName = opts.objectName
	const selectors = Array.from(new Set([
		...(Array.isArray(existing?.stableSelectors) ? existing.stableSelectors : []),
		objectName ? `objectName:${objectName}` : null,
		opts.spid != null ? `spid:${opts.spid}` : null,
		Number.isInteger(context.index) ? `index:${context.index}` : null,
		Number.isInteger(context.rawIndex) ? `rawIndex:${context.rawIndex}` : null,
	].filter(Boolean)))
	return {
		id: existing?.id || (opts.spid != null ? `spid:${opts.spid}` : objectName || `rawIndex:${context.rawIndex ?? 'unknown'}`),
		source: existing?.source || {
			kind: opts._decypherEditHandle ? 'decypher' : 'generated',
			objectName: objectName || null,
			shapeId: opts.spid ?? null,
		},
		stableSelectors: selectors,
	}
}

function _shapeEditability(obj = {}, context = {}) {
	const kind = _shapeKind(obj)
	const imported = obj.options?._decypherEditability || obj.options?._decypherEditHandle?.editability || null
	if (_isChartExPassthrough(obj)) {
		return _mergeEditability({
			tier: 'promotable',
			semantic: true,
			tools: ['betterpptx.slide.update_chart', 'betterpptx.slide.update_shape', 'betterpptx.slide.delete_shapes', 'betterpptx.slide.reorder_shape'],
			operations: ['chart-data', 'chart-type', 'style', 'geometry', 'animation-target'],
			note: 'Preserved ChartEx passthrough promotes to native editable ChartEx on first update_chart call.',
		}, imported)
	}
	if (kind === 'passthrough') {
		return _mergeEditability({
			tier: 'wrapper-editable',
			semantic: false,
			tools: ['betterpptx.slide.update_shape', 'betterpptx.slide.delete_shapes', 'betterpptx.slide.reorder_shape'],
			operations: ['wrapper-style', 'wrapper-metadata', 'z-order', 'delete'],
			note: 'Raw passthrough OOXML is preserved for repair safety. Move/restyle/delete the wrapper, or recreate/promote to a structured object for semantic edits.',
		}, imported)
	}
	const semanticTools = {
		text: ['betterpptx.slide.update_shape'],
		shape: ['betterpptx.slide.update_shape'],
		image: ['betterpptx.slide.update_shape'],
		freeform: ['betterpptx.slide.update_shape'],
		model3d: ['betterpptx.slide.update_shape'],
		equation: ['betterpptx.slide.update_equation', 'betterpptx.slide.update_shape'],
		table: ['betterpptx.slide.update_table', 'betterpptx.slide.update_shape'],
		chart: ['betterpptx.slide.update_chart', 'betterpptx.slide.update_shape'],
		smartart: ['betterpptx.slide.update_smartart', 'betterpptx.slide.update_shape'],
		media: ['betterpptx.slide.update_media', 'betterpptx.slide.update_shape'],
	}
	const tools = semanticTools[kind] || ['betterpptx.slide.update_shape']
	return _mergeEditability({
		tier: 'semantic',
		semantic: true,
		tools: [...tools, 'betterpptx.slide.delete_shapes', 'betterpptx.slide.reorder_shape'],
		operations: imported?.operations || ['style', 'geometry', 'animation-target'],
		note: 'Generated or structurally imported object has a direct mutation path.',
	}, imported)
}

function _availableShapeTargets(slide) {
	return _editableSlideObjects(slide)
		.map((x, i) => `[${i}]${x.obj.options?.objectName || _shapeKind(x.obj) || 'shape'}`)
		.join(', ')
}

function _resolveShapeForTool(slide, target, toolName) {
	const result = _resolveShape(slide, target)
	if (!result.obj) {
		throw new Error(`${toolName}: target not found. Available: ${_availableShapeTargets(slide)}`)
	}
	return result
}

function _resolveTypedShape(slide, target, kinds, toolName) {
	const result = _resolveShapeForTool(slide, target, toolName)
	const kind = _shapeKind(result.obj)
	if (!kinds.includes(kind)) {
		throw new Error(`${toolName}: target "${result.obj.options?.objectName || result.index}" is ${kind || 'unknown'}, expected ${kinds.join(' or ')}.`)
	}
	return result
}

const RAW_EFFECT_PATCH_KEYS = new Set(['shadow', 'glow', 'reflection', 'softEdges', 'effect', 'effects'])
const RAW_FILL_PATCH_KEYS = new Set(['fill', 'color', 'transparency'])
const RAW_LINE_PATCH_KEYS = new Set(['line', 'border'])
const TEXT_STYLE_PATCH_KEYS = new Set([
	'text', 'fontSize', 'fontFace', 'color', 'bold', 'italic', 'underline', 'strike',
	'subscript', 'superscript', 'breakLine', 'charSpacing', 'fit', 'margin', 'align',
	'valign', 'vert', 'rotate', 'autoFit', 'wordArt', 'text3D', 'lineSpacing',
	'paraSpaceBefore', 'paraSpaceAfter', 'bullet', 'indent', 'hanging', 'highlight',
	'transparency', 'lang', 'rtlMode', 'glow', 'shadow', 'reflection', 'softEdges',
])
const RUN_STYLE_PATCH_KEYS = new Set([
	'fontSize', 'fontFace', 'color', 'bold', 'italic', 'underline', 'strike',
	'subscript', 'superscript', 'breakLine', 'charSpacing', 'highlight',
	'transparency', 'lang', 'glow', 'shadow', 'reflection', 'softEdges', 'text3D',
])

function _patchHasAny(patch, keys) {
	if (!patch || typeof patch !== 'object') return false
	return Object.keys(patch).some(k => keys.has(k))
}

function _deleteOwnKeys(target, keys, removed) {
	if (!target || typeof target !== 'object') return
	for (const key of keys) {
		if (Object.prototype.hasOwnProperty.call(target, key)) {
			delete target[key]
			removed.add(key)
		}
	}
}

function _textRunPatch(patch) {
	const out = {}
	for (const [key, value] of Object.entries(patch || {})) {
		if (RUN_STYLE_PATCH_KEYS.has(key)) out[key] = value
	}
	return out
}

function _clearRawTextRunBlockers(text, removed, runPatch) {
	if (!Array.isArray(text)) return
	for (const item of text) {
		if (!item || typeof item !== 'object') continue
		if (item.options && typeof item.options === 'object') {
			_deleteOwnKeys(item.options, [
				'_rawRprXml',
				'_rawRprAttrs',
				'_rawRprChildXmlExact',
				'_rawRunChildXml',
				'_rawParagraphChildXmlExact',
				'_rawDefRPrChildXml',
				'_rawPPrXml',
				'_rawPPrAttrs',
			], removed)
			if (Object.keys(runPatch).length) _deepMerge(item.options, runPatch)
		} else if (Object.keys(runPatch).length) {
			item.options = _deepCloneData(runPatch)
		}
		if (Array.isArray(item.text)) _clearRawTextRunBlockers(item.text, removed, runPatch)
		if (Array.isArray(item.children)) _clearRawTextRunBlockers(item.children, removed, runPatch)
		if (Array.isArray(item.runs)) _clearRawTextRunBlockers(item.runs, removed, runPatch)
	}
}

function _clearRawEditBlockers(obj, patch) {
	const removed = new Set()
	if (!obj || !patch || typeof patch !== 'object') return []
	const opts = obj.options || (obj.options = {})
	const kind = _shapeKind(obj)
	if (_patchHasAny(patch, RAW_EFFECT_PATCH_KEYS)) {
		_deleteOwnKeys(opts, ['_rawEffectLstXml', '_rawEffectDagXml', '_rawEffectXml'], removed)
	}
	if (_patchHasAny(patch, RAW_FILL_PATCH_KEYS)) {
		_deleteOwnKeys(opts, ['_rawFillXml', '_rawSpPrFillXml', '_rawBlipFillXml'], removed)
	}
	if (_patchHasAny(patch, RAW_LINE_PATCH_KEYS)) {
		_deleteOwnKeys(opts, ['_rawLineXml', '_rawLnXml'], removed)
	}
	if ((kind === 'text' || kind === 'shape') && _patchHasAny(patch, TEXT_STYLE_PATCH_KEYS)) {
		_deleteOwnKeys(opts, [
			'_rawTxBodyXml',
			'_rawBodyPrXml',
			'_rawBodyPrAttrs',
			'_rawBodyPrChildXml',
			'_rawLstStyleXml',
			'_rawPPrXml',
			'_rawPPrAttrs',
			'_rawEndParaRPrXml',
			'_rawEndParaRPrAttrs',
			'_rawDefRPrChildXml',
		], removed)
		_clearRawTextRunBlockers(obj.text, removed, _textRunPatch(patch))
		if (Array.isArray(opts.text)) _clearRawTextRunBlockers(opts.text, removed, _textRunPatch(patch))
	}
	return Array.from(removed).sort()
}

async function handleUpdateShape(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const { obj, index, rawIndex } = _resolveShapeForTool(slide, args.target, 'update_shape')
	if (!args.patch || typeof args.patch !== 'object') throw new Error('update_shape: `patch` (object) is required')
	const patch = normalizeVisualOptions(args.patch, 'slide.update_shape patch')
	if (!obj.options) obj.options = {}
	const rawPreservationCleared = _clearRawEditBlockers(obj, patch)
	_deepMerge(obj.options, patch)
	// Top-level shape props like obj.text (for text boxes) live OUTSIDE options.
	// If the patch contains `text` and the object is a text shape, accept it at top level too.
	if (patch.text !== undefined && (obj.type === 'text' || obj._type === 'text')) {
		obj.text = patch.text
	}
	return {
		ok: true,
		slideIndex: args.slideIndex,
		index,
		rawIndex,
		objectName: obj.options?.objectName,
		patchedKeys: Object.keys(patch),
		rawPreservationCleared,
	}
}

// Deck-level transform: walks every slide and every shape, applies a recipe.
// Two transform kinds (composable, generic):
//   • colorMap: { 'FFAAFF': '00FF00', ... } — replaces hex colours anywhere
//     in any shape's fill/line/text-run/color/etc.
//   • patch + filter: { kinds?, objectNames?, slideRange? } + the same deep
//     patch as update_shape — applies to every matching shape.
// Both can be used in the same call.
// ---------------------------------------------------------------------------
//  Color resolver — the single source of truth for "what should this hex
//  become?". Built once per transform call. Supports:
//    • colorMap:        explicit { OLDHEX: NEWHEX } find/replace
//    • colorTransform:  a generic color-math function applied to EVERY hex
//      ('invertLightness' | 'invert' | 'grayscale' | 'complement' |
//       'rotateHue:N' | 'darken:N' | 'lighten:N' | 'saturate:N' | 'desaturate:N')
//  colorMap wins for any hex it explicitly lists; colorTransform handles the rest.
//  Returns null for "leave unchanged" so callers can count real changes.
// ---------------------------------------------------------------------------
function makeColorTransformFn(spec) {
	let kind, amount
	if (typeof spec === 'string') {
		const idx = spec.indexOf(':')
		if (idx >= 0) { kind = spec.slice(0, idx); amount = parseFloat(spec.slice(idx + 1)) }
		else { kind = spec }
	} else if (spec && typeof spec === 'object') {
		kind = spec.kind; amount = spec.amount
	}
	if (!kind) return null
	return (hex) => {
		const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16)
		if (![r, g, b].every(Number.isFinite)) return null
		switch (kind) {
			case 'invert': return hexFromRgb(255 - r, 255 - g, 255 - b)
			case 'grayscale': { const y = 0.299 * r + 0.587 * g + 0.114 * b; return hexFromRgb(y, y, y) }
			default: break
		}
		let [h, s, l] = rgbToHsl(r, g, b)
		switch (kind) {
			case 'invertLightness': l = 1 - l; break
			case 'complement': h = (h + 180) % 360; break
			case 'rotateHue': h = (((h + (Number.isFinite(amount) ? amount : 180)) % 360) + 360) % 360; break
			case 'darken': l = Math.max(0, l - (Number.isFinite(amount) ? amount : 0.2)); break
			case 'lighten': l = Math.min(1, l + (Number.isFinite(amount) ? amount : 0.2)); break
			case 'saturate': s = Math.min(1, s + (Number.isFinite(amount) ? amount : 0.2)); break
			case 'desaturate': s = Math.max(0, s - (Number.isFinite(amount) ? amount : 0.2)); break
			default: return null
		}
		return hslToHex(h, s, l)
	}
}

function makeRecolorResolver({ colorMap, colorTransform } = {}) {
	const map = colorMap ? Object.fromEntries(
		Object.entries(colorMap).map(([k, v]) => [String(k).toUpperCase(), String(v).toUpperCase()])
	) : null
	const xform = colorTransform ? makeColorTransformFn(colorTransform) : null
	if (!map && !xform) return null
	return (hex) => {
		const upper = String(hex).toUpperCase()
		if (map && Object.prototype.hasOwnProperty.call(map, upper)) {
			return map[upper] === upper ? null : map[upper]
		}
		if (xform) {
			const out = xform(upper)
			return (out && out.toUpperCase() !== upper) ? out : null
		}
		return null
	}
}

function _remapColorsInString(value, recolor) {
	let count = 0
	const text = String(value ?? '')
	const out = text.replace(/\b([0-9A-F]{6})\b/gi, (match, hex) => {
		const next = recolor(hex)
		if (next == null) return match
		count++
		return next
	})
	return { value: out, count }
}

function _remapColorsInXmlString(value, recolor) {
	let count = 0
	let out = String(value ?? '')
	const remapAttr = (_match, prefix, hex, suffix) => {
		const next = recolor(hex)
		if (next == null) return `${prefix}${hex}${suffix}`
		count++
		return `${prefix}${next}${suffix}`
	}
	out = out.replace(/(<[A-Za-z_][\w.-]*:srgbClr\b[^>]*\bval\s*=\s*["'])([0-9A-Fa-f]{6})(["'])/g, remapAttr)
	out = out.replace(/(\blastClr\s*=\s*["'])([0-9A-Fa-f]{6})(["'])/g, remapAttr)
	out = out.replace(/(\b(?:color|fillcolor|strokecolor)\s*=\s*["']#?)([0-9A-Fa-f]{6})(["'])/g, remapAttr)
	return { value: out, count }
}

// Recolor structured pptxgenjs options/data IN PLACE.
//   • `seen` (WeakSet) guards against processing the SAME object/array twice —
//     pptxgenjs makes obj.options === obj.text[0].options for text shapes, so
//     without the guard a non-idempotent colorTransform (e.g. invertLightness)
//     would be applied twice and cancel itself out.
//   • SAFETY: a 6-digit token is only treated as a colour when it is EITHER a
//     string value that is EXACTLY 6 hex chars (e.g. options.color = 'FF0000',
//     chartColors:['FF0000',...]) OR appears inside a recognised colour XML
//     attribute (srgbClr/lastClr/color=). Bare 6-digit tokens inside arbitrary
//     strings (e.g. creationId="410006", coordinate fragments in native-hint
//     XML) are NEVER touched. This is what makes recolor safe on round-tripped
//     native decks (WordArt creationIds, etc.).
const _PURE_HEX_RE = /^[0-9A-Fa-f]{6}$/
function _remapColorsInPlace(value, recolor, seen) {
	if (!seen) seen = new WeakSet()
	let count = 0
	if (Array.isArray(value)) {
		if (seen.has(value)) return 0
		seen.add(value)
		for (let i = 0; i < value.length; i++) {
			const el = value[i]
			if (typeof el === 'string') {
				if (_PURE_HEX_RE.test(el)) {
					const next = recolor(el)
					if (next != null) { value[i] = next; count++ }
				} else {
					const remapped = _remapColorsInXmlString(el, recolor)
					if (remapped.value !== el) value[i] = remapped.value
					count += remapped.count
				}
			} else {
				count += _remapColorsInPlace(el, recolor, seen)
			}
		}
		return count
	}
	if (!value || typeof value !== 'object') return 0
	if (seen.has(value)) return 0
	seen.add(value)
	for (const k of Object.keys(value)) {
		const v = value[k]
		if (typeof v === 'string') {
			if (_PURE_HEX_RE.test(v)) {
				const next = recolor(v)
				if (next != null) { value[k] = next; count++ }
			} else {
				// Only recolour hex inside recognised colour XML attributes; never
				// bare numeric tokens in arbitrary strings (IDs, coordinates, ...).
				const remapped = _remapColorsInXmlString(v, recolor)
				if (remapped.value !== v) value[k] = remapped.value
				count += remapped.count
			}
		} else if (v && typeof v === 'object') {
			count += _remapColorsInPlace(v, recolor, seen)
		}
	}
	return count
}

function _remapPassthroughXmlInPlace(obj, recolor) {
	if (!obj?.passthrough?.xml) return 0
	const before = obj.passthrough.xml
	const remapped = _remapColorsInXmlString(before, recolor)
	if (remapped.value !== before) obj.passthrough.xml = remapped.value
	return remapped.count
}

function _rawPartLooksXml(part) {
	const p = String(part?.path || '').toLowerCase()
	return p.endsWith('.xml') || p.endsWith('.rels')
}

function _getRawPartText(part) {
	const data = part?.data
	if (data == null) return ''
	if (part.encoding === 'base64') return Buffer.from(String(data), 'base64').toString('utf8')
	return String(data)
}

function _setRawPartText(part, text) {
	if (part.encoding === 'base64') {
		part.data = Buffer.from(String(text), 'utf8').toString('base64')
	} else {
		part.data = String(text)
	}
}

function _remapRawPackagePartsInPlace(pptx, recolor) {
	const rawParts = Array.isArray(pptx?._rawPackageParts) ? pptx._rawPackageParts : []
	let partsTouched = 0
	let colorsRemapped = 0
	for (const part of rawParts) {
		if (!_rawPartLooksXml(part)) continue
		const before = _getRawPartText(part)
		if (!before) continue
		const remapped = _remapColorsInXmlString(before, recolor)
		if (remapped.value !== before) {
			_setRawPartText(part, remapped.value)
			partsTouched++
			colorsRemapped += remapped.count
		}
	}
	return { partsTouched, colorsRemapped }
}

async function handleTransformShapes(args) {
	const { pptx } = getDeck(args.deckId)
	const recolor = makeRecolorResolver({ colorMap: args.colorMap, colorTransform: args.colorTransform })
	const colorMap = recolor  // truthy gate: any color operation requested
	const filter = args.filter || {}
	const patch = args.patch ? normalizeVisualOptions(args.patch, 'deck.transform_shapes patch') : null
	const sliceFrom = filter.slideRange?.[0] ?? 0
	const sliceTo = filter.slideRange?.[1] ?? pptx.slides.length - 1
	let shapesTouched = 0
	let colorsRemapped = 0
	let rawXmlColorsRemapped = 0
	let rawTimingColorsRemapped = 0
	let rawPackagePartsTouched = 0
	const slideCounts = []
	for (let si = sliceFrom; si <= sliceTo && si < pptx.slides.length; si++) {
		const slide = pptx.slides[si]
		const objects = _editableSlideObjects(slide).map(x => x.obj)
		let slideTouched = 0
		for (let i = 0; i < objects.length; i++) {
			const obj = objects[i]
			const opts = obj.options || {}
			if (filter.kinds && filter.kinds.length > 0 && !filter.kinds.includes(obj.type || obj._type)) continue
			if (filter.objectNames && filter.objectNames.length > 0 && !filter.objectNames.includes(opts.objectName)) continue
			if (filter.objectNameRegex) {
				const rx = new RegExp(filter.objectNameRegex)
				if (!opts.objectName || !rx.test(opts.objectName)) continue
			}
			let touched = false
			if (recolor) {
				// One shared `seen` set per shape so shapes whose obj.options and
				// obj.text[0].options are the SAME reference aren't recolored twice.
				const seen = new WeakSet()
				const before = JSON.stringify(opts)
				const remappedInOptions = _remapColorsInPlace(opts, recolor, seen)
				let remappedInText = 0
				// Recolour run-level colours inside obj.text (array of runs). When
				// obj.text is a plain string it's literal display text — NOT a colour —
				// so we leave it alone (its colour lives in obj.options.color).
				if (Array.isArray(obj.text)) {
					remappedInText = _remapColorsInPlace(obj.text, recolor, seen)
				}
				const remappedInXml = _remapPassthroughXmlInPlace(obj, recolor)
				const after = JSON.stringify(opts)
				const remappedCount = remappedInOptions + remappedInText + remappedInXml
				if (before !== after || remappedCount > 0) {
					touched = true
					colorsRemapped += remappedInOptions + remappedInText
					rawXmlColorsRemapped += remappedInXml
				}
			}
			if (patch) {
				if (!obj.options) obj.options = {}
				_clearRawEditBlockers(obj, patch)
				_deepMerge(obj.options, patch)
				touched = true
			}
			if (touched) { shapesTouched++; slideTouched++ }
		}
		// Also update background colour via the resolver
		if (recolor && slide.background && slide.background.color) {
			const next = recolor(slide.background.color)
			if (next != null) { slide.background.color = next; colorsRemapped++ }
		}
		if (recolor && slide._rawTimingXml) {
			const remapped = _remapColorsInXmlString(slide._rawTimingXml, recolor)
			if (remapped.value !== slide._rawTimingXml) slide._rawTimingXml = remapped.value
			rawTimingColorsRemapped += remapped.count
		}
		if (recolor && slide._rawTransitionXml) {
			const remapped = _remapColorsInXmlString(slide._rawTransitionXml, recolor)
			if (remapped.value !== slide._rawTransitionXml) slide._rawTransitionXml = remapped.value
			rawTimingColorsRemapped += remapped.count
		}
		slideCounts.push({ slideIndex: si, shapesTouched: slideTouched })
	}
	if (recolor) {
		const rawRemap = _remapRawPackagePartsInPlace(pptx, recolor)
		rawPackagePartsTouched = rawRemap.partsTouched
		rawXmlColorsRemapped += rawRemap.colorsRemapped
	}
	return { ok: true, shapesTouched, colorsRemapped, rawXmlColorsRemapped, rawTimingColorsRemapped, rawPackagePartsTouched, slideCounts }
}

async function handleAnimateShapes(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const animation = normalizeAnimation(args.animation)
	const targets = []
	const objects = _editableSlideObjects(slide)
	let appliedCount = 0
	const hadRawTiming = Boolean(slide._rawTimingXml)
	let replacedRawTiming = false
	for (let i = 0; i < objects.length; i++) {
		const { obj, rawIndex } = objects[i]
		const opts = obj.options || {}
		const passesName = !args.names || args.names.length === 0 || args.names.includes(opts.objectName)
		const passesKind = !args.kinds || args.kinds.length === 0 || args.kinds.includes(obj.type || obj._type)
		const passesIndex = !args.indices || args.indices.length === 0 || args.indices.includes(i)
		if (passesName && passesKind && passesIndex) {
			const a = args.staggerMs ? { ...animation, delay: (animation.delay || 0) + appliedCount * args.staggerMs } : animation
			slide.addAnimation(obj, a)
			targets.push({ index: i, rawIndex, objectName: opts.objectName, kind: obj.type || obj._type })
			appliedCount++
		}
	}
	if (appliedCount > 0 && slide._rawTimingXml && args.preserveExistingTiming !== true) {
		delete slide._rawTimingXml
		replacedRawTiming = true
	}
	return {
		slideIndex: args.slideIndex,
		animationsApplied: appliedCount,
		targets,
		replacedRawTiming,
		generatedAnimationsMaskedByRawTiming: hadRawTiming && appliedCount > 0 && args.preserveExistingTiming === true,
	}
}

async function handleSetTransitionsAll(args) {
	const { pptx } = getDeck(args.deckId)
	const t = args.transition || { type: 'fade', speed: 'medium' }
	const variants = args.variants || []  // optional: list of transition objects to rotate through
	for (let i = 0; i < pptx.slides.length; i++) {
		const useT = variants.length > 0 ? variants[i % variants.length] : t
		pptx.slides[i].transition = { ...useT }
	}
	return { ok: true, slidesUpdated: pptx.slides.length }
}

async function handleSetSlideTransition(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const transition = args.transition || null
	if (transition) slide.transition = { ...transition }
	else delete slide.transition
	return { ok: true, slideIndex: args.slideIndex, transition: slide.transition || null }
}

function _slideNotesText(slide) {
	return (slide?._slideObjects || [])
		.filter(obj => (obj?.type || obj?._type) === 'notes')
		.map(obj => obj?.text?.[0]?.text || '')
		.join('')
}

function _clearSlideNotes(slide) {
	const before = (slide._slideObjects || []).length
	slide._slideObjects = (slide._slideObjects || []).filter(obj => (obj?.type || obj?._type) !== 'notes')
	return before - slide._slideObjects.length
}

async function handleInspectSlide(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	return {
		ok: true,
		slideIndex: args.slideIndex,
		slideNum: slide._slideNum,
		layoutName: slide._slideLayout?._name || slide._templateLayoutName || null,
		background: slide.background || null,
		color: slide.color,
		hidden: slide.hidden === true,
		transition: slide.transition || null,
		slideNumber: slide.slideNumber || null,
		notes: _slideNotesText(slide),
		objectCount: _editableSlideObjects(slide).length,
	}
}

async function handleUpdateSlide(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const patch = args.patch && typeof args.patch === 'object' ? args.patch : args
	const updated = []
	const has = key => Object.prototype.hasOwnProperty.call(patch, key)
	if (has('background')) {
		if (patch.background == null) delete slide.background
		else slide.background = patch.background
		updated.push('background')
	}
	if (has('color')) {
		if (patch.color == null) delete slide.color
		else slide.color = patch.color
		updated.push('color')
	}
	if (has('hidden')) {
		if (patch.hidden == null) delete slide.hidden
		else slide.hidden = Boolean(patch.hidden)
		updated.push('hidden')
	}
	if (has('slideNumber')) {
		if (patch.slideNumber == null) delete slide.slideNumber
		else slide.slideNumber = patch.slideNumber
		updated.push('slideNumber')
	}
	if (has('transition')) {
		if (patch.transition == null) delete slide.transition
		else slide.transition = { ...patch.transition }
		updated.push('transition')
	}
	if (has('notes') || has('notesMode')) {
		const mode = String(patch.notesMode || (patch.notes == null ? 'clear' : 'replace')).toLowerCase()
		if (!['replace', 'append', 'clear'].includes(mode)) throw new Error('slide.update: notesMode must be replace, append, or clear.')
		const text = patch.notes == null ? '' : String(patch.notes)
		let removed = 0
		if (mode === 'replace' || mode === 'clear') removed = _clearSlideNotes(slide)
		if (mode !== 'clear' && text) slide.addNotes(text)
		updated.push('notes')
		return { ok: true, slideIndex: args.slideIndex, updated, notesMode: mode, notesRemoved: removed, notes: _slideNotesText(slide) }
	}
	return { ok: true, slideIndex: args.slideIndex, updated, transition: slide.transition || null, background: slide.background || null }
}

function _selectShapeTargets(slide, args = {}, toolName = 'shape selection') {
	const editable = _editableSlideObjects(slide)
	const selected = new Map()
	const addResolved = resolved => {
		if (!resolved?.obj || resolved.rawIndex < 0) return
		selected.set(resolved.rawIndex, {
			obj: resolved.obj,
			index: resolved.index,
			rawIndex: resolved.rawIndex,
			objectName: resolved.obj.options?.objectName,
			kind: _shapeKind(resolved.obj),
		})
	}
	if (args.target != null) addResolved(_resolveShapeForTool(slide, args.target, toolName))
	for (const target of args.targets || []) addResolved(_resolveShapeForTool(slide, target, toolName))
	for (const index of args.indices || []) {
		const n = Number(index)
		if (Number.isInteger(n)) addResolved({ obj: editable[n]?.obj, index: n, rawIndex: editable[n]?.rawIndex })
	}
	for (const objectName of [...(args.names || []), ...(args.objectNames || [])]) {
		addResolved(_resolveShapeForTool(slide, { objectName }, toolName))
	}
	const kinds = Array.isArray(args.kinds) ? new Set(args.kinds.map(String)) : null
	let rx = null
	if (args.objectNameRegex) rx = new RegExp(String(args.objectNameRegex))
	if (kinds || rx) {
		for (let i = 0; i < editable.length; i++) {
			const obj = editable[i].obj
			const name = obj.options?.objectName || ''
			if (kinds && !kinds.has(String(_shapeKind(obj)))) continue
			if (rx && !rx.test(name)) continue
			addResolved({ obj, index: i, rawIndex: editable[i].rawIndex })
		}
	}
	const out = Array.from(selected.values()).sort((a, b) => a.rawIndex - b.rawIndex)
	if (!out.length && args.allowEmpty !== true) throw new Error(`${toolName}: no shapes matched. Available: ${_availableShapeTargets(slide)}`)
	return out
}

async function handleDeleteShapes(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const targets = _selectShapeTargets(slide, args, 'slide.delete_shapes')
	for (const item of [...targets].sort((a, b) => b.rawIndex - a.rawIndex)) {
		slide._slideObjects.splice(item.rawIndex, 1)
	}
	return {
		ok: true,
		slideIndex: args.slideIndex,
		deletedCount: targets.length,
		deleted: targets.map(({ index, rawIndex, objectName, kind }) => ({ index, rawIndex, objectName, kind })),
		remainingObjects: _editableSlideObjects(slide).length,
	}
}

async function handleReorderShape(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const rawObjects = slide._slideObjects || []
	const resolved = _resolveShapeForTool(slide, args.target ?? args.fromIndex ?? args.index, 'slide.reorder_shape')
	const moving = rawObjects[resolved.rawIndex]
	if (!moving) throw new Error(`slide.reorder_shape: target not found. Available: ${_availableShapeTargets(slide)}`)
	const oldIndex = resolved.index
	rawObjects.splice(resolved.rawIndex, 1)
	const editableAfter = _editableSlideObjects(slide)
	let toIndex
	const position = String(args.position || '').toLowerCase()
	if (position === 'front') toIndex = editableAfter.length
	else if (position === 'back') toIndex = 0
	else if (position === 'forward') toIndex = Math.min(editableAfter.length, oldIndex + 1)
	else if (position === 'backward') toIndex = Math.max(0, oldIndex - 1)
	else if (args.toIndex != null) toIndex = Number(args.toIndex)
	else throw new Error('slide.reorder_shape: pass toIndex or position front|back|forward|backward.')
	if (!Number.isInteger(toIndex)) throw new Error(`slide.reorder_shape: invalid toIndex ${args.toIndex}.`)
	toIndex = Math.max(0, Math.min(toIndex, editableAfter.length))
	let destRaw
	if (!editableAfter.length) destRaw = rawObjects.length
	else if (toIndex <= 0) destRaw = editableAfter[0].rawIndex
	else if (toIndex >= editableAfter.length) destRaw = editableAfter[editableAfter.length - 1].rawIndex + 1
	else destRaw = editableAfter[toIndex].rawIndex
	rawObjects.splice(destRaw, 0, moving)
	const after = _resolveShape(slide, { rawIndex: destRaw })
	return {
		ok: true,
		slideIndex: args.slideIndex,
		objectName: moving.options?.objectName,
		kind: _shapeKind(moving),
		fromIndex: oldIndex,
		toIndex: after.index,
		rawIndex: destRaw,
	}
}

async function handleAutoplay(args) {
	const { pptx } = getDeck(args.deckId)
	const secs = args.secondsPerSlide ?? 6
	const advanceMs = secondsToMs(secs)
	pptx.showSettings = {
		useTimings: true,
		showAnimation: true,
		showNarration: args.showNarration === true ? true : undefined,
		loop: args.loop !== false,
		mode: args.mode || 'kiosk',
	}
	const defaultTransition = args.defaultTransition || { type: 'fade', speed: 'medium' }
	for (const slide of pptx.slides) {
		const t = slide.transition || { ...defaultTransition }
		t.advanceOnClick = false
		t.advanceAfterTime = advanceMs
		slide.transition = t
	}
	return { ok: true, slidesUpdated: pptx.slides.length, secondsPerSlide: secs, advanceAfterTime: advanceMs, showSettings: pptx.showSettings }
}

async function handleAddSlide(args) {
	const entry = getDeck(args.deckId)
	return runDeckIdempotent(entry, 'betterpptx.slide.add', args, async () => {
		const { pptx } = entry
		const layoutBinding = _resolveSlideLayoutRequest(entry, args)
		const nativeMasterName = layoutBinding.kind === 'native-master' ? (layoutBinding.masterName || args.masterName) : args.masterName
		const slide = layoutBinding.kind === 'raw-template'
			? pptx.addSlide({ sectionTitle: args.sectionTitle })
			: pptx.addSlide({ masterName: nativeMasterName, sectionTitle: args.sectionTitle })
		if (layoutBinding.kind === 'raw-template') {
			slide._rawSlideLayoutNumber = layoutBinding.layout.number
			slide._templateLayoutName = layoutBinding.layout.name
			slide._templateLayoutType = layoutBinding.layout.type
		}
		if (args.background) slide.background = args.background
		if (args.transition) slide.transition = args.transition
		if (args.slideNumber) slide.slideNumber = args.slideNumber
		if (args.color) slide.color = args.color
		if (typeof args.hidden === 'boolean') slide.hidden = args.hidden
		if (args.notes) slide.addNotes(args.notes)
		return {
			ok: true,
			slideIndex: pptx.slides.length - 1,
			slideNum: slide._slideNum,
			layoutBinding: layoutBinding.kind === 'raw-template' ? {
				kind: layoutBinding.kind,
				layoutNumber: layoutBinding.layout.number,
				layoutName: layoutBinding.layout.name,
				layoutType: layoutBinding.layout.type,
			} : {
				kind: layoutBinding.kind,
				layoutName: layoutBinding.effective || nativeMasterName || slide._slideLayout?._name || null,
			},
		}
	})
}

function _deepCloneData(v) {
	if (v === undefined || v === null) return v
	try { return structuredClone(v) } catch (_) { return JSON.parse(JSON.stringify(v)) }
}

// Duplicate a slide into a NEW appended slide — a faithful, IDENTITY-PRESERVING
// clone (objects + their objectName/spid, all three rel arrays, background,
// layout). Preserving object identity is what lets PowerPoint MORPH match the
// objects across the consecutive pair and interpolate any subsequent edits — the
// "magic move". Passthrough objects clone verbatim so they keep their native
// a16:creationId (PowerPoint's own morph-match key); structured objects keep the
// same shape id + name, which morph's automatic matcher uses for duplicated-then-
// moved shapes. Optionally stamps a transition (e.g. morph) on the clone (the
// transition belongs on the slide being transitioned TO).
// Generic primitive: the AI client composes morph builds from this + update_shape.
async function handleDuplicateSlide(args) {
	const { pptx } = getDeck(args.deckId)
	const srcIndex = args.slideIndex
	const src = pptx.slides[srcIndex]
	if (!src) throw new Error(`duplicate_slide: slideIndex ${srcIndex} out of range (deck has ${pptx.slides.length} slides)`)
	const count = Math.max(1, Number(args.count) || 1)
	const newSlideIndexes = []
	let source = src
	for (let n = 0; n < count; n++) {
		const newSlide = pptx.addSlide()
		// Visual + layout fidelity
		if (source.background !== undefined) newSlide.background = _deepCloneData(source.background)
		if (source.color !== undefined) newSlide.color = source.color
		if (typeof source.hidden === 'boolean') newSlide.hidden = source.hidden
		if (source._rawSlideLayoutNumber) newSlide._rawSlideLayoutNumber = source._rawSlideLayoutNumber
		if (source._slideLayout) newSlide._slideLayout = source._slideLayout
		if (source._rawTimingXml) newSlide._rawTimingXml = source._rawTimingXml
		// Objects + relationships — identity (objectName + spid) carried inside options.
		// NOTE: imported passthrough shapes keep their relationships in `_rawRels`
		// (separate from the standard arrays); it MUST be cloned too or the clone's
		// passthrough r:embed/r:id refs dangle and PowerPoint refuses to open.
		newSlide._slideObjects = _deepCloneData(source._slideObjects) || []
		newSlide._rels = _deepCloneData(source._rels) || []
		newSlide._relsChart = _deepCloneData(source._relsChart) || []
		newSlide._relsMedia = _deepCloneData(source._relsMedia) || []
		newSlide._rawRels = _deepCloneData(source._rawRels) || []
		// Transition (e.g. morph) goes on the slide being transitioned TO (the clone)
		if (args.transition) newSlide.transition = { ...args.transition }
		newSlideIndexes.push(pptx.slides.length - 1)
		source = newSlide // chain so count>1 stacks successive copies
	}
	const editableKinds = (src._slideObjects || []).filter(o => { const k = o.type || o._type; return k && k !== 'notes' })
	return {
		ok: true,
		sourceSlideIndex: srcIndex,
		newSlideIndexes,
		slideCount: pptx.slides.length,
		clonedShapeCount: editableKinds.length,
	}
}

function _normalizeDeckSlideMetadata(pptx, options = {}) {
	const slides = pptx._slides || pptx.slides || []
	for (let i = 0; i < slides.length; i++) {
		const slide = slides[i]
		slide._slideNum = i + 1
		slide._rId = i + 2
		slide._slideId = i + 256
		if (typeof slide._name === 'string' && /^Slide \d+$/.test(slide._name)) slide._name = `Slide ${i + 1}`
	}
	const slideOrder = new Map(slides.map((slide, i) => [slide, i]))
	if (Array.isArray(pptx._sections)) {
		pptx._sections = pptx._sections
			.map(section => ({
				...section,
				_slides: (section._slides || [])
					.filter(slide => slideOrder.has(slide))
					.sort((a, b) => slideOrder.get(a) - slideOrder.get(b)),
			}))
			.filter(section => options.pruneEmptySections ? (section._slides || []).length > 0 : true)
	}
	return slides
}

function _sectionSummaries(pptx) {
	const slideIndex = new Map((pptx.slides || []).map((slide, i) => [slide, i]))
	return (pptx.sections || []).map((section, index) => ({
		index,
		title: section.title,
		type: section._type || 'user',
		slideIndexes: (section._slides || []).map(slide => slideIndex.get(slide)).filter(i => typeof i === 'number'),
	}))
}

async function handleDeleteSlide(args) {
	const { pptx } = getDeck(args.deckId)
	const indexes = Array.isArray(args.slideIndexes)
		? args.slideIndexes
		: (typeof args.slideIndex === 'number' ? [args.slideIndex] : [])
	const unique = Array.from(new Set(indexes.map(n => Number(n)))).sort((a, b) => b - a)
	if (!unique.length) throw new Error('slide.delete: pass slideIndex or slideIndexes.')
	for (const idx of unique) {
		if (!Number.isInteger(idx) || idx < 0 || idx >= pptx.slides.length) throw new Error(`slide.delete: bad slide index ${idx} (deck has ${pptx.slides.length} slides).`)
	}
	if (unique.length >= pptx.slides.length) throw new Error('slide.delete: deleting every slide would create an invalid presentation.')
	const removed = []
	const slides = pptx._slides || pptx.slides
	for (const idx of unique) {
		const [slide] = slides.splice(idx, 1)
		removed.push({ slideIndex: idx, name: slide?._name, slideId: slide?._slideId })
	}
	_normalizeDeckSlideMetadata(pptx, { pruneEmptySections: true })
	return {
		ok: true,
		deletedCount: removed.length,
		deleted: removed.sort((a, b) => a.slideIndex - b.slideIndex),
		slideCount: pptx.slides.length,
		sections: _sectionSummaries(pptx),
	}
}

async function handleReorderSlide(args) {
	const { pptx } = getDeck(args.deckId)
	const slides = pptx._slides || pptx.slides
	if (!slides.length) throw new Error('slide.reorder: deck has no slides.')
	let ordered
	if (Array.isArray(args.order)) {
		if (args.order.length !== slides.length) throw new Error(`slide.reorder: order must contain exactly ${slides.length} slide indexes.`)
		const seen = new Set(args.order)
		if (seen.size !== slides.length || args.order.some(i => !Number.isInteger(Number(i)) || i < 0 || i >= slides.length)) {
			throw new Error('slide.reorder: order must be a permutation of existing zero-based slide indexes.')
		}
		ordered = args.order.map(i => slides[Number(i)])
	} else {
		const fromIndex = Number(args.fromIndex ?? args.slideIndex)
		const toIndex = Number(args.toIndex)
		if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= slides.length) throw new Error(`slide.reorder: bad fromIndex ${fromIndex}.`)
		if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= slides.length) throw new Error(`slide.reorder: bad toIndex ${toIndex}.`)
		ordered = slides.slice()
		const [moved] = ordered.splice(fromIndex, 1)
		ordered.splice(toIndex, 0, moved)
	}
	slides.splice(0, slides.length, ...ordered)
	_normalizeDeckSlideMetadata(pptx)
	return {
		ok: true,
		slideCount: pptx.slides.length,
		order: pptx.slides.map((slide, index) => ({ index, name: slide._name, slideId: slide._slideId })),
		sections: _sectionSummaries(pptx),
	}
}

function _layoutSummary(layout, index) {
	return {
		index,
		name: layout?._name,
		margin: layout?._margin,
		slideNum: layout?._slideNum,
		objectCount: Array.isArray(layout?._slideObjects) ? layout._slideObjects.length : 0,
		hasBackground: !!(layout?.background || layout?.bkgd),
		hasSlideNumber: !!layout?._slideNumberProps,
		relCounts: {
			media: Array.isArray(layout?._relsMedia) ? layout._relsMedia.length : 0,
			charts: Array.isArray(layout?._relsChart) ? layout._relsChart.length : 0,
			links: Array.isArray(layout?._rels) ? layout._rels.length : 0,
		},
	}
}

async function handleInspectLayouts(args) {
	const entry = getDeck(args.deckId)
	const { pptx } = entry
	const layouts = Object.entries(pptx.LAYOUTS || {}).map(([name, layout]) => ({
		name,
		width: layout.width,
		height: layout.height,
		sizeW: layout._sizeW,
		sizeH: layout._sizeH,
	}))
	return {
		deckId: args.deckId,
		activeLayout: pptx.layout,
		presLayout: pptx.presLayout,
		registeredLayouts: layouts,
		layoutAudit: entry.layoutAudit || null,
		layoutPolicy: entry.layoutPolicy ? {
			strict: entry.layoutPolicy.strict,
			allowedLayouts: entry.layoutPolicy.allowedLayouts,
			defaultLayout: entry.layoutPolicy.defaultLayout,
		} : null,
		slideLayouts: (pptx.slideLayouts || []).map(_layoutSummary),
		master: _layoutSummary(pptx.masterSlide, 0),
		sections: _sectionSummaries(pptx),
		slides: (pptx.slides || []).map((slide, index) => ({
			index,
			name: slide._name,
			layoutName: slide._slideLayout?._name,
			rawLayoutNumber: slide._rawSlideLayoutNumber || null,
			templateLayoutName: slide._templateLayoutName || null,
			objectCount: Array.isArray(slide._slideObjects) ? slide._slideObjects.length : 0,
			hasBackground: !!(slide.background || slide.bkgd),
		})),
	}
}

function _getSection(pptx, index, toolName = 'deck.sections') {
	const section = (pptx.sections || [])[Number(index)]
	if (!section) throw new Error(`${toolName}: section index ${index} out of range (deck has ${(pptx.sections || []).length} sections).`)
	return section
}

function _removeSlideFromSections(pptx, slide) {
	for (const section of pptx.sections || []) {
		section._slides = (section._slides || []).filter(item => item !== slide)
	}
}

async function handleSections(args) {
	const { pptx } = getDeck(args.deckId)
	const action = args.action || 'list'
	if (action === 'list') return { ok: true, sections: _sectionSummaries(pptx) }
	if (!Array.isArray(pptx._sections)) pptx._sections = []
	if (action === 'add') {
		const title = String(args.title || '').trim()
		if (!title) throw new Error('deck.sections add: title is required.')
		const section = { _type: 'user', _slides: [], title }
		const index = Number.isInteger(Number(args.index)) ? Math.max(0, Math.min(Number(args.index), pptx._sections.length)) : pptx._sections.length
		pptx._sections.splice(index, 0, section)
	} else if (action === 'rename') {
		const section = _getSection(pptx, args.index)
		const title = String(args.title ?? args.newTitle ?? '').trim()
		if (!title) throw new Error('deck.sections rename: title/newTitle is required.')
		section.title = title
	} else if (action === 'delete') {
		const index = Number(args.index)
		const section = _getSection(pptx, index)
		const slides = section._slides || []
		pptx._sections.splice(index, 1)
		const fallback = pptx._sections[Math.min(index, pptx._sections.length - 1)]
		if (fallback) {
			for (const slide of slides) if (!fallback._slides.includes(slide)) fallback._slides.push(slide)
		}
	} else if (action === 'move') {
		const from = Number(args.index)
		const to = Number(args.toIndex)
		const section = _getSection(pptx, from)
		if (!Number.isInteger(to) || to < 0 || to >= pptx._sections.length) throw new Error(`deck.sections move: bad toIndex ${args.toIndex}.`)
		pptx._sections.splice(from, 1)
		pptx._sections.splice(to, 0, section)
	} else if (action === 'assign_slide') {
		const section = _getSection(pptx, args.index)
		const indexes = Array.isArray(args.slideIndexes) ? args.slideIndexes : [args.slideIndex]
		for (const raw of indexes) {
			const slide = pptx.slides[Number(raw)]
			if (!slide) throw new Error(`deck.sections assign_slide: bad slide index ${raw}.`)
			_removeSlideFromSections(pptx, slide)
			section._slides.push(slide)
		}
	} else {
		throw new Error(`deck.sections: unsupported action "${action}".`)
	}
	_normalizeDeckSlideMetadata(pptx)
	return { ok: true, action, sections: _sectionSummaries(pptx) }
}

function _normalizeTableCell(cell, fallbackOptions = {}) {
	if (typeof cell === 'string' || typeof cell === 'number') {
		return { _type: 'tablecell', text: String(cell), options: _deepCloneData(fallbackOptions) || {} }
	}
	if (!cell || typeof cell !== 'object') {
		return { _type: 'tablecell', text: '', options: _deepCloneData(fallbackOptions) || {} }
	}
	return {
		_type: 'tablecell',
		text: cell.text === undefined || cell.text === null ? '' : cell.text,
		options: _deepMerge(_deepCloneData(fallbackOptions) || {}, cell.options || {}),
	}
}

function _tableFallbackOptions(table) {
	const first = table.arrTabRows?.[0]?.[0]?.options
	return first && typeof first === 'object' ? first : {}
}

function _tableColumnCount(table) {
	return Math.max(0, ...(table.arrTabRows || []).map(row => row.length))
}

function _applyTableOperation(table, op) {
	if (!op || typeof op !== 'object') return false
	const rows = table.arrTabRows
	const fallback = _tableFallbackOptions(table)
	const kind = op.op || op.type
	if (kind === 'replaceRows') {
		if (!Array.isArray(op.rows)) throw new Error('update_table replaceRows: rows must be an array.')
		table.arrTabRows = op.rows.map(row => {
			if (!Array.isArray(row)) throw new Error('update_table replaceRows: every row must be an array.')
			return row.map(cell => _normalizeTableCell(cell, fallback))
		})
		delete table.options?._rawGridColXmls
		return true
	}
	if (kind === 'patchOptions') {
		table.options = _deepMerge(table.options || {}, op.patch || op.options || {})
		return true
	}
	if (kind === 'setCell' || kind === 'patchCell') {
		const r = Number(op.row)
		const c = Number(op.col)
		if (!rows[r] || !rows[r][c]) throw new Error(`update_table ${kind}: cell ${r},${c} not found.`)
		const cell = rows[r][c]
		if (op.text !== undefined) cell.text = op.text
		if (op.options) cell.options = _deepMerge(cell.options || {}, op.options)
		if (op.patch) _deepMerge(cell, op.patch)
		_clearRawEditBlockers({ _type: 'text', text: Array.isArray(cell.text) ? cell.text : [], options: cell.options || {} }, { text: op.text, ...(op.options || op.patch || {}) })
		return true
	}
	if (kind === 'addRow') {
		const width = _tableColumnCount(table) || (Array.isArray(op.cells) ? op.cells.length : 1)
		const cells = Array.isArray(op.cells) ? op.cells : Array.from({ length: width }, () => '')
		const row = Array.from({ length: width }, (_, i) => _normalizeTableCell(cells[i] ?? '', fallback))
		const index = Number.isInteger(Number(op.index)) ? Math.max(0, Math.min(Number(op.index), rows.length)) : rows.length
		rows.splice(index, 0, row)
		return true
	}
	if (kind === 'deleteRow') {
		const index = Number(op.index)
		if (!rows[index]) throw new Error(`update_table deleteRow: row ${op.index} not found.`)
		if (rows.length <= 1) throw new Error('update_table deleteRow: cannot delete the only row.')
		rows.splice(index, 1)
		return true
	}
	if (kind === 'addColumn') {
		const index = Number.isInteger(Number(op.index)) ? Math.max(0, Math.min(Number(op.index), _tableColumnCount(table))) : _tableColumnCount(table)
		const cells = Array.isArray(op.cells) ? op.cells : []
		for (let r = 0; r < rows.length; r++) rows[r].splice(index, 0, _normalizeTableCell(cells[r] ?? '', fallback))
		delete table.options?._rawGridColXmls
		return true
	}
	if (kind === 'deleteColumn') {
		const index = Number(op.index)
		if (!Number.isInteger(index) || index < 0 || index >= _tableColumnCount(table)) throw new Error(`update_table deleteColumn: bad column ${op.index}.`)
		if (_tableColumnCount(table) <= 1) throw new Error('update_table deleteColumn: cannot delete the only column.')
		for (const row of rows) row.splice(index, 1)
		delete table.options?._rawGridColXmls
		return true
	}
	throw new Error(`update_table: unsupported operation "${kind}".`)
}

async function handleUpdateTable(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const { obj, index, rawIndex } = _resolveTypedShape(slide, args.target, ['table'], 'update_table')
	if (!Array.isArray(obj.arrTabRows)) throw new Error('update_table: target is not a structurally editable table; raw/passthrough tables must be recreated or edited through lower-level XML-aware tooling.')
	const operations = []
	if (Array.isArray(args.operations)) operations.push(...args.operations)
	if (Array.isArray(args.rows)) operations.push({ op: 'replaceRows', rows: args.rows })
	if (args.optionsPatch) operations.push({ op: 'patchOptions', patch: args.optionsPatch })
	for (const key of ['setCell', 'patchCell', 'addRow', 'deleteRow', 'addColumn', 'deleteColumn']) {
		if (args[key]) operations.push({ op: key, ...args[key] })
	}
	if (!operations.length) throw new Error('update_table: provide rows, optionsPatch, operations, or a cell/row/column operation.')
	let applied = 0
	for (const op of operations) if (_applyTableOperation(obj, op)) applied++
	return {
		ok: true,
		slideIndex: args.slideIndex,
		index,
		rawIndex,
		objectName: obj.options?.objectName,
		operationsApplied: applied,
		rows: obj.arrTabRows.length,
		columns: _tableColumnCount(obj),
	}
}

function _findChartRel(slide, chartObj) {
	const rels = slide._relsChart || []
	return rels.find(rel => rel.rId === chartObj.chartRid)
		|| rels.find(rel => rel.opts === chartObj.options)
		|| rels.find(rel => rel.opts?.objectName && rel.opts.objectName === chartObj.options?.objectName)
		|| null
}

function _normalizeChartDataForUpdate(data) {
	if (!Array.isArray(data)) return data
	return data.map((series, index) => {
		if (!series || typeof series !== 'object') return series
		const next = _deepCloneData(series)
		next._dataIndex = index
		if (Array.isArray(next.labels) && next.labels.length > 0 && !Array.isArray(next.labels[0])) {
			next.labels = [next.labels]
		}
		return next
	})
}

const CHARTEX_NATIVE_TYPES = new Set([
	'treemap',
	'sunburst',
	'histogram',
	'pareto',
	'boxWhisker',
	'boxwhisker',
	'waterfall',
	'funnel',
	'regionMap',
	'regionmap',
])

function _normalizeChartExType(type) {
	const text = typeof type === 'string' ? type : ''
	if (!text) return text
	const key = text.replace(/[\s_-]+/g, '').toLowerCase()
	if (key === 'boxwhisker') return 'boxWhisker'
	if (key === 'regionmap' || key === 'filledmap') return 'regionMap'
	return text
}

function _isChartExChartType(type) {
	if (Array.isArray(type)) return false
	const normalized = _normalizeChartExType(type)
	return CHARTEX_NATIVE_TYPES.has(normalized) || CHARTEX_NATIVE_TYPES.has(String(normalized || '').toLowerCase())
}

function _setChartRelFamilyForType(rel, type) {
	if (!rel) return
	const isChartEx = _isChartExChartType(type)
	const family = isChartEx ? 'chartEx' : 'legacy'
	rel.chartFamily = family
	if (!rel.opts || typeof rel.opts !== 'object') rel.opts = {}
	if (isChartEx) rel.opts._chartEx = true
	else delete rel.opts._chartEx
	const currentName = String(rel.fileName || '')
	const idMatch = currentName.match(/(\d+)\.xml$/) || String(rel.Target || '').match(/(\d+)\.xml$/)
	const id = idMatch ? idMatch[1] : String(rel.globalId || rel.rId || 1)
	const prefix = isChartEx ? 'chartEx' : 'chart'
	if (!currentName.startsWith(prefix)) {
		rel.fileName = `${prefix}${id}.xml`
		rel.Target = `../charts/${prefix}${id}.xml`
	}
}

function _isChartExPassthrough(obj) {
	if (!obj?.passthrough?.xml) return false
	const opts = obj.options || {}
	if (opts._passthroughOriginalType === 'chartEx' || opts._passthroughSourceFormat === 'chartEx') return true
	const xml = String(obj.passthrough.xml || '')
	return xml.includes('drawing/2014/chartex') || xml.includes('relationships/chartEx') || xml.includes('<cx:chart')
}

function _childrenByLocalName(node, localName) {
	const out = []
	if (!node?.childNodes) return out
	for (let i = 0; i < node.childNodes.length; i++) {
		const child = node.childNodes[i]
		if (child?.nodeType === 1 && child.localName === localName) out.push(child)
	}
	return out
}

function _descendantsByLocalName(node, localName) {
	const out = []
	const walk = current => {
		if (!current?.childNodes) return
		for (let i = 0; i < current.childNodes.length; i++) {
			const child = current.childNodes[i]
			if (child?.nodeType === 1) {
				if (child.localName === localName) out.push(child)
				walk(child)
			}
		}
	}
	walk(node)
	return out
}

function _xmlNodeText(node) {
	let text = ''
	if (!node?.childNodes) return text
	for (let i = 0; i < node.childNodes.length; i++) {
		const child = node.childNodes[i]
		if (child.nodeType === 3 || child.nodeType === 4) text += child.nodeValue || ''
	}
	return text
}

function _chartExLevelValues(dim) {
	const levels = _childrenByLocalName(dim, 'lvl')
	return levels.map(level => {
		const values = []
		for (const pt of _childrenByLocalName(level, 'pt')) {
			const idx = Number(pt.getAttribute('idx') || values.length)
			values[idx] = _xmlNodeText(pt)
		}
		return values.map(v => v ?? '')
	})
}

function _inferChartExType(layoutIds, chartXml) {
	const ids = new Set((layoutIds || []).map(id => String(id || '').toLowerCase()))
	if (ids.has('paretoline')) return 'pareto'
	if (ids.has('treemap')) return 'treemap'
	if (ids.has('sunburst')) return 'sunburst'
	if (ids.has('boxwhisker')) return 'boxWhisker'
	if (ids.has('waterfall')) return 'waterfall'
	if (ids.has('funnel')) return 'funnel'
	if (ids.has('regionmap')) return 'regionMap'
	if (String(chartXml || '').includes('<cx:binning')) return 'histogram'
	if (ids.has('clusteredcolumn')) return 'histogram'
	return 'histogram'
}

function _parseChartExStructuredData(chartXml) {
	const doc = new DOMParser().parseFromString(String(chartXml || ''), 'application/xml')
	const seriesEls = _descendantsByLocalName(doc, 'series')
	const dataEls = _descendantsByLocalName(doc, 'data')
	const dataById = new Map()
	const dimensionTypes = new Set()
	for (const dataEl of dataEls) {
		const id = dataEl.getAttribute('id')
		if (id === null || id === undefined) continue
		const strDims = _childrenByLocalName(dataEl, 'strDim')
		const numDims = _childrenByLocalName(dataEl, 'numDim')
		for (const dim of [...strDims, ...numDims]) {
			const dimType = dim.getAttribute('type')
			if (dimType) dimensionTypes.add(dimType)
		}
		const categoryDim = strDims.find(dim => dim.getAttribute('type') === 'cat') || strDims[0]
		const labels = categoryDim ? _chartExLevelValues(categoryDim) : []
		const valueDim = numDims.find(dim => ['val', 'size', 'colorVal'].includes(dim.getAttribute('type') || '')) || numDims[0]
		const numericLevels = valueDim ? _chartExLevelValues(valueDim) : []
		const values = (numericLevels[0] || []).map(value => {
			const n = Number(value)
			return Number.isFinite(n) ? n : 0
		})
		dataById.set(id, { labels, values })
	}
	const layoutIds = []
	const chartData = []
	for (const seriesEl of seriesEls) {
		const layoutId = seriesEl.getAttribute('layoutId')
		if (layoutId && !layoutIds.includes(layoutId)) layoutIds.push(layoutId)
		const dataIdEl = _childrenByLocalName(seriesEl, 'dataId')[0]
		const dataId = dataIdEl?.getAttribute('val')
		if (!dataId || !dataById.has(dataId)) continue
		const model = dataById.get(dataId)
		const labels = model.labels.length <= 1 ? (model.labels[0] || []) : model.labels
		chartData.push({
			name: `Series ${chartData.length + 1}`,
			labels,
			values: model.values,
		})
	}
	if (chartData.length === 0) {
		for (const model of dataById.values()) {
			const labels = model.labels.length <= 1 ? (model.labels[0] || []) : model.labels
			chartData.push({
				name: `Series ${chartData.length + 1}`,
				labels,
				values: model.values,
			})
		}
	}
	const chartType = _inferChartExType(layoutIds, chartXml)
	return {
		chartType,
		layoutIds,
		dimensionTypes: Array.from(dimensionTypes),
		chartData: chartData.length ? chartData : [{ name: 'Series 1', labels: ['Category 1'], values: [1] }],
	}
}

function _rawPartByPath(pptx, partPath) {
	const target = normalizeZipPartPath(partPath)
	return (pptx?._rawPackageParts || []).find(part => normalizeZipPartPath(part.path) === target) || null
}

function _collectRawChartPackageGraph(pptx, rootPartPath) {
	const paths = new Set()
	const visit = partPath => {
		const normalized = normalizeZipPartPath(partPath)
		if (!normalized.startsWith('ppt/charts/') || paths.has(normalized)) return
		const part = _rawPartByPath(pptx, normalized)
		if (!part) return
		paths.add(normalized)
		const relsPath = relsPathForPart(normalized)
		const relsPart = _rawPartByPath(pptx, relsPath)
		if (relsPart) {
			paths.add(relsPath)
			for (const rel of parseRelationshipEntries(_getRawPartText(relsPart))) {
				if (rel.targetMode === 'External' || isExternalTarget(rel.target)) continue
				const child = resolvePackageTarget(normalized, rel.target)
				if (child?.startsWith('ppt/charts/')) visit(child)
			}
		}
	}
	visit(rootPartPath)
	return paths
}

function _removeRawPackageParts(pptx, paths) {
	if (!paths?.size || !Array.isArray(pptx?._rawPackageParts)) return 0
	const before = pptx._rawPackageParts.length
	pptx._rawPackageParts = pptx._rawPackageParts.filter(part => !paths.has(normalizeZipPartPath(part.path)))
	return before - pptx._rawPackageParts.length
}

function _rawChartGraphStillReferenced(pptx, graphPaths) {
	if (!graphPaths?.size) return false
	const slides = Array.isArray(pptx?.slides) ? pptx.slides : []
	for (let i = 0; i < slides.length; i++) {
		const slide = slides[i]
		const slidePart = `ppt/slides/slide${i + 1}.xml`
		for (const rel of slide?._rawRels || []) {
			if (rel.targetMode === 'External' || isExternalTarget(rel.target)) continue
			const targetPart = resolvePackageTarget(slidePart, rel.target)
			if (targetPart && graphPaths.has(targetPart)) return true
		}
	}
	return false
}

function _chartExRawInfoForPassthrough(pptx, slide, slideIndex, obj) {
	const ids = new Set(collectRelationshipIds(obj?.passthrough?.xml || ''))
	const slidePart = `ppt/slides/slide${slideIndex + 1}.xml`
	const rawRels = Array.isArray(slide?._rawRels) ? slide._rawRels : []
	const referencedRels = rawRels.filter(rel => ids.has(rel.id))
	const chartRel = referencedRels.find(rel => String(rel.type || '').toLowerCase().endsWith('/chartex') || String(rel.type || '').includes('/chartEx'))
	const chartPartPath = chartRel && chartRel.targetMode !== 'External' ? resolvePackageTarget(slidePart, chartRel.target) : null
	const chartPart = chartPartPath ? _rawPartByPath(pptx, chartPartPath) : null
	const chartXml = chartPart ? _getRawPartText(chartPart) : ''
	return { ids, referencedRels, chartRel, chartPartPath, chartXml }
}

function _removePassthroughRelsForObject(slide, obj, relIds) {
	if (!relIds?.size || !Array.isArray(slide?._rawRels)) return 0
	const stillReferenced = new Set()
	for (const other of slide._slideObjects || []) {
		if (other === obj || !other?.passthrough?.xml) continue
		for (const id of collectRelationshipIds(other.passthrough.xml)) stillReferenced.add(id)
	}
	const before = slide._rawRels.length
	slide._rawRels = slide._rawRels.filter(rel => !relIds.has(rel.id) || stillReferenced.has(rel.id))
	return before - slide._rawRels.length
}

function _convertChartExPassthroughForUpdate({ pptx, slide, slideIndex, obj, rawIndex, args }) {
	const info = _chartExRawInfoForPassthrough(pptx, slide, slideIndex, obj)
	const parsed = info.chartXml ? _parseChartExStructuredData(info.chartXml) : {
		chartType: 'histogram',
		layoutIds: [],
		dimensionTypes: [],
		chartData: [{ name: 'Series 1', labels: ['Category 1'], values: [1] }],
	}
	const requestedType = args.chartMulti ?? args.chartType ?? args.type ?? parsed.chartType
	const nextType = Array.isArray(requestedType) ? _deepCloneData(requestedType) : _normalizeChartExType(requestedType)
	const data = args.data !== undefined ? _normalizeChartDataForUpdate(args.data) : _normalizeChartDataForUpdate(parsed.chartData)
	const opts = {
		x: obj.options?.x ?? 1,
		y: obj.options?.y ?? 1,
		w: obj.options?.w ?? '50%',
		h: obj.options?.h ?? '50%',
		objectName: obj.options?.objectName,
		spid: obj.options?.spid,
		_chartEx: !Array.isArray(nextType) && _isChartExChartType(nextType),
		...(parsed.layoutIds?.[0] && !Array.isArray(nextType) ? { chartExLayoutId: parsed.layoutIds[0] } : {}),
	}
	if (args.optionsPatch) _deepMerge(opts, args.optionsPatch)
	const rawGraphPaths = info.chartPartPath ? _collectRawChartPackageGraph(pptx, info.chartPartPath) : new Set()
	const rawRelsRemoved = _removePassthroughRelsForObject(slide, obj, info.ids)
	const rawPartsRemoved = _rawChartGraphStillReferenced(pptx, rawGraphPaths)
		? 0
		: _removeRawPackageParts(pptx, rawGraphPaths)
	slide.addChart(nextType, data, opts)
	const replacement = slide._slideObjects.pop()
	if (!replacement) throw new Error('update_chart: failed to create replacement ChartEx object.')
	slide._slideObjects.splice(rawIndex, 1, replacement)
	const rel = _findChartRel(slide, replacement)
	if (rel) _setChartRelFamilyForType(rel, nextType)
	return {
		replacement,
		chartType: nextType,
		seriesCount: Array.isArray(data) ? data.length : 0,
		rawRelsRemoved,
		rawPartsRemoved,
		chartEx: {
			layoutIds: parsed.layoutIds,
			dimensionTypes: parsed.dimensionTypes,
			chartPartPath: info.chartPartPath,
		},
	}
}

async function handleUpdateChart(args) {
	const { pptx } = getDeck(args.deckId)
	const slide = getSlide(args.deckId, args.slideIndex)
	const { obj, index, rawIndex } = _resolveShapeForTool(slide, args.target, 'update_chart')
	if (_shapeKind(obj) !== 'chart') {
		if (!_isChartExPassthrough(obj)) {
			throw new Error(`update_chart: target "${obj.options?.objectName || index}" is ${_shapeKind(obj) || 'unknown'}, expected chart or editable ChartEx passthrough.`)
		}
		const converted = _convertChartExPassthroughForUpdate({ pptx, slide, slideIndex: args.slideIndex, obj, rawIndex, args })
		return {
			ok: true,
			slideIndex: args.slideIndex,
			index,
			rawIndex,
			objectName: converted.replacement.options?.objectName,
			chartType: converted.chartType,
			chartFamily: _isChartExChartType(converted.chartType) ? 'chartEx' : 'legacy',
			seriesCount: converted.seriesCount,
			optionsPatched: !!args.optionsPatch,
			convertedFromPassthrough: 'chartEx',
			rawRelsRemoved: converted.rawRelsRemoved,
			rawPartsRemoved: converted.rawPartsRemoved,
			chartEx: converted.chartEx,
		}
	}
	const rel = _findChartRel(slide, obj)
	if (!rel) throw new Error('update_chart: chart relationship not found; raw/passthrough chart packages are not structurally editable through this tool.')
	if (args.data !== undefined) rel.data = _normalizeChartDataForUpdate(args.data)
	const nextType = args.chartMulti ?? _normalizeChartExType(args.chartType ?? args.type)
	if (nextType !== undefined) rel.type = _deepCloneData(nextType)
	if (!rel.opts || typeof rel.opts !== 'object') rel.opts = obj.options || {}
	if (args.optionsPatch) _deepMerge(rel.opts, args.optionsPatch)
	if (nextType !== undefined) rel.opts._type = _deepCloneData(nextType)
	_setChartRelFamilyForType(rel, rel.type)
	obj.options = rel.opts
	return {
		ok: true,
		slideIndex: args.slideIndex,
		index,
		rawIndex,
		objectName: obj.options?.objectName,
		chartType: rel.type,
		chartFamily: rel.chartFamily || 'legacy',
		seriesCount: Array.isArray(rel.data) ? rel.data.length : 0,
		optionsPatched: !!args.optionsPatch,
	}
}

function _removeSmartArtPackageRefs(slide, smartArt) {
	if (!smartArt || typeof smartArt !== 'object') return { relsRemoved: 0, partsRemoved: 0 }
	const relIds = new Set([smartArt.dataRid, smartArt.layoutRid, smartArt.quickStyleRid, smartArt.colorStyleRid, smartArt.drawingRid].filter(Boolean))
	const partPaths = new Set(Object.values(smartArt.partPaths || {}).filter(Boolean))
	let relsRemoved = 0
	let partsRemoved = 0
	if (Array.isArray(slide._rawRels) && relIds.size) {
		const before = slide._rawRels.length
		slide._rawRels = slide._rawRels.filter(rel => !relIds.has(rel.id))
		relsRemoved = before - slide._rawRels.length
	}
	if (Array.isArray(slide._nativePackageParts) && partPaths.size) {
		const before = slide._nativePackageParts.length
		slide._nativePackageParts = slide._nativePackageParts.filter(part => !partPaths.has(part.path))
		partsRemoved = before - slide._nativePackageParts.length
	}
	return { relsRemoved, partsRemoved }
}

function _replaceSmartArtNode(nodes, path, text) {
	if (!Array.isArray(nodes) || !path.length) return false
	const index = Number(path[0])
	if (!Number.isInteger(index) || index < 0 || index >= nodes.length) return false
	if (path.length === 1) {
		if (typeof nodes[index] === 'string') nodes[index] = String(text)
		else if (nodes[index] && typeof nodes[index] === 'object') nodes[index].text = String(text)
		else nodes[index] = String(text)
		return true
	}
	const child = nodes[index]
	if (!child || typeof child !== 'object') return false
	return _replaceSmartArtNode(child.children || (child.children = []), path.slice(1), text)
}

async function handleUpdateSmartArt(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const { obj, index, rawIndex } = _resolveTypedShape(slide, args.target, ['smartart'], 'update_smartart')
	if (typeof slide.addSmartArt !== 'function') throw new Error('update_smartart: runtime does not expose slide.addSmartArt.')
	const smartArt = obj.smartArt || {}
	const prevOpts = obj.options || {}
	const nodes = _deepCloneData(args.nodes ?? smartArt.nodes ?? prevOpts.nodes ?? [])
	if (args.nodeIndex !== undefined || Array.isArray(args.nodePath)) {
		const path = Array.isArray(args.nodePath) ? args.nodePath : [args.nodeIndex]
		if (!_replaceSmartArtNode(nodes, path, args.text ?? args.label ?? '')) throw new Error(`update_smartart: node path ${path.join('.')} not found.`)
	}
	if (!Array.isArray(nodes) || nodes.length === 0) throw new Error('update_smartart: SmartArt nodes are required for mutation.')
	const opts = {
		mode: 'native',
		native: true,
		layoutId: args.layoutId ?? prevOpts.layoutId ?? smartArt.layoutId,
		layoutName: args.layoutName ?? prevOpts.layoutName ?? smartArt.layoutName,
		layout: args.layout ?? prevOpts.layout,
		quickStyleId: args.quickStyleId ?? prevOpts.quickStyleId ?? smartArt.quickStyleId,
		colorStyleId: args.colorStyleId ?? prevOpts.colorStyleId ?? smartArt.colorStyleId,
		x: prevOpts.x, y: prevOpts.y, w: prevOpts.w, h: prevOpts.h,
		objectName: prevOpts.objectName,
		spid: prevOpts.spid,
		nodes,
	}
	if (args.optionsPatch) _deepMerge(opts, args.optionsPatch)
	const removed = _removeSmartArtPackageRefs(slide, smartArt)
	const objects = slide._slideObjects || []
	objects.splice(rawIndex, 1)
	slide.addSmartArt(opts)
	const replacement = objects.pop()
	objects.splice(rawIndex, 0, replacement)
	return {
		ok: true,
		slideIndex: args.slideIndex,
		index,
		rawIndex,
		objectName: replacement?.options?.objectName,
		nodeCount: replacement?.smartArt?.nodes?.length || nodes.length,
		relsRemoved: removed.relsRemoved,
		partsRemoved: removed.partsRemoved,
	}
}

function _normalizeMediaVolume(value) {
	if (value === undefined || value === null || value === '') return undefined
	const n = Number(value)
	if (!Number.isFinite(n)) throw new Error(`update_media: invalid volume ${value}.`)
	if (n <= 1) return Math.round(Math.max(0, Math.min(1, n)) * 100000)
	if (n <= 100) return Math.round(Math.max(0, Math.min(100, n)) * 1000)
	return Math.round(Math.max(0, Math.min(100000, n)))
}

function _isMediaAnimationRecord(record, spid, obj) {
	if (!record) return false
	const effect = String(record.animation?.effect || '').toLowerCase()
	const type = String(record.animation?.type || '').toLowerCase()
	return (record.target === obj || record.shapeId === spid) && (
		type === 'media' || effect.startsWith('media') || ['play', 'pause', 'togglepause', 'stop'].includes(effect)
	)
}

async function handleUpdateMedia(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const { obj, index, rawIndex } = _resolveTypedShape(slide, args.target, ['media'], 'update_media')
	if (!obj.options) obj.options = {}
	if (args.optionsPatch) _deepMerge(obj.options, args.optionsPatch)
	const playback = args.playback || {}
	if (args.interactivePlayback !== undefined) obj.options.interactivePlayback = !!args.interactivePlayback
	if (playback.interactivePlayback !== undefined) obj.options.interactivePlayback = !!playback.interactivePlayback
	const volume = _normalizeMediaVolume(args.volume ?? playback.volume)
	if (volume !== undefined) obj.options.mediaVolume = volume
	const command = args.command ?? playback.command ?? args.mediaCommand ?? playback.mediaCommand
	let animationAdded = false
	let replacedExistingCommands = false
	const spid = obj.options.spid ?? (rawIndex + 2)
	if (command || args.addCommand || playback.addCommand) {
		if (args.replaceExistingCommands === true || playback.replaceExistingCommands === true) {
			const before = (slide._animations || []).length
			slide._animations = (slide._animations || []).filter(record => !_isMediaAnimationRecord(record, spid, obj))
			replacedExistingCommands = before !== slide._animations.length
		}
		const mediaCommand = String(command || 'playFrom(0.0)')
		const effect = args.effect || playback.effect || (mediaCommand === 'stop' ? 'mediastop' : mediaCommand === 'togglePause' ? 'mediapause' : 'mediaplay')
		slide.addAnimation(obj, normalizeAnimation({
			type: 'media',
			effect,
			mediaCommand,
			trigger: args.trigger ?? playback.trigger ?? 'onClick',
			delay: args.delay ?? playback.delay ?? 0,
			duration: args.duration ?? playback.duration ?? 1,
			spid,
		}))
		animationAdded = true
		if (slide._rawTimingXml && args.preserveExistingTiming !== true && playback.preserveExistingTiming !== true) delete slide._rawTimingXml
	}
	return {
		ok: true,
		slideIndex: args.slideIndex,
		index,
		rawIndex,
		objectName: obj.options?.objectName,
		interactivePlayback: obj.options.interactivePlayback,
		mediaVolume: obj.options.mediaVolume,
		animationAdded,
		replacedExistingCommands,
	}
}

// Extract & apply animations. The evolved library rejects inline `animation`
// on object options — animations must be applied via slide.addAnimation(target, props).
// Accepts either a single AnimationProps or an array of them. Returns the lifted animations.
// Friendly aliases → evolved-library registry effect names (lowercase).
// Lets MCP callers use familiar names (fadeIn/fadeOut/swing/grow) without
// memorising the registry's exact spelling. Anything not in the alias map is
// passed through (lowercased) so registry-valid names always work.
const EFFECT_ALIASES = {
	fadein: 'fade',
	fadeout: 'fade',
	fade: 'fade',
	appear: 'appear',
	wipe: 'wipe',
	fly: 'fly',
	flyin: 'fly',
	flyout: 'fly',
	zoom: 'zoom',
	zoomin: 'zoom',
	zoomout: 'zoom',
	spin: 'spin',
	swivel: 'swivel',
	pulse: 'pulse',
	bounce: 'bounce',
	wheel: 'wheel',
	split: 'split',
	peek: 'peek',
	crawl: 'crawl',
	lightspeed: 'lightspeed',
	riseup: 'riseup',
	grow: 'verticalgrow',
	shrink: 'verticalgrow',
	growshrink: 'growshrink',
	float: 'float',
	floatin: 'floatIn',
	floatout: 'floatOut',
	teeter: 'teeter',
	flash: 'flashOnce',
	flicker: 'flicker',
}

const DIRECTIONAL_EFFECTS = new Set([
	'crawl',
	'fly',
	'peek',
	'strips',
	'stretch',
	'wipe',
])

const DIRECTION_ALIASES = {
	fromleft: 'fromLeft',
	fromright: 'fromRight',
	fromtop: 'fromTop',
	frombottom: 'fromBottom',
	toleft: 'toLeft',
	toright: 'toRight',
	totop: 'toTop',
	tobottom: 'toBottom',
	left: 'left',
	right: 'right',
	up: 'top',
	top: 'top',
	down: 'bottom',
	bottom: 'bottom',
}

function normalizeDirectionAlias(direction, type, effect) {
	if (typeof direction !== 'string') return direction
	if (!DIRECTIONAL_EFFECTS.has(effect)) return direction
	const key = direction.replace(/[\s_-]+/g, '').toLowerCase()
	const alias = DIRECTION_ALIASES[key]
	if (!alias) return direction
	if (/^(from|to)[A-Z]/.test(alias)) return alias
	const edge = alias[0].toUpperCase() + alias.slice(1)
	return String(type).toLowerCase() === 'exit' ? `to${edge}` : `from${edge}`
}

function normalizeAnimation(a) {
	if (!a || typeof a !== 'object') return a
	const out = { ...a }
	if (typeof out.effect === 'string') {
		const k = out.effect.toLowerCase()
		out.effect = EFFECT_ALIASES[k] || k
	}
	out.direction = normalizeDirectionAlias(out.direction, out.type, out.effect)
	return out
}

function liftAnimations(opts) {
	if (!opts || opts.animation === undefined) return { anims: [], cleaned: opts }
	const cleaned = { ...opts }
	const raw = Array.isArray(opts.animation) ? opts.animation : [opts.animation]
	const anims = raw.map(normalizeAnimation)
	delete cleaned.animation
	return { anims, cleaned }
}

const TEXT_3D_OPTION_EXAMPLE = 'Example: text3D:{ bevel:{ type:"circle", width:4, height:4 }, extrusion:8, extrusionColor:"6D28D9", material:"warmMatte", lightRig:"threePt", rotationX:8, rotationY:12 }. Object shorthand is also accepted for extrusion: { depth:8, color:"6D28D9" } and lightRig: { rig:"threePt" }.'

function _isPlainObject(value) {
	return value && typeof value === 'object' && !Array.isArray(value)
}

function _coerceFiniteNumber(value, path, { min = null } = {}) {
	let n = value
	if (typeof n === 'string' && n.trim() !== '') n = Number(n)
	if (typeof n !== 'number' || !Number.isFinite(n)) {
		throw new Error(`${path} must be a finite number. ${TEXT_3D_OPTION_EXAMPLE}`)
	}
	if (min != null && n < min) {
		throw new Error(`${path} must be >= ${min}. ${TEXT_3D_OPTION_EXAMPLE}`)
	}
	return n
}

function _normalize3DColor(value, path) {
	if (typeof value === 'string') return value.replace(/^#/, '')
	if (_isPlainObject(value)) {
		const nested = value.color ?? value.hex ?? value.value
		if (typeof nested === 'string') return nested.replace(/^#/, '')
	}
	throw new Error(`${path} must be a hex color string such as "6D28D9". ${TEXT_3D_OPTION_EXAMPLE}`)
}

function _normalize3DBevel(value, path) {
	if (value == null) return value
	if (!_isPlainObject(value)) throw new Error(`${path} must be an object with type/width/height. ${TEXT_3D_OPTION_EXAMPLE}`)
	const out = { ...value }
	if (out.width == null && out.w != null) out.width = out.w
	if (out.height == null && out.h != null) out.height = out.h
	if (out.width != null) out.width = _coerceFiniteNumber(out.width, `${path}.width`, { min: 0 })
	if (out.height != null) out.height = _coerceFiniteNumber(out.height, `${path}.height`, { min: 0 })
	if (out.type != null && typeof out.type !== 'string') throw new Error(`${path}.type must be a bevel preset string such as "circle". ${TEXT_3D_OPTION_EXAMPLE}`)
	delete out.w
	delete out.h
	return out
}

function normalize3DOptions(value, path) {
	if (value == null) return value
	if (!_isPlainObject(value)) throw new Error(`${path} must be an object. ${TEXT_3D_OPTION_EXAMPLE}`)
	const out = _deepCloneData(value)

	if (out.bevel !== undefined) out.bevel = _normalize3DBevel(out.bevel, `${path}.bevel`)
	if (out.bevelBottom !== undefined) out.bevelBottom = _normalize3DBevel(out.bevelBottom, `${path}.bevelBottom`)

	if (out.extrusion !== undefined) {
		const raw = out.extrusion
		if (_isPlainObject(raw)) {
			const depth = raw.depth ?? raw.height ?? raw.h ?? raw.value
			if (depth == null) throw new Error(`${path}.extrusion object must include a numeric depth. ${TEXT_3D_OPTION_EXAMPLE}`)
			out.extrusion = _coerceFiniteNumber(depth, `${path}.extrusion.depth`, { min: 0 })
			const color = raw.color ?? raw.extrusionColor ?? raw.hex
			if (out.extrusionColor == null && color != null) out.extrusionColor = _normalize3DColor(color, `${path}.extrusion.color`)
		} else {
			out.extrusion = _coerceFiniteNumber(raw, `${path}.extrusion`, { min: 0 })
		}
	}
	if (out.extrusionColor !== undefined) out.extrusionColor = _normalize3DColor(out.extrusionColor, `${path}.extrusionColor`)

	if (out.contourWidth !== undefined) out.contourWidth = _coerceFiniteNumber(out.contourWidth, `${path}.contourWidth`, { min: 0 })
	if (out.contourColor !== undefined) out.contourColor = _normalize3DColor(out.contourColor, `${path}.contourColor`)

	if (out.lightRig !== undefined) {
		if (_isPlainObject(out.lightRig)) out.lightRig = out.lightRig.rig ?? out.lightRig.name ?? out.lightRig.value
		if (typeof out.lightRig !== 'string' || !out.lightRig.trim()) throw new Error(`${path}.lightRig must be a preset string such as "threePt" or an object with { rig:"threePt" }. ${TEXT_3D_OPTION_EXAMPLE}`)
	}
	if (out.material !== undefined && (typeof out.material !== 'string' || !out.material.trim())) {
		throw new Error(`${path}.material must be a preset string such as "warmMatte" or "metal". ${TEXT_3D_OPTION_EXAMPLE}`)
	}

	for (const key of ['rotationX', 'rotationY', 'rotationZ', 'perspective']) {
		if (out[key] !== undefined) out[key] = _coerceFiniteNumber(out[key], `${path}.${key}`)
	}
	return out
}

function normalizeVisualOptions(opts, path = 'options') {
	if (!opts || typeof opts !== 'object' || Array.isArray(opts)) return opts
	const out = _deepCloneData(opts)
	if (out.text3D !== undefined) out.text3D = normalize3DOptions(out.text3D, `${path}.text3D`)
	if (out.effect3D !== undefined) out.effect3D = normalize3DOptions(out.effect3D, `${path}.effect3D`)
	return out
}

function applyAnimations(slide, anims) {
	if (!anims || anims.length === 0) return
	const target = slide._slideObjects[slide._slideObjects.length - 1]
	if (!target) return
	for (const a of anims) slide.addAnimation(target, a)
}

async function handleAddText(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const options = normalizeVisualOptions(args.options, 'slide.add_text options')
	const { anims, cleaned } = liftAnimations(options)
	slide.addText(args.text, cleaned || {})
	applyAnimations(slide, anims)
	return { ok: true, slideIndex: args.slideIndex, animationsApplied: anims.length }
}

async function handleAddEquation(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const opts = args.options ? { ...args.options } : {}
	for (const key of ['source', 'sourceFormat', 'x', 'y', 'w', 'h', 'objectName', 'fontSize', 'fontFace', 'color', 'align', 'lang', 'altText', 'fallback']) {
		if (args[key] !== undefined) opts[key] = args[key]
	}
	const { anims, cleaned } = liftAnimations(opts)
	if (typeof slide.addEquation !== 'function') throw new Error('Native equation authoring requires a runtime with slide.addEquation support.')
	slide.addEquation(cleaned || {})
	applyAnimations(slide, anims)
	return {
		ok: true,
		slideIndex: args.slideIndex,
		sourceFormat: cleaned?.sourceFormat || (typeof cleaned?.source === 'object' ? 'template' : 'plain'),
		hasFallbackImage: Boolean(cleaned?.fallback && typeof cleaned.fallback === 'object'),
		animationsApplied: anims.length,
	}
}

async function handleUpdateEquation(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const { obj, index, rawIndex } = _resolveTypedShape(slide, args.target, ['equation'], 'update_equation')
	const patch = args.patch && typeof args.patch === 'object' ? { ...args.patch } : {}
	for (const key of ['source', 'sourceFormat', 'x', 'y', 'w', 'h', 'objectName', 'fontSize', 'fontFace', 'color', 'align', 'lang', 'altText', 'fallback']) {
		if (args[key] !== undefined) patch[key] = args[key]
	}
	if (!Object.keys(patch).length) throw new Error('update_equation: provide patch or equation fields such as source/sourceFormat.')
	if (!obj.equation) obj.equation = {}
	_deepMerge(obj.equation, patch)
	if (!obj.options) obj.options = {}
	for (const key of ['x', 'y', 'w', 'h', 'objectName', 'rotate']) {
		if (patch[key] !== undefined) obj.options[key] = patch[key]
	}
	return {
		ok: true,
		slideIndex: args.slideIndex,
		index,
		rawIndex,
		objectName: obj.options?.objectName,
		sourceFormat: obj.equation.sourceFormat || (typeof obj.equation.source === 'object' ? 'template' : 'plain'),
		patchedKeys: Object.keys(patch),
	}
}

async function handleEquationCatalog() {
	return {
		sourceFormats: ['plain', 'unicodeMath', 'omml', 'template'],
		nativeOutput: 'PowerPoint Office Math XML inside editable equation text bodies',
		fallbackPolicy: 'Native equations are emitted by default. Preview fallback images are supported only when the caller supplies a rendered image path or data URL; the service does not rasterize equations by default.',
		templateKinds: [
			'text', 'row', 'group',
			'fraction', 'frac',
			'superscript', 'sup', 'subscript', 'sub', 'subsup',
			'radical', 'sqrt',
			'nary', 'summation', 'sum', 'integral', 'operator',
			'bracket', 'delimiter', 'cases', 'eqArr',
			'function', 'func', 'log',
			'accent', 'bar', 'overbar', 'underbar',
			'box', 'boxed', 'limit', 'limlow',
			'matrix',
		],
		commonStructures: {
			fraction: { kind: 'fraction', numerator: 'dy', denominator: 'dx' },
			superscript: { kind: 'superscript', base: 'x', exponent: '2' },
			radical: { kind: 'radical', radicand: 'x+a' },
			summation: { kind: 'summation', lower: 'i=0', upper: 'n', body: 'i' },
			integral: { kind: 'integral', lower: '0', upper: '1', body: 'f(x)' },
			cases: { kind: 'cases', rows: ['x < 0', 'x >= 0'] },
			matrix: { kind: 'matrix', rows: [['1', '0'], ['0', '1']] },
		},
	}
}

const SMARTART_REFERENCE_CATALOG_PATH = path.resolve(__dirname, '..', 'outputs', 'smartart-com-matrix', '20260531_105826', 'smartart_catalog.json')
const SMARTART_BASIC_BLOCK_LAYOUT_ID = 'urn:microsoft.com/office/officeart/2005/8/layout/default'
const SMARTART_BASIC_BLOCK_QUICK_STYLE_ID = 'urn:microsoft.com/office/officeart/2005/8/quickstyle/simple1'
const SMARTART_BASIC_BLOCK_COLOR_STYLE_ID = 'urn:microsoft.com/office/officeart/2005/8/colors/accent1_2'
let smartArtCatalogCache = null

function stripBom(text) {
	return text && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function publicSmartArtItem(item) {
	return {
		index: item.Index ?? item.index ?? null,
		name: item.Name || item.name || '',
		category: item.Category || item.category || '',
		id: item.Id || item.id || '',
		description: item.Description || item.description || '',
	}
}

function smartArtSupportFor(layout) {
	return {
		supportStatus: 'supported-native',
		recommendedMode: 'native',
		nativeAuthoring: true,
		shapeFallback: true,
		roundtripPolicy: 'structured native authoring plus preserve fallback for imported diagrams',
	}
}

function smartArtPresetSupport(item) {
	const preset = publicSmartArtItem(item)
	return {
		...preset,
		supportStatus: 'supported-native',
	}
}

function smartArtLookupKey(value) {
	return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
}

async function resolveSmartArtLayoutOption(opts = {}) {
	const catalog = await loadSmartArtCatalog()
	const requested = opts.layoutId || opts.layoutName || opts.layout
	if (!requested) return catalog.layouts.find(item => item.name === 'Basic Block List') || catalog.layouts[0] || null
	const raw = String(requested)
	const key = smartArtLookupKey(raw)
	const defaultByCategory = {
		list: 'Basic Block List',
		process: 'Basic Process',
		cycle: 'Basic Cycle',
		hierarchy: 'Organization Chart',
		relationship: 'Basic Radial',
		matrix: 'Basic Matrix',
		pyramid: 'Basic Pyramid',
		picture: 'Picture Caption List',
		timeline: 'Alternating Circle Process',
		team: 'Meet The Team',
		meettheteam: 'Meet The Team',
	}
	const defaultName = defaultByCategory[key]
	if (defaultName) {
		const byDefault = catalog.layouts.find(item => smartArtLookupKey(item.name) === smartArtLookupKey(defaultName))
		if (byDefault) return byDefault
	}
	return catalog.layouts.find(item =>
		item.id === raw ||
		smartArtLookupKey(item.id) === key ||
		smartArtLookupKey(item.name) === key ||
		smartArtLookupKey(item.category) === key
	) || null
}

function isPictureSmartArtLayout(layout, opts = {}) {
	const requested = [opts.layoutId, opts.layoutName, opts.layout].filter(Boolean).join(' ')
	const key = smartArtLookupKey(`${layout?.category || ''} ${layout?.name || ''} ${layout?.id || ''} ${requested}`)
	return key.includes('picture')
}

function flattenSmartArtNodes(nodes) {
	const out = []
	const visit = (node) => {
		if (node === undefined || node === null) return
		out.push(node)
		if (node && typeof node === 'object' && Array.isArray(node.children)) node.children.forEach(visit)
	}
	if (Array.isArray(nodes)) nodes.forEach(visit)
	return out
}

function smartArtNodeImageValue(node) {
	if (!node || typeof node !== 'object') return ''
	for (const key of ['image', 'imageData', 'imageUrl', 'imagePath', 'src', 'url', 'path']) {
		const value = node[key]
		if (typeof value === 'string' && value.trim()) return value.trim()
	}
	return ''
}

function mimeFromImageExt(ext) {
	switch (String(ext || '').toLowerCase()) {
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg'
		case 'png':
			return 'image/png'
		case 'gif':
			return 'image/gif'
		case 'webp':
			return 'image/webp'
		case 'svg':
			return 'image/svg+xml'
		case 'bmp':
			return 'image/bmp'
		case 'tif':
		case 'tiff':
			return 'image/tiff'
		default:
			return ''
	}
}

function normalizeImageDataUri(raw) {
	const value = String(raw || '').trim()
	if (!value.toLowerCase().startsWith('data:image/')) return ''
	const comma = value.indexOf(',')
	if (comma < 0) return ''
	const header = value.slice(5, comma)
	const contentType = header.split(';')[0] || ''
	const payload = value.slice(comma + 1)
	if (!contentType.toLowerCase().startsWith('image/')) return ''
	if (header.toLowerCase().split(';').includes('base64')) return `data:${contentType};base64,${payload}`
	return `data:${contentType};base64,${Buffer.from(decodeURIComponent(payload), 'utf8').toString('base64')}`
}

async function smartArtImageToDataUri(value) {
	const resolved = resolveGeneratedAssetRefs(value)
	if (typeof resolved !== 'string' || !resolved.trim()) return ''
	const raw = resolved.trim()
	const inline = normalizeImageDataUri(raw)
	if (inline) return inline
	if (isRemoteUrl(raw)) {
		const { buffer, contentType } = await fetchBufferWithLimit(raw, { maxBytes: 12 * 1024 * 1024, timeoutMs: 30000, requireImage: true })
		const ext = inferImageExtension(contentType, buffer, raw)
		const mime = mimeFromImageExt(ext) || String(contentType || '').split(';')[0] || 'image/png'
		return `data:${mime};base64,${buffer.toString('base64')}`
	}
	const localPath = path.resolve(raw)
	if (fsNode.existsSync(localPath) && fsNode.statSync(localPath).isFile()) {
		const buffer = fsNode.readFileSync(localPath)
		const ext = inferImageExtension('', buffer, localPath)
		const mime = mimeFromImageExt(ext) || 'image/png'
		return `data:${mime};base64,${buffer.toString('base64')}`
	}
	return ''
}

async function materializeSmartArtNodeImages(nodes) {
	if (!Array.isArray(nodes)) return nodes
	const normalizeNode = async (node) => {
		if (!node || typeof node !== 'object') return node
		const copy = { ...node }
		const imageValue = smartArtNodeImageValue(copy)
		if (imageValue) copy.image = await smartArtImageToDataUri(imageValue)
		if (Array.isArray(copy.children)) copy.children = await Promise.all(copy.children.map(normalizeNode))
		return copy
	}
	return Promise.all(nodes.map(normalizeNode))
}

async function enforceSmartArtPictureImages(opts = {}) {
	const resolvedLayout = await resolveSmartArtLayoutOption(opts)
	if (!isPictureSmartArtLayout(resolvedLayout, opts)) return { resolvedLayout, imageNodeCount: 0 }
	const nodes = flattenSmartArtNodes(opts.nodes)
	if (nodes.length === 0) {
		throw new Error('Native picture SmartArt layouts require explicit image-bearing nodes. Provide nodes as objects with image, imageUrl, imagePath, or imageData; blank picture placeholders are rejected.')
	}
	const missing = nodes
		.map((node, index) => ({ node, index }))
		.filter(item => !smartArtNodeImageValue(item.node))
	if (missing.length > 0) {
		const sample = missing.slice(0, 5).map(item => item.index + 1).join(', ')
		throw new Error(`Picture SmartArt layout "${resolvedLayout?.name || opts.layout || opts.layoutName || opts.layoutId || 'picture'}" requires an image for every node. Missing image on node(s): ${sample}. Provide node.image/imageUrl/imagePath/imageData or choose a non-picture SmartArt layout.`)
	}
	opts.nodes = await materializeSmartArtNodeImages(opts.nodes)
	const unresolved = flattenSmartArtNodes(opts.nodes)
		.map((node, index) => ({ node, index }))
		.filter(item => !normalizeImageDataUri(smartArtNodeImageValue(item.node)))
	if (unresolved.length > 0) {
		const sample = unresolved.slice(0, 5).map(item => item.index + 1).join(', ')
		throw new Error(`Picture SmartArt layout "${resolvedLayout?.name || 'picture'}" received image references that could not be materialized to base64 data URLs for node(s): ${sample}.`)
	}
	return { resolvedLayout, imageNodeCount: nodes.length }
}

async function loadSmartArtCatalog() {
	if (smartArtCatalogCache) return smartArtCatalogCache
	let parsed = null
	try {
		parsed = JSON.parse(stripBom(await fs.readFile(SMARTART_REFERENCE_CATALOG_PATH, 'utf8')))
	} catch (_) {
		parsed = {
			counts: { layouts: 1, quickStyles: 1, colors: 1 },
			layouts: [{
				Index: 1,
				Name: 'Basic Block List',
				Category: 'list',
				Id: SMARTART_BASIC_BLOCK_LAYOUT_ID,
				Description: 'Use to show non-sequential or grouped blocks of information.',
			}],
			quickStyles: [{
				Index: 1,
				Name: 'Simple Fill',
				Category: 'simple',
				Id: SMARTART_BASIC_BLOCK_QUICK_STYLE_ID,
				Description: 'Simple Fill',
			}],
			colors: [{
				Index: 1,
				Name: 'Accent 1',
				Category: 'accent',
				Id: SMARTART_BASIC_BLOCK_COLOR_STYLE_ID,
				Description: 'Accent 1',
			}],
		}
	}
	const layouts = (parsed.layouts || []).map(item => {
		const base = publicSmartArtItem(item)
		return { ...base, ...smartArtSupportFor(base) }
	})
	smartArtCatalogCache = {
		counts: {
			layouts: parsed.counts?.layouts || layouts.length,
			quickStyles: parsed.counts?.quickStyles || (parsed.quickStyles || []).length,
			colors: parsed.counts?.colors || (parsed.colors || []).length,
			supportedNativeLayouts: layouts.filter(x => x.supportStatus === 'supported-native').length,
		},
		layouts,
		quickStyles: (parsed.quickStyles || []).map(item => smartArtPresetSupport(item)),
		colors: (parsed.colors || []).map(item => smartArtPresetSupport(item)),
	}
	return smartArtCatalogCache
}

async function handleSmartArtCatalog(args = {}) {
	const catalog = await loadSmartArtCatalog()
	let layouts = catalog.layouts
	if (args.category) {
		const category = String(args.category).toLowerCase()
		layouts = layouts.filter(item => String(item.category || '').toLowerCase() === category)
	}
	if (args.supportStatus) {
		layouts = layouts.filter(item => item.supportStatus === args.supportStatus)
	}
	if (Number.isFinite(Number(args.limit)) && Number(args.limit) >= 0) {
		layouts = layouts.slice(0, Number(args.limit))
	}
	return {
		nativeMode: {
			status: 'full-catalog-authoring',
			supportedLayoutCount: catalog.counts.layouts,
			supportedQuickStyleCount: catalog.counts.quickStyles,
			supportedColorStyleCount: catalog.counts.colors,
			defaultLayout: 'Basic Block List',
			defaultQuickStyle: 'Polished',
			defaultColorStyle: 'Colorful - Accent Colors',
			pictureImagePolicy: 'required-per-node',
			defaultDesignPolicy: 'Use gradient surfaces, transitions, and shape animations by default; ask the AI client/user for image assets and motion preferences when missing.',
			limitations: [
				'Native authoring emits the PowerPoint layout, quick style, color style, data, and drawing package families.',
				'Imported SmartArt roundtrip still preserves raw diagram packages when structured extraction has not been requested.',
				'Picture SmartArt layouts require caller-provided images on every node; blank picture placeholders are rejected. Use node.image, node.imageUrl, node.imagePath, or node.imageData.',
			],
		},
		defaultMode: {
			mode: 'native',
			categories: ['list', 'process', 'cycle', 'hierarchy', 'relationship', 'matrix', 'pyramid', 'picture', 'timeline', 'team'],
		},
		counts: catalog.counts,
		layouts: args.includeLayouts === false ? undefined : layouts,
		quickStyles: catalog.quickStyles,
		colors: catalog.colors,
	}
}

async function handleAddShape(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	let opts = args.options ? { ...args.options } : {}
	if (args.text) opts.text = args.text
	if (args.textOptions) Object.assign(opts, args.textOptions)
	opts = normalizeVisualOptions(opts, 'slide.add_shape options') || {}
	const { anims, cleaned } = liftAnimations(opts)
	slide.addShape(args.shapeName, cleaned)
	applyAnimations(slide, anims)
	return { ok: true, slideIndex: args.slideIndex, animationsApplied: anims.length }
}

async function handleAddSmartArt(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const opts = args.options ? { ...args.options } : {}
	for (const key of ['mode', 'native', 'layout', 'layoutId', 'layoutName', 'quickStyleId', 'quickStyleName', 'colorStyleId', 'colorStyleName', 'rightToLeft', 'nodes', 'x', 'y', 'w', 'h', 'title', 'objectName', 'palette', 'fill', 'line', 'shadow', 'fontFace', 'fontSize', 'color', 'animation']) {
		if (args[key] !== undefined) opts[key] = args[key]
	}
	if (opts.mode === undefined && opts.native === undefined) opts.mode = 'native'
	const picturePolicy = await enforceSmartArtPictureImages(opts)
	const before = Array.isArray(slide._slideObjects) ? slide._slideObjects.length : 0
	if (typeof slide.addSmartArt !== 'function') throw new Error('SmartArt diagram authoring requires a runtime with slide.addSmartArt support.')
	slide.addSmartArt(opts)
	const after = Array.isArray(slide._slideObjects) ? slide._slideObjects.length : before
	return {
		ok: true,
		slideIndex: args.slideIndex,
		mode: opts.mode || (opts.native ? 'native' : 'shape'),
		layout: opts.layout || 'process',
		nodes: Array.isArray(opts.nodes) ? opts.nodes.length : 3,
		pictureImageNodes: picturePolicy.imageNodeCount,
		objectsAdded: after - before,
	}
}

async function handleAddImage(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const resolvedOptions = resolveGeneratedAssetRefs(args.options)
	const materializedOptions = await materializeRemoteImageOptions(resolvedOptions)
	const { anims, cleaned } = liftAnimations(materializedOptions)
	slide.addImage(cleaned || {})
	applyAnimations(slide, anims)
	return { ok: true, slideIndex: args.slideIndex, animationsApplied: anims.length }
}

async function handleChartRecommend(args = {}) {
	const {
		CHART_PRESET_CATALOG,
		chartPresetById,
		recommendChartPresets,
	} = await loadChartPresetModule()
	const budget = chartFeatureBudget(args)
	const limit = Math.max(1, Math.min(Number(args.limit || 8), CHART_PRESET_CATALOG.length))
	const format = args.format === 'full' ? 'full' : 'summary'
	const query = String(args.query || args.chartIntent || args.dataShape || args.category || '')
	if (args.chartPresetId && !chartPresetById(String(args.chartPresetId))) {
		throw new Error(`Chart preset not found: ${args.chartPresetId}`)
	}
	const presets = recommendChartPresets(query, budget, args)
		.slice(0, limit)
		.map(item => ({
			score: item.score,
			selectionReason: item.selectionReason,
			preset: publicChartPreset(item.preset, format === 'full'),
		}))
	return {
		brand: BETTERPPTX_BRAND,
		query,
		chartIntent: args.chartIntent || null,
		dataShape: args.dataShape || null,
		featureBudget: budget,
		nativeChartTypes: ['area', 'bar', 'bar3D', 'bubble', 'bubble3D', 'doughnut', 'line', 'pie', 'radar', 'scatter', 'treemap', 'sunburst', 'histogram', 'pareto', 'boxWhisker', 'waterfall', 'funnel', 'regionMap'],
		pickerCategoryPolicy: {
			native: ['Column via bar + barDir=col', 'Bar', 'Line', 'Pie', 'Doughnut', 'Area', 'X Y (Scatter)', 'Bubble', 'Radar', 'Combo from supported native base types', 'Treemap', 'Sunburst', 'Histogram', 'Pareto', 'Box & Whisker', 'Waterfall', 'Funnel', 'Filled Map / regionMap'],
			shapeBuiltOrPreserveOnly: ['Stock', 'Surface'],
			rule: 'Use preset.chartType as slide.add_chart chartType when authoringMode is native. ChartEx picker families are native-editable for new authoring; exact imported ChartEx stays passthrough until the first update_chart edit promotes it to native editable ChartEx.',
		},
		presets,
	}
}

async function handleTableRecommend(args = {}) {
	const {
		POWERPOINT_TABLE_STYLE_OPTIONS,
		TABLE_PRESET_CATALOG,
		tablePresetById,
		recommendTablePresets,
	} = await loadTablePresetModule()
	const budget = chartFeatureBudget(args)
	const limit = Math.max(1, Math.min(Number(args.limit || 8), TABLE_PRESET_CATALOG.length))
	const format = args.format === 'full' ? 'full' : 'summary'
	const query = String(args.query || args.tableIntent || args.dataShape || args.category || '')
	if (args.tablePresetId && !tablePresetById(String(args.tablePresetId))) {
		throw new Error(`Table preset not found: ${args.tablePresetId}`)
	}
	const presets = recommendTablePresets(query, budget, args)
		.slice(0, limit)
		.map(item => ({
			score: item.score,
			selectionReason: item.selectionReason,
			preset: publicTablePreset(item.preset, format === 'full'),
		}))
	return {
		brand: BETTERPPTX_BRAND,
		query,
		tableIntent: args.tableIntent || null,
		dataShape: args.dataShape || null,
		featureBudget: budget,
		ribbonOptions: POWERPOINT_TABLE_STYLE_OPTIONS,
		authoringPolicy: {
			native: 'Use tableStyleId plus Header Row, Total Row, First/Last Column, and Banded Rows/Columns when a native PowerPoint table style is known.',
			visualAdapted: 'For the most beautiful generated tables, apply preset.optionDefaults to slide.add_table options and apply preset.cellStyleRecipe to header, body, banded, total, first-column, last-column, and semantic cells.',
			layoutPreflight: 'Before drawing, apply preset.layoutGuardrails: reserve slide safe area, compute table width from colW, reject or revise side panels that push the visual group past the safe right edge, and keep every table/label inside the safe area including shadow padding.',
			overlays: 'Overlay chips, labels, or callouts must be cell-anchored from table x/y/colW/rowH. If the overlay cannot be tied to a specific cell or merged span, put the text inside the table cell instead.',
			preserveOnly: 'Exact unfamiliar PowerPoint table style IDs and custom tableStyles.xml definitions should be preserved from imported/reference decks rather than guessed.',
		},
		presets,
	}
}

function normalizeMcpChartData(chartType, data) {
	const type = typeof chartType === 'string' ? chartType : ''
	if (!Array.isArray(data)) return data
	if (!['scatter', 'bubble', 'bubble3D'].includes(type)) return data
	const hasShorthand = data.some(item => item && (Array.isArray(item.xValues) || Array.isArray(item.yValues)))
	if (!hasShorthand) return data
	const first = data.find(item => item && Array.isArray(item.xValues)) || data[0] || {}
	const xValues = Array.isArray(first.xValues) ? first.xValues : Array.from({ length: Math.max(...data.map(item => Array.isArray(item?.yValues) ? item.yValues.length : 0), 0) }, (_v, index) => index + 1)
	const series = data.map((item, index) => ({
		name: item?.name || `Series ${index + 1}`,
		values: Array.isArray(item?.yValues) ? item.yValues : (Array.isArray(item?.values) ? item.values : []),
		...(Array.isArray(item?.sizes) ? { sizes: item.sizes } : {}),
	})).filter(item => item.values.length > 0)
	return [{ name: 'X-Axis', values: xValues }, ...series]
}

function normalizeMcpChartMulti(chartMulti) {
	if (!Array.isArray(chartMulti)) return chartMulti
	return chartMulti.map(item => {
		if (!item || typeof item !== 'object') return item
		return { ...item, data: normalizeMcpChartData(item.type, item.data) }
	})
}

async function handleAddChart(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const { anims, cleaned } = liftAnimations(args.options)
	if (args.chartMulti) {
		slide.addChart(normalizeMcpChartMulti(args.chartMulti), cleaned || {})
	} else {
		slide.addChart(args.chartType, normalizeMcpChartData(args.chartType, args.data), cleaned || {})
	}
	applyAnimations(slide, anims)
	return { ok: true, slideIndex: args.slideIndex, animationsApplied: anims.length }
}

async function handleAddTable(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const { anims, cleaned } = liftAnimations(args.options)
	slide.addTable(args.rows, cleaned || {})
	applyAnimations(slide, anims)
	return { ok: true, slideIndex: args.slideIndex, animationsApplied: anims.length }
}

async function handleAddMedia(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const resolvedOptions = resolveGeneratedAssetRefs(args.options)
	const { anims, cleaned } = liftAnimations(resolvedOptions)
	slide.addMedia(cleaned || {})
	applyAnimations(slide, anims)
	return { ok: true, slideIndex: args.slideIndex, animationsApplied: anims.length }
}

async function handleAddModel3D(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const options = args.options ? { ...args.options } : {}
	if (options.modelAsset && !options.glbFile) options.glbFile = options.modelAsset
	if (options.posterAsset && !options.rasterFile) options.rasterFile = options.posterAsset
	delete options.modelAsset
	delete options.posterAsset
	const resolvedOptions = resolveGeneratedAssetRefs(options)
	const { anims, cleaned } = liftAnimations(resolvedOptions)
	slide.addModel3D(cleaned || {})
	applyAnimations(slide, anims)
	return { ok: true, slideIndex: args.slideIndex, animationsApplied: anims.length }
}

async function handleAddFreeform(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	const opts = {
		x: args.x, y: args.y, w: args.w, h: args.h,
		points: args.points,
	}
	if (args.fill) opts.fill = args.fill
	if (args.line) opts.line = args.line
	if (args.shadow) opts.shadow = args.shadow
	if (args.glow) opts.glow = args.glow
	if (args.reflection) opts.reflection = args.reflection
	if (args.softEdges) opts.softEdges = args.softEdges
	if (args.rotate !== undefined) opts.rotate = args.rotate
	if (args.objectName) opts.objectName = args.objectName
	if (args.animation) opts.animation = args.animation
	const { anims, cleaned } = liftAnimations(opts)
	slide.addShape('custGeom', cleaned)
	applyAnimations(slide, anims)
	return { ok: true, slideIndex: args.slideIndex, animationsApplied: anims.length, points: args.points.length }
}

async function handleAddNotes(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	slide.addNotes(args.notes)
	return { ok: true, slideIndex: args.slideIndex }
}

function findSlideObjectByName(slide, objectName) {
	const objects = _editableSlideObjects(slide)
	for (const { obj } of objects) {
		if (obj?.options?.objectName === objectName) return obj
	}
	return null
}

function applyNarrationCues(slide, cues = []) {
	let applied = 0
	for (const cue of cues || []) {
		if (!cue || cue.target == null) continue
		const target = typeof cue.target === 'string'
			? findSlideObjectByName(slide, cue.target)
			: _editableSlideObjects(slide)[Number(cue.target)]?.obj
		if (!target) continue
		const delay = Math.max(0, Math.round(Number(cue.atMs ?? cue.delay ?? 0) || 0))
		slide.addAnimation(target, normalizeAnimation({
			type: cue.type || cue.animation?.type || 'entrance',
			effect: cue.effect || cue.animation?.effect || 'fade',
			trigger: cue.trigger || cue.animation?.trigger || 'afterPrevious',
			delay,
			duration: cue.duration ?? cue.animation?.duration,
			...(cue.animation || {}),
		}))
		applied++
	}
	return applied
}

function captionFallbackText(text, maxChars = 150) {
	const normalized = String(text || '').replace(/\s+/g, ' ').trim()
	if (!normalized) return ''
	const firstSentence = (normalized.match(/^(.{24,}?[.!?])\s/) || [])[1] || normalized
	return firstSentence.length > maxChars ? `${firstSentence.slice(0, maxChars - 3).trim()}...` : firstSentence
}

function applyNarrationCaptions(slide, captions, cues = [], fallbackText = '') {
	const cfg = captions && typeof captions === 'object' ? captions : {}
	if (!captions || cfg.enabled === false) return 0
	let source = Array.isArray(cfg.items) ? cfg.items : cues.filter(c => c.text).map(c => ({ text: c.text, atMs: c.atMs, endMs: c.endMs }))
	if (!source.length) {
		const text = captionFallbackText(cfg.text || fallbackText)
		if (text) source = [{ text, atMs: cfg.atMs ?? 0, endMs: cfg.endMs }]
	}
	let count = 0
	for (const item of source) {
		const text = String(item?.text || '').trim()
		if (!text) continue
		const atMs = Math.max(0, Math.round(Number(item.atMs ?? 0) || 0))
		const x = item.x ?? cfg.x ?? 0.9
		const w = item.w ?? cfg.w ?? 11.5
		const h = item.h ?? cfg.h ?? 0.45
		const baseY = cfg.y ?? 6.25
		const stackOffset = Number(cfg.stackOffset ?? Math.min(h + 0.06, 0.42))
		const stackedY = baseY - Math.max(0, source.length - 1 - count) * stackOffset
		const y = item.y ?? (cfg.stackStatic === false ? baseY : Math.max(0.1, stackedY))
		slide.addText(text, {
			x, y, w, h,
			objectName: item.objectName || `narration-caption-${count + 1}`,
			fontSize: cfg.fontSize ?? 16,
			fontFace: cfg.fontFace || 'Aptos',
			color: cfg.color || 'FFFFFF',
			align: cfg.align || 'center',
			valign: 'mid',
			margin: 0.06,
			breakLine: false,
			fit: 'shrink',
			fill: cfg.fill || { color: '111827', transparency: 10 },
			line: cfg.line || { color: '111827', transparency: 100 },
			shadow: cfg.shadow || { type: 'outer', color: '000000', opacity: 0.22, blur: 2, angle: 45, distance: 1 },
		})
		const target = slide._slideObjects[slide._slideObjects.length - 1]
		slide.addAnimation(target, normalizeAnimation({ type: 'entrance', effect: cfg.entrance || 'fade', trigger: 'afterPrevious', delay: atMs, duration: cfg.duration ?? 250 }))
		if (item.endMs !== undefined) {
			slide.addAnimation(target, normalizeAnimation({ type: 'exit', effect: cfg.exit || 'fade', trigger: 'afterPrevious', delay: Math.max(atMs, Math.round(Number(item.endMs) || atMs)), duration: cfg.exitDuration ?? 200 }))
		}
		count++
	}
	return count
}

async function handleNarrationVoices(args) {
	return getVoices(isPublicBlackBoxMode()
		? { includeCandidates: false, allowUnreviewedVoices: false }
		: {
			includeCandidates: !!args.includeCandidates,
			allowUnreviewedVoices: !!args.allowUnreviewedVoices,
		})
}

function publicNarrationSynthesisResult(result) {
	return {
		ok: result.ok,
		audio: {
			ref: `audio://tts/${result.textHash || crypto.randomBytes(8).toString('hex')}`,
			durationMs: result.durationMs,
			extn: 'wav',
		},
		durationMs: result.durationMs,
		provider: result.provider,
		voice: publicNarrationVoice(result.voice),
		warnings: publicNarrationWarnings(result.warnings),
		textHash: result.textHash,
	}
}

async function handleNarrationSynthesize(args) {
	const result = await synthesizeNarration(args)
	return isPublicBlackBoxMode() ? publicNarrationSynthesisResult(result) : result
}

async function addNarrationToSlide(args) {
	const entry = getDeck(args.deckId)
	const { pptx } = entry
	const slide = getSlide(args.deckId, args.slideIndex)
	const script = args.script != null ? String(args.script) : ''
	if (!script && !args.audio) throw new Error('slide.add_narration requires script or audio.')
	const resolved = await resolveNarrationAudio({
		script,
		audio: resolveGeneratedAssetRefs(args.audio),
		voice: args.voice,
		lang: args.lang,
		provider: args.provider,
		speaker: args.speaker,
		lengthScale: args.lengthScale,
		noiseScale: args.noiseScale,
		noiseWScale: args.noiseWScale,
		allowUnreviewedVoices: args.allowUnreviewedVoices,
	})
	if (script) slide.addNotes(script)

	const objectName = args.objectName || makeNarrationObjectName(args.slideIndex)
	slide.addMedia({
		type: 'audio',
		path: resolved.audio.filePath,
		extn: resolved.audio.extn || 'wav',
		cover: args.cover || TRANSPARENT_PIXEL_PNG,
		transparency: args.transparency ?? 100,
		x: args.x ?? 12.55,
		y: args.y ?? 7.0,
		w: args.w ?? 0.22,
		h: args.h ?? 0.18,
		objectName,
		interactivePlayback: false,
	})
	const mediaObj = slide._slideObjects[slide._slideObjects.length - 1]
	slide.addAnimation(mediaObj, normalizeAnimation({
		type: 'media',
		effect: 'mediaplay',
		mediaCommand: 'playFrom(0.0)',
		trigger: 'afterPrevious',
		delay: Math.max(0, Math.round(Number(args.startDelayMs ?? 0) || 0)),
		duration: 1,
	}))

	const cuesApplied = applyNarrationCues(slide, args.cues || [])
	const captionsApplied = applyNarrationCaptions(slide, args.captions, args.cues || [], script)
	const paddingMs = args.paddingMs === undefined ? 700 : Math.round(Number(args.paddingMs) || 0)
	const advanceAfterTime = clampAdvanceMs(resolved.audio.durationMs + Math.max(0, paddingMs))
	assertLikelyMilliseconds(advanceAfterTime, 'narration advanceAfterTime')
	pptx.showSettings = {
		...(pptx.showSettings || {}),
		useTimings: true,
		showAnimation: true,
		showNarration: true,
	}
	slide.transition = {
		...(slide.transition || { type: 'fade', speed: 'medium' }),
		advanceOnClick: false,
		advanceAfterTime,
	}
	entry.narrationManifest = entry.narrationManifest || { schemaVersion: 1, slides: [] }
	const slideEntry = {
		slideIndex: args.slideIndex,
		audioObjectName: objectName,
		audioPath: resolved.audio.filePath,
		durationMs: resolved.audio.durationMs,
		advanceAfterTime,
		scriptHash: script ? hashText(script.replace(/\s+/g, ' ').trim()) : resolved.textHash,
		voiceId: resolved.voice?.id || null,
		provider: resolved.provider || (args.audio ? 'external-audio' : args.provider || process.env.BETTERPPTX_TTS_PROVIDER || 'piper-http'),
		license: resolved.license || null,
		cues: (args.cues || []).length,
		captions: captionsApplied,
	}
	entry.narrationManifest.slides = entry.narrationManifest.slides.filter(s => s.slideIndex !== args.slideIndex)
	entry.narrationManifest.slides.push(slideEntry)
	logEvent('narration.embed.audio', {
		deckId: args.deckId,
		slideIndex: args.slideIndex,
		objectName,
		durationMs: resolved.audio.durationMs,
		advanceAfterTime,
		voiceId: resolved.voice?.id,
		provider: slideEntry.provider,
		cuesApplied,
		captionsApplied,
		warnings: resolved.warnings,
	})
	return {
		ok: true,
		slideIndex: args.slideIndex,
		audio: isPublicBlackBoxMode()
			? { durationMs: resolved.audio.durationMs, extn: resolved.audio.extn || 'wav' }
			: { wavPath: resolved.audio.filePath, durationMs: resolved.audio.durationMs, extn: resolved.audio.extn },
		advanceAfterTime,
		cues: cuesApplied,
		captions: captionsApplied,
		voice: isPublicBlackBoxMode() ? publicNarrationVoice(resolved.voice) : resolved.voice,
		...(isPublicBlackBoxMode() ? {} : { license: resolved.license }),
		warnings: isPublicBlackBoxMode() ? publicNarrationWarnings(resolved.warnings) : resolved.warnings,
	}
}

async function handleSlideAddNarration(args) {
	return await addNarrationToSlide(args)
}

async function handleDeckAddNarration(args) {
	const { pptx } = getDeck(args.deckId)
	const slides = Array.isArray(args.slides) ? args.slides : []
	if (!slides.length) throw new Error('deck.add_narration requires slides[].')
	const results = []
	for (const item of slides) {
		results.push(await addNarrationToSlide({
			...item,
			deckId: args.deckId,
			voice: item.voice ?? args.tts?.voice ?? args.voice,
			lang: item.lang ?? args.tts?.lang ?? args.lang,
			provider: item.provider ?? args.tts?.provider ?? args.provider,
			speaker: item.speaker ?? args.tts?.speaker,
			lengthScale: item.lengthScale ?? args.tts?.lengthScale,
			noiseScale: item.noiseScale ?? args.tts?.noiseScale,
			noiseWScale: item.noiseWScale ?? args.tts?.noiseWScale,
			paddingMs: item.paddingMs ?? args.autoplay?.paddingMs ?? args.paddingMs,
			captions: item.captions ?? args.captionPolicy,
			allowUnreviewedVoices: item.allowUnreviewedVoices ?? args.allowUnreviewedVoices,
		}))
	}
	pptx.showSettings = {
		useTimings: true,
		showAnimation: true,
		showNarration: true,
		loop: args.autoplay?.loop ?? args.loop ?? false,
		mode: args.autoplay?.mode || args.mode || 'present',
		showMediaControls: args.showMediaControls ?? true,
	}
	const estimatedRuntimeMs = results.reduce((sum, r) => sum + (r.advanceAfterTime || 0), 0)
	logEvent('narration.timing.plan', {
		deckId: args.deckId,
		slides: results.length,
		estimatedRuntimeMs,
		showSettings: pptx.showSettings,
	})
	return { ok: true, slides: results, estimatedRuntimeMs, showSettings: pptx.showSettings }
}

async function handlePassthroughXml(args) {
	const slide = getSlide(args.deckId, args.slideIndex)
	slide.addPassthroughXml(args.xml)
	return { ok: true, slideIndex: args.slideIndex }
}

async function handleSummary(args) {
	const entry = getDeck(args.deckId)
	const { pptx, createdAt } = entry
	const slides = pptx.slides.map((s, i) => ({
		index: i,
		slideNum: s._slideNum,
		objects: (s._slideObjects || []).length,
		hasTransition: !!s.transition,
		hasBackground: !!s.background,
		layoutName: s._slideLayout && s._slideLayout._name,
	}))
	return {
		deckId: args.deckId,
		title: pptx.title,
		layout: pptx.layout,
		createdAt,
		slideCount: pptx.slides.length,
		sectionCount: pptx.sections.length,
		slides,
		morphPreviewCoverage: collectMorphPreviewCoverage(entry),
		designQuality: collectDesignQuality(entry, { profile: 'modern', minScore: 70 }),
	}
}

async function handleValidate(args) {
	const entry = getDeck(args.deckId)
	const { pptx } = entry
	const result = pptx.validate({ mode: args.mode || 'normal', autoFix: !!args.autoFix })
	const morphPreviewCoverage = collectMorphPreviewCoverage(entry)
	result.morphPreviewCoverage = morphPreviewCoverage
	return result
}

function isGradientFill(fill) {
	return !!(fill && typeof fill === 'object' && (
		fill.type === 'gradient' ||
		fill.gradientDirection ||
		fill.gradientPreset ||
		Array.isArray(fill.gradientStops)
	))
}

function collectGradientStops(fill, colors) {
	if (!fill || typeof fill !== 'object') return
	for (const stop of fill.gradientStops || []) {
		if (stop?.color) colors.add(String(stop.color).replace(/^#/, '').toUpperCase())
	}
}

function hasDepth(opts = {}) {
	return !!(opts.shadow || opts.glow || opts.reflection || opts.softEdges || opts.text3D)
}

function hasDisplayText(obj) {
	if (typeof obj?.text === 'string') return obj.text.trim().length > 0
	if (Array.isArray(obj?.text)) return obj.text.some(t => String(t?.text || '').trim().length > 0)
	if (typeof obj?.options?.text === 'string') return obj.options.text.trim().length > 0
	return false
}

function hexToRgb(hex) {
	const value = String(hex || '').replace(/^#/, '')
	if (!/^[0-9A-Fa-f]{6}$/.test(value)) return null
	return {
		r: parseInt(value.slice(0, 2), 16),
		g: parseInt(value.slice(2, 4), 16),
		b: parseInt(value.slice(4, 6), 16),
	}
}

function isAccentColor(hex) {
	const rgb = hexToRgb(hex)
	if (!rgb) return false
	const max = Math.max(rgb.r, rgb.g, rgb.b)
	const min = Math.min(rgb.r, rgb.g, rgb.b)
	const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255
	return max - min >= 35 && luminance > 0.16 && luminance < 0.92
}

function componentScore(actual, target, points) {
	if (target <= 0) return points
	return Math.round(Math.min(1, actual / target) * points)
}

function designIssue(severity, code, message, suggestion) {
	return { severity, code, message, suggestion }
}

const MORPH_PREVIEW_KIND_DETAILS = [
	{ key: 'textBox', label: 'Text boxes', suggestion: 'Add at least one named text box on slide 1 and carry a related named text/accessory object into slide 2 when it should evolve.' },
	{ key: 'shape', label: 'Shapes', suggestion: 'Add a named shape, arrow, connector, badge, or callout that can move, resize, rotate, or restyle through Morph.' },
	{ key: 'image', label: 'Images', suggestion: 'Add a named image/logo/product visual that can move, resize, crop/reframe, or change transparency.' },
	{ key: 'wordArt', label: 'WordArt', suggestion: 'Add a named WordArt headline/accent and keep transform changes restrained across Morph.' },
	{ key: 'text3D', label: 'Text3D', suggestion: 'Add a named Text3D title/accent and morph position, style, or depth carefully.' },
	{ key: 'model3d', label: '3D models / GLB', suggestion: 'Add a named 3D model and change position, size, camera/view, or rotation for a premium hero reveal.' },
	{ key: 'shapeBuiltSmartArt', label: 'Shape-built SmartArt', suggestion: 'Add a shape-built process/list diagram so its inner pieces behave as normal Morph-friendly shapes.' },
]

function morphPreviewKindFromObject(obj = {}) {
	const opts = obj.options || {}
	const kind = obj.type || obj._type || ''
	const objectName = String(opts.objectName || obj.objectName || '')
	const shapeName = String(opts.shapeName || obj.shapeName || '')
	const hasTextPayload = obj.text != null || opts.text != null || Array.isArray(obj.text)
	const hasShapeSignal = kind === 'shape' || kind === 'freeform' || obj.shape || opts.shapeName || opts.shape || shapeName || /shape/i.test(objectName)
	const namedAsShape = /(^|[^a-z0-9])(shape|badge|callout|arrow|connector|line|card|hex|rect|circle)([^a-z0-9]|$)/i.test(objectName)
	if (kind === 'model3d') return 'model3d'
	if (kind === 'image') return 'image'
	if (kind === 'smartart') {
		const mode = String(opts.mode || (opts.native === true ? 'native' : '')).toLowerCase()
		return mode === 'shape' || opts.native === false ? 'shapeBuiltSmartArt' : null
	}
	if (/shape[-_\s]*built[-_\s]*smartart/i.test(objectName)) return 'shapeBuiltSmartArt'
	if (opts.text3D) return 'text3D'
	if (opts.wordArt) return 'wordArt'
	if (namedAsShape || (hasShapeSignal && !hasTextPayload)) return 'shape'
	if (kind === 'text') return 'textBox'
	if (hasShapeSignal) return 'shape'
	return null
}

function collectMorphPreviewCoverage(entry) {
	const slides = entry?.pptx?.slides || []
	const previewSlides = slides.slice(0, FREE_TIER_POLICY.premiumPreviewSlides)
	const found = Object.fromEntries(MORPH_PREVIEW_KIND_DETAILS.map(item => [item.key, 0]))
	const perSlide = previewSlides.map((slide, index) => {
		const kinds = new Set()
		for (const { obj } of _editableSlideObjects(slide)) {
			const key = morphPreviewKindFromObject(obj)
			if (!key || !Object.prototype.hasOwnProperty.call(found, key)) continue
			found[key] += 1
			kinds.add(key)
		}
		return {
			index,
			slideNumber: index + 1,
			kinds: Array.from(kinds),
		}
	})
	const required = MORPH_PREVIEW_KIND_DETAILS.map(item => item.key)
	const present = required.filter(key => found[key] > 0)
	const missing = MORPH_PREVIEW_KIND_DETAILS
		.filter(item => found[item.key] === 0)
		.map(item => ({ key: item.key, label: item.label, suggestion: item.suggestion }))
	const applicable = slides.length >= FREE_TIER_POLICY.premiumPreviewSlides
	return {
		applicable,
		ok: true,
		mode: 'optional-design-advice',
		enforcement: FREE_TIER_POLICY.organizedMorphGuidance.enforcement,
		policy: {
			previewSlides: FREE_TIER_POLICY.premiumPreviewSlides,
			transition: FREE_TIER_POLICY.premiumMorphPattern.transition,
			principle: FREE_TIER_POLICY.organizedMorphGuidance.principle,
		},
		required,
		present,
		missing,
		counts: found,
		perSlide,
		recommendation: missing.length
			? 'Optional only: use additional Morph-friendly object kinds when they naturally serve the story. For uploaded or existing decks, reuse existing related objects and do not add banners, badges, 3D, WordArt, Text3D, SmartArt, charts, or decorative panels merely to satisfy coverage.'
			: 'The two-slide preview includes all recommended Morph-friendly object kinds, but this is design coverage, not a hard requirement.',
	}
}

function model3DRotationOf(opts = {}) {
	const rot = opts.trans?.rot || opts.model3d?.trans?.rot || {}
	return {
		x: Number(rot.x || 0),
		y: Number(rot.y || 0),
		z: Number(rot.z || 0),
		rotate: Number(opts.rotate || 0),
	}
}

function isExpressiveModel3D(opts = {}) {
	const rot = model3DRotationOf(opts)
	const axes = [rot.x, rot.y, rot.z].filter(v => Math.abs(v) >= 10).length
	const magnitude = Math.hypot(rot.x, rot.y, rot.z, rot.rotate * 0.45)
	return axes >= 2 || Math.abs(rot.y) >= 28 || Math.abs(rot.z) >= 16 || magnitude >= 34
}

function collectDesignQuality(entry, args = {}) {
	const { pptx } = entry
	const slides = pptx.slides || []
	const slideCount = Math.max(1, slides.length)
	const profile = args.profile || 'modern'
	const requireNarration = args.requireNarration ?? profile === 'narrated-showcase'
	const requireMotion = args.requireMotion ?? profile !== 'static'
	const requireVisualProof = args.requireVisualProof ?? true
	const requireExpressive3D = args.requireExpressive3D ?? true
	const minScore = Number(args.minScore ?? (profile === 'narrated-showcase' ? 80 : 70))
	const colors = new Set()
	const fontSizes = []
	const metric = {
		gradientSurfaces: 0,
		depthObjects: 0,
		visualProofObjects: 0,
		diagramSlides: 0,
		textObjects: 0,
		titleScaleTextObjects: 0,
		animatedObjects: 0,
		animatedSlides: 0,
		model3DObjects: 0,
		expressiveModel3DObjects: 0,
		model3DMotionSlides: 0,
		narratedSlides: entry.narrationManifest?.slides?.length || 0,
		captionObjects: 0,
		captionSlides: 0,
		objectCount: 0,
	}

	for (const slide of slides) {
		let slideHasAnimation = false
		let slideCaptionObjects = 0
		let visualShapeCount = 0
		let slideHasModel3D = false
		let slideHasModel3DMotion = false
		if (isGradientFill(slide.background)) {
			metric.gradientSurfaces++
			collectGradientStops(slide.background, colors)
		}
		if (slide.background?.color) colors.add(String(slide.background.color).replace(/^#/, '').toUpperCase())
		const objects = _editableSlideObjects(slide).map(x => x.obj)
		metric.objectCount += objects.length
		for (const obj of objects) {
			const opts = obj.options || {}
			const kind = obj.type || obj._type
			_collectColors(opts, colors)
			_collectColors(obj.text, colors)
			if (isGradientFill(opts.fill)) {
				metric.gradientSurfaces++
				collectGradientStops(opts.fill, colors)
			}
			if (hasDepth(opts)) metric.depthObjects++
			if (hasDisplayText(obj)) {
				metric.textObjects++
				const size = Number(opts.fontSize || 0)
				if (size > 0) {
					fontSizes.push(size)
					if (size >= 22) metric.titleScaleTextObjects++
				}
			}
			if (/^narration-caption-/i.test(String(opts.objectName || ''))) {
				metric.captionObjects++
				slideCaptionObjects++
			}
			const isNarrationAudio = /^narration-audio-/i.test(String(opts.objectName || ''))
			if (!isNarrationAudio && ['image', 'chart', 'table', 'model3d', 'passthrough', 'freeform'].includes(kind)) {
				metric.visualProofObjects++
			}
			if (kind === 'model3d') {
				metric.model3DObjects++
				slideHasModel3D = true
				if (isExpressiveModel3D(opts)) metric.expressiveModel3DObjects++
			}
			if (obj.shape && opts.fill && !hasDisplayText(obj)) visualShapeCount++
		}
		if (visualShapeCount >= 3) metric.diagramSlides++
		const animations = slide._animations || []
		const nonMediaAnimations = animations.filter(a => {
			const animation = a.animation || {}
			const effect = String(animation.effect || '').toLowerCase()
			if (slideHasModel3D && ['turntable', 'swing', 'jumpandturn', 'arrive'].includes(effect)) slideHasModel3DMotion = true
			return animation.type !== 'media' && !effect.startsWith('media')
		})
		if (nonMediaAnimations.length) {
			metric.animatedObjects += nonMediaAnimations.length
			slideHasAnimation = true
		}
		if (slideHasAnimation) metric.animatedSlides++
		if (slideHasModel3DMotion) metric.model3DMotionSlides++
		if (slideCaptionObjects) metric.captionSlides++
	}

	const uniqueColors = Array.from(colors).filter(c => /^[0-9A-F]{6}$/i.test(c))
	const accentColors = uniqueColors.filter(isAccentColor)
	const minFont = fontSizes.length ? Math.min(...fontSizes) : 0
	const maxFont = fontSizes.length ? Math.max(...fontSizes) : 0
	const fontRange = maxFont - minFont
	const proofObjects = metric.visualProofObjects + metric.diagramSlides
	const hasModel3D = metric.model3DObjects > 0
	const expressive3DTarget = hasModel3D ? metric.model3DObjects : 0
	const components = [
		{ key: 'gradient', label: 'Gradient surfaces', points: componentScore(metric.gradientSurfaces, slideCount, 15), maxPoints: 15, actual: metric.gradientSurfaces, target: slideCount },
		{ key: 'depth', label: 'Shadows and depth', points: componentScore(metric.depthObjects, slideCount * 2, 15), maxPoints: 15, actual: metric.depthObjects, target: slideCount * 2 },
		{ key: 'palette', label: 'Multi-accent palette', points: Math.min(10, componentScore(accentColors.length, 2, 7) + componentScore(uniqueColors.length, 6, 3)), maxPoints: 10, actual: accentColors.length, target: 2 },
		{ key: 'hierarchy', label: 'Typography hierarchy', points: Math.min(12, componentScore(metric.titleScaleTextObjects, slideCount, 7) + componentScore(fontRange, 12, 5)), maxPoints: 12, actual: Math.round(fontRange * 10) / 10, target: 12 },
		{ key: 'visualProof', label: 'Visual proof objects', points: componentScore(proofObjects, slideCount, 10), maxPoints: 10, actual: proofObjects, target: slideCount },
		{ key: 'motion', label: 'Synchronized motion', points: componentScore(metric.animatedSlides, requireMotion ? slideCount : Math.ceil(slideCount / 2), 10), maxPoints: 10, actual: metric.animatedSlides, target: requireMotion ? slideCount : Math.ceil(slideCount / 2) },
		{ key: 'expressive3D', label: 'Expressive 3D pose', points: hasModel3D ? componentScore(metric.expressiveModel3DObjects, expressive3DTarget, 10) : 10, maxPoints: 10, actual: metric.expressiveModel3DObjects, target: expressive3DTarget || null },
		{ key: 'narration', label: 'Narrated slides', points: componentScore(metric.narratedSlides, requireNarration ? slideCount : Math.ceil(slideCount / 2), 10), maxPoints: 10, actual: metric.narratedSlides, target: requireNarration ? slideCount : Math.ceil(slideCount / 2) },
		{ key: 'captions', label: 'Integrated captions', points: componentScore(metric.captionSlides, requireNarration ? slideCount : Math.ceil(slideCount / 2), 8), maxPoints: 8, actual: metric.captionSlides, target: requireNarration ? slideCount : Math.ceil(slideCount / 2) },
	]
	const score = components.reduce((sum, c) => sum + c.points, 0)
	const morphPreviewCoverage = collectMorphPreviewCoverage(entry)
	const issues = []
	if (metric.gradientSurfaces < slideCount) issues.push(designIssue('warning', 'LOW_GRADIENT_COVERAGE', 'Modern decks should use gradient surfaces as a baseline visual system.', 'Add gradient backgrounds, panels, chart fills, or accent bands.'))
	if (metric.depthObjects < slideCount * 2) issues.push(designIssue('warning', 'LOW_DEPTH_COVERAGE', 'Key cards, panels, media, or KPIs need shadows or depth.', 'Add shadows, glow, reflection, or subtle 3D treatment to important objects.'))
	if (accentColors.length < 2) issues.push(designIssue('warning', 'LOW_ACCENT_DIVERSITY', 'Palette has fewer than two accent colors.', 'Use neutral surfaces plus at least two distinct accent colors.'))
	if (metric.titleScaleTextObjects < slideCount || fontRange < 12) issues.push(designIssue('warning', 'WEAK_TEXT_HIERARCHY', 'Typography hierarchy is not strong enough for a modern deck.', 'Use clear title, subtitle, label, and metadata text levels.'))
	if (requireVisualProof && proofObjects < slideCount) issues.push(designIssue('warning', 'LOW_VISUAL_PROOF', 'The deck needs more concrete visual proof.', 'Add charts, data/KPI blocks, images, 3D assets, architecture, or process visuals.'))
	if (requireMotion && metric.animatedSlides < slideCount) issues.push(designIssue('warning', 'LOW_MOTION_COVERAGE', 'Motion is not applied across the full story.', 'Add cue-timed entrance or emphasis animations for the objects discussed by narration.'))
	if (requireExpressive3D && hasModel3D && metric.expressiveModel3DObjects < metric.model3DObjects) issues.push(designIssue('warning', 'LOW_3D_POSE_EXPRESSIVENESS', 'Some 3D models read as flat/front-on in exported slide previews.', 'Use varied pose/view settings, non-zero x/y/z model rotations, 2D rotate for fallback posters, and turntable/swing emphasis.'))
	if (requireExpressive3D && hasModel3D && metric.model3DMotionSlides < Math.min(slideCount, Math.ceil(slideCount * 0.7))) issues.push(designIssue('warning', 'LOW_3D_MOTION_COVERAGE', '3D models need stronger motion coverage across the story.', 'Apply turntable, swing, jump-and-turn, or morph-driven rotation to the models named in the narration.'))
	if (requireNarration && metric.narratedSlides < slideCount) issues.push(designIssue('error', 'MISSING_NARRATION_COVERAGE', 'Narrated-showcase profile requires narration on every slide.', 'Use slide.add_narration or deck.add_narration for all slides.'))
	if (requireNarration && metric.captionSlides < slideCount) issues.push(designIssue('warning', 'LOW_CAPTION_COVERAGE', 'Narrated-showcase profile should include integrated captions.', 'Add lower-third captions that do not cover core visuals.'))
	if (morphPreviewCoverage.applicable && morphPreviewCoverage.missing?.length) {
		issues.push(designIssue('info', 'MORPH_PREVIEW_OBJECT_COVERAGE_OPTIONAL', 'Optional Morph-friendly object kinds are not all present.', morphPreviewCoverage.recommendation))
	}
	if (score < minScore) issues.push(designIssue('error', 'DESIGN_SCORE_BELOW_THRESHOLD', `Design score ${score} is below required threshold ${minScore}.`, 'Apply modern recipes: gradients, shadows, hierarchy, visual proof, cue-timed motion, and narration.'))

	return {
		ok: score >= minScore && !issues.some(i => i.severity === 'error'),
		profile,
		score,
		minScore,
		components,
		metrics: {
			...metric,
			uniqueColors: uniqueColors.length,
			accentColors: accentColors.length,
			minFontSize: minFont || null,
			maxFontSize: maxFont || null,
			fontSizeRange: fontRange || null,
			avgObjectsPerSlide: Math.round((metric.objectCount / slideCount) * 10) / 10,
		},
		morphPreviewCoverage,
		issues,
	}
}

async function handleValidateDesign(args) {
	const entry = getDeck(args.deckId)
	return collectDesignQuality(entry, args)
}

async function validateNarrationPackage(filePath, manifest = null) {
	const buf = await fs.readFile(filePath)
	const zip = await JSZip.loadAsync(buf)
	const files = Object.keys(zip.files)
	const issues = []
	const presProps = await zip.file('ppt/presProps.xml')?.async('string') || ''
	for (const [flag, attr] of [['showNarration', 'showNarration="1"'], ['showAnimation', 'showAnimation="1"'], ['useTimings', 'useTimings="1"']]) {
		if (!presProps.includes(attr)) issues.push(`ppt/presProps.xml missing ${flag}=1`)
	}
	const mediaParts = files.filter(n => /^ppt\/media\/.+\.(wav|mp3|m4a|aac)$/i.test(n))
	if (manifest?.slides?.length && mediaParts.length < manifest.slides.length) {
		issues.push(`Expected at least ${manifest.slides.length} audio media parts, found ${mediaParts.length}`)
	}
	const slideEntries = manifest?.slides?.length
		? manifest.slides
		: files.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).map(n => ({ slideIndex: Number(n.match(/slide(\d+)\.xml$/)[1]) - 1 }))
	const perSlide = []
	for (const entry of slideEntries) {
		const slideNum = Number(entry.slideIndex) + 1
		const slidePath = `ppt/slides/slide${slideNum}.xml`
		const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`
		const notesPath = `ppt/notesSlides/notesSlide${slideNum}.xml`
		const xml = await zip.file(slidePath)?.async('string') || ''
		const rels = await zip.file(relsPath)?.async('string') || ''
		const notes = await zip.file(notesPath)?.async('string') || ''
		const slideIssues = []
		const hasAudioNode = /<p:audio\b/.test(xml) && /<p:cMediaNode\b/.test(xml)
		const hasMediaCall = /presetClass="mediacall"/.test(xml) && /cmd="playFrom\(0\.0\)"/.test(xml)
		const adv = Number((xml.match(/\badvTm="(\d+)"/) || [])[1] || 0)
		const hasAdvClick0 = /\badvClick="0"/.test(xml)
		const hasAudioRel = /relationships\/(?:audio|media)"/.test(rels) || /Type="[^"]+\/relationships\/media"/.test(rels)
		if (!hasAudioNode) slideIssues.push('missing p:audio/p:cMediaNode')
		if (!hasMediaCall) slideIssues.push('missing mediacall playFrom(0.0)')
		if (!hasAudioRel) slideIssues.push('missing audio/media slide relationship')
		if (!hasAdvClick0) slideIssues.push('missing advClick="0"')
		if (!adv) slideIssues.push('missing advTm')
		if (adv && adv < 1000) slideIssues.push(`advTm too small (${adv})`)
		if (entry.durationMs && adv && adv < entry.durationMs) slideIssues.push(`advTm ${adv} is shorter than narration ${entry.durationMs}`)
		if (entry.scriptHash && !notes) slideIssues.push('missing notes slide')
		if (slideIssues.length) issues.push(`slide ${slideNum}: ${slideIssues.join('; ')}`)
		perSlide.push({
			slideIndex: entry.slideIndex,
			hasAudioNode,
			hasMediaCall,
			hasAudioRel,
			hasNotes: Boolean(notes),
			advanceAfterTime: adv || null,
			issues: slideIssues,
		})
	}
	return { ok: issues.length === 0, filePath, mediaParts, perSlide, issues }
}

async function handleValidateNarration(args) {
	const entry = getDeck(args.deckId)
	const { pptx } = entry
	let filePath = args.filePath || entry.lastSavedPath
	let temporary = false
	if (!filePath) {
		const dir = path.resolve(process.env.BETTERPPTX_OUT_DIR || path.join(process.cwd(), 'outputs', 'narration-validation'))
		await fs.mkdir(dir, { recursive: true })
		filePath = path.join(dir, `validate-narration-${args.deckId}-${Date.now().toString(36)}.pptx`)
		ensureBetterPptxMetadata(pptx)
		await pptx.writeFile({ fileName: filePath, compression: args.compression !== false })
		temporary = true
	}
	const result = await validateNarrationPackage(filePath, entry.narrationManifest)
	logEvent('narration.validate.result', {
		deckId: args.deckId,
		filePath,
		temporary,
		ok: result.ok,
		issues: result.issues,
	})
	const publicResult = isPublicBlackBoxMode() ? { ...result, filePath: undefined } : result
	if (publicResult.filePath === undefined) delete publicResult.filePath
	const manifest = entry.narrationManifest || null
	const publicManifest = isPublicBlackBoxMode() ? publicNarrationManifest(manifest) : manifest
	return { ...publicResult, temporary, manifest: publicManifest }
}

// ---- Download publishing (remote transports) --------------------------------
// When the server runs behind a public HTTPS endpoint (e.g. cloudflared), saved
// files live on the SERVER, unreachable by a remote web client (ChatGPT /
// claude.ai). If a public base + served root are configured, save writes the
// deck DIRECTLY into the served root behind an unguessable token (one write, no
// copy) and returns a public `downloadUrl`. The artifact store is DISK, not RAM:
// generation is transient, the file is streamed on GET, and old/over-budget
// files are evicted — so the resident memory footprint never depends on how many
// files are awaiting download. Generic + transport-agnostic.
let _downloadBase = (process.env.BETTERPPTX_PUBLIC_BASE || '').replace(/\/+$/, '')
let _downloadRoot = process.env.BETTERPPTX_DOWNLOAD_ROOT ? path.resolve(process.env.BETTERPPTX_DOWNLOAD_ROOT) : ''
const DOWNLOAD_BUDGET_BYTES = Number(process.env.BETTERPPTX_DOWNLOAD_BUDGET_MB || 2048) * 1048576
let _artifactStore = createArtifactStore({ base: _downloadBase, root: _downloadRoot, budgetBytes: DOWNLOAD_BUDGET_BYTES })
export function setDownloadConfig({ base, root } = {}) {
	if (base !== undefined) _downloadBase = String(base || '').replace(/\/+$/, '')
	if (root !== undefined) _downloadRoot = root ? path.resolve(root) : ''
	_artifactStore.configure({ base: _downloadBase, root: _downloadRoot })
	logEvent('engine.download_config', { ..._artifactStore.describe() })
	return _artifactStore.describe()
}
export function getDownloadConfig() { return _artifactStore.describe() }

const PUBLIC_OUTPUT_SHAPE_MIN_SLIDES = Math.max(4, Number(process.env.BETTERPPTX_PUBLIC_OUTPUT_SHAPE_MIN_SLIDES || 5))
const PUBLIC_OUTPUT_FEATURE_SURFACE_RE = /\b(?:animations?|transitions?|effects?|motion paths?|smart\s*art|smartart|word\s*art|wordart|equations?|chart types?|table styles?|shape types?|layouts?|presets?|features?|options?|variants?|enums?)\b/i
const PUBLIC_OUTPUT_FEATURE_ID_RE = /\b(?:anim(?:ation)?|trans(?:ition)?|smart\s*art|smartart|word\s*art|wordart|effect|motion\s*path|preset|layout|shape|chart|table|feature|option|enum|fixture|specimen|case)\s*(?::|#|\b(?:id|type|name|effect|preset|layout|variant|sample|case|style|option|enum|fixture|specimen)\b)\s*[a-z0-9][a-z0-9_.-]*|\b(?:anim(?:ation)?|trans(?:ition)?|smart\s*art|smartart|word\s*art|wordart|effect|motion\s*path|preset|layout|shape|chart|table|feature|option|enum|fixture|specimen|case)\s*[-_]\s*(?:id|type|name|effect|preset|layout|variant|sample|case|style|option|enum|fixture|specimen|v?\d+|[a-z]?\d{1,4})\b/i
const PUBLIC_OUTPUT_NUMBERED_FEATURE_RE = /\b(?:feature|case|specimen|fixture)\s*#?\s*\d+\b/i
const PUBLIC_OUTPUT_INTERNAL_LABEL_RE = /\b(?:ooxml|drawingml|raw\s+xml|xml\s+part|r:id|rid\d+|spid|cnvpr|txbody|graphicframe|p14|p15|p16|decypher|comparator|parity|frozen\s+reference|capability\s+ledger|option\s+registry|preset\s+id|source\s+path|filesystem|package\s+relationship)\b/i
const PUBLIC_OUTPUT_CATALOG_PHRASE_RE = /\b(?:all|complete|full|exhaustive|systematic|matrix|catalog|gallery|inventory|coverage|reference|sample\s+deck|test\s+deck|fixture\s+deck)\b.{0,80}\b(?:animations?|transitions?|effects?|motion paths?|smart\s*art|word\s*art|equations?|chart types?|table styles?|shape types?|layouts?|presets?|features?|options?)\b|\b(?:animations?|transitions?|effects?|motion paths?|smart\s*art|word\s*art|equations?|chart types?|table styles?|shape types?|layouts?|presets?|features?|options?)\b.{0,80}\b(?:catalog|matrix|gallery|inventory|coverage|reference|all|complete|full|exhaustive|systematic)\b/i
const PUBLIC_OUTPUT_ANIMATION_LABEL_RE = /\b(?:animation|animations|effect|effects|motion\s*path|motion\s*paths)\b/i
const PUBLIC_OUTPUT_TRANSITION_LABEL_RE = /\btransitions?\b/i

function _publicOutputLabel(value) {
	if (value == null) return ''
	return String(value).replace(/\s+/g, ' ').trim()
}

function _publicOutputObjectKind(obj) {
	return String(obj?.type || obj?._type || obj?.shape || '').toLowerCase()
}

function _publicOutputSlideObjects(slide) {
	return (slide?._slideObjects || []).filter(obj => _publicOutputObjectKind(obj) !== 'notes')
}

function _publicOutputObjectLabels(obj) {
	const labels = []
	const add = value => {
		const s = _publicOutputLabel(value)
		if (s) labels.push(s)
	}
	if (typeof obj?.text === 'string') add(obj.text)
	else if (Array.isArray(obj?.text)) {
		for (const run of obj.text) {
			if (typeof run === 'string') add(run)
			else {
				add(run?.text)
				add(run?.options?.objectName)
				add(run?.options?.altText)
				add(run?.options?.title)
			}
		}
	}
	add(obj?.options?.objectName)
	add(obj?.options?.altText)
	add(obj?.options?.title)
	add(obj?.options?.name)
	add(obj?.objectName)
	add(obj?.name)
	return [...new Set(labels)].slice(0, 24)
}

function _publicOutputCoordBucket(value) {
	const n = Number(value)
	return Number.isFinite(n) ? Math.round(n * 4) / 4 : null
}

function _publicOutputGridLike(objects, featureLabelCount) {
	if (objects.length < 12 || featureLabelCount < 6) return false
	const xs = new Set()
	const ys = new Set()
	for (const obj of objects) {
		const x = _publicOutputCoordBucket(obj?.options?.x)
		const y = _publicOutputCoordBucket(obj?.options?.y)
		if (x != null) xs.add(x)
		if (y != null) ys.add(y)
	}
	return xs.size >= 3 && ys.size >= 3
}

function _publicOutputFeatureBucket(label) {
	const s = _publicOutputLabel(label).toLowerCase()
	const m = s.match(/\b(animation|transition|effect|motion\s*path|smart\s*art|smartart|word\s*art|wordart|equation|chart|table|shape|preset|layout|feature|option|variant|enum|fixture|specimen|case)\b/)
	return m ? m[1].replace(/\s+/g, '') : null
}

function _publicOutputTransitionType(transition) {
	if (!transition) return null
	if (typeof transition === 'string') return transition.toLowerCase()
	const value = transition.type || transition.name || transition.transition || transition.prst
	return value ? String(value).toLowerCase() : null
}

function _publicOutputAnimationEffects(slide) {
	const out = []
	for (const item of slide?._animations || []) {
		const animation = item?.animation || item
		const effect = animation?.effect || animation?.preset || animation?.type
		if (effect) out.push(String(effect).toLowerCase())
	}
	return out
}

function evaluatePublicOutputShapeGate(entry) {
	if (!isPublicBlackBoxMode()) return { ok: true }
	const pptx = entry?.pptx
	const slides = Array.isArray(pptx?.slides) ? pptx.slides : []
	const slideCount = slides.length
	if (slideCount === 0) return { ok: true }

	const transitionTypes = new Set()
	const animationEffects = new Set()
	const featureBuckets = new Map()
	const perSlide = slides.map((slide, index) => {
		const objects = _publicOutputSlideObjects(slide)
		const labels = objects.flatMap(_publicOutputObjectLabels)
		const haystack = labels.join(' | ')
		const featureSurfaceHits = labels.filter(label => PUBLIC_OUTPUT_FEATURE_SURFACE_RE.test(label)).length
		const featureIdHits = labels.filter(label => PUBLIC_OUTPUT_FEATURE_ID_RE.test(label) || PUBLIC_OUTPUT_NUMBERED_FEATURE_RE.test(label)).length
		const internalHits = labels.filter(label => PUBLIC_OUTPUT_INTERNAL_LABEL_RE.test(label)).length
		const catalogPhrase = PUBLIC_OUTPUT_CATALOG_PHRASE_RE.test(haystack)
		const animationLabel = labels.some(label => PUBLIC_OUTPUT_ANIMATION_LABEL_RE.test(label))
		const transitionLabel = labels.some(label => PUBLIC_OUTPUT_TRANSITION_LABEL_RE.test(label))
		for (const label of labels) {
			const bucket = _publicOutputFeatureBucket(label)
			if (bucket) featureBuckets.set(bucket, (featureBuckets.get(bucket) || 0) + 1)
		}
		const transitionType = _publicOutputTransitionType(slide.transition)
		if (transitionType) transitionTypes.add(transitionType)
		const effects = _publicOutputAnimationEffects(slide)
		for (const effect of effects) animationEffects.add(effect)
		return {
			index,
			objectCount: objects.length,
			labelCount: labels.length,
			featureSurfaceHits,
			featureIdHits,
			internalHits,
			catalogPhrase,
			animationLabel,
			transitionLabel,
			animationEffectCount: effects.length,
			gridLike: _publicOutputGridLike(objects, featureSurfaceHits),
			oneFeatureLike: objects.length <= 3 && (featureIdHits > 0 || internalHits > 0 || catalogPhrase),
		}
	})

	const oneFeatureSlides = perSlide.filter(s => s.oneFeatureLike).length
	const gridSlides = perSlide.filter(s => s.gridLike).length
	const catalogPhraseSlides = perSlide.filter(s => s.catalogPhrase).length
	const featureLabelSlides = perSlide.filter(s => s.featureSurfaceHits > 0 || s.featureIdHits > 0).length
	const internalLabelSlides = perSlide.filter(s => s.internalHits > 0).length
	const featureSurfaceTotal = perSlide.reduce((sum, s) => sum + s.featureSurfaceHits, 0)
	const animationLabelSlides = perSlide.filter(s => s.animationLabel && (s.featureIdHits > 0 || s.animationEffectCount > 0 || s.catalogPhrase)).length
	const transitionLabelSlides = perSlide.filter(s => s.transitionLabel && (s.featureIdHits > 0 || s.catalogPhrase)).length
	const featureIdTotal = perSlide.reduce((sum, s) => sum + s.featureIdHits, 0)
	const internalHitTotal = perSlide.reduce((sum, s) => sum + s.internalHits, 0)
	const repeatedFeatureBuckets = [...featureBuckets.values()].filter(count => count >= Math.max(3, Math.ceil(slideCount * 0.35))).length

	const reasons = []
	const majoritySlides = Math.max(4, Math.ceil(slideCount * 0.6))
	if (slideCount >= PUBLIC_OUTPUT_SHAPE_MIN_SLIDES && oneFeatureSlides >= majoritySlides) {
		reasons.push('Deck resembles a feature-by-feature reference inventory.')
	}
	if (gridSlides > 0 && (featureIdTotal >= 4 || catalogPhraseSlides > 0 || internalHitTotal > 0)) {
		reasons.push('Deck contains a systematic grid or matrix of presentation effects.')
	}
	if (catalogPhraseSlides > 0 && (featureIdTotal >= 4 || oneFeatureSlides >= 3 || gridSlides > 0)) {
		reasons.push('Deck is shaped like a capability catalog or extraction reference.')
	}
	if (transitionTypes.size >= 5 && transitionLabelSlides >= Math.max(4, Math.ceil(slideCount * 0.5))) {
		reasons.push('Deck systematically enumerates transition behavior.')
	}
	if (animationEffects.size >= 6 && animationLabelSlides >= Math.max(4, Math.ceil(slideCount * 0.5))) {
		reasons.push('Deck systematically enumerates animation behavior.')
	}
	if (internalHitTotal >= 3 && internalLabelSlides >= 3) {
		reasons.push('Deck includes repeated implementation-oriented labels.')
	}
	if (repeatedFeatureBuckets >= 3 && featureLabelSlides >= majoritySlides && featureIdTotal >= 4) {
		reasons.push('Deck repeats internal-style feature labels across many slides.')
	}

	return {
		ok: reasons.length === 0,
		reasons,
		metrics: {
			slideCount,
			oneFeatureSlides,
			gridSlides,
			catalogPhraseSlides,
			featureSurfaceTotal,
			featureLabelSlides,
			internalLabelSlides,
			transitionTypeCount: transitionTypes.size,
			animationEffectCount: animationEffects.size,
			repeatedFeatureBuckets,
		},
	}
}

function assertPublicOutputShapeAllowed(entry) {
	const gate = evaluatePublicOutputShapeGate(entry)
	if (gate.ok) return
	logEvent('deck.save.public_output_shape_blocked', {
		reasons: gate.reasons,
		metrics: gate.metrics,
	})
	const err = new Error('Save blocked because this deck looks like a generated capability inventory rather than a user-facing presentation.')
	err.code = 'PUBLIC_OUTPUT_SHAPE_LIMIT'
	err.details = {
		status: 'blocked',
		artifactStatus: 'not_saved',
		qualityGate: { success: false, failed: ['publicOutputShape'] },
		reasons: gate.reasons,
		recommendation: 'Create a user-facing deck focused on a topic, audience, and story instead of an exhaustive feature catalog or extraction reference.',
	}
	throw err
}

async function handleSave(args) {
	const entry = getDeck(args.deckId)
	return runDeckIdempotent(entry, 'betterpptx.deck.save', args, async () => {
		const { pptx } = entry
		ensureBetterPptxMetadata(pptx)
		assertPublicOutputShapeAllowed(entry)
		const artifact = await _artifactStore.prepareSaveTarget({
			fileName: args.fileName,
			outputDir: args.outputDir,
			deckId: args.deckId,
		})
		await pptx.writeFile({ fileName: artifact.target, compression: args.compression !== false })
		const safety = await validateSavedPackageSafety(artifact.target)
		if (!safety.ok) {
			try { await fs.rm(artifact.target, { force: true }) } catch {}
			const err = new Error('Generated PPTX failed package safety validation; save aborted before delivery.')
			err.code = 'PPTX_PACKAGE_SAFETY_FAILED'
			err.details = {
				status: 'failed',
				artifactStatus: 'unsafe',
				qualityGate: { success: false, failed: ['packageSafety'] },
				validation: { packageSafety: safety },
			}
			throw err
		}
		const stat = await fs.stat(artifact.target)
		const finalizedArtifact = _artifactStore.finalizeSaveTarget
			? await _artifactStore.finalizeSaveTarget(artifact)
			: artifact
		entry.lastSavedPath = finalizedArtifact.localPathAvailable === false ? null : artifact.target
		entry.lastArtifact = {
			objectName: finalizedArtifact.objectName,
			downloadUrl: finalizedArtifact.downloadUrl,
			downloadName: finalizedArtifact.downloadName,
			bytes: stat.size,
			expiresAt: finalizedArtifact.expiresAt,
			savedAt: new Date().toISOString(),
		}
		logEvent('deck.save.file_written', {
			deckId: args.deckId,
			remote: finalizedArtifact.remote,
			filePath: artifact.target,
			bytes: stat.size,
			slideCount: pptx.slides.length,
			downloadUrl: finalizedArtifact.downloadUrl,
			downloadName: finalizedArtifact.downloadName,
			objectName: finalizedArtifact.objectName,
			artifactStore: { provider: finalizedArtifact.provider, shared: finalizedArtifact.shared },
		})
		return {
			ok: true,
			...(isPublicBlackBoxMode() ? {} : { filePath: artifact.target }),
			bytes: stat.size,
			slideCount: pptx.slides.length,
			morphPreviewCoverage: collectMorphPreviewCoverage(entry),
			artifact: {
				state: finalizedArtifact.downloadUrl ? 'download_ready' : 'saved',
				expiresAt: finalizedArtifact.expiresAt,
			},
			...(finalizedArtifact.downloadUrl ? { downloadUrl: finalizedArtifact.downloadUrl, downloadName: finalizedArtifact.downloadName } : {}),
		}
	})
}

function walkElements(node, visit) {
	if (!node || !node.childNodes) return
	for (let i = 0; i < node.childNodes.length; i++) {
		const child = node.childNodes.item(i)
		if (child && child.nodeType === 1) {
			visit(child)
			walkElements(child, visit)
		}
	}
}

function xmlLocalName(node) {
	return String(node?.localName || node?.nodeName || '').split(':').pop()
}

function parsePackageXmlPart(partName, xml, issues) {
	let parseIssues = []
	const doc = new DOMParser({
		errorHandler: {
			warning: () => {},
			error: message => { parseIssues.push(String(message)) },
			fatalError: message => { parseIssues.push(String(message)) },
		},
	}).parseFromString(xml, 'application/xml')
	const parserErrors = doc.getElementsByTagName('parsererror')
	if (parserErrors.length || parseIssues.length) {
		issues.push({
			code: 'XML_PARSE_ERROR',
			part: partName,
			message: 'Generated package contains an XML part that cannot be parsed.',
		})
		return null
	}
	return doc
}

function validatePackageXmlSafety(partName, doc, issues) {
	for (const pathNode of [...Array.from(doc.getElementsByTagName('a:path')), ...Array.from(doc.getElementsByTagName('path'))]) {
		const pathValue = pathNode.getAttribute('path')
		if (pathValue && pathValue !== 'circle' && pathValue !== 'rect' && pathValue !== 'shape') {
			issues.push({
				code: 'INVALID_GRADIENT_PATH',
				part: partName,
				message: `Gradient path "${pathValue}" is not valid DrawingML. Use circle, rect, or shape.`,
			})
		}
	}

	function checkFixedPercentage(node, attr, code) {
		const rawValue = node.getAttribute(attr)
		if (rawValue == null) return
		const value = Number(rawValue)
		if (!Number.isInteger(value) || value < 0 || value > 100000) {
			issues.push({
				code,
				part: partName,
				message: `${node.nodeName} ${attr}="${rawValue}" is outside the PowerPoint-safe fixed percentage range 0..100000.`,
			})
		}
	}
	for (const alphaNode of [...Array.from(doc.getElementsByTagName('a:alpha')), ...Array.from(doc.getElementsByTagName('alpha'))]) {
		checkFixedPercentage(alphaNode, 'val', 'INVALID_ALPHA_VALUE')
	}
	for (const reflectionNode of [...Array.from(doc.getElementsByTagName('a:reflection')), ...Array.from(doc.getElementsByTagName('reflection'))]) {
		checkFixedPercentage(reflectionNode, 'stA', 'INVALID_REFLECTION_ALPHA')
		checkFixedPercentage(reflectionNode, 'endA', 'INVALID_REFLECTION_ALPHA')
		checkFixedPercentage(reflectionNode, 'stPos', 'INVALID_REFLECTION_POSITION')
		checkFixedPercentage(reflectionNode, 'endPos', 'INVALID_REFLECTION_POSITION')
	}

	const fallbacks = [...Array.from(doc.getElementsByTagName('mc:Fallback')), ...Array.from(doc.getElementsByTagName('Fallback'))]
	for (const fallback of fallbacks) {
		walkElements(fallback, node => {
			const name = String(node.nodeName || '')
			if (name.startsWith('p14:') || name.startsWith('p15:') || name.startsWith('p159:')) {
				issues.push({
					code: 'INVALID_ALTERNATECONTENT_FALLBACK',
					part: partName,
					message: `mc:Fallback contains advanced transition element "${name}". Fallback must use legacy p:* content.`,
				})
			}
		})
	}

	const fixedAngleMax = 360 * 60000
	for (const rotNode of [...Array.from(doc.getElementsByTagName('a:rot')), ...Array.from(doc.getElementsByTagName('rot'))]) {
		if (xmlLocalName(rotNode.parentNode) !== 'camera') continue
		for (const attr of ['lat', 'lon', 'rev']) {
			const rawValue = rotNode.getAttribute(attr)
			if (rawValue == null) continue
			const value = Number(rawValue)
			if (!Number.isFinite(value) || value < 0 || value > fixedAngleMax) {
				issues.push({
					code: 'INVALID_SCENE3D_CAMERA_ROTATION',
					part: partName,
					message: `scene3d camera rotation ${attr}="${rawValue}" is not a PowerPoint-safe fixed angle. Use a finite value from 0 to ${fixedAngleMax}; negative degree inputs should be normalized modulo 360 before serialization.`,
				})
			}
		}
	}

	for (const warpNode of [...Array.from(doc.getElementsByTagName('a:prstTxWarp')), ...Array.from(doc.getElementsByTagName('prstTxWarp'))]) {
		const preset = warpNode.getAttribute('prst')
		if (preset && !isValidWordArtTransform(preset)) {
			issues.push({
				code: 'INVALID_WORDART_TRANSFORM',
				part: partName,
				message: `WordArt transform prst="${preset}" is not a valid DrawingML preset. Use textWave4 instead of textDoubleWave2, and textChevronInverted instead of textChevronDown. Call betterpptx.options.catalog with surface:"wordArt" for canonical values.`,
			})
		}
	}
}

async function validateChartExPackageSafety(zip, issues) {
	const names = Object.keys(zip.files)
	const partSet = new Set(names.filter(name => !zip.files[name].dir))
	const contentTypesXml = zip.file('[Content_Types].xml')
		? await zip.file('[Content_Types].xml').async('string')
		: ''
	const chartExParts = names.filter(name => /^ppt\/charts\/chartEx\d+\.xml$/.test(name) && !zip.files[name].dir)
	for (const chartExPart of chartExParts) {
		const base = path.posix.basename(chartExPart)
		const relsPart = `ppt/charts/_rels/${base}.rels`
		if (!partSet.has(relsPart)) {
			issues.push({
				code: 'CHARTEX_RELS_MISSING',
				part: chartExPart,
				message: 'ChartEx chart parts must include a chart relationship part with chartStyle and chartColorStyle relationships.',
			})
			continue
		}
		const relIssues = []
		const relDoc = parsePackageXmlPart(relsPart, await zip.file(relsPart).async('string'), relIssues)
		issues.push(...relIssues)
		if (!relDoc) continue
		const relNodes = relDoc.getElementsByTagName('Relationship')
		let styleTarget = null
		let colorsTarget = null
		for (let i = 0; i < relNodes.length; i++) {
			const node = relNodes.item(i)
			const type = node?.getAttribute('Type') || ''
			const target = node?.getAttribute('Target') || ''
			if (type.endsWith('/chartStyle')) styleTarget = target
			if (type.endsWith('/chartColorStyle')) colorsTarget = target
		}
		for (const [kind, target, contentType] of [
			['chartStyle', styleTarget, 'application/vnd.ms-office.chartstyle+xml'],
			['chartColorStyle', colorsTarget, 'application/vnd.ms-office.chartcolorstyle+xml'],
		]) {
			if (!target) {
				issues.push({
					code: 'CHARTEX_STYLE_REL_MISSING',
					part: relsPart,
					message: `ChartEx relationship part is missing the ${kind} relationship required by PowerPoint.`,
				})
				continue
			}
			const targetPart = path.posix.normalize(path.posix.join('ppt/charts', target))
			if (!partSet.has(targetPart)) {
				issues.push({
					code: 'CHARTEX_STYLE_TARGET_MISSING',
					part: relsPart,
					message: `ChartEx ${kind} relationship target "${target}" does not exist in the package.`,
				})
			}
			if (!contentTypesXml.includes(`PartName="/${targetPart}"`) || !contentTypesXml.includes(`ContentType="${contentType}"`)) {
				issues.push({
					code: 'CHARTEX_STYLE_CONTENT_TYPE_MISSING',
					part: '[Content_Types].xml',
					message: `ChartEx ${kind} target "${targetPart}" is missing its required content type override.`,
				})
			}
		}
	}
}

async function validateSavedPackageSafety(filePath) {
	const issues = []
	let zip
	try {
		zip = await JSZip.loadAsync(await fs.readFile(filePath))
	} catch {
		return {
			ok: false,
			issueCount: 1,
			issues: [{ code: 'ZIP_PARSE_ERROR', message: 'Generated PPTX package could not be opened as a ZIP archive.' }],
		}
	}
	for (const partName of Object.keys(zip.files).sort()) {
		const file = zip.files[partName]
		if (file.dir || !(partName.endsWith('.xml') || partName.endsWith('.rels'))) continue
		const xml = await file.async('string')
		const doc = parsePackageXmlPart(partName, xml, issues)
		if (doc) validatePackageXmlSafety(partName, doc, issues)
	}
	await validateChartExPackageSafety(zip, issues)
	return { ok: issues.length === 0, issueCount: issues.length, issues }
}

async function handleDispose(args) {
	const had = decks.delete(args.deckId)
	return { ok: had }
}

async function handleList() {
	const list = []
	for (const [id, entry] of decks.entries()) {
		list.push({
			deckId: id,
			title: entry.pptx.title,
			slideCount: entry.pptx.slides.length,
			createdAt: entry.createdAt,
		})
	}
	return { decks: list }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const HANDLERS = {
	// ---- discovery
	'betterpptx.help.capabilities': handleCapabilities,
	'betterpptx.options.catalog': handleOptionsCatalog,
	'betterpptx.auth.status': handleAuthStatus,
	'betterpptx.auth.activate_key': handleActivateKey,
	'betterpptx.billing.explain_plan': handleBillingExplainPlan,
	'betterpptx.billing.portal': handleBillingPortal,
	'betterpptx.billing.estimate': handleBillingEstimate,
	'betterpptx.billing.usage_summary': handleBillingUsageSummary,
	'betterpptx.version': handleStatus,
	'betterpptx.status': handleStatus,
	'betterpptx.chart.recommend': handleChartRecommend,
	'betterpptx.table.recommend': handleTableRecommend,
	// ---- deck lifecycle
	'betterpptx.deck.new': handleDeckNew,
	'betterpptx.deck.set_show_settings': handleSetShowSettings,
	'betterpptx.deck.define_master': handleDefineMaster,
	'betterpptx.deck.define_layout': handleDefineLayout,
	'betterpptx.deck.load_template': handleLoadTemplate,
	'betterpptx.deck.audit_layouts': handleAuditLayouts,
	'betterpptx.deck.autoplay': handleAutoplay,
	'betterpptx.deck.open_existing': handleOpenExisting,
	'betterpptx.deck.open_uploaded': handleOpenUploaded,
	'betterpptx.deck.summary': handleSummary,
	'betterpptx.deck.inspect_layouts': handleInspectLayouts,
	'betterpptx.deck.sections': handleSections,
	'betterpptx.deck.validate': handleValidate,
	'betterpptx.deck.validate_design': handleValidateDesign,
	'betterpptx.deck.validate_narration': handleValidateNarration,
	'betterpptx.deck.save': handleSave,
	'betterpptx.deck.dispose': handleDispose,
	'betterpptx.deck.list': handleList,
	'betterpptx.deck.set_transitions_all': handleSetTransitionsAll,
	'betterpptx.deck.add_narration': handleDeckAddNarration,
	'betterpptx.narration.voices': handleNarrationVoices,
	'betterpptx.narration.synthesize': handleNarrationSynthesize,
	// ---- slide primitives
	'betterpptx.slide.add': handleAddSlide,
	'betterpptx.slide.inspect': handleInspectSlide,
	'betterpptx.slide.update': handleUpdateSlide,
	'betterpptx.slide.duplicate': handleDuplicateSlide,
	'betterpptx.slide.delete': handleDeleteSlide,
	'betterpptx.slide.reorder': handleReorderSlide,
	'betterpptx.slide.add_text': handleAddText,
	'betterpptx.slide.add_equation': handleAddEquation,
	'betterpptx.equation.catalog': handleEquationCatalog,
	'betterpptx.smartart.catalog': handleSmartArtCatalog,
	'betterpptx.slide.add_shape': handleAddShape,
	'betterpptx.slide.add_smartart': handleAddSmartArt,
	'betterpptx.slide.add_image': handleAddImage,
	'betterpptx.slide.add_chart': handleAddChart,
	'betterpptx.slide.add_table': handleAddTable,
	'betterpptx.slide.add_media': handleAddMedia,
	'betterpptx.slide.add_model3d': handleAddModel3D,
	'betterpptx.slide.add_freeform': handleAddFreeform,
	'betterpptx.slide.add_notes': handleAddNotes,
	'betterpptx.slide.add_narration': handleSlideAddNarration,
	'betterpptx.slide.passthrough_xml': handlePassthroughXml,
	'betterpptx.slide.list_shapes': handleListShapes,
	'betterpptx.slide.inspect_shapes': handleInspectShapes,
	'betterpptx.deck.editability_report': handleEditabilityReport,
	'betterpptx.slide.update_shape': handleUpdateShape,
	'betterpptx.slide.update_equation': handleUpdateEquation,
	'betterpptx.slide.update_table': handleUpdateTable,
	'betterpptx.slide.update_chart': handleUpdateChart,
	'betterpptx.slide.update_smartart': handleUpdateSmartArt,
	'betterpptx.slide.update_media': handleUpdateMedia,
	'betterpptx.slide.animate_shapes': handleAnimateShapes,
	'betterpptx.slide.set_transition': handleSetSlideTransition,
	'betterpptx.slide.delete_shapes': handleDeleteShapes,
	'betterpptx.slide.reorder_shape': handleReorderShape,
	'betterpptx.deck.transform_shapes': handleTransformShapes,
	// ---- GENERIC primitives (domain-neutral helpers any AI can compose)
	'betterpptx.io.read_file': handleIoReadFile,
	'betterpptx.io.write_file': handleIoWriteFile,
	'betterpptx.io.list_dir': handleIoListDir,
	'betterpptx.io.read_json': handleIoReadJson,
	'betterpptx.fs.find': handleFsFind,
	'betterpptx.assets.catalog': handleAssetCatalog,
	'betterpptx.sketchfab.search': handleSketchfabSearch,
	'betterpptx.sketchfab.inspect': handleSketchfabInspect,
	'betterpptx.sketchfab.import': handleSketchfabImport,
	'betterpptx.http.fetch': handleHttpFetch,
	'betterpptx.image.sample_palette': handleSamplePalette,
	'betterpptx.geometry.polygon_to_custgeom': handlePolygonToCustGeom,
	'betterpptx.geometry.simplify_path': handleSimplifyPath,
	'betterpptx.library.list_xml_groups': handleLibraryListXmlGroups,
	'betterpptx.library.import_xml_group': handleLibraryImportXmlGroup,
}

// ---- Heavy-operation concurrency gate ---------------------------------------
// A few tools allocate a lot transiently: whole-package zip assembly (save),
// decypher model build (open_existing), and deck-wide recolor (transform_shapes).
// Running many at once multiplies peak memory and can OOM the
// box under a burst. Cap concurrent heavy ops, queue the rest up to a bound, and
// beyond that reject with a friendly busy error — a retriable 'busy' beats a crash.
const MAX_CONCURRENCY = Number(process.env.BETTERPPTX_MAX_CONCURRENCY || 4)
const MAX_QUEUE = Number(process.env.BETTERPPTX_MAX_QUEUE || 64)
const HEAVY_TOOLS = new Set([
	'betterpptx.deck.save',
	'betterpptx.deck.open_existing',
	'betterpptx.deck.open_uploaded',
	'betterpptx.deck.transform_shapes',
	'betterpptx.deck.validate',
	'betterpptx.deck.validate_narration',
	'betterpptx.deck.add_narration',
	'betterpptx.slide.add_narration',
	'betterpptx.narration.synthesize',
	'betterpptx.deck.load_template',
	'betterpptx.deck.audit_layouts',
	'betterpptx.sketchfab.import',
])
let _heavyActive = 0
const _heavyQueue = []
function acquireHeavy() {
	if (_heavyActive < MAX_CONCURRENCY) { _heavyActive++; return Promise.resolve() }
	if (_heavyQueue.length >= MAX_QUEUE) return Promise.reject(new Error(`Server at capacity (${_heavyActive} active, ${_heavyQueue.length} queued). Retry shortly.`))
	return new Promise(resolve => _heavyQueue.push(resolve))
}
function releaseHeavy() {
	_heavyActive = Math.max(0, _heavyActive - 1)
	if (_heavyQueue.length && _heavyActive < MAX_CONCURRENCY) { _heavyActive++; (_heavyQueue.shift())() }
}

const READ_ONLY_TOOL_RE = /\.(capabilities|version|status|voices|list|summary|inspect|search|inspect_layouts|editability_report|validate|validate_design|validate_narration|list_shapes|inspect_shapes|read_file|read_json|list_dir|find|catalog|recommend|sample_palette|list_xml_groups|polygon_to_custgeom|simplify_path|fetch|explain_plan|portal)$/
const DECK_CREATION_TOOLS = new Set([
	'betterpptx.deck.new',
	'betterpptx.deck.open_uploaded',
	'betterpptx.deck.open_existing',
	'betterpptx.deck.load_template',
])
const IDEMPOTENT_DECK_MUTATION_TOOLS = new Set([
	'betterpptx.deck.set_show_settings',
	'betterpptx.deck.define_master',
	'betterpptx.deck.define_layout',
	'betterpptx.deck.load_template',
	'betterpptx.deck.audit_layouts',
	'betterpptx.deck.autoplay',
	'betterpptx.deck.sections',
	'betterpptx.deck.set_transitions_all',
	'betterpptx.deck.add_narration',
	'betterpptx.deck.transform_shapes',
	'betterpptx.slide.update',
	'betterpptx.slide.duplicate',
	'betterpptx.slide.delete',
	'betterpptx.slide.reorder',
	'betterpptx.slide.add_text',
	'betterpptx.slide.add_equation',
	'betterpptx.slide.add_shape',
	'betterpptx.slide.add_smartart',
	'betterpptx.slide.add_image',
	'betterpptx.slide.add_chart',
	'betterpptx.slide.add_table',
	'betterpptx.slide.add_media',
	'betterpptx.slide.add_model3d',
	'betterpptx.slide.add_freeform',
	'betterpptx.slide.add_notes',
	'betterpptx.slide.add_narration',
	'betterpptx.slide.passthrough_xml',
	'betterpptx.slide.update_shape',
	'betterpptx.slide.update_equation',
	'betterpptx.slide.update_table',
	'betterpptx.slide.update_chart',
	'betterpptx.slide.update_smartart',
	'betterpptx.slide.update_media',
	'betterpptx.slide.animate_shapes',
	'betterpptx.slide.set_transition',
	'betterpptx.slide.delete_shapes',
	'betterpptx.slide.reorder_shape',
	'betterpptx.library.import_xml_group',
])
const IDEMPOTENT_DECK_REPLAY_TOOLS = new Set([
	...IDEMPOTENT_DECK_MUTATION_TOOLS,
	'betterpptx.deck.save',
	'betterpptx.slide.add',
])
const IDEMPOTENT_SESSION_MUTATION_TOOLS = new Set([
	'betterpptx.auth.activate_key',
	'betterpptx.deck.new',
	'betterpptx.deck.open_existing',
	'betterpptx.deck.open_uploaded',
	'betterpptx.deck.dispose',
	'betterpptx.io.write_file',
	'betterpptx.narration.synthesize',
	'betterpptx.sketchfab.import',
])

function hasIdempotencyKey(args = {}) {
	return !!String(args.idempotencyKey || args.idempotency_key || '').trim()
}

function isMutatingTool(name) {
	return !isReadOnlyTool(name)
}

function supportsDeckIdempotency(name, args = {}) {
	return IDEMPOTENT_DECK_MUTATION_TOOLS.has(name) && !!args?.deckId
}

function supportsDeckIdempotencyReplay(name, args = {}) {
	return IDEMPOTENT_DECK_REPLAY_TOOLS.has(name) && !!args?.deckId
}

function supportsSessionIdempotency(name) {
	return IDEMPOTENT_SESSION_MUTATION_TOOLS.has(name)
}

function maintenanceResult(code, message) {
	return normalizePublicErrorResult({
		ok: false,
		error: {
			code,
			message,
			recoverable: true,
			retry_safe: true,
			artifact_state: 'unchanged_or_unknown',
		},
	})
}

function isReadOnlyTool(name) {
	return READ_ONLY_TOOL_RE.test(String(name || ''))
}

function checkDeckCreationQuota(name, context = {}) {
	if (!DECK_CREATION_TOOLS.has(name)) return null
	const sessionId = String(context.sessionId || 'stdio-default')
	const now = Date.now()
	const windowMs = 60 * 60 * 1000
	let record = sessionDeckWindows.get(sessionId)
	if (!record || now - record.startedAt >= windowMs) {
		record = { startedAt: now, count: 0 }
		sessionDeckWindows.set(sessionId, record)
	}
	if (record.count >= SESSION_DECKS_PER_HOUR) {
		return normalizePublicErrorResult({
			ok: false,
			error: {
				code: 'RATE_LIMITED',
				message: 'This session has reached the current deck creation quota. Retry later or continue editing an existing deck.',
				recoverable: true,
				retry_safe: true,
				artifact_state: 'unchanged_or_unknown',
				details: {
					limit: SESSION_DECKS_PER_HOUR,
					resetAt: new Date(record.startedAt + windowMs).toISOString(),
				},
			},
		})
	}
	record.count += 1
	return null
}

function withToolTimeout(promise, timeoutMs, name) {
	let timer
	const timeout = new Promise((_, reject) => {
		timer = setTimeout(() => {
			const err = new Error(`Tool call timed out after ${timeoutMs}ms.`)
			err.code = 'TOOL_TIMEOUT'
			err.details = { tool: name, timeoutMs }
			reject(err)
		}, timeoutMs)
		timer.unref?.()
	})
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function publicNextActionsForError(code, details = {}) {
	switch (code) {
		case 'SERVICE_DISABLED':
			return [
				{ type: 'retry_later', description: 'The presentation service is temporarily unavailable. Retry after maintenance ends.' },
			]
		case 'READ_ONLY':
			return [
				{ type: 'use_read_only_tools', description: 'Inspect or validate existing work, then retry mutating operations when editing is enabled again.' },
			]
		case 'RATE_LIMITED':
			return [
				{ type: 'retry_later', description: 'Retry after the current rate-limit window resets.' },
			]
		case 'TOOL_TIMEOUT':
			return [
				{ type: 'retry_smaller_step', description: 'Retry with a smaller operation or split the deck work into smaller chunks.' },
			]
		case 'UPLOAD_TOO_LARGE':
			return [
				{ type: 'reduce_upload', description: 'Upload a smaller PowerPoint file or reduce embedded media before retrying.' },
			]
		case 'REQUIRES_UPGRADE':
		case 'QUOTA_EXCEEDED':
		case 'INSUFFICIENT_CREDITS':
			return [
				{ type: 'activate', tool: 'betterpptx.auth.activate_key', description: 'Ask the user for the BetterPPTX license key from checkout, activate it, then retry the requested premium step.' },
				{ type: 'billing', tool: 'betterpptx.billing.portal', description: 'Get the checkout or portal link if the user needs to upgrade.' },
				{ type: 'free_fallback', description: details?.suggestion || 'Continue with the best free-tier fallback without silently dropping the requested feature.' },
			]
		case 'BILLING_SETUP_INCOMPLETE':
			return [
				{ type: 'activate', tool: 'betterpptx.auth.activate_key', description: 'Retry activation with the checkout key so the billing customer can be linked.' },
				{ type: 'billing', tool: 'betterpptx.billing.portal', description: 'Open billing if the checkout completed but the key is still not linked.' },
			]
		case 'BILLING_TEMPORARILY_UNAVAILABLE':
			return [
				{ type: 'retry_later', description: 'Retry the same billable operation after billing balance verification recovers.' },
				{ type: 'use_read_only_tools', description: 'Continue inspecting or editing locally without running checkpoint or heavy billable work.' },
			]
		case 'BILLING_CONFIRMATION_REQUIRED':
			return [
				{ type: 'confirm_billing', description: 'Ask the user to confirm the estimated credit cost before retrying with billingConfirmed enabled.' },
				{ type: 'reduce_scope', description: 'Reduce deck size, media, narration, or batch scope before retrying.' },
			]
		case 'INVALID_PREMIUM_PREVIEW_TRANSITION':
			return [
				{ type: 'correct_transition', tool: 'betterpptx.slide.set_transition', description: 'Set slide 2 to Morph by object when that supports the story.' },
				{ type: 'continue', description: 'Keep slides 1 and 2 as normal story progression; do not duplicate content only for coverage.' },
			]
		case 'BUSY':
			return [
				{ type: 'retry', description: 'Retry the same call after a short delay.' },
			]
		case 'BLACK_BOX':
			return [
				{ type: 'use_public_input', description: 'Use uploaded bytes, HTTPS URLs, opaque handles, or public-safe selectors instead of local server paths or private diagnostics.' },
			]
		case 'SAFE_FETCH_REFUSED':
		case 'SAFE_FETCH_INVALID_CONTENT_TYPE':
		case 'SAFE_FETCH_TOO_LARGE':
		case 'SAFE_FETCH_TIMEOUT':
		case 'SAFE_FETCH_FAILED':
			return [
				{ type: 'use_media_url', description: 'Use a direct public HTTPS media URL that returns the expected media content type.' },
				{ type: 'upload_asset', description: 'Upload the media bytes through the AI client and use that asset instead.' },
			]
		case 'DECK_EXPIRED_OR_UNKNOWN':
			return [
				{ type: 'reopen_or_recreate', description: 'Reopen the uploaded deck or recreate the deck, then continue from the latest valid state.' },
			]
		case 'INVALID_IDEMPOTENCY_KEY':
		case 'IDEMPOTENCY_CONFLICT':
			return [
				{ type: 'use_new_idempotency_key', description: 'Use a fresh retry key for a different operation, or retry with the exact original arguments.' },
			]
		case 'PPTX_PACKAGE_SAFETY_FAILED':
		case 'PUBLIC_OUTPUT_SHAPE_LIMIT':
			return [
				{ type: 'repair_content', description: details?.recommendation || 'Revise the deck content and retry validation before saving.' },
			]
		case 'INVALID_ACTIVATION_KEY':
		case 'LICENSE_REVOKED':
		case 'LICENSE_EXPIRED':
		case 'LICENSE_VALIDATION_FAILED':
		case 'LICENSE_VALIDATION_UNAVAILABLE':
			return [
				{ type: 'check_key', description: 'Ask the user to verify the license key from checkout and try activation again.' },
				{ type: 'billing', tool: 'betterpptx.billing.portal', description: 'Offer the billing portal or checkout link if the user needs account help.' },
			]
		default:
			return [
				{ type: 'inspect_request', description: 'Review the tool arguments, preserve valid work so far, and retry with a smaller public-safe step.' },
			]
	}
}

function publicRecoverableForError(code) {
	return [
		'REQUIRES_UPGRADE',
		'QUOTA_EXCEEDED',
		'INSUFFICIENT_CREDITS',
		'BILLING_SETUP_INCOMPLETE',
		'BILLING_TEMPORARILY_UNAVAILABLE',
		'BILLING_CONFIRMATION_REQUIRED',
		'INVALID_PREMIUM_PREVIEW_TRANSITION',
		'BUSY',
		'BLACK_BOX',
		'SAFE_FETCH_REFUSED',
		'SAFE_FETCH_INVALID_CONTENT_TYPE',
		'SAFE_FETCH_TOO_LARGE',
		'SAFE_FETCH_TIMEOUT',
		'SAFE_FETCH_FAILED',
		'RATE_LIMITED',
		'TOOL_TIMEOUT',
		'UPLOAD_TOO_LARGE',
		'SERVICE_DISABLED',
		'READ_ONLY',
		'DECK_EXPIRED_OR_UNKNOWN',
		'INVALID_IDEMPOTENCY_KEY',
		'IDEMPOTENCY_CONFLICT',
		'INVALID_ACTIVATION_KEY',
		'LICENSE_VALIDATION_FAILED',
		'LICENSE_VALIDATION_UNAVAILABLE',
	].includes(code)
}

function publicRetrySafeForError(code) {
	return [
		'REQUIRES_UPGRADE',
		'QUOTA_EXCEEDED',
		'INSUFFICIENT_CREDITS',
		'BILLING_SETUP_INCOMPLETE',
		'BILLING_TEMPORARILY_UNAVAILABLE',
		'BILLING_CONFIRMATION_REQUIRED',
		'INVALID_PREMIUM_PREVIEW_TRANSITION',
		'BUSY',
		'SAFE_FETCH_TIMEOUT',
		'SAFE_FETCH_FAILED',
		'RATE_LIMITED',
		'TOOL_TIMEOUT',
		'SERVICE_DISABLED',
		'READ_ONLY',
		'INVALID_IDEMPOTENCY_KEY',
		'INVALID_ACTIVATION_KEY',
		'LICENSE_VALIDATION_FAILED',
		'LICENSE_VALIDATION_UNAVAILABLE',
	].includes(code)
}

function publicArtifactStateForError(code, details = {}) {
	if (details?.artifactStatus) return details.artifactStatus
	if (code === 'REQUIRES_UPGRADE' || code === 'INVALID_PREMIUM_PREVIEW_TRANSITION') return 'work_so_far_valid'
	if (code === 'PPTX_PACKAGE_SAFETY_FAILED') return 'not_delivered'
	if (code === 'PUBLIC_OUTPUT_SHAPE_LIMIT') return 'not_saved'
	if (code === 'DECK_EXPIRED_OR_UNKNOWN') return 'deck_handle_unavailable'
	if (code === 'UPLOAD_TOO_LARGE') return 'not_imported'
	if (code === 'IDEMPOTENCY_CONFLICT') return 'unchanged_or_unknown'
	return 'unchanged_or_unknown'
}

function normalizePublicErrorResult(result) {
	if (!isPublicBlackBoxMode() || !result || result.ok !== false || !result.error) return result
	const current = result.error
	const details = current.details && typeof current.details === 'object' ? current.details : {}
	const code = String(current.code || details.code || 'TOOL_ERROR')
	return {
		...result,
		error: {
			code,
			message: String(current.message || 'The presentation tool call failed.'),
			recoverable: current.recoverable ?? publicRecoverableForError(code),
			next_actions: current.next_actions || publicNextActionsForError(code, details),
			retry_safe: current.retry_safe ?? publicRetrySafeForError(code),
			artifact_state: current.artifact_state || publicArtifactStateForError(code, details),
			...(Object.keys(details).length ? { details } : {}),
		},
	}
}

function buildToolErrorResult(err, internalName, args = {}) {
	const error = {
		message: String(err && err.message || err),
		code: err?.code || 'TOOL_ERROR',
		...(err?.details ? { details: err.details } : {}),
		...(!isPublicBlackBoxMode() && err?.stack ? { stack: err.stack } : {}),
	}
	if (error.code === 'TOOL_TIMEOUT' && isMutatingTool(internalName) && !hasIdempotencyKey(args)) {
		error.retry_safe = false
		error.artifact_state = 'unchanged_or_unknown'
		error.details = {
			...(error.details || {}),
			status: 'timeout_after_mutation_started',
			recommendation: 'Retry mutating calls with an idempotencyKey so a delayed original operation cannot create duplicate content.',
		}
	}
	return sanitizePublicResult(normalizePublicErrorResult({ ok: false, error }))
}

function finishToolCall(trace, internalName, result) {
	const durationMs = trace?.startedAt ? Number(process.hrtime.bigint() - trace.startedAt) / 1e6 : 0
	recordToolTelemetry(internalName, result, { durationMs })
	logToolEnd(trace, result)
	return result
}

export async function callBetterPptxTool(name, args = {}, context = {}) {
	const requestedName = String(name || '')
	const internalName = requestedName
	const trace = logToolStart(internalName, args)
	if (process.env.BETTERPPTX_DISABLED === '1') {
		const result = sanitizePublicResult(maintenanceResult('SERVICE_DISABLED', 'The presentation service is temporarily unavailable for maintenance.'))
		return finishToolCall(trace, internalName, result)
	}
	if (process.env.BETTERPPTX_READ_ONLY === '1' && !isReadOnlyTool(internalName)) {
		const result = sanitizePublicResult(maintenanceResult('READ_ONLY', 'The presentation service is currently in read-only mode.'))
		return finishToolCall(trace, internalName, result)
	}
	try {
		assertPublicToolAllowed(internalName)
		assertNoPublicLocalPathArgs(args)
	} catch (err) {
		const result = sanitizePublicResult(normalizePublicErrorResult({ ok: false, error: { message: err && err.message || String(err), code: 'BLACK_BOX' } }))
		return finishToolCall(trace, internalName, result)
	}
	const fn = HANDLERS[internalName]
	if (!fn) {
		const result = sanitizePublicResult(normalizePublicErrorResult({ ok: false, error: { message: 'Unknown presentation tool.', code: 'UNKNOWN_TOOL' } }))
		return finishToolCall(trace, internalName, result)
	}
	if (supportsDeckIdempotencyReplay(internalName, args) && hasIdempotencyKey(args)) {
		try {
			const replay = await replayDeckIdempotentIfPresent(getDeck(args.deckId), internalName, args)
			if (replay) {
				const result = { ok: true, data: sanitizePublicResult(replay) }
				return finishToolCall(trace, internalName, result)
			}
		} catch (err) {
			const result = buildToolErrorResult(err, internalName, args)
			return finishToolCall(trace, internalName, result)
		}
	}
	if (supportsSessionIdempotency(internalName) && hasIdempotencyKey(args)) {
		try {
			const replay = await replaySessionIdempotentIfPresent(context, internalName, args)
			if (replay) {
				const result = { ok: true, data: sanitizePublicResult(replay) }
				return finishToolCall(trace, internalName, result)
			}
		} catch (err) {
			const result = buildToolErrorResult(err, internalName, args)
			return finishToolCall(trace, internalName, result)
		}
	}
	const quota = checkDeckCreationQuota(internalName, context)
	if (quota) {
		const result = sanitizePublicResult(quota)
		return finishToolCall(trace, internalName, result)
	}
	const gate = requireEntitlement(internalName, args, context, {
		deckSlideCount: deckId => {
			const entry = decks.get(deckId)
			return entry ? entry.pptx.slides.length : null
		},
		deckSlideTransition: (deckId, slideIndex) => {
			const entry = decks.get(deckId)
			return entry ? entry.pptx.slides[slideIndex]?.transition || null : null
		},
	})
	if (gate) {
		const result = sanitizePublicResult(normalizePublicErrorResult(gate))
		return finishToolCall(trace, internalName, result)
	}
	let billingGate = null
	try {
		billingGate = await preflightBillingReservation({
			name: internalName,
			args,
			context,
			entry: args?.deckId ? decks.get(args.deckId) : null,
			billingEntitlement: getBillingEntitlement(context),
		})
	} catch (err) {
		const result = buildToolErrorResult(err, internalName, args)
		return finishToolCall(trace, internalName, result)
	}
	const heavy = HEAVY_TOOLS.has(internalName)
	if (heavy) {
		try { await acquireHeavy() }
		catch (e) {
			const result = sanitizePublicResult(normalizePublicErrorResult({ ok: false, error: { message: String(e.message || e), code: 'BUSY' } }))
			return finishToolCall(trace, internalName, result)
		}
	}
	let toolPromise
	let valueProduced = false
	try {
		toolPromise = Promise.resolve().then(() => {
			if (supportsDeckIdempotency(internalName, args) && hasIdempotencyKey(args)) {
				return runDeckIdempotent(getDeck(args.deckId), internalName, args, () => fn(args, context))
			}
			if (supportsSessionIdempotency(internalName) && hasIdempotencyKey(args)) {
				return runSessionIdempotent(context, internalName, args, () => fn(args, context))
			}
			return fn(args, context)
		})
		if (heavy) toolPromise = toolPromise.finally(() => releaseHeavy())
		const data = await withToolTimeout(toolPromise, TOOL_TIMEOUT_MS, internalName)
		valueProduced = true
		await finalizeBillingReservation({
			gate: billingGate,
			name: internalName,
			args,
			result: data,
		})
		if (billingGate?.active && process.env.BETTERPPTX_DODO_USAGE_AUTO_FLUSH !== '0') {
			try {
				const usageFlush = await runBillingUsageReconciler({
					limit: Number(process.env.BETTERPPTX_DODO_USAGE_FLUSH_LIMIT || 20),
				})
				if (usageFlush?.ok === false) {
					logEvent('billing.usage.flush_deferred', {
						tool: internalName,
						attempted: usageFlush.attempted,
						failed: usageFlush.failed,
						skipped: usageFlush.skipped,
						errorCode: usageFlush.errorCode,
					})
				}
			} catch (flushErr) {
				logEvent('billing.usage.flush_failed', {
					tool: internalName,
					code: flushErr?.code || 'BILLING_USAGE_FLUSH_FAILED',
					message: String(flushErr?.message || flushErr),
				})
			}
		}
		try {
			await recordBillingDryRunOperation({
				name: internalName,
				args,
				context,
				result: data,
				entry: args?.deckId ? decks.get(args.deckId) : null,
				billingEntitlement: getBillingEntitlement(context),
			})
		} catch (err) {
			logEvent('billing.dry_run.record_failed', {
				tool: internalName,
				code: err?.code || 'BILLING_DRY_RUN_RECORD_FAILED',
				message: String(err?.message || err),
			})
		}
		const result = { ok: true, data: sanitizePublicResult(data) }
		await recordSuccessfulUse(internalName, context)
		return finishToolCall(trace, internalName, result)
	} catch (err) {
		if (!valueProduced) {
			try {
				await releaseBillingReservation({ gate: billingGate, reason: err?.code || 'tool-failed-before-value' })
			} catch (releaseErr) {
				logEvent('billing.reservation.release_failed', {
					tool: internalName,
					code: releaseErr?.code || 'BILLING_RELEASE_FAILED',
					message: String(releaseErr?.message || releaseErr),
				})
			}
		}
		const result = buildToolErrorResult(err, internalName, args)
		return finishToolCall(trace, internalName, result)
	}
}

export function listBetterPptxToolNames() {
	return Object.keys(HANDLERS)
}
