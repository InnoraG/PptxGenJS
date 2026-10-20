import assert from 'node:assert/strict'
import test from 'node:test'
import { createFirestoreOAuthAdapter } from '../auth/oauth-firestore-adapter.mjs'

function fakeFirestore() {
	const collections = new Map()
	const docs = name => collections.get(name) ?? collections.set(name, new Map()).get(name)
	const snapshot = (ref, data) => ({ exists: data !== undefined, data: () => structuredClone(data), ref })
	const docRef = (name, id) => ({
		id,
		async set(value) { docs(name).set(id, structuredClone(value)) },
		async get() { return snapshot(this, docs(name).get(id)) },
		async delete() { docs(name).delete(id) },
		async update(value) { docs(name).set(id, { ...docs(name).get(id), ...value }) },
	})
	const query = (name, field, value, limit = Infinity) => ({
		limit: count => query(name, field, value, count),
		async get() {
			const found = [...docs(name)].filter(([, data]) => data[field] === value).slice(0, limit)
				.map(([id, data]) => snapshot(docRef(name, id), data))
			return { empty: found.length === 0, docs: found }
		},
	})
	return {
		collections,
		collection: name => ({ doc: id => docRef(name, id), where: (field, _op, value) => query(name, field, value) }),
		async runTransaction(fn) { return fn({ get: ref => ref.get(), update: (ref, value) => ref.update(value) }) },
		batch() {
			const ops = []
			return { delete: ref => ops.push(ref), commit: async () => { for (const ref of ops) await ref.delete() } }
		},
	}
}

test('Firestore OAuth adapter stores, expires, consumes and revokes by grant', async () => {
	let clock = 1_000_000
	const firestore = fakeFirestore()
	const Adapter = createFirestoreOAuthAdapter({ prefix: 'test_oauth', firestore, now: () => clock })
	const codes = new Adapter('AuthorizationCode')
	const sessions = new Adapter('Session')
	await codes.upsert('code/with:odd chars', { grantId: 'g1', kind: 'AuthorizationCode' }, 60)
	await codes.upsert('code-2', { grantId: 'g2' }, 60)
	await sessions.upsert('s1', { uid: 'uid-1', accountId: 'a' }, 3600)

	const [storedId] = firestore.collections.get('test_oauth_AuthorizationCode').keys()
	assert.match(storedId, /^[0-9a-f]{64}$/)
	assert.deepEqual(await codes.find('code/with:odd chars'), { grantId: 'g1', kind: 'AuthorizationCode' })
	assert.equal((await sessions.findByUid('uid-1')).accountId, 'a')

	await codes.consume('code/with:odd chars')
	assert.equal((await codes.find('code/with:odd chars')).consumed, 1000)

	await codes.revokeByGrantId('g1')
	assert.equal(await codes.find('code/with:odd chars'), undefined)
	assert.ok(await codes.find('code-2'))

	clock += 61_000
	assert.equal(await codes.find('code-2'), undefined)
	await sessions.destroy('s1')
	assert.equal(await sessions.find('s1'), undefined)
	assert.throws(() => createFirestoreOAuthAdapter({ prefix: 'bad/prefix' }), /prefix/)
})
