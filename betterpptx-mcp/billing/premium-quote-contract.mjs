export const PREMIUM_QUOTE_SCHEMA_VERSION = 'betterpptx.premium-quote.v1'
export const PREMIUM_QUOTE_BINDING_SCHEMA_VERSION = 'betterpptx.quote-binding.v1'

// This is the one public issuer/consumer contract for premium quote bindings.
// Keep the object closed: an estimate response must be accepted unchanged by
// generate_from_spec, and contract drift must fail in CI rather than at a
// connector boundary after a quote has been issued.
export const PREMIUM_QUOTE_BINDING_PUBLIC_SCHEMA = Object.freeze({
	type: 'object',
	description: 'Opaque binding for one exact authored specification, compiled plan, measured narration timeline, and rate card. Copy this complete object unchanged from billing.estimate to deck.generate_from_spec.',
	additionalProperties: false,
	required: [
		'schemaVersion', 'quoteSchemaVersion', 'quoteId', 'quoteBindingDigest',
		'pricingInputDigest', 'specDigest', 'estimatedPlanDigest', 'planDigest',
		'preparedTimelineDigest', 'manifestDigests', 'quoteCapCredits',
		'estimatedCredits', 'rateCardVersion', 'quoteReadiness',
	],
	properties: {
		schemaVersion: { type: 'string', const: PREMIUM_QUOTE_BINDING_SCHEMA_VERSION, description: 'Quote-binding contract version.' },
		quoteSchemaVersion: { type: 'string', const: PREMIUM_QUOTE_SCHEMA_VERSION, description: 'Premium quote contract version.' },
		quoteId: { type: 'string', pattern: '^bpptx_quote_[0-9a-f]{32}$', description: 'Opaque deterministic quote identity.' },
		quoteBindingDigest: { type: 'string', pattern: '^[0-9a-f]{64}$', description: 'Digest of the complete binding.' },
		pricingInputDigest: { type: 'string', pattern: '^[0-9a-f]{64}$', description: 'Digest of canonical priced inputs.' },
		specDigest: { type: 'string', pattern: '^[0-9a-f]{64}$', description: 'Digest of the canonical authored specification.' },
		estimatedPlanDigest: { type: 'string', minLength: 1, description: 'Identity of the estimated operation plan.' },
		planDigest: { type: 'string', minLength: 1, description: 'Identity of the resolved operation plan.' },
		preparedTimelineDigest: { type: 'string', pattern: '^[0-9a-f]{64}$', description: 'Digest of the measured narration and timing spine.' },
		manifestDigests: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 }, description: 'Content identities of prepared media manifests.' },
		quoteCapCredits: { type: 'number', minimum: 0, description: 'Maximum authorized credit amount for this binding.' },
		estimatedCredits: { type: 'number', minimum: 0, description: 'Estimated credit use before the quote cap.' },
		rateCardVersion: { type: 'string', minLength: 1, description: 'Rate-card version bound to the quote.' },
		quoteReadiness: { type: 'string', enum: ['ready-for-authorization', 'preparation-required'], description: 'Whether all pre-authorization preparation is complete.' },
	},
})

export function premiumQuoteBindingPublicSchema() {
	return JSON.parse(JSON.stringify(PREMIUM_QUOTE_BINDING_PUBLIC_SCHEMA))
}
