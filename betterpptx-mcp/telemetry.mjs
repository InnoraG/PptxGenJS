const startedAt = new Date().toISOString()

const counters = {
	toolCalls: 0,
	toolSuccesses: 0,
	toolErrors: 0,
	idempotentReplays: 0,
	idempotencyConflicts: 0,
	downloads: 0,
	downloadErrors: 0,
	artifactsSaved: 0,
	byTool: {},
	byErrorCode: {},
	artifactBytes: {},
	auth: {
		activations: 0,
		activationFailures: 0,
	},
	billing: {
		dryRunOperations: 0,
		dryRunEstimatedCredits: 0,
		lastRateCardVersion: null,
		lastOperationAt: null,
		byCategory: {},
		byTool: {},
	},
}

function incObject(obj, key, n = 1) {
	const safe = String(key || 'unknown').replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 120) || 'unknown'
	obj[safe] = (obj[safe] || 0) + n
}

function bytesBucket(bytes) {
	const n = Math.max(0, Number(bytes) || 0)
	if (n < 100 * 1024) return '<100KB'
	if (n < 1024 * 1024) return '100KB-1MB'
	if (n < 10 * 1024 * 1024) return '1MB-10MB'
	if (n < 50 * 1024 * 1024) return '10MB-50MB'
	return '>=50MB'
}

function toolStats(name) {
	const key = String(name || 'unknown')
	if (!counters.byTool[key]) counters.byTool[key] = {
		calls: 0,
		successes: 0,
		errors: 0,
		replays: 0,
		totalDurationMs: 0,
		maxDurationMs: 0,
	}
	return counters.byTool[key]
}

export function recordToolTelemetry(name, result, { durationMs = 0 } = {}) {
	const stat = toolStats(name)
	const ms = Math.max(0, Number(durationMs) || 0)
	counters.toolCalls += 1
	stat.calls += 1
	stat.totalDurationMs += ms
	stat.maxDurationMs = Math.max(stat.maxDurationMs, ms)

	if (result?.ok === true) {
		counters.toolSuccesses += 1
		stat.successes += 1
		if (result?.data?.idempotentReplay === true) {
			counters.idempotentReplays += 1
			stat.replays += 1
		}
		if (name === 'betterpptx.deck.save') {
			counters.artifactsSaved += 1
			incObject(counters.artifactBytes, bytesBucket(result?.data?.bytes))
		}
		if (name === 'betterpptx.auth.activate_key') counters.auth.activations += 1
		return
	}

	counters.toolErrors += 1
	stat.errors += 1
	const code = result?.error?.code || 'TOOL_ERROR'
	incObject(counters.byErrorCode, code)
	if (code === 'IDEMPOTENCY_CONFLICT') counters.idempotencyConflicts += 1
	if (name === 'betterpptx.auth.activate_key') counters.auth.activationFailures += 1
}

export function recordDownloadTelemetry({ ok = true, bytes = 0 } = {}) {
	if (ok) {
		counters.downloads += 1
		incObject(counters.artifactBytes, bytesBucket(bytes))
	} else {
		counters.downloadErrors += 1
	}
}

export function recordBillingDryRunTelemetry(fact = {}) {
	const credits = Math.max(0, Number(fact.estimatedCredits) || 0)
	const category = fact.billingCategory || 'unknown'
	const tool = fact.toolName || 'unknown'
	counters.billing.dryRunOperations += 1
	counters.billing.dryRunEstimatedCredits = Number((counters.billing.dryRunEstimatedCredits + credits).toFixed(2))
	counters.billing.lastRateCardVersion = fact.rateCardVersion || counters.billing.lastRateCardVersion
	counters.billing.lastOperationAt = fact.createdAt || new Date().toISOString()
	incObject(counters.billing.byCategory, category)
	incObject(counters.billing.byTool, tool)
}

export function getBillingTelemetrySummary() {
	return {
		operations: counters.billing.dryRunOperations,
		estimatedCredits: Number(counters.billing.dryRunEstimatedCredits.toFixed(2)),
		lastRateCardVersion: counters.billing.lastRateCardVersion,
		lastOperationAt: counters.billing.lastOperationAt,
		byCategory: { ...counters.billing.byCategory },
		byTool: { ...counters.billing.byTool },
	}
}

export function getTelemetrySnapshot() {
	const byTool = {}
	for (const [name, stat] of Object.entries(counters.byTool)) {
		byTool[name] = {
			...stat,
			avgDurationMs: stat.calls ? Math.round(stat.totalDurationMs / stat.calls) : 0,
		}
	}
	return {
		startedAt,
		toolCalls: counters.toolCalls,
		toolSuccesses: counters.toolSuccesses,
		toolErrors: counters.toolErrors,
		idempotentReplays: counters.idempotentReplays,
		idempotencyConflicts: counters.idempotencyConflicts,
		downloads: counters.downloads,
		downloadErrors: counters.downloadErrors,
		artifactsSaved: counters.artifactsSaved,
		artifactBytes: { ...counters.artifactBytes },
		byErrorCode: { ...counters.byErrorCode },
		auth: { ...counters.auth },
		billing: getBillingTelemetrySummary(),
		byTool,
	}
}
