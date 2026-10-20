import { createRemoteJWKSet, jwtVerify } from 'jose'

// Account sign-in is delegated to Google Identity Platform (Firebase Auth):
// the browser signs the person in and posts the resulting ID token, which is
// verified here against Google's published keys. The Identity Platform user id
// becomes the stable OAuth subject. No password or email is stored by us.
const SECURETOKEN_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
const MAX_AUTH_AGE_SECONDS = 15 * 60

export function readSignInConfiguration(env = process.env) {
	const projectId = env.BETTERPPTX_SIGNIN_PROJECT
	const apiKey = env.BETTERPPTX_SIGNIN_API_KEY
	if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId || '') || !/^[A-Za-z0-9_-]{20,100}$/.test(apiKey || '')) return null
	const authDomain = env.BETTERPPTX_SIGNIN_AUTH_DOMAIN || `${projectId}.firebaseapp.com`
	if (!/^[a-z0-9.-]+$/.test(authDomain)) return null
	const methods = String(env.BETTERPPTX_SIGNIN_METHODS || 'email-link').split(/\s+/).filter(Boolean)
	if (!methods.length || methods.some(method => !['email-link', 'google'].includes(method))) return null
	return Object.freeze({ projectId, apiKey, authDomain, methods: Object.freeze(methods) })
}

export function createSignInTokenVerifier(config, { keyResolver, now = () => Math.floor(Date.now() / 1000) } = {}) {
	const keys = keyResolver ?? createRemoteJWKSet(new URL(SECURETOKEN_JWKS), { timeoutDuration: 5000, cooldownDuration: 30_000 })
	return async function verifySignInToken(idToken) {
		if (typeof idToken !== 'string' || idToken.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(idToken)) {
			throw new Error('Invalid sign-in token.')
		}
		const { payload } = await jwtVerify(idToken, keys, {
			algorithms: ['RS256'],
			issuer: `https://securetoken.google.com/${config.projectId}`,
			audience: config.projectId,
			requiredClaims: ['sub', 'iat', 'exp', 'auth_time'],
			currentDate: new Date(now() * 1000),
		})
		const provider = payload.firebase?.sign_in_provider
		if (typeof payload.sub !== 'string' || !/^[A-Za-z0-9]{1,128}$/.test(payload.sub)) throw new Error('Invalid sign-in token.')
		if (!Number.isSafeInteger(payload.auth_time) || now() - payload.auth_time > MAX_AUTH_AGE_SECONDS) throw new Error('Sign-in is too old.')
		if (provider === 'anonymous' || provider === 'custom') throw new Error('Unsupported sign-in method.')
		if (payload.email !== undefined && payload.email_verified !== true) throw new Error('Unverified email.')
		return Object.freeze({ accountId: payload.sub })
	}
}
