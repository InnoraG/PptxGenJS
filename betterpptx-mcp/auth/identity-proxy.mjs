import http from 'node:http'

const discoveryPath = '/identity/realms/betterpptx/.well-known/openid-configuration'

function setDiscoveryCors(res) {
	res.setHeader('Access-Control-Allow-Origin', '*')
	res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
	res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type')
	res.setHeader('Access-Control-Max-Age', '86400')
}

export function augmentIdentityDiscovery(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid identity discovery document.')
	// Dynamic registration and the provider's broader built-in token methods are
	// deliberately not exposed by the public identity proxy. Publish the one
	// client contract that is actually accepted: ChatGPT CIMD with a signed
	// client assertion and S256 PKCE.
	const { registration_endpoint: _privateRegistrationEndpoint, ...publicDiscovery } = value
	return {
		...publicDiscovery,
		client_id_metadata_document_supported: true,
		authorization_response_iss_parameter_supported: true,
		token_endpoint_auth_methods_supported: ['private_key_jwt'],
		token_endpoint_auth_signing_alg_values_supported: ['RS256'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		response_types_supported: ['code'],
		response_modes_supported: ['query'],
		code_challenge_methods_supported: ['S256'],
		// `openid` lets the advertised UserInfo endpoint operate as standard OIDC.
		// `betterpptx` remains the only resource-authorization permission.
		scopes_supported: ['openid', 'betterpptx'],
	}
}

// This proxy deliberately exposes only sign-in endpoints for one realm. The
// administration console, master realm, management port, and registration API
// stay private. It runs before body parsers/loggers so credentials are streamed.
export function createIdentityProxy({ publicBase, port = 8180 } = {}) {
	const origin = new URL(publicBase)
	if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/') {
		throw new Error('The identity proxy requires a fixed HTTPS product origin.')
	}
	if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid identity proxy port.')
	return (req, res) => {
		const raw = String(req.originalUrl || req.url)
		const pathname = raw.split('?')[0]
		const realm = '/identity/realms/betterpptx'
		const authorizationMetadataPath = `${realm}/.well-known/oauth-authorization-server`
		const isDiscovery = pathname === discoveryPath || pathname === authorizationMetadataPath
		const allowed = !pathname.includes('%') && !pathname.includes('..') && !pathname.includes('\\')
			&& (pathname.startsWith('/identity/resources/')
				|| pathname === `${realm}/.well-known/openid-configuration`
				|| pathname === authorizationMetadataPath
				|| pathname.startsWith(`${realm}/login-actions/`)
				|| [`${realm}/protocol/openid-connect/auth`, `${realm}/protocol/openid-connect/token`,
					`${realm}/protocol/openid-connect/certs`, `${realm}/protocol/openid-connect/logout`,
					`${realm}/protocol/openid-connect/revoke`, `${realm}/protocol/openid-connect/userinfo`,
					`${realm}/protocol/openid-connect/login-status-iframe.html`,
					`${realm}/protocol/openid-connect/login-status-iframe.html/init`,
					`${realm}/protocol/openid-connect/3p-cookies/step1.html`,
					`${realm}/protocol/openid-connect/3p-cookies/step2.html`].includes(pathname))
		if (isDiscovery && req.method === 'OPTIONS') {
			setDiscoveryCors(res)
			return res.status(204).end()
		}
		if (!allowed || !['GET', 'POST', 'HEAD'].includes(req.method)) {
			return res.status(404).json({ error: 'Not found.' })
		}
		const headers = {}
		for (const name of ['accept', 'accept-language', 'content-type', 'content-length', 'cookie', 'authorization', 'dpop', 'origin', 'user-agent']) {
			if (req.headers[name]) headers[name] = req.headers[name]
		}
		Object.assign(headers, {
			host: origin.host,
			'x-forwarded-host': origin.host,
			'x-forwarded-proto': 'https',
			'x-forwarded-port': origin.port || '443',
			'x-forwarded-for': req.socket.remoteAddress || '127.0.0.1',
		})
		const upstreamPath = pathname === authorizationMetadataPath ? discoveryPath : raw
		const upstream = http.request({ hostname: '127.0.0.1', port, method: req.method, path: upstreamPath, headers }, response => {
			res.status(response.statusCode || 502)
			for (const [name, value] of Object.entries(response.headers)) {
				if (value !== undefined && !['connection', 'transfer-encoding', 'server', 'x-powered-by', 'content-length'].includes(name)) res.setHeader(name, value)
			}
			res.setHeader('Cache-Control', 'no-store')
			if (!isDiscovery) return response.pipe(res)
			setDiscoveryCors(res)
			const chunks = []
			let size = 0
			response.on('data', chunk => {
				size += chunk.length
				if (size > 512 * 1024) return upstream.destroy(new Error('Identity discovery response too large.'))
				chunks.push(chunk)
			})
			response.on('end', () => {
				if (req.method === 'HEAD') return res.end()
				try {
					const body = JSON.stringify(augmentIdentityDiscovery(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
					res.setHeader('Content-Type', 'application/json; charset=utf-8')
					res.setHeader('Content-Length', Buffer.byteLength(body))
					res.end(body)
				} catch {
					if (!res.headersSent) res.status(502).json({ error: 'Sign-in discovery is temporarily unavailable.' })
					else res.end()
				}
			})
		})
		upstream.setTimeout(15000, () => upstream.destroy())
		upstream.on('error', () => {
			if (!res.headersSent) res.status(503).json({ error: 'Sign-in is temporarily unavailable.' })
			else res.end()
		})
		req.on('aborted', () => upstream.destroy())
		req.pipe(upstream)
	}
}
