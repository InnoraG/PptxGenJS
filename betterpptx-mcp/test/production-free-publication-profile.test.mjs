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
	BETTERPPTX_FREE_PUBLICATIONS_PER_WINDOW: '3',
	BETTERPPTX_FREE_PUBLICATION_WINDOW_DAYS: '30',
	BETTERPPTX_FREE_NARRATION_PREPARATIONS_PER_WINDOW: '3',
	BETTERPPTX_FREE_IDENTITY_MEDIA_PER_WINDOW: '3',
}

test('production accepts only the bounded three-publications-per-30-day no-payment profile', () => {
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

test('free publication refuses a larger allowance, a shorter/longer window, or unbounded media allowances', () => {
	for (const [key, value, expected] of [
		['BETTERPPTX_FREE_PUBLICATIONS_PER_WINDOW', '4', 'free-publication-limit-must-be-three'],
		['BETTERPPTX_FREE_PUBLICATION_WINDOW_DAYS', '31', 'free-publication-window-must-be-30-days'],
		['BETTERPPTX_FREE_NARRATION_PREPARATIONS_PER_WINDOW', '4', 'free-narration-limit-out-of-range'],
		['BETTERPPTX_FREE_IDENTITY_MEDIA_PER_WINDOW', '99', 'free-identity-media-limit-out-of-range'],
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
