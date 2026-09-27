import { billingSetupIncomplete } from './public-errors.mjs'

// Deployment policy, never a tool argument. Production must not inherit the
// deliberately permissive switches used by isolated development fixtures.
export function isProductionBillingEnvironment(env = process.env) {
	return ['BETTERPPTX_ENV', 'BETTERPPTX_DEPLOYMENT_STAGE', 'NODE_ENV']
		.some(key => /^(production|prod|live)$/i.test(String(env[key] || '').trim()))
}

export function isFreePublicationBillingProfile(env = process.env) {
	return String(env.BETTERPPTX_BILLING_MODEL || '').trim().toLowerCase() === 'free_publication'
}

function boundedFreeLimit(env, name, fallback, { exact = null, max = 3 } = {}) {
	const raw = env[name] === undefined || env[name] === '' ? fallback : env[name]
	const value = Number(raw)
	return Number.isInteger(value) && value >= 1 && value <= max && (exact === null || value === exact)
}

export function productionBillingConfigurationProblems(env = process.env) {
	if (!isProductionBillingEnvironment(env)) return []
	const problems = []
	const provider = String(env.BETTERPPTX_BILLING_PROVIDER || '').trim().toLowerCase()
	const billingModel = String(env.BETTERPPTX_BILLING_MODEL || '').trim().toLowerCase()
	if (billingModel === 'free_publication') {
		if (provider !== 'none') problems.push('free-publication-provider-must-be-none')
		if (env.BETTERPPTX_BILLING_ENFORCE !== '1') problems.push('free-publication-quota-enforcement-required')
		if (enabled(env.BETTERPPTX_BILLING_DRY_RUN) || enabled(env.BETTERPPTX_BILLING_SHADOW_MODE)) problems.push('billing-simulation-not-permitted')
		if (env.BETTERPPTX_MONETIZED_MCP_ENABLED === '1') problems.push('free-publication-monetized-mcp-must-be-disabled')
		if (enabled(env.BETTERPPTX_PAYRAM_ENABLED) || enabled(env.BETTERPPTX_REQUIRE_CARD_ONRAMP)) problems.push('free-publication-payment-onramp-must-be-disabled')
		if (env.BETTERPPTX_FORCE_PLAN === 'premium' || env.BETTERPPTX_PREMIUM === '1') problems.push('unfunded-premium-override-not-permitted')
		if (!boundedFreeLimit(env, 'BETTERPPTX_FREE_PUBLICATIONS_PER_WINDOW', 3, { exact: 3 })) problems.push('free-publication-limit-must-be-three')
		if (!boundedFreeLimit(env, 'BETTERPPTX_FREE_PUBLICATION_WINDOW_DAYS', 30, { exact: 30, max: 30 })) problems.push('free-publication-window-must-be-30-days')
		if (!boundedFreeLimit(env, 'BETTERPPTX_FREE_NARRATION_PREPARATIONS_PER_WINDOW', 3)) problems.push('free-narration-limit-out-of-range')
		if (!boundedFreeLimit(env, 'BETTERPPTX_FREE_IDENTITY_MEDIA_PER_WINDOW', 3)) problems.push('free-identity-media-limit-out-of-range')
		return problems
	}
	// Production must choose an explicit billing profile. The intended accountless
	// paid profile is x402 pay-per-job; the legacy profile remains available only
	// when the owner deliberately selects it for a backwards-compatible deployment.
	if (!['payram', 'crypto_credits'].includes(provider)) problems.push('billing-provider-required')
	if (!billingModel) problems.push('billing-model-explicit-required')
	else if (!['pay_per_job', 'credit_compatibility'].includes(billingModel)) problems.push('billing-model-unsupported')
	else if (billingModel === 'pay_per_job' && provider !== 'crypto_credits') problems.push('x402-billing-provider-required')
	if (env.BETTERPPTX_BILLING_ENFORCE !== '1') problems.push('billing-enforcement-required')
	if (env.BETTERPPTX_BILLING_DRY_RUN === '1' || env.BETTERPPTX_BILLING_SHADOW_MODE === '1') problems.push('billing-simulation-not-permitted')
	if (env.BETTERPPTX_FORCE_PLAN === 'premium' || env.BETTERPPTX_PREMIUM === '1') problems.push('unfunded-premium-override-not-permitted')
	return problems
}

function enabled(value) {
	return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase())
}

export function assertProductionBillingConfiguration(env = process.env) {
	const problems = productionBillingConfigurationProblems(env)
	if (problems.length) throw billingSetupIncomplete({
		reason: 'production-billing-policy',
		blockers: problems,
		recovery: 'The service owner must configure an explicit production profile before resource-producing operations are enabled. Use BETTERPPTX_BILLING_MODEL=free_publication with provider none for the strictly capped free-publication tier, or configure the complete authorized paid profile. Discovery remains available.',
	})
}
