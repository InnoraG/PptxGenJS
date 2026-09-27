const IDENTITY_ROOT = '/identity'
const NO_STORE = 'no-store'

function isIdentityRequest(pathname) {
	return pathname === IDENTITY_ROOT || pathname.startsWith(`${IDENTITY_ROOT}/`)
}

function cloudRunOrigin(raw) {
	try {
		const url = new URL(String(raw || ''))
		if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
		if (!url.hostname.endsWith('.a.run.app')) return null
		return url
	} catch {
		return null
	}
}

function cloudRunRequest(request, origin) {
	const incoming = new URL(request.url)
	const target = new URL(`${incoming.pathname}${incoming.search}`, origin)
	const headers = new Headers(request.headers)
	// The authority must follow the pinned Cloud Run URL, not the public custom
	// domain. Let the Worker runtime derive Host (and SNI) from `target`.
	headers.delete('host')
	const init = {
		method: request.method,
		headers,
		redirect: 'manual',
	}
	if (request.method !== 'GET' && request.method !== 'HEAD' && request.body !== null) {
		init.body = request.body
		// Node's Fetch implementation requires duplex for streamed request bodies;
		// Cloudflare accepts the standard ReadableStream body used in production.
		init.duplex = 'half'
	}
	return new Request(target, init)
}

export default {
	async fetch(request, env) {
		const incoming = new URL(request.url)
		if (isIdentityRequest(incoming.pathname)) {
			// Keep the currently qualified, narrowly allowlisted identity origin
			// behind the existing proxied DNS/tunnel while the account database is
			// migrated. Route fetch(request) goes to the configured origin.
			return fetch(request)
		}

		const origin = cloudRunOrigin(env?.BETTERPPTX_CLOUD_RUN_ORIGIN)
		if (!origin) {
			return new Response('BetterPPTX is temporarily unavailable.', {
				status: 503,
				headers: { 'Cache-Control': NO_STORE, 'Content-Type': 'text/plain; charset=utf-8' },
			})
		}

		try {
			const upstream = await fetch(cloudRunRequest(request, origin), { cache: NO_STORE })
			return new Response(upstream.body, upstream)
		} catch {
			return new Response('BetterPPTX is temporarily unavailable.', {
				status: 502,
				headers: { 'Cache-Control': NO_STORE, 'Content-Type': 'text/plain; charset=utf-8' },
			})
		}
	},
}
