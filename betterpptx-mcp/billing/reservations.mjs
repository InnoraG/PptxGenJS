import * as crypto from 'node:crypto'

import {
	createBillingLedgerStore,
	hashDeckId,
	fromCreditUnits,
	hashPayload,
	hashSessionId,
	toCreditUnits,
} from './ledger-store.mjs'
import { classifyBillingTool, isBillingDryRunEnabled } from './classifier.mjs'
import { estimateBillingForTool } from './estimator.mjs'
import {
	currentRateCard,
	currentRateCardVersion,
	roundCredits,
} from './rate-card.mjs'
import { buildPremiumPresentationQuote } from './premium-quote.mjs'
import {
	billingConfirmationRequired,
	billingSetupIncomplete,
	billingTemporarilyUnavailable,
	insufficientCredits,
} from './public-errors.mjs'
import { recordBillingReservationTelemetry } from '../telemetry.mjs'
import { recordResourceUsage } from './resource-meter.mjs'
import { assertProductionBillingConfiguration, isProductionBillingEnvironment } from './security-policy.mjs'

function shortHash(value) {
	return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 32)
}

function storeOrDefault(store) {
	return store || createBillingLedgerStore()
}

function billingProvider() {
	return String(process.env.BETTERPPTX_BILLING_PROVIDER || '').trim().toLowerCase()
}

export function isBillingReservationEnforced() {
	if (isProductionBillingEnvironment()) return true
	if (process.env.BETTERPPTX_BILLING_ENFORCE === '0') return false
	if (isBillingDryRunEnabled()) return false
	// PAYRAM-EXCLUSIVE: 'payram' is the crypto-credits payment rail; 'dodo' is never accepted.
	return billingProvider() === 'payram' || billingProvider() === 'crypto_credits' || process.env.BETTERPPTX_BILLING_ENFORCE === '1'
}

function isCryptoCreditsBilling(billingEntitlement = {}) {
	const provider = String(billingEntitlement.provider || billingProvider()).trim().toLowerCase()
	return provider === 'crypto_credits' || provider === 'payram'
}

function compactDefined(record) {
	return Object.fromEntries(Object.entries(record).filter(([_key, value]) => value !== undefined && value !== null && value !== ''))
}

function idempotencyKey(args = {}) {
	return String(args.idempotencyKey || args.idempotency_key || '').trim()
}

function sessionHashFor(context = {}) {
	// Reconnects and sessionless request IDs must not create fresh spending
	// identities for an otherwise identical operation.
	return hashSessionId(context.installHash || context.billingCustomerHash || context.sessionId || 'stdio-default')
}

function deckHashFor(args = {}, result = {}) {
	const deckId = args.deckId || result.deckId || result.data?.deckId || ''
	return deckId ? hashDeckId(deckId) : ''
}

// PAYRAM-EXCLUSIVE (owner, 2026-07-02): PayRam is the ONLY payment provider — crypto-credit
// top-ups SETTLE INTO the local ledger (push, via the PayRam settlement flow); there is no
// external balance API to pull from. The old Dodo pull-refresh integration is gone for good.
export async function refreshProviderBalanceForCustomer() {
	return {
		ok: false,
		code: 'PROVIDER_PULL_REFRESH_UNSUPPORTED',
		provider: 'payram',
		note: 'PayRam credit settlements post INTO the ledger (payram_settlement entries); balances are ledger-authoritative and cannot be pull-refreshed.',
	}
}

export function effectiveBalanceSnapshot(customer = {}) {
	const availableUnits = Math.max(0, Math.round(Number(
		// legacy ledgers may still carry the old provider-named field — read it, never write it
		customer.availableBalanceUnits ?? customer.lastKnownProviderAvailableBalanceUnits ?? customer.lastKnownDodoAvailableBalanceUnits,
	) || 0))
	const pendingUnits = Math.max(0, Math.round(Number(customer.pendingReservedUnits) || 0))
	const queuedUnits = Math.max(0, Math.round(Number(
		customer.queuedUsageUnits ?? customer.durableQueuedUsageUnitsNotYetSettled ?? customer.durableQueuedUsageUnitsNotYetReflectedByDodo,
	) || 0))
	const effectiveAvailableUnits = Math.max(0, availableUnits - pendingUnits - queuedUnits)
	return {
		availableBalanceCredits: fromCreditUnits(availableUnits),
		lastKnownProviderAvailableCredits: fromCreditUnits(availableUnits),
		pendingReservedCredits: fromCreditUnits(pendingUnits),
		queuedUsageCredits: fromCreditUnits(queuedUnits),
		queuedUsageCreditsNotYetSettledByProvider: fromCreditUnits(queuedUnits),
		effectiveAvailableCredits: fromCreditUnits(effectiveAvailableUnits),
		effectiveAvailableUnits,
	}
}

export function buildBillingReservationId({
	customerHash,
	operationId,
	sessionHash = '',
	deckHash = '',
	mode = 'checkpoint',
	amountCredits = 0,
} = {}) {
	return `bpptx_res_${shortHash({
		customerHash,
		operationId,
		sessionHash,
		deckHash,
		mode,
		amountUnits: toCreditUnits(amountCredits),
	})}`
}

export function buildBillingUsageEventId({
	customerHash,
	sessionHash = '',
	deckHash = '',
	artifactHash = '',
	checkpointId = '',
	operationGroup = 'deck.save',
} = {}) {
	return `bpptx_usage_${shortHash({
		customerHash,
		sessionHash,
		deckHash,
		artifactHash,
		checkpointId,
		operationGroup,
	})}`
}

export function buildBillingOperationId({
	customerHash = '',
	sessionHash = '',
	deckHash = '',
	toolName = '',
	idempotencyKey = '',
	args = {},
} = {}) {
	return `bpptx_op_${shortHash({
		customerHash,
		sessionHash,
		deckHash,
		toolName,
		idempotencyKey,
		argsHash: hashPayload(args),
	})}`
}

export async function reserveCredits(args = {}) {
	const store = storeOrDefault(args.store)
	const amountCredits = Number(args.amountCredits)
	const operationId = args.operationId || buildBillingOperationId(args)
	const reservationId = args.reservationId || buildBillingReservationId({
		customerHash: args.customerHash,
		operationId,
		sessionHash: args.sessionHash,
		deckHash: args.deckHash,
		mode: args.mode,
		amountCredits,
	})
	return store.createReservation({
		...args,
		operationId,
		reservationId,
		amountCredits,
	})
}

export async function commitCredits(args = {}) {
	const store = storeOrDefault(args.store)
	return store.commitReservation(args)
}

export async function releaseCredits(args = {}) {
	const store = storeOrDefault(args.store)
	return store.releaseReservation(args)
}

export async function queueUsageForReservation(args = {}) {
	const store = storeOrDefault(args.store)
	const eventId = args.eventId || buildBillingUsageEventId(args)
	return store.upsertUsageEvent({
		...args,
		eventId,
		amountCredits: args.amountCredits,
		state: args.state || 'queued',
	})
}

export async function preflightBillingReservation({ name, args = {}, context = {}, entry = null, billingEntitlement = null, store = null, refreshBalance = refreshProviderBalanceForCustomer, verifyNoChargeReuse = null } = {}) {
	const classification = classifyBillingTool(name, args)
	if (!isBillingReservationEnforced()) return { active: false, reason: 'reservation-not-enforced', classification }
	if (['reserved', 'committed', 'included'].includes(context.__freeValueAuthorization?.status)) {
		return {
			active: false,
			reason: 'bounded-free-value-entitlement',
			category: context.__freeValueAuthorization.category,
			classification,
		}
	}
	// A settled x402 bounded job already paid for the complete execution unit.
	// Do not create a second legacy ledger reservation inside that job.  The
	// marker is attached by the server only after quote-bound settlement and is
	// never accepted from public tool arguments.
	const paidJob = context.__paidJobAuthorization
	if (paidJob?.paymentModel === 'one_payment_per_job' && paidJob.settled === true && paidJob.jobId && paidJob.quoteId) {
		return {
			active: false,
			reason: 'settled-bounded-job',
			paymentModel: 'one_payment_per_job',
			jobId: String(paidJob.jobId),
			quoteId: String(paidJob.quoteId),
			classification,
		}
	}
	if (classification.category !== 'checkpoint' && classification.category !== 'heavy') return { active: false, reason: classification.category, classification }
	assertProductionBillingConfiguration()
	if (!billingEntitlement) throw billingSetupIncomplete({ toolName: name, reason: 'verified-billing-identity-required' })
	const cryptoCredits = isCryptoCreditsBilling(billingEntitlement)
	if (!billingEntitlement?.billingCustomerHash || (!cryptoCredits && !billingEntitlement?.providerCustomerId)) {
		throw billingSetupIncomplete({ toolName: name, billingCategory: classification.category })
	}
	const ledger = storeOrDefault(store)
	const rateCard = currentRateCard()
	const premiumQuote = buildPremiumPresentationQuote({ toolName: name, args, entry, rateCard, deckId: args?.deckId || '' })
	const estimate = premiumQuote.estimate
	const calibrationMultiplier = premiumQuote.calibrationMultiplier
	const estimatedCredits = Number(estimate.estimatedCredits || 0)
	const amountCredits = premiumQuote.quoteCapCredits
	if (!Number.isFinite(amountCredits) || !Number.isFinite(estimatedCredits) || amountCredits < 0) {
		throw billingSetupIncomplete({ toolName: name, reason: 'invalid-cost-estimate' })
	}
	if (amountCredits === 0) {
		// A client-supplied "prepared" flag is not proof that no synthesis will
		// occur. The execution layer must validate the immutable reuse artifact.
		if (typeof verifyNoChargeReuse === 'function' && await verifyNoChargeReuse() === true) {
			return { active: false, reason: 'verified-no-charge-reuse', classification, estimate }
		}
		throw billingSetupIncomplete({ toolName: name, reason: 'unverified-zero-cost-operation' })
	}
	if (amountCredits > Number(rateCard.thresholds.hardBlockAboveWithoutExplicitOverride || Infinity) && args.billingOverride !== true) {
		throw billingConfirmationRequired({
			toolName: name,
			estimatedCredits: amountCredits,
			thresholdCredits: rateCard.thresholds.hardBlockAboveWithoutExplicitOverride,
		})
	}
	if (amountCredits > Number(rateCard.thresholds.confirmationRequiredAbove || Infinity) && args.billingConfirmed !== true) {
		throw billingConfirmationRequired({
			toolName: name,
			estimatedCredits: amountCredits,
			thresholdCredits: rateCard.thresholds.confirmationRequiredAbove,
		})
	}
	const customerHash = billingEntitlement.billingCustomerHash
	const sessionHash = sessionHashFor(context)
	const deckHash = deckHashFor(args)
	const operationId = buildBillingOperationId({
		customerHash,
		sessionHash,
		deckHash,
		toolName: name,
		idempotencyKey: idempotencyKey(args),
		args,
	})
	const existingCustomer = await ledger.getCustomer(customerHash)
	const seedEntitlementBalance = !cryptoCredits && !existingCustomer?.lastBalanceSyncedAt && billingEntitlement.lastKnownCreditBalance !== null && billingEntitlement.lastKnownCreditBalance !== undefined
	await ledger.upsertCustomer(customerHash, compactDefined({
		provider: cryptoCredits ? 'crypto_credits' : (billingProvider() || 'ledger'),
		providerCustomerId: cryptoCredits ? undefined : billingEntitlement.providerCustomerId,
		providerProductId: billingEntitlement.providerProductId,
		providerSubscriptionId: billingEntitlement.providerSubscriptionId,
		providerPaymentId: billingEntitlement.providerPaymentId,
		providerLicenseId: billingEntitlement.providerLicenseId,
		creditEntitlementId: cryptoCredits ? billingEntitlement.creditEntitlementId : (billingEntitlement.creditEntitlementId || process.env.BETTERPPTX_CREDIT_ENTITLEMENT_ID),
		billingStatus: billingEntitlement.billingStatus || 'active',
		availableBalanceCredits: seedEntitlementBalance ? billingEntitlement.lastKnownCreditBalance : undefined,
		lastKnownProviderAvailableBalanceCredits: seedEntitlementBalance ? billingEntitlement.lastKnownCreditBalance : undefined,
		lastBalanceSyncedAt: seedEntitlementBalance ? billingEntitlement.lastBalanceSyncedAt : undefined,
	}))
	const queuedCap = Number(process.env.BETTERPPTX_BILLING_MAX_QUEUED_USAGE_CREDITS || 100)
	if (Number.isFinite(queuedCap) && queuedCap > 0) {
		const currentCustomer = await ledger.getCustomer(customerHash)
		const balance = effectiveBalanceSnapshot(currentCustomer || {})
		if (balance.queuedUsageCreditsNotYetSettledByProvider >= queuedCap) {
			throw billingTemporarilyUnavailable({
				toolName: name,
				reason: 'queued-usage-cap-exceeded',
				queuedUsageCredits: balance.queuedUsageCreditsNotYetSettledByProvider,
				queuedUsageCapCredits: queuedCap,
			})
		}
	}
	const reservationArgs = {
		store: ledger,
		customerHash,
		sessionHash,
		deckHash,
		operationId,
		mode: classification.category === 'checkpoint' ? 'checkpoint' : 'heavy',
		amountCredits,
		metadata: {
			toolName: name,
			billingCategory: classification.category,
			billingMode: estimate.classification.mode,
			rateCardVersion: estimate.rateCardVersion,
			estimatedCredits,
			quoteCapCredits: amountCredits,
			calibrationMultiplier,
			metrics: estimate.metrics,
			pricingInputDigest: premiumQuote.pricingInputDigest,
			projectedOutputBytes: premiumQuote.projectedOutputBytes,
			priceUsdc: premiumQuote.priceUsdc,
			amountAtomic: premiumQuote.amountAtomic,
		},
	}
	try {
		const reserved = await reserveCredits(reservationArgs)
		assertFreshExecutionReservation(reserved, name)
		return { active: true, ...reserved, amountCredits, operationId, sessionHash, deckHash, customerHash, estimate, premiumQuote, classification, entry, store: ledger }
	} catch (err) {
		if (err?.code !== 'INSUFFICIENT_CREDITS') {
			recordBillingReservationTelemetry({ failed: true })
			throw err
		}
		if (cryptoCredits) {
			recordBillingReservationTelemetry({ failed: true })
			throw insufficientCredits({
				toolName: name,
				requiredCredits: err.details?.requiredCredits ?? amountCredits,
				availableCredits: err.details?.availableCredits ?? 0,
				pendingCredits: err.details?.pendingCredits ?? 0,
				balanceRefreshed: false,
			})
		}
		const refreshed = await refreshBalance({ store: ledger, billingEntitlement, customerHash })
		if (!refreshed?.ok) {
			recordBillingReservationTelemetry({ failed: true })
			throw billingTemporarilyUnavailable({
				toolName: name,
				estimatedCredits: amountCredits,
				refreshCode: refreshed?.code || 'PROVIDER_BALANCE_REFRESH_FAILED',
			})
		}
		try {
			const reserved = await reserveCredits(reservationArgs)
			assertFreshExecutionReservation(reserved, name)
			return { active: true, ...reserved, amountCredits, operationId, sessionHash, deckHash, customerHash, estimate, premiumQuote, classification, entry, store: ledger, balanceRefreshed: true }
		} catch (retryErr) {
			if (retryErr?.code !== 'INSUFFICIENT_CREDITS') {
				recordBillingReservationTelemetry({ failed: true })
				throw retryErr
			}
			recordBillingReservationTelemetry({ failed: true })
			throw insufficientCredits({
				toolName: name,
				requiredCredits: retryErr.details?.requiredCredits ?? amountCredits,
				availableCredits: retryErr.details?.availableCredits ?? 0,
				pendingCredits: retryErr.details?.pendingCredits ?? 0,
				balanceRefreshed: true,
			})
		}
	}
}

function assertFreshExecutionReservation(reserved, name) {
	if (reserved?.idempotent || reserved?.reservation?.state !== 'reserved') {
		throw billingTemporarilyUnavailable({
			toolName: name,
			reason: 'reservation-already-used',
			reservationState: reserved?.reservation?.state || 'unknown',
			recovery: 'Recover the original operation result with its original idempotency key. An existing reservation cannot authorize a second execution.',
		})
	}
}

export async function finalizeBillingReservation({ gate = null, name = '', args = {}, result = {}, store = null } = {}) {
	if (!gate?.active || !gate.reservation) return { finalized: false, reason: 'no-active-reservation' }
	const ledger = storeOrDefault(store || gate.store)
	const actualEstimate = estimateBillingForTool({
		name,
		args,
		result,
		entry: gate.entry || null,
		rateCard: currentRateCard(),
	})
	const quoteCapCredits = Number(gate.amountCredits ?? gate.reservation.amountCredits ?? 0)
	const actualCredits = Number(actualEstimate.estimatedCredits || 0)
	const committedCredits = roundCredits(Math.min(actualCredits, quoteCapCredits))
	const overrunCredits = roundCredits(Math.max(0, actualCredits - quoteCapCredits))
	if (committedCredits <= 0) {
		const released = await releaseCredits({
			store: ledger,
			reservationId: gate.reservation.reservationId,
			reason: 'zero-actual-cost',
		})
		if (!released?.idempotent) recordBillingReservationTelemetry({ releasedCredits: quoteCapCredits })
		return released
	}
	const artifactHash = hashPayload({
		toolName: name,
		bytes: result?.bytes || result?.artifact?.bytes || null,
		slideCount: result?.slideCount || null,
		downloadName: result?.downloadName || null,
		artifactState: result?.artifact?.state || null,
		idempotencyKey: idempotencyKey(args),
	})
	const eventId = buildBillingUsageEventId({
		customerHash: gate.customerHash,
		sessionHash: gate.sessionHash,
		deckHash: gate.deckHash,
		artifactHash,
		checkpointId: gate.operationId,
		operationGroup: name || 'operation',
	})
	const committed = await commitCredits({
		store: ledger,
		reservationId: gate.reservation.reservationId,
		amountCredits: committedCredits,
		metadata: {
			estimatedCredits: Number(gate.estimate?.estimatedCredits || quoteCapCredits),
			quoteCapCredits,
			actualCredits,
			committedCredits,
			overrunCredits,
			overrun: overrunCredits > 0,
			rateCardVersion: actualEstimate.rateCardVersion,
		},
		usageEvent: {
			eventId,
			customerHash: gate.customerHash,
			sessionHash: gate.sessionHash,
			deckHash: gate.deckHash,
			operationId: gate.operationId,
			amountCredits: committedCredits,
			metadata: {
				operation_group: name || 'operation',
				billing_mode: gate.classification?.mode || gate.reservation.mode || 'checkpoint',
				rate_card_version: gate.estimate?.rateCardVersion || currentRateCardVersion(),
				artifact_hash: artifactHash,
				status: 'success',
				estimated_credits: Number(gate.estimate?.estimatedCredits || quoteCapCredits),
				quote_cap_credits: quoteCapCredits,
				actual_credits: actualCredits,
				committed_credits: committedCredits,
				overrun_credits: overrunCredits,
				overrun: overrunCredits > 0,
			},
		},
	})
	if (!committed?.idempotent) {
		recordBillingReservationTelemetry({
			overrunCredits,
			releasedCredits: committed?.reservation?.releasedAmountCredits || 0,
		})
	}
	return committed
}

export async function releaseBillingReservation({ gate = null, reason = 'tool-failed-before-value', store = null } = {}) {
	if (!gate?.active || !gate.reservation) return { released: false, reason: 'no-active-reservation' }
	const ledger = storeOrDefault(store || gate.store)
	const released = await releaseCredits({
		store: ledger,
		reservationId: gate.reservation.reservationId,
		reason,
	})
	if (!released?.idempotent && released?.reservation?.state === 'released') {
		recordBillingReservationTelemetry({
			releasedCredits: released.reservation.amountCredits ?? gate.amountCredits ?? 0,
		})
	}
	return released
}
