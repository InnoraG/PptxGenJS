import assert from 'node:assert/strict'

// Transactional, in-memory test double. It enforces reads-before-writes and
// can discard an initial transaction attempt to exercise callback retries.
// It never imports an SDK or opens a socket.
export class MemoryFirestore {
	rows = new Map()
	queue = Promise.resolve()
	retryCallbacks = false

	collection(name) {
		const query = (predicate = () => true, count = Infinity) => ({
			where: (field, operator, values) => {
				assert.equal(operator, 'in')
				return query(row => values.includes(row[field]), count)
			},
			limit: size => query(predicate, size),
			get: async () => {
				const docs = [...this.rows].filter(([key, row]) => key.startsWith(`${name}/`) && predicate(row)).slice(0, count).map(([, row]) => ({ data: () => structuredClone(row) }))
				return { docs, size: docs.length }
			},
		})
		return {
			...query(),
			doc: id => {
				assert.ok(typeof id === 'string' && id && !id.includes('/'))
				const key = `${name}/${id}`
				return { key, get: async () => this.snapshot(key) }
			},
		}
	}

	snapshot(key) {
		const value = structuredClone(this.rows.get(key))
		return { exists: value !== undefined, data: () => structuredClone(value) }
	}

	async runTransaction(callback) {
		const run = async () => {
			const attempt = async commit => {
				const writes = []
				const tx = {
					get: async ref => { assert.equal(writes.length, 0, 'transaction read after write'); return this.snapshot(ref.key) },
					create: (ref, value) => { assert.ok(!this.rows.has(ref.key)); writes.push(['set', ref.key, structuredClone(value), false]) },
					set: (ref, value, options = {}) => writes.push(['set', ref.key, structuredClone(value), options.merge === true]),
					delete: ref => writes.push(['delete', ref.key]),
				}
				const result = await callback(tx)
				if (commit) for (const [kind, key, value, merge] of writes) {
					if (kind === 'delete') this.rows.delete(key)
					else this.rows.set(key, merge ? { ...this.rows.get(key), ...value } : value)
				}
				return result
			}
			if (this.retryCallbacks) await attempt(false)
			return attempt(true)
		}
		const result = this.queue.then(run, run)
		this.queue = result.catch(() => {})
		return result
	}
}
