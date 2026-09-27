import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { runCostMetrologyHarness } from './run-cost-metrology-harness.mjs'

const outDir = path.resolve('outputs', 'cost-metrology-harness-verify', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outDir, { recursive: true })
const catalogFile = path.join(outDir, 'catalog.json')
fs.writeFileSync(catalogFile, `${JSON.stringify({
	schemaVersion: 'betterpptx.cloud-cost-catalog.v1',
	currency: 'USD',
	region: 'deterministic-test',
	effectiveAt: '2026-06-12T00:00:00.000Z',
	retrievedAt: '2026-06-12T00:00:00.000Z',
	source: {
		type: 'deterministic-test-fixture',
		reference: 'verify-cost-metrology-harness',
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
}, null, 2)}\n`, 'utf8')

const summary = runCostMetrologyHarness({
	catalog: catalogFile,
	outDir,
	resourceRows: [],
	syntheticFixture: true,
	buildMatrix: true,
	allowSmall: true,
	serviceVcpu: 1,
	serviceMemoryGiB: 1,
	artifactRetentionDays: 1,
	fixedOverheadUsdPerOperation: 0,
})

assert.equal(summary.ok, true)
assert.equal(summary.resourceRows, 21)
assert(fs.existsSync(summary.costRowsFile), 'Harness did not write cost rows.')
assert(fs.existsSync(summary.featureRowsFile), 'Harness did not write matrix feature rows.')
assert(fs.existsSync(path.join(outDir, 'charging-matrix-v1.json')), 'Harness did not write the charging matrix.')
assert(fs.existsSync(summary.reportFile), 'Harness did not write the decision report.')
assert(summary.costSummary.totalUsd > 0)

const matrix = JSON.parse(fs.readFileSync(path.join(outDir, 'charging-matrix-v1.json'), 'utf8'))
assert.equal(matrix.status, 'measured')
assert.equal(matrix.rateCardUsd.checkpoint.deckSaveBase > 0, true)
assert.equal(matrix.rateCardUsd.heavy.avatarPerSecond > 0, true)
assert.equal(matrix.pricingDecision, 'owner_multiplier_pending')
// Per-family measured-anchor assertions: the new server/service families must flow end-to-end
// (harness feature columns -> NNLS fit -> rateCardUsd), not just bump the row count. If a family
// column is dropped anywhere in the pipeline, its coefficient goes missing here and this fails.
assert(matrix.rateCardUsd.checkpoint.perImageOp > 0, 'perImageOp missing from fitted rate card')
assert(matrix.rateCardUsd.checkpoint.perResolvedAssetMb > 0, 'perResolvedAssetMb missing from fitted rate card')
assert(matrix.rateCardUsd.heavy.model3dImportBase > 0, 'model3dImportBase missing from fitted rate card')
assert(matrix.rateCardUsd.heavy.model3dImportPerMb > 0, 'model3dImportPerMb missing from fitted rate card')

const report = fs.readFileSync(summary.reportFile, 'utf8')
assert(report.includes('Multiplier Decision Sheet'))
assert(report.includes('m=200'))

console.log(`COST METROLOGY HARNESS: PASS rows=${summary.resourceRows} matrix=${matrix.version}`)
