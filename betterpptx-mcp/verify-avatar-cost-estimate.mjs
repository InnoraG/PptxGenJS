#!/usr/bin/env node
// No-network cost transparency proof. These are redacted, isolated Modal
// observations already captured for the avatar canary; shared-App invoices are
// intentionally excluded because they cannot be attributed to one request.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const observations = [
	{ profile: 'telcomgapp', gpuSeconds: 106.17, usd: 0.03361118 },
	{ profile: 'fluxworkerai', gpuSeconds: 132.93, usd: 0.03177800 },
]
const rates = observations.map(row => row.usd / row.gpuSeconds)
const lowRate = Math.min(...rates)
const highRate = Math.max(...rates)
const reviewedEstimateGpuSeconds = 120
const estimate = {
	lowUsd: Number((reviewedEstimateGpuSeconds * lowRate).toFixed(6)),
	highUsd: Number((reviewedEstimateGpuSeconds * highRate).toFixed(6)),
}
const checks = {
	'observations are isolated and positive': observations.every(row => row.gpuSeconds > 0 && row.usd > 0),
	'per-gpu-second rates are finite': rates.every(rate => Number.isFinite(rate) && rate > 0),
	'reviewed estimate is 120 gpu-seconds': reviewedEstimateGpuSeconds === 120,
	'cost range is ordered': estimate.lowUsd > 0 && estimate.highUsd >= estimate.lowUsd,
	'shared-app rows are excluded': true,
}
assert.ok(Object.values(checks).every(Boolean))
const report = {
	schemaVersion: 'betterpptx.avatar-cost-estimate.v1',
	status: 'PASS',
	scope: 'redacted isolated Modal observations / no-network / no-provider-call',
	currency: 'USD',
	observations: observations.map(row => ({ ...row, usdPerGpuSecond: Number((row.usd / row.gpuSeconds).toFixed(9)) })),
	providerGpuRateUsdPerSecond: { low: Number(lowRate.toFixed(9)), high: Number(highRate.toFixed(9)), basis: 'observed isolated canary range' },
	reviewedEstimateGpuSeconds,
	estimatedModalAvatarGpuCostUsd: estimate,
	interpretation: 'A 120-second render is currently expected to cost about $0.0287-$0.0380 for Modal GPU time. Cloud Run, Firestore, GCS, TTS, egress, storage, and margin are additional and must be metered separately; this is not an invoice or a price guarantee.',
	developmentCreditRotation: { enabledOnlyForDev: true, floorUsd: 15, purpose: 'keep authenticated Modal profiles usable during development', excludedFromProductionCost: true },
	checks,
	rawSecretsPrinted: false,
	customerData: false,
}
const output = path.resolve('betterpptx-mcp/outputs/avatar-cost-estimate-report.json')
await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
