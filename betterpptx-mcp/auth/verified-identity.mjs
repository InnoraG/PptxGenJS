import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import {
	calculateJwkThumbprint,
	createRemoteJWKSet,
	decodeJwt,
	decodeProtectedHeader,
	importJWK,
	jwtVerify,
} from 'jose'

const ALGORITHMS = Object.freeze(['RS256', 'ES256', 'PS256'])
const COMMON_CLAIMS = ['exp', 'iat', 'sub', 'iss', 'aud', 'jti']
const MAX_JWT_LENGTH = 16_384
const DPOP_WINDOW_SECONDS = 300
const MAX_REPLAY_ENTRIES = 10_000
// Shared by factory instances in this module, NOT by workers, replicas or restarts.
// Never evict a live entry to admit a new proof. Store hashes, never raw JWTs/jtis.
const proofReplays = new Map()

class IdentityError extends Error {
	constructor(status, diagnostic) {
		super(({ 401: 'Authentication required.', 403: 'Access denied.', 503: 'Authentication unavailable.' })[status])
		this.name = 'VerifiedIdentityError'
		this.status = status
		this.statusCode = status
		this.code = ({ 401: 'AUTHENTICATION_REQUIRED', 403: 'ACCESS_DENIED', 503: 'AUTHENTICATION_UNAVAILABLE' })[status]
		if (diagnostic) Object.defineProperty(this, 'diagnostic', { value: Object.freeze(diagnostic), enumerable: false })
	}
}

function requireCheck(condition, status = 401) {
	if (!condition) throw new IdentityError(status)
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonemptyString(value, max = 2048) {
	return typeof value === 'string' && value.length > 0 && value.length <= max
		&& value.trim() === value && !/[\x00-\x1f\x7f]/.test(value)
}

function httpsEndpoint(value) {
	requireCheck(nonemptyString(value), 503)
	const url = new URL(value)
	requireCheck(url.protocol === 'https:' && !url.username && !url.password
		&& !value.includes('?') && !value.includes('#') && !value.includes('\\'), 503)
	return url
}

function readConfig(env) {
	const issuer = env.BETTERPPTX_OAUTH_ISSUER
	const audience = env.BETTERPPTX_OAUTH_AUDIENCE
	const jwksUrl = httpsEndpoint(env.BETTERPPTX_OAUTH_JWKS_URL)
	httpsEndpoint(issuer)
	const audienceOrigin = httpsEndpoint(audience).origin
	const secret = env.BETTERPPTX_INSTALL_HMAC_SECRET
	requireCheck(nonemptyString(secret, 4096) && secret.length >= 32, 503)
	const dpop = env.BETTERPPTX_OAUTH_REQUIRE_DPOP
	requireCheck(dpop === undefined || dpop === '0' || dpop === '1', 503)
	const profile = env.BETTERPPTX_OAUTH_TOKEN_PROFILE === undefined ? 'rfc9068' : env.BETTERPPTX_OAUTH_TOKEN_PROFILE
	requireCheck(profile === 'rfc9068' || profile === 'keycloak', 503)
	// Space-separated exact authorized parties (one pre-registered client each,
	// e.g. ChatGPT's and Claude's CIMD URLs). No prefix or pattern matching.
	const clientIdText = env.BETTERPPTX_OAUTH_CLIENT_ID
	requireCheck(profile !== 'keycloak' || (nonemptyString(clientIdText, 8192) && /^\S+(?: \S+)*$/.test(clientIdText)), 503)
	// The RFC 9068 profile applies the same exact list to client_id when set.
	const clientIds = profile === 'keycloak' || nonemptyString(clientIdText, 8192) ? clientIdText.split(' ') : []
	requireCheck(clientIds.every(value => nonemptyString(value)), 503)
	// Additional exact resource audiences on the SAME origin as the primary one,
	// e.g. the /mcp endpoint form of the resource. A token must still name
	// exactly one audience, and it must be one of these.
	const extraText = env.BETTERPPTX_OAUTH_ADDITIONAL_AUDIENCES
	requireCheck(extraText === undefined || extraText === '' || (nonemptyString(extraText, 8192) && /^\S+(?: \S+)*$/.test(extraText)), 503)
	const audiences = [audience, ...(extraText ? extraText.split(' ') : [])]
	for (const value of audiences) requireCheck(httpsEndpoint(value).origin === audienceOrigin, 503)
	const acr = env.BETTERPPTX_OAUTH_REQUIRED_ACR
	requireCheck(acr === undefined || nonemptyString(acr), 503)
	const amr = env.BETTERPPTX_OAUTH_REQUIRED_AMR
	requireCheck(amr === undefined || (nonemptyString(amr) && /^[\x21-\x7e]+(?: [\x21-\x7e]+)*$/.test(amr)), 503)
	const capacity = env.BETTERPPTX_OAUTH_DPOP_REPLAY_MAX_ENTRIES
	requireCheck(capacity === undefined || (typeof capacity === 'string' && /^[1-9][0-9]*$/.test(capacity)), 503)
	const replayCapacity = capacity === undefined ? MAX_REPLAY_ENTRIES : Number(capacity)
	requireCheck(Number.isSafeInteger(replayCapacity) && replayCapacity <= MAX_REPLAY_ENTRIES, 503)
	return { issuer, audience, audiences: [...new Set(audiences)], audienceOrigin, jwksUrl, secret, requireDpop: dpop === '1', acr, clientIds: new Set(clientIds),
		profile, tokenTyp: profile === 'keycloak' ? 'JWT' : 'at+jwt',
		requiredClaims: [...COMMON_CLAIMS, ...(profile === 'keycloak' ? ['typ', 'azp'] : ['client_id'])],
		amr: amr === undefined ? [] : amr.split(' '), replayCapacity }
}

// Node IncomingMessage (including rawHeaders) and Fetch Headers are supported.
// Reject arrays, duplicate differently-cased names, folded values and raw duplicates.
function singleHeader(req, name) {
	if (req?.rawHeaders !== undefined) {
		requireCheck(Array.isArray(req.rawHeaders) && req.rawHeaders.length % 2 === 0)
		let count = 0
		for (let i = 0; i < req.rawHeaders.length; i += 2) {
			requireCheck(typeof req.rawHeaders[i] === 'string')
			if (req.rawHeaders[i].toLowerCase() === name) count += 1
		}
		requireCheck(count <= 1)
	}
	const headers = req?.headers
	let value
	if (headers instanceof Headers) {
		value = headers.get(name) ?? undefined
	} else if (isRecord(headers)) {
		const matches = Object.keys(headers).filter(key => key.toLowerCase() === name)
		requireCheck(matches.length <= 1)
		value = matches.length ? headers[matches[0]] : undefined
	}
	if (value !== undefined) requireCheck(nonemptyString(value, MAX_JWT_LENGTH + 16))
	return value
}

function jwtHeader(token, typ, proof = false) {
	requireCheck(typeof token === 'string' && token.length <= MAX_JWT_LENGTH
		&& /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
	const header = decodeProtectedHeader(token)
	requireCheck(header.typ === typ && ALGORITHMS.includes(header.alg))
	// Never use token-controlled remote keys, certificates or access-token JWKs.
	requireCheck(!['jku', 'x5u', 'x5c', 'crit', 'b64'].some(key => Object.hasOwn(header, key)))
	if (!proof) requireCheck(!Object.hasOwn(header, 'jwk'))
	if (header.kid !== undefined) requireCheck(nonemptyString(header.kid, 256))
	return header
}

function validDate(value) {
	return Number.isSafeInteger(value) && value >= 0
}

function exactAudience(value, accepted) {
	const single = Array.isArray(value) ? (value.length === 1 ? value[0] : undefined) : value
	return typeof single === 'string' && accepted.includes(single)
}

function checkAccessClaims(payload, config, now) {
	for (const name of ['sub', 'iss', 'jti', config.profile === 'keycloak' ? 'azp' : 'client_id']) {
		requireCheck(nonemptyString(payload[name]))
	}
	// Keycloak access, ID and refresh JWTs can share an issuer, keys and JWT
	// header. The signed access-token discriminator is mandatory in this profile.
	if (config.profile === 'keycloak') {
		requireCheck(payload.typ === 'Bearer')
		requireCheck(config.clientIds.has(payload.azp))
	} else if (config.clientIds.size) {
		requireCheck(config.clientIds.has(payload.client_id))
	}
	// A single exact audience; no multi-resource or substring audience matching.
	// RFC 7519 permits aud to be either a string or an array. Keycloak may emit
	// a singleton array even when exactly one resource audience is configured.
	// Accept that standards-equivalent form while still rejecting every token
	// that names zero, multiple, or different resources.
	requireCheck(payload.iss === config.issuer && exactAudience(payload.aud, config.audiences))
	requireCheck(validDate(payload.exp) && validDate(payload.iat)
		&& payload.iat <= now && payload.exp > now && payload.exp > payload.iat
		&& payload.exp - payload.iat <= 600)
	if (payload.nbf !== undefined) requireCheck(validDate(payload.nbf) && payload.nbf <= now)
}

function safeFailureDiagnostic(req, config) {
	const result = {
		profile: config?.profile || 'unconfigured',
		configured: Boolean(config),
		claimsVerified: false,
		authorizationPresent: false,
		authorizationScheme: 'missing',
		jwtShapeValid: false,
		headerTypeMatches: false,
		headerAlgorithmAllowed: false,
		issuerMatches: false,
		audienceShape: 'missing',
		audienceCount: 0,
		audienceMatchesExactly: false,
		accessTokenTypeMatches: false,
		clientClaimPresent: false,
		clientClaimMatches: false,
		subjectPresent: false,
		tokenIdPresent: false,
		scopeIsString: false,
		betterpptxScopePresent: false,
		lifetimeWithinLimit: false,
		confirmationBound: false,
		dpopProofPresent: false,
	}
	try {
		const authorization = singleHeader(req, 'authorization')
		result.authorizationPresent = authorization !== undefined
		const match = /^(Bearer|DPoP) ([A-Za-z0-9_.-]+)$/i.exec(authorization ?? '')
		if (!match) return result
		result.authorizationScheme = match[1].toLowerCase()
		const token = match[2]
		result.jwtShapeValid = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
		if (!result.jwtShapeValid || !config) return result
		const header = decodeProtectedHeader(token)
		const payload = decodeJwt(token)
		result.headerTypeMatches = header.typ === config.tokenTyp
		result.headerAlgorithmAllowed = ALGORITHMS.includes(header.alg)
		result.issuerMatches = payload.iss === config.issuer
		result.audienceShape = typeof payload.aud === 'string' ? 'string'
			: Array.isArray(payload.aud) ? 'array' : payload.aud === undefined ? 'missing' : 'other'
		result.audienceCount = typeof payload.aud === 'string' ? 1 : Array.isArray(payload.aud) ? payload.aud.length : 0
		result.audienceMatchesExactly = exactAudience(payload.aud, config.audiences)
		result.accessTokenTypeMatches = config.profile === 'keycloak'
			? payload.typ === 'Bearer' : header.typ === 'at+jwt'
		result.clientClaimPresent = nonemptyString(payload[config.profile === 'keycloak' ? 'azp' : 'client_id'])
		result.clientClaimMatches = config.profile === 'keycloak'
			? config.clientIds.has(payload.azp)
			: result.clientClaimPresent && (!config.clientIds.size || config.clientIds.has(payload.client_id))
		result.subjectPresent = nonemptyString(payload.sub)
		result.tokenIdPresent = nonemptyString(payload.jti)
		result.scopeIsString = typeof payload.scope === 'string'
		result.betterpptxScopePresent = result.scopeIsString && payload.scope.split(' ').includes('betterpptx')
		result.lifetimeWithinLimit = validDate(payload.iat) && validDate(payload.exp)
			&& payload.exp > payload.iat && payload.exp - payload.iat <= 600
		result.confirmationBound = isRecord(payload.cnf)
		result.dpopProofPresent = singleHeader(req, 'dpop') !== undefined
	} catch {
		// Diagnostics are intentionally best-effort and must never change the
		// fail-closed authentication decision.
	}
	return result
}

function authorizedScope(payload, config) {
	// RFC 6749 scope-token grammar; permission checks apply only to verified claims.
	requireCheck(typeof payload.scope === 'string'
		&& /^[\x21\x23-\x5b\x5d-\x7e]+(?: [\x21\x23-\x5b\x5d-\x7e]+)*$/.test(payload.scope), 403)
	const scopes = [...new Set(payload.scope.split(' '))].sort()
	requireCheck(scopes.includes('betterpptx'), 403)
	if (config.acr !== undefined) requireCheck(payload.acr === config.acr, 403)
	if (config.amr.length) {
		requireCheck(Array.isArray(payload.amr) && payload.amr.every(value => nonemptyString(value, 256))
			&& config.amr.every(value => payload.amr.includes(value)), 403)
	}
	return scopes.join(' ')
}

function equalHash(actual, expected) {
	return typeof actual === 'string' && /^[A-Za-z0-9_-]{43}$/.test(actual)
		&& timingSafeEqual(Buffer.from(actual, 'ascii'), Buffer.from(expected, 'ascii'))
}

function requestHtu(req, config) {
	let target = req.originalUrl ?? req.url
	if (req instanceof Request) target = new URL(req.url).pathname
	requireCheck(nonemptyString(target, 8192) && target.startsWith('/') && !target.startsWith('//')
		&& !target.includes('\\') && !target.includes(' '))
	// Express originalUrl preserves the original path across mounted routers.
	// Only pathname contributes: no caller authority, query or fragment survives.
	const pathname = new URL(target, config.audienceOrigin).pathname
	return `${config.audienceOrigin}${pathname}`
}

async function verifyDpop(proof, token, binding, req, config) {
	const header = jwtHeader(proof, 'dpop+jwt', true)
	const jwk = header.jwk
	requireCheck(isRecord(jwk) && ['RSA', 'EC'].includes(jwk.kty))
	requireCheck(!['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k', 'jku', 'x5u', 'x5c']
		.some(name => Object.hasOwn(jwk, name)))
	requireCheck(jwk.alg === undefined || jwk.alg === header.alg)
	requireCheck(jwk.use === undefined || jwk.use === 'sig')
	requireCheck(jwk.key_ops === undefined || (Array.isArray(jwk.key_ops)
		&& jwk.key_ops.length === 1 && jwk.key_ops[0] === 'verify'))
	const thumbprint = await calculateJwkThumbprint(jwk, 'sha256')
	requireCheck(equalHash(binding, thumbprint))
	const publicKey = await importJWK(jwk, header.alg)
	requireCheck(publicKey.type === 'public')
	const { payload } = await jwtVerify(proof, publicKey, {
		algorithms: ALGORITHMS, typ: 'dpop+jwt', clockTolerance: 0,
		requiredClaims: ['iat', 'jti', 'htm', 'htu', 'ath'], maxTokenAge: DPOP_WINDOW_SECONDS,
	})
	requireCheck(nonemptyString(payload.jti, 256) && validDate(payload.iat))
	requireCheck(typeof req.method === 'string' && /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,32}$/.test(req.method)
		&& payload.htm === req.method)
	// The JWT audience remains the canonical product origin when protecting
	// /mcp, /files or /pay. The DPoP
	// target binds the actual pathname to the pinned origin, ignoring proxy hints.
	requireCheck(payload.htu === requestHtu(req, config))
	requireCheck(equalHash(payload.ath, createHash('sha256').update(token, 'ascii').digest('base64url')))
	return { replayKey: createHash('sha256').update(JSON.stringify([thumbprint, payload.jti])).digest('hex'),
		iat: payload.iat, exp: payload.exp, nbf: payload.nbf }
}

function consumeProof(proof, capacity, now) {
	requireCheck(proof.iat <= now && proof.iat + DPOP_WINDOW_SECONDS > now)
	if (proof.exp !== undefined) requireCheck(validDate(proof.exp) && proof.exp > now)
	if (proof.nbf !== undefined) requireCheck(validDate(proof.nbf) && proof.nbf <= now)
	for (const [key, expires] of proofReplays) if (expires <= now) proofReplays.delete(key)
	requireCheck(!proofReplays.has(proof.replayKey))
	requireCheck(proofReplays.size < capacity, 503)
	// No await between lookup and insertion: concurrent requests cannot both win.
	proofReplays.set(proof.replayKey, proof.iat + DPOP_WINDOW_SECONDS)
}

/**
 * Create an isolated OAuth access-token verifier. No server wiring or live writes.
 *
 * Required env: BETTERPPTX_OAUTH_ISSUER, BETTERPPTX_OAUTH_AUDIENCE (the exact
 * public resource audience, e.g. https://service.example),
 * BETTERPPTX_OAUTH_JWKS_URL: HTTPS URLs without userinfo,
 * query or fragment; BETTERPPTX_INSTALL_HMAC_SECRET: dedicated >=32-character secret.
 * Optional env: BETTERPPTX_OAUTH_REQUIRE_DPOP ('0' or '1', default '0'),
 * BETTERPPTX_OAUTH_TOKEN_PROFILE ('rfc9068' by default, or explicitly 'keycloak'),
 * and BETTERPPTX_OAUTH_CLIENT_ID for the exact authorized-party value(s)
 * required by the Keycloak profile (space-separated exact client IDs).
 * BETTERPPTX_OAUTH_ADDITIONAL_AUDIENCES: space-separated exact audiences on the
 * primary audience's origin (e.g. its /mcp endpoint form); still one per token.
 * BETTERPPTX_OAUTH_REQUIRED_ACR (exact string), BETTERPPTX_OAUTH_REQUIRED_AMR
 * (space-separated methods, ALL required), BETTERPPTX_OAUTH_DPOP_REPLAY_MAX_ENTRIES
 * (1..10000, default 10000; counts all verifier instances in this module).
 * Empty/malformed/partial config is disabled and every request fails with 503.
 * keyResolver is a TRUSTED in-process test seam, e.g. createLocalJWKSet({ keys });
 * it never comes from request data and does not waive configuration requirements.
 * Production omits it to use only the configured remote JWKS, without redirects.
 * HTTP test wiring: { env, keyResolver: options.identityKeyResolver }.
 *
 * Required signed claims in BOTH profiles: exp, iat, sub, iss, aud, jti, scope.
 * RFC 9068 additionally requires client_id and header typ exactly 'at+jwt'.
 * Keycloak instead requires azp, signed payload typ exactly 'Bearer', and header
 * typ exactly 'JWT'. No token-selected profile or fallback is permitted.
 * Both require a single string aud equal to the configured resource origin,
 * scope containing 'betterpptx', and 0 < exp - iat <= 600 seconds.
 * Keycloak setup: pinned realm issuer and /protocol/openid-connect/certs JWKS;
 * audience mapper must produce only the configured audience (no extra account
 * audience), and the betterpptx client scope must appear in the scope claim.
 * Configure access-token lifetime <=600s; retain sub/jti/azp/typ in access tokens.
 *
 * verifyRequest accepts Node/Express or Fetch requests. DPoP htu is the pinned
 * audience origin plus actual req.originalUrl pathname (req.url fallback for
 * Node; Request.url pathname for Fetch), excluding query/fragment. Host and
 * forwarded headers cannot change it. Missing/malformed paths fail closed.
 * This protects /mcp, /files and /pay with the same origin audience, while binding
 * each DPoP proof to its own path and method; this verifier is not a router.
 * Unbound tokens require Bearer; bound tokens require DPoP plus a valid proof,
 * even when REQUIRE_DPOP is off. No caller identity headers are consulted.
 * Returns a frozen SERVER-ONLY context (do not serialize it to public clients):
 * { installHash: string, authenticated: true,
 *   authenticationBasis: 'oauth-access-token', expiresAt: number, scope: string }.
 * expiresAt is Unix seconds; scope is a sorted, deduplicated space-delimited string.
 * Rejections are generic Errors with status/statusCode 401, 403 or 503 and code;
 * no token, claim, underlying error/cause, configuration or secret is exposed.
 *
 * DPoP uses a strict five-minute iat window, no future skew, and fail-closed cache
 * capacity. Replay state is process-local, lost on restart and NOT shared across
 * workers/replicas (no multiworker guarantee). Distributed deployments need an
 * atomic shared replay store before claiming cross-worker replay protection.
 * No nonce challenge protocol or token revocation/introspection is implemented.
 */
export function createVerifiedIdentityVerifier({ env = process.env, keyResolver } = {}) {
	let config
	let resolveKey
	try {
		config = readConfig(env)
		requireCheck(keyResolver === undefined || typeof keyResolver === 'function', 503)
		resolveKey = keyResolver ?? createRemoteJWKSet(config.jwksUrl, {
			timeoutDuration: 5000, cooldownDuration: 30_000, cacheMaxAge: 300_000,
		})
	} catch {
		return Object.freeze({ configured: false, async verifyRequest() { throw new IdentityError(503) } })
	}

	return Object.freeze({
		configured: true,
		async verifyRequest(req) {
			try {
				const authorization = singleHeader(req, 'authorization')
				const match = /^(Bearer|DPoP) ([A-Za-z0-9_.-]+)$/i.exec(authorization ?? '')
				requireCheck(match)
				const [, scheme, token] = match
				jwtHeader(token, config.tokenTyp)
				const proofHeader = singleHeader(req, 'dpop')
				const { payload } = await jwtVerify(token, async (header, jws) => {
					try { return await resolveKey(header, jws) } catch (error) {
						throw new IdentityError(error?.code === 'ERR_JWKS_NO_MATCHING_KEY' ? 401 : 503)
					}
				}, { algorithms: ALGORITHMS, issuer: config.issuer, audience: config.audiences,
					typ: config.tokenTyp, requiredClaims: config.requiredClaims, clockTolerance: 0, maxTokenAge: 600 })
				checkAccessClaims(payload, config, Math.floor(Date.now() / 1000))
				const scope = authorizedScope(payload, config)
				const bound = Object.hasOwn(payload, 'cnf')
				let proof
				if (bound || config.requireDpop || scheme.toLowerCase() === 'dpop' || proofHeader !== undefined) {
					requireCheck(bound && isRecord(payload.cnf) && typeof payload.cnf.jkt === 'string'
						&& scheme.toLowerCase() === 'dpop' && proofHeader !== undefined)
					proof = await verifyDpop(proofHeader, token, payload.cnf.jkt, req, config)
				}
				const now = Math.floor(Date.now() / 1000)
				// Recheck after all asynchronous key/network work, then reserve proof once.
				checkAccessClaims(payload, config, now)
				const installHash = `install_${createHmac('sha256', config.secret)
					.update(JSON.stringify(['betterpptx:oauth-identity:v1', payload.iss, payload.sub])).digest('hex')}`
				if (proof) consumeProof(proof, config.replayCapacity, now)
				return Object.freeze({ installHash, authenticated: true,
					authenticationBasis: 'oauth-access-token', expiresAt: payload.exp, scope })
			} catch (error) {
				const status = error instanceof IdentityError ? error.status : 401
				throw new IdentityError(status, safeFailureDiagnostic(req, config))
			}
		},
	})
}
