import { createBillingLedgerStore, hashCustomerId } from './ledger-store.mjs'

function normalizeKey(key) {
	return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isObject(value) {
	return value && typeof value === 'object' && !Array.isArray(value)
}

function firstString(...values) {
	for (const value of values.flat()) {
		if (value === undefined || value === null) continue
		if (typeof value === 'string' || typeof value === 'number') {
			const text = String(value).trim()
			if (text) return text
		}
	}
	return null
}

function findKeyRecursive(value, wantedKeys, depth = 0) {
	if (depth > 8 || value === undefined || value === null) return null
	const wanted = new Set(wantedKeys.map(normalizeKey))
	if (Array.isArray(value)) {
		for (const item of value) {
			const found = findKeyRecursive(item, wantedKeys, depth + 1)
			if (found !== null) return found
		}
		return null
	}
	if (!isObject(value)) return null
	for (const [key, item] of Object.entries(value)) {
		if (wanted.has(normalizeKey(key))) return item
	}
	for (const item of Object.values(value)) {
		const found = findKeyRecursive(item, wantedKeys, depth + 1)
		if (found !== null) return found
	}
	return null
}

function findContainerId(value, containerKeys, idKeys = ['id', 'customer_id', 'customerId']) {
	const container = findKeyRecursive(value, containerKeys)
	if (typeof container === 'string' || typeof container === 'number') return String(container).trim() || null
	if (isObject(container)) return firstString(findKeyRecursive(container, idKeys))
	return null
}

function extractBalance(value) {
	const raw = findKeyRecursive(value, [
		'available_balance',
		'availableBalance',
		'credit_balance',
		'creditBalance',
		'credits_balance',
		'creditsBalance',
		'balance_after',
		'balanceAfter',
		'balance',
	])
	if (raw === null || raw === undefined) return null
	if (typeof raw === 'number' || typeof raw === 'string') {
		const n = Number(raw)
		return Number.isFinite(n) ? n : null
	}
	if (isObject(raw)) {
		const n = Number(firstString(raw.available, raw.amount, raw.value, raw.credits))
		return Number.isFinite(n) ? n : null
	}
	return null
}

export function extractDodoBillingIds(payload = {}) {
	const source = payload?.providerData || payload?.data || payload
	const providerCustomerId = firstString(
		findKeyRecursive(source, ['customer_id', 'customerId']),
		findContainerId(source, ['customer', 'customer_details', 'customerDetails'], ['id', 'customer_id', 'customerId']),
	)
	const providerProductId = firstString(
		findKeyRecursive(source, ['product_id', 'productId']),
		findContainerId(source, ['product', 'product_details', 'productDetails'], ['id', 'product_id', 'productId']),
	)
	const providerSubscriptionId = firstString(
		findKeyRecursive(source, ['subscription_id', 'subscriptionId']),
		findContainerId(source, ['subscription'], ['id', 'subscription_id', 'subscriptionId']),
	)
	const providerPaymentId = firstString(
		findKeyRecursive(source, ['payment_id', 'paymentId']),
		findContainerId(source, ['payment'], ['id', 'payment_id', 'paymentId']),
	)
	const providerLicenseId = firstString(
		payload.providerLicenseId,
		findKeyRecursive(source, ['license_key_id', 'licenseKeyId', 'license_id', 'licenseId']),
		findContainerId(source, ['license', 'license_key', 'licenseKey'], ['id', 'license_key_id', 'licenseKeyId']),
	)
	const creditEntitlementId = firstString(
		findKeyRecursive(source, ['credit_entitlement_id', 'creditEntitlementId']),
		findContainerId(source, ['credit_entitlement', 'creditEntitlement'], ['id', 'credit_entitlement_id', 'creditEntitlementId']),
	)
	return {
		providerCustomerId,
		providerProductId,
		providerSubscriptionId,
		providerPaymentId,
		providerLicenseId,
		creditEntitlementId,
		lastKnownCreditBalance: extractBalance(source),
	}
}

function dodoApiToken() {
	return process.env.DODO_PAYMENTS_API_KEY || process.env.BETTERPPTX_DODO_API_KEY || ''
}

function dodoApiBase() {
	const configured = String(process.env.BETTERPPTX_DODO_API_BASE || '').trim().replace(/\/+$/, '')
	if (configured) return configured
	const validateUrl = String(process.env.BETTERPPTX_DODO_VALIDATE_URL || '').toLowerCase()
	if (validateUrl.includes('test.dodopayments.com')) return 'https://test.dodopayments.com'
	if (validateUrl.includes('live.dodopayments.com')) return 'https://live.dodopayments.com'
	const environment = String(process.env.BETTERPPTX_DODO_ENVIRONMENT || '').toLowerCase()
	if (environment === 'test') return 'https://test.dodopayments.com'
	if (environment === 'live') return 'https://live.dodopayments.com'
	return 'https://api.dodopayments.com'
}

async function dodoGet(pathname, token) {
	const response = await fetch(`${dodoApiBase()}${pathname}`, {
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`,
		},
	})
	const raw = await response.text()
	let data = null
	try { data = raw ? JSON.parse(raw) : null } catch { data = { raw } }
	if (!response.ok) return { ok: false, status: response.status, data }
	return { ok: true, status: response.status, data }
}

async function tryDodoLookups(ids = {}) {
	const token = dodoApiToken()
	if (!token) return { ids: {}, notes: ['dodo-api-token-missing'] }
	const attempts = []
	const add = path => {
		if (path && !attempts.includes(path)) attempts.push(path)
	}
	if (ids.providerLicenseId) {
		add(`/licenses/${encodeURIComponent(ids.providerLicenseId)}`)
		add(`/license-keys/${encodeURIComponent(ids.providerLicenseId)}`)
	}
	if (ids.providerPaymentId) add(`/payments/${encodeURIComponent(ids.providerPaymentId)}`)
	if (ids.providerSubscriptionId) add(`/subscriptions/${encodeURIComponent(ids.providerSubscriptionId)}`)
	const notes = []
	let merged = { ...ids }
	for (const pathname of attempts) {
		const response = await dodoGet(pathname, token)
		if (!response.ok) {
			notes.push(`lookup ${pathname} -> HTTP ${response.status}`)
			continue
		}
		const extracted = extractDodoBillingIds(response.data)
		merged = { ...merged, ...Object.fromEntries(Object.entries(extracted).filter(([_key, value]) => value !== null && value !== undefined)) }
		if (merged.providerCustomerId) return { ids: merged, notes }
	}
	return { ids: merged, notes }
}

function mergeKnownIds(...items) {
	const out = {}
	for (const item of items) {
		if (!item) continue
		for (const [key, value] of Object.entries(item)) {
			if (value !== null && value !== undefined && value !== '') out[key] = value
		}
	}
	return out
}

export function dodoActivationNeedsCustomerMapping(validation = {}, previous = {}) {
	if (String(validation.provider || previous.provider || '').toLowerCase() !== 'dodo') return false
	if (process.env.BETTERPPTX_DODO_REQUIRE_CUSTOMER_MAPPING === '0') return false
	if (validation.source === 'dodo-api') return true
	if (validation.source === 'validation-cache' && (previous.providerLicenseId || previous.providerCustomerId)) return true
	return process.env.BETTERPPTX_DODO_REQUIRE_CUSTOMER_MAPPING === '1'
}

export async function resolveDodoBillingCustomerForActivation({ validation = {}, previous = {}, keyFingerprint = '' } = {}) {
	let ids = mergeKnownIds(
		extractDodoBillingIds(validation),
		extractDodoBillingIds(validation.providerData || {}),
		{
			providerCustomerId: validation.providerCustomerId || previous.providerCustomerId,
			providerProductId: validation.providerProductId || previous.providerProductId,
			providerSubscriptionId: validation.providerSubscriptionId || previous.providerSubscriptionId,
			providerPaymentId: validation.providerPaymentId || previous.providerPaymentId,
			providerLicenseId: validation.providerLicenseId || previous.providerLicenseId,
			creditEntitlementId: validation.creditEntitlementId || previous.creditEntitlementId || process.env.BETTERPPTX_DODO_CREDIT_ENTITLEMENT_ID || null,
			lastKnownCreditBalance: validation.lastKnownCreditBalance ?? previous.lastKnownCreditBalance,
		},
	)
	if (!ids.providerCustomerId) {
		const lookup = await tryDodoLookups(ids)
		ids = lookup.ids
		ids.lookupNotes = lookup.notes
	}
	if (!ids.providerCustomerId) {
		return {
			ok: false,
			code: 'BILLING_SETUP_INCOMPLETE',
			message: 'The Dodo key is valid, but BetterPPTX could not resolve the billing customer yet. Retry activation after Dodo finishes provisioning, or contact support with the checkout receipt.',
			details: {
				provider: 'dodo',
				hasProviderLicenseId: Boolean(ids.providerLicenseId),
				lookupNotes: ids.lookupNotes || [],
			},
		}
	}
	const billingCustomerHash = hashCustomerId(ids.providerCustomerId)
	const now = new Date().toISOString()
	const mapping = {
		providerCustomerId: ids.providerCustomerId,
		providerProductId: ids.providerProductId || null,
		providerSubscriptionId: ids.providerSubscriptionId || null,
		providerPaymentId: ids.providerPaymentId || null,
		providerLicenseId: ids.providerLicenseId || validation.providerLicenseId || previous.providerLicenseId || null,
		creditEntitlementId: ids.creditEntitlementId || process.env.BETTERPPTX_DODO_CREDIT_ENTITLEMENT_ID || null,
		lastKnownCreditBalance: ids.lastKnownCreditBalance ?? previous.lastKnownCreditBalance ?? null,
		lastBalanceSyncedAt: ids.lastKnownCreditBalance !== null && ids.lastKnownCreditBalance !== undefined ? now : previous.lastBalanceSyncedAt || null,
		billingCustomerHash,
		billingStatus: 'active',
		billingMappedAt: now,
		billingMappingSource: validation.source === 'validation-cache' ? 'cached-entitlement' : 'activation',
	}
	const store = createBillingLedgerStore()
	try {
		await store.upsertCustomer(billingCustomerHash, {
			providerCustomerId: mapping.providerCustomerId,
			providerProductId: mapping.providerProductId,
			providerSubscriptionId: mapping.providerSubscriptionId,
			providerPaymentId: mapping.providerPaymentId,
			providerLicenseId: mapping.providerLicenseId,
			creditEntitlementId: mapping.creditEntitlementId,
			keyFingerprint,
			billingStatus: mapping.billingStatus,
			lastKnownDodoAvailableBalanceCredits: mapping.lastKnownCreditBalance ?? previous.lastKnownCreditBalance ?? 0,
			lastBalanceSyncedAt: mapping.lastBalanceSyncedAt,
		})
	} catch (err) {
		return {
			ok: false,
			code: 'BILLING_SETUP_INCOMPLETE',
			message: 'The Dodo key is valid, but BetterPPTX could not persist the billing customer mapping yet.',
			details: {
				provider: 'dodo',
				reason: err?.code || err?.message || String(err),
			},
		}
	}
	return { ok: true, ...mapping }
}
