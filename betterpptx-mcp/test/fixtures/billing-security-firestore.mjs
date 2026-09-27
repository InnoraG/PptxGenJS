import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'

// Offline transactional double: snapshot reads, buffered atomic writes, conflict
// retries, and Firestore's requirement that all reads precede all writes.
export class BillingSecurityFirestore {
	rows = new Map()
	versions = new Map()
	retries = 0
	beforeCommit = null
	afterRead = null
	failCommit = false

	collection(name) {
		return { doc: id => this.reference(`${name}/${id}`), where: (...args) => this.query(name, args) }
	}

	reference(key) {
		return {
			key,
			get: async () => this.snapshot(key),
			set: async (data, options) => this.write(key, data, options),
		}
	}

	snapshot(key, rows = this.rows) {
		return { exists: rows.has(key), data: () => structuredClone(rows.get(key)) }
	}

	write(key, data, options) {
		this.rows.set(key, structuredClone(options?.merge ? { ...this.rows.get(key), ...data } : data))
		this.versions.set(key, (this.versions.get(key) || 0) + 1)
	}

	query(name, [field, operator, value]) {
		assert.equal(operator, '==')
		const filters = [[field, operator, structuredClone(value)]]
		let order = null
		let max = Infinity
		const query = {
			collectionName: name,
			where: (field, operator, value) => { assert.equal(operator, '=='); filters.push([field, operator, structuredClone(value)]); return query },
			orderBy: fieldName => { order = fieldName; return query },
			limit: count => { assert(Number.isInteger(count)); max = count; return query },
			evaluate: snapshotRows => {
				let rows = [...snapshotRows].filter(([key, row]) => key.startsWith(`${name}/`) && filters.every(([field, , value]) => isDeepStrictEqual(field.split('.').reduce((item, key) => item?.[key], row), value)))
				if (order) rows.sort((a, b) => String(a[1][order]).localeCompare(String(b[1][order])))
				const docs = rows.slice(0, max).map(([key]) => this.snapshot(key, snapshotRows))
				return { docs, size: docs.length }
			},
			get: async () => query.evaluate(this.rows),
		}
		return query
	}

	async runTransaction(callback) {
		for (let attempt = 0; attempt < 100; attempt++) {
			const snapshotRows = structuredClone(this.rows)
			const snapshotVersions = new Map(this.versions)
			const reads = new Set()
			const queryReads = new Set()
			const writes = []
			const tx = {
				get: async ref => {
					assert.equal(writes.length, 0, 'Firestore reads must precede writes')
					if (ref.evaluate) {
						queryReads.add(ref.collectionName)
						return ref.evaluate(snapshotRows)
					}
					reads.add(ref.key)
					const snap = this.snapshot(ref.key, snapshotRows)
					const hook = this.afterRead
					this.afterRead = null
					if (hook) await hook(ref.key)
					return snap
				},
				set: (ref, data, options) => { writes.push([ref.key, structuredClone(data), options]); return tx },
			}
			const result = await callback(tx)
			const hook = this.beforeCommit
			this.beforeCommit = null
			if (hook) await hook()
			const queryConflict = [...queryReads].some(name => [...new Set([...snapshotVersions.keys(), ...this.versions.keys()])]
				.some(key => key.startsWith(`${name}/`) && snapshotVersions.get(key) !== this.versions.get(key)))
			if (queryConflict || [...reads].some(key => snapshotVersions.get(key) !== this.versions.get(key))) {
				this.retries++
				continue
			}
			if (this.failCommit) throw Object.assign(new Error('Injected offline commit failure'), { code: 'UNAVAILABLE' })
			for (const args of writes) this.write(...args)
			return result
		}
		throw new Error('Offline transaction retry bound exceeded')
	}
}
