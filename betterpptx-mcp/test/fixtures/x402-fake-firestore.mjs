import assert from 'node:assert/strict'

// Transactional local fixture: enforces reads-before-writes and atomic commit.
// No SDK, credentials, emulator, network, or cloud project is involved.
export function fakeFirestore() {
	const documents = new Map()
	let lane = Promise.resolve()
	const snapshot = id => ({ exists: documents.has(id), data: () => structuredClone(documents.get(id)) })
	const db = {
		documents,
		collection(name) {
			return { doc(key) {
				assert.ok(key && !key.includes('/'), 'Invalid fixture document id')
				const id = `${name}/${key}`
				return { id, get: async () => snapshot(id) }
			} }
		},
		runTransaction(callback) {
			const current = lane.then(async () => {
				const writes = []
				const tx = {
					async get(ref) { assert.equal(writes.length, 0, 'Transaction attempted a read after a write'); return snapshot(ref.id) },
					set(ref, data, options) { writes.push({ ref, data: structuredClone(data), options }) },
					create(ref, data) { writes.push({ ref, data: structuredClone(data), create: true }) },
				}
				const result = await callback(tx)
				for (const write of writes) if (write.create) assert.ok(!documents.has(write.ref.id), 'Duplicate transaction create')
				for (const { ref, data, options } of writes) documents.set(ref.id, options?.merge ? { ...documents.get(ref.id), ...data } : data)
				return result
			})
			lane = current.catch(() => {})
			return current
		},
	}
	return db
}
