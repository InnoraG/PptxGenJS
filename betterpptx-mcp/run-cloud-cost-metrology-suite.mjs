import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Canonical W0-W6 Cloud Run workload driver. Zero-payment: it never invokes x402 settle, PayRam,
// wallet order creation, or on-chain raw-send. It enforces a topology-scoped safety envelope.

export class CostHarnessError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'CostHarnessError'
		this.code = code
		this.details = details
	}
}

export const KNOWN_WORKLOADS = Object.freeze(['W0', 'W1', 'W2', 'W3', 'W3-smoke', 'W3-delta', 'W4', 'W5', 'W6'])

export const TOPOLOGY_ROLES = Object.freeze(['serial-baseline', 'production-gateway', 'production-worker'])

export const REQUIRED_SHARED_STORE_ENV = Object.freeze({
	BETTERPPTX_BILLING_LEDGER_STORE: 'firestore',
	BETTERPPTX_ENTITLEMENT_STORE: 'firestore',
	BETTERPPTX_INSTALL_USAGE_STORE: 'firestore',
	BETTERPPTX_CRYPTO_ORDER_STORE: 'firestore',
	BETTERPPTX_X402_STORE: 'firestore',
	BETTERPPTX_ARTIFACT_STORE: 'gcs',
})

// Env/flags that indicate any payment rail. The runner refuses to start if any are active.
const PAYMENT_RAIL_ENV = Object.freeze({
	BETTERPPTX_PAYRAM_ENABLED: '1',
	BETTERPPTX_REQUIRE_CARD_ONRAMP: '1',
	BETTERPPTX_PAYRAM_EXACT_QUOTE_ENABLED: '1',
})

// Pure, testable: throw if any payment rail is enabled in env or requested via flags.
export function assertZeroPayment({ env = process.env, flags = {} } = {}) {
	for (const [name, bad] of Object.entries(PAYMENT_RAIL_ENV)) {
		if (String(env[name] ?? '') === bad) {
			throw new CostHarnessError('PAYMENT_RAIL_ENABLED', `Refusing to run: ${name}=${bad} indicates a payment rail is enabled.`, { name })
		}
	}
	const rawSend = String(env.BETTERPPTX_RAW_SEND_RAIL ?? 'disabled').toLowerCase()
	if (rawSend !== 'disabled' && rawSend !== 'private-canary') {
		throw new CostHarnessError('RAW_SEND_RAIL_ENABLED', `Refusing to run: BETTERPPTX_RAW_SEND_RAIL=${rawSend} is not disabled/private-canary.`, { rawSend })
	}
	if (flags.x402Settle || flags.settle || flags.payramCheckout || flags.broadcast) {
		throw new CostHarnessError('PAYMENT_FLAG_REQUESTED', 'Refusing to run: a settlement/checkout/broadcast flag was requested.', { flags })
	}
	return true
}

export function assertSharedStoreEnv({ env = process.env, requireArtifactBucket = true } = {}) {
	if (String(env.BETTERPPTX_REQUIRE_SHARED_STORES ?? '') !== '1') return true
	for (const [name, expected] of Object.entries(REQUIRED_SHARED_STORE_ENV)) {
		const actual = String(env[name] ?? '').trim().toLowerCase()
		if (actual !== expected) {
			throw new CostHarnessError('SHARED_STORE_CONFIG_INCOMPLETE', `${name} must be ${expected} when BETTERPPTX_REQUIRE_SHARED_STORES=1.`, { name, expected, actual })
		}
	}
	if (requireArtifactBucket && !String(env.BETTERPPTX_GCS_BUCKET ?? '').trim()) {
		throw new CostHarnessError('SHARED_STORE_CONFIG_INCOMPLETE', 'BETTERPPTX_GCS_BUCKET is required when BETTERPPTX_REQUIRE_SHARED_STORES=1 and BETTERPPTX_ARTIFACT_STORE=gcs.', { name: 'BETTERPPTX_GCS_BUCKET' })
	}
	return true
}

export function cloudBuildSourceKind(build = {}) {
	if (
		build?.source?.repoSource
		|| build?.source?.gitSource
		|| build?.source?.connectedRepository
		|| build?.sourceProvenance?.resolvedRepoSource
		|| build?.sourceProvenance?.resolvedGitSource
		|| build?.sourceProvenance?.resolvedConnectedRepository
	) {
		return 'git'
	}
	if (build?.source?.storageSource || build?.sourceProvenance?.resolvedStorageSource) {
		return 'storage_tarball'
	}
	return 'unknown'
}

export function assertMatrixGradeSourceProvenance({ build = {}, provenance = {}, requireCleanTree = true } = {}) {
	const kind = String(provenance.cloudBuildSourceKind || cloudBuildSourceKind(build) || '').trim()
	if (kind !== 'git') {
		throw new CostHarnessError('SOURCE_PROVENANCE_NOT_GIT', 'Matrix-grade metrology requires git-backed Cloud Build provenance.', { cloudBuildSourceKind: kind || 'unknown' })
	}
	const gitCommit = String(
		provenance.gitCommit
		|| provenance.commitSha
		|| build?.source?.repoSource?.commitSha
		|| build?.sourceProvenance?.resolvedRepoSource?.commitSha
		|| build?.substitutions?.COMMIT_SHA
		|| build?.substitutions?.REVISION_ID
		|| build?.source?.gitSource?.revision
		|| build?.sourceProvenance?.resolvedGitSource?.revision
		|| build?.source?.connectedRepository?.revision
		|| build?.sourceProvenance?.resolvedConnectedRepository?.revision
		|| ''
	).trim()
	if (!/^[0-9a-f]{40}$/i.test(gitCommit)) {
		throw new CostHarnessError('SOURCE_COMMIT_MISSING', 'Matrix-grade metrology requires a 40-character git commit SHA.', { gitCommit })
	}
	if (requireCleanTree && provenance.gitTreeClean !== true) {
		throw new CostHarnessError('SOURCE_TREE_NOT_CLEAN', 'Matrix-grade metrology requires clean-tree provenance for the recorded git commit.', { gitTreeClean: provenance.gitTreeClean })
	}
	const imageDigest = String(provenance.imageDigest || build?.results?.images?.[0]?.digest || '').trim()
	if (!/^sha256:[0-9a-f]{64}$/i.test(imageDigest)) {
		throw new CostHarnessError('IMAGE_DIGEST_MISSING', 'Matrix-grade metrology requires an immutable image digest.', { imageDigest })
	}
	return { cloudBuildSourceKind: kind, gitCommit, imageDigest }
}

export function assertCloudRunReady(service = {}) {
	const conditions = Array.isArray(service?.status?.conditions) ? service.status.conditions : []
	const ready = conditions.find(condition => condition?.type === 'Ready')
	if (!ready || String(ready.status) !== 'True') {
		throw new CostHarnessError('CLOUD_RUN_NOT_READY', 'Cloud Run revision/service is not Ready=True and cannot produce metrology evidence.', { ready: ready || null })
	}
	return true
}

// Pure, testable: validate the topology-scoped scaling envelope (B1/C1).
export function resolveTopologyEnvelope({ topology, concurrencyTarget, maxInstancesCap, minInstancesTarget } = {}) {
	if (!TOPOLOGY_ROLES.includes(topology)) {
		throw new CostHarnessError('TOPOLOGY_INVALID', `topology must be one of ${TOPOLOGY_ROLES.join(', ')}.`, { topology })
	}
	if (topology === 'serial-baseline') {
		const c = concurrencyTarget ?? 1
		const mx = maxInstancesCap ?? 1
		const mn = minInstancesTarget ?? 0
		if (c !== 1 || mx !== 1 || mn !== 0) {
			throw new CostHarnessError('SERIAL_ENVELOPE_VIOLATION', 'serial-baseline requires concurrency=1, maxInstances=1, minInstances=0.', { c, mx, mn })
		}
		return { topology, concurrency: 1, maxInstances: 1, minInstances: 0, serial: true }
	}
	const concurrency = Number(concurrencyTarget)
	const maxInstances = Number(maxInstancesCap)
	const minInstances = Number(minInstancesTarget ?? 0)
	if (!(concurrency >= 1) || !(maxInstances >= 1) || (concurrency <= 1 && maxInstances <= 1)) {
		throw new CostHarnessError('PRODUCTION_ENVELOPE_INVALID', 'Production topology requires explicit non-serial concurrency and/or maxInstances cap.', { concurrency, maxInstances })
	}
	return { topology, concurrency, maxInstances, minInstances, serial: false }
}

export function planWorkloads(list = []) {
	const requested = (Array.isArray(list) ? list : String(list).split(',')).map(w => w.trim()).filter(Boolean)
	const unknown = requested.filter(w => !KNOWN_WORKLOADS.includes(w))
	if (unknown.length) throw new CostHarnessError('WORKLOAD_UNKNOWN', `Unknown workloads: ${unknown.join(', ')}.`, { unknown })
	return requested
}

function getIdentityToken(provided) {
	if (provided) return provided
	const result = spawnSync('gcloud', ['auth', 'print-identity-token'], { encoding: 'utf8' })
	if (result.status !== 0) throw new CostHarnessError('IDENTITY_TOKEN_FAILED', 'Could not obtain IAM identity token.', { stderr: result.stderr })
	return result.stdout.trim()
}

async function httpJson(url, { method = 'GET', token, body, timeoutMs = 30000 } = {}) {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	try {
		const res = await fetch(url, {
			method,
			headers: {
				...(token ? { Authorization: `Bearer ${token}` } : {}),
				...(body ? { 'Content-Type': 'application/json' } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
			signal: controller.signal,
		})
		const text = await res.text()
		let json = null
		try { json = text ? JSON.parse(text) : null } catch { /* non-json */ }
		return { status: res.status, json, text }
	} finally {
		clearTimeout(timer)
	}
}

function deviceToken(runId) {
	return `metrology-install-${crypto.createHash('sha256').update(String(runId)).digest('hex').slice(0, 24)}`
}

async function checkServiceSafety({ base, token }) {
	// Health + payment-capability readiness: abort if the service advertises public payment enablement.
	const health = await httpJson(`${base.replace(/\/$/, '')}/health`, { token })
	if (health.status !== 200) {
		throw new CostHarnessError('HEALTH_CHECK_FAILED', `Service health check returned HTTP ${health.status}.`, { health: health.text?.slice(0, 200) })
	}
	const caps = await httpJson(`${base.replace(/\/$/, '')}/payments/capabilities`, { token })
	if (caps.status === 200 && caps.json) {
		const j = caps.json
		const publicPayments = j.publicEnabled || j.payramEnabled || j.x402SettleEnabled || j.cardOnrampEnabled
		if (publicPayments) {
			throw new CostHarnessError('PUBLIC_PAYMENTS_ENABLED', 'Service readiness reports public payment enablement; aborting metrology.', { caps: j })
		}
	}
	return { healthOk: true, capabilities: caps.json || null }
}

export function buildManifest({ runId, base, project, region, envelope, billingMode, cpuAlwaysAllocated, workloads, minGrossUsdSignal, maxGrossUsd, dryRun, sourceProvenance = null }) {
	return {
		schemaVersion: 'betterpptx.cost-metrology-manifest.v1',
		runId,
		generatedAt: new Date().toISOString(),
		base: base || null,
		project: project || null,
		region: region || null,
		cloudRunBillingMode: billingMode,
		cpuAlwaysAllocated: cpuAlwaysAllocated ?? (billingMode === 'instance_based'),
		topologyRole: envelope.topology,
		serviceShape: {
			concurrency: envelope.concurrency,
			maxInstances: envelope.maxInstances,
			minInstances: envelope.minInstances,
		},
		workloads,
		minGrossUsdSignal: Number(minGrossUsdSignal) || 0,
		maxGrossUsd: Number(maxGrossUsd) || 0,
		dryRun: Boolean(dryRun),
		sourceProvenance,
		zeroPayment: {
			x402Settle: false,
			payramCheckout: false,
			walletOrderCreate: false,
			onChainRawSend: false,
		},
		deviceToken: deviceToken(runId),
	}
}

// Minimal serial workload runner. W0 = idle (no requests). W3-smoke = a few light tool calls.
// Heavy workloads (W1/W2/W6) are delegated to their dedicated harnesses in the full run.
async function runWorkload(name, { base, token, maxGrossUsd, smokeOps = 3 }) {
	const events = []
	const startedAt = new Date().toISOString()
	if (name === 'W0') {
		const start = Date.now()
		// idle window: send no MCP requests; just dwell so monitoring/logs capture idle burn.
		const idleMs = Number(process.env.BETTERPPTX_METROLOGY_IDLE_MS || 5000)
		while (Date.now() - start < idleMs) { await new Promise(r => setTimeout(r, 250)) }
		events.push({ kind: 'idle', idleMs })
	} else if (name === 'W3-smoke') {
		for (let i = 0; i < smokeOps; i += 1) {
			const res = await httpJson(`${base.replace(/\/$/, '')}/health`, { token })
			events.push({ kind: 'smoke-probe', op: i, status: res.status })
			if (res.status !== 200) throw new CostHarnessError('SMOKE_OP_FAILED', `W3-smoke op ${i} returned HTTP ${res.status}.`)
		}
	} else {
		// Delegated heavy workloads are not executed by this minimal driver path.
		events.push({ kind: 'delegated', note: `${name} is executed via its dedicated harness in the full run.` })
	}
	return {
		workload: name,
		startedAt,
		finishedAt: new Date().toISOString(),
		ok: true,
		events,
		serial: true,
	}
}

export async function runSuite(options = {}) {
	const {
		base, project, region, runId, outDir, topology = 'serial-baseline',
		concurrencyTarget, maxInstancesCap, minInstancesTarget,
		workloads = ['W0', 'W3-smoke'], minGrossUsdSignal = 0, maxGrossUsd = 5,
		billingMode = 'request_based', cpuAlwaysAllocated, identityToken, dryRun = false,
		flags = {},
	} = options

	assertZeroPayment({ env: process.env, flags })
	const envelope = resolveTopologyEnvelope({ topology, concurrencyTarget, maxInstancesCap, minInstancesTarget })
	const plan = planWorkloads(workloads)
	const out = path.resolve(outDir)
	fs.mkdirSync(out, { recursive: true })

	const manifest = buildManifest({ runId, base, project, region, envelope, billingMode, cpuAlwaysAllocated, workloads: plan, minGrossUsdSignal, maxGrossUsd, dryRun })
	fs.writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

	const summaries = []
	if (dryRun) {
		for (const name of plan) {
			summaries.push({ workload: name, planned: true, serial: envelope.serial, note: 'dry-run: no requests issued' })
		}
	} else {
		if (!base) throw new CostHarnessError('BASE_REQUIRED', 'A private metrology service --base URL is required for a live run.')
		const token = getIdentityToken(identityToken)
		const safety = await checkServiceSafety({ base, token })
		manifest.serviceSafety = safety
		for (const name of plan) {
			const summary = await runWorkload(name, { base, token, maxGrossUsd })
			summaries.push(summary)
		}
	}
	const workloadsDir = path.join(out, 'workloads')
	fs.mkdirSync(workloadsDir, { recursive: true })
	for (const summary of summaries) {
		const dir = path.join(workloadsDir, summary.workload)
		fs.mkdirSync(dir, { recursive: true })
		fs.writeFileSync(path.join(dir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
	}
	fs.writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
	return { ok: true, manifest, summaries, outDir: out }
}

function parseArgs(argv) {
	const out = {
		base: '', project: '', region: 'us-central1', runId: '', outDir: '',
		topology: 'serial-baseline', concurrencyTarget: undefined, maxInstancesCap: undefined, minInstancesTarget: undefined,
		workloads: 'W0,W3-smoke', minGrossUsdSignal: 0, maxGrossUsd: 5, billingMode: 'request_based',
		cpuAlwaysAllocated: undefined, identityToken: '', dryRun: false,
	}
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		if (arg === '--base') out.base = String(argv[++index] || '')
		else if (arg === '--project') out.project = String(argv[++index] || '')
		else if (arg === '--region') out.region = String(argv[++index] || '')
		else if (arg === '--run-id') out.runId = String(argv[++index] || '')
		else if (arg === '--out') out.outDir = path.resolve(argv[++index])
		else if (arg === '--topology') out.topology = String(argv[++index] || '').split(',')[0]
		else if (arg === '--concurrency-target') out.concurrencyTarget = Number(argv[++index])
		else if (arg === '--max-instances-cap') out.maxInstancesCap = Number(argv[++index])
		else if (arg === '--min-instances-target') out.minInstancesTarget = Number(argv[++index])
		else if (arg === '--workloads') out.workloads = String(argv[++index] || '')
		else if (arg === '--min-gross-usd-signal') out.minGrossUsdSignal = Number(argv[++index])
		else if (arg === '--max-gross-usd') out.maxGrossUsd = Number(argv[++index])
		else if (arg === '--billing-mode') out.billingMode = String(argv[++index] || '')
		else if (arg === '--cpu-always-allocated') out.cpuAlwaysAllocated = true
		else if (arg === '--identity-token') out.identityToken = String(argv[++index] || '')
		else if (arg === '--dry-run') out.dryRun = true
		else if (arg === '--help') out.help = true
		else throw new Error(`Unknown argument: ${arg}`)
	}
	return out
}

async function main() {
	const args = parseArgs(process.argv.slice(2))
	if (args.help || !args.runId || !args.outDir) {
		console.log('Usage: node betterpptx-mcp/run-cloud-cost-metrology-suite.mjs --run-id ID --out DIR [--base URL] [--topology serial-baseline|production-gateway|production-worker] [--concurrency-target N --max-instances-cap N --min-instances-target N] [--workloads W0,W3-smoke] [--min-gross-usd-signal N] [--max-gross-usd N] [--billing-mode request_based|instance_based] [--dry-run]')
		process.exit(args.help ? 0 : 2)
	}
	try {
		const result = await runSuite(args)
		console.log(`COST METROLOGY SUITE: ${args.dryRun ? 'DRY-RUN ' : ''}ok topology=${result.manifest.topologyRole} workloads=${result.manifest.workloads.join(',')} out=${result.outDir}`)
	} catch (error) {
		console.error(`COST METROLOGY SUITE FAILED: ${error.code || ''} ${error.message}`)
		process.exit(1)
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
