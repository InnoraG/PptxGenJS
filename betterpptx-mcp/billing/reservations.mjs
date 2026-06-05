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
import { collectDeckBillingMetrics, estimateBillingForTool } from './estimator.mjs'
import { currentRateCard, currentRateCardVersion } from './rate-card.mjs'
import {
	billingConfirmationRequired,
	billingSetupIncomplete,
	billingTemporarilyUnavailable,
	insufficientCredits,
} from './public-errors.mjs'

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
	if (process.env.BETTERPPTX_BILLING_ENFORCE === '0') return false
	if (isBillingDryRunEnabled()) return false
	return billingProvider() === 'dodo' || process.env.BETTERPPTX_BILLING_ENFORCE === '1'
}

function compactDefined(record) {
	return Object.fromEntries(Object.entries(record).filter(([_key, value]) => value !== undefined && value !== null && value !== ''))
}

function idempotencyKey(args = {}) {
	return String(args.idempotencyKey || args.idempotency_key || '').trim()
}

function sessionHashFor(context = {}) {
	return hashSessionId(context.sessionId || 'stdio-default')
}

function deckHashFor(args = {}, result = {}) {
	const deckId = args.deckId || result.deckId || result.data?.deckId || ''
	return deckId ? hashDeckId(deckId) : ''
}

function projectedCheckpointResult(entry = {}) {
	const metrics = collectDeckBillingMetrics(entry, {})
	const estimatedMb = Math.max(
		0.25,
		0.15 + metrics.slideCount * 0.08 + metrics.finalObjectCount * 0.015 + metrics.richObjectCount * 0.30,
	)
	return {
		slideCount: metrics.slideCount,
		bytes: Math.round(estimatedMb * 1048576),
	}
}

function dodoApiToken() {
	return process.env.DODO_PAYMENTS_API_KEY || process.env.BETTERPPTX_DODO_API_KEY || ''
}

function dodoApiBase() {
	const configured = String(process.env.BETTERPPTX_DODO_API_BASE || '').trim().replace(/\/+$/, '')
	if (configured) return configured
	const environment = String(process.env.BETTERPPTX_DODO_ENVIRONMENT || '').toLowerCase()
	if (environment === 'test') return 'https://test.dodopayments.com'
	if (environment === 'live') return 'https://live.dodopayments.com'
	return 'https://api.dodopayments.com'
}

function extractAvailableBalance(data) {
	const candidates = [
		data?.available_balance,
		data?.availableBalance,
		data?.balance,
		data?.credits,
		data?.amount,
		data?.data?.available_balance,
		data?.data?.availableBalance,
		data?.data?.balance,
	]
	for (const candidate of candidates) {
		if (candidate === undefined || candidate === null) continue
		if (typeof candidate === 'object') {
			const nested = extractAvailableBalance(candidate)
			if (nested !== null) return nested
			continue
		}
		const n = Number(candidate)
		if (Number.isFinite(n)) return n
	}
	return null
}

export async function refreshDodoBalanceForCustomer({ store, billingEntitlement = {}, customerHash = '' } = {}) {
	const ledger = storeOrDefault(store)
	const providerCustomerId = billingEntitlement.providerCustomerId
	const creditEntitlementId = billingEntitlement.creditEntitlementId || process.env.BETTERPPTX_DODO_CREDIT_ENTITLEMENT_ID
	if (!providerCustomerId || !creditEntitlementId) {
		return { ok: false, code: 'DODO_BALANCE_ID_MISSING' }
	}
	const token = dodoApiToken()
	if (!token) return { ok: false, code: 'DODO_API_TOKEN_MISSING' }
	const url = `${dodoApiBase()}/credit-entitlements/${encodeURIComponent(creditEntitlementId)}/balances/${encodeURIComponent(providerCustomerId)}`
	let response
	try {
		response = await fetch(url, {
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${token}`,
			},
		})
	} catch (err) {
		return { ok: false, code: 'DODO_BALANCE_FETCH_FAILED', reason: String(err?.message || err) }
	}
	const raw = await response.text()
	let data = null
	try { data = raw ? JSON.parse(raw) : null } catch { data = { raw } }
	if (!response.ok) return { ok: false, code: 'DODO_BALANCE_FETCH_HTTP_ERROR', status: response.status }
	const balance = extractAvailableBalance(data)
	if (balance === null) return { ok: false, code: 'DODO_BALANCE_SHAPE_UNKNOWN' }
	const now = new Date().toISOString()
	const hash = customerHash || billingEntitlement.billingCustomerHash
	if (hash) {
		await ledger.upsertCustomer(hash, compactDefined({
			provider: 'dodo',
			providerCustomerId,
			creditEntitlementId,
			lastKnownDodoAvailableBalanceCredits: balance,
			lastBalanceSyncedAt: now,
			billingStatus: billingEntitlement.billingStatus || 'active',
		}))
	}
	return { ok: true, balanceCredits: balance, syncedAt: now }
}

export function effectiveBalanceSnapshot(customer = {}) {
	const lastKnownUnits = Math.max(0, Math.round(Number(customer.lastKnownDodoAvailableBalanceUnits) || 0))
	const pendingUnits = Math.max(0, Math.round(Number(customer.pendingReservedUnits) || 0))
	const queuedUnits = Math.max(0, Math.round(Number(customer.durableQueuedUsageUnitsNotYetReflectedByDodo) || 0))
	const effectiveAvailableUnits = Math.max(0, lastKnownUnits - pendingUnits - queuedUnits)
	return {
		lastKnownDodoAvailableCredits: fromCreditUnits(lastKnownUnits),
		pendingReservedCredits: fromCreditUnits(pendingUnits),
		queuedUsageCreditsNotYetReflectedByDodo: fromCreditUnits(queuedUnits),
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

export async function preflightBillingReservation({ name, args = {}, context = {}, entry = null, billingEntitlement = null, store = null, refreshBalance = refreshDodoBalanceForCustomer } = {}) {
	const classification = classifyBillingTool(name)
	if (!isBillingReservationEnforced()) return { active: false, reason: 'reservation-not-enforced', classification }
	if (classification.category !== 'checkpoint' && classification.category !== 'heavy') return { active: false, reason: classification.category, classification }
	if (!billingEntitlement?.billingCustomerHash || !billingEntitlement?.providerCustomerId) {
		throw billingSetupIncomplete({ toolName: name, billingCategory: classification.category })
	}
	const ledger = storeOrDefault(store)
	const rateCard = currentRateCard()
	const resultForEstimate = classification.category === 'checkpoint' ? projectedCheckpointResult(entry) : {}
	const estimate = estimateBillingForTool({ name, args, result: resultForEstimate, entry, rateCard })
	const amountCredits = Number(estimate.estimatedCredits || 0)
	if (amountCredits <= 0) return { active: false, reason: 'zero-estimate', classification, estimate }
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
	const seedEntitlementBalance = !existingCustomer?.lastBalanceSyncedAt && billingEntitlement.lastKnownCreditBalance !== null && billingEntitlement.lastKnownCreditBalance !== undefined
	await ledger.upsertCustomer(customerHash, compactDefined({
		provider: 'dodo',
		providerCustomerId: billingEntitlement.providerCustomerId,
		providerProductId: billingEntitlement.providerProductId,
		providerSubscriptionId: billingEntitlement.providerSubscriptionId,
		providerPaymentId: billingEntitlement.providerPaymentId,
		providerLicenseId: billingEntitlement.providerLicenseId,
		creditEntitlementId: billingEntitlement.creditEntitlementId || process.env.BETTERPPTX_DODO_CREDIT_ENTITLEMENT_ID,
		billingStatus: billingEntitlement.billingStatus || 'active',
		lastKnownDodoAvailableBalanceCredits: seedEntitlementBalance ? billingEntitlement.lastKnownCreditBalance : undefined,
		lastBalanceSyncedAt: seedEntitlementBalance ? billingEntitlement.lastBalanceSyncedAt : undefined,
	}))
	const queuedCap = Number(process.env.BETTERPPTX_BILLING_MAX_QUEUED_USAGE_CREDITS || 100)
	if (Number.isFinite(queuedCap) && queuedCap > 0) {
		const currentCustomer = await ledger.getCustomer(customerHash)
		const balance = effectiveBalanceSnapshot(currentCustomer || {})
		if (balance.queuedUsageCreditsNotYetReflectedByDodo >= queuedCap) {
			throw billingTemporarilyUnavailable({
				toolName: name,
				reason: 'queued-usage-cap-exceeded',
				queuedUsageCredits: balance.queuedUsageCreditsNotYetReflectedByDodo,
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
			estimatedCredits: amountCredits,
			metrics: estimate.metrics,
		},
	}
	try {
		const reserved = await reserveCredits(reservationArgs)
		return { active: true, ...reserved, amountCredits, operationId, sessionHash, deckHash, customerHash, estimate, classification, store: ledger }
	} catch (err) {
		if (err?.code !== 'INSUFFICIENT_CREDITS') throw err
		const refreshed = await refreshBalance({ store: ledger, billingEntitlement, customerHash })
		if (!refreshed?.ok) {
			throw billingTemporarilyUnavailable({
				toolName: name,
				estimatedCredits: amountCredits,
				refreshCode: refreshed?.code || 'DODO_BALANCE_REFRESH_FAILED',
			})
		}
		try {
			const reserved = await reserveCredits(reservationArgs)
			return { active: true, ...reserved, amountCredits, operationId, sessionHash, deckHash, customerHash, estimate, classification, store: ledger, balanceRefreshed: true }
		} catch (retryErr) {
			if (retryErr?.code !== 'INSUFFICIENT_CREDITS') throw retryErr
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

export async function finalizeBillingReservation({ gate = null, name = '', args = {}, result = {}, store = null } = {}) {
	if (!gate?.active || !gate.reservation) return { finalized: false, reason: 'no-active-reservation' }
	const ledger = storeOrDefault(store || gate.store)
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
	return commitCredits({
		store: ledger,
		reservationId: gate.reservation.reservationId,
		usageEvent: {
			eventId,
			customerHash: gate.customerHash,
			sessionHash: gate.sessionHash,
			deckHash: gate.deckHash,
			operationId: gate.operationId,
			amountCredits: gate.amountCredits,
			metadata: {
				operation_group: name || 'operation',
				billing_mode: gate.classification?.mode || gate.reservation.mode || 'checkpoint',
				rate_card_version: gate.estimate?.rateCardVersion || currentRateCardVersion(),
				artifact_hash: artifactHash,
				status: 'success',
			},
		},
	})
}

export async function releaseBillingReservation({ gate = null, reason = 'tool-failed-before-value', store = null } = {}) {
	if (!gate?.active || !gate.reservation) return { released: false, reason: 'no-active-reservation' }
	const ledger = storeOrDefault(store || gate.store)
	return releaseCredits({
		store: ledger,
		reservationId: gate.reservation.reservationId,
		reason,
	})
}
