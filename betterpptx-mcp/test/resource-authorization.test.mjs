import assert from 'node:assert/strict'
import test from 'node:test'
import {
	RESOURCE_OWNER_SCHEMA_VERSION,
	assertResourceAccess,
	bindNewResourceOwner,
	canAccessResource,
	currentResourceOwner,
	resourceAuthorizationActive,
	resourceOwnerCacheKey,
	resourceOwnerForContext,
	resourceOwnerOf,
	withResourceAuthorization,
} from '../auth/resource-authorization.mjs'

// Offline synthetic contexts. No credentials, environment files, providers or engine startup.
const alice = Object.freeze({ installHash: `install_${'a'.repeat(64)}`, sessionId: 'server-session-a' })
const bob = Object.freeze({ installHash: `install_${'b'.repeat(64)}`, sessionId: 'server-session-b' })
const reconnect = Object.freeze({ ...alice, sessionId: 'server-session-a-reconnect' })
const connector = Object.freeze({ resourceIdentityHash: `connector_${'c'.repeat(64)}`, sessionId: 'mcpv2-request-a' })
const as = (context, callback) => withResourceAuthorization(context, callback)
const ownedBy = (context, value = {}) => as(context, () => bindNewResourceOwner(value))

test('scope activity restores after nested scopes and synchronous failures without granting access', () => {
	assert.equal(resourceAuthorizationActive(), false)
	const foreign = ownedBy(bob)
	as(alice, () => {
		assert.equal(resourceAuthorizationActive(), true)
		assert.equal(canAccessResource(foreign), false)
		assert.throws(() => as(bob, () => {
			assert.equal(resourceAuthorizationActive(), true)
			throw new Error('nested fixture failure')
		}), /nested fixture failure/)
		assert.equal(resourceAuthorizationActive(), true)
		assert.equal(canAccessResource(foreign), false)
	})
	assert.equal(resourceAuthorizationActive(), false)
	assert.throws(() => as(alice, () => { throw new Error('outer fixture failure') }), /outer fixture failure/)
	assert.equal(resourceAuthorizationActive(), false)
	withResourceAuthorization({}, () => assert.equal(resourceAuthorizationActive(), true), { localMaintainer: true })
	assert.equal(resourceAuthorizationActive(), false)
	assert.throws(() => as({}, () => assert.fail('invalid context entered scope')), { code: 'RESOURCE_IDENTITY_REQUIRED' })
	assert.equal(resourceAuthorizationActive(), false)
})

test('scope activity survives awaits but never leaks to an unrelated caller or rejected continuation', async () => {
	let release
	const gate = new Promise(resolve => { release = resolve })
	const pending = as(alice, async () => {
		assert.equal(resourceAuthorizationActive(), true)
		await gate
		assert.equal(resourceAuthorizationActive(), true)
		throw new Error('async fixture failure')
	})
	assert.equal(resourceAuthorizationActive(), false)
	assert.deepEqual([ownedBy(alice)].filter(canAccessResource), [])
	const rejected = assert.rejects(pending, /async fixture failure/)
	release()
	await rejected
	assert.equal(resourceAuthorizationActive(), false)
})

test('stable install ownership survives reconnect and JSON persistence without exposing identity', () => {
	const record = ownedBy(alice, { paid: true, handle: 'opaque-fixture' })
	const durable = JSON.parse(JSON.stringify(record))
	assert.deepEqual(resourceOwnerForContext(alice), resourceOwnerForContext(reconnect))
	assert.equal(as(reconnect, () => assertResourceAccess(durable)), durable)
	assert.equal(as(bob, () => canAccessResource(durable)), false)
	assert.equal(durable.handle, 'opaque-fixture')
	assert.equal(JSON.stringify(durable).includes(alice.installHash), false)
	assert.equal(JSON.stringify(durable).includes(alice.sessionId), false)
})

test('public connector continuity ownership survives stateless request changes without becoming install identity', () => {
	const record = ownedBy(connector, { handle: 'opaque-connector-fixture' })
	const reconnect = { ...connector, sessionId: 'mcpv2-request-b' }
	const durable = JSON.parse(JSON.stringify(record))
	assert.deepEqual(resourceOwnerForContext(connector), resourceOwnerForContext(reconnect))
	assert.deepEqual(as(reconnect, () => assertResourceAccess(durable)), durable)
	assert.equal(as(alice, () => canAccessResource(record)), false)
	assert.equal(JSON.stringify(record).includes(connector.resourceIdentityHash), false)
})

test('an install-bound resource cannot fall back to a matching session or caller identity claims', () => {
	const record = ownedBy(alice)
	for (const context of [
		{ ...bob, sessionId: alice.sessionId },
		{ sessionId: alice.sessionId },
		{ ...bob, accountId: alice.installHash, licenseId: alice.installHash, tenantId: alice.installHash,
			billingCustomerHash: alice.installHash, resourceOwner: record.resourceOwner, ownerId: record.resourceOwner.id,
			localMaintainer: true, clientInfo: alice, args: alice },
	]) assert.equal(as(context, () => canAccessResource(record)), false)
})

test('anonymous stateful resources bind to the issued session and never to a shared default', () => {
	const context = { sessionId: 'issued-anonymous-session' }
	const record = ownedBy(context)
	assert.equal(as(context, () => canAccessResource(record)), true)
	assert.equal(as({ sessionId: 'another-session' }, () => canAccessResource(record)), false)
	assert.equal(as({ ...alice, sessionId: context.sessionId }, () => canAccessResource(record)), false)
	for (const context of [{}, { sessionId: '' }, { sessionId: 'anonymous' }, { sessionId: 'stdio-default' },
		{ resourceIdentityHash: 'connector_wrong', sessionId: 'valid-session' }, { resourceIdentityHash: 1, sessionId: 'valid-session' },
		{ accountId: 'attacker' }, { tenantId: 'attacker' }, { billingCustomerHash: 'attacker' },
		{ sessionId: ' padded ' }, { sessionId: '\u0000' }, { sessionId: 'x'.repeat(513) }]) {
		assert.throws(() => resourceOwnerForContext(context), { code: 'RESOURCE_IDENTITY_REQUIRED' })
	}
})

test('malformed install identity cannot silently downgrade to a valid session', () => {
	for (const installHash of ['install_wrong', 'anonymous', ' install_' + 'a'.repeat(64), 1, true, {}, [], 'INSTALL_' + 'a'.repeat(64)]) {
		assert.throws(() => resourceOwnerForContext({ sessionId: 'valid-session', installHash }), { code: 'RESOURCE_IDENTITY_REQUIRED' })
	}
})

test('no implicit scope, environment switch, or request flag grants resource access', () => {
	const record = ownedBy(alice)
	assert.equal(canAccessResource(record), false)
	assert.throws(() => currentResourceOwner(), { code: 'RESOURCE_IDENTITY_REQUIRED' })
	assert.throws(() => bindNewResourceOwner({}), { code: 'RESOURCE_IDENTITY_REQUIRED' })
	assert.throws(() => resourceOwnerCacheKey('opaque'), { code: 'RESOURCE_IDENTITY_REQUIRED' })
	assert.throws(() => as({ localMaintainer: true, blackBox: false }, () => canAccessResource(record)), { code: 'RESOURCE_IDENTITY_REQUIRED' })
})

for (const [kind, code] of Object.entries({
	deck: 'DECK_EXPIRED_OR_UNKNOWN', asset: 'ASSET_NOT_FOUND', job: 'AVATAR_JOB_NOT_FOUND',
	operation: 'OPERATION_NOT_FOUND', download: 'ARTIFACT_NOT_FOUND', resource: 'RESOURCE_NOT_FOUND',
})) {
	test(`${kind}: missing, unowned and foreign paid records deny identically before a side effect`, () => {
		const foreign = ownedBy(alice, { paid: true, sensitive: 'fixture-content', downloadUrl: 'https://invalid.example/opaque' })
		let writes = 0
		const errors = as(bob, () => [null, {}, foreign].map(record => {
			try { assertResourceAccess(record, { kind }); writes++ }
			catch (error) { return { code: error.code, message: error.message, details: error.details } }
			assert.fail('resource was released without ownership')
		}))
		assert.equal(writes, 0)
		assert.equal(errors[0].code, code)
		assert.deepEqual(errors[1], errors[0])
		assert.deepEqual(errors[2], errors[0])
		assert.equal(JSON.stringify(errors).includes('fixture-content'), false)
		assert.equal(JSON.stringify(errors).includes(alice.installHash), false)
		assert.equal(as(reconnect, () => assertResourceAccess(foreign, { kind })), foreign)
	})
}

test('private metadata envelope survives stores that allowlist top-level fields', () => {
	const owner = resourceOwnerForContext(alice)
	const head = JSON.parse(JSON.stringify({ deckId: 'opaque-deck', metadata: { resourceOwner: owner } }))
	assert.deepEqual(resourceOwnerOf(head), owner)
	assert.equal(as(reconnect, () => canAccessResource(head)), true)
	assert.equal(as(bob, () => canAccessResource(head)), false)
	assert.equal(as(alice, () => canAccessResource({ metadata: {} })), false)
})

test('malformed, conflicting and inherited ownership never falls back to weaker bindings', () => {
	const owner = resourceOwnerForContext(alice)
	for (const record of [
		{ resourceOwner: null, metadata: { resourceOwner: owner } },
		{ resourceOwner: owner, metadata: { resourceOwner: null } },
		{ resourceOwner: owner, metadata: { resourceOwner: resourceOwnerForContext(bob) } },
		{ resourceOwner: { ...owner, schemaVersion: 'unknown-version' } },
		{ resourceOwner: { ...owner, id: 'short' }, installHash: alice.installHash },
		{ resourceOwner: { ...owner, kind: 'account' } },
		{ resourceOwner: Object.create(owner) },
		Object.create({ resourceOwner: owner }),
	]) assert.equal(as(alice, () => canAccessResource(record)), false)
	assert.equal(as(alice, () => canAccessResource({ resourceOwner: owner, metadata: { resourceOwner: owner } })), true)
})

test('ownership getters cannot run during an authorization check', () => {
	let invoked = false
	const record = { get resourceOwner() { invoked = true; throw new Error('getter') } }
	assert.equal(as(alice, () => canAccessResource(record)), false)
	assert.equal(invoked, false)
})

test('binding is immutable, idempotent for the same owner, and cannot reassign a foreign owner', () => {
	const record = ownedBy(alice)
	assert.equal(as(alice, () => bindNewResourceOwner(record)), record)
	assert.throws(() => { record.resourceOwner = resourceOwnerForContext(bob) }, TypeError)
	assert.throws(() => { record.resourceOwner.id = 'b'.repeat(64) }, TypeError)
	assert.throws(() => as(bob, () => bindNewResourceOwner(record)), { code: 'RESOURCE_NOT_FOUND' })
	assert.throws(() => as(alice, () => bindNewResourceOwner({ resourceOwner: null })), { code: 'RESOURCE_NOT_FOUND' })
	assert.equal(record.resourceOwner.schemaVersion, RESOURCE_OWNER_SCHEMA_VERSION)
})

test('parallel requests retain their captured owner through awaits and nested calls', async () => {
	let release
	const gate = new Promise(resolve => { release = resolve })
	const context = { ...alice }
	const a = as(context, async () => {
		await gate
		assert.deepEqual(currentResourceOwner(), resourceOwnerForContext(alice))
		await as(bob, async () => { await Promise.resolve(); assert.deepEqual(currentResourceOwner(), resourceOwnerForContext(bob)) })
		assert.deepEqual(currentResourceOwner(), resourceOwnerForContext(alice))
		return bindNewResourceOwner({})
	})
	context.installHash = bob.installHash
	const b = as(bob, async () => { release(); await gate; return bindNewResourceOwner({}) })
	const [recordA, recordB] = await Promise.all([a, b])
	assert.equal(as(reconnect, () => canAccessResource(recordA)), true)
	assert.equal(as(reconnect, () => canAccessResource(recordB)), false)
	assert.equal(canAccessResource(recordA), false)
})

test('a shared hydration promise must authorize each waiter after completion', async () => {
	let release
	const shared = new Promise(resolve => { release = resolve })
	const hydrate = context => as(context, async () => assertResourceAccess(await shared, { kind: 'deck' }))
	const a = hydrate(alice)
	const b = assert.rejects(hydrate(bob), { code: 'DECK_EXPIRED_OR_UNKNOWN' })
	const record = ownedBy(alice)
	release(record)
	assert.equal(await a, record)
	await b
})

test('cache and hydration keys separate owners while retaining opaque handle bytes and reconnect reuse', () => {
	const handle = `asset://locked/audio/${'f'.repeat(64)}.wav`
	const keyA = as(alice, () => resourceOwnerCacheKey(handle))
	assert.equal(as(reconnect, () => resourceOwnerCacheKey(handle)), keyA)
	assert.notEqual(as(bob, () => resourceOwnerCacheKey(handle)), keyA)
	assert.equal(JSON.parse(keyA)[2], handle)
	assert.notEqual(as(alice, () => resourceOwnerCacheKey(handle.toUpperCase())), keyA)
})

test('list and completed replay paths filter ownership before exposing handles or saved URLs', () => {
	const a = ownedBy(alice, { deckId: 'a', replay: { downloadUrl: 'https://invalid.example/a' } })
	const b = ownedBy(bob, { deckId: 'b' })
	const list = as(reconnect, () => [a, b, {}].filter(canAccessResource).map(record => record.deckId))
	assert.deepEqual(list, ['a'])
	assert.throws(() => as(bob, () => assertResourceAccess(a, { kind: 'deck' }).replay), { code: 'DECK_EXPIRED_OR_UNKNOWN' })
	assert.equal(as(reconnect, () => assertResourceAccess(a).replay), a.replay)
})

test('only the explicit trusted local option permits inspection of legacy unowned records', () => {
	const legacy = { deckId: 'legacy' }
	withResourceAuthorization({}, () => {
		assert.equal(assertResourceAccess(legacy), legacy)
		assert.equal(canAccessResource(null), false)
		assert.equal(currentResourceOwner().kind, 'local')
	}, { localMaintainer: true })
	assert.equal(as(alice, () => canAccessResource(legacy)), false)
	const local = withResourceAuthorization({}, () => bindNewResourceOwner({}), { localMaintainer: true })
	assert.equal(as({ sessionId: 'maintainer' }, () => canAccessResource(local)), false)
})
