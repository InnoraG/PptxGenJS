#!/usr/bin/env node
import assert from 'node:assert/strict'
import { evaluateProviderCoverage } from '../billing/provider-coverage.mjs'

const reconciliationReport = {
	evidence: {
		capturedWorkerUsage: [
			{ accountId: 'telcomgapp', gpuSeconds: 10, providerExecutionIds: ['fc-TEST-A'] },
			{ accountId: 'fluxworkerai', gpuSeconds: 20, providerExecutionIds: ['fc-TEST-B'] },
		],
	},
}
const baseExport = {
	schemaVersion: 'betterpptx.avatar-provider-billing-export.v1',
	window: { start: '2026-07-19T00:00:00Z', end: '2026-07-19T01:00:00Z' },
	coverage: { complete: true },
	accounts: [
		{ accountId: 'telcomgapp', tags: { product: 'betterpptx', service: 'avatar-worker', pipeline: 'liveportrait-musetalk', account: 'telcomgapp' }, rows: [{ providerExecutionIds: ['fc-TEST-A'], gpuSeconds: 10, a10gCostUsd: 0.01 }] },
		{ accountId: 'fluxworkerai', tags: { product: 'betterpptx', service: 'avatar-worker', pipeline: 'liveportrait-musetalk', account: 'fluxworkerai' }, rows: [{ providerExecutionIds: ['fc-TEST-B'], gpuSeconds: 20, a10gCostUsd: 0.02 }] },
	],
}
const pass = evaluateProviderCoverage({ reconciliationReport, exportReport: baseExport })
assert.equal(pass.status, 'PASS_OWNER_EXPORT_READY')
assert.equal(pass.checks.fullWindowCoverageProven, true)
const incomplete = evaluateProviderCoverage({ reconciliationReport, exportReport: { ...baseExport, coverage: { complete: false } } })
assert.equal(incomplete.status, 'OPEN_COVERAGE_INCOMPLETE')
assert.equal(incomplete.failClosed, undefined)
const missing = evaluateProviderCoverage({ reconciliationReport, exportReport: { ...baseExport, accounts: [baseExport.accounts[0]], coverage: { complete: true } } })
assert.equal(missing.status, 'OPEN_COVERAGE_INCOMPLETE')
assert.deepEqual(missing.missingExecutionIds, ['fc-TEST-B'])
console.log(JSON.stringify({ status: 'PASS', checks: ['complete owner export passes', 'incomplete coverage stays open', 'missing execution stays open'] }, null, 2))
