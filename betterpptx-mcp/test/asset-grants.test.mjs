import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { assetGrantBundleBytes, createAssetGrantManager, requiresAssetGrant, MAX_ASSET_GRANTS_PER_PRODUCTION } from '../auth/asset-grants.mjs'
import { bindNewResourceOwner, withResourceAuthorization } from '../auth/resource-authorization.mjs'
import { BillingSecurityFirestore } from './fixtures/billing-security-firestore.mjs'

const alice = { installHash: `install_${'a'.repeat(64)}`, sessionId: 'asset-session-a' }
const bob = { installHash: `install_${'b'.repeat(64)}`, sessionId: 'asset-session-b' }
const reconnect = { ...alice, sessionId: 'asset-session-a-reconnect' }
const bytes = Buffer.from('offline fixture content, independently uploaded')
const sha = value => createHash('sha256').update(value).digest('hex')
const locked = (payload = bytes, kind = 'uploaded-image') => `asset://locked/${kind}/${sha(payload)}.png`
const as = (manager, context, fn) => withResourceAuthorization(context, () => manager.withAccess(fn))
const operation = () => bindNewResourceOwner({ operationId: `fixture_${randomUUID()}`, state: 'running' })

async function fixture(t, provider) {
	const temporaryRoot = path.resolve(os.tmpdir())
	const directory = await fs.mkdtemp(path.join(temporaryRoot, 'betterpptx-asset-grants-test-'))
	t.after(async () => {
		assert.equal(path.dirname(path.resolve(directory)), temporaryRoot)
		assert.ok(path.basename(directory).startsWith('betterpptx-asset-grants-test-'))
		await fs.rm(directory, { recursive: true, force: true })
	})
	const env = { NODE_ENV: 'test', BETTERPPTX_ASSET_GRANT_STORE: provider, BETTERPPTX_ASSET_GRANT_DIR: directory }
	const db = new BillingSecurityFirestore()
	const manager = () => createAssetGrantManager({ env, firestoreClient: db })
	async function records() {
		if (provider === 'firestore') return [...db.rows].map(([key, value]) => ({ key, value }))
		const rows = []
		for (const prefix of await fs.readdir(directory, { withFileTypes: true })) {
			if (!prefix.isDirectory()) continue
			for (const file of await fs.readdir(path.join(directory, prefix.name))) {
				if (!file.endsWith('.json')) continue
				const key = path.join(directory, prefix.name, file)
				rows.push({ key, value: JSON.parse(await fs.readFile(key, 'utf8')) })
			}
		}
		return rows
	}
	async function tamper(key, value) {
		if (provider === 'firestore') db.rows.set(key, structuredClone(value))
		else await fs.writeFile(key, JSON.stringify(value), { mode: 0o600 })
	}
	return { env, db, manager, records, tamper }
}

async function produce(manager, context, handle = locked(), payload = bytes, source = 'upload') {
	return as(manager, context, () => manager.produce({ operation: operation(), source }, output => {
		output.capture(handle, payload)
		return { ok: true, handle }
	}))
}

for (const provider of ['local', 'firestore']) {
	test(`${provider}: same-install reconnect and a fresh manager restore grants; another owner cannot read`, async t => {
		const f = await fixture(t, provider)
		const manager = f.manager()
		await produce(manager, alice)
		const fresh = f.manager()
		await as(fresh, reconnect, async () => {
			assert.throws(() => fresh.assertAccessSync(locked()), { code: 'ASSET_NOT_FOUND' })
			assert.equal(await fresh.assertAccess(locked()), locked())
			assert.equal(fresh.assertBytesSync(locked(), bytes), bytes)
		})
		await as(fresh, bob, () => assert.rejects(fresh.assertAccess(locked()), { code: 'ASSET_NOT_FOUND' }))
		assert.throws(() => fresh.assertAccessSync(locked()), { code: 'RESOURCE_IDENTITY_REQUIRED' })
		const rows = await f.records()
		assert.equal(rows.length, 1)
		const serialized = JSON.stringify(rows.map(row => row.value))
		assert.equal(serialized.includes(alice.installHash), false)
		assert.equal(serialized.includes(alice.sessionId), false)
		assert.equal(serialized.includes(bytes.toString()), false)
	})

	test(`${provider}: concurrent independent uploads of identical bytes grant both owners without rebinding content`, async t => {
		const f = await fixture(t, provider)
		await Promise.all([produce(f.manager(), alice), produce(f.manager(), bob)])
		assert.equal((await f.records()).length, 2)
		for (const context of [reconnect, bob]) {
			const fresh = f.manager()
			await as(fresh, context, async () => { await fresh.assertAccess(locked()); fresh.assertBytesSync(locked(), bytes) })
		}
	})

	test(`${provider}: concurrent repeated production is idempotent for the same owner and content`, async t => {
		const f = await fixture(t, provider)
		await Promise.all(Array.from({ length: 5 }, () => produce(f.manager(), alice)))
		const [before] = await f.records()
		assert.equal((await f.records()).length, 1)
		await produce(f.manager(), reconnect)
		assert.deepEqual((await f.records())[0].value, before.value)
	})

	test(`${provider}: successful callback return containing an arbitrary handle never grants it`, async t => {
		const f = await fixture(t, provider)
		const manager = f.manager()
		await as(manager, bob, () => manager.produce({ operation: operation(), source: 'upload' }, () => ({ handle: locked(), ownerId: alice.installHash })))
		await as(manager, bob, () => assert.rejects(manager.assertAccess(locked()), { code: 'ASSET_NOT_FOUND' }))
		assert.equal((await f.records()).length, 0)
		assert.equal(manager.grantShared, undefined)
		assert.equal(manager.grant, undefined)
	})

	test(`${provider}: failed, cancelled and thrown production never commits captured outputs`, async t => {
		const f = await fixture(t, provider)
		const manager = f.manager()
		for (const result of [{ ok: false }, { status: 'failed' }, { state: 'cancelled' }, { error: { code: 'FAIL' } }, { ok: true, status: 'queued' }, { state: 'running' }]) {
			await as(manager, alice, () => assert.rejects(manager.produce({ operation: operation(), source: 'generation' }, output => {
				output.capture(locked(), bytes)
				return result
			}), { code: 'ASSET_PRODUCTION_NOT_AUTHORIZED' }))
		}
		await as(manager, alice, () => assert.rejects(manager.produce({ operation: operation(), source: 'upload' }, output => {
			output.capture(locked(), bytes)
			throw new Error('fixture failure')
		}), /fixture failure/))
		assert.equal((await f.records()).length, 0)
	})

	test(`${provider}: staged output is usable only inside its production; no grant appears before success`, async t => {
		const f = await fixture(t, provider)
		const manager = f.manager()
		let release, captured
		const gate = new Promise(resolve => { release = resolve })
		const ready = new Promise(resolve => { captured = resolve })
		const pending = as(manager, alice, () => manager.produce({ operation: operation(), source: 'upload' }, async output => {
			output.capture(locked(), bytes)
			manager.assertBytesSync(locked(), bytes)
			captured()
			await gate
			return { ok: true }
		}))
		await ready
		assert.equal((await f.records()).length, 0)
		await as(manager, reconnect, () => assert.rejects(manager.assertAccess(locked()), { code: 'ASSET_NOT_FOUND' }))
		release()
		await pending
		await as(manager, reconnect, () => manager.assertAccess(locked()))
	})

	test(`${provider}: canonical and legacy generated aliases share an owner grant without changing public handles`, async t => {
		const f = await fixture(t, provider)
		for (const [canonical, legacy] of [['gen://image/12345678', 'gen://flux/image/12345678'], ['gen://rigged3d/abcdef12', 'gen://trellis/rigged3d/abcdef12']]) {
			const manager = f.manager()
			await produce(manager, alice, canonical, bytes, 'generation')
			await as(manager, reconnect, async () => {
				assert.equal(await manager.assertAccess(legacy), legacy)
				manager.assertBytesSync(canonical, bytes)
			})
			await as(manager, bob, () => assert.rejects(manager.assertAccess(legacy), { code: 'ASSET_NOT_FOUND' }))
		}
	})

	test(`${provider}: a global generated cache collision cannot substitute another owner's bytes`, async t => {
		const f = await fixture(t, provider)
		const handle = 'gen://image/12345678'
		const changed = Buffer.from('separate successful generation by B')
		await produce(f.manager(), alice, handle, bytes, 'generation')
		await produce(f.manager(), bob, handle, changed, 'generation')
		const manager = f.manager()
		await as(manager, reconnect, async () => {
			await manager.assertAccess(handle)
			assert.throws(() => manager.assertBytesSync(handle, changed), { code: 'ASSET_CONTENT_CONFLICT' })
			assert.equal(manager.assertBytesSync(handle, bytes), bytes)
		})
		await assert.rejects(produce(f.manager(), alice, handle, changed, 'generation'), { code: 'ASSET_CONTENT_CONFLICT' })
		assert.equal((await f.records()).length, 2)
	})

	test(`${provider}: wrong-owner and unowned operation records fail before producer invocation`, async t => {
		const f = await fixture(t, provider)
		const manager = f.manager()
		const owned = as(manager, alice, operation)
		let calls = 0
		for (const op of [owned, { state: 'running', operationId: 'unowned' }]) {
			await as(manager, bob, () => assert.rejects(manager.produce({ operation: op, source: 'upload' }, () => { calls++ }), { code: 'ASSET_PRODUCTION_NOT_AUTHORIZED' }))
		}
		await as(manager, alice, () => assert.rejects(manager.produce({ operation: operation(), source: 'reimport' }, () => { calls++ }), { code: 'ASSET_PRODUCTION_NOT_AUTHORIZED' }))
		assert.equal(calls, 0)
		assert.equal((await f.records()).length, 0)
	})

	test(`${provider}: invalid captures poison a production even if the callback catches the error`, async t => {
		const f = await fixture(t, provider)
		const manager = f.manager()
		await as(manager, alice, () => assert.rejects(manager.produce({ operation: operation(), source: 'upload' }, output => {
			output.capture(locked(), bytes)
			assert.throws(() => output.capture(locked(), Buffer.from('wrong digest')), { code: 'ASSET_CONTENT_CONFLICT' })
			return { ok: true }
		}), { code: 'ASSET_PRODUCTION_NOT_AUTHORIZED' }))
		assert.equal((await f.records()).length, 0)
	})

	test(`${provider}: malformed ownership or content records fail closed across reload`, async t => {
		const f = await fixture(t, provider)
		await produce(f.manager(), alice)
		const [record] = await f.records()
		for (const invalid of [null, {}, { ...record.value, resourceOwner: null }, { ...record.value, assetKey: '0'.repeat(64) },
			{ ...record.value, sha256: '0'.repeat(64) }, { ...record.value, source: 'reimport' }]) {
			await f.tamper(record.key, invalid)
			const fresh = f.manager()
			await as(fresh, reconnect, () => assert.rejects(fresh.assertAccess(locked()), { code: 'ASSET_NOT_FOUND' }))
			await assert.rejects(produce(fresh, alice), error => ['ASSET_NOT_FOUND', 'ASSET_CONTENT_CONFLICT'].includes(error.code))
		}
	})

	test(`${provider}: no prefetched grant crosses an owner or request boundary`, async t => {
		const f = await fixture(t, provider)
		const manager = f.manager()
		await produce(manager, alice)
		await as(manager, alice, async () => {
			await manager.authorize([locked(), 'asset://catalog/image/approved', 'https://example.invalid/image'])
			withResourceAuthorization(bob, () => assert.throws(() => manager.assertAccessSync(locked()), { code: 'ASSET_NOT_FOUND' }))
			manager.assertBytesSync(locked(), bytes)
		})
		as(manager, reconnect, () => assert.throws(() => manager.assertAccessSync(locked()), { code: 'ASSET_NOT_FOUND' }))
	})
}

test('catalog assets remain on the catalog resolver and private/unknown schemes cannot masquerade as public', () => {
	for (const handle of ['asset://catalog/image/approved', 'model3d://builtin', 'https://example.invalid/image', 'data:image/png;base64,' + 'a'.repeat(4096)]) {
		assert.equal(requiresAssetGrant(handle), false)
	}
	for (const handle of [locked(), 'asset://generated/audio/legacy-id', 'asset://uploaded/image/legacy-id', locked(bytes, 'opaque-native'), 'gen://flux/image/abcdef12']) {
		assert.equal(requiresAssetGrant(handle), true)
	}
	for (const handle of ['asset://locked/../' + sha(bytes), 'asset://generated/../../private', 'asset://catalogue/approved',
		'asset://generated/%2e%2e/private', 'gen://unknown/abcdef12', 'gen://image/abcdef12?owner=bob']) {
		assert.throws(() => requiresAssetGrant(handle), { code: 'ASSET_NOT_FOUND' })
	}
})

test('production/shared deployments never use the local test store, even after environment mode changes', async t => {
	const f = await fixture(t, 'local')
	for (const settings of [{ NODE_ENV: 'production' }, { BETTERPPTX_ENV: 'live' }, { BETTERPPTX_DEPLOYMENT_STAGE: 'prod' }, { BETTERPPTX_REQUIRE_SHARED_STORES: '1' }, { K_SERVICE: 'fixture-service' }]) {
		const env = { ...f.env, ...settings }
		const manager = createAssetGrantManager({ env })
		let invoked = false
		await as(manager, alice, () => assert.rejects(manager.produce({ operation: operation(), source: 'upload' }, () => { invoked = true }), { code: 'ASSET_GRANT_STORE_UNAVAILABLE' }))
		assert.equal(invoked, false)
	}
	const manager = f.manager()
	await produce(manager, alice)
	await as(manager, alice, async () => {
		await manager.assertAccess(locked())
		f.env.NODE_ENV = 'production'
		assert.throws(() => manager.assertAccessSync(locked()), { code: 'ASSET_GRANT_STORE_UNAVAILABLE' })
	})
})

test('disabled, unsupported and unconfigured grant stores fail closed without invoking production', async () => {
	for (const env of [{}, { BETTERPPTX_ASSET_GRANT_STORE: 'memory' }, { BETTERPPTX_ASSET_GRANT_STORE: 'local' },
		{ BETTERPPTX_ASSET_GRANT_STORE: 'local', BETTERPPTX_ASSET_GRANT_DIR: 'relative' },
		{ BETTERPPTX_ASSET_GRANT_STORE: 'firestore', BETTERPPTX_FIRESTORE_ASSET_GRANTS_COLLECTION: '../private' }]) {
		const manager = createAssetGrantManager({ env })
		let calls = 0
		await as(manager, alice, () => assert.rejects(manager.produce({ operation: operation(), source: 'upload' }, () => { calls++ }), { code: 'ASSET_GRANT_STORE_UNAVAILABLE' }))
		assert.equal(calls, 0)
	}
})

test('shared transaction failure neither publishes grants nor arms the synchronous resolver', async t => {
	const f = await fixture(t, 'firestore')
	f.env.NODE_ENV = 'production'
	f.db.failCommit = true
	const manager = f.manager()
	await as(manager, alice, async () => {
		await assert.rejects(manager.produce({ operation: operation(), source: 'upload' }, output => {
			output.capture(locked(), bytes)
			output.capture(locked(Buffer.from('poster')), Buffer.from('poster'))
			return { ok: true }
		}), { code: 'ASSET_GRANT_STORE_UNAVAILABLE' })
		assert.throws(() => manager.assertAccessSync(locked()), { code: 'ASSET_NOT_FOUND' })
	})
	assert.equal(f.db.rows.size, 0)
})

test('shared read failures return a generic denial and never fall back to a previous request cache', async t => {
	const f = await fixture(t, 'firestore')
	const manager = f.manager()
	await produce(manager, alice)
	f.db.reference = () => ({ get: async () => { throw new Error('private backend path and credentials must not escape') } })
	await as(manager, alice, () => assert.rejects(manager.assertAccess(locked()), error => {
		assert.equal(error.code, 'ASSET_GRANT_STORE_UNAVAILABLE')
		assert.equal(error.message.includes('credentials'), false)
		assert.equal(error.cause, undefined)
		return true
	}))
})

test('capture cannot escape its lifecycle, change owners or exceed the bounded output count', async t => {
	const f = await fixture(t, 'firestore')
	const manager = f.manager()
	let savedCapture
	await as(manager, alice, () => manager.produce({ operation: operation(), source: 'upload' }, output => { savedCapture = output.capture; return { ok: true } }))
	as(manager, alice, () => assert.throws(() => savedCapture(locked(), bytes), { code: 'ASSET_PRODUCTION_NOT_AUTHORIZED' }))
	await as(manager, alice, () => assert.rejects(manager.produce({ operation: operation(), source: 'upload' }, output => {
		withResourceAuthorization(bob, () => assert.throws(() => output.capture(locked(), bytes), { code: 'ASSET_PRODUCTION_NOT_AUTHORIZED' }))
		return { ok: true }
	}), { code: 'ASSET_PRODUCTION_NOT_AUTHORIZED' }))
	await as(manager, alice, () => assert.rejects(manager.produce({ operation: operation(), source: 'generation' }, output => {
		for (let i = 0; i <= MAX_ASSET_GRANTS_PER_PRODUCTION; i++) output.capture(`gen://image/${sha(String(i))}`, bytes)
		return { ok: true }
	}), { code: 'ASSET_PRODUCTION_NOT_AUTHORIZED' }))
	assert.equal(f.db.rows.size, 0)
})

test('compound generated assets bind every consumed blob, not only their model bytes', async t => {
	const f = await fixture(t, 'firestore')
	const manager = f.manager()
	const model = Buffer.from('fixture GLB'), poster = Buffer.from('fixture poster')
	const bundle = assetGrantBundleBytes({ model, poster })
	assert.deepEqual(assetGrantBundleBytes({ poster, model }), bundle)
	assert.equal(bundle.toString().includes('fixture GLB'), false)
	await produce(manager, alice, 'gen://rigged3d/abcdef12', bundle, 'generation')
	await as(manager, reconnect, async () => {
		await manager.assertAccess('gen://rigged3d/abcdef12')
		manager.assertBytesSync('gen://rigged3d/abcdef12', assetGrantBundleBytes({ model, poster }))
		assert.throws(() => manager.assertBytesSync('gen://rigged3d/abcdef12', assetGrantBundleBytes({ model, poster: Buffer.from('foreign poster') })), { code: 'ASSET_CONTENT_CONFLICT' })
		assert.throws(() => manager.assertBytesSync('gen://rigged3d/abcdef12', assetGrantBundleBytes({ model })), { code: 'ASSET_CONTENT_CONFLICT' })
	})
})

test('bundle evidence rejects empty/string payloads, path names and accessor tricks', () => {
	let getterInvoked = false
	for (const parts of [{}, [], { model: 'base64-is-not-decoded-bytes' }, { model: Buffer.alloc(0) },
		{ '../file': bytes }, { get model() { getterInvoked = true; return bytes } }]) {
		assert.throws(() => assetGrantBundleBytes(parts), { code: 'ASSET_PRODUCTION_NOT_AUTHORIZED' })
	}
	assert.equal(getterInvoked, false)
})

test('a separate process can reconnect using only the durable local grant, without inherited request state', async t => {
	const f = await fixture(t, 'local')
	await produce(f.manager(), alice)
	const script = `
		import { createAssetGrantManager } from ${JSON.stringify(new URL('../auth/asset-grants.mjs', import.meta.url).href)};
		import { withResourceAuthorization } from ${JSON.stringify(new URL('../auth/resource-authorization.mjs', import.meta.url).href)};
		const manager = createAssetGrantManager({ env: JSON.parse(process.argv[1]) });
		await withResourceAuthorization(${JSON.stringify(reconnect)}, () => manager.withAccess(async () => {
			await manager.assertAccess(${JSON.stringify(locked())});
			manager.assertBytesSync(${JSON.stringify(locked())}, Buffer.from(${JSON.stringify(bytes.toString('base64'))}, 'base64'));
		}));
		process.stdout.write('authorized');
	`
	const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(f.env)], {
		env: process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {},
		windowsHide: true,
		timeout: 15000,
	})
	assert.equal(stdout, 'authorized')
})
