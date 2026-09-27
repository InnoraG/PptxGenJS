import * as fs from 'node:fs'
import * as path from 'node:path'

const outputDir = path.resolve('outputs', 'payment-intents', `run-${Date.now()}-${process.pid}`)
const intentFile = path.join(outputDir, 'payment-intents.json')
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_PAYMENT_INTENT_STORE = 'local'
process.env.BETTERPPTX_PAYMENT_INTENT_FILE = intentFile
process.env.BETTERPPTX_REQUIRE_SHARED_STORES = '0'
process.env.BETTERPPTX_BILLING_PROVIDER = 'crypto_credits'
process.env.BETTERPPTX_BILLING_HASH_SALT = 'verify-payment-intents-salt'

const {
	createPaymentIntentStore,
	hashPaymentEmail,
	PAYMENT_INTENT_PROVIDERS,
	PAYMENT_INTENT_STATES,
} = await import('./billing/payment-intents.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

async function expectError(code, fn, message) {
	let seen = null
	try {
		await fn()
	} catch (error) {
		seen = error
	}
	expect(seen?.code === code, message, { expected: code, actual: seen?.code, error: seen?.message })
}

const store = createPaymentIntentStore()
expect(store.provider === 'local' && store.shared === false, 'Payment intent verifier should use the local dev store.', {})
expect(PAYMENT_INTENT_PROVIDERS.has('payram') && !PAYMENT_INTENT_PROVIDERS.has('dodo'), 'Dodo must not be an enabled payment intent provider.', {})
expect(PAYMENT_INTENT_STATES.has('awaiting_customer_completion') && PAYMENT_INTENT_STATES.has('verification_pending'), 'Required recovery states should exist.', {})

const created = await store.createIntent({
	intentId: 'pi_verify_fixed_pack',
	installHash: 'install_hash_should_not_be_public_raw',
	customerHash: 'customer_hash_001',
	purpose: 'credit_topup',
	provider: 'payram',
	rail: 'payram_card_onramp',
	packId: 'starter_500',
	requestedCredits: 500,
	requestedAmountUsd: 5,
	requestedAmountUsdc: 5,
	minimumCreditableUsd: 5,
	providerReferenceId: 'payram_ref_001',
	customerEmail: 'Buyer@Example.com',
	metadata: {
		mode: 'fixed_credit_pack',
		customerEmail: 'Buyer@Example.com',
		apiKey: 'secret-api-key',
		nested: {
			token: 'provider-token',
			ok: true,
		},
	},
})
expect(created.idempotent === false, 'First payment intent create should not be idempotent.', { created })
expect(created.intent.intentId === 'pi_verify_fixed_pack', 'Created intent id mismatch.', { created })
expect(created.intent.emailHash === hashPaymentEmail('buyer@example.com'), 'Raw email should be converted to a hash.', { created })
expect(created.intent.requestedCredits === 500 && created.intent.requestedAmountUsd === 5, 'Fixed PayRam credit pack amount metadata should survive.', { created })
expect(created.intent.metadata.mode === 'fixed_credit_pack', 'Public metadata should keep non-sensitive fields.', { metadata: created.intent.metadata })
expect(!JSON.stringify(created.intent).includes('Buyer@Example.com'), 'Public intent leaked raw email.', { created })
expect(!JSON.stringify(created.intent).includes('secret-api-key'), 'Public intent leaked a secret.', { created })

const duplicateCreate = await store.createIntent({
	intentId: 'pi_verify_fixed_pack',
	customerHash: 'customer_hash_001',
	purpose: 'credit_topup',
	provider: 'payram',
	rail: 'payram_card_onramp',
	packId: 'starter_500',
	requestedCredits: 500,
	requestedAmountUsd: 5,
	requestedAmountUsdc: 5,
	minimumCreditableUsd: 5,
	providerReferenceId: 'payram_ref_001',
})
expect(duplicateCreate.idempotent === true, 'Duplicate create with same identity should be idempotent.', { duplicateCreate })

const byProviderRef = await store.getIntentByProviderReference('payram', 'payram_ref_001')
expect(byProviderRef?.intentId === created.intent.intentId, 'Provider reference lookup should find the original intent.', { byProviderRef })

await expectError('PAYMENT_INTENT_IDEMPOTENCY_CONFLICT', () => store.createIntent({
	intentId: 'pi_verify_fixed_pack',
	customerHash: 'customer_hash_001',
	purpose: 'credit_topup',
	provider: 'payram',
	rail: 'payram_card_onramp',
	packId: 'starter_500',
	requestedCredits: 999,
	requestedAmountUsd: 5,
	providerReferenceId: 'payram_ref_001',
}), 'Conflicting duplicate intent should fail closed.')

await expectError('PAYMENT_INTENT_PROVIDER_INVALID', () => store.createIntent({
	intentId: 'pi_verify_dodo_forbidden',
	customerHash: 'customer_hash_001',
	purpose: 'credit_topup',
	provider: 'dodo',
	rail: 'dodo',
	requestedCredits: 1,
	requestedAmountUsd: 1,
}), 'Dodo provider should be rejected by the target crypto-credit model.')

const providerEvent = await store.recordProviderEvent({
	intentId: created.intent.intentId,
	eventId: 'evt_payram_status_filled',
	provider: 'payram',
	providerReferenceId: 'payram_ref_001',
	eventType: 'status',
	providerStatus: 'FILLED',
	state: 'paid',
	payload: {
		status: 'FILLED',
		customerEmail: 'Buyer@Example.com',
		apiKey: 'provider-secret',
		token: 'webhook-token',
		amountInUSD: 5,
		filledAmountUSD: 5,
	},
})
expect(providerEvent.idempotent === false && providerEvent.intent.state === 'paid', 'Provider event should advance intent state safely.', { providerEvent })
expect(providerEvent.event.payload.amountInUSD === 5, 'Sanitized provider event should preserve non-secret accounting fields.', { providerEvent })
expect(!JSON.stringify(providerEvent).includes('Buyer@Example.com'), 'Provider event leaked raw email.', { providerEvent })
expect(!JSON.stringify(providerEvent).includes('provider-secret'), 'Provider event leaked API key.', { providerEvent })
expect(!JSON.stringify(providerEvent).includes('webhook-token'), 'Provider event leaked webhook token.', { providerEvent })

const duplicateProviderEvent = await store.recordProviderEvent({
	intentId: created.intent.intentId,
	eventId: 'evt_payram_status_filled',
	provider: 'payram',
	providerReferenceId: 'payram_ref_001',
	eventType: 'status',
	providerStatus: 'FILLED',
	state: 'paid',
	payload: {
		status: 'FILLED',
		customerEmail: 'Buyer@Example.com',
		apiKey: 'provider-secret',
		token: 'webhook-token',
		amountInUSD: 5,
		filledAmountUSD: 5,
	},
})
expect(duplicateProviderEvent.idempotent === true, 'Duplicate provider event should be idempotent.', { duplicateProviderEvent })

const firstCredit = await store.creditIntent({
	intentId: created.intent.intentId,
	creditEventId: 'credit_payram_ref_001',
	amountCredits: 500,
	proofRef: {
		provider: 'payram',
		providerReferenceId: 'payram_ref_001',
		providerEventId: 'evt_payram_status_filled',
	},
})
expect(firstCredit.idempotent === false && firstCredit.intent.creditedCredits === 500 && firstCredit.intent.state === 'credited', 'Credit application should mark the intent credited.', { firstCredit })

const duplicateCredit = await store.creditIntent({
	intentId: created.intent.intentId,
	creditEventId: 'credit_payram_ref_001',
	amountCredits: 500,
	proofRef: {
		provider: 'payram',
		providerReferenceId: 'payram_ref_001',
		providerEventId: 'evt_payram_status_filled',
	},
})
expect(duplicateCredit.idempotent === true && duplicateCredit.intent.creditedCredits === 500, 'Duplicate credit event must not duplicate credits.', { duplicateCredit })

const quoteIntent = await store.createIntent({
	intentId: 'pi_verify_exact_crypto_quote',
	customerHash: 'customer_hash_002',
	purpose: 'premium_quote',
	provider: 'x402',
	rail: 'x402_exact_eip3009',
	quoteId: 'quote_dynamic_001',
	requestedCredits: 137,
	requestedAmountUsd: 1.37,
	requestedAmountUsdc: 1.37,
	minimumCreditableUsd: 1.37,
	metadata: {
		pricingMode: 'dynamic_premium_deck_quote',
		deckComplexity: 'medium',
	},
})
expect(quoteIntent.intent.purpose === 'premium_quote' && quoteIntent.intent.quoteId === 'quote_dynamic_001', 'Exact crypto premium quote metadata should be preserved.', { quoteIntent })
expect(quoteIntent.intent.requestedAmountUsdc === 1.37, 'Exact crypto quote amount should preserve six-decimal-compatible metadata.', { quoteIntent })

const open = await store.listOpenIntents()
expect(open.some(intent => intent.intentId === 'pi_verify_exact_crypto_quote'), 'Open-intent listing should include unpaid quote intent.', { open })
expect(!open.some(intent => intent.intentId === created.intent.intentId), 'Credited intent should not be listed as open.', { open })

const storeText = fs.readFileSync(intentFile, 'utf8')
for (const forbidden of ['Buyer@Example.com', 'buyer@example.com', 'secret-api-key', 'provider-secret', 'webhook-token', 'provider-token']) {
	expect(!storeText.includes(forbidden), `Payment intent store leaked forbidden raw value: ${forbidden}`, {})
}
expect(storeText.includes('email_'), 'Payment intent store should retain only hashed email evidence.', {})
expect(storeText.includes('providerFilledAmountUsd') && storeText.includes('providerNetReceivedUsd') && storeText.includes('providerFeeUsd'), 'Intent accounting fields should exist for PayRam fee semantics.', {})

console.log('PAYMENT INTENTS: PASS local=1 idempotentCreate=1 providerEvents=1 creditIdempotency=1 dodoOff=1 sanitized=1 payramPack=1 exactQuote=1')
