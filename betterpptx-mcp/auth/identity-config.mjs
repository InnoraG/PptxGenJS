import { lstatSync, readFileSync } from 'node:fs'

// Opt-in local deployment bootstrap. Never read credentials from the request or
// publish this configuration. Provisioner gives the parent owner-only ACLs.
export function loadSelfHostedIdentityConfiguration(env = process.env) {
	if (env.BETTERPPTX_SELF_HOSTED_IDENTITY !== '1') return false
	const base = new URL(env.BETTERPPTX_PUBLIC_BASE)
	if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password) {
		throw new Error('A fixed HTTPS product origin is required for sign-in.')
	}
	const issuer = `${base.origin}/identity/realms/betterpptx`
	const secretFile = new URL('../deploy/identity/.private/secrets/install-hmac-secret', import.meta.url)
	if (!env.BETTERPPTX_INSTALL_HMAC_SECRET) {
		const stat = lstatSync(secretFile)
		if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw new Error('Identity key storage is unavailable.')
		const value = readFileSync(secretFile, 'utf8').trim()
		if (!/^[A-Za-z0-9_-]{32,256}$/.test(value)) throw new Error('Identity key storage is invalid.')
		env.BETTERPPTX_INSTALL_HMAC_SECRET = value
	}
	Object.assign(env, {
		BETTERPPTX_AUTH: 'oauth',
		BETTERPPTX_OAUTH_ISSUER: issuer,
		BETTERPPTX_OAUTH_AUDIENCE: base.origin,
		BETTERPPTX_OAUTH_JWKS_URL: `${issuer}/protocol/openid-connect/certs`,
		BETTERPPTX_OAUTH_TOKEN_PROFILE: 'keycloak',
		BETTERPPTX_OAUTH_CLIENT_ID: 'https://chatgpt.com/oauth/client.json',
	})
	return true
}
