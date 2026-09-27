import assert from 'node:assert/strict'
import test from 'node:test'
import { finalizeContinuityReservations, reconcileFailedContinuityReservations } from '../billing/spec-continuity-settlement.mjs'

function reserved(index, events) {
	return {
		operationIndex: index,
		op: { tool: `heavy-${index}` },
		args: { id: index },
		gate: {
			reservation: { reservationId: `reservation-${index}` },
			store: { markReservationUncertain: async ({ reservationId, reason }) => events.push(['uncertain', reservationId, reason]) },
		},
	}
}

test('customer credit settlement is explicit and ordered after native proof', async () => {
	const events = []
	const first = reserved(2, events)
	const second = reserved(7, events)
	const pending = new Map([[2, first], [7, second]])
	const executed = new Map([[2, { reservation: first, result: { value: 'first' } }], [7, { reservation: second, result: { value: 'second' } }]])
	assert.deepEqual(events, [])
	assert.equal(pending.size, 2)
	await finalizeContinuityReservations(executed, pending, async ({ name, result }) => events.push(['finalize', name, result.value]))
	assert.deepEqual(events, [['finalize', 'heavy-2', 'first'], ['finalize', 'heavy-7', 'second']])
	assert.equal(pending.size, 0)
})

test('failed native proof holds executed cost for reconciliation and leaves unexecuted reservations releasable', async () => {
	const events = []
	const executedReservation = reserved(2, events)
	const unexecutedReservation = reserved(7, events)
	const pending = new Map([[2, executedReservation], [7, unexecutedReservation]])
	const executed = new Map([[2, { reservation: executedReservation, result: { value: 'consumed-provider-work' } }]])
	await reconcileFailedContinuityReservations(executed, pending, 'SLIDE_CONTINUITY_RUNTIME_ITEM_PAYLOAD_MISMATCH')
	assert.deepEqual(events, [['uncertain', 'reservation-2', 'SLIDE_CONTINUITY_RUNTIME_ITEM_PAYLOAD_MISMATCH']])
	assert.deepEqual([...pending.keys()], [7])
})

test('missing reconciliation store is reported without falsely releasing executed work', async () => {
	const pending = new Map([[2, { gate: { reservation: { reservationId: 'reservation-2' } } }]])
	const executed = new Map([[2, { reservation: pending.get(2), result: {} }]])
	const errors = []
	await reconcileFailedContinuityReservations(executed, pending, 'failure', (index, error) => errors.push([index, error.code]))
	assert.deepEqual(errors, [[2, 'BILLING_RECONCILIATION_UNAVAILABLE']])
	assert.equal(pending.size, 0)
})
