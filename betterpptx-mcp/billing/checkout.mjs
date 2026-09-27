import { getBillingTelemetrySummary } from '../telemetry.mjs'
import { getAuthState, getBillingEntitlement } from '../auth/entitlements.mjs'
import { createBillingLedgerStore } from './ledger-store.mjs'
import { effectiveBalanceSnapshot } from './reservations.mjs'
import { publicBillingDryRunSummary } from './estimator.mjs'
import { publicCryptoPackModel } from './crypto-packs.mjs'
import { tryMintPaymentEnvelope } from './payment-envelope.mjs'
import { publicMonetizedMcpRecovery } from './monetized-mcp-adapter.mjs'
import { paymentSurfaceReadiness } from './payment-surfaces.mjs'
import { buildPremiumPresentationQuote, buildSpecPremiumPresentationQuote } from './premium-quote.mjs'

const DEFAULT_PRICING_URL = 'https://betterpptx.com/pricing'

// PAYRAM-EXCLUSIVE: 'payram' and 'crypto_credits' are the same prepaid crypto rail.
function isCryptoProvider(value) {
	const provider = String(value || '').trim().toLowerCase()
	return provider === 'crypto_credits' || provider === 'payram'
}

function isPayPerJobEnabled(env = process.env) {
	return String(env.BETTERPPTX_BILLING_MODEL || '').trim().toLowerCase() === 'pay_per_job'
}

function cleanUrl(value) {
	const text = String(value || '').trim()
	if (!text) return null
	if (!/^https:\/\//i.test(text)) return null
	return text
}

function appendQuery(url, key, value) {
	if (!url || !value) return url
	const separator = url.includes('?') ? '&' : '?'
	return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`
}

export function publicBillingUrls({ feature = '', hasBillingCustomer = false, installHash = '' } = {}) {
	const pricingUrl = cleanUrl(process.env.BETTERPPTX_PRICING_URL) || DEFAULT_PRICING_URL
	const checkoutUrl = cleanUrl(process.env.BETTERPPTX_CHECKOUT_URL) || pricingUrl
	const starterCheckoutUrl = cleanUrl(process.env.BETTERPPTX_STARTER_CHECKOUT_URL) || checkoutUrl
	const cryptoMode = isCryptoProvider(process.env.BETTERPPTX_BILLING_PROVIDER)
	const payPerJob = isPayPerJobEnabled()
	const envelope = cryptoMode && installHash
		&& !payPerJob
		? tryMintPaymentEnvelope({ purpose: 'topup', installHash })
		: null
	const paymentBase = cleanUrl(process.env.BETTERPPTX_PAYMENT_BASE_URL || process.env.BETTERPPTX_PUBLIC_BASE)
	const cryptoTopUpUrl = envelope && paymentBase
		? appendQuery(`${paymentBase.replace(/\/+$/, '')}/pay/orders/new`, 'token', envelope)
		: null
	const topUpCheckoutUrl = payPerJob
		? null
		: cryptoMode
		? cryptoTopUpUrl
		: (cleanUrl(process.env.BETTERPPTX_TOPUP_CHECKOUT_URL) || checkoutUrl)
	const portalUrl = hasBillingCustomer ? (cleanUrl(process.env.BETTERPPTX_PORTAL_URL) || null) : null
	const suffix = feature ? `?feature=${encodeURIComponent(feature)}` : ''
	return {
		pricingUrl,
		checkoutUrl: `${checkoutUrl}${checkoutUrl.includes('?') || !suffix ? '' : suffix}`,
		starterCheckoutUrl,
		topUpCheckoutUrl,
		topUpAvailable: Boolean(topUpCheckoutUrl),
		portalUrl,
		portalAvailable: Boolean(portalUrl),
		agentPurchase: publicMonetizedMcpRecovery({ installHash }),
	}
}

export async function publicBillingBalance(context = {}, { store = null } = {}) {
	if (isPayPerJobEnabled()) {
		return {
			available: false,
			status: 'not_applicable',
			effectiveAvailableCredits: 0,
			pendingReservedCredits: 0,
			availableBalanceCredits: 0,
			queuedUsageCredits: 0,
			queuedUsageCreditsNotYetSettledByProvider: 0,
			lastKnownProviderAvailableCredits: 0,
			lastBalanceSyncedAt: null,
			reusableProductBalance: false,
		}
	}
	const entitlement = getBillingEntitlement(context)
	if (!entitlement?.billingCustomerHash) {
		return {
			available: false,
			status: 'not_activated',
			effectiveAvailableCredits: 0,
			pendingReservedCredits: 0,
			availableBalanceCredits: 0,
			queuedUsageCredits: 0,
			queuedUsageCreditsNotYetSettledByProvider: 0,
			lastKnownProviderAvailableCredits: 0,
			lastBalanceSyncedAt: null,
		}
	}
	const ledger = store || createBillingLedgerStore()
	const customer = await ledger.getCustomer(entitlement.billingCustomerHash)
	const balance = effectiveBalanceSnapshot(customer || {})
	return {
		available: true,
		status: customer?.billingStatus || entitlement.billingStatus || 'unknown',
		effectiveAvailableCredits: balance.effectiveAvailableCredits,
		pendingReservedCredits: balance.pendingReservedCredits,
		availableBalanceCredits: balance.availableBalanceCredits,
		queuedUsageCredits: balance.queuedUsageCredits,
		queuedUsageCreditsNotYetSettledByProvider: balance.queuedUsageCreditsNotYetSettledByProvider,
		lastKnownProviderAvailableCredits: balance.lastKnownProviderAvailableCredits,
		lastBalanceSyncedAt: customer?.lastBalanceSyncedAt || entitlement.lastBalanceSyncedAt || null,
	}
}

export async function publicBillingStatus(context = {}, options = {}) {
	const payPerJob = isPayPerJobEnabled()
	const auth = getAuthState(context)
	const entitlement = getBillingEntitlement(context)
	const balance = payPerJob ? null : await publicBillingBalance(context, options)
	const cryptoMode = isCryptoProvider(entitlement?.provider) || isCryptoProvider(process.env.BETTERPPTX_BILLING_PROVIDER)
	if (payPerJob) {
		return {
			provider: 'x402',
			model: 'one payment per bounded job',
			billingModel: 'pay_per_job',
			plan: 'job-paid',
			authenticated: Boolean(auth.authenticated),
			hasBillingCustomer: false,
			balance: {
				available: false,
				status: 'not_applicable',
				reusableProductBalance: false,
				message: 'BetterPPTX does not maintain a reusable product credit balance in pay-per-job mode.',
				legacyBalanceRetainedForMigration: false,
			},
			urls: publicBillingUrls({ hasBillingCustomer: false, installHash: context.installHash || '' }),
			dryRun: publicBillingDryRunSummary(getBillingTelemetrySummary()),
		}
	}
	return {
		provider: cryptoMode ? 'PayRam (crypto credits)' : 'provider-neutral',
		model: cryptoMode ? 'prepaid credits plus top-ups' : 'subscription credits plus top-ups',
		billingModel: 'credit_compatibility',
		plan: auth.plan,
		authenticated: Boolean(auth.authenticated),
		hasBillingCustomer: Boolean(entitlement?.billingCustomerHash),
		balance,
		urls: publicBillingUrls({
			hasBillingCustomer: Boolean(entitlement?.billingCustomerHash),
			installHash: context.installHash || '',
		}),
		dryRun: publicBillingDryRunSummary(getBillingTelemetrySummary()),
	}
}

export function publicPaymentOptions(context = {}) {
	return paymentSurfaceReadiness({ installHash: context.installHash || '' })
}

export function publicPlanModel() {
	if (isPayPerJobEnabled()) {
		return {
			provider: 'x402',
			model: 'one payment per bounded job',
			billingModel: 'pay_per_job',
			description: 'Keep funds in your own wallet. Approve one exact payment for one frozen BetterPPTX job. Polling, reconnecting, and recovering the same accepted result do not create another charge.',
			legacyCreditBalance: 'disabled_for_new_jobs',
		}
	}
	if (isCryptoProvider(process.env.BETTERPPTX_BILLING_PROVIDER)) {
		return {
			provider: 'crypto credits',
			...publicCryptoPackModel(),
		}
	}
	return {
		provider: 'Polar (subscription)',
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
	if (billing.billingModel === 'pay_per_job') {
		return {
			provider: billing.provider,
			model: billing.model,
			billingModel: billing.billingModel,
			plan: billing.plan,
			authenticated: billing.authenticated,
			balance: billing.balance,
			urls: billing.urls,
			recentUsage: {
				paymentModel: 'one_payment_per_job',
				legacyBalanceRetainedForMigration: Boolean(billing.balance?.legacyBalanceRetainedForMigration),
				dryRunOperations: billing.dryRun.operations,
				dryRunEstimatedCostUnits: billing.dryRun.estimatedCredits,
			},
		}
	}
	return {
		provider: billing.provider,
		plan: billing.plan,
		authenticated: billing.authenticated,
		balance: billing.balance,
		urls: billing.urls,
		recentUsage: {
			queuedUsageCreditsNotYetSettledByProvider: billing.balance.queuedUsageCreditsNotYetSettledByProvider,
			queuedUsageCredits: billing.balance.queuedUsageCredits,
			pendingReservedCredits: billing.balance.pendingReservedCredits,
			dryRunOperations: billing.dryRun.operations,
			dryRunEstimatedCredits: billing.dryRun.estimatedCredits,
		},
	}
}

export function publicBillingEstimate({ toolName = 'betterpptx.deck.save', args = {}, entry = null, preparedNarrationTimingBySlide = null } = {}) {
	if (String(toolName) === 'betterpptx.deck.generate_from_spec' && args?.spec && typeof args.spec === 'object' && !Array.isArray(args.spec)) {
		return buildSpecPremiumPresentationQuote({
			spec: args.spec,
			args,
			deckId: args.deckId || '',
			preparedNarrationTimingBySlide,
		})
	}
	return buildPremiumPresentationQuote({ toolName, args, entry, deckId: args?.deckId || '' })
}
