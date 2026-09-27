import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'

const args = new Map()
for (let i = 2; i < process.argv.length; i += 1) {
	const arg = process.argv[i]
	if (arg.startsWith('--') && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) {
		args.set(arg, process.argv[++i])
	} else if (arg.startsWith('--')) {
		args.set(arg, '1')
	}
}

const project = String(args.get('--project') || process.env.BETTERPPTX_VERIFY_GCP_PROJECT || 'betterpptx-mcp-staging').trim()
const region = String(args.get('--region') || process.env.BETTERPPTX_VERIFY_GCP_REGION || 'us-central1').trim()
const gatewayService = String(args.get('--service') || process.env.BETTERPPTX_VERIFY_GATEWAY_SERVICE || 'betterpptx-mcp-staging').trim()
const workerService = String(args.get('--worker-service') || process.env.BETTERPPTX_VERIFY_WORKER_SERVICE || `${gatewayService}-worker`).trim()

const generatedSecrets = [
	'betterpptx-install-hmac-secret',
	'betterpptx-payment-envelope-secret',
	'betterpptx-mission-control-token',
	'betterpptx-mission-control-admin-token',
	'betterpptx-payment-scanner-token',
	'betterpptx-payram-webhook-custom-token',
	'betterpptx-operation-worker-token',
	'betterpptx-x402-settlement-mode',
]

const ownerSecrets = [
	'betterpptx-treasury-evm-address',
	'betterpptx-base-rpc-url',
	'betterpptx-x402-gas-relayer-key',
	'betterpptx-deposit-xpub',
]

const optionalSecrets = [
	'betterpptx-base-rpc-urls',
	'betterpptx-deposit-address-inventory',
	'betterpptx-payram-base-url',
	'betterpptx-payram-api-key',
	'betterpptx-payram-project-id',
	'betterpptx-forwarder-factory-address',
	'betterpptx-forwarder-codehash',
	'betterpptx-settlement-collector-evm-address',
	'betterpptx-forwarder-salt-secret',
	'betterpptx-forwarder-sweeper-key',
]

const forbiddenRuntimeSecrets = new Set([
	'betterpptx-payram-hot-wallet-private-key',
])

const requiredBindings = new Map([
	['BETTERPPTX_INSTALL_HMAC_SECRET', 'betterpptx-install-hmac-secret'],
	['BETTERPPTX_PAYMENT_ENVELOPE_SECRET', 'betterpptx-payment-envelope-secret'],
	['BETTERPPTX_MISSION_CONTROL_TOKEN', 'betterpptx-mission-control-token'],
	['BETTERPPTX_MISSION_CONTROL_ADMIN_TOKEN', 'betterpptx-mission-control-admin-token'],
	['BETTERPPTX_OPERATION_WORKER_TOKEN', 'betterpptx-operation-worker-token'],
	['BETTERPPTX_TREASURY_EVM_ADDRESS', 'betterpptx-treasury-evm-address'],
	['BETTERPPTX_BASE_RPC_URL', 'betterpptx-base-rpc-url'],
	['BETTERPPTX_X402_SETTLEMENT_MODE', 'betterpptx-x402-settlement-mode'],
	['BETTERPPTX_X402_RELAYER_PRIVATE_KEY', 'betterpptx-x402-gas-relayer-key'],
	['BETTERPPTX_SCANNER_TOKEN', 'betterpptx-payment-scanner-token'],
	['BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN', 'betterpptx-payram-webhook-custom-token'],
	['BETTERPPTX_DEPOSIT_XPUB_JSON', 'betterpptx-deposit-xpub'],
])

function runGcloud(gcloudArgs, { json = false, allowFailure = false } = {}) {
	const command = process.platform === 'win32' ? 'cmd.exe' : 'gcloud'
	const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'gcloud', ...gcloudArgs] : gcloudArgs
	const result = spawnSync(command, commandArgs, {
		cwd: process.cwd(),
		encoding: 'utf8',
		windowsHide: true,
		maxBuffer: 16 * 1024 * 1024,
	})
	if (result.status !== 0 && !allowFailure) {
		const stderr = String(result.stderr || '').split(/\r?\n/).slice(-8).join('\n')
		throw new Error(`gcloud ${gcloudArgs.slice(0, 4).join(' ')} failed with exit ${result.status}: ${stderr}`)
	}
	if (result.status !== 0) return null
	const stdout = String(result.stdout || '').trim()
	if (!json) return stdout
	return stdout ? JSON.parse(stdout) : {}
}

function runGcloudAsync(gcloudArgs, { json = false, allowFailure = false } = {}) {
	return new Promise((resolve, reject) => {
		const command = process.platform === 'win32' ? 'cmd.exe' : 'gcloud'
		const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'gcloud', ...gcloudArgs] : gcloudArgs
		const child = spawn(command, commandArgs, {
			cwd: process.cwd(),
			env: process.env,
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		})
		let stdout = ''
		let stderr = ''
		child.stdout.on('data', chunk => { stdout += String(chunk) })
		child.stderr.on('data', chunk => { stderr += String(chunk) })
		child.on('error', error => {
			if (allowFailure) resolve(null)
			else reject(error)
		})
		child.on('close', code => {
			if (code !== 0 && !allowFailure) {
				const tail = String(stderr || '').split(/\r?\n/).slice(-8).join('\n')
				reject(new Error(`gcloud ${gcloudArgs.slice(0, 4).join(' ')} failed with exit ${code}: ${tail}`))
				return
			}
			if (code !== 0) {
				resolve(null)
				return
			}
			const value = String(stdout || '').trim()
			resolve(json ? (value ? JSON.parse(value) : {}) : value)
		})
	})
}

async function enabledVersionExists(secretName) {
	const versions = await runGcloudAsync([
		'secrets',
		'versions',
		'list',
		secretName,
		`--project=${project}`,
		'--limit=20',
		'--format=json',
	], { json: true, allowFailure: true })
	return Array.isArray(versions) && versions.some(version => String(version?.state || '').toUpperCase() === 'ENABLED')
}

function serviceDescription(name) {
	return runGcloud([
		'run',
		'services',
		'describe',
		name,
		`--project=${project}`,
		`--region=${region}`,
		'--format=json',
	], { json: true })
}

function envEntries(service) {
	return service?.spec?.template?.spec?.containers?.[0]?.env || []
}

function envMap(service) {
	const map = new Map()
	for (const entry of envEntries(service)) map.set(entry.name, entry)
	return map
}

function secretRef(entry) {
	return entry?.valueFrom?.secretKeyRef?.name || null
}

function secretKey(entry) {
	return entry?.valueFrom?.secretKeyRef?.key || null
}

function runtimeServiceAccount(service) {
	return service?.spec?.template?.spec?.serviceAccountName || ''
}

function assertRuntimeBindings(serviceName, service) {
	const env = envMap(service)
	for (const [envName, secretName] of requiredBindings) {
		const entry = env.get(envName)
		assert(entry, `${serviceName} missing required secret env ${envName}`)
		assert.equal(secretRef(entry), secretName, `${serviceName} ${envName} must bind ${secretName}`)
		assert.equal(secretKey(entry), 'latest', `${serviceName} ${envName} must bind latest version alias`)
	}
	for (const entry of envEntries(service)) {
		const ref = secretRef(entry)
		assert(!forbiddenRuntimeSecrets.has(ref), `${serviceName} must not bind forbidden runtime secret ${ref}`)
		assert.notEqual(entry.name, 'BETTERPPTX_PAYRAM_HOT_WALLET_PRIVATE_KEY', `${serviceName} must not expose PayRam hot wallet key env`)
	}
	assert.equal(env.get('BETTERPPTX_PAYRAM_ENABLED')?.value, '0', `${serviceName} must keep PayRam disabled until proof gates pass`)
	assert.equal(env.get('BETTERPPTX_REQUIRE_CARD_ONRAMP')?.value, '0', `${serviceName} must not require the card rail before public enablement`)
	assert.equal(env.get('BETTERPPTX_PAYRAM_EXACT_QUOTE_ENABLED')?.value, '0', `${serviceName} must keep PayRam exact quotes disabled until proven`)
	assert.equal(env.get('BETTERPPTX_PAYRAM_PARTIAL_CREDIT_POLICY')?.value, 'none', `${serviceName} must fail closed on partial PayRam fills by default`)
	assert.equal(env.get('BETTERPPTX_RAW_SEND_RAIL')?.value, 'xpub', `${serviceName} must remain on transitional xpub raw-send until forwarder proof`)
	assert.equal(env.get('BETTERPPTX_BILLING_PROVIDER')?.value, 'crypto_credits', `${serviceName} must use crypto-credit billing`)
	assert.equal(env.get('BETTERPPTX_X402_RELAYER_LEASE_STORE')?.value, 'firestore', `${serviceName} must use shared Firestore relayer leases`)
	assert.equal(env.get('BETTERPPTX_REQUIRE_SHARED_STORES')?.value, '1', `${serviceName} must require shared payment stores`)
	for (const forwarderEnv of [
		'BETTERPPTX_FORWARDER_FACTORY_ADDRESS',
		'BETTERPPTX_FORWARDER_CODEHASH',
		'BETTERPPTX_SETTLEMENT_COLLECTOR_EVM_ADDRESS',
		'BETTERPPTX_FORWARDER_SALT_SECRET',
		'BETTERPPTX_FORWARDER_SWEEPER_KEY',
	]) {
		assert(!env.has(forwarderEnv), `${serviceName} must not bind ${forwarderEnv} before CREATE2 proof/public-enable switch`)
	}
}

function secretIamPolicy(secretName) {
	return runGcloud([
		'secrets',
		'get-iam-policy',
		secretName,
		`--project=${project}`,
		'--format=json',
	], { json: true, allowFailure: true }) || {}
}

function membersWithSecretAccessor(policy) {
	return (policy.bindings || [])
		.filter(binding => binding.role === 'roles/secretmanager.secretAccessor')
		.flatMap(binding => binding.members || [])
}

const requiredSecretNames = [...generatedSecrets, ...ownerSecrets]
const requiredSecretChecks = await Promise.all(requiredSecretNames.map(async name => [name, await enabledVersionExists(name)]))
for (const [name, ok] of requiredSecretChecks) {
	assert(ok, `Required Secret Manager secret has no enabled version: ${name}`)
}

const optionalChecks = await Promise.all(optionalSecrets.map(async name => [name, await enabledVersionExists(name)]))
const optionalPresent = optionalChecks.filter(([, ok]) => ok).map(([name]) => name)
assert(await enabledVersionExists('betterpptx-payram-hot-wallet-private-key'), 'PayRam hot wallet key should exist for owner/OCI custody checks.')

const gateway = serviceDescription(gatewayService)
const worker = serviceDescription(workerService)
assertRuntimeBindings(gatewayService, gateway)
assertRuntimeBindings(workerService, worker)

const runtimeServiceAccounts = new Set([runtimeServiceAccount(gateway), runtimeServiceAccount(worker)].filter(Boolean))
assert(runtimeServiceAccounts.size >= 1, 'At least one Cloud Run runtime service account must be resolved.')

const hotWalletPolicy = secretIamPolicy('betterpptx-payram-hot-wallet-private-key')
const hotWalletSecretAccessors = membersWithSecretAccessor(hotWalletPolicy)
for (const serviceAccount of runtimeServiceAccounts) {
	const member = `serviceAccount:${serviceAccount}`
	assert(!hotWalletSecretAccessors.includes(member), `Runtime service account must not have PayRam hot-wallet Secret Manager access: ${serviceAccount}`)
}

const gatewayEnv = envMap(gateway)
const workerEnv = envMap(worker)
const gatewayConcurrency = Number(gatewayEnv.get('BETTERPPTX_MCP_REQUEST_CONCURRENCY')?.value || 0)
const workerConcurrency = Number(workerEnv.get('BETTERPPTX_MCP_REQUEST_CONCURRENCY')?.value || 0)
assert(gatewayConcurrency >= 8, 'Gateway request concurrency must leave payment/control headroom.')
assert(workerConcurrency === 1, 'Worker heavy deck concurrency should stay isolated at one request per worker instance.')
assert.equal(gatewayEnv.get('BETTERPPTX_EDIT_STATE_MODE')?.value, 'distributed', 'Gateway must run distributed state mode.')
assert.equal(workerEnv.get('BETTERPPTX_EDIT_STATE_MODE')?.value, 'distributed', 'Worker must run distributed state mode.')
assert.equal(gatewayEnv.get('BETTERPPTX_OPERATION_EXECUTION_MODE')?.value, 'queued', 'Gateway must queue durable operations.')

console.log(`GCP PAYMENT SECRET GATE: PASS project=${project} services=2 requiredSecrets=${generatedSecrets.length + ownerSecrets.length} optionalPresent=${optionalPresent.length} runtimeSAs=${runtimeServiceAccounts.size} hotWalletIsolated=1 payramDisabled=1 rawSendRail=xpub`)
