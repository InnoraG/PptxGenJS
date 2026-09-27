process.env.BETTERPPTX_PAYMENT_ENVELOPE_SECRET = 'verify-payment-envelope-secret-0123456789abcdef'
process.env.BETTERPPTX_PAYMENT_ENVELOPE_TTL_SECONDS = '120'
process.env.BETTERPPTX_BILLING_PROVIDER = 'crypto_credits'
process.env.BETTERPPTX_PAYMENT_BASE_URL = 'https://pay.example.test'

const {
	mintPaymentEnvelope,
	PaymentEnvelopeError,
	verifyPaymentEnvelope,
} = await import('./billing/payment-envelope.mjs')
const { publicBillingUrls, publicPlanModel } = await import('./billing/checkout.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

function expectCode(code, fn) {
	try {
		fn()
	} catch (error) {
		if (error instanceof PaymentEnvelopeError && error.code === code) return error
		throw error
	}
	throw new Error(`Expected ${code}.`)
}

const installHash = 'install_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const nowMs = Date.now()
const token = mintPaymentEnvelope({ installHash, purpose: 'topup', packId: 'starter_500', nowMs })
expect(token.startsWith('bpte1.'), 'Payment envelope should use the opaque v1 format.', { token })
expect(!token.includes(installHash) && !token.includes('starter_500'), 'Opaque payment envelope must not expose bound identity or pack.', {})

const payload = verifyPaymentEnvelope(token, { purpose: 'topup', nowMs: nowMs + 1000 })
expect(payload.installHash === installHash && payload.packId === 'starter_500', 'Payment envelope should recover its server-side binding.', { payload })
const tamperedToken = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`
expect(tamperedToken !== token, 'Tampered payment envelope test must actually mutate the token.', {})
expectCode('PAYMENT_ENVELOPE_INVALID', () => verifyPaymentEnvelope(tamperedToken, { purpose: 'topup', nowMs: nowMs + 1000 }))
expectCode('PAYMENT_ENVELOPE_INVALID', () => verifyPaymentEnvelope(token, { purpose: 'x402', nowMs: nowMs + 1000 }))
expectCode('PAYMENT_ENVELOPE_EXPIRED', () => verifyPaymentEnvelope(token, { purpose: 'topup', nowMs: nowMs + 121000 }))

const urls = publicBillingUrls({ installHash, hasBillingCustomer: true })
expect(/^https:\/\/pay\.example\.test\/pay\/orders\/new\?token=bpte1\./.test(urls.topUpCheckoutUrl), 'Crypto top-up URL should contain only an opaque payment envelope.', { urls })
expect(!urls.topUpCheckoutUrl.includes(installHash), 'Crypto top-up URL exposed the install hash.', { urls })

const model = publicPlanModel()
expect(model.model === 'prepaid crypto credits' && model.packs.length === 3, 'Public crypto pack model is incomplete.', { model })
expect(model.pricingStatus.includes('pending'), 'Pack defaults must be labeled as unapproved pricing plumbing.', { model })

console.log(`PAYMENT ENVELOPE: PASS packs=${model.packs.length} ttl=${payload.exp - payload.iat}s opaque=1`)
