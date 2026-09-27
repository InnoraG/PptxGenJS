import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const reportPath = path.resolve('betterpptx-mcp', 'outputs', 'avatar-durable-operation-lease-recovery-report.json')
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-operation-lease-'))
const storeFile = path.join(tempDir, 'operation-store.json')

process.env.BETTERPPTX_DURABLE_OPERATION_STORE = 'local'
process.env.BETTERPPTX_OPERATION_STORE_FILE = storeFile
process.env.BETTERPPTX_REQUIRE_DURABLE_OPERATIONS = '0'

const { createOperationStore } = await import('./storage/operation-store.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

function expectCode(action, code) {
	return Promise.resolve().then(action).then(
		() => false,
		err => {
			expect(err?.code === code, `Expected ${code}, received ${err?.code || err?.message || err}`, { error: err })
			return true
		},
	)
}

const report = {
	schemaVersion: 'betterpptx.durable-operation-lease-recovery-report.v1',
	status: 'BLOCKED',
	provider: 'local-contract',
	checks: {},
	}

try {
	const store = createOperationStore()
	const input = {
		installHash: 'lease-recovery-install',
		toolName: 'betterpptx.avatar.render_job',
		idempotencyKey: 'lease-recovery-key-1',
		inputDigest: 'input-a',
		metadata: { scope: 'verifier' },
		request: { name: 'betterpptx.avatar.render_job', args: { idempotencyKey: 'lease-recovery-key-1' } },
	}
	const created = await store.createOrGetOperation(input)
	const operationId = created.operation.operationId
	expect(created.created === true && /^op_[0-9a-f]{32}$/i.test(operationId), 'Operation should be created with an opaque id.', { created })
	report.checks.created = true

	const replay = await store.createOrGetOperation(input)
	expect(replay.created === false && replay.idempotentReplay === true && replay.operation.operationId === operationId, 'Same idempotency key should replay the original operation.', { replay })
	report.checks.idempotentReplay = true

	const conflict = await expectCode(() => store.createOrGetOperation({ ...input, inputDigest: 'input-b' }), 'OPERATION_IDEMPOTENCY_CONFLICT')
	expect(conflict, 'A changed request must not reuse an idempotency key.')
	report.checks.idempotencyConflict = true

	const firstNow = Date.parse('2026-07-18T12:00:00.000Z')
	const first = await store.claimOperation(operationId, { leaseOwner: 'worker-a', leaseMs: 1000, nowMs: firstNow })
	expect(first.claimed && first.lease?.fencingToken === 1, 'First worker should claim the operation with fencing token 1.', { first })
	report.checks.firstClaim = true

	const blocked = await expectCode(() => store.claimOperation(operationId, { leaseOwner: 'worker-b', leaseMs: 1000, nowMs: firstNow + 500 }), 'OPERATION_ALREADY_LEASED')
	expect(blocked, 'A second worker must not claim an unexpired lease.')
	report.checks.liveLeaseExclusion = true

	const second = await store.claimOperation(operationId, { leaseOwner: 'worker-b', leaseMs: 1000, nowMs: firstNow + 1500 })
	expect(second.claimed && second.lease?.fencingToken === 2 && second.operation.attempt === 2, 'An expired lease should be taken over with a new fencing token.', { second })
	report.checks.expiredLeaseTakeover = true

	const staleCompletion = await expectCode(
		() => store.completeOperation(operationId, { leaseToken: first.lease.leaseToken, result: { stale: true }, nowMs: firstNow + 1600 }),
		'OPERATION_LEASE_STALE',
	)
	expect(staleCompletion, 'The previous worker must be fenced from completing after takeover.')
	report.checks.staleLeaseFencing = true

	const retried = await store.failOperation(operationId, {
		leaseToken: second.lease.leaseToken,
		error: { code: 'AVATAR_UNAVAILABLE', message: 'transient test failure' },
		retryable: true,
		nowMs: firstNow + 1700,
	})
	expect(retried.state === 'retry' && retried.error?.retryable === true && !retried.leaseExpiresAt, 'Retryable worker failure should return the operation to retry state.', { retried })
	report.checks.retryTransition = true

	const third = await store.claimOperation(operationId, { leaseOwner: 'worker-c', leaseMs: 1000, nowMs: firstNow + 1800 })
	expect(third.claimed && third.lease?.fencingToken === 3 && third.operation.attempt === 3, 'Retry state should be claimable by a replacement worker.', { third })
	report.checks.retryReclaim = true

	const completed = await store.completeOperation(operationId, {
		leaseToken: third.lease.leaseToken,
		result: { terminal: 'succeeded' },
		nowMs: firstNow + 1900,
	})
	expect(completed.state === 'succeeded' && completed.result?.terminal === 'succeeded', 'Replacement worker should be able to complete the retried operation.', { completed })
	report.checks.terminalCompletion = true

	report.operationId = operationId
	report.attempts = completed.attempt
	report.fencingTokens = completed.fencingToken
	report.status = Object.values(report.checks).every(Boolean) ? 'PASS' : 'BLOCKED'
	fs.mkdirSync(path.dirname(reportPath), { recursive: true })
	fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
	console.log(`DURABLE OPERATION LEASE RECOVERY: ${report.status} created=1 replay=1 exclusion=1 takeover=1 fencing=1 retry=1 reclaim=1 terminal=1`)
} catch (error) {
	report.status = 'BLOCKED'
	report.error = { code: error?.code || error?.name || 'VERIFY_FAILED', message: error?.message || String(error), details: error?.details || {} }
	fs.mkdirSync(path.dirname(reportPath), { recursive: true })
	fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
	console.error(`DURABLE OPERATION LEASE RECOVERY: BLOCKED ${error?.message || error}`)
	process.exitCode = 2
} finally {
	try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
}
