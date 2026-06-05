import * as fs from 'node:fs'
import * as path from 'node:path'

import { callBetterPptxTool } from './engine.mjs'
import { createBillingLedgerStore, hashCustomerId } from './billing/ledger-store.mjs'

function fail(message, details = {}) {
	const err = new Error(message)
	err.details = details
	throw err
}

function expect(condition, message, details = {}) {
	if (!condition) fail(message, details)
}

function assertPublicSafe(payload, label) {
	const text = JSON.stringify(payload)
	expect(!/cus_verify_public_ux/i.test(text), `${label} leaked Dodo customer id.`, { payload })
	expect(!/sub_verify_public_ux/i.test(text), `${label} leaked Dodo subscription id.`, { payload })
	expect(!/lic_verify_public_ux/i.test(text), `${label} leaked Dodo license id.`, { payload })
	expect(!/cde_verify_public_ux/i.test(text), `${label} leaked Dodo credit entitlement id.`, { payload })
	expect(!/C:\\|firestore|betterpptx_billing_/i.test(text), `${label} leaked internal path/store details.`, { payload })
}

process.env.BETTERPPTX_LICENSE_VALIDATION_MODE = 'mock'
process.env.BETTERPPTX_BILLING_PROVIDER = 'dodo'
process.env.BETTERPPTX_BILLING_DRY_RUN = '1'
process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.BETTERPPTX_MOCK_DODO_CUSTOMER_ID = 'cus_verify_public_ux'
process.env.BETTERPPTX_MOCK_DODO_CREDIT_BALANCE = '123.45'
process.env.BETTERPPTX_DODO_CREDIT_ENTITLEMENT_ID = 'cde_verify_public_ux'
process.env.BETTERPPTX_PRICING_URL = 'https://billing.betterpptx.test/pricing'
process.env.BETTERPPTX_CHECKOUT_URL = 'https://billing.betterpptx.test/checkout'
process.env.BETTERPPTX_STARTER_CHECKOUT_URL = 'https://billing.betterpptx.test/starter'
process.env.BETTERPPTX_TOPUP_CHECKOUT_URL = 'https://billing.betterpptx.test/topup'
process.env.BETTERPPTX_PORTAL_URL = 'https://billing.betterpptx.test/portal'

const verifyDir = path.resolve('outputs', 'billing-verify')
fs.mkdirSync(verifyDir, { recursive: true })
process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(verifyDir, 'billing-public-ux-ledger.json')
try { fs.rmSync(process.env.BETTERPPTX_BILLING_LEDGER_FILE, { force: true }) } catch {}

const context = { sessionId: 'session_verify_public_ux' }

const unactivatedPortal = await callBetterPptxTool('betterpptx.billing.portal', { feature: 'deck.save' }, context)
expect(unactivatedPortal.ok === true, 'Unactivated billing portal call should succeed.', { unactivatedPortal })
expect(unactivatedPortal.data.checkoutUrl.includes('/checkout'), 'Unactivated user should get checkout URL.', { unactivatedPortal })
expect(unactivatedPortal.data.topUpCheckoutUrl.includes('/topup'), 'Unactivated user should get top-up URL.', { unactivatedPortal })
expect(unactivatedPortal.data.portalAvailable === false, 'Unactivated user should not get a customer portal session URL.', { unactivatedPortal })
assertPublicSafe(unactivatedPortal, 'unactivated portal')

const explain = await callBetterPptxTool('betterpptx.billing.explain_plan', {}, context)
expect(explain.ok === true, 'Billing plan explanation should succeed.', { explain })
expect(explain.data.dodo.starter.priceUsd === 5, 'Plan should expose Starter $5 monthly model.', { explain })
expect(explain.data.dodo.topUp.credits === 500, 'Plan should expose 500-credit top-up model.', { explain })
assertPublicSafe(explain, 'explain plan')

const activation = await callBetterPptxTool('betterpptx.auth.activate_key', {
	key: 'sk_test_betterpptx_premium_dodo_public_ux',
	provider: 'auto',
}, context)
expect(activation.ok === true, 'Mock Dodo activation should succeed.', { activation })
expect(activation.data.hasBillingCustomer === true, 'Activation should report a linked billing customer without returning provider ids.', { activation })
assertPublicSafe(activation, 'activation')

const store = createBillingLedgerStore()
await store.upsertCustomer(hashCustomerId('cus_verify_public_ux'), {
	providerCustomerId: 'cus_verify_public_ux',
	providerSubscriptionId: 'sub_verify_public_ux',
	providerLicenseId: 'lic_verify_public_ux',
	creditEntitlementId: 'cde_verify_public_ux',
	billingStatus: 'active',
	lastKnownDodoAvailableBalanceCredits: 123.45,
	pendingReservedCredits: 3,
	durableQueuedUsageCreditsNotYetReflectedByDodo: 4,
	lastBalanceSyncedAt: new Date().toISOString(),
})

const status = await callBetterPptxTool('betterpptx.auth.status', {}, context)
expect(status.ok === true && status.data.authenticated === true, 'Activated auth.status should succeed.', { status })
expect(status.data.billing.hasBillingCustomer === true, 'Auth status should include public hasBillingCustomer flag.', { status })
expect(status.data.billing.balance.effectiveAvailableCredits === 116.45, 'Auth status should include effective public balance.', { status })
expect(status.data.billing.urls.portalAvailable === true, 'Activated user with billing customer should get portal availability.', { status })
assertPublicSafe(status, 'auth status')

const usage = await callBetterPptxTool('betterpptx.billing.usage_summary', {}, context)
expect(usage.ok === true, 'Usage summary should succeed.', { usage })
expect(usage.data.balance.pendingReservedCredits === 3, 'Usage summary should expose pending reserved credits.', { usage })
expect(usage.data.balance.queuedUsageCreditsNotYetReflectedByDodo === 4, 'Usage summary should expose queued usage credits.', { usage })
assertPublicSafe(usage, 'usage summary')

const estimate = await callBetterPptxTool('betterpptx.billing.estimate', { toolName: 'betterpptx.deck.save' }, context)
expect(estimate.ok === true, 'Billing estimate should succeed.', { estimate })
expect(estimate.data.estimatedCredits > 0, 'Billing estimate should include estimated credits.', { estimate })
expect(estimate.data.billingCategory === 'checkpoint', 'Deck save estimate should be checkpoint category.', { estimate })
assertPublicSafe(estimate, 'estimate')

console.log(`BILLING PUBLIC UX: PASS balance=${status.data.billing.balance.effectiveAvailableCredits} estimate=${estimate.data.estimatedCredits}`)
