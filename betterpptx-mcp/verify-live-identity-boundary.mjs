// Read-only, unauthenticated public deployment checks. This is NOT a successful
// user OAuth flow, account enrollment, paid operation or publication test.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const origin = 'https://betterpptx.tail070c3a.ts.net'
const observed = []
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const meta = {
	'io.modelcontextprotocol/protocolVersion': '2026-07-28',
	'io.modelcontextprotocol/clientInfo': { name: 'identity-boundary-read-only-verifier', version: '1' },
	'io.modelcontextprotocol/clientCapabilities': {},
}
let sequence = 0
const rpc = (method, params = {}) => ({ jsonrpc: '2.0', id: ++sequence, method, params: { ...params, _meta: meta } })
async function request(path, body, headers = {}) {
	const response = await fetch(origin + path, {
		method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
		headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json', 'mcp-protocol-version': '2026-07-28' } : {}), ...headers },
		...(body ? { body: JSON.stringify(body) } : {}),
	})
	const raw = await response.text()
	let data
	try { data = JSON.parse(raw) } catch { data = null }
	return { status: response.status, challenge: response.headers.get('www-authenticate'), data }
}

const health = await request('/health')
assert.equal(health.status, 200)
assert.equal(health.data.semanticVersion, '1.10.9')
assert.equal(health.data.toolSchemaVersion, '2026-09-22.13')
assert.equal(health.data.identityPolicy?.callerIdentityHeadersTrusted, false)
observed.push({ check: 'responding-build', semanticVersion: health.data.semanticVersion, toolSchemaVersion: health.data.toolSchemaVersion, buildIdentity: health.data.buildIdentity })
const resource = await request('/.well-known/oauth-protected-resource')
assert.equal(resource.status, 200)
assert.equal(resource.data.resource, origin)
assert.deepEqual(resource.data.authorization_servers, [origin + '/identity/realms/betterpptx'])
const discovery = await request('/identity/realms/betterpptx/.well-known/openid-configuration')
assert.equal(discovery.status, 200)
assert.equal(discovery.data.issuer, origin + '/identity/realms/betterpptx')
const publicKeys = await request('/identity/realms/betterpptx/protocol/openid-connect/certs')
assert.equal(publicKeys.status, 200)
assert.ok(publicKeys.data.keys.some(key => key.use === 'sig' && key.kid))
assert.ok(publicKeys.data.keys.every(key => !key.d && !key.p && !key.q && !key.k))
observed.push({ check: 'oauth-discovery-and-public-keys', passed: true })
const tools = await request('/mcp', rpc('tools/list'))
assert.equal(tools.status, 200)
const inventory = tools.data.result.tools
for (const name of ['betterpptx.deck.generate_from_spec', 'betterpptx.billing.estimate', 'betterpptx.assets.upload', 'betterpptx.deck.save', 'betterpptx.auth.get_profile']) {
	const tool = inventory.find(item => item.name === name)
	assert.ok(tool, name)
	assert.deepEqual(tool._meta?.securitySchemes, [{ type: 'oauth2', scopes: ['betterpptx'] }], name)
	assert.deepEqual(tool.securitySchemes, tool._meta.securitySchemes, name)
}
const profileTool = inventory.find(item => item.name === 'betterpptx.auth.get_profile')
assert.equal(profileTool._meta?.['openai/profile'], true)
assert.deepEqual(profileTool.outputSchema?.required, ['id'])
observed.push({ check: 'client-advertised-authentication', count: inventory.length, inventorySha256: digest(inventory) })
const spoof = { 'x-openai-subject': 'security-test-untrusted-subject', 'x-openai-session': 'security-test-untrusted-session', 'x-betterpptx-device': 'security-test-untrusted-device' }
const status = await request('/mcp', rpc('tools/call', { name: 'betterpptx.auth.status', arguments: {} }), spoof)
assert.equal(status.status, 200)
const payload = status.data.result.structuredContent ?? JSON.parse(status.data.result.content.find(item => item.type === 'text').text)
const auth = payload.data ?? payload
assert.equal(auth.identityAssurance.authenticated, false)
assert.equal(auth.identityAssurance.secured, false)
assert.equal(auth.identityAssurance.freeValueQuotaEligible, false)
observed.push({ check: 'forged-identity-hints', authenticated: false, freeValueQuotaEligible: false })
const protectedRead = rpc('tools/call', { name: 'betterpptx.billing.estimate', arguments: {} })
const toolChallenge = await request('/mcp', protectedRead, spoof)
assert.equal(toolChallenge.status, 200)
assert.equal(toolChallenge.data.result.isError, true)
assert.deepEqual(toolChallenge.data.result._meta['mcp/www_authenticate'], [toolChallenge.challenge])
assert.match(toolChallenge.challenge, /resource_metadata=/)
assert.match(toolChallenge.challenge, /scope="betterpptx"/)
assert.match(toolChallenge.challenge, /error="insufficient_scope"/)
assert.match(toolChallenge.challenge, /error_description=/)
const mixed = await request('/mcp', [rpc('tools/list'), protectedRead], spoof)
assert.equal(mixed.status, 401)
assert.match(mixed.challenge, /oauth-protected-resource/)
const invalidToken = await request('/mcp', rpc('tools/list'), { Authorization: 'Bearer definitely-not-an-access-token' })
assert.equal(invalidToken.status, 401)
observed.push({ check: 'protected-rpc-mixed-batch-and-invalid-token', passed: true })
for (const path of ['/identity/admin/', '/identity/realms/master/protocol/openid-connect/certs', '/identity/realms/betterpptx/clients-registrations/openid-connect']) {
	assert.equal((await request(path)).status, 404)
}
observed.push({ check: 'private-administration-and-registration-not-exposed', passed: true })
console.log(JSON.stringify({ observedAt: new Date().toISOString(), scope: 'raw-public-HTTP-read-only-no-user-login', results: observed, customerFundsUsed: false, accountsCreated: false, connectorOAuthRoundtrip: 'not-performed', passkeyEnrollment: 'not-performed' }, null, 2))
