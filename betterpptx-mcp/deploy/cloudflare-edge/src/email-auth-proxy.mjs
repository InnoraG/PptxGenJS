// Keep account-action links on the product host. The upstream is pinned by
// deployment configuration; requests cannot select another project or origin.
export async function relayEmailAuthAction(request, env) {
	const incoming = new URL(request.url)
	if (!incoming.pathname.startsWith('/__/auth/')) return null
	const fail = status => new Response('The account link is unavailable. Please request a new link from BetterPPTX.', {
		status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
	})
	if (!['GET', 'HEAD'].includes(request.method)) return fail(405)
	const project = String(env?.BETTERPPTX_SIGNIN_PROJECT || '')
	if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project)) return fail(503)
	const origin = `https://${project}.firebaseapp.com`
	const target = new URL(`${incoming.pathname}${incoming.search}`, origin)
	const headers = new Headers()
	for (const name of ['accept', 'accept-language', 'user-agent']) {
		if (request.headers.has(name)) headers.set(name, request.headers.get(name))
	}
	try {
		// Never disclose the product session cookie or bearer token to the hosted
		// action handler, and never cache one-time codes or their responses.
		const upstream = await fetch(new Request(target, { method: request.method, headers, redirect: 'manual' }), { cache: 'no-store' })
		const responseHeaders = new Headers()
		for (const name of ['content-type', 'content-language', 'content-security-policy', 'x-content-type-options']) {
			if (upstream.headers.has(name)) responseHeaders.set(name, upstream.headers.get(name))
		}
		if (upstream.headers.has('location')) {
			const location = new URL(upstream.headers.get('location'), target)
			if (location.origin === origin) location.host = incoming.host
			responseHeaders.set('Location', location.href)
		}
		responseHeaders.set('Cache-Control', 'no-store')
		responseHeaders.set('Referrer-Policy', 'no-referrer')
		responseHeaders.set('X-Content-Type-Options', 'nosniff')
		return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
	} catch { return fail(502) }
}
