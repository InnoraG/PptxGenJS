import * as fs from 'node:fs'
import * as path from 'node:path'

const outputDir = path.resolve('outputs', 'operation-store-verify', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_DURABLE_OPERATION_STORE = 'local'
process.env.BETTERPPTX_OPERATION_STORE_FILE = path.join(outputDir, 'operation-store.json')
process.env.BETTERPPTX_REQUIRE_DURABLE_OPERATIONS = '0'

const {
	createOperationStore,
	digestOperationPayload,
	operationStoreReadiness,
} = await import('./storage/operation-store.mjs')

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

const baseOperation = {
	installHash: 'install_operation_verify',
	toolName: 'betterpptx.deck.generate_from_spec',
	deckId: 'deck_operation_verify',
	expectedDeckVersion: 4,
	inputDigest: digestOperationPayload({ specDigest: 'spec-a', phase: 'commit' }),
	pricingInputDigest: digestOperationPayload({ quotedCredits: 125 }),
	queueClass: 'heavy',
	idempotencyKey: 'verify-generate-1',
	metadata: { quoteId: 'quote_operation_verify' },
	nowMs: 1000,
}

let readiness = operationStoreReadiness()
expect(readiness.configured === true && readiness.distributed === false && readiness.publicProductionEligible === false, 'Local operation store should be configured but not production distributed.', { readiness })

const store = createOperationStore()
const first = await store.createOrGetOperation(baseOperation)
expect(first.created === true && first.operation.state === 'queued' && first.operation.attempt === 0, 'Operation create should produce a queued record.', { first })

const duplicates = await Promise.all(Array.from({ length: 6 }, () => store.createOrGetOperation(baseOperation)))
expect(duplicates.every(item => item.created === false && item.idempotentReplay === true && item.operation.operationId === first.operation.operationId), 'Duplicate operation create should replay the original operation id.', { duplicates })

await expectCode('OPERATION_IDEMPOTENCY_CONFLICT', () => store.createOrGetOperation({
	...baseOperation,
	inputDigest: digestOperationPayload({ specDigest: 'spec-b', phase: 'commit' }),
}))

const claim1 = await store.claimOperation(first.operation.operationId, { leaseOwner: 'worker-a', leaseMs: 100, nowMs: 2000 })
expect(claim1.claimed === true && claim1.lease.fencingToken === 1 && claim1.operation.attempt === 1, 'First claim should acquire fencing token 1.', { claim1 })

await expectCode('OPERATION_ALREADY_LEASED', () => store.claimOperation(first.operation.operationId, { leaseOwner: 'worker-b', leaseMs: 100, nowMs: 2050 }))

const claim2 = await store.claimOperation(first.operation.operationId, { leaseOwner: 'worker-b', leaseMs: 100, nowMs: 2205 })
expect(claim2.claimed === true && claim2.lease.fencingToken === 2 && claim2.operation.attempt === 2, 'Expired lease should be claimable with a new fencing token.', { claim2 })

await expectCode('OPERATION_LEASE_STALE', () => store.completeOperation(first.operation.operationId, {
	leaseToken: claim1.lease.leaseToken,
	result: { ok: true, stale: true },
	nowMs: 2210,
}))

const completed = await store.completeOperation(first.operation.operationId, {
	leaseToken: claim2.lease.leaseToken,
	result: { ok: true, deckId: baseOperation.deckId, artifact: 'asset://opaque/generated' },
	nowMs: 2220,
})
expect(completed.state === 'succeeded' && completed.result?.ok === true && completed.fencingToken === 2, 'Valid lease should complete the operation exactly once.', { completed })

const replay = await store.createOrGetOperation(baseOperation)
expect(replay.created === false && replay.operation.state === 'succeeded' && replay.operation.result?.deckId === baseOperation.deckId, 'Idempotency replay should return the terminal completed operation.', { replay })

const terminalClaim = await store.claimOperation(first.operation.operationId, { leaseOwner: 'worker-c', leaseMs: 100, nowMs: 2300 })
expect(terminalClaim.claimed === false && terminalClaim.terminal === true && terminalClaim.operation.state === 'succeeded', 'Completed operations must not be leased again.', { terminalClaim })

const retryable = await store.createOrGetOperation({
	...baseOperation,
	deckId: 'deck_operation_retry',
	idempotencyKey: 'verify-retry-1',
	inputDigest: digestOperationPayload({ specDigest: 'spec-retry' }),
})
const retryClaim = await store.claimOperation(retryable.operation.operationId, { leaseOwner: 'worker-a', leaseMs: 100, nowMs: 3000 })
const released = await store.releaseOperation(retryable.operation.operationId, { leaseToken: retryClaim.lease.leaseToken, nowMs: 3010 })
expect(released.state === 'queued' && released.leaseOwner === '' && released.fencingToken === 1, 'Release should preserve fencing history while making the operation queued.', { released })

const failClaim = await store.claimOperation(retryable.operation.operationId, { leaseOwner: 'worker-b', leaseMs: 100, nowMs: 3020 })
const failedRetryable = await store.failOperation(retryable.operation.operationId, {
	leaseToken: failClaim.lease.leaseToken,
	error: { code: 'TRANSIENT_WORKER_ERROR', message: 'temporary worker failure' },
	retryable: true,
	nowMs: 3030,
})
expect(failedRetryable.state === 'retry' && failedRetryable.error?.retryable === true, 'Retryable failure should preserve the operation for a future delivery.', { failedRetryable })

const persistedJson = JSON.parse(fs.readFileSync(process.env.BETTERPPTX_OPERATION_STORE_FILE, 'utf8'))
expect(Object.keys(persistedJson.operations || {}).length === 2, 'Operation records should be durable in the local verifier file.', { persistedJson })
expect(Object.keys(persistedJson.idempotency || {}).length === 2, 'Idempotency records should be durable in the local verifier file.', { persistedJson })

process.env.BETTERPPTX_REQUIRE_DURABLE_OPERATIONS = '1'
process.env.BETTERPPTX_DURABLE_OPERATION_STORE = 'local'
await expectCode('OPERATION_STORE_NOT_DISTRIBUTED', async () => createOperationStore().createOrGetOperation({
	...baseOperation,
	idempotencyKey: 'blocked-local',
}))

process.env.BETTERPPTX_DURABLE_OPERATION_STORE = 'firestore'
readiness = operationStoreReadiness()
expect(readiness.configured === true && readiness.distributed === true && readiness.publicProductionEligible === true, 'Firestore must be the public-production eligible durable operation provider.', { readiness })

console.log('OPERATION STORE: PASS localCreate=1 duplicateReplay=1 conflict=1 leaseContention=1 leaseTakeover=1 staleCompletionRejected=1 terminalReplay=1 retryRelease=1 productionGuard=1 firestoreEligible=1')
