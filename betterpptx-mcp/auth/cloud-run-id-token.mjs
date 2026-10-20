// Service-to-service authentication for a private Cloud Run upstream. The
// token comes from the runtime's own metadata server (no key files) and is
// sent in X-Serverless-Authorization so the caller's Authorization header
// (e.g. a UserInfo bearer token) reaches the upstream unchanged.
const METADATA_IDENTITY_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity'
const REFRESH_MARGIN_MS = 5 * 60 * 1000

function tokenExpiry(token) {
	try {
		const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'))
		return Number.isSafeInteger(payload.exp) ? payload.exp * 1000 : 0
	} catch {
		return 0
	}
}

export function createMetadataIdentityTokenSource(audience, { fetchImpl = fetch, now = Date.now } = {}) {
	const url = `${METADATA_IDENTITY_URL}?audience=${encodeURIComponent(audience)}&format=full`
	let cached = null
	let pending = null
	return async function identityToken() {
		if (cached && cached.expiresAt - REFRESH_MARGIN_MS > now()) return cached.token
		pending ||= (async () => {
			try {
				const response = await fetchImpl(url, { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(5000) })
				if (!response.ok) throw new Error('Service identity is unavailable.')
				const token = (await response.text()).trim()
				const expiresAt = tokenExpiry(token)
				if (!token || expiresAt <= now()) throw new Error('Service identity is unavailable.')
				cached = { token, expiresAt }
				return token
			} finally {
				pending = null
			}
		})()
		return pending
	}
}
