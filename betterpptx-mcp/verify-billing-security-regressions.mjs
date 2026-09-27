// Offline regression entry point. Synthetic identities, local files, fake
// payment/RPC providers and fake transactional stores; no financial settlement.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const files = [
	'betterpptx-mcp/test/billing-admission-security.test.mjs',
	'betterpptx-mcp/test/billing-ledger-security.test.mjs',
	'betterpptx-mcp/test/billing-cumulative-security.test.mjs',
	'betterpptx-mcp/test/base-usdc-credit-recovery.test.mjs',
	'betterpptx-mcp/test/payram-billing-security.test.mjs',
	'betterpptx-mcp/test/x402-fraud-regression.test.mjs',
	'betterpptx-mcp/test/x402-persistence-security.test.mjs',
	'betterpptx-mcp/test/x402-windows-sharing-security.test.mjs',
	'betterpptx-mcp/test/monetized-quote-binding-security.test.mjs',
	'betterpptx-mcp/test/payment-envelope-reload.test.mjs',
	'betterpptx-mcp/test/http-admission-security.test.mjs',
	'betterpptx-mcp/test/mcp-v2-security.test.mjs',
	'betterpptx-mcp/test/logger-billing-security.test.mjs',
	'betterpptx-mcp/test/inline-image-dimensions-security.test.mjs',
	'betterpptx-mcp/test/dependency-security-compatibility.test.mjs',
	'betterpptx-mcp/test/resource-authorization.test.mjs',
	'betterpptx-mcp/test/resource-authorization-persistence.test.mjs',
	'betterpptx-mcp/test/asset-grants.test.mjs',
	'betterpptx-mcp/test/engine-resource-ownership.test.mjs',
	'betterpptx-mcp/test/engine-asset-ownership.test.mjs',
	'betterpptx-mcp/test/avatar-job-ownership-security.test.mjs',
	'betterpptx-mcp/test/billing-timeout-delivery.test.mjs',
	'betterpptx-mcp/test/production-non-rendering-save.test.mjs',
	'betterpptx-mcp/test/narration-preparation-reuse.test.mjs',
	'betterpptx-connector/test/billing-security.test.mjs',
	'betterpptx-connector/test/quote-purchase-security.test.mjs',
]
const child = spawn(process.execPath, [
	'--experimental-test-module-mocks', '--experimental-vm-modules',
	'--disable-warning=ExperimentalWarning', '--test', '--test-concurrency=1',
	'--test-timeout=120000', ...files,
], {
	cwd: root, stdio: 'inherit', windowsHide: true,
	env: { ...process.env, NODE_ENV: 'test', BETTERPPTX_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: 'test' },
})
child.once('error', () => { process.stderr.write('Security regression runner could not start.\n'); process.exitCode = 1 })
child.once('exit', (code, signal) => {
	process.exitCode = code ?? 1
	if (signal) process.stderr.write('Security regression runner was interrupted; no pass claimed.\n')
})
