// Product separation for the shared PayRam gateway.
//
// Per the 2026-06-27 shared-gateway pivot, one PayRam OCI host serves multiple products
// (BetterPPTX, BetterXLSX). Each product owns its own ledger/intents; customer IDs are
// product-namespaced and references are validated against the owning product so a shared
// PayRam host can never cross-credit.
// @see plans/betterxlsx-shared-payram-x402-payment-handoff-2026-06-27-codexpreview.md

export const PRODUCT_ID = 'betterpptx'

/** Known product customer-id prefixes on the shared gateway. */
export const PRODUCT_CUSTOMER_PREFIXES = Object.freeze({
	betterpptx: 'betterpptx:',
	betterxlsx: 'betterxlsx:',
})

/**
 * Owner-private product registry (do not expose publicly). Mirrors the shared-gateway handoff shape:
 * each product → customer prefix, billing collection prefix, and settlement collector secret name.
 */
export const PAYMENT_PRODUCT_REGISTRY = Object.freeze({
	betterpptx: Object.freeze({
		productId: 'betterpptx',
		customerPrefix: 'betterpptx:',
		collectionPrefix: 'betterpptx_billing',
		collectorSecret: 'betterpptx-settlement-collector-evm-address',
	}),
	betterxlsx: Object.freeze({
		productId: 'betterxlsx',
		customerPrefix: 'betterxlsx:',
		collectionPrefix: 'betterxlsx_billing',
		collectorSecret: 'betterxlsx-settlement-collector-evm-address',
	}),
})

/** Product-namespaced customer id, idempotent (never double-prefixes; re-homes a foreign prefix). */
export function productCustomerId(installOrTenantHash, productId = PRODUCT_ID) {
	const hash = String(installOrTenantHash || '').trim()
	if (!hash) return ''
	const prefix = PRODUCT_CUSTOMER_PREFIXES[productId] || `${productId}:`
	if (hash.startsWith(prefix)) return hash
	for (const otherPrefix of Object.values(PRODUCT_CUSTOMER_PREFIXES)) {
		if (hash.startsWith(otherPrefix)) return prefix + hash.slice(otherPrefix.length)
	}
	return prefix + hash
}

/** The product a customer id belongs to, or null if unprefixed/unknown. */
export function productFromCustomerId(customerId) {
	const cid = String(customerId || '').trim()
	for (const [product, prefix] of Object.entries(PRODUCT_CUSTOMER_PREFIXES)) {
		if (cid.startsWith(prefix)) return product
	}
	return null
}

/** True when the customer id explicitly belongs to a different product than this one. */
export function isForeignProductCustomerId(customerId, productId = PRODUCT_ID) {
	const product = productFromCustomerId(customerId)
	return product !== null && product !== productId
}
