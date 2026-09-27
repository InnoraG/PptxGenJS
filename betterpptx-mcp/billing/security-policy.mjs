import { billingSetupIncomplete } from './public-errors.mjs'

// Deployment policy, never a tool argument. Production must not inherit the
// deliberately permissive switches used by isolated development fixtures.
export function isProductionBillingEnvironment(env = process.env) {
	return ['BETTERPPTX_ENV', 'BETTERPPTX_DEPLOYMENT_STAGE', 'NODE_ENV']
		.some(key => /^(production|prod|live)$/i.test(String(env[key] || '').trim()))
}

export function productionBillingConfigurationProblems(env = process.env) {
	if (!isProductionBillingEnvironment(env)) return []
	const problems = []
	const provider = String(env.BETTERPPTX_BILLING_PROVIDER || '').trim().toLowerCase()
	const billingModel = String(env.BETTERPPTX_BILLING_MODEL || '').trim().toLowerCase()
	// Production must choose an explicit billing profile. The intended accountless
	// profile is x402 pay-per-job; the legacy profile remains available only when
	// the owner deliberately selects it for a backwards-compatible deployment.
	if (!['payram', 'crypto_credits'].includes(provider)) problems.push('billing-provider-required')
	if (!billingModel) problems.push('billing-model-explicit-required')
	else if (!['pay_per_job', 'credit_compatibility'].includes(billingModel)) problems.push('billing-model-unsupported')
	else if (billingModel === 'pay_per_job' && provider !== 'crypto_credits') problems.push('x402-billing-provider-required')
	if (env.BETTERPPTX_BILLING_ENFORCE !== '1') problems.push('billing-enforcement-required')
	if (env.BETTERPPTX_BILLING_DRY_RUN === '1' || env.BETTERPPTX_BILLING_SHADOW_MODE === '1') problems.push('billing-simulation-not-permitted')
	if (env.BETTERPPTX_FORCE_PLAN === 'premium' || env.BETTERPPTX_PREMIUM === '1') problems.push('unfunded-premium-override-not-permitted')
	return problems
}

export function assertProductionBillingConfiguration(env = process.env) {
	const problems = productionBillingConfigurationProblems(env)
	if (problems.length) throw billingSetupIncomplete({
		reason: 'production-billing-policy',
		blockers: problems,
		recovery: 'The service owner must configure an explicit billing profile before resource-producing operations are enabled. For accountless billing use BETTERPPTX_BILLING_PROVIDER=crypto_credits and BETTERPPTX_BILLING_MODEL=pay_per_job. Use credit_compatibility only for an intentionally retained legacy deployment. PayRam may fund the operator wallet, but it does not replace the per-job settlement route. Discovery remains available.',
	})
}
