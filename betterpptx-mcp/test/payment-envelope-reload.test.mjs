import assert from 'node:assert/strict'
import test from 'node:test'
import { mintPaymentEnvelope, verifyPaymentEnvelope, quoteKeyForPaymentEnvelope } from '../billing/payment-envelope.mjs'

test('renewed browser tokens reuse the same logical order quote and cannot change its owner or pack', () => {
	process.env.BETTERPPTX_PAYMENT_ENVELOPE_SECRET = 'isolated-envelope-fixture-only-0123456789abcdef'
	const input = { installHash: 'fixture-owner', packId: 'starter_500', metadata: { gaslessOrderId: 'fixture-order' } }
	const first = verifyPaymentEnvelope(mintPaymentEnvelope(input))
	const reloaded = verifyPaymentEnvelope(mintPaymentEnvelope(input))
	assert.notEqual(first.jti, reloaded.jti)
	assert.equal(quoteKeyForPaymentEnvelope(first), quoteKeyForPaymentEnvelope(reloaded))
	assert.notEqual(quoteKeyForPaymentEnvelope(first), quoteKeyForPaymentEnvelope({ ...reloaded, installHash: 'other-owner' }))
	assert.notEqual(quoteKeyForPaymentEnvelope(first), quoteKeyForPaymentEnvelope({ ...reloaded, packId: 'other-pack' }))
	assert.notEqual(quoteKeyForPaymentEnvelope(first), quoteKeyForPaymentEnvelope({ ...reloaded, metadata: { gaslessOrderId: 'another-order' } }))
	assert.equal(quoteKeyForPaymentEnvelope({ jti: 'ordinary-topup' }), 'ordinary-topup')
})
