// Private spec-commit accounting. A native continuity proof must precede any
// customer-credit settlement, while already executed provider work remains
// reserved for reconciliation if the proof or a later operation fails.

export async function finalizeContinuityReservations(executed, pending, finalize) {
	for (const [operationIndex, { reservation, result }] of executed) {
		await finalize({
			gate: reservation.gate,
			name: reservation.billingName || reservation.op?.tool,
			args: reservation.args,
			result,
		})
		pending.delete(operationIndex)
	}
}

export async function reconcileFailedContinuityReservations(executed, pending, reason, onError = () => {}) {
	for (const [operationIndex, { reservation }] of executed) {
		// An executed reservation cannot be released as unused even if the
		// customer-facing deck was not delivered.
		pending.delete(operationIndex)
		try {
			const gate = reservation.gate
			if (!gate?.reservation?.reservationId || typeof gate.store?.markReservationUncertain !== 'function') {
				const error = new Error('Executed billing reservation has no reconciliation store.')
				error.code = 'BILLING_RECONCILIATION_UNAVAILABLE'
				throw error
			}
			await gate.store.markReservationUncertain({ reservationId: gate.reservation.reservationId, reason })
		} catch (error) {
			onError(operationIndex, error)
		}
	}
}
