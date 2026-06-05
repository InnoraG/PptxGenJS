import * as crypto from 'node:crypto'
import { createEntitlementStore } from './entitlement-store.mjs'
import {
	dodoActivationNeedsCustomerMapping,
	extractDodoBillingIds,
	resolveDodoBillingCustomerForActivation,
} from '../billing/customer-map.mjs'
import { hashCustomerId } from '../billing/ledger-store.mjs'

const DEFAULT_PRICING_URL = 'https://betterpptx.com/pricing'

export const FREE_TIER_POLICY = {
	plan: 'free',
	maxDecksPerDay: Number(process.env.BETTERPPTX_FREE_DECKS_PER_DAY || 3),
	premiumPreviewSlides: Number(process.env.BETTERPPTX_FREE_PREVIEW_SLIDES || 2),
	gateStartsAfterSlide: Number(process.env.BETTERPPTX_FREE_PREVIEW_SLIDES || 2),
	previewFeatures: ['gradients', 'animations', 'transitions', '3D models', 'narration/TTS', 'Text3D', 'WordArt', 'charts', 'tables', 'SmartArt'],
	organizedMorphGuidance: {
		enforcement: 'gentle',
		principle: 'Slides 1 and 2 should progress the user story normally. Morph is an accessory transition and formatting layer, not a requirement to duplicate slide content or add showcase-only objects.',
		preferredObjectKinds: ['text boxes', 'shapes', 'images', 'WordArt', 'Text3D', '3D models/GLB', 'shape-built SmartArt'],
		advice: 'Use stable objectName values for related existing objects that should morph between slide 1 and slide 2. Prefer text boxes, shapes, images, WordArt, Text3D, 3D models/GLB, and shape-built SmartArt only when they naturally serve the deck. For uploaded or existing decks, do not add banners, badges, 3D, WordArt, Text3D, SmartArt, charts, or decorative panels merely to satisfy preview coverage.',
	},
	premiumMorphPattern: {
		slideCount: 2,
		baseSlide: 1,
		morphSlide: 2,
		transition: { type: 'morph', option: 'byObject' },
		description: 'Premium preview uses an organized Morph-by-object transition into slide 2 while preserving normal story progression; slide duplication is optional, not required.',
	},
}

const sessionEntitlements = new Map()
const sessionUsage = new Map()
const entitlementStore = createEntitlementStore()

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
	return String(context.sessionId || 'stdio-default')
}

function todayKey() {
	return new Date().toISOString().slice(0, 10)
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
	const requested = String(explicit || 'auto').toLowerCase()
	if (requested === 'polar' || requested === 'dodo') return requested
	if (/polar/i.test(key)) return 'polar'
	if (/dodo/i.test(key)) return 'dodo'
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
	const mockDodoCustomerId = String(provider || '').toLowerCase() === 'dodo' ? String(process.env.BETTERPPTX_MOCK_DODO_CUSTOMER_ID || '').trim() : ''
	return {
		ok: true,
		plan: String(match.plan).toLowerCase() === 'credits' ? 'credits' : 'premium',
		provider,
		source: 'mock-provider',
		credits: Math.max(0, Number(match.credits) || 0),
		providerStatus: 'valid',
		...(mockDodoCustomerId ? {
			providerCustomerId: mockDodoCustomerId,
			creditEntitlementId: process.env.BETTERPPTX_DODO_CREDIT_ENTITLEMENT_ID || null,
			billingCustomerHash: hashCustomerId(mockDodoCustomerId),
			billingStatus: 'active',
			lastKnownCreditBalance: Number(process.env.BETTERPPTX_MOCK_DODO_CREDIT_BALANCE || 0),
			lastBalanceSyncedAt: new Date().toISOString(),
		} : {}),
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

async function validateDodoLicenseKey(key, provider) {
	const shouldTry = provider === 'dodo' || process.env.BETTERPPTX_DODO_VALIDATE_URL || process.env.DODO_PAYMENTS_API_KEY || process.env.BETTERPPTX_DODO_API_KEY
	if (!shouldTry) return null
	const url = process.env.BETTERPPTX_DODO_VALIDATE_URL || 'https://api.dodopayments.com/licenses/validate'
	const headers = {}
	const token = process.env.DODO_PAYMENTS_API_KEY || process.env.BETTERPPTX_DODO_API_KEY
	if (token) headers.Authorization = `Bearer ${token}`
	const response = await fetchJson(url, {
		headers,
		body: { license_key: key },
		timeoutMs: process.env.BETTERPPTX_LICENSE_VALIDATE_TIMEOUT_MS,
	})
	if (!response.ok) {
		return {
			ok: false,
			code: response.status === 404 ? 'INVALID_ACTIVATION_KEY' : 'LICENSE_VALIDATION_FAILED',
			message: response.status === 404
				? 'The Dodo license key could not be found.'
				: `Dodo license validation failed with HTTP ${response.status}.`,
		}
	}
	const data = response.data || {}
	if (data.valid === false) return { ok: false, code: 'LICENSE_REVOKED', message: 'Dodo reported this license key as invalid.' }
	const localTestCustomerId = key === process.env.BETTERPPTX_VERIFY_ACTIVATION_KEY ? String(process.env.BETTERPPTX_DODO_TEST_CUSTOMER_ID || '').trim() : ''
	const localTestLicenseId = key === process.env.BETTERPPTX_VERIFY_ACTIVATION_KEY ? String(process.env.BETTERPPTX_DODO_TEST_LICENSE_ID || '').trim() : ''
	const fallbackLicenseId = data.license_key_id || data.id || localTestLicenseId || null
	const billingIds = extractDodoBillingIds({ providerData: data, providerLicenseId: fallbackLicenseId })
	return {
		ok: true,
		plan: 'premium',
		provider: 'dodo',
		source: 'dodo-api',
		credits: 0,
		providerStatus: data.valid === true ? 'valid' : 'accepted',
		...billingIds,
		providerLicenseId: billingIds.providerLicenseId || fallbackLicenseId,
		...(localTestCustomerId && !billingIds.providerCustomerId ? {
			providerCustomerId: localTestCustomerId,
			billingCustomerHash: hashCustomerId(localTestCustomerId),
			creditEntitlementId: process.env.BETTERPPTX_DODO_CREDIT_ENTITLEMENT_ID || process.env.BETTERPPTX_DODO_TEST_CREDIT_ENTITLEMENT_ID || null,
			lastKnownCreditBalance: null,
		} : {}),
		providerData: data,
	}
}

async function validateActivationKey(key, provider) {
	const mode = licenseValidationMode()
	if (mode !== 'no-cache') {
		const cached = await cachedValidationForKey(key)
		if (cached) return cached
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
		const providerChecks = provider === 'polar'
			? [validatePolarLicenseKey]
			: provider === 'dodo'
				? [validateDodoLicenseKey]
				: [validatePolarLicenseKey, validateDodoLicenseKey]
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
		if (mode === 'auto') {
			const mock = validateMockLicenseKey(key, provider)
			if (mock) return mock
		}
	}

	if (process.env.BETTERPPTX_DEV_ACCEPT_ANY_ACTIVATION_KEY === '1' && /^sk_(polar|dodo|test)_/i.test(key)) {
		return { ok: true, plan: 'premium', provider, source: 'dev-accept-any-key', credits: 0, providerStatus: 'dev-valid' }
	}
	return {
		ok: false,
		code: 'INVALID_ACTIVATION_KEY',
		message: 'The activation key could not be verified. After Polar or Dodo purchase, use the exact subscription or credit key returned by checkout.',
	}
}

export function explainPlan() {
	return {
		product: 'BetterPPTX',
		billingProviders: ['polar', 'dodo'],
		billingModel: 'hybrid subscription plus credit packs',
		free: {
			plan: 'free',
			included: [
				'two-slide premium preview',
				'gradients, animations, transitions, 3D, and narration on slides 1-2',
				'basic slide creation and basic edits beyond slide 2',
				'organized Morph-by-object transition into slide 2',
				'option discovery',
				'package validation',
			],
			limits: {
				decksPerDay: FREE_TIER_POLICY.maxDecksPerDay,
				premiumPreviewSlides: FREE_TIER_POLICY.premiumPreviewSlides,
				premiumFeatureGateStartsAfterSlide: FREE_TIER_POLICY.gateStartsAfterSlide,
				previewFeatures: FREE_TIER_POLICY.previewFeatures,
				organizedMorphGuidance: FREE_TIER_POLICY.organizedMorphGuidance,
				requiredSlide2Transition: FREE_TIER_POLICY.premiumMorphPattern.transition,
			},
		},
		premium: {
			plan: 'premium',
			included: ['premium features beyond slide 2', 'existing PPTX editing with full-deck premium features', 'larger showcase decks', 'full-deck narration/motion/3D workflows', 'no free watermark policy'],
			transitionPattern: FREE_TIER_POLICY.premiumMorphPattern,
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
			instruction: 'After Polar or Dodo checkout, paste the returned key in chat so the AI can call activate_key.',
		},
		...publicPlanUrls(),
	}
}

function currentUsage(context = {}) {
	const key = `${sessionKey(context)}:${todayKey()}`
	if (!sessionUsage.has(key)) sessionUsage.set(key, { savedDecks: 0 })
	return sessionUsage.get(key)
}

export function getAuthState(context = {}) {
	if (process.env.BETTERPPTX_FORCE_PLAN === 'premium' || process.env.BETTERPPTX_PREMIUM === '1') {
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
					instruction: 'The cached license validation expired. Paste the Polar or Dodo key again so the AI can revalidate it.',
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
	return {
		authenticated: false,
		plan: 'free',
		source: 'anonymous-session',
		credits: 0,
		quota: quotaForPlan('free', usage, 0),
		...publicPlanUrls(),
		activation: {
			tool: 'betterpptx.auth.activate_key',
			instruction: 'Paste the Polar or Dodo key after checkout. The AI can call activate_key and retry the premium request.',
		},
		policy: FREE_TIER_POLICY,
	}
}

export function getBillingEntitlement(context = {}) {
	const entitlement = sessionEntitlements.get(sessionKey(context))
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
	if (plan === 'premium') return { decksRemainingToday: null, premiumPreviewSlides: null, credits }
	const savedDecksToday = Math.max(0, Number(usage?.savedDecks || 0))
	const decksRemainingToday = Math.max(0, FREE_TIER_POLICY.maxDecksPerDay - savedDecksToday)
	return {
		maxDecksPerDay: FREE_TIER_POLICY.maxDecksPerDay,
		savedDecksToday,
		decksRemainingToday,
		resetsAt: nextUtcMidnightIso(),
		resetWindow: 'UTC calendar day',
		premiumPreviewSlides: FREE_TIER_POLICY.premiumPreviewSlides,
		gateStartsAfterSlide: FREE_TIER_POLICY.gateStartsAfterSlide,
		credits,
		aiGuidance: decksRemainingToday <= 0
			? 'Free save quota is exhausted. Explain the limit and call betterpptx.billing.portal if the user wants to continue today.'
			: decksRemainingToday === 1
				? 'One free deck save remains today. Validate before saving and tell the user premium or credits avoid the daily cap.'
				: 'Free saves remain today. Continue normally, but validate before deck.save.',
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
	if (dodoActivationNeedsCustomerMapping(validation, previous)) {
		billingMapping = await resolveDodoBillingCustomerForActivation({ validation, previous, keyFingerprint: fingerprint })
		if (!billingMapping.ok) {
			return entitlementFailure(billingMapping.code || 'BILLING_SETUP_INCOMPLETE', 'activation', billingMapping.message || 'Billing setup is incomplete.', {
				provider: 'dodo',
				retrySafe: true,
				...(billingMapping.details ? { billing: billingMapping.details } : {}),
			})
		}
	}
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
		model3d: '3D models',
		narration: 'narration/TTS',
		wordArt: 'WordArt',
		text3D: 'Text3D',
		duplicate: 'premium slide duplication',
		open_existing: 'existing PPTX editing',
		quota: 'free quota',
		slide_limit: 'premium features beyond the two-slide preview',
		preview_transition: 'slide 2 Morph transition',
	}
	const correctionOnly = feature === 'preview_transition'
	return {
		feature,
		label: labels[feature] || feature,
		requiredPlan: correctionOnly ? 'free preview authoring correction' : (feature === 'quota' || feature === 'slide_limit' ? 'credits or premium' : 'premium'),
		...publicPlanUrls(feature),
		activationTool: 'betterpptx.auth.activate_key',
		premiumMorphPattern: feature === 'transition' || feature === 'preview_transition' || feature === 'slide_limit' ? FREE_TIER_POLICY.premiumMorphPattern : undefined,
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

function standalonePremiumFeature(name) {
	if (name === 'betterpptx.narration.synthesize') return 'narration'
	return null
}

function requestedPremiumFeature(name, args = {}) {
	if (name === 'betterpptx.slide.add_model3d') return 'model3d'
	if (name === 'betterpptx.deck.add_narration' || name === 'betterpptx.slide.add_narration') return 'narration'
	if (name === 'betterpptx.slide.animate_shapes') return 'animation'
	if (name === 'betterpptx.deck.autoplay' || name === 'betterpptx.deck.set_transitions_all' || name === 'betterpptx.slide.set_transition') return 'transition'
	if (hasGradient(args)) return 'gradient'
	if (containsKey(args, new Set(['wordArt']))) return 'wordArt'
	if (containsKey(args, new Set(['text3D']))) return 'text3D'
	if (containsKey(args, new Set(['animation', 'animations', 'motionPath']))) return 'animation'
	if (containsKey(args, new Set(['transition', 'transitions', 'variants']))) return 'transition'
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

function isPreviewSlideIndex(index) {
	return index < FREE_TIER_POLICY.premiumPreviewSlides
}

function isMorphByObjectTransition(transition) {
	if (!transition || typeof transition !== 'object') return false
	const type = String(transition.type || transition.transition || '').toLowerCase()
	const option = String(transition.option || transition.morphOption || 'byObject').toLowerCase()
	return type === 'morph' && (option === 'byobject' || option === 'object')
}

function secondSlideTransitionFromDeck(args = {}, helpers = {}) {
	if (!helpers.deckSlideTransition) return null
	const transition = helpers.deckSlideTransition(args.deckId, 1)
	return transition && typeof transition === 'object' ? transition : null
}

function previewTransitionFailure(received, extra = {}) {
	return entitlementFailure(
		'INVALID_PREMIUM_PREVIEW_TRANSITION',
		'preview_transition',
		'The free preview uses slides 1 and 2 as the premium showcase, so slide 2 must enter with an organized Morph-by-object transition.',
		{
			received: received || null,
			requiredTransition: FREE_TIER_POLICY.premiumMorphPattern.transition,
			suggestion: {
				preferredWorkflow: 'Create slides 1 and 2 as normal story beats. Use Morph as an accessory transition into slide 2, and use stable objectName values only for related visual/accessory objects that should morph.',
				doNotForce: 'Do not duplicate slide 1 just to satisfy the preview. Duplicate only when the user story naturally calls for the same scene evolving.',
				morphFriendlyObjects: FREE_TIER_POLICY.organizedMorphGuidance.preferredObjectKinds,
				transition: FREE_TIER_POLICY.premiumMorphPattern.transition,
				authoringHints: [
					'Use text boxes, shapes, images, WordArt, Text3D, 3D models/GLB, and shape-built SmartArt for the strongest Morph results.',
					'Let new story content appear naturally; only matched visual objects need stable names across slide 1 and slide 2.',
					'For 3D models, keep the same model asset for related objects and change position, size, camera/view, or rotation.',
				],
			},
			freePolicy: FREE_TIER_POLICY,
			...extra,
		},
	)
}

function validatePreviewMorphTransition(name, args = {}, helpers = {}) {
	const count = deckSlideCount(args, helpers)
	if (name === 'betterpptx.slide.add' && count === 1 && args.transition && !isMorphByObjectTransition(args.transition)) {
		return previewTransitionFailure(args.transition, { operation: name, targetSlide: 2 })
	}
	if (name === 'betterpptx.slide.duplicate' && count === 1 && args.transition && !isMorphByObjectTransition(args.transition)) {
		return previewTransitionFailure(args.transition, { operation: name, targetSlide: 2 })
	}
	if (name === 'betterpptx.deck.set_transitions_all' && (count ?? 0) >= 2) {
		const variants = Array.isArray(args.variants) ? args.variants : []
		const transition = variants.length ? variants[1 % variants.length] : args.transition
		if (!isMorphByObjectTransition(transition)) return previewTransitionFailure(transition, { operation: name, targetSlide: 2 })
	}
	if (name === 'betterpptx.slide.set_transition' && slideIndex(args.slideIndex) === 1) {
		if (!isMorphByObjectTransition(args.transition)) return previewTransitionFailure(args.transition, { operation: name, targetSlide: 2 })
	}
	if (name === 'betterpptx.slide.update' && slideIndex(args.slideIndex) === 1 && containsKey(args, new Set(['transition']))) {
		const transition = args.patch && Object.prototype.hasOwnProperty.call(args.patch, 'transition') ? args.patch.transition : args.transition
		if (!isMorphByObjectTransition(transition)) return previewTransitionFailure(transition, { operation: name, targetSlide: 2 })
	}
	if (name === 'betterpptx.deck.autoplay' && (count ?? 0) >= 2) {
		const existing = secondSlideTransitionFromDeck(args, helpers)
		const fallback = args.defaultTransition || null
		const effective = existing || fallback
		if (!isMorphByObjectTransition(effective)) return previewTransitionFailure(effective, { operation: name, targetSlide: 2 })
	}
	if (name === 'betterpptx.deck.save' && (count ?? 0) >= 2) {
		const transition = secondSlideTransitionFromDeck(args, helpers)
		if (!isMorphByObjectTransition(transition)) return previewTransitionFailure(transition, { operation: name, targetSlide: 2 })
	}
	return null
}

export function requireEntitlement(name, args = {}, context = {}, helpers = {}) {
	if (name.startsWith('betterpptx.auth.') || name.startsWith('betterpptx.billing.')) return null
	const state = getAuthState(context)
	const hasCredits = state.plan === 'credits' && Number(state.credits || 0) > 0
	if (state.plan === 'premium' || hasCredits) return null

	const standaloneFeature = standalonePremiumFeature(name)
	if (standaloneFeature) {
		return entitlementFailure('REQUIRES_UPGRADE', standaloneFeature, `${featureMetadata(standaloneFeature).label} requires BetterPPTX Premium or credits.`, {
			currentPlan: state.plan,
			freePolicy: FREE_TIER_POLICY,
			note: standaloneFeature === 'narration'
				? 'For the free two-slide preview, use slide.add_narration or deck.add_narration against slideIndex 0 or 1 so narration is tied to preview slides.'
				: undefined,
		})
	}

	const indexes = collectOperationSlideIndexes(name, args, helpers)
	const firstBlocked = indexes.find(index => !isPreviewSlideIndex(index))
	if (firstBlocked !== undefined) {
		if (name === 'betterpptx.slide.duplicate') {
			return entitlementFailure('REQUIRES_UPGRADE', 'duplicate', `Free mode cannot duplicate slides into slide ${firstBlocked + 1} because duplication can carry premium objects beyond the two-slide preview. Add a new plain slide instead, or activate Premium.`, {
				currentPlan: state.plan,
				requestedSlide: firstBlocked + 1,
				premiumPreviewSlides: FREE_TIER_POLICY.premiumPreviewSlides,
				freePolicy: FREE_TIER_POLICY,
			})
		}
		const feature = requestedPremiumFeature(name, args)
		if (feature) {
			return entitlementFailure('REQUIRES_UPGRADE', 'slide_limit', `${featureMetadata(feature).label} are premium beyond slide ${FREE_TIER_POLICY.premiumPreviewSlides}. Slide ${firstBlocked + 1} requires Premium or credits for that feature.`, {
				currentPlan: state.plan,
				requestedSlide: firstBlocked + 1,
				requestedFeature: featureMetadata(feature),
				premiumPreviewSlides: FREE_TIER_POLICY.premiumPreviewSlides,
				freePolicy: FREE_TIER_POLICY,
				suggestion: 'Keep slides beyond the preview to basic text, shapes, images, charts, and tables, or activate Premium for full-deck premium features.',
			})
		}
	}

	const transitionPolicy = validatePreviewMorphTransition(name, args, helpers)
	if (transitionPolicy) return transitionPolicy

	if (name === 'betterpptx.deck.save') {
		if ((state.quota?.decksRemainingToday ?? 0) <= 0) {
			return entitlementFailure('QUOTA_EXCEEDED', 'quota', 'The free daily deck quota is exhausted.', {
				currentPlan: state.plan,
				quota: state.quota,
			})
		}
	}
	return null
}

export async function recordSuccessfulUse(name, context = {}) {
	if (name !== 'betterpptx.deck.save') return
	const state = getAuthState(context)
	if (state.plan === 'premium') return
	const usage = currentUsage(context)
	usage.savedDecks += 1
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
