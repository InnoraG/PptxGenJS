import * as crypto from 'node:crypto'
import { createEntitlementStore } from './entitlement-store.mjs'
import { createBillingLedgerStore, hashCustomerId } from '../billing/ledger-store.mjs'
import { createInstallUsageStore } from './install-identity.mjs'
import { isProductionBillingEnvironment } from '../billing/security-policy.mjs'
import { digestOperationPayload } from '../storage/operation-store.mjs'

const DEFAULT_PRICING_URL = 'https://betterpptx.com/pricing'

export const FREE_TIER_POLICY = {
	plan: 'free',
	publicationLimit: Number(process.env.BETTERPPTX_FREE_PUBLICATIONS_PER_WINDOW || 3),
	windowDays: Number(process.env.BETTERPPTX_FREE_PUBLICATION_WINDOW_DAYS || 30),
	narrationPreparationLimit: Number(process.env.BETTERPPTX_FREE_NARRATION_PREPARATIONS_PER_WINDOW || 3),
	identityMediaLimit: Number(process.env.BETTERPPTX_FREE_IDENTITY_MEDIA_PER_WINDOW || 3),
	creativeFeatureGate: 'none',
	genericServerImageGeneration: 'retired',
}

const FREE_WINDOW_MS = () => Math.max(1, FREE_TIER_POLICY.windowDays) * 24 * 60 * 60 * 1000
const FREE_RESERVATION_LEASE_MS = () => Math.max(60_000, Number(process.env.BETTERPPTX_FREE_RESERVATION_LEASE_MS) || 30 * 60 * 1000)

const sessionEntitlements = new Map()
const sessionUsage = new Map()
const entitlementStore = createEntitlementStore()
let installUsageStore = null
let installBillingStore = null

async function loadEntitlementStore() {
	return await entitlementStore.load()
}

async function getPersistedKeyState(fingerprint) {
	if (typeof entitlementStore.getKeyState === 'function') return await entitlementStore.getKeyState(fingerprint)
	const store = await loadEntitlementStore()
	return store.keys[fingerprint] || null
}

async function persistKeyState(fingerprint, state) {
	return await entitlementStore.persistKeyState(fingerprint, state)
}

export function getEntitlementStoreInfo() {
	return entitlementStore.describe()
}

function sessionKey(context = {}) {
	return String(context.installHash || context.sessionId || 'stdio-default')
}

function todayKey() {
	return new Date().toISOString().slice(0, 10)
}

function currentInstallUsageStore() {
	if (!installUsageStore) installUsageStore = createInstallUsageStore()
	return installUsageStore
}

function currentInstallBillingStore() {
	if (!installBillingStore) installBillingStore = createBillingLedgerStore()
	return installBillingStore
}

function installHydrationTtlMs() {
	return Math.max(0, Number(process.env.BETTERPPTX_INSTALL_STATE_TTL_MS || 5000) || 0)
}

function isPayPerJobEnabled() {
	return String(process.env.BETTERPPTX_BILLING_MODEL || '').trim().toLowerCase() === 'pay_per_job'
}

export async function hydrateInstallBillingContext(context = {}, { force = false } = {}) {
	const installHash = String(context.installHash || '').trim()
	if (!installHash) return context
	const state = context.installState || {}
	context.installState = state
	const now = Date.now()
	const date = todayKey()
	if (!force && state.date === date && now - Number(state.hydratedAt || 0) <= installHydrationTtlMs()) return context
	const usagePromise = currentInstallUsageStore().getDailyUsage(installHash, date)
	if (isPayPerJobEnabled()) {
		state.date = date
		state.hydratedAt = now
		state.usage = await usagePromise
		state.billingEntitlement = {
			plan: 'job-paid',
			provider: 'x402_job_payment',
			credits: 0,
			billingStatus: 'not_applicable',
		}
		return context
	}
	const [customer, usage] = await Promise.all([
		currentInstallBillingStore().getCustomer(installHash),
		usagePromise,
	])
	const effectiveCredits = Math.max(0, Number(customer?.effectiveAvailableCredits) || 0)
	state.date = date
	state.hydratedAt = now
	state.usage = usage
	state.billingEntitlement = {
		plan: effectiveCredits > 0 ? 'credits' : 'free',
		provider: 'crypto_credits',
		credits: effectiveCredits,
		billingCustomerHash: installHash,
		billingStatus: customer?.billingStatus || 'active',
		lastKnownCreditBalance: Number(customer?.availableBalanceCredits || 0),
		lastBalanceSyncedAt: customer?.updatedAt || null,
	}
	return context
}

function nextUtcMidnightIso() {
	const now = new Date()
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString()
}

function publicPlanUrls(feature) {
	const pricingUrl = process.env.BETTERPPTX_PRICING_URL || DEFAULT_PRICING_URL
	const checkoutUrl = process.env.BETTERPPTX_CHECKOUT_URL || pricingUrl
	const portalUrl = process.env.BETTERPPTX_PORTAL_URL || pricingUrl
	const suffix = feature ? `?feature=${encodeURIComponent(feature)}` : ''
	return {
		pricingUrl,
		upgradeUrl: `${checkoutUrl}${checkoutUrl.includes('?') || !suffix ? '' : suffix}`,
		checkoutUrl,
		portalUrl,
	}
}

function redactKey(key) {
	const text = String(key || '')
	if (text.length <= 8) return text ? '<redacted>' : ''
	return `${text.slice(0, 4)}...${text.slice(-4)}`
}

function keyHash(key) {
	return crypto.createHash('sha256').update(String(key || '')).digest('hex').slice(0, 16)
}

function licenseValidationMode() {
	return String(process.env.BETTERPPTX_LICENSE_VALIDATION_MODE || 'auto').toLowerCase()
}

function licenseCacheTtlMs() {
	return Math.max(0, Number(process.env.BETTERPPTX_LICENSE_CACHE_TTL_MS ?? 24 * 60 * 60 * 1000) || 0)
}

function licenseGraceMs() {
	return Math.max(0, Number(process.env.BETTERPPTX_LICENSE_GRACE_MS ?? 72 * 60 * 60 * 1000) || 0)
}

function addMsIso(ms) {
	return new Date(Date.now() + Math.max(0, Number(ms) || 0)).toISOString()
}

function isFutureIso(value) {
	const time = Date.parse(String(value || ''))
	return Number.isFinite(time) && time > Date.now()
}

async function cachedValidationForKey(key) {
	const fingerprint = keyHash(key)
	const cached = await getPersistedKeyState(fingerprint)
	if (!cached || !isFutureIso(cached.cacheExpiresAt)) return null
	return {
		ok: true,
		plan: cached.plan,
		provider: cached.provider || providerFromKey(key),
		source: 'validation-cache',
		credits: Math.max(0, Number(cached.credits) || 0),
		providerStatus: cached.providerStatus || 'cached-valid',
		providerCustomerId: cached.providerCustomerId || null,
		providerProductId: cached.providerProductId || null,
		providerSubscriptionId: cached.providerSubscriptionId || null,
		providerPaymentId: cached.providerPaymentId || null,
		providerLicenseId: cached.providerLicenseId || null,
		creditEntitlementId: cached.creditEntitlementId || null,
		lastKnownCreditBalance: cached.lastKnownCreditBalance ?? null,
		lastBalanceSyncedAt: cached.lastBalanceSyncedAt || null,
		billingCustomerHash: cached.billingCustomerHash || null,
		billingStatus: cached.billingStatus || null,
		cached: true,
	}
}

function parsePremiumKeys() {
	return String(process.env.BETTERPPTX_PREMIUM_KEYS || '')
		.split(/[,\r\n]+/)
		.map(s => s.trim())
		.filter(Boolean)
}

function parseCreditKeys() {
	const out = new Map()
	for (const item of String(process.env.BETTERPPTX_CREDIT_KEYS || '').split(/[,\r\n]+/)) {
		const [key, credits] = item.split(':').map(s => s && s.trim())
		if (key) out.set(key, Math.max(0, Number(credits) || 0))
	}
	return out
}

function providerFromKey(key, explicit = 'auto') {
	// PAYRAM-EXCLUSIVE: payment/credits provider is PayRam; Polar remains the subscription-key
	// issuer. 'dodo' is never accepted.
	const requested = String(explicit || 'auto').toLowerCase()
	if (requested === 'polar' || requested === 'payram') return requested
	if (/polar/i.test(key)) return 'polar'
	if (/payram/i.test(key)) return 'payram'
	return process.env.BETTERPPTX_BILLING_PROVIDER || 'provider-neutral'
}

function parseMockLicenseKeys() {
	const out = new Map()
	for (const item of String(process.env.BETTERPPTX_MOCK_LICENSE_KEYS || '').split(/[,\r\n]+/)) {
		const parts = item.split(':').map(s => s && s.trim()).filter(Boolean)
		if (!parts.length) continue
		const [key, plan = 'premium', value] = parts
		out.set(key, { plan, credits: Math.max(0, Number(value) || 0) })
	}
	return out
}

function validateMockLicenseKey(key, provider) {
	const configured = parseMockLicenseKeys()
	const explicit = configured.get(key)
	const lower = String(key || '').toLowerCase()
	const match = explicit ||
		(lower.startsWith('sk_test_betterpptx_premium_') ? { plan: 'premium', credits: 0 } : null) ||
		(lower.startsWith('sk_test_betterpptx_credits_') ? { plan: 'credits', credits: Math.max(1, Number(process.env.BETTERPPTX_MOCK_LICENSE_DEFAULT_CREDITS) || 3) } : null) ||
		(lower.startsWith('sk_test_betterpptx_revoked_') ? { plan: 'revoked', credits: 0 } : null)
	if (!match) return null
	if (String(match.plan).toLowerCase() === 'revoked' || String(match.plan).toLowerCase() === 'disabled') {
		return {
			ok: false,
			code: 'LICENSE_REVOKED',
			message: 'The activation key was rejected by the mock license provider.',
		}
	}
	return {
		ok: true,
		plan: String(match.plan).toLowerCase() === 'credits' ? 'credits' : 'premium',
		provider,
		source: 'mock-provider',
		credits: Math.max(0, Number(match.credits) || 0),
		providerStatus: 'valid',
	}
}

async function fetchJson(url, { headers = {}, body, timeoutMs = 10000 } = {}) {
	const ctrl = new AbortController()
	const timer = setTimeout(() => ctrl.abort(), Math.max(1000, Number(timeoutMs) || 10000))
	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...headers },
			body: JSON.stringify(body || {}),
			signal: ctrl.signal,
		})
		let parsed = null
		try { parsed = await res.json() } catch (_) {}
		return { ok: res.ok, status: res.status, data: parsed }
	} finally {
		clearTimeout(timer)
	}
}

async function validatePolarLicenseKey(key, provider) {
	const organizationId = process.env.BETTERPPTX_POLAR_ORGANIZATION_ID
	if (!organizationId) return null
	const url = process.env.BETTERPPTX_POLAR_VALIDATE_URL || 'https://api.polar.sh/v1/customer-portal/license-keys/validate'
	const body = {
		key,
		organization_id: organizationId,
	}
	if (process.env.BETTERPPTX_POLAR_BENEFIT_ID) body.benefit_id = process.env.BETTERPPTX_POLAR_BENEFIT_ID
	if (process.env.BETTERPPTX_POLAR_INCREMENT_USAGE) body.increment_usage = Number(process.env.BETTERPPTX_POLAR_INCREMENT_USAGE) || 0
	const headers = {}
	if (process.env.BETTERPPTX_POLAR_API_TOKEN) headers.Authorization = `Bearer ${process.env.BETTERPPTX_POLAR_API_TOKEN}`
	const response = await fetchJson(url, {
		headers,
		body,
		timeoutMs: process.env.BETTERPPTX_LICENSE_VALIDATE_TIMEOUT_MS,
	})
	if (!response.ok) {
		return {
			ok: false,
			code: response.status === 404 ? 'INVALID_ACTIVATION_KEY' : 'LICENSE_VALIDATION_FAILED',
			message: response.status === 404
				? 'The Polar license key could not be found.'
				: `Polar license validation failed with HTTP ${response.status}.`,
		}
	}
	const data = response.data || {}
	const status = String(data.status || '').toLowerCase()
	const expired = data.expires_at && Date.parse(data.expires_at) <= Date.now()
	if (status && status !== 'granted') {
		return { ok: false, code: 'LICENSE_REVOKED', message: `Polar license status is ${status}.` }
	}
	if (expired) return { ok: false, code: 'LICENSE_EXPIRED', message: 'The Polar license key is expired.' }
	return {
		ok: true,
		plan: 'premium',
		provider,
		source: 'polar-api',
		credits: 0,
		providerStatus: status || 'valid',
		providerLicenseId: data.id,
		expiresAt: data.expires_at || null,
	}
}


async function validateActivationKey(key, provider) {
	const mode = licenseValidationMode()
	const production = isProductionBillingEnvironment()
	if (production && (/^sk_test_/i.test(key) || mode === 'mock')) {
		return { ok: false, code: 'INVALID_ACTIVATION_KEY', message: 'Development activation is not available in production.' }
	}
	if (mode !== 'no-cache') {
		const cached = await cachedValidationForKey(key)
		if (cached && !(production && /mock|dev-accept/i.test(String(cached.source || cached.originalSource || '')))) return cached
	}

	if (mode === 'mock') {
		const mock = validateMockLicenseKey(key, provider)
		if (mock) return mock
	}

	const premiumKeys = parsePremiumKeys()
	const creditKeys = parseCreditKeys()
	if (premiumKeys.includes(key)) {
		return { ok: true, plan: 'premium', provider, source: 'configured-key', credits: 0, providerStatus: 'configured-valid' }
	}
	if (creditKeys.has(key)) {
		return { ok: true, plan: 'credits', provider, source: 'configured-credit-key', credits: creditKeys.get(key), providerStatus: 'configured-valid' }
	}

	if (mode !== 'configured') {
		const providerChecks = [validatePolarLicenseKey]   // PAYRAM-EXCLUSIVE: credits settle via the PayRam ledger; Polar issues subscription keys
		for (const check of providerChecks) {
			try {
				const result = await check(key, provider)
				if (result) return result
			} catch (err) {
				return {
					ok: false,
					code: 'LICENSE_VALIDATION_UNAVAILABLE',
					message: `The license provider could not be reached or did not respond in time. Retry activation, or use a fresh cached entitlement if available. ${err?.message || err}`,
				}
			}
		}
		if (mode === 'auto' && !production) {
			const mock = validateMockLicenseKey(key, provider)
			if (mock) return mock
		}
	}

	if (!production && process.env.BETTERPPTX_DEV_ACCEPT_ANY_ACTIVATION_KEY === '1' && /^sk_(polar|payram|test)_/i.test(key)) {
		return { ok: true, plan: 'premium', provider, source: 'dev-accept-any-key', credits: 0, providerStatus: 'dev-valid' }
	}
	return {
		ok: false,
		code: 'INVALID_ACTIVATION_KEY',
		message: 'The activation key could not be verified. After a Polar subscription or PayRam credit purchase, use the exact key returned by checkout.',
	}
}

export function explainPlan() {
	return {
		product: 'BetterPPTX',
		billingProviders: ['polar', 'payram'],
		billingModel: 'hybrid subscription plus credit packs',
		free: {
			plan: 'free',
			included: [
				'three complete downloadable native-editable presentations per rolling 30-day window',
				'full authoring vocabulary with AI-owned geometry, style, timing, and composition',
				'up to three measured narration preparations per rolling window',
				'up to three consented custom talking-head generations per rolling window',
				'up to three experimental custom rigged-3D persona generations per rolling window',
				'option discovery',
				'package validation',
			],
			limits: {
				publicationsPerWindow: FREE_TIER_POLICY.publicationLimit,
				windowDays: FREE_TIER_POLICY.windowDays,
				narrationPreparationsPerWindow: FREE_TIER_POLICY.narrationPreparationLimit,
				identityMediaGenerationsPerFamily: FREE_TIER_POLICY.identityMediaLimit,
				creativeFeatureGate: FREE_TIER_POLICY.creativeFeatureGate,
				genericServerImageGeneration: 'retired; upload or provide AI-client-generated imagery instead',
			},
		},
		premium: {
			plan: 'premium',
			included: ['additional publications beyond the rolling free allowance', 'existing PPTX editing with the same full authoring vocabulary', 'larger production volume', 'no free watermark policy'],
			creativeFeatureGate: 'none',
		},
		starter: {
			plan: 'BetterPPTX Starter',
			priceUsd: 5,
			interval: 'month',
			includedCredits: 500,
			description: 'The monthly subscription grants 500 BetterPPTX credits that are directly usable as quota.',
		},
		credits: {
			plan: 'credits',
			topUpName: 'BetterPPTX Credit Top-Up',
			topUpPriceUsd: 5,
			topUpCredits: 500,
			description: 'Top-ups add credits to the same customer balance and can be used when the subscription quota is low.',
			overage: 'disabled',
		},
		activation: {
			tool: 'betterpptx.auth.activate_key',
			instruction: 'After Polar (subscription) or PayRam (crypto credits) checkout, paste the returned key in chat so the AI can call activate_key.',
		},
		...publicPlanUrls(),
	}
}

/**
 * Canonical public workflow-stage boundary.  This deliberately describes
 * entitlement separately from an estimate: a zero confirmation threshold is
 * not permission to spend, and a free draft is not a downloadable artifact.
 */
export function workflowStageEntitlements(context = {}) {
	const auth = getAuthState(context)
	const payPerJob = isPayPerJobEnabled()
	const designatedReleaseTest = !isProductionBillingEnvironment() && process.env.BETTERPPTX_RELEASE_TEST_ENTITLEMENT === '1'
	const settledJob = auth.source === 'settled-bounded-job'
	// BETTERPPTX_FORCE_PLAN/PREMIUM unlocks implementation coverage in a
	// non-production process; it is not customer payment permission and must not
	// be described as final-delivery authorization.
	const activatedCustomerEntitlement = auth.authenticated === true && auth.source !== 'environment' && !payPerJob
	const coveredDelivery = settledJob || designatedReleaseTest || activatedCustomerEntitlement
	return {
		schemaVersion: 'betterpptx.workflow-stage-entitlements.v1',
		billingModel: payPerJob ? 'pay_per_job' : 'credit_compatibility',
		currentAuthorization: {
			status: coveredDelivery ? 'covered' : 'not-covered',
			scope: settledJob ? 'one-settled-job' : designatedReleaseTest ? 'owner-authorized-release-test' : activatedCustomerEntitlement ? 'active-customer-entitlement' : 'free-drafting',
			plan: auth.plan || 'free',
		},
		freePreviewMeaning: `Full authoring and up to ${FREE_TIER_POLICY.publicationLimit} genuinely downloadable PPTX publications per rolling ${FREE_TIER_POLICY.windowDays}-day identity window. Re-download and exact idempotent replay do not consume another publication.`,
		stages: [
			{ id: 'learning', mutates: false, chargeable: false, authorization: 'none', output: 'capability guidance and executable lessons' },
			{ id: 'planning', mutates: false, chargeable: false, authorization: 'none', output: 'dry-run plan, quote, blockers, and expected deltas' },
			{ id: 'draft-commit', mutates: true, chargeable: false, authorization: 'free-boundary-or-active-entitlement', output: 'durable editable draft handle; not a delivery promise' },
			{ id: 'source-export', mutates: false, chargeable: false, authorization: 'artifact-owner', output: 'authored/effective/current semantic source where supported' },
			{ id: 'package-audit', mutates: false, chargeable: false, authorization: 'artifact-owner', output: 'deterministic package/native/timing evidence; no perceptual approval' },
			{ id: 'media-resolution', mutates: true, chargeable: 'conditional', authorization: 'secured-bounded-free-preparation-or-explicit-paid-entitlement', output: 'content-addressed prepared media; narration preparation, custom talking-head, and custom rigged-3D persona routes have separate bounded sponsored allowances' },
			{ id: 'final-save', mutates: true, chargeable: 'conditional', authorization: coveredDelivery ? 'covered-by-current-authorization' : 'rolling-free-publication-or-fresh-paid-entitlement', output: 'downloadable PPTX when save verification passes' },
			{ id: 'recovery', mutates: false, chargeable: false, authorization: 'original-artifact-or-operation-owner', output: 'existing operation result or reissued download within retention; no duplicate charge' },
		],
		principles: {
			confirmationRequiredIsPermission: false,
			oldQuoteIsBlankCheque: false,
			higherMaterializedCostRequires: 'new quote or an already-authorized cap that covers the exact materialized inputs',
			discoveryIsEntitlement: false,
		},
	}
}

function currentUsage(context = {}) {
	if (context.installHash) {
		const state = context.installState || {}
		if (!state.usage || state.date !== todayKey()) {
			state.date = todayKey()
			state.usage = { installHash: context.installHash, date: state.date, savedDecks: 0 }
		}
		context.installState = state
		return state.usage
	}
	const key = `${sessionKey(context)}:${todayKey()}`
	if (!sessionUsage.has(key)) sessionUsage.set(key, { savedDecks: 0 })
	return sessionUsage.get(key)
}

export function getAuthState(context = {}) {
	// A paid job execution is an internal, server-created authorization context
	// attached only after the x402 quote has settled.  It is not read from tool
	// arguments and therefore cannot be self-asserted by a public caller.  It
	// grants the already-paid job its premium execution path without creating a
	// reusable customer entitlement or credit balance.
	const paidJob = context.__paidJobAuthorization
	if (paidJob?.paymentModel === 'one_payment_per_job' && paidJob.settled === true
		&& paidJob.jobId && paidJob.quoteId) {
		return {
			authenticated: true,
			plan: 'premium',
			provider: 'x402_job_payment',
			source: 'settled-bounded-job',
			credits: null,
			billingModel: 'pay_per_job',
			jobId: String(paidJob.jobId),
			quoteId: String(paidJob.quoteId),
		}
	}
	if (!isProductionBillingEnvironment() && (process.env.BETTERPPTX_FORCE_PLAN === 'premium' || process.env.BETTERPPTX_PREMIUM === '1')) {
		return { authenticated: true, plan: 'premium', source: 'environment', credits: null }
	}
	const entitlement = sessionEntitlements.get(sessionKey(context))
	const usage = currentUsage(context)
	if (entitlement) {
		const hasCachePolicy = entitlement.cacheExpiresAt || entitlement.graceExpiresAt
		const cacheFresh = entitlement.cacheExpiresAt ? isFutureIso(entitlement.cacheExpiresAt) : true
		const graceFresh = entitlement.graceExpiresAt ? isFutureIso(entitlement.graceExpiresAt) : cacheFresh
		if (hasCachePolicy && !graceFresh) {
			return {
				authenticated: false,
				plan: 'free',
				source: 'cached-entitlement-expired',
				credits: 0,
				quota: quotaForPlan('free', usage, 0),
				...publicPlanUrls(),
				activation: {
					tool: 'betterpptx.auth.activate_key',
					instruction: 'The cached license validation expired. Paste the Polar or PayRam key again so the AI can revalidate it.',
				},
				policy: FREE_TIER_POLICY,
			}
		}
		return {
			authenticated: true,
			plan: entitlement.plan,
			provider: entitlement.provider,
			source: cacheFresh ? entitlement.source : `${entitlement.source}:grace`,
			credits: entitlement.credits ?? 0,
			activatedAt: entitlement.activatedAt,
			keyFingerprint: entitlement.keyFingerprint,
			cache: hasCachePolicy ? {
				status: cacheFresh ? 'fresh' : 'grace',
				expiresAt: entitlement.cacheExpiresAt || null,
				graceExpiresAt: entitlement.graceExpiresAt || null,
			} : undefined,
			quota: quotaForPlan(entitlement.plan, usage, entitlement.credits),
		}
	}
	const installEntitlement = context.installState?.billingEntitlement
	if (installEntitlement && Number(installEntitlement.credits || 0) > 0) {
		return {
			authenticated: true,
			plan: 'credits',
			provider: 'crypto_credits',
			source: 'anonymous-install-credits',
			credits: Number(installEntitlement.credits || 0),
			quota: quotaForPlan('credits', usage, installEntitlement.credits),
		}
	}
	if (context.authenticated === true && context.installHash) {
		return {
			authenticated: true,
			plan: 'free',
			provider: context.authenticationBasis || 'verified-account',
			source: 'verified-account-free',
			credits: 0,
			quota: quotaForPlan('free', usage, 0),
			policy: FREE_TIER_POLICY,
			...publicPlanUrls(),
		}
	}
	return {
		authenticated: false,
		plan: 'free',
		source: context.installHash ? 'anonymous-install' : 'anonymous-session',
		credits: 0,
		quota: quotaForPlan('free', usage, 0),
		...publicPlanUrls(),
		activation: {
			tool: 'betterpptx.auth.activate_key',
			instruction: 'Paste the Polar or PayRam key after checkout. The AI can call activate_key and retry the premium request.',
		},
		policy: FREE_TIER_POLICY,
	}
}

export function getBillingEntitlement(context = {}) {
	const entitlement = sessionEntitlements.get(sessionKey(context))
	const installEntitlement = context.installState?.billingEntitlement
	if (!entitlement && installEntitlement) return { ...installEntitlement }
	if (!entitlement) return null
	return {
		plan: entitlement.plan,
		provider: entitlement.provider,
		keyFingerprint: entitlement.keyFingerprint,
		providerCustomerId: entitlement.providerCustomerId || null,
		providerProductId: entitlement.providerProductId || null,
		providerSubscriptionId: entitlement.providerSubscriptionId || null,
		providerPaymentId: entitlement.providerPaymentId || null,
		providerLicenseId: entitlement.providerLicenseId || null,
		creditEntitlementId: entitlement.creditEntitlementId || null,
		lastKnownCreditBalance: entitlement.lastKnownCreditBalance ?? null,
		lastBalanceSyncedAt: entitlement.lastBalanceSyncedAt || null,
		billingCustomerHash: entitlement.billingCustomerHash || null,
		billingStatus: entitlement.billingStatus || null,
	}
}

function quotaForPlan(plan, usage, credits = 0) {
	if (plan === 'premium') return { publicationsRemaining: null, windowDays: FREE_TIER_POLICY.windowDays, credits }
	return {
		publicationLimit: FREE_TIER_POLICY.publicationLimit,
		windowDays: FREE_TIER_POLICY.windowDays,
		usageStatus: 'resolved atomically when a value-producing operation is reserved',
		credits,
		aiGuidance: 'Author freely. Before final save, BetterPPTX atomically reserves one of three rolling free publication slots; exact replay and re-download do not consume another slot.',
	}
}

export async function activateKey(args = {}, context = {}) {
	const key = String(args.key || args.licenseKey || args.apiKey || '').trim()
	const provider = providerFromKey(key, args.provider)
	if (!key) return entitlementFailure('INVALID_ACTIVATION_KEY', 'activation', 'No activation key was provided.')
	const validation = await validateActivationKey(key, provider)
	if (!validation.ok) return entitlementFailure(validation.code, 'activation', validation.message, { provider, received: redactKey(key) })
	const fingerprint = keyHash(key)
	const previous = await getPersistedKeyState(fingerprint) || {}
	let billingMapping = null
	const cacheTtl = validation.source === 'validation-cache'
		? Math.max(0, Date.parse(previous?.cacheExpiresAt || '') - Date.now())
		: licenseCacheTtlMs()
	const effectiveProvider = validation.provider || provider
	const persisted = await persistKeyState(fingerprint, {
		plan: validation.plan === 'credits' ? 'credits' : 'premium',
		provider: effectiveProvider,
		source: validation.source,
		credits: validation.plan === 'credits'
			? Number.isFinite(Number(previous?.credits)) ? Math.max(0, Number(previous.credits)) : validation.credits || 0
			: 0,
		initialCredits: validation.plan === 'credits'
			? Number.isFinite(Number(previous?.initialCredits)) ? Math.max(0, Number(previous.initialCredits)) : validation.credits || 0
			: 0,
		providerStatus: validation.providerStatus || 'valid',
		providerCustomerId: billingMapping?.providerCustomerId || validation.providerCustomerId || previous?.providerCustomerId || null,
		providerProductId: billingMapping?.providerProductId || validation.providerProductId || previous?.providerProductId || null,
		providerSubscriptionId: billingMapping?.providerSubscriptionId || validation.providerSubscriptionId || previous?.providerSubscriptionId || null,
		providerPaymentId: billingMapping?.providerPaymentId || validation.providerPaymentId || previous?.providerPaymentId || null,
		providerLicenseId: billingMapping?.providerLicenseId || validation.providerLicenseId || previous?.providerLicenseId || null,
		creditEntitlementId: billingMapping?.creditEntitlementId || validation.creditEntitlementId || previous?.creditEntitlementId || null,
		lastKnownCreditBalance: billingMapping?.lastKnownCreditBalance ?? validation.lastKnownCreditBalance ?? previous?.lastKnownCreditBalance ?? null,
		lastBalanceSyncedAt: billingMapping?.lastBalanceSyncedAt || validation.lastBalanceSyncedAt || previous?.lastBalanceSyncedAt || null,
		billingCustomerHash: billingMapping?.billingCustomerHash || validation.billingCustomerHash || previous?.billingCustomerHash || null,
		billingStatus: billingMapping?.billingStatus || validation.billingStatus || previous?.billingStatus || null,
		billingMappedAt: billingMapping?.billingMappedAt || previous?.billingMappedAt || null,
		billingMappingSource: billingMapping?.billingMappingSource || previous?.billingMappingSource || null,
		expiresAt: validation.expiresAt || previous?.expiresAt || null,
		validatedAt: validation.cached ? previous?.validatedAt || new Date().toISOString() : new Date().toISOString(),
		cacheExpiresAt: validation.cached ? previous?.cacheExpiresAt || addMsIso(cacheTtl) : addMsIso(cacheTtl),
		graceExpiresAt: validation.cached ? previous?.graceExpiresAt || addMsIso(cacheTtl + licenseGraceMs()) : addMsIso(cacheTtl + licenseGraceMs()),
		lastActivatedAt: new Date().toISOString(),
	})
	const entitlement = {
		plan: persisted.plan,
		provider: persisted.provider,
		source: persisted.source,
		credits: persisted.credits || 0,
		activatedAt: new Date().toISOString(),
		keyFingerprint: fingerprint,
		providerCustomerId: persisted.providerCustomerId || null,
		providerProductId: persisted.providerProductId || null,
		providerSubscriptionId: persisted.providerSubscriptionId || null,
		providerPaymentId: persisted.providerPaymentId || null,
		providerLicenseId: persisted.providerLicenseId || null,
		creditEntitlementId: persisted.creditEntitlementId || null,
		lastKnownCreditBalance: persisted.lastKnownCreditBalance ?? null,
		lastBalanceSyncedAt: persisted.lastBalanceSyncedAt || null,
		billingCustomerHash: persisted.billingCustomerHash || null,
		billingStatus: persisted.billingStatus || null,
		cacheExpiresAt: persisted.cacheExpiresAt,
		graceExpiresAt: persisted.graceExpiresAt,
	}
	sessionEntitlements.set(sessionKey(context), entitlement)
	return {
		activated: true,
		status: entitlement.plan === 'premium' ? 'premium_active' : 'credits_active',
		provider: effectiveProvider,
		plan: entitlement.plan,
		credits: entitlement.credits,
		keyFingerprint: entitlement.keyFingerprint,
		source: entitlement.source,
		billingStatus: entitlement.billingStatus || undefined,
		hasBillingCustomer: Boolean(entitlement.billingCustomerHash),
		cache: {
			status: validation.cached ? 'hit' : 'refreshed',
			expiresAt: entitlement.cacheExpiresAt,
			graceExpiresAt: entitlement.graceExpiresAt,
		},
		message: entitlement.plan === 'premium'
			? 'Premium is active for this MCP session. Retry the requested premium presentation step.'
			: `Credit activation succeeded with ${entitlement.credits} premium credit(s). Retry the requested premium presentation step.`,
		policy: FREE_TIER_POLICY,
	}
}

function featureMetadata(feature) {
	const labels = {
		gradient: 'gradients',
		animation: 'animations',
		transition: 'transitions',
		media: 'audio/video media',
		model3d: '3D models',
		narration: 'narration/TTS',
		avatar: 'avatar narration video',
		wordArt: 'WordArt',
		text3D: 'Text3D',
		duplicate: 'slide duplication',
		open_existing: 'existing PPTX editing',
		quota: 'rolling publication/provider quota',
		slide_limit: 'legacy slide-limit request (creative slide limits are deactivated)',
		preview_transition: 'legacy preview-transition request (Morph is optional)',
	}
	return {
		feature,
		label: labels[feature] || feature,
		requiredPlan: feature === 'quota' ? 'available rolling allowance or explicit paid entitlement' : 'provider-specific entitlement when applicable',
		...publicPlanUrls(feature),
		activationTool: 'betterpptx.auth.activate_key',
		creativeFeatureGate: 'none',
	}
}

function entitlementFailure(code, feature, message, extra = {}) {
	const retryAfterAuth = code === 'REQUIRES_UPGRADE' || code === 'QUOTA_EXCEEDED' || code === 'INSUFFICIENT_CREDITS' || code === 'REQUIRES_AUTH'
	return {
		ok: false,
		error: {
			code,
			message,
			details: {
				status: code === 'REQUIRES_UPGRADE' ? 'upgrade_required'
					: code === 'REQUIRES_AUTH' ? 'auth_required'
					: code === 'QUOTA_EXCEEDED' ? 'quota_exceeded'
					: code === 'INSUFFICIENT_CREDITS' ? 'insufficient_credits'
					: code === 'INVALID_PREMIUM_PREVIEW_TRANSITION' ? 'authoring_correction_required'
					: 'activation_failed',
				...featureMetadata(feature),
				retryAfterAuth,
				...extra,
			},
		},
	}
}

function containsKey(value, names) {
	if (!value || typeof value !== 'object') return false
	if (Array.isArray(value)) return value.some(item => containsKey(item, names))
	for (const [key, child] of Object.entries(value)) {
		if (names.has(key)) return true
		if (containsKey(child, names)) return true
	}
	return false
}

function hasGradient(value) {
	if (!value || typeof value !== 'object') return false
	if (Array.isArray(value)) return value.some(hasGradient)
	for (const [key, child] of Object.entries(value)) {
		if (/^gradient/.test(key)) return true
		if (key === 'type' && String(child).toLowerCase() === 'gradient') return true
		if (hasGradient(child)) return true
	}
	return false
}

// Single traversal replacing one hasGradient walk plus four containsKey walks
// per operation; feature priority is applied by the caller, so collecting all
// flags in one pass returns identical results.
function collectPremiumFeatureFlags(value, flags) {
	if (!value || typeof value !== 'object') return flags
	if (Array.isArray(value)) {
		for (const item of value) collectPremiumFeatureFlags(item, flags)
		return flags
	}
	for (const [key, child] of Object.entries(value)) {
		if (!flags.gradient && (/^gradient/.test(key) || (key === 'type' && String(child).toLowerCase() === 'gradient'))) flags.gradient = true
		if (!flags.wordArt && key === 'wordArt') flags.wordArt = true
		if (!flags.text3D && key === 'text3D') flags.text3D = true
		if (!flags.animation && (key === 'animation' || key === 'animations' || key === 'motionPath')) flags.animation = true
		if (!flags.transition && (key === 'transition' || key === 'transitions' || key === 'variants')) flags.transition = true
		collectPremiumFeatureFlags(child, flags)
	}
	return flags
}

function standalonePremiumFeature(name) {
	if (name === 'betterpptx.narration.synthesize') return 'narration'
	if (name === 'betterpptx.avatar.render_job' || name === 'betterpptx.slide.add_avatar_narration' || name === 'betterpptx.deck.add_avatar_narration') return 'avatar'
	if (name === 'betterpptx.assets.generate_rigged3d') return 'model3d'
	return null
}

function requestedPremiumFeature(name, args = {}) {
	if (name === 'betterpptx.slide.add_model3d') return 'model3d'
	if (name === 'betterpptx.slide.add_media') return 'media'
	if (name === 'betterpptx.deck.add_narration' || name === 'betterpptx.slide.add_narration') return 'narration'
	if (name === 'betterpptx.avatar.render_job' || name === 'betterpptx.slide.add_avatar_narration' || name === 'betterpptx.deck.add_avatar_narration') return 'avatar'
	if (name === 'betterpptx.slide.animate_shapes') return 'animation'
	if (name === 'betterpptx.deck.autoplay' || name === 'betterpptx.deck.set_transitions_all' || name === 'betterpptx.slide.set_transition') return 'transition'
	const featureFlags = collectPremiumFeatureFlags(args, { gradient: false, wordArt: false, text3D: false, animation: false, transition: false })
	if (featureFlags.gradient) return 'gradient'
	if (featureFlags.wordArt) return 'wordArt'
	if (featureFlags.text3D) return 'text3D'
	if (featureFlags.animation) return 'animation'
	if (featureFlags.transition) return 'transition'
	if (name === 'betterpptx.deck.set_show_settings' && (args.showAnimation || args.showNarration)) return args.showNarration ? 'narration' : 'animation'
	return null
}

function slideIndex(value) {
	const n = Number(value)
	return Number.isInteger(n) && n >= 0 ? n : null
}

function deckSlideCount(args = {}, helpers = {}) {
	const n = helpers.deckSlideCount ? helpers.deckSlideCount(args.deckId) : null
	return Number.isInteger(n) && n >= 0 ? n : null
}

function collectDeckSlideIndexes(args = {}, helpers = {}) {
	const count = deckSlideCount(args, helpers)
	if (!count) return []
	return Array.from({ length: count }, (_, i) => i)
}

function collectOperationSlideIndexes(name, args = {}, helpers = {}) {
	const indexes = []
	const push = value => {
		const n = slideIndex(value)
		if (n !== null) indexes.push(n)
	}
	push(args.slideIndex)
	if (Array.isArray(args.slideIndexes)) args.slideIndexes.forEach(push)
	if (Array.isArray(args.slideRange)) args.slideRange.forEach(push)
	if (Array.isArray(args.filter?.slideRange)) args.filter.slideRange.forEach(push)

	if (name === 'betterpptx.slide.add') {
		const count = deckSlideCount(args, helpers)
		if (count !== null) indexes.push(count)
	}
	if (name === 'betterpptx.slide.duplicate') {
		const count = deckSlideCount(args, helpers)
		const copies = Math.max(1, Number(args.count) || 1)
		if (count !== null) {
			for (let i = 0; i < copies; i++) indexes.push(count + i)
		}
	}
	if (name === 'betterpptx.slide.reorder') {
		push(args.fromIndex)
		push(args.toIndex)
		if (Array.isArray(args.order)) args.order.forEach(push)
	}
	if (name === 'betterpptx.deck.add_narration' && Array.isArray(args.slides)) {
		for (const item of args.slides) push(item?.slideIndex)
	}
	if (name === 'betterpptx.deck.set_transitions_all' || name === 'betterpptx.deck.autoplay' || name === 'betterpptx.deck.set_show_settings') {
		indexes.push(...collectDeckSlideIndexes(args, helpers))
	}
	if (name === 'betterpptx.deck.transform_shapes' && !Array.isArray(args.filter?.slideRange)) {
		indexes.push(...collectDeckSlideIndexes(args, helpers))
	}
	return [...new Set(indexes)].sort((a, b) => a - b)
}

export function requireEntitlement(name, args = {}, context = {}, helpers = {}) {
	if (name.startsWith('betterpptx.auth.') || name.startsWith('betterpptx.billing.')) return null
	const state = getAuthState(context)
	const hasCredits = state.plan === 'credits' && Number(state.credits || 0) > 0
	if (state.plan === 'premium' || hasCredits) return null
	if (name === 'betterpptx.assets.generate_rigged3d' && (!Array.isArray(args.imageHandles) || args.imageHandles.length < 2)) {
		return entitlementFailure('REQUIRES_PAID_ENTITLEMENT', 'model3d', 'The sponsored custom 3D persona route requires two to four authorized multiview body-image handles. Prompt-only or single-view generation is outside the free identity-media allowance.', {
			currentPlan: state.plan,
			sponsoredRoute: { imageHandles: { minItems: 2, maxItems: 4 }, experimentalConfirmed: true },
		})
	}
	// Free authoring is capability-complete. Scarce value is controlled at the
	// publication/provider boundary by the atomic rolling ledger below, not by
	// rewriting the AI's slides, geometry, timing, or feature selection.
	return null
}

function rollingIdentity(context = {}) {
	return String(context.installHash || context.quotaIdentityHash || '').trim()
}

function freeValuePolicyForTool(name, args = {}, { purpose = 'execution' } = {}) {
	if (name === 'betterpptx.deck.save') return {
		category: 'deck-publication',
		limit: FREE_TIER_POLICY.publicationLimit,
		workflowStage: 'final-save',
		accountingTool: 'betterpptx.deck.save',
		reservationTiming: 'on-successful-save',
	}
	// A spec estimate is the canonical quote for compiled authoring plus final
	// save/delivery.  It therefore reports the same publication allowance as
	// deck.save, while execution accounting remains attached only to deck.save.
	// This distinction prevents read-only estimates or draft commits from
	// reserving/consuming a publication slot.
	if (purpose === 'estimate'
		&& name === 'betterpptx.deck.generate_from_spec'
		&& args?.spec && typeof args.spec === 'object' && !Array.isArray(args.spec)) return {
		category: 'deck-publication',
		limit: FREE_TIER_POLICY.publicationLimit,
		workflowStage: 'final-save',
		accountingTool: 'betterpptx.deck.save',
		reservationTiming: 'on-successful-save',
		classificationBasis: 'compiled-spec-plus-final-save-quote',
	}
	if (name === 'betterpptx.narration.synthesize') return {
		category: 'narration-preparation',
		limit: FREE_TIER_POLICY.narrationPreparationLimit,
		workflowStage: 'media-resolution',
		accountingTool: name,
		reservationTiming: 'on-successful-preparation',
	}
	if (name === 'betterpptx.avatar.render_job') return {
		category: 'talking-head-generation',
		limit: FREE_TIER_POLICY.identityMediaLimit,
		workflowStage: 'media-resolution',
		accountingTool: name,
		reservationTiming: 'on-provider-execution',
	}
	if (name === 'betterpptx.assets.generate_rigged3d' && Array.isArray(args.imageHandles) && args.imageHandles.length >= 2) return {
		category: 'rigged3d-persona-generation',
		limit: FREE_TIER_POLICY.identityMediaLimit,
		workflowStage: 'media-resolution',
		accountingTool: name,
		reservationTiming: 'on-provider-execution',
	}
	return null
}

function freeValueError(code, message, details = {}) {
	const error = new Error(message)
	error.code = code
	error.retryable = false
	error.details = details
	return error
}

export async function reserveFreeValue(name, args = {}, context = {}) {
	const policy = freeValuePolicyForTool(name, args)
	if (!policy) return null
	if (process.env.BETTERPPTX_PUBLIC_BLACK_BOX !== '1' && process.env.BETTERPPTX_REQUIRE_FREE_VALUE_IDENTITY !== '1') return null
	const auth = getAuthState(context)
	const hasPaidEntitlement = (auth.plan === 'premium' || auth.plan === 'credits') && auth.source !== 'environment'
	if (hasPaidEntitlement || auth.source === 'settled-bounded-job') return null
	const identityHash = rollingIdentity(context)
	if (!identityHash) {
		throw freeValueError('FREE_VALUE_IDENTITY_REQUIRED', 'A secured installation or supported connector identity is required for the free publication and identity-media allowance.', {
			category: policy.category,
			resolution: 'Use the official BetterPPTX connector/installation identity, or activate a paid entitlement.',
		})
	}
	const reservationId = String(args.idempotencyKey || args.idempotency_key || '').trim()
	if (!reservationId) throw freeValueError('IDEMPOTENCY_KEY_REQUIRED', 'This free value-producing operation requires an idempotencyKey.')
	// A key alone is not proof of an exact replay. The durable-operation ledger
	// rejects key conflicts when enabled, but quota must also protect fallback
	// execution (including different decks with independent replay caches).
	// Only omit the top-level key aliases; identically named authored fields
	// inside a spec remain part of the request. Do not adopt legacy unbound IDs.
	const requestArgs = Object.fromEntries(Object.entries(args).filter(([key]) => key !== 'idempotencyKey' && key !== 'idempotency_key'))
	const requestDigest = digestOperationPayload({ tool: name, idempotencyKey: reservationId, args: requestArgs })
	const request = {
		category: policy.category,
		reservationId: `free-value.v2:${requestDigest}`,
		limit: policy.limit,
		windowMs: FREE_WINDOW_MS(),
		leaseMs: FREE_RESERVATION_LEASE_MS(),
	}
	const result = await currentInstallUsageStore().reserveRollingUsage(identityHash, request)
	if (!result.ok) {
		throw freeValueError('FREE_VALUE_QUOTA_EXHAUSTED', `The free ${policy.category} allowance is exhausted for the current rolling window.`, {
			...result,
			paidAlternative: publicPlanUrls(policy.category),
			noChargeOrArtifactCreated: true,
		})
	}
	return { identityHash, request, status: result.status, snapshot: result }
}

export async function commitFreeValue(reservation, metadata = {}) {
	if (!reservation) return null
	return currentInstallUsageStore().commitRollingUsage(reservation.identityHash, {
		...reservation.request,
		metadata,
	})
}

export async function releaseFreeValue(reservation) {
	if (!reservation) return null
	return currentInstallUsageStore().releaseRollingUsage(reservation.identityHash, reservation.request)
}

export async function getFreeValueStatus(name, args = {}, context = {}, options = {}) {
	const policy = freeValuePolicyForTool(name, args, options)
	if (!policy) return { eligible: false, reason: 'not-a-sponsored-value-route' }
	const route = {
		workflowStage: policy.workflowStage,
		accountingTool: policy.accountingTool,
		reservationTiming: policy.reservationTiming,
		...(policy.classificationBasis ? { classificationBasis: policy.classificationBasis } : {}),
	}
	const auth = getAuthState(context)
	const hasPaidEntitlement = (auth.plan === 'premium' || auth.plan === 'credits') && auth.source !== 'environment'
	if (hasPaidEntitlement || auth.source === 'settled-bounded-job') return { eligible: false, reason: 'covered-by-paid-entitlement', category: policy.category, route }
	const identityHash = rollingIdentity(context)
	if (!identityHash) return { eligible: false, reason: 'secured-identity-required', category: policy.category, limit: policy.limit, windowDays: FREE_TIER_POLICY.windowDays, route }
	const snapshot = await currentInstallUsageStore().getRollingUsage(identityHash, {
		category: policy.category,
		limit: policy.limit,
		windowMs: FREE_WINDOW_MS(),
	})
	return {
		eligible: snapshot.remaining > 0,
		reason: snapshot.remaining > 0 ? 'bounded-free-allowance-available' : 'bounded-free-allowance-exhausted',
		...snapshot,
		route,
	}
}

export async function recordSuccessfulUse(name, context = {}) {
	// Rolling free-value accounting is committed transactionally by the engine.
	// Keep this hook for legacy paid-credit accounting only.
	if (name !== 'betterpptx.deck.save') return
	const state = getAuthState(context)
	if (state.plan !== 'credits' || state.provider === 'crypto_credits') return
	if (state.plan === 'credits') {
		const entitlement = sessionEntitlements.get(sessionKey(context))
		if (entitlement && entitlement.credits > 0) {
			entitlement.credits -= 1
			const persisted = entitlement.keyFingerprint ? await getPersistedKeyState(entitlement.keyFingerprint) : null
			if (persisted) {
				await persistKeyState(entitlement.keyFingerprint, { credits: entitlement.credits })
			}
		}
	}
}
