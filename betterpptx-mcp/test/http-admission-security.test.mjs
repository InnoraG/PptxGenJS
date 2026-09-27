import assert from 'node:assert/strict'
import test from 'node:test'
import { httpClientRateLimitKey, httpRateLimitConfig, developmentLogViewerAllowed } from '../auth/http-admission.mjs'

test('invalid numeric settings cannot turn rate limiting into NaN/Infinity or disable it in production', () => {
	const config = httpRateLimitConfig({ BETTERPPTX_ENV: 'production', BETTERPPTX_AUTH: 'none', BETTERPPTX_RATE_LIMIT_DISABLED: '1', BETTERPPTX_RATE_LIMIT_BURST: 'NaN', BETTERPPTX_RATE_LIMIT_REFILL_PER_MIN: 'Infinity', BETTERPPTX_RATE_LIMIT_GLOBAL_BURST: '-1' })
	assert.equal(config.enabled, true)
	assert.equal(config.capacity, 120)
	assert.equal(config.refillPerMinute, 120)
	assert.equal(config.globalCapacity, 1200)
})

test('forwarded headers do not mint new rate identities without a configured trusted peer', () => {
	const req = { socket: { remoteAddress: '203.0.113.4' }, headers: { 'x-forwarded-for': '1.2.3.4' } }
	assert.equal(httpClientRateLimitKey(req, { BETTERPPTX_TRUST_PROXY_HEADERS: '1' }), '203.0.113.4')
	assert.equal(httpClientRateLimitKey(req, { BETTERPPTX_TRUST_PROXY_HEADERS: '1', BETTERPPTX_TRUSTED_PROXY_ADDRESSES: '127.0.0.1' }), '203.0.113.4')
	const proxy = { socket: { remoteAddress: '::ffff:127.0.0.1' }, headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.4' } }
	assert.equal(httpClientRateLimitKey(proxy, { BETTERPPTX_TRUST_PROXY_HEADERS: '1', BETTERPPTX_TRUSTED_PROXY_ADDRESSES: '127.0.0.1' }), '203.0.113.4')
})

test('spoofing Host localhost cannot expose production or public logs', () => {
	const localHost = { socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost:3344' } }
	assert.equal(developmentLogViewerAllowed(localHost, { BETTERPPTX_ENV: 'production' }), false)
	assert.equal(developmentLogViewerAllowed(localHost, { BETTERPPTX_PUBLIC_BLACK_BOX: '1' }), false)
	assert.equal(developmentLogViewerAllowed({ ...localHost, socket: { remoteAddress: '203.0.113.4' } }, {}), false)
	assert.equal(developmentLogViewerAllowed(localHost, {}), true)
})
