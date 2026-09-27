import * as fs from 'node:fs'
import * as path from 'node:path'

import {
	createBillingLedgerStore,
	hashCustomerId,
} from './billing/ledger-store.mjs'
import {
	commitCredits,
	effectiveBalanceSnapshot,
	finalizeBillingReservation,
	preflightBillingReservation,
	reserveCredits,
} from './billing/reservations.mjs'
import { publicBillingEstimate } from './billing/checkout.mjs'
import { getBillingTelemetrySummary } from './telemetry.mjs'

const outputDir = path.resolve('outputs', 'billing-verify', `quote-cap-${Date.now()}-${process.pid}`)
const ledgerFile = path.join(outputDir, 'quote-cap-ledger.json')
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_BILLING_LEDGER_FILE = ledgerFile
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.BETTERPPTX_BILLING_PROVIDER = 'crypto_credits'
process.env.BETTERPPTX_BILLING_DRY_RUN = '0'
process.env.BETTERPPTX_BILLING_ENFORCE = '1'
process.env.BETTERPPTX_BILLING_MAX_QUEUED_USAGE_CREDITS = '10000'

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

async function expectCode(code, fn) {
	try {
		await fn()
	} catch (error) {
		if (error?.code === code) return error
		throw error
	}
	throw new Error(`Expected ${code}.`)
}

const store = createBillingLedgerStore()
const runId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
const customerHash = hashCustomerId(`quote_cap_${runId}`)
await store.creditCustomer({
	customerHash,
	source: 'owner_goodwill',
	amountCredits: 1000,
	proofRef: { verificationRun: runId },
})

const direct = await reserveCredits({
	store,
	customerHash,
	sessionHash: `session_direct_${runId}`,
	operationId: `direct_${runId}`,
	amountCredits: 10,
})
const partial = await commitCredits({
	store,
	reservationId: direct.reservation.reservationId,
	amountCredits: 4,
	metadata: { verification: 'partial-commit' },
	usageEvent: {
		eventId: `usage_direct_${runId}`,
		customerHash,
		amountCredits: 4,
	},
})
expect(partial.reservation.committedAmountCredits === 4, 'Partial commit should persist committed amount.', { partial })
expect(partial.reservation.releasedAmountCredits === 6, 'Partial commit should release the unused cap.', { partial })

let balance = effectiveBalanceSnapshot(await store.getCustomer(customerHash))
expect(balance.pendingReservedCredits === 0, 'Partial commit should release the full pending reservation.', { balance })
expect(balance.queuedUsageCredits === 4, 'Partial commit should queue only the committed amount.', { balance })

const replay = await commitCredits({
	store,
	reservationId: direct.reservation.reservationId,
	amountCredits: 4,
})
expect(replay.idempotent === true, 'Same partial commit should replay idempotently.', { replay })
await expectCode('BILLING_IDEMPOTENCY_CONFLICT', () => commitCredits({
	store,
	reservationId: direct.reservation.reservationId,
	amountCredits: 5,
}))

const overCapDirect = await reserveCredits({
	store,
	customerHash,
	sessionHash: `session_overcap_${runId}`,
	operationId: `overcap_${runId}`,
	amountCredits: 3,
})
await expectCode('BILLING_COMMIT_EXCEEDS_RESERVATION', () => commitCredits({
	store,
	reservationId: overCapDirect.reservation.reservationId,
	amountCredits: 3.01,
}))

const entry = {
	pptx: {
		slides: [
			{ _slideObjects: [{ type: 'text' }, { type: 'shape' }] },
		],
	},
}
const entitlement = {
	provider: 'crypto_credits',
	billingCustomerHash: customerHash,
	billingStatus: 'active',
}

process.env.BETTERPPTX_ESTIMATE_CALIBRATION_MULTIPLIER = '2'
const publicEstimate = publicBillingEstimate({
	toolName: 'betterpptx.deck.save',
	args: { deckId: `deck_public_${runId}` },
	entry,
})
expect(publicEstimate.calibrated === true, 'Public estimate should disclose calibration.', { publicEstimate })
expect(publicEstimate.quoteCapCredits === Number((publicEstimate.estimatedCredits * 2).toFixed(2)), 'Public quote cap should apply the gating multiplier.', { publicEstimate })

const lowerGate = await preflightBillingReservation({
	name: 'betterpptx.deck.save',
	args: { deckId: `deck_lower_${runId}`, idempotencyKey: `lower_${runId}` },
	context: { sessionId: `session_lower_${runId}` },
	entry,
	billingEntitlement: entitlement,
	store,
})
const lowerFinal = await finalizeBillingReservation({
	gate: lowerGate,
	name: 'betterpptx.deck.save',
	args: { deckId: `deck_lower_${runId}`, idempotencyKey: `lower_${runId}` },
	result: { bytes: 1024, slideCount: 1, downloadName: 'lower.pptx', artifact: { state: 'saved' } },
	store,
})
expect(lowerFinal.reservation.committedAmountCredits < lowerGate.amountCredits, 'Lower actual should commit less than the accepted cap.', { lowerGate, lowerFinal })
expect(lowerFinal.reservation.commitMetadata.actualCredits === lowerFinal.reservation.committedAmountCredits, 'Committed amount should match the uncalibrated actual.', { lowerFinal })

process.env.BETTERPPTX_ESTIMATE_CALIBRATION_MULTIPLIER = '0.5'
const overrunGate = await preflightBillingReservation({
	name: 'betterpptx.deck.save',
	args: { deckId: `deck_overrun_${runId}`, idempotencyKey: `overrun_${runId}` },
	context: { sessionId: `session_overrun_${runId}` },
	entry,
	billingEntitlement: entitlement,
	store,
})
const overrunFinal = await finalizeBillingReservation({
	gate: overrunGate,
	name: 'betterpptx.deck.save',
	args: { deckId: `deck_overrun_${runId}`, idempotencyKey: `overrun_${runId}` },
	result: { bytes: 50 * 1048576, slideCount: 1, downloadName: 'overrun.pptx', artifact: { state: 'saved' } },
	store,
})
expect(overrunFinal.reservation.committedAmountCredits === overrunGate.amountCredits, 'Actual overrun must never charge above the accepted cap.', { overrunGate, overrunFinal })
expect(overrunFinal.reservation.commitMetadata.overrun === true, 'Overrun should be recorded for calibration analysis.', { overrunFinal })
expect(overrunFinal.reservation.commitMetadata.overrunCredits > 0, 'Overrun delta should be recorded.', { overrunFinal })

process.env.BETTERPPTX_ESTIMATE_CALIBRATION_MULTIPLIER = '1.5'
const gates = await Promise.all([0, 1].map(index => preflightBillingReservation({
	name: 'betterpptx.deck.save',
	args: { deckId: `deck_multi_${index}_${runId}`, idempotencyKey: `multi_${index}_${runId}` },
	context: { sessionId: `session_multi_${runId}` },
	entry,
	billingEntitlement: entitlement,
	store,
})))
const pendingBefore = effectiveBalanceSnapshot(await store.getCustomer(customerHash)).pendingReservedCredits
expect(pendingBefore >= gates.reduce((sum, gate) => sum + gate.amountCredits, 0), 'Multiple gates should reserve their accepted caps independently.', { pendingBefore, gates })

const finals = []
for (let index = 0; index < gates.length; index += 1) {
	finals.push(await finalizeBillingReservation({
		gate: gates[index],
		name: 'betterpptx.deck.save',
		args: { deckId: `deck_multi_${index}_${runId}`, idempotencyKey: `multi_${index}_${runId}` },
		result: { bytes: (index + 1) * 2048, slideCount: 1, downloadName: `multi-${index}.pptx`, artifact: { state: 'saved' } },
		store,
	}))
}

balance = effectiveBalanceSnapshot(await store.getCustomer(customerHash))
expect(balance.pendingReservedCredits === overCapDirect.reservation.amountCredits, 'Only the intentionally unfinalized direct reservation should remain pending.', { balance, overCapDirect })
expect(finals.every(item => item.reservation.committedAmountCredits <= item.reservation.amountCredits), 'Every multi-gate commit must stay within its own cap.', { finals })

const telemetry = getBillingTelemetrySummary()
expect(telemetry.overrunCredits >= overrunFinal.reservation.commitMetadata.overrunCredits, 'Mission Control telemetry should include estimate overruns.', { telemetry })
expect(telemetry.quoteCapReleaseCredits > 0, 'Mission Control telemetry should include unused quote-cap releases.', { telemetry })

console.log(`BILLING QUOTE CAP: PASS partial=4 released=6 lower=${lowerFinal.reservation.committedAmountCredits}/${lowerGate.amountCredits} overrun=${overrunFinal.reservation.committedAmountCredits}/${overrunFinal.reservation.commitMetadata.actualCredits} multi=${finals.length}`)
