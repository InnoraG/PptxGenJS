export class BillingGateError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'BillingGateError'
		this.code = code
		this.details = details
	}
}

export function billingSetupIncomplete(details = {}) {
	return new BillingGateError(
		'BILLING_SETUP_INCOMPLETE',
		'Billing setup is not complete for this activated account. Retry activation or open billing support before running billable work.',
		{
			recoverable: true,
			retry_safe: true,
			artifactStatus: 'unchanged_or_unknown',
			...details,
		},
	)
}

export function insufficientCredits(details = {}) {
	return new BillingGateError(
		'INSUFFICIENT_CREDITS',
		'Not enough BetterPPTX credits are available for this checkpoint or heavy operation.',
		{
			recoverable: true,
			retry_safe: true,
			artifactStatus: 'unchanged_or_unknown',
			checkoutUrl: process.env.BETTERPPTX_CHECKOUT_URL || null,
			portalUrl: process.env.BETTERPPTX_PORTAL_URL || null,
			...details,
		},
	)
}

export function billingTemporarilyUnavailable(details = {}) {
	return new BillingGateError(
		'BILLING_TEMPORARILY_UNAVAILABLE',
		'Billing balance verification is temporarily unavailable. Retry shortly before running billable work.',
		{
			recoverable: true,
			retry_safe: true,
			artifactStatus: 'unchanged_or_unknown',
			...details,
		},
	)
}

export function billingConfirmationRequired(details = {}) {
	return new BillingGateError(
		'BILLING_CONFIRMATION_REQUIRED',
		'This operation needs explicit confirmation because the estimated credit cost is high.',
		{
			recoverable: true,
			retry_safe: true,
			artifactStatus: 'unchanged_or_unknown',
			...details,
		},
	)
}

