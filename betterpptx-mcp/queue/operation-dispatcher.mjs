export class OperationDispatcherError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'OperationDispatcherError'
		this.code = code
		this.details = details
	}
}

function enabled(name) {
	return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase())
}

export function operationDispatcherProviderName() {
	return String(process.env.BETTERPPTX_OPERATION_DISPATCHER || process.env.BETTERPPTX_DURABLE_OPERATION_DISPATCHER || 'inline').trim().toLowerCase()
}

function requireCloudTasks(provider) {
	if (enabled('BETTERPPTX_REQUIRE_DISTRIBUTED_OPERATION_DISPATCH') && provider !== 'cloud-tasks') {
		throw new OperationDispatcherError(
			'OPERATION_DISPATCHER_NOT_DISTRIBUTED',
			'Distributed operation dispatch is required but Cloud Tasks is not configured.',
			{ provider },
		)
	}
}

function projectId() {
	return String(process.env.BETTERPPTX_CLOUD_TASKS_PROJECT || process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '').trim()
}

function locationId() {
	return String(process.env.BETTERPPTX_CLOUD_TASKS_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1').trim()
}

export function queueForClass(queueClass = 'default') {
	const cls = String(queueClass || 'default').trim().toLowerCase()
	if (cls === 'media' || cls === 'media-long') return String(process.env.BETTERPPTX_CLOUD_TASKS_QUEUE_MEDIA || 'betterpptx-media-long').trim()
	if (cls === 'batch' || cls === 'deck-batch') return String(process.env.BETTERPPTX_CLOUD_TASKS_QUEUE_DECK_BATCH || 'betterpptx-deck-batch').trim()
	if (cls === 'heavy' || cls === 'deck-heavy' || cls === 'deck-interactive') return String(process.env.BETTERPPTX_CLOUD_TASKS_QUEUE_DECK_INTERACTIVE || 'betterpptx-deck-interactive').trim()
	if (cls === 'relayer' || cls.startsWith('x402')) return String(process.env.BETTERPPTX_CLOUD_TASKS_QUEUE_RELAYER || 'betterpptx-x402-relayer').trim()
	if (cls === 'reconciliation') return String(process.env.BETTERPPTX_CLOUD_TASKS_QUEUE_RECONCILIATION || 'betterpptx-reconciliation').trim()
	return String(process.env.BETTERPPTX_CLOUD_TASKS_QUEUE_DECK_INTERACTIVE || 'betterpptx-deck-interactive').trim()
}

export function operationTaskId(operationId = '') {
	const id = String(operationId || '').trim()
	if (!/^op_[A-Za-z0-9_-]{8,80}$/.test(id)) {
		throw new OperationDispatcherError('OPERATION_TASK_ID_INVALID', 'operationId is not valid for deterministic task naming.', { operationId })
	}
	return `bpptx-${id.replace(/_/g, '-')}`
}

export function operationTaskName({ operationId = '', queueClass = 'default' } = {}) {
	const project = projectId()
	const location = locationId()
	const queue = queueForClass(queueClass)
	if (!project) {
		throw new OperationDispatcherError('CLOUD_TASKS_PROJECT_MISSING', 'Cloud Tasks project is not configured.', {})
	}
	return `projects/${project}/locations/${location}/queues/${queue}/tasks/${operationTaskId(operationId)}`
}

function workerUrl(operationId = '') {
	const base = String(process.env.BETTERPPTX_OPERATION_WORKER_URL || process.env.BETTERPPTX_PUBLIC_BASE || '').trim().replace(/\/+$/, '')
	if (!/^https:\/\//i.test(base)) {
		throw new OperationDispatcherError('OPERATION_WORKER_URL_MISSING', 'A public HTTPS worker URL is required for Cloud Tasks dispatch.', {})
	}
	return `${base}/internal/operations/${encodeURIComponent(operationId)}/run`
}

function createInlineDispatcher(provider = 'inline') {
	requireCloudTasks(provider)
	async function dispatchOperation({ operationId = '', queueClass = 'default' } = {}) {
		return {
			accepted: true,
			provider,
			inline: true,
			operationId: String(operationId || ''),
			queueClass: String(queueClass || 'default'),
			taskName: `inline://${queueForClass(queueClass)}/${operationTaskId(operationId)}`,
			idempotent: false,
		}
	}
	return { provider, distributed: false, dispatchOperation }
}

function createCloudTasksDispatcher() {
	requireCloudTasks('cloud-tasks')
	let clientPromise = null
	async function client() {
		if (!clientPromise) {
			clientPromise = import('@google-cloud/tasks')
				.then(({ CloudTasksClient }) => new CloudTasksClient())
				.catch(err => {
					throw new OperationDispatcherError(
						'CLOUD_TASKS_CLIENT_UNAVAILABLE',
						'Cloud Tasks dispatch requires @google-cloud/tasks and workload identity credentials.',
						{ reason: err?.message || String(err) },
					)
				})
		}
		return clientPromise
	}
	async function dispatchOperation({ operationId = '', queueClass = 'default', scheduleDelaySeconds = 0 } = {}) {
		const c = await client()
		const parent = `projects/${projectId()}/locations/${locationId()}/queues/${queueForClass(queueClass)}`
		const name = operationTaskName({ operationId, queueClass })
		const url = workerUrl(operationId)
		const task = {
			name,
			httpRequest: {
				httpMethod: 'POST',
				url,
				headers: {
					'Content-Type': 'application/json',
					'X-BetterPPTX-Operation-Id': String(operationId),
				},
				body: Buffer.from(JSON.stringify({ operationId })).toString('base64'),
			},
		}
		const workerToken = String(process.env.BETTERPPTX_OPERATION_WORKER_TOKEN || '').trim()
		if (workerToken) task.httpRequest.headers['X-BetterPPTX-Worker-Token'] = workerToken
		const serviceAccountEmail = String(process.env.BETTERPPTX_OPERATION_WORKER_SERVICE_ACCOUNT || '').trim()
		if (serviceAccountEmail) task.httpRequest.oidcToken = { serviceAccountEmail }
		const delay = Math.max(0, Number(scheduleDelaySeconds) || 0)
		if (delay > 0) task.scheduleTime = { seconds: Math.floor(Date.now() / 1000) + delay }
		try {
			const [created] = await c.createTask({ parent, task })
			return { accepted: true, provider: 'cloud-tasks', operationId: String(operationId), queueClass: String(queueClass || 'default'), taskName: created.name || name, idempotent: false }
		} catch (err) {
			const code = Number(err?.code)
			if (code === 6 || String(err?.message || '').includes('ALREADY_EXISTS')) {
				return { accepted: true, provider: 'cloud-tasks', operationId: String(operationId), queueClass: String(queueClass || 'default'), taskName: name, idempotent: true }
			}
			throw err
		}
	}
	return { provider: 'cloud-tasks', distributed: true, dispatchOperation }
}

export function createOperationDispatcher() {
	const provider = operationDispatcherProviderName()
	if (provider === 'disabled' || provider === 'off' || provider === 'none') {
		requireCloudTasks(provider)
		return { provider: 'disabled', distributed: false, disabled: true }
	}
	if (provider === 'inline' || provider === 'local') return createInlineDispatcher(provider)
	if (provider === 'cloud-tasks') return createCloudTasksDispatcher()
	throw new OperationDispatcherError('OPERATION_DISPATCHER_UNAVAILABLE', 'Operation dispatcher provider is unavailable.', { provider })
}

export function operationDispatcherReadiness() {
	const provider = operationDispatcherProviderName()
	const cloudTasksConfigured = provider === 'cloud-tasks'
		&& Boolean(projectId())
		&& Boolean(locationId())
		&& Boolean(queueForClass('default'))
		&& /^https:\/\//i.test(String(process.env.BETTERPPTX_OPERATION_WORKER_URL || process.env.BETTERPPTX_PUBLIC_BASE || '').trim())
	return {
		provider,
		configured: provider === 'inline' || provider === 'local' || cloudTasksConfigured,
		distributed: provider === 'cloud-tasks',
		publicProductionEligible: cloudTasksConfigured,
		requireDistributedOperationDispatch: enabled('BETTERPPTX_REQUIRE_DISTRIBUTED_OPERATION_DISPATCH'),
	}
}
