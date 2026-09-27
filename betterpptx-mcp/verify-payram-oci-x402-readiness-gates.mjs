import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { buildPaymentLaunchEvidence } from './billing/payment-launch-evidence.mjs'

const planPath = path.resolve('plans', 'payram-oci-x402-payment-intents-executor-plan-2026-06-16-codexpreview.md')
const progressPath = path.resolve('plans', 'payram-oci-x402-implementation-progress-2026-06-17-codexpreview.md')
const watcherStatePath = path.resolve('outputs', 'oci-a1-capacity-watch', 'state.json')
const executorPath = path.resolve('betterpptx-mcp', 'verify-payram-oci-x402-executor-plan.mjs')

function readText(file) {
	return fs.readFileSync(file, 'utf8')
}

function assertIncludes(text, needle, message) {
	assert(text.includes(needle), message || `Missing ${needle}`)
}

function readWatcherState() {
	if (!fs.existsSync(watcherStatePath)) return null
	return JSON.parse(fs.readFileSync(watcherStatePath, 'utf8'))
}

const plan = readText(planPath)
const progress = readText(progressPath)
const executor = readText(executorPath)

assertIncludes(plan, 'Revision: codexpreview-2026-06-18-r66', 'Plan must record the current r66 executor revision.')
assertIncludes(progress, 'Source plan: `plans/payram-oci-x402-payment-intents-executor-plan-2026-06-16-codexpreview.md` r66', 'Progress file must point at the current r66 plan.')
assertIncludes(executor, "task('payment-regression-pack'", 'Canonical executor audit must include the payment regression pack.')

const evidence = buildPaymentLaunchEvidence({})
const expectedEvidenceIds = [
	'payram-oci-host',
	'payram-dns-https',
	'payram-backup-restore',
	'payram-oci-alarms',
	'payram-phase0-live',
	'forwarder-custody-backup',
	'forwarder-external-proof',
	'forwarder-owner-review',
]
assert.equal(evidence.publicEnableReady, false, 'Public-enable evidence must fail closed with no owner stamps/evidence files.')
assert.deepEqual(evidence.items.map(item => item.id), expectedEvidenceIds, 'Payment launch evidence must enumerate every public-enable proof gate in order.')
for (const item of evidence.items) {
	assert(['deferred', 'warn'].includes(item.status), `Unproven evidence gate must not be ok: ${item.id}`)
	assert(item.detail && typeof item.detail === 'string', `Evidence gate must explain the missing proof: ${item.id}`)
}

for (const gate of [
	'Create or configure a separate settlement collector/router address',
	'Fund the PayRam SCW deployer with Base ETH only',
	"Run `deploy/gcp/resume-payram-scw-after-funding.ps1 -RunDeploy -ConfirmDeploy 'DEPLOY PAYRAM SCW'`",
	'Run PayRam Phase 0 proof after the PayRam project wallet is linked',
	'Run CREATE2 external proof',
	'Do not public-enable PayRam or forwarder raw-send until proof evidence is recorded',
	'Fund the x402 gas-only relayer address',
	'Fund the PayRam hot/sweep and forwarder sweeper gas wallets',
	'Only after a payment link opens and a small live payment/status proof is recorded should the Cloud Run PayRam card rail be enabled',
]) {
	assertIncludes(progress, gate, `Progress file must keep explicit remaining gate: ${gate}`)
}

for (const gate of [
	'final DNS/HTTPS stable and recorded by `verify-payram-dns-https.ps1`',
	'PayRam live payment proof complete',
	'CREATE2 forwarder tests, Base Sepolia proof, and capped live-value Base mainnet canary complete before forwarder raw-send is public',
	'distributed Cloud Run runtime proof has passed and is marked through the explicit deploy switch',
]) {
	assertIncludes(plan, gate, `Plan must keep public enablement gate: ${gate}`)
}

const watcher = readWatcherState()
let watcherStatus = 'missing'
let watcherAttempts = 'na'
let watcherDecisionRequired = 'na'
if (watcher) {
	watcherStatus = String(watcher.lastStatus || '')
	watcherAttempts = Number.isFinite(Number(watcher.attempts)) ? Number(watcher.attempts) : 'na'
	watcherDecisionRequired = watcher.decisionRequired === true
	const allowedStatuses = new Set([
		'initialized',
		'in_progress',
		'attempt_timeout',
		'capacity_miss',
		'decision_required',
		'provisioned_or_exists',
	])
	assert(allowedStatuses.has(watcherStatus), `Unexpected OCI A1 watcher status: ${watcherStatus}`)
	assert(typeof watcher.decisionRequired === 'boolean', 'OCI A1 watcher decisionRequired must be boolean.')
	if (watcher.decisionRequired) {
		assert.equal(watcherStatus, 'decision_required', 'decisionRequired=true must use decision_required status.')
		assert(watcher.decisionRequiredAt, 'decisionRequired=true must record decisionRequiredAt.')
	} else {
		assert.notEqual(watcherStatus, 'decision_required', 'decision_required status must set decisionRequired=true.')
	}
	if (watcherStatus === 'capacity_miss' || watcherStatus === 'in_progress' || watcherStatus === 'attempt_timeout') {
		assert(Number(watcher.attempts) > 0, 'Retrying watcher state must record attempts.')
	}
	if (watcherStatus === 'attempt_timeout') {
		assert(Number(watcher.attemptTimeouts) > 0, 'attempt_timeout watcher state must record attemptTimeouts.')
	}
	if (watcherStatus === 'capacity_miss') {
		assert(Number(watcher.capacityMisses) > 0, 'capacity_miss watcher state must record capacityMisses.')
	}
}

console.log([
	'PAYRAM OCI X402 READINESS GATES: PASS',
	'publicEnableReady=0',
	`evidenceItems=${evidence.items.length}`,
	`watcher=${watcherStatus}`,
	`attempts=${watcherAttempts}`,
	`decisionRequired=${watcherDecisionRequired}`,
	'remainingExternalGates=9',
].join(' '))
