import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { registerHooks } from 'node:module'
import { createInstallUsageStore } from '../auth/install-identity.mjs'
import { digestOperationPayload } from '../storage/operation-store.mjs'

// Entire provider is synthetic. Strict document validation and serialized,
// staged transactions model atomic commits without global undefined settings.
const mockUrl = `data:text/javascript,${encodeURIComponent(`
	export const documents = new Map()
	export const state = { fault: '', writes: 0, constructors: 0 }
	let lock = Promise.resolve()
	export function strictJson(value, location = 'document') {
		if (value === undefined) throw new Error('Firestore Cannot use undefined ' + location)
		if (value === null || typeof value === 'string' || typeof value === 'boolean') return
		if (typeof value === 'number' && Number.isFinite(value)) return
		if (typeof value !== 'object' || value instanceof Date) throw new Error('Not JSON-compatible ' + location)
		if (Array.isArray(value)) {
			for (let i = 0; i < value.length; i++) strictJson(value[i], location + '[' + i + ']')
		} else for (const [key, item] of Object.entries(value)) strictJson(item, location + '.' + key)
	}
	const snapshot = key => ({ exists: documents.has(key), data: () => structuredClone(documents.get(key)) })
	export class Firestore {
		constructor(options) { if ('ignoreUndefinedProperties' in options) throw new Error('Global suppression forbidden'); state.constructors++ }
		settings() { throw new Error('Global settings forbidden') }
		collection(name) { return { doc: id => ({ path: name + '/' + id, get: async () => snapshot(name + '/' + id) }) } }
		runTransaction(callback) {
			const task = lock.then(async () => {
				const pending = new Map()
				const result = await callback({
					get: async ref => snapshot(ref.path),
					set: (ref, value, options) => {
						strictJson(value)
						if (options.merge !== false && options.merge !== true) throw new Error('Explicit merge required')
						pending.set(ref.path, options.merge ? { ...documents.get(ref.path), ...structuredClone(value) } : structuredClone(value))
					},
				})
				const fault = state.fault; state.fault = ''
				if (fault === 'before-commit') throw Object.assign(new Error('Synthetic unavailable'), { code: 14 })
				for (const [key, value] of pending) { documents.set(key, value); state.writes++ }
				if (fault === 'lost-ack') throw Object.assign(new Error('Synthetic lost acknowledgement'), { code: 14 })
				return result
			})
			lock = task.catch(() => {})
			return task
		}
	}
`)}`
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
	return specifier === '@google-cloud/firestore' ? { url: mockUrl, shortCircuit: true } : nextResolve(specifier, context)
} })
test.after(() => hooks.deregister())
const { documents, state, strictJson } = await import(mockUrl)
const alice = `install_${'a'.repeat(64)}`, bob = `install_${'b'.repeat(64)}`
const time = Date.UTC(2031, 0, 2, 12), windowMs = 30 * 24 * 60 * 60 * 1000
const category = 'deck-publication'
const request = (reservationId, patch = {}) => ({ category, reservationId, limit: 3, windowMs, leaseMs: 60_000, nowMs: time, ...patch })
const docId = (identity = alice, kind = category) => `rolling_${createHash('sha256').update(`${kind}\0${identity}`).digest('hex')}`

async function fixture(t, provider) {
	documents.clear(); state.fault = ''; state.writes = 0
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-free-value-json-'))
	const file = path.join(root, 'usage.json')
	const env = {
		BETTERPPTX_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: 'test', NODE_ENV: 'test',
		BETTERPPTX_INSTALL_USAGE_STORE: provider, BETTERPPTX_INSTALL_USAGE_FILE: file,
		BETTERPPTX_REQUIRE_SHARED_STORES: '0', BETTERPPTX_FIRESTORE_INSTALL_USAGE_COLLECTION: 'allowance_fixture',
		BETTERPPTX_GCP_PROJECT: 'synthetic-project', BETTERPPTX_FIRESTORE_DATABASE: 'synthetic-database',
		BETTERPPTX_ENTITLEMENT_STORE: 'local', BETTERPPTX_ENTITLEMENTS_FILE: path.join(root, 'entitlements.json'),
		BETTERPPTX_BILLING_LEDGER_STORE: 'local', BETTERPPTX_BILLING_LEDGER_FILE: path.join(root, 'billing.json'),
		BETTERPPTX_DURABLE_OPERATION_STORE: 'local', BETTERPPTX_OPERATION_STORE_FILE: path.join(root, 'operations.json'),
		BETTERPPTX_REQUIRE_DURABLE_OPERATIONS: '0', BETTERPPTX_PUBLIC_BLACK_BOX: '1',
		BETTERPPTX_FORCE_PLAN: 'free', BETTERPPTX_PREMIUM: '0', BETTERPPTX_FREE_PUBLICATIONS_PER_WINDOW: '3',
		BETTERPPTX_FREE_IDENTITY_MEDIA_PER_WINDOW: '3', BETTERPPTX_FREE_NARRATION_PREPARATIONS_PER_WINDOW: '3',
	}
	const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
	Object.assign(process.env, env)
	t.after(async () => {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key]; else process.env[key] = value
		}
		assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
		assert.ok(path.basename(root).startsWith('betterpptx-free-value-json-'))
		await fs.rm(root, { recursive: true, force: true })
	})
	const store = createInstallUsageStore()
	const stored = async (identity = alice, kind = category) => provider === 'firestore'
		? structuredClone(documents.get(`allowance_fixture/${docId(identity, kind)}`))
		: JSON.parse(await fs.readFile(file, 'utf8')).rolling?.[docId(identity, kind)]
	return { store, stored, file, provider }
}

test('strict fake rejects the real events[0].metadata.operationId failure and array holes', () => {
	assert.throws(() => strictJson({ events: [{ metadata: { operationId: undefined } }] }),
		/Firestore Cannot use undefined document.events\[0\].metadata.operationId/)
	assert.throws(() => strictJson({ values: Array(1) }), /Cannot use undefined/)
})

for (const provider of ['local', 'firestore']) {
	test(`${provider}: optional event metadata normalizes with null/false/zero, dates, arrays and exact owner binding`, async t => {
		const { store, stored } = await fixture(t, provider)
		const date = new Date(time)
		const metadata = { tool: 'betterpptx.deck.save', operationId: undefined, deckIdHash: undefined,
			nested: { optional: undefined, explicitNull: null, allowed: false, credits: 0 },
			values: [undefined, , null, false, 0, { optional: undefined, name: 'kept' }],
			date, numbers: [Number.MIN_VALUE, Number.MAX_VALUE, -2.5] }
		const expected = JSON.parse(JSON.stringify(metadata))
		const reserved = await store.reserveRollingUsage(alice, request('save-1'))
		assert.equal(reserved.reserved, 1)
		const committed = await store.commitRollingUsage(alice, request('save-1', { metadata }))
		assert.equal(committed.ok, true)
		assert.equal(committed.used, 1)
		assert.equal(committed.reserved, 0)
		let record = await stored()
		strictJson(record)
		assert.equal(record.identityHash, alice)
		assert.equal(record.category, category)
		assert.equal(record.events[0].reservationHash, reserved.reservationHash)
		assert.deepEqual(record.events[0].metadata, expected)
		assert.equal(Object.hasOwn(metadata, 'operationId'), true, 'do not mutate caller metadata')
		assert.equal(metadata.date, date)
		await createInstallUsageStore().getRollingUsage(alice, request('read'))
		await store.reserveRollingUsage(alice, request('save-2'))
		await store.releaseRollingUsage(alice, request('save-2'))
		record = await stored()
		strictJson(record)
		assert.equal(record.events.length, 1)
		assert.deepEqual(record.events[0].metadata, expected, 'all rewrite paths must preserve existing optional metadata safely')
	})

	test(`${provider}: commits without metadata and legacy metadata-free events survive snapshot/reserve/release/commit`, async t => {
		const { store, stored } = await fixture(t, provider)
		await store.reserveRollingUsage(alice, request('legacy-save'))
		await store.commitRollingUsage(alice, request('legacy-save'))
		assert.equal(Object.hasOwn((await stored()).events[0], 'metadata'), false)
		assert.equal((await store.getRollingUsage(alice, request('status'))).used, 1)
		await store.reserveRollingUsage(alice, request('second-save'))
		await store.releaseRollingUsage(alice, request('second-save'))
		await store.reserveRollingUsage(alice, request('second-save'))
		await store.commitRollingUsage(alice, request('second-save', { metadata: { operationId: undefined, tool: 'betterpptx.deck.save' } }))
		const record = await stored()
		strictJson(record)
		assert.equal(record.events.length, 2)
		assert.equal(Object.hasOwn(record.events[0], 'metadata'), false)
		assert.deepEqual(record.events[1].metadata, { tool: 'betterpptx.deck.save' })
	})

	test(`${provider}: competing reserves, duplicate commits and releases conserve quota atomically across cold stores`, async t => {
		const { store, stored } = await fixture(t, provider)
		const attempts = await Promise.all(Array.from({ length: 12 }, (_, i) => store.reserveRollingUsage(alice, request(`competing-${i}`))))
		assert.equal(attempts.filter(result => result.ok).length, 3)
		assert.ok(attempts.filter(result => !result.ok).every(result => result.code === 'ROLLING_QUOTA_EXHAUSTED'))
		const duplicate = await Promise.all(Array.from({ length: 8 }, () => store.commitRollingUsage(alice, request('competing-0', { metadata: { operationId: undefined } }))))
		assert.ok(duplicate.every(result => result.ok && result.used === 1 && result.reserved === 2))
		await store.releaseRollingUsage(alice, request('competing-1'))
		await store.releaseRollingUsage(alice, request('competing-1'))
		await store.releaseRollingUsage(alice, request('competing-0'))
		let record = await stored()
		assert.equal(record.events.length, 1, 'one committed allowance event per exact reservation')
		assert.equal(record.reservations.length, 1, 'release never refunds committed usage')
		const cold = createInstallUsageStore()
		assert.equal((await cold.reserveRollingUsage(alice, request('competing-0'))).status, 'committed')
		await cold.commitRollingUsage(alice, request('competing-2'))
		await cold.reserveRollingUsage(alice, request('replacement'))
		await cold.commitRollingUsage(alice, request('replacement'))
		assert.equal((await cold.reserveRollingUsage(alice, request('over-limit'))).ok, false)
		assert.equal((await cold.reserveRollingUsage(alice, request('replacement'))).status, 'committed')
		record = await stored()
		assert.equal(record.events.length, 3)
		assert.equal(record.reservations.length, 0)
	})

	test(`${provider}: foreign-owner and foreign-category commits cannot consume or release another reservation`, async t => {
		const { store, stored } = await fixture(t, provider)
		await store.reserveRollingUsage(alice, request('same-id'))
		assert.equal((await store.commitRollingUsage(bob, request('same-id'))).code, 'ROLLING_RESERVATION_NOT_FOUND')
		await store.releaseRollingUsage(bob, request('same-id'))
		assert.equal((await stored()).reservations.length, 1)
		assert.equal((await store.commitRollingUsage(alice, request('same-id', { category: 'narration-preparation' }))).code, 'ROLLING_RESERVATION_NOT_FOUND')
		await store.reserveRollingUsage(bob, request('same-id'))
		await store.commitRollingUsage(bob, request('same-id', { metadata: { operationId: undefined } }))
		await store.commitRollingUsage(alice, request('same-id', { metadata: { operationId: undefined } }))
		assert.equal((await stored()).identityHash, alice)
		assert.equal((await stored(bob)).identityHash, bob)
		assert.equal((await stored()).events.length, 1)
		assert.equal((await stored(bob)).events.length, 1)
	})

	test(`${provider}: finite clock boundaries preserve lease expiry and rolling-window accounting`, async t => {
		const { store } = await fixture(t, provider)
		await store.reserveRollingUsage(alice, request('expiring'))
		const expired = await store.commitRollingUsage(alice, request('expiring', { nowMs: time + 60_000, metadata: { operationId: undefined } }))
		assert.equal(expired.code, 'ROLLING_RESERVATION_NOT_FOUND')
		assert.equal(expired.reserved, 0)
		await store.reserveRollingUsage(alice, request('committed'))
		await store.commitRollingUsage(alice, request('committed', { metadata: { operationId: undefined } }))
		assert.equal((await store.getRollingUsage(alice, request('before-boundary', { nowMs: time + windowMs - 1 }))).used, 1)
		assert.equal((await store.getRollingUsage(alice, request('at-boundary', { nowMs: time + windowMs }))).used, 0)
	})

	test(`${provider}: invalid metadata fails atomically instead of coercing accounting truth; prototype keys remain data`, async t => {
		const { store, stored } = await fixture(t, provider)
		await store.reserveRollingUsage(alice, request('invalid-metadata'))
		const before = await stored()
		const cycle = {}; cycle.self = cycle
		for (const invalid of [NaN, Infinity, -Infinity, new Date(NaN), 1n, Symbol('bad'), () => true, new Map(), cycle]) {
			await assert.rejects(store.commitRollingUsage(alice, request('invalid-metadata', { metadata: { value: invalid } })), { code: 'INSTALL_USAGE_PAYLOAD_INVALID' })
			assert.deepEqual(await stored(), before, 'failed persistence must leave the original reservation intact')
		}
		const fields = JSON.parse('{"__proto__":{"polluted":true},"constructor":false,"prototype":0}')
		const shared = { optional: undefined, explicitNull: null, allowed: false, credits: 0 }
		await store.commitRollingUsage(alice, request('invalid-metadata', { metadata: { ...fields, a: shared, b: shared } }))
		const metadata = (await stored()).events[0].metadata
		assert.equal(Object.hasOwn(metadata, '__proto__'), true)
		assert.equal({}.polluted, undefined)
		assert.deepEqual(metadata.a, metadata.b)
		assert.deepEqual(metadata.a, { explicitNull: null, allowed: false, credits: 0 })
	})

	test(`${provider}: real free-value entitlement binding handles all event routes and never adopts a changed save`, async t => {
		const { stored } = await fixture(t, provider)
		// Separate module instances keep the real entitlement-store cache isolated
		// for each backend; identity/digest and policy code itself are not mocked.
		const { reserveFreeValue, commitFreeValue, releaseFreeValue, getFreeValueStatus } = await import(`../auth/entitlements.mjs?allowance-json-${provider}`)
		const context = { installHash: alice, authenticated: true, sessionId: 'allowance-json-owner' }
		const routes = [
			['betterpptx.deck.save', { deckId: 'deck-one', deckVersion: 1 }, 'deck-publication'],
			['betterpptx.narration.synthesize', { segments: [{ script: 'Measured narration.' }] }, 'narration-preparation'],
			['betterpptx.avatar.render_job', { audioHandle: 'asset://audio' }, 'talking-head-generation'],
			['betterpptx.assets.generate_rigged3d', { imageHandles: ['asset://front', 'asset://side'] }, 'rigged3d-persona-generation'],
		]
		for (const [tool, args, kind] of routes) {
			const original = await reserveFreeValue(tool, { ...args, idempotencyKey: 'shared-key' }, context)
			const operationId = `op_${'c'.repeat(32)}`
			const expectedDigest = digestOperationPayload({ tool, idempotencyKey: 'shared-key', args })
			assert.equal(original.identityHash, alice)
			assert.equal(original.request.reservationId, `free-value.v2:${expectedDigest}`)
			await commitFreeValue(original, { tool, operationId, deckIdHash: undefined, approved: false, credits: 0, reason: null })
			const replay = await reserveFreeValue(tool, { idempotency_key: ' shared-key ', ...args }, { ...context, sessionId: 'reconnected' })
			assert.equal(replay.status, 'committed')
			assert.equal(replay.request.reservationId, original.request.reservationId)
			assert.equal((await commitFreeValue(replay, { operationId: `op_${'d'.repeat(32)}`, requestDigest: 'altered-retry-metadata' })).used, 1)
			await releaseFreeValue(replay)
			const status = await getFreeValueStatus(tool, args, context)
			assert.equal(status.used, 1)
			assert.equal(status.reserved, 0)
			const record = await stored(alice, kind)
			strictJson(record)
			assert.equal(record.identityHash, alice)
			assert.equal(record.category, kind)
			assert.equal(record.events.length, 1)
			assert.equal(record.events[0].reservationHash, createHash('sha256').update(`free-value.v2:${expectedDigest}`).digest('hex'))
			assert.deepEqual(record.events[0].metadata, { tool, operationId, approved: false, credits: 0, reason: null },
				'authoritative committed operation metadata must survive rewrites; retry cannot replace its operation ID or reservation digest')
		}
		const save = 'betterpptx.deck.save'
		const changed = await reserveFreeValue(save, { deckId: 'deck-two', deckVersion: 1, idempotencyKey: 'shared-key' }, context)
		const third = await reserveFreeValue(save, { deckId: 'deck-three', deckVersion: 1, idempotencyKey: 'shared-key' }, context)
		assert.equal(changed.status, 'reserved')
		assert.notEqual(changed.request.reservationId, third.request.reservationId)
		await assert.rejects(reserveFreeValue(save, { deckId: 'deck-four', deckVersion: 1, idempotencyKey: 'shared-key' }, context), { code: 'FREE_VALUE_QUOTA_EXHAUSTED' })
		await commitFreeValue(changed, { operationId: undefined })
		await releaseFreeValue(third)
		assert.equal((await getFreeValueStatus(save, {}, context)).used, 2)
		assert.equal((await getFreeValueStatus(save, {}, context)).reserved, 0)
	})
}

for (const mode of ['before-commit', 'lost-ack']) {
	test(`firestore: ${mode} failure retries only the exact allowance commitment, without duplicate usage`, async t => {
		const { store, stored } = await fixture(t, 'firestore')
		await store.reserveRollingUsage(alice, request('publication'))
		const before = await stored()
		state.fault = mode
		await assert.rejects(store.commitRollingUsage(alice, request('publication', { metadata: { operationId: undefined } })), { code: 14 })
		if (mode === 'before-commit') assert.deepEqual(await stored(), before)
		else { assert.equal((await stored()).events.length, 1); assert.equal((await stored()).reservations.length, 0) }
		const cold = createInstallUsageStore()
		const repeated = await cold.commitRollingUsage(alice, request('publication', { metadata: { operationId: undefined } }))
		assert.equal(repeated.used, 1)
		assert.equal(repeated.reserved, 0)
		assert.equal((await stored()).events.length, 1)
		assert.equal((await cold.reserveRollingUsage(alice, request('publication'))).status, 'committed')
	})
}
