// Pure validation for a redacted provider billing export. It never contacts a
// provider and never treats a shared-App row as request-attributed unless the
// owner export explicitly includes every execution ID for the covered window.

const finite = value => Number.isFinite(Number(value))
const asNumber = value => finite(value) ? Number(value) : null
const asId = value => String(value || '').trim()

export function expectedProviderExecutions(reconciliationReport = {}) {
	return (reconciliationReport.evidence?.capturedWorkerUsage || []).flatMap(item =>
		(Array.isArray(item.providerExecutionIds) ? item.providerExecutionIds : []).map(providerExecutionId => ({
			accountId: asId(item.accountId),
			providerExecutionId: asId(providerExecutionId),
			gpuSeconds: asNumber(item.gpuSeconds),
		}))
	).filter(item => item.accountId && item.providerExecutionId && item.gpuSeconds !== null)
}

export function evaluateProviderCoverage({ reconciliationReport = {}, exportReport = {} } = {}) {
	const expected = expectedProviderExecutions(reconciliationReport)
	const rows = (exportReport.accounts || []).flatMap(account => (account.rows || []).map(row => ({
		...row,
		accountId: asId(account.accountId),
		tags: account.tags || row.tags || {},
	})))
	const byExecution = new Map()
	for (const row of rows) {
		const ids = Array.isArray(row.providerExecutionIds) ? row.providerExecutionIds.map(asId).filter(Boolean) : []
		for (const id of ids) byExecution.set(id, [...(byExecution.get(id) || []), row])
	}
	const expectedIds = new Set(expected.map(item => item.providerExecutionId))
	const duplicateExpectedIds = [...expectedIds].filter(id => (byExecution.get(id) || []).length !== 1)
	const missingIds = expected.filter(item => !(byExecution.get(item.providerExecutionId) || []).length).map(item => item.providerExecutionId)
	const mismatchedGpuSeconds = expected.filter(item => {
		const row = byExecution.get(item.providerExecutionId)?.[0]
		return !row || asNumber(row.gpuSeconds) === null || Math.abs(Number(row.gpuSeconds) - item.gpuSeconds) > 0.01
	}).map(item => item.providerExecutionId)
	const requiredTags = rows.every(row => row.tags?.product === 'betterpptx' && row.tags?.service === 'avatar-worker' && row.tags?.pipeline === 'liveportrait-musetalk' && row.tags?.account === row.accountId)
	const noUnexpectedIds = [...byExecution.keys()].every(id => expectedIds.has(id))
	const completeWindow = exportReport.coverage?.complete === true
	const checks = {
		redactedExportSchema: exportReport.schemaVersion === 'betterpptx.avatar-provider-billing-export.v1',
		windowDeclared: Boolean(exportReport.window?.start && exportReport.window?.end),
		expectedExecutionsLoaded: expected.length > 0,
		requestAttributionPresent: rows.length > 0 && byExecution.size > 0,
		allExpectedExecutionsJoined: missingIds.length === 0 && duplicateExpectedIds.length === 0,
		noUnexpectedExecutionIds: noUnexpectedIds,
		gpuSecondsMatch: mismatchedGpuSeconds.length === 0,
		stableTagsMatch: requiredTags,
		fullWindowCoverageProven: completeWindow,
	}
	const pass = Object.values(checks).every(Boolean)
	return {
		status: pass ? 'PASS_OWNER_EXPORT_READY' : 'OPEN_COVERAGE_INCOMPLETE',
		checks,
		missingExecutionIds: missingIds,
		duplicateOrAmbiguousExecutionIds: duplicateExpectedIds,
		mismatchedGpuSeconds,
		expectedExecutionCount: expected.length,
		exportRowCount: rows.length,
		ownerApprovalRequired: true,
		interpretation: pass
			? 'The redacted owner export joins every captured execution to a tagged billed row and explicitly attests complete window coverage. Owner approval is still required.'
			: 'The export is not sufficient for reconciliation; the gate remains fail-closed and no cost is allocated.',
	}
}
