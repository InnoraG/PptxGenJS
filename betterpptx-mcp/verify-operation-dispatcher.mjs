const originalEnv = { ...process.env }

function resetEnv() {
	for (const key of Object.keys(process.env)) {
		if (!(key in originalEnv)) delete process.env[key]
	}
	for (const [key, value] of Object.entries(originalEnv)) process.env[key] = value
}

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

async function expectCode(code, fn) {
	try {
		await fn()
	} catch (error) {
		if (error?.code === code) return error
		throw error
	}
	throw new Error(`Expected ${code}.`)
}

try {
	process.env.BETTERPPTX_OPERATION_DISPATCHER = 'inline'
	process.env.BETTERPPTX_REQUIRE_DISTRIBUTED_OPERATION_DISPATCH = '0'

	const {
		createOperationDispatcher,
		operationDispatcherReadiness,
		operationTaskId,
		operationTaskName,
		queueForClass,
	} = await import('./queue/operation-dispatcher.mjs')

	let readiness = operationDispatcherReadiness()
	expect(readiness.configured === true && readiness.distributed === false && readiness.publicProductionEligible === false, 'Inline dispatcher should be configured but not public-production eligible.', { readiness })
	expect(queueForClass('heavy') === 'betterpptx-deck-interactive', 'Unknown/heavy queue class should map to deck-interactive by default.', {})
	expect(queueForClass('deck-batch') === 'betterpptx-deck-batch', 'Batch queue class should map to deck batch queue.', {})
	expect(operationTaskId('op_abcdef1234567890') === 'bpptx-op-abcdef1234567890', 'Task ids should be deterministic and Cloud Tasks safe.', {})

	const inline = createOperationDispatcher()
	const dispatched = await inline.dispatchOperation({ operationId: 'op_abcdef1234567890', queueClass: 'deck-batch' })
	expect(dispatched.accepted === true && dispatched.inline === true && dispatched.taskName.includes('betterpptx-deck-batch'), 'Inline dispatcher should return a deterministic local acceptance.', { dispatched })

	process.env.BETTERPPTX_REQUIRE_DISTRIBUTED_OPERATION_DISPATCH = '1'
	await expectCode('OPERATION_DISPATCHER_NOT_DISTRIBUTED', async () => createOperationDispatcher().dispatchOperation({ operationId: 'op_blocked' }))

	process.env.BETTERPPTX_OPERATION_DISPATCHER = 'cloud-tasks'
	process.env.BETTERPPTX_GCP_PROJECT = 'betterpptx-test'
	process.env.BETTERPPTX_CLOUD_TASKS_LOCATION = 'europe-west1'
	process.env.BETTERPPTX_OPERATION_WORKER_URL = 'https://worker.example.test'
	readiness = operationDispatcherReadiness()
	expect(readiness.configured === true && readiness.distributed === true && readiness.publicProductionEligible === true, 'Cloud Tasks dispatcher config should be public-production eligible.', { readiness })
	const taskName = operationTaskName({ operationId: 'op_abcdef1234567890', queueClass: 'deck-interactive' })
	expect(taskName === 'projects/betterpptx-test/locations/europe-west1/queues/betterpptx-deck-interactive/tasks/bpptx-op-abcdef1234567890', 'Cloud Tasks task name should be deterministic.', { taskName })

	console.log('OPERATION DISPATCHER: PASS inline=1 productionGuard=1 cloudTasksEligible=1 deterministicTaskName=1')
} finally {
	resetEnv()
}
