import test from 'node:test'
import assert from 'node:assert/strict'

import {
	isFreePublicationBillingProfile,
	productionBillingConfigurationProblems,
} from '../billing/security-policy.mjs'

const validFreeProfile = {
	NODE_ENV: 'production',
	BETTERPPTX_ENV: 'production',
	BETTERPPTX_DEPLOYMENT_STAGE: 'production',
	BETTERPPTX_BILLING_PROVIDER: 'none',
	BETTERPPTX_BILLING_MODEL: 'free_publication',
	BETTERPPTX_BILLING_ENFORCE: '1',
	BETTERPPTX_MONETIZED_MCP_ENABLED: '0',
	BETTERPPTX_FREE_PUBLICATIONS_PER_WINDOW: '5',
	BETTERPPTX_FREE_PUBLICATION_WINDOW_DAYS: '30',
	BETTERPPTX_EDIT_REQUIRES_PAYMENT: '1',
}

test('production accepts the bounded publications-per-30-day no-payment profile', () => {
	assert.equal(isFreePublicationBillingProfile(validFreeProfile), true)
	assert.deepEqual(productionBillingConfigurationProblems(validFreeProfile), [])
})

test('free publication refuses payment providers, monetized routes, and disabled quota enforcement', () => {
	for (const [key, value, expected] of [
		['BETTERPPTX_BILLING_PROVIDER', 'crypto_credits', 'free-publication-provider-must-be-none'],
		['BETTERPPTX_MONETIZED_MCP_ENABLED', '1', 'free-publication-monetized-mcp-must-be-disabled'],
		['BETTERPPTX_BILLING_ENFORCE', '0', 'free-publication-quota-enforcement-required'],
		['BETTERPPTX_PAYRAM_ENABLED', '1', 'free-publication-payment-onramp-must-be-disabled'],
		['BETTERPPTX_REQUIRE_CARD_ONRAMP', '1', 'free-publication-payment-onramp-must-be-disabled'],
	]) {
		const problems = productionBillingConfigurationProblems({ ...validFreeProfile, [key]: value })
		assert.ok(problems.includes(expected), `${key}=${value} must fail with ${expected}`)
	}
})

test('free publication refuses an out-of-range fallback allowance or a shorter/longer window', () => {
	for (const [key, value, expected] of [
		['BETTERPPTX_FREE_PUBLICATIONS_PER_WINDOW', '0', 'free-publication-limit-out-of-range'],
		['BETTERPPTX_FREE_PUBLICATIONS_PER_WINDOW', '1001', 'free-publication-limit-out-of-range'],
		['BETTERPPTX_FREE_PUBLICATION_WINDOW_DAYS', '31', 'free-publication-window-must-be-30-days'],
		['BETTERPPTX_EDIT_REQUIRES_PAYMENT', 'sometimes', 'edit-requires-payment-flag-invalid'],
	]) {
		const problems = productionBillingConfigurationProblems({ ...validFreeProfile, [key]: value })
		assert.ok(problems.includes(expected), `${key}=${value} must fail with ${expected}`)
	}
})

test('the existing paid pay-per-job profile remains accepted without new free-tier assumptions', () => {
	const problems = productionBillingConfigurationProblems({
		NODE_ENV: 'production',
		BETTERPPTX_BILLING_PROVIDER: 'crypto_credits',
		BETTERPPTX_BILLING_MODEL: 'pay_per_job',
		BETTERPPTX_BILLING_ENFORCE: '1',
	})
	assert.deepEqual(problems, [])
})

test('production without an explicit profile remains blocked', () => {
	const problems = productionBillingConfigurationProblems({ NODE_ENV: 'production' })
	assert.ok(problems.includes('billing-provider-required'))
	assert.ok(problems.includes('billing-model-explicit-required'))
})
