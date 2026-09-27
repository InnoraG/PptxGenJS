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
		// CEO subsidy meter: billable-category value delivered with NO active billing gate
		// (free-tier preview, maintainer/local, enforcement off) — what it WOULD have billed.
		subsidizedOperations: 0,
		subsidizedCredits: 0,
		subsidyByTool: {},
		subsidyByReason: {},
		creditedVolumeCredits: 0,
		reservationFailures: 0,
		overrunCredits: 0,
		quoteCapReleaseCredits: 0,
		unmatchedPayments: 0,
		scannerRuns: 0,
		scannerFailures: 0,
		scannerLastSuccessAt: null,
		scannerLastFailureAt: null,
		forwarderSweeperRuns: 0,
		forwarderSweeperFailures: 0,
		forwarderSweeperLastSuccessAt: null,
		forwarderSweeperLastFailureAt: null,
		forwarderSweeperLastDryRun: false,
		forwarderSweeperLastScanned: 0,
		forwarderSweeperLastEligible: 0,
		forwarderSweeperLastBatches: 0,
		forwarderSweeperLastSubmitted: 0,
		forwarderSweeperLastFailed: 0,
		forwarderSweeperLastTokenAtomsQueued: '0',
		forwarderSweeperStalledTokenAtomsEstimate: '0',
		lastRateCardVersion: null,
		lastOperationAt: null,
		creditsBySource: {},
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
	const operations = Math.max(1, Number(fact.operationCount) || 1)
	const category = fact.billingCategory || 'unknown'
	const tool = fact.toolName || 'unknown'
	counters.billing.dryRunOperations += operations
	counters.billing.dryRunEstimatedCredits = Number((counters.billing.dryRunEstimatedCredits + credits).toFixed(2))
	counters.billing.lastRateCardVersion = fact.rateCardVersion || counters.billing.lastRateCardVersion
	counters.billing.lastOperationAt = fact.createdAt || new Date().toISOString()
	incObject(counters.billing.byCategory, category, operations)
	incObject(counters.billing.byTool, tool, operations)
}

export function recordBillingCreditTelemetry({ source = 'unknown', amountCredits = 0 } = {}) {
	const credits = Math.max(0, Number(amountCredits) || 0)
	if (credits <= 0) return
	counters.billing.creditedVolumeCredits = Number((counters.billing.creditedVolumeCredits + credits).toFixed(2))
	incObject(counters.billing.creditsBySource, source, credits)
}

export function recordBillingSubsidyTelemetry({ toolName = 'unknown', estimatedCredits = 0, reason = 'unknown' } = {}) {
	const credits = Math.max(0, Number(estimatedCredits) || 0)
	if (credits <= 0) return
	counters.billing.subsidizedOperations += 1
	counters.billing.subsidizedCredits = Number((counters.billing.subsidizedCredits + credits).toFixed(2))
	incObject(counters.billing.subsidyByTool, toolName, credits)
	incObject(counters.billing.subsidyByReason, reason, credits)
}

export function recordBillingReservationTelemetry({
	failed = false,
	overrunCredits = 0,
	releasedCredits = 0,
} = {}) {
	if (failed) counters.billing.reservationFailures += 1
	counters.billing.overrunCredits = Number((counters.billing.overrunCredits + Math.max(0, Number(overrunCredits) || 0)).toFixed(2))
	counters.billing.quoteCapReleaseCredits = Number((counters.billing.quoteCapReleaseCredits + Math.max(0, Number(releasedCredits) || 0)).toFixed(2))
}

export function recordPaymentScannerTelemetry({
	ok = true,
	unmatchedPayments = 0,
	creditedCredits = 0,
	at = new Date().toISOString(),
} = {}) {
	counters.billing.scannerRuns += 1
	counters.billing.unmatchedPayments += Math.max(0, Math.round(Number(unmatchedPayments) || 0))
	if (ok) {
		counters.billing.scannerLastSuccessAt = at
		if (creditedCredits > 0) recordBillingCreditTelemetry({ source: 'chain_transfer', amountCredits: creditedCredits })
	} else {
		counters.billing.scannerFailures += 1
		counters.billing.scannerLastFailureAt = at
	}
}

export function recordForwarderSweeperTelemetry({
	ok = true,
	summary = null,
	at = new Date().toISOString(),
} = {}) {
	counters.billing.forwarderSweeperRuns += 1
	const scanned = Math.max(0, Math.round(Number(summary?.scanned) || 0))
	const eligible = Math.max(0, Math.round(Number(summary?.eligible) || 0))
	const batches = Math.max(0, Math.round(Number(summary?.batches) || 0))
	const submitted = Math.max(0, Math.round(Number(summary?.submitted) || 0))
	const failed = Math.max(0, Math.round(Number(summary?.failed) || 0))
	const tokenAtomsQueued = (() => {
		try {
			const value = BigInt(String(summary?.tokenAtomsQueued || '0'))
			return value > 0n ? value.toString() : '0'
		} catch {
			return '0'
		}
	})()
	counters.billing.forwarderSweeperLastDryRun = summary?.dryRun === true
	counters.billing.forwarderSweeperLastScanned = scanned
	counters.billing.forwarderSweeperLastEligible = eligible
	counters.billing.forwarderSweeperLastBatches = batches
	counters.billing.forwarderSweeperLastSubmitted = submitted
	counters.billing.forwarderSweeperLastFailed = failed
	counters.billing.forwarderSweeperLastTokenAtomsQueued = tokenAtomsQueued
	if (ok) {
		counters.billing.forwarderSweeperLastSuccessAt = at
		counters.billing.forwarderSweeperStalledTokenAtomsEstimate = failed > 0 ? tokenAtomsQueued : '0'
	} else {
		counters.billing.forwarderSweeperFailures += 1
		counters.billing.forwarderSweeperLastFailureAt = at
		counters.billing.forwarderSweeperStalledTokenAtomsEstimate = tokenAtomsQueued
	}
}

export function getBillingTelemetrySummary() {
	return {
		operations: counters.billing.dryRunOperations,
		estimatedCredits: Number(counters.billing.dryRunEstimatedCredits.toFixed(2)),
		subsidy: {
			operations: counters.billing.subsidizedOperations,
			estimatedCredits: Number(counters.billing.subsidizedCredits.toFixed(2)),
			byTool: { ...counters.billing.subsidyByTool },
			byReason: { ...counters.billing.subsidyByReason },
		},
		creditedVolumeCredits: Number(counters.billing.creditedVolumeCredits.toFixed(2)),
		reservationFailures: counters.billing.reservationFailures,
		overrunCredits: Number(counters.billing.overrunCredits.toFixed(2)),
		quoteCapReleaseCredits: Number(counters.billing.quoteCapReleaseCredits.toFixed(2)),
		unmatchedPayments: counters.billing.unmatchedPayments,
		scannerRuns: counters.billing.scannerRuns,
		scannerFailures: counters.billing.scannerFailures,
		scannerLastSuccessAt: counters.billing.scannerLastSuccessAt,
		scannerLastFailureAt: counters.billing.scannerLastFailureAt,
		forwarderSweeperRuns: counters.billing.forwarderSweeperRuns,
		forwarderSweeperFailures: counters.billing.forwarderSweeperFailures,
		forwarderSweeperLastSuccessAt: counters.billing.forwarderSweeperLastSuccessAt,
		forwarderSweeperLastFailureAt: counters.billing.forwarderSweeperLastFailureAt,
		forwarderSweeperLastDryRun: counters.billing.forwarderSweeperLastDryRun,
		forwarderSweeperLastScanned: counters.billing.forwarderSweeperLastScanned,
		forwarderSweeperLastEligible: counters.billing.forwarderSweeperLastEligible,
		forwarderSweeperLastBatches: counters.billing.forwarderSweeperLastBatches,
		forwarderSweeperLastSubmitted: counters.billing.forwarderSweeperLastSubmitted,
		forwarderSweeperLastFailed: counters.billing.forwarderSweeperLastFailed,
		forwarderSweeperLastTokenAtomsQueued: counters.billing.forwarderSweeperLastTokenAtomsQueued,
		forwarderSweeperStalledTokenAtomsEstimate: counters.billing.forwarderSweeperStalledTokenAtomsEstimate,
		lastRateCardVersion: counters.billing.lastRateCardVersion,
		lastOperationAt: counters.billing.lastOperationAt,
		creditsBySource: { ...counters.billing.creditsBySource },
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
