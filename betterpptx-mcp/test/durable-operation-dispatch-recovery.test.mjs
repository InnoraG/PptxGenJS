import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { registerHooks } from 'node:module'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-dispatch-recovery-'))
const operationFile = path.join(tempRoot, 'operations.json')
Object.assign(process.env, {
	BETTERPPTX_ENV: 'test',
	BETTERPPTX_DEPLOYMENT_STAGE: 'test',
	NODE_ENV: 'test',
	BETTERPPTX_PUBLIC_BLACK_BOX: '1',
	BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
	BETTERPPTX_BILLING_ENFORCE: '0',
	BETTERPPTX_REQUIRE_FREE_VALUE_IDENTITY: '0',
	BETTERPPTX_DURABLE_OPERATION_STORE: 'local',
	BETTERPPTX_OPERATION_STORE_FILE: operationFile,
	BETTERPPTX_REQUIRE_DURABLE_OPERATION_IDEMPOTENCY: '1',
	BETTERPPTX_OPERATION_EXECUTION_MODE: 'queued',
	BETTERPPTX_OPERATION_DISPATCHER: 'cloud-tasks',
	BETTERPPTX_REQUIRE_DISTRIBUTED_OPERATION_DISPATCH: '1',
	BETTERPPTX_DURABLE_OPERATION_QUEUED_TAKEOVER_MS: '1000',
	BETTERPPTX_CLOUD_TASKS_PROJECT: 'private-project-reference',
	BETTERPPTX_CLOUD_TASKS_LOCATION: 'europe-west1',
	BETTERPPTX_OPERATION_WORKER_URL: 'https://private-worker.example.test',
	BETTERPPTX_OPERATION_WORKER_SERVICE_ACCOUNT: 'secret-runner@private-project.iam.gserviceaccount.com',
	BETTERPPTX_OPERATION_WORKER_TOKEN: 'private-worker-token',
	BETTERPPTX_OUT_DIR: tempRoot,
	BETTERPPTX_DOWNLOAD_ROOT: tempRoot,
	BETTERPPTX_INSTALL_USAGE_FILE: path.join(tempRoot, 'install-usage.json'),
	BETTERPPTX_USAGE_AUTO_FLUSH: '0',
	BETTERPPTX_REQUIRE_SHARED_STORES: '0',
	BETTERPPTX_LOG: '',
})

const cloudTasksMockUrl = `data:text/javascript,${encodeURIComponent(`
	export const state = { mode: 'permission', requests: [], tasks: new Set() }
	export class CloudTasksClient {
		async createTask({ parent, task }) {
			state.requests.push({ parent, taskName: task.name })
			if (state.mode === 'permission') {
				throw Object.assign(new Error('7 PERMISSION_DENIED: iam.serviceAccounts.actAs denied for secret-runner@private-project.iam.gserviceaccount.com at projects/private-project-reference'), {
					code: 7,
					details: 'projects/private-project-reference/locations/europe-west1/queues/private-queue',
				})
			}
			if (state.mode === 'network-after-create') {
				state.tasks.add(task.name)
				throw Object.assign(new Error('14 UNAVAILABLE: response lost for https://private-worker.example.test/internal/operations/private-operation'), {
					code: 14,
					details: 'private-project-reference task creation response was lost',
				})
			}
			if (state.tasks.has(task.name)) {
				throw Object.assign(new Error('6 ALREADY_EXISTS: ' + task.name), { code: 6 })
			}
			state.tasks.add(task.name)
			return [{ name: task.name }]
		}
	}
`)}`

const hooks = registerHooks({
	resolve(specifier, context, nextResolve) {
		return specifier === '@google-cloud/tasks'
			? { url: cloudTasksMockUrl, shortCircuit: true }
			: nextResolve(specifier, context)
	},
})

const { createMcpToolDispatcher } = await import('../engine.mjs')
const { state: cloudTasks } = await import(cloudTasksMockUrl)
const owner = `install_${'a'.repeat(64)}`
const mcp = createMcpToolDispatcher({ installHash: owner, sessionId: 'dispatch-recovery-owner', blackBox: true })
const foreignMcp = createMcpToolDispatcher({ installHash: `install_${'b'.repeat(64)}`, sessionId: 'dispatch-recovery-foreign', blackBox: true })

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Durable dispatch recovery test',
	authoringContract: {
		workflow: 'ai-sovereign-v1',
		creativeAuthority: 'ai',
		directorMode: 'off',
		verificationMode: 'complete',
		geometryAuthority: 'ai',
		placementPolicy: 'ai-authored-geometry-v1',
		coordinateSystem: 'inches',
	},
	slides: [{
		id: 'dispatch-recovery',
		title: 'Recover the existing operation',
		content: [{ kind: 'textBox', name: 'recovery-proof', text: 'Status first; identical retries keep the operation identity.', rect: { x: 1, y: 1, w: 6, h: 1 } }],
	}],
}

function commitArgs(idempotencyKey) {
	return { spec, phase: 'commit', commitMode: 'createNew', plan: 'free', detail: 'summary', idempotencyKey }
}

function assertDispatchFailure(result) {
	assert.equal(result?.ok, false, JSON.stringify(result))
	assert.equal(result.error?.code, 'OPERATION_DISPATCH_UNAVAILABLE', JSON.stringify(result))
	assert.equal(result.error?.retry_safe, true)
	assert.equal(result.error?.retryable, true)
	assert.equal(result.error?.recoverable, true)
	assert.equal(result.error?.artifact_state, 'unknown_or_pending')
	assert.equal(result.error?.details?.dispatchStatus, 'unconfirmed')
	assert.match(String(result.error?.details?.operationId || ''), /^op_[0-9a-f]{32}$/i)
	assert.match(result.error?.message || '', /first check operation status/i)
	const statusAction = result.error?.next_actions?.find(action => action.tool === 'betterpptx.operation.status')
	assert.equal(statusAction?.type, 'check_operation_status', JSON.stringify(result.error?.next_actions))
	assert.deepEqual(statusAction?.request, { operationId: result.error.details.operationId })
	assert.match(statusAction?.description || '', /First check operation status/i)
	assert.match(statusAction?.description || '', /original idempotency key/i)
	const publicJson = JSON.stringify(result).toLowerCase()
	for (const privateValue of [
		'permission_denied', 'actas', 'private-project-reference', 'secret-runner@',
		'private-worker-token', 'private-worker.example.test', '14 unavailable', '6 already_exists',
		'/internal/operations/',
	]) assert.equal(publicJson.includes(privateValue), false, `Public result leaked ${privateValue}: ${JSON.stringify(result)}`)
	return result.error.details.operationId
}

async function readOperationCount() {
	const store = JSON.parse(await fs.readFile(operationFile, 'utf8'))
	return Object.keys(store.operations || {}).length
}

test.after(async () => {
	hooks.deregister()
	await fs.rm(tempRoot, { recursive: true, force: true })
})

test('dispatch failures stay generic and recover through owner status and deterministic same-key task retries', async () => {
	const permissionArgs = commitArgs('dispatch-permission-recovery-v1')
	const permissionFailure = await mcp.call('betterpptx.deck.generate_from_spec', permissionArgs)
	const permissionOperationId = assertDispatchFailure(permissionFailure)
	assert.equal(cloudTasks.requests.length, 1)

	const permissionStatus = await mcp.call('betterpptx.operation.status', { operationId: permissionOperationId })
	assert.equal(permissionStatus.ok, true, JSON.stringify(permissionStatus))
	assert.equal(permissionStatus.data?.operationId, permissionOperationId)
	assert.equal(permissionStatus.data?.state, 'queued')
	const foreignStatus = await foreignMcp.call('betterpptx.operation.status', { operationId: permissionOperationId })
	assert.equal(foreignStatus.ok, false)
	assert.equal(foreignStatus.error?.code, 'OPERATION_NOT_FOUND')

	// Replaying the exact request and key while the owner-visible operation is
	// still fresh returns that operation without creating a second task.
	const permissionReplay = await mcp.call('betterpptx.deck.generate_from_spec', permissionArgs)
	assert.equal(permissionReplay.ok, false, JSON.stringify(permissionReplay))
	assert.equal(permissionReplay.error?.code, 'OPERATION_PENDING')
	assert.equal(permissionReplay.error?.details?.operationId, permissionOperationId)
	assert.equal(permissionReplay.error?.details?.state, 'queued')
	assert.equal(cloudTasks.requests.length, 1)

	const ambiguousArgs = commitArgs('dispatch-network-recovery-v1')
	cloudTasks.mode = 'network-after-create'
	const ambiguousFailure = await mcp.call('betterpptx.deck.generate_from_spec', ambiguousArgs)
	const ambiguousOperationId = assertDispatchFailure(ambiguousFailure)
	assert.equal(cloudTasks.tasks.size, 1, 'the mock models a task accepted before its response was lost')
	const ambiguousStatus = await mcp.call('betterpptx.operation.status', { operationId: ambiguousOperationId })
	assert.equal(ambiguousStatus.ok, true, JSON.stringify(ambiguousStatus))
	assert.equal(ambiguousStatus.data?.state, 'queued')

	// Simulate the queued takeover window. The task already exists, so Cloud
	// Tasks returns ALREADY_EXISTS; deterministic naming makes that safe success.
	await new Promise(resolve => setTimeout(resolve, 1050))
	cloudTasks.mode = 'already-exists'
	const sameKeyReplay = await mcp.call('betterpptx.deck.generate_from_spec', ambiguousArgs)
	assert.equal(sameKeyReplay.ok, false, JSON.stringify(sameKeyReplay))
	assert.equal(sameKeyReplay.error?.code, 'OPERATION_PENDING')
	assert.equal(sameKeyReplay.error?.details?.operationId, ambiguousOperationId)
	assert.equal(sameKeyReplay.error?.details?.state, 'queued')
	assert.equal(cloudTasks.requests.length, 3)
	assert.equal(cloudTasks.requests[1].taskName, cloudTasks.requests[2].taskName, 'same operation ID must produce the same task name')
	assert.equal(cloudTasks.tasks.size, 1, 'an ALREADY_EXISTS retry must not create a second task')
	assert.equal(await readOperationCount(), 2, 'same-key recovery must preserve one durable operation per logical request')
})
