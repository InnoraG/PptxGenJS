import { spawnSync } from 'node:child_process'

const tests = [
	'betterpptx-mcp/verify-crypto-credit-ledger.mjs',
	'betterpptx-mcp/verify-chain-watcher.mjs',
	'betterpptx-mcp/verify-install-identity.mjs',
	'betterpptx-mcp/verify-billing-ledger.mjs',
	'betterpptx-mcp/verify-billing-reservation-gate.mjs',
	'betterpptx-mcp/verify-billing-dry-run.mjs',
	'betterpptx-mcp/verify-billing-public-ux.mjs',
	'betterpptx-mcp/verify-billing-quote-cap.mjs',
	'betterpptx-mcp/verify-owner-goodwill-credits.mjs',
	'betterpptx-mcp/verify-payment-intents.mjs',
	'betterpptx-mcp/verify-production-store-config.mjs',
	'betterpptx-mcp/verify-resource-meter.mjs',
	'betterpptx-mcp/verify-cost-metrology-harness.mjs',
	'betterpptx-mcp/verify-cost-metrology-reconcile.mjs',
	'betterpptx-mcp/verify-cost-reconciliation.mjs',
	'betterpptx-mcp/verify-charging-matrix.mjs',
]

function summarizePass(stdout) {
	const lines = String(stdout || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
	return lines.find(line => /\bPASS\b/.test(line)) || 'PASS'
}

for (const test of tests) {
	const result = spawnSync(process.execPath, [test], {
		cwd: process.cwd(),
		encoding: 'utf8',
		timeout: 120000,
		windowsHide: true,
	})
	if (result.error || result.status !== 0) {
		console.error(`[payment-regression-pack] FAILED ${test}`)
		if (result.error) console.error(result.error.stack || result.error.message)
		if (result.stdout) console.error(result.stdout)
		if (result.stderr) console.error(result.stderr)
		process.exit(result.status || 1)
	}
	console.log(`[payment-regression-pack] ${test}: ${summarizePass(result.stdout)}`)
}

console.log(`PAYMENT REGRESSION PACK: PASS tests=${tests.length}`)
