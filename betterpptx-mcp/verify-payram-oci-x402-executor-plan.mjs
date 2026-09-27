import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawn } from 'node:child_process'

const args = new Map()
for (let i = 2; i < process.argv.length; i += 1) {
	const arg = process.argv[i]
	if (arg.startsWith('--') && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) {
		args.set(arg, process.argv[++i])
	} else if (arg.startsWith('--')) {
		args.set(arg, '1')
	}
}

const liveBase = String(args.get('--live-base') || process.env.BETTERPPTX_VERIFY_LIVE_BASE || '').replace(/\/+$/, '')
const gcpProject = String(args.get('--gcp-project') || process.env.BETTERPPTX_VERIFY_GCP_PROJECT || 'betterpptx-mcp-staging').trim()
const skipBuild = args.has('--skip-build')
const skipInstallDryRun = args.has('--skip-install-dry-run')
const outputDir = path.resolve('outputs', 'payram-oci-x402-executor-plan-verify', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outputDir, { recursive: true })

const node = process.execPath
const commandRunner = process.platform === 'win32' ? 'cmd.exe' : ''
const npx = process.platform === 'win32' ? commandRunner : 'npx'
const npm = process.platform === 'win32' ? commandRunner : 'npm'
const npxPrefix = process.platform === 'win32' ? ['/d', '/s', '/c', 'npx'] : []
const npmPrefix = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm'] : []
const powershell = 'powershell'
const psParserCommand = [
	"$files=@(",
	"'deploy/gcp/deploy-mcp-crypto-production.ps1',",
	"'deploy/gcp/provision-payram-oci.ps1',",
	"'deploy/gcp/verify-payram-oci-host.ps1',",
	"'deploy/gcp/verify-payram-dns-https.ps1',",
	"'deploy/gcp/open-payram-oci-bastion-tunnel.ps1',",
	"'deploy/gcp/install-payram-oci-host.ps1',",
	"'deploy/gcp/verify-payram-oci-backup-restore.ps1',",
	"'deploy/gcp/configure-payram-oci-alarms.ps1',",
	"'deploy/gcp/show-betterpptx-gas-wallet-status.ps1',",
	"'deploy/gcp/show-payram-public-enablement-checklist.ps1',",
	"'deploy/gcp/set-betterpptx-settlement-collector-address.ps1',",
	"'deploy/gcp/create-betterpptx-settlement-collector-wallet.ps1',",
	"'deploy/gcp/resume-payram-public-enablement.ps1',",
	"'deploy/gcp/continue-payram-public-enablement.ps1',",
	"'deploy/gcp/create-betterpptx-forwarder-secrets.ps1',",
	"'deploy/gcp/create-betterpptx-forwarder-review-evidence.ps1',",
	"'deploy/gcp/create-betterpptx-forwarder-proof-evidence.ps1',",
	"'deploy/gcp/watch-payram-oci-a1-capacity.ps1',",
	"'deploy/gcp/run-payram-oci-a1-capacity-watch-task.ps1',",
	"'deploy/gcp/register-payram-oci-a1-capacity-task.ps1',",
	"'deploy/gcp/set-payram-oci-a1-capacity-watch-decision.ps1'",
	');',
	"foreach($file in $files){",
	"$null=[scriptblock]::Create((Get-Content -LiteralPath $file -Raw));",
	"Write-Output \"PARSER OK $file\"",
	'}',
].join(' ')

function task(id, command, commandArgs, options = {}) {
	return {
		id,
		command,
		args: commandArgs,
		timeoutMs: options.timeoutMs || 180000,
		group: options.group || 'local',
	}
}

const tasks = [
	task('payment-intents', node, ['betterpptx-mcp/verify-payment-intents.mjs']),
	task('payram-client', node, ['betterpptx-mcp/verify-payram-client.mjs']),
	task('payram-routes', node, ['betterpptx-mcp/verify-payram-routes.mjs']),
	task('payram-reconciler', node, ['betterpptx-mcp/verify-payram-reconciler.mjs']),
	task('universal-payment-surfaces', node, ['betterpptx-mcp/verify-universal-payment-surfaces.mjs']),
	task('public-production-gate', node, ['betterpptx-mcp/verify-public-production-gate.mjs']),
	task('premium-quote-equivalence', node, ['betterpptx-mcp/verify-premium-quote-equivalence.mjs']),
	task('mission-control-secrets', node, ['betterpptx-mcp/verify-mission-control-secrets.mjs']),
	task('mission-control-payment-evidence', node, ['betterpptx-mcp/verify-mission-control-payment-evidence.mjs']),
	task('payment-health', node, ['betterpptx-mcp/verify-payment-health.mjs']),
	task('readiness-gates', node, ['betterpptx-mcp/verify-payram-oci-x402-readiness-gates.mjs']),
	task('cloud-run-crypto-config', node, ['betterpptx-mcp/verify-cloud-run-crypto-config.mjs']),
	task('gcp-payment-secret-gate', node, ['betterpptx-mcp/verify-gcp-payment-secret-gate.mjs', `--project=${gcpProject}`], { timeoutMs: 300000 }),
	task('gcp-payment-schedulers', node, ['betterpptx-mcp/verify-gcp-payment-schedulers.mjs', `--project=${gcpProject}`, ...(liveBase ? [`--base=${liveBase}`] : [])], { timeoutMs: 120000 }),
	task('gcp-cloud-run-scaling', node, ['betterpptx-mcp/verify-gcp-cloud-run-scaling.mjs', `--project=${gcpProject}`], { timeoutMs: 120000 }),
	task('gcp-cloud-tasks-runtime', node, ['betterpptx-mcp/verify-gcp-cloud-tasks-runtime.mjs', `--project=${gcpProject}`], { timeoutMs: 120000 }),
	task('deposit-forwarders', node, ['betterpptx-mcp/verify-deposit-forwarders.mjs']),
	task('deposit-xpub', node, ['betterpptx-mcp/verify-deposit-xpub.mjs']),
	task('forwarder-contract-behavior', node, ['betterpptx-mcp/verify-forwarder-contract-behavior.mjs'], { timeoutMs: 240000 }),
	task('forwarder-sweeper', node, ['betterpptx-mcp/verify-forwarder-sweeper.mjs']),
	task('forwarder-deploy-tooling', node, ['betterpptx-mcp/verify-forwarder-deploy-tooling.mjs'], { timeoutMs: 360000 }),
	task('settlement-collector-wallet-tooling', node, ['betterpptx-mcp/verify-settlement-collector-wallet-tooling.mjs'], { timeoutMs: 180000 }),
	task('settlement-collector-address-tooling', node, ['betterpptx-mcp/verify-settlement-collector-address-tooling.mjs']),
	task('payram-oci-provisioning', node, ['betterpptx-mcp/verify-payram-oci-provisioning.mjs']),
	task('oci-a1-capacity-watcher-runtime', node, ['betterpptx-mcp/verify-oci-a1-capacity-watcher-runtime.mjs']),
	task('payram-oci-bastion-tunnel-tooling', node, ['betterpptx-mcp/verify-payram-oci-bastion-tunnel-tooling.mjs'], { timeoutMs: 180000 }),
	task('payram-phase0-tooling', node, ['betterpptx-mcp/verify-payram-phase0-tooling.mjs']),
	task('payram-public-enablement-resume', node, ['betterpptx-mcp/verify-payram-public-enablement-resume.mjs']),
	task('payram-public-enablement-checklist', node, ['betterpptx-mcp/verify-payram-public-enablement-checklist.mjs']),
	task('payram-public-enablement-continue', node, ['betterpptx-mcp/verify-payram-public-enablement-continue.mjs']),
	task('gas-wallet-status-tooling', node, ['betterpptx-mcp/verify-gas-wallet-status-tooling.mjs']),
	task('x402-self-settle', node, ['betterpptx-mcp/verify-x402-self-settle.mjs']),
	task('x402-pack', node, ['betterpptx-mcp/verify-x402-pack.mjs']),
	task('x402-relayer-concurrency', node, ['betterpptx-mcp/verify-x402-relayer-concurrency.mjs']),
	task('wallet-order-policy', node, ['betterpptx-mcp/verify-wallet-order-policy.mjs']),
	task('payment-envelope', node, ['betterpptx-mcp/verify-payment-envelope.mjs']),
	task('payment-regression-pack', node, ['betterpptx-mcp/verify-payment-regression-pack.mjs'], { timeoutMs: 180000 }),
	task('monetized-mcp-compat', node, ['betterpptx-mcp/verify-monetized-mcp-compat.mjs']),
	task('stateless-mcp-gateway', node, ['betterpptx-mcp/verify-stateless-mcp-gateway.mjs']),
	task('shared-store-probe', node, ['betterpptx-mcp/verify-shared-store-probe.mjs']),
	task('operation-store', node, ['betterpptx-mcp/verify-operation-store.mjs']),
	task('operation-dispatcher', node, ['betterpptx-mcp/verify-operation-dispatcher.mjs']),
	task('durable-operation-inline', node, ['betterpptx-mcp/verify-durable-operation-inline-execution.mjs']),
	task('durable-operation-queued-worker', node, ['betterpptx-mcp/verify-durable-operation-queued-worker.mjs']),
	task('durable-operation-duplicate-delivery', node, ['betterpptx-mcp/verify-durable-operation-duplicate-delivery.mjs']),
	task('durable-operation-worker-http', node, ['betterpptx-mcp/verify-durable-operation-worker-http.mjs']),
	task('deck-state-store', node, ['betterpptx-mcp/verify-deck-state-store.mjs']),
	task('deck-spec-snapshot-store', node, ['betterpptx-mcp/verify-deck-spec-snapshot-store.mjs']),
	task('locked-asset-store', node, ['betterpptx-mcp/verify-locked-asset-store.mjs']),
	task('engine-deck-state-hooks', node, ['betterpptx-mcp/verify-engine-deck-state-hooks.mjs']),
	task('cross-process-rehydrate', node, ['betterpptx-mcp/verify-deck-cross-process-rehydrate-v1.mjs']),
	task('cross-process-locked-asset', node, ['betterpptx-mcp/verify-deck-cross-process-locked-asset-v1.mjs']),
	task('connector-install-flow', node, ['betterpptx-connector/verify-install-flow.mjs']),
	task('connector-auto-wallet', node, ['betterpptx-connector/verify-auto-wallet.mjs']),
	task('connector-funding-resume', node, ['betterpptx-connector/verify-funding-resume.mjs']),
	task('freemium-verifier-syntax', node, ['--check', 'betterpptx-mcp/verify-freemium-gate.mjs']),
	task('connector-install-verifier-syntax', node, ['--check', 'betterpptx-connector/verify-install-flow.mjs']),
	task('powershell-parser', powershell, ['-NoProfile', '-Command', psParserCommand]),
]

if (!skipBuild) {
	tasks.push(task('typescript', npx, [...npxPrefix, 'tsc', '--noEmit'], { timeoutMs: 240000 }))
}
if (!skipInstallDryRun) {
	tasks.push(task('npm-ci-dry-run', npm, [...npmPrefix, 'ci', '--ignore-scripts', '--dry-run'], { timeoutMs: 240000 }))
}
if (liveBase) {
	tasks.push(
		task('live-cloud-run-distributed-runtime', node, ['betterpptx-mcp/verify-cloud-run-distributed-runtime.mjs', `--base=${liveBase}`], { group: 'live', timeoutMs: 240000 }),
		task('live-connector-blackbox', node, ['betterpptx-mcp/verify-connector-blackbox.mjs', `${liveBase}/mcp`], { group: 'live', timeoutMs: 240000 }),
		task('live-freemium-gate', node, ['betterpptx-mcp/verify-freemium-gate.mjs', `${liveBase}/mcp`], { group: 'live', timeoutMs: 240000 }),
		task('live-payment-health', node, ['betterpptx-mcp/verify-live-payment-health.mjs', `--base=${liveBase}`, `--project=${gcpProject}`], { group: 'live', timeoutMs: 240000 }),
	)
}

function tail(text, max = 4000) {
	const value = String(text || '')
	return value.length <= max ? value : value.slice(value.length - max)
}

function run(taskSpec) {
	return new Promise(resolve => {
		const startedAt = Date.now()
		console.log(`\n[executor-audit] START ${taskSpec.id}`)
		let child
		let stdout = ''
		let stderr = ''
		try {
			child = spawn(taskSpec.command, taskSpec.args, {
				cwd: process.cwd(),
				env: process.env,
				windowsHide: true,
				stdio: ['ignore', 'pipe', 'pipe'],
			})
		} catch (error) {
			resolve({
				...taskSpec,
				status: 'failed',
				exitCode: null,
				durationMs: Date.now() - startedAt,
				error: error?.message || String(error),
				stdoutTail: '',
				stderrTail: '',
			})
			return
		}
		const timer = setTimeout(() => {
			child.kill('SIGTERM')
		}, taskSpec.timeoutMs)
		child.stdout.on('data', chunk => {
			const text = String(chunk)
			stdout += text
			process.stdout.write(text)
		})
		child.stderr.on('data', chunk => {
			const text = String(chunk)
			stderr += text
			process.stderr.write(text)
		})
		child.on('error', error => {
			clearTimeout(timer)
			resolve({
				...taskSpec,
				status: 'failed',
				exitCode: null,
				durationMs: Date.now() - startedAt,
				error: error?.message || String(error),
				stdoutTail: tail(stdout),
				stderrTail: tail(stderr),
			})
		})
		child.on('close', code => {
			clearTimeout(timer)
			const durationMs = Date.now() - startedAt
			const status = code === 0 ? 'passed' : 'failed'
			console.log(`[executor-audit] ${status.toUpperCase()} ${taskSpec.id} ${durationMs}ms`)
			resolve({
				...taskSpec,
				status,
				exitCode: code,
				durationMs,
				stdoutTail: tail(stdout),
				stderrTail: tail(stderr),
			})
		})
	})
}

const results = []
for (const item of tasks) {
	const result = await run(item)
	results.push(result)
	if (result.status !== 'passed' && !args.has('--continue-on-fail')) break
}

const failed = results.filter(result => result.status !== 'passed')
const skipped = tasks.slice(results.length).map(item => ({ ...item, status: 'skipped' }))
const summary = {
	ok: failed.length === 0 && skipped.length === 0,
	liveBase: liveBase || null,
	startedTaskCount: results.length,
	totalTaskCount: tasks.length,
	passed: results.filter(result => result.status === 'passed').map(result => result.id),
	failed: failed.map(result => ({ id: result.id, exitCode: result.exitCode, error: result.error || null })),
	skipped: skipped.map(result => result.id),
	results: [...results, ...skipped].map(result => ({
		id: result.id,
		group: result.group,
		status: result.status,
		exitCode: result.exitCode ?? null,
		durationMs: result.durationMs ?? 0,
		command: result.command,
		args: result.args,
		stdoutTail: result.stdoutTail || '',
		stderrTail: result.stderrTail || '',
		error: result.error || null,
	})),
}

const summaryFile = path.join(outputDir, 'summary.json')
fs.writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`)
if (!summary.ok) {
	console.error(`\nPAYRAM OCI X402 EXECUTOR PLAN: FAIL passed=${summary.passed.length}/${tasks.length} summary=${summaryFile}`)
	process.exit(1)
}

console.log(`\nPAYRAM OCI X402 EXECUTOR PLAN: PASS tasks=${tasks.length} live=${liveBase ? 1 : 0} summary=${summaryFile}`)
