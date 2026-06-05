import * as fs from 'node:fs'
import * as path from 'node:path'

import {
	extractDodoBillingIds,
	resolveDodoBillingCustomerForActivation,
} from './billing/customer-map.mjs'
import { createBillingLedgerStore, hashCustomerId } from './billing/ledger-store.mjs'

function fail(message, details = {}) {
	const err = new Error(message)
	err.details = details
	throw err
}

function expect(condition, message, details = {}) {
	if (!condition) fail(message, details)
}

process.env.BETTERPPTX_BILLING_LEDGER_STORE = 'local'
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
const verifyDir = path.resolve('outputs', 'billing-verify')
fs.mkdirSync(verifyDir, { recursive: true })
process.env.BETTERPPTX_BILLING_LEDGER_FILE = path.join(verifyDir, 'billing-customer-map-ledger.json')
try { fs.rmSync(process.env.BETTERPPTX_BILLING_LEDGER_FILE, { force: true }) } catch {}

const providerData = {
	valid: true,
	license_key_id: 'lic_verify_123',
	customer: { id: 'cus_verify_customer_123' },
	product: { id: 'pdt_verify_123' },
	subscription: { id: 'sub_verify_123', customer_id: 'cus_verify_customer_123' },
	payment: { id: 'pay_verify_123' },
	credit_balance: { available: '42.50' },
}

const extracted = extractDodoBillingIds({ providerData })
expect(extracted.providerCustomerId === 'cus_verify_customer_123', 'Customer id was not extracted from Dodo payload.', { extracted })
expect(extracted.providerProductId === 'pdt_verify_123', 'Product id was not extracted from Dodo payload.', { extracted })
expect(extracted.providerSubscriptionId === 'sub_verify_123', 'Subscription id was not extracted from Dodo payload.', { extracted })
expect(extracted.providerPaymentId === 'pay_verify_123', 'Payment id was not extracted from Dodo payload.', { extracted })
expect(extracted.providerLicenseId === 'lic_verify_123', 'License id was not extracted from Dodo payload.', { extracted })
expect(extracted.lastKnownCreditBalance === 42.5, 'Credit balance was not extracted from Dodo payload.', { extracted })

const keyFingerprint = 'keyfp_verify_customer_map'
const mapped = await resolveDodoBillingCustomerForActivation({
	keyFingerprint,
	validation: {
		ok: true,
		provider: 'dodo',
		source: 'dodo-api',
		providerLicenseId: 'lic_verify_123',
		providerData,
	},
	previous: {
		activationKey: 'never-store-this-activation-key',
	},
})
expect(mapped.ok === true, 'Dodo billing customer mapping failed for complete validation payload.', { mapped })
expect(mapped.billingCustomerHash === hashCustomerId('cus_verify_customer_123'), 'Billing customer hash did not match expected hash.', { mapped })
expect(mapped.providerCustomerId === 'cus_verify_customer_123', 'Provider customer id missing from private mapping.', { mapped })

const store = createBillingLedgerStore()
const customer = await store.getCustomer(mapped.billingCustomerHash)
expect(customer, 'Mapped billing customer was not written to the ledger.', { mapped })
expect(customer.lastKnownDodoAvailableBalanceCredits === 42.5, 'Ledger did not persist the extracted balance snapshot.', { customer })

const text = fs.readFileSync(process.env.BETTERPPTX_BILLING_LEDGER_FILE, 'utf8')
expect(!text.includes('never-store-this-activation-key'), 'Billing customer map persisted a raw activation key.', {})
expect(!text.includes('activationKey'), 'Billing customer map persisted an activation-key field.', {})

const incomplete = await resolveDodoBillingCustomerForActivation({
	keyFingerprint: 'keyfp_missing_customer',
	validation: {
		ok: true,
		provider: 'dodo',
		source: 'dodo-api',
		providerLicenseId: 'lic_without_customer',
		providerData: { valid: true, license_key_id: 'lic_without_customer' },
	},
	previous: {},
})
expect(incomplete.ok === false && incomplete.code === 'BILLING_SETUP_INCOMPLETE', 'Missing customer mapping should return setup-incomplete.', { incomplete })

console.log(`BILLING CUSTOMER MAP: PASS customer=${mapped.billingCustomerHash}`)
