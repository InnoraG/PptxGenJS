import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import test from 'node:test'
import { createDeckStateStore } from '../storage/deck-state-store.mjs'
import { createOperationStore } from '../storage/operation-store.mjs'
import { assertResourceAccess, resourceOwnerForContext, withResourceAuthorization } from '../auth/resource-authorization.mjs'

const alice = { installHash: `install_${'a'.repeat(64)}`, sessionId: 'issued-session-a' }
const reconnect = { ...alice, sessionId: 'issued-session-a-reconnect' }
const bob = { installHash: `install_${'b'.repeat(64)}`, sessionId: 'issued-session-b' }
const as = (context, fn) => withResourceAuthorization(context, fn)

// Exercise the real local serialization paths in a disposable directory. No
// remote clients, credential files, engine, payments or running services are used.
function localStores(t) {
	const temporaryRoot = path.resolve(os.tmpdir())
	const root = fs.mkdtempSync(path.join(temporaryRoot, 'betterpptx-resource-owner-test-'))
	const settings = {
		BETTERPPTX_DURABLE_DECK_STATE_STORE: 'local',
		BETTERPPTX_DECK_STATE_FILE: path.join(root, 'decks.json'),
		BETTERPPTX_REQUIRE_DURABLE_DECK_STATE: '0',
		BETTERPPTX_DURABLE_OPERATION_STORE: 'local',
		BETTERPPTX_OPERATION_STORE_FILE: path.join(root, 'operations.json'),
		BETTERPPTX_REQUIRE_DURABLE_OPERATIONS: '0',
	}
	const previous = new Map(Object.keys(settings).map(key => [key, process.env[key]]))
	Object.assign(process.env, settings)
	t.after(() => {
		for (const [key, value] of previous) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
		const resolved = path.resolve(root)
		assert.equal(path.dirname(resolved), temporaryRoot)
		assert.ok(path.basename(resolved).startsWith('betterpptx-resource-owner-test-'))
		fs.rmSync(resolved, { recursive: true, force: true })
	})
	return { decks: createDeckStateStore(), operations: createOperationStore() }
}

test('deck metadata preserves owner through create, CAS and a fresh store instance', async t => {
	const { decks } = localStores(t)
	const resourceOwner = resourceOwnerForContext(alice)
	const head = await decks.createDeckHead({
		deckId: 'opaque-deck-fixture', version: 1,
		metadata: { resourceOwner, canonicalSpec: { digest: '1'.repeat(64) } },
	})
	const update = await decks.compareAndSwapDeckHead(head.deckId, {
		expectedVersion: 1,
		next: { version: 2, metadata: { ...head.metadata, canonicalSpec: { digest: '2'.repeat(64) } } },
	})
	const reloaded = await createDeckStateStore().getDeckHead(head.deckId)
	assert.deepEqual(reloaded.metadata.resourceOwner, resourceOwner)
	assert.equal(reloaded.version, update.head.version)
	assert.equal(as(reconnect, () => assertResourceAccess(reloaded, { kind: 'deck' })), reloaded)
	assert.throws(() => as(bob, () => assertResourceAccess(reloaded, { kind: 'deck' })), { code: 'DECK_EXPIRED_OR_UNKNOWN' })
})

test('operation metadata and trusted queued context survive completion and idempotent replay', async t => {
	const { operations } = localStores(t)
	const input = {
		installHash: alice.installHash, toolName: 'fixture-artifact-operation', idempotencyKey: 'fixture-key', inputDigest: 'fixture-digest',
		metadata: { resourceOwner: resourceOwnerForContext(alice) },
		request: { args: { title: 'offline fixture' }, context: { ...alice } },
	}
	const created = await operations.createOrGetOperation(input)
	const claim = await operations.claimOperation(created.operation.operationId, { leaseOwner: 'offline-fixture' })
	await operations.completeOperation(created.operation.operationId, {
		leaseToken: claim.lease.leaseToken,
		result: { deckId: 'opaque-deck-fixture', downloadUrl: 'https://invalid.example/opaque-fixture' },
	})
	const fresh = createOperationStore()
	const record = await fresh.getOperation(created.operation.operationId)
	assert.deepEqual(record.metadata.resourceOwner, input.metadata.resourceOwner)
	assert.deepEqual(record.request.context, input.request.context)
	assert.equal(record.state, 'succeeded')
	assert.equal(as(reconnect, () => assertResourceAccess(record, { kind: 'operation' })), record)
	assert.throws(() => as(bob, () => assertResourceAccess(record, { kind: 'operation' }).result), { code: 'OPERATION_NOT_FOUND' })
	const replay = await fresh.createOrGetOperation(input)
	assert.equal(replay.created, false)
	assert.deepEqual(replay.operation.metadata.resourceOwner, input.metadata.resourceOwner)
})

test('persisted legacy ownerless heads remain unavailable to public callers', async t => {
	const { decks } = localStores(t)
	await decks.createDeckHead({ deckId: 'legacy-fixture', metadata: { canonicalSpec: { digest: '3'.repeat(64) } } })
	const legacy = await createDeckStateStore().getDeckHead('legacy-fixture')
	for (const context of [alice, reconnect, bob]) {
		assert.throws(() => as(context, () => assertResourceAccess(legacy, { kind: 'deck' })), { code: 'DECK_EXPIRED_OR_UNKNOWN' })
	}
})
