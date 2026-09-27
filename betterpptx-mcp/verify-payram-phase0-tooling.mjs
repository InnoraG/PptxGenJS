import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFile, execFileSync } from 'node:child_process'

const liveProofPath = path.resolve('betterpptx-mcp', 'verify-payram-phase0-live.mjs')
const installPath = path.resolve('deploy', 'gcp', 'install-payram-oci-host.ps1')
const hostVerifyPath = path.resolve('deploy', 'gcp', 'verify-payram-oci-host.ps1')
const runbookPath = path.resolve('deploy', 'gcp', 'payram-oci-always-free-runbook.md')
const planPath = path.resolve('plans', 'payram-oci-x402-payment-intents-executor-plan-2026-06-16-codexpreview.md')

const liveProof = fs.readFileSync(liveProofPath, 'utf8')
const install = fs.readFileSync(installPath, 'utf8')
const hostVerify = fs.readFileSync(hostVerifyPath, 'utf8')
const runbook = fs.readFileSync(runbookPath, 'utf8')
const plan = fs.readFileSync(planPath, 'utf8')

function includes(text, needle, message) {
	assert(text.includes(needle), message || `Missing ${needle}`)
}

async function startErrorServer({ apiKey, webhookToken }) {
	const server = http.createServer((req, res) => {
		let body = ''
		req.on('data', chunk => { body += chunk })
		req.on('end', () => {
			res.statusCode = 500
			res.setHeader('Content-Type', 'application/json')
			res.end(JSON.stringify({
				message: `Rejected test request for ${apiKey} ${webhookToken} https://payram.invalid/checkout?token=phase0_url_token&key=${apiKey}`,
				error: body,
			}))
		})
	})
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const address = server.address()
	return {
		server,
		baseUrl: `http://127.0.0.1:${address.port}`,
	}
}

async function startSuccessServer({ referenceId }) {
	const server = http.createServer((req, res) => {
		if (req.method === 'POST' && req.url === '/api/v1/payment') {
			let body = ''
			req.on('data', chunk => { body += chunk })
			req.on('end', () => {
				res.statusCode = 200
				res.setHeader('Content-Type', 'application/json')
				res.end(JSON.stringify({
					reference_id: referenceId,
					url: `http://127.0.0.1:${server.address().port}/checkout?reference_id=${referenceId}&token=phase0_success_token`,
					echo: body,
				}))
			})
			return
		}
		if (req.method === 'GET' && req.url === `/api/v1/payment/reference/${encodeURIComponent(referenceId)}`) {
			res.statusCode = 200
			res.setHeader('Content-Type', 'application/json')
			res.end(JSON.stringify({
				reference_id: referenceId,
				paymentState: 'FILLED',
				amountInUSD: 5,
				filled_amount_in_usd: 5,
				fee_in_usd: 0,
			}))
			return
		}
		if (req.method === 'GET' && req.url?.startsWith('/checkout')) {
			res.statusCode = 200
			res.setHeader('Content-Type', 'text/html')
			res.end('<html><body>PayRam card Apple Pay Google Pay onramp wallet</body></html>')
			return
		}
		res.statusCode = 404
		res.end('not found')
	})
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const address = server.address()
	return {
		server,
		baseUrl: `http://127.0.0.1:${address.port}`,
	}
}

function execFileResult(command, args, options = {}) {
	return new Promise(resolve => {
		execFile(command, args, {
			encoding: 'utf8',
			timeout: 45000,
			...options,
		}, (error, stdout = '', stderr = '') => {
			resolve({
				ok: !error,
				code: error?.code ?? 0,
				error,
				stdout: String(stdout || ''),
				stderr: String(stderr || ''),
			})
		})
	})
}

includes(liveProof, '--customer-email', 'Live PayRam proof must require an explicit customer email when creating a link.')
includes(liveProof, '--reference-id', 'Live PayRam proof must support re-checking an existing reference after manual payment.')
includes(liveProof, '--expect-paid', 'Live PayRam proof must support paid-status enforcement.')
includes(liveProof, '--require-card-keywords', 'Live PayRam proof must optionally enforce card/onramp page markers.')
includes(liveProof, '--use-gcloud-secrets', 'Live PayRam proof must be able to load PayRam secrets without printing them.')
includes(liveProof, 'betterpptx-payram-base-url', 'Live PayRam proof must use the canonical PayRam base-url secret.')
includes(liveProof, 'betterpptx-payram-api-key', 'Live PayRam proof must use the canonical PayRam API-key secret.')
includes(liveProof, 'betterpptx-payram-webhook-custom-token', 'Live PayRam proof must use the canonical PayRam webhook token secret.')
includes(liveProof, 'outputs', 'Live PayRam proof must write evidence under outputs/.')
includes(liveProof, 'manualChecklist', 'Live PayRam proof must explicitly record manual proof items.')
includes(liveProof, 'hashStableId', 'Live PayRam proof must hash customer identity in evidence.')
includes(liveProof, 'redactUrl', 'Live PayRam proof must redact sensitive URL parameters in evidence.')
assert(!liveProof.includes('--api-key '), 'Live PayRam proof must not accept raw API keys on the command line.')
assert(!liveProof.includes('console.log(process.env.BETTERPPTX_PAYRAM_API_KEY'), 'Live PayRam proof must not print PayRam API key.')
assert(!liveProof.includes('console.log(process.env.BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN'), 'Live PayRam proof must not print PayRam webhook token.')
assert(!liveProof.includes('auth)=[^&]+/gi'), 'Live PayRam proof URL fallback redaction must not keep the sensitive query value.')
includes(liveProof, 'referenceIdHash', 'Live PayRam proof must store hashed reference ids in evidence.')

includes(install, 'RUN PAYRAM INSTALL', 'PayRam installer script must require an explicit confirmation string before running the installer.')
includes(install, 'verify-payram-oci-host.ps1', 'PayRam installer script must verify host bootstrap before staging by default.')
includes(install, 'curl -fsSL https://payram.com/setup_payram.sh', 'PayRam installer script must stage the official PayRam installer.')
includes(install, '/opt/betterpptx/payram/setup_payram.sh', 'PayRam installer script must stage installer under the PayRam app directory.')
includes(install, 'BetterPPTX public card rail must remain disabled until Phase 0 proof passes.', 'PayRam installer notes must preserve launch gate.')
includes(install, 'systemctl disable --now nginx', 'PayRam installer script must support stopping the temporary readiness proxy.')
assert(!install.includes('0.0.0.0/0'), 'PayRam installer script must not suggest public SSH exposure.')
assert(!install.toLowerCase().includes('private key:'), 'PayRam installer script must not print private key material.')

includes(hostVerify, 'betterpptx-payram-host-ready', 'Host verifier must remain tied to the cloud-init readiness marker.')
includes(runbook, 'install-payram-oci-host.ps1', 'Runbook must include the PayRam installer staging command.')
includes(runbook, 'verify-payram-phase0-live.mjs', 'Runbook must include the live PayRam Phase 0 proof command.')
includes(plan, 'verify-payram-phase0-live.mjs', 'Executor plan must mention live PayRam Phase 0 proof tooling.')
includes(plan, 'install-payram-oci-host.ps1', 'Executor plan must mention PayRam OCI install tooling.')

const help = execFileSync(process.execPath, [liveProofPath, '--help'], { encoding: 'utf8' })
includes(help, 'BETTERPPTX_PAYRAM_API_KEY', 'Live proof help must document required PayRam env.')
includes(help, '--use-gcloud-secrets', 'Live proof help must document GCP secret loading.')

const apiKey = 'phase0_test_api_key_123456'
const webhookToken = 'phase0_webhook_token_123456'
const customerEmail = 'phase0-leak-check@example.test'
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-payram-phase0-'))
const outputPath = path.join(outputDir, 'phase0-failure-evidence.json')
const { server, baseUrl } = await startErrorServer({ apiKey, webhookToken })
try {
	const result = await execFileResult(process.execPath, [
		liveProofPath,
		'--customer-email',
		customerEmail,
		'--output',
		outputPath,
	], {
		env: {
			...process.env,
			BETTERPPTX_ALLOW_LOCAL_PAYMENT_HTTP: '1',
			BETTERPPTX_PAYRAM_ENABLED: '1',
			BETTERPPTX_PAYRAM_BASE_URL: baseUrl,
			BETTERPPTX_PAYRAM_API_KEY: apiKey,
			BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN: webhookToken,
		},
	})
	assert(!result.ok, 'Live PayRam proof must fail against the local error server.')
	const evidence = fs.readFileSync(outputPath, 'utf8')
	includes(evidence, '"ok": false', 'Failed live proof must still write evidence.')
	assert(!evidence.includes(apiKey), 'Failed live proof evidence must redact the raw API key.')
	assert(!evidence.includes(webhookToken), 'Failed live proof evidence must redact the raw webhook token.')
	assert(!evidence.includes(customerEmail), 'Failed live proof evidence must redact the raw customer email.')
	assert(!evidence.includes('phase0_url_token'), 'Failed live proof evidence must redact sensitive URL query values.')
} finally {
	await new Promise(resolve => server.close(resolve))
	fs.rmSync(outputDir, { recursive: true, force: true })
}

const successReference = 'payram_ref_success_secret'
const successEmail = 'phase0-success@example.test'
const successOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-payram-phase0-success-'))
const successOutputPath = path.join(successOutputDir, 'phase0-success-evidence.json')
const successServer = await startSuccessServer({ referenceId: successReference })
try {
	const result = await execFileResult(process.execPath, [
		liveProofPath,
		'--customer-email',
		successEmail,
		'--output',
		successOutputPath,
		'--require-card-keywords',
		'--expect-paid',
	], {
		env: {
			...process.env,
			BETTERPPTX_ALLOW_LOCAL_PAYMENT_HTTP: '1',
			BETTERPPTX_PAYRAM_ENABLED: '1',
			BETTERPPTX_PAYRAM_BASE_URL: successServer.baseUrl,
			BETTERPPTX_PAYRAM_API_KEY: apiKey,
			BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN: webhookToken,
		},
	})
	assert(result.ok, `Live PayRam proof must pass against the local success server: ${result.stderr || result.stdout}`)
	const stdout = result.stdout
	includes(stdout, 'referenceHash=', 'Live PayRam proof stdout must print only the reference hash label.')
	assert(!stdout.includes(successReference), 'Live PayRam proof stdout must not print the raw PayRam reference.')
	const evidence = fs.readFileSync(successOutputPath, 'utf8')
	includes(evidence, '"ok": true', 'Successful live proof must write ok evidence.')
	includes(evidence, 'referenceIdHash', 'Successful live proof evidence must contain a reference hash.')
	assert(!evidence.includes(successReference), 'Successful live proof evidence must not store the raw PayRam reference.')
	assert(!evidence.includes('phase0_success_token'), 'Successful live proof evidence must redact the checkout URL token.')
	assert(!evidence.includes(successEmail), 'Successful live proof evidence must not store the raw customer email.')
	assert(!evidence.includes(apiKey), 'Successful live proof evidence must not store the raw API key.')
} finally {
	await new Promise(resolve => successServer.server.close(resolve))
	fs.rmSync(successOutputDir, { recursive: true, force: true })
}

console.log('PAYRAM PHASE0 TOOLING: PASS installScript=1 liveProof=1 evidence=1 secretSafe=1 failureEvidence=1 successEvidence=1')
