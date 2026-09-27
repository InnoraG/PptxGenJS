import { AsyncLocalStorage } from 'node:async_hooks'

const execution = new AsyncLocalStorage()

export function createBillingDeliveryBarrier() {
	let resolve, reject
	const promise = new Promise((yes, no) => { resolve = yes; reject = no })
	// Failure remains observable to replays even if nobody requested one yet.
	promise.catch(() => {})
	return { promise, resolve, reject }
}

export function withBillingDeliveryBarrier(barrier, operation) {
	return execution.run(barrier, operation)
}

export function currentBillingDeliveryBarrier() {
	return execution.getStore() || null
}

export async function awaitBillingDelivery(record) {
	// Only a different request waits. Nested implementation calls must be able
	// to finish the work that the enclosing request is about to settle.
	if (record?.deliveryBarrier && record.deliveryBarrier !== execution.getStore()) {
		await record.deliveryBarrier.promise
	}
}
