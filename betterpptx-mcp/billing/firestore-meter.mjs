import { recordResourceUsage } from './resource-meter.mjs'

function meteredTransactionProxy(transaction) {
	return new Proxy(transaction, {
		get(target, property, receiver) {
			const value = Reflect.get(target, property, receiver)
			if (typeof value !== 'function') return value
			if (property === 'get') {
				return async (...args) => {
					recordResourceUsage({ firestoreReads: 1 })
					return value.apply(target, args)
				}
			}
			if (property === 'getAll') {
				return async (...args) => {
					recordResourceUsage({ firestoreReads: Math.max(1, args.length) })
					return value.apply(target, args)
				}
			}
			if (property === 'set' || property === 'create' || property === 'update') {
				return (...args) => {
					recordResourceUsage({ firestoreWrites: 1 })
					return value.apply(target, args)
				}
			}
			if (property === 'delete') {
				return (...args) => {
					recordResourceUsage({ firestoreDeletes: 1 })
					return value.apply(target, args)
				}
			}
			return value.bind(target)
		},
	})
}

export async function runMeteredFirestoreTransaction(db, callback, options) {
	let attempts = 0
	try {
		return await db.runTransaction(transaction => {
			attempts += 1
			return callback(meteredTransactionProxy(transaction))
		}, options)
	} finally {
		recordResourceUsage({
			firestoreTransactions: 1,
			firestoreTxRetries: Math.max(0, attempts - 1),
		})
	}
}

export async function meteredFirestoreGet(reference) {
	recordResourceUsage({ firestoreReads: 1 })
	return reference.get()
}

export async function meteredFirestoreSet(reference, data, options) {
	recordResourceUsage({ firestoreWrites: 1 })
	return reference.set(data, options)
}

export async function meteredFirestoreDelete(reference, options) {
	recordResourceUsage({ firestoreDeletes: 1 })
	return reference.delete(options)
}

export async function meteredFirestoreQueryGet(query) {
	const snapshot = await query.get()
	recordResourceUsage({ firestoreReads: Math.max(0, Number(snapshot?.size ?? snapshot?.docs?.length) || 0) })
	return snapshot
}
