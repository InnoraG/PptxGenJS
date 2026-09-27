import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { reconcileCostMetrology } from './reconcile-cost-metrology.mjs'

const outDir = path.resolve('outputs', 'cost-metrology-reconcile-verify', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outDir, { recursive: true })

const costRowsFile = path.join(outDir, 'cost-rows.ndjson')
const monitoringFile = path.join(outDir, 'monitoring.json')
const billingFile = path.join(outDir, 'billing-export.json')
const reportFile = path.join(outDir, 'report.json')

const costRows = [
	{ measuredUsd: 4.8, toolName: 'betterpptx.deck.save' },
	{ measuredUsd: 5.0, toolName: 'betterpptx.deck.save' },
]
fs.writeFileSync(costRowsFile, `${costRows.map(row => JSON.stringify(row)).join('\n')}\n`, 'utf8')
fs.writeFileSync(monitoringFile, `${JSON.stringify({
	totalUsd: 10.4,
	window: { start: '2026-06-12T00:00:00.000Z', end: '2026-06-12T01:00:00.000Z' },
	labels: { betterpptx_role: 'metrology' },
}, null, 2)}\n`, 'utf8')
fs.writeFileSync(billingFile, `${JSON.stringify({
	totalUsd: 10.0,
	window: { start: '2026-06-12', end: '2026-06-13' },
	labels: { betterpptx_role: 'metrology' },
}, null, 2)}\n`, 'utf8')

const accepted = reconcileCostMetrology({
	costRowsFile,
	monitoringFile,
	billingExportFile: billingFile,
	outFile: reportFile,
	toleranceRatio: 0.10,
})
assert.equal(accepted.ok, true)
assert.equal(accepted.reconciliation.l1Usd, 9.8)
assert.equal(accepted.reconciliation.l2Usd, 10.4)
assert.equal(accepted.reconciliation.l3Usd, 10)
assert(fs.existsSync(reportFile))

fs.writeFileSync(billingFile, `${JSON.stringify({ totalUsd: 20 }, null, 2)}\n`, 'utf8')
const rejected = reconcileCostMetrology({
	costRowsFile,
	monitoringFile,
	billingExportFile: billingFile,
	toleranceRatio: 0.10,
})
assert.equal(rejected.ok, false)

console.log(`COST METROLOGY RECONCILE: PASS accepted=${accepted.ok} rejected=${rejected.ok}`)
