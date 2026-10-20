import assert from 'node:assert/strict'

const base = String(process.argv[2] || process.env.BETTERPPTX_VERIFY_CLOUD_RUN_URL || '').trim().replace(/\/+$/, '')
if (!(/^https:\/\/[a-z0-9-]+\.a\.run\.app$/i.test(base) || base === 'https://betterpptx.xmcpx.com')) {
	throw new Error('Pass the exact public Cloud Run service URL or the configured BetterPPTX custom domain.')
}

function responseJson(text) {
	const trimmed = String(text || '').trim()
	if (!trimmed) return null
	if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed)
	const dataLines = trimmed.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim())
	for (const line of dataLines) {
		if (!line || line === '[DONE]') continue
		try { return JSON.parse(line) } catch {}
	}
	return null
}

async function rpc(body, headers = {}) {
	const response = await fetch(`${base}/mcp`, {
		method: 'POST',
		headers: {
			Accept: 'application/json, text/event-stream',
			'Content-Type': 'application/json',
			'MCP-Protocol-Version': '2025-03-26',
			...headers,
		},
		body: JSON.stringify(body),
	})
	const text = await response.text()
	return { response, text, payload: responseJson(text) }
}

const health = await fetch(`${base}/health`, { headers: { Accept: 'application/json' } })
assert.equal(health.status, 200, `Cloud Run health must be 200, got ${health.status}.`)
const healthBody = await health.text()
assert(!/service.?account|secret.?manager|filesystem|process.?id|repository|stack.?trace/i.test(healthBody), 'Public health must not disclose implementation details.')
// Sign-in is served by the same release: discovery must name the canonical
// issuer and the endpoints must be reachable through this base.
const issuer = 'https://betterpptx.xmcpx.com/identity/realms/betterpptx'
const discoveryResponse = await fetch(`${base}/identity/realms/betterpptx/.well-known/oauth-authorization-server`, { headers: { Accept: 'application/json' } })
assert.equal(discoveryResponse.status, 200, `Sign-in discovery must be 200, got ${discoveryResponse.status}.`)
const discovery = await discoveryResponse.json()
assert.equal(discovery.issuer, issuer, 'Sign-in discovery must name the canonical issuer.')
assert.deepEqual(discovery.code_challenge_methods_supported, ['S256'], 'Sign-in must require S256 PKCE.')
assert.equal(discovery.registration_endpoint, undefined, 'Dynamic client registration must stay disabled.')
const jwksResponse = await fetch(`${base}/identity/realms/betterpptx/protocol/openid-connect/certs`)
assert.equal(jwksResponse.status, 200, `Sign-in keys must be published, got ${jwksResponse.status}.`)
const jwks = await jwksResponse.json()
assert(Array.isArray(jwks.keys) && jwks.keys.length > 0 && jwks.keys.every(key => !('d' in key)), 'Only public signing keys may be published.')
assert.equal((await fetch(`${base}/identity/admin/`)).status, 404, 'No identity administration surface may be public.')

const initialized = await rpc({
	jsonrpc: '2.0',
	id: 1,
	method: 'initialize',
	params: {
		protocolVersion: '2025-03-26',
		capabilities: {},
		clientInfo: { name: 'betterpptx-cloudrun-release-check', version: '1.0.0' },
	},
})
assert.equal(initialized.response.status, 200, `Anonymous MCP initialize must be available, got ${initialized.response.status}.`)
assert.equal(initialized.payload?.result?.protocolVersion, '2025-03-26', 'Server must negotiate the requested supported MCP protocol.')
const sessionId = initialized.response.headers.get('mcp-session-id')
const sessionHeader = sessionId ? { 'Mcp-Session-Id': sessionId } : {}

const listed = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, sessionHeader)
assert.equal(listed.response.status, 200, `Anonymous capability discovery must be available, got ${listed.response.status}.`)
const tools = listed.payload?.result?.tools
assert(Array.isArray(tools), 'MCP tools/list must return a structured tool inventory.')
const names = new Set(tools.map(tool => tool.name))
assert([...names].some(name => name.endsWith('deck.generate_from_spec')), 'Generation must be client-visible.')
assert([...names].some(name => name.endsWith('deck.save')), 'Save must be client-visible.')

const protectedCall = await rpc({
	jsonrpc: '2.0',
	id: 3,
	method: 'tools/call',
	params: { name: 'betterpptx.deck.recent', arguments: {} },
}, sessionHeader)
const challenge = protectedCall.response.headers.get('www-authenticate') || ''
assert(challenge, 'A protected anonymous MCP call must return an OAuth challenge.')
assert(/resource_metadata|authorization|bearer/i.test(challenge), 'OAuth challenge must identify an authorization/protected-resource route.')
assert(protectedCall.response.status === 401 || protectedCall.payload?.result?.isError === true || protectedCall.payload?.error,
	'Protected anonymous work must be denied even though public discovery is available.')

console.log(`CLOUD RUN PUBLIC FREE-BETA BOUNDARY: PASS protocol=${initialized.payload.result.protocolVersion} tools=${tools.length} generation=visible save=visible protectedCall=oauth-denied health=200`)
