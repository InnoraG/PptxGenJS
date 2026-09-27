// Verifies explicit PayRam product separation for the shared gateway (2026-06-27 pivot):
// - customer ids are product-prefixed (betterpptx:) and idempotent
// - foreign-product ids are detected and re-homed
// - the product registry keeps separate collectors/ledger prefixes per product
// - payment intents are tagged with productId
// - a foreign-product reference is never found in the betterpptx intent store (no cross-credit)
// @see plans/betterxlsx-shared-payram-x402-payment-handoff-2026-06-27-codexpreview.md
import * as os from 'node:os'
import * as path from 'node:path'

process.env.BETTERPPTX_BILLING_HASH_SALT = process.env.BETTERPPTX_BILLING_HASH_SALT || 'verify-product-sep-salt'
process.env.BETTERPPTX_PAYMENT_INTENT_FILE = path.join(os.tmpdir(), `betterpptx-product-sep-intents-${Date.now()}-${Math.random().toString(16).slice(2)}.json`)

const {
	PRODUCT_ID,
	productCustomerId,
	productFromCustomerId,
	isForeignProductCustomerId,
	PAYMENT_PRODUCT_REGISTRY,
} = await import('./billing/payment-product-registry.mjs')
const { createPaymentIntentStore } = await import('./billing/payment-intents.mjs')

let failures = 0
function expect(condition, message, details = {}) {
	if (!condition) {
		failures++
		console.error(`FAIL: ${message} ${Object.keys(details).length ? JSON.stringify(details) : ''}`)
	} else {
		console.log(`ok: ${message}`)
	}
}

// 1. Product-prefixed, idempotent customer ids
expect(productCustomerId('install_abc') === 'betterpptx:install_abc', 'customer id is product-prefixed')
expect(productCustomerId('betterpptx:install_abc') === 'betterpptx:install_abc', 'prefixing is idempotent')
expect(productCustomerId('betterxlsx:install_abc') === 'betterpptx:install_abc', 'foreign prefix is re-homed to betterpptx')
expect(productCustomerId('') === '', 'empty input stays empty')

// 2. Product detection / foreign flagging
expect(productFromCustomerId('betterpptx:x') === 'betterpptx', 'detects own product')
expect(productFromCustomerId('betterxlsx:x') === 'betterxlsx', 'detects foreign product')
expect(productFromCustomerId('install_x') === null, 'unprefixed id -> null product')
expect(isForeignProductCustomerId('betterxlsx:x') === true, 'foreign id flagged as foreign')
expect(isForeignProductCustomerId('betterpptx:x') === false, 'own id not flagged foreign')
expect(isForeignProductCustomerId('install_x') === false, 'unprefixed id not flagged foreign')

// 3. Registry keeps products separate
expect(PAYMENT_PRODUCT_REGISTRY.betterpptx.collectorSecret !== PAYMENT_PRODUCT_REGISTRY.betterxlsx.collectorSecret, 'products have separate collector secrets')
expect(PAYMENT_PRODUCT_REGISTRY.betterpptx.collectionPrefix !== PAYMENT_PRODUCT_REGISTRY.betterxlsx.collectionPrefix, 'products have separate ledger collection prefixes')

// 4. Intents carry productId; store isolation prevents cross-product crediting
const store = createPaymentIntentStore()
const created = await store.createIntent({
	customerHash: 'install_' + 'a'.repeat(64),
	provider: 'payram',
	purpose: 'credit_topup',
	packId: 'p5',
	requestedCredits: 500,
	requestedAmountUsd: 5,
	providerReferenceId: 'betterpptx_ref_1',
})
expect(created.intent.productId === PRODUCT_ID, 'created intent is tagged with productId=betterpptx', { productId: created.intent.productId })

const foreign = await store.getIntentByProviderReference('payram', 'betterxlsx_ref_xyz')
expect(!foreign, 'a foreign-product reference is not found in the betterpptx intent store (no cross-credit)')

const own = await store.getIntentByProviderReference('payram', 'betterpptx_ref_1')
expect(!!own && own.intentId === created.intent.intentId, 'own reference resolves to our intent')

if (failures > 0) {
	console.error(`\n${failures} check(s) failed`)
	process.exit(1)
}
console.log('\nPASS: PayRam product-separation verified')
