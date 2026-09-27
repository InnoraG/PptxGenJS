#!/usr/bin/env node
// Maintainer-only fail-closed check for the owner-approved aggregate billing policy.
// It never turns incomplete shared-App coverage into a pass and never exposes secrets.
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('betterpptx-mcp', 'outputs')
const outputPath = path.join(root, 'avatar-provider-billing-aggregate-policy-report.json')
const workerPath = path.join(root, 'private-avatar-worker-canary-all.json')
const snapshotPaths = [
	path.join(root, 'avatar-modal-billing-snapshot-telcomgapp-current.json'),
	path.join(root, 'avatar-modal-billing-snapshot-fluxworkerai-current.json'),
]
const policyPath = path.resolve('betterpptx-mcp', 'docs', 'release-safety', 'AVATAR-PROVIDER-BILLING-RECONCILIATION-POLICY.md')

function read(filePath) {
	try { return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')) } catch { return null }
}
function roundUsd(value) { return Math.round(Number(value || 0) * 100000000) / 100000000 }
function within(iso, start, end) {
	const time = Date.parse(String(iso || ''))
	return Number.isFinite(time) && time >= Date.parse(start) && time < Date.parse(end)
}

const worker = read(workerPath)
const snapshots = snapshotPaths.map(read)
const policyPresent = fs.existsSync(policyPath)
const results = []
for (const snapshot of snapshots) {
	const accountId = String(snapshot?.accountId || '')
	const start = snapshot?.window?.start
	const end = snapshot?.window?.end
	const rows = Array.isArray(snapshot?.buckets) ? snapshot.buckets.filter(row =>
		row?.tags?.product === 'betterpptx' && row?.tags?.service === 'avatar-worker' &&
		row?.tags?.pipeline === 'liveportrait-musetalk' && row?.tags?.account === accountId &&
		Number(row?.costByResource?.A10G || 0) > 0
	) : []
	const sharedRows = rows.filter(row => String(row.description || '').startsWith('svc-'))
	const events = Array.isArray(worker?.results) ? worker.results.filter(item =>
		String(item?.accountId || '') === accountId && item?.status === 'PASS' &&
		within(worker?.capturedAt, start, end) && Number(item?.gpuSeconds || 0) > 0 &&
		Array.isArray(item?.providerExecutionIds) && item.providerExecutionIds.length > 0
	) : []
	const providerA10gCostUsd = roundUsd(sharedRows.reduce((sum, row) => sum + Number(row.costByResource?.A10G || 0), 0))
	const totalGpuSeconds = events.reduce((sum, event) => sum + Number(event.gpuSeconds || 0), 0)
	const allocationRateUsdPerGpuSecond = totalGpuSeconds > 0 ? providerA10gCostUsd / totalGpuSeconds : 0
	const allocations = events.map(event => ({
		providerExecutionIds: event.providerExecutionIds,
		gpuSeconds: Number(event.gpuSeconds || 0),
		allocatedCostUsd: roundUsd(allocationRateUsdPerGpuSecond * Number(event.gpuSeconds || 0)),
	}))
	const allocatedCostUsd = roundUsd(allocations.reduce((sum, event) => sum + event.allocatedCostUsd, 0))
	results.push({
		accountId,
		window: snapshot?.window || null,
		sharedRows: sharedRows.map(row => ({ description: row.description, objectIdHash: row.objectIdHash, a10gCostUsd: Number(row.costByResource?.A10G || 0), tags: row.tags || {} })),
		metrologyEventCount: events.length,
		totalGpuSeconds,
		providerA10gCostUsd,
		allocationRateUsdPerGpuSecond: Number(allocationRateUsdPerGpuSecond.toFixed(12)),
		allocations,
		allocatedCostUsd,
		checks: {
			sharedAppRowMatched: sharedRows.length === 1,
			metrologyEventsPresent: events.length > 0,
			allocationBalancesToProviderRow: providerA10gCostUsd > 0 && Math.abs(providerA10gCostUsd - allocatedCostUsd) <= 0.01,
			fullWindowCoverageProven: false,
		},
	})
}

const report = {
	schemaVersion: 'betterpptx.avatar-provider-billing-aggregate-policy.v1',
	status: policyPresent && results.length === 2 && results.every(item => item.checks.sharedAppRowMatched && item.checks.metrologyEventsPresent && item.checks.allocationBalancesToProviderRow && item.checks.fullWindowCoverageProven)
		? 'PASS_OWNER_APPROVAL_REQUIRED'
		: 'PARTIAL_POLICY_READY',
	policy: { path: path.relative(process.cwd(), policyPath), ownerApproved: false },
	accounts: results,
	checks: {
		policyPresent,
		sharedAppRowsMatched: results.length === 2 && results.every(item => item.checks.sharedAppRowMatched),
		metrologyEventsPresent: results.length === 2 && results.every(item => item.checks.metrologyEventsPresent),
		allocationBalancesToProviderRows: results.length === 2 && results.every(item => item.checks.allocationBalancesToProviderRow),
		fullWindowCoverageProven: false,
		ownerApprovalRecorded: false,
	},
	interpretation: 'The aggregate allocation math is available and bounded, but the current shared App hour includes activity not represented by the two latest canary events. Coverage remains fail-closed until the durable metrology ledger is complete or the owner supplies an approved provider request export.',
	ownerAction: 'Approve the aggregate policy only after a durable per-App/hour metrology ledger proves complete coverage, or provide a native provider request-attributed export.',
	rawSecretsPrinted: false,
	customerData: false,
}
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
