import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import express from 'express'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { createAuthorizationServer, ISSUER_PATH } from '../auth/oauth-server.mjs'
import { OAUTH_CLIENTS } from '../auth/oauth-clients.mjs'
import { createVerifiedIdentityVerifier } from '../auth/verified-identity.mjs'

const PUBLIC = 'https://example.test'
const ISSUER = `${PUBLIC}${ISSUER_PATH}`
const ENDPOINT = `${ISSUER_PATH}/protocol/openid-connect`

class MemoryAdapter {
	static store = new Map()
	constructor(name) { this.name = name }
	key(id) { return `${this.name}:${id}` }
	async upsert(id, payload, expiresIn) { MemoryAdapter.store.set(this.key(id), { payload: structuredClone(payload), expiresAt: Date.now() + expiresIn * 1000 }) }
	async find(id) { const r = MemoryAdapter.store.get(this.key(id)); return r && r.expiresAt > Date.now() ? structuredClone(r.payload) : undefined }
	async findByUid(uid) { for (const [k, r] of MemoryAdapter.store) if (k.startsWith(`${this.name}:`) && r.payload.uid === uid) return structuredClone(r.payload) }
	async findByUserCode() { return undefined }
	async consume(id) { const r = MemoryAdapter.store.get(this.key(id)); if (r) r.payload.consumed = Math.floor(Date.now() / 1000) }
	async destroy(id) { MemoryAdapter.store.delete(this.key(id)) }
	async revokeByGrantId(grantId) { for (const [k, r] of MemoryAdapter.store) if (r.payload.grantId === grantId) MemoryAdapter.store.delete(k) }
}

async function fixture({ clients = OAUTH_CLIENTS } = {}) {
	const { privateKey } = await generateKeyPair('RS256', { extractable: true })
	const signingJwk = { ...(await exportJWK(privateKey)), kid: 'test-key-1', alg: 'RS256', use: 'sig' }
	const env = {
		BETTERPPTX_OAUTH_SIGNING_JWKS: JSON.stringify({ keys: [signingJwk] }),
		BETTERPPTX_OAUTH_COOKIE_KEYS: randomBytes(32).toString('base64url'),
		BETTERPPTX_SIGNIN_PROJECT: 'betterpptx-test-1',
		BETTERPPTX_SIGNIN_API_KEY: 'AIzaTestBrowserKey0000000000000000000',
		BETTERPPTX_SIGNIN_METHODS: 'email-link google',
	}
	const server = createAuthorizationServer({
		publicBase: PUBLIC, env, adapter: MemoryAdapter, clients,
		signInVerifier: async token => {
			if (token !== 'valid-firebase-token') throw new Error('bad')
			return { accountId: 'firebaseUser123' }
		},
	})
	assert.ok(server)
	const app = express()
	app.use(server.router)
	const listener = http.createServer(app)
	await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
	const local = `http://127.0.0.1:${listener.address().port}`
	const jar = new Map()
	async function request(url, init = {}) {
		const target = String(url).startsWith(PUBLIC) ? local + String(url).slice(PUBLIC.length) : (String(url).startsWith('/') ? local + url : url)
		const headers = new Headers(init.headers)
		if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '))
		const response = await fetch(target, { ...init, headers, redirect: 'manual' })
		for (const cookie of response.headers.getSetCookie()) {
			const [pair] = cookie.split(';')
			const index = pair.indexOf('=')
			const name = pair.slice(0, index)
			const value = pair.slice(index + 1)
			if (/expires=Thu, 01 Jan 1970/i.test(cookie) || value === '') jar.delete(name)
			else jar.set(name, value)
		}
		return response
	}
	return { server, env, request, close: () => new Promise(resolve => listener.close(resolve)) }
}

function pkce() {
	const verifier = randomBytes(32).toString('base64url')
	return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

async function authorize(f, { clientId, redirectUri, resource }) {
	const { verifier, challenge } = pkce()
	const params = new URLSearchParams({
		client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid betterpptx',
		code_challenge: challenge, code_challenge_method: 'S256', state: 'state-1',
		...(resource ? { resource } : {}),
	})
	let response = await f.request(`${ENDPOINT}/auth?${params}`)
	assert.equal(response.status, 303)
	let location = response.headers.get('location')
	assert.match(location, /\/identity\/realms\/betterpptx\/interaction\//)
	const page = await f.request(location)
	assert.equal(page.status, 200)
	assert.match(page.headers.get('content-security-policy'), /script-src 'nonce-/)
	const html = await page.text()
	assert.match(html, /Sign in to BetterPPTX/)
	assert.doesNotMatch(html, /oidc|koa|firestore/i)
	const interaction = new URL(location, PUBLIC).pathname
	const denied = await f.request(`${interaction}/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: 'forged' }) })
	assert.equal(denied.status, 400)
	const login = await f.request(`${interaction}/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: 'valid-firebase-token' }) })
	assert.equal(login.status, 200)
	response = await f.request((await login.json()).location)
	assert.equal(response.status, 303)
	location = response.headers.get('location')
	if (/\/interaction\//.test(location)) {
		const consentPage = await f.request(location)
		assert.match(await consentPage.text(), /Allow /)
		const consentPath = new URL(location, PUBLIC).pathname
		const consent = await f.request(`${consentPath}/consent`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ allow: true }) })
		assert.equal(consent.status, 200)
		response = await f.request((await consent.json()).location)
		assert.equal(response.status, 303)
		location = response.headers.get('location')
	}
	const callback = new URL(location)
	assert.equal(`${callback.origin}${callback.pathname}`, redirectUri.replace(/:\d+\//, callback.port ? `:${callback.port}/` : '/'))
	assert.equal(callback.searchParams.get('state'), 'state-1')
	assert.equal(callback.searchParams.get('iss'), ISSUER)
	return { code: callback.searchParams.get('code'), verifier }
}

function verifierFor(f) {
	return createVerifiedIdentityVerifier({
		env: {
			BETTERPPTX_OAUTH_ISSUER: ISSUER,
			BETTERPPTX_OAUTH_AUDIENCE: PUBLIC,
			BETTERPPTX_OAUTH_ADDITIONAL_AUDIENCES: `${PUBLIC}/mcp`,
			BETTERPPTX_OAUTH_JWKS_URL: `${PUBLIC}${ENDPOINT}/certs`,
			BETTERPPTX_OAUTH_TOKEN_PROFILE: 'rfc9068',
			BETTERPPTX_OAUTH_CLIENT_ID: OAUTH_CLIENTS.map(client => client.client_id).join(' '),
			BETTERPPTX_INSTALL_HMAC_SECRET: 'x'.repeat(40),
		},
		keyResolver: f.server.keyResolver,
	})
}

test('Claude (public PKCE client) signs in, consents and gets a verifiable /mcp access token plus rotating refresh token', async () => {
	const f = await fixture()
	try {
		const clientId = 'https://claude.ai/oauth/mcp-oauth-client-metadata'
		const redirectUri = 'https://claude.ai/api/mcp/auth_callback'
		const { code, verifier } = await authorize(f, { clientId, redirectUri, resource: `${PUBLIC}/mcp` })
		const token = await f.request(`${ENDPOINT}/token`, {
			method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: redirectUri, resource: `${PUBLIC}/mcp` }),
		})
		assert.equal(token.status, 200)
		const tokens = await token.json()
		assert.ok(tokens.refresh_token)
		const claims = JSON.parse(Buffer.from(tokens.access_token.split('.')[1], 'base64url').toString())
		assert.equal(claims.aud, `${PUBLIC}/mcp`)
		assert.equal(claims.client_id, clientId)
		assert.equal(claims.sub, 'firebaseUser123')
		assert.equal(claims.scope, 'betterpptx')
		assert.ok(claims.exp - claims.iat <= 600)
		const principal = await verifierFor(f).verifyRequest({ headers: { authorization: `Bearer ${tokens.access_token}` }, method: 'POST', url: '/mcp' })
		assert.match(principal.installHash, /^install_[0-9a-f]{64}$/)

		const refreshed = await f.request(`${ENDPOINT}/token`, {
			method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId, resource: `${PUBLIC}/mcp` }),
		})
		assert.equal(refreshed.status, 200)
		const next = await refreshed.json()
		assert.notEqual(next.refresh_token, tokens.refresh_token)
		const again = await verifierFor(f).verifyRequest({ headers: { authorization: `Bearer ${next.access_token}` }, method: 'POST', url: '/mcp' })
		assert.equal(again.installHash, principal.installHash)
		const reused = await f.request(`${ENDPOINT}/token`, {
			method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: redirectUri }),
		})
		assert.equal(reused.status, 400)

		// Replaying the authorization code revokes the whole grant (RFC 9700).
		const revoked = await f.request(`${ENDPOINT}/token`, {
			method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: next.refresh_token, client_id: clientId }),
		})
		assert.equal(revoked.status, 400)
	} finally {
		await f.close()
	}
})

test('Claude Code loopback redirects work on any port; unknown clients, redirects and resources are refused', async () => {
	const f = await fixture()
	try {
		const clientId = 'https://claude.ai/oauth/claude-code-client-metadata'
		const { code, verifier } = await authorize(f, { clientId, redirectUri: 'http://127.0.0.1:53682/callback' })
		const token = await f.request(`${ENDPOINT}/token`, {
			method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: 'http://127.0.0.1:53682/callback' }),
		})
		assert.equal(token.status, 200)
		const claims = JSON.parse(Buffer.from((await token.json()).access_token.split('.')[1], 'base64url').toString())
		assert.equal(claims.aud, PUBLIC)

		const { challenge } = pkce()
		const base = { response_type: 'code', scope: 'betterpptx', code_challenge: challenge, code_challenge_method: 'S256' }
		for (const params of [
			{ ...base, client_id: 'https://evil.example/client.json', redirect_uri: 'https://evil.example/cb' },
			{ ...base, client_id: 'https://claude.ai/oauth/mcp-oauth-client-metadata', redirect_uri: 'https://evil.example/cb' },
			{ ...base, client_id: 'https://claude.ai/oauth/mcp-oauth-client-metadata', redirect_uri: 'https://claude.ai/api/mcp/auth_callback', resource: 'https://other.example/' },
			{ ...base, client_id: 'https://claude.ai/oauth/mcp-oauth-client-metadata', redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_challenge_method: 'plain' },
		]) {
			const response = await f.request(`${ENDPOINT}/auth?${new URLSearchParams(params)}`)
			const location = response.headers.get('location') || ''
			assert.ok(response.status === 400 || /[?&]error=/.test(location), JSON.stringify(params))
			assert.doesNotMatch(location, /evil\.example/)
		}
		for (const route of ['/identity/admin/', `${ISSUER_PATH}/protocol/openid-connect/registration`, `${ISSUER_PATH}/reg`, `${ISSUER_PATH}/request`, `${ISSUER_PATH}/token/introspection`]) {
			assert.equal((await f.request(route)).status, 404, route)
		}
	} finally {
		await f.close()
	}
})

test('ChatGPT signs its token request with private_key_jwt; discovery keeps its stable contract', async () => {
	const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
	const chatgpt = OAUTH_CLIENTS[0]
	const { jwks_uri: _remote, ...pinned } = chatgpt
	const clients = [{ ...pinned, jwks: { keys: [{ ...(await exportJWK(publicKey)), kid: 'chatgpt-test', alg: 'RS256', use: 'sig' }] } }, ...OAUTH_CLIENTS.slice(1)]
	const f = await fixture({ clients })
	try {
		const openai = await (await f.request(`${ISSUER_PATH}/.well-known/oauth-authorization-server`, { headers: { 'user-agent': 'openai-mcp/1.0.0' } })).json()
		assert.equal(openai.issuer, ISSUER)
		assert.deepEqual(openai.token_endpoint_auth_methods_supported, ['private_key_jwt'])
		assert.equal(openai.client_id_metadata_document_supported, true)
		assert.equal(openai.jwks_uri, `${PUBLIC}${ENDPOINT}/certs`)
		const standard = await (await f.request(`${ISSUER_PATH}/.well-known/openid-configuration`)).json()
		assert.deepEqual(standard.token_endpoint_auth_methods_supported, ['private_key_jwt', 'none'])
		assert.deepEqual(standard.code_challenge_methods_supported, ['S256'])
		assert.equal(standard.registration_endpoint, undefined)

		const redirectUri = chatgpt.redirect_uris[0]
		const { code, verifier } = await authorize(f, { clientId: chatgpt.client_id, redirectUri })
		const assertion = await new SignJWT({})
			.setProtectedHeader({ alg: 'RS256', kid: 'chatgpt-test' })
			.setIssuer(chatgpt.client_id).setSubject(chatgpt.client_id).setAudience(ISSUER)
			.setJti(randomBytes(12).toString('hex')).setIssuedAt().setExpirationTime('2m').sign(privateKey)
		const token = await f.request(`${ENDPOINT}/token`, {
			method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri, client_id: chatgpt.client_id,
				client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: assertion,
			}),
		})
		assert.equal(token.status, 200)
		const { access_token: accessToken } = await token.json()
		const principal = await verifierFor(f).verifyRequest({ headers: { authorization: `Bearer ${accessToken}` }, method: 'POST', url: '/mcp' })
		assert.ok(principal.authenticated)
		const unsigned = await f.request(`${ENDPOINT}/token`, {
			method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: 'x', client_id: chatgpt.client_id }),
		})
		assert.equal(unsigned.status, 401)
	} finally {
		await f.close()
	}
})

test('the authorization server stays disabled without its keys or sign-in configuration', () => {
	assert.equal(createAuthorizationServer({ publicBase: PUBLIC, env: {} }), null)
	assert.throws(() => createAuthorizationServer({ publicBase: 'http://example.test', env: {} }), /HTTPS/)
})
