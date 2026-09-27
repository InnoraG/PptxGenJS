import assert from 'node:assert/strict'
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

const project = String(args.get('--project') || process.env.BETTERPPTX_VERIFY_GCP_PROJECT || 'betterpptx-mcp-staging').trim()
const region = String(args.get('--region') || process.env.BETTERPPTX_VERIFY_GCP_REGION || 'us-central1').trim()
const gatewayService = String(args.get('--service') || process.env.BETTERPPTX_VERIFY_GATEWAY_SERVICE || 'betterpptx-mcp-staging').trim()
const workerService = String(args.get('--worker-service') || process.env.BETTERPPTX_VERIFY_WORKER_SERVICE || `${gatewayService}-worker`).trim()

const requiredQueues = new Map([
	['betterpptx-deck-interactive', { maxConcurrentDispatches: 20, maxDispatchesPerSecond: 10 }],
	['betterpptx-deck-batch', { maxConcurrentDispatches: 4, maxDispatchesPerSecond: 2 }],
	['betterpptx-media-long', { maxConcurrentDispatches: 4, maxDispatchesPerSecond: 2 }],
	['betterpptx-reconciliation', { maxConcurrentDispatches: 4, maxDispatchesPerSecond: 2 }],
	['betterpptx-x402-relayer', { maxConcurrentDispatches: 1, maxDispatchesPerSecond: 2 }],
])

const queueEnvNames = new Map([
	['BETTERPPTX_CLOUD_TASKS_QUEUE_DECK_INTERACTIVE', 'betterpptx-deck-interactive'],
	['BETTERPPTX_CLOUD_TASKS_QUEUE_DECK_BATCH', 'betterpptx-deck-batch'],
	['BETTERPPTX_CLOUD_TASKS_QUEUE_MEDIA', 'betterpptx-media-long'],
	['BETTERPPTX_CLOUD_TASKS_QUEUE_RECONCILIATION', 'betterpptx-reconciliation'],
	['BETTERPPTX_CLOUD_TASKS_QUEUE_RELAYER', 'betterpptx-x402-relayer'],
])

function runGcloud(gcloudArgs, { json = false } = {}) {
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
		child.on('error', reject)
		child.on('close', code => {
			if (code !== 0) {
				const tail = String(stderr || '').split(/\r?\n/).slice(-8).join('\n')
				reject(new Error(`gcloud ${gcloudArgs.slice(0, 4).join(' ')} failed with exit ${code}: ${tail}`))
				return
			}
			const value = String(stdout || '').trim()
			resolve(json ? (value ? JSON.parse(value) : {}) : value)
		})
	})
}

async function serviceDescription(name) {
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

async function serviceIamPolicy(name) {
	return runGcloud([
		'run',
		'services',
		'get-iam-policy',
		name,
		`--project=${project}`,
		`--region=${region}`,
		'--format=json',
	], { json: true })
}

async function queueList() {
	return runGcloud([
		'tasks',
		'queues',
		'list',
		`--project=${project}`,
		`--location=${region}`,
		'--format=json',
	], { json: true })
}

function container(service) {
	return service?.spec?.template?.spec?.containers?.[0] || {}
}

function spec(service) {
	return service?.spec?.template?.spec || {}
}

function envMap(service) {
	const out = new Map()
	for (const entry of container(service)?.env || []) out.set(entry.name, entry.value)
	return out
}

function bindingMembers(policy, role) {
	return (policy?.bindings || [])
		.filter(binding => binding.role === role)
		.flatMap(binding => binding.members || [])
}

function assertQueueShape(queue) {
	const id = String(queue?.name || '').split('/').pop()
	const expected = requiredQueues.get(id)
	assert(expected, `Unexpected queue checked: ${id}`)
	assert.equal(queue.state, 'RUNNING', `${id} must be RUNNING.`)
	assert.equal(Number(queue.rateLimits?.maxConcurrentDispatches), expected.maxConcurrentDispatches, `${id} maxConcurrentDispatches drifted.`)
	assert.equal(Number(queue.rateLimits?.maxDispatchesPerSecond), expected.maxDispatchesPerSecond, `${id} maxDispatchesPerSecond drifted.`)
	assert.equal(Number(queue.retryConfig?.maxAttempts), 100, `${id} maxAttempts must preserve durable retries.`)
	assert.equal(queue.retryConfig?.minBackoff, '0.100s', `${id} minBackoff must stay low for transient dispatch errors.`)
	assert.equal(queue.retryConfig?.maxBackoff, '3600s', `${id} maxBackoff must cap retry storms.`)
}

function assertQueueEnv(label, service, workerUrl = null) {
	const env = envMap(service)
	assert.equal(env.get('BETTERPPTX_OPERATION_DISPATCHER'), 'cloud-tasks', `${label} must use Cloud Tasks dispatcher.`)
	assert.equal(env.get('BETTERPPTX_CLOUD_TASKS_PROJECT'), project, `${label} Cloud Tasks project must match live project.`)
	assert.equal(env.get('BETTERPPTX_CLOUD_TASKS_LOCATION'), region, `${label} Cloud Tasks location must match live region.`)
	for (const [envName, expectedQueue] of queueEnvNames) {
		assert.equal(env.get(envName), expectedQueue, `${label} ${envName} must target ${expectedQueue}.`)
	}
	if (workerUrl) {
		assert.equal(env.get('BETTERPPTX_OPERATION_WORKER_URL'), workerUrl, 'Gateway must dispatch heavy work to the private worker service URL.')
	}
}

function assertPublicGateway(policy) {
	const invokers = bindingMembers(policy, 'roles/run.invoker')
	assert(invokers.includes('allUsers'), 'Gateway must remain publicly invokable as the public MCP entry point.')
}

function assertPrivateWorker(policy, runtimeServiceAccount) {
	const invokers = bindingMembers(policy, 'roles/run.invoker')
	assert(!invokers.includes('allUsers'), 'Worker must not allow unauthenticated public invocation.')
	assert(!invokers.includes('allAuthenticatedUsers'), 'Worker must not allow broad authenticated invocation.')
	assert(invokers.includes(`serviceAccount:${runtimeServiceAccount}`), 'Worker must allow only the audited runtime service account to invoke it.')
}

const [gateway, worker, gatewayIam, workerIam, queues] = await Promise.all([
	serviceDescription(gatewayService),
	serviceDescription(workerService),
	serviceIamPolicy(gatewayService),
	serviceIamPolicy(workerService),
	queueList(),
])

const queuesById = new Map((Array.isArray(queues) ? queues : []).map(queue => [String(queue.name || '').split('/').pop(), queue]))
for (const [queueId] of requiredQueues) {
	const queue = queuesById.get(queueId)
	assert(queue, `Required Cloud Tasks queue is missing: ${queueId}`)
	assertQueueShape(queue)
}

assertQueueEnv('Gateway', gateway, worker.status?.url)
assertQueueEnv('Worker', worker)
assert.equal(spec(gateway).serviceAccountName, spec(worker).serviceAccountName, 'Gateway and worker must share the audited runtime service account.')
assert.equal(envMap(gateway).get('BETTERPPTX_OPERATION_WORKER_SERVICE_ACCOUNT'), spec(worker).serviceAccountName, 'Gateway worker service account env must match the live worker identity.')
assert.equal(envMap(worker).get('BETTERPPTX_OPERATION_WORKER_SERVICE_ACCOUNT'), spec(worker).serviceAccountName, 'Worker service account env must match the live worker identity.')
assertPublicGateway(gatewayIam)
assertPrivateWorker(workerIam, spec(worker).serviceAccountName)

console.log(`GCP CLOUD TASKS RUNTIME: PASS project=${project} queues=${requiredQueues.size} relayerConcurrency=1 workerPrivate=1 gatewayPublic=1`)
