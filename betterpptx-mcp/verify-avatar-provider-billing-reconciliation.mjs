#!/usr/bin/env node
// Maintainer-only contract check for provider compute metrology.  It proves that
// first executions consume worker GPU headers and terminal broker replays do not
// create a second compute charge.  It deliberately does not claim provider
// invoice reconciliation, which requires owner-controlled provider billing data.
import fs from 'node:fs'
import path from 'node:path'
import { avatarProviderUsageFromHeaders } from './avatar/providers/musetalkHttp.mjs'
import { snapshotsMatchServingRevision } from './billing/revision-binding.mjs'

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

const outputPath = path.resolve('betterpptx-mcp', 'outputs', 'avatar-provider-billing-reconciliation-report.json')
const snapshotPaths = [
	path.resolve('betterpptx-mcp', 'outputs', 'avatar-modal-billing-snapshot-telcomgapp-current.json'),
	path.resolve('betterpptx-mcp', 'outputs', 'avatar-modal-billing-snapshot-fluxworkerai-current.json'),
]
const finalCommercialSnapshotPaths = [
	path.resolve('betterpptx-mcp', 'outputs', 'avatar-modal-billing-snapshot-active-window-telcomgapp-20260729-fresh.json'),
	path.resolve('betterpptx-mcp', 'outputs', 'avatar-modal-billing-snapshot-active-window-fluxworkerai-20260729-fresh.json'),
]
const historicalCommercialSnapshotPaths = [
	path.resolve('betterpptx-mcp', 'outputs', 'avatar-modal-billing-snapshot-commercial-window-telcomgapp-20260726.json'),
	path.resolve('betterpptx-mcp', 'outputs', 'avatar-modal-billing-snapshot-commercial-window-fluxworkerai-20260726.json'),
]
const workerCanaryPaths = [
	path.resolve('betterpptx-mcp', 'outputs', 'private-avatar-worker-canary-telcomgapp.json'),
	path.resolve('betterpptx-mcp', 'outputs', 'private-avatar-worker-canary-fluxworkerai.json'),
]
const workerCanaryAllPath = path.resolve('betterpptx-mcp', 'outputs', 'private-avatar-worker-canary-all.json')
const mcpCanaryPath = path.resolve('betterpptx-mcp', 'outputs', 'private-avatar-mcp-canary-report.json')
const isolatedBillingPaths = [
	path.resolve('betterpptx-mcp', 'outputs', 'avatar-modal-isolated-billing-telcomgapp-iso2.json'),
	path.resolve('betterpptx-mcp', 'outputs', 'avatar-modal-isolated-billing-fluxworkerai-iso2.json'),
]
const aggregatePolicyPath = path.resolve('betterpptx-mcp', 'outputs', 'avatar-provider-billing-aggregate-policy-report.json')
const deployedRevisionPath = path.resolve('betterpptx-mcp', 'outputs', 'avatar-deployed-revision-report.json')
function readSnapshot(filePath) {
	try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch { return null }
}
const deployedRevision = readSnapshot(deployedRevisionPath)
const activeServingRevision = deployedRevision?.activeRevision || deployedRevision?.servingRevision || 'UNKNOWN'
try {
	const first = avatarProviderUsageFromHeaders(new Headers({
		'X-Gpu-Seconds': '91.25',
		'X-Render-Seconds': '80.92',
		'X-Gpu-Type': 'A10G',
		'X-Pipeline': 'liveportrait-musetalk',
		'X-Idempotency-State': 'completed',
	}))
	const replay = avatarProviderUsageFromHeaders(new Headers({
		'X-Pipeline': 'replay',
		'X-Idempotency-State': 'completed',
	}))
	const conflict = avatarProviderUsageFromHeaders(new Headers({
		'X-Idempotency-State': 'conflict',
	}))
	expect(first.isProviderCompute === true && first.gpuSeconds === 91.25 && first.renderSeconds === 80.92, 'First provider execution must capture GPU/render seconds.', { first })
	expect(first.pipeline === 'liveportrait-musetalk' && first.gpuType === 'A10G', 'First execution must preserve non-secret provider metrology labels.', { first })
	expect(replay.isTerminalReplay === true && replay.isProviderCompute === false && replay.gpuSeconds === 0, 'Terminal broker replay must not report a second provider compute charge.', { replay })
	expect(conflict.isProviderCompute === false && conflict.gpuSeconds === 0, 'Conflict responses must not report provider compute.', { conflict })
	const snapshots = snapshotPaths.map(readSnapshot).filter(Boolean)
	const finalCommercialSnapshots = finalCommercialSnapshotPaths.map(readSnapshot).filter(Boolean)
	const finalCommercialWindowRevisionMatched = snapshotsMatchServingRevision(finalCommercialSnapshots, activeServingRevision, finalCommercialSnapshotPaths.length)
	const workerAll = readSnapshot(workerCanaryAllPath)
	const workerCanaries = workerAll?.status === 'research-live-pass' && Array.isArray(workerAll.results) && workerAll.results.length === 2
		? workerAll.results.map(result => ({ ...workerAll, results: [result] }))
		: workerCanaryPaths.map(readSnapshot).filter(Boolean)
	const mcpCanary = readSnapshot(mcpCanaryPath)
	const isolatedBilling = isolatedBillingPaths.map(readSnapshot).filter(Boolean)
	const aggregatePolicy = readSnapshot(aggregatePolicyPath)
	const modalBillingExportObserved = snapshots.length === snapshotPaths.length && snapshots.every(snapshot => snapshot.checks?.billingExportObserved === true)
	const modalA10gResourceRowsObserved = modalBillingExportObserved && snapshots.every(snapshot => snapshot.checks?.a10gResourceObserved === true)
	const finalCommercialBillingExportObserved = finalCommercialSnapshots.length === finalCommercialSnapshotPaths.length && finalCommercialSnapshots.every(snapshot => snapshot.checks?.billingExportObserved === true)
	const finalCommercialA10gResourceRowsObserved = finalCommercialBillingExportObserved && finalCommercialSnapshots.every(snapshot => snapshot.checks?.a10gResourceObserved === true)
	const finalCommercialStableTagsObserved = finalCommercialBillingExportObserved && finalCommercialSnapshots.every(snapshot => {
		const buckets = Array.isArray(snapshot.buckets) ? snapshot.buckets : []
		return buckets.some(bucket => bucket.tags?.product === 'betterpptx' && bucket.tags?.service === 'avatar-commercial-eval' && ['upstream-liveportrait-insightface-musetalk-bisenet', 'upstream-liveportrait-musetalk-restoreformer-pp'].includes(bucket.tags?.pipeline) && bucket.tags?.release === 'production-candidate')
	})
	const stableAppTagsObserved = modalBillingExportObserved && snapshots.every(snapshot => {
		const buckets = Array.isArray(snapshot.buckets) ? snapshot.buckets : []
		return buckets.some(bucket => bucket.tags?.product === 'betterpptx' && bucket.tags?.service === 'avatar-worker' && bucket.tags?.pipeline === 'liveportrait-musetalk' && bucket.tags?.account === snapshot.accountId)
	})
	const perRequestAttribution = modalBillingExportObserved && snapshots.every(snapshot => snapshot.checks?.perRequestAttribution === true)
	const finalCommercialPerRequestAttribution = finalCommercialBillingExportObserved && finalCommercialSnapshots.every(snapshot => snapshot.checks?.perRequestAttribution === true)
	const isolatedPerRunObjectAttribution = isolatedBilling.length === isolatedBillingPaths.length && isolatedBilling.every(report =>
		report.status === 'PARTIAL_ATTRIBUTION_PASS' &&
		report.checks?.workerHttp200 === true &&
		report.checks?.validMp4 === true &&
		report.checks?.uniqueProviderObjectMatched === true &&
		report.checks?.stableAccountPipelineTagsMatched === true &&
		report.checks?.requestAttribution === false &&
		report.cleanupCompleted === true &&
		report.workerProbe?.pipeline === 'liveportrait-musetalk'
	)
	const isolatedPerRunInvoiceJoin = isolatedBilling.length === isolatedBillingPaths.length && isolatedBilling.every(report =>
		report.checks?.isolatedInvoiceJoin === true &&
		Array.isArray(report.providerExecutionIds) && report.providerExecutionIds.length === 1 &&
		report.providerRows?.length === 1 && report.cleanupCompleted === true
	)
	const aggregatePolicyReady = aggregatePolicy?.status === 'PARTIAL_POLICY_READY' &&
		aggregatePolicy.checks?.policyPresent === true &&
		aggregatePolicy.checks?.sharedAppRowsMatched === true &&
		aggregatePolicy.checks?.metrologyEventsPresent === true &&
		aggregatePolicy.checks?.allocationBalancesToProviderRows === true &&
		aggregatePolicy.checks?.fullWindowCoverageProven === false
	const requestExecutionIdsCaptured = workerCanaries.length === workerCanaryPaths.length &&
		workerCanaries.every(report => Array.isArray(report.results?.[0]?.providerExecutionIds) && report.results[0].providerExecutionIds.length > 0) &&
		Array.isArray(mcpCanary?.providerExecutionIds) && mcpCanary.providerExecutionIds.length > 0
	const capturedWorkerUsage = workerCanaries.map(report => ({
		accountId: report.results?.[0]?.accountId || null,
		capturedAt: report.capturedAt || null,
		gpuType: report.results?.[0]?.gpuType || null,
		gpuSeconds: Number(report.results?.[0]?.gpuSeconds || 0) || 0,
		videoDigest: report.results?.[0]?.digest || null,
		providerExecutionIds: Array.isArray(report.results?.[0]?.providerExecutionIds) ? report.results[0].providerExecutionIds : [],
	}))
	const modalWindowUsage = snapshots.map(snapshot => ({
		accountId: snapshot.accountId || null,
		window: snapshot.window || null,
		tags: snapshot.buckets?.[0]?.tags || {},
		a10gCost: snapshot.buckets?.reduce((sum, bucket) => sum + Number(bucket.costByResource?.A10G || 0), 0) || 0,
	}))
	const report = {
		schemaVersion: 'betterpptx.avatar-provider-billing-reconciliation.v1',
		status: 'PARTIAL',
		historicalEvidenceLane: 'liveportrait-musetalk-resale-safe-rollback',
		finalProductionLane: 'liveportrait-musetalk-commercial',
		finalServingRevision: activeServingRevision,
		finalProductionWindowStatus: finalCommercialBillingExportObserved && finalCommercialWindowRevisionMatched
			? 'OPEN_OWNER_APPROVAL_AND_REQUEST_ATTRIBUTION_REQUIRED'
			: finalCommercialBillingExportObserved
			? 'OPEN_OWNER_FINAL_WINDOW_EXPORT_REQUIRED'
			: 'OPEN_OWNER_FINAL_WINDOW_EXPORT_REQUIRED',
		checks: {
			firstExecutionGpuHeadersCaptured: true,
			firstExecutionRenderHeadersCaptured: true,
			replayNoSecondComputeCharge: true,
			conflictNoComputeCharge: true,
			modalBillingExportObserved,
			modalA10gResourceRowsObserved,
			finalCommercialBillingExportObserved,
			finalCommercialA10gResourceRowsObserved,
			finalCommercialStableTagsObserved,
			stableAppTagsObserved,
			isolatedPerRunObjectAttribution,
			isolatedPerRunInvoiceJoin,
			aggregatePolicyReady,
			requestExecutionIdsCaptured,
			providerInvoiceReconciled: finalCommercialBillingExportObserved && finalCommercialWindowRevisionMatched && finalCommercialPerRequestAttribution,
			finalCommercialWindowRevisionMatched,
		},
			evidence: {
			snapshots: snapshotPaths.map(filePath => path.relative(process.cwd(), filePath)),
			finalCommercialSnapshots: finalCommercialSnapshotPaths.map(filePath => path.relative(process.cwd(), filePath)),
			historicalFinalCommercialSnapshots: historicalCommercialSnapshotPaths.map(filePath => path.relative(process.cwd(), filePath)),
			capturedWorkerUsage,
			modalWindowUsage,
			finalCommercialWindowUsage: finalCommercialSnapshots.map(snapshot => ({
				accountId: snapshot.accountId || null,
				window: snapshot.window || null,
				tags: snapshot.buckets?.[0]?.tags || {},
				a10gCost: snapshot.buckets?.reduce((sum, bucket) => sum + Number(bucket.costByResource?.A10G || 0), 0) || 0,
			})),
			mcpCanary: mcpCanary ? {
				pptxDigest: mcpCanary.package?.digest || null,
				providerExecutionIds: Array.isArray(mcpCanary.providerExecutionIds) ? mcpCanary.providerExecutionIds : [],
				powerPointOpen: mcpCanary.powerPoint?.status === 'PASS',
			} : null,
			isolatedBilling: isolatedBilling.map(report => ({
				accountId: report.accountId || null,
				appName: report.isolatedAppName || null,
				providerExecutionIds: Array.isArray(report.providerExecutionIds) ? report.providerExecutionIds : [],
				workerDigest: report.workerProbe?.sha256 || null,
				gpuSeconds: Number(report.workerProbe?.gpuSeconds || 0) || 0,
				providerA10gCost: Number(report.providerA10gCost || 0) || 0,
				objectIdHash: report.providerRows?.[0]?.objectIdHash || null,
				cleanupCompleted: report.cleanupCompleted === true,
			})),
			perRequestAttribution,
			finalCommercialPerRequestAttribution,
			isolatedPerRunObjectAttribution,
			isolatedPerRunInvoiceJoin,
			aggregatePolicy: aggregatePolicy ? {
				status: aggregatePolicy.status,
				checks: aggregatePolicy.checks,
				path: path.relative(process.cwd(), aggregatePolicyPath),
			} : null,
			requestExecutionIdsCaptured,
			stableAppTagsObserved,
			interpretation: finalCommercialBillingExportObserved && !finalCommercialWindowRevisionMatched
				? `Commercial App/hour exports are observed for both rotated profiles, but the available window does not identify active serving revision ${activeServingRevision}. A fresh complete-window export tied to the active revision is required before request attribution or aggregate allocation approval can close billing.`
				: finalCommercialBillingExportObserved && !finalCommercialPerRequestAttribution
				? 'Final commercial App/hour exports for the matched production-candidate window are observed for both rotated profiles with stable upstream commercial tags. The exports remain app/hour/resource scoped and do not carry request attribution, so owner approval and request-level attribution (or an explicitly approved aggregate policy) are still required.'
				: perRequestAttribution
				? 'Provider export carries request-level attribution for the captured worker executions.'
				: aggregatePolicyReady
					? 'The owner-approved aggregate policy and allocation math are ready: current shared App rows match stable tags and the captured events balance to each exported A10G row. Full-window metrology coverage is still unproven, so the shared-App billing gate remains open.'
				: isolatedPerRunInvoiceJoin
					? 'Each isolated canary now joins exactly one captured Modal FunctionCall ID to one unique billed App/object A10G row. The shared production App remains interval-scoped, so this bounded per-run invoice proof does not yet close shared-App request attribution.'
				: requestExecutionIdsCaptured
					? 'The worker and private MCP canary now capture opaque Modal FunctionCall IDs for the final MuseTalk GPU execution. Shared Modal billing exports still aggregate cost by App/object and interval, so an owner provider export must still join those IDs to invoice rows before billing can be marked reconciled.'
				: isolatedPerRunObjectAttribution
					? 'Shared Modal exports carry stable product/service/pipeline/account App tags at app/hour/resource scope; isolated one-canary Apps now reconcile to unique provider objects and A10G rows, but provider request IDs remain unavailable.'
				: stableAppTagsObserved
					? 'Modal export now carries stable product/service/pipeline/account App tags, but remains app/hour/resource scoped and has no request IDs; it cannot yet prove which invoice rows belong to individual canaries.'
					: 'Modal export is observed at app/hour/resource granularity, but does not carry request IDs; it cannot yet prove which invoice rows belong to the captured canaries.',
		},
		ownerAction: finalCommercialBillingExportObserved && !finalCommercialWindowRevisionMatched
			? `Owner provide a complete redacted commercial App/hour export tied to active revision ${activeServingRevision}; then either provide native request attribution or explicitly approve the documented aggregate allocation policy before launch.`
			: finalCommercialBillingExportObserved && !finalCommercialPerRequestAttribution
			? `Owner review the final commercial App/hour exports for revision ${activeServingRevision} and either provide native request attribution or explicitly approve the documented aggregate allocation policy before launch.`
			: perRequestAttribution
			? 'Owner review the reconciled request-level provider export and sign off the billing evidence.'
			: aggregatePolicyReady
				? 'Owner approve the aggregate allocation policy only after durable per-App/hour metrology coverage is proven, or provide native provider request attribution.'
			: isolatedPerRunInvoiceJoin
					? 'Owner review the isolated per-run FunctionCall-to-invoice joins, then obtain shared-production App request attribution (or approve an aggregate cost reconciliation policy) before launch.'
				: requestExecutionIdsCaptured
				? 'Owner export provider billing/log data that can join the captured Modal FunctionCall IDs to billed App/object intervals and reconcile those rows to X-Gpu-Seconds/render headers before public launch.'
				: isolatedPerRunObjectAttribution
					? 'Owner obtain native request-level Modal/provider attribution (request IDs or equivalent) and reconcile it to X-Gpu-Seconds/render headers before public launch; isolated per-run object evidence is bounded but does not close the request-level gate.'
				: 'Obtain a request-attributed Modal/provider export (or an isolated per-run provider object) and reconcile it to the captured X-Gpu-Seconds/render headers before public launch; stable App tags alone are not request attribution.',
		rawSecretsPrinted: false,
		customerData: false,
	}
	fs.mkdirSync(path.dirname(outputPath), { recursive: true })
	fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
	console.log(JSON.stringify(report, null, 2))
} catch (error) {
	const report = {
		schemaVersion: 'betterpptx.avatar-provider-billing-reconciliation.v1',
		status: 'BLOCKED',
		checks: {},
		error: { code: 'VERIFY_FAILED', message: error?.message || String(error), details: error?.details || {} },
		rawSecretsPrinted: false,
		customerData: false,
	}
	fs.mkdirSync(path.dirname(outputPath), { recursive: true })
	fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
	console.error(JSON.stringify(report, null, 2))
	process.exitCode = 2
}
