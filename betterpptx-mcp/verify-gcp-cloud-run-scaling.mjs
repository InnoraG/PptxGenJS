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

function annotations(service) {
	return service?.spec?.template?.metadata?.annotations || {}
}

function serviceAnnotations(service) {
	return service?.metadata?.annotations || {}
}

function spec(service) {
	return service?.spec?.template?.spec || {}
}

function container(service) {
	return spec(service)?.containers?.[0] || {}
}

function envMap(service) {
	const out = new Map()
	for (const entry of container(service)?.env || []) out.set(entry.name, entry.value)
	return out
}

function numericEnv(service, name) {
	const value = Number(envMap(service).get(name))
	assert(Number.isFinite(value), `${service?.metadata?.name || 'service'} ${name} must be numeric.`)
	return value
}

function maxScale(service) {
	const value = Number(annotations(service)['autoscaling.knative.dev/maxScale'])
	assert(Number.isFinite(value), `${service.metadata.name} maxScale must be configured.`)
	return value
}

function minScale(service) {
	const raw = annotations(service)['autoscaling.knative.dev/minScale']
	if (raw === undefined || raw === null || raw === '') return 0
	const value = Number(raw)
	assert(Number.isFinite(value), `${service.metadata.name} minScale must be numeric if set.`)
	return value
}

function assertBaseRuntimeShape(label, service) {
	assert.equal(spec(service).timeoutSeconds, 900, `${label} timeout must support long deck operations.`)
	assert.equal(serviceAnnotations(service)['run.googleapis.com/ingress'], 'all', `${label} ingress should match public staging deploy shape.`)
	assert.equal(annotations(service)['run.googleapis.com/execution-environment'], 'gen2', `${label} must use Cloud Run gen2.`)
	assert.equal(minScale(service), 0, `${label} must scale to zero when idle.`)
	assert.equal(maxScale(service), 10, `${label} maxScale must be the current approved quota-safe surge limit.`)
	assert.equal(container(service).resources?.limits?.cpu, '2', `${label} must reserve 2 CPU.`)
	assert.equal(container(service).resources?.limits?.memory, '4Gi', `${label} must reserve 4Gi memory.`)
	assert.equal(container(service).ports?.[0]?.containerPort, 8080, `${label} must listen on Cloud Run port 8080.`)
	const traffic = service?.status?.traffic || []
	assert(traffic.some(item => item.latestRevision === true && Number(item.percent) === 100), `${label} must route 100% traffic to the latest revision.`)
}

const gateway = await serviceDescription(gatewayService)
const worker = await serviceDescription(workerService)

assertBaseRuntimeShape('gateway', gateway)
assertBaseRuntimeShape('worker', worker)

assert.equal(spec(gateway).containerConcurrency, 8, 'Gateway must expose request concurrency 8 for payment/control headroom.')
assert.equal(spec(worker).containerConcurrency, 1, 'Worker must isolate heavy deck execution at concurrency 1.')
assert.equal(numericEnv(gateway, 'BETTERPPTX_MCP_REQUEST_CONCURRENCY'), 8, 'Gateway env concurrency must match Cloud Run concurrency.')
assert.equal(numericEnv(worker, 'BETTERPPTX_MCP_REQUEST_CONCURRENCY'), 1, 'Worker env concurrency must match Cloud Run concurrency.')
assert.equal(numericEnv(gateway, 'BETTERPPTX_MCP_MAX_INSTANCES'), 10, 'Gateway env max instances must match Cloud Run maxScale.')
assert.equal(numericEnv(worker, 'BETTERPPTX_MCP_MAX_INSTANCES'), 10, 'Worker env max instances must match Cloud Run maxScale.')
assert.equal(envMap(gateway).get('BETTERPPTX_EDIT_STATE_MODE'), 'distributed', 'Gateway must use distributed edit state.')
assert.equal(envMap(worker).get('BETTERPPTX_EDIT_STATE_MODE'), 'distributed', 'Worker must use distributed edit state.')
assert.equal(envMap(gateway).get('BETTERPPTX_HTTP_STATELESS_MCP'), '1', 'Gateway must run stateless HTTP MCP.')
assert.equal(envMap(gateway).get('BETTERPPTX_OPERATION_EXECUTION_MODE'), 'queued', 'Gateway must queue operations instead of running heavy work inline.')
assert(envMap(gateway).get('BETTERPPTX_OPERATION_WORKER_URL'), 'Gateway must know the internal worker URL.')
assert.equal(envMap(worker).get('BETTERPPTX_OPERATION_EXECUTION_MODE'), 'queued', 'Worker runtime must share queued operation config.')
assert.equal(spec(gateway).serviceAccountName, spec(worker).serviceAccountName, 'Gateway and worker should use the same audited runtime service account.')
assert.notEqual(gateway.status?.url, worker.status?.url, 'Gateway and worker must be separate Cloud Run services.')

const heavyInflight = numericEnv(gateway, 'BETTERPPTX_MAX_CONCURRENCY') + numericEnv(gateway, 'BETTERPPTX_MAX_QUEUE')
assert(heavyInflight < spec(gateway).containerConcurrency, 'Gateway heavy admission ceiling must stay below request concurrency.')

console.log(`GCP CLOUD RUN SCALING: PASS project=${project} gatewayConcurrency=8 workerConcurrency=1 maxScale=10 minScale=0 heavyInflight=${heavyInflight} scaleToZero=1`)
