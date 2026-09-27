import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import express from 'express'
import { augmentIdentityDiscovery, createIdentityProxy } from '../auth/identity-proxy.mjs'
import { loadSelfHostedIdentityConfiguration } from '../auth/identity-config.mjs'

test('identity proxy exposes only realm sign-in and overwrites all proxy trust hints', async () => {
	const seen = []
	const upstream = http.createServer((req, res) => {
		seen.push({ url: req.url, headers: req.headers })
		res.setHeader('server', 'private-implementation')
		if (req.url === '/identity/realms/betterpptx/.well-known/openid-configuration') {
			res.setHeader('content-type', 'application/json')
			return res.end(JSON.stringify({ issuer: 'https://example.test/identity/realms/betterpptx', token_endpoint_auth_methods_supported: ['private_key_jwt'], code_challenge_methods_supported: ['plain'] }))
		}
		res.end('fixture')
	})
	await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
	const app = express()
	app.use('/identity', createIdentityProxy({ publicBase: 'https://example.test', port: upstream.address().port }))
	const front = http.createServer(app)
	await new Promise(resolve => front.listen(0, '127.0.0.1', resolve))
	const base = `http://127.0.0.1:${front.address().port}`
	try {
		const response = await fetch(`${base}/identity/realms/betterpptx/protocol/openid-connect/certs`, {
			headers: { 'x-forwarded-host': 'attacker.test', 'x-forwarded-proto': 'http', 'x-forwarded-for': '1.2.3.4', 'forwarded': 'host=attacker.test', 'x-openai-subject': 'forged' },
		})
		assert.equal(response.status, 200)
		assert.equal(await response.text(), 'fixture')
		assert.equal(response.headers.get('server'), null)
		assert.equal(response.headers.get('cache-control'), 'no-store')
		assert.equal(seen[0].headers['x-forwarded-host'], 'example.test')
		assert.equal(seen[0].headers.host, 'example.test')
		assert.equal(seen[0].headers['x-forwarded-proto'], 'https')
		assert.equal(seen[0].headers['x-forwarded-for'], '127.0.0.1')
		assert.equal(seen[0].headers.forwarded, undefined)
		assert.equal(seen[0].headers['x-openai-subject'], undefined)
		const discoveryResponse = await fetch(`${base}/identity/realms/betterpptx/.well-known/openid-configuration`)
		assert.equal(discoveryResponse.status, 200)
		assert.equal(discoveryResponse.headers.get('access-control-allow-origin'), '*')
		const discovery = await discoveryResponse.json()
		assert.equal(discovery.client_id_metadata_document_supported, true)
		assert.equal(discovery.token_endpoint_auth_methods_supported[0], 'private_key_jwt')
		assert.ok(discovery.code_challenge_methods_supported.includes('S256'))
		const authorizationMetadataResponse = await fetch(`${base}/identity/realms/betterpptx/.well-known/oauth-authorization-server`)
		assert.equal(authorizationMetadataResponse.status, 200)
		const authorizationMetadata = await authorizationMetadataResponse.json()
		assert.equal(authorizationMetadata.issuer, 'https://example.test/identity/realms/betterpptx')
		assert.equal(authorizationMetadata.client_id_metadata_document_supported, true)
		assert.equal(authorizationMetadata.token_endpoint_auth_methods_supported[0], 'private_key_jwt')
		const preflight = await fetch(`${base}/identity/realms/betterpptx/.well-known/openid-configuration`, { method: 'OPTIONS' })
		assert.equal(preflight.status, 204)
		assert.equal(preflight.headers.get('access-control-allow-origin'), '*')
		for (const route of ['/admin/', '/realms/master/protocol/openid-connect/token', '/realms/betterpptx/clients-registrations/openid-connect', '/realms/betterpptx/account', '/resources/%61dmin']) {
			assert.equal((await fetch(`${base}/identity${route}`)).status, 404, route)
		}
		assert.equal(seen.length, 3)
	} finally {
		await Promise.all([front, upstream].map(server => new Promise(resolve => server.close(resolve))))
	}
})

test('identity discovery exposes one coherent CIMD signed-client contract', () => {
	const original = { issuer: 'https://example.test/identity/realms/betterpptx', custom: 'retained', registration_endpoint: 'https://example.test/private-registration', token_endpoint_auth_methods_supported: ['client_secret_post'], code_challenge_methods_supported: ['plain'] }
	const result = augmentIdentityDiscovery(original)
	assert.equal(result.custom, 'retained')
	assert.equal(result.client_id_metadata_document_supported, true)
	assert.deepEqual(result.token_endpoint_auth_methods_supported, ['private_key_jwt'])
	assert.deepEqual(result.token_endpoint_auth_signing_alg_values_supported, ['RS256'])
	assert.deepEqual(result.code_challenge_methods_supported, ['S256'])
	assert.equal(result.registration_endpoint, undefined)
	assert.deepEqual(result.scopes_supported, ['openid', 'betterpptx'])
	assert.equal(original.client_id_metadata_document_supported, undefined)
})

test('local identity bootstrap is opt-in, pins resource configuration and does not generate credentials', () => {
	assert.equal(loadSelfHostedIdentityConfiguration({}), false)
	const env = { BETTERPPTX_SELF_HOSTED_IDENTITY: '1', BETTERPPTX_PUBLIC_BASE: 'https://example.test', BETTERPPTX_INSTALL_HMAC_SECRET: 'synthetic-fixture-key-not-an-active-secret' }
	assert.equal(loadSelfHostedIdentityConfiguration(env), true)
	assert.equal(env.BETTERPPTX_OAUTH_ISSUER, 'https://example.test/identity/realms/betterpptx')
	assert.equal(env.BETTERPPTX_OAUTH_AUDIENCE, 'https://example.test')
	assert.equal(env.BETTERPPTX_OAUTH_TOKEN_PROFILE, 'keycloak')
	assert.equal(env.BETTERPPTX_OAUTH_CLIENT_ID, 'https://chatgpt.com/oauth/client.json')
	assert.equal(env.BETTERPPTX_AUTH, 'oauth')
	for (const value of ['http://example.test', 'https://example.test/path', 'https://owner:password@example.test']) {
		assert.throws(() => loadSelfHostedIdentityConfiguration({ ...env, BETTERPPTX_PUBLIC_BASE: value }))
	}
})
