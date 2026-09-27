#!/usr/bin/env node
// Verify an owner-supplied, redacted provider billing export. No export means
// an explicit OPEN state; no secrets or invoice payloads are emitted.
import fs from 'node:fs/promises'
import path from 'node:path'
import { evaluateProviderCoverage } from './billing/provider-coverage.mjs'

const root = path.resolve('betterpptx-mcp/outputs')
const outputPath = path.join(root, 'avatar-provider-billing-coverage-report.json')
const inputPath = String(process.env.BETTERPPTX_AVATAR_PROVIDER_BILLING_EXPORT || '').trim()
const reconciliation = JSON.parse(await fs.readFile(path.join(root, 'avatar-provider-billing-reconciliation-report.json'), 'utf8'))

let report
if (!inputPath) {
	report = {
		schemaVersion: 'betterpptx.avatar-provider-billing-coverage-report.v1',
		status: 'OPEN_OWNER_EXPORT_REQUIRED',
		failClosed: true,
		checks: { redactedExportPresent: false, fullWindowCoverageProven: false, ownerApprovalRecorded: false },
		ownerAction: 'Provide a redacted provider export with every captured execution ID, matching GPU seconds/tags, and an explicit complete-window attestation.',
	}
} else {
	try {
		const exportReport = JSON.parse(await fs.readFile(path.resolve(inputPath), 'utf8'))
		const evaluation = evaluateProviderCoverage({ reconciliationReport: reconciliation, exportReport })
		report = { schemaVersion: 'betterpptx.avatar-provider-billing-coverage-report.v1', ...evaluation, failClosed: evaluation.status !== 'PASS_OWNER_EXPORT_READY', source: 'owner-supplied-redacted-export' }
	} catch (error) {
		report = { schemaVersion: 'betterpptx.avatar-provider-billing-coverage-report.v1', status: 'INVALID_OWNER_EXPORT', failClosed: true, error: { code: error?.message || 'VERIFY_FAILED' } }
	}
}
await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'PASS_OWNER_EXPORT_READY' && report.status !== 'OPEN_OWNER_EXPORT_REQUIRED') process.exitCode = 2
