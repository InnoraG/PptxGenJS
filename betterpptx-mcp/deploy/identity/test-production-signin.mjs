// Maintainer-only PKCE qualification. Callback codes and tokens stay in memory.
import http from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const origin = process.env.BETTERPPTX_TEST_PUBLIC_ORIGIN
const source = process.env.BETTERPPTX_SOURCE_AUTH_PROJECT
if (!/^https:\/\/[a-z0-9.-]+$/.test(origin || '') || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(source || '')) throw Error('Explicit product origin and original account project required.')
const issuer = `${origin}/identity/realms/betterpptx`
const endpoint = `${issuer}/protocol/openid-connect`
const client = 'https://claude.ai/oauth/claude-code-client-metadata'
const verifier = randomBytes(32).toString('base64url'), state = randomBytes(32).toString('base64url')
const fingerprint = value => createHash('sha256').update(value).digest('hex')
const access = execFileSync('powershell.exe', ['-NoProfile', '-Command', 'gcloud auth print-access-token'], { encoding: 'utf8', windowsHide: true }).trim()
const accounts = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${source}/accounts:batchGet?maxResults=1000`, { headers: { Authorization: `Bearer ${access}`, 'X-Goog-User-Project': source } })
if (!accounts.ok) throw Error('Cannot read original account identities.')
const expected = new Set((await accounts.json()).users.map(u => fingerprint(u.localId)))
const jwksResponse = await fetch(`${endpoint}/certs`)
if (!jwksResponse.ok) throw Error('Public signing keys unavailable.')
const jwksFingerprint = fingerprint(JSON.stringify(await jwksResponse.json()))
const keys = createRemoteJWKSet(new URL(`${endpoint}/certs`))
let proof = { status: 'awaiting-production-sign-in', issuer, jwksFingerprint }
let callback
async function exchange(body) {
	const response = await fetch(`${endpoint}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body), redirect: 'error' })
	if (!response.ok) throw Error('Token exchange failed.')
	return response.json()
}
const listener = http.createServer(async (req, res) => {
	res.setHeader('Cache-Control', 'no-store')
	res.setHeader('Referrer-Policy', 'no-referrer')
	const url = new URL(req.url, 'http://localhost')
	if (url.pathname === '/status') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(proof)) }
	if (url.pathname !== '/callback') { res.statusCode = 404; return res.end('Unavailable') }
	try {
		if (url.searchParams.get('state') !== state || url.searchParams.get('iss') !== issuer || !url.searchParams.get('code')) throw Error('Callback validation failed.')
		const tokens = await exchange({ grant_type: 'authorization_code', client_id: client, code: url.searchParams.get('code'), redirect_uri: callback, code_verifier: verifier, resource: `${origin}/mcp` })
		const { payload } = await jwtVerify(tokens.access_token, keys, { issuer, audience: `${origin}/mcp`, algorithms: ['RS256'] })
		if (!expected.has(fingerprint(payload.sub))) throw Error('Original account identity not preserved.')
		const refreshed = await exchange({ grant_type: 'refresh_token', client_id: client, refresh_token: tokens.refresh_token, resource: `${origin}/mcp` })
		const next = await jwtVerify(refreshed.access_token, keys, { issuer, audience: `${origin}/mcp`, algorithms: ['RS256'] })
		if (next.payload.sub !== payload.sub) throw Error('Refreshed identity changed.')
		const mcp = await fetch(`${origin}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${refreshed.access_token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'BetterPPTX authentication qualification', version: '1' } } }) })
		if (!mcp.ok) throw Error('Authenticated product initialization failed.')
		await mcp.body?.cancel()
		const finalKeys = await (await fetch(`${endpoint}/certs`)).json()
		if (fingerprint(JSON.stringify(finalKeys)) !== jwksFingerprint) throw Error('Public signing keys changed during qualification.')
		proof = { status: 'verified', issuer, jwksFingerprint, originalUidPreserved: true, uidFingerprint: fingerprint(payload.sub), refreshVerified: true, authenticatedProductVerified: true, verifiedAt: new Date().toISOString() }
		console.log(JSON.stringify(proof))
		res.setHeader('Content-Type', 'text/html; charset=utf-8')
		res.end('<!doctype html><title>BetterPPTX sign-in verified</title><h1>BetterPPTX production sign-in verified</h1><p>Your existing account was preserved. Email sign-in, session refresh and authenticated product access passed.</p>')
	} catch {
		proof = { ...proof, status: 'failed' }; console.log(JSON.stringify(proof))
		res.statusCode = 400; res.end('Production sign-in qualification failed. No credentials were saved.')
	}
})
await new Promise(resolve => listener.listen(48672, '127.0.0.1', resolve))
callback = 'http://localhost:48672/callback'
const params = new URLSearchParams({ client_id: client, redirect_uri: callback, response_type: 'code', scope: 'openid betterpptx', resource: `${origin}/mcp`, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state })
console.log(JSON.stringify({ status: 'listening', authorizeUrl: `${endpoint}/auth?${params}` }))
