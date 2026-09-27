import assert from 'node:assert/strict'

const base = String(process.argv[2] || '').trim().replace(/\/+$/, '')
const token = String(process.env.CLOUD_RUN_IAM_ID_TOKEN || '').trim()
if (!/^https:\/\/[a-z0-9-]+\.a\.run\.app$/i.test(base)) {
	throw new Error('Pass the exact private Cloud Run gateway URL returned by deployment.')
}
if (!token) throw new Error('A short-lived Cloud Run invoker identity token is required for the private preflight.')

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

async function rpc(body, sessionId = '') {
	const response = await fetchWithInvoker(`${base}/mcp`, {
		method: 'POST',
		headers: {
			Accept: 'application/json, text/event-stream',
			'Content-Type': 'application/json',
			'MCP-Protocol-Version': '2025-03-26',
			...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
		},
		body: JSON.stringify(body),
	})
	const text = await response.text()
	return { response, payload: responseJson(text) }
}

async function fetchWithInvoker(url, init = {}) {
	const headers = new Headers(init.headers || {})
	// Keep Cloud Run's IAM credential out of BetterPPTX's app-level Authorization header.
	// Cloud Run validates X-Serverless-Authorization and removes its signature before
	// forwarding the request to the container.
	headers.set('X-Serverless-Authorization', `Bearer ${token}`)
	return fetch(url, { ...init, headers })
}

let health
let healthBody = ''
for (let attempt = 1; attempt <= 12; attempt += 1) {
	health = await fetchWithInvoker(`${base}/health`, { headers: { Accept: 'application/json' } })
	if (health.status !== 403) break
	healthBody = await health.text()
	if (attempt < 12) await new Promise(resolve => setTimeout(resolve, 5000))
}
assert.equal(health.status, 200,
	`Private Cloud Run health must be reachable with the invoker token after IAM propagation retries, got ${health.status}${healthBody ? `: ${healthBody.slice(0, 240)}` : '.'}`)

const initialized = await rpc({
	jsonrpc: '2.0', id: 1, method: 'initialize',
	params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'betterpptx-private-release-check', version: '1.0.0' } },
})
assert.equal(initialized.response.status, 200, `Private MCP initialize failed: ${initialized.response.status}.`)
assert.equal(initialized.payload?.result?.protocolVersion, '2025-03-26', 'MCP protocol negotiation failed.')
const sessionId = initialized.response.headers.get('mcp-session-id') || ''

const listed = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, sessionId)
assert.equal(listed.response.status, 200, `Private MCP tools/list failed: ${listed.response.status}.`)
const tools = listed.payload?.result?.tools
assert(Array.isArray(tools), 'MCP tools/list did not return a structured tool inventory.')
const names = new Set(tools.map(tool => tool.name))
assert([...names].some(name => name.endsWith('deck.generate_from_spec')), 'Generation is not present in the deployed public inventory.')
assert([...names].some(name => name.endsWith('deck.save')), 'Save is not present in the deployed public inventory.')

// A Google Cloud Run invoker token admits this request through platform IAM,
// but is not a BetterPPTX OAuth access token. This proves the app-level guard
// before a public Cloud Run invoker binding is added.
const protectedCall = await rpc({
	jsonrpc: '2.0', id: 3, method: 'tools/call',
	params: { name: 'betterpptx.deck.recent', arguments: {} },
}, sessionId)
const challenge = protectedCall.response.headers.get('www-authenticate') || ''
assert(challenge, 'An invalid non-BetterPPTX bearer token did not receive the expected OAuth challenge.')
assert(/resource_metadata|authorization|bearer/i.test(challenge), 'OAuth challenge does not identify an authorization route.')
assert(protectedCall.response.status === 401 || protectedCall.payload?.result?.isError === true || protectedCall.payload?.error,
	'The application accepted a Cloud Run invoker identity as a BetterPPTX user.')

console.log(`CLOUD RUN PRIVATE OAUTH PREFLIGHT: PASS protocol=2025-03-26 tools=${tools.length} generation=visible save=visible appOAuth=required`)
