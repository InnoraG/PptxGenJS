import assert from 'node:assert/strict'

import {
	CostModelError,
	coefficientOfVariation,
	estimateResourceRowCost,
	reconcileCostLayers,
	summarizeCostRows,
	validateCloudBillingCatalogSnapshot,
} from './billing/cost-model.mjs'

const catalog = {
	schemaVersion: 'betterpptx.cloud-cost-catalog.v1',
	currency: 'USD',
	region: 'test-region',
	effectiveAt: '2026-06-12T00:00:00.000Z',
	retrievedAt: '2026-06-12T00:00:00.000Z',
	source: {
		type: 'deterministic-test-fixture',
		reference: 'verify-cost-reconciliation',
	},
	cloudRun: {
		vcpuUsdPerSecond: 0.00002,
		gibUsdPerSecond: 0.000002,
		requestUsdPerMillion: 0.4,
	},
	gcs: {
		classAUsdPer1000: 0.005,
		classBUsdPer1000: 0.0004,
		storageUsdPerGibMonth: 0.02,
		egressUsdPerGib: 0.12,
	},
	firestore: {
		readUsdPer100k: 0.03,
		writeUsdPer100k: 0.09,
		deleteUsdPer100k: 0.01,
	},
	external: {
		ttsUsdPerMillionCharacters: 0,
		avatarUsdPerGpuSecond: 0.0001,
		otherUsdPerCall: 0,
	},
}

const validated = validateCloudBillingCatalogSnapshot(catalog)
assert.match(validated.digest, /^[a-f0-9]{64}$/)

assert.throws(
	() => validateCloudBillingCatalogSnapshot({ ...catalog, cloudRun: { ...catalog.cloudRun, vcpuUsdPerSecond: undefined } }),
	error => error instanceof CostModelError && error.code === 'COST_CATALOG_FIELD_INVALID',
)

const row = {
	toolName: 'betterpptx.deck.save',
	workload: 'W3-op-grid',
	callId: 'cost-verify-1',
	meterSource: 'cgroup_v2',
	includesChildProcesses: true,
	wallMs: 2000,
	cpuUsec: 1500000,
	storageWriteBytes: 10 * 1024 * 1024,
	egressBytes: 5 * 1024 * 1024,
	gcsClassAOps: 1,
	gcsClassBOps: 2,
	firestoreReads: 4,
	firestoreWrites: 3,
	firestoreDeletes: 1,
	ttsCharacters: 1000,
	gpuSeconds: 3,
	externalCalls: 2,
}

const cost = estimateResourceRowCost(row, {
	catalog,
	serviceShape: { vcpu: 2, memoryGiB: 4 },
	artifactRetentionDays: 2,
	fixedOverheadUsdPerOperation: 0.00001,
})
assert(cost.measuredUsd > 0)
assert.equal(cost.catalogDigest, validated.digest)
assert.equal(cost.breakdownUsd.cloudRunCpuUsd, 0.00008)
assert.equal(cost.breakdownUsd.cloudRunMemoryUsd, 0.000016)
assert.equal(cost.breakdownUsd.avatarGpuUsd, 0.0003)

const summary = summarizeCostRows([
	cost,
	{ measuredUsd: cost.measuredUsd * 1.02 },
	{ measuredUsd: cost.measuredUsd * 0.98 },
])
assert.equal(summary.count, 3)
assert(summary.coefficientOfVariation < 0.10)
assert(coefficientOfVariation([100, 102, 98]) < 0.10)

const accepted = reconcileCostLayers({ l1Usd: 9.5, l2Usd: 10.4, l3Usd: 10, toleranceRatio: 0.10 })
assert.equal(accepted.ok, true)
const rejected = reconcileCostLayers({ l1Usd: 7, l2Usd: 10, l3Usd: 10, toleranceRatio: 0.10 })
assert.equal(rejected.ok, false)

console.log(`COST RECONCILIATION: PASS cost=${cost.measuredUsd} cv=${summary.coefficientOfVariation} l1Delta=${accepted.l1DeltaRatio}`)
