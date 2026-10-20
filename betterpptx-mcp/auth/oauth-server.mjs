import express from 'express'
import Provider, { errors } from 'oidc-provider'
import { createLocalJWKSet } from 'jose'
import { OAUTH_CLIENTS } from './oauth-clients.mjs'
import { createFirestoreOAuthAdapter } from './oauth-firestore-adapter.mjs'
import { createSignInTokenVerifier, readSignInConfiguration } from './oauth-sign-in.mjs'
import { errorPage, renderConsent, renderSignIn } from './oauth-pages.mjs'
import { augmentIdentityDiscovery } from './identity-proxy.mjs'
import { authChallengeProfile } from './client-profile.mjs'

// Built-in OAuth 2.1 authorization server for the MCP resource. It runs inside
// the gateway (scale to zero with it), stores state in Firestore and delegates
// account sign-in to Google Identity Platform. Issuer and endpoint paths keep
// the established /identity/realms/betterpptx layout, so clients, protected
// resource metadata and the access-token verifier are unchanged.
export const ISSUER_PATH = '/identity/realms/betterpptx'
const ENDPOINT = `${ISSUER_PATH}/protocol/openid-connect`
const ACCESS_TOKEN_TTL = 600
const PRIVATE_JWK_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k']

function parseSigningKeys(text) {
	let value
	try { value = JSON.parse(String(text || '')) } catch { return null }
	const keys = Array.isArray(value?.keys) ? value.keys : null
	if (!keys?.length || keys.length > 4) return null
	for (const key of keys) {
		if (key?.kty !== 'RSA' || !key.d || key.alg !== 'RS256' || key.use !== 'sig' || !/^[A-Za-z0-9_-]{8,64}$/.test(key.kid || '')) return null
	}
	return keys
}

const publicKey = key => Object.fromEntries(Object.entries(key).filter(([name]) => !PRIVATE_JWK_MEMBERS.includes(name)))

function parseCookieKeys(text) {
	const keys = String(text || '').split(/\s+/).filter(Boolean)
	return keys.length && keys.length <= 4 && keys.every(key => /^[A-Za-z0-9_-]{32,256}$/.test(key)) ? keys : null
}

export function builtInIdentityEnabled(env = process.env) {
	return env.BETTERPPTX_IDENTITY_PROVIDER === 'builtin'
}

// Public verification keys for the gateway's own access-token verifier, so
// protected requests never call back out through the public hostname.
export function builtInIdentityKeyResolver(env = process.env) {
	if (!builtInIdentityEnabled(env)) return undefined
	const keys = parseSigningKeys(env.BETTERPPTX_OAUTH_SIGNING_JWKS)
	return keys ? createLocalJWKSet({ keys: keys.map(publicKey) }) : undefined
}

function canonicalResources(origin) {
	// Protected resource identifiers: the origin (ChatGPT's PRM) and the MCP
	// endpoint (standard MCP clients). A trailing slash on the origin is the
	// same resource. Each maps to exactly one token audience.
	return new Map([[origin, origin], [`${origin}/`, origin], [`${origin}/mcp`, `${origin}/mcp`]])
}

export function createAuthorizationServer({
	publicBase, env = process.env, adapter, signInVerifier, clients = OAUTH_CLIENTS, logger = () => {},
} = {}) {
	const base = new URL(publicBase)
	if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password) {
		throw new Error('A fixed HTTPS product origin is required for sign-in.')
	}
	const origin = base.origin
	const issuer = `${origin}${ISSUER_PATH}`
	const keys = parseSigningKeys(env.BETTERPPTX_OAUTH_SIGNING_JWKS)
	const cookieKeys = parseCookieKeys(env.BETTERPPTX_OAUTH_COOKIE_KEYS)
	const signIn = readSignInConfiguration(env)
	if (!keys || !cookieKeys || !signIn) return null
	const verifySignIn = signInVerifier ?? createSignInTokenVerifier(signIn)
	const resources = canonicalResources(origin)
	const clientNames = new Map(clients.map(client => [client.client_id, client.client_name]))

	const provider = new Provider(issuer, {
		adapter: adapter ?? createFirestoreOAuthAdapter({ prefix: env.BETTERPPTX_OAUTH_FIRESTORE_PREFIX || 'betterpptx_oauth' }),
		clients: clients.map(client => ({ ...client })),
		jwks: { keys },
		cookies: {
			keys: cookieKeys,
			names: { session: 'bpptx_session', interaction: 'bpptx_interaction', resume: 'bpptx_resume' },
			long: { signed: true, httpOnly: true, secure: true, sameSite: 'lax' },
			short: { signed: true, httpOnly: true, secure: true, sameSite: 'lax' },
		},
		findAccount: async (_ctx, sub) => ({ accountId: sub, claims: async () => ({ sub }) }),
		claims: { openid: ['sub'] },
		scopes: ['openid', 'betterpptx'],
		responseTypes: ['code'],
		clientAuthMethods: ['private_key_jwt', 'none'],
		pkce: { required: () => true },
		clientBasedCORS: () => false,
		conformIdTokenClaims: true,
		expiresWithSession: async () => false,
		issueRefreshToken: async (_ctx, client) => client.grantTypeAllowed('refresh_token'),
		ttl: {
			AccessToken: ACCESS_TOKEN_TTL,
			AuthorizationCode: 60,
			IdToken: ACCESS_TOKEN_TTL,
			Interaction: 3600,
			Session: 14 * 24 * 3600,
			Grant: 90 * 24 * 3600,
			RefreshToken: 30 * 24 * 3600,
		},
		routes: {
			authorization: `${ENDPOINT.slice(ISSUER_PATH.length)}/auth`,
			token: `${ENDPOINT.slice(ISSUER_PATH.length)}/token`,
			jwks: `${ENDPOINT.slice(ISSUER_PATH.length)}/certs`,
			userinfo: `${ENDPOINT.slice(ISSUER_PATH.length)}/userinfo`,
			revocation: `${ENDPOINT.slice(ISSUER_PATH.length)}/revoke`,
		},
		features: {
			devInteractions: { enabled: false },
			pushedAuthorizationRequests: { enabled: false },
			rpInitiatedLogout: { enabled: false },
			introspection: { enabled: false },
			registration: { enabled: false },
			revocation: { enabled: true },
			userinfo: { enabled: true },
			resourceIndicators: {
				enabled: true,
				defaultResource: async () => origin,
				useGrantedResource: async () => true,
				getResourceServerInfo: async (_ctx, indicator) => {
					const audience = resources.get(indicator)
					if (!audience) throw new errors.InvalidTarget()
					return {
						scope: 'betterpptx',
						audience,
						accessTokenTTL: ACCESS_TOKEN_TTL,
						accessTokenFormat: 'jwt',
						jwt: { sign: { alg: 'RS256' } },
					}
				},
			},
		},
		interactions: { url: (_ctx, interaction) => `${ISSUER_PATH}/interaction/${interaction.uid}` },
		renderError: async (ctx) => {
			const { html, csp } = errorPage()
			ctx.type = 'html'
			ctx.set('Cache-Control', 'no-store')
			ctx.set('Content-Security-Policy', csp)
			ctx.body = html
		},
	})
	provider.proxy = true
	provider.on('server_error', (_ctx, error) => logger('oauth.server_error', { name: error?.name || 'Error' }))
	const handle = provider.callback()

	function discoveryDocument(req) {
		return augmentIdentityDiscovery({
			issuer,
			authorization_endpoint: `${origin}${ENDPOINT}/auth`,
			token_endpoint: `${origin}${ENDPOINT}/token`,
			jwks_uri: `${origin}${ENDPOINT}/certs`,
			userinfo_endpoint: `${origin}${ENDPOINT}/userinfo`,
			revocation_endpoint: `${origin}${ENDPOINT}/revoke`,
			revocation_endpoint_auth_methods_supported: ['private_key_jwt', 'none'],
			subject_types_supported: ['public'],
			id_token_signing_alg_values_supported: ['RS256'],
			claims_supported: ['sub', 'iss'],
			request_parameter_supported: false,
			request_uri_parameter_supported: false,
			claims_parameter_supported: false,
		}, { profile: authChallengeProfile(req) })
	}

	function sendDiscovery(req, res) {
		res.setHeader('Access-Control-Allow-Origin', '*')
		res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
		res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type')
		res.setHeader('Access-Control-Max-Age', '86400')
		if (req.method === 'OPTIONS') return res.status(204).end()
		res.setHeader('Cache-Control', 'no-store')
		return res.json(discoveryDocument(req))
	}

	function failPage(res, status = 400) {
		const { html, csp } = errorPage()
		res.setHeader('Cache-Control', 'no-store')
		res.setHeader('Content-Security-Policy', csp)
		return res.status(status).type('html').send(html)
	}

	const json = express.json({ limit: '16kb' })
	const router = express.Router()
	// Pin proxy hints: URLs are always computed for the canonical origin.
	router.use((req, _res, next) => {
		for (const name of ['forwarded', 'x-forwarded-host', 'x-forwarded-proto', 'x-forwarded-port']) delete req.headers[name]
		req.headers['x-forwarded-host'] = base.host
		req.headers['x-forwarded-proto'] = 'https'
		next()
	})
	for (const path of [`${ISSUER_PATH}/.well-known/openid-configuration`, `${ISSUER_PATH}/.well-known/oauth-authorization-server`]) {
		router.options(path, sendDiscovery)
		router.get(path, sendDiscovery)
	}

	router.get(`${ISSUER_PATH}/interaction/:uid`, async (req, res) => {
		try {
			const details = await provider.interactionDetails(req, res)
			if (details.uid !== req.params.uid) return failPage(res)
			const clientName = clientNames.get(details.params.client_id) || 'An app'
			const here = `${origin}${ISSUER_PATH}/interaction/${details.uid}`
			if (details.prompt.name === 'login') {
				return renderSignIn(res, { clientName, loginUrl: `${here}/login`, continueUrl: here, signIn })
			}
			if (details.prompt.name === 'consent') return renderConsent(res, { clientName, consentUrl: `${here}/consent` })
			return failPage(res)
		} catch {
			return failPage(res)
		}
	})

	router.post(`${ISSUER_PATH}/interaction/:uid/login`, json, async (req, res) => {
		res.setHeader('Cache-Control', 'no-store')
		try {
			const details = await provider.interactionDetails(req, res)
			if (details.uid !== req.params.uid || details.prompt.name !== 'login') return res.status(400).json({ error: 'invalid_request' })
			const { accountId } = await verifySignIn(req.body?.idToken)
			const location = await provider.interactionResult(req, res, { login: { accountId } }, { mergeWithLastSubmission: false })
			return res.json({ location })
		} catch {
			return res.status(400).json({ error: 'access_denied' })
		}
	})

	router.post(`${ISSUER_PATH}/interaction/:uid/consent`, json, async (req, res) => {
		res.setHeader('Cache-Control', 'no-store')
		try {
			const details = await provider.interactionDetails(req, res)
			if (details.uid !== req.params.uid || details.prompt.name !== 'consent') return res.status(400).json({ error: 'invalid_request' })
			if (req.body?.allow !== true) {
				const location = await provider.interactionResult(req, res, {
					error: 'access_denied', error_description: 'The request was not approved.',
				}, { mergeWithLastSubmission: false })
				return res.json({ location })
			}
			const { prompt: { details: missing }, params, session, grantId: existingGrantId } = details
			const grant = existingGrantId
				? await provider.Grant.find(existingGrantId)
				: new provider.Grant({ accountId: session.accountId, clientId: params.client_id })
			if (missing.missingOIDCScope) grant.addOIDCScope(missing.missingOIDCScope.join(' '))
			if (missing.missingOIDCClaims) grant.addOIDCClaims(missing.missingOIDCClaims)
			for (const [indicator, scopes] of Object.entries(missing.missingResourceScopes || {})) {
				grant.addResourceScope(indicator, scopes.join(' '))
			}
			const grantId = await grant.save()
			const location = await provider.interactionResult(req, res, { consent: { grantId } }, { mergeWithLastSubmission: true })
			return res.json({ location })
		} catch {
			return res.status(400).json({ error: 'access_denied' })
		}
	})

	// Exactly the published protocol endpoints reach the provider.
	const PROVIDER_PATHS = new Set(['auth', 'token', 'certs', 'userinfo', 'revoke'].map(name => `${ENDPOINT}/${name}`))
	const RESUME = new RegExp(`^${ENDPOINT.replace(/[/.]/g, '\\$&')}/auth/[A-Za-z0-9_-]{8,64}$`)
	router.use((req, res, next) => {
		const pathname = req.path
		if (!PROVIDER_PATHS.has(pathname) && !RESUME.test(pathname)) return next()
		// The provider is mounted at the issuer path: it derives its mount from
		// originalUrl minus url, exactly as with app.use(ISSUER_PATH, ...).
		req.url = req.url.slice(ISSUER_PATH.length)
		return handle(req, res)
	})
	router.use(ISSUER_PATH, (_req, res) => res.status(404).json({ error: 'Not found.' }))

	return Object.freeze({
		issuer,
		router,
		sendDiscovery,
		keyResolver: createLocalJWKSet({ keys: keys.map(publicKey) }),
		provider,
	})
}
