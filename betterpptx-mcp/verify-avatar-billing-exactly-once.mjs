#!/usr/bin/env node
// Local ledger contract for avatar reservation/commit/release semantics. This
// proves exactly-once behavior and tenant separation in the ledger model; it
// does not substitute for Firestore/PayRam production reconciliation.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-avatar-billing-'))
process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(tempDir, 'billing-ledger.json')
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'

const { createBillingLedgerStore } = await import('./billing/ledger-store.mjs')
const { reserveCredits, commitCredits, releaseCredits } = await import('./billing/reservations.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

async function expectCode(action, code) {
	try { await action() } catch (error) {
		expect(error?.code === code, `Expected ${code}, got ${error?.code || error?.message || error}`, { error })
		return true
	}
	return false
}

try {
	const store = createBillingLedgerStore()
	const customerA = 'customer-hash-avatar-a'
	const customerB = 'customer-hash-avatar-b'
	await store.upsertCustomer(customerA, { provider: 'crypto_credits', billingStatus: 'active', availableBalanceCredits: 20 })
	await store.upsertCustomer(customerB, { provider: 'crypto_credits', billingStatus: 'active', availableBalanceCredits: 20 })

	const reservationInput = {
		store,
		reservationId: 'bpptx_res_avatar_render_1',
		operationId: 'bpptx_op_avatar_render_1',
		customerHash: customerA,
		sessionHash: 'session-hash-a',
		deckHash: 'deck-hash-a',
		mode: 'heavy',
		amountCredits: 2,
	}
	const reserved = await reserveCredits(reservationInput)
	const replayedReservation = await reserveCredits(reservationInput)
	expect(reserved.idempotent === false && replayedReservation.idempotent === true, 'Reservation replay must not reserve twice.', { reserved, replayedReservation })
	const afterReserve = await store.getCustomer(customerA)
	expect(afterReserve.pendingReservedCredits === 2 && afterReserve.effectiveAvailableCredits === 18, 'Reservation should reduce effective availability exactly once.', { afterReserve })

	const usageEvent = {
		eventId: 'bpptx_usage_avatar_render_1',
		customerHash: customerA,
		sessionHash: 'session-hash-a',
		deckHash: 'deck-hash-a',
		operationId: 'bpptx_op_avatar_render_1',
		amountCredits: 1,
		metadata: { operation_group: 'betterpptx.avatar.render_job', status: 'success' },
	}
	const committed = await commitCredits({ store, reservationId: reserved.reservation.reservationId, amountCredits: 1, usageEvent })
	const replayedCommit = await commitCredits({ store, reservationId: reserved.reservation.reservationId, amountCredits: 1, usageEvent })
	expect(committed.idempotent === false && replayedCommit.idempotent === true, 'Commit replay must not charge twice.', { committed, replayedCommit })
	const afterCommit = await store.getCustomer(customerA)
	expect(afterCommit.pendingReservedCredits === 0 && afterCommit.committedUsageCredits === 1 && afterCommit.queuedUsageCredits === 1, 'Commit should move one charge to queued usage exactly once.', { afterCommit })
	const queued = await store.listQueuedUsageEvents({ limit: 10 })
	expect(queued.length === 1 && queued[0].eventId === usageEvent.eventId, 'Commit should produce one queued usage event.', { queued })
	const ingested = await store.markUsageEventIngested(usageEvent.eventId)
	const replayedIngest = await store.markUsageEventIngested(usageEvent.eventId)
	expect(ingested.idempotent === false && replayedIngest.idempotent === true, 'Usage settlement replay must be idempotent.', { ingested, replayedIngest })
	const afterIngest = await store.getCustomer(customerA)
	expect(afterIngest.queuedUsageCredits === 0 && afterIngest.committedUsageCredits === 1, 'Usage settlement should clear queued usage without changing committed usage.', { afterIngest })

	const releaseInput = { ...reservationInput, reservationId: 'bpptx_res_avatar_render_failure_1', operationId: 'bpptx_op_avatar_render_failure_1', amountCredits: 3 }
	const reservedFailure = await reserveCredits(releaseInput)
	const released = await releaseCredits({ store, reservationId: reservedFailure.reservation.reservationId, reason: 'avatar-worker-failed' })
	const replayedRelease = await releaseCredits({ store, reservationId: reservedFailure.reservation.reservationId, reason: 'avatar-worker-failed' })
	expect(released.idempotent === false && replayedRelease.idempotent === true && released.reservation.state === 'released', 'Failure release must return credits once and replay safely.', { released, replayedRelease })

	const conflict = await expectCode(() => reserveCredits({ ...reservationInput, amountCredits: 4 }), 'BILLING_IDEMPOTENCY_CONFLICT')
	expect(conflict, 'An idempotency key/reservation id must reject changed billing inputs.')
	const customerBState = await store.getCustomer(customerB)
	expect(customerBState.pendingReservedCredits === 0 && customerBState.committedUsageCredits === 0, 'Tenant B must remain unaffected by tenant A billing.', { customerBState })

	const report = {
		schemaVersion: 'betterpptx.avatar-billing-exactly-once-report.v1',
		status: 'PASS',
		provider: 'local-contract',
		reservationReplay: true,
		commitReplay: true,
		usageEventReplay: true,
		releaseReplay: true,
		conflictRejected: true,
		tenantIsolation: true,
	}
	const reportPath = path.resolve('betterpptx-mcp', 'outputs', 'avatar-billing-exactly-once-report.json')
	fs.mkdirSync(path.dirname(reportPath), { recursive: true })
	fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
	console.log('AVATAR BILLING EXACTLY ONCE: PASS reserve=1 commit=1 usage=1 release=1 conflict=1 tenantIsolation=1')
} catch (error) {
	const reportPath = path.resolve('betterpptx-mcp', 'outputs', 'avatar-billing-exactly-once-report.json')
	fs.mkdirSync(path.dirname(reportPath), { recursive: true })
	fs.writeFileSync(reportPath, `${JSON.stringify({ schemaVersion: 'betterpptx.avatar-billing-exactly-once-report.v1', status: 'BLOCKED', error: { code: error?.code || 'VERIFY_FAILED', message: error?.message || String(error), details: error?.details || {} } }, null, 2)}\n`)
	console.error(`AVATAR BILLING EXACTLY ONCE: BLOCKED ${error?.message || error}`)
	process.exitCode = 2
} finally {
	try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch {}
}
