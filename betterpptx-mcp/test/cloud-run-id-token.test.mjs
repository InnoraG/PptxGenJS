import assert from 'node:assert/strict'
import test from 'node:test'
import { createMetadataIdentityTokenSource } from '../auth/cloud-run-id-token.mjs'

const jwt = exp => `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.s`

test('service identity tokens come from the metadata server and are cached until near expiry', async () => {
	let clock = 1_000_000_000_000
	const calls = []
	const source = createMetadataIdentityTokenSource('https://identity-abc-uc.a.run.app', {
		now: () => clock,
		fetchImpl: async (url, options) => {
			calls.push({ url, flavor: options.headers['Metadata-Flavor'] })
			return new Response(jwt(Math.floor(clock / 1000) + 3600))
		},
	})
	const [first, concurrent] = await Promise.all([source(), source()])
	assert.equal(first, concurrent)
	assert.equal(calls.length, 1)
	assert.equal(calls[0].flavor, 'Google')
	assert.match(calls[0].url, /audience=https%3A%2F%2Fidentity-abc-uc\.a\.run\.app/)
	clock += 50 * 60 * 1000
	assert.equal(await source(), first)
	assert.equal(calls.length, 1)
	clock += 6 * 60 * 1000
	await source()
	assert.equal(calls.length, 2)
})

test('an unavailable or expired service identity is rejected', async () => {
	const failing = createMetadataIdentityTokenSource('https://x-uc.a.run.app', { fetchImpl: async () => new Response('', { status: 404 }) })
	await assert.rejects(failing(), /unavailable/)
	const expired = createMetadataIdentityTokenSource('https://x-uc.a.run.app', { now: () => 2e12, fetchImpl: async () => new Response(jwt(1)) })
	await assert.rejects(expired(), /unavailable/)
})
