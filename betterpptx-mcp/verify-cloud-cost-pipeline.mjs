import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { buildCatalogSnapshot } from './fetch-cloud-cost-catalog.mjs'
import { runCostMetrologyHarness } from './run-cost-metrology-harness.mjs'
import { reconcileCostMetrology } from './reconcile-cost-metrology.mjs'
import { exportMetrologyLogs } from './export-cloud-run-metrology-logs.mjs'
import { exportMonitoringSummary } from './export-cloud-monitoring-summary.mjs'
import { exportBillingSummary } from './export-bigquery-billing-summary.mjs'
import { exportDeployMetadata } from './export-cloud-run-deploy-metadata.mjs'
import { exportGitProvenance } from './export-git-provenance.mjs'
import { verifySourceManifest } from './verify-cloud-cost-source-manifest.mjs'

const outDir = path.resolve('outputs', 'cloud-cost-pipeline-verify', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outDir, { recursive: true })

const sourceManifest = verifySourceManifest()
assert(sourceManifest.requiredFileCount >= 20, 'source isolation manifest must cover all metrology files')

const reviewedPrices = {
	cloudRun: { vcpuUsdPerSecond: 0.000024, gibUsdPerSecond: 0.0000025, requestUsdPerMillion: 0.4 },
	gcs: { classAUsdPer1000: 0.005, classBUsdPer1000: 0.0004, storageUsdPerGibMonth: 0.02, egressUsdPerGib: 0.12 },
	firestore: { readUsdPer100k: 0.03, writeUsdPer100k: 0.09, deleteUsdPer100k: 0.01 },
	external: { ttsUsdPerMillionCharacters: 4, avatarUsdPerGpuSecond: 0.0001, otherUsdPerCall: 0 },
	source: { reference: 'https://cloud.google.com/run/pricing (reviewed 2026-06-18)' },
}

// 1. Catalog: instance_based has cpuAlwaysAllocated true and validates strictly.
const catalog = buildCatalogSnapshot({ prices: reviewedPrices, region: 'us-central1', billingMode: 'instance_based' })
assert.equal(catalog.cloudRunBillingMode, 'instance_based')
assert.equal(catalog.cpuAlwaysAllocated, true)
assert.match(catalog.digest, /^[a-f0-9]{64}$/)
const catalogFile = path.join(outDir, 'catalog.json')
fs.writeFileSync(catalogFile, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')

// 2. Harness over synthetic rows: cost rows carry billing mode + B3 split.
const harness = runCostMetrologyHarness({
	catalog: catalogFile, outDir: path.join(outDir, 'harness'), resourceRows: [],
	syntheticFixture: true, buildMatrix: false, serviceVcpu: 1, serviceMemoryGiB: 2, artifactRetentionDays: 1,
})
const costRows = fs.readFileSync(harness.costRowsFile, 'utf8').trim().split(/\r?\n/).map(l => JSON.parse(l))
assert(costRows.every(r => r.cloudRunBillingMode === 'instance_based'), 'cost rows pinned to instance_based')
assert(costRows.every(r => r.breakdownUsd.cloudRunRequestUsd === 0), 'instance_based: no per-request fee')
assert(costRows.every(r => r.amortizableInstanceUsd !== undefined && r.requestLinearUsd !== undefined), 'B3 split present on rows')

// 3. Overhead-augmented reconcile (the M7 fix): under instance_based the raw L1 is small vs L3.
//    Without overhead the run fails tolerance; with measured overhead it reconciles.
const monFile = path.join(outDir, 'monitoring.json')
const billFile = path.join(outDir, 'billing.json')
const ohFile = path.join(outDir, 'overhead-in.json')
fs.writeFileSync(monFile, JSON.stringify({ totalUsd: 10.0, window: { start: 'a', end: 'b' } }), 'utf8')
fs.writeFileSync(billFile, JSON.stringify({ grossCostUsd: 10.0, creditsUsd: 10.0, netCostUsd: 0, window: { start: 'a', end: 'b' } }), 'utf8')
// small per-op L1 fixture
const smallRowsFile = path.join(outDir, 'small-cost-rows.ndjson')
fs.writeFileSync(smallRowsFile, [{ measuredUsd: 1.0, amortizableInstanceUsd: 0.5, requestLinearUsd: 0.5, cloudRunBillingMode: 'instance_based' }, { measuredUsd: 1.0, amortizableInstanceUsd: 0.5, requestLinearUsd: 0.5, cloudRunBillingMode: 'instance_based' }].map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8')

const withoutOverhead = reconcileCostMetrology({ costRowsFile: smallRowsFile, monitoringFile: monFile, billingExportFile: billFile, toleranceRatio: 0.10 })
assert.equal(withoutOverhead.reconciliation.l1RawUsd, 2.0)
assert.equal(withoutOverhead.ok, false, 'raw L1 (2) vs L3 (10) must fail tolerance under instance_based')
assert.equal(withoutOverhead.overhead.allocationPolicy, 'residual-unattributed')

fs.writeFileSync(ohFile, JSON.stringify({ interRequestOverheadUsd: 8.0 }), 'utf8')
const withOverhead = reconcileCostMetrology({ costRowsFile: smallRowsFile, monitoringFile: monFile, billingExportFile: billFile, overheadFile: ohFile, overheadOutFile: path.join(outDir, 'overhead-allocation.json'), billingMode: 'instance_based', toleranceRatio: 0.10 })
assert.equal(withOverhead.reconciliation.overheadUsd, 8.0)
assert.equal(withOverhead.reconciliation.l1Usd, 10.0)
assert.equal(withOverhead.ok, true, 'L1(2)+overhead(8)=10 must reconcile with L3(10)')
assert.equal(withOverhead.l3.grossCostUsd, 10.0, 'reconcile uses gross cost')
assert(fs.existsSync(path.join(outDir, 'overhead-allocation.json')), 'overhead-allocation.json written')

// 4. L1 log exporter round-trip via input-file (offline replay).
const rawLogs = path.join(outDir, 'raw-logs.json')
fs.writeFileSync(rawLogs, JSON.stringify([
	{ jsonPayload: { schemaVersion: 'betterpptx.metrology.v1', metricType: 'betterpptx.resource_measurement', workload: 'run-A', service: 'svc', wallMs: 12, cpuUsec: 5000 } },
	{ jsonPayload: { schemaVersion: 'betterpptx.metrology.v1', metricType: 'betterpptx.resource_measurement', workload: 'run-B', service: 'svc' } },
]), 'utf8')
const l1Out = path.join(outDir, 'l1', 'resource-meter.ndjson')
const l1Res = exportMetrologyLogs({ project: 'p', region: 'us-central1', service: 'svc', runId: 'run-A', start: 'a', end: 'b', outFile: l1Out, inputFile: rawLogs })
assert.equal(l1Res.acceptedCount, 1, 'only run-A row accepted')
assert.equal(l1Res.rejectedCount, 1)
assert(fs.existsSync(l1Out) && fs.existsSync(l1Res.queryFile))

// 5. L2 monitoring summary via input-file.
const l2In = path.join(outDir, 'mon-agg.json')
fs.writeFileSync(l2In, JSON.stringify({ requestCount: 100, cpuAllocationVcpuSeconds: 50, memoryAllocationGibSeconds: 100 }), 'utf8')
const l2Out = path.join(outDir, 'l2', 'cloud-monitoring-summary.json')
const l2 = exportMonitoringSummary({ project: 'p', region: 'us-central1', service: 'svc', runId: 'run-A', start: 'a', end: 'b', catalogFile, outFile: l2Out, inputFile: l2In })
assert.equal(l2.cloudRunRequestUsd, 0, 'instance_based L2 has no request fee')
assert(l2.totalUsd > 0)

// 6. L3 billing summary via input-file; fail-closed on missing run id.
const l3In = path.join(outDir, 'bill-rows.json')
fs.writeFileSync(l3In, JSON.stringify([{ service: 'Cloud Run', sku: 'CPU Allocation Time', gross_cost: 3.0, credit_total: -3.0, net_cost: 0, line_items: 5 }]), 'utf8')
const l3Out = path.join(outDir, 'l3', 'bigquery-billing-summary.json')
const l3 = exportBillingSummary({ project: 'p', dataset: 'd', table: 't', runId: 'run-A', start: 'a', end: 'b', minGrossUsdSignal: 1, outFile: l3Out, inputFile: l3In })
assert.equal(l3.grossCostUsd, 3.0)
assert.equal(l3.netCostUsd, 0)
assert.equal(l3.grossSignalOk, true)
assert.throws(() => exportBillingSummary({ project: 'p', dataset: 'd', table: 't', runId: '', start: 'a', end: 'b', outFile: l3Out, inputFile: l3In }), /runId is required/)

// 7. Deploy metadata provenance: reject the real failed class (storage tarball + Ready=False),
//    accept git-backed Ready=True service with shared stores and immutable digest.
const failedBuildFile = path.join(outDir, 'failed-build.json')
const failedServiceFile = path.join(outDir, 'failed-service.json')
fs.writeFileSync(failedBuildFile, JSON.stringify({ id: 'bad-build', source: { storageSource: { bucket: 'b', object: 'source.tgz' } }, results: { images: [{ digest: `sha256:${'a'.repeat(64)}` }] } }), 'utf8')
fs.writeFileSync(failedServiceFile, JSON.stringify({
	metadata: { name: 'svc', labels: { betterpptx_topology: 'serial-baseline' } },
	status: { latestCreatedRevisionName: 'svc-00001-bad', conditions: [{ type: 'Ready', status: 'False', reason: 'HealthCheckContainerError' }] },
	spec: { template: { spec: { containerConcurrency: 1, containers: [{ image: `img@sha256:${'a'.repeat(64)}`, env: [{ name: 'BETTERPPTX_REQUIRE_SHARED_STORES', value: '1' }] }] }, metadata: { labels: { betterpptx_topology: 'serial-baseline' } } } },
}), 'utf8')
assert.throws(
	() => exportDeployMetadata({ project: 'p', region: 'us-central1', service: 'svc', outDir: path.join(outDir, 'deploy-bad'), buildInputFile: failedBuildFile, serviceInputFile: failedServiceFile }),
	error => ['CLOUD_RUN_NOT_READY', 'SOURCE_PROVENANCE_NOT_GIT', 'SHARED_STORE_CONFIG_INCOMPLETE'].includes(error?.code),
	'failed deploy metadata must be rejected before matrix adoption',
)

const goodBuildFile = path.join(outDir, 'good-build.json')
const goodServiceFile = path.join(outDir, 'good-service.json')
const goodDigest = `sha256:${'b'.repeat(64)}`
const goodEnv = [
	['BETTERPPTX_REQUIRE_SHARED_STORES', '1'],
	['BETTERPPTX_BILLING_LEDGER_STORE', 'firestore'],
	['BETTERPPTX_ENTITLEMENT_STORE', 'firestore'],
	['BETTERPPTX_INSTALL_USAGE_STORE', 'firestore'],
	['BETTERPPTX_CRYPTO_ORDER_STORE', 'firestore'],
	['BETTERPPTX_X402_STORE', 'firestore'],
	['BETTERPPTX_ARTIFACT_STORE', 'gcs'],
	['BETTERPPTX_GCS_BUCKET', 'bucket'],
].map(([name, value]) => ({ name, value }))
fs.writeFileSync(goodBuildFile, JSON.stringify({
	id: 'good-build',
	source: { connectedRepository: { repository: 'projects/p/locations/us-central1/connections/c/repositories/r', revision: 'main' } },
	substitutions: { COMMIT_SHA: 'c'.repeat(40) },
	results: { images: [{ digest: goodDigest, name: 'img:tag' }] },
}), 'utf8')
fs.writeFileSync(goodServiceFile, JSON.stringify({
	metadata: { name: 'svc', labels: { betterpptx_topology: 'serial-baseline' } },
	status: { url: 'https://svc.run.app', latestReadyRevisionName: 'svc-00002-good', conditions: [{ type: 'Ready', status: 'True' }] },
	spec: { template: { spec: { containerConcurrency: 1, containers: [{ image: `img@${goodDigest}`, env: goodEnv }] }, metadata: { labels: { betterpptx_topology: 'serial-baseline' } } } },
}), 'utf8')
const deploy = exportDeployMetadata({
	project: 'p',
	region: 'us-central1',
	service: 'svc',
	runId: 'run-A',
	outDir: path.join(outDir, 'deploy-good'),
	buildInputFile: goodBuildFile,
	serviceInputFile: goodServiceFile,
	provenance: { gitTreeClean: true },
})
assert.equal(deploy.sourceProvenance.cloudBuildSourceKind, 'git')
assert.equal(deploy.sourceProvenance.gitCommit, 'c'.repeat(40))
assert.equal(deploy.sourceProvenance.imageDigest, goodDigest)
assert.equal(deploy.deployMetadata.ready, true)
assert(fs.existsSync(deploy.files.sourceProvenance) && fs.existsSync(deploy.files.deployMetadata) && fs.existsSync(deploy.files.cloudBuildMetadata))
assert.equal(path.basename(deploy.files.deployMetadata), 'serial-baseline-deploy-metadata.json', 'deploy metadata filename must be topology-scoped')

// 8. Git provenance exporter writes exploratory evidence for dirty trees and fails closed for
//    matrix-grade provenance when this checkout is not clean.
const gitOut = path.join(outDir, 'verification', 'preflight-git-provenance.json')
const gitExploratory = exportGitProvenance({ outFile: gitOut, matrixGrade: false })
assert.match(gitExploratory.gitCommit, /^[0-9a-f]{40}$/i)
assert(fs.existsSync(gitOut), 'preflight git provenance artifact written')
if (!gitExploratory.gitTreeClean) {
	assert.throws(
		() => exportGitProvenance({ outFile: path.join(outDir, 'verification', 'matrix-grade-git-provenance.json'), matrixGrade: true }),
		error => error?.code === 'GIT_TREE_NOT_CLEAN',
		'dirty tree must fail matrix-grade git provenance',
	)
}

console.log('CLOUD COST PIPELINE: PASS (catalog→harness→reconcile+overhead→L1/L2/L3 exporters; deploy provenance/readiness validated; instance_based overhead reconcile validated)')
