import { getBillingTelemetrySummary } from '../telemetry.mjs'
import { getAuthState, getBillingEntitlement } from '../auth/entitlements.mjs'
import { createBillingLedgerStore } from './ledger-store.mjs'
import { effectiveBalanceSnapshot } from './reservations.mjs'
import { estimateBillingForTool, publicBillingDryRunSummary } from './estimator.mjs'
import { currentRateCard, currentRateCardVersion } from './rate-card.mjs'

const DEFAULT_PRICING_URL = 'https://betterpptx.com/pricing'

function cleanUrl(value) {
	const text = String(value || '').trim()
	if (!text) return null
	if (!/^https:\/\//i.test(text)) return null
	return text
}

export function publicBillingUrls({ feature = '', hasBillingCustomer = false } = {}) {
	const pricingUrl = cleanUrl(process.env.BETTERPPTX_PRICING_URL) || DEFAULT_PRICING_URL
	const checkoutUrl = cleanUrl(process.env.BETTERPPTX_CHECKOUT_URL) || pricingUrl
	const starterCheckoutUrl = cleanUrl(process.env.BETTERPPTX_STARTER_CHECKOUT_URL || process.env.BETTERPPTX_DODO_STARTER_CHECKOUT_URL) || checkoutUrl
	const topUpCheckoutUrl = cleanUrl(process.env.BETTERPPTX_TOPUP_CHECKOUT_URL || process.env.BETTERPPTX_DODO_TOPUP_CHECKOUT_URL) || checkoutUrl
	const portalUrl = hasBillingCustomer ? (cleanUrl(process.env.BETTERPPTX_PORTAL_URL) || null) : null
	const suffix = feature ? `?feature=${encodeURIComponent(feature)}` : ''
	return {
		pricingUrl,
		checkoutUrl: `${checkoutUrl}${checkoutUrl.includes('?') || !suffix ? '' : suffix}`,
		starterCheckoutUrl,
		topUpCheckoutUrl,
		portalUrl,
		portalAvailable: Boolean(portalUrl),
	}
}

export async function publicBillingBalance(context = {}, { store = createBillingLedgerStore() } = {}) {
	const entitlement = getBillingEntitlement(context)
	if (!entitlement?.billingCustomerHash) {
		return {
			available: false,
			status: 'not_activated',
			effectiveAvailableCredits: 0,
			pendingReservedCredits: 0,
			queuedUsageCreditsNotYetReflectedByDodo: 0,
			lastKnownDodoAvailableCredits: 0,
			lastBalanceSyncedAt: null,
		}
	}
	const customer = await store.getCustomer(entitlement.billingCustomerHash)
	const balance = effectiveBalanceSnapshot(customer || {})
	return {
		available: true,
		status: customer?.billingStatus || entitlement.billingStatus || 'unknown',
		effectiveAvailableCredits: balance.effectiveAvailableCredits,
		pendingReservedCredits: balance.pendingReservedCredits,
		queuedUsageCreditsNotYetReflectedByDodo: balance.queuedUsageCreditsNotYetReflectedByDodo,
		lastKnownDodoAvailableCredits: balance.lastKnownDodoAvailableCredits,
		lastBalanceSyncedAt: customer?.lastBalanceSyncedAt || entitlement.lastBalanceSyncedAt || null,
	}
}

export async function publicBillingStatus(context = {}, options = {}) {
	const auth = getAuthState(context)
	const entitlement = getBillingEntitlement(context)
	const balance = await publicBillingBalance(context, options)
	return {
		provider: entitlement?.provider === 'dodo' || process.env.BETTERPPTX_BILLING_PROVIDER === 'dodo' ? 'Dodo Payments' : 'provider-neutral',
		model: 'subscription credits plus top-ups',
		plan: auth.plan,
		authenticated: Boolean(auth.authenticated),
		hasBillingCustomer: Boolean(entitlement?.billingCustomerHash),
		balance,
		urls: publicBillingUrls({ hasBillingCustomer: Boolean(entitlement?.billingCustomerHash) }),
		dryRun: publicBillingDryRunSummary(getBillingTelemetrySummary()),
	}
}

export function publicPlanModel() {
	return {
		provider: 'Dodo Payments',
		model: 'subscription credits plus top-ups',
		starter: {
			name: 'BetterPPTX Starter',
			priceUsd: 5,
			interval: 'month',
			includedCredits: 500,
			description: 'The monthly subscription grants 500 BetterPPTX credits that are directly usable as quota.',
		},
		topUp: {
			name: 'BetterPPTX Credit Top-Up',
			priceUsd: 5,
			credits: 500,
			description: 'A top-up adds 500 more credits to the same customer balance.',
		},
		overage: 'disabled',
	}
}

export async function publicUsageSummary(context = {}, options = {}) {
	const billing = await publicBillingStatus(context, options)
	return {
		provider: billing.provider,
		plan: billing.plan,
		authenticated: billing.authenticated,
		balance: billing.balance,
		urls: billing.urls,
		recentUsage: {
			queuedUsageCreditsNotYetReflectedByDodo: billing.balance.queuedUsageCreditsNotYetReflectedByDodo,
			pendingReservedCredits: billing.balance.pendingReservedCredits,
			dryRunOperations: billing.dryRun.operations,
			dryRunEstimatedCredits: billing.dryRun.estimatedCredits,
		},
	}
}

export function publicBillingEstimate({ toolName = 'betterpptx.deck.save', args = {}, entry = null } = {}) {
	const estimate = estimateBillingForTool({ name: toolName, args, entry })
	const rateCard = currentRateCard()
	const confirmationThreshold = rateCard.thresholds.confirmationRequiredAbove
	return {
		toolName,
		billingCategory: estimate.classification.category,
		billingMode: estimate.classification.mode,
		estimatedCredits: estimate.estimatedCredits,
		rateCardVersion: currentRateCardVersion(),
		confirmationRequired: estimate.estimatedCredits > confirmationThreshold,
		confirmationThresholdCredits: confirmationThreshold,
		metrics: estimate.metrics,
	}
}

