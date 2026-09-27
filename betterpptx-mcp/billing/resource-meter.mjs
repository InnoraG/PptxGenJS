import * as fs from 'node:fs'
import * as path from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'

const CGROUP_ROOT = '/sys/fs/cgroup'
const CPU_STAT_PATH = path.join(CGROUP_ROOT, 'cpu.stat')
const MEMORY_CURRENT_PATH = path.join(CGROUP_ROOT, 'memory.current')
const MEMORY_PEAK_PATH = path.join(CGROUP_ROOT, 'memory.peak')
const IO_STAT_PATH = path.join(CGROUP_ROOT, 'io.stat')
const PROCESS_STARTED_AT_MS = Date.now() - Math.round(process.uptime() * 1000)
const usageContext = new AsyncLocalStorage()
let firstMeasurement = true

function nonNegativeNumber(value) {
	const n = Number(value)
	return Number.isFinite(n) ? Math.max(0, n) : 0
}

function integer(value) {
	return Math.max(0, Math.round(nonNegativeNumber(value)))
}

function readText(file) {
	try {
		return fs.readFileSync(file, 'utf8').trim()
	} catch {
		return ''
	}
}

function parseKeyValueLines(text) {
	const out = {}
	for (const line of String(text || '').split(/\r?\n/)) {
		const [key, rawValue] = line.trim().split(/\s+/, 2)
		if (!key || rawValue === undefined) continue
		const value = Number(rawValue)
		if (Number.isFinite(value)) out[key] = value
	}
	return out
}

function parseIoStat(text) {
	const totals = { readBytes: 0, writeBytes: 0 }
	for (const line of String(text || '').split(/\r?\n/)) {
		for (const token of line.trim().split(/\s+/).slice(1)) {
			const [key, rawValue] = token.split('=', 2)
			const value = Number(rawValue)
			if (!Number.isFinite(value)) continue
			if (key === 'rbytes') totals.readBytes += value
			if (key === 'wbytes') totals.writeBytes += value
		}
	}
	return totals
}

function cgroupSnapshot() {
	if (!fs.existsSync(CPU_STAT_PATH)) return null
	const cpu = parseKeyValueLines(readText(CPU_STAT_PATH))
	const io = parseIoStat(readText(IO_STAT_PATH))
	return {
		source: 'cgroup_v2',
		cpuUsec: integer(cpu.usage_usec),
		memoryCurrentBytes: integer(readText(MEMORY_CURRENT_PATH)),
		memoryPeakBytes: integer(readText(MEMORY_PEAK_PATH)),
		ioReadBytes: integer(io.readBytes),
		ioWriteBytes: integer(io.writeBytes),
	}
}

function processSnapshot() {
	const cpu = process.cpuUsage()
	const memory = process.memoryUsage()
	const usage = typeof process.resourceUsage === 'function' ? process.resourceUsage() : {}
	return {
		source: 'process',
		cpuUsec: integer(cpu.user + cpu.system),
		memoryCurrentBytes: integer(memory.rss),
		memoryPeakBytes: integer(nonNegativeNumber(usage.maxRSS) * 1024),
		ioReadBytes: 0,
		ioWriteBytes: 0,
	}
}

function snapshot() {
	return cgroupSnapshot() || processSnapshot()
}

function envLabel(name) {
	const value = String(process.env[name] || '').trim()
	return value ? value.slice(0, 160) : undefined
}

function compact(record) {
	return Object.fromEntries(Object.entries(record).filter(([_key, value]) => value !== undefined))
}

const USAGE_COUNTERS = Object.freeze([
	'artifactBytes',
	'egressBytes',
	'storageWriteBytes',
	'storageReadBytes',
	'gcsClassAOps',
	'gcsClassBOps',
	'firestoreReads',
	'firestoreWrites',
	'firestoreDeletes',
	'firestoreTransactions',
	'firestoreTxRetries',
	'externalCalls',
	'ttsCharacters',
	'ttsAudioSeconds',
	'avatarVideoSeconds',
	'gpuSeconds',
	// SERVER/SERVICE cost drivers for the free-content value-add (Pexels/Pixabay/Freesound
	// images/video/music cost us NO licensing — only server+service): imageOps raster CPU
	// (op count), stock resolve download+decode bytes, and Sketchfab/3D archive import bytes.
	// These let the metrology fit attribute the real compute instead of smearing it onto
	// perRichObject/perOutputMb; content itself never enters the cost matrix.
	'imageOpsOps',
	'stockResolveBytes',
	'model3dImportBytes',
	// GENERATED-IMAGE cost drivers (Flux text→image). UNLIKE the free stock resolve, generation
	// is a REAL external USD compute cost, so it is its own metered family: imageGenOps (number of
	// generation API calls) + imageGenImages (images produced). Content licensing stays free.
	'imageGenOps',
	'imageGenImages',
	// Flux image-gen GPU seconds — the REAL Modal L40S per-request cost (0 on the Cloudflare edge host).
	// A GPU family like model3dGen (charging-matrix GPU-fair), distinct from the per-image count above.
	'imageGenGpuSeconds',
	// PRIVATE SEMANTIC-JUDGE cost drivers (Qwen on Modal L40S). Kept separate from
	// Flux image generation so owner billing can attribute review compute without
	// double-counting it as image creation.
	'semanticJudgeOps',
	'semanticJudgeGpuSeconds',
	// GENERATED-RIGGED-3D cost drivers (TRELLIS.2 image→mesh + UniRig auto-rig on Modal L40S). Like the
	// avatar family this is REAL external GPU compute: model3dGenGpuSeconds (worker-reported wall GPU time
	// = generation + rigging + cold model-load) is the cost weight; model3dGenBytes (output GLB size) is a
	// metrics driver. Provider/model/mesh-resolution are recorded as LABELS (strings), not counters.
	'model3dGenGpuSeconds',
	'model3dGenBytes',
	// Paid external generation services report provider credits directly. Keep this separate from
	// self-hosted GPU seconds so cost attribution never invents fake GPU time.
	'model3dGenProviderCredits',
	// Baker (presenter clip-baker) CPU seconds — a SEPARATE, real Modal CPU-container USD cost. Its OWN
	// counter/family (NOT folded into gpuSeconds) so it takes the normal CPU margin, not the GPU-fair m=3 cap.
	'model3dGenBakeCpuSeconds',
	// Per-STAGE GPU breakdown (Generator vs Rigger) — METRICS-ONLY (their sum == model3dGenGpuSeconds, which is
	// already priced). NEVER given their own USD line (would double-charge); recorded for CEO stage attribution.
	'model3dGenGenGpuSeconds',
	'model3dGenRigGpuSeconds',
])

function emptyUsage() {
	return Object.fromEntries(USAGE_COUNTERS.map(key => [key, 0]))
}

function combinedUsage(...sources) {
	const out = emptyUsage()
	for (const source of sources) {
		for (const key of USAGE_COUNTERS) {
			out[key] += nonNegativeNumber(source?.[key])
		}
	}
	return out
}

function resultBytes(result = {}) {
	const candidates = [
		result?.bytes,
		result?.data?.bytes,
		result?.artifact?.bytes,
		result?.data?.artifact?.bytes,
	]
	for (const candidate of candidates) {
		const value = Number(candidate)
		if (Number.isFinite(value) && value >= 0) return Math.round(value)
	}
	return 0
}

function meterSink() {
	return String(process.env.BETTERPPTX_METROLOGY_SINK || 'log').trim().toLowerCase()
}

function writeMeasurement(row) {
	const line = JSON.stringify(row)
	const sink = meterSink()
	if (sink === 'file' || sink === 'both') {
		const file = path.resolve(
			process.env.BETTERPPTX_METROLOGY_FILE
			|| path.join(process.cwd(), 'outputs', 'metrology', 'resource-meter.ndjson'),
		)
		fs.mkdirSync(path.dirname(file), { recursive: true })
		fs.appendFileSync(file, `${line}\n`, 'utf8')
	}
	if (sink === 'log' || sink === 'both') {
		process.stderr.write(`${line}\n`)
	}
}

export function isResourceMeterEnabled() {
	return process.env.BETTERPPTX_METROLOGY === '1'
}

// CONTINUOUS COST-LEARNING (CEO doctrine 2026-07-03): every real operation is a data
// point — 1000 real TTS runs beat any one-shot matrix sample. Observations are ON by
// default, compact (numbers + tool + labels, never content or local paths), file-only,
// and strictly advisory: any failure disables the sink silently for the process.
export function isCostObservationsEnabled() {
	return process.env.BETTERPPTX_COST_OBSERVATIONS !== '0'
}

// LIFECYCLE (bounded by construction — CEO directive 2026-07-03): the active file rotates
// at BETTERPPTX_COST_OBSERVATIONS_MAX_MB (default 64). Rotated segments either MOVE to
// BETTERPPTX_COST_OBSERVATIONS_ARCHIVE_DIR when configured (in cloud: a writable mounted
// bucket path -> durable, lifecycle-ruled there), or stay beside the active file with at
// most BETTERPPTX_COST_OBSERVATIONS_KEEP segments retained (default 8 -> ~512 MB worst
// case, months of analysis window at realistic volume); older segments are pruned oldest-
// first AFTER the aggregates (evolving model / analytics) have had every chance to re-fit.
// tools/archive-cost-observations.mjs ships segments to GCS on a schedule as the
// long-term archive. Everything here is fail-soft: lifecycle errors never block tools.
let observationsSinkBroken = false

function observationsMaxBytes() {
	const mb = Number(process.env.BETTERPPTX_COST_OBSERVATIONS_MAX_MB)
	return Math.max(1, Number.isFinite(mb) && mb > 0 ? mb : 64) * 1024 * 1024
}

function observationsKeepSegments() {
	const n = Number(process.env.BETTERPPTX_COST_OBSERVATIONS_KEEP)
	return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 8
}

function costObservationsFile() {
	return path.resolve(
		process.env.BETTERPPTX_COST_OBSERVATIONS_FILE
		|| path.join(process.cwd(), 'outputs', 'metrology', 'cost-observations.ndjson'),
	)
}

function rotateAndRetainObservations(file) {
	const rotated = file.replace(/\.ndjson$/, `.${Date.now()}.ndjson`)
	fs.renameSync(file, rotated)
	const archiveDir = String(process.env.BETTERPPTX_COST_OBSERVATIONS_ARCHIVE_DIR || '').trim()
	if (archiveDir) {
		try {
			fs.mkdirSync(archiveDir, { recursive: true })
			fs.renameSync(rotated, path.join(archiveDir, path.basename(rotated)))
			return
		} catch {
			try { fs.copyFileSync(rotated, path.join(archiveDir, path.basename(rotated))); fs.rmSync(rotated, { force: true }); return } catch { /* keep local, retention below */ }
		}
	}
	const dir = path.dirname(file)
	const base = path.basename(file).replace(/\.ndjson$/, '')
	const segments = fs.readdirSync(dir)
		.filter(name => name.startsWith(`${base}.`) && name.endsWith('.ndjson'))
		.sort()
	const keep = observationsKeepSegments()
	for (const stale of segments.slice(0, Math.max(0, segments.length - keep))) {
		try { fs.rmSync(path.join(dir, stale), { force: true }) } catch { /* advisory */ }
	}
}

function appendCostObservation(row) {
	if (observationsSinkBroken) return
	try {
		const file = costObservationsFile()
		fs.mkdirSync(path.dirname(file), { recursive: true })
		try {
			const stat = fs.statSync(file)
			if (stat.size > observationsMaxBytes()) rotateAndRetainObservations(file)
		} catch { /* first write */ }
		fs.appendFileSync(file, `${JSON.stringify(row)}\n`, 'utf8')
	} catch {
		observationsSinkBroken = true
	}
}

export function startResourceMeasure({ toolName = 'unknown', callId = '', workload = '' } = {}) {
	if (!isResourceMeterEnabled() && !isCostObservationsEnabled()) return null
	const measure = {
		schemaVersion: 'betterpptx.metrology.v1',
		metricType: 'betterpptx.resource_measurement',
		toolName: String(toolName || 'unknown'),
		callId: String(callId || ''),
		workload: String(workload || process.env.BETTERPPTX_METROLOGY_WORKLOAD || ''),
		startedAt: new Date().toISOString(),
		startedHrtime: process.hrtime.bigint(),
		snapshot: snapshot(),
		usage: emptyUsage(),
		labels: {},
		coldStart: firstMeasurement,
		startupLatencyMs: firstMeasurement ? Math.max(0, Date.now() - PROCESS_STARTED_AT_MS) : 0,
	}
	firstMeasurement = false
	usageContext.enterWith(measure)
	return measure
}

export function recordResourceUsage(delta = {}) {
	if (!isResourceMeterEnabled() && !isCostObservationsEnabled()) return false
	const measure = usageContext.getStore()
	if (!measure?.usage) return false
	for (const key of USAGE_COUNTERS) {
		if (delta[key] === undefined) continue
		measure.usage[key] = nonNegativeNumber(measure.usage[key]) + nonNegativeNumber(delta[key])
	}
	return true
}

// Short string facts attached to the active measurement (e.g. ttsVoice, avatarProvider,
// billed). Values are truncated; content-bearing strings must never be passed here.
export function recordResourceLabels(labels = {}) {
	const measure = usageContext.getStore()
	if (!measure) return false
	measure.labels ||= {}
	for (const [key, value] of Object.entries(labels)) {
		if (value === undefined || value === null) continue
		measure.labels[String(key).slice(0, 40)] = String(value).slice(0, 120)
	}
	return true
}

export function recordResourceUnitEvent({ eventType = 'usage', usage = {}, metadata = {} } = {}) {
	if (!isResourceMeterEnabled()) return null
	const row = compact({
		schemaVersion: 'betterpptx.metrology.v1',
		metricType: 'betterpptx.resource_unit_event',
		eventType: String(eventType || 'usage'),
		recordedAt: new Date().toISOString(),
		...combinedUsage(usage),
		service: envLabel('K_SERVICE'),
		revision: envLabel('K_REVISION'),
		configuration: envLabel('K_CONFIGURATION'),
		metadata: Object.keys(metadata || {}).length ? metadata : undefined,
	})
	writeMeasurement(row)
	return row
}

export function finishResourceMeasure(measure, {
	ok = true,
	errorCode = '',
	result = {},
	usage = {},
} = {}) {
	if (!measure) return null
	try {
		const ended = snapshot()
		const started = measure.snapshot || ended
		const counters = combinedUsage(measure.usage, usage)
		const row = compact({
			schemaVersion: measure.schemaVersion,
			metricType: measure.metricType,
			toolName: measure.toolName,
			callId: measure.callId || undefined,
			workload: measure.workload || undefined,
			startedAt: measure.startedAt,
			finishedAt: new Date().toISOString(),
			ok: Boolean(ok),
			errorCode: errorCode ? String(errorCode) : undefined,
			meterSource: ended.source,
			includesChildProcesses: ended.source === 'cgroup_v2',
			coldStart: Boolean(measure.coldStart),
			startupLatencyMs: nonNegativeNumber(measure.startupLatencyMs),
			wallMs: Number((Number(process.hrtime.bigint() - measure.startedHrtime) / 1e6).toFixed(3)),
			cpuUsec: integer(ended.cpuUsec - started.cpuUsec),
			memoryCurrentBytesStart: integer(started.memoryCurrentBytes),
			memoryCurrentBytesEnd: integer(ended.memoryCurrentBytes),
			memoryPeakBytesStart: integer(started.memoryPeakBytes),
			memoryPeakBytesEnd: integer(ended.memoryPeakBytes),
			ioReadBytes: integer(ended.ioReadBytes - started.ioReadBytes),
			ioWriteBytes: integer(ended.ioWriteBytes - started.ioWriteBytes),
			artifactBytes: integer(counters.artifactBytes || resultBytes(result)),
			egressBytes: integer(counters.egressBytes),
			storageWriteBytes: integer(counters.storageWriteBytes),
			gcsClassAOps: integer(counters.gcsClassAOps),
			gcsClassBOps: integer(counters.gcsClassBOps),
			firestoreReads: integer(counters.firestoreReads),
			firestoreWrites: integer(counters.firestoreWrites),
			firestoreDeletes: integer(counters.firestoreDeletes),
			firestoreTransactions: integer(counters.firestoreTransactions),
			firestoreTxRetries: integer(counters.firestoreTxRetries),
			externalCalls: integer(counters.externalCalls),
			ttsCharacters: integer(counters.ttsCharacters),
			ttsAudioSeconds: nonNegativeNumber(counters.ttsAudioSeconds),
			avatarVideoSeconds: nonNegativeNumber(counters.avatarVideoSeconds),
			gpuSeconds: nonNegativeNumber(counters.gpuSeconds),
			// SERVER/SERVICE cost drivers for free-content processing — the fit reads these off
			// the metrology row to attribute imageOps/stock-resolve/3D-import instead of smearing.
			storageReadBytes: integer(counters.storageReadBytes),
			imageOpsOps: integer(counters.imageOpsOps),
			stockResolveBytes: integer(counters.stockResolveBytes),
			model3dImportBytes: integer(counters.model3dImportBytes),
			imageGenOps: integer(counters.imageGenOps),
			imageGenImages: integer(counters.imageGenImages),
			imageGenGpuSeconds: nonNegativeNumber(counters.imageGenGpuSeconds),
			semanticJudgeOps: integer(counters.semanticJudgeOps),
			semanticJudgeGpuSeconds: nonNegativeNumber(counters.semanticJudgeGpuSeconds),
			// GENERATED-RIGGED-3D drivers — the fit reads model3dGenGpuSeconds off the row to attribute
			// TRELLIS.2+UniRig L40S compute to its own family (avatarUsdPerGpuSecond stays avatar-only).
			model3dGenGpuSeconds: nonNegativeNumber(counters.model3dGenGpuSeconds),
			model3dGenBytes: integer(counters.model3dGenBytes),
			model3dGenProviderCredits: nonNegativeNumber(counters.model3dGenProviderCredits),
			// Baker CPU seconds (own priced family) + per-stage GPU split (metrics-only, sum==model3dGenGpuSeconds).
			model3dGenBakeCpuSeconds: nonNegativeNumber(counters.model3dGenBakeCpuSeconds),
			model3dGenGenGpuSeconds: nonNegativeNumber(counters.model3dGenGenGpuSeconds),
			model3dGenRigGpuSeconds: nonNegativeNumber(counters.model3dGenRigGpuSeconds),
			// Attribution LABELS ride the L1 row too (not just the observation) so cost analysis can segment by
			// provider / cold-vs-warm / gpuType / performer tier — CEO-visibility for fair pricing. Additive:
			// compact() drops it when no labels were recorded, so every pre-existing row shape is unchanged.
			labels: (measure.labels && Object.keys(measure.labels).length) ? { ...measure.labels } : undefined,
			service: envLabel('K_SERVICE'),
			revision: envLabel('K_REVISION'),
			configuration: envLabel('K_CONFIGURATION'),
		})
		if (isResourceMeterEnabled()) writeMeasurement(row)
		if (isCostObservationsEnabled()) {
			// Compact learning row: timings + nonzero usage counters + labels. No content,
			// no paths — safe to keep always-on and to aggregate later.
			const observation = { ts: row.finishedAt, tool: row.toolName, ok: row.ok, wallMs: row.wallMs, cpuUsec: row.cpuUsec }
			if (row.coldStart) observation.coldStart = true
			if (row.errorCode) observation.errorCode = row.errorCode
			for (const key of USAGE_COUNTERS) {
				if (nonNegativeNumber(counters[key]) > 0) observation[key] = counters[key]
			}
			if (measure.labels && Object.keys(measure.labels).length) observation.labels = { ...measure.labels }
			appendCostObservation(observation)
		}
		return row
	} catch {
		return null
	}
}

export function resourceMeterCapabilities() {
	const current = snapshot()
	return {
		enabled: isResourceMeterEnabled(),
		meterSource: current.source,
		includesChildProcesses: current.source === 'cgroup_v2',
		sink: meterSink(),
	}
}
