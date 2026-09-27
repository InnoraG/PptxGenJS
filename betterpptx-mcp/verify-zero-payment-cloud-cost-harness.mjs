import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

import {
	validateCloudBillingCatalogSnapshot,
	estimateResourceRowCost,
	CostModelError,
} from './billing/cost-model.mjs'
import {
	assertZeroPayment,
	assertSharedStoreEnv,
	cloudBuildSourceKind,
	assertMatrixGradeSourceProvenance,
	assertCloudRunReady,
	resolveTopologyEnvelope,
	planWorkloads,
	buildManifest,
	CostHarnessError,
} from './run-cloud-cost-metrology-suite.mjs'
import { normalizeMetrologyLogEntries } from './export-cloud-run-metrology-logs.mjs'
import { summarizeMonitoring } from './export-cloud-monitoring-summary.mjs'
import { exportBillingSummary, summarizeBillingRows, buildBillingQuery } from './export-bigquery-billing-summary.mjs'
import { buildChargingMatrixFromFiles } from '../tools/build-charging-matrix.mjs'
import { validateChargingMatrix, assertMatrixAdoptable, measuredMatrixToRateCard } from './billing/charging-matrix.mjs'
import { previewRuntimeRateCard } from './preview-runtime-rate-card.mjs'
import { logToolEnd, logToolStart } from './logger.mjs'

const outDir = path.resolve('outputs', 'zero-payment-harness-verify', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outDir, { recursive: true })

function throwsCode(fn, code, label) {
	const re = new RegExp(code, 'i')
	assert.throws(fn, err => (err?.code === code) || (err?.code && re.test(err.code)) || (err instanceof Error && re.test(err.message)), label)
}

const baseCatalog = {
	schemaVersion: 'betterpptx.cloud-cost-catalog.v1',
	currency: 'USD',
	region: 'us-central1',
	effectiveAt: '2026-06-18T00:00:00.000Z',
	retrievedAt: '2026-06-18T00:00:00.000Z',
	source: { type: 'fixture', reference: 'verify-zero-payment' },
	cloudRun: { vcpuUsdPerSecond: 0.000024, gibUsdPerSecond: 0.0000025, requestUsdPerMillion: 0.4 },
	gcs: { classAUsdPer1000: 0.005, classBUsdPer1000: 0.0004, storageUsdPerGibMonth: 0.02, egressUsdPerGib: 0.12 },
	firestore: { readUsdPer100k: 0.03, writeUsdPer100k: 0.09, deleteUsdPer100k: 0.01 },
	external: { ttsUsdPerMillionCharacters: 4, avatarUsdPerGpuSecond: 0.0001, otherUsdPerCall: 0 },
}

// 1. Runner refuses if PayRam / card onramp / x402 quote enabled, or raw-send rail active.
throwsCode(() => assertZeroPayment({ env: { BETTERPPTX_PAYRAM_ENABLED: '1' } }), 'PAYMENT_RAIL_ENABLED', 'PayRam must block the runner')
throwsCode(() => assertZeroPayment({ env: { BETTERPPTX_REQUIRE_CARD_ONRAMP: '1' } }), 'PAYMENT_RAIL_ENABLED', 'card onramp must block')
throwsCode(() => assertZeroPayment({ env: { BETTERPPTX_RAW_SEND_RAIL: 'public' } }), 'RAW_SEND_RAIL_ENABLED', 'public raw-send must block')
// 2. Runner refuses if x402 settlement mode requested.
throwsCode(() => assertZeroPayment({ env: {}, flags: { x402Settle: true } }), 'PAYMENT_FLAG_REQUESTED', 'x402 settle flag must block')
assert.equal(assertZeroPayment({ env: { BETTERPPTX_RAW_SEND_RAIL: 'disabled' }, flags: {} }), true, 'clean env must pass')

// 3. Topology envelope: serial rejects non-serial scaling; production fails only when it exceeds
//    its envelope, not because it is non-serial.
throwsCode(() => resolveTopologyEnvelope({ topology: 'serial-baseline', concurrencyTarget: 8 }), 'SERIAL_ENVELOPE_VIOLATION', 'serial must reject concurrency>1')
const prod = resolveTopologyEnvelope({ topology: 'production-gateway', concurrencyTarget: 8, maxInstancesCap: 4, minInstancesTarget: 1 })
assert.equal(prod.serial, false)
assert.equal(prod.concurrency, 8)
throwsCode(() => resolveTopologyEnvelope({ topology: 'production-worker', concurrencyTarget: 1, maxInstancesCap: 1 }), 'PRODUCTION_ENVELOPE_INVALID', 'production with serial caps must fail')
assert.deepEqual(planWorkloads('W0,W3-smoke'), ['W0', 'W3-smoke'])
throwsCode(() => planWorkloads('W9'), 'WORKLOAD_UNKNOWN', 'unknown workload must fail')

// Manifest records zero-payment attestation and never enables settle/checkout/raw-send.
const manifest = buildManifest({
	runId: 'metrology-test', base: 'https://svc', project: 'p', region: 'us-central1',
	envelope: prod, billingMode: 'instance_based', workloads: ['W6'], minGrossUsdSignal: 1, maxGrossUsd: 5, dryRun: true,
})
assert.equal(manifest.zeroPayment.x402Settle, false)
assert.equal(manifest.zeroPayment.onChainRawSend, false)
assert.equal(manifest.cloudRunBillingMode, 'instance_based')

// 3b. Shared-store and provenance guards catch the failed 2026-06-18 Cloud Run class before workload execution.
const completeSharedStoreEnv = {
	BETTERPPTX_REQUIRE_SHARED_STORES: '1',
	BETTERPPTX_BILLING_LEDGER_STORE: 'firestore',
	BETTERPPTX_ENTITLEMENT_STORE: 'firestore',
	BETTERPPTX_INSTALL_USAGE_STORE: 'firestore',
	BETTERPPTX_CRYPTO_ORDER_STORE: 'firestore',
	BETTERPPTX_X402_STORE: 'firestore',
	BETTERPPTX_ARTIFACT_STORE: 'gcs',
	BETTERPPTX_GCS_BUCKET: 'metrology-bucket',
}
assert.equal(assertSharedStoreEnv({ env: completeSharedStoreEnv }), true, 'complete shared store env passes')
const missingEntitlementEnv = { ...completeSharedStoreEnv }
delete missingEntitlementEnv.BETTERPPTX_ENTITLEMENT_STORE
throwsCode(() => assertSharedStoreEnv({ env: missingEntitlementEnv }), 'SHARED_STORE_CONFIG_INCOMPLETE', 'missing entitlement store must fail before deploy')
const missingBucketEnv = { ...completeSharedStoreEnv, BETTERPPTX_GCS_BUCKET: '' }
throwsCode(() => assertSharedStoreEnv({ env: missingBucketEnv }), 'SHARED_STORE_CONFIG_INCOMPLETE', 'missing GCS bucket must fail with shared artifact store')

const storageBuild = { source: { storageSource: { bucket: 'b', object: 'source.tgz' } } }
assert.equal(cloudBuildSourceKind(storageBuild), 'storage_tarball')
throwsCode(() => assertMatrixGradeSourceProvenance({ build: storageBuild, provenance: { imageDigest: `sha256:${'a'.repeat(64)}`, gitTreeClean: true } }), 'SOURCE_PROVENANCE_NOT_GIT', 'storage tarball build cannot feed matrix adoption')
const gitBuild = {
	source: { repoSource: { commitSha: 'a'.repeat(40) } },
	results: { images: [{ digest: `sha256:${'b'.repeat(64)}` }] },
}
assert.deepEqual(assertMatrixGradeSourceProvenance({ build: gitBuild, provenance: { gitTreeClean: true } }), { cloudBuildSourceKind: 'git', gitCommit: 'a'.repeat(40), imageDigest: `sha256:${'b'.repeat(64)}` })
throwsCode(() => assertMatrixGradeSourceProvenance({ build: gitBuild, provenance: { gitTreeClean: false } }), 'SOURCE_TREE_NOT_CLEAN', 'dirty tree provenance must fail')
const developerConnectBuild = {
	source: { connectedRepository: { repository: 'projects/p/locations/us-central1/connections/c/repositories/r', revision: 'main' } },
	substitutions: { COMMIT_SHA: 'd'.repeat(40) },
	results: { images: [{ digest: `sha256:${'e'.repeat(64)}` }] },
}
assert.equal(cloudBuildSourceKind(developerConnectBuild), 'git', 'Developer Connect repository builds are git-backed')
assert.deepEqual(assertMatrixGradeSourceProvenance({ build: developerConnectBuild, provenance: { gitTreeClean: true } }), { cloudBuildSourceKind: 'git', gitCommit: 'd'.repeat(40), imageDigest: `sha256:${'e'.repeat(64)}` })
assert.equal(assertCloudRunReady({ status: { conditions: [{ type: 'Ready', status: 'True' }] } }), true, 'Ready=True service accepted')
throwsCode(() => assertCloudRunReady({ status: { conditions: [{ type: 'Ready', status: 'False', reason: 'HealthCheckContainerError' }] } }), 'CLOUD_RUN_NOT_READY', 'Ready=False service rejected')

// 4. Catalog validation fails if Cloud Run billing mode is absent (strict).
throwsCode(() => validateCloudBillingCatalogSnapshot(baseCatalog, { requireBillingMode: true }), 'COST_CATALOG_BILLING_MODE_MISSING', 'strict catalog must require billing mode')
const reqCatalog = validateCloudBillingCatalogSnapshot({ ...baseCatalog, cloudRunBillingMode: 'request_based' })
const instCatalog = validateCloudBillingCatalogSnapshot({ ...baseCatalog, cloudRunBillingMode: 'instance_based' })
throwsCode(() => validateCloudBillingCatalogSnapshot({ ...baseCatalog, cloudRunBillingMode: 'weird' }), 'COST_CATALOG_BILLING_MODE_INVALID', 'invalid mode must fail')

// 5. cost-model: request-based vs instance-based MUST differ in request-fee treatment.
const row = { toolName: 'betterpptx.deck.save', wallMs: 1000, storageWriteBytes: 1024 * 1024 }
const reqCost = estimateResourceRowCost(row, { catalog: reqCatalog, serviceShape: { vcpu: 1, memoryGiB: 2 } })
const instCost = estimateResourceRowCost(row, { catalog: instCatalog, serviceShape: { vcpu: 1, memoryGiB: 2 } })
assert(reqCost.breakdownUsd.cloudRunRequestUsd > 0, 'request_based must charge a request fee')
assert.equal(instCost.breakdownUsd.cloudRunRequestUsd, 0, 'instance_based must NOT charge a request fee')
assert.notEqual(reqCost.measuredUsd, instCost.measuredUsd, 'modes must produce different totals')
assert.equal(reqCost.cloudRunBillingMode, 'request_based')
assert(reqCost.amortizableInstanceUsd > 0 && reqCost.requestLinearUsd >= 0, 'B3 split present')

// 6. L1 log normalizer rejects mismatched run/service; monitoring summary needs catalog.
const logs = [
	{ jsonPayload: { schemaVersion: 'betterpptx.metrology.v1', metricType: 'betterpptx.resource_measurement', workload: 'metrology-test', service: 'svc', wallMs: 10 } },
	{ jsonPayload: { schemaVersion: 'betterpptx.metrology.v1', metricType: 'betterpptx.resource_measurement', workload: 'OTHER-run', service: 'svc' } },
	{ jsonPayload: { schemaVersion: 'betterpptx.metrology.v1', metricType: 'betterpptx.resource_measurement', workload: 'metrology-test', service: 'evil-svc' } },
	{ textPayload: 'not json' },
]
const norm = normalizeMetrologyLogEntries(logs, { runId: 'metrology-test', service: 'svc' })
assert.equal(norm.accepted.length, 1, 'only the matching run+service row is accepted')
assert(norm.rejected.some(r => r.reason === 'run-id-mismatch'))
assert(norm.rejected.some(r => r.reason === 'service-mismatch'))
const monSummary = summarizeMonitoring({ requestCount: 100, cpuAllocationVcpuSeconds: 50, memoryAllocationGibSeconds: 100 }, { catalog: reqCatalog })
assert(monSummary.totalUsd > 0, 'L2 gross USD positive for nontrivial run')
const monInst = summarizeMonitoring({ requestCount: 100, cpuAllocationVcpuSeconds: 50, memoryAllocationGibSeconds: 100 }, { catalog: instCatalog })
assert.equal(monInst.cloudRunRequestUsd, 0, 'L2 instance_based has no request fee')

// 6b. Live metrology emission: logger emits public-safe resource rows when metrology is enabled.
{
	const oldMetrology = process.env.BETTERPPTX_METROLOGY
	const oldWorkload = process.env.BETTERPPTX_METROLOGY_WORKLOAD
	const oldTopology = process.env.BETTERPPTX_METROLOGY_TOPOLOGY
	const oldStdoutWrite = process.stdout.write
	const lines = []
	process.env.BETTERPPTX_METROLOGY = '1'
	process.env.BETTERPPTX_METROLOGY_WORKLOAD = 'verify-metrology'
	process.env.BETTERPPTX_METROLOGY_TOPOLOGY = 'serial-baseline'
	process.stdout.write = chunk => { lines.push(String(chunk)); return true }
	try {
		const trace = logToolStart('betterpptx.help.capabilities', {})
		logToolEnd(trace, { ok: true, data: { ignored: true } })
	} finally {
		process.stdout.write = oldStdoutWrite
		if (oldMetrology === undefined) delete process.env.BETTERPPTX_METROLOGY
		else process.env.BETTERPPTX_METROLOGY = oldMetrology
		if (oldWorkload === undefined) delete process.env.BETTERPPTX_METROLOGY_WORKLOAD
		else process.env.BETTERPPTX_METROLOGY_WORKLOAD = oldWorkload
		if (oldTopology === undefined) delete process.env.BETTERPPTX_METROLOGY_TOPOLOGY
		else process.env.BETTERPPTX_METROLOGY_TOPOLOGY = oldTopology
	}
	const row = JSON.parse(lines.join('').trim())
	assert.equal(row.metricType, 'betterpptx.resource_measurement')
	assert.equal(row.workload, 'verify-metrology')
	assert.equal(row.topology, 'serial-baseline')
	assert.equal(row.toolName, 'betterpptx.help.capabilities')
	assert(row.wallMs >= 0)
	assert(!('args' in row), 'metrology row must not expose tool arguments')
	assert(!('result' in row), 'metrology row must not expose tool results')
}

// 7. BigQuery exporter fails when the run cannot be isolated (no runId / label absent).
throwsCode(() => exportBillingSummary({ project: 'p', dataset: 'd', table: 't', runId: '', start: 's', end: 'e', outFile: path.join(outDir, 'l3.json') }), 'runId is required', 'L3 must fail without run label')
const billingRows = [
	{ service: 'Cloud Run', sku: 'CPU Allocation', gross_cost: 2.0, credit_total: -2.0, net_cost: 0, line_items: 10 },
	{ service: 'Cloud Run', sku: 'Memory Allocation', gross_cost: 1.0, credit_total: -1.0, net_cost: 0, line_items: 10 },
]
const bsum = summarizeBillingRows(billingRows, { runId: 'metrology-test', minGrossUsdSignal: 1 })
assert.equal(bsum.grossCostUsd, 3.0, 'gross is pre-credit')
assert.equal(bsum.creditsUsd, 3.0)
assert.equal(bsum.netCostUsd, 0)
assert.equal(bsum.grossCostVisibleWhenNetZero, true, 'B5: gross visible even when net is zero')
assert.equal(bsum.grossSignalOk, true)
const bsumLow = summarizeBillingRows(billingRows, { runId: 'x', minGrossUsdSignal: 10 })
assert.equal(bsumLow.grossSignalOk, false, 'below-signal gross flagged')
assert(buildBillingQuery({ billingProject: 'bp', dataset: 'd', table: 't', project: 'p', runId: 'r', start: 's', end: 'e' }).includes('betterpptx_run'), 'SQL isolates by run label')

// 8/9. Build matrix: declares costBasis + overheadPolicy; production_adjusted requires evidence;
//      production adjustment must NOT discount request-linear cost (C5).
const rowsFile = path.join(outDir, 'feature-rows.ndjson')
const featureRows = []
for (const [feature, usd] of Object.entries({ deckSaveBase: 0.002, perFinalSlide: 0.0003, perFinalObject: 0.00004, perRichObject: 0.0001, perOutputMb: 0.00005 })) {
	featureRows.push({ model: 'checkpoint', scenario: `checkpoint.${feature}`, workload: 'W3', measuredUsd: usd, amortizableInstanceUsd: usd * 0.5, requestLinearUsd: usd * 0.5, cloudRunBillingMode: 'instance_based', catalogDigest: reqCatalog.digest, features: { [feature]: 1 } })
}
for (const [feature, usd] of Object.entries({ openUploadedBase: 0.0015, openUploadedPerMb: 0.00006, narrationBase: 0.0009, narrationPer1000Chars: 0.0003, avatarBase: 0.003, avatarPerSecond: 0.0001, model3dBase: 0.0012, model3dPerMb: 0.00007, mediaImportBase: 0.0005, mediaImportPerMb: 0.00005, batchTransformBase: 0.0004, batchTransformPerObject: 0.00002 })) {
	featureRows.push({ model: 'heavy', scenario: `heavy.${feature}`, workload: 'W3', measuredUsd: usd, amortizableInstanceUsd: usd * 0.5, requestLinearUsd: usd * 0.5, cloudRunBillingMode: 'instance_based', catalogDigest: reqCatalog.digest, features: { [feature]: 1 } })
}
fs.writeFileSync(rowsFile, `${featureRows.map(r => JSON.stringify(r)).join('\n')}\n`, 'utf8')

const serialMatrix = buildChargingMatrixFromFiles({ inputs: [rowsFile], output: path.join(outDir, 'serial-matrix.json'), report: path.join(outDir, 'serial-report.md'), allowSmall: true, costBasis: 'serial_ceiling', billingMode: 'instance_based' })
assert.equal(serialMatrix.costBasis, 'serial_ceiling')
assert.equal(serialMatrix.overheadPolicy, 'coefficient_included')
assert(serialMatrix.serialBaselineRateCardUsd.checkpoint.deckSaveBase > 0)
throwsCode(() => buildChargingMatrixFromFiles({ inputs: [rowsFile], output: path.join(outDir, 'pa.json'), report: path.join(outDir, 'pa.md'), allowSmall: true, costBasis: 'production_adjusted' }), 'production_adjusted requires', 'production_adjusted without evidence must fail')
throwsCode(() => buildChargingMatrixFromFiles({ inputs: [rowsFile], output: path.join(outDir, 'bad.json'), report: path.join(outDir, 'bad.md'), allowSmall: true, costBasis: 'defer_until_owner_review' }), 'serial_ceiling or production_adjusted', 'defer is not adoptable')

// C5: apply a 0.5 amortizable factor; with 50% amortizable fraction the coefficient drops to 75%,
// NOT 50% — proving request-linear cost is preserved.
const topo = path.join(outDir, 'topology.json')
fs.writeFileSync(topo, JSON.stringify({ runId: 'metrology-test-prod', productionAdjustment: { available: true, method: 'aggregate', amortizableInstanceFactor: 0.5, nonAmortizableRequestFactor: 1 } }), 'utf8')
const paMatrix = buildChargingMatrixFromFiles({ inputs: [rowsFile], output: path.join(outDir, 'pa-ok.json'), report: path.join(outDir, 'pa-ok.md'), allowSmall: true, costBasis: 'production_adjusted', topologySummaryFile: topo, billingMode: 'instance_based' })
const serialDeck = paMatrix.serialBaselineRateCardUsd.checkpoint.deckSaveBase
const adjDeck = paMatrix.rateCardUsd.checkpoint.deckSaveBase
assert(adjDeck < serialDeck && adjDeck > serialDeck * 0.5 + 1e-12, `request-linear cost must be preserved: adj=${adjDeck} serial=${serialDeck}`)
assert.equal(paMatrix.productionAdjustment.available, true)

// adopted matrix must declare costBasis; measured-cloud without it fails closed.
throwsCode(() => validateChargingMatrix({ schemaVersion: 'betterpptx.charging-matrix.v1', status: 'measured', currency: 'USD', provenance: 'measured-cloud', rateCardUsd: { checkpoint: { deckSaveBase: 1 }, heavy: { avatarBase: 1 } } }), 'CHARGING_MATRIX_COST_BASIS_REQUIRED', 'measured-cloud without costBasis must fail')

// synthetic/fixture matrix cannot be adopted; missing workloads cannot be adopted.
throwsCode(() => assertMatrixAdoptable({ ...serialMatrix, provenance: 'fixture' }), 'CHARGING_MATRIX_NOT_ADOPTABLE', 'fixture matrix cannot be adopted')
throwsCode(() => assertMatrixAdoptable(serialMatrix), 'WORKLOAD_EVIDENCE_MISSING', 'matrix without W1-W5 cannot be adopted')
const fullMatrix = { ...serialMatrix, workloadsCovered: ['W1', 'W2', 'W3', 'W4', 'W5'] }
assert.equal(assertMatrixAdoptable(fullMatrix), true, 'full measured-cloud matrix is adoptable')

// preview proves runtime pricing reads the selected basis + overhead policy.
const preview = previewRuntimeRateCard({ matrix: paMatrix, multiplier: 10 })
assert.equal(preview.costBasis, 'production_adjusted', 'preview reflects adopted basis')
assert.equal(preview.overheadPolicy, 'coefficient_included')
assert(preview.sampleQuotesCredits.mediumDeck_15slides_150obj_20rich_3mb > 0)
const rc = measuredMatrixToRateCard(fullMatrix, { multiplier: 10 })
assert.equal(rc.meta.costBasis, 'serial_ceiling')

// 10. Deploy script statically supports topology params (C1).
const deployScript = fs.readFileSync(path.resolve('deploy', 'gcp', 'deploy-mcp-metrology.ps1'), 'utf8')
for (const token of ['$Concurrency', '$MaxInstances', '$MinInstances', '$TopologyRole', '--concurrency=$Concurrency', 'betterpptx_topology=$TopologyRole']) {
	assert(deployScript.includes(token), `deploy script must support ${token}`)
}
for (const token of ['BETTERPPTX_ENTITLEMENT_STORE = "firestore"', 'Assert-MetrologySharedStores', '$PrebuiltImage', '$ExploratoryLocalBuild']) {
	assert(deployScript.includes(token), `deploy script must include D amendment guard ${token}`)
}
const gitBuildScript = fs.readFileSync(path.resolve('deploy', 'gcp', 'build-mcp-metrology-from-git.ps1'), 'utf8')
for (const token of ['$GitSourceUrl', '$GitSourceRevision', '--git-source-revision=$GitSourceRevision', '--revision=$GitSourceRevision', 'connectedRepository', 'cloudBuildSourceKind', 'source-provenance.json', 'cloud-build-metadata.json']) {
	assert(gitBuildScript.includes(token), `git build script must include ${token}`)
}

console.log('ZERO-PAYMENT CLOUD COST HARNESS: PASS (payment-rail refusal, topology envelope, shared-store guard, git provenance guard, readiness guard, billing-mode branch, L1/L2/L3 guards, costBasis, C5 request-linear preservation, adoption guard, deploy params)')
