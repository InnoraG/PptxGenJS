const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const SIGNED_KEYS = new Set([
	'X-Goog-Algorithm', 'X-Goog-Credential', 'X-Goog-Date', 'X-Goog-Expires',
	'X-Goog-SignedHeaders', 'X-Goog-Signature', 'generation',
	'response-content-type', 'response-content-disposition',
])
const SAFE_RESPONSE_HEADERS = [
	'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified',
]

function unavailable(status = 502) {
	return new Response('The presentation download is unavailable.', {
		status, headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'text/plain; charset=utf-8', 'Referrer-Policy': 'no-referrer' },
	})
}

function storageTarget(location, incoming, env) {
	const bucket = String(env?.BETTERPPTX_GCS_BUCKET || '')
	const prefix = String(env?.BETTERPPTX_GCS_PREFIX || 'artifacts')
	if (!/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket)
		|| prefix.split('/').some(part => !part || part === '.' || part === '..' || !/^[a-zA-Z0-9_-]+$/.test(part))) return null
	try {
		const target = new URL(String(location || ''))
		if (target.protocol !== 'https:' || target.hostname !== 'storage.googleapis.com'
			|| target.port || target.username || target.password || target.hash) return null
		const parts = decodeURIComponent(target.pathname).split('/')
		if (parts.some(part => part === '.' || part === '..' || part.includes('\\'))
			|| !target.pathname.startsWith(`/${bucket}/${prefix}/`)
			|| parts.at(-1) !== decodeURIComponent(incoming.pathname.split('/').at(-1))) return null
		const keys = [...target.searchParams.keys()]
		if (keys.length !== SIGNED_KEYS.size || new Set(keys).size !== keys.length || keys.some(key => !SIGNED_KEYS.has(key))) return null
		const get = key => target.searchParams.get(key)
		if (get('X-Goog-Algorithm') !== 'GOOG4-RSA-SHA256' || get('X-Goog-SignedHeaders') !== 'host'
			|| !/^[a-f0-9]{64,2048}$/i.test(get('X-Goog-Signature') || '')
			|| !/^[1-9][0-9]{0,24}$/.test(get('generation') || '')
			|| !/\/\d{8}\/auto\/storage\/goog4_request$/.test(get('X-Goog-Credential') || '')
			|| get('response-content-type') !== PPTX_MIME
			|| !/^attachment(?:;|$)/i.test(get('response-content-disposition') || '')) return null
		const date = get('X-Goog-Date') || ''
		if (!/^\d{8}T\d{6}Z$/.test(date) || !/^[1-9][0-9]{0,4}$/.test(get('X-Goog-Expires') || '')) return null
		const expires = Number(get('X-Goog-Expires'))
		const issuedAt = Date.parse(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(9, 11)}:${date.slice(11, 13)}:${date.slice(13, 15)}Z`)
		if (!Number.isFinite(issuedAt) || new Date(issuedAt).toISOString().replace(/[-:]/g, '').replace('.000', '') !== date
			|| expires > 43200 || issuedAt > Date.now() + 300000 || issuedAt + expires * 1000 <= Date.now()) return null
		return target
	} catch { return null }
}

// Cloud Run remains the owner/hash/generation/expiry authority. Only its
// approved artifact redirect can enter this relay; the browser never receives
// the private storage URL. No arbitrary URLs, credentials or customer body
// buffering are permitted, and no publication or expiry is renewed here.
export async function relayAuthorizedPresentationDownload(request, upstream, env) {
	const incoming = new URL(request.url)
	const parts = incoming.pathname.split('/')
	if (parts.length < 4 || parts.at(-3) !== 'files' || !/^[A-Za-z0-9_-]{43}$/.test(parts.at(-2)) || !incoming.pathname.toLowerCase().endsWith('.pptx')
		|| !['GET', 'HEAD'].includes(request.method) || upstream.status !== 302) return null
	const target = storageTarget(upstream.headers.get('location'), incoming, env)
	if (!target) { await upstream.body?.cancel(); return unavailable() }
	const headers = new Headers({ 'Accept-Encoding': 'identity' })
	const range = request.headers.get('range')
	if (range && !/^bytes=(?:[0-9]+-[0-9]*|-[0-9]+)$/.test(range)) { await upstream.body?.cancel(); return unavailable(416) }
	if (range && request.method === 'GET') headers.set('range', range)
	if (range && request.method === 'GET' && request.headers.has('if-range')) headers.set('if-range', request.headers.get('if-range'))
	await upstream.body?.cancel()
	// The retained V4 URL authorizes GET, not HEAD. For browser HEAD, request
	// GET headers then cancel the stream immediately; never buffer the file.
	const stored = await fetch(new Request(target, { method: 'GET', headers, redirect: 'manual', signal: request.signal }), { cache: 'no-store' })
	if (![200, 206].includes(stored.status)) {
		await stored.body?.cancel()
		return unavailable([401, 403, 404, 410].includes(stored.status) ? 410 : stored.status === 416 ? 416 : 502)
	}
	if (stored.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== PPTX_MIME
		|| stored.headers.get('content-disposition') !== target.searchParams.get('response-content-disposition')
		|| stored.headers.has('content-encoding')) { await stored.body?.cancel(); return unavailable() }
	const responseHeaders = new Headers({
		'Content-Type': PPTX_MIME, 'Content-Disposition': stored.headers.get('content-disposition'),
		'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
	})
	for (const name of SAFE_RESPONSE_HEADERS) if (stored.headers.has(name)) responseHeaders.set(name, stored.headers.get(name))
	if (request.method === 'HEAD') { await stored.body?.cancel(); return new Response(null, { status: stored.status, headers: responseHeaders }) }
	return new Response(stored.body, { status: stored.status, headers: responseHeaders })
}
